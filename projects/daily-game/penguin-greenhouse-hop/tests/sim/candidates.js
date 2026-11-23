// Puddle's Greenhouse Hop — compare candidate CONFIG patches on the playtest's key numbers (report-only).
//   node tests/sim/candidates.js [nSeeds=24] [names,comma,separated]
// Per candidate × difficulty × player: unlimited hearts 600 s → falls/min, floor-1 s, s/floor, % of time big,
// % of time at max size, falls/min small → big; real hearts ≤ 900 s → median survival s and floors.
// A candidate is {"*": {...}, "easy": {...}} like run.js patches; applied to a fresh vm copy (game/ untouched).
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');
const [, , nArg = '24', onlyArg] = process.argv;
const N = +nArg;

const CANDIDATES = {
  base: {},
  // the recommended patch (see docs/reports/playtest.md)
  rec: JSON.parse(fs.readFileSync(path.join(__dirname, 'patch.json'), 'utf8')),
  growT6: { '*': { growRate: 0.006 } },
  growT6f5: { '*': { growRate: 0.006, growPerFirefly: 0.005 } },
  easyW16: { easy: { 'difficulty.easy.widthK': 1.6 } },
  easyGap: { easy: { 'difficulty.easy.gap': [1.2, 1.9] } },
  bigAt125: { '*': { bigAt: 1.25 } }
};
const PLAYERS = { easy: [['kid', 4], ['kid', 5], ['kid', 6], ['casual'], ['bot', 0.3]], normal: [['kid', 6], ['casual'], ['bot', 0.3], ['bot', 0.5]], hard: [['casual'], ['bot', 0.3], ['bot', 0.5]] };
const f = (x, n = 0) => (x === null || x === undefined || Number.isNaN(x) || !isFinite(x)) ? '–' : (+x).toFixed(n);

const out = {};
for (const [name, patch] of Object.entries(CANDIDATES)) {
  if (onlyArg && !onlyArg.split(',').includes(name)) continue;
  for (const d of ['easy', 'normal', 'hard']) {
    const PH = L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {}));
    for (const [p, a] of PLAYERS[d]) {
      let falls = 0, T = 0, fl1 = [], fl = [], bigT = 0;
      for (let s = 0; s < N; s++) {
        const m = L.runRound(PH, { diff: d, seed: 2200 + s, player: p, arg: a, maxT: 600, unlimited: true });
        falls += m.falls.length; T += m.time; bigT += m.bigTime;
        if (m.levelT[0]) fl1.push(m.levelT[0].dt); for (const x of m.levelT) fl.push(x.dt);
      }
      const surv = [], floors = [];
      for (let s = 0; s < N; s++) { const m = L.runRound(PH, { diff: d, seed: 5200 + s, player: p, arg: a, maxT: 900 }); surv.push(m.time); floors.push(m.levels); }
      const row = { fpm: falls / T * 60, floor1: L.quant(fl1, 0.5), floor1Reach: fl1.length / N, perFloor: L.quant(fl, 0.5), big: bigT / T,
        surv: L.quant(surv, 0.5), alive: surv.filter(x => x >= 899).length / N, floors: L.quant(floors, 0.5) };
      out[`${name}/${d}/${p}${a || ''}`] = row;
      console.log(`${name.padEnd(9)} ${d.padEnd(6)} ${(p + (a || '')).padEnd(7)} f/min ${f(row.fpm, 2).padStart(5)}  floor1 ${f(row.floor1).padStart(3)}s  s/floor ${f(row.perFloor).padStart(3)}  big ${f(row.big * 100).padStart(2)}%  | real: surv ${f(row.surv).padStart(3)}s alive ${f(row.alive * 100).padStart(3)}% floors ${f(row.floors)}`);
    }
  }
}
fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'out', 'candidates' + (onlyArg ? '-' + onlyArg.replace(/,/g, '_') : '') + '.json'), JSON.stringify(out, null, 1));
