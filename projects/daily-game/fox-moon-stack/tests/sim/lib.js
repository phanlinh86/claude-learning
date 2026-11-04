// Juno's Moon Stack — high-speed playtest harness (headless, node). Report-only: never edits game/.
// Runs whole games of MS.World with a "player" (MS.Bot or the human-like models in players.js) at a fixed
// frame dt and records pacing / pressure / exploit metrics from the event stream.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');

/**
 * Fresh MS namespace. opts.worldSrc: a replacement world.js source (to test a patched copy);
 * opts.overrides: CONFIG values deep-merged in (arrays: {planets: {0: {goal: 8}}} merges by index).
 */
function makeMS(opts) {
  opts = opts || {};
  const sb = { console }; sb.window = sb; vm.createContext(sb);
  for (const f of ['rng.js', 'world.js', 'bot.js']) {
    const src = f === 'world.js' && opts.worldSrc ? opts.worldSrc : fs.readFileSync(path.join(JS, f), 'utf8');
    vm.runInContext(src, sb, { filename: f });
  }
  const MS = sb.MS;
  if (opts.overrides) merge(MS.CONFIG, opts.overrides);
  return MS;
}
function merge(dst, src) {
  for (const k of Object.keys(src)) {
    const v = src[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && dst[k] && typeof dst[k] === 'object') merge(dst[k], v);
    else dst[k] = JSON.parse(JSON.stringify(v));
  }
}

/**
 * Play one game. player: { attach(w), step(dt, w, t) } (step is called before world.update each frame).
 * opts: { diff, seed, maxTime (s), dt, width, height, level, stopAtLevel (stop when this many planets are cleared) }
 */
function runGame(MS, player, opts) {
  const dt = opts.dt || 1 / 60, maxTime = opts.maxTime || 600;
  const w = new MS.World({ seed: opts.seed, difficulty: opts.diff, width: opts.width || 960, height: opts.height || 540, level: opts.level || 0 });
  if (player.attach) player.attach(w, opts.seed);
  const m = {
    diff: opts.diff, seed: opts.seed, over: false, time: 0, score: 0, levels: 0,
    firstPointT: null, levelT: [], drops: 0, placed: 0, perfect: 0, edges: 0,
    lossMiss: 0, lossTopple: 0, toppleEvents: 0, toppleCrates: 0, missEdge: 0, missAir: 0,
    coins: 0, maxGrow: 0, maxCombo: 0, waits: [], dropsByLevel: {}, lossByLevel: {}, nanBad: 0,
    bufferedDrops: 0
  };
  let t = 0, spawnT = 0, lastLand = null, lastLevelT = 0;
  while (t < maxTime) {
    player.step(dt, w, t);
    w.update(dt);
    t += dt;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'spawn': spawnT = t; break;
        case 'drop': {
          m.drops++; const wt = t - spawnT; m.waits.push(wt); if (wt < 0.02) m.bufferedDrops++;
          m.dropsByLevel[w.level] = (m.dropsByLevel[w.level] || 0) + 1; break;
        }
        case 'land': lastLand = e; if (m.firstPointT === null && e.perfect !== undefined && w.score > 0) m.firstPointT = t; break;
        case 'perfect': m.perfect++; break;
        case 'edge': m.edges++; break;
        case 'miss': m.lossMiss++; if (lastLand && lastLand.crate === e.crate) m.missEdge++; else m.missAir++;
          m.lossByLevel[w.level] = (m.lossByLevel[w.level] || 0) + 1; break;
        case 'topple': m.toppleEvents++; m.toppleCrates += e.count; m.lossTopple++;
          m.lossByLevel[w.level] = (m.lossByLevel[w.level] || 0) + 1; break;
        case 'coin': m.coins++; break;
        case 'grow': m.maxGrow = Math.max(m.maxGrow, e.grow); break;
        case 'levelUp': m.levels++; m.levelT.push(t - lastLevelT); lastLevelT = t; break;
        case 'gameOver': m.over = true; break;
      }
    }
    if (!isFinite(w.score) || !isFinite(w.tower.sway)) m.nanBad++;
    if (w.phase === 'over') break;
    if (opts.stopAtLevel && m.levels >= opts.stopAtLevel) break;
  }
  m.time = t; m.score = w.score; m.maxCombo = w.maxCombo; m.placed = w.stats.placed;
  m.pstats = player.stats ? JSON.parse(JSON.stringify(player.stats)) : null;
  return m;
}

