//app/dashboard/DashboardShell.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
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

  const pathname = usePathname();

  const isActive = (href: string) => {
    if (!pathname) return false;
    if (href === "/dashboard") return pathname === "/dashboard";
    return pathname === href || pathname.startsWith(href + "/");
  };

  const navBtnClass = (active: boolean) =>
    [
      "w-full text-left px-3 py-2 rounded flex items-center gap-2",
      active
        ? "bg-sky-50 text-sky-700 border border-sky-200"
        : "hover:bg-gray-100 text-zinc-800",
    ].join(" ");

  const titleFromPath = useMemo(() => {
    const p = pathname || "/dashboard";
    if (p === "/dashboard") return "Dashboard";
    if (p.startsWith("/dashboard/stock")) return "Stock";
    if (p.startsWith("/dashboard/ingreso")) return "Ingreso";
    if (p.startsWith("/dashboard/egreso")) return "Egreso";
    if (p.startsWith("/dashboard/entregas")) return "Entregas";
    if (p.startsWith("/dashboard/gastos")) return "Gastos";
    if (p.startsWith("/dashboard/trabajadores")) return "Trabajadores";
    if (p.startsWith("/dashboard/centros")) return "Centros de trabajo";
    if (p.startsWith("/dashboard/usuarios")) return "Usuarios y roles";
    if (p.startsWith("/dashboard/suscripcion")) return "Suscripción";
    return "Dashboard";
  }, [pathname]);

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
            className={navBtnClass(isActive("/dashboard"))}
            aria-current={isActive("/dashboard") ? "page" : undefined}
          >
            <span aria-hidden>🏠</span>
            <span>Dashboard</span>
          </button>

          <button
            onClick={() => router.push("/dashboard/stock")}
            className={navBtnClass(isActive("/dashboard/stock"))}
            aria-current={isActive("/dashboard/stock") ? "page" : undefined}
          >
            <span aria-hidden>📦</span>
            <span>Stock</span>
          </button>

          <button
            onClick={() => router.push("/dashboard/ingreso")}
            className={navBtnClass(isActive("/dashboard/ingreso"))}
            aria-current={isActive("/dashboard/ingreso") ? "page" : undefined}
          >
            <span aria-hidden>➕</span>
            <span>Ingreso</span>
          </button>

          <button
            onClick={() => router.push("/dashboard/egreso")}
            className={navBtnClass(isActive("/dashboard/egreso"))}
            aria-current={isActive("/dashboard/egreso") ? "page" : undefined}
          >
            <span aria-hidden>➖</span>
            <span>Egreso</span>
          </button>

          <button
            onClick={() => router.push("/dashboard/entregas")}
            className={navBtnClass(isActive("/dashboard/entregas"))}
            aria-current={isActive("/dashboard/entregas") ? "page" : undefined}
          >
            <span aria-hidden>📑</span>
            <span>Entregas</span>
          </button>

          <button
            onClick={() => router.push("/dashboard/gastos")}
            className={navBtnClass(isActive("/dashboard/gastos"))}
            aria-current={isActive("/dashboard/gastos") ? "page" : undefined}
          >
            <span aria-hidden>📊</span>
            <span>Gastos</span>
          </button>

          <button
            onClick={() => router.push("/dashboard/trabajadores")}
            className={navBtnClass(isActive("/dashboard/trabajadores"))}
            aria-current={isActive("/dashboard/trabajadores") ? "page" : undefined}
          >
            <span aria-hidden>👷</span>
            <span>Trabajadores</span>
          </button>

          <button
            onClick={() => router.push("/dashboard/centros")}
            className={navBtnClass(isActive("/dashboard/centros"))}
            aria-current={isActive("/dashboard/centros") ? "page" : undefined}
          >
            <span aria-hidden>🏭</span>
            <span>Centros de trabajo</span>
          </button>

          {rol === "admin" && (
            <button
              onClick={() => router.push("/dashboard/usuarios")}
              className={navBtnClass(isActive("/dashboard/usuarios"))}
              aria-current={isActive("/dashboard/usuarios") ? "page" : undefined}
            >
              <span aria-hidden>👥</span>
              <span className="flex-1">Usuarios y roles</span>
              {plan !== "advanced" && (
                <span className="text-xs bg-zinc-200 rounded px-2 py-0.5">
                  Plan Avanzado
                </span>
              )}
            </button>
          )}

          <button
            onClick={() => router.push("/dashboard/suscripcion")}
            className={navBtnClass(isActive("/dashboard/suscripcion"))}
            aria-current={isActive("/dashboard/suscripcion") ? "page" : undefined}
          >
            <span aria-hidden>💳</span>
            <span>Suscripción</span>
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
          <h1 className="text-lg font-semibold text-zinc-800">{titleFromPath}</h1>
        </header>

        <section className="p-8">{children}</section>
      </div>
    </main>
  );
}
