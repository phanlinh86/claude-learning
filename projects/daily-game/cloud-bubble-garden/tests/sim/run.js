// Nimbus's Bubble Garden — playtest runner.
//   node tests/sim/run.js <suite> [--seeds N] [--time S] [--cfg proposal-config.json] [--out name]
// suites: bots (NB.Bot skills × difficulties × layouts), humans (kid / casual / keyboard), exploits, all.
// Writes tests/sim/results/<out>.json and prints markdown tables (pasted into docs/reports/playtest.md).
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const P = require('./players');

const args = process.argv.slice(2);
const suite = args[0] || 'all';
function opt(k, d) { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; }
const nSeeds = +opt('seeds', 30), maxTime = +opt('time', 600);
const cfgFile = opt('cfg', null);
const overrides = cfgFile ? JSON.parse(fs.readFileSync(path.resolve(__dirname, cfgFile), 'utf8')) : null;
const outName = opt('out', suite + (cfgFile ? '-proposal' : '-baseline'));
const seeds = Array.from({ length: nSeeds }, (_, i) => 1000 + i * 17);
const factory = () => L.makeNB(overrides);
const f = L.f;
const DIFFS = ['easy', 'normal', 'hard'], LAYS = ['land', 'port'];
const results = {};

function row(name, s) {
  return `| ${name} | ${f(s.surv.p10, 0)} / ${f(s.surv.p50, 0)} / ${f(s.surv.p90, 0)} | ${f(100 * s.overRate, 0)} % | ${f(100 * s.over120, 0)} % | ` +
    `${f(s.score.p10, 0)} / ${f(s.score.p50, 0)} / ${f(s.score.p90, 0)} | ${f(s.firstPop.p50, 1)} | ` +
    `${s.levelSec.map(z => f(z.p50, 0)).join(' / ')} | ${f(s.firstLevel.p50, 0)} (${f(s.firstLevel.p90, 0)}) | ` +
    `${s.hitsPerMinZone.map(h => f(h, 2)).join(' / ')} | ${f(s.showersPerMin, 2)} | ${f(100 * s.escapeShare, 0)} % |`;
}
const HEAD = '| player | survival s p10/p50/p90 | game over | over ≤120 s | score p10/p50/p90 | 1st pop s | s/level dawn/noon/sunset/night (p50, loop 0) | 1st level s p50 (p90) | hits/min dawn/noon/sunset/night | showers/min | escaped |\n|---|---|---|---|---|---|---|---|---|---|---|';

function block(title, list) {
  console.log(`\n### ${title}  (${nSeeds} seeds × ≤${maxTime} s${cfgFile ? ', ' + cfgFile : ''})\n` + HEAD);
  for (const [name, pf, o] of list) {
    const s = L.runMany(factory, pf, Object.assign({ maxTime }, o), seeds);
    results[title + ' | ' + name] = s;
    console.log(row(name, s));
  }
}
function sizeTable(title, list) {
  console.log(`\n### ${title}: bumps per vulnerable minute by size (share of vulnerable time)\n| player | size 1 | 2 | 3 | 4 | 5 |\n|---|---|---|---|---|---|`);
  for (const [name, pf, o] of list) {
    const s = results[name] || L.runMany(factory, pf, Object.assign({ maxTime }, o), seeds);
    console.log(`| ${name} | ` + s.hitsPerVulnMinBySize.map((x, i) => `${f(x.rate, 2)} (${f(100 * s.sizeShare[i], 0)} %)`).join(' | ') + ' |');
  }
}

if (suite === 'bots' || suite === 'all') {
  for (const lay of LAYS) for (const d of DIFFS) {
    block(`bots ${d} ${lay}`, [0.3, 0.5, 0.7, 0.9, 1.0].map(k => ['bot ' + k, () => P.bot(k), { diff: d, layout: lay }]));
  }
}
if (suite === 'humans' || suite === 'all') {
  for (const lay of LAYS) for (const d of DIFFS) {
    block(`humans ${d} ${lay}`, [
      ['kid (4 y)', () => P.kid(), { diff: d, layout: lay }],
      ['casual adult', () => P.casual(), { diff: d, layout: lay }],
      ['keyboard', () => P.keyboard(), { diff: d, layout: lay }]
    ]);
  }
}
if (suite === 'exploits' || suite === 'all') {
  for (const lay of LAYS) for (const d of ['easy', 'normal']) {
    block(`exploits ${d} ${lay}`, [
      ['bot 0.7 (reference)', () => P.bot(0.7), { diff: d, layout: lay }],
      ['puddle camp + dodge', () => P.puddleCamp(), { diff: d, layout: lay }],
      ['puddle camp, no dodge', () => P.puddleCamp({ dodge: false }), { diff: d, layout: lay }],
      ['bottom sweep', () => P.sweep(), { diff: d, layout: lay }],
      ['fast circles', () => P.circle(), { diff: d, layout: lay }],
      ['park on puddle 1 (x=120)', () => P.park(0.125, 1, 'park'), { diff: d, layout: lay }],
      ['corner camp (top-left)', () => P.park(0, 0, 'corner'), { diff: d, layout: lay }],
      ['stay huge (bot 0.9)', () => P.stayHuge(0.9), { diff: d, layout: lay }],
      ['afk (no input)', () => P.afk(), { diff: d, layout: lay }]
    ]);
  }
  // birth-pop share: how many hero pops happen within 0.6 s of the bubble being born (camping signature)
  console.log('\n### camping signature: share of hero pops within 0.6 s of birth, and score/min\n| layout · diff | player | birth pops | score/min | levels/10 min |\n|---|---|---|---|---|');
  for (const k of Object.keys(results).filter(k => k.startsWith('exploits'))) {
    const s = results[k], [t, name] = k.split(' | ');
    console.log(`| ${t.replace('exploits ', '')} | ${name} | ${f(100 * s.birthPopShare, 0)} % | ${f(s.scorePerMin, 0)} | ${f(s.levelsMean * 600 / maxTime, 1)} |`);
  }
}
if (suite === 'size' || suite === 'all') {
  for (const d of ['easy', 'normal', 'hard']) {
    sizeTable(`size/risk ${d} land`, [
      ['kid (4 y)', () => P.kid(), { diff: d, layout: 'land' }],
      ['casual adult', () => P.casual(), { diff: d, layout: 'land' }],
      ['bot 0.5', () => P.bot(0.5), { diff: d, layout: 'land' }],
      ['bot 0.9', () => P.bot(0.9), { diff: d, layout: 'land' }],
      ['afk', () => P.afk(), { diff: d, layout: 'land' }]
    ]);
  }
}

fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.writeFileSync(path.join(__dirname, 'results', outName + '.json'), JSON.stringify({ suite, nSeeds, maxTime, overrides, results }, null, 1));
