// Momo's Dino Drums — high-speed playtest (QA): goals check, before/after tuning, medal percentiles.
//
//   node tests/sim/playtest.js                     # baseline + proposed, 100 runs per cell
//   node tests/sim/playtest.js --runs 40 --only proposed
//
// Writes tests/sim/results/playtest-{baseline,proposed}.json and playtest.md.
// Never touches game code: 'proposed' is a per-difficulty override object applied on top of DD.DIFFICULTY.
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const { load } = require('../unit/load.js');
const { makePlayer } = require('./players.js');

const DT = 1 / 60;
const MAX_LEVELS = 8;

/* The proposal (docs/reports/playtest.md §6). Keys are DD.DIFFICULTY overrides. */
const PROPOSED = {
  easy: {},
  normal: { densStart: [1.5, 1.8, 2.3, 2.9] },
  hard: { goodWin: 0.09, missCost: 0.13, helperCooldown: 12 }
};
const VARIANTS = { baseline: { easy: {}, normal: {}, hard: {} }, proposed: PROPOSED };

/* ===================== one run ===================== */
function simRun(DD, diff, kind, seed, over) {
  const cfg = Object.assign({}, DD.DIFFICULTY[diff], over || {});
  const w = new DD.World({ seed, config: cfg });
  const p = makePlayer(DD, w, kind, seed);
  const rec = { levels: [], firstPoint: null, dead: false, pipTime: 0, playTime: 0, clearScores: [] };
  let cur = null;
  const newLevel = (e) => { cur = { level: e.level, cleared: false, t0: w.time, wall: 0, pip: 0, saved: 0 }; rec.levels.push(cur); };
  w.drainEvents().forEach(e => { if (e.type === 'level') newLevel(e); });
  while (w.time < 200 * MAX_LEVELS) {
    p.step(DT); w.update(DT);
    if (w.state === 'playing') { rec.playTime += DT; if (w.helper.state !== 'away') rec.pipTime += DT; }
    for (const e of w.drainEvents()) {
      switch (e.type) {
        case 'level': newLevel(e); break;
        case 'hit': if (rec.firstPoint === null) rec.firstPoint = w.time; break;
        case 'helperin': cur.pip++; break;
        case 'helpersave': cur.saved++; break;
        case 'cleared': cur.cleared = true; cur.wall = w.time - cur.t0; rec.clearScores.push(w.score); break;
        case 'dead': rec.dead = true; cur.wall = w.time - cur.t0; break;
      }
    }
    if (w.state === 'dead' || w.levelsCleared >= MAX_LEVELS) break;
  }
  const s = w.stats, tot = s.perfect + s.good + s.miss + s.saved;
  return Object.assign(rec, { score: w.score, cleared: w.levelsCleared, acc: tot ? (s.perfect + s.good) / tot : 0,
    saved: s.saved, helpers: s.helpers, maxCombo: w.maxCombo });
}

/* ===================== cells ===================== */
function cells(runs) {
  const out = [];
  for (const d of ['easy', 'normal', 'hard'])
    for (const s of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1]) out.push({ diff: d, kind: 'bot:' + s, runs: s === 1 ? 10 : runs });
  for (const d of ['easy', 'normal', 'hard'])
    for (const k of ['toddler3', 'toddler', 'kid', 'kid6', 'casual', 'veteran', 'camper']) out.push({ diff: d, kind: k, runs });
  for (const [d, k] of [['easy', 'spamFast'], ['easy', 'mashSlow'], ['easy', 'beatOne'], ['easy', 'idle'],
    ['normal', 'spamBoth'], ['normal', 'spamAlt'], ['normal', 'spamOne'], ['normal', 'spamFast'], ['normal', 'mashSlow'], ['normal', 'mashSlowBoth'], ['normal', 'beatBoth'], ['normal', 'beatOne'], ['normal', 'idle'],
    ['hard', 'spamBoth'], ['hard', 'spamAlt'], ['hard', 'mashSlowBoth'], ['hard', 'beatBoth'], ['hard', 'beatOne']])
    out.push({ diff: d, kind: k, runs: k === 'idle' ? 20 : runs });
  return out;
}

