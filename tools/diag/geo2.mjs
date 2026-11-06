// Diagnóstico: búsqueda actual (Nominatim tal cual) frente a la nueva (limpieza + catalán + Photon + orden por coincidencia y cercanía)
const UA = { 'User-Agent': 'rutahz-diag/1.0 (github actions)', 'Accept-Language': 'es' };
const B = { latMin: 39.20, latMax: 40.05, lonMin: 2.25, lonMax: 3.53 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { await sleep(1100); const r = await fetch(u, { headers: UA }); if (!r.ok) throw new Error(r.status + ' ' + u); return r.json(); };
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[’']/g, "'").trim();
const hav = (a, b) => { const t = x => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lon - a.lon); const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
// ---- lo mismo que irá en la app ----
const ABR = [[/(^|[\s,])c\s*\/\s*/gi, '$1calle '], [/(^|[\s,])(cl|cll|c)\.\s+/gi, '$1calle '], [/(^|[\s,])(avda|avd|av|avgda|avda)\.?(?=\s)/gi, '$1avenida'], [/(^|[\s,])(ctra|crta|cra)\.?(?=\s)/gi, '$1carretera'], [/(^|[\s,])(pza|plz|pl|pça)\.?(?=\s)/gi, '$1plaza'], [/(^|[\s,])(p[ºo°]|pso|pg)\.?(?=\s)/gi, '$1paseo'], [/(^|[\s,])(urb)\.?(?=\s)/gi, '$1urbanización'], [/(^|[\s,])(cno|cmno)\.?(?=\s)/gi, '$1camino'], [/(^|[\s,])(cr|crer)\.?(?=\s)/gi, '$1carrer']];
function cleanQuery(q) { let s = ' ' + String(q || '').replace(/\s+/g, ' ').trim() + ' '; for (const [re, to] of ABR) s = s.replace(re, to);
  return s.replace(/\b(n[ºo°.]|núm\.?|num\.?|número)\s*(?=\d)/gi, '').replace(/,?\s*\b\d{1,2}\s*[ºª°]\s*(izq(da)?|dcha?|der|[a-h])?\b\.?/gi, '').replace(/,?\s*\b(piso|planta|puerta|pta|bajos?|entresuelo|esc(alera)?|izq(da|uierda)?|dcha|dch|derecha)\b\.?(\s+(\d{1,2}|[a-h])\b)?/gi, '').replace(/\bs\/n\b/gi, '').replace(/\b0?7\d{3}\b/g, '').replace(/\s*,\s*/g, ', ').replace(/(,\s*)+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,|,$/g, '').trim(); }
const CAT = [[/\bcalle\b/gi, 'carrer'], [/\bavenida\b/gi, 'avinguda'], [/\bplaza\b/gi, 'plaça'], [/\bpaseo\b/gi, 'passeig'], [/\bcamino\b/gi, 'camí'], [/\btraves[ií]a\b/gi, 'travessia'], [/\bcallej[oó]n\b/gi, 'carreró'], [/\burbanizaci[oó]n\b/gi, 'urbanització'], [/\bplazoleta\b/gi, 'placeta']];
const catalan = q => CAT.reduce((s, [re, to]) => s.replace(re, to), q);
const noNum = q => q.replace(/(^|[\s,])\d{1,4}\s*[a-z]?\b(?!\s*(de\s))/gi, '$1').replace(/\s*,\s*/g, ', ').replace(/(,\s*)+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,|,$/g, '').trim();
const STOP = new Set(['de', 'del', 'la', 'el', 'les', 'los', 'las', 'els', 'd', 's', 'sa', 'es', 'calle', 'carrer', 'avenida', 'avinguda', 'plaza', 'placa', 'paseo', 'passeig', 'camino', 'cami', 'carretera', 'travessia', 'urbanitzacio', 'urbanizacion', 'mallorca', 'illes', 'balears']);
const words = q => norm(q).replace(/[^a-z0-9ñç' ]/g, ' ').split(/[\s']+/).filter(w => w.length > 1 && !STOP.has(w) && !/^\d/.test(w));
const numOf = q => (noNum(q) !== q && (q.match(/(?:^|[\s,])(\d{1,4})\s*[a-z]?\b/i) || [])[1]) || '';
const fromNom = x => ({ lat: +x.lat, lon: +x.lon, name: x.name, road: (x.address || {}).road || (x.address || {}).pedestrian || '', num: (x.address || {}).house_number || '', town: (x.address || {}).village || (x.address || {}).town || (x.address || {}).city || '', sub: (x.address || {}).suburb || (x.address || {}).hamlet || '', src: 'N' });
const fromPh = f => { const p = f.properties || {}; return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: p.name !== p.street ? p.name : '', road: p.street || (p.type === 'street' ? p.name : '') || '', num: p.housenumber || '', town: p.city || p.town || p.village || '', sub: p.district || p.locality || '', src: 'P' }; };
async function nom(q) { const p = new URLSearchParams({ q, limit: '6', addressdetails: '1', format: 'jsonv2', countrycodes: 'es', viewbox: `${B.lonMin},${B.latMax},${B.lonMax},${B.latMin}`, bounded: '1' }); return (await get('https://nominatim.openstreetmap.org/search?' + p)).map(fromNom); }
async function ph(q, near) { const p = new URLSearchParams({ q, limit: '8', bbox: `${B.lonMin},${B.latMin},${B.lonMax},${B.latMax}` }); if (near) { p.set('lat', near.lat.toFixed(4)); p.set('lon', near.lon.toFixed(4)); p.set('location_bias_scale', '0.4'); } const j = await get('https://photon.komoot.io/api/?' + p); return (j.features || []).map(fromPh); }
function rank(list, q, near) {
  const ws = words(noNum(q)), n = numOf(q), out = [];
  for (const r of list) { if (!out.some(o => hav(o, r) < 0.04 && norm(o.road) === norm(r.road) && o.num === r.num)) out.push(r); }
  for (const r of out) { const hay = norm([r.road, r.name, r.town, r.sub].join(' ')); const hit = ws.length ? ws.filter(w => hay.includes(w)).length / ws.length : 1; const rd = norm(r.road + ' ' + r.name); const roadHit = ws.length ? ws.filter(w => rd.includes(w)).length / ws.length : 1;
    r.score = hit * 4 + roadHit * 3 + (n && r.num === n ? 3 : 0) - (near ? Math.min(hav(near, r), 60) / 15 : 0); r.approx = !!n && r.num !== n; }
  return out.sort((a, b) => b.score - a.score);
}
async function nuevo(raw, near) {
  const q = cleanQuery(raw), qc = catalan(q), jobs = [nom(q).catch(() => []), ph(q, near).catch(() => [])]; if (qc !== q) jobs.push(nom(qc).catch(() => []));
  let r = rank((await Promise.all(jobs)).flat(), q, near).filter(x => x.score > 2);
  if (!r.length && noNum(q) !== q) { const a = noNum(q), ac = catalan(a); const j2 = [nom(ac).catch(() => []), ph(a, near).catch(() => [])]; r = rank((await Promise.all(j2)).flat(), q, near).filter(x => x.score > 2); }
  return r;
}
const actual = async raw => { let r = await nom(raw.trim()); if (!r.length) { const a = raw.replace(/(,\s*|\s+)(n[º°o.]\s*)?\d+[a-z]?(?=\s*(,|$))/gi, '').trim(); if (a !== raw) r = await nom(a); } return r; };
const lab = r => r ? `${r.road || r.name}${r.num ? ' ' + r.num : ''}, ${r.town}${r.sub ? ' (' + r.sub + ')' : ''} [${r.src}${r.approx ? ', sin nº' : ''}]` : '—';
const ARENAL = { lat: 39.5049, lon: 2.7487 }, PALMA = { lat: 39.5696, lon: 2.6502 };
const T = [['calle berga 48', ARENAL, 'Carrer de Berga'], ['calle berga 48', PALMA, 'Carrer de Berga'], ['c/ berga 48, s\'arenal', PALMA, 'Carrer de Berga'], ['carrer de berga 48', ARENAL, 'Carrer de Berga'],
  ['calle de la luna 12 soller', PALMA, 'Lluna'], ['avenida jaume III 10 palma', PALMA, 'Jaume III'], ['plaza mayor inca', PALMA, 'Major'], ['calle bons aires 24 llucmajor', PALMA, 'Bons Aires'],
  ['avda. argentina 5', PALMA, 'Argentina'], ['calle aragon 215 palma', PALMA, 'Aragó'], ['carrer blanquerna 30', PALMA, 'Blanquerna'], ['calle sant miquel 50, palma', PALMA, 'Sant Miquel'], ['calle mayor 5 manacor', PALMA, 'Major'], ['camino de son rapinya', PALMA, 'Son Rapinya']];
let ok0 = 0, ok1 = 0;
for (const [q, near, want] of T) {
  const a = (await actual(q))[0], b = await nuevo(q, near), w = norm(want), good = r => r && norm((r.road || '') + ' ' + (r.name || '')).includes(w);
  if (good(a)) ok0++; if (good(b[0])) ok1++;
  console.log(`\n«${q}» (mirando ${near === ARENAL ? "s'Arenal" : 'Palma'})\n  ahora: ${good(a) ? 'OK ' : 'MAL'} ${lab(a)}\n  nuevo: ${good(b[0]) ? 'OK ' : 'MAL'} ${lab(b[0])}${b[1] ? '   · 2º ' + lab(b[1]) : ''}`);
}
console.log(`\n== Resumen: ahora ${ok0}/${T.length} · nuevo ${ok1}/${T.length}`);
