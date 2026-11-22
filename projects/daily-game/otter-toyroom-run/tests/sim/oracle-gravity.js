// Otto's Playroom Dash — oracle (was it avoidable?) on the gravity-specific hits found by gravity.js:
// hits in the easing window after a biome change, hits right after landing from a long jump, ball hits on crayon / moon.
//   node tests/sim/oracle-gravity.js [seeds=40] [patch.json] [maxPerClass=12]
'use strict';
const fs = require('fs');
const { loadPatched } = require('./playtest');
const { makePlayer } = require('./players');
const { check } = require('./oracle');
const seeds = +(process.argv[2] || 40);
const pf = process.argv[3]; const patch = pf ? JSON.parse(fs.readFileSync(pf, 'utf8')) : null;
const maxN = +(process.argv[4] || 12);
const OD = loadPatched(patch), C = OD.World.CONFIG, EW = C.gravEase + 1.5;
const classes = { easing: [], longLand: [], ballMoon: [], ballCrayon: [] };
for (const [model, diff] of [['adult', 'normal'], ['adult', 'hard'], ['kid5', 'easy'], ['kid', 'easy']]) {
  for (let s = 1; s <= seeds; s++) {
    const w = new OD.World({ seed: s, difficulty: diff }); const pl = makePlayer(model, w, OD, s, { skill: 0.9 });
    let t = 0, b0 = 0, lastLand = -9, lastAir = 0, prev = 0;
    while (w.phase === 'play' && t < 480) {
      pl.step(1 / 60); w.update(1 / 60); t += 1 / 60;
      for (const e of w.drainEvents()) {
        if (e.type === 'levelUp') b0 = t;
        if (e.type === 'land') { lastLand = t; lastAir = w.stats.maxAir; }
        if (e.type !== 'bump') continue;
        const job = { model, diff, seed: s, skill: 0.9, hitT: +t.toFixed(4), prevHitT: prev, kind: e.kind, zone: w.zone }; prev = t;
        if (w.level > 0 && t - b0 < EW) classes.easing.push(job);
        else if (w.hero.onGround && t - lastLand < 0.35 && w.zone % 2 === 1) classes.longLand.push(job);
        else if (e.kind === 'ball' && w.zone === 3 && model === 'adult') classes.ballMoon.push(job);
        else if (e.kind === 'ball' && w.zone === 2 && model === 'adult') classes.ballCrayon.push(job);
      }
    }
  }
}
for (const [k, jobs] of Object.entries(classes)) {
  let ok = 0, bad = 0, n = 0; const notes = [];
  for (const j of jobs.slice(0, maxN)) {
    const r = check(j, patch, { leads: [2.5] }); n++;
    if (r.avoidable) ok++; else if (r.avoidable === false) { bad++; notes.push(`${j.model}/${j.diff} s${j.seed} t${j.hitT.toFixed(1)} ${j.kind} z${j.zone}`); }
  }
  console.log(`${k.padEnd(11)} found ${jobs.length}, checked ${n}: avoidable ${ok}, UNAVOIDABLE ${bad} ${notes.join('; ')}`);
}
