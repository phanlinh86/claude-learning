#!/usr/bin/env node
// Bun's Dino Dig — content statistics (report-only): per age × topic, over many generated chapters (4 rounds each, the way
// the world calls makeRound: level 0 for the first chapter, prevKey / prevN chained): validity, steps per round, mounds per
// round, the same set twice in a row, distinct sets, colours / shapes / animals used, count N range, make time.
//   node tests/sim/content_stats.js [chapters=300]          (exit 1 when any round is invalid)
'use strict';
const L = require('./lib'); const DD = L.DD, C = DD.Content;
const N = +(process.argv[2] || 300);
const out = ['| age | topic | rounds | invalid | steps 1/2 % | mounds (min–max, mean) | same set in a row % | distinct sets | colours | shapes / animals / texts | count N | ms / round |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|'];
let bad = 0;
for (const age of [3, 4, 5, 6, 7]) for (const topic of C.TOPICS) {
  const st = { n: 0, invalid: 0, steps: [0, 0, 0], mounds: [], rep: 0, keys: new Set(), cols: {}, vals: {}, N: [], ms: 0 };
  for (let c = 0; c < N; c++) {
    const rng = new DD.RNG(9000 + c * 13 + age), level = c % 4 === 0 ? 0 : 1;
    let prevKey = null, prevN = 0;
    for (let ri = 0; ri < 4; ri++) {
      const t0 = process.hrtime.bigint();
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, level, short: ri === 3 && c % 5 === 0, prevKey, prevN });
      st.ms += Number(process.hrtime.bigint() - t0) / 1e6;
      st.n++;
      if (C.validate(r)) { st.invalid++; bad++; }
      st.steps[r.steps.length]++;
      st.mounds.push(r.mounds.length);
      if (prevKey === r.key) st.rep++;
      st.keys.add(r.key);
      r.mounds.forEach(m => { const t = m.thing; if (t.color) st.cols[t.color] = 1; const v = t.shape || t.animal || t.text; if (v) st.vals[v] = 1; });
      if (r.steps[0].mode === 'count') { st.N.push(r.steps[0].need); prevN = r.steps[0].need; }
      prevKey = r.key;
    }
  }
  const pc = k => (st.steps[k] / st.n * 100).toFixed(0);
  const vals = Object.keys(st.vals);
  out.push(`| ${age} | ${topic} | ${st.n} | ${st.invalid} | ${pc(1)}/${pc(2)} | ${Math.min(...st.mounds)}–${Math.max(...st.mounds)}, ${L.mean(st.mounds).toFixed(1)} | ${(st.rep / st.n * 100).toFixed(1)} | ${st.keys.size} | ${Object.keys(st.cols).sort().join(' ')} | ${vals.length > 10 ? vals.length + ' values' : vals.sort().join(' ')} | ${st.N.length ? Math.min(...st.N) + '–' + Math.max(...st.N) : ''} | ${(st.ms / st.n).toFixed(2)} |`);
}
console.log(out.join('\n'));
console.log(bad ? `\n${bad} INVALID rounds` : '\nall rounds valid');
process.exit(bad ? 1 : 0);
