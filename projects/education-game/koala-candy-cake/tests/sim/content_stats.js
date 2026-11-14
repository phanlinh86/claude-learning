#!/usr/bin/env node
// Koko's Cake Tower — content distribution report (report-only): answer values per topic × age, answer slot position,
// distractor variety, prompt repeats inside a chapter.   node tests/sim/content_stats.js [chapters=400]
'use strict';
const L = require('./lib');
const CK = L.CK, C = CK.Content;
const N = +(process.argv[2] || 400);
const out = [];
for (const age of [3, 4, 5, 6, 7]) for (const topic of CK.AGE_POOLS[age]) {
  const vals = {}, slot = {}, repeats = { prompt: 0, asks: 0 };
  let distinctD = 0, pairs = 0;
  for (let s = 0; s < N; s++) {
    const rng = new CK.RNG(s * 7919 + age), seen = new Set();
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: s % 2 ? 'vi' : 'en', rng, roundIndex: ri, avoid: prev });
      r.asks.forEach((a, q) => {
        const v = String(a.choices[a.answer].value); vals[v] = (vals[v] || 0) + 1;
        const k = a.choices.length + ':' + a.answer; slot[k] = (slot[k] || 0) + 1;
        const pk = a.promptKey + JSON.stringify(a.params); repeats.asks++; if (seen.has(pk)) repeats.prompt++; seen.add(pk);
        if (q) { pairs++; const d = x => x.choices.filter((c, j) => j !== x.answer).map(C.blockKey).sort().join(); if (d(a) !== d(r.asks[q - 1])) distinctD++; }
      });
      prev = r.asks[r.asks.length - 1];
    }
  }
  const tot = Object.values(vals).reduce((a, b) => a + b, 0), top = Object.entries(vals).sort((a, b) => b[1] - a[1]);
  const sl = k => { const keys = Object.keys(slot).filter(x => x.startsWith(k + ':')), t = keys.reduce((a, x) => a + slot[x], 0); return t ? keys.sort().map(x => Math.round(100 * slot[x] / t)).join('/') : '–'; };
  out.push(`| ${age} | ${topic} | ${top.length} | ${top.slice(0, 4).map(([v, c]) => v + ' ' + Math.round(100 * c / tot) + '%').join(', ')} | ${Math.round(100 * top[top.length - 1][1] / tot)}% | ${sl(2)} | ${sl(3)} | ${sl(4)} | ${pairs ? Math.round(100 * distinctD / pairs) : 100}% | ${Math.round(100 * repeats.prompt / repeats.asks)}% |`);
}
console.log(`## Content stats (${N} chapters per age × topic)\n`);
console.log('| age | topic | answer values | most common | least | answer slot % (2) | (3) | (4) | distractors differ from previous ask | prompt repeats in a chapter |\n|---|---|---|---|---|---|---|---|---|---|');
console.log(out.join('\n'));
