/* Recordatorios con notificaciones push (Push API + Notifications API).
   El servidor guarda la suscripción en la base de datos y cada mañana envía
   el consejo del día del cultivo, tomado de la tabla Consejos. */
const avisoPush = (texto, ok = true) => mostrar($("#push-aviso"), ok, texto);
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
const instalada = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
const hayPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

function plataforma() {
  const ua = navigator.userAgent;
  const so = /android/i.test(ua) ? "Android" : esIOS ? "iOS" : /windows/i.test(ua) ? "Windows" : /mac/i.test(ua) ? "macOS" : /linux/i.test(ua) ? "Linux" : "Otro";
  return so + (instalada ? " (app instalada)" : " (navegador)");
}

// La llave pública VAPID llega en base64url; la Push API la necesita como bytes.
function aBytes(base64) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const bin = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function suscripcionActual() {
  const reg = await navigator.serviceWorker.ready;
  return reg.pushManager.getSubscription();
}

async function registrarEnServidor(sus) {
  const r = await fetch("/api/push/suscribir", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ suscripcion: sus, siembra: $("#siembra").value || null, plataforma: plataforma() }),
  });
  if (!r.ok) throw new Error("servidor");
}

function pintarPush(activa) {
  $("#push-activar").hidden = activa;
  $("#push-probar").hidden = !activa;
  $("#push-desactivar").hidden = !activa;
  $("#push-estado").textContent = activa
    ? "Recordatorios activos: cada mañana recibirás el consejo del día de tu huerto."
    : "Recibe cada mañana una notificación con el consejo del día de tu huerto.";
}

$("#push-activar").onclick = async () => {
  if (esIOS && !instalada)
    return avisoPush("En iPhone las notificaciones solo funcionan con la app instalada: toca Compartir › Agregar a inicio y abre Brote desde tu pantalla de inicio.", false);
  try {
    const permiso = await Notification.requestPermission();
    if (permiso !== "granted") return avisoPush("No diste permiso para mostrar notificaciones. Puedes activarlo en la configuración del navegador.", false);
    const { clave } = await (await fetch("/api/push/clave")).json();
    const reg = await navigator.serviceWorker.ready;
    const sus = (await reg.pushManager.getSubscription()) || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: aBytes(clave) }));
    await registrarEnServidor(sus);
    pintarPush(true);
    avisoPush("¡Listo! Los recordatorios quedaron activados. Prueba con el botón «Enviar notificación de prueba».");
  } catch {
    avisoPush("No se pudieron activar los recordatorios. Revisa tu conexión e intenta de nuevo.", false);
  }
};

$("#push-probar").onclick = async () => {
  try {
    const sus = await suscripcionActual();
    if (!sus) return pintarPush(false);
    const r = await fetch("/api/push/prueba", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sus.endpoint }) });
    const d = await r.json();
    r.ok ? avisoPush("Notificación enviada desde el servidor. Debe aparecer en unos segundos.") : avisoPush(d.error, false);
  } catch {
    avisoPush("Sin conexión: la notificación de prueba necesita internet.", false);
  }
};

$("#push-desactivar").onclick = async () => {
  const sus = await suscripcionActual();
  if (sus) {
    await fetch("/api/push/baja", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ endpoint: sus.endpoint }) }).catch(() => {});
    await sus.unsubscribe();
  }
  pintarPush(false);
  avisoPush("Recordatorios desactivados.");
};

// Si cambia la fecha de siembra, el servidor la actualiza para calcular el día correcto.
addEventListener("brote:siembra", async () => {
  const sus = hayPush && (await suscripcionActual());
  if (sus) registrarEnServidor(sus).catch(() => {});
});

if (!hayPush) {
  $("#recordatorios").querySelector(".acciones").hidden = true;
  $("#push-estado").textContent = esIOS && !instalada
    ? "En iPhone, instala la app (Compartir › Agregar a inicio) para recibir recordatorios."
    : "Este navegador no permite notificaciones push.";
} else {
  suscripcionActual().then((s) => pintarPush(Boolean(s) && Notification.permission === "granted")).catch(() => {});
}
