#!/usr/bin/env node
// Koko's Cake Tower — the REAL game in Playwright at high speed (?speed=8&bot=1&mute=1), sessions per age; compares the
// world's own clock (sim seconds) with the headless numbers.   node tests/sim/hs_browser.js [--sessions 2] [--ages 3,4,5,6,7]
// Needs playwright (NODE_PATH=$(npm root -g) if it is installed globally). Writes tests/sim/out/hs_browser.json.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const SESS = +get('sessions', 2), AGES = get('ages', '3,4,5,6,7').split(',').map(Number), SPEED = +get('speed', 8);
const ALLVP = [{ name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }, { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 }];
const VPS = get('vp', '') ? ALLVP.filter(v => get('vp').split(',').includes(v.name)) : ALLVP.slice(0, 2);   // --vp iphone-portrait

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  for (const age of AGES) for (let s = 0; s < SESS; s++) {
    const vp = VPS[s % VPS.length];
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now();
    await page.goto(`${srv.url}?speed=${SPEED}&bot=1&mute=1&age=${age}&seed=${11 + s * 7 + age}&lang=${s % 2 ? 'vi' : 'en'}`);
    await page.waitForFunction(() => window.CK && CK.debug && CK.debug.mode === 'title', null, { timeout: 20000 });
    await page.evaluate(() => {
      const w = CK.debug.world, emit = w._emit.bind(w);
      window.__ev = [];
      w._emit = e => { window.__ev.push({ type: e.type, t: w.time, stars: e.stars, surprise: e.surprise }); return emit(e); };
      CK.debug.startGame();
    });
    let ok = true;
    try { await page.waitForFunction(() => CK.debug.mode === 'done', null, { timeout: 240000, polling: 500 }); } catch (e) { ok = false; }
    const r = await page.evaluate(() => {
      const ev = window.__ev, ch = [], rd = []; let c0 = 0, r0 = 0, nr = 0, cuts = 0;
      for (const e of ev) {
        if (e.type === 'level') { c0 = e.t; nr = 0; }
        if (e.type === 'round') r0 = e.t;
        if (e.type === 'roundDone') { rd.push({ dur: e.t - r0, stars: e.stars }); nr++; }
        if (e.type === 'levelDone') { ch.push(e.t - c0); if (nr < 4) cuts++; }
      }
      const s = CK.debug.stats;
      return { session: CK.debug.world.time, chapters: ch, cuts, rounds: rd.length, stars: CK.debug.world.stars, wrong: ev.filter(e => e.type === 'wrong').length,
        stacks: ev.filter(e => e.type === 'stack').length, hints: ev.filter(e => e.type === 'hint').length, slowFrames: s.slowFrames, frames: s.frames };
    });
    r.age = age; r.vp = vp.name; r.ok = ok; r.errors = errors.slice(0, 3); r.wall = (Date.now() - t0) / 1000;
    res.push(r); console.log(JSON.stringify(r));
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'hs_browser.json'), JSON.stringify(res, null, 1));
  process.exit(0);
})();
