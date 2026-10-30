#!/usr/bin/env node
// Summarises tests/sim/out/<name>.json into markdown tables (stdout) + tests/sim/out/<name>.summary.json.
//   node tests/sim/summarize.js baseline [compareName]
'use strict';
const fs = require('fs');
const path = require('path');
const { mean, pct, f1, f0, fp } = require('./lib');

function load(name) { return JSON.parse(fs.readFileSync(path.join(__dirname, 'out', name + '.json'), 'utf8')); }
const by = (arr, keyFn) => { const o = {}; for (const x of arr) { const k = keyFn(x); (o[k] = o[k] || []).push(x); } return o; };
const sum = (a) => a.reduce((s, x) => s + x, 0);

function agg(S) {
  const done = S.filter(s => s.done);
  const ses = done.map(s => s.sessionTime);
  const chap = [].concat(...S.map(s => s.chapters.filter(c => c.dur !== null).map(c => c.dur)));
  const rounds = [].concat(...S.map(s => s.rounds.filter(r => r.dur !== null)));
  const minutes = sum(S.map(s => s.simTime)) / 60;
  const cuts = sum(S.map(s => s.speech.cuts)), early = sum(S.map(s => s.speech.early)), never = sum(S.map(s => s.speech.never));
  const idleGaps = [].concat(...S.map(s => s.idleGaps));
  const stars = done.map(s => s.stars);
  const corrects = sum(S.map(s => s.corrects)), misses = sum(S.map(s => s.misses)), wrongs = sum(S.map(s => s.wrongs));
  return {
    n: S.length, done: done.length, ses: mean(ses), sesMed: pct(ses, 0.5), sesP90: pct(ses, 0.9), sesMax: ses.length ? Math.max(...ses) : NaN,
    chap: mean(chap), chapMed: pct(chap, 0.5), chapP90: pct(chap, 0.9),
    round: mean(rounds.map(r => r.dur)), roundMed: pct(rounds.map(r => r.dur), 0.5), roundP90: pct(rounds.map(r => r.dur), 0.9),
    fc: mean(rounds.filter(r => r.fc !== null).map(r => r.fc)),
    stars: mean(stars), starPct: mean(done.map(s => s.stars / (3 * s.rounds.length + s.chapters.length))),
    starsMin: stars.length ? Math.min(...stars) : NaN, starsMax: stars.length ? Math.max(...stars) : NaN,
    catchRate: corrects / Math.max(1, corrects + misses), wrongShare: wrongs / Math.max(1, corrects + wrongs),
    wrongPerRound: wrongs / Math.max(1, rounds.length), missPerRound: misses / Math.max(1, rounds.length),
    hintsPerMin: sum(S.map(s => s.hints)) / minutes, idlesPerMin: sum(S.map(s => s.idles)) / minutes, tapsPerMin: sum(S.map(s => s.taps)) / minutes,
    idleGap: mean(idleGaps), idleGapMin: idleGaps.length ? Math.min(...idleGaps) : NaN,
    maxNoRight: Math.max(...S.map(s => s.maxNoRight)), maxAirOver: Math.max(...S.map(s => s.maxAirOver)),
    stuck: sum(S.map(s => s.stuck)), invariant: sum(S.map(s => s.invariant)), errors: sum(S.map(s => s.errors.length)),
    cutsPerMin: cuts / minutes, earlyPerMin: early / minutes, neverPerMin: never / minutes,
    speechEvPerMin: sum(S.map(s => sum(Object.values(s.speechTypes)))) / minutes,
    speechMax1: Math.max(...S.map(s => s.speechMax1)), speechMax3: Math.max(...S.map(s => s.speechMax3)),
    talkAns: mean([].concat(...S.map(s => s.talk.filter(x => x !== null))))
  };
}

function table(head, rows) {
  return '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
}

