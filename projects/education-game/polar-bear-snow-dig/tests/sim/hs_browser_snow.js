#!/usr/bin/env node
// Nuka's Snow Dig — the REAL page in Playwright with the built-in bot (?speed=N&bot=1&autostart=1&mute=1): full sessions per
// age × viewport, every world event + every line main.js hands to NK.Voice.say (world clock), then per session: chapter / round
// times, rub vs tap digs, the rub demo + the 'rub' / 'slide' / 'fly' lines (requested, and what was waiting / speaking),
// errors, slow frames. --shots: a speed-1 pass of the first round on an iPhone portrait + iPad landscape that saves screenshots
// of the rub demo, the float to the aurora and the belly-slide (tests/sim/out/shots/).
//   node tests/sim/hs_browser_snow.js [--ages 3,4,5,7] [--sessions 2] [--speed 8] [--shots]
'use strict';
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const serve = require('../e2e/serve');
const args = process.argv.slice(2), get = (k, d) => { const i = args.indexOf('--' + k); return i >= 0 ? args[i + 1] : d; };
const AGES = get('ages', '3,4,5,7').split(',').map(Number), SESS = +get('sessions', 2), SPEED = +get('speed', 8), SHOTS = args.includes('--shots');
const VPS = [{ name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 }, { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 }];
const OUT = path.join(__dirname, 'out');

// installed before any game script: wraps World.prototype._emit and Voice.say as soon as they exist
const INIT = () => {
  window.__ev = []; window.__lines = [];
  let nk;
  const patch = () => {
    if (nk && nk.World && !nk.World.prototype.__w) {
      const P = nk.World.prototype, e0 = P._emit; P.__w = 1;
      P._emit = function (e) { window.__ev.push(Object.assign({ t: +this.time.toFixed(3) }, { type: e.type, id: e.id, rub: e.rub, again: e.again, assist: e.assist, round: e.round, level: e.level, stars: e.stars, dist: e.dist, steps: e.steps, mode: e.mode, first: e.first })); return e0.call(this, e); };
    }
    if (nk && nk.Voice && nk.Voice.say && !nk.Voice.__w) {
      const V = nk.Voice, s0 = V.say.bind(V); V.__w = 1;
      V.say = (text, o) => { const w = nk.debug && nk.debug.world; window.__lines.push({ t: w ? +w.time.toFixed(3) : -1, text: String(text), interrupt: !!(o && o.interrupt), priority: !!(o && o.priority), after: (window.__ev[window.__ev.length - 1] || {}).type }); return s0(text, o); };
    }
  };
  Object.defineProperty(window, 'NK', { configurable: true, get() { return nk; }, set(v) { nk = v; patch(); setTimeout(patch, 0); } });
};

