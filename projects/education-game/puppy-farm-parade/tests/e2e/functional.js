// Functional QA (Bo's Farm Parade) — Playwright, isMobile + hasTouch contexts on iPhone / iPad, portrait + landscape.
// Every tap / flick is a REAL CDP touch sequence (Input.dispatchTouchEvent → pointer events → FP.Input → World): the bot
// bypasses the input layer, so this suite is the proof that fingers work.
//   node tests/e2e/functional.js                          (all: 4 devices + 10 bot sessions, ages 3–7 × EN / VI)
//   ONLY=iphone-portrait node tests/e2e/functional.js     (one device, no bot sessions)
//   TESTS=tap_right,gate_door_tap node tests/e2e/functional.js   (a subset of the per-device tests)
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
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object|\b(ui|p|talk|topic|weather|right|wrong|surprise|chick|rooster|firefly|bo|count|name|idle|session|gate)\.[a-z0-9]/i;

const results = [];
function record(device, test, ok, detail) {
  results.push({ device, test, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(16)} ${test}${ok ? '' : '  — ' + detail}`);
}
class Fail extends Error {}
const check = (cond, msg) => { if (!cond) throw new Fail(msg); };

// test-only instrumentation: every prompt the game builds and every line it sends to the voice, full world events, and a
// page-side helper for finding safe touch points
const INIT = () => {
  window.__asks = []; window.__said = []; window.__ev = [];
  const FP = window.FP = window.FP || {};
  let i18n, voice;
  Object.defineProperty(FP, 'I18N', { configurable: true, get: () => i18n, set: v => {
    i18n = v;
    if (v && v.ask && !v.ask.__wrapped) { const o = v.ask; v.ask = function (lang, key) { const r = o.apply(this, arguments); window.__asks.push({ lang, key, text: r }); return r; }; v.ask.__wrapped = true; }
  } });
  Object.defineProperty(FP, 'Voice', { configurable: true, get: () => voice, set: v => {
    voice = v;
    if (v && v.say && !v.say.__wrapped) { const o = v.say; v.say = function (text, opts) { window.__said.push({ text: String(text), lang: (opts && opts.lang) || v._lang, t: performance.now() }); return o.apply(this, arguments); }; v.say.__wrapped = true; }
  } });
  window.__qa = {
    hook() {
      const w = FP.debug.world;
      if (!w || w.__qa) return;
      const o = w._emit; w.__qa = true;
      w._emit = function (e) { const c = {}; for (const k in e) { const v = e[k]; c[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; } c._t = w.time; window.__ev.push(c); return o.call(this, e); };
    },
    toL(x, y) { const v = FP.debug.view(); return { x: (x - v.left) / v.s, y: (y - v.top) / v.s }; },
    /** a CSS-px point on the bare canvas (no DOM above it), clear of every member (+ margin), Bo, the barn, the stage
     *  member and the surprises — a press there is a 'soft' press */
    softPoint() {
      const w = FP.debug.world, L = w.layout;
      const inBox = (b, x, y, p = 0) => x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p;
      const cands = [];
      for (let gx = 0.04; gx < 0.97; gx += 0.025) for (let gy = 0.08; gy < 0.95; gy += 0.025) {
        const cx = innerWidth * gx, cy = innerHeight * gy, p = this.toL(cx, cy);
        if (p.x < 20 || p.y < 20 || p.x > L.W - 20 || p.y > L.groundY - 10) continue;
        const el = document.elementFromPoint(cx, cy); if (!el || el.id !== 'game') continue;
        if (inBox(L.boBox, p.x, p.y, 30) || inBox(L.barn.box, p.x, p.y, 30) || inBox(L.barn.door.box, p.x, p.y, 20)) continue;
        if (w.members.some(m => m.state !== 'gone' && Math.hypot(p.x - m.cx, p.y - m.cy) < w._hitR(m) + 40)) continue;
        if (!w._clearOfKeep(p.x, p.y, 48)) continue;
        const s = [w.chickHit(), w.roosterHit(), w.fireflyHit()].filter(Boolean);
        if (s.some(c => Math.hypot(p.x - c.x, p.y - c.y) < c.r + 40)) continue;
        if (w._fireflyAt(p.x, p.y)) continue;
        cands.push({ x: Math.round(cx), y: Math.round(cy), lx: p.x, ly: p.y });
      }
      // prefer points near the parade line (the realistic miss)
      cands.sort((a, b) => Math.abs(a.ly - L.line.y + 60) - Math.abs(b.ly - L.line.y + 60));
      return cands.length ? cands[0] : null;
    },
    /** every resting / stage member's body inside the CSS viewport? */
    outside() {
      const w = FP.debug.world, v = FP.debug.view(), out = [];
      for (const m of w.members) {
        if (!['stand', 'stage', 'hop'].includes(m.state)) continue;
        const p = FP.debug.toScreen(m.cx, m.cy), r = m.size * 0.4 * (m.scale || 1) * v.s;
        if (p.x - r < -1 || p.y - r < -1 || p.x + r > innerWidth + 1 || p.y + r > innerHeight + 1) out.push(`${m.id} ${m.state} at ${Math.round(p.x)},${Math.round(p.y)} r ${Math.round(r)}`);
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
async function swipe(cdp, page, a, b, { n = 8, ms = 120, hold = 30 } = {}) {
  await touchStart(cdp, [tp(a.x, a.y)]);
  await page.waitForTimeout(20);
  for (let i = 1; i <= n; i++) { const u = i / n; await touchMove(cdp, [tp(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u)]); await page.waitForTimeout(ms / n); }
  await page.waitForTimeout(hold);
  await touchEnd(cdp);
}
async function tap(cdp, page, p, hold = 80) {
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(hold);
  await touchEnd(cdp);
}
async function tapEl(page, sel) {
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
/** wait for a world event (by type, after index n0) — robust under CPU load, unlike a fixed wall-clock wait (QA P3-5) */
const waitEv = (page, n0, type, timeout = 15000) => page.waitForFunction(([n, t]) => window.__ev.slice(n).some(e => e.type === t), [n0, type], { timeout, polling: 'raf' });
const types = evs => evs.map(e => e.type + (e.id ? ':' + e.id : '')).join(',');
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
  await page.waitForFunction(() => window.FP && FP.debug && FP.debug.mode === 'title' && FP.debug.world, null, { timeout: 20000 });
  await page.evaluate(() => window.__qa.hook());
  await page.waitForTimeout(250);
}
/** a fresh chapter of `topic` (level `level`) at `age`; waits for the first open ask (speed 1 once it is open) */
async function setupRound(page, url, { topic = 'colors', age = 4, seed = 3, lang = '', level = 0, prep = null } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}${lang ? '&lang=' + lang : ''}`);
  await page.evaluate(([t, lv, prep]) => {
    FP.debug.startGame(); const w = FP.debug.world; w.levels[lv] = t; w.startLevel(lv);
    if (prep) (new Function('w', prep))(w);
    FP.debug.setSpeed(4);
  }, [topic, level, prep]);
  await waitAsk(page);
}
const READY = () => { const w = FP.debug.world, a = FP.debug.answer(); return w.interactive && a && a.member != null && w.members.every(m => m.state === 'stand' && !m.walking); };
async function waitAsk(page, timeout = 25000) {
  await page.evaluate(() => FP.debug.setSpeed(4));
  await page.waitForFunction(READY, null, { timeout, polling: 'raf' });
  await page.evaluate(() => FP.debug.setSpeed(1));
  await page.waitForTimeout(250);
}
/** finish the current round with the bot (fast), stop the bot at the next round's first ask */
async function botToNextRound(page, timeout = 60000) {
  const r0 = await page.evaluate(() => FP.debug.world.round);
  await page.evaluate(() => { FP.debug.setBot(true, 1); FP.debug.setSpeed(6); });
  await page.waitForFunction(r => { const w = FP.debug.world; return w.state === 'round' && w.round !== r && w.phase === 'enter'; }, r0, { timeout, polling: 'raf' });
  await page.evaluate(() => FP.debug.setBot(false));
  await waitAsk(page);
}
async function info(page) {
  return page.evaluate(() => {
    const w = FP.debug.world, a = FP.debug.answer();
    const st = w.members.filter(m => m.state === 'stand');
    return { a: a.member, at: FP.debug.memberScreen(a.member), others: st.filter(m => m.id !== a.member).map(m => ({ id: m.id, at: FP.debug.memberScreen(m.id) })), misses: w.misses, n: w.members.length };
  });
}
async function shot(page, d, name) { try { await page.screenshot({ path: path.join(OUT, `${d.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
async function waitGate(page, timeout = 15000) {
  await page.waitForFunction(() => { const a = FP.debug.answer(); return a && a.door; }, null, { timeout, polling: 'raf' });
}

/* ---------------------------------------------------------------- tests */
const T = {};
T.boot_title = async ({ page, url, d, errors }) => {
  const e0 = errors.length;
  await gotoTitle(page, url + '?mute=1&seed=3');
  await page.waitForTimeout(800);
  await shot(page, d, '0-title');
  check(/Bo/.test(await page.title()) && /Farm Parade/.test(await page.title()), 'document title: ' + await page.title());
  check(await visible(page, 'scrTitle'), 'title screen hidden');
  check(!(await visible(page, 'loading')), 'loading screen still shown');
  const pb = await page.locator('#btnPlay').boundingBox();
  check(pb && pb.width >= 44 && pb.height >= 44, 'play button too small / missing: ' + JSON.stringify(pb));
  check(pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= d.viewport.width && pb.y + pb.height <= d.viewport.height, 'play button off screen');
  const gb = await page.locator('#btnParents').boundingBox();
  check(gb && gb.width >= 40 && gb.x + gb.width <= d.viewport.width && gb.y >= 0, 'gear button: ' + JSON.stringify(gb));
  const missing = await page.evaluate(() => FP.Assets.missing.slice());
  check(missing.length === 0, 'assets failed to load: ' + missing.join(', '));
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => FP.debug.mode === 'play', null, { timeout: 5000 });
  await page.waitForFunction(() => FP.debug.world.state === 'round', null, { timeout: 15000 });
  check(await visible(page, 'hud'), 'HUD not shown in play');
  await page.waitForTimeout(1500);
  check(errors.length === e0, 'boot errors: ' + errors.slice(e0).join(' | '));
};
T.tap_right = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await info(page);
  const n0 = await evLen(page), L0 = await saidLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(450);
  await shot(page, d, '1-right-hop');
  await page.waitForTimeout(900);
  const evs = await evSince(page, n0);
  const st = await page.evaluate(id => { const w = FP.debug.world, m = w.memberById(id); return { state: m.state, x: m.x, sx: w.stage.x, mood: w.bo.mood, phase: w.phase }; }, i.a);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'no right event: ' + types(evs));
  check(!evs.some(e => e.type === 'wrong'), 'a wrong event on the right tap: ' + types(evs));
  check(evs.some(e => e.type === 'hop') && evs.some(e => e.type === 'land'), 'no hop / land: ' + types(evs));
  check(evs.some(e => e.type === 'gap'), 'the others did not close the gap: ' + types(evs));
  check(st.state === 'stage' && Math.abs(st.x - st.sx) < 1, 'odd one not on the stage: ' + JSON.stringify(st));
  const lines = await said(page, L0);
  const col = await page.evaluate(id => FP.I18N.name('en', 'color', FP.debug.world.memberById(id).thing.color), i.a);
  check(lines.some(t => t.toLowerCase().includes(String(col).toLowerCase())), `the right line (naming the ${col} one) was not sent to the voice: ` + JSON.stringify(lines));
};
T.tap_wrong = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await info(page);
  check(i.others.length, 'no other member to tap');
  const n0 = await evLen(page), stars0 = await page.evaluate(() => FP.debug.world.stars), L0 = await saidLen(page);
  // slow motion while the two taps land: the 1 s same-member window is WORLD time, so it holds whatever the CPU load
  await page.evaluate(() => FP.debug.setSpeed(0.25));
  await tap(cdp, page, i.others[0].at);
  await waitEv(page, n0, 'wrong');
  // the same member again within 1 s: just wiggles, no new miss
  const w0 = await evLen(page);
  await tap(cdp, page, i.others[0].at);
  await waitEv(page, w0, 'wiggle');
  await page.evaluate(() => FP.debug.setSpeed(1));
  const again = await evSince(page, w0);
  check(await page.evaluate(() => FP.debug.world.misses) === 1 && again.some(e => e.type === 'wiggle' && e.repeat), 'the same member twice: ' + types(again));
  await shot(page, d, '2-wrong');
  const evs = await evSince(page, n0);
  const s = await page.evaluate(() => { const w = FP.debug.world; return { misses: w.misses, state: w.state, phase: w.phase, inter: w.interactive, ans: FP.debug.answer() }; });
  check(evs.some(e => e.type === 'wrong' && e.id === i.others[0].id), 'no wrong event: ' + types(evs));
  check(!evs.some(e => e.type === 'right'), 'right on a matching member');
  check(s.misses === 1 && s.state === 'round' && s.phase === 'play' && s.inter && s.ans && s.ans.member === i.a, 'after one wrong tap: ' + JSON.stringify(s));
  const lines = await said(page, L0);
  check(lines.length >= 1 && lines.every(t => !/\b(no|wrong|oops)\b/i.test(t)), 'kind words after a wrong tap: ' + JSON.stringify(lines));
  // no fail state: the odd one still works, the round's stars drop to 2
  await tap(cdp, page, i.at);
  await page.waitForTimeout(300);
  await waitGate(page);
  const rd = (await evSince(page, n0)).find(e => e.type === 'roundDone');
  check(rd && rd.stars === 2 && rd.misses === 1, 'round stars after one miss: ' + JSON.stringify(rd));
  check(await page.evaluate(() => FP.debug.world.stars) === stars0 + 2, 'stars did not go up by 2');
};
T.tap_empty_soft = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no empty point found');
  const n0 = await evLen(page);
  await tap(cdp, page, p, 70);
  await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  check(evs.length && evs[0].type === 'soft' && evs.every(e => ['soft', 'hint', 'assistArmed'].includes(e.type)), `tap on empty ground at ${p.x},${p.y}: ` + types(evs));
  const s = await page.evaluate(() => ({ m: FP.debug.world.misses, st: FP.debug.world.state, ph: FP.debug.world.phase, puffs: FP.debug.world.puffs.length }));
  check(s.m === 0 && s.st === 'round' && s.ph === 'play', 'after a soft tap: ' + JSON.stringify(s));
};
T.flick_right = async ({ page, cdp, url, d }) => {
  // a press on empty path just below the odd one that slides up onto it within 0.25 s is judged on it
  await setupRound(page, url, { seed: 4 });
  const i = await info(page);
  const start = await page.evaluate(([x, y, r]) => {
    const w = FP.debug.world, q = window.__qa.toL(x, y), v = FP.debug.view();
    for (let k = 1.15; k < 2.2; k += 0.1) { const ly = q.y + r / v.s * k; if (ly > w.layout.groundY - 4) break; if (!w._memberAt(q.x, ly) && !w.chickHit()) { const s = FP.debug.toScreen(q.x, ly); const el = document.elementFromPoint(s.x, s.y); if (el && el.id === 'game') return s; } }
    return null;
  }, [i.at.x, i.at.y, i.at.r]);
  check(start, 'no empty start point below the odd one');
  const n0 = await evLen(page);
  await swipe(cdp, page, start, i.at, { n: 6, ms: 90 });
  await page.waitForTimeout(400);
  const evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'flick onto the odd one: ' + types(evs));
  check(await page.evaluate(() => FP.debug.world.misses) === 0, 'the flick counted a miss');
};
T.gate_door_tap = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 21 });
  const i = await info(page);
  await tap(cdp, page, i.at);
  await waitGate(page);
  await page.waitForTimeout(200);
  const db = await page.evaluate(() => FP.debug.doorScreen());
  const n0 = await evLen(page);
  await tap(cdp, page, { x: db.cx, y: db.cy });
  await page.waitForTimeout(250);
  let evs = await evSince(page, n0);
  const op = evs.find(e => e.type === 'doorOpen');
  check(op && op.auto === false, 'a real tap on the barn doors did not open them: ' + types(evs));
  await page.waitForTimeout(900);
  await shot(page, d, '3-march');
  await page.evaluate(() => FP.debug.setSpeed(3));
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'doorClose'), n0, { timeout: 15000 });
  evs = await evSince(page, n0);
  const steps = evs.filter(e => e.type === 'marchStep').length, inb = evs.filter(e => e.type === 'inBarn' && e.id !== 'chick').length;
  check(evs.some(e => e.type === 'marchStart') && steps >= 2, 'no march in step: ' + types(evs));
  check(inb === i.n - 1, `inBarn ${inb} of ${i.n - 1} friends`);
  check(evs.some(e => e.type === 'parade') && evs.some(e => e.type === 'leave'), 'no parade / leave: ' + types(evs));
  await page.evaluate(() => FP.debug.setSpeed(1));
};
T.gate_auto_open = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 22 });
  const i = await info(page);
  await tap(cdp, page, i.at);
  const n0 = await evLen(page);
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'doorOpen'), n0, { timeout: 20000 });
  const evs = await evSince(page, n0);
  const ask = evs.find(e => e.type === 'gateAsk'), op = evs.find(e => e.type === 'doorOpen'), hint = evs.find(e => e.type === 'gateHint');
  check(op && op.auto === true, 'doors did not open by themselves: ' + types(evs));
  check(hint, 'no ghost hand at the doors before the auto-open: ' + types(evs));
  const dt = op._t - ask._t;
  check(dt > 3.8 && dt < 4.3, `auto-open ${dt.toFixed(2)} s (world) after gateAsk (want 4 s)`);
};
T.rotate_mid_round = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 14, age: 5 });
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no empty point');
  const n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(400);   // past the flick window
  check(await page.evaluate(() => !!FP.debug.world._g), 'gesture not active before rotating');
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(500);
  const g1 = await page.evaluate(() => ({ g: !!FP.debug.world._g }));
  const pts = await page.evaluate(() => FP.debug.world.members.filter(m => m.state === 'stand').map(m => FP.debug.memberScreen(m.id)));
  for (const c of pts) { await touchMove(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(30); }
  await touchEnd(cdp);
  await page.waitForTimeout(900);
  await shot(page, d, '8-rotated');
  const evs = await evSince(page, n0);
  check(!g1.g, 'gesture not cancelled by the rotation');
  check(!evs.some(e => e.type === 'right' || e.type === 'wrong'), 'the cancelled gesture still judged: ' + types(evs));
  check((await page.evaluate(() => window.__qa.outside())).length === 0, 'outside the screen after rotation: ' + (await page.evaluate(() => window.__qa.outside())).join('; '));
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tap(cdp, page, j.at);
  await page.waitForTimeout(400);
  check((await evSince(page, n1)).some(e => e.type === 'right' && e.id === j.a), 'tap after rotation');
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(600);
  const out2 = await page.evaluate(() => window.__qa.outside());
  check(out2.length === 0, 'outside the screen after rotating back: ' + out2.join('; '));
};
T.rotate_mid_hop = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 15 });
  const i = await info(page);
  // slow motion: the hop (0.75 s of WORLD time) is still in flight when the rotation's resize lands, whatever the CPU load
  await page.evaluate(() => FP.debug.setSpeed(0.15));
  await tap(cdp, page, i.at);
  await page.waitForFunction(id => FP.debug.world.memberById(id).state === 'hop' && FP.debug.world.memberById(id)._f, i.a, { timeout: 10000, polling: 'raf' });
  const W0 = await page.evaluate(() => FP.debug.world.layout.W);
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForFunction(w0 => FP.debug.world.layout.W !== w0, W0, { timeout: 10000, polling: 'raf' });
  check(await page.evaluate(id => FP.debug.world.memberById(id).state, i.a) === 'hop', 'the rotation landed after the hop (test timing)');
  await page.evaluate(() => FP.debug.setSpeed(1));
  await page.waitForFunction(id => FP.debug.world.memberById(id).state === 'stage', i.a, { timeout: 10000, polling: 'raf' });
  await page.waitForTimeout(200);
  const s = await page.evaluate(id => { const w = FP.debug.world, m = w.memberById(id); return { state: m.state, x: m.x, y: m.y, sx: w.stage.x, sy: w.stage.y }; }, i.a);
  check(s.state === 'stage' && Math.abs(s.x - s.sx) < 1 && Math.abs(s.y - s.sy) < 1, 'hop did not land on the re-laid stage: ' + JSON.stringify(s));
  const out = await page.evaluate(() => window.__qa.outside());
  check(out.length === 0, 'outside after rotating mid-hop: ' + out.join('; '));
  await shot(page, d, '8-rotated-hop');
  await waitGate(page);
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(400);
};
T.surprise_chick = async ctx => surpriseTest(ctx, 'chick', 0);
T.surprise_rooster = async ctx => surpriseTest(ctx, 'rooster', 0);
T.surprise_fireflies = async ctx => surpriseTest(ctx, 'fireflies', 3);
async function surpriseTest({ page, cdp, url, d }, kind, level) {
  const off = kind === 'chick' ? (2 - level % 2) % 2 : (3 - level % 2) % 2;   // (level + off) % 2 → 0 chick, 1 rooster
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 17 + level, level, prep: `w._surpriseRound = 1; w._surpriseOff = ${off};` });
  await botToNextRound(page);
  const sp = await page.evaluate(() => FP.debug.world.surprise);
  check(sp === kind, 'surprise of round 1: ' + sp);
  const fn = { chick: 'chickScreen', rooster: 'roosterScreen', fireflies: 'fireflyScreen' }[kind];
  await page.evaluate(() => FP.debug.setSpeed(3));
  await page.waitForFunction(f => !!FP.debug[f]() && FP.debug.world.interactive, fn, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => FP.debug.setSpeed(1));
  await page.waitForTimeout(kind === 'fireflies' ? 300 : 150);
  const chk = await page.evaluate(f => {
    const w = FP.debug.world, s = FP.debug[f](), bad = [];
    if (!s) return { bad: ['gone'] };
    for (const m of w.members.filter(m => m.state === 'stand')) {
      if (w._memberAt(m.cx, m.cy) !== m) bad.push('member ' + m.id + ' not hit at its centre');
      const sc = FP.debug.toScreen(m.cx, m.cy);
      if (Math.hypot(sc.x - s.x, sc.y - s.y) < s.r) bad.push('member ' + m.id + ' centre inside the ' + f + ' circle');
    }
    const el = document.elementFromPoint(s.x, s.y);
    if (!el || el.id !== 'game') bad.push('surprise under DOM ' + (el && (el.id || el.className)));
    if (s.x < 0 || s.y < 0 || s.x > innerWidth || s.y > innerHeight) bad.push('surprise off screen');
    return { s, bad };
  }, fn);
  check(chk.bad.length === 0, kind + ': ' + chk.bad.join('; '));
  await shot(page, d, '9-' + kind);
  const tapEv = { chick: 'chickTap', rooster: 'roosterTap', fireflies: 'fireflyTap' }[kind];
  const s2 = await page.evaluate(f => FP.debug[f](), fn);
  check(s2, kind + ' no longer tappable');
  const n0 = await evLen(page);
  await tap(cdp, page, s2, 60);
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  check(evs.some(e => e.type === tapEv), `tap on the ${kind} gave no ${tapEv}: ` + types(evs));
  check(!evs.some(e => e.type === 'wrong' || e.type === 'right'), `${kind} tap judged a member: ` + types(evs));
  check(await page.evaluate(() => FP.debug.world.misses) === 0, kind + ' tap counted as a miss');
  await waitAsk(page);
  const i = await info(page);
  const n1 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(300);
  evs = await evSince(page, n1);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'odd one during the ' + kind + ': ' + types(evs));
}
T.two_misses_hint = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { age: 5, topic: 'animals', seed: 6 });
  let i = await info(page);
  if (i.others.length < 2) { await botToNextRound(page); i = await info(page); }
  check(i.others.length >= 2, 'need two other members');
  const L0 = await saidLen(page), n0 = await evLen(page);
  await tap(cdp, page, i.others[0].at); await page.waitForTimeout(500);
  let evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'hint'), 'hint after one miss: ' + types(evs));
  await tap(cdp, page, i.others[1].at); await page.waitForTimeout(600);
  evs = await evSince(page, n0);
  const h = evs.find(e => e.type === 'hint');
  check(h && h.id === i.a, 'no hint on the odd one after 2 misses: ' + types(evs));
  await shot(page, d, '4-hint');
  const g = await page.evaluate(id => ({ glow: FP.debug.world.memberById(id).glow, hand: !!FP.debug.world.hintHand, m: FP.debug.world.misses }), i.a);
  check(g.hand && g.m === 2, 'hint hand / misses: ' + JSON.stringify(g));
  const lines = await said(page, L0);
  check(lines.length >= 2, 'no wrong + hint lines spoken: ' + JSON.stringify(lines));
};
T.count_crates = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { topic: 'count', age: 4, seed: 8 });
  const i = await info(page);
  const th = await page.evaluate(id => FP.debug.world.memberById(id).thing, i.a);
  check(th.kind === 'crate' && th.n >= 1, 'not a crate round: ' + JSON.stringify(th));
  const L0 = await saidLen(page), n0 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(1300 + 520 * th.n);
  await shot(page, d, '5-count');
  const evs = await evSince(page, n0);
  const counts = evs.filter(e => e.type === 'count' && e.id === i.a);
  check(evs.some(e => e.type === 'right' && e.id === i.a && e.count && e.count.n === th.n), 'no right with count: ' + types(evs));
  check(counts.length === th.n, `count events ${counts.length} for a crate of ${th.n}: ` + types(evs));
  check(counts.every((e, k) => e.i === k + 1), 'count indices: ' + counts.map(e => e.i).join(','));
  const lines = await said(page, L0);
  check(lines.some(t => /one/i.test(t) && /apple/i.test(t)), 'no count run ("One, … apples!") in the voice: ' + JSON.stringify(lines));
};
T.bo_repeat = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 11 });
  await page.waitForTimeout(3400);   // a Bo tap repeats only after the prompt had its 3 s
  const prompt = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  const v0 = await page.evaluate(() => FP.debug.voiceLog.length), n0 = await evLen(page);
  const k = await page.evaluate(() => FP.debug.boScreen());
  const onMember = await page.evaluate(([x, y]) => { const p = window.__qa.toL(x, y); return !!FP.debug.world._memberAt(p.x, p.y); }, [k.cx, k.cy]);
  check(!onMember, 'Bo\'s centre is under a member');
  await tap(cdp, page, { x: k.cx, y: k.cy }, 90);
  await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  const log = await page.evaluate(n => FP.debug.voiceLog.slice(n).map(x => x.text), v0);
  check(evs.some(e => e.type === 'pokeBo'), 'no pokeBo on a Bo tap: ' + types(evs));
  check(log.includes(prompt), 'Bo tap did not repeat the prompt in voiceLog: ' + JSON.stringify({ prompt, log }));
  check(!evs.some(e => e.type === 'soft' || e.type === 'wrong'), 'Bo tap softed / judged: ' + types(evs));
  // tapping the speech bubble also repeats it (and never reaches the canvas)
  const v1 = await page.evaluate(() => FP.debug.voiceLog.length), n1 = await evLen(page);
  await tapEl(page, '#bubble');
  await page.waitForTimeout(300);
  const log2 = await page.evaluate(n => FP.debug.voiceLog.slice(n).map(x => x.text), v1);
  check(log2.includes(prompt), 'bubble tap did not repeat the prompt: ' + JSON.stringify(log2));
  check(!(await evSince(page, n1)).some(e => e.type === 'soft'), 'bubble tap reached the canvas');
};
T.talk_time_tap = async ({ page, url, d }) => {
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 12 });
  await page.evaluate(() => { FP.debug.setBot(true, 1); FP.debug.setSpeed(8); });
  await page.waitForFunction(() => FP.debug.world.state === 'talk', null, { timeout: 120000, polling: 'raf' });
  await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => ({ answered: FP.debug.world.talkAnswered, answer: FP.debug.world.talk.answer, n: document.querySelectorAll('#talkChoices button').length, mode: FP.debug.mode, q: document.getElementById('talkQ').textContent }));
  check(!t.answered, 'bot answered Talk before the test could');
  check(t.mode === 'talk' && await visible(page, 'scrTalk'), 'Talk screen not shown: ' + t.mode);
  check(t.n >= 2 && t.n <= 3, 'Talk choices: ' + t.n);
  check(t.q && !RAW.test(t.q), 'Talk question text: ' + t.q);
  await shot(page, d, '7-talk');
  const s0 = await page.evaluate(() => ({ r: FP.debug.stats.talkRight, st: FP.debug.world.stars }));
  await tapEl(page, `#talkChoices button[data-id="${t.answer}"]`);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ right: FP.debug.stats.talkRight, st: FP.debug.world.stars, cls: document.querySelector('#talkChoices .right') ? 1 : 0 }));
  check(r.right === s0.r + 1 && r.cls && r.st === s0.st + 1, 'tap on the right Talk answer not counted: ' + JSON.stringify(r));
  await page.waitForFunction(() => FP.debug.world.state !== 'talk', null, { timeout: 20000 });
  await page.waitForFunction(() => FP.debug.mode === 'play' && FP.debug.world.state === 'round', null, { timeout: 20000 });
  check(!(await visible(page, 'scrTalk')), 'Talk screen still shown after the answer');
};
T.pause_resume = async ({ page, url }) => {
  await setupRound(page, url);
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => FP.debug.mode) === 'paused' && await visible(page, 'scrPause'), 'pause did not open');
  const t0 = await page.evaluate(() => FP.debug.world.time);
  await page.waitForTimeout(700);
  check(await page.evaluate(() => FP.debug.world.time) === t0, 'world kept running while paused');
  const L0 = await saidLen(page);
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(700);
  const s = await page.evaluate(n => ({ mode: FP.debug.mode, t: FP.debug.world.time, said: window.__said.slice(n).map(x => x.text), bubble: document.getElementById('bubbleText').textContent }), L0);
  check(s.mode === 'play' && s.t > t0, 'resume did not continue: ' + JSON.stringify(s));
  check(!(await visible(page, 'scrPause')), 'pause screen still shown');
  check(s.said.includes(s.bubble), 'prompt not repeated after resume: ' + JSON.stringify(s.said));
};
T.visibility_pause = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 13 });
  const i = await info(page);
  const p = await page.evaluate(() => window.__qa.softPoint());
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(80);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ mode: FP.debug.mode, g: !!FP.debug.world._g, down: FP.debug.world.finger.down }));
  check(s.mode === 'paused', 'hidden page did not pause: ' + s.mode);
  check(!s.g && !s.down, 'the gesture was not cancelled when hidden: ' + JSON.stringify(s));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  const n0 = await evLen(page);
  await touchMove(cdp, [tp(i.at.x, i.at.y)]);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ mode: FP.debug.mode }));
  const evs = await evSince(page, n0);
  check(s.mode === 'paused' && !evs.some(e => e.type === 'right' || e.type === 'wrong'), 'after becoming visible: ' + JSON.stringify(s) + ' ' + types(evs));
  check(await visible(page, 'scrPause'), 'pause screen not shown after returning');
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => FP.debug.mode) === 'play', 'resume after visibility pause failed');
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tap(cdp, page, j.at);
  await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right'), 'tap after visibility pause did not give right');
};
T.second_finger_ignored = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 16 });
  const i = await info(page);
  const p = await page.evaluate(() => window.__qa.softPoint());
  await touchStart(cdp, [tp(p.x, p.y, 1)]);
  await page.waitForTimeout(300);
  const n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y, 1), tp(i.at.x, i.at.y, 2)]);   // a second finger lands on the odd one
  await page.waitForTimeout(80);
  await touchMove(cdp, [tp(p.x, p.y, 1)]);
  await page.waitForTimeout(60);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'right' || e.type === 'wrong'), 'a second finger was judged: ' + types(evs));
};
T.language_switch = async ({ page, url, d }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?mute=1&seed=5&age=4');
  await tapEl(page, '.title-top [data-lang="vi"]');
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), title: document.title, saved: FP.debug.getState().settings.lang }));
  check(s.html === 'vi' && /Cún Bo/.test(s.logo) && /Tìm Bạn Lạc Đàn/.test(s.logo) && s.play === 'Chơi' && s.saved === 'vi', 'VI not applied on title: ' + JSON.stringify(s));
  check(/Cún Bo Tìm Bạn Lạc Đàn/.test(s.title), 'VI document title: ' + s.title);
  await shot(page, d, 'a-title-vi');
  await tapEl(page, '#btnPlay');
  await page.evaluate(() => window.__qa.hook());
  await page.evaluate(() => { const w = FP.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
  await waitAsk(page);
  await shot(page, d, 'b-vi-round');
  const vb = await page.evaluate(() => ({ bubble: document.getElementById('bubbleText').textContent, last: window.__asks.slice(-1)[0], said: window.__said.slice(-4) }));
  check(VI_CHARS.test(vb.bubble) && /màu|bé|bạn/i.test(vb.bubble), 'bubble not Vietnamese: ' + vb.bubble);
  check(vb.last && vb.last.lang === 'vi', 'ask built in ' + (vb.last && vb.last.lang));
  check(vb.said.some(x => x.text === vb.bubble), 'the VI prompt was not sent to the voice: ' + JSON.stringify(vb.said));
  const ov = await page.evaluate(() => document.getElementById('bubbleText').getBoundingClientRect().height - document.getElementById('bubble').clientHeight);
  check(ov <= 4, 'VI bubble text overflows by ' + ov + ' px');
  await tapEl(page, '#btnPause');
  await page.waitForFunction(() => FP.debug.mode === 'paused');
  check(await page.evaluate(() => document.querySelector('#scrPause h2').textContent) === 'Tạm dừng', 'pause title not translated');
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => FP.debug.mode === 'title');
  await tapEl(page, '.title-top [data-lang="en"]');
  await page.waitForTimeout(200);
  s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), saved: FP.debug.getState().settings.lang }));
  check(s.html === 'en' && /Bo’s/.test(s.logo) && /Farm Parade/.test(s.logo) && s.play === 'Play' && s.saved === 'en', 'EN not restored: ' + JSON.stringify(s));
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
  await page.evaluate(() => { const g = document.getElementById('btnParents'); window.__hold = []; g.addEventListener('pointerdown', () => window.__hold.push(performance.now()), true); g.addEventListener('pointerup', () => window.__hold.push(performance.now()), true); });
  for (let k = 0; k < 3; k++) {
    await page.evaluate(() => { window.__hold = []; });
    await tap(cdp, page, c, 1200 - k * 300);
    await page.waitForTimeout(300);
    const held = await page.evaluate(() => window.__hold.length >= 2 ? window.__hold[1] - window.__hold[0] : -1);
    const open = await visible(page, 'scrSettings');
    if (held >= 1950) { if (open) { await tapEl(page, '#btnSettingsDone'); await page.waitForTimeout(200); } continue; }
    check(!open, `a ${Math.round(held)} ms hold opened settings`);
    break;
  }
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
  check(keys.includes('fp:settings') && keys.every(k => k.startsWith('fp:')), 'storage keys not under fp: — ' + keys.join(','));
  await gotoTitle(page, url + '?mute=1');
  let s = await page.evaluate(() => ({ st: FP.debug.getState().settings, age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, vol: document.getElementById('optVolume').value, music: document.getElementById('optMusic').checked, sfx: document.getElementById('optSfx').checked, name: document.getElementById('inpName').value }));
  check(s.st.age === 6 && s.st.lang === 'vi' && s.st.name === 'Mầm' && Math.abs(s.st.volume - 0.4) < 1e-6 && s.st.music === false && s.st.sfx === false, 'settings not kept across reload: ' + JSON.stringify(s.st));
  check(/6/.test(s.age) && s.html === 'vi' && s.vol === '40' && !s.music && !s.sfx && s.name === 'Mầm', 'reloaded UI does not show the saved settings: ' + JSON.stringify(s));
  check(await page.evaluate(() => { for (let k = 0; k < 60; k++) if (/Mầm/.test(FP.I18N.t('vi', 'great', {}))) return true; return false; }), 'child name never used by t("great")');
  // URL flags are session-only: they apply but are never saved — even when a setting is changed while they are active
  await gotoTitle(page, url + '?mute=1&age=3&lang=en&speed=2&seed=4');
  s = await page.evaluate(() => ({ age: document.getElementById('titleAge').textContent, html: document.documentElement.lang }));
  check(/3/.test(s.age) && s.html === 'en', 'URL flags not applied: ' + JSON.stringify(s));
  await tap(cdp, page, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, 2300);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '55'; v.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.fill('#inpName', 'Mam');
  await tapEl(page, '#btnSettingsDone');
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => FP.debug.world.state === 'intro' || FP.debug.world.state === 'round', null, { timeout: 15000 });
  const playAge = await page.evaluate(() => FP.debug.world.age);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('fp:settings')));
  check(playAge === 3, '?age=3 not played: ' + playAge);
  check(stored.age === 6 && stored.lang === 'vi' && stored.speed === undefined && stored.mute === undefined, 'URL flags leaked into saved settings: ' + JSON.stringify(stored));
  check(Math.abs(stored.volume - 0.55) < 1e-6 && stored.name === 'Mam', 'settings changed under URL flags not saved: ' + JSON.stringify(stored));
  await gotoTitle(page, url + '?mute=1');
  s = await page.evaluate(() => ({ st: FP.debug.getState().settings, html: document.documentElement.lang, age: document.getElementById('titleAge').textContent, speed: FP.debug.getState().speed }));
  check(s.st.age === 6 && s.html === 'vi' && /6/.test(s.age) && s.speed === 1, 'flags stuck after reload without them: ' + JSON.stringify(s));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.audio_chain_volume = async ({ page, url }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');   // the unlock gesture
  await page.waitForTimeout(400);
  let a = await page.evaluate(() => { const A = FP.debug.audio(); return A.ctx ? { master: A.master.gain.value, user: A.user.gain.value, thr: A.comp && A.comp.threshold.value, ratio: A.comp && A.comp.ratio.value, chain: !!(A.master && A.comp && A.user && A.sfx && A.music && A.amb) } : null; });
  check(a && a.chain, 'audio chain missing: ' + JSON.stringify(a));
  check(a.thr <= -12 && a.ratio >= 2, 'compressor not set: ' + JSON.stringify(a));
  check(Math.abs(a.user - 1.6) < 0.05 && Math.abs(a.master - 1) < 0.05, 'loud makeup gain not applied: ' + JSON.stringify(a));
  // every synth sound plays without throwing
  const bad = await page.evaluate(() => { const A = FP.debug.audio(), out = []; for (const n of ['step', 'rattle', 'settle', 'boing', 'thump', 'right', 'woof', 'boop', 'wiggle', 'puff', 'pip', 'creak', 'clunk', 'march', 'fanfare', 'fanfareBig', 'whirr', 'peep', 'flap', 'crow', 'twinkle', 'pop', 'complete', 'hint', 'star', 'level', 'party', 'chapter', 'click', 'soft', 'talkRight', 'listen']) { try { A._lastPlay = {}; A.play(n, { i: 2 }); } catch (e) { out.push(n + ': ' + e.message); } } for (let m = 0; m < 4; m++) { try { A.setMood(m); A._playStep(0, A.ctx.currentTime, { root: 60, prog: [[0, 4, 7]], lead: 'uke', swing: 0 }, 0.2); A.tick(30); } catch (e) { out.push('mood ' + m + ': ' + e.message); } } return out; });
  check(bad.length === 0, 'sounds threw: ' + bad.join('; '));
  await page.waitForFunction(() => FP.debug.world.state === 'round', null, { timeout: 15000 });
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  for (let k = 0; k < 3; k++) { await tapEl(page, '#btnVolDown'); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: FP.debug.audio().user.gain.value, vol: FP.debug.getState().settings.volume, label: document.getElementById('volLevel').textContent, stored: JSON.parse(localStorage.getItem('fp:settings') || '{}').volume }));
  check(Math.abs(a.vol - 0.7) < 1e-6 && Math.abs(a.stored - 0.7) < 1e-6 && a.label === '70%', 'pause − did not set / save 70 %: ' + JSON.stringify(a));
  check(Math.abs(a.user - 0.7 * 1.6) < 0.08, 'user gain does not follow the volume: ' + JSON.stringify(a));
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => FP.debug.mode === 'title');
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '30'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: FP.debug.audio().user.gain.value, stored: JSON.parse(localStorage.getItem('fp:settings') || '{}').volume }));
  check(Math.abs(a.stored - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06, 'slider 30 %: ' + JSON.stringify(a));
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(500);
  a = await page.evaluate(() => ({ user: FP.debug.audio().user.gain.value, vol: FP.debug.getState().settings.volume, slider: document.getElementById('optVolume').value }));
  check(Math.abs(a.vol - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06 && a.slider === '30', 'volume not restored after reload: ' + JSON.stringify(a));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.release_over_hud = async ({ page, cdp, url }) => {
  // a gesture that ends over the pause button must not pause (the finger is captured by the canvas)
  await setupRound(page, url, { seed: 18 });
  const i = await info(page);
  const pb = await page.locator('#btnPause').boundingBox();
  const n0 = await evLen(page);
  await swipe(cdp, page, i.at, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 }, { n: 10, ms: 250 });
  await page.waitForTimeout(400);
  const evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right'), 'press on the odd one: ' + types(evs));
  check(await page.evaluate(() => FP.debug.mode) === 'play', 'releasing over the pause button paused the game');
  const n1 = await evLen(page);
  const hb = await page.locator('#hudStars').boundingBox();
  await tap(cdp, page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 });
  await page.waitForTimeout(200);
  check(!(await evSince(page, n1)).some(e => e.type === 'soft' || e.type === 'door' || e.type === 'doorOpen'), 'a HUD tap reached the canvas');
};
T.url_age_shown = async ({ page, url }) => {
  const bad = [];
  for (const [q, want] of [['2', 3], ['4.5', 5], ['9', 7]]) {
    await gotoTitle(page, `${url}?mute=1&age=${q}`);
    const s = await page.evaluate(() => ({ title: document.getElementById('titleAge').textContent }));
    await page.evaluate(() => { FP.debug.startGame(); });
    const played = await page.evaluate(() => FP.debug.world.age);
    const shown = (s.title.match(/[\d.]+\+?/) || [''])[0];
    if (played !== want || shown.replace('+', '') !== String(want)) bad.push(`?age=${q}: plays ${played}, title shows "${s.title.trim()}"`);
  }
  check(bad.length === 0, 'the title age differs from the age played: ' + bad.join('; '));
};

