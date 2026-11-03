
/* =================== Tiempos =================== */
const isReal = j => j.tot && j.tot.durM != null;
const jDur = j => !j.tot ? 0 : isReal(j) ? j.tot.durM : (j.tot.dur || 0);
const arrivals = j => j.stops.length + (j.ret ? 1 : 0);
const hhmm = m => { if (!(m > 0)) return ''; const t = Math.round(m); return Math.floor(t / 60) + ':' + pad(t % 60); };
const fmtX = n => nf2.format(n).replace(/0$/, '');
function legMin(j, i) { const d = j.legsDur && j.legsDur[i]; return d == null ? null : d * (j.tot.tf ?? 1) + (j.tot.pm ?? 0); }
function durExplain(j) {
  if (!j.tot || j.tot.durRaw == null) return 'Calculado con la versión anterior de Rutahz (sin ajuste de tráfico).';
  return `Servicio de rutas ${fmtDur(j.tot.durRaw)} × ${fmtX(j.tot.tf)} + ${arrivals(j)} llegada${arrivals(j) === 1 ? '' : 's'} × ${j.tot.pm} min = ${fmtDur(j.tot.dur)}`;
}
const durHtml = (id, m) => `<div class="brow" style="flex-wrap:nowrap;align-items:center;gap:8px"><input class="inp" id="${id}h" type="number" inputmode="numeric" min="0" max="23" placeholder="h" value="${m != null ? Math.floor(Math.round(m) / 60) : ''}" style="width:84px" aria-label="Horas"><span>h</span><input class="inp" id="${id}m" type="number" inputmode="numeric" min="0" max="59" placeholder="min" value="${m != null ? Math.round(m) % 60 : ''}" style="width:96px" aria-label="Minutos"><span>min</span></div>`;
function readDur(b, id) {
  const h = b.querySelector('#' + id + 'h').value.trim(), m = b.querySelector('#' + id + 'm').value.trim();
  if (!h && !m) return null;
  const v = (parseInt(h || '0', 10) || 0) * 60 + (parseInt(m || '0', 10) || 0);
  return v > 0 && v < 24 * 60 ? v : undefined;
}

