// app/auth/login/page.tsx
"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const normalizedEmail = email.trim().toLowerCase();

      const { data, error: signInError } =
        await supabaseBrowser.auth.signInWithPassword({
          email: normalizedEmail,
          password,
        });

      if (signInError || !data.session) {
        setError(signInError?.message || "Correo o contraseña incorrectos.");
        setPassword("");
        return;
      }

      // Navegación completa: asegura que el middleware vea cookies de sesión inmediatamente
      const params = new URLSearchParams(window.location.search);
      const rawNext = params.get("next") || "/dashboard";
      const next = rawNext.startsWith("/") ? rawNext : "/dashboard";
      window.location.href = next;
    } catch (err: any) {
      setError(err?.message || "No se pudo iniciar sesión.");
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-sm space-y-6 text-center bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-center">
          <img src="/logoepp.png" alt="EPP Control" className="h-28 w-auto" />
        </div>

        <div>
          <h1 className="text-2xl font-semibold">Login empresa</h1>
          <p className="mt-1 text-sm text-zinc-600">
            Ingresa con tu correo y contraseña.
          </p>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700 text-left">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleLogin} className="space-y-4 text-left">
          <input
            type="email"
            placeholder="empresa@correo.cl"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            required
            autoComplete="email"
          />

          <input
            type="password"
            placeholder="********"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            required
            autoComplete="current-password"
          />

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-lg bg-sky-600 py-2 text-white disabled:opacity-60"
          >
            {isSubmitting ? "Ingresando…" : "Iniciar sesión"}
          </button>
        </form>

        <p className="text-sm text-zinc-600">
          ¿No tienes cuenta?{" "}
          <Link href="/auth/register" className="text-sky-600 font-medium">
            Crear cuenta
          </Link>
        </p>
      </div>
    </div>
  );
}
