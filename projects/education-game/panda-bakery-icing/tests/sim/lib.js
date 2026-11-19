// Mochi's Icing Bakery — headless playtest harness (report-only; never edits game code).
//   const L = require('./lib'); const w = L.mkWorld({ age, lang, vp, seed, config }); const kid = L.makeModel('typical', w, age, seed);
//   each frame: kid.step(dt); w.update(dt); for (const e of w.drainEvents()) kid.onEvent(e);
// Loads rng / trace / content / world / bot into node and drives ONLY the public input API (pointerDown / pointerMove /
// pointerUp, talkAnswer) like a finger: a tap is a press, a hold of a few frames with a little wobble and a lift; a TRACE is a
// press on the shining start and a slide along the dots at a child's speed with a smooth wobble (sometimes off the path).
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolve } = require('../unit/load');

function loadIB() {
  // runInThisContext (not a vm sandbox): ≈ 2× faster for long sims; the sim process owns its global scope
  globalThis.window = globalThis;
  for (const f of ['rng.js', 'trace.js', 'content.js', 'world.js', 'bot.js']) { const p = resolve(f); vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) }); }
  return globalThis.IB;
}
const IB = loadIB();

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
  const w = new IB.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}

/** One finger. tap(): press, hold `hold` s drifting `drift` px, lift. stroke(): press at pts[0], slide along `pts` at `speed`
 *  px/s with a smooth perpendicular wobble (amp px) + jitter, optional off-path excursions, lift at the end or at `liftAt` px. */
class Finger {
  constructor(w, rng) { this.w = w; this.r = rng; this.g = null; this.s = null; }
  get busy() { return !!(this.g || this.s); }
  tap(x, y, hold, drift, ang) {
    const d = this.w.pointerDown(x, y);
    if (d === 'bird' || d === 'mouse' || d === null) { this.g = null; return d || 'none'; }
    this.g = { x, y, hold: Math.max(1 / 60, hold), drift: drift || 0, ang: ang || 0, t: 0 };
    return null;
  }
  stroke(pts, o) {
    if (!pts || !pts.length) return;
    const cum = [0];
    for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
    this.s = Object.assign({ pts, cum, len: cum[cum.length - 1], d: 0, t: 0, ph1: this.r.float(0, 6.28), ph2: this.r.float(0, 6.28), f1: this.r.float(0.8, 1.8), f2: this.r.float(2.5, 4.5),
      exc: null }, o);
    const p0 = pts[0];
    this.w.pointerDown(p0[0] + (o.startOff ? o.startOff[0] : 0), p0[1] + (o.startOff ? o.startOff[1] : 0));
  }
  cancel() { if (this.g || this.s) { this.w.cancelDrag(); this.g = null; this.s = null; } }
  step(dt) {
    const g = this.g;
    if (g) {
      g.t += dt;
      const u = clamp(g.t / g.hold, 0, 1), x = g.x + Math.cos(g.ang) * g.drift * u, y = g.y + Math.sin(g.ang) * g.drift * u;
      this.w.pointerMove(x, y);
      if (g.t < g.hold) return null;
      this.g = null;
      return this.w.pointerUp(x, y) || 'none';
    }
    const s = this.s;
    if (!s) return null;
    s.t += dt;
    // an excursion: the finger wanders off sideways (the path parameter stops), then comes back
    if (!s.exc && s.excAt >= 0 && s.d >= s.excAt) { s.exc = { t: 0, T: s.excT, amp: s.excAmp }; s.excAt = -1; }
    let off = 0;
    if (s.exc) { s.exc.t += dt; const u = s.exc.t / s.exc.T; off = s.exc.amp * Math.sin(Math.PI * clamp(u, 0, 1)); if (u >= 1) s.exc = null; }
    else s.d = Math.min(s.len, s.d + s.speed * dt);
    let i = 1;
    while (i < s.cum.length - 1 && s.cum[i] < s.d) i++;
    const a = s.pts[i - 1], b = s.pts[Math.min(i, s.pts.length - 1)], seg = (s.cum[i] - s.cum[i - 1]) || 1, u = clamp((s.d - s.cum[i - 1]) / seg, 0, 1);
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    const wob = s.amp * (0.75 * Math.sin(s.ph1 + 6.283 * s.f1 * s.t) + 0.25 * Math.sin(s.ph2 + 6.283 * s.f2 * s.t)) * Math.min(1, s.t * 3) + off;
    const x = a[0] + dx * u + nx * wob + this.r.float(-s.jit, s.jit), y = a[1] + dy * u + ny * wob + this.r.float(-s.jit, s.jit);
    this.w.pointerMove(x, y);
    const st = this.w.stepInfo, done = s.d >= s.len && !s.exc;
    if (done || (s.liftAt > 0 && s.d >= s.liftAt) || !this.w.interactive || !st || st.mode !== 'trace') {
      this.s = null;
      return this.w.pointerUp(x, y) || 'none';
    }
    return null;
  }
}

