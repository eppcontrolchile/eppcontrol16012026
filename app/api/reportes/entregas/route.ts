// app/api/reportes/entregas/route.ts
// Exportación de entregas desde v_reporte_entregas (CSV)

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  // Auth client (reads session cookie)
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll() {
          // read-only route; ignore writes
        },
      },
    }
  );

  // Admin client (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  try {
    // 1) Validate session
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    // 2) Resolve empresa_id from usuario
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

    const empresa_id = String(usuario.empresa_id);

    // 1️⃣ Leer desde la vista
    const { data, error } = await supabaseAdmin
      .from("v_reporte_entregas")
      .select(`
        entrega_id,
        empresa_id,
        fecha_entrega,
        costo_total_iva,
        total_unidades,
        empresa_nombre,
        empresa_rut,
        trabajador_id,
        trabajador_nombre,
        trabajador_rut,
        centro_id,
        centro_nombre,
        entrega_item_id,
        categoria,
        nombre_epp,
        marca,
        modelo,
        talla,
        cantidad,
        costo_unitario_iva,
        costo_item_iva,
        lote_id,
        lote_fecha_ingreso
      `)
      .eq("empresa_id", empresa_id)
      .order("fecha_entrega", { ascending: false })
      .order("entrega_id", { ascending: false })
      .order("entrega_item_id", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "No hay datos para exportar" },
        { status: 404 }
      );
    }

    const escapeCsvCell = (v: any) => {
      const s = String(v ?? "");
      // Prevent Excel formula injection
      const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
      return `"${safe.replace(/"/g, '""')}"`;
    };

    // 2️⃣ Convertir a CSV
    const headers = [
      "entrega_id",
      "empresa_id",
      "fecha_entrega",
      "costo_total_iva",
      "total_unidades",
      "empresa_nombre",
      "empresa_rut",
      "trabajador_id",
      "trabajador_nombre",
      "trabajador_rut",
      "centro_id",
      "centro_nombre",
      "entrega_item_id",
      "categoria",
      "nombre_epp",
      "marca",
      "modelo",
      "talla",
      "cantidad",
      "costo_unitario_iva",
      "costo_item_iva",
      "lote_id",
      "lote_fecha_ingreso",
    ];

    const bom = "\uFEFF"; // helps Excel open UTF-8 correctly

    const csv =
      bom +
      [
        headers.join(";"),
        ...data.map((row: any) =>
          headers.map((h) => escapeCsvCell((row as any)[h])).join(";")
        ),
      ].join("\n");

    const stamp = new Date().toISOString().slice(0, 10);

    const res = new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=entregas_${empresa_id}_${stamp}.csv`,
        "Cache-Control": "no-store",
      },
    });

    return res;
  } catch (err: any) {
    console.error("EXPORT CSV ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Error exportando CSV" },
      { status: 500 }
    );
  }
}
