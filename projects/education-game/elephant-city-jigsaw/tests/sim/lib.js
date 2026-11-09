// Pom's Puzzle Town — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
//   each frame: kid.step(dt); w.update(dt); for (const e of w.drainEvents()) kid.onEvent(e);
// Loads rng / content / world / bot into node and drives ONLY the public input API (pointerDown / pointerMove / pointerUp,
// cancelDrag, talkAnswer) like a finger: a drag = press, touchmove events along a wobbly path at ≈ 60 Hz, a little hold, lift.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolve } = require('../unit/load');

function loadPZ() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'world.js', 'bot.js']) { const p = resolve(f); vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) }); }
  return globalThis.PZ;
}
const PZ = loadPZ();

// Logical viewports (short side 720) with safe-area insets converted from CSS px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 960, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadAir: { W: 1036, H: 720, ins: { top: 18, right: 0, bottom: 14, left: 0 } }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function mkWorld(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new PZ.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  if (o.patch) applyPatches(w, String(o.patch).split(','));
  return w;
}

/* Sim-only patches that model PROPOSED code changes on one world instance (game/js is never edited):
 *  tapassist — after the assist threshold, grabbing the ASKED piece itself also arms the assist (an assisted tap glides it in);
 *              today only a grab of ANOTHER piece or a board press does, so a child who taps the right piece never progresses.
 *  tapnohint — a quick tap on a piece ("what is this?") still counts towards the assist but never triggers the 2-miss hint. */
function applyPatches(w, list) {
  if (list.includes('tapassist')) {
    const grab = w._grab;
    w._grab = function (p, x, y) {
      const armed = !this._stepDone && this._noProg >= this._assistAfter() && this._isAsked(p);
      const r = grab.call(this, p, x, y);
      if (armed && r === 'grab') { p._assisted = true; this._noProg = 0; this._emit({ type: 'assist', id: p.id, from: p.id, x, y }); }
      return r;
    };
  }
  if (list.includes('tapnohint')) {
    const hop = w._hopHome, np = w._noProgress;
    w._hopHome = function (p) { this._tapNP = true; return hop.call(this, p); };
    w._noProgress = function () { if (this._tapNP) { this._tapNP = false; this._noProg++; return; } return np.call(this); };
    const up = w.pointerUp; w.pointerUp = function (x, y) { const r = up.call(this, x, y); this._tapNP = false; return r; };
  }
}

/** One finger. press(x, y) → the pointerDown result; along(path, T, hold) moves it on a path (array of points, sampled at
 *  ≈ 60 Hz with a little tremor) and lifts after `hold`; slip = touchcancel half-way (p given per gesture). */
