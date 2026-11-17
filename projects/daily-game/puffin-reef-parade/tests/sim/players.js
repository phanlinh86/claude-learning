#!/usr/bin/env node
// Dottie's Reef Parade — high-speed playtest: human-like player models + exploit probes (headless, no browser).
//
//   node tests/sim/players.js [suite] [N] [maxMin]
//     suite: base   (default) kid/casual/spam/bots × easy/normal/hard (+ kid on 4 arenas) + exploit probes
//            quick  kid/casual/spam × easy/normal/hard on landscape (the pacing table in docs/MECHANICS.md)
//            all    both
//   Writes tests/sim/results/players-<suite>.md (+ .json). Uses up to 4 child processes.
//
// Player models (all play ONLY through setTarget / setDir / action, like a real finger):
//   kid     age 5–6: finger on the nearest star (the golden one 80 % of the time when it is out, aimed where it IS,
//           no lead), 350–600 ms reaction, ±25° aim error, holds the finger still or drags one way for 1–2 s every
//           ~8 s, notices the parade only 35 % of the time, flips rarely (15 % when it sees a bonk coming + random taps).
//   casual  casual adult / older kid: 200 ms reaction, ±6° aim, picks the star by travel time (gold ×0.5, aimed a
//           little ahead), plans around the parade with short look-aheads, flips 50 % of the time when about to bonk.
//   spam    casual + presses flip every frame (exploit probe: flip must not make the game trivial).
//   bot.S   RP.Bot skill S (reference, sees everything).
//   Other probes: circle (max turn forever), orbit (finger circles the arena centre), wallhug (ride the coral
//           forever), edgedart (ignore the parade; dart to the star, back to the nearest wall, ride it to the next).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const { load } = require('../unit/load');

const TAU = Math.PI * 2;
const D2R = Math.PI / 180;
function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
function wrap(a) { a = (a + Math.PI) % TAU; if (a < 0) a += TAU; return a - Math.PI; }

/* ------------------------------ arenas (render.js layout, touch button avoid circle) ------------------------------ */
const ARENAS = {
  land: { name: 'landscape 960×540 (desktop / default)', a: [28, 76, 932, 516], avoid: [] },
  ipad: { name: 'iPad 4:3 (960×720, touch)', a: [28, 76, 932, 696], avoid: [{ x: 904, y: 664, r: 83 }] },
  port: { name: 'portrait phone (setArena 28,88,532,1080)', a: [28, 88, 532, 1080], avoid: [{ x: 496, y: 1040, r: 95 }] },
  wide: { name: 'wide phone 1170×540 (notch insets, touch)', a: [93, 76, 1077, 487], avoid: [{ x: 1042, y: 448, r: 93 }] }
};

/* ------------------------------ shared helpers ------------------------------ */
function nearestWallInfo(w, x, y) {
  const A = w.arena, r = w.cfg.heroR;
  const d = [x - (A.x0 + r), (A.x1 - r) - x, y - (A.y0 + r), (A.y1 - r) - y];
  let k = 0; for (let i = 1; i < 4; i++) if (d[i] < d[k]) k = i;
  return { side: k, dist: d[k] };
}

/** Simplified kinematic look-ahead used by the human models: heading eases toward `desired` (turnRate cap),
 *  edges mirror. Returns the earliest time a trail note (≥ safeNeck, outside the edge strip) is within `margin`. */
function lookAhead(w, desired, T, margin, out) {
  const c = w.cfg, s = w.hero, A = w.arena, r = c.heroR, h = 1 / 30, n = Math.ceil(T / h);
  let x = s.x, y = s.y, hd = s.heading, v = s.speed, t = 0;
  const tr = w.trail, m2 = margin * margin, auth = s.dizzy > 0 ? c.dizzySteer : 1;
  out.danger = -1; out.x = x; out.y = y;
  for (let k = 0; k < n; k++) {
    if (desired !== null) hd += clamp(wrap(desired - hd) * c.turnGain, -c.turnRate * auth, c.turnRate * auth) * h;
    x += Math.cos(hd) * v * h; y += Math.sin(hd) * v * h;
    let wx = 0, wy = 0;
    if (x < A.x0 + r) { x = 2 * (A.x0 + r) - x; wx = -1; } else if (x > A.x1 - r) { x = 2 * (A.x1 - r) - x; wx = 1; }
    if (y < A.y0 + r) { y = 2 * (A.y0 + r) - y; wy = -1; } else if (y > A.y1 - r) { y = 2 * (A.y1 - r) - y; wy = 1; }
    if (wx || wy) hd = w.bounceHeading(hd, wx, wy, 0, x, y);
    t += h;
    if (out.danger < 0 && !(s.invuln > t) && !w.inEdgeZone(x, y)) {
      for (let i = c.safeNeck; i < tr.length; i++) {
        const dx = tr[i].x - x, dy = tr[i].y - y;
        if (dx * dx + dy * dy < m2) { out.danger = t; break; }
      }
    }
  }
  out.x = x; out.y = y;
  return out;
}

