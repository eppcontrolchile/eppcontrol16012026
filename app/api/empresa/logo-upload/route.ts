//app/api/empresa/logo-upload/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

// Fuerza runtime Node (mejor compatibilidad con formData/file)
export const runtime = "nodejs";

function getAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  });
}

function isImage(mime: string) {
  return mime.startsWith("image/");
}

export async function POST(req: Request) {
  try {
    // 1) Auth del usuario (via cookies) para asegurar que sea usuario válido
    const cookieStore = await cookies();

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    const { data: userData, error: userErr } = await supabaseAuth.auth.getUser();
    if (userErr || !userData?.user) {
      return NextResponse.json({ error: "No autorizado" }, { status: 401 });
    }

    const userId = userData.user.id;

    // 2) Leer empresa_id y rol desde tu tabla usuarios
    // Ajusta nombres si tu tabla difiere (pero en tu proyecto suele ser 'usuarios')
    const admin = getAdminClient();

    // 2) Leer empresa_id y rol desde tu tabla usuarios.
    // En algunos esquemas el auth UID no coincide con `usuarios.id` (puede estar en `user_id` o `auth_user_id`).
    const tryCols: string[] = ["id", "user_id", "auth_user_id"]; // keep loose typing to avoid TS deep instantiation

    let urow: { id: string; empresa_id: string; rol: string | null; activo: boolean | null } | null = null;
    let lastErr: any = null;

    // Supabase generics can trigger “excessively deep” inference when using dynamic column names.
    // Use `any` for this small lookup block.
    const usuarios: any = admin.from("usuarios");

    for (const col of tryCols) {
      const { data, error } = await usuarios
        .select("id, empresa_id, rol, activo")
        .eq(col, userId)
        .maybeSingle();

      if (error) {
        lastErr = error;
        continue;
      }

      if (data) {
        urow = data as any;
        break;
      }
    }

    if (!urow?.empresa_id) {
      return NextResponse.json(
        {
          error: "Usuario no válido",
          detail: lastErr?.message || "No se encontró registro en usuarios para el usuario autenticado",
        },
        { status: 403 }
      );
    }

    // Si manejas activo/inactivo
    if (urow.activo === false) {
      return NextResponse.json({ error: "Usuario bloqueado" }, { status: 403 });
    }

    // Solo Admin puede cambiar logo
    if (urow.rol !== "admin") {
      return NextResponse.json({ error: "Sin permisos" }, { status: 403 });
    }

    // 3) Leer multipart/form-data
    const form = await req.formData();
    const file = form.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Archivo no recibido" }, { status: 400 });
    }

    if (!isImage(file.type)) {
      return NextResponse.json({ error: "El archivo debe ser una imagen" }, { status: 400 });
    }

    const maxBytes = 2 * 1024 * 1024; // 2MB
    if (file.size > maxBytes) {
      return NextResponse.json({ error: "El logo no puede superar 2MB" }, { status: 400 });
    }

    const empresaId = urow.empresa_id as string;

    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const safeExt = ext.length <= 5 ? ext : "png";
    const path = `${empresaId}/${Date.now()}.${safeExt}`;

    const bucket = "company-logos";

    // 4) Subir a Storage con Service Role (bypassa RLS)
    const arrayBuffer = await file.arrayBuffer();
    const buffer = new Uint8Array(arrayBuffer);

    const { error: upErr } = await admin.storage.from(bucket).upload(path, buffer, {
      contentType: file.type,
      upsert: true,
      cacheControl: "3600",
    });

    if (upErr) {
      return NextResponse.json({ error: upErr.message || "Error subiendo logo" }, { status: 500 });
    }

    const { data: pub } = admin.storage.from(bucket).getPublicUrl(path);
    const logoUrl = pub?.publicUrl || "";

    if (!logoUrl) {
      return NextResponse.json({ error: "No se pudo obtener URL pública" }, { status: 500 });
    }

    // 5) Persistir en empresas.logo_url
    const { data: empresa, error: eerr } = await admin
      .from("empresas")
      .update({ logo_url: logoUrl })
      .eq("id", empresaId)
      .select("id,nombre,rut,plan_tipo,logo_url,email_alertas,alertas_activas,stock_critico_activo,frecuencia_alertas,email_gerencia")
      .single();

    if (eerr || !empresa) {
      return NextResponse.json({ error: "No se pudo guardar logo en empresa" }, { status: 500 });
    }

    return NextResponse.json({ logo_url: logoUrl, empresa });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Error inesperado" }, { status: 500 });
  }
}
