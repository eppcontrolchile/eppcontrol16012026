// app/dashboard/configuracion/page.tsx
"use client";

import { useEffect, useState } from "react";

type EmpresaConfig = {
  id: string;
  nombre: string;
  rut: string;
  plan_tipo: "standard" | "advanced";
  logo_url: string | null;

  email_alertas: string | null;
  alertas_activas: boolean | null;
  stock_critico_activo: boolean | null;
  frecuencia_alertas: "diaria" | "semanal" | null;

  email_gerencia: string | null;
};

function isEmail(v: string) {
  const s = (v || "").trim();
  return !s || (s.includes("@") && s.includes("."));
}

export default function ConfiguracionEmpresaPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [empresa, setEmpresa] = useState<EmpresaConfig | null>(null);
  const [error, setError] = useState<string>("");

  // form state
  const [logoUrl, setLogoUrl] = useState("");
  const [alertasActivas, setAlertasActivas] = useState(false);
  const [stockCriticoActivo, setStockCriticoActivo] = useState(true);
  const [frecuencia, setFrecuencia] = useState<"diaria" | "semanal">("diaria");
  const [correoAlertas, setCorreoAlertas] = useState("");
  const [correoGerencia, setCorreoGerencia] = useState("");

  const planLabel = empresa?.plan_tipo === "advanced" ? "Plan Avanzado" : "Plan Estándar";

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const res = await fetch("/api/empresa/config", { cache: "no-store" });
        const json = await res.json().catch(() => ({}));

        if (!res.ok) {
          throw new Error(json?.error || "No se pudo cargar configuración");
        }

        const e: EmpresaConfig = json.empresa;

        if (cancelled) return;

        setEmpresa(e);
        setLogoUrl(e.logo_url ?? "");
        setAlertasActivas(Boolean(e.alertas_activas));
        setStockCriticoActivo(Boolean(e.stock_critico_activo));
        setFrecuencia((e.frecuencia_alertas as any) || "diaria");
        setCorreoAlertas(e.email_alertas ?? "");
        setCorreoGerencia(e.email_gerencia ?? "");
      } catch (err: any) {
        if (!cancelled) setError(err?.message ?? "Error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function onSave(e: React.FormEvent) {
    e.preventDefault();
    setError("");

    if (!isEmail(correoAlertas)) {
      setError("Correo de alertas no válido");
      return;
    }

    if (empresa?.plan_tipo === "standard" && !isEmail(correoGerencia)) {
      setError("Correo de gerencia no válido");
      return;
    }

    try {
      setSaving(true);

      const payload: any = {
        logo_url: logoUrl.trim() || null,
        email_alertas: correoAlertas.trim() || null,
        alertas_activas: alertasActivas,
        stock_critico_activo: stockCriticoActivo,
        frecuencia_alertas: frecuencia,
      };

      // regla: solo standard puede editar email_gerencia
      if (empresa?.plan_tipo === "standard") {
        payload.email_gerencia = correoGerencia.trim() || null;
      }

      const res = await fetch("/api/empresa/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const json = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(json?.error || "No se pudo guardar");
      }

      setEmpresa(json.empresa);
    } catch (err: any) {
      setError(err?.message ?? "Error guardando");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <div className="text-zinc-500">Cargando configuración…</div>;

  if (error && !empresa) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error}
      </div>
    );
  }

  if (!empresa) {
    return <div className="text-zinc-500">No disponible</div>;
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Configuración</h1>
        <p className="text-sm text-zinc-500">
          Administra parámetros que definiste en el onboarding. Solo disponible para Admin.
        </p>
      </div>

      <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
        <strong>{planLabel}</strong>
        <div className="mt-1 text-sky-800">
          Empresa: {empresa.nombre} · RUT: {empresa.rut}
        </div>
      </div>

      <form onSubmit={onSave} className="space-y-6">
        {/* Logo */}
        <div className="rounded-lg border bg-white p-4 space-y-2">
          <h2 className="font-medium">Logo</h2>
          <label className="text-sm text-zinc-600">URL del logo</label>
          <input
            className="input"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            placeholder="https://... o /logo.png"
          />
          {logoUrl ? (
            <div className="mt-2 rounded border bg-zinc-50 p-3">
              {/* preview simple */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logoUrl} alt="Logo" className="h-12 w-auto" />
            </div>
          ) : (
            <p className="text-xs text-zinc-500">Sin logo configurado.</p>
          )}
        </div>

        {/* Alertas stock */}
        <div className="rounded-lg border bg-white p-4 space-y-3">
          <h2 className="font-medium">Alertas de stock crítico</h2>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={stockCriticoActivo}
              onChange={(e) => setStockCriticoActivo(e.target.checked)}
            />
            Usar stock crítico (umbral por producto)
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alertasActivas}
              onChange={(e) => setAlertasActivas(e.target.checked)}
            />
            Enviar alertas por correo
          </label>

          {alertasActivas && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-sm font-medium">Correo alertas</label>
                <input
                  className="input"
                  value={correoAlertas}
                  onChange={(e) => setCorreoAlertas(e.target.value)}
                  placeholder="alertas@empresa.cl"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">Frecuencia</label>
                <select
                  className="input"
                  value={frecuencia}
                  onChange={(e) => setFrecuencia(e.target.value as any)}
                >
                  <option value="diaria">Diaria</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
            </div>
          )}

          {!alertasActivas && (
            <p className="text-xs text-zinc-500">
              Alertas desactivadas. Se seguirá calculando stock crítico, pero no se enviarán correos.
            </p>
          )}
        </div>

        {/* Gerencia */}
        <div className="rounded-lg border bg-white p-4 space-y-2">
          <h2 className="font-medium">Gerencia (reportes)</h2>

          {empresa.plan_tipo === "standard" ? (
            <>
              <p className="text-sm text-zinc-600">
                En Plan Estándar, este correo recibe reportes/avisos gerenciales sin necesidad de tener acceso.
              </p>
              <label className="mb-1 block text-sm font-medium">Correo gerencia</label>
              <input
                className="input"
                value={correoGerencia}
                onChange={(e) => setCorreoGerencia(e.target.value)}
                placeholder="gerencia@empresa.cl"
              />
            </>
          ) : (
            <>
              <p className="text-sm text-zinc-600">
                En Plan Avanzado, la gerencia se gestiona como <b>usuario con rol</b>. Cambia/crea la gerencia desde <b>Usuarios</b>.
              </p>
              <div className="rounded border bg-zinc-50 p-3 text-sm">
                <div className="text-zinc-500">Correo gerencia (solo lectura)</div>
                <div className="font-medium">{empresa.email_gerencia ?? "—"}</div>
              </div>
            </>
          )}
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={saving}
          className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
        >
          {saving ? "Guardando…" : "Guardar cambios"}
        </button>
      </form>
    </div>
  );
}
