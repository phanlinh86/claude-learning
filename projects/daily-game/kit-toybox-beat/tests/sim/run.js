// Kit's Toybox Beat — high-speed playtest: thousands of headless rounds, bots + human-like models.
//
//   node tests/sim/run.js                 # baseline + proposal, all cells (≈ 5–8 min on 2 cores)
//   node tests/sim/run.js --runs 60       # fewer runs per cell (quick look)
//   node tests/sim/run.js --only baseline # or --only proposal
//
// Writes tests/sim/results/{baseline,proposal,compare,charts}.md. Never touches game code: proposals are
// passed as config overrides to new KB.World({ seed, config }).
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { load } = require('../unit/load.js');
const { makePlayer } = require('./players.js');

const DT = 1 / 60;            // frame dt; the world sub-steps at 1/120 s and players fire with exact offsets
const MAX_LEVELS = 8;         // two full days (dawn→night ×2)

/* ===================== proposed tuning (key: old → new) ===================== */
// 'proposal'      = config-only changes (KB.DIFFICULTY overrides)
// 'proposal-code' = the same + the new key wrongLaneMiss (needs the small world.js change simulated below)
const PROPOSAL = {
  easy: {
    earlyWin: 0.34,            // 0.30 → 0.34: "too early" band 0.22–0.34 (was 0.22–0.30) so blind 3–5 taps/s mashing stops clearing every level
    maxDensity: 4              // 6 → 4: the Easy literal has `maxDensity: 4` inside a // comment (latent bug; tiny chart effect)
  },
  normal: {
    firstLevelCostMul: 0.5,    // 0.75 → 0.5: Dawn on Normal clearable by a 4–6-year-old (miss costs 0.04 there)
    goodWin: 0.17,             // 0.15 → 0.17: reaction-late kids (0.18 lets alternating spam clear L1)
    earlyWin: 0.34             // 0.30 → 0.34: keeps the "too early" band 0.17 wide so 3–5 taps/s two-lane mashing can't ride the wider goodWin
  },
  hard: {}
};
const PROPOSAL_CODE = JSON.parse(JSON.stringify(PROPOSAL));
PROPOSAL_CODE.normal.wrongLaneMiss = true;     // new key (code change, see patchWrongLaneMiss)
PROPOSAL_CODE.hard.wrongLaneMiss = true;
const VARIANTS = { baseline: null, proposal: PROPOSAL, 'proposal-code': PROPOSAL_CODE };

/* ===================== proposed CODE change, simulated here without touching game code =====================
 * cfg.wrongLaneMiss (new key, Normal/Hard): a lane tap that judges as 'empty' while the OTHER lane has a live
 * note inside ±goodWin misses that note (Kit flew to the wrong track). Kills the "tap both lanes on every
 * beat" chord exploit; costs an honest player nothing extra (that note was going to be missed anyway). */
function patchWrongLaneMiss(w) {
  const orig = w.tap;
  w.tap = function (lane, offset) {
    const e = orig.call(this, lane, offset);
    if (!e || e.type !== 'empty' || lane === undefined || lane === null || lane < 0 || this.cfg.oneButton) return e;
    const t = this.songTime + this._acc + (+offset || 0), c = this.cfg, ns = this.notes;
    for (let i = this._first; i < ns.length; i++) {
      const n = ns[i];
      if (n.time - t > c.goodWin) break;
      if (n.state === 'live' && n.lane !== lane && Math.abs(t - n.time) <= c.goodWin + 1e-9) return this._miss(n, false, t);
    }
    return e;
  };
}