/* ---------------------------------------------------------------- child models
 * After an `ask` the kid listens to Mochi (prompt ≈ 2.4 s; the follow-up "now follow the dots" ≈ 1.4 s) and thinks U(think) s.
 * Picks the right choice with p = skill (a glowing hint: p = followHint), else another choice; p = pPoke taps the tray before
 * picking (needPick). Traces: presses on the shining start (± startErr px) and slides along the dots at U(speed) px/s with a
 * smooth wobble of `wobble`·tol (screen px) + ± jit px noise; p = pLift lifts halfway (and goes on after U(between) s);
 * p = pExc wanders off the path by 1.6 tol for U(0.6, 1.4) s (offPath); p = pWrongStart starts somewhere else on the tray and
 * slides 120 px (offPath / hint); p = pTapTrace taps the cookie instead of sliding (traceTap). Chips: taps free spots ± jitter
 * every U(countGap) s. Sometimes looks away U(distract) s (p = pDistract). Talk: answers after U(talk) s, right with p = talkRight.
 */
const SKILL = { 3: 0.72, 4: 0.82, 5: 0.86, 6: 0.9, 7: 0.92 };
const THINK = { 3: [1.6, 3.2], 4: [1.3, 2.6], 5: [1.1, 2.3], 6: [1.0, 2.0], 7: [0.9, 1.8] };
const BETWEEN = { 3: [0.8, 1.6], 4: [0.7, 1.4], 5: [0.6, 1.2], 6: [0.5, 1.0], 7: [0.45, 0.9] };
const COUNTGAP = { 3: [0.9, 1.6], 4: [0.8, 1.4], 5: [0.6, 1.2], 6: [0.5, 1.0], 7: [0.45, 0.9] };
const SPEED = { 3: [140, 240], 4: [170, 280], 5: [200, 320], 6: [230, 360], 7: [250, 400] };
function typicalProfile(age) {
  return { skill: SKILL[age], think: THINK[age], between: BETWEEN[age], countGap: COUNTGAP[age], hold: [0.06, 0.25], tapWobble: age <= 3 ? 18 : 10,
    speed: SPEED[age], wobble: age <= 3 ? 0.42 : age === 4 ? 0.36 : 0.3, jit: age <= 4 ? 5 : 3, startErr: age <= 4 ? 0.5 : 0.35,
    pLift: age <= 4 ? 0.2 : 0.1, pExc: age <= 4 ? 0.12 : 0.06, pWrongStart: age <= 4 ? 0.1 : 0.05, pTapTrace: age <= 3 ? 0.08 : 0.04,
    jitter: age <= 4 ? 16 : 10, followHint: 0.92, pDistract: age <= 4 ? 0.07 : 0.04, distract: [3, 9], pPoke: age <= 4 ? 0.08 : 0.04,
    pSurprise: 0.7, talk: [3, 6], talkRight: Math.min(0.95, SKILL[age] + 0.05), prompt: 2.4, follow: 1.4 };
}
function slowProfile() {
  return Object.assign(typicalProfile(3), { skill: 0.6, think: [2.8, 6], between: [1.4, 3.0], countGap: [1.3, 2.6], hold: [0.1, 0.5], speed: [100, 180],
    wobble: 0.55, jit: 7, startErr: 0.7, pLift: 0.35, pExc: 0.25, pWrongStart: 0.2, pTapTrace: 0.15, jitter: 20, followHint: 0.8, pDistract: 0.15,
    distract: [4, 12], pPoke: 0.15, talk: [4, 9], talkRight: 0.6 });
}
function perfectProfile(age) {
  return Object.assign(typicalProfile(age), { skill: 1, think: [0.8, 1.2], between: [0.3, 0.5], countGap: [0.35, 0.6], speed: [300, 420], wobble: 0.05, jit: 1,
    startErr: 0.05, pLift: 0, pExc: 0, pWrongStart: 0, pTapTrace: 0, jitter: 4, pDistract: 0, pPoke: 0, talk: [1, 2], talkRight: 1 });
}
function wobblyProfile(age) {   // a child whose finger shakes a lot: big low-frequency wobble ≈ 0.85–1.2 tol + noise
  return Object.assign(typicalProfile(age), { wobble: 1.0, jit: 10, startErr: 0.8, pExc: 0.2, pLift: 0.3 });
}

