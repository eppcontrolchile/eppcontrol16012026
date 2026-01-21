// app/utils/entrega-pdf.ts

import jsPDF from "jspdf";

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
 * - Reutilizable desde Dashboard y flujo automático de egreso
 * - Logo EPP Control (siempre)
 * - Logo empresa (si existe)
 */
export async function generarPdfEntrega({
  empresa,
  egreso,
  returnBlob = false,
}: {
  empresa: EmpresaPDF;
  egreso: EgresoPDF;
  returnBlob?: boolean;
}) {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();

  let y = 20;

  // ─────────────────────────────────────────────
  // Logos encabezado
  // ─────────────────────────────────────────────

  // Logo EPP Control (izquierda)
  doc.addImage("/logoepp.png", "PNG", 10, y, 30, 15);

  // Logo empresa (derecha, opcional)
  if (empresa.logo_url) {
    try {
      const logoEmpresaBase64 = await fetchImageAsBase64(empresa.logo_url);
      doc.addImage(
        logoEmpresaBase64,
        "PNG",
        pageWidth - 40,
        y,
        30,
        15
      );
    } catch {
      // Si falla el logo empresa, no bloquea el PDF
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
  doc.text(
    "COMPROBANTE DE ENTREGA DE EPP",
    pageWidth / 2,
    y,
    { align: "center" }
  );
  y += 10;

  // ─────────────────────────────────────────────
  // Texto legal
  // ─────────────────────────────────────────────
  const fechaFormateada = egreso.fecha
    .split("T")[0]
    .split("-")
    .reverse()
    .join("/");

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
    doc.addImage(egreso.firmaBase64, "PNG", 10, y, 60, 25);
    y += 30;
  }

  // ─────────────────────────────────────────────
  // Footer
  // ─────────────────────────────────────────────
  const footerY = 270;

  doc.addImage(
    "/logoepp.png",
    "PNG",
    pageWidth / 2 - 15,
    footerY,
    30,
    15
  );

  doc.setFontSize(9);
  doc.text(
    "EPP Control — Gestión inteligente de EPP",
    pageWidth / 2,
    footerY + 20,
    { align: "center" }
  );

  doc.text(
    "www.eppcontrol.cl",
    pageWidth / 2,
    footerY + 25,
    { align: "center" }
  );

  // ─────────────────────────────────────────────
  // Guardar archivo
  // ─────────────────────────────────────────────
  if (returnBlob) {
    return doc.output("blob");
  }

  const fechaPDF = fechaFormateada.replace(/\//g, ".");
  doc.save(
    `${fechaPDF}_${egreso.trabajador.rut}_Entrega_EPP.pdf`
  );
}

/**
 * Convierte una imagen remota (URL) a base64 para jsPDF
 */
async function fetchImageAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  const blob = await res.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
