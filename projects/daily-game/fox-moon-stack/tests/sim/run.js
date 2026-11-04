// Juno's Moon Stack — high-speed playtest runner.
//   node tests/sim/run.js                 baseline: all sections → results/baseline.{json,md}
//   node tests/sim/run.js --proposal      same with the CONFIG proposal applied in memory → results/proposal.{json,md}
//   node tests/sim/run.js --compare       before/after tables of the key rows → results/compare.md
//   node tests/sim/run.js --patched FILE  load FILE as world.js (e.g. a copy with proposal.patch applied) instead of overrides
//   --seeds N (default 40)  --time S (default 600)
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const P = require('./players');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = +opt('--seeds', 40), TIME = +opt('--time', 600);
const OUT = path.join(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });

/** The proposal (keep in sync with results/proposal.patch). */
const PROPOSAL = require('./proposal-config.json');

function msFor(kind, patched) {
  if (patched) return L.makeMS({ worldSrc: fs.readFileSync(patched, 'utf8') });
  return L.makeMS(kind === 'proposal' ? { overrides: PROPOSAL.overrides } : {});
}

const DIFFS = ['easy', 'normal', 'hard'];
const SKILLS = [0.2, 0.35, 0.5, 0.7, 0.9, 1.0];
const HUMANS = {
  kid: (MS, s) => P.kidPlayer(MS, s),
  kid6: (MS, s) => P.kidPlayer(MS, s, { name: 'kid6', react: [0.35, 0.65], k: 0.86, kSd: 0.1, aimSd: 0.16, random: 0.05, late: 0.08, distract: 0.05 }),
  adult: (MS, s) => P.adultPlayer(MS, s),
  spam: (MS, s) => P.spamPlayer(MS, s),
  waitPerfect: (MS, s) => P.perfectWaiter(MS, s),
  coinGreed: (MS, s) => P.coinGreed(MS, s)
};
const LAYOUTS = { 'phone-land 960x540': [960, 540], 'iPhone-portrait 390x844': [390, 844], 'iPad-portrait 820x1180': [820, 1180] };

function many(MS, mk, diff, o) {
  o = o || {}; const ms = [];
  for (let s = 1; s <= (o.seeds || SEEDS); s++) ms.push(L.runGame(MS, mk(MS, s), Object.assign({ diff, seed: s, maxTime: TIME }, o)));
  return ms;
}

/** Timing windows: how long (ms) a release stays perfect / stays at all, per pass over the tower. */
function windows(MS, diff, level, W, H) {
  const w = new MS.World({ seed: 3, difficulty: diff, width: W, height: H, level });
  w.setTower([0, 0, 0]);
  const per = 2 * Math.PI / w.planet.swingW, h = 1 / 120, pr = [], ok = [];
  let cp = 0, co = 0;
  for (let t = 0; t < 2 * per; t += h) {
    w.update(h); const p = w.predictLanding(); if (!p) continue;
    if (p.perfect) cp += h; else if (cp) { pr.push(cp); cp = 0; }
    if (p.ok) co += h; else if (co) { ok.push(co); co = 0; }
  }
  return { period: per, perfectMs: 1000 * L.mean(pr), stayMs: 1000 * L.mean(ok) };
}

/** One planet attempt from level `lv` (fresh hearts): clear %, planet time, hearts lost per 100 drops. */
function endless(MS, mk, diff, lv, seeds) {
  const ms = many(MS, mk, diff, { level: lv, stopAtLevel: 1, seeds, maxTime: 240 });
  const drops = ms.reduce((a, m) => a + m.drops, 0) || 1;
  const cl = ms.filter(m => m.levels >= 1);
  return {
    clear: 100 * cl.length / ms.length, time: L.q(cl.map(m => m.time), 0.5),
    lossPer100: 100 * ms.reduce((a, m) => a + m.lossMiss + m.lossTopple, 0) / drops,
    topplePer100: 100 * ms.reduce((a, m) => a + m.lossTopple, 0) / drops
  };
}

function runAll(kind, patched) {
  const MS = msFor(kind, patched), t0 = Date.now(), res = { kind, seeds: SEEDS, time: TIME, bots: {}, humans: {}, layouts: {}, windows: {}, endless: {} };
  for (const d of DIFFS) for (const s of SKILLS) res.bots[d + ' bot' + s] = L.summarise(many(MS, (MS2, sd) => P.botPlayer(MS2, s), d));
  for (const d of DIFFS) for (const [name, mk] of Object.entries(HUMANS)) res.humans[d + ' ' + name] = L.summarise(many(MS, mk, d));
  for (const [ln, [W, H]] of Object.entries(LAYOUTS)) for (const name of ['kid', 'kid6', 'adult'])
    for (const d of name === 'adult' ? ['normal', 'hard'] : ['easy']) res.layouts[ln + ' ' + d + ' ' + name] = L.summarise(many(MS, HUMANS[name], d, { width: W, height: H }));
  for (const d of DIFFS) for (const lv of [0, 1, 2, 3, 4, 8, 12, 16, 20]) res.windows[d + ' L' + lv] = windows(MS, d, lv, 960, 540);
  const eps = [['easy', 'kid6'], ['normal', 'adult'], ['hard', 'adult'], ['normal', 'bot0.7']];
  for (const [d, who] of eps) for (const lv of [0, 1, 2, 3, 4, 7, 8, 11, 12, 16, 20]) {
    const mk = who.startsWith('bot') ? (MS2) => P.botPlayer(MS2, +who.slice(3)) : HUMANS[who];
    res.endless[d + ' ' + who + ' L' + lv] = endless(MS, mk, d, lv, Math.min(SEEDS, 30));
  }
  res.secs = (Date.now() - t0) / 1000;
  return res;
}

