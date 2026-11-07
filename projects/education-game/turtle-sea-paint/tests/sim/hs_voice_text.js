#!/usr/bin/env node
// Nini's Sea Painting — browser high-speed run (report-only): full sessions per age × EN / VI at ?speed=8&bot=1&autostart=1&mute=1
// capturing EVERY line Nini would say (SP.debug.voiceLog, uncapped) and checking the TEXT: unfilled {params}, "undefined" /
// "NaN" / "null", "màu màu", English words in VI lines, identical lines back to back, very long lines, lines per round.
// Then measures frame time at speed 1 on iPhone landscape (852×393 @3x) for --fps seconds.
//   node tests/sim/hs_voice_text.js [--ages 3,4,5,6,7] [--langs en,vi] [--sessions 2] [--fps 20]
// Output: tests/sim/out/voicetext.json + summary on stdout.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), LANGS = get('langs', 'en,vi').split(','), SESS = +get('sessions', 2), FPS = +get('fps', 20);
const EN_IN_VI = /\b(the|paint|tap|shell|yes|great|turtle|good|look|bye|full|try|wants|into|each|shape|colou?r|blue|red|green|yellow|pink|purple|orange|fish|crab|star|circle|square|triangle|heart|wow|okay|ok|hello|hi)\b/i;

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < SESS; s++) {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(() => { window.__vl = []; });
    const seed = 300 + s * 17 + age * 5 + (lang === 'vi' ? 1 : 0), t0 = Date.now();
    await page.goto(`${srv.url}?speed=8&bot=1&mute=1&age=${age}&seed=${seed}&lang=${lang}`);
    await page.waitForFunction(() => window.SP && SP.debug && SP.debug.mode === 'title', null, { timeout: 30000 });
    await page.evaluate(() => {
      SP.debug.voiceLog = window.__vl;
      const w = SP.debug.world, emit = w._emit.bind(w);
      window.__ev = [];
      w._emit = e => { window.__ev.push({ type: e.type, t: w.time, mode: e.mode, round: e.round, level: e.level }); return emit(e); };
      SP.debug.startGame();
    });
    let ok = true;
    try { await page.waitForFunction(() => SP.debug.mode === 'done', null, { timeout: 300000, polling: 500 }); } catch (e) { ok = false; }
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ vl: window.__vl.map(x => ({ t: x.t, text: x.text, lang: x.lang })), ev: window.__ev }));
    r.age = age; r.lang = lang; r.ok = ok; r.errors = errors.slice(0, 5); r.wall = (Date.now() - t0) / 1000;
    res.push(r);
    console.error(JSON.stringify({ age, lang, ok, lines: r.vl.length, errors: errors.length, wall: r.wall }));
    await ctx.close();
  }
  // ---- text analysis
  const rows = [], issues = [], longest = [];
  const agg = {};
  for (const r of res) {
    const k = r.age + ' ' + r.lang, A = agg[k] = agg[k] || { n: 0, lines: 0, rounds: 0, braces: 0, undef: 0, mauMau: 0, enInVi: 0, back: 0, long: 0, maxLen: 0, ok: 0, errors: 0, uniq: new Set() };
    A.n++; A.ok += r.ok ? 1 : 0; A.errors += r.errors.length;
    A.lines += r.vl.length; A.rounds += r.ev.filter(e => e.type === 'roundDone').length;
    r.vl.forEach((l, i) => {
      const t = String(l.text || '');
      A.uniq.add(t);
      if (/[{}]/.test(t)) { A.braces++; issues.push(`${k} BRACES: ${t}`); }
      if (/undefined|NaN|\bnull\b/.test(t)) { A.undef++; issues.push(`${k} UNDEF: ${t}`); }
      if (/màu\s+màu/i.test(t)) { A.mauMau++; issues.push(`${k} MAU MAU: ${t}`); }
      if (r.lang === 'vi' && EN_IN_VI.test(t.replace(/Nini/g, '').replace(/\bhi hi\b/gi, ''))) { A.enInVi++; issues.push(`${k} EN-IN-VI: ${t}`); }
      if (i && r.vl[i - 1].text === t) { A.back++; issues.push(`${k} BACK-TO-BACK: ${t}`); }
      if (t.length > 90) { A.long++; longest.push(`${k} (${t.length}): ${t}`); }
      A.maxLen = Math.max(A.maxLen, t.length);
    });
  }
  rows.push('| age lang | sessions ok | lines / round | distinct lines | "{…}" | undefined/NaN | "màu màu" | EN words in VI | identical back-to-back | > 90 chars (max) | page errors |', '|---|---|---|---|---|---|---|---|---|---|---|');
  for (const [k, A] of Object.entries(agg)) rows.push(`| ${k} | ${A.ok}/${A.n} | ${(A.lines / Math.max(1, A.rounds)).toFixed(1)} | ${A.uniq.size} | ${A.braces} | ${A.undef} | ${A.mauMau} | ${A.enInVi} | ${A.back} | ${A.long} (${A.maxLen}) | ${A.errors} |`);
  const cnt = {}; for (const x of issues) { const key = x.replace(/^\d \w+ /, ''); cnt[key] = (cnt[key] || 0) + 1; }
  const topIssues = Object.entries(cnt).sort((a, b) => b[1] - a[1]).slice(0, 25).map(([t, n]) => `${n}× ${t}`);
  const lc = {}; for (const x of longest) { const key = x.replace(/^\d \w+ /, ''); lc[key] = (lc[key] || 0) + 1; }
  const topLong = Object.entries(lc).sort((a, b) => b[0].length - a[0].length).slice(0, 10).map(([t, n]) => `${n}× ${t}`);

  // ---- frame time at speed 1, iPhone landscape
  let perf = null;
  if (FPS > 0) {
    const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.goto(`${srv.url}?speed=1&bot=1&mute=1&age=4&seed=77&lang=en`);
    await page.waitForFunction(() => window.SP && SP.debug && SP.debug.mode === 'title', null, { timeout: 30000 });
    await page.evaluate(() => SP.debug.startGame());
    await page.waitForTimeout(3000);
    perf = await page.evaluate(sec => new Promise(res => {
      const d = []; let last = performance.now(); const end = last + sec * 1000;
      const s0 = Object.assign({}, SP.debug.stats);
      const R = SP.render, dr = R.draw.bind(R), js = []; R.draw = function () { const a = performance.now(); const v = dr.apply(null, arguments); js.push(performance.now() - a); return v; };
      function f(t) { d.push(t - last); last = t; if (t < end) requestAnimationFrame(f); else {
        const s = d.slice().sort((a, b) => a - b), q = p => s[Math.min(s.length - 1, Math.floor(p * s.length))];
        const cv = document.querySelector('canvas');
        res({ frames: d.length, fps: d.length / sec, mean: d.reduce((a, b) => a + b, 0) / d.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: s[s.length - 1],
          over22: d.filter(x => x > 22).length, drawMean: js.reduce((a, b) => a + b, 0) / Math.max(1, js.length), drawP95: js.slice().sort((a, b) => a - b)[Math.floor(0.95 * js.length)], over33: d.filter(x => x > 33).length, slowFramesGame: SP.debug.stats.slowFrames - s0.slowFrames,
          backing: cv ? cv.width + 'x' + cv.height : '', state: SP.debug.getState().state }); } }
      requestAnimationFrame(f);
    }), FPS);
    await ctx.close();
  }
  await browser.close(); srv.close();
  const out = [rows.join('\n'), '', 'Issues (top):', ...topIssues, '', 'Longest lines:', ...topLong, '', 'Frame time iPhone landscape @3x speed 1: ' + JSON.stringify(perf)].join('\n');
  console.log(out);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'voicetext.json'), JSON.stringify({ res: res.map(r => ({ age: r.age, lang: r.lang, ok: r.ok, errors: r.errors, vl: r.vl })), perf }, null, 0));
  fs.writeFileSync(path.join(__dirname, 'out', 'voicetext.md'), out + '\n');
  process.exit(0);
})();
