#!/usr/bin/env node
// Independent real-browser check (report-only).
//  A. ?bot=1&autostart=1&speed=8&mute=1&age=A (autorestart) for ages 3, 4, 5 on an iPad-landscape-like context: every world
//     event is recorded with world.time (session / chapter / round durations in GAME seconds), console errors, fps.
//  B. Voice pacing at speed 1, bot skill 0.7, ≈ 2 min per language: a fake speechSynthesis (installed before the page
//     scripts) "speaks" each utterance for 350 ms + chars / 11.7 per s (≈ a rate-0.9 TTS voice) so voice.js's real queue,
//     interrupt, drop and stale rules run; every GW.Voice.say is logged with its outcome.
//  K. as B with the bot slowed to a child's rhythm.
//   node tests/sim/pt_eval_browser.js [A|B|K] [--secs 130]   → tests/sim/out/eval_browser.json (+ console summary)
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const args = process.argv.slice(2), want = (args[0] && !args[0].startsWith('--')) ? args[0] : 'ABK';
const secs = +(args.includes('--secs') ? args[args.indexOf('--secs') + 1] : 130);
const OUTF = path.join(__dirname, 'out', 'eval_browser.json');
const res = fs.existsSync(OUTF) ? JSON.parse(fs.readFileSync(OUTF, 'utf8')) : {};

const RECORDER = () => {
  const iv = setInterval(() => {
    const w = window.GW && GW.debug && GW.debug.world; if (!w || w.__rec) return;
    w.__rec = []; const dr = w.drainEvents.bind(w);
    w.drainEvents = function () { const ev = dr(); for (const e of ev) if (e.type !== 'walk' && e.type !== 'clack' && e.type !== 'bloom') w.__rec.push({ type: e.type, t: +w.time.toFixed(2), pt: Math.round(performance.now()), round: e.round, stars: e.stars, topic: e.topic, critter: e.critter, action: e.action, found: e.found, pairs: e.pairs }); return ev; };
    clearInterval(iv);
  }, 5);
};

const FAKE_TTS = () => {
  const log = window.__tts = { spoken: [], speaking: 0, busyMs: 0 };
  let cur = null, timer = null, t0 = 0;
  const VOICES = [{ name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'Samantha' }, { name: 'Linh', lang: 'vi-VN', localService: true, default: false, voiceURI: 'Linh' }];
  const end = (u, kind) => { clearTimeout(timer); timer = null; log.busyMs += performance.now() - t0; log.spoken.push({ text: u.text, t0: t0, t1: performance.now(), end: kind }); cur = null; };
  const synth = {
    speaking: false, paused: false, pending: false, onvoiceschanged: null,
    getVoices: () => VOICES, addEventListener() {}, removeEventListener() {},
    speak(u) {
      if (cur) { /* real engines queue; voice.js never speaks over */ }
      cur = u; synth.speaking = true; t0 = performance.now();
      setTimeout(() => u.onstart && u.onstart({}), 30);
      const ms = 350 + 1000 * u.text.length / (11.7 * (u.rate || 1) / 0.9);
      timer = setTimeout(() => { const x = cur; end(u, 'end'); synth.speaking = false; x && x.onend && x.onend({}); }, ms);
    },
    cancel() { if (cur) { const u = cur; end(u, 'cancel'); synth.speaking = false; u.onerror && u.onerror({ error: 'interrupted' }); } },
    pause() {}, resume() {}
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.rate = 1; this.pitch = 1; this.volume = 1; this.lang = ''; };
  // wrap GW.Voice.say once voice.js is loaded
  const iv = setInterval(() => {
    const V = window.GW && GW.Voice; if (!V || V.__w) return; V.__w = true;
    const say = V.say.bind(V); window.__says = []; let pending = 0; window.__maxPending = 0;
    V.say = function (text, opts) {
      const rec = { t: performance.now(), text: String(text), interrupt: !!(opts && opts.interrupt), priority: !!(opts && opts.priority), reason: null };
      window.__says.push(rec); pending++; window.__maxPending = Math.max(window.__maxPending, pending);
      const p = say(text, opts); p.then(r => { pending--; rec.reason = r.reason; rec.tEnd = performance.now(); }); return p;
    };
    clearInterval(iv);
  }, 2);
};

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  if (want.includes('A')) {
    res.A = {};
    for (const age of [3, 4, 5]) {
      const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await ctx.addInitScript(RECORDER);
      const page = await ctx.newPage(), errors = [];
      page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
      page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
      await page.goto(srv.url + `?bot=1&autostart=1&speed=8&mute=1&age=${age}&autorestart=1&seed=${100 + age}`);
      await page.waitForFunction(() => window.GW && GW.debug && GW.debug.world && GW.debug.world.__rec, null, { timeout: 20000 });
      const t0 = Date.now(), f0 = await page.evaluate(() => GW.debug.stats.frames);
      let ev = [];
      while (Date.now() - t0 < 150000) {
        await sleep(3000);
        ev = await page.evaluate(() => GW.debug.world.__rec.slice());
        if (ev.filter(e => e.type === 'sessionDone').length >= 3) break;
      }
      const st = await page.evaluate(() => Object.assign({}, GW.debug.stats));
      const wall = (Date.now() - t0) / 1000;
      res.A[age] = { ev, errors, fps: (st.frames - f0) / wall, slow: st.slowFrames / Math.max(1, st.frames), wall };
      console.log('A age', age, 'sessions', ev.filter(e => e.type === 'sessionDone').length, 'errors', errors.length, 'fps', ((st.frames - f0) / wall).toFixed(0));
      await ctx.close();
    }
  }
  for (const part of ['B', 'K']) if (want.includes(part)) {
    // B: bot skill 0.7 at its own pace (≈ 0.55 s reaction) · K: the same bot slowed to a 4-year-old's rhythm (bot.step(dt·0.4):
    // ≈ 1.4 s between taps, like typical-4 in lib.js)
    res[part] = {};
    for (const lang of ['en', 'vi']) {
      const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
      await ctx.addInitScript(FAKE_TTS); await ctx.addInitScript(RECORDER);
      const page = await ctx.newPage(), errors = [];
      page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
      page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(srv.url + `?bot=1&skill=0.7&age=4&lang=${lang}&seed=4${lang === 'en' ? 1 : 2}`);
      await page.waitForFunction(() => window.GW && GW.debug && GW.debug.mode === 'title', null, { timeout: 20000 });
      await page.touchscreen.tap(20, 400);   // a real gesture: unlocks audio + speech like a child's first tap
      await page.evaluate((slow) => { GW.Voice.unlock(); GW.debug.startGame();
        if (slow) { const b = GW.debug.bot, st = b.step.bind(b); b.step = (dt) => st(dt * 0.4); } }, part === 'K');
      const t0 = Date.now();
      await sleep(secs * 1000);
      const out = await page.evaluate(() => ({ says: window.__says, tts: window.__tts, maxPending: window.__maxPending, ev: GW.debug.world.__rec, now: performance.now() }));
      res[part][lang] = Object.assign(out, { errors, wall: (Date.now() - t0) / 1000 });
      console.log(part, lang, 'says', out.says.length, 'spoken', out.tts.spoken.length, 'errors', errors.length);
      await ctx.close();
    }
  }
  await browser.close(); srv.close();
  fs.writeFileSync(OUTF, JSON.stringify(res));
})().catch(e => { console.error(e); process.exit(1); });
