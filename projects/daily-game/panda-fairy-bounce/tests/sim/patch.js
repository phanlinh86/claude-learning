// Mochi's Fairy Bounce — runtime CONFIG/DIFF overrides for the playtest (never edits game/js).
//   node tests/sim/playtest.js --patch proposed     → simulate with the proposal below
// `cfg` is deep-merged into MFB.World.CONFIG; `code(MFB)` (optional) swaps a World method to prove a code fix.
'use strict';

/** anti-stall bank shot: if the straight line to the nearest block needs more than MAX_ANGLE, aim at its mirror
 *  image in the nearer side wall instead (the ball banks off the wall into the block). Proposed for world.js:601. */
function bankShot(MFB) {
  const W = MFB.World, C = W.CONFIG, DEG = Math.PI / 180;
  W.prototype._nearestBrickAngle = function (x, y) {
    let best = null, bd = 1e9;
    for (const k of this.bricks) {
      if (!k.alive) continue;
      const d = Math.abs(k.x - x) + 0.3 * (k.y - y);
      if (d < bd) { bd = d; best = k; }
    }
    if (!best) return null;
    const r = C.BALL_R, ty = best.y - best.h / 2 - r - y;          // aim at the block's underside
    let a = Math.atan2(best.x - x, ty) / DEG;
    if (Math.abs(a) > C.MAX_ANGLE) {
      const mirror = a > 0 ? 2 * (C.FIELD_W - r) - best.x : 2 * r - best.x;   // the wall the block is near
      a = Math.atan2(mirror - x, ty) / DEG;
    }
    return a;
  };
}

/** bank shot + "out of reach" fallback (a random 18–54° toward the block: a fixed angle can lock the ball
 *  into a periodic orbit with a steady player) + the steer grows from 50 % to 100 % at 2 × ANTI_STALL.
 *  Proposed for world.js:587-590 and :601-611. */
function smartStall(MFB) {
  bankShot(MFB);
  const W = MFB.World, C = W.CONFIG, near = W.prototype._nearestBrickAngle;
  W.prototype._nearestBrickAngle = function (x, y) {
    const a = near.call(this, x, y);
    if (a === null || Math.abs(a) <= C.MAX_ANGLE) return a;
    return Math.sign(a) * this.rng.range(0.3, 0.9) * C.MAX_ANGLE;   // random: breaks a periodic orbit
  };
  // the blend weight lives inside _collidePaddle (0.5 hard-coded): wrap the call to re-blend with weight k
  const orig = W.prototype._collidePaddle;
  W.prototype._collidePaddle = function (b, ox, oy) {
    const ns = this.noBrickT;
    if (ns <= C.ANTI_STALL) return orig.call(this, b, ox, oy);
    const k = Math.min(1, 0.5 + 0.5 * (ns - C.ANTI_STALL) / C.ANTI_STALL);
    const saveNear = this._nearestBrickAngle, self = this;
    // world: ang = 0.5·ang + 0.5·tgt  →  feed tgt' so that 0.5·ang + 0.5·tgt' = (1−k)·ang + k·tgt
    this._nearestBrickAngle = function (xc, line) {
      const tgt = saveNear.call(self, xc, line); if (tgt === null) return null;
      const p = self.paddle, reach = p.w / 2 + b.r, off = Math.max(-1, Math.min(1, (xc - p.x) / reach));
      const ang = off * C.MAX_ANGLE + Math.max(-C.NUDGE_MAX, Math.min(C.NUDGE_MAX, p.vx * C.NUDGE_K));
      return 2 * ((1 - k) * ang + k * tgt) - ang;
    };
    try { return orig.call(this, b, ox, oy); } finally { delete this._nearestBrickAngle; }
  };
}

const PATCHES = {
  none: {},
  // CONFIG only (the minimal proposal)
  proposed: {
    cfg: {
      ANTI_STALL: 5,                                                  // 12 → 5 s
      DIFF: { easy: { ballSpeed: 5.4, paddleW: 3.6, netSaves: 8 } }   // 6.2 → 5.4 u/s, 3.0 → 3.6 u, 2 → 8 vine saves
    }
  },
  // CONFIG + the anti-stall bank-shot code fix
  'proposed+bank': { base: 'proposed', code: bankShot },
  easyOnly: { cfg: { DIFF: { easy: { ballSpeed: 5.4, paddleW: 3.6, netSaves: 8 } } } },
  'bank': { code: bankShot },
  'proposed+stall': { base: 'proposed', code: smartStall },
  'stall': { code: smartStall }
};

function merge(dst, src) {
  for (const k of Object.keys(src)) {
    if (src[k] && typeof src[k] === 'object' && !Array.isArray(src[k])) merge(dst[k], src[k]);
    else dst[k] = src[k];
  }
}
/** apply a named patch to the MFB loaded in a vm sandbox */
function apply(MFB, name) {
  const p = PATCHES[name];
  if (!p) throw new Error('unknown patch ' + name);
  if (p.base) apply(MFB, p.base);
  if (p.cfg) merge(MFB.World.CONFIG, p.cfg);
  if (p.code) p.code(MFB);
  return MFB.World.CONFIG;
}
module.exports = { apply, PATCHES };
