// Puddle's Greenhouse Hop — growth / weight / platform-kind playtest (report-only: never edits game/).
//   node tests/sim/growth.js [nSeeds=24] [--patch file.json] [--only rates,variants,exploits,kinds] [--out file.json]
// Answers the twist questions the generic matrix (run.js) does not:
//  rates    — per player × difficulty (unlimited hearts, 600 s): share of time per size band, time big per floor,
//             falls per minute while SMALL vs while BIG, falls per 100 take-offs by take-off kind (small / big),
//             leaf-flick and basket-nudge stats, score split (metres ×1, metres ×2, fireflies, floor, size bonus).
//  variants — the same players with the weight switched off (steerK 0), growth off (size fixed 1) and size forced
//             to the max all the time: isolates what being big does to falls and pacing.
//  exploits — a casual player who STALLS (bounces in place on the current platform) until she is max size at the
//             start of every floor (stallStart), or only just before a floor ends (stallEnd): does stalling pay?
// Patch file: {"*": {"key.path": v}, "easy": {...}} as run.js.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib.js');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const N = +(args.find(a => /^\d+$/.test(a)) || 24);
const patch = opt('--patch') ? JSON.parse(fs.readFileSync(opt('--patch'), 'utf8')) : {};
const only = opt('--only', 'rates,variants,exploits').split(',');
const outF = opt('--out', path.join(__dirname, 'out', 'growth.json'));
const DIFFS = ['easy', 'normal', 'hard'];
const f = (x, n = 0) => (x === null || x === undefined || Number.isNaN(x) || !isFinite(x)) ? '–' : (+x).toFixed(n);
const med = a => a.length ? L.quant(a, 0.5) : NaN;

function fh(d, extra) { return L.freshFH(Object.assign({}, patch['*'] || {}, patch[d] || {}, extra || {})); }

/** Staller: the casual model, except that while `want(w)` is true it just stays over the platform it last
 *  bounced on (hands toward its centre). Uses only world.steer(). */
function Staller(PH, w, seed, mode) {
  const c = L.Casual(PH, w, seed, { name: 'stall' + mode });
  let lvl = -1, stalling = false;
  return { name: 'stall' + mode, step(dt) {
    const h = w.hero, full = h.size >= w.D.maxSize - 0.005;
    if (mode === 'Start') { if (w.level !== lvl && w.hero.shrinkT <= 0 && w.level > 0) { lvl = w.level; stalling = true; } if (full) stalling = false; }
    else stalling = w.progress > 0.95 && !full;
    if (stalling && h.rescueT <= 0) {
      const p = w.platforms.find(q => q.id === h.lastPlat);
      if (p && p.kind !== 'rescue' && p.kind !== 'ground' && p.kind !== 'basket') {
        const err = p.x - (h.x + h.vx * 0.2);
        w.steer(Math.abs(err) > 0.25 ? Math.sign(err) : 0); return;
      }
    }
    c.step(dt);
  } };
}
const MAKE = Object.assign({}, L.PLAYERS, {
  stallStart: (PH, w, s) => Staller(PH, w, s, 'Start'),
  stallEnd: (PH, w, s) => Staller(PH, w, s, 'End')
});

