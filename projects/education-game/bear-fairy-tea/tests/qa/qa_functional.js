// QA functional suite (report-only) for Moka's Fairy Tea Party — goes beyond tests/e2e/functional.js.
// Every finger is a REAL CDP touch (Input.dispatchTouchEvent → pointer events → FT.Input → World) in isMobile + hasTouch
// contexts. Run: node tests/qa/qa_functional.js        (all)
//               ONLY=iphone-portrait node tests/qa/qa_functional.js   (device tests on one device, + global tests)
//               TESTS=hammer_wrong,idle_timing node tests/qa/qa_functional.js
//               SKIP_SESSIONS=1 node tests/qa/qa_functional.js
// Writes tests/out/qa/results.json + screenshots. Exit 1 on any failure.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'qa'); fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
];
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object|\b(ui|p|talk|topic|weather|right|wrong|surprise|critter|moka|count|name|idle|session|lantern|cheers|garland|enter|great|praise|hint)\.[a-z0-9]/i;
const TOPIC_AGE = { colors: 4, shapes: 4, size: 3, animals: 4, count: 4, letters: 5, lower: 6, initial: 6, add: 6, sub: 7, oddeven: 7 };

const results = [];
function record(device, test, ok, detail) {
  results.push({ device, test, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(16)} ${test}${ok ? '' : '  — ' + detail}`);
}
class Fail extends Error {}
const check = (c, m) => { if (!c) throw new Fail(m); };
/** soft checks: collect several problems in one test, fail at the end */
const soft = () => { const a = []; const f = (c, m) => { if (!c) a.push(m); }; f.list = a; f.done = () => check(a.length === 0, a.join(' || ')); return f; };

/* ---------------------------------------------------------------- page instrumentation */
const INIT = () => {
  window.__asks = []; window.__said = []; window.__ev = []; window.__bubble = []; window.__synth = { speak: 0, cancel: 0, log: [] };
  const FT = window.FT = window.FT || {};
  // a fake speechSynthesis (only with ?fakesynth=1): "speaks" for 70 ms per char, records speak / cancel — so pause /
  // visibility tests can prove speech stops (headless Chromium has no voices)
  if (/[?&]fakesynth=1/.test(location.search)) {
    let cur = null, q = [], tmr = 0;
    const S = window.__synth;
    const next = () => {
      if (cur || !q.length) return;
      cur = q.shift();
      S.log.push({ t: performance.now(), text: cur.text });
      setTimeout(() => cur && cur.onstart && cur.onstart({}), 5);
      const u = cur; tmr = setTimeout(() => { if (cur === u) { cur = null; u.onend && u.onend({}); next(); } }, Math.max(300, 70 * u.text.length));
    };
    const fake = {
      get speaking() { return !!cur; }, get pending() { return q.length > 0; }, paused: false,
      speak(u) { S.speak++; q.push(u); next(); }, cancel() { S.cancel++; const c = cur; cur = null; q = []; clearTimeout(tmr); if (c && c.onend) c.onend({}); },
      pause() {}, resume() {},
      getVoices: () => [{ name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 's' }, { name: 'Linh', lang: 'vi-VN', localService: true, default: false, voiceURI: 'l' }],
      addEventListener() {}, removeEventListener() {}, onvoiceschanged: null
    };
    class FakeU { constructor(t) { this.text = t; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; this.voice = null; } }
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: fake });
    window.SpeechSynthesisUtterance = FakeU;
  }
  let i18n, voice, ui;
  Object.defineProperty(FT, 'I18N', { configurable: true, get: () => i18n, set: v => {
    i18n = v;
    if (v && v.ask && !v.ask.__w) { const o = v.ask; v.ask = function (lang, key) { const r = o.apply(this, arguments); window.__asks.push({ lang, key, text: r }); return r; }; v.ask.__w = true; }
  } });
  Object.defineProperty(FT, 'Voice', { configurable: true, get: () => voice, set: v => {
    voice = v;
    if (v && v.say && !v.say.__w) { const o = v.say; v.say = function (text, opts) { window.__said.push({ text: String(text), lang: (opts && opts.lang) || v._lang, t: performance.now(), wt: FT.debug && FT.debug.world ? FT.debug.world.time : 0 }); return o.apply(this, arguments); }; v.say.__w = true; }
  } });
  Object.defineProperty(FT, 'UI', { configurable: true, get: () => ui, set: v => {
    ui = v;
    if (v && v.say && !v.say.__w) {
      const o = v.say;
      v.say = function (text) {
        const r = o.apply(this, arguments);
        if (text) {
          const b = document.getElementById('bubble'), t = document.getElementById('bubbleText'), R = this._bubbleRect;
          window.__bubble.push({ text: String(text), over: R ? Math.round(b.offsetHeight - R.h) : 0, hOver: Math.round(t.scrollWidth - t.clientWidth),
            fs: parseFloat(t.style.fontSize), right: Math.round(b.getBoundingClientRect().right - innerWidth), bottom: Math.round(b.getBoundingClientRect().bottom - innerHeight) });
        }
        return r;
      };
      v.say.__w = true;
    }
  } });
  window.__qa = {
    hook() {
      const w = FT.debug.world;
      if (!w || w.__qa) return;
      const o = w._emit; w.__qa = true;
      w._emit = function (e) { const c = {}; for (const k in e) { const v = e[k]; c[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; } c._t = w.time; window.__ev.push(c); return o.call(this, e); };
    },
    toL(x, y) { const v = FT.debug.view(); return { x: (x - v.left) / v.s, y: (y - v.top) / v.s }; },
    softPoint(noCritter = true) {
      const w = FT.debug.world, L = w.layout;
      const inBox = (b, x, y, p = 0) => x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p;
      const cands = [];
      for (let gx = 0.04; gx < 0.97; gx += 0.025) for (let gy = 0.08; gy < 0.95; gy += 0.025) {
        const cx = innerWidth * gx, cy = innerHeight * gy, p = this.toL(cx, cy);
        if (p.x < 20 || p.y < 20 || p.x > L.W - 20 || p.y > L.groundY - 10) continue;
        const el = document.elementFromPoint(cx, cy); if (!el || el.id !== 'game') continue;
        if (inBox(L.mokaBox, p.x, p.y, 30)) continue;
        if (w.members.some(m => m.state !== 'gone' && m.state !== 'lantern' && Math.hypot(p.x - m.cx, p.y - m.cy) < w._hitR(m) + 40)) continue;
        if (!w._clearOfKeep(p.x, p.y, 48)) continue;
        const c = w.critterHit(); if (c && Math.hypot(p.x - c.x, p.y - c.y) < c.r + 60) continue;
        if (noCritter && w.critter) continue;
        cands.push({ x: Math.round(cx), y: Math.round(cy), lx: p.x, ly: p.y, band: inBox(L.band, p.x, p.y) });
      }
      const ty = L.table.y - L.item * 1.6;
      cands.sort((a, b) => Math.abs(a.ly - ty) - Math.abs(b.ly - ty));
      return cands;
    },
    outside() {
      const w = FT.debug.world, v = FT.debug.view(), out = [];
      for (const m of w.members) {
        if (!['sit', 'rise', 'fall'].includes(m.state)) continue;
        if (![m.x, m.y, m.cx, m.cy].every(Number.isFinite)) { out.push(m.id + ' NaN'); continue; }
        if (m.state === 'fall') continue;
        const p = FT.debug.toScreen(m.cx, m.cy), r = m.size * 0.4 * (m.scale || 1) * v.s;
        if (p.x - r < -1 || p.y - r < -1 || p.x + r > innerWidth + 1 || p.y + r > innerHeight + 1) out.push(`${m.id} ${m.state} at ${Math.round(p.x)},${Math.round(p.y)} r ${Math.round(r)}`);
      }
      return out;
    }
  };
};

/* ---------------------------------------------------------------- touch helpers */
const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
const touchStart = (cdp, pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
const touchMove = (cdp, pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts });
const touchEnd = (cdp, pts = []) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts });
const touchCancel = cdp => cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
async function tap(cdp, page, p, hold = 70) { await touchStart(cdp, [tp(p.x, p.y)]); if (hold) await page.waitForTimeout(hold); await touchEnd(cdp); }
async function tapEl(page, sel) {
  let b = null;
  for (let k = 0; k < 12; k++) {
    const b1 = await page.locator(sel).first().boundingBox();
    await page.waitForTimeout(60);
    b = await page.locator(sel).first().boundingBox();
    if (b1 && b && Math.abs(b1.x - b.x) < 0.5 && Math.abs(b1.y - b.y) < 0.5) break;
  }
  check(b, 'element not visible: ' + sel);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
const evLen = page => page.evaluate(() => window.__ev.length);
const evSince = (page, n0) => page.evaluate(n => window.__ev.slice(n), n0);
const waitEv = (page, n0, type, timeout = 20000) => page.waitForFunction(([n, t]) => window.__ev.slice(n).some(e => e.type === t), [n0, type], { timeout, polling: 'raf' });
const types = evs => evs.map(e => e.type + (e.id ? ':' + e.id : '')).join(',');
const visible = (page, id) => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);
const judged = evs => evs.filter(e => ['right', 'wrong', 'wiggle', 'assist'].includes(e.type) && !(e.type === 'wiggle' && e.early));

async function newPage(browser, d, errors) {
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  page.on('crash', () => errors.push('PAGE CRASH'));
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}
async function gotoTitle(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.FT && FT.debug && FT.debug.mode === 'title' && FT.debug.world, null, { timeout: 20000 });
  await page.evaluate(() => window.__qa.hook());
  await page.waitForTimeout(200);
}
const READY = () => { const w = FT.debug.world, a = FT.debug.answer(); return w.interactive && a && a.member != null && w.members.every(m => m.state === 'sit') && !(w.members.some(m => m._jumpT >= 0)); };
async function waitAsk(page, timeout = 30000) {
  await page.evaluate(() => FT.debug.setSpeed(4));
  await page.waitForFunction(READY, null, { timeout, polling: 'raf' });
  await page.evaluate(() => FT.debug.setSpeed(1));
  await page.waitForTimeout(200);
}
async function setupRound(page, url, { topic = 'colors', age = 4, seed = 3, lang = 'en', level = 0, prep = null, extra = '' } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}&lang=${lang}${extra}`);
  await page.evaluate(([t, lv, prep]) => {
    FT.debug.startGame(); const w = FT.debug.world; if (t) w.levels[lv] = t; w.startLevel(lv);
    if (prep) (new Function('w', prep))(w);
  }, [topic, level, prep]);
  await waitAsk(page);
}
async function info(page) {
  return page.evaluate(() => {
    const w = FT.debug.world, a = FT.debug.answer();
    const st = w.members.filter(m => m.state === 'sit');
    return { a: a.member, at: FT.debug.memberScreen(a.member), others: st.filter(m => m.id !== a.member).map(m => ({ id: m.id, at: FT.debug.memberScreen(m.id) })), misses: w.misses, n: w.members.length, round: w.round };
  });
}
async function nextAsk(page, n0, timeout = 40000) {   // after a right answer: speed through rise / chime / clear to the next open question
  await page.evaluate(() => FT.debug.setSpeed(4));
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'ask' || e.type === 'talk'), n0, { timeout, polling: 'raf' });
  const t = await page.evaluate(n => window.__ev.slice(n).some(e => e.type === 'talk'), n0);
  if (t) { await page.evaluate(() => FT.debug.setSpeed(1)); return 'talk'; }
  await waitAsk(page);
  return 'ask';
}
async function shot(page, d, name) { try { await page.screenshot({ path: path.join(OUT, `${d.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
async function rotate(page, d, back = false) {
  const v = back ? d.viewport : { width: d.viewport.height, height: d.viewport.width };
  await page.setViewportSize(v);
  await page.waitForTimeout(450);
}
async function openTalk(page, topic) {   // jump straight to Talk time of the current chapter (world._startTalk)
  await page.evaluate(t => { const w = FT.debug.world; if (t) { w.topic = t; w.levels[w.level] = t; } w._startTalk(); }, topic);
  await page.waitForFunction(() => FT.debug.mode === 'talk' && !document.getElementById('scrTalk').classList.contains('hidden'), null, { timeout: 5000 });
  await page.waitForTimeout(250);
  await page.waitForFunction(() => FT.debug.world.talkOpen(), null, { timeout: 5000 });   // Talk choices answer after talkLock 1 s
}

/* ================================================================ per-device tests */
const T = {};

/** the first chapter at the default age (4) is trivially easy: colours, 3 things, one object in two clash-free colours */
T.warmup_easy = async ({ page, url, d }) => {
  const f = soft();
  for (const seed of [1, 2, 3, 4, 5, 6]) {
    await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
    await gotoTitle(page, `${url}?mute=1&seed=${seed}`);
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => FT.debug.mode === 'play', null, { timeout: 5000 });
    await waitAsk(page);
    const s = await page.evaluate(() => {
      const w = FT.debug.world, c = w.cur;
      return { age: w.age, level: w.level, topic: w.topic, round: w.round, n: w.members.length, odd: w.members.filter(m => m.odd).length,
        objs: [...new Set(w.members.map(m => m.thing.kind + ':' + (m.thing.obj || m.thing.value || m.thing.animal || '')))], cols: [...new Set(w.members.map(m => m.thing.color))],
        hit: w.members.map(m => ({ r: w._hitR(m), size: m.size })), cssR: w.members.map(m => FT.debug.memberScreen(m.id).r), prompt: document.getElementById('bubbleText').textContent };
    });
    f(s.age === 4 && s.level === 0 && s.round === 0, `seed ${seed}: not age 4 / ch 0 / round 0: ` + JSON.stringify(s));
    f(s.topic === 'colors', `seed ${seed}: first chapter at age 4 is "${s.topic}", not colours`);
    f(s.n === 3 && s.odd === 1, `seed ${seed}: warm-up has ${s.n} things, ${s.odd} odd`);
    f(s.objs.length === 1 && s.cols.length === 2, `seed ${seed}: warm-up is not one object in two colours: ${JSON.stringify(s.objs)} ${JSON.stringify(s.cols)}`);
    f(s.hit.every(h => h.r >= 0.6 * h.size + 14 - 0.5), `seed ${seed}: hit radius < 0.6 × size + 14: ` + JSON.stringify(s.hit));
    f(s.cssR.every(r => r * 2 >= 60), `seed ${seed}: hit circle diameter on screen < 60 CSS px: ` + s.cssR.map(Math.round).join(','));
    f(s.prompt && !RAW.test(s.prompt), `seed ${seed}: prompt text ${s.prompt}`);
  }
  // round sizes of the first chapter (age 4): 3 3 4 4
  const ns = [];
  await page.evaluate(() => { FT.debug.setBot(true, 1); FT.debug.setSpeed(8); });
  for (let r = 0; r < 4; r++) {
    await page.waitForFunction(rr => { const w = FT.debug.world; return (w.state === 'round' && w.round === rr && w.phase === 'play') || w.state === 'talk'; }, r, { timeout: 60000, polling: 'raf' });
    ns.push(await page.evaluate(() => FT.debug.world.state === 'talk' ? 'T' : FT.debug.world.members.length));
  }
  await page.evaluate(() => FT.debug.setBot(false));
  f(ns.join(',') === '3,3,4,4', 'first-chapter round sizes at age 4: ' + ns.join(','));
  f.done();
};

/** a press that moves < 24 CSS px is still a tap (thing judged on contact; Moka poke on release < 24 CSS px; ≥ 24 no poke) */
T.tap_jitter = async ({ page, cdp, url }) => {
  const f = soft();
  await setupRound(page, url, { seed: 21 });
  let i = await info(page);
  let n0 = await evLen(page);
  await touchStart(cdp, [tp(i.at.x, i.at.y)]);
  for (const k of [1, 2, 3]) { await page.waitForTimeout(20); await touchMove(cdp, [tp(i.at.x + 6 * k, i.at.y - 2 * k)]); }
  await touchEnd(cdp, []);
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  f(evs.filter(e => e.type === 'right').length === 1 && !evs.some(e => e.type === 'wrong'), 'jittery tap (18 px) on the odd one: ' + types(evs));
  // Moka: 18 px wobble → poke; 40 px slide → no poke
  await nextAsk(page, n0);
  const mb = await page.evaluate(() => FT.debug.mokaScreen());
  const v = await page.evaluate(() => FT.debug.view().s);   // CSS px per logical px (the 24 px threshold is in CSS px since P3-3)
  n0 = await evLen(page);
  await touchStart(cdp, [tp(mb.cx, mb.cy)]);
  for (const k of [1, 2, 3]) { await page.waitForTimeout(20); await touchMove(cdp, [tp(mb.cx + 5 * k * v, mb.cy + 2 * k * v)]); }
  await touchEnd(cdp);
  await page.waitForTimeout(250);
  evs = await evSince(page, n0);
  f(evs.some(e => e.type === 'pokeMoka'), 'Moka tap with an 18 logical-px wobble did not poke: ' + types(evs));
  f(!evs.some(e => ['soft', 'wrong', 'right'].includes(e.type)), 'Moka wobble tap judged / softed: ' + types(evs));
  n0 = await evLen(page);
  await touchStart(cdp, [tp(mb.cx, mb.cy)]);
  for (const k of [1, 2, 3, 4]) { await page.waitForTimeout(20); await touchMove(cdp, [tp(mb.cx, mb.cy - 12 * k * v)]); }
  await touchEnd(cdp);
  await page.waitForTimeout(250);
  evs = await evSince(page, n0);
  f(!evs.some(e => e.type === 'pokeMoka'), 'a 48 px slide off Moka still poked: ' + types(evs));
  // P3-3: a 20 CSS-px wobble (≈ 37 logical px on an iPhone) is still a tap
  n0 = await evLen(page);
  await touchStart(cdp, [tp(mb.cx, mb.cy)]);
  for (const k of [1, 2, 3, 4]) { await page.waitForTimeout(20); await touchMove(cdp, [tp(mb.cx + 5 * k, mb.cy)]); }
  await touchEnd(cdp);
  await page.waitForTimeout(250);
  evs = await evSince(page, n0);
  f(evs.some(e => e.type === 'pokeMoka'), 'Moka tap with a 20 CSS-px wobble did not poke: ' + types(evs));
  const n48 = await evLen(page);
  await touchStart(cdp, [tp(mb.cx, mb.cy)]);
  for (const k of [1, 2, 3, 4]) { await page.waitForTimeout(20); await touchMove(cdp, [tp(mb.cx, mb.cy - 8 * k)]); }
  await touchEnd(cdp);
  await page.waitForTimeout(250);
  f(!(await evSince(page, n48)).some(e => e.type === 'pokeMoka'), 'a 32 CSS-px slide off Moka still poked');
  f(await page.evaluate(() => FT.debug.world.misses) === 0, 'misses after Moka taps');
  f.done();
};

/** a press on empty space then sliding onto a thing within 0.25 s counts; after 0.25 s it does not */
T.slide_window = async ({ page, cdp, url }) => {
  const f = soft();
  await setupRound(page, url, { seed: 22 });
  let i = await info(page);
  const pick = async target => page.evaluate(t => {   // an empty point whose straight path to the target crosses no other thing
    const w = FT.debug.world, L = w.layout, c = window.__qa.softPoint(), v = FT.debug.view();
    const tl = window.__qa.toL(t.x, t.y);
    const seg = (ax, ay, bx, by, px, py) => { const dx = bx - ax, dy = by - ay, u = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy))); return Math.hypot(ax + u * dx - px, ay + u * dy - py); };
    const ok = c.filter(p => w.members.every(m => m.state !== 'sit' || Math.hypot(m.cx - tl.x, m.cy - tl.y) < 2 || seg(p.lx, p.ly, tl.x, tl.y, m.cx, m.cy) > w._hitR(m) + 10));
    ok.sort((a, b) => Math.hypot(a.lx - tl.x, a.ly - tl.y) - Math.hypot(b.lx - tl.x, b.ly - tl.y));
    return ok[0] || null;
  }, target);
  let a = await pick(i.at);
  check(a, 'no clear start point for a slide');
  await page.evaluate(() => FT.debug.setSpeed(0.2));   // world time runs at 1/5 speed: the quick slide has slack under CPU load
  let n0 = await evLen(page);
  await touchStart(cdp, [tp(a.x, a.y)]);
  for (let k = 1; k <= 5; k++) { await page.waitForTimeout(12); await touchMove(cdp, [tp(a.x + (i.at.x - a.x) * k / 5, a.y + (i.at.y - a.y) * k / 5)]); }
  await touchEnd(cdp);
  await page.evaluate(() => FT.debug.setSpeed(1));
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  f(evs.some(e => e.type === 'right' && e.id === i.a), 'quick slide from empty space onto the odd one: ' + types(evs));
  f(!evs.some(e => e.type === 'wrong'), 'quick slide judged a wrong thing: ' + types(evs));
  if (!evs.some(e => e.type === 'right')) { const j = await info(page); await tap(cdp, page, j.at); }
  await nextAsk(page, n0);
  i = await info(page);
  a = await pick(i.at);
  check(a, 'no clear start point for the late slide');
  n0 = await evLen(page);
  await touchStart(cdp, [tp(a.x, a.y)]);
  await page.waitForTimeout(650);   // > 0.25 s world time at speed 1
  for (let k = 1; k <= 5; k++) { await page.waitForTimeout(12); await touchMove(cdp, [tp(a.x + (i.at.x - a.x) * k / 5, a.y + (i.at.y - a.y) * k / 5)]); }
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  evs = await evSince(page, n0);
  f(!evs.some(e => e.type === 'right' || e.type === 'wrong'), 'a slide that started 0.65 s after the press was judged: ' + types(evs));
  f(evs.some(e => e.type === 'soft'), 'late slide: the press on empty space gave no soft sparkle: ' + types(evs));
  f.done();
};

/** a second finger never answers (resting finger on the moss / on a wrong thing; two fingers in ONE touchstart) */
T.two_fingers = async ({ page, cdp, url }) => {
  const f = soft();
  await setupRound(page, url, { seed: 23, age: 5 });
  let i = await info(page);
  const sp = (await page.evaluate(() => window.__qa.softPoint()))[0];
  check(sp, 'no soft point');
  // (a) finger 1 rests on the moss, finger 2 taps the odd one, then finger 1 lifts
  let n0 = await evLen(page);
  await touchStart(cdp, [tp(sp.x, sp.y, 1)]);
  await page.waitForTimeout(120);
  await touchStart(cdp, [tp(sp.x, sp.y, 1), tp(i.at.x, i.at.y, 2)]);
  await page.waitForTimeout(80);
  await touchEnd(cdp, [tp(sp.x, sp.y, 1)]);   // finger 2 up
  await page.waitForTimeout(60);
  await touchEnd(cdp, []);
  await page.waitForTimeout(250);
  let evs = await evSince(page, n0);
  f(!evs.some(e => e.type === 'right'), '(a) second finger on the odd one answered: ' + types(evs));
  // (b) finger 1 on a wrong thing (held), finger 2 on the odd one
  n0 = await evLen(page);
  await touchStart(cdp, [tp(i.others[0].at.x, i.others[0].at.y, 1)]);
  await page.waitForTimeout(100);
  await touchStart(cdp, [tp(i.others[0].at.x, i.others[0].at.y, 1), tp(i.at.x, i.at.y, 2)]);
  await page.waitForTimeout(80);
  await touchMove(cdp, [tp(i.others[0].at.x + 3, i.others[0].at.y, 1), tp(i.at.x + 3, i.at.y, 2)]);
  await touchEnd(cdp, []);
  await page.waitForTimeout(250);
  evs = await evSince(page, n0);
  f(evs.filter(e => e.type === 'wrong').length === 1 && !evs.some(e => e.type === 'right'), '(b) finger 1 on a wrong thing + finger 2 on the odd one: ' + types(evs));
  // (c) two fingers landing in the same touchstart (palm): moss first, odd one second
  await page.waitForTimeout(1200);
  n0 = await evLen(page);
  await touchStart(cdp, [tp(sp.x, sp.y, 1), tp(i.at.x, i.at.y, 2)]);
  await page.waitForTimeout(80);
  await touchEnd(cdp, []);
  await page.waitForTimeout(250);
  evs = await evSince(page, n0);
  f(evs.filter(e => e.type === 'right').length === 0, '(c) two fingers in one touchstart: the second answered: ' + types(evs));
  // (d) input not stuck: a normal tap works
  n0 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(250);
  evs = await evSince(page, n0);
  f(evs.some(e => e.type === 'right'), '(d) a normal tap after the two-finger presses did not answer: ' + types(evs));
  f.done();
};

/** six rapid taps on the odd one (and on it while it rises): one right, one lantern, 3★, round completes */
T.rapid_right = async ({ page, cdp, url }) => {
  const f = soft();
  await setupRound(page, url, { seed: 24 });
  const i = await info(page);
  const n0 = await evLen(page);
  for (let k = 0; k < 6; k++) { await touchStart(cdp, [tp(i.at.x, i.at.y)]); await page.waitForTimeout(15); await touchEnd(cdp); await page.waitForTimeout(25); }
  // taps on the rising thing wherever it is now
  for (let k = 0; k < 6; k++) {
    const p = await page.evaluate(id => FT.debug.memberScreen(id), i.a);
    if (p) { await touchStart(cdp, [tp(p.x, p.y)]); await page.waitForTimeout(15); await touchEnd(cdp); }
    await page.waitForTimeout(120);
  }
  await page.evaluate(() => FT.debug.setSpeed(3));
  await waitEv(page, n0, 'roundDone');
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'round' || e.type === 'talk'), n0, { timeout: 30000, polling: 'raf' });
  await page.evaluate(() => FT.debug.setSpeed(1));
  const evs = await evSince(page, n0);
  const rd = evs.find(e => e.type === 'roundDone');
  f(evs.filter(e => e.type === 'right').length === 1, 'right events: ' + evs.filter(e => e.type === 'right').length);
  f(evs.filter(e => e.type === 'lantern').length === 1 && evs.filter(e => e.type === 'rise').length === 1, 'lantern / rise count: ' + types(evs));
  f(!evs.some(e => e.type === 'wrong'), 'a wrong during rapid right taps: ' + types(evs));
  f(rd && rd.stars === 3 && rd.misses === 0, 'round stars: ' + JSON.stringify(rd));
  f(evs.filter(e => e.type === 'chime').length === i.n - 1, 'chime count ' + evs.filter(e => e.type === 'chime').length + ' for ' + i.n);
  const lit = await page.evaluate(() => FT.debug.world.garland.lanterns.filter(q => q.lit > 0.5).length);
  f(lit === 1, 'lanterns lit after one round: ' + lit);
  f.done();
};

/** hammering one wrong thing 10× fast: no crash, 1 miss (same-thing window) — but does help (hint) ever come? */
T.hammer_wrong = async ({ page, cdp, url, d }) => {
  const f = soft();
  await setupRound(page, url, { seed: 25, age: 5, topic: 'colors' });
  let i = await info(page);
  check(i.others.length >= 2, 'need 2 other things');
  let n0 = await evLen(page);
  for (let k = 0; k < 10; k++) { await touchStart(cdp, [tp(i.others[0].at.x, i.others[0].at.y)]); await page.waitForTimeout(20); await touchEnd(cdp); await page.waitForTimeout(60); }
  await page.waitForTimeout(400);
  let evs = await evSince(page, n0);
  let s = await page.evaluate(() => { const w = FT.debug.world; return { m: w.misses, st: w.state, ph: w.phase, inter: w.interactive, ans: FT.debug.answer() }; });
  // the 1 s window counts from the last COUNTED miss (qa P2-1): counted misses are ≥ 1 s apart in world time, every other tap wiggles
  const W = evs.filter(e => e.type === 'wrong');
  f(s.m === W.length && s.m >= 1 && s.inter && s.ans, '10 fast taps on one wrong thing: ' + JSON.stringify(s));
  f(W.every((e, k) => k === 0 || e._t - W[k - 1]._t >= 1 - 1e-6), 'counted misses < 1 s apart: ' + W.map(e => e._t.toFixed(2)).join(','));
  f(W.length + evs.filter(e => e.type === 'wiggle' && e.repeat).length === 10, 'wrong/wiggle split: ' + types(evs));
  // a toddler keeps hammering the same wrong thing (every ~0.45 s world time) for ~10 s: help must come (hint glow; after
  // 10 s of play the assist, which then answers for the child on the next press in the table band — an assisted round ≤ 2★)
  await page.evaluate(() => FT.debug.setSpeed(0.5));   // half-speed world: every gap stays < 1 s world time even under CPU load
  const tw0 = await page.evaluate(() => FT.debug.world.time);
  for (let k = 0; k < 24; k++) {
    if (!(await page.evaluate(() => FT.debug.world.interactive))) break;
    await tap(cdp, page, i.others[0].at, 30); await page.waitForTimeout(380);
  }
  const tw1 = await page.evaluate(() => FT.debug.world.time);
  await page.evaluate(() => FT.debug.setSpeed(1));
  evs = await evSince(page, n0);
  s = await page.evaluate(() => ({ m: FT.debug.world.misses, noProg: FT.debug.world._noProg, inter: FT.debug.world.interactive }));
  f(evs.some(e => e.type === 'hint'), `hammering the same wrong thing for ${(tw1 - tw0).toFixed(1)} s world time never brought a hint (misses ${s.m}, noProg ${s.noProg}): ` + [...new Set(evs.map(e => e.type))].join(','));
  f(evs.some(e => e.type === 'assistArmed'), 'hammering past 10 s of play never armed the assist: ' + [...new Set(evs.map(e => e.type))].join(','));
  await shot(page, d, 'hammer-hint');
  if (s.inter) { const n1 = await evLen(page); await tap(cdp, page, i.at); await waitEv(page, n1, 'right'); }
  await page.evaluate(() => FT.debug.setSpeed(3));
  await waitEv(page, n0, 'roundDone');
  await page.evaluate(() => FT.debug.setSpeed(1));
  const all = await evSince(page, n0), rd = all.find(e => e.type === 'roundDone');
  f(rd && rd.stars === 1, 'stars after ≥ 2 misses: ' + JSON.stringify(rd));
  f.done();
};

/** taps on Moka, the bubble, the HUD never count as answers, misses or "no progress" */
T.non_answers = async ({ page, cdp, url }) => {
  const f = soft();
  await setupRound(page, url, { seed: 26 });
  const mb = await page.evaluate(() => FT.debug.mokaScreen());
  let n0 = await evLen(page);
  // 5 points in Moka's box (centre, 4 quarter points) — 1.2 s apart
  for (const [u, v] of [[0.5, 0.5], [0.3, 0.3], [0.7, 0.3], [0.3, 0.7], [0.7, 0.7]]) {
    const p = { x: mb.x + mb.w * u, y: mb.y + mb.h * v };
    const onCanvas = await page.evaluate(p => { const e = document.elementFromPoint(p.x, p.y); return e && e.id; }, p);
    if (onCanvas !== 'game') continue;
    await tap(cdp, page, p);
    await page.waitForTimeout(300);
  }
  for (const sel of ['#bubble', '#hudStars', '#hudDots']) { try { await tapEl(page, sel); } catch (e) { /* bubble may be hidden */ } await page.waitForTimeout(250); }
  const evs = await evSince(page, n0);
  const s = await page.evaluate(() => ({ m: FT.debug.world.misses, np: FT.debug.world._noProg, mode: FT.debug.mode, inter: FT.debug.world.interactive }));
  f(!evs.some(e => ['right', 'wrong', 'soft', 'assist'].includes(e.type)), 'Moka / bubble / HUD taps judged / softed: ' + types(evs));
  f(s.m === 0 && s.np === 0 && s.mode === 'play' && s.inter, 'after Moka / bubble / HUD taps: ' + JSON.stringify(s));
  // assist armed (4 soft presses once the round has been in play ≥ 10 s) — then a Moka tap must not answer for the child
  const pts = await page.evaluate(() => window.__qa.softPoint());
  await page.evaluate(() => FT.debug.setSpeed(4));
  await page.waitForFunction(() => FT.debug.world.time - FT.debug.world._playT0 >= 10.2, null, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => FT.debug.setSpeed(1));
  const off = pts.filter(p => !p.band).length ? pts.filter(p => !p.band) : pts;
  for (let k = 0; k < 4; k++) { const p = off[k % Math.max(1, Math.min(3, off.length))]; await tap(cdp, page, p, 40); await page.waitForTimeout(150); }
  await page.waitForTimeout(200);
  const armed = await page.evaluate(() => FT.debug.world.assistId);
  f(armed != null, 'assist not armed after 4 soft presses at ≥ 10 s of play (noProg ' + (await page.evaluate(() => FT.debug.world._noProg)) + ')');
  n0 = await evLen(page);
  await tap(cdp, page, { x: mb.cx, y: mb.cy });
  await page.waitForTimeout(300);
  const ev2 = await evSince(page, n0);
  f(!ev2.some(e => e.type === 'right' || e.type === 'assist'), 'with assist armed, a tap on MOKA answered the round: ' + types(ev2));
  f.done();
};

/** critter taps (centre and points inside its circle) never count as answers or misses */
async function critterRing({ page, cdp, url, d }, kind, level) {
  const f = soft();
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 31 + level, level, prep: 'w._surpriseRound = 1;' });
  // finish round 0 by touch, wait for round 1
  let i = await info(page);
  let n0 = await evLen(page);
  await tap(cdp, page, i.at);
  await nextAsk(page, n0);
  check(await page.evaluate(() => FT.debug.world.surprise) === kind, 'surprise of round 1 not ' + kind);
  await page.evaluate(() => FT.debug.setSpeed(2));
  await page.waitForFunction(() => !!FT.debug.critterScreen() && FT.debug.world.interactive, null, { timeout: 20000, polling: 'raf' });
  await page.evaluate(k => FT.debug.setSpeed(k === 'ladybug' ? 0.2 : 0.5), kind);
  const offs = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.45, 0.45], [-0.45, 0.45], [0.8, 0], [-0.8, 0], [0, 0.8]];
  let taps = 0;
  const bad = [], softs = [];
  for (const [ox, oy] of offs) {
    // tap it while it rests (a moving butterfly / ladybug can slip away between the read and the tap)
    await page.waitForFunction(() => { const c = FT.debug.world.critter; return !c || ['sit', 'stop', 'walk', 'stay', 'out2', 'dance', 'show'].includes(c.state) || !FT.debug.critterScreen(); }, null, { timeout: 8000, polling: 'raf' }).catch(() => {});
    const c = await page.evaluate(() => FT.debug.critterScreen());
    if (!c) break;
    const p = { x: c.x + ox * c.r, y: c.y + oy * c.r };
    const el = await page.evaluate(p => { const e = document.elementFromPoint(p.x, p.y); return e && e.id; }, p);
    if (el !== 'game') continue;
    const m0 = await evLen(page);
    await tap(cdp, page, p, 40);
    await page.waitForTimeout(120);
    taps++;
    const evs = await evSince(page, m0);
    const j = evs.filter(e => ['right', 'wrong', 'wiggle'].includes(e.type));
    if (evs.some(e => e.type === 'soft')) softs.push(`(${ox}, ${oy})·r ${c.state || ''}`);
    if (j.length) bad.push(`tap at (${ox}, ${oy})·r inside the ${kind} circle → ${types(j)}`);
    if (!(await page.evaluate(() => FT.debug.world.interactive))) break;
  }
  await page.evaluate(() => FT.debug.setSpeed(1));
  f(taps >= 1, 'no critter tap could be made');
  f(bad.length === 0, bad.join('; '));
  f(await page.evaluate(() => FT.debug.world.misses) === 0, kind + ' taps produced a miss');
  f(softs.length <= 1, `${softs.length}/${taps} taps inside the ${kind}'s reported circle were 'soft' (no critter hit; counts as no-progress): ` + softs.join('; '));
  f.done();
}
T.critter_ladybug = c => critterRing(c, 'ladybug', 0);
T.critter_butterfly = c => critterRing(c, 'butterfly', 1);
T.critter_snail = c => critterRing(c, 'snail', 2);
T.critter_fairies = c => critterRing(c, 'fairies', 3);

/** rotation mid-fall / mid-rise / mid-chime / mid-Talk */
T.rotate_phases = async ({ page, cdp, url, d, errors }) => {
  const f = soft();
  await gotoTitle(page, `${url}?mute=1&seed=41&age=5&lang=en`);
  await page.evaluate(() => { FT.debug.startGame(); FT.debug.setSpeed(1); });
  // mid-fall
  await page.waitForFunction(() => { const w = FT.debug.world; return w.state === 'round' && w.phase === 'enter' && w.members.some(m => m.state === 'fall' && m._spawned && m.y > 100); }, null, { timeout: 20000, polling: 'raf' });
  await rotate(page, d);
  let o = await page.evaluate(() => window.__qa.outside());
  f(o.length === 0, 'mid-fall rotation: ' + o.join('; '));
  await waitAsk(page);
  let s = await page.evaluate(() => { const w = FT.debug.world, L = w.layout; return { off: w.members.filter(m => Math.abs(m.y - L.table.y) > 3 || Math.abs(m.x - L.slots[m.slot].x) > 3).map(m => `${m.id} ${Math.round(m.x)},${Math.round(m.y)} slot ${Math.round(L.slots[m.slot].x)},${Math.round(L.table.y)}`), W: L.W, H: L.H }; });
  f(s.off.length === 0, 'after a mid-fall rotation things are not on their placemats: ' + s.off.join('; '));
  o = await page.evaluate(() => window.__qa.outside()); f(o.length === 0, 'outside after mid-fall rotation: ' + o.join('; '));
  // mid-rise
  let i = await info(page);
  let n0 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForFunction(id => { const m = FT.debug.world.memberById(id); return m && m.state === 'rise' && m._rs && m._rs !== 'wait'; }, i.a, { timeout: 10000, polling: 'raf' }).catch(() => {});
  await rotate(page, d, true);
  o = await page.evaluate(() => window.__qa.outside()); f(o.length === 0, 'outside after mid-rise rotation: ' + o.join('; '));
  await waitEv(page, n0, 'lantern');
  await page.waitForFunction(r => FT.debug.world.garland.lanterns[r].lit > 0.5, i.round, { timeout: 3000, polling: 'raf' }).catch(() => {});
  s = await page.evaluate(r => { const w = FT.debug.world, q = w.garland.lanterns[r]; return { lit: q.lit, thing: !!q.thing, x: q.cx, W: w.layout.W }; }, i.round);
  f(s.lit > 0.5 && s.thing && s.x > 0 && s.x < s.W, 'lantern after a mid-rise rotation: ' + JSON.stringify(s));
  // mid-chime
  await page.waitForFunction(() => { const w = FT.debug.world; return w.state === 'roundDone' && w.phase === 'chime'; }, null, { timeout: 15000, polling: 'raf' });
  await rotate(page, d);
  const r0 = await page.evaluate(() => FT.debug.world.round);
  await page.evaluate(() => FT.debug.setSpeed(3));
  await page.waitForFunction(r => { const w = FT.debug.world; return (w.state === 'round' && w.round === r + 1) || w.state === 'talk'; }, r0, { timeout: 20000, polling: 'raf' }).catch(() => f(false, 'stuck after a mid-chime rotation: ' + JSON.stringify(FT.debug && 0)));
  s = await page.evaluate(n => ({ ch: window.__ev.slice(n).filter(e => e.type === 'chime').length, poofs: window.__ev.slice(n).filter(e => e.type === 'poof').length, st: FT.debug.world.state }), n0);
  f(s.poofs === i.n - 1, `mid-chime rotation: ${s.poofs} poofs for ${i.n - 1} friends (state ${s.st})`);
  await waitAsk(page);
  o = await page.evaluate(() => window.__qa.outside()); f(o.length === 0, 'outside after mid-chime rotation: ' + o.join('; '));
  // mid-Talk
  await openTalk(page);
  await rotate(page, d, true);
  s = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#talkChoices button')].map(b => b.getBoundingClientRect());
    const p = document.querySelector('.talk-panel').getBoundingClientRect();
    return { vis: !document.getElementById('scrTalk').classList.contains('hidden'), mode: FT.debug.mode, out: bs.filter(r => r.left < 0 || r.top < 0 || r.right > innerWidth + 0.5 || r.bottom > innerHeight + 0.5 || r.width < 44 || r.height < 44).length, panel: [p.left, p.top, p.right, p.bottom].map(Math.round), n: bs.length };
  });
  f(s.vis && s.mode === 'talk' && s.out === 0, 'Talk after rotation: ' + JSON.stringify(s));
  const ans = await page.evaluate(() => FT.debug.world.talk.answer);
  n0 = await evLen(page);
  await tapEl(page, `#talkChoices button[data-id="${ans}"]`);
  await page.waitForTimeout(300);
  const tr = (await evSince(page, n0)).find(e => e.type === 'talkResult');
  f(tr && tr.correct, 'Talk answer by tap after rotation: ' + JSON.stringify(tr));
  await shot(page, d, 'rotate-talk');
  f.done();
};

/* ================================================================ global tests (one device unless noted) */
/** stars: 0 misses → 3, 1 → 2, 2 → 1, 3 → 1; same thing again after > 1 s is a 2nd miss; assisted round ≤ 2★ */
T.stars_rules = async ({ page, cdp, url }) => {
  const f = soft();
  await setupRound(page, url, { seed: 51, age: 6, topic: 'colors' });
  const plan = [0, 1, 2, 3];
  for (let r = 0; r < plan.length; r++) {
    const i = await info(page);
    const n0 = await evLen(page);
    for (let k = 0; k < plan[r]; k++) {
      const o = r === 2 && k === 1 ? i.others[0] : i.others[k % i.others.length];   // round 2: the SAME thing twice, 1.2 s apart
      await tap(cdp, page, o.at);
      await page.waitForTimeout(1250);
    }
    const m = await page.evaluate(() => FT.debug.world.misses);
    f(m === plan[r], `round ${r}: ${plan[r]} wrong taps gave ${m} misses`);
    await tap(cdp, page, i.at);
    await page.evaluate(() => FT.debug.setSpeed(3));
    await waitEv(page, n0, 'roundDone');
    const rd = (await evSince(page, n0)).find(e => e.type === 'roundDone');
    const want = plan[r] === 0 ? 3 : plan[r] === 1 ? 2 : 1;
    f(rd && rd.stars === want, `round ${r} with ${plan[r]} misses: stars ${rd && rd.stars}, want ${want}`);
    if (r < plan.length - 1) { const k = await nextAsk(page, n0); if (k === 'talk') break; }
  }
  // assisted round (soft presses before 10 s never arm it; 4 after 10 s of play do, then a band press): ≤ 2★ even with 0 misses
  await setupRound(page, url, { seed: 52, age: 4 });
  const i = await info(page);
  const pts = (await page.evaluate(() => window.__qa.softPoint())).filter(p => p.band).concat(await page.evaluate(() => window.__qa.softPoint()));
  for (let k = 0; k < 6; k++) { await tap(cdp, page, pts[k % Math.min(3, pts.length)], 40); await page.waitForTimeout(150); }
  f(await page.evaluate(() => FT.debug.world.assistId) == null, 'assist armed by mashing in the first 10 s of play');
  await page.evaluate(() => FT.debug.setSpeed(4));
  await page.waitForFunction(() => FT.debug.world.time - FT.debug.world._playT0 >= 10.2, null, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => FT.debug.setSpeed(1));
  const offB = pts.filter(p => !p.band);   // one more soft press arms it (6 already counted); off the band so it is not consumed
  await tap(cdp, page, offB[0] || pts[0], 40); await page.waitForTimeout(150);
  const armed = await page.evaluate(() => FT.debug.world.assistId);
  f(armed === i.a, 'assist not armed on the odd one: ' + armed);
  const bandPt = pts.find(p => p.band);
  const n0 = await evLen(page);
  if (bandPt) await tap(cdp, page, bandPt); else await tap(cdp, page, i.at);
  await page.evaluate(() => FT.debug.setSpeed(3));
  await waitEv(page, n0, 'roundDone');
  const evs = await evSince(page, n0);
  const rd = evs.find(e => e.type === 'roundDone');
  f(!bandPt || evs.some(e => e.type === 'assist'), 'band press with assist armed gave no assist: ' + types(evs));
  f(rd && rd.stars <= 2 && rd.assisted, 'assisted round stars: ' + JSON.stringify(rd));
  f.done();
};

/** idle nudges: 12 s, ×1.5 backoff to 30 s, hint from the 1st (idleHintFrom 1), voice says the prompt; ≈ 2 min → auto-pause */
T.idle_timing = async ({ page }) => {
  const f = soft();
  const url = page.__url;
  await setupRound(page, url, { seed: 61 });
  const t0 = await page.evaluate(() => { const a = window.__ev.filter(e => e.type === 'ask').pop(); return a._t; });
  const prompt = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  const L0 = await page.evaluate(() => FT.debug.voiceLog.length);
  await page.evaluate(() => FT.debug.setSpeed(8));
  await page.waitForFunction(() => FT.debug.mode === 'paused', null, { timeout: 90000, polling: 200 }).catch(() => {});
  const r = await page.evaluate(([t0, L0]) => ({ idles: window.__ev.filter(e => e.type === 'idle').map(e => ({ n: e.n, t: +(e._t - t0).toFixed(2) })), hints: window.__ev.filter(e => e.type === 'hint').map(e => ({ idle: e.idle, t: +(e._t - t0).toFixed(2) })),
    mode: FT.debug.mode, wt: FT.debug.world.time - t0, log: FT.debug.voiceLog.slice(L0).map(x => x.text) }), [t0, L0]);
  const want = [12, 30, 57, 87, 117];
  const got = r.idles.map(x => x.t);
  f(got.length >= 5 && want.every((w, k) => Math.abs(got[k] - w) < 0.6), 'idle times since the ask: ' + got.join(', ') + ' (want ' + want.join(', ') + ')');
  f(r.hints.length >= 1 && Math.abs(r.hints[0].t - 12) < 0.6 && r.hints[0].idle, 'first idle hint: ' + JSON.stringify(r.hints));
  f(r.hints.every((h, k) => k === 0 || h.t - r.hints[k - 1].t >= 6 - 0.01), 'hint cooldown violated: ' + JSON.stringify(r.hints));
  f(r.mode === 'paused' && Math.abs(r.wt - 117) < 1.5, `auto-pause: mode ${r.mode} at ${r.wt.toFixed(1)} s`);
  const withPrompt = r.log.filter(t => t.includes(prompt)).length;
  f(withPrompt >= 4, `idle lines repeating the prompt: ${withPrompt} (log ${JSON.stringify(r.log.slice(0, 6))})`);
  f.done();
};
/** a child who touches the screen after 4 nudges gets the full idle cycle again (no pause 12 s after a touch) */
T.idle_after_touch = async ({ page, cdp }) => {
  const f = soft();
  await setupRound(page, page.__url, { seed: 62 });
  await page.evaluate(() => FT.debug.setSpeed(8));
  await page.waitForFunction(() => window.__ev.filter(e => e.type === 'idle').length >= 4, null, { timeout: 60000, polling: 100 });
  await page.evaluate(() => FT.debug.setSpeed(1));
  const p = (await page.evaluate(() => window.__qa.softPoint()))[0];
  await tap(cdp, page, p);   // the child is back: one touch on the moss
  const tt = await page.evaluate(() => FT.debug.world.time);
  await page.evaluate(() => FT.debug.setSpeed(8));
  await page.waitForFunction(t => FT.debug.mode === 'paused' || FT.debug.world.time - t > 40, tt, { timeout: 30000, polling: 100 });
  const s = await page.evaluate(t => ({ mode: FT.debug.mode, dt: +(FT.debug.world.time - t).toFixed(1), idles: window.__ev.filter(e => e.type === 'idle' && e._t > t).map(e => +(e._t - t).toFixed(1)) }), tt);
  f(s.mode !== 'paused', `the game auto-paused ${s.dt} s after the child touched the screen (idle after touch at ${s.idles.join(', ')} s)`);
  f(!s.idles.length || Math.abs(s.idles[0] - 12) < 0.6, 'first idle after a touch: ' + s.idles.join(','));
  f.done();
};

/** Talk time for every topic (EN + VI): question + choices clean; wrong pick → kind line, no star; a later right tap ignored;
 *  a right pick → +1★; the screen closes and the next chapter starts */
T.talk_topics = async ({ page }) => {
  const f = soft();
  const url = page.__url;
  for (const lang of ['en', 'vi']) for (const topic of Object.keys(TOPIC_AGE)) {
    await gotoTitle(page, `${url}?mute=1&seed=${71 + TOPIC_AGE[topic]}&age=${TOPIC_AGE[topic]}&lang=${lang}`);
    await page.evaluate(t => { FT.debug.startGame(); const w = FT.debug.world; w.levels[0] = t; w.levels[1] = t; w.startLevel(0); }, topic);
    await page.evaluate(() => FT.debug.setSpeed(4));
    await page.waitForFunction(() => FT.debug.world.state === 'round', null, { timeout: 20000 });
    await page.evaluate(() => FT.debug.setSpeed(1));
    await openTalk(page);
    const t = await page.evaluate(() => ({ q: document.getElementById('talkQ').textContent, title: document.getElementById('talkTitle').textContent, n: document.querySelectorAll('#talkChoices button').length,
      ans: FT.debug.world.talk.answer, ids: [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id), stars: FT.debug.world.stars, lastSaid: window.__said.slice(-1)[0] }));
    const tag = `${lang}/${topic}`;
    f(t.q && !RAW.test(t.q) && !RAW.test(t.title), `${tag}: Talk text "${t.title}" / "${t.q}"`);
    f(lang !== 'vi' || VI_CHARS.test(t.q), `${tag}: VI Talk question without diacritics: ${t.q}`);
    f(t.n >= 2 && t.n <= 3 && t.ids.includes(String(t.ans)), `${tag}: choices ${t.n}, answer ${t.ans} in ${t.ids}`);
    f(t.lastSaid && t.lastSaid.text.includes(t.q), `${tag}: the Talk question was not spoken: ${t.lastSaid && t.lastSaid.text}`);
    const wrongId = t.ids.find(x => x !== String(t.ans));
    const n0 = await evLen(page), S0 = await page.evaluate(() => window.__said.length);
    await tapEl(page, `#talkChoices button[data-id="${wrongId}"]`);
    await page.waitForTimeout(200);
    await tapEl(page, `#talkChoices button[data-id="${t.ans}"]`).catch(() => {});
    await page.waitForTimeout(200);
    const r = await page.evaluate(([n, S0]) => ({ res: window.__ev.slice(n).filter(e => e.type === 'talkResult'), stars: FT.debug.world.stars, said: window.__said.slice(S0).map(x => x.text),
      cls: [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id + ':' + b.className) }), [n0, S0]);
    f(r.res.length === 1 && r.res[0].correct === false && r.stars === t.stars, `${tag}: wrong then right: ` + JSON.stringify(r.res) + ' stars ' + r.stars);
    f(r.said.length >= 1 && r.said.every(x => x && !RAW.test(x) && !/\b(no|wrong)\b/i.test(x)), `${tag}: wrong-pick line: ` + JSON.stringify(r.said));
    f(lang !== 'vi' || r.said.every(x => VI_CHARS.test(x)), `${tag}: VI wrong-pick line not Vietnamese: ` + JSON.stringify(r.said));
    f(r.cls.some(c => c.startsWith(t.ans + ':') && /right/.test(c)), `${tag}: the right answer is not shown after a wrong pick: ` + r.cls.join(' '));
    // the chapter moves on; then a right pick in chapter 2
    await page.evaluate(() => FT.debug.setSpeed(4));
    await page.waitForFunction(() => FT.debug.world.state === 'round' && FT.debug.world.level === 1 && FT.debug.mode === 'play', null, { timeout: 20000, polling: 'raf' }).catch(() => f(false, `${tag}: next chapter did not start after Talk`));
    await page.evaluate(() => FT.debug.setSpeed(1));
    f(!(await visible(page, 'scrTalk')), `${tag}: Talk screen still shown in the next chapter`);
    await openTalk(page);
    const a2 = await page.evaluate(() => ({ a: FT.debug.world.talk.answer, s: FT.debug.world.stars }));
    const n1 = await evLen(page);
    await tapEl(page, `#talkChoices button[data-id="${a2.a}"]`);
    await page.waitForTimeout(250);
    const r2 = await page.evaluate(n => ({ res: window.__ev.slice(n).filter(e => e.type === 'talkResult'), s: FT.debug.world.stars }), n1);
    f(r2.res.length === 1 && r2.res[0].correct && r2.s === a2.s + 1, `${tag}: right Talk pick: ` + JSON.stringify(r2));
  }
  f.done();
};

/** Talk re-asks every 12 s, glows the answer after the 2nd re-ask, stays silent after the 3rd, then Moka answers */
/** Talk choices are locked for the first second (a finger still mashing from the last clear never answers the question) */
T.talk_lock = async ({ page }) => {
  const f = soft();
  await gotoTitle(page, `${page.__url}?mute=1&seed=83&age=4&lang=en`);
  await page.evaluate(() => { FT.debug.startGame(); });
  await page.waitForFunction(() => FT.debug.world.state === 'round', null, { timeout: 10000 });
  await page.evaluate(() => { FT.debug.setSpeed(0.25); FT.debug.world._startTalk(); });   // slow world: the lock lasts 4 s of wall time
  await page.waitForFunction(() => FT.debug.mode === 'talk' && !document.getElementById('scrTalk').classList.contains('hidden'), null, { timeout: 5000 });
  const ans = await page.evaluate(() => FT.debug.world.talk.answer);
  const n0 = await evLen(page);
  await tapEl(page, `#talkChoices button[data-id="${ans}"]`);
  await page.waitForTimeout(150);
  const early = await page.evaluate(() => ({ st: FT.debug.world.stateTime, answered: FT.debug.world.talkAnswered }));
  f(!early.answered && !(await evSince(page, n0)).some(e => e.type === 'talkResult'), 'a Talk tap at ' + early.st.toFixed(2) + ' s answered: ' + JSON.stringify(early));
  await page.evaluate(() => FT.debug.setSpeed(1));
  await page.waitForFunction(() => FT.debug.world.talkOpen(), null, { timeout: 5000 });
  await tapEl(page, `#talkChoices button[data-id="${ans}"]`);
  await page.waitForTimeout(200);
  const tr = (await evSince(page, n0)).find(e => e.type === 'talkResult');
  f(tr && tr.correct, 'a Talk tap after the lock: ' + JSON.stringify(tr));
  f.done();
};
T.talk_reask = async ({ page }) => {
  const f = soft();
  await gotoTitle(page, `${page.__url}?mute=1&seed=81&age=4&lang=en`);
  await page.evaluate(() => { FT.debug.startGame(); });
  await page.waitForFunction(() => FT.debug.world.state === 'round', null, { timeout: 10000 });
  await openTalk(page, 'colors');
  const t0 = await page.evaluate(() => window.__ev.filter(e => e.type === 'talk').pop()._t);
  const q = await page.evaluate(() => document.getElementById('talkQ').textContent);
  const S0 = await page.evaluate(() => window.__said.length);
  const glowAt = [];
  await page.evaluate(() => FT.debug.setSpeed(4));
  for (let n = 1; n <= 3; n++) {
    await page.waitForFunction(n => window.__ev.filter(e => e.type === 'talkAsk').length >= n, n, { timeout: 20000, polling: 'raf' });
    glowAt.push(await page.evaluate(() => document.querySelectorAll('#talkChoices .glow').length));
  }
  await page.waitForFunction(() => window.__ev.some(e => e.type === 'talkResult'), null, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => FT.debug.setSpeed(1));
  const r = await page.evaluate(([t0, S0]) => ({ asks: window.__ev.filter(e => e.type === 'talkAsk').map(e => +(e._t - t0).toFixed(2)), res: window.__ev.filter(e => e.type === 'talkResult').map(e => ({ auto: e.auto, correct: e.correct, t: +(e._t - t0).toFixed(2) })),
    said: window.__said.slice(S0).map(x => ({ text: x.text, t: +(x.wt - t0).toFixed(1) })) }), [t0, S0]);
  f(r.asks.length === 3 && [12, 24, 36].every((w, k) => Math.abs(r.asks[k] - w) < 0.3), 'Talk re-ask times: ' + r.asks.join(', '));
  f(glowAt[0] === 0 && glowAt[1] >= 1 && glowAt[2] >= 1, 'answer glow after re-ask 1/2/3: ' + glowAt.join('/'));
  const reasks = r.said.filter(x => x.text.includes(q));
  f(reasks.length === 3, `Talk question re-spoken ${reasks.length}× (want 3): ` + JSON.stringify(r.said));
  const afterThird = r.said.filter(x => x.t > 36.2 && x.text.includes(q));
  f(afterThird.length === 0, 'Talk question spoken after the 3rd re-ask: ' + JSON.stringify(afterThird));
  f(r.res.length === 1 && r.res[0].auto && !r.res[0].correct && Math.abs(r.res[0].t - 38) < 0.4, 'Moka answers after the 3rd re-ask: ' + JSON.stringify(r.res));
  f.done();
};

/** pause / resume with a (fake) speaking voice: no world time passes, speech stops and stays stopped, resume re-asks */
T.pause_speech = async ({ page, cdp }) => {
  const f = soft();
  await gotoTitle(page, `${page.__url}?fakesynth=1&seed=91&age=4&lang=en`);
  await tapEl(page, '#btnPlay');   // the unlock gesture
  await page.waitForFunction(READY, null, { timeout: 30000, polling: 'raf' });   // speed 1: the voice is on
  await page.waitForTimeout(300);
  // the prompt may be queued behind the chapter / weather lines (the shorter enter of the playtest trims): allow the hand-over gap
  await page.waitForFunction(() => speechSynthesis.speaking, null, { timeout: 1500, polling: 50 }).catch(() => {});
  let s = await page.evaluate(() => ({ sp: speechSynthesis.speaking, vs: FT.Voice.isSpeaking(), log: window.__synth.log.map(x => x.text) }));
  f(s.sp, 'fake voice not speaking right after the ask (log ' + JSON.stringify(s.log.slice(-3)) + ')');
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(150);
  const p0 = await page.evaluate(() => ({ t: FT.debug.world.time, sp: speechSynthesis.speaking, vs: FT.Voice.isSpeaking(), k: window.__synth.speak, mode: FT.debug.mode, music: FT.debug.audio().gains && FT.debug.audio().gains() }));
  f(p0.mode === 'paused', 'pause did not open: ' + p0.mode);
  f(!p0.sp && !p0.vs, 'speech still going after pause: ' + JSON.stringify(p0));
  await page.waitForTimeout(3000);
  const p1 = await page.evaluate(() => ({ t: FT.debug.world.time, sp: speechSynthesis.speaking, k: window.__synth.speak }));
  f(p1.t === p0.t, `world time moved while paused: ${p0.t} → ${p1.t}`);
  f(p1.k === p0.k && !p1.sp, `speech started while paused: ${p1.k - p0.k} lines`);
  const prompt = await page.evaluate(() => window.__asks.slice(-1)[0].text);
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(900);
  const r = await page.evaluate(k => ({ mode: FT.debug.mode, lines: window.__synth.log.slice(-3).map(x => x.text), k: window.__synth.speak - k }), p1.k);
  f(r.mode === "play" && r.k >= 1 && r.lines.some(x => x.toLowerCase().replace(/[^a-z]/g, "") === prompt.toLowerCase().replace(/[^a-z]/g, "")), "resume did not re-say the prompt: " + JSON.stringify(r) + " want " + JSON.stringify(prompt));
  // pause in the middle of the rise: the right line comes back, the round finishes
  const i = await info(page);
  const n0 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(500);
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(800);
  await tapEl(page, '#btnResume');
  await page.evaluate(() => FT.debug.setSpeed(3));
  await waitEv(page, n0, 'roundDone').catch(() => f(false, 'round did not finish after a pause mid-rise'));
  await page.evaluate(() => FT.debug.setSpeed(1));
  f.done();
};

/** visibilitychange: pause, audio suspended, speech cancelled; back → still paused (child resumes) */
T.visibility = async ({ page }) => {
  const f = soft();
  await gotoTitle(page, `${page.__url}?fakesynth=1&seed=92&age=4&lang=en`);
  await tapEl(page, '#btnPlay');
  await waitAsk(page);
  const setHidden = h => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true);
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({ mode: FT.debug.mode, sp: speechSynthesis.speaking, ac: FT.debug.audio().ctx && FT.debug.audio().ctx.state, t: FT.debug.world.time }));
  f(s.mode === 'paused' && !s.sp, 'hidden: ' + JSON.stringify(s));
  f(s.ac === 'suspended' || s.ac === 'closed', 'audio context not suspended while hidden: ' + s.ac);
  await page.waitForTimeout(1000);
  await setHidden(false);
  await page.waitForTimeout(400);
  const v = await page.evaluate(() => ({ mode: FT.debug.mode, t: FT.debug.world.time, pause: !document.getElementById('scrPause').classList.contains('hidden'), k: window.__synth.speak }));
  f(v.mode === 'paused' && v.pause && v.t === s.t, 'back visible: ' + JSON.stringify(v));
  // hidden during Talk time
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(300);
  await openTalk(page);
  await setHidden(true);
  await page.waitForTimeout(300);
  await setHidden(false);
  await page.waitForTimeout(300);
  const tk = await page.evaluate(() => ({ mode: FT.debug.mode }));
  f(tk.mode === 'paused', 'hidden in Talk did not pause: ' + tk.mode);
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(300);
  const tk2 = await page.evaluate(() => ({ mode: FT.debug.mode, talk: !document.getElementById('scrTalk').classList.contains('hidden') }));
  f(tk2.mode === 'talk' && tk2.talk, 'resume into Talk: ' + JSON.stringify(tk2));
  f.done();
};

