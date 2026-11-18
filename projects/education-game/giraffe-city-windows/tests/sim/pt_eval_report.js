#!/usr/bin/env node
// Tables for tests/sim/out/<name>.json written by pt_eval.js (stdout + tests/sim/out/<name>.md).
//   node tests/sim/pt_eval_report.js eval_base                 → full report
//   node tests/sim/pt_eval_report.js eval_base eval_x eval_y     → key-metric comparison of several runs (same drivers/ages)
'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, 'out');
const load = (n) => JSON.parse(fs.readFileSync(path.join(OUT, n + '.json'), 'utf8'));
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const pct = (a, p) => { if (!a.length) return NaN; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * (s.length - 1) + 0.5))]; };
const max = (a) => (a.length ? Math.max(...a) : NaN);
const f0 = (x) => (isFinite(x) ? Math.round(x).toString() : '–');
const f1 = (x) => (isFinite(x) ? x.toFixed(1) : '–');
const f2 = (x) => (isFinite(x) ? x.toFixed(2) : '–');
const fp = (x) => (isFinite(x) ? (100 * x).toFixed(0) + '%' : '–');
const tbl = (h, rows) => '| ' + h.join(' | ') + ' |\n|' + h.map(() => '---').join('|') + '|\n' + rows.map(r => '| ' + r.join(' | ') + ' |').join('\n') + '\n';
const flat = (a) => [].concat(...a);
const KIDS = ['typical', 'careful4', 'toddler', 'slow3', 'unfocused'];

function stats(S) {
  const done = S.filter(s => s.done), T = done.map(s => s.T);
  const R = flat(S.map(s => s.R.filter(r => r.dur != null))), C = flat(S.map(s => s.ch.filter(c => c.dur != null)));
  const mins = done.reduce((a, s) => a + s.T, 0) / 60;
  const maxStars = done.map(s => 3 * s.R.length + s.ch.length);
  return {
    n: S.length, done: done.length, err: S.filter(s => s.err).length,
    T: mean(T), T90: pct(T, 0.9), Tmax: max(T), C: mean(C.map(c => c.dur)), C10: pct(C.map(c => c.dur), 0.1), C90: pct(C.map(c => c.dur), 0.9),
    cut: C.filter(c => c.rounds < 4).length / Math.max(1, C.length),
    rd: mean(R.map(r => r.dur)), rd90: pct(R.map(r => r.dur), 0.9), rdMax: max(R.map(r => r.dur)), play: mean(R.filter(r => r.play != null).map(r => r.play)),
    over120: R.filter(r => r.dur > 120).length, over180: R.filter(r => r.dur > 180).length,
    mm: mean(R.map(r => r.mm)), mmMax: max(R.map(r => r.mm)),
    hintR: R.filter(r => r.hA + r.hI > 0).length / Math.max(1, R.length), autoR: R.filter(r => r.hA > 0).length / Math.max(1, R.length),
    idleR: R.filter(r => r.idl > 0).length / Math.max(1, R.length), idlePerMin: R.reduce((a, r) => a + r.idl, 0) / Math.max(1e-9, mins),
    hintPerMin: R.reduce((a, r) => a + r.hA + r.hI, 0) / Math.max(1e-9, mins),
    stars: mean(done.map(s => s.stars)), starFrac: mean(done.map((s, i) => s.stars / maxStars[i])),
    s3: R.filter(r => r.st === 3).length / Math.max(1, R.length), s2: R.filter(r => r.st === 2).length / Math.max(1, R.length), s1: R.filter(r => r.st === 1).length / Math.max(1, R.length),
    pre: mean(R.filter(r => r.pre != null).map(r => r.pre)), post: mean(R.filter(r => r.post != null && r.nk === 'scroll').map(r => r.post)),
    R, done_: done, mins
  };
}
const by = (S, f) => { const m = {}; for (const s of S) { const k = f(s); (m[k] = m[k] || []).push(s); } return m; };

