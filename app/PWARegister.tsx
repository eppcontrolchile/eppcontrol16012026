// app/PWARegister.tsx
"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    const forceActivateWaitingSW = async (reg: ServiceWorkerRegistration) => {
      // Si ya hay uno esperando, lo activamos
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };

    const onControllerChange = () => {
      if (cancelled) return;
      // Cuando el nuevo SW toma control, recargamos para traer bundles nuevos
      window.location.reload();
    };

    (async () => {
      try {
        navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

          const reg = await navigator.serviceWorker.register(`/sw.js?v=${Date.now()}`);

        // Si ya hay update listo (waiting), activarlo
        await forceActivateWaitingSW(reg);

        // Si llega uno nuevo
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;

          sw.addEventListener("statechange", () => {
            if (cancelled) return;

            // Cuando termina de instalar, normalmente queda "waiting"
            if (sw.state === "installed") {
              // Si ya había SW controlando, esto es una actualización
              if (navigator.serviceWorker.controller) {
                forceActivateWaitingSW(reg);
              }
            }
          });
        });

        // Dispara chequeo de update
        reg.update().catch(() => {});
      } catch (err) {
        console.warn("SW register failed", err);
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
