#!/usr/bin/env node
// Shelly's Sky Catch — HIGH-SPEED PLAYTEST harness (report-only: never edits game/js).
//
//   node tests/sim/playtest.js [--n 120] [--cap 30] [--models bot0.3,kid4,...] [--diffs easy,normal,hard]
//                              [--overrides tests/sim/overrides_v1.json] [--tag baseline] [--workers 2]
//
// Extends players.js with: bot skills 0.2…1, a 'jitter' finger and 'park' (stand still), per-level pacing for
// every level (not only loop 1), gold dropped vs caught, zap causes, wind / snow drift numbers and medals.
// All players act ONLY through world.setMove / setTarget / action. Overrides: { all:{}, easy:{}, normal:{}, hard:{} }
// merged over SC.DIFFICULTY[diff] and passed as new SC.World({ config }) — exactly what main.js does.
// Writes tests/sim/results/playtest_<tag>.md and .json.
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { load } = require('../unit/load');

/* ------------------------------------------------------------------ human models (as players.js) */
const HUMANS = {
  kid4:   { react: [0.45, 0.60], every: [0.20, 0.35], noise: 34, predict: 0.4, notice: 'fall', pick: 'closest',
            lapse: 0.06, lapseDur: [1, 3], dodge: 0.25, chasePuff: 0.05, jet: 0.05, jetRandom: 0.15, idle: 'stay' },
  kid6:   { react: [0.35, 0.45], every: [0.15, 0.25], noise: 26, predict: 0.65, notice: 0.3, pick: 'closest',
            lapse: 0.025, lapseDur: [0.5, 1.5], dodge: 0.55, chasePuff: 0.015, jet: 0.25, jetRandom: 0.05, idle: 'stay' },
  casual: { react: [0.25, 0.35], every: [0.08, 0.15], noise: 18, predict: 0.9, notice: 0.15, pick: 'soonest',
            lapse: 0.005, lapseDur: [0.3, 0.8], dodge: 0.85, chasePuff: 0, jet: 0.5, jetRandom: 0, idle: 'center' },
  spamJet: { react: [0.25, 0.35], every: [0.08, 0.15], noise: 18, predict: 0.9, notice: 0.15, pick: 'soonest',
            lapse: 0, lapseDur: [0, 0], dodge: 0.85, chasePuff: 0, jet: 0, jetRandom: 0, idle: 'center', spamJet: true }
};

