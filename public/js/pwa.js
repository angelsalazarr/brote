/* App instalable (PWA): service worker y botón "Instalar app" */
if ("serviceWorker" in navigator && location.protocol.startsWith("http"))
  addEventListener("load", () => navigator.serviceWorker.register("sw.js"));

let instalador;
addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  instalador = e;
  $("#instalar").hidden = false;
});
$("#instalar").onclick = async () => {
  instalador.prompt();
  await instalador.userChoice;
  $("#instalar").hidden = true;
};
