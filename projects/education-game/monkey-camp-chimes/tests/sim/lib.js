// Kiki's Camp Chimes — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
//   each frame: kid.step(dt); w.update(dt); for (const e of w.drainEvents()) kid.onEvent(e);
// Loads rng / content / world / bot into node and drives ONLY the public input API (pointerDown / pointerMove / pointerUp,
// cancelDrag, talkAnswer) like a finger: a tap = press + lift; a swipe = press, touchmove events along a wobbly path at ≈ 60 Hz, lift.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolve } = require('../unit/load');

function loadCC() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'content.js', 'world.js', 'bot.js']) { const p = resolve(f); vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) }); }
  return globalThis.CC;
}
const CC = loadCC();

/* Playtest P1-1 ("judge the core, brush the rim") is now the world's default behaviour (CONFIG.fairSwipe = true);
 * `--config '{"fairSwipe":false}'` replays the old "first contact on the hit circle is judged" rule for comparison. */

// Logical viewports (short side 720) with safe-area insets converted from CSS px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1561, ins: { top: 108, right: 0, bottom: 62, left: 0 } },
  iphoneL: { W: 1561, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 } },
  ipadAir: { W: 1036, H: 720, ins: { top: 18, right: 0, bottom: 14, left: 0 } }
};
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function mkWorld(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new CC.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}

/** One finger. gesture(x0, y0, x1, y1, T, hold) presses at once (→ the pointerDown result), slides on a slightly curved path
 *  (sampled at ≈ 60 Hz with a little tremor) for T s, holds `hold` s and lifts. T = 0 → a tap. */
class Finger {
  constructor(w, r) { this.w = w; this.r = r; this.g = null; }
  get busy() { return !!this.g; }
  gesture(x0, y0, x1, y1, T, hold, o) {
    o = o || {};
    const d = this.w.pointerDown(x0, y0);
    const dx = x1 - x0, dy = y1 - y0, len = Math.max(1, Math.hypot(dx, dy)), bend = (o.bend || 0) * (this.r.chance(0.5) ? 1 : -1);
    this.g = { x0, y0, x1, y1, cx: (x0 + x1) / 2 - dy / len * bend, cy: (y0 + y1) / 2 + dx / len * bend, T: Math.max(0, T), hold: hold || 0,
      t: 0, mt: 0, trem: o.tremor || 0, slipAt: o.slip ? this.r.float(0.3, 0.8) * Math.max(T, 0.1) : -1, x: x0, y: y0 };
    return d || 'none';
  }
  cancel() { if (this.g) { this.w.cancelDrag(); this.g = null; } }
  step(dt) {
    const g = this.g;
    if (!g) return null;
    g.t += dt; g.mt += dt;
    if (g.T > 0) {
      const u = clamp(g.t / g.T, 0, 1), a = (1 - u) * (1 - u), b = 2 * (1 - u) * u, c = u * u;
      const x = a * g.x0 + b * g.cx + c * g.x1 + this.r.float(-g.trem, g.trem), y = a * g.y0 + b * g.cy + c * g.y1 + this.r.float(-g.trem, g.trem);
      if (g.mt >= 1 / 60 - 1e-9 && g.t <= g.T + 1 / 60) { g.mt = 0; g.x = x; g.y = y; this.w.pointerMove(x, y); }
    }
    if (g.slipAt >= 0 && g.t >= g.slipAt) { this.cancel(); return 'slip'; }
    if (g.t < g.T + g.hold) return null;
    this.g = null;
    return this.w.pointerUp(g.x, g.y) || 'none';
  }
}

/* ---------------------------------------------------------------- child models
 * After an `ask` the kid listens to Kiki (prompt ≈ 2.4 s) and thinks U(think) s; between tries U(between) s. Sometimes looks
 * away U(distract) s (p = pDistract). Picks the asked chime with p = skill (a glowing hint: p = followHint), else another chime.
 * Touch: a tap at the chime centre ± aim × r (sometimes a finger too far → empty sky = a soft press), held U(hold) s; with
 * p = pSwipe a swipe that starts beside the chime and runs through it (its first contact may be a neighbour when the start is
 * sloppy). Curiosity: p = pPoke presses Kiki / the sky. Song: swipes across the beam band (p = pSongSwipe) after U(songT) s,
 * else taps a chime, else waits for the auto cascade. Surprises: taps them with p = pSurprise. Talk: answers after U(talk) s. */
