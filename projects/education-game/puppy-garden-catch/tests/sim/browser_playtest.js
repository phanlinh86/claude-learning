#!/usr/bin/env node
// Real-browser high-speed session(s) (Playwright Chromium) with ?speed=8&bot=1&autostart=1&mute=1, then the same
// age / viewport / bot skill headless, to check the browser numbers agree with the harness.
//   node tests/sim/browser_playtest.js [age=4] [seeds=3]
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const serve = require('../e2e/serve');
const L = require('./lib');
const { run } = require('./playtest');

const age = +(process.argv[2] || 4), nSeeds = +(process.argv[3] || 3);
const DEVICES = [
  { name: 'iphoneL', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'iphoneP', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'ipadL', viewport: { width: 1180, height: 820 }, dpr: 2 },
  { name: 'ipadP', viewport: { width: 820, height: 1180 }, dpr: 2 }
];

function initScript() {
  // capture every world event with its game time (wrap PG.World.prototype._emit as soon as world.js defines it)
  window.__ev = [];
  let W;
  const PGo = {};
  Object.defineProperty(PGo, 'World', {
    configurable: true, enumerable: true, get() { return W; },
    set(v) { W = v; const e0 = v.prototype._emit; v.prototype._emit = function (e) { window.__ev.push({ t: this.time, type: e.type, stars: e.stars, right: e.right, correct: e.correct }); return e0.call(this, e); }; }
  });
  window.PG = PGo;
}

function summarise(ev) {
  const lv = ev.filter(e => e.type === 'level').map(e => e.t), lvDone = ev.filter(e => e.type === 'levelDone').map(e => e.t);
  const rs = [], rd = ev.filter(e => e.type === 'round' || e.type === 'roundDone');
  for (let i = 0; i < rd.length - 1; i++) if (rd[i].type === 'round' && rd[i + 1].type === 'roundDone') rs.push(rd[i + 1].t - rd[i].t);
  const done = ev.find(e => e.type === 'sessionDone');
  const med = a => { const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };
  return {
    session: done ? done.t : null, stars: done ? done.stars : null, chapters: lv.map((t, i) => (lvDone[i] || NaN) - t).map(x => +x.toFixed(1)),
    rounds: rs.length, roundMed: med(rs), corrects: ev.filter(e => e.type === 'correct').length, wrongs: ev.filter(e => e.type === 'wrong').length,
    misses: ev.filter(e => e.type === 'miss').length, hints: ev.filter(e => e.type === 'hint').length, talkRight: ev.filter(e => e.type === 'talkResult' && e.correct).length
  };
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const rows = [];
  for (const d of DEVICES) for (let k = 0; k < nSeeds; k++) {
    const seed = 101 + k;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    await page.addInitScript(initScript);
    const t0 = Date.now();
    await page.goto(`${srv.url}?speed=8&bot=1&autostart=1&mute=1&seed=${seed}&age=${age}&lang=${k % 2 ? 'vi' : 'en'}`);
    try { await page.waitForFunction(() => window.PG && PG.debug && PG.debug.mode === 'done', null, { timeout: 240000, polling: 500 }); }
    catch (e) { errors.push('not done: ' + JSON.stringify(await page.evaluate(() => PG.debug && PG.debug.getState()))); }
    const out = await page.evaluate(() => ({ ev: window.__ev, view: PG.debug.view(), W: PG.debug.world.layout.W, H: PG.debug.world.layout.H, ins: PG.debug.world.layout.ins, frames: PG.debug.stats.frames }));
    const s = summarise(out.ev);
    // headless twin: same seed / age / logical viewport + insets as the browser, bot 0.8
    L.VIEWPORTS.__b = { W: out.W, H: out.H, ins: out.ins };
    const h = run(L, { age, vp: '__b', driver: 'bot0.8', seed, lang: k % 2 ? 'vi' : 'en', config: {} });
    rows.push({ device: d.name, seed, wall: (Date.now() - t0) / 1000, logical: `${out.W}×${out.H}`, browser: s, headless: { session: h.T, stars: h.stars, rounds: h.rounds.length, corrects: h.corrects, wrongs: h.wrongs, misses: h.misses, hints: h.hints, chapters: h.chapters.map(c => +(+c.d).toFixed(1)) }, errors });
    console.log(d.name, seed, `wall ${((Date.now() - t0) / 1000).toFixed(0)} s`, 'browser', JSON.stringify(s), '| headless', h.T && h.T.toFixed(1), h.stars, errors.slice(0, 2).join(' | '));
    await ctx.close();
  }
  await browser.close(); srv.close();
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', `browser_age${age}.json`), JSON.stringify(rows, null, 1));
})();
