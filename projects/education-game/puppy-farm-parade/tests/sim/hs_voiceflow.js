#!/usr/bin/env node
// Bo's Farm Parade — VOICE FLOW at real speed (?speed=1&bot=1&autostart=1): the real page in Playwright with a FAKE
// speechSynthesis (installed before the page scripts) that "speaks" each utterance for a realistic time
// (300 ms + 75 ms × chars / rate ≈ iOS Samantha / Linh at rate 0.9) and honours cancel() like Safari (onerror 'interrupted').
// Every say request is tagged with the world event that caused it. Report: lines cut (by kind), lines dropped / stale, count runs
// heard in full, prompts heard in full before the child's first touch, % of play time Bo is talking, silences > 8 s in a
// round, the same line twice within 10 s.  node tests/sim/hs_voiceflow.js [--ages 4] [--langs en,vi] [--minutes 4] [--skill 0.8]
// Writes tests/sim/out/voiceflow.json (git-ignored).
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '4').split(',').map(Number), LANGS = get('langs', 'en,vi').split(','), MIN = +get('minutes', 4), SKILL = get('skill', '0.8');
const VP = { width: 1180, height: 820 }, CHILD = get('child', '1') === '1', VARIANT = get('variant', ''), TAG = get('tag', '');

/** In-page 4-year-old (replaces ?bot=1 with --child 1): listens until Bo stops talking, thinks 1.3–2.6 s (eager: p 0.25 taps
 *  0.6–1.6 s after the prompt STARTED), right with p 0.82, retries after Bo's correction; gate: taps the barn doors 0.8–3 s after
 *  the gate ask (p 0.8) or waits for the auto-open; Talk: answers 3–6 s after the question ends (p 0.87 right). */
function child() {
  const w = FP.debug.world, R = Math.random, U = (a, b) => a + (b - a) * R();
  let key = '', at = 0, listenFrom = 0, eager = false, gateKey = '', gateAt = 0, talkKey = '', talkAt = 0, up = 0;
  const talking = () => FP.Voice.isSpeaking && FP.Voice.isSpeaking();
  setInterval(() => {
    const now = performance.now();
    if (up && now > up) { w.pointerUp(); up = 0; }
    if (w.state === 'talk' && w.talk && !w.talkAnswered) {
      const k = w.level + ':talk';
      if (k !== talkKey) { talkKey = k; talkAt = 0; }
      if (!talkAt && !talking()) talkAt = now + U(3000, 6000);
      if (talkAt && now > talkAt) { const t = w.talk, wr = t.choices.filter(c => c.id !== t.answer); w.talkAnswer(R() < 0.87 || !wr.length ? t.answer : wr[0].id); talkAt = 1e15; }
      return;
    }
    const a = w.answer && w.answer();
    if (!a || w._g) return;
    if (a.door) {
      const k = w.level + ':' + w.round;
      if (k !== gateKey) { gateKey = k; gateAt = R() < 0.8 ? now + U(800, 3000) : 1e15; }
      if (now > gateAt) { const d = w.doorHit(); w.pointerDown(d.cx, d.cy); up = now + 120; gateAt = 1e15; }
      return;
    }
    if (!w.interactive || !a.member) { key = ''; return; }
    const k = w.level + ':' + w.round + ':' + w.misses;
    if (k !== key) { key = k; at = 0; listenFrom = now; eager = R() < 0.25; }
    if (!at) { if (eager) at = listenFrom + U(600, 1600); else if (!talking() && now - listenFrom > 300) at = now + U(1300, 2600); }
    if (at && now > at) {
      let c = w.memberById(a.member);
      if (R() > 0.82 && !w.hintHand && !w.assistId) { const o = w.members.filter(q => q.state === 'stand' && q.id !== c.id); if (o.length) c = o[Math.floor(R() * o.length)]; }
      w.pointerDown(c.cx + U(-20, 20), c.cy + U(-20, 20)); up = now + U(60, 250); at = 1e15;
    }
  }, 33);
}