/* ===================== one run ===================== */
function simRun(KB, diff, kind, seed, over) {
  const cfg = Object.assign({}, KB.DIFFICULTY[diff], over || {});
  const w = new KB.World({ seed, config: cfg });
  if (cfg.wrongLaneMiss) patchWrongLaneMiss(w);
  const p = makePlayer(KB, w, kind, seed);
  const rec = { diff, kind, seed, levels: [], firstCatch: null, deathCause: null, deathInBoss: false, dead: false };
  let cur = null, lastNeg = null;
  const newLevel = (e) => { cur = { level: e.level, cleared: false, songLen: w.songLen, t0: w.time, wall: 0, notes: w.notes.length,
    pillows: w.notes.filter(n => n.kind === 'pillow').length, hit: 0, miss: 0, early: 0, poof: 0, bounce: 0, minG: w.groove, endG: 0 }; rec.levels.push(cur); };
  const evs0 = w.drainEvents(); evs0.forEach(e => { if (e.type === 'level') newLevel(e); });
  const tCap = 200 * MAX_LEVELS;
  while (w.time < tCap) {
    const bossBefore = w.boss.state;       // the world parks Baron Fluff 'away' once dead, so sample it first
    p.step(DT); w.update(DT);
    const evs = w.drainEvents();
    for (const e of evs) {
      switch (e.type) {
        case 'level': newLevel(e); break;
        case 'hit': cur.hit++; if (rec.firstCatch === null) rec.firstCatch = w.time; break;
        case 'bounce': cur.bounce++; if (rec.firstCatch === null) rec.firstCatch = w.time; break;
        case 'miss': cur.miss++; if (e.early) cur.early++; lastNeg = e.early ? 'early miss' : 'miss'; break;
        case 'poof': cur.poof++; lastNeg = 'pillow'; break;
        case 'cleared': cur.cleared = true; cur.wall = w.time - cur.t0; cur.endG = w.groove; break;
        case 'dead': rec.dead = true; rec.deathCause = lastNeg; rec.deathInBoss = bossBefore !== 'away' || w.boss.state !== 'away'; cur.wall = w.time - cur.t0; break;
      }
    }
    if (cur) cur.minG = Math.min(cur.minG, w.groove);
    if (w.state === 'dead') break;
    if (w.levelsCleared >= MAX_LEVELS) break;
  }
  rec.score = w.score; rec.cleared = w.levelsCleared; rec.taps = w.stats.taps;
  rec.perfect = w.stats.perfect; rec.good = w.stats.good; rec.bounced = w.stats.bounced;
  rec.miss = w.stats.miss; rec.early = w.stats.early; rec.poofed = w.stats.poofed;
  rec.maxCombo = w.maxCombo;
  rec.player = p.desc && p.desc.name;
  return rec;
}

/* ===================== cells ===================== */
const BOT_SKILLS = [0.2, 0.4, 0.6, 0.8, 1];
function cells(runs) {
  const out = [];
  for (const d of ['easy', 'normal', 'hard'])
    for (const s of BOT_SKILLS) out.push({ diff: d, kind: 'bot:' + s, runs: s === 1 ? Math.min(20, runs) : runs });
  const H = [
    ['easy', 'kid'], ['normal', 'kid'],
    ['easy', 'casual'], ['normal', 'casual'], ['hard', 'casual'],
    ['easy', 'kidPillowIgnorer'], ['normal', 'kidPillowIgnorer'],
    ['easy', 'pillowIgnorer'], ['normal', 'pillowIgnorer'], ['hard', 'pillowIgnorer'],
    ['easy', 'camper'], ['normal', 'camper'], ['hard', 'camper'],
    ['easy', 'spamOne'], ['easy', 'spamFast'],
    ['normal', 'spamBoth'], ['normal', 'spamAlt'], ['normal', 'spamOne'], ['normal', 'spamFast'],
    ['hard', 'spamBoth'], ['hard', 'spamAlt'], ['hard', 'spamFast'],
    ['easy', 'mashSlow'], ['easy', 'beatOne'],
    ['normal', 'mashSlowBoth'], ['normal', 'beatBoth'], ['hard', 'mashSlowBoth'], ['hard', 'beatBoth'],
    ['easy', 'idle'], ['normal', 'idle']
  ];
  for (const [d, k] of H) out.push({ diff: d, kind: k, runs: k === 'idle' ? Math.min(30, runs) : runs * 2 });
  // boss counterfactual: same players, no Baron Fluff
  for (const [d, k] of [['easy', 'kid'], ['normal', 'kid'], ['normal', 'casual'], ['hard', 'casual'], ['normal', 'bot:0.4'], ['hard', 'bot:0.6']])
    out.push({ diff: d, kind: k, runs: runs * 2, noBoss: true });
  return out;
}

