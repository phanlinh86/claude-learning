#!/usr/bin/env node
// Tofu's Volcano Melody — high-speed headless playtest.
//   node tests/sim/run.js [--tuning before|after|afterProto|both|all|a,b] [--n 200] [--nx 60] [--out tests/sim/results]
// Plays thousands of rounds (bots × difficulties, a 4-year-old, a casual adult, exploit players), using the real
// game/js/{rng,world,bot}.js in a vm with a fake window. Tuning candidates are passed in through
// new PVM.World({ config, diff }) — game/ is never modified. Writes <out>/<tuning>.json and prints tables.
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const os = require('os');

const JS = path.join(__dirname, '..', '..', 'game', 'js');
function load() {
  const ctx = { console, Math, Date, JSON };
  ctx.window = ctx;
  vm.createContext(ctx);
  for (const f of ['rng.js', 'world.js', 'bot.js']) vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f });
  return ctx.PVM;
}

/* ============================== tunings ==============================
 * 'before' = the shipped game. 'after' = the recommended changes (see docs/reports/playtest.md).
 * config → PVM.CONFIG keys; diff[difficulty] → PVM.DIFFICULTY[difficulty] keys (merged over the shipped preset). */
const TUNINGS = {
  before: { config: {}, diff: { easy: {}, normal: {}, hard: {} } },
  after: {
    config: {
      popDelay: 3.6,            // was 1.3  — the meadow refills slowly: seasons last a song, not a sprint
      eruptCount: [2, 4],       // was [3, 5]
      helperTime: 7,            // was 10   — Coco helps, she does not play the game for you
      cocoSeekR: 200,           // was 260
      invulnTime: 2.5,          // was 2.0
      hitForgive: 10,           // was 4    — kinder hitbox (pinch when centres < 24 px instead of < 30 px)
      mangoLife: 14             // was 9    — a slow child can actually reach the mango
    },
    diff: {
      easy: { goal: [12, 14, 16, 18], crabSpeed: [36, 40, 44, 48], crabs: [1, 1, 1, 2], erupt: [10, 9, 9, 8], chaseFrac: 0.2, mangoEvery: [8, 12], comboWindow: 6 },
      normal: { goal: [24, 26, 28, 30], crabSpeed: [50, 56, 62, 68], crabs: [1, 1, 2, 2], erupt: [10, 9, 9, 8], chaseFrac: 0.45, mangoEvery: [16, 24] },
      hard: { goal: [25, 27, 29, 30], crabSpeed: [66, 74, 82, 90], crabs: [2, 2, 3, 3], erupt: [9, 8, 8, 7], chaseFrac: 0.6, mangoEvery: [20, 30] }
    }
  }
};

// 'afterProto' = 'after' + the sim-only prototype below on Easy (only a chasing crab pinches). Needs a world.js change.
TUNINGS.afterProto = Object.assign({}, TUNINGS.after, { proto: { wanderSafe: ['easy'] } });

const DT = 1 / 60;

/* PROTOTYPE (sim only, not in game/): World._pinches where only a *chasing* crab can pinch. A wandering crab that
 * Tofu walks into just bumps (it is nudged out, exactly like the existing dizzy/scared branch). Copy of the shipped
 * _pinches with one line changed (marked). Enabled per difficulty by tuning.proto.wanderSafe = ['easy']. */
function protoPinches() {
  const c = this.cfg, T = this.tofu;
  for (let i = 0; i < this.crabs.length; i++) {
    const k = this.crabs[i], dx = T.x - k.x, dy = T.y - k.y, d = Math.sqrt(dx * dx + dy * dy), touch = T.r + k.r;
    if (d >= touch) continue;
    const harmful = k.state === 'chase';                                   // <-- shipped: chase || wander
    if (harmful && this.invulnT <= 0 && d < touch - c.hitForgive) {
      const ux = d > 1e-6 ? dx / d : 0, uy = d > 1e-6 ? dy / d : 1;
      this.hearts--; this._lostHeart = true; this.stats.pinches++; this.invulnT = c.invulnTime;
      this._setTofuState('hurt');
      T.vx = ux * c.knockBack; T.vy = uy * c.knockBack;
      k.state = 'dizzy'; k.stateT = 0; k.vx = -ux * c.crabKnock; k.vy = -uy * c.crabKnock;
      this._endCombo();
      this._emit('pinch', { x: (T.x + k.x) / 2, y: (T.y + k.y) / 2, hearts: this.hearts });
      if (this.hearts <= 0) { this._gameOver(); return; }
    } else if (d > 1e-6 && (!harmful || this.invulnT > 0)) {
      const p = touch - d;
      k.x -= dx / d * p; k.y -= dy / d * p;
      // (collide/clampArena are module-private in world.js; the crab is re-collided on its next update)
    }
  }
}

