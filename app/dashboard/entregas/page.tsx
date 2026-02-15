// app/dashboard/entregas/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Entrega = {
  id: string;
  fecha: string;
  total_unidades: number;
  costo_total_iva: number;
  pdf_url: string | null;
  trabajador: {
    nombre: string;
    rut: string;
  };
  centro: string;
};

// Helpers para parsear fechas correctamente como LOCAL (YYYY-MM-DD)
function parseDateFlexible(input: string): Date {
  const s = (input || "").toString().trim();
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(y, mo - 1, d);
  }
  return new Date(s);
}

function formatFechaCL(value?: string | null) {
  if (!value) return "—";
  const d = parseDateFlexible(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("es-CL");
}

function formatCLP(value?: number | null) {
  if (value === null || value === undefined) return "—";
  return `$${value.toLocaleString("es-CL")}`;
}

function firstRel<T>(rel: any): T | null {
  if (!rel) return null;
  return Array.isArray(rel) ? (rel[0] ?? null) : rel;
}

export default function EntregasPage() {
  const [entregas, setEntregas] = useState<Entrega[]>([]);
  const [loading, setLoading] = useState(true);

  const [ordenCampo, setOrdenCampo] = useState<
    "fecha" | "trabajador" | "rut" | "centro" | "total_unidades" | "costo_total_iva" | null
  >(null);
  const [ordenDireccion, setOrdenDireccion] = useState<"asc" | "desc">("desc");

  const [fDesde, setFDesde] = useState<string>("");
  const [fHasta, setFHasta] = useState<string>("");
  const [fTrabajador, setFTrabajador] = useState<string>("");
  const [fRut, setFRut] = useState<string>("");
  const [fCentro, setFCentro] = useState<string>("");

  const norm = (v: string) => (v || "").toString().trim().toLowerCase();

  const endOfDay = (d: Date) => {
    const x = new Date(d);
    x.setHours(23, 59, 59, 999);
    return x;
  };

  const centrosDisponibles = useMemo(() => {
    return Array.from(new Set(entregas.map((e) => e.centro).filter(Boolean)))
      .sort((a, b) => a.localeCompare(b));
  }, [entregas]);

  const entregasFiltradas = useMemo(() => {
    const desdeT = fDesde ? parseDateFlexible(fDesde).getTime() : null;
    const hastaT = fHasta ? endOfDay(parseDateFlexible(fHasta)).getTime() : null;

    const qTrab = norm(fTrabajador);
    const qRut = norm(fRut);
    const qCentro = norm(fCentro);

    return entregas.filter((e) => {
      const t = parseDateFlexible(e.fecha).getTime();
      if (desdeT !== null && t < desdeT) return false;
      if (hastaT !== null && t > hastaT) return false;

      if (qTrab) {
        const nombre = norm(e.trabajador?.nombre || "");
        if (!nombre.includes(qTrab)) return false;
      }

      if (qRut) {
        const rut = norm(e.trabajador?.rut || "");
        if (!rut.includes(qRut)) return false;
      }

      if (qCentro) {
        const centro = norm(e.centro || "");
        if (!centro.includes(qCentro)) return false;
      }

      return true;
    });
  }, [entregas, fDesde, fHasta, fTrabajador, fRut, fCentro]);

  useEffect(() => {
    const fetchEntregas = async () => {
      setLoading(true);

      const { data: auth } = await supabaseBrowser().auth.getUser();
      if (!auth?.user) return;

      const { data: usuario } = await supabaseBrowser()
        .from("usuarios")
        .select("empresa_id")
        .eq("auth_user_id", auth.user.id)
        .maybeSingle();

      if (!usuario?.empresa_id) return;

      const { data, error } = await supabaseBrowser()
        .from("entregas")
        .select(`
          id,
          fecha_entrega,
          total_unidades,
          costo_total_iva,
          pdf_url,
          trabajadores:trabajador_id ( nombre, rut ),
          centros_trabajo:centro_id ( nombre )
        `)
        .eq("empresa_id", usuario.empresa_id)
        .order("fecha_entrega", { ascending: false });

      if (!error && data) {
        const entregasFormateadas: Entrega[] = data.map((e: any) => ({
          id: e.id,
          fecha: e.fecha_entrega,
          total_unidades: e.total_unidades,
          costo_total_iva: e.costo_total_iva,
          pdf_url: e.pdf_url ?? null,
          trabajador: {
            nombre: (firstRel<{ nombre?: string; rut?: string }>(e.trabajadores)?.nombre ?? "—").trim() || "—",
            rut: (firstRel<{ nombre?: string; rut?: string }>(e.trabajadores)?.rut ?? "—").trim() || "—",
          },
          centro: (firstRel<{ nombre?: string }>(e.centros_trabajo)?.nombre ?? "—").trim() || "—",
        }));

        setEntregas(entregasFormateadas);
      }

      setLoading(false);
    };

    fetchEntregas();
  }, []);

  const entregasOrdenadas = [...entregasFiltradas].sort((a, b) => {
    if (!ordenCampo) return 0;

    let aVal: any;
    let bVal: any;

    switch (ordenCampo) {
      case "fecha":
        aVal = parseDateFlexible(a.fecha).getTime();
        bVal = parseDateFlexible(b.fecha).getTime();
        break;
      case "trabajador":
        aVal = a.trabajador.nombre;
        bVal = b.trabajador.nombre;
        break;
      case "rut":
        aVal = a.trabajador.rut;
        bVal = b.trabajador.rut;
        break;
      case "centro":
        aVal = a.centro;
        bVal = b.centro;
        break;
      case "total_unidades":
        aVal = a.total_unidades;
        bVal = b.total_unidades;
        break;
      case "costo_total_iva":
        aVal = a.costo_total_iva;
        bVal = b.costo_total_iva;
        break;
      default:
        return 0;
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return ordenDireccion === "asc" ? aVal - bVal : bVal - aVal;
    }

    return ordenDireccion === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  const handleOrden = (
    campo: "fecha" | "trabajador" | "rut" | "centro" | "total_unidades" | "costo_total_iva"
  ) => {
    if (ordenCampo === campo) {
      setOrdenDireccion((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setOrdenCampo(campo);
      setOrdenDireccion("asc");
    }
  };

  if (loading) {
    return <p className="text-sm text-zinc-500">Cargando entregas…</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Entregas de EPP</h1>
      <div className="rounded-lg border bg-white p-4">
        <div className="grid gap-3 md:grid-cols-5">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">Desde</label>
            <input
              type="date"
              value={fDesde}
              onChange={(e) => setFDesde(e.target.value)}
              className="input h-10"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Hasta</label>
            <input
              type="date"
              value={fHasta}
              onChange={(e) => setFHasta(e.target.value)}
              className="input h-10"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Trabajador</label>
            <input
              value={fTrabajador}
              onChange={(e) => setFTrabajador(e.target.value)}
              placeholder="Nombre…"
              className="input h-10"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">RUT</label>
            <input
              value={fRut}
              onChange={(e) => setFRut(e.target.value)}
              placeholder="12.345.678-9…"
              className="input h-10"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">Centro</label>
            <select
              value={fCentro}
              onChange={(e) => setFCentro(e.target.value)}
              className="input h-10"
            >
              <option value="">Todos…</option>
              {centrosDisponibles.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-xs text-zinc-500">
            Mostrando <b>{entregasFiltradas.length}</b> de <b>{entregas.length}</b>
          </div>

          <div className="flex gap-2 justify-end">
            <button
              type="button"
              onClick={() => {
                setFDesde("");
                setFHasta("");
                setFTrabajador("");
                setFRut("");
                setFCentro("");
              }}
              className="rounded border px-4 py-2 text-sm font-medium hover:bg-zinc-50"
            >
              Limpiar
            </button>

            <button
              onClick={async () => {
                const { data: auth } = await supabaseBrowser().auth.getUser();
                if (!auth?.user) return;

                const { data: usuario } = await supabaseBrowser()
                  .from("usuarios")
                  .select("empresa_id")
                  .eq("auth_user_id", auth.user.id)
                  .maybeSingle();

                if (!usuario?.empresa_id) return;

                const url = `/api/reportes/entregas-excel?empresa_id=${usuario.empresa_id}`;
                window.location.href = url;
              }}
              className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Exportar Excel
            </button>
          </div>
        </div>
      </div>

      {entregas.length === 0 && (
        <p className="text-sm text-zinc-500">No hay entregas registradas.</p>
      )}

      {entregas.length > 0 && entregasFiltradas.length === 0 && (
        <p className="text-sm text-zinc-500">No hay resultados para los filtros seleccionados.</p>
      )}

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {entregas.map((e) => (
          <div key={e.id} className="rounded-lg border bg-white p-3">
            <div className="text-sm text-zinc-600">{formatFechaCL(e.fecha)}</div>

            <div className="mt-2">
              <div className="text-xs text-zinc-500">Trabajador</div>
              <div className="font-medium text-zinc-900">{e.trabajador.nombre}</div>
              <div className="text-sm text-zinc-600">{e.trabajador.rut}</div>
            </div>

            <div className="mt-2">
              <div className="text-xs text-zinc-500">Centro</div>
              <div className="font-medium text-zinc-900">{e.centro}</div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <div className="text-xs text-zinc-500">Unidades</div>
                <div className="font-medium text-zinc-900">{e.total_unidades}</div>
              </div>
              <div>
                <div className="text-xs text-zinc-500">Total IVA</div>
                <div className="font-medium text-zinc-900">{formatCLP(e.costo_total_iva)}</div>
              </div>
            </div>

            <div className="mt-3">
              {e.pdf_url ? (
                <div className="flex gap-3">
                  <a
                    href={e.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sky-600 underline"
                  >
                    Ver PDF
                  </a>
                  <a href={e.pdf_url} download className="text-zinc-700 underline">
                    Descargar
                  </a>
                </div>
              ) : (
                <span className="text-zinc-400">No disponible</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Desktop: table */}
      <div className="hidden overflow-x-auto rounded border md:block">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100">
            <tr>
              <th
                onClick={() => handleOrden("fecha")}
                className="cursor-pointer p-2 text-left"
              >
                Fecha {ordenCampo === "fecha" && (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
              <th
                onClick={() => handleOrden("trabajador")}
                className="cursor-pointer p-2 text-left"
              >
                Trabajador {ordenCampo === "trabajador" && (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
              <th
                onClick={() => handleOrden("rut")}
                className="cursor-pointer p-2 text-left"
              >
                RUT {ordenCampo === "rut" && (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
              <th
                onClick={() => handleOrden("centro")}
                className="cursor-pointer p-2 text-left"
              >
                Centro {ordenCampo === "centro" && (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
              <th
                onClick={() => handleOrden("total_unidades")}
                className="cursor-pointer p-2 text-right"
              >
                Unidades {ordenCampo === "total_unidades" && (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
              <th
                onClick={() => handleOrden("costo_total_iva")}
                className="cursor-pointer p-2 text-right"
              >
                Total IVA {ordenCampo === "costo_total_iva" && (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
              <th className="p-2 text-left">PDF</th>
            </tr>
          </thead>
          <tbody>
            {entregasOrdenadas.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="whitespace-nowrap p-2">{formatFechaCL(e.fecha)}</td>
                <td className="p-2">{e.trabajador.nombre}</td>
                <td className="whitespace-nowrap p-2">{e.trabajador.rut}</td>
                <td className="p-2">{e.centro}</td>
                <td className="whitespace-nowrap p-2 text-right">{e.total_unidades}</td>
                <td className="whitespace-nowrap p-2 text-right">{formatCLP(e.costo_total_iva)}</td>
                <td className="p-2">
                  {e.pdf_url ? (
                    <div className="flex gap-2">
                      <a
                        href={e.pdf_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sky-600 underline"
                      >
                        Ver
                      </a>
                      <a href={e.pdf_url} download className="text-zinc-700 underline">
                        Descargar
                      </a>
                    </div>
                  ) : (
                    <span className="text-zinc-400">No disponible</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
