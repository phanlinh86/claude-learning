#!/usr/bin/env node
// Bao's Arctic Reel — high-speed headless playtest (world + player models, no browser).
// Run from projects/daily-game/panda-arctic-reel:
//   node tests/sim/run.js matrix  [--n 150] [--min 10] [--variant base|proposal]   every player × difficulty
//   node tests/sim/run.js kid1    [--n 1000] [--variant …]                         kid's zone 1 on every difficulty
//   node tests/sim/run.js loops   [--n 40]  [--variant …]                          zone pacing over 3 loops
//   node tests/sim/run.js compare [--n 300]                                        base vs proposal on the key cases
//   node tests/sim/run.js patch                                                     writes results/proposal.patch
// Options: --set '{"difficulty.hard.needleZone":0.06}' (CONFIG override in the vm), --size 560x1212, --only 'easy:kid,adult',
//          --kid '{"doubleTap":0}' (kid profile override), --tag name, --json (also dump every round).
// Results: tests/sim/results/<suite>-<variant>[-tag].md (+ .json with --json). Game code is never modified on disk:
// the proposal is applied to world.js's source text in memory before it is loaded into the vm.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { execFileSync } = require('child_process');
const players = require('./players');

const ROOT = path.join(__dirname, '..', '..');
const JS = path.join(ROOT, 'game', 'js');
const OUT = path.join(__dirname, 'results');

// ------------------------------------------------------------------ the proposal (exact edits to world.js)
// Each edit replaces one exact, unique snippet. `node tests/sim/run.js patch` turns them into a git patch.
// Why: docs/reports/playtest.md §6. Only the late-zone reel ramp of Normal and Hard changes; Easy is untouched.
const PROPOSAL = [
  { old: "        reelWidth: 0.30, reelWidthZone: 0.025, reelWidthMin: 0.20,\n",
    new: "        reelWidth: 0.30, reelWidthZone: 0.02, reelWidthMin: 0.20,   // playtest: green shrinks a bit slower per zone\n" },
  { old: "        needle: 0.65, needleZone: 0.07,\n",
    new: "        needle: 0.65, needleZone: 0.05,   // playtest: aurora/loop needle was the main cause of late escapes\n" },
  { old: "        reelWidth: 0.24, reelWidthZone: 0.025, reelWidthMin: 0.15,\n",
    new: "        reelWidth: 0.24, reelWidthZone: 0.02, reelWidthMin: 0.17,   // playtest: 0.15 at loop speed was a coin flip\n" },
  { old: "        needle: 0.85, needleZone: 0.09,\n",
    new: "        needle: 0.85, needleZone: 0.06,   // playtest: aurora/loop needle was the main cause of late escapes\n" },
];

function worldSource(variant) {
  let src = fs.readFileSync(path.join(JS, 'world.js'), 'utf8');
  if (variant === 'proposal') for (const e of PROPOSAL) {
    const n = src.split(e.old).length - 1;
    if (n !== 1) throw new Error('proposal edit not unique (' + n + '): ' + e.old.slice(0, 60));
    src = src.replace(e.old, () => e.new);
  }
  return src;
}

/** Apply {"difficulty.hard.needleZone": 0.07, "goldSpeed": 1.4} to PR.CONFIG inside the vm (not the file). */
function applySet(PR, set) {
  for (const k in set || {}) {
    const ks = k.split('.'); let o = PR.CONFIG;
    for (let i = 0; i < ks.length - 1; i++) o = o[ks[i]];
    o[ks[ks.length - 1]] = set[k];
  }
}

function loadPR(variant) {   // same as tests/unit/load.js, with world.js optionally patched in memory
  const sandbox = { console };           // own Math in the context (scripts cache it as `var M = Math`)
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const f of ['rng.js', 'world.js', 'bot.js']) {
    const src = f === 'world.js' ? worldSource(variant) : fs.readFileSync(path.join(JS, f), 'utf8');
    vm.runInContext(src, sandbox, { filename: f });
  }
  return sandbox.PR;
}