function fakeTTS() {
  const log = window.__tts = [];
  let cur = null, timer = null;
  class U { constructor(t) { this.text = t; this.rate = 1; this.lang = ''; } }
  const finish = (how) => {
    const c = cur; if (!c) return; cur = null; clearTimeout(timer);
    c.rec.end = performance.now(); c.rec.how = how;
    if (how === 'end') { if (c.u.onend) c.u.onend({}); } else if (c.u.onerror) c.u.onerror({ error: 'interrupted' });
    next();
  };
  const queue = [];
  const next = () => {
    if (cur || !queue.length) return;
    const u = queue.shift(), ms = 300 + 75 * u.text.length / Math.max(0.3, u.rate || 1);
    const rec = { text: u.text, start: performance.now(), end: 0, how: '', ms };
    log.push(rec); cur = { u, rec };
    setTimeout(() => { if (cur && cur.u === u && u.onstart) u.onstart({}); }, 30);
    timer = setTimeout(() => finish('end'), ms);
  };
  window.SpeechSynthesisUtterance = U;
  const synth = {
    get speaking() { return !!cur; }, get pending() { return queue.length > 0; }, paused: false,
    speak(u) { queue.push(u); setTimeout(next, 0); },
    cancel() { while (queue.length) { const u = queue.shift(); if (u.onerror) u.onerror({ error: 'canceled' }); } finish('cut'); },
    pause() {}, resume() {}, getVoices() { return [{ name: 'Samantha', lang: 'en-US', localService: true }, { name: 'Linh', lang: 'vi-VN', localService: true }]; },
    addEventListener() {}, removeEventListener() {}, onvoiceschanged: null
  };
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
}

