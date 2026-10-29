// Tuning variants evaluated by tests/sim/run.js --variant <name>.
//  globalPatch(FF)         → mutate FF.CONFIG (BASE values) before difficultyOverrides() reads it,
//                            i.e. exactly what editing world.js CONFIG would do.
//  configAfter(preset, FF) → overrides applied AFTER the preset (= editing difficultyOverrides / settings)
//  patch(world, FF)        → prototype a small MECHANIC change on one world instance (sim only)
'use strict';

/* --- mechanic prototype: treat basket (ammo that refills over time) --- */
function basket(cap, refill) {
  return function (w) {
    w._basket = cap;
    const canDrop0 = w.canDrop.bind(w), spawn0 = w._spawnDrop.bind(w), step0 = w._step.bind(w), reset0 = w.reset.bind(w);
    w.canDrop = function () { return canDrop0() && this._basket >= 1; };
    w._spawnDrop = function (preVy) { this._basket -= 1; return spawn0(preVy); };
    w._step = function (h) { step0(h); if (this.state === 'playing') this._basket = Math.min(cap, this._basket + h / refill); };
    w.reset = function (s) { const r = reset0(s); this._basket = cap; return r; };
  };
}

/* --- mechanic prototype: soft ceiling (cloud cushion) — bird is slowed instead of kicked down --- */
function softCeiling(w) {
  const upd0 = w._updateBird.bind(w);
  w._updateBird = function (h) {
    upd0(h);
    // above y<60 a cushion damps upward speed so the bird glides along the top instead of bonking
    const b = this.bird;
    if (this.state === 'playing' && b.y < 60 && b.vy < 0) b.vy *= Math.exp(-14 * h);
  };
}

/* --- mechanic prototype: Easy-mode "bounce lives" — touching the ground bounces the bird up and costs a heart --- */
function lives(n, presets) {
  return function (w) {
    const isOn = !presets || presets.includes(w._preset);
    if (!isOn) return;
    w._lives = n; w.livesUsed = 0;
    const upd0 = w._updateBird.bind(w), reset0 = w.reset.bind(w);
    w._updateBird = function (h) {
      const b = this.bird, c = this.cfg;
      if (this.state === 'playing' && this._lives > 0 && b.y + b.radius + b.vy * h >= this.groundY && b.vy > 0) {
        this._lives--; this.livesUsed++;
        b.vy = c.flapImpulse * 1.15; this._sinceFlap = 0;
        this._emit({ type: 'bump', x: b.x, y: b.y, lives: this._lives });
      }
      upd0(h);
    };
    w.reset = function (s) { const r = reset0(s); this._lives = n; return r; };
  };
}

/* --- mechanic prototype: combo = feeding streak with a time window; misses no longer reset it --- */
function comboWindow(sec) {
  return function (w) {
    const upd0 = w._updateDrops.bind(w), hit0 = w._hit.bind(w);
    w._lastHitAt = -1e9;
    w._updateDrops = function (h) { const keep = this.combo, m = this.misses; upd0(h); if (this.misses !== m && this.combo === 0) this.combo = keep; };
    w._hit = function (d, t) { if (this.time - this._lastHitAt > sec) this.combo = 0; this._lastHitAt = this.time; return hit0(d, t); };
  };
}

function compose(...fns) { return (w, FF) => fns.forEach(f => f && f(w, FF)); }

/* --- mechanic prototype: "brave flyer" bonus — a hit from a treat released low (y >= lowY) is worth +1 --- */
function lowBonus(lowY, bonus) {
  return function (w) {
    const spawn0 = w._spawnDrop.bind(w), hit0 = w._hit.bind(w);
    w.lowHits = 0;
    w._spawnDrop = function (preVy) { spawn0(preVy); this.drops[this.drops.length - 1].releaseY = this.bird.y; };
    w._hit = function (d, t) {
      const s0 = this.score; hit0(d, t);
      if (d.releaseY >= lowY) {
        this.score += bonus; this.lowHits++;
        const ev = this._events[this._events.length - 1]; if (ev && ev.type === 'hit') { ev.points += bonus; ev.low = true; }
        const idx = Math.floor(this.score / this.cfg.pointsPerSeason);
        if (idx !== this.seasonIndex) { this.seasonIndex = idx; this.season = idx % 4; this._emit({ type: 'season', season: this.season, seasonIndex: idx }); }
      }
    };
  };
}