// ------------------------------------------------------------------ one round
function playRound(PR, job) {
  const w = new PR.World({ seed: job.seed, difficulty: job.diff, width: job.width || 960, height: job.height || 540 });
  const p = players.make(job.player, PR, w, Object.assign({ seed: job.seed * 7 + 3 }, job.opts || {}));
  const dt = 1 / 60, maxT = job.maxTime;
  const lv = [];                        // per-level counters
  const L = i => lv[i] || (lv[i] = { t: 0, hooks: 0, catches: 0, escapes: 0, snaps: 0, goldSpawn: 0, goldHook: 0, goldCatch: 0, goldEsc: 0,
    perfect: 0, good: 0, slip: 0, reelT: 0, reels: 0, livesLost: 0 });
  const snaps = [];
  let t = 0, firstGem = null, reelStart = -1, reelItem = null, lastLineAt = 0, prevVy = 0, prevHold = false;
  while (t < maxT && w.phase !== 'over' && w.level < (job.maxLevel || 1e9)) {
    p.step(dt);
    prevVy = w.hook.vy; prevHold = w.hook.holding;
    const lev = w.level;
    w.update(dt); t += dt;
    L(lev).t += dt;
    for (const e of w.drainEvents()) {
      const c = L(lev);
      switch (e.type) {
        case 'hook': c.hooks++; reelStart = t; reelItem = e.item; if (e.item.type === 'gold') c.goldHook++; break;
        case 'reelGood': if (e.perfect) c.perfect++; else c.good++; break;
        case 'reelSlip': c.slip++; break;
        case 'catch': c.catches++; c.reels++; c.reelT += t - reelStart; if (e.item && e.item.type === 'gold') c.goldCatch++; if (firstGem === null) firstGem = t; break;
        case 'escape': c.escapes++; c.reels++; c.reelT += t - reelStart; if (e.item && e.item.type === 'gold') c.goldEsc++; break;
        case 'golden': c.goldSpawn++; break;
        case 'puff': {
          c.snaps++;
          const s = p.puf && p.puf.get(e.item.id);
          const motion = Math.abs(prevVy) < 25 ? 'parked' : prevVy > 0 ? 'sinking' : 'rising';
          snaps.push({ level: lev, t, motion, ignored: !!(s && s.ignored), unseen: !!(s && !s.ignored && t < s.seenAt),
            freshLine: t - lastLineAt < 4, held: prevHold });
          lastLineAt = t + 1.0;
          break;
        }
      }
    }
  }
  const d = w.stats;
  return { player: job.label || job.player, diff: job.diff, seed: job.seed, time: t, over: w.phase === 'over', level: w.level, score: w.score,
    gems: w.totalGems, firstGem, zoneTimes: d.zoneTimes, lv, snaps, perfect: d.perfect, good: d.good, slip: d.slip,
    taps: (p.stats && p.stats.taps) || 0 };
}

// ------------------------------------------------------------------ job lists
const DIFFS = ['easy', 'normal', 'hard'];
const MODELS = [
  { label: 'bot 0.30', player: 'bot', opts: { skill: 0.3 } },
  { label: 'bot 0.50', player: 'bot', opts: { skill: 0.5 } },
  { label: 'bot 0.75', player: 'bot', opts: { skill: 0.75 } },
  { label: 'bot 0.95', player: 'bot', opts: { skill: 0.95 } },
  { label: 'kid', player: 'kid' },
  { label: 'adult', player: 'adult' },
  { label: 'spam', player: 'spam' },
  { label: 'spamReel', player: 'spamReel' },
  { label: 'kidMash', player: 'kidMash' },
  { label: 'camper 0 (never press)', player: 'camper', opts: { depth: 0 } },
  { label: 'camper 0.15', player: 'camper', opts: { depth: 0.15 } },
  { label: 'camper 0.30', player: 'camper', opts: { depth: 0.3 } },
  { label: 'camper 0.55', player: 'camper', opts: { depth: 0.55 } },
  { label: 'camper 1 (hold forever)', player: 'camper', opts: { depth: 1 } },
];