class Kid {
  constructor(w, prof, seed) {
    this.w = w; this.p = prof; this.r = new IB.RNG(seed); this.f = new Finger(w, this.r);
    this.t = -1; this.talkT = -1; this.key = ''; this.surp = {};
    this.stats = { taps: 0, strokes: 0, wrongStarts: 0, tapTraces: 0, excursions: 0, lifts: 0, pokes: 0, surprise: 0 };
  }
  rf(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    if (e.type === 'ask') this.t = (e.follow ? this.p.follow : this.p.prompt) + this.rf(e.follow ? this.p.between : this.p.think);
    if (e.type === 'idle' || e.type === 'hint' || e.type === 'assist') this.t = Math.min(this.t, this.p.prompt * 0.6 + this.rf(this.p.between));   // Mochi speaks again → the child looks back
    if (e.type === 'offPath' || e.type === 'traceTap') this.calm = 1;   // "Follow the dots!" → the next attempt is a careful one
    if (e.type === 'strokeDone') this.t = Math.min(this.t, this.rf(this.p.between) * 0.6);
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
  jit(pt) { const j = this.p.jitter; return { x: pt.x + this.r.float(-j, j), y: pt.y + this.r.float(-j, j) }; }
  doTap(pt) { this.stats.taps++; this.f.tap(pt.x, pt.y, this.rf(this.p.hold), this.r.float(0, this.p.tapWobble), this.r.float(0, 6.28)); }
  /** A trace attempt on the current stroke. */
  traceAttempt() {
    const w = this.w, r = this.r, p = this.p, tolPx = w.tol * w.layout.tray.s, glow = !!w.hintHand, calm = this.calm || glow;
    this.calm = 0;
    const c = w.cookieScreen(), Tr = w.layout.tray;
    if (!calm && r.chance(p.pTapTrace)) { this.stats.tapTraces++; const q = c || { x: Tr.x + Tr.w / 2, y: Tr.y + Tr.h / 2 }; this.doTap(this.jit(q)); return; }
    if (!calm && r.chance(p.pWrongStart)) {   // starts somewhere else and slides a bit
      this.stats.wrongStarts++;
      const x = Tr.x + r.float(0.1, 0.9) * Tr.w, y = Tr.y + r.float(0.1, 0.9) * Tr.h, a = r.float(0, 6.28);
      this.f.stroke([[x, y], [x + 120 * Math.cos(a), y + 120 * Math.sin(a)]], { speed: this.rf(p.speed) * 0.6, amp: 4, jit: 2, liftAt: -1, excAt: -1 });
      return;
    }
    const pts = w.pathScreen();
    if (!pts.length) return;
    this.stats.strokes++;
    const len = pts.reduce((s, q, i) => s + (i ? Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) : 0), 0);
    const se = p.startErr * tolPx * (calm ? 0.5 : 1), ang = r.float(0, 6.28);
    const lift = r.chance(p.pLift) && len > 160 ? r.float(0.3, 0.7) * len : -1;
    const exc = !calm && r.chance(p.pExc) && len > 120 ? r.float(0.1, 0.7) * len : -1;
    if (lift > 0) this.stats.lifts++; if (exc > 0) this.stats.excursions++;
    this.f.stroke(pts, { speed: this.rf(p.speed), amp: p.wobble * tolPx * (calm ? 0.7 : 1), jit: p.jit, startOff: [se * Math.cos(ang), se * Math.sin(ang)],
      liftAt: lift, excAt: exc, excT: r.float(0.6, 1.4), excAmp: 1.6 * tolPx * (r.chance(0.5) ? 1 : -1) });
  }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') { this.f.cancel(); return this.talk(dt); }
    this.talkT = -1;
    if (w.state !== 'round') { this.f.cancel(); return; }
    if (this.f.busy) { this.f.step(dt); return; }
    const key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.surp = { bird: r.chance(p.pSurprise), mouse: r.chance(p.pSurprise) }; }
    const bh = w.birdHit();
    if (this.surp.bird && bh && r.chance(0.04)) { this.surp.bird = false; this.stats.surprise++; this.f.tap(bh.x + r.float(-20, 20), bh.y + r.float(-15, 15), 0.1, 0); return; }
    const mh = w.mouseHit();
    if (this.surp.mouse && mh && w.interactive && r.chance(0.006)) { this.surp.mouse = false; this.stats.surprise++; this.f.tap(mh.x + r.float(-20, 20), mh.y, 0.1, 0); return; }
    if (!w.interactive) return;
    if (this.t < 0) this.t = this.rf(p.between);
    this.t -= dt;
    if (this.t > 0) return;
    if (r.chance(p.pDistract)) { this.t = this.rf(p.distract); return; }
    const s = w.stepInfo, a = w.answer();
    if (!a) return;
    this.t = s.mode === 'chips' ? this.rf(p.countGap) : this.rf(p.between);
    if (a.trace) return this.traceAttempt();
    if (a.chip) { this.doTap(this.jit(a.chip)); return; }
    // a pick step
    const glow = !!w.hintHand;
    if (!glow && r.chance(p.pPoke)) { this.stats.pokes++; const c = w.cookieScreen(), Tr = w.layout.tray; this.doTap(this.jit(c || { x: Tr.x + Tr.w / 2, y: Tr.y + Tr.h / 2 })); return; }
    if (r.chance(glow ? p.followHint : p.skill)) { const h = w.choiceHit(a.choice); this.doTap({ x: h.x + r.float(-30, 30), y: h.y + r.float(-30, 30) }); return; }
    const o = w.choices.filter(c => c.id !== a.choice && !c.gone);
    const h = w.choiceHit((o.length ? r.pick(o) : { id: a.choice }).id); this.doTap({ x: h.x, y: h.y });
  }
}