const SKILL = { 3: 0.72, 4: 0.82, 5: 0.86, 6: 0.9, 7: 0.92 };
const THINK = { 3: [1.6, 3.2], 4: [1.3, 2.6], 5: [1.1, 2.3], 6: [1.0, 2.0], 7: [0.9, 1.8] };
const BETWEEN = { 3: [0.9, 1.9], 4: [0.8, 1.6], 5: [0.7, 1.4], 6: [0.6, 1.2], 7: [0.5, 1.1] };
const AIM = { 3: 0.75, 4: 0.6, 5: 0.5, 6: 0.4, 7: 0.35 };   // × hit radius
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], between: BETWEEN[age], aim: AIM[age], hold: [0.04, 0.3], tremor: age <= 3 ? 3 : 1.5,
    followHint: 0.92, pDistract: age <= 4 ? 0.07 : 0.04, distract: [3, 9], pSwipe: age <= 4 ? 0.2 : 0.25, swipeSloppy: age <= 4 ? 0.35 : 0.2,
    pPoke: age <= 4 ? 0.06 : 0.03, pSlip: age <= 3 ? 0.03 : 0.015, pSurprise: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05),
    prompt: 2.4, pSongSwipe: 0.7, pSongTap: 0.2, songT: [0.8, 3.0] };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.6, think: [2.8, 6], between: [1.6, 3.4], aim: 1.0, hold: [0.1, 0.8], tremor: 5, followHint: 0.8,
    pDistract: 0.15, distract: [4, 12], pSwipe: 0.1, swipeSloppy: 0.6, pPoke: 0.12, pSlip: 0.06, talk: [4, 9], talkRight: 0.6, pSongSwipe: 0.4, pSongTap: 0.3, songT: [1.5, 5] });
}
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.8, 1.2], between: [0.4, 0.7], aim: 0.1, hold: [0.04, 0.08], tremor: 0, followHint: 1,
    pDistract: 0, pSwipe: 0, pPoke: 0, pSlip: 0, talk: [1, 2], talkRight: 1, pSongSwipe: 1, songT: [0.6, 0.9] });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new CC.RNG(seed); this.f = new Finger(w, this.r);
    this.t = -1; this.talkT = -1; this.key = ''; this.surp = {}; this.songKey = ''; this.songT = -1; this.songMode = '';
    this.stats = { taps: 0, swipes: 0, pokes: 0, slips: 0, surprise: 0, songSwipes: 0, songTaps: 0, songWaits: 0 };
    this.intents = [];   // fairness: { kind 'tap'|'swipe'|'sloppy', id (aimed chime), want (asked chime), judged (id|null), assisted }
    this.intent = null;
  }
  /** fairness bookkeeping: a new aimed gesture closes the previous one */
  _intent(o) { if (this.intent) this.intents.push(this.intent); this.intent = o; }
  flushIntent() { if (this.intent) this.intents.push(this.intent); this.intent = null; }
  rf(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    const it = this.intent;
    if (it && e.type === 'ring' && e.judged && it.judged === undefined) it.judged = e.id;
    if (it && e.type === 'assist') it.assisted = true;
    if (it && e.type === 'wrong' && it.judged === e.id && e.id !== it.id && it.want === it.id) it.unfairMiss = true;
    if (e.type === 'ask') this.t = this.p.prompt + this.rf(this.p.think);
    if (e.type === 'idle' || e.type === 'hint' || e.type === 'wrong') this.t = Math.min(this.t, this.p.prompt * 0.6 + this.rf(this.p.between));   // Kiki speaks again
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
  hanging() { return this.w.chimes.filter(c => c.state === 'hang'); }
  tap(x, y) { this.stats.taps++; return this.f.gesture(x, y, x, y, 0, this.rf(this.p.hold), { slip: this.r.chance(this.p.pSlip) }); }
  /** Tap chime c (aim error ± aim × r). */
  tapChime(c) {
    const h = this.w.chimeHit(c.id), r = this.r, a = this.p.aim * h.r, ang = r.float(0, Math.PI * 2), d = a * Math.sqrt(r.next());
    return this.tap(h.x + Math.cos(ang) * d, h.y + Math.sin(ang) * d);
  }
  /** A swipe through chime c from one side (sloppy: it starts further out, maybe on the neighbour). */
  swipeChime(c, o) {
    // realistic start: just beside the VISIBLE body (bw / 2 + 5–45 px), sloppy: 45–100 px beyond it (maybe on the neighbour)
    const w = this.w, r = this.r, h = w.chimeHit(c.id), dir = r.chance(0.5) ? 1 : -1, sloppy = r.chance(this.p.swipeSloppy), hw = (c.bw || c.size * 0.86) / 2;
    if (o && sloppy) o.kind = 'sloppy';
    const off = hw + (sloppy ? r.float(45, 100) : r.float(5, 45));
    const x0 = h.x - dir * off, y0 = h.y + r.float(-0.4, 0.4) * h.r, x1 = h.x + dir * (hw + r.float(10, 90)), y1 = y0 + r.float(-30, 30);
    this.stats.swipes++;
    return this.f.gesture(x0, y0, x1, y1, r.float(0.12, 0.35), 0, { bend: r.float(0, 20), tremor: this.p.tremor, slip: r.chance(this.p.pSlip) });
  }
  swipeBand() {
    const w = this.w, r = this.r, B = w.layout.band, y = w._chimeMidY() + r.float(-50, 50), ltr = r.chance(0.8);
    const xa = B.x + r.float(-20, 40), xb = B.x + B.w - r.float(-20, 40);
    return this.f.gesture(ltr ? xa : xb, y, ltr ? xb : xa, y + r.float(-40, 40), r.float(0.3, 0.9), 0, { bend: r.float(0, 40), tremor: this.p.tremor });
  }
  surprises() {
    const w = this.w, r = this.r, p = this.p, key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.surp = { hedgehog: r.chance(p.pSurprise), bird: r.chance(p.pSurprise), firefly: r.chance(p.pSurprise) }; }
    for (const [k, fn] of [['hedgehog', 'hedgehogHit'], ['bird', 'birdHit'], ['firefly', 'fireflyHit']]) {
      const h = w[fn]();
      if (this.surp[k] && h && r.chance(0.04)) { this.surp[k] = false; this.stats.surprise++; this.tap(h.x + r.float(-0.5, 0.5) * h.r, h.y + r.float(-0.5, 0.5) * h.r); return true; }
    }
    return false;
  }
  song(dt) {
    const w = this.w, r = this.r, p = this.p, key = w.level + ':' + w.round;
    if (this.songKey !== key) {
      this.songKey = key; this.songT = this.rf(p.songT);
      const u = r.next(); this.songMode = u < p.pSongSwipe ? 'swipe' : u < p.pSongSwipe + p.pSongTap ? 'tap' : 'wait';
      if (this.songMode === 'wait') this.stats.songWaits++;
    }
    if (this.songMode === 'wait') return;
    this.songT -= dt;
    if (this.songT > 0) return;
    this.songT = 99;
    if (this.songMode === 'swipe') { this.stats.songSwipes++; this.swipeBand(); }
    else { const hs = this.hanging(); if (hs.length) { this.stats.songTaps++; this.tapChime(r.pick(hs)); } }
  }
  act() {
    const w = this.w, r = this.r, p = this.p, a = w.answer();
    if (!a || !a.chime) return;
    const glow = !!w.hintHand || !!w.assistId;
    if (!glow && r.chance(p.pPoke)) {   // presses Kiki or the sky
      this.stats.pokes++;
      const L = w.layout;
      if (r.chance(0.5)) { const b = w.kikiHit(); this.tap(b.cx, b.cy); }
      else this.tap(r.float(L.ins.left + 20, L.W - L.ins.right - 200), r.float(L.bubble.y + L.bubble.h + 10, L.beam.y - 30));
      return;
    }
    let c = w.chimeById(a.chime);
    if (!r.chance(glow ? p.followHint : p.skill)) { const o = this.hanging().filter(q => q.id !== c.id && !q.done); if (o.length) c = r.pick(o); }
    if (c.state !== 'hang') return;
    const sw = r.chance(p.pSwipe), o = { id: c.id, want: a.chime, judged: undefined, assisted: false, glow };
    this._intent(o);
    if (sw) { o.kind = 'swipe'; this.swipeChime(c, o); } else { o.kind = 'tap'; this.tapChime(c); }
  }
  step(dt) {
    const w = this.w, p = this.p;
    if (w.state === 'talk') { this.f.cancel(); return this.talk(dt); }
    this.talkT = -1;
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { if (this.f.step(dt) === 'slip') this.stats.slips++; return; }
    const a = w.answer();
    if (a && a.song) return this.song(dt);
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

/** Random tapper: presses random points (half on the beam band, half anywhere) every U(0.6, 1.8) s; often a short random slide. */
class Tapper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.6, 1.8);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.6, 1.8);
    const L = w.layout, B = L.band, hs = this.hanging();
    let x, y;
    if (hs.length && r.chance(0.35)) { const h = w.chimeHit(r.pick(hs).id); x = h.x + r.float(-1, 1) * h.r; y = h.y + r.float(-1, 1) * h.r; }
    else if (r.chance(0.5)) { x = r.float(B.x, B.x + B.w); y = r.float(B.y, B.y + B.h); }
    else { x = r.float(L.ins.left, L.W - L.ins.right); y = r.float(L.ins.top, L.H - L.ins.bottom); }
    const slide = r.chance(0.4);
    this.stats.taps++;
    this.f.gesture(x, y, x + (slide ? r.float(-250, 250) : 0), y + (slide ? r.float(-120, 120) : 0), slide ? r.float(0.2, 0.7) : 0, r.float(0.03, 0.2), { tremor: 3 });
  }
}
/** Swiper: never aims — strums the whole row every U(1, 2.5) s (random direction / height in the band); the first chime the
 *  strum meets is its answer. Progress comes from the hint, the 2nd idle hint and the assist. */
