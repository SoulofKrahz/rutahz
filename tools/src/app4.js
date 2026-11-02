
/* =================== Ajustes =================== */
function syncSettings() {
  $('#setCpk').value = D.set.cpk; $('#setRf').value = D.set.rf; $('#setRet').checked = !!D.set.ret; $('#setUnl').checked = !!D.set.unl;
  $('#setShN').checked = !!D.set.shN; $('#setShM').checked = !!D.set.shM; $('#setShT').checked = !!D.set.shT;
  $$('#sgAl button').forEach(b => b.classList.toggle('on', +b.dataset.v === +D.set.al));
  $('#setTf').value = D.set.tf; $('#setPm').value = D.set.pm; renderTfFormula(); renderCalNote();
}
$('#setCpk').onchange = e => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(v) && v >= 0 && v < 10) { D.set.cpk = v; save(); renderSum(); toast('Coste por km: ' + nf2.format(v) + ' €. Se aplica a las jornadas nuevas.'); } else syncSettings(); };
$('#setRf').onchange = e => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(v) && v >= 1 && v <= 3) { D.set.rf = v; routeCache.clear(); save(); recalc(); } else syncSettings(); };
function renderTfFormula() {
  const ex = 30, n = 4; // ejemplo: 30 min del servicio de rutas, 3 paradas + vuelta
  $('#tfFormula').innerHTML = `<b>Tiempo de rutas × ${fmtX(D.set.tf)} + ${D.set.pm} min por llegada</b><br>Ejemplo: 30 min de rutas con 3 paradas y vuelta = ${fmtDur(adjDur(ex, n))}.`;
}
function onTimeSet() { routeCache.clear(); save(); renderTfFormula(); renderCalNote(); recalc(); }
$('#setTf').onchange = e => { const v = parseFloat(String(e.target.value).replace(',', '.')); if (isFinite(v) && v >= 1 && v <= 2) { D.set.tf = Math.round(v * 100) / 100; onTimeSet(); } else { toast('El factor va de 1,00 a 2,00.'); syncSettings(); } };
$('#setPm').onchange = e => { const v = parseInt(e.target.value, 10); if (isFinite(v) && v >= 0 && v <= 30) { D.set.pm = v; onTimeSet(); } else { toast('Entre 0 y 30 minutos.'); syncSettings(); } };
// Calibrar: factor que reproduce lo mejor posible los tiempos reales anotados (suma real − aparcar) ÷ suma de rutas
function calData() { const L = D.hist.filter(j => isReal(j) && j.tot.durRaw > 0); const real = L.reduce((a, j) => a + j.tot.durM - arrivals(j) * D.set.pm, 0), raw = L.reduce((a, j) => a + j.tot.durRaw, 0); return { n: L.length, tf: raw > 0 ? real / raw : null }; }
function renderCalNote() { const el = $('#calS'); if (!el) return; const c = calData(); el.textContent = c.n ? `${c.n} jornada${c.n > 1 ? 's' : ''} con tiempo real anotado: el factor que mejor encaja es ×${fmtX(Math.min(2, Math.max(1, c.tf)))}.` : 'Anota el tiempo real de algunas jornadas (Historial › jornada › Tiempo real) y Rutahz calcula el factor.'; }
$('#bCal').onclick = () => {
  const c = calData();
  if (!c.n) return dlg({ title: 'Calibrar el tiempo', text: 'Todavía no hay jornadas con tiempo real anotado.\n\nCuando termines una jornada, anota el tiempo real al volante al guardarla (o después, en Historial › la jornada › Tiempo real). Con 3–5 jornadas la calibración ya es fiable.', acts: [{ t: 'Entendido', v: null }] });
  const raw = c.tf, tf = Math.round(Math.min(2, Math.max(1, raw)) * 20) / 20;
  dlg({ title: 'Calibrar el tiempo', text: `Con ${c.n} jornada${c.n > 1 ? 's' : ''} con tiempo real y ${D.set.pm} min por llegada, el factor que mejor encaja es ×${fmtX(raw)}.${raw < 1 ? '\nSale por debajo de 1: tus tiempos reales son más rápidos que el servicio de rutas. Prueba a bajar los minutos por llegada.' : raw > 2 ? '\nSale muy alto: revisa que los tiempos anotados sean solo de conducción, sin las visitas.' : ''}${c.n < 3 ? '\nCon menos de 3 jornadas es orientativo.' : ''}`, ok: `Usar ×${fmtX(tf)}` })
    .then(v => { if (v !== true) return; const old = D.set.tf; D.set.tf = tf; syncSettings(); onTimeSet(); toast(`Factor de tráfico: ×${fmtX(tf)}. Se aplica a las jornadas nuevas.`, { undo: () => { D.set.tf = old; syncSettings(); onTimeSet(); } }); });
};
$('#bTfAll').onclick = async () => {
  const L = D.hist.filter(j => !isReal(j) && (j.tot.durRaw != null || j.tot.dur > 0));
  if (!L.length) return toast('No hay jornadas estimadas que cambiar.');
  if (!await ask('¿Aplicar al historial?', `Se recalcula el tiempo al volante de ${L.length} jornada${L.length > 1 ? 's' : ''} con ×${fmtX(D.set.tf)} y ${D.set.pm} min por llegada. Las que tienen tiempo real anotado no cambian. Se puede deshacer.`, 'Aplicar')) return;
  const snap = L.map(j => [j, { ...j.tot }]);
  L.forEach(j => { const raw = j.tot.durRaw != null ? j.tot.durRaw : j.tot.dur; j.tot.durRaw = raw; j.tot.tf = D.set.tf; j.tot.pm = D.set.pm; j.tot.dur = adjDur(raw, arrivals(j), D.set.tf, D.set.pm); });
  save(); renderHist(); renderStats(); renderCalNote();
  toast(`${L.length} jornada${L.length > 1 ? 's' : ''} actualizada${L.length > 1 ? 's' : ''}`, { undo: () => { snap.forEach(([j, t]) => { j.tot = t; }); save(); renderHist(); renderStats(); renderCalNote(); }, ms: 7000 });
};
$('#setRet').onchange = e => { D.set.ret = e.target.checked; save(); };
$('#setUnl').onchange = e => { D.set.unl = e.target.checked; save(); applyScope(); toast(D.set.unl ? 'Mapa y búsqueda sin límites' : 'Mapa y búsqueda limitados a Mallorca'); };
['ShN', 'ShM', 'ShT'].forEach(k => $('#set' + k).onchange = e => { D.set['s' + k.slice(1, 2).toLowerCase() + k.slice(2)] = e.target.checked; save(); });
$$('#sgAl button').forEach(b => b.onclick = () => { D.set.al = +b.dataset.v; save(); syncSettings(); });
$('#sTabs').onclick = e => { const b = e.target.closest('button'); if (!b) return; $$('#sTabs button').forEach(x => x.classList.toggle('on', x === b)); $$('#v-ajustes .sp').forEach(p => p.hidden = p.id !== 's-' + b.dataset.s); if (b.dataset.s === 'dat') renderBackupNote(); };
function renderAjustesLists() {
  const fb = $('#favBox');
  fb.innerHTML = D.fav ? `<div class="pt" style="padding:0"><span class="dot s"></span><div class="tx"><b>${esc(D.fav.label)}</b><small>${D.fav.lat.toFixed(5)}, ${D.fav.lon.toFixed(5)}</small></div><div class="ac"><button class="gb" id="favRn" aria-label="Cambiar nombre">${ic('edit')}</button><button class="gb dg" id="favRm" aria-label="Quitar punto habitual">${ic('trash')}</button></div></div>` : '<p class="hint">Sin punto habitual. Elige tu punto de partida y toca la estrella.</p>';
  if (D.fav) {
    $('#favRn').onclick = async () => { const v = await prompt2('Nombre del punto de partida habitual', D.fav.label); if (v && v.trim()) { const wasCur = D.cur.start && near(D.cur.start, D.fav); D.fav.label = v.trim(); if (wasCur) D.cur.start.label = D.fav.label; save(); renderAjustesLists(); renderRuta(); } };
    $('#favRm').onclick = () => { const old = D.fav; D.fav = null; save(); renderAjustesLists(); renderRuta(); toast('Punto habitual quitado', { undo: () => { D.fav = old; save(); renderAjustesLists(); renderRuta(); } }); };
  }
  const cl = $('#clList'); if (!cl) return; const cnt = visitCounts();
  cl.innerHTML = D.clients.length ? D.clients.slice().sort((a, b) => a.label.localeCompare(b.label, 'es')).map(c => `<div class="row" data-id="${c.id}"><div><b>${esc(c.label)}</b><small>${cnt.get(c.id) ? cnt.get(c.id) + ' visita' + (cnt.get(c.id) > 1 ? 's' : '') : 'Sin visitas guardadas'}</small></div><button class="gb rn" aria-label="Cambiar nombre de ${esc(c.label)}">${ic('edit')}</button><button class="gb dg rm" aria-label="Quitar ${esc(c.label)}">${ic('trash')}</button></div>`).join('') : '<p class="hint">Todavía no has guardado ninguno.</p>';
  cl.querySelectorAll('.row').forEach(r => {
    const c = D.clients.find(x => x.id === r.dataset.id); if (!c) return;
    r.querySelector('.rn').onclick = async () => { const v = await prompt2('Nombre del cliente', c.label, { text: 'Cambia también el nombre en las paradas de la ruta actual. El historial conserva el nombre de cada día, pero las visitas se siguen contando juntas.' }); if (v && v.trim()) { c.label = v.trim(); D.cur.stops.forEach(s => { if (s.cid === c.id) s.label = c.label; }); save(); renderAjustesLists(); renderRuta(); renderStats(); } };
    r.querySelector('.rm').onclick = () => { const i = D.clients.indexOf(c); D.clients.splice(i, 1); save(); renderAjustesLists(); renderRuta(); toast(`«${c.label}» quitado de clientes`, { undo: () => { D.clients.splice(i, 0, c); save(); renderAjustesLists(); renderRuta(); } }); };
  });
}