/** parent gate: short tap / 1 s hold / two fingers do not open; a 2 s hold does */
T.parent_gate = async ({ page, cdp }) => {
  const f = soft();
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, `${page.__url}?mute=1`);
  const b = await page.locator('#btnParents').boundingBox();
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  for (const ms of [60, 400, 1200, 1700]) {
    await tap(cdp, page, c, ms);
    await page.waitForTimeout(250);
    f(!(await visible(page, 'scrSettings')), `a ${ms} ms press opened settings`);
  }
  await page.touchscreen.tap(c.x, c.y); await page.waitForTimeout(250);
  f(!(await visible(page, 'scrSettings')), 'touchscreen.tap opened settings');
  await tap(cdp, page, c, 2300);
  await page.waitForTimeout(300);
  f(await visible(page, 'scrSettings'), 'a 2.3 s hold did not open settings');
  f.done();
};

/** settings persist across reload (age, lang, name, volume); URL flags never saved */
T.settings_persist = async ({ page, cdp }) => {
  const f = soft();
  const url = page.__url;
  await page.goto(url); await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, `${url}?mute=1`);
  const b = await page.locator('#btnParents').boundingBox();
  await tap(cdp, page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 2300);
  await page.waitForTimeout(300);
  check(await visible(page, 'scrSettings'), 'settings did not open');
  await tapEl(page, '#ageChips .chip[data-age="5"]');
  await tapEl(page, '#scrSettings [data-lang="vi"]');
  await page.locator('#inpName').fill('Bông');
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '35'; v.dispatchEvent(new Event('input', { bubbles: true })); });
  await tapEl(page, '#btnSettingsDone');
  await page.waitForTimeout(300);
  await gotoTitle(page, url);
  let s = await page.evaluate(() => ({ st: FT.debug.getState().settings, html: document.documentElement.lang, age: document.getElementById('titleAge').textContent, play: document.getElementById('btnPlay').textContent }));
  f(s.st.age === 5 && s.st.lang === 'vi' && s.st.name === 'Bông' && Math.abs(s.st.volume - 0.35) < 1e-6, 'settings after reload: ' + JSON.stringify(s.st));
  f(/5/.test(s.age) && s.html === 'vi', 'title after reload: ' + JSON.stringify(s));
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(500);
  const g = await page.evaluate(() => FT.debug.audio().gains());
  f(g && Math.abs(g.user - 0.35 * 1.6) < 0.06, 'saved volume not applied to the chain: ' + JSON.stringify(g));
  // URL flags: played, never saved; title language buttons under a flag
  await gotoTitle(page, `${url}?lang=en&age=7&speed=2&mute=1&seed=4`);
  s = await page.evaluate(() => ({ html: document.documentElement.lang, age: document.getElementById('titleAge').textContent }));
  f(s.html === 'en' && /7/.test(s.age), 'flags not applied on the title: ' + JSON.stringify(s));
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(300);
  const played = await page.evaluate(() => ({ age: FT.debug.world.age, lang: FT.debug.world.lang }));
  f(played.age === 7 && played.lang === 'en', 'flags not played: ' + JSON.stringify(played));
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('ft:settings') || '{}'));
  f(stored.age === 5 && stored.lang === 'vi' && stored.speed === undefined && stored.mute === undefined && stored.seed === undefined, 'URL flags leaked into storage: ' + JSON.stringify(stored));
  const keys = await page.evaluate(() => Object.keys(localStorage));
  f(keys.every(k => k.startsWith('ft:')), 'storage keys outside ft: ' + keys.join(','));
  await gotoTitle(page, url);
  s = await page.evaluate(() => ({ html: document.documentElement.lang, age: document.getElementById('titleAge').textContent, speed: FT.debug.getState().speed }));
  f(s.html === 'vi' && /5/.test(s.age) && s.speed === 1, 'flags stuck after reload: ' + JSON.stringify(s));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  f.done();
};

