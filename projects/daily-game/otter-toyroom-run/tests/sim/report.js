// Otto's Playroom Dash — prints the markdown tables for docs/reports/playtest.md from tests/sim/results/*.json
//   node tests/sim/report.js baseline [proposal]
'use strict';
const path = require('path');
const [A, B] = process.argv.slice(2).map(n => require(path.join(__dirname, 'results', n + '.json')));
const f = (v, d = 0) => v === null || v === undefined || Number.isNaN(v) ? '–' : (+v).toFixed(d);
const GROUPS = ['bot0.3', 'bot0.5', 'bot0.7', 'bot0.9', 'bot1', 'kid', 'adult', 'jumpSpam', 'zigzag', 'zigJump', 'idleMid', 'idleSide', 'botAlwaysJump', 'botNeverJump'];
const DIFFS = ['easy', 'normal', 'hard'];
const BIOMES = ['meadow (gk 1)', 'pillows (0.7)', 'crayon (1.25)', 'stars (0.5)', 'meadow, loop 2'];
const KINDS = ['tower', 'blocks', 'ball'];

function overview(R) {
  console.log(`\n| group | survival p10 / p50 / p90 (s) | score p10 / p50 / p90 | reach biome 2 / 3 / 5 | 1st acorn p50 | 1st hit p10 / p50 | hits tower / blocks / ball | max air / apex (p90) |`);
  console.log('|---|---|---|---|---|---|---|---|');
  for (const d of DIFFS) for (const g of GROUPS) {
    const a = R.agg[`${d}/${g}`]; if (!a) continue;
    console.log(`| ${d} · ${g} | ${f(a.survival.p10)} / ${f(a.survival.p50)} / ${f(a.survival.p90)} | ${f(a.score.p10)} / ${f(a.score.p50)} / ${f(a.score.p90)} | ${f(a.reached.ch2)} / ${f(a.reached.ch3)} / ${f(a.reached.ch5)} % | ${f(a.firstAcorn.p50, 1)} s | ${f(a.firstHit.p10)} / ${f(a.firstHit.p50)} s${a.firstHit.never ? ` (${f(a.firstHit.never)} % never)` : ''} | ${KINDS.map(k => a.hitsByCause[k]).join(' / ')} | ${f(a.maxAir, 2)} s / ${f(a.maxApex, 2)} u |`);
  }
}
function chapters(R, groups) {
  console.log(`\n| group | ${BIOMES.join(' | ')} |`);
  console.log('|---|---|---|---|---|---|');
  for (const d of DIFFS) for (const g of groups) {
    const a = R.agg[`${d}/${g}`]; if (!a) continue;
    console.log(`| ${d} · ${g} | ` + a.chapters.slice(0, 5).map(c => c.completed ? `${f(c.dur.p50, 1)} s (${f(c.dur.p10, 1)}–${f(c.dur.p90, 1)}), ${f(c.jumps, 0)} jumps, ${f(c.acorns, 0)} acorns` : '–').join(' | ') + ' |');
  }
}
function hits(R, groups) {
  console.log(`\n| group | ${BIOMES.slice(0, 4).map(b => b + ' tower/blocks/ball').join(' | ')} | deaths in biome 1 / 2 / 3 / 4 |`);
  console.log('|---|---|---|---|---|---|');
  for (const d of DIFFS) for (const g of groups) {
    const a = R.agg[`${d}/${g}`]; if (!a) continue;
    const cell = c => c.entered ? `${f(c.hitsTotal, 2)} = ${KINDS.map(k => f(c.hitsPerEntered[k], 2)).join(' / ')} (n ${c.entered})` : '–';
    console.log(`| ${d} · ${g} | ${a.chapters.slice(0, 4).map(cell).join(' | ')} | ${a.chapters.slice(0, 4).map(c => f(c.deaths)).join(' / ')} % |`);
  }
}
function beforeAfter(A, B, groups) {
  console.log(`\n| group | survival p50 | reach biome 2 | reach biome 3 | reach biome 5 | biome 1 hits | biome 2 hits | biome 3 hits | biome 4 hits |`);
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [d, g] of groups) {
    const a = A.agg[`${d}/${g}`], b = B.agg[`${d}/${g}`]; if (!a || !b) continue;
    const ar = (x, y, dd = 0, u = '') => `${f(x, dd)}${u} → **${f(y, dd)}${u}**`;
    console.log(`| ${d} · ${g} | ${ar(a.survival.p50, b.survival.p50, 0, ' s')} | ${ar(a.reached.ch2, b.reached.ch2, 0, ' %')} | ${ar(a.reached.ch3, b.reached.ch3, 0, ' %')} | ${ar(a.reached.ch5, b.reached.ch5, 0, ' %')} | ` +
      [0, 1, 2, 3].map(i => ar(a.chapters[i].hitsTotal, b.chapters[i].hitsTotal, 2)).join(' | ') + ' |');
  }
}

console.log('## overview', A.name); overview(A);
console.log('\n## biomes', A.name); chapters(A, ['bot0.5', 'bot0.9', 'adult', 'kid']);
console.log('\n## hits', A.name); hits(A, ['bot0.3', 'bot0.5', 'bot0.9', 'adult', 'kid']);
if (B) {
  console.log('\n## before/after');
  beforeAfter(A, B, [['easy', 'kid'], ['normal', 'kid'], ['easy', 'adult'], ['normal', 'adult'], ['hard', 'adult'], ['easy', 'bot0.3'], ['easy', 'bot0.5'], ['normal', 'bot0.5'], ['hard', 'bot0.5'], ['normal', 'bot1'], ['hard', 'bot1'], ['easy', 'idleMid'], ['easy', 'jumpSpam']]);
  console.log('\n## biomes', B.name); chapters(B, ['bot0.5', 'adult', 'kid']);
  console.log('\n## hits', B.name); hits(B, ['bot0.5', 'adult', 'kid']);
}
