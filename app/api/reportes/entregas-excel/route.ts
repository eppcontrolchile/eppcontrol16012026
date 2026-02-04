// app/api/reportes/entregas-excel/route.ts
// Exportación Excel (.xlsx) desde v_reporte_entregas

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

export async function GET(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { searchParams } = new URL(req.url);
    const empresa_id = searchParams.get("empresa_id");
    const desde = searchParams.get("desde"); // YYYY-MM-DD
    const hasta = searchParams.get("hasta"); // YYYY-MM-DD

    if (!empresa_id) {
      return NextResponse.json(
        { error: "empresa_id requerido" },
        { status: 400 }
      );
    }

    // 1️⃣ Leer datos desde la vista
    let query = supabase
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
      .eq("empresa_id", empresa_id);

    if (desde) {
      query = query.gte("fecha_entrega", desde);
    }

    if (hasta) {
      query = query.lte("fecha_entrega", hasta);
    }

    const { data, error } = await query.order(
      "fecha_entrega",
      { ascending: false }
    );

    if (error) throw error;
    if (!data || data.length === 0) {
      return NextResponse.json(
        { error: "No hay datos para exportar" },
        { status: 404 }
      );
    }

    // 2️⃣ Normalizar datos (fechas y nombres pro)
    const rows = data.map((r: any) => ({
      "Fecha entrega": r.fecha_entrega,
      Empresa: r.empresa_nombre,
      Trabajador: r.trabajador_nombre,
      "RUT trabajador": r.trabajador_rut,
      "Centro de trabajo": r.centro_nombre,
      Categoría: r.categoria,
      EPP: r.nombre_epp,
      Talla: r.talla ?? "No aplica",
      Cantidad: r.cantidad,
      "Costo unitario (IVA)": r.costo_unitario_iva,
      "Costo total ítem (IVA)": r.costo_item_iva,
      "Fecha ingreso lote": r.lote_fecha_ingreso,
    }));

    // 3️⃣ Crear workbook
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      "Entregas EPP"
    );

    const buffer = XLSX.write(workbook, {
      type: "buffer",
      bookType: "xlsx",
    });

    // 4️⃣ Responder archivo
    return new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=entregas_${empresa_id}.xlsx`,
      },
    });
  } catch (err: any) {
    console.error("EXPORT EXCEL ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Error exportando Excel" },
      { status: 500 }
    );
  }
}
