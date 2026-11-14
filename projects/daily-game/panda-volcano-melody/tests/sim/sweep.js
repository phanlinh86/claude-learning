#!/usr/bin/env node
// Quick tuning sweep: runs a few target players against candidate tunings and prints the headline numbers.
//   node tests/sim/sweep.js [n]        (edit CANDIDATES below; results → tests/sim/results/sweep.txt)
'use strict';
const fs = require('fs');
const path = require('path');
const R = require('./run.js');
const P = require('./players.js');
const PVM = R.load();

const base = R.TUNINGS.after;
function cand(name, config, diff, proto) { return { name, proto: proto || {}, config: Object.assign({}, config), diff: { easy: Object.assign({}, diff.easy), normal: Object.assign({}, diff.normal), hard: Object.assign({}, diff.hard) } }; }
const CANDIDATES = process.env.NOBASE ? [] : [
  cand('before', {}, { easy: {}, normal: {}, hard: {} }),
  cand('after', base.config, base.diff, base.proto)
];
// extra candidates can be passed as JSON files: node sweep.js 40 cand1.json cand2.json
const N = +(process.argv[2] || 40);
for (const fpath of process.argv.slice(3)) { const c = JSON.parse(fs.readFileSync(fpath, 'utf8')); CANDIDATES.push(cand(c.name || path.basename(fpath), c.config || {}, c.diff || { easy: {}, normal: {}, hard: {} }, c.proto)); }

const PROBES = process.env.PROBES ? process.env.PROBES.split(',').map(x => x.split(':')) : [['kid4', 'easy'], ['adult', 'normal'], ['adult', 'hard'], ['bot0.4', 'normal'], ['bot1', 'hard'], ['bot0.8', 'hard'], ['idle', 'easy'], ['zigzag', 'normal']];
const lines = [];
function q(a, p) { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(p * (s.length - 1) + 0.5)]; }
for (const c of CANDIDATES) {
  R.TUNINGS['_' + c.name] = c;
  const row = [c.name.padEnd(14)];
  for (const [m, d] of PROBES) {
    const rs = [];
    const nn = m === 'idle' || m === 'zigzag' ? Math.ceil(N / 2) : N;
    for (let s = 1; s <= nn; s++) rs.push(R.playRound(PVM, P, { tuning: '_' + c.name, model: m, difficulty: d, seed: 1000 + s, maxT: m === 'idle' || m === 'zigzag' ? 300 : 900 }));
    const sp = rs.filter(r => r.seasons[0].cleared).length / rs.length;
    const yr = rs.filter(r => r.cleared >= 4).length / rs.length;
    const ts = rs.flatMap(r => r.seasons.filter(s => s.cleared).map(s => s.playT));
    const notes = rs.reduce((a, r) => a + r.seasons.reduce((b, s) => b + s.notes, 0), 0), coco = rs.reduce((a, r) => a + r.seasons.reduce((b, s) => b + s.coco, 0), 0);
    const pin = rs.reduce((a, r) => a + r.seasons.reduce((b, s) => b + s.pinches, 0), 0), pt = rs.reduce((a, r) => a + r.playT, 0);
    row.push(`${m}/${d}: sp ${Math.round(sp * 100)}% yr ${Math.round(yr * 100)}% t ${q(ts, 0.5).toFixed(0)}s coco ${Math.round(coco / Math.max(1, notes) * 100)}% p/m ${(pin / (pt / 60)).toFixed(2)}`);
  }
  const s = row.join('\n   ');
  console.log(s); lines.push(s);
}
fs.mkdirSync(path.join(__dirname, 'results'), { recursive: true });
fs.appendFileSync(path.join(__dirname, 'results', 'sweep.txt'), '\n=== ' + new Date().toISOString() + ' n=' + N + '\n' + lines.join('\n') + '\n');