/* ---- Apariencia y accesibilidad ---- */
const PRE = [['Esmeralda', null, null], ['Turquesa', 185, .85], ['Azul', 214, .9], ['Índigo', 243, .8], ['Violeta', 272, .7], ['Rosa', 328, .75], ['Coral', 6, .85], ['Naranja', 27, .95], ['Ámbar', 42, .95], ['Grafito', 215, .12]];
function hexHS(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0; if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; h = (h * 60 + 360) % 360;
  const l = (mx + mn) / 2, s = d ? d / (1 - Math.abs(2 * l - 1)) : 0; return [Math.round(h), Math.round(s * 100) / 100];
}
function metaTheme() {
  const dark = document.documentElement.dataset.theme === 'dark', a = window.rzLast;
  const c = dark ? (a ? a.barD : '#0d1523') : (a ? a.barL : '#047857');
  $('meta[name=theme-color]').setAttribute('content', c);
}
function setAccent(h, s) {
  if (h == null) { delete P.ah; delete P.as; } else { P.ah = h; P.as = s; }
  saveP(); rzApply(P.ah, P.as); rzMan(P.ah, P.as); metaTheme(); renderAccent(); setTimeout(redrawAll, 30);
}
function renderAccent() {
  const sw = $('#sws'), cur = P.ah == null ? 0 : PRE.findIndex(p => p[1] === P.ah && p[2] === P.as);
  sw.innerHTML = PRE.map((p, i) => { const col = p[1] == null ? '#0a9d5c' : rzAcc(p[1], p[2]).fav; return `<button class="swc ${i === cur ? 'on' : ''}" role="radio" aria-checked="${i === cur}" aria-label="${p[0]}" title="${p[0]}" data-i="${i}" style="background:${col}"></button>`; }).join('');
  sw.querySelectorAll('.swc').forEach(b => b.onclick = () => { const p = PRE[+b.dataset.i]; setAccent(p[1], p[2]); });
  $('#swn').textContent = cur >= 0 ? PRE[cur][0] : 'Personalizado';
  $('#accIn').value = P.ah == null ? '#0a9d5c' : rzAcc(P.ah, P.as).fav;
  $('#icn').textContent = rzLocked() ? 'El icono de la app instalada conserva el color con el que se instaló.' : 'El icono de la app tomará este color al instalarla.';
}
$('#accIn').oninput = e => { const [h, s] = hexHS(e.target.value); setAccent(h, Math.max(.12, Math.min(1, s))); };
function applyTheme(t) {
  P.th = t; saveP();
  const eff = t === 'dark' || t === 'light' ? t : (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.dataset.theme = eff;
  $('#bTheme').innerHTML = ic(eff === 'dark' ? 'sun' : 'moon');
  $$('#sgTh button').forEach(b => b.classList.toggle('on', b.dataset.v === (t || 'auto')));
  metaTheme(); setTimeout(redrawAll, 30);
}
$('#bTheme').onclick = () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
$$('#sgTh button').forEach(b => b.onclick = () => applyTheme(b.dataset.v === 'auto' ? 'auto' : b.dataset.v));
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!P.th || P.th === 'auto') applyTheme('auto'); });
function syncA11y() {
  $$('#sgFs button').forEach(b => b.classList.toggle('on', +b.dataset.v === +(P.fs || 1)));
  $('#setHc').checked = !!P.hc; $('#setRm').checked = document.documentElement.classList.contains('rm'); $('#setMc').checked = !!P.mc;
}
$$('#sgFs button').forEach(b => b.onclick = () => { P.fs = +b.dataset.v; saveP(); document.documentElement.style.setProperty('--fs', P.fs); syncA11y(); setTimeout(() => map.invalidateSize(), 50); });
$('#setHc').onchange = e => { P.hc = e.target.checked; saveP(); document.documentElement.classList.toggle('hc', P.hc); };
$('#setRm').onchange = e => { P.rm = e.target.checked; saveP(); document.documentElement.classList.toggle('rm', P.rm); toast('El zoom del mapa cambia del todo al volver a abrir la app.'); };
$('#setMc').onchange = e => { P.mc = e.target.checked; saveP(); document.documentElement.classList.toggle('mapc', P.mc); };

