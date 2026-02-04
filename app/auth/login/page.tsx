//app/auth/login/page.tsx

"use client";

import { useRouter } from "next/navigation";
import type React from "react";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export const dynamic = "force-dynamic";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const { data, error } = await supabaseBrowser.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      setError("Correo o contraseña incorrectos.");
      return;
    }

    router.replace("/dashboard");
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
        />

        <input
          type="password"
          placeholder="********"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input"
        />

        {error && <p className="text-red-600 text-sm">{error}</p>}

        <button className="w-full rounded-lg bg-sky-600 py-2 text-white">
          Iniciar sesión
        </button>
      </form>
    </div>
  );
}
