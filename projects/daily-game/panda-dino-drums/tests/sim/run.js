// Momo's Dino Drums — high-speed playtest: thousands of headless rounds, bots + human-like models.
//
//   node tests/sim/run.js                 # all cells, 40 runs per cell (≈ 1–3 min on 2 cores)
//   node tests/sim/run.js --runs 15       # fewer runs per cell (quick look)
//   node tests/sim/run.js --only baseline # or --only noHelper
//
// Variants: 'baseline' = current DD.DIFFICULTY; 'noHelper' = same players with Pip switched off
// (helperCombo 1e9), to measure what the twist does. Writes tests/sim/results/{baseline,noHelper}.{md,json},
// compare.md and summary.md. Never touches game code: variants are config overrides to new DD.World.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { load } = require('../unit/load.js');
const { makePlayer } = require('./players.js');

const DT = 1 / 60;            // frame dt; the world sub-steps at 1/120 s and players fire with exact offsets
const MAX_LEVELS = 8;         // two full climbs of the tower (Riverbank → Sky Roof ×2)
const NAMES = ['Riverbank', 'Fern Canopy', 'Nest Ledge', 'Sky Roof'];
const NO_HELPER = { helperCombo: 1e9 };
const VARIANTS = { baseline: {}, noHelper: NO_HELPER };

/* ===================== one run ===================== */
function simRun(DD, diff, kind, seed, over) {
  const cfg = Object.assign({}, DD.DIFFICULTY[diff], over || {});
  const w = new DD.World({ seed, config: cfg });
  const p = makePlayer(DD, w, kind, seed);
  const rec = { diff, kind, seed, levels: [], firstCatch: null, deathCause: null, deathWithPip: false, dead: false, pipTime: 0, playTime: 0, firstPip: null };
  let cur = null, lastNeg = null;
  const newLevel = (e) => { cur = { level: e.level, cleared: false, songLen: w.songLen, t0: w.time, wall: 0, notes: w.notes.length, hit: 0, miss: 0, early: 0, saved: 0, minG: w.groove, endG: 0 }; rec.levels.push(cur); };
  w.drainEvents().forEach(e => { if (e.type === 'level') newLevel(e); });
  const tCap = 200 * MAX_LEVELS;
  while (w.time < tCap) {
    const hpBefore = w.helper.state;
    p.step(DT); w.update(DT);
    if (w.state === 'playing') { rec.playTime += DT; if (w.helper.state !== 'away') rec.pipTime += DT; }
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'level': newLevel(e); break;
        case 'hit': cur.hit++; if (rec.firstCatch === null) rec.firstCatch = w.time; break;
        case 'miss': cur.miss++; if (e.early) cur.early++; lastNeg = e.early ? 'early miss' : 'miss'; break;
        case 'helpersave': cur.saved++; break;
        case 'helperin': if (rec.firstPip === null) rec.firstPip = w.time; break;
        case 'cleared': cur.cleared = true; cur.wall = w.time - cur.t0; cur.endG = w.groove; break;
        case 'dead': rec.dead = true; rec.deathCause = lastNeg; rec.deathWithPip = hpBefore !== 'away'; cur.wall = w.time - cur.t0; break;
      }
    }
    if (cur) cur.minG = Math.min(cur.minG, w.groove);
    if (w.state === 'dead') break;
    if (w.levelsCleared >= MAX_LEVELS) break;
  }
  const s = w.stats;
  Object.assign(rec, { score: w.score, cleared: w.levelsCleared, taps: s.taps, perfect: s.perfect, good: s.good, miss: s.miss,
    early: s.early, saved: s.saved, helpers: s.helpers, maxCombo: w.maxCombo, player: p.desc && p.desc.name });
  return rec;
}

