// app/api/admin/usuarios/send-set-password/route.ts
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
    const email = String(body?.email || "").trim().toLowerCase();

    if (!empresa_id || !email) {
      return NextResponse.json({ ok: false, reason: "missing-fields" }, { status: 400 });
    }

    // caller auth
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (name: string) => cookieStore.get(name)?.value } }
    );

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) return NextResponse.json({ ok: false, reason: "not-auth" }, { status: 401 });

    const { data: me } = await supabase
      .from("usuarios")
      .select("empresa_id,rol,activo")
      .eq("auth_user_id", authData.user.id)
      .maybeSingle();

    if (!me?.activo) return NextResponse.json({ ok: false, reason: "inactive" }, { status: 403 });
    if (me.empresa_id !== empresa_id) return NextResponse.json({ ok: false, reason: "empresa-mismatch" }, { status: 403 });
    if (me.rol !== "admin") return NextResponse.json({ ok: false, reason: "forbidden" }, { status: 403 });

    const { data: emp } = await supabase
      .from("empresas")
      .select("id,nombre,plan_tipo")
      .eq("id", empresa_id)
      .maybeSingle();

    if (!emp) return NextResponse.json({ ok: false, reason: "empresa-not-found" }, { status: 404 });
    if (emp.plan_tipo !== "advanced") {
      return NextResponse.json({ ok: true, skipped: true, reason: "plan-not-advanced" });
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo: `${getAppBaseUrl()}/auth/set-password` },
    });

    // Si el email no existe en Auth, igual no “rompemos”: enviamos aviso.
    const noUser = (linkErr as any)?.code === "user_not_found";

    const actionLink = !noUser && linkData?.properties?.action_link
      ? linkData.properties.action_link
      : `${getAppBaseUrl()}/auth/login`;

    const resend = getResend();

    await resend.emails.send({
      from: "EPP Control <no-reply@eppcontrol.cl>",
      to: email,
      subject: `Crear / Cambiar contraseña – ${emp.nombre}`,
      text:
        `Hola,\n\n` +
        `Usa este enlace para crear/cambiar tu contraseña e ingresar a EPP Control:\n${actionLink}\n\n` +
        `Este es un mensaje automático, por favor no responder.\n` +
        `Equipo de soporte de EPP Control.`,
      html:
        `<p>Hola,</p>` +
        `<p>Usa este enlace para <b>crear/cambiar tu contraseña</b> e ingresar a EPP Control:</p>` +
        `<p><a href="${actionLink}" target="_blank" rel="noreferrer">Definir contraseña</a></p>` +
        `<p><em>Este es un mensaje automático, por favor no responder.</em></p>` +
        `<p>Equipo de soporte de EPP Control</p>`,
    });

    return NextResponse.json({ ok: true, sent: true, noUser });
  } catch (e: any) {
    console.error("ADMIN SEND SET PASSWORD ERROR:", e);
    return NextResponse.json({ ok: false, reason: e?.message ?? "unknown" }, { status: 500 });
  }
}
