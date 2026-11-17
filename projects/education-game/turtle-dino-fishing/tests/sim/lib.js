// Tibo's Dino Lake Fishing — headless playtest harness (report-only; never edits game code).
//   const S = require('./lib'); const w = S.mkWorld({ age, lang, vp, seed, config }); const kid = S.makeModel('typical', w, age, seed);
//   each frame: kid.step(dt); w.update(dt); for (const e of w.drainEvents()) kid.onEvent(e);
// Loads rng / content / world / bot into node and drives ONLY the public input API (pointerDown / pointerMove / pointerUp,
// cancelDrag, talkAnswer) like a finger: a tap = press + lift (held a little), aimed where the child SAW the fish a moment ago.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { resolve } = require('../unit/load');

function loadTL() {
  globalThis.window = globalThis;   // runInThisContext: ≈ 2× faster than a vm sandbox for long sims
  for (const f of ['rng.js', 'content.js', 'world.js', 'bot.js']) { const p = resolve(f); vm.runInThisContext(fs.readFileSync(p, 'utf8'), { filename: path.basename(p) }); }
  return globalThis.TL;
}
const TL = loadTL();

// Logical viewports (short side 720) with safe-area insets in logical px.
const VIEWPORTS = {
  iphoneP: { W: 720, H: 1556, ins: { top: 108, right: 0, bottom: 62, left: 0 } },
  iphoneL: { W: 1556, H: 720, ins: { top: 0, right: 108, bottom: 38, left: 108 } },
  ipadL:   { W: 960, H: 720, ins: { top: 32, right: 0, bottom: 27, left: 0 } },
  ipadP:   { W: 720, H: 1036, ins: { top: 21, right: 0, bottom: 18, left: 0 } },
  airL:    { W: 1036, H: 720, ins: { top: 18, right: 0, bottom: 14, left: 0 } }
};
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const pct = (a, p) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f1 = x => (+x).toFixed(1);

function mkWorld(o) {
  const vp = VIEWPORTS[o.vp || 'ipadL'];
  const w = new TL.World({ seed: o.seed, age: o.age, lang: o.lang || 'en', config: o.config || {} });
  w.setViewport(vp.W, vp.H, vp.ins);
  return w;
}

/* ---------------------------------------------------------------- child models
 * After an `ask` the kid listens to Tibo (prompt ≈ listen s) and thinks U(think) s; between tries U(between) s; sometimes looks away
 * U(distract) s (p = pDistract per decision). Picks the target with p = skill (a glowing hint: p = followHint), else another fish.
 * Aim: where the fish was `lag` s ago (perception + motor delay) ± aim × r; held U(hold) s. Sometimes taps empty water (pSoft).
 * Critters: taps them with p = pCritter per round. Talk: answers after U(talk) s, right with p = talkSkill. */
const PROFILES = {
  typical: age => ({ skill: { 3: 0.72, 4: 0.82, 5: 0.86, 6: 0.88, 7: 0.9 }[age], listen: 2.6, think: { 3: [1.6, 3.2], 4: [1.3, 2.6], 5: [1.1, 2.3], 6: [1, 2.2], 7: [1, 2] }[age],
    between: [0.8, 1.6], aim: { 3: 0.75, 4: 0.6, 5: 0.5, 6: 0.4, 7: 0.35 }[age], lag: 0.2, hold: [0.05, 0.3], followHint: 0.92, pDistract: age <= 4 ? 0.07 : 0.04,
    distract: [3, 9], pSoft: age <= 4 ? 0.08 : 0.04, pCritter: 0.5, talk: [1.5, 3.5], talkSkill: { 3: 0.7, 4: 0.8, 5: 0.85, 6: 0.88, 7: 0.9 }[age] }),
  // a slow, dreamy 3-year-old: listens longer, thinks long, looks away a lot, aims loosely, taps where the fish WAS, often taps water
  slow3: () => ({ skill: 0.6, listen: 3.2, think: [2.5, 5], between: [1.5, 3], aim: 0.85, lag: 0.35, hold: [0.1, 0.5], followHint: 0.85, pDistract: 0.15,
    distract: [4, 12], pSoft: 0.12, pCritter: 0.7, talk: [3, 7], talkSkill: 0.6 })
};