/* =================== Copia de seguridad =================== */
function backupJSON() { return JSON.stringify({ app: 'rutahz', v: 2, ver: VER, exported: new Date().toISOString(), data: D, prefs: P }, null, 1); }
function markBackup() { M.lb = today(); saveM(); renderBackupNote(); hideBanner('bk'); }
// Chrome en Android no deja compartir archivos .json (no están en su lista de tipos permitidos): para enviar, la copia
// viaja como .txt con el mismo contenido. Guardar en el dispositivo sigue usando .json. Restaurar acepta los dos.
const canShareFiles = (() => { try { return !!(navigator.canShare && navigator.canShare({ files: [new File(['x'], 'p.txt', { type: 'text/plain' })] })); } catch (e) { return false; } })();
async function doBackup(share) {
  flush();
  const r = share
    ? await giveFile(`rutahz-copia-${today()}.txt`, backupJSON(), 'text/plain', 'Copia de Rutahz', 'share')
    : await giveFile(`rutahz-copia-${today()}.json`, backupJSON(), 'application/json', 'Copia de Rutahz', 'download');
  if (r === 'shared' || r === 'downloaded') { markBackup(); toast(r === 'shared' ? 'Copia enviada. Guárdala fuera del móvil.' : 'Copia guardada en Descargas.'); }
}
$('#bBkShare').onclick = () => doBackup(true);
$('#bBkDl').onclick = () => doBackup(false);
$('#bBkShare').hidden = !canShareFiles;
function renderBackupNote() {
  const el = $('#bkNote');
  if (!M.lb) { el.className = 'fm w'; el.innerHTML = `<b>Todavía no has hecho ninguna copia.</b> Si el navegador borra sus datos o cambias de móvil, sin copia se pierde todo.`; return; }
  const d = daysBetween(M.lb, today());
  el.className = d > 14 ? 'fm w' : 'fm';
  el.innerHTML = `Última copia: <b>${d <= 0 ? 'hoy' : d === 1 ? 'ayer' : 'hace ' + d + ' días'}</b>${d > 14 ? '. Conviene hacer otra.' : '.'}`;
}
async function persistStorage() {
  const el = $('#persistNote'); if (!navigator.storage || !navigator.storage.persist) { el.textContent = ''; return; }
  let p = await navigator.storage.persisted().catch(() => false);
  if (!p) p = await navigator.storage.persist().catch(() => false);
  el.innerHTML = p ? `${ic('shield', '')} El navegador ha marcado los datos como <b>protegidos</b>: no los borrará para liberar espacio.` : (isIOS() ? 'En iPhone, instalar la app en la pantalla de inicio evita que Safari borre los datos si no la abres en una semana.' : 'El navegador puede borrar los datos si le falta espacio. Instalar la app lo hace menos probable.');
  const s = el.querySelector('svg'); if (s) { s.style.cssText = 'width:15px;height:15px;vertical-align:-3px;color:var(--em)'; }
}
// ---- Restaurar: acepta la copia de la 2.0 y la de la versión anterior (Netlify) ----
const num = v => { const n = typeof v === 'string' ? parseFloat(v) : v; return isFinite(n) ? n : null; };
function cleanPt(p) { if (!p) return null; const lat = num(p.lat), lon = num(p.lon); if (lat == null || lon == null || !okLL({ lat, lon })) return null; return { lat, lon, label: String(p.label || '').slice(0, 120) }; }
function fromV1Entry(j, cpkDef) {
  const start = cleanPt(j.start); if (!start) return null; start.time = (j.start && j.start.time) || '';
  const stops = (j.stops || []).map(cleanPt).filter(Boolean).map(s => ({ ...s, cid: null }));
  const t = j.totals || {}, road = num(t.road) || 0, cost = num(t.cost) || 0;
  let iso = /^\d{4}-\d{2}-\d{2}$/.test(j.iso || '') ? j.iso : '';
  return { id: 'v1-' + (j.id || uid()), label: String(j.label || 'Jornada').slice(0, 80), iso, start, stops, ret: false, legs: Array.isArray(j.legsKm) ? j.legsKm.map(Number) : [], notes: String(j.notes || ''),
    tot: { road, dur: num(t.durationMin), cost, cpk: road ? cost / road : cpkDef, src: t.source === 'road' ? 'road' : 'straight', straight: num(t.straight) || 0, durM: null } };
}
function fromV2Entry(j) {
  const start = cleanPt(j.start); if (!start || !j.tot) return null; start.time = (j.start && j.start.time) || '';
  return { id: String(j.id || uid()), label: String(j.label || 'Jornada').slice(0, 80), iso: /^\d{4}-\d{2}-\d{2}$/.test(j.iso || '') ? j.iso : '', start,
    stops: (j.stops || []).map(s => { const p = cleanPt(s); return p ? { ...p, cid: s.cid || null } : null; }).filter(Boolean), ret: !!j.ret,
    legs: Array.isArray(j.legs) ? j.legs.map(Number) : [], legsDur: Array.isArray(j.legsDur) ? j.legsDur.map(Number) : [], notes: String(j.notes || ''),
    tot: { road: num(j.tot.road) || 0, dur: num(j.tot.dur), durRaw: num(j.tot.durRaw), tf: num(j.tot.tf), pm: num(j.tot.pm), durM: num(j.tot.durM), cost: num(j.tot.cost) || 0, cpk: num(j.tot.cpk), src: j.tot.src === 'road' ? 'road' : 'straight', straight: num(j.tot.straight) || 0 } };
}
function importBackup(obj) {
  let hist = [], clients = [], fav = null, set = null, cur = null, prefs = null;
  if (obj && obj.app === 'rutahz' && obj.data) {
    const d = obj.data;
    hist = (d.hist || []).map(fromV2Entry).filter(Boolean);
    if (d.edit && d.edit.snap) { const e = fromV2Entry(d.edit.snap); if (e) hist.push(e); }
    clients = (d.clients || []).map(c => { const p = cleanPt(c); return p ? { id: String(c.id || uid()), ...p } : null; }).filter(Boolean);
    fav = cleanPt(d.fav); set = d.set; cur = d.cur; prefs = obj.prefs;
  } else if (obj && (obj.state || Array.isArray(obj.history))) {
    const cpkDef = num(obj.state && obj.state.settings && obj.state.settings.costPerKm) ?? DEF_SET.cpk;
    hist = (obj.history || []).map(j => fromV1Entry(j, cpkDef)).filter(Boolean);
    if (obj.editingEntry && obj.editingEntry.snapshot) { const e = fromV1Entry(obj.editingEntry.snapshot, cpkDef); if (e) hist.push(e); }
    clients = (obj.clients || []).map(c => { const p = cleanPt(c); return p ? { id: String(c.id || uid()), ...p } : null; }).filter(Boolean);
    fav = cleanPt(obj.favorite);
    const s = (obj.state && obj.state.settings) || {};
    set = { cpk: num(s.costPerKm), rf: num(s.roadFactor), unl: !!s.mapUnlocked };
    if (obj.state && obj.state.start) cur = { start: obj.state.start, stops: obj.state.stops || [], notes: obj.state.notes || '' };
  } else throw new Error('formato');
  const fresh = !D.hist.length && !D.clients.length && !D.fav;
  const have = new Set(D.hist.map(j => String(j.id)));
  const newH = hist.filter(j => !have.has(String(j.id)));
  // clientes: por id o por posición (mismo sitio = mismo cliente)
  const idMap = new Map(); let newC = 0;
  clients.forEach(c => { const ex = D.clients.find(x => x.id === c.id) || D.clients.find(x => near(x, c)); if (ex) idMap.set(c.id, ex.id); else { D.clients.push(c); newC++; } });
  newH.forEach(j => j.stops.forEach(s => { if (s.cid && idMap.has(s.cid)) s.cid = idMap.get(s.cid); }));
  D.hist.push(...newH);
  if (!D.fav && fav) D.fav = fav;
  if (fresh && set) { if (num(set.cpk) != null) D.set.cpk = num(set.cpk); if (num(set.rf) != null) D.set.rf = num(set.rf); D.set.unl = !!set.unl; ['ret', 'shN', 'shM', 'shT'].forEach(k => { if (typeof set[k] === 'boolean') D.set[k] = set[k]; }); ['al', 'tf', 'pm'].forEach(k => { if (num(set[k]) != null) D.set[k] = num(set[k]); }); }
  if (!D.cur.stops.length && cur) { const st = cleanPt(cur.start); if (st) { const stops = (cur.stops || []).map(cleanPt).filter(Boolean).map(s => ({ ...s, id: uid(), cid: null })); if (stops.length) D.cur = { start: { ...st, time: '' }, stops, notes: String(cur.notes || ''), ret: typeof cur.ret === 'boolean' ? cur.ret : D.set.ret }; } }
  if (!D.cur.start && D.fav) D.cur.start = { ...D.fav, time: '' };
  if (fresh && prefs && typeof prefs === 'object') { ['th', 'fs', 'hc', 'rm', 'mc'].forEach(k => { if (prefs[k] != null) P[k] = prefs[k]; }); if (prefs.ah != null) { P.ah = prefs.ah; P.as = prefs.as; } saveP(); rzApply(P.ah, P.as); applyTheme(P.th || 'auto'); document.documentElement.style.setProperty('--fs', P.fs || 1); document.documentElement.classList.toggle('hc', !!P.hc); document.documentElement.classList.toggle('mapc', !!P.mc); renderAccent(); syncA11y(); }
  flush(); syncSettings(); renderAll(); applyScope(); recalc();
  return { h: newH.length, c: newC, dup: hist.length - newH.length };
}
$('#bkIn').onchange = e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  if (f.size > 20e6) return toast('El archivo es demasiado grande para ser una copia de Rutahz.');
  if (!/\.(json|txt)$/i.test(f.name) && f.type && !/json|text/.test(f.type)) return toast('Elige el archivo de la copia (.json o .txt).');
  const rd = new FileReader();
  rd.onload = async () => {
    let obj; try { obj = JSON.parse(rd.result); } catch (err) { return dlg({ title: 'No es una copia válida', text: 'El archivo no se puede leer. Elige el .json que guardaste con «Guardar copia».', acts: [{ t: 'Entendido', v: null }] }); }
    try {
      const r = importBackup(obj);
      dlg({ title: 'Copia restaurada', text: `${r.h} jornada${r.h === 1 ? '' : 's'} nueva${r.h === 1 ? '' : 's'}${r.c ? ` y ${r.c} cliente${r.c === 1 ? '' : 's'}` : ''}.${r.dup ? `\n${r.dup} ya las tenías y no se han duplicado.` : ''}${D.hist.some(est) ? '\n\nAlgunas jornadas tienen la distancia estimada: puedes recalcularlas en el Historial.' : ''}`, acts: [{ t: 'Ver historial', v: 'h', cls: 'g' }, { t: 'Listo', v: null }] }).then(v => { if (v === 'h') setView('hist'); });
    } catch (err) { dlg({ title: 'No es una copia de Rutahz', text: 'El archivo no tiene el formato de una copia de Rutahz (ni de la versión anterior).', acts: [{ t: 'Entendido', v: null }] }); }
  };
  rd.readAsText(f);
};
$('#bWipe').onclick = async () => {
  const v = await dlg({ title: '¿Borrar todos los datos?', text: 'Se borran la ruta actual, el historial, los clientes, el punto habitual, los ajustes y el PIN de este dispositivo. No se puede deshacer.\n\nEscribe BORRAR para confirmar.', ok: 'Borrar todo', danger: true, focus: true, html: '<input class="inp" id="wp" type="text" autocomplete="off" autocapitalize="characters" placeholder="BORRAR">', check: b => b.querySelector('#wp').value.trim().toUpperCase() === 'BORRAR' ? true : (toast('Escribe BORRAR para confirmar.'), undefined) });
  if (!v) return;
  [KEY, PFK, PINK, MK].forEach(ls.del);
  try { const ks = await caches.keys(); await Promise.all(ks.filter(k => k.startsWith('rz-tiles')).map(k => caches.delete(k))); } catch (e) {}
  toast('Datos borrados. Reiniciando…'); setTimeout(() => location.replace(location.pathname), 700);
};

