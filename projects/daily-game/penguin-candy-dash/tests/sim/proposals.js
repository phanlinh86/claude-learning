// Tuning proposals tested by `node tests/sim/run.js tuning`.
// Each = { all: overrides for every difficulty, easy/normal/hard: per-difficulty overrides } merged over CD.DIFFICULTY[d].
'use strict';
const J = (a, k) => a.map(x => Math.round(x * k));
const N = { easy: [8, 10, 12, 14], normal: [12, 15, 18, 20], hard: [15, 18, 22, 25] };
const P = module.exports = {
  // ---- one-factor sensitivity probes
  slowBears: { all: { bearSpeed: { red: 75, green: 82, orange: 80 } } },
  follower: { all: { followLag: 1.2, followDirect: 40 }, easy: { followLag: 1.4 } },
  guard: { all: { guardAggro: 95, guardCharge: 1.1, guardChargeMax: 1.1 }, easy: { guardAggro: 80 } },
  forgive: { all: { hitForgive: 0.7 } },
  invuln: { easy: { invulnTime: 2.5 }, normal: { invulnTime: 2.0 }, hard: { invulnTime: 1.5 } },
  rest: { all: { bearRestTime: 2.5 }, easy: { bearRestTime: 3.0 } },
  // ---- combined packages
  pkgA: {
    all: { bearRestTime: 2.5, followLag: 1.2, followDirect: 40, guardAggro: 95, guardCharge: 1.1, guardChargeMax: 1.1, hitForgive: 0.75 },
    easy: { bearRestTime: 3.0, followLag: 1.4, guardAggro: 80, invulnTime: 2.5, jarTargets: J(N.easy, 1.5) },
    normal: { jarTargets: J(N.normal, 1.5) },
    hard: { jarTargets: J(N.hard, 1.3) }
  },
  pkgB: {
    all: { bearRestTime: 2.5, followLag: 1.2, followDirect: 40, guardAggro: 95, guardCharge: 1.1, guardChargeMax: 1.1, hitForgive: 0.7, bearCapFrac: 0.65 },
    easy: { bearRestTime: 3.0, followLag: 1.4, guardAggro: 80, invulnTime: 2.5, bearSpeedMul: 0.65, healOnClear: 2, jarTargets: J(N.easy, 1.5) },
    normal: { invulnTime: 2.0, bearSpeedMul: 0.85, jarTargets: J(N.normal, 1.5) },
    hard: { jarTargets: J(N.hard, 1.3) }
  },
  pkgC: {
    all: { bearRestTime: 2.5, followLag: 1.2, followDirect: 40, guardAggro: 95, guardCharge: 1.1, guardChargeMax: 1.1, hitForgive: 0.7, bearCapFrac: 0.65 },
    easy: { bearRestTime: 3.0, followLag: 1.4, guardAggro: 80, invulnTime: 2.5, bearSpeedMul: 0.65, healOnClear: 2, bearCounts: [1, 2, 2, 3], jarTargets: J(N.easy, 1.5) },
    normal: { invulnTime: 2.0, bearSpeedMul: 0.8, bearCounts: [1, 2, 3, 3], healOnClear: 2, jarTargets: J(N.normal, 1.5) },
    hard: { jarTargets: J(N.hard, 1.3) }
  },
  // pkgC + a gentler guard (it is the difficulty spike where it first appears)
  pkgD: {
    all: { bearRestTime: 2.5, followLag: 1.2, followDirect: 40, guardAggro: 80, guardCharge: 1.0, guardChargeMax: 0.9, guardCool: 2.0, guardOrbitR: 75,
      hitForgive: 0.7, bearCapFrac: 0.65 },
    easy: { bearRestTime: 3.0, followLag: 1.4, guardAggro: 70, invulnTime: 2.5, bearSpeedMul: 0.65, healOnClear: 2, bearCounts: [1, 2, 2, 3], jarTargets: J(N.easy, 1.5) },
    normal: { invulnTime: 2.0, bearSpeedMul: 0.8, bearCounts: [1, 2, 3, 3], healOnClear: 2, jarTargets: J(N.normal, 1.5) },
    hard: { guardAggro: 100, guardCharge: 1.15, jarTargets: J(N.hard, 1.3) }
  },
  jar15: { easy: { jarTargets: J(N.easy, 1.5) }, normal: { jarTargets: J(N.normal, 1.5) }, hard: { jarTargets: J(N.hard, 1.5) } }
};
// pkgD with longer biomes (closer to the 60–90 s requirement)
P.pkgE = { all: P.pkgD.all, easy: Object.assign({}, P.pkgD.easy, { jarTargets: J(N.easy, 1.8) }), normal: Object.assign({}, P.pkgD.normal, { jarTargets: J(N.normal, 1.8) }), hard: Object.assign({}, P.pkgD.hard, { jarTargets: J(N.hard, 1.5) }) };
// RECOMMENDED: pkgD + the guard arrives one biome later on Normal (one new bear kind per biome),
// slightly slower Normal bears, and a softer Easy for 6-year-olds.
P.pkgF = {
  all: P.pkgD.all,
  easy: Object.assign({}, P.pkgD.easy, { bearSpeedMul: 0.6, hitForgive: 0.6 }),
  normal: Object.assign({}, P.pkgD.normal, { bearSpeedMul: 0.75, bearCounts: [1, 2, 2, 3] }),
  hard: P.pkgD.hard
};
