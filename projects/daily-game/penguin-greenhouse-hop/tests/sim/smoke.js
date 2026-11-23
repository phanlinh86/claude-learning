// quick smoke: one round of every player model on every difficulty (real hearts, 300 s cap)
'use strict';
const L = require('./lib.js');
const PH = L.freshFH();
const players = [['bot',1],['bot',0.5],['kid',4],['kid',6],['casual'],['idle'],['holdLeft'],['altFast'],['altSlow'],['mash'],['fallFarm']];
for (const d of ['easy','normal','hard']) for (const [p,a] of players) {
  const t0=Date.now();
  const m = L.runRound(PH,{diff:d,seed:11,player:p,arg:a,maxT:300,oracle:true});
  console.log(d.padEnd(6), m.player.padEnd(9), 't', m.time.toFixed(0).padStart(4), 'score', String(m.score).padStart(5), 'lv', m.levels, 'falls', m.falls.length, 'unfair', m.unfair.length, 'ff', m.fireflies, 'maxSize', m.maxSize.toFixed(2), (Date.now()-t0)+'ms');
}
