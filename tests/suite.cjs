// Pruebas de Rutahz. Se ejecutan antes de cada publicación (deploy.yml); si una falla, no se publica.
//   node tests/suite.cjs            → todas
//   node tests/suite.cjs tiempos    → solo las que contienen «tiempos» en el nombre
// En local: PW_CHROME=/ruta/a/chrome node tests/suite.cjs
const fs = require('fs'), path = require('path');
const L = require('./lib.cjs');
const { devices, data, meta, day, P, OFFICE, VER } = L;

const results = [];
let cur = null;
const ok = (c, msg) => { cur.checks.push([!!c, msg]); if (!c) cur.fail = true; };
const T = [];
const test = (name, fn) => T.push([name, fn]);
const marks = p => p.$$eval('.leaflet-marker-icon .pin', e => e.map(x => x.textContent.trim() || 'inicio'));

/* 1 · Prueba de humo: primer uso en móvil y PC, PIN nuevo, inicio y dos paradas */
test('humo', async ({ browser, base }) => {
  for (const [nm, dev] of [['móvil', devices['iPhone 13']], ['PC', { viewport: { width: 1366, height: 860 } }]]) {
    const ctx = await L.context(browser, base, { device: dev }), p = await L.page(ctx);
    await p.goto(base); await L.unlock(p, { create: true, dismiss: false });
    await p.click('.dlg .acts button:has-text("Empezar de cero")'); await p.click('.dlg .acts button:has-text("Entendido")');
    await p.fill('#startQ', 'Palma'); await p.click('#startSug button:has-text("Palma")');
    for (const t of ['Inca', 'Manacor']) { await p.fill('#stopQ', t); await p.click(`#stopSug button:has-text("${t}")`); }
    const km = await p.waitForFunction(() => document.querySelector('#kmV').textContent === '30,0', null, { timeout: 8000 }).then(() => '30,0').catch(() => p.textContent('#kmV'));
    ok(km === '30,0', `${nm}: 2 paradas + vuelta = 30,0 km → ${km}`);
    ok(!p.errors.length, `${nm}: sin errores de JavaScript ${p.errors.join(' | ')}`);
    await ctx.close();
  }
});

