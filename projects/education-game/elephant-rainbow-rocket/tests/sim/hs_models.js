// Bim's Rainbow Rocket — extra child models + harness-side emulations for the high-speed playtest (report-only).
//   const M = require('./hs_models'); const d = M.makeModel('spammer', world, age, seed);
// Models drive ONLY the public input API (pointerDown/Move/Up, talkAnswer), exactly like a finger.
// Emulations (`emulate(world, opts)`) wrap the world's input methods to MEASURE proposed code changes before anyone edits
// game/js: they are not part of the game.
'use strict';
const L = require('./lib');
const RR = L.RR, clamp = L.clamp;

function rowIslands(w) { return w.islands.filter(i => i.state === 'idle' && i.token && w._row && w._row.ids.indexOf(i.id) >= 0); }
function tapAt(w, x, y) { const id = w.pointerDown(x, y); const up = w.pointerUp(x, y); return id || up; }
function talkRandom(self, dt, after) {
  const w = self.w, r = self.r;
  if (w.talkAnswered) return;
  if (self.talkT < 0) self.talkT = r.float(after[0], after[1]);
  self.talkT -= dt;
  if (self.talkT <= 0) { self.talkT = -1; w.talkAnswer(r.pick(w.talk.choices).id); }
}

/** Spammer: taps 6×/s. mode 'islands' → always on a random island of the row (also during flights / appear);
 *  mode 'any' → anywhere on the screen. boostReady: the next tap boosts (anywhere boosts). Talk: random choice after 1–2 s. */
class Spammer {
  constructor(w, seed, mode) { this.w = w; this.r = new RR.RNG(seed); this.mode = mode || 'islands'; this.t = 0.3; this.talkT = -1; this.stats = { taps: 0, drags: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [1, 2]);
    this.talkT = -1;
    this.t -= dt; if (this.t > 0) return;
    this.t += 1 / 6;
    let x, y;
    const row = w.islands.filter(i => i.token && !i.collected && (i.state === 'idle' || i.state === 'appear'));
    if (this.mode === 'islands' && row.length) { const h = w.islandHit(r.pick(row)); x = h.x + r.float(-0.3, 0.3) * h.w * 0.6; y = h.y + r.float(-0.25, 0.25) * h.h * 0.6; }
    else { x = r.float(0, w.layout.W); y = r.float(0, w.layout.H); }
    this.stats.taps++;
    tapAt(w, x, y);
  }
}

/** Confused child: does not understand the question yet — taps random spots every 1–2.5 s, but when an island glows
 *  (hint) it taps that island with p = 0.85. Measures whether help reaches a child who taps the sky. */
class Confused {
  constructor(w, seed) { this.w = w; this.r = new RR.RNG(seed); this.t = 1; this.talkT = -1; this.stats = { taps: 0, drags: 0 }; }
  step(dt) {
    const w = this.w, r = this.r;
    if (w.state === 'talk') return talkRandom(this, dt, [3, 6]);
    this.talkT = -1;
    this.t -= dt; if (this.t > 0) return;
    this.t = r.float(1, 2.5);
    const g = w.state === 'round' && w.phase === 'ask' ? rowIslands(w).find(i => i.glow > 0.3) : null;
    let x, y;
    if (g && r.chance(0.85)) { const h = w.islandHit(g.id); x = h.x; y = h.y; } else { x = r.float(0, w.layout.W); y = r.float(0, w.layout.H); }
    this.stats.taps++;
    tapAt(w, x, y);
  }
}

/** Absent child: never touches the screen (the parent started the game and walked off with the child). */
class Absent { constructor() { this.stats = { taps: 0, drags: 0 }; } step() {} }

/** Sloppy dragger: always drags a flight line from the rocket and lets go ON the island (35 %), just OFF its hit area
 *  (45 %: 10–70 px beyond the edge) or far away (20 %). A release that hits nothing → tries again after 1–2 s. */
