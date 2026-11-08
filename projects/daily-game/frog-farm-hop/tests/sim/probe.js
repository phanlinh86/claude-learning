// Clover's Farm Hop — targeted probes of the "could the player have avoided this?" cases.
//   node tests/sim/probe.js [--patch tests/sim/patch.json]
// 1. Spring trap: a casual player climbs; at the first SPRING bounce the hands come off (a kid who did not
//    expect the big boing). Does Clover land on something, or is the fall line already above the spring?
// 2. Rescue with hands off: after a fall the player does nothing. Does the mat's 6.2 u throw land her anywhere?
// 3. Spring with a perfect player: oracle from the spring take-off (could ANY steering have saved her?).
'use strict';
const fs = require('fs');
const L = require('./lib.js');
const args = process.argv.slice(2);
const pi = args.indexOf('--patch');
const patch = pi >= 0 ? JSON.parse(fs.readFileSync(args[pi + 1], 'utf8')) : {};

const res = {};
for (const d of ['easy', 'normal', 'hard']) {
  const FH = L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {}));
  let springs = 0, springFalls = 0, springOracleBad = 0, resc = 0, rescFalls = 0, rescTimes = [];
  for (let seed = 1; seed <= 150; seed++) {
    // --- 1 + 3: spring
    let w = new FH.World({ seed, difficulty: d }); w.hearts = 1e6;
    let pl = L.PLAYERS.bot(FH, w, seed, 1), mode = 'play', snap = null;
    for (let t = 0; t < 400 && mode !== 'done'; t += 1 / 60) {
      if (mode === 'play') pl.step(1 / 60); else w.steer(0);
      w.update(1 / 60);
      for (const e of w.drainEvents()) {
        if (mode === 'play' && e.type === 'bounce' && e.spring) { mode = 'hands-off'; springs++; snap = L.cloneWorld(w); }
        else if (mode === 'hands-off' && e.type === 'bounce') mode = 'done';
        else if (mode === 'hands-off' && e.type === 'fall') { springFalls++; if (!L.oracle(snap, 4).ok) springOracleBad++; mode = 'done'; }
      }
    }
    // --- 2: rescue with hands off (the bot plays, makes one forced miss by letting go, then stays idle)
    w = new FH.World({ seed, difficulty: d }); w.hearts = 1e6;
    pl = L.PLAYERS.bot(FH, w, seed, 1); mode = 'play';
    let tFall = 0;
    for (let t = 0; t < 400 && mode !== 'done'; t += 1 / 60) {
      if (mode === 'play') pl.step(1 / 60);
      else if (mode === 'drop') w.steer(w.hero.x < 6 ? -1 : 1);
      else w.steer(0);
      w.update(1 / 60);
      if (mode === 'play' && w.time > 20 + (seed % 7)) mode = 'drop';
      for (const e of w.drainEvents()) {
        if (mode === 'drop' && e.type === 'rescue') { mode = 'idle'; resc++; tFall = w.time; }
        else if (mode === 'idle' && e.type === 'bounce' && e.kind !== 'rescue') { mode = 'done'; rescTimes.push(w.time - tFall); }
        else if (mode === 'idle' && e.type === 'fall') { rescFalls++; mode = 'done'; }
      }
    }
  }
  res[d] = { springs, springHandsOffFalls: springFalls, springFallRate: +(springFalls / springs).toFixed(2), springUnavoidable: springOracleBad,
    rescues: resc, rescueHandsOffFalls: rescFalls, rescueFallRate: +(rescFalls / resc).toFixed(2), rescueToLandMed: +L.quant(rescTimes, 0.5).toFixed(2) };
  console.log(d, JSON.stringify(res[d]));
}
