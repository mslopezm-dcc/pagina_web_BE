// Servidor Tanary: API REST + archivos estáticos. Sin dependencias (solo Node >= 22.5).
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUB = path.join(HERE, '..', 'public');
const DATA = process.env.DATA_DIR || path.join(HERE, '..', 'data');
const PORT = +process.env.PORT || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const SECURE = process.env.SECURE_COOKIES === '1';
const SESSION_MS = 8 * 3600e3;

fs.mkdirSync(DATA, { recursive: true });
const db = new DatabaseSync(path.join(DATA, 'tanary.db'));
db.exec(`
PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, nombre TEXT NOT NULL, email TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, pass_hash TEXT NOT NULL, rol TEXT NOT NULL DEFAULT 'cliente', creado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, expira INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS products(id TEXT PRIMARY KEY, nombre TEXT NOT NULL, genero TEXT NOT NULL, categoria TEXT NOT NULL, color TEXT, modo TEXT NOT NULL, precio_venta INTEGER DEFAULT 0, precio_alquiler INTEGER DEFAULT 0, stock INTEGER DEFAULT 0, tallas TEXT NOT NULL, imagen TEXT, activo INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS requests(id TEXT PRIMARY KEY, tipo TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, producto_id TEXT, talla TEXT, desde TEXT, hasta TEXT, datos TEXT, total INTEGER DEFAULT 0, estado TEXT NOT NULL DEFAULT 'nueva', creado INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS events_log(id INTEGER PRIMARY KEY AUTOINCREMENT, ts INTEGER NOT NULL, tipo TEXT NOT NULL, pagina TEXT, ref TEXT, demo INTEGER NOT NULL DEFAULT 0);
CREATE TABLE IF NOT EXISTS login_fail(email TEXT PRIMARY KEY, n INTEGER NOT NULL, hasta INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS ix_log_ts ON events_log(ts);
CREATE INDEX IF NOT EXISTS ix_req_user ON requests(user_id);
`);
// Migración: varias fotos por producto (imagen = la principal, imagenes = lista completa).
if (!db.prepare('PRAGMA table_info(products)').all().some(c => c.name === 'imagenes')) db.exec('ALTER TABLE products ADD COLUMN imagenes TEXT');
const MAX_FOTOS = 6;

// ---------- utilidades ----------
const now = () => Date.now();
const uid = () => crypto.randomBytes(8).toString('hex');
const sha = t => crypto.createHash('sha256').update(t).digest('hex');
const hashPass = (p, salt) => crypto.scryptSync(p, salt, 64).toString('hex');
const checkPass = (p, salt, hash) => { const a = Buffer.from(hashPass(p, salt), 'hex'), b = Buffer.from(hash, 'hex'); return a.length === b.length && crypto.timingSafeEqual(a, b); };
const httpErr = (status, msg) => Object.assign(new Error(msg), { status });
const str = (v, min, max, campo) => { if (typeof v !== 'string') throw httpErr(400, `${campo} inválido`); v = v.trim(); if (v.length < min || v.length > max) throw httpErr(400, `${campo}: entre ${min} y ${max} caracteres`); return v; };
const int = (v, min, max, campo) => { const n = Number(v); if (!Number.isInteger(n) || n < min || n > max) throw httpErr(400, `${campo} inválido`); return n; };
const oneOf = (v, list, campo) => { if (!list.includes(v)) throw httpErr(400, `${campo} inválido`); return v; };
const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(new Date(s + 'T00:00:00Z'));
const minDate = () => new Date(now() - 864e5).toISOString().slice(0, 10); // tolera zona horaria

const buckets = new Map();
function limit(key, max, ms) {
  const t = now(), b = (buckets.get(key) || []).filter(x => x > t - ms);
  if (b.length >= max) throw httpErr(429, 'Demasiadas solicitudes. Intenta más tarde.');
  b.push(t); buckets.set(key, b);
}
setInterval(() => { const t = now(); for (const [k, v] of buckets) if (!v.some(x => x > t - 36e5)) buckets.delete(k); db.prepare('DELETE FROM sessions WHERE expira<?').run(t); }, 600e3).unref();

