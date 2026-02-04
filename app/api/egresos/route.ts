// app/api/egresos/route.ts
// API de egresos – C6
// Orquestador backend: delega FIFO y transacción 100% a PostgreSQL

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generarPdfEntrega } from "@/utils/entrega-pdf";
import { guardarPdfEnStorage } from "@/utils/guardar-pdf-storage";
import { enviarCorreosEgreso } from "@/utils/enviar-mail-egreso";

/**
 * POST /api/egresos
 * Flujo:
 * 1. Validar payload
 * 2. Ejecutar registrar_egreso_fifo (RPC)
 * 3. Retornar resultado
 */
export async function POST(req: Request) {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const body = await req.json();

    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "Falta Idempotency-Key en el header" },
        { status: 400 }
      );
    }

    const {
      empresa_id,
      usuario_id,
      trabajador_id,
      centro_id,
      firma_url,
      items,
    } = body;

    // ─────────────────────────────────────────────
    // 1️⃣ Validaciones mínimas
    // ─────────────────────────────────────────────
    if (
      !empresa_id ||
      !usuario_id ||
      !trabajador_id ||
      !centro_id ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        { error: "Payload incompleto" },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────
    // Validación explícita de cada item en items
    // ─────────────────────────────────────────────
    for (const item of items) {
      if (
        !item ||
        typeof item.categoria !== "string" ||
        item.categoria.trim() === "" ||
        typeof item.nombre_epp !== "string" ||
        item.nombre_epp.trim() === "" ||
        typeof item.cantidad !== "number" ||
        item.cantidad <= 0
      ) {
        return NextResponse.json(
          { error: "Item inválido en items" },
          { status: 400 }
        );
      }
    }

    const { data: existente, error: idemError } = await supabase
      .from("egresos_idempotencia")
      .select("entrega_id")
      .eq("idempotency_key", idempotencyKey)
      .maybeSingle();

    if (idemError) {
      throw idemError;
    }

    if (existente?.entrega_id) {
      return NextResponse.json(
        {
          ok: true,
          entrega_id: existente.entrega_id,
          idempotent: true,
        },
        { status: 200 }
      );
    }

    const { error: insertIdemError } = await supabase
      .from("egresos_idempotencia")
      .insert({
        idempotency_key: idempotencyKey,
        empresa_id,
        usuario_id,
      });

    if (insertIdemError) {
      // 23505 = unique_violation (reintento concurrente con misma idempotency key)
      if (insertIdemError.code === "23505") {
        const { data: existente2, error: idemError2 } = await supabase
          .from("egresos_idempotencia")
          .select("entrega_id")
          .eq("idempotency_key", idempotencyKey)
          .maybeSingle();

        if (idemError2) throw idemError2;

        if (existente2?.entrega_id) {
          return NextResponse.json(
            { ok: true, entrega_id: existente2.entrega_id, idempotent: true },
            { status: 200 }
          );
        }

        // Otro request sigue procesando la misma llave
        return NextResponse.json(
          {
            error:
              "Solicitud duplicada en proceso. Intenta nuevamente en unos segundos.",
          },
          { status: 409 }
        );
      }

      throw insertIdemError;
    }

    // ─────────────────────────────────────────────
    // 2️⃣ Ejecutar FIFO productivo en PostgreSQL
    // ─────────────────────────────────────────────
    const { data, error } = await supabase.rpc(
      "registrar_egreso_fifo",
      {
        p_empresa_id: empresa_id,
        p_usuario_id: usuario_id,
        p_trabajador_id: trabajador_id,
        p_centro_id: centro_id,
        p_firma_url: firma_url,
        p_items: items,
      }
    );

    if (error) {
      console.error("RPC FIFO ERROR:", error);
      return NextResponse.json(
        { error: error.message || "Error ejecutando egreso FIFO" },
        { status: 500 }
      );
    }

    if (!data) {
      console.error("RPC FIFO ERROR: No data returned");
      return NextResponse.json(
        { error: "No se recibió respuesta del servidor" },
        { status: 500 }
      );
    }

    const entregaId = data.entrega_id;

    const { error: updateIdemError } = await supabase
      .from("egresos_idempotencia")
      .update({ entrega_id: entregaId })
      .eq("idempotency_key", idempotencyKey);

    if (updateIdemError) {
      throw updateIdemError;
    }

    // ─────────────────────────────────────────────
    // 2️⃣.1 Generar PDF automático post-RPC
    // ─────────────────────────────────────────────

    // data debe traer: entrega_id, total_unidades, costo_total_iva
    // Obtener datos completos de la entrega para el PDF
    const { data: entregaData, error: entregaError } = await supabase
      .from("entregas")
      .select(`
        id,
        fecha_entrega,
        firma_url,
        costo_total_iva,
        total_unidades,
        empresas:empresa_id ( nombre, rut, logo_url ),
        trabajadores:trabajador_id ( nombre, rut, email ),
        centros_trabajo:centro_id ( nombre ),
        entrega_items (
          categoria,
          nombre_epp,
          talla,
          cantidad
        )
      `)
      .eq("id", entregaId)
      .single();

    if (entregaError || !entregaData) {
      throw new Error("No se pudo obtener la entrega para generar el PDF");
    }

    // Armar estructura PDF
    const pdfBuffer = await generarPdfEntrega({
      empresa: {
        nombre: entregaData.empresas[0]?.nombre,
        rut: entregaData.empresas[0]?.rut,
        logo_url: entregaData.empresas[0]?.logo_url,
      },
      egreso: {
        id: entregaData.id,
        fecha: entregaData.fecha_entrega,
        trabajador: {
          nombre: entregaData.trabajadores[0]?.nombre,
          rut: entregaData.trabajadores[0]?.rut,
          centro: entregaData.centros_trabajo[0]?.nombre,
        },
        items: entregaData.entrega_items.map((i: any) => ({
          categoria: i.categoria,
          epp: i.nombre_epp,
          tallaNumero: i.talla,
          cantidad: i.cantidad,
        })),
        firmaBase64: entregaData.firma_url,
      },
    });

    // Guardar PDF en Storage
    const { path } = await guardarPdfEnStorage({
      empresa_id,
      egreso_id: entregaId,
      pdfBuffer: Buffer.from(pdfBuffer),
    });

    // Persistir URL del PDF en la entrega
    const { error: pdfUpdateError } = await supabase
      .from("entregas")
      .update({ pdf_url: path })
      .eq("id", entregaId);

    if (pdfUpdateError) {
      throw new Error("No se pudo guardar la URL del PDF");
    }

    // ─────────────────────────────────────────────
    // 2️⃣.2 Envío de correos post-egreso (D4)
    // ─────────────────────────────────────────────
    try {
      // Obtener correo del administrador (usuario)
      const { data: usuarioMail } = await supabase
        .from("usuarios")
        .select("email")
        .eq("id", usuario_id)
        .single();

      await enviarCorreosEgreso({
        pdf_url: path,
        empresa: {
          nombre: entregaData.empresas[0]?.nombre,
        },
        trabajador: {
          nombre: entregaData.trabajadores[0]?.nombre,
          rut: entregaData.trabajadores[0]?.rut,
          email: entregaData.trabajadores[0]?.email ?? null,
        },
        emailAdmin: usuarioMail?.email,
      });
    } catch (mailError) {
      // No rompe el flujo principal del egreso
      console.error("ERROR ENVÍO CORREOS EGRESO:", mailError);
    }

    // ─────────────────────────────────────────────
    // 3️⃣ Respuesta
    // ─────────────────────────────────────────────
    return NextResponse.json({
      ok: true,
      ...data,
    }, { status: 201 });
  } catch (err: any) {
    console.error("EGRESOS API ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Error inesperado en egresos" },
      { status: 500 }
    );
  }
}
