// app/api/dashboard-metrics/route.ts
// Métricas reales de dashboard (backend)
// - Gasto últimos 6 meses
// - Promedio mensual
// - Centro con mayor gasto (mes actual)
// - Trabajador con mayor gasto (mes actual)
// - Último ingreso
// - Último egreso

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function toNum(v: any) {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

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
  // Prefer the explicit non-httpOnly compat cookie
  const compat = cookieStore.get("impersonate_empresa_id")?.value;
  if (compat && isUuid(compat)) return compat;

  // Fallback: decode the httpOnly cookie payload { empresa_id, usuario_id }
  const packed = cookieStore.get("epp_impersonate")?.value;
  if (packed) {
    const obj = decodeBase64UrlJson(packed);
    const eid = obj?.empresa_id;
    if (eid && isUuid(eid)) return String(eid);
  }

  return null;
}

// Construye un ISO UTC para el inicio del día (00:00) en una zona horaria.
// Importante: esto NO es "00:00Z"; es el instante UTC equivalente a 00:00 local en `tz`.
function tzPartsAt(date: Date, tz: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(date);

  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return {
    y: Number(get("year")),
    m: Number(get("month")),
    d: Number(get("day")),
    hh: Number(get("hour")),
    mm: Number(get("minute")),
    ss: Number(get("second")),
  };
}

// Offset (minutos) de la zona `tz` para un instante dado.
// Convención: local = utc + offset.
function tzOffsetMinutes(date: Date, tz: string) {
  const p = tzPartsAt(date, tz);
  const asUTC = Date.UTC(p.y, p.m - 1, p.d, p.hh, p.mm, p.ss);
  return Math.round((asUTC - date.getTime()) / 60000);
}

// Convierte una fecha/hora *local* (en tz) a ISO UTC.
function zonedTimeToUtcISO(tz: string, y: number, m: number, d: number, hh = 0, mm = 0, ss = 0) {
  // Primera aproximación (tratando la hora local como si fuese UTC)
  let utcMs = Date.UTC(y, m - 1, d, hh, mm, ss);

  // Refinar 2 veces para absorber cambios de offset (DST / reglas TZ)
  for (let i = 0; i < 2; i++) {
    const off = tzOffsetMinutes(new Date(utcMs), tz);
    utcMs = Date.UTC(y, m - 1, d, hh, mm, ss) - off * 60_000;
  }

  return new Date(utcMs).toISOString();
}

function startOfTodayISO(tz: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const y = Number(get("year"));
  const m = Number(get("month"));
  const d = Number(get("day"));

  return zonedTimeToUtcISO(tz, y, m, d, 0, 0, 0);
}

// ISO UTC para el inicio del mes (día 1 00:00) en una zona horaria.
function startOfMonthISO(tz: string) {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
  }).formatToParts(now);

  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  const y = Number(get("year"));
  const m = Number(get("month"));

  return zonedTimeToUtcISO(tz, y, m, 1, 0, 0, 0);
}