/** the language toggle on the title updates every text (no raw keys, VI diacritics, EN back) */
T.lang_switch_all = async ({ page }) => {
  const f = soft();
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, `${page.__url}?mute=1`);
  const grab = () => page.evaluate(() => {
    const out = {};
    document.querySelectorAll('[data-i18n]').forEach((el, k) => { out['k' + k + ':' + el.getAttribute('data-i18n')] = el.textContent.trim(); });
    out.logo = document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent;
    out.tagline = document.getElementById('tagline').textContent; out.play = document.getElementById('btnPlay').textContent.trim() || document.getElementById('btnPlay').getAttribute('aria-label');
    out.age = document.getElementById('titleAge').textContent; out.title = document.title; out.name = document.getElementById('inpName').placeholder; out.html = document.documentElement.lang;
    return out;
  });
  const en = await grab();
  await tapEl(page, '.title-top [data-lang="vi"]');
  await page.waitForTimeout(250);
  const vi = await grab();
  for (const k of Object.keys(en)) {
    if (k === 'html') continue;
    f(vi[k] && !RAW.test(vi[k]) && !/^ui\./.test(vi[k]), `VI ${k}: "${vi[k]}"`);
    if (en[k] && en[k] !== 'Moka' && !/^\W*$/.test(en[k])) f(vi[k] !== en[k], `${k} not translated: "${en[k]}"`);
  }
  f(vi.html === 'vi' && VI_CHARS.test(vi.logo + vi.tagline + vi.age), 'VI title: ' + JSON.stringify({ html: vi.html, logo: vi.logo, tag: vi.tagline }));
  await tapEl(page, '.title-top [data-lang="en"]');
  await page.waitForTimeout(250);
  const en2 = await grab();
  f(JSON.stringify(en2) === JSON.stringify(en), 'EN not fully restored: ' + Object.keys(en).filter(k => en[k] !== en2[k]).map(k => `${k}: "${en[k]}" → "${en2[k]}"`).join('; '));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  f.done();
};