/* ============================== one round ============================== */
function makePlayer(PVM, P, w, model, seed) {
  if (model.startsWith('bot')) return new PVM.Bot(w, { skill: +model.slice(3), seed: seed * 7 + 1 });
  if (P.PRESETS[model]) return new P.Human(PVM, w, Object.assign({ seed: seed * 13 + 5 }, P.PRESETS[model]));
  return new P.Scripted(PVM, w, model, seed * 3 + 1);
}

function playRound(PVM, P, job) {
  const tun = TUNINGS[job.tuning];
  const diff = Object.assign({}, tun.diff[job.difficulty] || {}, job.noMango ? { mangoEvery: [1e9, 1e9] } : {});
  const w = new PVM.World({ seed: job.seed, difficulty: job.difficulty, config: tun.config, diff });
  if (tun.proto && tun.proto.wanderSafe && tun.proto.wanderSafe.indexOf(job.difficulty) >= 0) w._pinches = protoPinches;
  const p = makePlayer(PVM, P, w, job.model, job.seed);
  const maxSeasons = job.maxSeasons || 4, maxT = job.maxT || 900;
  const seasons = [];
  let cur = null, t = 0, playT = 0;
  const startSeason = () => { cur = { level: w.level, playT: 0, cleared: false, pinches: 0, notes: 0, coco: 0, cocoIn: 0, firstNote: null, mangoPop: 0, mango: 0, heartsIn: w.hearts, score0: w.score }; };
  startSeason();
  while (t < maxT) {
    p.step(DT); w.update(DT); t += DT;
    if (w.phase === 'playing') { cur.playT += DT; playT += DT; }
    let stop = false;
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'note': cur.notes++; if (e.byCoco) cur.coco++; if (cur.firstNote === null) cur.firstNote = cur.playT; break;
        case 'pinch': cur.pinches++; break;
        case 'helperIn': cur.cocoIn++; break;
        case 'mangoPop': cur.mangoPop++; break;
        case 'mango': cur.mango++; break;
        case 'levelClear': cur.cleared = true; cur.score = w.score - cur.score0; seasons.push(cur); if (seasons.length >= maxSeasons) stop = true; break;
        case 'intro': if (e.level > 0) startSeason(); break;
        case 'gameOver': cur.score = w.score - cur.score0; seasons.push(cur); stop = true; break;
      }
    }
    if (stop) break;
  }
  if (!seasons.includes(cur)) { cur.score = w.score - cur.score0; cur.timeout = true; seasons.push(cur); }
  return { model: job.model, difficulty: job.difficulty, seed: job.seed, noMango: !!job.noMango, over: w.phase === 'over',
    score: w.score, t, playT, cleared: seasons.filter(s => s.cleared).length, seasons };
}

/* ============================== aggregation ============================== */
function q(a, p) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }
function f(x, d) { return isNaN(x) ? '–' : x.toFixed(d === undefined ? 0 : d); }
function pct(x) { return isNaN(x) ? '–' : Math.round(x * 100) + ' %'; }

