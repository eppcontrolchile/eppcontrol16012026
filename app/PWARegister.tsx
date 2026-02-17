// app/PWARegister.tsx
"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    let cancelled = false;

    // Detect if a SW was already controlling this page.
    // If not, we must NOT reload on the first install (it can cause loops / blank screens).
    const hadControllerInitially = !!navigator.serviceWorker.controller;

    // Prevent multiple reloads in the same session.
    const RELOAD_FLAG = "pwa_sw_reloaded_once";
    // In-memory guard to prevent reload loops even if sessionStorage is unavailable
    let reloadedInMemory = false;

    const forceActivateWaitingSW = async (reg: ServiceWorkerRegistration) => {
      // If there's a waiting SW, ask it to activate.
      if (reg.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
    };

    const onControllerChange = () => {
      if (cancelled) return;

      // Only reload if this was an UPDATE (we already had a controller before).
      // Also only reload once per session to avoid infinite reload loops.
      if (!hadControllerInitially) return;

      // First guard in memory (works even if storage is blocked)
      if (reloadedInMemory) return;
      reloadedInMemory = true;

      try {
        if (sessionStorage.getItem(RELOAD_FLAG) === "1") return;
        sessionStorage.setItem(RELOAD_FLAG, "1");
      } catch {
        // ignore storage errors
      }

      // Soft reload to pick up the new bundles.
      window.location.reload();
    };

    (async () => {
      try {
        navigator.serviceWorker.addEventListener(
          "controllerchange",
          onControllerChange
        );

        // IMPORTANT:
        // Do NOT cache-bust the SW URL with Date.now().
        // That forces a brand new SW on every load and can trigger update/reload loops.
        const reg = await navigator.serviceWorker.register("/sw.js");

        // If an update is already waiting, activate it.
        await forceActivateWaitingSW(reg);

        // If a new SW is found, wait for it to install then activate it.
        reg.addEventListener("updatefound", () => {
          const sw = reg.installing;
          if (!sw) return;

          sw.addEventListener("statechange", () => {
            if (cancelled) return;
            if (sw.state === "installed") {
              // Only treat as update if a controller exists (i.e., previous SW was active).
              if (navigator.serviceWorker.controller) {
                forceActivateWaitingSW(reg).catch(() => {});
              }
            }
          });
        });

        // Trigger an update check (non-blocking).
        reg.update().catch(() => {});
      } catch (err) {
        console.warn("SW register failed", err);
      }
    })();

    return () => {
      cancelled = true;
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange
      );
    };
  }, []);

  return null;
}
