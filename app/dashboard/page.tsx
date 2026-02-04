// app/dashboard/page.tsx

"use client";

import { useEffect, useState } from "react";
import Card from "@/components/Card";

type PlanUsage = {
  usados: number;
  limite: number;
  porcentaje: number;
  alcanzado: boolean;
};

type DashboardMetrics = {
  stock_total?: number;
  stock_critico?: number;
  egresos_hoy?: number;
  gasto_mes_actual?: number;
  ultimo_ingreso?: string | null;
  ultimo_egreso?: string | null;
  centro_top_mes?: string | null;
  trabajador_top_mes?: string | null;
};

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [planUsage, setPlanUsage] = useState<PlanUsage | null>(null);

  const [stockTotal, setStockTotal] = useState<number>(0);
  const [stockCriticoCount, setStockCriticoCount] = useState<number>(0);
  const [egresosHoy, setEgresosHoy] = useState<number>(0);
  const [gastoMes, setGastoMes] = useState<number>(0);

  const [ultimoIngreso, setUltimoIngreso] = useState<string | null>(null);
  const [ultimoEgreso, setUltimoEgreso] = useState<string | null>(null);
  const [centroTop, setCentroTop] = useState<string | null>(null);
  const [trabajadorTop, setTrabajadorTop] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboard = async () => {
      try {
        const res = await fetch("/api/plan-usage");
        if (res.ok) {
          const data = (await res.json().catch(() => null)) as PlanUsage | null;
          if (
            data &&
            typeof data.usados === "number" &&
            typeof data.limite === "number" &&
            typeof data.porcentaje === "number" &&
            typeof data.alcanzado === "boolean"
          ) {
            setPlanUsage(data);
          } else {
            setPlanUsage(null);
          }
        }
      } catch {
        setPlanUsage(null);
      }

      try {
        const resMetrics = await fetch("/api/dashboard-metrics");
        if (resMetrics.ok) {
          const data = (await resMetrics.json().catch(() => ({}))) as DashboardMetrics;

          setStockTotal(data.stock_total ?? 0);
          setStockCriticoCount(data.stock_critico ?? 0);
          setEgresosHoy(data.egresos_hoy ?? 0);

          setGastoMes(data.gasto_mes_actual ?? 0);
          setUltimoIngreso(data.ultimo_ingreso ?? null);
          setUltimoEgreso(data.ultimo_egreso ?? null);
          setCentroTop(data.centro_top_mes ?? null);
          setTrabajadorTop(data.trabajador_top_mes ?? null);
        }
      } catch {
        // keep defaults
      }

      setLoading(false);
    };

    loadDashboard();
  }, []);

  if (loading) {
    return (
      <div className="text-zinc-500 text-sm">
        Cargando dashboard…
      </div>
    );
  }

  return (
    <div className="space-y-8">

      {/* PLAN */}
      {planUsage && (
        <div className="rounded-xl border bg-white p-4 space-y-2">
          <p className="text-sm text-zinc-500">Plan y capacidad</p>
          <p className="font-medium">
            {planUsage.usados} / {planUsage.limite} trabajadores
          </p>
          <div className="h-2 w-full rounded-full bg-zinc-200 overflow-hidden">
            <div
              className={`h-full ${
                planUsage.alcanzado ? "bg-red-500" : "bg-sky-600"
              }`}
              style={{ width: `${planUsage.porcentaje}%` }}
            />
          </div>
          {planUsage.alcanzado && (
            <p className="text-xs text-red-600">
              Has alcanzado el límite de tu plan.
            </p>
          )}
        </div>
      )}

      {/* RESUMEN */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Stock total disponible" value={stockTotal} href="/dashboard/stock" />
        <Card title="Productos en stock crítico" value={stockCriticoCount} href="/dashboard/stock" />
        <Card title="Egresos hoy" value={egresosHoy} href="/dashboard/entregas" />
        <Card title="Gasto del mes" value={`$${gastoMes.toLocaleString("es-CL")}`} href="/dashboard/gastos" />
      </div>

      {/* ACTIVIDAD + DESTACADOS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card title="Último ingreso" value={ultimoIngreso ?? "—"} href="/dashboard/ingreso" />
        <Card title="Último egreso" value={ultimoEgreso ?? "—"} href="/dashboard/entregas" />
        <Card title="Centro con mayor gasto (mes)" value={centroTop ?? "—"} href="/dashboard/gastos" />
        <Card title="Trabajador con mayor gasto (mes)" value={trabajadorTop ?? "—"} href="/dashboard/gastos" />
      </div>

    </div>
  );
}
