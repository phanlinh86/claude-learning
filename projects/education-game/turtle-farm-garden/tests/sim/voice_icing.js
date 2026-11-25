#!/usr/bin/env node
// Tumi's Flower Farm — voice pacing analysis of tests/sim/out/voice_<tag>.json (from hs_voice_browser.js), matched to THIS
// game's events by time (virtual clock). Report-only.
//   node tests/sim/voice_icing.js <tag> [--dump]
// Per age × lang: utterances / min, speech share, busiest 10 s, prompts (ask) heard fully / cut / never spoken, lines dropped
// (say() called, never reached the synth: queue overflow / stale), count words heard (every chip), traceDone praise heard,
// round praise heard / skipped, hint / offPath / idle lines, identical lines back to back, the same prompt text twice in a row.
'use strict';
const fs = require('fs'), path = require('path');
const tag = process.argv[2] || 'pt_child', dump = process.argv.includes('--dump');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'voice_' + tag + '.json'), 'utf8'));
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const norm = x => String(x).toLowerCase().normalize('NFC').replace(/[\s.,!?;:’'"“”—–\-]/g, '');
const rows = ['| age lang | min | utterances / min | speech % | busiest 10 s (lines) | prompts heard fully % (cut / never) | lines dropped (stale / overflow) | count words heard % (n chips) | traceDone line heard % | round praise heard % (said / rounds) | offPath+traceTap lines / min | hint lines / min | identical back-to-back | same prompt twice in a row |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
const out = [], dropKinds = {}, cutKinds = {};
for (const s of data) {
  const U = s.ulog || [], Lg = s.log || [], ev = s.ev || [];
  if (!U.length) { rows.push(`| ${s.age} ${s.lang} | – | no utterances (ok ${s.ok}) |`); continue; }
  const t0 = ev.length ? ev[0].v : U[0].q, t1 = ev.length ? ev[ev.length - 1].v : U[U.length - 1].q, min = (t1 - t0) / 60000;
  const speech = U.reduce((a, u) => a + ((u.end || u.start + u.dur) - u.start), 0) / 1000;
  let busiest = 0; for (let i = 0; i < U.length; i++) { let n = 0; for (let j = i; j < U.length && U[j].q - U[i].q < 10000; j++) n++; busiest = Math.max(busiest, n); }
  // log lines (say() calls; Date clock = base + virtual) → utterance: same text (normalised, or 12-char prefix) started ≤ 6 s later
  const off = Lg.length ? Lg[0].t - U[0].q : 0;
  for (const l of Lg) l.v = l.t - off;
  let dropped = 0;
  const used = new Set();
  for (const l of Lg) {
    const k = norm(l.text); if (!k) continue;
    const u = U.findIndex((x, i) => !used.has(i) && x.q >= l.v - 50 && x.q <= l.v + 6000 && (norm(x.text) === k || norm(x.text).slice(0, 12) === k.slice(0, 12)));
    if (u >= 0) { used.add(u); l.u = U[u]; } else { dropped++; const key = String(l.text).slice(0, 30); dropKinds[key] = (dropKinds[key] || 0) + 1; }
  }
  // the line(s) said at an event (say() within 60 ms after it) → its utterance (null = dropped)
  const at = (e, minLen) => { const ls = Lg.filter(l => l.v >= e.v - 5 && l.v <= e.v + 60 && String(l.text).length >= (minLen || 1)); if (!ls.length) return undefined; const l = ls.sort((a, b) => b.text.length - a.text.length)[0]; return l.u || null; };
  const heardFully = u => u && u.how === 'end';
  const asks = ev.filter(e => e.type === 'ask');
  let pHeard = 0, pCut = 0, pNever = 0, prevPrompt = null, samePrompt = 0;
  for (const a of asks) {
    const u = at(a, 12);
    if (!u) pNever++; else if (u === undefined) pNever++; else if (heardFully(u)) pHeard++; else { pCut++; const key = String(u.text).slice(0, 30); cutKinds[key] = (cutKinds[key] || 0) + 1; }
    if (u && prevPrompt && norm(u.text) === norm(prevPrompt)) samePrompt++;
    if (u) prevPrompt = u.text;
  }
  const chips = ev.filter(e => e.type === 'chip');
  let cHeard = 0; for (const c of chips) { const l = Lg.find(x => x.v >= c.v - 5 && x.v <= c.v + 60 && /^\S+!?$/.test(String(x.text).trim())), u = l && l.u; if (heardFully(u)) cHeard++; else if (dump) out.push(`COUNT not heard ${s.age}${s.lang} @${((c.v - t0) / 1000).toFixed(1)} ${u ? u.how + ' ' + u.text : 'none'}`); }
  const tds = ev.filter(e => e.type === 'traceDone'); let tdHeard = 0; for (const e of tds) if (heardFully(at(e, 4))) tdHeard++;
  const rds = ev.filter(e => e.type === 'roundDone'); let prSaid = 0, prHeard = 0; for (const e of rds) { const u = at(e, 3); if (u) { prSaid++; if (heardFully(u)) prHeard++; } }
  const offs = ev.filter(e => e.type === 'offPath' || e.type === 'traceTap').filter(e => at(e, 3)).length;
  const hints = ev.filter(e => e.type === 'hint').filter(e => at(e, 3)).length;
  let back = 0; for (let i = 1; i < U.length; i++) if (norm(U[i].text) === norm(U[i - 1].text)) back++;
  rows.push(`| ${s.age} ${s.lang} | ${min.toFixed(1)} | ${(U.length / min).toFixed(1)} | ${(speech / (min * 60) * 100).toFixed(0)} | ${busiest} | ${(pHeard / Math.max(1, asks.length) * 100).toFixed(0)} (${pCut} / ${pNever} of ${asks.length}) | ${dropped} | ${(cHeard / Math.max(1, chips.length) * 100).toFixed(0)} (${chips.length}) | ${(tdHeard / Math.max(1, tds.length) * 100).toFixed(0)} | ${(prHeard / Math.max(1, prSaid) * 100).toFixed(0)} (${prSaid} / ${rds.length}) | ${(offs / min).toFixed(2)} | ${(hints / min).toFixed(2)} | ${back} | ${samePrompt} |`);
  if (dump) { out.push(`--- ${s.age} ${s.lang}`); for (const u of U) out.push(`${((u.q - t0) / 1000).toFixed(1).padStart(7)} ${u.how === 'end' ? ' ' : 'X'} ${((u.end - u.start) / 1000).toFixed(1)}/${(u.dur / 1000).toFixed(1)} ${u.text}`); }
}
const top = o => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([k, v]) => `${v}× "${k}…"`).join('; ');
console.log(rows.join('\n') + '\n\nPrompts cut: ' + top(cutKinds) + '\n\nDropped (said, never spoken): ' + top(dropKinds));
if (dump) fs.writeFileSync(path.join(__dirname, 'out', 'voice_' + tag + '_dump.txt'), out.join('\n'));

// ---- speech time by the event that caused it + prompt start lag (ask → its utterance starts)
{
  const cat = {}, lag = {}, per = {};
  for (const s of data) {
    const U = s.ulog || [], Lg = s.log || [], ev = s.ev || [];
    if (!U.length || !Lg.length) continue;
    const off = Lg[0].t - U[0].q; for (const l of Lg) l.v = l.t - off;
    const used = new Set();
    for (const l of Lg) { const k = norm(l.text); const u = U.findIndex((x, i) => !used.has(i) && x.q >= l.v - 50 && x.q <= l.v + 6000 && (norm(x.text) === k || norm(x.text).slice(0, 12) === k.slice(0, 12))); if (u >= 0) { used.add(u); l.u = U[u]; } }
    const key = s.age <= 4 ? '3–4' : '5–7';
    const C = cat[key] = cat[key] || {}, Lgs = lag[key] = lag[key] || [];
    const rounds = ev.filter(e => e.type === 'roundDone').length; per[key] = (per[key] || 0) + rounds;
    for (const l of Lg) {
      const e = ev.filter(x => x.v <= l.v + 5 && x.v >= l.v - 60 && !['land', 'choicePop', 'enter', 'whoosh', 'chipDrop', 'stepDone', 'rack', 'walk', 'traceStart', 'sack'].includes(x.type)).pop();
      const t = e ? e.type : 'timer';
      const c = C[t] = C[t] || { lines: 0, s: 0, cut: 0 }; c.lines++;
      if (l.u) { c.s += ((l.u.end || l.u.start + l.u.dur) - l.u.start) / 1000; if (l.u.how !== 'end') c.cut++; }
      if (t === 'ask' && l.u) Lgs.push((l.u.start - l.v) / 1000);
    }
  }
  const out2 = ['', '| ages | event → line | lines / round | speech s / round | cut % |', '|---|---|---|---|---|'];
  for (const k of Object.keys(cat)) for (const [t, c] of Object.entries(cat[k]).sort((a, b) => b[1].s - a[1].s)) out2.push(`| ${k} | ${t} | ${(c.lines / per[k]).toFixed(2)} | ${(c.s / per[k]).toFixed(2)} | ${(c.cut / c.lines * 100).toFixed(0)} |`);
  for (const k of Object.keys(lag)) { const a = lag[k].slice().sort((x, y) => x - y); out2.push(`prompt start lag ages ${k}: mean ${mean(a).toFixed(2)} s, p90 ${a[Math.floor(0.9 * a.length)].toFixed(2)} s, max ${a[a.length - 1].toFixed(2)} s (n ${a.length})`); }
  console.log(out2.join('\n'));
}