function aggregate(rounds) {
  const out = {};
  const groups = {};
  for (const r of rounds) { const k = r.model + '|' + r.difficulty + (r.noMango ? '|nomango' : ''); (groups[k] = groups[k] || []).push(r); }
  for (const k in groups) {
    const g = groups[k], n = g.length, S = [0, 1, 2, 3].map(i => ({ reached: 0, cleared: 0, times: [], cocoIn: 0, notes: 0, coco: 0, pinch: 0, play: 0, first: [] }));
    let mangoPop = 0, mango = 0, totalPlay = 0, pinches = 0, notes = 0, coco = 0, cocoIn = 0, seasonsPlayed = 0;
    for (const r of g) {
      r.seasons.forEach((s, i) => {
        if (i > 3) return;
        const A = S[i]; A.reached++; if (s.cleared) { A.cleared++; A.times.push(s.playT); }
        A.cocoIn += s.cocoIn; A.notes += s.notes; A.coco += s.coco; A.pinch += s.pinches; A.play += s.playT;
        if (s.firstNote !== null) A.first.push(s.firstNote);
        mangoPop += s.mangoPop; mango += s.mango; totalPlay += s.playT; pinches += s.pinches; notes += s.notes; coco += s.coco; cocoIn += s.cocoIn; seasonsPlayed++;
      });
    }
    out[k] = {
      n, model: g[0].model, difficulty: g[0].difficulty, noMango: g[0].noMango,
      seasons: S.map(A => ({ reached: A.reached, clearRate: A.reached ? A.cleared / A.reached : NaN, absClear: A.cleared / n,
        tMed: q(A.times, 0.5), tP10: q(A.times, 0.1), tP90: q(A.times, 0.9), firstNoteMed: q(A.first, 0.5),
        cocoPerSeason: A.reached ? A.cocoIn / A.reached : NaN, cocoShare: A.notes ? A.coco / A.notes : NaN,
        pinchPerMin: A.play ? A.pinch / (A.play / 60) : NaN })),
      yearRate: g.filter(r => r.cleared >= 4).length / n,
      score: { p10: q(g.map(r => r.score), 0.1), med: q(g.map(r => r.score), 0.5), p90: q(g.map(r => r.score), 0.9) },
      scorePerMin: mean(g.map(r => r.score / Math.max(1, r.playT / 60))),
      survivalMed: q(g.map(r => r.playT), 0.5),
      overRate: g.filter(r => r.over).length / n,
      pinchPerMin: totalPlay ? pinches / (totalPlay / 60) : NaN,
      cocoPerSeason: seasonsPlayed ? cocoIn / seasonsPlayed : NaN,
      cocoShare: notes ? coco / notes : NaN,
      cocoRunShare: g.filter(r => r.seasons.some(s => s.cocoIn > 0)).length / n,
      mangoPopPerRun: mangoPop / n, mangoEatenPerRun: mango / n, mangoEatRate: mangoPop ? mango / mangoPop : NaN,
      firstNoteMed: q(g.map(r => r.seasons[0] && r.seasons[0].firstNote).filter(x => x !== null && x !== undefined), 0.5)
    };
  }
  return out;
}

function tables(tag, agg) {
  const L = [];
  const keys = Object.keys(agg).filter(k => !k.endsWith('nomango'));
  const order = ['bot0', 'bot0.4', 'bot0.8', 'bot1', 'kid4', 'adult'];
  const D = ['easy', 'normal', 'hard'];
  L.push('### ' + tag + ' — players × difficulty (one year = 4 seasons, run stops at game over)');
  L.push('| player | diff | n | spring clear | summer | autumn | winter | year cleared | s/season med (sp/su/au/wi) | first note (s) | pinch/min | Coco/season | Coco share | score p10/med/p90 | mango eaten/run |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of order) for (const d of D) {
    const a = agg[m + '|' + d]; if (!a) continue;
    const s = a.seasons;
    L.push(`| ${m} | ${d} | ${a.n} | ${pct(s[0].clearRate)} | ${pct(s[1].clearRate)} | ${pct(s[2].clearRate)} | ${pct(s[3].clearRate)} | ${pct(a.yearRate)} | ${s.map(x => f(x.tMed)).join(' / ')} | ${f(a.firstNoteMed, 1)} | ${f(a.pinchPerMin, 2)} | ${f(a.cocoPerSeason, 2)} | ${pct(a.cocoShare)} | ${f(a.score.p10)} / ${f(a.score.med)} / ${f(a.score.p90)} | ${f(a.mangoEatenPerRun, 2)} |`);
  }
  L.push('');
  L.push('### ' + tag + ' — season length spread for the target players (cleared seasons, p10–median–p90 s)');
  L.push('| player | diff | spring | summer | autumn | winter |');
  L.push('|---|---|---|---|---|---|');
  for (const [m, d] of [['kid4', 'easy'], ['kid4', 'normal'], ['adult', 'easy'], ['adult', 'normal'], ['adult', 'hard'], ['bot0.8', 'normal'], ['bot1', 'hard']]) {
    const a = agg[m + '|' + d]; if (!a) continue;
    L.push(`| ${m} | ${d} | ${a.seasons.map(x => f(x.tP10) + '–' + f(x.tMed) + '–' + f(x.tP90)).join(' | ')} |`);
  }
  L.push('');
  const nm = Object.keys(agg).filter(k => k.endsWith('nomango'));
  if (nm.length) {
    L.push('### ' + tag + ' — mango usefulness (same seeds with mangoes switched off)');
    L.push('| player | diff | mango pops/run | eaten/run | eaten % | year cleared with | without | game-over with | without | spring clear with | without |');
    L.push('|---|---|---|---|---|---|---|---|---|---|---|');
    for (const k of nm) {
      const b = agg[k], a = agg[k.replace('|nomango', '')]; if (!a) continue;
      L.push(`| ${a.model} | ${a.difficulty} | ${f(a.mangoPopPerRun, 2)} | ${f(a.mangoEatenPerRun, 2)} | ${pct(a.mangoEatRate)} | ${pct(a.yearRate)} | ${pct(b.yearRate)} | ${pct(a.overRate)} | ${pct(b.overRate)} | ${pct(a.seasons[0].clearRate)} | ${pct(b.seasons[0].clearRate)} |`);
    }
    L.push('');
  }
  const ex = ['idle', 'corner', 'crater', 'hugRock', 'circleTight', 'circleWide', 'spam', 'zigzag'];
  L.push('### ' + tag + ' — exploit / spam players (300 s cap)');
  L.push('| strategy | diff | n | spring clear | seasons cleared med | survival med (s) | game over | pinch/min | score med | score/min | Coco share |');
  L.push('|---|---|---|---|---|---|---|---|---|---|---|');
  for (const m of ex) for (const d of D) {
    const a = agg[m + '|' + d]; if (!a) continue;
    L.push(`| ${m} | ${d} | ${a.n} | ${pct(a.seasons[0].clearRate)} | ${f(a._seasonsMed)} | ${f(a.survivalMed)} | ${pct(a.overRate)} | ${f(a.pinchPerMin, 2)} | ${f(a.score.med)} | ${f(a.scorePerMin)} | ${pct(a.cocoShare)} |`);
  }
  L.push('');
  return L.join('\n');
}

