/* Interfaz: menú móvil y control de etapas del cultivo */
const $ = (s) => document.querySelector(s);

/* ---------- Menú móvil ---------- */
const menu = $("#menu");
const nav = $("#nav");
function alternarMenu(abrir) {
  nav.classList.toggle("abierto", abrir);
  menu.setAttribute("aria-expanded", String(abrir));
  menu.setAttribute("aria-label", abrir ? "Cerrar menú" : "Abrir menú");
}
menu.onclick = () => alternarMenu(!nav.classList.contains("abierto"));
nav.onclick = (e) => { if (e.target.closest("a")) alternarMenu(false); };
addEventListener("keydown", (e) => { if (e.key === "Escape") alternarMenu(false); });

/* ---------- Etapas del cultivo ---------- */
const ETAPAS = [
  { titulo: "Día 0 · Siembra", texto: "Reparte las semillas sobre el sustrato húmedo y cúbrelas con una capa delgada. Coloca la maceta cerca de una ventana con luz.", alt: "Maceta recién sembrada con semillas sobre la tierra" },
  { titulo: "Día 3 · Germinación", texto: "Aparecen los primeros brotes. Riega con un rociador una vez al día, sin encharcar la tierra.", alt: "Maceta con un brote pequeño de dos hojas" },
  { titulo: "Día 7 · Primeras hojas", texto: "Las plantas ya tienen hojas verdaderas. Gira la maceta cada dos días para que crezcan derechas.", alt: "Maceta con una planta de varias hojas" },
  { titulo: "Día 14 · Primera cosecha", texto: "Corta las hojas de arriba con tijeras limpias. La planta sigue creciendo y te da más cosechas.", alt: "Maceta con albahaca, cilantro y hierbabuena listas para cosechar" },
];
const control = $("#etapa");
const imagen = $("#etapa-img");

control.oninput = () => {
  const e = ETAPAS[control.value];
  imagen.classList.add("cambia");
  setTimeout(() => {
    imagen.src = `img/etapa-${control.value}.svg`;
    imagen.alt = e.alt;
    imagen.classList.remove("cambia");
  }, 150);
  $("#etapa-titulo").textContent = e.titulo;
  $("#etapa-texto").textContent = e.texto;
  control.setAttribute("aria-valuetext", e.titulo.split(" · ")[0]);
};
