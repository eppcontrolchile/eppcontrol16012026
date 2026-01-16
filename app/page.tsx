// app/page.tsx
import Image from "next/image";
import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-sky-50 to-white text-zinc-900">

      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto">
        <div className="flex items-center gap-3">
          <Image
          src="/logoepp.png"
          alt="EPP Control"
          width={420}
          height={280}
          className="h-28 w-auto"
          priority
          />
          <span className="font-semibold text-lg">
            EPP Control
          </span>
        </div>

        <nav className="flex items-center gap-4">
          <Link
            href="/auth/login"
            className="text-sm font-medium text-zinc-700 hover:text-zinc-900"
          >
            Iniciar sesión
          </Link>
          <Link
            href="/auth/register"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 transition"
          >
            Crear cuenta (7 días gratis)
          </Link>
        </nav>
      </header>

      {/* HERO */}
      <section className="px-6 py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Gestión inteligente de <span className="text-sky-600">EPP</span>
        </h1>

        <p className="mt-4 max-w-2xl mx-auto text-lg text-zinc-600">
          Controla stock, entrega y respaldo legal de los elementos de protección
          personal de tu empresa de forma simple y segura.
        </p>

        <div className="mt-8 flex justify-center gap-4">
          <Link
            href="/auth/register"
            className="rounded-xl bg-sky-600 px-6 py-3 text-white font-medium hover:bg-sky-700 transition"
          >
            Comenzar ahora
          </Link>

          <Link
            href="/auth/login"
            className="rounded-xl border border-zinc-300 px-6 py-3 font-medium hover:bg-zinc-100 transition"
          >
            Ya tengo cuenta
          </Link>
        </div>
      </section>

      {/* BENEFICIOS */}
      <section className="px-6 py-12">
        <div className="mx-auto max-w-6xl grid gap-8 sm:grid-cols-3 text-center">

          <div className="rounded-2xl bg-white p-8 shadow-md">
            <div className="text-sky-600 text-3xl mb-4">📦</div>
            <h3 className="font-semibold text-lg">Stock controlado</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Visualiza existencias, define stock crítico y recibe alertas automáticas.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-md">
            <div className="text-emerald-600 text-3xl mb-4">✍️</div>
            <h3 className="font-semibold text-lg">Entrega con respaldo</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Firma digital del trabajador y comprobante en PDF.
            </p>
          </div>

          <div className="rounded-2xl bg-white p-8 shadow-md">
            <div className="text-sky-600 text-3xl mb-4">🔒</div>
            <h3 className="font-semibold text-lg">Seguridad y privacidad</h3>
            <p className="mt-2 text-sm text-zinc-600">
              Protección de datos garantizada para tu empresa y empleados.
            </p>
          </div>

        </div>
      </section>

      {/* PLANS */}
      <section className="px-6 py-20 bg-gray-50">
  <div className="mx-auto max-w-6xl text-center">
    <h2 className="text-3xl font-semibold mb-4">
      Planes pensados para crecer con tu empresa
    </h2>

    <p className="mb-12 text-zinc-600">
      Elige el plan que mejor se adapte a tu operación. Ambos incluyen{" "}
      <strong>7 días de prueba gratis</strong>.
    </p>

    <div className="grid gap-8 sm:grid-cols-2">

      {/* PLAN ESTANDAR */}
      <div className="rounded-2xl bg-white p-8 shadow-md flex flex-col">
        <h3 className="font-semibold text-xl mb-2">Plan Estándar</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Ideal para empresas pequeñas y medianas
        </p>

        <ul className="mb-6 text-sm text-zinc-600 flex-grow space-y-2 text-left">
          <li>✔️ Entrega de EPP desde celular</li>
          <li>✔️ Firma digital + comprobante PDF</li>
          <li>✔️ Control de stock con FIFO</li>
          <li>✔️ Alertas básicas de stock crítico</li>
          <li>✔️ 1 usuario administrador</li>
        </ul>

        <p className="mb-4 text-sm text-zinc-500">
          Precio según cantidad de trabajadores activos.
        </p>

        <Link
          href="/auth/register?plan=standard"
          className="mt-auto rounded-lg bg-sky-600 px-4 py-2 text-white font-medium hover:bg-sky-700 transition"
        >
          Probar Plan Estándar
        </Link>
      </div>

      {/* PLAN AVANZADO */}
      <div className="rounded-2xl bg-white p-8 shadow-md flex flex-col border-2 border-sky-600">
        <h3 className="font-semibold text-xl mb-2">Plan Avanzado</h3>
        <p className="mb-4 text-sm text-zinc-500">
          Para empresas con múltiples roles y mayor control
        </p>

        <ul className="mb-6 text-sm text-zinc-600 flex-grow space-y-2 text-left">
          <li>✔️ Todo lo incluido en el Plan Estándar</li>
          <li>✔️ Múltiples usuarios y roles</li>
          <li>✔️ Reportes avanzados de gastos</li>
          <li>✔️ Vista RRHH y Finanzas</li>
          <li>✔️ Mayor trazabilidad y control</li>
        </ul>

        <p className="mb-4 text-sm text-zinc-500">
          Precio según cantidad de trabajadores activos.
        </p>

        <Link
          href="/auth/register?plan=advanced"
          className="mt-auto rounded-lg bg-sky-600 px-4 py-2 text-white font-medium hover:bg-sky-700 transition"
        >
          Probar Plan Avanzado
        </Link>
      </div>

    </div>
  </div>