class Finger {
  constructor(w, r) { this.w = w; this.r = r; this.g = null; }
  get busy() { return !!this.g; }
  gesture(x0, y0, x1, y1, T, hold, o) {
    o = o || {};
    const d = this.w.pointerDown(x0, y0);
    if (d !== 'grab' && d !== 'pom') { this.g = null; return d || 'none'; }
    const dx = x1 - x0, dy = y1 - y0, len = Math.max(1, Math.hypot(dx, dy)), bend = (o.bend || 0) * (this.r.chance(0.5) ? 1 : -1);
    this.g = { x0, y0, x1, y1, cx: (x0 + x1) / 2 - dy / len * bend, cy: (y0 + y1) / 2 + dx / len * bend - (o.lift || 0), T: Math.max(1 / 60, T), hold: hold || 0,
      t: 0, mt: 0, trem: o.tremor || 0, slipAt: o.slip ? this.r.float(0.3, 0.8) * T : -1, down: d };
    return null;
  }
  cancel() { if (this.g) { this.w.cancelDrag(); this.g = null; } }
  step(dt) {
    const g = this.g;
    if (!g) return null;
    g.t += dt; g.mt += dt;
    const u = clamp(g.t / g.T, 0, 1), e = u * u * (3 - 2 * u), a = (1 - e) * (1 - e), b = 2 * (1 - e) * e, c = e * e;
    const x = a * g.x0 + b * g.cx + c * g.x1 + this.r.float(-g.trem, g.trem), y = a * g.y0 + b * g.cy + c * g.y1 + this.r.float(-g.trem, g.trem);
    if (g.mt >= 1 / 60 - 1e-9) { g.mt = 0; this.w.pointerMove(x, y); }
    if (g.slipAt >= 0 && g.t >= g.slipAt) { this.cancel(); return 'slip'; }
    if (g.t < g.T + g.hold) return null;
    this.g = null;
    return this.w.pointerUp(x, y) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * After an `ask` the kid listens to Pom (prompt ≈ 2.4 s) and thinks U(think) s; between tries U(between) s. Sometimes looks
 * away U(distract) s (p = pDistract). Picks the asked piece with p = skill (a glowing hint: p = followHint), else another tray
 * piece. Curiosity: p = pTap taps a piece to hear its name, p = pPoke presses the board / Pom. Drags: press near the piece
 * centre (± grabJit), carry it on a curved path in T = dragT × (distance / 400) s, aim at the slot with an error of ± aim px
 * (y biased `high` px upwards — kids drop high), hold U(hold) s and let go; p = pEarly lets go half-way (on the board → near
 * miss / wrong, outside → home), p = pSlip the finger slips off (touchcancel). A wrong piece goes to its own shadow (p 0.5) or
 * anywhere on the board. Surprises: taps the pigeon / a bubble with p = pSurprise. Talk: answers after U(talk) s, right with
 * p = talkRight. */
const SKILL = { 3: 0.72, 4: 0.82, 5: 0.86, 6: 0.9, 7: 0.92 };
const THINK = { 3: [1.6, 3.2], 4: [1.3, 2.6], 5: [1.1, 2.3], 6: [1.0, 2.0], 7: [0.9, 1.8] };
const BETWEEN = { 3: [0.9, 1.9], 4: [0.8, 1.6], 5: [0.7, 1.4], 6: [0.6, 1.2], 7: [0.5, 1.1] };
const DRAGT = { 3: [0.9, 1.8], 4: [0.8, 1.5], 5: [0.6, 1.2], 6: [0.5, 1.0], 7: [0.45, 0.9] };
const AIM = { 3: 48, 4: 38, 5: 30, 6: 24, 7: 20 };
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], between: BETWEEN[age], dragT: DRAGT[age], aim: AIM[age], high: age <= 4 ? 30 : 18, hold: [0.05, 0.35],
    grabJit: age <= 4 ? 22 : 14, tremor: age <= 3 ? 3 : 1.5, followHint: 0.92, pDistract: age <= 4 ? 0.07 : 0.04, distract: [3, 9], pTap: age <= 4 ? 0.12 : 0.06,
    pPoke: age <= 4 ? 0.06 : 0.03, pEarly: age <= 3 ? 0.08 : age <= 4 ? 0.05 : 0.03, pSlip: age <= 3 ? 0.03 : 0.015, pSurprise: 0.7, talk: [3, 6],
    talkRight: Math.min(0.95, SKILL[age] + 0.05), prompt: 2.4 };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.6, think: [2.8, 6], between: [1.6, 3.4], dragT: [1.4, 2.6], aim: 64, high: 45, hold: [0.1, 0.6], grabJit: 30,
    tremor: 5, followHint: 0.8, pDistract: 0.15, distract: [4, 12], pTap: 0.2, pPoke: 0.12, pEarly: 0.14, pSlip: 0.06, talk: [4, 9], talkRight: 0.6 });
}
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.8, 1.2], between: [0.4, 0.7], dragT: [0.35, 0.5], aim: 6, high: 0, grabJit: 4, tremor: 0,
    pDistract: 0, pTap: 0, pPoke: 0, pEarly: 0, pSlip: 0, talk: [1, 2], talkRight: 1 });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new PZ.RNG(seed); this.f = new Finger(w, this.r);
    this.t = -1; this.talkT = -1; this.key = ''; this.surp = {};
    this.stats = { drags: 0, taps: 0, pokes: 0, early: 0, slips: 0, surprise: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    if (e.type === 'ask') this.t = this.p.prompt + this.rf(this.p.think);
    if (e.type === 'idle' || e.type === 'hint' || e.type === 'nearMiss') this.t = Math.min(this.t, this.p.prompt * 0.6 + this.rf(this.p.between));   // Pom speaks again
  }
  talk(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.talkAnswered || !w.talk) return;
    if (this.talkT < 0) this.talkT = this.rf(p.talk);
    this.talkT -= dt;
    if (this.talkT <= 0) {
      this.talkT = -1; const t = w.talk; let pick = t.answer;
      if (!r.chance(t.glowAnswer ? 0.95 : p.talkRight)) { const wr = t.choices.filter(c => c.id !== t.answer); if (wr.length) pick = r.pick(wr).id; }
      w.talkAnswer(pick);
    }
  }
  tray() { return this.w.pieces.filter(q => q.state === 'rest'); }
  /** Drag piece `pc` towards (tx, ty) (where the piece centre should end up). */
  dragTo(pc, tx, ty) {
    const w = this.w, r = this.r, p = this.p, h = w.pieceHit(pc.id);
    const px = h.x + r.float(-p.grabJit, p.grabJit), py = h.y + r.float(-p.grabJit, p.grabJit), ox = px - h.x, oy = py - h.y + 8;
    let fx = tx + ox, fy = ty + oy;
    const early = r.chance(p.pEarly);
    if (early) { fx = (px + fx) / 2; fy = (py + fy) / 2; this.stats.early++; }
    const T = this.rf(p.dragT) * clamp(Math.hypot(fx - px, fy - py) / 400, 0.5, 1.6);
    const slip = r.chance(p.pSlip); if (slip) this.stats.slips++;
    this.stats.drags++;
    return this.f.gesture(px, py, fx, fy, T, this.rf(p.hold), { bend: r.float(20, 80), lift: r.float(0, 50), tremor: p.tremor, slip });
  }
  surprises() {
    const w = this.w, r = this.r, p = this.p, key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.surp = { pigeon: r.chance(p.pSurprise), bubble: r.chance(p.pSurprise) }; }
    const gh = w.pigeonHit();
    if (this.surp.pigeon && gh && r.chance(0.04)) { this.surp.pigeon = false; this.stats.surprise++; w.pointerDown(gh.x + r.float(-15, 15), gh.y + r.float(-15, 15)); w.pointerUp(); return true; }
    const bh = w.bubbleHit();
    if (this.surp.bubble && bh && r.chance(0.05)) { this.surp.bubble = false; this.stats.surprise++; w.pointerDown(bh.x + r.float(-8, 8), bh.y + r.float(-8, 8)); w.pointerUp(); return true; }
    return false;
  }
  act() {
    const w = this.w, r = this.r, p = this.p, a = w.answer();
    if (!a) return;
    const glow = !!w.hintHand, B = w.layout.board, tray = this.tray();
    if (!glow && r.chance(p.pTap) && tray.length) {   // "what is this?"
      const pc = r.pick(tray), h = w.pieceHit(pc.id); this.stats.taps++;
      this.f.gesture(h.x + r.float(-10, 10), h.y + r.float(-10, 10), h.x + r.float(-6, 6), h.y + r.float(-6, 6), r.float(0.06, 0.2), 0);
      return;
    }
    if (!glow && r.chance(p.pPoke)) {   // presses the picture (or Pom)
      this.stats.pokes++;
      if (r.chance(0.3)) { const b = w.pomHit(); this.f.gesture(b.x, b.y, b.x, b.y, 0.1, 0); }
      else { w.pointerDown(r.float(B.x, B.x + B.w), r.float(B.y, B.y + B.h)); w.pointerUp(); }
      return;
    }
    const right = r.chance(glow ? p.followHint : p.skill);
    let pc = w.pieceById(a.piece);
    if (!right) { const o = tray.filter(q => q.id !== a.piece); if (o.length) pc = r.pick(o); }
    if (!pc || pc.state !== 'rest') pc = w.pieceById(a.piece);
    if (pc.state !== 'rest' && pc.state !== 'home') return;
    let tx, ty;
    const st = w.stepInfo;
    if (pc.id === a.piece || (st && st.targets.includes(pc.id))) { const s = w.slotDrop(pc.slot); tx = s.x + r.float(-p.aim, p.aim); ty = s.y + r.float(-p.aim, p.aim) - r.float(0, 2 * p.high); }
    else if (pc.slot && r.chance(0.5)) { const s = w.slotDrop(pc.slot); tx = s.x + r.float(-p.aim, p.aim) * 0.5; ty = s.y + r.float(-p.aim, p.aim) * 0.5; }   // its own shadow
    else { tx = r.float(B.x + 20, B.x + B.w - 20); ty = r.float(B.y + 20, B.y + B.h - 20); }
    this.dragTo(pc, tx, ty);
  }
  step(dt) {
    const w = this.w, p = this.p;
    if (w.state === 'talk') { this.f.cancel(); return this.talk(dt); }
    this.talkT = -1;
    if (w.state !== 'round') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.surprises()) return;
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.rf(p.between);
    this.t -= dt;
    if (this.t > 0) return;
    if (this.r.chance(p.pDistract)) { this.t = this.rf(p.distract); return; }
    this.t = this.rf(p.between);
    this.act();
  }
}

