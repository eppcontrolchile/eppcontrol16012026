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


export default function SuscripcionPage() {
  const [suscripcion, setSuscripcion] = useState<Suscripcion | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;

    (async () => {
      try {
        setLoading(true);
        setError(null);

        const res = await fetch("/api/suscripcion", { cache: "no-store" });
        const body = await res.json().catch(() => null);

        if (!alive) return;

        if (!res.ok) {
          setError(body?.error || "No se pudo cargar la suscripción");
          setSuscripcion(null);
          return;
        }

        setSuscripcion(body as Suscripcion);
      } catch {
        if (!alive) return;
        setError("No se pudo cargar la suscripción");
        setSuscripcion(null);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  if (loading) {
    return <div className="p-6 text-sm text-zinc-600">Cargando suscripción...</div>;
  }

  if (error) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Suscripción</h1>
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">
          {error}
        </div>
      </div>
    );
  }

  if (!suscripcion) {
    return (
      <div className="p-6">
        <h1 className="text-xl font-semibold">Suscripción</h1>
        <div className="mt-4 rounded-lg border p-3 text-sm text-zinc-600">
          No hay datos de suscripción disponibles.
        </div>
      </div>
    );
  }

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
