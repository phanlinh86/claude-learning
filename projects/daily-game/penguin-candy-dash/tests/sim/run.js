// Pip's Candy Dash — headless playtest sim.
//   node tests/sim/run.js baseline [N]   difficulty × player model grid (current game values)
//   node tests/sim/run.js terrain  [N]   terrain on vs off (which biome flavour changes difficulty)
//   node tests/sim/run.js tuning   [N]   current vs proposals.js packages (human models)
//   node tests/sim/run.js all      [N]
// Writes tests/sim/results/<exp>.json and <exp>.md (tables used in docs/reports/playtest_report.md).
'use strict';
const fs = require('fs');
const path = require('path');
const runPool = require('./pool');
const S = require('./stats');
const PROPOSALS = require('./proposals');

const OUT = path.join(__dirname, 'results');
fs.mkdirSync(OUT, { recursive: true });
const MAXLV = 32, MAXT = 1800;   // 30 min game-time cap
const HUMANS = ['kid6', 'kidKeys', 'casual', 'strong'];
const DECISION = ['greedy', 'balanced', 'popspam', 'strongGreedy', 'strongSpam'];
const REF = ['bot0.3', 'bot'];
const EXPLOITS = ['random', 'camper', 'strafer'];
const DIFFS = ['easy', 'normal', 'hard'];