const CORE = ['boot_title', 'tap_right', 'tap_wrong', 'tap_empty_soft', 'flick_right', 'gate_door_tap', 'gate_auto_open', 'rotate_mid_round', 'rotate_mid_hop',
  'surprise_chick', 'surprise_rooster', 'surprise_fireflies'];
const EXTRA = ['two_misses_hint', 'count_crates', 'bo_repeat', 'talk_time_tap', 'pause_resume', 'visibility_pause', 'second_finger_ignored',
  'language_switch', 'parent_gate', 'settings_persist', 'audio_chain_volume', 'release_over_hud', 'url_age_shown'];

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
      let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = FP.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, topic: s.topic, round: s.round, members: s.members, W: s.W, H: s.H }; })); } catch (x) { /* ignore */ }
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
    await page.waitForFunction(() => window.FP && FP.debug && FP.debug.mode === 'done', null, { timeout: 600000, polling: 500 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `bot-age${r.age}-${r.lang}-done.png`) });
    const res = await page.evaluate(() => ({ stats: FP.debug.stats, levels: FP.debug.world.levels, age: FP.debug.world.age, asks: window.__asks, said: window.__said.map(x => ({ text: x.text, lang: x.lang })), log: FP.debug.voiceLog.slice(), doneVisible: !document.getElementById('scrDone').classList.contains('hidden'), doneTitle: document.getElementById('doneTitle').textContent }));
    const s = res.stats;
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    check(res.age === r.age, 'played age ' + res.age);
    check(res.doneVisible && res.doneTitle && !RAW.test(res.doneTitle), 'done screen: ' + JSON.stringify(res.doneTitle));
    check(s.rounds >= 12 && s.correct >= 12 && s.parades >= 12 && s.talks >= 4, 'session too short: ' + JSON.stringify(s));
    const saidSet = new Set(res.said.map(x => x.lang + '|' + x.text));
    const missing = res.asks.filter(a => !saidSet.has(a.lang + '|' + a.text));
    check(res.asks.length >= 12, 'too few prompts built: ' + res.asks.length);
    check(res.asks.every(a => a.lang === r.lang), 'prompts in the wrong language: ' + JSON.stringify(res.asks.filter(a => a.lang !== r.lang).slice(0, 2)));
    check(missing.length === 0, `${missing.length}/${res.asks.length} prompts never reached the voice: ` + JSON.stringify(missing.slice(0, 2)));
    const raw = res.said.filter(x => !x.text || RAW.test(x.text));
    check(raw.length === 0, 'spoken lines with a raw key / {param} / undefined: ' + JSON.stringify(raw.slice(0, 4)));
    check(res.log.length > 0 && res.log.every(x => x.lang === r.lang), 'voice log language: ' + JSON.stringify(res.log.filter(x => x.lang !== r.lang).slice(0, 2)));
    if (r.lang === 'vi') {
      const notVi = res.said.filter(x => !VI_CHARS.test(x.text));
      check(notVi.length / res.said.length < 0.1, 'VI voice has English-looking lines: ' + JSON.stringify(notVi.slice(0, 6).map(x => x.text)));
    } else {
      const bad = res.said.filter(x => VI_CHARS.test(x.text));
      check(bad.length === 0, 'EN voice has Vietnamese lines: ' + JSON.stringify(bad.slice(0, 3)));
    }
    const again = r.age % 2 === 1;
    await tapEl(page, again ? '#btnAgain' : '#btnDoneHome');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ mode: FP.debug.mode, sessions: FP.debug.stats.sessions, st: FP.debug.world.state, title: !document.getElementById('scrTitle').classList.contains('hidden'), stars: document.getElementById('titleStars').textContent }));
    if (again) check(after.mode === 'play' && after.sessions === 2 && after.st !== 'sessionDone', 'Play again did not start a new session: ' + JSON.stringify(after));
    else check(after.mode === 'title' && after.title && +after.stars > 0, 'Home from the done screen: ' + JSON.stringify(after));
    check(errors.length === 0, 'errors: ' + errors.slice(0, 3).join(' | '));
    record(d.name, name, true, '');
    console.log(`      ${name}: ${secs}s, topics ${res.levels.join('/')}, rounds ${s.rounds}, right ${s.correct}, wrong ${s.wrong}, hints ${s.hints}, assists ${s.assists}, doors ${s.doors} (auto ${s.doorAuto}), talks ${s.talks}, surprises ${s.surprises} (taps ${s.chickTaps}/${s.roosterTaps}/${s.fireflyTaps}), prompts ${res.asks.length}, voice lines ${res.said.length}`);
  } catch (e) {
    let st = ''; try { st = JSON.stringify(await page.evaluate(() => FP.debug.getState())); } catch (x) { /* ignore */ }
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
