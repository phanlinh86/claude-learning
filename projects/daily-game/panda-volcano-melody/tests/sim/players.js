// Tofu's Volcano Melody — player models for the high-speed playtest (tests/sim/run.js). No DOM.
// Every model is a controller: `p.step(dt)` is called every frame BEFORE `world.update(dt)` and only talks to
// the world through setTarget / clearTarget (a finger on the screen), exactly like the real touch input.
'use strict';

function hyp(x, y) { return Math.sqrt(x * x + y * y); }

/* ---------------------------------------------------------------------------------------------------------
 * Human: a parametric human-ish player. The kid and the adult are parameter sets of this one model.
 *   react        s between looks at the screen (±30 %); between looks the finger stays where it was
 *   noise        px of aim error (finger is not exactly on the note)
 *   ignoreCrabs  probability that a look ignores crabs completely
 *   dangerR / avoidW   crab avoidance radius and strength when crabs are noticed
 *   readShadow   probability to aim at the shadow (landing spot) of a flying note instead of the note sprite
 *   pickRandom   probability to go for a random visible note instead of the closest one
 *   touchOn / touchOff  [min,max] s of holding / not touching the screen (lets go, looks around, talks)
 *   wanderP      probability per look to start "wandering" (walking Tofu to a random spot, not a note)
 *   wanderTime   [min,max] s of one wander
 *   slowStart    s before the first touch after a season starts (banner, "what now?")
 * ------------------------------------------------------------------------------------------------------- */
function Human(PVM, world, opts) {
  this.PVM = PVM; this.w = world; this.o = opts;
  this.rng = PVM.RNG(opts.seed !== undefined ? opts.seed : 7);
  this.name = opts.name || 'human';
  this._look = 0; this._goal = null; this._aim = null; this._snap = []; this._ignore = false;
  this._touch = true; this._touchT = this._r(opts.touchOn || [999, 999]);
  this._wanderT = 0; this._phase = null; this._startT = 0;
}
Human.prototype._r = function (a) { return this.rng.range(a[0], a[1]); };
Human.prototype._plan = function () {
  const w = this.w, o = this.o, T = w.tofu, r = this.rng;
  this._ignore = r.chance(o.ignoreCrabs || 0);
  this._snap = [];
  if (!this._ignore) for (const k of w.crabs) if (k.state === 'chase' || k.state === 'wander') this._snap.push({ x: k.x, y: k.y });
  if (this._wanderT > 0) return;                                   // keep wandering
  if (r.chance(o.wanderP || 0)) {                                  // "look, a butterfly!"
    this._wanderT = this._r(o.wanderTime || [2, 4]);
    const A = this.PVM.ARENA;
    this._goal = { id: -9, x: r.range(A.x + 40, A.x + A.w - 40), y: r.range(A.y + 40, A.y + A.h - 30) };
    this._aim = null;
    return;
  }
  const cands = [];
  for (const n of w.notes) {
    const shadow = n.state === 'fly' && r.chance(o.readShadow === undefined ? 1 : o.readShadow);
    let px = n.x, py = n.y - n.z;                                  // the sprite the child sees …
    if (shadow && n.landX !== undefined) { px = n.landX; py = n.landY; } // … or where it will land
    else if (shadow) { py = n.y; }
    let cost = hyp(px - T.x, py - T.y);
    for (const c of this._snap) { const cd = hyp(px - c.x, py - c.y); if (cd < 110) cost += (110 - cd) * 2; }
    if (this._goal && this._goal.id === n.id) cost -= 40;
    cands.push({ id: n.id, x: px, y: py, cost });
  }
  if (w.mango && w.hearts < w.maxHearts && (o.mangoSense || 0) > 0) {
    cands.push({ id: -1, x: w.mango.x, y: w.mango.y, cost: hyp(w.mango.x - T.x, w.mango.y - T.y) - o.mangoSense });
  }
  if (!cands.length) {
    // nothing to catch: a kid just stands there; an adult keeps away from the crabs ('flee' = best open spot)
    if (o.idle === 'flee' && this._snap.length) {
      const A = this.PVM.ARENA; let best = null, bs = -Infinity;
      for (let gx = 0; gx < 5; gx++) for (let gy = 0; gy < 3; gy++) {
        const x = A.x + 80 + gx * (A.w - 160) / 4, y = A.y + 60 + gy * (A.h - 110) / 2;
        let ok = true; for (const ob of w.obstacles) if (hyp(x - ob.cx, y - ob.cy) < ob.r + 30) ok = false;
        if (!ok) continue;
        let m = Infinity; for (const c of this._snap) m = Math.min(m, hyp(x - c.x, y - c.y));
        const sc = Math.min(m, 320) - 0.25 * hyp(x - T.x, y - T.y);
        if (sc > bs) { bs = sc; best = { id: -5, x, y }; }
      }
      if (best && (!this._goal || this._goal.id !== -5 || hyp(this._goal.x - best.x, this._goal.y - best.y) > 1)) this._aim = { x: 0, y: 0 };
      this._goal = best; return;
    }
    this._goal = null; return;
  }
  cands.sort((a, b) => a.cost - b.cost);
  let g = cands[0];
  if (cands.length > 1 && r.chance(o.pickRandom || 0)) g = cands[r.int(0, cands.length - 1)];
  if (!this._goal || this._goal.id !== g.id) this._aim = { x: r.range(-1, 1) * o.noise, y: r.range(-1, 1) * o.noise };
  this._goal = g;
};
Human.prototype.step = function (dt) {
  const w = this.w, o = this.o;
  if (w.phase !== this._phase) { this._phase = w.phase; if (w.phase === 'playing') this._startT = o.slowStart || 0; }
  if (w.phase !== 'playing') { w.clearTarget(); this._goal = null; this._wanderT = 0; return; }
  if (this._startT > 0) { this._startT -= dt; w.clearTarget(); return; }
  // touch on/off spells
  this._touchT -= dt;
  if (this._touchT <= 0) { this._touch = !this._touch; this._touchT = this._r(this._touch ? o.touchOn : o.touchOff); }
  if (this._wanderT > 0) this._wanderT -= dt;
  this._look -= dt;
  if (this._look <= 0) { this._look = o.react * this.rng.range(0.7, 1.3); this._plan(); }
  if (!this._touch) { w.clearTarget(); return; }
  // the goal note might be gone (caught, faded): the finger stays there until the next look
  const g = this._goal;
  if (!g) { w.clearTarget(); return; }
  const T = w.tofu, aim = this._aim || { x: 0, y: 0 };
  const gx = g.x + aim.x, gy = g.y + aim.y;
  let dx = gx - T.x, dy = gy - T.y; const d = hyp(dx, dy);
  let rx = 0, ry = 0, any = false;
  if (!this._ignore && w.invulnT < 0.3) for (const c of this._snap) {
    const cx = T.x - c.x, cy = T.y - c.y, cd = hyp(cx, cy);
    if (cd < o.dangerR && cd > 1e-6) { const f = (1 - cd / o.dangerR) * o.avoidW; rx += cx / cd * f; ry += cy / cd * f; any = true; }
  }
  if (!any || d < 1e-6) { w.setTarget(gx, gy); return; }
  const ux = dx / d + rx, uy = dy / d + ry, ul = hyp(ux, uy) || 1, look = Math.min(90, Math.max(30, d));
  w.setTarget(T.x + ux / ul * look, T.y + uy / ul * look);
};