/* 2 · Tiempo al volante: fórmula, tiempo real, calibración, Excel */
test('tiempos', async ({ browser, base }) => {
  const ctx = await L.context(browser, base, { seed: { rz_meta: { iz: Date.now() + 9e9, bz: Date.now() + 9e9 } } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true, dismiss: false });
  await p.click('.dlg .acts button:has-text("Empezar de cero")'); await p.click('.dlg .acts button:has-text("Entendido")');
  await p.fill('#startQ', 'Palma'); await p.click('#startSug button:has-text("Palma")'); await p.click('#startFav');
  for (const t of ['Inca', 'Manacor']) { await p.fill('#stopQ', t); await p.click(`#stopSug button:has-text("${t}")`); }
  await p.waitForTimeout(500);
  // 3 tramos de 10 min: 30 × 1,15 + 3 llegadas × 2 = 40,5 → 41 min
  ok(await p.textContent('#durV') === '41 min', 'resumen 41 min → ' + await p.textContent('#durV'));
  ok((await p.textContent('#stopsList [data-seg="0"]')).includes('14 min'), 'tramo 10 × 1,15 + 2 = 14 min');
  await p.click('#bSave'); await p.waitForSelector('#jth'); await p.fill('#jtm', '52'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(300);
  const j0 = await p.evaluate(() => __rz.D.hist[0].tot);
  ok(j0.durM === 52 && Math.round(j0.dur) === 41 && j0.durRaw === 30 && j0.tf === 1.15 && j0.pm === 2, `jornada guardada con real 52 y estimado 41 → ${JSON.stringify(j0)}`);
  await p.fill('#stopQ', 'Inca'); await p.click('#stopSug button:has-text("Inca")'); await p.waitForTimeout(400);
  await p.click('#bSave'); await p.waitForSelector('#jth'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(300);
  await p.click('.bb button[data-v="hist"]'); await p.click('.hi >> nth=0'); await p.waitForSelector('.am');
  await p.click('.amb:has-text("Anotar el tiempo real")'); await p.waitForSelector('#rth'); await p.fill('#rtm', '30'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(300);
  // (52 − 3×2) + (30 − 2×2) = 72 / (30 + 20) = 1,44
  await p.click('.bb button[data-v="ajustes"]'); await p.click('#bCal'); await p.waitForSelector('.dlg');
  const cal = await p.textContent('.dlg p'); ok(cal.includes('×1,44'), 'calibración ×1,44 → ' + cal.replace(/\s+/g, ' ').slice(0, 120));
  await p.click('.dlg .acts button:has-text("Usar")'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __rz.D.set.tf) === 1.45, 'factor redondeado a ×1,45');
  await p.click('.bb button[data-v="hist"]'); await p.click('#bExport'); await p.waitForSelector('#exP');
  await p.click('[data-c="salida"]'); await p.click('[data-c="det"]');
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('.dlg .acts button:has-text("Excel")')]);
  const csv = dl ? fs.readFileSync(await dl.path(), 'utf8') : '';
  ok(csv.includes(';0:52;52;Real;41;') && csv.includes('TOTAL'), 'Excel con tiempo real, estimado y total');
  await p.click('#bExport'); await p.waitForSelector('#exP'); await p.evaluate(() => { window.print = () => {}; });
  await p.click('.dlg .acts button:has-text("Informe")'); await p.waitForTimeout(300);
  ok((await p.textContent('#print')).includes('TOTAL') || (await p.textContent('#print')).length > 200, 'informe imprimible generado');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 3 · Destinos: crear por búsqueda y mapa, planificar, ordenar, contar visitas */
test('destinos y ordenar', async ({ browser, base }) => {
  const ctx = await L.context(browser, base, {
    device: devices['Pixel 7'], seed: { rz_meta: meta(VER) }, leg: (a, b) => { const d = L.hav(a, b) * 1300; return { distance: d, duration: d / 12 }; },
    geo: [{ lat: '39.4897', lon: '2.8917', name: '', display_name: 'Carrer de Sant Bartomeu, 5, Llucmajor', address: { road: 'Carrer de Sant Bartomeu', house_number: '5', town: 'Llucmajor' } }] }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true, dismiss: false });
  if (await p.isVisible('.dlg')) await p.click('.dlg .acts button:has-text("Empezar de cero")');
  if (await p.isVisible('.dlg')) await p.click('.dlg .acts button >> nth=-1');
  await p.fill('#startQ', 'Palma'); await p.click('#startSug button:has-text("Palma")');
  await p.click('.bb button[data-v="dest"]');
  const add = async (q, name) => { await p.click('#bDestNew'); await p.fill('#ndQ', q); await p.waitForTimeout(800); await p.click(`#ndS button:has-text("${q}") >> nth=0`); await p.waitForSelector('#pv'); await p.fill('#pv', name); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(250); };
  await add('Sant Bartomeu', 'Casa de M.'); await add('Inca', 'Casa de J.'); await add('Manacor', 'Centro de día'); await add('Sóller', 'Casa de P.');
  await p.click('#bDestNew'); await p.click('#ndMap'); await p.waitForTimeout(700); await p.click('#pickOk'); await p.waitForSelector('#pv'); await p.fill('#pv', 'Residencia'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(300);
  ok(await p.locator('.dr').count() === 5, '5 destinos creados (4 por búsqueda y 1 en el mapa) → ' + await p.locator('.dr').count());
  await p.click('#dsGo');
  for (const n of ['Centro de día', 'Casa de P.', 'Casa de M.', 'Casa de J.']) await p.click(`.dr:has-text("${n}") .ck`);
  await p.click('#dsOk'); await p.waitForTimeout(700);
  const kmB = parseFloat((await p.textContent('#kmV')).replace(',', '.')), ordB = await p.$$eval('#stopsList .pt[data-id] .nm', e => e.map(x => x.value));
  ok(ordB.length === 4, '4 paradas planificadas desde Destinos');
  await p.click('#bOpt'); await p.click('.dlg .acts button:has-text("Ordenar")'); await p.waitForTimeout(1200);
  const kmA = parseFloat((await p.textContent('#kmV')).replace(',', '.')), ordA = await p.$$eval('#stopsList .pt[data-id] .nm', e => e.map(x => x.value));
  ok(ctx.calls.t >= 1 && ordA.join() !== ordB.join() && kmA < kmB, `Ordenar acorta la ruta: ${kmB} → ${kmA} km`);
  await p.click('#bSave'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(400);
  await p.click('.bb button[data-v="dest"]'); await p.click('.dr:has-text("Casa de J.") .bd'); await p.waitForSelector('.am');
  await p.click('.amb:has-text("Ver sus visitas")'); await p.waitForSelector('.vit');
  ok(await p.locator('.vit').count() === 1, 'la jornada guardada cuenta como 1 visita');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 4 · Mapa: una parada repetida no se esconde bajo otra */
test('paradas repetidas en el mapa', async ({ browser, base }) => {
  const H = P(39.5813, 2.6779, 'Carrer de Hiroshima, 50, Palma');
  const d = data({ cur: { start: { ...P(39.4897, 2.8917, "Carrer d'Es Marroig, Llucmajor"), time: '' }, stops: [{ id: 'a', ...H }, { id: 'b', ...P(39.5745, 2.6588, 'Carrer de las Navas de Tolosa, Palma') }, { id: 'c', ...H, lat: 39.58131, lon: 2.67791 }], notes: '', ret: true }, fav: null });
  const ctx = await L.context(browser, base, { device: devices['Galaxy S9+'], seed: { rz_data: d, rz_meta: meta(VER) } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true }); await p.waitForTimeout(900);
  const m0 = await marks(p);
  ok(m0.some(t => /1 · (2 · )?3/.test(t)), 'parada 1 y 3 juntas en un mismo pin → ' + m0.join(' | '));
  await p.click('.leaflet-marker-icon .pin.m'); await p.waitForTimeout(900);
  const m1 = await marks(p);
  ok(m1.includes('1 · 3') && m1.includes('2'), 'al tocar el grupo se separa en «1 · 3» y «2» → ' + m1.join(' | '));
  ok((await p.textContent('#stopsList')).includes('Vuelves a la parada 1'), 'la lista avisa «Vuelves a la parada 1»');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 5 · Ver una jornada del historial en el mapa y volver con Atrás */
test('ver jornada en el mapa', async ({ browser, base }) => {
  const H = P(39.5813, 2.6779, 'Casa de M.'), j = day('h1', '2026-11-02', [{ ...H }, P(39.5745, 2.6588, 'Casa de J.'), { ...H }]);
  for (const [nm, dev, nav] of [['móvil', devices['Galaxy S9+'], '.bb'], ['PC', { viewport: { width: 1280, height: 800 } }, '.tabs']]) {
    const ctx = await L.context(browser, base, { device: dev, seed: { rz_data: data({ hist: [j] }), rz_meta: meta(VER) } }), p = await L.page(ctx);
    await p.goto(base); await L.unlock(p, { create: true });
    await p.click(nav + ' button[data-v="hist"]'); await p.click('.hi'); await p.click('.amb:has-text("Ver en el mapa")'); await p.waitForTimeout(900);
    ok(await p.isVisible('#v-ver') && await p.locator('#verBox .pt.vr').count() >= 4, `${nm}: abre la vista de la jornada con su recorrido`);
    ok((await marks(p)).some(t => t.includes('1 · 3')), `${nm}: el mapa muestra la parada repetida`);
    ok(await p.locator('#stopsList .pt[data-id]').count() === 0, `${nm}: no toca la ruta en curso`);
    await p.click('#verBox .pt.vr[data-i="1"]'); await p.waitForTimeout(400);
    await p.goBack(); await p.waitForTimeout(400);
    ok(await p.isVisible('#v-hist'), `${nm}: Atrás vuelve al historial`);
    ok(!p.errors.length, `${nm}: sin errores de JavaScript ${p.errors.join(' | ')}`);
    await ctx.close();
  }
});

/* 6 · Actualización: aviso antes del PIN y sin pedirlo dos veces */
test('actualización', async ({ browser, base, st }) => {
  st.version = '2099-01-01-0';
  try {
    const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_meta: meta(VER) } }), p = await L.page(ctx);
    await p.goto(base); await L.unlock(p, { create: true, dismiss: false }); await p.waitForTimeout(300);
    while (await p.isVisible('.dlg')) { await p.click('.dlg .acts button >> nth=-1'); await p.waitForTimeout(200); }
    await p.reload(); await p.waitForSelector('#lock:not([hidden])'); await p.waitForSelector('#lockUpd:not([hidden])', { timeout: 5000 }).catch(() => {});
    ok(await p.isVisible('#lockUpd'), 'la pantalla del PIN avisa de la versión nueva');
    await Promise.all([p.waitForNavigation(), p.click('#lockUpd')]); await p.waitForTimeout(400);
    ok(await p.isVisible('#lock'), 'actualizar desde el PIN pide el PIN una sola vez');
    await L.unlock(p, { dismiss: false }); await p.waitForTimeout(400);
    ok(await p.isVisible('#banner'), 'dentro de la app sale el aviso de versión nueva');
    await Promise.all([p.waitForNavigation(), p.click('#banner .acts button:has-text("Actualizar")')]); await p.waitForTimeout(600);
    ok(!(await p.isVisible('#lock')), 'actualizar estando dentro no vuelve a pedir el PIN');
    await p.evaluate(() => sessionStorage.removeItem('rz_ul')); await p.reload(); await p.waitForTimeout(400);
    ok(await p.isVisible('#lock'), 'la siguiente apertura normal sí pide el PIN');
    ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
    await ctx.close();
  } finally { st.version = null; }
});

/* 6b · Actualización real con service worker: tras «Actualizar» se carga la versión publicada, a la primera */
test('actualización con service worker', async ({ browser, base, st }) => {
  const OLD = '2026-01-01-1'; st.pageVer = OLD; st.version = OLD;
  try {
    const ctx = await L.context(browser, base, { sw: true, device: devices['Pixel 7'], seed: { rz_meta: meta(VER) } }), p = await L.page(ctx);
    await p.goto(base); await L.unlock(p, { create: true });
    await p.evaluate(() => navigator.serviceWorker.ready); await p.waitForTimeout(1200);
    ok(await p.evaluate(() => !!navigator.serviceWorker.controller), 'la app queda guardada por el service worker');
    st.pageVer = null; st.version = null; // se publica la versión de verdad
    await p.reload(); await L.unlock(p, { dismiss: false }); await p.waitForTimeout(600);
    ok(await p.textContent('#verAbt') === 'Versión ' + OLD && await p.isVisible('#banner'), 'abre la copia guardada y avisa de la nueva');
    await Promise.all([p.waitForNavigation(), p.click('#banner .acts button:has-text("Actualizar")')]); await p.waitForTimeout(1200);
    if (await p.isVisible('#lock')) await L.unlock(p, { dismiss: false });
    ok(await p.textContent('#verAbt') === 'Versión ' + VER, 'tras un «Actualizar» ya está la versión nueva → ' + await p.textContent('#verAbt'));
    ok(!(await p.isVisible('#banner')), 'y el aviso ya no vuelve a salir');
    ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
    await ctx.close();
  } finally { st.pageVer = null; st.version = null; }
});

/* 6c · Búsqueda: la dirección tal cual sale del mapa, sin «Mallorca»; si no hay resultado, prueba sin número */
test('búsqueda de direcciones', async ({ browser, base }) => {
  const hit = { lat: '39.4897', lon: '2.8917', name: '', display_name: 'Carrer dels Bons Aires, Llucmajor', address: { road: 'Carrer dels Bons Aires', town: 'Llucmajor' } };
  // Como Nominatim: con «Mallorca» o con un número que no tiene, no encuentra nada
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_data: data(), rz_meta: meta(VER) }, geo: q => /mallorca|\d/i.test(q) ? [] : /bons aires/i.test(q) ? [hit] : [] }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true });
  await p.fill('#stopQ', 'Carrer dels Bons Aires, 24, Llucmajor'); await p.waitForSelector('#stopSug button:has-text("Bons Aires")', { timeout: 5000 }).catch(() => {});
  ok(!ctx.geoQ.some(q => /mallorca/i.test(q)), 'no añade «Mallorca» a lo que se busca → ' + ctx.geoQ.join(' | '));
  ok(ctx.geoQ.includes('Carrer dels Bons Aires, Llucmajor'), 'sin resultado con número, prueba la calle sin número');
  ok(await p.locator('#stopSug button:has-text("Bons Aires")').count() > 0, 'y la encuentra');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 6d · Ajustes › Volver al punto de partida cambia también la ruta de hoy */
test('ajuste de vuelta', async ({ browser, base }) => {
  const d = data({ cur: { start: { ...OFFICE, time: '' }, stops: [{ id: 'a', ...P(39.548, 2.693, 'Casa') }], notes: '', ret: true } });
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_data: d, rz_meta: meta(VER) } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true }); await p.waitForTimeout(500);
  const km0 = await p.textContent('#kmV');
  await p.click('.bb button[data-v="ajustes"]'); await p.click('label.sw:has(#setRet)'); await p.waitForTimeout(500);
  ok(await p.evaluate(() => __rz.D.set.ret === false && __rz.D.cur.ret === false), 'apagarlo quita la vuelta también de la ruta abierta');
  await p.click('.bb button[data-v="ruta"]'); await p.waitForTimeout(500);
  ok(!(await p.isChecked('#retSw')) && await p.textContent('#kmV') !== km0, `la ruta se recalcula sin vuelta: ${km0} → ${await p.textContent('#kmV')} km`);
  await p.click('#bSave'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __rz.D.cur.ret === false), 'la jornada siguiente también empieza sin vuelta');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 6e · Corregir un destino: ruta de hoy siempre, historial si se confirma (con km recalculados y deshacer), visitas que no se pierden */
