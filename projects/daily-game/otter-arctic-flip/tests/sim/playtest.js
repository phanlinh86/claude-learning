// Ollie's Lighthouse Flip — extended high-speed playtest (report-only; never edits game/).
// Adds what run.js does not measure: causes of heart loss (hatch vs prop, floor vs ceiling, per floor), a
// VISION model (the player can only notice a hazard once it is on screen / inside the headlamp beam, plus a
// notice reaction), single-floor runs that split "darkness" from "speed + geometry", portrait vs landscape,
// exploits (spam, ping-pong, stay on one side), combo/score inflation, and CONFIG candidates side by side.
//
//   node tests/sim/playtest.js <section> [--seeds N] [--cfg base,prop]   sections: matrix floors vision layout exploits score all
//   results → tests/sim/results/playtest-<section>.{json,md}
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const L = require('./lib');
const P = require('./players');
const OUT = path.join(__dirname, 'results');

// ---------- CONFIG variants (deep-merged in memory) ----------
const noonClone = { speed: 3.3, alt: 0.6, gapK: 1.0, extraK: 1.1, arc: 0.5, line: 0.8 };   // noon geometry, own light
const CFGS = {
  base: {},
  // dark floors with Greenhouse (noon) speed + geometry: isolates "darkness" from "faster, denser"
  noonDark: { zones: { 2: noonClone, 3: noonClone } },
  me8: { multEvery: 8 },
  me10: { multEvery: 10 },
  see12: { light: { seeExtra: 1.2 } },
  bonus500: { finishBonus: 500 },
  dawnCalm: { zones: { 0: { extraK: 1.5 } } },
  dawnCalmGap: { zones: { 0: { extraK: 1.5, gapK: 1.0 } } },
  dawn14Gap: { zones: { 0: { extraK: 1.4, gapK: 1.0 } } },
  easyHit05: { difficulty: { easy: { hitK: 0.5 } } },
  dawnCalmHit: { zones: { 0: { extraK: 1.5 } }, difficulty: { easy: { hitK: 0.5 } } },
  prop: require('./proposal-config.json').overrides
};
// layout variants (code, not CONFIG): patched in memory on World.computeLayout
const LAYOUTS = {
  base: null,
  heroX15: { portraitHeroX: 0.15 }
};
// combo rule variants (code, not CONFIG): a leaf that scrolls past un-caught costs combo
const COMBOS = { base: null, missQuarter: { keep: 0.75 }, missHalf: { keep: 0.5 }, missReset: { keep: 0 } };

// ---------- vision models ----------
// v0:     the original model (sees 7 u ahead everywhere, even past the right screen edge; no notice delay)
// screen: sees min(7 u, screen reach); notices a hazard one reaction after it appears
// beam:   like screen, but on lamp floors only inside the headlamp beam (world.beamUnits()), + darkReact s
// beacon: like screen on lamp floors too (beacons show everything on screen), + darkReact s
const VISION = {
  v0: {},
  screen: { notice: 1, viewFn: (w, p) => Math.min(p.view, w.screenReachUnits()) },
  beam: { notice: 1, darkReact: 0.15, viewFn: (w, p) => Math.min(p.view, w.lampsOn ? w.beamUnits() : w.screenReachUnits()) },
  beamOnly: { notice: 1, viewFn: (w, p) => Math.min(p.view, w.lampsOn ? w.beamUnits() : w.screenReachUnits()) },
  beacon: { notice: 1, darkReact: 0.15, viewFn: (w, p) => Math.min(p.view, w.screenReachUnits()) }
};
const HUM = {
  kid4: { name: 'kid4', react: [0.8, 1.1], bias: 0.12, errSd: 0.22, forget: 0.08, randomRate: 0.12, misread: 0.10, double: 0.15 },
  kid: {},
  kid6: { name: 'kid6', react: [0.6, 0.8], bias: 0.06, errSd: 0.14, forget: 0.03, randomRate: 0.05, misread: 0.04, double: 0.06 },
  adult: null
};
function makePlayer(OF, key, seed, vis) {
  const v = VISION[vis || 'v0'];
  if (key in HUM) return HUM[key] === null ? P.adultPlayer(OF, seed, v) : P.kidPlayer(OF, seed, Object.assign({}, HUM[key], v));
  const BOTS = { bot1: 1, bot8: 0.8, bot5: 0.5, bot3: 0.3 }; if (key in BOTS) return P.botPlayer(OF, BOTS[key]);
  const s = /^spam(\d+)$/.exec(key); if (s) return P.spamPlayer(OF, seed, +s[1]);
  if (key === 'pingPong') return P.pingPong();
  if (key === 'never') return P.neverTap();
  if (key === 'ceilOnly') return P.oneFlip(1.0);
  throw new Error('player ' + key);
}
const LABEL = { bot1: 'bot 1.0', bot8: 'bot 0.8', bot5: 'bot 0.5', bot3: 'bot 0.3', kid4: 'kid, struggling 4 y', kid: 'kid 4–6 (base)', kid6: 'kid, steady 6 y',
  adult: 'casual adult', spam150: 'spam 150 ms', spam250: 'spam 250 ms', spam400: 'spam 400 ms', spam700: 'spam 700 ms', pingPong: 'flip on every landing', never: 'never taps (floor only)', ceilOnly: 'flip once, stay on ceiling' };

