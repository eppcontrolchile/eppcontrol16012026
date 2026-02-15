// public/sw.js
const CACHE = "epp-entregas-v2";

// Solo assets estáticos (NO HTML)
const CORE_ASSETS = [
  "/manifest.webmanifest", // si tu Next lo expone así; si no existe, no pasa nada
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-192.png",
  "/pwa/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(CORE_ASSETS).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => (k !== CACHE ? caches.delete(k) : null))))
      .then(() => self.clients.claim())
  );
});

// Estrategia:
// - Navegación (HTML): NETWORK ONLY (sin cache) + fallback a /m/entrega con redirect si estás offline
// - API: NETWORK ONLY (sin cache)
// - Assets (_next/static, imágenes, etc): cache-first con actualización al vuelo
self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Solo mismo origen
  if (url.origin !== self.location.origin) return;

  // 1) API: red siempre (sin cache)
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(fetch(req));
    return;
  }

  // 2) Navegaciones: NO cachear HTML (evita “pantallas fantasma”)
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(() => {
        // Offline: redirige a la ruta operativa (si el navegador tiene algo en memoria)
        return Response.redirect("/m/entrega", 302);
      })
    );
    return;
  }

  // 3) Assets: cache-first + refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchAndUpdate = fetch(req)
        .then((res) => {
          // Solo cachea respuestas OK y GET
          if (req.method === "GET" && res && res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);

      // Si hay cache, úsalo rápido y actualiza en background
      return cached || fetchAndUpdate;
    })
  );
});