/* ------------------------------ player models ------------------------------ */
class Delayed {
  // Commands are decided now (from what the player sees) and applied after the reaction delay.
  constructor(w, rng) { this.w = w; this.rng = rng; this.t = 0; this.q = []; this.mode = 'chase'; }
  push(delay, cmd) { cmd.at = this.t + delay; this.q.push(cmd); }
  flush() {
    const w = this.w;
    while (this.q.length && this.q[0].at <= this.t) {
      const c = this.q.shift();
      if (c.k === 'tgt') { w.setDir(0, 0); w.setTarget(c.x, c.y); }
      else if (c.k === 'dir') { w.setTarget(null); w.setDir(Math.cos(c.h), Math.sin(c.h)); }
      else if (c.k === 'flip') { if (w.action()) this.flipsOk = (this.flipsOk || 0) + 1; }
    }
  }
}
const goldOf = w => w.notes.find(n => n._g && n.state !== 'hide') || null;

class Kid extends Delayed {
  constructor(w, rng, p) {
    super(w, rng);
    this.p = Object.assign({ delay: [0.35, 0.6], aim: 25, every: [0.18, 0.32], holdEvery: 8, hold: [1, 2],
      tailAware: 0.35, flipOnDanger: 0.15, randomFlipEvery: 25, goldLove: 0.8 }, p || {});
    this.next = 0; this.holdUntil = -1; this.aimErr = 0; this.aimFor = -1; this.la = {}; this.goldId = -1; this.wantsGold = false;
  }
  step(dt) {
    this.t += dt; this.flush();
    const w = this.w, s = w.hero, P = this.p, r = this.rng;
    if (w.state === 'dead') return;
    if (this.t < this.next) return;
    this.next = this.t + P.every[0] + r.next() * (P.every[1] - P.every[0]);
    if (this.t < this.holdUntil) return;
    const d = P.delay[0] + r.next() * (P.delay[1] - P.delay[0]);
    if (P.randomFlipEvery && r.chance((P.every[0] + P.every[1]) / 2 / P.randomFlipEvery)) this.push(d, { k: 'flip' });
    // sometimes the finger just stays put, or drags off one way, for 1–2 s
    if (P.holdEvery && r.chance(((P.every[0] + P.every[1]) / 2) / P.holdEvery)) {
      this.holdUntil = this.t + P.hold[0] + r.next() * (P.hold[1] - P.hold[0]);
      this.mode = 'hold';
      if (r.chance(0.5)) this.push(d, { k: 'dir', h: s.heading + r.range(-0.6, 0.6) });
      return;
    }
    this.mode = 'chase';
    // the shiny one! (decided once per golden star)
    const g = goldOf(w);
    if (g && g.id !== this.goldId) { this.goldId = g.id; this.wantsGold = r.chance(P.goldLove); }
    let best = null, bd = 1e9;
    if (g && this.wantsGold) { best = g; bd = Math.hypot(g.x - s.x, g.y - s.y); }
    else for (const n of w.notes) { if (n._g) continue; const dd = Math.hypot(n.x - s.x, n.y - s.y); if (dd < bd) { bd = dd; best = n; } }
    if (!best) return;
    if (this.t > this.aimFor) { this.aimErr = r.range(-P.aim, P.aim) * D2R; this.aimFor = this.t + r.range(0.6, 1.2); }
    let b = Math.atan2(best.y - s.y, best.x - s.x) + this.aimErr, dist = Math.max(bd, 40);
    let tx = s.x + Math.cos(b) * dist, ty = s.y + Math.sin(b) * dist;
    if (w.trail.length > w.cfg.safeNeck && r.chance(P.tailAware)) {
      lookAhead(w, b, 0.7, w.cfg.bonkR + 8, this.la);
      if (this.la.danger >= 0) {
        let ok = false;
        for (const off of [0.9, -0.9, 1.6, -1.6]) {
          lookAhead(w, s.heading + off, 0.7, w.cfg.bonkR + 8, this.la);
          if (this.la.danger < 0) { tx = s.x + Math.cos(s.heading + off) * 120; ty = s.y + Math.sin(s.heading + off) * 120; ok = true; break; }
        }
        if (!ok && r.chance(P.flipOnDanger)) this.push(d, { k: 'flip' });
      }
    }
    this.push(d, { k: 'tgt', x: tx, y: ty });
  }
}

