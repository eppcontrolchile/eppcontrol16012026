// app/api/reportes/entregas/route.ts
// Exportación de entregas desde v_reporte_entregas (CSV)

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { searchParams } = new URL(req.url);
    const empresa_id = searchParams.get("empresa_id");

    if (!empresa_id) {
      return NextResponse.json(
        { error: "empresa_id requerido" },
        { status: 400 }
      );
    }

    // 1️⃣ Leer desde la vista
    const { data, error } = await supabase
      .from("v_reporte_entregas")
      .select(`
        fecha_entrega,
        empresa_nombre,
        trabajador_nombre,
        trabajador_rut,
        centro_nombre,
        categoria,
        nombre_epp,
        talla,
        cantidad,
        costo_unitario_iva,
        costo_item_iva,
        lote_fecha_ingreso
      `)
      .eq("empresa_id", empresa_id)
      .order("fecha_entrega", { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "No hay datos para exportar" },
        { status: 404 }
      );
    }

    // 2️⃣ Convertir a CSV
    const headers = Object.keys(data[0]);

    const csv = [
      headers.join(";"),
      ...data.map((row: any) =>
        headers
          .map((h) =>
            `"${String(row[h] ?? "").replace(/"/g, '""')}"`
          )
          .join(";")
      ),
    ].join("\n");

    // 3️⃣ Responder como archivo descargable
    return new NextResponse(csv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=entregas_${empresa_id}.csv`,
      },
    });
  } catch (err: any) {
    console.error("EXPORT CSV ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Error exportando CSV" },
      { status: 500 }
    );
  }
}
