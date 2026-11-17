#!/usr/bin/env node
// Tibo's Dino Lake Fishing — QA browser playtest (report-only). Playwright chromium, iPhone / iPad touch contexts.
//   1) ?speed=8&bot=1&autostart=1&mute=1 for every age 3–7 (EN, and VI for ages 4 / 6): the whole session must reach the done screen
//      with zero console errors / page errors / HTTP ≥ 400; prints TL.debug.stats.
//   2) 1× frame-time sanity: ?bot=1&autostart=1&mute=1 at speed 1 for 25 s on iPhone landscape + iPad portrait; rAF intervals
//      (p50 / p95 / max, % > 20 ms / > 33 ms) and the time spent inside render.draw per frame.
//   node tests/sim/qa_browser.js            → JSON lines on stdout; exit 1 on errors
'use strict';
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const DEV = {
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  let fails = 0;
  const open = async d => {
    const ctx = await browser.newContext({ viewport: DEV[d].viewport, deviceScaleFactor: DEV[d].dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
    return { ctx, page, errors };
  };
  const runs = [[3, 'en', 'iphoneL'], [4, 'en', 'iphoneP'], [4, 'vi', 'ipadL'], [5, 'en', 'ipadP'], [6, 'vi', 'iphoneL'], [7, 'en', 'ipadL']];
  for (const [age, lang, d] of runs) {
    const { ctx, page, errors } = await open(d);
    const t0 = Date.now();
    let res = null;
    try {
      await page.goto(srv.url + `?mute=1&seed=${20 + age}&age=${age}&lang=${lang}&speed=8&bot=1&autostart=1`);
      await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'done', null, { timeout: 420000, polling: 500 });
      res = await page.evaluate(() => Object.assign({}, TL.debug.stats, { stars: TL.debug.world.stars, simMin: TL.debug.world.time / 60 }));
    } catch (e) { errors.push('did not finish: ' + (e && e.message)); }
    if (errors.length) fails++;
    console.log(JSON.stringify({ kind: 'speed8', age, lang, device: d, wallS: Math.round((Date.now() - t0) / 1000), errors: errors.slice(0, 5), stats: res }));
    await ctx.close();
  }
  for (const d of ['iphoneL', 'ipadP']) {
    const { ctx, page, errors } = await open(d);
    try {
      await page.goto(srv.url + '?mute=1&seed=5&age=4&bot=1&autostart=1');
      await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'play', null, { timeout: 20000 });
      await page.evaluate(() => {
        const R = TL.debug.render(), draw = R.draw.bind(R);
        window.__ft = { iv: [], dr: [], last: 0 };
        R.draw = function () { const t = performance.now(); const r = draw.apply(null, arguments); window.__ft.dr.push(performance.now() - t); return r; };
        const loop = ts => { const F = window.__ft; if (F.last) F.iv.push(ts - F.last); F.last = ts; requestAnimationFrame(loop); };
        requestAnimationFrame(loop);
      });
      await page.waitForTimeout(25000);
      const r = await page.evaluate(() => {
        const q = (a, p) => { const s = a.slice().sort((x, y) => x - y); return +(s[Math.min(s.length - 1, Math.floor(p * s.length))] || 0).toFixed(1); };
        const F = window.__ft, iv = F.iv.slice(5), dr = F.dr.slice(5);
        return { frames: iv.length, ivP50: q(iv, 0.5), ivP95: q(iv, 0.95), ivMax: q(iv, 1), over20: +(100 * iv.filter(x => x > 20).length / iv.length).toFixed(1),
          over33: +(100 * iv.filter(x => x > 33.4).length / iv.length).toFixed(1), drawP50: q(dr, 0.5), drawP95: q(dr, 0.95), drawMax: q(dr, 1),
          quality: TL.debug.render().quality, slowFrames: TL.debug.stats.slowFrames, mode: TL.debug.mode, phase: TL.debug.world.phase };
      });
      console.log(JSON.stringify({ kind: 'frame1x', device: d, errors: errors.slice(0, 5), r }));
    } catch (e) { errors.push(String(e && e.message)); console.log(JSON.stringify({ kind: 'frame1x', device: d, errors })); }
    if (errors.length) fails++;
    await ctx.close();
  }
  await browser.close(); srv.close();
  process.exit(fails ? 1 : 0);
})();
