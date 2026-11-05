#!/usr/bin/env node
// Bop's Rainy Band — QA: the REAL page at high speed (?autostart=1&bot=1&speed=8&mute=1&age=N), one full session per age and
// language, reading RB.debug.stats and every voice line (RB.Voice.say wrapped: text + interrupt/priority, stamped with the
// WORLD clock).   node tests/sim/hs_qa_browser.js [--ages 3,4,5,6,7] [--langs en,vi] [--speed 8]
// Checks: page errors, prompts cut by a later interrupting line (duration model 0.6 s + 85 ms/char ÷ rate 0.9, as voice.js
// estimates), what cut them, the same line again < 8 s, most repeated lines, a count word on every drum tap, p.listen never
// says its number, no negative words, the language of every line, the listen beats starting while the prompt is spoken.
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const RBN = require('./lib').RB;
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), LANGS = get('langs', 'en,vi').split(','), SPEED = +get('speed', 8);
const VPS = [{ name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }, { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 }];
const NUM = { en: ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve'],
  vi: ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín', 'mười', 'mười một', 'mười hai'] };
const NEG = { en: /\b(no|nope|wrong|bad|fail(ed)?|lose|lost|incorrect|not right|mistake|stupid)\b/i, vi: /(\bsai\b|không đúng|\bthua\b|\bdở\b|\bhỏng\b|\bkém\b)/i };
const dur = t => 0.6 + t.length * 0.085 / 0.9;
const L2 = a => { if (!a.length) return { mean: 0, max: 0 }; return { mean: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), max: +Math.max(...a).toFixed(2) }; };

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  let k = 0;
  for (const age of AGES) for (const lang of LANGS) {
    const vp = VPS[k++ % VPS.length];
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    // install the hooks before main.js runs autostart: wrap once RB.Voice / RB.debug exist
    await page.addInitScript(() => {
      window.__ev = []; window.__v = [];
      const iv = setInterval(() => {
        const RB = window.RB;
        if (!RB || !RB.Voice || !RB.debug || !RB.debug.world || RB.Voice.__w) return;
        const w = RB.debug.world, emit = w._emit.bind(w), say = RB.Voice.say.bind(RB.Voice);
        RB.Voice.__w = true;
        w._emit = e => { e.__t = w.time; window.__ev.push({ type: e.type, t: w.time, i: e.i, n: e.n, mode: e.mode, promptKey: e.promptKey, stars: e.stars, topic: e.topic }); return emit(e); };
        // main: for (const e of world.drainEvents()) onEvent(e) — tag every voice line with the event being handled
        const drain = w.drainEvents.bind(w);
        w.drainEvents = () => { const a = drain(), it = Array.prototype[Symbol.iterator]; a[Symbol.iterator] = function* () { for (const e of it.call(a)) { window.__cur = e; yield e; } window.__cur = null; }; return a; };
        RB.Voice.say = (text, o) => { const c = window.__cur; window.__v.push({ t: c ? c.__t : w.time, cause: c ? c.type : 'ui', text: String(text), i: !!(o && o.interrupt), p: !!(o && o.priority), mode: c && c.mode, n: c && c.n, ci: c && c.i }); return say(text, o); };
        clearInterval(iv);
      }, 5);
    });
    const t0 = Date.now();
    // pick the first seed whose session has a counting chapter (same world code headless → same topics)
    let seed = 300 + age * 17 + (lang === 'vi' ? 3 : 0);
    for (let g = 0; g < 50; g++, seed++) { const w = new RBN.World({ seed, age, lang }); w.newSession(); if (w.levels.includes('count')) break; }
    await page.goto(`${srv.url}?autostart=1&bot=1&speed=${SPEED}&mute=1&age=${age}&lang=${lang}&seed=${seed}`);
    let ok = true;
    try { await page.waitForFunction(() => window.RB && RB.debug && RB.debug.mode === 'done', null, { timeout: 300000, polling: 500 }); } catch (e) { ok = false; }
    const data = await page.evaluate(() => ({ ev: window.__ev, v: window.__v, stats: RB.debug.stats, vlog: (RB.debug.voiceLog || []).length, time: RB.debug.world.time, stars: RB.debug.world.stars, levels: RB.debug.world.levels }));
    await ctx.close();
    const ev = data.ev, V = data.v;
    // speech timeline model: a line starts at max(t, end of the previous); an interrupting line kills the current one + the queue
    const tl = []; let cur = null, q = [];
    const fin = (x, how, by) => { x.how = how; x.by = by; };
    const advance = t => { while (true) { if (cur && cur.end <= t) { fin(cur, 'done'); cur = null; } if (!cur && q.length) { const n = q.shift(); n.start = Math.max(n.t, n.ready || n.t); n.end = n.start + dur(n.text); cur = n; if (n.end <= t) continue; } break; } };
    for (const v of V) {
      advance(v.t); tl.push(v);
      if (v.i) { if (cur) { fin(cur, 'cut', v.cause); cur = null; } for (const x of q) fin(x, 'dropped', v.cause); q = []; }
      if (cur) v.ready = cur.end; q.push(v); advance(v.t);
    }
    advance(1e9);
    const isPrompt = v => v.p && (v.cause === 'ask' || v.cause === 'talk' || v.cause === 'talkAsk');
    const P = tl.filter(isPrompt), cutBy = {};
    for (const v of P) if (v.how !== 'done') { const k = v.how + ' by ' + v.by; cutBy[k] = (cutBy[k] || 0) + 1; }
    const own = ['play', 'drumDone', 'talkResult'];   // the child answered: the prompt is no longer needed
    const promptsCut = P.filter(v => v.how !== 'done' && !own.includes(v.by)).length, prompts = P.length, cut = promptsCut;
    const promptDelay = L2(P.map(v => (v.start || v.t) - v.t));
    const PR = tl.filter(v => v.cause === 'play' || v.cause === 'drumDone'), praiseCutBy = {};
    for (const v of PR) if (v.how !== 'done') { const k = v.how + ' by ' + v.by; praiseCutBy[k] = (praiseCutBy[k] || 0) + 1; }
    const praise = PR.length, praiseCut = PR.filter(v => v.how !== 'done').length;
    let rep8 = 0; for (let i = 0; i < V.length; i++) for (let j = i - 1; j >= 0 && V[i].t - V[j].t < 8; j--) if (V[j].text === V[i].text) { rep8++; break; }
    const count = {}; for (const v of V) count[v.text] = (count[v.text] || 0) + 1;
    const top = Object.entries(count).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([t, c]) => `${c}× "${t.slice(0, 44)}"`);
    // count words on drum taps
    const taps = ev.filter(e => e.type === 'drumTap');
    const words = V.filter(v => v.cause === 'drumTap'); const tapNoWord = taps.length - words.filter(v => v.text.toLowerCase().includes(NUM[lang][v.ci] || String(v.ci))).length;
    const tapWords = [...new Set(words.map(v => v.text))].slice(0, 8);
    // listen prompts must not say the number; beats vs prompt length
    const listenAsks = ev.filter(e => e.type === 'ask' && e.mode === 'listen');
    let listenSays = 0, beatsInPrompt = 0, beatAsks = 0;
    for (const a of listenAsks) {
      const v = V.find(x => x.cause === 'ask' && x.mode === 'listen' && Math.abs(x.t - a.t) < 0.001); if (!v) continue;
      const w = NUM[lang][a.n], low = v.text.toLowerCase();
      if (low.includes(String(a.n)) || (w && new RegExp('(^|[^\\p{L}])' + w + '([^\\p{L}]|$)', 'u').test(low))) listenSays++;
      const firstBeat = ev.find(e => e.type === 'beat' && e.t > a.t && e.i === 1);
      if (firstBeat) { beatAsks++; const end = (v.start || a.t) + dur(v.text); beatsInPrompt += ev.filter(e => e.type === 'beat' && e.t > a.t && e.t < end && e.t < a.t + 10).length; }
    }
    const neg = V.filter(v => NEG[lang].test(v.text)).map(v => v.text);
    const viChars = /[ăâđêôơưáàảãạấầẩẫậắằẳẵặéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/i;
    const enWords = /\b(the|drum|tap|play|listen|yes|great|song|band)\b/i;
    const wrongLang = lang === 'vi' ? V.filter(v => !viChars.test(v.text) && enWords.test(v.text)).map(v => v.text) : V.filter(v => viChars.test(v.text)).map(v => v.text);
    const r = { age, lang, vp: vp.name, ok, wall: Math.round((Date.now() - t0) / 1000), errors: errors.slice(0, 4), session: +data.time.toFixed(0), stars: data.stars,
      levels: data.levels, asks: ev.filter(e => e.type === 'ask').length, lines: V.length, perMin: +(V.length / (data.time / 60)).toFixed(1),
      prompts, promptsCut: cut, cutBy, promptDelay, praise, praiseCut, praiseCutBy, rep8, top, drumTaps: taps.length, tapNoWord, tapWords, listenAsks: listenAsks.length, listenSays,
      beatsDuringPrompt: beatAsks ? +(beatsInPrompt / beatAsks).toFixed(2) : 0, negative: neg.slice(0, 3), wrongLang: wrongLang.slice(0, 3), nWrongLang: wrongLang.length,
      stats: data.stats, voiceLog: data.vlog };
    res.push(r); console.log(JSON.stringify(r));
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'qa_browser.json'), JSON.stringify(res, null, 1));
  process.exit(0);
})();
