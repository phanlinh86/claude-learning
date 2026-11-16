// Momo's Dino Drums — quick tuning sweeps for the playtest (single thread).
//   node tests/sim/tune.js normal '{"firstLevelCostMul":0.8}' kid,kid6,beatOne,beatBoth 60
'use strict';
const { load } = require('../unit/load.js');
const { simRun } = require('./playtest.js');
const DD = load();
// prototype of a code-level rule (not in game code): an 'empty' tap during play costs cfg.emptyCost groove
if (process.env.EMPTY_COST) {
  const tap0 = DD.World.prototype.tap, ec = +process.env.EMPTY_COST;
  DD.World.prototype.tap = function (lane, off) {
    const e = tap0.call(this, lane, off);
    if (e && e.type === 'empty' && this.state === 'playing' && (!process.env.EMPTY_L0 || this.level === 0)) this._addGroove(-ec * (this.level === 0 ? this.cfg.firstLevelCostMul : 1));
    return e;
  };
}
const [diff, overJson, kinds, runsS] = process.argv.slice(2);
const over = JSON.parse(overJson || '{}'), runs = +(runsS || 40);
const P = x => (100 * x).toFixed(0).padStart(3) + '%';
for (const k of kinds.split(',')) {
  const rs = []; for (let s = 1; s <= runs; s++) rs.push(simRun(DD, diff, k, s * 131 + 5, over));
  const reach = L => rs.filter(r => r.cleared >= L).length / runs;
  const lv = rs.flatMap(r => r.levels), sc = rs.map(r => r.score).sort((a, b) => a - b);
  const share = rs.reduce((a, r) => a + (r.playTime ? r.pipTime / r.playTime : 0), 0) / runs;
  const saves = lv.reduce((a, l) => a + l.saved, 0) / lv.length;
  console.log(k.padEnd(13), 'F1', P(reach(1)), 'F3', P(reach(2)), 'F4', P(reach(4)), 'F8', P(reach(8)),
    'acc', P(rs.reduce((a, r) => a + r.acc, 0) / runs), 'p50', String(sc[runs >> 1]).padStart(7), 'pip', P(share), 'saves', saves.toFixed(2));
}
