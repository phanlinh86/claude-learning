#!/usr/bin/env node
// Mầm's Treasure Reef — high-speed headless playtest (report-only; never edits game code).
//
//   node tests/sim/playtest.js                 default matrix: 7 models × ages 3–7 × 6 lagoons × 2 viewports × 3 seeds (< 4 min)
//   node tests/sim/playtest.js --quick         7 models × ages 3–7 × lagoons 1,4 × 2 viewports × 1 seed (< 60 s)
//   node tests/sim/playtest.js --full          20 seeds per viewport (8400 sessions, ≈ 30 min on 2 cores)
//   node tests/sim/playtest.js --seeds 5 --models typical,slow3 --ages 3,4 --lagoons 1,2,3 --lang vi
//   node tests/sim/playtest.js --config '{"tapTime":1.0}' --name prop        world config overrides (opts.config)
//   node tests/sim/playtest.js --no-proposal   skip the before/after re-simulation of the recommended changes
//   node tests/sim/playtest.js --dig-extra 1   content experiment: later dig rounds ask for one more target (sim-side patch)
//
// Prints a markdown summary (also saved to tests/sim/out/<name>.md + .json). Child models and metrics: ./lib.js.
'use strict';
const path = require('path');
const fs = require('fs');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const L = require('./lib');

/* ------------------------------------------------------------------ worker */
if (!isMainThread) {
  const out = workerData.tasks.map(t => { const r = L.runSession(t); delete r.log; return r; });
  parentPort.postMessage(out);
  return;
}

/* ------------------------------------------------------------------ CLI */
const argv = process.argv.slice(2);
const flag = n => argv.includes('--' + n);
const opt = (n, d) => { const i = argv.indexOf('--' + n); return i >= 0 && argv[i + 1] !== undefined ? argv[i + 1] : d; };
const quick = flag('quick'), full = flag('full');
const seeds = +opt('seeds', quick ? 1 : full ? 20 : 3);
const models = opt('models', L.MODEL_NAMES.join(',')).split(',');
const ages = opt('ages', '3,4,5,6,7').split(',').map(Number);
const lagoons = opt('lagoons', quick ? '1,4' : '1,2,3,4,5,6').split(',').map(Number);
const vps = opt('vps', 'land,port').split(',');
const lang = opt('lang', 'en');
const config = JSON.parse(opt('config', '{}'));
const name = opt('name', quick ? 'quick' : full ? 'full' : 'base');
const withProposal = !flag('no-proposal') && !opt('config', null);
const threads = Math.max(1, +opt('threads', Math.min(4, os.cpus().length)));

/* The recommended CONFIG changes (see docs/reports/playtest_report.md); re-simulated below as before/after. */
const PROPOSAL = {
  tapTime: 1e9,            // a finger that never moved 24 px is always a tap, never a drop (0.35 s → no time limit)
  peekAbove: 0.3,          // the wrong-dig peek no longer rises into the mound of the row above (0.55 → 0.3)
  chapterTimeLimit: 100,   // a typical 4-year-old keeps the 4th round instead of being cut at 75 s (75 → 100)
  hintTime: 5,             // the glow outlasts a slow child's 3–5 s think (3 → 5)
  moundPad: 40             // wider tap pad around a mound: fewer toddler taps fall on bare sand (24 → 40)
};
const digExtra = +opt('dig-extra', 0);   // content experiment: later dig rounds ask for this many more targets (lib withPatch)

/* ------------------------------------------------------------------ run a matrix on worker threads */
function matrix(ms, cfg, seedsN) {
  const tasks = [];
  for (const model of ms) for (const age of ages) for (const lagoon of lagoons) for (const vp of vps) for (let s = 1; s <= seedsN; s++)
    tasks.push({ model, age, lagoon, vp, seed: s, lang, config: cfg, patch: digExtra ? { digExtraTargets: digExtra } : null });
  return tasks;
}
function runTasks(tasks) {
  return new Promise((resolve, reject) => {
    const n = Math.min(threads, tasks.length), chunks = Array.from({ length: n }, () => []);
    // interleave so that each worker gets a similar mix of cheap and expensive models
    tasks.forEach((t, i) => chunks[i % n].push(t));
    const results = []; let left = n;
    chunks.forEach(ch => {
      const wk = new Worker(__filename, { workerData: { tasks: ch } });
      wk.on('message', m => { results.push(...m); if (--left === 0) resolve(results); });
      wk.on('error', reject);
    });
  });
}

