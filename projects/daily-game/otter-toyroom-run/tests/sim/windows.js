// Otto's Playroom Dash — jump timing windows per biome gravity: how precise must a jump be?
//   [NV=13] node tests/sim/windows.js [patch.json]
// Isolated world per case (gravity snapped to the biome, no generated track), one obstacle in Otto's lane, then a sweep
// of take-off times (5 ms grid) from 1.2 s before Otto reaches it to the moment he does. Prints the width of the
// clearing window(s) in ms. Balls: rolling in from the left side, timed to be centred on Otto's lane when he gets
// there, over NV roll speeds (env NV, default 7 = 7 bounce phases); "under" = he passes without jumping (a high moon bounce).
'use strict';
const fs = require('fs');
const { loadPatched } = require('./playtest');
const patch = process.argv[2] ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')) : null;
const OD = loadPatched(patch), C = OD.World.CONFIG;

function bare(diff, zone) {
  const w = new OD.World({ seed: 1, difficulty: diff, level: zone });
  w.objects = []; w._gen.nextS = 1e12; w.speed = w._speedFor(zone, 0, 0.5); w.hero.invuln = 0;
  w.D = Object.assign({}, w.D); w._targetSpeed = function () { return this.speed; };   // constant speed for the sweep
  return w;
}
function trial(diff, zone, kind, tj, vx) {
  const w = bare(diff, zone), v = w.speed, Tarr = 1.6;
  if (kind === 'blocks') w.spawn('blocks', 0, v * Tarr);
  else { const x0 = -1.9, T = (0 - x0) / vx; w.spawn('ball', x0, v * Tarr, { vx: 0, awake: false, wake: 99 });
    const o = w.objects[0]; o.pending = { at: Tarr - T, vx }; }
  const dt = C.step; let t = 0, jumped = tj === null;
  while (t < Tarr + 0.8) {
    if (!jumped && t >= Tarr + tj) { w.jump(); jumped = true; }
    const o = w.objects[0];
    if (o && o.pending && t >= o.pending.at) { o.awake = true; o.vx = o.pending.vx; o.vy = C.ballV * C.ballKick; o.pending = null; }
    if (o && o.pending) { o.z = o.s - w.dist; }
    w.update(dt); t += dt;
    if (w.stats.bumps) return false;
  }
  return true;
}
function windowMs(diff, zone, kind, vx) {
  let n = 0, best = 0, run = 0;
  for (let tj = -1.2; tj <= 0.001; tj += 0.005) { if (trial(diff, zone, kind, tj, vx)) { n++; run++; best = Math.max(best, run); } else run = 0; }
  return { total: n * 5, longest: best * 5, under: trial(diff, zone, kind, null, vx) };
}
const NV = +(process.env.NV || 7);
const names = ['meadow 1.0', 'pillows 0.7', 'crayon 1.25', 'stars 0.5'];
const out = {};
for (const diff of ['easy', 'normal', 'hard']) {
  console.log(`\n${diff}: zone | blocks window (ms) | ball window ms over ${NV} roll speeds (min / median / max) | ball passable without a jump`);
  for (let z = 0; z < 4; z++) {
    const b = windowMs(diff, z, 'blocks');
    const balls = [], detail = []; let under = 0, stuck = 0;
    for (let k = 0; k < NV; k++) { const vx = 1.2 + 0.6 * k / (NV - 1); const r = windowMs(diff, z, 'ball', vx); balls.push(r.longest); detail.push(r.longest + (r.under ? 'u' : '')); if (r.under) under++; if (!r.longest && !r.under) stuck++; }
    const s = balls.slice().sort((a, c) => a - c);
    out[diff + z] = { blocks: b.longest, ball: s, detail, stuck };
    console.log(`  ${names[z].padEnd(12)} | ${String(b.longest).padEnd(4)} | ${s[0]} / ${s[3]} / ${s[6]}   [${detail.join(' ')}] | ${under}/${NV} | in-lane impossible ${stuck}/${NV}`);
  }
}
fs.mkdirSync(__dirname + '/results', { recursive: true });
fs.writeFileSync(__dirname + '/results/windows' + (patch ? '-patched' : '') + '.json', JSON.stringify(out));
