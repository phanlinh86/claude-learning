// Otto's Playroom Dash — forensics for player-model hits: WHY did the kid bump that tower?
//   node tests/sim/kidprobe.js [model=kid] [diff=easy] [seeds=200] [biome=1] [patch.json]
// For every hit in the chosen biome it records: the row pattern (tower1/tower2, free lanes), the lane Otto was in when the
// row was first perceived, whether that object was a "lapse", whether a wrong-way swipe / missed swipe happened in the
// last 2 s, whether the kid had chased an acorn or drifted to the middle into it, and the time between first sight and hit.
'use strict';
const fs = require('fs');
const { loadPatched } = require('./playtest');
const { makePlayer } = require('./players');

function probe(model, diff, seed, biome, patch, maxT) {
  const OD = loadPatched(patch);
  const w = new OD.World({ seed, difficulty: diff, recordRows: true });
  const pl = makePlayer(model, w, OD, seed, {});
  const firstSeen = {}, laneAtSeen = {}, log = [];   // log: {t, what}
  const per = pl._perceive.bind(pl);
  pl._perceive = function () { const ds = per(); for (const d of ds) if (firstSeen[d.o.id] === undefined) { firstSeen[d.o.id] = pl.t; laneAtSeen[d.o.id] = w.hero.lane; } return ds; };
  const mv = w.move.bind(w);
  let lastJumpT = -9; w.events = w.events || [];
  let lastWrong = -9, lastMiss = -9, lastChase = -9, lastPull = -9;
  let wrong0 = 0, miss0 = 0;
  const dt = 1 / 60; let t = 0; const out = [];
  while (w.phase === 'play' && t < maxT && w.level < biome) {
    // (biome = 1-based; we stop when the kid leaves it)
    const before = { wrong: pl.stats.wrong, miss: pl.stats.missed || 0, chase: pl.stats.chases || 0, pull: pl.stats.pulls || 0 };
    pl.step(dt); w.update(dt); t += dt;
    if (pl.stats.wrong > before.wrong) lastWrong = t;
    if ((pl.stats.missed || 0) > before.miss) lastMiss = t;
    if ((pl.stats.chases || 0) > before.chase) lastChase = t;
    if ((pl.stats.pulls || 0) > before.pull) lastPull = t;
    for (const e of w.drainEvents()) {
      if (e.type === 'jump') lastJumpT = t;
      if (e.type !== 'bump' || w.level !== biome - 1) continue;
      const o = e.o;
      const row = w.rowLog.find(r => r.obstS !== null && Math.abs(r.obstS - o.s) < 0.6) || {};
      const free = [-1, 0, 1].filter(l => !(row.tall || []).includes(l));
      const ls = laneAtSeen[o.id];
      const need = ls === undefined ? null : Math.min(...free.map(f => Math.abs(f - ls)));
      const seenT = firstSeen[o.id] === undefined ? null : +(t - firstSeen[o.id]).toFixed(2);
      let cause;
      const h = w.hero;
      if (o.kind !== 'tower') {
        if (pl.seen[o.id] === true) cause = 'lapse (noticed < 0.45 s before)';
        else if (h.onGround && h.airT > 0 && h.airT < 2 && t - lastJumpT < h.airT + 0.4) cause = 'landed too early (jumped too soon)';
        else if (h.onGround) cause = 'no jump (late / never)';
        else if (h.vy > 0) cause = 'jumped too late (still rising)';
        else cause = 'jumped too early (falling onto it)';
        if (o.kind === 'ball' && t - lastWrong < 2) cause += ' + wrong swipe';
      } else if (pl.seen[o.id] === true) cause = 'lapse (noticed < 0.45 s before)';
      else if (t - lastWrong < 2) cause = 'wrong-way swipe';
      else if (t - lastMiss < 2) cause = 'missed swipe';
      else if (t - lastChase < 1.5) cause = 'chased acorns into it';
      else if (t - lastPull < 1.5) cause = 'drifted to the middle into it';
      else if (need === 2) cause = 'free lane 2 away (two swipes)';
      else if (seenT !== null && seenT < 1.2) cause = 'seen too late (< 1.2 s)';
      else cause = 'other / slow reaction';
      out.push({ seed, t: +t.toFixed(2), kind: e.kind, pattern: row.pattern, tall: row.tall, free, laneAtSeen: ls, laneNow: w.hero.lane,
        heroX: +w.hero.x.toFixed(2), objX: o.x, seenBefore: seenT, need, cause, heroY: +h.y.toFixed(2), vy: +h.vy.toFixed(2), objY: +o.y.toFixed(2), gk: +w.gk.toFixed(2), speed: +w.speed.toFixed(2) });
    }
  }
  return out;
}
module.exports = { probe };

if (require.main === module) {
  const [model = 'kid', diff = 'easy', seeds = 200, biome = 1, pf] = process.argv.slice(2);
  const patch = pf ? JSON.parse(fs.readFileSync(pf, 'utf8')) : null;
  const all = [];
  for (let s = 1; s <= +seeds; s++) all.push(...probe(model, diff, s, +biome, patch, 400));
  const by = {}, byPat = {}, seen = [];
  for (const h of all) { by[h.cause] = (by[h.cause] || 0) + 1; const k = h.kind + ':' + h.pattern; byPat[k] = (byPat[k] || 0) + 1; if (h.seenBefore !== null) seen.push(h.seenBefore); }
  seen.sort((a, b) => a - b);
  console.log(`${model}/${diff} biome ${biome}: ${all.length} hits over ${seeds} runs = ${(all.length / seeds).toFixed(2)} per run`);
  console.log('by cause:', Object.entries(by).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v} (${(100 * v / all.length).toFixed(0)} %)`).join('; '));
  console.log('by kind:pattern:', JSON.stringify(byPat));
  console.log('first-seen → hit (s) p10/p50/p90:', seen[Math.floor(seen.length * 0.1)], seen[Math.floor(seen.length * 0.5)], seen[Math.floor(seen.length * 0.9)]);
  fs.mkdirSync(__dirname + '/results', { recursive: true });
  fs.writeFileSync(`${__dirname}/results/kidprobe-${model}-${diff}-b${biome}.json`, JSON.stringify(all, null, 1));
}
