#!/usr/bin/env node
// High-speed playtester probe (report-only): measures what playtest.js does not —
//  phase breakdown per round, critter blocking leaf taps, vine-swing landing vs scroll end, leaf swing amplitude per
//  time of day (wind only vs with taps), idle nudges / auto-pause timing, topic rotation across consecutive sessions,
//  identical consecutive rounds.
//   node tests/qa/hs_probe.js [--n 40] [--config '{...}']   → tests/sim/out/hs_probe.json + stdout
'use strict';
const fs = require('fs'), path = require('path');
const L = require('../sim/lib');
const LL = L.LL;
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 40), config = JSON.parse(get('config', '{}'));
const VPS = Object.keys(L.VIEWPORTS);
const mean = L.mean, pct = L.pct;

// the jungle wind per time of day, as main copies weather.ambient.wind into world.wind (weather.js not loaded in lib)
const WX = (() => { const vm = require('vm'); const sb = { console, Math, JSON }; sb.window = sb; vm.createContext(sb);
  for (const f of ['rng.js', 'weather.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../../game/js', f), 'utf8'), sb);
  return sb.LL.Weather; })();
const MAX = a => a.reduce((m, x) => (x > m ? x : m), -Infinity);
const WIND = (() => {
  try {
    const W = WX; const out = {};
    for (let m = 0; m < 4; m++) {
      const wx = new W({ seed: 3 }); if (wx.setViewport) wx.setViewport(960, 720); wx.setWeather(m, true);
      const ws = []; for (let i = 0; i < 60 * 120; i++) { wx.update(1 / 60, { groundY: 600 }); if (i > 60 * 5) ws.push(wx.ambient.wind); }
      out[m] = { mean: mean(ws), max: MAX(ws.map(Math.abs)) };
    }
    return out;
  } catch (e) { return { err: String(e) }; }
})();

function runOne(o) {
  const vp = L.VIEWPORTS[o.vp], w = new LL.World({ seed: o.seed, age: o.age, lang: o.lang, config });
  w.setViewport(vp.W, vp.H, vp.ins);
  const drv = L.makeDriver(o.driver, w, o.age, o.seed * 31 + 7);
  const R = { phases: [], blocked: [], swing: [], swingMax: { 0: [], 1: [], 2: [], 3: [] }, swingWind: { 0: 0, 1: 0, 2: 0, 3: 0 },
    critters: [], keys: [], idles: [] };
  // wrap pointerDown: a tap that the critter eats while a leaf is under the finger
  const pd = w.pointerDown.bind(w);
  w.pointerDown = function (x, y) {
    const leaf = w.state === 'round' && w.phase !== 'scroll' ? w._hit(x, y) : null, k = w.critter;
    const r = pd(x, y);
    if (r === 'critter' && leaf && k) { const c = R.critters[R.critters.length - 1]; if (c) c.blocked++; }
    return r;
  };
  let ph = null, phT = 0, rd = null, scrollStart = 0, lastTapT = -99, crit = null;
  const wx = new WX({ seed: o.seed, width: vp.W, height: vp.H }); let wl = -1, fr = 0;
  w.newSession(); w.drainEvents();
  const dt = 1 / 60; let t = 0;
  while (t < 1500 && w.state !== 'sessionDone') {
    const n0 = w.events.length;
    if (w.weather !== wl && w.weather !== undefined) { wl = w.weather; wx.setWeather(wl, {}); }
    wx.update(dt, { groundY: w.layout.groundY }); w.wind = (wx.ambient && wx.ambient.wind) || 0;
    drv.step(dt); w.update(dt); t += dt; fr++;
    if (w.events.length > n0 && w.events.slice(n0).some(e => e.type === 'flip')) lastTapT = w.time;
    for (const e of w.drainEvents()) {
      if (e.type === 'scroll') scrollStart = w.time;
      if (e.type === 'swing') R.swing.push({ phase: e.phase, t: w.time - scrollStart, T: w.scrollTime });
      if (e.type === 'round') { rd = { t0: w.time, topic: e.topic, pairs: e.pairs, ph: {} }; R.phases.push(rd); R.keys.push({ l: w.level, r: e.round, k: w.cards.map(c => c.key + '|' + JSON.stringify(c.face)).sort().join(',') }); }
      if (e.type === 'critter') {
        if (e.action === 'enter') { crit = { type: e.critter, enter: w.time - (rd && rd.playAt || w.time), blocked: 0, leave: null, tap: null }; R.critters.push(crit); }
        if (e.action === 'tap' && crit) crit.tap = w.time;
        if (e.action === 'leave' && crit) crit.leave = w.time;
      }
      if (e.type === 'play' && rd) rd.playAt = w.time;
      if (e.type === 'idle') R.idles.push(e.n);
      if (e.type === 'roundDone' && rd) rd.end = w.time;
    }
    if (w.state === 'round') {
      const p = w.phase; if (p !== ph) { if (rd && ph) rd.ph[ph] = (rd.ph[ph] || 0) + (w.time - phT); ph = p; phT = w.time; }
      if (w.cards.length && (p === 'play' || p === 'resolve') && fr % 6 === 0) {
        let m = 0; for (const c of w.cards) m = Math.max(m, Math.abs(c.swing));
        R.swingMax[w.weather].push(m);
        if (w.time - lastTapT > 6) R.swingWind[w.weather] = Math.max(R.swingWind[w.weather], m);
      }
    } else if (ph) { if (rd) rd.ph[ph] = (rd.ph[ph] || 0) + (w.time - phT); ph = null; }
  }
  R.done = w.state === 'sessionDone'; R.time = w.time; R.levels = w.levels.slice();
  // identical consecutive rounds (same faces on the same tree)
  R.same = 0; for (let i = 1; i < R.keys.length; i++) if (R.keys[i].k === R.keys[i - 1].k) R.same++;
  return R;
}

