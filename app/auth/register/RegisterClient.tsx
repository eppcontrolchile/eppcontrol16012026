// app/auth/register/RegisterClient.tsx
"use client";

import Image from "next/image";
import { useState, useEffect, type ChangeEvent, type FormEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function RegisterClient() {
  const searchParams = useSearchParams();
  const planFromUrl = searchParams.get("plan"); // standard | advanced | null


  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    companyName: "",
    companyRut: "",
    companyLogoFile: null as File | null,
    companySize: "",
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
    plan:
      planFromUrl === "standard" || planFromUrl === "advanced"
        ? planFromUrl
        : "",
  });

  const [logoPreviewUrl, setLogoPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!form.companyLogoFile) {
      setLogoPreviewUrl(null);
      return;
    }

    const objectUrl = URL.createObjectURL(form.companyLogoFile);
    setLogoPreviewUrl(objectUrl);

    return () => URL.revokeObjectURL(objectUrl);
  }, [form.companyLogoFile]);

  useEffect(() => {
    if (planFromUrl === "standard" || planFromUrl === "advanced") {
      setForm((prev) => ({ ...prev, plan: planFromUrl }));
    }
  }, [planFromUrl]);

  const handleChange = (e: ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (loading) return;

    if (form.password !== form.confirmPassword) {
      alert("Las contraseñas no coinciden");
      return;
    }

    if (
      !form.companyName ||
      !form.companyRut ||
      !form.firstName ||
      !form.lastName ||
      !form.email ||
      !form.plan ||
      !form.password ||
      !form.confirmPassword
    ) {
      alert("Completa todos los campos obligatorios");
      return;
    }

    const normalizedEmail = form.email.trim().toLowerCase();

    setLoading(true);

    try {
      const formData = new FormData();

      formData.append("companyName", form.companyName);
      formData.append("companyRut", form.companyRut);
      formData.append("companySize", form.companySize);
      formData.append("plan", form.plan);
      formData.append("plan_source", "register");
      formData.append("firstName", form.firstName);
      formData.append("lastName", form.lastName);
      formData.append("email", normalizedEmail);
      formData.append("password", form.password);

      if (form.companyLogoFile) {
        formData.append("companyLogo", form.companyLogoFile);
      }

      const res = await fetch("/api/register", {
        method: "POST",
        body: formData,
      });

      const result = await res.json().catch(() => ({}));

      if (!res.ok) {
        alert(result.error || "Error al crear cuenta");
        setLoading(false);
        return;
      }

      // Autologin (single shared client). Avoid creating multiple GoTrueClient instances.
      const { data, error } = await supabaseBrowser().auth.signInWithPassword({
        email: normalizedEmail,
        password: form.password,
      });

      if (error || !data.session) {
        console.warn("AUTOLOGIN FAILED:", error);
        // Mostrar feedback útil para debug sin exponer detalles sensibles
        alert(
          "Cuenta creada, pero no se pudo iniciar sesión automáticamente. Inicia sesión manualmente."
        );
        // Navegación completa para evitar estados inconsistentes
        window.location.href = "/auth/login";
        return;
      }

      // Sesión válida → continuar onboarding (navegación completa para que middleware vea cookies)
      window.location.href = "/onboarding/configuracion";
    } catch {
      alert("Error inesperado");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-lg p-8 mt-8">
        <h1 className="text-2xl font-bold text-center flex items-center justify-center gap-3 -mt-4">
          Crear cuenta en
          <span className="relative top-1 -left-6">
            <Image
              src="/logoepp.png"
              alt="EPP Control"
              width={120}
              height={80}
              className="h-40 w-auto"
              priority
            />
          </span>
        </h1>

        <form onSubmit={handleSubmit} className="mt-6 space-y-8">
          {/* EMPRESA */}
          <section>
            <h2 className="font-semibold text-lg mb-4">
              Datos de la empresa
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <input
                name="companyName"
                placeholder="Nombre empresa"
                className="input"
                onChange={handleChange}
                required
              />
              <input
                name="companyRut"
                placeholder="RUT empresa"
                className="input"
                onChange={handleChange}
                required
              />

          <div className="sm:col-span-2">
            <label className="block text-sm font-medium mb-2">
              Logo de la empresa (opcional)
            </label>

            <div className="flex items-center gap-4">
              {/* Preview */}
              <div className="h-16 w-16 flex items-center justify-center rounded-md border bg-white">
                {logoPreviewUrl ? (
                  <img
                    src={logoPreviewUrl}
                    alt="Preview logo empresa"
                    className="h-14 w-14 object-contain"
                  />
                ) : (
                  <span className="text-xs text-gray-400">Logo</span>
                )}
              </div>

              {/* File input */}
              <label className="flex-1">
                <input
                  type="file"
                  accept="image/png,image/jpeg"
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      companyLogoFile: e.target.files?.[0] || null,
                    }))
                  }
                  className="hidden"
                />
                <div className="cursor-pointer rounded-md border px-4 py-2 text-sm text-gray-600 hover:border-sky-500 hover:text-sky-600 transition">
                  {form.companyLogoFile ? "Cambiar logo" : "Seleccionar logo"}
                </div>
              </label>
            </div>
          </div>

              <select
                name="companySize"
                className="input"
                onChange={handleChange}
              >
                <option value="">Cantidad de trabajadores</option>
                <option value="25">Hasta 25</option>
                <option value="50">Hasta 50</option>
                <option value="100">Hasta 100</option>
                <option value="100+">Más de 100</option>
              </select>

              <select
                name="plan"
                className="input"
                onChange={handleChange}
                value={form.plan}
                required
              >
                <option value="">Selecciona un plan</option>
                <option value="standard">Plan Estándar</option>
                <option value="advanced">Plan Avanzado</option>
              </select>
            </div>
          </section>

          {/* USUARIO */}
          <section>
            <h2 className="font-semibold text-lg mb-4">
              Usuario administrador
            </h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <input
                name="firstName"
                placeholder="Nombre"
                className="input"
                onChange={handleChange}
                required
              />
              <input
                name="lastName"
                placeholder="Apellido"
                className="input"
                onChange={handleChange}
                required
              />
              <input
                type="email"
                name="email"
                placeholder="Correo"
                className="input"
                onChange={handleChange}
                required
              />
              <input
                type="password"
                name="password"
                placeholder="Contraseña"
                className="input"
                onChange={handleChange}
                required
              />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirmar contraseña"
                className="input"
                onChange={handleChange}
                required
              />
            </div>
          </section>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-sky-600 py-3 text-white font-medium hover:bg-sky-700 transition disabled:opacity-50"
          >
            {loading ? "Creando cuenta..." : "Crear cuenta"}
          </button>

          <p className="text-center text-sm text-zinc-600">
            ¿Ya tienes cuenta?{" "}
            <Link
              href="/auth/login"
              className="text-sky-600 font-medium"
            >
              Inicia sesión
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
