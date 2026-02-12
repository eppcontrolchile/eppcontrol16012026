// app/auth/login/page.tsx
"use client";
export const dynamic = "force-dynamic";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function getAppBaseUrl(): string {
  // Browser
  if (typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }

  // Fallback (build-time env)
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.eppcontrol.cl"
  ).replace(/\/$/, "");
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [resetSent, setResetSent] = useState<string | null>(null);
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetLoading, setResetLoading] = useState(false);

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    setError(null);
    setIsSubmitting(true);

    try {
      const params = new URLSearchParams(window.location.search);
      const rawNext = params.get("next") || "/dashboard";
      const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

      // Persistencia de sesión (se aplica en lib/supabase/client.ts):
      // - rememberMe = true  -> localStorage (permanece días)
      // - rememberMe = false -> sessionStorage (se pierde al cerrar el navegador)
      window.localStorage.setItem("epp_remember", rememberMe ? "1" : "0");

      const { data, error } = await supabaseBrowser().auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });

        if (error || !data.session) {
          setError("Correo o contraseña incorrectos.");
          setPassword("");
          return;
        }

        // 🔔 Non-blocking: registrar última conexión (no bloquea el login)
        fetch("/api/auth/ping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
        }).catch(() => {
          // ignore
        });

        // ✅ full reload para que el server/layout vea cookies SI o SI
        window.location.href = next;
    } catch (err: any) {
      setError(err?.message || "No se pudo iniciar sesión.");
      setPassword("");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleForgotPassword = async () => {
    setResetError(null);
    setResetSent(null);

    const mail = (email || "").trim().toLowerCase();
    if (!mail) {
      setResetError("Escribe tu correo para enviarte el enlace.");
      return;
    }

    try {
      setResetLoading(true);

      const redirectTo = `${getAppBaseUrl()}/auth/set-password`;

      const { error } = await supabaseBrowser().auth.resetPasswordForEmail(mail, {
        redirectTo,
      });

      if (error) throw error;

      // Seguridad: no confirmamos si el correo existe o no
      setResetSent(
        "Si el correo existe, te llegará un enlace para crear tu nueva contraseña."
      );
    } catch (err: any) {
      setResetError(
        err?.message ?? "No se pudo enviar el enlace. Intenta nuevamente."
      );
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm space-y-6 text-center">
      <div className="flex justify-center">
        <img src="/logoepp.png" alt="EPP Control" className="h-28 w-auto" />
      </div>

      <h1 className="text-2xl font-semibold">Login empresa</h1>

      <form onSubmit={handleLogin} className="space-y-4 text-left">
        <input
          type="email"
          placeholder="empresa@correo.cl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
          required
        />

        <input
          type="password"
          placeholder="********"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
          required
        />

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            className="h-4 w-4"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
          />
          Mantener sesión iniciada en este equipo
        </label>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {resetError && (
          <p className="text-red-600 text-sm">{resetError}</p>
        )}

        {resetSent && (
          <p className="text-green-700 text-sm">{resetSent}</p>
        )}

        <button
          disabled={isSubmitting}
          className="w-full rounded-lg bg-sky-600 py-2 text-white disabled:opacity-60"
        >
          {isSubmitting ? "Ingresando…" : "Iniciar sesión"}
        </button>

        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={resetLoading}
          className="text-sm text-sky-600 hover:underline text-center block w-full"
        >
          {resetLoading ? "Enviando enlace…" : "Olvidé mi contraseña"}
        </button>

        <Link
          href="/auth/register"
          className="text-sm text-sky-600 hover:underline text-center block mt-3"
        >
          Crear cuenta
        </Link>
      </form>
    </div>
  );
}
