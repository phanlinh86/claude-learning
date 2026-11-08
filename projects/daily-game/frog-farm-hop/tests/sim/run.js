// Clover's Farm Hop — high-speed playtest matrix.
//   node tests/sim/run.js [--patch tests/sim/patch.json] [--out tests/sim/out/base.json] [--quick] [--only bots,humans,rates,exploits]
// A patch file is {"*": {"key.path": value}, "easy": {...}, "normal": {...}, "hard": {...}}: the "*" keys apply to
// every difficulty, the named ones only to rounds of that difficulty (so a per-difficulty override such as
// "maxVx" on Easy can be measured before the code supports it). Nothing in game/ is touched.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const quick = args.includes('--quick');
const patch = opt('--patch') ? JSON.parse(fs.readFileSync(opt('--patch'), 'utf8')) : {};
const out = opt('--out', path.join(__dirname, 'out', 'base.json'));
const only = (opt('--only', 'bots,humans,rates,exploits')).split(',');
const DIFFS = ['easy', 'normal', 'hard'];
const N = quick ? 0.2 : 1;

const fhFor = {};
for (const d of DIFFS) fhFor[d] = L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {}));

function seeds(n, base) { const a = []; for (let i = 0; i < Math.max(2, Math.round(n * N)); i++) a.push(base + i); return a; }

function summarise(rounds, maxT) {
  const q = (a, p) => +L.quant(a, p).toFixed(1);
  const surv = rounds.map(r => r.time), score = rounds.map(r => r.score);
  const allFalls = rounds.flatMap(r => r.falls);
  const totalMin = rounds.reduce((s, r) => s + r.time, 0) / 60;
  const lv = rounds.flatMap(r => r.levelT);
  const l1 = rounds.map(r => r.levelT.length ? r.levelT[0].dt : Infinity);
  const byZone = [0, 1, 2, 3].map(z => {
    const ts = lv.filter(x => x.zone === z).map(x => x.dt);
    const zf = allFalls.filter(f => f.zone === z), zt = rounds.reduce((s, r) => s + r.timeByZone[z], 0) / 60;
    const gusts = rounds.reduce((s, r) => s + r.gustsByZone[z], 0);
    return { med: ts.length ? q(ts, 0.5) : null, n: ts.length, fallsPerMin: zt ? +(zf.length / zt).toFixed(2) : null,
      gustFallShare: zf.length ? +(zf.filter(f => f.gust).length / zf.length).toFixed(2) : null,
      gustFallsPerGust: gusts ? +(zf.filter(f => f.gust).length / gusts).toFixed(3) : null, minutes: +zt.toFixed(1) };
  });
  const ff = rounds.map(r => r.firstFly).filter(x => x !== null), fp = rounds.map(r => r.firstPlat).filter(x => x !== null);
  const oracled = allFalls.filter(f => f.avoidable !== undefined);
  return {
    n: rounds.length, maxT,
    survival: { p10: q(surv, 0.1), med: q(surv, 0.5), p90: q(surv, 0.9), censored: rounds.filter(r => !r.over).length },
    score: { p10: q(score, 0.1), med: q(score, 0.5), p90: q(score, 0.9) },
    climb: +(rounds.reduce((s, r) => s + r.maxY, 0) / rounds.reduce((s, r) => s + r.time, 0)).toFixed(2),
    levels: { med: q(rounds.map(r => r.levels), 0.5), p90: q(rounds.map(r => r.levels), 0.9) },
    level1: { reach: +(l1.filter(x => isFinite(x)).length / rounds.length).toFixed(2), med: isFinite(L.quant(l1, 0.5)) ? q(l1, 0.5) : null },
    perLevel: lv.length ? { med: q(lv.map(x => x.dt), 0.5), p10: q(lv.map(x => x.dt), 0.1), p90: q(lv.map(x => x.dt), 0.9), n: lv.length } : null,
    byZone,
    firstPlat: fp.length ? q(fp, 0.5) : null, firstFly: ff.length ? q(ff, 0.5) : null, firstFlyP90: ff.length ? q(ff, 0.9) : null,
    stall: { p90: q(rounds.map(r => r.stall), 0.9), max: q(rounds.map(r => r.stall), 1), over30: rounds.filter(r => r.stall > 30).length },
    fallsPerMin: +(allFalls.length / totalMin).toFixed(2),
    gustFallShare: allFalls.length ? +(allFalls.filter(f => f.gust).length / allFalls.length).toFixed(2) : 0,
    postRescueShare: allFalls.length ? +(allFalls.filter(f => f.postRescue).length / allFalls.length).toFixed(2) : 0,
    springFallShare: allFalls.length ? +(allFalls.filter(f => f.lastSpring).length / allFalls.length).toFixed(2) : 0,
    fallKinds: allFalls.reduce((o, f) => { o[f.lastKind] = (o[f.lastKind] || 0) + 1; return o; }, {}),
    fireflyPerMin: +(rounds.reduce((s, r) => s + r.fireflies, 0) / totalMin).toFixed(1),
    lanternsPerMin: +(rounds.reduce((s, r) => s + r.lanterns, 0) / totalMin).toFixed(2),
    heartsGainedPerMin: +(rounds.reduce((s, r) => s + r.heartsGained, 0) / totalMin).toFixed(2),
    oracle: { checked: oracled.length, doomed: oracled.filter(f => f.doomed).length, unavoidable: oracled.filter(f => !f.avoidable).length },
    unfair: rounds.flatMap(r => r.unfair).slice(0, 12)
  };
}

const res = { patch, quick, groups: {} };
function group(key, diff, player, arg, seedList, o) {
  const t0 = Date.now(), FH = fhFor[diff], rounds = [];
  for (const s of seedList) rounds.push(L.runRound(FH, Object.assign({ diff, seed: s, player, arg }, o)));
  res.groups[key] = Object.assign({ diff, player: rounds[0].player, unlimited: !!o.unlimited }, summarise(rounds, o.maxT));
  const g = res.groups[key];
  console.log(`${key.padEnd(30)} n=${g.n} surv ${g.survival.med}s score ${g.score.med} lvl1 ${g.level1.med}s (${g.level1.reach}) f/min ${g.fallsPerMin} unfair ${g.oracle.unavoidable}/${g.oracle.checked}  ${Date.now() - t0}ms`);
}

for (const d of DIFFS) {
  if (only.includes('bots')) for (const sk of [1, 0.85, 0.7, 0.5, 0.3])
    group(`bots/${d}/bot${sk}`, d, 'bot', sk, seeds(40, 1000), { maxT: 600, oracle: true });
  if (only.includes('humans')) for (const [p, a] of [['kid', 4], ['kid', 5], ['kid', 6], ['casual'], ['lagBot', 0.25]])
    group(`humans/${d}/${p}${a || ''}`, d, p, a, seeds(200, 5000), { maxT: 900, oracle: true });
  if (only.includes('rates')) for (const [p, a] of [['bot', 0.7], ['bot', 0.5], ['kid', 5], ['kid', 6], ['casual']])
    group(`rates/${d}/${p}${a || ''}`, d, p, a, seeds(20, 9000), { maxT: 600, unlimited: true });
  if (only.includes('exploits')) for (const p of ['idle', 'holdLeft', 'holdRight', 'altFast', 'altSlow', 'mash', 'wallHug', 'fallFarm'])
    group(`exploits/${d}/${p}`, d, p, undefined, seeds(50, 7000), { maxT: 600, oracle: false });
}
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(res, null, 1));
console.log('wrote', out);