function makeOF(cfgKey, layoutKey, comboKey) {
  const lay = LAYOUTS[layoutKey || 'base'];
  let worldSrc;
  if (lay) {   // a copy of world.js with the portrait hero x changed (in memory only)
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', 'world.js'), 'utf8');
    if (!src.includes('heroX: portrait ? 0.22 * w')) throw new Error('layout patch target moved');
    worldSrc = src.replace('heroX: portrait ? 0.22 * w', 'heroX: portrait ? ' + lay.portraitHeroX + ' * w');
  }
  const OF = L.makeRF({ overrides: CFGS[cfgKey], worldSrc });
  const cb = COMBOS[comboKey || 'base'];
  if (cb) OF._missKeep = cb.keep;
  return OF;
}

// ---------- one round with full instrumentation ----------
function play(OF, job, seed) {
  const dt = 1 / 60, maxTime = job.time;
  const w = new OF.World({ seed, difficulty: job.diff, width: job.W || 960, height: job.H || 540, level: job.level || 0 });
  const player = makePlayer(OF, job.who, seed, job.vis); if (player.attach) player.attach(w, seed);
  const u = w.layout.unit, startLevel = w.level;
  const m = { seed, time: 0, score: 0, over: false, levels: 0, levelT: [], hits: [], firstLeaf: null, caught: 0, missed: 0,
    multPts: [0, 0, 0, 0, 0, 0], t5: null, taps: 0, maxCombo: 0, floorDone: false, breaks: 0, lostCombo: 0 };
  let lastFallSide = null;
  const origFall = w._fall; w._fall = function (side) { lastFallSide = side; return origFall.call(this, side); };
  const origFlip = w.flip.bind(w); w.flip = function () { m.taps++; return origFlip(); };
  const seen = new Set();
  let t = 0, lastLv = 0;
  while (t < maxTime) {
    player.step(dt, w, t); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'catch') { m.caught++; m.multPts[e.mult] += e.points; if (m.firstLeaf === null) m.firstLeaf = t; if (e.mult >= 5 && m.t5 === null) m.t5 = t; }
      else if (e.type === 'bump') m.hits.push({ k: 'prop', pk: e.ob.kind, side: e.ob.side, lv: w.level, dark: w.lampsOn, t });
      else if (e.type === 'fall') m.hits.push({ k: 'hatch', side: lastFallSide || w.hero.side, lv: w.level, dark: w.lampsOn, t });
      else if (e.type === 'comboBreak') { m.breaks++; m.lostCombo += e.combo - e.to; }
      else if (e.type === 'levelUp') { m.levels++; m.levelT.push(t - lastLv); lastLv = t; if (job.oneFloor) { m.floorDone = true; } }
      else if (e.type === 'gameOver') m.over = true;
    }
    // missed leaves (+ the optional "a missed leaf costs combo" rule)
    const hx = w.hero.x;
    for (const f of w.leaves) {
      if (f.state === 'fly' && f.x < hx - 0.6 * u && !seen.has(f.id)) {
        seen.add(f.id); m.missed++;
        if (OF._missKeep !== undefined && w.combo > 0) { w.combo = Math.floor(w.combo * OF._missKeep); w.mult = Math.min(OF.World.CONFIG.multMax, 1 + Math.floor(w.combo / OF.World.CONFIG.multEvery)); }
      } else if (f.state !== 'fly') seen.add(f.id);
    }
    if (w.phase === 'over' || m.floorDone) break;
  }
  m.time = t; m.score = w.score; m.maxCombo = w.maxCombo; m.hearts = w.hearts; m.startLevel = startLevel;
  return m;
}