test('corregir un destino', async ({ browser, base }) => {
  const A = P(39.7217, 2.9106, 'Casa de M.', 'c1'), NEW = { lat: 39.7300, lon: 2.9200 };
  const d = data({
    clients: [{ id: 'c1', ...A }],
    hist: [day('h1', '2026-10-28', [{ ...A }]), day('h2', '2026-10-29', [{ ...A, cid: null, lat: A.lat + 0.0001 }]), day('h3', '2026-10-30', [P(39.5694, 3.2085, 'Otro sitio')])],
    cur: { start: { ...OFFICE, time: '' }, stops: [{ id: 's1', ...A }], notes: '', ret: true } });
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_data: d, rz_meta: meta(VER) }, leg: (a, b) => ({ distance: L.hav(a, b) * 1000, duration: 600 }) }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true }); await p.waitForTimeout(500);
  const km0 = await p.evaluate(() => __rz.D.hist.map(j => j.tot.road));
  const move = async (answer) => {
    await p.click('.bb button[data-v="dest"]'); await p.click('.dr:has-text("Casa de M.") .bd'); await p.click('.amb:has-text("Corregir la ubicación")');
    await p.waitForTimeout(400); await p.evaluate(n => __rz.map.setView([n.lat, n.lon], 17, { animate: false }), NEW); await p.waitForTimeout(500);
    await p.click('#pickOk'); await p.waitForSelector('.dlg h3:has-text("historial")', { timeout: 5000 });
    if (process.env.SHOT) { await p.waitForTimeout(600); await p.screenshot({ path: process.env.SHOT }); }
    ok((await p.textContent('.dlg')).includes('2 jornadas'), 'pregunta por las 2 jornadas donde aparece (una enlazada y otra por estar en el mismo sitio)');
    if (answer === null) await p.click('#layer .ov', { position: { x: 10, y: 10 } }); else if (answer === 'back') await p.goBack(); else await p.click(`.dlg .acts button:has-text("${answer}")`);
  };
  // cancelar o cerrar el cuadro: no cambia nada (ni el destino ni la ruta de hoy)
  const same = () => p.evaluate(a => Math.abs(__rz.D.clients[0].lat - a.lat) < 1e-6 && Math.abs(__rz.D.cur.stops[0].lat - a.lat) < 1e-6, A);
  await move('Cancelar'); await p.waitForTimeout(400);
  ok(await same(), '«Cancelar» no mueve nada');
  ok(/Sin cambios/.test(await p.textContent('#toast')), 'y lo dice');
  await move(null); await p.waitForTimeout(400);
  ok(await same(), 'tocar fuera del cuadro tampoco mueve nada');
  await move('back'); await p.waitForTimeout(400);
  ok(await same(), 'ni el botón Atrás del móvil');
  await move('Solo desde ahora'); await p.waitForTimeout(600);
  let st = await p.evaluate(() => ({ c: __rz.D.clients[0], cur: __rz.D.cur.stops[0], h: __rz.D.hist.map(j => ({ lat: j.stops[0].lat, cid: j.stops[0].cid, km: j.tot.road })) }));
  ok(Math.abs(st.c.lat - NEW.lat) < 1e-4 && Math.abs(st.cur.lat - NEW.lat) < 1e-4, 'el destino y la ruta de hoy pasan a la ubicación nueva');
  ok(Math.abs(st.h[0].lat - A.lat) < 1e-3 && st.h[0].km === km0[0], '«Solo desde ahora» deja el historial como estaba');
  ok(st.h[1].cid === 'c1', 'la visita reconocida por el sitio queda enlazada al destino');
  await p.click('.dr:has-text("Casa de M.") .bd'); await p.waitForSelector('.am');
  ok((await p.textContent('.am')).includes('2 visitas'), 'sigue contando 2 visitas después de moverlo');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  await move('Corregir 2'); await p.waitForFunction(() => /corregida/.test(document.querySelector('#toast').textContent), null, { timeout: 10000 }).catch(() => {});
  st = await p.evaluate(() => __rz.D.hist.map(j => ({ lat: j.stops[0].lat, km: j.tot.road })));
  ok(Math.abs(st[0].lat - NEW.lat) < 1e-4 && Math.abs(st[1].lat - NEW.lat) < 1e-4 && st[0].km !== km0[0], `«Corregir» mueve las 2 jornadas y recalcula sus km (${km0[0]} → ${st[0].km.toFixed(1)})`);
  ok(st[2].km === km0[2], 'no toca las jornadas de otros sitios');
  ok(/→/.test(await p.textContent('#toast')), 'avisa de cuántos km cambian → ' + await p.textContent('#toast'));
  await p.click('#toast button'); await p.waitForTimeout(300);
  st = await p.evaluate(() => __rz.D.hist.map(j => ({ lat: j.stops[0].lat, km: j.tot.road })));
  ok(Math.abs(st[0].lat - A.lat) < 1e-3 && st[0].km === km0[0], 'Deshacer devuelve el historial como estaba');
  // nombre
  await p.click('.dr:has-text("Casa de M.") .bd'); await p.click('.amb:has-text("Cambiar nombre")'); await p.fill('#pv', 'Casa de María'); await p.click('.dlg .acts button:has-text("Guardar")');
  await p.waitForSelector('.dlg h3:has-text("historial")'); await p.click('.dlg .acts button:has-text("Cancelar")'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __rz.D.clients[0].label === 'Casa de M.' && __rz.D.cur.stops[0].label === 'Casa de M.'), 'al renombrar, «Cancelar» deja el nombre como estaba');
  await p.click('.dr:has-text("Casa de M.") .bd'); await p.click('.amb:has-text("Cambiar nombre")'); await p.fill('#pv', 'Casa de María'); await p.click('.dlg .acts button:has-text("Guardar")');
  await p.waitForSelector('.dlg h3:has-text("historial")'); await p.click('.dlg .acts button:has-text("Cambiar en 2")'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __rz.D.hist.filter(j => j.stops[0].label === 'Casa de María').length === 2 && __rz.D.cur.stops[0].label === 'Casa de María'), 'el nombre nuevo pasa a la ruta de hoy y, si se confirma, al historial');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 6f · Jornadas exportadas: marca al exportar, filtro, «cambiada tras exportar», solo pendientes y marcar a mano */
