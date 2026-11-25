#!/usr/bin/env node
// Mossy's Egg Grove — deep high-speed playtest (report only; never edits game/).
//   node tests/sim/deep_playtest.js [--n=24] [--max=1500] [--suite=all|bots|humans|spam|wind|physics|patch] [--patch=NAME] [--workers=2]
// Player models: MEG.Bot (skill 1/0.8/0.5/0.2), kid (tap or drag, 1.5–4 s between drops, middle-biased x, ignores wind),
// casual adult (aims at twins with the no-wind landing), spam (one spot / alternating walls as fast as allowed),
// wind-aware vs wind-ignorer. Patches (PATCHES below) are monkey-patched into the vm copy only.
'use strict';
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const path = require('path');

// ---------------- candidate tuning changes (applied to the sandbox copy only) ----------------
const PATCHES = {
  none: {},
  nowind: { LEVELS: [0, 0, 0, 0] },                         // baseline: how much does wind matter at all?
  // P1 overflow: a resting egg whose top is above the nest wall (11.2 u) fills its vine timer 3× as fast (code change)
  overflow: { OVERFLOW: { y: 11.2, extra: 2 } },
  // P1b alternative: drop() refuses while the spawn point overlaps a landed egg (code change)
  nospawn: { NOSPAWN: true },
  // P2 anti-spam: longer drop cooldown
  cool: { CONFIG: { DROP_COOLDOWN: 0.8 } },
  // P3 wind that matters for adults (autumn/winter), unchanged spring; kids on Easy keep ×0.6
  wind: { LEVELS: [2, 3.5, 6, 8] },
  // P4 autumn a bit shorter
  goals: { GOALS: [150, 400, 750] },
  // P5 kinder rescue
  rescue6: { CONFIG: { RESCUE_N: 6 } },
  rescue5: { CONFIG: { RESCUE_N: 5 } },
  // first bundle tried (overflow did not cap the pile; stronger wind added nothing) — kept for the record
  rec: { OVERFLOW: { y: 11.2, extra: 2 }, CONFIG: { DROP_COOLDOWN: 0.8 }, LEVELS: [2, 3.5, 6, 8], GOALS: [150, 400, 750] },
  // the RECOMMENDED bundle: no spawn into the pile + cooldown 0.8 s + autumn goal 750 (+ the main.js tap fix, modelled in kid-tap)
  rec2: { NOSPAWN: true, CONFIG: { DROP_COOLDOWN: 0.8 }, GOALS: [150, 400, 750], TAPFIX: true },
  // tap model only: a quick tap flies Mossy to the finger first, then drops (main.js change)
  tapfix: { TAPFIX: true },
};

function applyPatch(MEG, p) {
  const W = MEG.World;
  if (p.OVERFLOW) {
    const sd = W.prototype._stepDanger, O = p.OVERFLOW;
    W.prototype._stepDanger = function (h) {
      if (this.phase === 'play') for (const e of this.eggs) if (!e.falling && e.age > W.CONFIG.OVER_AGE && e.y + e.r > O.y) e.over += O.extra * h;
      return sd.call(this, h);
    };
  }
  if (p.NOSPAWN) {
    const dr = W.prototype.drop;
    W.prototype.drop = function () {
      if (this.held) {
        const r = W.KINDS[this.held - 1].r, x = Math.max(r, Math.min(W.CONFIG.NEST_W - r, this.mossy.x)), y = W.CONFIG.HOLD_Y;
        for (const o of this.eggs) if (!o.falling && Math.hypot(o.x - x, o.y - y) < o.r + r) return false;
      }
      return dr.call(this);
    };
  }
  if (p.CONFIG) Object.assign(W.CONFIG, p.CONFIG);
  if (p.DIFF) for (const d in p.DIFF) Object.assign(W.DIFF[d], p.DIFF[d]);
  if (p.LEVELS) p.LEVELS.forEach((v, i) => { W.LEVELS[i].wind = v; });
  if (p.GOALS || p.GOAL_LOOP != null) {
    const G = p.GOALS || W.GOALS.slice(), L = p.GOAL_LOOP != null ? p.GOAL_LOOP : W.GOAL_LOOP;
    const goalOf = (lv, f) => Math.round((lv < G.length ? G[lv] : G[G.length - 1] + L * (lv - G.length + 1)) * f / 5) * 5;
    W.prototype._setLevel = function (i) {
      this.level = Math.max(0, i); this.zone = this.level < 4 ? this.level : 3; this.loop = Math.max(0, this.level - 3);
      this.levelStart = this.level > 0 ? goalOf(this.level - 1, this.diff.goal) : 0;
      this.levelGoal = goalOf(this.level, this.diff.goal);
    };
  }
}

