// Functional QA (Kiki's Camp Chimes) — Playwright, isMobile + hasTouch contexts on iPhone / iPad, portrait + landscape.
// Every tap / swipe is a REAL CDP touch sequence (Input.dispatchTouchEvent → pointer events → CC.Input → World): the bot
// bypasses the input layer, so this suite is the proof that fingers work.
//   node tests/e2e/functional.js                          (all: 4 devices + 10 bot sessions)
//   ONLY=iphone-portrait node tests/e2e/functional.js     (one device, no bot sessions)
//   TESTS=tap_right,song_swipe node tests/e2e/functional.js   (a subset of the per-device tests)
//   SKIP_BOT=1 node tests/e2e/functional.js               (skip the full bot sessions)
// Writes screenshots + results.json to tests/out/functional/. Exits 1 on any failure.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'functional'); fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, extra: true },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2, extra: true },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
];
const BOT_RUNS = [];
[3, 4, 5, 6, 7].forEach((age, i) => ['en', 'vi'].forEach((lang, j) => BOT_RUNS.push({ age, lang, dev: (i + j) % 4 })));
const BOT_SPEED = +process.env.BOT_SPEED || 10, BOT_PAR = +process.env.BOT_PAR || 4;
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
// a raw i18n key, an unfilled {param}, or a JS hole in a spoken line
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object|\b(ui|p|talk|topic|weather|right|wrong|surprise|hedgehog|bird|firefly|kiki|count|name|idle|session)\.[a-z0-9]/i;

