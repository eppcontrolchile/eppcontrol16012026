// app/dashboard/gastos/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

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
    tallaNumero?: string | null;
    cantidad: number;
    costoTotal: number;
  }[];
  costoTotalEgreso: number;
};


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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reloadNonce, setReloadNonce] = useState(0);
  const [debug, setDebug] = useState<{ empresaId?: string; entregasCount?: number } | null>(null);

  const [ordenCampo, setOrdenCampo] = useState<
    "fecha" | "centro" | "trabajador" | "epp" | "cantidad" | "costo"
  >("fecha");
  const [ordenDireccion, setOrdenDireccion] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const supabase = supabaseBrowser();

        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr) throw userErr;
        if (!user) throw new Error("No autenticado");

        // Resolve empresa_id desde tabla usuarios
        const { data: usuarioRow, error: usuarioErr } = await supabase
          .from("usuarios")
          .select("empresa_id")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (usuarioErr) throw usuarioErr;
        const empresaId = usuarioRow?.empresa_id;
        if (!empresaId) throw new Error("No se pudo resolver empresa_id");
        if (!cancelled) setDebug({ empresaId });

        // Traer entregas + items para construir gastos
        const { data: entregas, error: entregasErr } = await supabase
          .from("entregas")
          .select(
            "id,fecha_entrega,costo_total_iva,trabajadores:trabajador_id(nombre,rut),centros_trabajo:centro_id(nombre),entrega_items(categoria,nombre_epp,talla,cantidad,costo_unitario_iva)"
          )
          .eq("empresa_id", empresaId)
          .order("fecha_entrega", { ascending: false });

        if (entregasErr) throw entregasErr;
        if (!cancelled) setDebug({ empresaId, entregasCount: (entregas ?? []).length });

        const egresosMap: Egreso[] = (entregas ?? []).map((e: any) => {
          const centroNombre = e?.centros_trabajo?.nombre ?? "";
          const trabajadorNombre = e?.trabajadores?.nombre ?? "";
          const trabajadorRut = e?.trabajadores?.rut ?? "";

          const items = Array.isArray(e?.entrega_items)
            ? e.entrega_items.map((it: any) => {
                const cantidad = Number(it?.cantidad ?? 0);
                const cu = Number(it?.costo_unitario_iva ?? 0);
                return {
                  categoria: String(it?.categoria ?? ""),
                  epp: String(it?.nombre_epp ?? ""),
                  tallaNumero: it?.talla ?? null,
                  cantidad,
                  costoTotal: cantidad * cu,
                };
              })
            : [];

          const costoTotalEgreso = Number(e?.costo_total_iva ?? 0);

          return {
            id: String(e?.id ?? ""),
            fecha: String(e?.fecha_entrega ?? ""),
            trabajador: {
              nombre: trabajadorNombre,
              rut: trabajadorRut,
              centro: centroNombre,
            },
            items,
            costoTotalEgreso,
          };
        });

        if (!cancelled) setEgresos(egresosMap);
      } catch (err: any) {
        console.error("GASTOS LOAD ERROR", err);
        if (!cancelled) {
          setError(err?.message ?? "Error cargando gastos");
          setDebug(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [reloadNonce]);

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

  const filasTabla = useMemo(() => {
    return egresosFiltrados.flatMap((e) =>
      e.items.map((item) => ({
        fechaISO: e.fecha, // para ordenar
        fecha: new Date(e.fecha).toLocaleDateString(),
        centro: e.trabajador.centro,
        trabajador: e.trabajador.nombre,
        epp: item.tallaNumero ? `${item.epp} (${item.tallaNumero})` : item.epp,
        cantidad: item.cantidad,
        costo: item.costoTotal ?? 0,
      }))
    );
  }, [egresosFiltrados]);

  const handleOrden = (
    campo: "fecha" | "centro" | "trabajador" | "epp" | "cantidad" | "costo"
  ) => {
    if (ordenCampo === campo) {
      setOrdenDireccion((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setOrdenCampo(campo);
      setOrdenDireccion("asc");
    }
  };

  const arrow = (
    campo: "fecha" | "centro" | "trabajador" | "epp" | "cantidad" | "costo"
  ) => {
    if (ordenCampo !== campo) return null;
    return ordenDireccion === "asc" ? " ▲" : " ▼";
  };

  const filasTablaOrdenadas = useMemo(() => {
    const arr = [...filasTabla];
    arr.sort((a, b) => {
      if (ordenCampo === "fecha") {
        const at = new Date(a.fechaISO).getTime();
        const bt = new Date(b.fechaISO).getTime();
        return ordenDireccion === "asc" ? at - bt : bt - at;
      }

      const aVal = (a as any)[ordenCampo];
      const bVal = (b as any)[ordenCampo];

      if (typeof aVal === "number" && typeof bVal === "number") {
        return ordenDireccion === "asc" ? aVal - bVal : bVal - aVal;
      }

      return ordenDireccion === "asc"
        ? String(aVal ?? "").localeCompare(String(bVal ?? ""))
        : String(bVal ?? "").localeCompare(String(aVal ?? ""));
    });
    return arr;
  }, [filasTabla, ordenCampo, ordenDireccion]);

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
      {loading && (
        <div className="rounded-lg border bg-white p-3 text-sm text-zinc-600">
          Cargando gastos...
        </div>
      )}
      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}
      {!loading && !error && egresos.length === 0 && (
        <div className="rounded-xl border bg-white p-4 text-sm">
          <p className="font-medium">Aún no hay gastos para mostrar.</p>
          <p className="mt-1 text-zinc-600">
            Si sabes que ya existen entregas, esto suele ser por permisos (RLS) o por empresa_id.
          </p>
          {debug && (
            <p className="mt-2 text-xs text-zinc-500">
              Debug: empresa_id={debug.empresaId ?? "—"} · entregas={
                typeof debug.entregasCount === "number" ? debug.entregasCount : "—"
              }
            </p>
          )}
          <button
            onClick={() => setReloadNonce((n) => n + 1)}
            className="mt-3 rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            Reintentar carga
          </button>
        </div>
      )}

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
              <th
                onClick={() => handleOrden("fecha")}
                className="p-2 text-left cursor-pointer select-none"
              >
                Fecha{arrow("fecha")}
              </th>
              <th
                onClick={() => handleOrden("centro")}
                className="p-2 text-left cursor-pointer select-none"
              >
                Centro{arrow("centro")}
              </th>
              <th
                onClick={() => handleOrden("trabajador")}
                className="p-2 text-left cursor-pointer select-none"
              >
                Trabajador{arrow("trabajador")}
              </th>
              <th
                onClick={() => handleOrden("epp")}
                className="p-2 text-left cursor-pointer select-none"
              >
                EPP{arrow("epp")}
              </th>
              <th
                onClick={() => handleOrden("cantidad")}
                className="p-2 text-right cursor-pointer select-none"
              >
                Cantidad{arrow("cantidad")}
              </th>
              <th
                onClick={() => handleOrden("costo")}
                className="p-2 text-right cursor-pointer select-none"
              >
                Costo ($){arrow("costo")}
              </th>
            </tr>
          </thead>
          <tbody>
            {filasTablaOrdenadas.map((r, i) => (
              <tr key={`${r.fechaISO}-${r.trabajador}-${r.epp}-${i}`} className="border-t">
                <td className="p-2">{r.fecha}</td>
                <td className="p-2">{r.centro}</td>
                <td className="p-2">{r.trabajador}</td>
                <td className="p-2">{r.epp}</td>
                <td className="p-2 text-right">{r.cantidad}</td>
                <td className="p-2 text-right">{r.costo.toLocaleString("es-CL")}</td>
              </tr>
            ))}
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