/* ===================== workers ===================== */
if (!isMainThread) {
  const KB = load();
  const { jobs, over } = workerData;
  const res = [];
  for (const j of jobs) {
    const o = Object.assign({}, (over && over[j.diff]) || {}, j.noBoss ? { bossFirst: 1e9 } : {});
    const r = simRun(KB, j.diff, j.kind, j.seed, o);
    r.cell = j.cell;
    // keep results small
    res.push(r);
  }
  parentPort.postMessage(res);
  return;
}

function runAll(cellList, over) {
  const jobs = [];
  cellList.forEach((c, ci) => { for (let s = 1; s <= c.runs; s++) jobs.push({ cell: ci, diff: c.diff, kind: c.kind, noBoss: !!c.noBoss, seed: s * 101 + ci * 7 }); });
  // interleave so workers get similar loads
  const nW = Math.max(1, Math.min(os.cpus().length, 8));
  const parts = Array.from({ length: nW }, () => []);
  jobs.forEach((j, i) => parts[i % nW].push(j));
  return Promise.all(parts.map(p => new Promise((res, rej) => {
    const wk = new Worker(__filename, { workerData: { jobs: p, over } });
    wk.on('message', res); wk.on('error', rej);
  }))).then(rs => {
    const by = cellList.map(() => []);
    rs.flat().forEach(r => by[r.cell].push(r));
    return by;
  });
}

/* ===================== stats ===================== */
const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const pctl = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const P = (x) => isNaN(x) ? '–' : (100 * x).toFixed(0) + ' %';
const F = (x, d = 1) => isNaN(x) ? '–' : x.toFixed(d);
const K = (x) => isNaN(x) ? '–' : (x >= 1000 ? (x / 1000).toFixed(1) + 'k' : x.toFixed(0));

function summarize(c, runs) {
  const n = runs.length;
  const reach = (L) => runs.filter(r => r.cleared >= L).length / n;   // cleared ≥ L levels = reached level L+1
  const acc = runs.map(r => { const tot = r.perfect + r.good + r.bounced + r.miss + r.poofed; return tot ? (r.perfect + r.good + r.bounced) / tot : 0; });
  const deaths = runs.filter(r => r.dead);
  const perLevel = [];
  for (let L = 0; L < MAX_LEVELS; L++) {
    const at = runs.map(r => r.levels[L]).filter(Boolean);
    perLevel.push({ reached: at.length, clear: at.length ? at.filter(x => x.cleared).length / at.length : NaN,
      acc: mean(at.map(x => (x.hit + x.bounce) / Math.max(1, x.hit + x.bounce + x.miss + x.poof))) });
  }
  const hist = Array(MAX_LEVELS + 1).fill(0); runs.forEach(r => hist[r.cleared]++);
  return {
    label: `${c.diff} · ${c.kind}${c.noBoss ? ' · NO BOSS' : ''}`, n, c,
    clearL1: reach(1), reachL3: reach(2), reachL5: reach(4), all: reach(MAX_LEVELS),
    medLv: pctl(runs.map(r => r.cleared), 0.5), meanLv: mean(runs.map(r => r.cleared)),
    score: mean(runs.map(r => r.score)), s10: pctl(runs.map(r => r.score), 0.1), s50: pctl(runs.map(r => r.score), 0.5), s90: pctl(runs.map(r => r.score), 0.9),
    acc: mean(acc), early: mean(runs.map(r => r.early / Math.max(1, r.miss))),
    firstCatch: pctl(runs.filter(r => r.firstCatch !== null).map(r => r.firstCatch), 0.5),
    noCatch: runs.filter(r => r.firstCatch === null).length / n,
    deathPillow: deaths.filter(r => r.deathCause === 'pillow').length / n,
    deathInBoss: deaths.filter(r => r.deathInBoss).length / n,
    deathEarly: deaths.filter(r => r.deathCause === 'early miss').length / n,
    dead: deaths.length / n,
    perLevel, hist,
    deathTimeL1: pctl(runs.filter(r => r.dead && r.levels.length === 1).map(r => r.levels[0].wall), 0.5)
  };
}

