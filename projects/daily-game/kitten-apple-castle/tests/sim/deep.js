// Ziggy's Apple Castle — deep playtest (report-only). Thousands of headless games, per-zone pacing, darkness/lantern
// counterfactuals, pies, exploits.
//   node tests/sim/deep.js                  baseline           → results/deep-baseline.{json,md}
//   node tests/sim/deep.js --proposal       proposal-config.json overrides applied in memory → results/deep-proposal.{json,md}
//   node tests/sim/deep.js --patched FILE   FILE as world.js   → results/deep-patched.{json,md}
//   node tests/sim/deep.js --compare        before/after       → results/deep-compare.md
//   --seeds N (default 60)  --time S (default 600)  --quick (skip the exploit sweeps)
'use strict';
const fs = require('fs');
const path = require('path');
const L = require('./lib');
const P = require('./players');

const args = process.argv.slice(2);
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const SEEDS = +opt('--seeds', 60), TIME = +opt('--time', 600);
const OUT = path.join(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });
const PROPOSAL = require('./proposal-config.json');
const ZN = ['dawn', 'noon', 'sunset', 'night'];

const kid6 = (AC, s) => P.kidPlayer(AC, s, { name: 'kid6', react: [0.35, 0.65], k: 0.86, kSd: 0.1, aimSd: 0.16, random: 0.05, late: 0.08, distract: 0.05 });
const HUMANS = {
  kid4: (AC, s) => P.kidPlayer(AC, s),          // a 4–5-year-old (the default kid model)
  kid6,
  adult: (AC, s) => P.adultPlayer(AC, s),
  spam: (AC, s) => P.spamPlayer(AC, s),
  centre: (AC, s) => P.centrePlayer(AC, s, 0),
  waitPerfect: (AC, s) => P.perfectWaiter(AC, s),
  appleGreed: (AC, s) => P.appleGreed(AC, s)
};
const DIFFS = ['easy', 'normal', 'hard'];
const SKILLS = [0.2, 0.35, 0.5, 0.7, 0.9, 1.0];
const bot = s => (AC) => P.botPlayer(AC, s);

function mkAC(base, extra) {
  const o = {};
  if (base.worldSrc) o.worldSrc = base.worldSrc;
  const ov = JSON.parse(JSON.stringify(base.overrides || {}));
  if (extra) L.merge(ov, extra);
  o.overrides = ov;
  return L.makeAC(o);
}
function many(AC, mk, diff, o) {
  o = o || {}; const ms = [], n = o.seeds || SEEDS;
  for (let s = 1; s <= n; s++) ms.push(L.runGame(AC, mk(AC, s), Object.assign({ diff, seed: s, maxTime: TIME }, o)));
  return ms;
}

/** Extra per-zone / darkness metrics on top of L.summarise. */
function deepSum(ms) {
  const r = L.summarise(ms);
  r.zoneT = {}; r.zoneMiss = {}; r.zonePerf = {}; r.zoneDrops = {}; r.zoneLit = {};
  for (let z = 0; z < 4; z++) {
    const ts = []; ms.forEach(m => m.levelT.forEach((t, i) => { if (i < 4 && m.levelZ[i] === z) ts.push(t); }));   // first day only
    r.zoneT[z] = L.q(ts, 0.5); r['zoneN' + z] = ts.length;
    const d = []; ms.forEach(m => m.dropRec.forEach(x => { if (x.z === z && x.lv < 4) d.push(x); }));
    r.zoneDrops[z] = d.length;
    r.zoneMiss[z] = d.length ? 100 * d.filter(x => x.out === 'miss').length / d.length : NaN;
    r.zonePerf[z] = d.length ? 100 * d.filter(x => x.out === 'perfect').length / d.length : NaN;
    r.zoneLit[z] = d.length ? L.mean(d.map(x => x.lit)) : NaN;
  }
  // miss% by how lit the tower top was at the drop (all drops)
  const all = [].concat(...ms.map(m => m.dropRec));
  r.litB = {};
  for (const [k, a, b] of [['<0.45', 0, 0.45], ['0.45–0.7', 0.45, 0.7], ['0.7–0.9', 0.7, 0.9], ['≥0.9', 0.9, 1.01]]) {
    const d = all.filter(x => x.lit >= a && x.lit < b);
    r.litB[k] = { n: d.length, miss: d.length ? 100 * d.filter(x => x.out === 'miss').length / d.length : NaN };
  }
  // sunset/night drops onto a lantern top vs an unlit top
  const dk = all.filter(x => x.z >= 2 && x.n > 0);
  const lan = dk.filter(x => x.lan), nol = dk.filter(x => !x.lan);
  r.lanTop = { n: lan.length, miss: lan.length ? 100 * lan.filter(x => x.out === 'miss').length / lan.length : NaN, lit: L.mean(lan.map(x => x.lit)) };
  r.noLanTop = { n: nol.length, miss: nol.length ? 100 * nol.filter(x => x.out === 'miss').length / nol.length : NaN, lit: L.mean(nol.map(x => x.lit)) };
  // hearts economy
  r.heartsLost = ms.reduce((a, m) => a + m.lossMiss + m.lossTopple, 0) / ms.length;
  r.pieHeartsPerGame = ms.reduce((a, m) => a + m.pieHearts, 0) / ms.length;
  r.levelHeartsPerGame = ms.reduce((a, m) => a + m.levels, 0) / ms.length;   // ≤ 1 heart per level (capped by max)
  r.deathZones = [0, 0, 0, 0]; ms.forEach(m => { if (m.over) r.deathZones[m.deathZone]++; });
  r.dawnClear = 100 * ms.filter(m => m.levels >= 1).length / ms.length;
  r.dawnLoss = L.mean(ms.map(m => m.dropRec.filter(x => x.lv === 0 && x.out === 'miss').length + m.dropRec.filter(x => x.lv === 0 && x.topple).length));
  return r;
}