async function session(browser, srv, age, vp, lang, seed, speed) {
  const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: vp.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await page.addInitScript(INIT);
  const t0 = Date.now();
  await page.goto(`${srv.url}?speed=${speed}&bot=1&autostart=1&mute=1&age=${age}&lang=${lang}&seed=${seed}`);
  let ok = true;
  try { await page.waitForFunction(() => window.NK && NK.debug && NK.debug.mode === 'done', null, { timeout: 420000, polling: 500 }); } catch (e) { ok = false; }
  const r = await page.evaluate(() => {
    const I = NK.I18N, lang = NK.debug.getState().settings.lang || 'en';
    const raw = k => { try { const v = I.raw ? I.raw(lang, k) : null; return Array.isArray(v) ? v : v ? [v] : []; } catch (e) { return []; } };
    const sets = { rub: raw('rub'), slide: raw('slide'), fly: raw('fly'), great: raw('great'), praise: raw('praise') };
    const kind = txt => { for (const k in sets) if (sets[k].some(s => s && txt.replace(/\s+/g, ' ').indexOf(String(s).replace(/\{child\}/g, '').replace(/\s+/g, ' ').trim().slice(0, 12)) >= 0)) return k; return ''; };
    const ev = window.__ev, lines = window.__lines.map(l => Object.assign(l, { kind: kind(l.text) }));
    const ch = [], rd = []; let c0 = 0, r0 = 0;
    for (const e of ev) {
      if (e.type === 'level') c0 = e.t;
      if (e.type === 'round') r0 = e.t;
      if (e.type === 'roundDone') rd.push(+(e.t - r0).toFixed(1));
      if (e.type === 'levelDone') ch.push(+(e.t - c0).toFixed(1));
    }
    const firstAsk = ev.find(e => e.type === 'ask'), demo = ev.find(e => e.type === 'rubDemo');
    const digs = ev.filter(e => e.type === 'dig' && !e.again);
    const stats = NK.debug.stats;
    return { lang, session: +NK.debug.world.time.toFixed(1), chapters: ch, rounds: rd, roundMax: Math.max(0, ...rd), stars: NK.debug.world.stars,
      digs: digs.length, rubDigs: digs.filter(e => e.rub).length, assists: digs.filter(e => e.assist).length,
      wrong: ev.filter(e => e.type === 'wrong').length, hints: ev.filter(e => e.type === 'hint').length,
      rubDemo: demo ? +(demo.t - firstAsk.t).toFixed(2) : null, slides: ev.filter(e => e.type === 'slide').length, hops: ev.filter(e => e.type === 'hop').length,
      linesRub: lines.filter(l => l.kind === 'rub').map(l => ({ t: +(l.t - (firstAsk ? firstAsk.t : 0)).toFixed(2), after: l.after })),
      linesSlide: lines.filter(l => l.kind === 'slide').length, linesFly: lines.filter(l => l.kind === 'fly').length,
      lines: lines.length, perMin: +(lines.length / (NK.debug.world.time / 60)).toFixed(1), interrupts: lines.filter(l => l.interrupt).length,
      broken: lines.filter(l => /undefined|null|NaN|\{|\}|\[object|^\s*$/.test(l.text)).map(l => l.text).slice(0, 5),
      frames: stats.frames, slowFrames: stats.slowFrames };
  });
  Object.assign(r, { age, vp: vp.name, ok, errors: errors.slice(0, 3), wall: +((Date.now() - t0) / 1000).toFixed(0) });
  await ctx.close();
  return r;
}

async function shots(browser, srv) {
  const dir = path.join(OUT, 'shots'); fs.mkdirSync(dir, { recursive: true });
  const res = [];
  for (const vp of VPS.slice(0, 2)) {
    const ctx = await browser.newContext({ viewport: vp.viewport, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await page.addInitScript(INIT);
    await page.goto(`${srv.url}?speed=1&bot=1&autostart=1&mute=1&age=4&lang=en&seed=21`);
    const want = { rubDemo: 1.6, hop: 0.45, slide: 0.75 }, got = {};
    const tEnd = Date.now() + 60000;
    while (Date.now() < tEnd && Object.keys(got).length < 3) {
      const ev = await page.evaluate(() => window.__ev.slice(-80).map(e => [e.type, e.t]));
      const now = await page.evaluate(() => NK.debug.world.time);
      for (const k in want) if (!got[k]) { const e = ev.find(x => x[0] === k); if (e && now >= e[1] + want[k]) { got[k] = now - e[1]; await page.screenshot({ path: path.join(dir, `${vp.name}_${k}.png`) }); } }
      await page.waitForTimeout(40);
    }
    res.push({ vp: vp.name, got });
    await ctx.close();
  }
  return res;
}

(async () => {
  const srv = await serve(), browser = await chromium.launch(), res = [];
  if (SHOTS) { console.log(JSON.stringify(await shots(browser, srv))); }
  else for (const age of AGES) for (let s = 0; s < SESS; s++) {
    const r = await session(browser, srv, age, VPS[s % VPS.length], s % 2 ? 'vi' : 'en', 31 + s * 7 + age, SPEED);
    res.push(r); console.log(JSON.stringify(r));
  }
  await browser.close(); srv.close();
  fs.mkdirSync(OUT, { recursive: true });
  if (!SHOTS) fs.writeFileSync(path.join(OUT, 'hs_browser_snow.json'), JSON.stringify(res, null, 1));
  process.exit(0);
})();