class Kid {
  constructor(w, p, seed) { this.w = w; this.p = p; this.r = new TL.RNG(seed); this.t = -1; this.g = null; this.critterDone = false; this.key = ''; this.talkT = -1; this.stats = { taps: 0, soft: 0 }; }
  _u(a) { return this.r.float(a[0], a[1]); }
  onEvent(e) {
    if (e.type === 'ask' && e.first) this.t = this.p.listen + this._u(this.p.think);
    else if (e.type === 'wrong') this.t = this._u(this.p.between) + 0.8;   // hears the kind words
    else if (e.type === 'hint') this.t = Math.min(this.t < 0 ? 1e9 : this.t, 1.2 + this._u([0, 1]));
  }
  _press(x, y) { const w = this.w; w.pointerDown(x, y); this.g = { x, y, T: this._u(this.p.hold), t: 0 }; this.stats.taps++; }
  step(dt) {
    const w = this.w, p = this.p, r = this.r;
    if (this.g) { this.g.t += dt; if (this.g.t >= this.g.T) { w.pointerUp(this.g.x, this.g.y); this.g = null; } return; }
    if (w.state === 'talk') {
      if (w.talkAnswered || !w.talk) { this.talkT = -1; return; }
      if (this.talkT < 0) this.talkT = this._u(p.talk);
      this.talkT -= dt;
      if (this.talkT <= 0 && w.talkOpen()) {
        this.talkT = -1;
        let pick = w.talk.answer;
        if (!w.talk.glowAnswer && !r.chance(p.talkSkill)) { const o = w.talk.choices.filter(c => c.id !== w.talk.answer); if (o.length) pick = r.pick(o).id; }
        w.talkAnswer(pick);
      }
      return;
    }
    const key = w.level + ':' + w.round;
    if (key !== this.key) { this.key = key; this.critterDone = !r.chance(p.pCritter); }
    const ch = w.critterHit();
    if (ch && !this.critterDone && r.chance(0.02)) { this.critterDone = true; this._press(ch.x, ch.y); return; }
    if (!w.interactive) return;
    if (this.t < 0) this.t = p.listen + this._u(p.think);
    this.t -= dt;
    if (this.t > 0) return;
    if (r.chance(p.pDistract)) { this.t = this._u(p.distract); return; }
    this.t = this._u(p.between);
    const L = w.layout;
    if (r.chance(p.pSoft)) {
      for (let k = 0; k < 8; k++) {
        const x = r.float(L.swim.x0, L.swim.x1), y = r.float(L.surfaceY + 20, L.groundY - 20);
        if (!w._memberNear(x, y).m) { this.stats.soft++; this._press(x, y); return; }
      }
    }
    const tg = w.target, help = !!w.hintHand || !!w.assistId;
    let m = tg;
    if (!(help ? r.chance(p.followHint) : r.chance(p.skill))) {
      const o = w.members.filter(q => !q.target && (q.state === 'swim' || q.state === 'dart'));
      if (o.length) m = r.pick(o);
    }
    if (!m) return;
    const seen = w._posAt(m, w.time - p.lag), rr = w._hitR(m);
    this._press(seen.x + r.float(-p.aim, p.aim) * rr, seen.y + r.float(-p.aim, p.aim) * rr * 0.7);
  }
}
class BotKid {
  constructor(w, skill, seed) { this.bot = new TL.Bot(w, { skill, seed }); }
  onEvent(e) { this.bot.onEvent(e); }
  step(dt) { this.bot.step(dt); }
}
function makeModel(name, w, age, seed) {
  if (/^bot/.test(name)) return new BotKid(w, +name.slice(3) || 0, seed);
  return new Kid(w, PROFILES[name](age), seed);
}

/** One whole session → stats { done, min, chapters [s], rounds [{s, misses, hint, stars}], hints, stuck, nan, offscreen }. */
function runSession(o) {
  const w = mkWorld(o), kid = makeModel(o.model, w, o.age, o.seed + 1), dt = 1 / 30;
  const S = { model: o.model, age: o.age, done: false, nan: false, time: 0, chapters: [], rounds: [], stuck: 0, off: 0, talkAuto: 0 };
  w.newSession();
  let R = null, chap0 = 0, t = 0;
  while (w.state !== 'sessionDone' && t < (o.cap || 1500)) {
    kid.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      kid.onEvent(e);
      if (e.type === 'level') chap0 = t;
      if (e.type === 'round') R = { t0: t, misses: 0, hint: 0, stars: 0 };
      if (e.type === 'wrong' && R) R.misses++;
      if (e.type === 'hint' && R) R.hint++;
      if (e.type === 'roundDone' && R) { R.stars = e.stars; R.s = t - R.t0; S.rounds.push(R); if (R.s > 120) S.stuck++; R = null; }
      if (e.type === 'talk') S.chapters.push(t - chap0);
      if (e.type === 'talkResult' && e.auto) S.talkAuto++;
    }
    for (const m of w.members) {
      if (![m.x, m.y, m.rot, m.sx, m.sy].every(Number.isFinite)) { S.nan = true; break; }
      if (m.state === 'swim' && (m.x < 0 || m.x > w.layout.W || m.y > w.layout.H)) S.off++;
    }
    if (S.nan) break;
  }
  S.done = w.state === 'sessionDone'; S.time = t; S.min = t / 60; S.stars = w.stars;
  return S;
}

module.exports = { TL, VIEWPORTS, PROFILES, mkWorld, makeModel, runSession, mean, pct, f1 };
