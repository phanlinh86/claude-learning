// Finn's Island Fling — quick ablation of the patch pieces (report-only).
//   node tests/sim/tune.js [variantName ...]
'use strict';
const L = require('./lib.js');
const { SRC, DATA, combine, PATCH } = require('./patch.js');
const { variant, play, MODELS, Human, BotPlayer, FixedPull, FlopFarmer, landAt, pullAt, q, mean, pct, f, table, DEG } = L;
const exp = module.exports = {};

const VARIANTS = {
  current: {},
  flutter: combine([SRC.flutter]),
  flopRetry: combine([SRC.flopRetry]),
  ranges: combine([DATA.ranges]),
  easy: combine([SRC.heartEvery, DATA.easy]),
  gullSafe: combine([SRC.gullSafeArc]),
  patch: PATCH,
  easyB: combine([SRC.heartEvery, { DIFF: { easy: { hwK: 1.4, ampK: 0.5, previewK: 1.6, heartEvery: 12 } } }]),
  easyC: combine([SRC.heartEvery, { DIFF: { easy: { hwK: 1.5, ampK: 0.4, previewK: 1.6, heartEvery: 12 } } }]),
  easyD: combine([SRC.heartEvery, { DIFF: { easy: { hwK: 1.4, ampK: 0.5, previewK: 1.6, heartEvery: 15, hearts: 6 } } }]),
  allB: combine([SRC.flutter, SRC.flopRetry, SRC.heartEvery, SRC.gullSafeArc, DATA.ranges, { DIFF: { easy: { hwK: 1.4, ampK: 0.5, previewK: 1.6, heartEvery: 12 }, normal: { heartEvery: 20 }, hard: { heartEvery: 25 } } }])
};

const H = m => (F, w, s) => new Human(F, w, MODELS[m], s);
function runs(FIF, n, o) { const r = []; for (let s = 1; s <= n; s++) r.push(play(FIF, Object.assign({ seed: 100 + s }, o))); return r; }
function landRate(rs, zone) { let a = 0, b = 0; rs.forEach(r => r.shots.forEach(x => { if (zone === undefined || (x.zone === zone && x.level === zone)) { b++; if (x.type === 'land') a++; } })); return a / b; }
function perLevel(rs) { const per = [[], [], [], []]; rs.forEach(r => r.levels.forEach(l => { if (l.level < 4) per[l.level].push(l.t); })); return per.map(a => a.length ? f(mean(a)) : '—').join('/'); }
function bestFixed(FIF, diff, levels) {
  const C = FIF.World.CONFIG, sets = levels.map(l => { const w = new FIF.World({ seed: 77 + l, difficulty: diff, level: l }); const o = []; for (let i = 0; i < 600; i++) { w._newShot(false); o.push(Object.assign({}, w.raft)); } return o; });
  let best = 0;
  for (let a = -10; a <= 70; a += 1) for (let Lp = 0.4; Lp <= C.PULL_MAX + 1e-9; Lp += 0.01) {
    const la = landAt(FIF, pullAt(a * DEG, Lp)); if (la.x < 0) continue;
    let hit = 0, tot = 0; sets.forEach(s => s.forEach(r => { tot++; if (Math.abs(la.x - FIF.World.raftX(r, 0.6 + la.T)) <= r.hw + C.LAND_PAD) hit++; }));
    if (hit / tot > best) best = hit / tot;
  }
  return best;
}

