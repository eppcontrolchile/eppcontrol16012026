// app/utils/enviar-mail-egreso.ts

import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY!);

/**
 * Envía correos de comprobante de entrega de EPP
 * - Admin de la empresa (siempre)
 * - Trabajador (si tiene correo)
 * Adjunta el PDF generado automáticamente
 */
export async function enviarCorreosEgreso(params: {
  pdfBuffer: Buffer;
  nombreEmpresa: string;
  nombreTrabajador: string;
  rutTrabajador: string;
  emailAdmin: string;
  emailTrabajador?: string | null;
}) {
  const {
    pdfBuffer,
    nombreEmpresa,
    nombreTrabajador,
    rutTrabajador,
    emailAdmin,
    emailTrabajador,
  } = params;

  const subject = `Comprobante de entrega de EPP – ${nombreTrabajador}`;

  const cuerpoTexto =
    `Adjuntamos el comprobante de entrega de EPP.\n\n` +
    `Empresa: ${nombreEmpresa}\n` +
    `Trabajador: ${nombreTrabajador}\n` +
    `RUT: ${rutTrabajador}\n\n` +
    `Documento generado automáticamente por EPP Control.`;

  // 📩 Correo al administrador
  await resend.emails.send({
    from: "EPP Control <no-reply@eppcontrol.cl>",
    to: emailAdmin,
    subject,
    text: cuerpoTexto,
    attachments: [
      {
        filename: `${rutTrabajador}_Entrega_EPP.pdf`,
        content: pdfBuffer,
      },
    ],
  });

  // 📩 Correo al trabajador (si existe)
  if (emailTrabajador) {
    await resend.emails.send({
      from: "EPP Control <no-reply@eppcontrol.cl>",
      to: emailTrabajador,
      subject,
      text: cuerpoTexto,
      attachments: [
        {
          filename: `${rutTrabajador}_Entrega_EPP.pdf`,
          content: pdfBuffer,
        },
      ],
    });
  }
}
