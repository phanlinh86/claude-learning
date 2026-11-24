// Nubi's Farm Fling — the playtest's recommended patch, as data the sims load (report-only: game/ is never touched;
// `src` entries are exact replacements applied to an in-memory copy of game/js/world.js by tests/sim/lib.js).
'use strict';

const SRC = {
  // S1 — seasons last a fixed number of waterings PER DIFFICULTY (DIFF.<d>.landings, fallback LANDINGS_PER_LEVEL).
  //      render.js must read the same number for the HUD pips (see docs/reports/playtest.md).
  landingsPerDiff: [
    ['world.js',
      "        if (this.levelLandings >= C.LANDINGS_PER_LEVEL) this._setLevel(this.level + 1, false);",
      "        if (this.levelLandings >= (this.D.landings || C.LANDINGS_PER_LEVEL)) this._setLevel(this.level + 1, false);"]
  ],
  // S2 — crow-safe firefly arcs: check the release window around the expected aim time (0.5–1.5 s, not 0.5–3 s, which
  //      almost no arc passes with 2–3 crows) and allow more tries before giving up on the check.
  crowSafeArc: [
    ['world.js',
      "      for (w = 0.5; w <= 3.01; w += 0.5) for (i = 0; i < path.length; i++) {",
      "      for (w = 0.5; w <= 1.51; w += 0.5) for (i = 0; i < path.length; i++) {"],
    ['world.js',
      "    for (var tries = 0; tries < 16 && !best; tries++) {",
      "    for (var tries = 0; tries < 32 && !best; tries++) {"],
    ['world.js',
      "      if (tries < 12 && this._arcHitsCrow(sol.pull, s0, g0)) continue;",
      "      if (tries < 28 && this._arcHitsCrow(sol.pull, s0, g0)) continue;"]
  ],
  // S3 — mist alone can't make Nubi big: the slow aim/flight growth stops at MIST_CAP; only fireflies go beyond.
  //      (kills "sit in the aim phase for 2 minutes → max size → 100 % landings, never die")
  mistCap: [
    ['world.js',
      "    if (rate) f.goal = M.min(C.SIZE_MAX, f.goal + rate * h);",
      "    if (rate && f.goal < C.MIST_CAP) f.goal = M.min(C.MIST_CAP, f.goal + rate * h);"],
    ['world.js',
      "    var wait = C.ARC_WAIT, g0 = M.min(C.SIZE_MAX, n0.goal + C.GROW_RATE * wait);",
      "    var wait = C.ARC_WAIT, g0 = n0.goal < C.MIST_CAP ? M.min(C.MIST_CAP, n0.goal + C.GROW_RATE * wait) : n0.goal;"]
  ]
};

const DATA = {
  landings: { DIFF: { easy: { landings: 6 }, normal: { landings: 9 }, hard: { landings: 10 } } },
  mistCap: { CONFIG: { MIST_CAP: 1.3 } },
  rainKeep: { CONFIG: { RAIN_KEEP: 0.5 } }
};

function combine(parts) {
  const p = { CONFIG: {}, DIFF: {}, LEVELS: [], src: [] };
  for (const x of parts) {
    if (Array.isArray(x)) { p.src = p.src.concat(x); continue; }
    if (x.CONFIG) Object.assign(p.CONFIG, x.CONFIG);
    if (x.DIFF) for (const d in x.DIFF) p.DIFF[d] = Object.assign(p.DIFF[d] || {}, x.DIFF[d]);
    if (x.LEVELS) x.LEVELS.forEach((o, i) => { if (o) p.LEVELS[i] = Object.assign(p.LEVELS[i] || {}, o); });
  }
  return p;
}

const PATCH = combine([SRC.landingsPerDiff, DATA.landings, SRC.crowSafeArc, SRC.mistCap, DATA.mistCap, DATA.rainKeep]);
module.exports = { PATCH, SRC, DATA, combine };