// ---------------- controllers ----------------
function makeCtl(MEG, w, spec, seed) {
  const rng = new MEG.RNG(seed * 7919 + 13), C = MEG.World.CONFIG, K = MEG.World.KINDS;
  const heldR = () => K[(w.held || w.next) - 1].r;
  if (spec.type === 'bot') {
    const bot = new MEG.Bot(w, { skill: spec.skill, seed: seed * 31 + 7, pace: spec.pace == null ? 2 : spec.pace });
    if (spec.ignoreWind) {                       // plans with the no-wind landing (ignores the windsock)
      const ch = bot._choose.bind(bot);
      bot._choose = function () { const f = w.wind.force; w.wind.force = 0; try { return ch(); } finally { w.wind.force = f; } };
    }
    if (spec.waitGust) {                         // wind-wise: re-plans right before letting go
      const st = bot.step.bind(bot);
      bot.step = function (dt) {
        if (this.target !== null && w.canDrop && w.wind.phase === 'gust' && this.sinceDrop >= this.pace) { this.target = this._choose(); w.moveTo(this.target); }
        st(dt);
      };
    }
    return { step: h => bot.step(h), intentX: () => bot.lastPlan ? bot.lastPlan.landX : null };
  }
  if (spec.type === 'kid') {
    // drops every 1.5–4 s, x mostly random with a pull to the middle, ignores wind; tap = quick press/release
    let since = 0, phase = 'wait', gap = rng.range(1.5, 4), hold = 0, tx = 4.5, waitT = 0;
    return {
      step(h) {
        since += h;
        if (phase === 'wait') {
          if (since >= gap && w.canDrop) {
            const r = heldR(), lo = r, hi = C.NEST_W - r;
            tx = rng.chance(0.55) ? lo + (hi - lo) * (rng.next() + rng.next()) / 2 : rng.range(lo, hi);
            w.moveTo(tx); phase = 'press'; hold = spec.tap ? rng.range(0.08, 0.25) : 9; waitT = 0;
          }
        } else {
          waitT += h;
          const m = w.mossy, arrived = Math.abs(m.x - m.tx) < 0.1;
          if (spec.tap && !spec.tapfix ? waitT >= hold : (waitT >= (spec.tap ? hold : 0) && (arrived || waitT > 1.5))) {
            w.moveTo(tx);
            if (w.drop()) { since = 0; gap = rng.range(1.5, 4); phase = 'wait'; }
          }
        }
      }, intentX: () => tx
    };
  }
  if (spec.type === 'spam') {
    let flip = 0, tx = 4.5;
    return {
      step() {
        if (!w.canDrop) return;
        const r = heldR();
        if (spec.mode === 'center') tx = 4.5;
        else if (spec.mode === 'wallL') tx = r;
        else tx = flip ? C.NEST_W - r : r;
        w.moveTo(tx);
        const m = w.mossy;
        if (spec.wait && Math.abs(m.x - m.tx) > 0.05) return;     // alternating with full control
        if (w.drop()) flip ^= 1;
      }, intentX: () => tx
    };
  }
  throw new Error('spec');
}