/* ============================== driver ============================== */
function jobsFor(tuning, N, NX) {
  const J = [];
  const D = process.env.DIFFS ? process.env.DIFFS.split(',') : ['easy', 'normal', 'hard'];
  for (const m of ['bot0', 'bot0.4', 'bot0.8', 'bot1', 'kid4', 'adult']) for (const d of D) for (let s = 1; s <= N; s++) J.push({ tuning, model: m, difficulty: d, seed: 1000 + s });
  for (const m of ['kid4', 'adult', 'bot0.4']) for (const d of D) for (let s = 1; s <= N; s++) J.push({ tuning, model: m, difficulty: d, seed: 1000 + s, noMango: true });
  for (const m of ['idle', 'corner', 'crater', 'hugRock', 'circleTight', 'circleWide', 'spam', 'zigzag']) for (const d of D) for (let s = 1; s <= NX; s++) J.push({ tuning, model: m, difficulty: d, seed: 5000 + s, maxT: 300 });
  return J;
}

if (!isMainThread) {
  const PVM = load(), P = require('./players.js');
  parentPort.postMessage(workerData.jobs.map(j => playRound(PVM, P, j)));
} else if (require.main === module) {
  const args = process.argv.slice(2), arg = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
  const which = arg('tuning', 'both'), N = +arg('n', 200), NX = +arg('nx', 60);
  const outDir = path.resolve(arg('out', path.join(__dirname, 'results')));
  fs.mkdirSync(outDir, { recursive: true });
  const tunings = which === 'both' ? ['before', 'after'] : which === 'all' ? ['before', 'after', 'afterProto'] : which.split(',');
  (async () => {
    let md = '';
    for (const tun of tunings) {
      const jobs = jobsFor(tun, N, NX), W = Math.max(1, os.cpus().length), t0 = Date.now();
      const parts = Array.from({ length: W }, (_, i) => jobs.filter((_, j) => j % W === i));
      const res = (await Promise.all(parts.map(p => new Promise((ok, bad) => {
        const wk = new Worker(__filename, { workerData: { jobs: p } }); wk.on('message', ok); wk.on('error', bad);
      })))).flat();
      const agg = aggregate(res);
      for (const k in agg) {
        const g = res.filter(r => (r.model + '|' + r.difficulty + (r.noMango ? '|nomango' : '')) === k);
        agg[k]._seasonsMed = q(g.map(r => r.cleared), 0.5);
      }
      const simT = res.reduce((a, r) => a + r.t, 0);
      fs.writeFileSync(path.join(outDir, tun + '.json'), JSON.stringify({ tuning: tun, tuningDef: TUNINGS[tun], N, NX, aggregate: agg, rounds: res.map(r => ({ ...r, seasons: r.seasons.map(s => ({ c: s.cleared ? 1 : 0, t: +s.playT.toFixed(2), p: s.pinches, n: s.notes, k: s.coco, ci: s.cocoIn, m: s.mango, sc: s.score })) })) }));
      const tb = tables(tun, agg);
      fs.writeFileSync(path.join(outDir, tun + '.md'), tb);
      md += tb + '\n';
      console.log(tb);
      console.log(`[${tun}] ${res.length} rounds, ${(simT / 3600).toFixed(1)} simulated hours in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
    }
  })().catch(e => { console.error(e); process.exit(1); });
}

module.exports = { TUNINGS, playRound, load };