/* =================== Bloqueo con PIN =================== */
const Lk = { step: 'unlock', buf: '', first: null, purpose: 'boot', fails: 0, until: 0 };
let hiddenAt = 0, locked = false;
async function pinHash(pin, salt) {
  if (!(window.crypto && crypto.subtle)) return null;
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('rutahz:' + salt + ':' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
async function pinOk(pin) { const s = ls.get(PINK); if (!s) return false; if (s.h) return (await pinHash(pin, s.s)) === s.h; return s.p === pin; }
async function pinSet(pin) { const salt = [...crypto.getRandomValues(new Uint8Array(8))].map(x => x.toString(16).padStart(2, '0')).join(''), h = await pinHash(pin, salt); ls.set(PINK, h ? { h, s: salt } : { p: pin }); }
const hasPin = () => !!ls.get(PINK);
function lockPaint() {
  const sub = { unlock: 'Introduce tu PIN', verify: 'Introduce tu PIN actual', create: Lk.purpose === 'change' ? 'Elige el PIN nuevo' : 'Crea un PIN de 4 cifras', confirm: 'Repítelo para confirmar' }[Lk.step];
  if (!(Lk.until > Date.now())) $('#lockSub').textContent = sub;
  $('#lockDots').innerHTML = [0, 1, 2, 3].map(i => `<i class="${i < Lk.buf.length ? 'f' : ''}"></i>`).join('');
  $('#lockRst').hidden = !(Lk.step === 'unlock' && Lk.purpose === 'boot');
}
function lockShake(msg) { Lk.buf = ''; lockPaint(); const d = $('#lockDots'); d.classList.add('sh'); $('#lockSub').textContent = msg; setTimeout(() => d.classList.remove('sh'), 400); }
function lockKey(k) {
  if (Lk.until > Date.now()) return;
  if (k === 'del') { Lk.buf = Lk.buf.slice(0, -1); return lockPaint(); }
  if (Lk.buf.length >= 4) return; Lk.buf += k; lockPaint();
  if (Lk.buf.length === 4) { const v = Lk.buf; Lk.buf = ''; setTimeout(() => lockDone(v), 110); } // el búfer se vacía ya: lo que se teclee después cuenta para el paso siguiente
}
async function lockDone(v) {
  if (Lk.step === 'unlock' || Lk.step === 'verify') {
    if (await pinOk(v)) { Lk.fails = 0; if (Lk.step === 'verify') { Lk.step = 'create'; lockPaint(); } else unlock(); }
    else { Lk.fails++; if (Lk.fails >= 5) { Lk.until = Date.now() + 30000; Lk.fails = 0; lockShake('Demasiados intentos. Espera 30 segundos.'); setTimeout(() => { Lk.until = 0; lockPaint(); }, 30000); } else lockShake('PIN incorrecto'); }
  } else if (Lk.step === 'create') { Lk.first = v; Lk.step = 'confirm'; lockPaint(); }
  else if (Lk.step === 'confirm') {
    if (v !== Lk.first) { Lk.step = 'create'; Lk.first = null; return lockShake('No coinciden. Empieza otra vez.'); }
    await pinSet(v); const boot = Lk.purpose === 'boot'; unlock(); if (!boot) toast('PIN cambiado'); else if (!M.fu) onFirstRun(); else toast('PIN creado');
  }
}
function showLock(step, purpose) { Object.assign(Lk, { step, purpose, buf: '', first: null }); locked = true; $('#lock').hidden = false; lockPaint(); if (layerOpen) closeLayer(null); }
function unlock() { locked = false; $('#lock').hidden = true; Lk.buf = ''; setTimeout(() => { map.invalidateSize(); runUrlAction(); if (!maybeNews()) maybeBanner(); }, 60); }
$('#lockKp').innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del'].map(k => k === '' ? '<span></span>' : k === 'del' ? `<button class="x" data-k="del" aria-label="Borrar">${ic('undo')}</button>` : `<button data-k="${k}">${k}</button>`).join('');
$('#lockKp').onclick = e => { const b = e.target.closest('button'); if (b) lockKey(b.dataset.k); };
document.addEventListener('keydown', e => { if (!locked) return; if (/^\d$/.test(e.key)) lockKey(e.key); else if (e.key === 'Backspace') lockKey('del'); });
$('#lockRst').onclick = async () => {
  if (!await ask('¿Has olvidado el PIN?', 'Se borra el PIN y creas uno nuevo. Tus rutas e historial no se borran: este PIN solo evita miradas indiscretas.', 'Crear PIN nuevo')) return;
  ls.del(PINK); showLock('create', 'boot');
};
$('#bLock').onclick = () => showLock(hasPin() ? 'unlock' : 'create', 'boot');
$('#bPin').onclick = () => showLock(hasPin() ? 'verify' : 'create', 'change');
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { hiddenAt = Date.now(); return; }
  if (!locked && hasPin() && D.set.al > 0 && hiddenAt && Date.now() - hiddenAt > D.set.al * 60000) showLock('unlock', 'boot');
  if (!document.hidden) { renderChip(); renderStats(); }
});

