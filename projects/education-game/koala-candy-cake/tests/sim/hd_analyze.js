#!/usr/bin/env node
// Koko's Cake Tower — analyse hs_designer.js output.   node tests/sim/hd_analyze.js <tag> [--md] [--compare <tag2>]
// Prints per age × model: chapter / session times, cut %, chapter time by topic, hint timing, stars (now + 2 alternative
// rules), sway visibility, content variety, count-chapter content, surprises per chapter, Talk pacing, voice metrics.
'use strict';
const fs = require('fs'), path = require('path');
const tag = process.argv[2] || 'base';
const D = JSON.parse(fs.readFileSync(path.join(__dirname, 'out', `hd_${tag}.json`), 'utf8'));
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const pct = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };
const f = (x, d = 1) => (x == null || isNaN(x) ? '–' : (+x).toFixed(d));
const P = (a, b) => (b ? (100 * a / b).toFixed(0) : '–');

const groups = {};
for (const s of D.sessions) (groups[s.age + '|' + s.model] = groups[s.age + '|' + s.model] || []).push(s);

// alternative star rules (post-hoc from misses+assists m and blocks n)
const starNow = (m) => (m === 0 ? 3 : m === 1 ? 2 : 1);
const starA = (m, n) => { const free = n >= 4 ? 1 : 0; return m <= free ? 3 : m <= free + 1 ? 2 : 1; };                   // 1 free slip in towers of ≥ 4
const starB = (m, n) => { const r = m / n; return r <= 0.25 ? 3 : r <= 0.6 ? 2 : 1; };                                     // by error rate per block