/* ------------------------------------------------------------------ report */
const f0 = v => (Math.round(v)).toString();
const f1 = v => (Math.round(v * 10) / 10).toFixed(1);
const pc = (a, b) => (b ? Math.round(100 * a / b) + '%' : '–');
const min = s => f1(s / 60);
function groupBy(rs, key) { const g = {}; for (const r of rs) (g[key(r)] = g[key(r)] || []).push(r); return g; }

function report(base, prop, wall) {
  const out = [];
  const P = s => out.push(s);
  P(`# Playtest summary — ${name}`);
  P(``);
  P(`${base.length} sessions (one lagoon each) · models ${models.join(', ')} · ages ${ages.join(',')} · lagoons ${lagoons.join(',')} · viewports ${vps.join(', ')} · ${seeds} seed(s) per cell · lang ${lang} · config ${JSON.stringify(config)} · ${f1(wall)} s wall on ${threads} thread(s)`);
  P(``);
  P(`Times are simulated game seconds (the world's own clock, incl. the 1.8 s chapter banner, 1.7 s stars, 2.0 s dance and the child's Talk-time think). Add ≈ 10 s per lagoon for the real map / fanfare screens.`);
  P(``);

  // ---- 1. pace per model × age
  P(`## 1. Pace per model × age`);
  P(``);
  P(`| model | age | n | done | lagoon s (min/mean/max) | **6 lagoons est.** | chapter s mean (60–100 s band) | short chapters | round s mean / p95 | stuck (dig / drag) | timeouts |`);
  P(`|---|---|---|---|---|---|---|---|---|---|---|`);
  const byMA = groupBy(base, r => r.model + '|' + r.age);
  for (const m of models) for (const a of ages) {
    const rs = byMA[m + '|' + a]; if (!rs) continue;
    const A = L.aggregate(rs);
    P(`| ${m} | ${a} | ${A.n} | ${A.done} | ${A.lagoonDur.length ? f0(Math.min(...A.lagoonDur)) + ' / ' + f0(L.mean(A.lagoonDur)) + ' / ' + f0(Math.max(...A.lagoonDur)) : '–'} | **${min(A.total6)} min** | ${f0(L.mean(A.chapDur))} (${pc(A.chapInBand, A.chapN)}) | ${pc(A.shortChapters, A.chapters)} | ${f1(L.mean(A.roundDur))} / ${f1(L.pct(A.roundDur, 0.95))} | ${A.stuck} (${A.stuckDig} / ${A.stuckDrag}) | ${A.timeout} |`);
  }
  P(``);

  // ---- 2. fun / reward counters
  P(`## 2. Rewards and surprises per model × age`);
  P(``);
  P(`| model | age | stars 3 / 2 / 1 | hints per round | pearls per lagoon | crab taps / crab mounds | photobombs per chapter | Talk right | Talk s | idle nudges (max per round) | talk re-asks (max) |`);
  P(`|---|---|---|---|---|---|---|---|---|---|---|`);
  for (const m of models) for (const a of ages) {
    const rs = byMA[m + '|' + a]; if (!rs) continue;
    const A = L.aggregate(rs);
    P(`| ${m} | ${a} | ${pc(A.stars[3], A.roundsN)} / ${pc(A.stars[2], A.roundsN)} / ${pc(A.stars[1], A.roundsN)} | ${(A.hints / Math.max(1, A.roundsN)).toFixed(2)} | ${f0(L.mean(A.pearls))} | ${A.crabs} / ${A.crabMounds} | ${(A.photobombs / Math.max(1, A.chapters)).toFixed(2)} | ${pc(A.talkRight, A.chapters)} | ${f1(L.mean(A.talkDur))} | ${A.idles} (${A.idleMaxRound}) | ${A.talkAsks} (${A.talkAskMax}) |`);
  }
  P(``);

  // ---- 3. correctness checks per model
  P(`## 3. Input / geometry / flow checks per model (all ages, lagoons, viewports)`);
  P(``);
  P(`| model | pokes → counted as drop (of which: wrong-chest / correct) | near-zone misses | high drops missed / high drops | dig taps ignored: outside pad / wobbled ≥ 24 px (of taps) | peek overlaps: mound above / chest (max px) of peeks | packed outside / overlapping | count rounds done | look-alike accepts (rounds with twins) | bad next / nexts | anomalies | 3+ structurally identical rounds in a chapter | same label set as the previous round |`);
  P(`|---|---|---|---|---|---|---|---|---|---|---|---|---|`);
  const byM = groupBy(base, r => r.model);
  for (const m of models) {
    const rs = byM[m]; if (!rs) continue;
    const A = L.aggregate(rs);
    P(`| ${m} | ${A.tapAsDrop} of ${A.pokes} (${A.pokeWrong} / ${A.pokeCorrect}) | ${A.nearMiss} of ${A.misses} misses | ${A.highMissed} / ${A.highDrops} | ${A.ignoredDigTaps} / ${A.wobbleIgnored} (${A.digTaps}) | ${A.peekOverlapMound} / ${A.peekOverlapChest} (${f0(A.peekOverlapMax)}) of ${A.peeks} | ${A.packOutside} / ${A.packOverlap} | ${A.countDone} / ${A.countRounds} | ${A.lookalike} (${A.lookalikeRounds} of ${A.digRounds}) | ${A.nextBad} / ${A.nexts} | ${A.anomalies} | ${A.sameRuns} of ${A.chapters} | ${A.sameLabels} of ${A.roundsN} |`);
  }
  P(``);
  const anomalies = [], variety = [];
  for (const m of models) { const A = L.aggregate(byM[m] || []); anomalies.push(...A.anomalyList); variety.push(...A.varietyList); }
  if (anomalies.length) { P(`Anomaly samples: ` + anomalies.slice(0, 6).join(' · ')); P(``); }
  if (variety.length) { P(`Identical-round samples: ` + [...new Set(variety)].slice(0, 8).join(' · ')); P(``); }

  // ---- 4. per-lagoon durations for the typical child
  if (byM.typical) {
    P(`## 4. Typical 4-year-old model: mean lagoon duration (s) per age × lagoon, and the 6-lagoon total`);
    P(``);
    P(`| age | ` + lagoons.map(l => 'L' + l).join(' | ') + ` | total (min) | + 10 s/lagoon UI |`);
    P(`|---|` + lagoons.map(() => '---').join('|') + `|---|---|`);
    for (const a of ages) {
      const rs = byM.typical.filter(r => r.age === a && r.done); if (!rs.length) continue;
      const byL = groupBy(rs, r => r.lagoon); let tot = 0; const cells = [];
      for (const l of lagoons) { const d = byL[l] ? L.mean(byL[l].map(r => r.total)) : 0; tot += d; cells.push(f0(d)); }
      const scale = 6 / lagoons.length;
      P(`| ${a} | ${cells.join(' | ')} | ${min(tot * scale)} | ${min(tot * scale + 60)} |`);
    }
    P(``);
    P(`Mechanic split (typical, all ages): ` + (() => {
      const ch = []; for (const r of byM.typical) for (const c of r.chapters) if (c.dur != null) ch.push(c);
      const dig = ch.filter(c => c.mech === 'dig'), drag = ch.filter(c => c.mech === 'drag');
      return `dig chapters mean ${f0(L.mean(dig.map(c => c.dur)))} s (${pc(dig.filter(c => c.dur >= 60 && c.dur <= 100).length, dig.length)} in band), drag chapters mean ${f0(L.mean(drag.map(c => c.dur)))} s (${pc(drag.filter(c => c.dur >= 60 && c.dur <= 100).length, drag.length)} in band)`;
    })());
    P(``);
  }

  // ---- 5. plan-level variety
  P(`## 5. Variety for a bored child`);
  P(``);
  P(`Plan level (content.js PLAN): lagoons where consecutive chapters repeat the same topic (the mechanic alternates, so only the topic repeats):`);
  P(``);
  for (const a of ages) {
    const hits = [];
    for (const l of lagoons) { const p = L.TR.Content.planFor(a, l); for (let i = 1; i < p.length; i++) if (p[i].topic === p[i - 1].topic) hits.push('L' + l + ' ch' + i + '→' + (i + 1) + ' ' + p[i].topic); }
    P(`- age ${a}: ` + (hits.length ? hits.join(', ') : 'none'));
  }
  P(``);

  // ---- 6. proposal
  if (prop) {
    P(`## 6. Recommended CONFIG changes re-simulated (same seeds, models typical / slow3 / high / idle)`);
    P(``);
    P('```json\n' + JSON.stringify(PROPOSAL, null, 1) + '\n```');
    P(``);
    const bp = groupBy(prop, r => r.model + '|' + r.age), propSeeds = Math.max(...prop.map(r => r.seed));
    P(`Before = the same cells of the base matrix restricted to seeds ≤ ${propSeeds} (identical seeds on both sides).`);
    P(``);
    P(`| model | age | 6-lagoon est. (min) before → after | dig / drag chapter s | pokes counted as drops | peek overlaps (max px) | short chapters | hints per round | stars 3 | dig taps outside pad | stuck / anomalies |`);
    P(`|---|---|---|---|---|---|---|---|---|---|---|`);
    for (const m of [...new Set(prop.map(r => r.model))]) for (const a of ages) {
      const A = L.aggregate((byMA[m + '|' + a] || []).filter(r => r.seed <= propSeeds)), B = L.aggregate(bp[m + '|' + a] || []);
      if (!B.n) continue;
      P(`| ${m} | ${a} | ${min(A.total6)} → ${min(B.total6)} | ${f0(L.mean(A.digChapDur))} / ${f0(L.mean(A.dragChapDur))} → ${f0(L.mean(B.digChapDur))} / ${f0(L.mean(B.dragChapDur))} | ${A.tapAsDrop}/${A.pokes} → ${B.tapAsDrop}/${B.pokes} | ${A.peekOverlapMound} (${f0(A.peekOverlapMax)}) → ${B.peekOverlapMound} (${f0(B.peekOverlapMax)}) | ${pc(A.shortChapters, A.chapters)} → ${pc(B.shortChapters, B.chapters)} | ${(A.hints / Math.max(1, A.roundsN)).toFixed(2)} → ${(B.hints / Math.max(1, B.roundsN)).toFixed(2)} | ${pc(A.stars[3], A.roundsN)} → ${pc(B.stars[3], B.roundsN)} | ${A.ignoredDigTaps}/${A.digTaps} → ${B.ignoredDigTaps}/${B.digTaps} | ${A.stuck}/${A.anomalies} → ${B.stuck}/${B.anomalies} |`);
    }
    P(``);
  }
  return out.join('\n');
}