/** Random tapper: taps random points over the tray / choices / anywhere every U(0.6, 1.8) s; never slides. */
class Tapper extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round') return;
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.6, 1.8);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.6, 1.8);
    const L = w.layout, T = L.tray, k = r.next();
    let pt;
    if (k < 0.55) pt = { x: T.x + r.float(0, T.w), y: T.y + r.float(0, T.h) };
    else if (k < 0.8 && w.choices.length) { const c = r.pick(w.choices); pt = { x: c.x + r.float(-50, 50), y: c.y + r.float(-50, 50) }; }
    else pt = { x: r.float(L.ins.left, L.W - L.ins.right), y: r.float(L.ins.top, L.H - L.ins.bottom) };
    this.doTap(pt);
  }
}
/** Spammer: 3–4 taps per second on random choices / the tray, never waits for Mochi, never slides. */
class Spammer extends Kid {
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return this.talk(dt);
    if (w.state !== 'round') return;
    if (this.f.busy) { this.f.step(dt); return; }
    if (this.t < 0) this.t = r.float(0.25, 0.33);
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(0.25, 0.33);
    const T = w.layout.tray, live = w.choices.filter(c => !c.gone);
    const pt = live.length && r.chance(0.5) ? (c => ({ x: c.x, y: c.y }))(r.pick(live)) : { x: T.x + r.float(0, T.w), y: T.y + r.float(0, T.h) };
    this.f.tap(pt.x, pt.y, r.float(0.04, 0.1), r.float(0, 8), 0);
    this.stats.taps++;
  }
}
/** Never touches the screen: idle nudges + hints must keep coming at 12 → 18 → 27 → 30 s and nothing may break. */
class Absent { constructor(w) { this.w = w; this.stats = {}; } step() {} onEvent() {} }
class BotModel {
  constructor(w, skill, seed) { this.b = new IB.Bot(w, { skill, seed }); this.stats = this.b.stats; }
  step(dt) { this.b.step(dt); } onEvent() {}
}

function makeModel(name, w, age, seed) {
  if (name === 'typical') return new Kid(w, typicalProfile(age), seed);
  if (name === 'slow3') return new Kid(w, slowProfile(), seed);
  if (name === 'perfect') return new Kid(w, perfectProfile(age), seed);
  if (name === 'wobbly') return new Kid(w, wobblyProfile(age), seed);
  if (name === 'tapper') return new Tapper(w, typicalProfile(age), seed);
  if (name === 'spammer') return new Spammer(w, typicalProfile(age), seed);
  if (name === 'absent') return new Absent(w);
  if (/^bot/.test(name)) return new BotModel(w, +name.slice(3) || 0.8, seed);
  throw new Error('unknown model ' + name);
}

module.exports = { IB, VIEWPORTS, mkWorld, makeModel, Finger, Kid, clamp, mean, pct, f1, typicalProfile, slowProfile, perfectProfile, wobblyProfile };