function tables(S, title) {
  let md = `## ${title}\n\n`;
  md += '### Overview\n\n| cell | runs | clear L1 | reach L3 | reach L5 (lap 2) | clear all 8 | median levels | accuracy | early-miss share of misses | score mean | score p10 / p50 / p90 | first catch (s, median) | deaths: pillow last / in boss visit |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const s of S) md += `| ${s.label} | ${s.n} | ${P(s.clearL1)} | ${P(s.reachL3)} | ${P(s.reachL5)} | ${P(s.all)} | ${s.medLv} | ${P(s.acc)} | ${P(s.early)} | ${K(s.score)} | ${K(s.s10)} / ${K(s.s50)} / ${K(s.s90)} | ${s.noCatch > 0.5 ? 'never' : F(s.firstCatch, 2)} | ${P(s.deathPillow)} / ${P(s.deathInBoss)} |\n`;
  md += '\n### Survival per level (clear rate of the runs that reached it; n reached in brackets)\n\n| cell | ' + ['Dawn', 'Noon', 'Sunset', 'Night', 'Dawn²', 'Noon²', 'Sunset²', 'Night²'].join(' | ') + ' |\n|---|' + '---|'.repeat(MAX_LEVELS) + '\n';
  for (const s of S) md += `| ${s.label} | ` + s.perLevel.map(l => l.reached ? `${P(l.clear)} (${l.reached})` : '–').join(' | ') + ' |\n';
  md += '\n### Levels cleared: distribution (% of runs)\n\n| cell | ' + Array.from({ length: MAX_LEVELS + 1 }, (_, i) => i).join(' | ') + ' |\n|---|' + '---|'.repeat(MAX_LEVELS + 1) + '\n';
  for (const s of S) md += `| ${s.label} | ` + s.hist.map(h => h ? (100 * h / s.n).toFixed(0) : '·').join(' | ') + ' |\n';
  md += '\n### Accuracy per level (catches / resolved notes, runs that reached it)\n\n| cell | ' + ['Dawn', 'Noon', 'Sunset', 'Night', 'Dawn²', 'Noon²', 'Sunset²', 'Night²'].join(' | ') + ' |\n|---|' + '---|'.repeat(MAX_LEVELS) + '\n';
  for (const s of S) md += `| ${s.label} | ` + s.perLevel.map(l => l.reached ? P(l.acc) : '–').join(' | ') + ' |\n';
  return md + '\n';
}

/* ===================== chart / event-stream analysis (no player needed) ===================== */
function chartAnalysis(KB, over) {
  let md = '## Chart analysis (50 seeds per difficulty, levels 1–8)\n\n';
  md += '| diff | level | bpm | song s | wall s (count-in + song + cleared) | notes | notes/s | eighth-gap lane jumps | quarter lane jumps/min | pillows with a coin ≤ 1.5 beats | pillow lane ≠ previous note lane, gap ≤ 1 beat | coins in the 2 beats before a pillow |\n|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  const NAMES = ['Dawn', 'Noon', 'Sunset', 'Night'];
  for (const d of ['easy', 'normal', 'hard']) {
    for (let L = 0; L < MAX_LEVELS; L++) {
      let notes = 0, song = 0, wall = 0, ej = 0, qj = 0, pclose = 0, pswitch = 0, pillows = 0, preCoins = 0, bpm = 0;
      const SEEDS = 50;
      for (let s = 1; s <= SEEDS; s++) {
        const w = new KB.World({ seed: s * 13, config: Object.assign({}, KB.DIFFICULTY[d], (over && over[d]) || {}) });
        w.startLevel(L);
        const ns = w.notes; bpm = w.bpm; const bl = w.beatLen;
        notes += ns.length; song += w.songLen;
        wall += w.cfg.readyBeats * bl + w._songEnd + w.cfg.clearedTime;
        for (let i = 1; i < ns.length; i++) {
          const g = ns[i].beat - ns[i - 1].beat;
          if (ns[i].lane !== ns[i - 1].lane) { if (g <= 0.5 + 1e-9) ej++; else if (g <= 1 + 1e-9) qj++; }
        }
        ns.forEach((n, i) => {
          if (n.kind !== 'pillow') return;
          pillows++;
          const near = ns.some(m => m !== n && m.kind !== 'pillow' && Math.abs(m.beat - n.beat) <= 1.5 + 1e-9);
          if (near) pclose++;
          const prev = ns[i - 1];
          if (prev && prev.lane !== n.lane && n.beat - prev.beat <= 1 + 1e-9) pswitch++;
          preCoins += ns.filter(m => m.kind !== 'pillow' && n.beat - m.beat > 0 && n.beat - m.beat <= 2 + 1e-9).length;
        });
      }
      md += `| ${d} | ${L + 1} ${NAMES[L % 4]}${L >= 4 ? '²' : ''} | ${bpm} | ${F(song / SEEDS)} | ${F(wall / SEEDS)} | ${F(notes / SEEDS)} | ${F(notes / song, 2)} | ${F(ej / SEEDS, 2)} | ${F(qj / SEEDS / (song / SEEDS / 60), 1)} | ${P(pclose / pillows)} | ${P(pswitch / pillows)} | ${F(preCoins / pillows, 2)} |\n`;
    }
  }
  return md + '\n';
}

