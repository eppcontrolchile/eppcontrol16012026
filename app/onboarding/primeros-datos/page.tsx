// app/onboarding/primeros-datos/page.tsx
"use client";

import type React from "react";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabaseBrowser } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

function normalizarRut(rut: string) {
  const limpio = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);
  return `${cuerpo}-${dv}`;
}

function validarRut(rut: string) {
  const limpio = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();
  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

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

// ─────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────
export default function PrimerosDatosPage() {
  const router = useRouter();

  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [centros, setCentros] = useState<{ id: string; nombre: string }[]>([]);
  const [centroId, setCentroId] = useState<string>("");

  const [trabajador, setTrabajador] = useState({
    nombre: "",
    rut: "",
    correo: "",
    talla: "",
    calzado: "",
  });

  // ─────────────────────────────────────────────
  // Obtener empresa_id desde Supabase
  // ─────────────────────────────────────────────
  useEffect(() => {
    const supabase = supabaseBrowser;

    const fetchEmpresaId = async () => {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError || !user) {
        router.replace("/auth/login");
        return;
      }

      const { data, error } = await supabase
        .from("usuarios")
        .select("empresa_id")
        .eq("auth_user_id", user.id)
        .maybeSingle();

      if (error || !data?.empresa_id) {
        alert("No se pudo identificar la empresa.");
        return;
      }

      setEmpresaId(data.empresa_id);

      const { data: centrosDB } = await supabase
        .from("centros_trabajo")
        .select("id, nombre")
        .eq("empresa_id", data.empresa_id)
        .eq("activo", true)
        .order("nombre");

      setCentros(centrosDB || []);

      setLoading(false);
    };

    fetchEmpresaId();
  }, [router]);

  // ─────────────────────────────────────────────
  // Submit
  // ─────────────────────────────────────────────
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const supabase = supabaseBrowser;
    if (!supabase) return;

    if (!empresaId || isSubmitting) return;

    if (!centroId) {
      alert("Debes seleccionar un centro de trabajo.");
      return;
    }

    if (trabajador.rut && !validarRut(trabajador.rut)) {
      alert("RUT del trabajador inválido.");
      return;
    }

    setIsSubmitting(true);

    try {
      // 2️⃣ Crear trabajador manual (opcional)
      if (trabajador.nombre && trabajador.rut) {
        const rutNormalizado = normalizarRut(trabajador.rut);

        const { error } = await supabase.from("trabajadores").insert({
          empresa_id: empresaId,
          centro_id: centroId,
          nombre: trabajador.nombre,
          rut: rutNormalizado,
          email: trabajador.correo || null,
          talla: trabajador.talla || null,
          numero_calzado: trabajador.calzado || null,
          activo: true,
        });

        if (error) throw error;
      }

      await supabase
        .from("empresas")
        .update({ onboarding_completado: true })
        .eq("id", empresaId);

      // 🔐 Reforzar sesión antes de ir al dashboard (auto-login robusto)
      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (sessionError || !sessionData.session) {
        await supabase.auth.refreshSession();
      }

      alert("Primeros datos guardados correctamente");
      router.replace("/dashboard");
    } catch (err: any) {
      alert(err.message || "Error al guardar los datos");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        Cargando…
      </div>
    );
  }

  // ─────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-center mb-4">
          <Image
            src="/logoepp.png"
            alt="EPP Control"
            width={420}
            height={280}
            className="h-24 w-auto"
            priority
          />
        </div>

        <h1 className="text-2xl font-bold text-center">Primeros datos</h1>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          {/* CENTRO DE TRABAJO */}
          <section>
            <h2 className="font-semibold text-lg mb-2">Centro de trabajo</h2>
            <select
              className="input"
              value={centroId}
              onChange={(e) => setCentroId(e.target.value)}
            >
              <option value="">Selecciona un centro de trabajo</option>
              {centros.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
            {centros.length === 0 && (
              <p className="mt-2 text-sm text-red-600">
                Aún no tienes centros de trabajo creados. Debes crearlos primero en la sección
                <strong> Centros de trabajo</strong> del panel antes de continuar.
              </p>
            )}
            <p className="text-xs text-zinc-500 mt-1">
              Los centros de trabajo se crean y gestionan únicamente desde el panel.
              Esto evita errores de escritura y duplicados en cargas posteriores.
            </p>
          </section>

          {/* TRABAJADOR OPCIONAL */}
          <section className="pt-4">
            <h2 className="font-semibold text-lg mb-2">
              Primer trabajador <span className="text-sm text-zinc-500">(opcional)</span>
            </h2>

            <div className="space-y-3">
              <input
                placeholder="Nombre del trabajador"
                className="input"
                value={trabajador.nombre}
                onChange={(e) =>
                  setTrabajador({ ...trabajador, nombre: e.target.value })
                }
              />

              <input
                placeholder="RUT del trabajador"
                className="input"
                value={trabajador.rut}
                onChange={(e) =>
                  setTrabajador({ ...trabajador, rut: e.target.value })
                }
              />

              <input
                type="email"
                placeholder="Correo del trabajador (opcional)"
                className="input"
                value={trabajador.correo}
                onChange={(e) =>
                  setTrabajador({ ...trabajador, correo: e.target.value })
                }
              />

              <input
                placeholder="Talla (ej: M, L) — opcional"
                className="input"
                value={trabajador.talla}
                onChange={(e) =>
                  setTrabajador({ ...trabajador, talla: e.target.value })
                }
              />

              <input
                placeholder="Número de calzado (ej: 42) — opcional"
                className="input"
                value={trabajador.calzado}
                onChange={(e) =>
                  setTrabajador({ ...trabajador, calzado: e.target.value })
                }
              />
            </div>

            <p className="text-xs text-zinc-500 mt-3">
              Luego podrás agregar más trabajadores, uno a uno o mediante carga masiva,
              desde el dashboard.
            </p>
          </section>

          <button
            type="submit"
            disabled={isSubmitting || centros.length === 0}
            className="w-full bg-sky-600 text-white rounded-xl py-3 hover:bg-sky-700"
          >
            Finalizar configuración
          </button>
        </form>
      </div>
    </main>
  );
}
