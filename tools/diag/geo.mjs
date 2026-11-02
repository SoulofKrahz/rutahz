// Diagnóstico: dirección obtenida tocando el mapa (reverse + placeLabel) → ¿la encuentra la búsqueda?
const UA = { 'User-Agent': 'rutahz-diag/1.0 (github actions)', 'Accept-Language': 'es' };
const B = { latMin: 39.20, latMax: 40.05, lonMin: 2.25, lonMax: 3.53 };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const get = async u => { await sleep(1100); const r = await fetch(u, { headers: UA }); return r.json(); };
function placeLabel(r) {
  const a = r.address || {}, dn = (r.display_name || '').split(',').map(s => s.trim());
  const town = a.village || a.town || a.city || a.municipality || a.hamlet || '';
  const street = [a.road || a.pedestrian || a.footway || a.path, a.house_number].filter(Boolean).join(', ');
  const main = r.name || street || a.suburb || town || dn[0] || 'Punto en el mapa';
  return { main, town, street, label: town && main !== town ? `${main}, ${town}` : main };
}
const hav = (a, b) => { const t = x => x * Math.PI / 180, dLa = t(b[0] - a[0]), dLo = t(b[1] - a[1]); const h = Math.sin(dLa / 2) ** 2 + Math.cos(t(a[0])) * Math.cos(t(b[0])) * Math.sin(dLo / 2) ** 2; return 2 * 6371 * Math.asin(Math.sqrt(h)); };
const pts = [[39.5813, 2.6779], [39.5745, 2.6588], [39.4897, 2.8917], [39.7217, 2.9106], [39.5694, 3.2085], [39.5696, 2.6502], [39.5528, 2.6205], [39.6110, 2.6620], [39.6875, 2.8492], [39.7649, 2.7147], [39.4322, 2.9714], [39.5300, 2.7400]];
const search = async (q, bounded) => { const p = new URLSearchParams({ q, limit: '5', addressdetails: '1', format: 'jsonv2' }); if (bounded) { p.set('countrycodes', 'es'); p.set('viewbox', `${B.lonMin},${B.latMax},${B.lonMax},${B.latMin}`); p.set('bounded', '1'); } return get('https://nominatim.openstreetmap.org/search?' + p); };
const tally = {};
for (const [lat, lon] of pts) {
  const rv = await get(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=18&addressdetails=1`);
  const L = placeLabel(rv); const a = rv.address || {};
  console.log(`\n### (${lat}, ${lon}) → «${L.label}»   [address: ${Object.entries(a).map(([k, v]) => k + '=' + v).join(' | ')}]`);
  const vars = {
    'app actual (label + , Mallorca, acotado)': [L.label + ', Mallorca', true],
    'label sin «, Mallorca», acotado': [L.label, true],
    'sin número, acotado': [[a.road || a.pedestrian, L.town].filter(Boolean).join(', '), true],
    'número delante (50 Carrer…), acotado': [[a.house_number && (a.house_number + ' ' + (a.road || '')), L.town].filter(Boolean).join(', '), true],
  };
  vars['app nueva (tal cual y, si no hay, sin número)'] = [L.label, true, true];
  for (const [k, [q, bd, fb]] of Object.entries(vars)) {
    if (!q) continue;
    let r = await search(q, bd);
    if (fb && !r.length) { const alt = q.replace(/(,\s*|\s+)(n[º°o.]\s*)?\d+[a-z]?(?=\s*(,|$))/gi, '').trim(); if (alt !== q) r = await search(alt, bd); } const d = r[0] ? hav([lat, lon], [+r[0].lat, +r[0].lon]) : null;
    const ok = d != null && d < 0.4; (tally[k] = tally[k] || [0, 0]); tally[k][1]++; if (ok) tally[k][0]++;
    console.log(`  ${ok ? 'OK ' : (r.length ? 'LEJOS' : 'NADA')} ${k}: «${q}» → ${r.length} res.${r[0] ? ` 1º a ${d.toFixed(2)} km: ${r[0].display_name.slice(0, 80)}` : ''}`);
  }
}
console.log('\n== Resumen (encontrada a < 400 m)'); for (const [k, [o, n]] of Object.entries(tally)) console.log(`  ${k}: ${o}/${n}`);
