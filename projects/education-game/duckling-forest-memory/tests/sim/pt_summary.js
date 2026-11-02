// Summaries for pt_kids.js results (markdown).   node tests/sim/pt_summary.js kids_base  → reprints tests/sim/out/pt_kids_base.md
'use strict';
const fs = require('fs');
const path = require('path');
const { mean, pct } = require('./lib');
const flat = (a) => [].concat(...a);
const sum = (a) => a.reduce((s, x) => s + (x || 0), 0);
const f0 = (x) => (isFinite(x) ? Math.round(x) + '' : '–'), f1 = (x) => (isFinite(x) ? x.toFixed(1) : '–'), fp = (x) => (isFinite(x) ? (100 * x).toFixed(0) + '%' : '–');
const tbl = (h, rows) => '| ' + h.join(' | ') + ' |\n|' + h.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';

function agg(S) {
  const done = S.filter(s => s.done), ses = done.map(s => s.sessionTime);
  const ch = flat(S.map(s => s.chapters.filter(c => c.dur !== null)));
  const R = flat(S.map(s => s.rounds.filter(r => r.dur !== null)));
  const maxStars = (s) => 3 * s.rounds.length + s.chapters.length;
  const L = {}; for (const s of S) for (const k in s.ledger) L[k] = (L[k] || 0) + s.ledger[k];
  const tot = sum(Object.values(L));
  const play = (L['round.play'] || 0) + (L['round.resolve'] || 0);
  return { n: S.length, done: done.length, ses: mean(ses), sesP90: pct(ses, 0.9), sesMax: ses.length ? Math.max(...ses) : NaN,
    chap: mean(ch.map(c => c.dur)), chapP10: pct(ch.map(c => c.dur), 0.1), chapP90: pct(ch.map(c => c.dur), 0.9),
    round: mean(R.map(r => r.dur)), play: mean(R.map(r => r.play)), mm: mean(R.map(r => r.mm)), mmP90: pct(R.map(r => r.mm), 0.9),
    hintR: R.filter(r => r.hints > 0).length / Math.max(1, R.length),
    r3: R.filter(r => r.stars === 3).length / Math.max(1, R.length), r1: R.filter(r => r.stars === 1).length / Math.max(1, R.length),
    starPct: mean(done.map(s => s.stars / maxStars(s))), stars: mean(done.map(s => s.stars)),
    cut: ch.filter(c => c.rounds < 4).length / Math.max(1, ch.length),
    dead: mean(S.map(s => s.deadTaps)), taps: mean(S.map(s => s.taps)), noHelp: Math.max(...S.map(s => s.maxNoHelp)),
    ledger: L, tot, playShare: play / tot, errors: sum(S.map(s => s.errors.length)) };
}

