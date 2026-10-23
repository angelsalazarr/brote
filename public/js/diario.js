/* Diario de mi huerto: fotos del crecimiento guardadas en el dispositivo (IndexedDB)
   y tarjeta para compartir la cosecha con la Web Share API. Funciona sin conexión. */
const BD_NOMBRE = "brote-diario";
const DIA_MS = 864e5;
let bd;

/* ---------- IndexedDB ---------- */
function abrirBD() {
  return new Promise((ok, mal) => {
    const pet = indexedDB.open(BD_NOMBRE, 1);
    pet.onupgradeneeded = () => {
      const b = pet.result;
      b.createObjectStore("fotos", { keyPath: "id", autoIncrement: true }).createIndex("fecha", "fecha");
      b.createObjectStore("ajustes");
    };
    pet.onsuccess = () => ok(pet.result);
    pet.onerror = () => mal(pet.error);
  });
}
function tx(almacen, modo, accion) {
  return new Promise((ok, mal) => {
    const t = bd.transaction(almacen, modo);
    const pet = accion(t.objectStore(almacen));
    t.oncomplete = () => ok(pet?.result);
    t.onerror = () => mal(t.error);
  });
}
const leerFotos = () => tx("fotos", "readonly", (s) => s.index("fecha").getAll());
const guardarFoto = (foto) => tx("fotos", "readwrite", (s) => s.add(foto));
const borrarFoto = (id) => tx("fotos", "readwrite", (s) => s.delete(id));
const leerAjuste = (k) => tx("ajustes", "readonly", (s) => s.get(k));
const guardarAjuste = (k, v) => tx("ajustes", "readwrite", (s) => s.put(v, k));

/* ---------- Utilidades ---------- */
const hoyISO = () => new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const fechaLarga = (iso) => new Date(iso + "T12:00").toLocaleDateString("es-MX", { day: "numeric", month: "long" });
const diaDe = (iso, siembra) => Math.max(0, Math.round((Date.parse(iso) - Date.parse(siembra)) / DIA_MS));
const etapa = (d) => (d >= 14 ? "Cosecha" : d >= 7 ? "Primeras hojas" : d >= 3 ? "Germinación" : "Siembra");
const avisoDiario = (texto, ok = true) => mostrar($("#diario-aviso"), ok, texto);

// Reduce la foto a 1280 px como máximo para no llenar el almacenamiento del teléfono.
function comprimir(archivo, max = 1280) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * k);
      c.height = Math.round(img.height * k);
      c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      c.toBlob((b) => (b ? ok(b) : mal()), "image/jpeg", 0.82);
    };
    img.onerror = mal;
    img.src = URL.createObjectURL(archivo);
  });
}
function cargarImagen(blob) {
  return new Promise((ok, mal) => {
    const img = new Image();
    img.onload = () => ok(img);
    img.onerror = mal;
    img.src = URL.createObjectURL(blob);
  });
}

/* ---------- Pintar la línea de tiempo ---------- */
let urls = [];
async function pintar() {
  const siembra = await leerAjuste("siembra");
  const fotos = await leerFotos();
  $("#siembra").value = siembra || "";
  $("#form-diario").hidden = !siembra;
  $("#diario-compartir").hidden = !fotos.length;

  const dias = siembra ? diaDe(hoyISO(), siembra) : 0;
  $("#diario-estado").innerHTML = siembra
    ? `<strong>Día ${dias}</strong> de tu huerto · ${etapa(dias)}${dias < 14 ? ` · faltan ${14 - dias} día(s) para la primera cosecha` : ""}`
    : "Indica el día en que sembraste para empezar tu diario.";
  $("#diario-barra").style.width = Math.min(100, (dias / 14) * 100) + "%";

  urls.forEach(URL.revokeObjectURL);
  urls = [];
  const lista = $("#diario-lista");
  lista.innerHTML = fotos.length ? "" : "<p class='nota'>Todavía no hay fotos. Toma la primera para ver cómo crece tu planta día con día.</p>";
  for (const f of fotos.slice().reverse()) {
    const url = URL.createObjectURL(f.imagen);
    urls.push(url);
    const li = document.createElement("li");
    li.className = "diario-foto";
    li.innerHTML = `<img src="${url}" alt="Foto del día ${diaDe(f.fecha, siembra || f.fecha)}" loading="lazy">
      <div><strong>Día ${diaDe(f.fecha, siembra || f.fecha)}</strong> <small>${fechaLarga(f.fecha)}</small>
      ${f.nota ? `<p></p>` : ""}
      <span class="diario-acciones">
        <button class="btn-mini" type="button" data-compartir="${f.id}">Compartir</button>
        <button class="btn-mini" type="button" data-borrar="${f.id}">Borrar</button>
      </span></div>`;
    if (f.nota) li.querySelector("p").textContent = f.nota; // texto del usuario sin interpretar como HTML
    lista.append(li);
  }
}