(async () => {
  const srv = await serve(), browser = await chromium.launch(), out = [];
  for (const age of AGES) for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: VP, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    await ctx.addInitScript(fakeTTS);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${srv.url}?speed=1&${CHILD ? '' : 'bot=1&skill=' + SKILL + '&'}age=${age}&lang=${lang}&seed=${77 + age}`);
    await page.waitForFunction(() => window.FP && FP.debug && FP.debug.mode === 'title', null, { timeout: 20000 });
    await page.keyboard.press('Shift');   // a user gesture: unlocks audio + voice (keydown listener)
    await page.evaluate(() => {
      const w = FP.debug.world, say = FP.Voice.say.bind(FP.Voice);
      window.__say = []; window.__ev = []; let last = '';
      const emit = w._emit.bind(w);
      w._emit = e => { last = e.type; window.__ev.push({ type: e.type, t: performance.now(), wt: w.time, count: e.count ? e.count.n : 0, first: e.first, judged: e.judged, auto: e.auto }); return emit(e); };
      FP.Voice.say = (text, o) => {
        const r = { t: performance.now(), text: String(text), cause: last, interrupt: !!(o && o.interrupt), priority: !!(o && o.priority), res: '' };
        window.__say.push(r);
        const p = say(text, o); if (p && p.then) p.then(x => { r.res = x && x.reason; }); return p;
      };
      FP.debug.startGame();
    });
    void VARIANT;
    if (CHILD) await page.evaluate(child);
    await page.waitForTimeout(MIN * 60000);
    const r = await page.evaluate((lang) => {
      // classify each requested line by the i18n key whose template matches it (longest literal wins)
      const I = FP.I18N, esc = x => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), pats = [];
      for (const k of I.keys(lang)) { const v = I.raw(lang, k); for (const t of (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])) {
        const lit = t.replace(/\{[^}]+\}/g, '').length; if (lit < 4) continue;
        try { pats.push({ k, lit, re: new RegExp(esc(t).replace(/\\\{[^}]+\\\}|\{[^}]+\}/g, '.{0,40}?').replace(/\s+/g, '\\s*')) }); } catch (e) {} } }
      const kindOf = text => { if (/(One, two|Một, hai)|^(One bell|One dot|Một cái chuông|Một chấm)!/.test(text)) return 'countRun';
        const m = pats.filter(p => p.re.test(text)), has = f => m.find(p => f(p.k));
        const pick = has(k => k === 'idle') || has(k => k === 'hint') || has(k => /^p\./.test(k));
        if (pick) return pick.k;
        let best = null; for (const p of m) if (!best || p.lit > best.lit) best = p; return best ? best.k : '?'; };
      for (const q of window.__say) q.kind = kindOf(q.text);
      return { say: window.__say, tts: window.__tts, ev: window.__ev, mode: FP.debug.mode, wtime: FP.debug.world.time, level: FP.debug.world.level };
    }, lang);
    const fam0 = k => /^p\./.test(k) ? 'prompt' : k === 'countRun' ? 'countRun' : /^w\.|wrong/.test(k) ? 'wrong' : /^(right|name\.say)/.test(k) ? 'right' : k.split('.')[0];
    const fam = k => (k === 'countRun' ? 'countRun' : fam0(k));
    const kinds = {};
    for (const s of r.say) {
      const k = fam(s.kind), o = kinds[k] = kinds[k] || { n: 0, full: 0, cut: 0, notSaid: 0, how: {}, ex: [] };
      o.n++; o.how[s.res] = (o.how[s.res] || 0) + 1;
      if (s.res === 'end') o.full++; else if (s.res === 'interrupted') o.cut++; else o.notSaid++;
      if (s.res !== 'end' && o.ex.length < 4) o.ex.push(s.res + ': ' + s.text);
    }
    // a prompt (ask) heard in full before the child's first judged touch of that step
    let asks = 0, heardBefore = 0;
    for (let i = 0; i < r.ev.length; i++) {
      const e = r.ev[i]; if (e.type !== 'ask') continue;
      const s = r.say.find(q => fam(q.kind) === 'prompt' && q.t >= e.t - 5 && q.t - e.t < 100);
      const touch = r.ev.slice(i + 1).find(q => q.type === 'right' || q.type === 'wrong');   // the child's first judged touch (was a stale 'ring' event from the chime game)
      if (!s || !touch) continue;
      const u = r.tts.find(x => x.start >= s.t - 5 && x.how);
      asks++; if (s.res === 'end' && u && u.end <= touch.t + 1) heardBefore++;
    }
    const lat = [];
    for (const e of r.ev) if (e.type === 'ask') {
      const s = r.say.find(q => fam(q.kind) === 'prompt' && q.t >= e.t - 5 && q.t - e.t < 100); if (!s) continue;
      const u = r.tts.find(x => x.start >= s.t - 5); if (u) lat.push((u.start - e.t) / 1000);
    }
    const lat2 = lat.slice().sort((a, b) => a - b), q = p => lat2.length ? +lat2[Math.min(lat2.length - 1, Math.floor(p * lat2.length))].toFixed(2) : 0;
    const t0 = r.ev.length ? r.ev[0].t : 0, t1 = r.ev.length ? r.ev[r.ev.length - 1].t : 1;
    const talkMs = r.tts.reduce((a, u) => a + ((u.end || t1) - u.start), 0);
    const sil = []; const sorted = r.tts.slice().sort((a, b) => a.start - b.start);
    for (let i = 1; i < sorted.length; i++) { const g = sorted[i].start - (sorted[i - 1].end || sorted[i - 1].start); if (g > 8000) sil.push({ gap: Math.round(g / 100) / 10, after: sorted[i - 1].text, next: sorted[i].text }); }
    const reps = []; for (let i = 1; i < sorted.length; i++) for (let k = i - 1; k >= 0 && sorted[i].start - sorted[k].start < 10000; k--) if (sorted[k].text === sorted[i].text) reps.push(sorted[i].text);
    const rec = { age, lang, errors: errors.slice(0, 4), wallMin: MIN, gameS: Math.round(r.wtime), level: r.level, mode: r.mode, requests: r.say.length, utterances: r.tts.length,
      promptDelay: { mean: +(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length)).toFixed(2), p50: q(0.5), p90: q(0.9), over2s: lat.filter(x => x > 2).length, n: lat.length },
      rounds: r.ev.filter(e => e.type === 'roundDone').length, perMin: +(r.tts.length / ((t1 - t0) / 60000)).toFixed(1), talkPct: +(talkMs / (t1 - t0) * 100).toFixed(1), asks, askHeardBeforeTouch: heardBefore,
      kinds,
      silences: sil, repeats10s: [...new Set(reps)], lines: sorted.map(u => ({ t: Math.round((u.start - t0) / 100) / 10, d: Math.round(((u.end || u.start) - u.start) / 100) / 10, how: u.how, text: u.text })) };
    out.push(rec);
    const brief = Object.assign({}, rec); delete brief.lines;
    console.log(JSON.stringify(brief));
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'voiceflow' + (TAG ? '_' + TAG : '') + '.json'), JSON.stringify(out, null, 1));
  process.exit(0);
})();
