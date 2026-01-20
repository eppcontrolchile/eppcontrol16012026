//auth/login/page


"use client";

import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import { useState } from "react";

const supabase = createClient(
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

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
      options: {
        shouldCreateUser: false,
      },
    });

    console.log("SIGN IN ERROR:", error);
    console.log("SIGN IN DATA:", data);

    if (error || !data.session) {
      setError("Correo o contraseña incorrectos.");
      return;
    }

    // 🔑 Forzar persistencia de sesión (cookies) para SSR
    await supabase.auth.setSession({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    });

    const sessionCheck = await supabase.auth.getSession();
    console.log("SESSION AFTER LOGIN:", sessionCheck.data.session);

    router.replace("/dashboard");
  };

  return (
    <div className="mx-auto max-w-sm space-y-6 text-center">
      <div className="flex justify-center">
        <img src="/logoepp.png" alt="EPP Control" className="h-28 w-auto" />
      </div>

      <h1 className="text-2xl font-semibold">Login empresa</h1>

      <form onSubmit={handleLogin} className="space-y-4 text-left">
        <label htmlFor="email" className="mb-1 block text-sm font-medium">
          Correo empresa
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="empresa@correo.cl"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input"
        />

        <label htmlFor="password" className="mb-1 block text-sm font-medium">
          Contraseña
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="********"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}
        {info && <p className="text-sky-600 text-sm">{info}</p>}

        <button className="w-full rounded-lg bg-sky-600 py-2 text-white">
          Iniciar sesión
        </button>
      </form>
    </div>
  );
}
