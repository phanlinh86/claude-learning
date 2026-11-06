// Nimbus's Bubble Garden — high-speed playtest harness (headless, node, no deps). Report-only: never edits game/.
// Loads game/js/{rng,world,bot}.js into a fresh vm sandbox (optionally with CONFIG overrides), plays whole games
// with a "player" (NB.Bot or a human-like model from players.js) at a fixed frame dt, and records pacing,
// pressure, scoring and exploit metrics from the event stream.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
const SRC = {};
function src(f) { return SRC[f] || (SRC[f] = fs.readFileSync(path.join(JS, f), 'utf8')); }

/**
 * Fresh NB namespace; overrides are deep-merged into NB.World.CONFIG (arrays of objects merge by index).
 * overrides.__patches (optional): [[find, replace], …] applied to the world.js SOURCE in the sandbox only, to test
 * proposals that need a new CONFIG key (each find string must occur exactly once).
 */
function makeNB(overrides) {
  const sb = { console }; sb.window = sb; vm.createContext(sb);
  overrides = overrides ? JSON.parse(JSON.stringify(overrides)) : null;
  const patches = overrides && overrides.__patches; if (patches) delete overrides.__patches;
  for (const f of ['rng.js', 'world.js', 'bot.js']) {
    let code = src(f);
    if (f === 'world.js' && patches) for (const [a, b] of patches) {
      if (code.split(a).length !== 2) throw new Error('patch not unique: ' + a.slice(0, 60));
      code = code.replace(a, b);
    }
    vm.runInContext(code, sb, { filename: f });
  }
  const NB = sb.NB;
  if (overrides) merge(NB.World.CONFIG, overrides);
  return NB;
}
function merge(dst, s) {
  for (const k of Object.keys(s)) {
    const v = s[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
    else if (Array.isArray(v) && Array.isArray(dst[k]) && v.length && typeof v[0] === 'object' && v[0] !== null) {
      v.forEach((o, i) => { if (o) merge(dst[k][i], o); });
    } else dst[k] = JSON.parse(JSON.stringify(v));
  }
}

const LAYOUTS = { land: [960, 540], port: [560, 1213] };

/**
 * Play one game. player: { attach(w, NB, seed), step(dt, w, t) } (called before world.update every frame).
 * opts: { diff, seed, maxTime, dt, layout:'land'|'port', level }
 */
function runGame(NB, player, opts) {
  const dt = opts.dt || 1 / 60, maxTime = opts.maxTime || 600;
  const [W, H] = LAYOUTS[opts.layout || 'land'];
  const w = new NB.World({ seed: opts.seed, difficulty: opts.diff, width: W, height: H, level: opts.level || 0 });
  if (player.attach) player.attach(w, NB, opts.seed);
  const m = {
    over: false, time: 0, score: 0, levels: 0, firstPopT: null, firstBumpT: null,
    levelT: [],              // [{zone, loop, t, bumps}] for each completed level
    zoneTime: [0, 0, 0, 0], zoneBumps: [0, 0, 0, 0],
    sizeTime: [0, 0, 0, 0, 0, 0], sizeBumps: [0, 0, 0, 0, 0, 0],   // vulnerable exposure by size
    bumps: 0, pops: 0, rainPops: 0, spawns: 0, escaped: 0, showers: 0, showerT: [],
    heroPopsAtBirth: 0,      // popped within 0.6 s of being born (puddle camping signature)
    bumps120: 0, over120: false, firstLevelBumps: 0, firstLevelDone: null, maxCombo: 0,
    nan: 0
  };
  let t = 0, levelStart = 0, levelBumps = 0;
  while (t < maxTime && w.phase === 'play') {
    player.step(dt, w, t);
    const Hh = w.hero;
    if (Hh.invuln <= 0 && Hh.rainT <= 0) m.sizeTime[Hh.size] += dt;
    m.zoneTime[w.zone] += dt;
    const zoneBefore = w.zone, sizeBefore = Hh.size;
    w.update(dt);
    t += dt;
    if (!isFinite(Hh.x) || !isFinite(Hh.y)) m.nan++;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'spawn': m.spawns++; break;
        case 'escape': m.escaped++; break;
        case 'pop':
          if (e.by === 'rain') m.rainPops++;
          else { m.pops++; if (w.time - e.b.born < 0.6) m.heroPopsAtBirth++; }
          if (m.firstPopT === null && e.by === 'hero') m.firstPopT = t;
          break;
        case 'shower': m.showers++; m.showerT.push(t); break;
        case 'bump':
          m.bumps++; levelBumps++; m.zoneBumps[zoneBefore]++; m.sizeBumps[sizeBefore]++;
          if (m.firstBumpT === null) m.firstBumpT = t;
          if (t <= 120) m.bumps120++;
          if (m.firstLevelDone === null) m.firstLevelBumps++;
          break;
        case 'levelUp':
          m.levelT.push({ zone: zoneBefore, loop: Math.floor((w.level - 1) / 4), t: t - levelStart, bumps: levelBumps });
          if (m.firstLevelDone === null) m.firstLevelDone = t;
          levelStart = t; levelBumps = 0; m.levels++;
          break;
        case 'gameOver': m.over = true; if (t <= 120) m.over120 = true; break;
      }
    }
  }
  m.time = t; m.score = w.score; m.maxCombo = w.maxCombo; m.finalLevel = w.level;
  return m;
}

