// Bolt's Rooftop Flip — high-speed playtest runner (headless, all CPU cores).
//   node tests/sim/run.js                 baseline: every section → results/baseline.{json,md}
//   node tests/sim/run.js --proposal      the CONFIG proposal applied in memory → results/proposal.{json,md}
//   node tests/sim/run.js --patched FILE  load FILE as world.js (a copy with proposal.patch applied) → results/patched.*
//   node tests/sim/run.js --compare       before/after tables from baseline.json + proposal.json → results/compare.md
//   --seeds N (default 100 rounds per row)   --time S (default 600 s cap per round)   --only bots,humans,exploits,…
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Worker, isMainThread, parentPort, workerData } = require('worker_threads');
const L = require('./lib');
const P = require('./players');

const OUT = path.join(__dirname, 'results');
const PROPOSAL = require('./proposal-config.json');
const DIFFS = ['easy', 'normal', 'hard'];

// ---------- players (by key) ----------
const PLAYERS = {
  bot1: RF => P.botPlayer(RF, 1), bot08: RF => P.botPlayer(RF, 0.8), bot05: RF => P.botPlayer(RF, 0.5), bot03: RF => P.botPlayer(RF, 0.3),
  kid: (RF, s) => P.kidPlayer(RF, s),
  kid4: (RF, s) => P.kidPlayer(RF, s, { name: 'kid4', react: [0.8, 1.1], bias: 0.12, errSd: 0.22, forget: 0.08, randomRate: 0.12, misread: 0.10, double: 0.15 }),
  kid6: (RF, s) => P.kidPlayer(RF, s, { name: 'kid6', react: [0.6, 0.8], bias: 0.06, errSd: 0.14, forget: 0.03, randomRate: 0.05, misread: 0.04, double: 0.06 }),
  adult: (RF, s) => P.adultPlayer(RF, s),
  colourIgnorer: (RF, s) => P.colourIgnorer(RF, s),
  hazardOnly: (RF, s) => P.hazardOnly(RF, s),
  never: () => P.neverTap(),
  pingPong: () => P.pingPong(),
  spam80: (RF, s) => P.spamPlayer(RF, s, 80), spam150: (RF, s) => P.spamPlayer(RF, s, 150), spam250: (RF, s) => P.spamPlayer(RF, s, 250),
  spam400: (RF, s) => P.spamPlayer(RF, s, 400), spam700: (RF, s) => P.spamPlayer(RF, s, 700), spam1000: (RF, s) => P.spamPlayer(RF, s, 1000)
};
const LABEL = {
  bot1: 'bot skill 1', bot08: 'bot skill 0.8', bot05: 'bot skill 0.5', bot03: 'bot skill 0.3',
  kid: 'kid 4–6 (base)', kid4: 'kid, struggling 4 y', kid6: 'kid, steady 6 y', adult: 'casual adult',
  colourIgnorer: 'colour-ignorer (adult)', hazardOnly: 'hazards only (adult)', never: 'never taps', pingPong: 'flip on every landing',
  spam80: 'spam every 80 ms', spam150: 'spam 150 ms', spam250: 'spam 250 ms', spam400: 'spam 400 ms', spam700: 'spam 700 ms', spam1000: 'spam 1000 ms'
};
const SECTIONS = {
  bots: ['bot1', 'bot08', 'bot05', 'bot03'],
  humans: ['kid4', 'kid', 'kid6', 'adult', 'colourIgnorer', 'hazardOnly'],
  exploits: ['never', 'pingPong', 'spam80', 'spam150', 'spam250', 'spam400', 'spam700', 'spam1000']
};

function rfFor(cfg) {
  if (cfg.patched) return L.makeRF({ worldSrc: fs.readFileSync(cfg.patched, 'utf8') });
  return L.makeRF(cfg.proposal ? { overrides: PROPOSAL.overrides } : (cfg.overrides ? { overrides: cfg.overrides } : {}));
}