// ---------- stats helpers ----------
function q(arr, p) { if (!arr.length) return NaN; const s = arr.slice().sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
function mean(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : NaN; }
function f(v, d) { return v === null || v === undefined || Number.isNaN(v) ? '—' : (+v).toFixed(d === undefined ? 1 : d); }

/** Summarise a list of game metrics into one row. */
function summarise(ms) {
  const n = ms.length, drops = ms.reduce((a, m) => a + m.drops, 0) || 1;
  const lvl1 = ms.filter(m => m.levelT.length >= 1).map(m => m.levelT[0]);
  const allLvl = []; ms.forEach(m => m.levelT.forEach(x => allLvl.push(x)));
  const fp = ms.map(m => m.firstPointT).filter(x => x !== null);
  const toppleGames = ms.filter(m => m.toppleEvents > 0).length;
  return {
    n,
    overPct: 100 * ms.filter(m => m.over).length / n,
    surv50: q(ms.map(m => m.time), 0.5), surv10: q(ms.map(m => m.time), 0.1),
    score50: q(ms.map(m => m.score), 0.5), score10: q(ms.map(m => m.score), 0.1), score90: q(ms.map(m => m.score), 0.9),
    lv50: q(ms.map(m => m.levels), 0.5), lvMax: Math.max(...ms.map(m => m.levels)),
    p1Clear: 100 * lvl1.length / n, p1T: q(lvl1, 0.5), lvlT: q(allLvl, 0.5),
    firstPt: q(fp, 0.5),
    perfectPct: 100 * ms.reduce((a, m) => a + m.perfect, 0) / drops,
    missPct: 100 * ms.reduce((a, m) => a + m.lossMiss, 0) / drops,
    topplePer100: 100 * ms.reduce((a, m) => a + m.toppleEvents, 0) / drops,
    toppleGamesPct: 100 * toppleGames / n,
    lossMiss: ms.reduce((a, m) => a + m.lossMiss, 0), lossTopple: ms.reduce((a, m) => a + m.lossTopple, 0),
    grow50: q(ms.map(m => m.maxGrow), 0.5), growMax: Math.max(...ms.map(m => m.maxGrow)),
    coinsPerDrop: ms.reduce((a, m) => a + m.coins, 0) / drops,
    wait50: q([].concat(...ms.map(m => m.waits)), 0.5), wait90: q([].concat(...ms.map(m => m.waits)), 0.9),
    nanBad: ms.reduce((a, m) => a + m.nanBad, 0)
  };
}

const COLS = [
  ['n', 'n', 0], ['over%', 'overPct', 0], ['surv p50 s', 'surv50', 0], ['score p10/50/90', r => f(r.score10, 0) + '/' + f(r.score50, 0) + '/' + f(r.score90, 0)],
  ['planets p50 (max)', r => f(r.lv50, 0) + ' (' + r.lvMax + ')'], ['P1 clear%', 'p1Clear', 0], ['P1 time s', 'p1T', 1], ['planet time p50 s', 'lvlT', 1],
  ['1st pt s', 'firstPt', 1], ['perfect%', 'perfectPct', 0], ['miss%/drop', 'missPct', 1], ['topple/100 drops', 'topplePer100', 2],
  ['games w/ topple%', 'toppleGamesPct', 0], ['hearts lost miss:topple', r => r.lossMiss + ':' + r.lossTopple], ['grow p50 (max)', r => f(r.grow50, 0) + ' (' + r.growMax + ')'],
  ['coins/drop', 'coinsPerDrop', 2], ['wait p50/p90 s', r => f(r.wait50, 2) + '/' + f(r.wait90, 2)]
];
function table(rows, labelHead, cols) {
  cols = cols || COLS;
  const head = '| ' + labelHead + ' | ' + cols.map(c => c[0]).join(' | ') + ' |';
  const sep = '|' + '---|'.repeat(cols.length + 1);
  const body = rows.map(([label, r]) => '| ' + label + ' | ' + cols.map(c => typeof c[1] === 'function' ? c[1](r) : f(r[c[1]], c[2])).join(' | ') + ' |');
  return [head, sep].concat(body).join('\n');
}

module.exports = { makeMS, merge, runGame, summarise, table, COLS, q, mean, f };
