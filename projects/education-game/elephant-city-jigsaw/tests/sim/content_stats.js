#!/usr/bin/env node
// Pom's Puzzle Town — content statistics (report-only): per age × topic, over many generated chapters (4 rounds each, the way
// the world calls makeRound: level 0 for the first chapter, usedKeys / prevAns chained): validity, slots + distractors per
// round, the same set twice in a chapter, the same first answer as the last round, distinct sets, values used, make time.
//   node tests/sim/content_stats.js [chapters=300]          (exit 1 when any round is invalid)
'use strict';
const L = require('./lib'); const PZ = L.PZ, C = PZ.Content;
const N = +(process.argv[2] || 300);
const out = ['| age | topic | rounds | invalid | slots (min–max, mean) | distractors / round | same set in a chapter % | same first answer % | distinct sets | colours | values | ms / round |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|'];
let bad = 0;
for (const age of [3, 4, 5, 6, 7]) for (const topic of PZ.AGE_POOLS[age]) {
  const st = { n: 0, invalid: 0, slots: [], extra: [], rep: 0, sameAns: 0, keys: new Set(), cols: {}, vals: {}, ms: 0 };
  for (let c = 0; c < N; c++) {
    const rng = new PZ.RNG(9000 + c * 13 + age), level = c % 4 === 0 ? 0 : 1, used = [];
    let prevAns = null, prevAnsRun = 0;
    for (let ri = 0; ri < 4; ri++) {
      const t0 = process.hrtime.bigint();
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, level, short: ri === 3 && c % 5 === 0, usedKeys: used, prevAns, prevAnsRun });
      st.ms += Number(process.hrtime.bigint() - t0) / 1e6;
      st.n++;
      if (C.validate(r)) { st.invalid++; bad++; }
      st.slots.push(r.slots.length); st.extra.push(r.pieces.length - r.slots.length);
      if (used.includes(r.key)) st.rep++;
      if (prevAns !== null && String(r.steps[0].nameValue) === String(prevAns)) st.sameAns++;
      used.push(r.key); st.keys.add(r.key);
      r.pieces.forEach(p => { const t = p.thing; if (t.color) st.cols[t.color] = 1; const v = t.obj || t.shape || t.animal || t.text || t.n; if (v !== undefined) st.vals[v] = 1; });
      const ls = r.steps[r.steps.length - 1];
      prevAnsRun = String(ls.nameValue) === String(prevAns) ? prevAnsRun + 1 : 1; prevAns = ls.nameValue;
    }
  }
  const vals = Object.keys(st.vals);
  out.push(`| ${age} | ${topic} | ${st.n} | ${st.invalid} | ${Math.min(...st.slots)}–${Math.max(...st.slots)}, ${L.mean(st.slots).toFixed(2)} | ${L.mean(st.extra).toFixed(2)} | ${(st.rep / st.n * 100).toFixed(1)} | ${(st.sameAns / st.n * 100).toFixed(1)} | ${st.keys.size} | ${Object.keys(st.cols).sort().join(' ')} | ${vals.length > 10 ? vals.length + ' values' : vals.sort().join(' ')} | ${(st.ms / st.n).toFixed(2)} |`);
}
console.log(out.join('\n'));
console.log(bad ? `\n${bad} INVALID rounds` : '\nall rounds valid');
process.exit(bad ? 1 : 0);