/** audio chain: compressor + makeup gain + the volume setting applied */
T.audio_chain = async ({ page }) => {
  const f = soft();
  await page.evaluate(() => { try { localStorage.clear(); localStorage.setItem('ft:settings', JSON.stringify({ volume: 0.6 })); } catch (e) {} });
  await gotoTitle(page, `${page.__url}?novoice=1&seed=3`);
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(500);
  const g = await page.evaluate(() => FT.debug.audio().gains());
  f(g && Math.abs(g.threshold + 18) < 0.01 && g.knee === 12 && g.ratio === 4 && Math.abs(g.attack - 0.004) < 1e-4 && Math.abs(g.release - 0.18) < 1e-3, 'compressor: ' + JSON.stringify(g));
  f(g && Math.abs(g.user - 0.96) < 0.05 && Math.abs(g.master - 1) < 0.05, 'makeup × volume 0.6 ≠ 0.96: ' + JSON.stringify(g));
  f(g && g.state === 'running', 'AudioContext not running after the Play tap: ' + (g && g.state));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  f.done();
};

/** resize to very small / very wide / very tall: things inside, tappable, bubble + HUD on screen */
T.resize_extremes = async ({ page, cdp, d }) => {
  const f = soft();
  await setupRound(page, page.__url, { seed: 95, age: 6 });
  for (const v of [{ width: 320, height: 480 }, { width: 480, height: 320 }, { width: 2400, height: 600 }, { width: 600, height: 2000 }, { width: 300, height: 300 }, { width: 1366, height: 1024 }]) {
    await page.setViewportSize(v);
    await page.waitForTimeout(500);
    await waitAsk(page);
    const s = await page.evaluate(() => {
      const w = FT.debug.world, out = window.__qa.outside();
      const ui = ['bubble', 'hud', 'btnPause'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: Math.round(r.left), t: Math.round(r.top), r: Math.round(r.right), b: Math.round(r.bottom), hidden: document.getElementById(id).classList.contains('hidden') }; })
        .filter(r => !r.hidden && (r.l < -1 || r.t < -1 || r.r > innerWidth + 1 || r.b > innerHeight + 1));
      const cover = w.members.filter(m => m.state === 'sit').map(m => { const p = FT.debug.memberScreen(m.id); const e = document.elementFromPoint(p.x, p.y); return e && e.id !== 'game' ? m.id + ' under ' + (e.id || e.className) : null; }).filter(Boolean);
      const ov = [];
      const ms = w.members.filter(m => m.state === 'sit');
      for (let a = 0; a < ms.length; a++) for (let b = a + 1; b < ms.length; b++) if (Math.hypot(ms[a].cx - ms[b].cx, ms[a].cy - ms[b].cy) < 0.8 * ms[a].size) ov.push(ms[a].id + '/' + ms[b].id);
      return { out, ui, cover, ov, L: { W: w.layout.W, H: w.layout.H, item: w.layout.item, fits: w.layout.fits, squeezed: w.layout.squeezed } };
    });
    const tag = `${v.width}×${v.height}`;
    f(s.out.length === 0, `${tag}: things outside: ${s.out.join('; ')}`);
    f(s.ui.length === 0, `${tag}: HUD / bubble off screen: ${JSON.stringify(s.ui)}`);
    f(s.cover.length === 0, `${tag}: things covered by DOM: ${s.cover.join('; ')}`);
    f(s.ov.length === 0, `${tag}: things overlap: ${s.ov.join(' ')} ${JSON.stringify(s.L)}`);
    const i = await info(page);
    const n0 = await evLen(page);
    await tap(cdp, page, i.at);
    await page.waitForTimeout(250);
    f((await evSince(page, n0)).some(e => e.type === 'right'), `${tag}: tap on the odd one did not answer`);
    await page.screenshot({ path: path.join(OUT, `resize-${tag}.png`) }).catch(() => {});
    await nextAsk(page, n0).catch(() => {});
    if (await page.evaluate(() => FT.debug.world.state === 'talk')) { await page.evaluate(() => FT.debug.world.talkAnswer(FT.debug.world.talk.answer)); await page.evaluate(() => FT.debug.setSpeed(4)); }
  }
  await page.setViewportSize(d.viewport);
  f.done();
};

