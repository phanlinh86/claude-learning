#!/usr/bin/env node
// Shelly's Sky Catch — high-speed PLAYTEST with human-like player models (report-only, never edits game/js).
//
//   node tests/sim/players.js [--n 150] [--cap 15] [--models kid4,kid6,casual,...] [--diffs easy,normal,hard]
//                             [--overrides tests/sim/overrides.json] [--tag baseline]
//
// Every model drives the world ONLY through world.setMove / setTarget / action (like a finger / keys);
// humans read item positions and world.predict() (what a player sees + a partial guess of the drift).
// Overrides file: { "all": {...CONFIG keys}, "easy": {...}, "normal": {...}, "hard": {...} } merged
// over SC.DIFFICULTY[diff] and passed as new SC.World({ config }).
// Writes tests/sim/results/players_<tag>.json (raw per-run rows) and players_<tag>.md (summary tables).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { load } = require('../unit/load');

/* ------------------------------------------------------------------ player models */
// Human model parameters
//   react   [a,b] s     perception→action delay (a command decided at t is applied at t + react)
//   every   [a,b] s     time between looks / decisions
//   noise   px          per-target finger imprecision, uniform ±noise (re-rolled when the target star changes)
//   predict 0..1        how much of the star's sideways travel (wind, flutter) the player anticipates (1 = perfect)
//   notice  'fall'|s    start tracking a star only once it falls, or after s seconds of peek
//   pick    'closest'|'soonest'
//   lapse   /s, [a,b]   chance per second to stop steering (finger lifted / distracted) and for how long
//   dodge               chance (once per threatening puff) to side-step it
//   chasePuff           chance a puff is mistaken for a star
//   jet                 chance (once per star that is out of reach) to try a Jet Hop for it; jetRandom /s presses for fun
//   idle    'stay'|'center'
const HUMANS = {
  kid4:   { react: [0.45, 0.60], every: [0.20, 0.35], noise: 34, predict: 0.4, notice: 'fall', pick: 'closest',
            lapse: 0.06, lapseDur: [1, 3], dodge: 0.25, chasePuff: 0.05, jet: 0.05, jetRandom: 0.15, idle: 'stay' },
  kid6:   { react: [0.35, 0.45], every: [0.15, 0.25], noise: 26, predict: 0.65, notice: 0.3, pick: 'closest',
            lapse: 0.025, lapseDur: [0.5, 1.5], dodge: 0.55, chasePuff: 0.015, jet: 0.25, jetRandom: 0.05, idle: 'stay' },
  casual: { react: [0.25, 0.35], every: [0.08, 0.15], noise: 18, predict: 0.9, notice: 0.15, pick: 'soonest',
            lapse: 0.005, lapseDur: [0.3, 0.8], dodge: 0.85, chasePuff: 0, jet: 0.5, jetRandom: 0, idle: 'center' },
  // exploit: a casual adult who presses Jet Hop every time it is charged
  spamJet: { react: [0.25, 0.35], every: [0.08, 0.15], noise: 18, predict: 0.9, notice: 0.15, pick: 'soonest',
            lapse: 0, lapseDur: [0, 0], dodge: 0.85, chasePuff: 0, jet: 0, jetRandom: 0, idle: 'center', spamJet: true }
};

