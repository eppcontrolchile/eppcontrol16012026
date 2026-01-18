// app/auth/register/RegisterClient.tsx
"use client";

import Image from "next/image";
import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function RegisterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const planFromUrl = searchParams.get("plan"); // standard | advanced | null

  const [loading, setLoading] = useState(false);

  const [form, setForm] = useState({
    companyName: "",
    companyRut: "",
    industry: "",
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

  useEffect(() => {
    if (planFromUrl === "standard" || planFromUrl === "advanced") {
      setForm((prev) => ({ ...prev, plan: planFromUrl }));
    }
  }, [planFromUrl]);

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      !form.plan
    ) {
      alert("Completa todos los campos obligatorios");
      return;
    }

    setLoading(true);

    try {
      const res = await fetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });

      const result = await res.json();

      if (!res.ok) {
        alert(result.error || "Error al crear cuenta");
        return;
      }

      const { error: signInError } =
        await supabase.auth.signInWithPassword({
          email: form.email,
          password: form.password,
        });

      if (signInError) {
        alert(
          "Cuenta creada, pero no se pudo iniciar sesión automáticamente."
        );
        return;
      }

      router.push("/onboarding/configuracion");
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
              />
              <input
                name="companyRut"
                placeholder="RUT empresa"
                className="input"
                onChange={handleChange}
              />
              <select
                name="industry"
                className="input"
                onChange={handleChange}
              >
                <option value="">Rubro</option>
                <option>Construcción</option>
                <option>Industrial</option>
                <option>Logística</option>
                <option>Servicios</option>
                <option>Otro</option>
              </select>

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
              />
              <input
                name="lastName"
                placeholder="Apellido"
                className="input"
                onChange={handleChange}
              />
              <input
                type="email"
                name="email"
                placeholder="Correo"
                className="input"
                onChange={handleChange}
              />
              <input
                type="password"
                name="password"
                placeholder="Contraseña"
                className="input"
                onChange={handleChange}
              />
              <input
                type="password"
                name="confirmPassword"
                placeholder="Confirmar contraseña"
                className="input"
                onChange={handleChange}
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
