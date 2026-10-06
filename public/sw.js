const VERSION = "brote-v2";
const BASE = ["./", "index.html", "css/estilos.css", "js/ui.js", "js/pedidos.js", "js/pwa.js", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png", "img/logo.svg", "img/etapa-0.svg", "img/etapa-1.svg", "img/etapa-2.svg", "img/etapa-3.svg", "img/kit.svg"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(BASE)));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((claves) => Promise.all(claves.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        if (res.status === 200) {
          const copia = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copia));
        }
        return res;
      })
      .catch(() => caches.match(req).then((m) => m || caches.match("index.html")))
  );
});
