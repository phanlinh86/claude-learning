#!/usr/bin/env node
// Mimi's Splash Rocket — content repetition / shortcut statistics (report-only). Per age × topic over many generated chapters
// (made the way the world calls makeRound; rounds after the first are short as the sims show they almost always are):
//   same %     : launch j's target is the SAME picture as launch j − 1's target (kind + colour + value + size)
//   colour-cue %: the target's colour is unique on its launch although the rule is NOT colour (shapes / size / count / animals …:
//                 the child can answer by colour alone once it saw launch 0's target)
//   copy %     : launch j ≥ 1 can be solved by "find the picture of the last target" (same picture, and no other mat shares it)
//   node tests/sim/content_repeat.js [chapters=300] [--short-all]      (DK_PATCH=… applies a sim-only content experiment)
'use strict';
const L = require('./lib'); const DK = L.DK, C = DK.Content;
const N = +(process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 300);
const shortAll = !process.argv.includes('--no-short');
const sig = t => [t.kind, t.color || '', t.text || t.obj || t.shape || t.animal || (t.n != null ? t.n : ''), t.big === false ? 's' : 'b'].join(':');
const out = ['| age | topic | launches | k × m | same picture as the last target % | copy-solvable % | colour-cue % (non-colour rules) |', '|---|---|---|---|---|---|---|'];
const tot = {};
for (const age of [3, 4, 5, 6, 7]) for (const topic of DK.AGE_POOLS[age]) {
  const st = { L: 0, pairs: 0, same: 0, copy: 0, cue: 0, cueN: 0, k: [], m: [] };
  for (let c = 0; c < N; c++) {
    const rng = new DK.RNG(7000 + c * 17 + age), level = c % 4 === 0 ? 0 : 1, used = [];
    let prev = null;
    for (let ri = 0; ri < 3; ri++) {
      const r = C.makeRound(topic, { age, lang: c % 2 ? 'vi' : 'en', rng, roundIndex: ri, level, short: shortAll && ri > 0, usedKeys: used, prevRule: prev && prev.rule });
      used.push(r.key); prev = r; st.k.push(r.k); st.m.push(r.m);
      r.launches.forEach((row, j) => {
        st.L++;
        const tg = row.find(q => q.target).thing;
        if (r.rule.kind !== 'color' && tg.color) { st.cueN++; if (row.filter(q => q.thing.color === tg.color).length === 1) st.cue++; }
        if (j > 0) {
          st.pairs++;
          const pt = r.launches[j - 1].find(q => q.target).thing;
          if (sig(pt) === sig(tg)) { st.same++; if (row.filter(q => sig(q.thing) === sig(tg)).length === 1) st.copy++; }
        }
      });
    }
  }
  const p = (a, b) => (b ? (a / b * 100).toFixed(0) : '–');
  out.push(`| ${age} | ${topic} | ${st.L} | ${L.mean(st.k).toFixed(2)} × ${L.mean(st.m).toFixed(2)} | ${p(st.same, st.pairs)} | ${p(st.copy, st.pairs)} | ${p(st.cue, st.cueN)} |`);
  const T = tot[age] = tot[age] || { pairs: 0, same: 0, copy: 0 }; T.pairs += st.pairs; T.same += st.same; T.copy += st.copy;
}
console.log(out.join('\n'));
console.log('\n| age | same picture % (all topics) | copy-solvable % |\n|---|---|---|');
for (const a in tot) console.log(`| ${a} | ${(tot[a].same / tot[a].pairs * 100).toFixed(0)} | ${(tot[a].copy / tot[a].pairs * 100).toFixed(0)} |`);
