#!/usr/bin/env node
// Nini's Sea Painting — content statistics (report-only): per age × topic, over many generated chapters (4 rounds each, the
// way the world calls makeRound): validity, steps per round, templates used + repeats in a row, palette / step colours,
// count N + spots, targets per role, make time.   node tests/sim/content_stats.js [chapters=300]
'use strict';
const L = require('./lib'); const SP = L.SP, C = SP.Content;
const N = +(process.argv[2] || 300);
const out = ['| age | topic | rounds | invalid | steps 1/2/3 % | templates (most used %) | same template in a row % | colours used | count N range · spots | ms / round |', '|---|---|---|---|---|---|---|---|---|---|'];
let bad = 0;
for (const age of [3, 4, 5, 6, 7]) for (const topic of C.TOPICS) {
  const st = { n: 0, invalid: 0, steps: [0, 0, 0, 0], tpl: {}, rep: 0, cols: {}, N: [], spots: [], ms: 0 };
  for (let c = 0; c < N; c++) {
    const rng = new SP.RNG(9000 + c * 13 + age), prev = [];
    let last = null;
    for (let ri = 0; ri < 4; ri++) {
      const t0 = process.hrtime.bigint();
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, prevPics: prev.slice(-2), short: ri === 3 && c % 5 === 0 });
      st.ms += Number(process.hrtime.bigint() - t0) / 1e6;
      st.n++;
      if (C.validate(r)) { st.invalid++; bad++; }
      st.steps[r.steps.length]++;
      st.tpl[r.templateId] = (st.tpl[r.templateId] || 0) + 1;
      if (last && last.templateId === r.templateId) st.rep++;
      r.steps.forEach(s => { st.cols[s.color] = (st.cols[s.color] || 0) + 1; });
      if (r.steps[0].mode === 'count' && topic === 'count') { st.N.push(r.steps[0].need); st.spots.push(r.steps[0].targets.length); }
      prev.push(r.templateId); last = r;
    }
  }
  const top = Object.entries(st.tpl).sort((a, b) => b[1] - a[1]);
  const pc = k => (st.steps[k] / st.n * 100).toFixed(0);
  out.push(`| ${age} | ${topic} | ${st.n} | ${st.invalid} | ${pc(1)}/${pc(2)}/${pc(3)} | ${top.length} (${top[0][0]} ${(top[0][1] / st.n * 100).toFixed(0)}) | ${(st.rep / st.n * 100).toFixed(1)} | ${Object.keys(st.cols).sort().join(' ')} | ${st.N.length ? Math.min(...st.N) + '–' + Math.max(...st.N) + ' · ' + Math.min(...st.spots) + '–' + Math.max(...st.spots) : ''} | ${(st.ms / st.n).toFixed(1)} |`);
}
console.log(out.join('\n'));
console.log(bad ? `\n${bad} INVALID rounds` : '\nall rounds valid');
process.exit(bad ? 1 : 0);