test('jornadas exportadas', async ({ browser, base }) => {
  const n = new Date(), pm = new Date(n.getFullYear(), n.getMonth() - 1, 1), iso = (d, day) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const A = P(39.7217, 2.9106, 'Casa de M.');
  const d = data({ hist: [day('h1', iso(pm, 10), [{ ...A }]), day('h2', iso(pm, 11), [{ ...A }]), day('h3', iso(pm, 12), [{ ...A }]), day('h4', iso(n, 1), [{ ...A }])] });
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_data: d, rz_meta: meta(VER) } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true });
  await p.click('.bb button[data-v="hist"]');
  ok(await p.locator('.hi .chip:has-text("exportada")').count() === 0, 'al principio ninguna sale como exportada');
  const excel = async (only) => {
    await p.click('#bExport'); await p.waitForSelector('#exP'); await p.selectOption('#exP', only ? 'todo' : 'ant');
    if (only) { ok(await p.isVisible('#exO'), 'el informe ofrece «Solo las pendientes» → ' + await p.textContent('#exN')); await p.check('#exO'); }
    const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 5000 }).catch(() => null), p.click('.dlg .acts button:has-text("Excel")')]);
    await p.waitForTimeout(300); return dl ? fs.readFileSync(await dl.path(), 'utf8') : '';
  };
  await excel(false);
  ok(await p.locator('.hi .chip:has-text("exportada")').count() === 3, 'el Excel del mes anterior marca sus 3 jornadas como exportadas');
  ok(await p.locator('.gh .gx:has-text("exportado")').count() === 1 && await p.locator('.gh .gx:has-text("1 sin exportar")').count() === 1, 'cada mes dice si está exportado o cuántas faltan');
  await p.click('#sgHf button[data-f="pend"]');
  ok(await p.locator('.hi').count() === 1, 'el filtro «Sin exportar» deja solo la pendiente');
  await p.click('#sgHf button[data-f="all"]');
  // cambiar una exportada
  await p.click(`.hi[data-id="h2"]`); await p.click('.amb:has-text("Anotar el tiempo real")'); await p.fill('#rtm', '55'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(300);
  ok(await p.locator('.hi[data-id="h2"] .chip:has-text("cambiada tras exportar")').count() === 1, 'si cambia después de exportarla sale «cambiada tras exportar»');
  ok(await p.isVisible('#sgHf button[data-f="chg"]'), 'y aparece el filtro «Cambiadas»');
  const csv = await excel(true), rows = csv.split('\n').filter(l => /^\d{2}\/\d{2}\/\d{4};/.test(l));
  ok(rows.length === 2, `«Solo las pendientes» exporta la cambiada y la sin exportar (${rows.length} filas)`);
  ok(await p.locator('.hi .chip:has-text("cambiada")').count() === 0 && await p.locator('.hi .chip:has-text("exportada")').count() === 4, 'después las 4 quedan exportadas');
  await p.click('.hi[data-id="h4"]'); await p.click('.amb:has-text("Exportada el")'); await p.waitForTimeout(200);
  ok(await p.locator('.hi[data-id="h4"] .chip:has-text("exportada")').count() === 0, 'se puede marcar una como no exportada');
  await p.click('#bMarkExp'); await p.selectOption('#mxP', 'todo'); await p.click('.dlg .acts button:has-text("Marcar")'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => __rz.D.hist.every(j => j.exp)), '«Marcar como exportadas…» marca las del periodo');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 6g · iPhone: en Safari, sin datos, pide instalar antes del PIN; instalada, recuerda restaurar dentro */
