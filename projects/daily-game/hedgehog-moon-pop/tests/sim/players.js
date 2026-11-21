#!/usr/bin/env node
// Bristle's Moon Pop — player models + one headless game + summary tables (used by run.js and playtest.js).
//
//   node tests/sim/players.js [--n 40] [--cap 15] [--models kid4,kid6,...] [--diffs easy,normal,hard] [--tag x]
//                             [--overrides file.json]      { all:{}, easy:{}, normal:{}, hard:{} } CONFIG overrides
//
// Every model drives the world ONLY through world.setMove / setTarget / action (like a finger / keys) and reads
// only what a player sees (bubble / pebble positions, shadow rings). Writes tests/sim/results/players_<tag>.md.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { load } = require('../unit/load');

/* ------------------------------------------------------------------ human models */
//   react  [a,b] s   perception → action delay (a command decided at t is applied at t + react)
//   every  [a,b] s   time between looks
//   noise  px        finger imprecision (re-rolled per target bubble)
//   notice s         a puffing vent / bubble is noticed after this long
//   jump   0..1      chance to jump for a bubble that is right above and rising out of reach (0 = only skates)
//   lapse  /s, [a,b] chance per second to stop steering (distracted) and for how long
//   dodge  0..1      chance (once per pebble) to step away from its shadow ring
//   spam             presses Jump every frame (exploit check)
const HUMANS = {
  kid4:     { react: [0.55, 0.7], every: [0.2, 0.35], noise: 30, notice: 0.35, jump: 0, lapse: 0.05, lapseDur: [1, 3], dodge: 0.35 },
  kid6:     { react: [0.5, 0.5], every: [0.15, 0.25], noise: 20, notice: 0.25, jump: 0, lapse: 0.02, lapseDur: [0.5, 1.5], dodge: 0.6 },
  casual:   { react: [0.25, 0.35], every: [0.08, 0.15], noise: 14, notice: 0.15, jump: 0.7, lapse: 0.005, lapseDur: [0.3, 0.8], dodge: 0.85 },
  spamJump: { react: [0.25, 0.35], every: [0.08, 0.15], noise: 14, notice: 0.15, jump: 0, lapse: 0, lapseDur: [0, 0], dodge: 0.85, spam: true }
};

function Human(world, prm, seed, MP) {
  this.w = world; this.p = prm; this.rng = new MP.RNG(seed);
  this.queue = []; this.nextLook = 0; this.lapseUntil = -1;
  this.curId = null; this.off = 0; this.seen = {}; this.lastTarget = null;
}
Human.prototype.roll = function (r) { return r[0] + (r[1] - r[0]) * this.rng.next(); };
Human.prototype.info = function (it) {
  let i = this.seen[it.id];
  if (!i) i = this.seen[it.id] = { dodge: this.rng.chance(this.p.dodge), jump: this.rng.chance(this.p.jump) };
  return i;
};
Human.prototype.decide = function () {
  const w = this.w, c = w.cfg, s = w.hog, P = this.p, low = c.hogRestY - (c.bubbleR + c.hogR) + 8;
  let best = null, jumpFor = null;
  for (const it of w.items) {
    if (it.kind === 'pebble') continue;
    const age = it.state === 'puff' ? it.t : it.state === 'rise' ? it._puff + it.t : -1;
    if (age < P.notice) continue;
    const dx = Math.abs(it.x - s.x);
    if (it.state === 'puff' || (it.state === 'rise' && it.y > low)) {          // low: skate to it
      if (!best || dx < best.d) best = { it, d: dx, x: it.x };
    } else if (it.state === 'rise' && P.jump > 0 && it.y > 230 && it.y < low && this.info(it).jump) {   // up there: jump for it
      if (!jumpFor || dx < jumpFor.d) jumpFor = { it, d: dx, x: it.x };
    }
  }
  let tgt = this.lastTarget, jump = !!P.spam;
  // a jumper goes for the nearer of the two (low bubble vs. one to jump for); a kid only skates
  const pick = (best && jumpFor) ? (jumpFor.d < best.d ? jumpFor : best) : (best || jumpFor);
  const jumping = pick && pick === jumpFor;
  if (pick) {
    if (pick.it.id !== this.curId) { this.curId = pick.it.id; this.off = (this.rng.next() * 2 - 1) * P.noise; }
    tgt = pick.x + this.off;
    // a casual player jumps when the bubble is about to pass over his head
    if (jumping && Math.abs(jumpFor.x - s.x) < 45 && jumpFor.it.y < c.hogRestY - 90 && jumpFor.it.y > c.hogRestY - 230) jump = true;
  }
  // pebbles: step away from a shadow ring under / ahead of him
  for (const it of w.items) {
    if (it.kind !== 'pebble' || it.state !== 'fall' || it.harmless || it.t < P.notice) continue;
    if (!this.info(it).dodge || it.lt - w.time > 1.8) continue;
    const at = tgt === null ? s.x : tgt, lim = c.pebbleR + c.hogR + 14;
    if (Math.abs(it.lx - at) < lim || Math.abs(it.lx - s.x) < lim) {
      const side = at >= it.lx ? 1 : -1;
      let nx = it.lx + side * (lim + 30);
      if (nx < c.xMin + 5 || nx > c.xMax - 5) nx = it.lx - side * (lim + 30);
      tgt = nx; jump = jump && !!P.spam;
    }
  }
  if (tgt !== null) this.lastTarget = tgt;
  return { target: tgt, jump };
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
    if (t > this.lapseUntil) { w.setTarget(d.target); if (d.jump) w.action(); }
  }
  if (this.p.spam) w.action();
  if (t <= this.lapseUntil) w.setTarget(null);   // finger lifted: Bristle coasts to a stop
  w.setMove(0);
};