class Casual extends Delayed {
  constructor(w, rng, p) {
    super(w, rng);
    this.p = Object.assign({ delay: 0.2, aim: 6, every: 0.1, flipOnDanger: 0.5, spam: false }, p || {});
    this.next = 0; this.la = {}; this.tid = -1;
  }
  step(dt) {
    this.t += dt; this.flush();
    const w = this.w, s = w.hero, c = w.cfg, P = this.p, r = this.rng;
    if (w.state === 'dead') return;
    if (P.spam) w.action();
    if (this.t < this.next) return;
    this.next = this.t + P.every;
    const v = Math.max(60, s.speed);
    let best = null, bc = 1e9, cur = null, cc = 1e9, bx = 0, by = 0;
    for (const n of w.notes) {
      if (n.state === 'hide') continue;
      let x = n.x, y = n.y;
      const eta0 = Math.hypot(x - s.x, y - s.y) / v;
      if (n._g) { x += n.vx * eta0 * 0.5; y += n.vy * eta0 * 0.5; }            // a little lead
      const dx = x - s.x, dy = y - s.y, d = Math.hypot(dx, dy), da = Math.abs(wrap(Math.atan2(dy, dx) - s.heading));
      const eta = d / v + da / c.turnRate;
      if ((n.state === 'loose' || n._g) && n.life < eta + 0.4) continue;
      const cost = eta * (n._g ? 0.5 : n.state === 'loose' ? 0.7 : 1);
      if (cost < bc) { bc = cost; best = n; bx = x; by = y; }
      if (n.id === this.tid) { cur = n; cc = cost; }
    }
    if (cur && cur !== best && cc < bc * 1.3 + 0.2) { best = cur; bx = cur.x; by = cur.y; }
    if (!best) return;
    this.tid = best.id;
    const base = Math.atan2(by - s.y, bx - s.x) + r.range(-P.aim, P.aim) * D2R;
    let pick = null, firstDanger = 1e9;
    for (const off of [0, 0.35, -0.35, 0.8, -0.8, 1.4, -1.4, 2.2, -2.2]) {
      const h = base + off;
      lookAhead(w, h, 0.8, c.bonkR + 7, this.la);
      if (this.la.danger < 0) { pick = h; break; }
      if (this.la.danger < firstDanger) firstDanger = this.la.danger;
    }
    if (pick === null) {
      pick = base;
      if (firstDanger < 0.45 && r.chance(P.flipOnDanger)) this.push(P.delay, { k: 'flip' });
    }
    if (pick === base) { this.push(P.delay, { k: 'tgt', x: bx, y: by }); return; }
    const dist = Math.max(60, Math.hypot(bx - s.x, by - s.y));
    this.push(P.delay, { k: 'tgt', x: s.x + Math.cos(pick) * dist, y: s.y + Math.sin(pick) * dist });
  }
}

