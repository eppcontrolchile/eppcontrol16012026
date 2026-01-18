// app/dashboard/suscripcion/page.tsx
"use client";

import { useEffect, useState } from "react";

type Pago = {
  id: string;
  fecha: string;
  monto: number;
  estado: "pagado" | "pendiente" | "fallido";
};

type Suscripcion = {
  plan: "STANDARD" | "ADVANCED";
  tramo: "25" | "50" | "100" | "+100";
  estado: "Activa" | "Trial" | "Vencida";
  valorPlan: number;
  trabajadoresActivos: number;
  limiteTrabajadores: number;
  proximoPago: string | null;
  pagos: Pago[];
};

function getSuscripcion(): Suscripcion {
  const fallback: Suscripcion = {
    plan: "STANDARD",
    tramo: "25",
    estado: "Trial",
    valorPlan: 29990,
    trabajadoresActivos: 0,
    limiteTrabajadores: 25,
    proximoPago: null,
    pagos: [],
  };

  if (typeof window === "undefined") {
    return fallback;
  }

  const raw = localStorage.getItem("suscripcion");

  if (!raw) {
    return fallback;
  }

  try {
    return JSON.parse(raw) as Suscripcion;
  } catch {
    return fallback;
  }
}

function saveSuscripcion(data: Suscripcion) {
  localStorage.setItem("suscripcion", JSON.stringify(data));
}

export default function SuscripcionPage() {
  const [suscripcion, setSuscripcion] =
    useState<Suscripcion | null>(null);

  useEffect(() => {
    setSuscripcion(getSuscripcion());
  }, []);

  if (!suscripcion) return null;

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Suscripción</h1>

      {/* Estado */}
      <div className="rounded-xl border p-4 space-y-2">
        <p>
          <strong>Plan actual:</strong>{" "}
          <span className="inline-block rounded bg-zinc-100 px-2 py-0.5 text-sm">
            {suscripcion.plan === "STANDARD" ? "Plan Estándar" : "Plan Avanzado"}{" "}
            {suscripcion.tramo}
          </span>
        </p>
        <p>
          <strong>Valor del plan:</strong>{" "}
          {`$${suscripcion.valorPlan.toLocaleString("es-CL")} + IVA`}
        </p>
        <p>
          <strong>Trabajadores activos:</strong>{" "}
          {suscripcion.trabajadoresActivos} / {suscripcion.limiteTrabajadores}
        </p>

        {suscripcion.trabajadoresActivos >=
          suscripcion.limiteTrabajadores && (
          <p className="text-sm text-red-600">
            Has alcanzado el límite de tu plan. Debes subir de plan para
            continuar.
          </p>
        )}

        {suscripcion.trabajadoresActivos <
          suscripcion.limiteTrabajadores && (
          <p className="text-sm text-zinc-500">
            Puedes agregar{" "}
            {suscripcion.limiteTrabajadores -
              suscripcion.trabajadoresActivos}{" "}
            trabajadores más antes de subir de plan.
          </p>
        )}

        <p>
          <strong>Estado:</strong>{" "}
          <span className="text-sm">
            {suscripcion.estado}
          </span>
        </p>
        <p>
          <strong>Próximo pago:</strong>{" "}
          {suscripcion.proximoPago
            ? new Date(
                suscripcion.proximoPago
              ).toLocaleDateString()
            : "—"}
        </p>

        {suscripcion.plan === "STANDARD" && (
          <button className="mt-3 rounded-lg bg-black px-4 py-2 text-sm text-white">
            Solicitar upgrade a Plan Avanzado
          </button>
        )}
      </div>

      {/* Historial de pagos */}
      <div className="rounded-xl border p-4">
        <h2 className="mb-3 font-semibold">
          Historial de pagos
        </h2>

        {suscripcion.pagos.length === 0 ? (
          <p className="text-sm text-zinc-500">
            Aún no hay pagos registrados.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="p-2 text-left">
                  Fecha
                </th>
                <th className="p-2 text-right">
                  Monto
                </th>
                <th className="p-2 text-left">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody>
              {suscripcion.pagos.map((p) => (
                <tr
                  key={p.id}
                  className="border-b last:border-0"
                >
                  <td className="p-2">
                    {new Date(
                      p.fecha
                    ).toLocaleDateString()}
                  </td>
                  <td className="p-2 text-right">
                    ${p.monto.toLocaleString("es-CL")}
                  </td>
                  <td className="p-2">
                    {p.estado}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
