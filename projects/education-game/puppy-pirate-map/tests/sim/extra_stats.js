#!/usr/bin/env node
// Mit's Treasure Map — extra playtest numbers (report-only): per age, a typical child (or --model x) plays N sessions and we
// count: asks where the asked piece is the ONLY piece left in the water (a "free" answer), surprises per session / chapter
// (crab, bubbles) and how many the child tapped, identical rounds in a session (same key, or the same set of things),
// wash-in time (round start → first ask), roll-up + scroll flight time (alive end → next round), splash events per round.
//   node tests/sim/extra_stats.js [--n 200] [--ages 3,4,5,6,7] [--model typical] [--config '{…}']
'use strict';
const L = require('./lib');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 200), AGES = get('ages', '3,4,5,6,7').split(',').map(Number), MODEL = get('model', 'typical'), config = JSON.parse(get('config', '{}'));
const VPS = Object.keys(L.VIEWPORTS);
const thingSig = t => [t.kind, t.obj, t.color, t.shape, t.n, t.animal, t.text, t.big].filter(x => x !== undefined).join(':');
const out = ['| age | sessions | asks | asked piece is the last one left % (of asks; of non-final asks) | rounds with a distractor % | crab / bubbles per session | surprise tapped % | identical rounds (key / thing set) | wash-in s (round → first ask) | roll-up → next round s | splashes / round | pieceLand / round |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const age of AGES) {
  const A = { s: 0, asks: 0, last: 0, lastNF: 0, nf: 0, rounds: 0, dis: 0, crab: 0, bub: 0, crabTap: 0, bubPop: 0, repKey: 0, repSet: 0, wash: [], roll: [], splash: 0, land: 0 };
  for (let i = 0; i < N; i++) {
    const w = L.mkWorld({ age, lang: i % 2 ? 'vi' : 'en', vp: VPS[i % VPS.length], seed: 7000 + i * 41 + age, config });
    const kid = L.makeModel(MODEL, w, age, 7001 + i * 41 + age);
    w.newSession(); A.s++;
    const keys = new Set(), sets = new Set(); let tRound = 0, tAliveEnd = -1, prevPhase = '', gotTap = { crab: false, bub: false }, sawCrab = false, sawBub = false;
    for (let t = 0; t < 1800 && w.state !== 'sessionDone'; t += 1 / 30) {
      kid.step(1 / 30); w.update(1 / 30);
      if (w.phase !== prevPhase) { if (prevPhase === 'alive' && w.phase === 'turn') tAliveEnd = w.time; prevPhase = w.phase; }
      for (const e of w.drainEvents()) {
        kid.onEvent(e);
        switch (e.type) {
          case 'round': {
            A.rounds++; tRound = w.time; if (tAliveEnd >= 0) { A.roll.push(w.time - tAliveEnd); tAliveEnd = -1; }
            if (keys.has(e.key)) A.repKey++; keys.add(e.key);
            const set = w.pieces.map(p => thingSig(p.thing)).sort().join('|'); if (sets.has(set)) A.repSet++; sets.add(set);
            if (w.pieces.some(p => !p.slot)) A.dis++;
            break;
          }
          case 'ask': {
            if (e.first) A.wash.push(w.time - tRound);
            A.asks++;
            const left = w.pieces.filter(p => p.state !== 'placed' && p.state !== 'snap' && p.state !== 'gone' && p.pop > 0.01 || (p.state === 'drop')).filter(p => p.state !== 'placed' && p.state !== 'snap');
            const st = w.stepInfo, remainingSteps = st ? w.cur.steps.length - w.step : 1, final = remainingSteps <= 1;
            if (left.length <= 1) { A.last++; if (!final) A.lastNF++; }
            if (!final) A.nf++;
            break;
          }
          case 'talk': tAliveEnd = -1; break;
          case 'crab': A.crab++; break;
          case 'bubbles': A.bub++; break;
          case 'crabTap': A.crabTap++; break;
          case 'bubblePop': A.bubPop++; break;
          case 'splash': A.splash++; break;
          case 'pieceLand': A.land++; break;
        }
      }
    }
  }
  const f = x => x.toFixed(1);
  out.push(`| ${age} | ${A.s} | ${A.asks} | ${f(A.last / A.asks * 100)} ; ${f(A.lastNF / Math.max(1, A.nf) * 100)} | ${f(A.dis / A.rounds * 100)} | ${(A.crab / A.s).toFixed(2)} / ${(A.bub / A.s).toFixed(2)} | crab ${f(A.crabTap / Math.max(1, A.crab) * 100)} · pops/bubble-event ${(A.bubPop / Math.max(1, A.bub)).toFixed(2)} | ${A.repKey} / ${A.repSet} of ${A.rounds} | ${L.mean(A.wash).toFixed(2)} (p90 ${L.pct(A.wash, 0.9).toFixed(2)}) | ${L.mean(A.roll).toFixed(2)} | ${(A.splash / A.rounds).toFixed(2)} | ${(A.land / A.rounds).toFixed(2)} |`);
}
console.log(`# extra_stats ${MODEL} n=${N} config ${JSON.stringify(config)}\n\n` + out.join('\n'));
