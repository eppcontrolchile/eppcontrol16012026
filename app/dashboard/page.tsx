// app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStock } from "@/app/utils/stock";
import { getOverconsumptionAlerts } from "@/app/utils/alerts";
import { getPlanUsage } from "@/app/utils/plan";

function getEgresosLocal() {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("egresos") || "[]");
  } catch {
    return [];
  }
}

function getCantidadTotalStock(stock: any[]) {
  return stock.reduce(
    (sum, item) =>
      sum +
      (item.lotes
        ? item.lotes.reduce(
            (s: number, l: any) => s + l.cantidadDisponible,
            0
          )
        : 0),
    0
  );
}

export default function DashboardPage() {
  const [stockTotal, setStockTotal] = useState(0);
  const [stockCriticoCount, setStockCriticoCount] = useState(0);
  const [ultimoIngreso, setUltimoIngreso] = useState<string | null>(null);
  const [egresosHoy, setEgresosHoy] = useState(0);
  const [egresosMes, setEgresosMes] = useState(0);
  const [ultimoEgreso, setUltimoEgreso] = useState<string | null>(null);
  const [gastoMes, setGastoMes] = useState(0);
  const [centroTop, setCentroTop] = useState<string | null>(null);
  const [trabajadorTop, setTrabajadorTop] = useState<string | null>(null);
  const [alertasTrabajadores, setAlertasTrabajadores] = useState<any[]>([]);
  const [alertasCentros, setAlertasCentros] = useState<any[]>([]);
  const [planUsage, setPlanUsage] = useState<{
    usados: number;
    limite: number;
    porcentaje: number;
    alcanzado: boolean;
  } | null>(null);

  useEffect(() => {
    const stock = getStock();
    const egresos = getEgresosLocal();

    setStockTotal(getCantidadTotalStock(stock));
    setStockCriticoCount(
      stock.filter(
        (s) =>
          s.lotes.reduce(
            (sum: number, l: any) => sum + l.cantidadDisponible,
            0
          ) <= s.stockCritico
      ).length
    );

    // ÚLTIMO INGRESO
    const ingresos = stock
      .flatMap((s) =>
        s.lotes?.map((l: any) => ({
          fecha: l.fechaIngreso,
          nombre: s.nombre,
        })) || []
      )
      .filter((i: any) => i.fecha);

    if (ingresos.length > 0) {
      const ultimo = ingresos.sort(
        (a: any, b: any) =>
          new Date(b.fecha).getTime() -
          new Date(a.fecha).getTime()
      )[0];

      setUltimoIngreso(
        `${ultimo.nombre} – ${new Date(
          ultimo.fecha
        ).toLocaleDateString()}`
      );
    }

    const hoy = new Date().toDateString();
    setEgresosHoy(
      egresos.filter(
        (e) => new Date(e.fecha).toDateString() === hoy
      ).length
    );

    const mes = new Date().getMonth();
    const anio = new Date().getFullYear();
    setEgresosMes(
      egresos.filter((e) => {
        const d = new Date(e.fecha);
        return d.getMonth() === mes && d.getFullYear() === anio;
      }).length
    );

    if (egresos.length > 0) {
      const ultimo = egresos[egresos.length - 1];
      setUltimoEgreso(
        `${ultimo.trabajador.nombre} – ${new Date(
          ultimo.fecha
        ).toLocaleDateString()}`
      );
    }

    // GASTO GERENCIAL
    const gastosPorCentro: Record<string, number> = {};
    const gastosPorTrabajador: Record<string, number> = {};
    let totalMes = 0;

    egresos.forEach((e: any) => {
      const d = new Date(e.fecha);
      if (d.getMonth() === mes && d.getFullYear() === anio) {
        totalMes += e.costoTotalEgreso || 0;

        if (e.trabajador?.centro) {
          gastosPorCentro[e.trabajador.centro] =
            (gastosPorCentro[e.trabajador.centro] || 0) +
            (e.costoTotalEgreso || 0);
        }

        if (e.trabajador?.nombre) {
          gastosPorTrabajador[e.trabajador.nombre] =
            (gastosPorTrabajador[e.trabajador.nombre] || 0) +
            (e.costoTotalEgreso || 0);
        }
      }
    });

    setGastoMes(totalMes);

    const centroMax = Object.entries(gastosPorCentro).sort(
      (a, b) => b[1] - a[1]
    )[0];

    const trabajadorMax = Object.entries(gastosPorTrabajador).sort(
      (a, b) => b[1] - a[1]
    )[0];

    setCentroTop(centroMax ? centroMax[0] : null);
    setTrabajadorTop(trabajadorMax ? trabajadorMax[0] : null);

    // ALERTAS DE SOBRECONSUMO
    const over = getOverconsumptionAlerts();
    setAlertasTrabajadores(over.trabajadores);
    setAlertasCentros(over.centros);

    setPlanUsage(getPlanUsage());
  }, []);

  return (
    <div className="space-y-8">
      {/* BLOQUE DE ALERTAS */}
      <div className="space-y-4 mb-6">
      {/* ALERTAS */}
      {stockCriticoCount > 0 && (
        <Link href="/dashboard/stock">
          <div className="cursor-pointer rounded-xl border border-red-200 bg-red-50 p-4 hover:bg-red-100">
            <div className="flex items-start gap-3">
              <span className="text-red-600 text-xl">⚠️</span>
              <div className="flex-1">
                <h2 className="font-semibold text-red-700">
                  Alerta de stock crítico
                </h2>
                <p className="text-sm text-red-600">
                  Tienes {stockCriticoCount} EPP en stock crítico.
                </p>
              </div>
              <Link
                href="/dashboard/stock"
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700"
              >
                Ver stock
              </Link>
            </div>
          </div>
        </Link>
      )}

      {(alertasTrabajadores.length > 0 ||
        alertasCentros.length > 0) && (
        <div className="rounded-xl border border-yellow-300 bg-yellow-50 p-4">
          <div className="flex items-start gap-3">
            <span className="text-yellow-700 text-xl">🚨</span>
            <div className="flex-1">
              <h2 className="font-semibold text-yellow-800">
                Alertas de sobreconsumo detectadas
              </h2>

              <ul className="mt-1 text-sm text-yellow-700 list-disc pl-5 space-y-1">
                {alertasTrabajadores.length > 0 && (
                  <li>
                    {alertasTrabajadores.length} trabajador(es) con
                    consumo fuera de su promedio histórico
                  </li>
                )}
                {alertasCentros.length > 0 && (
                  <li>
                    {alertasCentros.length} centro(s) de trabajo con
                    sobreconsumo de EPP
                  </li>
                )}
              </ul>
            </div>

            <Link
              href="/dashboard/gastos"
              className="rounded-lg bg-yellow-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-yellow-700"
            >
              Analizar gastos
            </Link>
          </div>
        </div>
      )}
      </div>
      {/* FIN BLOQUE DE ALERTAS */}

      {/* ESTADO ACTUAL */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {planUsage && (
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <p className="text-sm text-zinc-500">
              Uso del plan (trabajadores)
            </p>

            <p className="mt-1 text-2xl font-semibold">
              {planUsage.usados} /{" "}
              {planUsage.limite === Infinity ? "∞" : planUsage.limite}
            </p>

            <div className="mt-2 h-2 w-full rounded bg-zinc-200">
              <div
                className={`h-2 rounded ${
                  planUsage.porcentaje >= 90
                    ? "bg-red-500"
                    : planUsage.porcentaje >= 75
                    ? "bg-orange-500"
                    : "bg-green-500"
                }`}
                style={{ width: `${planUsage.porcentaje}%` }}
              />
            </div>

            <p className="mt-1 text-xs text-zinc-500">
              {planUsage.porcentaje}% del plan utilizado
            </p>
          </div>
        )}
        <Link href="/dashboard/stock">
          <div className="cursor-pointer rounded-xl border border-red-200 bg-red-50 p-4 hover:bg-red-100">
            <p className="text-sm text-red-700">EPP en riesgo</p>
            <p className="mt-1 text-2xl font-semibold text-red-700">
              {stockCriticoCount}
            </p>
          </div>
        </Link>
        <Card
          title="EPP disponibles"
          value={stockTotal}
          href="/dashboard/stock"
        />
      </div>

      {/* ACTIVIDAD DEL MES */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Entregas hoy"
          value={egresosHoy}
          href="/dashboard/entregas"
        />
        <Card
          title="Entregas este mes"
          value={egresosMes}
          href="/dashboard/entregas"
        />
        <Link href="/dashboard/gastos">
          <div className="cursor-pointer rounded-xl border border-zinc-300 bg-zinc-50 p-4 hover:bg-zinc-100">
            <p className="text-sm text-zinc-600">
              Gasto EPP del mes ($ IVA incl.)
            </p>
            <p className="mt-1 text-2xl font-semibold">
              {gastoMes.toLocaleString("es-CL")}
            </p>
          </div>
        </Link>
      </div>

      {/* FOCOS DE CONSUMO */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card
          title="Centro con mayor gasto EPP"
          value={centroTop ?? "—"}
          href="/dashboard/gastos"
        />
        <Card
          title="Trabajador con mayor gasto EPP"
          value={trabajadorTop ?? "—"}
          href="/dashboard/trabajadores"
        />
        <Card
          title="Última entrega"
          value={ultimoEgreso ?? "—"}
          href="/dashboard/entregas"
        />
      </div>

      {/* ACCIONES */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Action href="/dashboard/ingreso" label="➕ Ingreso" />
        <Action href="/dashboard/egreso" label="➖ Egreso" />
        <Action href="/dashboard/stock" label="📦 Stock" />
        <Action href="/dashboard/trabajadores" label="👷 Trabajadores" />
      </div>
    </div>
  );
}

function Card({
  title,
  value,
  href,
}: {
  title: string;
  value: any;
  href: string;
}) {
  return (
    <Link href={href}>
      <div className="cursor-pointer rounded-xl border border-zinc-200 bg-white p-4 hover:bg-zinc-50">
        <p className="text-sm text-zinc-500">{title}</p>
        <p className="mt-1 text-2xl font-semibold">{value}</p>
      </div>
    </Link>
  );
}

function Action({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="rounded-xl border border-zinc-200 bg-white p-4 text-center font-medium hover:bg-zinc-50"
    >
      {label}
    </Link>
  );
}
