// Otto's Playroom Dash — pacing sim: biome durations and hits per chapter for bot skills (node tests/sim/sim.js [maxChapters] [seeds])
'use strict';
const { load } = require('../unit/load');
const OD = load();

function play(diff, skill, seed, maxCh, maxT) {
  const w = new OD.World({ seed, difficulty: diff });
  const bot = new OD.Bot(w, { skill, seed: seed * 7 + 1 });
  const dt = 1 / 60; let t = 0, last = 0, hits = 0;
  const ch = [];   // {t, hits}
  while (w.phase === 'play' && t < maxT && ch.length < maxCh) {
    bot.step(dt); w.update(dt); t += dt;
    for (const e of w.drainEvents()) {
      if (e.type === 'bump') hits++;
      if (e.type === 'levelUp') { ch.push({ t: t - last, hits }); last = t; hits = 0; }
    }
  }
  return { w, ch, t, over: w.phase === 'over', partial: { t: t - last, hits } };
}
module.exports = { play };

if (require.main === module) {
  const maxCh = +(process.argv[2] || 4), seeds = +(process.argv[3] || 6);
  for (const diff of ['easy', 'normal', 'hard']) {
    for (const skill of [0.5, 0.9, 1]) {
      const per = [];   // per chapter index: arrays of t, hits
      let overs = 0, chs = 0, air = 0, apex = 0, acorns = 0;
      for (let s = 1; s <= seeds; s++) {
        const r = play(diff, skill, s, maxCh, 600);
        r.ch.forEach((c, i) => { (per[i] = per[i] || { t: [], h: [] }).t.push(c.t); per[i].h.push(c.hits); });
        if (r.over) overs++; chs += r.ch.length;
        air = Math.max(air, r.w.stats.maxAir); apex = Math.max(apex, r.w.stats.maxApex); acorns += r.w.stats.acorns;
      }
      const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length) : NaN;
      console.log(`${diff.padEnd(6)} skill ${skill}: chapters/run ${(chs / seeds).toFixed(2)}, game overs ${overs}/${seeds}, ` +
        per.map((p, i) => `ch${i + 1} ${avg(p.t).toFixed(1)}s ${avg(p.h).toFixed(2)}h (n${p.t.length})`).join(' | ') +
        ` | acorns/run ${(acorns / seeds).toFixed(0)}, max air ${air.toFixed(2)} s, max apex ${apex.toFixed(2)} u`);
    }
  }
}