/* =================== Novedades =================== */
// La más reciente arriba. v = versión en la que llegó (formato de VER). Texto llano, pensado para quien usa la app.
const NEWS = [
  { v: '2026-11-02-8', d: '2026-11-02', t: 'Actualizar sin repetir el PIN', i: [
    'Si hay una versión nueva, el aviso sale ya en la <b>pantalla del PIN</b>: actualizas y pones el PIN una sola vez.',
    'Y si actualizas estando dentro, la app se recarga <b>sin volver a pedirte el PIN</b>.'] },
  { v: '2026-11-02-7', d: '2026-11-02', t: 'Ver una jornada', i: [
    '<b>Ver en el mapa</b> abre una pantalla propia de esa jornada: su ruta en el mapa y debajo el recorrido con km y tiempo de cada tramo, las notas y los botones Compartir, Editar y Repetir.',
    'Toca una parada de la lista para ir a ella en el mapa. La flecha de atrás vuelve al historial.'] },
  { v: '2026-11-02-6', d: '2026-11-02', t: 'Volver a un sitio', i: [
    'Si vuelves a un sitio donde ya has estado, el mapa lo muestra en un solo marcador con los dos números (por ejemplo «1 · 3»). Antes, el último tapaba al primero y parecía que faltaba una parada.',
    'Las paradas que quedan muy juntas al ver toda la isla se agrupan («1 · 2 · 3»): tócalo y el mapa se acerca para separarlas.',
    'En la lista de paradas pone «Vuelves a la parada 1».'] },
  { v: '2026-11-02-5', d: '2026-11-02', t: 'Informe donde toca', i: [
    'El <b>informe</b> (PDF y Excel) se saca desde <b>Historial</b> o <b>Resumen</b>, con el botón «Informe». Ya no está en Ajustes.'] },
  { v: '2026-11-02-4', d: '2026-11-02', t: 'Novedades en su sitio', i: [
    'Las <b>Novedades</b> están ahora al final de Ajustes › App, junto a la versión, como en las demás apps hz.'] },
  { v: '2026-11-02-3', d: '2026-11-02', t: 'Copias y novedades', i: [
    '<b>Enviar copia</b> ahora abre el menú para compartir (WhatsApp, correo, Drive) también en Android. Antes acababa descargando, igual que el otro botón.',
    '<b>Guardar en este dispositivo</b> la deja en Descargas. Restaurar acepta los dos formatos.',
    'Esta sección de <b>Novedades</b>: sale sola tras cada actualización y la tienes en Ajustes › App.'] },
  { v: '2026-11-02-2', d: '2026-11-02', t: 'La vuelta, a la vista', i: [
    'Debajo del total se ve cuánto suma <b>la vuelta</b> al punto de partida.',
    'Toca <b>«Al volante»</b> para ver el tiempo de cada tramo.'] },
  { v: '2026-11-02-1', d: '2026-11-02', t: 'Más cómoda en el móvil', i: [
    '<b>Guardar jornada</b> ya no tapa las paradas: está en el resumen y al final de la página.',
    'El iPhone ya no hace zoom al escribir y los botones son más fáciles de pulsar.'] },
  { v: '2026-11-02-0', d: '2026-11-02', t: 'Tiempo al volante', i: [
    'Tiempo más realista: suma un margen por <b>tráfico</b> y unos minutos para <b>aparcar</b> en cada llegada.',
    'Puedes anotar el <b>tiempo real</b> al guardar una jornada; es el que cuenta en informes.',
    '<b>Calibrar</b> ajusta la estimación a tu forma de conducir (Ajustes › General).',
    'Informe y Excel con horas al volante, hora de salida y recorrido por tramos.'] },
  { v: '2026-11-01-3', d: '2026-11-01', t: 'Destinos', i: [
    'Nueva pestaña <b>Destinos</b>: tus sitios habituales con sus visitas, para añadirlos en un toque.',
    '<b>Planificar</b>: elige varios destinos en orden y se añaden de golpe.',
    '<b>Ordenar</b> paradas para hacer menos km.'] },
  { v: '2026-11-01-2', d: '2026-11-01', t: 'Logo de Mallorca', i: ['Nuevo icono con la silueta de la isla, en el color que elijas.'] },
  { v: '2026-11-01-0', d: '2026-11-01', t: 'Rutahz 2.0', i: [
    'Diseño nuevo con <b>10 colores</b>, modo oscuro y ajustes de accesibilidad.',
    '<b>Volver a la oficina</b> suma la vuelta a los km.',
    '<b>Elegir en el mapa</b> con un punto fijo: se acabaron las paradas sin querer.',
    'Informes en PDF y Excel por mes, año o fechas.',
    'Copia de seguridad que se envía directamente y PIN más seguro.'] },
];
// Como en noticiahz: cada versión con su número; la primera es la que tienes
function showNews(since) {
  const list = since ? NEWS.filter(n => n.v > since) : NEWS;
  if (!list.length) return;
  dlg({ title: 'Novedades', acts: [{ t: 'Cerrar', v: null }],
    html: `<div class="chgl">${list.map(n => `<section><h4><span>${esc(n.v)}${n.v === NEWS[0].v ? ' <small class="cur">· la que tienes</small>' : ''}</span><small>${esc(fmtDate(n.d, { day: 'numeric', month: 'short' }))}</small></h4><p class="cht">${esc(n.t)}</p><ul>${n.i.map(x => `<li>${x}</li>`).join('')}</ul></section>`).join('')}</div>` });
}
function maybeNews() {
  const seen = M.sv || (M.fu ? '2026-11-02-2' : null); M.sv = VER; saveM(); // quien ya usaba la app antes de esta sección ve solo lo último
  if (!seen || seen === VER || layerOpen) return false;
  if (!NEWS.some(n => n.v > seen)) return false;
  setTimeout(() => showNews(seen), 400); return true;
}
$('#bNews').onclick = () => showNews();

