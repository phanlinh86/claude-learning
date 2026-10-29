// Tuning variants compared by `node tests/sim/run.js tuning`.
// Each variant = sim proposal: { config, byDifficulty, mismatchPenalty, penaltyFloor } (see sim.js).
'use strict';

// P1: anti-mash. A mismatch that re-flips a card you have ALREADY SEEN costs a little air.
//     Honest exploration (two never-seen cards) is free; the penalty never takes air below 1 s.
const PENALTY = { mismatchPenalty: { easy: 0.5, normal: 1, hard: 1.5 }, penaltyFloor: 1 };

// P2: endless laps really end (adults 6–12 min on Normal; strong players do not play forever).
const LAPS = {
  easy:   { lapAirMul: 0.85, lapAirMin: 0.4 },
  normal: { lapAirMul: 0.7,  lapAirMin: 0.2 },
  hard:   { lapAirMul: 0.7,  lapAirMin: 0.15 }
};

// P3: kids see all four seasons more often on Normal (later seasons have more pairs → more air),
//     the air bonus no longer outweighs matching, and each difficulty gets its own default peek.
const SEASONS = {
  easy:   { airMax: [90, 110, 135, 160] },
  normal: { airMax: [60, 75, 95, 115] },
  hard:   { airMax: [40, 50, 62, 75] }
};
const merge = (...xs) => { const o = {}; for (const d of ['easy', 'normal', 'hard']) o[d] = Object.assign({}, ...xs.map(x => x[d] || {})); return o; };

const variants = {
  current: {},
  P1_penalty: Object.assign({}, PENALTY),
  P1P2_laps: Object.assign({}, PENALTY, { byDifficulty: merge(LAPS) }),
  P1P2P3_full: Object.assign({}, PENALTY, { byDifficulty: merge(LAPS, SEASONS), config: { airBonusPerSec: 1 } })
};
// The package recommended in docs/reports/playtest_report.md: P1+P2+P3 with a slightly lower lap floor
// so a strong player's endless run ends too (checked by `run.js final` with a 48-level cap).
const FLOOR = { normal: { lapAirMin: 0.15 }, hard: { lapAirMin: 0.12 } };
variants.recommended = Object.assign({}, PENALTY, { byDifficulty: merge(LAPS, SEASONS, FLOOR), config: { airBonusPerSec: 1 } });
const tuningOnly = ['current', 'P1_penalty', 'P1P2_laps', 'P1P2P3_full'];

// peek used for each variant/difficulty. Shipped: the Settings default is 1 s for every difficulty
// (main.js difficultyOverrides() overrides Easy's preset peekTime 2 with the Settings value).
// P3 proposes a per-difficulty default: Easy 2 s, Normal 1 s, Hard 0 s.
function peekFor(name, d) {
  if (name === 'P1P2P3_full') return { easy: 2, normal: 1, hard: 0 }[d];
  return 1;
}
module.exports = { variants, peekFor, tuningOnly };