function jobs(suite, a) {
  const J = [];
  if (suite === 'matrix') for (const m of MODELS) for (const diff of DIFFS) for (let s = 1; s <= a.n; s++)
    J.push(Object.assign({}, m, { diff, seed: s, maxTime: a.min * 60 }));
  if (suite === 'kid1') for (const m of [MODELS[4], MODELS[5], MODELS[1]]) for (const diff of DIFFS) for (let s = 1; s <= a.n; s++)
    J.push(Object.assign({}, m, { diff, seed: 1000 + s, maxTime: 600, maxLevel: 1 }));
  if (suite === 'loops') for (const m of [MODELS[3], MODELS[2], MODELS[5], MODELS[4]]) for (const diff of DIFFS) for (let s = 1; s <= a.n; s++)
    J.push(Object.assign({}, m, { diff, seed: 5000 + s, maxTime: 40 * 60, maxLevel: 12 }));
  return J;
}

// ------------------------------------------------------------------ summaries
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const pct = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const f0 = v => isFinite(v) ? v.toFixed(0) : '–', f1 = v => isFinite(v) ? v.toFixed(1) : '–', f2 = v => isFinite(v) ? v.toFixed(2) : '–';
function sumLv(rs, from, to) {
  const z = { t: 0, hooks: 0, catches: 0, escapes: 0, snaps: 0, goldSpawn: 0, goldHook: 0, goldCatch: 0, goldEsc: 0, perfect: 0, good: 0, slip: 0, reelT: 0, reels: 0 };
  for (const r of rs) r.lv.forEach((c, i) => { if (c && i >= from && i <= to) for (const k in z) z[k] += c[k]; });
  return z;
}
function group(recs) { const g = new Map(); for (const r of recs) { const k = r.player + '|' + r.diff; if (!g.has(k)) g.set(k, []); g.get(k).push(r); } return g; }

function matrixTable(recs, minutes) {
  const rows = ['| player | diff | rounds | game over | survived min (median) | zones reached (mean) | score p10 / p50 / p90 | first gem s (median) | zone-1 s (median) | zone s, zones 1–4 (mean) | gems/min | escapes/zone | snaps/zone | taps/catch | Perfect % |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const [k, rs] of group(recs)) {
    const [pl, diff] = k.split('|');
    const z = sumLv(rs, 0, 99), zones = rs.reduce((s, r) => s + r.level, 0);
    const zt1 = rs.filter(r => r.zoneTimes.length).map(r => r.zoneTimes[0]);
    const zt = [].concat(...rs.map(r => r.zoneTimes.slice(0, 4)));
    const fg = rs.map(r => r.firstGem == null ? Infinity : r.firstGem);
    const sc = rs.map(r => r.score), tt = rs.reduce((s, r) => s + r.time, 0);
    const zDen = Math.max(1, zones + rs.length);     // zones played (cleared + the one in progress)
    rows.push(`| ${pl} | ${diff} | ${rs.length} | ${f0(100 * rs.filter(r => r.over).length / rs.length)}% | ${f1(pct(rs.map(r => r.time / 60), 0.5))} | ${f1(zones / rs.length)} | ${f0(pct(sc, 0.1))} / ${f0(pct(sc, 0.5))} / ${f0(pct(sc, 0.9))} | ${f0(pct(fg, 0.5))} | ${f0(pct(zt1, 0.5))} (${zt1.length}/${rs.length}) | ${f0(mean(zt))} | ${f1(z.catches / (tt / 60))} | ${f2(z.escapes / zDen)} | ${f2(z.snaps / zDen)} | ${f1((z.perfect + z.good + z.slip) / Math.max(1, z.catches))} | ${f0(100 * z.perfect / Math.max(1, z.perfect + z.good + z.slip))} |`);
  }
  return rows.join('\n');
}