/* ===================== cells ===================== */
const BOT_SKILLS = [0.2, 0.4, 0.6, 0.8, 1];
function cells(runs) {
  const out = [];
  for (const d of ['easy', 'normal', 'hard'])
    for (const s of BOT_SKILLS) out.push({ diff: d, kind: 'bot:' + s, runs: s === 1 ? Math.min(10, runs) : runs });
  const H = [
    ['easy', 'toddler'], ['easy', 'kid'], ['normal', 'kid'],
    ['easy', 'casual'], ['normal', 'casual'], ['hard', 'casual'],
    ['easy', 'camper'], ['normal', 'camper'], ['hard', 'camper'],
    ['easy', 'spamOne'], ['easy', 'spamFast'],
    ['normal', 'spamBoth'], ['normal', 'spamAlt'], ['normal', 'spamOne'], ['normal', 'spamFast'],
    ['hard', 'spamBoth'], ['hard', 'spamAlt'],
    ['easy', 'mashSlow'], ['easy', 'beatOne'],
    ['normal', 'mashSlowBoth'], ['normal', 'beatBoth'], ['hard', 'beatBoth'],
    ['easy', 'idle'], ['normal', 'idle']
  ];
  for (const [d, k] of H) out.push({ diff: d, kind: k, runs: k === 'idle' ? Math.min(20, runs) : runs });
  return out;
}

/* ===================== workers ===================== */
if (!isMainThread) {
  const DD = load();
  const { jobs, over } = workerData;
  parentPort.postMessage(jobs.map(j => { const r = simRun(DD, j.diff, j.kind, j.seed, over); r.cell = j.cell; return r; }));
  return;
}

function runAll(cellList, over) {
  const jobs = [];
  cellList.forEach((c, ci) => { for (let s = 1; s <= c.runs; s++) jobs.push({ cell: ci, diff: c.diff, kind: c.kind, seed: s * 101 + ci * 7 }); });
  const nW = Math.max(1, Math.min(os.cpus().length, 8));
  const parts = Array.from({ length: nW }, () => []);
  jobs.forEach((j, i) => parts[i % nW].push(j));              // interleave so workers get similar loads
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
  const reach = (L) => runs.filter(r => r.cleared >= L).length / n;
  const acc = runs.map(r => { const tot = r.perfect + r.good + r.miss + r.saved; return tot ? (r.perfect + r.good) / tot : 0; });
  const perLevel = [];
  for (let L = 0; L < MAX_LEVELS; L++) {
    const at = runs.map(r => r.levels[L]).filter(Boolean);
    perLevel.push({ reached: at.length, clear: at.length ? at.filter(x => x.cleared).length / at.length : NaN,
      acc: mean(at.map(x => x.hit / Math.max(1, x.hit + x.miss + x.saved))) });
  }
  const hist = Array(MAX_LEVELS + 1).fill(0); runs.forEach(r => hist[r.cleared]++);
  const deaths = runs.filter(r => r.dead);
  return {
    label: `${c.diff} · ${c.kind}`, n,
    clearL1: reach(1), reachL3: reach(2), reachL5: reach(4), all: reach(MAX_LEVELS),
    medLv: pctl(runs.map(r => r.cleared), 0.5), meanLv: mean(runs.map(r => r.cleared)),
    score: mean(runs.map(r => r.score)), s10: pctl(runs.map(r => r.score), 0.1), s50: pctl(runs.map(r => r.score), 0.5), s90: pctl(runs.map(r => r.score), 0.9),
    acc: mean(acc), early: mean(runs.map(r => r.early / Math.max(1, r.miss))),
    firstCatch: pctl(runs.filter(r => r.firstCatch !== null).map(r => r.firstCatch), 0.5),
    noCatch: runs.filter(r => r.firstCatch === null).length / n,
    pipPerSong: mean(runs.map(r => r.helpers / Math.max(1, r.levels.length))),
    pipShare: mean(runs.map(r => r.playTime ? r.pipTime / r.playTime : 0)),
    savedPerSong: mean(runs.map(r => r.saved / Math.max(1, r.levels.length))),
    firstPip: pctl(runs.filter(r => r.firstPip !== null).map(r => r.firstPip), 0.5),
    neverPip: runs.filter(r => r.firstPip === null).length / n,
    dead: deaths.length / n, deathWithPip: deaths.filter(r => r.deathWithPip).length / n,
    perLevel, hist
  };
}