const pubUser = u => ({ id: u.id, nombre: u.nombre, email: u.email, rol: u.rol, creado: u.creado });
const mapProd = p => ({ id: p.id, nombre: p.nombre, genero: p.genero, categoria: p.categoria, color: p.color, modo: p.modo, precioVenta: p.precio_venta, precioAlquilerDia: p.precio_alquiler, stock: p.stock, tallas: JSON.parse(p.tallas), imagen: p.imagen, imagenes: p.imagenes ? JSON.parse(p.imagenes) : [p.imagen], activo: !!p.activo });
const mapReq = r => ({ id: r.id, tipo: r.tipo, userId: r.user_id, productoId: r.producto_id, productoNombre: r.producto_nombre ?? null, cliente: r.u_nombre ? { nombre: r.u_nombre, email: r.u_email } : undefined, talla: r.talla, desde: r.desde, hasta: r.hasta, datos: r.datos ? JSON.parse(r.datos) : null, total: r.total, estado: r.estado, creado: r.creado });

function ph(emoji, c1, c2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="800"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="600" height="800" fill="url(#g)"/><text x="300" y="450" font-size="220" text-anchor="middle">${emoji}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

// ---------- datos iniciales ----------
function seed() {
  if (!db.prepare('SELECT 1 FROM users WHERE rol=\'admin\' LIMIT 1').get()) {
    const email = (process.env.ADMIN_EMAIL || 'admin@tanary.local').toLowerCase();
    let pass = process.env.ADMIN_PASSWORD, generada = false;
    if (!pass) { pass = crypto.randomBytes(9).toString('base64url'); generada = true; }
    const salt = crypto.randomBytes(12).toString('hex');
    db.prepare('INSERT INTO users(id,nombre,email,salt,pass_hash,rol,creado) VALUES(?,?,?,?,?,?,?)').run(uid(), 'Administrador', email, salt, hashPass(pass, salt), 'admin', now());
    console.log('\n=== Administrador creado ===\n  correo:     ' + email + '\n  contraseña: ' + (generada ? pass + '   (anótala: no se vuelve a mostrar)' : '(la de ADMIN_PASSWORD)') + '\n');
  }
  if (!db.prepare('SELECT 1 FROM products LIMIT 1').get()) {
    const P = (nombre, genero, categoria, color, modo, pv, pa, c1, c2, e) => [uid(), nombre, genero, categoria, color, modo, pv, pa, 3, JSON.stringify(['S', 'M', 'L']), ph(e, c1, c2), 1];
    const ins = db.prepare('INSERT INTO products(id,nombre,genero,categoria,color,modo,precio_venta,precio_alquiler,stock,tallas,imagen,activo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)');
    [P('Vestido Aurora', 'M', 'Gala', 'Rojo', 'ambos', 650000, 120000, '#8c1c2b', '#d96a6a', '👗'),
     P('Vestido Perla', 'M', 'Novia', 'Marfil', 'ambos', 1800000, 350000, '#e8dcc8', '#f8f2e8', '👰'),
     P('Vestido Medianoche', 'M', 'Cóctel', 'Azul', 'alquiler', 0, 90000, '#14213d', '#3a5a9a', '👗'),
     P('Vestido Rosé', 'M', 'Quinceañera', 'Rosa', 'ambos', 900000, 200000, '#d98ca7', '#f5c6d6', '👸'),
     P('Vestido Esmeralda', 'M', 'Gala', 'Verde', 'venta', 720000, 0, '#0f5a46', '#4fa68a', '👗'),
     P('Vestido Dorado', 'M', 'Cóctel', 'Dorado', 'alquiler', 0, 110000, '#b08d57', '#e8d3a2', '✨'),
     P('Esmoquin Clásico', 'H', 'Esmoquin', 'Negro', 'ambos', 850000, 160000, '#1c1a17', '#4a453d', '🤵'),
     P('Traje Azul Marino', 'H', 'Traje', 'Azul', 'ambos', 780000, 130000, '#0b2447', '#3d6ea8', '🕴️'),
     P('Traje Gris Slim', 'H', 'Traje', 'Gris', 'venta', 690000, 0, '#555', '#aaa', '🕴️'),
     P('Smoking Borgoña', 'H', 'Esmoquin', 'Vino', 'alquiler', 0, 150000, '#4a0d1d', '#9c3a52', '🤵'),
     P('Traje Beige Lino', 'H', 'Traje', 'Beige', 'ambos', 620000, 110000, '#c9b79c', '#eee3d0', '🕴️'),
     P('Chaqué Ceremonia', 'H', 'Novio', 'Gris', 'alquiler', 0, 180000, '#3b3b45', '#8a8a9a', '🤵')].forEach(r => ins.run(...r));
  }
}
seed();

// ---------- sesiones ----------
const COOKIE = 'tanary_sid';
function getUser(req) {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})').exec(req.headers.cookie || '');
  if (!m) return null;
  const row = db.prepare('SELECT u.*, s.expira FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=?').get(sha(m[1]));
  return row && row.expira > now() ? row : null;
}
function cookie(res, value, maxAge) {
  res.setHeader('Set-Cookie', `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${SECURE ? '; Secure' : ''}`);
}
function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions(token_hash,user_id,expira) VALUES(?,?,?)').run(sha(token), userId, now() + SESSION_MS);
  cookie(res, token, SESSION_MS / 1000);
}
const log = (tipo, pagina, ref, demo = 0) => db.prepare('INSERT INTO events_log(ts,tipo,pagina,ref,demo) VALUES(?,?,?,?,?)').run(now(), tipo, pagina || '', ref || '', demo);

