// Service worker MiniSoft RCA : met en cache uniquement les fichiers statiques de l'interface.
// Les données des logiciels (API) ne sont JAMAIS mises en cache sur l'appareil.
const CACHE = "msr-static-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/auth/")) return;
  if (url.pathname.startsWith("/_next/static/") || url.pathname === "/icon.svg") {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const hit = await cache.match(event.request);
        if (hit) return hit;
        const res = await fetch(event.request);
        if (res.ok) cache.put(event.request, res.clone());
        return res;
      }),
    );
    return;
  }
  // Pages : réseau d'abord ; hors ligne, on sert la dernière version de la page déjà visitée.
  if (event.request.mode === "navigate") {
    event.respondWith(
      fetch(event.request)
        .then((res) => {
          if (res.ok && url.pathname.startsWith("/apps/")) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(event.request, copy));
          }
          return res;
        })
        .catch(async () => (await caches.match(event.request)) || new Response("<h1>Hors ligne</h1><p>Reconnectez-vous à Internet.</p>", { headers: { "content-type": "text/html; charset=utf-8" } })),
    );
  }
});
