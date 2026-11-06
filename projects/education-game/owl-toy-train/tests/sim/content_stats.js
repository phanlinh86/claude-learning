#!/usr/bin/env node
// Momo's Toy Train — content distribution report (report-only): per topic × age, how many cars / cargo per round, label
// values, colour sets below age 5, count needs, short rounds.   node tests/sim/content_stats.js [chapters=400]
'use strict';
const L = require('./lib');
const TT = L.TT, C = TT.Content;
const N = +(process.argv[2] || 400);
const out = ['| age | topic | rounds | cars / round (r0 r1 r2 r3) | cargo / round (r0 r1 r2 r3) | most used labels | count needs (r0 r1 r2 r3) |', '|---|---|---|---|---|---|---|'];
for (const age of [3, 4, 5, 6, 7]) for (const topic of TT.AGE_POOLS[age]) {
  const cars = [[], [], [], []], items = [[], [], [], []], labels = {}, needs = [[], [], [], []];
  for (let s = 0; s < N; s++) {
    const rng = new TT.RNG(s * 7919 + age);
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: s % 2 ? 'vi' : 'en', rng, roundIndex: ri, prevKey: prev });
      prev = r.key;
      cars[ri].push(r.cars.length); items[ri].push(r.items.length);
      for (const c of r.cars) { const k = String(c.label.value); labels[k] = (labels[k] || 0) + 1; }
      if (r.mode === 'count') needs[ri].push(r.cars.map(c => c.need).join('+'));
    }
  }
  const m = a => L.mean(a).toFixed(1);
  const top = Object.entries(labels).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => k + ' ' + Math.round(v / (N * 4) * 100) + '%').join(', ');
  const nd = needs[0].length ? needs.map(a => { const c = {}; a.forEach(x => (c[x] = (c[x] || 0) + 1)); return Object.keys(c).length + ' kinds'; }).join(' ') : '';
  out.push(`| ${age} | ${topic} | ${N * 4} | ${cars.map(m).join(' ')} | ${items.map(m).join(' ')} | ${top} | ${nd} |`);
}
console.log(out.join('\n'));
