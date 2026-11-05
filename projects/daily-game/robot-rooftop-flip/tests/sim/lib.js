// Bolt's Rooftop Flip — high-speed playtest harness (headless, node). Report-only: never edits game/.
// Runs whole games of RF.World with a "player" (RF.Bot or the human-like models in players.js) at a fixed
// frame dt and records pacing / pressure / scoring / exploit metrics from the event stream.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');

/**
 * Fresh RF namespace. opts.worldSrc: a replacement world.js source (to test a patched copy);
 * opts.overrides: CONFIG values deep-merged in ({zones: {0: {speed: 2.8}}} merges arrays by index).
 */
function makeRF(opts) {
  opts = opts || {};
  const sb = { console }; sb.window = sb; vm.createContext(sb);
  for (const f of ['rng.js', 'world.js', 'bot.js']) {
    const src = f === 'world.js' && opts.worldSrc ? opts.worldSrc : fs.readFileSync(path.join(JS, f), 'utf8');
    vm.runInContext(src, sb, { filename: f });
  }
  const RF = sb.RF;
  if (opts.overrides) merge(RF.World.CONFIG, opts.overrides);
  return RF;
}
function merge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
    else dst[k] = JSON.parse(JSON.stringify(v));
  }
}

/**
 * Play one game. player: { attach(w, seed), step(dt, w, t) } (called before world.update every frame).
 * opts: { diff, seed, maxTime (s), dt, width, height, level, trace (record flip step indices) }
 */
function runGame(RF, player, opts) {
  const dt = opts.dt || 1 / 60, maxTime = opts.maxTime || 600;
  const w = new RF.World({ seed: opts.seed, difficulty: opts.diff, width: opts.width || 960, height: opts.height || 540, level: opts.level || 0 });
  if (player.attach) player.attach(w, opts.seed);
  const u = w.layout.unit;
  const m = {
    diff: opts.diff, seed: opts.seed, over: false, time: 0, score: 0, levels: 0,
    firstPointT: null, firstHitT: null, levelT: [], heartsAtFinish: [], hitsByLevel: {}, ptsByLevel: {},
    bumps: 0, falls: 0, caught: 0, wrong: 0, ownMissed: 0, wrongAvoided: 0, flips: 0, taps: 0,
    multCatch: [0, 0, 0, 0, 0, 0], maxMult: 1, maxCombo: 0, comboBreaks: 0, gates: 0,
    nanBad: 0, outOfBounds: 0, maxRescue: 0, stall: 0, finalHash: null
  };
  const seen = new Set();
  let t = 0, lastLevelT = 0, resc = 0, lastDist = 0;
  const origFlip = w.flip.bind(w);
  w.flip = function () { m.taps++; if (opts.trace) opts.trace.push(Math.round(w.time / RF.World.CONFIG.step)); return origFlip(); };
  while (t < maxTime) {
    player.step(dt, w, t);
    w.update(dt);
    t += dt;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'flip': m.flips++; break;
        case 'catch':
          m.caught++; m.multCatch[e.mult]++; m.maxMult = Math.max(m.maxMult, e.mult);
          m.ptsByLevel[w.level] = (m.ptsByLevel[w.level] || 0) + e.points;
          if (m.firstPointT === null) m.firstPointT = t; break;
        case 'wrong': m.wrong++; break;
        case 'comboBreak': m.comboBreaks++; break;
        case 'gate': m.gates++; break;
        case 'bump': case 'fall':
          if (e.type === 'bump') m.bumps++; else m.falls++;
          m.hitsByLevel[w.level] = (m.hitsByLevel[w.level] || 0) + 1;
          if (m.firstHitT === null) m.firstHitT = t; break;
        case 'finish': m.heartsAtFinish.push(null); break;      // batteries left BEFORE the arch's +1 (set below)
        case 'heartGain': { const k = m.heartsAtFinish.length - 1; if (k >= 0 && m.heartsAtFinish[k] === null) m.heartsAtFinish[k] = e.hearts - 1; break; }
        case 'levelUp': m.levels++; m.levelT.push(t - lastLevelT); lastLevelT = t; break;
        case 'gameOver': m.over = true; break;
      }
    }
    for (let k = 0; k < m.heartsAtFinish.length; k++) if (m.heartsAtFinish[k] === null) m.heartsAtFinish[k] = w.maxHearts;  // full: no gain event
    // fireflies that scrolled past Bolt still flying: a missed own-colour one, or a wrong one avoided
    const hx = w.hero.x;
    for (const f of w.fireflies) {
      if (f.state === 'fly' && f.x < hx - 0.6 * u && !seen.has(f.id)) {
        seen.add(f.id);
        if (f.color === w.hero.color) m.ownMissed++; else m.wrongAvoided++;
      } else if (f.state !== 'fly') seen.add(f.id);
    }
    const h = w.hero;
    if (!isFinite(h.x) || !isFinite(h.y) || !isFinite(w.speed) || !isFinite(w.score) || !isFinite(w.cam.x)) m.nanBad++;
    if (h.grounded && (h.y < w.layout.ceilY - 1 || h.y > w.layout.floorY + 1)) m.outOfBounds++;
    if (h.state === 'rescue') { resc += dt; m.maxRescue = Math.max(m.maxRescue, resc); } else resc = 0;
    if (w.phase === 'run' && w.distance <= lastDist) m.stall++;
    lastDist = w.distance;
    if (w.phase === 'over') break;
  }
  m.time = t; m.score = w.score; m.maxCombo = w.maxCombo;
  m.hearts = w.hearts;
  m.finalHash = [w.time.toFixed(6), w.score, w.hearts, w.hero.y.toFixed(4), w.cam.x.toFixed(4), w.stats.flips, w.stats.caught].join('|');
  m.pstats = player.stats ? JSON.parse(JSON.stringify(player.stats)) : null;
  return m;
}

