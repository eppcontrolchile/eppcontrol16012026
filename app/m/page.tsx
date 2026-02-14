// app/m/page.tsx

export default function MobileInstallPage() {
  return (
    <main className="min-h-screen bg-white px-4 py-10">
      <h1 className="text-2xl font-semibold">App de Entregas</h1>
      <p className="mt-2 text-sm text-zinc-600">
        Instala la app para registrar entregas de EPP en modo pantalla completa.
      </p>

      <div className="mt-6 rounded-xl border p-4">
        <h2 className="font-medium">Android (Chrome)</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Toca <b>Instalar</b> en la barra del navegador o en el menú ⋮.
        </p>
      </div>

      <div className="mt-3 rounded-xl border p-4">
        <h2 className="font-medium">iPhone (Safari)</h2>
        <p className="mt-1 text-sm text-zinc-600">
          Toca <b>Compartir</b> → <b>Agregar a pantalla de inicio</b>.
        </p>
      </div>

      <p className="mt-6 text-xs text-zinc-500">
        Al abrir la app desde el ícono, se solicitará iniciar sesión.
      </p>
    </main>
  );
}
