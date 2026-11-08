// Clover's Farm Hop — measures the two CODE follow-ups proposed in docs/reports/playtest.md, by overriding
// behaviour inside this sim process only (game/ is not edited):
//   1. per-difficulty top speed: Easy maxVx 4.5 (the rest of the patch as in patch.json)
//   2. "rescue aim": the trampoline is put under the nearest platform Clover can land on from its throw
//      (instead of under the spot she fell from), so a child who lets go after a fall is caught again.
//   node tests/sim/followups.js
'use strict';
const L = require('./lib.js');
const P = require('./patch.json')['*'];

function withRescueAim(FH) {
  const W = FH.World.prototype, orig = W._fall, C = FH.World.CONFIG;
  W._fall = function () {
    const before = this.platforms.length;
    orig.call(this);
    const mat = this.platforms[this.platforms.length - 1];
    if (this.phase !== 'play' || this.platforms.length < before || !mat || mat.kind !== 'rescue') return;
    // nearest live platform whose top is 1.5–5.5 u above the mat (the throw's apex is 6.2 u)
    let best = null, bd = 1e9;
    for (const p of this.platforms) {
      if (p === mat || p.state !== 'live' || p.kind === 'puff') continue;
      const dy = p.y - mat.y; if (dy < 1.5 || dy > 5.5) continue;
      const px = p.kind === 'cart' ? p.xm : p.x, d = Math.abs(px - this.hero.x);
      if (d < bd) { bd = d; best = px; }
    }
    if (best !== null) { mat.x = mat.prevX = mat.x0 = mat.x1 = mat.xm = Math.max(1.6, Math.min(C.COLW - 1.6, best)); this.hero.x = this.hero.prevX = mat.x; }
  };
  return FH;
}

function rescueProbe(FH, d) {                       // the bot plays, runs off the side once, then lets go
  let resc = 0, fallsAgain = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const w = new FH.World({ seed, difficulty: d }); w.hearts = 1e6;
    const pl = L.PLAYERS.bot(FH, w, seed, 1); let mode = 'play';
    for (let t = 0; t < 400 && mode !== 'done'; t += 1 / 60) {
      if (mode === 'play') pl.step(1 / 60); else if (mode === 'drop') w.steer(w.hero.x < 6 ? -1 : 1); else w.steer(0);
      w.update(1 / 60);
      if (mode === 'play' && w.time > 20 + (seed % 7)) mode = 'drop';
      for (const e of w.drainEvents()) {
        if (mode === 'drop' && e.type === 'rescue') { mode = 'idle'; resc++; }
        else if (mode === 'idle' && e.type === 'bounce' && e.kind !== 'rescue') mode = 'done';
        else if (mode === 'idle' && e.type === 'fall') { fallsAgain++; mode = 'done'; }
      }
    }
  }
  return (fallsAgain / resc);
}

function humans(FH, d, n) {
  const row = [];
  for (const [p, a] of [['kid', 4], ['kid', 5], ['kid', 6], ['casual']]) {
    const s = [], l1 = []; let falls = 0, T = 0, post = 0;
    for (let i = 0; i < n; i++) {
      const m = L.runRound(FH, { diff: d, seed: 5000 + i, player: p, arg: a, maxT: 900 });
      s.push(m.time); l1.push(m.levelT.length ? 1 : 0); falls += m.falls.length; T += m.time; post += m.falls.filter(f => f.postRescue).length;
    }
    row.push(`${p}${a || ''}: surv ${L.quant(s, 0.5).toFixed(0)} s (p10 ${L.quant(s, 0.1).toFixed(0)}), L1 ${(100 * l1.reduce((x, y) => x + y, 0) / n).toFixed(0)} %, ${(falls / T * 60).toFixed(2)} f/min, post-rescue ${(100 * post / Math.max(1, falls)).toFixed(0)} %`);
  }
  return row.join(' | ');
}

const N = 100;
console.log('patch only            easy |', humans(L.freshFH(P), 'easy', N));
console.log('+ Easy maxVx 4.5      easy |', humans(L.freshFH(Object.assign({}, P, { maxVx: 4.5 })), 'easy', N));
console.log('+ 4.5 + rescue aim    easy |', humans(withRescueAim(L.freshFH(Object.assign({}, P, { maxVx: 4.5 }))), 'easy', N));
for (const d of ['easy', 'normal', 'hard']) {
  console.log(`rescue hands-off re-fall ${d}: current ${(100 * rescueProbe(L.freshFH({}), d)).toFixed(0)} %, patch ${(100 * rescueProbe(L.freshFH(P), d)).toFixed(0)} %, patch + rescue aim ${(100 * rescueProbe(withRescueAim(L.freshFH(P)), d)).toFixed(0)} %`);
}
