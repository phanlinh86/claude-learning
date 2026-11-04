// Lulu's Jungle Tower — child models for the high-speed playtest (report-only).
//   const M = require('./hs_models'); const d = M.makeModel('spammer', world, age, seed);
// Models drive ONLY the public input API (pointerDown/Move/Up, talkAnswer), exactly like a finger.
//   typical      per-age child (tests/sim/lib.js Kid): thinks, drags slowly, aims around the drop point
//   slow3        slow 3-year-old: thinks 3–8 s, 40 % wrong, very slow drags, often distracted, wobbly aim
//   dropHigh     lets go far above the tower (up to 380 px over the drop point, or at the top inset)
//   dropLow      lets go LOW: half the time beside the tower, below its top (the toss-up rule), wider aim
//   sloppy       aims badly: 35 % of releases land outside the drop zone (grass misses → the block flies home)
//   thoughtful   97 % right, thinks 3–5 s
//   spammer      taps a random block (or Lulu) 6×/s, never drags
//   swiper       quick random swipes from random blocks to random points every 0.5–1.5 s (a toddler "playing with it")
//   tapper       random taps anywhere (lib.js)
//   confused     random taps, but drags a glowing block to the tower with p = 0.85 (does help reach it?)
//   absent       never touches the screen · talkAbsent: typical, but never answers Talk time
//   bot<skill>   JT.Bot
'use strict';
const L = require('./lib');
const JT = L.JT, clamp = L.clamp;

function talkRandom(self, dt, after) {
  const w = self.w, r = self.r;
  if (w.talkAnswered) return;
  if (self.talkT < 0) self.talkT = r.float(after[0], after[1]);
  self.talkT -= dt;
  if (self.talkT <= 0) { self.talkT = -1; w.talkAnswer(r.pick(w.talk.choices).id); }
}

class Spammer {
  constructor(w, seed) { this.w = w; this.r = new JT.RNG(seed); this.t = 0.3; this.talkT = -1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [1, 2]);
    this.talkT = -1;
    this.t -= dt; if (this.t > 0) return;
    this.t += 1 / 6;
    let x, y;
    const ps = w.pieces.filter(p => p.state !== 'gone' && p.state !== 'out');
    if (ps.length && r.chance(0.85)) { const p = r.pick(ps); x = p.x + r.float(-0.3, 0.3) * w.layout.S; y = p.y + r.float(-0.3, 0.3) * w.layout.S; }
    else { const h = w.luluHit(); x = h.x; y = h.y; }
    this.stats.taps++;
    L.tapAt(w, x, y);
  }
}

class Swiper {
  constructor(w, seed) { this.w = w; this.r = new JT.RNG(seed); this.t = 1; this.talkT = -1; this.f = new L.Finger(w, this.r); this.stats = { taps: 0, drags: 0, drops: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [2, 5]);
    this.talkT = -1;
    if (this.f.busy) { const res = this.f.step(dt); if (res === 'drop') this.stats.drops++; return; }
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.5, 1.5);
    const ps = L.restingPieces(w), Lw = w.layout;
    if (!ps.length) { this.stats.taps++; L.tapAt(w, r.float(0, Lw.W), r.float(0, Lw.H)); return; }
    const p = r.pick(ps);
    this.stats.taps++;
    if (this.f.start(p.x, p.y, r.float(0, Lw.W), r.float(0, Lw.H), { steps: [3, 6], stepDt: [0.02, 0.05], hold: [0, 0.05], arc: 30 }) === p.id) this.stats.drags++;
  }
}

class Confused {
  constructor(w, seed) { this.w = w; this.r = new JT.RNG(seed); this.t = 1; this.talkT = -1; this.f = new L.Finger(w, this.r); this.stats = { taps: 0, drags: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [3, 6]);
    this.talkT = -1;
    if (this.f.busy) { this.f.step(dt); return; }
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(1, 2.5);
    const g = w.state === 'round' && w.phase === 'ask' ? L.restingPieces(w).find(p => p.glow > 0.3) : null;
    this.stats.taps++;
    if (g && r.chance(0.85)) { const dp = w.dropPoint(); if (this.f.start(g.x, g.y, dp.x, dp.y, L.typicalProfile(3)) === g.id) this.stats.drags++; return; }
    L.tapAt(w, r.float(0, w.layout.W), r.float(0, w.layout.H));
  }
}

class Absent { constructor() { this.stats = { taps: 0 }; } step() {} }

function slowProfile() {
  return Object.assign(L.typicalProfile(3), { skill: 0.6, think: [3, 8], retry: [2, 4], followHint: 0.8, pDistract: 0.12, distract: [4, 12],
    pButterfly: 0.5, talk: [4, 9], talkRight: 0.6, steps: [14, 24], stepDt: [0.06, 0.11], hold: [0.2, 0.8], aimX: 1.0, pTap: 0.25 });
}

function makeModel(name, w, age, seed) {
  switch (name) {
    case 'typical': return new L.Kid(w, L.typicalProfile(age), seed);
    case 'slow3': return new L.Kid(w, slowProfile(), seed);
    case 'dropHigh': return new L.Kid(w, Object.assign(L.typicalProfile(age), { aimUp: [120, 380] }), seed);
    case 'dropLow': return new L.Kid(w, Object.assign(L.typicalProfile(age), { aimDown: 1.2, aimX: 1.0 }), seed);
    case 'sloppy': return new L.Kid(w, Object.assign(L.typicalProfile(age), { aimX: 1.6 }), seed);
    case 'thoughtful': return new L.Kid(w, Object.assign(L.typicalProfile(age), { skill: 0.97, think: [3, 5], pDistract: 0 }), seed);
    case 'talkAbsent': { const k = new L.Kid(w, L.typicalProfile(age), seed); const s = k.step.bind(k); k.step = dt => { if (w.state !== 'talk') s(dt); }; return k; }
    case 'tapper': return new L.Tapper(w, seed);
    case 'spammer': return new Spammer(w, seed);
    case 'swiper': return new Swiper(w, seed);
    case 'confused': return new Confused(w, seed);
    case 'absent': return new Absent();
  }
  const m = /^bot([\d.]+)$/.exec(name);
  if (m) return new JT.Bot(w, { skill: +m[1], seed });
  throw new Error('unknown model ' + name);
}

module.exports = { makeModel, Spammer, Swiper, Confused, Absent, slowProfile, clamp };