// ---------------- one game ----------------
function play(MEG, spec, diff, seed, maxT, patch) {
  const w = new MEG.World({ seed, difficulty: diff });
  const ctl = makeCtl(MEG, w, Object.assign({ tapfix: !!(patch && patch.TAPFIX) }, spec), seed);
  const C = MEG.World.CONFIG, H = 1 / 60;
  const r = { lv: [0], firstMerge: null, firstMergeDrop: null, warns: 0, firstWarnT: null, firstWarnDrop: null, rescues: [],
    bad: 0, maxOverlap: 0, stuckFalling: 0, missedMerge: 0, spawnOverlap: 0, maxTop: 0, drops: [], gameOverT: null };
  const pending = new Map();   // egg id → drop record
  let touchPairs = new Map(), frame = 0; const stuck = new Set(), kindOf = new Map();
  while (w.phase === 'play' && w.time < maxT) {
    ctl.step(H);
    const before = w.drops;
    w.update(H);
    if (w.drops > before) { /* recorded via events */ }
    for (const e of w.drainEvents()) {
      if (e.type === 'drop') {
        const egg = w.eggs[w.eggs.length - 1]; kindOf.set(egg.id, egg.kind);
        // spawn overlap: the new egg starts inside the pile (pile reached Mossy's claws)
        for (const o of w.eggs) if (o !== egg && Math.hypot(o.x - egg.x, o.y - egg.y) < o.r + egg.r - 0.05) { r.spawnOverlap++; break; }
        const rec = { t: w.time, x: e.x, kind: e.kind, force: w.wind.force, phase: w.wind.phase, intent: ctl.intentX(), landX: null, merged: false };
        pending.set(egg.id, rec); r.drops.push(rec);
      } else if (e.type === 'land') { const rec = pending.get(e.id); if (rec) rec.landX = e.x; }
      else if (e.type === 'merge' || e.type === 'hatch') {
        if (e.type === 'merge') kindOf.set(e.id, e.kind);
        if (r.firstMerge === null) { r.firstMerge = w.time; r.firstMergeDrop = w.drops; }
      } else if (e.type === 'levelUp') r.lv.push(w.time);
      else if (e.type === 'warnOn') { r.warns++; if (r.firstWarnT === null) { r.firstWarnT = w.time; r.firstWarnDrop = w.drops; } }
      else if (e.type === 'rescue') {
        const maxK = Math.max(0, ...w.eggs.map(q => q.kind));
        const gone = e.ids.map(id => kindOf.get(id) || 0), goneMax = Math.max(...gone);
        r.rescues.push({ t: w.time, drops: w.drops, n: e.ids.length, keptMax: maxK, goneMax, gone, score: w.score });
      } else if (e.type === 'gameOver') r.gameOverT = w.time;
    }
    // a drop "merged" if its egg id vanished by merging within 2 s of the drop
    if (pending.size) {
      const alive = new Set(w.eggs.map(q => q.id));
      for (const [id, rec] of pending) {
        if (!alive.has(id)) { rec.merged = w.time - rec.t < 2; pending.delete(id); }
        else if (w.time - rec.t > 2) pending.delete(id);
      }
    }
    // physics oddities (every 3rd frame)
    if (++frame % 3 === 0) {
      const eg = w.eggs, n = eg.length, nt = new Map();
      for (let i = 0; i < n; i++) {
        const a = eg[i];
        if (!(a.x >= a.r - 1e-6 && a.x <= C.NEST_W - a.r + 1e-6 && a.y >= a.r - 1e-6) || a.x !== a.x || a.y !== a.y) r.bad++;
        if (a.falling && a.age > 2.5 && !stuck.has(a.id)) { r.stuckFalling++; stuck.add(a.id); }
        if (!a.falling && a.y + a.r > r.maxTop) r.maxTop = a.y + a.r;
        for (let j = i + 1; j < n; j++) {
          const b = eg[j], d = Math.hypot(b.x - a.x, b.y - a.y), ov = a.r + b.r - d;
          if (a.born > 0.5 && b.born > 0.5 && !a.falling && !b.falling && ov > r.maxOverlap) r.maxOverlap = ov;
          if (a.kind === b.kind && ov > 0.002) {
            const key = a.id * 100000 + b.id, c = (touchPairs.get(key) || 0) + 1; nt.set(key, c);
            if (c === 3) r.missedMerge++;          // touching twins still unmerged 3 checks (≥ 0.1 s) later
          }
        }
      }
      touchPairs = nt;
    }
  }
  const seasons = []; for (let i = 1; i < r.lv.length; i++) seasons.push(r.lv[i] - r.lv[i - 1]);
  return { t: w.time, over: w.phase === 'over', drops: w.drops, score: w.score, level: w.level, maxKind: w.maxKind, hatches: w.stats.hatches,
    seasons, firstMerge: r.firstMerge, firstMergeDrop: r.firstMergeDrop, warns: r.warns, firstWarnT: r.firstWarnT, firstWarnDrop: r.firstWarnDrop,
    rescues: r.rescues, gameOverT: r.gameOverT, bad: r.bad, maxOverlap: r.maxOverlap, stuckFalling: r.stuckFalling, missedMerge: r.missedMerge,
    spawnOverlap: r.spawnOverlap, maxTop: r.maxTop,
    dropStats: summarizeDrops(r.drops) };
}
function summarizeDrops(ds) {
  // gust drops vs calm drops: |landX − intended landing| and merge-within-2 s rate
  const g = { n: 0, dx: 0, m: 0 }, c = { n: 0, dx: 0, m: 0 };
  for (const d of ds) {
    if (d.landX == null || d.intent == null) continue;
    const o = Math.abs(d.force) > 0.5 ? g : c;
    o.n++; o.dx += Math.abs(d.landX - d.intent); o.m += d.merged ? 1 : 0;
  }
  return { g, c };
}