// ---------- worker pool ----------
if (!isMainThread) {
  const cache = {};
  parentPort.on('message', job => {
    if (job === 'exit') process.exit(0);
    const k = job.cfg + '|' + (job.layout || '') + '|' + (job.combo || '');
    const OF = cache[k] || (cache[k] = makeOF(job.cfg, job.layout, job.combo));
    parentPort.postMessage({ id: job.id, out: job.seeds.map(s => play(OF, job, s)) });
  });
  return;
}
function pool(jobs) {
  const n = Math.max(1, Math.min(os.cpus().length, 8)), res = jobs.map(() => []), queue = [];
  jobs.forEach((j, i) => { for (let a = 0; a < j.seeds.length; a += 10) queue.push(Object.assign({}, j, { id: i, seeds: j.seeds.slice(a, a + 10) })); });
  const total = queue.length; let done = 0;
  return new Promise(resolve => {
    const ws = [];
    for (let k = 0; k < n; k++) {
      const w = new Worker(__filename); ws.push(w);
      const next = () => { const j = queue.shift(); if (j) w.postMessage(j); };
      w.on('message', msg => {
        res[msg.id].push(...msg.out); done++;
        if (done % 10 === 0) process.stderr.write('\r  ' + done + '/' + total);
        if (done === total) { ws.forEach(x => x.postMessage('exit')); process.stderr.write('\n'); resolve(res); } else next();
      });
      next();
    }
  });
}

// ---------- summaries ----------
const q = L.q, f = L.f;
function sumUp(ms) {
  const n = ms.length, mins = ms.reduce((a, m) => a + m.time, 0) / 60, hits = [].concat(...ms.map(m => m.hits));
  const caught = ms.reduce((a, m) => a + m.caught, 0), missed = ms.reduce((a, m) => a + m.missed, 0);
  const pts = ms.reduce((a, m) => a + m.score, 0), mp = [0, 1, 2, 3, 4, 5].map(i => ms.reduce((a, m) => a + m.multPts[i], 0));
  const leafPts = mp.reduce((a, b) => a + b, 0);
  const lv = [0, 1, 2, 3].map(i => ms.filter(m => m.levelT.length > i).map(m => m.levelT[i]));
  const share = pred => hits.length ? 100 * hits.filter(pred).length / hits.length : NaN;
  return {
    n, overPct: 100 * ms.filter(m => m.over).length / n,
    surv: [0.1, 0.5, 0.9].map(p => q(ms.map(m => m.time), p)), score: [0.1, 0.5, 0.9].map(p => q(ms.map(m => m.score), p)),
    reach: [1, 2, 3, 4].map(k => 100 * ms.filter(m => m.levels >= k).length / n),
    lvT: lv.map(a => [q(a, 0.1), q(a, 0.5), q(a, 0.9)]),
    firstLeaf: [0.5, 0.9].map(p => q(ms.map(m => m.firstLeaf === null ? Infinity : m.firstLeaf), p)),
    t5: q(ms.map(m => m.t5 === null ? Infinity : m.t5), 0.5), reach5: 100 * ms.filter(m => m.t5 !== null).length / n,
    hpm: hits.length / mins, ptsMin: pts / mins, catchPct: 100 * caught / Math.max(1, caught + missed),
    x5share: 100 * mp[5] / Math.max(1, leafPts), leafShare: 100 * leafPts / Math.max(1, pts),
    hatchPct: share(h => h.k === 'hatch'), propPct: share(h => h.k === 'prop'),
    floorSidePct: share(h => h.side === 'floor'), ceilSidePct: share(h => h.side === 'ceil'),
    hatchFloor: share(h => h.k === 'hatch' && h.side === 'floor'), hatchCeil: share(h => h.k === 'hatch' && h.side === 'ceil'),
    propFloor: share(h => h.k === 'prop' && h.side === 'floor'), propCeil: share(h => h.k === 'prop' && h.side === 'ceil'),
    hitsByFloor: [0, 1, 2, 3].map(z => hits.filter(h => h.lv % 4 === z).length), tapsMin: ms.reduce((a, m) => a + m.taps, 0) / mins,
    floorClear: 100 * ms.filter(m => m.floorDone).length / n, floorHeartsLost: L.mean(ms.map(m => m.hits.length)),
    mins
  };
}
const t3 = a => a.map(x => f(x, 0)).join('/');
const tbl = (head, rows) => ['| ' + head.join(' | ') + ' |', '|' + head.map(() => '---|').join(''), ...rows.map(r => '| ' + r.join(' | ') + ' |')].join('\n');

