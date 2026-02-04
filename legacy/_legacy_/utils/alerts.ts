// app/utils/alerts.ts
import { getStockDesdeFIFO } from "./fifo";
import { getStockCriticos } from "./stock";

const ALERTS_KEY = "stockAlerts";

type StockItemAlerta = {
  categoria: string;
  nombreEpp: string;
  talla: string | null;
  cantidad: number;
  stockCritico: number;
};

/**
 * Obtiene el registro de alertas ya enviadas
 * Estructura:
 * {
 *   [stockItemId]: true
 * }
 */
function getAlertRegistry(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(ALERTS_KEY);
  return raw ? JSON.parse(raw) : {};
}

function saveAlertRegistry(registry: Record<string, boolean>) {
  localStorage.setItem(ALERTS_KEY, JSON.stringify(registry));
}

/**
 * Revisa stock crítico y devuelve los items que requieren alerta
 * Marca como notificados para evitar spam
 */
export function checkStockCriticalAlerts(): StockItemAlerta[] {
  const stockFIFO = getStockDesdeFIFO();
  const criticosConfig = getStockCriticos();
  const registry = getAlertRegistry();

  const criticos: StockItemAlerta[] = [];

  stockFIFO.forEach((item) => {
    const key = `${item.categoria}|${item.nombreEpp}|${item.talla || ""}`;
    const stockCritico = criticosConfig[key];

    if (stockCritico === undefined) return;

    const esCritico = item.cantidad <= stockCritico;

    if (esCritico && !registry[key]) {
      criticos.push({
        categoria: item.categoria,
        nombreEpp: item.nombreEpp,
        talla: item.talla,
        cantidad: item.cantidad,
        stockCritico,
      });
      registry[key] = true;
    }

    if (!esCritico && registry[key]) {
      delete registry[key];
    }
  });

  saveAlertRegistry(registry);
  return criticos;
}

// ===============================
// ALERTAS DE SOBRECONSUMO (RRHH / FINANZAS)
// ===============================

type Trabajador = {
  rut: string;
  nombre: string;
  centro: string;
  creadoEn: string;
};

type Egreso = {
  fecha: string;
  trabajador: {
    rut: string;
    nombre: string;
    centro: string;
  };
  costoTotalEgreso?: number;
};

const OVERCONSUMPTION_FACTOR = 1.5;

/**
 * Obtiene trabajadores desde localStorage
 */
function getTrabajadores(): Trabajador[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("trabajadores") || "[]");
}

/**
 * Obtiene egresos desde localStorage
 */
function getEgresos(): Egreso[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("egresos") || "[]");
}

/**
 * Calcula gasto mensual por trabajador
 */
function gastoMesTrabajador(rut: string, ref: Date): number {
  const egresos = getEgresos();
  return egresos
    .filter((e) => {
      const d = new Date(e.fecha);
      return (
        e.trabajador.rut === rut &&
        d.getMonth() === ref.getMonth() &&
        d.getFullYear() === ref.getFullYear()
      );
    })
    .reduce((s, e) => s + (e.costoTotalEgreso ?? 0), 0);
}

/**
 * Promedio últimos 6 meses (o desde creación)
 */
function promedioTrabajador(
  trabajador: Trabajador,
  ref: Date
): number {
  const egresos = getEgresos();
  const creado = new Date(trabajador.creadoEn);

  const meses = Math.min(
    6,
    (ref.getFullYear() - creado.getFullYear()) * 12 +
      (ref.getMonth() - creado.getMonth()) +
      1
  );

  const gastos = egresos.filter((e) => {
    const d = new Date(e.fecha);
    const diffMeses =
      (ref.getFullYear() - d.getFullYear()) * 12 +
      (ref.getMonth() - d.getMonth());
    return (
      e.trabajador.rut === trabajador.rut &&
      diffMeses < meses
    );
  });

  const total = gastos.reduce(
    (s, e) => s + (e.costoTotalEgreso ?? 0),
    0
  );

  return meses > 0 ? total / meses : 0;
}

/**
 * ALERTAS DE SOBRECONSUMO POR TRABAJADOR
 */
export function checkWorkerOverconsumptionAlerts() {
  const trabajadores = getTrabajadores();
  const ref = new Date();

  return trabajadores
    .map((t) => {
      const gastoMes = gastoMesTrabajador(t.rut, ref);
      const promedio = promedioTrabajador(t, ref);

      if (
        promedio > 0 &&
        gastoMes >= promedio * OVERCONSUMPTION_FACTOR
      ) {
        return {
          tipo: "trabajador",
          rut: t.rut,
          nombre: t.nombre,
          centro: t.centro,
          gastoMes,
          promedio,
          porcentaje:
            Math.round((gastoMes / promedio) * 100),
        };
      }

      return null;
    })
    .filter(Boolean);
}

/**
 * ALERTAS DE SOBRECONSUMO POR CENTRO DE TRABAJO
 */
export function checkCenterOverconsumptionAlerts() {
  const egresos = getEgresos();
  const ref = new Date();

  const porCentro: Record<string, number[]> = {};

  egresos.forEach((e) => {
    const d = new Date(e.fecha);
    const diffMeses =
      (ref.getFullYear() - d.getFullYear()) * 12 +
      (ref.getMonth() - d.getMonth());

    if (diffMeses < 6) {
      porCentro[e.trabajador.centro] ??= [];
      porCentro[e.trabajador.centro].push(
        e.costoTotalEgreso ?? 0
      );
    }
  });

  return Object.entries(porCentro)
    .map(([centro, gastos]) => {
      if (gastos.length < 2) return null;

      const gastoMes =
        gastos[gastos.length - 1];
      const promedio =
        gastos.reduce((s, v) => s + v, 0) /
        gastos.length;

      if (
        gastoMes >= promedio * OVERCONSUMPTION_FACTOR
      ) {
        return {
          tipo: "centro",
          centro,
          gastoMes,
          promedio,
          porcentaje:
            Math.round((gastoMes / promedio) * 100),
        };
      }

      return null;
    })
    .filter(Boolean);
}

// ===============================
// API UNIFICADA PARA DASHBOARD
// ===============================

export function getOverconsumptionAlerts() {
  return {
    trabajadores: checkWorkerOverconsumptionAlerts(),
    centros: checkCenterOverconsumptionAlerts(),
  };
}
