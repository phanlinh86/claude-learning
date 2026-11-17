#!/usr/bin/env node
// QA probe (report-only): would a tap aimed EXACTLY at where the target fish was `lag` s ago hit it? Uses the world's own hit test
// (`_memberNear`: position now + 0.12 s ago, nearest centre wins) without pressing, so nothing changes. Fish swim un-hinted (samples
// are taken only while no hint glows). Prints per age × lag: hit %, → another fish %, → nothing %, and with an extra aim error.
//   node tests/sim/qa_lagprobe.js [--n 30] [--config '{…}']
'use strict';
const S = require('./lib');
const TL = S.TL;
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const N = +get('n', 30), config = JSON.parse(get('config', '{}'));
const LAGS = [0, 0.3, 0.45, 0.6], VPS = Object.keys(S.VIEWPORTS);
console.log('| age | lag s | samples | hit % (aim exact) | → other fish % | → nothing % | hit % (aim ± 0.5 r) | hit % (40–90 px off) |');
console.log('|---|---|---|---|---|---|---|---|');
for (const age of [3, 4, 5, 6, 7]) {
  const C = {}; LAGS.forEach(l => (C[l] = { n: 0, hit: 0, other: 0, none: 0, hitE: 0, hitO: 0 }));
  for (let i = 0; i < N; i++) {
    const w = S.mkWorld({ age, seed: 500 + 13 * i + age, vp: VPS[i % VPS.length], config }), r = new TL.RNG(i + 1), H = {};
    w.newSession();
    let t = 0, next = 0;
    while (t < 240 && w.state !== 'sessionDone') {
      w.update(1 / 30); t += 1 / 30; w.drainEvents();
      for (const m of w.members) { const a = H[m.id + ':' + w.level + ':' + w.round] || (H[m.id + ':' + w.level + ':' + w.round] = []); a.push({ t: w.time, x: m.x, y: m.y }); if (a.length > 40) a.shift(); }
      if (w.interactive && w.time >= next) {
        next = w.time + 0.5;
        const tg = w.target;
        if (tg && tg.state === 'swim' && !(tg._glowT > 0) && !w.hintHand && w.time - w._playT0 >= +get('after', 0)) {
          const a = H[tg.id + ':' + w.level + ':' + w.round], R = w._hitR(tg);
          for (const lag of LAGS) {
            const tt = w.time - lag; if (!a || a[0].t > tt) continue;
            let p = a[a.length - 1]; for (let k = a.length - 1; k > 0; k--) if (a[k - 1].t <= tt) { const u = (tt - a[k - 1].t) / Math.max(1e-6, a[k].t - a[k - 1].t); p = { x: a[k - 1].x + (a[k].x - a[k - 1].x) * u, y: a[k - 1].y + (a[k].y - a[k - 1].y) * u }; break; }
            const c = C[lag]; c.n++;
            const m = w._memberNear(p.x, p.y).m; if (m === tg) c.hit++; else if (m) c.other++; else c.none++;
            const e = w._memberNear(p.x + r.float(-0.5, 0.5) * R, p.y + r.float(-0.5, 0.5) * R * 0.7).m; if (e === tg) c.hitE++;
            const d = r.float(40, 90), an = r.float(0, 2 * Math.PI), o = w._memberNear(p.x + d * Math.cos(an), p.y + d * Math.sin(an)).m; if (o === tg) c.hitO++;
          }
        }
      }
      // keep the session moving: catch the target after ~6 s of play (an answered round), so all chapters / topics are sampled
      if (w.interactive && w.time - w._playT0 > 6) { const tg = w.target; if (tg && tg.state === 'swim') { w.pointerDown(tg.x, tg.y); w.pointerUp(tg.x, tg.y); } }
      if (w.state === 'talk' && w.talkOpen()) w.talkAnswer(w.talk.answer);
    }
  }
  const P = (a, b) => (100 * a / Math.max(1, b)).toFixed(1);
  for (const lag of LAGS) { const c = C[lag]; console.log(`| ${age} | ${lag} | ${c.n} | ${P(c.hit, c.n)} | ${P(c.other, c.n)} | ${P(c.none, c.n)} | ${P(c.hitE, c.n)} | ${P(c.hitO, c.n)} |`); }
}
