
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
const pinIcon = (cls, txt, n = 1) => { const w = n > 1 ? 18 + String(txt).length * 7 : 28; return L.divIcon({ className: '', html: `<div class="pin ${cls}" style="${n > 1 ? `width:${w}px` : ''}">${txt || ''}</div>`, iconSize: [w, 28], iconAnchor: [w / 2, 14] }); };
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
  // Paradas en el mismo sitio (volver a un paciente, p. ej.) van en un solo marcador «1 · 3»: si no, la última tapa a las demás
  // Paradas que se pisan en pantalla van en un solo marcador «1 · 3». Si son el mismo sitio, se puede arrastrar;
  // si solo están cerca, al tocarlo el mapa se acerca hasta separarlas.
  stopGroups(c.stops).forEach(g => {
    const nums = g.map(x => x.i + 1), lab = nums.join(' · '), same = g.every(x => near(x.s, g[0].s)), ll = groupCenter(g);
    const m = L.marker(ll, { icon: pinIcon(g.length > 1 ? 'm' : '', lab, nums.length), draggable: same, title: g.length > 1 ? `Paradas ${lab}` : g[0].s.label, keyboard: false, zIndexOffset: (g.length > 1 ? 2000 : 1000) + g[0].i });
    m.bindTooltip(g.length > 1 ? `<b>Paradas ${lab}</b>${[...new Set(g.map(x => x.s.label))].map(l => '<br>' + esc(l)).join('')}` : esc(g[0].s.label || `Parada ${lab}`), { direction: 'top', offset: [0, -12] });
    if (same) m.on('dragend', () => movedGroup(g.map(x => x.s), m, g.length > 1 ? `Paradas ${lab} movidas` : `Parada ${lab} movida`));
    else m.on('click', e => { L.DomEvent.stop(e); map.fitBounds(L.latLngBounds(g.map(x => [x.s.lat, x.s.lon])), { padding: [70, 70], maxZoom: 17, animate: !RM }); });
    m.addTo(lyMk);
  });
}
const PIN_GAP = 30; // px: dos marcadores más cerca que esto se juntan
function stopGroups(stops) {
  const gs = [], pt = s => { try { return map.latLngToContainerPoint([s.lat, s.lon]); } catch (e) { return null; } };
  stops.forEach((s, i) => {
    const p = pt(s);
    const g = gs.find(g => g.some(x => near(x.s, s) || (p && x.p && x.p.distanceTo(p) < PIN_GAP)));
    if (g) g.push({ s, i, p }); else gs.push([{ s, i, p }]);
  });
  return gs;
}
function groupCenter(g) { const n = g.length; return [g.reduce((a, x) => a + x.s.lat, 0) / n, g.reduce((a, x) => a + x.s.lon, 0) / n]; }
map.on('zoomend', () => { drawMarkers(); if (viewingHist) drawHistMarkers(viewingHist); });
function movedGroup(list, m, msg) {
  const old = list.map(s => ({ lat: s.lat, lon: s.lon })), p = m.getLatLng();
  list.forEach(s => { s.lat = p.lat; s.lon = p.lng; });
  save(); drawMarkers(); recalc();
  toast(msg, { undo: () => { list.forEach((s, k) => { s.lat = old[k].lat; s.lon = old[k].lon; }); save(); drawMarkers(); recalc(); } });
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

/* ---- Ver una jornada guardada: vista propia, de solo lectura (mapa + sus datos) ---- */
async function showHistOnMap(j, keep) {
  if (!j.start) return toast('Esta jornada no tiene punto de partida guardado.');
  viewingHist = j; lyHist.clearLayers(); drawMarkers(); drawRoute();
  if (!keep) { if (view !== 'ver') { try { history.pushState({ rzv: 1 }, ''); } catch (e) {} } setView('ver'); renderVer(j); setTimeout(() => { map.invalidateSize(); fitCur(isMob() ? 36 : 60); }, 60); }
  drawHistMarkers(j);
  const pts = pointsOf(j), r = await computeRoute(pts);
  if (viewingHist !== j) return;
  const line = r.geom && r.geom.length > 1 ? r.geom : pts.map(p => [p.lat, p.lon]);
  L.polyline(line, { color: css('--card'), weight: 8, opacity: .85, interactive: false }).addTo(lyHist);
  L.polyline(line, { color: css('--em2'), weight: 4.5, opacity: .95, interactive: false, lineCap: 'round', dashArray: r.src === 'road' ? null : '2 9' }).addTo(lyHist);
}
const lyHistMk = L.layerGroup().addTo(map);
function drawHistMarkers(j) {
  lyHistMk.clearLayers(); if (!j || !j.start) return;
  L.marker([j.start.lat, j.start.lon], { icon: pinIcon('s'), interactive: false, zIndexOffset: 500 }).bindTooltip(esc(j.start.label)).addTo(lyHistMk);
  stopGroups(j.stops).forEach(g => {
    const lab = g.map(x => x.i + 1).join(' · '), same = g.every(x => near(x.s, g[0].s));
    const m = L.marker(groupCenter(g), { icon: pinIcon(g.length > 1 ? 'm' : '', lab, g.length), keyboard: false, zIndexOffset: (g.length > 1 ? 2000 : 1000) + g[0].i })
      .bindTooltip(g.length > 1 ? `<b>Paradas ${lab}</b>${[...new Set(g.map(x => x.s.label))].map(l => '<br>' + esc(l)).join('')}` : esc(g[0].s.label), { direction: 'top', offset: [0, -12] });
    m.on('click', e => { L.DomEvent.stop(e); if (same) { focusVerStop(g[0].i); m.openTooltip(); } else map.fitBounds(L.latLngBounds(g.map(x => [x.s.lat, x.s.lon])), { padding: [70, 70], maxZoom: 17, animate: !RM }); });
    m.addTo(lyHistMk);
  });
}
function closeHistView() { lyHistMk.clearLayers(); viewingHist = null; lyHist.clearLayers(); $('#histPill').hidden = true; drawMarkers(); drawRoute(); }
$('#histPillX').onclick = closeHistView;
function renderVer(j) {
  const el = $('#verBox'), n = j.stops.length, real = isReal(j);
  const names = [...j.stops.map((s, i) => s.label || `Parada ${i + 1}`)];
  let acc = 0;
  const row = (i, dot, name, extra = '') => { const k = j.legs && j.legs[i] != null ? j.legs[i] : null; if (k != null) acc += k; const m = legMin(j, i);
    return `<button class="pt vr" data-i="${i}">${dot}<span class="tx"><b>${esc(name)}</b><small>${k != null ? `+${nf1.format(k)} km${m != null && !real ? ' · ' + fmtDur(m) : ''} · total ${nf1.format(acc)}` : ''}${extra}</small></span></button>`; };
  const same = i => j.stops.findIndex((s, k) => k < i && near(s, j.stops[i]));
  el.innerHTML = `
    <div class="vh vrh"><button class="gb" id="verBack" aria-label="Volver al historial">${ic('l')}</button><div><h1>${esc(j.label)}</h1><p>${esc(fmtDate(j.iso))}${j.start.time ? ' · salida ' + esc(j.start.time) : ''}</p></div></div>
    <div class="card sum">
      <div class="sumk"><span class="v">${nf1.format(j.tot.road)}</span><span class="u">km</span><span class="src">${est(j) ? `<span class="chip w">${ic('off')}Estimada</span>` : `<span class="chip">${ic('ck')}Por carretera</span>`}</span></div>
      <div class="sumg"><div><b>${fmtDur(jDur(j))}</b><span>Al volante${real ? ' · real' : ''}</span></div><div><b>${fmtEur(j.tot.cost)}</b><span>Coste</span></div><div><b>${n}</b><span>Paradas</span></div></div>
      ${real && j.tot.dur ? `<p class="retn">Estimado: <b>${fmtDur(j.tot.dur)}</b> · anotado a mano: <b>${fmtDur(j.tot.durM)}</b></p>` : ''}
    </div>
    <div class="card"><div class="ch"><span>${ic('route')}Recorrido</span><small>toca una parada para verla</small></div><div class="stops">
      <div class="pt vr" data-i="-1"><span class="dot s"></span><span class="tx"><b>${esc(j.start.label)}</b><small>Salida${j.start.time ? ' · ' + esc(j.start.time) : ''}</small></span></div>
      ${j.stops.map((s, i) => row(i, `<span class="dot">${i + 1}</span>`, names[i], same(i) >= 0 ? `<span class="same">${ic('rep')}Vuelves a la parada ${same(i) + 1}</span>` : '')).join('')}
      ${j.ret ? row(n, `<span class="dot r">${ic('ret')}</span>`, 'Vuelta a ' + j.start.label) : ''}
    </div></div>
    ${j.notes ? `<div class="card"><div class="ch"><span>${ic('note')}Notas</span></div><p style="white-space:pre-wrap;font-size:.9rem">${esc(j.notes)}</p></div>` : ''}
    <div class="vracts"><button class="btn" id="verShare">${ic('share')}Compartir</button><button class="btn g" id="verEdit">${ic('edit')}Editar</button><button class="btn g" id="verRep">${ic('rep')}Repetir</button></div>
    ${!real ? `<button class="lnk" id="verReal" style="align-self:center;font-size:.8125rem">${ic('clock')}Anotar el tiempo real al volante</button>` : ''}`;
  $('#verBack').onclick = leaveVer;
  $('#verShare').onclick = () => shareEntry(j);
  $('#verEdit').onclick = () => startEdit(j);
  $('#verRep').onclick = () => repeatEntry(j);
  const rr = $('#verReal'); if (rr) rr.onclick = () => setRealTime(j);
  el.querySelectorAll('.pt.vr').forEach(b => b.onclick = () => focusVerStop(+b.dataset.i));
}
function focusVerStop(i) {
  const j = viewingHist; if (!j) return;
  const p = i < 0 || i >= j.stops.length ? j.start : j.stops[i];
  $$('#verBox .pt.vr').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
  if (isMob()) scrollTo({ top: 0, behavior: RM ? 'auto' : 'smooth' });
  map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15), { animate: !RM });
}
function leaveVer() { if (history.state && history.state.rzv) { try { history.back(); return; } catch (e) {} } setView('hist'); }
addEventListener('popstate', () => { if (view === 'ver' && !layerOpen) setView('hist'); });

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
  else if (k === 'dest-move' && ref) moveDest(ref, c.lat, c.lng, lb);
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
// Al dejar de ser destino, las paradas de la ruta abierta que lo usaban vuelven a llamarse como su dirección.
// Devuelve una función que lo deshace (n = cuántas paradas cambiaron).
function detachDest(c) {
  const ch = [];
  openRoutes().forEach(r => r.stops.forEach(s => { if (s.cid === c.id || (!s.cid && near(s, c))) { ch.push([s, s.label, s.cid]); s.cid = null; if (c.addr && s.label === c.label) s.label = c.addr; } }));
  const back = () => ch.forEach(([s, l, id]) => { s.label = l; s.cid = id; }); back.n = ch.length; return back;
}
function toggleClient(s) {
  const cl = D.clients.find(c => c.id === s.cid) || D.clients.find(c => near(c, s));
  if (cl) {
    const idx = D.clients.indexOf(cl), back = detachDest(cl); D.clients.splice(idx, 1);
    save(); renderRuta(); renderAjustesLists(); drawMarkers();
    toast(`«${cl.label}» ya no está en tus destinos`, { undo: () => { D.clients.splice(idx, 0, cl); back(); save(); renderRuta(); renderAjustesLists(); drawMarkers(); } });
  } else {
    const lb = uniqName(s.label || 'Destino', destNames()), c = { id: uid(), lat: s.lat, lon: s.lon, label: lb, addr: s.label || '', at: today() };
    D.clients.push(c); s.cid = c.id; if (lb !== (s.label || 'Destino')) s.label = lb; save(); renderRuta(); renderAjustesLists();
    toast(lb !== c.addr ? `Guardado como «${lb}»: ya tenías un destino con ese nombre` : `Guardado en tus destinos: ${c.label}`, { ms: 4000 });
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
  const close = () => { clearTimeout(t); tok++; box.hidden = true; box.innerHTML = ''; items = []; }; // tok++: anula la búsqueda en curso para que no reabra la lista
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
    try { const r = await geoSearch(q, 5); if (my !== tok || !inp.value.trim()) return; paint(r, r.length ? '' : 'none'); }
    catch (e) { if (my === tok && inp.value.trim()) paint(null, 'err'); }
  }
  inp.addEventListener('input', () => {
    const q = inp.value.trim();
    if (!q) return close();
    clearTimeout(t); const my = ++tok;
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
  const N = isMob() ? 6 : 12, shown = showAllCl || multi ? list : list.slice(0, N);
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
  const nDup = dupCount(D.clients);
  $('#destDup').innerHTML = nDup ? `<div class="fm w" style="display:flex;align-items:center;gap:10px"><span style="flex:1">${nDup} destino${nDup > 1 ? 's' : ''} con el nombre repetido: en la ruta y los informes no se distinguen. Al arreglarlo se les añade (2), (3)…; luego puedes ponerles un nombre mejor.</span><button class="btn sm" id="bDupD">Arreglar</button></div>` : '';
  if (nDup) $('#bDupD').onclick = () => { const ch = fixDupNames(D.clients, c => (c.at || '') + c.id); D.cur.stops.forEach(s => { const c = s.cid && D.clients.find(x => x.id === s.cid); if (c) s.label = c.label; }); save(); renderDest(); renderRuta(); toast(`${ch.length} destino${ch.length > 1 ? 's' : ''} renombrado${ch.length > 1 ? 's' : ''}`, { undo: () => { ch.forEach(([c, l]) => c.label = l); save(); renderDest(); renderRuta(); } }); };
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
    { icon: 'edit', label: 'Cambiar nombre', fn: () => renameDest(c) },
    { icon: 'pin', label: 'Corregir la ubicación', sub: 'Moviendo el mapa hasta el sitio exacto', fn: () => startPick('dest-move', c) },
    v.n && { icon: 'hist', label: 'Ver sus visitas', fn: () => destVisits(c) },
    { icon: 'trash', label: 'Eliminar destino', sub: 'El historial no cambia; en la ruta de hoy la parada vuelve a su dirección', danger: true, fn: () => { const i = D.clients.indexOf(c), back = detachDest(c); D.clients.splice(i, 1); save(); renderDest(); renderRuta(); drawMarkers(); toast(`«${c.label}» eliminado${back.n ? ', y en la ruta de hoy vuelve a su dirección' : ''}`, { ms: 5000, undo: () => { D.clients.splice(i, 0, c); back(); save(); renderDest(); renderRuta(); drawMarkers(); } }); } },
  ] });
}
/* ---- Cambios en un destino: qué se actualiza ----
   · La ruta de hoy (y la jornada que estés editando) siempre: aún no es un registro cerrado.
   · El historial solo si lo confirmas: esos km pueden estar ya en un informe enviado.
   · Antes de cambiar nada, las visitas que se reconocían por estar en el mismo sitio quedan enlazadas al destino,
     para que sigan contando aunque se mueva. */