/* =================== Primera vez y ayuda =================== */
function onFirstRun() {
  M.fu = M.fu || today(); M.sv = VER; saveM();
  dlg({ title: 'Bienvenido a Rutahz 2.0', text: '¿Usabas la versión anterior? Esta vive en otra dirección web, así que tus rutas no aparecen solas: restaura la copia que guardaste allí con «Guardar copia».', acts: [{ t: 'Empezar de cero', cls: 'g', v: 'new' }, { t: 'Restaurar copia', v: 'imp', icon: 'ul' }] })
    .then(v => { if (v === 'imp') $('#bkIn').click(); else showHelp(); });
}
function showHelp() {
  dlg({ title: 'Cómo funciona', acts: [{ t: 'Entendido', v: null }],
    html: `<ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:10px;font-size:.9rem;line-height:1.45">
      <li><b>Punto de partida.</b> Busca tu oficina o elígela en el mapa y toca la ${ic('star')} estrella: cada jornada nueva empezará ahí.</li>
      <li><b>Paradas.</b> Añade cada visita en orden: escribiendo un destino guardado o la dirección, con «Elegir en el mapa» o con el GPS. En <b>Destinos</b> guardas tus sitios habituales.</li>
      <li><b>Vuelta.</b> El interruptor «Volver a…» suma el regreso al punto de partida.</li>
      <li><b>Guardar jornada.</b> Ponle fecha (también días pasados) y queda en el Historial.</li>
      <li><b>Tiempo.</b> El tiempo al volante es una estimación. Si anotas el real al guardar, es el que sale en los informes; con unos cuantos, Ajustes › Tiempo al volante › Calibrar ajusta la estimación a tu forma de conducir.</li>
      <li><b>Informe.</b> Con el botón «Informe» de Historial o Resumen sacas el PDF o el Excel del mes.</li>
      <li><b>Copia.</b> Los datos solo están en este móvil: haz copia en Ajustes › Datos.</li></ol>` });
}
$('#bHelp').onclick = showHelp;

