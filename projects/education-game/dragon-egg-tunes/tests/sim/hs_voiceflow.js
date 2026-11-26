#!/usr/bin/env node
// Rio's Cloud Eggs — VOICE FLOW at real speed (?speed=1&bot=1&autostart=1): the real page in Playwright with a FAKE
// speechSynthesis (installed before the page scripts) that "speaks" each utterance for a realistic time
// (300 ms + 75 ms × chars / rate ≈ iOS Samantha / Linh at rate 0.9) and honours cancel() like Safari (onerror 'interrupted').
// Every say request is tagged with the world event that caused it. Report: lines cut (by kind), lines dropped / stale, count runs
// heard in full, prompts heard in full before the child's first touch, % of play time Rio is talking, silences > 8 s in a
// round, the same line twice within 10 s.  node tests/sim/hs_voiceflow.js [--ages 4] [--langs en,vi] [--minutes 4] [--skill 0.8]
// Writes tests/sim/out/voiceflow.json (git-ignored).
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '4').split(',').map(Number), LANGS = get('langs', 'en,vi').split(','), MIN = +get('minutes', 4), SKILL = get('skill', '0.8');
const VP = { width: 1180, height: 820 }, CHILD = get('child', '1') === '1', VARIANT = get('variant', ''), TAG = get('tag', '');

/** In-page 4-year-old (replaces ?bot=1 with --child 1): listens until Rio stops talking, thinks 1.3–2.6 s (eager: p 0.25 taps
 *  0.6–1.6 s after the prompt STARTED), right with p 0.82, retries 0.8–1.6 s after Rio's correction; song: taps a egg 0.8–3 s
 *  after the song ask (p 0.8) or waits for the auto cascade; Talk: answers 3–6 s after the question ends (p 0.87 right). */