function Human(world, prm, seed, SC) {
  this.w = world; this.p = prm; this.rng = new SC.RNG(seed);
  this.queue = [];            // [{at, target, jet}]
  this.nextLook = 0; this.lapseUntil = -1;
  this.curId = null; this.off = 0;
  this.seen = {};             // id -> {dodge, chase, jet}
  this.lastTarget = null;
}
Human.prototype.roll = function (r) { return r[0] + (r[1] - r[0]) * this.rng.next(); };
Human.prototype.info = function (it) {
  let i = this.seen[it.id];
  if (!i) i = this.seen[it.id] = { dodge: this.rng.chance(this.p.dodge), chase: this.rng.chance(this.p.chasePuff), jet: this.rng.chance(this.p.jet) };
  return i;
};
Human.prototype.sees = function (it) {
  const n = this.p.notice;
  return n === 'fall' ? it.state === 'fall' : (it.state === 'fall' || it.t >= n);
};
Human.prototype.decide = function () {
  const w = this.w, c = w.cfg, s = w.snail, P = this.p, Y = c.hoverY - c.rimOff;
  const cand = [], puffs = [];
  for (const it of w.items) {
    if (it.state !== 'peek' && it.state !== 'fall') continue;
    if (it.state === 'fall' && it.y > s.rimY) continue;
    if (!this.sees(it)) continue;
    const cr = w.predict(it, Y);
    if (!cr) continue;
    const guess = it.x + (cr.x - it.x) * P.predict;          // partial anticipation of drift
    const info = this.info(it);
    if (it.kind === 'puff') { puffs.push({ it, t: cr.t, x: cr.x, info }); if (!info.chase) continue; }
    cand.push({ it, t: cr.t, x: guess, info });
  }
  let tgt = null, jet = !!P.spamJet;
  const v = c.maxSpeed * 0.85, react = (P.react[0] + P.react[1]) / 2;
  if (cand.length) {
    let best = null;
    if (P.pick === 'closest') {
      for (const k of cand) if (!best || Math.abs(k.x - s.rimX) < Math.abs(best.x - s.rimX)) best = k;
    } else {
      cand.sort((a, b) => a.t - b.t);
      for (const k of cand) if (Math.abs(k.x - s.rimX) <= v * Math.max(0, k.t - react) + c.catchHalfW) { best = k; break; }
      if (!best) best = cand[0];
    }
    if (best.it.id !== this.curId) { this.curId = best.it.id; this.off = (this.rng.next() * 2 - 1) * P.noise; }
    tgt = best.x + this.off;
    // out of reach and close: maybe try a Jet Hop (a hop catches it early, on the way up)
    const out = Math.abs(best.x - s.rimX) > v * Math.max(0, best.t - react) + c.catchHalfW;
    if (best.info.jet && best.t < 0.9 && best.it.state === 'fall' && (out || best.it.y > Y - 140)) jet = true;
  } else {
    this.curId = null;
    tgt = P.idle === 'center' ? (c.xMin + c.xMax) / 2 : this.lastTarget;
  }
  if (P.jetRandom && this.rng.chance(P.jetRandom * this.roll(P.every))) jet = true;
  // puffs: side-step
  if (s.invuln <= 0.3) {
    for (const r of puffs) {
      if (r.t > 1.0 || r.info.chase || !r.info.dodge) continue;
      const at = tgt === null ? s.rimX : tgt;
      const lim = c.catchHalfW + r.it.r * c.catchRFrac + 10;
      if (Math.abs(r.x - at) < lim || Math.abs(r.x - s.rimX) < lim) {
        const side = (at >= r.x ? 1 : -1);
        let nx = r.x + side * (lim + 30);
        if (nx < c.xMin + 5 || nx > c.xMax - 5) nx = r.x - side * (lim + 30);
        tgt = nx;
      }
    }
  }
  if (tgt !== null) this.lastTarget = tgt;
  return { target: tgt, jet };
};
Human.prototype.step = function (dt) {
  const w = this.w, t = w.time;
  if (w.state === 'dead') { w.setTarget(null); w.setMove(0); return; }
  if (this.p.lapse > 0 && t > this.lapseUntil && this.rng.chance(this.p.lapse * dt)) this.lapseUntil = t + this.roll(this.p.lapseDur);
  if (t >= this.nextLook) {
    this.nextLook = t + this.roll(this.p.every);
    if (t > this.lapseUntil) { const d = this.decide(); d.at = t + this.roll(this.p.react); this.queue.push(d); }
  }
  while (this.queue.length && this.queue[0].at <= t) {
    const d = this.queue.shift();
    if (t > this.lapseUntil) { w.setTarget(d.target); if (d.jet) w.action(); }
  }
  if (t <= this.lapseUntil) w.setTarget(null);   // finger lifted: Shelly brakes (and slides on snow)
  w.setMove(0);
};

