// app/api/stock/catalogo/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const IMPERSONATE_COOKIE = "epp_impersonate";

function safeJsonParse<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

type CatalogoRow = {
  id: string;
  categoria: string;
  nombre_epp: string;
  marca: string | null;
  modelo: string | null;
  talla: string | null;
  stock_actual: number;
};

export async function GET() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return NextResponse.json(
        { error: "Faltan variables de entorno de Supabase" },
        { status: 500 }
      );
    }

    const cookieStore = await cookies();

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
            // no-op
          }
        },
      },
    });

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: me, error: meErr } = await admin
      .from("usuarios")
      .select("empresa_id, rol, activo")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (meErr || !me?.empresa_id) {
      return NextResponse.json(
        { error: "No se pudo resolver empresa del usuario" },
        { status: 400 }
      );
    }

    if (me.activo === false) {
      return NextResponse.json({ error: "Usuario inactivo" }, { status: 403 });
    }

    let empresaId = String(me.empresa_id);

    const impRaw = cookieStore.get(IMPERSONATE_COOKIE)?.value;
    if (impRaw && String(me.rol ?? "").toLowerCase() === "superadmin") {
      const parsed = safeJsonParse<{ empresa_id?: string | null }>(impRaw);
      const impEmpresaId = String(parsed?.empresa_id ?? "").trim();
      if (impEmpresaId) {
        empresaId = impEmpresaId;
      }
    }

    const { data: catalogoData, error: catalogoErr } = await admin
      .from("catalogo_epp")
      .select("id, categoria, nombre_epp, marca, modelo, talla")
      .eq("empresa_id", empresaId)
      .order("categoria", { ascending: true })
      .order("nombre_epp", { ascending: true });

    if (catalogoErr) {
      return NextResponse.json({ error: catalogoErr.message }, { status: 500 });
    }

    const { data: lotesData, error: lotesErr } = await admin
      .from("lotes_epp")
      .select("producto_id, cantidad_disponible, anulado")
      .eq("empresa_id", empresaId);

    if (lotesErr) {
      return NextResponse.json({ error: lotesErr.message }, { status: 500 });
    }

    const stockMap = new Map<string, number>();
    const productosConLoteNoAnulado = new Set<string>();

    for (const lote of lotesData ?? []) {
      const productoId = String((lote as any)?.producto_id ?? "").trim();
      if (!productoId) continue;

      const anulado = Boolean((lote as any)?.anulado ?? false);
      const disponible = Number((lote as any)?.cantidad_disponible ?? 0);

      if (!anulado) {
        productosConLoteNoAnulado.add(productoId);
        stockMap.set(productoId, (stockMap.get(productoId) ?? 0) + (Number.isFinite(disponible) ? disponible : 0));
      }
    }

    const rows: CatalogoRow[] = (catalogoData ?? [])
      .map((r: any) => ({
        id: String(r?.id ?? ""),
        categoria: String(r?.categoria ?? ""),
        nombre_epp: String(r?.nombre_epp ?? ""),
        marca: r?.marca ?? null,
        modelo: r?.modelo ?? null,
        talla: r?.talla ?? null,
        stock_actual: stockMap.get(String(r?.id ?? "")) ?? 0,
      }))
      // no mostrar productos cuyo historial quedó solo en lotes anulados
      .filter((r) => productosConLoteNoAnulado.has(r.id));

    return NextResponse.json({ rows }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Error inesperado al cargar catálogo" },
      { status: 500 }
    );
  }
}