function child(DRUM, PR) {
  const w = SE.debug.world, R = Math.random, U = (a, b) => a + (b - a) * R();
  let key = '', at = 0, listenFrom = 0, eager = false, songKey = '', songAt = 0, talkKey = '', talkAt = 0, up = 0;
  const talking = () => SE.Voice.isSpeaking && SE.Voice.isSpeaking();
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
    if (a.song) {
      const k = w.level + ':' + w.round;
      if (k !== songKey) { songKey = k; songAt = R() < 0.8 ? now + U(800, 3000) : 1e15; }
      if (now > songAt) { const c = w.eggs.find(q => q.state === 'stand'); if (c) { w.pointerDown(c.cx, c.cy); up = now + 120; } songAt = 1e15; }
      return;
    }
    const st = w.stepInfo;
    if (st && st.mode === 'beat' && (w.interactive || (DRUM && w.state === 'round'))) {   // beat the big egg (typical gaps 0.35–0.8 s; wild: bursts 0.09–0.3 s from the ask on)
      const c = w.eggs.find(q => q.state === 'stand'); if (!c) return;
      const k = w.level + ':' + w.round + ':' + w.step;
      if (k !== key) { key = k; at = DRUM ? now + U(200, 1000) : 0; listenFrom = now; }
      if (!at) { if (!talking() && now - listenFrom > 300) at = now + U(1300, 2600); return; }
      if (now < at) return;
      w.pointerDown(c.cx + U(-20, 20), c.cy + U(-20, 20)); up = now + (DRUM ? U(30, 80) : U(60, 200));
      at = DRUM ? now + (R() < 0.15 ? U(300, 1500) : U(90, 300)) : now + (R() < 0.07 ? U(2000, 6000) : U(350, 800));
      return;
    }
    if (!w.interactive || !a.egg) { key = ''; return; }
    const k = w.level + ':' + w.round + ':' + w.step + ':' + w.misses;
    if (k !== key) { key = k; at = 0; listenFrom = now; eager = R() < 0.25; }
    if (!at) { if (eager) at = listenFrom + U(600, 1600); else if (!talking() && now - listenFrom > 300) at = now + U(1300, 2600); }
    if (at && now > at) {
      let c = w.eggById(a.egg);
      if (R() > PR && !w.hintHand && !w.assistId) { const o = w.eggs.filter(q => q.state === 'stand' && !q.done && q.id !== c.id); if (o.length) c = o[Math.floor(R() * o.length)]; }
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
    await page.waitForFunction(() => window.SE && SE.debug && SE.debug.mode === 'title', null, { timeout: 20000 });
    await page.keyboard.press('Shift');   // a user gesture: unlocks audio + voice (keydown listener)
    await page.evaluate((cfgJson) => {
      const w = SE.debug.world, say = SE.Voice.say.bind(SE.Voice);
      window.__say = []; window.__ev = []; let last = '';
      const emit = w._emit.bind(w);
      w._emit = e => { last = e.type; window.__ev.push({ type: e.type, t: performance.now(), wt: w.time, count: e.count ? e.count.n : 0, first: e.first, judged: e.judged, auto: e.auto, i: e.i, n: e.n, replay: e.replay, afterDemo: e.afterDemo, mode: e.mode, _e: e }); return emit(e); };
      // the event main.js is handling right now (main iterates the drained array with for…of): the TRUE cause of a say
      let curEv = null; const drain = w.drainEvents.bind(w);
      w.drainEvents = () => { const a = drain(); const base = a.slice(); a[Symbol.iterator] = function* () { for (const e of base) { curEv = e; yield e; } curEv = null; }; return a; };
      window.__curEv = () => curEv;
      SE.Voice.say = (text, o) => {
        const ce = window.__curEv();
        const r = { t: performance.now(), text: String(text), cause: ce ? ce.type : last, ci: ce ? ce.i : undefined, cn: ce ? ce.n : undefined, crep: ce ? !!ce.replay : false, cafter: ce ? !!ce.afterDemo : false, wt: SE.debug.world.time, interrupt: !!(o && o.interrupt), priority: !!(o && o.priority), res: '' };
        window.__say.push(r);
        const p = say(text, o); if (p && p.then) p.then(x => { r.res = x && x.reason; }); return p;
      };
      const C = JSON.parse(cfgJson || '{}'); for (const k of Object.keys(C)) w.cfg[k] = (C[k] && typeof C[k] === 'object' && !Array.isArray(C[k])) ? Object.assign({}, w.cfg[k], C[k]) : C[k];
      SE.debug.startGame();
    }, get('config', '{}'));
    if (VARIANT === 'quiet') await page.evaluate(() => {
      // PROPOSAL P1-2 simulated through the i18n layer: no songDone line (the cascade + Rio's dance say it), the song ask
      // short after its first time in a session, the step prefix "Next one!" dropped from VI/EN long next-prompts.
      const t = SE.I18N.t.bind(SE.I18N); let songs = 0;
      SE.I18N.t = (lang, key, p, r) => {
        if (key === 'songDone') return '';
        if (key === 'song' && songs++ > 0) return lang === 'vi' ? 'Bé gõ các trống nào!' : 'Tap the eggs!';
        return t(lang, key, p, r);
      };
    });
    if (/short/.test(VARIANT)) await page.evaluate((age) => {
      // PROPOSAL (content, sim-only override of i18n): after the demo just "Your turn!" (no "First, red!" cue at ages ≥ 4);
      // the wrong line before a replay = "Oh, purple! Listen again!" (the short name, not "This one is the purple egg…");
      // VI demo start without the long "Bé nghe nè, Rio hát đây!" variant.
      const I = SE.I18N, turn = I.sayTurn, wrong = I.sayWrong, start = I.sayDemoStart;
      I.sayTurn = (lang, ev, o) => (ev && ev.afterDemo && ev.mode !== 'beat' && age >= 4) ? I.t(lang, 'turn.first', null, o && o.rng) : turn(lang, ev, o);
      I.sayWrong = (lang, ev, rng) => {
        if (ev && ev.replay && ev.topic !== 'animals' && ev.thing) { const nm = I.demoName(lang, Object.assign({}, ev, ev.got || {}, { thing: ev.thing })); if (nm) return (lang === 'vi' ? 'Ồ, ' + nm.charAt(0).toLowerCase() + nm.slice(1) + '! Bé nghe lại nhé!' : 'Oh, ' + nm.replace(/^The /, 'the ').replace(/^(\w)/, (m, c) => nm.startsWith('The') ? c : c.toLowerCase()) + '! Listen again!'); }
        return wrong(lang, ev, rng);
      };
      I.sayDemoStart = (lang, ev, rng) => { let t = start(lang, ev, rng); for (let k = 0; k < 6 && /Rio hát đây/.test(t); k++) t = start(lang, ev, rng); return t; };
    }, AGES[0]);
    if (/gate/.test(VARIANT)) await page.evaluate(() => {
      // PROPOSAL (main.js, sim-only prototype): the world's demo waits for Rio's voice — (1) the replay after a wrong note
      // starts only when the wrong line is done (≤ 3 s extra), (2) a spark leaves only when the previous line is done (≤ 0.8 s
      // extra per note; the first spark waits for "Listen to my tune!" ≤ 2.5 s), (3) "Your turn!" waits for the last name (≤ 1 s).
      const w = SE.debug.world, talking = () => SE.Voice.isSpeaking && SE.Voice.isSpeaking();
      let held = 0, key = '';
      setInterval(() => {
        const D = w.demo, cs = w.cfg;
        if (w.state === 'round' && w.phase === 'play' && w._replayT > 0 && w._replayT < 0.12 && talking()) { const k = 'r' + w.time.toFixed(0); if (key !== 'r') { key = 'r'; held = 0; } if (held < 3) { w._replayT = 0.12; held += 0.016; } return; }
        if (!D) { if (key && key[0] === 'd') key = ''; return; }
        const k = 'd' + D.from + ':' + D.launched + ':' + w.round + ':' + w.level;
        if (k !== key) { key = k; held = 0; }
        const cap = D.launched === 0 ? 2.5 : 0.8;
        if (D.launched < D.list.length) { const at = D.arr[D.launched] - cs.sparkTime; if (D.t > at - 0.06 && D.t < at && talking() && held < cap) { D.t = at - 0.06; held += 0.016; } }
        else if (!w.sparks.length && D.t > D.end - 0.06 && D.t < D.end && talking() && held < 1) { D.t = D.end - 0.06; held += 0.016; }
      }, 16);
    });
    if (CHILD) await page.evaluate(`(${child})(${VARIANT === 'eggmer'}, ${+get('right', '0.82')})`);
    await page.waitForTimeout(MIN * 60000);
    const r = await page.evaluate((lang) => {
      // classify each requested line by the i18n key whose template matches it (longest literal wins)
      const I = SE.I18N, esc = x => x.replace(/[.*+?^$()|[\]\\]/g, '\\$&'), pats = [];
      for (const k of I.keys(lang)) { const v = I.raw(lang, k); for (const t of (Array.isArray(v) ? v : typeof v === 'string' ? [v] : [])) {
        const lit = t.replace(/\{[^}]+\}/g, '').length; if (lit < 4) continue;
        try { pats.push({ k, lit, re: new RegExp(esc(t).replace(/\\\{[^}]+\\\}|\{[^}]+\}/g, '.{0,40}?').replace(/\s+/g, '\\s*')) }); } catch (e) {} } }
      const kindOf = text => { if (/(One, two|Một, hai)|^(One dot|Một chấm)!/.test(text)) return 'countRun';
        const m = pats.filter(p => p.re.test(text)), has = f => m.find(p => f(p.k));
        const pick = has(k => k === 'idle') || has(k => k === 'hint') || has(k => /^p\./.test(k));
        if (pick) return pick.k;
        let best = null; for (const p of m) if (!best || p.lit > best.lit) best = p; return best ? best.k : '?'; };
      for (const q of window.__say) q.kind = kindOf(q.text);
      const words = {}; for (let i = 1; i <= 20; i++) words[String(I.t(lang, 'count.' + i)).replace(/[!.]/g, '').trim().toLowerCase()] = i;
      return { words, say: window.__say, tts: window.__tts, ev: window.__ev.map(x => { const y = Object.assign({}, x, { replay: x._e ? !!x._e.replay : x.replay }); delete y._e; return y; }), mode: SE.debug.mode, wtime: SE.debug.world.time, level: SE.debug.world.level };
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
      const touch = r.ev.slice(i + 1).find(q => q.type === 'ring' && q.judged);
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
    // ---- flow checks: count words in order (never a late "Two!" after "Three!"), one praise per round, nothing after the cymbal
    const numOf = text => { const m = String(text).toLowerCase().match(/^([^!,.]+)!/); return m && r.words[m[1].trim()] ? r.words[m[1].trim()] : 0; };
    const evAt = r.ev.map(e => e.t), bounds = r.ev.filter(e => e.type === 'ask' || e.type === 'songAsk');
    const flow = { beatSteps: 0, countWords: 0, countCut: 0, outOfOrder: [], lateCount: [], praise: { rounds: 0, zero: 0, two: 0 }, afterCymbal: [], songDoneLines: 0, songDoneNotLast: 0 };
    for (let i = 0; i < r.ev.length; i++) {
      const e = r.ev[i];
      if (e.type === 'ask') {
        const end = (r.ev.slice(i + 1).find(q => q.type === 'ask' || q.type === 'songAsk' || q.type === 'levelDone') || { t: 1e15 }).t;
        const isBeat = r.ev.slice(i + 1).some(q => q.t < end && q.type === 'count');
        if (!isBeat) continue;
        flow.beatSteps++;
        const us = sorted.filter(u => u.start >= e.t - 5 && u.start < end + 1500 && numOf(u.text));
        let hi = 0;
        for (const u of us) { const n = numOf(u.text); flow.countWords++; if (u.how === 'cut') flow.countCut++; if (n <= hi && flow.outOfOrder.length < 8) flow.outOfOrder.push(us.map(x => x.text).join(' | ')); hi = Math.max(hi, n); }
        const reqs = r.say.filter(q => q.cause === 'count' && q.t >= e.t && q.t < end);
        for (const q of reqs) { const u = sorted.find(x => x.start >= q.t - 5 && x.text === q.text); if (u && u.start - q.t > 700 && flow.lateCount.length < 8) flow.lateCount.push(q.text + ' +' + Math.round(u.start - q.t) + 'ms'); }
      }
      if (e.type === 'roundDone') {
        const end = (r.ev.slice(i + 1).find(q => q.type === 'songAsk') || { t: 1e15 }).t;
        const n = r.say.filter(q => (q.kind === 'great' || q.kind === 'praise') && q.t >= e.t - 5 && q.t <= end + 5).length;
        flow.praise.rounds++; if (n === 0) flow.praise.zero++; if (n > 1) flow.praise.two++;
      }
      if (e.type === 'cymbal') {
        const nx = r.ev.slice(i + 1).find(q => ['round', 'talk', 'levelDone', 'sessionDone'].includes(q.type)) || { t: 1e15, type: 'end' };
        const last = nx.type !== 'round';
        for (const u of sorted.filter(x => x.start > e.t + 5 && x.start < nx.t)) {
          const q = r.say.find(z => Math.abs(z.t - u.start) < 1500 && z.text === u.text), k = q ? q.kind : '?';
          if (k === 'songDone') { flow.songDoneLines++; if (!last) flow.songDoneNotLast++; continue; }
          if (flow.afterCymbal.length < 8) flow.afterCymbal.push((q ? q.cause + '/' + k : '?') + ': ' + u.text);
        }
      }
    }
    // ---- DEMO flow: note names vs sparks, "Listen…" before the 1st note, "Your turn!" heard in full, wrong → line → replay
    const uttOf = q => sorted.find(x => x.text === q.text && x.start >= q.t - 5 && x.start - q.t < 15000);
    const D = { starts: 0, startFull: 0, startOverFirstNote: [], notes: 0, noteSpoken: 0, noteDropped: 0, noteCut: 0, noteLag: [], noteLate: 0, noteOverlapNext: 0, ex: [],
      turns: 0, turnFull: 0, turnHeard: [], startEx: [], turnCut: [], turnLag: [], wrongs: 0, wrongDouble: 0, wrongLines: [], wrongEx: [], replayStartSaid: 0, replayNoteLag: [] };
    const demoEvs = r.ev.filter(e => e.type === 'demoStart' || e.type === 'demoNote' || e.type === 'demoEnd' || e.type === 'ask' || e.type === 'wrong' || e.type === 'demoCount');
    for (let i = 0; i < r.ev.length; i++) {
      const e = r.ev[i];
      if (e.type === 'demoStart') {
        D.starts++;
        const q = r.say.find(z => z.cause === 'demoStart' && Math.abs(z.t - e.t) < 200), u = q && uttOf(q);
        const fn = r.ev.slice(i + 1).find(z => z.type === 'demoNote' || z.type === 'demoCount');
        if (e.replay && !q) D.replayStartSaid += 0; else if (e.replay) D.replayStartSaid++;
        if (u && u.how === 'end') D.startFull++; else if (D.startEx.length < 6) D.startEx.push((q ? q.text + ' (' + q.res + ')' : 'no request') + (u ? ' ' + u.how : '') + (e.replay ? ' [replay]' : ''));
        if (u && D.startEx.length < 12) D.startEx.push('start ' + u.text + ' lag ' + ((u.start - e.t) / 1000).toFixed(2) + ' end-vs-1st-note ' + (fn ? ((u.end - fn.t) / 1000).toFixed(2) : '?') + (e.replay ? ' [replay]' : ''));
        if (u && fn) D.startOverFirstNote.push(+((u.end - fn.t) / 1000).toFixed(2));
      }
      if (e.type === 'demoNote') {
        D.notes++;
        const q = r.say.find(z => z.cause === 'demoNote' && z.ci === e.i && Math.abs(z.t - e.t) < 200), u = q && uttOf(q);
        const nx = r.ev.slice(i + 1).find(z => z.type === 'demoNote' || z.type === 'ask' || z.type === 'demoStart');
        if (!q || !u) { D.noteDropped++; if (D.ex.length < 10) D.ex.push('dropped ' + (q ? q.text + ' (' + q.res + ')' : '?') + (e.replay ? ' [replay]' : '')); continue; }
        D.noteSpoken++; if (u.how === 'cut') D.noteCut++;
        const lag = (u.start - e.t) / 1000; D.noteLag.push(lag); if (e.replay) D.replayNoteLag.push(lag);
        if (lag > 0.6) { D.noteLate++; const busy = sorted.filter(x => x.start < e.t && (x.end || 1e15) > e.t).map(x => x.text); if (D.ex.length < 10) D.ex.push('late ' + lag.toFixed(2) + 's ' + u.text + (e.replay ? ' [replay]' : '') + ' i' + e.i + ' behind: ' + busy.join(' / ')); }
        if (nx && u.end > nx.t + 50) D.noteOverlapNext++;
      }
      if (e.type === 'ask' && e.afterDemo) {
        D.turns++;
        const q = r.say.find(z => z.cause === 'ask' && Math.abs(z.t - e.t) < 200), u = q && uttOf(q);
        if (u) { D.turnLag.push((u.start - e.t) / 1000); if (u.start - e.t > 1000 && D.startEx.length < 16) D.startEx.push('turn late ' + ((u.start - e.t) / 1000).toFixed(2) + ' behind: ' + sorted.filter(x => x.start < e.t && (x.end || 1e15) > e.t).map(x => x.text).join(' / ')); if (u.how === 'end') D.turnFull++; else { D.turnHeard.push((u.end - u.start) / 1000); const cutter = sorted.find(x => x.start >= u.end - 5 && x !== u); const cq = cutter && r.say.find(z => z.text === cutter.text && Math.abs(z.t - cutter.start) < 2000); D.turnCut.push(u.text + ' ← ' + (cq ? cq.cause : '?') + ': ' + (cutter ? cutter.text : '')); } }
        else D.turnCut.push('not said: ' + (q ? q.text + ' (' + q.res + ')' : 'no request'));
      }
      if (e.type === 'wrong') {
        D.wrongs++;
        const end = (r.ev.slice(i + 1).find(z => z.type === 'ask') || { t: e.t + 12000 }).t;
        const us = sorted.filter(x => x.start >= e.t - 5 && x.start < end + 300 && x.how === 'end');
        const ws = r.say.filter(z => z.t >= e.t - 5 && z.t < end + 300);
        const again = us.filter(x => /again|once more|lại/i.test(x.text));
        if (again.length >= 2) { D.wrongDouble++; if (D.wrongEx.length < 6) D.wrongEx.push(us.map(x => x.text).join(' | ')); }
        D.wrongLines.push(us.length);
        if (D.wrongEx.length < 6 && e.replay) D.wrongEx.push('[' + ((end - e.t) / 1000).toFixed(1) + 's] ' + ws.map(z => z.cause + ':' + z.text + '(' + z.res + ')').join(' | '));
      }
    }
    const stat = a => a.length ? { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), max: +Math.max(...a).toFixed(2), p90: +a.slice().sort((x, y) => x - y)[Math.floor(0.9 * a.length)].toFixed(2), n: a.length } : null;
    const demoFlow = { starts: D.starts, startFull: D.startFull, startEndVsFirstNote: stat(D.startOverFirstNote), replayStartSaid: D.replayStartSaid,
      notes: D.notes, noteSpoken: D.noteSpoken, noteDropped: D.noteDropped, noteCut: D.noteCut, noteLag: stat(D.noteLag), replayNoteLag: stat(D.replayNoteLag), noteLate: D.noteLate, noteOverlapNext: D.noteOverlapNext, ex: D.ex,
      turns: D.turns, turnFull: D.turnFull, turnHeardWhenCut: stat(D.turnHeard), startEx: D.startEx, turnLag: stat(D.turnLag), turnCut: D.turnCut.slice(0, 8), wrongs: D.wrongs, wrongDouble: D.wrongDouble, wrongLines: stat(D.wrongLines), wrongEx: D.wrongEx };
    const rec = { age, lang, demoFlow, flow, errors: errors.slice(0, 4), wallMin: MIN, gameS: Math.round(r.wtime), level: r.level, mode: r.mode, requests: r.say.length, utterances: r.tts.length,
      promptDelay: { mean: +(lat.reduce((a, b) => a + b, 0) / Math.max(1, lat.length)).toFixed(2), p50: q(0.5), p90: q(0.9), over2s: lat.filter(x => x > 2).length, n: lat.length },
      rounds: r.ev.filter(e => e.type === 'roundDone').length, perMin: +(r.tts.length / ((t1 - t0) / 60000)).toFixed(1), talkPct: +(talkMs / (t1 - t0) * 100).toFixed(1), asks, askHeardBeforeTouch: heardBefore,
      kinds,
      silences: sil, repeats10s: [...new Set(reps)], says: r.say.map(q => ({ t: Math.round((q.t - t0) / 100) / 10, wt: +q.wt.toFixed(2), text: q.text, cause: q.cause, ci: q.ci, crep: q.crep, int: q.interrupt, pri: q.priority, res: q.res })), evs: r.ev.filter(e => /^(demo|ask|wrong|pokeRio|right|hint|round$)/.test(e.type)).map(e => ({ t: Math.round((e.t - t0) / 100) / 10, wt: +e.wt.toFixed(2), type: e.type, i: e.i, replay: e.replay, afterDemo: e.afterDemo })), slow: +(r.wtime / ((t1 - t0) / 1000)).toFixed(3), lines: sorted.map(u => ({ t: Math.round((u.start - t0) / 100) / 10, d: Math.round(((u.end || u.start) - u.start) / 100) / 10, how: u.how, text: u.text })) };
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