// ---------- stats helpers ----------
function q(arr, p) { if (!arr.length) return NaN; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN; }
function sum(ms, k) { return ms.reduce((a, m) => a + (typeof k === 'function' ? k(m) : m[k]), 0); }
function f(v, d) { return v === null || v === undefined || Number.isNaN(v) ? '—' : (+v).toFixed(d === undefined ? 1 : d); }

/** Summarise a list of game metrics into one row. */
function summarise(ms) {
  const n = ms.length, mins = sum(ms, 'time') / 60;
  const reach = k => 100 * ms.filter(m => m.levels >= k).length / n;
  const lv = [[], [], [], []];
  ms.forEach(m => m.levelT.forEach((x, i) => { if (i < 4) lv[i].push(x); }));
  const fp = ms.map(m => m.firstPointT).filter(x => x !== null);
  const fh = ms.map(m => m.firstHitT === null ? m.time : m.firstHitT);   // censored at the end of the game
  const dawnHearts = ms.filter(m => m.heartsAtFinish.length >= 1).map(m => m.heartsAtFinish[0]);
  const noonHearts = ms.filter(m => m.heartsAtFinish.length >= 2).map(m => m.heartsAtFinish[1]);
  const caught = sum(ms, 'caught'), wrong = sum(ms, 'wrong'), own = caught + sum(ms, 'ownMissed'), bad = wrong + sum(ms, 'wrongAvoided');
  const mc = [0, 0, 0, 0, 0, 0]; ms.forEach(m => m.multCatch.forEach((v, i) => { mc[i] += v; }));
  return {
    n, overPct: 100 * ms.filter(m => m.over).length / n,
    surv10: q(ms.map(m => m.time), 0.1), surv50: q(ms.map(m => m.time), 0.5), surv90: q(ms.map(m => m.time), 0.9),
    score10: q(ms.map(m => m.score), 0.1), score50: q(ms.map(m => m.score), 0.5), score90: q(ms.map(m => m.score), 0.9),
    lv50: q(ms.map(m => m.levels), 0.5), lvMax: Math.max(...ms.map(m => m.levels)),
    reach1: reach(1), reach2: reach(2), reach3: reach(3), reach4: reach(4),
    dawnHearts50: q(dawnHearts, 0.5), noonHearts50: q(noonHearts, 0.5),
    dawnT: q(lv[0], 0.5), noonT: q(lv[1], 0.5), sunsetT: q(lv[2], 0.5), nightT: q(lv[3], 0.5),
    firstPt: q(fp, 0.5), firstHit: q(fh, 0.5), firstHit10: q(fh, 0.1),
    hitsPerMin: (sum(ms, 'bumps') + sum(ms, 'falls')) / mins,
    bumpShare: 100 * sum(ms, 'bumps') / Math.max(1, sum(ms, 'bumps') + sum(ms, 'falls')),
    dawnHits: mean(ms.map(m => m.hitsByLevel[0] || 0)),
    ownRate: 100 * caught / Math.max(1, own), wrongRate: 100 * wrong / Math.max(1, bad),
    purity: 100 * caught / Math.max(1, caught + wrong),
    ptsPerMin: sum(ms, m => m.score) / mins,
    multShare: 100 * (caught - mc[1]) / Math.max(1, caught),
    mult5: 100 * ms.filter(m => m.maxMult >= 5).length / n, maxMult50: q(ms.map(m => m.maxMult), 0.5),
    tapsPerMin: sum(ms, 'taps') / mins, flipsPerMin: sum(ms, 'flips') / mins,
    nanBad: sum(ms, 'nanBad'), oob: sum(ms, 'outOfBounds'), stall: sum(ms, 'stall'), maxRescue: Math.max(...ms.map(m => m.maxRescue))
  };
}

