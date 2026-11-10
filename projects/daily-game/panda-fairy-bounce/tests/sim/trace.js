#!/usr/bin/env node
// Trace one game and describe its longest no-block stretch.
//   node tests/sim/trace.js <model> <diff> <seed> [--patch name] [--cap 900]
'use strict';
const { load } = require('../unit/load');
const { apply } = require('./patch');
const { models } = require('./players');
const [model, diff, seedS] = process.argv.slice(2);
const pi = process.argv.indexOf('--patch'), ci = process.argv.indexOf('--cap');
const MFB = load(); apply(MFB, pi > 0 ? process.argv[pi + 1] : 'none');
const CAP = ci > 0 ? +process.argv[ci + 1] : 900;
const w = new MFB.World({ seed: +seedS, difficulty: diff });
const step = models(MFB)[model](w, +seedS);
let t = 0, nb = 0, best = { len: 0 }, cur = null;
const dt = 1 / 60;
while (w.phase !== 'over' && t < CAP) {
  step(dt); w.update(dt); t += dt;
  const ev = w.drainEvents();
  if (w.phase === 'play') {
    nb += dt;
    if (!cur) cur = { startLeft: w.bricks.filter(k => k.alive).map(k => `${k.kind}@(${k.x.toFixed(2)},${k.y.toFixed(2)})`), start: t, paddle: 0, wall: 0, top: 0, boss: 0, xs: [], ys: [], angles: [] };
    if (w.ball && Math.round(t * 60) % 30 === 0) { cur.xs.push(+w.ball.x.toFixed(1)); cur.ys.push(+w.ball.y.toFixed(1)); }
    for (const e of ev) {
      if (e.type === 'paddle') { cur.paddle++; cur.angles.push(Math.round(Math.atan2(w.ball.vx, w.ball.vy) * 180 / Math.PI) + '@' + e.x.toFixed(1) + '/p' + w.paddle.x.toFixed(1)); }
      if (e.type === 'wall') { cur.wall++; if (e.side === 'top') cur.top++; }
      if (e.type === 'bossHit') cur.boss++;
    }
  }
  if (ev.some(e => e.type === 'brick' || e.type === 'ballLost' || e.type === 'levelClear')) {
    if (cur && nb > best.len) best = Object.assign(cur, { len: nb, end: t, level: w.level,
      left: w.bricks.filter(k => k.alive).map(k => `${k.kind}@(${k.x.toFixed(2)},${k.y.toFixed(2)}) r${k.row}c${k.col}`) });
    nb = 0; cur = null;
  }
}
console.log(JSON.stringify({ startLeft: best.startLeft, len: +best.len.toFixed(1), start: +(best.start || 0).toFixed(1), level: best.level, left: best.left,
  paddleHits: best.paddle, walls: best.wall, ceiling: best.top, bossHits: best.boss,
  angles: (best.angles || []).slice(0, 60).join(','), xs: (best.xs || []).slice(0, 60).join(','), ys: (best.ys || []).slice(0, 60).join(',') }, null, 1));