/* ---------- Eventos del formulario ---------- */
$("#siembra").max = hoyISO();
$("#siembra").onchange = async (e) => {
  if (!e.target.value) return;
  await guardarAjuste("siembra", e.target.value);
  avisoDiario("Fecha de siembra guardada.");
  pintar();
};

let archivoElegido = null; // la foto viene de la cámara o de la galería

$("#form-diario").onsubmit = async (e) => {
  e.preventDefault();
  const archivo = archivoElegido;
  if (!archivo) return avisoDiario("Elige o toma una foto primero.", false);
  try {
    const imagen = await comprimir(archivo);
    await guardarFoto({ fecha: hoyISO(), nota: $("#diario-nota").value.trim(), imagen });
    e.target.reset();
    archivoElegido = null;
    $("#diario-vista").hidden = true;
    avisoDiario("Foto guardada en tu diario. Se queda en este dispositivo, incluso sin internet.");
    pintar();
  } catch {
    avisoDiario("No se pudo leer la imagen. Intenta con otra foto.", false);
  }
};

function elegirFoto(e) {
  const f = e.target.files[0];
  archivoElegido = f || null;
  const vista = $("#diario-vista");
  if (!f) return (vista.hidden = true);
  URL.revokeObjectURL(vista.src);
  vista.src = URL.createObjectURL(f);
  vista.hidden = false;
}
$("#diario-camara").onchange = elegirFoto;
$("#diario-galeria").onchange = elegirFoto;

$("#diario-lista").onclick = async (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.borrar) {
    if (!confirm("¿Borrar esta foto de tu diario?")) return;
    await borrarFoto(Number(b.dataset.borrar));
    pintar();
  } else if (b.dataset.compartir) {
    const fotos = await leerFotos();
    compartir(fotos.filter((f) => f.id === Number(b.dataset.compartir)));
  }
};

$("#diario-compartir").onclick = async () => compartir(await leerFotos());