class Sloppy {
  constructor(w, age, seed) {
    this.w = w; this.r = new RR.RNG(seed); this.p = L.typicalProfile(age); this.key = ''; this.t = -1; this.tried = []; this.drag = null;
    this.talkT = -1; this.boostT = null; this.stats = { taps: 0, drags: 0, dragFail: 0, dragOn: 0, dragNear: 0, dragFar: 0 };
  }
  step(dt) {
    const w = this.w, r = this.r, p = this.p;
    if (w.state === 'talk') return talkRandom(this, dt, [3, 6]);
    this.talkT = -1;
    if (w.state === 'roundDone' && w.phase === 'boostReady') {
      if (this.boostT === null) this.boostT = r.float(0.8, 3);
      this.boostT -= dt;
      if (this.boostT <= 0) { const h = w.rocketHit(); tapAt(w, h.x, h.y); this.boostT = 99; }
      return;
    }
    this.boostT = null;
    if (w.state !== 'round' || w.phase !== 'ask') { if (this.drag) { w.cancelDrag(); this.drag = null; } return; }
    const key = w.sessions + ':' + w.level + ':' + w.round + ':' + w.hop;
    if (key !== this.key) { this.key = key; this.tried = []; this.t = r.float(p.think[0], p.think[1]); }
    if (this.drag) {
      const D = this.drag; D.t += dt;
      const u = clamp(D.t / D.T, 0, 1), s = u * u * (3 - 2 * u);
      const x = D.x0 + (D.x1 - D.x0) * s, y = D.y0 + (D.y1 - D.y0) * s;
      w.pointerMove(x, y);
      if (u >= 1) {
        const id = w.pointerUp(x, y); this.drag = null;
        if (!id) { this.stats.dragFail++; this.t = r.float(1, 2); }
        else if (w.phase === 'ask') { this.tried.push(id); this.t = r.float(1, 2); }
      }
      return;
    }
    this.t -= dt; if (this.t > 0) return;
    const ans = w.answerId(); if (!ans) return;
    const right = w.islandById(ans), wrong = rowIslands(w).filter(i => i.id !== ans && !this.tried.includes(i.id));
    const isl = r.chance(right.glow > 0.3 ? p.followHint : p.skill) || !wrong.length ? right : r.pick(wrong);
    const h = w.islandHit(isl.id), kind = r.next();
    let x, y;
    if (kind < 0.35) { this.stats.dragOn++; x = h.x + r.float(-0.25, 0.25) * h.w * 0.6; y = h.y + r.float(-0.2, 0.2) * h.h * 0.6; }
    else if (kind < 0.8) {
      this.stats.dragNear++;
      const a = r.float(0, Math.PI * 2), rx = h.w / 2 + 24, ry = h.h / 2 + 24, ex = r.float(10, 70);
      x = h.x + Math.cos(a) * (rx + ex); y = h.y + Math.sin(a) * (ry + ex);
    } else { this.stats.dragFar++; x = r.float(0, w.layout.W); y = r.float(0, w.layout.H); }
    x = clamp(x, 2, w.layout.W - 2); y = clamp(y, 2, w.layout.H - 2);
    const rk = w.rocketHit();
    if (w.pointerDown(rk.x, rk.y) === 'rocket') { this.stats.drags++; this.drag = { x0: rk.x, y0: rk.y, x1: x, y1: y, t: 0, T: r.float(0.4, 0.9) }; }
    else { w.pointerUp(rk.x, rk.y); this.t = 0.5; }
  }
}

function slowProfile() {   // slow 3-year-old: long think 3–8 s, 40 % wrong, long retries, often distracted
  return { skill: 0.6, think: [3, 8], retry: [2, 4], followHint: 0.8, pDistract: 0.12, distract: [4, 12], drag: 0.1,
    boost: [1.5, 4.5], pBoost: 0.7, talk: [4, 9], talkRight: 0.6 };
}