class Circle {          // holds a direction 90° to the side forever → max-rate circle
  constructor(w) { this.w = w; }
  step() { const s = this.w.hero; this.w.setDir(Math.cos(s.heading + 1.4), Math.sin(s.heading + 1.4)); }
}
class Orbit {           // finger slowly circles the arena centre (mindless lawn-mower)
  constructor(w) { this.w = w; }
  step() {
    const w = this.w, A = w.arena, cx = (A.x0 + A.x1) / 2, cy = (A.y0 + A.y1) / 2;
    const Rx = 0.34 * (A.x1 - A.x0), Ry = 0.34 * (A.y1 - A.y0), s = w.hero;
    const a = Math.atan2((s.y - cy) / Ry, (s.x - cx) / Rx) + 0.6;
    w.setTarget(cx + Math.cos(a) * Rx, cy + Math.sin(a) * Ry);
  }
}
class WallHug {         // ride the coral clockwise forever
  constructor(w) { this.w = w; }
  step() {
    const w = this.w, s = w.hero, wi = nearestWallInfo(w, s.x, s.y);
    if (wi.dist > w.cfg.wallSlide * 0.6) { const h = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][wi.side]; w.setDir(Math.cos(h), Math.sin(h)); return; }
    const h = [-Math.PI / 2, Math.PI / 2, 0, Math.PI][wi.side], into = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][wi.side];
    w.setDir(Math.cos(h) + 0.4 * Math.cos(into), Math.sin(h) + 0.4 * Math.sin(into));
  }
}
class EdgeDart {        // never thinks about the parade: star → nearest wall → ride → star
  constructor(w) { this.w = w; this.phase = 'dart'; this.song = 0; this.tRide = 0; }
  step(dt) {
    const w = this.w, s = w.hero;
    if (w.song !== this.song || w.state !== 'playing') { if (w.song > this.song) this.phase = 'wall'; this.song = w.song; }
    let best = null, bd = 1e9;
    for (const n of w.notes) { const d = Math.hypot(n.x - s.x, n.y - s.y); if (d < bd) { bd = d; best = n; } }
    if (!best) return;
    const wi = nearestWallInfo(w, s.x, s.y);
    if (this.phase === 'wall') {
      if (w.inEdgeZone(s.x, s.y)) { this.phase = 'ride'; this.tRide = 0; }
      else { const h = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][wi.side]; w.setTarget(null); w.setDir(Math.cos(h), Math.sin(h)); return; }
    }
    if (this.phase === 'ride') {
      this.tRide += dt;
      const along = wi.side < 2 ? best.y - s.y : best.x - s.x;
      if (Math.abs(along) < 40 || this.tRide > 4) this.phase = 'dart';
      else { w.setTarget(null); w.setDir(wi.side < 2 ? 0 : Math.sign(along), wi.side < 2 ? Math.sign(along) : 0); return; }
    }
    w.setDir(0, 0); w.setTarget(best.x, best.y);
  }
}

function makePlayer(RP, w, model, seed) {
  const rng = new RP.RNG(seed * 31 + 7);
  if (model.startsWith('bot')) return new RP.Bot(w, { skill: +model.slice(3), seed: seed * 13 + 5 });
  switch (model) {
    case 'kid': return new Kid(w, rng);
    case 'kid-oblivious': return new Kid(w, rng, { tailAware: 0 });
    case 'casual': return new Casual(w, rng);
    case 'spam': return new Casual(w, rng, { spam: true });
    case 'circle': return new Circle(w);
    case 'orbit': return new Orbit(w);
    case 'wallhug': return new WallHug(w);
    case 'edgedart': return new EdgeDart(w);
  }
  throw new Error('model ' + model);
}