// ---------- sections ----------
const SEC = {};
const OFF = (() => { const i = process.argv.indexOf('--off'); return i >= 0 ? +process.argv[i + 1] : 0; })();
const seedsOf = (n, off) => Array.from({ length: n }, (_, i) => i + 1 + (off === undefined ? OFF : off));
const DIFFS = ['easy', 'normal', 'hard'];

/** Whole games: bots × humans × difficulties (600 s cap). Survival, score, first leaf, floor time, causes. */
SEC.matrix = async (N, cfgs) => {
  const who = ['bot1', 'bot8', 'bot5', 'bot3', 'kid4', 'kid', 'kid6', 'adult', 'spam250'];
  const jobs = []; for (const cfg of cfgs) for (const d of DIFFS) for (const p of who) jobs.push({ cfg, diff: d, who: p, vis: 'screen', seeds: seedsOf(N), time: 600 });
  const res = await pool(jobs), R = jobs.map((j, i) => Object.assign({ j }, { s: sumUp(res[i]) }));
  const md = ['# Matrix — whole games (vision "screen", 960×540, ' + N + ' rounds × ≤600 s per row)', ''];
  for (const cfg of cfgs) {
    md.push('## cfg ' + cfg, '', tbl(['diff · player', 'over %', 'surv p10/50/90 s', 'score p10/50/90', 'clear floor 1/2/3/4 %', 'floor s p50 1/2/3/4', 'hits/min', '1st leaf p50/p90 s', 'pts/min', 'catch %', '×5 reached % · p50 s', 'leaf pts at ×5 %'],
      R.filter(r => r.j.cfg === cfg).map(({ j, s }) => [j.diff + ' · ' + LABEL[j.who], f(s.overPct, 0), t3(s.surv), t3(s.score), t3(s.reach), s.lvT.map(a => f(a[1], 0)).join('/'), f(s.hpm, 2),
        f(s.firstLeaf[0], 1) + '/' + f(s.firstLeaf[1], 1), f(s.ptsMin, 0), f(s.catchPct, 0), f(s.reach5, 0) + ' · ' + f(s.t5, 0), f(s.x5share, 0)])), '');
    md.push('### heart-loss causes (share of all hits)', '', tbl(['diff · player', 'hits', 'hatch %', 'prop %', 'on floor %', 'on ceiling %', 'hatch floor/ceil %', 'prop floor/ceil %', 'hits on floor 1/2/3/4'],
      R.filter(r => r.j.cfg === cfg && !/^bot1$/.test(r.j.who)).map(({ j, s }) => [j.diff + ' · ' + LABEL[j.who], s.hitsByFloor.reduce((a, b) => a + b, 0), f(s.hatchPct, 0), f(s.propPct, 0), f(s.floorSidePct, 0), f(s.ceilSidePct, 0),
        f(s.hatchFloor, 0) + '/' + f(s.hatchCeil, 0), f(s.propFloor, 0) + '/' + f(s.propCeil, 0), s.hitsByFloor.join('/')])), '');
  }
  return { R: R.map(r => ({ j: r.j, s: r.s })), md: md.join('\n') };
};

