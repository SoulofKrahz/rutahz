# Rutahz 2.0 — Despliegue en Cloudflare Pages

Versión: `2026-11-01-1` · Service worker: `rz-v2`

## Antes de nada: pasar los datos desde Netlify

Netlify y Cloudflare son direcciones distintas. El navegador **no** comparte los datos entre ellas.

1. Cada usuario abre la versión de **Netlify**.
2. Va a Compartir › Copia de seguridad completa › **Guardar copia**. Guarda el `.json` en Drive o se lo envía.
3. Abre la 2.0 en Cloudflare y crea su PIN. En «Bienvenido a Rutahz 2.0» elige **Restaurar copia** y selecciona ese archivo.
   - También se puede hacer más tarde en Ajustes › Datos › Restaurar copia.
   - Restaurar combina: no duplica ni borra nada.

**No redirijas ni borres Netlify** hasta que todos los usuarios hayan hecho la copia. Si lo haces antes, sus datos quedan atrapados en la dirección antigua.

## Subir a Cloudflare

1. Descomprime `rutahz_cloudflare.zip`. Todo debe quedar en la raíz, incluidos `_worker.js` y `_routes.json`.
2. Ve a Cloudflare › Workers & Pages › Create › Pages › **Upload assets**.
3. Usa el nombre de proyecto `rutahz`. Así la dirección será `rutahz.pages.dev`. Si eliges otro nombre, cambia `rutahz.pages.dev` en los 10 archivos `manifest*.webmanifest`, en `related_applications`.
4. Sube la carpeta.

**Comprobar que el worker funciona:** abre `https://rutahz.pages.dev/r/2.65,39.57;2.75,39.63` en el navegador.
- Debe responder «Solo desde la propia web». Eso significa que funciona y está protegido.
- Si en cambio sale la propia app o un 404, `_worker.js` no se ha subido. La app seguirá funcionando, pero llamará a OSRM y Nominatim directamente desde el móvil.

## Qué hace cada archivo

| Archivo | Para qué |
|---|---|
| `index.html` | La app entera: interfaz, estilos y lógica, sin compilación. |
| `_worker.js` | Proxy propio. `/r/` calcula rutas con OSRM y `/g/` busca direcciones con Nominatim. Solo atiende a la propia web, con caché en Cloudflare. También sirve el manifest con el icono del color elegido. |
| `_routes.json` | Limita el worker a `/r/*`, `/g/*` y el manifest, para que el resto no gaste cuota. |
| `sw.js` | Abre la app al instante y sin conexión. Guarda hasta 900 teselas del mapa ya vistas. |
| `version.txt` | La app lo compara con su versión y ofrece «Actualizar». |
| `manifest*.webmanifest`, `ic/`, `icon-*.png`, `icono.svg` | Instalación e iconos en los 10 colores. |

## Subir una versión nueva

Cambia las tres cosas a la vez:
- `VER` en `index.html`, con el formato `AAAA-MM-DD-N`.
- La misma cadena en `version.txt`.
- `V` en `sw.js` (`rz-v2`, `rz-v3`…).

Después vuelve a subir la carpeta en Cloudflare › el proyecto › Create deployment.

## Coste y límites

Funciona en el plan gratuito de Workers, con 100.000 peticiones al día. Si se supera el límite, el worker da error hasta las 00:00 UTC. En ese caso la app pasa sola a llamar a los servicios directamente o a la distancia estimada. Nunca cobra.

## Dependencias externas

- **OSRM público** (`router.project-osrm.org`): es un servidor de demostración sin garantías. Si falla, las jornadas se guardan como «estimadas» y se recalculan desde el Historial. Las peticiones van espaciadas a 1 por segundo.
- **Nominatim**: su política pide como mucho 1 búsqueda por segundo y un User-Agent identificado. El worker pone el User-Agent y la app espera 600 ms al escribir.
- **Teselas de Esri** y **Leaflet** desde unpkg.
