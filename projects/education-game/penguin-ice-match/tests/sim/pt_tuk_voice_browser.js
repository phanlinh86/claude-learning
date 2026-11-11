#!/usr/bin/env node
// Real-page voice playtest (report-only). Runs the real game/index.html in Chromium (iPhone portrait, touch):
//   A  ?speed=8&bot=1&autostart=1&mute=1 — one whole session per age 3 / 4 / 5 / 7 × en / vi; every IM.Voice.say request is
//      tagged with the world event being handled (drainEvents iterator hook) → requested lines per GAME minute, by kind;
//      count lines, Tuk's spoken name in vi, child's name ("Lan" saved in settings) in praise lines.
//   B  speed 1, bot, NOT muted, with a fake speechSynthesis (0.3 s + 72 ms/char, real cancel / onend semantics) → the real
//      voice.js queue decides: heard fully / interrupted / dropped / stale per kind; prompts cut.
//   node tests/sim/pt_tuk_voice_browser.js [A|B|AB] → tests/sim/out/pt_tuk_voice_browser.{md,json}
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const want = process.argv[2] || 'AB';
const sleep = ms => new Promise(r => setTimeout(r, ms));

const FAKE_TTS = `(() => {
  const log = window.__tts = [];
  let cur = null, timer = null;
  class U { constructor(t) { this.text = t; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; } }
  const voices = [{ name: 'Fake Samantha', lang: 'en-US', localService: true, default: true }, { name: 'Fake Linh', lang: 'vi-VN', localService: true }];
  const S = {
    get speaking() { return !!cur; }, get pending() { return false; }, paused: false,
    getVoices: () => voices, addEventListener() {}, removeEventListener() {}, onvoiceschanged: null,
    speak(u) {
      if (cur) { const c = cur; cur = null; clearTimeout(timer); c.onerror && c.onerror({ error: 'interrupted' }); }
      cur = u; const dur = 300 + 72 * String(u.text).length;
      log.push({ t: performance.now(), ev: 'start', text: u.text });
      setTimeout(() => { if (cur === u) u.onstart && u.onstart({}); }, 20);
      timer = setTimeout(() => { if (cur !== u) return; cur = null; log.push({ t: performance.now(), ev: 'end', text: u.text }); u.onend && u.onend({}); }, dur);
    },
    cancel() { if (cur) { const c = cur; cur = null; clearTimeout(timer); log.push({ t: performance.now(), ev: 'cancel', text: c.text }); c.onerror && c.onerror({ error: 'interrupted' }); } },
    pause() {}, resume() {}
  };
  Object.defineProperty(window, 'speechSynthesis', { value: S, configurable: true });
  window.SpeechSynthesisUtterance = U;
})();`;

// tag every say() with the event main.js is handling + its fate (the promise result)
const HOOK = `(() => {
  const w = IM.debug.world, orig = w.drainEvents.bind(w);
  w.drainEvents = function () { const a = orig(); a[Symbol.iterator] = function* () { for (let i = 0; i < a.length; i++) { window.__ev = a[i]; yield a[i]; } window.__ev = null; }; return a; };
  const rec = window.__say = []; const os = IM.Voice.say.bind(IM.Voice);
  IM.Voice.say = function (text, opts) {
    const e = window.__ev, r = { t: performance.now(), gt: w.time, text: String(text), ev: e ? e.type : (IM.debug.mode || '?'), open: e && e.open, dots: !!(e && e.face && e.face.kind === 'dots'),
      interrupt: !!(opts && opts.interrupt), priority: !!(opts && opts.priority), spoken: IM.Voice.spoken(IM.Voice.getLang(), String(text)), reason: null };
    rec.push(r);
    const p = os(text, opts); if (p && p.then) p.then(x => { r.reason = x && x.reason; r.endT = performance.now(); });
    return p;
  };
})();`;

