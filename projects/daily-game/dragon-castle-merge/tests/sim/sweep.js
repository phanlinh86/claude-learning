// Quick CONFIG sweep: node tests/sim/sweep.js <candidates.js>
// candidates.js exports [{ name, overrides, runs: [{player:'kid5'|'kid5 slow'|'adult'|'bot0.3'|..., diff, n, maxTime}] }]
'use strict';
const path = require('path');
const { makeEG, runGame, summarise, f, pct } = require('./lib.js');
const P = require('./players.js');

function mkPlayer(EG, name, s) {
  if (name === 'kid5') return P.kidPlayer(EG, s);
  if (name === 'kid5 slow') return P.kidPlayer(EG, s, { delay: [2.6, 4.4], see: 0.15 });
  if (name === 'adult') return P.adultPlayer(EG, s);
  if (name.startsWith('bot')) return P.botPlayer(EG, +name.slice(3), s);
  throw new Error('player ' + name);
}

function runSet(overrides, runs) {
  const EG = makeEG(overrides), out = [];
  for (const r of runs) {
    const ms = [];
    for (let s = 1; s <= r.n; s++) ms.push(runGame(EG, mkPlayer(EG, r.player, s), { diff: r.diff, seed: 1000 + s, maxTime: r.maxTime || 1200 }));
    const S = summarise(ms, r.maxTime || 1200);
    const fl = {};
    for (const m of ms) if (m.over) fl[m.level] = (fl[m.level] || 0) + 1;
    out.push(Object.assign(S, { player: r.player, diff: r.diff, deathLevels: fl }));
  }
  return out;
}

function row(name, S) {
  return `| ${name} | ${S.diff} | ${S.player} | ${S.lvT.map(x => f(x.med) + (x.n < S.n ? '(' + x.n + ')' : '')).join(' / ')} | ${S.reach.slice(0, 4).map(x => pct(x, S.n)).join(' / ')} | ${pct(S.overs, S.n)} | ${pct(S.over3, S.n)} | ${f(S.survMed)} | ${f(S.dropsMed)} | ${f(S.scoreMed)} | ${JSON.stringify(S.deathLevels)} |`;
}
const HEAD = '| set | diff | player | L1 / L2 / L3 / L4 s | reach candle / lantern / star / moon | game over | lost <3 min | survival med s | drops med | score med | game overs by level |\n|---|---|---|---|---|---|---|---|---|---|---|';

if (require.main === module) {
  const cands = require(path.resolve(process.argv[2]));
  console.log(HEAD);
  for (const c of cands) for (const S of runSet(c.overrides, c.runs)) console.log(row(c.name, S));
}
module.exports = { runSet, row, HEAD };