/* =================== Avisos: actualización, instalar, copia =================== */
let bannerKind = null, installEvt = null, newVer = null;
function hideBanner(k) { if (!k || bannerKind === k) { $('#banner').hidden = true; bannerKind = null; document.documentElement.style.setProperty('--banh', '0px'); } }
function banner(k, icon, title, sub, acts) {
  const el = $('#banner'); bannerKind = k;
  el.innerHTML = `<span class="upi">${ic(icon)}</span><span class="upt"><b>${esc(title)}</b><small>${esc(sub)}</small></span><button class="upx" aria-label="Cerrar">${ic('x')}</button><div class="acts">${acts.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${a.icon ? ic(a.icon) : ''}${esc(a.t)}</button>`).join('')}</div>`;
  el.hidden = false; requestAnimationFrame(() => document.documentElement.style.setProperty('--banh', (el.offsetHeight + 10) + 'px'));
  el.querySelector('.upx').onclick = () => { hideBanner(); acts[0].fn && acts[0].fn(true); };
  el.querySelectorAll('.acts button').forEach(b => b.onclick = () => { const a = acts[+b.dataset.i]; hideBanner(); a.fn && a.fn(); });
}
function maybeBanner() {
  if (locked || pick) return;
  const now = Date.now();
  if (newVer) return banner('up', 'refresh', 'Hay una versión nueva de Rutahz', 'Se instala al momento y no toca tus datos.', [{ t: 'Más tarde', cls: 'g' }, { t: 'Actualizar', fn: applyUpdate }]);
  if (!rzInApp() && (M.iz || 0) < now && (M.in || 0) < 3) {
    if (installEvt) return banner('in', 'inst', 'Instala Rutahz', 'Se abre desde el icono y el navegador protege mejor tus datos.', [{ t: 'Ahora no', cls: 'g', fn: () => { M.iz = now + 7 * 864e5; M.in = (M.in || 0) + 1; saveM(); } }, { t: 'Instalar', fn: doInstall }]);
    if (isIOS() && D.hist.length >= 1) return banner('in', 'inst', 'Instálala en tu iPhone', 'Toca Compartir y «Añadir a pantalla de inicio». Así Safari no borra tus datos si pasas una semana sin abrirla.', [{ t: 'Más tarde', cls: 'g', fn: () => { M.iz = now + 7 * 864e5; M.in = (M.in || 0) + 1; saveM(); } }, { t: 'Entendido', fn: () => { M.iz = now + 30 * 864e5; M.in = (M.in || 0) + 1; saveM(); } }]);
  }
  if ((D.hist.length >= 3 || (D.hist.length && M.fu && daysBetween(M.fu, today()) >= 3)) && (M.bz || 0) < now && (!M.lb || daysBetween(M.lb, today()) > 14)) {
    const d = M.lb ? daysBetween(M.lb, today()) : null;
    return banner('bk', 'shield', 'Haz una copia de seguridad', d == null ? `Tienes ${D.hist.length} jornada${D.hist.length > 1 ? 's' : ''} y ninguna copia.` : `La última fue hace ${d} días.`, [{ t: 'Más tarde', cls: 'g', fn: () => { M.bz = now + 3 * 864e5; saveM(); } }, { t: 'Hacer copia', icon: 'share', fn: () => doBackup(true) }]);
  }
}
addEventListener('beforeinstallprompt', e => { if (rzInApp()) return; e.preventDefault(); installEvt = e; renderInstall(); if (!bannerKind) maybeBanner(); });
addEventListener('appinstalled', () => { installEvt = null; renderInstall(); hideBanner('in'); toast('Rutahz instalada'); persistStorage(); });
async function doInstall() {
  if (installEvt) { installEvt.prompt(); const r = await installEvt.userChoice.catch(() => null); installEvt = null; renderInstall(); if (r && r.outcome !== 'accepted') { M.in = (M.in || 0) + 1; saveM(); } return; }
  dlg({ title: 'Instalar Rutahz', text: isIOS() ? 'En Safari, toca el botón Compartir (el cuadrado con la flecha) y elige «Añadir a pantalla de inicio».' : 'Abre el menú del navegador (⋮) y elige «Instalar aplicación» o «Añadir a pantalla de inicio».', acts: [{ t: 'Entendido', v: null }] });
}
function renderInstall() {
  const inApp = rzInApp();
  $('#bInstall').hidden = inApp; $('#instP').textContent = inApp ? 'Ya estás usando la app instalada.' : 'Acceso desde el icono, a pantalla completa y más protegida frente al borrado automático del navegador.';
}
$('#bInstall').onclick = doInstall;
async function checkUpdate(manual) {
  if (!navigator.onLine || !/^https?:$/.test(location.protocol)) { if (manual) toast('Necesitas conexión para comprobarlo.'); return; }
  try {
    const t = (await (await fetch('version.txt', { cache: 'no-store' })).text()).trim();
    if (/^\d{4}-\d{2}-\d{2}-[\d.]+$/.test(t) && t !== VER) { newVer = t; $('#lockUpd').hidden = false; maybeBanner(); if (manual) toast('Hay una versión nueva: ' + t); }
    else if (manual) toast('Tienes la última versión.');
  } catch (e) { if (manual) toast('No se ha podido comprobar ahora.'); }
}
// Si ya has puesto el PIN, la recarga de la actualización no lo vuelve a pedir (válido 2 min, solo en esta pestaña)
const UL_KEY = 'rz_ul';
async function applyUpdate() {
  flush(); toast('Actualizando…', { ms: 8000 });
  if (!locked) { try { sessionStorage.setItem(UL_KEY, String(Date.now() + 120000)); } catch (e) {} }
  else { $('#lockSub').textContent = 'Actualizando…'; $('#lockUpd').disabled = true; }
  try { const r = await navigator.serviceWorker?.getRegistration(); if (r) await r.update(); const res = await fetch('./', { cache: 'reload' }); if (res.ok) for (const k of (await caches.keys()).filter(k => /^rz-v\d+$/.test(k))) await (await caches.open(k)).put('index.html', res.clone()); } catch (e) {}
  location.reload();
}
$('#bUpd').onclick = () => checkUpdate(true);
$('#lockUpd').onclick = applyUpdate;
$('#verT').textContent = 'Rutahz ' + VER; $('#verAbt').textContent = 'Versión ' + VER;

/* =================== Vistas =================== */
let view = 'ruta';
function setView(v) {
  if (pick && v !== 'ruta') endPick();
  if (view === 'ver' && v !== 'ver') closeHistView();
  view = v; document.body.className = document.body.className.replace(/\bv-\w+/g, '').trim() + ' v-' + v;
  if (document.body.classList.contains('busy') && !routing) document.body.classList.remove('busy');
  $$('.view').forEach(s => s.hidden = s.id !== 'v-' + v);
  $$('.tab,.bb button').forEach(b => { const on = b.dataset.v === (v === 'ver' ? 'hist' : v); b.classList.toggle('on', on); if (on) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  if (v === 'stats') renderStats(); if (v === 'hist') renderHist(); if (v === 'dest') renderDest(); else if (dSel) dSel = null; if (v === 'ajustes') { renderAjustesLists(); renderBackupNote(); }
  if (isMob()) scrollTo({ top: 0 }); else $('#pane').scrollTop = 0;
  if (v === 'ruta' || v === 'ver') setTimeout(() => map.invalidateSize(), 30);
}
$$('.tab,.bb button').forEach(b => b.onclick = () => setView(b.dataset.v));
$('#bGoDest').onclick = () => setView('dest');
function renderAll() { renderRuta(); renderHist(); renderStats(); renderChip(); renderAjustesLists(); }
function netPaint() { $('#offB').hidden = navigator.onLine; }
addEventListener('online', () => { netPaint(); if (R.src === 'straight') { toast('Conexión recuperada: recalculando por carretera…'); routeCache.clear(); recalc(); } });
addEventListener('offline', () => { netPaint(); toast('Sin conexión: la distancia será aproximada hasta que vuelva.'); });
function runUrlAction() {
  const a = new URLSearchParams(location.search).get('a'); if (!a) return;
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  if (a === 'hist') setView('hist');
  else if (a === 'report') { setView('hist'); exportDlg('mes'); }
  else if (a === 'add') { setView('ruta'); setTimeout(() => $('#stopQ').focus(), 200); }
}

/* =================== Arranque =================== */
loadData();
syncSettings(); syncA11y(); renderAccent(); applyTheme(P.th || 'auto'); renderInstall(); netPaint();
applyScope(); renderAll();
if (pointsOf(D.cur).length) setTimeout(() => { map.invalidateSize(); fitCur(); }, 120);
recalc();
let skipPin = false; try { const u = +sessionStorage.getItem(UL_KEY); sessionStorage.removeItem(UL_KEY); skipPin = u > Date.now(); } catch (e) {}
if (hasPin() && skipPin) { locked = false; setTimeout(() => { map.invalidateSize(); if (!maybeNews()) maybeBanner(); }, 300); }
else if (hasPin()) showLock('unlock', 'boot'); else showLock('create', 'boot');
persistStorage();
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) navigator.serviceWorker.register('sw.js').catch(() => {});
checkUpdate(false); // enseguida: si hay versión nueva, el aviso sale ya en la pantalla del PIN
window.__rz = { D, get R() { return R; }, importBackup, setView };
})();
</script>
</body>
</html>
