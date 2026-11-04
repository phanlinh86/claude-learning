#!/usr/bin/env node
// Lulu's Jungle Tower — the REAL page at high speed with the bot, 2 back-to-back sessions per page (autorestart = "Play
// again"), recording console errors, world events and every voice line (JT.Voice.say, logged even when muted) stamped with
// the WORLD clock.   NODE_PATH=$(npm root -g) node tests/sim/hs_browser_voice.js [--ages 3,4,5,6,7] [--speed 8] [--plays 2]
// Checks: errors, every ask has its prompt line, line rates per world minute, the same line again < 8 s, bursts, lines that
// would start while the previous one is still being spoken (duration model 12 / 14 chars/s), topic rotation on Play again.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), SPEED = +get('speed', 8), PLAYS = +get('plays', 2);
const VPS = [{ name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }, { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 }];

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  let k = 0;
  for (const age of AGES) for (const lang of ['en', 'vi']) {
    const vp = VPS[k++ % VPS.length];
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    const t0 = Date.now();
    await page.goto(`${srv.url}?speed=${SPEED}&bot=1&mute=1&autorestart=1&age=${age}&seed=${101 + age * 13 + (lang === 'vi' ? 5 : 0)}&lang=${lang}`);
    await page.waitForFunction(() => window.JT && JT.debug && JT.debug.mode === 'title', null, { timeout: 20000 });
    await page.evaluate(() => {
      const w = JT.debug.world, emit = w._emit.bind(w), say = JT.Voice.say.bind(JT.Voice);
      window.__ev = []; window.__v = []; window.__ses = 0;
      w._emit = e => { window.__ev.push({ type: e.type, t: w.time, s: window.__ses, topic: e.topic, levels: e.levels, stars: e.stars, n: e.n, promptKey: e.promptKey }); if (e.type === 'session') window.__ses++; return emit(e); };
      JT.Voice.say = (text, o) => { window.__v.push({ t: w.time, s: window.__ses, text: String(text), i: !!(o && o.interrupt), p: !!(o && o.priority) }); return say(text, o); };
      JT.debug.startGame();
    });
    let ok = true;
    try { await page.waitForFunction(n => window.__ev.filter(e => e.type === 'sessionDone').length >= n, PLAYS, { timeout: 120000 * PLAYS, polling: 500 }); } catch (e) { ok = false; }
    await page.waitForTimeout(400);
    const data = await page.evaluate(() => ({ ev: window.__ev, v: window.__v, stats: JT.debug.stats, mode: JT.debug.mode }));
    await ctx.close();
    // ---- analysis (world seconds)
    const ev = data.ev, V = data.v, cps = lang === 'vi' ? 14 : 12, dur = t => 0.25 + t.length / cps;
    const sessions = ev.filter(e => e.type === 'session').map(e => e.levels);
    const asks = ev.filter(e => e.type === 'ask');
    const noPrompt = asks.filter(a => !V.some(v => Math.abs(v.t - a.t) < 0.05 && v.p)).length;
    const span = (ev.length ? ev[ev.length - 1].t - ev[0].t : 1) / 60;
    let rep8 = 0, burst = 0, overlap = 0, cutPrompt = 0;
    for (let i = 0; i < V.length; i++) {
      for (let j = i - 1; j >= 0 && V[i].t - V[j].t < 8; j--) if (V[j].text === V[i].text) { rep8++; break; }
      let m = i; while (m < V.length && V[m].t - V[i].t < 10) m++; burst = Math.max(burst, m - i);
      if (i && V[i].t < V[i - 1].t + dur(V[i - 1].text)) { overlap++; if (V[i].i && V[i - 1].p) cutPrompt++; }
    }
    const count = {}; for (const v of V) count[v.text] = (count[v.text] || 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, c]) => `${c}× "${t.slice(0, 40)}"`);
    const r = { age, lang, vp: vp.name, ok, wall: +((Date.now() - t0) / 1000).toFixed(0), errors: errors.slice(0, 5), nErrors: errors.length,
      sessions: sessions.map(s => s && s.join(',')), sessionTimes: ev.filter(e => e.type === 'sessionDone').map(e => +e.t.toFixed(0)),
      stars: ev.filter(e => e.type === 'sessionDone').map(e => e.stars), asks: asks.length, noPrompt, lines: V.length, perMin: +(V.length / span).toFixed(1),
      interrupts: V.filter(v => v.i).length, rep8, maxIn10s: burst, startsWhileSpeaking: +(100 * overlap / Math.max(1, V.length)).toFixed(0),
      interruptsOverPrompt: cutPrompt, top, slowFrames: data.stats.slowFrames, frames: data.stats.frames };
    res.push(r); console.log(JSON.stringify(r));
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'hs_browser_voice.json'), JSON.stringify(res, null, 1));
  process.exit(0);
})();