/** One floor at a time (start ON that floor, full hearts): hits/min per floor, split darkness vs speed/geometry. */
SEC.floors = async (N) => {
  const who = ['kid4', 'kid', 'kid6', 'adult'], jobs = [];
  for (const d of DIFFS) for (const p of who) for (const lv of [0, 1, 2, 3]) for (const vis of ['screen', 'beam']) for (const cfg of (lv >= 2 ? ['base', 'noonDark'] : ['base']))
    jobs.push({ cfg, diff: d, who: p, vis, level: lv, oneFloor: true, seeds: seedsOf(N), time: 120 });
  const res = await pool(jobs), R = jobs.map((j, i) => ({ j, s: sumUp(res[i]) }));
  const get = (d, p, lv, vis, cfg) => R.find(r => r.j.diff === d && r.j.who === p && r.j.level === lv && r.j.vis === vis && r.j.cfg === cfg).s;
  const md = ['# Single floors — start on the floor with full hearts, ' + N + ' rounds each, 960×540', '',
    'hits/min on that floor. "screen" = sees everything on screen (daylight, or beacons in the dark); "beam" = on lamp floors only inside the headlamp beam (world.beamUnits()) and +0.15 s to notice. "noon geometry" = Sunset/Night with the Greenhouse\'s speed, alt, gapK, extraK (own light).', ''];
  for (const d of DIFFS) {
    md.push('## ' + d, '', tbl(['player', 'Boot Room', 'Greenhouse', 'Map Library: own · beam', 'Map Library noon geometry: screen · beam', 'Lantern Deck: own · beam', 'Lantern Deck noon geometry: screen · beam', 'clear % D/G/M/L (screen)'],
      who.map(p => [LABEL[p], f(get(d, p, 0, 'screen', 'base').hpm, 2), f(get(d, p, 1, 'screen', 'base').hpm, 2),
        f(get(d, p, 2, 'screen', 'base').hpm, 2) + ' · ' + f(get(d, p, 2, 'beam', 'base').hpm, 2), f(get(d, p, 2, 'screen', 'noonDark').hpm, 2) + ' · ' + f(get(d, p, 2, 'beam', 'noonDark').hpm, 2),
        f(get(d, p, 3, 'screen', 'base').hpm, 2) + ' · ' + f(get(d, p, 3, 'beam', 'base').hpm, 2), f(get(d, p, 3, 'screen', 'noonDark').hpm, 2) + ' · ' + f(get(d, p, 3, 'beam', 'noonDark').hpm, 2),
        [0, 1, 2, 3].map(lv => f(get(d, p, lv, 'screen', 'base').floorClear, 0)).join('/')])), '');
  }
  // beam length actually used
  const OF = makeOF('base'), bl = [];
  for (const d of DIFFS) for (const [W, H] of [[960, 540], [1280, 720], [390, 844], [844, 390], [820, 1180], [1180, 820]]) {
    const row = [d, W + '×' + H];
    for (const lv of [2, 3]) { const w = new OF.World({ seed: 1, difficulty: d, width: W, height: H, level: lv }); row.push(f(w.seeAheadUnits(), 1) + ' / ' + f(w.beamUnits(), 1) + ' / ' + f(w.screenReachUnits(), 1)); }
    bl.push(row);
  }
  md.push('## seeAhead / beam / screen reach (u) on lamp floors', '', tbl(['diff', 'layout', 'Map Library', 'Lantern Deck'], bl), '');
  return { R, md: md.join('\n') };
};

