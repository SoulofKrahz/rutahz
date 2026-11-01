
/* =================== Guardar jornada / editar =================== */
function entryFromCur(meta) {
  const c = D.cur;
  return {
    id: meta.id || uid(), label: meta.label, iso: meta.iso,
    start: { lat: c.start.lat, lon: c.start.lon, label: c.start.label, time: c.start.time || '' },
    stops: c.stops.map(s => ({ lat: s.lat, lon: s.lon, label: s.label, cid: s.cid || null })),
    ret: !!c.ret, legs: R.legs.slice(), notes: c.notes || '',
    tot: { road: R.km, dur: R.dur, cost: R.km * D.set.cpk, cpk: D.set.cpk, src: R.src, straight: R.straight }
  };
}
function askDetails(label, iso) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return dlg({
    title: D.edit ? 'Guardar cambios' : 'Guardar jornada', ok: 'Guardar',
    text: `${fmtKm(R.km)} · ${D.cur.stops.length} parada${D.cur.stops.length > 1 ? 's' : ''}${D.cur.ret ? ' · con vuelta' : ''}${R.src === 'straight' ? '\nSin conexión: la distancia es estimada. Podrás recalcularla desde el historial.' : ''}`,
    html: `<div><label class="lb" for="jn">Nombre</label><input class="inp" id="jn" type="text" maxlength="80" value="${esc(label)}" enterkeyhint="done"></div>
      <div><label class="lb" for="jd">Fecha de la jornada</label><input class="inp" id="jd" type="date" value="${esc(iso)}" max="${today()}">
      <div class="brow" style="margin-top:8px"><button class="btn g sm" data-d="${today()}">Hoy</button><button class="btn g sm" data-d="${isoOf(y)}">Ayer</button></div></div>`,
    open: b => b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { b.querySelector('#jd').value = x.dataset.d; }),
    check: b => {
      const d = b.querySelector('#jd').value || today();
      if (d > today()) { toast('La fecha no puede ser futura.'); return undefined; }
      return { label: b.querySelector('#jn').value.trim() || label, iso: d };
    }
  });
}
function defaultName(iso) { return 'Ruta del ' + dOf(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }); }
$('#bSave').onclick = async () => {
  if (!D.cur.start || !D.cur.stops.length) return;
  await recalc();
  const det = await askDetails(defaultName(today()), today()); if (!det) return;
  const e = entryFromCur(det); D.hist.push(e);
  D.cur = newCur(); R = { src: null, km: 0, straight: 0, legs: [], geom: null, dur: 0 };
  save(); renderRuta(); renderHist(); renderStats(); renderChip(); maybeBanner();
  toast(`Jornada guardada: ${fmtKm(e.tot.road)}`, { undo: () => { D.hist = D.hist.filter(x => x !== e); D.cur = { start: e.start, stops: e.stops.map(s => ({ ...s, id: uid() })), notes: e.notes, ret: e.ret }; save(); renderAll(); recalc(); } });
};
function startEdit(j) {
  if (D.edit) return toast('Termina antes la edición de «' + D.edit.snap.label + '».');
  const go = () => {
    D.hist = D.hist.filter(x => x.id !== j.id);
    D.edit = { snap: JSON.parse(JSON.stringify(j)), prevCur: JSON.parse(JSON.stringify(D.cur)) };
    D.cur = { start: { ...j.start }, stops: j.stops.map(s => ({ ...s, id: uid() })), notes: j.notes || '', ret: !!j.ret };
    save(); closeHistView(); renderAll(); setView('ruta'); recalc().then(() => fitCur());
    toast('Edita la ruta y pulsa «Guardar cambios».');
  };
  if (D.cur.stops.length) ask('¿Editar esta jornada?', 'La ruta que tienes ahora en curso se guarda aparte y vuelve cuando termines la edición.', 'Editar').then(ok => ok && go());
  else go();
}
$('#bEditOk').onclick = async () => {
  if (!D.edit) return;
  await recalc();
  const det = await askDetails(D.edit.snap.label, D.edit.snap.iso || today()); if (!det) return;
  const e = entryFromCur({ ...det, id: D.edit.snap.id });
  if (R.src !== 'road' && D.edit.snap.tot.src === 'road' && pointsEqual(D.edit.snap, D.cur)) e.tot = { ...D.edit.snap.tot }; // sin cambios de puntos: conserva la cifra real
  e.tot.cpk = D.edit.snap.tot.cpk ?? D.set.cpk; e.tot.cost = e.tot.road * e.tot.cpk;
  D.hist.push(e); D.cur = D.edit.prevCur || newCur(); D.edit = null;
  save(); renderAll(); recalc();
  toast('Cambios guardados en «' + e.label + '»');
};
function pointsEqual(a, b) { const p = pointsOf(a), q = pointsOf(b); return p.length === q.length && p.every((x, i) => near(x, q[i])); }
async function cancelEdit() {
  if (!D.edit) return;
  if (!await ask('¿Descartar los cambios?', 'La jornada vuelve al historial tal y como estaba.', 'Descartar', true)) return;
  D.hist.push(D.edit.snap); D.cur = D.edit.prevCur || newCur(); D.edit = null;
  save(); renderAll(); recalc();
  toast('Edición cancelada: la jornada no ha cambiado.');
}
$('#bEditNo').onclick = cancelEdit;
function repeatEntry(j) {
  if (D.edit) return toast('Termina antes la edición en curso.');
  const go = () => {
    D.cur = { start: { ...j.start, time: '' }, stops: j.stops.map(s => ({ ...s, id: uid() })), notes: '', ret: !!j.ret };
    save(); closeHistView(); renderRuta(); setView('ruta'); recalc().then(() => fitCur());
    toast('Ruta nueva con las paradas de «' + j.label + '». El historial no cambia.');
  };
  if (D.cur.stops.length) ask('¿Sustituir la ruta actual?', 'La ruta sin guardar se reemplaza por una copia de esta jornada.', 'Sustituir').then(ok => ok && go());
  else go();
}

