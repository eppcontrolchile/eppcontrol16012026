// app/api/test-email/route.ts
import { NextResponse } from "next/server";
import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function POST() {
  try {
    const data = await resend.emails.send({
      from: "Alertas EPP Control <notificaciones@eppcontrol.cl>",
      to: ["soporte@eppcontrol.cl"], // puedes cambiarlo a tu correo personal
      replyTo: "soporte@eppcontrol.cl",
      subject: "✅ Prueba de envío — EPP Control",
      html: `
        <h2>Prueba de envío exitosa</h2>
        <p>Este correo confirma que <strong>Resend</strong> está correctamente configurado para <strong>eppcontrol.cl</strong>.</p>
        <p>Fecha: ${new Date().toLocaleString("es-CL")}</p>
      `,
    });

    return NextResponse.json({ ok: true, data });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
