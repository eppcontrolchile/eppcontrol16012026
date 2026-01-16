// app/dashboard/trabajadores/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlanUsage } from "@/app/utils/plan";
import Link from "next/link";

type Trabajador = {
  id: string;
  nombre: string;
  rut: string;
  email?: string;
  centro: string;
  talla?: string;
  calzado?: string;
  creadoEn: string;
  activo: boolean;
};

type CentroTrabajo = {
  id: string;
  nombre: string;
  activo: boolean;
};

type Egreso = {
  fecha: string;
  trabajador: {
    rut: string;
    nombre: string;
    centro: string;
  };
  costoTotalEgreso?: number;
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

function getTrabajadores(): Trabajador[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("trabajadores") || "[]");
}

function saveTrabajadores(data: Trabajador[]) {
  localStorage.setItem("trabajadores", JSON.stringify(data));
}

function getEgresos(): Egreso[] {
  if (typeof window === "undefined") return [];
  return JSON.parse(localStorage.getItem("egresos") || "[]");
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

  const planUsage = useMemo(() => getPlanUsage(), []);

  useEffect(() => {
    setTrabajadores(getTrabajadores());

    const storedCentros = JSON.parse(
      localStorage.getItem("centrosTrabajo") || "[]"
    );
    setCentros(storedCentros.filter((c: CentroTrabajo) => c.activo));
  }, []);

  function agregarTrabajador() {
    if (!nuevo.nombre || !nuevo.rut || !nuevo.centro) {
      alert("Debes completar nombre, RUT y centro de trabajo.");
      return;
    }

    const rutNormalizado = nuevo.rut
      .replace(/\./g, "")
      .toUpperCase();

    if (!validarRut(rutNormalizado)) {
      alert("El RUT ingresado no es válido. Usa formato XXXXXXXX-X.");
      return;
    }

    const actualizado = [
      ...trabajadores,
      {
        id: crypto.randomUUID(),
        nombre: nuevo.nombre,
        rut: rutNormalizado,
        email: nuevo.email || undefined,
        centro: nuevo.centro,
        creadoEn: new Date().toISOString(),
        activo: true,
      },
    ];

    setTrabajadores(actualizado);
    saveTrabajadores(actualizado);
    setNuevo({ nombre: "", rut: "", email: "", centro: "" });
  }

  function actualizarCampo(
    id: string,
    campo: keyof Trabajador,
    valor: string
  ) {
    const actualizado = trabajadores.map((t) =>
      t.id === id ? { ...t, [campo]: valor } : t
    );
    setTrabajadores(actualizado);
    saveTrabajadores(actualizado);
  }

  function darDeBajaTrabajador(id: string) {
    if (!window.confirm("¿Estás seguro de dar de baja a este trabajador? Esta acción no se puede deshacer.")) {
      return;
    }
    const actualizado = trabajadores.map((t) =>
      t.id === id ? { ...t, activo: false } : t
    );
    setTrabajadores(actualizado);
    saveTrabajadores(actualizado);
  }

  function handleCargaMasiva(
    e: React.ChangeEvent<HTMLInputElement>
  ) {
    const file = e.target.files?.[0];
    if (!file) return;

    const centrosValidos = centros.map((c) =>
      c.nombre.trim().toLowerCase()
    );

    const reader = new FileReader();
    reader.onload = () => {
      const text = reader.result as string;
      const rows = text.split("\n").slice(1);

      const errores: string[] = [];
      const nuevos: Trabajador[] = [];

      rows.forEach((r, index) => {
        const c = r.split(";");
        if (c.length < 6) return;

        const nombre = c[0]?.trim();
        const rutRaw = c[1]?.trim() || "";
        const rut = rutRaw.replace(/\./g, "").toUpperCase();
        const email = c[2]?.trim() || undefined;
        const centroRaw = c[3]?.trim();
        const talla = c[4]?.trim();
        const calzado = c[5]?.trim();

        if (!nombre || !rut || !centroRaw) return;

        if (!validarRut(rut)) {
          errores.push(
            `Fila ${index + 2}: RUT inválido (${rutRaw})`
          );
          return;
        }

        const centroNormalizado = centroRaw
          .trim()
          .toLowerCase();

        if (!centrosValidos.includes(centroNormalizado)) {
          errores.push(
            `Fila ${index + 2}: centro inexistente (${centroRaw})`
          );
          return;
        }

        const centroFinal = centros.find(
          (c) =>
            c.nombre.trim().toLowerCase() ===
            centroNormalizado
        )!.nombre;

        nuevos.push({
          id: crypto.randomUUID(),
          nombre,
          rut,
          email,
          centro: centroFinal,
          talla,
          calzado,
          creadoEn: new Date().toISOString(),
          activo: true,
        });
      });

      if (errores.length > 0) {
        alert(
          "No se pudo completar la carga:\n\n" +
            errores.join("\n")
        );
        return;
      }

      if (nuevos.length === 0) {
        alert("No se encontraron filas válidas.");
        return;
      }

      const actualizados = [...trabajadores, ...nuevos];
      setTrabajadores(actualizados);
      saveTrabajadores(actualizados);
    };

    reader.readAsText(file);
  }

  const egresos = useMemo(() => getEgresos(), []);

  function gastoMes(rut: string) {
    const ahora = new Date();
    return egresos
      .filter((e) => {
        const d = new Date(e.fecha);
        return (
          e.trabajador.rut === rut &&
          d.getMonth() === ahora.getMonth() &&
          d.getFullYear() === ahora.getFullYear()
        );
      })
      .reduce((s, e) => s + (e.costoTotalEgreso ?? 0), 0);
  }

  function promedio6Meses(trabajador: Trabajador) {
    const creado = new Date(trabajador.creadoEn);
    const ahora = new Date();
    const meses = Math.min(
      6,
      (ahora.getFullYear() - creado.getFullYear()) * 12 +
        (ahora.getMonth() - creado.getMonth()) +
        1
    );

    const gastos = egresos.filter((e) => {
      const d = new Date(e.fecha);
      const diffMeses =
        (ahora.getFullYear() - d.getFullYear()) * 12 +
        (ahora.getMonth() - d.getMonth());
      return (
        e.trabajador.rut === trabajador.rut && diffMeses < meses
      );
    });

    const total = gastos.reduce(
      (s, e) => s + (e.costoTotalEgreso ?? 0),
      0
    );

    return meses > 0 ? total / meses : 0;
  }

  const trabajadoresFiltrados = trabajadores.filter((t) => {
    if (filtroEstado === "activos") return t.activo === true;
    if (filtroEstado === "inactivos") return t.activo === false;
    return true;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
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
        <div className="flex items-center gap-2">
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
              link.setAttribute(
                "download",
                "plantilla_trabajadores.csv"
              );
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="mr-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50"
          >
            📄 Descargar plantilla
          </button>
          {planUsage.alcanzado ? (
            <div className="rounded-lg border px-3 py-1.5 text-sm text-zinc-400 cursor-not-allowed">
              📥 Carga masiva (límite alcanzado)
            </div>
          ) : (
            <label className="cursor-pointer rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50">
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
            <option key={c.id} value={c.nombre}>
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
              <th className="p-2 text-left w-[180px]">Nombre</th>
              <th className="p-2 text-left w-[140px]">RUT</th>
              <th className="p-2 text-left w-[220px]">Email</th>
              <th className="p-2 text-left w-[200px]">Centro de trabajo</th>
              <th className="p-2 text-left w-[100px]">Talla</th>
              <th className="p-2 text-left w-[120px]">Calzado</th>
              <th className="p-2 text-right w-[160px]">Gasto mes ($)</th>
              <th className="p-2 text-right w-[180px]">Prom. 6 meses ($)</th>
              <th className="p-2 text-left w-[120px]">Estado</th>
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
                    disabled={!t.activo}
                  />
                </td>
                <td className="p-2">
                  <select
                    className="input"
                    value={t.centro}
                    onChange={(e) =>
                      actualizarCampo(
                        t.id,
                        "centro",
                        e.target.value
                      )
                    }
                    disabled={!t.activo}
                  >
                    {centros.map((c) => (
                      <option key={c.id} value={c.nombre}>
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
                    disabled={!t.activo}
                  />
                </td>
                <td className="p-2">
                  <input
                    className="input"
                    value={t.calzado ?? ""}
                    onChange={(e) =>
                      actualizarCampo(
                        t.id,
                        "calzado",
                        e.target.value
                      )
                    }
                    disabled={!t.activo}
                  />
                </td>
                <td className="p-2 text-right">
                  {gastoMes(t.rut).toLocaleString("es-CL")}
                </td>
                <td className="p-2 text-right">
                  {promedio6Meses(t).toLocaleString("es-CL")}
                </td>
                <td className="p-2">
                  {t.activo ? (
                    <button
                      className="text-red-600 hover:underline"
                      onClick={() => darDeBajaTrabajador(t.id)}
                    >
                      Dar de baja
                    </button>
                  ) : (
                    <span className="text-gray-500">Inactivo</span>
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