// settle / jitter test: play a bot to k drops, stop dropping, measure drift + speed after 3 s of quiet
function settle(MEG, seed, k) {
  const w = new MEG.World({ seed, difficulty: 'normal' }), bot = new MEG.Bot(w, { skill: 0.6, seed, pace: 1.2 }), H = 1 / 60;
  while (w.phase === 'play' && w.drops < k && w.time < 600) { bot.step(H); w.update(H); }
  for (let i = 0; i < 180; i++) w.update(H);                       // 3 s quiet
  const p0 = new Map(w.eggs.map(e => [e.id, [e.x, e.y]]));
  let vmax = 0;
  for (let i = 0; i < 300; i++) { w.update(H); for (const e of w.eggs) vmax = Math.max(vmax, Math.hypot(e.vx, e.vy)); }   // 5 s more
  let drift = 0; for (const e of w.eggs) { const p = p0.get(e.id); if (p) drift = Math.max(drift, Math.hypot(e.x - p[0], e.y - p[1])); }
  return { n: w.eggs.length, drift, vmax, phase: w.phase };
}

// ---------------- job runner ----------------
function runJob(job) {
  const { load } = require(path.join(__dirname, '..', 'unit', 'load'));
  const MEG = load(['rng.js', 'world.js', 'bot.js']);
  const patch = PATCHES[job.patch || 'none'];
  applyPatch(MEG, patch);
  const out = [];
  if (job.settle) { for (let s = 0; s < job.n; s++) out.push(settle(MEG, 5000 + s, job.k)); return out; }
  for (let s = 0; s < job.n; s++) out.push(play(MEG, job.spec, job.diff, job.seed0 + s, job.max, patch));
  return out;
}

if (!isMainThread) { parentPort.postMessage(runJob(workerData)); return; }