test('iPhone: instalar antes de empezar', async ({ browser, base }) => {
  let ctx = await L.context(browser, base, { device: devices['iPhone 13'], iosSafari: true }), p = await L.page(ctx);
  await p.goto(base); await p.waitForTimeout(500);
  if (process.env.SHOT) await p.screenshot({ path: process.env.SHOT });
  ok(await p.isVisible('#iosGate'), 'en Safari de iPhone, la primera vez, explica que hay que instalarla antes');
  await p.click('#igSkip'); await L.unlock(p, { create: true, dismiss: false });
  ok(!(await p.isVisible('#iosGate')), '«Seguir en Safari» deja usarla igualmente');
  await p.reload(); await p.waitForTimeout(400);
  ok(!(await p.isVisible('#iosGate')), 'y no vuelve a salir');
  await ctx.close();
  ctx = await L.context(browser, base, { device: devices['iPhone 13'], iosSafari: true, seed: { rz_data: data({ hist: [day('h1', '2026-10-30', [P(39.6, 2.7, 'A')])] }), rz_meta: meta(VER) } }); p = await L.page(ctx);
  await p.goto(base); await p.waitForTimeout(400);
  ok(!(await p.isVisible('#iosGate')), 'si ya tiene datos en Safari no la bloquea');
  await ctx.close();
  ctx = await L.context(browser, base, { device: devices['iPhone 13'] }); p = await L.page(ctx);
  await p.goto(base); await p.waitForTimeout(300);
  ok(!(await p.isVisible('#iosGate')), 'en la app instalada no sale');
  await L.unlock(p, { create: true, dismiss: false }); await p.waitForSelector('.dlg');
  ok((await p.textContent('.dlg')).includes('Safari'), 'y la bienvenida recuerda restaurar la copia otra vez dentro');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 6h · Nombres únicos: jornadas y destinos */
test('nombres sin repetir', async ({ browser, base }) => {
  const A = P(39.7217, 2.9106, 'Casa de M.', 'c1'), td = new Date(), iso = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;
  const name = 'Ruta del ' + td.toLocaleDateString('es-ES', { day: 'numeric', month: 'long', timeZone: 'Europe/Madrid' });
  const d = data({ clients: [{ id: 'c1', ...A }], hist: [day('h1', iso, [{ ...A }], { label: name })],
    cur: { start: { ...OFFICE, time: '' }, stops: [{ id: 's1', ...P(39.5694, 3.2085, 'Casa de M.') }], notes: '', ret: true } });
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_data: d, rz_meta: meta(VER) } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true }); await p.waitForTimeout(400);
  await p.click('#bSave'); await p.waitForSelector('#jn');
  ok(await p.inputValue('#jn') === name + ' (2)', 'el nombre automático no repite el de otra jornada del mismo día → ' + await p.inputValue('#jn'));
  await p.fill('#jn', name.toUpperCase()); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(200);
  if (process.env.SHOT) { await p.waitForTimeout(400); await p.screenshot({ path: process.env.SHOT }); }
  ok(await p.isVisible('#jnE') && await p.isVisible('.dlg'), 'con el mismo nombre (aunque cambien mayúsculas) no deja guardar y lo explica');
  await p.click('#jnE [data-sug]'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __rz.D.hist.length === 2 && new Set(__rz.D.hist.map(j => j.label.toLowerCase())).size === 2), 'con el nombre propuesto se guarda → ' + await p.evaluate(() => __rz.D.hist.map(j => j.label).join(' | ')));
  // destinos
  await p.click('.bb button[data-v="dest"]'); await p.click('#bDestNew'); await p.click('#ndMap'); await p.waitForTimeout(500); await p.click('#pickOk'); await p.waitForSelector('#pv');
  await p.fill('#pv', 'casa de m.'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(200);
  ok(await p.isVisible('#pvE'), 'un destino nuevo no puede llamarse como otro');
  await p.click('#pvE [data-sug]'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __rz.D.clients.map(c => c.label.toLowerCase()).join('|')) === 'casa de m.|casa de m. (2)', 'se guarda con el nombre propuesto');
  await p.click('.dr:has-text("(2)") .bd'); await p.click('.amb:has-text("Cambiar nombre")'); await p.fill('#pv', 'Casa de M.'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(200);
  ok(await p.isVisible('#pvE'), 'al cambiar el nombre tampoco deja repetir');
  await p.keyboard.press('Escape'); await p.waitForTimeout(200);
  // datos antiguos con repetidos: botón Arreglar
  await p.evaluate(() => { __rz.D.hist.push({ ...JSON.parse(JSON.stringify(__rz.D.hist[0])), id: 'h9', iso: '2026-01-05' }); __rz.D.clients.push({ id: 'c9', lat: 39.1, lon: 3.1, label: 'Casa de M.', at: '2026-11-03' }); });
  await p.click('.bb button[data-v="hist"]'); await p.waitForTimeout(200);
  ok(await p.isVisible('#bDupH'), 'el Historial avisa de nombres repetidos que ya había');
  await p.click('#bDupH'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => new Set(__rz.D.hist.map(j => j.label.toLowerCase())).size === __rz.D.hist.length) && !(await p.isVisible('#bDupH')), '«Arreglar» deja todos los nombres distintos');
  await p.click('.bb button[data-v="dest"]'); await p.click('#bDupD'); await p.waitForTimeout(200);
  ok(await p.evaluate(() => new Set(__rz.D.clients.map(c => c.label.toLowerCase())).size === __rz.D.clients.length), 'y en Destinos igual');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 6i · Deslizar una parada: ← quitar (con deshacer), → guardar en destinos; con poco recorrido no hace nada */
