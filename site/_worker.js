// Rutahz — Cloudflare Pages (modo avanzado: _worker.js).
//
//   /r/<lon,lat;lon,lat;…>      → cálculo de ruta por carretera (OSRM público)
//   /t/<lon,lat;…>[?end=last]    → orden de paradas con menos km (OSRM trip)
//   /g/search?q=…               → buscar direcciones (Nominatim / OpenStreetMap)
//   /g/reverse?lat=…&lon=…      → dirección de un punto del mapa (Nominatim)
//   /g/photon?q=…               → buscar direcciones con Photon (mismos datos, tolera erratas y palabras a medias)
//   /manifest.webmanifest       → manifest con el icono del color con el que se instaló la app
//   Todo lo demás lo sirve Pages como archivos estáticos (env.ASSETS) y no gasta cuota (_routes.json).
//
// Por qué un proxy propio:
//   · Los servicios externos ven la IP de Cloudflare, no la del móvil de cada usuario.
//   · Nominatim exige un User-Agent que identifique la app (su política de uso); desde el navegador no se puede poner.
//   · Caché en el borde: repetir una ruta o una búsqueda no vuelve a molestar a OSRM ni a Nominatim.
//   · Solo reenvía a esos servicios (OSRM, Nominatim y Photon) y solo los parámetros previstos: no es un proxy abierto.
//
// Coste: pensado para el plan gratuito (100.000 peticiones al día). Si se supera, Cloudflare da error hasta las
// 00:00 UTC y la app pasa sola a la distancia aproximada o a llamar a los servicios directamente; nunca cobra.

const UA_BASE = 'Rutahz/2.0';
const TIMEOUT_MS = 12000;
const ROUTE_TTL = 60 * 60 * 24 * 7;   // una ruta entre los mismos puntos casi nunca cambia: 7 días
const GEO_TTL = 60 * 60 * 24 * 30;    // direcciones: 30 días

const txt = (s, status, extra = {}) =>
  new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Rz': '1', ...extra } });

// Solo desde la propia web (evita que otros usen el proxy y gasten la cuota)
function sameOrigin(req, url) {
  const sfs = req.headers.get('Sec-Fetch-Site');
  if (sfs) return sfs === 'same-origin';
  const o = req.headers.get('Origin') || req.headers.get('Referer');
  try { return !!o && new URL(o).host === url.host; } catch { return false; }
}

const NUM = '-?\\d{1,3}(?:\\.\\d{1,8})?';
const COORDS_RE = new RegExp(`^${NUM},${NUM}(?:;${NUM},${NUM}){1,39}$`); // de 2 a 40 puntos

async function upstream(target, url, ttl) {
  let r;
  try {
    r = await fetch(target, {
      headers: {
        'User-Agent': `${UA_BASE} (+https://${url.host})`,
        'Accept': 'application/json',
        'Accept-Language': 'es,ca;q=0.8,en;q=0.5',
        'Referer': `https://${url.host}/`,
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cf: { cacheEverything: true, cacheTtlByStatus: { '200-299': ttl, '300-599': 0 } },
    });
  } catch (e) {
    return txt('No se pudo contactar: ' + (e && e.name === 'TimeoutError' ? 'tiempo agotado' : 'error de red'), 504);
  }
  if (!r.ok) return txt('Origen respondió ' + r.status, r.status, { 'X-Origin-Status': String(r.status) });
  return new Response(r.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, max-age=300',
      'X-Content-Type-Options': 'nosniff',
      'X-Rz': '1', // «respondió nuestro proxy»: sin esta marca la app sabe que el fallo es de Cloudflare
    },
  });
}

function route(url) {
  const coords = decodeURIComponent(url.pathname.slice(3));
  if (!COORDS_RE.test(coords)) return txt('Coordenadas no válidas', 400);
  const target = `https://router.project-osrm.org/route/v1/driving/${coords}?overview=full&geometries=geojson&steps=false`;
  return upstream(target, url, ROUTE_TTL);
}

// Orden óptimo de las paradas (problema del viajante de OSRM). end=last: termina en la última parada; si no, vuelve al inicio.
function trip(url) {
  const coords = decodeURIComponent(url.pathname.slice(3));
  if (!COORDS_RE.test(coords)) return txt('Coordenadas no válidas', 400);
  const q = url.searchParams.get('end') === 'last' ? 'source=first&destination=last&roundtrip=false' : 'source=first&roundtrip=true';
  return upstream(`https://router.project-osrm.org/trip/v1/driving/${coords}?${q}&overview=false`, url, ROUTE_TTL);
}

