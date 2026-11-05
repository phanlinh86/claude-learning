// Bop's Rainy Band — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
// Loads rng/content/world/bot into node and drives ONLY the public input API (pointerDown/Move/Up, talkAnswer) like a finger.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
function loadRB() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'world.js', 'bot.js']) vm.runInThisContext(fs.readFileSync(path.join(JS, f), 'utf8'), { filename: f });
  return globalThis.RB;
}
const RB = loadRB();

// Logical viewports (short side 720) with safe-area insets converted from CSS px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 } }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function mkWorld(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new RB.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}
function tapAt(w, x, y) { const id = w.pointerDown(x, y); const up = w.pointerUp(x, y); return up || id; }
function inBox(r, b, k) { return { x: b.x + r.float(-k, k) * b.w / 2, y: b.y + r.float(-k, k) * b.h / 2 }; }

/** A finger press that lasts `dur` seconds and drifts `drift` px (a real child's tap is not instant). */
class Finger {
  constructor(w, r) { this.w = w; this.r = r; this.p = null; }
  get busy() { return !!this.p; }
  press(x, y, dur, drift) {
    const res = this.w.pointerDown(x, y);
    const a = this.r.float(0, Math.PI * 2);
    this.p = { x, y, t: dur, x1: x + Math.cos(a) * drift, y1: y + Math.sin(a) * drift, dur, res };
    return res;
  }
  /** → null while pressed, else the pointerUp result ('none' when nothing happened) */
  step(dt) {
    const p = this.p;
    if (!p) return null;
    p.t -= dt;
    const u = clamp(1 - p.t / p.dur, 0, 1);
    this.w.pointerMove(p.x + (p.x1 - p.x) * u, p.y + (p.y1 - p.y) * u);
    if (p.t > 0) return null;
    this.p = null;
    return this.w.pointerUp(p.x1, p.y1) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * Kid (typical child of an age): after each `ask` (a listen ask: after the beats) it listens + thinks U(think) s (the prompt
 * itself takes ≈ 1.5–2.5 s), sometimes looks away U(distract) s first (p = pDistract). Then it taps: the right member with
 * p = skill (a glowing hint: p = followHint), else a member it has not tried. A tap lasts U(tapDur) s with a drift of
 * U(0, drift) px; with p = pSlide it slides instead (> 40 px: nothing happens) and tries again. Drum asks: taps the big drum
 * n times U(drumGap) apart; with p = pMiscount it stops one short (then waits for the idle nudge or the count card) or
 * adds one extra boom; with p = pBandTap per drum ask it first taps a band drum instead of the big drum. With p = pPoke per
 * ask it taps Bop (repeat / replay the beats). Snail: tapped with p = pSnail. Talk: answers after U(talk), right with p = talkRight. */
const SKILL = { 3: 0.65, 4: 0.75, 5: 0.82, 6: 0.86, 7: 0.9 };
const THINK = { 3: [2.2, 4.0], 4: [1.8, 3.4], 5: [1.6, 3.0], 6: [1.4, 2.6], 7: [1.3, 2.4] };
const DRUMGAP = { 3: [0.55, 1.0], 4: [0.45, 0.85], 5: [0.4, 0.75], 6: [0.35, 0.65], 7: [0.3, 0.6] };
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], retry: [1.0, 2.0], followHint: 0.85, pDistract: age <= 4 ? 0.1 : 0.05, distract: [3, 10],
    tapDur: [0.06, 0.3], drift: age <= 3 ? 22 : 14, pSlide: age <= 3 ? 0.08 : 0.04, drumGap: DRUMGAP[age], pMiscount: age <= 4 ? 0.2 : 0.1,
    pBandTap: age <= 4 ? 0.1 : 0.04, pPoke: 0.05, pSnail: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05) };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.55, think: [3, 8], retry: [2, 4], followHint: 0.8, pDistract: 0.15, distract: [4, 12],
    tapDur: [0.1, 0.5], drift: 30, pSlide: 0.15, drumGap: [0.7, 1.4], pMiscount: 0.3, pBandTap: 0.2, talk: [4, 9], talkRight: 0.6 });
}
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.8, 1.4], pDistract: 0, pSlide: 0, pMiscount: 0, pBandTap: 0, pPoke: 0,
    drumGap: [0.3, 0.45], talk: [1, 2], talkRight: 1 });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new RB.RNG(seed); this.key = ''; this.t = -1; this.tried = []; this.talkT = -1;
    this.f = new Finger(w, this.r); this.poked = false; this.sn = null; this.snT = null;
    this.drum = null; this.idleSeen = 0;
    this.stats = { taps: 0, slides: 0, snail: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  talk(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.talkAnswered) return;
    if (this.talkT < 0) this.talkT = this.rf(p.talk);
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = -1; const t = w.talk; let pick = t.answerId;
      if (!r.chance(t.glowAnswer ? 0.95 : p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answerId); if (wr.length) pick = r.pick(wr).id; }
      w.talkAnswer(pick);
    }
  }
  tap(box, k) {
    const p = this.p, r = this.r, pt = inBox(r, box, k === undefined ? 0.6 : k), slide = r.chance(p.pSlide);
    this.stats.taps++;
    if (slide) this.stats.slides++;
    return this.f.press(pt.x, pt.y, slide ? r.float(0.2, 0.5) : this.rf(p.tapDur), slide ? r.float(50, 120) : r.float(0, p.drift));
  }
  /** main.js tells the world which idle nudge was spoken: a child that stopped one short hears "drum N times" and goes on */
  onEvent(e) { if (e.type === 'idle') this.idleSeen++; }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') return this.talk(dt);
    this.talkT = -1;
    if (w.state !== 'round') { this.f.p = null; return; }
    if (this.f.busy) {
      const res = this.f.step(dt);
      if (res === null) return;
      if (res === 'wrong') { this.tried.push(this.cur); this.t = this.rf(p.retry) + w.cfg.wrongLock; }
      else if (res === 'locked') this.t = 0.5;
      else if (res === 'none') this.t = r.float(0.3, 0.8);   // a slide or a tap beside the target: try again
      return;
    }
    const S = w.snail;
    if (S && S.state !== 'out') {
      if (this.sn !== S) { this.sn = S; this.snT = r.chance(p.pSnail) ? r.float(0.8, 2.0) : null; }
      if (this.snT != null && (this.snT -= dt) <= 0) { this.snT = null; this.tap(w.snailHit(), 0.4); return; }
    }
    if (w.phase !== 'ask') return;
    const key = w.sessions + ':' + w.level + ':' + w.round + ':' + w.ask, pr = w.prompt();
    if (key !== this.key) {
      this.key = key; this.tried = []; this.poked = !r.chance(p.pPoke); this.idleSeen = 0;
      this.t = this.rf(p.think) + (r.chance(p.pDistract) ? this.rf(p.distract) : 0);
      this.drum = pr.mode === 'drum' ? { want: pr.n + (r.chance(p.pMiscount) ? (r.chance(0.5) ? -1 : 1) : 0), done: 0, band: r.chance(p.pBandTap), idle0: 0 } : null;
      if (this.drum && this.drum.want < 1) this.drum.want = pr.n;
    }
    this.t -= dt;
    if (this.t > 0) return;
    if (!this.poked) { this.poked = true; this.tap(w.bopHit(), 0.4); this.t = this.rf([1.5, 2.5]); return; }
    if (this.drum) {
      const D = this.drum;
      if (D.band && w.members.length) { D.band = false; this.tap(w.memberHit(r.pick(w.members)), 0.5); this.t = this.rf([1.0, 2.0]); return; }
      if (D.done >= D.want) {           // stopped short: waits for the nudge (or the glowing drum) and taps once more
        if (this.idleSeen > D.idle0 || w.bigDrum.glow > 0.3) { D.want++; D.idle0 = this.idleSeen; }
        else return;
      }
      D.done++;
      this.tap(w.bigDrumHit(), 0.5);
      this.t = this.rf(p.drumGap);
      return;
    }
    const ans = w.answerId(); if (!ans) return;
    const right = w.memberById(ans); if (!right) return;
    const wrong = w.members.filter(m => m.id !== ans && m.state === 'rest' && !this.tried.includes(m.id));
    const m = r.chance(right.glow > 0.3 ? p.followHint : p.skill) || !wrong.length ? right : r.pick(wrong);
    this.cur = m.id;
    this.tap(w.memberHit(m), 0.6);
  }
}

