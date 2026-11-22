#!/usr/bin/env node
// Nim's River Hop — prints the playtester's summary tables from tests/sim/out/pt_<tag>.json (report-only).
//   node tests/sim/pt_summary.js base [after …]   (several tags → before/after columns)
'use strict';
const path = require('path');
const tags = process.argv.slice(2);
const J = tags.map(t => require(path.join(__dirname, 'out', 'pt_' + t + '.json')));
const f = (x, d = 1) => (x == null || !isFinite(x) ? '–' : (+x).toFixed(d));
const sp = (r, k) => (r.speech && r.speech[k]) || { n: 0, end: 0, cut: 0, flushed: 0, dropped: 0, stale: 0, waitSum: 0, waitMax: 0, by: {} };
const lost = a => a.cut + a.flushed + a.dropped + a.stale;

for (let ti = 0; ti < J.length; ti++) {
  const j = J[ti];
  console.log(`\n## ${tags[ti]} — ${j.sessions} sessions, config ${JSON.stringify(j.config)}, patch '${j.patch}', voiceK ${j.voiceK}\n`);
  console.log('| model | skill | n | done % | stuck | session min (p90, max) | chapter s [p10–p90] | round s (p90, max) | >120 s | max no-progress s (p90) | >20 s no-progress rounds % | stars 3/2/1 % | hints / round | assist rounds % | queued-wrong / ahead-as-miss |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of j.mrows.sort((a, b) => a.model.localeCompare(b.model) || a.skill - b.skill))
    console.log(`| ${r.model} | ${r.skill || '–'} | ${r.n} | ${f(r.done)} | ${r.stuckState} | ${f(r.sess)} (${f(r.sessP90)}, ${f(r.sessMax)}) | ${f(r.chap)} [${f(r.chapP10)}–${f(r.chapP90)}] | ${f(r.round)} (${f(r.roundP90)}, ${f(r.roundMax)}) | ${r.r120} | ${f(r.noProgMax)} (${f(r.noProgP90)}) | ${f(r.noProg20)} | ${f(r.st3, 0)}/${f(r.st2, 0)}/${f(r.st1, 0)} | ${f(r.hintR, 2)} | ${f(r.assistRounds)} | ${r.queuedWrong} / ${r.aheadAsMiss} |`);
  console.log('\n**Speech** (per model, all ages): prompt lost = cut + flushed + dropped + stale of the round\'s question; count lost; fruit said per round; mean / max wait from queue to start (ms)\n');
  console.log('| model | skill | prompts | prompt lost (by) | prompt wait ms mean / max | count lines | count lost (cut) | right lost % | wrong lost % | fruit lines said / rounds | ahead said | idle cut |');
  console.log('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of j.mrows) {
    const p = sp(r, 'prompt'), c = sp(r, 'count'), ri = sp(r, 'right'), w = sp(r, 'wrong'), fr = sp(r, 'fruit'), ah = sp(r, 'ahead'), id = sp(r, 'idle');
    const rounds = Math.round(r.n * 16 * (r.done / 100)) || 1;
    const cc = c;
    console.log(`| ${r.model} | ${r.skill || '–'} | ${p.n} | ${lost(p)} (${JSON.stringify(p.by)}) | ${f(p.waitSum / Math.max(1, p.end + p.cut), 0)} / ${f(p.waitMax, 0)} | ${c.n} | ${lost(c)} (cut ${c.cut}, flushed ${c.flushed}, dropped ${c.dropped}) | ${f(lost(ri) / Math.max(1, ri.n) * 100)} | ${f(lost(w) / Math.max(1, w.n) * 100)} | ${fr.end}/${fr.n} said of ${p.n} rounds (${f(fr.end / Math.max(1, p.n) * 100)} %) | ${ah.n} | ${id.cut}/${id.n} |`);
  }
  const a = j.all, v = a.variety;
  console.log(`\n**All**: hop-to-hop inside a crossing ${f(a.inGap, 2)} s (p90 ${f(a.inGapP90, 2)}); right-to-right incl. round changes ${f(a.hopGap, 2)} s (p90 ${f(a.hopGapP90, 2)}), fruit-to-fruit ${f(a.fruitGap)} s (p90 ${f(a.fruitGapP90)}); idle nudges n ${a.idleN}: 1st at ${f(a.idleFirst)} s, 2nd at ${f(a.idleSecond)} s after the last touch; queued (mid-air) taps judged wrong ${a.queuedWrong} of ${a.wrongs} wrongs; ahead taps counted as a miss ${a.aheadAsMiss}; mid-air taps ${a.airTaps}`);
  console.log(`**Variety**: ${v.rounds} rounds, ${v.rows} rows — target at the same position in every row: ${v.sameRankAll}; consecutive same asked value ${v.ruleRepeat}; consecutive same fruit ${v.fruitRepeat} (at a chapter's round 0: ${a.fruitRepeat0}); target is stone i = 0: ${f(v.rank0 / v.rows * 100)} %; position histogram (m:rank) ${JSON.stringify(v.rankHist)}`);
  const open = a.open || []; if (open.length) console.log(`**Unfinished sessions**: ${open.length}, e.g. ${JSON.stringify(open.slice(0, 3))}`);
}
