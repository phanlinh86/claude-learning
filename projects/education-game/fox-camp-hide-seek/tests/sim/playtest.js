#!/usr/bin/env node
// High-speed headless playtest (report-only): many sessions per age × driver, every session simulated at full speed.
//   node tests/sim/playtest.js                         → n = 100 per age × driver (2 500 sessions), tests/sim/out/playtest.md
//   node tests/sim/playtest.js --n 40 --config '{"chapterTimeLimit":80}'    (--fast: 1/60 s sub-steps, ≈ 3× quicker, same timings ± 0.5 s)
// Drivers: bot0.5 bot0.8 bot1 (FC.Bot, think 1.0–2.4 s), typical (per-age child model, tests/sim/lib.js), tapper (random taps).
// Targets: typical 4-year-old chapter mean 60–100 s; typical sessions ≤ 8 min; every session finishes; no NaN.
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 100), config = JSON.parse(get('config', '{}'));
if (args.includes('--fast')) config.step = 1 / 60;
const DRIVERS = get('drivers', 'bot0.5,bot0.8,bot1,typical,tapper').split(','), AGES = get('ages', '3,4,5,6,7').split(',').map(Number);
const VPS = Object.keys(L.VIEWPORTS);

const t0 = Date.now(), rows = [], all = [];
for (const age of AGES) for (const driver of DRIVERS) {
  const S = [];
  for (let k = 0; k < N; k++) S.push(L.runSession({ age, driver, seed: 1000 + k * 17 + age, lang: k % 2 ? 'vi' : 'en', vp: VPS[k % VPS.length], config }));
  all.push(...S);
  const ok = S.filter(s => s.done), chaps = [].concat(...ok.map(s => s.chapters)), ses = ok.map(s => s.sessionTime);
  const rs = [].concat(...ok.map(s => s.roundStars)), hops = ok.reduce((a, s) => a + s.finds, 0);
  const share = v => (100 * rs.filter(x => x === v).length / Math.max(1, rs.length)).toFixed(0);
  const cut = [].concat(...ok.map(s => s.rounds)).filter(r => r < 4).length / Math.max(1, chaps.length);
  rows.push({ age, driver, n: S.length, done: ok.length, chap: L.mean(chaps), chapP90: L.pct(chaps, 0.9), ses: L.mean(ses), sesP90: L.pct(ses, 0.9),
    sesMax: Math.max(...ses), hint: ok.reduce((a, s) => a + s.hints, 0) / Math.max(1, hops), wrong: ok.reduce((a, s) => a + s.wrong, 0) / Math.max(1, hops),
    s3: share(3), s2: share(2), s1: share(1), cut, shrunk: ok.reduce((a, s) => a + s.shrunk, 0) / Math.max(1, rs.length),
    stuck: S.filter(s => s.stuck).length, nan: S.filter(s => s.nan).length, maxAsk: Math.max(...ok.map(s => s.maxAsk)) });
}

let md = `## Playtest — ${all.length} sessions (${N} per age × driver, en/vi, 4 viewports)${Object.keys(config).length ? ' · config ' + JSON.stringify(config) : ''}\n\n`;
md += '| age | driver | done | chapter mean / p90 (s) | session mean / p90 / max (s) | hints / ask | wrong / ask | rounds ★★★ / ★★ / ★ (%) | chapters cut to 3 rounds | rounds with smaller places | longest ask (s) |\n';
md += '|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.age} | ${r.driver} | ${r.done}/${r.n} | ${L.f1(r.chap)} / ${L.f1(r.chapP90)} | ${r.ses.toFixed(0)} / ${r.sesP90.toFixed(0)} / ${r.sesMax.toFixed(0)} | ${r.hint.toFixed(2)} | ${r.wrong.toFixed(2)} | ${r.s3} / ${r.s2} / ${r.s1} | ${(100 * r.cut).toFixed(0)} % | ${(100 * r.shrunk).toFixed(0)} % | ${r.maxAsk.toFixed(0)} |\n`;

const typ4 = rows.find(r => r.age === 4 && r.driver === 'typical');
const typ = rows.filter(r => r.driver === 'typical');
const v = [
  ['typical 4-year-old chapter mean in 60–100 s', typ4 && typ4.chap >= 60 && typ4.chap <= 100, typ4 ? L.f1(typ4.chap) + ' s' : '–'],
  ['typical child sessions ≤ 8 min (max over all ages)', typ.length && Math.max(...typ.map(r => r.sesMax)) <= 480, typ.length ? Math.max(...typ.map(r => r.sesMax)).toFixed(0) + ' s' : '–'],
  ['every session finished (incl. the random tapper)', rows.every(r => r.done === r.n), rows.reduce((a, r) => a + r.done, 0) + '/' + all.length],
  ['no stuck state / NaN', rows.every(r => !r.stuck && !r.nan), rows.reduce((a, r) => a + r.stuck, 0) + ' / ' + rows.reduce((a, r) => a + r.nan, 0)]
];
md += '\n### Verdict\n\n' + v.map(([k, ok, val]) => `- ${ok ? 'PASS' : 'FAIL'} ${k}: ${val}`).join('\n') + '\n';
md += `\n_${((Date.now() - t0) / 1000).toFixed(0)} s wall_\n`;
const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'playtest.md'), md);
console.log(md);
process.exit(v.every(x => x[1]) ? 0 : 1);
