// app/api/admin/usuarios/set-role/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function getServerSupabase() {
  // cookies() es async en Next 16
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
            // En RSC/Edge algunos entornos no permiten setear cookies; no rompemos.
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
  const myRole = String(me.rol ?? "").toLowerCase();
  if (myRole !== "admin" && myRole !== "superadmin") {
    return { ok: false as const, status: 403, reason: "forbidden-not-admin" };
  }

  return { ok: true as const, me };
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const empresa_id = String(body?.empresa_id || "");
    const usuario_id = String(body?.usuario_id || body?.id || "");

    // Normalizar rol
    const rolNombreRaw = String(body?.rol || "").trim().toLowerCase();

    // Compatibilidad histórica / entradas humanas
    // - solo_lectura (legacy) -> gerencia
    // - supervisor (legacy) -> jefe_area
    // - Variantes de jefe de área -> jefe_area
    const rolNombre =
      rolNombreRaw === "solo_lectura" ? "gerencia" :
      rolNombreRaw === "supervisor" ? "jefe_area" :
      rolNombreRaw === "jefe de área" ? "jefe_area" :
      rolNombreRaw === "jefe de area" ? "jefe_area" :
      rolNombreRaw === "jefe_area" ? "jefe_area" :
      rolNombreRaw;

    if (!empresa_id || !usuario_id || !rolNombre) {
      return NextResponse.json(
        { ok: false, reason: "missing-empresa_id-usuario_id-rol" },
        { status: 400 }
      );
    }

    // Guardrail: solo roles soportados por producto (no incluye superadmin)
    const allowed = new Set([
      "admin",
      "jefe_area",
      "bodega",
      "solo_entrega",
      "supervisor_terreno",
      "gerencia",
    ]);
    if (!allowed.has(rolNombre)) {
      return NextResponse.json(
        { ok: false, reason: "rol-not-allowed" },
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

    // Gating plan: gestión avanzada de usuarios/roles solo en plan Advanced
    {
      const supabase = await getServerSupabase();
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
    }

    // Protecciones: NO puedes quitarte admin
    if (usuario_id === gate.me.id && rolNombre !== "admin") {
      return NextResponse.json(
        { ok: false, reason: "cannot-demote-self" },
        { status: 400 }
      );
    }

    const admin = getAdminSupabase();

    // Validar rol existe
    const { data: rolRow } = await admin
      .from("roles")
      .select("id,nombre")
      .eq("nombre", rolNombre)
      .maybeSingle();

    if (!rolRow?.id) {
      return NextResponse.json(
        { ok: false, reason: "rol-not-found" },
        { status: 400 }
      );
    }

    // Validar target pertenece a empresa
    const { data: target } = await admin
      .from("usuarios")
      .select("id, empresa_id, rol, activo")
      .eq("id", usuario_id)
      .maybeSingle();

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

    // Reglas de negocio: supervisor_terreno debe tener centro_id asignado
    if (rolNombre === "supervisor_terreno") {
      const centroIdFromBody = String(body?.centro_id ?? body?.centroId ?? "").trim();

      // Si no viene en el payload, revisa si ya tiene uno asignado
      const { data: centroCheck, error: centroCheckErr } = await admin
        .from("usuarios")
        .select("centro_id")
        .eq("id", usuario_id)
        .maybeSingle();

      if (centroCheckErr) {
        return NextResponse.json(
          { ok: false, reason: "centro-check-failed" },
          { status: 500 }
        );
      }

      const existingCentroId = (centroCheck as any)?.centro_id ? String((centroCheck as any).centro_id) : "";
      const finalCentroId = centroIdFromBody || existingCentroId;

      if (!finalCentroId) {
        return NextResponse.json(
          { ok: false, reason: "missing-centro_id-for-supervisor" },
          { status: 400 }
        );
      }

      // Si viene centro_id en el payload, persistirlo
      if (centroIdFromBody) {
        const { error: setCentroErr } = await admin
          .from("usuarios")
          .update({ centro_id: centroIdFromBody })
          .eq("id", usuario_id);

        if (setCentroErr) {
          return NextResponse.json(
            { ok: false, reason: "set-centro-failed" },
            { status: 500 }
          );
        }
      }
    }

    // Protección crítica: no permitir dejar a la empresa sin admins activos
    // (bloquea democión del último admin activo)
    if (target.rol === "admin" && target.activo && rolNombre !== "admin") {
      const { count, error: cntErr } = await admin
        .from("usuarios")
        .select("id", { count: "exact", head: true })
        .eq("empresa_id", empresa_id)
        .eq("rol", "admin")
        .eq("activo", true);

      if (cntErr) {
        return NextResponse.json(
          { ok: false, reason: "count-admins-failed" },
          { status: 500 }
        );
      }

      const adminsActivos = typeof count === "number" ? count : 0;
      if (adminsActivos <= 1) {
        return NextResponse.json(
          { ok: false, reason: "cannot-demote-last-admin" },
          { status: 400 }
        );
      }
    }

    // 1) compat: usuarios.rol
    const { error: upErr } = await admin
      .from("usuarios")
      .update({ rol: rolNombre })
      .eq("id", usuario_id);

    if (upErr) {
      return NextResponse.json(
        { ok: false, reason: "usuarios-update-failed" },
        { status: 500 }
      );
    }

    // 2) usuarios_roles: 1 rol por usuario
    await admin.from("usuarios_roles").delete().eq("usuario_id", usuario_id);

    const { error: insErr } = await admin.from("usuarios_roles").insert({
      usuario_id,
      rol_id: rolRow.id,
    });

    if (insErr) {
      return NextResponse.json(
        { ok: false, reason: "usuarios_roles-insert-failed" },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("ADMIN USUARIOS SET-ROLE ERROR:", e);
    return NextResponse.json(
      { ok: false, reason: e?.message ?? "unknown-error" },
      { status: 500 }
    );
  }
}
