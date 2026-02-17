// public/sw.js
// 🔁 IMPORTANT: bump this version on each deploy that changes frontend bundles/UI.
// This forces a new cache namespace and guarantees old cached assets are deleted on activate.
const SW_VERSION = "v4";
const CACHE = `epp-entregas-${SW_VERSION}`;

// Solo assets estáticos (NO HTML)
const CORE_ASSETS = [
  "/manifest.webmanifest", // si tu Next lo expone así; si no existe, no pasa nada
  "/pwa/icon-192.png",
  "/pwa/icon-512.png",
  "/pwa/icon-maskable-192.png",
  "/pwa/icon-maskable-512.png",
];

// Permite forzar activación del SW nuevo desde el cliente
self.addEventListener("message", (event) => {
  if (event?.data?.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

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

  // ⚠️ IMPORTANTE: NO cachear assets de Next (_next). Los nombres pueden ser estables en algunos casos
  // y la PWA puede quedar pegada con bundles viejos (problema típico en mobile).
  if (url.pathname.startsWith("/_next/")) {
    event.respondWith(fetch(req));
    return;
  }

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

  // 3) Assets (no-_next): cache-first + refresh
  event.respondWith(
    caches.match(req).then((cached) => {
      const fetchAndUpdate = fetch(req)
        .then((res) => {
          // Solo cachea respuestas OK, same-origin (type: basic) y GET
          // y evita cachear HTML por accidente.
          const ct = res?.headers?.get("content-type") || "";
          const isHtml = ct.includes("text/html");

          if (req.method === "GET" && res && res.ok && res.type === "basic" && !isHtml) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          }
          return res;
        })
        .catch(() => cached);

      // Si hay cache, úsalo rápido y actualiza en background
      return cached || fetchAndUpdate;
    })
  );
});
