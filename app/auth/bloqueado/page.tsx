//app/auth/bloqueado/page.tsx


"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function BloqueadoPage() {
  const [loading, setLoading] = useState(false);

  // Limpieza pro: si el usuario llega con sesión aún activa, la cerramos
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        await supabaseBrowser().auth.signOut();
      } catch {
        // no-op
      } finally {
        if (!cancelled) {
          // No hacemos redirect automático para que el usuario lea el mensaje,
          // pero dejamos la sesión limpia para que el botón funcione.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGoLogin = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await supabaseBrowser().auth.signOut();
    } catch {
      // no-op
    } finally {
      window.location.href = "/auth/login?reason=inactive";
    }
  };

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-8">
        <div className="flex justify-center mb-6">
          <Image src="/logoepp.png" alt="EPP Control" width={140} height={80} />
        </div>

        <h1 className="text-3xl font-bold text-center">Acceso bloqueado</h1>

        <p className="text-center text-zinc-600 mt-4">
          Tu cuenta fue desactivada por el administrador de tu empresa.
        </p>

        <p className="text-center text-zinc-600 mt-2">
          Si crees que esto es un error, contacta al administrador o al equipo de soporte.
        </p>

        <button
          onClick={handleGoLogin}
          disabled={loading}
          className="mt-8 w-full rounded-xl bg-sky-600 py-3 text-white font-medium hover:bg-sky-700 transition disabled:opacity-50"
        >
          {loading ? "Saliendo…" : "Volver al inicio de sesión"}
        </button>

        <div className="mt-4 text-center">
          <Link href="/contacto" className="text-sky-600 underline">
            Contactar soporte
          </Link>
        </div>
      </div>
    </main>
  );
}
