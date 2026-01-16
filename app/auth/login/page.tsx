//auth/login/page



"use client";

import { createBrowserClient } from "@supabase/ssr";
import { useRouter } from "next/navigation";
import { useState } from "react";

const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setInfo(null);

    if (!email) {
      setError("Ingresa tu correo de empresa.");
      return;
    }

    if (!password) {
      setError("Ingresa tu contraseña.");
      return;
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    console.log("SIGN IN ERROR:", error);

    if (error || !data?.session) {
      setError("Correo o contraseña incorrectos.");
      return;
    }

    // Debug: confirmar sesión en browser
    const sessionCheck = await supabase.auth.getSession();
    console.log("SESSION AFTER LOGIN:", sessionCheck.data.session);

    const authUser = data.user;

    // 🔥 TEST TEMPORAL: forzar entrada directa al dashboard
    router.replace("/dashboard");
    return;
  };

  return (
    <div className="mx-auto max-w-sm space-y-6 text-center">
      {/* Logo */}
      <div className="flex justify-center">
        <img
          src="/logoepp.png"
          alt="EPP Control"
          className="h-28 w-auto"
        />
      </div>

      <h1 className="text-2xl font-semibold">
        Login empresa
      </h1>

      <form onSubmit={handleLogin} className="space-y-4 text-left">
        <div>
          <label htmlFor="email" className="mb-1 block text-sm font-medium">
            Correo empresa
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="input"
            placeholder="empresa@correo.cl"
          />
        </div>

        <div>
          <label htmlFor="password" className="mb-1 block text-sm font-medium">
            Contraseña
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input"
            placeholder="********"
          />
        </div>

        <button
          type="button"
          onClick={async () => {
            setError(null);
            if (!email) {
              setError("Ingresa tu correo para recuperar tu contraseña.");
              return;
            }

            const { error } = await supabase.auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/auth/reset-password`,
            });

            if (error) {
              setError("No se pudo enviar el correo de recuperación.");
              return;
            }

            setInfo("Te enviamos un correo para restablecer tu contraseña.");
          }}
          className="text-xs text-sky-600 underline"
        >
          ¿Olvidaste tu contraseña?
        </button>

        {error && (
          <div className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {info && (
          <div className="rounded border border-sky-300 bg-sky-50 p-2 text-sm text-sky-700">
            {info}
          </div>
        )}

        <button
          type="submit"
          className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Iniciar sesión
        </button>

        <p className="text-xs text-zinc-500 text-center">
          Acceso temporal para entorno de prueba.
        </p>
      </form>
    </div>
  );
}
