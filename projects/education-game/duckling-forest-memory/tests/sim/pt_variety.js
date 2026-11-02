#!/usr/bin/env node
// Variety audit (report-only): what changes from round to round, chapter to chapter and "Play again" to "Play again"?
//   node tests/sim/pt_variety.js [--n 200]   → tests/sim/out/pt_variety.md
// Generates N pairs of back-to-back sessions per age (like "Play again") with the same Content calls as the World; records every
// round's pair keys, the mechanic surface (face kinds, reward kind, grid shape, pairs), topic order and seasons.
'use strict';
const fs = require('fs');
const path = require('path');
const { DM, mean } = require('./lib');
const args = process.argv.slice(2), N = +(args[args.indexOf('--n') + 1] || 200) || 200;
const tbl = (h, rows) => '| ' + h.join(' | ') + ' |\n|' + h.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
const fp = (x) => (100 * x).toFixed(0) + '%';

function playTwo(age, seed) {
  // the same calls the World makes (World._beginRound): DM.Content.makeRound with the chapter history and the tuned pairs
  const rng = new DM.RNG(seed), lang = seed % 2 ? 'vi' : 'en', cfg = DM.CONFIG;
  const Lp = DM.World.computeLayout(720, 1556, { top: 108, right: 0, bottom: 62, left: 0 });
  const S = [];
  for (let k = 0; k < 2; k++) {
    const ses = { topics: DM.Content.topicsFor(age), rounds: [] };
    ses.topics.forEach((topic, l) => {
      const hist = [];
      for (let ri = 0; ri < 4; ri++) {
        const rr = new DM.RNG((rng.next() * 4294967296) >>> 0);
        const want = DM.Content.pairsFor(topic, age, lang, ri, cfg.pairsByAge);
        const cur = DM.Content.makeRound(topic, { age, lang, rng: rr, roundIndex: ri, history: hist, pairs: want, peekByAge: cfg.peekByAge });
        hist.push(cur.sum);
        const vals = [...new Set(cur.cards.map(c => c.key))].sort(), g = DM.World.chooseGrid(Lp, cur.cards.length, age);
        ses.rounds.push({ l, topic, vals, kinds: [...new Set(cur.cards.map(c => c.face.kind))].sort().join('+'),
          reward: cur.pairInfo[vals[0]].reward.kind, grid: g.cols + 'x' + g.rows });
      }
    });
    S.push(ses);
  }
  return S;
}
const jac = (a, b) => { const A = new Set(a), B = new Set(b); let i = 0; for (const x of A) if (B.has(x)) i++; return i / (A.size + B.size - i); };

let md = `## Variety audit — ${N} × 2 back-to-back sessions per age (DM.Content.makeRound exactly as World._beginRound calls it; grids on iPhone portrait)\n\n`;
const rows = [], rows2 = [];
for (const age of [3, 4, 5, 6, 7]) {
  const orders = new Set(), carry = [], sameVals = [], kinds = {}, rewardsPerCh = [], grids = new Set(), playAgain = [], distinct = [], fullRepeat = [];
  for (let s = 0; s < N; s++) {
    const [a, b] = playTwo(age, 100 + s * 17 + age);
    for (const ses of [a, b]) {
      orders.add(ses.topics.join('>'));
      for (let l = 0; l < 4; l++) {
        const R = ses.rounds.filter(r => r.l === l);
        rewardsPerCh.push(new Set(R.map(r => r.reward)).size);
        const seen = new Set();
        R.forEach((r, i) => {
          kinds[r.topic + ': ' + r.kinds] = 1; grids.add(r.grid);
          if (i) carry.push(r.vals.filter(v => R[i - 1].vals.includes(v)).length / r.vals.length);
          if (i && r.vals.every(v => seen.has(v))) fullRepeat.push(1); else if (i) fullRepeat.push(0);
          r.vals.forEach(v => seen.add(v));
        });
        distinct.push(seen.size);
      }
    }
    // "Play again": same chapter, same round index → how alike?
    for (let l = 0; l < 4; l++) {
      const A = a.rounds.filter(r => r.l === l), B = b.rounds.filter(r => r.l === l);
      playAgain.push(jac([].concat(...A.map(r => r.vals)), [].concat(...B.map(r => r.vals))));
    }
  }
  rows.push([age, [...orders].join(' / '), orders.size, f(mean(distinct)), fp(mean(carry)), fp(mean(fullRepeat)), f(mean(rewardsPerCh)), fp(mean(playAgain)), [...grids].sort().join(' ')]);
  rows2.push([age, Object.keys(kinds).sort().join(' · ')]);
}
function f(x) { return x.toFixed(1); }
md += tbl(['age', 'chapter order (every session)', '# orders', 'distinct pair values per chapter', 'values carried from the previous round', 'rounds with only already-seen values', 'reward kinds per chapter', 'chapter values shared with "Play again"', 'grid shapes (iPhone P)'], rows);
md += '\n### Card face kinds per topic (the whole surface a child sees)\n\n' + tbl(['age', 'topic: face kinds'], rows2);
// voice line pools (en)
const STR = DM.I18N ? null : null;
fs.writeFileSync(path.join(__dirname, 'out', 'pt_variety.md'), md);
console.log(md);
