// app/onboarding/configuracion/page.tsx
"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import type React from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default function ConfiguracionPage() {
  const router = useRouter();

  type EmpresaUpdate = {
    email_gerencia: string;
    email_alertas: string | null;
    stock_critico_activo: boolean;
    alertas_activas: boolean;
    frecuencia_alertas: string;
    onboarding_configuracion_completa: boolean;
  };

  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [emailUsuario, setEmailUsuario] = useState<string>("");

  const [config, setConfig] = useState({
    stockCritico: true,
    alertasCorreo: true,
    usarCorreoUsuario: true,
    correoAlertas: "",
    frecuencia: "diaria",
    correoGerencia: "",
  });

  const correoGerenciaValido =
    config.correoGerencia.trim().length > 0 &&
    config.correoGerencia.trim() !== emailUsuario;

  // 👉 Regla clara: solo se puede continuar si hay empresaId + correo de gerencia válido
  const puedeContinuar = !!empresaId && correoGerenciaValido;

  useEffect(() => {
    const fetchEmpresaId = async () => {
      type UsuarioEmpresaRow = {
        empresa_id: string;
        email: string | null;
      };

      const {
        data: { user },
        error: userError,
      } = await supabaseBrowser.auth.getUser();

      if (userError || !user) {
        alert("Sesión inválida. Inicia sesión nuevamente.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabaseBrowser
        .from("usuarios")
        .select("empresa_id, email")
        .eq("auth_user_id", user.id)
        .maybeSingle<UsuarioEmpresaRow>();

      if (error || !data?.empresa_id) {
        alert("No se pudo identificar la empresa asociada al usuario.");
        setLoading(false);
        return;
      }

      setEmpresaId(data.empresa_id);
      setEmailUsuario(data.email || "");


      setLoading(false);
    };

    fetchEmpresaId();
  }, []);
    
  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setConfig({ ...config, [e.target.name]: e.target.value });
  };

  const handleToggle = (name: keyof typeof config) => {
    setConfig({ ...config, [name]: !config[name] });
  };

  // ▶️ CONTINUAR
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!empresaId) {
      alert("No se pudo identificar la empresa. Intenta nuevamente.");
      return;
    }

    if (!config.correoGerencia) {
      alert("El correo de gerencia es obligatorio para continuar.");
      return;
    }

    if (config.alertasCorreo && !config.usarCorreoUsuario && !config.correoAlertas) {
      alert("Debes indicar un correo para alertas o usar tu correo de usuario.");
      return;
    }

    const correoAlertasFinal = config.alertasCorreo
      ? config.usarCorreoUsuario
        ? emailUsuario
        : config.correoAlertas
      : null;
      

    const { error } = await (supabaseBrowser.from("empresas") as any)
      .update({
        email_gerencia: config.correoGerencia,
        email_alertas: correoAlertasFinal,
        stock_critico_activo: config.stockCritico,
        alertas_activas: config.alertasCorreo,
        frecuencia_alertas: config.frecuencia,
        onboarding_configuracion_completa: true,
      } as any)
      .eq("id", empresaId);

    if (error) {
      alert(`Error al guardar configuración: ${error.message}`);
      return;
    }

    router.push("/onboarding/primeros-datos");
  };

  // ⏭️ SALTAR (pero IGUAL exige correo de gerencia)
  const handleSkip = async () => {
    if (!empresaId) {
      alert("No se pudo identificar la empresa. Intenta nuevamente.");
      return;
    }

    if (!config.correoGerencia) {
      alert("Para continuar debes indicar un correo de gerencia.");
      return;
    }

    const { error } = await (supabaseBrowser.from("empresas") as any)
      .update({
        email_gerencia: config.correoGerencia,
        alertas_activas: false,
        onboarding_configuracion_completa: true,
      } as any)
      .eq("id", empresaId);

    if (error) {
      alert(`Error al guardar configuración: ${error.message}`);
      return;
    }

    router.push("/onboarding/primeros-datos");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-zinc-500">
        Cargando configuración…
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 flex justify-center px-6 pt-14">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg p-6">
        <div className="flex justify-center mb-3">
          <Image
            src="/logoepp.png"
            alt="EPP Control"
            width={420}
            height={280}
            className="h-28 w-auto"
            priority
          />
        </div>

        <h1 className="text-3xl font-bold text-center">
          Configuración inicial
        </h1>

        <p className="text-center text-zinc-600 mt-1">
          Ajusta cómo funcionará EPP Control para tu empresa
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">

          {/* CORREO GERENCIA */}
          <div>
            <p className="font-medium">Correo de gerencia</p>
            <p className="text-sm text-zinc-500 mb-2">
              Obligatorio. Recibirá reportes mensuales de gestión.
            </p>
            <p className="text-xs text-zinc-500 mb-2">
              Debe ser distinto al correo del usuario administrador.
            </p>
            {config.correoGerencia && config.correoGerencia === emailUsuario && (
              <p className="text-xs text-red-600">
                El correo de gerencia debe ser distinto al correo del usuario administrador.
              </p>
            )}
            <input
              type="email"
              name="correoGerencia"
              placeholder="gerencia@empresa.cl"
              className="input"
              value={config.correoGerencia}
              onChange={handleChange}
              required
            />
          </div>

          {/* STOCK CRÍTICO */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Usar stock crítico</p>
              <p className="text-sm text-zinc-500">
                Alertas cuando el stock esté bajo el mínimo
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.stockCritico}
              onChange={() => handleToggle("stockCritico")}
              className="h-5 w-5"
            />
          </div>

          {/* ALERTAS */}
          <div className="flex items-center justify-between">
            <div>
              <p className="font-medium">Alertas por correo</p>
              <p className="text-sm text-zinc-500">
                Notificaciones automáticas
              </p>
            </div>
            <input
              type="checkbox"
              checked={config.alertasCorreo}
              onChange={() => handleToggle("alertasCorreo")}
              className="h-5 w-5"
            />
          </div>

          {/* CORREO ALERTAS */}
          {config.alertasCorreo && (
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={config.usarCorreoUsuario}
                  onChange={() => handleToggle("usarCorreoUsuario")}
                />
                Usar correo del usuario administrador
              </label>

              {!config.usarCorreoUsuario && (
                <input
                  type="email"
                  name="correoAlertas"
                  placeholder="alertas@empresa.cl"
                  className="input"
                  value={config.correoAlertas}
                  onChange={handleChange}
                  required
                />
              )}
            </div>
          )}

          {/* FRECUENCIA */}
          {config.alertasCorreo && (
            <select
              name="frecuencia"
              className="input"
              value={config.frecuencia}
              onChange={handleChange}
            >
              <option value="diaria">Diaria</option>
              <option value="semanal">Semanal</option>
            </select>
          )}

          {/* BOTONES */}
          <div className="flex gap-4 pt-4">
            <button
              type="submit"
              disabled={!puedeContinuar}
              className={`flex-1 rounded-xl py-3 font-medium transition ${
                puedeContinuar
                  ? "bg-sky-600 text-white hover:bg-sky-700"
                  : "bg-sky-300 text-white cursor-not-allowed"
              }`}
            >
              Continuar
            </button>

            <button
              type="button"
              onClick={handleSkip}
              className="flex-1 rounded-xl border py-3 text-sm border-zinc-300 text-zinc-700 hover:bg-zinc-50"
            >
              Saltar este paso
            </button>
          </div>
        </form>
      </div>
    </main>
  );
}
