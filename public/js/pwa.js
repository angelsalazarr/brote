/* App instalable (PWA): service worker, botón "Instalar app" y aviso de actualización */
const sw = "serviceWorker" in navigator && location.protocol.startsWith("http");
if (sw) addEventListener("load", () => navigator.serviceWorker.register("sw.js"));

/* ---------- Instalación ---------- */
let instalador;
const enStandalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  instalador = e; // Chrome y Edge en Android, Windows, macOS y Linux
  $("#instalar").hidden = false;
});
// Safari en iPhone no tiene el evento de instalación: se muestran las instrucciones.
if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !enStandalone) $("#instalar").hidden = false;

$("#instalar").onclick = async () => {
  if (!instalador) {
    alert("Para instalar Brote en tu iPhone:\n\n1. Toca el botón Compartir de Safari.\n2. Elige «Agregar a inicio».\n3. Toca «Agregar».");
    return;
  }
  instalador.prompt();
  await instalador.userChoice;
  instalador = null;
  $("#instalar").hidden = true;
};
addEventListener("appinstalled", () => { $("#instalar").hidden = true; });

/* ---------- Versión y actualización ---------- */
function pedirVersion() {
  navigator.serviceWorker.controller?.postMessage("version");
}
if (sw) {
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.version) $("#version").textContent = "Versión " + e.data.version;
  });
  const habiaControl = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    pedirVersion();
    if (!habiaControl) return; // primera instalación, no es una actualización
    const t = $("#toast-actualizacion");
    t.hidden = false;
    setTimeout(() => (t.hidden = true), 8000);
  });
  pedirVersion();
  // Revisa si hay una versión nueva cada vez que se vuelve a la app
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") navigator.serviceWorker.getRegistration().then((r) => r?.update());
  });
}