test('deslizar paradas', async ({ browser, base }) => {
  const d = data({ clients: [{ id: 'c2', ...P(39.49, 2.89, 'Centro'), addr: 'Carrer Major, 22, Llucmajor' }], cur: { start: { ...OFFICE, time: '' }, stops: [{ id: 'a', ...P(39.7217, 2.9106, 'Casa de M.') }, { id: 'b', ...P(39.5694, 3.2085, 'Casa de J.') }, { id: 'z', ...P(39.49, 2.89, 'Centro', 'c2') }], notes: '', ret: true } });
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_data: d, rz_meta: meta(VER) } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true }); await p.waitForTimeout(400);
  ok(await p.isVisible('#swh'), 'la primera vez explica el gesto');
  const swipe = (id, dx) => p.evaluate(([id, dx]) => { const r = document.querySelector(`#stopsList .pt[data-id="${id}"] .dot`), b = r.getBoundingClientRect(), x = b.left + 40, y = b.top + b.height / 2;
    const ev = (t, X) => r.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', clientX: X, clientY: y, isPrimary: true }));
    ev('pointerdown', x); for (let i = 1; i <= 8; i++) ev('pointermove', x + dx * i / 8); ev('pointerup', x + dx); }, [id, dx]);
  await swipe('a', 40); await p.waitForTimeout(400);
  ok(await p.evaluate(() => __rz.D.cur.stops.length === 3 && __rz.D.clients.length === 1), 'un deslizamiento corto no hace nada');
  await swipe('a', 260); await p.waitForSelector('#pv', { timeout: 3000 }).catch(() => {});
  ok(await p.isVisible('#pv') && await p.inputValue('#pv') === 'Casa de M.', 'hacia la derecha pide el nombre, con el de la parada propuesto');
  await p.click('.dlg .acts button:has-text("Cancelar")'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __rz.D.clients.length === 1), 'si se cancela, no guarda nada');
  await swipe('a', 260); await p.waitForSelector('#pv'); await p.fill('#pv', 'Casa de María'); await p.click('.dlg .acts button:has-text("Guardar")'); await p.waitForTimeout(400);
  ok(await p.evaluate(() => __rz.D.clients.length === 2 && __rz.D.clients[1].label === 'Casa de María' && __rz.D.cur.stops[0].label === 'Casa de María' && __rz.D.cur.stops[0].cid === __rz.D.clients[1].id), 'con el nombre puesto, la guarda en destinos y la parada pasa a llamarse así');
  await swipe('a', 260); await p.waitForTimeout(500);
  ok(await p.evaluate(() => __rz.D.clients.length === 2), 'si ya es destino, hacia la derecha no la quita de destinos');
  await swipe('b', -260); await p.waitForTimeout(500);
  ok(await p.evaluate(() => __rz.D.cur.stops.length === 2 && !__rz.D.cur.stops.some(x => x.id === 'b')), 'hacia la izquierda la quita');
  ok(/Quitada/.test(await p.textContent('#toast')), 'con aviso y Deshacer');
  await p.click('#toast button'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => __rz.D.cur.stops.length === 3), 'Deshacer la devuelve');
  ok(!(await p.isVisible('#swh')), 'después del primer gesto la explicación ya no sale');
  // textos que se leen a mitad de gesto
  const half = (id, dx) => p.evaluate(([id, dx]) => { const r = document.querySelector(`#stopsList .pt[data-id="${id}"] .dot`), bb = r.getBoundingClientRect(), x = bb.left + 40, y = bb.top + bb.height / 2;
    const ev = (t, X) => r.dispatchEvent(new PointerEvent(t, { bubbles: true, cancelable: true, pointerId: 9, pointerType: 'touch', clientX: X, clientY: y }));
    ev('pointerdown', x); for (let i = 1; i <= 6; i++) ev('pointermove', x + dx * i / 6); const t = document.querySelector('#stopsList .und').textContent; ev('pointercancel', x + dx); return t; }, [id, dx]);
  ok(await half('z', 200) === 'Ya guardado', 'si ya es destino, a la derecha pone «Ya guardado»');
  await p.waitForTimeout(300);
  // eliminar un destino que está en la ruta de hoy
  await p.click('.bb button[data-v="dest"]'); await p.click('.dr:has-text("Centro") .bd'); await p.click('.amb:has-text("Eliminar destino")'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const z = __rz.D.cur.stops.find(x => x.id === 'z'); return z.label === 'Carrer Major, 22, Llucmajor' && !z.cid; }), 'al eliminar el destino, la parada de hoy vuelve a su dirección');
  await p.click('#toast button'); await p.waitForTimeout(300);
  ok(await p.evaluate(() => { const z = __rz.D.cur.stops.find(x => x.id === 'z'); return z.label === 'Centro' && z.cid === 'c2'; }), 'Deshacer devuelve el destino y el nombre');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 6j · Editando una jornada: no se puede exportar (saldría sin ella); sin paradas no se puede guardar */