// ---------- validación de productos ----------
function cleanProduct(b) {
  let imagenes = Array.isArray(b.imagenes) ? b.imagenes : (typeof b.imagen === 'string' && b.imagen ? [b.imagen] : []);
  if (imagenes.length > MAX_FOTOS) throw httpErr(400, `Máximo ${MAX_FOTOS} fotos por producto`);
  for (const im of imagenes) if (typeof im !== 'string' || !im.startsWith('data:image/') || im.length > 600000) throw httpErr(400, 'Imagen inválida o demasiado grande');
  if (!imagenes.length) imagenes = [ph('👗', '#999', '#ddd')];
  const tallas = Array.isArray(b.tallas) ? b.tallas.map(t => str(String(t), 1, 8, 'Talla')).slice(0, 12) : [];
  if (!tallas.length) throw httpErr(400, 'Indica al menos una talla');
  return {
    nombre: str(b.nombre, 1, 120, 'Nombre'), genero: oneOf(b.genero, ['M', 'H'], 'Género'), categoria: str(b.categoria, 1, 60, 'Categoría'),
    color: str(b.color ?? '', 0, 40, 'Color'), modo: oneOf(b.modo, ['venta', 'alquiler', 'ambos'], 'Modalidad'),
    precio_venta: int(b.precioVenta ?? 0, 0, 1e9, 'Precio de venta'), precio_alquiler: int(b.precioAlquilerDia ?? 0, 0, 1e9, 'Precio de alquiler'),
    stock: int(b.stock ?? 0, 0, 10000, 'Stock'), tallas: JSON.stringify(tallas), imagen: imagenes[0], imagenes: JSON.stringify(imagenes), activo: b.activo === false ? 0 : 1
  };
}

// ---------- rutas ----------
const routes = [];
const route = (method, pattern, auth, fn) => routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[\\w-]+)') + '$'), auth, fn });

route('GET', '/api/me', null, ({ user }) => ({ user: user ? pubUser(user) : null }));

route('POST', '/api/auth/register', null, ({ body, res, ip }) => {
  limit('reg:' + ip, 10, 36e5);
  const nombre = str(body.nombre, 1, 80, 'Nombre'), email = str(body.email, 3, 120, 'Correo').toLowerCase();
  if (!/^\S+@\S+\.\S+$/.test(email)) throw httpErr(400, 'Correo inválido.');
  const pass = str(body.password, 8, 200, 'Contraseña');
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) throw httpErr(409, 'Ese correo ya está registrado.');
  const id = uid(), salt = crypto.randomBytes(12).toString('hex');
  db.prepare('INSERT INTO users(id,nombre,email,salt,pass_hash,rol,creado) VALUES(?,?,?,?,?,?,?)').run(id, nombre, email, salt, hashPass(pass, salt), 'cliente', now());
  startSession(res, id); log('registro', 'login.html', id);
  return { user: pubUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)) };
});

