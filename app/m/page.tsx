// app/m/page.tsx

"use client";

import Link from "next/link";

export default function EntregasMobileLanding() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 flex flex-col items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">EPP Entregas</h1>
          <p className="text-sm text-zinc-500 mt-2">
            Instala la app para registrar entregas de EPP en modo pantalla completa.
          </p>
        </div>

        <div className="rounded-xl border p-4 space-y-2">
          <div className="font-semibold">Android (Chrome)</div>
          <div className="text-sm text-zinc-600">
            Toca <b>Instalar</b> en la barra del navegador o en el menú ⋮.
          </div>
        </div>

        <div className="rounded-xl border p-4 space-y-2">
          <div className="font-semibold">iPhone (Safari)</div>
          <div className="text-sm text-zinc-600">
            Toca <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>.
          </div>
        </div>

        <div className="text-center text-sm text-zinc-500">
          Al abrir la app desde el ícono, se solicitará iniciar sesión.
        </div>

        <div className="flex justify-center">
          <Link
            href="/auth/login?next=/m/entrega"
            className="rounded-xl bg-sky-600 px-6 py-3 text-white font-medium"
          >
            Iniciar sesión
          </Link>
        </div>
      </div>
    </main>
  );
}
