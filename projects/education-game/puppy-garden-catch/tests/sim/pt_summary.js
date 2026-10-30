#!/usr/bin/env node
// Summarises playtest.js output.  node tests/sim/pt_summary.js pt_base_a3,pt_base_a4,... [--by driver|age|vp] [--json]
//   Several names joined with "," are merged.  Writes nothing; prints markdown tables.
'use strict';
const fs = require('fs');
const path = require('path');
const { mean, pct, f1, f0, fp } = require('./lib');
const sum = (a) => a.reduce((s, x) => s + x, 0);

function load(names) {
  let S = [];
  for (const n of names.split(',')) S = S.concat(JSON.parse(fs.readFileSync(path.join(__dirname, 'out', n + '.json'), 'utf8')).sessions);
  return S;
}

function agg(S) {
  const done = S.filter(s => s.done), rounds = [].concat(...S.map(s => s.rounds.filter(r => r.d !== null)));
  const chaps = [].concat(...S.map(s => s.chapters.filter(c => c.d !== null)));
  const ch0 = S.map(s => s.chapters[0]).filter(c => c && c.d !== null).map(c => c.d);
  const talks = [].concat(...S.map(s => s.talks.filter(t => t.correct !== null)));
  const catches = sum(S.map(s => s.corrects + s.wrongs)), wr = sum(S.map(s => s.wrongs)), cor = sum(S.map(s => s.corrects));
  const rt = sum(S.map(s => s.roundTime));
  const st = [1, 2, 3].map(k => rounds.filter(r => r.s === k).length / Math.max(1, rounds.length));
  return {
    n: S.length, done: done.length / S.length,
    ses: pct(done.map(s => s.T), 0.5), sesP90: pct(done.map(s => s.T), 0.9), sesMax: done.length ? Math.max(...done.map(s => s.T)) : NaN,
    over8: done.filter(s => s.T > 480).length / Math.max(1, done.length),
    chap: pct(chaps.map(c => c.d), 0.5), chapP90: pct(chaps.map(c => c.d), 0.9), ch0: pct(ch0, 0.5),
    chIn: chaps.filter(c => c.d >= 60 && c.d <= 100).length / Math.max(1, chaps.length),
    ch3: chaps.filter(c => c.r < 4).length / Math.max(1, chaps.length),
    round: pct(rounds.map(r => r.d), 0.5), roundP90: pct(rounds.map(r => r.d), 0.9),
    fc: pct(rounds.filter(r => r.fc !== null).map(r => r.fc), 0.5),
    stuck: sum(S.map(s => s.stuck)), aStuck: sum(S.map(s => s.activeStuck || 0)), stuckR: sum(S.map(s => s.stuck)) / Math.max(1, rounds.length),
    gapMax: Math.max(...rounds.map(r => r.g)), gapP99: pct(rounds.map(r => r.g), 0.99),
    hintsPerRound: sum(S.map(s => s.hints)) / Math.max(1, rounds.length), hintRounds: rounds.filter(r => r.h > 0).length / Math.max(1, rounds.length),
    hintsPerMin: sum(S.map(s => s.hints)) / (rt / 60), hintGapMin: Math.min(...S.map(s => s.hintGapMin)),
    onlyWrong: sum(S.map(s => s.onlyWrong)) / Math.max(1, rt), owEpPerMin: sum(S.map(s => s.onlyWrongEp)) / (rt / 60),
    st1: st[0], st2: st[1], st3: st[2], starPct: mean(done.map(s => s.stars / s.maxStars)),
    wrongRate: wr / Math.max(1, catches), wrongPerRound: wr / Math.max(1, rounds.length), missPerRound: sum(S.map(s => s.misses)) / Math.max(1, rounds.length),
    wrongStill: sum(S.map(s => s.wrongStill)) / Math.max(1, wr), wrongStillPerRound: sum(S.map(s => s.wrongStill)) / Math.max(1, rounds.length),
    rightStill: sum(S.map(s => s.rightStill)) / Math.max(1, cor), handsOff: sum(S.map(s => s.handsOff)) / Math.max(1, catches),
    repT: sum(S.map(s => s.rep.target)) / Math.max(1, sum(S.map(s => s.rep.pairs))), repP: sum(S.map(s => s.rep.pool)) / Math.max(1, sum(S.map(s => s.rep.pairs))),
    talkRight: talks.filter(t => t.correct).length / Math.max(1, talks.length), talkErr: sum(S.map(s => s.talkErr.length)),
    talkErrKinds: [...new Set([].concat(...S.map(s => s.talkErr)))], errors: sum(S.map(s => s.errors.length)),
    roundsMin: rt / 60, sessions: S.length
  };
}
const table = (head, rows) => '| ' + head.join(' | ') + ' |\n|' + head.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';

function report(S, title) {
  let md = `### ${title} — ${S.length} sessions\n\n`;
  const ages = [...new Set(S.map(s => s.age))].sort(), drivers = [...new Set(S.map(s => s.driver))];
  const r1 = [];
  for (const d of drivers) for (const a of ages) {
    const g = S.filter(s => s.driver === d && s.age === a); if (!g.length) continue; const A = agg(g);
    r1.push([d, a, g.length, fp(A.done), f0(A.ses), f0(A.sesP90), f0(A.sesMax), f0(A.ch0), f0(A.chap), f0(A.chapP90), fp(A.chIn), fp(A.ch3), f1(A.round), f1(A.roundP90), f1(A.fc), A.stuck,
      f1(A.hintsPerMin), fp(A.onlyWrong), fp(A.wrongRate), fp(A.wrongStill), fp(A.handsOff), fp(A.starPct), `${fp(A.st3)}/${fp(A.st2)}/${fp(A.st1)}`, fp(A.talkRight)]);
  }
  md += table(['driver', 'age', 'n', 'done', 'session med s', 'p90', 'max', 'ch1 med s', 'chapter med', 'p90', 'ch in 60–100 s', 'ch cut to 3 rds', 'round med', 'p90', '1st catch', 'stuck >40 s',
    'hints/min', 'only-wrong air time', 'wrong catch rate', 'wrong into still basket', 'hands-off catches', 'stars % max', '3★/2★/1★ rounds', 'talk right'], r1);
  const r2 = [];
  for (const v of [...new Set(S.map(s => s.vp))]) {
    const A = agg(S.filter(s => s.vp === v));
    r2.push([v, A.n, f0(A.ses), f0(A.chap), fp(A.wrongRate), fp(A.onlyWrong), fp(A.wrongStill), fp(A.handsOff), A.stuck, A.errors]);
  }
  md += '\n' + table(['viewport', 'n', 'session med', 'chapter med', 'wrong rate', 'only-wrong time', 'wrong into still', 'hands-off', 'stuck', 'errors'], r2);
  return md;
}

if (require.main === module) {
  const S = load(process.argv[2]);
  process.stdout.write(report(S, process.argv[2]));
  const A = agg(S);
  console.log('\nALL:', JSON.stringify({ stuck: A.stuck, gapMax: A.gapMax, hintGapMin: A.hintGapMin, repT: A.repT, repP: A.repP, talkErr: A.talkErr, talkErrKinds: A.talkErrKinds, errors: A.errors, owEpPerMin: A.owEpPerMin }));
}
module.exports = { load, agg, report, table };