/* ---------- Tarjeta para compartir (canvas) ---------- */
async function crearTarjeta(fotos, siembra) {
  const W = 1080, H = 1350, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#f7faf3"; g.fillRect(0, 0, W, H);
  g.fillStyle = "#15352a"; g.fillRect(0, 0, W, 170);
  g.fillStyle = "#b9dd5a"; g.fillRect(0, 170, W, 10);

  // Logo y encabezado
  g.fillStyle = "#b9dd5a"; g.font = "700 60px Fraunces, Georgia, serif"; g.fillText("Brote", 80, 108);
  g.fillStyle = "#cfe3d6"; g.font = "500 30px Figtree, system-ui, sans-serif";
  g.textAlign = "right"; g.fillText("Mi huerto en casa", W - 80, 104); g.textAlign = "left";

  // Hasta 4 fotos: la primera, la última y dos intermedias
  const elegidas = fotos.length <= 4 ? fotos : [0, 1, 2, 3].map((i) => fotos[Math.round((i * (fotos.length - 1)) / 3)]);
  const zona = { x: 80, y: 230, w: W - 160, h: 820 };
  const n = elegidas.length, col = n === 1 ? 1 : 2, fil = Math.ceil(n / col), gap = 20;
  const cw = (zona.w - gap * (col - 1)) / col, ch = (zona.h - gap * (fil - 1)) / fil;
  for (let i = 0; i < n; i++) {
    const img = await cargarImagen(elegidas[i].imagen);
    const x = zona.x + (i % col) * (cw + gap), y = zona.y + Math.floor(i / col) * (ch + gap);
    const k = Math.max(cw / img.width, ch / img.height), sw = cw / k, sh = ch / k;
    g.save();
    g.beginPath(); g.roundRect(x, y, cw, ch, 24); g.clip();
    g.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, cw, ch);
    g.restore();
    URL.revokeObjectURL(img.src);
    // Etiqueta del día sobre la foto
    const txt = "Día " + diaDe(elegidas[i].fecha, siembra || elegidas[0].fecha);
    g.font = "700 30px Figtree, system-ui, sans-serif";
    const tw = g.measureText(txt).width + 36;
    g.fillStyle = "rgba(21,53,42,.85)"; g.beginPath(); g.roundRect(x + 18, y + ch - 66, tw, 48, 24); g.fill();
    g.fillStyle = "#fff"; g.fillText(txt, x + 36, y + ch - 32);
  }

  // Texto final
  const ultimo = diaDe(fotos.at(-1).fecha, siembra || fotos[0].fecha);
  g.fillStyle = "#15352a"; g.font = "700 54px Fraunces, Georgia, serif";
  g.fillText(ultimo >= 14 ? `¡Primera cosecha en ${ultimo} días!` : `Día ${ultimo}: ${etapa(ultimo).toLowerCase()}`, 80, 1140);
  g.fillStyle = "#4c6156"; g.font = "400 32px Figtree, system-ui, sans-serif";
  g.fillText(`${fotos.length} foto(s) en mi diario · ${location.host || "Brote"}`, 80, 1200);
  g.fillStyle = "#2f7d4f"; g.font = "600 32px Figtree, system-ui, sans-serif";
  g.fillText("#MiHuertoBrote", 80, 1270);
  return new Promise((ok) => c.toBlob(ok, "image/png"));
}

/* ---------- Web Share API ---------- */
async function compartir(fotos) {
  if (!fotos.length) return;
  const siembra = await leerAjuste("siembra");
  const blob = await crearTarjeta(fotos, siembra);
  const archivo = new File([blob], "mi-huerto-brote.png", { type: "image/png" });
  const ultimo = diaDe(fotos.at(-1).fecha, siembra || fotos[0].fecha);
  const datos = {
    title: "Mi huerto Brote",
    text: `Mi huerto va en el día ${ultimo} 🌱 Así ha crecido. #MiHuertoBrote`,
    files: [archivo],
  };
  try {
    if (navigator.canShare?.(datos)) {
      await navigator.share(datos); // menú nativo: WhatsApp, Instagram, correo...
      return avisoDiario("¡Compartido!");
    }
    if (navigator.share) {
      await navigator.share({ title: datos.title, text: datos.text, url: location.origin });
      return avisoDiario("Tu navegador no permite compartir imágenes; se compartió el enlace. La tarjeta también se descargó.");
    }
  } catch (err) {
    if (err.name === "AbortError") return; // el usuario cerró el menú
  }
  // Respaldo en computadoras sin Web Share: descargar la tarjeta
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = archivo.name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  avisoDiario("Este navegador no tiene menú para compartir, así que se descargó la tarjeta de tu cosecha.");
}

/* ---------- Inicio ---------- */
if ("indexedDB" in window) {
  abrirBD().then((b) => { bd = b; pintar(); }).catch(() => avisoDiario("No se pudo abrir el diario en este navegador.", false));
} else {
  $("#diario").querySelector(".panel-diario").innerHTML = "<p class='nota'>Tu navegador no permite guardar el diario.</p>";
}
