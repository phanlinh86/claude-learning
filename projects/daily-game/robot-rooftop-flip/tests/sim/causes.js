// What causes the kid model's bumps/falls on Easy? Each hit is tagged with the kid's last tap reason (if it was
// < 1.5 s ago) and the hazard kind.   node tests/sim/causes.js [--proposal] [seeds=150]
'use strict';
const L = require('./lib');
const P = require('./players');
const prop = process.argv.includes('--proposal'), N = +(process.argv.filter(a => /^\d+$/.test(a))[0] || 150);
const RF = L.makeRF(prop ? { overrides: require('./proposal-config.json').overrides } : {});
const by = {}, kind = {}; let n = 0;
for (let s = 1; s <= N; s++) {
  const p = P.kidPlayer(RF, s), w = new RF.World({ seed: s, difficulty: 'easy' }); let t = 0;
  while (t < 200 && w.phase === 'run') {
    p.step(1 / 60, w, t); w.update(1 / 60); t += 1 / 60;
    for (const e of w.drainEvents()) if (e.type === 'bump' || e.type === 'fall') {
      n++; const ago = w.time - (p.stats.lastT === undefined ? -9 : p.stats.lastT);
      const why = ago < 1.5 ? ({ planned: 'own planned tap, too late', forgot: 'forgot to tap', random: 'random tap', doubles: 'double tap (flip-back)', misread: 'misread a hazard on the other surface', chases: 'chased fireflies' })[p.stats.lastWhy] || '?' : 'no tap in the last 1.5 s (late notice / distraction)';
      by[why] = (by[why] || 0) + 1; const k = e.type === 'fall' ? 'gap' : e.ob.kind; kind[k] = (kind[k] || 0) + 1;
    }
  }
}
console.log('Easy, kid 4–6 (base), ' + N + ' rounds × ≤200 s, ' + (prop ? 'proposal' : 'baseline') + ': ' + n + ' hits');
Object.entries(by).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log('  ' + k.padEnd(52) + (100 * v / n).toFixed(1) + ' %'));
console.log('  by hazard: ' + Object.entries(kind).map(([k, v]) => k + ' ' + (100 * v / n).toFixed(0) + ' %').join(', '));