// recommended package (keep in sync with docs/reports/playtest_report.md)
const PPS = { easy: 12, normal: 25, hard: 25 };
const PPS_PLUS = { easy: 12, normal: 35, hard: 35 };   // the brave-flyer bonus raises points/min ~40 %
function recommendedGlobal(FF) {
  const C = FF.CONFIG;
  C.maxDrops = 2;          // was 6: limits ceiling spam via air-time, aimers unaffected
  C.ceilingBounce = 0;     // was 140: no downward kick at the ceiling (with the cushion below)
}
function recommendedAfter(p, FF, pps) {
  const C = FF.CONFIG, o = { pointsPerSeason: (pps || PPS)[p] };
  if (p === 'easy') { o.gravity = C.gravity * 0.72; o.flapImpulse = C.flapImpulse * 0.9; o.maxFall = C.maxFall * 0.62; }
  return o;
}

module.exports = {
  baseline: {},
  base180: {},          // same as baseline; used by sweep.sh at the reduced settings for like-for-like comparison

  // pacing only
  pps20: { configAfter: () => ({ pointsPerSeason: 20 }) },
  ppsPreset: { configAfter: p => ({ pointsPerSeason: PPS[p] }) },

  // anti-spam (config only)
  cd32: { globalPatch: FF => { FF.CONFIG.dropCooldown = 0.32; FF.CONFIG.maxDrops = 4; } },
  cd45: { globalPatch: FF => { FF.CONFIG.dropCooldown = 0.45; FF.CONFIG.maxDrops = 3; } },
  // anti-spam (mechanic)
  basket4: { patch: basket(4, 0.7) },
  basket3: { patch: basket(3, 0.9) },

  maxd2: { globalPatch: FF => { FF.CONFIG.maxDrops = 2; } },
  maxd3: { globalPatch: FF => { FF.CONFIG.maxDrops = 3; } },
  basket5: { patch: basket(5, 0.5) },
  hitcd15: { globalPatch: FF => { FF.CONFIG.hitCooldown = 1.5; } },

  // ceiling
  ceil40: { globalPatch: FF => { FF.CONFIG.ceilingBounce = 40; } },
  ceil0soft: { globalPatch: FF => { FF.CONFIG.ceilingBounce = 0; }, patch: softCeiling },

  // Easy for little kids
  easyFloat: { configAfter: (p, FF) => p === 'easy' ? { gravity: FF.CONFIG.gravity * 0.72, flapImpulse: FF.CONFIG.flapImpulse * 0.9, maxFall: FF.CONFIG.maxFall * 0.62 } : {} },
  lives3easy: { patch: lives(3, ['easy']) },
  // combo
  combo4s: { patch: comboWindow(4) },

  // full recommended package
  lowBonus: { patch: lowBonus(280, 1) },
  // config + tiny code (cushion) — priority 1–4 in the report
  recommended: { globalPatch: recommendedGlobal, configAfter: recommendedAfter, patch: softCeiling },
  // + the two small mechanics (Easy hearts, brave-flyer bonus) — priority 5–6
  recommendedPlus: { globalPatch: recommendedGlobal, configAfter: (p, FF) => recommendedAfter(p, FF, PPS_PLUS),
    patch: compose(softCeiling, lives(3, ['easy']), lowBonus(280, 1)) }
};
module.exports._helpers = { basket, softCeiling, lives, comboWindow, lowBonus, compose, PPS };