function full(name) {
  const D = load(name), S = D.sessions;
  let md = `# pt_eval — ${name}\n\nconfig override: \`${JSON.stringify(D.config)}\` · ${S.length} sessions\n\n`;
  // 1. sessions per driver × age
  md += '## 1. Session / chapter / round by driver × age\n\n';
  const rows1 = [];
  const drivers = [...new Set(S.map(s => s.d))], ages = [...new Set(S.map(s => s.a))].sort();
  for (const d of drivers) for (const a of ages) {
    const X = S.filter(s => s.d === d && s.a === a); if (!X.length) continue; const st = stats(X);
    rows1.push([d, a, st.n, st.done + (st.err ? ' (' + st.err + ' err)' : ''), `${f0(st.T)} (${f0(st.T90)}, ${f0(st.Tmax)})`, `${f0(st.C)} (${f0(st.C10)}–${f0(st.C90)})`, fp(st.cut),
      `${f1(st.rd)} (${f0(st.rd90)}, ${f0(st.rdMax)})`, f1(st.play), st.over120 + '/' + st.over180, f2(st.mm), fp(st.hintR), fp(st.idleR), `${fp(st.s3)}/${fp(st.s2)}/${fp(st.s1)}`, fp(st.starFrac)]);
  }
  md += tbl(['driver', 'age', 'n', 'done', 'session s mean (p90, max)', 'chapter s mean (p10–p90)', 'chapters cut to 3', 'round s mean (p90, max)', 'play s', 'rounds >120/>180 s', 'mismatch/round', 'rounds w/ hint', 'rounds w/ idle nudge', 'stars 3/2/1', 'stars of max'], rows1);

  // 2. by topic (child models, ages 3–5)
  md += '\n## 2. Round time by topic and pairs (typical child)\n\n';
  const rows2 = [];
  for (const a of [3, 4, 5, 6, 7]) {
    const R = flat(S.filter(s => s.d === 'typical' && s.a === a).map(s => s.R.filter(r => r.dur != null)));
    const T = by(R, r => r.tp);
    for (const tp of Object.keys(T)) { const X = T[tp]; rows2.push([a, tp, X.length, f1(mean(X.map(r => r.p))), f1(mean(X.map(r => r.dur))), f0(pct(X.map(r => r.dur), 0.9)), f1(mean(X.filter(r => r.play != null).map(r => r.play))), f2(mean(X.map(r => r.mm))), fp(X.filter(r => r.hA + r.hI).length / X.length), fp(X.filter(r => r.st === 3).length / X.length)]); }
  }
  md += tbl(['age', 'topic', 'rounds', 'pairs', 'round s', 'p90', 'play s', 'mismatch', 'w/ hint', '3 stars'], rows2);
  // 2b. pairs → play time and overhead share (typical 4)
  const R4 = flat(S.filter(s => s.d === 'typical' && s.a === 4).map(s => s.R.filter(r => r.dur != null && r.play != null)));
  md += '\n### Overhead per round (typical, age 4): scroll+peek+hide before play, celebrate+cheer+roundDone after the last pair\n\n';
  const rows2b = [];
  for (const [p, X] of Object.entries(by(R4, r => r.p))) {
    const pre = mean(X.map(r => r.pre)), scr = mean(X.map(r => r.scr)), post = mean(X.filter(r => r.post != null).map(r => r.post)), play = mean(X.map(r => r.play));
    rows2b.push([p, X.length, f2(scr), f2(pre - scr), f2(post), f1(play), fp((pre + post) / (pre + post + play))]);
  }
  md += tbl(['pairs', 'rounds', 'scroll s', 'peek+hide s', 'post-solve s', 'play s', 'non-play share'], rows2b);

  // 3. hints
  md += '\n## 3. Help: hints and idle nudges (rounds of each model at its ages)\n\n';
  const own = (s) => s.d === 'typical' || (['careful4', 'unfocused'].includes(s.d) && s.a <= 5) || (['toddler', 'slow3'].includes(s.d) && s.a <= 4) || s.d.startsWith('bot');
  const rows3 = [];
  for (const d of drivers) {
    const X = S.filter(s => s.d === d && own(s)); if (!X.length) continue;
    const R = flat(X.map(s => s.R.filter(r => r.dur != null))), st = stats(X);
    const hinted = R.filter(r => r.hA + r.hI > 0), nh = R.reduce((a, r) => a + r.hA + r.hI, 0), fol = R.reduce((a, r) => a + r.hFol, 0);
    const delays = flat(R.map(r => r.hDelay));
    rows3.push([d, R.length, fp(st.autoR), fp(R.filter(r => r.hI > 0).length / R.length), f2(st.hintPerMin), fp(nh ? fol / nh : NaN), f1(mean(delays)), f1(mean(hinted.map(r => r.dur))), f1(mean(R.filter(r => !(r.hA + r.hI)).map(r => r.dur))),
      f2(st.idlePerMin), max(R.map(r => r.idl))]);
  }
  md += tbl(['driver', 'rounds', 'w/ auto hint', 'w/ idle hint', 'hints/min', 'hinted pair = next found', 'hint → pair found s', 'round s (hinted)', 'round s (no hint)', 'idle nudges/min', 'max nudges in a round'], rows3);

  // 4. critters
  md += '\n## 4. Surprise critters (surprise rounds only)\n\n';
  const rows4 = [];
  for (const d of drivers) {
    const R = flat(S.filter(s => s.d === d && own(s)).map(s => s.R.filter(r => r.sp)));
    for (const [tp, X] of Object.entries(by(R, r => r.sp))) {
      const tapped = X.filter(r => r.cr === 'tapped');
      rows4.push([d, tp, X.length, fp(X.filter(r => r.cr === 'none').length / X.length), fp(tapped.length / X.length), fp(X.filter(r => r.cr === 'ignored').length / X.length),
        f1(mean(tapped.map(r => r.crTap))), f1(mean(X.filter(r => r.crLife != null).map(r => r.crLife)))]);
    }
  }
  md += tbl(['driver', 'critter', 'rounds', 'never appeared', 'tapped', 'shown, not tapped', 'enter → tap s', 'on screen s'], rows4);

  // 5. speech-triggering events (as main.js maps them; before main's throttles)
  md += '\n## 5. Speech requests per minute of play (headless estimate from events; main.js throttles taps / mismatches)\n\n';
  const rows5 = [];
  for (const d of ['typical', 'careful4', 'toddler', 'bot0.6', 'bot0.9', 'spammer', 'tapper']) for (const a of [3, 4, 5]) {
    const X = S.filter(s => s.d === d && s.a === a && s.done); if (!X.length) continue;
    const R = flat(X.map(s => s.R)), mins = X.reduce((q, s) => q + s.T, 0) / 60;
    const tot = {}; for (const r of R) for (const k in r.v) tot[k] = (tot[k] || 0) + (k === 'tap' ? Math.min(r.v[k], 1e9) : r.v[k]);
    // + per chapter: the chapter + weather lines (2), Talk intro + answer line (2), + walk line per scroll (not the first)
    const chap = X.reduce((q, s) => q + s.ch.length, 0), walks = R.length - X.length;
    const all = Object.values(tot).reduce((a, b) => a + b, 0) + 4 * chap + walks;
    rows5.push([d, a, f1(all / mins), f1(all / R.length), f1((tot.flip || 0) / mins), f1((tot.match || 0) / mins), f1((tot.mis || 0) / mins), f1((tot.tap || 0) / mins), f2(((tot.idle || 0) + (tot.hint || 0)) / mins)]);
  }
  md += tbl(['driver', 'age', 'lines/min', 'lines/round', 'flip names/min', 'match lines/min', 'mismatch lines/min', 're-tap names/min', 'idle+hint lines/min'], rows5);

  // 6. content variety (all drivers: the content does not depend on the driver)
  md += '\n## 6. Content variety (consecutive rounds of a chapter; keys incl. the colour thing)\n\n';
  const rows6 = [];
  const allR = flat(S.filter(s => s.d === 'bot1' || s.d === 'typical').map(s => s.R.map(r => Object.assign({ a: s.a, sid: s.seed }, r))));
  const pairsOf = (r) => [...new Set(r.k.split(','))];
  for (const a of [3, 4, 5, 6, 7]) {
    const X = allR.filter(r => r.a === a);
    for (const [tp, Y] of Object.entries(by(X, r => r.tp))) {
      let pairs = 0, shared = 0, identical = 0, sameObj = 0, cons = 0, fullOverlap = 0;
      for (let i = 1; i < Y.length; i++) {
        const p = Y[i - 1], c = Y[i]; if (p.sid !== c.sid || p.l !== c.l) continue;
        cons++; const A = new Set(pairsOf(p).map(k => k.split('/')[0])), B = pairsOf(c).map(k => k.split('/')[0]);
        pairs += B.length; shared += B.filter(k => A.has(k)).length; if (p.k === c.k) identical++;
        if (B.every(k => A.has(k))) fullOverlap++;
        const oa = pairsOf(p)[0].split('/')[1], ob = pairsOf(c)[0].split('/')[1]; if (oa && oa === ob) sameObj++;
      }
      rows6.push([a, tp, cons, fp(shared / Math.max(1, pairs)), fp(fullOverlap / Math.max(1, cons)), identical, tp === 'colors' ? fp(sameObj / Math.max(1, cons)) : '']);
    }
  }
  md += tbl(['age', 'topic', 'consecutive round pairs', 'pairs repeated from the previous round', 'every pair repeated', 'identical rounds', 'same colour thing'], rows6);
  // homes spread
  const H = allR.filter(r => r.tp === 'homes'), cnt = {};
  for (const r of H) for (const k of pairsOf(r)) cnt[k] = (cnt[k] || 0) + 1;
  const totH = Object.values(cnt).reduce((a, b) => a + b, 0);
  md += '\nHomes pairs (share of all homes pairs dealt): ' + Object.entries(cnt).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k.slice(2)} ${fp(v / totH)}`).join(', ') + '\n';
  const perCh = Object.values(by(H, r => r.sid + ':' + r.l)).map(rs => new Set(flat(rs.map(pairsOf))).size);
  md += `Distinct animals per homes chapter: mean ${f1(mean(perCh))} (min ${Math.min(...perCh)}, max ${max(perCh)}) of 9.\n`;
  fs.writeFileSync(path.join(OUT, name + '.md'), md);
  return md;
}

function compare(names, filt) {
  const rows = [];
  for (const n of names) {
    const D = load(n), S = D.sessions;
    const groups = by(S.filter(s => !filt || filt(s)), s => s.d + ' ' + s.a);
    for (const [g, X] of Object.entries(groups)) {
      const st = stats(X);
      rows.push([n, g, X.length, `${f0(st.T)} (${f0(st.T90)}, ${f0(st.Tmax)})`, `${f0(st.C)} (${f0(st.C90)})`, fp(st.cut), f1(st.rd), f1(st.play), f2(st.mm), fp(st.hintR), f2(st.idlePerMin), fp(st.starFrac), st.over120]);
    }
  }
  return tbl(['run', 'driver age', 'n', 'session (p90, max)', 'chapter (p90)', 'cut to 3', 'round s', 'play s', 'mismatch', 'w/ hint', 'idle/min', 'stars of max', 'rounds >120 s'], rows.sort((a, b) => (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0)));
}

if (require.main === module) {
  const a = process.argv.slice(2);
  if (a.length === 1) console.log(full(a[0]));
  else { const md = compare(a); console.log(md); fs.writeFileSync(path.join(OUT, 'cmp_' + a.join('_vs_') + '.md'), md); }
}
module.exports = { load, stats, compare, full };
