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

  // No interceptar requests que no sean GET (evita comportamientos raros con POST/PUT, etc.)
  if (req.method !== "GET") {
    event.respondWith(fetch(req));
    return;
  }

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
        // Offline: evita redirect-loop. Muestra una pantalla mínima.
        const html = `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sin conexión</title>
  <style>
    body{font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:24px;background:#f4f4f5;color:#18181b}
    .card{max-width:520px;margin:0 auto;background:#fff;border:1px solid #e4e4e7;border-radius:12px;padding:16px}
    h1{font-size:18px;margin:0 0 8px}
    p{margin:0 0 12px;color:#3f3f46}
    a{color:#0284c7;text-decoration:underline}
    button{appearance:none;border:1px solid #e4e4e7;background:#fff;border-radius:10px;padding:10px 12px;font-weight:600}
  </style>
</head>
<body>
  <div class="card">
    <h1>Estás sin conexión</h1>
    <p>No pudimos cargar esta página porque no hay internet.</p>
    <p>Cuando vuelvas a tener señal, toca “Reintentar”.</p>
    <button onclick="location.reload()">Reintentar</button>
    <p style="margin-top:12px"><a href="/m/entrega">Ir a Entrega</a></p>
  </div>
</body>
</html>`;
        return new Response(html, {
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store",
          },
          status: 200,
        });
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
