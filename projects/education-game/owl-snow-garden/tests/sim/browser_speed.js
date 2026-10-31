#!/usr/bin/env node
// Real-browser high-speed session: the bot plays a whole session at ?speed=8 for age 3 and 4 (Chromium, Playwright).
// Every SG.Voice.say() request and every world event is recorded with the GAME time, then replayed through the
// voice.js queue model (playtest.js VoiceQueue) to check spam: ≤ 2 lines queued, no line repeated back-to-back
// within 2 s, all counting lines "One! Two! …" present in count rounds.
//   node tests/sim/browser_speed.js [--ages 3,4] [--speed 8] [--skill 0.8]
// Note: at speed > 1 main.js mutes the synthesizer but SG.Voice.say still runs (and is logged); main.js's own
// throttles use wall-clock ms (grab 700 ms, praise 1200 ms) → at ×8 they span 8× more game time than on a device.
'use strict';
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const { VoiceQueue, speechMetrics } = require('./playtest');

const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const ages = get('ages', '3,4').split(',').map(Number), speed = +get('speed', 8), skill = +get('skill', 0.8);

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const results = [];
  for (const age of ages) {
    const page = await browser.newPage({ viewport: { width: 1180, height: 820 }, hasTouch: true });
    const errs = [];
    page.on('pageerror', e => errs.push(String(e)));
    page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(`${srv.url}?bot=1&skill=${skill}&speed=${speed}&age=${age}&seed=${20 + age}&lang=en`);
    await page.waitForFunction(() => window.SG && SG.debug && SG.debug.mode === 'title', null, { timeout: 30000 });
    await page.evaluate(() => {
      const w = SG.debug.world; window.__rec = { say: [], ev: [] };
      const say = SG.Voice.say.bind(SG.Voice);
      SG.Voice.say = (text, o) => { window.__rec.say.push({ t: w.time, text: String(text), o: Object.assign({}, o || {}) }); return say(text, o); };
      const dr = w.drainEvents.bind(w);
      w.drainEvents = () => { const e = dr(); for (const x of e) window.__rec.ev.push({ t: w.time, type: x.type, mode: x.mode, n: x.n, need: x.need, params: x.params, topic: x.topic }); return e; };
      SG.debug.startGame();
    });
    const t0 = Date.now();
    await page.waitForFunction(() => SG.debug.mode === 'done', null, { timeout: 240000, polling: 500 });
    const rec = await page.evaluate(() => ({ rec: window.__rec, stats: SG.debug.stats, state: SG.debug.getState() }));
    await page.close();
    // replay through the queue model
    const v = new VoiceQueue('en'); const typeOf = (txt, o) => (o.interrupt ? 'i' : o.priority ? 'p' : 'n');
    const countRounds = []; let cur = null; const overflow = [];
    const evs = rec.rec.ev; let ei = 0;
    const S = rec.rec.say;
    for (const s of S) {
      while (ei < evs.length && evs[ei].t <= s.t) { const e = evs[ei++]; if (e.type === 'round') { cur = e.mode === 'count' ? { need: e.params.n, t0: e.t, t1: null, done: false } : null; if (cur) countRounds.push(cur); } if (e.type === 'roundDone' && cur) { cur.t1 = e.t + 2; cur.done = true; } }
      v.advance(s.t);
      const isCount = /^(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)!/.test(s.text);
      const mq0 = v.drop.maxq, qBefore = v.q.map(x => x.text), curT = v.cur && v.cur.text;
      v.say(isCount ? 'count' : typeOf(s.text, s.o), s.text, s.o);
      if (v.drop.maxq > mq0) overflow.push({ t: +s.t.toFixed(2), speaking: curT, queued: qBefore, added: s.text });
      if (isCount) v.started[v.started.length - 1].n = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'].indexOf(s.text.split('!')[0]) + 1;
    }
    for (; ei < evs.length; ei++) { const e = evs[ei]; if (e.type === 'roundDone' && cur) { cur.t1 = e.t + 2; cur.done = true; } }
    v.advance(1e9);
    // count lines were tagged only if they started; tag the started list by text too
    for (const x of v.started) if (x.type === 'count' && !x.n) x.n = ['One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve'].indexOf(x.text.split('!')[0]) + 1;
    const m = speechMetrics(v, countRounds);
    // requested count words per count round (independent of the queue model)
    const countReq = countRounds.map(r => { const ws = S.filter(s => s.t >= r.t0 && s.t <= (r.t1 || 1e9) && /^[A-Z][a-z]+!/.test(s.text)).map(s => s.text.split('!')[0]); return { need: r.need, said: ws.filter(x => /^(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)$/.test(x)) }; });
    let pendMax = 0; // requests that arrive while ≥ 2 already wait (≈ a 3rd queued line)
    const rep = []; for (let i = 1; i < S.length; i++) if (S[i].text === S[i - 1].text && S[i].t - S[i - 1].t < 2) rep.push(S[i].text);
    const sessionT = (evs.find(e => e.type === 'sessionDone') || {}).t;
    results.push({ overflow, say: S.map(s => [+s.t.toFixed(2), s.o.interrupt ? 'I' : s.o.priority ? 'P' : '-', s.text]), age, wallS: (Date.now() - t0) / 1000, sessionT, lines: S.length, errors: errs, metrics: m, countReq, repeats: rep, stats: rec.stats,
      sample: S.slice(0, 40).map(s => `${s.t.toFixed(1)} ${s.o.interrupt ? '!' : s.o.priority ? '*' : ' '} ${s.text}`) });
  }
  await browser.close(); srv.close();
  const out = path.join(__dirname, 'out'); fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'browser_speed.json'), JSON.stringify(results, null, 1));
  for (const r of results) {
    console.log(`age ${r.age}: session ${r.sessionT && r.sessionT.toFixed(0)} game-s in ${r.wallS.toFixed(0)} wall-s, ${r.lines} voice lines, errors ${r.errors.length}`);
    console.log('  queue model:', JSON.stringify(r.metrics));
    console.log('  queue overflow:', JSON.stringify(r.overflow));
    console.log('  back-to-back repeats < 2 s:', r.repeats.length, r.repeats.slice(0, 5));
    console.log('  count rounds:', r.countReq.map(c => `N=${c.need}: ${c.said.join(' ')}`).join(' | '));
  }
})().catch(e => { console.error(e); process.exit(1); });
