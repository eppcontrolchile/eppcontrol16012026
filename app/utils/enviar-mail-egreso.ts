// app/utils/enviar-mail-egreso.ts
// Envío de correos post-egreso (D4)
// Usa link al PDF almacenado en Supabase Storage (pdf_url)

import { Resend } from "resend";

function getResend() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY no configurada");
  }
  return new Resend(apiKey);
}

type EmpresaMail = {
  nombre: string;
};

type TrabajadorMail = {
  nombre: string;
  rut: string;
  email?: string | null;
};

/**
 * Envía correos de comprobante de entrega de EPP
 * - Admin de la empresa (siempre)
 * - Trabajador (si tiene correo)
 * - Incluye LINK al PDF (no adjuntos)
 *
 * Backend-only
 */
export async function enviarCorreosEgreso(params: {
  pdf_url: string;
  empresa: EmpresaMail;
  trabajador: TrabajadorMail;
  emailAdmin: string;
}) {
  const { pdf_url, empresa, trabajador, emailAdmin } = params;

  if (!pdf_url) {
    throw new Error("pdf_url no recibido para envío de correos");
  }

  if (!emailAdmin) {
    throw new Error("Email de administrador no definido");
  }

  const subject = `Comprobante de entrega de EPP – ${trabajador.nombre}`;

  const cuerpoTexto =
    `Se ha registrado una entrega de Equipos de Protección Personal (EPP).\n\n` +
    `Empresa: ${empresa.nombre}\n` +
    `Trabajador: ${trabajador.nombre}\n` +
    `RUT: ${trabajador.rut}\n\n` +
    `Puedes descargar el comprobante en el siguiente enlace:\n` +
    `${pdf_url}\n\n` +
    `Documento generado automáticamente por EPP Control.`;

  const cuerpoHtml = `<p>Se ha registrado una entrega de EPP.</p>
<p><strong>Empresa:</strong> ${empresa.nombre}</p>
<p><strong>Trabajador:</strong> ${trabajador.nombre} (${trabajador.rut})</p>
<p><a href="${pdf_url}" target="_blank">Descargar comprobante PDF</a></p>
<p><em>EPP Control</em></p>`;

  try {
    const resend = getResend();
    // 📩 Correo al administrador
    await resend.emails.send({
      from: "EPP Control <no-reply@eppcontrol.cl>",
      to: emailAdmin,
      subject,
      text: cuerpoTexto,
      html: cuerpoHtml,
    });

    // 📩 Correo al trabajador (si existe)
    if (trabajador.email) {
      await resend.emails.send({
        from: "EPP Control <no-reply@eppcontrol.cl>",
        to: trabajador.email,
        subject,
        text: cuerpoTexto,
        html: cuerpoHtml,
      });
    }
  } catch (error) {
    console.error("ERROR ENVIO CORREO EGRESO:", error);
    throw new Error("Error enviando correos de egreso");
  }
}
