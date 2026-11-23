// Puddle's Greenhouse Hop — find long climbs stalls (> 30 s without a new metre) for a player model and dump the
// layout around them (report-only).   node tests/sim/stalls.js [diff=hard] [player=casual] [n=200] [base=5000]
'use strict';
const L = require('./lib.js');
const [, , d = 'hard', p = 'casual', nArg = '200', bArg = '5000'] = process.argv;
const PH = L.freshFH();
for (let s = +bArg; s < +bArg + +nArg; s++) {
  const w = new PH.World({ seed: s, difficulty: d });
  const pl = L.PLAYERS[p](PH, w, s, undefined);
  let stallY = 0, stallT = 0, dumped = false, bounces = {};
  while (w.time < 900 && w.phase === 'play') {
    pl.step(1 / 60); w.update(1 / 60);
    for (const e of w.drainEvents()) if (e.type === 'bounce') bounces[e.p.id] = (bounces[e.p.id] || 0) + 1;
    if (w.maxY >= stallY + 1) { stallY = w.maxY; stallT = w.time; bounces = {}; dumped = false; }
    else if (!dumped && w.time - stallT > 30) {
      dumped = true;
      const near = w.platforms.filter(q => (q.y0 !== undefined ? q.y0 : q.y) > w.hero.y - 3 && (q.y0 !== undefined ? q.y0 : q.y) < w.hero.y + 4)
        .map(q => `${q.kind}#${q.id}${q.path ? '*' : ''} x${(q.xm || q.x).toFixed(1)} y${(q.y0 !== undefined ? q.y0 : q.y).toFixed(1)} w${q.w.toFixed(1)}${q.hr ? ' hr' + q.hr.toFixed(1) : ''} b${bounces[q.id] || 0}`);
      console.log(`seed ${s} t ${w.time.toFixed(0)} maxY ${w.maxY.toFixed(1)} size ${w.hero.size.toFixed(2)} level ${w.level}\n   ` + near.join('\n   '));
    }
  }
}
