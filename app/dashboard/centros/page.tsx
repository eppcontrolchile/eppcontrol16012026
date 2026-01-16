// app/dashboard/centros/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type CentroTrabajo = {
  id: string;
  nombre: string;
  activo: boolean;
};

type Trabajador = {
  id: string;
  centroTrabajo: string;
};

export default function CentrosPage() {
  const [centros, setCentros] = useState<CentroTrabajo[]>([]);
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [nuevoCentro, setNuevoCentro] = useState("");
  const [error, setError] = useState("");

  const [ordenCampo, setOrdenCampo] = useState<
    "nombre" | "estado" | "trabajadores" | null
  >(null);
  const [ordenDireccion, setOrdenDireccion] = useState<
    "asc" | "desc"
  >("asc");

  const [verSoloActivos, setVerSoloActivos] = useState(true);

  // Cargar centros y trabajadores
  useEffect(() => {
    const storedCentros =
      JSON.parse(localStorage.getItem("centrosTrabajo") || "[]");

    const storedTrabajadores =
      JSON.parse(localStorage.getItem("trabajadores") || "[]");

    setCentros(storedCentros);
    setTrabajadores(storedTrabajadores);
  }, []);

  const guardarCentros = (data: CentroTrabajo[]) => {
    setCentros(data);
    localStorage.setItem("centrosTrabajo", JSON.stringify(data));
  };

  const agregarCentro = () => {
    setError("");

    if (!nuevoCentro.trim()) {
      setError("El nombre del centro no puede estar vacío.");
      return;
    }

    const existe = centros.some(
      (c) =>
        c.nombre.toLowerCase() === nuevoCentro.trim().toLowerCase()
    );

    if (existe) {
      setError("Ya existe un centro con ese nombre.");
      return;
    }

    const nuevo: CentroTrabajo = {
      id: crypto.randomUUID(),
      nombre: nuevoCentro.trim(),
      activo: true,
    };

    guardarCentros([...centros, nuevo]);
    setNuevoCentro("");
  };

  const darDeBaja = (id: string) => {
    const centro = centros.find((c) => c.id === id);
    if (!centro || !centro.activo) return;

    const trabajadoresAsignados = trabajadores.filter(
      (t) => t.centroTrabajo === centro.nombre
    );

    if (trabajadoresAsignados.length > 0) {
      alert(
        "Este centro tiene trabajadores asignados. Reasígnalos antes de darlo de baja."
      );
      return;
    }

    const confirmar = confirm(
      "¿Estás seguro de dar de baja este centro de trabajo?\n\n• El centro quedará inactivo\n• No podrá volver a activarse\n• No se perderá información histórica\n\nEsta acción no se puede deshacer."
    );

    if (!confirmar) return;

    const actualizados = centros.map((c) =>
      c.id === id ? { ...c, activo: false } : c
    );

    guardarCentros(actualizados);
  };

  const contarTrabajadores = (nombreCentro: string) =>
    trabajadores.filter(
      (t) => t.centroTrabajo === nombreCentro
    ).length;

  const ordenar = (
    campo: "nombre" | "estado" | "trabajadores"
  ) => {
    if (ordenCampo === campo) {
      setOrdenDireccion(
        ordenDireccion === "asc" ? "desc" : "asc"
      );
    } else {
      setOrdenCampo(campo);
      setOrdenDireccion("asc");
    }
  };

  const centrosFiltrados = verSoloActivos
    ? centros.filter((c) => c.activo)
    : centros;

  const centrosOrdenados = [...centrosFiltrados].sort((a, b) => {
    if (!ordenCampo) return 0;

    let aVal: string | number = "";
    let bVal: string | number = "";

    if (ordenCampo === "nombre") {
      aVal = a.nombre.toLowerCase();
      bVal = b.nombre.toLowerCase();
    }

    if (ordenCampo === "estado") {
      aVal = a.activo ? 1 : 0;
      bVal = b.activo ? 1 : 0;
    }

    if (ordenCampo === "trabajadores") {
      aVal = contarTrabajadores(a.nombre);
      bVal = contarTrabajadores(b.nombre);
    }

    if (typeof aVal === "number" && typeof bVal === "number") {
      return ordenDireccion === "asc"
        ? aVal - bVal
        : bVal - aVal;
    }

    return ordenDireccion === "asc"
      ? String(aVal).localeCompare(String(bVal))
      : String(bVal).localeCompare(String(aVal));
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Centros de trabajo
        </h1>
        <p className="text-sm text-zinc-500">
          Administra los centros activos de tu empresa.
          Los centros con trabajadores asignados no pueden
          darse de baja.
        </p>

        <div className="mt-3 flex items-center gap-3 text-sm">
          <span className="text-zinc-600">Mostrar:</span>

          <button
            onClick={() => setVerSoloActivos(true)}
            className={`rounded-full px-3 py-1 ${
              verSoloActivos
                ? "bg-sky-600 text-white"
                : "border text-zinc-600"
            }`}
          >
            Solo activos
          </button>

          <button
            onClick={() => setVerSoloActivos(false)}
            className={`rounded-full px-3 py-1 ${
              !verSoloActivos
                ? "bg-sky-600 text-white"
                : "border text-zinc-600"
            }`}
          >
            Todos
          </button>
        </div>
      </div>

      {/* Agregar centro */}
      <div className="rounded-lg border bg-white p-4 space-y-2">
        <h2 className="font-medium">
          Agregar centro de trabajo
        </h2>

        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Ej: Casa Matriz, Bodega Central"
            value={nuevoCentro}
            onChange={(e) => setNuevoCentro(e.target.value)}
          />
          <button
            onClick={agregarCentro}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Agregar
          </button>
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}
      </div>

      {/* Tabla */}
      <div className="rounded-lg border bg-white">
        <table className="w-full text-sm">
          <thead className="bg-zinc-50 text-left">
            <tr>
              <th
                onClick={() => ordenar("nombre")}
                className="p-3 cursor-pointer"
              >
                Centro de trabajo{" "}
                {ordenCampo === "nombre" &&
                  (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
              <th
                onClick={() => ordenar("estado")}
                className="p-3 cursor-pointer"
              >
                Estado{" "}
                {ordenCampo === "estado" &&
                  (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
              <th
                onClick={() => ordenar("trabajadores")}
                className="p-3 cursor-pointer"
              >
                Trabajadores asignados{" "}
                {ordenCampo === "trabajadores" &&
                  (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
            </tr>
          </thead>
          <tbody>
            {centrosOrdenados.map((c) => {
              const total = contarTrabajadores(c.nombre);

              return (
                <tr
                  key={c.id}
                  className="border-t"
                >
                  <td className="p-3">{c.nombre}</td>
                  <td className="p-3">
                    <div className="flex items-center gap-3">
                      <button
                        disabled={!c.activo}
                        onClick={() => darDeBaja(c.id)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition ${
                          c.activo
                            ? "bg-green-500"
                            : "bg-zinc-300 cursor-not-allowed"
                        }`}
                        title={
                          c.activo
                            ? "Dar de baja este centro (acción irreversible)"
                            : "Centro dado de baja (no reversible)"
                        }
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                            c.activo ? "translate-x-6" : "translate-x-1"
                          }`}
                        />
                      </button>

                      <span
                        className={`text-sm ${
                          c.activo ? "text-green-600" : "text-zinc-400"
                        }`}
                      >
                        {c.activo ? "Activo" : "Inactivo"}
                      </span>
                    </div>

                    {!c.activo && (
                      <p className="mt-1 text-xs text-zinc-400">
                        Centro dado de baja (no reversible)
                      </p>
                    )}
                  </td>
                  <td className="p-3">
                    {total > 0 ? (
                      <Link
                        href={`/dashboard/trabajadores?centro=${encodeURIComponent(
                          c.nombre
                        )}`}
                        className="text-sky-600 hover:underline"
                      >
                        {total}
                      </Link>
                    ) : (
                      0
                    )}
                  </td>
                </tr>
              );
            })}

            {centros.length === 0 && (
              <tr>
                <td
                  colSpan={3}
                  className="p-4 text-center text-zinc-500"
                >
                  Aún no hay centros de trabajo creados.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
