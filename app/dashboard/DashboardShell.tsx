//app/dashboard/DashboardShell.tsx

"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import type React from "react";

export type PlanTipo = "standard" | "advanced";
export type UserRole = "admin" | "supervisor" | "bodega" | "solo_entrega" | "gerencia";

const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  supervisor: "Supervisor",
  bodega: "Bodega",
  solo_entrega: "Solo entrega",
  gerencia: "Gerencia",
};

const ROLE_BADGE_CLASS: Record<UserRole, string> = {
  admin: "bg-emerald-50 text-emerald-700 border-emerald-200",
  supervisor: "bg-sky-50 text-sky-700 border-sky-200",
  bodega: "bg-amber-50 text-amber-800 border-amber-200",
  solo_entrega: "bg-zinc-50 text-zinc-700 border-zinc-200",
  gerencia: "bg-violet-50 text-violet-700 border-violet-200",
};

function formatDateTimeSantiago(input?: string | null): string {
  if (!input) return "—";
  const d = new Date(input);
  if (isNaN(d.getTime())) return "—";

  const parts = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);

  const get = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}

function textOrDash(s: string | null | undefined): string {
  const t = (s ?? "").toString().trim();
  return t ? t : "—";
}

type Props = {
  /**
   * These values are normally provided by `app/dashboard/layout.tsx`.
   * We keep them optional with safe defaults to avoid hard crashes if something is miswired.
   */
  companyName?: string;
  companyRut?: string;
  plan?: PlanTipo;
  rol?: UserRole;
  companyLogoUrl?: string | null;
  children: React.ReactNode;
};

