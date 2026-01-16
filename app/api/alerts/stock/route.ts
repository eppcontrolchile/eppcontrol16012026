// app/api/alerts/stock/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getStock } from "@/app/utils/stock";

const resend = new Resend(process.env.RESEND_API_KEY);

let lastSentDate: string | null = null;

export async function POST() {
  try {
    const today = new Date().toISOString().slice(0, 10);

    if (lastSentDate === today) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "already_sent_today",
      });
    }

    const stock = getStock();
    const criticos = stock.filter(
      (i) => i.stock <= i.stockCritico
    );

    if (criticos.length === 0) {
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: "no_critical_stock",
      });
    }

    const admin = process.env.ADMIN_EMAIL;
    const gerencia = process.env.GERENCIA_EMAIL;

    if (!admin || !gerencia) {
      throw new Error("Correos no configurados");
    }

    const html = `
      <h2>⚠️ Alerta diaria de stock crítico</h2>
      <p>Los siguientes EPP se encuentran en stock crítico:</p>
      <ul>
        ${criticos
          .map(
            (c) =>
              `<li>${c.nombre} (${c.talla ?? "No aplica"}) — Stock: ${c.stock}</li>`
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

    return NextResponse.json({
      ok: true,
      enviados: criticos.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