// ------------------------------------------------------------------ stats helpers
function pct(a, p) {
  if (!a.length) return NaN;
  const s = a.slice().sort((x, y) => x - y);
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i);
  return s[lo] + (s[hi] - s[lo]) * (i - lo);
}
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const sum = a => a.reduce((x, y) => x + y, 0);
function f(v, d) { return v === null || v === undefined || Number.isNaN(v) ? '–' : (+v).toFixed(d === undefined ? 1 : d); }

/** Aggregate many games into one row. */
function summarize(games) {
  const T = games.map(g => g.time), S = games.map(g => g.score);
  const fp = games.map(g => g.firstPopT).filter(x => x !== null);
  const zt = [0, 1, 2, 3].map(z => games.flatMap(g => g.levelT.filter(l => l.zone === z && l.loop === 0).map(l => l.t)));
  const ztAll = [0, 1, 2, 3].map(z => games.flatMap(g => g.levelT.filter(l => l.zone === z).map(l => l.t)));
  const zTime = [0, 1, 2, 3].map(z => sum(games.map(g => g.zoneTime[z])));
  const zB = [0, 1, 2, 3].map(z => sum(games.map(g => g.zoneBumps[z])));
  const sT = [1, 2, 3, 4, 5].map(s => sum(games.map(g => g.sizeTime[s])));
  const sB = [1, 2, 3, 4, 5].map(s => sum(games.map(g => g.sizeBumps[s])));
  const totT = sum(T);
  const first = games.map(g => g.firstLevelDone).filter(x => x !== null);
  return {
    n: games.length,
    surv: { p10: pct(T, 0.1), p50: pct(T, 0.5), p90: pct(T, 0.9) },
    overRate: games.filter(g => g.over).length / games.length,
    over120: games.filter(g => g.over120).length / games.length,
    score: { p10: pct(S, 0.1), p50: pct(S, 0.5), p90: pct(S, 0.9) },
    scorePerMin: sum(S) / (totT / 60),
    firstPop: { p50: pct(fp, 0.5), p90: pct(fp, 0.9), never: games.length - fp.length },
    firstLevel: { p10: pct(first, 0.1), p50: pct(first, 0.5), p90: pct(first, 0.9), notDone: games.length - first.length },
    firstLevelBumps: mean(games.map(g => g.firstLevelBumps)),
    levelSec: zt.map(a => ({ n: a.length, p10: pct(a, 0.1), p50: pct(a, 0.5), p90: pct(a, 0.9) })),
    levelSecAll: ztAll.map(a => ({ n: a.length, p50: pct(a, 0.5) })),
    hitsPerMinZone: zTime.map((tt, z) => tt > 0 ? zB[z] / (tt / 60) : NaN),
    hitsPerMin: sum(games.map(g => g.bumps)) / (totT / 60),
    hitsPerVulnMinBySize: sT.map((tt, i) => ({ min: tt / 60, rate: tt > 3 ? sB[i] / (tt / 60) : NaN })),
    sizeShare: sT.map(tt => tt / Math.max(1e-9, sum(sT))),
    showersPerMin: sum(games.map(g => g.showers)) / (totT / 60),
    escapeShare: sum(games.map(g => g.escaped)) / Math.max(1, sum(games.map(g => g.spawns))),
    popsPerMin: sum(games.map(g => g.pops + g.rainPops)) / (totT / 60),
    birthPopShare: sum(games.map(g => g.heroPopsAtBirth)) / Math.max(1, sum(games.map(g => g.pops))),
    levelsMean: mean(games.map(g => g.levels)),
    nan: sum(games.map(g => g.nan))
  };
}

function runMany(NBfactory, playerFactory, opts, seeds) {
  const games = [], NB = NBfactory();
  for (const seed of seeds) {
    games.push(runGame(NB, playerFactory(), Object.assign({}, opts, { seed })));
  }
  return summarize(games);
}

module.exports = { makeNB, merge, runGame, summarize, runMany, pct, mean, sum, f, LAYOUTS };