/** Vision models × layouts, whole games on Easy and Normal. */
SEC.vision = async (N) => {
  const who = ['kid4', 'kid', 'kid6', 'adult'], lays = [[960, 540], [844, 390], [1180, 820], [390, 844], [820, 1180]], jobs = [];
  for (const d of ['easy', 'normal']) for (const p of who) for (const [W, H] of lays) for (const vis of ['v0', 'screen', 'beam'])
    jobs.push({ cfg: 'base', diff: d, who: p, vis, W, H, seeds: seedsOf(N), time: 400 });
  for (const d of ['easy', 'normal']) for (const p of who) for (const [W, H] of [[390, 844], [820, 1180]])
    jobs.push({ cfg: 'base', layout: 'heroX15', diff: d, who: p, vis: 'beam', W, H, seeds: seedsOf(N), time: 400 });
  const res = await pool(jobs), R = jobs.map((j, i) => ({ j, s: sumUp(res[i]) }));
  const md = ['# Vision × layout — whole games, ' + N + ' rounds × ≤400 s', '', 'v0 = original model (sees 7 u ahead, even off screen, no notice delay). screen = min(7 u, screen reach) + one reaction to notice. beam = screen, but on lamp floors only the headlamp beam + 0.15 s. heroX15 = portrait hero at 15 % of the width instead of 22 % (code change in computeLayout).', ''];
  for (const d of ['easy', 'normal']) {
    md.push('## ' + d, '', tbl(['player', 'layout', 'reach u', 'vision', 'clear floor 1/2/3/4 %', 'surv p50 s', 'hits/min', 'hits on floor 1/2/3/4 per round'],
      R.filter(r => r.j.diff === d).map(({ j, s }) => {
        const OF = makeOF('base', j.layout), w = new OF.World({ seed: 1, difficulty: d, width: j.W, height: j.H });
        return [LABEL[j.who], j.W + '×' + j.H + (j.layout ? ' heroX15' : ''), f(w.screenReachUnits(), 1), j.vis, t3(s.reach), f(s.surv[1], 0), f(s.hpm, 2), s.hitsByFloor.map(x => f(x / s.n, 2)).join('/')];
      })), '');
  }
  return { R, md: md.join('\n') };
};

/** Exploits vs honest play (all difficulties). */
SEC.exploits = async (N) => {
  const who = ['never', 'ceilOnly', 'pingPong', 'spam150', 'spam250', 'spam400', 'spam700', 'kid4', 'kid'], jobs = [];
  for (const d of DIFFS) for (const p of who) jobs.push({ cfg: 'base', diff: d, who: p, vis: 'screen', seeds: seedsOf(N), time: 600 });
  const res = await pool(jobs), R = jobs.map((j, i) => ({ j, s: sumUp(res[i]) }));
  const md = ['# Exploits — ' + N + ' rounds × ≤600 s, 960×540', '', tbl(['diff · player', 'surv p10/50/90 s', 'score p10/50/90', 'clear floor 1/2 %', 'hits/min', 'pts/min', 'taps/min', 'hatch % of hits', 'on ceiling % of hits'],
    R.map(({ j, s }) => [j.diff + ' · ' + LABEL[j.who], t3(s.surv), t3(s.score), f(s.reach[0], 0) + '/' + f(s.reach[1], 0), f(s.hpm, 2), f(s.ptsMin, 0), f(s.tapsMin, 0), f(s.hatchPct, 0), f(s.ceilSidePct, 0)])), ''];
  return { R, md: md.join('\n') };
};

