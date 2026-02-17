// app/api/stock/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

const IMPERSONATE_COOKIE = "epp_impersonate";

function safeJsonParse<T = any>(s: string): T | null {
  try {
    return JSON.parse(s) as T;
  } catch {
    return null;
  }
}

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

type StockOutRow = {
  id: string; // empresa_id|categoria|nombre_epp|talla (legacy format kept)
  variant_key?: string; // categoria|nombre|marca|modelo|talla (unique per variant)
  categoria: string;
  nombre: string;
  marca: string | null;
  modelo: string | null;
  talla: string | null;
  stock_total: number;
  stock_critico: number;
};

export async function GET(_req: NextRequest) {
  try {
    if (
      !process.env.NEXT_PUBLIC_SUPABASE_URL ||
      !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      !process.env.SUPABASE_SERVICE_ROLE_KEY
    ) {
      return NextResponse.json({ error: "Missing server env vars" }, { status: 500 });
    }

    // 1) Auth por cookie session
    const cookieStore = await cookies();
    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll: () => cookieStore.getAll(),
          setAll: (cookiesToSet) => {
            try {
              cookiesToSet.forEach(({ name, value, options }) => {
                cookieStore.set(name, value, options);
              });
            } catch {
              // no-op
            }
          },
        },
      }
    );

    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "No auth" }, { status: 401 });
    }

    // 2) Service role (para resolver "me" sin depender de RLS)
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 2.1) Resolver empresa_id/rol desde usuarios (server-side)
    const { data: me, error: meErr } = await admin
      .from("usuarios")
      .select("empresa_id, activo, rol")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (meErr || !me) {
      return NextResponse.json({ error: "Missing usuario/empresa" }, { status: 400 });
    }

    if (me.activo === false) {
      return NextResponse.json({ error: "Inactive" }, { status: 403 });
    }

    let empresaId = me.empresa_id as string;
    if (!empresaId) {
      return NextResponse.json({ error: "Missing usuario/empresa" }, { status: 400 });
    }

    // 2.2) Impersonación (solo superadmin): permite scoping por otra empresa
    const impRaw = cookieStore.get(IMPERSONATE_COOKIE)?.value;
    if (impRaw && String(me.rol ?? "").toLowerCase() === "superadmin") {
      const parsed = safeJsonParse<{ empresa_id?: string | null }>(impRaw);
      const impEmpresa = String(parsed?.empresa_id ?? "").trim();
      if (impEmpresa) empresaId = impEmpresa;
    }

    // 3) A partir de aquí, SIEMPRE scopiado por empresaId

    // 3.1) Lotes NO anulados y disponibles > 0
    const { data: lots, error: lotsErr } = await admin
      .from("lotes_epp")
      .select("categoria,nombre_epp,talla,marca,modelo,cantidad_disponible")
      .eq("empresa_id", empresaId)
      .eq("anulado", false)
      .gt("cantidad_disponible", 0);

    if (lotsErr) {
      return NextResponse.json({ error: lotsErr.message }, { status: 500 });
    }

    // 3.2) Stock críticos por empresa
    const { data: crits, error: critErr } = await admin
      .from("stock_criticos")
      .select("categoria,nombre_epp,talla,stock_critico")
      .eq("empresa_id", empresaId);

    if (critErr) {
      return NextResponse.json({ error: critErr.message }, { status: 500 });
    }

    const critMap = new Map<string, number>();
    for (const c of crits ?? []) {
      const categoria = String((c as any).categoria ?? "");
      const nombre = String((c as any).nombre_epp ?? "");
      const tallaRaw = String((c as any).talla ?? "");
      const talla = tallaRaw.trim() === "" ? null : tallaRaw;
      const key = `${categoria}||${nombre}||${talla ?? ""}`;
      const v = Number((c as any).stock_critico ?? 0);
      critMap.set(key, Number.isFinite(v) ? v : 0);
    }

    // 4) Agregación por categoria/nombre/talla usando cantidad_disponible
    const agg = new Map<
      string,
      {
        categoria: string;
        nombre: string;
        marca: string | null;
        modelo: string | null;
        talla: string | null;
        stock_total: number;
      }
    >();

    for (const r of lots ?? []) {
      const categoria = String((r as any).categoria ?? "");
      const nombre = String((r as any).nombre_epp ?? "");
      const tallaRaw = (r as any).talla;
      const talla =
        tallaRaw == null || String(tallaRaw).trim() === "" ? null : String(tallaRaw);

      const marcaRaw = (r as any).marca;
      const modeloRaw = (r as any).modelo;

      const marca =
        marcaRaw == null || String(marcaRaw).trim() === "" ? null : String(marcaRaw).trim();
      const modelo =
        modeloRaw == null || String(modeloRaw).trim() === "" ? null : String(modeloRaw).trim();

      const qty = Number((r as any).cantidad_disponible ?? 0);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const key = `${categoria}||${nombre}||${marca ?? ""}||${modelo ?? ""}||${talla ?? ""}`;
      const prev = agg.get(key);
      if (!prev) {
        agg.set(key, { categoria, nombre, marca, modelo, talla, stock_total: qty });
      } else {
        prev.stock_total += qty;
      }
    }

    const out: StockOutRow[] = Array.from(agg.values()).map((x) => {
      const key = `${x.categoria}||${x.nombre}||${x.talla ?? ""}`;
      const stockCritico = critMap.get(key) ?? 0;

      // el id mantiene el formato que usa /api/stock/[id]/critico
      const tallaForId = x.talla ?? "";

      const variantKey = `${x.categoria}|${x.nombre}|${x.marca ?? ""}|${x.modelo ?? ""}|${tallaForId}`;

      return {
        id: `${empresaId}|${x.categoria}|${x.nombre}|${tallaForId}`,
        variant_key: variantKey,
        categoria: x.categoria,
        nombre: x.nombre,
        marca: x.marca ?? null,
        modelo: x.modelo ?? null,
        talla: x.talla,
        stock_total: x.stock_total,
        stock_critico: stockCritico,
      };
    });

    out.sort(
      (a, b) =>
        a.categoria.localeCompare(b.categoria) ||
        a.nombre.localeCompare(b.nombre) ||
        String(a.talla ?? "").localeCompare(String(b.talla ?? ""))
    );

    const res = NextResponse.json(out);
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "unknown" }, { status: 500 });
  }
}