/* ================================================================ full sessions per age × language */
async function runSession(browser, url, r) {
  const d = DEVICES[r.dev], errors = [], name = `session age ${r.age} ${r.lang}`;
  const { ctx, page } = await newPage(browser, d, errors);
  const f = soft();
  try {
    await page.goto(url + '?mute=1');
    await page.evaluate(n => { localStorage.clear(); localStorage.setItem('ft:settings', JSON.stringify({ name: n })); }, r.name);
    await page.goto(`${url}?bot=1&speed=${r.speed}&mute=1&age=${r.age}&lang=${r.lang}&seed=${100 + r.age * 3 + (r.lang === 'vi' ? 1 : 0)}`);
    await page.waitForFunction(() => window.FT && FT.debug && FT.debug.mode === 'title' && FT.debug.world, null, { timeout: 20000 });
    await page.evaluate(() => window.__qa.hook());
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => FT.debug.mode === 'done', null, { timeout: 600000, polling: 500 });
    await page.waitForTimeout(600);
    const a = await page.evaluate(() => ({ asks: window.__asks.slice(), log: FT.debug.voiceLog.map(x => ({ text: x.text, lang: x.lang })), ev: window.__ev.filter(e => ['ask', 'session', 'sessionDone', 'roundDone', 'talkResult'].includes(e.type)).map(e => ({ type: e.type, levels: e.levels, stars: e.stars, correct: e.correct, auto: e.auto })),
      bubble: window.__bubble.slice(), levels: FT.debug.world.levels.slice(), stars: FT.debug.world.stars, hud: document.getElementById('hudStars').textContent, done: document.getElementById('doneStars').textContent, title: document.getElementById('doneTitle').textContent }));
    const asksEv = a.ev.filter(e => e.type === 'ask').length;
    const logSet = new Set(a.log.map(x => x.text));
    const missing = a.asks.filter(x => ![...logSet].some(t => t.includes(x.text)));
    f(a.asks.length >= 12 && asksEv >= 12, `asks: built ${a.asks.length}, events ${asksEv}`);
    f(missing.length === 0, `${missing.length} ask prompts not in FT.debug.voiceLog: ` + JSON.stringify(missing.slice(0, 2)));
    const bad = a.log.filter(x => !x.text || !x.text.trim() || RAW.test(x.text));
    f(bad.length === 0, 'voiceLog has empty / raw / undefined / "{" lines: ' + JSON.stringify(bad.slice(0, 4)));
    f(a.log.every(x => x.lang === r.lang), 'voiceLog language: ' + JSON.stringify(a.log.filter(x => x.lang !== r.lang).slice(0, 2)));
    if (r.lang === 'vi') { const nv = a.log.filter(x => !VI_CHARS.test(x.text) && !/^[\d\s,.!?+−=-]*$/.test(x.text)); f(nv.length <= 2, 'VI voiceLog lines without diacritics: ' + JSON.stringify(nv.slice(0, 5).map(x => x.text))); }
    else { const vv = a.log.filter(x => VI_CHARS.test(x.text.replace(r.name, ''))); f(vv.length === 0, 'EN voiceLog has VI lines: ' + JSON.stringify(vv.slice(0, 3).map(x => x.text))); }
    const named = a.log.filter(x => x.text.includes(r.name));
    f(named.length >= 1, `the child's name "${r.name}" never in the praise (${a.log.length} lines)`);
    // bubble: VI diacritics + fits
    const over = a.bubble.filter(b => b.over > 2 || b.hOver > 2 || b.right > 1 || b.bottom > 1);
    f(over.length === 0, 'bubble overflows: ' + JSON.stringify(over.slice(0, 3)));
    const small = a.bubble.filter(b => b.fs < 14);
    f(small.length === 0, 'bubble font shrank below 14 px: ' + JSON.stringify(small.slice(0, 2)));
    if (r.lang === 'vi') f(a.bubble.filter(b => !VI_CHARS.test(b.text)).length <= 2, 'VI bubble lines without diacritics: ' + JSON.stringify(a.bubble.filter(b => !VI_CHARS.test(b.text)).slice(0, 4).map(b => b.text)));
    const sd = a.ev.find(e => e.type === 'sessionDone'), rs = a.ev.filter(e => e.type === 'roundDone').reduce((s, e) => s + e.stars, 0), ts = a.ev.filter(e => e.type === 'talkResult' && e.correct).length;
    f(sd && sd.stars === rs + ts && a.done === String(sd.stars), `session stars: done ${sd && sd.stars}, rounds ${rs} + talk ${ts}, screen ${a.done}`);
    f(a.title && !RAW.test(a.title) && (r.lang === 'en' || VI_CHARS.test(a.title)), 'done title: ' + a.title);
    // Play again: a clean 2nd session, chapter topics rotate
    const L1 = a.levels.slice();
    const ev0 = await evLen(page);
    await page.evaluate(() => FT.debug.setBot(false));   // a human taps Play again and looks at the fresh table
    await tapEl(page, '#btnAgain');
    await page.evaluate(() => FT.debug.setSpeed(4));
    await page.waitForFunction(() => FT.debug.world.state === 'round' && FT.debug.world.phase === 'play', null, { timeout: 60000, polling: 'raf' });
    await page.evaluate(() => FT.debug.setSpeed(1));
    const s2 = await page.evaluate(n => { const w = FT.debug.world; return { mode: FT.debug.mode, sessions: FT.debug.stats.sessions, level: w.level, round: w.round, levels: w.levels.slice(), stars: w.stars, hud: document.getElementById('hudStars').textContent,
      lit: w.garland.lanterns.filter(q => q.lit > 0.1 || q.thing).length, done: !document.getElementById('scrDone').classList.contains('hidden'), talk: !document.getElementById('scrTalk').classList.contains('hidden'),
      hudVis: !document.getElementById('hud').classList.contains('hidden'), party: !!(FT.debug.weather._party || FT.debug.weather.partyOn), gallery: (FT.debug.render().gallery || []).length, sess: window.__ev.slice(n).filter(e => e.type === 'session').length,
      stored: JSON.parse(localStorage.getItem('ft:lastTopics') || 'null') }; }, ev0);
    f(s2.mode === 'play' && s2.level === 0 && s2.round === 0 && s2.stars === 0 && !s2.done && !s2.talk && s2.hudVis && s2.lit === 0, '2nd session not clean: ' + JSON.stringify(s2));
 f(+s2.hud === 0, '2nd session HUD stars not reset: ' + s2.hud);
    f(s2.gallery === 0, '2nd session still shows the lantern gallery: ' + s2.gallery);
    f(s2.levels[0] !== L1[0], `chapter 1 topic did not rotate: ${L1.join('/')} → ${s2.levels.join('/')}`);
    f(s2.levels.every(t => FT_POOLS[r.age].includes(t)), '2nd session topics outside the age pool: ' + s2.levels.join('/'));
    f(errors.length === 0, 'errors: ' + errors.slice(0, 3).join(' | '));
    f.done();
    record(d.name, name, true, `topics ${L1.join('/')} → ${s2.levels.join('/')}, stars ${a.stars}, lines ${a.log.length}, named ${named.length}`);
  } catch (e) {
    let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = FT.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, level: s.level, round: s.round }; })); } catch (x) { /* ignore */ }
    record(d.name, name, false, (e && e.message ? e.message.split('\n')[0] : String(e)) + ' ' + st);
  }
  await ctx.close();
}
const FT_POOLS = { 3: ['colors', 'shapes', 'size', 'animals', 'count'], 4: ['colors', 'size', 'shapes', 'count', 'animals'], 5: ['colors', 'shapes', 'count', 'letters', 'animals'], 6: ['letters', 'lower', 'initial', 'add', 'count'], 7: ['count', 'initial', 'add', 'sub', 'oddeven'] };

