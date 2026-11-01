#!/usr/bin/env node
// Scan potPadUp × playPotGap: worst pack scale / pack failures / resting-in-zone (bot0.9, all ages × viewports)
// and the miss rate of a child who releases 60–120 px above the rim (dropsHighRim) and of slow3.
//   node tests/sim/pad_scan.js
'use strict';
const P = require('./playtest');
const combos = [[90, 44], [100, 54], [110, 64], [120, 74], [120, 64], [110, 54]];
const VPS = ['iphoneP', 'iphoneL', 'ipadL', 'ipadP'];
for (const [up, gap] of combos) {
  const config = { potPadUp: up, playPotGap: gap };
  let shrink = 1, fail = 0, inZone = 0, small = 0, rounds = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const vp of VPS) for (let s = 0; s < 6; s++) {
    const r = P.runOne({ age, lang: s % 2 ? 'vi' : 'en', vp, driver: 'bot0.9', seed: 40000 + s + age * 10, config });
    shrink = Math.min(shrink, r.packShrinkMin); inZone += r.restInZone + r.tapHazard; rounds += r.rounds.length;
  }
  const miss = d => { let m = 0, dr = 0; for (const age of [3, 4, 5]) for (let s = 0; s < 12; s++) { const r = P.runOne({ age, lang: 'en', vp: VPS[s % 4], driver: d, seed: 41000 + s + age * 50, config }); m += r.misses; dr += r.drops; } return (100 * m / dr).toFixed(1) + '%'; };
  console.log(`potPadUp ${up} playPotGap ${gap}: worst pack scale ${shrink.toFixed(2)}, resting/home in a drop zone ${inZone} (${rounds} rounds), miss/drop dropsHighRim ${miss('dropsHighRim')}, slow3 ${miss('slow3')}`);
}
