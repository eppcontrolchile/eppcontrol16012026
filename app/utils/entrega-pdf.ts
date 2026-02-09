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

function isDataImageUrl(s: string | undefined | null): s is string {
  return !!s && /^data:image\/(png|jpe?g);base64,/.test(s);
}

function getPublicBaseUrl(): string {
  // Browser
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  // Server (Vercel)
  const envUrl =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.SITE_URL ||
    process.env.APP_URL;
  if (envUrl) return envUrl.replace(/\/$/, "");

  const vercelUrl = process.env.VERCEL_URL || process.env.NEXT_PUBLIC_VERCEL_URL;
  if (vercelUrl) return `https://${vercelUrl}`;

  // Last resort: production domain
  return "https://www.eppcontrol.cl";
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  // Node
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = (globalThis as any).Buffer;
  if (typeof B !== "undefined") {
    return B.from(buf).toString("base64");
  }

  // Browser
  let binary = "";
  const bytes = new Uint8Array(buf);
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

// ─────────────────────────────────────────────
// Helper formatting/drawing functions for PDF
// ─────────────────────────────────────────────
function formatRut(rut: string): string {
  return (rut || "").trim();
}

function formatDateTimeSantiago(input: string): { date: string; time: string } {
  try {
    // If input is date-only (YYYY-MM-DD), there is no real time information.
    // JS parses YYYY-MM-DD as UTC 00:00, which becomes the previous day at 21:00 in CLT.
    // For PDFs we prefer showing only the date in that case.
    const isDateOnly = /^\d{4}-\d{2}-\d{2}$/.test((input || "").trim());
    if (isDateOnly) {
      const date = input.split("-").reverse().join("/");
      // If we only have a date, we still show a time. Use the current time in America/Santiago.
      // This keeps the PDF consistent with "Fecha + hora" in UI when the stored value lacks time.
      const nowParts = new Intl.DateTimeFormat("es-CL", {
        timeZone: "America/Santiago",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).formatToParts(new Date());
      const getNow = (t: string) => nowParts.find((p) => p.type === t)?.value || "";
      const time = `${getNow("hour")}:${getNow("minute")}`;
      return { date, time };
    }

    const d = new Date(input);
    if (isNaN(d.getTime())) {
      // Fallback: keep date only if input looks like YYYY-MM-DD
      const [fechaIso] = (input || "").split("T");
      if (/^\d{4}-\d{2}-\d{2}$/.test(fechaIso)) {
        const date = fechaIso.split("-").reverse().join("/");
        return { date, time: "" };
      }
      return { date: input || "", time: "" };
    }

    const parts = new Intl.DateTimeFormat("es-CL", {
      timeZone: "America/Santiago",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).formatToParts(d);

    const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
    const date = `${get("day")}/${get("month")}/${get("year")}`;
    const time = `${get("hour")}:${get("minute")}`;
    return { date, time };
  } catch {
    return { date: input || "", time: "" };
  }
}

function drawHeaderBox(doc: jsPDF, x: number, y: number, w: number, h: number) {
  const prev = doc.getDrawColor();
  doc.setDrawColor(220);
  doc.roundedRect(x, y, w, h, 2, 2, "S");
  doc.setDrawColor(prev as any);
}

function textOrDash(s: string | null | undefined): string {
  const t = (s ?? "").toString().trim();
  return t ? t : "—";
}

function safeUpper(s: string): string {
  return (s || "").toUpperCase();
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
  // Nombre del responsable (usuario que registró el egreso)
  responsable?: { nombre: string; rut?: string | null } | null;
  // Folio visible (si no se provee, usa egreso.id)
  folio?: string | null;
}): Promise<Uint8Array> {
  const { empresa, egreso } = params;

  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const rightX = pageWidth - marginX;
  let y = 12;

  // ─────────────────────────────────────────────
  // Encabezado pro: Solo logo empresa, folio, fecha/hora, empresa, centro, trabajador
  // ─────────────────────────────────────────────

  // Fecha + hora (Santiago)
  const dt = formatDateTimeSantiago(egreso.fecha);
  const folio = (params.folio ?? egreso.id ?? "").toString();

  const headerH = 34;
  drawHeaderBox(doc, marginX, y, pageWidth - marginX * 2, headerH);

  const headerTop = y + 6;

  // Logo empresa (si no hay, usar logo EPP Control por defecto)
  const logoW = 32;
  const logoH = 16;
  const logoX = rightX - logoW - 2;
  const logoY = headerTop - 3;

  let headerLogoDataUrl: string | null = null;

  if (empresa.logo_url) {
    try {
      const base64Logo = await fetchImageAsBase64(empresa.logo_url);
      if (isDataImageUrl(base64Logo)) headerLogoDataUrl = base64Logo;
    } catch {
      headerLogoDataUrl = null;
    }
  }

  // Fallback: EPP Control default logo (/public/logoepp.png)
  if (!headerLogoDataUrl) {
    try {
      const baseUrl = getPublicBaseUrl();
      const fallbackLogo = await fetchImageAsBase64(`${baseUrl}/logoepp.png`);
      if (isDataImageUrl(fallbackLogo)) headerLogoDataUrl = fallbackLogo;
    } catch {
      headerLogoDataUrl = null;
    }
  }

  if (headerLogoDataUrl) {
    const fmt =
      headerLogoDataUrl.includes("data:image/jpeg") ||
      headerLogoDataUrl.includes("data:image/jpg")
        ? "JPEG"
        : "PNG";
    doc.addImage(headerLogoDataUrl, fmt as any, logoX, logoY, logoW, logoH);
  }

  // Header typography
  doc.setTextColor(20);

  // Title
  doc.setFontSize(14);
  doc.setFont("helvetica", "bold");
  doc.text(safeUpper("Comprobante de Entrega de EPP"), marginX + 4, headerTop);

  // Metadata
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);

  doc.text(`Folio: ${folio}`, marginX + 4, headerTop + 7);

  const fechaLinea = dt.time
    ? `Fecha: ${dt.date} ${dt.time} (CLT)`
    : `Fecha: ${dt.date} (CLT)`;
  doc.text(fechaLinea, marginX + 4, headerTop + 13);

  doc.text(`Empresa: ${empresa.nombre}`, marginX + 4, headerTop + 19);
  doc.text(`RUT: ${formatRut(empresa.rut)}`, marginX + 4, headerTop + 24);

  // Reset to normal text color for body
  doc.setTextColor(20);

  y += headerH + 10;

  // Subtle divider
  doc.setDrawColor(230);
  doc.line(marginX, y - 6, pageWidth - marginX, y - 6);
  doc.setDrawColor(200);

  // ─────────────────────────────────────────────
  // Breve texto legal
  // ─────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");

  const fechaTxt = dt.time ? `${dt.date} a las ${dt.time}` : `${dt.date}`;
  const intro =
    `Con fecha ${fechaTxt}, se hace entrega al trabajador(a) ${egreso.trabajador.nombre}, ` +
    `RUT ${formatRut(egreso.trabajador.rut)}, del centro de trabajo ${egreso.trabajador.centro}, ` +
    `de los siguientes Equipos de Protección Personal (EPP):`;

  doc.text(intro, marginX, y, { maxWidth: pageWidth - marginX * 2 });
  y += 14;
  y += 2;

  // ─────────────────────────────────────────────
  // Tabla de EPP (pro)
  // ─────────────────────────────────────────────
  const tableX = marginX;
  const tableW = pageWidth - marginX * 2;
  const colW = [40, 90, 25, tableW - (40 + 90 + 25)]; // last is cantidad

  const rowH = 8;

  // Header row
  doc.setFontSize(10);
  doc.setDrawColor(200);
  doc.setFillColor("#f5f5f5");
  doc.rect(tableX, y, tableW, rowH, "FD");
  // verticals
  let cx = tableX;
  for (let i = 0; i < colW.length - 1; i++) {
    cx += colW[i];
    doc.line(cx, y, cx, y + rowH);
  }

  doc.setFont("helvetica", "bold");
  doc.text("Categoría", tableX + colW[0] / 2, y + 5.5, { align: "center" });
  doc.text("EPP", tableX + colW[0] + colW[1] / 2, y + 5.5, { align: "center" });
  doc.text("Talla", tableX + colW[0] + colW[1] + colW[2] / 2, y + 5.5, { align: "center" });
  doc.text("Cantidad", tableX + colW[0] + colW[1] + colW[2] + colW[3] / 2, y + 5.5, { align: "center" });
  doc.setFont("helvetica", "normal");

  y += rowH;

  // Body rows
  egreso.items.forEach((item) => {
    // page break if needed
    if (y + rowH > 255) {
      doc.addPage();
      y = 20;

      // Re-draw header row on new page
      doc.setFontSize(10);
      doc.setDrawColor(200);
      doc.setFillColor("#f5f5f5");
      doc.rect(tableX, y, tableW, rowH, "FD");
      let cx2 = tableX;
      for (let i = 0; i < colW.length - 1; i++) {
        cx2 += colW[i];
        doc.line(cx2, y, cx2, y + rowH);
      }
      doc.setFont("helvetica", "bold");
      doc.text("Categoría", tableX + colW[0] / 2, y + 5.5, { align: "center" });
      doc.text("EPP", tableX + colW[0] + colW[1] / 2, y + 5.5, { align: "center" });
      doc.text("Talla", tableX + colW[0] + colW[1] + colW[2] / 2, y + 5.5, { align: "center" });
      doc.text("Cantidad", tableX + colW[0] + colW[1] + colW[2] + colW[3] / 2, y + 5.5, { align: "center" });
      doc.setFont("helvetica", "normal");
      y += rowH;
    }

    doc.rect(tableX, y, tableW, rowH);
    let c = tableX;
    for (let i = 0; i < colW.length - 1; i++) {
      c += colW[i];
      doc.line(c, y, c, y + rowH);
    }

    const cat = textOrDash(item.categoria);
    const epp = textOrDash(item.epp);
    const talla = textOrDash(item.tallaNumero ?? null);
    const cant = String(item.cantidad ?? 0);

    // Text (left aligned in cell with padding)
    doc.setFontSize(9);
    doc.text(cat, tableX + 2, y + 5.5, { maxWidth: colW[0] - 4 });
    doc.text(epp, tableX + colW[0] + 2, y + 5.5, { maxWidth: colW[1] - 4 });
    doc.text(talla, tableX + colW[0] + colW[1] + colW[2] / 2, y + 5.5, { align: "center" });
    doc.text(cant, tableX + colW[0] + colW[1] + colW[2] + colW[3] / 2, y + 5.5, { align: "center" });

    y += rowH;
  });

  y += 10;

  // ─────────────────────────────────────────────
  // Declaración de conformidad (EPP, texto exacto)
  // ─────────────────────────────────────────────
  doc.setFontSize(10);
  doc.text(
    "Declaro haber recibido conforme los Equipos de Protección Personal (EPP) indicados, " +
      "en buen estado y adecuados a mis funciones, comprometiéndome a utilizarlos correctamente " +
      "y a mantenerlos en las condiciones exigidas por la normativa vigente.",
    marginX,
    y,
    { maxWidth: pageWidth - marginX * 2 }
  );
  y += 18;

  // ─────────────────────────────────────────────
  // Firma: imagen, luego nombre y rut trabajador
  // ─────────────────────────────────────────────
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.text("Firma del trabajador", marginX, y);
  doc.setFont("helvetica", "normal");
  y += 6;

  let firmaImgDrawn = false;
  if (egreso.firmaBase64) {
    const normalizedFirma = normalizeBase64Image(egreso.firmaBase64);
    if (isDataImageUrl(normalizedFirma)) {
      // Si es JPG, jsPDF requiere el tipo correcto
      const fmt = normalizedFirma.includes("data:image/jpeg") || normalizedFirma.includes("data:image/jpg") ? "JPEG" : "PNG";
      doc.addImage(normalizedFirma, fmt as any, marginX, y, 60, 25);
      y += 25 + 6;
      firmaImgDrawn = true;
    }
  }
  // If no image, just continue below

  const firmaX = marginX;
  const firmaW = 60;
  const firmaCenterX = firmaX + firmaW / 2;

  doc.setFontSize(9);
  if (firmaImgDrawn) {
    doc.text(`${egreso.trabajador.nombre}`, firmaCenterX, y, { align: "center" });
    y += 4;
    doc.text(`RUT: ${formatRut(egreso.trabajador.rut)}`, firmaCenterX, y, { align: "center" });
    y += 6;
  } else {
    doc.text(`${egreso.trabajador.nombre}`, marginX, y);
    y += 4;
    doc.text(`RUT: ${formatRut(egreso.trabajador.rut)}`, marginX, y);
    y += 6;
  }

  {
    doc.setFontSize(9);
    doc.setTextColor(60);

    const respNombre = (params.responsable?.nombre || "").trim() || "—";
    const rr = params.responsable?.rut
      ? ` (${formatRut(params.responsable.rut)})`
      : "";
    const respLine = `Responsable de entrega: ${respNombre}${rr}`;
    doc.text(respLine, pageWidth - marginX, y, { align: "right" });

    doc.setTextColor(20);
    y += 6;
  }

  // ─────────────────────────────────────────────
  // Footer: logo EPP Control, legal, paginación
  // ─────────────────────────────────────────────
  // Cargamos el logo de EPP Control desde URL pública (NO rutas locales: evita allowFsRead)
  let eppLogoDataUrl: string | null = null;
  try {
    const baseUrl = getPublicBaseUrl();
    eppLogoDataUrl = await fetchImageAsBase64(`${baseUrl}/logoepp.png`);
  } catch {
    eppLogoDataUrl = null;
  }

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const footerY = doc.internal.pageSize.getHeight() - 40;
    // Logo EPP Control centrado
    if (isDataImageUrl(eppLogoDataUrl)) {
      doc.addImage(eppLogoDataUrl, "PNG", pageWidth / 2 - 12, footerY + 1, 24, 10);
    }

    doc.setTextColor(110);
    doc.setFontSize(8);
    doc.text(
      "Este documento ha sido generado electrónicamente y no requiere firma manuscrita adicional.",
      pageWidth / 2,
      footerY + 14,
      { align: "center" }
    );

    doc.setFontSize(9);
    doc.text(
      "EPP Control — Gestión inteligente de EPP",
      pageWidth / 2,
      footerY + 20,
      { align: "center" }
    );

    doc.setFontSize(8);
    doc.text("www.eppcontrol.cl", pageWidth / 2, footerY + 25, {
      align: "center",
    });
    doc.setTextColor(80);

    doc.text(
      `Página ${i} de ${pageCount}`,
      pageWidth - marginX,
      footerY + 29,
      { align: "right" }
    );
    doc.setTextColor(20);
  }

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
  if (!res.ok) throw new Error(`Failed to fetch image: ${res.status}`);
  const buf = await res.arrayBuffer();
  const b64 = arrayBufferToBase64(buf);
  // Infer PNG by default (most of our assets). If the server sends a content-type, use it.
  const ct = res.headers.get("content-type") || "image/png";
  const mime = ct.includes("jpeg") || ct.includes("jpg") ? "image/jpeg" : "image/png";
  return `data:${mime};base64,${b64}`;
}
