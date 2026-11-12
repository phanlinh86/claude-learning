#!/usr/bin/env node
// Biscuit's Kitchen Flight — high-speed playtest runner.
// Run from projects/daily-game/pup-kitchen-flight:
//   node tests/sim/run.js                 # baseline + recommended configs, all players, all difficulties
//   node tests/sim/run.js --quick         # fewer seeds (≈1/4)
//   node tests/sim/run.js --tags=base     # only the current game
//   node tests/sim/run.js --reach         # also the exact no-hit reachability proof (slow: ≈20 s per seed-minute)
// Writes tests/sim/out/rounds-<tag>.json, static-<tag>.json and summary.md (tables used by docs/reports/playtest.md).
'use strict';
const fs = require('fs');
const path = require('path');
const { fork } = require('child_process');
const os = require('os');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const arg = k => { const a = process.argv.find(s => s.startsWith('--' + k)); return a === undefined ? undefined : (a.includes('=') ? a.split('=')[1] : true); };
const QUICK = !!arg('quick');
const TAGS = (arg('tags') || 'base,rec,code').split(',');
const DIFFS = ['easy', 'normal', 'hard'];
const CAP = 300;       // s: five levels (Sunny → Rainy → Windy → Snowy → Sunny day 2)
const REACH_S = 250;   // s: covers Sunny, Rainy, Windy (gusts) and most of Snowy

/* ------------------------------------------------------------------ the recommended changes (passed through World `config`) */
const REC = {
  easy: {
    gravity: 850, flapVy: -350, maxFall: 290, tiltVyFull: 300,   // floatier hop: same ≈72 px rise, apex 0.41 s, falls ≈45 % slower
    hurtTime: 2.5, counterBounceVy: -520,                       // a 1–2 s pause costs one battery, not two or three
    batteries: 4, maxBatteries: 4, leavesPerBattery: 6,         // more slack and faster refills for little ones
    scrollSpeed: 140
  },
  normal: { gapMin: 180, leavesPerBattery: 25 },                // a casual adult usually reaches the night, rarely day 2
  hard: { leavesPerBattery: 30 }                                // refills stop out-pacing bumps
};
/* Optional CODE change (not a config key today), emulated by the harness: on Easy the counter is a free
 * trampoline (it bounces but costs no battery). Shown as tag `code` (Easy only) with the floaty physics and
 * the ORIGINAL 3 batteries, so the battery count of the requirement can stay as written. */
const CODE = { easy: { gravity: 850, flapVy: -350, maxFall: 290, tiltVyFull: 300, counterBounceVy: -520, scrollSpeed: 140, leavesPerBattery: 10 } };
const CONFIGS = { base: { easy: {}, normal: {}, hard: {} }, rec: REC, code: CODE };
const PATCH = { code: ['freeCounter'] };
const HUMANS = ['kid4', 'kid6', 'adult'];
const EXPLOITS = ['spam', 'ceiling', 'reckless', 'idle'];
const BOTS = ['bot0.3', 'bot0.5', 'bot0.7', 'bot0.85', 'bot1'];
const NS = { human: QUICK ? 50 : 200, exploit: QUICK ? 30 : 100, bot: QUICK ? 12 : 40 };

/* ------------------------------------------------------------------ job list */
const jobs = [];
for (const tag of TAGS) for (const diff of DIFFS) {
  const config = CONFIGS[tag][diff], patch = PATCH[tag] || [];
  if (!config) continue;
  for (const p of HUMANS) for (let s = 1; s <= NS.human; s++) jobs.push({ type: 'round', tag, diff, seed: s, player: p, cap: CAP, config, patch });
  for (const p of EXPLOITS) for (let s = 1; s <= NS.exploit; s++) jobs.push({ type: 'round', tag, diff, seed: s, player: p, cap: CAP, config, patch });
  for (const p of BOTS) for (let s = 1; s <= NS.bot; s++) jobs.push({ type: 'round', tag, diff, seed: 1000 + s, player: p, cap: CAP, config, patch });
  for (let s = 1; s <= (QUICK ? 50 : 300); s++) jobs.push({ type: 'first', tag, diff, seed: s, config });
  if (arg('reach')) for (let s = 1; s <= (QUICK ? 3 : 8); s++) jobs.push({ type: 'reach', tag, diff, seed: 500 + s, config, secs: REACH_S });
}
// expensive jobs first so the pool stays busy to the end
const cost = j => j.type === 'reach' ? 1e6 : j.type === 'first' ? 1 : (j.player.startsWith('bot') ? 100 : j.player === 'adult' ? 60 : 10);
jobs.sort((a, b) => cost(b) - cost(a));

