/* Pruebas de la PWA y de la innovación "Diario de mi huerto" */
const $ = (s) => document.querySelector(s);
const mostrar = (el, ok, texto) => { el.className = ok ? "ok" : "error"; el.textContent = texto; };
if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");

const ua = navigator.userAgent;
const so = /android/i.test(ua) ? "Android" : /iphone|ipad|ipod/i.test(ua) ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "otro sistema";
const nav = /edg\//i.test(ua) ? "Edge" : /crios|chrome/i.test(ua) ? "Chrome" : /firefox|fxios/i.test(ua) ? "Firefox" : /safari/i.test(ua) ? "Safari" : "navegador";
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
$("#plataforma").textContent = `${so} · ${nav} · ${standalone ? "app instalada" : "abierta en el navegador"}`;

const conTiempo = (p, ms = 6000) => Promise.race([p, new Promise((_, mal) => setTimeout(() => mal(new Error("tiempo")), ms))]);

// Cada prueba regresa [estado, detalle]: estado "ok", "mal" o "aviso" (depende del dispositivo)
const PRUEBAS = [
  ["Conexión segura (HTTPS)", "Las PWA solo funcionan en sitios seguros.", async () =>
    window.isSecureContext ? ["ok", location.protocol === "https:" ? "HTTPS" : "localhost"] : ["mal", "Sin HTTPS"]],
  ["Manifiesto de la aplicación", "Archivo manifest.webmanifest con nombre, colores e iconos.", async () => {
    const m = await (await fetch("manifest.webmanifest")).json();
    return m.name && m.icons?.length ? ["ok", `${m.short_name} · ${m.display} · ${m.icons.length} iconos`] : ["mal", "Incompleto"];
  }],
  ["Iconos", "Iconos de 192 y 512 px para la pantalla de inicio.", async () => {
    const tam = await Promise.all(["icons/icon-192.png", "icons/icon-512.png"].map((src) => new Promise((ok) => {
      const i = new Image(); i.onload = () => ok(i.naturalWidth); i.onerror = () => ok(0); i.src = src;
    })));
    return tam[0] === 192 && tam[1] === 512 ? ["ok", "192 px y 512 px"] : ["mal", "No cargaron"];
  }],
  ["Service Worker", "Script que trabaja en segundo plano y controla la app.", async () => {
    const reg = await conTiempo(navigator.serviceWorker.ready);
    if (!navigator.serviceWorker.controller) return ["aviso", "Instalado; recarga para que controle"];
    const v = await conTiempo(new Promise((ok) => {
      navigator.serviceWorker.addEventListener("message", (e) => e.data?.version && ok(e.data.version), { once: true });
      navigator.serviceWorker.controller.postMessage("version");
    }), 3000).catch(() => "");
    return reg.active ? ["ok", "Activo " + v] : ["mal", "Inactivo"];
  }],
  ["Memoria caché", "Archivos guardados con la API Cache para abrir sin internet.", async () => {
    const nombres = await caches.keys();
    let n = 0;
    for (const c of nombres) n += (await (await caches.open(c)).keys()).length;
    return n ? ["ok", `${n} archivos en ${nombres.length} cachés`] : ["aviso", "Vacía; recarga la página"];
  }],
  ["Instalación", "La app se puede instalar en la pantalla de inicio o el escritorio.", async () =>
    standalone ? ["ok", "Abierta como app instalada"] : ["aviso", "Disponible desde el botón «Instalar app» o el menú del navegador"]],
  ["Base de datos del servidor", "Tabla Consejos en Turso con un consejo por día del cultivo.", async () => {
    const c = await (await fetch("/api/consejos", { cache: "no-store" })).json();
    return c.length >= 10 ? ["ok", `${c.length} registros`] : ["mal", `${c.length} registros`];
  }],
  ["Base de datos del dispositivo", "IndexedDB guarda las fotos del diario en el teléfono.", async () => {
    const n = await new Promise((ok, mal) => {
      const p = indexedDB.open("brote-diario", 1);
      p.onupgradeneeded = () => { p.result.createObjectStore("fotos", { keyPath: "id", autoIncrement: true }).createIndex("fecha", "fecha"); p.result.createObjectStore("ajustes"); };
      p.onsuccess = () => { const q = p.result.transaction("fotos").objectStore("fotos").count(); q.onsuccess = () => ok(q.result); };
      p.onerror = () => mal(p.error);
    });
    return ["ok", `${n} foto(s) en el diario`];
  }],
  ["Cámara y galería", "Abrir la cámara o la galería para la foto del día.", async () =>
    "capture" in document.createElement("input") ? ["ok", "Cámara y galería"] : ["aviso", "Solo selector de archivos (computadora)"]],
  ["Compartir (Web Share API)", "Menú nativo para enviar la tarjeta a WhatsApp, Instagram, etc.", async () => {
    const f = new File([new Blob(["x"], { type: "image/png" })], "prueba.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [f] })) return ["ok", "Comparte imágenes"];
    return navigator.share ? ["aviso", "Comparte solo enlaces"] : ["aviso", "No disponible; la tarjeta se descarga"];
  }],
  ["Notificaciones", "Permiso para mostrar avisos en el dispositivo.", async () => {
    if (!("Notification" in window)) return ["aviso", so === "iOS" ? "Instala la app para usarlas" : "No disponibles"];
    return { granted: ["ok", "Permitidas"], default: ["aviso", "Aún no se pide permiso"], denied: ["mal", "Bloqueadas"] }[Notification.permission];
  }],
  ["Notificaciones push", "Suscripción para recibir el consejo diario desde el servidor.", async () => {
    if (!("PushManager" in window)) return ["aviso", so === "iOS" ? "Instala la app para usarlas" : "No disponibles"];
    const s = await (await navigator.serviceWorker.ready).pushManager.getSubscription();
    return s ? ["ok", "Suscripción activa"] : ["aviso", "Actívalas en Mi huerto"];
  }],
  ["Diseño adaptable", "La página se ajusta al ancho de la pantalla.", async () =>
    document.documentElement.scrollWidth <= innerWidth + 1 ? ["ok", `${innerWidth} px sin desplazamiento lateral`] : ["mal", "Hay desplazamiento lateral"]],
  ["Conexión", "La app funciona con y sin internet.", async () => navigator.onLine ? ["ok", "En línea"] : ["ok", "Sin conexión: abierta desde la caché"]],
];

async function correr() {
  const lista = $("#lista");
  lista.innerHTML = "";
  let ok = 0;
  for (const [titulo, desc, prueba] of PRUEBAS) {
    const li = document.createElement("li");
    li.innerHTML = `<span class="ic">…</span><div><h3></h3><p></p></div><span class="det"></span>`;
    li.querySelector("h3").textContent = titulo;
    li.querySelector("p").textContent = desc;
    lista.append(li);
    let [estado, det] = ["mal", ""];
    try { [estado, det] = await conTiempo(prueba()); } catch (e) { det = e.message === "tiempo" ? "Sin respuesta" : "No disponible"; }
    li.className = estado;
    li.querySelector(".ic").textContent = { ok: "✓", mal: "✕", aviso: "!" }[estado];
    li.querySelector(".det").textContent = det;
    if (estado === "ok") ok++;
  }
  $("#puntaje").textContent = `${ok} / ${PRUEBAS.length}`;
}
correr();

/* ---------- Pruebas de funcionamiento ---------- */
for (let d = 0; d <= 14; d++) $("#f-dia").add(new Option(`Día ${d}`, d));
$("#f-consejo").onclick = async () => {
  try {
    const c = (await (await fetch("/api/consejos", { cache: "no-store" })).json())[$("#f-dia").value];
    mostrar($("#r-consejo"), true, `${c.Etapa} · ${c.Titulo}: ${c.Texto} Riego: ${c.Riego}`);
  } catch { mostrar($("#r-consejo"), false, "No se pudo leer la base de datos."); }
};

let tarjeta;
$("#f-tarjeta").onclick = async () => {
  const img = new Image();
  img.src = "img/etapa-3.svg";
  await img.decode();
  const c = Object.assign(document.createElement("canvas"), { width: 1080, height: 1350 });
  const g = c.getContext("2d");
  g.fillStyle = "#f7faf3"; g.fillRect(0, 0, 1080, 1350);
  g.fillStyle = "#15352a"; g.fillRect(0, 0, 1080, 170);
  g.fillStyle = "#b9dd5a"; g.font = "700 60px Georgia, serif"; g.fillText("Brote", 80, 108);
  g.drawImage(img, 80, 230, 920, 518);
  g.fillStyle = "#15352a"; g.font = "700 56px Georgia, serif"; g.fillText("Tarjeta de prueba", 80, 900);
  g.fillStyle = "#2f7d4f"; g.font = "600 34px sans-serif"; g.fillText("#MiHuertoBrote", 80, 970);
  tarjeta = await new Promise((ok) => c.toBlob(ok, "image/png"));
  $("#tarjeta-prueba").src = URL.createObjectURL(tarjeta);
  $("#tarjeta-prueba").hidden = false;
  $("#f-compartir").hidden = false;
  mostrar($("#r-tarjeta"), true, `Tarjeta generada: 1080 × 1350 px, ${Math.round(tarjeta.size / 1024)} KB.`);
};
$("#f-compartir").onclick = async () => {
  const f = new File([tarjeta], "tarjeta-prueba.png", { type: "image/png" });
  if (!navigator.canShare?.({ files: [f] })) return mostrar($("#r-tarjeta"), false, "Este navegador no permite compartir imágenes; prueba desde el teléfono.");
  try { await navigator.share({ files: [f], title: "Brote", text: "#MiHuertoBrote" }); mostrar($("#r-tarjeta"), true, "¡Compartido!"); }
  catch (e) { if (e.name !== "AbortError") mostrar($("#r-tarjeta"), false, "No se pudo compartir."); }
};

$("#f-noti").onclick = async () => {
  if (!("Notification" in window)) return mostrar($("#r-noti"), false, so === "iOS" ? "En iPhone instala la app primero (Compartir › Agregar a inicio)." : "Este navegador no tiene notificaciones.");
  if ((await Notification.requestPermission()) !== "granted") return mostrar($("#r-noti"), false, "No se dio permiso para notificaciones.");
  const reg = await navigator.serviceWorker.ready;
  await reg.showNotification("Brote · Prueba", { body: "Las notificaciones de tu huerto funcionan correctamente.", icon: "icons/icon-192.png", tag: "prueba", data: { url: "/#diario" } });
  mostrar($("#r-noti"), true, "Notificación mostrada.");
};
