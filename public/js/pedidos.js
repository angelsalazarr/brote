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

$("#form-pedido").onsubmit = async (e) => {
  e.preventDefault();
  const salida = $("#resultado");
  const datos = Object.fromEntries(new FormData(e.target));
  let d;
  try {
    const r = await fetch("/api/pedidos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(datos),
    });
    d = await r.json();
    if (!r.ok) return mostrar(salida, false, d.error);
  } catch {
    d = pedidoLocal(datos); /* modo demostración sin servidor */
  }
  mostrar(salida, true, `¡Pedido recibido! Tu folio es ${d.folio}. Total: ${dinero(d.total)}. Guárdalo para consultar tu envío.`);
  e.target.reset();
  actualizarTotal();
};

/* ---------- Seguimiento ---------- */
$("#form-seg").onsubmit = async (e) => {
  e.preventDefault();
  const salida = $("#estado");
  const { folio, correo } = Object.fromEntries(new FormData(e.target));
  const texto = (d) => `Pedido ${d.folio}: ${d.estado} (${d.cantidad} kit(s), ${dinero(d.total)})`;
  try {
    const r = await fetch(`/api/pedidos/${encodeURIComponent(folio.trim())}?correo=${encodeURIComponent(correo.trim())}`);
    const d = await r.json();
    return r.ok ? mostrar(salida, true, texto(d)) : mostrar(salida, false, d.error);
  } catch {
    const p = leerLocal().find((x) => x.folio === folio.trim().toUpperCase() && x.correo === correo.trim().toLowerCase());
    p ? mostrar(salida, true, texto(p)) : mostrar(salida, false, "No encontramos ese pedido. Revisa el folio y el correo.");
  }
};
