// Prueba de humo: abre la app en móvil y PC, crea el PIN, fija un inicio y añade dos paradas.
// El worker no corre aquí (servidor estático), así que /r/ y /g/ se simulan.
const { chromium, devices } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const SITE = path.join(__dirname, '..', 'site');
const srv = http.createServer((q, s) => { const f = path.join(SITE, decodeURIComponent(q.url.split('?')[0]).replace(/\/$/, '/index.html')); fs.readFile(f, (e, b) => { if (e) { s.writeHead(404); return s.end(); } const T = { html: 'text/html', js: 'application/javascript', css: 'text/css', svg: 'image/svg+xml', png: 'image/png', json: 'application/json', webmanifest: 'application/manifest+json' }; s.writeHead(200, { 'Content-Type': T[f.split('.').pop()] || 'application/octet-stream' }); s.end(b); }); });
const fail = m => { console.error('FALLO:', m); process.exit(1); };
srv.listen(0, async () => {
  const BASE = `http://127.0.0.1:${srv.address().port}/`, errors = [];
  const browser = await chromium.launch();
  for (const [name, opts] of [['móvil', devices['iPhone 13']], ['PC', { viewport: { width: 1366, height: 860 } }]]) {
    const ctx = await browser.newContext({ ...opts, serviceWorkers: 'block', locale: 'es-ES' });
    await ctx.route(BASE + 'r/**', r => { const c = decodeURIComponent(new URL(r.request().url()).pathname.slice(3)).split(';').map(p => p.split(',').map(Number)); const legs = c.slice(1).map(() => ({ distance: 10000, duration: 900 })); r.fulfill({ contentType: 'application/json', headers: { 'X-Rz': '1' }, body: JSON.stringify({ code: 'Ok', routes: [{ distance: 10000 * legs.length, duration: 900 * legs.length, legs, geometry: { coordinates: c } }] }) }); });
    await ctx.route(BASE + 'g/**', r => r.fulfill({ contentType: 'application/json', headers: { 'X-Rz': '1' }, body: '[]' }));
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await page.goto(BASE + 'index.html');
    await page.waitForSelector('#lock:not([hidden])', { timeout: 15000 });
    for (let i = 0; i < 2; i++) for (const k of '1234') await page.click(`#lockKp button[data-k="${k}"]`);
    await page.waitForSelector('.dlg'); await page.click('.dlg .acts button:has-text("Empezar de cero")');
    await page.waitForSelector('.dlg'); await page.click('.dlg .acts button:has-text("Entendido")');
    await page.fill('#startQ', 'Palma'); await page.click('#startSug button:has-text("Palma")');
    for (const t of ['Inca', 'Manacor']) { await page.fill('#stopQ', t); await page.click(`#stopSug button:has-text("${t}")`); }
    await page.waitForFunction(() => document.querySelector('#kmV').textContent === '30,0', null, { timeout: 8000 }).catch(() => fail(`${name}: km esperados 30,0 (2 paradas + vuelta), hay ${'?'}`));
    console.log(`${name}: OK`);
    await ctx.close();
  }
  await browser.close(); srv.close();
  if (errors.length) fail(errors.join('\n'));
  console.log('Prueba de humo superada');
});
