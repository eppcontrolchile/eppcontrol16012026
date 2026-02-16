// app/api/stock/ingresos/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET(req: NextRequest) {
  const cookieStore = await cookies();

  // Env var guards
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Missing public Supabase env vars" },
      { status: 500 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing server env var SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  // Pagination params
  const { searchParams } = new URL(req.url);
  const limitRaw = searchParams.get("limit");
  const offsetRaw = searchParams.get("offset");

  const limitParsed = Number(limitRaw);
  const offsetParsed = Number(offsetRaw);

  const limit = Number.isFinite(limitParsed)
    ? Math.min(Math.max(limitParsed, 1), 500)
    : 200;

  const offset = Number.isFinite(offsetParsed) ? Math.max(offsetParsed, 0) : 0;

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
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
    }
  );

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // Resolve empresa_id from usuario (schema confirmado: usuarios.auth_user_id)
  const { data: usuario, error: usuarioError } = await supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (usuarioError) {
    return NextResponse.json({ error: usuarioError.message }, { status: 500 });
  }

  if (!usuario?.empresa_id) {
    return NextResponse.json(
      { error: "Empresa no encontrada" },
      { status: 404 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from("lotes_epp")
    .select(
      "id, empresa_id, usuario_id, fecha_ingreso, categoria, nombre_epp, talla, cantidad_inicial, cantidad_disponible, costo_unitario_iva, anulado, anulado_at, anulado_por, anulado_motivo, created_at"
    )
    .eq("empresa_id", usuario.empresa_id)
    .order("fecha_ingreso", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Enriquecer con compra (si existe) vía ingresos_compra_detalle -> ingresos_compra
  const lotes = Array.isArray(data) ? data : [];
  const loteIds = lotes.map((l: any) => l.id).filter(Boolean);

  const compraPorLote = new Map<string, any>();

  if (loteIds.length) {
    try {
      const { data: det, error: detErr } = await (supabaseAdmin as any)
        .from("ingresos_compra_detalle")
        .select(
          `
          lote_id,
          compra:ingresos_compra (
            id,
            tipo_documento,
            numero_documento,
            fecha_documento,
            proveedor_rut,
            proveedor_nombre,
            created_at
          )
        `
        )
        .in("lote_id", loteIds);

      if (!detErr && Array.isArray(det)) {
        for (const row of det) {
          const lid = row?.lote_id;
          const compra = row?.compra ?? null;
          if (lid && compra && !compraPorLote.has(lid)) {
            compraPorLote.set(lid, compra);
          }
        }
      }
    } catch {
      // no romper el historial si falla la trazabilidad
    }
  }

  const enriched = lotes.map((l: any) => ({
    ...l,
    compra: compraPorLote.get(l.id) ?? null,
  }));

  const res = NextResponse.json(enriched || [], { status: 200 });
  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Page-Limit", String(limit));
  res.headers.set("X-Page-Offset", String(offset));
  return res;
}
