#!/usr/bin/env node
// Sweep DIFF.easy variants for the child models (and check skilled players don't get bored).
//   node tests/sim/explore.js [--n 150] [--cap 300]
'use strict';
const { load } = require('../unit/load');
const { models } = require('./players');
function arg(n, d) { const i = process.argv.indexOf('--' + n); return i > 0 ? process.argv[i + 1] : d; }
const N = +arg('n', 150), CAP = +arg('cap', 300);

const VARIANTS = JSON.parse(arg('variants', 'null')) || [
  { name: 'baseline' },
  { name: 'speed 5.2', easy: { ballSpeed: 5.2 } },
  { name: 'speed 4.8', easy: { ballSpeed: 4.8 } },
  { name: 'w 3.6', easy: { paddleW: 3.6 } },
  { name: 'net 4', easy: { netSaves: 4 } },
  { name: 's5.2 w3.6', easy: { ballSpeed: 5.2, paddleW: 3.6 } },
  { name: 's5.2 w3.6 net3', easy: { ballSpeed: 5.2, paddleW: 3.6, netSaves: 3 } },
  { name: 's4.8 w3.8 net3', easy: { ballSpeed: 4.8, paddleW: 3.8, netSaves: 3 } },
  { name: 's5.2 w3.6 net3 +H5', easy: { ballSpeed: 5.2, paddleW: 3.6, netSaves: 3 }, cfg: { HEARTS: 5 } }
];
const WHO = (arg('who', 'kid5,kid4,kid5fast,adult,bot0.5')).split(',');

function run(v, who, seed) {
  const MFB = run.cache[v.name] || (run.cache[v.name] = (() => {
    const M = load(); const C = M.World.CONFIG;
    Object.assign(C.DIFF.easy, v.easy || {}); Object.assign(C, v.cfg || {}); return M;
  })());
  const w = new MFB.World({ seed, difficulty: 'easy' });
  const step = models(MFB)[who](w, seed);
  let t = 0; const dt = 1 / 60;
  while (w.phase !== 'over' && t < CAP) { step(dt); w.update(dt); t += dt; w.events.length = 0; }
  return { t, seasons: w.level, s1: w.stats.seasonTimes[0], st: w.stats.seasonTimes, bricks: w.stats.bricks };
}
run.cache = {};
const q = (a, p) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

console.log(`| variant | ${WHO.map(w => w + ' S1 clear / surv p50 / blocks p50').join(' | ')} | season p50 (adult, bot0.5) |`);
console.log('|---|' + WHO.map(() => '---:').join('|') + '|---:|');
for (const v of VARIANTS) {
  const cells = [], seas = {};
  for (const who of WHO) {
    const rs = []; for (let s = 1; s <= N; s++) rs.push(run(v, who, s * 7919 + 13));
    seas[who] = q([].concat(...rs.map(r => r.st)), 0.5);
    cells.push(`${(100 * rs.filter(r => r.seasons >= 1).length / N).toFixed(0)}% / ${q(rs.map(r => r.t), 0.5).toFixed(0)} s / ${q(rs.map(r => r.bricks), 0.5)}`);
  }
  console.log(`| ${v.name} | ${cells.join(' | ')} | ${seas.adult ? seas.adult.toFixed(0) : '-'}, ${seas['bot0.5'] ? seas['bot0.5'].toFixed(0) : '-'} |`);
}
