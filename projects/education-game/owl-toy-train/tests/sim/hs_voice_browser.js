#!/usr/bin/env node
// Momo's Toy Train — VOICE-FAITHFUL browser playtest (report-only). The real page runs at ?speed=1 with the voice ON, but on a
// VIRTUAL CLOCK (performance.now / Date.now / setTimeout / setInterval / rAF all driven by +STEP ms per real frame) and with a
// FAKE speechSynthesis whose utterances last 250 ms + chars / (15·rate) s (≈ 13.5 chars/s at Momo's rate 0.9, iOS-like).
// So every guard in main.js (promptUntil, canInterrupt, lastPraise …) and the Voice queue (MAXQ, STALE_MS, interrupt) behave
// exactly as on a phone, only ≈ 6× faster. Records every utterance: queued / started / finished / cut (and how much was heard).
//   NODE_PATH=$(npm root -g) node tests/sim/hs_voice_browser.js [--ages 3,4,5,6,7] [--langs en,vi] [--sessions 1] [--skill 0.8]
// Output: tests/sim/out/voice_<tag>.json (raw) + a summary on stdout.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), LANGS = get('langs', 'en,vi').split(','), SESS = +get('sessions', 1);
const SKILL = +get('skill', 0.8), STEP = +get('step', 100), TAG = get('tag', 'base'), CHARS = +get('cps', 15);
const PACE = get('pace', 'bot');   // bot | child: TT.Bot slowed to a typical 4-year-old (1.8–3.6 s per cargo, whistle 3–5 s, talk 4–7 s)
// --patch file.json: [{file:'main.js'|'i18n.js'|…, old, new}] string replacements applied to the served JS (sim only: the
// game files on disk are never touched) — used to re-simulate proposed voice changes.
const PATCHES = get('patch', '') ? JSON.parse(fs.readFileSync(get('patch'), 'utf8')) : [];
const VP = { viewport: { width: 1180, height: 820 }, dpr: 1 };