// Degenerate strategies
function Scripted(world, kind, seed, SC) { this.w = world; this.kind = kind; this.rng = new SC.RNG(seed); this.dir = 1; this.t0 = 0; }
Scripted.prototype.step = function () {
  const w = this.w, c = w.cfg, s = w.snail;
  if (w.state === 'dead') { w.setTarget(null); w.setMove(0); return; }
  switch (this.kind) {
    case 'park': w.setMove(0); w.setTarget(480); break;                                  // never moves
    case 'parkJet': w.setMove(0); w.setTarget(480); w.action(); break;                   // + hop whenever charged
    case 'sweep':                                                                         // full-width left/right
      w.setTarget(null);
      if (s.x >= c.xMax - 1) this.dir = -1; else if (s.x <= c.xMin + 1) this.dir = 1;
      w.setMove(this.dir); break;
    case 'mash':                                                                          // random finger every 0.4–1.2 s (toddler floor)
      if (w.time >= this.t0) { this.t0 = w.time + 0.4 + 0.8 * this.rng.next(); this.tx = c.xMin + (c.xMax - c.xMin) * this.rng.next(); if (this.rng.chance(0.15)) w.action(); }
      w.setMove(0); w.setTarget(this.tx); break;
  }
};

const ALL_MODELS = ['kid4', 'kid6', 'casual', 'spamJet', 'bot0.5', 'bot0.8', 'bot1.0', 'park', 'parkJet', 'sweep', 'mash'];

/* ------------------------------------------------------------------ one game */
function runGame(job) {
  const SC = load(['rng.js', 'world.js', 'bot.js']);
  const ov = job.overrides || {};
  const config = Object.assign({}, SC.DIFFICULTY[job.diff], ov.all || {}, ov[job.diff] || {});
  const w = new SC.World({ seed: job.seed, config });
  let player;
  if (job.model.startsWith('bot')) player = new SC.Bot(w, { skill: +job.model.slice(3), seed: job.seed * 13 + 5 });
  else if (HUMANS[job.model]) player = new Human(w, HUMANS[job.model], job.seed * 31 + 7, SC);
  else player = new Scripted(w, job.model, job.seed * 17 + 3, SC);

  const dt = 1 / 60, maxT = job.cap * 60;
  const r = {
    t: 0, dead: false, score: 0, level: 0, firstCatch: null, bestCombo: 0,
    zc: [0, 0, 0, 0, 0], zm: [0, 0, 0, 0, 0],          // catches / misses per weather on loop 1 (index 4 = later loops)
    lap0: [null, null, null, null],                    // s to clear each weather on loop 1
    multPts: [0, 0, 0], starPts: 0, goldPts: 0,        // star points earned at ×1..×3
    zaps: 0, jets: 0, jetCatches: 0, gold: 0, starsDropped: 0, puffsDropped: 0
  };
  let levelStart = 0;
  while (w.state !== 'dead' && w.time < maxT) {
    player.step(dt); w.update(dt);
    for (const e of w.drainEvents()) {
      const zi = w.lap === 0 ? w.zone : 4;
      if (e.type === 'zone') levelStart = w.time;
      else if (e.type === 'catch') {
        if (r.firstCatch === null) r.firstCatch = w.time;
        r.zc[zi]++; r.starPts += e.points; r.multPts[e.mult - 1] += e.points;
        if (e.kind === 'gold') { r.gold++; r.goldPts += e.points; }
        if (w.snail.hop > 0) r.jetCatches++;
      } else if (e.type === 'miss') r.zm[zi]++;
      else if (e.type === 'cleared') { if (e.level < 4) r.lap0[e.level] = +(w.time - levelStart).toFixed(1); }
      else if (e.type === 'zap') r.zaps++;
      else if (e.type === 'jet') r.jets++;
    }
  }
  r.t = +w.time.toFixed(1); r.dead = w.state === 'dead'; r.score = w.score; r.level = w.level;
  r.bestCombo = w.bestCombo; r.starsDropped = w.starsDropped; r.puffsDropped = w.puffsDropped;
  return r;
}

