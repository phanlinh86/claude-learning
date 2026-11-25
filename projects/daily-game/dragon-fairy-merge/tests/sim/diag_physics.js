#!/usr/bin/env node
// Mossy's Egg Grove — physics diagnostics behind the deep playtest numbers (report only).
//   node tests/sim/diag_physics.js
// 1) settle test: after a bot plays k drops and stops, what still moves 3–8 s later (merges? creep? jitter?)
// 2) big overlaps: when do two landed eggs overlap > 0.15 u, and for how long
'use strict';
const { load } = require('../unit/load');
const MEG = load(['rng.js', 'world.js', 'bot.js']);
const H = 1 / 60, out = s => process.stdout.write(s + '\n');

out('## settle test detail (Normal, bot 0.6, pace 1.2 s)');
out('| seed | k | eggs | merges in quiet 0–3 s | merges 3–8 s | max drift 3–8 s | max speed 3–8 s | mover kind / y / falling / nc |');
out('|---|---|---|---|---|---|---|---|');
let creepers = 0, piles = 0;
for (const k of [15, 30, 45, 60]) for (let s = 0; s < 10; s++) {
  const w = new MEG.World({ seed: 5000 + s, difficulty: 'normal' }), bot = new MEG.Bot(w, { skill: 0.6, seed: 5000 + s, pace: 1.2 });
  while (w.phase === 'play' && w.drops < k && w.time < 600) { bot.step(H); w.update(H); }
  if (w.phase !== 'play') continue;
  let m1 = 0, m2 = 0;
  for (let i = 0; i < 180; i++) { w.update(H); m1 += w.drainEvents().filter(e => e.type === 'merge').length; }
  const p0 = new Map(w.eggs.map(e => [e.id, [e.x, e.y]]));
  let vmax = 0, who = null;
  for (let i = 0; i < 300; i++) {
    w.update(H); m2 += w.drainEvents().filter(e => e.type === 'merge').length;
    for (const e of w.eggs) { const v = Math.hypot(e.vx, e.vy); if (v > vmax) { vmax = v; who = e; } }
  }
  let drift = 0; for (const e of w.eggs) { const p = p0.get(e.id); if (p) drift = Math.max(drift, Math.hypot(e.x - p[0], e.y - p[1])); }
  piles++; if (drift > 0.02 && m2 === 0) creepers++;
  if (drift > 0.02 || vmax > 0.1) out(`| ${5000 + s} | ${k} | ${w.eggs.length} | ${m1} | ${m2} | ${drift.toFixed(3)} | ${vmax.toFixed(2)} | ${who ? `${who.kind} / ${who.y.toFixed(2)} / ${who.falling} / ${who.nc}` : ''} |`);
}
out(`\npiles: ${piles}; drifting > 0.02 u in 5 s WITHOUT any merge: ${creepers}`);

out('\n## big overlaps between two landed eggs (> 0.15 u), 30 bot games Normal+Hard, skill 0.5/1');
let events = 0, frames = 0, longest = 0; const ctx = [];
for (const diff of ['normal', 'hard']) for (const skill of [0.5, 1]) for (let s = 0; s < 8; s++) {
  const w = new MEG.World({ seed: 700 + s, difficulty: diff }), bot = new MEG.Bot(w, { skill, seed: s, pace: 2 });
  const run = new Map();
  while (w.phase === 'play' && w.time < 900) {
    bot.step(H); w.update(H); w.drainEvents();
    const eg = w.eggs, nr = new Map();
    for (let i = 0; i < eg.length; i++) for (let j = i + 1; j < eg.length; j++) {
      const a = eg[i], b = eg[j];
      if (a.falling || b.falling || a.born < 0.5 || b.born < 0.5) continue;
      const ov = a.r + b.r - Math.hypot(a.x - b.x, a.y - b.y);
      if (ov > 0.15) {
        const key = a.id + ':' + b.id, c = (run.get(key) || 0) + 1; nr.set(key, c); frames++;
        if (c === 1) { events++; if (ctx.length < 8) ctx.push(`${diff} s${skill} t=${w.time.toFixed(1)} kinds ${a.kind}/${b.kind} ov ${ov.toFixed(3)} speeds ${Math.hypot(a.vx, a.vy).toFixed(1)}/${Math.hypot(b.vx, b.vy).toFixed(1)} ages ${a.age.toFixed(2)}/${b.age.toFixed(2)} eggs ${eg.length}`); }
        if (c > longest) longest = c;
      }
    }
    for (const [k] of run) if (!nr.has(k)) run.delete(k);
    for (const [k, v] of nr) run.set(k, v);
  }
}
out(`overlap events: ${events}, frames: ${frames}, longest run: ${longest} frames (${(longest / 60).toFixed(2)} s)`);
ctx.forEach(c => out('- ' + c));
