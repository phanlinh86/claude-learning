#!/usr/bin/env node
// Koko's Cake Tower — the REAL page at speed 1 with the bot and a MOCK speechSynthesis (duration model: en 12 / vi 14 chars/s
// at rate 0.9 + 0.25 s start latency, cancel → 'interrupted'), so the real main.js + voice.js queue decides which lines are
// heard, cut, dropped or stale. Report-only.
//   NODE_PATH=$(npm root -g) node tests/sim/hs_browser_tts.js [--age 4] [--langs en,vi] [--level 0] [--chapters 1] [--vp ipad-landscape,iphone-portrait]
// Output: tests/sim/out/hs_browser_tts.json + a table on stdout (per line kind: said / heard / interrupted / dropped / stale).
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGE = +get('age', 4), LANGS = get('langs', 'en,vi').split(','), CH = +get('chapters', 1), LEVEL = get('level', '0');
const ALLVP = { 'ipad-landscape': { viewport: { width: 1180, height: 820 }, dpr: 2 }, 'iphone-portrait': { viewport: { width: 393, height: 852 }, dpr: 3 } };
const VPN = get('vp', 'ipad-landscape,iphone-portrait').split(',');

const MOCK = `(() => {
  const CPS = { en: 12, vi: 14 }, LAT = 250;
  let cur = null, q = [], t0 = performance.now();
  const synth = {
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true, default: true }, { name: 'Linh', lang: 'vi-VN', localService: true }],
    addEventListener() {}, removeEventListener() {},
    speak(u) { q.push(u); this.pending = q.length > 0; next(); },
    cancel() { const c = cur; const qq = q; q = []; cur = null; this.speaking = false; this.pending = false;
      if (c) { clearTimeout(c._t1); clearTimeout(c._t2); c.onerror && c.onerror({ error: 'interrupted' }); }
      for (const u of qq) u.onerror && u.onerror({ error: 'canceled' }); },
    pause() { this.paused = true; }, resume() { this.paused = false; }
  };
  function next() {
    if (cur || !q.length) return;
    const u = q.shift(); cur = u; synth.speaking = true; synth.pending = q.length > 0;
    const lang = /^vi/.test(u.lang || '') ? 'vi' : 'en', ms = (u.text || '').length / CPS[lang] * 1000 * (0.9 / (u.rate || 0.9));
    u._t1 = setTimeout(() => { u.onstart && u.onstart({}); }, LAT);
    u._t2 = setTimeout(() => { if (cur !== u) return; cur = null; synth.speaking = false; u.onend && u.onend({}); next(); }, LAT + ms);
  }
  Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true, writable: true });
  window.SpeechSynthesisUtterance = function (text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; };
})();`;