route('POST', '/api/auth/login', null, ({ body, res, ip }) => {
  limit('login:' + ip, 30, 600e3);
  const email = String(body.email || '').trim().toLowerCase(), pass = String(body.password || '');
  const f = db.prepare('SELECT * FROM login_fail WHERE email=?').get(email);
  if (f && f.hasta > now()) throw httpErr(429, 'Demasiados intentos. Espera unos minutos.');
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(email);
  if (!u || !checkPass(pass, u.salt, u.pass_hash)) {
    const n = (f ? f.n : 0) + 1;
    db.prepare('INSERT INTO login_fail(email,n,hasta) VALUES(?,?,?) ON CONFLICT(email) DO UPDATE SET n=excluded.n, hasta=excluded.hasta').run(email, n >= 5 ? 0 : n, n >= 5 ? now() + 300e3 : 0);
    throw httpErr(401, 'Correo o contraseña incorrectos.');
  }
  db.prepare('DELETE FROM login_fail WHERE email=?').run(email);
  startSession(res, u.id); log('login', 'login.html', u.id);
  return { user: pubUser(u) };
});

route('POST', '/api/auth/logout', null, ({ req, res }) => {
  const m = new RegExp('(?:^|;\\s*)' + COOKIE + '=([a-f0-9]{64})').exec(req.headers.cookie || '');
  if (m) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(sha(m[1]));
  cookie(res, '', 0); return { ok: true };
});

route('GET', '/api/products', null, ({ user, query }) => {
  const all = query.get('all') === '1';
  if (all && user?.rol !== 'admin') throw httpErr(403, 'Sin permiso');
  return db.prepare('SELECT * FROM products' + (all ? '' : ' WHERE activo=1') + ' ORDER BY rowid').all().map(mapProd);
});
route('POST', '/api/products', 'admin', ({ body }) => {
  const d = cleanProduct(body), id = uid();
  db.prepare('INSERT INTO products(id,nombre,genero,categoria,color,modo,precio_venta,precio_alquiler,stock,tallas,imagen,imagenes,activo) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)').run(id, d.nombre, d.genero, d.categoria, d.color, d.modo, d.precio_venta, d.precio_alquiler, d.stock, d.tallas, d.imagen, d.imagenes, d.activo);
  return mapProd(db.prepare('SELECT * FROM products WHERE id=?').get(id));
});
route('PUT', '/api/products/:id', 'admin', ({ body, params }) => {
  const old = db.prepare('SELECT * FROM products WHERE id=?').get(params.id);
  if (!old) throw httpErr(404, 'Producto no encontrado');
  const d = cleanProduct({ ...body, imagenes: Array.isArray(body.imagenes) ? body.imagenes : mapProd(old).imagenes });
  db.prepare('UPDATE products SET nombre=?,genero=?,categoria=?,color=?,modo=?,precio_venta=?,precio_alquiler=?,stock=?,tallas=?,imagen=?,imagenes=?,activo=? WHERE id=?').run(d.nombre, d.genero, d.categoria, d.color, d.modo, d.precio_venta, d.precio_alquiler, d.stock, d.tallas, d.imagen, d.imagenes, d.activo, params.id);
  return mapProd(db.prepare('SELECT * FROM products WHERE id=?').get(params.id));
});
route('DELETE', '/api/products/:id', 'admin', ({ params }) => { db.prepare('DELETE FROM products WHERE id=?').run(params.id); return { ok: true }; });

