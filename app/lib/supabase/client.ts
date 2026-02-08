// app/lib/supabase/client.ts
"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let supabase: SupabaseClient | null = null;

type SimpleStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

function withTTL(base: Storage, ttlMs: number): SimpleStorage {
  const expKey = (k: string) => `${k}__exp`;

  return {
    getItem(key) {
      const expRaw = base.getItem(expKey(key));
      if (expRaw) {
        const exp = Number(expRaw);
        if (Number.isFinite(exp) && Date.now() > exp) {
          base.removeItem(key);
          base.removeItem(expKey(key));
          return null;
        }
      }
      return base.getItem(key);
    },
    setItem(key, value) {
      base.setItem(key, value);
      base.setItem(expKey(key), String(Date.now() + ttlMs));
    },
    removeItem(key) {
      base.removeItem(key);
      base.removeItem(expKey(key));
    },
  };
}

export function supabaseBrowser() {
  if (!supabase) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    // Control de persistencia de sesión:
    // localStorage.epp_remember = "1"  -> sesión persistente (default)
    // localStorage.epp_remember = "0"  -> sesión corta (30 minutos)
    const remember =
      typeof window !== "undefined"
        ? window.localStorage.getItem("epp_remember") !== "0"
        : true;

    const authStorage: any =
      typeof window === "undefined"
        ? undefined
        : remember
          ? window.localStorage
          : withTTL(window.sessionStorage, 30 * 60 * 1000);

    supabase = createBrowserClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        // Persistimos sesión, pero si remember=false la storage expira en 30 min
        persistSession: true,
        storage: authStorage,
      },
    });
  }
  return supabase;
}
