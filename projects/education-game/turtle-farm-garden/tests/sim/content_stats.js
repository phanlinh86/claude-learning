#!/usr/bin/env node
// Tumi's Flower Farm — content statistics (report-only): per age × topic, over many generated chapters (4 rounds each, the
// way the world calls makeRound with `prev` = the last round's answers): validity, modes, choices per pick, asked values
// (variety + back-to-back repeats), trace path length (picture px) and strokes, icing colours, count N, make time.
//   node tests/sim/content_stats.js [chapters=300]
'use strict';
const L = require('./lib'); const FT = L.FT, C = FT.Content;
const N = +(process.argv[2] || 300);
const out = ['| age | topic | rounds | invalid | modes (most common) | choices | distinct asked values | asked again back to back % | path px mean [min–max] | strokes max | icing colours | count N | ms / round |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
let bad = 0;
for (const age of [3, 4, 5, 6, 7]) for (const topic of C.TOPICS) {
  const st = { n: 0, invalid: 0, modes: {}, ch: new Set(), asked: {}, rep: 0, len: [], strokes: 0, cols: {}, N: [], ms: 0 };
  for (let c = 0; c < N; c++) {
    const rng = new FT.RNG(9000 + c * 13 + age);
    let prev = null, lastAsked = null;
    for (let ri = 0; ri < 4; ri++) {
      const t0 = process.hrtime.bigint();
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, prev, short: ri === 3 && c % 5 === 0 });
      st.ms += Number(process.hrtime.bigint() - t0) / 1e6;
      st.n++;
      if (C.validate(r)) { st.invalid++; bad++; }
      const m = r.steps.map(s => s.mode).join('+'); st.modes[m] = (st.modes[m] || 0) + 1;
      const tr = r.steps.filter(s => s.mode === 'trace');
      const asked = String(tr[0].nameValue === 'circle' && topic === 'size' ? r.steps[0].nameValue : (r.steps[0].mode === 'trace' ? tr[0].nameValue : r.steps[0].nameValue));
      st.asked[asked] = (st.asked[asked] || 0) + 1;
      if (asked === lastAsked) st.rep++;
      r.steps.filter(s => s.choices).forEach(s => st.ch.add(s.choices.length));
      tr.forEach(s => { const p = FT.Trace.path(s.path); st.len.push(p.len); st.strokes = Math.max(st.strokes, p.strokes.length); st.cols[s.color] = 1; });
      const chips = r.steps.find(s => s.mode === 'chips'); if (chips) st.N.push(chips.need);
      prev = r.answers; lastAsked = asked;
    }
  }
  const mm = Object.entries(st.modes).sort((a, b) => b[1] - a[1])[0];
  out.push(`| ${age} | ${topic} | ${st.n} | ${st.invalid} | ${mm[0]} ${(mm[1] / st.n * 100).toFixed(0)}% | ${[...st.ch].sort().join('/')} | ${Object.keys(st.asked).length} | ${(st.rep / st.n * 100).toFixed(1)} | ${L.mean(st.len).toFixed(0)} [${Math.min(...st.len).toFixed(0)}–${Math.max(...st.len).toFixed(0)}] | ${st.strokes} | ${Object.keys(st.cols).sort().join(' ')} | ${st.N.length ? Math.min(...st.N) + '–' + Math.max(...st.N) : ''} | ${(st.ms / st.n).toFixed(2)} |`);
}
console.log(out.join('\n'));
console.log(bad ? `\n${bad} INVALID rounds` : '\nall rounds valid');
process.exit(bad ? 1 : 0);
