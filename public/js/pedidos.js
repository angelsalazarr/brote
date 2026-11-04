/* Pedidos y seguimiento. Usa la API del servidor; si no hay servidor
   (por ejemplo, al abrir index.html directo), guarda en este navegador. */
const PRECIO_BASE = 349;
const LLAVE_LOCAL = "brote-pedidos";
let precio = PRECIO_BASE;

const dinero = (n) => n.toLocaleString("es-MX", { style: "currency", currency: "MXN" });
const mostrar = (el, ok, texto) => { el.className = ok ? "ok" : "error"; el.textContent = texto; };
const leerLocal = () => JSON.parse(localStorage.getItem(LLAVE_LOCAL) || "[]");

/* ---------- Precio y total ---------- */
function actualizarTotal() {
  $("#total").textContent = dinero(precio * (Number($("#cantidad").value) || 0));
}
fetch("/api/config").then((r) => r.json()).then((c) => {
  precio = c.precio;
  $("#precio").textContent = dinero(precio);
  actualizarTotal();
}).catch(() => { $("#precio").textContent = dinero(precio); });
$("#cantidad").oninput = actualizarTotal;

/* ---------- Pedido nuevo ---------- */
function pedidoLocal(datos) {
  const folio = "BR-" + Math.random().toString(16).slice(2, 8).toUpperCase();
  const cantidad = Number(datos.cantidad);
  const lista = leerLocal();
  lista.push({ folio, correo: datos.correo.trim().toLowerCase(), cantidad, total: cantidad * precio, estado: "Recibido" });
  localStorage.setItem(LLAVE_LOCAL, JSON.stringify(lista));
  return { folio, total: cantidad * precio };
}

/* ---------- Pedidos sin conexión: cola local y sincronización ---------- */
const COLA = "brote-pedidos-pendientes";   // pedidos hechos sin internet
const MIS_PEDIDOS = "brote-mis-pedidos";   // folios confirmados por el servidor
const leer = (k) => { try { return JSON.parse(localStorage.getItem(k) || "[]"); } catch { return []; } };
const escribir = (k, v) => localStorage.setItem(k, JSON.stringify(v));
const conServidor = location.protocol.startsWith("http");

function pintarPendientes() {
  const cola = leer(COLA), ul = $("#pendientes");
  ul.hidden = !cola.length;
  ul.innerHTML = cola.length ? "<li><strong>Pedidos guardados sin conexión</strong></li>" : "";
  for (const p of cola) {
    const li = document.createElement("li");
    li.textContent = `${p.datos.cantidad} kit(s) para ${p.datos.nombre} · guardado ${new Date(p.guardado).toLocaleString("es-MX", { dateStyle: "short", timeStyle: "short" })} · se enviará al recuperar la conexión`;
    ul.append(li);
  }
}

function recordarPedido(folio, correo, total) {
  const mis = leer(MIS_PEDIDOS).filter((p) => p.folio !== folio);
  mis.unshift({ folio, correo, total, fecha: new Date().toISOString() });
  escribir(MIS_PEDIDOS, mis.slice(0, 5));
  pintarMisPedidos();
}

function pintarMisPedidos() {
  const mis = leer(MIS_PEDIDOS), caja = $("#mis-pedidos");
  caja.hidden = !mis.length;
  caja.innerHTML = mis.length ? "<p><strong>Tus pedidos en este dispositivo</strong></p>" : "";
  for (const p of mis) {
    const b = document.createElement("button");
    b.type = "button"; b.className = "btn-mini";
    b.textContent = `${p.folio} · ${dinero(p.total)}`;
    b.onclick = () => { $("#form-seg [name=folio]").value = p.folio; $("#form-seg [name=correo]").value = p.correo; $("#form-seg").requestSubmit(); };
    caja.append(b);
  }
}

async function enviarPedido(datos) {
  const r = await fetch("/api/pedidos", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(datos) });
  return { ok: r.ok, d: await r.json() };
}

