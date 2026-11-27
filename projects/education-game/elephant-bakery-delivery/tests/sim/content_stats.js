#!/usr/bin/env node
// Tupi's Bakery Delivery — content statistics (report-only): per age × topic, over many generated chapters (4 rounds each, the way the
// world calls makeRound: level 0 for every 4th chapter, usedKeys / prevRule chained, maxN 3 for every 3rd chapter (squat iPads), a short
// last round now and then): validity, houses × deliveries, 2-fork rounds, the same round twice in a chapter, the same first ask as the
// last round, distinct rounds, colours, values, make time.
//   node tests/sim/content_stats.js [chapters=300]          (exit 1 when any round is invalid)
'use strict';
const L = require('./lib'); const BD = L.BD, C = BD.Content;
const N = +(process.argv[2] || 300);
const out = ['| age | topic | rounds | invalid | houses × deliveries (mean) | 2-fork % | same round in a chapter % | same first ask % | distinct rounds | colours | values | ms / round |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|'];
let bad = 0;
for (const age of [3, 4, 5, 6, 7]) for (const topic of BD.AGE_POOLS[age]) {
  const st = { n: 0, invalid: 0, ns: [], ds: [], f2: 0, rep: 0, sameAsk: 0, keys: new Set(), cols: {}, vals: {}, t: 0 };
  for (let c = 0; c < N; c++) {
    const rng = new BD.RNG(9000 + c * 13 + age), level = c % 4 === 0 ? 0 : 1, used = [], maxN = c % 3 === 0 ? 3 : 4;
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const t0 = process.hrtime.bigint();
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, level, short: ri === 3 && c % 5 === 0, usedKeys: used, prevRule: prev, maxN });
      st.t += Number(process.hrtime.bigint() - t0) / 1e6;
      st.n++;
      if (C.validate(r)) { st.invalid++; bad++; }
      st.ns.push(r.n); st.ds.push(r.d); if (r.map.forks === 2) st.f2++;
      if (used.includes(r.key)) st.rep++;
      if (prev && String(prev.value) === String(r.orders[0].rule.value)) st.sameAsk++;
      used.push(r.key); st.keys.add(r.key);
      r.houses.forEach(h => { const t = h.sign; if (t.color) st.cols[t.color] = 1; const v = t.shape || t.animal || t.home || t.text || t.n || t.color; if (v !== undefined) st.vals[v] = 1; });
      prev = r.orders[r.orders.length - 1].rule;
    }
  }
  const vals = Object.keys(st.vals), p = x => (x / st.n * 100).toFixed(1);
  out.push(`| ${age} | ${topic} | ${st.n} | ${st.invalid} | ${L.mean(st.ns).toFixed(2)} × ${L.mean(st.ds).toFixed(2)} | ${p(st.f2)} | ${p(st.rep)} | ${p(st.sameAsk)} | ${st.keys.size} | ${Object.keys(st.cols).sort().join(' ')} | ${vals.length > 10 ? vals.length + ' values' : vals.sort().join(' ')} | ${(st.t / st.n).toFixed(3)} |`);
}
console.log(out.join('\n'));
console.log(bad ? `\n${bad} INVALID rounds` : '\nall rounds valid');
process.exit(bad ? 1 : 0);
