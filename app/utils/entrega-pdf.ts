// app/utils/entrega-pdf.ts

import jsPDF from "jspdf";

/**
 * Ensures a base64 string has a proper data URL prefix.
 */
function normalizeBase64Image(base64: string): string {
  if (!base64) return "";
  if (base64.startsWith("data:image/")) return base64;
  return `data:image/png;base64,${base64}`;
}

export type EmpresaPDF = {
  nombre: string;
  rut: string;
  logo_url?: string | null;
};

export type TrabajadorPDF = {
  nombre: string;
  rut: string;
  centro: string;
};

export type ItemPDF = {
  categoria: string;
  epp: string;
  tallaNumero?: string | null;
  cantidad: number;
};

export type EgresoPDF = {
  id: string;
  fecha: string;
  trabajador: TrabajadorPDF;
  items: ItemPDF[];
  firmaBase64?: string | null;
};

/**
 * Genera el PDF de comprobante de entrega de EPP
 * ✔ Backend-safe (Node / Vercel)
 * ✔ Reutilizable desde API y frontend
 * ✔ Retorna Uint8Array (buffer, Node)
 */
export async function generarPdfEntrega(params: {
  empresa: EmpresaPDF;
  egreso: EgresoPDF;
}): Promise<Uint8Array> {
  const { empresa, egreso } = params;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // ─────────────────────────────────────────────
  // Logos encabezado
  // ─────────────────────────────────────────────

  // Logo EPP Control (debe existir en /public/logoepp.png)
  doc.addImage("/logoepp.png", "PNG", 10, y, 30, 15);

  // Logo empresa (opcional)
  if (empresa.logo_url) {
    try {
      const base64Logo = await fetchImageAsBase64(empresa.logo_url);
      doc.addImage(base64Logo, "PNG", pageWidth - 40, y, 30, 15);
    } catch {
      // No bloquea el PDF si el logo falla
    }
  }

  y += 25;

  // ─────────────────────────────────────────────
  // Datos empresa
  // ─────────────────────────────────────────────
  doc.setFontSize(11);
  doc.text(empresa.nombre, 10, y);
  y += 5;

  doc.setFontSize(9);
  doc.text(`RUT: ${empresa.rut}`, 10, y);
  y += 10;

  // ─────────────────────────────────────────────
  // Título
  // ─────────────────────────────────────────────
  doc.setFontSize(14);
  doc.text("COMPROBANTE DE ENTREGA DE EPP", pageWidth / 2, y, {
    align: "center",
  });
  y += 10;

  // ─────────────────────────────────────────────
  // Texto legal
  // ─────────────────────────────────────────────
  let fechaFormateada = "";
  try {
    // Defensive fallback for non-ISO dates
    if (egreso.fecha && typeof egreso.fecha === "string") {
      const [fechaIso] = egreso.fecha.split("T");
      if (/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
        fechaFormateada = fechaIso.split("-").reverse().join("/");
      } else {
        // Try Date parsing as fallback
        const d = new Date(egreso.fecha);
        if (!isNaN(d.getTime())) {
          fechaFormateada = [
            d.getDate().toString().padStart(2, "0"),
            (d.getMonth() + 1).toString().padStart(2, "0"),
            d.getFullYear(),
          ].join("/");
        } else {
          fechaFormateada = egreso.fecha;
        }
      }
    }
  } catch {
    fechaFormateada = egreso.fecha || "";
  }

  doc.setFontSize(10);
  doc.text(
    `Con fecha ${fechaFormateada}, la empresa ${empresa.nombre}, RUT ${empresa.rut}, ` +
      `hace entrega de los siguientes Equipos de Protección Personal (EPP) al trabajador ` +
      `${egreso.trabajador.nombre}, RUT ${egreso.trabajador.rut}, ` +
      `perteneciente al centro de trabajo ${egreso.trabajador.centro}:`,
    10,
    y,
    { maxWidth: 190 }
  );
  y += 20;

  // ─────────────────────────────────────────────
  // Lista de EPP
  // ─────────────────────────────────────────────
  doc.setFontSize(11);
  doc.text("EPP Entregados", 10, y);
  y += 6;

  doc.setFontSize(10);
  egreso.items.forEach((item) => {
    doc.text(
      `• ${item.categoria} - ${item.epp}` +
        (item.tallaNumero ? ` | ${item.tallaNumero}` : "") +
        ` | Cant: ${item.cantidad}`,
      12,
      y
    );
    y += 5;
  });

  y += 10;

  // ─────────────────────────────────────────────
  // Declaración de conformidad
  // ─────────────────────────────────────────────
  doc.setFontSize(10);
  doc.text(
    "Declaro haber recibido conforme los Equipos de Protección Individual (EPI) indicados, " +
      "en buen estado y adecuados a mis funciones, comprometiéndome a utilizarlos correctamente " +
      "y a mantenerlos en las condiciones exigidas por la normativa vigente.",
    10,
    y,
    { maxWidth: 190 }
  );
  y += 18;

  // ─────────────────────────────────────────────
  // Firma
  // ─────────────────────────────────────────────
  doc.setFontSize(11);
  doc.text("Firma del trabajador:", 10, y);
  y += 4;

  if (egreso.firmaBase64) {
    const normalizedFirma = normalizeBase64Image(egreso.firmaBase64);
    if (normalizedFirma && /^data:image\/png;base64,/.test(normalizedFirma)) {
      doc.addImage(normalizedFirma, "PNG", 10, y, 60, 25);
      y += 30;
    }
  }

  // ─────────────────────────────────────────────
  // Footer
  // ─────────────────────────────────────────────
  const footerY = 270;

  doc.addImage("/logoepp.png", "PNG", pageWidth / 2 - 15, footerY, 30, 15);

  doc.setFontSize(9);
  doc.text(
    "EPP Control — Gestión inteligente de EPP",
    pageWidth / 2,
    footerY + 20,
    { align: "center" }
  );

  doc.text("www.eppcontrol.cl", pageWidth / 2, footerY + 25, {
    align: "center",
  });

  // ─────────────────────────────────────────────
  // Retornar buffer (Node compatible)
  // ─────────────────────────────────────────────
  const buffer = doc.output("arraybuffer");
  return new Uint8Array(buffer);
}

/**
 * Convierte una imagen remota a base64 (Node compatible)
 */
async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:image/png;base64,${buffer.toString("base64")}`;
}