// ---------- 1. sessions
const runs = [];
for (const driver of ['typical', 'careful4', 'toddler', 'slow3', 'bot0.6', 'tapper', 'spammer']) for (const age of [3, 4, 5]) for (let i = 0; i < N; i++) {
  const vp = VPS[i % 4], lang = i % 2 ? 'vi' : 'en';
  runs.push(Object.assign({ driver, age, vp, lang }, runOne({ driver, age, vp, lang, seed: 900 + i * 13 + age })));
}
const out = {};
const grp = (d, a) => runs.filter(r => r.driver === d && (a === undefined || r.age === a));
console.log('## Phase breakdown per round (s, mean)  driver age | scroll peek hide play resolve cheer | round');
for (const d of ['typical', 'careful4', 'slow3', 'bot0.6']) for (const a of [3, 4]) {
  const P = grp(d, a).flatMap(r => r.phases.filter(p => p.end));
  const m = k => mean(P.map(p => p.ph[k] || 0)).toFixed(1);
  console.log(`${d} ${a} | ${m('scroll')} ${m('peek')} ${m('hide')} ${m('play')} ${m('resolve')} ${m('cheer')} | ${mean(P.map(p => p.end - p.t0)).toFixed(1)}`);
}
// critters
const C = runs.flatMap(r => r.critters);
const byType = {};
for (const c of C) { const b = byType[c.type] = byType[c.type] || { n: 0, blocked1: 0, blocked2: 0, blockedTaps: 0, tapped: 0, life: [] }; b.n++; b.blockedTaps += c.blocked; if (c.blocked >= 1) b.blocked1++; if (c.blocked >= 2) b.blocked2++; if (c.tap) b.tapped++; }
console.log('\n## Critters: type n | rounds where it ate ≥1 / ≥2 leaf taps | tapped');
for (const k in byType) { const b = byType[k]; console.log(`${k} ${b.n} | ${b.blocked1} (${(100 * b.blocked1 / b.n).toFixed(1)}%) / ${b.blocked2} | ${(100 * b.tapped / b.n).toFixed(0)}%`); }
// swing
const land = runs.flatMap(r => r.swing.filter(s => s.phase === 'land')), leap = runs.flatMap(r => r.swing.filter(s => s.phase === 'leap'));
console.log(`\n## Vine swing: leap at ${mean(leap.map(s => s.t)).toFixed(2)} s, land at ${mean(land.map(s => s.t)).toFixed(2)} s (min ${(-MAX(land.map(s => -s.t))).toFixed(2)}, max ${MAX(land.map(s => s.t)).toFixed(2)}), scroll ends ${mean(land.map(s => s.T)).toFixed(2)} s; lead ${mean(land.map(s => s.T - s.t)).toFixed(2)} s; swings/session ${mean(runs.map(r => r.swing.filter(s => s.phase === 'land').length)).toFixed(1)}`);
// leaf swing
console.log('\n## Leaf swing |rad| per time of day: p50 p95 max (play) | wind-only max (no flip for 6 s) | wind mean/max px/s');
for (let m = 0; m < 4; m++) {
  const a = runs.flatMap(r => r.swingMax[m]); const wo = MAX(runs.map(r => r.swingWind[m]));
  console.log(`${['morning', 'noon', 'sunset', 'night'][m]} | ${pct(a, 0.5).toFixed(3)} ${pct(a, 0.95).toFixed(3)} ${MAX(a).toFixed(3)} | ${wo.toFixed(3)} | ${WIND[m] ? WIND[m].mean.toFixed(1) + '/' + WIND[m].max.toFixed(1) : JSON.stringify(WIND)}`);
}
console.log(`\n## Identical consecutive rounds: ${runs.reduce((s, r) => s + r.same, 0)} in ${runs.reduce((s, r) => s + r.keys.length, 0)} rounds; unfinished sessions ${runs.filter(r => !r.done).length}/${runs.length}`);
console.log(`## Idle nudges per session (typical 4): ${mean(grp('typical', 4).map(r => r.idles.length)).toFixed(2)}; slow3 3: ${mean(grp('slow3', 3).map(r => r.idles.length)).toFixed(2)}`);

