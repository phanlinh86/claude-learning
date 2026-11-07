// Pebble's Oasis Run — quick A/B of candidate CONFIG patches on the groups that matter (kid on Easy, casual adult, bots).
//   node tests/sim/explore.js [seeds]
'use strict';
const { playRound, aggregate } = require('./playtest');
const seeds = +(process.argv[2] || 120);
const CANDIDATES = {
  base: null,
  pillows2: { difficulty: { easy: { pillows: 2 } } },
  aim75: { difficulty: { easy: { aimRandom: 0.75 } } },
  warn: { difficulty: { easy: { zLand: 8.5, flightT: 1.45 } } },
  boss40: { bossEvery: 40 },
  boss36: { bossEvery: 36 },
  jumpV66: { jumpV: 6.6 },
  g17: { g: 17 },
  gap0: { zones: [{ gapK: 1.5 }] },
  hitZ15: { hitZPad: 0.15 },
  boss36p2: { bossEvery: 36, difficulty: { easy: { pillows: 2 } } },
  boss36aim: { bossEvery: 36, difficulty: { easy: { aimRandom: 0.75 } } },
  hearts6: { difficulty: { easy: { hearts: 6 } } },
  P1: { bossEvery: 36, difficulty: { easy: { pillows: 2, aimRandom: 0.7 } } },
  P2: { bossEvery: 36, hitZPad: 0.18, difficulty: { easy: { pillows: 2, aimRandom: 0.7 } } },
  P3: { bossEvery: 36, hitZPad: 0.18, difficulty: { easy: { pillows: 2, aimRandom: 0.7, zLand: 8.5 } } },
  easyMix: { difficulty: { easy: { pillows: 2, aimRandom: 0.7, pillowEvery: 1.7 } } },
};
const only = process.argv[3] ? process.argv[3].split(',') : Object.keys(CANDIDATES);
const GROUPS = process.env.SIM_GROUPS === 'wide' ? [['kid', 'easy', 0, 260], ['adult', 'normal', 0, 300], ['adult', 'hard', 0, 300], ['bot', 'normal', 0.5, 300], ['bot', 'hard', 0.5, 300], ['bot', 'easy', 0.3, 300]] : [['kid', 'easy', 0, 260], ['kid', 'normal', 0, 200], ['adult', 'normal', 0, 300], ['bot', 'normal', 0.5, 300], ['bot', 'hard', 1, 300]];
for (const name of only) {
  const patch = CANDIDATES[name], line = [];
  for (const [model, diff, skill, maxT] of GROUPS) {
    const recs = [];
    for (let s = 1; s <= seeds; s++) recs.push(playRound({ model, diff, skill, seed: s, maxT }, patch));
    const a = aggregate(recs, maxT);
    line.push(`${model}${skill || ''}/${diff}: ch1h ${a.chapters[0].hitsTotal.toFixed(2)} (pil ${(a.chapters[0].hitsPerEntered.pillow || 0).toFixed(2)}) ch2 ${a.reached.ch2}% ch3 ${a.reached.ch3}% surv50 ${a.survival.p50} dodge ${a.pillowDodge} perf ${a.perfectVisit} hits ${Object.values(a.hitsByCause).reduce((x, y) => x + y, 0)}`);
  }
  console.log(name.padEnd(9), line.join(' | '));
}
