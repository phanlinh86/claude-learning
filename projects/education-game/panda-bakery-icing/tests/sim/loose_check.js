#!/usr/bin/env node
// Playtester check (report-only): how LOOSE is the tracker? For every generated trace path (ages 3–7, all topics) a "lazy"
// finger is run through IB.Trace.track at that age's tolerance (picture px):
//   straight — one straight swipe from each stroke's start to its end (ignores waves / zigzags / curves)
//   smooth60 — the path smoothed over ±60 px of arc (cuts every corner hard)
//   offset   — the true path shifted sideways by k·tol (k = 0.8, 1.0, 1.2): a finger that runs parallel to the dots
// Reports the share of paths that complete and the mean progress.   node tests/sim/loose_check.js [chapters=60] [--tol '{"3":66,…}']
'use strict';
const L = require('./lib'), IB = L.IB, C = IB.Content, T = IB.Trace;
const args = process.argv.slice(2), N = +(args.find(a => /^\d+$/.test(a)) || 60), ti = args.indexOf('--tol');
const TOL = ti >= 0 ? JSON.parse(args[ti + 1]) : IB.CONFIG.tol;
function resample(pts, step) { const o = [pts[0]]; for (let i = 1; i < pts.length; i++) { const a = o[o.length - 1], b = pts[i], d = Math.hypot(b[0] - a[0], b[1] - a[1]); const n = Math.ceil(d / step); for (let k = 1; k <= n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]); } return o; }
function smooth(P, S) { const k = Math.round(S / 4), n = P.length; return P.map((_, i) => { const h = Math.min(k, i, n - 1 - i); let x = 0, y = 0; for (let j = i - h; j <= i + h; j++) { x += P[j][0]; y += P[j][1]; } return [x / (2 * h + 1), y / (2 * h + 1)]; }); }
function offset(P, d) { return P.map((p, i) => { const a = P[Math.max(0, i - 2)], b = P[Math.min(P.length - 1, i + 2)], dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1; return [p[0] - dy / l * d, p[1] + dx / l * d]; }); }
function run(path, strokesPts, tol) {
  let st = T.start();
  for (const pts of strokesPts) { T.lift(st); for (const q of pts) T.track(path, st, q[0], q[1], tol, 90); }
  return st.complete ? 1 : st.total;
}
const agg = {};
for (const age of [3, 4, 5, 6, 7]) for (const topic of C.TOPICS) {
  for (let c = 0; c < N; c++) {
    const rng = new IB.RNG(777 + c * 31 + age); let prev = null;
    for (let ri = 0; ri < 4; ri++) {
      let r; try { r = C.makeRound(topic, { age, lang: 'en', rng, roundIndex: ri, prev }); } catch (e) { break; }
      prev = r.answers;
      for (const s of r.steps.filter(s => s.mode === 'trace')) {
        const p = T.path(s.path), tol = TOL[age] || TOL[4], kind = p.kind === 'glyph' ? (/[0-9]/.test(String(s.nameValue)) ? 'number' : 'letter') : p.kind === 'stroke' ? 'stroke:' + (s.path.id || s.nameValue) : p.kind;
        const tests = {
          straight: p.strokes.every(x => !x.closed) ? run(p, p.strokes.map(x => resample([x.pts[0], x.pts[x.pts.length - 1]], 4)), tol) : null,
          smooth60: run(p, p.strokes.map(x => smooth(x.pts, 60)), tol),
          off08: run(p, p.strokes.map(x => offset(x.pts, 0.8 * tol)), tol), off10: run(p, p.strokes.map(x => offset(x.pts, 1.0 * tol)), tol), off12: run(p, p.strokes.map(x => offset(x.pts, 1.2 * tol)), tol)
        };
        const k = age + '|' + kind, A = agg[k] = agg[k] || { n: 0 };
        A.n++;
        for (const [t, v] of Object.entries(tests)) if (v !== null) { A[t] = A[t] || { done: 0, sum: 0, n: 0 }; A[t].n++; A[t].sum += v; if (v >= 1) A[t].done++; }
      }
    }
  }
}
const f = x => x ? `${(x.done / x.n * 100).toFixed(0)} % (${(x.sum / x.n * 100).toFixed(0)})` : '–';
const out = ['| age | trace | n | straight swipe completes % (mean progress %) | smoothed ±60 px | parallel at 0.8 tol | 1.0 tol | 1.2 tol |', '|---|---|---|---|---|---|---|---|'];
for (const [k, A] of Object.entries(agg).sort()) { const [age, kind] = k.split('|'); out.push(`| ${age} | ${kind} | ${A.n} | ${f(A.straight)} | ${f(A.smooth60)} | ${f(A.off08)} | ${f(A.off10)} | ${f(A.off12)} |`); }
console.log(`tol ${JSON.stringify(TOL)}\n` + out.join('\n'));