const LVN = Array.from({ length: MAX_LEVELS }, (_, i) => NAMES[i % 4] + (i >= 4 ? '²' : ''));
function tables(S, title) {
  let md = `## ${title}\n\n`;
  md += '### Overview\n\n| cell | runs | clear L1 | reach L3 | reach L5 (lap 2) | clear all 8 | median levels | accuracy | early share of misses | score p10 / p50 / p90 | first catch (s) | Pip visits / song | Pip on screen (% of play) | saves / song | first Pip (s) | never met Pip |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const s of S) md += `| ${s.label} | ${s.n} | ${P(s.clearL1)} | ${P(s.reachL3)} | ${P(s.reachL5)} | ${P(s.all)} | ${s.medLv} | ${P(s.acc)} | ${P(s.early)} | ${K(s.s10)} / ${K(s.s50)} / ${K(s.s90)} | ${s.noCatch > 0.5 ? 'never' : F(s.firstCatch, 1)} | ${F(s.pipPerSong, 2)} | ${P(s.pipShare)} | ${F(s.savedPerSong, 2)} | ${s.neverPip > 0.5 ? '–' : F(s.firstPip, 1)} | ${P(s.neverPip)} |\n`;
  md += '\n### Survival per level (clear rate of the runs that reached it; n reached in brackets)\n\n| cell | ' + LVN.join(' | ') + ' |\n|---|' + '---|'.repeat(MAX_LEVELS) + '\n';
  for (const s of S) md += `| ${s.label} | ` + s.perLevel.map(l => l.reached ? `${P(l.clear)} (${l.reached})` : '–').join(' | ') + ' |\n';
  md += '\n### Levels cleared: distribution (% of runs)\n\n| cell | ' + Array.from({ length: MAX_LEVELS + 1 }, (_, i) => i).join(' | ') + ' |\n|---|' + '---|'.repeat(MAX_LEVELS + 1) + '\n';
  for (const s of S) md += `| ${s.label} | ` + s.hist.map(h => h ? (100 * h / s.n).toFixed(0) : '·').join(' | ') + ' |\n';
  return md + '\n';
}

/* ===================== chart analysis (no player needed) ===================== */
function chartAnalysis(DD) {
  let md = '## Chart analysis (30 seeds per difficulty)\n\n| diff | level | bpm | song s | notes | notes/s | gold | eighth-gap lane jumps | approach s |\n|---|---|---|---|---|---|---|---|---|\n';
  for (const d of ['easy', 'normal', 'hard']) for (let L = 0; L < MAX_LEVELS; L++) {
    let notes = 0, song = 0, gold = 0, ej = 0, bpm = 0, ap = 0; const SEEDS = 30;
    for (let s = 1; s <= SEEDS; s++) {
      const w = new DD.World({ seed: s * 13, config: DD.DIFFICULTY[d] }); w.startLevel(L);
      const ns = w.notes; bpm = w.bpm; ap = w.approach; notes += ns.length; song += w.songLen;
      gold += ns.filter(n => n.kind === 'gold').length;
      for (let i = 1; i < ns.length; i++) if (ns[i].lane !== ns[i - 1].lane && ns[i].beat - ns[i - 1].beat <= 0.5 + 1e-9) ej++;
    }
    md += `| ${d} | ${L + 1} ${LVN[L]} | ${bpm} | ${F(song / SEEDS)} | ${F(notes / SEEDS)} | ${F(notes / song, 2)} | ${F(gold / SEEDS, 1)} | ${F(ej / SEEDS, 2)} | ${F(ap, 2)} |\n`;
  }
  return md + '\n';
}