const results = [];
function record(device, test, ok, detail) {
  results.push({ device, test, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(16)} ${test}${ok ? '' : '  — ' + detail}`);
}
class Fail extends Error {}
const check = (cond, msg) => { if (!cond) throw new Fail(msg); };

// test-only instrumentation: every prompt the game builds and every line it sends to the voice (uncapped), and a
// page-side helper for finding safe touch points
const INIT = () => {
  window.__asks = []; window.__said = []; window.__ev = [];
  const CC = window.CC = window.CC || {};
  let i18n, voice;
  Object.defineProperty(CC, 'I18N', { configurable: true, get: () => i18n, set: v => {
    i18n = v;
    if (v && v.ask && !v.ask.__wrapped) { const o = v.ask; v.ask = function (lang, key) { const r = o.apply(this, arguments); window.__asks.push({ lang, key, text: r }); return r; }; v.ask.__wrapped = true; }
  } });
  Object.defineProperty(CC, 'Voice', { configurable: true, get: () => voice, set: v => {
    voice = v;
    if (v && v.say && !v.say.__wrapped) { const o = v.say; v.say = function (text, opts) { window.__said.push({ text: String(text), lang: (opts && opts.lang) || v._lang, t: performance.now() }); return o.apply(this, arguments); }; v.say.__wrapped = true; }
  } });
  window.__qa = {
    // full world events (CC.debug.events keeps only type + id): wrap world._emit once per world
    hook() {
      const w = CC.debug.world;
      if (!w || w.__qa) return;
      const o = w._emit; w.__qa = true;
      w._emit = function (e) { const c = {}; for (const k in e) { const v = e[k]; c[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; } c._t = w.time; window.__ev.push(c); return o.call(this, e); };
    },
    v() { return CC.debug.view(); },
    toL(x, y) { const v = CC.debug.view(); return { x: (x - v.left) / v.s, y: (y - v.top) / v.s }; },
    // a CSS-px point on the bare canvas (no DOM above it), clear of every chime (+ margin for the swing), Kiki and
    // the surprises; inBand: inside the beam band (true) / outside it (false) / either (null)
    softPoint(inBand) {
      const w = CC.debug.world, L = w.layout, v = CC.debug.view(), band = L.band, kb = L.kikiBox;
      const inBox = (b, x, y) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;
      const cands = [];
      for (let gx = 0.03; gx < 0.98; gx += 0.025) for (let gy = 0.05; gy < 0.95; gy += 0.025) {
        const cx = innerWidth * gx, cy = innerHeight * gy, p = this.toL(cx, cy);
        if (p.x < 10 || p.y < 10 || p.x > L.W - 10 || p.y > L.groundY - 10) continue;
        const el = document.elementFromPoint(cx, cy); if (!el || el.id !== 'game') continue;
        if (inBand === true && !inBox(band, p.x, p.y)) continue;
        if (inBand === false && inBox(band, p.x, p.y)) continue;
        if (inBox({ x: kb.x - 20, y: kb.y - 20, w: kb.w + 40, h: kb.h + 40 }, p.x, p.y)) continue;
        if (!w._clearOfChimes(p.x, p.y, 90)) continue;
        if (w._chimeAt(p.x, p.y)) continue;
        if (!w._clearOfKeep(p.x, p.y, 48)) continue;   // the bubble / HUD boxes (even while the DOM bubble is hidden)
        const s = [w.hedgehogHit(), w.birdHit(), w.fireflyHit()].filter(Boolean);
        if (s.some(c => Math.hypot(p.x - c.x, p.y - c.y) < c.r + 40)) continue;
        cands.push({ x: Math.round(cx), y: Math.round(cy) });
      }
      void v;
      return cands.length ? cands[Math.floor(cands.length / 2)] : null;
    },
    hang() { return CC.debug.world.chimes.filter(c => c.state === 'hang'); },
    // a CSS-px point on chime id's RIM (between its core and its hit circle), not on any other chime, on the bare canvas
    rimPoint(id) {
      const w = CC.debug.world, c = w.chimeById(id), rc = w._coreR(c), rh = w._hitR(c), d = (rc + rh) / 2;
      for (let k = 0; k < 24; k++) {
        const a = Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12;   // below the body first, then around
        const x = c.cx + Math.cos(a) * d, y = c.cy + Math.sin(a) * d;
        if (w._chimeAt(x, y) !== c) continue;
        if (w.chimes.some(q => q !== c && q.state !== 'gone' && Math.hypot(x - q.cx, y - q.cy) <= w._hitR(q) + 6)) continue;
        if (!w._clearOfKeep(x, y, 20)) continue;
        const sp = CC.debug.toScreen(x, y), el = document.elementFromPoint(sp.x, sp.y);
        if (!el || el.id !== 'game') continue;
        return { x: Math.round(sp.x), y: Math.round(sp.y), dist: Math.hypot(x - c.cx, y - c.cy), rc, rh, s: CC.debug.view().s };
      }
      return null;
    },
    // every hanging chime's body (circle at its centre, r = 0.45 size) inside the CSS viewport?
    outside() {
      const w = CC.debug.world, v = CC.debug.view(), out = [];
      for (const c of w.chimes) {
        if (c.state === 'gone') continue;
        const p = CC.debug.toScreen(c.cx, c.cy), r = Math.min(c.bw || c.size, c.bh || c.size) * 0.45 * v.s;
        if (p.x - r < -1 || p.y - r < -1 || p.x + r > innerWidth + 1 || p.y + r > innerHeight + 1) out.push(`${c.id} ${c.state} at ${Math.round(p.x)},${Math.round(p.y)} r ${Math.round(r)}`);
        const hk = CC.debug.toScreen(c.hookX, c.hookY);
        if (hk.x < 0 || hk.x > innerWidth || hk.y < 0 || hk.y > innerHeight) out.push(`${c.id} hook at ${Math.round(hk.x)},${Math.round(hk.y)}`);
      }
      return out;
    }
  };
};

/* ---------------------------------------------------------------- touch helpers (CDP) */
const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
async function touchStart(cdp, pts) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts }); }
async function touchMove(cdp, pts) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts }); }
async function touchEnd(cdp, pts = []) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts }); }
/** a real finger: press at a, n moves in a straight line (plus an optional bow) to b, lift */
async function swipe(cdp, page, a, b, { n = 16, ms = 450, bow = 0, hold = 40 } = {}) {
  await touchStart(cdp, [tp(a.x, a.y)]);
  await page.waitForTimeout(50);
  for (let i = 1; i <= n; i++) {
    const u = i / n, bw = Math.sin(u * Math.PI) * bow;
    await touchMove(cdp, [tp(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u - bw)]);
    await page.waitForTimeout(ms / n);
  }
  await page.waitForTimeout(hold);
  await touchEnd(cdp);
}
async function tap(cdp, page, p, hold = 80) {
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(hold);
  await touchEnd(cdp);
}
async function tapEl(page, sel) {
  // wait until the element stopped moving (panels pop in with a 0.32 s scale animation)
  let b = null;
  for (let k = 0; k < 12; k++) {
    const b1 = await page.locator(sel).first().boundingBox();
    await page.waitForTimeout(80);
    b = await page.locator(sel).first().boundingBox();
    if (b1 && b && Math.abs(b1.x - b.x) < 0.5 && Math.abs(b1.y - b.y) < 0.5 && Math.abs(b1.width - b.width) < 0.5) break;
  }
  check(b, 'element not visible: ' + sel);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
const evLen = page => page.evaluate(() => window.__ev.length);
const evSince = (page, n0) => page.evaluate(n => window.__ev.slice(n), n0);
const types = evs => evs.map(e => e.type + (e.type === 'ring' ? (e.judged ? '!' : e.brush ? '~' : '') + e.id : (e.id ? ':' + e.id : ''))).join(',');
const visible = (page, id) => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);
const said = (page, n0) => page.evaluate(n => window.__said.slice(n).map(s => s.text), n0);
const saidLen = page => page.evaluate(() => window.__said.length);

/* ---------------------------------------------------------------- setup */
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
  await page.waitForFunction(() => window.CC && CC.debug && CC.debug.mode === 'title' && CC.debug.world, null, { timeout: 20000 });
  await page.evaluate(() => window.__qa.hook());
  await page.waitForTimeout(250);
}
/** a fresh chapter of `topic` (level `level`) at `age`; waits for the first open ask (speed 1 once it is open) */
async function setupRound(page, url, { topic = 'colors', age = 4, seed = 3, lang = '', level = 0, prep = null } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}${lang ? '&lang=' + lang : ''}`);
  await page.evaluate(([t, lv, prep]) => {
    CC.debug.startGame(); const w = CC.debug.world; w.levels[lv] = t; w.startLevel(lv);
    if (prep) (new Function('w', prep))(w);
    CC.debug.setSpeed(4);
  }, [topic, level, prep]);
  await waitAsk(page);
}
async function waitAsk(page, timeout = 20000) {
  await page.evaluate(() => CC.debug.setSpeed(4));
  await page.waitForFunction(() => { const w = CC.debug.world, a = CC.debug.answer(); return w.interactive && a && a.chime != null && w.chimes.every(c => c.state === 'hang'); }, null, { timeout, polling: 'raf' });
  await page.evaluate(() => CC.debug.setSpeed(1));
  await page.waitForTimeout(350);   // the chimes settle a little (breeze only)
}
/** finish the current round with the bot (fast), stop the bot at the next round's first ask */
async function botToNextRound(page, timeout = 60000) {
  const r0 = await page.evaluate(() => CC.debug.world.round);
  await page.evaluate(() => { CC.debug.setBot(true, 1); CC.debug.setSpeed(6); });
  await page.waitForFunction(r => { const w = CC.debug.world; return w.state === 'round' && w.round !== r && w.phase === 'enter'; }, r0, { timeout, polling: 'raf' });
  await page.evaluate(() => CC.debug.setBot(false));
  await waitAsk(page);
}
async function info(page) {
  return page.evaluate(() => {
    const w = CC.debug.world, a = CC.debug.answer();
    const hang = w.chimes.filter(c => c.state === 'hang');
    const others = hang.filter(c => c.id !== a.chime && !c.done).map(c => ({ id: c.id, at: CC.debug.chimeScreen(c.id) }));
    return { a: a.chime, at: CC.debug.chimeScreen(a.chime), others, all: hang.map(c => ({ id: c.id, at: CC.debug.chimeScreen(c.id), done: c.done })), misses: w.misses };
  });
}
async function shot(page, d, name) { try { await page.screenshot({ path: path.join(OUT, `${d.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
async function finishRoundByTaps(cdp, page) {
  for (let k = 0; k < 14; k++) {
    try { await page.waitForFunction(() => CC.debug.world.state === 'roundDone' || (CC.debug.world.interactive && CC.debug.answer() && CC.debug.answer().chime != null), null, { timeout: 8000 }); } catch (e) { /* retry */ }
    if (await page.evaluate(() => CC.debug.world.state === 'roundDone')) return true;
    await page.waitForTimeout(250);
    const at = await page.evaluate(() => { const a = CC.debug.answer(); return CC.debug.world.interactive && a && a.chime != null ? CC.debug.chimeScreen(a.chime) : null; });
    if (at) { await tap(cdp, page, at); await page.waitForTimeout(600); }
  }
  return page.evaluate(() => CC.debug.world.state === 'roundDone');
}

/* ---------------------------------------------------------------- tests */
const T = {};
T.boot_title = async ({ page, url, d, errors }) => {
  const e0 = errors.length;
  await gotoTitle(page, url + '?mute=1&seed=3');
  await page.waitForTimeout(800);
  await shot(page, d, '0-title');
  check(/Kiki/.test(await page.title()), 'document title: ' + await page.title());
  check(await visible(page, 'scrTitle'), 'title screen hidden');
  check(!(await visible(page, 'loading')), 'loading screen still shown');
  const pb = await page.locator('#btnPlay').boundingBox();
  check(pb && pb.width >= 44 && pb.height >= 44, 'play button too small / missing: ' + JSON.stringify(pb));
  check(pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= d.viewport.width && pb.y + pb.height <= d.viewport.height, 'play button off screen');
  const gb = await page.locator('#btnParents').boundingBox();
  check(gb && gb.width >= 40 && gb.x + gb.width <= d.viewport.width && gb.y >= 0, 'gear button: ' + JSON.stringify(gb));
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => CC.debug.mode === 'play', null, { timeout: 5000 });
  await page.waitForFunction(() => CC.debug.world.state === 'round', null, { timeout: 15000 });
  check(await visible(page, 'hud'), 'HUD not shown in play');
  await page.waitForTimeout(1500);
  check(errors.length === e0, 'boot errors: ' + errors.slice(e0).join(' | '));
};
T.tap_right = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await info(page);
  const n0 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(1100);   // the note flies 0.7 s to its lantern
  await shot(page, d, '1-right');
  const evs = await evSince(page, n0);
  const st = await page.evaluate(id => ({ done: CC.debug.world.chimeById(id).done, lit: CC.debug.world.lanterns.map(l => l.lit), om: CC.debug.world.chimeById(id).omega }), i.a);
  check(evs.some(e => e.type === 'ring' && e.judged && e.id === i.a && !e.dull), 'no judged ring on the asked chime: ' + types(evs));
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'no right event: ' + types(evs));
  check(!evs.some(e => e.type === 'wrong'), 'a wrong event on the right tap: ' + types(evs));
  check(evs.some(e => e.type === 'lantern'), 'no lantern event: ' + types(evs));
  check(st.done && st.lit[0] > 0.9, 'chime not done / lantern 0 not lit: ' + JSON.stringify(st));
};
T.tap_wrong = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  let i = await info(page);
  if (!i.others.length) { await botToNextRound(page); i = await info(page); }
  check(i.others.length, 'no other chime to tap');
  const n0 = await evLen(page), stars0 = await page.evaluate(() => CC.debug.world.stars);
  await tap(cdp, page, i.others[0].at);
  await page.waitForTimeout(400);
  await shot(page, d, '2-wrong');
  const evs = await evSince(page, n0);
  const s = await page.evaluate(([id]) => { const w = CC.debug.world; return { misses: w.misses, state: w.state, phase: w.phase, inter: w.interactive, done: w.chimeById(id).done, ans: CC.debug.answer() }; }, [i.others[0].id]);
  check(evs.some(e => e.type === 'wrong' && e.id === i.others[0].id), 'no wrong event: ' + types(evs));
  check(evs.some(e => e.type === 'ring' && e.judged && e.dull), 'the wrong ring is not dull: ' + types(evs));
  check(!evs.some(e => e.type === 'right'), 'right on a wrong chime');
  check(s.misses === 1 && s.state === 'round' && s.phase === 'play' && s.inter && !s.done && s.ans && s.ans.chime === i.a, 'after one wrong tap: ' + JSON.stringify(s));
  // no fail state: the right chime still works, and the round's stars just drop to 2
  await tap(cdp, page, i.at);
  await page.waitForTimeout(300);
  const ev2 = await evSince(page, n0);
  check(ev2.some(e => e.type === 'right' && e.id === i.a), 'the right chime after a wrong one: ' + types(ev2));
  const ok = await finishRoundByTaps(cdp, page);
  check(ok, 'round did not finish');
  const rd = (await evSince(page, n0)).find(e => e.type === 'roundDone');
  check(rd && rd.stars === 2 && rd.misses === 1, 'round stars after one miss: ' + JSON.stringify(rd));
  check(await page.evaluate(() => CC.debug.world.stars) === stars0 + 2, 'stars did not go up by 2');
};
T.swipe_from_right = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 4 });
  let i = await info(page);
  if (!i.others.length) { await botToNextRound(page); i = await info(page); }
  // start ON the asked chime, swipe straight through the farthest other chime (and every one in between)
  const far = i.others.slice().sort((p, q) => Math.abs(q.at.x - i.at.x) - Math.abs(p.at.x - i.at.x))[0];
  const dx = far.at.x - i.at.x, dy = far.at.y - i.at.y, k = 1 + (far.at.r * 0.6) / Math.hypot(dx, dy);
  const end = { x: Math.max(4, Math.min(d.viewport.width - 4, i.at.x + dx * k)), y: i.at.y + dy * k };
  const n0 = await evLen(page);
  await swipe(cdp, page, i.at, end, { n: 18, ms: 500 });
  await page.waitForTimeout(400);
  await shot(page, d, '3-swipe');
  const evs = await evSince(page, n0);
  const judged = evs.filter(e => e.type === 'ring' && e.judged), brush = evs.filter(e => e.type === 'ring' && e.brush);
  check(judged.length === 1 && judged[0].id === i.a, 'judged rings: ' + types(evs));
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'no right for the first contact: ' + types(evs));
  check(!evs.some(e => e.type === 'wrong'), 'a later chime of the swipe was judged wrong: ' + types(evs));
  check(brush.some(e => e.id === far.id), 'the swipe did not brush the far chime ' + far.id + ': ' + types(evs));
  check(await page.evaluate(() => CC.debug.world.misses) === 0, 'misses after a right swipe');
};
T.swipe_from_sky = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 5 });
  const s = await page.evaluate(() => {
    const w = CC.debug.world, L = w.layout, y = w._chimeMidY ? w._chimeMidY() : L.beam.hookY + 120;
    const hang = w.chimes.filter(c => c.state === 'hang').sort((a, b) => a.cx - b.cx);
    // start left of the leftmost chime's circle on empty sky (not Kiki), end right of the rightmost
    const first = hang[0], lastC = hang[hang.length - 1];
    let x0 = first.cx - w._hitR(first) - 30;
    const inK = (x, yy) => { const b = L.kikiBox; return x >= b.x && x <= b.x + b.w && yy >= b.y && yy <= b.y + b.h; };
    while (x0 > 8 && (w._chimeAt(x0, y) || inK(x0, y))) x0 -= 10;
    x0 = Math.max(8, x0);
    const x1 = Math.min(L.W - 8, lastC.cx + w._hitR(lastC) + 30);
    // expected judged chime (fairSwipe): the first body CORE the straight path enters; margin = how clear the entry is
    const cores = hang.map(c => { const r = w._coreR(c), dy = Math.abs(c.cy - y); return dy < r ? { id: c.id, xin: c.cx - Math.sqrt(r * r - dy * dy), slack: r - dy } : null; }).filter(Boolean).sort((p, q) => p.xin - q.xin);
    const a = CC.debug.toScreen(x0, y), b = CC.debug.toScreen(x1, y);
    const el = document.elementFromPoint(a.x, a.y);
    return { a, b, expect: cores[0] || null, onChime: !!w._chimeAt(x0, y), el: el && el.id, ans: CC.debug.answer().chime };
  });
  check(!s.onChime && s.el === 'game', 'no empty start point: ' + JSON.stringify(s));
  const n0 = await evLen(page);
  await swipe(cdp, page, s.a, s.b, { n: 24, ms: 700 });
  await page.waitForTimeout(400);
  const evs = await evSince(page, n0);
  const rings = evs.filter(e => e.type === 'ring'), judged = rings.filter(e => e.judged), ji = rings.findIndex(e => e.judged);
  check(evs[0] && evs[0].type === 'soft', 'the press on empty sky gave no soft event first: ' + types(evs));
  check(judged.length <= 1, 'more than one judged ring in one swipe: ' + types(evs));
  check(rings.every((e, k) => e.judged || e.brush), 'a ring that is neither judged nor brush: ' + types(evs));
  console.log(`      swipe_from_sky ${d.name}: expected first core ${s.expect ? s.expect.id + ' (slack ' + s.expect.slack.toFixed(0) + ')' : 'none'}, judged ${judged.map(e => e.id).join(',') || 'none'}, asked ${s.ans}`);
  if (s.expect && s.expect.slack > 12) {
    check(judged.length === 1 && judged[0].id === s.expect.id, `judged ${judged[0] && judged[0].id}, expected the first core entered ${s.expect.id}: ` + types(evs));
    const want = judged[0].id === s.ans ? 'right' : 'wrong';
    check(evs.some(e => e.type === want && e.id === judged[0].id), `the judged chime ${judged[0].id} (asked ${s.ans}) gave no ${want}: ` + types(evs));
    check(rings.slice(0, ji).every(e => e.brush), 'rings before the judged one are not brushes: ' + types(evs));
  }
  check(rings.length >= 2, 'the swipe across the band rang only ' + rings.length + ' chime(s): ' + types(evs));
  const m = await page.evaluate(() => CC.debug.world.misses);
  const wantM = judged.length && judged[0].id !== s.ans ? 1 : 0;
  check(m === wantM, 'misses ' + m + ' (the sky start / rim brushes must not count as a miss)');
  check(!evs.some(e => e.type === 'hint'), 'a hint after one swipe: ' + types(evs));
};
T.rim_tap = async ({ page, cdp, url, d }) => {
  // fairSwipe: a press on the asked chime's rim only brushes; released without sliding it is judged as a tap on that chime
  await setupRound(page, url, { seed: 19 });
  let i = await info(page);
  let p = await page.evaluate(id => window.__qa.rimPoint(id), i.a);
  check(p, 'no rim point on the asked chime');
  let n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(90);
  const mid = await evSince(page, n0);
  await touchEnd(cdp);
  await page.waitForTimeout(350);
  let evs = await evSince(page, n0);
  check(mid.some(e => e.type === 'ring' && e.brush && e.id === i.a) && !mid.some(e => e.type === 'right' || e.type === 'wrong'), 'rim press (finger still down) was not just a brush: ' + types(mid));
  check(evs.some(e => e.type === 'ring' && e.judged && e.id === i.a) && evs.some(e => e.type === 'right' && e.id === i.a), 'rim tap not judged right on release: ' + types(evs));
  // a rim press on ANOTHER chime that slides away ≥ 24 px into empty sky: a brush only, never a mistake
  await waitAsk(page);
  i = await info(page);
  if (!i.others.length) return;
  const o = i.others[0];
  p = await page.evaluate(id => window.__qa.rimPoint(id), o.id);
  check(p, 'no rim point on another chime');
  const away = await page.evaluate(([px, py, id]) => {
    const w = CC.debug.world, c = w.chimeById(id), v = CC.debug.view(), q = window.__qa.toL(px, py);
    const dx = q.x - c.cx, dy = q.y - c.cy, n = Math.hypot(dx, dy) || 1;
    for (let k = 40; k <= 90; k += 10) { const x = q.x + dx / n * k, y = q.y + dy / n * k; if (!w._chimeAt(x, y) && !w.chimes.some(z => z.state !== 'gone' && Math.hypot(x - z.cx, y - z.cy) <= w._coreR(z) + 4)) { const s = CC.debug.toScreen(x, y); return { x: s.x, y: s.y }; } }
    void v; return null;
  }, [p.x, p.y, o.id]);
  if (!away) return;   // nowhere empty next to it: the slide case is covered by swipe_from_sky
  n0 = await evLen(page);
  await swipe(cdp, page, p, away, { n: 6, ms: 150 });
  await page.waitForTimeout(300);
  evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'wrong' || e.type === 'right' || (e.type === 'ring' && e.judged)), 'a rim press that slid off was judged: ' + types(evs));
  check(evs.some(e => e.type === 'ring' && e.brush && e.id === o.id), 'the rim press did not brush its chime: ' + types(evs));
  check(await page.evaluate(() => CC.debug.world.misses) === 0, 'a rim slide counted as a miss');
};
T.tap_sky_soft = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  for (const band of [false, true]) {
    const p = await page.evaluate(b => window.__qa.softPoint(b), band);
    check(p, 'no empty ' + (band ? 'band' : 'sky') + ' point found');
    const n0 = await evLen(page);
    await tap(cdp, page, p, 70);
    await page.waitForTimeout(300);
    const evs = await evSince(page, n0);
    // the 2nd no-progress press may bring the hint (by design); nothing may ring or count as wrong
    check(evs.length && evs[0].type === 'soft' && evs.every(e => ['soft', 'hint', 'assistArmed'].includes(e.type)), `tap on empty ${band ? 'band' : 'sky'} at ${p.x},${p.y}: ` + types(evs));
    check(evs[0].kind === (band ? 'beam' : 'sky'), 'soft kind: ' + evs[0].kind);
  }
  const s = await page.evaluate(() => ({ m: CC.debug.world.misses, st: CC.debug.world.state, ph: CC.debug.world.phase }));
  check(s.m === 0 && s.st === 'round' && s.ph === 'play', 'after soft taps: ' + JSON.stringify(s));
};
T.two_misses_hint = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { age: 5, topic: 'animals', seed: 6 });   // age 5: assist only after 6
  let i = await info(page);
  if (!i.others.length) { await botToNextRound(page); i = await info(page); }
  const L0 = await saidLen(page);
  const n0 = await evLen(page);
  await tap(cdp, page, i.others[0].at); await page.waitForTimeout(500);
  let evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'hint'), 'hint after one miss: ' + types(evs));
  const p = await page.evaluate(() => window.__qa.softPoint(true));
  check(p, 'no soft point');
  await tap(cdp, page, p); await page.waitForTimeout(500);   // a soft press is the 2nd "no progress"
  evs = await evSince(page, n0);
  const h = evs.find(e => e.type === 'hint');
  check(h && h.id === i.a, 'no hint on the asked chime after a miss + a soft press: ' + types(evs));
  await shot(page, d, '4-hint');
  const g = await page.evaluate(id => ({ glow: CC.debug.world.chimeById(id).glow, hand: !!CC.debug.world.hintHand, m: CC.debug.world.misses }), i.a);
  check(g.hand && g.m === 1, 'hint hand / misses: ' + JSON.stringify(g));
  const lines = await said(page, L0);
  check(lines.length >= 2, 'no wrong + hint lines spoken: ' + JSON.stringify(lines));
  check(!evs.some(e => e.type === 'assistArmed'), 'assist armed at age 5 after 2 no-progress presses');
};
T.assist_young = async ({ page, cdp, url }) => {
  await setupRound(page, url, { age: 4, seed: 7 });
  const n0 = await evLen(page);
  const i = await info(page);
  for (let k = 0; k < 3; k++) {
    const p = await page.evaluate(() => window.__qa.softPoint(true));
    check(p, 'no soft band point');
    await tap(cdp, page, p, 60); await page.waitForTimeout(350);
  }
  let evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'hint'), 'no hint after soft presses: ' + types(evs));
  check(evs.some(e => e.type === 'assistArmed' && e.id === i.a), 'no assistArmed after 3 no-progress presses at age 4: ' + types(evs));
  const p = await page.evaluate(() => window.__qa.softPoint(true));
  const n1 = await evLen(page);
  await tap(cdp, page, p, 60); await page.waitForTimeout(400);
  evs = await evSince(page, n1);
  check(evs.some(e => e.type === 'assist' && e.id === i.a) && evs.some(e => e.type === 'right' && e.id === i.a), 'the assisted press did not ring the asked chime: ' + types(evs));
  check(await page.evaluate(() => CC.debug.world.misses) === 0, 'soft presses counted as misses');
  const n2 = await evLen(page);
  check(await finishRoundByTaps(cdp, page), 'assisted round did not finish');
  const rd = (await evSince(page, n2)).find(e => e.type === 'roundDone');
  check(rd && rd.stars <= 2, 'an assisted round gave ' + (rd && rd.stars) + ' stars (want ≤ 2)');
};
T.count_strings = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { topic: 'count', age: 4, seed: 8 });
  const i = await info(page);
  const th = await page.evaluate(id => CC.debug.world.chimeById(id).thing, i.a);
  check(th.kind === 'string' && th.n >= 1, 'not a bell-string round: ' + JSON.stringify(th));
  const L0 = await saidLen(page), n0 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(700 + 550 * th.n);
  await shot(page, d, '5-count');
  const evs = await evSince(page, n0);
  const counts = evs.filter(e => e.type === 'count' && e.id === i.a);
  check(evs.some(e => e.type === 'right' && e.id === i.a && e.count && e.count.n === th.n), 'no right with count: ' + types(evs));
  check(counts.length === th.n, `count events ${counts.length} for a string of ${th.n}: ` + types(evs));
  check(counts.every((e, k) => e.i === k + 1 || e.i === k), 'count indices: ' + counts.map(e => e.i).join(','));
  const lines = await said(page, L0);
  check(lines.some(t => /one/i.test(t) && /bell/i.test(t)), 'no count run ("One, … bells!") in the voice: ' + JSON.stringify(lines));
};
T.song_swipe = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 9 });
  check(await finishRoundByTaps(cdp, page), 'round not finished');
  await page.waitForFunction(() => { const a = CC.debug.answer(); return a && a.song; }, null, { timeout: 8000 });
  await page.waitForTimeout(500);
  const B = await page.evaluate(() => { const w = CC.debug.world, y = w._chimeMidY(); const b = w.layout.beam; return { a: CC.debug.toScreen(b.x0 + 6, y), b: CC.debug.toScreen(b.x1 - 6, y), n: w.chimes.filter(c => c.state === 'hang').length }; });
  const n0 = await evLen(page);
  await swipe(cdp, page, B.a, B.b, { n: 20, ms: 500 });
  await page.waitForTimeout(400 + 160 * B.n + 900);
  await shot(page, d, '6-song');
  const evs = await evSince(page, n0);
  const notes = evs.filter(e => e.type === 'songNote'), done = evs.find(e => e.type === 'songDone');
  check(notes.length === B.n, `songNotes ${notes.length} for ${B.n} chimes: ` + types(evs));
  check(notes.every((e, k) => e.i === k), 'cascade order: ' + notes.map(e => e.i).join(','));
  check(done && done.auto === false, 'songDone after a real swipe: ' + JSON.stringify(done));
  check(!evs.some(e => e.type === 'wrong'), 'wrong during song');
};
T.song_band_press = async ({ page, cdp, url, d }) => {
  // a press on the empty beam band in song time plays the song (cascade from the nearest chime)
  await setupRound(page, url, { seed: 20 });
  check(await finishRoundByTaps(cdp, page), 'round not finished');
  await page.waitForFunction(() => { const a = CC.debug.answer(); return a && a.song; }, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const p = await page.evaluate(() => window.__qa.softPoint(true));
  check(p, 'no empty band point in song time');
  const n = await page.evaluate(() => window.__qa.hang().length);
  const n0 = await evLen(page);
  await tap(cdp, page, p, 70);
  await page.waitForTimeout(400 + 160 * n + 900);
  const evs = await evSince(page, n0);
  const notes = evs.filter(e => e.type === 'songNote'), done = evs.find(e => e.type === 'songDone');
  check(notes.length === n, `band press in song time: songNotes ${notes.length} of ${n}: ` + types(evs));
  check(done && done.auto === false, 'songDone after a band press: ' + JSON.stringify(done));
  check(!evs.some(e => e.type === 'soft'), 'the band press was also a soft press: ' + types(evs));
};
T.song_auto = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 10 });
  check(await finishRoundByTaps(cdp, page), 'round not finished');
  const n0 = await evLen(page);
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'songDone'), n0, { timeout: 20000 });
  const evs = await evSince(page, n0);
  const ask = evs.find(e => e.type === 'songAsk'), note = evs.find(e => e.type === 'songNote'), done = evs.find(e => e.type === 'songDone');
  check(ask && note, 'no songAsk / songNote: ' + types(evs));
  check(done.auto === true, 'songDone without a touch is not auto: ' + JSON.stringify(done));
  const dt = note._t - ask._t;   // world seconds (a slow headless frame rate stretches wall time: dt is capped per frame)
  check(dt > 3.8 && dt < 4.3, `auto cascade ${dt.toFixed(2)} s (world) after songAsk (want 4 s)`);
};
T.kiki_repeat = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 11 });
  await page.waitForTimeout(3400);   // a Kiki tap repeats only after the prompt had its 3 s
  const prompt = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  const v0 = await page.evaluate(() => CC.debug.voiceLog.length), n0 = await evLen(page);
  const k = await page.evaluate(() => CC.debug.kikiScreen());
  // tap Kiki's body (the tap box centre); a chime under the finger would win, so make sure there is none
  const onChime = await page.evaluate(([x, y]) => { const p = window.__qa.toL(x, y); return !!CC.debug.world._chimeAt(p.x, p.y); }, [k.x, k.y]);
  check(!onChime, 'Kiki\'s centre is under a chime');
  await tap(cdp, page, { x: k.x, y: k.y }, 90);
  await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  const log = await page.evaluate(n => CC.debug.voiceLog.slice(n).map(x => x.text), v0);
  check(evs.some(e => e.type === 'pokeKiki'), 'no pokeKiki on a Kiki tap: ' + types(evs));
  check(log.includes(prompt), 'Kiki tap did not repeat the prompt in voiceLog: ' + JSON.stringify({ prompt, log }));
  check(!evs.some(e => e.type === 'ring' || e.type === 'soft'), 'Kiki tap rang / softed: ' + types(evs));
  check(await page.evaluate(() => CC.debug.world.misses) === 0, 'Kiki tap counted as a miss');
  // tapping the speech bubble also repeats it (and never reaches the canvas)
  const v1 = await page.evaluate(() => CC.debug.voiceLog.length), n1 = await evLen(page);
  await tapEl(page, '#bubble');
  await page.waitForTimeout(300);
  const log2 = await page.evaluate(n => CC.debug.voiceLog.slice(n).map(x => x.text), v1);
  check(log2.includes(prompt), 'bubble tap did not repeat the prompt: ' + JSON.stringify(log2));
  check(!(await evSince(page, n1)).some(e => e.type === 'soft' || e.type === 'ring'), 'bubble tap reached the canvas');
};
T.talk_time_tap = async ({ page, url, d }) => {
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 12 });
  await page.evaluate(() => { CC.debug.setBot(true, 1); CC.debug.setSpeed(8); });
  await page.waitForFunction(() => CC.debug.world.state === 'talk', null, { timeout: 120000, polling: 'raf' });
  await page.evaluate(() => { CC.debug.setBot(false); CC.debug.setSpeed(1); });
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => ({ answered: CC.debug.world.talkAnswered, answer: CC.debug.world.talk.answer, n: document.querySelectorAll('#talkChoices button').length, mode: CC.debug.mode, q: document.getElementById('talkQ').textContent }));
  check(!t.answered, 'bot answered Talk before the test could');
  check(t.mode === 'talk' && await visible(page, 'scrTalk'), 'Talk screen not shown: ' + t.mode);
  check(t.n >= 2 && t.n <= 3, 'Talk choices: ' + t.n);
  check(t.q && !RAW.test(t.q), 'Talk question text: ' + t.q);
  await shot(page, d, '7-talk');
  const s0 = await page.evaluate(() => ({ r: CC.debug.stats.talkRight, st: CC.debug.world.stars }));
  await tapEl(page, `#talkChoices button[data-id="${t.answer}"]`);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ right: CC.debug.stats.talkRight, st: CC.debug.world.stars, cls: document.querySelector('#talkChoices .right') ? 1 : 0 }));
  check(r.right === s0.r + 1 && r.cls && r.st === s0.st + 1, 'tap on the right Talk answer not counted: ' + JSON.stringify(r));
  await page.waitForFunction(() => CC.debug.world.state !== 'talk', null, { timeout: 20000 });
  await page.waitForFunction(() => CC.debug.mode === 'play' && CC.debug.world.state === 'round', null, { timeout: 20000 });
  check(!(await visible(page, 'scrTalk')), 'Talk screen still shown after the answer');
};
T.pause_resume = async ({ page, url }) => {
  await setupRound(page, url);
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => CC.debug.mode) === 'paused' && await visible(page, 'scrPause'), 'pause did not open');
  const t0 = await page.evaluate(() => CC.debug.world.time);
  await page.waitForTimeout(700);
  const t1 = await page.evaluate(() => CC.debug.world.time);
  check(t1 === t0, 'world kept running while paused');
  const L0 = await saidLen(page);
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(700);
  const s = await page.evaluate(n => ({ mode: CC.debug.mode, t: CC.debug.world.time, said: window.__said.slice(n).map(x => x.text), bubble: document.getElementById('bubbleText').textContent }), L0);
  check(s.mode === 'play' && s.t > t1, 'resume did not continue: ' + JSON.stringify(s));
  check(!(await visible(page, 'scrPause')), 'pause screen still shown');
  check(s.said.includes(s.bubble), 'prompt not repeated after resume: ' + JSON.stringify(s.said));
};
T.visibility_pause = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 13 });
  const i = await info(page);
  const p = await page.evaluate(() => window.__qa.softPoint(null));
  // a finger is down on empty sky when the page is hidden
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(80);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ mode: CC.debug.mode, g: !!CC.debug.world._g, down: CC.debug.world.finger.down }));
  check(s.mode === 'paused', 'hidden page did not pause: ' + s.mode);
  check(!s.g && !s.down, 'the gesture was not cancelled when hidden: ' + JSON.stringify(s));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  const n0 = await evLen(page);
  await touchMove(cdp, [tp(i.at.x, i.at.y)]);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ mode: CC.debug.mode }));
  const evs = await evSince(page, n0);
  check(s.mode === 'paused' && !evs.some(e => e.type === 'ring'), 'after becoming visible: ' + JSON.stringify(s) + ' ' + types(evs));
  check(await visible(page, 'scrPause'), 'pause screen not shown after returning');
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => CC.debug.mode) === 'play', 'resume after visibility pause failed');
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tap(cdp, page, j.at);
  await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right'), 'tap after visibility pause did not ring right');
};
T.rotate_mid_round = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 14, age: 5 });
  const p = await page.evaluate(() => window.__qa.softPoint(false));
  check(p, 'no sky point');
  const n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(80);
  await touchMove(cdp, [tp(p.x + 6, p.y + 4)]);
  await page.waitForTimeout(40);
  check(await page.evaluate(() => !!CC.debug.world._g), 'gesture not active before rotating');
  const rot = { width: d.viewport.height, height: d.viewport.width };
  await page.setViewportSize(rot);
  await page.waitForTimeout(500);
  const g1 = await page.evaluate(() => ({ g: !!CC.debug.world._g, W: CC.debug.view().W, H: CC.debug.view().H }));
  // keep moving the same finger straight across every chime of the new layout: nothing may ring
  const pts = await page.evaluate(() => window.__qa.hang().map(c => CC.debug.chimeScreen(c.id)));
  for (const c of pts) { await touchMove(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(40); }
  await touchEnd(cdp);
  await page.waitForTimeout(800);
  await shot(page, d, '8-rotated');
  const evs = await evSince(page, n0);
  const out = await page.evaluate(() => window.__qa.outside());
  check(!g1.g, 'gesture not cancelled by the rotation: ' + JSON.stringify(g1));
  check(!evs.some(e => e.type === 'ring' || e.type === 'right' || e.type === 'wrong'), 'the cancelled gesture still rang: ' + types(evs));
  check(out.length === 0, 'outside the screen after rotation: ' + out.join('; '));
  // fingers work in the new orientation
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tap(cdp, page, j.at);
  await page.waitForTimeout(400);
  const ev2 = await evSince(page, n1);
  // and back: the chimes stay inside the original screen too
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(500);
  const out2 = await page.evaluate(() => window.__qa.outside());
  check(ev2.some(e => e.type === 'right' && e.id === j.a), 'tap after rotation: ' + types(ev2));
  check(out2.length === 0, 'outside the screen after rotating back: ' + out2.join('; '));
};
T.rotate_swinging = async ({ page, cdp, url, d }) => {
  // hard swipes set every chime swinging, then rotate twice: the swung bodies must stay on screen every frame
  await setupRound(page, url, { seed: 15, age: 6 });
  const B = await page.evaluate(() => { const w = CC.debug.world, y = w._chimeMidY(); const b = w.layout.beam; return { a: CC.debug.toScreen(b.x0 - 30, y), b: CC.debug.toScreen(b.x1 + 30, y) }; });
  await swipe(cdp, page, { x: Math.max(3, B.a.x), y: B.a.y }, { x: Math.min(d.viewport.width - 3, B.b.x), y: B.b.y }, { n: 6, ms: 90 });
  await page.evaluate(() => { window.__out = []; const f = () => { const v = CC.debug.view(), fresh = (v.W > v.H) === (innerWidth > innerHeight) && Math.abs(v.cssW - Math.min(innerWidth, innerHeight * v.W / v.H)) < 2;
    if (fresh) window.__fresh = (window.__fresh || 0) + 1;
    const o = fresh ? window.__qa.outside() : []; if (o.length) window.__out.push(o.join('; ')); window.__raf = requestAnimationFrame(f); }; f(); });
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(900);
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(900);
  const o = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__out.slice(0, 3); });
  const fresh = await page.evaluate(() => window.__fresh || 0);
  check(fresh >= 10, 'too few settled frames checked: ' + fresh);
  check(o.length === 0, 'a swinging chime left the screen around a rotation: ' + o.join(' | '));
};
T.second_finger_ignored = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 16 });
  const i = await info(page);
  const p = await page.evaluate(() => window.__qa.softPoint(null));
  const n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y, 1)]);
  await page.waitForTimeout(80);
  await touchStart(cdp, [tp(p.x, p.y, 1), tp(i.at.x, i.at.y, 2)]);   // a second finger lands on the asked chime
  await page.waitForTimeout(80);
  await touchMove(cdp, [tp(p.x, p.y, 1)]);   // finger 2 lifts
  await page.waitForTimeout(60);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'ring'), 'a second finger rang a chime: ' + types(evs));
};
T.surprise_hedgehog = async (ctx) => surpriseTest(ctx, 'hedgehog', 0);
T.surprise_bird = async (ctx) => surpriseTest(ctx, 'bird', 1);
T.surprise_fireflies = async (ctx) => surpriseTest(ctx, 'fireflies', 3);
async function surpriseTest({ page, cdp, url, d }, kind, level) {
  // chapter `level`, the surprise forced into round 1 of type `kind`
  const off = kind === 'hedgehog' ? (2 - level % 2) % 2 : (3 - level % 2) % 2;   // (level + off) % 2 → 0 hedgehog, 1 bird
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 17 + level, level, prep: `w._surpriseRound = 1; w._surpriseOff = ${off};` });
  await botToNextRound(page);
  const sp = await page.evaluate(() => CC.debug.world.surprise);
  check(sp === kind, 'surprise of round 1: ' + sp);
  const fn = { hedgehog: 'hedgehogScreen', bird: 'birdScreen', fireflies: 'fireflyScreen' }[kind];
  // let it arrive (spawn 3–8 s after the first ask) — speed 3 while waiting, then 1
  await page.evaluate(() => CC.debug.setSpeed(3));
  await page.waitForFunction(f => !!CC.debug[f](), fn, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => CC.debug.setSpeed(1));
  await page.waitForTimeout(kind === 'fireflies' ? 400 : 200);
  // never blocks a chime: every chime centre still strikes the chime, and the surprise circle is clear of chime centres
  const chk = await page.evaluate(f => {
    const w = CC.debug.world, s = CC.debug[f](), v = CC.debug.view(), bad = [];
    for (const c of w.chimes.filter(c => c.state === 'hang')) {
      if (w._chimeAt(c.cx, c.cy) !== c) bad.push('chime ' + c.id + ' not hit at its centre');
      const sc = CC.debug.toScreen(c.cx, c.cy);
      if (Math.hypot(sc.x - s.x, sc.y - s.y) < s.r) bad.push('chime ' + c.id + ' centre inside the ' + f + ' circle');
    }
    const el = document.elementFromPoint(s.x, s.y);
    if (!el || el.id !== 'game') bad.push('surprise under DOM ' + (el && (el.id || el.className)));
    if (s.x < 0 || s.y < 0 || s.x > innerWidth || s.y > innerHeight) bad.push('surprise off screen');
    void v;
    return { s, bad };
  }, fn);
  check(chk.bad.length === 0, kind + ': ' + chk.bad.join('; '));
  await shot(page, d, '9-' + kind);
  const tapEv = { hedgehog: 'hedgehogTap', bird: 'birdTap', fireflies: 'fireflyTap' }[kind];
  const s2 = await page.evaluate(f => CC.debug[f](), fn);   // fresh position (it moves)
  check(s2, kind + ' no longer tappable');
  const n0 = await evLen(page);
  await tap(cdp, page, s2, 60);
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  check(evs.some(e => e.type === tapEv), `tap on the ${kind} gave no ${tapEv}: ` + types(evs));
  check(!evs.some(e => e.type === 'ring' || e.type === 'wrong'), `${kind} tap rang a chime: ` + types(evs));
  check(await page.evaluate(() => CC.debug.world.misses) === 0, kind + ' tap counted as a miss');
  // the asked chime still works while the surprise is around
  await waitAsk(page);
  const i = await info(page);
  const n1 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(300);
  evs = await evSince(page, n1);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'asked chime during the ' + kind + ': ' + types(evs));
}
T.language_switch = async ({ page, url, d }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?mute=1&seed=5&age=4');
  await tapEl(page, '.title-top [data-lang="vi"]');
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), age: document.getElementById('titleAge').textContent, title: document.title, saved: CC.debug.getState().settings.lang }));
  check(s.html === 'vi' && /Khỉ Kiki/.test(s.logo) && /Chuông Gió/.test(s.logo) && s.play === 'Chơi' && s.saved === 'vi', 'VI not applied on title: ' + JSON.stringify(s));
  check(/Chuông Gió Lửa Trại/.test(s.title), 'VI document title: ' + s.title);
  await shot(page, d, 'a-title-vi');
  await tapEl(page, '#btnPlay');
  await page.evaluate(() => window.__qa.hook());
  await page.evaluate(() => { const w = CC.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
  await waitAsk(page);
  await shot(page, d, 'b-vi-round');
  const vb = await page.evaluate(() => ({ bubble: document.getElementById('bubbleText').textContent, last: window.__asks.slice(-1)[0], said: window.__said.slice(-4) }));
  check(VI_CHARS.test(vb.bubble) && /chuông|bé/i.test(vb.bubble), 'bubble not Vietnamese: ' + vb.bubble);
  check(vb.last && vb.last.lang === 'vi', 'ask built in ' + (vb.last && vb.last.lang));
  check(vb.said.some(x => x.text === vb.bubble), 'the VI prompt was not sent to the voice: ' + JSON.stringify(vb.said));
  // back to English through pause → home
  await tapEl(page, '#btnPause');
  await page.waitForFunction(() => CC.debug.mode === 'paused');
  check(await page.evaluate(() => document.querySelector('#scrPause h2').textContent) !== 'Paused', 'pause title not translated');
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => CC.debug.mode === 'title');
  await tapEl(page, '.title-top [data-lang="en"]');
  await page.waitForTimeout(200);
  s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), saved: CC.debug.getState().settings.lang }));
  check(s.html === 'en' && /Kiki/.test(s.logo) && /Camp Chimes/.test(s.logo) && s.play === 'Play' && s.saved === 'en', 'EN not restored: ' + JSON.stringify(s));
  await tapEl(page, '#btnPlay');
  await waitAsk(page, 25000);
  const eb = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  check(!VI_CHARS.test(eb) && eb.length > 3, 'bubble not English after switching back: ' + eb);
};
T.parent_gate = async ({ page, cdp, url }) => {
  await gotoTitle(page, url + '?mute=1');
  const g = await page.locator('#btnParents').boundingBox();
  const c = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  await tap(cdp, page, c, 120);
  await page.waitForTimeout(600);
  check(!(await visible(page, 'scrSettings')), 'a short tap on the gear opened settings');
  await page.touchscreen.tap(c.x, c.y);
  await page.waitForTimeout(400);
  check(!(await visible(page, 'scrSettings')), 'page.touchscreen.tap on the gear opened settings');
  // the real hold time in the page (CDP + a busy page can stretch a 1.2 s wait past 2 s): record pointerdown → up
  await page.evaluate(() => { const g = document.getElementById('btnParents'); window.__hold = []; g.addEventListener('pointerdown', () => window.__hold.push(performance.now()), true); g.addEventListener('pointerup', () => window.__hold.push(performance.now()), true); });
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { window.__hold = []; });
    await tap(cdp, page, c, 1200 - k * 300);
    await page.waitForTimeout(300);
    const held = await page.evaluate(() => window.__hold.length >= 2 ? window.__hold[1] - window.__hold[0] : -1);
    const open = await visible(page, 'scrSettings');
    if (held >= 1950) { if (open) { await tapEl(page, '#btnSettingsDone'); await page.waitForTimeout(200); } continue; }   // inconclusive: retry shorter
    check(!open, `a ${Math.round(held)} ms hold opened settings`);
    break;
  }
  // a hold that slides off the gear must not open it either
  await touchStart(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(300);
  await touchMove(cdp, [tp(c.x - 160, c.y + 200)]); await page.waitForTimeout(2000); await touchEnd(cdp);
  await page.waitForTimeout(300);
  const slid = await visible(page, 'scrSettings');
  if (slid) { await tapEl(page, '#btnSettingsDone'); await page.waitForTimeout(200); }
  check(!slid, 'a hold that slid off the gear opened settings');
  await tap(cdp, page, c, 2300);
  await page.waitForTimeout(300);
  check(await visible(page, 'scrSettings'), 'a 2.3 s hold did not open settings');
};
T.settings_persist = async ({ page, cdp, url }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?mute=1');
  const g = await page.locator('#btnParents').boundingBox();
  await tap(cdp, page, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, 2300);
  await page.waitForTimeout(300);
  check(await visible(page, 'scrSettings'), 'settings did not open');
  await tapEl(page, '#ageChips [data-age="6"]');
  await tapEl(page, '#scrSettings [data-lang="vi"]');
  await page.fill('#inpName', 'Mầm');
  for (const id of ['optMusic', 'optSfx']) await page.evaluate(i => { const e = document.getElementById(i); e.checked = false; e.dispatchEvent(new Event('change', { bubbles: true })); }, id);
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '40'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await tapEl(page, '#btnSettingsDone');
  await page.waitForTimeout(200);
  check(await visible(page, 'scrTitle'), 'Done did not return to the title');
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check(keys.includes('cc:settings') && keys.every(k => k.startsWith('cc:')), 'storage keys not under cc: — ' + keys.join(','));
  await gotoTitle(page, url + '?mute=1');
  let s = await page.evaluate(() => ({ st: CC.debug.getState().settings, age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, vol: document.getElementById('optVolume').value, music: document.getElementById('optMusic').checked, sfx: document.getElementById('optSfx').checked, name: document.getElementById('inpName').value }));
  check(s.st.age === 6 && s.st.lang === 'vi' && s.st.name === 'Mầm' && Math.abs(s.st.volume - 0.4) < 1e-6 && s.st.music === false && s.st.sfx === false, 'settings not kept across reload: ' + JSON.stringify(s.st));
  check(/6/.test(s.age) && s.html === 'vi' && s.vol === '40' && !s.music && !s.sfx && s.name === 'Mầm', 'reloaded UI does not show the saved settings: ' + JSON.stringify(s));
  // the name reaches the lines ({child})
  check(await page.evaluate(() => { for (let k = 0; k < 60; k++) if (/Mầm/.test(CC.I18N.t('vi', 'great', {}))) return true; return false; }), 'child name never used by t("great")');
  // URL flags are session-only: they apply but are never saved — even when a setting is changed while they are active
  await gotoTitle(page, url + '?mute=1&age=3&lang=en&speed=2&seed=4');
  s = await page.evaluate(() => ({ age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, wage: CC.debug.world.age }));
  check(/3/.test(s.age) && s.html === 'en', 'URL flags not applied: ' + JSON.stringify(s));
  await tap(cdp, page, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, 2300);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '55'; v.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.fill('#inpName', 'Mam');
  await tapEl(page, '#btnSettingsDone');
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => CC.debug.world.state === 'intro' || CC.debug.world.state === 'round', null, { timeout: 15000 });
  const playAge = await page.evaluate(() => CC.debug.world.age);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('cc:settings')));
  check(playAge === 3, '?age=3 not played: ' + playAge);
  check(stored.age === 6 && stored.lang === 'vi' && stored.speed === undefined && stored.mute === undefined, 'URL flags leaked into saved settings: ' + JSON.stringify(stored));
  check(Math.abs(stored.volume - 0.55) < 1e-6 && stored.name === 'Mam', 'settings changed under URL flags not saved: ' + JSON.stringify(stored));
  await gotoTitle(page, url + '?mute=1');
  s = await page.evaluate(() => ({ st: CC.debug.getState().settings, html: document.documentElement.lang, age: document.getElementById('titleAge').textContent, speed: CC.debug.getState().speed }));
  check(s.st.age === 6 && s.html === 'vi' && /6/.test(s.age) && s.speed === 1, 'flags stuck after reload without them: ' + JSON.stringify(s));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.audio_chain_volume = async ({ page, url }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');   // the unlock gesture
  await page.waitForTimeout(400);
  let a = await page.evaluate(() => { const A = CC.debug.audio(); return A.ctx ? { state: A.ctx.state, master: A.master.gain.value, user: A.user.gain.value, thr: A.comp && A.comp.threshold.value, ratio: A.comp && A.comp.ratio.value, sfx: A.sfx.gain.value, vol: A.volume, chain: !!(A.master && A.comp && A.user && A.sfx && A.music && A.amb) } : null; });
  check(a && a.chain, 'audio chain missing: ' + JSON.stringify(a));
  check(a.thr <= -12 && a.ratio >= 2, 'compressor not set: ' + JSON.stringify(a));
  check(Math.abs(a.user - 1.6) < 0.05 && Math.abs(a.master - 1) < 0.05, 'loud makeup gain not applied: ' + JSON.stringify(a));
  await page.waitForFunction(() => CC.debug.world.state === 'round', null, { timeout: 15000 });
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  for (let k = 0; k < 3; k++) { await tapEl(page, '#btnVolDown'); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: CC.debug.audio().user.gain.value, vol: CC.debug.getState().settings.volume, label: document.getElementById('volLevel').textContent, stored: JSON.parse(localStorage.getItem('cc:settings') || '{}').volume }));
  check(Math.abs(a.vol - 0.7) < 1e-6 && Math.abs(a.stored - 0.7) < 1e-6 && a.label === '70%', 'pause − did not set / save 70 %: ' + JSON.stringify(a));
  check(Math.abs(a.user - 0.7 * 1.6) < 0.08, 'user gain does not follow the volume: ' + JSON.stringify(a));
  // the settings slider: 30 % → user gain 0.48, saved
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => CC.debug.mode === 'title');
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '30'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: CC.debug.audio().user.gain.value, stored: JSON.parse(localStorage.getItem('cc:settings') || '{}').volume }));
  check(Math.abs(a.stored - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06, 'slider 30 %: ' + JSON.stringify(a));
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(500);
  a = await page.evaluate(() => ({ user: CC.debug.audio().user.gain.value, vol: CC.debug.getState().settings.volume, slider: document.getElementById('optVolume').value }));
  check(Math.abs(a.vol - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06 && a.slider === '30', 'volume not restored after reload: ' + JSON.stringify(a));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.release_over_hud = async ({ page, cdp, url }) => {
  // a swipe that ends over the pause button must not pause (the finger is captured by the canvas)
  await setupRound(page, url, { seed: 18 });
  const i = await info(page);
  const pb = await page.locator('#btnPause').boundingBox();
  const n0 = await evLen(page);
  await swipe(cdp, page, i.at, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 }, { n: 12, ms: 300 });
  await page.waitForTimeout(400);
  const evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right'), 'swipe from the asked chime: ' + types(evs));
  check(await page.evaluate(() => CC.debug.mode) === 'play', 'releasing a swipe over the pause button paused the game');
  // and a tap on the HUD never reaches the canvas
  const n1 = await evLen(page);
  const hb = await page.locator('#hudStars').boundingBox();
  await tap(cdp, page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 });
  await page.waitForTimeout(200);
  check(!(await evSince(page, n1)).some(e => e.type === 'soft' || e.type === 'ring'), 'a HUD tap reached the canvas');
};
T.url_age_shown = async ({ page, url }) => {
  const bad = [];
  for (const [q, want] of [['2', 3], ['4.5', 5], ['9', 7]]) {
    await gotoTitle(page, `${url}?mute=1&age=${q}`);
    const s = await page.evaluate(() => ({ title: document.getElementById('titleAge').textContent }));
    await page.evaluate(() => { CC.debug.startGame(); });
    const played = await page.evaluate(() => CC.debug.world.age);
    const shown = (s.title.match(/[\d.]+\+?/) || [''])[0];
    if (played !== want || shown.replace('+', '') !== String(want)) bad.push(`?age=${q}: plays ${played}, title shows "${s.title.trim()}"`);
  }
  check(bad.length === 0, 'the title age differs from the age played: ' + bad.join('; '));
};

