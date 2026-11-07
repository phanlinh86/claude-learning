// Pebble's Oasis Run — prints the markdown tables for docs/reports/playtest.md from tests/sim/results/*.json
//   node tests/sim/report.js baseline proposal
'use strict';
const path = require('path');
const [A, B] = process.argv.slice(2).map(n => require(path.join(__dirname, 'results', n + '.json')));
const f = (v, d = 0) => v === null || v === undefined || Number.isNaN(v) ? '–' : (+v).toFixed(d);
const GROUPS = ['bot0.3', 'bot0.5', 'bot0.7', 'bot0.9', 'bot1', 'kid', 'adult', 'jumpSpam', 'zigzag', 'zigJump', 'idleMid', 'idleSide', 'botAlwaysJump', 'botNeverJump'];
const DIFFS = ['easy', 'normal', 'hard'];

function overview(R) {
  console.log(`\n| group | survival p10 / p50 / p90 (s) | score p10 / p50 / p90 | reach ch2 / ch3 / ch5 | 1st shell p50 | 1st hit p10 / p50 | pillow dodge | perfect visits |`);
  console.log('|---|---|---|---|---|---|---|---|');
  for (const d of DIFFS) for (const g of GROUPS) {
    const a = R.agg[`${d}/${g}`]; if (!a) continue;
    console.log(`| ${d} · ${g} | ${f(a.survival.p10)} / ${f(a.survival.p50)} / ${f(a.survival.p90)} | ${f(a.score.p10)} / ${f(a.score.p50)} / ${f(a.score.p90)} | ${f(a.reached.ch2)} / ${f(a.reached.ch3)} / ${f(a.reached.ch5)} % | ${f(a.firstShell.p50, 1)} s | ${f(a.firstHit.p10)} / ${f(a.firstHit.p50)} s${a.firstHit.never ? ` (${f(a.firstHit.never)} % never)` : ''} | ${f(a.pillowDodge)} % | ${f(a.perfectVisit)} % |`);
  }
}
function chapters(R, groups) {
  console.log(`\n| group | ch1 | ch2 | ch3 | ch4 | ch5 (loop 2) |`);
  console.log('|---|---|---|---|---|---|');
  for (const d of DIFFS) for (const g of groups) {
    const a = R.agg[`${d}/${g}`];
    console.log(`| ${d} · ${g} | ` + a.chapters.slice(0, 5).map(c => c.completed ? `${f(c.dur.p50, 1)} s (${f(c.dur.p10, 1)}–${f(c.dur.p90, 1)}), ${f(c.visits, 1)} visits` : '–').join(' | ') + ' |');
  }
}
function hits(R, groups) {
  console.log(`\n| group | ch1 pots/log/tumble/pillow | ch2 | ch3 | ch4 | deaths in ch1 / ch2 / ch3 |`);
  console.log('|---|---|---|---|---|---|');
  for (const d of DIFFS) for (const g of groups) {
    const a = R.agg[`${d}/${g}`];
    const cell = c => c.entered ? `${f(c.hitsTotal, 2)} = ${['pots', 'log', 'tumble', 'pillow'].map(k => f(c.hitsPerEntered[k], 2)).join(' / ')} (n ${c.entered})` : '–';
    console.log(`| ${d} · ${g} | ${a.chapters.slice(0, 4).map(cell).join(' | ')} | ${a.chapters.slice(0, 3).map(c => f(c.deaths)).join(' / ')} % |`);
  }
}
function beforeAfter(A, B, groups) {
  console.log(`\n| group | survival p50 | reach ch2 | reach ch3 | ch1 hits (pillow) | ch2 hits | pillow dodge | perfect | boss on screen |`);
  console.log('|---|---|---|---|---|---|---|---|---|');
  for (const [d, g] of groups) {
    const a = A.agg[`${d}/${g}`], b = B.agg[`${d}/${g}`];
    const ar = (x, y, dd = 0, u = '') => `${f(x, dd)}${u} → **${f(y, dd)}${u}**`;
    console.log(`| ${d} · ${g} | ${ar(a.survival.p50, b.survival.p50, 0, ' s')} | ${ar(a.reached.ch2, b.reached.ch2, 0, ' %')} | ${ar(a.reached.ch3, b.reached.ch3, 0, ' %')} | ${f(a.chapters[0].hitsTotal, 2)} (${f(a.chapters[0].hitsPerEntered.pillow, 2)}) → **${f(b.chapters[0].hitsTotal, 2)} (${f(b.chapters[0].hitsPerEntered.pillow, 2)})** | ${ar(a.chapters[1].hitsTotal, b.chapters[1].hitsTotal, 2)} | ${ar(a.pillowDodge, b.pillowDodge, 1, ' %')} | ${ar(a.perfectVisit, b.perfectVisit, 0, ' %')} | ${ar(100 * a.bossShare, 100 * b.bossShare, 0, ' %')} |`);
  }
}

console.log('## overview', A.name); overview(A);
console.log('\n## chapters', A.name); chapters(A, ['bot0.5', 'bot0.9', 'adult', 'kid']);
console.log('\n## hits', A.name); hits(A, ['bot0.3', 'bot0.5', 'bot0.9', 'adult', 'kid']);
if (B) {
  console.log('\n## before/after');
  beforeAfter(A, B, [['easy', 'kid'], ['normal', 'kid'], ['easy', 'adult'], ['normal', 'adult'], ['hard', 'adult'], ['easy', 'bot0.3'], ['easy', 'bot0.5'], ['normal', 'bot0.5'], ['hard', 'bot0.5'], ['normal', 'bot1'], ['hard', 'bot1'], ['easy', 'idleMid'], ['easy', 'jumpSpam']]);
  console.log('\n## chapters', B.name); chapters(B, ['bot0.5', 'adult', 'kid']);
  console.log('\n## hits', B.name); hits(B, ['bot0.5', 'adult', 'kid']);
}
