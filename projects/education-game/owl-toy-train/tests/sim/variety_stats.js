#!/usr/bin/env node
// Variety between consecutive trains of a chapter (report-only): identical car-label set, shared labels, shared cargo,
// count needs / cargo toy repeats, per age × topic.   node tests/sim/variety_stats.js [chapters=2000]
'use strict';
const L = require('./lib'); const TT = L.TT, C = TT.Content;
const N = +(process.argv[2] || 2000);
if (process.argv.includes('--patch')) {
  // proposed content rule (sim only): a train never repeats the previous train's car-label set (when another set exists:
  // not size / oddeven) and a count train never repeats the previous count train's cargo toy — up to 20 re-rolls.
  const mk = C.makeRound;
  C.makeRound = function (topic, o) {
    const prevLabels = o.prevKey ? o.prevKey.split('#')[0] : null, prevToy = o.prevToy;
    let r;
    for (let k = 0; k < 20; k++) {
      r = mk.call(C, topic, o);
      const lab = r.key.split('#')[0];
      const toy = r.mode === 'count' ? r.items[0].sprite : null;
      if (topic !== 'size' && topic !== 'oddeven' && prevLabels && lab === prevLabels) continue;
      if (toy && prevToy && toy === prevToy) continue;
      break;
    }
    return r;
  };
}
const lk = c => c.label.type + ':' + c.label.value;
const ik = i => i.kind + ':' + (i.sprite || i.toy || i.shape || i.text || '') + ':' + (i.color || '') + ':' + (i.scale || '');
const out = ['| age | topic | identical car set vs previous train % | car labels shared % | cargo looks shared % | same cargo toy (count) % | same need (count) % | cars r0..r3 | cargo r0..r3 |', '|---|---|---|---|---|---|---|---|---|'];
for (const age of [3, 4, 5, 6, 7]) for (const topic of TT.AGE_POOLS[age]) {
  let pairs = 0, same = 0, shared = 0, items = 0, sameToy = 0, sameNeed = 0, cpairs = 0; const cars = [0, 0, 0, 0], its = [0, 0, 0, 0];
  for (let s = 0; s < N; s++) {
    const rng = new TT.RNG(s * 7919 + age * 13 + topic.length);
    let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      const r = C.makeRound(topic, { age, lang: 'en', rng, roundIndex: ri, prevKey: prev && prev.key, prevToy: prev && prev.mode === 'count' ? prev.items[0].sprite : null, surprise: ri === 2 ? 'hitch' : null });
      cars[ri] += r.cars.length; its[ri] += r.items.length;
      if (prev && ri > 0) {
        pairs++;
        const a = prev.cars.map(lk).sort().join(), b = r.cars.map(lk).sort().join();
        if (a === b) same++;
        shared += r.cars.filter(c => prev.cars.map(lk).includes(lk(c))).length / r.cars.length;
        const pi = prev.items.map(ik); items += r.items.filter(i => pi.includes(ik(i))).length / r.items.length;
        if (r.mode === 'count') { cpairs++; if (r.items[0].sprite === prev.items[0].sprite) sameToy++; if (r.cars.map(c => c.need).join() === prev.cars.map(c => c.need).join()) sameNeed++; }
      }
      prev = r;
    }
  }
  const p = x => (x / pairs * 100).toFixed(0);
  out.push(`| ${age} | ${topic} | ${p(same)} | ${p(shared)} | ${p(items)} | ${cpairs ? (sameToy / cpairs * 100).toFixed(0) : ''} | ${cpairs ? (sameNeed / cpairs * 100).toFixed(0) : ''} | ${cars.map(x => (x / N).toFixed(1)).join(' ')} | ${its.map(x => (x / N).toFixed(1)).join(' ')} |`);
}
console.log(out.join('\n'));
