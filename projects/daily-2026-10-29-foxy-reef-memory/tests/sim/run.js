// Foxy's Reef Memory — headless playtest sim.
//   node tests/sim/run.js baseline [N]   difficulty × peek × player-model grid (current game values)
//   node tests/sim/run.js gravity  [N]   gravity twist on vs off (Normal, peek 1)
//   node tests/sim/run.js tuning   [N]   current vs proposed tuning (proposals.js)
//   node tests/sim/run.js all      [N]
// Writes tests/sim/results/<exp>.json and <exp>.md (tables used in docs/reports/playtest_report.md).
'use strict';
const fs = require('fs');
const path = require('path');
const runPool = require('./pool');
const S = require('./stats');
const P = require('./proposals');

const OUT = path.join(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });
const MAXLV = 24, MAXT = 1800;
const HUMANS = ['kid6', 'kid9', 'casual', 'strong'];
const EXPLOITS = ['random', 'randomSlow', 'sweeper'];

function jobs(spec, n) {
  const out = [];
  for (let s = 0; s < n; s++) out.push(Object.assign({ seed: 1000 + s * 7919, maxLevels: MAXLV, maxTime: MAXT }, spec));
  return out;
}
async function batch(specs, n) {
  const all = [], idx = [];
  for (const sp of specs) { const js = jobs(sp, n); idx.push([all.length, js.length]); all.push(...js); }
  const res = await runPool(all);
  return specs.map((sp, k) => ({ spec: sp, runs: res.slice(idx[k][0], idx[k][0] + idx[k][1]) }));
}
const label = (sp) => `${sp.model} · ${sp.difficulty} · peek ${sp.peek}`;
function save(name, data, md) {
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(data, null, 1));
  fs.writeFileSync(path.join(OUT, name + '.md'), md + '\n');
  console.log(md);
}

function overviewTable(groups) {
  return S.table(['Model', 'Diff', 'Peek', 'Spring', 'Summer', 'Autumn', 'Winter (lap 1)', 'Lap 2 done', 'Median death', 'Session min (p10–p90)', 'Score', 'Where they lose'],
    groups.map(({ spec, sum }) => [spec.model, spec.difficulty, spec.peek, S.pct(sum.clear[0]), S.pct(sum.clear[1]), S.pct(sum.clear[2]), S.pct(sum.clear[3]), S.pct(sum.lap2),
      sum.endless >= 0.5 ? `≥${MAXLV} (${S.pct(sum.endless)} cap)` : S.levelName(Math.round(sum.deathLevel)) + ` (#${Math.round(sum.deathLevel) + 1})`,
      `${S.f1(sum.sessionMin)} (${S.f1(sum.sessionP10)}–${S.f1(sum.sessionP90)})`, S.f0(sum.score), sum.topLoss || 'never (cap)']));
}
function seasonTable(groups) {
  const rows = [];
  for (const { spec, sum } of groups) for (let s = 0; s < 4; s++) {
    const x = sum.season[s];
    rows.push([spec.model, spec.difficulty + ' p' + spec.peek, S.SEASONS[s], S.pct(x.clearIfReached), S.f0(x.time), S.f0(x.airLeft) + ` (${S.pct(x.airLeftFrac)})`,
      S.pct(x.minAirFrac), S.f1(x.mistakesPerPair), S.f0(x.score), S.pct(x.bonusShare), S.f0(x.maxCombo)]);
  }
  return S.table(['Model', 'Setting', 'Level (lap 1)', 'Clear if reached', 'Play s', 'Air left s (frac)', 'Lowest air', 'Mistakes/pair', 'Level score', 'Air-bonus share', 'Max combo'], rows);
}
function lapTable(groups) {
  // lap-by-lap clear rates (did the run clear the whole lap k?)
  return S.table(['Model', 'Setting', 'Lap 1', 'Lap 2', 'Lap 3', 'Lap 4', 'Lap 5', 'Lap 6'],
    groups.map(({ spec, runs }) => [spec.model, spec.difficulty + ' p' + spec.peek,
      ...[3, 7, 11, 15, 19, 23].map(i => S.pct(runs.filter(r => r.levels[i] && r.levels[i].cleared).length / runs.length))]));
}

async function baseline(n) {
  const specs = [];
  for (const d of ['easy', 'normal', 'hard']) for (const pk of [0, 1, 2, 3]) for (const m of [...HUMANS, ...EXPLOITS]) specs.push({ model: m, difficulty: d, peek: pk });
  const res = await batch(specs, n);
  const groups = res.map(g => Object.assign(g, { sum: S.summarize(g.runs, MAXLV) }));
  const humans = groups.filter(g => HUMANS.includes(g.spec.model));
  const md = [`## Baseline (current values), ${n} runs per row, cap ${MAXLV} levels / ${MAXT / 60} min`,
    '### Clear rates and sessions', overviewTable(groups),
    '### Per season, lap 1 (humans, peek 1 = shipped default)', seasonTable(humans.filter(g => g.spec.peek === 1)),
    '### Lap ramp (humans, peek 1)', lapTable(humans.filter(g => g.spec.peek === 1))].join('\n\n');
  save('baseline', groups.map(g => ({ spec: g.spec, sum: g.sum })), md);
}