function kindOf(text, I) {   // classify a line by matching it against the i18n tables (best effort)
  return I.find(([k, re]) => re.test(text)) ? I.find(([k, re]) => re.test(text))[0] : 'other';
}

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  const jobs = [];
  let k = 0;
  for (const lang of LANGS) { const vpn = VPN[k++ % VPN.length]; jobs.push({ lang, vpn }); }
  await Promise.all(jobs.map(async ({ lang, vpn }) => {
    const vp = ALLVP[vpn];
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
    await ctx.addInitScript(MOCK);
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(`${srv.url}?bot=1&age=${AGE}&seed=${77 + (lang === 'vi' ? 3 : 0)}&lang=${lang}${LEVEL !== '' ? '&level=' + LEVEL : ''}`);
    await page.waitForFunction(() => window.CK && CK.debug && CK.debug.mode === 'title', null, { timeout: 20000 });
    await page.evaluate(() => {
      const w = CK.debug.world, emit = w._emit.bind(w), say = CK.Voice.say.bind(CK.Voice);
      window.__ev = []; window.__v = [];
      w._emit = e => { window.__ev.push({ type: e.type, t: w.time, n: e.n, i: e.i }); return emit(e); };
      const drain = w.drainEvents.bind(w);   // tag each event so a say() knows which event main is handling
      w.drainEvents = () => drain().map(e => { const t = e.type; Object.defineProperty(e, 'type', { get() { window.__cur = t; return t; }, configurable: true }); return e; });
      CK.Voice.say = (text, o) => {
        const it = { t: w.time, text: String(text), i: !!(o && o.interrupt), p: !!(o && o.priority), ev: window.__cur || 'none', st: null };
        window.__v.push(it);
        const pr = say(text, o);
        Promise.resolve(pr).then(r => { it.res = r && r.reason; it.end = w.time; });
        return pr;
      };
      const _on = CK.Voice.onStart; CK.Voice.onStart = d => { const it = window.__v.slice().reverse().find(x => x.text === d && x.st == null); if (it) it.st = w.time; if (_on) _on(d); };
      CK.Voice.unlock();
      CK.debug.startGame();
    });
    const ok = await page.waitForFunction(n => window.__ev.filter(e => e.type === 'levelDone').length >= n, CH, { timeout: 200000 * CH, polling: 1000 }).then(() => true, () => false);
    await page.waitForTimeout(3000);
    const data = await page.evaluate(() => ({ ev: window.__ev, v: window.__v, stats: CK.debug.stats }));
    await ctx.close();
    const byEv = {};
    for (const v of data.v) {
      const key = v.ev || 'none';
      const o = byEv[key] = byEv[key] || { said: 0, heard: 0, interrupted: 0, dropped: 0, stale: 0, other: 0, examples: [] };
      o.said++;
      const r = v.res || 'pending';
      if (r === 'end') o.heard++; else if (r === 'interrupted') o.interrupted++; else if (r === 'dropped') o.dropped++; else if (r === 'stale') o.stale++; else o.other++;
      if (r !== 'end' && o.examples.length < 3) o.examples.push(`${r}: ${v.text.slice(0, 48)}`);
    }
    // finale timing: towerDone line + blow line vs the world events
    const fin = [];
    const evs = data.ev;
    for (const td of evs.filter(e => e.type === 'towerDone')) {
      const blow = evs.find(e => e.type === 'blow' && e.t >= td.t), rd = evs.find(e => e.type === 'roundDone' && e.t >= td.t);
      const cake = data.v.find(v => v.ev === 'stack' && Math.abs(v.t - td.t) < 0.05);
      const bl = data.v.find(v => v.ev === 'blow' && blow && Math.abs(v.t - blow.t) < 0.05);
      fin.push({ n: td.n, cakeStart: cake && cake.st != null ? +(cake.st - td.t).toFixed(2) : null, cakeRes: cake && cake.res, blowAt: blow ? +(blow.t - td.t).toFixed(2) : null,
        blowLineStart: bl && bl.st != null ? +(bl.st - td.t).toFixed(2) : null, blowRes: bl && bl.res, roundDone: rd ? +(rd.t - td.t).toFixed(2) : null });
    }
    const r = { lang, vp: vpn, ok, errors: errors.slice(0, 5), lines: data.v.length, byEvent: byEv, finale: fin, frames: data.stats.frames, slowFrames: data.stats.slowFrames };
    res.push(r);
  }));
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'hs_browser_tts.json'), JSON.stringify(res, null, 1));
  for (const r of res) {
    console.log(`\n### ${r.lang} · ${r.vp} · ok ${r.ok} · ${r.lines} lines · errors ${r.errors.length}${r.errors.length ? ' ' + JSON.stringify(r.errors) : ''}`);
    console.log('| line (spoken on event) | said | heard | interrupted | dropped | stale | pending/other | lost examples |\n|---|---|---|---|---|---|---|---|');
    for (const [e, o] of Object.entries(r.byEvent).sort((a, b) => b[1].said - a[1].said)) console.log(`| ${e} | ${o.said} | ${o.heard} | ${o.interrupted} | ${o.dropped} | ${o.stale} | ${o.other} | ${o.examples.join(' · ')} |`);
    console.log('finale (s after towerDone): ' + r.finale.map(f => `n${f.n}: cake line ${f.cakeStart}(${f.cakeRes}) blow ${f.blowAt} blow line ${f.blowLineStart}(${f.blowRes}) roundDone ${f.roundDone}`).join(' | '));
  }
  process.exit(0);
})();
