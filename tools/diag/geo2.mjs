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
const CATW = [[/\bmayor\b/gi, 'major'], [/\bluna\b/gi, 'lluna'], [/\bsan\b/gi, 'sant'], [/\biglesia\b/gi, 'església'], [/\bnueva\b/gi, 'nova'], [/\bnuevo\b/gi, 'nou'], [/\bmolino\b/gi, 'molí'], [/\bfuente\b/gi, 'font'], [/\bpuente\b/gi, 'pont'], [/\bpozo\b/gi, 'pou'], [/\bcruz\b/gi, 'creu'], [/\bvirgen\b/gi, 'verge'], [/\bcampo\b/gi, 'camp'], [/\bpuerto\b/gi, 'port'], [/\bsol\b/gi, 'sol'], [/\bjaime\b/gi, 'jaume'], [/\bjuan\b/gi, 'joan'], [/\bpedro\b/gi, 'pere'], [/\bjose\b|\bjosé\b/gi, 'josep'], [/\bmiguel\b/gi, 'miquel'], [/\bantonio\b/gi, 'antoni'], [/\bfrancisco\b/gi, 'francesc'], [/\bjorge\b/gi, 'jordi'], [/\bmaria\b|\bmaría\b/gi, 'maria'], [/\bmar\b/gi, 'mar'], [/\bpalmera\b/gi, 'palmera']];
const catalan = q => CATW.reduce((s, [re, to]) => s.replace(re, to), CAT.reduce((s, [re, to]) => s.replace(re, to), q));
const TOWNS = ['palma','calvia','andratx','port d\'andratx','peguera','santa ponca','esporles','valldemossa','deia','soller','bunyola','santa maria del cami','marratxi','alaro','binissalem','lloseta','sa pobla','muro','santa margalida','can picafort','sineu','inca','sencelles','algaida','montuiri','porreres','petra','santanyi','ses salines','colonia de sant jordi','campos','llucmajor','felanitx','porto colom','manacor','porto cristo','sant llorenc des cardassar','son servera','cala millor','capdepera','cala rajada','arta','pollenca','port de pollenca','alcudia','s\'arenal','arenal','consell','selva','campanet','buger','costitx','lloret de vistalegre','maria de la salut','ariany','vilafranca de bonany','sant joan','santa eugenia','lloseta','mancor de la vall','escorca','fornalutx','estellencs','banyalbufar','puigpunyent','sa rapita','cala d\'or','portocolom','son ferrer','el toro','magaluf','palmanova','illetes','genova','establiments','son sardina','sa cabaneta','pla de na tesa','es pont d\'inca','coll d\'en rabassa','can pastilla','sant jordi','s\'aranjassa'];
const noNum = q => q.replace(/(^|[\s,])\d{1,4}\s*[a-z]?\b(?!\s*(de\s))/gi, '$1').replace(/\s*,\s*/g, ', ').replace(/(,\s*)+/g, ', ').replace(/\s+/g, ' ').trim().replace(/^,|,$/g, '').trim();
const STOP = new Set(['de', 'del', 'la', 'el', 'les', 'los', 'las', 'els', 'd', 's', 'sa', 'es', 'calle', 'carrer', 'avenida', 'avinguda', 'plaza', 'placa', 'paseo', 'passeig', 'camino', 'cami', 'carretera', 'travessia', 'urbanitzacio', 'urbanizacion', 'mallorca', 'illes', 'balears']);
const words = q => norm(q).replace(/[^a-z0-9ñç' ]/g, ' ').split(/[\s']+/).filter(w => w.length > 1 && !STOP.has(w) && !/^\d/.test(w));
const numOf = q => (noNum(q) !== q && (q.match(/(?:^|[\s,])(\d{1,4})\s*[a-z]?\b/i) || [])[1]) || '';
const fromNom = x => ({ lat: +x.lat, lon: +x.lon, name: x.name, road: (x.address || {}).road || (x.address || {}).pedestrian || '', num: (x.address || {}).house_number || '', town: (x.address || {}).village || (x.address || {}).town || (x.address || {}).city || '', sub: (x.address || {}).suburb || (x.address || {}).hamlet || '', src: 'N' });
const fromPh = f => { const p = f.properties || {}; return { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0], name: p.name !== p.street ? p.name : '', road: p.street || (p.type === 'street' ? p.name : '') || '', num: p.housenumber || '', town: p.city || p.town || p.village || '', sub: p.district || p.locality || '', src: 'P' }; };
async function nom(q) { const p = new URLSearchParams({ q, limit: '6', addressdetails: '1', format: 'jsonv2', countrycodes: 'es', viewbox: `${B.lonMin},${B.latMax},${B.lonMax},${B.latMin}`, bounded: '1' }); return (await get('https://nominatim.openstreetmap.org/search?' + p)).map(fromNom); }
async function ph(q, near) { const p = new URLSearchParams({ q, limit: '8', bbox: `${B.lonMin},${B.latMin},${B.lonMax},${B.latMax}` }); if (near) { p.set('lat', near.lat.toFixed(4)); p.set('lon', near.lon.toFixed(4)); p.set('location_bias_scale', '0.4'); } const j = await get('https://photon.komoot.io/api/?' + p); return (j.features || []).map(fromPh); }
const lev = (a, b) => { if (Math.abs(a.length - b.length) > 1) return 9; const d = Array.from({ length: a.length + 1 }, (_, i) => [i]); for (let j = 1; j <= b.length; j++) d[0][j] = j; for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); return d[a.length][b.length]; };
const sim = (w, toks) => toks.reduce((m, t) => Math.max(m, t === w ? 1 : w.length >= 4 && t.length >= 4 && lev(w, t) <= 1 ? 0.8 : w.length >= 5 && t.startsWith(w) && t.length - w.length <= 3 ? 0.7 : 0), 0);
function townIn(q) { const n = ' ' + norm(q).replace(/[^a-z0-9' ]/g, ' ').replace(/\s+/g, ' ') + ' '; return TOWNS.filter(t => n.includes(' ' + t + ' ')).sort((a, b) => b.length - a.length)[0] || ''; }
function rank(list, q, near) {
  const town = townIn(q), qs = noNum(q), n = numOf(q);
  const tw = new Set(words(town)), ws = words(qs).filter(w => !tw.has(w)), cw = words(catalan(qs)).filter(w => !tw.has(w)), out = [];
  for (const r of list) { if (!out.some(o => hav(o, r) < 0.04 && norm(o.road) === norm(r.road) && o.num === r.num)) out.push(r); }
  for (const r of out) {
    const rt = [...new Set([...words(r.road), ...words(catalan(r.road))])], nt = words(r.name), at = words([r.town, r.sub].join(' '));
    const m = w => Math.max(sim(w, rt), 0.5 * sim(w, nt));
    const cov = (qw) => { if (!qw.length) return 0.5; const qc = qw.reduce((a, w) => a + m(w), 0) / qw.length; const rs = rt.filter(t => !tw.has(t)); const rc = rs.length ? rs.filter(t => qw.some(w => sim(w, [t]) > 0)).length / rs.length : qc; return 0.75 * qc + 0.25 * rc; };
    const road = Math.max(cov(ws), cov(cw));
    const tOk = !town || words(town).every(w => at.some(t => t === w || lev(t, w) <= 1));
    r.road01 = road; r.townOk = tOk;
    r.score = road * 6 + (town ? (tOk ? 3 : -4) : 0) + (n && r.num === n ? 1.5 : 0) - (near && !town ? Math.min(hav(near, r), 45) / 15 : 0);
    r.approx = !!n && r.num !== n;
  }
  return out.sort((a, b) => b.score - a.score);
}
const good = l => l.filter(x => x.road01 >= 0.6 && x.townOk);
async function nuevo(raw, near) {
  const q = cleanQuery(raw), qc = catalan(q), jobs = [nom(q).catch(() => []), ph(q, near).catch(() => [])]; if (qc !== q) { jobs.push(nom(qc).catch(() => [])); jobs.push(ph(qc, near).catch(() => [])); }
  let all = (await Promise.all(jobs)).flat(), r = good(rank(all, q, near)); if (r.length) return r;
  const a = noNum(q), ac = catalan(a);
  if (a !== q) { all = all.concat((await Promise.all([nom(ac).catch(() => []), ph(a, near).catch(() => [])])).flat()); r = good(rank(all, q, near)); if (r.length) return r; }
  // por partes: la calle (sin el pueblo) y el pueblo
  const town = townIn(q);
  if (town) {
    const st = ac.replace(new RegExp('[,\\s]*' + town.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'), '').trim() || ac;
    const tn = TOWNS_FULL[town] || town;
    const p = new URLSearchParams({ street: st, city: tn, limit: '6', addressdetails: '1', format: 'jsonv2', countrycodes: 'es', viewbox: `${B.lonMin},${B.latMax},${B.lonMax},${B.latMin}`, bounded: '1' });
    const ex = await Promise.all([get('https://nominatim.openstreetmap.org/search?' + p).then(x => x.map(fromNom)).catch(() => []), ph(words(st).join(' ') + ' ' + tn, near).catch(() => [])]);
    all = all.concat(ex.flat()); r = good(rank(all, q, near)); if (r.length) return r;
    // al menos el pueblo (aproximado)
    return rank(all, q, near).filter(x => x.townOk).slice(0, 2).map(x => ({ ...x, approx: true, onlyTown: true }));
  }
  return [];
}
const TOWNS_FULL = { 'can picafort': "Ca'n Picafort", 'sant llorenc des cardassar': 'Sant Llorenç des Cardassar', 'arenal': "s'Arenal" };
const actual = async raw => { let r = await nom(raw.trim()); if (!r.length) { const a = raw.replace(/(,\s*|\s+)(n[º°o.]\s*)?\d+[a-z]?(?=\s*(,|$))/gi, '').trim(); if (a !== raw) r = await nom(a); } return r; };
const lab = r => r ? `${r.road || r.name}${r.num ? ' ' + r.num : ''}, ${r.town}${r.sub ? ' (' + r.sub + ')' : ''} [${r.src}${r.onlyTown ? ', SOLO PUEBLO' : r.approx ? ', sin nº' : ''}]` : '—';
const ARENAL = { lat: 39.5049, lon: 2.7487 }, PALMA = { lat: 39.5696, lon: 2.6502 };
const T = [['calle berga 48', ARENAL, 'Berga@arenal'], ['calle berga 48', PALMA, 'Berga@arenal'], ['c/ berga 48, s\'arenal', PALMA, 'Berga@arenal'], ['carrer de berga 48', ARENAL, 'Berga@arenal'],
  ['calle de la luna 12 soller', PALMA, 'Lluna@soller'], ['avenida jaume III 10 palma', PALMA, 'Jaume III@palma'], ['plaza mayor inca', PALMA, 'Major@inca'], ['calle bons aires 24 llucmajor', PALMA, 'Bons Aires@llucmajor'],
  ['avda. argentina 5', PALMA, 'Argentina'], ['calle aragon 215 palma', PALMA, 'Arag@palma'], ['carrer blanquerna 30', PALMA, 'Blanquerna'], ['calle sant miquel 50, palma', PALMA, 'san(t)? mi(qu|gu)el$@palma'], ['calle mayor 5 manacor', PALMA, 'Major@manacor'], ['camino de son rapinya', PALMA, 'Son Rapinya'],
  ['calle general riera 100', PALMA, 'General Riera'], ['carrer de la mar 3 port de pollença', PALMA, '(de la|del) mar$@pollen'], ['calle conquistador inca', PALMA, 'Conquistador@inca'], ['carrer major 22 alaro', PALMA, 'Major@alar'], ['avinguda de les palmeres cala millor', PALMA, 'Palmer@millor|servera|sant llorenc'], ['calle ramon llull 15 felanitx', PALMA, 'Ram(o|ó)n Llull@felanitx']];
let ok0 = 0, ok1 = 0;
for (const [q, near, want] of T) {
  const a = (await actual(q))[0], b = await nuevo(q, near), [w, tw] = want.split('@'), isGood = r => r && !r.onlyTown && new RegExp(norm(w), 'i').test(norm((r.road || '') + ' ' + (r.name || ''))) && (!tw || new RegExp(norm(tw), 'i').test(norm(r.town + ' ' + r.sub)));
  if (isGood(a)) ok0++; if (isGood(b[0])) ok1++;
  console.log(`\n«${q}» (mirando ${near === ARENAL ? "s'Arenal" : 'Palma'})\n  ahora: ${isGood(a) ? 'OK ' : 'MAL'} ${lab(a)}\n  nuevo: ${isGood(b[0]) ? 'OK ' : 'MAL'} ${lab(b[0])}${b[1] ? '   · 2º ' + lab(b[1]) : ''}`);
}
console.log(`\n== Resumen: ahora ${ok0}/${T.length} · nuevo ${ok1}/${T.length}`);
