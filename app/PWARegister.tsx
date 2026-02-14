// app/PWARegister.tsx

"use client";

import { useEffect } from "react";

export default function PWARegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    // registra sw.js en el root
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);

  return null;
}