/* ------------------------------------------------------------------ summary */
const q = (a, p) => { a = a.filter(v => v !== null && v !== undefined && isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const f = (v, d) => isFinite(v) ? v.toFixed(d || 0) : '–';
const pct = v => isFinite(v) ? (100 * v).toFixed(0) + ' %' : '–';

function summarize(rs) {
  const s = {};
  s.n = rs.length;
  s.survP10 = q(rs.map(r => r.t / 60), 0.1); s.survMed = q(rs.map(r => r.t / 60), 0.5); s.survP90 = q(rs.map(r => r.t / 60), 0.9);
  s.died = mean(rs.map(r => r.dead ? 1 : 0));
  s.scoreP10 = q(rs.map(r => r.score), 0.1); s.scoreMed = q(rs.map(r => r.score), 0.5); s.scoreP90 = q(rs.map(r => r.score), 0.9);
  s.levelMed = q(rs.map(r => r.level), 0.5); s.levelMax = Math.max(...rs.map(r => r.level));
  s.clearZ = [0, 1, 2, 3].map(k => mean(rs.map(r => r.lap0[k] !== null ? 1 : 0)));
  s.secZ = [0, 1, 2, 3].map(k => q(rs.map(r => r.lap0[k]), 0.5));
  s.secZ90 = [0, 1, 2, 3].map(k => q(rs.map(r => r.lap0[k]), 0.9));
  s.firstCatch = q(rs.map(r => r.firstCatch), 0.5);
  s.noCatch = mean(rs.map(r => r.firstCatch === null ? 1 : 0));
  s.catchZ = [0, 1, 2, 3, 4].map(k => { const c = rs.reduce((a, r) => a + r.zc[k], 0), m = rs.reduce((a, r) => a + r.zm[k], 0); return c + m ? c / (c + m) : NaN; });
  s.reachMult = [8, 20].map(th => mean(rs.map(r => r.bestCombo >= th ? 1 : 0)));
  s.comboMed = q(rs.map(r => r.bestCombo), 0.5);
  const cp = rs.reduce((a, r) => a + r.starPts, 0), hi = rs.reduce((a, r) => a + r.starPts - r.multPts[0], 0), tot = rs.reduce((a, r) => a + r.score, 0);
  s.multShare = cp ? hi / cp : NaN; s.goldShare = cp ? rs.reduce((a, r) => a + r.goldPts, 0) / cp : NaN;
  const mins = rs.reduce((a, r) => a + r.t / 60, 0);
  s.zapMin = rs.reduce((a, r) => a + r.zaps, 0) / mins;
  s.jetMin = rs.reduce((a, r) => a + r.jets, 0) / mins;
  s.jetHit = rs.reduce((a, r) => a + r.jetCatches, 0) / Math.max(1, rs.reduce((a, r) => a + r.jets, 0));
  s.scorePerMin = tot / rs.reduce((a, r) => a + r.t / 60, 0);
  return s;
}

function tables(out, jobs, models, diffs, title) {
  const cells = {};
  jobs.forEach((j, i) => { (cells[j.model + '|' + j.diff] = cells[j.model + '|' + j.diff] || []).push(out[i]); });
  const S = {};
  for (const k in cells) S[k] = summarize(cells[k]);
  let md = `# ${title}\n\n`;
  md += '## Survival, score, progress\n\n| Model | Diff | Survival min p10/med/p90 | Died ≤ cap | Score p10/med/p90 | Score/min | Level med (max) | 1st catch s (none) | Zap/min | Jet/min (catch %) |\n|---|---|---|---|---|---|---|---|---|---|\n';
  for (const m of models) for (const d of diffs) { const s = S[m + '|' + d]; if (!s) continue;
    md += `| ${m} | ${d} | ${f(s.survP10, 1)} / ${f(s.survMed, 1)} / ${f(s.survP90, 1)} | ${pct(s.died)} | ${f(s.scoreP10)} / ${f(s.scoreMed)} / ${f(s.scoreP90)} | ${f(s.scorePerMin)} | ${f(s.levelMed)} (${s.levelMax}) | ${f(s.firstCatch, 1)} (${pct(s.noCatch)}) | ${f(s.zapMin, 2)} | ${f(s.jetMin, 1)} (${pct(s.jetHit)}) |\n`; }
  md += '\n## Weather levels (loop 1): clear rate, median s to clear (p90), catch rate\n\n| Model | Diff | Clear Z1 / Z2 / Z3 / Z4 | s per level med (p90): sunny / rain / wind / snow | Catch rate sunny / rain / wind / snow / loop≥2 |\n|---|---|---|---|---|\n';
  for (const m of models) for (const d of diffs) { const s = S[m + '|' + d]; if (!s) continue;
    md += `| ${m} | ${d} | ${s.clearZ.map(pct).join(' / ')} | ${s.secZ.map((v, k) => f(v) + ' (' + f(s.secZ90[k]) + ')').join(' / ')} | ${s.catchZ.map(v => f(v, 2)).join(' / ')} |\n`; }
  md += '\n## Streak + gold twist\n\n| Model | Diff | Best streak med | Runs reaching ×2 / ×3 | Star points earned at ×≥2 | Star points from gold |\n|---|---|---|---|---|---|\n';
  for (const m of models) for (const d of diffs) { const s = S[m + '|' + d]; if (!s) continue;
    md += `| ${m} | ${d} | ${f(s.comboMed)} | ${s.reachMult.map(pct).join(' / ')} | ${pct(s.multShare)} | ${pct(s.goldShare)} |\n`; }
  return { md, S };
}

/* ------------------------------------------------------------------ CLI / workers */
if (process.argv[2] === '--worker') {
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const N = +arg('n', 150), cap = +arg('cap', 15), tag = arg('tag', 'baseline');
  const models = arg('models', ALL_MODELS.join(',')).split(','), diffs = arg('diffs', 'easy,normal,hard').split(',');
  const ovPath = arg('overrides', null);
  const overrides = ovPath ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : null;
  const jobs = [];
  // same seeds for every model/difficulty/tag → paired comparisons
  for (const model of models) for (const diff of diffs) for (let k = 0; k < N; k++) jobs.push({ model, diff, seed: 1000 + k * 7919, cap, overrides });
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  const t0 = Date.now(), nW = Math.min(require('os').cpus().length, 4);
  for (let k = 0; k < nW; k++) {
    const ch = fork(__filename, ['--worker']);
    const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
    ch.on('message', (m) => { out[m.i] = m.r; if (++done === jobs.length) finish(); feed(); });
    feed();
  }
  function finish() {
    const title = `Player-model playtest — ${tag} — ${N} rounds per cell, ${cap} min cap${ovPath ? ' — overrides ' + path.basename(ovPath) : ''}`;
    const { md, S } = tables(out, jobs, models, diffs, title);
    const full = md + `\n${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s.\n`;
    console.log(full);
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `players_${tag}.md`), full);
    fs.writeFileSync(path.join(dir, `players_${tag}.json`), JSON.stringify({ tag, N, cap, overrides, summary: S,
      runs: jobs.map((j, i) => Object.assign({ model: j.model, diff: j.diff, seed: j.seed }, out[i])) }));
  }
}

module.exports = { runGame, summarize, HUMANS, ALL_MODELS };