/* ================================================================ runner */
const DEVICE_TESTS = ['warmup_easy', 'tap_jitter', 'slide_window', 'two_fingers', 'rapid_right', 'hammer_wrong', 'non_answers',
  'critter_ladybug', 'critter_butterfly', 'critter_snail', 'critter_fairies', 'rotate_phases'];
const GLOBAL_TESTS = ['stars_rules', 'idle_timing', 'idle_after_touch', 'talk_topics', 'talk_lock', 'talk_reask', 'pause_speech', 'visibility', 'parent_gate',
  'settings_persist', 'lang_switch_all', 'audio_chain', 'resize_extremes'];

async function runList(browser, url, d, list) {
  const errors = [];
  const { ctx, page, cdp } = await newPage(browser, d, errors);
  page.__url = url;
  for (const name of list) {
    const e0 = errors.length;
    const t0 = Date.now();
    try {
      await T[name]({ page, cdp, url, d, errors });
      const errs = errors.slice(e0);
      record(d.name, name, errs.length === 0, errs.length ? 'console/page errors: ' + errs.slice(0, 3).join(' | ') : `${((Date.now() - t0) / 1000).toFixed(0)} s`);
    } catch (e) {
      await shot(page, d, 'fail-' + name);
      let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = FT.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, topic: s.topic, round: s.round, W: s.W, H: s.H }; })); } catch (x) { /* ignore */ }
      record(d.name, name, false, (e instanceof Fail ? '' : 'exception: ') + (e && e.message ? e.message.split('\n')[0] : e) + (st ? '  state ' + st : ''));
      try { await page.setViewportSize(d.viewport); await touchCancel(cdp); } catch (x) { /* ignore */ }
    }
  }
  await ctx.close();
}