function main() {
  const name = process.argv[2] || 'baseline';
  const D = load(name), S = D.sessions;
  let md = `## ${name}  (${S.length} sessions, config ${JSON.stringify(D.config)})\n\n`;
  const drivers = [...new Set(S.map(s => s.driver))], ages = [...new Set(S.map(s => s.age))].sort();
  // 1. session / chapter / round durations per driver × age
  const rows = [];
  for (const d of drivers) for (const a of ages) {
    const g = S.filter(s => s.driver === d && s.age === a); if (!g.length) continue;
    const A = agg(g);
    rows.push([d, a, `${A.done}/${A.n}`, f0(A.sesMed), f0(A.sesP90), f0(A.chapMed), f0(A.chapP90), f1(A.roundMed), f1(A.fc), f1(A.stars), fp(A.starPct),
      fp(A.catchRate), f1(A.wrongPerRound), f1(A.hintsPerMin), f1(A.idlesPerMin), A.stuck, f1(A.cutsPerMin), A.speechMax1 + '/' + A.speechMax3]);
  }
  md += table(['driver', 'age', 'done', 'session s (med)', 'p90', 'chapter s (med)', 'p90', 'round s (med)', '1st catch s', 'stars', '% of max',
    'right caught before the grass', 'wrong/round', 'hints/min', 'idle/min', 'stuck', 'speech cuts/min', 'max speech ev 1s/3s'], rows);
  // 2. by viewport (all drivers)
  const vr = [];
  for (const [vp, g] of Object.entries(by(S, s => s.vp))) {
    const A = agg(g);
    vr.push([vp, A.n, f0(A.sesMed), fp(A.catchRate), f1(A.maxNoRight), A.maxAirOver, A.stuck, A.invariant, A.errors]);
  }
  md += '\n' + table(['viewport', 'sessions', 'session s (med)', 'right caught', 'max s only-wrong in the air', 'max over maxAir', 'stuck', 'invariant', 'errors'], vr);
  // 3. by language
  const lr = [];
  for (const [l, g] of Object.entries(by(S, s => s.lang))) { const A = agg(g); lr.push([l, A.n, f0(A.sesMed), f1(A.cutsPerMin), f1(A.earlyPerMin), f1(A.neverPerMin)]); }
  md += '\n' + table(['lang', 'sessions', 'session s (med)', 'cuts/min', 'cut <50 %/min', 'never-spoken/min'], lr);
  // 4. speech cut pairs (all)
  const pairs = {};
  for (const s of S) for (const [k, v] of Object.entries(s.speech.cutsBy)) pairs[k] = (pairs[k] || 0) + v;
  const totalMin = sum(S.map(s => s.simTime)) / 60;
  md += '\n' + table(['cut line <- by', 'per min'], Object.entries(pairs).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => [k, (v / totalMin).toFixed(2)]));
  // 5. per-topic round durations
  const tr = [];
  for (const d of drivers.filter(x => ['toddler', 'typical', 'bot0.5', 'bot0.9'].includes(x))) {
    const rs = [].concat(...S.filter(s => s.driver === d).map(s => s.rounds.map(r => Object.assign({ age: s.age }, r))));
    for (const [k, g] of Object.entries(by(rs, r => r.age + ' ' + r.topic))) {
      const dd = g.filter(r => r.dur !== null).map(r => r.dur);
      tr.push([d, k, g.length, f1(mean(g.map(r => r.need))), f1(pct(dd, 0.5)), f1(pct(dd, 0.9)), f1(mean(g.map(r => r.spawns))), f1(mean(g.map(r => r.wrong))), f1(mean(g.map(r => r.miss))), f1(mean(g.map(r => r.stars)))]);
    }
  }
  md += '\n' + table(['driver', 'age topic', 'rounds', 'need', 'round s (med)', 'p90', 'bubbles/round', 'wrong/round', 'miss/round', 'stars/round'], tr);
  const out = path.join(__dirname, 'out', name + '.md');
  fs.writeFileSync(out, md);
  process.stdout.write(md);
}
if (require.main === module) main();
module.exports = { agg, load, by, table };