test('editar con seguridad', async ({ browser, base }) => {
  const d = data({ hist: [day('h1', '2026-10-28', [P(39.7217, 2.9106, 'Casa de M.'), P(39.5694, 3.2085, 'Casa de J.')])] });
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_data: d, rz_meta: meta(VER) } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true });
  await p.click('.bb button[data-v="hist"]'); await p.click('.hi'); await p.click('.amb:has-text("Editar")'); await p.waitForTimeout(500);
  await p.click('.bb button[data-v="hist"]'); await p.click('#bExport'); await p.waitForSelector('.dlg h3');
  ok(/Termina antes la edición/.test(await p.textContent('.dlg h3')) && !(await p.isVisible('#exP')), 'a mitad de editar, exportar avisa en vez de sacar un informe sin esa jornada');
  await p.click('.dlg .acts button:has-text("Ir a la edición")'); await p.waitForTimeout(300);
  ok(await p.isVisible('#editBar'), '«Ir a la edición» vuelve a la ruta en edición');
  for (let i = 0; i < 2; i++) { await p.locator('#stopsList .pt[data-id] .gb.mn').first().click({ timeout: 5000 }); await p.click('.amb:has-text("Quitar parada")', { timeout: 5000 }); await p.waitForTimeout(400); }
  ok(await p.isDisabled('#bEditOk'), 'sin paradas, «Guardar cambios» queda desactivado');
  ok(await p.evaluate(() => !!__rz.D.edit && __rz.D.hist.length === 0), 'y la jornada sigue en edición, sin perderse');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 7 · Copias de seguridad y novedades */
test('copias y novedades', async ({ browser, base }) => {
  const d = data({ hist: [day('h1', '2026-10-30', [P(39.6, 2.7, 'A')])] });
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], share: true, seed: { rz_data: d, rz_meta: meta(null) } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true, dismiss: false });
  await p.waitForSelector('.chgl', { timeout: 4000 }).catch(() => {});
  ok(await p.isVisible('.chgl'), 'un usuario que actualiza ve las novedades');
  if (await p.isVisible('.dlg')) await p.click('.dlg .acts button:has-text("Cerrar")');
  await p.click('.bb button[data-v="ajustes"]'); await p.click('#sTabs button[data-s="dat"]');
  await p.click('#bBkShare'); await p.waitForTimeout(300);
  const sh = await p.evaluate(() => window.__shared);
  ok(sh && /\.txt text\/plain/.test(sh[0]), 'Enviar copia comparte un .txt → ' + sh);
  const [dl] = await Promise.all([p.waitForEvent('download', { timeout: 4000 }).catch(() => null), p.click('#bBkDl')]);
  ok(dl && /\.json$/.test(dl.suggestedFilename()), 'Descargar copia guarda un .json → ' + (dl && dl.suggestedFilename()));
  const txt = JSON.stringify({ app: 'rutahz', v: 2, data: { hist: [{ id: 'z9', label: 'Importada', iso: '2026-10-20', start: { lat: 39.57, lon: 2.65, label: 'T' }, stops: [{ lat: 39.6, lon: 2.7, label: 'B' }], tot: { road: 9, src: 'road' } }], clients: [] } });
  await p.setInputFiles('#bkIn', { name: 'rutahz-copia.txt', mimeType: 'text/plain', buffer: Buffer.from(txt) }); await p.waitForSelector('.dlg');
  ok(/restaurad|añadid|import/i.test(await p.textContent('.dlg')), 'restaura una copia .txt');
  await p.click('.dlg .acts button >> nth=-1'); await p.waitForTimeout(200);
  const n1 = await p.evaluate(() => __rz.D.hist.length);
  await p.setInputFiles('#bkIn', path.join(__dirname, 'fx', 'v1.json')); await p.waitForSelector('.dlg'); await p.click('.dlg .acts button >> nth=-1'); await p.waitForTimeout(300);
  const n2 = await p.evaluate(() => __rz.D.hist.length), imp = await p.evaluate(() => __rz.D.hist.find(j => /1729000000001$/.test(j.id)));
  ok(n2 === n1 + 3 && imp && imp.tot.road === 63.5, `importa la copia de la versión 1 (Netlify): ${n1} → ${n2} jornadas`);
  await p.click('#sTabs button[data-s="app"]'); await p.click('#bNews'); await p.waitForSelector('.chgl');
  ok(await p.locator('.chgl section').count() >= 3, 'Ajustes › App › Novedades lista las versiones');
  await p.click('.dlg .acts button >> nth=-1');
  await p.reload(); await L.unlock(p, { dismiss: false }); await p.waitForTimeout(800);
  ok(!(await p.isVisible('.chgl')), 'al reabrir ya no salen las novedades');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 8 · Desde Destinos y Resumen, una visita abre su jornada */