const rows = [];
for (const k of Object.keys(groups)) {
  const [age, model] = k.split('|'), G = groups[k], plays = [].concat(...G.map(s => s.plays)), done = plays.filter(p => p.done);
  const chaps = [].concat(...done.map(p => p.chapters)), asks = [].concat(...plays.map(p => p.asks)), rounds = [].concat(...done.map(p => p.rounds));
  const lands = [].concat(...plays.map(p => p.lands)), voice = [].concat(...G.map(s => s.voice.map(v => Object.assign({ span: s.sessionSpan }, v))));
  const r = { age: +age, model, n: G.length, plays: plays.length, done: done.length };
  r.chap = mean(chaps.map(c => c.dur)); r.chapP10 = pct(chaps.map(c => c.dur), 0.1); r.chapP90 = pct(chaps.map(c => c.dur), 0.9);
  r.cut = 100 * chaps.filter(c => c.rounds < 4).length / Math.max(1, chaps.length);
  r.ses = mean(done.map(p => p.time)); r.sesP90 = pct(done.map(p => p.time), 0.9); r.sesMax = Math.max(0, ...done.map(p => p.time));
  r.over8 = 100 * done.filter(p => p.time > 480).length / Math.max(1, done.length);
  const byT = {}; for (const c of chaps) (byT[c.topic] = byT[c.topic] || []).push(c);
  r.topic = Object.fromEntries(Object.entries(byT).map(([t, a]) => [t, { n: a.length, dur: mean(a.map(c => c.dur)), cut: 100 * a.filter(c => c.rounds < 4).length / a.length }]));
  // surprises
  r.surpr = { chaps: chaps.length, withGust: chaps.filter(c => c.gust > 0).length, withBf: chaps.filter(c => c.bee > 0).length, none: chaps.filter(c => !c.gust && !c.bee).length,
    multi: chaps.filter(c => c.gust + c.bee > 1).length, bfTap: chaps.filter(c => c.beeTap).length, bfChaps: chaps.filter(c => c.surprise === 'bee').length,
    bfMissed: chaps.filter(c => c.surprise === 'bee' && !c.bee).length };
  // stars
  r.stars = [3, 2, 1].map(v => 100 * rounds.filter(x => starNow(x.m) === v).length / Math.max(1, rounds.length));
  r.starsA = [3, 2, 1].map(v => 100 * rounds.filter(x => starA(x.m, x.n) === v).length / Math.max(1, rounds.length));
  r.starsB = [3, 2, 1].map(v => 100 * rounds.filter(x => starB(x.m, x.n) === v).length / Math.max(1, rounds.length));
  r.starsByN = {}; for (const n of [2, 3, 4, 5]) { const a = rounds.filter(x => x.n === n); if (a.length) r.starsByN[n] = { n: a.length, s3: 100 * a.filter(x => x.m === 0).length / a.length, s1: 100 * a.filter(x => x.m >= 2).length / a.length }; }
  // asks / hints
  const ad = asks.filter(a => !a.open).map(a => a.dur);
  r.ask = mean(ad); r.askP90 = pct(ad, 0.9); r.askMax = Math.max(0, ...asks.map(a => a.dur));
  r.wrong = mean(asks.map(a => a.wrong)); r.grass = mean(asks.map(a => a.grass));
  const hinted = asks.filter(a => a.hintT != null);
  r.hinted = 100 * hinted.length / Math.max(1, asks.length);
  r.hintWhy = ['miss2', 'idle', 'soft'].map(w => 100 * hinted.filter(a => a.hintWhy === w).length / Math.max(1, asks.length));
  r.hintT = mean(hinted.map(a => a.hintT)); r.hintTp90 = pct(hinted.map(a => a.hintT), 0.9);
  r.afterHint = mean(hinted.filter(a => !a.open).map(a => a.dur - a.hintT));
  r.idlePerAsk = mean(asks.map(a => a.idles)); r.asks20 = 100 * asks.filter(a => a.dur > 20).length / Math.max(1, asks.length);
  r.open = asks.filter(a => a.open).length; r.openDur = mean(asks.filter(a => a.open).map(a => a.dur));
  // sway
  const ld = lands.filter(l => !l.gust), gu = lands.filter(l => l.gust);
  r.sway = { n: ld.length, inv: P(ld.filter(l => l.top < 3).length, ld.length), subtle: P(ld.filter(l => l.top >= 3 && l.top < 10).length, ld.length),
    vis: P(ld.filter(l => l.top >= 10 && l.top < 30).length, ld.length), wild: P(ld.filter(l => l.top >= 30).length, ld.length),
    topMean: mean(ld.map(l => l.top)), topP90: pct(ld.map(l => l.top), 0.9), peakMax: Math.max(0, ...ld.map(l => l.peak)), cap: ld.filter(l => l.peak > 0.118).length, th: [0.02, 0.05, 0.08].reduce((a, x, i, A) => a, 0) || [ld.filter(l => l.peak < 0.02).length, ld.filter(l => l.peak >= 0.02 && l.peak < 0.05).length, ld.filter(l => l.peak >= 0.05 && l.peak < 0.08).length, ld.filter(l => l.peak >= 0.08).length].map(x => P(x, ld.length)).join(' / '),
    gustTop: mean(gu.map(l => l.top)), gustPeak: Math.max(0, ...gu.map(l => l.peak)),
    byN: Object.fromEntries([1, 2, 3, 4, 5].map(n => { const a = ld.filter(l => l.n === n); return [n, a.length ? f(mean(a.map(l => l.top)), 0) : '–']; })) };
  // content variety
  let sameAns = 0, pairs = 0, slotRun3 = 0, slotTrip = 0, colRun = 0, colPairs = 0;
  const colorAns = {}, yellowSets = { has: 0, n: 0 }, chapRep = [];
  for (const p of plays) {
    const A = p.asks;
    for (let i = 1; i < A.length; i++) {
      if (A[i].topic !== A[i - 1].topic) continue;
      pairs++; if (String(A[i].val) === String(A[i - 1].val)) sameAns++;
      if (A[i].color && A[i - 1].color) { colPairs++; if (A[i].color === A[i - 1].color) colRun++; }
      if (i >= 2 && A[i - 2].topic === A[i].topic && A[i].k === 3 && A[i - 1].k === 3 && A[i - 2].k === 3) { slotTrip++; if (A[i].slot === A[i - 1].slot && A[i - 1].slot === A[i - 2].slot) slotRun3++; }
    }
    const byChap = {};
    for (const a of A) {
      if (a.color && (a.topic === 'colors')) colorAns[a.color] = (colorAns[a.color] || 0) + 1;
      if (a.colors.length >= 3 && (a.topic === 'colors' || a.topic === 'shapes')) { yellowSets.n++; if (a.colors.includes('yellow')) yellowSets.has++; }
      (byChap[a.topic] = byChap[a.topic] || []).push(String(a.val));
    }
    for (const [t, vals] of Object.entries(byChap)) { const cnt = {}; vals.forEach(v => (cnt[v] = (cnt[v] || 0) + 1)); chapRep.push({ t, n: vals.length, distinct: Object.keys(cnt).length, max: Math.max(...Object.values(cnt)) }); }
  }
  r.var = { sameAnsPct: P(sameAns, pairs), sameColPct: P(colRun, colPairs), slotRun3Pct: P(slotRun3, slotTrip), yellowInSet: P(yellowSets.has, yellowSets.n),
    colorAns: Object.fromEntries(Object.entries(colorAns).map(([c, v]) => [c, P(v, Object.values(colorAns).reduce((a, b) => a + b, 0))])),
    chapMaxShare: f(mean(chapRep.map(c => c.max / c.n)) * 100, 0), chapDistinct: f(mean(chapRep.map(c => c.distinct)), 1), chapAsks: f(mean(chapRep.map(c => c.n)), 1) };
  // count chapter
  const ca = asks.filter(a => a.topic === 'count');
  if (ca.length) {
    const up = ca.filter(a => a.key === 'p.countUp'), dots = ca.filter(a => a.key === 'p.count');
    const dist = dots.map(a => Math.min(...a.vals.filter(v => v !== a.val).map(v => Math.abs(v - a.val))));
    const vals = {}; dots.forEach(a => (vals[a.val] = (vals[a.val] || 0) + 1));
    const cc = chaps.filter(c => c.topic === 'count');
    r.count = { asks: ca.length, upPct: P(up.length, ca.length), dotsPct: P(dots.length, ca.length), minDist1: P(dist.filter(x => x === 1).length, dist.length),
      dotsVals: Object.entries(vals).map(([v, c]) => v + ':' + P(c, dots.length)).join(' '), wrongUp: f(mean(up.map(a => a.wrong)), 2), wrongDots: f(mean(dots.map(a => a.wrong)), 2),
      tower4: P(cc.filter(c => c.rounds >= 4).length, cc.length), maxUp: Math.max(0, ...up.map(a => a.val)) };
  }
  // talk
  const tk = [].concat(...done.map(p => p.talk));
  r.talk = { dur: mean(tk.map(t => t.dur)), p90: pct(tk.map(t => t.dur), 0.9), right: P(tk.filter(t => t.correct).length, tk.length) };
  // voice
  const span = mean(G.map(s => s.sessionSpan)) / 60, by = t => voice.filter(v => v.tag === t);
  const pr = voice.filter(v => v.ask);
  r.v = { perMin: f(voice.length / G.length / span, 1), spokenMin: f(voice.filter(v => v.s === 'done' || v.s === 'cut').length / G.length / span, 1),
    talkShare: P(voice.filter(v => v.start != null).reduce((a, v) => a + (v.s === 'cut' ? v.heard * v.dur : v.dur), 0) / G.length, span * 60),
    prompt: { n: pr.length, full: P(pr.filter(v => v.s === 'done').length, pr.length), cut: P(pr.filter(v => v.s === 'cut').length, pr.length),
      lost: P(pr.filter(v => ['dropped', 'stale', 'flushed'].includes(v.s)).length, pr.length), delay: f(mean(pr.filter(v => v.start != null).map(v => v.start - v.t)), 2),
      delayP90: f(pct(pr.filter(v => v.start != null).map(v => v.start - v.t), 0.9), 2),
      cutBy: Object.entries(pr.filter(v => v.s === 'cut').reduce((a, v) => (a[v.by] = (a[v.by] || 0) + 1, a), {})).map(([b, c]) => b + ' ' + P(c, pr.length)).join(', '),
      cutHeard: f(mean(pr.filter(v => v.s === 'cut').map(v => v.heard)) * 100, 0) },
    tags: {} };
  for (const t of [...new Set(voice.map(v => v.tag))]) {
    const a = by(t);
    r.v.tags[t] = { perSes: f(a.length / G.length, 1), full: P(a.filter(v => v.s === 'done').length, a.length), cut: P(a.filter(v => v.s === 'cut').length, a.length),
      lost: P(a.filter(v => ['dropped', 'stale', 'flushed'].includes(v.s)).length, a.length) };
  }
  // repeated identical text within 8 s (spam)
  let rep = 0; for (const s of G) { const V = s.voice.filter(v => v.start != null); for (let i = 1; i < V.length; i++) for (let j = i - 1; j >= 0 && V[i].start - V[j].start < 8; j--) if (V[j].text === V[i].text) { rep++; break; } }
  r.v.repeat8 = f(rep / G.length, 1);
  let burst = 0; for (const s of G) { const ts = s.voice.map(v => v.t).sort((a, b) => a - b); let mx = 0; for (let i = 0; i < ts.length; i++) { let j = i; while (j < ts.length && ts[j] - ts[i] < 10) j++; mx = Math.max(mx, j - i); } burst = Math.max(burst, mx); }
  r.v.maxIn10s = burst;
  r.idleTimes = [].concat(...plays.map(p => p.idleT)).slice(0, 8).map(x => f(x, 0)).join(',');
  r.pauseAt = mean(plays.filter(p => p.pauseAt != null).map(p => p.pauseAt));
  rows.push(r);
}
rows.sort((a, b) => a.age - b.age || a.model.localeCompare(b.model));
fs.writeFileSync(path.join(__dirname, 'out', `hd_${tag}.rows.json`), JSON.stringify(rows));
if (process.argv.includes('--json')) process.exit(0);