/* =================== Historial =================== */
const est = j => j.tot && j.tot.src !== 'road';
function histSheet(j) {
  sheet({ title: j.label, sub: `${fmtDate(j.iso)} · ${fmtKm(j.tot.road)}`, items: [
    { icon: 'eye', label: 'Ver en el mapa', fn: () => showHistOnMap(j) },
    { icon: 'share', label: 'Compartir', sub: 'WhatsApp, correo u otra app', fn: () => shareEntry(j) },
    { icon: 'rep', label: 'Repetir como ruta nueva', fn: () => repeatEntry(j) },
    { icon: 'edit', label: 'Editar', fn: () => startEdit(j) },
    est(j) && { icon: 'refresh', label: 'Recalcular por carretera', sub: 'Ahora es una estimación sin conexión', fn: () => recalcEntries([j]) },
    { icon: 'trash', label: 'Eliminar', danger: true, fn: () => {
      const i = D.hist.indexOf(j); if (i < 0) return; D.hist.splice(i, 1); if (viewingHist === j) closeHistView();
      save(); renderHist(); renderStats(); renderChip();
      toast('Jornada eliminada', { undo: () => { D.hist.splice(Math.min(i, D.hist.length), 0, j); save(); renderHist(); renderStats(); renderChip(); } });
    } },
  ] });
}
function renderHist() {
  const q = norm($('#hq').value), all = D.hist.slice().sort((a, b) => (b.iso || '').localeCompare(a.iso || '') || String(b.id).localeCompare(String(a.id)));
  const list = q ? all.filter(j => norm(j.label).includes(q) || norm(j.notes).includes(q) || j.stops.some(s => norm(s.label).includes(q))) : all;
  $('#histSub').textContent = D.hist.length ? `${D.hist.length} jornada${D.hist.length > 1 ? 's' : ''} · ${fmtKm0(D.hist.reduce((a, j) => a + (j.tot.road || 0), 0))}` : '';
  const nEst = D.hist.filter(est).length;
  $('#recalcBox').innerHTML = nEst ? `<div class="fm w" style="display:flex;align-items:center;gap:10px"><span style="flex:1">${nEst} jornada${nEst > 1 ? 's' : ''} con distancia estimada (sin conexión al guardar).</span><button class="btn sm" id="bRecalcAll">${ic('refresh')}Recalcular</button></div>` : '';
  if (nEst) $('#bRecalcAll').onclick = () => recalcEntries(D.hist.filter(est));
  const el = $('#histList');
  if (!D.hist.length) { el.innerHTML = `<div class="card empty"><b>Todavía no hay jornadas</b>Cuando termines una ruta, pulsa «Guardar jornada».<br><button class="lnk" id="hImp" style="margin-top:10px">¿Tienes una copia de la versión anterior? Restáurala</button></div>`; $('#hImp').onclick = () => $('#bkIn').click(); return; }
  if (!list.length) { el.innerHTML = `<div class="empty"><b>Sin resultados</b>Prueba con otro nombre de cliente o jornada.</div>`; return; }
  const groups = new Map();
  list.forEach(j => { const k = (j.iso || '').slice(0, 7) || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(j); });
  let h = '';
  for (const [k, items] of groups) {
    const km = items.reduce((a, j) => a + (j.tot.road || 0), 0), lab = k === '—' ? 'Sin fecha' : dOf(k + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    h += `<div class="gh">${esc(lab)}<span>${items.length} jornada${items.length > 1 ? 's' : ''} · ${fmtKm0(km)}</span></div>`;
    h += items.map(j => { const d = dOf(j.iso); return `<button class="hi" data-id="${esc(j.id)}"><span class="dd"><b>${j.iso ? d.getDate() : '—'}</b><small>${j.iso ? d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '') : ''}</small></span><span class="bd"><h3>${esc(j.label)}</h3><span class="mt"><span class="chip m">${j.stops.length} parada${j.stops.length > 1 ? 's' : ''}</span>${j.ret ? `<span class="chip m">${ic('ret')}vuelta</span>` : ''}${est(j) ? `<span class="chip w">${ic('off')}estimada</span>` : ''}</span>${j.notes ? `<span class="nt">${esc(j.notes)}</span>` : ''}</span><span class="km"><b>${fmtKm(j.tot.road)}</b><small>${fmtEur(j.tot.cost)}</small></span></button>`; }).join('');
  }
  el.innerHTML = h;
  el.querySelectorAll('.hi').forEach(b => b.onclick = () => { const j = D.hist.find(x => String(x.id) === b.dataset.id); if (j) histSheet(j); });
}
$('#hq').addEventListener('input', renderHist);
let recalcBusy = false;
async function recalcEntries(list) {
  if (recalcBusy) return; if (!navigator.onLine) return toast('Necesitas conexión para recalcular.');
  recalcBusy = true; let ok = 0;
  for (let i = 0; i < list.length; i++) {
    const j = list[i]; toast(`Recalculando ${i + 1} de ${list.length}…`, { ms: 20000 });
    const r = await computeRoute(pointsOf(j));
    if (r.src === 'road') { const cpk = j.tot.cpk ?? (j.tot.road ? j.tot.cost / j.tot.road : D.set.cpk); j.legs = r.legs; j.tot = { ...j.tot, road: r.km, dur: r.dur, src: 'road', straight: r.straight, cpk, cost: r.km * cpk }; ok++; }
    if (i < list.length - 1) await sleep(1100); // el servidor público de rutas pide como mucho 1 petición por segundo
  }
  recalcBusy = false; save(); renderHist(); renderStats(); renderChip();
  toast(ok === list.length ? `Listo: ${ok} jornada${ok > 1 ? 's' : ''} con km reales.` : `${ok} de ${list.length} recalculadas. El resto, prueba más tarde.`, { ms: 4000 });
}

/* =================== Compartir =================== */
function shareText(j, o) {
  const L = [], name = (s, i) => o.n ? (s.label || `Parada ${i + 1}`) : `Parada ${i + 1}`;
  L.push(`🗺️ ${j.label} — ${fmtDate(j.iso)}`);
  L.push(`Salida: ${o.n ? j.start.label : 'Punto de partida'}${j.start.time ? ' (' + j.start.time + ')' : ''}`);
  let acc = 0;
  j.stops.forEach((s, i) => { const k = (j.legs && j.legs[i]) || 0; acc += k; L.push(`${i + 1}. ${name(s, i)} — ${fmtKm(k)} (total ${fmtKm(acc)})`); });
  if (j.ret) { const k = (j.legs && j.legs[j.stops.length]) || 0; acc += k; L.push(`↩ Vuelta a ${o.n ? j.start.label : 'punto de partida'} — ${fmtKm(k)}`); }
  L.push('');
  L.push(`Total: ${fmtKm(j.tot.road)}${j.tot.src === 'road' ? ' por carretera' : ' (estimado)'}`);
  if (j.tot.dur > 0) L.push(`Al volante: ${fmtDur(j.tot.dur)}`);
  if (o.t && j.notes) L.push(`📝 ${j.notes}`);
  if (o.m && j.stops.length) {
    const pts = pointsOf(j), org = pts[0], dst = pts[pts.length - 1], mid = pts.slice(1, -1).slice(0, 9);
    let u = `https://www.google.com/maps/dir/?api=1&origin=${org.lat.toFixed(5)},${org.lon.toFixed(5)}&destination=${dst.lat.toFixed(5)},${dst.lon.toFixed(5)}&travelmode=driving`;
    if (mid.length) u += '&waypoints=' + mid.map(p => `${p.lat.toFixed(5)},${p.lon.toFixed(5)}`).join('%7C');
    L.push('', `Ver en Google Maps: ${u}`);
  }
  return L.join('\n');
}
function shareEntry(j) {
  const o = { n: D.set.shN, m: D.set.shM, t: D.set.shT };
  const sw = (id, lab, on) => `<div class="row"><div><b>${lab}</b></div><label class="sw"><input type="checkbox" id="${id}" ${on ? 'checked' : ''}><span></span></label></div>`;
  dlg({
    title: 'Compartir jornada', acts: [{ t: 'Copiar', cls: 'g', v: 'copy', icon: 'copy' }, ...(navigator.share ? [{ t: 'Otras apps', cls: 'g', v: 'share', icon: 'share' }] : []), { t: 'WhatsApp', v: 'wa', icon: 'chat' }],
    html: `<div class="card" style="padding:4px 14px;box-shadow:none">${sw('shN', 'Nombres de las paradas', o.n)}${sw('shM', 'Enlace de Google Maps', o.m)}${sw('shT', 'Notas', o.t)}</div>
      ${o.n ? '' : ''}<pre id="shP" style="white-space:pre-wrap;font:.78rem/1.5 ui-monospace,Menlo,monospace;background:var(--bg);border:1px solid var(--bd);border-radius:12px;padding:10px 12px;max-height:30dvh;overflow:auto;color:var(--mu)"></pre>`,
    open: b => {
      const upd = () => { o.n = b.querySelector('#shN').checked; o.m = b.querySelector('#shM').checked; o.t = b.querySelector('#shT').checked; b.querySelector('#shP').textContent = shareText(j, o); };
      b.querySelectorAll('input[type=checkbox]').forEach(x => x.onchange = upd); upd();
    },
    check: (b, v) => v
  }).then(async v => {
    if (!v) return;
    D.set.shN = o.n; D.set.shM = o.m; D.set.shT = o.t; save(); syncSettings();
    const t = shareText(j, o);
    if (v === 'wa') location.href = 'https://wa.me/?text=' + encodeURIComponent(t);
    else if (v === 'share') { try { await navigator.share({ text: t }); } catch (e) {} }
    else { let ok = false; try { await navigator.clipboard.writeText(t); ok = true; } catch (e) { const ta = document.createElement('textarea'); ta.value = t; ta.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(ta); ta.select(); try { ok = document.execCommand('copy'); } catch (e2) {} ta.remove(); } toast(ok ? 'Texto copiado' : 'No se ha podido copiar.'); }
  });
}

/* =================== Estadísticas =================== */
function monthKey(iso) { return (iso || '').slice(0, 7); }
function renderChip() {
  const ym = today().slice(0, 7), km = D.hist.filter(j => monthKey(j.iso) === ym).reduce((a, j) => a + (j.tot.road || 0), 0);
  $('#kmChipV').textContent = fmtKm0(km);
  $('#kmChipL').textContent = new Date().toLocaleDateString('es-ES', { month: 'long' });
}
$('#kmChip').onclick = () => setView('stats');
function renderStats() {
  const box = $('#statsBox'), H = D.hist, t = today(), now = new Date();
  if (!H.length) { box.innerHTML = `<div class="card empty"><b>Sin datos todavía</b>Las estadísticas aparecen al guardar tu primera jornada.</div>`; return; }
  const sum = (arr, f) => arr.reduce((a, j) => a + (f(j) || 0), 0);
  const mon = new Date(now); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const monIso = isoOf(mon);
  const ym = t.slice(0, 7), wk = H.filter(j => j.iso >= monIso && j.iso <= t), mo = H.filter(j => monthKey(j.iso) === ym);
  // mes anterior hasta el mismo día, para comparar periodos iguales
  const pd = new Date(now.getFullYear(), now.getMonth() - 1, 1), pym = isoOf(pd).slice(0, 7);
  const lastDayPrev = new Date(now.getFullYear(), now.getMonth(), 0).getDate(), cut = pym + '-' + pad(Math.min(now.getDate(), lastDayPrev));
  const prevSame = H.filter(j => monthKey(j.iso) === pym && j.iso <= cut), prevAll = H.filter(j => monthKey(j.iso) === pym);
  const moKm = sum(mo, j => j.tot.road), psKm = sum(prevSame, j => j.tot.road);
  let cmp = '<b>—</b><span>vs mes anterior</span><small>Sin jornadas el mes pasado</small>';
  if (psKm > 0) { const pc = Math.round((moKm - psKm) / psKm * 100); cmp = `<b class="${pc > 0 ? 'dn' : 'up'}">${pc > 0 ? '+' : ''}${pc} %</b><span>vs mes anterior</span><small>Mismo periodo: ${fmtKm0(psKm)}</small>`; }
  else if (prevAll.length) cmp = `<b>—</b><span>vs mes anterior</span><small>Hasta el día ${now.getDate()} no hubo jornadas</small>`;
  const days = new Set(mo.map(j => j.iso)).size, yr = H.filter(j => (j.iso || '').startsWith(t.slice(0, 4)));
  const allKm = sum(H, j => j.tot.road), allStops = sum(H, j => j.stops.length);
  // gráfico: últimos 6 meses seguidos, aunque alguno esté vacío
  const months = []; for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); months.push(isoOf(d).slice(0, 7)); }
  const mkm = months.map(k => sum(H.filter(j => monthKey(j.iso) === k), j => j.tot.road)), mx = Math.max(...mkm, 1);
  // clientes más visitados
  const rk = new Map();
  H.forEach(j => j.stops.forEach(s => { const c = clientOf(s), k = c ? c.id : 'l:' + norm(s.label); if (!k || k === 'l:') return; if (!rk.has(k)) rk.set(k, { label: c ? c.label : s.label, n: 0, v: [] }); const r = rk.get(k); r.n++; r.v.push(j); }));
  const top = [...rk.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  box.innerHTML = `
    <div class="card"><div class="ch"><span>${ic('cal')}Este periodo</span></div><div class="sg">
      <div><b>${fmtKm0(sum(wk, j => j.tot.road))}</b><span>Esta semana</span><small>${wk.length} jornada${wk.length === 1 ? '' : 's'}</small></div>
      <div><b>${fmtKm0(moKm)}</b><span>Este mes</span><small>${mo.length} jornada${mo.length === 1 ? '' : 's'} · ${fmtEur(sum(mo, j => j.tot.cost))}</small></div>
      <div>${cmp}</div>
      <div><b>${days}</b><span>Días con ruta</span><small>en ${now.toLocaleDateString('es-ES', { month: 'long' })}</small></div>
    </div></div>
    <div class="card"><div class="ch"><span>${ic('chart')}Km por mes</span><small>últimos 6 meses</small></div><div class="chart" role="img" aria-label="Kilómetros por mes">${months.map((k, i) => `<div class="${k === ym ? 'cur' : ''}"><em>${mkm[i] ? nf0.format(mkm[i]) : ''}</em><i style="height:${Math.max(3, Math.round(mkm[i] / mx * 130))}px"></i><span>${dOf(k + '-01').toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span></div>`).join('')}</div></div>
    <div class="card"><div class="ch"><span>${ic('route')}Histórico</span></div><div class="sg">
      <div><b>${fmtKm0(allKm)}</b><span>Km en total</span><small>${fmtKm0(sum(yr, j => j.tot.road))} este año</small></div>
      <div><b>${H.length}</b><span>Jornadas</span><small>${allStops} paradas</small></div>
      <div><b>${fmtKm(allKm / H.length)}</b><span>Km por jornada</span></div>
      <div><b>${nf1.format(allStops / H.length)}</b><span>Paradas por jornada</span></div>
      <div><b>${fmtEur(sum(H, j => j.tot.cost))}</b><span>Coste estimado</span></div>
      <div><b>${fmtDur(sum(H, j => j.tot.dur))}</b><span>Al volante</span></div>
    </div></div>
    <div class="card"><div class="ch"><span>${ic('star')}Clientes más visitados</span><small>toca para ver fechas</small></div><div class="rk">${top.length ? top.map((r, i) => `<div><button data-i="${i}" aria-expanded="false"><span class="p">${i + 1}</span><span class="b"><b>${esc(r.label)}</b><span class="t"><i style="width:${Math.round(r.n / top[0].n * 100)}%"></i></span></span><span class="c">${r.n} visita${r.n > 1 ? 's' : ''}</span></button><div class="dt" hidden>${r.v.slice().sort((a, b) => (b.iso || '').localeCompare(a.iso || '')).slice(0, 8).map(j => `<div>${esc(fmtDate(j.iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))} · ${esc(j.label)}</div>`).join('')}</div></div>`).join('') : '<p class="hint">Sin paradas todavía.</p>'}</div></div>`;
  box.querySelectorAll('.rk button').forEach(b => b.onclick = () => { const d = b.nextElementSibling; d.hidden = !d.hidden; b.setAttribute('aria-expanded', String(!d.hidden)); });
}

/* =================== Exportar: informe, CSV =================== */
function periodRange(k, from, to) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth();
  if (k === 'mes') return [isoOf(new Date(y, m, 1)), today(), 'Mes de ' + n.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })];
  if (k === 'ant') { const a = new Date(y, m - 1, 1), b = new Date(y, m, 0); return [isoOf(a), isoOf(b), 'Mes de ' + a.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })]; }
  if (k === 'ano') return [y + '-01-01', today(), 'Año ' + y];
  if (k === 'fec') return [from || '0000-01-01', to || today(), `Del ${fmtDate(from, { day: 'numeric', month: 'short', year: 'numeric' })} al ${fmtDate(to, { day: 'numeric', month: 'short', year: 'numeric' })}`];
  return ['0000-01-01', '9999-12-31', 'Todas las jornadas'];
}
function exportDlg(pre) {
  const per = pre || M.exP || 'mes', cols = Object.assign({ paradas: true, km: true, tiempo: true, coste: true, notas: false, det: false }, M.exC || {});
  const cb = (k, l) => `<label style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:.875rem"><input type="checkbox" data-c="${k}" ${cols[k] ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--em2)">${l}</label>`;
  dlg({
    title: 'Informe y Excel',
    acts: [{ t: 'Cancelar', cls: 'g', v: null }, { t: 'Excel', cls: 'g', v: 'csv', icon: 'sheet' }, { t: 'Informe / PDF', v: 'pdf', icon: 'file' }],
    html: `<div><label class="lb">Periodo</label><select class="inp" id="exP"><option value="mes">Este mes</option><option value="ant">Mes anterior</option><option value="ano">Este año</option><option value="todo">Todo</option><option value="fec">Entre fechas…</option></select>
      <div class="brow" id="exF" style="margin-top:8px" hidden><input class="inp" type="date" id="exA" style="flex:1" aria-label="Desde"><input class="inp" type="date" id="exB" style="flex:1" aria-label="Hasta"></div><p class="hint" id="exN" style="margin-top:6px"></p></div>
      <div><label class="lb">Columnas del informe</label>${cb('paradas', 'Número de paradas')}${cb('km', 'Kilómetros')}${cb('tiempo', 'Tiempo al volante')}${cb('coste', 'Coste estimado')}${cb('notas', 'Notas')}${cb('det', 'Lista de paradas de cada jornada (con nombres)')}</div>
      <div><label class="lb">Excel</label><select class="inp" id="exK"><option value="res">Una fila por jornada</option><option value="det">Una fila por parada (detalle)</option></select></div>`,
    open: b => {
      const sP = b.querySelector('#exP'); sP.value = per;
      const upd = () => { b.querySelector('#exF').hidden = sP.value !== 'fec'; const [a, z] = periodRange(sP.value, b.querySelector('#exA').value, b.querySelector('#exB').value); const l = D.hist.filter(j => j.iso >= a && j.iso <= z); b.querySelector('#exN').textContent = `${l.length} jornada${l.length === 1 ? '' : 's'} · ${fmtKm(l.reduce((s, j) => s + (j.tot.road || 0), 0))}`; };
      sP.onchange = upd; b.querySelector('#exA').onchange = upd; b.querySelector('#exB').onchange = upd;
      const n = new Date(); b.querySelector('#exA').value = isoOf(new Date(n.getFullYear(), n.getMonth(), 1)); b.querySelector('#exB').value = today(); upd();
    },
    check: (b, v) => {
      const c = {}; b.querySelectorAll('[data-c]').forEach(x => c[x.dataset.c] = x.checked);
      return { v, p: b.querySelector('#exP').value, a: b.querySelector('#exA').value, z: b.querySelector('#exB').value, c, k: b.querySelector('#exK').value };
    }
  }).then(r => {
    if (!r) return;
    M.exP = r.p === 'fec' ? M.exP : r.p; M.exC = r.c; saveM();
    const [a, z, lab] = periodRange(r.p, r.a, r.z), list = D.hist.filter(j => j.iso >= a && j.iso <= z).sort((x, y) => (x.iso || '').localeCompare(y.iso || ''));
    if (!list.length) return toast('No hay jornadas en ese periodo.');
    if (r.v === 'pdf') printReport(list, lab, r.c);
    else exportCSV(list, lab, r.k, a, z);
  });
}
$('#bExport').onclick = () => exportDlg(); $('#bExport2').onclick = () => exportDlg();
function stopChain(j) { const p = [j.start.label, ...j.stops.map((s, i) => s.label || `Parada ${i + 1}`)]; if (j.ret) p.push(j.start.label); return p.join(' → '); }
function printReport(list, lab, c) {
  const km = list.reduce((s, j) => s + (j.tot.road || 0), 0), cost = list.reduce((s, j) => s + (j.tot.cost || 0), 0), dur = list.reduce((s, j) => s + (j.tot.dur || 0), 0);
  const th = ['Fecha', 'Jornada']; if (c.paradas) th.push('Paradas'); if (c.km) th.push('Km'); if (c.tiempo) th.push('Tiempo'); if (c.coste) th.push('Coste'); if (c.notas) th.push('Notas');
  const rows = list.map(j => {
    const cells = [`<td style="white-space:nowrap">${esc(fmtDate(j.iso, { day: '2-digit', month: '2-digit', year: 'numeric' }))}</td>`, `<td>${esc(j.label)}${est(j) ? ' <span style="color:#a8640a">(estimada)</span>' : ''}${c.det ? `<div class="det">${esc(stopChain(j))}</div>` : ''}</td>`];
    if (c.paradas) cells.push(`<td class="n">${j.stops.length}</td>`); if (c.km) cells.push(`<td class="n">${fmtKm(j.tot.road)}</td>`); if (c.tiempo) cells.push(`<td class="n">${fmtDur(j.tot.dur)}</td>`); if (c.coste) cells.push(`<td class="n">${fmtEur(j.tot.cost)}</td>`); if (c.notas) cells.push(`<td>${esc(j.notes || '')}</td>`);
    return `<tr>${cells.join('')}</tr>`;
  }).join('');
  const foot = [`<td colspan="2">Total · ${list.length} jornada${list.length > 1 ? 's' : ''}</td>`]; if (c.paradas) foot.push(`<td class="n">${list.reduce((s, j) => s + j.stops.length, 0)}</td>`); if (c.km) foot.push(`<td class="n">${fmtKm(km)}</td>`); if (c.tiempo) foot.push(`<td class="n">${fmtDur(dur)}</td>`); if (c.coste) foot.push(`<td class="n">${fmtEur(cost)}</td>`); if (c.notas) foot.push('<td></td>');
  const title = `Kilometraje · ${lab}`;
  $('#print').innerHTML = `<h1>${esc(title)}</h1><div class="meta">Generado el ${esc(fmtDate(today(), { day: 'numeric', month: 'long', year: 'numeric' }))} con Rutahz${list.some(est) ? ' · las jornadas marcadas como estimadas se calcularon sin conexión' : ''}</div>
    <div class="tot"><div><b>${fmtKm(km)}</b><span>Kilómetros</span></div><div><b>${list.length}</b><span>Jornadas</span></div><div><b>${new Set(list.map(j => j.iso)).size}</b><span>Días</span></div>${c.coste ? `<div><b>${fmtEur(cost)}</b><span>Coste estimado</span></div>` : ''}</div>
    <table><thead><tr>${th.map((h, i) => `<th${i > 1 && h !== 'Notas' ? ' style="text-align:right"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody><tfoot><tr>${foot.join('')}</tr></tfoot></table>
    <div class="fn">Rutahz es una herramienta personal de seguimiento de kilometraje. Distancias por carretera calculadas con OSRM (OpenStreetMap). No constituye un registro oficial ante la Agencia Tributaria ni otros organismos.</div>`;
  const prev = document.title; document.title = title.replace(/[\\/:*?"<>|]/g, '-');
  setTimeout(() => { window.print(); setTimeout(() => { document.title = prev; }, 400); }, 60);
}
const csvC = v => { v = v == null ? '' : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const dec = (n, d = 1) => (n || 0).toFixed(d).replace('.', ',');
function exportCSV(list, lab, kind, a, z) {
  let rows;
  const dd = iso => fmtDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
  if (kind === 'det') {
    rows = [['Fecha', 'Jornada', 'Orden', 'Punto', 'Km del tramo', 'Km acumulados', 'Latitud', 'Longitud']];
    list.forEach(j => {
      rows.push([dd(j.iso), j.label, 0, 'Salida: ' + j.start.label, '0,0', '0,0', j.start.lat.toFixed(5), j.start.lon.toFixed(5)]);
      let acc = 0;
      j.stops.forEach((s, i) => { const k = (j.legs && j.legs[i]) || 0; acc += k; rows.push([dd(j.iso), j.label, i + 1, s.label, dec(k), dec(acc), s.lat.toFixed(5), s.lon.toFixed(5)]); });
      if (j.ret) { const k = (j.legs && j.legs[j.stops.length]) || 0; acc += k; rows.push([dd(j.iso), j.label, j.stops.length + 1, 'Vuelta: ' + j.start.label, dec(k), dec(acc), j.start.lat.toFixed(5), j.start.lon.toFixed(5)]); }
    });
  } else {
    rows = [['Fecha', 'Jornada', 'Paradas', 'Km', 'Minutos al volante', 'Coste (€)', 'Cálculo', 'Con vuelta', 'Recorrido', 'Notas']];
    list.forEach(j => rows.push([dd(j.iso), j.label, j.stops.length, dec(j.tot.road), j.tot.dur ? Math.round(j.tot.dur) : '', dec(j.tot.cost, 2), j.tot.src === 'road' ? 'Carretera' : 'Estimado', j.ret ? 'Sí' : 'No', stopChain(j), j.notes || '']));
    rows.push(['', 'TOTAL', list.reduce((s, j) => s + j.stops.length, 0), dec(list.reduce((s, j) => s + (j.tot.road || 0), 0)), Math.round(list.reduce((s, j) => s + (j.tot.dur || 0), 0)) || '', dec(list.reduce((s, j) => s + (j.tot.cost || 0), 0), 2), '', '', '', '']);
  }
  const name = `rutahz-${kind === 'det' ? 'detalle' : 'jornadas'}-${a === '0000-01-01' ? 'todo' : a.slice(0, 7) === z.slice(0, 7) ? a.slice(0, 7) : a + '_' + z}.csv`;
  giveFile(name, '﻿' + rows.map(r => r.map(csvC).join(';')).join('\r\n'), 'text/csv;charset=utf-8', 'Excel de Rutahz');
}
async function giveFile(name, content, mime, title, mode = 'auto') {
  const blob = new Blob([content], { type: mime });
  if ((mode === 'share' || (mode === 'auto' && matchMedia('(pointer:coarse)').matches)) && navigator.canShare) {
    try { const f = new File([blob], name, { type: mime.split(';')[0] }); if (navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title }); return 'shared'; } }
    catch (e) { if (e && e.name === 'AbortError') return 'aborted'; }
  }
  const u = URL.createObjectURL(blob), a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(u); a.remove(); }, 1500);
  return 'downloaded';
}