/* ===================== main ===================== */
async function main() {
  const args = process.argv.slice(2);
  const runs = args.includes('--runs') ? +args[args.indexOf('--runs') + 1] : 80;
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : Object.keys(VARIANTS);
  const KB = load();
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const cl = cells(runs);
  const hdr = (t) => `# Kit's Toybox Beat — ${t}\n\nGenerated by \`node tests/sim/run.js --runs ${runs}\` (dt ${DT.toFixed(4)} s, max ${MAX_LEVELS} levels per run, deterministic seeds; human/exploit cells use 2× runs).\n\n`;
  const t0 = Date.now();
  for (const v of only) {
    if (v === 'compare') continue;
    const over = VARIANTS[v];
    const by = await runAll(cl, over);
    const S = cl.map((c, i) => summarize(c, by[i]));
    const cfgTxt = over ? '```js\n' + JSON.stringify(over, null, 2) + '\n```\n\n' : 'Current `KB.DIFFICULTY` (no overrides).\n\n';
    fs.writeFileSync(path.join(outDir, v + '.md'), hdr(v) + cfgTxt + tables(S, v) + chartAnalysis(KB, over));
    fs.writeFileSync(path.join(outDir, v + '.json'), JSON.stringify(S.map(s => Object.assign({}, s, { c: undefined }))));
    console.log(v, 'done', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    S.forEach(s => console.log(s.label.padEnd(38), 'L1', P(s.clearL1).padStart(5), 'L3', P(s.reachL3).padStart(5), 'L5', P(s.reachL5).padStart(5), 'all', P(s.all).padStart(5), 'acc', P(s.acc).padStart(5), 'p50', K(s.s50).padStart(6), 'pillowDeath', P(s.deathPillow), 'perLv', s.perLevel.map(l => l.reached ? P(l.clear).replace(' ', '') : '-').join(' ')));
  }
  // compare (from whatever JSONs exist)
  const J = {};
  for (const v of Object.keys(VARIANTS)) { const f = path.join(outDir, v + '.json'); if (fs.existsSync(f)) J[v] = JSON.parse(fs.readFileSync(f, 'utf8')); }
  if (J.baseline && J.proposal) {
    const vs = Object.keys(J);
    let md = hdr('baseline vs proposals') + '### proposal (config only)\n```js\n' + JSON.stringify(PROPOSAL, null, 2) + '\n```\n### proposal-code = proposal + `wrongLaneMiss: true` on Normal and Hard (world.js change, simulated in run.js)\n\n';
    md += 'Each cell: ' + vs.join(' → ') + '.\n\n| cell | clear L1 | reach L3 | reach L5 | clear all 8 | median levels | accuracy | score p50 |\n|---|---|---|---|---|---|---|---|\n';
    J.baseline.forEach((b, i) => {
      const col = (f) => vs.map((v, k) => k ? '**' + f(J[v][i]) + '**' : f(J[v][i])).join(' → ');
      md += `| ${b.label} | ${col(s => P(s.clearL1))} | ${col(s => P(s.reachL3))} | ${col(s => P(s.reachL5))} | ${col(s => P(s.all))} | ${col(s => String(s.medLv))} | ${col(s => P(s.acc))} | ${col(s => K(s.s50))} |\n`;
    });
    fs.writeFileSync(path.join(outDir, 'compare.md'), md);
    console.log('compare.md written');
  }
}
module.exports = { simRun, PROPOSAL, PROPOSAL_CODE, summarize, MAX_LEVELS };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
