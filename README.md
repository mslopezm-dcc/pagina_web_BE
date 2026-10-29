# Tanary — Boutique y Eventos

Sitio con backend propio: Node.js + base de datos SQLite. **Sin instalar paquetes** (solo necesita Node 22.5 o superior).

## Cómo iniciar
```
npm start
```
Abre http://127.0.0.1:3000

La primera vez se crea la base de datos en `data/tanary.db` y se imprime en la consola el **correo y la contraseña del administrador** (se muestra una sola vez; anótala). Para elegirlos tú:
```
ADMIN_EMAIL=tu@correo.com ADMIN_PASSWORD=una-clave-larga npm start
```
(En PowerShell: `$env:ADMIN_PASSWORD='una-clave-larga'; npm start`.)

## Estructura
- `public/` — sitio (HTML, CSS, JS, imágenes). `public/admin/` es el panel.
- `server/server.js` — API + archivos estáticos + SQLite.
- `data/` — base de datos (**haz copia de seguridad de `data/tanary.db`**; no se sube a git).

## Seguridad incluida
- Contraseñas con scrypt + sal; sesión en cookie HttpOnly (8 h); bloqueo 5 min tras 5 intentos fallidos.
- Permisos validados en el servidor en cada llamada (cliente / admin).
- Precios y totales los calcula el servidor; todo dato se valida.
- Protección CSRF (cabecera `X-Requested-With`) y límites de frecuencia.

## Para publicarlo en internet
- Ponlo detrás de HTTPS (Caddy, Nginx o el proxy de tu hosting) y arranca con `SECURE_COOKIES=1`.
- `HOST=0.0.0.0` y `PORT=...` para escuchar fuera de tu equipo (por defecto solo 127.0.0.1).
- Necesita un hosting que ejecute Node (Render, Railway, un VPS, etc.) con disco persistente para `data/`.

Marca y WhatsApp: `public/js/api.js` (`CONFIG`).