function BotP(MP, w, skill, seed) { this.b = new MP.Bot(w, { skill, seed }); }
BotP.prototype.step = function (dt) { this.b.step(dt); };

const ALL_MODELS = ['bot0.3', 'bot0.5', 'bot0.8', 'bot1.0', 'kid4', 'kid6', 'casual', 'spamJump'];

/* ------------------------------------------------------------------ one game */
function runGame(job) {
  const MP = load(['rng.js', 'world.js', 'bot.js']);
  const ov = job.overrides || {};
  const config = Object.assign({}, MP.DIFFICULTY[job.diff], ov.all || {}, ov[job.diff] || {});
  const w = new MP.World({ seed: job.seed, config });
  const player = job.model.startsWith('bot') ? new BotP(MP, w, +job.model.slice(3), job.seed * 13 + 5)
    : new Human(w, HUMANS[job.model], job.seed * 31 + 7, MP);
  const dt = 1 / 60, maxT = job.cap * 60;
  const r = { t: 0, dead: false, score: 0, level: 0, firstPop: null, lvT: [], pops: 0, airPops: 0, skyPops: 0, bonks: 0,
    escaped: 0, spawned: 0, jumps: 0, bestChain: 0, bestCombo: 0, magnets: 0, multPts: [0, 0, 0], chainPts: 0, pts: 0 };
  let levelStart = 0, go = null;
  while (w.state !== 'dead' && w.time < maxT) {
    player.step(dt); w.update(dt);
    for (const e of w.drainEvents()) {
      if (e.type === 'zone') levelStart = w.time;
      else if (e.type === 'go') { if (go === null) go = w.time; }
      else if (e.type === 'pop') {
        if (r.firstPop === null) r.firstPop = +(w.time - go).toFixed(2);
        r.multPts[e.mult - 1] += e.points; r.pts += e.points; if (e.chain >= 2) r.chainPts += 10 * (e.chain - 1);
      } else if (e.type === 'cleared') r.lvT[e.level] = +(w.time - levelStart).toFixed(1);
    }
  }
  r.t = +w.time.toFixed(1); r.dead = w.state === 'dead'; r.score = w.score; r.level = w.level;
  r.pops = w.popsTotal; r.airPops = w.airPops; r.skyPops = w.skyPops; r.bonks = w.bonks; r.escaped = w.escaped; r.spawned = w.spawned;
  r.jumps = w.jumps; r.bestChain = w.bestChain; r.bestCombo = w.bestCombo; r.magnets = w.magnets;
  return r;
}