const pct = v => f(v, 0);
const COLS = {
  survival: [
    ['n', 'n', 0], ['over%', 'overPct', 0], ['surv p10/50/90 s', r => f(r.surv10, 0) + '/' + f(r.surv50, 0) + '/' + f(r.surv90, 0)],
    ['score p10/50/90', r => f(r.score10, 0) + '/' + f(r.score50, 0) + '/' + f(r.score90, 0)],
    ['levels p50 (max)', r => f(r.lv50, 0) + ' (' + r.lvMax + ')'],
    ['reach Noon/Sunset/Night/Loop %', r => [r.reach1, r.reach2, r.reach3, r.reach4].map(pct).join('/')],
    ['batt. left at Dawn/Noon arch p50', r => f(r.dawnHearts50, 0) + '/' + f(r.noonHearts50, 0)],
    ['hits/min', 'hitsPerMin', 2], ['Dawn hits', 'dawnHits', 2], ['1st hit p10/p50 s', r => f(r.firstHit10, 0) + '/' + f(r.firstHit, 0)]
  ],
  scoring: [
    ['1st pt s', 'firstPt', 1], ['pts/min', 'ptsPerMin', 0], ['own caught %', 'ownRate', 0], ['wrong hit %', 'wrongRate', 0],
    ['purity %', 'purity', 0], ['catches at ×2+ %', 'multShare', 0], ['reach ×5 % games', 'mult5', 0],
    ['taps/min', 'tapsPerMin', 0], ['flips/min', 'flipsPerMin', 0], ['bump share %', 'bumpShare', 0]
  ],
  pacing: [
    ['Dawn s', 'dawnT', 1], ['Noon s', 'noonT', 1], ['Sunset s', 'sunsetT', 1], ['Night s', 'nightT', 1]
  ],
  health: [['NaN frames', 'nanBad', 0], ['out-of-corridor frames', 'oob', 0], ['stall frames', 'stall', 0], ['longest rescue s', 'maxRescue', 2]]
};
function table(rows, labelHead, cols) {
  const head = '| ' + labelHead + ' | ' + cols.map(c => c[0]).join(' | ') + ' |';
  const sep = '|' + '---|'.repeat(cols.length + 1);
  const body = rows.map(([label, r]) => '| ' + label + ' | ' + cols.map(c => typeof c[1] === 'function' ? c[1](r) : f(r[c[1]], c[2])).join(' | ') + ' |');
  return [head, sep].concat(body).join('\n');
}

module.exports = { makeRF, merge, runGame, summarise, table, COLS, q, mean, f };