const CORE = ['boot_title', 'tap_right', 'tap_wrong', 'swipe_from_right', 'swipe_from_sky', 'rim_tap', 'tap_sky_soft', 'song_swipe', 'song_band_press', 'rotate_mid_round', 'rotate_swinging', 'surprise_hedgehog', 'surprise_bird', 'surprise_fireflies'];
const EXTRA = ['two_misses_hint', 'assist_young', 'count_strings', 'song_auto', 'kiki_repeat', 'talk_time_tap', 'pause_resume', 'visibility_pause',
  'second_finger_ignored', 'language_switch', 'parent_gate', 'settings_persist', 'audio_chain_volume', 'release_over_hud', 'url_age_shown'];

async function runDevice(browser, url, d) {
  const errors = [];
  const { ctx, page, cdp } = await newPage(browser, d, errors);
  let list = CORE.concat(d.extra ? EXTRA : []);
  if (process.env.TESTS) { const want = process.env.TESTS.split(','); list = CORE.concat(EXTRA).filter(t => want.includes(t)); }
  for (const name of list) {
    const e0 = errors.length;
    try {
      await T[name]({ page, cdp, url, d, errors });
      const errs = errors.slice(e0);
      record(d.name, name, errs.length === 0, errs.length ? 'console/page errors: ' + errs.slice(0, 3).join(' | ') : '');
    } catch (e) {
      await shot(page, d, 'fail-' + name);
      let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = CC.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, topic: s.topic, round: s.round, step: s.step, chimes: s.chimes, W: s.W, H: s.H }; })); } catch (x) { /* ignore */ }
      record(d.name, name, false, (e instanceof Fail ? '' : 'exception: ') + (e && e.message ? e.message.split('\n')[0] : e) + (st ? '  state ' + st : ''));
      try { await page.setViewportSize(d.viewport); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); } catch (x) { /* ignore */ }
    }
  }
  await ctx.close();
}

