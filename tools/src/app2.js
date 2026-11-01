
/* =================== Mapa =================== */
const MB = L.latLngBounds([B.latMin - 0.10, B.lonMin - 0.12], [B.latMax + 0.10, B.lonMax + 0.12]);
const RM = document.documentElement.classList.contains('rm');
const map = L.map('map', { zoomControl: false, zoomAnimation: !RM, fadeAnimation: !RM, markerZoomAnimation: !RM, inertia: !RM, tap: false }).setView([39.62, 2.9], 10);
map.attributionControl.setPrefix(false);
if (matchMedia('(hover:hover) and (pointer:fine)').matches) L.control.zoom({ position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(map);
let tileErrAt = 0;
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}', {
  maxZoom: 19, crossOrigin: true, attribution: 'Mapa © Esri, HERE, Garmin · © colaboradores de OpenStreetMap'
}).on('tileerror', () => { if (navigator.onLine && Date.now() - tileErrAt > 60000) { tileErrAt = Date.now(); toast('Parte del mapa no ha cargado. Comprueba la conexión.'); } }).addTo(map);
const lyRoute = L.layerGroup().addTo(map), lyMk = L.layerGroup().addTo(map), lyHist = L.layerGroup().addTo(map), lyMe = L.layerGroup().addTo(map);
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const pinIcon = (cls, txt) => L.divIcon({ className: '', html: `<div class="pin ${cls}">${txt || ''}</div>`, iconSize: [28, 28], iconAnchor: [14, 14] });
function applyScope() {
  if (D.set.unl) { map.setMaxBounds(null); map.setMinZoom(3); }
  else {
    map.setMaxBounds(MB); map.options.maxBoundsViscosity = 1;
    const z = map.getBoundsZoom(MB, true); map.setMinZoom(Math.max(8, z - 0));
    if (!MB.contains(map.getCenter())) map.setView([39.62, 2.9], 10);
  }
}
let viewingHist = null;
function drawMarkers() {
  lyMk.clearLayers();
  if (viewingHist) return;
  const c = D.cur;
  if (c.start) {
    const m = L.marker([c.start.lat, c.start.lon], { icon: pinIcon('s'), draggable: true, title: c.start.label || 'Inicio', keyboard: false, zIndexOffset: 500 });
    m.bindTooltip(esc(c.start.label || 'Punto de partida'), { direction: 'top', offset: [0, -12] });
    m.on('dragend', () => moved(c.start, m, 'Punto de partida movido'));
    m.addTo(lyMk);
  }
  c.stops.forEach((s, i) => {
    const m = L.marker([s.lat, s.lon], { icon: pinIcon('', i + 1), draggable: true, title: s.label || `Parada ${i + 1}`, keyboard: false, zIndexOffset: 1000 + i });
    m.bindTooltip(esc(s.label || `Parada ${i + 1}`), { direction: 'top', offset: [0, -12] });
    m.on('dragend', () => moved(s, m, `Parada ${i + 1} movida`));
    m.addTo(lyMk);
  });
}
function moved(pt, m, msg) {
  const old = { lat: pt.lat, lon: pt.lon }, p = m.getLatLng();
  pt.lat = p.lat; pt.lon = p.lng;
  if (pt === D.cur.start && D.fav && near(old, D.fav)) { /* si era el favorito, el favorito no se mueve solo */ }
  save(); drawMarkers(); recalc();
  toast(msg, { undo: () => { pt.lat = old.lat; pt.lon = old.lon; save(); drawMarkers(); recalc(); } });
}
function drawRoute() {
  lyRoute.clearLayers();
  if (viewingHist) return;
  const pts = pointsOf(D.cur); if (pts.length < 2) return;
  const em = css('--em2') || '#059669', halo = css('--card') || '#fff';
  const line = R.src === 'road' && R.geom && R.geom.length > 1 ? R.geom : pts.map(p => [p.lat, p.lon]);
  const dash = R.src === 'road' ? null : '2 9';
  L.polyline(line, { color: halo, weight: 8, opacity: .85, interactive: false, dashArray: dash }).addTo(lyRoute);
  L.polyline(line, { color: em, weight: 4.5, opacity: .95, interactive: false, dashArray: dash, lineCap: 'round' }).addTo(lyRoute);
}
function fitCur(pad = 40) {
  const pts = viewingHist ? pointsOf(viewingHist) : pointsOf(D.cur);
  if (!pts.length) { map.setView([39.62, 2.9], 10); return; }
  if (pts.length === 1) { map.setView([pts[0].lat, pts[0].lon], 14); return; }
  map.fitBounds(L.latLngBounds(pts.map(p => [p.lat, p.lon])), { padding: [pad, pad], maxZoom: 15, animate: !RM });
}
function redrawAll() { drawMarkers(); drawRoute(); if (viewingHist) showHistOnMap(viewingHist, true); }
$('#mFit').onclick = () => fitCur();
$('#mLoc').onclick = () => gps(p => {
  lyMe.clearLayers();
  L.marker([p.lat, p.lon], { icon: L.divIcon({ className: '', html: '<div class="me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }), interactive: false }).addTo(lyMe);
  map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15), { animate: !RM });
});
let tapHint = 0;
map.on('click', e => {
  if (pick) { map.panTo(e.latlng, { animate: !RM }); return; }
  if (viewingHist) return;
  if (++tapHint === 2 && !M.tapHint) { M.tapHint = 1; saveM(); toast('Para añadir una parada, usa «Elegir en el mapa» o el buscador.', { ms: 4200 }); }
});

/* ---- Ver una jornada guardada en el mapa ---- */
async function showHistOnMap(j, keep) {
  viewingHist = j; lyHist.clearLayers(); drawMarkers(); drawRoute();
  if (!j.start) return;
  setView('ruta');
  const pts = pointsOf(j);
  L.marker([j.start.lat, j.start.lon], { icon: pinIcon('s h'), interactive: false }).addTo(lyHist);
  j.stops.forEach((s, i) => L.marker([s.lat, s.lon], { icon: pinIcon('h', i + 1), interactive: false }).bindTooltip(esc(s.label || `Parada ${i + 1}`)).addTo(lyHist));
  $('#histPill').hidden = false; $('#histPillT').innerHTML = `<b>${esc(j.label)}</b> · ${esc(fmtDateS(j.iso))} · ${fmtKm(j.tot.road)}`;
  if (!keep) { if (isMob()) scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' }); setTimeout(() => { map.invalidateSize(); fitCur(50); }, 60); }
  const r = await computeRoute(pts);
  if (viewingHist !== j) return;
  const line = r.geom && r.geom.length > 1 ? r.geom : pts.map(p => [p.lat, p.lon]);
  const col = css('--mu') || '#5a6578';
  L.polyline(line, { color: css('--card'), weight: 8, opacity: .85, interactive: false }).addTo(lyHist);
  L.polyline(line, { color: col, weight: 4.5, opacity: .9, interactive: false, dashArray: r.src === 'road' ? null : '2 9' }).addTo(lyHist);
}
function closeHistView() { viewingHist = null; lyHist.clearLayers(); $('#histPill').hidden = true; drawMarkers(); drawRoute(); }
$('#histPillX').onclick = closeHistView;

/* ---- Elegir en el mapa (punto fijo en el centro: sin toques accidentales) ---- */
let pick = null, pickT = null, pickTok = 0;
function startPick(kind, ref0) {
  if (viewingHist) closeHistView();
  setView('ruta');
  pick = { kind, label: '', ref: kind === 'dest-move' ? ref0 : null }; document.body.classList.add('picking');
  $('#pick').hidden = false; $('#pickBar').hidden = false;
  $('#pickOkT').textContent = { start: 'Fijar inicio aquí', stop: 'Añadir aquí', 'dest-new': 'Guardar aquí', 'dest-move': 'Mover aquí' }[kind] || 'Añadir aquí';
  $('#pickT').textContent = 'Mueve el mapa hasta el punto'; $('#pickS').textContent = 'La punta del marcador marca el sitio exacto';
  if (isMob()) scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
  const ref = ref0 || (kind === 'stop' ? (D.cur.stops[D.cur.stops.length - 1] || D.cur.start) : (D.cur.start || D.fav));
  setTimeout(() => { map.invalidateSize(); if (ref && map.getZoom() < 14) map.setView([ref.lat, ref.lon], 15, { animate: !RM }); else pickLookup(); }, 80);
  map.on('moveend', pickMoved);
}
function pickMoved() { clearTimeout(pickT); $('#pickT').textContent = 'Buscando la dirección…'; pickT = setTimeout(pickLookup, 450); }
async function pickLookup() {
  if (!pick) return;
  const my = ++pickTok, c = map.getCenter();
  pick.label = '';
  if (!navigator.onLine) { $('#pickT').textContent = 'Punto en el mapa'; $('#pickS').textContent = 'Sin conexión: le pondrás nombre después'; return; }
  try {
    const r = await geoReverse(c.lat, c.lng);
    if (my !== pickTok || !pick) return;
    const p = placeLabel(r); pick.label = p.label;
    $('#pickT').textContent = p.main; $('#pickS').textContent = p.sub || 'Toca «' + $('#pickOkT').textContent + '»';
  } catch (e) { if (my === pickTok) { $('#pickT').textContent = 'Punto en el mapa'; $('#pickS').textContent = 'No se ha encontrado la dirección'; } }
}
function endPick() { pick = null; document.body.classList.remove('picking'); setTimeout(() => map.invalidateSize(), 30); clearTimeout(pickT); map.off('moveend', pickMoved); $('#pick').hidden = true; $('#pickBar').hidden = true; }
$('#pickNo').onclick = endPick;
$('#pickOk').onclick = () => {
  if (!pick) return; const c = map.getCenter(), k = pick.kind, lb = pick.label || 'Punto en el mapa', ref = pick.ref;
  endPick();
  if (k === 'start') setStart(c.lat, c.lng, lb);
  else if (k === 'dest-new') newDestAt(c.lat, c.lng, lb);
  else if (k === 'dest-move' && ref) { const o = { lat: ref.lat, lon: ref.lon }; ref.lat = c.lat; ref.lon = c.lng; ref.addr = lb; save(); renderDest(); setView('dest'); toast(`«${ref.label}» movido`, { undo: () => { ref.lat = o.lat; ref.lon = o.lon; save(); renderDest(); } }); }
  else addStop(c.lat, c.lng, lb);
};

/* =================== Acciones de la ruta =================== */
function gps(cb) {
  if (!navigator.geolocation) return toast('Este dispositivo no permite la ubicación.');
  if (window.isSecureContext === false) return toast('La ubicación solo funciona con la app abierta por https.');
  toast('Buscando tu ubicación…', { ms: 9000 });
  navigator.geolocation.getCurrentPosition(p => { $('#toast').classList.remove('show'); cb({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }); }, err => {
    toast(err.code === 1 ? 'Permiso de ubicación denegado. Actívalo para esta web en los ajustes del navegador.' : err.code === 3 ? 'Se ha tardado demasiado en encontrar tu ubicación. Prueba otra vez.' : 'No se ha podido saber tu ubicación ahora.', { ms: 4500 });
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 20000 });
}
async function labelFor(lat, lon, fallback) {
  if (!navigator.onLine) return fallback;
  try { return placeLabel(await geoReverse(lat, lon)).label; } catch (e) { return fallback; }
}
function setStart(lat, lon, label) {
  if (viewingHist) closeHistView();
  const t = D.cur.start ? D.cur.start.time : '';
  D.cur.start = { lat, lon, label: label || 'Punto de partida', time: t || '' };
  startOpen = false;
  save(); renderRuta(); recalc(); fitCur();
}
function addStop(lat, lon, label, cid, quiet) {
  if (viewingHist) closeHistView();
  if (!D.cur.start) { toast('Primero elige el punto de partida.'); return; }
  const cl = cid ? D.clients.find(c => c.id === cid) : D.clients.find(c => near(c, { lat, lon }));
  const s = { id: uid(), lat, lon, label: label || (cl ? cl.label : `Parada ${D.cur.stops.length + 1}`), cid: cl ? cl.id : null };
  D.cur.stops.push(s);
  save(); renderRuta(); recalc();
  if (!quiet) toast(`Añadida: ${s.label}`, { undo: () => { D.cur.stops = D.cur.stops.filter(x => x !== s); save(); renderRuta(); recalc(); } });
  if (!isMob() || pick) map.panTo([lat, lon], { animate: !RM });
}
function removeStop(s) {
  const i = D.cur.stops.indexOf(s); if (i < 0) return;
  D.cur.stops.splice(i, 1); save(); renderRuta(); recalc();
  toast(`Quitada: ${s.label}`, { undo: () => { D.cur.stops.splice(Math.min(i, D.cur.stops.length), 0, s); save(); renderRuta(); recalc(); } });
}
function moveStop(s, to) {
  const a = D.cur.stops, i = a.indexOf(s); if (i < 0) return;
  const j = to === 'up' ? i - 1 : to === 'down' ? i + 1 : to === 'first' ? 0 : a.length - 1;
  if (j < 0 || j >= a.length || j === i) return;
  a.splice(i, 1); a.splice(j, 0, s); save(); renderRuta(); recalc();
}
function toggleClient(s) {
  const cl = D.clients.find(c => c.id === s.cid) || D.clients.find(c => near(c, s));
  if (cl) {
    const idx = D.clients.indexOf(cl); D.clients.splice(idx, 1);
    D.cur.stops.forEach(x => { if (x.cid === cl.id) x.cid = null; });
    save(); renderRuta(); renderAjustesLists();
    toast(`«${cl.label}» ya no está en tus destinos`, { undo: () => { D.clients.splice(idx, 0, cl); D.cur.stops.forEach(x => { if (near(x, cl)) x.cid = cl.id; }); save(); renderRuta(); renderAjustesLists(); } });
  } else {
    const c = { id: uid(), lat: s.lat, lon: s.lon, label: s.label || 'Destino', addr: s.label || '', at: today() };
    D.clients.push(c); s.cid = c.id; save(); renderRuta(); renderAjustesLists();
    toast(`Guardado en tus destinos: ${c.label}`);
  }
}
function stopMenu(s) {
  const a = D.cur.stops, i = a.indexOf(s), isCl = !!(D.clients.find(c => c.id === s.cid) || D.clients.find(c => near(c, s)));
  sheet({ title: s.label || `Parada ${i + 1}`, sub: `Parada ${i + 1} de ${a.length}`, items: [
    i > 0 && { icon: 'up', label: 'Subir', fn: () => moveStop(s, 'up') },
    i < a.length - 1 && { icon: 'down', label: 'Bajar', fn: () => moveStop(s, 'down') },
    { icon: 'eye', label: 'Ver en el mapa', fn: () => { setView('ruta'); if (isMob()) scrollTo({ top: 0 }); setTimeout(() => { map.invalidateSize(); map.setView([s.lat, s.lon], 16, { animate: !RM }); }, 60); } },
    { icon: 'edit', label: 'Cambiar nombre', fn: async () => { const v = await prompt2('Nombre de la parada', s.label); if (v != null && v.trim()) { s.label = v.trim(); save(); renderRuta(); drawMarkers(); } } },
    { icon: 'dest', label: isCl ? 'Quitar de mis destinos' : 'Guardar en mis destinos', sub: isCl ? '' : 'Para añadirlo en un toque otro día', fn: () => toggleClient(s) },
    { icon: 'trash', label: 'Quitar parada', danger: true, fn: () => removeStop(s) },
  ] });
}

/* =================== Búsqueda (clientes, municipios y direcciones) =================== */
function setupSearch(inp, box, kind) {
  let t = null, tok = 0, items = [];
  const close = () => { box.hidden = true; box.innerHTML = ''; items = []; };
  function paint(live, state) {
    const q = norm(inp.value); items = [];
    let h = '';
    if (kind === 'stop' && inp.id === 'stopQ') {
      const cnt = visitCounts();
      const cl = D.clients.filter(c => norm(c.label).includes(q)).sort((a, b) => (cnt.get(b.id) || 0) - (cnt.get(a.id) || 0)).slice(0, 5);
      if (cl.length) { h += '<h6>Tus destinos</h6>'; cl.forEach(c => { items.push({ lat: c.lat, lon: c.lon, label: c.label, cid: c.id }); h += `<button data-i="${items.length - 1}">${ic('star')}<div><b>${esc(c.label)}</b><small>${cnt.get(c.id) ? cnt.get(c.id) + ' visita' + (cnt.get(c.id) > 1 ? 's' : '') : 'Destino guardado'}</small></div></button>`; }); }
    }
    if (kind === 'start' && D.fav && norm(D.fav.label).includes(q)) { items.push({ ...D.fav }); h += `<h6>Habitual</h6><button data-i="${items.length - 1}">${ic('star')}<div><b>${esc(D.fav.label)}</b><small>Tu punto de partida habitual</small></div></button>`; }
    const tw = TOWNS.filter(x => norm(x[0]).startsWith(q) || (q.length > 2 && norm(x[0]).includes(q))).slice(0, 3);
    if (tw.length) { h += '<h6>Municipios</h6>'; tw.forEach(x => { items.push({ lat: x[1], lon: x[2], label: x[0] }); h += `<button data-i="${items.length - 1}">${ic('pin')}<div><b>${esc(x[0])}</b><small>Centro del municipio</small></div></button>`; }); }
    if (live && live.length) { h += '<h6>Direcciones</h6>'; live.forEach(r => { const p = placeLabel(r); items.push({ lat: +r.lat, lon: +r.lon, label: p.label }); h += `<button data-i="${items.length - 1}">${ic('pin')}<div><b>${esc(p.main)}</b><small>${esc(p.sub)}</small></div></button>`; }); }
    if (state === 'busy') h += '<p class="ld">Buscando direcciones…</p>';
    else if (state === 'none' && !items.length) h += '<p>Sin resultados. Prueba con otra forma de escribirlo o usa «Elegir en el mapa».</p>';
    else if (state === 'off') h += '<p>Sin conexión: solo tus destinos y los municipios.</p>';
    else if (state === 'err') h += '<p>No se ha podido buscar ahora. Usa «Elegir en el mapa».</p>';
    box.innerHTML = h; box.hidden = !h;
    box.querySelectorAll('button[data-i]').forEach(b => b.onmousedown = e => e.preventDefault());
    box.querySelectorAll('button[data-i]').forEach(b => b.onclick = () => choose(items[+b.dataset.i]));
    const f = box.querySelector('button[data-i]'); if (f) f.classList.add('k');
  }
  function choose(it) {
    if (!it) return; inp.value = ''; close(); inp.blur();
    if (kind === 'start') setStart(it.lat, it.lon, it.label); else if (kind === 'dest') { closeLayer(null); setTimeout(() => newDestAt(it.lat, it.lon, it.label), 60); } else addStop(it.lat, it.lon, it.label, it.cid);
  }
  async function live(q, my) {
    try { const r = await geoSearch(q, 5); if (my !== tok) return; paint(r, r.length ? '' : 'none'); }
    catch (e) { if (my === tok) paint(null, 'err'); }
  }
  inp.addEventListener('input', () => {
    clearTimeout(t); const q = inp.value.trim(), my = ++tok;
    if (!q) return close();
    if (q.length < 3) return paint(null, '');
    if (!navigator.onLine) return paint(null, 'off');
    paint(null, 'busy'); t = setTimeout(() => live(q, my), 600);
  });
  inp.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); if (items.length) choose(items[0]); else if (inp.value.trim().length >= 2 && navigator.onLine) { clearTimeout(t); const my = ++tok; paint(null, 'busy'); live(inp.value.trim(), my); } }
    else if (e.key === 'Escape') { inp.value = ''; close(); }
  });
  inp.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== inp) close(); }, 150));
  inp.addEventListener('focus', () => { if (inp.value.trim()) inp.dispatchEvent(new Event('input')); });
}
setupSearch($('#startQ'), $('#startSug'), 'start');
setupSearch($('#stopQ'), $('#stopSug'), 'stop');