/* ------------------------------------------------------------------ summary */
const q = (a, p) => { a = a.filter(v => v !== null && v !== undefined && isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const sum = a => a.reduce((x, y) => x + y, 0);
const f = (v, d) => isFinite(v) ? v.toFixed(d || 0) : '–';
const pct = v => isFinite(v) ? (100 * v).toFixed(0) + '%' : '–';

function summarize(rs) {
  const s = { n: rs.length }, mins = rs.map(r => r.t / 60), M = sum(mins);
  s.surv = [0.1, 0.5, 0.9].map(p => q(mins, p));
  s.died = mean(rs.map(r => r.dead ? 1 : 0));
  s.score = [0.1, 0.5, 0.9].map(p => q(rs.map(r => r.score), p));
  s.level = q(rs.map(r => r.level), 0.5);
  s.clear1 = mean(rs.map(r => r.lvT[0] !== undefined ? 1 : 0));
  s.loop1 = mean(rs.map(r => r.lvT[3] !== undefined ? 1 : 0));
  s.lvMed = [0, 1, 2, 3].map(L => q(rs.map(r => r.lvT[L]), 0.5));
  s.lvP90 = [0, 1, 2, 3].map(L => q(rs.map(r => r.lvT[L]), 0.9));
  s.firstPop = q(rs.map(r => r.firstPop), 0.5);
  s.popRate = sum(rs.map(r => r.pops)) / Math.max(1, sum(rs.map(r => r.pops + r.escaped)));
  s.bonkMin = sum(rs.map(r => r.bonks)) / M;
  s.escMin = sum(rs.map(r => r.escaped)) / M;
  s.airShare = sum(rs.map(r => r.airPops)) / Math.max(1, sum(rs.map(r => r.pops)));
  s.skyMin = sum(rs.map(r => r.skyPops)) / M;
  s.jumpMin = sum(rs.map(r => r.jumps)) / M;
  s.chain = q(rs.map(r => r.bestChain), 0.5);
  s.combo = q(rs.map(r => r.bestCombo), 0.5);
  s.scoreMin = sum(rs.map(r => r.score)) / M;
  s.multShare = sum(rs.map(r => r.pts - r.multPts[0])) / Math.max(1, sum(rs.map(r => r.pts)));
  return s;
}

function tables(S, models, diffs, title) {
  const each = fn => { let o = ''; for (const m of models) for (const d of diffs) { const s = S[m + '|' + d]; if (s) o += fn(m, d, s); } return o; };
  let md = `# ${title}\n\n## Survival, score, progress\n\n`;
  md += '| Model | Diff | Survival min p10/med/p90 | Died ≤ cap | Score p10/med/p90 | Score/min | Level med | Clear L1 / loop 1 | 1st pop s |\n|---|---|---|---|---|---|---|---|---|\n';
  md += each((m, d, s) => `| ${m} | ${d} | ${s.surv.map(v => f(v, 1)).join(' / ')} | ${pct(s.died)} | ${s.score.map(v => f(v)).join(' / ')} | ${f(s.scoreMin)} | ${f(s.level)} | ${pct(s.clear1)} / ${pct(s.loop1)} | ${f(s.firstPop, 1)} |\n`);
  md += '\n## Level pacing, loop 1: median s per level (p90) — dawn / noon / sunset / night\n\n| Model | Diff | Dawn | Noon | Sunset | Night |\n|---|---|---|---|---|---|\n';
  md += each((m, d, s) => `| ${m} | ${d} | ${s.lvMed.map((v, k) => f(v) + ' (' + f(s.lvP90[k]) + ')').join(' | ')} |\n`);
  md += '\n## Play style\n\n| Model | Diff | Pop rate | Escapes/min | Bonks/min | Jumps/min | Air pops | Sky pops/min | Best chain med | Best streak med | Points at ×≥2 |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
  md += each((m, d, s) => `| ${m} | ${d} | ${pct(s.popRate)} | ${f(s.escMin, 1)} | ${f(s.bonkMin, 2)} | ${f(s.jumpMin, 1)} | ${pct(s.airShare)} | ${f(s.skyMin, 2)} | ${f(s.chain)} | ${f(s.combo)} | ${pct(s.multShare)} |\n`);
  return md;
}

/* ------------------------------------------------------------------ parallel runner */
function runAll(jobs, workers, done) {
  const out = new Array(jobs.length);
  let next = 0, fin = 0;
  const nW = Math.max(1, Math.min(workers || require('os').cpus().length, 4, jobs.length));
  for (let k = 0; k < nW; k++) {
    const ch = fork(__filename, ['--worker']);
    const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
    ch.on('message', (m) => { out[m.i] = m.r; if (++fin === jobs.length) done(out); feed(); });
    feed();
  }
}
function cells(jobs, out) {
  const C = {}, S = {};
  jobs.forEach((j, i) => { (C[j.model + '|' + j.diff] = C[j.model + '|' + j.diff] || []).push(out[i]); });
  for (const k in C) S[k] = summarize(C[k]);
  return S;
}
function makeJobs(models, diffs, N, cap, overrides) {
  const jobs = [];
  // same seeds for every model/difficulty → paired comparisons
  for (const model of models) for (const diff of diffs) for (let k = 0; k < N; k++) jobs.push({ model, diff, seed: 1000 + k * 7919, cap, overrides });
  return jobs;
}

if (require.main === module && process.argv[2] === '--worker') {
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const N = +arg('n', 40), cap = +arg('cap', 15), tag = arg('tag', 'baseline');
  const models = arg('models', ALL_MODELS.join(',')).split(','), diffs = arg('diffs', 'easy,normal,hard').split(',');
  const ovPath = arg('overrides', null), overrides = ovPath ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : null;
  const jobs = makeJobs(models, diffs, N, cap, overrides), t0 = Date.now();
  runAll(jobs, +arg('workers', 0), (out) => {
    const S = cells(jobs, out);
    const md = tables(S, models, diffs, `Player models — ${tag} — ${N} rounds per cell, ${cap} min cap`) + `\n${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s.\n`;
    console.log(md);
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `players_${tag}.md`), md);
  });
}

module.exports = { runGame, summarize, tables, cells, runAll, makeJobs, HUMANS, ALL_MODELS, f, pct };
