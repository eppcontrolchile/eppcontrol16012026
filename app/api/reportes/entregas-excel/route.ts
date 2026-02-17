// app/api/reportes/entregas-excel/route.ts
// Exportación Excel (.xlsx) desde v_reporte_entregas

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import * as XLSX from "xlsx";

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
    const { searchParams } = new URL(req.url);
    const desde = searchParams.get("desde"); // YYYY-MM-DD
    const hasta = searchParams.get("hasta"); // YYYY-MM-DD

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

    // 1️⃣ Leer datos desde la vista
    let query = supabaseAdmin
      .from("v_reporte_entregas")
      .select(`
        fecha_entrega,
        empresa_nombre,
        trabajador_nombre,
        trabajador_rut,
        centro_nombre,
        categoria,
        nombre_epp,
        marca,
        modelo,
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

    const safeCell = (v: any) => {
      const s = String(v ?? "");
      // Prevent Excel formula injection
      return /^[=+\-@]/.test(s) ? `'${s}` : s;
    };
    // 2️⃣ Normalizar datos (fechas y nombres pro)
    const rows = data.map((r: any) => ({
      "Fecha entrega": safeCell(r.fecha_entrega),
      Empresa: safeCell(r.empresa_nombre),
      Trabajador: safeCell(r.trabajador_nombre),
      "RUT trabajador": safeCell(r.trabajador_rut),
      "Centro de trabajo": safeCell(r.centro_nombre),
      Categoría: safeCell(r.categoria),
      EPP: safeCell(
        [
          r.nombre_epp,
          r.marca ? `Marca: ${r.marca}` : null,
          r.modelo ? `Modelo: ${r.modelo}` : null,
        ]
          .filter(Boolean)
          .join(" - ")
      ),
      Talla: safeCell(r.talla ?? "No aplica"),
      Cantidad: Number(r.cantidad ?? 0),
      "Costo unitario (IVA)": Number(r.costo_unitario_iva ?? 0),
      "Costo total ítem (IVA)": Number(r.costo_item_iva ?? 0),
      "Fecha ingreso lote": safeCell(r.lote_fecha_ingreso),
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
    const stamp = new Date().toISOString().slice(0, 10);

    const res = new NextResponse(buffer, {
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename=entregas_${empresa_id}_${stamp}.xlsx`,
        "Cache-Control": "no-store",
      },
    });

    return res;
  } catch (err: any) {
    console.error("EXPORT EXCEL ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Error exportando Excel" },
      { status: 500 }
    );
  }
}