let md = `## Designer playtest "${tag}" — ${D.sessions.length} sessions × ${D.plays} play(s)` + (Object.keys(D.config).length ? ' · config ' + JSON.stringify(D.config) : '') + (D.voice.length ? ' · voice ' + D.voice.join(',') : '') + '\n\n';
md += '### Time\n\n| age | model | done | chapter mean / p10 / p90 s | cut % | session mean / p90 / max s | > 8 min % | ask mean / p90 / max s | asks > 20 s % | chapter s by topic (cut %) |\n|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.age} | ${r.model} | ${r.done}/${r.plays} | ${f(r.chap)} / ${f(r.chapP10)} / ${f(r.chapP90)} | ${f(r.cut, 0)} | ${f(r.ses, 0)} / ${f(r.sesP90, 0)} / ${f(r.sesMax, 0)} | ${f(r.over8, 0)} | ${f(r.ask)} / ${f(r.askP90)} / ${f(r.askMax, 0)} | ${f(r.asks20, 1)} | ${Object.entries(r.topic).map(([t, v]) => `${t} ${f(v.dur, 0)} (${f(v.cut, 0)})`).join(' · ')} |\n`;
md += '\n### Help and stars\n\n| age | model | wrong / grass per ask | hinted asks % (2-miss / idle / soft) | 1st hint at mean / p90 s | ask s after hint | ★★★/★★/★ now | by tower size: ★★★ % / ★ % | rule A (1 free slip in ≥ 4) | rule B (errors / block) |\n|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) md += `| ${r.age} | ${r.model} | ${f(r.wrong, 2)} / ${f(r.grass, 2)} | ${f(r.hinted, 0)} (${r.hintWhy.map(x => f(x, 0)).join(' / ')}) | ${f(r.hintT)} / ${f(r.hintTp90)} | ${f(r.afterHint)} | ${r.stars.map(x => f(x, 0)).join('/')} | ${Object.entries(r.starsByN).map(([n, v]) => `${n}: ${f(v.s3, 0)}/${f(v.s1, 0)}`).join(' · ')} | ${r.starsA.map(x => f(x, 0)).join('/')} | ${r.starsB.map(x => f(x, 0)).join('/')} |\n`;
md += '\n### Sway (peak top-of-tower displacement in the 2 s after a landing)\n\n| age | model | lands | < 3 px / 3–10 / 10–30 / ≥ 30 px % | top mean / p90 px | θ < .02 / .02–.05 / .05–.08 / ≥ .08 rad % | by height 1…5 (mean px) | max θ | cap hits | gust top mean px / max θ |\n|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) { const s = r.sway; md += `| ${r.age} | ${r.model} | ${s.n} | ${s.inv} / ${s.subtle} / ${s.vis} / ${s.wild} | ${f(s.topMean, 0)} / ${f(s.topP90, 0)} | ${s.th} | ${Object.values(s.byN).join(' · ')} | ${f(s.peakMax, 3)} | ${s.cap} | ${f(s.gustTop, 0)} / ${f(s.gustPeak, 3)} |\n`; }
md += '\n### Variety, surprises, count, Talk\n\n| age | model | same answer as prev ask % | same colour as prev % | same slot 3× in a row % (k = 3; chance 11 %) | yellow in 3-colour sets % | colour answers % | chapter: asks / distinct answers / top-answer share % | surprise: chaps / gust / bee / none / >1 / bee tapped | count: up % / dots % / dots near (±1) distractor % / tower-4 played % / wrong up / dots / dots values % | Talk s mean / p90 / right % |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) { const v = r.var, s = r.surpr, c = r.count; md += `| ${r.age} | ${r.model} | ${v.sameAnsPct} | ${v.sameColPct} | ${v.slotRun3Pct} | ${v.yellowInSet} | ${Object.entries(v.colorAns).map(([k, x]) => k + ' ' + x).join(', ')} | ${v.chapAsks} / ${v.chapDistinct} / ${v.chapMaxShare} | ${s.chaps} / ${s.withGust} / ${s.withBf} / ${s.none} / ${s.multi} / ${s.bfTap} | ${c ? `${c.upPct} / ${c.dotsPct} / ${c.minDist1} / ${c.tower4} / ${c.wrongUp} / ${c.wrongDots} / ${c.dotsVals}` : '–'} | ${f(r.talk.dur)} / ${f(r.talk.p90)} / ${r.talk.right} |\n`; }
md += '\n### Voice (main.js speech replayed into the CK.Voice queue model)\n\n| age | model | lines / min (asked / spoken) | Koko talking % of time | prompts: full / cut / lost % | cut by (% of prompts) | heard before cut % | prompt start delay mean / p90 s | same line again < 8 s / session | max lines in 10 s | per tag: per session (full / cut / lost %) |\n|---|---|---|---|---|---|---|---|---|---|---|\n';
for (const r of rows) { const v = r.v; md += `| ${r.age} | ${r.model} | ${v.perMin} / ${v.spokenMin} | ${v.talkShare} | ${v.prompt.full} / ${v.prompt.cut} / ${v.prompt.lost} | ${v.prompt.cutBy || '–'} | ${v.prompt.cutHeard} | ${v.prompt.delay} / ${v.prompt.delayP90} | ${v.repeat8} | ${v.maxIn10s} | ${Object.entries(v.tags).map(([t, x]) => `${t} ${x.perSes} (${x.full}/${x.cut}/${x.lost})`).join(' · ')} |\n`; }
const ex = rows.filter(r => r.pauseAt || r.open);
if (ex.length) md += '\n' + ex.map(r => `- ${r.age}/${r.model}: open asks ${r.open} (mean ${f(r.openDur, 0)} s) · auto-pause at ${f(r.pauseAt, 0)} s · idle nudges at ${r.idleTimes || 'never'}`).join('\n') + '\n';
console.log(md);
fs.writeFileSync(path.join(__dirname, 'out', `hd_${tag}.md`), md);
