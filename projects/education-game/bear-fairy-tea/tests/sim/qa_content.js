#!/usr/bin/env node
// Moka's Fairy Tea Party — QA content statistics (report-only): Talk answer position + value spread, odd-slot histogram per thing
// count (chained with the previous slot like the world), count-gap difficulty per age / round, and warm-up vs later rounds.
//   node tests/sim/qa_content.js [seeds=3000]
'use strict';
const L = require('./lib'), FT = L.FT, C = FT.Content;
const N = +(process.argv[2] || 3000);
const out = [];
// ---- Talk: answer index among the choices (should be uniform), per age × topic
out.push('| age | topic | Talk questions | choices | answer position % (0 / 1 / 2) | distinct answers | most common answer % |', '|---|---|---|---|---|---|---|');
for (const age of [3, 4, 5, 6, 7]) for (const topic of FT.AGE_POOLS[age]) {
  const pos = [0, 0, 0], vals = {}; let nC = 0;
  for (let s = 0; s < N; s++) {
    const t = C.makeTalk(topic, { age, lang: s % 2 ? 'vi' : 'en', rng: new FT.RNG(77 + s * 31 + age), level: 1 });
    nC = t.choices.length; const i = t.choices.findIndex(c => c.id === t.answer); pos[i]++;
    const v = String(t.choices[i].value); vals[v] = (vals[v] || 0) + 1;
  }
  const top = Math.max(...Object.values(vals)) / N * 100;
  out.push(`| ${age} | ${topic} | ${N} | ${nC} | ${pos.slice(0, nC).map(x => (x / N * 100).toFixed(1)).join(' / ')} | ${Object.keys(vals).length} | ${top.toFixed(1)} |`);
}
// ---- odd slot histogram per n (chained like the world: prev slot excluded), and the share of "it moved one step" patterns
out.push('', '| age | n things | rounds | odd slot share % (left → right) | at an end % (uniform 2/n) | same as last | moved by exactly ±1 % |', '|---|---|---|---|---|---|---|');
for (const age of [3, 4, 5, 6, 7]) {
  const H = {}, prevBy = {};
  for (let c = 0; c < N / 4; c++) {
    const rng = new FT.RNG(9100 + c * 7 + age); let prev = [], used = [];
    for (const topic of FT.AGE_TOPICS[age]) for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: 'en', rng, roundIndex: ri, level: c % 4, usedKeys: used, prevOddSlots: prev });
      used.push(r.key);
      const n = r.members.length, h = H[n] = H[n] || { n: 0, s: Array(n).fill(0), same: 0, step: 0 };
      h.n++; h.s[r.oddSlot]++;
      if (prev.length && prev[0] === r.oddSlot) h.same++;
      if (prev.length && Math.abs(prev[0] - r.oddSlot) === 1) h.step++;
      prev = [r.oddSlot].concat(prev).slice(0, 2);
      void prevBy;
    }
  }
  for (const n of Object.keys(H).sort()) { const h = H[n]; out.push(`| ${age} | ${n} | ${h.n} | ${h.s.map(x => (x / h.n * 100).toFixed(0)).join(' / ')} | ${((h.s[0] + h.s[n - 1]) / h.n * 100).toFixed(1)} (${(200 / n).toFixed(1)}) | ${h.same} | ${(h.step / h.n * 100).toFixed(1)} |`); }
}
// ---- count topic: the gap between the friends' berries and the odd plate, warm-up vs later, and the largest plate
out.push('', '| age | round | rounds | berry gap 1 / 2 / 3 / ≥4 % | max berries mean (max) | things |', '|---|---|---|---|---|---|');
for (const age of [3, 4, 5, 6, 7]) for (const ri of [0, 1, 2, 3]) {
  const g = [0, 0, 0, 0], mx = []; let n = 0, things = 0;
  for (let s = 0; s < N; s++) {
    const r = C.makeRound('count', { age, lang: 'en', rng: new FT.RNG(300 + s * 13 + age), roundIndex: ri, level: 1 });
    const o = r.members.find(m => m.odd).thing.n, a = r.rule.value, d = Math.abs(o - a);
    g[Math.min(3, d - 1)]++; mx.push(Math.max(o, a)); n++; things += r.members.length;
  }
  out.push(`| ${age} | ${ri} | ${n} | ${g.map(x => (x / n * 100).toFixed(1)).join(' / ')} | ${L.mean(mx).toFixed(1)} (${Math.max(...mx)}) | ${(things / n).toFixed(2)} |`);
}
console.log(out.join('\n'));
require('fs').mkdirSync(__dirname + '/out', { recursive: true });
require('fs').writeFileSync(__dirname + '/out/qa_content.md', out.join('\n') + '\n');
