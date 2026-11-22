// Otto's Playroom Dash — quick A/B of candidate CONFIG patches on the groups that matter (kid on Easy, casual adult, bots).
//   node tests/sim/explore.js [seeds] [name,name,…]      (SIM_GROUPS=wide for more groups)
// Patches deep-merge into a copy of OD.World.CONFIG (arrays element-wise, e.g. zones: [{gapK: 1.5}]).
'use strict';
const { playRound, aggregate } = require('./playtest');
const seeds = +(process.argv[2] || 120);
const CANDIDATES = {
  base: null,
  gap0: { zones: [{ gapK: 1.5 }] },                         // roomier first biome
  hitZ18: { hitZPad: 0.18 },                                // a little more forgiving in depth
  hearts6: { difficulty: { easy: { hearts: 6 } } },
  easySlow: { difficulty: { easy: { speed: 5.0 } } },
  react12: { difficulty: { easy: { react: 1.25 } } },
  moon06: { zones: [null, null, null, { gk: 0.6 }] },        // a less extreme moon
  heavy115: { zones: [null, null, { gk: 1.15 }] },           // a gentler heavy biome
  exp30: { jumpVexp: 0.30 },                                 // higher apexes in low gravity
  exp40: { jumpVexp: 0.40 },                                 // lower apexes in low gravity
  ballSlow: { ballSpeed: [1.0, 1.5] },
  ballLow: { ballV: 3.0 },
  ease08: { gravEase: 0.8 },
  noHang: { hang: 0 },
  // --- 2026-11-22 playtest: biome-1 tower hits of the kid models on Easy
  noT2b1: { zones: [{ patterns: { tower2: 0 } }] },                     // biome 1 = single towers only
  t2b1h: { zones: [{ patterns: { tower2: 1 } }] },                      // tower2 rarer in biome 1
  gap16: { zones: [{ gapK: 1.6 }] },
  acorn4: { zones: [{ patterns: { acornLine: 4, acornZig: 3 } }] },     // more acorn-only rows between towers
  easyR13: { difficulty: { easy: { react: 1.3 } } },
  narrow: { kinds: { tower: { w: 0.3 } }, heroHalfW: 0.25 },           // slightly more forgiving side clearance
  zpad20: { hitZPad: 0.2 },
  combo1: { zones: [{ patterns: { tower2: 0 }, gapK: 1.5 }] },
  combo2: { zones: [{ patterns: { tower2: 0, acornLine: 4, acornZig: 3 }, gapK: 1.5 }], kinds: { tower: { w: 0.3 } } },
  // ball bounce: lower, quicker-settling hops → moon balls jumpable in every phase, crayon window ×2
  ballB2: { ballV: 2.8, ballKick: 1.2, ballRest: 0.6 },
  P1: { zones: [{ patterns: { tower2: 0 } }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6 },
  P2: { zones: [{ patterns: { tower2: 0 } }, null, { gk: 1.15 }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6 },
  P3: { zones: [{ patterns: { tower2: 0 } }, null, { patterns: { ball: 2 } }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6 },
  P4: { zones: [{ patterns: { tower2: 0 } }, null, { gapK: 1.2 }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6 },
  P5: { zones: [{ patterns: { tower2: 0 } }, null, { gk: 1.15, gapK: 1.2 }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6 },
  K1: { zones: [{ patterns: { tower2: 0 } }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6, ballSpeed: [0.9, 1.3] },
  K2: { zones: [{ patterns: { tower2: 0 } }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6, difficulty: { easy: { react: 1.3 } } },
  K3: { zones: [{ patterns: { tower2: 0 } }, null, { gk: 1.15, gapK: 1.2 }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6, ballSpeed: [1.0, 1.5] },
  K4: { zones: [{ patterns: { tower2: 0 } }], ballV: 2.8, ballKick: 1.2, ballRest: 0.6, difficulty: { easy: { speed: 5.0 } } },
  combo3: { zones: [{ patterns: { tower2: 1, acornLine: 4, acornZig: 3 }, gapK: 1.5 }], kinds: { tower: { w: 0.3 } } }
};
const only = process.argv[3] ? process.argv[3].split(',') : Object.keys(CANDIDATES);
const GROUPS = process.env.SIM_GROUPS === 'wide'
  ? [['kid', 'easy', 0, 300], ['adult', 'normal', 0, 300], ['adult', 'hard', 0, 300], ['bot', 'normal', 0.5, 300], ['bot', 'hard', 0.5, 300], ['bot', 'easy', 0.3, 300]]
  : process.env.SIM_GROUPS === 'main'
  ? [['kid', 'easy', 0, 300], ['kid5', 'easy', 0, 300], ['adult', 'normal', 0, 300], ['adult', 'hard', 0, 300], ['bot', 'normal', 0.5, 300], ['bot', 'hard', 1, 300]]
  : process.env.SIM_GROUPS === 'kid'
  ? [['kid', 'easy', 0, 300], ['kid5', 'easy', 0, 300], ['adult', 'normal', 0, 300]]
  : [['kid', 'easy', 0, 300], ['kid5', 'easy', 0, 300], ['kid', 'normal', 0, 200], ['adult', 'normal', 0, 300], ['bot', 'normal', 0.5, 300], ['bot', 'hard', 1, 300]];
for (const name of only) {
  const patch = CANDIDATES[name], line = [];
  for (const [model, diff, skill, maxT] of GROUPS) {
    const recs = [];
    for (let s = 1; s <= seeds; s++) recs.push(playRound({ model, diff, skill, seed: s, maxT }, patch));
    const a = aggregate(recs, maxT), c = a.chapters;
    line.push(`${model}${skill || ''}/${diff}: hits b1 ${c[0].hitsTotal.toFixed(2)} b2 ${c[1].hitsTotal.toFixed(2)} b3 ${c[2].hitsTotal.toFixed(2)} b4 ${c[3].hitsTotal.toFixed(2)}` +
      ` reach b2 ${a.reached.ch2}% b3 ${a.reached.ch3}% b5 ${a.reached.ch5}% surv50 ${a.survival.p50} (t/b/b ${a.hitsByCause.tower}/${a.hitsByCause.blocks}/${a.hitsByCause.ball})`);
  }
  console.log(name.padEnd(9), line.join(' | '));
}
