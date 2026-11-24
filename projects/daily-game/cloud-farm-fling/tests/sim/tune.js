// Nubi's Farm Fling — quick ablation of the patch pieces (report-only).
//   node tests/sim/tune.js [variantName ...] [--n=K]
'use strict';
const L = require('./lib.js');
const { SRC, DATA, combine, PATCH } = require('./patch.js');
const { variant, play, MODELS, Human, BotPlayer, q, mean, f, table } = L;

const VARIANTS = {
  current: {},
  landings: combine([SRC.landingsPerDiff, DATA.landings]),
  crowSafe: combine([SRC.crowSafeArc]),
  mistCap: combine([SRC.mistCap, DATA.mistCap]),
  rainKeep: combine([DATA.rainKeep]),
  rainKeep55: combine([{ CONFIG: { RAIN_KEEP: 0.55 } }]),
  rainKeep65: combine([{ CONFIG: { RAIN_KEEP: 0.65 } }]),
  patch: PATCH
};
const args = process.argv.slice(2);
const N = +((args.find(a => a.startsWith('--n=')) || '').slice(4)) || 1;
let names = args.filter(a => !a.startsWith('--')); if (!names.length) names = Object.keys(VARIANTS);

const PL = [
  ['kid easy', 'easy', (F, w, s) => new Human(F, w, MODELS.kid, s)],
  ['adult easy', 'easy', (F, w, s) => new Human(F, w, MODELS.adult, s)],
  ['adult normal', 'normal', (F, w, s) => new Human(F, w, MODELS.adult, s)],
  ['adult hard', 'hard', (F, w, s) => new Human(F, w, MODELS.adult, s)],
  ['bot .85 normal', 'normal', (F, w, s) => new BotPlayer(F, w, 0.85, s)],
  ['farmerMax hard', 'hard', (F, w, s) => new Human(F, w, MODELS.farmerMax, s)]
];
const rows = [];
for (const nm of names) {
  const CFF = variant(VARIANTS[nm]);
  for (const [pn, d, mk] of PL) {
    const sizes = [], lv = [], win = [0, 0];
    let land = 0, sh = 0, big = 0, score = 0, T = 0;
    const n = (pn.startsWith('farmer') ? 3 : 8) * N;
    for (let s = 1; s <= n; s++) {
      const r = play(CFF, { seed: 500 + s, diff: d, maxT: pn.startsWith('farmer') ? 900 : 480, immortal: true, mk,
        hook: (w, e) => { if (e.type === 'land') sizes.push(e.size); } });
      const a = r.shots.filter(x => x.type !== 'flop'); sh += a.length; land += a.filter(x => x.type === 'land').length;
      const wz = a.filter(x => x.zone === 3); win[0] += wz.filter(x => x.type === 'land').length; win[1] += wz.length;
      big += r.stats.bigShowers; score += r.score; T += r.t;
      lv.push(...r.levels.map(x => x.t));
    }
    rows.push([nm, pn, f(100 * land / sh) + ' %', win[1] ? f(100 * win[0] / win[1]) + ' %' : '—', f(q(lv, 0.5)) + ' (' + f(q(lv, 0.1)) + '–' + f(q(lv, 0.9)) + ')',
      f(100 * big / Math.max(1, land)) + ' %', f(mean(sizes), 2) + ' / ' + f(q(sizes, 0.9), 2), f(60 * score / T)]);
  }
}
process.stdout.write(table(['variant', 'player', 'land', 'winter land', 's/season med (p10–p90)', 'Big Shower/landing', 'size at landing mean / p90', 'pts/min'], rows));