function evaluate(name, patch) {
  const FIF = variant(patch), o = {};
  const k4 = runs(FIF, 300, { diff: 'easy', maxT: 1200, mk: H('kid4') });
  const islands = k4.map(r => r.level + 1);
  o['kid4 easy run'] = f(q(k4.map(r => r.t), 0.5)) + ' s';
  o['kid4 easy islands med / ≥3'] = q(islands, 0.5) + ' / ' + pct(islands.filter(x => x >= 3).length, islands.length);
  o['kid4 easy land (cove)'] = pct(landRate(k4) * 1000, 1000) + ' (' + pct(landRate(k4, 0) * 1000, 1000) + ')';
  o['kid4 easy hearts +/run'] = f(mean(k4.map(r => r.hearts.gained)), 1);
  const k4i = runs(FIF, 60, { diff: 'easy', maxT: 900, immortal: true, mk: H('kid4') });
  o['kid4 easy s/level'] = perLevel(k4i);
  const k6e = runs(FIF, 60, { diff: 'easy', maxT: 900, immortal: true, mk: H('kid6') });
  const k6n = runs(FIF, 60, { diff: 'normal', maxT: 900, immortal: true, mk: H('kid6') });
  o['kid6 easy s/level'] = perLevel(k6e); o['kid6 normal s/level'] = perLevel(k6n);
  const k6r = runs(FIF, 200, { diff: 'easy', maxT: 1200, mk: H('kid6') });
  o['kid6 easy run / islands'] = f(q(k6r.map(r => r.t), 0.5)) + ' s / ' + q(k6r.map(r => r.level + 1), 0.5);
  for (const d of ['easy', 'normal', 'hard']) {
    const a = runs(FIF, 150, { diff: d, maxT: 1200, mk: H('adult') });
    o['adult ' + d + ' run / land / alive@20min'] = f(q(a.map(r => r.t), 0.5)) + ' s / ' + pct(landRate(a) * 1000, 1000) + ' / ' + a.filter(r => !r.over).length;
  }
  const sp = runs(FIF, 150, { diff: 'easy', maxT: 1200, mk: H('spam') });
  o['spam easy land / run'] = pct(landRate(sp) * 1000, 1000) + ' / ' + f(q(sp.map(r => r.t), 0.5)) + ' s';
  o['fixed pull best: easy cove / easy all / normal all'] = [bestFixed(FIF, 'easy', [0]), bestFixed(FIF, 'easy', [0, 1, 2, 3]), bestFixed(FIF, 'normal', [0, 1, 2, 3])].map(x => f(100 * x) + '%').join(' / ');
  const ff = runs(FIF, 6, { diff: 'easy', maxT: 600, mk: (F, w) => new FlopFarmer(F, w) });
  o['flop farmer pts/min'] = f(mean(ff.map(r => r.score / (r.t / 60))), 1);
  // reroll: memorised all-round pull + deliberate flop when the raft is "off"
  const C = FIF.World.CONFIG; let bp = null, br = -1;
  for (let a = 30; a <= 70; a += 2) for (let Lp = 0.8; Lp <= 1.8; Lp += 0.04) { const la = landAt(FIF, pullAt(a * DEG, Lp)); const d = Math.abs(la.x - 10.8); if (br < 0 || d < br) { br = d; bp = pullAt(a * DEG, Lp); } }
  const rr = runs(FIF, 20, { diff: 'normal', maxT: 1200, mk: (F, w) => new FixedPull(F, w, bp, { reroll: 0.8, think: 1.0 }) });
  o['reroll exploit (normal): alive@20min / score med'] = rr.filter(r => !r.over).length + '/20 / ' + f(q(rr.map(r => r.score), 0.5));
  // gull on the leaf arc (hard, lantern)
  const w = new FIF.World({ seed: 5, difficulty: 'hard', level: 3 }); let hitArc = 0;
  for (let i = 0; i < 200; i++) { w._newShot(false); w.update(1.4); w.drainEvents(); if (w.solution && w.predictShot(w.solution.pull, 0).bumps) hitArc++; }
  o['hard lantern: leaf arc hits a gull'] = pct(hitArc, 200);
  return o;
}

if (require.main === module) {
  const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(VARIANTS);
  const res = {};
  for (const n of names) { const t0 = Date.now(); res[n] = evaluate(n, VARIANTS[n]); process.stderr.write(n + ' ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s\n'); }
  const keys = Object.keys(res[names[0]]);
  process.stdout.write(table(['metric', ...names], keys.map(k => [k, ...names.map(n => res[n][k])])));
}
