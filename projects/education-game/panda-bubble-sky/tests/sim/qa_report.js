#!/usr/bin/env node
// Aggregates tests/sim/out/qa_<tag>.json files (from qa_playtest.js) into markdown tables.   node tests/sim/qa_report.js bots typical slow late chaos
'use strict';
const fs = require('fs'), path = require('path');
const L = require('./lib');
const tags = process.argv.slice(2);
const list = tags.flatMap(t => JSON.parse(fs.readFileSync(path.join(__dirname, 'out', 'qa_' + t + '.json'), 'utf8')).list).filter(s => !s.failed);
const f1 = x => (Number.isFinite(x) ? (+x).toFixed(1) : '–'), pct = L.pct, mean = L.mean;
const by = {};
for (const s of list) (by[s.model + '|' + s.age] = by[s.model + '|' + s.age] || []).push(s);
const order = ['bot0.3', 'bot0.6', 'bot0.9', 'typical', 'slow48', 'late0.4', 'tapper', 'spammer', 'absent'];
const keys = Object.keys(by).sort((a, b) => { const [ma, aa] = a.split('|'), [mb, ab] = b.split('|'); return order.indexOf(ma) - order.indexOf(mb) || aa - ab; });
const out = [];
out.push('| model | age | sessions | done % | session min mean (p90, max) | chapter s mean [p10–p90] (max) | cut % | round s mean (p90) | rounds > 120 s | first pop after ask s | stars 3/2/1 % | wrong / round | hint rounds % | assist rounds % | whoosh s med (max) | talk s mean (p90) |');
out.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
const tot = { sess: 0, err: 0, nan: 0 };
for (const k of keys) {
  const ws = by[k], [model, age] = k.split('|'), ss = ws.flatMap(w => w.sessions), done = ss.filter(s => s.done);
  const rounds = ss.flatMap(s => s.rounds), chaps = ss.flatMap(s => s.chapters), nR = Math.max(1, rounds.length);
  const wh = ws.flatMap(w => w.whoosh), tk = ws.flatMap(w => w.talk);
  tot.sess += ss.length; tot.err += ws.reduce((a, w) => a + w.countErr.length, 0); tot.nan += ws.filter(w => w.nan).length;
  const st = [3, 2, 1].map(n => f1(rounds.filter(r => r.stars === n).length / nR * 100)).join('/');
  if (model === 'absent') {
    out.push(`| absent | ${age} | ${ss.length} | – | (never ends: no auto-play) | – | – | – | – | – | – | – | – | – | – | idle nudges at ${ws[0].idleGaps.slice(0, 7).join(', ')} s after the ask |`);
    continue;
  }
  out.push(`| ${model} | ${age} | ${ss.length} | ${f1(done.length / ss.length * 100)} | ${f1(mean(done.map(s => s.time)) / 60)} (${f1(pct(done.map(s => s.time), 0.9) / 60)}, ${f1(Math.max(...done.map(s => s.time)) / 60)}) | ${f1(mean(chaps.map(c => c.dur)))} [${f1(pct(chaps.map(c => c.dur), 0.1))}–${f1(pct(chaps.map(c => c.dur), 0.9))}] (${f1(Math.max(...chaps.map(c => c.dur)))}) | ${f1(chaps.filter(c => c.rounds < 4).length / Math.max(1, chaps.length) * 100)} | ${f1(mean(rounds.map(r => r.dur)))} (${f1(pct(rounds.map(r => r.dur), 0.9))}) | ${rounds.filter(r => r.dur > 120).length} | ${f1(mean(rounds.filter(r => r.first !== undefined).map(r => r.first)))} | ${st} | ${mean(rounds.map(r => r.wrong)).toFixed(2)} | ${f1(rounds.filter(r => r.hint > 0).length / nR * 100)} | ${f1(rounds.filter(r => r.assist > 0).length / nR * 100)} | ${f1(pct(wh, 0.5))} (${f1(Math.max(...wh))}) | ${f1(mean(tk))} (${f1(pct(tk, 0.9))}) |`);
}
out.push('', `Totals: ${tot.sess} sessions, countPop/countSel errors ${tot.err}, NaN worlds ${tot.nan}.`);

