#!/usr/bin/env node
// Pacing analysis of tests/sim/out/voice_<tag>.json (hs_voice_browser.js), matching log lines to utterances by TIME (the spoken
// text differs from the shown text for letters / numbers, e.g. "W" → "double you", so text matching under-counts).
//   node tests/sim/voice_pacing.js <tag>
// Per age × lang: prompts heard fully / cut (and whether the cut came from the child's own correct tap = harmless), lines
// dropped (shown, never spoken), count words heard (all / the LAST one), alive-line lag behind the alive event (and how often it
// is still speaking when the next round's prompt is due), finish → alive → praise chain length.
'use strict';
const fs = require('fs'), path = require('path');
const tag = process.argv[2] || 'child';
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'voice_' + tag + '.json'), 'utf8'));
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const rows = ['| age lang | min | utterances / min | speech % of time | prompts (first ask) heard fully % | prompts cut by own right tap / by other | follow-ups ("tap the shining …") heard % | lines dropped (shown, never spoken) | count words heard % (last word heard %) | alive line lag after the event s (mean, max) | alive line ends after the next prompt is due % | round-end chain finish+alive+praise s |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|'];
const dropped = {};
for (const s of data) {
  const U = s.ulog, L = s.log, ev = s.ev;
  if (!U.length || !L.length) continue;
  const off = L[0].t - U[0].q;   // log clock (performance.now) vs virtual clock: same clock in this harness, offset ≈ 0
  const tok = x => new Set(x.toLowerCase().replace(/[.,!?;:’'"“”—–-]/g, ' ').split(/\s+/).filter(Boolean));
  const sim = (a, b) => { const A = tok(a), B = tok(b); let n = 0; for (const x of A) if (B.has(x)) n++; return n / Math.max(1, Math.min(A.size, B.size)); };
  let j = 0;
  for (const l of L) {
    const v = l.t - off; l.v = v; l.u = null;
    for (let i = j; i < Math.min(U.length, j + 5); i++) if (U[i].q >= v - 150 && sim(U[i].text, l.text) >= 0.5) { l.u = U[i]; j = i + 1; break; }
    if (!l.u) { const k = l.text.slice(0, 34); dropped[k] = (dropped[k] || 0) + 1; }
  }
  const t0 = ev[0].v, t1 = ev[ev.length - 1].v, min = (t1 - t0) / 60000;
  const speech = U.reduce((a, u) => a + ((u.end || u.start + u.dur) - u.start), 0) / 1000;
  // prompts
  const asks = ev.filter(e => e.type === 'ask');
  let pFull = 0, pN = 0, cutOwn = 0, cutOther = 0, fFull = 0, fN = 0;
  for (const a of asks) {
    const l = L.find(x => Math.abs(x.v - a.v) < 80 && x.u && x.u.text.length > 8);
    if (!l) continue;
    const u = l.u, full = u.how === 'end' || (u.end - u.start) / u.dur > 0.9;
    const isFollow = a.promptKey === 'p.tapPart';
    if (isFollow) { fN++; if (full) fFull++; } else { pN++; if (full) pFull++; }
    if (!full) { const by = ev.find(e => e.v >= u.end - 60 && e.v <= u.end + 60 && e.type === 'paint'); if (by) cutOwn++; else cutOther++; }
  }
  // count words
  let cw = 0, cwH = 0, lastN = 0, lastH = 0;
  const paints = ev.filter(e => e.type === 'paint' && e.count);
  for (const p of paints) {
    const l = L.find(x => Math.abs(x.v - p.v) < 80); if (!l) continue;
    cw++; const h = l.u && (l.u.how === 'end' || (l.u.end - l.u.start) / l.u.dur > 0.8); if (h) cwH++;
    if (p.count.i === p.count.n) { lastN++; if (h) lastH++; }
  }
  // alive lag
  const lags = [], late = []; let chain = [];
  ev.forEach((e, i) => {
    if (e.type !== 'alive') return;
    const l = L.find(x => x.v >= e.v - 10 && x.v < e.v + 200); if (!l || !l.u) return;
    lags.push((l.u.start - e.v) / 1000);
    const nextAsk = ev.slice(i).find(x => x.type === 'ask' || x.type === 'talk' || x.type === 'levelDone');
    if (nextAsk) late.push((l.u.end || l.u.start + l.u.dur) > nextAsk.v ? 1 : 0);
    const fin = ev.slice(0, i).reverse().find(x => x.type === 'finish'), rd = ev.slice(i).find(x => x.type === 'roundDone');
    if (fin && rd) { const pr = L.find(x => x.v >= rd.v - 10 && x.v < rd.v + 200); if (pr && pr.u) chain.push(((pr.u.end || pr.u.start + pr.u.dur) - fin.v) / 1000); }
  });
  const nDrop = L.filter(l => !l.u).length;
  rows.push(`| ${s.age} ${s.lang} | ${min.toFixed(1)} | ${(U.length / min).toFixed(1)} | ${(speech / (min * 60) * 100).toFixed(0)} | ${(pFull / Math.max(1, pN) * 100).toFixed(0)} (${pN}) | ${cutOwn} / ${cutOther} | ${(fFull / Math.max(1, fN) * 100).toFixed(0)} (${fN}) | ${nDrop} | ${cw ? (cwH / cw * 100).toFixed(0) : '–'} (${lastN ? (lastH / lastN * 100).toFixed(0) : '–'}) | ${mean(lags).toFixed(2)}, ${Math.max(0, ...lags).toFixed(2)} | ${(mean(late) * 100).toFixed(0)} | ${mean(chain).toFixed(1)} |`);
}
console.log(rows.join('\n'));
console.log('\nDropped lines (shown, never spoken): ' + Object.entries(dropped).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, n]) => `${n}× "${k}…"`).join('; '));