function reelTable(recs) {   // how the reel meter is beaten: catches per hook, seconds per reel
  const rows = ['| player | diff | hooks | catch / hook | escape / hook | s per reel | taps per landed gem | slips per tap |', '|---|---|---|---|---|---|---|---|'];
  for (const [k, rs] of group(recs)) {
    const [pl, diff] = k.split('|'), z = sumLv(rs, 0, 99), taps = z.perfect + z.good + z.slip;
    rows.push(`| ${pl} | ${diff} | ${z.hooks} | ${f0(100 * z.catches / Math.max(1, z.hooks))}% | ${f0(100 * z.escapes / Math.max(1, z.hooks))}% | ${f2(z.reelT / Math.max(1, z.reels))} | ${f1(taps / Math.max(1, z.catches))} | ${f0(100 * z.slip / Math.max(1, taps))}% |`);
  }
  return rows.join('\n');
}

function goldTable(recs) {
  const rows = ['| player | diff | golden spawned / zone | hooked / spawned | caught / hooked | caught / spawned | gold share of score |', '|---|---|---|---|---|---|---|'];
  for (const [k, rs] of group(recs)) {
    const [pl, diff] = k.split('|'), z = sumLv(rs, 0, 99), zones = rs.reduce((s, r) => s + r.level + 1, 0), score = rs.reduce((s, r) => s + r.score, 0);
    rows.push(`| ${pl} | ${diff} | ${f2(z.goldSpawn / zones)} | ${f0(100 * z.goldHook / Math.max(1, z.goldSpawn))}% | ${f0(100 * z.goldCatch / Math.max(1, z.goldHook))}% | ${f0(100 * z.goldCatch / Math.max(1, z.goldSpawn))}% | ${f0(100 * z.goldCatch * 50 / Math.max(1, score))}% |`);
  }
  return rows.join('\n');
}

function causeTable(recs) {
  const rows = ['| player | diff | snaps | sinking into it | rising into it | parked | ignored puffer (kid) | within 4 s of a new line | game-over level (median) |', '|---|---|---|---|---|---|---|---|---|'];
  for (const [k, rs] of group(recs)) {
    const [pl, diff] = k.split('|'), S = [].concat(...rs.map(r => r.snaps)); if (!S.length) continue;
    const c = f => f0(100 * S.filter(f).length / S.length) + '%';
    const ol = rs.filter(r => r.over).map(r => r.level + 1);
    rows.push(`| ${pl} | ${diff} | ${S.length} | ${c(s => s.motion === 'sinking')} | ${c(s => s.motion === 'rising')} | ${c(s => s.motion === 'parked')} | ${c(s => s.ignored)} | ${c(s => s.freshLine)} | ${ol.length ? f0(pct(ol, 0.5)) : '–'} |`);
  }
  return rows.join('\n');
}

function kid1Table(recs) {
  const rows = ['| player | diff | rounds | clears zone 1 | zone-1 s p25 / p50 / p75 / p90 | ≤ 90 s | loses all 3 lines in zone 1 | lines lost in zone 1 (mean) | escapes in zone 1 (mean) | first gem s (median) |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [k, rs] of group(recs)) {
    const [pl, diff] = k.split('|');
    const cl = rs.filter(r => r.zoneTimes.length).map(r => r.zoneTimes[0]);
    const z = sumLv(rs, 0, 0), fg = rs.map(r => r.firstGem == null ? Infinity : r.firstGem);
    rows.push(`| ${pl} | ${diff} | ${rs.length} | ${f1(100 * cl.length / rs.length)}% | ${f0(pct(cl, 0.25))} / ${f0(pct(cl, 0.5))} / ${f0(pct(cl, 0.75))} / ${f0(pct(cl, 0.9))} | ${f0(100 * cl.filter(x => x <= 90).length / rs.length)}% | ${f1(100 * rs.filter(r => r.over && r.level === 0).length / rs.length)}% | ${f2(z.snaps / rs.length)} | ${f2(z.escapes / rs.length)} | ${f0(pct(fg, 0.5))} |`);
  }
  return rows.join('\n');
}

