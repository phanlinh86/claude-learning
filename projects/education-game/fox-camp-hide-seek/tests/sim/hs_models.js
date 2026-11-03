// Pip's Camp Hide & Seek — extra child models for the high-speed playtest (report-only).
//   const M = require('./hs_models'); const d = M.makeModel('spammer', world, age, seed);
// Models drive ONLY the public input API (pointerDown/Move/Up, talkAnswer), exactly like a finger.
'use strict';
const L = require('./lib');
const FC = L.FC, clamp = L.clamp;

function talkRandom(self, dt, after) {
  const w = self.w, r = self.r;
  if (w.talkAnswered) return;
  if (self.talkT < 0) self.talkT = r.float(after[0], after[1]);
  self.talkT -= dt;
  if (self.talkT <= 0) { self.talkT = -1; w.talkAnswer(r.pick(w.talk.choices).id); }
}

/** Spammer: taps 6×/s. mode 'places' → always on a random current hiding place (also during gather / count / peek);
 *  mode 'any' → anywhere on the screen. Talk: random choice after 1–2 s. */
class Spammer {
  constructor(w, seed, mode) { this.w = w; this.r = new FC.RNG(seed); this.mode = mode || 'places'; this.t = 0.3; this.talkT = -1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [1, 2]);
    this.talkT = -1;
    this.t -= dt; if (this.t > 0) return;
    this.t += 1 / 6;
    let x, y;
    const ps = w.places.filter(p => !p.leaving);
    if (this.mode === 'places' && ps.length) { const h = w.placeHit(r.pick(ps)); x = h.x + r.float(-0.3, 0.3) * h.w * 0.6; y = h.y + r.float(-0.25, 0.25) * h.h * 0.6; }
    else { x = r.float(0, w.layout.W); y = r.float(0, w.layout.H); }
    this.stats.taps++;
    L.tapAt(w, x, y);
  }
}

/** Confused child: does not understand the question yet — taps random spots every 1–2.5 s, but when a place glows
 *  (hint) it taps that place with p = 0.85. Measures whether help reaches a child who taps the grass. */
class Confused {
  constructor(w, seed) { this.w = w; this.r = new FC.RNG(seed); this.t = 1; this.talkT = -1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [3, 6]);
    this.talkT = -1;
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(1, 2.5);
    const g = w.state === 'round' && w.phase === 'ask' ? L.hiddenPlaces(w).find(p => p.glow > 0.3) : null;
    let x, y;
    if (g && r.chance(0.85)) { const h = w.placeHit(g.id); x = h.x; y = h.y; } else { x = r.float(0, w.layout.W); y = r.float(0, w.layout.H); }
    this.stats.taps++;
    L.tapAt(w, x, y);
  }
}

/** Absent child: never touches the screen (the parent started the game and walked off with the child). */
class Absent { constructor() { this.stats = { taps: 0 }; } step() {} }

/** Sloppy tapper: aims at a place like a typical child but lands ON its hit area (35 %), just OUTSIDE the padded hit box
 *  (45 %: 10–70 px beyond it) or anywhere (20 %). A tap that hits nothing → tries again after 1–2 s. */
class Sloppy {
  constructor(w, age, seed) {
    this.w = w; this.r = new FC.RNG(seed); this.p = L.typicalProfile(age); this.key = ''; this.t = -1; this.tried = []; this.talkT = -1;
    this.stats = { taps: 0, tapFail: 0, on: 0, near: 0, far: 0 };
  }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') return talkRandom(this, dt, [3, 6]);
    this.talkT = -1;
    if (w.state !== 'round' || w.phase !== 'ask') return;
    const key = w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask;
    if (key !== this.key) { this.key = key; this.tried = []; this.t = r.float(p.think[0], p.think[1]); }
    this.t -= dt; if (this.t > 0) return;
    const ans = w.answerId(); if (!ans) return;
    const right = w.placeById(ans), wrong = L.hiddenPlaces(w).filter(q => q.id !== ans && !this.tried.includes(q.id));
    const pl = r.chance(right.glow > 0.3 ? p.followHint : p.skill) || !wrong.length ? right : r.pick(wrong);
    const h = w.placeHit(pl.id), kind = r.next();
    let x, y;
    if (kind < 0.35) { this.stats.on++; x = h.x + r.float(-0.25, 0.25) * h.w * 0.6; y = h.y + r.float(-0.2, 0.2) * h.h * 0.6; }
    else if (kind < 0.8) {
      this.stats.near++;
      const a = r.float(0, Math.PI * 2), rx = h.w / 2 + 22, ry = h.h / 2 + 22, ex = r.float(10, 70);
      x = h.x + Math.cos(a) * (rx + ex); y = h.y + Math.sin(a) * (ry + ex);
    } else { this.stats.far++; x = r.float(0, w.layout.W); y = r.float(0, w.layout.H); }
    x = clamp(x, 2, w.layout.W - 2); y = clamp(y, 2, w.layout.H - 2);
    this.stats.taps++;
    const id = L.tapAt(w, x, y);
    if (!id || id === 'pip' || id === 'pokePip') { this.stats.tapFail++; this.t = r.float(1, 2); }
    else { if (id !== 'locked' && id !== 'empty') this.tried.push(id); this.t = r.float(1, 2); }
  }
}

function slowProfile() {   // slow 3-year-old: long think 3–8 s, 40 % wrong, long retries, often distracted
  return { skill: 0.6, think: [3, 8], retry: [2, 4], followHint: 0.8, pDistract: 0.12, distract: [4, 12], pCritter: 0.5, talk: [4, 9], talkRight: 0.6, spread: 0.35 };
}

function makeModel(name, w, age, seed) {
  switch (name) {
    case 'typical': return new L.Kid(w, L.typicalProfile(age), seed);
    case 'slow3': return new L.Kid(w, slowProfile(), seed);
    case 'talkAbsent': { const k = new L.Kid(w, L.typicalProfile(age), seed); const s = k.step.bind(k); k.step = dt => { if (w.state !== 'talk') s(dt); }; return k; }
    case 'tapper': return new L.Tapper(w, seed);
    case 'spammer': return new Spammer(w, seed, 'places');
    case 'spammerAny': return new Spammer(w, seed, 'any');
    case 'sloppy': return new Sloppy(w, age, seed);
    case 'absent': return new Absent();
    case 'confused': return new Confused(w, seed);
  }
  const m = /^bot([\d.]+)$/.exec(name);
  if (m) return new FC.Bot(w, { skill: +m[1], seed });
  throw new Error('unknown model ' + name);
}

module.exports = { makeModel, Spammer, Absent, Sloppy, Confused, slowProfile };
