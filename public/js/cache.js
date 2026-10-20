/* Panel "Modo sin conexión": muestra y administra la caché de la PWA desde la página.
   Usa la API Cache (window.caches) con sus métodos principales:
   caches.keys(), caches.open(), caches.has(), caches.match(), caches.delete(),
   cache.add(), cache.addAll(), cache.keys(), cache.match(), cache.put() y cache.delete(). */
const panel = $("#panel-cache");
const EXTRAS = "brote-extras"; // caché que llena el usuario desde el panel
const RECURSOS_EXTRA = ["media/poster.jpg", "icons/icon-180.png", "img/kit.svg"];

const kb = (n) => (n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB");
const avisar = (texto, ok = true) => mostrar($("#cache-aviso"), ok, texto);

/* ---------- Estado de la conexión ---------- */
function pintarConexion() {
  const el = $("#conexion");
  el.textContent = navigator.onLine ? "En línea" : "Sin conexión: estás viendo la copia guardada";
  el.className = "conexion " + (navigator.onLine ? "en-linea" : "fuera");
}
addEventListener("online", pintarConexion);
addEventListener("offline", pintarConexion);

/* ---------- Listar cachés y su contenido (caches.keys + cache.keys + cache.match) ---------- */
async function listar() {
  const lista = $("#cache-lista");
  const nombres = await caches.keys();
  if (!nombres.length) {
    lista.innerHTML = "<p class='nota'>Todavía no hay nada guardado. Recarga la página para que el Service Worker haga la precarga.</p>";
    $("#cache-resumen").textContent = "0 archivos";
    return;
  }
  let total = 0, bytes = 0;
  lista.innerHTML = "";
  for (const nombre of nombres) {
    const cache = await caches.open(nombre);
    const peticiones = await cache.keys();
    total += peticiones.length;
    const bloque = document.createElement("details");
    bloque.innerHTML = `<summary><strong>${nombre}</strong> · ${peticiones.length} archivo(s)
      <button class="btn-mini" data-borrar-cache="${nombre}" type="button">Borrar caché</button></summary><ul></ul>`;
    const ul = bloque.querySelector("ul");
    for (const req of peticiones) {
      const res = await cache.match(req);
      const tam = res ? (await res.clone().blob()).size : 0;
      bytes += tam;
      const li = document.createElement("li");
      li.innerHTML = `<span>${new URL(req.url).pathname}</span><small>${kb(tam)}</small>
        <button class="btn-mini" type="button" data-cache="${nombre}" data-url="${req.url}" aria-label="Quitar de la caché">×</button>`;
      ul.append(li);
    }
    lista.append(bloque);
  }
  $("#cache-resumen").textContent = `${total} archivo(s) · ${kb(bytes)} en ${nombres.length} caché(s)`;
}

/* ---------- Botones del panel ---------- */
// cache.addAll(): descarga y guarda varios recursos de una vez.
$("#cache-extras").onclick = async () => {
  try {
    const cache = await caches.open(EXTRAS);
    await cache.addAll(RECURSOS_EXTRA);
    avisar(`Se guardaron ${RECURSOS_EXTRA.length} recursos extra en "${EXTRAS}".`);
  } catch {
    avisar("No se pudieron descargar los extras. Revisa tu conexión.", false);
  }
  listar();
};

// cache.add(): guarda un solo recurso pedido por el usuario.
// cache.put(): guarda una respuesta creada por la app (una nota personal).
$("#form-cache").onsubmit = async (e) => {
  e.preventDefault();
  const ruta = $("#cache-ruta").value.trim();
  const cache = await caches.open(EXTRAS);
  try {
    if (ruta.startsWith("nota:")) {
      const texto = ruta.slice(5).trim() || "Nota vacía";
      await cache.put(new Request("nota-personal.txt"), new Response(texto, { headers: { "Content-Type": "text/plain" } }));
      avisar("Nota guardada con cache.put() como nota-personal.txt.");
    } else {
      await cache.add(ruta);
      avisar(`"${ruta}" se guardó con cache.add().`);
    }
  } catch {
    avisar(`No se pudo guardar "${ruta}". Debe ser un archivo del sitio, por ejemplo img/etapa-2.svg.`, false);
  }
  listar();
};

// caches.match(): busca una ruta en todas las cachés a la vez.
$("#cache-buscar").onclick = async () => {
  const ruta = $("#cache-ruta").value.trim() || "index.html";
  const res = await caches.match(ruta, { ignoreSearch: true });
  avisar(res ? `"${ruta}" está guardado (${res.headers.get("Content-Type") || "sin tipo"}). Funciona sin conexión.`
             : `"${ruta}" no está en ninguna caché.`, Boolean(res));
};

// caches.has() + caches.delete(): borra todas las cachés de la app.
$("#cache-vaciar").onclick = async () => {
  if (!confirm("¿Borrar todo lo guardado? Se volverá a descargar al recargar la página.")) return;
  for (const nombre of await caches.keys()) if (await caches.has(nombre)) await caches.delete(nombre);
  avisar("Se borraron todas las cachés. Recarga la página para que el Service Worker vuelva a precargar.");
  listar();
};

$("#cache-actualizar").onclick = listar;

// cache.delete() para un archivo y caches.delete() para una caché completa.
$("#cache-lista").onclick = async (e) => {
  const boton = e.target.closest("button");
  if (!boton) return;
  e.preventDefault();
  if (boton.dataset.borrarCache) {
    await caches.delete(boton.dataset.borrarCache);
    avisar(`Se borró la caché "${boton.dataset.borrarCache}".`);
  } else {
    const cache = await caches.open(boton.dataset.cache);
    await cache.delete(boton.dataset.url);
    avisar(`Se quitó ${new URL(boton.dataset.url).pathname} de "${boton.dataset.cache}".`);
  }
  listar();
};

/* ---------- Inicio ---------- */
if ("caches" in window && window.isSecureContext) {
  pintarConexion();
  listar();
  navigator.serviceWorker?.addEventListener("controllerchange", listar);
} else {
  panel.innerHTML = "<p class='nota'>Este navegador no permite usar la API Cache aquí. Abre el sitio desde http://localhost o desde su dirección https.</p>";
}