/* =================== Destinos y visitas =================== */
function clientOf(s) { return (s.cid && D.clients.find(c => c.id === s.cid)) || D.clients.find(c => near(c, s)) || null; }
function visitCounts() {
  const m = new Map();
  D.hist.forEach(j => j.stops.forEach(s => { const c = clientOf(s); if (c) m.set(c.id, (m.get(c.id) || 0) + 1); }));
  return m;
}
let multi = false, sel = [], showAllCl = false;
function renderClients() {
  const box = $('#clientsBox');
  if (!D.clients.length) { box.innerHTML = `<p class="hint">Guarda tus sitios habituales en <button class="lnk" id="goDest">Destinos</button> (o con ⋯ › «Guardar en mis destinos» en cada parada) y los añadirás en un toque.</p>`; $('#goDest').onclick = () => setView('dest'); return; }
  const cnt = visitCounts(), list = D.clients.slice().sort((a, b) => (cnt.get(b.id) || 0) - (cnt.get(a.id) || 0) || a.label.localeCompare(b.label, 'es'));
  const N = 12, shown = showAllCl || multi ? list : list.slice(0, N);
  let h = `<div class="clh"><h3>Tus destinos</h3><span><button id="clMulti">${multi ? 'Cancelar' : 'Varios a la vez'}</button><button id="clGo" style="margin-left:8px">Todos</button></span></div><div class="cls" style="margin-top:8px">`;
  shown.forEach(c => { const si = sel.indexOf(c.id); h += `<button class="cl ${si >= 0 ? 'on' : ''}" data-id="${c.id}">${si >= 0 ? `<b>${si + 1}</b>` : ''}<span>${esc(c.label)}</span>${cnt.get(c.id) ? `<i>${cnt.get(c.id)}</i>` : ''}</button>`; });
  if (!showAllCl && !multi && list.length > N) h += `<button class="cl" id="clAll"><span>+${list.length - N} más</span></button>`;
  h += '</div>';
  if (multi) h += `<div class="selb" style="margin-top:10px"><span>${sel.length ? sel.length + ' en este orden' : 'Tócalos en el orden de la visita'}</span><button class="btn sm" id="clAdd" ${sel.length ? '' : 'disabled'}>${ic('plus')}Añadir</button></div>`;
  box.innerHTML = h;
  $('#clMulti').onclick = () => { multi = !multi; sel = []; renderClients(); };
  $('#clGo').onclick = () => setView('dest');
  const all = $('#clAll'); if (all) all.onclick = () => { showAllCl = true; renderClients(); };
  box.querySelectorAll('.cl[data-id]').forEach(b => b.onclick = () => {
    const c = D.clients.find(x => x.id === b.dataset.id); if (!c) return;
    if (multi) { const i = sel.indexOf(c.id); i >= 0 ? sel.splice(i, 1) : sel.push(c.id); renderClients(); }
    else addStop(c.lat, c.lon, c.label, c.id);
  });
  const add = $('#clAdd'); if (add) add.onclick = () => {
    if (!D.cur.start) return toast('Primero elige el punto de partida.');
    const n = sel.length; sel.forEach(id => { const c = D.clients.find(x => x.id === id); if (c) D.cur.stops.push({ id: uid(), lat: c.lat, lon: c.lon, label: c.label, cid: c.id }); });
    multi = false; sel = []; save(); renderRuta(); recalc(); fitCur();
    toast(`${n} parada${n > 1 ? 's' : ''} añadida${n > 1 ? 's' : ''}`);
  };
}

