// app/dashboard/centros/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type CentroTrabajo = {
  id: string;
  nombre: string;
  activo: boolean;
  trabajadoresActivos: number;
};

export default function CentrosPage() {
  const [centros, setCentros] = useState<CentroTrabajo[]>([]);
  const [nuevoCentro, setNuevoCentro] = useState("");
  const [error, setError] = useState("");
  const [fetchError, setFetchError] = useState("");

  const [ordenCampo, setOrdenCampo] = useState<
    "nombre" | "estado" | "trabajadores" | null
  >(null);
  const [ordenDireccion, setOrdenDireccion] = useState<
    "asc" | "desc"
  >("asc");

  const [verSoloActivos, setVerSoloActivos] = useState(true);

  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let channel: any;

    const fetchData = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabaseBrowser().auth.getUser();

      if (userError || !user) {
        setLoading(false);
        return;
      }

      const { data: usuario } = await supabaseBrowser()
        .from("usuarios")
        .select("empresa_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (!usuario?.empresa_id) {
        setLoading(false);
        return;
      }

      setEmpresaId(usuario.empresa_id);

      const { data: centrosDB, error: fetchError } = await supabaseBrowser()
        .from("centros_trabajo")
        .select("id, nombre, activo")
        .eq("empresa_id", usuario.empresa_id)
        .order("nombre");

      if (fetchError) {
        setFetchError(fetchError.message);
        setLoading(false);
        return;
      }

      // Contar trabajadores activos por centro
      const { data: trabajadoresDB, error: trabajadoresError } = await supabaseBrowser()
        .from("trabajadores")
        .select("centro_id")
        .eq("empresa_id", usuario.empresa_id)
        .eq("activo", true);

      if (trabajadoresError) {
        setFetchError(trabajadoresError.message);
        setLoading(false);
        return;
      }

      const counts = (trabajadoresDB || []).reduce<Record<string, number>>((acc, t: any) => {
        const key = t?.centro_id ?? "__sin_centro__";
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

      const centrosConConteo: CentroTrabajo[] = (centrosDB || []).map((c: any) => ({
        id: c.id,
        nombre: c.nombre,
        activo: c.activo,
        trabajadoresActivos: counts[c.id] || 0,
      }));

      setCentros(centrosConConteo);
      setLoading(false);

      channel = supabaseBrowser()
        .channel("centros_trabajo_changes")
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "centros_trabajo",
            filter: `empresa_id=eq.${usuario.empresa_id}`,
          },
          (payload) => {
            setCentros((prev) => {
              if (payload.eventType === "INSERT") {
                const n = payload.new as any;
                return [
                  ...prev,
                  {
                    id: n.id,
                    nombre: n.nombre,
                    activo: n.activo,
                    trabajadoresActivos: 0,
                  },
                ];
              }
              if (payload.eventType === "UPDATE") {
                const n = payload.new as any;
                return prev.map((c) =>
                  c.id === n.id
                    ? { ...c, nombre: n.nombre, activo: n.activo }
                    : c
                );
              }
              return prev;
            });
          }
        )
        .subscribe();
    };

    fetchData();

    return () => {
      if (channel) {
        supabaseBrowser().removeChannel(channel);
      }
    };
  }, []);

  const agregarCentro = async () => {
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

    if (!empresaId) return;

    const { data, error } = await supabaseBrowser()
      .from("centros_trabajo")
      .insert({
        empresa_id: empresaId,
        nombre: nuevoCentro.trim(),
        activo: true,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    setCentros((prev) => [...prev, data]);
    setNuevoCentro("");
  };

  const darDeBaja = async (id: string) => {
    const centro = centros.find((c) => c.id === id);
    if (!centro || !centro.activo) return;

    const confirmar = confirm(
      "¿Estás seguro de dar de baja este centro de trabajo?\n\n• El centro quedará inactivo\n• No podrá volver a activarse\n• No se perderá información histórica\n\nEsta acción no se puede deshacer."
    );

    if (!confirmar) return;

    await supabaseBrowser()
      .from("centros_trabajo")
      .update({ activo: false })
      .eq("id", id);

    setCentros((prev) =>
      prev.map((c) => (c.id === id ? { ...c, activo: false } : c))
    );
  };

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
      aVal = a.trabajadoresActivos;
      bVal = b.trabajadoresActivos;
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

  if (loading) {
    return <div className="text-zinc-500">Cargando centros…</div>;
  }

  if (fetchError) {
    return <div className="text-red-600">Error: {fetchError}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">
          Centros de trabajo
        </h1>
        <p className="text-sm text-zinc-500">
          Administra los centros de trabajo de tu empresa.<br />
          Los centros se gestionan centralizadamente y son utilizados en onboarding, trabajadores y egresos.<br />
          Un centro puede darse de baja solo si no tiene entregas asociadas. Si fue creado por error y ya tiene movimientos, solicita ayuda en soporte@eppcontrol.cl.
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
                className="p-3 cursor-pointer text-right"
              >
                Trabajadores activos{" "}
                {ordenCampo === "trabajadores" &&
                  (ordenDireccion === "asc" ? "▲" : "▼")}
              </th>
            </tr>
          </thead>
          <tbody>
            {centrosOrdenados.map((c) => {
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
                  <td className="p-3 text-right tabular-nums">
                    {c.trabajadoresActivos}
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