/** Random tapper: presses random points (half on the tray / board, half anywhere) every U(0.6, 1.8) s; often a short random drag. */
class Tapper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.6, 1.8);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.6, 1.8);
    const L = w.layout, tray = this.tray(), B = L.board;
    let x, y;
    if (tray.length && r.chance(0.45)) { const h = w.pieceHit(r.pick(tray).id); x = h.x + r.float(-30, 30); y = h.y + r.float(-30, 30); }
    else if (r.chance(0.5)) { x = r.float(B.x, B.x + B.w); y = r.float(B.y, B.y + B.h); }
    else { x = r.float(L.ins.left, L.W - L.ins.right); y = r.float(L.ins.top, L.H - L.ins.bottom); }
    const drag = r.chance(0.4), dx = drag ? r.float(-250, 250) : r.float(-5, 5), dy = drag ? r.float(-350, 50) : r.float(-5, 5);
    if (this.f.gesture(x, y, x + dx, y + dy, drag ? r.float(0.3, 0.9) : r.float(0.05, 0.2), 0, { tremor: 3 }) !== null) w.pointerUp();
    this.stats.taps++;
  }
}
/** Spammer: 6 presses per second on random pieces / the board (tiny drags), never waits for Pom. */
class Spammer extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.14, 0.19);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.14, 0.19);
    const tray = this.tray(), B = w.layout.board;
    let x, y;
    if (tray.length && r.chance(0.7)) { const h = w.pieceHit(r.pick(tray).id); x = h.x + r.float(-20, 20); y = h.y + r.float(-20, 20); }
    else { x = r.float(B.x, B.x + B.w); y = r.float(B.y, B.y + B.h); }
    if (this.f.gesture(x, y, x + r.float(-8, 8), y + r.float(-8, 8), r.float(0.03, 0.08), 0) !== null) w.pointerUp();
    this.stats.taps++;
  }
}
/** Never touches the screen: a round waits for the child (no fail state, no auto-play); idle nudges + hints must keep
 *  coming at 12 → 18 → 27 → 30 s and nothing may break. */
