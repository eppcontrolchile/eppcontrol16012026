// app/api/admin/usuarios/create/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("RESEND_API_KEY no configurada");
  return new Resend(apiKey);
}

function getAppBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL ||
    "https://www.eppcontrol.cl"
  ).replace(/\/$/, "");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const empresa_id = String(body?.empresa_id || "");
    const nombre = String(body?.nombre || "").trim();
    const email = String(body?.email || "").trim().toLowerCase();
    const rol = String(body?.rol || "solo_entrega").trim();

    if (!empresa_id || !nombre || !email) {
      return NextResponse.json({ ok: false, reason: "missing-fields" }, { status: 400 });
    }

    // Auth caller (cookie session) — Next 16: cookies() es async y @supabase/ssr funciona mejor con getAll/setAll
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // no-op (en algunos contexts Next bloquea set)
            }
          },
        },
      }
    );

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return NextResponse.json({ ok: false, reason: "not-auth" }, { status: 401 });

    // Validar admin interno (misma empresa)
    const { data: me } = await supabase
      .from("usuarios")
      .select("id, empresa_id, rol, activo")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (!me?.activo) return NextResponse.json({ ok: false, reason: "inactive" }, { status: 403 });
    if (me.empresa_id !== empresa_id) return NextResponse.json({ ok: false, reason: "empresa-mismatch" }, { status: 403 });
    if (me.rol !== "admin") return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });

    // Gating plan advanced (password y roles avanzados)
    const { data: emp } = await supabase
      .from("empresas")
      .select("id,nombre,plan_tipo")
      .eq("id", empresa_id)
      .maybeSingle();

    if (!emp) return NextResponse.json({ ok: false, reason: "empresa-not-found" }, { status: 404 });
    if (emp.plan_tipo !== "advanced") {
      return NextResponse.json({ ok: true, skipped: true, reason: "plan-not-advanced" });
    }

    // Defense-in-depth: roles permitidos por producto
    const allowedRoles = new Set(["admin", "supervisor", "bodega", "solo_entrega", "gerencia"]);
    if (!allowedRoles.has(rol)) {
      return NextResponse.json({ ok: false, reason: "rol-not-allowed" }, { status: 400 });
    }

    // Admin client (service role)
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Rol id (tabla roles)
    const { data: rolRow } = await admin
      .from("roles")
      .select("id,nombre")
      .eq("nombre", rol)
      .maybeSingle();

    if (!rolRow?.id) {
      return NextResponse.json({ ok: false, reason: "rol-not-found" }, { status: 400 });
    }

    // Evitar duplicado interno por email
    const { data: existing } = await admin
      .from("usuarios")
      .select("id")
      .eq("empresa_id", empresa_id)
      .eq("email", email)
      .maybeSingle();

    if (existing?.id) {
      return NextResponse.json({ ok: false, reason: "usuario-email-exists" }, { status: 409 });
    }

    // Insert usuario interno
    const { data: ins } = await admin
      .from("usuarios")
      .insert({ empresa_id, nombre, email, activo: true, rol })
      .select("id")
      .single();

    if (!ins?.id) return NextResponse.json({ ok: false, reason: "usuarios-insert-failed" }, { status: 500 });

    // usuarios_roles (1 rol)
    await admin.from("usuarios_roles").delete().eq("usuario_id", ins.id);
    const { error: urErr } = await admin.from("usuarios_roles").insert({
      usuario_id: ins.id,
      rol_id: rolRow.id,
    });
    if (urErr) return NextResponse.json({ ok: false, reason: "usuarios_roles-failed" }, { status: 500 });

    // Invite / Recovery link -> set-password (idempotente)
    // - Nuevo usuario: invite
    // - Si el email ya existe en Auth: recovery (sirve para reenviar acceso / reset)
    let actionLink: string | null = null;

    const invite = await admin.auth.admin.generateLink({
      type: "invite",
      email,
      options: { redirectTo: `${getAppBaseUrl()}/auth/set-password` },
    });

    const inviteEmailExists = (invite.error as any)?.code === "email_exists";

    if (inviteEmailExists) {
      const recovery = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo: `${getAppBaseUrl()}/auth/set-password` },
      });

      if (recovery.error || !recovery.data?.properties?.action_link) {
        return NextResponse.json({ ok: false, reason: "recovery-link-failed" }, { status: 500 });
      }

      actionLink = recovery.data.properties.action_link;
    } else {
      if (invite.error || !invite.data?.properties?.action_link) {
        return NextResponse.json({ ok: false, reason: "invite-link-failed" }, { status: 500 });
      }

      actionLink = invite.data.properties.action_link;
    }

    const resend = getResend();
    const link = actionLink!;

    await resend.emails.send({
      from: "EPP Control <no-reply@eppcontrol.cl>",
      to: email,
      subject: `Invitación a EPP Control – ${emp.nombre}`,
      text:
        `Hola ${nombre},\n\n` +
        `Te han creado un acceso en EPP Control para ${emp.nombre}.\n\n` +
        `Crea tu clave e ingresa desde este enlace:\n${link}\n\n` +
        `Este es un mensaje automático, por favor no responder.\n` +
        `Equipo de soporte de EPP Control.`,
      html:
        `<p>Hola ${nombre},</p>` +
        `<p>Te han creado un acceso en EPP Control para <b>${emp.nombre}</b>.</p>` +
        `<p><a href="${link}" target="_blank" rel="noreferrer">Crear clave e ingresar</a></p>` +
        `<p><em>Este es un mensaje automático, por favor no responder.</em></p>` +
        `<p>Equipo de soporte de EPP Control</p>`,
    });

    return NextResponse.json({ ok: true, created: true, usuario_id: ins.id });
  } catch (e: any) {
    console.error("ADMIN CREATE USER ERROR:", e);
    return NextResponse.json({ ok: false, reason: e?.message ?? "unknown" }, { status: 500 });
  }
}
