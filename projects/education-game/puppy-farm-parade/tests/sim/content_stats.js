#!/usr/bin/env node
// Bo's Farm Parade — content statistics (report-only): per age × topic, over many generated chapters (4 rounds each, the way the
// world calls makeRound: level 0 for the first chapter, usedKeys / prevRule / prevOddSlot chained): validity, members per round,
// odd slot spread (ends %), the same set twice in a chapter, the same ask as the last round, distinct sets, values used, make time.
//   node tests/sim/content_stats.js [chapters=300]          (exit 1 when any round is invalid)
'use strict';
const L = require('./lib'); const FP = L.FP, C = FP.Content;
const N = +(process.argv[2] || 300);
const out = ['| age | topic | rounds | invalid | members (min–max, mean) | odd at an end % | odd slot repeated | same set in a chapter % | same ask % | distinct sets | colours | values | ms / round |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
let bad = 0;
for (const age of [3, 4, 5, 6, 7]) for (const topic of FP.AGE_POOLS[age]) {
  const st = { n: 0, invalid: 0, sizes: [], ends: 0, slotRep: 0, rep: 0, sameAsk: 0, keys: new Set(), cols: {}, vals: {}, ms: 0 };
  for (let c = 0; c < N; c++) {
    const rng = new FP.RNG(9000 + c * 13 + age), level = c % 4 === 0 ? 0 : 1, used = [];
    let prev = null, run = 0;
    for (let ri = 0; ri < 4; ri++) {
      const t0 = process.hrtime.bigint();
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, level, short: ri === 3 && c % 5 === 0, usedKeys: used,
        prevRule: prev && prev.rule, prevRuleRun: run, prevOddSlot: prev ? prev.oddSlot : -1 });
      st.ms += Number(process.hrtime.bigint() - t0) / 1e6;
      st.n++;
      if (C.validate(r)) { st.invalid++; bad++; }
      st.sizes.push(r.members.length);
      if (r.oddSlot === 0 || r.oddSlot === r.members.length - 1) st.ends++;
      if (prev && prev.oddSlot === r.oddSlot) st.slotRep++;
      if (used.includes(r.key)) st.rep++;
      if (prev && prev.rule.kind === r.rule.kind && String(prev.rule.value) === String(r.rule.value)) st.sameAsk++;
      run = prev && String(prev.rule.value) === String(r.rule.value) ? run + 1 : 1;
      used.push(r.key); st.keys.add(r.key);
      r.members.forEach(m => { const t = m.thing; if (t.color) st.cols[t.color] = 1; const v = t.shape || t.animal || t.text || t.n || t.obj; if (v !== undefined) st.vals[v] = 1; });
      prev = r;
    }
  }
  const vals = Object.keys(st.vals);
  out.push(`| ${age} | ${topic} | ${st.n} | ${st.invalid} | ${Math.min(...st.sizes)}–${Math.max(...st.sizes)}, ${L.mean(st.sizes).toFixed(2)} | ${(st.ends / st.n * 100).toFixed(1)} | ${st.slotRep} | ${(st.rep / st.n * 100).toFixed(1)} | ${(st.sameAsk / st.n * 100).toFixed(1)} | ${st.keys.size} | ${Object.keys(st.cols).sort().join(' ')} | ${vals.length > 10 ? vals.length + ' values' : vals.sort().join(' ')} | ${(st.ms / st.n).toFixed(2)} |`);
}
console.log(out.join('\n'));
console.log(bad ? `\n${bad} INVALID rounds` : '\nall rounds valid');
process.exit(bad ? 1 : 0);
