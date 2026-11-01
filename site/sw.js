// Rutahz — service worker. Si cambias iconos, manifest o index.html, sube el número de V.
const V = 'rz-v4', FONTS = 'rz-fonts', LIBS = 'rz-libs', TILES = 'rz-tiles', MAX_TILES = 900;
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'vendor/leaflet/leaflet.js', 'vendor/leaflet/leaflet.css', 'icono.svg', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png', 'apple-touch-icon.png'];
const KEEP = [V, FONTS, LIBS, TILES];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(V).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => !KEEP.includes(k)).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

// La página: se abre al instante con la copia guardada y, a la vez, se descarga la nueva para la próxima vez.
// La app compara su versión con version.txt y ofrece «Actualizar» cuando hay una nueva.
function page(req, ev) {
  const net = caches.open(V).then(async c => {
    const r = await fetch(req, { cache: 'no-store' });
    if (r.ok) await c.put('index.html', r.clone());
    return r;
  });
  ev.waitUntil(net.catch(() => {}));
  return caches.open(V).then(async c => (await c.match('index.html')) || net.catch(async () => (await c.match('./')) || Response.error()));
}

// Mapa: lo ya visto se queda guardado para verlo sin cobertura (zonas rurales). Máximo MAX_TILES teselas.
let trimming = false;
async function trimTiles() {
  if (trimming) return; trimming = true;
  try { const c = await caches.open(TILES), ks = await c.keys(); for (let i = 0; i < ks.length - MAX_TILES; i++) await c.delete(ks[i]); }
  finally { trimming = false; }
}
function tile(req, ev) {
  return caches.open(TILES).then(async c => {
    const hit = await c.match(req);
    const net = fetch(req).then(r => { if (r.ok && r.type !== 'opaque') { c.put(req, r.clone()).then(() => Math.random() < 0.05 && trimTiles()); } return r; });
    if (hit) { ev.waitUntil(net.catch(() => {})); return hit; }
    return net;
  });
}

function staleFirst(cacheName, req, ev) {
  return caches.open(cacheName).then(async c => {
    const h = await c.match(req);
    const n = fetch(req).then(x => { if (x.ok) c.put(req, x.clone()); return x; });
    if (h) { ev.waitUntil(n.catch(() => {})); return h; }
    return n;
  });
}

self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin === location.origin) {
    if (u.pathname.startsWith('/r/') || u.pathname.startsWith('/t/') || u.pathname.startsWith('/g/') || u.pathname === '/version.txt') return; // siempre por red
    if (r.mode === 'navigate') return e.respondWith(page(r, e));
    // El manifest depende del color con el que se instaló (lo decide _worker.js por la cookie): siempre de la red
    if (u.pathname === '/manifest.webmanifest') return e.respondWith(fetch(r).then(x => { if (x.ok) { const y = x.clone(); caches.open(V).then(c => c.put('manifest.webmanifest', y)); } return x; }).catch(() => caches.match('manifest.webmanifest')));
    return e.respondWith(caches.match(r).then(h => h || fetch(r)));
  }
  if (u.hostname === 'server.arcgisonline.com' && u.pathname.includes('/tile/')) return e.respondWith(tile(r, e));
  if (u.hostname === 'unpkg.com') return e.respondWith(staleFirst(LIBS, r, e));
  if (/(^|\.)fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return e.respondWith(staleFirst(FONTS, r, e));
});
