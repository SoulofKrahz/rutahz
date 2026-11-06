<script src="vendor/leaflet/leaflet.js"></script>
<script>
(function(){
'use strict';
const VER = '2026-11-06-3';

/* =================== Utilidades =================== */
const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
const ic = (n, c = '') => `<svg class="i ${c}"><use href="#i-${n}"/></svg>`;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
// Nombres únicos (jornadas y destinos): se comparan sin mayúsculas, acentos ni espacios de más
const nameKey = s => norm(String(s || '')).replace(/\s+/g, ' ');
function uniqName(base, taken) {
  base = String(base || '').replace(/\s+/g, ' ').trim(); if (!taken.has(nameKey(base))) return base;
  const b = base.replace(/\s*\(\d+\)$/, '');
  for (let i = 2; ; i++) { const n = `${b} (${i})`; if (!taken.has(nameKey(n))) return n; }
}
const histNames = exceptId => new Set(D.hist.filter(j => j.id !== exceptId).map(j => nameKey(j.label)));
const destNames = except => new Set(D.clients.filter(c => c !== except).map(c => nameKey(c.label)));
// Grupos con el mismo nombre: deja el primero (el más antiguo) y numera los demás
function fixDupNames(items, when) {
  const seen = new Set(), changed = [];
  items.slice().sort((a, b) => (when(a) || '').localeCompare(when(b) || '')).forEach(x => {
    const k = nameKey(x.label);
    if (seen.has(k)) { const n = uniqName(x.label, new Set([...seen, ...items.map(y => nameKey(y.label))])); changed.push([x, x.label]); x.label = n; seen.add(nameKey(n)); } else seen.add(k);
  });
  return changed;
}
const dupCount = items => { const m = new Map(); items.forEach(x => m.set(nameKey(x.label), (m.get(nameKey(x.label)) || 0) + 1)); return [...m.values()].filter(n => n > 1).reduce((a, n) => a + n - 1, 0); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const nf1 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const nf0 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 0 });
const nf2 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtKm = n => nf1.format(n || 0) + ' km';
const fmtKm0 = n => (n >= 100 ? nf0.format(n) : nf1.format(n || 0)) + ' km';
const fmtEur = n => nf2.format(n || 0) + ' €';
const fmtDur = m => { if (m == null || isNaN(m) || m <= 0) return '—'; const h = Math.floor(m / 60), mm = Math.round(m % 60); return h ? `${h} h ${String(mm).padStart(2, '0')} min` : `${mm} min`; };
const pad = n => String(n).padStart(2, '0');
const isoOf = d => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
const today = () => isoOf(new Date());
const dOf = iso => { const [y, m, d] = (iso || '').split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1); };
const fmtDate = (iso, o = { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) => iso ? dOf(iso).toLocaleDateString('es-ES', o) : 'Sin fecha';
const fmtDateS = iso => iso ? dOf(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace('.', '') : '—';
const daysBetween = (a, b) => Math.round((dOf(b) - dOf(a)) / 864e5);
const isMob = () => matchMedia('(max-width:900px)').matches;
const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const sleep = ms => new Promise(r => setTimeout(r, ms));
function hav(a, b) {
  const R = 6371, t = x => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lon - a.lon);
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const near = (a, b) => a && b && Math.abs(a.lat - b.lat) < 0.0003 && Math.abs(a.lon - b.lon) < 0.0003; // ~30 m
const okLL = p => p && isFinite(p.lat) && isFinite(p.lon) && Math.abs(p.lat) <= 90 && Math.abs(p.lon) <= 180;
const ls = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};

/* =================== Datos =================== */
const KEY = 'rz_data', PFK = 'rz_pf', PINK = 'rz_pin', MK = 'rz_meta';
const DEF_SET = { cpk: 0.26, rf: 1.25, ret: true, unl: false, shN: true, shM: true, shT: false, al: 5, tf: 1.15, pm: 2 };
let D = { v: 2, cur: { start: null, stops: [], notes: '', ret: true }, hist: [], fav: null, clients: [], edit: null, set: { ...DEF_SET } };
let P = ls.get(PFK, {}) || {};
let M = ls.get(MK, {}) || {};
function loadData() {
  const raw = ls.get(KEY);
  if (raw && raw.v === 2) {
    D = Object.assign(D, raw);
    D.set = Object.assign({ ...DEF_SET }, raw.set || {});
    D.cur = Object.assign({ start: null, stops: [], notes: '', ret: D.set.ret }, raw.cur || {});
    D.hist = Array.isArray(raw.hist) ? raw.hist : [];
    D.clients = Array.isArray(raw.clients) ? raw.clients : [];
  }
  if (!D.cur.start && D.fav) D.cur.start = { ...D.fav, time: '' };
}
let saveT = null;
function save() { clearTimeout(saveT); saveT = setTimeout(flush, 120); }
function flush() {
  clearTimeout(saveT); saveT = null;
  if (!ls.set(KEY, D)) toast('No se ha podido guardar: el almacenamiento del navegador está lleno o bloqueado.');
}
addEventListener('pagehide', () => { if (saveT) flush(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && saveT) flush(); });
const saveP = () => ls.set(PFK, P), saveM = () => ls.set(MK, M);
const newCur = () => ({ start: D.fav ? { ...D.fav, time: '' } : null, stops: [], notes: '', ret: D.set.ret });

/* =================== Avisos (toast) =================== */
let toastT = null;
function toast(msg, o = {}) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>` + (o.undo ? `<button>${esc(o.undoT || 'Deshacer')}</button>` : '');
  el.classList.toggle('u', !!o.undo);
  if (o.undo) el.querySelector('button').onclick = () => { el.classList.remove('show'); o.undo(); };
  el.classList.add('show'); clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove('show'), o.ms || (o.undo ? 5000 : 2800));
}

/* =================== Diálogos y hojas =================== */
const layer = $('#layer');
let layerRes = null, layerOpen = false, skipPop = false;
function openLayer(html, res) {
  if (layerOpen) closeLayer(null, true);
  $('#toast').classList.remove('show'); layer.innerHTML = html; layerOpen = true; layerRes = res;
  try { history.pushState({ rz: 1 }, ''); } catch (e) {}
  layer.querySelector('.ov').onclick = () => closeLayer(null);
  document.body.style.overflow = 'hidden';
}
function closeLayer(v, quiet) {
  if (!layerOpen) return;
  layerOpen = false; layer.innerHTML = ''; document.body.style.overflow = '';
  const r = layerRes; layerRes = null;
  if (!quiet && history.state && history.state.rz) { skipPop = true; try { history.back(); } catch (e) { skipPop = false; } }
  if (r) r(v);
}
addEventListener('popstate', () => { if (skipPop) { skipPop = false; return; } if (layerOpen) closeLayer(null, true); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && layerOpen) closeLayer(null); });

// dlg({title,text,html,acts:[{t,cls,v}],check(box,v)→valor|undefined, open(box,close)})
function dlg(o) {
  return new Promise(res => {
    const acts = o.acts || [{ t: o.cancel || 'Cancelar', cls: 'g', v: null }, { t: o.ok || 'Aceptar', cls: o.danger ? 'dg' : '', v: true }];
    openLayer(`<div class="ov"></div><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlgT"><h3 id="dlgT">${esc(o.title || '')}</h3>${o.text ? `<p>${esc(o.text)}</p>` : ''}${o.html ? `<div class="fs">${o.html}</div>` : ''}<div class="acts">${acts.map((a, i) => `<button class="btn ${a.cls || ''}" data-i="${i}">${a.icon ? ic(a.icon) : ''}${esc(a.t)}</button>`).join('')}</div></div>`, res);
    const box = layer.querySelector('.dlg');
    box.querySelectorAll('.acts button').forEach(b => b.onclick = () => {
      const a = acts[+b.dataset.i];
      if (a.v !== null && o.check) { const r = o.check(box, a.v); if (r === undefined) return; closeLayer(r); }
      else closeLayer(a.v);
    });
    if (o.open) o.open(box, v => closeLayer(v));
    const f = (o.focus && box.querySelector('input:not([type=checkbox]):not([type=file]),textarea')) || box.querySelector('.acts .btn:last-child');
    setTimeout(() => { try { f.focus({ preventScroll: true }); if (f.select && f.type === 'text') f.select(); } catch (e) {} }, 60);
  });
}
const ask = (title, text, ok = 'Aceptar', danger = false) => dlg({ title, text, ok, danger }).then(v => v === true);
// o.validate(v) → null si vale, o { msg, sug } para avisar debajo del campo (y ofrecer un nombre que sí vale)
function fieldErr(b, id, e) {
  const el = b.querySelector('#' + id); if (!el) return;
  el.hidden = !e; if (!e) return;
  el.innerHTML = esc(e.msg) + (e.sug ? ` <button type="button" class="lnk" data-sug="${esc(e.sug)}">Usar «${esc(e.sug)}»</button>` : '');
  const bt = el.querySelector('[data-sug]'); if (bt) bt.onclick = () => { const inp = el.parentNode.querySelector('input'); inp.value = bt.dataset.sug; el.hidden = true; inp.focus(); };
}
const prompt2 = (title, value = '', o = {}) => dlg({
  title, text: o.text, ok: o.ok || 'Guardar', focus: true,
  html: `<div><input class="inp" id="pv" type="text" value="${esc(value)}" placeholder="${esc(o.ph || '')}" maxlength="${o.max || 80}" autocomplete="off" enterkeyhint="done"><p class="ferr" id="pvE" role="alert" hidden></p></div>`,
  open: (b, close) => { const inp = b.querySelector('#pv');
    inp.addEventListener('input', () => fieldErr(b, 'pvE', null));
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const v = inp.value, er = o.validate && o.validate(v); if (er) fieldErr(b, 'pvE', er); else close(v); } }); },
  check: b => { const v = b.querySelector('#pv').value, er = o.validate && o.validate(v); if (er) { fieldErr(b, 'pvE', er); return undefined; } return v; }
});
const destNameErr = except => v => { const t = (v || '').trim(); if (t && destNames(except).has(nameKey(t))) return { msg: `Ya tienes un destino llamado «${(D.clients.find(c => c !== except && nameKey(c.label) === nameKey(t)) || {}).label || t}». Ponle otro nombre para distinguirlos.`, sug: uniqName(t, destNames(except)) }; return null; };
function sheet(o) {
  return new Promise(res => {
    openLayer(`<div class="ov"></div><div class="am" role="dialog" aria-modal="true">${o.title ? `<div class="amh"><b>${esc(o.title)}</b>${o.sub ? `<small>${esc(o.sub)}</small>` : ''}</div>` : ''}${o.items.filter(Boolean).map((it, i) => `<button class="amb ${it.danger ? 'dg' : ''}" data-i="${i}">${ic(it.icon)}<span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('')}</div>`, res);
    const items = o.items.filter(Boolean);
    layer.querySelectorAll('.amb').forEach(b => b.onclick = () => { closeLayer(null); setTimeout(() => items[+b.dataset.i].fn(), 30); });
  });
}

/* =================== Red: proxy propio con respaldo directo =================== */
let proxyOK = null, proxySkip = 0; // proxyOK false = no hay proxy (Netlify, archivo local); proxySkip = hasta cuándo no probarlo (p. ej. Cloudflare bloqueado en España durante el fútbol)
async function api(path, direct) {
  if (proxyOK !== false && Date.now() > proxySkip && /^https?:$/.test(location.protocol)) {
    try {
      const r = await fetch(path, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout ? AbortSignal.timeout(7000) : undefined });
      if (r.headers.get('X-Rz')) { proxyOK = true; if (r.ok) return await r.json(); }
      else proxyOK = false;
    } catch (e) { if (!navigator.onLine) throw e; proxySkip = Date.now() + 10 * 60000; }
  }
  const r = await fetch(direct, { headers: { Accept: 'application/json' }, referrerPolicy: 'strict-origin-when-cross-origin', signal: AbortSignal.timeout ? AbortSignal.timeout(12000) : undefined });
  if (!r.ok) throw new Error('http ' + r.status);
  return r.json();
}
const B = { latMin: 39.20, latMax: 40.05, lonMin: 2.25, lonMax: 3.53 };
function geoReverse(lat, lon) {
  const p = new URLSearchParams({ lat: lat.toFixed(6), lon: lon.toFixed(6), zoom: '18', addressdetails: '1' });
  return api('/g/reverse?' + p, 'https://nominatim.openstreetmap.org/reverse?format=jsonv2&' + p);
}
// addrFirst: al tocar el mapa interesa la calle y el número, no el comercio de al lado («Highribot Cali»)
function placeLabel(r, addrFirst) {
  const a = r.address || {}, dn = (r.display_name || '').split(',').map(s => s.trim());
  const town = a.village || a.town || a.city || a.municipality || a.hamlet || '';
  const street = [a.road || a.pedestrian || a.footway || a.path, a.house_number].filter(Boolean).join(', ');
  const main = (addrFirst ? street || r.name : r.name || street) || a.suburb || town || dn[0] || 'Punto en el mapa';
  const subParts = [main !== street ? street : '', a.suburb && a.suburb !== main ? a.suburb : '', town !== main ? town : ''].filter(Boolean);
  const sub = subParts.join(' · ') || dn.slice(1, 3).join(', ');
  const label = town && main !== town ? `${main}, ${town}` : main;
  return { main, sub, label };
}
const TOWNS = [["Palma",39.5696,2.6502],["Calvià",39.5658,2.5051],["Andratx",39.5423,2.4256],["Port d'Andratx",39.5433,2.3856],["Peguera",39.5461,2.455],["Santa Ponça",39.5089,2.4683],["Esporles",39.6428,2.5892],["Valldemossa",39.7106,2.625],["Deià",39.7469,2.6486],["Sóller",39.7649,2.7147],["Bunyola",39.6997,2.7239],["Santa Maria del Camí",39.6353,2.7622],["Marratxí",39.6297,2.7514],["Alaró",39.7078,2.7994],["Binissalem",39.6875,2.8492],["Lloseta",39.7186,2.8339],["Sa Pobla",39.7717,3.0175],["Muro",39.7364,3.0578],["Santa Margalida",39.7011,3.1069],["Ca'n Picafort",39.7772,3.1519],["Sineu",39.6428,3.0114],["Inca",39.7217,2.9106],["Sencelles",39.6217,2.8894],["Algaida",39.5578,2.8842],["Montuïri",39.5642,2.9739],["Porreres",39.5153,3.0197],["Petra",39.6086,3.1058],["Santanyí",39.3556,3.1275],["Ses Salines",39.3164,3.0475],["Colònia de Sant Jordi",39.3197,2.9986],["Campos",39.4322,2.9714],["Llucmajor",39.4897,2.8917],["Felanitx",39.4694,3.1489],["Porto Colom",39.4283,3.2669],["Manacor",39.5694,3.2085],["Porto Cristo",39.5406,3.3211],["Sant Llorenç des Cardassar",39.6089,3.2789],["Son Servera",39.6106,3.3778],["Cala Millor",39.5936,3.3831],["Capdepera",39.7075,3.4342],["Cala Rajada",39.715,3.4689],["Artà",39.6953,3.3505],["Pollença",39.8762,3.0175],["Port de Pollença",39.9061,3.0842],["Alcúdia",39.8523,3.1219]];

/* ---- Búsqueda de direcciones (como en caravanahz, adaptada a Mallorca) ----
   Por qué así: Nominatim solo encuentra lo que está escrito tal cual en el mapa, y en Mallorca las calles están en catalán
   («Carrer de Berga», no «calle Berga»); muchos portales no están; y no tolera abreviaturas ni erratas. Por eso:
    1. Se limpia lo escrito (C/, Avda., nº, pisos y puertas, código postal).
    2. Se busca tal cual y traducido al catalán (calle → carrer, mayor → major…), en Nominatim y en Photon
       (otro buscador sobre los mismos datos que tolera erratas), a la vez y limitado a la isla.
    3. Se ordena por lo que coincide el nombre de la calle, el pueblo si se escribió, el número y la cercanía al mapa.
    4. Si no hay nada bueno: sin el número de portal; luego calle y pueblo por separado; por último, el pueblo (aproximado).
   Medido con 20 direcciones reales (tools/diag/geo2.mjs): de 6 a 15 bien a la primera. */
const GEO_ABR = [[/(^|[\s,])c\s*\/\s*/gi, '$1calle '], [/(^|[\s,])(cl|cll|c)\.\s+/gi, '$1calle '], [/(^|[\s,])(avda|avd|av|avgda)\.?(?=\s)/gi, '$1avenida'], [/(^|[\s,])(ctra|crta|cra)\.?(?=\s)/gi, '$1carretera'], [/(^|[\s,])(pza|plz|pl|pça)\.?(?=\s)/gi, '$1plaza'], [/(^|[\s,])(p[ºo°]|pso|pg)\.?(?=\s)/gi, '$1paseo'], [/(^|[\s,])(urb)\.?(?=\s)/gi, '$1urbanización'], [/(^|[\s,])(cno|cmno)\.?(?=\s)/gi, '$1camino'], [/(^|[\s,])(cr|crer)\.?(?=\s)/gi, '$1carrer']];
function cleanQuery(q) {
  let s = ' ' + String(q || '').replace(/\s+/g, ' ').trim() + ' ';
  for (const [re, to] of GEO_ABR) s = s.replace(re, to);
  return s.replace(/\b(n[ºo°.]|núm\.?|num\.?|número)\s*(?=\d)/gi, '').replace(/,?\s*\b\d{1,2}\s*[ºª°]\s*(izq(da)?|dcha?|der|[a-h])?\b\.?/gi, '')
    .replace(/,?\s*\b(piso|planta|puerta|pta|bajos?|entresuelo|esc(alera)?|izq(da|uierda)?|dcha|dch|derecha)\b\.?(\s+(\d{1,2}|[a-h])\b)?/gi, '').replace(/\bs\/n\b/gi, '').replace(/\b0?7\d{3}\b/g, '')
    .replace(/,\s*(mallorca|illes balears|islas baleares|baleares|espa[ñn]a)\s*$/gi, '').replace(/\s*,\s*/g, ', ').replace(/(,\s*)+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,|,$/g, '').trim();
}
const GEO_CAT = [[/\bcalle\b/gi, 'carrer'], [/\bavenida\b/gi, 'avinguda'], [/\bplaza\b/gi, 'plaça'], [/\bpaseo\b/gi, 'passeig'], [/\bcamino\b/gi, 'camí'], [/\btraves[ií]a\b/gi, 'travessia'], [/\bcallej[oó]n\b/gi, 'carreró'], [/\burbanizaci[oó]n\b/gi, 'urbanització'], [/\bplazoleta\b/gi, 'placeta'],
  [/\bmayor\b/gi, 'major'], [/\bluna\b/gi, 'lluna'], [/\bsan\b/gi, 'sant'], [/\biglesia\b/gi, 'església'], [/\bnueva\b/gi, 'nova'], [/\bnuevo\b/gi, 'nou'], [/\bmolino\b/gi, 'molí'], [/\bfuente\b/gi, 'font'], [/\bpuente\b/gi, 'pont'], [/\bpozo\b/gi, 'pou'], [/\bcruz\b/gi, 'creu'], [/\bvirgen\b/gi, 'verge'], [/\bcampo\b/gi, 'camp'], [/\bpuerto\b/gi, 'port'],
  [/\bjaime\b/gi, 'jaume'], [/\bjuan\b/gi, 'joan'], [/\bpedro\b/gi, 'pere'], [/\bjos[eé]\b/gi, 'josep'], [/\bmiguel\b/gi, 'miquel'], [/\bantonio\b/gi, 'antoni'], [/\bfrancisco\b/gi, 'francesc'], [/\bjorge\b/gi, 'jordi']];
const toCatalan = q => GEO_CAT.reduce((s, [re, to]) => s.replace(re, to), q);
const noNum = q => q.replace(/(^|[\s,])\d{1,4}\s*[a-z]?\b(?!\s*(de\s))/gi, '$1').replace(/\s*,\s*/g, ', ').replace(/(,\s*)+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,|,$/g, '').trim();
const numOf = q => (noNum(q) !== q && (q.match(/(?:^|[\s,])(\d{1,4})\s*[a-z]?\b/i) || [])[1]) || '';
const GEO_STOP = new Set(['de', 'del', 'la', 'el', 'les', 'los', 'las', 'els', 'sa', 'es', 'ca', 'en', 'na', 'calle', 'carrer', 'avenida', 'avinguda', 'plaza', 'placa', 'paseo', 'passeig', 'camino', 'cami', 'carretera', 'travessia', 'urbanitzacio', 'urbanizacion', 'mallorca', 'illes', 'balears']);
const gWords = q => norm(q).replace(/[’`]/g, "'").replace(/[^a-z0-9ñç' ]/g, ' ').split(/[\s']+/).filter(w => w.length > 1 && !GEO_STOP.has(w) && !/^\d/.test(w));
const GEO_TOWNS = [...new Set(TOWNS.map(t => norm(t[0]).replace(/'/g, ' ')).concat(['s arenal', 'arenal', 'consell', 'selva', 'campanet', 'buger', 'costitx', 'lloret de vistalegre', 'maria de la salut', 'ariany', 'vilafranca de bonany', 'sant joan', 'santa eugenia', 'mancor de la vall', 'escorca', 'fornalutx', 'estellencs', 'banyalbufar', 'puigpunyent', 'sa rapita', 'cala d or', 'son ferrer', 'el toro', 'magaluf', 'palmanova', 'illetes', 'genova', 'establiments', 'son sardina', 'sa cabaneta', 'es pont d inca', 'coll d en rabassa', 'can pastilla', 'sant jordi', 's aranjassa', 'can picafort', 'portocolom', 'cala ratjada', 's illot', 'cala bona', 'sa coma', 'colonia de sant pere', 'port d alcudia', 'port de soller', 'cala figuera', 'cala santanyi', 's alqueria blanca', 'es llombards', 'son macia', 'cas concos']))];
function townIn(q) { const n = ' ' + norm(q).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ') + ' '; return GEO_TOWNS.filter(t => n.includes(' ' + t + ' ')).sort((a, b) => b.length - a.length)[0] || ''; }
function lev1(a, b) { if (Math.abs(a.length - b.length) > 1) return 9; let i = 0; while (i < a.length && a[i] === b[i]) i++; if (i === a.length && i === b.length) return 0; return a.slice(i + 1) === b.slice(i + 1) || a.slice(i) === b.slice(i + 1) || a.slice(i + 1) === b.slice(i) ? 1 : 9; }
const gSim = (w, toks) => toks.reduce((m, t) => Math.max(m, t === w ? 1 : w.length >= 4 && t.length >= 4 && lev1(w, t) <= 1 ? 0.8 : w.length >= 5 && t.startsWith(w) && t.length - w.length <= 3 ? 0.7 : 0), 0);
// Resultados de los dos buscadores en una forma común (la de Nominatim, que es la que entiende placeLabel)
const fromNom = x => ({ ...x, lat: +x.lat, lon: +x.lon, _src: 'N' });
const fromPh = f => { const p = f.properties || {}, [lon, lat] = f.geometry.coordinates, road = p.street || (p.type === 'street' ? p.name : '');
  return { lat, lon, name: p.name && p.name !== road ? p.name : '', display_name: [p.name, p.street, p.city || p.town || p.village].filter(Boolean).join(', '), address: { road, house_number: p.housenumber, town: p.city || p.town || p.village || '', suburb: p.district || p.locality || '' }, _src: 'P' }; };
function geoNom(q, extra = {}) {
  const p = new URLSearchParams({ ...(q ? { q } : {}), ...extra, limit: '6', addressdetails: '1' });
  if (!D.set.unl) { p.set('countrycodes', 'es'); p.set('viewbox', `${B.lonMin},${B.latMax},${B.lonMax},${B.latMin}`); p.set('bounded', '1'); }
  return api('/g/search?' + p, 'https://nominatim.openstreetmap.org/search?format=jsonv2&' + p).then(r => (r || []).map(fromNom), () => []);
}
function geoPh(q, near) {
  const p = new URLSearchParams({ q, limit: '8' });
  if (!D.set.unl) p.set('bbox', `${B.lonMin},${B.latMin},${B.lonMax},${B.latMax}`);
  if (near) { p.set('lat', near.lat.toFixed(4)); p.set('lon', near.lon.toFixed(4)); p.set('location_bias_scale', '0.4'); }
  return api('/g/photon?' + p, 'https://photon.komoot.io/api/?' + p).then(j => ((j && j.features) || []).map(fromPh), () => []);
}
function geoRank(list, q, near) {
  const town = townIn(q), qs = noNum(q), n = numOf(q), tw = new Set(gWords(town));
  const ws = gWords(qs).filter(w => !tw.has(w)), cw = gWords(toCatalan(qs)).filter(w => !tw.has(w)), out = [];
  for (const r of list) { const a = r.address || {}; if (Number.isFinite(r.lat) && !out.some(o => hav(o, r) < 0.04 && norm((o.address || {}).road) === norm(a.road) && (o.address || {}).house_number === a.house_number)) out.push(r); }
  for (const r of out) {
    const a = r.address || {}, road = a.road || a.pedestrian || a.footway || '';
    const rt = [...new Set([...gWords(road), ...gWords(toCatalan(road))])], nt = gWords(r.name), at = gWords([a.village, a.town, a.city, a.municipality, a.suburb, a.hamlet].join(' '));
    const m = w => Math.max(gSim(w, rt), 0.5 * gSim(w, nt));
    const cov = qw => { if (!qw.length) return 0.5; const qc = qw.reduce((x, w) => x + m(w), 0) / qw.length, rs = rt.filter(t => !tw.has(t)); return 0.75 * qc + 0.25 * (rs.length ? rs.filter(t => qw.some(w => gSim(w, [t]) > 0)).length / rs.length : qc); };
    const rm = Math.max(cov(ws), cov(cw)), tOk = !town || gWords(town).every(w => at.some(t => t === w || lev1(t, w) <= 1));
    r._road = rm; r._town = tOk; r._approx = !!n && String(a.house_number || '') !== n;
    r._score = rm * 6 + (town ? (tOk ? 3 : -4) : 0) + (n && String(a.house_number || '') === n ? 1.5 : 0) - (near && !town ? Math.min(hav(near, r), 45) / 15 : 0);
  }
  return out.sort((a, b) => b._score - a._score);
}
const geoGood = l => l.filter(x => x._road >= 0.6 && x._town);
async function geoSearch(raw, limit = 5, near) {
  const q = cleanQuery(raw); if (q.length < 2) return [];
  const qc = toCatalan(q), jobs = [geoNom(q), geoPh(q, near)];
  if (qc !== q) jobs.push(geoNom(qc), geoPh(qc, near));
  let all = (await Promise.all(jobs)).flat(), r = geoGood(geoRank(all, q, near)); if (r.length) return r.slice(0, limit);
  const a = noNum(q), ac = toCatalan(a);
  if (a !== q) { all = all.concat((await Promise.all([geoNom(ac), geoPh(a, near)])).flat()); r = geoGood(geoRank(all, q, near)); if (r.length) return r.slice(0, limit); }
  const town = townIn(q);
  if (town) { // calle y pueblo por separado; y si no, el pueblo
    const tn = (TOWNS.find(t => norm(t[0]).replace(/'/g, ' ') === town) || [town])[0];
    const st = gWords(ac).filter(w => !gWords(town).includes(w)).join(' ');
    if (st) { all = all.concat((await Promise.all([geoNom('', { street: st, city: tn }), geoPh(st + ' ' + tn, near)])).flat()); r = geoGood(geoRank(all, q, near)); if (r.length) return r.slice(0, limit); }
    return geoRank(all, q, near).filter(x => x._town).slice(0, 2).map(x => ({ ...x, _onlyTown: tn }));
  }
  return [];
}

/* =================== Cálculo de rutas =================== */
// Tiempo al volante = tiempo de OSRM (sin tráfico, a velocidad de la vía) × factor de tráfico + minutos por llegada (aparcar, maniobrar).
// Cada jornada guarda el tiempo bruto de OSRM y los ajustes con los que se calculó, para poder explicarlo y recalcularlo.
const adjDur = (raw, n, tf, pm) => (raw || 0) * (tf ?? D.set.tf) + (n || 0) * (pm ?? D.set.pm);
const R0 = () => ({ src: null, km: 0, straight: 0, legs: [], legsDur: [], geom: null, durRaw: 0, dur: 0 });
const OFF_KMH = 45; // sin conexión: velocidad media supuesta antes del factor de tráfico
let R = R0();
let routing = false, routeTok = 0;
const routeCache = new Map();
function pointsOf(c) {
  const p = [];
  if (c.start) p.push(c.start);
  c.stops.forEach(s => p.push(s));
  if (c.ret && c.start && c.stops.length) p.push(c.start);
  return p;
}
async function computeRoute(points) {
  if (points.length < 2) return R0();
  const sl = []; for (let i = 1; i < points.length; i++) sl.push(hav(points[i - 1], points[i]));
  const straight = sl.reduce((a, b) => a + b, 0);
  const key = points.map(p => (+p.lon).toFixed(5) + ',' + (+p.lat).toFixed(5)).join(';');
  if (routeCache.has(key)) { const c = routeCache.get(key); return { ...c, dur: adjDur(c.durRaw, c.legs.length) }; }
  if (navigator.onLine) {
    try {
      const d = await api('/r/' + key, `https://router.project-osrm.org/route/v1/driving/${key}?overview=full&geometries=geojson&steps=false`);
      if (d && d.code === 'Ok' && d.routes && d.routes.length) {
        const r = d.routes[0];
        const res = { src: 'road', km: r.distance / 1000, straight, legs: r.legs.map(l => l.distance / 1000), legsDur: r.legs.map(l => l.duration / 60), geom: r.geometry.coordinates.map(c => [c[1], c[0]]), durRaw: r.duration / 60 };
        routeCache.set(key, res); if (routeCache.size > 80) routeCache.delete(routeCache.keys().next().value);
        return { ...res, dur: adjDur(res.durRaw, res.legs.length) };
      }
    } catch (e) { console.warn('Ruta: sin respuesta del servicio, se usa la estimación', e); }
  }
  const rf = D.set.rf || 1.25;
  const legs = sl.map(k => k * rf), legsDur = legs.map(k => k / OFF_KMH * 60), durRaw = legsDur.reduce((a, b) => a + b, 0);
  return { src: 'straight', km: straight * rf, straight, legs, legsDur, geom: null, durRaw, dur: adjDur(durRaw, legs.length) };
}
async function recalc() {
  const my = ++routeTok;
  routing = true; document.body.classList.add('busy'); renderSum();
  const r = await computeRoute(pointsOf(D.cur));
  if (my !== routeTok) return R;
  R = r; routing = false; document.body.classList.remove('busy');
  renderSum(); renderLegs(); drawRoute();
  return R;
}