/** One round with full growth bookkeeping. opts: {diff, seed, player, arg, maxT, unlimited, forceMax} */
function round(PH, o) {
  const C = PH.World.CONFIG, dt = 1 / 60;
  const w = new PH.World({ seed: o.seed, difficulty: o.diff });
  if (o.unlimited) w.hearts = 1e6;
  if (o.forceMax) {                                // size pinned to the difficulty max (growth/shrink disabled)
    const orig = w._stepSize.bind(w);
    w._stepSize = function (d) { orig(d); this.hero.size = this.D.maxSize; this.hero.shrinkT = 0; this._sizeChanged(true); };
  }
  const pl = MAKE[o.player](PH, w, o.seed, o.arg);
  const r = { band: [0, 0, 0, 0, 0, 0, 0], tSmall: 0, tBig: 0, fSmall: 0, fBig: 0, tMax: 0,
    take: {}, fall: {}, floors: [], score: { m1: 0, m2: 0, fly: 0, floor: 0, size: 0 },
    flicks: 0, leafBounces: 0, flickApexOver: 0, basketAtCap: 0, basketBounces: 0, basketAmp: [],
    flickFallAfter: 0, time: 0, over: false, totalScore: 0, levels: 0, firstPoint: null, heavyDoomed: 0 };
  let lastKind = 'ground', lastBig = false, lvlT = 0, lvlScore = 0, bigIn = 0, firstBig = null, lastFlick = false;
  let prevMetre = 0;
  while (w.time < o.maxT) {
    pl.step(dt);
    const sBefore = w.score, bigBefore = w.hero.big;
    w.update(dt);
    const h = w.hero;
    const bi = Math.min(6, Math.max(0, Math.floor((h.size - 1) / 0.1 + 1e-6)));
    r.band[bi] += dt;
    if (h.big) { r.tBig += dt; bigIn += dt; if (firstBig === null && h.shrinkT <= 0) firstBig = w.time - lvlT; } else r.tSmall += dt;
    if (h.size >= w.D.maxSize - 1e-6) r.tMax += dt;
    // score split: metres (by the big flag the world used), fireflies, floor and size bonus from events
    const m = Math.floor(w.maxY); if (m > prevMetre) { if (h.big) r.score.m2 += 2 * (m - prevMetre); else r.score.m1 += (m - prevMetre); prevMetre = m; }
    if (r.firstPoint === null && w.score > 0) r.firstPoint = w.time;
    for (const e of w.drainEvents()) {
      if (e.type === 'bounce') {
        lastKind = e.kind; lastBig = h.big; lastFlick = e.flick > 1.001;
        const k = e.kind + (h.big ? ':big' : ':small');
        r.take[k] = (r.take[k] || 0) + 1;
        if (e.kind === 'leaf') { r.leafBounces++; if (lastFlick) r.flicks++; }
        if (e.kind === 'basket') {
          r.basketBounces++;
          const A = PH.World.basketAmp(e.p); r.basketAmp.push(A / e.p.ampMax);
          if (A >= e.p.ampMax - 1e-3) r.basketAtCap++;
        }
      } else if (e.type === 'firefly') r.score.fly += C.flyPoints;
      else if (e.type === 'levelUp') {
        r.score.floor += e.bonus; r.score.size += e.sizeBonus;
        r.floors.push({ level: e.level - 1, dt: w.time - lvlT, size: e.size, bigFor: bigIn, firstBig, pts: w.score - lvlScore });
        lvlT = w.time; lvlScore = w.score; bigIn = 0; firstBig = null;
      } else if (e.type === 'fall') {
        const k = lastKind + (lastBig ? ':big' : ':small');
        r.fall[k] = (r.fall[k] || 0) + 1;
        if (lastBig) r.fBig++; else r.fSmall++;
        if (lastFlick) r.flickFallAfter++;
        if (o.unlimited) w.hearts = 1e6;
      } else if (e.type === 'gameOver') r.over = true;
    }
    if (w.phase !== 'play') break;
  }
  r.time = w.time; r.totalScore = w.score; r.levels = w.level;
  return r;
}

function agg(rs) {
  const sum = (fn) => rs.reduce((s, r) => s + fn(r), 0);
  const T = sum(r => r.time), take = {}, fall = {};
  for (const r of rs) { for (const k in r.take) take[k] = (take[k] || 0) + r.take[k]; for (const k in r.fall) fall[k] = (fall[k] || 0) + r.fall[k]; }
  const per100 = {};
  for (const k of new Set([...Object.keys(take), ...Object.keys(fall)])) per100[k] = { take: take[k] || 0, falls: fall[k] || 0, per100: take[k] ? 100 * (fall[k] || 0) / take[k] : null };
  const fl = rs.flatMap(r => r.floors);
  const sc = { m1: sum(r => r.score.m1), m2: sum(r => r.score.m2), fly: sum(r => r.score.fly), floor: sum(r => r.score.floor), size: sum(r => r.score.size) };
  const scT = sc.m1 + sc.m2 + sc.fly + sc.floor + sc.size;
  return {
    n: rs.length, minutes: T / 60,
    band: [0, 1, 2, 3, 4, 5, 6].map(i => sum(r => r.band[i]) / T),
    bigShare: sum(r => r.tBig) / T, maxShare: sum(r => r.tMax) / T,
    fpmSmall: sum(r => r.fSmall) / (sum(r => r.tSmall) / 60), fpmBig: sum(r => r.fBig) / (sum(r => r.tBig) / 60),
    fpm: sum(r => r.fSmall + r.fBig) / (T / 60),
    floorS: med(fl.map(x => x.dt)), floor1S: med(rs.map(r => r.floors[0] ? r.floors[0].dt : Infinity)),
    firstBig: med(fl.filter(x => x.firstBig !== null).map(x => x.firstBig)), bigFor: med(fl.map(x => x.bigFor)),
    bigFrac: med(fl.map(x => x.bigFor / x.dt)), endSize: med(fl.map(x => x.size)), ptsPerFloor: med(fl.map(x => x.pts)),
    ptsPerMin: sum(r => r.totalScore) / (T / 60),
    score: { m1: sc.m1 / scT, m2: sc.m2 / scT, fly: sc.fly / scT, floor: sc.floor / scT, size: sc.size / scT },
    kinds: per100,
    flickShare: sum(r => r.flicks) / Math.max(1, sum(r => r.leafBounces)),
    flickFall: sum(r => r.flickFallAfter) / Math.max(1, sum(r => r.flicks)) * 100,
    basketAtCap: sum(r => r.basketAtCap) / Math.max(1, sum(r => r.basketBounces)),
    basketAmpMed: med(rs.flatMap(r => r.basketAmp)),
    firstPoint: med(rs.map(r => r.firstPoint).filter(x => x !== null)),
    survival: med(rs.map(r => r.time)), floors: med(rs.map(r => r.levels)), scoreMed: med(rs.map(r => r.totalScore))
  };
}

