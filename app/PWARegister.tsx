// app/PWARegister.tsx
"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/sw.js");

        // fuerza a buscar update del sw.js (importante cuando cambias cache/version)
        reg.update().catch(() => {});

        // opcional: si llega un SW nuevo, recarga para tomarlo (solo 1 vez)
        reg.addEventListener("updatefound", () => {
          const installing = reg.installing;
          if (!installing) return;

          installing.addEventListener("statechange", () => {
            if (cancelled) return;
            if (installing.state === "installed") {
              // Si ya había un SW previo controlando, hay update listo
              if (navigator.serviceWorker.controller) {
                // Recarga suave para tomar la nueva versión
                window.location.reload();
              }
            }
          });
        });
      } catch (err) {
        console.warn("SW register failed", err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}