export async function GET() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ error: "Missing NEXT_PUBLIC_SUPABASE_URL/ANON_KEY" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const cookieStore = await cookies();

  // 1) Auth client (cookie session) — Next 16: getAll/setAll
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

  // 2) Privileged data client
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    // 1️⃣ Usuario autenticado
    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const authUserId = user.id;
    const authEmail = (user.email || "").trim().toLowerCase();

    // 2️⃣ Obtener empresa_id (primario: auth_user_id via RLS)
    let empresaId: string | null = null;
    let usuarioInternoId: string | null = null;
    let activo: boolean | null = null;
    let rol: string | null = null;

    const byAuth = await supabaseAuth
      .from("usuarios")
      .select("id, empresa_id, activo, rol")
      .eq("auth_user_id", authUserId)
      .maybeSingle();

    if (byAuth.data?.empresa_id) {
      usuarioInternoId = byAuth.data.id;
      empresaId = byAuth.data.empresa_id as any;
      activo = (byAuth.data as any).activo ?? null;
      rol = (byAuth.data as any).rol ?? null;
    } else if (authEmail) {
      // fallback por email (invitaciones/recovery) y linkear auth_user_id con service role
      const byEmail = await supabaseAdmin
        .from("usuarios")
        .select("id, empresa_id, activo, auth_user_id, rol")
        .eq("email", authEmail)
        .eq("activo", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (byEmail.data?.empresa_id) {
        usuarioInternoId = byEmail.data.id;
        empresaId = byEmail.data.empresa_id as any;
        activo = (byEmail.data as any).activo ?? null;
        rol = (byEmail.data as any).rol ?? null;

        if (!byEmail.data.auth_user_id) {
          await supabaseAdmin
            .from("usuarios")
            .update({ auth_user_id: authUserId })
            .eq("id", byEmail.data.id)
            .is("auth_user_id", null);
        }
      }
    }

    if (!empresaId) {
      return NextResponse.json({ error: "No se pudo identificar la empresa" }, { status: 400 });
    }

    if (activo === false) {
      return NextResponse.json({ error: "Usuario inactivo" }, { status: 403 });
    }

    // ✅ Empresa efectiva: si soy superadmin y hay impersonación activa, usar esa empresa
    const myRole = String(rol ?? "").trim().toLowerCase();
    const impersonEmpresa = getImpersonatedEmpresaId(cookieStore);
    const effectiveEmpresaId = myRole === "superadmin" && impersonEmpresa ? impersonEmpresa : empresaId;

    // ─────────────────────────────────────────────
    // 📦 STOCK TOTAL + STOCK CRÍTICO (excluye anulados)
    // ─────────────────────────────────────────────
    const { data: lotesStock, error: lotesErr } = await supabaseAdmin
      .from("lotes_epp")
      .select("categoria,nombre_epp,talla,cantidad_disponible,anulado")
      .eq("empresa_id", effectiveEmpresaId)
      .eq("anulado", false)
      .gt("cantidad_disponible", 0);

    if (lotesErr) throw new Error(lotesErr.message);

    // Agregar por producto+talla
    const agg = new Map<string, { categoria: string; nombre: string; talla: string | null; total: number }>();

    (lotesStock ?? []).forEach((l: any) => {
      const categoria = String(l.categoria ?? "");
      const nombre = String(l.nombre_epp ?? "");
      const talla = l.talla == null || String(l.talla).trim() === "" ? null : String(l.talla);
      const qty = toNum(l.cantidad_disponible);
      if (qty <= 0) return;
      const key = `${categoria}||${nombre}||${talla ?? ""}`;
      const prev = agg.get(key);
      if (!prev) agg.set(key, { categoria, nombre, talla, total: qty });
      else prev.total += qty;
    });

    const stockTotal = Array.from(agg.values()).reduce((s, x) => s + x.total, 0);

    // stock críticos (umbral por producto) desde tabla stock_criticos
    const { data: crits, error: critErr } = await supabaseAdmin
      .from("stock_criticos")
      .select("categoria,nombre_epp,talla,stock_critico")
      .eq("empresa_id", effectiveEmpresaId);

    if (critErr) throw new Error(critErr.message);

    const critMap = new Map<string, number>();
    (crits ?? []).forEach((c: any) => {
      const categoria = String(c.categoria ?? "");
      const nombre = String(c.nombre_epp ?? "");
      const talla = c.talla == null || String(c.talla).trim() === "" ? null : String(c.talla);
      const key = `${categoria}||${nombre}||${talla ?? ""}`;
      critMap.set(key, toNum(c.stock_critico));
    });

    let stockCritico = 0;
    for (const [key, x] of agg.entries()) {
      const umbral = critMap.get(key);
      if (umbral == null) continue; // solo cuenta los que tienen umbral definido
      if (x.total <= umbral) stockCritico += 1;
    }

    // ─────────────────────────────────────────────
    // 📊 Fechas (America/Santiago)
    // ─────────────────────────────────────────────
    const tz = "America/Santiago";
    const inicioHoyISO = startOfTodayISO(tz);
    const inicioMesISO = startOfMonthISO(tz);

    // Definir fecha inicio 6 meses atrás (en UTC) una vez
    const start6Months = new Date(new Date().setMonth(new Date().getMonth() - 6)).toISOString();

    // ─────────────────────────────────────────────
    // 📊 GASTO ÚLTIMOS 6 MESES + PROMEDIO
    // ─────────────────────────────────────────────
    const { data: gasto6Meses, error: g6Err } = await supabaseAdmin
      .from("entrega_items")
      .select("costo_total_iva, entregas!inner(fecha_entrega, empresa_id)")
      .eq("entregas.empresa_id", effectiveEmpresaId)
      .gte("entregas.fecha_entrega", start6Months);

    if (g6Err) throw new Error(g6Err.message);

    const gastoTotal6Meses =
      (gasto6Meses ?? []).reduce((sum: number, i: any) => sum + toNum(i.costo_total_iva), 0) || 0;

    // Calcular meses distintos con egresos en últimos 6 meses (en TZ CL)
    const mesesSet = new Set<string>();
    (gasto6Meses ?? []).forEach((i: any) => {
      const fe = i.entregas?.fecha_entrega;
      if (!fe) return;
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
      }).formatToParts(new Date(fe));
      const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
      const monthKey = `${get("year")}-${get("month")}`;
      if (monthKey.trim()) mesesSet.add(monthKey);
    });

    const mesesConDatos = mesesSet.size || 1;
    const promedioMensual6Meses = Math.round(gastoTotal6Meses / mesesConDatos);

    // ─────────────────────────────────────────────
    // 💰 GASTO MES ACTUAL
    // ─────────────────────────────────────────────
    const { data: gastoItemsMesActual, error: gMesErr } = await supabaseAdmin
      .from("entrega_items")
      .select("costo_total_iva, entregas!inner(fecha_entrega, empresa_id)")
      .eq("entregas.empresa_id", effectiveEmpresaId)
      .gte("entregas.fecha_entrega", inicioMesISO);

    if (gMesErr) throw new Error(gMesErr.message);

    const gastoMesActual =
      (gastoItemsMesActual ?? []).reduce((sum: number, i: any) => sum + toNum(i.costo_total_iva), 0) || 0;

    // ─────────────────────────────────────────────
    // 🏭 CENTRO CON MAYOR GASTO (MES ACTUAL)
    // ─────────────────────────────────────────────
    const { data: gastoPorCentro, error: gCentroErr } = await supabaseAdmin
      .from("entrega_items")
      .select(
        `
        costo_total_iva,
        entregas!inner(
          centro_id,
          centros_trabajo(nombre),
          fecha_entrega,
          empresa_id
        )
      `
      )
      .eq("entregas.empresa_id", effectiveEmpresaId)
      .gte("entregas.fecha_entrega", inicioMesISO);

    if (gCentroErr) throw new Error(gCentroErr.message);

    const centroMap: Record<string, number> = {};

    (gastoPorCentro ?? []).forEach((i: any) => {
      const nombre = i.entregas?.centros_trabajo?.nombre;
      if (!nombre) return;
      centroMap[nombre] = (centroMap[nombre] || 0) + toNum(i.costo_total_iva);
    });

    const centroTop =
      Object.entries(centroMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // ─────────────────────────────────────────────
    // 👷 TRABAJADOR CON MAYOR GASTO (MES ACTUAL)
    // ─────────────────────────────────────────────
    const { data: gastoPorTrabajador, error: gTrabErr } = await supabaseAdmin
      .from("entrega_items")
      .select(
        `
        costo_total_iva,
        entregas!inner(
          trabajador_id,
          trabajadores(nombre),
          fecha_entrega,
          empresa_id
        )
      `
      )
      .eq("entregas.empresa_id", effectiveEmpresaId)
      .gte("entregas.fecha_entrega", inicioMesISO);

    if (gTrabErr) throw new Error(gTrabErr.message);

    const trabajadorMap: Record<string, number> = {};

    (gastoPorTrabajador ?? []).forEach((i: any) => {
      const nombre = i.entregas?.trabajadores?.nombre;
      if (!nombre) return;
      trabajadorMap[nombre] = (trabajadorMap[nombre] || 0) + toNum(i.costo_total_iva);
    });

    const trabajadorTop =
      Object.entries(trabajadorMap).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    // ─────────────────────────────────────────────
    // ⏱️ ÚLTIMO INGRESO / ÚLTIMO EGRESO
    // ─────────────────────────────────────────────
    const { data: ultimoIngreso, error: uIngErr } = await supabaseAdmin
      .from("lotes_epp")
      .select("created_at, fecha_ingreso")
      .eq("empresa_id", effectiveEmpresaId)
      .eq("anulado", false)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (uIngErr) throw new Error(uIngErr.message);

    const { data: ultimoEgreso, error: uEgrErr } = await supabaseAdmin
      .from("entregas")
      .select("created_at, fecha_entrega")
      .eq("empresa_id", effectiveEmpresaId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (uEgrErr) throw new Error(uEgrErr.message);

    // ─────────────────────────────────────────────
    // 📦 EGRESOS HOY (inicio del día en CL)
    // ─────────────────────────────────────────────
    const { count: egresosHoy, error: eHoyErr } = await supabaseAdmin
      .from("entregas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", effectiveEmpresaId)
      .gte("fecha_entrega", inicioHoyISO);

    if (eHoyErr) throw new Error(eHoyErr.message);

    // ─────────────────────────────────────────────
    // ✅ RESPUESTA FINAL
    // ─────────────────────────────────────────────
    const res = NextResponse.json({
      stock_total: stockTotal,
      stock_critico: stockCritico,
      gasto_total_6_meses: gastoTotal6Meses,
      promedio_mensual_6_meses: promedioMensual6Meses,
      centro_top_mes: centroTop,
      trabajador_top_mes: trabajadorTop,
      ultimo_ingreso: (ultimoIngreso as any)?.created_at ?? (ultimoIngreso as any)?.fecha_ingreso ?? null,
      ultimo_egreso: (ultimoEgreso as any)?.created_at ?? (ultimoEgreso as any)?.fecha_entrega ?? null,
      meses_con_datos_6_meses: mesesConDatos,
      gasto_mes_actual: gastoMesActual,
      egresos_hoy: egresosHoy || 0,
      _debug: {
        empresa_id: effectiveEmpresaId,
        empresa_id_real: empresaId,
        rol: myRole,
        impersonate_empresa_id: impersonEmpresa,
        usuario_id: usuarioInternoId,
        inicio_hoy_iso: inicioHoyISO,
        inicio_mes_iso: inicioMesISO,
      },
    });

    // Evitar cache en prod
    res.headers.set("Cache-Control", "no-store");
    return res;
  } catch (error: any) {
    console.error("DASHBOARD METRICS ERROR:", error);
    const res = NextResponse.json(
      {
        error: error?.message || "Error obteniendo métricas de dashboard",
      },
      { status: 500 }
    );
    res.headers.set("Cache-Control", "no-store");
    return res;
  }
}
