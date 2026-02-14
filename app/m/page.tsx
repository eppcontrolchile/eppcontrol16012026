// app/m/page.tsx

"use client";

import Link from "next/link";

export default function MobileHome() {
  return (
    <main className="min-h-screen bg-white text-zinc-900 px-5 py-8">
      <div className="max-w-md mx-auto space-y-6">
        <div className="rounded-2xl border bg-zinc-50 p-5">
          <h1 className="text-2xl font-semibold">EPP Entregas</h1>
          <p className="mt-2 text-sm text-zinc-600">
            App operativa para registrar entregas con firma.
          </p>
        </div>

        <Link
          href="/auth/login?next=/m/entrega"
          className="block w-full text-center rounded-xl bg-sky-600 py-4 text-white font-semibold text-lg hover:bg-sky-700"
        >
          Iniciar sesión y registrar entrega
        </Link>

        <p className="text-xs text-zinc-500">
          Tip: instala esta app desde Chrome → menú ⋮ → “Instalar app”.
        </p>
      </div>
    </main>
  );
}