test('visitas pulsables', async ({ browser, base }) => {
  const A = P(39.7217, 2.9106, 'Casa de M.', 'c1'), B = P(39.6875, 2.8492, 'Casa de J.', 'c2');
  const d = data({ hist: [day('h1', '2026-10-28', [{ ...B }, { ...A }]), day('h2', '2026-10-29', [{ ...A }]), day('h3', '2026-10-30', [{ ...B }])], clients: [{ id: 'c1', ...A }, { id: 'c2', ...B }] });
  const ctx = await L.context(browser, base, { device: devices['Pixel 7'], seed: { rz_data: d, rz_meta: meta(VER) } }), p = await L.page(ctx);
  await p.goto(base); await L.unlock(p, { create: true });
  await p.click('.bb button[data-v="dest"]'); await p.click('.dr:has-text("Casa de M.") .bd'); await p.click('.amb:has-text("Ver sus visitas")'); await p.waitForSelector('.vit');
  ok(await p.locator('.vit').count() === 2, 'Casa de M. tiene 2 visitas');
  await p.click('.vit >> nth=1'); await p.waitForTimeout(800);
  ok(await p.isVisible('#v-ver') && await p.locator('#verBox .pt.vr.on').count() === 1, 'la visita abre su jornada con la parada resaltada');
  await p.goBack(); await p.waitForTimeout(300);
  await p.click('.bb button[data-v="stats"]'); await p.click('.rk button[data-i="0"]'); await p.click('.rk .dt:not([hidden]) button >> nth=0'); await p.waitForTimeout(800);
  ok(await p.isVisible('#v-ver'), 'una fecha del Resumen abre su jornada');
  ok(!p.errors.length, 'sin errores de JavaScript ' + p.errors.join(' | '));
  await ctx.close();
});

/* 9 · Uso en móvil: sin zoom en los campos (letra ≥ 16 px) y botones fáciles de tocar (≥ 40 px) */
test('móvil táctil', async ({ browser, base }) => {
  const stops = [P(39.7217, 2.9106, 'Casa de M. (Inca)', 'c1'), P(39.6875, 2.8492, 'Casa de J. Binissalem', 'c2'), P(39.5694, 3.2085, 'Centro de día Manacor', 'c3'), P(39.4897, 2.8917, 'Casa de P. Llucmajor', 'c4')];
  const d = data({ cur: { start: { ...OFFICE, time: '08:05' }, stops: stops.map((s, i) => ({ ...s, id: 's' + i })), notes: '', ret: true }, hist: [day('h1', '2026-10-30', stops.slice(0, 2))], clients: stops.map(s => ({ id: s.cid, ...s, addr: s.label })) });
  for (const [nm, dev] of [['iPhone SE', devices['iPhone SE']], ['Pixel 7', devices['Pixel 7']]]) {
    const ctx = await L.context(browser, base, { device: dev, seed: { rz_data: d, rz_meta: meta(VER) } }), p = await L.page(ctx);
    await p.goto(base); await L.unlock(p, { create: true }); await p.waitForTimeout(600);
    for (const v of ['ruta', 'dest', 'hist', 'stats', 'ajustes']) {
      await p.click(`.bb button[data-v="${v}"]`); await p.waitForTimeout(250);
      const small = await p.evaluate(() => [...document.querySelectorAll('input:not([type=checkbox]):not([type=file]):not([type=color]),textarea,select')].filter(e => e.offsetParent && parseFloat(getComputedStyle(e).fontSize) < 16).map(e => e.id || e.className));
      const tiny = await p.evaluate(() => [...document.querySelectorAll('button, a, label.sw')].filter(e => e.offsetParent && !e.closest('.leaflet-control-attribution')).map(e => { const r = e.getBoundingClientRect(); return [e.id || e.className || e.textContent.trim().slice(0, 14), Math.round(r.width), Math.round(r.height)]; }).filter(([, w, h]) => w && h && (w < 40 || h < 40)));
      ok(!small.length, `${nm} · ${v}: campos con letra < 16 px ${small.join(', ')}`);
      ok(!tiny.length, `${nm} · ${v}: botones < 40 px ${JSON.stringify(tiny.slice(0, 6))}`);
    }
    ok(!p.errors.length, `${nm}: sin errores de JavaScript ${p.errors.join(' | ')}`);
    await ctx.close();
  }
});

(async () => {
  const only = process.argv[2], srv = await L.serve(), browser = await L.launch();
  for (const [name, fn] of T) {
    if (only && !name.includes(only)) continue;
    cur = { name, checks: [], fail: false }; results.push(cur);
    const t0 = Date.now();
    try { await Promise.race([fn({ browser, base: srv.base, st: srv.st }), new Promise((_, r) => setTimeout(() => r(new Error('tiempo agotado (90 s)')), 90000))]); }
    catch (e) { cur.fail = true; cur.checks.push([false, 'error: ' + (e.message || e).split('\n')[0]]); }
    console.log(`${cur.fail ? '✗' : '✓'} ${name} (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
    for (const [c, m] of cur.checks) if (!c || process.env.VERBOSE) console.log(`    ${c ? 'ok' : 'FALLO'} · ${m}`);
  }
  await browser.close(); srv.close();
  const bad = results.filter(r => r.fail);
  console.log(`\n${results.length - bad.length}/${results.length} pruebas superadas (versión ${VER})`);
  process.exit(bad.length ? 1 : 0);
})();
