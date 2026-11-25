#!/usr/bin/env node
// Tumi's Flower Farm — the REAL page at ?speed=8&bot=1&autostart=1&autorestart=1 in iPhone portrait / landscape and iPad
// landscape / portrait, per age; plays until N sessions finished (autorestart). Checks console / page errors, the voice log
// (FT.debug.voiceLog: "{" / undefined, English words in VI mode, back-to-back repeats), chapter rotation between sessions,
// frame stats.   NODE_PATH=$(npm root -g) node tests/sim/hs_browser_vp.js [--ages 3,4,5,6,7] [--sessions 2] [--vp a,b]
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), SESS = +get('sessions', 2), SPEED = +get('speed', 8), SKILL = get('skill', '');
const ALL = [{ name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 }, { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }, { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 }];
const VPS = get('vp', '') ? ALL.filter(v => get('vp').split(',').includes(v.name)) : ALL;
const EN = /\b(the|plant|water|seed|carrots?|flowers?|garden|tap|dots|yes|great|turtle|good|look|bye|full|try|wants|into|each|shape|colou?r|count|home|well|done)\b/i;

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  let k = 0;
  for (const age of AGES) for (const vp of VPS) {
    const lang = (k++) % 2 ? 'vi' : 'en';
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    const warns = [];   // headless Chromium blocks the AudioContext until a user gesture: expected, not a game warning
    page.on('console', m => { if (m.type() === 'error') errors.push('error: ' + m.text()); else if (m.type() === 'warning' && !/AudioContext was not allowed/.test(m.text())) warns.push(m.text()); });
    const t0 = Date.now();
    await page.goto(`${srv.url}?speed=${SPEED}&bot=1&autostart=1&autorestart=1&mute=1&age=${age}&seed=${31 + k * 7}&lang=${lang}${SKILL ? '&skill=' + SKILL : ''}`);
    await page.waitForFunction(() => window.FT && FT.debug && FT.debug.world && FT.debug.mode === 'play', null, { timeout: 30000 });
    await page.evaluate(() => {
      const w = FT.debug.world, emit = w._emit.bind(w);
      window.__ev = []; window.__sess = []; window.__ft = [];
      let lt = 0; const tick = t => { if (lt) window.__ft.push(t - lt); lt = t; requestAnimationFrame(tick); }; requestAnimationFrame(tick);
      w._emit = e => {
        window.__ev.push({ type: e.type, t: w.time, stars: e.stars, auto: e.auto });
        if (e.type === 'session') window.__sess.push(e.levels.slice());
        return emit(e);
      };
      // the session already started before the hook: record its topics too
      window.__sess.push(w.levels.slice());
    });
    let ok = true;
    try { await page.waitForFunction(n => (window.__ev.filter(e => e.type === 'sessionDone').length >= n), SESS, { timeout: 120000 * SESS, polling: 500 }); } catch (e) { ok = false; }
    const r = await page.evaluate(() => {
      const ev = window.__ev, log = (FT.debug.voiceLog || []).map(x => x.text), s = FT.debug.stats;
      let rep = 0; const reps = [];
      for (let i = 1; i < log.length; i++) if (log[i] === log[i - 1]) { rep++; reps.push(log[i]); }
      const g = FT.debug.getState();
      const ft = window.__ft.slice(10).sort((a, b) => a - b), q = p => ft.length ? +ft[Math.min(ft.length - 1, Math.floor(p * ft.length))].toFixed(1) : 0;
      const W = FT.debug.world, finite = [W.bag.x, W.bag.y, W.stars].every(Number.isFinite);
      return { sessions: window.__sess, done: ev.filter(e => e.type === 'sessionDone').length, rounds: ev.filter(e => e.type === 'roundDone').length,
        traces: ev.filter(e => e.type === 'traceDone').length, hints: ev.filter(e => e.type === 'hint').length, wrong: ev.filter(e => e.type === 'wrong').length,
        lines: log.length, braces: log.filter(l => /[{}]|undefined|NaN|null/.test(l)), rep, reps: reps.slice(0, 6), log, frames: s.frames, slowFrames: s.slowFrames, ftP50: q(0.5), ftP95: q(0.95), ftMax: q(1), missing: (FT.Assets && FT.Assets.missing || []).slice(), finite,
        talkAuto: ev.filter(e => e.type === 'talkResult' && e.auto).length, simMin: +(W.time / 60).toFixed(2), W: g.W, H: g.H, ins: g.ins };
    });
    r.enInVi = lang === 'vi' ? r.log.filter(l => EN.test(l.replace(/Mochi|OK/g, ''))) : [];
    r.age = age; r.vp = vp.name; r.lang = lang; r.ok = ok; r.errors = errors.slice(0, 8); r.warnings = warns.slice(0, 4); r.wall = (Date.now() - t0) / 1000;
    const brief = Object.assign({}, r); delete brief.log;
    console.log(JSON.stringify(brief));
    res.push(r);
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'hs_browser_vp.json'), JSON.stringify(res, null, 1));
  process.exit(0);
})();
