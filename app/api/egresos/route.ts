// app/api/egresos/route.ts

import { generarPdfEntrega } from "@/app/utils/entrega-pdf";
import { guardarPdfEnStorage } from "@/app/utils/guardar-pdf-storage";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { enviarCorreosEgreso } from "@/app/utils/enviar-mail-egreso";

/**
 * POST /api/egresos
 * Flujo base de egreso:
 * 1. Validar payload
 * 2. Crear egreso
 * 3. Crear ítems del egreso
 * 4. Generar PDF automático
 * 5. Guardar PDF en Storage
 * 6. Enviar correos
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      empresa_id,
      usuario_id,
      trabajador_id,
      centro_id,
      items,
      firma_base64,
      fecha,
    } = body;

    // 1️⃣ Validaciones mínimas
    if (
      !empresa_id ||
      !usuario_id ||
      !trabajador_id ||
      !centro_id ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        { error: "Datos de egreso incompletos" },
        { status: 400 }
      );
    }

    // 2️⃣ Cliente admin (service role)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 3️⃣ Crear egreso
    const { data: egreso, error: egresoError } = await supabaseAdmin
      .from("egresos")
      .insert({
        empresa_id,
        trabajador_id,
        centro_id,
        usuario_id,
        fecha: fecha || new Date().toISOString(),
        firma_base64: firma_base64 || null,
      })
      .select()
      .single();

    if (egresoError || !egreso) {
      console.error("EGRESO ERROR:", egresoError);
      return NextResponse.json(
        { error: "Error creando egreso" },
        { status: 500 }
      );
    }

    // 4️⃣ Crear ítems del egreso
    const itemsInsert = items.map((item: any) => ({
      egreso_id: egreso.id,
      empresa_id,
      categoria: item.categoria,
      epp: item.epp,
      talla_numero: item.tallaNumero || null,
      cantidad: item.cantidad,
      costo_unitario: item.costoUnitario || null,
      costo_total: item.costoTotal || null,
    }));

    const { error: itemsError } = await supabaseAdmin
      .from("egresos_items")
      .insert(itemsInsert);

    if (itemsError) {
      console.error("ITEMS ERROR:", itemsError);
      return NextResponse.json(
        { error: "Error creando ítems del egreso" },
        { status: 500 }
      );
    }

    // 5️⃣ Generar PDF automático del egreso
    const empresa = {
      nombre: body.empresa_nombre,
      rut: body.empresa_rut,
      logo_url: body.empresa_logo_url || null,
    };

    const egresoPdfData = {
      id: egreso.id,
      fecha: egreso.fecha,
      trabajador: {
        nombre: body.trabajador_nombre,
        rut: body.trabajador_rut,
        centro: body.centro_nombre,
      },
      items: items.map((item: any) => ({
        categoria: item.categoria,
        epp: item.epp,
        tallaNumero: item.tallaNumero || null,
        cantidad: item.cantidad,
      })),
      firmaBase64: firma_base64 || null,
    };

    const pdfBlob = await generarPdfEntrega({
      empresa,
      egreso: egresoPdfData,
      returnBlob: true,
    });

    // 6️⃣ Guardar PDF en Supabase Storage
    await guardarPdfEnStorage({
      empresa_id,
      egreso_id: egreso.id,
      pdfBlob,
    });

    // 7️⃣ Enviar correos
    let correosEnviados = false;
    try {
      await enviarCorreosEgreso({
        empresa,
        egreso: egresoPdfData,
        pdfBlob,
        correos: body.correos || [],
      });
      correosEnviados = true;
    } catch (emailError) {
      console.error("ERROR AL ENVIAR CORREOS:", emailError);
    }

    // 8️⃣ Respuesta base (PDF, storage y correos se agregan luego)
    return NextResponse.json({
      ok: true,
      egreso_id: egreso.id,
      pdf_generado: true,
      correos_enviados: correosEnviados,
      message: "Egreso creado correctamente",
    });
  } catch (err: any) {
    console.error("EGRESOS POST ERROR:", err);
    return NextResponse.json(
      { error: "Error inesperado en egreso" },
      { status: 500 }
    );
  }
}
