// app/api/stock/ingresos/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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

  // Pagination params
  const { searchParams } = new URL(req.url);
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  const limit = Math.min(Math.max(Number(limitRaw ?? 200), 1), 500);
  const offset = Math.max(Number(offsetRaw ?? 0), 0);

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const { data: usuario, error: usuarioError } = await supabaseAdmin
    .from("usuarios")
    .select("empresa_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (usuarioError) {
    return NextResponse.json({ error: usuarioError.message }, { status: 500 });
  }
  if (!usuario?.empresa_id) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("lotes_epp")
    .select(
      "id, fecha_ingreso, categoria, nombre_epp, talla, cantidad_inicial, cantidad_disponible, costo_unitario_iva, created_at"
    )
    .eq("empresa_id", usuario.empresa_id)
    .order("fecha_ingreso", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const res = NextResponse.json(data || [], { status: 200 });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Page-Limit", String(limit));
  res.headers.set("X-Page-Offset", String(offset));
  return res;
}