class Swiper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(1, 2.5);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(1, 2.5);
    this.stats.swipes++;
    this.swipeBand();
  }
}
/** Spammer: 6 presses per second on random chimes / the beam band (tiny slides), never waits for Kiki. */
class Spammer extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.14, 0.19);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.14, 0.19);
    const hs = this.hanging(), B = w.layout.band;
    let x, y;
    if (hs.length && r.chance(0.7)) { const h = w.chimeHit(r.pick(hs).id); x = h.x + r.float(-20, 20); y = h.y + r.float(-20, 20); }
    else { x = r.float(B.x, B.x + B.w); y = r.float(B.y, B.y + B.h); }
    this.stats.taps++;
    this.f.gesture(x, y, x + r.float(-8, 8), y + r.float(-8, 8), r.float(0.02, 0.06), 0);
  }
}
/** "Taps the beam": the log beam looks touchable, so this child presses the beam / the cords' top (the band above the
 *  bodies) every U(0.8, 2) s and, with p = pChime (0.2), a chime at random; never aims. Progress = the hint + the assist (a
 *  press anywhere in the band strikes the asked chime) — checks that a beam-tapper is not stuck. */
class BeamTapper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round' && w.state !== 'roundDone') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.8, 2);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.8, 2);
    const B = w.beamHit(), hs = this.hanging();
    this.stats.taps++;
    if (hs.length && r.chance(0.2)) { this.tapChime(r.pick(hs)); return; }
    const x = r.float(B.x0 + 10, B.x1 - 10), y = B.y + r.float(-B.r - 6, B.r + 6);
    this.f.gesture(x, y, x, y, 0, r.float(0.05, 0.25));
  }
}
/** Never touches the screen: a round waits for the child (no fail state, no auto-play in play); the song plays by itself;
 *  idle nudges + hints must keep coming at 12 → 18 → 27 → 30 s and nothing may break. */
