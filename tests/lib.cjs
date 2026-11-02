// Utilidades comunes de las pruebas: servidor de site/, simulación de servicios externos, datos de partida y PIN.
const http = require('http'), fs = require('fs'), path = require('path');

let pw;
try { pw = require('playwright'); } catch (e) { pw = require('/opt/npm-tools/node_modules/playwright'); }
const { chromium, devices } = pw;

const SITE = path.join(__dirname, '..', 'site');
const MIME = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', json: 'application/json', webmanifest: 'application/manifest+json', txt: 'text/plain' };
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const PIN = '1234';

// Servidor estático de site/. `version` permite simular que hay una versión publicada más nueva.
function serve() {
  return new Promise(res => {
    const st = { version: null, pageVer: null, files: {} }; // files: contenido alternativo por ruta (p. ej. un sw.js antiguo) // pageVer: sirve index.html como si fuera esa versión (prueba con service worker)
    const srv = http.createServer((q, s) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      if (u === '/version.txt' && st.version) { s.writeHead(200, { 'Content-Type': 'text/plain' }); return s.end(st.version + '\n'); }
      if (st.files[u] != null) { s.writeHead(200, { 'Content-Type': (u.endsWith('/') ? 'text/html' : MIME[u.split('.').pop()] || 'text/plain') }); return s.end(st.files[u]); }
      const f = path.join(SITE, u.replace(/\/$/, '/index.html'));
      if (!f.startsWith(SITE)) { s.writeHead(403); return s.end(); }
      fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } if (st.pageVer && f.endsWith('index.html')) b = b.toString().replace(/const VER = '[^']+'/, `const VER = '${st.pageVer}'`); s.writeHead(200, { 'Content-Type': MIME[f.split('.').pop()] || 'application/octet-stream' }); s.end(b); });
    });
    srv.listen(0, '127.0.0.1', () => res({ base: `http://127.0.0.1:${srv.address().port}/`, st, close: () => srv.close() }));
  });
}

const launch = () => chromium.launch(process.env.PW_CHROME ? { executablePath: process.env.PW_CHROME } : {});

const hav = (a, b) => { const R = 6371, t = x => x * Math.PI / 180, dLa = t(b[1] - a[1]), dLo = t(b[0] - a[0]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a[1])) * Math.cos(t(b[1])) * Math.sin(dLo / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
const coordsOf = u => decodeURIComponent(new URL(u).pathname.slice(3)).split(';').map(p => p.split(',').map(Number));
const json = (r, body) => r.fulfill({ contentType: 'application/json', headers: { 'X-Rz': '1' }, body: JSON.stringify(body) });

// Contexto de navegador con los servicios simulados.
//  leg(a, b, i) → { distance (m), duration (s) } de cada tramo; por defecto 10 km y 10 min.
//  seed → { data, meta, pf } que se escriben en localStorage una sola vez por pestaña.
//  geo → resultados de búsqueda (/g/search); por defecto ninguno (la app usa su lista de pueblos).
async function context(browser, base, o = {}) {
  const ctx = await browser.newContext({ ...(o.device || devices['iPhone 13']), serviceWorkers: o.sw ? 'allow' : 'block', locale: 'es-ES', timezoneId: 'Europe/Madrid', acceptDownloads: true });
  const leg = o.leg || (() => ({ distance: 10000, duration: 600 }));
  ctx.calls = { r: 0, t: 0 };
  // En iPhone, salvo que la prueba quiera Safari, se simula la app instalada (en Safari sale el aviso de instalar antes)
  if (/iPhone|iPad/.test((o.device || devices['iPhone 13']).userAgent || '') && !o.iosSafari) await ctx.addInitScript(() => { Object.defineProperty(navigator, 'standalone', { get: () => true }); });
  await ctx.route(/fonts\.(googleapis|gstatic)/, r => r.fulfill({ status: 204 }));
  await ctx.route(/arcgisonline/, r => r.fulfill({ contentType: 'image/png', body: PNG, headers: { 'access-control-allow-origin': '*' } }));
  await ctx.route(base + 'r/**', r => {
    ctx.calls.r++; const c = coordsOf(r.request().url()), legs = [];
    for (let i = 1; i < c.length; i++) legs.push(leg(c[i - 1], c[i], i - 1));
    json(r, { code: 'Ok', routes: [{ distance: legs.reduce((a, l) => a + l.distance, 0), duration: legs.reduce((a, l) => a + l.duration, 0), legs, geometry: { coordinates: c } }] });
  });
  await ctx.route(base + 't/**', r => { // «óptimo» simulado: vecino más cercano desde el inicio
    ctx.calls.t++; const c = coordsOf(r.request().url()), left = c.slice(1).map((p, i) => i + 1), ord = [0]; let cur = c[0];
    while (left.length) { left.sort((a, b) => hav(cur, c[a]) - hav(cur, c[b])); const n = left.shift(); ord.push(n); cur = c[n]; }
    json(r, { code: 'Ok', waypoints: c.map((p, i) => ({ waypoint_index: ord.indexOf(i) })), trips: [{}] });
  });
  await ctx.route(base + 'g/**', r => {
    const u = new URL(r.request().url());
    if (u.pathname === '/g/reverse') return json(r, { display_name: 'Carrer Major, Sóller', address: { road: 'Carrer Major', town: 'Sóller' } });
    (ctx.geoQ = ctx.geoQ || []).push(u.searchParams.get('q'));
    json(r, typeof o.geo === 'function' ? o.geo(u.searchParams.get('q'), u) : (o.geo || []));
  });
  if (o.seed) await ctx.addInitScript(s => {
    try { if (!sessionStorage.getItem('rzSeed')) { for (const k of Object.keys(s)) localStorage.setItem(k, JSON.stringify(s[k])); sessionStorage.setItem('rzSeed', '1'); } } catch (e) {}
  }, o.seed);
  if (o.share) await ctx.addInitScript(() => { // Web Share como Chrome Android: comparte .txt pero no .json
    navigator.canShare = x => !!(x && x.files && x.files.every(f => /\.txt$/.test(f.name)));
    navigator.share = async x => { window.__shared = x.files.map(f => f.name + ' ' + f.type); };
  });
  return ctx;
}

async function page(ctx) {
  const p = await ctx.newPage(); p.errors = [];
  p.on('pageerror', e => p.errors.push(e.message));
  p.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) p.errors.push(m.text()); });
  return p;
}

