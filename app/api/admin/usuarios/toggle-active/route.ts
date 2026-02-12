// app/api/admin/usuarios/toggle-active/route.ts
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
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // In some runtimes (e.g. during prerender) setting cookies may fail.
          }
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

async function requireAdminForEmpresa(
  supabase: ReturnType<typeof createServerClient>,
  empresa_id: string
) {
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

    const supabase = await getServerSupabase();

    // Parse boolean strictly to avoid accidental changes when activo is missing
    const rawActivo = body?.activo;
    let activo: boolean;
    if (typeof rawActivo === "boolean") {
      activo = rawActivo;
    } else if (typeof rawActivo === "string") {
      const v = rawActivo.trim().toLowerCase();
      if (v === "true") activo = true;
      else if (v === "false") activo = false;
      else {
        return NextResponse.json(
          { ok: false, reason: "invalid-activo" },
          { status: 400 }
        );
      }
    } else {
      return NextResponse.json(
        { ok: false, reason: "missing-activo" },
        { status: 400 }
      );
    }

    if (!empresa_id || !usuario_id) {
      return NextResponse.json(
        { ok: false, reason: "missing-empresa_id-or-usuario_id" },
        { status: 400 }
      );
    }

    const gate = await requireAdminForEmpresa(supabase, empresa_id);
    if (!gate.ok) {
      return NextResponse.json(
        { ok: false, reason: gate.reason },
        { status: gate.status }
      );
    }

    // Gating: solo Plan Advanced puede administrar usuarios/roles
    const { data: emp, error: empErr } = await supabase
      .from("empresas")
      .select("plan_tipo")
      .eq("id", empresa_id)
      .maybeSingle();

    if (empErr || !emp) {
      return NextResponse.json(
        { ok: false, reason: "empresa-not-found" },
        { status: 404 }
      );
    }

    if (emp.plan_tipo !== "advanced") {
      return NextResponse.json({ ok: true, skipped: true, reason: "plan-not-advanced" });
    }

    // Protecciones: jamás puedes desactivarte a ti mismo
    if (usuario_id === gate.me.id && !activo) {
      return NextResponse.json(
        { ok: false, reason: "cannot-deactivate-self" },
        { status: 400 }
      );
    }

    const admin = getAdminSupabase();

    // Validar target en empresa
    const { data: target, error: targetErr } = await admin
      .from("usuarios")
      .select("id, empresa_id, rol, activo")
      .eq("id", usuario_id)
      .maybeSingle();

    if (targetErr) {
      return NextResponse.json(
        { ok: false, reason: "usuario-fetch-failed" },
        { status: 500 }
      );
    }

    if (!target) {
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

    // Protección crítica: no permitir dejar la empresa sin admins activos
    if (target.rol === "admin" && target.activo && !activo) {
      const { count, error: cntErr } = await admin
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa_id)
        .eq("rol", "admin")
        .eq("activo", true)
        .neq("id", usuario_id);

      if (cntErr) {
        return NextResponse.json(
          { ok: false, reason: "admin-count-failed" },
          { status: 500 }
        );
      }

      if (!count || count < 1) {
        return NextResponse.json(
          { ok: false, reason: "cannot-deactivate-last-admin" },
          { status: 400 }
        );
      }
    }

    const { error: upErr } = await admin
      .from("usuarios")
      .update({ activo })
      .eq("id", usuario_id);

    if (upErr) {
      return NextResponse.json(
        { ok: false, reason: "usuarios-update-failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("ADMIN USUARIOS TOGGLE ERROR:", e);
    return NextResponse.json(
      { ok: false, reason: e?.message ?? "unknown-error" },
      { status: 500 }
    );
  }
}
