// app/api/egresos/route.ts
// API de egresos – C6
// Orquestador backend: delega FIFO y transacción 100% a PostgreSQL

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generarPdfEntrega } from "@/utils/entrega-pdf";
import { guardarPdfEnStorage } from "@/utils/guardar-pdf-storage";
import { enviarCorreosEgreso } from "@/utils/enviar-mail-egreso";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/egresos
 * Flujo:
 * 1. Validar payload
 * 2. Ejecutar registrar_egreso_fifo (RPC)
 * 3. Retornar resultado
 */
export async function POST(req: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase (NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY)" },
      { status: 500 }
    );
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

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
        p_idempotency_key: idempotencyKey,
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

    // Supabase RPC puede devolver object, array (1 row), o wrapper según configuración
    const rpcResult: any = Array.isArray(data) ? data[0] : data;

    const entregaId: string | undefined =
      rpcResult?.entrega_id ??
      rpcResult?.entregaId ??
      rpcResult?.id ??
      rpcResult?.entrega?.id;

    if (!entregaId) {
      console.error("RPC FIFO ERROR: entrega_id missing", { data });
      return NextResponse.json(
        { error: "El servidor no devolvió entrega_id desde registrar_egreso_fifo" },
        { status: 500 }
      );
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
      console.error("PDF ERROR: no entregaData", { entregaId, entregaError });
      throw new Error(
        `No se pudo obtener la entrega para generar el PDF (entrega_id=${entregaId})` +
          (entregaError?.message ? `: ${entregaError.message}` : "")
      );
    }

    // Normalizar relaciones: a veces llegan como objeto, a veces como array (según typing/joins)
    const empresaRel: any = Array.isArray((entregaData as any).empresas)
      ? (entregaData as any).empresas[0]
      : (entregaData as any).empresas;

    const trabajadorRel: any = Array.isArray((entregaData as any).trabajadores)
      ? (entregaData as any).trabajadores[0]
      : (entregaData as any).trabajadores;

    const centroRel: any = Array.isArray((entregaData as any).centros_trabajo)
      ? (entregaData as any).centros_trabajo[0]
      : (entregaData as any).centros_trabajo;

    // Armar estructura PDF
    const pdfBuffer = await generarPdfEntrega({
      empresa: {
        nombre: empresaRel?.nombre,
        rut: empresaRel?.rut,
        logo_url: empresaRel?.logo_url,
      },
      egreso: {
        id: entregaData.id,
        fecha: entregaData.fecha_entrega,
        trabajador: {
          nombre: trabajadorRel?.nombre,
          rut: trabajadorRel?.rut,
          centro: centroRel?.nombre,
        },
        items: (Array.isArray((entregaData as any).entrega_items) ? (entregaData as any).entrega_items : []).map((i: any) => ({
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
          nombre: empresaRel?.nombre,
        },
        trabajador: {
          nombre: trabajadorRel?.nombre,
          rut: trabajadorRel?.rut,
          email: trabajadorRel?.email ?? null,
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
    const res = NextResponse.json(
      {
        ok: true,
        entrega_id: entregaId,
        ...rpcResult,
      },
      { status: 201 }
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err: any) {
    console.error("EGRESOS API ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Error inesperado en egresos" },
      { status: 500 }
    );
  }
}