function md(res) {
  const out = ['# Moon Stack sim — ' + res.kind + ' (' + res.seeds + ' seeds × ' + res.time + ' s cap, 960×540 unless noted; ' + res.secs.toFixed(0) + ' s wall)', ''];
  out.push('## MS.Bot grid', L.table(Object.entries(res.bots), 'diff / player'), '');
  out.push('## Human-like models', L.table(Object.entries(res.humans), 'diff / player'), '');
  out.push('## Device layouts', L.table(Object.entries(res.layouts), 'layout / diff / player'), '');
  out.push('## Timing windows (one pass over a 3-crate tower)', '| diff / level | swing period s | perfect window ms | stay window ms |', '|---|---|---|---|');
  for (const [k, v] of Object.entries(res.windows)) out.push('| ' + k + ' | ' + L.f(v.period, 2) + ' | ' + L.f(v.perfectMs, 0) + ' | ' + L.f(v.stayMs, 0) + ' |');
  out.push('', '## Endless pace (one planet from level L, fresh hearts)', '| diff / player / level | clear % | planet time p50 s | hearts lost /100 drops | of which topples |', '|---|---|---|---|---|');
  for (const [k, v] of Object.entries(res.endless)) out.push('| ' + k + ' | ' + L.f(v.clear, 0) + ' | ' + L.f(v.time, 0) + ' | ' + L.f(v.lossPer100, 1) + ' | ' + L.f(v.topplePer100, 1) + ' |');
  return out.join('\n') + '\n';
}

function compare(a, b) {
  const cols = [['P1 clear%', 'p1Clear', 0], ['over%', 'overPct', 0], ['surv p50 s', 'surv50', 0], ['planets p50', 'lv50', 0], ['P1 time s', 'p1T', 0],
    ['planet time s', 'lvlT', 0], ['perfect%', 'perfectPct', 0], ['miss%', 'missPct', 1], ['topple/100', 'topplePer100', 2], ['score p50', 'score50', 0], ['wait p50', 'wait50', 2]];
  const out = ['# Before → after (baseline → proposal)', ''];
  const sec = (title, A, B) => {
    out.push('## ' + title, '| row | ' + cols.map(c => c[0]).join(' | ') + ' |', '|' + '---|'.repeat(cols.length + 1));
    for (const k of Object.keys(A)) out.push('| ' + k + ' | ' + cols.map(c => L.f(A[k][c[1]], c[2]) + ' → ' + L.f(B[k][c[1]], c[2])).join(' | ') + ' |');
    out.push('');
  };
  sec('Human-like models', a.humans, b.humans); sec('Device layouts', a.layouts, b.layouts); sec('MS.Bot grid', a.bots, b.bots);
  out.push('## Timing windows ms (perfect / stay)', '| diff / level | before | after |', '|---|---|---|');
  for (const k of Object.keys(a.windows)) out.push('| ' + k + ' | ' + L.f(a.windows[k].perfectMs, 0) + ' / ' + L.f(a.windows[k].stayMs, 0) + ' | ' + L.f(b.windows[k].perfectMs, 0) + ' / ' + L.f(b.windows[k].stayMs, 0) + ' |');
  out.push('', '## Endless pace (clear % / planet time s / hearts lost per 100 drops)', '| diff / player / level | before | after |', '|---|---|---|');
  for (const k of Object.keys(a.endless)) { const x = a.endless[k], y = b.endless[k]; out.push('| ' + k + ' | ' + [L.f(x.clear, 0), L.f(x.time, 0), L.f(x.lossPer100, 1)].join(' / ') + ' | ' + [L.f(y.clear, 0), L.f(y.time, 0), L.f(y.lossPer100, 1)].join(' / ') + ' |'); }
  return out.join('\n') + '\n';
}

if (args.includes('--compare')) {
  const a = JSON.parse(fs.readFileSync(path.join(OUT, 'baseline.json'))), b = JSON.parse(fs.readFileSync(path.join(OUT, 'proposal.json')));
  fs.writeFileSync(path.join(OUT, 'compare.md'), compare(a, b));
  console.log('wrote results/compare.md');
} else {
  const patched = opt('--patched', null);
  const kind = patched ? 'patched' : args.includes('--proposal') ? 'proposal' : 'baseline';
  const res = runAll(kind, patched);
  fs.writeFileSync(path.join(OUT, kind + '.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(OUT, kind + '.md'), md(res));
  console.log('wrote results/' + kind + '.{json,md} in ' + res.secs.toFixed(1) + ' s');
}