route('POST', '/api/requests', 'user', ({ body, user }) => {
  limit('req:' + user.id, 20, 36e5);
  const tipo = oneOf(body.tipo, ['alquiler', 'compra', 'evento'], 'Tipo'), id = uid();
  let productoId = null, talla = null, desde = null, hasta = null, datos = null, total = 0;
  if (tipo === 'evento') {
    const d = body.datos || {};
    if (!isDate(d.fecha) || d.fecha < minDate()) throw httpErr(400, 'Fecha del evento inválida');
    datos = JSON.stringify({
      tipoEvento: oneOf(d.tipoEvento, ['Boda', 'Quinceañero', 'Corporativo', 'Cumpleaños', 'Otro'], 'Tipo de evento'),
      paquete: oneOf(d.paquete, ['Esencial', 'Elegante', 'Premium', 'Aún no lo sé'], 'Paquete'),
      fecha: d.fecha, invitados: int(d.invitados, 1, 2000, 'Invitados'), presupuesto: int(d.presupuesto ?? 0, 0, 1e10, 'Presupuesto'), notas: str(d.notas ?? '', 0, 600, 'Notas')
    });
    total = JSON.parse(datos).presupuesto;
  } else {
    const p = db.prepare('SELECT * FROM products WHERE id=? AND activo=1').get(String(body.productoId || ''));
    if (!p) throw httpErr(404, 'Producto no disponible');
    if ((tipo === 'compra' && p.modo === 'alquiler') || (tipo === 'alquiler' && p.modo === 'venta')) throw httpErr(400, 'Modalidad no disponible para este producto');
    if (!JSON.parse(p.tallas).includes(body.talla)) throw httpErr(400, 'Talla no disponible');
    productoId = p.id; talla = body.talla;
    if (tipo === 'alquiler') {
      if (!isDate(body.desde) || !isDate(body.hasta) || body.desde < minDate() || body.hasta < body.desde) throw httpErr(400, 'Fechas inválidas');
      const dias = Math.round((new Date(body.hasta) - new Date(body.desde)) / 864e5) + 1;
      if (dias > 60) throw httpErr(400, 'El alquiler máximo es de 60 días');
      desde = body.desde; hasta = body.hasta; total = dias * p.precio_alquiler; // el total lo calcula el servidor
    } else total = p.precio_venta;
  }
  db.prepare('INSERT INTO requests(id,tipo,user_id,producto_id,talla,desde,hasta,datos,total,estado,creado) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id, tipo, user.id, productoId, talla, desde, hasta, datos, total, 'nueva', now());
  log('solicitud', 'solicitud', productoId || JSON.parse(datos).tipoEvento);
  return { id, total };
});
route('GET', '/api/requests', 'user', ({ user }) => {
  const sql = `SELECT r.*, p.nombre AS producto_nombre, u.nombre AS u_nombre, u.email AS u_email FROM requests r LEFT JOIN products p ON p.id=r.producto_id LEFT JOIN users u ON u.id=r.user_id`;
  const rows = user.rol === 'admin' ? db.prepare(sql + ' ORDER BY r.creado DESC').all() : db.prepare(sql + ' WHERE r.user_id=? ORDER BY r.creado DESC').all(user.id);
  return rows.map(mapReq);
});
route('PATCH', '/api/requests/:id', 'user', ({ body, params, user }) => {
  const r = db.prepare('SELECT * FROM requests WHERE id=?').get(params.id);
  if (!r) throw httpErr(404, 'No encontrada');
  const estado = oneOf(body.estado, ['nueva', 'confirmada', 'cerrada', 'cancelada'], 'Estado');
  if (user.rol !== 'admin' && (r.user_id !== user.id || r.estado !== 'nueva' || estado !== 'cancelada')) throw httpErr(403, 'Sin permiso');
  db.prepare('UPDATE requests SET estado=? WHERE id=?').run(estado, params.id);
  return { ok: true };
});

route('GET', '/api/users', 'admin', () => db.prepare('SELECT * FROM users ORDER BY creado').all().map(pubUser));
route('PATCH', '/api/users/:id', 'admin', ({ body, params, user }) => {
  if (params.id === user.id) throw httpErr(400, 'No puedes cambiar tu propio rol');
  const r = db.prepare('UPDATE users SET rol=? WHERE id=?').run(oneOf(body.rol, ['cliente', 'admin'], 'Rol'), params.id);
  if (!r.changes) throw httpErr(404, 'Usuario no encontrado');
  return { ok: true };
});
route('DELETE', '/api/users/:id', 'admin', ({ params, user }) => {
  if (params.id === user.id) throw httpErr(400, 'No puedes eliminarte a ti mismo');
  db.prepare('DELETE FROM users WHERE id=?').run(params.id); return { ok: true };
});

route('POST', '/api/events', null, ({ body, ip }) => {
  limit('ev:' + ip, 180, 60e3);
  log(oneOf(body.tipo, ['visita', 'vista_producto', 'click_cta'], 'Tipo'), String(body.pagina || '').slice(0, 60), String(body.ref || '').slice(0, 60));
  return { ok: true };
});
route('GET', '/api/admin/log', 'admin', () => db.prepare('SELECT ts,tipo,pagina,ref,demo FROM events_log ORDER BY ts DESC LIMIT 20000').all().map(l => ({ ...l, demo: !!l.demo })));
route('POST', '/api/admin/demo', 'admin', () => {
  const tipos = ['visita', 'visita', 'visita', 'vista_producto', 'vista_producto', 'solicitud'], pids = db.prepare('SELECT id FROM products').all().map(p => p.id), pg = ['index.html', 'boutique.html', 'eventos.html', 'producto.html'];
  const ins = db.prepare('INSERT INTO events_log(ts,tipo,pagina,ref,demo) VALUES(?,?,?,?,1)');
  db.exec('BEGIN');
  for (let i = 0; i < 250; i++) { const t = tipos[Math.random() * tipos.length | 0]; ins.run(Math.floor(now() - Math.random() * 14 * 864e5), t, pg[Math.random() * 4 | 0], t === 'visita' ? '' : pids[Math.random() * pids.length | 0]); }
  db.exec('COMMIT'); return { ok: true };
});
route('DELETE', '/api/admin/demo', 'admin', () => { db.prepare('DELETE FROM events_log WHERE demo=1').run(); return { ok: true }; });

// ---------- servidor ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.json': 'application/json' };
function readBody(req, max = 1_000_000) {
  return new Promise((ok, fail) => {
    let n = 0; const ch = [];
    req.on('data', c => { n += c.length; if (n > max) { fail(httpErr(413, 'Solicitud demasiado grande')); req.destroy(); } else ch.push(c); });
    req.on('end', () => { if (!ch.length) return ok({}); try { const b = JSON.parse(Buffer.concat(ch).toString()); ok(b && typeof b === 'object' ? b : {}); } catch { fail(httpErr(400, 'JSON inválido')); } });
    req.on('error', fail);
  });
}
const json = (res, status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(obj)); };

