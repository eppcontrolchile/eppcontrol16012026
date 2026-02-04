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

export async function GET() {
  const cookieStore = await cookies();

  // 1) Auth client (uses request cookies)
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
      return NextResponse.json(
        { error: "No autenticado" },
        { status: 401 }
      );
    }

    // 2️⃣ Obtener empresa_id
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .select("empresa_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (usuarioError || !usuario?.empresa_id) {
      throw new Error("No se pudo identificar la empresa");
    }

    const empresaId = usuario.empresa_id;

    // ─────────────────────────────────────────────
    // 📦 STOCK TOTAL + STOCK CRÍTICO
    // ─────────────────────────────────────────────
    const { data: lotesStock } = await supabaseAdmin
      .from("lotes_epp")
      .select("cantidad_disponible")
      .eq("empresa_id", empresaId);

    const stockTotal =
      lotesStock?.reduce((sum, l: any) => sum + (l.cantidad_disponible || 0), 0) || 0;

    // Heurística conservadora: considerar crítico si disponible <= 5
    // (si luego defines umbral por producto/empresa, lo ajustamos)
    const stockCritico =
      lotesStock?.filter((l: any) => (l.cantidad_disponible ?? 0) <= 5).length || 0;

    // Definir fecha inicio 6 meses atrás una vez
    const start6Months = new Date(
      new Date().setMonth(new Date().getMonth() - 6)
    ).toISOString();

    // ─────────────────────────────────────────────
    // 📊 GASTO ÚLTIMOS 6 MESES + PROMEDIO
    // ─────────────────────────────────────────────
    const { data: gasto6Meses } = await supabaseAdmin
      .from("entrega_items")
      .select("costo_total_iva, entregas!inner(fecha_entrega, empresa_id)")
      .eq("entregas.empresa_id", empresaId)
      .gte("entregas.fecha_entrega", start6Months);

    const gastoTotal6Meses =
      gasto6Meses?.reduce(
        (sum, i: any) => sum + (i.costo_total_iva || 0),
        0
      ) || 0;

    // Calcular meses distintos con egresos en últimos 6 meses
    const mesesSet = new Set<string>();
    gasto6Meses?.forEach((i: any) => {
      if (i.entregas?.fecha_entrega) {
        const date = new Date(i.entregas.fecha_entrega);
        const monthKey = `${date.getFullYear()}-${date.getMonth() + 1}`;
        mesesSet.add(monthKey);
      }
    });
    const mesesConDatos = mesesSet.size || 1;

    const promedioMensual6Meses = Math.round(
      gastoTotal6Meses / mesesConDatos
    );

    // ─────────────────────────────────────────────
    // 🏭 CENTRO CON MAYOR GASTO (MES ACTUAL)
    // ─────────────────────────────────────────────
    const inicioMes = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    ).toISOString();

    // ─────────────────────────────────────────────
    // 💰 GASTO MES ACTUAL
    // ─────────────────────────────────────────────
    const { data: gastoItemsMesActual } = await supabaseAdmin
      .from("entrega_items")
      .select("costo_total_iva, entregas!inner(fecha_entrega, empresa_id)")
      .eq("entregas.empresa_id", empresaId)
      .gte("entregas.fecha_entrega", inicioMes);

    const gastoMesActual =
      gastoItemsMesActual?.reduce(
        (sum, i: any) => sum + (i.costo_total_iva || 0),
        0
      ) || 0;

    const { data: gastoPorCentro } = await supabaseAdmin
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
      .eq("entregas.empresa_id", empresaId)
      .gte("entregas.fecha_entrega", inicioMes);

    const centroMap: Record<string, number> = {};

    gastoPorCentro?.forEach((i: any) => {
      const nombre = i.entregas?.centros_trabajo?.nombre;
      if (!nombre) return;
      centroMap[nombre] =
        (centroMap[nombre] || 0) + (i.costo_total_iva || 0);
    });

    const centroTop =
      Object.entries(centroMap).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0] || null;

    // ─────────────────────────────────────────────
    // 👷 TRABAJADOR CON MAYOR GASTO (MES ACTUAL)
    // ─────────────────────────────────────────────
    const { data: gastoPorTrabajador } = await supabaseAdmin
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
      .eq("entregas.empresa_id", empresaId)
      .gte("entregas.fecha_entrega", inicioMes);

    const trabajadorMap: Record<string, number> = {};

    gastoPorTrabajador?.forEach((i: any) => {
      const nombre = i.entregas?.trabajadores?.nombre;
      if (!nombre) return;
      trabajadorMap[nombre] =
        (trabajadorMap[nombre] || 0) +
        (i.costo_total_iva || 0);
    });

    const trabajadorTop =
      Object.entries(trabajadorMap).sort(
        (a, b) => b[1] - a[1]
      )[0]?.[0] || null;

    // ─────────────────────────────────────────────
    // ⏱️ ÚLTIMO INGRESO / ÚLTIMO EGRESO
    // ─────────────────────────────────────────────
    const { data: ultimoIngreso } = await supabaseAdmin
      .from("lotes_epp")
      .select("fecha_ingreso")
      .eq("empresa_id", empresaId)
      .order("fecha_ingreso", { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: ultimoEgreso } = await supabaseAdmin
      .from("entregas")
      .select("fecha_entrega")
      .eq("empresa_id", empresaId)
      .order("fecha_entrega", { ascending: false })
      .limit(1)
      .maybeSingle();

    // ─────────────────────────────────────────────
    // 📦 EGRESOS HOY
    // ─────────────────────────────────────────────
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);

    const { count: egresosHoy } = await supabaseAdmin
      .from("entregas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresaId)
      .gte("fecha_entrega", inicioHoy.toISOString());

    // ─────────────────────────────────────────────
    // ✅ RESPUESTA FINAL
    // ─────────────────────────────────────────────
    return NextResponse.json({
      stock_total: stockTotal,
      stock_critico: stockCritico,
      gasto_total_6_meses: gastoTotal6Meses,
      promedio_mensual_6_meses: promedioMensual6Meses,
      centro_top_mes: centroTop,
      trabajador_top_mes: trabajadorTop,
      ultimo_ingreso: ultimoIngreso?.fecha_ingreso || null,
      ultimo_egreso: ultimoEgreso?.fecha_entrega || null,
      meses_con_datos_6_meses: mesesConDatos,
      gasto_mes_actual: gastoMesActual,
      egresos_hoy: egresosHoy || 0,
    });
  } catch (error: any) {
    console.error("DASHBOARD METRICS ERROR:", error);
    return NextResponse.json(
      {
        error:
          error.message ||
          "Error obteniendo métricas de dashboard",
      },
      { status: 500 }
    );
  }
}
