// Ember's Glow Castle — high-speed playtest harness (headless, node).
// Runs whole games of EG.World with a "player" (the stock EG.Bot or the human-like models in players.js)
// at a fixed frame dt and records pacing / pressure / exploit metrics from the event stream.
'use strict';
const path = require('path');
const { load } = require(path.join(__dirname, '..', 'unit', 'load.js'));

/** Fresh EG namespace with CONFIG overrides deep-merged in (arrays are replaced). */
function makeEG(overrides) {
  const EG = load();
  if (overrides) merge(EG.CONFIG, overrides);
  return EG;
}
function merge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
    else dst[k] = JSON.parse(JSON.stringify(v));
  }
}

/** Invariant checks (cheap): grid matches stacks, no NaN positions, no item above the overflow row. */
function checkInvariants(w) {
  const errs = [];
  for (let c = 0; c < w.cols; c++) {
    const s = w._stacks[c];
    if (s.length > w.rows + 1) errs.push('stack ' + c + ' height ' + s.length);
    for (let r = 0; r < s.length; r++) {
      const it = s[r];
      if (!it._rm && (it.row !== r || it.col !== c)) errs.push('row/col mismatch at ' + c + ',' + r);
      if (!isFinite(it.x) || !isFinite(it.y)) errs.push('NaN pos');
    }
  }
  if (!isFinite(w.score)) errs.push('NaN score');
  if (w.items.length > 200) errs.push('item leak ' + w.items.length);
  return errs;
}

/**
 * Play one game. player: { step(dt, world, t) } (called before world.update each frame).
 * opts: { diff, seed, maxTime (s), dt, width, height, overrides(EG) }
 */
function runGame(EG, player, opts) {
  const dt = opts.dt || 1 / 60, maxTime = opts.maxTime || 900;
  const w = new EG.World({ seed: opts.seed, difficulty: opts.diff, width: opts.width || 960, height: opts.height || 540 });
  if (player.attach) player.attach(w);
  const m = {
    diff: opts.diff, seed: opts.seed, over: false, time: 0, drops: 0, score: 0, level: 0,
    firstMergeT: null, firstMergeDrop: null, firstCandleT: null, firstCandleDrop: null,
    levelT: [], levelDrop: [], boos: 0, booCarry: { pumpkin: 0, 1: 0, 2: 0, 3: 0 }, booFlyBy: 0,
    rises: 0, wakes: 0, wakesRisen: 0, pumpkinDrops: 0, refused: 0, merges: 0, maxCombo: 0, maxTier: 0,
    invariant: [], stuck: false, overT: null, scoreAt3min: null, levelAt3min: null, overBefore3min: false,
    scoreByLevel: [], dropsAt3min: null
  };
  let t = 0, busySince = -1;
  const risenIds = new Set();
  let booCarriedThisVisit = 0, inVisit = false;
  while (t < maxTime) {
    player.step(dt, w, t);
    w.update(dt);
    t += dt;
    const ev = w.drainEvents();
    for (const e of ev) {
      switch (e.type) {
        case 'drop': m.drops++; busySince = -1; break;
        case 'merge':
          m.merges++;
          if (m.firstMergeT === null) { m.firstMergeT = t; m.firstMergeDrop = m.drops; }
          if (e.tier >= 5 && m.firstCandleT === null) { m.firstCandleT = t; m.firstCandleDrop = m.drops; }
          if (e.tier > m.maxTier) m.maxTier = e.tier;
          break;
        case 'levelUp': m.levelT.push(t); m.levelDrop.push(m.drops); m.scoreByLevel.push(w.score); break;
        case 'helper': m.boos++; if (inVisit && booCarriedThisVisit === 0) m.booFlyBy++; inVisit = true; booCarriedThisVisit = 0; break;
        case 'helperCarry': booCarriedThisVisit++; m.booCarry[e.item.kind === 'pumpkin' ? 'pumpkin' : e.item.tier]++; break;
        case 'helperDone': if (booCarriedThisVisit === 0) m.booFlyBy++; inVisit = false; break;
        case 'rise': m.rises++; risenIds.add(e.item.id); break;
        case 'pumpkinWake': m.wakes++; if (risenIds.has(e.item.id)) m.wakesRisen++; break;
        case 'pumpkinDrop': m.pumpkinDrops++; break;
        case 'refuse': m.refused++; break;
        case 'gameOver': m.over = true; m.overT = t; break;
      }
    }
    if (m.scoreAt3min === null && t >= 180) { m.scoreAt3min = w.score; m.levelAt3min = w.level; m.dropsAt3min = m.drops; }
    if (w.combo > m.maxCombo) m.maxCombo = w.combo;
    if (m.over) break;
    // stuck detector: the board stays busy (one drop's resolution never ends) for > 20 s
    if (w.isBusy()) { if (busySince < 0) busySince = t; else if (t - busySince > 20) { m.stuck = true; m.invariant.push('stuck busy phase=' + w.phase); break; } }
    else busySince = -1;
    if (((t / dt) | 0) % 120 === 0) { const errs = checkInvariants(w); if (errs.length) { m.invariant.push(...errs); break; } }
  }
  if (m.over && m.overT < 180) m.overBefore3min = true;
  if (m.scoreAt3min === null) { m.scoreAt3min = w.score; m.levelAt3min = w.level; m.dropsAt3min = m.drops; }
  m.time = t; m.score = w.score; m.level = w.level; m.refusedWorld = w.stats.refused;
  m.dropsPerMin = m.drops / (t / 60);
  if (player.stats) m.player = player.stats;
  return m;
}

