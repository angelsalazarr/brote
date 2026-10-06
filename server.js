const express = require("express");
const { DatabaseSync } = require("node:sqlite");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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

app.use((err, _req, res, _next) => {
  if (!err.status || err.status >= 500) console.error(err);
  res.status(err.status || 500).json({ error: err.status === 400 ? "Solicitud inválida" : "Error del servidor, intenta de nuevo." });
});

db.run(CREAR_TABLA)
  .then(() => app.listen(PORT, () => console.log("Brote corriendo en puerto " + PORT + (TURSO_URL ? " (base en Turso)" : " (base local)"))))
  .catch((e) => { console.error("No se pudo preparar la base de datos:", e.message); process.exit(1); });