/* ===================== main ===================== */
async function main() {
  const args = process.argv.slice(2);
  const runs = args.includes('--runs') ? +args[args.indexOf('--runs') + 1] : 40;
  const only = args.includes('--only') ? args[args.indexOf('--only') + 1].split(',') : Object.keys(VARIANTS);
  const DD = load();
  const outDir = path.join(__dirname, 'results');
  fs.mkdirSync(outDir, { recursive: true });
  const cl = cells(runs);
  const hdr = (t) => `# Momo's Dino Drums — ${t}\n\nGenerated by \`node tests/sim/run.js --runs ${runs}\` on ${new Date().toISOString().slice(0, 10)} (dt ${DT.toFixed(4)} s, max ${MAX_LEVELS} levels per run, deterministic seeds).\n\n`;
  const t0 = Date.now(), res = {};
  for (const v of only) {
    const over = VARIANTS[v];
    const by = await runAll(cl, over);
    const S = cl.map((c, i) => summarize(c, by[i]));
    res[v] = S;
    const cfgTxt = Object.keys(over).length ? 'Overrides on top of `DD.DIFFICULTY`:\n```js\n' + JSON.stringify(over) + '\n```\n\n' : 'Current `DD.DIFFICULTY` (no overrides).\n\n';
    fs.writeFileSync(path.join(outDir, v + '.md'), hdr(v) + cfgTxt + tables(S, v) + (v === 'baseline' ? chartAnalysis(DD) : ''));
    fs.writeFileSync(path.join(outDir, v + '.json'), JSON.stringify(S));
    console.log(v, 'done', ((Date.now() - t0) / 1000).toFixed(0) + ' s');
    S.forEach(s => console.log(s.label.padEnd(24), 'L1', P(s.clearL1).padStart(5), 'L3', P(s.reachL3).padStart(5), 'L5', P(s.reachL5).padStart(5), 'all', P(s.all).padStart(5), 'acc', P(s.acc).padStart(5), 'p50', K(s.s50).padStart(6), 'pip/song', F(s.pipPerSong, 2), 'saves/song', F(s.savedPerSong, 2)));
  }
  // compare + summary from whatever JSONs exist
  const J = {};
  for (const v of Object.keys(VARIANTS)) { const f = path.join(outDir, v + '.json'); if (fs.existsSync(f)) J[v] = JSON.parse(fs.readFileSync(f, 'utf8')); }
  if (J.baseline && J.noHelper) {
    let md = hdr('with Pip vs without Pip') + 'Each cell: **with Pip** (baseline) vs without Pip (`helperCombo: 1e9`).\n\n| cell | clear L1 | reach L3 | reach L5 | median levels | accuracy | score p50 | Pip visits / song | saves / song |\n|---|---|---|---|---|---|---|---|---|\n';
    J.baseline.forEach((b, i) => {
      const o = J.noHelper[i], c = (f) => `**${f(b)}** / ${f(o)}`;
      md += `| ${b.label} | ${c(s => P(s.clearL1))} | ${c(s => P(s.reachL3))} | ${c(s => P(s.reachL5))} | ${c(s => String(s.medLv))} | ${c(s => P(s.acc))} | ${c(s => K(s.s50))} | ${F(b.pipPerSong, 2)} | ${F(b.savedPerSong, 2)} |\n`;
    });
    fs.writeFileSync(path.join(outDir, 'compare.md'), md);
  }
  if (J.baseline) {
    const B = J.baseline, by = l => B.find(s => s.label === l) || {};
    const pick = ['easy · toddler', 'easy · kid', 'normal · kid', 'normal · casual', 'hard · casual', 'easy · bot:0.2', 'normal · bot:0.4', 'normal · bot:0.6', 'hard · bot:0.6', 'normal · spamBoth', 'normal · beatBoth', 'hard · spamBoth', 'easy · spamFast', 'easy · idle', 'normal · idle'];
    let md = hdr('summary (headline numbers)') + '| player | clear L1 | reach L3 | reach L5 | median levels | accuracy | score p50 | Pip visits / song | saves / song | first Pip (s) |' + (J.noHelper ? ' L1 clear without Pip |' : '') + '\n|---|---|---|---|---|---|---|---|---|---|' + (J.noHelper ? '---|' : '') + '\n';
    for (const l of pick) {
      const s = by(l); if (!s.label) continue;
      const o = J.noHelper && J.noHelper.find(x => x.label === l);
      md += `| ${l} | ${P(s.clearL1)} | ${P(s.reachL3)} | ${P(s.reachL5)} | ${s.medLv} | ${P(s.acc)} | ${K(s.s50)} | ${F(s.pipPerSong, 2)} | ${F(s.savedPerSong, 2)} | ${s.neverPip > 0.5 ? '–' : F(s.firstPip, 1)} |` + (o ? ` ${P(o.clearL1)} |` : '') + '\n';
    }
    md += '\nFull tables: `baseline.md`, `noHelper.md`, `compare.md`.\n';
    fs.writeFileSync(path.join(outDir, 'summary.md'), md);
    console.log('summary.md written');
  }
}
module.exports = { simRun, summarize, MAX_LEVELS };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
