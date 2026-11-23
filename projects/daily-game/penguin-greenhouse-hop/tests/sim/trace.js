// trace one round: every bounce / fall with positions (debugging the player models)
'use strict';
const L = require('./lib.js');
const PH = L.freshFH();
const [,, player='kid', arg='6', diff='easy', seed='11', maxT='60'] = process.argv;
const w = new PH.World({ seed: +seed, difficulty: diff });
const pl = L.PLAYERS[player](PH, w, +seed, +arg);
let lastIn = 0, log = [];
while (w.time < +maxT && w.phase === 'play') {
  pl.step(1/60); w.update(1/60);
  if (w.input !== lastIn) { log.push(`  ${w.time.toFixed(2)} steer ${w.input} x=${w.hero.x.toFixed(2)} vx=${w.hero.vx.toFixed(2)}`); lastIn = w.input; }
  for (const e of w.drainEvents()) {
    if (e.type === 'bounce' || e.type === 'fall' || e.type === 'big' || e.type === 'levelUp') {
      console.log(log.join('\n')); log = [];
      const ps = w.platforms.filter(p=>p.y>w.hero.y+0.2 && p.y<w.hero.y+3).map(p=>`${p.kind}@${p.x.toFixed(1)},${p.y.toFixed(1)} w${p.w.toFixed(1)}`).join(' ');
      console.log(`${w.time.toFixed(2)} ${e.type} ${e.kind||''} hero x=${w.hero.x.toFixed(2)} y=${w.hero.y.toFixed(2)} size=${w.hero.size.toFixed(2)} cam=${w.camY.toFixed(1)} | above: ${ps}`);
    }
  }
}