function runAll(base, label, quick) {
  const t0 = Date.now(), res = { label, seeds: SEEDS, time: TIME, bots: {}, humans: {}, layouts: {}, cf: {}, pies: {}, longrun: {}, exploits: {} };
  const AC = mkAC(base);
  for (const d of DIFFS) for (const s of SKILLS) res.bots[d + ' bot' + s] = deepSum(many(AC, bot(s), d));
  for (const d of DIFFS) for (const [n, mk] of Object.entries(HUMANS)) res.humans[d + ' ' + n] = deepSum(many(AC, mk, d));
  for (const [ln, W, H] of [['iPhone-portrait', 390, 844], ['iPad-portrait', 820, 1180], ['iPhone-landscape', 844, 390]])
    for (const [n, d] of [['kid4', 'easy'], ['kid6', 'easy'], ['adult', 'normal']])
      res.layouts[ln + ' ' + d + ' ' + n] = deepSum(many(AC, HUMANS[n], d, { width: W, height: H }));
  // counterfactuals: how much does the dark cost, how much do lanterns give back?
  const noDark = { nightEnd: 1, zones: { 0: { light: 1 }, 1: { light: 1 }, 2: { light: 1 }, 3: { light: 1 } } };
  const noLan = { lights: { lantern: { a: 0 } } };
  const noPie = { pieEvery: 1e9 };
  const cfRows = [['easy', 'kid4'], ['easy', 'kid6'], ['normal', 'adult'], ['hard', 'adult'], ['normal', 'bot0.5'], ['normal', 'bot0.7'], ['hard', 'bot0.7']];
  const who = n => n.startsWith('bot') ? bot(+n.slice(3)) : HUMANS[n];
  for (const [cfn, ov] of [['base', null], ['noDark', noDark], ['noLanternLight', noLan], ['noPies', noPie]]) {
    const A = ov ? mkAC(base, ov) : AC;
    for (const [d, n] of cfRows) res.cf[cfn + '|' + d + ' ' + n] = deepSum(many(A, who(n), d));
  }
  // long runs: does anybody's game ever end? (with and without pies)
  for (const [cfn, ov] of [['base', null], ['noPies', noPie]]) {
    const A = ov ? mkAC(base, ov) : AC;
    for (const [d, n] of [['easy', 'kid6'], ['easy', 'adult'], ['normal', 'adult'], ['normal', 'bot0.7'], ['normal', 'appleGreed'], ['hard', 'adult']]) {
      const ms = many(A, who(n), d, { maxTime: 1800, seeds: Math.min(SEEDS, 30), record: false });
      res.longrun[cfn + '|' + d + ' ' + n] = { alive30: 100 * ms.filter(m => !m.over).length / ms.length, surv50: L.q(ms.map(m => m.time), 0.5), lv50: L.q(ms.map(m => m.levels), 0.5), pieH: L.mean(ms.map(m => m.pieHearts)), lost: L.mean(ms.map(m => m.lossMiss + m.lossTopple)) };
    }
  }
  if (!quick) {
    // exploits: metronome taps and fixed-delay-after-spawn taps; report the best interval per difficulty
    for (const d of DIFFS) {
      let best = null, bestD = null; const ivRows = [], dlRows = [];
      for (let iv = 0.1; iv <= 6.001; iv += 0.1) {
        const ms = many(AC, (A, s) => P.intervalPlayer(A, s, +iv.toFixed(2), 0.13 * s), d, { seeds: 20, maxTime: 300, record: false });
        const r = { iv: +iv.toFixed(2), surv50: L.q(ms.map(m => m.time), 0.5), score50: L.q(ms.map(m => m.score), 0.5), lv50: L.q(ms.map(m => m.levels), 0.5), miss: L.summarise(ms).missPct, over: 100 * ms.filter(m => m.over).length / ms.length };
        ivRows.push(r); if (!best || r.surv50 > best.surv50 || (r.surv50 === best.surv50 && r.score50 > best.score50)) best = r;
      }
      for (let dl = 0; dl <= 6.001; dl += 0.05) {
        const ms = many(AC, (A, s) => P.delayPlayer(A, s, +dl.toFixed(2)), d, { seeds: 20, maxTime: 300, record: false });
        const r = { d: +dl.toFixed(2), surv50: L.q(ms.map(m => m.time), 0.5), score50: L.q(ms.map(m => m.score), 0.5), lv50: L.q(ms.map(m => m.levels), 0.5), miss: L.summarise(ms).missPct, over: 100 * ms.filter(m => m.over).length / ms.length };
        dlRows.push(r); if (!bestD || r.surv50 > bestD.surv50 || (r.surv50 === bestD.surv50 && r.score50 > bestD.score50)) bestD = r;
      }
      res.exploits[d] = { bestInterval: best, bestDelay: bestD, ivTop: ivRows.slice().sort((a, b) => b.surv50 - a.surv50 || b.score50 - a.score50).slice(0, 5), dlTop: dlRows.slice().sort((a, b) => b.surv50 - a.surv50 || b.score50 - a.score50).slice(0, 5) };
    }
  }
  res.secs = (Date.now() - t0) / 1000;
  res.games = Object.keys(res.bots).length * SEEDS + Object.keys(res.humans).length * SEEDS + Object.keys(res.layouts).length * SEEDS
    + Object.keys(res.cf).length * SEEDS + Object.keys(res.longrun).length * Math.min(SEEDS, 30) + (quick ? 0 : 3 * (60 + 121) * 20);
  return res;
}