const kindOf = (r) => {
  if (r.ev === 'round') return r.priority ? 'prompt' : 'surprise';
  if (r.ev === 'flip') return r.open === 2 ? 'name2' : 'name1';
  if (r.ev === 'talk') return 'talkQ';
  return r.ev;
};

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const res = { A: [], B: [] };
  const ctxFor = async (lang) => {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 852 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: lang === 'vi' ? 'vi-VN' : 'en-US' });
    await ctx.addInitScript(() => { try { localStorage.setItem('im:settings', JSON.stringify({ name: 'Lan', voice: true, sfx: true, music: true, mic: false, volume: 1 })); } catch (e) {} });
    return ctx;
  };
  async function session(age, lang, speed, fake, wallCap) {
    const ctx = await ctxFor(lang);
    if (fake) await ctx.addInitScript(FAKE_TTS);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(srv.url + `?speed=${speed}&bot=1&autostart=1${fake ? '' : '&mute=1'}&age=${age}&lang=${lang}&seed=${age * 101 + (lang === 'vi' ? 7 : 0)}`);
    await page.waitForFunction(() => window.IM && IM.debug && IM.debug.world && IM.debug.mode === 'play', null, { timeout: 30000 });
    await page.evaluate(HOOK);
    if (fake) { await page.mouse.click(200, 400); await page.evaluate(() => IM.Voice.unlock()); }
    const t0 = Date.now(); let st;
    while (Date.now() - t0 < wallCap) { await sleep(1500); st = await page.evaluate(() => ({ mode: IM.debug.mode, gt: IM.debug.world.time, state: IM.debug.world.state })); if (st.mode === 'done' || st.state === 'sessionDone') break; }
    await sleep(fake ? 3000 : 500);
    const d = await page.evaluate(() => ({ say: window.__say, tts: window.__tts || [], gt: IM.debug.world.time, mode: IM.debug.mode, voiceLogN: (IM.debug.voiceLog || []).length }));
    await ctx.close();
    return Object.assign(d, { age, lang, speed, fake, errors, wall: (Date.now() - t0) / 1000 });
  }
  if (want.includes('A')) {
    for (const age of [3, 4, 5, 7]) for (const lang of ['en', 'vi']) {
      const r = await session(age, lang, 8, false, 90000); res.A.push(r);
      console.error('A', age, lang, r.mode, r.gt.toFixed(0), r.say.length, r.errors.length);
    }
  }
  if (want.includes('B')) {
    const jobs = [[4, 'en'], [4, 'vi'], [3, 'vi'], [7, 'en']];
    for (let i = 0; i < jobs.length; i += 2) {
      const rr = await Promise.all(jobs.slice(i, i + 2).map(([a, l]) => session(a, l, 1, true, 420000)));
      for (const r of rr) { res.B.push(r); console.error('B', r.age, r.lang, r.mode, r.gt.toFixed(0), r.say.length, r.errors.length); }
    }
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'pt_tuk_voice_browser.json'), JSON.stringify(res));
  let md = '## Real-page voice playtest (Chromium, iPhone portrait 393×852, bot skill 0.8, child name "Lan")\n\n';
  if (res.A.length) {
    md += '### A. speed 8, muted — requested lines (IM.Voice.say calls) per GAME minute\n\n| age | lang | session (game s) | requests | /min | name1 | name2 | match | mismatch | prompt | praise | count lines | child name lines | vi "Túc" ok | errors |\n|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|\n';
    for (const r of res.A) {
      const k = {}; for (const s of r.say) { const q = kindOf(s); k[q] = (k[q] || 0) + 1; }
      const cnt = r.say.filter(s => s.dots && s.ev === 'flip').length, child = r.say.filter(s => /\bLan\b/.test(s.text)).length;
      const tuk = r.say.filter(s => /\bTuk\b/.test(s.text)), tukOk = r.lang === 'vi' ? tuk.filter(s => /Túc/.test(s.spoken) && !/\bTuk\b/.test(s.spoken)).length + '/' + tuk.length : '–';
      md += `| ${r.age} | ${r.lang} | ${r.gt.toFixed(0)}${r.mode === 'done' ? '' : ' (' + r.mode + ')'} | ${r.say.length} | ${(r.say.length / (r.gt / 60)).toFixed(1)} | ${k.name1 || 0} | ${k.name2 || 0} | ${k.match || 0} | ${k.mismatch || 0} | ${k.prompt || 0} | ${k.roundDone || 0} | ${cnt} | ${child} | ${tukOk} | ${r.errors.length} |\n`;
    }
    const ex = res.A.find(r => r.age === 4 && r.lang === 'en');
    if (ex) md += '\nSample (age 4 en, first count round):\n\n```\n' + (() => { const i = ex.say.findIndex(s => s.dots); return ex.say.slice(Math.max(0, i - 3), i + 12).map(s => `${s.gt.toFixed(1).padStart(6)} ${kindOf(s).padEnd(9)} ${s.text}`).join('\n'); })() + '\n```\n';
    const vi = res.A.find(r => r.age === 4 && r.lang === 'vi');
    if (vi) md += '\nSample (age 4 vi, start):\n\n```\n' + vi.say.slice(0, 16).map(s => `${s.gt.toFixed(1).padStart(6)} ${kindOf(s).padEnd(9)} ${s.text}${s.spoken !== s.text ? '   [spoken: ' + s.spoken + ']' : ''}`).join('\n') + '\n```\n';
  }
  if (res.B.length) {
    md += '\n### B. speed 1, fake TTS (0.3 s + 72 ms/char) — what voice.js actually lets through\n\n| age | lang | game s | requests | started /min | talk share | heard fully: name1 / name2 / match / mismatch / prompt / praise / count | prompts cut | top lost |\n|---|---|---|---|---|---|---|---|---|\n';
    for (const r of res.B) {
      const by = {}; for (const s of r.say) { const q = kindOf(s); (by[q] = by[q] || { n: 0, end: 0, lost: {} }); by[q].n++; if (s.reason === 'end') by[q].end++; else by[q].lost[s.reason] = (by[q].lost[s.reason] || 0) + 1; }
      const h = (q) => by[q] ? Math.round(100 * by[q].end / by[q].n) + '%' : '–';
      const cnt = r.say.filter(s => s.dots && s.ev === 'flip'), cntH = cnt.length ? Math.round(100 * cnt.filter(s => s.reason === 'end').length / cnt.length) + '%' : '–';
      let sp = 0, open = null; for (const e of r.tts) { if (e.ev === 'start') { if (open !== null) sp += e.t - open; open = e.t; } else { if (open !== null) sp += e.t - open; open = null; } }
      const starts = r.tts.filter(e => e.ev === 'start').length, min = r.gt / 60;
      const lost = []; for (const q in by) for (const why in by[q].lost) lost.push([q + ' ' + why, by[q].lost[why]]);
      lost.sort((a, b) => b[1] - a[1]);
      md += `| ${r.age} | ${r.lang} | ${r.gt.toFixed(0)} | ${r.say.length} | ${(starts / min).toFixed(1)} | ${Math.round(100 * sp / 1000 / r.gt)}% | ${['name1', 'name2', 'match', 'mismatch', 'prompt', 'roundDone'].map(h).join(' / ')} / ${cntH} | ${(by.prompt && by.prompt.lost.interrupted) || 0} | ${lost.slice(0, 4).map(x => x.join(' ')).join(', ')} |\n`;
    }
    const ex = res.B[0];
    md += '\nSample timeline (B, age ' + ex.age + ' ' + ex.lang + ', first count / animals round with fates):\n\n```\n' + (() => { const i = Math.max(0, ex.say.findIndex(s => s.ev === 'flip')); return ex.say.slice(Math.max(0, i - 3), i + 14).map(s => `${s.gt.toFixed(1).padStart(6)} ${kindOf(s).padEnd(9)} ${(s.reason || '').padEnd(11)} ${s.text}`).join('\n'); })() + '\n```\n';
  }
  fs.writeFileSync(path.join(OUT, 'pt_tuk_voice_browser.md'), md);
  console.log(md);
})().catch(e => { console.error(e); process.exit(1); });