function makeModel(name, w, age, seed) {
  switch (name) {
    case 'typical': return new L.Kid(w, L.typicalProfile(age), seed);
    case 'slow3': return new L.Kid(w, slowProfile(), seed);
    case 'boostIgnorer': { const p = L.typicalProfile(age); p.pBoost = 0; return new L.Kid(w, p, seed); }
    case 'talkAbsent': { const k = new L.Kid(w, L.typicalProfile(age), seed); const s = k.step.bind(k); k.step = dt => { if (w.state !== 'talk') s(dt); }; return k; }
    case 'tapper': return new L.Tapper(w, seed);
    case 'spammer': return new Spammer(w, seed, 'islands');
    case 'spammerAny': return new Spammer(w, seed, 'any');
    case 'sloppy': return new Sloppy(w, age, seed);
    case 'absent': return new Absent();
    case 'confused': return new Confused(w, seed);
  }
  const m = /^bot([\d.]+)$/.exec(name);
  if (m) return new RR.Bot(w, { skill: +m[1], seed });
  throw new Error('unknown model ' + name);
}

/** Harness-side emulation of PROPOSED code changes (measure before editing game/js):
 *  lock: s — after a wrong island, island taps are ignored for `lock` s (no miss counted, no idle reset)
 *  snap: px — a drag released within `snap` px of an island's hit box (and on no island) flies there
 *  skyIdle: true — taps that hit nothing do not reset the idle timer (a sky-tapping child still gets nudges + glow)
 *  hint2: true — the 2nd miss on a hop always glows the answer (the 6 s cooldown only gates idle / 3rd+ miss glows) */
function emulate(w, o) {
  if (!o) return;
  const down = w.pointerDown.bind(w), up = w.pointerUp.bind(w);
  let lockUntil = -1;
  const hitIsland = (sx, sy) => w._rowIsland(sx, sy + w.camY);
  const afterWrong = n0 => {
    for (let k = n0; k < w.events.length; k++) {
      const e = w.events[k];
      if (e.type !== 'wrong') continue;
      if (o.lock) lockUntil = w.time + (o.lock2 && e.misses >= 2 ? o.lock2 : o.lock);
      if (o.hint2 && e.misses === w.cfg.hintAfterMisses && !w.events.slice(k).some(x => x.type === 'hint')) w._doHint(false);
    }
  };
  w.pointerDown = function (sx, sy) {
    if (o.lock && w.state === 'round' && w.phase === 'ask' && w.time < lockUntil && hitIsland(sx, sy) && !w._inRocket(sx, sy + w.camY, 0)) return 'locked';
    const it = w._idleT, ig = w._idleGap, n0 = w.events.length;
    const res = down(sx, sy);
    if (o.skyIdle && res === null && w.state === 'round') { w._idleT = it; w._idleGap = ig; }
    afterWrong(n0);
    return res;
  };
  w.pointerUp = function (sx, sy) {
    const d = w._drag, n0 = w.events.length;
    if (o.lock && d && w.time < lockUntil && w.phase === 'ask' && sx !== undefined && hitIsland(sx, sy)) { w.cancelDrag(); return 'locked'; }
    let res = up(sx, sy);
    if (o.snap && d && res === null && w.state === 'round' && w.phase === 'ask' && sx !== undefined && Math.hypot(sx - d.x0, sy - d.y0) >= w.cfg.tapMove) {
      let best = null, bd = o.snap;
      for (const i of rowIslands(w)) {
        const h = w.islandHit(i.id), dx = Math.max(0, Math.abs(sx - h.x) - h.w / 2 - 24), dy = Math.max(0, Math.abs(sy - h.y) - h.h / 2 - 24), dd = Math.hypot(dx, dy);
        if (dd <= bd) { bd = dd; best = i; }
      }
      if (best) { w._answer(best); res = best.id; w._snaps = (w._snaps || 0) + 1; }
    }
    afterWrong(n0);
    return res;
  };
}

module.exports = { makeModel, emulate, Spammer, Absent, Sloppy, slowProfile };