/* ------------------------------------------------------------------ worker pool */
function runPool(list) {
  return new Promise(resolve => {
    const nW = Math.max(1, Math.min(os.cpus().length, 8)), results = [];
    let next = 0, live = 0, done = 0;
    const t0 = Date.now();
    const chunk = () => { const c = []; while (next < list.length && c.length < (list[next].type === 'reach' ? 1 : 8)) { c.push(list[next++]); if (c[0].type === 'reach') break; } return c; };
    for (let i = 0; i < nW; i++) {
      const wk = fork(path.join(__dirname, 'harness.js'), ['worker']);
      live++;
      const feed = () => { const c = chunk(); if (c.length) wk.send({ cmd: 'jobs', jobs: c }); else { wk.send({ cmd: 'exit' }); } };
      wk.on('message', m => {
        if (m.cmd !== 'done') return;
        results.push(...m.out); done += m.out.length;
        if (done % 400 < m.out.length) process.stderr.write(`  ${done}/${list.length} jobs, ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
        feed();
      });
      wk.on('exit', () => { if (--live === 0) resolve(results); });
      feed();
    }
  });
}

/* ------------------------------------------------------------------ stats helpers */
const q = (a, p) => { if (!a.length) return NaN; const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
const med = a => q(a, 0.5);
const pct = (n, d) => d ? (100 * n / d).toFixed(0) + ' %' : '–';
const f0 = v => (isFinite(v) ? v.toFixed(0) : '–'), f1 = v => (isFinite(v) ? v.toFixed(1) : '–');
const LABEL = require('./harness.js').PLAYERS;

function aggregate(rs) {
  const mins = rs.reduce((s, r) => s + r.t, 0) / 60;
  const sum = k => rs.reduce((s, r) => s + (typeof k === 'function' ? k(r) : r[k]), 0);
  const fp = rs.map(r => r.firstPoint).filter(v => v !== null);
  return {
    n: rs.length, mins,
    tMed: med(rs.map(r => r.t)), tP10: q(rs.map(r => r.t), 0.1), tP90: q(rs.map(r => r.t), 0.9),
    sMed: med(rs.map(r => r.score)), sP10: q(rs.map(r => r.score), 0.1), sP90: q(rs.map(r => r.score), 0.9),
    s60: rs.filter(r => r.t >= 60 || r.level >= 1).length / rs.length,
    z: [1, 2, 3, 4].map(L => rs.filter(r => r.level >= L).length / rs.length),
    fp: med(fp), lpm: sum('leaves') / mins, bpm: sum(r => r.bumps.length) / mins, bat: sum('batteryGains') / mins,
    fpm: sum('flaps') / mins, ceil: sum('ceilingT') / (mins * 60), passPm: sum('passed') / mins
  };
}

function causes(rs) {
  const all = rs.flatMap(r => r.bumps), n = all.length, by = {};
  for (const b of all) { const k = b.kind === 'counter' ? 'counter' : b.kind === 'stack' ? 'stack (' + b.rel + ')' : b.kind === 'hang' ? 'hanger ' + b.part + ' (' + b.rel + ')' : 'kettle (' + b.rel + ')'; by[k] = (by[k] || 0) + 1; }
  return { n, by, lapse: all.filter(b => b.paused).length / (n || 1) };
}

/** Bump rate (per s) in zone 2 during a gust or ≤1.5 s after it vs the rest of zone 2; after steam vs overall. */
function fairness(rs) {
  let gB = 0, gS = 0, z2B = 0, z2S = 0, sB = 0, sS = 0, allB = 0, allS = 0;
  for (const r of rs) {
    allS += r.t; allB += r.bumps.length;
    z2S += r.zone2Secs; gS += r.gusts * 4.0; sS += r.steamExits * 1.5;
    for (const b of r.bumps) {
      if (b.zone === 2) { z2B++; if (b.gustOn || (b.sinceGust >= 0 && b.sinceGust <= 4.0)) gB++; }
      if (!b.inSteam && b.sinceSteam >= 0 && b.sinceSteam <= 1.5) sB++;
    }
  }
  return { gust: gS ? gB / gS : NaN, calm: (z2S - gS) > 0 ? (z2B - gB) / (z2S - gS) : NaN, steam: sS ? sB / sS : NaN, all: allS ? allB / allS : NaN, gusts: gS / 4, exits: sS / 1.5 };
}

/* ------------------------------------------------------------------ main */
(async () => {
  const t0 = Date.now();
  process.stderr.write(`${jobs.length} jobs on ${os.cpus().length} cores (${QUICK ? 'quick' : 'full'})\n`);
  const res = await runPool(jobs);
  const L = [];
  const line = s => L.push(s);
  line(`# Playtest simulation summary\n\nGenerated by \`node tests/sim/run.js${process.argv.slice(2).length ? ' ' + process.argv.slice(2).join(' ') : ''}\` in ${((Date.now() - t0) / 1000).toFixed(0)} s. Cap ${CAP} s per round.\n`);
  line('Recommended config (tag `rec`):\n```json\n' + JSON.stringify(REC, null, 1) + '\n```\nOptional code change (tag `code`, Easy only, counter costs no battery):\n```json\n' + JSON.stringify(CODE, null, 1) + '\n```\n');
  for (const tag of TAGS) {
    const rounds = res.filter(r => r.type === 'round' && r.tag === tag);
    fs.writeFileSync(path.join(OUT, `rounds-${tag}.json`), JSON.stringify(rounds));
    fs.writeFileSync(path.join(OUT, `static-${tag}.json`), JSON.stringify(res.filter(r => r.type !== 'round' && r.tag === tag)));
    line(`\n## ${tag}: ${rounds.length} rounds\n`);
    for (const diff of DIFFS) {
      if (!CONFIGS[tag][diff]) continue;
      line(`\n### ${tag} / ${diff}\n`);
      line('| player | n | survival med (p10–p90) s | finishes Sunny (60 s) | reach Rainy / Windy / Snowy / Day 2 | score med (p10–p90) | 1st point s | leaves/min | bumps/min | batteries back/min | taps/min | at ceiling |');
      line('|---|---|---|---|---|---|---|---|---|---|---|---|');
      for (const p of [...HUMANS, ...BOTS, ...EXPLOITS]) {
        const rs = rounds.filter(r => r.diff === diff && r.player === p);
        if (!rs.length) continue;
        const a = aggregate(rs);
        line(`| ${LABEL[p].label} | ${a.n} | ${f0(a.tMed)} (${f0(a.tP10)}–${f0(a.tP90)}) | ${pct(a.s60 * a.n, a.n)} | ${a.z.map(v => (100 * v).toFixed(0)).join(' / ')} % | ${f0(a.sMed)} (${f0(a.sP10)}–${f0(a.sP90)}) | ${f1(a.fp)} | ${f0(a.lpm)} | ${f1(a.bpm)} | ${f1(a.bat)} | ${f0(a.fpm)} | ${(100 * a.ceil).toFixed(0)} % |`);
      }
      line('\nBump causes (share of all battery losses):\n');
      line('| player | bumps | counter | stack top | stack side | hanger underside | hanger side/top | chain/handle | kettle | in/just after a lapse |');
      line('|---|---|---|---|---|---|---|---|---|---|');
      for (const p of [...HUMANS, 'bot0.5', 'bot0.85', 'bot1', 'spam', 'ceiling', 'reckless']) {
        const rs = rounds.filter(r => r.diff === diff && r.player === p);
        if (!rs.length) continue;
        const c = causes(rs), g = k => Object.keys(c.by).filter(k).reduce((s, x) => s + c.by[x], 0);
        line(`| ${LABEL[p].label} | ${c.n} | ${pct(g(k => k === 'counter'), c.n)} | ${pct(g(k => k === 'stack (top)'), c.n)} | ${pct(g(k => k.startsWith('stack') && k !== 'stack (top)'), c.n)} | ${pct(g(k => k === 'hanger head (under)'), c.n)} | ${pct(g(k => k.startsWith('hanger head') && k !== 'hanger head (under)'), c.n)} | ${pct(g(k => k.startsWith('hanger chain') || k.startsWith('hanger handle')), c.n)} | ${pct(g(k => k.startsWith('kettle')), c.n)} | ${LABEL[p].kind === 'human' ? pct(c.lapse * c.n, c.n) : '–'} |`);
      }
      line('\nGust and steam fairness (bumps per second; "gust" = during a gust or ≤ 1.5 s after it, "calm" = rest of Windy Sunset):\n');
      line('| player | gusts seen | gust window | calm windy | steam exits | ≤ 1.5 s after steam | overall |');
      line('|---|---|---|---|---|---|---|');
      for (const p of [...HUMANS, 'bot0.85', 'bot1']) {
        const rs = rounds.filter(r => r.diff === diff && r.player === p);
        if (!rs.length) continue;
        const fz = fairness(rs);
        line(`| ${LABEL[p].label} | ${f0(fz.gusts)} | ${fz.gust.toFixed(3)} | ${fz.calm.toFixed(3)} | ${f0(fz.exits)} | ${fz.steam.toFixed(3)} | ${fz.all.toFixed(3)} |`);
      }
      const fv = res.filter(r => r.type === 'first' && r.tag === tag && r.diff === diff);
      if (fv.length) line(`\nFirst obstacle on screen (${fv.length} seeds): 16:9 frame min ${Math.min(...fv.map(r => r.t960)).toFixed(2)} s (median ${med(fv.map(r => r.t960)).toFixed(2)} s); 2.2:1 phone min ${Math.min(...fv.map(r => r.tWide)).toFixed(2)} s.\n`);
      const rc = res.filter(r => r.type === 'reach' && r.tag === tag && r.diff === diff);
      if (rc.length) line(`No-hit path exists for the first ${REACH_S} s on ${rc.filter(r => r.ok).length}/${rc.length} seeds${rc.some(r => !r.ok) ? ' (dead ends at ' + rc.filter(r => !r.ok).map(r => 'seed ' + r.seed + ' t=' + r.deadAt).join(', ') + ')' : ''}; fewest distinct safe states at any moment ${Math.min(...rc.map(r => r.minAlive))}; narrowest free band for Biscuit's centre ${Math.min(...rc.map(r => r.minFree))} px.\n`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'summary.md'), L.join('\n') + '\n');
  console.log(L.join('\n'));
  process.stderr.write(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
})();