const PLAY = [['kid', 5], ['kid', 6], ['casual'], ['bot', 0.3], ['bot', 0.5], ['bot', 0.7], ['bot', 1]];
const res = { n: N, patch, rates: {}, variants: {}, exploits: {} };
const runSet = (PH, d, p, a, extra) => { const rs = []; for (let s = 0; s < N; s++) rs.push(round(PH, Object.assign({ diff: d, seed: 4100 + s, player: p, arg: a, maxT: 600, unlimited: true }, extra))); return agg(rs); };

if (only.includes('rates')) {
  console.log('\n## rates (unlimited hearts, ' + N + ' × 600 s)');
  console.log('| diff | player | s/floor (floor 1) | big after s · big for s (share of floor) | size at floor end | time at max size | falls/min small → big | falls/100 take-offs: pot · shelf · leaf · basket (small / big) | leaf flicks · falls/100 after a flick | basket at amp cap | score split m×1 / m×2 / fly / floor / size | 1st point s |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const d of DIFFS) {
    const PH = fh(d);
    for (const [p, a] of PLAY) {
      const g = runSet(PH, d, p, a); res.rates[`${d}/${p}${a || ''}`] = g;
      const k = (kind) => { const s = g.kinds[kind + ':small'], b = g.kinds[kind + ':big']; return `${s ? f(s.per100, 1) : '–'}/${b ? f(b.per100, 1) : '–'}`; };
      console.log(`| ${d} | ${p}${a || ''} | ${f(g.floorS)} (${f(g.floor1S)}) | ${f(g.firstBig)} · ${f(g.bigFor)} (${f(g.bigFrac * 100)} %) | ${f(g.endSize, 2)} | ${f(g.maxShare * 100)} % | ${f(g.fpmSmall, 2)} → ${f(g.fpmBig, 2)} | ${k('pot')} · ${k('shelf')} · ${k('leaf')} · ${k('basket')} | ${f(g.flickShare * 100)} % · ${f(g.flickFall, 1)} | ${f(g.basketAtCap * 100)} % | ${['m1', 'm2', 'fly', 'floor', 'size'].map(x => f(g.score[x] * 100)).join(' / ')} | ${f(g.firstPoint, 1)} |`);
    }
  }
}
if (only.includes('variants')) {
  console.log('\n## variants: what being big does (unlimited hearts, ' + N + ' × 600 s) — falls/min · s/floor');
  const V = { base: [{}, {}], noWeight: [{ steerK: 0 }, {}], noGrowth: [{ growRate: 0, growPerFirefly: 0 }, {}], alwaysMax: [{}, { forceMax: true }] };
  console.log('| diff | player | ' + Object.keys(V).join(' | ') + ' |');
  console.log('|---|---|' + Object.keys(V).map(() => '---').join('|') + '|');
  for (const d of DIFFS) for (const [p, a] of [['kid', 5], ['kid', 6], ['casual'], ['bot', 0.5]]) {
    const cells = [];
    for (const [vn, [cp, ro]] of Object.entries(V)) {
      const g = runSet(fh(d, cp), d, p, a, ro); res.variants[`${d}/${p}${a || ''}/${vn}`] = g;
      cells.push(`${f(g.fpm, 2)} · ${f(g.floorS)}`);
    }
    console.log(`| ${d} | ${p}${a || ''} | ${cells.join(' | ')} |`);
  }
}
if (only.includes('exploits')) {
  console.log('\n## stalling to grow (unlimited hearts, ' + N + ' × 600 s)');
  console.log('| diff | player | s/floor | pts/floor | pts/min | size at floor end | big share of time | falls/min |');
  console.log('|---|---|---|---|---|---|---|---|');
  for (const d of DIFFS) {
    const PH = fh(d);
    for (const p of ['casual', 'stallStart', 'stallEnd']) {
      const g = runSet(PH, d, p); res.exploits[`${d}/${p}`] = g;
      console.log(`| ${d} | ${p} | ${f(g.floorS)} | ${f(g.ptsPerFloor)} | ${f(g.ptsPerMin)} | ${f(g.endSize, 2)} | ${f(g.bigShare * 100)} % | ${f(g.fpm, 2)} |`);
    }
  }
}
fs.mkdirSync(path.dirname(outF), { recursive: true });
fs.writeFileSync(outF, JSON.stringify(res, null, 1));
console.log('\nwrote', outF);