class Absent { constructor(w) { this.w = w; this.stats = {}; } step() {} onEvent() {} }
class BotModel {
  constructor(w, skill, seed) { this.b = new PZ.Bot(w, { skill, seed }); this.stats = this.b.stats; }
  step(dt) { this.b.step(dt); } onEvent(e) { this.b.onEvent(e); }
}

/** "Drops high": a typical child who lets go 100–220 px ABOVE the shadow (often above the +90 px zone → near miss / home). */
function highProfile(age) { return Object.assign(typicalProfile(age), { high: 80 }); }   // ty −= U(0, 2 × high) → 0–160 px up, plus aim
/** "Drops near but misses": always picks well, but lets go 110–200 px beside the shadow (on the board, outside the zone). */
class NearKid extends Kid {
  act() {
    const w = this.w, r = this.r, a = w.answer();
    if (!a || w.hintHand) return super.act();
    const pc = w.pieceById(a.piece);
    if (!pc || pc.state !== 'rest' || !r.chance(0.8)) return super.act();
    const s = w.slotDrop(pc.slot), B = w.layout.board, ang = r.float(0, Math.PI * 2), d = r.float(110, 200);
    const tx = clamp(s.x + Math.cos(ang) * d, B.x + 10, B.x + B.w - 10), ty = clamp(s.y + Math.sin(ang) * d, B.y + 10, B.y + B.h - 10);
    this.dragTo(pc, tx, ty);
  }
}
/** Never drags (a 3-year-old who only taps): taps a tray piece (the asked one with p = skill, else any), sometimes the board
 *  or Pom; never a press-move-release. `smart`: always taps the asked piece. */
