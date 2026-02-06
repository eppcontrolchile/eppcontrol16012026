// app/api/stock/ingreso-masivo/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const cookieStore = await cookies();

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

  const body = await req.json().catch(() => null);
  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items inválido" }, { status: 400 });
  }

  if (items.length > 500) {
    return NextResponse.json(
      { error: "Demasiados items (máx 500)" },
      { status: 400 }
    );
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

  const today = new Date().toISOString().slice(0, 10);

  const rows = items.map((it: any) => {
    const cantidad = Number(it.cantidad);
    const costo = Number(it.costo_unitario_iva ?? it.costoUnitarioIVA);

    return {
      empresa_id: usuario.empresa_id,
      categoria: String(it.categoria || "").trim(),
      nombre_epp: String((it.nombre_epp ?? it.nombreEpp) || "").trim(),
      talla: it.talla ? String(it.talla).trim() : null,
      cantidad_inicial: cantidad,
      cantidad_disponible: cantidad,
      costo_unitario_iva: costo,
      fecha_ingreso: it.fecha_ingreso ? String(it.fecha_ingreso) : today,
    };
  });

  // Validación mínima
  for (const r of rows) {
    const cantidadOk = Number.isFinite(r.cantidad_inicial) && r.cantidad_inicial > 0;
    const costoOk = Number.isFinite(r.costo_unitario_iva) && r.costo_unitario_iva >= 0;

    if (!r.categoria || !r.nombre_epp || !cantidadOk || !costoOk) {
      return NextResponse.json(
        { error: "Item inválido en items" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("lotes_epp")
    .insert(rows)
    .select("id, categoria, nombre_epp, talla, cantidad_inicial, costo_unitario_iva, fecha_ingreso");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(
    { ok: true, inserted: data?.length || 0, rows: data },
    { status: 200 }
  );
}