function report(D) {
  const S = D.sessions, drivers = [...new Set(S.map(s => s.driver))], ages = [...new Set(S.map(s => s.age))].sort(), vps = [...new Set(S.map(s => s.vp))];
  let md = `## Playtest ${D.name}\n\nconfig ${JSON.stringify(D.config)} · patches ${JSON.stringify(D.patches || [])}\n\n### Driver × age\n\n`;
  const rows = [];
  for (const d of drivers) for (const a of ages) {
    const g = agg(S.filter(s => s.driver === d && s.age === a)); if (!g.n) continue;
    rows.push([d, a, g.n, g.done === g.n ? 'all' : g.done, f0(g.ses), f0(g.sesP90), f0(g.sesMax), f0(g.chap), f0(g.chapP10) + '–' + f0(g.chapP90),
      f1(g.round), f1(g.play), f1(g.mm), f0(g.mmP90), fp(g.hintR), fp(g.r3) + '/' + fp(g.r1), fp(g.starPct), fp(g.cut), f0(g.taps), f0(g.dead), fp(g.playShare)]);
  }
  md += tbl(['driver', 'age', 'n', 'done', 'session', 'p90', 'max', 'chapter', 'p10–p90', 'round', 'play/round', 'mm/round', 'mm p90', 'rounds w/ hint', '3★/1★ rounds', 'stars %', 'cut ≤3', 'taps', 'dead taps', 'play share'], rows);

  md += '\n### Where the time goes (s per session, share) — typical / weak4, age 4\n\n';
  const keys = ['intro', 'round.deal', 'round.peek', 'round.hide', 'round.play', 'round.resolve', 'round.mismatchShow', 'round.done', 'roundDone', 'talk.ask', 'talk.after', 'levelDone'];
  const lr = [];
  for (const d of ['typical', 'weak4', 'slow3', 'spam4c']) {
    const sub = S.filter(s => s.driver === d && s.age === 4); if (!sub.length) continue; const g = agg(sub);
    lr.push([d].concat(keys.map(k => f1((g.ledger[k] || 0) / sub.length) + ' (' + fp((g.ledger[k] || 0) / g.tot) + ')')));
  }
  md += tbl(['driver'].concat(keys), lr);

  md += '\n### Round time by topic and pairs (typical child, own age)\n\n';
  const tr = [];
  for (const a of ages) {
    const R = flat(S.filter(s => s.driver === 'typical' && s.age === a).map(s => s.rounds.filter(r => r.dur !== null)));
    const topics = [...new Set(R.map(r => r.topic))];
    for (const t of topics) { const q = R.filter(r => r.topic === t); tr.push([a, t, q.length, f1(mean(q.map(r => r.dur))), f1(mean(q.map(r => r.play))), f1(mean(q.map(r => r.mm))), [...new Set(q.map(r => r.pairs))].sort().join(',')]); }
  }
  md += tbl(['age', 'topic', 'rounds', 'round s', 'play s', 'mm', 'pairs seen'], tr);

  md += '\n### Reward crowding at Talk time (final perch boxes overlapping > 40 % of the smaller box), all drivers\n\n';
  const cr = [];
  for (const v of vps) for (const a of ages) {
    const C = flat(S.filter(s => s.vp === v && s.age === a).map(s => s.crowd)); if (!C.length) continue;
    const byL = [0, 1, 2, 3].map(l => { const q = C.filter(c => c.level === l); return q.length ? fp(sum(q.map(c => c.bad)) / Math.max(1, sum(q.map(c => c.n)))) : '–'; });
    cr.push([v, a, f1(mean(C.map(c => c.n))), Math.max(...C.map(c => c.n)), fp(sum(C.map(c => c.bad)) / Math.max(1, sum(C.map(c => c.n)))), fp(C.filter(c => c.bad > 0).length / C.length), f1(mean(C.map(c => c.air)))].concat(byL));
  }
  md += tbl(['viewport', 'age', 'rewards/chapter', 'max', 'crowded rewards', 'chapters with a cluster', 'in the air', 'ch1', 'ch2', 'ch3', 'ch4'], cr);

  md += '\n### Card width (px, logical) by age × viewport: min / median, pairs → grid\n\n';
  const cw = [];
  for (const v of vps) for (const a of ages) {
    const K = flat(S.filter(s => s.vp === v && s.age === a).map(s => s.cards)); if (!K.length) continue;
    const byP = {}; for (const k of K) { (byP[k.pairs] = byP[k.pairs] || {}); byP[k.pairs][k.grid + ' ' + Math.round(k.cw)] = 1; }
    cw.push([v, a, f0(Math.min(...K.map(k => k.cw))), f0(pct(K.map(k => k.cw), 0.5)), Object.keys(byP).sort().map(p => p + 'p: ' + Object.keys(byP[p]).join(' / ')).join(' · ')]);
  }
  md += tbl(['viewport', 'age', 'min', 'median', 'grids'], cw);
  const all = agg(S);
  md += `\nerrors ${all.errors} · unfinished ${all.n - all.done} / ${all.n} · longest stretch of play without a match or hint ${f0(all.noHelp)} s\n`;
  return md;
}
module.exports = { agg, report };
if (require.main === module) {
  const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'pt_' + process.argv[2] + '.json'), 'utf8'));
  console.log(report(D));
}