async function runBot(browser, url, r) {
  const d = DEVICES[r.dev], errors = [];
  const name = `bot age ${r.age} ${r.lang}`;
  const { ctx, page } = await newPage(browser, d, errors);
  try {
    const t0 = Date.now();
    await page.goto(`${url}?bot=1&speed=${BOT_SPEED}&autostart=1&mute=1&age=${r.age}&lang=${r.lang}&seed=${20 + r.age}`);
    await page.waitForFunction(() => window.CC && CC.debug && CC.debug.mode === 'done', null, { timeout: 600000, polling: 500 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `bot-age${r.age}-${r.lang}-done.png`) });
    const res = await page.evaluate(() => ({ stats: CC.debug.stats, levels: CC.debug.world.levels, age: CC.debug.world.age, asks: window.__asks, said: window.__said.map(x => ({ text: x.text, lang: x.lang })), log: CC.debug.voiceLog.slice(), doneVisible: !document.getElementById('scrDone').classList.contains('hidden'), doneTitle: document.getElementById('doneTitle').textContent, bubbles: [] }));
    const s = res.stats;
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    check(res.age === r.age, 'played age ' + res.age);
    check(res.doneVisible && res.doneTitle && !RAW.test(res.doneTitle), 'done screen: ' + JSON.stringify(res.doneTitle));
    check(s.rounds >= 12 && s.correct >= 24 && s.talks >= 4 && s.songs >= 12, 'session too short: ' + JSON.stringify(s));
    const saidSet = new Set(res.said.map(x => x.lang + '|' + x.text));
    const missing = res.asks.filter(a => !saidSet.has(a.lang + '|' + a.text));
    check(res.asks.length >= 24, 'too few prompts built: ' + res.asks.length);
    check(res.asks.every(a => a.lang === r.lang), 'prompts in the wrong language: ' + JSON.stringify(res.asks.filter(a => a.lang !== r.lang).slice(0, 2)));
    check(missing.length === 0, `${missing.length}/${res.asks.length} prompts never reached the voice: ` + JSON.stringify(missing.slice(0, 2)));
    const raw = res.said.filter(x => !x.text || RAW.test(x.text));
    check(raw.length === 0, 'spoken lines with a raw key / {param} / undefined: ' + JSON.stringify(raw.slice(0, 4)));
    check(res.log.length > 0 && res.log.every(x => x.lang === r.lang), 'voice log language: ' + JSON.stringify(res.log.filter(x => x.lang !== r.lang).slice(0, 2)));
    const logSet = new Set(res.log.map(x => x.text));
    const tail = res.asks.slice(-10).filter(a => !logSet.has(a.text));
    check(tail.length === 0, 'CC.debug.voiceLog misses recent prompts: ' + JSON.stringify(tail.slice(0, 2)));
    if (r.lang === 'vi') {
      const notVi = res.said.filter(x => !VI_CHARS.test(x.text));
      check(notVi.length / res.said.length < 0.1, 'VI voice has English-looking lines: ' + JSON.stringify(notVi.slice(0, 6).map(x => x.text)));
    } else {
      const bad = res.said.filter(x => VI_CHARS.test(x.text));
      check(bad.length === 0, 'EN voice has Vietnamese lines: ' + JSON.stringify(bad.slice(0, 3)));
    }
    // the done screen's buttons: odd ages "Play again" (a new session starts), even ages "Home" (back to the title)
    const again = r.age % 2 === 1;
    await tapEl(page, again ? '#btnAgain' : '#btnDoneHome');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ mode: CC.debug.mode, sessions: CC.debug.stats.sessions, st: CC.debug.world.state, title: !document.getElementById('scrTitle').classList.contains('hidden'), stars: document.getElementById('titleStars').textContent }));
    if (again) check(after.mode === 'play' && after.sessions === 2 && after.st !== 'sessionDone', 'Play again did not start a new session: ' + JSON.stringify(after));
    else check(after.mode === 'title' && after.title && +after.stars > 0, 'Home from the done screen: ' + JSON.stringify(after));
    check(errors.length === 0, 'errors: ' + errors.slice(0, 3).join(' | '));
    record(d.name, name, true, '');
    console.log(`      ${name}: ${secs}s, topics ${res.levels.join('/')}, rounds ${s.rounds}, right ${s.correct}, wrong ${s.wrong}, brushes ${s.brushes}, hints ${s.hints}, assists ${s.assists}, songs ${s.songs} (auto ${s.songAuto}), talks ${s.talks}, surprises ${s.hedgehogTaps}/${s.birdTaps}/${s.fireflyTaps}, prompts ${res.asks.length}, voice lines ${res.said.length}`);
  } catch (e) {
    let st = ''; try { st = JSON.stringify(await page.evaluate(() => CC.debug.getState())); } catch (x) { /* ignore */ }
    record(d.name, name, false, (e && e.message ? e.message.split('\n')[0] : e) + (st ? '  state ' + st.slice(0, 400) : ''));
  }
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const t0 = Date.now();
  try {
    const devs = DEVICES.filter(d => !process.env.ONLY || d.name === process.env.ONLY);
    for (const d of devs) await runDevice(browser, srv.url, d);
    const bots = process.env.SKIP_BOT || process.env.ONLY || process.env.TESTS ? [] : BOT_RUNS;
    for (let k = 0; k < bots.length; k += BOT_PAR) await Promise.all(bots.slice(k, k + BOT_PAR).map(r => runBot(browser, srv.url, r)));
  } catch (e) { record('-', 'runner', false, String(e && e.stack)); }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ date: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), results }, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log(`  ${f.device} ${f.test}: ${f.detail}`)); }
  process.exit(fails.length ? 1 : 0);
})();
