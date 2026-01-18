// app/dashboard/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStock } from "@/app/utils/stock";
import { getOverconsumptionAlerts } from "@/app/utils/alerts";
import { getPlanUsage } from "@/app/utils/plan";

/* =========================
   TIPOS LOCALES (TEMPORALES)
   ========================= */

type EgresoLocal = {
  fecha: string;
  costoTotalEgreso?: number;
  trabajador?: {
    nombre?: string;
    centro?: string;
  };
};

/* =========================
   HELPERS
   ========================= */

function getEgresosLocal(): EgresoLocal[] {
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

/* =========================
   DASHBOARD
   ========================= */

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

    /* ===== STOCK ===== */
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

    /* ===== ÚLTIMO INGRESO ===== */
    const ingresos = stock
      .flatMap((s) =>
        s.lotes?.map((l: any) => ({
          fecha: l.fechaIngreso,
          nombre: s.nombre,
        })) || []
      )
      .filter((i: { fecha?: string }) => i.fecha);

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

    /* ===== EGRESOS ===== */
    const hoy = new Date().toDateString();

    setEgresosHoy(
      egresos.filter(
        (e: EgresoLocal) =>
          new Date(e.fecha).toDateString() === hoy
      ).length
    );

    const mes = new Date().getMonth();
    const anio = new Date().getFullYear();

    setEgresosMes(
      egresos.filter((e: EgresoLocal) => {
        const d = new Date(e.fecha);
        return d.getMonth() === mes && d.getFullYear() === anio;
      }).length
    );

    if (egresos.length > 0) {
      const ultimo = egresos[egresos.length - 1];
      setUltimoEgreso(
        `${ultimo.trabajador?.nombre ?? "—"} – ${new Date(
          ultimo.fecha
        ).toLocaleDateString()}`
      );
    }

    /* ===== GASTOS ===== */
    const gastosPorCentro: Record<string, number> = {};
    const gastosPorTrabajador: Record<string, number> = {};
    let totalMes = 0;

    egresos.forEach((e: EgresoLocal) => {
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

    /* ===== ALERTAS ===== */
    const over = getOverconsumptionAlerts();
    setAlertasTrabajadores(over.trabajadores);
    setAlertasCentros(over.centros);

    setPlanUsage(getPlanUsage());
  }, []);

  /* ===== RENDER ===== */

  return (
    <div className="space-y-8">
      {/* el JSX que ya tenías queda EXACTAMENTE IGUAL */}
      {/* no toqué nada visual */}
      {/* … */}
    </div>
  );
}

/* ===== COMPONENTES ===== */

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
