// app/api/alerts/route.ts

import { NextResponse } from "next/server";
import { Resend } from "resend";

type StockCriticalItem = {
  categoria: string;
  nombre: string;
  talla: string | null;
  cantidad: number;
};

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY no está definida");
  }
  return new Resend(apiKey);
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const criticos: StockCriticalItem[] = body.criticos || [];

    if (criticos.length === 0) {
      return NextResponse.json({
        ok: true,
        message: "No hay stock crítico para notificar",
      });
    }

    const to = (process.env.ALERT_EMAIL_TO || "").trim();
    if (!to) {
      throw new Error("ALERT_EMAIL_TO no está definida");
    }

    const from = (process.env.ALERT_EMAIL_FROM || "onboarding@resend.dev").trim();
    const loginUrl = "https://www.eppcontrol.cl/login";

    const listaTexto = criticos
      .map(
        (item) =>
          `• ${item.categoria} – ${item.nombre} (${item.talla ?? "No aplica"}) → Cantidad: ${item.cantidad}`
      )
      .join("\n");

    const listaHtml = criticos
      .map((item) => {
        const talla = item.talla ?? "No aplica";
        return `<li><strong>${item.categoria}</strong> – ${item.nombre} (${talla}) → Cantidad: ${item.cantidad}</li>`;
      })
      .join("");

    const resend = getResend();

    await resend.emails.send({
      from,
      to,
      subject: "⚠️ Alerta de stock crítico – EPP Control",
      text:
        "Hola,\n\n" +
        "Se han detectado nuevos elementos de protección personal en stock crítico:\n\n" +
        listaTexto +
        `\n\nIngresa a EPP Control para revisar el stock: ${loginUrl}\n\n` +
        "Este es un mensaje automático, por favor no responder.\n" +
        "Equipo de soporte de EPP Control\n",
      html: `
        <p>Hola,</p>
        <p>Se han detectado nuevos elementos de protección personal en stock crítico:</p>
        <ul>
          ${listaHtml}
        </ul>
        <p>
          <a href="${loginUrl}" target="_blank" rel="noreferrer">Ingresar a EPP Control</a>
        </p>
        <p style="font-size:12px;color:#666;margin-top:16px;">
          Este es un mensaje automático, por favor no responder.
        </p>
        <p><strong>Equipo de soporte de EPP Control</strong></p>
      `,
    });

    return NextResponse.json({
      ok: true,
      enviados: criticos.length,
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        ok: false,
        error: error.message || "Error enviando alertas",
      },
      { status: 500 }
    );
  }
}