// ---------- markdown ----------
const f = L.f;
function md(res) {
  const o = [`# Deep playtest — ${res.label} (${res.games} games, ${res.seeds} seeds/row, ${res.time} s cap, 960×540 unless noted, ${res.secs.toFixed(0)} s wall)`, ''];
  const main = (title, rows) => {
    o.push('## ' + title, '| row | over% | surv p50 s | score p10/50/90 | levels p50 (max) | dawn clear% | 1st pt s | perfect% | miss%/drop | topple/100 | hearts lost/game | pie hearts/game | apples/drop | dawn / noon / sunset / night level time p50 s | died in d/n/s/n |', '|' + '---|'.repeat(16));
    for (const [k, r] of Object.entries(rows)) o.push(`| ${k} | ${f(r.overPct, 0)} | ${f(r.surv50, 0)} | ${f(r.score10, 0)}/${f(r.score50, 0)}/${f(r.score90, 0)} | ${f(r.lv50, 0)} (${r.lvMax}) | ${f(r.dawnClear, 0)} | ${f(r.firstPt, 1)} | ${f(r.perfectPct, 0)} | ${f(r.missPct, 1)} | ${f(r.topplePer100, 2)} | ${f(r.heartsLost, 1)} | ${f(r.pieHeartsPerGame, 1)} | ${f(r.applesPerDrop, 2)} | ${[0, 1, 2, 3].map(z => f(r.zoneT[z], 0)).join(' / ')} | ${r.deathZones.join('/')} |`);
    o.push('');
  };
  main('AC.Bot grid', res.bots); main('Human-like players', res.humans); main('Device layouts', res.layouts);
  o.push('## Miss % per drop by time of day (first day) — the cost of the dark', '| row | dawn | noon | sunset | night | mean lit at drop d/n/s/n |', '|---|---|---|---|---|---|');
  for (const [k, r] of Object.entries(Object.assign({}, res.humans, res.bots))) if (!/spam|waitPerfect|appleGreed|centre/.test(k)) o.push(`| ${k} | ${[0, 1, 2, 3].map(z => f(r.zoneMiss[z], 1) + ' (' + r.zoneDrops[z] + ')').join(' | ')} | ${[0, 1, 2, 3].map(z => f(r.zoneLit[z], 2)).join(' / ')} |`);
  o.push('', '## Counterfactuals (same seeds): noDark = every zone at light 1 · noLanternLight = lanterns give no light · noPies', '| row | variant | over% | surv p50 | levels p50 | miss% | sunset miss% | night miss% | night perfect% | night level s | hearts lost | pie hearts |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  const keys = [...new Set(Object.keys(res.cf).map(k => k.split('|')[1]))];
  for (const k of keys) for (const v of ['base', 'noDark', 'noLanternLight', 'noPies']) { const r = res.cf[v + '|' + k]; if (!r) continue; o.push(`| ${k} | ${v} | ${f(r.overPct, 0)} | ${f(r.surv50, 0)} | ${f(r.lv50, 0)} | ${f(r.missPct, 1)} | ${f(r.zoneMiss[2], 1)} | ${f(r.zoneMiss[3], 1)} | ${f(r.zonePerf[3], 0)} | ${f(r.zoneT[3], 0)} | ${f(r.heartsLost, 1)} | ${f(r.pieHeartsPerGame, 1)} |`); }
  o.push('', '## Lantern under the target (sunset + night drops, base)', '| row | drops on lantern top: n / miss% / lit | on unlit top: n / miss% / lit |', '|---|---|---|');
  for (const k of keys) { const r = res.cf['base|' + k]; o.push(`| ${k} | ${r.lanTop.n} / ${f(r.lanTop.miss, 1)} / ${f(r.lanTop.lit, 2)} | ${r.noLanTop.n} / ${f(r.noLanTop.miss, 1)} / ${f(r.noLanTop.lit, 2)} |`); }
  o.push('', '## Miss % by how lit the tower top was (all drops, base)', '| row | lit <0.45 | 0.45–0.7 | 0.7–0.9 | ≥0.9 |', '|---|---|---|---|---|');
  for (const k of keys) { const r = res.cf['base|' + k]; o.push(`| ${k} | ${Object.values(r.litB).map(b => f(b.miss, 1) + ' (' + b.n + ')').join(' | ')} |`); }
  o.push('', '## Long runs (30 min cap): is it endless?', '| row | variant | still alive at 30 min % | surv p50 s | levels p50 | pie hearts/game | hearts lost/game |', '|---|---|---|---|---|---|---|');
  for (const [k, r] of Object.entries(res.longrun)) { const [v, n] = k.split('|'); o.push(`| ${n} | ${v} | ${f(r.alive30, 0)} | ${f(r.surv50, 0)} | ${f(r.lv50, 0)} | ${f(r.pieH, 1)} | ${f(r.lost, 1)} |`); }
  if (Object.keys(res.exploits).length) {
    o.push('', '## Exploits: blind metronome taps (every iv s) and fixed delay after each new crate (20 seeds, 300 s cap)', '| diff | best interval: iv / surv p50 / score p50 / levels / miss% | best delay: d / surv p50 / score p50 / levels / miss% |', '|---|---|---|');
    for (const [d, e] of Object.entries(res.exploits)) { const a = e.bestInterval, b = e.bestDelay; o.push(`| ${d} | ${a.iv} s / ${f(a.surv50, 0)} / ${f(a.score50, 0)} / ${f(a.lv50, 0)} / ${f(a.miss, 0)} | ${b.d} s / ${f(b.surv50, 0)} / ${f(b.score50, 0)} / ${f(b.lv50, 0)} / ${f(b.miss, 0)} |`); }
  }
  return o.join('\n') + '\n';
}

function compare(a, b) {
  const o = ['# Deep playtest — before (baseline) → after (proposal)', ''];
  const cols = [['over%', r => f(r.overPct, 0)], ['surv p50', r => f(r.surv50, 0)], ['levels p50', r => f(r.lv50, 0)], ['dawn clear%', r => f(r.dawnClear, 0)], ['perfect%', r => f(r.perfectPct, 0)], ['miss%', r => f(r.missPct, 1)],
    ['topple/100', r => f(r.topplePer100, 2)], ['level s d/n/s/n', r => [0, 1, 2, 3].map(z => f(r.zoneT[z], 0)).join('/')], ['night miss%', r => f(r.zoneMiss[3], 1)], ['score p50', r => f(r.score50, 0)]];
  const sec = (t, A, B) => {
    o.push('## ' + t, '| row | ' + cols.map(c => c[0]).join(' | ') + ' |', '|' + '---|'.repeat(cols.length + 1));
    for (const k of Object.keys(A)) if (B[k]) o.push('| ' + k + ' | ' + cols.map(c => c[1](A[k]) + ' → ' + c[1](B[k])).join(' | ') + ' |');
    o.push('');
  };
  sec('Human-like players', a.humans, b.humans); sec('Device layouts', a.layouts, b.layouts); sec('AC.Bot grid', a.bots, b.bots);
  const cfA = {}, cfB = {};
  for (const k of Object.keys(a.cf)) cfA[k.replace('|', ' · ')] = a.cf[k];
  for (const k of Object.keys(b.cf)) cfB[k.replace('|', ' · ')] = b.cf[k];
  sec('Counterfactuals', cfA, cfB);
  o.push('## Long runs (30 min)', '| row | alive at 30 min % | surv p50 s | levels p50 |', '|---|---|---|---|');
  for (const k of Object.keys(a.longrun)) { const x = a.longrun[k], y = b.longrun[k]; if (y) o.push(`| ${k.replace('|', ' · ')} | ${f(x.alive30, 0)} → ${f(y.alive30, 0)} | ${f(x.surv50, 0)} → ${f(y.surv50, 0)} | ${f(x.lv50, 0)} → ${f(y.lv50, 0)} |`); }
  if (a.exploits && b.exploits && Object.keys(b.exploits).length) {
    o.push('', '## Exploits (best blind interval / best fixed delay: surv p50 s, levels)', '| diff | before | after |', '|---|---|---|');
    for (const d of Object.keys(a.exploits)) { const x = a.exploits[d], y = b.exploits[d]; if (y) o.push(`| ${d} | every ${x.bestInterval.iv} s: ${f(x.bestInterval.surv50, 0)} s, ${f(x.bestInterval.lv50, 0)} lv · delay ${x.bestDelay.d} s: ${f(x.bestDelay.surv50, 0)} s, ${f(x.bestDelay.lv50, 0)} lv | every ${y.bestInterval.iv} s: ${f(y.bestInterval.surv50, 0)} s, ${f(y.bestInterval.lv50, 0)} lv · delay ${y.bestDelay.d} s: ${f(y.bestDelay.surv50, 0)} s, ${f(y.bestDelay.lv50, 0)} lv |`); }
  }
  return o.join('\n') + '\n';
}

if (require.main === module) {
  if (args.includes('--compare')) {
    const a = JSON.parse(fs.readFileSync(path.join(OUT, 'deep-baseline.json'))), b = JSON.parse(fs.readFileSync(path.join(OUT, opt('--after', 'deep-proposal') + '.json')));
    fs.writeFileSync(path.join(OUT, 'deep-compare.md'), compare(a, b));
    console.log('wrote results/deep-compare.md');
  } else {
    const patched = opt('--patched', null);
    const kind = patched ? 'patched' : args.includes('--proposal') ? 'proposal' : 'baseline';
    const base = patched ? { worldSrc: fs.readFileSync(patched, 'utf8') } : kind === 'proposal' ? { overrides: PROPOSAL.overrides } : {};
    const res = runAll(base, kind, args.includes('--quick'));
    fs.writeFileSync(path.join(OUT, 'deep-' + kind + '.json'), JSON.stringify(res, null, 1));
    fs.writeFileSync(path.join(OUT, 'deep-' + kind + '.md'), md(res));
    console.log('wrote results/deep-' + kind + '.{json,md}: ' + res.games + ' games in ' + res.secs.toFixed(1) + ' s');
  }
}
module.exports = { mkAC, many, deepSum, HUMANS, bot };