/** Random tapper: a toddler hammering the screen at random spots every U(0.3, 1.5) s; Talk: a random choice after 2–5 s. */
class Tapper {
  constructor(w, seed) { this.w = w; this.r = new RB.RNG(seed); this.t = 0.5; this.talkT = -1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [2, 5]);
    this.t -= dt;
    if (this.t > 0) return;
    this.t = r.float(0.3, 1.5);
    const L = w.layout;
    this.stats.taps++;
    tapAt(w, r.float(0, L.W), r.float(0, L.H));
  }
}
function talkRandom(self, dt, after) {
  const w = self.w, r = self.r;
  if (w.talkAnswered) return;
  if (self.talkT < 0) self.talkT = r.float(after[0], after[1]);
  self.talkT -= dt;
  if (self.talkT <= 0) { self.talkT = -1; w.talkAnswer(r.pick(w.talk.choices).id); }
}
/** Spammer: taps a random member / the big drum / Bop 6×/s, never waits. */
class Spammer {
  constructor(w, seed) { this.w = w; this.r = new RB.RNG(seed); this.t = 0.3; this.talkT = -1; this.stats = { taps: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [1, 2]);
    this.talkT = -1;
    this.t -= dt; if (this.t > 0) return;
    this.t += 1 / 6;
    let b;
    const ms = w.members.filter(m => m.state === 'rest'), u = r.next();
    if (ms.length && u < 0.7) b = w.memberHit(r.pick(ms)); else if (u < 0.9) b = w.bigDrumHit(); else b = w.bopHit();
    const pt = inBox(r, b, 0.6);
    this.stats.taps++;
    tapAt(w, pt.x, pt.y);
  }
}
class Absent { constructor() { this.stats = { taps: 0 }; } step() {} }

function makeModel(name, w, age, seed) {
  switch (name) {
    case 'typical': return new Kid(w, typicalProfile(age), seed);
    case 'slow3': return new Kid(w, slowProfile(), seed);
    case 'perfect': return new Kid(w, perfectProfile(age), seed);
    case 'tapper': return new Tapper(w, seed);
    case 'spammer': return new Spammer(w, seed);
    case 'absent': return new Absent();
  }
  const m = /^bot([\d.]+)$/.exec(name);
  if (m) return new RB.Bot(w, { skill: +m[1], seed });
  throw new Error('unknown model ' + name);
}

module.exports = { RB, VIEWPORTS, mkWorld, makeModel, typicalProfile, slowProfile, perfectProfile, Kid, Tapper, Spammer, Absent, Finger,
  SKILL, THINK, clamp, mean, pct, f1, tapAt, inBox };
