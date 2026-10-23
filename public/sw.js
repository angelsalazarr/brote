/* Service Worker de Brote
   Usa la API Cache con tres cachés separadas y una estrategia distinta para cada tipo de recurso:
   - ESTATICO: archivos de la app (precarga en "install", estrategia cache first).
   - DINAMICO: páginas e imágenes que se piden después (network first con respaldo en caché).
   - API: respuestas GET de la API pública (stale-while-revalidate para /api/config
     y network first para el seguimiento de pedidos, así se puede consultar sin conexión). */
const VERSION = "v5";
const ESTATICO = `brote-estatico-${VERSION}`;
const DINAMICO = `brote-dinamico-${VERSION}`;
const API = `brote-api-${VERSION}`;
const VIGENTES = [ESTATICO, DINAMICO, API];
const LIMITE_DINAMICO = 40; // máximo de entradas en la caché dinámica

const PRECARGA = [
  "./", "index.html", "offline.html", "css/estilos.css",
  "js/ui.js", "js/pedidos.js", "js/pwa.js", "js/cache.js", "js/diario.js",
  "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png",
  "img/logo.svg", "img/etapa-0.svg", "img/etapa-1.svg", "img/etapa-2.svg", "img/etapa-3.svg", "img/kit.svg",
];

/* ---------- install: precarga con caches.open() + cache.addAll() ---------- */
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(ESTATICO).then((cache) => cache.addAll(PRECARGA)));
  self.skipWaiting();
});

/* ---------- activate: borra versiones viejas con caches.keys() + caches.delete() ---------- */
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((nombres) =>
      Promise.all(nombres.filter((n) => n.startsWith("brote") && !VIGENTES.includes(n)).map((n) => caches.delete(n)))
    )
  );
  self.clients.claim();
});

/* ---------- Estrategias ---------- */
// Cache first: responde desde la caché y solo va a la red si no existe (cache.match + cache.put).
async function cacheFirst(req) {
  const cache = await caches.open(ESTATICO);
  const guardada = await cache.match(req, { ignoreSearch: true });
  if (guardada) return guardada;
  const res = await fetch(req);
  if (res.ok) cache.put(req, res.clone());
  return res;
}

// Network first: intenta la red y guarda una copia; sin conexión usa la caché.
async function networkFirst(req, nombreCache, respaldo) {
  const cache = await caches.open(nombreCache);
  try {
    const res = await fetch(req);
    if (res.ok) {
      await cache.put(req, res.clone());
      if (nombreCache === DINAMICO) recortar(DINAMICO, LIMITE_DINAMICO);
    }
    return res;
  } catch {
    const guardada = (await cache.match(req)) || (await caches.match(req)); // caches.match busca en todas
    if (guardada) return marcar(guardada);
    if (respaldo) return caches.match(respaldo);
    return new Response(JSON.stringify({ error: "Sin conexión y sin copia guardada de esta consulta." }), {
      status: 503, headers: { "Content-Type": "application/json" },
    });
  }
}

// Stale-while-revalidate: responde al instante con la copia y la actualiza en segundo plano.
async function staleWhileRevalidate(req) {
  const cache = await caches.open(API);
  const guardada = await cache.match(req);
  const red = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => null);
  return guardada || (await red) || new Response("{}", { status: 503, headers: { "Content-Type": "application/json" } });
}

// Copia la respuesta y agrega un encabezado para que la página sepa que salió de la caché.
async function marcar(res) {
  const h = new Headers(res.headers);
  h.set("X-Desde-Cache", "1");
  return new Response(await res.blob(), { status: res.status, statusText: res.statusText, headers: h });
}

// Mantiene la caché dinámica con un tamaño máximo (cache.keys + cache.delete).
async function recortar(nombre, max) {
  const cache = await caches.open(nombre);
  const claves = await cache.keys();
  for (let i = 0; i < claves.length - max; i++) await cache.delete(claves[i]);
}

/* ---------- fetch: elige la estrategia según la petición ---------- */
self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== location.origin) return; // POST/PUT y otros dominios van directo a la red
  if (url.pathname.startsWith("/api/admin")) return;                    // datos privados: nunca se guardan
  if (req.headers.has("range")) return;                                 // el video se transmite por partes

  if (url.pathname === "/api/config") return e.respondWith(staleWhileRevalidate(req));
  if (url.pathname.startsWith("/api/pedidos/")) return e.respondWith(networkFirst(req, API));
  if (url.pathname.startsWith("/api/")) return;

  if (req.mode === "navigate") return e.respondWith(networkFirst(req, DINAMICO, "offline.html"));

  const ruta = url.pathname.replace(/^\//, "");
  if (PRECARGA.includes(ruta)) return e.respondWith(cacheFirst(req));
  e.respondWith(networkFirst(req, DINAMICO));
});

/* ---------- Mensajes desde la página ---------- */
self.addEventListener("message", (e) => {
  if (e.data === "saltar-espera") self.skipWaiting();
});
