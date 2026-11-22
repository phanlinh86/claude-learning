// Otto's Playroom Dash — gravity-twist fairness probes.
//   node tests/sim/gravity.js [seeds=60] [patch.json]
// 1. mid-jump ease: jumps that take off while world.gk is easing keep their take-off arc (apex / airtime vs jumpProfile)
// 2. hits in the easing window (first gravEase + 1.5 s of a biome) vs the rest, per player group (rate per minute)
// 3. "landed into a row": hits < 0.35 s after landing from a long (≥ 0.8 s) jump, and which biome
// 4. exploits per biome: hits per biome of always-jump (bot lanes + jump every frame) vs the same bot jumping normally
'use strict';
const fs = require('fs');
const { loadPatched } = require('./playtest');
const { makePlayer } = require('./players');
const seeds = +(process.argv[2] || 60);
const pf = process.argv[3]; const patch = pf ? JSON.parse(fs.readFileSync(pf, 'utf8')) : null;
const OD = loadPatched(patch), C = OD.World.CONFIG;

// 1. mid-jump ease
{
  let worst = 0, n = 0;
  for (const from of [0, 1, 2, 3]) for (let k = 0; k < 12; k++) {
    const w = new OD.World({ seed: 3, difficulty: 'normal', level: from });
    w.objects = []; w._gen.nextS = 1e12; w.hero.invuln = 1e9;
    w.levelDist = w.goal - 0.01; w.update(C.step * 2);   // → levelUp, ease starts
    w.update(k * 0.1);                                    // take off k·0.1 s into the ease
    const gk0 = w.gk; w.jump(); let apex = 0, t = 0;
    while (!w.hero.onGround || t === 0) { w.update(C.step); t += C.step; apex = Math.max(apex, w.hero.y); if (t > 5) break; }
    const p = OD.World.jumpProfile(gk0);
    worst = Math.max(worst, Math.abs(apex - p.apex), Math.abs(t - p.air)); n++;
  }
  console.log(`1. ${n} jumps taken during a gravity ease: worst |apex − profile(take-off gk)| or |air − profile| = ${worst.toFixed(4)} (u / s)`);
}

function run(model, diff, skill, seed, maxT) {
  const w = new OD.World({ seed, difficulty: diff });
  const pl = makePlayer(model, w, OD, seed, { skill });
  const dt = 1 / 60; let t = 0, bStart = 0, lastLand = -9, lastAir = 0;
  const hits = [], biomes = [];
  while (w.phase === 'play' && t < maxT) {
    pl.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'levelUp') { biomes.push({ zone: (e.zone + 3) % 4, t0: bStart, t1: t }); bStart = t; }
      if (e.type === 'land') { lastLand = t; lastAir = w.stats.lastAir || w.hero.airT; }
      if (e.type === 'bump') hits.push({ t, zone: w.zone, kind: e.kind, sinceBiome: t - bStart, sinceLand: w.hero.onGround ? t - lastLand : null, lastAir, level: w.level });
    }
  }
  return { hits, t, w, biomes, end: { zone: w.zone, t0: bStart, t1: t } };
}

// 2 + 3
const EW = C.gravEase + 1.5;
console.log(`\n2./3. easing window = first ${EW.toFixed(1)} s of biomes 2+ | rate = hits per minute`);
for (const [model, diff, skill] of [['kid', 'easy', 0], ['kid5', 'easy', 0], ['adult', 'normal', 0], ['adult', 'hard', 0], ['bot', 'normal', 0.5], ['bot', 'hard', 0.7]]) {
  let hE = 0, tE = 0, hR = 0, tR = 0, landed = { 0: 0, 1: 0, 2: 0, 3: 0 }, longLand = 0;
  for (let s = 1; s <= seeds; s++) {
    const r = run(model, diff, skill, s, 480);
    const all = r.biomes.concat([r.end]);
    all.forEach((b, i) => { const d = b.t1 - b.t0; if (i > 0) { const e = Math.min(EW, d); tE += e; tR += d - e; } else tR += d; });
    for (const h of r.hits) {
      if (h.level > 0 && h.sinceBiome < EW) hE++; else hR++;
      if (h.sinceLand !== null && h.sinceLand < 0.35) { landed[h.zone]++; if (h.lastAir >= 0.8) longLand++; }
    }
  }
  console.log(`  ${(model + skill + '/' + diff).padEnd(14)} easing ${(60 * hE / tE).toFixed(2)}/min (${hE} hits) vs rest ${(60 * hR / tR).toFixed(2)}/min (${hR}) | hits < 0.35 s after a landing by biome 1-4: ${[0, 1, 2, 3].map(z => landed[z]).join('/')}, after a ≥ 0.8 s jump: ${longLand}`);
}

// 4. exploits per biome
console.log('\n4. hits per biome: bot 0.9 (normal jumps) vs bot 0.9 + jump every frame (the "stay airborne on the moon" exploit)');
for (const diff of ['easy', 'normal', 'hard']) {
  const row = {};
  for (const m of ['bot', 'botAlwaysJump']) {
    const per = [0, 0, 0, 0], tm = [0, 0, 0, 0];
    for (let s = 1; s <= seeds; s++) {
      const r = run(m, diff, 0.9, s, 300);
      r.biomes.concat([r.end]).forEach(b => { if (b.zone !== undefined) tm[b.zone] += b.t1 - b.t0; });
      for (const h of r.hits) per[h.zone]++;
    }
    row[m] = per.map((h, z) => tm[z] ? (60 * h / tm[z]).toFixed(2) : '–');
  }
  console.log(`  ${diff.padEnd(6)} hits/min meadow·pillows·crayon·stars — bot ${row.bot.join(' · ')} | always-jump ${row.botAlwaysJump.join(' · ')}`);
}
