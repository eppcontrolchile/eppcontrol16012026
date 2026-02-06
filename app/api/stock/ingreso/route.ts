// app/api/stock/ingreso/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
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

  // 2️⃣ Parse body
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const {
    categoria,
    nombre_epp,
    talla,
    cantidad,
    costo_unitario_iva,
    fecha_ingreso,
  } = body;

  const cantidadNum = Number(cantidad);
  const costoNum = Number(costo_unitario_iva);

  if (!categoria || !nombre_epp) {
    return NextResponse.json({ error: "Payload incompleto" }, { status: 400 });
  }

  if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
    return NextResponse.json({ error: "Cantidad inválida" }, { status: 400 });
  }

  if (!Number.isFinite(costoNum) || costoNum < 0) {
    return NextResponse.json({ error: "Costo inválido" }, { status: 400 });
  }

  // 3️⃣ Resolve empresa_id from usuario
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

  // 4️⃣ Insert lote (FIFO: each ingreso creates a new lote)
  const insert = {
    empresa_id: usuario.empresa_id,
    categoria: String(categoria).trim(),
    nombre_epp: String(nombre_epp).trim(),
    talla: talla ? String(talla).trim() : null,
    cantidad_inicial: cantidadNum,
    cantidad_disponible: cantidadNum,
    costo_unitario_iva: costoNum,
    fecha_ingreso: fecha_ingreso
      ? String(fecha_ingreso)
      : new Date().toISOString().slice(0, 10),
  };

  const { data, error } = await supabaseAdmin
    .from("lotes_epp")
    .insert(insert)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, lote: data }, { status: 200 });
}