// ---------- 2. topic rotation across consecutive sessions ("Play again", lastTopics stored)
console.log('\n## Topic rotation (12 consecutive sessions, lastTopics = previous levels)');
for (const age of [3, 4, 5, 6, 7]) {
  const rng = new LL.RNG(77 + age); let last = null; const seq = []; let overlap = 0, sameFirst = 0, sameSet = 0;
  for (let s = 0; s < 12; s++) {
    const lv = LL.Content.topicsFor(age, rng, last);
    if (last) { overlap += lv.filter(t => last.includes(t)).length; if (lv[0] === last[0]) sameFirst++; if (lv.slice().sort().join() === last.slice().sort().join()) sameSet++; }
    seq.push(lv.join('/')); last = lv;
  }
  const distinct = new Set(seq.map(s => s.split('/').sort().join())).size;
  console.log(`age ${age}: overlap ${(overlap / 11).toFixed(1)}/4 topics with previous, same first ${sameFirst}/11, same set ${sameSet}/11, distinct sets ${distinct}/12 · ${seq.slice(0, 4).join(' | ')}`);
}

// ---------- 3. absent child for 4 minutes in one round (idle timing)
{
  const w = new LL.World({ seed: 5, age: 4, lang: 'en', config }); w.setViewport(960, 720, {}); w.newSession();
  while (w.state !== 'round' || !w.interactive) w.update(1 / 30); w.drainEvents();
  const t0 = w.time, idl = []; while (w.time - t0 < 240) { w.update(1 / 30); for (const e of w.drainEvents()) if (e.type === 'idle') idl.push((w.time - t0).toFixed(0)); }
  console.log(`\n## Absent child 4 min: idle at ${idl.join(', ')} s (main speaks the first 4, pauses at the 5th → at ${idl[4]} s)`);
}
fs.writeFileSync(path.join(__dirname, '../sim/out/hs_probe.json'), JSON.stringify({ byType, wind: WIND }, null, 1));