// ---------- worker ----------
if (!isMainThread) {
  const RF = rfFor(workerData.cfg);
  parentPort.on('message', job => {
    if (job === 'exit') process.exit(0);
    const out = [];
    for (const s of job.seeds) {
      const m = L.runGame(RF, PLAYERS[job.player](RF, s), { diff: job.diff, seed: s, maxTime: job.time, dt: job.dt });
      delete m.pstats; out.push(m);
    }
    parentPort.postMessage({ id: job.id, out });
  });
  return;
}

/** Run jobs [{player, diff, seeds, time}] on a worker pool → { 'player|diff': [metrics…] } */
function pool(cfg, jobs) {
  const n = Math.max(1, Math.min(os.cpus().length, 8));
  const res = {}, queue = [];
  jobs.forEach((j, i) => {
    for (let a = 0; a < j.seeds.length; a += 10) queue.push(Object.assign({}, j, { id: i, seeds: j.seeds.slice(a, a + 10) }));
  });
  return new Promise(resolve => {
    let busy = 0, done = 0;
    const total = queue.length;
    const ws = [];
    for (let k = 0; k < n; k++) {
      const w = new Worker(__filename, { workerData: { cfg } });
      ws.push(w);
      const next = () => { const j = queue.shift(); if (j) { busy++; w.postMessage(j); } };
      w.on('message', msg => {
        busy--; done++;
        const j = jobs[msg.id], key = j.player + '|' + j.diff;
        (res[key] = res[key] || []).push(...msg.out);
        if (done % 20 === 0) process.stderr.write('\r  ' + done + '/' + total + ' batches');
        if (done === total) { ws.forEach(x => x.postMessage('exit')); process.stderr.write('\n'); resolve(res); } else next();
      });
      next();
    }
  });
}

// ---------- single-thread extras ----------
/** Latest safe flip: seconds before Bolt's centre reaches the hazard's near edge (hand-made track, one hazard). */
function lateLimits(RF) {
  const rows = [];
  for (const diff of DIFFS) for (const zone of [0, 3]) {
    const row = { diff, zone: RF.World.CONFIG.zones[zone].key };
    for (const kind of ['vent0', 'vent1', 'sign0', 'gap1.0', 'gap1.8']) {
      let lo = -0.6, hi = 1.0;                        // binary search on time-to-edge at the tap
      const ok = tte => {
        const w = new RF.World({ seed: 1, difficulty: diff, width: 960, height: 540, level: zone });
        const spec = { finish: null };
        const k = kind.slice(0, 3);
        if (k === 'gap') { const gw = +kind.slice(3); spec.roofs = [[-50, 8], [8 + gw, 5000]]; }
        else if (k === 'ven') { const v = +kind.slice(4); spec.obstacles = [{ kind: 'vent', variant: v, x: 8 + RF.World.CONFIG.obstacles.vent[v].w / 2 }]; }
        else spec.obstacles = [{ kind: 'sign', variant: 0, x: 8 + RF.World.CONFIG.obstacles.sign[0].w / 2 }];
        if (k === 'sig') { w.setTrack(spec); w.flip(); for (let i = 0; i < 72; i++) w.update(1 / 120); w.drainEvents(); }  // start on the rail
        else w.setTrack(spec);
        // after the pre-flip the hazard moved closer; recompute the edge position from the track itself
        const edge = k === 'gap' ? w.roofs[0].x1 : w.obstacles[0].x - w.obstacles[0].w / 2;
        let flipped = false;
        for (let i = 0; i < 1200; i++) {
          if (!flipped && (edge - w.hero.x) / w.speed <= tte) { w.flip(); flipped = true; }
          w.update(1 / 120);
          for (const e of w.drainEvents()) if (e.type === 'bump' || e.type === 'fall') return false;
        }
        return true;
      };
      for (let it = 0; it < 18; it++) { const mid = (lo + hi) / 2; if (ok(mid)) hi = mid; else lo = mid; }
      row[kind] = Math.round(hi * 1000);
    }
    const w = new RF.World({ seed: 1, difficulty: diff, level: zone }), G = RF.World.CONFIG.gen;
    const S = w._capFor(w.plans[0]) , F = S * w.flightTime();
    row.early = Math.round(1000 * (2 * F + G.margin * w.layout.unit) / S);   // guaranteed-safe early bound (rule 2)
    row.speed = (w.speed / w.layout.unit).toFixed(2);
    rows.push(row);
  }
  return rows;
}