const isOf = (c, o) => s => s && (s.cid === c.id || (!s.cid && near(s, o)));
function linkVisits(c, o) { const m = isOf(c, o); D.hist.forEach(j => j.stops.forEach(s => { if (m(s)) s.cid = c.id; })); }
function openRoutes() { return [D.cur, D.edit && D.edit.prevCur].filter(Boolean); }
function histWith(c, o) { const m = isOf(c, o); return D.hist.filter(j => j.stops.some(m) || near(j.start, o)); }
async function renameDest(c) {
  const nv = await prompt2('Nombre del destino', c.label, { text: 'Cambia en la lista de destinos y en la ruta de hoy.', validate: destNameErr(c) });
  if (!nv || !nv.trim() || nv.trim() === c.label) return;
  const old = c.label, o = { lat: c.lat, lon: c.lon }, m = isOf(c, o); linkVisits(c, o);
  c.label = nv.trim(); openRoutes().forEach(r => r.stops.forEach(s => { if (m(s)) s.label = c.label; }));
  save(); renderDest(); renderRuta(); renderStats();
  const js = D.hist.filter(j => j.stops.some(s => s.cid === c.id && s.label !== c.label));
  if (!js.length) return toast(`Ahora se llama «${c.label}»`);
  const v = await dlg({ title: '¿Cambiar también el historial?', text: `En ${js.length} jornada${js.length > 1 ? 's' : ''} guardada${js.length > 1 ? 's' : ''} aparece con otro nombre («${old}»). Si las cambias, los informes y el Excel saldrán con el nombre nuevo. Los km no cambian.`,
    acts: [{ t: 'Dejar como están', cls: 'g', v: false }, { t: `Cambiar en ${js.length}`, v: true }] });
  if (!v) return toast(`Ahora se llama «${c.label}». El historial no cambia.`);
  const prev = []; js.forEach(j => j.stops.forEach(s => { if (s.cid === c.id) { prev.push([s, s.label]); s.label = c.label; } }));
  save(); renderHist(); renderStats();
  toast(`Nombre cambiado también en ${js.length} jornada${js.length > 1 ? 's' : ''}`, { undo: () => { prev.forEach(([s, l]) => s.label = l); save(); renderHist(); renderStats(); } });
}
async function moveDest(c, lat, lon, addr) {
  const o = { lat: c.lat, lon: c.lon, addr: c.addr }, m = isOf(c, o); linkVisits(c, o);
  const js = histWith(c, o);
  c.lat = lat; c.lon = lon; c.addr = addr;
  // ruta de hoy y jornada en edición; también el punto de partida habitual si era este sitio
  let today = 0;
  openRoutes().forEach(r => { r.stops.forEach(s => { if (m(s)) { s.lat = lat; s.lon = lon; s.cid = c.id; today++; } }); if (near(r.start, o)) { r.start.lat = lat; r.start.lon = lon; today++; } });
  if (near(D.fav, o)) { D.fav.lat = lat; D.fav.lon = lon; }
  save(); renderDest(); setView('dest'); if (today) { renderRuta(); recalc(); }
  const msg = `«${c.label}» movido${today ? ', también en la ruta de hoy' : ''}`;
  if (!js.length) return toast(msg);
  const sumKm = js.reduce((a, j) => a + (j.tot.road || 0), 0);
  const v = await dlg({ title: '¿Corregir también el historial?', text: `«${c.label}» aparece en ${js.length} jornada${js.length > 1 ? 's' : ''} guardada${js.length > 1 ? 's' : ''} (${fmtKm(sumKm)} en total) con la ubicación anterior. Si las corriges, se recalculan sus km y tiempos por carretera${js.some(isReal) ? '; el tiempo real que anotaste no cambia' : ''}. ${js.some(j => j.exp) ? ` ${js.filter(j => j.exp).length} ya ${js.filter(j => j.exp).length === 1 ? 'está exportada' : 'están exportadas'}: si las corriges, saldrán como «cambiada tras exportar».` : ' Si ya enviaste el informe de esos días, sus km cambiarán.'}`
      + (navigator.onLine ? '' : '\n\nAhora no tienes conexión: elige «Solo desde ahora» y repite «Corregir la ubicación» con cobertura (en el mismo sitio vale).'),
    acts: [{ t: 'Solo desde ahora', cls: 'g', v: false }, { t: `Corregir ${js.length}`, v: true }] });
  if (!v || !navigator.onLine) return toast(msg + '. El historial no cambia.');
  if (recalcBusy) return toast('Ya hay un recálculo en marcha. Prueba en un momento.');
  recalcBusy = true; const snaps = [], fail = []; let before = 0, after = 0;
  for (let i = 0; i < js.length; i++) {
    const j = js[i], snap = JSON.parse(JSON.stringify(j)); toast(`Corrigiendo ${i + 1} de ${js.length}…`, { ms: 20000 });
    j.stops.forEach(s => { if (s.cid === c.id) { s.lat = lat; s.lon = lon; } }); if (near(j.start, o)) { j.start.lat = lat; j.start.lon = lon; }
    const r = await computeRoute(pointsOf(j));
    if (r.src === 'road') { before += snap.tot.road || 0; applyRoute(j, r); after += j.tot.road; snaps.push([j, snap]); }
    else { Object.keys(j).forEach(k => delete j[k]); Object.assign(j, snap); fail.push(j); }
    if (i < js.length - 1) await sleep(1100);
  }
  recalcBusy = false; save(); renderHist(); renderStats(); renderChip(); renderDest();
  const undo = () => { snaps.forEach(([j, sn]) => { Object.keys(j).forEach(k => delete j[k]); Object.assign(j, sn); }); save(); renderHist(); renderStats(); renderChip(); };
  if (!snaps.length) return toast('No se ha podido recalcular ahora. El historial no ha cambiado: repite «Corregir la ubicación» más tarde.', { ms: 6000 });
  toast(`${snaps.length} jornada${snaps.length > 1 ? 's' : ''} corregida${snaps.length > 1 ? 's' : ''}: ${fmtKm(before)} → ${fmtKm(after)}` + (fail.length ? `. ${fail.length} sin conexión, sin cambios.` : ''), { ms: 7000, undo });
}
function destVisits(c) {
  const js = D.hist.filter(j => j.stops.some(s => clientOf(s) === c)).sort((a, b) => (b.iso || '').localeCompare(a.iso || ''));
  dlg({ title: c.label, text: `${js.length} visita${js.length > 1 ? 's' : ''}. Toca una para ver esa jornada.`, acts: [{ t: 'Cerrar', v: null }],
    html: `<div class="vlist">${js.map(j => { const n = j.stops.findIndex(s => clientOf(s) === c) + 1; return `<button class="vit" data-id="${esc(j.id)}"><span class="dd"><b>${dOf(j.iso).getDate()}</b><small>${esc(dOf(j.iso).toLocaleDateString('es-ES', { month: 'short' }).replace('.', ''))}</small></span><span class="bd"><b>${esc(fmtDate(j.iso, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).replace(/^./, x => x.toUpperCase()))}</b><small>${esc(j.label)} · parada ${n} de ${j.stops.length} · ${fmtKm(j.tot.road)}</small></span>${ic('n')}</button>`; }).join('')}</div>`,
    open: b => b.querySelectorAll('.vit').forEach(x => x.onclick = () => { const j = D.hist.find(h => String(h.id) === x.dataset.id); if (!j) return; closeLayer(null); setTimeout(() => openVisit(j, c), 60); }) });
}
// Abre la jornada en su vista y centra el mapa en la parada de ese destino
function openVisit(j, c) {
  showHistOnMap(j);
  const i = j.stops.findIndex(s => (c ? clientOf(s) === c : false));
  if (i >= 0) setTimeout(() => focusVerStop(i), 450);
}
function newDest() {
  dlg({ title: 'Nuevo destino', focus: true, acts: [{ t: 'Cancelar', cls: 'g', v: null }],
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
  const name = await prompt2('Nombre del destino', addr, { text: 'Por ejemplo «Casa de M.» o un código. La dirección se guarda aparte.', ok: 'Guardar', validate: destNameErr(null) });
  if (name == null) return;
  const c = { id: uid(), lat, lon, label: uniqName(name.trim() || addr, destNames()), addr, at: today() };
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
  // La vuelta se ve aparte: es la causa habitual de «me sale el doble»
  const rn = $('#retN'), ri = D.cur.stops.length, rk = R.legs && R.legs[ri], rd = R.legsDur && R.legsDur[ri];
  rn.hidden = !(has && D.cur.ret && rk != null && !routing);
  if (!rn.hidden) rn.innerHTML = `Incluye la vuelta a ${esc(D.cur.start.label)}: <b>${nf1.format(rk)} km · ${fmtDur(rd * D.set.tf + D.set.pm)}</b>`;
}
function legNames(c) { const n = c.stops.map((s, i) => s.label || `Parada ${i + 1}`); if (c.ret && c.start) n.push('Vuelta a ' + c.start.label); return n; }
$('#durB').onclick = () => {
  if (pointsOf(D.cur).length < 2 || routing) return;
  const names = legNames(D.cur), prev = [D.cur.start.label, ...D.cur.stops.map((s, i) => s.label || `Parada ${i + 1}`)];
  const rows = names.map((n, i) => { const raw = R.legsDur[i] || 0; return `<tr><td>${esc(prev[i])} → ${esc(n.replace(/^Vuelta a /, ''))}${i === D.cur.stops.length ? ' <small>vuelta</small>' : ''}<small>${nf1.format(R.legs[i] || 0)} km · rutas ${fmtDur(raw)}</small></td><td class="n">${fmtDur(raw * D.set.tf + D.set.pm)}</td></tr>`; }).join('');
  dlg({ title: 'Tiempo al volante', acts: [{ t: 'Ajustes', cls: 'g', v: 'set' }, { t: 'Entendido', v: null }],
    html: `<table class="legt"><tbody>${rows}</tbody><tfoot><tr><td>Total${D.cur.ret ? ' (con vuelta)' : ''}</td><td class="n">${fmtDur(R.dur)}</td></tr></tfoot></table>
      <p class="hint">Cada tramo: tiempo del servicio de rutas × ${fmtX(D.set.tf)} de tráfico + ${D.set.pm} min para aparcar.${R.src !== 'road' ? ' Sin conexión: tiempo supuesto a 45 km/h.' : ''}${D.cur.ret ? ' Si no vas a volver, apaga «Volver a…».' : ''}</p>` })
    .then(v => { if (v === 'set') { setView('ajustes'); setTimeout(() => $('#setTf').scrollIntoView({ block: 'center' }), 80); } });
};
function renderLegs() {
  const legs = R.legs || [];
  $$('#stopsList [data-seg]').forEach(el => {
    const i = +el.dataset.seg;
    if (routing || !legs.length) { el.textContent = routing ? 'calculando…' : ''; return; }
    let acc = 0; for (let k = 0; k <= i; k++) acc += legs[k] || 0;
    const ld = R.legsDur && R.legsDur[i] != null ? R.legsDur[i] * D.set.tf + D.set.pm : null;
    const same = i < D.cur.stops.length ? D.cur.stops.findIndex((s, k) => k < i && near(s, D.cur.stops[i])) : -1;
    el.innerHTML = `+${nf1.format(legs[i] || 0)} km${ld != null ? ' · ' + fmtDur(ld) : ''}${same >= 0 ? `<span class="same">${ic('rep')}Vuelves a la parada ${same + 1}</span>` : ''}<span class="acc"> · total ${nf1.format(acc)}</span>`;
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
  const list = $('#stopsList'); const oh = $('#swh'); if (oh) oh.remove();
  $('#stopsN').textContent = c.stops.length ? `${c.stops.length}` : ''; $('#bOpt').hidden = !(c.start && c.stops.length >= 3);
  if (!c.stops.length) list.innerHTML = `<div class="empty"><b>${c.start ? 'Sin paradas todavía' : 'Primero, el punto de partida'}</b>${c.start ? 'Añade cada visita en el orden en que la haces.' : 'Después añade cada visita en orden.'}</div>`;
  else {
    list.innerHTML = c.stops.map((s, i) => `<div class="pt" data-id="${s.id}"><span class="dot">${i + 1}</span><div class="tx"><input class="nm" value="${esc(s.label)}" placeholder="Parada ${i + 1}" aria-label="Nombre de la parada ${i + 1}" enterkeyhint="done"><small data-seg="${i}"></small></div><div class="ac">${clientOf(s) ? `<span class="gb on" aria-hidden="true" style="pointer-events:none;width:26px">${ic('star')}</span>` : ''}<button class="gb mn" aria-label="Opciones de la parada ${i + 1}"><svg class="i" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="19" cy="12" r="1.3"/></svg></button><button class="gb dg rm" aria-label="Quitar la parada ${i + 1}">${ic('x')}</button></div></div>`).join('')
      + (c.ret && c.start ? `<div class="pt ret"><span class="dot r">${ic('ret')}</span><div class="tx"><b>Vuelta a ${esc(c.start.label)}</b><small data-seg="${c.stops.length}"></small></div></div>` : '');
    if (!M.swh && matchMedia('(pointer:coarse)').matches) list.insertAdjacentHTML('afterend', '<p class="swh" id="swh">Desliza una parada: ← para quitarla · → para guardarla en tus destinos</p>');
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
  const can = !!(c.start && c.stops.length);
  $('#bSave').disabled = !can; $('#bEditOk').disabled = !can; $('#stopsFoot').hidden = !c.stops.length;
  $('.sumact').hidden = !can && !D.edit; $('#endSave').hidden = !can || c.stops.length < 3; $('#bSave2T').textContent = D.edit ? 'Guardar cambios' : 'Guardar jornada';
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
$('#bSave2').onclick = () => (D.edit ? $('#bEditOk') : $('#bSave')).click();
$('#bClear').onclick = async () => {
  if (D.edit) return cancelEdit();
  if (!D.cur.stops.length && !D.cur.notes) return toast('La ruta ya está vacía.');
  const snap = JSON.parse(JSON.stringify(D.cur));
  D.cur = newCur(); save(); renderRuta(); recalc();
  toast('Ruta vaciada', { undo: () => { D.cur = snap; save(); renderRuta(); recalc(); } });
};

/* ---- Deslizar una parada (como en noticiahz): ← quitar · → guardar en mis destinos ----
   Solo con el dedo (con ratón se usan los botones). Hay que pasar del 30 % del ancho (mín. 90 px) para que cuente. */
(() => {
  const g = $('#stopsList'); let st = null;
  const isDest = s => !!(D.clients.find(c => c.id === s.cid) || D.clients.find(c => near(c, s)));
  g.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse' || e.button > 0 || e.target.closest('button,a')) return;
    const row = e.target.closest('.pt[data-id]'); if (!row) return;
    if (document.activeElement && row.contains(document.activeElement) && document.activeElement.matches('input')) return; // escribiendo el nombre
    const s = D.cur.stops.find(x => x.id === row.dataset.id); if (!s) return;
    st = { row, s, x: e.clientX, y: e.clientY, id: e.pointerId, dx: 0, on: 0, w: row.offsetWidth, th: Math.max(90, row.offsetWidth * 0.3), dir: 0, go: 0, dest: isDest(s) };
  });
  g.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (!st.on) {
      if (Math.abs(dx) > 14 && Math.abs(dx) > Math.abs(dy) * 1.6) {
        st.on = 1; try { st.row.setPointerCapture(e.pointerId); } catch (x) {}
        const r = st.row, u = document.createElement('div'); r.classList.add('swp');
        u.style.cssText = `left:${r.offsetLeft}px;top:${r.offsetTop}px;width:${r.offsetWidth}px;height:${r.offsetHeight}px`; st.u = u; g.appendChild(u);
        if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
      } else { if (Math.abs(dy) > 14) st = null; return; }
    }
    e.preventDefault();
    const dir = dx < 0 ? -1 : 1, keep = dir > 0 && st.dest, go = Math.abs(dx) >= st.th && !keep;
    if (st.dir !== dir) { st.dir = dir; st.u.innerHTML = dir < 0 ? `${ic('trash')}<span>Quitar</span>` : keep ? `${ic('ck')}<span>Ya guardado</span>` : `${ic('star')}<span>Guardar</span>`; }
    if (go !== st.go) { st.go = go; if (go && navigator.vibrate) try { navigator.vibrate(8); } catch (x) {} }
    st.dx = keep ? Math.min(dx, 150 + (dx - 150) * 0.15) : dx; // si ya es destino, se resiste (y deja leer «Ya guardado»)
    st.row.style.transform = `translateX(${st.dx}px)`;
    st.u.className = 'und ' + (dir < 0 ? 'l' : 'r sv') + (keep ? ' no' : '') + (go ? ' go' : '');
  }, { passive: false });
  const end = (e, cancel) => {
    if (!st || e.pointerId !== st.id) return; const s = st; st = null; if (!s.on) return;
    const r = s.row, go = !cancel && Math.abs(s.dx) >= s.th && !(s.dx > 0 && s.dest);
    if (go && s.dx < 0) { // quitar: sale hacia la izquierda y se va
      r.style.transition = RM ? 'none' : 'transform .2s,opacity .2s'; r.style.transform = 'translateX(-110%)'; r.style.opacity = 0;
      setTimeout(() => { s.u.remove(); removeStop(s.s); }, RM ? 0 : 200); M.swh = 1; saveM(); return;
    }
    r.style.transition = RM ? 'none' : 'transform .22s cubic-bezier(.2,.8,.2,1)'; r.style.transform = '';
    setTimeout(() => { s.u.remove(); r.classList.remove('swp'); r.style.transition = ''; if (go && s.dx > 0) { toggleClient(s.s); M.swh = 1; saveM(); } }, RM ? 0 : 230);
  };
  g.addEventListener('pointerup', e => end(e)); g.addEventListener('pointercancel', e => end(e, true));
})();
