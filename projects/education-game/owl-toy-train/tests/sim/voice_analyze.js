#!/usr/bin/env node
// Analyse tests/sim/out/voice_<tag>.json (from hs_voice_browser.js): chattiness, cut prompts, count words, repeats, VI leaks.
//   node tests/sim/voice_analyze.js <tag> [--dump]
'use strict';
const fs = require('fs'), path = require('path');
const tag = process.argv[2] || 'base', dump = process.argv.includes('--dump');
const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'voice_' + tag + '.json'), 'utf8'));
const EN_WORDS = /\b(the|car|put|load|toy|yes|great|whistle|train|good|look|bye|full|try|boing|wants|into|each|shape|colour|color)\b/i;
const out = [];
const agg = {};
for (const s of data) {
  const U = s.ulog, ev = s.ev, L = s.log;
  const k = s.age + ' ' + s.lang;
  const A = { sessions: 1, minutes: 0, lines: 0, spoken: 0, heard: 0, cut: 0, cutEarly: 0, neverSpoken: 0, speechS: 0, prompts: 0, promptCut: 0, promptNever: 0,
    countRounds: 0, countOk: 0, countWordsCut: 0, countMissingWords: 0, repeatsBack: 0, braces: 0, enInVi: 0, roundLines: [], loadLines: [], promptWait: [], cutKinds: {}, neverKinds: {}, repeatKinds: {} };
  const t0 = ev.length ? ev[0].v : 0, t1 = ev.length ? ev[ev.length - 1].v : 0;
  A.minutes = (t1 - t0) / 60000;
  A.lines = L.length;
  // match log lines (display text) to utterances: greedy, in order (spoken text may differ a little: i18n speech())
  const off = L.length && U.length ? L[0].t - U[0].q : 0;
  for (const l of L) l.v = l.t - off;
  for (const u of U) {
    A.speechS += ((u.end || u.start + u.dur) - u.start) / 1000;
    if (u.how === 'end') A.heard++; else { A.cut++; const f = ((u.end || u.start) - u.start) / u.dur; if (f < 0.5) A.cutEarly++; const key = u.text.slice(0, 28); A.cutKinds[key] = (A.cutKinds[key] || 0) + 1; }
  }
  A.spoken = U.length;
  let j = 0;
  for (const l of L) {
    let m = -1;
    for (let i = j; i < Math.min(U.length, j + 6); i++) if (sameish(U[i].text, l.text) && U[i].q >= l.v - 300) { m = i; break; }
    if (m >= 0) { l.u = U[m]; j = m + 1; } else if (l.text.trim()) { l.u = null; A.neverSpoken++; const key = l.text.slice(0, 28); A.neverKinds[key] = (A.neverKinds[key] || 0) + 1; }
    if (l.text.includes('{') || l.text.includes('}') || /undefined|NaN|null/.test(l.text)) A.braces++;
    if (s.lang === 'vi' && EN_WORDS.test(l.text)) { A.enInVi++; if (dump) out.push('EN-in-VI: ' + l.text); }
  }
  for (let i = 1; i < L.length; i++) if (L[i].text === L[i - 1].text) { A.repeatsBack++; const key = L[i].text.slice(0, 28); A.repeatKinds[key] = (A.repeatKinds[key] || 0) + 1; }
  // prompts: the ask events → the utterance closest after
  const asks = ev.filter(e => e.type === 'ask');
  A.prompts = asks.length;
  // per-round count check
  let round = null;
  const rounds = [];
  for (const e of ev) {
    if (e.type === 'round') { round = { v0: e.v, mode: e.mode, counts: [], needs: null }; rounds.push(round); }
    if (!round) continue;
    if (e.type === 'ask') { round.ask = e.v; round.needs = e.needs; }
    if (e.type === 'correct' && e.count) round.counts.push({ v: e.v, i: e.count.i });
    if (e.type === 'loaded') round.loaded = e.v;
    if (e.type === 'whistle') { round.whistle = e.v; round.auto = e.auto; }
    if (e.type === 'roundDone') round.v1 = e.v;
  }
  for (const r of rounds) {
    const inR = U.filter(u => u.q >= r.v0 && u.q < (r.v1 || 1e15));
    A.roundLines.push(inR.length);
    if (r.ask) {
      const pl = L.filter(l => Math.abs(l.v - r.ask) < 120).sort((a, b) => b.text.length - a.text.length)[0];
      const pr = pl && pl.u;
      if (pl) A.promptWait.push(pr ? (pr.start - r.ask) / 1000 : null);
      if (!pr) A.promptNever++; else if (pr.how === 'cut' && (pr.end - pr.start) / pr.dur < 0.9) { A.promptCut++; if (dump) out.push(`PROMPT CUT ${s.age}${s.lang} after ${((pr.end - pr.start) / 1000).toFixed(1)}/${(pr.dur / 1000).toFixed(1)} s: ${pr.text}`); }
      A.loadLines.push(U.filter(u => u.q >= r.ask && u.q < (r.loaded || r.v1 || 1e15)).length);
    }
    if (r.mode === 'count' && r.counts.length) {
      A.countRounds++;
      // count words: utterances queued at the correct events
      let okAll = true;
      for (const c of r.counts) {
        const cl = L.find(l => Math.abs(l.v - c.v) < 120 && /^\S+!$/.test(l.text.trim())), u = cl && cl.u;
        if (!u) { A.countMissingWords++; okAll = false; continue; }
        if (u.how === 'cut' && (u.end - u.start) / u.dur < 0.8) { A.countWordsCut++; okAll = false; }
      }
      if (okAll) A.countOk++;
      if (dump) out.push(`COUNT ${s.age}${s.lang} needs ${JSON.stringify(r.needs)}: ` + r.counts.map(c => { const cl = L.find(l => Math.abs(l.v - c.v) < 120 && /^\S+!$/.test(l.text.trim())), u = cl && cl.u; return c.i + (u ? (u.how === 'end' ? '✓' : '✗' + ((u.end - u.start) / 1000).toFixed(2)) : '?'); }).join(' '));
    }
  }
  const g = agg[k] = agg[k] || A;
  if (g !== A) for (const f of Object.keys(A)) if (typeof A[f] === 'number') g[f] += A[f]; else if (Array.isArray(A[f])) g[f].push(...A[f]);
  if (dump) {
    out.push(`--- session ${k} (${A.minutes.toFixed(1)} min)`);
    for (const u of U) out.push(`${((u.q - t0) / 1000).toFixed(1).padStart(6)} ${u.how === 'end' ? '  ' : 'X '}${((u.end - u.start) / 1000).toFixed(1)}/${(u.dur / 1000).toFixed(1)} ${u.text}`);
  }
}
function sameish(a, b) { const n = x => x.replace(/Mô Mô/g, 'Momo').toLowerCase().replace(/[\s.,!?;:’'"“”—–-]/g, ''); return n(a) === n(b) || (n(a).length > 14 && n(a).slice(0, 14) === n(b).slice(0, 14)); }
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);
const rows = ['| age lang | sessions | min | lines logged / min | spoken / min | speech % of time | heard % | cut % (cut < half) | never spoken | prompts cut / never | count rounds all-words-heard | count words cut / missing | back-to-back repeats | "{"/undefined | EN in VI | lines per round (in load) | prompt starts after ask s |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const k of Object.keys(agg)) {
  const A = agg[k];
  rows.push(`| ${k} | ${A.sessions} | ${A.minutes.toFixed(1)} | ${(A.lines / A.minutes).toFixed(1)} | ${(A.spoken / A.minutes).toFixed(1)} | ${(A.speechS / (A.minutes * 60) * 100).toFixed(0)} | ${(A.heard / A.spoken * 100).toFixed(0)} | ${(A.cut / A.spoken * 100).toFixed(0)} (${(A.cutEarly / A.spoken * 100).toFixed(0)}) | ${A.neverSpoken} | ${A.promptCut} / ${A.promptNever} of ${A.prompts} | ${A.countOk}/${A.countRounds} | ${A.countWordsCut} / ${A.countMissingWords} | ${A.repeatsBack} | ${A.braces} | ${A.enInVi} | ${mean(A.roundLines).toFixed(1)} (${mean(A.loadLines).toFixed(1)}) | ${mean(A.promptWait.filter(x => x != null)).toFixed(1)} |`);
}
const top = (o, n) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${v}× "${k}…"`).join('; ');
const all = Object.values(agg);
const merge = f => all.reduce((m, A) => { for (const [k, v] of Object.entries(A[f])) m[k] = (m[k] || 0) + v; return m; }, {});
rows.push('', 'Most cut: ' + top(merge('cutKinds'), 10), '', 'Never spoken: ' + top(merge('neverKinds'), 10), '', 'Back-to-back repeats: ' + top(merge('repeatKinds'), 8));
console.log(rows.join('\n'));
if (dump) fs.writeFileSync(path.join(__dirname, 'out', 'voice_' + tag + '_dump.txt'), out.join('\n'));
