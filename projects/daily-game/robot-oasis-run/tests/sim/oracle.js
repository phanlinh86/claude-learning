// Pebble's Oasis Run — fairness oracle: was a hit avoidable at all?
// Replays a run (bot or player model) up to `lead` seconds before a hit, clones the world, then does a
// breadth-first beam search over inputs (every 0.1 s: nothing / left / right / jump / left+jump / right+jump)
// for any input sequence that gets past the hit time + 1.5 s without a bump. If none exists the hit is unavoidable.
//   node tests/sim/oracle.js <results.json>     → checks every skill-1 hit listed in it
//   require('./oracle').check({model, skill, diff, seed, hitT}, patch)
'use strict';
const fs = require('fs');
const path = require('path');
const { loadPatched } = require('./playtest');
const { makePlayer } = require('./players');

function clone(v, m) {
  if (v === null || typeof v !== 'object') return v;
  if (m.has(v)) return m.get(v);
  let c;
  if (Array.isArray(v)) { c = new Array(v.length); m.set(v, c); for (let i = 0; i < v.length; i++) c[i] = clone(v[i], m); }
  else { c = Object.create(Object.getPrototypeOf(v)); m.set(v, c); for (const k of Object.keys(v)) c[k] = clone(v[k], m); }
  return c;
}
function cloneWorld(w) {
  w.events = [];
  const keepD = w.D, keepO = w.opts; w.D = null; w.opts = null;
  const c = clone(w, new Map());
  w.D = c.D = keepD; w.opts = c.opts = keepO;
  return c;
}

function stateAt(job, patch, t) {
  const PO = loadPatched(patch);
  const w = new PO.World({ seed: job.seed, difficulty: job.diff });
  const pl = makePlayer(job.model, w, PO, job.seed, { skill: job.skill });
  const dt = 1 / 60; let tt = 0;
  while (tt < t - 1e-9 && w.phase === 'play') { pl.step(dt); w.update(dt); tt += dt; w.drainEvents(); }
  return w;
}

const ACTS = [[0, 0], [-1, 0], [1, 0], [0, 1], [-1, 1], [1, 1]];
function key(w) {
  const h = w.hero;
  let k = `${h.lane}|${h.x.toFixed(2)}|${h.y.toFixed(2)}|${h.vy.toFixed(1)}|${h.queued}|${h.buffer > 0 ? 1 : 0}`;
  for (const o of w.objects) if (o.kind === 'pillow' && (o.state === 'fly' || o.state === 'live')) k += `|${o.landX},${o.landS.toFixed(1)}`;
  return k;
}

/** returns { avoidable, lead, explored } */
function search(w0, horizon, beam) {
  let frontier = [w0];
  const bumps0 = w0.stats.bumps, steps = Math.round(horizon / 0.1);
  let explored = 0;
  for (let s = 0; s < steps; s++) {
    const next = [], seen = new Set();
    for (const w of frontier) {
      for (const [mv, jp] of ACTS) {
        const c = cloneWorld(w); explored++;
        if (mv) c.move(mv);
        if (jp) c.jump();
        c.update(0.1);
        if (c.stats.bumps > bumps0 || c.phase !== 'play') continue;
        const k = key(c); if (seen.has(k)) continue; seen.add(k);
        next.push(c);
      }
    }
    if (!next.length) return { avoidable: false, explored, failedAtStep: s };
    // keep the beam diverse: shuffle deterministically by key hash, then cut
    frontier = next.length > beam ? next.filter((_, i) => i % Math.ceil(next.length / beam) === 0) : next;
  }
  return { avoidable: true, explored };
}

function check(job, patch, opts) {
  opts = opts || {};
  const leads = opts.leads || [2.5, 5];
  for (const lead of leads) {
    // never start before the previous hit (else that earlier, separate hit would count as this one's failure)
    const t0 = Math.max(0.5, job.hitT - lead, (job.prevHitT || 0) + 0.05);
    const w = stateAt(job, patch, t0);
    if (w.phase !== 'play') return { avoidable: null, note: 'over before t0' };
    const r = search(w, job.hitT - t0 + 1.5, opts.beam || 250);
    if (r.avoidable) return Object.assign({ lead }, r);
    if (lead === leads[leads.length - 1]) return Object.assign({ lead }, r);
  }
}

module.exports = { check, cloneWorld, stateAt, search };

if (require.main === module && process.argv[2] === '--sample') {
  // node tests/sim/oracle.js --sample <model> <diff> <seeds> [maxHits] [patch.json] → check every hit of those runs
  const { playRound } = require('./playtest');
  const [model, diff, seeds, maxHits, pf] = process.argv.slice(3);
  const patch = pf ? JSON.parse(fs.readFileSync(pf, 'utf8')) : null;
  let n = 0, bad = 0; const out = [];
  for (let s = 1; s <= +seeds && n < +(maxHits || 1e9); s++) {
    const r = playRound({ model, diff, seed: s, maxT: 480, skill: 0.9 }, patch);
    for (let hi = 0; hi < r.hits.length; hi++) {
      const h = r.hits[hi];
      if (n++ >= +(maxHits || 1e9)) break;
      const o = check({ model, diff, seed: s, hitT: h.t, prevHitT: hi ? r.hits[hi - 1].t : 0, skill: 0.9 }, patch, { leads: [2.5] });
      if (!o.avoidable) bad++;
      out.push(Object.assign({ model, diff, seed: s }, h, { avoidable: o.avoidable }));
      if (!o.avoidable) console.log(`UNAVOIDABLE ${model} ${diff} seed ${s} t=${h.t} ${h.kind} ch${h.level + 1} lane ${h.lane} x ${h.heroX}`);
    }
  }
  console.log(`${model}/${diff}: ${n} hits checked, ${bad} unavoidable`);
  fs.writeFileSync(path.join(__dirname, 'results', `oracle-sample-${model}-${diff}.json`), JSON.stringify(out, null, 1));
} else if (require.main === module) {
  const res = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
  const out = [];
  for (const h of res.skill1Hits) {
    const r = check({ model: 'bot', skill: 1, diff: h.diff, seed: h.seed, hitT: h.t }, res.patch);
    out.push(Object.assign({}, h, { oracle: r }));
    console.log(`${h.diff} seed ${h.seed} t=${h.t} ${h.kind} ch${h.level + 1} lane ${h.lane} x ${h.heroX} → ${r.avoidable ? 'avoidable (lead ' + r.lead + ' s)' : 'UNAVOIDABLE'} (${r.explored} nodes)`);
  }
  const f = process.argv[3] || process.argv[2].replace(/\.json$/, '.oracle.json');
  fs.writeFileSync(f, JSON.stringify(out, null, 1));
}