class Absent { constructor(w) { this.w = w; this.stats = {}; } step() {} onEvent() {} }
class BotModel {
  constructor(w, skill, seed) { this.b = new CC.Bot(w, { skill, seed }); this.stats = this.b.stats; }
  step(dt) { this.b.step(dt); } onEvent(e) { this.b.onEvent(e); }
}

function makeModel(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (name === 'slow3') return new Kid(w, slowProfile(), seed);
  if (name === 'perfect') return new Kid(w, perfectProfile(age), seed);
  if (name === 'tapper') return new Tapper(w, typicalProfile(age), seed);
  if (name === 'swiper') return new Swiper(w, typicalProfile(age), seed);
  if (name === 'spammer') return new Spammer(w, typicalProfile(age), seed);
  if (name === 'absent') return new Absent(w);
  if (name === 'beam') return new BeamTapper(w, typicalProfile(age), seed);
  if (name === 'swipey') return new Kid(w, Object.assign(typicalProfile(age), { pSwipe: 0.8 }), seed);   // a typical child who mostly swipes AT the chime
  if (/^bot/.test(name)) return new BotModel(w, +name.slice(3) || 0.8, seed);
  throw new Error('unknown model ' + name);
}

module.exports = { CC, VIEWPORTS, mkWorld, makeModel, Finger, Kid, clamp, mean, pct, f1, typicalProfile, slowProfile, perfectProfile };
