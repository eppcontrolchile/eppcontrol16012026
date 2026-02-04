//app/dashboard/DashboardShell.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type React from "react";


type Props = {
  /**
   * These values are OPTIONAL because Next.js `layout.tsx` cannot receive custom props.
   * When not provided, we fall back to safe defaults.
   */
  companyName?: string;
  companyRut?: string;
  plan?: "standard" | "advanced";
  rol?: "admin" | "supervisor" | "bodega" | "solo_lectura";
  companyLogoUrl?: string | null;
  children: React.ReactNode;
};

export default function DashboardShell({
  companyName = "Empresa",
  companyRut = "",
  plan = "standard",
  rol = "solo_lectura",
  companyLogoUrl,
  children,
}: Props) {
  const router = useRouter();

  const defaultLogo = "/logoepp.png";

  const initialLogoSrc = useMemo(() => {
    const url = (companyLogoUrl ?? "").trim();
    return url.length > 0 ? url : defaultLogo;
  }, [companyLogoUrl]);

  const [logoSrc, setLogoSrc] = useState<string>(initialLogoSrc);

  useEffect(() => {
    setLogoSrc(initialLogoSrc);
  }, [initialLogoSrc]);

  const handleLogout = async () => {
    await supabaseBrowser().auth.signOut();
    router.push("/auth/login");
  };

  return (
    <main className="min-h-screen bg-gray-50 flex">
      {/* SIDEBAR */}
      <aside className="w-60 bg-white border-r px-4 py-6">
        <div className="flex items-center gap-3 mb-8">
          <div className="h-10 w-10 rounded-md border bg-white flex items-center justify-center overflow-hidden">
            <img
              src={logoSrc}
              alt={companyName ? `Logo ${companyName}` : "Logo empresa"}
              className="h-full w-full object-contain"
              onError={() => setLogoSrc(defaultLogo)}
            />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-zinc-800 text-sm">
              {companyName || "Empresa"}
            </div>
            {!!companyRut && (
              <div className="text-xs text-zinc-500">RUT: {companyRut}</div>
            )}
          </div>
        </div>

        <nav className="space-y-2 text-sm">
          <button
            onClick={() => router.push("/dashboard")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            🏠 Dashboard
          </button>

          <button
            onClick={() => router.push("/dashboard/stock")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            📦 Stock
          </button>

          <button
            onClick={() => router.push("/dashboard/ingreso")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            ➕ Ingreso
          </button>

          <button
            onClick={() => router.push("/dashboard/egreso")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            ➖ Egreso
          </button>

          <button
            onClick={() => router.push("/dashboard/entregas")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            📑 Entregas
          </button>

          <button
            onClick={() => router.push("/dashboard/gastos")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            📊 Gastos
          </button>

          <button
            onClick={() => router.push("/dashboard/trabajadores")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            👷 Trabajadores
          </button>

          <button
            onClick={() => router.push("/dashboard/centros")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            🏭 Centros de trabajo
          </button>

          {rol === "admin" && (
            <button
              onClick={() => router.push("/dashboard/usuarios")}
              className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
            >
              👥 Usuarios y roles
              {plan !== "advanced" && (
                <div className="mt-1 w-fit text-xs bg-zinc-200 rounded px-2 py-0.5">
                  Plan Avanzado
                </div>
              )}
            </button>
          )}

          <button
            onClick={() => router.push("/dashboard/suscripcion")}
            className="w-full text-left px-3 py-2 rounded hover:bg-gray-100"
          >
            💳 Suscripción
          </button>
        </nav>

        <div className="mt-10">
          <button
            onClick={handleLogout}
            className="text-sm text-zinc-600 hover:text-zinc-900"
          >
            Cerrar sesión
          </button>
        </div>
      </aside>

      {/* CONTENIDO */}
      <div className="flex-1">
        <header className="px-8 py-4 bg-white shadow-sm">
          <h1 className="text-lg font-semibold text-zinc-800">
            Dashboard
          </h1>
        </header>

        <section className="p-8">{children}</section>
      </div>
    </main>
  );
}
