// Finn's Island Fling — the playtest's recommended patch, as data the sims can load (report-only: the game files
// are never touched; `src` entries are applied to an in-memory copy of game/js/world.js by tests/sim/lib.js).
'use strict';

// ---- code fixes (exact replacements in game/js/world.js) ----
const SRC = {
  // F1 — flutter spam / early taps: a tap while Finn still rises faster than FLUTTER_VY does nothing (and is NOT
  // used up); otherwise vy = FLUTTER_VY. On the way down this is identical to today's rescue (max(vy,0)+3.2 = 3.2).
  flutter: [
    ['world.js',
      "    if (this.phase !== 'fly' || this.fluttered) return false;\n    var fox = this.fox;\n    fox.vy = M.max(fox.vy, 0) + CONFIG.FLUTTER_VY;",
      "    if (this.phase !== 'fly' || this.fluttered) return false;\n    var fox = this.fox;\n    if (fox.vy >= CONFIG.FLUTTER_VY) return false;                          // still shooting up: tap ignored, not used up\n    fox.vy = CONFIG.FLUTTER_VY;"],
    ['world.js',
      "if (flutterAt !== undefined && flutterAt !== null && !fluttered && ft >= flutterAt) { f.vy = M.max(f.vy, 0) + C.FLUTTER_VY; fluttered = true; }",
      "if (flutterAt !== undefined && flutterAt !== null && !fluttered && ft >= flutterAt && f.vy < C.FLUTTER_VY) { f.vy = C.FLUTTER_VY; fluttered = true; }"]
  ],
  // F2 — a flop is a free RETRY of the same shot (same raft, same leaves still there) instead of a free re-roll.
  flopRetry: [
    ['world.js',
      "      if (this.phaseT >= C.FLOP_T) this._newShot(false);",
      "      if (this.phaseT >= C.FLOP_T) this._retryShot();"],
    ['world.js',
      "  World.prototype._makeLeaves = function () {",
      "  /** after a flop: Finn hops back into the sling; raft (still drifting) and the remaining leaves stay */\n" +
      "  World.prototype._retryShot = function () {\n" +
      "    var C = CONFIG, fox = this.fox;\n" +
      "    this.phase = 'aim'; this.phaseT = 0; this.pull = null; this.fluttered = false; this._pulled = false;\n" +
      "    fox.x = fox.px = this.sling.x; fox.y = fox.py = this.sling.y;\n" +
      "    fox.vx = fox.vy = 0; fox.rot = fox.prot = 0; fox.spin = 0; fox.bonkT = 0; fox.flutT = 0; fox.flightT = 0; fox.state = 'sit';\n" +
      "    this._emit({ type: 'newShot', retry: true });\n" +
      "  };\n\n" +
      "  World.prototype._makeLeaves = function () {"]
  ],
  // F3 — heart refill per difficulty (DIFF.<d>.heartEvery, falls back to CONFIG.HEART_EVERY)
  heartEvery: [
    ['world.js',
      "if (this.leafCount % C.HEART_EVERY === 0 && this.hearts < this.maxHearts) {",
      "if (this.leafCount % (this.D.heartEvery || C.HEART_EVERY) === 0 && this.hearts < this.maxHearts) {"]
  ],
  // F4 — the leaf "solution arc" must not run through a gull for a release 0.5–3 s after the shot appears
  gullSafeArc: [
    ['world.js',
      "      if (s && s.pull && s.apex <= C.ARC_APEX && s.v <= C.VMAX * 0.97) sol = s;",
      "      if (s && s.pull && s.apex <= C.ARC_APEX && s.v <= C.VMAX * 0.97 && (tries > 20 || !this._arcHitsGull(s))) sol = s;"],
    ['world.js',
      "  World.prototype._makeLeaves = function () {",
      "  /** does the analytic arc s pass within R_FOX + GULL_R + 0.2 of a gull for a release 0.5–3 s from now? */\n" +
      "  World.prototype._arcHitsGull = function (s) {\n" +
      "    var C = CONFIG, R = C.R_FOX + C.GULL_R + 0.15, p = { x: 0, y: 0 };\n" +
      "    for (var i = 0; i < this.gulls.length; i++) {\n" +
      "      var g = this.gulls[i];\n" +
      "      for (var w = 0.5; w <= 3.01; w += 0.5) for (var t = 0; t <= s.T; t += 0.04) {\n" +
      "        gullPos(g, g.t + w + t, p);\n" +
      "        var dx = s.x0 + s.vx * t - p.x, dy = s.y0 + s.vy * t - 0.5 * C.G * t * t - p.y;\n" +
      "        if (dx * dx + dy * dy < R * R) return true;\n" +
      "      }\n" +
      "    }\n" +
      "    return false;\n" +
      "  };\n\n" +
      "  World.prototype._makeLeaves = function () {"]
  ]
};

// ---- data changes ----
const DATA = {
  // D1 — wider raft spawn ranges: kills the "one memorised pull" strategy (cove easy 96 % → ~70 %), aiming still matters
  ranges: { LEVELS: [ { x: [7.3, 13.8] }, { x: [7.4, 14.0] }, { x: [7.8, 14.3] }, { x: [8.3, 14.5] } ] },
  // D2 — Easy is for 4–5-year-olds: bigger deck, calmer drift, longer preview, faster heart refill
  easy: { DIFF: { easy: { hwK: 1.4, ampK: 0.5, previewK: 1.6, heartEvery: 12 }, normal: { heartEvery: 20 }, hard: { heartEvery: 25 } } }
};

function combine(parts) {
  const p = { CONFIG: {}, DIFF: {}, LEVELS: [], src: [] };
  for (const x of parts) {
    if (Array.isArray(x)) { p.src = p.src.concat(x); continue; }
    if (x.CONFIG) Object.assign(p.CONFIG, x.CONFIG);
    if (x.DIFF) for (const d in x.DIFF) p.DIFF[d] = Object.assign(p.DIFF[d] || {}, x.DIFF[d]);
    if (x.LEVELS) x.LEVELS.forEach((o, i) => { if (o) p.LEVELS[i] = Object.assign(p.LEVELS[i] || {}, o); });
  }
  // the source edits for _makeLeaves insert before the same anchor: apply F4 before F2 is fine (both keep the anchor)
  return p;
}

const PATCH = combine([SRC.flutter, SRC.flopRetry, SRC.heartEvery, SRC.gullSafeArc, DATA.ranges, DATA.easy]);
module.exports = { PATCH, SRC, DATA, combine };
