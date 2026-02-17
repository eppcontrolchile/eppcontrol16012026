//api/admin/empresas/list

// EPP Control — API Admin: Listar empresas (solo superadmin)

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

  // Env var guards
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Missing public Supabase env vars" },
      { status: 500 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing server env var SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  // Auth client (reads session cookie)
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignore
          }
        },
      },
    }
  );

  // Admin client (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1) Validate session
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // 2) Authorize: must be superadmin
  const { data: urow, error: uerr } = await supabaseAdmin
    .from("usuarios")
    .select("id, rol, activo")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (uerr) {
    return NextResponse.json({ error: uerr.message }, { status: 500 });
  }

  if (!urow?.activo) {
    return NextResponse.json({ error: "Usuario inactivo" }, { status: 403 });
  }

  if (String(urow?.rol ?? "").toLowerCase() !== "superadmin") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  // 3) Optional pagination/search
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();

  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  const limitParsed = Number(limitRaw);
  const offsetParsed = Number(offsetRaw);

  const limit = Number.isFinite(limitParsed) ? Math.min(Math.max(limitParsed, 1), 500) : 200;
  const offset = Number.isFinite(offsetParsed) ? Math.max(offsetParsed, 0) : 0;

  let qb: any = supabaseAdmin
    .from("empresas")
    .select(
      "id, nombre, rut, plan_tipo, estado_plan, created_at",
      { count: "exact" }
    )
    .order("nombre", { ascending: true });

  if (q) {
    // búsqueda simple por nombre o rut
    const esc = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    qb = qb.or(`nombre.ilike.%${esc}%,rut.ilike.%${esc}%`);
  }

  const { data, error, count } = await qb.range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const res = NextResponse.json(
    {
      ok: true,
      rows: data ?? [],
      count: count ?? null,
      limit,
      offset,
    },
    { status: 200 }
  );

  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Page-Limit", String(limit));
  res.headers.set("X-Page-Offset", String(offset));
  if (count != null) res.headers.set("X-Total-Count", String(count));

  return res;
}