const PRESETS = {
  // (a) a 4-year-old: slow, sloppy, half-blind to crabs, lets go of the screen, wanders, taps the note sprite
  kid4: { name: 'kid4', react: 0.8, noise: 40, ignoreCrabs: 0.5, dangerR: 80, avoidW: 0.9, readShadow: 0.3,
    pickRandom: 0.3, touchOn: [3, 8], touchOff: [1, 4], wanderP: 0.12, wanderTime: [2, 5], slowStart: 1.5, mangoSense: 40 },
  // (b) a casual adult: decent reactions, reads shadows, mostly avoids crabs, occasional lapses
  adult: { name: 'adult', react: 0.3, noise: 12, ignoreCrabs: 0.1, dangerR: 105, avoidW: 1.5, readShadow: 0.9,
    pickRandom: 0.05, touchOn: [10, 25], touchOff: [0.3, 1.0], wanderP: 0, slowStart: 0.4, mangoSense: 120, idle: 'flee' }
};

/* ---------------------------------------------------------------------------------------------------------
 * Exploit / spam players. They never look at notes or crabs.
 * ------------------------------------------------------------------------------------------------------- */
function Scripted(PVM, world, kind, seed) {
  this.PVM = PVM; this.w = world; this.kind = kind; this.name = kind; this.rng = PVM.RNG(seed || 3); this._a = 0; this._t = 0;
}
Scripted.prototype.step = function (dt) {
  const w = this.w, V = this.PVM.VOLCANO_COLLIDER, A = this.PVM.ARENA, T = w.tofu;
  if (w.phase !== 'playing' && w.phase !== 'intro') { w.clearTarget(); return; }
  switch (this.kind) {
    case 'idle': w.clearTarget(); break;                                          // never touches the screen
    case 'corner': w.setTarget(A.x + 20, A.y + A.h - 20); break;                  // finger in the bottom-left corner
    case 'crater': w.setTarget(480, 196); break;                                  // finger on the crater mouth
    case 'hugRock': {                                                             // stand behind this season's rock/palm
      const o = w.obstacles.filter(x => x.kind !== 'volcano')[0];
      w.setTarget(o.cx, o.cy - o.r - 20); break;
    }
    case 'circleTight': case 'circleWide': {                                     // circle the volcano forever
      const R = this.kind === 'circleTight' ? 112 : 190;
      const a = Math.atan2((T.y - V.y) / 0.8, T.x - V.x) + 0.55;                  // lead target along the ellipse
      w.setTarget(V.x + Math.cos(a) * R, V.y + Math.sin(a) * R * 0.8); break;
    }
    case 'spam': {                                                                // random taps everywhere, 3 per s
      this._t -= dt;
      if (this._t <= 0) { this._t = 0.33; this._p = { x: this.rng.range(A.x, A.x + A.w), y: this.rng.range(A.y, A.y + A.h) }; }
      w.setTarget(this._p.x, this._p.y); break;
    }
    case 'zigzag': {                                                              // sweep the meadow row by row
      if (!this._p || hyp(this._p.x - T.x, this._p.y - T.y) < 30) {
        this._a++; const row = this._a % 6, left = (this._a >> 0) % 2 === 0;
        this._p = { x: left ? A.x + 40 : A.x + A.w - 40, y: A.y + 40 + row * 68 };
      }
      w.setTarget(this._p.x, this._p.y); break;
    }
  }
};

module.exports = { Human, PRESETS, Scripted, hyp };