function Human(world, prm, seed, SC) {
  this.w = world; this.p = prm; this.rng = new SC.RNG(seed);
  this.queue = []; this.nextLook = 0; this.lapseUntil = -1;
  this.curId = null; this.off = 0; this.seen = {}; this.lastTarget = null;
}
Human.prototype.roll = function (r) { return r[0] + (r[1] - r[0]) * this.rng.next(); };
Human.prototype.info = function (it) {
  let i = this.seen[it.id];
  if (!i) i = this.seen[it.id] = { dodge: this.rng.chance(this.p.dodge), chase: this.rng.chance(this.p.chasePuff), jet: this.rng.chance(this.p.jet) };
  return i;
};
Human.prototype.sees = function (it) { const n = this.p.notice; return n === 'fall' ? it.state === 'fall' : (it.state === 'fall' || it.t >= n); };
// why a zap happened, from the player's side
Human.prototype.why = function (id) {
  const i = this.seen[id];
  if (this.w.time <= this.lapseUntil + 0.3) return 'distracted';
  if (!i) return 'unseen';
  if (i.chase) return 'mistook for star';
  if (!i.dodge) return 'no dodge';
  return null;
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
    const guess = it.x + (cr.x - it.x) * P.predict;
    const info = this.info(it);
    if (it.kind === 'puff') { puffs.push({ it, t: cr.t, x: cr.x, info }); if (!info.chase) continue; }
    cand.push({ it, t: cr.t, x: guess, info });
  }
  let tgt = null, jet = !!P.spamJet;
  const v = c.maxSpeed * 0.85, react = (P.react[0] + P.react[1]) / 2;
  if (cand.length) {
    let best = null;
    if (P.pick === 'closest') { for (const k of cand) if (!best || Math.abs(k.x - s.rimX) < Math.abs(best.x - s.rimX)) best = k; }
    else {
      cand.sort((a, b) => a.t - b.t);
      for (const k of cand) if (Math.abs(k.x - s.rimX) <= v * Math.max(0, k.t - react) + c.catchHalfW) { best = k; break; }
      if (!best) best = cand[0];
    }
    if (best.it.id !== this.curId) { this.curId = best.it.id; this.off = (this.rng.next() * 2 - 1) * P.noise; }
    tgt = best.x + this.off;
    const out = Math.abs(best.x - s.rimX) > v * Math.max(0, best.t - react) + c.catchHalfW;
    if (best.info.jet && best.t < 0.9 && best.it.state === 'fall' && (out || best.it.y > Y - 140)) jet = true;
  } else { this.curId = null; tgt = P.idle === 'center' ? (c.xMin + c.xMax) / 2 : this.lastTarget; }
  if (P.jetRandom && this.rng.chance(P.jetRandom * this.roll(P.every))) jet = true;
  if (s.invuln <= 0.3) {
    for (const r of puffs) {
      if (r.t > 1.0 || r.info.chase || !r.info.dodge) continue;
      const at = tgt === null ? s.rimX : tgt, lim = c.catchHalfW + r.it.r * c.catchRFrac + 10;
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
  if (t <= this.lapseUntil) w.setTarget(null);
  w.setMove(0);
};

/* ------------------------------------------------------------------ degenerate strategies */
function Scripted(world, kind, seed, SC) { this.w = world; this.kind = kind; this.rng = new SC.RNG(seed); this.dir = 1; this.t0 = 0; this.tx = 480; this.ph = 0; }
Scripted.prototype.why = function () { return 'scripted'; };
Scripted.prototype.step = function (dt) {
  const w = this.w, c = w.cfg, s = w.snail;
  if (w.state === 'dead') { w.setTarget(null); w.setMove(0); return; }
  switch (this.kind) {
    case 'park': w.setMove(0); w.setTarget(480); break;                         // stand still in the middle
    case 'parkJet': w.setMove(0); w.setTarget(480); w.action(); break;          // + hop whenever charged
    case 'jitter':                                                                 // finger wiggling ±90 px at ~3 Hz, drifting slowly across
      this.ph += dt;
      w.setMove(0); w.setTarget(480 + 300 * Math.sin(this.ph * 0.35) + 90 * Math.sin(this.ph * 19)); break;
    case 'sweep':
      w.setTarget(null);
      if (s.x >= c.xMax - 1) this.dir = -1; else if (s.x <= c.xMin + 1) this.dir = 1;
      w.setMove(this.dir); break;
    case 'mash':
      if (w.time >= this.t0) { this.t0 = w.time + 0.4 + 0.8 * this.rng.next(); this.tx = c.xMin + (c.xMax - c.xMin) * this.rng.next(); if (this.rng.chance(0.15)) w.action(); }
      w.setMove(0); w.setTarget(this.tx); break;
  }
};

function BotP(SC, w, skill, seed) { this.b = new SC.Bot(w, { skill, seed }); }
BotP.prototype.step = function (dt) { this.b.step(dt); };
BotP.prototype.why = function (id) { return this.b._seen[id] === false ? 'unseen' : null; };

const ALL_MODELS = ['bot0.2', 'bot0.3', 'bot0.5', 'bot0.8', 'bot1.0', 'kid4', 'kid6', 'casual', 'spamJet', 'park', 'parkJet', 'jitter', 'mash'];
const MEDALS = [['bronze', 300], ['silver', 1000], ['gold', 2200], ['platinum', 4000]];

/* ------------------------------------------------------------------ one game */
function runGame(job) {
  const SC = load(['rng.js', 'world.js', 'bot.js']);
  const ov = job.overrides || {};
  const config = Object.assign({}, SC.DIFFICULTY[job.diff], ov.all || {}, ov[job.diff] || {});
  const w = new SC.World({ seed: job.seed, config });
  let player;
  if (job.model.startsWith('bot')) player = new BotP(SC, w, +job.model.slice(3), job.seed * 13 + 5);
  else if (HUMANS[job.model]) player = new Human(w, HUMANS[job.model], job.seed * 31 + 7, SC);
  else player = new Scripted(w, job.model, job.seed * 17 + 3, SC);

  const dt = 1 / 60, maxT = job.cap * 60, h = w.cfg.step;
  const r = {
    t: 0, dead: false, score: 0, level: 0, firstCatch: null, firstGo: null, bestCombo: 0,
    lvT: [],                                 // s from 'zone' to 'cleared' for every level
    lvEnd: [],                               // game time when each level was cleared (progress clock)
    lvScore: [],                             // score right after each level's clear bonus
    scoreAt: {},                             // score at minute marks
    zc: [0, 0, 0, 0], zm: [0, 0, 0, 0],      // catches / misses per zone (all loops)
    zc0: [0, 0, 0, 0], zm0: [0, 0, 0, 0],    // loop 1 only
    zz: [0, 0, 0, 0],                        // zaps per zone
    zTime: [0, 0, 0, 0],                     // s played per zone
    drift: [0, 0, 0, 0], driftN: [0, 0, 0, 0],   // |predicted rim crossing − drop x| (star sideways travel)
    slide: [0, 0, 0, 0], slideN: [0, 0, 0, 0],   // |vx| px/s after release… measured as overshoot proxy: mean |vx| while target==null
    goldDrop: 0, goldCaught: 0, goldDrop0: 0, goldCaught0: 0,
    zapCause: {}, zapLap: [], deathLevel: null,
    zaps: 0, jets: 0, jetCatches: 0, starsDropped: 0, puffsDropped: 0
  };
  let levelStart = 0, nextMark = 60, counted = new Set();
  const recent = [];   // recent star catch/miss crossings {t, x} for 'crowded' classification
  while (w.state !== 'dead' && w.time < maxT) {
    player.step(dt); w.update(dt);
    const z = w.zone;
    if (w.state === 'playing') r.zTime[z] += dt;
    if (w.time >= nextMark) { r.scoreAt[nextMark / 60] = w.score; nextMark += 60; }
    for (const e of w.drainEvents()) {
      if (e.type === 'zone') levelStart = w.time;
      else if (e.type === 'go') { if (r.firstGo === null) r.firstGo = w.time; }
      else if (e.type === 'peek') {
        const it = w.items.find(q => q.id === e.id);
        if (it && e.kind !== 'puff') { r.drift[z] += Math.abs(it.tx - it.x); r.driftN[z]++; }
        if (e.kind === 'gold') { r.goldDrop++; if (w.lap === 0) r.goldDrop0++; }
      } else if (e.type === 'catch') {
        if (r.firstCatch === null) r.firstCatch = w.time;
        r.zc[z]++; if (w.lap === 0) r.zc0[z]++;
        if (e.kind === 'gold') { r.goldCaught++; if (w.lap === 0) r.goldCaught0++; }
        if (w.snail.hop > 0) r.jetCatches++;
        recent.push({ t: w.time, x: e.x });
      } else if (e.type === 'miss') { r.zm[z]++; if (w.lap === 0) r.zm0[z]++; recent.push({ t: w.time, x: e.x }); }
      else if (e.type === 'cleared') { r.lvT[e.level] = +(w.time - levelStart).toFixed(1); r.lvEnd[e.level] = +w.time.toFixed(1); r.lvScore[e.level] = w.score; }
      else if (e.type === 'jet') r.jets++;
      else if (e.type === 'zap') {
        r.zaps++; r.zz[z]++; r.zapLap.push(w.lap);
        // find the puff that zapped (just popped, not harmless, above the floor)
        let pid = null;
        for (const it of w.items) if (it.kind === 'puff' && it.state === 'pop' && it.t <= 2 * h + 1e-9 && it.y < 450 && !counted.has(it.id)) { pid = it.id; counted.add(it.id); break; }
        let cause = player.why(pid);
        if (!cause) {
          const crowded = recent.some(q => Math.abs(q.t - w.time) < 0.8 && Math.abs(q.x - e.x) < 110);
          const futureStar = w.items.some(q => q.kind !== 'puff' && (q.state === 'fall') && q.tCross - w.time < 0.8 && q.tCross - w.time > -0.05 && Math.abs(q.tx - e.x) < 110);
          if (w.snail.hop > 0) cause = 'during Jet Hop';
          else if (crowded || futureStar) cause = 'star next to puff';
          else if (z === 3) cause = 'snow slide';
          else if (z === 2) cause = 'wind push';
          else cause = 'late dodge';
        }
        r.zapCause[cause] = (r.zapCause[cause] || 0) + 1;
      } else if (e.type === 'dead') r.deathLevel = e.level;
    }
    while (recent.length && recent[0].t < w.time - 1.5) recent.shift();
  }
  r.t = +w.time.toFixed(1); r.dead = w.state === 'dead'; r.score = w.score; r.level = w.level;
  r.bestCombo = w.bestCombo; r.starsDropped = w.starsDropped; r.puffsDropped = w.puffsDropped;
  return r;
}

/* ------------------------------------------------------------------ summary */
const q = (a, p) => { a = a.filter(v => v !== null && v !== undefined && isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const sum = a => a.reduce((x, y) => x + y, 0);
const f = (v, d) => isFinite(v) ? v.toFixed(d || 0) : '–';
const pct = v => isFinite(v) ? (100 * v).toFixed(0) + '%' : '–';
const medalOf = s => { let m = 'none'; for (const [n, v] of MEDALS) if (s >= v) m = n; return m; };

function summarize(rs, cap) {
  const s = { n: rs.length };
  const mins = rs.map(r => r.t / 60);
  s.surv = [0.1, 0.25, 0.5, 0.75, 0.9].map(p => q(mins, p));
  s.died = mean(rs.map(r => r.dead ? 1 : 0));
  s.score = [0.1, 0.25, 0.5, 0.75, 0.9].map(p => q(rs.map(r => r.score), p));
  s.level = [0.1, 0.5, 0.9].map(p => q(rs.map(r => r.level), p));
  s.firstCatch = q(rs.map(r => r.firstCatch === null ? null : r.firstCatch - r.firstGo), 0.5);
  s.firstCatch90 = q(rs.map(r => r.firstCatch === null ? null : r.firstCatch - r.firstGo), 0.9);
  s.noCatch = mean(rs.map(r => r.firstCatch === null ? 1 : 0));
  s.clear1 = mean(rs.map(r => r.lvT[0] !== undefined ? 1 : 0));
  s.loop1 = mean(rs.map(r => r.lvT[3] !== undefined ? 1 : 0));
  s.lvMed = []; s.lvP90 = [];
  for (let L = 0; L < 16; L++) { s.lvMed[L] = q(rs.map(r => r.lvT[L]), 0.5); s.lvP90[L] = q(rs.map(r => r.lvT[L]), 0.9); }
  s.catchZ = [0, 1, 2, 3].map(k => { const c = sum(rs.map(r => r.zc[k])), m = sum(rs.map(r => r.zm[k])); return c + m ? c / (c + m) : NaN; });
  s.catchZ0 = [0, 1, 2, 3].map(k => { const c = sum(rs.map(r => r.zc0[k])), m = sum(rs.map(r => r.zm0[k])); return c + m ? c / (c + m) : NaN; });
  s.zapRateZ = [0, 1, 2, 3].map(k => sum(rs.map(r => r.zz[k])) / Math.max(1e-9, sum(rs.map(r => r.zTime[k])) / 60));
  s.driftZ = [0, 1, 2, 3].map(k => sum(rs.map(r => r.drift[k])) / Math.max(1, sum(rs.map(r => r.driftN[k]))));
  s.goldPerLevel = sum(rs.map(r => r.goldDrop)) / Math.max(1, sum(rs.map(r => r.lvT.filter(x => x !== undefined).length + (r.dead ? 1 : 0))));
  s.goldCatch = sum(rs.map(r => r.goldCaught)) / Math.max(1, sum(rs.map(r => r.goldDrop)));
  s.goldCatch0 = sum(rs.map(r => r.goldCaught0)) / Math.max(1, sum(rs.map(r => r.goldDrop0)));
  s.goldDropShare = sum(rs.map(r => r.goldDrop)) / Math.max(1, sum(rs.map(r => r.starsDropped)));
  s.zapMin = sum(rs.map(r => r.zaps)) / sum(mins);
  s.jetMin = sum(rs.map(r => r.jets)) / sum(mins);
  s.jetHit = sum(rs.map(r => r.jetCatches)) / Math.max(1, sum(rs.map(r => r.jets)));
  s.scorePerMin = sum(rs.map(r => r.score)) / sum(mins);
  const cause = {}; for (const r of rs) for (const k in r.zapCause) cause[k] = (cause[k] || 0) + r.zapCause[k];
  s.cause = cause;
  s.deathLevel = q(rs.filter(r => r.dead).map(r => r.deathLevel), 0.5);
  const md = { none: 0, bronze: 0, silver: 0, gold: 0, platinum: 0 }; for (const r of rs) md[medalOf(r.score)]++;
  s.medals = md;
  s.at = {}; for (const m of [3, 5, 10]) s.at[m] = q(rs.map(r => r.scoreAt[m] !== undefined ? r.scoreAt[m] : r.score), 0.5);
  s.comboMed = q(rs.map(r => r.bestCombo), 0.5);
  return s;
}

function tables(S, models, diffs, title) {
  const each = fn => { let o = ''; for (const m of models) for (const d of diffs) { const s = S[m + '|' + d]; if (s) o += fn(m, d, s); } return o; };
  let md = `# ${title}\n\n## Survival, score, progress\n\n`;
  md += '| Model | Diff | Survival min p10/p25/med/p75/p90 | Died ≤ cap | Death level med | Score p10/med/p90 | Score/min | Level p10/med/p90 | 1st catch s med (p90, none) | Clear L1 / loop 1 |\n|---|---|---|---|---|---|---|---|---|---|\n';
  md += each((m, d, s) => `| ${m} | ${d} | ${s.surv.map(v => f(v, 1)).join(' / ')} | ${pct(s.died)} | ${f(s.deathLevel)} | ${f(s.score[0])} / ${f(s.score[2])} / ${f(s.score[4])} | ${f(s.scorePerMin)} | ${s.level.map(v => f(v)).join(' / ')} | ${f(s.firstCatch, 1)} (${f(s.firstCatch90, 1)}, ${pct(s.noCatch)}) | ${pct(s.clear1)} / ${pct(s.loop1)} |\n`);
  md += '\n## Level pacing: median s per level (zone → cleared), levels 1–12\n\n| Model | Diff | L1 | L2 | L3 | L4 | L5 | L6 | L7 | L8 | L9 | L10 | L11 | L12 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  md += each((m, d, s) => `| ${m} | ${d} | ${s.lvMed.slice(0, 12).map(v => f(v)).join(' | ')} |\n`);
  md += '\n## Weather: catch rate (loop 1 / all), zaps per min played, mean star sideways travel px\n\n| Model | Diff | Catch loop1 sun/rain/wind/snow | Catch all loops | Zap/min sun/rain/wind/snow | Drift px sun/rain/wind/snow |\n|---|---|---|---|---|---|\n';
  md += each((m, d, s) => `| ${m} | ${d} | ${s.catchZ0.map(v => f(v, 2)).join(' / ')} | ${s.catchZ.map(v => f(v, 2)).join(' / ')} | ${s.zapRateZ.map(v => f(v, 2)).join(' / ')} | ${s.driftZ.map(v => f(v)).join(' / ')} |\n`);
  md += '\n## Gold, jets, streak\n\n| Model | Diff | Gold / level | Gold share of stars | Gold caught (loop1 / all) | Jet/min (catch %) | Best streak med |\n|---|---|---|---|---|---|---|\n';
  md += each((m, d, s) => `| ${m} | ${d} | ${f(s.goldPerLevel, 2)} | ${pct(s.goldDropShare)} | ${pct(s.goldCatch0)} / ${pct(s.goldCatch)} | ${f(s.jetMin, 1)} (${pct(s.jetHit)}) | ${f(s.comboMed)} |\n`);
  md += '\n## Zap causes (share of all zaps) and medals (current thresholds 300/1000/2200/4000)\n\n| Model | Diff | Zap/min | Causes | Medals none/bronze/silver/gold/plat | Score @3/@5/@10 min med |\n|---|---|---|---|---|---|\n';
  md += each((m, d, s) => {
    const tot = sum(Object.values(s.cause)) || 1;
    const c = Object.entries(s.cause).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${pct(v / tot)}`).join(', ') || '–';
    const M = s.medals, n = s.n;
    return `| ${m} | ${d} | ${f(s.zapMin, 2)} | ${c} | ${['none', 'bronze', 'silver', 'gold', 'platinum'].map(k => pct(M[k] / n)).join(' / ')} | ${f(s.at[3])} / ${f(s.at[5])} / ${f(s.at[10])} |\n`;
  });
  return md;
}

/* ------------------------------------------------------------------ CLI / workers */
if (require.main === module && process.argv[2] === '--worker') {
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else if (require.main === module) {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const N = +arg('n', 120), cap = +arg('cap', 30), tag = arg('tag', 'baseline');
  const models = arg('models', ALL_MODELS.join(',')).split(','), diffs = arg('diffs', 'easy,normal,hard').split(',');
  const ovPath = arg('overrides', null), overrides = ovPath ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : null;
  const jobs = [];
  for (const model of models) for (const diff of diffs) for (let k = 0; k < N; k++) jobs.push({ model, diff, seed: 1000 + k * 7919, cap, overrides });
  const out = new Array(jobs.length);
  let next = 0, done = 0;
  const t0 = Date.now(), nW = +arg('workers', Math.min(require('os').cpus().length, 4));
  for (let k = 0; k < nW; k++) {
    const ch = fork(__filename, ['--worker']);
    const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
    ch.on('message', (m) => { out[m.i] = m.r; if (++done === jobs.length) finish(); feed(); });
    feed();
  }
  function finish() {
    const cells = {};
    jobs.forEach((j, i) => { (cells[j.model + '|' + j.diff] = cells[j.model + '|' + j.diff] || []).push(out[i]); });
    const S = {}; for (const k in cells) S[k] = summarize(cells[k], cap);
    const title = `Playtest — ${tag} — ${N} rounds per cell, ${cap} min cap${ovPath ? ' — overrides ' + path.basename(ovPath) : ''}`;
    const md = tables(S, models, diffs, title) + `\n${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s.\n`;
    console.log(md);
    const dir = path.join(__dirname, 'results');
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `playtest_${tag}.md`), md);
    fs.writeFileSync(path.join(dir, `playtest_${tag}.json`), JSON.stringify({ tag, N, cap, overrides, summary: S,
      runs: jobs.map((j, i) => Object.assign({ model: j.model, diff: j.diff, seed: j.seed }, out[i], { lvT: out[i].lvT, lvEnd: out[i].lvEnd })) }));
  }
}

module.exports = { runGame, summarize, HUMANS, ALL_MODELS };
