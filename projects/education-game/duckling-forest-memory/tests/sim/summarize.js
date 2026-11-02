#!/usr/bin/env node
// Summarises tests/sim/out/<name>.json into markdown tables (stdout + tests/sim/out/<name>.md).
//   node tests/sim/summarize.js baseline
'use strict';
const fs = require('fs');
const path = require('path');
const { mean, pct, f1, f0, fp } = require('./lib');

function load(name) { return JSON.parse(fs.readFileSync(path.join(__dirname, 'out', name + '.json'), 'utf8')); }
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const flat = (a) => [].concat(...a);
const tbl = (head, rows) => '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';

function agg(S) {
  const done = S.filter(s => s.done), ses = done.map(s => s.sessionTime);
  const chap = flat(S.map(s => s.chapters.filter(c => c.dur !== null).map(c => c.dur)));
  const rounds = flat(S.map(s => s.rounds.filter(r => r.dur !== null)));
  const minutes = sum(S.map(s => s.simTime)) / 60;
  const idleGaps = flat(S.map(s => s.idleGaps));
  const starPct = done.map(s => s.stars / (3 * s.rounds.length + s.chapters.length));
  const talkRounds = flat(S.map(s => s.chapters.map(c => c.rounds)));
  return {
    n: S.length, done: done.length, ses: mean(ses), sesP90: pct(ses, 0.9), sesMax: ses.length ? Math.max(...ses) : NaN,
    chap: mean(chap), chapP10: pct(chap, 0.1), chapP90: pct(chap, 0.9),
    round: mean(rounds.map(r => r.dur)), roundP90: pct(rounds.map(r => r.dur), 0.9), roundMax: rounds.length ? Math.max(...rounds.map(r => r.dur)) : NaN,
    ia: mean(rounds.filter(r => r.ia !== null).map(r => r.ia)),
    wrongPerRound: mean(rounds.map(r => r.wrong)), hintRounds: rounds.filter(r => r.hints > 0).length / Math.max(1, rounds.length),
    hintsPerMin: sum(S.map(s => s.hints)) / minutes, idlesPerMin: sum(S.map(s => s.idles)) / minutes,
    idleGap: mean(idleGaps), idleGapMin: idleGaps.length ? Math.min(...idleGaps) : NaN,
    stars: mean(done.map(s => s.stars)), starPct: mean(starPct), starsMin: done.length ? Math.min(...done.map(s => s.stars)) : NaN,
    r3: rounds.filter(r => r.stars === 3).length / Math.max(1, rounds.length), r2: rounds.filter(r => r.stars === 2).length / Math.max(1, rounds.length),
    r1: rounds.filter(r => r.stars === 1).length / Math.max(1, rounds.length),
    cut: talkRounds.filter(k => k < 4).length / Math.max(1, talkRounds.length),
    stuck: sum(S.map(s => s.stuck)), slow: sum(S.map(s => s.slow || 0)), invariant: sum(S.map(s => s.invariant)), errors: sum(S.map(s => s.errors.length)),
    offscreen: sum(S.map(s => s.offscreen)), homes: sum(S.map(s => s.homesSeen)), shrinkMin: Math.min(...S.map(s => s.packShrinkMin)),
    packFail: sum(S.map(s => s.packFail))
  };
}

function report(D) {
  const S = D.sessions, drivers = [...new Set(S.map(s => s.driver))], ages = [...new Set(S.map(s => s.age))].sort();
  let md = `## Playtest ${D.name} — ${S.length} sessions (${drivers.join(', ')})` + (Object.keys(D.config || {}).length ? ` config ${JSON.stringify(D.config)}` : '') + '\n\n';
  md += '### Session / chapter / round time (s) by driver × age\n\n';
  const rows = [];
  for (const d of drivers) for (const a of ages) {
    const g = agg(S.filter(s => s.driver === d && s.age === a)); if (!g.n) continue;
    rows.push([d, a, g.n, g.done === g.n ? 'all' : g.done + '/' + g.n, f0(g.ses), f0(g.sesP90), f0(g.sesMax), f0(g.chap), f0(g.chapP10) + '–' + f0(g.chapP90),
      f1(g.round), f1(g.roundP90), f1(g.ia), fp(g.cut)]);
  }
  md += tbl(['driver', 'age', 'n', 'done', 'session', 'p90', 'max', 'chapter', 'p10–p90', 'round', 'p90', 'playable', 'cut ≤3 rds'], rows);
  md += '\n### Mistakes, help and stars\n\n';
  const rows2 = [];
  for (const d of drivers) for (const a of ages) {
    const g = agg(S.filter(s => s.driver === d && s.age === a)); if (!g.n) continue;
    rows2.push([d, a, f1(g.wrongPerRound), fp(g.hintRounds), f1(g.hintsPerMin), f1(g.idlesPerMin), f0(g.idleGap), f0(g.stars), f0(g.starsMin), fp(g.starPct),
      `${fp(g.r3)} / ${fp(g.r2)} / ${fp(g.r1)}`]);
  }
  md += tbl(['driver', 'age', 'mismatch/round', 'rounds w/ hint', 'hints/min', 'idles/min', 'idle gap', 'stars', 'min', 'of max', '3★ / 2★ / 1★'], rows2);
  const all = agg(S);
  md += `\n### Health\n\nstuck rounds ${all.stuck} · rounds > 180 s ${all.slow} · NaN ${all.invariant} · errors ${all.errors} · bad reward placements ${all.offscreen}/${all.homes} · ` +
    `smallest card ${all.shrinkMin.toFixed(0)} px · grids below the age minimum ${all.packFail}\n`;
  // per topic round time for the typical child
  const typ = S.filter(s => s.driver === 'typical');
  if (typ.length) {
    md += '\n### Typical child: round time by topic (s)\n\n';
    const byT = {};
    for (const s of typ) for (const r of s.rounds) if (r.dur !== null) (byT[s.age + ' ' + r.topic] = byT[s.age + ' ' + r.topic] || []).push(r);
    md += tbl(['age topic', 'rounds', 'mean', 'p90', 'cards', 'mismatches'], Object.keys(byT).sort().map(k => [k, byT[k].length, f1(mean(byT[k].map(r => r.dur))),
      f1(pct(byT[k].map(r => r.dur), 0.9)), f1(mean(byT[k].map(r => r.n))), f1(mean(byT[k].map(r => r.wrong)))]));
  }
  return md;
}

if (require.main === module) {
  const name = process.argv[2] || 'baseline', D = load(name), md = report(D);
  fs.writeFileSync(path.join(__dirname, 'out', name + '.md'), md);
  console.log(md);
}
module.exports = { agg, load, report };
