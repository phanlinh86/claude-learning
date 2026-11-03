// Ember's Glow Castle — full high-speed playtest matrix.
//   node tests/sim/run.js [label] [overrides.json] [--quick]
// Writes tests/sim/results/<label>.json and <label>.md (tables). label defaults to "baseline".
'use strict';
const fs = require('fs');
const path = require('path');
const { makeEG, runGame, summarise, f, pct } = require('./lib.js');
const P = require('./players.js');

const label = process.argv[2] || 'baseline';
const ovPath = process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : null;
const quick = process.argv.includes('--quick');
const overrides = ovPath ? JSON.parse(fs.readFileSync(ovPath, 'utf8')) : null;
const EG = makeEG(overrides);
const OUT = path.join(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });

const N_BOT = quick ? 24 : 100, N_HUM = quick ? 40 : 300, N_SPAM = quick ? 8 : 30;
const BOT_T = 900, HUM_T = 1200, SPAM_T = 600;
const diffs = ['easy', 'normal', 'hard'];
const groups = [];
const t0 = Date.now();

function batch(name, diff, n, maxTime, mk) {
  const ms = [];
  for (let s = 1; s <= n; s++) ms.push(runGame(EG, mk(s), { diff, seed: 1000 + s, maxTime }));
  const S = summarise(ms, maxTime);
  S.name = name; S.diff = diff;
  if (name.startsWith('spam') || name.startsWith('kid')) S.playerStats = ms.reduce((a, m) => { for (const k in m.player) a[k] = (a[k] || 0) + m.player[k]; return a; }, {});
  groups.push(S);
  process.stderr.write('.');
  return S;
}

for (const d of diffs) {
  for (const sk of [0.3, 0.6, 0.9]) batch('bot ' + sk, d, N_BOT, BOT_T, s => P.botPlayer(EG, sk, s));
  batch('kid5', d, N_HUM, HUM_T, s => P.kidPlayer(EG, s));
  batch('kid5 slow', d, Math.round(N_HUM / 2), HUM_T, s => P.kidPlayer(EG, s, { delay: [2.6, 4.4], see: 0.15 }));
  batch('adult', d, N_HUM, HUM_T, s => P.adultPlayer(EG, s));
  for (const [mode, rate] of [['same', 10], ['same', 60], ['alt', 10], ['sweep', 10], ['rand', 10], ['rand', 60], ['aimdrop', 30]])
    batch('spam ' + mode + '@' + rate, d, N_SPAM, SPAM_T, s => P.spamPlayer(EG, s, mode, rate, 2));
}
process.stderr.write(' ' + ((Date.now() - t0) / 1000).toFixed(1) + ' s\n');

// ---------------------------------------------------------------- tables
const L = [];
L.push('# Playtest sim: ' + label + (ovPath ? ' (overrides ' + path.basename(ovPath) + ')' : ''));
L.push('');
L.push('Games: ' + groups.reduce((s, g) => s + g.n, 0) + '. Bots capped at ' + BOT_T / 60 + ' min, humans ' + HUM_T / 60 + ' min, spam ' + SPAM_T / 60 + ' min. Times are wall-clock seconds of simulated play (60 fps).');
L.push('');
L.push('## Survival, drops, score');
L.push('| diff | player | n | drops/min | game overs | lost < 3 min | survival med (p10–p90) s | drops med (p10–p90) | score med (p10–p90) | final level med | level @3 min |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const g of groups) L.push(`| ${g.diff} | ${g.name} | ${g.n} | ${f(g.dpm, 1)} | ${pct(g.overs, g.n)} | ${pct(g.over3, g.n)} | ${f(g.survMed)} (${f(g.survP10)}–${f(g.survP90)}) | ${f(g.dropsMed)} (${f(g.dropsP10)}–${f(g.dropsP90)}) | ${f(g.scoreMed)} (${f(g.scoreP10)}–${f(g.scoreP90)}) | ${f(g.finalLevelMed)} | ${f(g.levelAt3)} |`);
L.push('');
L.push('## Pacing (medians; level times count only games that finished that level, n in brackets when not all)');
L.push('| diff | player | 1st merge s (drop) | 1st candle s (drop) | L1 candle s | L2 lantern s | L3 star s | L4 moon s | L1–L4 drops | reach candle / lantern / star / moon |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
const lv = (g, k) => f(g.lvT[k].med) + (g.lvT[k].n < g.n ? ' (' + g.lvT[k].n + ')' : '');
for (const g of groups) if (!g.name.startsWith('spam'))
  L.push(`| ${g.diff} | ${g.name} | ${f(g.firstMergeT, 1)} (${f(g.firstMergeDrop)}) | ${f(g.firstCandleT)} (${f(g.firstCandleDrop)}) | ${lv(g, 0)} | ${lv(g, 1)} | ${lv(g, 2)} | ${lv(g, 3)} | ${g.lvD.map(x => f(x.med)).join(' / ')} | ${g.reach.slice(0, 4).map(x => pct(x, g.n)).join(' / ')} |`);
L.push('');
L.push('## Boo and pumpkins (totals over the batch)');
L.push('| diff | player | Boo / game | Boo / min | carried: pumpkin / t1 / t2 / t3 | fly-bys | rises | pumpkins dropped | wakes (of risers) | wake ratio |');
L.push('|---|---|---|---|---|---|---|---|---|---|');
for (const g of groups) if (!g.name.startsWith('spam')) {
  const b = g.booCarry;
  L.push(`| ${g.diff} | ${g.name} | ${f(g.boosPerGame, 1)} | ${f(g.boosPerMin, 2)} | ${b.pumpkin} / ${b[1]} / ${b[2]} / ${b[3]} | ${g.booFlyBy} | ${g.rises} | ${g.pumpkinDrops} | ${g.wakes} (${g.wakesRisen}) | ${g.rises + g.pumpkinDrops ? f(100 * g.wakes / (g.rises + g.pumpkinDrops)) + '%' : '–'} |`);
}
L.push('');
L.push('## Spam / exploit');
L.push('| diff | mode | taps | taps while busy | accepted drops | refused/game | score med | score/min vs bot 0.9 | survival med s | invariant errors | stuck |');
L.push('|---|---|---|---|---|---|---|---|---|---|---|');
for (const g of groups) if (g.name.startsWith('spam')) {
  const bot = groups.find(x => x.diff === g.diff && x.name === 'bot 0.9');
  const spm = g.scoreMed / (g.survMed / 60), bpm = bot.scoreMed / (bot.survMed / 60);
  const ps = g.playerStats;
  L.push(`| ${g.diff} | ${g.name.slice(5)} | ${ps.taps} | ${ps.busyTaps} | ${ps.accepted} | ${f(g.refusedPerGame)} | ${f(g.scoreMed)} | ${f(100 * spm / bpm)}% | ${f(g.survMed)} | ${g.invariant.length} | ${g.stuck} |`);
}
const inv = groups.flatMap(g => g.invariant.map(x => g.diff + '/' + g.name + ' ' + x));
L.push('');
L.push('Invariant / stuck problems across all games: ' + (inv.length ? inv.slice(0, 20).join('; ') : 'none') + '.');
fs.writeFileSync(path.join(OUT, label + '.md'), L.join('\n') + '\n');
fs.writeFileSync(path.join(OUT, label + '.json'), JSON.stringify(groups, null, 1));
console.log(L.join('\n'));