class TapOnly extends Kid {
  constructor(w, prof, seed, smart) { super(w, prof, seed); this.smart = smart; }
  act() {
    const w = this.w, r = this.r, p = this.p, a = w.answer();
    if (!a) return;
    const tray = this.tray();
    if (!tray.length) return;
    if (!this.smart && r.chance(0.15)) { const B = w.layout.board; this.stats.pokes++; w.pointerDown(r.float(B.x, B.x + B.w), r.float(B.y, B.y + B.h)); w.pointerUp(); return; }
    let pc = w.pieceById(a.piece);
    if (!pc || pc.state !== 'rest' || (!this.smart && !r.chance(w.hintHand ? p.followHint : p.skill))) pc = r.pick(tray);
    const h = w.pieceHit(pc.id); this.stats.taps++;
    this.f.gesture(h.x + r.float(-10, 10), h.y + r.float(-10, 10), h.x + r.float(-6, 6), h.y + r.float(-6, 6), r.float(0.06, 0.2), 0);
  }
}

function makeModel(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (name === 'high') return new Kid(w, highProfile(age), seed);
  if (name === 'near') return new NearKid(w, typicalProfile(age), seed);
  if (name === 'taponly') return new TapOnly(w, typicalProfile(age), seed, false);
  if (name === 'tapsmart') return new TapOnly(w, typicalProfile(age), seed, true);
  if (name === 'slowtap') return new TapOnly(w, slowProfile(), seed, false);
  if (name === 'slow3') return new Kid(w, slowProfile(), seed);
  if (name === 'perfect') return new Kid(w, perfectProfile(age), seed);
  if (name === 'tapper') return new Tapper(w, typicalProfile(age), seed);
  if (name === 'spammer') return new Spammer(w, typicalProfile(age), seed);
  if (name === 'absent') return new Absent(w);
  if (/^bot/.test(name)) return new BotModel(w, +name.slice(3) || 0.8, seed);
  throw new Error('unknown model ' + name);
}

module.exports = { PZ, VIEWPORTS, mkWorld, makeModel, Finger, Kid, clamp, mean, pct, f1, typicalProfile, slowProfile, perfectProfile, highProfile };
