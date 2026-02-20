// app/api/egresos/route.ts
// API de egresos – C6
// Orquestador backend: delega FIFO y transacción 100% a PostgreSQL

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { generarPdfEntrega } from "@/utils/entrega-pdf";
import { guardarPdfEnStorage } from "@/utils/guardar-pdf-storage";
import { enviarCorreosEgreso } from "@/utils/enviar-mail-egreso";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;


function isUuid(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function decodeBase64UrlJson(v: string): any | null {
  try {
    const json = Buffer.from(String(v || ""), "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getImpersonatedEmpresaId(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const compat = cookieStore.get("impersonate_empresa_id")?.value;
  if (compat && isUuid(compat)) return compat;

  const packed = cookieStore.get("epp_impersonate")?.value;
  if (packed) {
    const obj = decodeBase64UrlJson(packed);
    const eid = obj?.empresa_id;
    if (eid && isUuid(eid)) return String(eid);
  }

  return null;
}

function isAllowedRemoteAssetUrl(input: string, supabaseUrl: string): boolean {
  try {
    const u = new URL(input);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;

    const supaHost = new URL(supabaseUrl).host;

    // Allow same-host assets (typical: https://<project>.supabase.co/storage/v1/object/public/..)
    if (u.host === supaHost) {
      return u.pathname.includes("/storage/v1/object/public/");
    }

    // Allow common Supabase public storage host pattern, but still require storage public path
    if (u.host.endsWith(".supabase.co")) {
      return u.pathname.includes("/storage/v1/object/public/");
    }

    return false;
  } catch {
    return false;
  }
}

async function urlToDataUrl(input: string | null | undefined, supabaseUrl: string): Promise<string | null> {
  if (!input) return null;

  // Already a data URL
  if (input.startsWith("data:")) return input;

  // Only allow safe Supabase Storage public URLs. Never pass local paths to the PDF generator.
  if (!/^https?:\/\//i.test(input)) return null;
  if (!isAllowedRemoteAssetUrl(input, supabaseUrl)) return null;

  const res = await fetch(input);
  if (!res.ok) {
    throw new Error(`No se pudo descargar recurso para PDF (${res.status})`);
  }

  const contentType = res.headers.get("content-type") || "application/octet-stream";
  const ab = await res.arrayBuffer();
  const b64 = Buffer.from(ab).toString("base64");
  return `data:${contentType};base64,${b64}`;
}

/**
 * POST /api/egresos
 * Flujo:
 * 1. Validar payload
 * 2. Ejecutar registrar_egreso_fifo (RPC)
 * 3. Retornar resultado
 */
export async function POST(req: NextRequest) {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return NextResponse.json(
      { error: "Faltan variables de entorno de Supabase" },
      { status: 500 }
    );
  }

  // Auth client (reads session cookie)
  const supabaseAuth = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // ignore
        }
      },
    },
  });

  // Admin client (bypasses RLS)
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  // Validate session
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const idempotencyKey = req.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      return NextResponse.json(
        { error: "Falta Idempotency-Key en el header" },
        { status: 400 }
      );
    }

    const { data: usuarioRow, error: usuarioErr } = await supabase
      .from("usuarios")
      .select("id, empresa_id, rol, activo, email, centro_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (usuarioErr) {
      return NextResponse.json({ error: usuarioErr.message }, { status: 500 });
    }

    if (!usuarioRow?.id || !usuarioRow?.empresa_id) {
      return NextResponse.json({ error: "Usuario no válido" }, { status: 403 });
    }

    if (usuarioRow.activo === false) {
      return NextResponse.json({ error: "Usuario bloqueado" }, { status: 403 });
    }

    // En egresos, permitimos roles operativos con impacto en stock
    const rol = String(usuarioRow.rol ?? "").toLowerCase();
    const canEgreso =
      rol === "admin" ||
      rol === "bodega" ||
      rol === "jefe_area" ||
      rol === "supervisor_terreno" ||
      rol === "superadmin";

    if (!canEgreso) {
      return NextResponse.json({ error: "Permisos insuficientes" }, { status: 403 });
    }

    // Empresa efectiva (soporte/impersonación): si soy superadmin y hay cookie, uso esa empresa
    const impersonEmpresa = getImpersonatedEmpresaId(cookieStore);
    const empresa_id = (rol === "superadmin" && impersonEmpresa)
      ? impersonEmpresa
      : String(usuarioRow.empresa_id);

    const usuario_id = String(usuarioRow.id);

    const { trabajador_id, centro_id, firma_url, items } = body;

    // Determinar fuente real de descuento según rol
    let fromCentroId: string | null = null;

    if (rol === "supervisor_terreno") {
      if (!usuarioRow.centro_id) {
        return NextResponse.json(
          { error: "Supervisor sin centro asignado" },
          { status: 403 }
        );
      }

      fromCentroId = String(usuarioRow.centro_id);
    } else {
      // Todos los demás descuentan desde Inventario Empresa (global)
      fromCentroId = null;
    }

    // ─────────────────────────────────────────────
    // 1️⃣ Validaciones mínimas
    // ─────────────────────────────────────────────
    if (
      !empresa_id ||
      !usuario_id ||
      !trabajador_id ||
      !centro_id ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      return NextResponse.json(
        { error: "Payload incompleto" },
        { status: 400 }
      );
    }

    // ─────────────────────────────────────────────
    // Validación explícita de cada item en items (marca/modelo opcional)
    // ─────────────────────────────────────────────
    for (const item of items) {
      const categoriaOk = item && typeof item.categoria === "string" && item.categoria.trim() !== "";
      const nombreOk = item && typeof item.nombre_epp === "string" && item.nombre_epp.trim() !== "";
      const cantidadOk = item && typeof item.cantidad === "number" && item.cantidad > 0;

      const marcaOk = item?.marca == null || typeof item.marca === "string";
      const modeloOk = item?.modelo == null || typeof item.modelo === "string";

      if (!categoriaOk || !nombreOk || !cantidadOk || !marcaOk || !modeloOk) {
        return NextResponse.json(
          { error: "Item inválido en items" },
          { status: 400 }
        );
      }
    }

    // Prepara lookup para fallback de marca/modelo en PDF
    const reqMetaByKey = new Map<string, { marca: string | null; modelo: string | null }>();
    for (const it of items) {
      const cat = String(it.categoria ?? "").trim();
      const nom = String(it.nombre_epp ?? "").trim();
      const talla = it.talla != null ? String(it.talla).trim() : "";
      const marca = it.marca != null && String(it.marca).trim() ? String(it.marca).trim() : null;
      const modelo = it.modelo != null && String(it.modelo).trim() ? String(it.modelo).trim() : null;
      const key = `${cat}||${nom}||${talla}`;
      if (!reqMetaByKey.has(key)) reqMetaByKey.set(key, { marca, modelo });
    }

    // ─────────────────────────────────────────────
    // 2️⃣ Ejecutar FIFO productivo en PostgreSQL
    // ─────────────────────────────────────────────
    const { data, error } = await supabase.rpc(
      "registrar_egreso_fifo",
      {
        p_empresa_id: empresa_id,
        p_usuario_id: usuario_id,
        p_trabajador_id: trabajador_id,
        p_centro_id: centro_id,
        p_firma_url: firma_url,
        p_items: items,
        p_idempotency_key: idempotencyKey,
        p_from_centro_id: fromCentroId,
      }
    );

    if (error) {
      console.error("RPC FIFO ERROR:", error);
      return NextResponse.json(
        { error: error.message || "Error ejecutando egreso FIFO" },
        { status: 500 }
      );
    }

    if (!data) {
      console.error("RPC FIFO ERROR: No data returned");
      return NextResponse.json(
        { error: "No se recibió respuesta del servidor" },
        { status: 500 }
      );
    }

    // Supabase RPC puede devolver object, array (1 row), o wrapper según configuración
    const rpcResult: any = Array.isArray(data) ? data[0] : data;

    const entregaId: string | undefined =
      rpcResult?.entrega_id ??
      rpcResult?.entregaId ??
      rpcResult?.id ??
      rpcResult?.entrega?.id;

    if (!entregaId) {
      console.error("RPC FIFO ERROR: entrega_id missing", { data });
      return NextResponse.json(
        { error: "El servidor no devolvió entrega_id desde registrar_egreso_fifo" },
        { status: 500 }
      );
    }

    // ─────────────────────────────────────────────
    // 2️⃣.1 Generar PDF automático post-RPC
    // ─────────────────────────────────────────────

    let pdfPath: string | null = null;

    // Se usan también para correos (solo si el PDF se genera OK)
    let empresaRel: any = null;
    let trabajadorRel: any = null;
    let centroRel: any = null;

    try {
      // data debe traer: entrega_id, total_unidades, costo_total_iva
      // Obtener datos completos de la entrega para el PDF
      const { data: entregaData, error: entregaError } = await supabase
        .from("entregas")
        .select(`
          id,
          fecha_entrega,
          firma_url,
          costo_total_iva,
          total_unidades,
          empresas:empresa_id ( nombre, rut, logo_url ),
          trabajadores:trabajador_id ( nombre, rut, email ),
          centros_trabajo:centro_id ( nombre ),
          entrega_items (
            categoria,
            nombre_epp,
            talla,
            cantidad,
            lote_id,
            lotes_epp:lote_id ( marca, modelo )
          )
        `)
        .eq("id", entregaId)
        .single();

      if (entregaError || !entregaData) {
        console.error("PDF ERROR: no entregaData", { entregaId, entregaError });
        throw new Error(
          `No se pudo obtener la entrega para generar el PDF (entrega_id=${entregaId})` +
            (entregaError?.message ? `: ${entregaError.message}` : "")
        );
      }

      // Normalizar relaciones: a veces llegan como objeto, a veces como array (según typing/joins)
      empresaRel = Array.isArray((entregaData as any).empresas)
        ? (entregaData as any).empresas[0]
        : (entregaData as any).empresas;

      trabajadorRel = Array.isArray((entregaData as any).trabajadores)
        ? (entregaData as any).trabajadores[0]
        : (entregaData as any).trabajadores;

      centroRel = Array.isArray((entregaData as any).centros_trabajo)
        ? (entregaData as any).centros_trabajo[0]
        : (entregaData as any).centros_trabajo;

      // Responsable de entrega (usuario que registró el egreso)
      let responsable: { nombre: string; rut?: string | null } | null = null;
      try {
        const { data: respUser } = await supabase
          .from("usuarios")
          .select("nombre")
          .eq("id", usuario_id)
          .maybeSingle();

        if (respUser?.nombre) {
          responsable = { nombre: respUser.nombre };
        }
      } catch {
        // non-blocking
        responsable = null;
      }

      // Normalizar imágenes para el PDF:
      // - jsPDF no debe recibir rutas locales (provocan error "allowFsRead")
      // - Convertimos URLs http(s) a data URL base64
      const logoDataUrl = await urlToDataUrl(empresaRel?.logo_url ?? null, supabaseUrl);
      const firmaDataUrl = await urlToDataUrl(entregaData.firma_url ?? null, supabaseUrl);

      // Armar estructura PDF
      const pdfBuffer = await generarPdfEntrega({
        responsable,
        empresa: {
          nombre: empresaRel?.nombre,
          rut: empresaRel?.rut,
          logo_url: logoDataUrl ?? undefined,
        },
        egreso: {
          id: entregaData.id,
          fecha: entregaData.fecha_entrega,
          trabajador: {
            nombre: trabajadorRel?.nombre,
            rut: trabajadorRel?.rut,
            centro: centroRel?.nombre,
          },
          items: (Array.isArray((entregaData as any).entrega_items) ? (entregaData as any).entrega_items : []).map((i: any) => {
            const cat = String(i?.categoria ?? "").trim();
            const nom = String(i?.nombre_epp ?? "").trim();
            const talla = i?.talla != null ? String(i.talla).trim() : "";
            const key = `${cat}||${nom}||${talla}`;

            const fallback = reqMetaByKey.get(key);

            // `lotes_epp:lote_id ( marca, modelo )` may come as object or as single-item array
            const loteRel = Array.isArray(i?.lotes_epp) ? i.lotes_epp[0] : i?.lotes_epp;

            const marcaFromLote =
              loteRel?.marca != null && String(loteRel.marca).trim()
                ? String(loteRel.marca).trim()
                : null;

            const modeloFromLote =
              loteRel?.modelo != null && String(loteRel.modelo).trim()
                ? String(loteRel.modelo).trim()
                : null;

            const marca = marcaFromLote ?? (fallback?.marca ?? null);
            const modelo = modeloFromLote ?? (fallback?.modelo ?? null);

            const mm = [marca, modelo].filter(Boolean).join(" - ");
            const eppLabel = mm ? `${nom} (${mm})` : nom;

            return {
              categoria: i.categoria,
              epp: eppLabel,
              tallaNumero: i.talla,
              cantidad: i.cantidad,
            };
          }),
          // Si no hay firma o no es http(s)/data URL, se deja null para que el PDF no intente leer FS
          firmaBase64: firmaDataUrl,
        },
      });

      // Guardar PDF en Storage
      const { path, publicUrl } = await guardarPdfEnStorage({
        empresa_id,
        egreso_id: entregaId,
        pdfBuffer: Buffer.from(pdfBuffer),
      });

      pdfPath = publicUrl ?? path;

      // Persistir URL del PDF en la entrega
      const { error: pdfUpdateError } = await supabase
        .from("entregas")
        .update({ pdf_url: publicUrl ?? path })
        .eq("id", entregaId);

      if (pdfUpdateError) {
        throw new Error("No se pudo guardar la URL del PDF");
      }
    } catch (pdfErr) {
      console.error("PDF ERROR (non-blocking):", pdfErr);
    }

    // ─────────────────────────────────────────────
    // 2️⃣.2 Envío de correos post-egreso (D4)
    // ─────────────────────────────────────────────
    if (pdfPath) {
      if (!empresaRel || !trabajadorRel) {
        console.warn("EMAIL SKIPPED: missing empresaRel/trabajadorRel", { entregaId, pdfPath });
        // Continue without failing
      } else {
        try {
          // Resolver email del admin (usuario que registró el egreso). Si no existe, no enviamos.
          let emailAdmin: string | null = (usuarioRow as any)?.email ?? null;

          if (!emailAdmin) {
            const { data: usuarioMail } = await supabase
              .from("usuarios")
              .select("email")
              .eq("id", usuario_id)
              .maybeSingle();

            emailAdmin = usuarioMail?.email ?? null;
          }

          if (!emailAdmin) {
            console.warn("EMAIL SKIPPED: admin email missing", { entregaId, pdfPath });
          } else {
            enviarCorreosEgreso({
              pdf_url: pdfPath,
              empresa: {
                nombre: empresaRel?.nombre,
              },
              trabajador: {
                nombre: trabajadorRel?.nombre,
                rut: trabajadorRel?.rut,
                email: trabajadorRel?.email ?? null,
              },
              emailAdmin,
            }).catch((err) => {
              console.error("ERROR ENVÍO CORREOS EGRESO (non-blocking):", {
                entregaId,
                pdfPath,
                err,
              });
            });
          }
        } catch (mailError) {
          // No rompe el flujo principal del egreso
          console.error("ERROR ENVÍO CORREOS EGRESO:", mailError);
        }
      }
    }

    // ─────────────────────────────────────────────
    // 3️⃣ Respuesta
    // ─────────────────────────────────────────────
    const res = NextResponse.json(
      {
        ok: true,
        entrega_id: entregaId,
        pdf_url: pdfPath,
        pdf_status: pdfPath ? "ok" : "failed",
        ...rpcResult,
      },
      { status: 201 }
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (err: any) {
    console.error("EGRESOS API ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Error inesperado en egresos" },
      { status: 500 }
    );
  }
}