// per-topic chapter durations, age 4, typical / bot0.6 / slow48
out.push('', '| model | age | topic | chapters | chapter s mean (p90) | round s | wrong / round | 3★ % | hint rounds % |', '|---|---|---|---|---|---|---|---|---|');
for (const k of keys) {
  const [model, age] = k.split('|');
  if (!['typical', 'slow48', 'bot0.3'].includes(model)) continue;
  const ss = by[k].flatMap(w => w.sessions), chaps = ss.flatMap(s => s.chapters), rounds = ss.flatMap(s => s.rounds);
  for (const t of [...new Set(chaps.map(c => c.topic))]) {
    const cs = chaps.filter(c => c.topic === t), rs = rounds.filter(r => r.topic === t);
    out.push(`| ${model} | ${age} | ${t} | ${cs.length} | ${f1(mean(cs.map(c => c.dur)))} (${f1(pct(cs.map(c => c.dur), 0.9))}) | ${f1(mean(rs.map(r => r.dur)))} | ${mean(rs.map(r => r.wrong)).toFixed(2)} | ${f1(rs.filter(r => r.stars === 3).length / Math.max(1, rs.length) * 100)} | ${f1(rs.filter(r => r.hint > 0).length / Math.max(1, rs.length) * 100)} |`);
  }
}

// late-tap probe per season × lag (all models pooled) — the finger lands where the bubble WAS lag s ago
const S = ['spring', 'summer', 'autumn', 'winter'];
out.push('', '| season | lag s | exact old spot: hit / neighbour / miss % | + aim ± 0.5 r | only bubbles moving > 60 px/s | first 1.5 s of play | after 1.5 s |', '|---|---|---|---|---|---|---|');
const P = (s, lag, kind) => { const a = { n: 0, hit: 0, nb: 0, miss: 0 }; for (const w of list) { const p = w.probe && w.probe[s + ':' + lag + kind]; if (p) for (const q in a) a[q] += p[q]; } return a; };
const fmt = a => a.n ? `${f1(a.hit / a.n * 100)} / ${(a.nb / a.n * 100).toFixed(2)} / ${(a.miss / a.n * 100).toFixed(2)} (n ${a.n})` : '–';
for (let s = 0; s < 4; s++) for (const [lag, fr] of [[0.2, 6], [0.3, 9], [0.4, 12]]) out.push(`| ${S[s]} | ${lag} | ${fmt(P(s, fr, ''))} | ${fmt(P(s, fr, ':aim'))} | ${fmt(P(s, fr, ':mv'))} | ${fmt(P(s, fr, ':early'))} | ${fmt(P(s, fr, ':late'))} |`);

// speed + overlaps (pooled)
const all = list.flatMap(w => w.speed.all), settled = list.flatMap(w => w.speed.settled), ov = { frames: 0, any: 0, deep: 0, keep: 0, bao: 0 };
let maxDepth = 0, keepMax = 0, baoMax = 0;
for (const w of list) { for (const q in ov) ov[q] += w.overlap[q]; maxDepth = Math.max(maxDepth, w.overlap.maxDepth); keepMax = Math.max(keepMax, w.overlap.keepMax); baoMax = Math.max(baoMax, w.overlap.baoMax); }
out.push('', '| bubble speed in play (px/s) | p50 | p90 | p99 | max |', '|---|---|---|---|---|');
out.push(`| first 2 s of play (arrivals) | ${pct(all, 0.5)} | ${pct(all, 0.9)} | ${pct(all, 0.99)} | ${f1(Math.max(...list.map(w => w.speed.max)))} |`);
out.push(`| after 2 s (resting / after wrong taps / gusts) | ${pct(settled, 0.5)} | ${pct(settled, 0.9)} | ${pct(settled, 0.99)} | ${f1(Math.max(...list.map(w => w.speed.maxSettled)))} |`);
out.push('', `Overlaps during play (${ov.frames} frames): two films touching ${(ov.any / ov.frames * 100).toFixed(3)} % of frames (> 10 px deep ${(ov.deep / ov.frames * 100).toFixed(3)} %, max ${f1(maxDepth)} px); a bubble into the speech bubble / HUD ${(ov.keep / ov.frames * 100).toFixed(3)} % (max ${f1(keepMax)} px); into Bao's box ${(ov.bao / ov.frames * 100).toFixed(3)} % (max ${f1(baoMax)} px).`);

// content repeats
let rep = 0, n = 0, thing = 0, topic = 0, again = 0;
for (const w of list) { rep += w.keysRepSession; n += w.keysN; thing += w.sameThingSet; topic += w.topicOrderSame; again += Math.max(0, w.sessions.length - 1); }
out.push('', `Content: ${n} rounds; the same round key twice in one session ${(rep / n * 100).toFixed(2)} %; the same set of things twice in one session ${(thing / n * 100).toFixed(2)} %; "Play again" with the identical chapter order ${again ? (topic / again * 100).toFixed(1) : '–'} % (${again} replays). Hint gap min ${f1(Math.min(...list.map(w => w.hintGapMin)))} s.`);
const errs = list.flatMap(w => w.countErr); if (errs.length) out.push('', 'count errors: ' + [...new Set(errs)].slice(0, 10).join('; '));
console.log(out.join('\n'));
