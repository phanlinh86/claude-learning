#!/usr/bin/env node
// Before/after table of hs_designer runs (same seeds).  node tests/sim/hd_compare.js <baseTag> <expTag> [metric,…]
// metrics: chap cut ses sesP90 over8 ask askP90 stars starsA sway th4 swayTop gust count prompt talkShare perMin repeat8 maxIn10s tags hinted
'use strict';
const { execFileSync } = require('child_process'), path = require('path');
const [A, B, ms] = process.argv.slice(2);
const fs = require('fs');
const load = t => { const f = path.join(__dirname, 'out', `hd_${t}.rows.json`); if (!fs.existsSync(f)) execFileSync('node', [path.join(__dirname, 'hd_analyze.js'), t, '--json']); return JSON.parse(fs.readFileSync(f, 'utf8')); };
const ra = load(A), rb = load(B);
const f = (x, d = 1) => (x == null || isNaN(x) ? '–' : (+x).toFixed(d));
const M = {
  chap: r => f(r.chap), cut: r => f(r.cut, 0), ses: r => f(r.ses, 0), sesP90: r => f(r.sesP90, 0), over8: r => f(r.over8, 0), ask: r => f(r.ask), askP90: r => f(r.askP90),
  stars: r => r.stars.map(x => f(x, 0)).join('/'), starsA: r => r.starsA.map(x => f(x, 0)).join('/'), hinted: r => f(r.hinted, 0),
  sway: r => `${r.sway.inv}/${r.sway.subtle}/${r.sway.vis}/${r.sway.wild}`, th4: r => r.sway.th, swayTop: r => Object.values(r.sway.byN).join('·'), gust: r => f(r.sway.gustTop, 0),
  count: r => (r.count ? `t4 ${r.count.tower4}% ` : '') + (r.topic.count ? `${f(r.topic.count.dur, 0)} s cut ${f(r.topic.count.cut, 0)}%` : ''),
  prompt: r => `${r.v.prompt.full}/${r.v.prompt.cut}/${r.v.prompt.lost} d${r.v.prompt.delay}`, talkShare: r => r.v.talkShare, perMin: r => r.v.perMin, repeat8: r => r.v.repeat8, maxIn10s: r => r.v.maxIn10s,
  lost: r => ['towerDone', 'monkey', 'great', 'count', 'butterfly', 'hint', 'praise', 'wrong'].filter(t => r.v.tags[t]).map(t => `${t} ${r.v.tags[t].full}/${r.v.tags[t].cut}/${r.v.tags[t].lost}`).join(' '),
  pauseAt: r => f(r.pauseAt, 0), hintT: r => f(r.hintT), done: r => `${r.done}/${r.plays}`
};
const keys = (ms || 'chap,cut,ses,sesP90,over8').split(',');
console.log(`| age | model | ${keys.map(k => k + ' ' + A + ' → ' + B).join(' | ')} |\n|---|---|${keys.map(() => '---').join('|')}|`);
for (const b of rb) {
  const a = ra.find(x => x.age === b.age && x.model === b.model); if (!a) continue;
  console.log(`| ${b.age} | ${b.model} | ${keys.map(k => `${M[k](a)} → **${M[k](b)}**`).join(' | ')} |`);
}
