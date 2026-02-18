// app/auth/hash-callback/page.tsx
"use client";

import { useEffect } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

function parseHash(hash: string) {
  const h = hash.startsWith("#") ? hash.slice(1) : hash;
  const params = new URLSearchParams(h);
  return {
    access_token: params.get("access_token"),
    refresh_token: params.get("refresh_token"),
    expires_in: params.get("expires_in"),
    token_type: params.get("token_type"),
    type: params.get("type"),
  };
}

export default function HashCallbackPage() {
  useEffect(() => {
    (async () => {
      const { access_token, refresh_token } = parseHash(window.location.hash);

      if (!access_token || !refresh_token) {
        // Si no vienen tokens, manda a login
        window.location.href = "/auth/login";
        return;
      }

      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.setSession({
        access_token,
        refresh_token,
      });

      // Limpia el hash de la URL
      window.history.replaceState({}, document.title, "/dashboard");

      if (error) {
        window.location.href = "/auth/login";
        return;
      }

      // Ya hay sesión persistida, entra al dashboard
      window.location.href = "/dashboard";
    })();
  }, []);

  return (
    <div className="p-6 text-zinc-500">
      Iniciando sesión…
    </div>
  );
}
