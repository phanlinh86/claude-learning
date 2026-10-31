// Proposed changes, expressed WITHOUT editing game code (Owlet's Snow Garden):
//   config      → passed to new SG.World({ config })            (pure SG.CONFIG overrides)
//   patch(SG)   → monkey-patches inside the sim sandbox only     (stand-in for a small code change, see report)
//   hooks       → per-session hooks used by lib.runSession       (stand-in for a flow change)
//   speechPolicy→ flags for lib.SpeechModel                       (stand-in for a main.js speech-policy change)
// The Dino Nest Sort playtest variants (tap guard, hint cooldown, idle back-off, time box, pace) are part of the
// shipped world.js now; the variants below probe the new planting timing.
'use strict';

const patches = {};
const VARIANTS = {
  baseline: {},
  fastGrow: { config: { growTime: 0.8, bloomHold: 0.25 } },     // quicker bloom → shorter rounds
  slowGrow: { config: { growTime: 1.4, bloomHold: 0.6 } },
  rounds3: { config: { roundsPerLevel: 3 } },
  speech: { speechPolicy: { countFinal: true, greatQueued: true, praiseThrottle: 1.2, hintOnce: true } }
};

let applied = null;
function apply(name, SG) {
  if (applied === name) return VARIANTS[name];
  if (applied && applied !== name) throw new Error('variant already applied in this process: ' + applied);
  const v = VARIANTS[name]; if (!v) throw new Error('unknown variant ' + name);
  for (const p of v.patch || []) patches[p](SG);
  applied = name; return v;
}
const HOOKS = {};
module.exports = { VARIANTS, apply, HOOKS };
