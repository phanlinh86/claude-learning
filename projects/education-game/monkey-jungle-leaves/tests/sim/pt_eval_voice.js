#!/usr/bin/env node
// Voice pacing summary of part B of pt_eval_browser.js (tests/sim/out/eval_browser.json) → stdout (markdown).
'use strict';
const d = require('./out/eval_browser.json');
const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
let md = '';
for (const part of ['B', 'K']) for (const lang of Object.keys(d[part] || {})) {
  const B = d[part][lang], says = B.says, sp = B.tts.spoken, ev = B.ev;
  const t0 = says.length ? Math.min(says[0].t, ev[0] ? ev[0].pt : 1e18) : 0, mins = (B.now - t0) / 60000;
  const by = {}; for (const s of says) by[s.reason || 'pending'] = (by[s.reason || 'pending'] || 0) + 1;
  const busy = sp.reduce((q, s) => q + (s.t1 - s.t0), 0) / (B.now - t0);
  // per round
  const rounds = ev.filter(e => e.type === 'round').length;
  // latency: event → start of the line it caused (match by order: the first spoken line starting after the event whose text was requested within 50 ms of it)
  const lat = {};
  for (const e of ev) {
    if (!['round', 'peek', 'hide', 'match', 'flip', 'cheer', 'mismatch', 'scroll'].includes(e.type)) continue;
    const s = says.find(x => Math.abs(x.t - e.pt) < 60 && !x._used && x.reason !== null); if (!s) continue; s._used = e.type;
    const spk = sp.find(x => x.text && x.t0 >= s.t - 5 && (x.text === s.text || x.text.replace(/Lô Lô/g, 'Lolo') === s.text));
    (lat[e.type] = lat[e.type] || { n: 0, spoken: 0, delay: [], fate: {} }).n++;
    const L = lat[e.type]; L.fate[s.reason] = (L.fate[s.reason] || 0) + 1;
    if (s.reason === 'end' && spk) { L.spoken++; L.delay.push((spk.t0 - e.pt) / 1000); }
  }
  // repetition
  const cnt = {}; for (const s of says) cnt[s.text] = (cnt[s.text] || 0) + 1;
  const top = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const fin = sp.filter(x => x.end === 'end'); let rep = 0; for (let i = 1; i < fin.length; i++) if (fin[i].text === fin[i - 1].text) rep++;
  md += `### ${part === 'K' ? 'Child-paced bot (0.7 slowed ×0.4)' : 'Bot skill 0.7'} · ${lang.toUpperCase()} — ${mins.toFixed(1)} min, ${rounds} rounds, age 4\n\n`;
  md += `- requested lines: **${says.length}** (${(says.length / mins).toFixed(1)}/min, ${(says.length / Math.max(1, rounds)).toFixed(1)}/round); spoken to the end: **${by.end || 0}** (${((by.end || 0) / mins).toFixed(1)}/min); ` +
    `interrupted ${by.interrupted || 0}, dropped (queue > 2) ${by.dropped || 0}, stale (> 5 s in the queue) ${by.stale || 0}, other ${Object.entries(by).filter(([k]) => !['end', 'interrupted', 'dropped', 'stale'].includes(k)).map(([k, v]) => k + ' ' + v).join(', ') || 0}\n`;
  md += `- Lolo talks **${(100 * busy).toFixed(0)} %** of the time; max requests in flight (queued + speaking) ${B.maxPending}; distinct texts ${Object.keys(cnt).length}; same line twice in a row (spoken) ${rep}\n`;
  md += `- most requested: ${top.map(([t, n]) => `"${t}" ×${n}`).join(' · ')}\n\n`;
  md += '| line caused by | n | spoken | interrupted | dropped | stale | delay event → speech starts (mean / p90 s) |\n|---|---|---|---|---|---|---|\n';
  for (const [k, L] of Object.entries(lat)) md += `| ${k} | ${L.n} | ${L.fate.end || 0} | ${L.fate.interrupted || 0} | ${L.fate.dropped || 0} | ${L.fate.stale || 0} | ${L.delay.length ? mean(L.delay).toFixed(1) + ' / ' + pct(L.delay, 0.9).toFixed(1) : '–'} |\n`;
  md += '\n';
}
console.log(md);
