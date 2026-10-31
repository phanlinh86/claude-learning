#!/usr/bin/env node
// Spike's Dino Jam — high-speed playtest: human-like player models + exploit probes (headless, no browser).
//
//   node tests/sim/players.js [suite] [N] [maxMin]
//     suite: base   (default) kid/adult/bots × easy/normal × 4 arenas + exploit probes
//            tune   kid on easy/normal (landscape + portrait) with the proposed changes vs current
//            all    both
//   Writes tests/sim/results/players-<suite>.md (+ .json). Uses up to 4 child processes.
//
// Player models (all play ONLY through setTarget / setDir / action, like a real finger):
//   kid    age 5–6: finger on the nearest note, 350–600 ms reaction, ±25° aim error, holds the finger still or
//          drags in one direction for 1–2 s every ~8 s, notices the tail only 35 % of the time, kickflips rarely
//          (15 % when it sees a bonk coming + random taps), ignores half of the pillow shadows.
//   adult  casual adult: 200 ms reaction, ±6° aim, picks the note by travel time, plans around its tail with short
//          look-aheads, kickflips 50 % of the time when about to bonk, notices 85 % of the pillows.
//   bot.S  DJ.Bot skill S (reference, sees everything).
//   Exploit probes: flipspam (adult + action() every frame), circle (max turn forever), orbit (finger circles the
//          arena centre, mindless), wallhug (ride the bushes forever), edgedart (ignore the tail; dart to the note,
//          go back to the nearest bush, ride it to the next note).
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
  const A = w.arena, r = w.cfg.spikeR;
  const d = [x - (A.x0 + r), (A.x1 - r) - x, y - (A.y0 + r), (A.y1 - r) - y];
  let k = 0; for (let i = 1; i < 4; i++) if (d[i] < d[k]) k = i;
  return { side: k, dist: d[k] };
}

/** Simplified kinematic look-ahead used by the human models: heading eases toward `desired` (turnRate cap),
 *  edges mirror. Returns the earliest time a trail note (≥ safeNeck, outside the edge strip) is within `margin`. */