/** Score inflation: multEvery and a "missed leaf costs combo" rule, for good and average players. */
SEC.score = async (N) => {
  const who = ['bot1', 'bot5', 'adult', 'kid6', 'kid'], jobs = [];
  const vars = [['base', null], ['me8', null], ['me10', null], ['base', 'missHalf'], ['base', 'missReset'], ['me10', 'missHalf']];
  for (const d of DIFFS) for (const p of who) for (const [cfg, combo] of vars) jobs.push({ cfg, combo, diff: d, who: p, vis: 'screen', seeds: seedsOf(N), time: 300 });
  const res = await pool(jobs), R = jobs.map((j, i) => ({ j, s: sumUp(res[i]) }));
  const md = ['# Score inflation — ' + N + ' rounds × ≤300 s, 960×540', '', 'multEvery = leaves per ×step (5 = ×5 at 20 in a row). missHalf / missReset = a leaf that scrolls past un-caught halves / resets the combo (code change, not CONFIG).', ''];
  for (const d of DIFFS) md.push('## ' + d, '', tbl(['player', 'variant', 'pts/min', 'score p50 (≤300 s)', '×5 reached % · p50 s', 'leaf pts at ×5 %', 'leaf share of score %', 'catch %'],
    R.filter(r => r.j.diff === d).map(({ j, s }) => [LABEL[j.who], j.cfg + (j.combo ? '+' + j.combo : ''), f(s.ptsMin, 0), f(s.score[1], 0), f(s.reach5, 0) + ' · ' + f(s.t5, 0), f(s.x5share, 0), f(s.leafShare, 0), f(s.catchPct, 0)])), '');
  return { R, md: md.join('\n') };
};

/** Beam length only (no dark delay) on the lamp floors, Normal/Hard, current seeExtra vs 1.2. */
SEC.beam = async (N) => {
  const who = ['kid6', 'adult', 'bot5'], jobs = [];
  for (const d of ['normal', 'hard']) for (const p of who) for (const lv of [1, 2, 3]) for (const [vis, cfg] of [['screen', 'base'], ['beamOnly', 'base'], ['beamOnly', 'see12']])
    jobs.push({ cfg, diff: d, who: p, vis, level: lv, oneFloor: true, seeds: seedsOf(N), time: 120 });
  const res = await pool(jobs), R = jobs.map((j, i) => ({ j, s: sumUp(res[i]) }));
  const get = (d, p, lv, vis, cfg) => R.find(r => r.j.diff === d && r.j.who === p && r.j.level === lv && r.j.vis === vis && r.j.cfg === cfg).s;
  const md = ['# Headlamp beam length only (no extra dark delay) — single floors, ' + N + ' rounds, 960×540', '', 'hits/min. screen = sees the whole screen; beamOnly = on lamp floors sees only world.beamUnits() ahead (bot 0.5 ignores vision: control).', ''];
  for (const d of ['normal', 'hard']) md.push('## ' + d, '', tbl(['player', 'Greenhouse (day)', 'Map Library: screen · beam · beam seeExtra 1.2', 'Lantern Deck: screen · beam · beam seeExtra 1.2'],
    who.map(p => [LABEL[p], f(get(d, p, 1, 'screen', 'base').hpm, 2)].concat([2, 3].map(lv => [['screen', 'base'], ['beamOnly', 'base'], ['beamOnly', 'see12']].map(([v, c]) => f(get(d, p, lv, v, c).hpm, 2)).join(' · '))))), '');
  return { R, md: md.join('\n') };
};

/** Combo-on-miss variants and a bigger door bonus (Normal/Hard and Easy), whole games ≤300 s. */
SEC.score2 = async (N) => {
  const who = ['bot1', 'adult', 'kid6', 'kid'], jobs = [];
  const vars = [['base', null], ['base', 'missQuarter'], ['bonus500', null]];
  for (const d of DIFFS) for (const p of who) for (const [cfg, combo] of vars) jobs.push({ cfg, combo, diff: d, who: p, vis: 'screen', seeds: seedsOf(N), time: 300 });
  const res = await pool(jobs), R = jobs.map((j, i) => ({ j, s: sumUp(res[i]) }));
  const md = ['# Score variants 2 — ' + N + ' rounds × ≤300 s', ''];
  for (const d of DIFFS) md.push('## ' + d, '', tbl(['player', 'variant', 'pts/min', 'score p50', '×5 reached % · p50 s', 'leaf pts at ×5 %', 'door bonus share of score %'],
    R.filter(r => r.j.diff === d).map(({ j, s }) => [LABEL[j.who], j.cfg + (j.combo ? '+' + j.combo : ''), f(s.ptsMin, 0), f(s.score[1], 0), f(s.reach5, 0) + ' · ' + f(s.t5, 0), f(s.x5share, 0), f(100 - s.leafShare, 0)])), '');
  return { R, md: md.join('\n') };
};