/** Determinism: (a) same seed + same player twice → identical; (b) replay the recorded taps by sub-step index. */
function determinism(RF) {
  const res = [];
  for (const diff of DIFFS) for (const pk of ['bot05', 'kid']) {
    const tr = [];
    const a = L.runGame(RF, PLAYERS[pk](RF, 5), { diff, seed: 5, maxTime: 240, trace: tr });
    const b = L.runGame(RF, PLAYERS[pk](RF, 5), { diff, seed: 5, maxTime: 240 });
    // replay: drive _step directly, tap at the recorded sub-step indices (frame-rate independent by construction)
    const w = new RF.World({ seed: 5, difficulty: diff, width: 960, height: 540 }), h = RF.World.CONFIG.step;
    let k = 0, step = 0;
    const nSteps = Math.round(a.time / h) + 2;
    for (; step < nSteps && w.phase === 'run'; step++) {
      while (k < tr.length && tr[k] === step) { w.flip(); k++; }
      w._step(h);
    }
    res.push({ diff, player: pk, repeatSame: a.finalHash === b.finalHash, replayScore: w.score, liveScore: a.score, replaySame: w.score === a.score && w.hearts === a.hearts });
  }
  return res;
}
/** Frame-rate independence of whole runs (bot reacts per frame, so only the distribution should match). */
async function frameRates(cfg, seeds) {
  const jobs = [];
  for (const dt of [1 / 30, 1 / 60, 1 / 144]) jobs.push({ player: 'bot05', diff: 'normal', seeds, time: 600, dt, tag: dt });
  const out = [];
  for (const j of jobs) { const r = await pool(cfg, [j]); out.push(['bot 0.5 normal @' + Math.round(1 / j.dt) + ' fps', L.summarise(r['bot05|normal'])]); }
  return out;
}
/** Level pacing over two rounds (bot skill 1, 20 min cap): seconds per level index. */
function loopPacing(RF) {
  const rows = [];
  for (const diff of DIFFS) {
    const per = {};
    for (let s = 1; s <= 4; s++) {
      const m = L.runGame(RF, PLAYERS.bot1(RF, s), { diff, seed: s, maxTime: 1200 });
      m.levelT.forEach((x, i) => { (per[i] = per[i] || []).push(x); });
    }
    rows.push({ diff, t: Object.keys(per).slice(0, 12).map(i => L.f(L.mean(per[i]), 1)) });
  }
  return rows;
}

/** Track density per level (bot skill 1 plays one round; everything the generator made is counted per level). */
function density(RF) {
  const rows = [];
  for (const diff of DIFFS) {
    const acc = [0, 1, 2, 3].map(() => ({ hz: 0, gaps: 0, alt: 0, ff: 0, gates: 0, t: 0 }));
    for (let s = 1; s <= 3; s++) {
      const w = new RF.World({ seed: s, difficulty: diff }), bot = new RF.Bot(w, { skill: 1, seed: s });
      const seenH = new Set(), seenF = new Set(), seenG = new Set();
      let last = null, lvT = 0, lv = 0;
      while (w.level < 4 && w.time < 400) {
        bot.step(1 / 60); w.update(1 / 60);
        for (const e of w.drainEvents()) if (e.type === 'levelUp') { acc[lv].t += w.time - lvT; lvT = w.time; lv = w.level; }
        const lvAt = x => w._planAt(x).level;
        for (const h of w.hazards) if (!seenH.has(h)) {
          seenH.add(h); const l = lvAt(h.x0); if (l > 3) continue;
          acc[l].hz++; if (h.kind === 'gap') acc[l].gaps++; if (last && last.side !== h.side) acc[l].alt++; last = h;
        }
        for (const f of w.fireflies) if (!seenF.has(f.id)) { seenF.add(f.id); const l = lvAt(f.baseX); if (l <= 3) acc[l].ff++; }
        for (const g of w.gates) if (!seenG.has(g.id)) { seenG.add(g.id); const l = lvAt(g.x); if (l <= 3) acc[l].gates++; }
      }
    }
    rows.push({ diff, z: acc.map(a => ({ hzMin: 60 * a.hz / a.t, gapPct: 100 * a.gaps / a.hz, forcedMin: 60 * a.alt / a.t, ffMin: 60 * a.ff / a.t, gates: a.gates / 3 })) });
  }
  return rows;
}

