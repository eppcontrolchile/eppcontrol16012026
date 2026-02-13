//app/auth/bloqueado/page.tsx


"use client";

import Link from "next/link";
import Image from "next/image";

export default function AccesoBloqueadoPage() {
  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center px-6">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8 text-center">

        <div className="flex justify-center mb-6">
          <Image
            src="/logoepp.png"
            alt="EPP Control"
            width={140}
            height={80}
            className="h-16 w-auto"
            priority
          />
        </div>

        <h1 className="text-2xl font-bold text-zinc-800">
          Acceso bloqueado
        </h1>

        <p className="mt-4 text-sm text-zinc-600">
          Tu cuenta fue desactivada por el administrador de tu empresa.
        </p>

        <p className="mt-2 text-sm text-zinc-600">
          Si crees que esto es un error, contacta al administrador de tu empresa
          o al equipo de soporte.
        </p>

        <div className="mt-6 space-y-3">
          <Link
            href="/auth/login"
            className="block w-full rounded-xl bg-sky-600 py-3 text-white font-medium hover:bg-sky-700 transition"
          >
            Volver al inicio de sesión
          </Link>

          <a
            href="mailto:soporte@eppcontrol.cl"
            className="block text-sm text-sky-600 hover:underline"
          >
            Contactar soporte
          </a>
        </div>
      </div>
    </main>
  );
}
