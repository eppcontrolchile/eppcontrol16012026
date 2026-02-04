// app/api/alerts/stock/route.ts

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

let lastSentDate: string | null = null;

export async function POST() {
  try {
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ ok: true, skipped: true, reason: "missing_api_key" });
    }

    const today = new Date().toISOString().slice(0, 10);
    if (lastSentDate === today) {
      return NextResponse.json({ ok: true, skipped: true, reason: "already_sent_today" });
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error } = await supabase
      .from("lotes_epp")
      .select(`
        producto_id,
        cantidad_disponible,
        productos_epp (
          nombre,
          talla,
          stock_critico
        )
      `);

    if (error) throw error;

    const resumen = new Map<string, {
      nombre: string;
      talla: string | null;
      stock_critico: number;
      total: number;
    }>();

    for (const row of data || []) {
      const key = row.producto_id;
      if (!resumen.has(key)) {
        resumen.set(key, {
          nombre: row.productos_epp.nombre,
          talla: row.productos_epp.talla,
          stock_critico: row.productos_epp.stock_critico,
          total: 0,
        });
      }
      resumen.get(key)!.total += row.cantidad_disponible;
    }

    const criticos = [...resumen.values()].filter(
      (i) => i.total <= i.stock_critico
    );

    if (criticos.length === 0) {
      return NextResponse.json({ ok: true, skipped: true, reason: "no_critical_stock" });
    }

    const admin = process.env.ADMIN_EMAIL;
    const gerencia = process.env.GERENCIA_EMAIL;
    if (!admin || !gerencia) {
      throw new Error("Correos no configurados");
    }

    const resend = new Resend(apiKey);

    const html = `
      <h2>⚠️ Alerta diaria de stock crítico</h2>
      <ul>
        ${criticos
          .map(
            (c) =>
              `<li>${c.nombre} (${c.talla ?? "No aplica"}) — Stock: ${c.total}</li>`
          )
          .join("")}
      </ul>
      <p>Fecha: ${new Date().toLocaleDateString("es-CL")}</p>
    `;

    await resend.emails.send({
      from: "EPP Control <soporte@eppcontrol.cl>",
      to: [admin, gerencia],
      subject: "⚠️ Alerta diaria de stock crítico",
      html,
    });

    lastSentDate = today;

    return NextResponse.json({ ok: true, enviados: criticos.length });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