/* ------------------------------ one game ------------------------------ */
function runGame(job) {
  const RP = load(['rng.js', 'world.js', 'bot.js']);
  const cfg = Object.assign({}, RP.DIFFICULTY[job.diff], job.over || {});
  const w = new RP.World({ seed: job.seed, config: cfg });
  const AR = ARENAS[job.arena || 'land'];
  w.setArena(AR.a[0], AR.a[1], AR.a[2], AR.a[3], AR.avoid);
  const pl = makePlayer(RP, w, job.model, job.seed);
  const dt = 1 / 60, maxT = job.maxMin * 60, c = w.cfg;
  let t = 0, playT = 0, edgeT = 0, l1 = null, goldOut = 0, maxGoldStill = 0, still = 0, lastG = null, goldOutside = 0;
  const lap0 = [], bonkTags = {}, deathLv = [];
  const tag = (k) => { bonkTags[k] = (bonkTags[k] || 0) + 1; };
  let lastBounce = -9;
  while (w.state !== 'dead' && t < maxT && !(job.stopAfter !== undefined && w.levelsCleared > job.stopAfter)) {
    pl.step(dt); w.update(dt); t += dt;
    const s = w.hero;
    if (w.state === 'playing') { playT += dt; if (w.inEdgeZone(s.x, s.y)) edgeT += dt; }
    // golden star sanity: inside the arena, never stuck while out
    const g = w.notes.find(n => n._g && n.state === 'flee');
    if (g) {
      goldOut += dt;
      const A = w.arena;
      if (g.x < A.x0 || g.x > A.x1 || g.y < A.y0 || g.y > A.y1) goldOutside++;
      if (lastG && lastG.id === g.id && Math.hypot(g.x - lastG.x, g.y - lastG.y) < 0.05) still += dt; else still = 0;
      if (still > maxGoldStill) maxGoldStill = still;
      lastG = { id: g.id, x: g.x, y: g.y };
    } else { lastG = null; still = 0; }
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'bounce': lastBounce = w.time; break;
        case 'cleared':
          if (w.lap === 0) lap0[e.level] = w.levelTime;
          if (e.level === 0) l1 = w.levelTime;
          break;
        case 'bonk': {
          if (w.time - lastBounce < 0.7) tag('after-bounce');
          if (pl.mode === 'hold') tag('kid-hold');
          tag(nearestWallInfo(w, s.x, s.y).dist < c.edgeSafe + 40 ? 'near-strip' : 'open-field');
          if (e.hearts <= 0) deathLv.push(w.level);
          break;
        }
      }
    }
  }
  return { t: playT, score: w.score, cleared: w.levelsCleared, dead: w.state === 'dead', bonks: w.bonks, flips: w.flips,
    golds: w.golds, goldMissed: w.goldMissed, goldOut, maxGoldStill, goldOutside, lap0, l1, edge: edgeT / Math.max(1e-9, playT),
    bonkTags, deathLv, level: w.level };
}

/* ------------------------------ suites ------------------------------ */
function jobsFor(suite, N, maxMin) {
  const J = [];
  const add = (model, diff, arena, over, label, extra) => {
    for (let k = 0; k < N; k++) J.push(Object.assign({ model, diff, arena, over, label: label || 'current', seed: 2000 + k * 7919, maxMin }, extra || {}));
  };
  if (suite === 'quick' || suite === 'base' || suite === 'all')
    for (const diff of ['easy', 'normal', 'hard']) for (const m of ['kid', 'casual', 'spam']) add(m, diff, 'land');
  if (suite === 'base' || suite === 'all') {
    for (const diff of ['easy', 'normal']) for (const arena of ['ipad', 'port', 'wide']) add('kid', diff, arena);
    for (const diff of ['easy', 'normal', 'hard']) for (const m of ['bot0.4', 'bot1']) add(m, diff, 'land');
    add('casual', 'normal', 'port'); add('kid-oblivious', 'normal', 'land');
    const NE = Math.max(4, N >> 2);
    for (const m of ['circle', 'orbit', 'wallhug', 'edgedart']) for (const diff of ['normal', 'hard'])
      for (let k = 0; k < NE; k++) J.push({ model: m, diff, arena: 'land', label: 'current', seed: 5000 + k * 7919, maxMin });
  }
  return J;
}

