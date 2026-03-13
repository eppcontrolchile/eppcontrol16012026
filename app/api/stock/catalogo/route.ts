//app/api/stock/catalogo/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normText(input: unknown) {
  return String(input ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

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
            // no-op
          }
        },
      },
    }
  );

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
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

  const q = normText(new URL(req.url).searchParams.get("q"));

  const { data, error } = await supabaseAdmin
    .from("catalogo_epp")
    .select(`
      id,
      categoria,
      nombre_epp,
      marca,
      modelo,
      talla,
      categoria_norm,
      nombre_epp_norm,
      marca_norm,
      modelo_norm,
      talla_norm,
      created_at
    `)
    .eq("empresa_id", usuario.empresa_id)
    .order("categoria", { ascending: true })
    .order("nombre_epp", { ascending: true })
    .order("marca", { ascending: true })
    .order("modelo", { ascending: true })
    .order("talla", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = Array.isArray(data) ? data : [];

  const filtered = !q
    ? rows
    : rows.filter((r: any) => {
        const hay = normText(
          [
            r?.categoria,
            r?.nombre_epp,
            r?.marca,
            r?.modelo,
            r?.talla,
          ].join(" ")
        );
        return hay.includes(q);
      });

  return NextResponse.json(
    { rows: filtered },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store",
      },
    }
  );
}
