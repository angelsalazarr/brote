const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const webpush = require("web-push");

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, "data");
const ADMIN_KEY = process.env.ADMIN_KEY || "brote1234"; // CÁMBIALA al publicar
const PRECIO = 349;
const ESTADOS = ["Recibido", "Preparando", "Enviado", "Entregado", "Cancelado"];
const PAGOS = ["Transferencia", "Contra entrega"];

/* ---------- Base de datos ----------
   Con TURSO_DATABASE_URL usa Turso (SQLite en la nube, gratis y permanente).
   Sin esa variable usa un archivo local (data/brote.db). */
const TURSO_URL = process.env.TURSO_DATABASE_URL;
let db;
if (TURSO_URL) {
  const { createClient } = TURSO_URL.startsWith("file:") ? require("@libsql/client") : require("@libsql/client/web");
  const c = createClient({ url: TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
  db = {
    run: async (sql, args = []) => { await c.execute({ sql, args }); },
    get: async (sql, args = []) => { const r = (await c.execute({ sql, args })).rows[0]; return r && { ...r }; },
    all: async (sql, args = []) => (await c.execute({ sql, args })).rows.map((r) => ({ ...r })),
  };
} else {
  const { DatabaseSync } = require("node:sqlite");
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const local = new DatabaseSync(path.join(DATA_DIR, "brote.db"));
  db = {
    run: async (sql, args = []) => { local.prepare(sql).run(...args); },
    get: async (sql, args = []) => local.prepare(sql).get(...args),
    all: async (sql, args = []) => local.prepare(sql).all(...args),
  };
}

const CREAR_TABLA = `
  CREATE TABLE IF NOT EXISTS Pedidos(
    IdPedido INTEGER PRIMARY KEY AUTOINCREMENT,
    Folio TEXT UNIQUE NOT NULL,
    Nombre TEXT NOT NULL,
    Correo TEXT NOT NULL,
    Telefono TEXT,
    Direccion TEXT NOT NULL,
    Cantidad INTEGER NOT NULL,
    Total REAL NOT NULL,
    Pago TEXT NOT NULL,
    Estado TEXT NOT NULL DEFAULT 'Recibido',
    Fecha TEXT NOT NULL
  )`;

/* ---------- Tablas de la propuesta "Diario de mi huerto" ---------- */
const TABLAS_DIARIO = [
  `CREATE TABLE IF NOT EXISTS Consejos(
    Dia INTEGER PRIMARY KEY,
    Etapa TEXT NOT NULL,
    Titulo TEXT NOT NULL,
    Texto TEXT NOT NULL,
    Riego TEXT NOT NULL,
    Actualizado TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS Suscripciones(
    IdSuscripcion INTEGER PRIMARY KEY AUTOINCREMENT,
    Endpoint TEXT UNIQUE NOT NULL,
    Datos TEXT NOT NULL,
    Siembra TEXT,
    UltimoAviso TEXT,
    Plataforma TEXT,
    Fecha TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS Configuracion(
    Clave TEXT PRIMARY KEY,
    Valor TEXT NOT NULL
  )`,
];

// Consejo de cuidado para cada día del cultivo (día 0 a 14). Se cargan una sola vez.
const CONSEJOS = [
  [0, "Siembra", "Siembra tus semillas", "Humedece el sustrato, reparte las semillas sobre la superficie y cúbrelas con una capa delgada de tierra.", "Rocía hasta que la tierra se vea húmeda, sin encharcar."],
  [1, "Siembra", "Mantén la humedad", "Coloca la maceta cerca de una ventana con luz, pero sin sol directo. Si el ambiente es seco, cúbrela con plástico transparente.", "Una rociada por la mañana."],
  [2, "Siembra", "Las semillas están despertando", "Las semillas están absorbiendo agua para germinar. No dejes que la superficie se seque.", "Una rociada por la mañana y otra por la tarde si hace calor."],
  [3, "Germinación", "¡Salieron los primeros brotes!", "Retira el plástico si lo usaste y deja que los brotes reciban luz indirecta abundante.", "Rocía la tierra alrededor de los brotes, no sobre ellos."],
  [4, "Germinación", "Brotes derechos", "Gira la maceta un cuarto de vuelta para que los brotes no se inclinen hacia la ventana.", "Una rociada al día."],
  [5, "Germinación", "Riega desde abajo", "Pon agua en el plato de la maceta durante 10 minutos; la fibra de coco la absorbe sin mojar los tallos.", "Riego por el plato, 10 minutos."],
  [6, "Germinación", "Revisa el drenaje", "Retira el agua que quede en el plato. Las raíces necesitan aire además de agua.", "Solo si la tierra se siente seca al tocarla."],
  [7, "Primeras hojas", "Aparecen las hojas verdaderas", "Después de las dos primeras hojitas salen las hojas con la forma de cada hierba. Toma una foto para tu diario.", "Riego por el plato cada dos días."],
  [8, "Primeras hojas", "Dales espacio", "Si hay brotes muy juntos, corta los más débiles a ras de la tierra para que los demás crezcan mejor.", "Riego por el plato cada dos días."],
  [9, "Primeras hojas", "Más luz", "Tu huerto necesita de 5 a 6 horas de luz al día. Si la ventana es oscura, acércalo a la más iluminada.", "Revisa la humedad metiendo un dedo en la tierra."],
  [10, "Crecimiento", "Crecimiento acelerado", "Las plantas ya crecen varios milímetros al día. Sigue girando la maceta cada dos días.", "Riego por el plato cada dos días."],
  [11, "Crecimiento", "Siente el aroma", "Frota suavemente una hoja entre tus dedos: el aroma indica que la planta está sana.", "Riego por el plato cada dos días."],
  [12, "Crecimiento", "Cuidado con el exceso de agua", "Si ves hojas amarillas, deja secar la tierra un día antes de volver a regar.", "Solo si la tierra se siente seca."],
  [13, "Crecimiento", "Prepara la cosecha", "Ten listas unas tijeras limpias. Mañana tu huerto estará listo para la primera cosecha.", "Riego ligero por el plato."],
  [14, "Cosecha", "¡Hora de cosechar!", "Corta las hojas de arriba dejando al menos dos pares en cada tallo. La planta seguirá creciendo y dará más cosechas.", "Riega después de cosechar para que se recupere."],
];

async function prepararBase() {
  await db.run(CREAR_TABLA);
  for (const t of TABLAS_DIARIO) await db.run(t);
  const n = await db.get("SELECT COUNT(*) AS n FROM Consejos");
  if (!Number(n.n)) {
    const hoy = new Date().toISOString();
    for (const c of CONSEJOS) await db.run("INSERT INTO Consejos (Dia,Etapa,Titulo,Texto,Riego,Actualizado) VALUES (?,?,?,?,?,?)", [...c, hoy]);
    console.log("Se cargaron " + CONSEJOS.length + " consejos de cultivo");
  }
  // Llaves VAPID para notificaciones push: de variables de entorno o generadas una vez y guardadas en la base
  let pub = process.env.VAPID_PUBLIC_KEY, priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) {
    const g = await db.get("SELECT Valor FROM Configuracion WHERE Clave='vapid'");
    if (g) ({ pub, priv } = JSON.parse(g.Valor));
    else {
      const k = webpush.generateVAPIDKeys();
      pub = k.publicKey; priv = k.privateKey;
      await db.run("INSERT INTO Configuracion (Clave,Valor) VALUES ('vapid',?)", [JSON.stringify({ pub, priv })]);
    }
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || "https://brote-52a2.onrender.com", pub, priv);
  VAPID_PUBLICA = pub;
}
let VAPID_PUBLICA = "";

/* ---------- Utilidades del diario ---------- */
const hoyMexico = () => new Date(Date.now() - 6 * 36e5).toISOString().slice(0, 10);
const diaCultivo = (siembra) => Math.max(0, Math.round((Date.parse(hoyMexico()) - Date.parse(siembra)) / 864e5));
const consejoDe = async (dia) => db.get("SELECT * FROM Consejos WHERE Dia=?", [Math.min(14, Math.max(0, dia))]);

async function enviarPush(sus, datos) {
  try {
    await webpush.sendNotification(JSON.parse(sus.Datos), JSON.stringify(datos), { TTL: 86400 });
    return true;
  } catch (e) {
    if (e.statusCode === 404 || e.statusCode === 410) await db.run("DELETE FROM Suscripciones WHERE Endpoint=?", [sus.Endpoint]); // suscripción vencida
    else console.error("Push no enviado:", e.statusCode || e.message);
    return false;
  }
}
async function avisoDelDia(sus) {
  if (!sus.Siembra) return { titulo: "Brote", cuerpo: "Indica tu fecha de siembra para recibir el consejo de cada día.", url: "/#diario" };
  const dia = diaCultivo(sus.Siembra), c = await consejoDe(dia);
  return { titulo: `Día ${dia} de tu huerto · ${c.Titulo}`, cuerpo: `${c.Texto} Riego: ${c.Riego}`, url: "/#diario", etiqueta: "consejo-dia" };
}

// Recordatorio diario: cada hora revisa quién no ha recibido el consejo de hoy (después de las 9:00, hora de México)
setInterval(async () => {
  try {
    if (new Date(Date.now() - 6 * 36e5).getUTCHours() < 9) return;
    const hoy = hoyMexico();
    const pendientes = await db.all("SELECT * FROM Suscripciones WHERE Siembra IS NOT NULL AND (UltimoAviso IS NULL OR UltimoAviso<>?)", [hoy]);
    for (const s of pendientes) if (await enviarPush(s, await avisoDelDia(s))) await db.run("UPDATE Suscripciones SET UltimoAviso=? WHERE IdSuscripcion=?", [hoy, s.IdSuscripcion]);
  } catch (e) { console.error("Recordatorios:", e.message); }
}, 36e5);

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config", (_req, res) => res.json({ precio: PRECIO }));

app.post("/api/pedidos", async (req, res) => {
  const b = req.body || {};
  const nombre = String(b.nombre || "").trim();
  const correo = String(b.correo || "").trim().toLowerCase();
  const telefono = String(b.telefono || "").trim().slice(0, 20);
  const direccion = String(b.direccion || "").trim();
  const cantidad = Number(b.cantidad);
  const pago = String(b.pago || "");

  if (nombre.length < 3 || nombre.length > 100)
    return res.status(400).json({ error: "Escribe tu nombre completo." });
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo))
    return res.status(400).json({ error: "Escribe un correo válido." });
  if (direccion.length < 10 || direccion.length > 300)
    return res.status(400).json({ error: "Escribe una dirección de envío completa." });
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 10)
    return res.status(400).json({ error: "La cantidad debe ser de 1 a 10 kits." });
  if (!PAGOS.includes(pago))
    return res.status(400).json({ error: "Elige una forma de pago." });

  const folio = "BR-" + crypto.randomBytes(3).toString("hex").toUpperCase();
  const total = cantidad * PRECIO; // el total lo calcula el servidor

  await db.run(
    `INSERT INTO Pedidos (Folio,Nombre,Correo,Telefono,Direccion,Cantidad,Total,Pago,Fecha)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [folio, nombre, correo, telefono, direccion, cantidad, total, pago, new Date().toISOString()]
  );

  res.status(201).json({ folio, total });
});

app.get("/api/pedidos/:folio", async (req, res) => {
  const p = await db.get(
    "SELECT Folio,Cantidad,Total,Estado FROM Pedidos WHERE Folio=? AND Correo=?",
    [req.params.folio.toUpperCase(), String(req.query.correo || "").trim().toLowerCase()]
  );
  if (!p) return res.status(404).json({ error: "No encontramos ese pedido. Revisa el folio y el correo." });
  res.json({ folio: p.Folio, cantidad: p.Cantidad, total: p.Total, estado: p.Estado });
});

/* ---------- Consejos del diario (base de datos) ---------- */
app.get("/api/consejos", async (_req, res) => {
  res.json(await db.all("SELECT Dia,Etapa,Titulo,Texto,Riego,Actualizado FROM Consejos ORDER BY Dia"));
});

/* ---------- Notificaciones push ---------- */
const fechaValida = (f) => (/^\d{4}-\d{2}-\d{2}$/.test(String(f || "")) ? f : null);

app.get("/api/push/clave", (_req, res) => res.json({ clave: VAPID_PUBLICA }));

app.post("/api/push/suscribir", async (req, res) => {
  const sus = req.body && req.body.suscripcion;
  if (!sus || typeof sus.endpoint !== "string" || !/^https:\/\//.test(sus.endpoint) || !sus.keys)
    return res.status(400).json({ error: "Suscripción inválida" });
  const siembra = fechaValida(req.body.siembra);
  const plataforma = String(req.body.plataforma || "").slice(0, 60);
  const existe = await db.get("SELECT IdSuscripcion FROM Suscripciones WHERE Endpoint=?", [sus.endpoint]);
  if (existe) await db.run("UPDATE Suscripciones SET Datos=?, Siembra=?, Plataforma=? WHERE Endpoint=?", [JSON.stringify(sus), siembra, plataforma, sus.endpoint]);
  else await db.run("INSERT INTO Suscripciones (Endpoint,Datos,Siembra,Plataforma,Fecha) VALUES (?,?,?,?,?)", [sus.endpoint, JSON.stringify(sus), siembra, plataforma, new Date().toISOString()]);
  res.status(201).json({ ok: true });
});

app.post("/api/push/baja", async (req, res) => {
  await db.run("DELETE FROM Suscripciones WHERE Endpoint=?", [String((req.body && req.body.endpoint) || "")]);
  res.json({ ok: true });
});

app.post("/api/push/prueba", async (req, res) => {
  const sus = await db.get("SELECT * FROM Suscripciones WHERE Endpoint=?", [String((req.body && req.body.endpoint) || "")]);
  if (!sus) return res.status(404).json({ error: "Primero activa los recordatorios." });
  const ok = await enviarPush(sus, await avisoDelDia(sus));
  ok ? res.json({ ok: true }) : res.status(502).json({ error: "El servicio de notificaciones no aceptó el envío. Intenta activar los recordatorios de nuevo." });
});

/* ---------- Administrador ---------- */
function admin(req, res, next) {
  const a = Buffer.from(String(req.get("x-admin-key") || ""));
  const b = Buffer.from(ADMIN_KEY);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b))
    return res.status(401).json({ error: "Clave incorrecta" });
  next();
}

app.get("/api/admin/pedidos", admin, async (_req, res) => {
  res.json(await db.all("SELECT * FROM Pedidos ORDER BY IdPedido DESC"));
});

app.put("/api/admin/pedidos/:id", admin, async (req, res) => {
  const estado = req.body && req.body.estado;
  if (!ESTADOS.includes(estado)) return res.status(400).json({ error: "Estado inválido" });
  await db.run("UPDATE Pedidos SET Estado=? WHERE IdPedido=?", [estado, Number(req.params.id)]);
  res.json({ ok: true });
});

app.put("/api/admin/consejos/:dia", admin, async (req, res) => {
  const b = req.body || {}, dia = Number(req.params.dia);
  const titulo = String(b.titulo || "").trim(), texto = String(b.texto || "").trim(), riego = String(b.riego || "").trim();
  if (!Number.isInteger(dia) || dia < 0 || dia > 14) return res.status(400).json({ error: "Día inválido" });
  if (!titulo || titulo.length > 80 || !texto || texto.length > 400 || !riego || riego.length > 120)
    return res.status(400).json({ error: "Revisa el título, el texto y el riego." });
  await db.run("UPDATE Consejos SET Titulo=?, Texto=?, Riego=?, Actualizado=? WHERE Dia=?", [titulo, texto, riego, new Date().toISOString(), dia]);
  res.json({ ok: true });
});

app.get("/api/admin/suscripciones", admin, async (_req, res) => {
  res.json(await db.all("SELECT IdSuscripcion,Siembra,UltimoAviso,Plataforma,Fecha FROM Suscripciones ORDER BY IdSuscripcion DESC"));
});

app.post("/api/admin/push", admin, async (req, res) => {
  const titulo = String((req.body && req.body.titulo) || "").trim().slice(0, 80);
  const cuerpo = String((req.body && req.body.cuerpo) || "").trim().slice(0, 240);
  if (!titulo || !cuerpo) return res.status(400).json({ error: "Escribe el título y el mensaje." });
  const todas = await db.all("SELECT * FROM Suscripciones");
  let enviadas = 0;
  for (const s of todas) if (await enviarPush(s, { titulo, cuerpo, url: "/", etiqueta: "aviso" })) enviadas++;
  res.json({ enviadas, total: todas.length });
});

app.use((err, _req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? "Solicitud inválida" : "Error del servidor, intenta de nuevo." });
});

prepararBase()
  .then(() => app.listen(PORT, () => console.log("Brote corriendo en puerto " + PORT + (TURSO_URL ? " (base en Turso)" : " (base local)"))))
  .catch((e) => { console.error("No se pudo preparar la base de datos:", e.message); process.exit(1); });
