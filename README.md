# Brote – Microhuerto para tu cocina

Sitio web responsivo con pedidos en línea, seguimiento y panel de administración.

## Cómo ejecutarlo
1. Instala Node.js 22.13 o superior.
2. Descomprime el zip y haz doble clic en `iniciar.bat` (Windows) o ejecuta `./iniciar.sh` (Mac/Linux). También sirve `npm start`. La primera vez instala las dependencias (necesita internet).
3. Abre http://localhost:3000 (administración: http://localhost:3000/admin.html, clave `brote1234`; cámbiala con la variable `ADMIN_KEY`).

También puedes abrir `public/index.html` directo en el navegador: el sitio funciona y los pedidos se guardan en modo demostración en tu navegador.

## Estructura
- `public/index.html`: estructura de la página (encabezado, navegación, secciones y pie de página).
- `public/css/estilos.css`: estilos organizados en secciones numeradas, con la paleta en variables.
- `public/js/ui.js`: menú móvil y etapas del cultivo. `pedidos.js`: pedidos y seguimiento. `pwa.js`: app instalable.
- `public/img` y `public/media`: ilustraciones y video. `herramientas/generar-recursos.py` los vuelve a generar.
- `server.js`: servidor Express con base de datos SQLite.

## Instalar como aplicación
Abre http://localhost:3000 en Chrome o Edge. Aparece el botón «Instalar app» en la portada y el icono de instalar en la barra de direcciones. El Service Worker (`public/sw.js`) guarda los archivos para que el sitio cargue sin conexión.

## Publicarla gratis con pedidos y seguimiento funcionando
Render ejecuta el servidor y Turso guarda los pedidos de forma permanente (Render por sí solo borra los archivos al reiniciar).
1. **Turso** (turso.tech): crea una cuenta, una base de datos llamada `brote` y copia su URL (empieza con `libsql://`) y un token de acceso.
2. **GitHub**: crea un repositorio y sube el contenido de esta carpeta (sin `node_modules` ni `data`).
3. **Render** (render.com): New > Web Service, elige tu repositorio y configura:
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Instance Type: Free
   - Variables de entorno: `TURSO_DATABASE_URL` (la URL), `TURSO_AUTH_TOKEN` (el token) y `ADMIN_KEY` (una clave nueva para el administrador).
4. Abre la dirección `https://....onrender.com` que te da Render. El panel está en `/admin.html`.

La tabla de pedidos se crea sola al iniciar. En el plan gratis, Render duerme el servicio tras 15 minutos sin visitas y tarda cerca de un minuto en despertar.

Variables que usa el servidor: `PORT`, `ADMIN_KEY`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` y `DATA_DIR` (solo en modo local).