if (!isMainThread) {
  const DD = load();
  const { jobs, over } = workerData;
  parentPort.postMessage(jobs.map(j => { const r = simRun(DD, j.diff, j.kind, j.seed, over[j.diff]); r.cell = j.cell; return r; }));
  return;
}

function runAll(cl, over) {
  const jobs = [];
  cl.forEach((c, ci) => { for (let s = 1; s <= c.runs; s++) jobs.push({ cell: ci, diff: c.diff, kind: c.kind, seed: s * 131 + ci * 17 }); });
  const nW = Math.max(1, Math.min(os.cpus().length, 8)), parts = Array.from({ length: nW }, () => []);
  jobs.forEach((j, i) => parts[i % nW].push(j));
  return Promise.all(parts.map(p => new Promise((res, rej) => {
    const wk = new Worker(__filename, { workerData: { jobs: p, over } }); wk.on('message', res); wk.on('error', rej);
  }))).then(rs => { const by = cl.map(() => []); rs.flat().forEach(r => by[r.cell].push(r)); return by; });
}

const mean = a => a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN;
const pctl = (a, q) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(q * s.length))]; };
const P = x => isNaN(x) ? '–' : (100 * x).toFixed(0) + ' %';
const F = (x, d = 1) => isNaN(x) ? '–' : x.toFixed(d);
const K = x => isNaN(x) ? '–' : (x >= 1000 ? (x / 1000).toFixed(1) + 'k' : x.toFixed(0));

function summarize(c, runs) {
  const n = runs.length, reach = L => runs.filter(r => r.cleared >= L).length / n;
  const lv = runs.flatMap(r => r.levels), clearedLv = lv.filter(l => l.cleared);
  const fp = runs.filter(r => r.firstPoint !== null).map(r => r.firstPoint);
  return {
    label: `${c.diff} · ${c.kind}`, diff: c.diff, kind: c.kind, n,
    c1: reach(1), c2: reach(2), c3: reach(3), c4: reach(4), c8: reach(8), med: pctl(runs.map(r => r.cleared), 0.5),
    acc: mean(runs.map(r => r.acc)), s10: pctl(runs.map(r => r.score), 0.1), s50: pctl(runs.map(r => r.score), 0.5), s90: pctl(runs.map(r => r.score), 0.9),
    scores: runs.map(r => r.score), clearScores: runs.map(r => r.clearScores),
    firstPoint: pctl(fp, 0.5), noPoint: 1 - fp.length / n,
    wall: mean(clearedLv.map(l => l.wall)), wallMax: Math.max(0, ...clearedLv.map(l => l.wall)),
    pipSong: mean(lv.map(l => l.pip)), pipAny: mean(lv.map(l => l.pip > 0 ? 1 : 0)), savesSong: mean(lv.map(l => l.saved)),
    pipShare: mean(runs.map(r => r.playTime ? r.pipTime / r.playTime : 0)),
    wallBy: Array.from({ length: MAX_LEVELS }, (_, L) => mean(clearedLv.filter(l => l.level === L).map(l => l.wall)))
  };
}

function overview(S) {
  let md = '| cell | n | clear F1 | reach F3 | clear 4 (tower) | clear 8 | median floors | accuracy | score p10 / p50 / p90 | first point (s) | songs with Pip | Pip visits / song | Pip on screen | saves / song |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
  for (const s of S) md += `| ${s.label} | ${s.n} | ${P(s.c1)} | ${P(s.c2)} | ${P(s.c4)} | ${P(s.c8)} | ${s.med} | ${P(s.acc)} | ${K(s.s10)} / ${K(s.s50)} / ${K(s.s90)} | ${s.noPoint > 0.5 ? 'never' : F(s.firstPoint)} | ${P(s.pipAny)} | ${F(s.pipSong, 2)} | ${P(s.pipShare)} | ${F(s.savesSong, 2)} |\n`;
  return md;
}