(async () => {
  const srv = await serve(path.join(__dirname, '..', '..', 'game'));
  const browser = await chromium.launch();
  const t0 = Date.now();
  const want = process.env.TESTS ? process.env.TESTS.split(',') : null;
  const PAR = +process.env.PAR || 4;
  try {
    const devs = process.env.SESS_ONLY ? [] : DEVICES.filter(d => !process.env.ONLY || d.name === process.env.ONLY);
    const jobs = [];
    for (const d of devs) { const l = DEVICE_TESTS.filter(t => !want || want.includes(t)); if (l.length) jobs.push(() => runList(browser, srv.url, d, l)); }
    const g = process.env.SESS_ONLY ? [] : GLOBAL_TESTS.filter(t => !want || want.includes(t));
    // split the global tests over two pages (iPhone portrait + iPad landscape)
    const g1 = g.filter((t, k) => k % 2 === 0), g2 = g.filter((t, k) => k % 2 === 1);
    if (g1.length) jobs.push(() => runList(browser, srv.url, DEVICES[0], g1));
    if (g2.length) jobs.push(() => runList(browser, srv.url, DEVICES[3], g2));
    if (!process.env.SKIP_SESSIONS && !want) {
      const names = { en: 'Lily', vi: 'Mầm' };
      [3, 4, 5, 6, 7].forEach((age, i) => ['en', 'vi'].forEach((lang, j) => jobs.push(() => runSession(browser, srv.url, { age, lang, dev: (i + j) % 4, speed: 12, name: names[lang] }))));
    }
    let k = 0;
    await Promise.all(Array.from({ length: PAR }, async () => { while (k < jobs.length) { const j = jobs[k++]; await j(); } }));
  } catch (e) { record('-', 'runner', false, String(e && e.stack)); }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ date: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), results }, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log(`  ${f.device} ${f.test}: ${f.detail}`)); }
  process.exit(fails.length ? 1 : 0);
})();
