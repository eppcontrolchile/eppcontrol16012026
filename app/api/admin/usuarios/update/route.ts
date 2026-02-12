// app/api/admin/usuarios/update/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
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
}

function getAdminSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

async function requireAdminForEmpresa(empresa_id: string) {
  const supabase = await getServerSupabase();

  const { data: au, error: auErr } = await supabase.auth.getUser();
  if (auErr || !au?.user) {
    return { ok: false as const, status: 401, reason: "not-authenticated" };
  }

  const { data: me, error: meErr } = await supabase
    .from("usuarios")
    .select("id, empresa_id, rol, activo")
    .eq("auth_user_id", au.user.id)
    .maybeSingle();

  if (meErr || !me) {
    return { ok: false as const, status: 403, reason: "no-usuario-interno" };
  }
  if (!me.activo) {
    return { ok: false as const, status: 403, reason: "usuario-inactivo" };
  }
  if (me.empresa_id !== empresa_id) {
    return { ok: false as const, status: 403, reason: "empresa-mismatch" };
  }
  if (me.rol !== "admin") {
    return { ok: false as const, status: 403, reason: "forbidden-not-admin" };
  }

  return { ok: true as const, me };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const empresa_id = String(body?.empresa_id || "");
    const usuario_id = String(body?.usuario_id || "");
    const nombre = String(body?.nombre ?? "").trim();
    const email = String(body?.email ?? "").trim().toLowerCase();

    if (!empresa_id || !usuario_id) {
      return NextResponse.json(
        { ok: false, reason: "missing-empresa_id-or-usuario_id" },
        { status: 400 }
      );
    }

    const gate = await requireAdminForEmpresa(empresa_id);
    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, reason: gate.reason },
        { status: gate.status }
      );
    }

    if (!nombre || !email) {
      return NextResponse.json(
        { ok: false, reason: "missing-nombre-or-email" },
        { status: 400 }
      );
    }

    // regla: admin no puede editar su email/nombre? (permitimos)
    const admin = getAdminSupabase();

    // Validar que el usuario pertenezca a la empresa
    const { data: target, error: tErr } = await admin
      .from("usuarios")
      .select("id, empresa_id, auth_user_id")
      .eq("id", usuario_id)
      .maybeSingle();

    if (tErr || !target) {
      return NextResponse.json(
        { ok: false, reason: "usuario-not-found" },
        { status: 404 }
      );
    }
    if (target.empresa_id !== empresa_id) {
      return NextResponse.json(
        { ok: false, reason: "empresa-mismatch-target" },
        { status: 403 }
      );
    }

    // Protecciones: no permitir romperse a sí mismo
    if (usuario_id === gate.me.id) {
      // ya protegemos rol/activo en endpoints dedicados, acá solo editamos nombre/email
      // OK
    }

    const { error: upErr } = await admin
      .from("usuarios")
      .update({ nombre, email })
      .eq("id", usuario_id);

    if (upErr) {
      return NextResponse.json(
        { ok: false, reason: "usuarios-update-failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("ADMIN USUARIOS UPDATE ERROR:", e);
    return NextResponse.json(
      { ok: false, reason: e?.message ?? "unknown-error" },
      { status: 500 }
    );
  }
}
