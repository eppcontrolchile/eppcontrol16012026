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
};

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

    const lista = criticos
      .map(
        (item) =>
          `• ${item.categoria} – ${item.nombre} (${item.talla ?? "No aplica"}) → Cantidad: ${item.cantidad}`
      )
      .join("\n");

    const resend = getResend();

    await resend.emails.send({
      from: process.env.ALERT_EMAIL_FROM || "onboarding@resend.dev",
      to: process.env.ALERT_EMAIL_TO || "",
      subject: "⚠️ Alerta de stock crítico – EPP Control",
      text:
        "Se han detectado nuevos elementos de protección personal en stock crítico:\n\n" +
        lista +
        "\n\nIngresa a EPP Control para revisar el stock.",
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