function jobs(spec, n) {
  const out = [];
  for (let s = 0; s < n; s++) out.push(Object.assign({ seed: 1000 + s * 7919, maxLevels: MAXLV, maxTime: MAXT }, spec));
  return out;
}
async function batch(specs, n) {
  const all = [], idx = [];
  for (const sp of specs) { const js = jobs(sp, n); idx.push([all.length, js.length]); all.push(...js); }
  const t0 = Date.now();
  const res = await runPool(all);
  process.stderr.write(`  ${all.length} runs in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
  return specs.map((sp, k) => ({ spec: sp, sum: S.summarize(res.slice(idx[k][0], idx[k][0] + idx[k][1])) }));
}
const tag = (sp) => [sp.model, sp.difficulty, sp.proposal || 'current', sp.noTerrain ? 'no terrain' : ''].filter(Boolean).join(' · ');
function save(name, groups, md) {
  fs.writeFileSync(path.join(OUT, name + '.json'), JSON.stringify(groups.map(g => ({ spec: g.spec, sum: g.sum })), null, 1));
  fs.writeFileSync(path.join(OUT, name + '.md'), md + '\n');
  console.log(md);
}

/* ---------- tables ---------- */
function overview(groups, withProp) {
  return S.table([...(withProp ? ['Tuning'] : []), 'Model', 'Diff', 'Meadow', 'Lap 1', 'Lap 2', 'Median death', 'Session min (p10–p90)', 'Score', 'Pts/min', 'Score: gems / Pop / clear', 'Gem ×', 'Pops/run'],
    groups.map(({ spec, sum }) => [...(withProp ? [spec.proposal || 'current'] : []), spec.model, spec.difficulty, S.pct(sum.meadow), S.pct(sum.lap1), S.pct(sum.lap2),
      sum.capped >= 0.5 ? `cap (${S.pct(sum.capped)})` : S.levelName(Math.round(sum.deathLevel)),
      `${S.f1(sum.sessionMin)} (${S.f1(sum.sessionP10)}–${S.f1(sum.sessionP90)})`, S.f0(sum.score), S.f0(sum.scorePerMin),
      `${S.pct(sum.gemShare)} / ${S.pct(sum.popShare)} / ${S.pct(sum.clearShare)}`, S.f2(sum.gemMul), S.f1(sum.pops)]));
}
function biomeTable(groups, withProp) {
  const rows = [];
  for (const { spec, sum } of groups) for (let b = 0; b < 4; b++) {
    const x = sum.biome[b];
    if (!x.reached) continue;
    rows.push([...(withProp ? [spec.proposal || 'current'] : []), spec.model, spec.difficulty, S.BIOMES[b], S.pct(x.reached), S.pct(x.clearIfReached), S.f0(x.time) + ' (' + S.f0(x.timeP90) + ')',
      S.f2(x.hearts), S.shares(x.kinds, x.bumps), S.shares(x.ter, x.bumps), S.f1(x.meanSize), S.pct(x.maxSizeFrac)]);
  }
  return S.table([...(withProp ? ['Tuning'] : []), 'Model', 'Diff', 'Biome (lap 1)', 'Reached', 'Clear if reached', 'Play s med (p90)', 'Hearts lost', 'By bear', 'By terrain', 'Mean size', 'Time at max'], rows);
}
function lapTable(groups, withProp) {
  return S.table([...(withProp ? ['Tuning'] : []), 'Model', 'Diff', 'Lap 1', 'Lap 2', 'Lap 3', 'Lap 4', 'Lap 5', 'Lap 6', 'Hit 30-min cap'],
    groups.map(({ spec, sum }) => [...(withProp ? [spec.proposal || 'current'] : []), spec.model, spec.difficulty, ...sum.laps.map(S.pct), S.pct(sum.capped)]));
}
function causeTable(groups) {
  return S.table(['Model', 'Diff', 'Bumps', 'By bear (whole run)', 'By terrain', 'With gate open'],
    groups.map(({ spec, sum }) => [spec.model, spec.difficulty, sum.bumps, S.shares(sum.kinds, sum.bumps), S.shares(sum.ter, sum.bumps), S.pct(sum.gateBumps / Math.max(1, sum.bumps))]));
}

/* ---------- experiments ---------- */
const EXP = {
  async baseline(n) {
    const specs = [];
    for (const d of DIFFS) for (const m of [...HUMANS, ...DECISION, ...REF, ...EXPLOITS]) specs.push({ model: m, difficulty: d });
    const g = await batch(specs, n);
    const md = ['## Baseline (current values), N = ' + n + ' per row', '', overview(g), '', '### Per biome (lap 1)', '', biomeTable(g.filter(x => [...HUMANS, 'bot'].includes(x.spec.model))),
      '', '### Laps', '', lapTable(g.filter(x => [...HUMANS, ...REF].includes(x.spec.model))), '', '### Causes', '', causeTable(g.filter(x => [...HUMANS, 'bot'].includes(x.spec.model)))].join('\n');
    save('baseline', g, md);
  },
  async terrain(n) {
    const specs = [];
    for (const d of ['easy', 'normal']) for (const m of ['kid6', 'casual', 'strong']) for (const nt of [false, true]) specs.push({ model: m, difficulty: d, noTerrain: nt, proposal: process.env.PROP || undefined });
    const g = await batch(specs, n);
    const rows = [];
    for (let i = 0; i < g.length; i += 2) {
      const a = g[i].sum, b = g[i + 1].sum;
      for (let k = 1; k < 4; k++) rows.push([g[i].spec.model, g[i].spec.difficulty, S.BIOMES[k], S.pct(a.biome[k].clearIfReached) + ' vs ' + S.pct(b.biome[k].clearIfReached),
        S.f2(a.biome[k].hearts) + ' vs ' + S.f2(b.biome[k].hearts), S.f0(a.biome[k].time) + ' vs ' + S.f0(b.biome[k].time)]);
    }
    save('terrain' + (process.env.PROP ? '_' + process.env.PROP : ''), g, ['## Terrain on vs off' + (process.env.PROP ? ' (' + process.env.PROP + ')' : '') + ', N = ' + n, '',
      S.table(['Model', 'Diff', 'Biome', 'Clear if reached (on vs off)', 'Hearts lost (on vs off)', 'Play s (on vs off)'], rows)].join('\n'));
  },
  async tuning(n) {
    const props = (process.env.PROPS ? process.env.PROPS.split(',') : Object.keys(PROPOSALS));
    const models = process.env.MODELS ? process.env.MODELS.split(',') : ['kid6', 'casual', 'strong', 'greedy', 'popspam', 'balanced', 'random', 'camper', 'strafer', 'bot'];
    const diffs = process.env.DIFFS ? process.env.DIFFS.split(',') : DIFFS;
    const specs = [];
    for (const d of diffs) for (const m of models) for (const p of (process.env.NOCURRENT ? props : [undefined, ...props])) specs.push({ model: m, difficulty: d, proposal: p });
    const g = await batch(specs, n);
    const name = 'tuning' + (process.env.TAG ? '_' + process.env.TAG : '');
    save(name, g, ['## Tuning: current vs ' + props.join(', ') + ', N = ' + n, '', overview(g, true), '', '### Per biome (lap 1)', '',
      biomeTable(g.filter(x => ['kid6', 'casual', 'strong'].includes(x.spec.model)), true), '', '### Laps', '', lapTable(g.filter(x => ['casual', 'strong', 'bot'].includes(x.spec.model)), true)].join('\n'));
  }
};

(async () => {
  const exp = process.argv[2] || 'baseline', n = parseInt(process.argv[3] || '40', 10);
  const t0 = Date.now();
  if (exp === 'all') for (const k of ['baseline', 'terrain', 'tuning']) await EXP[k](n);
  else if (EXP[exp]) await EXP[exp](n);
  else { console.error('unknown experiment ' + exp); process.exit(1); }
  process.stderr.write(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s\n`);
})();
