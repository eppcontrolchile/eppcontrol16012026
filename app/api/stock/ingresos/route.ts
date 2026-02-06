// app/api/stock/ingresos/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const cookieStore = await cookies();

  // Auth client (reads session cookie)
  const supabaseAuth = createServerClient(
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

  // Admin client (bypasses RLS for insert)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1️⃣ Validate session
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // 2️⃣ Resolve empresa_id from usuario
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

  // 3️⃣ List ingresos (lotes) for empresa
  const { data, error } = await supabaseAdmin
    .from("lotes_epp")
    .select(
      "id, fecha_ingreso, categoria, nombre_epp, talla, cantidad_inicial, cantidad_disponible, costo_unitario_iva, created_at"
    )
    .eq("empresa_id", usuario.empresa_id)
    .order("created_at", { ascending: false })
    .limit(200);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, rows: data || [] }, { status: 200 });
}
