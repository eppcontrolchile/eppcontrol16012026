// app/dashboard/trabajadores/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import type React from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import Link from "next/link";

type Trabajador = {
  id: string;
  nombre: string;
  rut: string;
  email?: string;
  centro_id: string;
  talla?: string;
  numero_calzado?: string;
  created_at: string;
  activo: boolean;
};

type CentroTrabajo = {
  id: string;
  nombre: string;
  activo: boolean;
};

type EntregaResumen = {
  fecha_entrega: string; // date
  trabajador_id: string;
  costo_total_iva: number | null;
};

function validarRut(rut: string) {
  const limpio = rut.replace(/\./g, "").toUpperCase();

  if (!/^\d{7,8}-[0-9K]$/.test(limpio)) return false;

  const [cuerpo, dv] = limpio.split("-");
  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplo;
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }

  const resto = 11 - (suma % 11);
  const dvEsperado =
    resto === 11 ? "0" : resto === 10 ? "K" : resto.toString();

  return dv === dvEsperado;
}

function normalizeRut(input: string) {
  const raw = String(input ?? "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/[^0-9K-]/g, "");

  if (!raw) return "";

  if (raw.includes("-")) {
    const [body, dv] = raw.split("-");
    const b = (body || "").replace(/\D/g, "");
    const d = (dv || "").slice(0, 1);
    if (!b || !d) return "";
    return `${b}-${d}`;
  }

  // sin guión → último char es DV
  const dv = raw.slice(-1);
  const body = raw.slice(0, -1).replace(/\D/g, "");
  if (!body || !dv) return "";
  return `${body}-${dv}`;
}


export default function TrabajadoresPage() {
  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [nuevo, setNuevo] = useState({
    nombre: "",
    rut: "",
    email: "",
    centro: "",
  });

  const [centros, setCentros] = useState<CentroTrabajo[]>([]);
  const [filtroEstado, setFiltroEstado] = useState<"activos" | "inactivos" | "todos">("activos");
  const [planUsage, setPlanUsage] = useState<{alcanzado: boolean, limite: number}>({alcanzado: false, limite: 0});
  const [entregasResumen, setEntregasResumen] = useState<EntregaResumen[]>([]);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<"nombre" | "rut" | "estado" | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");


  useEffect(() => {
    // Get current user and empresa_id
    async function fetchUserData() {
      const { data: { user } } = await supabaseBrowser().auth.getUser();
      if (!user) {
        // Not authenticated
        setTrabajadores([]);
        setCentros([]);
        setEmpresaId(null);
        return;
      }
      // Fetch empresa_id from usuarios table, not user_metadata
      const { data: usuarioRow, error: usuarioError } = await supabaseBrowser()
        .from("usuarios")
        .select("empresa_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (usuarioError || !usuarioRow?.empresa_id) {
        setTrabajadores([]);
        setCentros([]);
        setEmpresaId(null);
        return;
      }

      const empresa_id = usuarioRow.empresa_id;
      setEmpresaId(empresa_id);

      // Fetch trabajadores
      const { data: trabajadoresData, error: trabajadoresError } = await supabaseBrowser()
        .from("trabajadores")
        .select("*")
        .eq("empresa_id", empresa_id)
        .order("nombre");
      if (!trabajadoresError && trabajadoresData) {
        setTrabajadores(trabajadoresData as Trabajador[]);
      }
      // Fetch centros de trabajo
      const { data: centrosData, error: centrosError } = await supabaseBrowser()
        .from("centros_trabajo")
        .select("*")
        .eq("empresa_id", empresa_id)
        .eq("activo", true);
      if (!centrosError && centrosData) {
        setCentros(centrosData as CentroTrabajo[]);
      }
      // Fetch entregas (para métricas de gasto)
      const { data: entregasData, error: entregasError } = await supabaseBrowser()
        .from("entregas")
        .select("fecha_entrega, trabajador_id, costo_total_iva")
        .eq("empresa_id", empresa_id);
      if (!entregasError && entregasData) {
        setEntregasResumen(entregasData as EntregaResumen[]);
      }
      // Fetch plan usage from API
      try {
        const res = await fetch("/api/plan-usage");
        if (res.ok) {
          const usage = await res.json();
          setPlanUsage(usage);
        }
      } catch {}
    }
    fetchUserData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!menuOpenId) return;
    const onDown = () => setMenuOpenId(null);
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [menuOpenId]);

  async function agregarTrabajador() {
    if (!nuevo.nombre || !nuevo.rut || !nuevo.centro) {
      alert("Debes completar nombre, RUT y centro de trabajo.");
      return;
    }
    const rutNormalizado = normalizeRut(nuevo.rut);
    if (!validarRut(rutNormalizado)) {
      alert("El RUT ingresado no es válido. Usa formato XXXXXXXX-X.");
      return;
    }
    if (!empresaId) return;
    // Insert trabajador in Supabase
    const { data, error } = await supabaseBrowser()
      .from("trabajadores")
      .insert([
        {
          nombre: nuevo.nombre,
          rut: rutNormalizado,
          email: nuevo.email || null,
          centro_id: nuevo.centro,
          activo: true,
          empresa_id: empresaId,
        },
      ])
      .select();
    if (error) {
      alert("Error al agregar trabajador: " + error.message);
      return;
    }
    // Refresh list
    if (data && data.length > 0) {
      setTrabajadores([...trabajadores, data[0] as Trabajador]);
    }
    setNuevo({ nombre: "", rut: "", email: "", centro: "" });
  }

  async function actualizarCampo(
    id: string,
    campo: keyof Trabajador,
    valor: string
  ) {
    // Update in Supabase
    const { error } = await supabaseBrowser()
      .from("trabajadores")
      .update({ [campo]: valor })
      .eq("id", id);
    if (error) {
      alert("Error al actualizar trabajador: " + error.message);
      return;
    }
    // Update local state
    const actualizado = trabajadores.map((t) =>
      t.id === id ? { ...t, [campo]: valor } : t
    );
    setTrabajadores(actualizado);
  }

  async function setTrabajadorActivo(id: string, activo: boolean) {
    if (!activo) {
      const ok = window.confirm(
        "¿Dar de baja a este trabajador? Puedes volver a activarlo después."
      );
      if (!ok) return;
    }

    const { error } = await supabaseBrowser()
      .from("trabajadores")
      .update({ activo })
      .eq("id", id);

    if (error) {
      alert("Error al actualizar estado: " + error.message);
      return;
    }

    setTrabajadores((prev) =>
      prev.map((t) => (t.id === id ? { ...t, activo } : t))
    );
  }

  async function handleCargaMasiva(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file || !empresaId) return;

    // Centros normalizados solo para matching (no para guardar)
    const centrosValidos = centros.map((c) => ({
      id: c.id,
      nombreNorm: c.nombre
        .trim()
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, ""),
    }));

    const reader = new FileReader();

    reader.onload = async () => {
      let text = "";

      if (reader.result instanceof ArrayBuffer) {
        // Intentar UTF-8 primero, fallback ISO-8859-1
        try {
          text = new TextDecoder("utf-8", { fatal: true }).decode(reader.result);
        } catch {
          text = new TextDecoder("iso-8859-1").decode(reader.result);
        }
      } else if (typeof reader.result === "string") {
        text = reader.result;
      }

      text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

      const rows = text
        .split("\n")
        .slice(1)
        .filter((r) => r.trim() !== "");

      const errores: string[] = [];
      const nuevos: any[] = [];

      rows.forEach((row, index) => {
        const cols = row.split(";");
        if (cols.length < 6) return;

        const nombre = cols[0]?.trim();
        const rutRaw = cols[1]?.trim() || "";
        const rut = normalizeRut(rutRaw);
        const email = cols[2]?.trim() || null;
        const centroRaw = cols[3]?.trim();
        const talla = cols[4]?.trim() || null;
        const numero_calzado = cols[5]?.trim() || null;

        if (!nombre || !rut || !centroRaw) return;

        if (!validarRut(rut)) {
          errores.push(`Fila ${index + 2}: RUT inválido (${rutRaw})`);
          return;
        }

        const centroNorm = centroRaw
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");

        const centroMatch = centrosValidos.find(
          (c) => c.nombreNorm === centroNorm
        );

        if (!centroMatch) {
          errores.push(
            `Fila ${index + 2}: centro inexistente (${centroRaw})`
          );
          return;
        }

        nuevos.push({
          nombre, // se guarda con acentos intactos
          rut,
          email,
          centro_id: centroMatch.id,
          talla,
          numero_calzado,
          activo: true,
          empresa_id: empresaId,
        });
      });

      if (errores.length > 0) {
        alert(
          "No se pudo completar la carga:\n\n" + errores.join("\n")
        );
        return;
      }

      if (nuevos.length === 0) {
        alert("No se encontraron filas válidas.");
        return;
      }

      const { data, error } = await supabaseBrowser()
        .from("trabajadores")
        .insert(nuevos)
        .select();

      if (error) {
        alert("Error al cargar trabajadores: " + error.message);
        return;
      }

      if (data) {
        setTrabajadores((prev) => [...prev, ...(data as Trabajador[])]);
      }

      alert("Carga masiva completada correctamente.");
    };

    reader.readAsArrayBuffer(file);
  }

  function gastoMes(trabajadorId: string) {
    const ahora = new Date();
    return entregasResumen
      .filter((e) => {
        const d = new Date(e.fecha_entrega);
        return (
          e.trabajador_id === trabajadorId &&
          d.getMonth() === ahora.getMonth() &&
          d.getFullYear() === ahora.getFullYear()
        );
      })
      .reduce((s, e) => s + (e.costo_total_iva ?? 0), 0);
  }

  function promedio6Meses(trabajador: Trabajador) {
    const creado = new Date(trabajador.created_at);
    const ahora = new Date();

    const mesesDesdeCreacion =
      (ahora.getFullYear() - creado.getFullYear()) * 12 +
      (ahora.getMonth() - creado.getMonth()) +
      1;

    const mesesConsiderados = Math.min(6, Math.max(1, mesesDesdeCreacion));

    const gastos = entregasResumen.filter((e) => {
      const d = new Date(e.fecha_entrega);
      const diffMeses =
        (ahora.getFullYear() - d.getFullYear()) * 12 +
        (ahora.getMonth() - d.getMonth());
      return e.trabajador_id === trabajador.id && diffMeses < mesesConsiderados;
    });

    const total = gastos.reduce((s, e) => s + (e.costo_total_iva ?? 0), 0);

    return total / mesesConsiderados;
  }

  function ordenar(key: "nombre" | "rut" | "estado") {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const trabajadoresFiltrados = useMemo(() => {
    const base = trabajadores.filter((t) => {
      if (filtroEstado === "activos") return t.activo === true;
      if (filtroEstado === "inactivos") return t.activo === false;
      return true;
    });

    if (!sortKey) return base;

    return [...base].sort((a, b) => {
      let av: any;
      let bv: any;

      if (sortKey === "nombre") {
        av = a.nombre.toLowerCase();
        bv = b.nombre.toLowerCase();
      } else if (sortKey === "rut") {
        av = a.rut;
        bv = b.rut;
      } else {
        av = a.activo ? 1 : 0;
        bv = b.activo ? 1 : 0;
      }

      if (av < bv) return sortDir === "asc" ? -1 : 1;
      if (av > bv) return sortDir === "asc" ? 1 : -1;
      return 0;
    });
  }, [trabajadores, filtroEstado, sortKey, sortDir]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">Trabajadores</h1>
          <div className="flex-shrink-0">
            <select
              className="input w-[140px] max-w-[140px] flex-shrink-0"
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value as "activos" | "inactivos" | "todos")}
            >
              <option value="activos">Activos</option>
              <option value="inactivos">Inactivos</option>
              <option value="todos">Todos</option>
            </select>
          </div>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div className="flex flex-wrap items-center gap-2 justify-start md:justify-end">
            <button
              type="button"
              onClick={() => {
                const csv =
                  "Nombre;RUT;Email;Centro de trabajo;Talla;Número de calzado\n";
                const blob = new Blob([csv], {
                  type: "text/csv;charset=utf-8;",
                });
                const url = URL.createObjectURL(blob);
                const link = document.createElement("a");
                link.href = url;
                link.setAttribute("download", "plantilla_trabajadores.csv");
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
              }}
              className="rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50 whitespace-nowrap"
            >
              📄 Descargar plantilla
            </button>

            {planUsage.alcanzado ? (
              <div className="rounded-lg border px-3 py-1.5 text-sm text-zinc-400 cursor-not-allowed whitespace-nowrap">
                📥 Carga masiva (límite alcanzado)
              </div>
            ) : (
              <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50 whitespace-nowrap">
                📥 Carga masiva
                <input
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => handleCargaMasiva(e)}
                />
              </label>
            )}
          </div>

          <div className="text-xs text-zinc-500 max-w-xl">
            La carga masiva soporta archivos CSV en UTF-8. Los nombres de centro y trabajadores serán
            normalizados (sin acentos). Si tienes problemas con acentos, guarda tu archivo como UTF-8.
            <br />
            El formato esperado es: Nombre;RUT;Email;Centro de trabajo;Talla;Número de calzado
          </div>
        </div>
      </div>

      {/* Alta */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <input
          className="input"
          placeholder="Nombre"
          value={nuevo.nombre}
          onChange={(e) =>
            setNuevo({ ...nuevo, nombre: e.target.value })
          }
        />
        <input
          className="input"
          placeholder="RUT"
          value={nuevo.rut}
          onChange={(e) =>
            setNuevo({ ...nuevo, rut: e.target.value })
          }
        />
        <input
          className="input"
          placeholder="Email (opcional)"
          value={nuevo.email}
          onChange={(e) =>
            setNuevo({ ...nuevo, email: e.target.value })
          }
        />
        <select
          className="input"
          value={nuevo.centro}
          onChange={(e) =>
            setNuevo({ ...nuevo, centro: e.target.value })
          }
        >
          <option value="">Selecciona un centro de trabajo</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button
          onClick={agregarTrabajador}
          disabled={planUsage.alcanzado}
          className={`rounded-lg px-4 py-2 text-sm text-white ${
            planUsage.alcanzado
              ? "bg-zinc-400 cursor-not-allowed"
              : "bg-black"
          }`}
        >
          Agregar trabajador
        </button>
      </div>
      {planUsage.alcanzado && (
        <p className="mt-1 text-sm text-red-600">
          Has alcanzado el límite de tu plan ({planUsage.limite} trabajadores).{" "}
          <Link href="/dashboard/suscripcion" className="underline">
            Subir de plan
          </Link>
        </p>
      )}

      {/* Tabla */}
      <div className="overflow-auto rounded-xl border">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="p-2 text-left w-[180px] cursor-pointer" onClick={() => ordenar("nombre")}>
                Nombre {sortKey === "nombre" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
              <th className="p-2 text-left w-[140px] cursor-pointer" onClick={() => ordenar("rut")}>
                RUT {sortKey === "rut" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
              <th className="p-2 text-left w-[220px]">Email</th>
              <th className="p-2 text-left w-[200px]">Centro de trabajo</th>
              <th className="p-2 text-left w-[100px]">Talla</th>
              <th className="p-2 text-left w-[120px]">Calzado</th>
              <th className="p-2 text-right w-[160px]">Gasto mes ($)</th>
              <th className="p-2 text-right w-[180px]">Prom. 6 meses ($)</th>
              <th className="p-2 text-left w-[120px] cursor-pointer" onClick={() => ordenar("estado")}>
                Estado {sortKey === "estado" && (sortDir === "asc" ? "▲" : "▼")}
              </th>
            </tr>
          </thead>
          <tbody>
            {trabajadoresFiltrados.map((t) => (
              <tr key={t.id} className="border-t">
                <td className="p-2">{t.nombre}</td>
                <td className="p-2">{t.rut}</td>
                <td className="p-2">
                  <input
                    className="input"
                    value={t.email ?? ""}
                    onChange={(e) =>
                      actualizarCampo(
                        t.id,
                        "email",
                        e.target.value
                      )
                    }
                    disabled={editingId !== t.id}
                  />
                </td>
                <td className="p-2">
                  <select
                    className="input"
                    value={t.centro_id}
                    onChange={(e) =>
                      actualizarCampo(
                        t.id,
                        "centro_id",
                        e.target.value
                      )
                    }
                    disabled={editingId !== t.id}
                  >
                    {centros.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2">
                  <input
                    className="input"
                    value={t.talla ?? ""}
                    onChange={(e) =>
                      actualizarCampo(
                        t.id,
                        "talla",
                        e.target.value
                      )
                    }
                    disabled={editingId !== t.id}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="input"
                    value={t.numero_calzado ?? ""}
                    onChange={(e) =>
                      actualizarCampo(
                        t.id,
                        "numero_calzado",
                        e.target.value
                      )
                    }
                    disabled={editingId !== t.id}
                  />
                </td>
                <td className="p-2 text-right">
                  {gastoMes(t.id).toLocaleString("es-CL")}
                </td>
                <td className="p-2 text-right">
                  {promedio6Meses(t).toLocaleString("es-CL")}
                </td>
                <td className="p-2">
                  {editingId === t.id ? (
                    <div className="flex gap-2">
                      <button
                        className="text-sky-600 hover:underline"
                        onClick={() => setEditingId(null)}
                      >
                        Guardar
                      </button>
                      <button
                        className="text-zinc-500 hover:underline"
                        onClick={() => setEditingId(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className={t.activo ? "text-green-600" : "text-zinc-400"}>
                        {t.activo ? "Vigente" : "Inactivo"}
                      </span>

                      <div className="relative" onMouseDown={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          className="px-2 py-1 rounded hover:bg-zinc-100 text-zinc-700"
                          onClick={() =>
                            setMenuOpenId((prev) => (prev === t.id ? null : t.id))
                          }
                          title="Acciones"
                          aria-label="Acciones"
                        >
                          ⋯
                        </button>

                        {menuOpenId === t.id ? (
                          <div className="absolute right-0 z-10 mt-2 w-40 rounded-lg border bg-white shadow">
                            <button
                              type="button"
                              className="w-full text-left px-3 py-2 text-sm hover:bg-zinc-50"
                              onClick={() => {
                                setEditingId(t.id);
                                setMenuOpenId(null);
                              }}
                            >
                              Editar
                            </button>

                            {t.activo ? (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-zinc-50"
                                onClick={async () => {
                                  setMenuOpenId(null);
                                  await setTrabajadorActivo(t.id, false);
                                }}
                              >
                                Dar de baja
                              </button>
                            ) : (
                              <button
                                type="button"
                                className="w-full text-left px-3 py-2 text-sm text-green-700 hover:bg-zinc-50"
                                onClick={async () => {
                                  setMenuOpenId(null);
                                  await setTrabajadorActivo(t.id, true);
                                }}
                              >
                                Activar
                              </button>
                            )}
                          </div>
                        ) : null}
                      </div>
                    </div>
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
