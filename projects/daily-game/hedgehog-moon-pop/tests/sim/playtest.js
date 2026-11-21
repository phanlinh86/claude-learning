#!/usr/bin/env node
// Bristle's Moon Pop — HIGH-SPEED PLAYTEST (report-only: never edits game/js).
//
//   node tests/sim/playtest.js [--n 40] [--cap 15] [--tag baseline] [--overrides file.json] [--workers 4]
//
// Runs every player model (bot skills, kid4, kid6 = skate-only with a 0.5 s reaction, casual, spamJump exploit)
// on every difficulty, prints the tables from players.js and a verdict against the design targets:
//   - kid6 clears dawn on Normal (≥ 90 %), kid4 clears dawn on Easy (≥ 90 %)
//   - bot 0.8 on Normal: 45–90 s per level (loop 1)
//   - skill 1 bot clears the first loop on Normal
//   - first pop within ~4 s of 'go'
//   - spamming Jump is no exploit: its median score is within 15 % of the casual model's
// Writes tests/sim/results/playtest_<tag>.md (+ a small summary .json).
'use strict';
const fs = require('fs');
const path = require('path');
const P = require('./players');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const N = +arg('n', 40), cap = +arg('cap', 15), tag = arg('tag', 'baseline');
const models = P.ALL_MODELS, diffs = ['easy', 'normal', 'hard'];
const ovPath = arg('overrides', null), overrides = ovPath ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : null;
const jobs = P.makeJobs(models, diffs, N, cap, overrides), t0 = Date.now();

P.runAll(jobs, +arg('workers', 0), (out) => {
  const S = P.cells(jobs, out), f = P.f, pct = P.pct;
  const g = (m, d) => S[m + '|' + d];
  const checks = [];
  const chk = (name, ok, detail) => checks.push(`| ${ok ? 'PASS' : 'FAIL'} | ${name} | ${detail} |`);
  chk('kid6 (skate only, 0.5 s reaction) clears dawn on Normal', g('kid6', 'normal').clear1 >= 0.9, pct(g('kid6', 'normal').clear1) + ', median ' + f(g('kid6', 'normal').lvMed[0]) + ' s');
  chk('kid4 clears dawn on Easy', g('kid4', 'easy').clear1 >= 0.9, pct(g('kid4', 'easy').clear1) + ', median ' + f(g('kid4', 'easy').lvMed[0]) + ' s');
  const b8 = g('bot0.8', 'normal').lvMed;
  chk('bot 0.8 on Normal: 45–90 s per level', b8.every(v => !isFinite(v) || (v >= 45 && v <= 90)), b8.map(v => f(v)).join(' / '));
  chk('bot 1.0 clears the first loop on Normal', g('bot1.0', 'normal').loop1 >= 0.9, pct(g('bot1.0', 'normal').loop1));
  chk('first pop within ~4 s (kid6, Normal)', g('kid6', 'normal').firstPop <= 4.5, f(g('kid6', 'normal').firstPop, 1) + ' s');
  // the exploit question: does mashing Jump beat playing normally? (median game score, the best-score metric)
  for (const d of diffs) chk('spamJump is no exploit (' + d + ')', g('spamJump', d).score[1] <= g('casual', d).score[1] * 1.15,
    'median score ' + f(g('spamJump', d).score[1]) + ' vs casual ' + f(g('casual', d).score[1]) +
    ' (score/min ' + f(g('spamJump', d).scoreMin) + ' vs ' + f(g('casual', d).scoreMin) + ', bonks/min ' + f(g('spamJump', d).bonkMin, 2) + ' vs ' + f(g('casual', d).bonkMin, 2) + ')');
  const verdict = '## Verdict\n\n| | Check | Result |\n|---|---|---|\n' + checks.join('\n') + '\n\n';
  const md = P.tables(S, models, diffs, `Playtest — ${tag} — ${N} rounds per cell, ${cap} min cap${ovPath ? ' — overrides ' + path.basename(ovPath) : ''}`)
    .replace('## Survival', verdict + '## Survival') + `\n${jobs.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s.\n`;
  console.log(md);
  const dir = path.join(__dirname, 'results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `playtest_${tag}.md`), md);
  fs.writeFileSync(path.join(dir, `playtest_${tag}.json`), JSON.stringify({ tag, N, cap, overrides, checks, summary: S }));
});