/* ------------------------------ report ------------------------------ */
const pct = (a, p) => { a = a.filter(v => v !== undefined && v !== null && isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const f = (v, d) => (isFinite(v) ? v.toFixed(d === undefined ? 0 : d) : '–');
const dist3 = a => `${f(pct(a, 0.1))} / ${f(pct(a, 0.5))} / ${f(pct(a, 0.9))}`;

function summarize(rs) {
  const mins = rs.reduce((a, r) => a + r.t / 60, 0), N = rs.length, sum = k => rs.reduce((a, r) => a + r[k], 0);
  const tags = {};
  for (const r of rs) for (const k in r.bonkTags) tags[k] = (tags[k] || 0) + r.bonkTags[k];
  return {
    N, dead: rs.filter(r => r.dead).length, surv: rs.map(r => r.t / 60), score: rs.map(r => r.score), cleared: rs.map(r => r.cleared),
    lap: [0, 1, 2, 3].map(z => rs.map(r => r.lap0[z])), lapN: [0, 1, 2, 3].map(z => rs.filter(r => r.lap0[z] !== undefined).length),
    bpm: sum('bonks') / mins, fpm: sum('flips') / mins, golds: sum('golds'), goldMissed: sum('goldMissed'),
    goldOutside: sum('goldOutside'), maxGoldStill: Math.max(...rs.map(r => r.maxGoldStill)), edge: sum('edge') / N, tags,
    deathLv: rs.flatMap(r => r.deathLv)
  };
}

function report(suite, N, maxMin, jobs, out, wall) {
  const groups = new Map();
  jobs.forEach((j, i) => { const k = [j.label, j.model, j.diff, j.arena].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(out[i]); });
  const S = {};
  for (const [k, rs] of groups) S[k] = summarize(rs);
  let md = `# Player-model playtest — suite \`${suite}\`, ${N} rounds per cell (probes N/4), ${maxMin} min cap, dt 1/60\n\n`;
  md += 'Arenas: ' + Object.entries(ARENAS).map(([k, a]) => `\`${k}\` = ${a.name} [${a.a}]`).join('; ') + '\n\n';
  md += '| Model | Diff | Arena | N | Died ≤ cap | Clear season 1 / 2 / 3 / 4 (lap 1) | s per season, lap 1 (median): spring / summer / autumn / winter | Season-1 s p10/p50/p90 | Survival min p10/p50/p90 | Levels (med) | Bonks/min | Flips/min | Gold caught | Score (med) |\n';
  md += '|' + '---|'.repeat(14) + '\n';
  for (const [k, s] of Object.entries(S)) {
    const [, model, diff, arena] = k.split('|');
    md += `| ${model} | ${diff} | ${arena} | ${s.N} | ${s.dead} | ${s.lapN.map(n => f(100 * n / s.N) + '%').join(' / ')} | ` +
      s.lap.map(a => f(pct(a, 0.5))).join(' / ') + ` | ${dist3(s.lap[0])} | ${dist3(s.surv)} | ${f(pct(s.cleared, 0.5))} | ${f(s.bpm, 2)} | ${f(s.fpm, 1)} | ` +
      `${s.golds}/${s.golds + s.goldMissed} (${f(100 * s.golds / Math.max(1, s.golds + s.goldMissed))}%) | ${f(pct(s.score, 0.5))} |\n`;
  }
  md += '\n## Bonk context and golden-star sanity\n\n| Model | Diff | Arena | after-bounce | kid-hold | near-strip / open-field | Deaths by level | Gold outside arena (steps) | Gold longest still (s) |\n|' + '---|'.repeat(9) + '\n';
  for (const [k, s] of Object.entries(S)) {
    const lv = {}; s.deathLv.forEach(l => { lv[l] = (lv[l] || 0) + 1; });
    md += `| ${k.split('|').slice(1).join(' | ')} | ${s.tags['after-bounce'] || 0} | ${s.tags['kid-hold'] || 0} | ${s.tags['near-strip'] || 0} / ${s.tags['open-field'] || 0} | ` +
      `${Object.entries(lv).map(([l, n]) => `L${l}:${n}`).join(' ') || '–'} | ${s.goldOutside} | ${f(s.maxGoldStill, 2)} |\n`;
  }
  md += `\n(${jobs.length} games, ${(wall / 1000).toFixed(0)} s wall time)\n`;
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `players-${suite}.md`), md);
  console.log(md);
}

if (require.main === module && process.argv[2] === '--worker') {
  process.on('message', (m) => { if (m === 'exit') process.exit(0); process.send({ i: m.i, r: runGame(m.job) }); });
} else if (require.main === module) {
  const suite = process.argv[2] || 'base', N = +process.argv[3] || 40, maxMin = +process.argv[4] || 8;
  const jobs = jobsFor(suite, N, maxMin), out = new Array(jobs.length), t0 = Date.now();
  let next = 0, done = 0;
  const nW = Math.max(1, Math.min(require('os').cpus().length, 4));
  for (let k = 0; k < nW; k++) {
    const ch = fork(__filename, ['--worker']);
    const feed = () => { if (next < jobs.length) { ch.send({ i: next, job: jobs[next] }); next++; } else ch.send('exit'); };
    ch.on('message', (m) => {
      out[m.i] = m.r;
      if (++done % 50 === 0) process.stderr.write(`${done}/${jobs.length}\n`);
      if (done === jobs.length) report(suite, N, maxMin, jobs, out, Date.now() - t0);
      feed();
    });
    feed();
  }
}
module.exports = { runGame, makePlayer, ARENAS };