// Teclea el PIN (dos veces si es nuevo) y cierra el primer diálogo si sale.
async function unlock(p, { create = false, dismiss = true } = {}) {
  await p.waitForSelector('#lock:not([hidden])', { timeout: 15000 });
  for (let i = 0; i < (create ? 2 : 1); i++) for (const k of PIN) await p.click(`#lockKp button[data-k="${k}"]`);
  await p.waitForSelector('#lock', { state: 'hidden', timeout: 5000 });
  if (dismiss) { await p.waitForTimeout(300); if (await p.isVisible('.dlg')) await p.click('.dlg .acts button >> nth=-1'); }
}

// Datos de partida en el formato de la app (versión 2).
const SET = { cpk: 0.26, rf: 1.25, ret: true, unl: false, shN: true, shM: true, shT: false, al: 0, tf: 1.15, pm: 2 };
const P = (lat, lon, label, cid) => ({ lat, lon, label, cid: cid || null });
const OFFICE = P(39.5696, 2.6502, 'Oficina');
const day = (id, iso, stops, extra = {}) => ({ id, label: 'Ruta del ' + Number(iso.slice(8)), iso, start: { ...OFFICE, time: '08:10' }, stops, ret: true,
  legs: stops.map(() => 9).concat([9]), legsDur: stops.map(() => 10).concat([10]), notes: '',
  tot: { road: 9 * (stops.length + 1), dur: 40, durRaw: 30, tf: 1.15, pm: 2, durM: null, cost: 5, cpk: 0.26, src: 'road', straight: 20 }, ...extra });
const data = (x = {}) => ({ v: 2, cur: { start: { ...OFFICE, time: '' }, stops: [], notes: '', ret: true }, hist: [], fav: { ...OFFICE }, clients: [], edit: null, set: { ...SET }, ...x });
// Avisos ya vistos para que no salgan banners (instalar, copia) ni novedades, salvo que la prueba lo pida.
const meta = (sv, x = {}) => ({ fu: '2026-10-01', lb: '2026-11-01', iz: Date.now() + 9e9, bz: Date.now() + 9e9, tapHint: 1, ...(sv ? { sv } : {}), ...x });

const VER = (fs.readFileSync(path.join(SITE, 'index.html'), 'utf8').match(/const VER = '([^']+)'/) || [])[1];

module.exports = { chromium, devices, serve, launch, context, page, unlock, data, meta, day, P, OFFICE, SET, VER, PIN, hav };