async function handleApi(req, res, url) {
  const r = routes.map(x => x.method === req.method && x.re.exec(url.pathname) ? { x, m: x.re.exec(url.pathname) } : null).find(Boolean);
  if (!r) throw httpErr(404, 'Ruta no encontrada');
  // Protección CSRF: las escrituras exigen una cabecera personalizada que un sitio externo no puede enviar sin CORS.
  if (req.method !== 'GET' && req.headers['x-requested-with'] !== 'tanary') throw httpErr(403, 'Cabecera requerida');
  const user = getUser(req);
  if (r.x.auth && !user) throw httpErr(401, 'Debes iniciar sesión');
  if (r.x.auth === 'admin' && user.rol !== 'admin') throw httpErr(403, 'Sin permiso');
  const body = req.method === 'GET' ? {} : await readBody(req, url.pathname.startsWith('/api/products') ? 4_500_000 : 1_000_000);
  const out = r.x.fn({ req, res, body, user, params: r.m.groups || {}, query: url.searchParams, ip: req.socket.remoteAddress });
  json(res, 200, out);
}
function serveStatic(req, res, url) {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let rel; try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.normalize(path.join(PUB, rel));
  if (!file.startsWith(PUB + path.sep)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (e, st) => {
    if (e || !st.isFile()) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    req.method === 'HEAD' ? res.end() : fs.createReadStream(file).pipe(res);
  });
}

http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname.startsWith('/api/')) await handleApi(req, res, url); else serveStatic(req, res, url);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) json(res, e.status || 500, { error: e.status ? e.message : 'Error interno del servidor' });
  }
}).listen(PORT, HOST, () => console.log(`Tanary en http://${HOST}:${PORT}`));
