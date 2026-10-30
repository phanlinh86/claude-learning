#!/usr/bin/env node
// A kid walks away mid-round (5 min) and, separately, never answers Talk time (5 min).
// How often does Bo nudge?   node tests/sim/idle_absent.js [variant]
'use strict';
const L = require('./lib');
const V = require('./variants');
const variant = process.argv[2] || 'baseline';
V.apply(variant, L.DN);
const cfg = V.VARIANTS[variant].config || {};
const w = new L.DN.World({ seed: 9, age: 3, lang: 'en', config: cfg }); w.setViewport(960, 720, {});
w.newSession();
while (!(w.state === 'round' && w.interactive)) w.update(1 / 30);
w.drainEvents();
const times = [];
for (let i = 0; i < 300 * 30; i++) { w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'idle') times.push(+w.time.toFixed(1)); }
const t0 = times.length ? times[0] : 0;
console.log(`[${variant}] round, 5 min absent: ${times.length} idle prompts; first at +${(t0 - (w.time - 300)).toFixed(0)} s; gaps ${times.slice(1, 7).map((t, i) => (t - times[i]).toFixed(0)).join(', ')} …`);
const b = new L.DN.Bot(w, { skill: 1, seed: 2 });
while (w.state !== 'talk') { b.step(1 / 30); w.update(1 / 30); }
w.drainEvents(); let n = 0;
for (let i = 0; i < 300 * 30; i++) { w.update(1 / 30); n += w.drainEvents().length; }
console.log(`[${variant}] talk time, 5 min without an answer: state=${w.state}, ${n} events (no re-prompt, no timeout)`);