function loopsTable(recs) {
  const rows = ['| player | diff | ' + Array.from({ length: 12 }, (_, i) => 'L' + (i + 1)).join(' | ') + ' | reached L12 | game over |', '|---|---|' + '---|'.repeat(14)];
  for (const [k, rs] of group(recs)) {
    const [pl, diff] = k.split('|');
    const cells = [];
    for (let i = 0; i < 12; i++) { const v = rs.filter(r => r.zoneTimes.length > i).map(r => r.zoneTimes[i]); cells.push(v.length >= 3 ? f0(pct(v, 0.5)) + (v.length < rs.length ? '*' : '') : '–'); }
    rows.push(`| ${pl} | ${diff} | ${cells.join(' | ')} | ${f0(100 * rs.filter(r => r.level >= 12).length / rs.length)}% | ${f0(100 * rs.filter(r => r.over).length / rs.length)}% |`);
  }
  rows.push('', 'Median seconds to clear each level (L1–L4 = loop 1, L5–L8 = loop 2, L9–L12 = loop 3). `*` = some rounds ended (game over) before that level.');
  const r2 = ['', '| player | diff | ' + Array.from({ length: 12 }, (_, i) => 'L' + (i + 1)).join(' | ') + ' |', '|---|---|' + '---|'.repeat(12)];
  for (const [k, rs] of group(recs)) {
    const [pl, diff] = k.split('|'), cells = [];
    for (let i = 0; i < 12; i++) { const z = sumLv(rs, i, i), n = rs.filter(r => r.lv[i]).length; cells.push(n ? f2(z.snaps / n) + '/' + f2(z.escapes / n) : '–'); }
    r2.push(`| ${pl} | ${diff} | ${cells.join(' | ')} |`);
  }
  r2.push('', 'Snaps / escapes per level played.');
  return rows.join('\n') + '\n' + r2.join('\n');
}

// ------------------------------------------------------------------ parallel runner
function runJobs(J, variant, set, profile) {
  const nW = Math.max(1, Math.min(os.cpus().length, 8));
  const chunks = Array.from({ length: nW }, () => []);
  J.forEach((j, i) => chunks[i % nW].push(j));
  return Promise.all(chunks.map(ch => new Promise((res, rej) => {
    const wk = new Worker(__filename, { workerData: { jobs: ch, variant, set, profile } });
    wk.on('message', res); wk.on('error', rej);
  }))).then(parts => [].concat(...parts));
}

if (!isMainThread) {
  const PR = loadPR(workerData.variant);
  applySet(PR, workerData.set);
  for (const j of workerData.jobs) if (workerData.profile && (j.player === 'kid' || j.player === 'kidMash')) j.opts = Object.assign({}, j.opts, { profile: workerData.profile });
  parentPort.postMessage(workerData.jobs.map(j => playRound(PR, j)));
} else main();

function args() {
  const a = { suite: process.argv[2] || 'matrix', n: 0, min: 10, variant: 'base', set: null, profile: null, tag: '' };
  for (let i = 3; i < process.argv.length; i++) {
    const k = process.argv[i];
    if (k === '--n') a.n = +process.argv[++i]; else if (k === '--min') a.min = +process.argv[++i]; else if (k === '--variant') a.variant = process.argv[++i];
    else if (k === '--set') a.set = JSON.parse(process.argv[++i]);          // CONFIG overrides inside the vm
    else if (k === '--kid') a.profile = JSON.parse(process.argv[++i]);      // kid profile overrides (analysis)
    else if (k === '--size') { const [W, H] = process.argv[++i].split('x').map(Number); a.width = W; a.height = H; }   // e.g. 560x1212 iPhone portrait
    else if (k === '--json') a.json = true;                                  // also dump every round (large)
    else if (k === '--tag') a.tag = '-' + process.argv[++i];
    else if (k === '--only') a.only = process.argv[++i].split(',');
  }
  return a;
}