// ---------------- main ----------------
const arg = (k, d) => { const a = process.argv.find(s => s.startsWith('--' + k + '=')); return a ? a.split('=')[1] : d; };
const N = +arg('n', 24), MAX = +arg('max', 1500), SUITE = arg('suite', 'all'), WORKERS = +arg('workers', 2);
const PATCH_LIST = arg('patch', 'none').split(',');
const out = s => process.stdout.write(s + '\n');
const mean = a => a.length ? a.reduce((s, v) => s + v, 0) / a.length : NaN;
const q = (a, p) => { if (!a.length) return NaN; const b = a.slice().sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const f = (v, d) => (v == null || isNaN(v)) ? '—' : v.toFixed(d || 0);

function runPool(jobs) {
  return new Promise(res => {
    const results = new Array(jobs.length); let next = 0, done = 0;
    const launch = () => {
      if (next >= jobs.length) return;
      const i = next++, wk = new Worker(__filename, { workerData: jobs[i] });
      wk.on('message', m => { results[i] = m; }); wk.on('error', e => { console.error(e); results[i] = []; });
      wk.on('exit', () => { done++; if (done === jobs.length) res(results); else launch(); });
    };
    for (let k = 0; k < Math.min(WORKERS, jobs.length); k++) launch();
  });
}
// split each row into chunks so both cores stay busy
function rowJobs(label, spec, diff, patch, n, seed0) {
  const per = Math.ceil(n / 4), js = [];
  for (let s = 0; s < n; s += per) js.push({ label, spec, diff, patch, n: Math.min(per, n - s), seed0: seed0 + s, max: MAX });
  return js;
}

function rowLine(label, diff, patch, rs) {
  const reach = [1, 2, 3].map(z => rs.filter(r => r.level >= z).length);
  const per = [0, 1, 2].map(i => q(rs.filter(r => r.seasons.length > i).map(r => r.seasons[i]), 0.5));
  const sc = rs.map(r => r.score), t = rs.map(r => r.t), drops = rs.map(r => r.drops);
  const fm = rs.filter(r => r.firstMerge != null).map(r => r.firstMerge);
  const fw = rs.map(r => r.firstWarnDrop == null ? r.drops : r.firstWarnDrop);
  const resc = rs.reduce((s, r) => s + r.rescues.length, 0);
  const capped = rs.filter(r => !r.over).length;
  return `| ${label} | ${diff} | ${patch} | ${f(q(t, 0.1))} / ${f(q(t, 0.5))} / ${f(q(t, 0.9))}${capped ? ` (${capped} capped)` : ''} | ${f(q(drops, 0.5))} | ` +
    `${f(q(sc, 0.1))} / ${f(q(sc, 0.5))} / ${f(q(sc, 0.9))} | ${f(q(fm, 0.5), 1)} | ${per.map(v => f(v)).join(' / ')} | ${reach.join('/')} of ${rs.length} | ` +
    `${f(mean(rs.map(r => r.warns)), 1)} | ${f(q(fw, 0.5))} (min ${Math.min(...fw)}) | ${f(resc / rs.length, 2)} |`;
}
const HEAD = '| player | diff | patch | game s p10/p50/p90 | drops p50 | score p10/p50/p90 | 1st merge s | s per season spring/summer/autumn | reached Su/A/W | warns/game | drops to 1st warn p50 | rescues/game |\n|---|---|---|---|---|---|---|---|---|---|---|---|';

const SPECS = {
  'bot1': { type: 'bot', skill: 1 }, 'bot0.8': { type: 'bot', skill: 0.8 }, 'bot0.5': { type: 'bot', skill: 0.5 }, 'bot0.2': { type: 'bot', skill: 0.2 },
  'kid-tap': { type: 'kid', tap: true }, 'kid-drag': { type: 'kid', tap: false },
  'adult-casual': { type: 'bot', skill: 0.85, ignoreWind: true, pace: 2.2 },
  'adult-aware': { type: 'bot', skill: 0.85, pace: 2.2 },
  'ignorer1': { type: 'bot', skill: 1, ignoreWind: true }, 'aware1': { type: 'bot', skill: 1 }, 'wise1': { type: 'bot', skill: 1, waitGust: true },
  'spam-center': { type: 'spam', mode: 'center' }, 'spam-wall': { type: 'spam', mode: 'wallL' },
  'spam-alt': { type: 'spam', mode: 'alt' }, 'spam-alt-aim': { type: 'spam', mode: 'alt', wait: true },
  'bot1-fast': { type: 'bot', skill: 1, pace: 0 },
};

(async () => {
  const t0 = Date.now();
  const rows = [];
  const add = (label, diffs, patches) => { for (const d of diffs) for (const p of patches) rows.push({ label, diff: d, patch: p }); };
  const D3 = ['easy', 'normal', 'hard'];
  if (SUITE === 'all' || SUITE === 'bots') for (const l of ['bot1', 'bot0.8', 'bot0.5', 'bot0.2']) add(l, D3, PATCH_LIST);
  if (SUITE === 'all' || SUITE === 'humans') { add('kid-tap', ['easy', 'normal'], PATCH_LIST); add('kid-drag', ['easy', 'normal'], PATCH_LIST); add('adult-casual', D3, PATCH_LIST); add('adult-aware', D3, PATCH_LIST); }
  if (SUITE === 'all' || SUITE === 'spam') for (const l of ['spam-center', 'spam-wall', 'spam-alt', 'spam-alt-aim', 'bot1-fast']) add(l, ['easy', 'normal'], PATCH_LIST);
  if (SUITE === 'all' || SUITE === 'wind') { for (const l of ['ignorer1', 'aware1', 'wise1']) add(l, ['normal', 'hard'], PATCH_LIST); for (const l of ['ignorer1', 'aware1', 'kid-tap']) add(l, ['normal', 'easy'], ['nowind']); }
  if (SUITE === 'patch') { for (const l of (arg('players', 'kid-tap,kid-drag,adult-casual,bot0.5,bot1')).split(',')) add(l, (arg('diffs', 'easy,normal')).split(','), PATCH_LIST); }

  const jobs = [], idx = [];
  rows.forEach((row, ri) => { for (const j of rowJobs(row.label, SPECS[row.label], row.diff, row.patch, N, 1000)) { jobs.push(j); idx.push(ri); } });
  if (SUITE === 'all' || SUITE === 'physics') for (const k of [15, 30, 45, 60]) { jobs.push({ settle: true, n: 10, k }); idx.push(-k); }
  const res = await runPool(jobs);
  const per = rows.map(() => []), settleRes = {};
  res.forEach((r, i) => { if (idx[i] >= 0) per[idx[i]].push(...r); else settleRes[-idx[i]] = r; });

  if (rows.length) {
    out(`Mossy's Egg Grove deep playtest — ${N} games per row, cap ${MAX} s, frame 1/60 s\n`);
    out(HEAD);
    rows.forEach((row, i) => out(rowLine(row.label, row.diff, row.patch, per[i])));
    // wind effect detail
    out('\n| player | diff | patch | gust drops % | |Δx| land vs intent: calm / gust (u) | merge≤2 s rate: calm / gust |\n|---|---|---|---|---|---|');
    rows.forEach((row, i) => {
      const g = { n: 0, dx: 0, m: 0 }, c = { n: 0, dx: 0, m: 0 };
      for (const r of per[i]) for (const k of ['n', 'dx', 'm']) { g[k] += r.dropStats.g[k]; c[k] += r.dropStats.c[k]; }
      out(`| ${row.label} | ${row.diff} | ${row.patch} | ${f(100 * g.n / (g.n + c.n))} | ${f(c.dx / c.n, 2)} / ${f(g.dx / g.n, 2)} | ${f(100 * c.m / c.n)} % / ${f(100 * g.m / g.n)} % |`);
    });
    // rescues + physics oddities
    out('\n| player | diff | patch | rescues | drops survived after 1st rescue p50 | s from last rescue to game over p50 | rescue removed the biggest egg % | removed kinds p50 (max) | bad | max overlap u | stuck-falling | missed merges | spawn overlaps | max pile top u | games pile > wall 11.2 / > 13.5 |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    rows.forEach((row, i) => {
      const rs = per[i], R = rs.filter(r => r.rescues.length);
      const after = R.map(r => r.drops - r.rescues[0].drops);
      const toOver = rs.filter(r => r.rescues.length && r.gameOverT != null).map(r => r.gameOverT - r.rescues[r.rescues.length - 1].t);
      const sum = k => rs.reduce((s, r) => s + r[k], 0);
      const all = [].concat(...rs.map(r => r.rescues)), big = all.filter(x => x.goneMax >= x.keptMax).length, gk = [].concat(...all.map(x => x.gone));
      out(`| ${row.label} | ${row.diff} | ${row.patch} | ${rs.reduce((s, r) => s + r.rescues.length, 0)} | ${f(q(after, 0.5))} | ${f(q(toOver, 0.5))} | ${all.length ? f(100 * big / all.length) : '—'} | ${f(q(gk, 0.5))} (${gk.length ? Math.max(...gk) : '—'}) | ${sum('bad')} | ` +
        `${f(Math.max(...rs.map(r => r.maxOverlap)), 3)} | ${sum('stuckFalling')} | ${sum('missedMerge')} | ${sum('spawnOverlap')} | ${f(Math.max(...rs.map(r => r.maxTop)), 2)} | ${rs.filter(r => r.maxTop > 11.2).length} / ${rs.filter(r => r.maxTop > 13.5).length} |`);
    });
  }
  if (Object.keys(settleRes).length) {
    out('\nSettle test (Normal, bot 0.6 to k drops, then 3 s quiet, then measure 5 s):\n| k drops | piles | eggs p50 | max drift in 5 s (u) | max speed (u/s) |\n|---|---|---|---|---|');
    for (const k of Object.keys(settleRes)) {
      const s = settleRes[k].filter(x => x.phase === 'play');
      out(`| ${k} | ${s.length} | ${f(q(s.map(x => x.n), 0.5))} | ${f(Math.max(...s.map(x => x.drift)), 4)} | ${f(Math.max(...s.map(x => x.vmax)), 3)} |`);
    }
  }
  out(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s, ${jobs.length} jobs)`);
})();