// ---------------------------------------------------------------- stats helpers
function q(arr, p) { if (!arr.length) return NaN; const a = arr.slice().sort((x, y) => x - y); const i = (a.length - 1) * p; const lo = Math.floor(i), hi = Math.ceil(i); return a[lo] + (a[hi] - a[lo]) * (i - lo); }
function mean(a) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN; }
function f(x, d) { return x === null || x === undefined || isNaN(x) ? '–' : (+x).toFixed(d === undefined ? 0 : d); }
function pct(n, d) { return d ? Math.round(100 * n / d) + '%' : '–'; }

/** Summarise a list of game metrics. */
function summarise(ms, maxTime) {
  const n = ms.length;
  const surv = ms.map(m => m.time);
  const lvT = k => ms.filter(m => m.levelT.length > k).map(m => m.levelT[k] - (k ? m.levelT[k - 1] : 0));
  const lvD = k => ms.filter(m => m.levelDrop.length > k).map(m => m.levelDrop[k] - (k ? m.levelDrop[k - 1] : 0));
  const sum = (key) => ms.reduce((s, m) => s + m[key], 0);
  const bc = { pumpkin: 0, 1: 0, 2: 0, 3: 0 };
  for (const m of ms) for (const k in bc) bc[k] += m.booCarry[k];
  return {
    n,
    overs: ms.filter(m => m.over).length,
    over3: ms.filter(m => m.overBefore3min).length,
    survMed: q(surv, 0.5), survP10: q(surv, 0.1), survP90: q(surv, 0.9),
    dropsMed: q(ms.map(m => m.drops), 0.5), dropsP10: q(ms.map(m => m.drops), 0.1), dropsP90: q(ms.map(m => m.drops), 0.9),
    dpm: mean(ms.map(m => m.dropsPerMin)),
    scoreMed: q(ms.map(m => m.score), 0.5), scoreP10: q(ms.map(m => m.score), 0.1), scoreP90: q(ms.map(m => m.score), 0.9),
    firstMergeT: q(ms.filter(m => m.firstMergeT !== null).map(m => m.firstMergeT), 0.5),
    firstMergeDrop: q(ms.filter(m => m.firstMergeDrop !== null).map(m => m.firstMergeDrop), 0.5),
    firstCandleT: q(ms.filter(m => m.firstCandleT !== null).map(m => m.firstCandleT), 0.5),
    firstCandleDrop: q(ms.filter(m => m.firstCandleDrop !== null).map(m => m.firstCandleDrop), 0.5),
    reach: [1, 2, 3, 4, 5, 8].map(k => ms.filter(m => m.levelT.length >= k).length),
    lvT: [0, 1, 2, 3].map(k => { const a = lvT(k); return { med: q(a, 0.5), n: a.length }; }),
    lvD: [0, 1, 2, 3].map(k => { const a = lvD(k); return { med: q(a, 0.5), n: a.length }; }),
    finalLevelMed: q(ms.map(m => m.level), 0.5),
    levelAt3: q(ms.map(m => m.levelAt3min), 0.5),
    boosPerMin: sum('boos') / (sum('time') / 60), boosPerGame: sum('boos') / n, booCarry: bc, booFlyBy: sum('booFlyBy'),
    rises: sum('rises'), wakes: sum('wakes'), wakesRisen: sum('wakesRisen'), pumpkinDrops: sum('pumpkinDrops'),
    refusedPerGame: sum('refused') / n,
    invariant: ms.filter(m => m.invariant.length).map(m => m.seed + ':' + m.invariant[0]),
    stuck: ms.filter(m => m.stuck).length,
    maxComboMed: q(ms.map(m => m.maxCombo), 0.5),
    maxTime
  };
}

module.exports = { makeEG, runGame, summarise, q, mean, f, pct, checkInvariants };