/* =================== Guardar jornada / editar =================== */
function entryFromCur(meta) {
  const c = D.cur;
  return {
    id: meta.id || uid(), label: meta.label, iso: meta.iso,
    start: { lat: c.start.lat, lon: c.start.lon, label: c.start.label, time: c.start.time || '' },
    stops: c.stops.map(s => ({ lat: s.lat, lon: s.lon, label: s.label, cid: s.cid || null })),
    ret: !!c.ret, legs: R.legs.slice(), legsDur: (R.legsDur || []).slice(), notes: c.notes || '',
    tot: { road: R.km, dur: R.dur, durRaw: R.durRaw, tf: D.set.tf, pm: D.set.pm, durM: meta.durM ?? null, cost: R.km * D.set.cpk, cpk: D.set.cpk, src: R.src, straight: R.straight }
  };
}
function askDetails(label, iso, durM) {
  const y = new Date(); y.setDate(y.getDate() - 1);
  return dlg({
    title: D.edit ? 'Guardar cambios' : 'Guardar jornada', ok: 'Guardar',
    text: `${fmtKm(R.km)} · ${D.cur.stops.length} parada${D.cur.stops.length > 1 ? 's' : ''}${D.cur.ret ? ' · con vuelta' : ''}${R.src === 'straight' ? '\nSin conexión: la distancia es estimada. Podrás recalcularla desde el historial.' : ''}`,
    html: `<div><label class="lb" for="jn">Nombre</label><input class="inp" id="jn" type="text" maxlength="80" value="${esc(label)}" enterkeyhint="done"><p class="ferr" id="jnE" role="alert" hidden></p></div>
      <div><label class="lb" for="jd">Fecha de la jornada</label><input class="inp" id="jd" type="date" value="${esc(iso)}" max="${today()}">
      <div class="brow" style="margin-top:8px"><button class="btn g sm" data-d="${today()}">Hoy</button><button class="btn g sm" data-d="${isoOf(y)}">Ayer</button></div></div>
      <div><label class="lb">Tiempo real al volante <span style="font-weight:500">(opcional)</span></label>${durHtml('jt', durM)}<p class="hint" style="margin-top:6px">Estimado: <b>${fmtDur(R.dur)}</b>. Si sabes el tiempo real, anótalo: es el que saldrá en los informes.</p></div>`,
    open: b => {
      // si el nombre es el automático, sigue a la fecha («Ruta del 2 de noviembre», sin repetir)
      const jn = b.querySelector('#jn'), jd = b.querySelector('#jd'); let auto = jn.value;
      const onDate = () => { if (jn.value === auto && /^Ruta del /.test(auto)) { auto = uniqName(defaultName(jd.value || today()), histNames(D.edit && D.edit.snap.id)); jn.value = auto; fieldErr(b, 'jnE', null); } };
      b.querySelectorAll('[data-d]').forEach(x => x.onclick = () => { jd.value = x.dataset.d; onDate(); });
      jd.addEventListener('change', onDate); jn.addEventListener('input', () => fieldErr(b, 'jnE', null));
    },
    check: b => {
      const nm = (b.querySelector('#jn').value.trim() || label), taken = histNames(D.edit && D.edit.snap.id);
      if (taken.has(nameKey(nm))) { const o = D.hist.find(j => nameKey(j.label) === nameKey(nm) && !(D.edit && j.id === D.edit.snap.id)); fieldErr(b, 'jnE', { msg: `Ya tienes una jornada llamada «${o ? o.label : nm}»${o && o.iso ? ' (' + fmtDate(o.iso, { day: 'numeric', month: 'short' }) + ')' : ''}. Ponle otro nombre para no confundirlas en los informes.`, sug: uniqName(nm, taken) }); return undefined; }
      const d = b.querySelector('#jd').value || today();
      if (d > today()) { toast('La fecha no puede ser futura.'); return undefined; }
      const t = readDur(b, 'jt'); if (t === undefined) { toast('Revisa el tiempo real: entre 1 minuto y 23 h 59 min.'); return undefined; }
      return { label: nm, iso: d, durM: t };
    }
  });
}
function defaultName(iso) { return 'Ruta del ' + dOf(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' }); }
$('#bSave').onclick = async () => {
  if (!D.cur.start || !D.cur.stops.length) return;
  await recalc();
  const det = await askDetails(uniqName(defaultName(today()), histNames()), today()); if (!det) return;
  const e = entryFromCur(det); D.hist.push(e);
  D.cur = newCur(); R = R0();
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
  const det = await askDetails(D.edit.snap.label, D.edit.snap.iso || today(), D.edit.snap.tot.durM); if (!det) return;
  const e = entryFromCur({ ...det, id: D.edit.snap.id });
  if (R.src !== 'road' && D.edit.snap.tot.src === 'road' && pointsEqual(D.edit.snap, D.cur)) { e.tot = { ...D.edit.snap.tot, durM: det.durM ?? null }; e.legs = D.edit.snap.legs || e.legs; e.legsDur = D.edit.snap.legsDur || e.legsDur; } // sin cambios de puntos: conserva la cifra real
  e.tot.cpk = D.edit.snap.tot.cpk ?? D.set.cpk; e.tot.cost = e.tot.road * e.tot.cpk;
  if (D.edit.snap.exp) e.exp = D.edit.snap.exp;
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
/* ---- Exportadas: cada jornada recuerda cuándo salió en un Excel o informe y con qué datos ----
   Si después cambian sus km, tiempo, fecha, nombre o paradas, queda como «cambiada tras exportar». */
const expSig = j => [j.iso, j.label, (j.tot.road || 0).toFixed(1), Math.round(jDur(j) || 0), j.ret ? 1 : 0, j.stops.map(s => s.label || '').join('·')].join('|');
const expOf = j => !j.exp ? '' : j.exp.sig === expSig(j) ? 'ok' : 'chg';
const pendingExp = j => expOf(j) !== 'ok';
function markExported(list, k) { const d = today(); list.forEach(j => { j.exp = { d, k, sig: expSig(j) }; }); save(); renderHist(); }
let hF = 'all';
function histSheet(j) {
  sheet({ title: j.label, sub: `${fmtDate(j.iso)} · ${fmtKm(j.tot.road)}`, items: [
    { icon: 'eye', label: 'Ver en el mapa', fn: () => showHistOnMap(j) },
    { icon: 'share', label: 'Compartir', sub: 'WhatsApp, correo u otra app', fn: () => shareEntry(j) },
    { icon: 'rep', label: 'Repetir como ruta nueva', fn: () => repeatEntry(j) },
    { icon: 'clock', label: isReal(j) ? 'Tiempo real: ' + fmtDur(j.tot.durM) : 'Anotar el tiempo real al volante', sub: isReal(j) ? 'Estimado: ' + fmtDur(j.tot.dur) : 'Estimado: ' + fmtDur(j.tot.dur) + ' · el real es el que vale en los informes', fn: () => setRealTime(j) },
    { icon: 'edit', label: 'Editar', fn: () => startEdit(j) },
    expOf(j) === 'ok' ? { icon: 'ck', label: `Exportada el ${fmtDate(j.exp.d, { day: 'numeric', month: 'long' })} (${j.exp.k})`, sub: 'Toca para marcarla como no exportada', fn: () => { const o = j.exp; delete j.exp; save(); renderHist(); toast('Marcada como no exportada', { undo: () => { j.exp = o; save(); renderHist(); } }); } }
      : expOf(j) === 'chg' ? { icon: 'info', label: 'Cambiada después de exportarla', sub: `Se exportó el ${fmtDate(j.exp.d, { day: 'numeric', month: 'long' })}. Si ya la has corregido en la empresa, márcala como exportada`, fn: () => { markExported([j], j.exp.k); toast('Marcada como exportada'); } }
      : { icon: 'ck', label: 'Marcar como exportada', sub: 'Si ya la enviaste a la empresa por otro lado', fn: () => { markExported([j], 'a mano'); toast('Marcada como exportada', { undo: () => { delete j.exp; save(); renderHist(); } }); } },
    est(j) && { icon: 'refresh', label: 'Recalcular por carretera', sub: 'Ahora es una estimación sin conexión', fn: () => recalcEntries([j]) },
    { icon: 'trash', label: 'Eliminar', danger: true, fn: () => {
      const i = D.hist.indexOf(j); if (i < 0) return; D.hist.splice(i, 1); if (viewingHist === j) closeHistView();
      save(); renderHist(); renderStats(); renderChip();
      toast('Jornada eliminada', { undo: () => { D.hist.splice(Math.min(i, D.hist.length), 0, j); save(); renderHist(); renderStats(); renderChip(); } });
    } },
  ] });
}
function setRealTime(j) {
  const acts = [{ t: 'Cancelar', cls: 'g', v: null }, ...(isReal(j) ? [{ t: 'Usar el estimado', cls: 'g', v: 'clear' }] : []), { t: 'Guardar', v: 'ok' }];
  dlg({ title: 'Tiempo real al volante', text: `${j.label} · ${fmtDate(j.iso, { day: 'numeric', month: 'long' })}\n${durExplain(j)}`, acts, focus: true,
    html: durHtml('rt', j.tot.durM), check: (b, v) => { if (v !== 'ok') return v; const t = readDur(b, 'rt'); if (t == null) { toast('Escribe horas o minutos.'); return undefined; } if (t === undefined) { toast('Entre 1 minuto y 23 h 59 min.'); return undefined; } return t; } })
    .then(v => {
      if (v == null) return; const old = j.tot.durM ?? null;
      j.tot.durM = v === 'clear' ? null : v; save(); renderHist(); renderStats(); renderCalNote();
      toast(v === 'clear' ? 'Vuelve a usar el tiempo estimado' : 'Tiempo real guardado: ' + fmtDur(v), { undo: () => { j.tot.durM = old; save(); renderHist(); renderStats(); renderCalNote(); } });
    });
}
function renderHist() {
  const q = norm($('#hq').value), all = D.hist.slice().sort((a, b) => (b.iso || '').localeCompare(a.iso || '') || String(b.id).localeCompare(String(a.id)));
  const anyExp = D.hist.some(j => j.exp), nPend = D.hist.filter(pendingExp).length, nChg = D.hist.filter(j => expOf(j) === 'chg').length;
  if (!anyExp && hF !== 'all') hF = 'all'; if (hF === 'chg' && !nChg) hF = 'pend';
  $('#histF').innerHTML = !D.hist.length ? '' : `<div class="seg" id="sgHf" role="group" aria-label="Filtrar por exportación"><button data-f="all" class="${hF === 'all' ? 'on' : ''}">Todas</button><button data-f="pend" class="${hF === 'pend' ? 'on' : ''}">Sin exportar${nPend ? ' · ' + nPend : ''}</button>${nChg ? `<button data-f="chg" class="${hF === 'chg' ? 'on' : ''}">Cambiadas · ${nChg}</button>` : ''}</div>`
    + (nPend ? `<button class="lnk" id="bMarkExp" style="align-self:flex-start;font-size:.8125rem">${ic('ck')}Marcar como exportadas…</button>` : '');
  $$('#sgHf button').forEach(b => b.onclick = () => { hF = b.dataset.f; renderHist(); });
  if ($('#bMarkExp')) $('#bMarkExp').onclick = markExpDlg;
  const fl = hF === 'pend' ? all.filter(pendingExp) : hF === 'chg' ? all.filter(j => expOf(j) === 'chg') : all;
  const list = q ? fl.filter(j => norm(j.label).includes(q) || norm(j.notes).includes(q) || j.stops.some(s => norm(s.label).includes(q))) : fl;
  $('#histSub').textContent = D.hist.length ? `${D.hist.length} jornada${D.hist.length > 1 ? 's' : ''} · ${fmtKm0(D.hist.reduce((a, j) => a + (j.tot.road || 0), 0))}` : '';
  const nDup = dupCount(D.hist);
  $('#histDup').innerHTML = nDup ? `<div class="fm w" style="display:flex;align-items:center;gap:10px"><span style="flex:1">${nDup} jornada${nDup > 1 ? 's' : ''} con el nombre repetido. Al arreglarlo se les añade (2), (3)… a las más recientes.</span><button class="btn sm" id="bDupH">Arreglar</button></div>` : '';
  if (nDup) $('#bDupH').onclick = () => { const ch = fixDupNames(D.hist, j => (j.iso || '') + String(j.id)); save(); renderHist(); renderStats(); toast(`${ch.length} nombre${ch.length > 1 ? 's' : ''} cambiado${ch.length > 1 ? 's' : ''}`, { undo: () => { ch.forEach(([j, l]) => j.label = l); save(); renderHist(); renderStats(); } }); };
  const nEst = D.hist.filter(est).length;
  $('#recalcBox').innerHTML = nEst ? `<div class="fm w" style="display:flex;align-items:center;gap:10px"><span style="flex:1">${nEst} jornada${nEst > 1 ? 's' : ''} con distancia estimada (sin conexión al guardar).</span><button class="btn sm" id="bRecalcAll">${ic('refresh')}Recalcular</button></div>` : '';
  if (nEst) $('#bRecalcAll').onclick = () => recalcEntries(D.hist.filter(est));
  const el = $('#histList');
  if (!D.hist.length) { el.innerHTML = `<div class="card empty"><b>Todavía no hay jornadas</b>Cuando termines una ruta, pulsa «Guardar jornada».<br><button class="lnk" id="hImp" style="margin-top:10px">¿Tienes una copia de la versión anterior? Restáurala</button></div>`; $('#hImp').onclick = () => $('#bkIn').click(); return; }
  if (!list.length) { el.innerHTML = hF === 'pend' && !q ? `<div class="empty"><b>Todo exportado</b>No hay jornadas pendientes de enviar a la empresa.</div>` : `<div class="empty"><b>Sin resultados</b>Prueba con otro nombre de cliente o jornada.</div>`; return; }
  const groups = new Map();
  list.forEach(j => { const k = (j.iso || '').slice(0, 7) || '—'; if (!groups.has(k)) groups.set(k, []); groups.get(k).push(j); });
  let h = '';
  for (const [k, items] of groups) {
    const km = items.reduce((a, j) => a + (j.tot.road || 0), 0), lab = k === '—' ? 'Sin fecha' : dOf(k + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const gm = D.hist.filter(j => (j.iso || '').slice(0, 7) === k), gn = gm.filter(j => !j.exp).length, gc = gm.filter(j => expOf(j) === 'chg').length;
    const gx = !anyExp ? '' : !gn && !gc ? ` · <b class="gx">${ic('ck')}exportado</b>` : ` · <b class="gx w">${[gn && `${gn} sin exportar`, gc && `${gc} cambiada${gc > 1 ? 's' : ''}`].filter(Boolean).join(', ')}</b>`;
    h += `<div class="gh">${esc(lab)}<span>${items.length} jornada${items.length > 1 ? 's' : ''} · ${fmtKm0(km)}${gx}</span></div>`;
    h += items.map(j => { const d = dOf(j.iso); return `<button class="hi" data-id="${esc(j.id)}"><span class="dd"><b>${j.iso ? d.getDate() : '—'}</b><small>${j.iso ? d.toLocaleDateString('es-ES', { weekday: 'short' }).replace('.', '') : ''}</small></span><span class="bd"><h3>${esc(j.label)}</h3><span class="mt"><span class="chip m">${j.stops.length} parada${j.stops.length > 1 ? 's' : ''}</span>${j.ret ? `<span class="chip m">${ic('ret')}vuelta</span>` : ''}${est(j) ? `<span class="chip w">${ic('off')}estimada</span>` : ''}${jDur(j) > 0 ? `<span class="chip ${isReal(j) ? '' : 'm'}">${ic('clock')}${fmtDur(jDur(j))}${isReal(j) ? ' · real' : ''}</span>` : ''}${expOf(j) === 'ok' ? `<span class="chip">${ic('ck')}exportada ${esc(fmtDate(j.exp.d, { day: 'numeric', month: 'short' }))}</span>` : expOf(j) === 'chg' ? `<span class="chip w">${ic('info')}cambiada tras exportar</span>` : ''}</span>${j.notes ? `<span class="nt">${esc(j.notes)}</span>` : ''}</span><span class="km"><b>${fmtKm(j.tot.road)}</b><small>${fmtEur(j.tot.cost)}</small></span></button>`; }).join('');
  }
  el.innerHTML = h;
  el.querySelectorAll('.hi').forEach(b => b.onclick = () => { const j = D.hist.find(x => String(x.id) === b.dataset.id); if (j) histSheet(j); });
}
$('#hq').addEventListener('input', renderHist);
function markExpDlg() {
  dlg({ title: 'Marcar como exportadas', text: 'Para las jornadas que ya enviaste a la empresa antes de que Rutahz lo apuntara, o por otro camino.',
    html: `<div><label class="lb">Periodo</label><select class="inp" id="mxP"><option value="ant">Mes anterior</option><option value="mes">Este mes</option><option value="ano">Este año</option><option value="todo">Todo</option><option value="fec">Entre fechas…</option></select>
      <div class="brow" id="mxF" style="margin-top:8px" hidden><input class="inp" type="date" id="mxA" style="flex:1" aria-label="Desde"><input class="inp" type="date" id="mxB" style="flex:1" aria-label="Hasta"></div><p class="hint" id="mxN" style="margin-top:6px"></p></div>`,
    ok: 'Marcar',
    open: b => { const sP = b.querySelector('#mxP'), A = b.querySelector('#mxA'), Z = b.querySelector('#mxB'); const n = new Date(); A.value = isoOf(new Date(n.getFullYear(), n.getMonth() - 1, 1)); Z.value = today();
      const upd = () => { b.querySelector('#mxF').hidden = sP.value !== 'fec'; const [a, z] = periodRange(sP.value, A.value, Z.value), l = D.hist.filter(j => j.iso >= a && j.iso <= z && pendingExp(j)); b.querySelector('#mxN').textContent = l.length ? `${l.length} jornada${l.length > 1 ? 's' : ''} sin exportar en ese periodo.` : 'Ese periodo ya está todo exportado.'; };
      sP.onchange = A.onchange = Z.onchange = upd; upd(); },
    check: b => ({ p: b.querySelector('#mxP').value, a: b.querySelector('#mxA').value, z: b.querySelector('#mxB').value })
  }).then(r => { if (!r) return; const [a, z] = periodRange(r.p, r.a, r.z), l = D.hist.filter(j => j.iso >= a && j.iso <= z && pendingExp(j)); if (!l.length) return; markExported(l, 'a mano');
    toast(`${l.length} jornada${l.length > 1 ? 's' : ''} marcada${l.length > 1 ? 's' : ''} como exportada${l.length > 1 ? 's' : ''}`, { undo: () => { l.forEach(j => delete j.exp); save(); renderHist(); } }); });
}
let recalcBusy = false;
// Pone en una jornada guardada los km y tiempos de una ruta recién calculada, con su €/km y sus ajustes de tiempo
function applyRoute(j, r) {
  const cpk = j.tot.cpk ?? (j.tot.road ? j.tot.cost / j.tot.road : D.set.cpk), tf = j.tot.tf ?? D.set.tf, pm = j.tot.pm ?? D.set.pm;
  j.legs = r.legs; j.legsDur = r.legsDur;
  j.tot = { ...j.tot, road: r.km, durRaw: r.durRaw, tf, pm, dur: adjDur(r.durRaw, r.legs.length, tf, pm), src: 'road', straight: r.straight, cpk, cost: r.km * cpk };
}
async function recalcEntries(list) {
  if (recalcBusy) return; if (!navigator.onLine) return toast('Necesitas conexión para recalcular.');
  recalcBusy = true; let ok = 0;
  for (let i = 0; i < list.length; i++) {
    const j = list[i]; toast(`Recalculando ${i + 1} de ${list.length}…`, { ms: 20000 });
    const r = await computeRoute(pointsOf(j));
    if (r.src === 'road') { applyRoute(j, r); ok++; }
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
  const lm = i => { const m = legMin(j, i); return m != null && !isReal(j) ? ` · ${fmtDur(m)}` : ''; };
  j.stops.forEach((s, i) => { const k = (j.legs && j.legs[i]) || 0; acc += k; L.push(`${i + 1}. ${name(s, i)} — ${fmtKm(k)}${lm(i)} (total ${fmtKm(acc)})`); });
  if (j.ret) { const i = j.stops.length, k = (j.legs && j.legs[i]) || 0; acc += k; L.push(`↩ Vuelta a ${o.n ? j.start.label : 'punto de partida'} — ${fmtKm(k)}${lm(i)}`); }
  L.push('');
  L.push(`Total: ${fmtKm(j.tot.road)}${j.tot.src === 'road' ? ' por carretera' : ' (estimado)'}`);
  if (jDur(j) > 0) L.push(`Al volante: ${fmtDur(jDur(j))}${isReal(j) ? ' (real)' : ' (estimado)'}`);
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
  H.forEach(j => j.stops.forEach(s => { const c = clientOf(s), k = c ? c.id : 'l:' + norm(s.label); if (!k || k === 'l:') return; if (!rk.has(k)) rk.set(k, { label: c ? c.label : s.label, cid: c ? c.id : null, n: 0, v: [] }); const r = rk.get(k); r.n++; if (!r.v.includes(j)) r.v.push(j); }));
  const top = [...rk.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  box.innerHTML = `
    <div class="card"><div class="ch"><span>${ic('cal')}Este periodo</span></div><div class="sg">
      <div><b>${fmtKm0(sum(wk, j => j.tot.road))}</b><span>Esta semana</span><small>${wk.length} jornada${wk.length === 1 ? '' : 's'}</small></div>
      <div><b>${fmtKm0(moKm)}</b><span>Este mes</span><small>${mo.length} jornada${mo.length === 1 ? '' : 's'} · ${fmtEur(sum(mo, j => j.tot.cost))}</small></div>
      <div>${cmp}</div>
      <div><b>${days}</b><span>Días con ruta</span><small>en ${now.toLocaleDateString('es-ES', { month: 'long' })}</small></div>
      <div><b>${fmtDur(sum(wk, jDur))}</b><span>Al volante · semana</span><small>${wk.filter(isReal).length ? wk.filter(isReal).length + ' con tiempo real' : 'estimado'}</small></div>
      <div><b>${fmtDur(sum(mo, jDur))}</b><span>Al volante · mes</span><small>${mo.length ? (mo.filter(isReal).length === mo.length ? 'todo tiempo real' : mo.filter(isReal).length ? mo.filter(isReal).length + ' de ' + mo.length + ' con tiempo real' : 'estimado') : '—'}</small></div>
    </div></div>
    <div class="card"><div class="ch"><span>${ic('chart')}Km por mes</span><small>últimos 6 meses</small></div><div class="chart" role="img" aria-label="Kilómetros por mes">${months.map((k, i) => `<div class="${k === ym ? 'cur' : ''}"><em>${mkm[i] ? nf0.format(mkm[i]) : ''}</em><i style="height:${Math.max(3, Math.round(mkm[i] / mx * 130))}px"></i><span>${dOf(k + '-01').toLocaleDateString('es-ES', { month: 'short' }).replace('.', '')}</span></div>`).join('')}</div></div>
    <div class="card"><div class="ch"><span>${ic('route')}Histórico</span></div><div class="sg">
      <div><b>${fmtKm0(allKm)}</b><span>Km en total</span><small>${fmtKm0(sum(yr, j => j.tot.road))} este año</small></div>
      <div><b>${H.length}</b><span>Jornadas</span><small>${allStops} paradas</small></div>
      <div><b>${fmtKm(allKm / H.length)}</b><span>Km por jornada</span></div>
      <div><b>${nf1.format(allStops / H.length)}</b><span>Paradas por jornada</span></div>
      <div><b>${fmtEur(sum(H, j => j.tot.cost))}</b><span>Coste estimado</span></div>
      <div><b>${fmtDur(sum(H, jDur))}</b><span>Al volante</span><small>${fmtDur(sum(H, jDur) / H.length)} por jornada</small></div>
    </div></div>
    <div class="card"><div class="ch"><span>${ic('dest')}Destinos más visitados</span><small>toca para ver fechas</small></div><div class="rk">${top.length ? top.map((r, i) => `<div><button data-i="${i}" aria-expanded="false"><span class="p">${i + 1}</span><span class="b"><b>${esc(r.label)}</b><span class="t"><i style="width:${Math.round(r.n / top[0].n * 100)}%"></i></span></span><span class="c">${r.n} visita${r.n > 1 ? 's' : ''}</span></button><div class="dt" hidden>${r.v.slice().sort((a, b) => (b.iso || '').localeCompare(a.iso || '')).slice(0, 8).map(j => `<button data-j="${esc(j.id)}" data-r="${i}">${esc(fmtDate(j.iso, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }))} · ${esc(j.label)} ›</button>`).join('')}</div></div>`).join('') : '<p class="hint">Sin paradas todavía.</p>'}</div></div>`;
  box.querySelectorAll('.rk button[data-i]').forEach(b => b.onclick = () => { const d = b.nextElementSibling; d.hidden = !d.hidden; b.setAttribute('aria-expanded', String(!d.hidden)); });
  box.querySelectorAll('.rk .dt button').forEach(b => b.onclick = () => { const j = D.hist.find(h => String(h.id) === b.dataset.j); if (!j) return; const r = top[+b.dataset.r], c = r && r.cid ? D.clients.find(x => x.id === r.cid) : null; showHistOnMap(j); const i = j.stops.findIndex(s => c ? clientOf(s) === c : norm(s.label) === norm(r.label)); if (i >= 0) setTimeout(() => focusVerStop(i), 450); });
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
  const per = pre || M.exP || 'mes', cols = Object.assign({ salida: false, paradas: true, km: true, tiempo: true, coste: true, notas: false, det: false }, M.exC || {});
  const cb = (k, l) => `<label style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:.875rem"><input type="checkbox" data-c="${k}" ${cols[k] ? 'checked' : ''} style="width:20px;height:20px;accent-color:var(--em2)">${l}</label>`;
  dlg({
    title: 'Informe y Excel',
    acts: [{ t: 'Cancelar', cls: 'g', v: null }, { t: 'Excel', cls: 'g', v: 'csv', icon: 'sheet' }, { t: 'Informe / PDF', v: 'pdf', icon: 'file' }],
    html: `<div><label class="lb">Periodo</label><select class="inp" id="exP"><option value="mes">Este mes</option><option value="ant">Mes anterior</option><option value="ano">Este año</option><option value="todo">Todo</option><option value="fec">Entre fechas…</option></select>
      <div class="brow" id="exF" style="margin-top:8px" hidden><input class="inp" type="date" id="exA" style="flex:1" aria-label="Desde"><input class="inp" type="date" id="exB" style="flex:1" aria-label="Hasta"></div><p class="hint" id="exN" style="margin-top:6px"></p>
      <label id="exOw" style="display:flex;align-items:center;gap:10px;padding:6px 0;font-size:.875rem" hidden><input type="checkbox" id="exO" style="width:20px;height:20px;accent-color:var(--em2)"><span id="exOt"></span></label></div>
      <div><label class="lb">Columnas del informe</label>${cb('salida', 'Hora de salida')}${cb('paradas', 'Número de paradas')}${cb('km', 'Kilómetros')}${cb('tiempo', 'Tiempo al volante')}${cb('coste', 'Coste estimado')}${cb('notas', 'Notas')}${cb('det', 'Recorrido de cada jornada: paradas con km y tiempo por tramo (con nombres)')}</div>
      <div><label class="lb">Excel</label><select class="inp" id="exK"><option value="res">Una fila por jornada</option><option value="det">Una fila por parada (detalle)</option></select></div>`,
    open: b => {
      const sP = b.querySelector('#exP'); sP.value = per;
      const upd = () => { b.querySelector('#exF').hidden = sP.value !== 'fec'; const [a, z] = periodRange(sP.value, b.querySelector('#exA').value, b.querySelector('#exB').value); const l = D.hist.filter(j => j.iso >= a && j.iso <= z); const nx = l.filter(j => expOf(j) === 'ok').length, nc = l.filter(j => expOf(j) === 'chg').length, np = l.length - nx;
        b.querySelector('#exN').textContent = `${l.length} jornada${l.length === 1 ? '' : 's'} · ${fmtKm(l.reduce((s, j) => s + (j.tot.road || 0), 0))}` + (nx || nc ? ` · ${nx} ya exportada${nx === 1 ? '' : 's'}${nc ? `, ${nc} cambiada${nc === 1 ? '' : 's'} después` : ''}` : '');
        b.querySelector('#exOw').hidden = !nx || !np; b.querySelector('#exOt').textContent = `Solo las pendientes (${np}: sin exportar${nc ? ' o cambiadas' : ''})`; };
      sP.onchange = upd; b.querySelector('#exA').onchange = upd; b.querySelector('#exB').onchange = upd;
      const n = new Date(); b.querySelector('#exA').value = isoOf(new Date(n.getFullYear(), n.getMonth(), 1)); b.querySelector('#exB').value = today(); upd();
    },
    check: (b, v) => {
      const c = {}; b.querySelectorAll('[data-c]').forEach(x => c[x.dataset.c] = x.checked);
      return { v, p: b.querySelector('#exP').value, a: b.querySelector('#exA').value, z: b.querySelector('#exB').value, c, k: b.querySelector('#exK').value, o: !b.querySelector('#exOw').hidden && b.querySelector('#exO').checked };
    }
  }).then(r => {
    if (!r) return;
    M.exP = r.p === 'fec' ? M.exP : r.p; M.exC = r.c; saveM();
    const [a, z, lab] = periodRange(r.p, r.a, r.z), list = D.hist.filter(j => j.iso >= a && j.iso <= z && (!r.o || pendingExp(j))).sort((x, y) => (x.iso || '').localeCompare(y.iso || ''));
    if (!list.length) return toast('No hay jornadas en ese periodo.');
    if (r.v === 'pdf') printReport(list, lab, r.c);
    else exportCSV(list, lab, r.k, a, z);
    markExported(list, r.v === 'pdf' ? 'informe' : 'Excel');
  });
}
$('#bExport').onclick = () => exportDlg(); $('#bExport2').onclick = () => exportDlg();
function stopChain(j) { const p = [j.start.label, ...j.stops.map((s, i) => s.label || `Parada ${i + 1}`)]; if (j.ret) p.push(j.start.label); return p.join(' → '); }
function legChain(j) { // «Oficina → Casa de J. (12,3 km · 15 min) → …»; sin minutos por tramo si el tiempo es real o no hay datos
  const names = [...j.stops.map((s, i) => s.label || `Parada ${i + 1}`), ...(j.ret ? [j.start.label] : [])];
  return j.start.label + names.map((n, i) => { const k = j.legs && j.legs[i], m = isReal(j) ? null : legMin(j, i); return ` → ${n}${k != null ? ` (${nf1.format(k)} km${m != null ? ' · ' + fmtDur(m) : ''})` : ''}`; }).join('');
}
function printReport(list, lab, c) {
  const sum = (arr, f) => arr.reduce((a, j) => a + (f(j) || 0), 0);
  const km = sum(list, j => j.tot.road), cost = sum(list, j => j.tot.cost), dur = sum(list, jDur), nReal = list.filter(isReal).length;
  const th = ['Fecha', 'Jornada']; if (c.salida) th.push('Salida'); if (c.paradas) th.push('Paradas'); if (c.km) th.push('Km'); if (c.tiempo) th.push('Al volante'); if (c.coste) th.push('Coste'); if (c.notas) th.push('Notas');
  const lead = 2 + (c.salida ? 1 : 0);
  const cellsFor = j => {
    const cells = [`<td style="white-space:nowrap">${esc(fmtDate(j.iso, { day: '2-digit', month: '2-digit', year: 'numeric' }))}</td>`, `<td>${esc(j.label)}${est(j) ? ' <span style="color:#a8640a">(km estimados)</span>' : ''}${c.det ? `<div class="det">${esc(legChain(j))}</div>` : ''}</td>`];
    if (c.salida) cells.push(`<td class="n">${esc(j.start.time || '—')}</td>`);
    if (c.paradas) cells.push(`<td class="n">${j.stops.length}</td>`); if (c.km) cells.push(`<td class="n">${fmtKm(j.tot.road)}</td>`);
    if (c.tiempo) cells.push(`<td class="n">${fmtDur(jDur(j))}${isReal(j) ? ' <span class="det">real</span>' : ''}</td>`);
    if (c.coste) cells.push(`<td class="n">${fmtEur(j.tot.cost)}</td>`); if (c.notas) cells.push(`<td>${esc(j.notes || '')}</td>`);
    return `<tr>${cells.join('')}</tr>`;
  };
  const totRow = (label, arr, strong) => { const f = [`<td colspan="${lead}">${label}</td>`]; if (c.paradas) f.push(`<td class="n">${sum(arr, j => j.stops.length)}</td>`); if (c.km) f.push(`<td class="n">${fmtKm(sum(arr, j => j.tot.road))}</td>`); if (c.tiempo) f.push(`<td class="n">${fmtDur(sum(arr, jDur))}</td>`); if (c.coste) f.push(`<td class="n">${fmtEur(sum(arr, j => j.tot.cost))}</td>`); if (c.notas) f.push('<td></td>'); return `<tr class="${strong ? '' : 'sub'}">${f.join('')}</tr>`; };
  // subtotales por mes si el periodo abarca más de uno
  const months = [...new Set(list.map(j => monthKey(j.iso)))];
  let body = '';
  if (months.length > 1) months.forEach(m => { const g = list.filter(j => monthKey(j.iso) === m); body += g.map(cellsFor).join('') + totRow(dOf(m + '-01').toLocaleDateString('es-ES', { month: 'long', year: 'numeric' }).replace(/^./, x => x.toUpperCase()) + ` · ${g.length} jornada${g.length > 1 ? 's' : ''}`, g, false); });
  else body = list.map(cellsFor).join('');
  const tfs = [...new Set(list.filter(j => !isReal(j) && j.tot.durRaw != null).map(j => fmtX(j.tot.tf) + '|' + j.tot.pm))].map(x => x.split('|'));
  const method = !c.tiempo ? '' : `<p>Tiempo al volante: ${nReal === list.length ? 'anotado a mano en todas las jornadas.' : `${nReal ? `${nReal} jornada${nReal > 1 ? 's' : ''} con tiempo real anotado a mano (marcadas «real»); el resto, ` : ''}estimado con el servicio de rutas OSRM a velocidad de la vía${tfs.length ? `, multiplicado por un factor de tráfico y sumando unos minutos por cada llegada para aparcar (${tfs.map(([f, p]) => `×${f} y ${p} min`).join('; ')})` : ''}${list.some(j => !isReal(j) && j.tot.durRaw == null) ? '. Las jornadas importadas de la versión anterior no llevan ese ajuste' : ''}.`}</p>`;
  const title = `Kilometraje · ${lab}`;
  $('#print').innerHTML = `<h1>${esc(title)}</h1><div class="meta">Generado el ${esc(fmtDate(today(), { day: 'numeric', month: 'long', year: 'numeric' }))} con Rutahz</div>
    <div class="tot"><div><b>${fmtKm(km)}</b><span>Kilómetros</span></div><div><b>${list.length}</b><span>Jornadas</span></div><div><b>${new Set(list.map(j => j.iso)).size}</b><span>Días</span></div>${c.tiempo ? `<div><b>${fmtDur(dur)}</b><span>Al volante</span></div>` : ''}${c.coste ? `<div><b>${fmtEur(cost)}</b><span>Coste estimado</span></div>` : ''}</div>
    <table><thead><tr>${th.map((h, i) => `<th${i > 1 && h !== 'Notas' ? ' style="text-align:right"' : ''}>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody><tfoot>${totRow(`Total · ${list.length} jornada${list.length > 1 ? 's' : ''}`, list, true)}</tfoot></table>
    <div class="fn">${method}<p>Distancias por carretera calculadas con OSRM (OpenStreetMap)${list.some(est) ? '; las marcadas «km estimados» se midieron sin conexión, en línea recta con un factor de ajuste' : ''}. Rutahz es una herramienta personal de seguimiento de kilometraje y no constituye un registro oficial ante la Agencia Tributaria ni otros organismos.</p></div>`;
  const prev = document.title; document.title = title.replace(/[\\/:*?"<>|]/g, '-');
  setTimeout(() => { window.print(); setTimeout(() => { document.title = prev; }, 400); }, 60);
}
const csvC = v => { v = v == null ? '' : String(v); return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const dec = (n, d = 1) => (n || 0).toFixed(d).replace('.', ',');
function exportCSV(list, lab, kind, a, z) {
  let rows;
  const dd = iso => fmtDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' });
  const tsrc = j => isReal(j) ? 'Real' : j.tot.durRaw != null ? `Estimado (×${fmtX(j.tot.tf)} + ${j.tot.pm} min/llegada)` : 'Estimado';
  if (kind === 'det') {
    rows = [['Fecha', 'Jornada', 'Orden', 'Punto', 'Km del tramo', 'Km acumulados', 'Min. del tramo (estimado)', 'Latitud', 'Longitud']];
    list.forEach(j => {
      rows.push([dd(j.iso), j.label, 0, 'Salida: ' + j.start.label + (j.start.time ? ' (' + j.start.time + ')' : ''), '0,0', '0,0', '', j.start.lat.toFixed(5), j.start.lon.toFixed(5)]);
      let acc = 0;
      const lm = i => { const m = legMin(j, i); return m != null ? Math.round(m) : ''; };
      j.stops.forEach((s, i) => { const k = (j.legs && j.legs[i]) || 0; acc += k; rows.push([dd(j.iso), j.label, i + 1, s.label, dec(k), dec(acc), lm(i), s.lat.toFixed(5), s.lon.toFixed(5)]); });
      if (j.ret) { const i = j.stops.length, k = (j.legs && j.legs[i]) || 0; acc += k; rows.push([dd(j.iso), j.label, i + 1, 'Vuelta: ' + j.start.label, dec(k), dec(acc), lm(i), j.start.lat.toFixed(5), j.start.lon.toFixed(5)]); }
    });
  } else {
    rows = [['Fecha', 'Jornada', 'Salida', 'Paradas', 'Km', 'Al volante (h:mm)', 'Minutos al volante', 'Tiempo', 'Min. estimados', 'Coste (€)', 'Cálculo de km', 'Con vuelta', 'Recorrido', 'Notas']];
    list.forEach(j => rows.push([dd(j.iso), j.label, j.start.time || '', j.stops.length, dec(j.tot.road), hhmm(jDur(j)), jDur(j) ? Math.round(jDur(j)) : '', tsrc(j), j.tot.dur ? Math.round(j.tot.dur) : '', dec(j.tot.cost, 2), j.tot.src === 'road' ? 'Carretera' : 'Estimados', j.ret ? 'Sí' : 'No', stopChain(j), j.notes || '']));
    const T = f => list.reduce((s, j) => s + (f(j) || 0), 0);
    rows.push(['', 'TOTAL', '', T(j => j.stops.length), dec(T(j => j.tot.road)), hhmm(T(jDur)), Math.round(T(jDur)) || '', `${list.filter(isReal).length} real · ${list.filter(j => !isReal(j)).length} estimado`, Math.round(T(j => j.tot.dur)) || '', dec(T(j => j.tot.cost), 2), '', '', '', '']);
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
