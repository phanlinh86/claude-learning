#!/usr/bin/env node
// Mimi's Splash Rocket — content statistics (report-only): per age × topic, over many generated chapters (4 rounds each, the way the
// world calls makeRound: level 0 for every 4th chapter, usedKeys / prevRule chained, a short last round now and then):
// validity, launches × mats, target position spread per mat index, the same set twice in a chapter, the same ask as the last round,
// distinct sets, colours, values, make time.
//   node tests/sim/content_stats.js [chapters=300]          (exit 1 when any round is invalid)
'use strict';
const L = require('./lib'); const DK = L.DK, C = DK.Content;
const N = +(process.argv[2] || 300);
const out = ['| age | topic | rounds | invalid | k × m (mean) | target at index 0 / 1 / 2 % | same set in a chapter % | same ask % | distinct sets | colours | values | ms / round |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|'];
let bad = 0;
for (const age of [3, 4, 5, 6, 7]) for (const topic of DK.AGE_POOLS[age]) {
  const st = { n: 0, invalid: 0, ks: [], ms: [], idx: [0, 0, 0], rows: 0, rep: 0, sameAsk: 0, keys: new Set(), cols: {}, vals: {}, t: 0 };
  for (let c = 0; c < N; c++) {
    const rng = new DK.RNG(9000 + c * 13 + age), level = c % 4 === 0 ? 0 : 1, used = [];
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const t0 = process.hrtime.bigint();
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, level, short: ri === 3 && c % 5 === 0, usedKeys: used, prevRule: prev && prev.rule });
      st.t += Number(process.hrtime.bigint() - t0) / 1e6;
      st.n++;
      if (C.validate(r)) { st.invalid++; bad++; }
      st.ks.push(r.k); st.ms.push(r.m);
      r.launches.forEach(row => { st.idx[row.findIndex(q => q.target)]++; st.rows++; });
      if (used.includes(r.key)) st.rep++;
      if (prev && r.mode !== 'countSeq' && String(prev.rule.value) === String(r.rule.value)) st.sameAsk++;
      used.push(r.key); st.keys.add(r.key);
      r.launches.flat().forEach(q => { const t = q.thing; if (t.color) st.cols[t.color] = 1; const v = t.shape || t.animal || t.text || t.n || t.obj; if (v !== undefined) st.vals[v] = 1; });
      prev = r;
    }
  }
  const vals = Object.keys(st.vals), p = x => (x / st.rows * 100).toFixed(0);
  out.push(`| ${age} | ${topic} | ${st.n} | ${st.invalid} | ${L.mean(st.ks).toFixed(2)} × ${L.mean(st.ms).toFixed(2)} | ${p(st.idx[0])} / ${p(st.idx[1])} / ${p(st.idx[2])} | ${(st.rep / st.n * 100).toFixed(1)} | ${(st.sameAsk / st.n * 100).toFixed(1)} | ${st.keys.size} | ${Object.keys(st.cols).sort().join(' ')} | ${vals.length > 10 ? vals.length + ' values' : vals.sort().join(' ')} | ${(st.t / st.n).toFixed(3)} |`);
}
console.log(out.join('\n'));
console.log(bad ? `\n${bad} INVALID rounds` : '\nall rounds valid');
process.exit(bad ? 1 : 0);
