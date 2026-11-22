#!/usr/bin/env node
// Nim's River Hop — playtester's real-browser run (report-only): ?speed=8&bot=1&autostart=1&mute=1 on 3 device shapes.
// Measures the world clock vs wall clock, the frame rate, page errors, event cadence and Nim's voice log (log-only at speed 8);
// freezes the game (setSpeed 0.1) at a few moments (mid-hop, fruit sticking, wipe, Talk) for screenshots.
//   node tests/sim/pt_browser.js [--sessions 3]   → tests/sim/out/pt_browser.json + docs/reports/pt_*.png (screenshots)
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SESS = +get('sessions', 3);
const RUNS = [
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2, age: 3, lang: 'en' },
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, age: 4, lang: 'vi' },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, age: 6, lang: 'en' }
].slice(0, SESS);
const SHOTS = path.join(__dirname, '..', '..', 'docs', 'reports');

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  for (const R of RUNS) {
    const ctx = await browser.newContext({ viewport: R.viewport, deviceScaleFactor: R.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(`${srv.url}?speed=8&bot=1&autostart=1&mute=1&age=${R.age}&lang=${R.lang}&seed=${31 + R.age}`);
    await page.waitForFunction(() => window.DK && DK.debug && DK.debug.world && DK.debug.mode === 'play', null, { timeout: 20000 });
    // hook the world's events: record them, and freeze the game at the moments we want to look at
    await page.evaluate(() => {
      const w = DK.debug.world, emit = w._emit.bind(w);
      window.__ev = []; window.__freeze = null; const want = { hop: 1, stick: 1, wipe: 1, talk: 1 }, seen = {};
      w._emit = e => {
        window.__ev.push({ type: e.type, t: w.time, wall: performance.now() });
        if (want[e.type] && !seen[e.type] && w.level >= (e.type === 'talk' ? 0 : 1)) {
          seen[e.type] = 1; DK.debug.setSpeed(0.05); window.__freeze = { type: e.type, t: w.time, delay: e.type === 'hop' ? 0.3 : e.type === 'wipe' ? 0.55 : 0.2 };
        }
        return emit(e);
      };
    });
    const shots = [];
    const deadline = Date.now() + 240000;
    while (Date.now() < deadline) {
      const st = await page.evaluate(() => ({ mode: DK.debug.mode, fr: window.__freeze, t: DK.debug.world.time }));
      if (st.mode === 'done') break;
      if (st.fr) {
        // let the frozen game crawl to the interesting instant (speed 0.05 = 20× slower than real time) and shoot
        await page.evaluate(fr => { DK.debug.setSpeed(1); return new Promise(r => { const w = DK.debug.world; const go = () => (w.time >= fr.t + fr.delay ? (DK.debug.setSpeed(0.0001), r()) : requestAnimationFrame(go)); go(); }); }, st.fr);
        await page.waitForTimeout(150);
        const f = `pt_${R.name}_${st.fr.type}.png`;
        await page.screenshot({ path: path.join(SHOTS, f) }); shots.push(f);
        await page.evaluate(() => { window.__freeze = null; DK.debug.setSpeed(8); });
      }
      await page.waitForTimeout(200);
    }
    const r = await page.evaluate(() => {
      const ev = window.__ev, w = DK.debug.world, s = DK.debug.stats, by = t => ev.filter(e => e.type === t);
      const rights = by('right').map(e => e.t), gaps = rights.slice(1).map((t, i) => t - rights[i]).filter(g => g < 30);
      const ch = []; let c0 = 0; for (const e of ev) { if (e.type === 'level') c0 = e.t; if (e.type === 'levelDone') ch.push(+(e.t - c0).toFixed(1)); }
      const vl = (DK.debug.voiceLog || []).map(l => l.text);
      return { mode: DK.debug.mode, session: +w.time.toFixed(1), chapters: ch, rounds: by('roundDone').length, rights: rights.length, wrong: by('wrong').length, hints: by('hint').length,
        hopGap: gaps.length ? +(gaps.reduce((a, b) => a + b, 0) / gaps.length).toFixed(2) : 0, stars: w.stars, frames: s.frames, slowFrames: s.slowFrames,
        voiceLines: vl.length, voiceSample: vl.slice(0, 14), longest: vl.reduce((a, b) => (b.length > a.length ? b : a), '') };
    });
    Object.assign(r, { run: R.name, age: R.age, lang: R.lang, wall: +((Date.now() - t0) / 1000).toFixed(1), errors: errors.slice(0, 5), shots });
    r.simPerWall = +(r.session / r.wall).toFixed(2);
    res.push(r); console.log(JSON.stringify(r));
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'pt_browser.json'), JSON.stringify(res, null, 1));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