// ---------- report ----------
function md(label, R) {
  const C = L.COLS, parts = ['# Playtest sims — ' + label, '', 'rounds per row: ' + R.seeds + ', cap ' + R.time + ' s, 960×540, dt 1/60', ''];
  for (const sec of Object.keys(SECTIONS)) {
    if (!R.rows[sec]) continue;
    const rows = [];
    for (const d of DIFFS) for (const p of SECTIONS[sec]) if (R.rows[sec][p + '|' + d]) rows.push([d + ' · ' + LABEL[p], R.rows[sec][p + '|' + d]]);
    parts.push('## ' + sec + ' — survival', '', L.table(rows, 'diff · player', C.survival), '');
    parts.push('## ' + sec + ' — scoring', '', L.table(rows, 'diff · player', C.scoring), '');
    if (sec !== 'exploits') parts.push('## ' + sec + ' — level time (p50 of rounds that cleared it)', '', L.table(rows, 'diff · player', C.pacing), '');
    parts.push('## ' + sec + ' — health', '', L.table(rows, 'diff · player', C.health), '');
  }
  if (R.late) {
    parts.push('## Timing window (ms of time-to-edge at the tap): latest safe tap per hazard, and the guaranteed-safe earliest tap', '',
      '| diff | zone | speed u/s | vent AC | vent chimney | sign | gap 1.0 u | gap 1.8 u | earliest guaranteed |', '|---|---|---|---|---|---|---|---|---|',
      ...R.late.map(r => `| ${r.diff} | ${r.zone} | ${r.speed} | ${r.vent0} | ${r.vent1} | ${r['sign0']} | ${r['gap1.0']} | ${r['gap1.8']} | ${r.early} |`), '');
  }
  if (R.density) parts.push('## Track density (per minute of play; gates per level)', '', '| diff | ' + ['dawn', 'noon', 'sunset', 'night'].map(z => z + ' hazards / forced flips / gap % / fireflies / gates').join(' | ') + ' |', '|---|---|---|---|---|',
    ...R.density.map(r => '| ' + r.diff + ' | ' + r.z.map(a => [L.f(a.hzMin, 1), L.f(a.forcedMin, 1), L.f(a.gapPct, 0), L.f(a.ffMin, 0), L.f(a.gates, 1)].join(' / ')).join(' | ') + ' |'), '');
  if (R.det) parts.push('## Determinism', '', '| diff | player | same seed twice | replay by sub-step = live |', '|---|---|---|---|',
    ...R.det.map(r => `| ${r.diff} | ${r.player} | ${r.repeatSame} | ${r.replaySame} (${r.replayScore} vs ${r.liveScore}) |`), '');
  if (R.fps) parts.push('## Frame rate', '', L.table(R.fps, 'run', L.COLS.survival.concat(L.COLS.pacing)), '');
  if (R.loop) parts.push('## Level time over two rounds (bot skill 1, mean s per level 1…12)', '', '| diff | ' + R.loop[0].t.map((_, i) => 'L' + (i + 1)).join(' | ') + ' |',
    '|---|' + R.loop[0].t.map(() => '---|').join(''), ...R.loop.map(r => '| ' + r.diff + ' | ' + r.t.join(' | ') + ' |'), '');
  return parts.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
  fs.mkdirSync(OUT, { recursive: true });
  if (args.includes('--compare')) return compare();
  const SEEDS = +opt('--seeds', 100), TIME = +opt('--time', 600);
  const only = (opt('--only', 'bots,humans,exploits,late,density,det,fps,loop')).split(',');
  const patched = opt('--patched', null);
  const cfg = { proposal: args.includes('--proposal'), patched: patched && path.resolve(patched) };
  const label = (patched ? 'patched' : cfg.proposal ? 'proposal' : 'baseline') + (args.includes('--only') ? '-partial' : '');
  const seeds = Array.from({ length: SEEDS }, (_, i) => i + 1);
  const R = { label, seeds: SEEDS, time: TIME, rows: {} };
  const t0 = Date.now();
  for (const sec of Object.keys(SECTIONS)) {
    if (!only.includes(sec)) continue;
    const jobs = [];
    for (const d of DIFFS) for (const p of SECTIONS[sec]) jobs.push({ player: p, diff: d, seeds, time: TIME });
    process.stderr.write(sec + '\n');
    const res = await pool(cfg, jobs);
    R.rows[sec] = {};
    for (const k of Object.keys(res)) R.rows[sec][k] = L.summarise(res[k]);
  }
  const RF = rfFor(cfg);
  if (only.includes('late')) R.late = lateLimits(RF);
  if (only.includes('density')) R.density = density(RF);
  if (only.includes('det')) R.det = determinism(RF);
  if (only.includes('fps')) R.fps = await frameRates(cfg, seeds.slice(0, 40));
  if (only.includes('loop')) R.loop = loopPacing(RF);
  R.secs = (Date.now() - t0) / 1000;
  fs.writeFileSync(path.join(OUT, label + '.json'), JSON.stringify(R, null, 1));
  fs.writeFileSync(path.join(OUT, label + '.md'), md(label, R));
  process.stderr.write('done in ' + R.secs.toFixed(0) + ' s → results/' + label + '.md\n');
}

