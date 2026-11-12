// Shared helpers for the independent functional QA scripts (tests/qa/*). Real CDP touch input on isMobile/hasTouch contexts.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'qa'); fs.mkdirSync(OUT, { recursive: true });

const DEVICES = {
  ipp: { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  ipl: { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  padp: { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  padl: { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
};

// instrumentation: every line sent to the voice, every world event (deep-copied), live invariant sampler
const INIT = () => {
  window.__said = []; window.__ev = []; window.__inv = [];
  const FP = window.FP = window.FP || {};
  let voice;
  Object.defineProperty(FP, 'Voice', { configurable: true, get: () => voice, set: v => {
    voice = v;
    if (v && v.say && !v.say.__wrapped) { const o = v.say; v.say = function (text, opts) { window.__said.push({ text: String(text), opts: opts ? { interrupt: !!opts.interrupt, priority: !!opts.priority } : {}, lang: v._lang, wt: FP.debug && FP.debug.world ? FP.debug.world.time : 0, st: FP.debug && FP.debug.world ? FP.debug.world.state + '/' + FP.debug.world.phase : '' }); return o.apply(this, arguments); }; v.say.__wrapped = true; }
  } });
  window.__hook = () => {
    const w = FP.debug.world;
    if (!w || w.__qa) return;
    w.__qa = true;
    const o = w._emit;
    w._emit = function (e) { const c = {}; for (const k in e) { const v = e[k]; try { c[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; } catch (er) { c[k] = '?'; } } c._t = w.time; c._st = w.state + '/' + w.phase; window.__ev.push(c); if (window.__ev.length > 20000) window.__ev.splice(0, 5000); return o.call(this, e); };
    const ou = w.update;
    let lastKey = '', since = 0, lastStars = 0, maxStuck = 0, stuckAt = '';
    w.update = function (dt) {
      const r = ou.call(this, dt);
      const k = this.state + '/' + this.phase + '/' + this.level + '/' + this.round;
      if (k === lastKey) since += dt; else { lastKey = k; since = 0; }
      const lim = this.state === 'menu' || this.state === 'sessionDone' || (this.state === 'round' && this.phase === 'play') ? 1e9 : 60;
      if (since > lim) window.__inv.push('stuck ' + k + ' ' + since.toFixed(1));
      if (since > maxStuck && this.state !== 'sessionDone') { maxStuck = since; stuckAt = k; }
      window.__maxStuck = { t: maxStuck, at: stuckAt };
      if (this.stars < lastStars && this.state !== 'menu' && this.state !== 'intro') window.__inv.push(`stars down ${lastStars}→${this.stars} at ${k}`);
      lastStars = this.stars;
      for (const m of this.members) for (const f of ['x', 'y', 'cx', 'cy', 'rot', 'sx', 'sy', 'scale', 'bob']) if (m[f] !== undefined && !isFinite(m[f])) { window.__inv.push(`NaN ${m.id}.${f} at ${k}`); break; }
      if (this.state === 'round' && this.members.length && this.phase === 'play') {
        const odd = this.members.filter(m => m.odd).length;
        if (odd !== 1) window.__inv.push(`odd count ${odd} at ${k}`);
      }
      if (window.__inv.length > 200) window.__inv.length = 200;
      return r;
    };
  };
};

const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
const touch = (cdp, type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts || [] });
async function tap(cdp, page, p, hold = 70) { await touch(cdp, 'touchStart', [tp(p.x, p.y)]); await page.waitForTimeout(hold); await touch(cdp, 'touchEnd'); }
async function swipe(cdp, page, a, b, { n = 10, ms = 150 } = {}) {
  await touch(cdp, 'touchStart', [tp(a.x, a.y)]);
  for (let i = 1; i <= n; i++) { const u = i / n; await touch(cdp, 'touchMove', [tp(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u)]); await page.waitForTimeout(ms / n); }
  await touch(cdp, 'touchEnd');
}
async function newPage(browser, d, errors) {
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}
async function gotoTitle(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.FP && FP.debug && FP.debug.mode === 'title' && FP.debug.world, null, { timeout: 20000 });
  await page.evaluate(() => window.__hook());
  await page.waitForTimeout(200);
}
const READY = () => { const w = FP.debug.world, a = FP.debug.answer(); return w.interactive && a && a.member != null && w.members.every(m => m.state === 'stand' && !m.walking); };
async function waitReady(page, timeout = 30000) {
  await page.evaluate(() => FP.debug.setSpeed(4));
  await page.waitForFunction(READY, null, { timeout, polling: 'raf' });
  await page.evaluate(() => FP.debug.setSpeed(1));
  await page.waitForTimeout(200);
}
async function setupRound(page, url, { topic = 'colors', age = 4, seed = 3, lang = 'en', level = 0, extra = '' } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}&lang=${lang}${extra}`);
  await page.evaluate(([t, lv]) => { FP.debug.startGame(); const w = FP.debug.world; w.levels[lv] = t; w.startLevel(lv); }, [topic, level]);
  await waitReady(page);
}
async function info(page) {
  return page.evaluate(() => {
    const w = FP.debug.world, a = FP.debug.answer();
    const st = w.members.filter(m => m.state === 'stand');
    return { a: a && a.member, at: a && a.member != null ? FP.debug.memberScreen(a.member) : null, others: st.filter(m => !a || m.id !== a.member).map(m => ({ id: m.id, at: FP.debug.memberScreen(m.id) })), misses: w.misses, n: w.members.length };
  });
}
const evLen = page => page.evaluate(() => window.__ev.length);
const evSince = (page, n) => page.evaluate(n0 => window.__ev.slice(n0), n);
const saidLen = page => page.evaluate(() => window.__said.length);
const saidSince = (page, n) => page.evaluate(n0 => window.__said.slice(n0), n);
async function setSpeed(page, s) { await page.evaluate(v => FP.debug.setSpeed(v), s); }
async function waitPhase(page, fn, arg, timeout = 30000) { await page.waitForFunction(fn, arg, { timeout, polling: 'raf' }); }
async function shot(page, name) { try { await page.screenshot({ path: path.join(OUT, name + '.png') }); } catch (e) { /* */ } }
async function rotate(page, d) { const v = page.viewportSize(); await page.setViewportSize({ width: v.height, height: v.width }); await page.waitForTimeout(500); }
async function outside(page) {
  return page.evaluate(() => {
    const w = FP.debug.world, v = FP.debug.view(), out = [];
    for (const m of w.members) {
      if (!['stand', 'stage', 'hop', 'enter'].includes(m.state)) continue;
      if (m.state === 'enter' && m.walking) continue;
      const p = FP.debug.toScreen(m.cx, m.cy), r = m.size * 0.4 * (m.scale || 1) * v.s;
      if (!isFinite(p.x) || !isFinite(p.y) || p.x - r < -1 || p.y - r < -1 || p.x + r > innerWidth + 1 || p.y + r > innerHeight + 1) out.push(`${m.id} ${m.state} at ${Math.round(p.x)},${Math.round(p.y)} r ${Math.round(r)}`);
    }
    return out;
  });
}
module.exports = { chromium, serve, OUT, DEVICES, tp, touch, tap, swipe, newPage, gotoTitle, waitReady, setupRound, info, evLen, evSince, saidLen, saidSince, setSpeed, waitPhase, shot, rotate, outside, path, fs };