async function gravity(n) {
  const specs = [];
  for (const m of HUMANS) for (const ng of [false, true]) specs.push({ model: m, difficulty: 'normal', peek: 1, proposal: { noGravity: ng } });
  const res = await batch(specs, n);
  const rows = [];
  for (let k = 0; k < res.length; k += 2) {
    const on = S.summarize(res[k].runs, MAXLV), off = S.summarize(res[k + 1].runs, MAXLV);
    for (const s of [0, 2, 3]) {
      // per-level mistakes per pair over ALL laps of that season
      const mpp = (runs) => S.mean(runs.flatMap(r => r.levels.filter(l => l.season === s && l.lap === 0).map(l => l.mistakes / l.pairs)));
      const tm = (runs) => S.med(runs.flatMap(r => r.levels.filter(l => l.season === s && l.lap === 0 && l.cleared).map(l => l.playTime)));
      const slides = (runs) => S.mean(runs.flatMap(r => r.levels.filter(l => l.season === s && l.lap === 0).map(l => l.slideMoves)));
      rows.push([res[k].spec.model, S.SEASONS[s], S.f1(slides(res[k].runs)),
        `${S.f1(mpp(res[k].runs))} → ${S.f1(mpp(res[k + 1].runs))}`, `${S.f0(tm(res[k].runs))} → ${S.f0(tm(res[k + 1].runs))}`,
        `${S.pct(on.season[s].clearIfReached)} → ${S.pct(off.season[s].clearIfReached)}`]);
    }
    rows.push([res[k].spec.model, '**whole game**', '', '', '', `death #${S.f1(on.deathLevel + 1)} → #${S.f1(off.deathLevel + 1)}, session ${S.f1(on.sessionMin)} → ${S.f1(off.sessionMin)} min`]);
  }
  const md = [`## Gravity twist ON → OFF (Normal, peek 1), ${n} runs each`,
    S.table(['Model', 'Season (lap 1)', 'Cards slid per level', 'Mistakes/pair on → off', 'Play s on → off', 'Clear if reached on → off'], rows)].join('\n\n');
  save('gravity', rows, md);
}

async function tuning(n) {
  const specs = [];
  for (const [name, prop] of Object.entries(P.variants)) {
    for (const d of ['easy', 'normal', 'hard']) for (const m of [...HUMANS, 'random', 'randomSlow']) {
      const pk = P.peekFor(name, d);
      specs.push({ model: m, difficulty: d, peek: pk, proposal: prop, variant: name });
    }
  }
  const res = await batch(specs, n);
  const groups = res.map(g => Object.assign(g, { sum: S.summarize(g.runs, MAXLV) }));
  const rows = groups.map(({ spec, sum }) => [spec.variant, spec.model, spec.difficulty + ' p' + spec.peek, S.pct(sum.clear[0]), S.pct(sum.clear[1]), S.pct(sum.clear[3]), S.pct(sum.lap2),
    sum.endless >= 0.5 ? `≥${MAXLV}` : '#' + S.f0(sum.deathLevel + 1), `${S.f1(sum.sessionMin)} (${S.f1(sum.sessionP10)}–${S.f1(sum.sessionP90)})`,
    S.f0(sum.season[0].airLeft) + '/' + S.f0(sum.season[3].airLeft), S.pct(sum.season[0].minAirFrac), S.f0(sum.score)]);
  const md = [`## Tuning: current vs proposed, ${n} runs per row`,
    S.table(['Variant', 'Model', 'Setting', 'Spring', 'Summer', 'Lap 1', 'Lap 2', 'Median death', 'Session min (p10–p90)', 'Air left Spr/Win', 'Spring lowest air', 'Score'], rows),
    '### Lap ramp', S.table(['Variant', 'Model', 'Setting', 'Lap 1', 'Lap 2', 'Lap 3', 'Lap 4', 'Lap 5', 'Lap 6'],
      groups.filter(g => HUMANS.includes(g.spec.model)).map(({ spec, runs }) => [spec.variant, spec.model, spec.difficulty + ' p' + spec.peek,
        ...[3, 7, 11, 15, 19, 23].map(i => S.pct(runs.filter(r => r.levels[i] && r.levels[i].cleared).length / runs.length))]))].join('\n\n');
  save('tuning', groups.map(g => ({ spec: g.spec, sum: g.sum })), md);
}

(async () => {
  const exp = process.argv[2] || 'all';
  const n = parseInt(process.argv[3] || '40', 10);
  const t0 = Date.now();
  if (exp === 'baseline' || exp === 'all') await baseline(n);
  if (exp === 'gravity' || exp === 'all') await gravity(Math.max(n, 100));
  if (exp === 'tuning' || exp === 'all') await tuning(n);
  console.error(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s`);
})();