/** Portrait vs landscape with more rounds (Easy/Normal, vision "screen"), single floors so survivorship does not blur it. */
SEC.portrait = async (N) => {
  const who = ['kid', 'kid6', 'adult'], lays = [[960, 540], [390, 844], [820, 1180]], jobs = [];
  for (const d of ['easy', 'normal']) for (const p of who) for (const [W, H] of lays) for (const lv of [0, 3])
    jobs.push({ cfg: 'base', diff: d, who: p, vis: 'screen', W, H, level: lv, oneFloor: true, seeds: seedsOf(N), time: 120 });
  const res = await pool(jobs), R = jobs.map((j, i) => ({ j, s: sumUp(res[i]) }));
  const get = (d, p, W, lv) => R.find(r => r.j.diff === d && r.j.who === p && r.j.W === W && r.j.level === lv).s;
  const md = ['# Portrait vs landscape — single floors, ' + N + ' rounds, vision "screen" (notices a hazard one reaction after it enters the screen)', '', tbl(['diff · player', 'Boot Room hits/min 960×540 · 390×844 · 820×1180', 'Lantern Deck hits/min 960×540 · 390×844 · 820×1180', 'Lantern Deck clear % 960×540 · 390×844 · 820×1180'],
    [].concat(...['easy', 'normal'].map(d => who.map(p => [d + ' · ' + LABEL[p], lays.map(([W]) => f(get(d, p, W, 0).hpm, 2)).join(' · '), lays.map(([W]) => f(get(d, p, W, 3).hpm, 2)).join(' · '), lays.map(([W]) => f(get(d, p, W, 3).floorClear, 0)).join(' · ')])))), ''];
  return { R, md: md.join('\n') };
};

/** CONFIG candidates (--cfg a,b,c): whole games ≤400 s, Easy kids + adult, Normal/Hard adult, vision v0 and screen. */
SEC.sweep = async (N, cfgs) => {
  const rows = [['easy', 'kid4'], ['easy', 'kid'], ['easy', 'kid6'], ['easy', 'adult'], ['normal', 'kid6'], ['normal', 'adult'], ['hard', 'adult']], jobs = [];
  for (const cfg of cfgs) for (const [d, p] of rows) for (const vis of ['v0', 'screen']) jobs.push({ cfg, diff: d, who: p, vis, seeds: seedsOf(N), time: 400 });
  const res = await pool(jobs), R = jobs.map((j, i) => ({ j, s: sumUp(res[i]) }));
  const md = ['# CONFIG sweep — whole games, ' + N + ' rounds × ≤400 s, 960×540', '', tbl(['diff · player', 'cfg', 'vision', 'clear floor 1/2/3/4 %', 'surv p50 s', 'hits/min', 'Boot Room hits/round', 'score p50', 'pts/min'],
    R.map(({ j, s }) => [j.diff + ' · ' + LABEL[j.who], j.cfg, j.vis, t3(s.reach), f(s.surv[1], 0), f(s.hpm, 2), f(s.hitsByFloor[0] / s.n, 2), f(s.score[1], 0), f(s.ptsMin, 0)])), ''];
  return { R, md: md.join('\n') };
};

async function main() {
  const a = process.argv.slice(2), opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const sec = a[0] || 'matrix', N = +opt('--seeds', 100), cfgs = opt('--cfg', 'base').split(',');
  fs.mkdirSync(OUT, { recursive: true });
  for (const s of sec === 'all' ? Object.keys(SEC) : sec.split(',')) {
    const t0 = Date.now(); process.stderr.write(s + '\n');
    const r = await SEC[s](N, cfgs);
    const tag = s + (s === 'matrix' || s === 'sweep' ? '-' + cfgs.join('+') : '') + (OFF ? '-off' + OFF : '');
    fs.writeFileSync(path.join(OUT, 'playtest-' + tag + '.json'), JSON.stringify(r.R));
    fs.writeFileSync(path.join(OUT, 'playtest-' + tag + '.md'), r.md + '\n');
    console.log(r.md); process.stderr.write(s + ' done in ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s\n');
  }
}
main();
