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
  pdfBlob: Blob;
}) {
  const { empresa_id, egreso_id, pdfBlob } = params;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const filePath = `empresas/${empresa_id}/egresos/${egreso_id}.pdf`;

  const { error } = await supabase.storage
    .from("egresos-pdf")
    .upload(filePath, pdfBlob, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (error) {
    console.error("STORAGE PDF ERROR:", error);
    throw new Error("Error guardando PDF en Storage");
  }

  return {
    path: filePath,
  };
}