async function main() {
  const a = args();
  fs.mkdirSync(OUT, { recursive: true });
  if (a.suite === 'patch') return writePatch();
  const t0 = Date.now();
  let md = '';
  if (a.suite === 'compare') return compare(a);
  a.n = a.n || { matrix: 150, kid1: 1000, loops: 40 }[a.suite];
  let J = jobs(a.suite, a);
  if (a.width) J.forEach(j => { j.width = a.width; j.height = a.height; });
  if (a.only) J = J.filter(j => a.only.includes(j.label) || a.only.includes(j.diff + ':' + j.label));
  const recs = await runJobs(J, a.variant, a.set, a.profile);
  if (a.suite === 'matrix') md = `## matrix (${a.variant}), ${a.n} rounds each, ≤ ${a.min} min\n\n${matrixTable(recs, a.min)}\n\n### reel meter\n\n${reelTable(recs)}\n\n### golden gem\n\n${goldTable(recs)}\n\n### snaps (line lost) by circumstance\n\n${causeTable(recs)}\n`;
  if (a.suite === 'kid1') md = `## zone 1 (${a.variant}), ${a.n} rounds each\n\n${kid1Table(recs)}\n`;
  if (a.suite === 'loops') md = `## loops (${a.variant}), ${a.n} rounds each, ≤ 12 levels / 40 min\n\n${loopsTable(recs)}\n`;
  fs.writeFileSync(path.join(OUT, `${a.suite}-${a.variant}${a.tag}.md`), md);
  if (a.json) fs.writeFileSync(path.join(OUT, `${a.suite}-${a.variant}${a.tag}.json`), JSON.stringify(recs.map(r => Object.assign({}, r, { lv: r.lv.map(c => c && Object.fromEntries(Object.entries(c).map(([k, v]) => [k, Math.round(v * 100) / 100]))) }))));
  console.log(md);
  console.log(`${recs.length} rounds in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}

// ------------------------------------------------------------------ before / after
async function compare(a) {
  const n = a.n || 300;
  const cases = [
    ...['easy', 'normal', 'hard'].map(diff => ({ label: 'kid', player: 'kid', diff })),
    ...['easy', 'normal', 'hard'].map(diff => ({ label: 'adult', player: 'adult', diff })),
    ...['easy', 'normal', 'hard'].map(diff => ({ label: 'spamReel', player: 'spamReel', diff })),
    ...['easy', 'normal'].map(diff => ({ label: 'spam', player: 'spam', diff })),
    ...['easy', 'normal', 'hard'].map(diff => ({ label: 'bot 0.50', player: 'bot', opts: { skill: 0.5 }, diff })),
    ...['easy', 'normal', 'hard'].map(diff => ({ label: 'bot 0.95', player: 'bot', opts: { skill: 0.95 }, diff })),
    ...['easy', 'normal'].map(diff => ({ label: 'camper best', player: 'camper', opts: { depth: 0.15 }, diff })),
  ];
  const J = [];
  for (const c of cases) for (let s = 1; s <= n; s++) J.push(Object.assign({}, c, { seed: 20000 + s, maxTime: 600 }));
  const K = [];
  for (const c of cases.filter(c => c.label === 'kid' || c.label === 'adult')) for (let s = 1; s <= n * 2; s++) K.push(Object.assign({}, c, { seed: 40000 + s, maxTime: 600, maxLevel: 1 }));
  const Lp = [];
  for (const c of [{ label: 'bot 0.95', player: 'bot', opts: { skill: 0.95 } }, { label: 'adult', player: 'adult' }])
    for (const diff of DIFFS) for (let s = 1; s <= 30; s++) Lp.push(Object.assign({}, c, { diff, seed: 60000 + s, maxTime: 2400, maxLevel: 12 }));
  const out = {};
  for (const v of ['base', 'proposal']) out[v] = { m: await runJobs(J, v), k: await runJobs(K, v), l: await runJobs(Lp, v) };
  const row = (rs) => {
    const z = sumLv(rs, 0, 99), zones = rs.reduce((s, r) => s + r.level, 0), tt = rs.reduce((s, r) => s + r.time, 0);
    const zt = [].concat(...rs.map(r => r.zoneTimes.slice(0, 4)));
    return { over: 100 * rs.filter(r => r.over).length / rs.length, zones: zones / rs.length, score: pct(rs.map(r => r.score), 0.5),
      zt: mean(zt), gpm: z.catches / (tt / 60), esc: z.escapes / Math.max(1, zones + rs.length), snaps: z.snaps / Math.max(1, zones + rs.length),
      cph: 100 * z.catches / Math.max(1, z.hooks), spr: z.reelT / Math.max(1, z.reels), gold: 100 * z.goldCatch / Math.max(1, z.goldSpawn) };
  };
  const lines = [`## before → after (${n} rounds per case, 10 min cap)`, '',
    '| player | diff | game over | zones in 10 min | median score | zone s (z1–4) | gems/min | escapes/zone | snaps/zone | catch / hook | s per reel | gold caught / spawned |', '|---|---|---|---|---|---|---|---|---|---|---|---|'];
  const gb = group(out.base.m), gp = group(out.proposal.m);
  for (const [k, rs] of gb) {
    const [pl, diff] = k.split('|'), b = row(rs), p = row(gp.get(k));
    const ab = (x, y, f) => `${f(x)} → **${f(y)}**`;
    lines.push(`| ${pl} | ${diff} | ${ab(b.over, p.over, f0)}% | ${ab(b.zones, p.zones, f1)} | ${ab(b.score, p.score, f0)} | ${ab(b.zt, p.zt, f0)} | ${ab(b.gpm, p.gpm, f1)} | ${ab(b.esc, p.esc, f2)} | ${ab(b.snaps, p.snaps, f2)} | ${ab(b.cph, p.cph, f0)}% | ${ab(b.spr, p.spr, f2)} | ${ab(b.gold, p.gold, f0)}% |`);
  }
  lines.push('', `### zone 1 only (${n * 2} rounds per case)`, '', '#### base', '', kid1Table(out.base.k), '', '#### proposal', '', kid1Table(out.proposal.k));
  lines.push('', '### loops (30 rounds per case, ≤ 12 levels)', '', '#### base', '', loopsTable(out.base.l), '', '#### proposal', '', loopsTable(out.proposal.l));
  const md = lines.join('\n') + '\n';
  fs.writeFileSync(path.join(OUT, 'compare.md'), md);
  console.log(md);
}

function writePatch() {
  const tmp = fs.mkdtempSync(path.join(OUT, '.tmp-'));
  const a = path.join(tmp, 'a'), b = path.join(tmp, 'b');
  fs.mkdirSync(a); fs.mkdirSync(b);
  fs.writeFileSync(path.join(a, 'world.js'), worldSource('base'));
  fs.writeFileSync(path.join(b, 'world.js'), worldSource('proposal'));
  let diff = '';
  try { diff = execFileSync('diff', ['-u', 'a/world.js', 'b/world.js'], { cwd: tmp }).toString(); }
  catch (e) { diff = e.stdout.toString(); }   // diff exits 1 when files differ
  const rel = 'projects/daily-game/panda-arctic-reel/game/js/world.js';
  diff = diff.replace(/^--- a\/world\.js.*$/m, '--- a/' + rel).replace(/^\+\+\+ b\/world\.js.*$/m, '+++ b/' + rel);
  diff = 'diff --git a/' + rel + ' b/' + rel + '\n' + diff;
  fs.writeFileSync(path.join(OUT, 'proposal.patch'), diff);
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(diff);
}
