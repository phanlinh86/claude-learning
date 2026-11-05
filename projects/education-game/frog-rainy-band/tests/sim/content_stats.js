#!/usr/bin/env node
// Bop's Rainy Band — content distribution report (report-only): answer values per topic × age, which member slot is asked,
// how often each member of a band is asked, colour sets below age 5.   node tests/sim/content_stats.js [chapters=400]
'use strict';
const L = require('./lib');
const RB = L.RB, C = RB.Content;
const N = +(process.argv[2] || 400);
const out = [];
for (const age of [3, 4, 5, 6, 7]) for (const topic of RB.AGE_POOLS[age]) {
  const vals = {}, slot = {}, sets = {};
  let asks = 0, maxSame = 0;
  for (let s = 0; s < N; s++) {
    const rng = new RB.RNG(s * 7919 + age);
    let prev = null, key = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: s % 2 ? 'vi' : 'en', rng, roundIndex: ri, avoid: prev, prevMembers: key });
      prev = r.asks[r.asks.length - 1]; key = r.key;
      if (r.members.some(m => m.color) && age < 5) { const k = [...new Set(r.members.map(m => m.color))].sort().join('+'); sets[k] = (sets[k] || 0) + 1; }
      const cnt = {};
      r.asks.forEach(a => {
        asks++;
        const v = a.mode === 'drum' ? 'drum' + a.n : String(r.members[a.answer].value); vals[v] = (vals[v] || 0) + 1;
        if (a.answer >= 0) { const k = r.members.length + ':' + a.answer; slot[k] = (slot[k] || 0) + 1; cnt[a.answer] = (cnt[a.answer] || 0) + 1; }
      });
      maxSame = Math.max(maxSame, ...Object.values(cnt), 0);
    }
  }
  const top = Object.entries(vals).sort((a, b) => b[1] - a[1]);
  out.push(`| ${age} | ${topic} | ${top.length} | ${top.slice(0, 4).map(([v, c]) => v + ' ' + (100 * c / asks).toFixed(0) + '%').join(', ')} | ` +
    `${Object.entries(slot).sort().map(([k, c]) => k + ' ' + c).join(' · ')} | ${maxSame} | ${Object.keys(sets).length ? Object.keys(sets).length + ' sets' : '–'} |`);
}
console.log(`| age | topic | distinct answers | most frequent | answer slot (members:index count) | max asks of one member in a song | colour sets (< 5) |\n|---|---|---|---|---|---|---|\n` + out.join('\n'));
