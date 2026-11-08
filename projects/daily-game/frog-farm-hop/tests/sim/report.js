// Clover's Farm Hop — turn run.js JSON into the markdown tables of docs/reports/playtest.md
//   node tests/sim/report.js tests/sim/out/base.json [tests/sim/out/patched.json]
'use strict';
const fs = require('fs');
const [, , baseF, afterF] = process.argv;
const B = JSON.parse(fs.readFileSync(baseF, 'utf8')).groups;
const A = afterF ? JSON.parse(fs.readFileSync(afterF, 'utf8')).groups : null;
const D = ['easy', 'normal', 'hard'];
const f = (x, n = 0) => (x === null || x === undefined || Number.isNaN(x)) ? '–' : (+x).toFixed(n);
const surv = g => `${f(g.survival.med)}${g.survival.censored * 2 >= g.n ? '+' : ''} (${f(g.survival.p10)}–${f(g.survival.p90)})`;
const sc = g => `${f(g.score.med)} (${f(g.score.p10)}–${f(g.score.p90)})`;
const l1 = g => `${f(g.level1.reach * 100)} % · ${g.level1.med === null ? '–' : f(g.level1.med) + ' s'}`;
const orc = g => g.oracle.checked ? `${g.oracle.unavoidable}/${g.oracle.checked}` : '–';
const out = [];
const P = s => out.push(s);

function table(prefix, G, title) {
  P(`\n**${title}**\n`);
  P('| diff | player | n | survival s, med (p10–p90) | score med (p10–p90) | climb u/s | level 1: reached · med s | s per level med (p10–p90) | falls/min | gust share of falls | fireflies/min | 1st platform / 1st firefly s | unfair |');
  P('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(G)) {
    if (!k.startsWith(prefix)) continue;
    const g = G[k];
    const pl = g.perLevel ? `${f(g.perLevel.med)} (${f(g.perLevel.p10)}–${f(g.perLevel.p90)})` : '–';
    P(`| ${g.diff} | ${g.player} | ${g.n} | ${surv(g)} | ${sc(g)} | ${f(g.climb, 2)} | ${l1(g)} | ${pl} | ${f(g.fallsPerMin, 2)} | ${f(g.gustFallShare * 100)} % | ${f(g.fireflyPerMin)} | ${f(g.firstPlat, 1)} / ${f(g.firstFly, 1)} | ${orc(g)} |`);
  }
}
function zones(G, title) {
  P(`\n**${title}** (unlimited hearts, 20 × 600 s per row; each cell = median s per level · falls/min · gust-caused falls per gust)\n`);
  P('| diff | player | sunny | rain | wind | snow | post-rescue falls | spring falls |');
  P('|---|---|---|---|---|---|---|---|');
  for (const k of Object.keys(G)) {
    if (!k.startsWith('rates/')) continue;
    const g = G[k];
    const z = g.byZone.map(c => `${f(c.med)} · ${f(c.fallsPerMin, 1)} · ${f(c.gustFallsPerGust, 2)}`);
    P(`| ${g.diff} | ${g.player} | ${z.join(' | ')} | ${f(g.postRescueShare * 100)} % | ${f(g.springFallShare * 100)} % |`);
  }
}
function exploits(G, title) {
  P(`\n**${title}** (real hearts, 50 rounds × ≤ 600 s)\n`);
  P('| diff | player | survival s med (p10–p90) | score med (p10–p90) | max height med | falls/min | longest stall p90 s |');
  P('|---|---|---|---|---|---|---|');
  for (const k of Object.keys(G)) {
    if (!k.startsWith('exploits/')) continue;
    const g = G[k];
    P(`| ${g.diff} | ${g.player} | ${surv(g)} | ${sc(g)} | ${f(g.climb * g.survival.med)} | ${f(g.fallsPerMin, 2)} | ${f(g.stall.p90)} |`);
  }
}
function compare(keys, title) {
  P(`\n**${title}**\n`);
  P('| row | survival med s: before → after | level 1 reached: before → after | level 1 med s | s per level med | falls/min | gust share of falls | score med |');
  P('|---|---|---|---|---|---|---|---|');
  for (const k of keys) {
    const b = B[k], a = A[k]; if (!b || !a) continue;
    const pl = g => g.perLevel ? f(g.perLevel.med) : '–';
    P(`| ${k.replace(/^\w+\//, '')} | ${surv(b)} → **${surv(a)}** | ${f(b.level1.reach * 100)} % → **${f(a.level1.reach * 100)} %** | ${f(b.level1.med)} → ${f(a.level1.med)} | ${pl(b)} → ${pl(a)} | ${f(b.fallsPerMin, 2)} → ${f(a.fallsPerMin, 2)} | ${f(b.gustFallShare * 100)} → ${f(a.gustFallShare * 100)} % | ${f(b.score.med)} → ${f(a.score.med)} |`);
  }
}

table('bots/', B, 'Bot matrix — current CONFIG (real hearts, 40 rounds × ≤ 600 s; "+" = most rounds still alive at the cap)');
table('humans/', B, 'Human-like models — current CONFIG (real hearts, 200 rounds × ≤ 900 s)');
zones(B, 'Level pacing and gusts by weather — current CONFIG');
exploits(B, 'Exploits — current CONFIG');
if (A) {
  const keys = [];
  for (const d of D) for (const p of ['kid4', 'kid5', 'kid6', 'casual', 'lagBot0.25']) keys.push(`humans/${d}/${p}`);
  for (const d of D) for (const p of ['bot1', 'bot0.7', 'bot0.5', 'bot0.3']) keys.push(`bots/${d}/${p}`);
  compare(keys, 'Before → after the recommended patch (real hearts)');
  const rk = []; for (const d of D) for (const p of ['kid6', 'casual', 'bot0.5']) rk.push(`rates/${d}/${p}`);
  compare(rk, 'Before → after, unlimited hearts (pacing and fall rates)');
  zones(A, 'Level pacing and gusts by weather — AFTER the patch');
  exploits(A, 'Exploits — AFTER the patch');
  table('humans/', A, 'Human-like models — AFTER the patch');
  table('bots/', A, 'Bot matrix — AFTER the patch');
}
console.log(out.join('\n'));