</section>

      {/* PLANES SEGÚN CANTIDAD DE TRABAJADORES */}
<section className="px-6 py-20 bg-white">
  <div className="mx-auto max-w-5xl text-center">
    <h2 className="text-3xl font-semibold mb-4">
      Planes según cantidad de trabajadores
    </h2>

    <p className="text-zinc-600 mb-12">
      Elige el tramo que mejor represente tu operación. Todos los planes incluyen
      <strong> 7 días de prueba gratis</strong>.
    </p>

    <div className="overflow-x-auto">
      <table className="w-full border-collapse rounded-2xl overflow-hidden shadow-sm">
        <thead className="bg-zinc-50">
          <tr>
            <th className="p-4 text-center text-sm font-semibold text-zinc-700">
              Tamaño de empresa
            </th>
            <th className="p-4 text-center text-sm font-semibold text-zinc-700">
              Plan Estándar
            </th>
            <th className="p-4 text-center text-sm font-semibold text-zinc-700">
              Plan Avanzado
            </th>
          </tr>
        </thead>

        <tbody className="divide-y">
          <tr>
            <td className="p-4 font-medium">Hasta 25 trabajadores</td>
            <td className="p-4 text-center">
              <div className="font-semibold">$29.990</div>
              <div className="text-xs text-zinc-500">1 usuario</div>
            </td>
            <td className="p-4 text-center">
              <div className="font-semibold">$59.990</div>
              <div className="text-xs text-zinc-500">Usuarios + roles</div>
            </td>
          </tr>

          <tr>
            <td className="p-4 font-medium">Hasta 50 trabajadores</td>
            <td className="p-4 text-center">
              <div className="font-semibold">$44.990</div>
              <div className="text-xs text-zinc-500">1 usuario</div>
            </td>
            <td className="p-4 text-center">
              <div className="font-semibold">$89.990</div>
              <div className="text-xs text-zinc-500">Usuarios + roles</div>
            </td>
          </tr>

          <tr>
            <td className="p-4 font-medium">Hasta 100 trabajadores</td>
            <td className="p-4 text-center">
              <div className="font-semibold">$69.990</div>
              <div className="text-xs text-zinc-500">1 usuario</div>
            </td>
            <td className="p-4 text-center">
              <div className="font-semibold">$139.990</div>
              <div className="text-xs text-zinc-500">Usuarios + roles</div>
            </td>
          </tr>

          <tr>
            <td className="p-4 font-medium">Más de 100 trabajadores</td>
            <td className="p-4 text-center">
              <div className="font-semibold">$99.990</div>
              <div className="text-xs text-zinc-500">1 usuario</div>
            </td>
            <td className="p-4 text-center">
              <div className="font-semibold">$199.990</div>
              <div className="text-xs text-zinc-500">Usuarios + roles</div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</section>

      {/* CTA FINAL */}
      <section className="bg-sky-600 px-6 py-20 text-center text-white">
        <h2 className="text-3xl font-semibold">
          Digitaliza hoy el control de EPP
        </h2>

        <p className="mt-4 text-sky-100">
          Menos papeles, más control, respaldo inmediato.
        </p>

        <Link
          href="/auth/register"
          className="mt-8 inline-block rounded-xl bg-white px-8 py-4 font-medium text-sky-700 hover:bg-sky-50 transition"
        >
          Crear cuenta
        </Link>
      </section>

      {/* FOOTER */}
      <footer className="border-t px-6 py-8 text-center text-sm text-zinc-500 space-y-2">
        <div>
          ¿Necesitas ayuda? Contáctanos en{" "}
          <a
            href="mailto:soporte@eppcontrol.cl"
            className="font-medium text-sky-600 hover:underline"
          >
            soporte@eppcontrol.cl
          </a>
        </div>

        <div>
          © {new Date().getFullYear()} EPP Control · Software chileno para la gestión
          inteligente de EPP
        </div>
      </footer>
    </main>
  );
}