/* ---- Vista Destinos ---- */
let dSort = 'vis', dSel = null; // dSel: null = sin selección; array = ids en orden
function visitInfo() {
  const m = new Map();
  D.hist.forEach(j => j.stops.forEach(s => { const c = clientOf(s); if (!c) return; const r = m.get(c.id) || { n: 0, last: '' }; r.n++; if ((j.iso || '') > r.last) r.last = j.iso || ''; m.set(c.id, r); }));
  return m;
}
function renderDest() {
  const el = $('#destList'); if (!el) return;
  const info = visitInfo(), q = norm($('#dq').value);
  const ref = D.cur.stops[D.cur.stops.length - 1] || D.cur.start || D.fav;
  let list = D.clients.filter(c => !q || norm(c.label).includes(q) || norm(c.addr).includes(q));
  const vi = c => info.get(c.id) || { n: 0, last: '' };
  if (dSort === 'vis') list.sort((a, b) => vi(b).n - vi(a).n || a.label.localeCompare(b.label, 'es'));
  else if (dSort === 'az') list.sort((a, b) => a.label.localeCompare(b.label, 'es'));
  else if (dSort === 'rec') list.sort((a, b) => (vi(b).last || b.at || '').localeCompare(vi(a).last || a.at || '') || a.label.localeCompare(b.label, 'es'));
  else if (dSort === 'near' && ref) list.sort((a, b) => hav(ref, a) - hav(ref, b));
  $('#destSub').textContent = D.clients.length ? `${D.clients.length} destino${D.clients.length > 1 ? 's' : ''}${dSort === 'near' && ref ? ' · por cercanía a «' + ref.label + '»' : ''}` : 'Los sitios que visitas: añádelos a la ruta en un toque';
  $$('#sgDs button').forEach(b => b.classList.toggle('on', b.dataset.v === dSort));
  const inRoute = new Set(D.cur.stops.map(s => clientOf(s)?.id).filter(Boolean));
  $('#destBar').innerHTML = dSel ? `<div class="dsel"><span>${dSel.length ? dSel.length + ' para la ruta, en este orden' : 'Toca los destinos en el orden de la visita'}</span><span class="brow" style="flex-wrap:nowrap"><button class="btn g sm" id="dsNo">Cancelar</button><button class="btn sm" id="dsOk" ${dSel.length ? '' : 'disabled'}>${ic('plus')}Añadir</button></span></div>`
    : (D.clients.length > 1 ? `<div style="display:flex;justify-content:flex-end"><button class="lnk" id="dsGo" style="font-size:.8125rem">Planificar: elegir varios</button></div>` : '');
  if (!D.clients.length) el.innerHTML = `<div class="empty"><b>Sin destinos todavía</b>Pulsa «Nuevo» para guardar un sitio, o guarda una parada desde su menú ⋯.</div>`;
  else if (!list.length) el.innerHTML = `<div class="empty"><b>Sin resultados</b>Prueba con otro nombre.</div>`;
  else el.innerHTML = list.map(c => { const v = vi(c), si = dSel ? dSel.indexOf(c.id) : -1, km = dSort === 'near' && ref ? nf1.format(hav(ref, c)) + ' km · ' : '';
    return `<div class="dr" data-id="${esc(c.id)}">${dSel ? `<button class="ck ${si >= 0 ? 'on' : ''}" aria-label="Elegir ${esc(c.label)}">${si >= 0 ? si + 1 : ''}</button>` : `<span class="ic0">${ic('dest')}</span>`}<button class="bd" aria-label="Opciones de ${esc(c.label)}"><b>${esc(c.label)}</b><small>${km}${v.n ? v.n + ' visita' + (v.n > 1 ? 's' : '') + ' · última ' + fmtDateS(v.last) : 'Sin visitas guardadas'}${c.addr && c.addr !== c.label ? ' · ' + esc(c.addr) : ''}</small></button>${inRoute.has(c.id) ? '<span class="in">en la ruta</span>' : ''}${dSel ? '' : `<button class="gb ad" aria-label="Añadir ${esc(c.label)} a la ruta">${ic('plus')}</button>`}</div>`; }).join('');
  el.querySelectorAll('.dr').forEach(r => {
    const c = D.clients.find(x => x.id === r.dataset.id); if (!c) return;
    const tog = () => { const i = dSel.indexOf(c.id); i >= 0 ? dSel.splice(i, 1) : dSel.push(c.id); renderDest(); };
    if (dSel) { r.querySelector('.ck').onclick = tog; r.querySelector('.bd').onclick = tog; }
    else { r.querySelector('.bd').onclick = () => destMenu(c); r.querySelector('.ad').onclick = () => addStop(c.lat, c.lon, c.label, c.id); }
  });
  const g = $('#dsGo'); if (g) g.onclick = () => { dSel = []; renderDest(); };
  const n = $('#dsNo'); if (n) n.onclick = () => { dSel = null; renderDest(); };
  const o = $('#dsOk'); if (o) o.onclick = () => {
    if (!D.cur.start) return toast('Primero elige el punto de partida en «Ruta».');
    const k = dSel.length; dSel.forEach(id => { const c = D.clients.find(x => x.id === id); if (c) D.cur.stops.push({ id: uid(), lat: c.lat, lon: c.lon, label: c.label, cid: c.id }); });
    dSel = null; save(); renderRuta(); recalc(); setView('ruta'); setTimeout(fitCur, 100);
    toast(`${k} parada${k > 1 ? 's' : ''} añadida${k > 1 ? 's' : ''} a la ruta`);
  };
}
$('#dq').addEventListener('input', renderDest);
$$('#sgDs button').forEach(b => b.onclick = () => { dSort = b.dataset.v; if (dSort === 'near' && !(D.cur.start || D.fav)) toast('Para ordenar por cercanía, elige antes un punto de partida.'); renderDest(); });
function destMenu(c) {
  const v = visitInfo().get(c.id) || { n: 0, last: '' };
  sheet({ title: c.label, sub: v.n ? `${v.n} visita${v.n > 1 ? 's' : ''} · última el ${fmtDate(v.last, { day: 'numeric', month: 'long' })}` : (c.addr || 'Sin visitas guardadas'), items: [
    { icon: 'plus', label: 'Añadir a la ruta de hoy', fn: () => addStop(c.lat, c.lon, c.label, c.id) },
    { icon: 'eye', label: 'Ver en el mapa', fn: () => { setView('ruta'); if (isMob()) scrollTo({ top: 0 }); setTimeout(() => { map.invalidateSize(); map.setView([c.lat, c.lon], 16, { animate: !RM }); L.popup({ closeButton: false, offset: [0, -6] }).setLatLng([c.lat, c.lon]).setContent(esc(c.label)).openOn(map); }, 80); } },
    { icon: 'edit', label: 'Cambiar nombre', fn: async () => { const nv = await prompt2('Nombre del destino', c.label, { text: 'Cambia también en la ruta de hoy. El historial guarda el nombre de cada día, pero las visitas se siguen contando juntas.' }); if (nv && nv.trim()) { c.label = nv.trim(); D.cur.stops.forEach(s => { if (s.cid === c.id) s.label = c.label; }); save(); renderDest(); renderRuta(); renderStats(); } } },
    { icon: 'pin', label: 'Corregir la ubicación', sub: 'Moviendo el mapa hasta el sitio exacto', fn: () => startPick('dest-move', c) },
    v.n && { icon: 'hist', label: 'Ver sus visitas', fn: () => destVisits(c) },
    { icon: 'trash', label: 'Eliminar destino', sub: 'El historial no cambia', danger: true, fn: () => { const i = D.clients.indexOf(c); D.clients.splice(i, 1); D.cur.stops.forEach(s => { if (s.cid === c.id) s.cid = null; }); save(); renderDest(); renderRuta(); toast(`«${c.label}» eliminado`, { undo: () => { D.clients.splice(i, 0, c); save(); renderDest(); renderRuta(); } }); } },
  ] });
}
function destVisits(c) {
  const js = D.hist.filter(j => j.stops.some(s => clientOf(s) === c)).sort((a, b) => (b.iso || '').localeCompare(a.iso || ''));
  dlg({ title: c.label, acts: [{ t: 'Cerrar', v: null }], html: `<div class="card" style="padding:2px 14px;box-shadow:none;max-height:50dvh;overflow:auto">${js.map(j => `<div class="row"><div><b>${esc(fmtDate(j.iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}</b><small>${esc(j.label)} · ${fmtKm(j.tot.road)}</small></div></div>`).join('')}</div>` });
}
function newDest() {
  dlg({ title: 'Nuevo destino', acts: [{ t: 'Cancelar', cls: 'g', v: null }],
    html: `<div class="field ic"><svg class="i"><use href="#i-search"/></svg><input id="ndQ" type="search" placeholder="Dirección o municipio" autocomplete="off" enterkeyhint="search" aria-label="Buscar dirección del destino"><div class="sugg" id="ndS" hidden></div></div>
      <div class="brow"><button class="btn g sm" id="ndMap">${ic('pin')}Elegir en el mapa</button><button class="btn g sm" id="ndGps">${ic('loc')}Estoy aquí</button></div>`,
    open: b => {
      setupSearch(b.querySelector('#ndQ'), b.querySelector('#ndS'), 'dest');
      b.querySelector('#ndMap').onclick = () => { closeLayer(null); setTimeout(() => startPick('dest-new'), 60); };
      b.querySelector('#ndGps').onclick = () => { closeLayer(null); gps(async p => newDestAt(p.lat, p.lon, await labelFor(p.lat, p.lon, 'Mi ubicación'))); };
      setTimeout(() => { if (!matchMedia('(pointer:coarse)').matches) b.querySelector('#ndQ').focus(); }, 80);
    } });
}
async function newDestAt(lat, lon, addr) {
  const dup = D.clients.find(c => near(c, { lat, lon }));
  if (dup) { setView('dest'); return toast(`Ya tienes «${dup.label}» en ese sitio.`); }
  const name = await prompt2('Nombre del destino', addr, { text: 'Por ejemplo «Casa de M.» o un código. La dirección se guarda aparte.', ok: 'Guardar' });
  if (name == null) return;
  const c = { id: uid(), lat, lon, label: name.trim() || addr, addr, at: today() };
  D.clients.push(c); save(); setView('dest'); renderDest(); renderRuta();
  toast(`Guardado: ${c.label}`, { undo: () => { D.clients = D.clients.filter(x => x !== c); save(); renderDest(); renderRuta(); } });
}
$('#bDestNew').onclick = newDest;

/* ---- Ordenar las paradas para recorrer menos km ---- */
async function optimizeStops() {
  const c = D.cur, n = c.stops.length; if (!c.start || n < 3) return;
  const before = c.stops.slice(), kmBefore = R.km;
  let order = null;
  if (navigator.onLine) {
    const pts = [c.start, ...c.stops], key = pts.map(p => (+p.lon).toFixed(5) + ',' + (+p.lat).toFixed(5)).join(';');
    const q = c.ret ? 'source=first&roundtrip=true' : 'source=first&destination=last&roundtrip=false';
    try {
      toast('Buscando el orden con menos km…', { ms: 9000 });
      const d = await api('/t/' + key + (c.ret ? '' : '?end=last'), `https://router.project-osrm.org/trip/v1/driving/${key}?${q}&overview=false`);
      if (d && d.code === 'Ok' && d.waypoints) { const idx = d.waypoints.map((w, i) => ({ i, k: w.waypoint_index })).filter(x => x.i > 0).sort((a, b) => a.k - b.k).map(x => x.i - 1); if (idx.length === n) order = idx; }
    } catch (e) {}
  }
  if (!order) { // sin conexión: vecino más cercano en línea recta, empezando en el inicio
    order = []; const left = new Set(before.map((_, i) => i)); let cur = c.start;
    while (left.size) { let best = null, bd = 1e9; left.forEach(i => { const dd = hav(cur, before[i]); if (dd < bd) { bd = dd; best = i; } }); order.push(best); left.delete(best); cur = before[best]; }
  }
  if (order.every((v, i) => v === i)) return toast('El orden actual ya es el más corto.');
  c.stops = order.map(i => before[i]); save(); renderRuta();
  await recalc();
  const diff = kmBefore - R.km;
  toast(diff > 0.05 ? `Nuevo orden: ${nf1.format(diff)} km menos` : 'Paradas reordenadas', { undo: () => { c.stops = before; save(); renderRuta(); recalc(); }, ms: 7000 });
}
$('#bOpt').onclick = () => ask('¿Ordenar las paradas?', 'Se cambia el orden para recorrer menos kilómetros' + (D.cur.ret ? ', saliendo y volviendo a ' + D.cur.start.label : ', saliendo de ' + D.cur.start.label + ' y terminando en la última parada actual') + '. Útil para planificar; si ya hiciste la ruta, guarda el orden real.', 'Ordenar').then(ok => ok && optimizeStops());

/* =================== Pintar la vista Ruta =================== */
let startOpen = false;
function renderSum() {
  const has = pointsOf(D.cur).length >= 2;
  const kv = $('#kmV'), dv = $('#durV');
  kv.classList.toggle('ld', routing && has); dv.classList.toggle('ld', routing && has);
  kv.textContent = nf1.format(has ? R.km : 0);
  dv.textContent = has ? fmtDur(R.dur) : '—';
  $('#costV').textContent = fmtEur(has ? R.km * D.set.cpk : 0);
  $('#nV').textContent = D.cur.stops.length;
  $('#srcB').innerHTML = !has ? '' : routing ? `<span class="chip m">Calculando…</span>` : R.src === 'road' ? `<span class="chip">${ic('ck')}Por carretera</span>` : `<span class="chip w">${ic('off')}Estimada</span>`;
  const bbN = $('#bbN'); bbN.hidden = !D.cur.stops.length; bbN.textContent = D.cur.stops.length;
}
function renderLegs() {
  const legs = R.legs || [];
  $$('#stopsList [data-seg]').forEach(el => {
    const i = +el.dataset.seg;
    if (routing || !legs.length) { el.textContent = routing ? 'calculando…' : ''; return; }
    let acc = 0; for (let k = 0; k <= i; k++) acc += legs[k] || 0;
    el.textContent = `+${nf1.format(legs[i] || 0)} km · ${nf1.format(acc)} km en total`;
  });
}
function renderRuta() {
  const c = D.cur;
  // edición
  $('#editBar').hidden = !D.edit; $('#saveN').hidden = !!D.edit; $('#saveE').hidden = !D.edit;
  if (D.edit) { $('#editT').textContent = 'Editando «' + D.edit.snap.label + '»'; $('#editS').textContent = fmtDate(D.edit.snap.iso); }
  // inicio
  const sb = $('#startBox');
  if (c.start) {
    const isFav = D.fav && near(D.fav, c.start);
    sb.innerHTML = `<div class="pt"><span class="dot s"></span><div class="tx"><input class="nm" id="startNm" value="${esc(c.start.label)}" aria-label="Nombre del punto de partida" enterkeyhint="done"><small>Salida <input type="time" id="startTm" value="${esc(c.start.time || '')}" aria-label="Hora de salida"></small></div><div class="ac"><button class="gb ${isFav ? 'on' : ''}" id="startFav" title="${isFav ? 'Es tu punto de partida habitual' : 'Usar siempre como punto de partida'}" aria-label="${isFav ? 'Quitar como punto de partida habitual' : 'Guardar como punto de partida habitual'}">${ic('star')}</button></div></div>`;
    $('#startNm').onchange = e => { const v = e.target.value.trim() || 'Punto de partida'; c.start.label = v; if (isFav) D.fav.label = v; save(); drawMarkers(); renderRetLabel(); };
    $('#startNm').onkeydown = e => { if (e.key === 'Enter') e.target.blur(); };
    $('#startTm').onchange = e => { c.start.time = e.target.value; save(); };
    $('#startFav').onclick = () => {
      if (isFav) { const old = D.fav; D.fav = null; toast('Ya no es tu punto de partida habitual', { undo: () => { D.fav = old; save(); renderRuta(); renderAjustesLists(); } }); }
      else { D.fav = { lat: c.start.lat, lon: c.start.lon, label: c.start.label }; toast('Las jornadas nuevas empezarán aquí'); }
      save(); renderRuta(); renderAjustesLists();
    };
  } else sb.innerHTML = `<div class="empty" style="padding:4px 0 10px;text-align:left">¿Desde dónde sales? Normalmente, tu oficina.</div>`;
  $('#startPick').hidden = !!c.start && !startOpen;
  $('#bStartChange').hidden = !c.start; $('#bStartChange').textContent = startOpen ? 'Cerrar' : 'Cambiar';
  const fb = $('#bStartFav'); fb.hidden = !D.fav || (c.start && near(D.fav, c.start)); if (D.fav) $('#bStartFavT').textContent = D.fav.label;
  // paradas
  const list = $('#stopsList');
  $('#stopsN').textContent = c.stops.length ? `${c.stops.length}` : ''; $('#bOpt').hidden = !(c.start && c.stops.length >= 3);
  if (!c.stops.length) list.innerHTML = `<div class="empty"><b>${c.start ? 'Sin paradas todavía' : 'Primero, el punto de partida'}</b>${c.start ? 'Añade cada visita en el orden en que la haces.' : 'Después añade cada visita en orden.'}</div>`;
  else {
    list.innerHTML = c.stops.map((s, i) => `<div class="pt" data-id="${s.id}"><span class="dot">${i + 1}</span><div class="tx"><input class="nm" value="${esc(s.label)}" placeholder="Parada ${i + 1}" aria-label="Nombre de la parada ${i + 1}" enterkeyhint="done"><small data-seg="${i}"></small></div><div class="ac">${clientOf(s) ? `<span class="gb on" aria-hidden="true" style="pointer-events:none;width:26px">${ic('star')}</span>` : ''}<button class="gb mn" aria-label="Opciones de la parada ${i + 1}"><svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg></button><button class="gb dg rm" aria-label="Quitar la parada ${i + 1}">${ic('x')}</button></div></div>`).join('')
      + (c.ret && c.start ? `<div class="pt ret"><span class="dot r">${ic('ret')}</span><div class="tx"><b>Vuelta a ${esc(c.start.label)}</b><small data-seg="${c.stops.length}"></small></div></div>` : '');
    list.querySelectorAll('.pt[data-id]').forEach(row => {
      const s = c.stops.find(x => x.id === row.dataset.id); if (!s) return;
      const nm = row.querySelector('.nm');
      nm.onchange = () => { s.label = nm.value.trim() || `Parada ${c.stops.indexOf(s) + 1}`; save(); drawMarkers(); };
      nm.onkeydown = e => { if (e.key === 'Enter') nm.blur(); };
      row.querySelector('.mn').onclick = () => stopMenu(s);
      row.querySelector('.rm').onclick = () => removeStop(s);
    });
  }
  $('#retSw').checked = !!c.ret; renderRetLabel();
  $('#bUndo').disabled = !c.stops.length; $('#bUndo').style.opacity = c.stops.length ? '' : '.4';
  $('#bSave').disabled = !c.start || !c.stops.length; $('.savez').classList.toggle('on', !!(c.start && c.stops.length)); $('#bEditOk').disabled = !c.start || !c.stops.length;
  if ($('#notes').value !== (c.notes || '')) $('#notes').value = c.notes || '';
  renderClients(); renderSum(); renderLegs(); drawMarkers(); drawRoute(); if (view === 'dest') renderDest();
}
function renderRetLabel() { const s = D.cur.start; $('#retT').textContent = s ? `Volver a ${s.label}` : 'Volver al punto de partida'; }
$('#retSw').onchange = e => { D.cur.ret = e.target.checked; save(); renderRuta(); recalc(); };
$('#notes').oninput = e => { D.cur.notes = e.target.value; save(); };
$('#bStartChange').onclick = () => { startOpen = !startOpen; renderRuta(); if (startOpen) setTimeout(() => $('#startQ').focus(), 50); };
$('#bStartFav').onclick = () => D.fav && setStart(D.fav.lat, D.fav.lon, D.fav.label);
$('#bStartPick').onclick = () => startPick('start');
$('#bStartGps').onclick = () => gps(async p => setStart(p.lat, p.lon, await labelFor(p.lat, p.lon, 'Mi ubicación')));
$('#bStopPick').onclick = () => { if (!D.cur.start) return toast('Primero elige el punto de partida.'); startPick('stop'); };
$('#bStopGps').onclick = () => { if (!D.cur.start) return toast('Primero elige el punto de partida.'); gps(async p => addStop(p.lat, p.lon, await labelFor(p.lat, p.lon, `Parada ${D.cur.stops.length + 1}`))); };
$('#bUndo').onclick = () => { const s = D.cur.stops[D.cur.stops.length - 1]; if (s) removeStop(s); };
$('#bClear').onclick = async () => {
  if (D.edit) return cancelEdit();
  if (!D.cur.stops.length && !D.cur.notes) return toast('La ruta ya está vacía.');
  const snap = JSON.parse(JSON.stringify(D.cur));
  D.cur = newCur(); save(); renderRuta(); recalc();
  toast('Ruta vaciada', { undo: () => { D.cur = snap; save(); renderRuta(); recalc(); } });
};