function initScript(o) {
  // ---- virtual clock
  const STEP = o.STEP, realRAF = window.requestAnimationFrame.bind(window), realST = window.setTimeout.bind(window);
  let V = 1000, seq = 0; const timers = new Map(); const base = Date.now();
  window.__vnow = () => V;
  performance.now = () => V;
  Date.now = () => base + V;
  function addTimer(fn, ms, rep, a) { const id = ++seq; timers.set(id, { fn, due: V + Math.max(0, +ms || 0), ms: Math.max(1, +ms || 0), rep, a }); return id; }
  window.setTimeout = (fn, ms, ...a) => addTimer(fn, ms, false, a);
  window.setInterval = (fn, ms, ...a) => addTimer(fn, ms, true, a);
  window.clearTimeout = window.clearInterval = id => { timers.delete(id); };
  let rafQ = [];
  window.requestAnimationFrame = cb => { rafQ.push(cb); return rafQ.length; };
  window.cancelAnimationFrame = () => {};
  function runTimersUntil(T) {
    for (;;) {
      let best = null, bid = 0;
      for (const [id, t] of timers) if (t.due <= T && (!best || t.due < best.due)) { best = t; bid = id; }
      if (!best) break;
      if (best.due > V) V = best.due;
      if (best.rep) best.due += best.ms; else timers.delete(bid);
      try { typeof best.fn === 'function' ? best.fn(...best.a) : 0; } catch (e) { console.error('timer', e && e.stack); }
    }
    V = T;
  }
  function tick() {
    runTimersUntil(V + STEP);
    const q = rafQ; rafQ = [];
    for (const cb of q) { try { cb(V); } catch (e) { console.error('raf', e && e.stack); } }
    realRAF(tick);
  }
  realRAF(tick);
  // ---- fake speech synthesis
  const ulog = window.__ulog = [];
  const voices = [{ name: 'Samantha (Enhanced)', lang: 'en-US', localService: true, default: true, voiceURI: 'en' },
    { name: 'Linh (Enhanced)', lang: 'vi-VN', localService: true, voiceURI: 'vi' }];
  class Utt { constructor(t) { this.text = t; this.rate = 1; this.pitch = 1; this.volume = 1; this.lang = ''; this.voice = null; } }
  const synth = { speaking: false, paused: false, pending: false, onvoiceschanged: null, _q: [], _cur: null,
    getVoices: () => voices, addEventListener() {}, pause() {}, resume() {},
    speak(u) { this._q.push(u); if (!this._cur) this._next(); },
    _next() {
      const u = this._q.shift(); if (!u) { this.speaking = false; return; }
      this._cur = u; this.speaking = true;
      const dur = String(u.text).trim() ? 250 + 1000 * String(u.text).length / (o.CHARS * (u.rate || 1)) : 30;
      const rec = { text: u.text, lang: u.lang, q: V, start: V + 40, dur, end: null, how: null };
      if (String(u.text).trim()) ulog.push(rec);
      u._rec = rec;
      u._t1 = window.setTimeout(() => { if (this._cur === u && u.onstart) u.onstart({}); }, 40);
      u._t2 = window.setTimeout(() => { if (this._cur !== u) return; rec.end = V; rec.how = 'end'; this._cur = null; if (u.onend) u.onend({}); this._next(); }, 40 + dur);
    },
    cancel() {
      const u = this._cur; this._q = []; this._cur = null; this.speaking = false;
      if (u) { window.clearTimeout(u._t1); window.clearTimeout(u._t2); u._rec.end = V; u._rec.how = 'cut'; if (u.onerror) u.onerror({ error: 'interrupted' }); }
    } };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = Utt;
}

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  for (const age of AGES) for (const lang of LANGS) for (let s = 0; s < SESS; s++) {
    const ctx = await browser.newContext({ viewport: VP.viewport, deviceScaleFactor: VP.dpr, isMobile: true, hasTouch: true });
    await ctx.addInitScript(initScript, { STEP, CHARS });
    const page = await ctx.newPage(), errors = [];
    if (PATCHES.length) await page.route(/\/js\/[a-z0-9_]+\.js$/, async route => {
      const f = route.request().url().split('?')[0].split('/').pop();
      const mine = PATCHES.filter(p => p.file === f);
      if (!mine.length) return route.continue();
      let body = fs.readFileSync(path.join(__dirname, '..', '..', 'game', 'js', f), 'utf8');
      for (const p of mine) { if (!body.includes(p.old)) { console.error('PATCH MISS', f, p.old.slice(0, 60)); process.exit(2); } body = body.split(p.old).join(p.new); }
      route.fulfill({ status: 200, contentType: 'text/javascript', body });
    });
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    const t0 = Date.now(), seed = 101 + s * 13 + age * 7 + (lang === 'vi' ? 3 : 0);
    await page.goto(`${srv.url}?speed=1&bot=1&skill=${SKILL}&age=${age}&seed=${seed}&lang=${lang}`);
    await page.waitForFunction(() => window.TT && TT.debug && TT.debug.mode === 'title', null, { timeout: 30000 });
    await page.evaluate(pace => {
      if (pace === 'child') {
        const B = TT.Bot.prototype, st = B.step;
        B._delay = function () { return this.rng.float(1.8, 3.6); };
        B.step = function (dt) {
          const w = this.world;
          if (w.state === 'round' && w.phase === 'whistle' && this._wT < 0) this._wT = this.rng.float(3, 5);
          if (w.state === 'talk' && this._talkT < 0 && !w.talkAnswered) this._talkT = this.rng.float(4, 7);
          if (w.state === 'round' && w.phase === 'load' && this._t < 0 && !this._drag && this._askSeen !== w.round + ':' + w.level) { this._askSeen = w.round + ':' + w.level; this._t = this.rng.float(3.5, 5.5); }
          return st.call(this, dt);
        };
        TT.debug.setBot(true, 0.8);
      }
      const w = TT.debug.world, emit = w._emit.bind(w);
      window.__ev = [];
      w._emit = e => {
        const r = { type: e.type, t: w.time, v: window.__vnow() };
        for (const k of ['round', 'mode', 'promptKey', 'stars', 'auto', 'n', 'idle', 'level', 'topic', 'surprise', 'cars', 'items']) if (e[k] !== undefined && typeof e[k] !== 'object') r[k] = e[k];
        if (e.count) r.count = e.count;
        if (e.type === 'ask') r.needs = (e.cars || []).map(c => c.need);
        window.__ev.push(r); return emit(e);
      };
      TT.Voice.unlock();
      TT.debug.startGame();
    }, PACE);
    let ok = true;
    try { await page.waitForFunction(() => TT.debug.mode === 'done', null, { timeout: 600000, polling: 1000 }); } catch (e) { ok = false; }
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ ulog: window.__ulog, ev: window.__ev, log: TT.Voice.log.map(x => ({ t: x.t, text: x.text })), mode: TT.debug.mode }));
    r.age = age; r.lang = lang; r.seed = seed; r.ok = ok; r.errors = errors.slice(0, 5); r.wall = (Date.now() - t0) / 1000;
    res.push(r);
    console.log(JSON.stringify({ age, lang, ok, utter: r.ulog.length, logged: r.log.length, cut: r.ulog.filter(u => u.how === 'cut').length, errors: r.errors.length, wall: r.wall }));
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'voice_' + TAG + '.json'), JSON.stringify(res));
  process.exit(0);
})();