/** Before/after of the key rows. */
function compare() {
  const A = JSON.parse(fs.readFileSync(path.join(OUT, 'baseline.json'))), B = JSON.parse(fs.readFileSync(path.join(OUT, fs.existsSync(path.join(OUT, 'patched.json')) && process.argv.includes('--use-patched') ? 'patched.json' : 'proposal.json')));
  const keys = [['humans', 'kid4'], ['humans', 'kid'], ['humans', 'kid6'], ['humans', 'adult'], ['humans', 'colourIgnorer'], ['humans', 'hazardOnly'], ['bots', 'bot1'], ['bots', 'bot08'], ['bots', 'bot05'], ['bots', 'bot03'],
    ['exploits', 'never'], ['exploits', 'pingPong'], ['exploits', 'spam150'], ['exploits', 'spam400']];
  const C = L.COLS, cols = [C.survival[2], C.survival[3], C.survival[5], C.survival[6], C.survival[7], C.survival[8], C.scoring[1], C.scoring[4], C.scoring[5]];
  const parts = ['# Before / after (' + B.label + ')', ''];
  for (const d of DIFFS) {
    const rows = [];
    for (const [sec, p] of keys) {
      const a = A.rows[sec] && A.rows[sec][p + '|' + d], b = B.rows[sec] && B.rows[sec][p + '|' + d];
      if (a) rows.push([LABEL[p] + ' — before', a]);
      if (b) rows.push([LABEL[p] + ' — **after**', b]);
    }
    parts.push('## ' + d, '', L.table(rows, 'player', cols), '');
    const prow = [];
    for (const p of ['bot1', 'adult']) {
      const sec = p === 'adult' ? 'humans' : 'bots';
      if (A.rows[sec]) prow.push([LABEL[p] + ' — before', A.rows[sec][p + '|' + d]]);
      if (B.rows[sec]) prow.push([LABEL[p] + ' — **after**', B.rows[sec][p + '|' + d]]);
    }
    parts.push(L.table(prow, 'level time', C.pacing), '');
  }
  fs.writeFileSync(path.join(OUT, 'compare.md'), parts.join('\n'));
  console.log(parts.join('\n'));
}

main();
