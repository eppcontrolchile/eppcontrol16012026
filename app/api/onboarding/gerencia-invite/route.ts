// app/api/onboarding/gerencia-invite/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
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
    const email_gerencia = String(body?.email_gerencia || "").trim().toLowerCase();

    if (!empresa_id || !email_gerencia) {
      return NextResponse.json(
        { ok: false, reason: "missing-empresa_id-or-email_gerencia" },
        { status: 400 }
      );
    }

    // 1) Auth actual (server, cookies)
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: authData, error: authErr } = await supabase.auth.getUser();
    if (authErr || !authData?.user) {
      return NextResponse.json({ ok: false, reason: "not-authenticated" }, { status: 401 });
    }

    // 2) Validar que el caller sea ADMIN de esa empresa (por tu tabla usuarios)
    const { data: me, error: meErr } = await supabase
      .from("usuarios")
      .select("id, empresa_id, rol, activo")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (meErr || !me) {
      return NextResponse.json({ ok: false, reason: "no-usuario-interno" }, { status: 403 });
    }

    if (!me.activo) {
      return NextResponse.json({ ok: false, reason: "usuario-inactivo" }, { status: 403 });
    }

    if (me.empresa_id !== empresa_id) {
      return NextResponse.json({ ok: false, reason: "empresa-mismatch" }, { status: 403 });
    }

    if (me.rol !== "admin") {
      return NextResponse.json({ ok: false, reason: "forbidden-not-admin" }, { status: 403 });
    }

    // 3) Gating plan avanzado (solo advanced)
    const { data: emp, error: empErr } = await supabase
      .from("empresas")
      .select("id, nombre, plan_tipo, estado_plan, email_gerencia")
      .eq("id", empresa_id)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json({ ok: false, reason: "empresa-not-found" }, { status: 404 });
    }

    if (emp.plan_tipo !== "advanced") {
      // Importante: NO invitamos si no es advanced
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "plan-not-advanced",
      });
    }

    // 4) Service role client (para admin de Auth + Storage bypass)
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 5) Resolver rol gerencia
    const { data: rolRow, error: rolErr } = await admin
      .from("roles")
      .select("id,nombre")
      .eq("nombre", "gerencia")
      .maybeSingle();

    if (rolErr || !rolRow?.id) {
      return NextResponse.json({ ok: false, reason: "rol-gerencia-not-found" }, { status: 500 });
    }

    // 6) Generar link para que el usuario defina su clave en /auth/set-password
    //    Caso A: usuario NO existe en Auth -> invite
    //    Caso B: usuario YA existe en Auth -> recovery (para setear/recuperar clave)
    const redirectTo = `${getAppBaseUrl()}/auth/set-password`;

    let actionLink: string | null = null;
    let invited = false;
    let recovery = false;

    const { data: inviteData, error: inviteErr } = await admin.auth.admin.generateLink({
      type: "invite",
      email: email_gerencia,
      options: { redirectTo },
    });

    const emailExists = (inviteErr as any)?.code === "email_exists";

    if (!inviteErr && inviteData?.properties?.action_link) {
      actionLink = inviteData.properties.action_link;
      invited = true;
    } else if (emailExists) {
      // Si ya existe en Auth, generamos link de recovery para que pueda definir/actualizar contraseña.
      const { data: recData, error: recErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: email_gerencia,
        options: { redirectTo },
      });

      if (recErr || !recData?.properties?.action_link) {
        console.error("GERENCIA RECOVERY LINK ERROR:", recErr);
        return NextResponse.json({ ok: false, reason: "recovery-link-failed" }, { status: 500 });
      }

      actionLink = recData.properties.action_link;
      recovery = true;
    } else {
      console.error("GERENCIA INVITE LINK ERROR:", inviteErr);
      return NextResponse.json({ ok: false, reason: "invite-link-failed" }, { status: 500 });
    }

    if (!actionLink) {
      return NextResponse.json({ ok: false, reason: "missing-action-link" }, { status: 500 });
    }

    // 7) Upsert en tu tabla usuarios + usuarios_roles
    //    Importante: NO dependemos del nombre; usamos email como identificador lógico.
    const { data: existingUser } = await admin
      .from("usuarios")
      .select("id,email,empresa_id,rol,activo")
      .eq("empresa_id", empresa_id)
      .eq("email", email_gerencia)
      .maybeSingle();

    let usuarioId = existingUser?.id as string | undefined;

    if (!usuarioId) {
      const { data: ins, error: insErr } = await admin
        .from("usuarios")
        .insert({
          empresa_id,
          email: email_gerencia,
          nombre: "Gerencia",
          activo: true,
          rol: "gerencia", // compat
        })
        .select("id")
        .single();

      if (insErr || !ins?.id) {
        console.error("GERENCIA USUARIO INSERT ERROR:", insErr);
        return NextResponse.json({ ok: false, reason: "usuarios-insert-failed" }, { status: 500 });
      }

      usuarioId = ins.id;
    } else {
      const { error: upErr } = await admin
        .from("usuarios")
        .update({ rol: "gerencia", activo: true })
        .eq("id", usuarioId);

      if (upErr) {
        console.error("GERENCIA USUARIO UPDATE ERROR:", upErr);
        return NextResponse.json({ ok: false, reason: "usuarios-update-failed" }, { status: 500 });
      }
    }

    // Un solo rol por usuario
    await admin.from("usuarios_roles").delete().eq("usuario_id", usuarioId);

    const { error: urErr } = await admin.from("usuarios_roles").insert({
      usuario_id: usuarioId,
      rol_id: rolRow.id,
    });

    if (urErr) {
      console.error("GERENCIA USUARIOS_ROLES ERROR:", urErr);
      return NextResponse.json({ ok: false, reason: "usuarios_roles-failed" }, { status: 500 });
    }

    // 8) Enviar email (Resend) con link
    const resend = getResend();
    const empresaNombre = emp.nombre || "tu empresa";

    await resend.emails.send({
      from: "EPP Control <no-reply@eppcontrol.cl>",
      to: email_gerencia,
      subject: `Acceso de Gerencia – ${empresaNombre}`,
      text:
        `Hola,\n\n` +
        `Se te ha habilitado un acceso de Gerencia para ${empresaNombre} en EPP Control.\n\n` +
        `Crea tu clave e ingresa desde este enlace:\n${actionLink}\n\n` +
        `Este es un mensaje automático, por favor no responder.\n` +
        `Equipo de soporte de EPP Control.`,
      html:
        `<p>Hola,</p>` +
        `<p>Se te ha habilitado un acceso de <b>Gerencia</b> para <b>${empresaNombre}</b> en EPP Control.</p>` +
        `<p><a href="${actionLink}" target="_blank" rel="noreferrer">Crear clave e ingresar</a></p>` +
        `<p><em>Este es un mensaje automático, por favor no responder.</em></p>` +
        `<p>Equipo de soporte de EPP Control</p>`,
    });

    return NextResponse.json({ ok: true, invited, recovery, email: email_gerencia });
  } catch (e: any) {
    console.error("ONBOARDING GERENCIA INVITE ERROR:", e);
    return NextResponse.json(
      { ok: false, reason: e?.message ?? "unknown-error" },
      { status: 500 }
    );
  }
}
