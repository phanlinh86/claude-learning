// Puddle's Greenhouse Hop — pacing + growth table per floor for the player models (docs/MECHANICS.md §6).
//   node tests/sim/pacing.js [nSeeds=20] [--patch file.json]
// A) unlimited hearts, 600 s: per floor (loop 0) the median seconds, the size at the floor's end (the levelUp
//    size), when Puddle got big (s into the floor), falls in that floor; B) real hearts, ≤ 900 s: falls per run,
//    survival, floors reached.
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const args = process.argv.slice(2);
const N = +(args.find(a => /^\d+$/.test(a)) || 20);
const pi = args.indexOf('--patch');
const patch = pi >= 0 ? JSON.parse(fs.readFileSync(args[pi + 1], 'utf8')) : {};
const PLAYERS = [['kid', 5], ['kid', 6], ['casual'], ['bot', 0.5], ['bot', 1]];
const f = (x, n = 0) => (x === null || x === undefined || Number.isNaN(x)) ? '–' : (+x).toFixed(n);
const med = a => a.length ? L.quant(a, 0.5) : NaN;

const out = { n: N, patch, rows: [] };
console.log('| diff | player | floor 1 s · size · big@s | floor 2 | floor 3 | floor 4 | falls/min (unl.) | fireflies/min | real hearts: falls/run · survival s · floors |');
console.log('|---|---|---|---|---|---|---|---|---|');
for (const d of ['easy', 'normal', 'hard']) {
  const PH = L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {}));
  for (const [p, a] of PLAYERS) {
    const fl = [[], [], [], []], sz = [[], [], [], []], bg = [[], [], [], []];
    let falls = 0, mins = 0, ff = 0;
    for (let s = 0; s < N; s++) {
      const m = L.runRound(PH, { diff: d, seed: 3000 + s, player: p, arg: a, maxT: 600, unlimited: true });
      for (const lv of m.levelT) if (lv.level < 4) { fl[lv.level].push(lv.dt); sz[lv.level].push(lv.size); if (lv.bigAt !== null) bg[lv.level].push(lv.bigAt); }
      falls += m.falls.length; mins += m.time / 60; ff += m.fireflies;
    }
    const real = [], surv = [], floors = [];
    for (let s = 0; s < N; s++) {
      const m = L.runRound(PH, { diff: d, seed: 6000 + s, player: p, arg: a, maxT: 900 });
      real.push(m.falls.length); surv.push(m.time); floors.push(m.levels);
    }
    const cell = z => fl[z].length ? `${f(med(fl[z]))} · ${f(med(sz[z]), 2)} · ${bg[z].length ? f(med(bg[z])) : '–'}${fl[z].length < N ? ` (${fl[z].length}/${N})` : ''}` : '–';
    const row = { diff: d, player: p + (a || ''), floorS: fl.map(med), size: sz.map(med), bigAt: bg.map(med), fallsPerMin: falls / mins,
      fireflyPerMin: ff / mins, realFalls: med(real), survival: med(surv), floors: med(floors), survivedCap: surv.filter(t => t >= 899).length };
    out.rows.push(row);
    console.log(`| ${d} | ${row.player} | ${cell(0)} | ${cell(1)} | ${cell(2)} | ${cell(3)} | ${f(row.fallsPerMin, 2)} | ${f(row.fireflyPerMin)} | ${f(row.realFalls, 1)} · ${f(row.survival)}${row.survivedCap * 2 >= N ? '+' : ''} · ${f(row.floors)} |`);
  }
}
fs.mkdirSync(__dirname + '/out', { recursive: true });
fs.writeFileSync(__dirname + '/out/pacing.json', JSON.stringify(out, null, 1));