// Envía los pedidos guardados en cuanto hay conexión. Se ejecuta al cargar, al volver internet y al regresar a la app.
let sincronizando = false;
async function sincronizarPedidos() {
  if (sincronizando || !navigator.onLine || !conServidor) return;
  sincronizando = true;
  try {
    for (const p of leer(COLA)) {
      let res;
      try { res = await enviarPedido(p.datos); } catch { break; } // sigue sin conexión
      escribir(COLA, leer(COLA).filter((x) => x.id !== p.id));
      if (res.ok) {
        recordarPedido(res.d.folio, p.datos.correo.trim().toLowerCase(), res.d.total);
        mostrar($("#resultado"), true, `Se recuperó la conexión y se envió tu pedido guardado. Folio ${res.d.folio}. Total: ${dinero(res.d.total)}.`);
        avisarLocal("Brote · Pedido enviado", `Tu pedido guardado sin conexión ya se registró. Folio ${res.d.folio}.`);
      } else mostrar($("#resultado"), false, `Un pedido guardado no se pudo registrar: ${res.d.error}`);
    }
  } finally { sincronizando = false; pintarPendientes(); }
}

async function avisarLocal(titulo, cuerpo) {
  if (!("Notification" in window) || Notification.permission !== "granted" || !navigator.serviceWorker) return;
  const reg = await navigator.serviceWorker.ready;
  reg.showNotification(titulo, { body: cuerpo, icon: "icons/icon-192.png", tag: "pedido", data: { url: "/#seguimiento" } });
}

$("#form-pedido").onsubmit = async (e) => {
  e.preventDefault();
  const salida = $("#resultado");
  const datos = Object.fromEntries(new FormData(e.target));
  if (!conServidor) { /* modo demostración al abrir index.html directo */
    const d = pedidoLocal(datos);
    return mostrar(salida, true, `¡Pedido recibido! Tu folio es ${d.folio}. Total: ${dinero(d.total)}.`);
  }
  try {
    if (!navigator.onLine) throw new Error("sin conexión");
    const { ok, d } = await enviarPedido(datos);
    if (!ok) return mostrar(salida, false, d.error);
    recordarPedido(d.folio, datos.correo.trim().toLowerCase(), d.total);
    mostrar(salida, true, `¡Pedido recibido! Tu folio es ${d.folio}. Total: ${dinero(d.total)}. Guárdalo para consultar tu envío.`);
  } catch {
    escribir(COLA, [...leer(COLA), { id: Date.now(), guardado: new Date().toISOString(), datos }]);
    mostrar(salida, true, "Estás sin conexión. Tu pedido quedó guardado en este dispositivo y se enviará solo en cuanto vuelva el internet.");
    pintarPendientes();
  }
  e.target.reset();
  actualizarTotal();
};

addEventListener("online", sincronizarPedidos);
document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && sincronizarPedidos());
pintarPendientes();
pintarMisPedidos();
sincronizarPedidos();

/* ---------- Seguimiento ---------- */
$("#form-seg").onsubmit = async (e) => {
  e.preventDefault();
  const salida = $("#estado");
  const { folio, correo } = Object.fromEntries(new FormData(e.target));
  const texto = (d) => `Pedido ${d.folio}: ${d.estado} (${d.cantidad} kit(s), ${dinero(d.total)})`;
  try {
    const r = await fetch(`/api/pedidos/${encodeURIComponent(folio.trim())}?correo=${encodeURIComponent(correo.trim())}`);
    const d = await r.json();
    const guardado = r.headers.get("X-Desde-Cache") ? " · Sin conexión: es la última información guardada." : "";
    return r.ok ? mostrar(salida, true, texto(d) + guardado) : mostrar(salida, false, d.error);
  } catch {
    const p = leerLocal().find((x) => x.folio === folio.trim().toUpperCase() && x.correo === correo.trim().toLowerCase());
    p ? mostrar(salida, true, texto(p)) : mostrar(salida, false, "No encontramos ese pedido. Revisa el folio y el correo.");
  }
};
