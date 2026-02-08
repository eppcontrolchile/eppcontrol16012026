// app/dashboard/entregas/page.tsx
"use client";

import type React from "react";
import { useEffect, useState } from "react";
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

function formatFechaCL(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
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

  if (loading) {
    return <p className="text-sm text-zinc-500">Cargando entregas…</p>;
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Entregas de EPP</h1>
      <div className="flex justify-end">
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

      {entregas.length === 0 && (
        <p className="text-sm text-zinc-500">No hay entregas registradas.</p>
      )}

      {/* Mobile: cards */}
      <div className="space-y-3 md:hidden">
        {entregas.map((e) => (
          <div key={e.id} className="rounded-lg border bg-white p-3">
            <div className="text-sm text-zinc-600">{formatFechaCL(e.fecha)}</div>

            <div className="mt-2">
              <div className="text-xs text-zinc-500">Trabajador</div>
              <div className="font-medium text-zinc-900">
                {e.trabajador.nombre} <span className="text-zinc-500">·</span> {e.trabajador.rut}
              </div>
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
              <th className="p-2 text-left">Fecha</th>
              <th className="p-2 text-left">Trabajador</th>
              <th className="p-2 text-left">Centro</th>
              <th className="p-2 text-right">Unidades</th>
              <th className="p-2 text-right">Total IVA</th>
              <th className="p-2 text-left">PDF</th>
            </tr>
          </thead>
          <tbody>
            {entregas.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="whitespace-nowrap p-2">{formatFechaCL(e.fecha)}</td>
                <td className="p-2">
                  {e.trabajador.nombre} · {e.trabajador.rut}
                </td>
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
