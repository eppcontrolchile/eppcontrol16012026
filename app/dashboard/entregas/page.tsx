// app/dashboard/entregas/page.tsx
"use client";

import { useMemo, useState, useEffect } from "react";
import { generarPdfEntrega } from "@/app/utils/entrega-pdf";


export default function EntregasPage() {
  const empresa = {
    nombre: localStorage.getItem("companyName") || "",
    rut: localStorage.getItem("companyRut") || "",
    logo_url: localStorage.getItem("companyLogoUrl"),
  };
  const [nombre, setNombre] = useState("");
  const [rut, setRut] = useState("");
  const [centro, setCentro] = useState("");
  const [categoria, setCategoria] = useState("");
  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [firmaSeleccionada, setFirmaSeleccionada] = useState<string | null>(null);

  const [egresos, setEgresos] = useState<Egreso[]>([]);

  // Sorting state
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("egresos") || "[]");
    setEgresos(data);
  }, []);

  // Helper to handle sorting
  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }

  // Filtering (date filter fixed: use Date objects and inclusive end date)
  const entregasFiltradas = useMemo(() => {
    return egresos.filter((e) => {
      if (
        nombre &&
        !e.trabajador.nombre.toLowerCase().includes(nombre.toLowerCase())
      )
        return false;

      if (rut) {
        const rutFiltro = rut.replace(/\./g, "").toLowerCase();
        const rutTrabajador = e.trabajador.rut
          .replace(/\./g, "")
          .toLowerCase();

        if (!rutTrabajador.includes(rutFiltro)) return false;
      }

      if (
        centro &&
        !e.trabajador.centro.toLowerCase().includes(centro.toLowerCase())
      )
        return false;

      const fechaEgresoDate = new Date(e.fecha);

      if (desde) {
        const desdeDate = new Date(desde + "T00:00:00");
        if (fechaEgresoDate < desdeDate) return false;
      }

      if (hasta) {
        const hastaDate = new Date(hasta + "T23:59:59");
        if (fechaEgresoDate > hastaDate) return false;
      }

      return true;
    });
  }, [egresos, nombre, rut, centro, desde, hasta]);

  // Compose flat rows with egreso + item for sorting
  const rows = useMemo(() => {
    // Filter by categoria if set
    const filtered = categoria
      ? entregasFiltradas
          .map((e) => ({
            ...e,
            items: e.items.filter((item) => item.categoria === categoria),
          }))
          .filter((e) => e.items.length > 0)
      : entregasFiltradas;
    // Flatten rows
    let allRows: {
      egreso: Egreso;
      item: Egreso["items"][0];
      itemIdx: number;
    }[] = [];
    filtered.forEach((e) => {
      e.items.forEach((item, idx) => {
        allRows.push({ egreso: e, item, itemIdx: idx });
      });
    });
    // Sorting logic
    if (!sortKey) return allRows;
    const getValue = (row: typeof allRows[0]) => {
      switch (sortKey) {
        case "fecha":
          return row.egreso.fecha;
        case "trabajador.nombre":
          return row.egreso.trabajador.nombre;
        case "trabajador.rut":
          return row.egreso.trabajador.rut;
        case "trabajador.centro":
          return row.egreso.trabajador.centro;
        case "item.categoria":
          return row.item.categoria;
        case "item.epp":
          return row.item.epp;
        case "item.tallaNumero":
          return row.item.tallaNumero;
        case "item.cantidad":
          return row.item.cantidad;
        default:
          return "";
      }
    };
    return allRows.slice().sort((a, b) => {
      const va = getValue(a);
      const vb = getValue(b);
      if (typeof va === "number" && typeof vb === "number") {
        return sortDirection === "asc" ? va - vb : vb - va;
      }
      // For date string, compare as dates
      if (sortKey === "fecha") {
        const da = new Date(va as string).getTime();
        const db = new Date(vb as string).getTime();
        return sortDirection === "asc" ? da - db : db - da;
      }
      // Default: string comparison
      return sortDirection === "asc"
        ? String(va).localeCompare(String(vb), "es")
        : String(vb).localeCompare(String(va), "es");
    });
  }, [entregasFiltradas, categoria, sortKey, sortDirection]);

  // For visual cue in header
  const sortIndicator = (key: string) =>
    sortKey === key ? (sortDirection === "asc" ? " ▲" : " ▼") : "";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Entregas de EPP</h1>

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => window.print()}
          className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
        >
          Descargar vista (PDF)
        </button>

        <button
          onClick={() => window.print()}
          className="rounded border px-4 py-2 text-sm hover:bg-zinc-50"
        >
          Descargar todas las entregas (PDF)
        </button>
      </div>

      {firmaSeleccionada && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-lg p-4 max-w-md w-full">
            <h2 className="text-lg font-semibold mb-2">
              Firma del trabajador
            </h2>

            <img
              src={firmaSeleccionada}
              alt="Firma del trabajador"
              className="border rounded w-full h-auto"
            />

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setFirmaSeleccionada(null)}
                className="rounded bg-zinc-900 px-4 py-2 text-sm text-white hover:bg-zinc-800"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FILTROS */}
      <div className="grid grid-cols-1 gap-3 rounded border p-4 md:grid-cols-3">
        <input
          type="text"
          placeholder="Nombre trabajador"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
          className="input"
        />

        <input
          type="text"
          placeholder="RUT"
          value={rut}
          onChange={(e) => setRut(e.target.value)}
          className="input"
        />

        <input
          type="text"
          placeholder="Centro de trabajo"
          value={centro}
          onChange={(e) => setCentro(e.target.value)}
          className="input"
        />

        <select
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
          className="input"
        >
          <option value="">Todas las categorías</option>
          <option value="Cabeza">Cabeza</option>
          <option value="Manos">Manos</option>
          <option value="Ojos">Ojos</option>
          <option value="Respiratoria">Respiratoria</option>
          <option value="Pies">Pies</option>
        </select>

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
      </div>

      {/* TABLA */}
      <div className="overflow-x-auto rounded border">
        <table className="w-full text-sm">
          <thead className="bg-zinc-100">
            <tr>
              <th className="p-2 text-left">
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => handleSort("fecha")}
                >
                  Fecha{sortIndicator("fecha")}
                </button>
              </th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => handleSort("trabajador.nombre")}
                >
                  Trabajador{sortIndicator("trabajador.nombre")}
                </button>
              </th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => handleSort("trabajador.rut")}
                >
                  RUT{sortIndicator("trabajador.rut")}
                </button>
              </th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => handleSort("trabajador.centro")}
                >
                  Centro{sortIndicator("trabajador.centro")}
                </button>
              </th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => handleSort("item.categoria")}
                >
                  Categoría{sortIndicator("item.categoria")}
                </button>
              </th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => handleSort("item.epp")}
                >
                  EPP{sortIndicator("item.epp")}
                </button>
              </th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => handleSort("item.tallaNumero")}
                >
                  Talla / Nº{sortIndicator("item.tallaNumero")}
                </button>
              </th>
              <th className="p-2 text-left">
                <button
                  type="button"
                  className="font-semibold hover:underline"
                  onClick={() => handleSort("item.cantidad")}
                >
                  Cant.{sortIndicator("item.cantidad")}
                </button>
              </th>
              <th className="p-2 text-left">Firma</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="p-4 text-center text-zinc-500">
                  No hay resultados
                </td>
              </tr>
            )}
            {rows.map((row) => (
              <tr key={`${row.egreso.id}-${row.itemIdx}`} className="border-t">
                <td className="p-2">
                  {new Date(row.egreso.fecha).toLocaleDateString("es-CL")}
                </td>
                <td className="p-2">{row.egreso.trabajador.nombre}</td>
                <td className="p-2">{row.egreso.trabajador.rut}</td>
                <td className="p-2">{row.egreso.trabajador.centro}</td>
                <td className="p-2">{row.item.categoria}</td>
                <td className="p-2">{row.item.epp}</td>
                <td className="p-2">{row.item.tallaNumero}</td>
                <td className="p-2">{row.item.cantidad}</td>
                <td className="p-2">
                  <div className="flex gap-2">
                    <button
                      className="text-sky-600 underline"
                      onClick={() => setFirmaSeleccionada(row.egreso.firmaBase64)}
                    >
                      Ver
                    </button>
                    <button
                      className="text-zinc-700 underline"
                      onClick={() =>
                        generarPdfEntrega({
                          empresa,
                          egreso: row.egreso,
                        })
                      }
                    >
                      PDF
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