function lookAhead(w, desired, T, margin, out) {
  const c = w.cfg, s = w.spike, A = w.arena, r = c.spikeR, h = 1 / 30, n = Math.ceil(T / h);
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

class Kid extends Delayed {
  constructor(w, rng, p) {
    super(w, rng);
    this.p = Object.assign({ delay: [0.35, 0.6], aim: 25, every: [0.18, 0.32], holdEvery: 8, hold: [1, 2],
      tailAware: 0.35, flipOnDanger: 0.15, randomFlipEvery: 25, pillowNotice: 0.5, pillowFlip: 0.3 }, p || {});
    this.next = 0; this.holdUntil = -1; this.seen = new Set(); this.dodgeUntil = -1; this.dodge = null;
    this.aimErr = 0; this.aimFor = -1; this.la = {};
  }
  step(dt) {
    this.t += dt; this.flush();
    const w = this.w, s = w.spike, P = this.p, r = this.rng;
    if (w.state === 'dead') return;
    // pillows: half of the shadows are noticed (once, when they appear)
    for (const pl of w.pillows) {
      if (pl.state !== 'fall' || this.seen.has(pl.id)) continue;
      this.seen.add(pl.id);
      if (!r.chance(P.pillowNotice)) continue;
      const tl = pl.dur - pl.t, R = c_hitR(w) + 25;
      const px = s.x + Math.cos(s.heading) * s.speed * tl, py = s.y + Math.sin(s.heading) * s.speed * tl;
      if (Math.hypot(px - pl.x, py - pl.y) > R + 40) continue;             // "it's not on me"
      const d = P.delay[0] + r.next() * (P.delay[1] - P.delay[0]);
      if (r.chance(P.pillowFlip)) this.push(d, { k: 'flip' });            // taps as soon as they react
      else {
        const ax = s.x - pl.x, ay = s.y - pl.y, l = Math.hypot(ax, ay) || 1;
        const sgn = r.sign();                                              // run sideways off the shadow
        const hx = Math.cos(s.heading), hy = Math.sin(s.heading);
        const tx = s.x + (-hy * sgn) * 160 + (ax / l) * 60, ty = s.y + (hx * sgn) * 160 + (ay / l) * 60;
        this.push(d, { k: 'tgt', x: tx, y: ty });
        this.dodgeUntil = this.t + d + tl;
      }
    }
    if (this.t < this.next) return;
    this.next = this.t + P.every[0] + r.next() * (P.every[1] - P.every[0]);
    if (this.t < this.holdUntil || this.t < this.dodgeUntil) return;
    const d = P.delay[0] + r.next() * (P.delay[1] - P.delay[0]);
    if (P.randomFlipEvery && r.chance((P.every[0] + P.every[1]) / 2 / P.randomFlipEvery)) this.push(d, { k: 'flip' });
    // sometimes the finger just stays put, or drags off one way, for 1–2 s
    if (P.holdEvery && r.chance(((P.every[0] + P.every[1]) / 2) / P.holdEvery)) {
      this.holdUntil = this.t + P.hold[0] + r.next() * (P.hold[1] - P.hold[0]);
      this.mode = 'hold';
      if (r.chance(0.5)) this.push(d, { k: 'dir', h: s.heading + r.range(-0.6, 0.6) });
      return;                                                              // else: finger rests where it was
    }
    this.mode = 'chase';
    // nearest note (straight-line), the kid doesn't think about turning circles or loose timers
    let best = null, bd = 1e9;
    for (const n of w.notes) { const dd = Math.hypot(n.x - s.x, n.y - s.y); if (dd < bd) { bd = dd; best = n; } }
    if (!best) return;
    if (this.t > this.aimFor) { this.aimErr = r.range(-P.aim, P.aim) * D2R; this.aimFor = this.t + r.range(0.6, 1.2); }
    let b = Math.atan2(best.y - s.y, best.x - s.x) + this.aimErr, dist = Math.max(bd, 40);
    let tx = s.x + Math.cos(b) * dist, ty = s.y + Math.sin(b) * dist;
    if (w.trail.length > w.cfg.safeNeck && r.chance(P.tailAware)) {
      lookAhead(w, b, 0.7, w.cfg.bonkR + 8, this.la);
      if (this.la.danger >= 0) {
        // swerve: pick the side whose look-ahead is clear (or the wider turn)
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
function c_hitR(w) { return w.cfg.spikeR + w.cfg.pillowHitPad; }

class Adult extends Delayed {
  constructor(w, rng, p) {
    super(w, rng);
    this.p = Object.assign({ delay: 0.2, aim: 6, every: 0.1, flipOnDanger: 0.5, pillowNotice: 0.85, spam: false }, p || {});
    this.next = 0; this.noticed = new Map(); this.la = {}; this.tid = -1;
  }
  step(dt) {
    this.t += dt; this.flush();
    const w = this.w, s = w.spike, c = w.cfg, P = this.p, r = this.rng;
    if (w.state === 'dead') return;
    if (P.spam) w.action();
    if (this.t < this.next) return;
    this.next = this.t + P.every;
    // target: travel-time estimate with a turning penalty, loose notes preferred if they will survive
    const v = Math.max(60, s.speed);
    let best = null, bc = 1e9, cur = null, cc = 1e9;
    for (const n of w.notes) {
      const dx = n.x - s.x, dy = n.y - s.y, d = Math.hypot(dx, dy), da = Math.abs(wrap(Math.atan2(dy, dx) - s.heading));
      const eta = d / v + da / c.turnRate;
      if (n.state === 'loose' && n.life < eta + 0.4) continue;
      const cost = eta * (n.state === 'loose' ? 0.7 : 1);
      if (cost < bc) { bc = cost; best = n; }
      if (n.id === this.tid) { cur = n; cc = cost; }
    }
    if (cur && cc < bc * 1.3 + 0.2) best = cur;
    if (!best) return;
    this.tid = best.id;
    const base = Math.atan2(best.y - s.y, best.x - s.x) + r.range(-P.aim, P.aim) * D2R;
    // pillows: noticed ones are treated as no-go discs around the landing time
    const danger = [];
    for (const pl of w.pillows) {
      if (pl.state !== 'fall') continue;
      if (!this.noticed.has(pl.id)) this.noticed.set(pl.id, r.chance(P.pillowNotice));
      if (this.noticed.get(pl.id)) danger.push(pl);
    }
    let pick = null, firstDanger = 1e9;
    for (const off of [0, 0.35, -0.35, 0.8, -0.8, 1.4, -1.4, 2.2, -2.2]) {
      const h = base + off;
      lookAhead(w, h, 0.8, c.bonkR + 7, this.la);
      let dz = this.la.danger;
      if (dz < 0 && danger.length) dz = pillowDanger(w, h, danger);
      if (dz < 0) { pick = h; break; }
      if (dz < firstDanger) firstDanger = dz;
    }
    if (pick === null) {
      pick = base;
      if (firstDanger < 0.45 && r.chance(P.flipOnDanger)) this.push(P.delay, { k: 'flip' });
    }
    // pillow nearly on me and I couldn't steer out: flip (50 %)
    for (const pl of danger) {
      const tl = pl.dur - pl.t;
      if (tl < c.jumpTime * 0.7 + P.delay && tl > P.delay && Math.hypot(s.x + Math.cos(s.heading) * s.speed * tl - pl.x, s.y + Math.sin(s.heading) * s.speed * tl - pl.y) < c_hitR(w) + 8 && r.chance(0.5 * P.every / 0.3))
        this.push(P.delay, { k: 'flip' });
    }
    // clear line: finger on the note itself; otherwise finger off to the side (a point 60+ px along the detour)
    if (pick === base) { this.push(P.delay, { k: 'tgt', x: best.x, y: best.y }); return; }
    const dist = Math.max(60, Math.hypot(best.x - s.x, best.y - s.y));
    this.push(P.delay, { k: 'tgt', x: s.x + Math.cos(pick) * dist, y: s.y + Math.sin(pick) * dist });
  }
}
function pillowDanger(w, h, pls) {
  const c = w.cfg, s = w.spike, A = w.arena, r = c.spikeR, step = 1 / 30;
  let x = s.x, y = s.y, hd = s.heading, t = 0;
  const T = Math.max(...pls.map(p => p.dur - p.t)) + 0.05, R = c_hitR(w) + 10;
  while (t < T) {
    hd += clamp(wrap(h - hd) * c.turnGain, -c.turnRate, c.turnRate) * step;
    x = clamp(x + Math.cos(hd) * s.speed * step, A.x0 + r, A.x1 - r); y = clamp(y + Math.sin(hd) * s.speed * step, A.y0 + r, A.y1 - r);
    t += step;
    for (const p of pls) if (Math.abs(p.dur - p.t - t) < step && Math.hypot(p.x - x, p.y - y) < R) return t;
  }
  return -1;
}

class Circle {          // holds a direction 90° to the side forever → max-rate circle
  constructor(w) { this.w = w; }
  step() { const s = this.w.spike; this.w.setDir(Math.cos(s.heading + 1.4), Math.sin(s.heading + 1.4)); }
}
class Orbit {           // finger slowly circles the arena centre (mindless lawn-mower)
  constructor(w) { this.w = w; this.a = 0; }
  step(dt) {
    const w = this.w, A = w.arena, cx = (A.x0 + A.x1) / 2, cy = (A.y0 + A.y1) / 2;
    const Rx = 0.34 * (A.x1 - A.x0), Ry = 0.34 * (A.y1 - A.y0), s = w.spike;
    const a = Math.atan2((s.y - cy) / Ry, (s.x - cx) / Rx) + 0.6;       // a point ahead on the ellipse
    w.setTarget(cx + Math.cos(a) * Rx, cy + Math.sin(a) * Ry);
  }
}
class WallHug {         // ride the bushes clockwise forever
  constructor(w) { this.w = w; }
  step() {
    const w = this.w, s = w.spike, wi = nearestWallInfo(w, s.x, s.y);
    if (wi.dist > w.cfg.wallSlide * 0.6) {                             // go to the nearest bush first
      const h = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][wi.side]; w.setDir(Math.cos(h), Math.sin(h)); return;
    }
    const h = [-Math.PI / 2, Math.PI / 2, 0, Math.PI][wi.side];        // clockwise along this bush
    const into = [Math.PI, 0, -Math.PI / 2, Math.PI / 2][wi.side];
    w.setDir(Math.cos(h) + 0.4 * Math.cos(into), Math.sin(h) + 0.4 * Math.sin(into));
  }
}
class EdgeDart {        // never thinks about the tail: note → nearest bush → ride → note
  constructor(w) { this.w = w; this.phase = 'dart'; this.song = 0; this.tRide = 0; }
  step(dt) {
    const w = this.w, s = w.spike, A = w.arena, r = w.cfg.spikeR;
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

function makePlayer(DJ, w, model, seed) {
  const rng = new DJ.RNG(seed * 31 + 7);
  if (model.startsWith('bot')) return new DJ.Bot(w, { skill: +model.slice(3), seed: seed * 13 + 5 });
  switch (model) {
    case 'kid': return new Kid(w, rng);
    case 'kid-oblivious': return new Kid(w, rng, { tailAware: 0 });
    case 'adult': return new Adult(w, rng);
    case 'flipspam': return new Adult(w, rng, { spam: true });
    case 'circle': return new Circle(w);
    case 'orbit': return new Orbit(w);
    case 'wallhug': return new WallHug(w);
    case 'edgedart': return new EdgeDart(w);
  }
  throw new Error('model ' + model);
}

/* ------------------------------ one game ------------------------------ */
function escapable(w, px, py, tl, react) {
  // can a grounded Spike be outside the hit circle at landing, given `react` s of going straight first?
  const c = w.cfg, s = w.spike, A = w.arena, r = c.spikeR, R = c_hitR(w), h = 1 / 60;
  for (const f of [-1, -0.5, 0, 0.5, 1]) {
    let x = s.x, y = s.y, hd = s.heading, om = s.turn, t = 0, dz = s.dizzy, v = s.speed;
    while (t < tl) {
      const auth = dz > 0 ? c.dizzySteer : 1, cmd = t < react ? om : f * c.turnRate * auth;
      om += (clamp(cmd, -c.turnRate * auth, c.turnRate * auth) - om) * (1 - Math.exp(-c.turnEase * h));
      hd += om * h; x = clamp(x + Math.cos(hd) * v * h, A.x0 + r, A.x1 - r); y = clamp(y + Math.sin(hd) * v * h, A.y0 + r, A.y1 - r);
      dz -= h; t += h;
    }
    if (Math.hypot(x - px, y - py) > R + 2) return true;
  }
  return false;
}

function runGame(job) {
  const DJ = load(['rng.js', 'world.js', 'bot.js']);
  const cfg = Object.assign({}, DJ.DIFFICULTY[job.diff], job.over || {});
  const w = new DJ.World({ seed: job.seed, config: cfg });
  if (cfg._bounceGrace) {
    // CODE prototype (not a CONFIG key): no self-bonk for _bounceGrace s after a bush bounce
    const emit = w._emit, collide = w._collide;
    w._lastBounce = -9;
    w._emit = function (e) { if (e.type === 'bounce') this._lastBounce = this.time; return emit.call(this, e); };
    w._collide = function () {
      if (this.time - this._lastBounce >= this.cfg._bounceGrace) return collide.call(this);
      const keep = this.cfg.safeNeck; this.cfg.safeNeck = 1e9; collide.call(this); this.cfg.safeNeck = keep;
    };
  }
  const AR = ARENAS[job.arena];
  w.setArena(AR.a[0], AR.a[1], AR.a[2], AR.a[3], AR.avoid);
  const pl = makePlayer(DJ, w, job.model, job.seed);
  const dt = 1 / 60, maxT = job.maxMin * 60, c = w.cfg;
  let t = 0, goT = -1, firstNote = null, lastBounce = -9, lastPillowHit = -9, air = 0, playT = 0, edgeT = 0;
  let suppressed = 0, lastSupp = -9, throws = 0, unfair = 0, unfairNoReact = 0, pillAvoid = 0, looseAvoid = 0;
  let spawnBad = { avoid: 0, trail: 0, near: 0, total: 0 }, maxNoteAge = 0, l1 = null;
  const lap0 = [], bonkTags = {}, deathTags = [], seenNotes = new Set();
  const tag = (o, k) => { o[k] = (o[k] || 0) + 1; };
  const firstClear = {};
  while (w.state !== 'dead' && t < maxT && !(job.stopAfter !== undefined && w.levelsCleared > job.stopAfter)) {
    pl.step(dt); w.update(dt); t += dt;
    const s = w.spike;
    if (w.state === 'playing') {
      playT += dt; if (s.jump > 0) air += dt;
      if (w.inEdgeZone(s.x, s.y)) {
        edgeT += dt;
        if (s.z <= c.airZ && !(s.invuln > 0) && t - lastSupp > 0.5) {
          for (let i = c.safeNeck; i < w.trail.length; i++) {
            const q = w.trail[i]; if (q.join < 1) continue;
            if (Math.hypot(q.x - s.x, q.y - s.y) < c.bonkR) { suppressed++; lastSupp = t; break; }
          }
        }
      }
    }
    for (const n of w.notes) {
      if (n.state === 'loose') continue;
      if (!seenNotes.has(n.id)) {
        seenNotes.add(n.id); spawnBad.total++;
        for (const a of w.avoid) if (Math.hypot(n.x - a.x, n.y - a.y) < a.r + c.noteR) { spawnBad.avoid++; break; }
        for (const q of w.trail) if (Math.hypot(n.x - q.x, n.y - q.y) < 20) { spawnBad.trail++; break; }
        if (Math.hypot(n.x - s.x, n.y - s.y) < c.spikeR + c.pickPad + 5) spawnBad.near++;
      }
      if (n.t > maxNoteAge) maxNoteAge = n.t;
    }
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'go': goT = w.time; break;
        case 'note': if (firstNote === null && goT >= 0) firstNote = w.time - goT; break;
        case 'bounce': lastBounce = w.time; break;
        case 'pillowhit': lastPillowHit = w.time; break;
        case 'cleared':
          if (w.lap === 0) lap0[e.level] = w.levelTime;
          if (e.level === 0) l1 = w.levelTime;
          break;
        case 'throw': {
          throws++;
          if (w.state !== 'playing') break;
          const p = { x: e.tx, y: e.ty }, tl = c.pillowDur;
          for (const a of w.avoid) if (Math.hypot(p.x - a.x, p.y - a.y) < a.r) { pillAvoid++; break; }
          const flipReady = s.flip + (tl - 0.3) / c.flipRecharge >= 1 || s.jump > 0;
          if (!escapable(w, p.x, p.y, tl, 0.4) && !flipReady) unfair++;
          if (!escapable(w, p.x, p.y, tl, 0) && !flipReady) unfairNoReact++;
          break;
        }
        case 'loosegone': for (const a of w.avoid) if (Math.hypot(e.x - a.x, e.y - a.y) < a.r) { looseAvoid++; break; } break;
        case 'bonk': {
          const tg = [];
          if (w.time - lastBounce < 0.7) tg.push('after-bounce');
          if (w.time - lastPillowHit < 1.5) tg.push('pillow-dizzy');
          if (w.boss.state !== 'away') tg.push('boss-visit');
          if (pl.mode === 'hold') tg.push('kid-hold');
          const wd = nearestWallInfo(w, s.x, s.y).dist;
          tg.push(wd < c.edgeSafe + 40 ? 'near-strip' : 'open-field');
          tg.push('trail' + (w.trail.length + e.lost < 10 ? '<10' : w.trail.length + e.lost < 16 ? '10-15' : '16+'));
          for (const k of tg) tag(bonkTags, k);
          if (e.hearts <= 0) deathTags.push({ tags: tg, level: w.level, biome: w.biome });
          break;
        }
      }
    }
  }
  return { t: playT, score: w.score, cleared: w.levelsCleared, dead: w.state === 'dead', bonks: w.bonks, hits: w.pillowHits,
    dodges: w.dodges, flips: w.flips, throws, lap0, l1, firstNote, air: air / Math.max(1e-9, playT), edge: edgeT / Math.max(1e-9, playT),
    suppressed, unfair, unfairNoReact, pillAvoid, looseAvoid, spawnBad, maxNoteAge, bonkTags, deathTags, level: w.level };
}

/* ------------------------------ suites ------------------------------ */
// Proposed changes (prototype through config overrides only).
const PROPOSED = {
  easy: { speed0: 105, speedPerBiome: 4, safeNeck: 7, bonkR: 12, songTargets: [8, 10, 12, 14], trailSpacing: 22 },
  normal: { safeNeck: 6, bonkR: 14, songTargets: [10, 12, 14, 16], trailSpacing: 22 }
};

function jobsFor(suite, N, maxMin) {
  const J = [];
  const add = (model, diff, arena, over, label, extra) => {
    for (let k = 0; k < N; k++) J.push(Object.assign({ model, diff, arena, over, label: label || 'current', seed: 2000 + k * 7919, maxMin }, extra || {}));
  };
  if (suite === 'base' || suite === 'all') {
    for (const diff of ['easy', 'normal']) for (const arena of ['land', 'ipad', 'port', 'wide']) add('kid', diff, arena);
    for (const diff of ['easy', 'normal', 'hard']) for (const m of ['adult', 'bot0.4', 'bot1']) add(m, diff, 'land');
    add('adult', 'normal', 'port'); add('adult', 'normal', 'wide');
    add('kid-oblivious', 'normal', 'land');
    const NE = Math.max(4, N >> 2);
    for (const m of ['flipspam', 'circle', 'orbit', 'wallhug', 'edgedart']) for (const diff of ['normal', 'hard'])
      for (let k = 0; k < NE; k++) J.push({ model: m, diff, arena: 'land', label: 'current', seed: 5000 + k * 7919, maxMin });
    for (let k = 0; k < NE; k++) J.push({ model: 'edgedart', diff: 'normal', arena: 'port', label: 'current', seed: 5000 + k * 7919, maxMin });
  }
  if (suite === 'tune' || suite === 'all') {
    for (const diff of ['easy', 'normal']) for (const arena of ['land', 'port', 'wide']) for (const lab of ['current', 'proposed'])
      add('kid', diff, arena, lab === 'proposed' ? PROPOSED[diff] : undefined, lab);
    for (const lab of ['current', 'proposed']) {
      add('adult', 'normal', 'land', lab === 'proposed' ? PROPOSED.normal : undefined, lab);
      add('bot1', 'normal', 'land', lab === 'proposed' ? PROPOSED.normal : undefined, lab);
      add('edgedart', 'normal', 'land', lab === 'proposed' ? PROPOSED.normal : undefined, lab);
    }
  }
  return J;
}

/* ------------------------------ report ------------------------------ */
const pct = (a, p) => { a = a.filter(v => v !== undefined && v !== null && isFinite(v)).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : NaN; };
const f = (v, d) => (isFinite(v) ? v.toFixed(d === undefined ? 0 : d) : '–');
const dist3 = a => `${f(pct(a, 0.1))} / ${f(pct(a, 0.5))} / ${f(pct(a, 0.9))}`;

function summarize(rs) {
  const mins = rs.reduce((a, r) => a + r.t / 60, 0), N = rs.length;
  const sum = k => rs.reduce((a, r) => a + r[k], 0);
  const tags = {}, death = {};
  for (const r of rs) { for (const k in r.bonkTags) tags[k] = (tags[k] || 0) + r.bonkTags[k]; for (const d of r.deathTags) for (const k of d.tags) death[k] = (death[k] || 0) + 1; }
  const sb = rs.reduce((a, r) => { for (const k in r.spawnBad) a[k] = (a[k] || 0) + r.spawnBad[k]; return a; }, {});
  return {
    N, dead: rs.filter(r => r.dead).length, b1: rs.filter(r => r.l1 !== null).length,
    surv: rs.map(r => r.t / 60), score: rs.map(r => r.score), cleared: rs.map(r => r.cleared), first: rs.map(r => r.firstNote),
    lap: [0, 1, 2, 3].map(z => rs.map(r => r.lap0[z])), lapN: [0, 1, 2, 3].map(z => rs.filter(r => r.lap0[z] !== undefined).length),
    bpm: sum('bonks') / mins, hpm: sum('hits') / mins, dpm: sum('dodges') / mins, fpm: sum('flips') / mins, tpm: sum('throws') / mins,
    air: sum('air') / N, edge: sum('edge') / N, supp: sum('suppressed') / mins, unfair: sum('unfair'), unfair0: sum('unfairNoReact'),
    throws: sum('throws'), pillAvoid: sum('pillAvoid'), looseAvoid: sum('looseAvoid'), sb, maxAge: Math.max(...rs.map(r => r.maxNoteAge)),
    tags, death, deathLv: rs.filter(r => r.dead).map(r => r.level)
  };
}

function report(suite, N, maxMin, jobs, out, wall) {
  const groups = new Map();
  jobs.forEach((j, i) => { const k = [j.label, j.model, j.diff, j.arena].join('|'); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(out[i]); });
  const S = {};
  for (const [k, rs] of groups) S[k] = summarize(rs);
  let md = `# Player-model playtest — suite \`${suite}\`, ${N} rounds per cell (exploit probes N/4), ${maxMin} min cap, dt 1/60\n\n`;
  md += 'Arenas: ' + Object.entries(ARENAS).map(([k, a]) => `\`${k}\` = ${a.name} [${a.a}]`).join('; ') + '\n\n';
  md += '| Set | Model | Diff | Arena | N | Died ≤ cap | Clear biome 1 | Biome-1 s p10/p50/p90 | s per level lap 1 (median, n): meadow / swamp / canyon / snow | 1st note s (med) | Survival min p10/p50/p90 | Score p10/p50/p90 | Levels (med) | Bonks/min | Pillow hits/min | Dodges/min | Airborne % | In edge strip % | Edge-saved contacts/min |\n';
  md += '|' + '---|'.repeat(20) + '\n';
  for (const [k, s] of Object.entries(S)) {
    const [lab, model, diff, arena] = k.split('|');
    md += `| ${lab} | ${model} | ${diff} | ${arena} | ${s.N} | ${s.dead} | ${f(100 * s.b1 / s.N)} % | ${dist3(s.lap[0])} | ` +
      s.lap.map((a, z) => `${f(pct(a, 0.5))} (${s.lapN[z]})`).join(' / ') +
      ` | ${f(pct(s.first, 0.5), 1)} | ${dist3(s.surv).replace(/(\d+)/g, '$1')} | ${dist3(s.score)} | ${f(pct(s.cleared, 0.5))} | ${f(s.bpm, 2)} | ${f(s.hpm, 2)} | ${f(s.dpm, 2)} | ${f(100 * s.air)} | ${f(100 * s.edge)} | ${f(s.supp, 2)} |\n`;
  }
  md += '\n## Bonk context (share of all bonks; tags overlap) and death context\n\n| Set | Model | Diff | Arena | Bonks | after-bounce | pillow-dizzy | boss-visit | kid-hold | near-strip | open-field | trail<10 / 10-15 / 16+ | Deaths by level (0 = biome 1) |\n|' + '---|'.repeat(13) + '\n';
  for (const [k, s] of Object.entries(S)) {
    const tot = Object.values(s.tags).length ? (s.tags['near-strip'] || 0) + (s.tags['open-field'] || 0) : 0;
    if (!tot) continue;
    const p = n => f(100 * (s.tags[n] || 0) / tot) + ' %';
    const lv = {}; s.deathLv.forEach(l => { lv[l] = (lv[l] || 0) + 1; });
    md += `| ${k.split('|').join(' | ')} | ${tot} | ${p('after-bounce')} | ${p('pillow-dizzy')} | ${p('boss-visit')} | ${p('kid-hold')} | ${p('near-strip')} | ${p('open-field')} | ${p('trail<10')} / ${p('trail10-15')} / ${p('trail16+')} | ${Object.entries(lv).map(([l, n]) => `L${l}:${n}`).join(' ') || '–'} |\n`;
  }
  md += '\n## Fairness checks\n\n| Set | Model | Diff | Arena | Pillows thrown | Unescapable + no flip (0.4 s reaction) | … (instant reaction) | Pillows landing under the touch button | Loose notes vanishing under the button | Notes spawned (under button / on trail / on Spike) | Oldest idle note s |\n|' + '---|'.repeat(11) + '\n';
  for (const [k, s] of Object.entries(S)) {
    md += `| ${k.split('|').join(' | ')} | ${s.throws} | ${s.unfair} (${f(100 * s.unfair / Math.max(1, s.throws), 1)} %) | ${s.unfair0} | ${s.pillAvoid} | ${s.looseAvoid} | ${s.sb.total} (${s.sb.avoid} / ${s.sb.trail} / ${s.sb.near}) | ${f(s.maxAge)} |\n`;
  }
  md += `\n(${jobs.length} games, ${(wall / 1000).toFixed(0)} s wall time)\n`;
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `players-${suite}.md`), md);
  fs.writeFileSync(path.join(dir, `players-${suite}.json`), JSON.stringify(S, (k, v) => (Array.isArray(v) && v.length > 50 ? undefined : v)));
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
module.exports = { runGame, makePlayer, ARENAS, PROPOSED };
