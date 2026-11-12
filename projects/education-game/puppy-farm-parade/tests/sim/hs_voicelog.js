#!/usr/bin/env node
// Bo's Farm Parade — the REAL page in Playwright (?speed=8&bot=1&mute=1): one full session per age × language; records every
// line main.js hands to FP.Voice.say (with the world's clock and the say options) plus FP.debug.voiceLog, then checks the
// text (no undefined / null / NaN / {param} / [object], no English words in Vietnamese lines, Vietnamese lines carry
// diacritics) and counts lines per game minute by kind.   node tests/sim/hs_voicelog.js [--ages 3,4,5,6,7] [--langs en,vi]
// Needs playwright (NODE_PATH=$(npm root -g)). Writes tests/sim/out/voicelog.json (git-ignored).
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '3,4,5,6,7').split(',').map(Number), LANGS = get('langs', 'en,vi').split(','), SPEED = +get('speed', 8);
const EN_WORDS = /\b(the|find|barn|parade|farm|great|hooray|let's|that's|where|which|one|two|three|letter|number|little|big|tap|look|hello|open)\b/i;
const VI_MARKS = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;

(async () => {
  const srv = await serve(), browser = await chromium.launch(), out = [];
  for (const age of AGES) for (const lang of LANGS) {
    const ctx = await browser.newContext({ viewport: { width: 1180, height: 820 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${srv.url}?speed=${SPEED}&bot=1&mute=1&age=${age}&lang=${lang}&seed=${40 + age}`);
    await page.waitForFunction(() => window.FP && FP.debug && FP.debug.mode === 'title', null, { timeout: 20000 });
    await page.evaluate(() => {
      const w = FP.debug.world, say = FP.Voice.say.bind(FP.Voice);
      window.__lines = []; window.__ev = [];
      FP.Voice.say = (text, o) => { window.__lines.push({ t: +w.time.toFixed(2), text: String(text), interrupt: !!(o && o.interrupt), priority: !!(o && o.priority), last: (window.__ev[window.__ev.length - 1] || '') }); return say(text, o); };
      const emit = w._emit.bind(w); w._emit = e => { window.__ev.push(e.type); return emit(e); };
      FP.debug.startGame();
    });
    let ok = true;
    try { await page.waitForFunction(() => FP.debug.mode === 'done', null, { timeout: 300000, polling: 500 }); } catch (e) { ok = false; }
    await page.waitForTimeout(400);
    const r = await page.evaluate(() => ({ lines: window.__lines, voiceLog: (FP.debug.voiceLog || []).length, time: FP.debug.world.time, levels: FP.debug.world.levels }));
    const bad = [];
    for (const l of r.lines) {
      if (/undefined|null|NaN|\{|\}|\[object|^\s*$/.test(l.text)) bad.push('broken: ' + l.text);
      if (lang === 'vi' && EN_WORDS.test(l.text.replace(/\bBo\b/g, ''))) bad.push('EN in VI: ' + l.text);
      if (lang === 'vi' && !VI_MARKS.test(l.text) && !/^[\d\s+−=!.?,-]+$/.test(l.text)) bad.push('VI without diacritics: ' + l.text);
      if (lang === 'en' && VI_MARKS.test(l.text)) bad.push('VI in EN: ' + l.text);
    }
    const mins = r.time / 60, distinct = new Set(r.lines.map(l => l.text)).size;
    const rec = { age, lang, ok, errors: errors.slice(0, 3), levels: r.levels, gameMin: +mins.toFixed(2), lines: r.lines.length, perMin: +(r.lines.length / mins).toFixed(1),
      interrupts: r.lines.filter(l => l.interrupt).length, distinct, voiceLog: r.voiceLog, bad: [...new Set(bad)], sample: r.lines.slice(0, 40) , all: r.lines };
    out.push(rec);
    console.log(JSON.stringify({ age, lang, ok, gameMin: rec.gameMin, lines: rec.lines, perMin: rec.perMin, distinct, interrupts: rec.interrupts, voiceLog: rec.voiceLog, bad: rec.bad.slice(0, 6), errors: rec.errors }));
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'voicelog.json'), JSON.stringify(out, null, 1));
  process.exit(0);
})();
