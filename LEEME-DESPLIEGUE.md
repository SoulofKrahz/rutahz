# Rutahz 2.0 — Despliegue en Cloudflare Pages

Versión: `2026-11-02-0` · Service worker: `rz-v5`

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
| `_worker.js` | Proxy propio. `/r/` calcula rutas con OSRM, `/t/` busca el orden de paradas con menos km y `/g/` busca direcciones con Nominatim. Solo atiende a la propia web, con caché en Cloudflare. También sirve el manifest con el icono del color elegido. |
| `_routes.json` | Limita el worker a `/r/*`, `/t/*`, `/g/*` y el manifest, para que el resto no gaste cuota. |
| `sw.js` | Abre la app al instante y sin conexión. Guarda hasta 900 teselas del mapa ya vistas. |
| `version.txt` | La app lo compara con su versión y ofrece «Actualizar». |
| `manifest*.webmanifest`, `ic/`, `icon-*.png`, `icono.svg` | Instalación e iconos en los 10 colores. |

## Subir una versión nueva

1. Cambia el código en `tools/src/` (nunca `site/index.html` a mano) y ejecuta `sh tools/build.sh`, que une los trozos en `site/index.html` y escribe `site/version.txt`.
2. Sube `VER` en `tools/src/app1.js` (formato `AAAA-MM-DD-N`) y añade su entrada arriba de `NEWS` en `app4.js`, con la misma versión. Si cambian archivos que guarda el service worker, sube también `V` en `site/sw.js`.
3. Prueba en local: `node tests/suite.cjs` (con Playwright instalado; si usas tu Chrome, `PW_CHROME=/ruta/a/chrome`). `VERBOSE=1` muestra cada comprobación y `node tests/suite.cjs tiempos` lanza solo las que contienen esa palabra.
4. Haz push a `main`. GitHub Actions pasa las pruebas; si alguna falla, no publica. Si pasan, publica en Cloudflare y comprueba que `version.txt` sirve la versión nueva; si no, publica otra vez.

### Qué comprueban las pruebas (`tests/suite.cjs`)

Abren la app en Chromium con los servicios externos simulados (OSRM, Nominatim, teselas), así que no dependen de internet.

| Prueba | Comprueba |
|---|---|
| humo | Primer uso en móvil y PC: PIN nuevo, inicio y dos paradas dan 30,0 km |
| tiempos | 30 min × 1,15 + 3 × 2 = 41 min; tramo de 14 min; guardar con tiempo real; calibrar ×1,44 → 1,45; Excel e informe |
| destinos y ordenar | Crear destinos por búsqueda y en el mapa, planificar 4, Ordenar acorta la ruta, la visita cuenta |
| paradas repetidas en el mapa | Pin «1 · 3» al volver a una parada y aviso «Vuelves a la parada 1» |
| ver jornada en el mapa | Vista de solo lectura en móvil y PC, sin tocar la ruta en curso; Atrás vuelve al historial |
| actualización | Aviso en la pantalla del PIN, no pide el PIN dos veces, la siguiente apertura sí |
| actualización con service worker | Con la app guardada por el service worker, un solo «Actualizar» carga la versión publicada y el aviso no vuelve |
| copias y novedades | Enviar .txt, descargar .json, restaurar .txt, importar copia de la versión 1, novedades una sola vez |
| visitas pulsables | Desde Destinos y Resumen una visita abre su jornada |
| móvil táctil | iPhone SE y Pixel 7: ningún campo con letra < 16 px (zoom en iPhone) ni botón < 40 px |

Cualquier error de JavaScript en la página también hace fallar la prueba.

## Coste y límites

Funciona en el plan gratuito de Workers, con 100.000 peticiones al día. Si se supera el límite, el worker da error hasta las 00:00 UTC. En ese caso la app pasa sola a llamar a los servicios directamente o a la distancia estimada. Nunca cobra.

## Dependencias externas

- **OSRM público** (`router.project-osrm.org`): es un servidor de demostración sin garantías. Si falla, las jornadas se guardan como «estimadas» y se recalculan desde el Historial. Las peticiones van espaciadas a 1 por segundo.
- **Nominatim**: su política pide como mucho 1 búsqueda por segundo y un User-Agent identificado. El worker pone el User-Agent y la app espera 600 ms al escribir.
- **Teselas de Esri**. Leaflet va incluido en `vendor/` (no depende de unpkg, que también está en Cloudflare).

## Bloqueos de LaLiga

Durante los partidos, los operadores españoles bloquean IP de Cloudflare y la web puede no abrir desde casa. Con la app instalada y abierta antes, se abre igual desde la copia guardada; los cálculos pasan solos a los servicios directos si el proxy no responde en 7 s. La solución definitiva es un dominio propio fuera de las IP bloqueadas, o esperar al final del partido.

## Cómo se calcula el tiempo al volante

- **Estimado** = tiempo de OSRM (velocidad de la vía, sin tráfico) × *factor de tráfico* + *minutos por llegada* × nº de llegadas (paradas + vuelta). Por defecto ×1,15 y 2 min; se cambia en Ajustes › General › Tiempo al volante.
- Cada jornada guarda el tiempo bruto de OSRM, el factor y los minutos con los que se calculó: cambiar los ajustes no altera el historial salvo que se pulse «Aplicar al historial» (se puede deshacer).
- **Real**: se puede anotar al guardar la jornada o después (Historial › jornada). Si existe, es el que sale en el resumen, el informe y el Excel, marcado «real».
- **Calibrar** calcula el factor que mejor reproduce los tiempos reales anotados: (Σ real − llegadas × minutos) ÷ Σ OSRM. Con 3–5 jornadas ya es fiable.
- El informe explica al pie qué tiempos son reales y con qué ajustes se estimaron los demás.
