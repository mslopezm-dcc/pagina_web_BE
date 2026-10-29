# Plan — Sitio Boutique de Vestidos + Eventos (HTML5 puro)

## 1. Alcance
Sitio web estático (HTML5 + CSS + JavaScript, sin servidor ni frameworks) con dos líneas de negocio:

1. **Boutique**: alquiler y venta de vestidos para hombre y mujer.
2. **Eventos**: organización de eventos (bodas, quinceañeros, corporativos, etc.).

Adicionales:
- **Login** con usuarios y contraseñas (roles: cliente / administrador).
- **Panel de administración** visual para gestionar contenido y ver **métricas**.

## 2. Limitación importante (decisión de arquitectura)
Con "solo HTML5" no existe backend. Por tanto:
- Los datos (usuarios, catálogo, solicitudes, métricas) se guardan en el **navegador** (`localStorage`).
- Las contraseñas se guardan con **hash SHA-256 (Web Crypto API)**, nunca en texto plano, pero **esto NO es seguridad real**: cualquiera con acceso al navegador puede leer/editar los datos.
- Los datos **no se comparten entre dispositivos**: las métricas del admin solo reflejan lo ocurrido en ese mismo navegador.
- Para uso real (clientes reales, métricas globales) hará falta una fase 2 con backend (ej. Firebase/Supabase o Node + base de datos). El código se diseñará con una capa `storage.js` aislada para migrar fácilmente.

## 3. Estructura de archivos
```
Boutique-Eventos/
├── index.html            Portada (elige Boutique / Eventos)
├── boutique.html         Catálogo con filtros (género, categoría, venta/alquiler, talla, precio)
├── producto.html         Detalle de vestido + solicitud de alquiler/compra
├── eventos.html          Servicios, paquetes, galería, formulario de cotización
├── login.html            Inicio de sesión y registro
├── cuenta.html           Perfil del cliente + sus solicitudes
├── admin/
│   ├── index.html        Dashboard de métricas (gráficas)
│   ├── productos.html    CRUD de vestidos
│   ├── solicitudes.html  Reservas, compras y cotizaciones de eventos
│   └── usuarios.html     Gestión de usuarios y roles
├── css/
│   ├── base.css          Variables, reset, tipografía
│   ├── componentes.css   Botones, tarjetas, formularios, modales
│   └── admin.css         Estilos del panel
├── js/
│   ├── storage.js        Capa de datos (localStorage) — único punto a reemplazar por backend
│   ├── auth.js           Registro, login, hash, sesión, guardas por rol
│   ├── metrics.js        Registro de eventos (visitas, clics, solicitudes)
│   ├── boutique.js       Render/filtros del catálogo
│   ├── eventos.js        Formulario de cotización
│   ├── admin.js          Lógica del panel y gráficas (Canvas/SVG propio, sin librerías)
│   └── seed.js           Datos de ejemplo + usuario admin inicial
└── img/                  Imágenes (placeholders al inicio)
```

## 4. Modelo de datos (localStorage)
| Clave | Contenido |
|---|---|
| `users` | id, nombre, email, passHash, salt, rol, creado |
| `session` | userId, expira |
| `products` | id, nombre, genero (H/M), categoria, talla[], color, modo (venta/alquiler/ambos), precioVenta, precioAlquilerDia, stock, imagen, activo |
| `requests` | id, tipo (alquiler/compra/evento), userId, productoId o datosEvento, fechas, estado (nueva/confirmada/cerrada/cancelada), creado |
| `events_log` | ts, tipo (visita, vista_producto, click_cta, registro, login, solicitud), pagina, refId |

## 5. Funcionalidades por módulo
**Boutique**: catálogo, filtros, búsqueda, detalle, selector de fechas de alquiler con cálculo de precio, solicitud (requiere login), contacto por WhatsApp.
**Eventos**: tipos de evento, paquetes, galería, formulario de cotización (tipo, fecha, invitados, presupuesto).
**Usuarios**: registro, login/logout, sesión con expiración, bloqueo temporal tras 5 intentos fallidos, rutas de admin protegidas por rol.
**Admin**: 
- Dashboard: visitas, usuarios registrados, solicitudes por tipo/estado, productos más vistos, ingresos estimados, embudo vista→solicitud, gráfica por día.
- CRUD de productos, cambio de estado de solicitudes, gestión de usuarios/roles, exportar métricas a CSV.

## 6. Diseño
- Paleta elegante (marfil, negro, dorado suave), tipografía serif para títulos.
- Responsive (móvil primero), HTML semántico, accesible (etiquetas, contraste, foco visible).

## 7. Fases y dimensionamiento (tamaño relativo: S ≈ 1 sesión corta, M ≈ 1–2, L ≈ 2–3)
| Fase | Entregable | Tamaño |
|---|---|---|
| 0 | Estructura, CSS base, componentes, seed de datos | S |
| 1 | `storage.js` + `auth.js` + login/registro + guardas | M |
| 2 | Portada + Boutique (catálogo, filtros, detalle, solicitud) | L |
| 3 | Eventos (páginas + cotización) | M |
| 4 | `metrics.js` (instrumentación en todas las páginas) | S |
| 5 | Panel admin: dashboard con gráficas | L |
| 6 | Admin: CRUD productos, solicitudes, usuarios, CSV | M |
| 7 | Pulido, responsive, pruebas manuales, README de uso | S |

Total aproximado: **~10–14 sesiones de trabajo cortas** (se puede entregar por fases y probar cada una).

## 8. Credenciales iniciales (solo desarrollo)
Admin de ejemplo creado por `seed.js` (usuario/clave a definir con el cliente, debe cambiarse en el primer ingreso).

## 9. Preguntas abiertas
1. Nombre de la marca y logo/colores preferidos.
2. ¿Idioma solo español? ¿Moneda (COP)?
3. ¿Hay imágenes reales o usamos placeholders?
4. ¿Las solicitudes se cierran por WhatsApp/correo? (número/correo de contacto)
5. ¿Necesitas luego publicar y compartir datos entre dispositivos (backend)? Define si pasamos a fase 2.
6. ¿Pagos en línea o solo solicitud/reserva? (propuesto: solo solicitud).