/* ------------------------------------------------------------------ main */
(async () => {
  const t0 = Date.now();
  const tasks = matrix(models, config, seeds);
  process.stderr.write(`playtest: ${tasks.length} sessions on ${threads} threads…\n`);
  const base = await runTasks(tasks);
  let prop = null;
  if (withProposal) {
    const pm = ['typical', 'slow3', 'high', 'idle'].filter(m => models.includes(m));
    const pt = matrix(pm, Object.assign({}, config, PROPOSAL), Math.max(1, Math.min(seeds, 2)));
    process.stderr.write(`playtest: proposal re-simulation, ${pt.length} sessions…\n`);
    prop = await runTasks(pt);
  }
  // determinism: a handful of cells, run twice
  const det = [];
  for (const m of ['typical', 'random', 'spammer'].filter(m => models.includes(m))) det.push(Object.assign({ model: m }, L.deterministic({ model: m, age: 4, lagoon: 2, seed: 11, vp: 'port', lang, config })));
  const wall = (Date.now() - t0) / 1000;
  let md = report(base, prop, wall);
  md += `\n## 7. Determinism (same seed, run twice)\n\n` + det.map(d => `- ${d.model}: ${d.same ? 'identical' : 'DIFFERENT'} event log (${d.events} events)`).join('\n') + '\n';
  const dir = path.join(__dirname, 'out'); fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name + '.md'), md);
  fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify({ args: argv, base: base.map(r => Object.assign({}, r, { rounds: undefined, chapters: r.chapters.map(c => ({ level: c.level, topic: c.topic, mech: c.mech, dur: c.dur, rounds: c.rounds, stars: c.stars })) })), prop: prop && prop.map(r => Object.assign({}, r, { rounds: undefined })), det }));
  process.stdout.write(md + '\n');
  process.stderr.write(`playtest: ${f1(wall)} s → tests/sim/out/${name}.md\n`);
})().catch(e => { console.error(e); process.exit(1); });
