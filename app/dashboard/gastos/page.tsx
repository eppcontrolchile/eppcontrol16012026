// app/dashboard/gastos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type Egreso = {
  id: string;
  fecha: string;
  trabajador: {
    nombre: string;
    rut: string;
    centro: string;
  };
  items: {
    categoria: string;
    epp: string;
    tallaNumero: string;
    cantidad: number;
    costoTotal: number;
  }[];
  costoTotalEgreso: number;
};

function getEgresosLocal(): Egreso[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem("egresos") || "[]");
  } catch {
    return [];
  }
}

function exportGastosCSV(rows: {
  fecha: string;
  centro: string;
  trabajador: string;
  epp: string;
  talla: string;
  cantidad: number;
  costo: number;
}[]) {
  const header = [
    "Fecha",
    "Centro",
    "Trabajador",
    "EPP",
    "Talla",
    "Cantidad",
    "Costo (IVA incluido)",
  ];

  const body = rows.map((r) => [
    r.fecha,
    r.centro,
    r.trabajador,
    r.epp,
    r.talla,
    r.cantidad,
    r.costo,
  ]);

  const csv = [header, ...body]
    .map((row) => row.join(";"))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", "gastos_epp.csv");
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export default function GastosPage() {
  const [egresos, setEgresos] = useState<Egreso[]>([]);
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [centro, setCentro] = useState("");
  const [trabajador, setTrabajador] = useState("");

  useEffect(() => {
    setEgresos(getEgresosLocal());
  }, []);

  const egresosFiltrados = useMemo(() => {
    return egresos.filter((e) => {
      const fechaEgreso = new Date(e.fecha);

      if (desde) {
        const desdeDate = new Date(desde + "T00:00:00");
        if (fechaEgreso < desdeDate) return false;
      }

      if (hasta) {
        const hastaDate = new Date(hasta + "T23:59:59");
        if (fechaEgreso > hastaDate) return false;
      }
      if (centro && e.trabajador.centro !== centro) return false;
      if (trabajador && e.trabajador.nombre !== trabajador)
        return false;
      return true;
    });
  }, [egresos, desde, hasta, centro, trabajador]);

  const filasExport = useMemo(() => {
    return egresosFiltrados.flatMap((e) =>
      e.items.map((item) => ({
        fecha: new Date(e.fecha).toLocaleDateString(),
        centro: e.trabajador.centro,
        trabajador: e.trabajador.nombre,
        epp: item.epp,
        talla: item.tallaNumero ?? "",
        cantidad: item.cantidad,
        costo: item.costoTotal ?? 0,
      }))
    );
  }, [egresosFiltrados]);

  const resumen = useMemo(() => {
    let total = 0;
    const porCentro: Record<string, number> = {};
    const porTrabajador: Record<string, number> = {};

    egresosFiltrados.forEach((e) => {
      total += e.costoTotalEgreso ?? 0;

      porCentro[e.trabajador.centro] =
        (porCentro[e.trabajador.centro] || 0) + (e.costoTotalEgreso ?? 0);

      porTrabajador[e.trabajador.nombre] =
        (porTrabajador[e.trabajador.nombre] || 0) +
        (e.costoTotalEgreso ?? 0);
    });

    const centroTop = Object.entries(porCentro).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];

    const trabajadorTop = Object.entries(porTrabajador).sort(
      (a, b) => b[1] - a[1]
    )[0]?.[0];

    return {
      total,
      centroTop,
      trabajadorTop,
    };
  }, [egresosFiltrados]);

  const centros = useMemo(
    () =>
      Array.from(
        new Set(egresos.map((e) => e.trabajador.centro))
      ),
    [egresos]
  );

  const trabajadores = useMemo(
    () =>
      Array.from(
        new Set(egresos.map((e) => e.trabajador.nombre))
      ),
    [egresos]
  );

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Gastos de EPP</h1>
      <p className="text-sm text-zinc-500">
        Vista filtrada según los criterios seleccionados
      </p>

      <div className="flex gap-2">
        <button
          onClick={() => exportGastosCSV(filasExport)}
          className="rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          📊 Exportar Excel
        </button>

        <button
          disabled
          className="rounded-lg border px-3 py-1.5 text-sm text-zinc-400"
        >
          📄 Exportar PDF (próximamente)
        </button>
      </div>

      {/* FILTROS */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          type="date"
          value={desde}
          onChange={(e) => setDesde(e.target.value)}
          className="input"
        />
        <input
          type="date"
          value={hasta}
          onChange={(e) => setHasta(e.target.value)}
          className="input"
        />
        <select
          value={centro}
          onChange={(e) => setCentro(e.target.value)}
          className="input"
        >
          <option value="">Todos los centros</option>
          {centros.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          value={trabajador}
          onChange={(e) => setTrabajador(e.target.value)}
          className="input"
        >
          <option value="">Todos los trabajadores</option>
          {trabajadores.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>

      {/* RESUMEN */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card
          title="Gasto total período"
          value={`$ ${resumen.total.toLocaleString("es-CL")}`}
        />
        <Card
          title="Centro con mayor gasto"
          value={resumen.centroTop ?? "—"}
        />
        <Card
          title="Trabajador con mayor gasto"
          value={resumen.trabajadorTop ?? "—"}
        />
      </div>

      {/* TABLA */}
      <div className="overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Centro</th>
              <th className="p-2 text-left">Trabajador</th>
              <th className="p-2 text-left">EPP</th>
              <th className="p-2 text-right">Cantidad</th>
              <th className="p-2 text-right">Costo ($)</th>
            </tr>
          </thead>
          <tbody>
            {egresosFiltrados.flatMap((e) =>
              e.items.map((item, i) => (
                <tr key={`${e.id}-${i}`} className="border-t">
                  <td className="p-2">
                    {new Date(e.fecha).toLocaleDateString()}
                  </td>
                  <td className="p-2">{e.trabajador.centro}</td>
                  <td className="p-2">{e.trabajador.nombre}</td>
                  <td className="p-2">
                    {item.epp}{" "}
                    {item.tallaNumero &&
                      `(${item.tallaNumero})`}
                  </td>
                  <td className="p-2 text-right">
                    {item.cantidad}
                  </td>
                  <td className="p-2 text-right">
                    {(item.costoTotal ?? 0).toLocaleString("es-CL")}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Card({
  title,
  value,
}: {
  title: string;
  value: string;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4">
      <p className="text-sm text-zinc-500">{title}</p>
      <p className="mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}