// Solo se reenvían estos parámetros, con estos formatos
const GEO_PARAMS = {
  search: { q: /^.{1,200}$/s, limit: /^\d{1,2}$/, viewbox: /^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/, bounded: /^[01]$/, countrycodes: /^[a-z]{2}(,[a-z]{2})*$/, addressdetails: /^[01]$/ },
  reverse: { lat: /^-?\d{1,3}(\.\d{1,8})?$/, lon: /^-?\d{1,3}(\.\d{1,8})?$/, zoom: /^\d{1,2}$/, addressdetails: /^[01]$/ },
  photon: { q: /^.{1,200}$/s, limit: /^\d{1,2}$/, lat: /^-?\d{1,3}(\.\d{1,8})?$/, lon: /^-?\d{1,3}(\.\d{1,8})?$/, location_bias_scale: /^(0(\.\d{1,2})?|1)$/, bbox: /^-?[\d.]+,-?[\d.]+,-?[\d.]+,-?[\d.]+$/ },
};
// Nominatim estructurada (calle y pueblo por separado), para cuando la búsqueda normal no encuentra la calle
GEO_PARAMS.search.street = /^.{1,120}$/s; GEO_PARAMS.search.city = /^.{1,80}$/s;
function geo(url) {
  const kind = url.pathname === '/g/search' ? 'search' : url.pathname === '/g/reverse' ? 'reverse' : url.pathname === '/g/photon' ? 'photon' : null;
  if (!kind) return txt('Ruta no válida', 400);
  const allowed = GEO_PARAMS[kind], out = new URLSearchParams(kind === 'photon' ? {} : { format: 'jsonv2' });
  for (const [k, re] of Object.entries(allowed)) {
    const v = url.searchParams.get(k);
    if (v == null || v === '') continue;
    if (!re.test(v)) return txt('Parámetro no válido: ' + k, 400);
    out.set(k, v);
  }
  if ((kind === 'search' && !out.get('q') && !out.get('street')) || (kind === 'photon' && !out.get('q'))) return txt('Falta la búsqueda', 400);
  if (kind === 'photon') return upstream(`https://photon.komoot.io/api/?${out}`, url, GEO_TTL);
  if (kind === 'reverse' && !(out.get('lat') && out.get('lon'))) return txt('Faltan coordenadas', 400);
  return upstream(`https://nominatim.openstreetmap.org/${kind}?${out}`, url, GEO_TTL);
}

// Icono de la app instalada según el color: la página guarda el color en la cookie rz_ic mientras la app NO está
// instalada y la congela al instalarla. Aquí se sirve, en la dirección de siempre, el manifest de ese color.
const COLORS = ['turquesa', 'azul', 'indigo', 'violeta', 'rosa', 'coral', 'naranja', 'ambar', 'grafito'];
async function manifest(req, url, env) {
  const m = (req.headers.get('Cookie') || '').match(/(?:^|;\s*)rz_ic=([a-z]+)/);
  const k = m && COLORS.includes(m[1]) ? m[1] : '';
  const r = await env.ASSETS.fetch(new Request(new URL(k ? `/manifest-${k}.webmanifest` : '/manifest.webmanifest', url), req));
  const h = new Headers(r.headers);
  h.set('Content-Type', 'application/manifest+json');
  h.set('Cache-Control', 'no-cache');
  h.set('Vary', 'Cookie');
  return new Response(r.body, { status: r.status, headers: h });
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname === '/manifest.webmanifest') return manifest(req, url, env);
    const isApi = url.pathname.startsWith('/r/') || url.pathname.startsWith('/g/') || url.pathname.startsWith('/t/');
    if (isApi) {
      if (req.method !== 'GET') return txt('Método no permitido', 405, { Allow: 'GET' });
      if (!sameOrigin(req, url)) return txt('Solo desde la propia web', 403);
      try { return url.pathname.startsWith('/r/') ? await route(url) : url.pathname.startsWith('/t/') ? await trip(url) : await geo(url); }
      catch (e) { return txt('Error interno del proxy', 502); }
    }
    return env.ASSETS.fetch(req);
  },
};