async function main() {
  const a = process.argv.slice(2);
  const runs = a.includes('--runs') ? +a[a.indexOf('--runs') + 1] : 100;
  const only = a.includes('--only') ? a[a.indexOf('--only') + 1].split(',') : Object.keys(VARIANTS);
  const out = path.join(__dirname, 'results'); fs.mkdirSync(out, { recursive: true });
  const cl = cells(runs), t0 = Date.now();
  for (const v of only) {
    const by = await runAll(cl, VARIANTS[v]);
    const S = cl.map((c, i) => summarize(c, by[i]));
    fs.writeFileSync(path.join(out, `playtest-${v}.json`), JSON.stringify({ over: VARIANTS[v], runs, S }));
    console.log(v, 'done', ((Date.now() - t0) / 1000).toFixed(0) + ' s,', by.flat().length, 'runs');
  }
  const J = {};
  for (const v of Object.keys(VARIANTS)) { const f = path.join(out, `playtest-${v}.json`); if (fs.existsSync(f)) J[v] = JSON.parse(fs.readFileSync(f, 'utf8')); }
  let md = `# Momo's Dino Drums — playtest sim (\`node tests/sim/playtest.js --runs ${runs}\`, ${new Date().toISOString().slice(0, 10)})\n\nMax ${MAX_LEVELS} floors per run (two climbs of the tower). dt ${DT.toFixed(4)} s.\n\n`;
  for (const v of Object.keys(J)) md += `## ${v}\n\nOverrides: \`${JSON.stringify(J[v].over)}\`\n\n` + overview(J[v].S) + '\n';
  if (J.baseline && J.proposed) {
    md += '## before → after (key cells)\n\n| cell | clear F1 | reach F3 | clear 4 | clear 8 | median floors | score p50 | Pip on screen | saves / song |\n|---|---|---|---|---|---|---|---|---|\n';
    J.baseline.S.forEach((b, i) => {
      const o = J.proposed.S[i], f = (fn) => `${fn(b)} → **${fn(o)}**`;
      md += `| ${b.label} | ${f(s => P(s.c1))} | ${f(s => P(s.c2))} | ${f(s => P(s.c4))} | ${f(s => P(s.c8))} | ${f(s => String(s.med))} | ${f(s => K(s.s50))} | ${f(s => P(s.pipShare))} | ${f(s => F(s.savesSong, 2))} |\n`;
    });
  }
  if (J.baseline) {
    md += '\n## pacing: wall time per cleared floor (s, count-in + song + cleared moment)\n\n| cell | ' + Array.from({ length: MAX_LEVELS }, (_, i) => 'F' + (i + 1)).join(' | ') + ' |\n|---|' + '---|'.repeat(MAX_LEVELS) + '\n';
    for (const s of J.baseline.S.filter(s => ['easy · kid6', 'normal · kid6', 'normal · casual', 'hard · veteran'].includes(s.label))) md += `| ${s.label} | ` + s.wallBy.map(x => F(x)).join(' | ') + ' |\n';
  }
  // medal percentiles: realistic population per difficulty (humans only, no exploits / bots)
  const POP = { easy: ['toddler3', 'toddler', 'kid', 'kid6'], normal: ['kid', 'kid6', 'casual'], hard: ['casual', 'veteran'] };
  for (const v of Object.keys(J)) {
    md += `\n## medal percentiles (${v}; population per difficulty: ${JSON.stringify(POP)})\n\n| diff | p25 | p50 | p75 | p90 | p97 | median score at 1 / 2 / 4 / 8 floors cleared |\n|---|---|---|---|---|---|---|\n`;
    for (const d of ['easy', 'normal', 'hard']) {
      const cs = J[v].S.filter(s => s.diff === d && POP[d].includes(s.kind));
      const all = cs.flatMap(s => s.scores), at = L => pctl(cs.flatMap(s => s.clearScores.filter(x => x.length >= L).map(x => x[L - 1])), 0.5);
      md += `| ${d} | ${K(pctl(all, 0.25))} | ${K(pctl(all, 0.5))} | ${K(pctl(all, 0.75))} | ${K(pctl(all, 0.9))} | ${K(pctl(all, 0.97))} | ${K(at(1))} / ${K(at(2))} / ${K(at(4))} / ${K(at(8))} |\n`;
    }
  }
  fs.writeFileSync(path.join(out, 'playtest.md'), md);
  console.log('playtest.md written');
}
module.exports = { simRun, PROPOSED };
if (require.main === module) main().catch(e => { console.error(e); process.exit(1); });