export default function DashboardShell({
  companyName = "Empresa",
  companyRut = "",
  plan = "standard",
  rol = "solo_entrega",
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
    if (p.startsWith("/dashboard/configuracion")) return "Configuración";
    if (p.startsWith("/dashboard/suscripcion")) return "Suscripción";
    return "Dashboard";
  }, [pathname]);

  const defaultLogo = "/logoepp.png";

  const initialLogoSrc = useMemo(() => {
    const url = (companyLogoUrl ?? "").trim();
    return url.length > 0 ? url : defaultLogo;
  }, [companyLogoUrl]);

  const [logoSrc, setLogoSrc] = useState<string>(initialLogoSrc);
  const [lastLoginAt, setLastLoginAt] = useState<string | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  const clearClientSessionArtifacts = () => {
    try {
      // Remove known app cache keys
      localStorage.removeItem("suscripcion");

      // Remove Supabase auth keys (project-ref varies, so we match prefixes)
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k) continue;
        if (k.startsWith("sb-") || k.includes("supabase") || k.includes("auth-token")) {
          localStorage.removeItem(k);
        }
      }

      // Session storage can also hold transient state
      for (let i = sessionStorage.length - 1; i >= 0; i--) {
        const k = sessionStorage.key(i);
        if (!k) continue;
        if (k.startsWith("sb-") || k.includes("supabase") || k.includes("auth-token")) {
          sessionStorage.removeItem(k);
        }
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    setLogoSrc(initialLogoSrc);
  }, [initialLogoSrc]);

  useEffect(() => {
    let mounted = true;

    async function loadAuthMeta() {
      try {
        const { data } = await supabaseBrowser().auth.getUser();
        const u = data?.user;
        if (!mounted) return;
        // Supabase devuelve last_sign_in_at cuando existe
        setLastLoginAt((u as any)?.last_sign_in_at ?? null);
      } catch {
        if (!mounted) return;
        setLastLoginAt(null);
      }
    }

    loadAuthMeta();

    return () => {
      mounted = false;
    };
  }, []);

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);

    try {
      await supabaseBrowser().auth.signOut();
    } catch {
      // Even if signOut fails, we still clear client artifacts and hard redirect.
    } finally {
      clearClientSessionArtifacts();
      // hard redirect so server/layout always sees cleared cookies
      window.location.href = "/auth/login";
    }
  };

  // ─────────────────────────────────────────────
  // Permisos de navegación (UX gate)
  // Nota: La seguridad real SIEMPRE debe validarse también en server.
  // ─────────────────────────────────────────────
  const isAdvanced = plan === "advanced";
  const isSoloEntrega = rol === "solo_entrega";
  const isGerencia = rol === "gerencia";

  const hasAnyRole = (...roles: UserRole[]) => roles.includes(rol);

  // Stock: visible para roles operativos y gerencia (pero NO para solo_entrega)
  const canSeeStock = !isSoloEntrega;

  // Ingreso: admin y bodega (Gerencia es lectura, no opera)
  const canSeeIngreso = hasAnyRole("admin", "bodega");

  // Egreso (realizar entrega): admin, supervisor, bodega, solo_entrega (Gerencia no opera)
  const canSeeEgreso = hasAnyRole("admin", "supervisor", "bodega", "solo_entrega");

  // Entregas (historial/consulta): roles operativos + gerencia (NO incluye solo_entrega; solo_entrega solo entrega)
  const canSeeEntregas = hasAnyRole("admin", "supervisor", "bodega", "gerencia");

  // Gastos: admin, supervisor, gerencia
  const canSeeGastos = hasAnyRole("admin", "supervisor", "gerencia");

  // Trabajadores / Centros: admin, supervisor, gerencia
  const canSeeTrabajadores = hasAnyRole("admin", "supervisor", "gerencia");
  const canSeeCentros = hasAnyRole("admin", "supervisor", "gerencia");

  // Usuarios y roles: SOLO admin y SOLO en plan advanced
  const canSeeUsuariosRoles = rol === "admin" && isAdvanced;

  // Configuración: solo admin
  const canSeeConfiguracion = rol === "admin";

  // Suscripción: solo admin
  const canSeeSuscripcion = rol === "admin";

  // Redirect UX guard: si un usuario cae por URL en una sección no permitida,
  // lo devolvemos a una ruta segura según su rol.
  const canAccessPath = (p: string) => {
    if (!p) return true;
    if (p === "/dashboard") return !isSoloEntrega;

    if (p.startsWith("/dashboard/stock")) return canSeeStock;
    if (p.startsWith("/dashboard/ingreso")) return canSeeIngreso;
    if (p.startsWith("/dashboard/egreso")) return canSeeEgreso;
    if (p.startsWith("/dashboard/entregas")) return canSeeEntregas;
    if (p.startsWith("/dashboard/gastos")) return canSeeGastos;
    if (p.startsWith("/dashboard/trabajadores")) return canSeeTrabajadores;
    if (p.startsWith("/dashboard/centros")) return canSeeCentros;
    if (p.startsWith("/dashboard/usuarios")) return canSeeUsuariosRoles;
    if (p.startsWith("/dashboard/configuracion")) return canSeeConfiguracion;
    if (p.startsWith("/dashboard/suscripcion")) return canSeeSuscripcion;

    // rutas desconocidas dentro del dashboard:
    // - solo_entrega: no debe navegar fuera del flujo de entrega
    // - otros roles: permitir y que el route maneje
    return isSoloEntrega ? false : true;
  };

  const safeHomeForRole = () => {
    if (rol === "solo_entrega") return "/dashboard/egreso";
    if (rol === "gerencia") return "/dashboard/stock";
    return "/dashboard";
  };

  useEffect(() => {
    if (!pathname) return;
    if (!canAccessPath(pathname)) {
      router.replace(safeHomeForRole());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, rol, plan]);

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
          <div className="leading-tight min-w-0">
            <div className="font-semibold text-zinc-800 text-sm truncate">
              {companyName || "Empresa"}
            </div>
            {!!companyRut && (
              <div className="text-xs text-zinc-500 truncate">RUT: {companyRut}</div>
            )}

            <div className="mt-1 flex flex-wrap gap-1">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${ROLE_BADGE_CLASS[rol]}`}
                title={`Rol: ${ROLE_LABEL[rol]}`}
              >
                {ROLE_LABEL[rol]}
              </span>
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${
                  isAdvanced
                    ? "bg-indigo-50 text-indigo-700 border-indigo-200"
                    : "bg-zinc-50 text-zinc-700 border-zinc-200"
                }`}
                title={`Plan: ${isAdvanced ? "Advanced" : "Standard"}`}
              >
                {isAdvanced ? "Advanced" : "Standard"}
              </span>
            </div>
            <div className="mt-2 text-[11px] text-zinc-500">
              Último acceso: {textOrDash(formatDateTimeSantiago(lastLoginAt))}
            </div>
          </div>
        </div>

        <nav className="space-y-2 text-sm">
          {!isSoloEntrega && (
            <button
              onClick={() => router.push("/dashboard")}
              className={navBtnClass(isActive("/dashboard"))}
              aria-current={isActive("/dashboard") ? "page" : undefined}
            >
              <span aria-hidden>🏠</span>
              <span>Dashboard</span>
            </button>
          )}

          {canSeeStock && (
            <button
              onClick={() => router.push("/dashboard/stock")}
              className={navBtnClass(isActive("/dashboard/stock"))}
              aria-current={isActive("/dashboard/stock") ? "page" : undefined}
            >
              <span aria-hidden>📦</span>
              <span>Stock</span>
            </button>
          )}

          {canSeeIngreso && (
            <button
              onClick={() => router.push("/dashboard/ingreso")}
              className={navBtnClass(isActive("/dashboard/ingreso"))}
              aria-current={isActive("/dashboard/ingreso") ? "page" : undefined}
            >
              <span aria-hidden>➕</span>
              <span>Ingreso</span>
            </button>
          )}

          {canSeeEgreso && (
            <button
              onClick={() => router.push("/dashboard/egreso")}
              className={navBtnClass(isActive("/dashboard/egreso"))}
              aria-current={isActive("/dashboard/egreso") ? "page" : undefined}
            >
              <span aria-hidden>➖</span>
              <span>Egreso</span>
            </button>
          )}

          {canSeeEntregas && (
            <button
              onClick={() => router.push("/dashboard/entregas")}
              className={navBtnClass(isActive("/dashboard/entregas"))}
              aria-current={isActive("/dashboard/entregas") ? "page" : undefined}
            >
              <span aria-hidden>📑</span>
              <span>Entregas</span>
            </button>
          )}

          {canSeeGastos && (
            <button
              onClick={() => router.push("/dashboard/gastos")}
              className={navBtnClass(isActive("/dashboard/gastos"))}
              aria-current={isActive("/dashboard/gastos") ? "page" : undefined}
            >
              <span aria-hidden>📊</span>
              <span>Gastos</span>
            </button>
          )}

          {canSeeTrabajadores && (
            <button
              onClick={() => router.push("/dashboard/trabajadores")}
              className={navBtnClass(isActive("/dashboard/trabajadores"))}
              aria-current={isActive("/dashboard/trabajadores") ? "page" : undefined}
            >
              <span aria-hidden>👷</span>
              <span>Trabajadores</span>
            </button>
          )}

          {canSeeCentros && (
            <button
              onClick={() => router.push("/dashboard/centros")}
              className={navBtnClass(isActive("/dashboard/centros"))}
              aria-current={isActive("/dashboard/centros") ? "page" : undefined}
            >
              <span aria-hidden>🏭</span>
              <span>Centros de trabajo</span>
            </button>
          )}

          {canSeeUsuariosRoles && (
            <button
              onClick={() => router.push("/dashboard/usuarios")}
              className={navBtnClass(isActive("/dashboard/usuarios"))}
              aria-current={isActive("/dashboard/usuarios") ? "page" : undefined}
            >
              <span aria-hidden>👥</span>
              <span>Usuarios y roles</span>
            </button>
          )}

          {canSeeConfiguracion && (
            <button
              onClick={() => router.push("/dashboard/configuracion")}
              className={navBtnClass(isActive("/dashboard/configuracion"))}
              aria-current={isActive("/dashboard/configuracion") ? "page" : undefined}
            >
              <span aria-hidden>⚙️</span>
              <span>Configuración</span>
            </button>
          )}
          {canSeeSuscripcion && (
            <button
              onClick={() => router.push("/dashboard/suscripcion")}
              className={navBtnClass(isActive("/dashboard/suscripcion"))}
              aria-current={isActive("/dashboard/suscripcion") ? "page" : undefined}
            >
              <span aria-hidden>💳</span>
              <span>Suscripción</span>
            </button>
          )}
          {isGerencia && (
            <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50 p-2 text-xs text-violet-800">
              Modo <b>Gerencia</b>: acceso de lectura (sin creación/edición).
            </div>
          )}
          {isSoloEntrega && (
            <div className="mt-2 rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-xs text-zinc-600">
              Modo <b>Solo entrega</b>: solo puedes registrar entregas.
            </div>
          )}
        </nav>

        <div className="mt-10">
          <button
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-sm text-zinc-600 hover:text-zinc-900 disabled:opacity-50"
          >
            {loggingOut ? "Cerrando sesión..." : "Cerrar sesión"}
          </button>
        </div>
      </aside>

      {/* CONTENIDO */}
      <div className="flex-1">
        <header className="px-8 py-4 bg-white shadow-sm">
          <h1 className="text-lg font-semibold text-zinc-800">
            {isSoloEntrega ? "Entrega" : titleFromPath}
          </h1>
        </header>

        <section className="p-8">{children}</section>
      </div>
    </main>
  );
}
