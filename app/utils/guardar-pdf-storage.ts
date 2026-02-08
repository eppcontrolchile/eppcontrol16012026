// app/utils/guardar-pdf-storage.ts

import { createClient } from "@supabase/supabase-js";

/**
 * Guarda un PDF de egreso en Supabase Storage
 * Bucket: egresos-pdf
 * Ruta: empresas/{empresa_id}/egresos/{egreso_id}.pdf
 */
export async function guardarPdfEnStorage(params: {
  empresa_id: string;
  egreso_id: string;
  // Acepta Buffer (Node) o Uint8Array (Node/Edge-safe)
  pdfBuffer: Buffer | Uint8Array;
}) {
  const { empresa_id, egreso_id, pdfBuffer } = params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const filePath = `empresas/${empresa_id}/egresos/${egreso_id}.pdf`;

  // Normaliza a Buffer cuando exista (Node) para máxima compatibilidad
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const B: any = (globalThis as any).Buffer;
  const data = typeof B !== "undefined" && !(pdfBuffer instanceof B)
    ? B.from(pdfBuffer)
    : pdfBuffer;

  const { error } = await supabase.storage
    .from("egresos-pdf")
    .upload(filePath, data as any, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    console.error("STORAGE PDF ERROR:", error);
    throw new Error("Error guardando PDF en Storage");
  }

  // Obtener URL pública (bucket público)
  const { data: publicData } = supabase.storage
    .from("egresos-pdf")
    .getPublicUrl(filePath);

  const publicUrl = publicData?.publicUrl ?? null;

  return {
    path: filePath,
    publicUrl,
  };
}
