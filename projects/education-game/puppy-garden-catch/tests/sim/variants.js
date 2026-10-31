// Proposed changes, expressed WITHOUT editing game code:
//   config      → passed to new PG.World({ config })            (pure PG.CONFIG overrides)
//   patch(PG)   → monkey-patches inside the sim sandbox only     (stand-in for a small code change)
//   hooks       → per-session hooks used by lib.runSession       (stand-in for a flow change)
//   speechPolicy→ flags for lib.SpeechModel                       (stand-in for a main.js speech-policy change)
// Add a variant here, then:  node tests/sim/run_matrix.js --variant <name> && node tests/sim/compare.js baseline <name>
'use strict';

const patches = {
  // example patch: no "never two wrong in a row" rule (to measure what it buys)
  noWrongGuard(PG) {
    const P = PG.World.prototype, sp = P._spawn;
    P._spawn = function (force) { if (force === null || force === undefined) this._lastRight = true; return sp.call(this, force); };
  }
};

const VARIANTS = {
  baseline: {},
  designSpeed: { config: { fallSpeed: { 3: 70, 4: 80, 5: 95, 6: 105, 7: 115 }, spawnGap: 1.3, spawnGapAge3: 1.6, firstSpawn: 0.6 } },   // DESIGN §5.2 numbers
  slowFall: { config: { fallSpeed: { 3: 50, 4: 56, 5: 70, 6: 80, 7: 90 } } },
  noMagnet: { config: { magnetMaxAge: 0 } },
  magnet5: { config: { magnetMaxAge: 5 } },
  wideCatch: { config: { catchSideK: 0.4 } },
  calmSpawn: { config: { spawnGap: 2.2, spawnGapAge3: 2.6 } },
  noWrongGuard: { patch: ['noWrongGuard'] },
  tapStays: { config: { tapRuns: false } }        // a tap on a bubble only names it; Pip stops
};

let applied = null;
function apply(name, PG) {
  if (applied === name) return VARIANTS[name];
  if (applied && applied !== name) throw new Error('variant already applied in this process: ' + applied);
  const v = VARIANTS[name]; if (!v) throw new Error('unknown variant ' + name);
  for (const p of v.patch || []) patches[p](PG);
  applied = name; return v;
}
const HOOKS = {};
module.exports = { VARIANTS, apply, HOOKS };
