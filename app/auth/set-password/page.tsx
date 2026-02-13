// app/auth/set-password/page.tsx

"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

function parseHashTokens(hash: string) {
  // hash viene como "#access_token=...&refresh_token=...&type=invite"
  const h = (hash || "").replace(/^#/, "");
  const p = new URLSearchParams(h);
  const access_token = p.get("access_token") || "";
  const refresh_token = p.get("refresh_token") || "";
  const type = p.get("type") || ""; // invite | recovery | ...
  return { access_token, refresh_token, type };
}

function parseQueryParams(search: string) {
  // search viene como "?code=..." o "?type=recovery&code=..."
  const s = (search || "").replace(/^\?/, "");
  const p = new URLSearchParams(s);
  const code = p.get("code") || "";
  const type = p.get("type") || "";
  return { code, type };
}

export default function SetPasswordPage() {
  const router = useRouter();
  const supabase = useMemo(() => {
    // ⚠️ Importante: este componente se prerenderiza en build.
    // No inicialices Supabase en SSR/build porque process.env puede no estar disponible.
    if (typeof window === "undefined") return null;
    return supabaseBrowser();
  }, []);

  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);

  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setLoading(true);
      setError(null);

      try {
        if (!supabase) {
          throw new Error(
            "Configuración incompleta. Falta NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY."
          );
        }
        // 1) Preparar sesión desde callback (2 variantes):
        //    A) PKCE: viene `?code=...` (recommended)
        //    B) Implicit: viene `#access_token=...&refresh_token=...`
        const { code } = parseQueryParams(
          typeof window !== "undefined" ? window.location.search : ""
        );
        const { access_token, refresh_token } = parseHashTokens(
          typeof window !== "undefined" ? window.location.hash : ""
        );

        if (code) {
          // Intercambia el code por una sesión
          const { error: exchErr } = await supabase!.auth.exchangeCodeForSession(
            code
          );
          if (exchErr) throw exchErr;

          // limpiar query string
          if (typeof window !== "undefined") {
            window.history.replaceState(null, "", window.location.pathname);
          }
        } else if (access_token && refresh_token) {
          const { error: sessErr } = await supabase!.auth.setSession({
            access_token,
            refresh_token,
          });
          if (sessErr) throw sessErr;

          // limpiar el hash para que no quede el token pegado en la URL
          if (typeof window !== "undefined") {
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search
            );
          }
        }

        // 2) Confirmar que haya usuario autenticado
        const { data, error: userErr } = await supabase!.auth.getUser();
        if (userErr) throw userErr;
        if (!data?.user) {
          throw new Error(
            "Link inválido o expirado. Vuelve a solicitar un enlace de creación/recuperación de clave."
          );
        }

        if (!cancelled) setSessionReady(true);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Error inicializando sesión");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setOkMsg(null);

    if (!sessionReady) {
      setError("Sesión no lista. Reintenta el enlace.");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }
    if (password !== password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    try {
      setLoading(true);

      const { error: upErr } = await supabase!.auth.updateUser({
        password,
      });
      if (upErr) throw upErr;

      // (Opcional) refrescar sesión para asegurar que quede consistente
      await supabase!.auth.refreshSession().catch(() => null);

      setOkMsg("Contraseña actualizada. Entrando…");
      // Puedes mandar al dashboard directo o al login
      // Respeta ?next=/ruta para volver al flujo correcto
      const params = new URLSearchParams(
        typeof window !== "undefined" ? window.location.search : ""
      );
      const rawNext = params.get("next") || "/dashboard";
      const next = rawNext.startsWith("/") ? rawNext : "/dashboard";

      router.replace(next);
    } catch (e: any) {
      setError(e?.message ?? "Error actualizando contraseña");
    } finally {
      setLoading(false);
    }
  }

  if (loading && !sessionReady) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl border bg-white p-4 text-sm text-zinc-600">
        Preparando tu acceso…
      </div>
    );
  }

  if (error && !sessionReady) {
    return (
      <div className="mx-auto mt-10 max-w-md rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto mt-10 max-w-md space-y-4 rounded-2xl border bg-white p-6">
      <div>
        <h1 className="text-xl font-semibold">Crear / Cambiar contraseña</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Define tu nueva contraseña para ingresar a EPP Control.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {okMsg && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {okMsg}
        </div>
      )}

      <form onSubmit={onSubmit} className="space-y-3">
        <div>
          <label className="text-sm text-zinc-600">Nueva contraseña</label>
          <input
            className="input mt-1"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Mínimo 8 caracteres"
            autoComplete="new-password"
            required
          />
        </div>

        <div>
          <label className="text-sm text-zinc-600">Repetir contraseña</label>
          <input
            className="input mt-1"
            type="password"
            value={password2}
            onChange={(e) => setPassword2(e.target.value)}
            autoComplete="new-password"
            required
          />
        </div>

        <button
          disabled={loading}
          className="w-full rounded-xl bg-sky-600 py-2.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          type="submit"
        >
          {loading ? "Guardando…" : "Guardar contraseña"}
        </button>
      </form>

      <p className="text-xs text-zinc-500">
        Este enlace es personal. Si expira, solicita uno nuevo.
      </p>
    </div>
  );
}
