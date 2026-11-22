// Functional QA (Mimi's Splash Rocket) — Playwright, isMobile + hasTouch contexts on iPhone / iPad, portrait + landscape.
// Every tap is a REAL CDP touch sequence (Input.dispatchTouchEvent → pointer events → DK.Input → World): the bot bypasses
// the input layer, so this suite is the proof that fingers work on the bobbing picnic mats and on the foot pump.
//   node tests/e2e/functional.js                          (all: 4 devices + 10 bot sessions, ages 3–7 × EN / VI)
//   ONLY=iphone-portrait node tests/e2e/functional.js     (one device, no bot sessions)
//   TESTS=tap_right,count_seq node tests/e2e/functional.js   (a subset of the per-device tests)
//   SKIP_BOT=1 node tests/e2e/functional.js               (skip the full bot sessions)    BOT_ONLY=1 (only them)
// Writes screenshots + results.json to tests/out/functional/. Exits 1 on any failure (also on any console / page error).
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
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object|\b(ui|p|talk|topic|weather|right|wrong|surprise|marmot|goat|bird|count|name|idle|session|goal|pennant|next|pump)\.[a-z0-9]/i;

const results = [];
function record(device, test, ok, detail) {
  results.push({ device, test, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(16)} ${test}${ok ? '' : '  — ' + detail}`);
}
class Fail extends Error {}
const check = (cond, msg) => { if (!cond) throw new Fail(msg); };

// test-only instrumentation: every prompt the game builds and every line it sends to the voice, full world events, and
// page-side helpers for safe touch points
const INIT = () => {
  window.__asks = []; window.__said = []; window.__ev = [];
  const DK = window.DK = window.DK || {};
  let i18n, voice;
  Object.defineProperty(DK, 'I18N', { configurable: true, get: () => i18n, set: v => {
    i18n = v;
    if (v && v.ask && !v.ask.__wrapped) { const o = v.ask; v.ask = function (lang, key) { const r = o.apply(this, arguments); window.__asks.push({ lang, key, text: r }); return r; }; v.ask.__wrapped = true; }
  } });
  Object.defineProperty(DK, 'Voice', { configurable: true, get: () => voice, set: v => {
    voice = v;
    if (v && v.say && !v.say.__wrapped) { const o = v.say; v.say = function (text, opts) { window.__said.push({ text: String(text), lang: (opts && opts.lang) || v._lang, tag: opts && opts.tag, t: performance.now() }); return o.apply(this, arguments); }; v.say.__wrapped = true; }
  } });
  window.__qa = {
    hook() {
      const w = DK.debug.world;
      if (!w || w.__qa) return;
      const o = w._emit; w.__qa = true;
      w._emit = function (e) { window.__ev.push(e); e._t = w.time; return o.call(this, e); };
    },
    toL(x, y) { const v = DK.debug.view(); return { x: (x - v.left) / v.s, y: (y - v.top) / v.s }; },
    /** a CSS-px point on open meadow grass (no DOM above it), clear of every mat (hit radius + margin), Mimi, the pump / pad /
     *  pole, the speech bubble / HUD and the surprises — a press there is a 'soft' press */
    softPoint() {
      const w = DK.debug.world, L = w.layout, M = L.meadow, mb = w.mimiHit();
      const cands = [];
      for (let gx = 0.03; gx < 0.98; gx += 0.02) for (let gy = 0.05; gy < 0.97; gy += 0.02) {
        const cx = innerWidth * gx, cy = innerHeight * gy, p = this.toL(cx, cy);
        if (p.x < M.x0 + 20 || p.x > M.x1 - 20 || p.y < L.horizon + 20 || p.y > M.y1 - 20) continue;
        const el = document.elementFromPoint(cx, cy); if (!el || el.id !== 'game') continue;
        if (mb && p.x > mb.x - 30 && p.x < mb.x + mb.w + 30 && p.y > mb.y - 30 && p.y < mb.y + mb.h + 30) continue;
        if (Math.hypot(p.x - L.pump.x, p.y - L.pump.y) < 140 || Math.hypot(p.x - L.pad.x, p.y - L.pad.y + 60) < 140 || Math.abs(p.x - L.pole.x - 30) < 70) continue;
        if (w.mats.some(m => m.state !== 'gone' && m.state !== 'hidden' && (Math.hypot(p.x - m.x, p.y - m.y) < L.hitR + 50 || Math.hypot(p.x - m.x, p.y - m.y + 0.35 * L.itemH) < L.hitR + 50))) continue;
        if (!w._clearOfKeep(p.x, p.y)) continue;
        if ([w.marmotHit(), w.goatHit(), w.birdHit()].filter(Boolean).some(c => Math.hypot(p.x - c.x, p.y - c.y) < c.r + 40)) continue;
        cands.push({ x: Math.round(cx), y: Math.round(cy), lx: p.x, ly: p.y });
      }
      const fc = { x: (M.x0 + M.x1) / 2, y: (L.horizon + M.y1) / 2 };
      cands.sort((a, b) => Math.hypot(a.lx - fc.x, a.ly - fc.y) - Math.hypot(b.lx - fc.x, b.ly - fc.y));
      return cands.length ? cands[0] : null;
    },
    /** every resting mat, Mimi's feet and the rocket's nozzle inside the CSS viewport? */
    outside() {
      const w = DK.debug.world, v = DK.debug.view(), out = [], S = w.layout.S;
      for (const m of w.mats) {
        if (m.state !== 'rest') continue;
        const p = DK.debug.toScreen(m.x, m.y), r = 0.5 * S * m.ds * v.s;
        if (p.x - r < -1 || p.y < -1 || p.x + r > innerWidth + 1 || p.y > innerHeight + 1) out.push(`${m.id} at ${Math.round(p.x)},${Math.round(p.y)}`);
      }
      const n = DK.debug.toScreen(w.mimi.x, w.mimi.y);
      if (n.x < 0 || n.y < 0 || n.x > innerWidth || n.y > innerHeight + 1) out.push(`Mimi at ${Math.round(n.x)},${Math.round(n.y)}`);
      const r = DK.debug.toScreen(w.rocket.x, w.rocket.y);
      if (r.x < 0 || r.y < 0 || r.x > innerWidth || r.y > innerHeight + 1) out.push(`rocket at ${Math.round(r.x)},${Math.round(r.y)}`);
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
/** tap a mat where it bobs NOW (the position is read right before the touch) */
async function tapMat(cdp, page, id, hold = 70) {
  const at = await page.evaluate(i => DK.debug.matScreen(i), id);
  check(at, 'mat ' + id + ' is not tappable');
  await tap(cdp, page, at, hold);
  return at;
}
/** 3 real stomps on the pump (≥ 0.3 s apart: the world merges presses < 0.22 s) */
async function pumpThree(cdp, page) {
  await page.waitForFunction(() => DK.debug.world.phase === 'pump' && DK.debug.world.interactive, null, { timeout: 10000, polling: 'raf' });
  for (let k = 0; k < 3; k++) {
    const p = await page.evaluate(() => DK.debug.pumpScreen());
    await tap(cdp, page, p, 60);
    await page.waitForTimeout(260);
  }
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
const evSince = (page, n0) => page.evaluate(n => window.__ev.slice(n).map(e => { const c = {}; for (const k in e) { const v = e[k]; if (v === null || typeof v !== 'object') c[k] = v; } return c; }), n0);
/** wait for a world event (by type, after index n0) — robust under CPU load, unlike a fixed wall-clock wait */
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
  await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title' && DK.debug.world, null, { timeout: 20000 });
  await page.evaluate(() => window.__qa.hook());
  await page.waitForTimeout(250);
}
/** a fresh chapter of `topic` (level `level`) at `age`; waits for the first open ask (speed 1 once it is open) */
async function setupRound(page, url, { topic = 'colors', age = 4, seed = 3, lang = '', level = 0, prep = null } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}${lang ? '&lang=' + lang : ''}`);
  await page.evaluate(([t, lv, prep]) => {
    DK.debug.startGame(); const w = DK.debug.world; w.levels[lv] = t; w.startLevel(lv);
    if (prep) (new Function('w', prep))(w);
    DK.debug.setSpeed(4);
  }, [topic, level, prep]);
  await waitAsk(page);
}
const READY = () => { const w = DK.debug.world, a = DK.debug.answer(); return w.interactive && w.phase === 'play' && a && a.id != null && !!DK.debug.matScreen(a.id) && w.phaseTime > 0.6 && w.mats.filter(m => m.launch === w.launch).every(m => m.state === 'rest'); };
async function waitAsk(page, timeout = 30000) {
  await page.evaluate(() => DK.debug.setSpeed(4));
  await page.waitForFunction(READY, null, { timeout, polling: 'raf' });
  await page.evaluate(() => DK.debug.setSpeed(1));
  await page.waitForTimeout(200);
}
/** the launch is over: the next launch can be tapped, or the round moved on (fast-forwards the flight) */
async function waitLaunch(page, timeout = 20000) {
  await page.evaluate(() => DK.debug.setSpeed(3));
  await page.waitForFunction(() => { const w = DK.debug.world, a = DK.debug.answer(); return (w.interactive && w.phase === 'play' && a && DK.debug.matScreen(a.id) && w.mats.filter(m => m.launch === w.launch).every(m => m.state === 'rest')) || w.state !== 'round' || w.phase === 'camp' || w.phase === 'wipe'; }, null, { timeout, polling: 'raf' });
  await page.evaluate(() => DK.debug.setSpeed(1));
  await page.waitForTimeout(120);
}
/** play every launch of the round by REAL taps (the right mat + 3 stomps); returns the number of launches */
async function playByTaps(cdp, page) {
  let n = 0;
  for (let k = 0; k < 6; k++) {
    const st = await page.evaluate(() => { const w = DK.debug.world, a = DK.debug.answer(); return { ok: w.state === 'round' && w.phase === 'play' && w.launch < w.cur.k, a: a && a.id, inter: w.interactive }; });
    if (!st.ok) break;
    check(st.inter && st.a != null, 'not interactive mid-round: ' + JSON.stringify(st));
    await tapMat(cdp, page, st.a); await pumpThree(cdp, page); n++;
    await waitLaunch(page);
  }
  return n;
}
/** finish the current round with the bot (fast), stop the bot once the next round's mats unfold */
async function botToNextRound(page, timeout = 90000) {
  const r0 = await page.evaluate(() => DK.debug.world.round);
  await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(6); });
  await page.waitForFunction(r => { const w = DK.debug.world; return w.state === 'round' && w.round !== r && w.phase === 'unfold'; }, r0, { timeout, polling: 'raf' });
  await page.evaluate(() => DK.debug.setBot(false));
  await waitAsk(page);
}
async function info(page) {
  return page.evaluate(() => {
    const w = DK.debug.world, a = DK.debug.answer();
    const cur = w.mats.filter(m => m.launch === w.launch && m.state === 'rest');
    return { a: a.id, launch: w.launch, others: cur.filter(m => !m.target).map(m => m.id), misses: w.misses, k: w.cur.k, m: w.cur.launches[0].length, mode: w.cur.mode };
  });
}
async function shot(page, d, name) { try { await page.screenshot({ path: path.join(OUT, `${d.name}-${name}.png`) }); } catch (e) { /* ignore */ } }

/* ---------------------------------------------------------------- tests */
const T = {};
T.boot_title = async ({ page, url, d, errors }) => {
  const e0 = errors.length;
  await gotoTitle(page, url + '?mute=1&seed=3');
  await page.waitForTimeout(800);
  await shot(page, d, '0-title');
  check(/Mimi/.test(await page.title()) && /Splash Rocket/.test(await page.title()), 'document title: ' + await page.title());
  check(await visible(page, 'scrTitle'), 'title screen hidden');
  check(!(await visible(page, 'loading')), 'loading screen still shown');
  const pb = await page.locator('#btnPlay').boundingBox();
  check(pb && pb.width >= 44 && pb.height >= 44, 'play button too small / missing: ' + JSON.stringify(pb));
  check(pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= d.viewport.width && pb.y + pb.height <= d.viewport.height, 'play button off screen');
  const gb = await page.locator('#btnParents').boundingBox();
  check(gb && gb.width >= 40 && gb.x + gb.width <= d.viewport.width && gb.y >= 0, 'gear button: ' + JSON.stringify(gb));
  const missing = await page.evaluate(() => DK.Assets.missing.slice());
  check(missing.length === 0, 'assets failed to load: ' + missing.join(', '));
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => DK.debug.mode === 'play', null, { timeout: 5000 });
  await page.waitForFunction(() => DK.debug.world.state === 'round', null, { timeout: 15000 });
  check(await visible(page, 'hud'), 'HUD not shown in play');
  await page.waitForTimeout(1500);
  await shot(page, d, '0-unfold');
  check(errors.length === e0, 'boot errors: ' + errors.slice(e0).join(' | '));
};
T.tap_right = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await info(page);
  const n0 = await evLen(page), L0 = await saidLen(page);
  await tapMat(cdp, page, i.a);
  await page.waitForTimeout(250);
  let evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'no right event: ' + types(evs));
  check(!evs.some(e => e.type === 'wrong'), 'a wrong event on the right tap: ' + types(evs));
  // Mimi hops onto the pump; the child stomps 3 times; the rocket flies, the chute pops, it lands ON the mat
  await pumpThree(cdp, page);
  await shot(page, d, '1-launch');
  await waitEv(page, n0, 'land', 10000);
  const l = await page.evaluate(id => { const w = DK.debug.world, m = w.matById(id); return { dx: Math.abs(w.rocket.x - m.x), dy: Math.abs(w.rocket.y - m.y), st: w.rocket.state }; }, i.a);
  await waitEv(page, n0, 'pennant', 10000);
  evs = await evSince(page, n0);
  const pumps = evs.filter(e => e.type === 'pump');
  check(pumps.length === 3 && pumps.map(p => p.n).join() === '1,2,3' && !pumps.some(p => p.auto), 'pumps: ' + JSON.stringify(pumps));
  for (const t of ['aim', 'pumpAsk', 'launch', 'whoosh', 'chute', 'land', 'splash', 'pennant']) check(evs.some(e => e.type === t), 'no ' + t + ' event: ' + types(evs));
  const land = evs.find(e => e.type === 'land');
  check(land.id === i.a && land.err <= 2 && l.dx < 6, 'the rocket did not land on the mat: ' + JSON.stringify({ land, l }));
  const pn = await page.evaluate(() => DK.debug.world.pennants.length);
  check(pn === 1, 'no pennant on the pole: ' + pn);
  const lines = await said(page, L0);
  const col = await page.evaluate(id => DK.I18N.name('en', 'color', DK.debug.world.matById(id).thing.color), i.a);
  check(lines.some(t => t.toLowerCase().includes(String(col).toLowerCase())), `the right line (naming the ${col} one) was not sent to the voice: ` + JSON.stringify(lines));
  const log = await page.evaluate(() => DK.debug.voiceLog.map(x => x.text).join(' | '));
  check(/One!/.test(log) && /Blast off/.test(log), 'the pump count is not in the voice log: ' + log.slice(-300));
};
T.tap_wrong = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await info(page);
  check(i.others.length, 'no other mat in the launch');
  const n0 = await evLen(page), stars0 = await page.evaluate(() => DK.debug.world.stars), L0 = await saidLen(page);
  // slow motion while the two taps land: the 1 s same-mat window is WORLD time, so it holds whatever the CPU load
  await page.evaluate(() => DK.debug.setSpeed(0.25));
  await tapMat(cdp, page, i.others[0]);
  await waitEv(page, n0, 'wrong');
  const w0 = await evLen(page);
  await tapMat(cdp, page, i.others[0]);
  await waitEv(page, w0, 'squish');
  await page.evaluate(() => DK.debug.setSpeed(1));
  const again = await evSince(page, w0);
  check(await page.evaluate(() => DK.debug.world.misses) === 1 && again.some(e => e.type === 'squish'), 'the same mat twice: ' + types(again));
  await page.waitForTimeout(300);
  await shot(page, d, '2-wrong');
  const evs = await evSince(page, n0);
  const s = await page.evaluate(id => { const w = DK.debug.world, m = w.matById(id); return { misses: w.misses, state: w.state, phase: w.phase, inter: w.interactive, st: m.state, launch: w.launch }; }, i.others[0]);
  check(evs.some(e => e.type === 'wrong' && e.id === i.others[0]), 'no wrong event: ' + types(evs));
  check(!evs.some(e => e.type === 'right' || e.type === 'launch'), 'the rocket launched at the wrong mat');
  check(s.misses === 1 && s.state === 'round' && s.phase === 'play' && s.inter && s.st === 'rest' && s.launch === 0, 'after one wrong tap: ' + JSON.stringify(s));
  const lines = await said(page, L0);
  check(lines.length >= 1 && lines.every(t => !/\b(no|wrong|oops|not)\b/i.test(t)), 'kind words after a wrong tap: ' + JSON.stringify(lines));
  // no fail state: the round goes on, its stars drop to 2
  await playByTaps(cdp, page);
  await waitEv(page, n0, 'roundDone', 20000);
  const rd = (await evSince(page, n0)).find(e => e.type === 'roundDone');
  check(rd && rd.stars === 2 && rd.misses === 1, 'round stars after one miss: ' + JSON.stringify(rd));
  check(await page.evaluate(() => DK.debug.world.stars) === stars0 + 2, 'stars did not go up by 2');
};
T.tap_grass_soft = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no open grass point found');
  const n0 = await evLen(page);
  await tap(cdp, page, p, 70);
  await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  check(evs.length && evs[0].type === 'soft' && evs.every(e => ['soft', 'hint', 'assistArmed', 'gust'].includes(e.type)), `tap on the grass at ${p.x},${p.y}: ` + types(evs));
  const s = await page.evaluate(() => ({ m: DK.debug.world.misses, st: DK.debug.world.state, ph: DK.debug.world.phase }));
  check(s.m === 0 && s.st === 'round' && s.ph === 'play', 'after a soft tap: ' + JSON.stringify(s));
};
T.full_round = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 9 });
  const i = await info(page), n0 = await evLen(page);
  const n = await playByTaps(cdp, page);
  check(n === i.k, `launches ${n} for k = ${i.k}`);
  await page.evaluate(() => DK.debug.setSpeed(0.5));
  await page.waitForFunction(() => DK.debug.world.fountain && DK.debug.world.fountain.h > 100, null, { timeout: 15000, polling: 'raf' });
  await shot(page, d, '3-camp-fountain');
  await page.evaluate(() => DK.debug.setSpeed(1));
  await waitEv(page, n0, 'roundDone', 15000);
  const evs = await evSince(page, n0);
  for (const t of ['camp', 'fountain', 'roundDone', 'hopBack', 'fold']) check(evs.some(e => e.type === t), 'no ' + t + ' event: ' + types(evs));
  check(evs.filter(e => e.type === 'right').length === i.k && !evs.some(e => e.type === 'wrong'), 'rights: ' + types(evs));
  check(evs.filter(e => e.type === 'count' && e.camp).length === i.k, 'the camp did not count every pennant: ' + types(evs));
  const rd = evs.find(e => e.type === 'roundDone');
  check(rd.stars === 3, 'a perfect round gave ' + rd.stars + ' stars');
  await page.waitForFunction(() => +document.getElementById('hudStars').textContent >= 1, null, { timeout: 8000 });
  await waitEv(page, n0, 'wipe', 8000);
  await waitAsk(page);
  const s = await page.evaluate(() => ({ round: DK.debug.world.round, pn: DK.debug.world.pennants.length }));
  check(s.round === 1 && s.pn === 0, 'the next round did not start fresh: ' + JSON.stringify(s));
};
T.rapid_pump = async ({ page, cdp, url }) => {
  // a child drumming with two fingers: every NEW finger is a stomp in the pump phase (Input rapidTaps)
  await setupRound(page, url, { seed: 19 });
  const i = await info(page);
  await tapMat(cdp, page, i.a);
  await page.waitForFunction(() => DK.debug.world.phase === 'pump' && DK.debug.world.interactive, null, { timeout: 10000, polling: 'raf' });
  const n0 = await evLen(page);
  const p = await page.evaluate(() => DK.debug.pumpScreen());
  await touchStart(cdp, [tp(p.x, p.y, 1)]); await page.waitForTimeout(300);
  await touchStart(cdp, [tp(p.x, p.y, 1), tp(p.x + 30, p.y + 10, 2)]); await page.waitForTimeout(300);
  await touchEnd(cdp); await page.waitForTimeout(40);
  await touchStart(cdp, [tp(p.x - 20, p.y, 3)]); await page.waitForTimeout(60); await touchEnd(cdp);
  await waitEv(page, n0, 'launch', 5000);
  const pumps = (await evSince(page, n0)).filter(e => e.type === 'pump');
  check(pumps.length === 3 && !pumps.some(e => e.auto), 'two-finger drumming: ' + JSON.stringify(pumps));
};
T.auto_pump = async ({ page, cdp, url }) => {
  // nobody stomps: after 3 s Mimi pumps by herself ("I'll help!") — never stuck at the pump
  await setupRound(page, url, { seed: 20 });
  const i = await info(page), n0 = await evLen(page), v0 = await page.evaluate(() => DK.debug.voiceLog.length);
  await tapMat(cdp, page, i.a);
  await waitEv(page, n0, 'launch', 12000);
  const evs = await evSince(page, n0);
  const pumps = evs.filter(e => e.type === 'pump');
  check(pumps.length === 3 && pumps.every(e => e.auto) && evs.some(e => e.type === 'pumpAuto'), 'auto pump: ' + JSON.stringify(pumps));
  const log = await page.evaluate(n => DK.debug.voiceLog.slice(n).map(x => x.text).join(' | '), v0);
  check(/help/i.test(log), '"I\'ll help!" not said: ' + log);
};
T.rotate_mid_round = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 14, age: 5 });
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no open grass point');
  const n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(300);
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(600);
  const pts = await page.evaluate(() => DK.debug.world.mats.filter(m => m.state === 'rest').map(m => DK.debug.matScreen(m.id)).filter(Boolean));
  for (const c of pts) { await touchMove(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(30); }
  await touchEnd(cdp);
  await page.waitForTimeout(1000);
  await shot(page, d, '8-rotated');
  const evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'right' || e.type === 'wrong'), 'the cancelled gesture still judged: ' + types(evs));
  let out = await page.evaluate(() => window.__qa.outside());
  check(out.length === 0, 'outside the screen after rotation: ' + out.join('; '));
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tapMat(cdp, page, j.a);
  await page.waitForTimeout(400);
  check((await evSince(page, n1)).some(e => e.type === 'right' && e.id === j.a), 'tap after rotation');
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(1200);
  out = await page.evaluate(() => window.__qa.outside());
  check(out.length === 0, 'outside the screen after rotating back: ' + out.join('; '));
};
T.rotate_mid_flight = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 15 });
  const i = await info(page);
  const n0 = await evLen(page);
  await tapMat(cdp, page, i.a);
  await pumpThree(cdp, page);
  // slow motion: the flight (≈ 2 s of WORLD time) is still under the canopy when the resize lands
  await page.evaluate(() => DK.debug.setSpeed(0.15));
  await page.waitForFunction(() => DK.debug.world.rocket.state === 'chute', null, { timeout: 15000, polling: 'raf' });
  const W0 = await page.evaluate(() => DK.debug.world.layout.W);
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForFunction(w0 => DK.debug.world.layout.W !== w0, W0, { timeout: 10000, polling: 'raf' });
  await page.evaluate(() => DK.debug.setSpeed(1));
  await waitEv(page, n0, 'land', 10000);
  await page.waitForTimeout(200);
  const land = (await evSince(page, n0)).find(e => e.type === 'land');
  const s = await page.evaluate(id => { const w = DK.debug.world, m = w.matById(id); return { dx: Math.abs(w.rocket.x - m.x), dy: Math.abs(w.rocket.y - m.y), st: w.rocket.state }; }, i.a);
  check(land.id === i.a && land.err <= 2 && s.dx < 30, 'the rocket did not land on the re-laid mat: ' + JSON.stringify({ land, s }));
  const out = await page.evaluate(() => window.__qa.outside());
  check(out.length === 0, 'outside the screen after the rotation mid-flight: ' + out.join('; '));
  await shot(page, d, '8-rotated-flight');
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(500);
};
T.surprise_marmot = async ctx => surpriseTest(ctx, 'marmot', 0, 0);
T.surprise_goat = async ctx => surpriseTest(ctx, 'goat', 0, 1);
T.surprise_bird = async ctx => surpriseTest(ctx, 'bird', 3, 0);
async function surpriseTest({ page, cdp, url, d }, kind, level, off) {
  // (level + off) % 2 → 0 marmot, 1 goat; level 3 = the rainbow chapter → bird
  await setupRound(page, url, { topic: 'colors', age: 3, seed: 17 + level, level, prep: `w._surpriseRound = 1; w._surpriseOff = ${off};` });
  await botToNextRound(page);
  const sp = await page.evaluate(() => DK.debug.world.surprise);
  if (sp !== kind) {   // no free spot for it on this screen (the world falls back / skips): not a failure of the input layer
    check(kind === 'goat' && (sp === 'marmot' || sp == null), 'surprise of round 1: ' + sp);
    return;
  }
  const fn = kind + 'Screen';
  await page.evaluate(() => DK.debug.setSpeed(3));
  await page.waitForFunction(f => !!DK.debug[f]() && DK.debug.world.interactive, fn, { timeout: 25000, polling: 'raf' });
  await page.evaluate(() => DK.debug.setSpeed(0.5));
  await page.waitForTimeout(150);
  const chk = await page.evaluate(f => {
    const s = DK.debug[f](), bad = [];
    if (!s) return { bad: ['gone'] };
    const el = document.elementFromPoint(s.x, s.y);
    if (!el || el.id !== 'game') bad.push('surprise under DOM ' + (el && (el.id || el.className)));
    if (s.x < 0 || s.y < 0 || s.x > innerWidth || s.y > innerHeight) bad.push('surprise off screen');
    return { s, bad };
  }, fn);
  check(chk.bad.length === 0, kind + ': ' + chk.bad.join('; '));
  await shot(page, d, '9-' + kind);
  let s2 = null;
  try { await page.waitForFunction(f => !!DK.debug[f](), fn, { timeout: 6000, polling: 'raf' }); s2 = await page.evaluate(f => DK.debug[f](), fn); } catch (e) { /* checked below */ }
  check(s2, kind + ' no longer tappable');
  const n0 = await evLen(page);
  await tap(cdp, page, s2, 60);
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  check(evs.some(e => e.type === kind + 'Tap'), `tap on the ${kind} gave no ${kind}Tap: ` + types(evs));
  check(!evs.some(e => e.type === 'wrong' || e.type === 'right'), `${kind} tap judged a mat: ` + types(evs));
  check(await page.evaluate(() => DK.debug.world.misses) === 0, kind + ' tap counted as a miss');
  await page.evaluate(() => DK.debug.setSpeed(1));
  await waitAsk(page);
  const i = await info(page);
  const n1 = await evLen(page);
  await tapMat(cdp, page, i.a);
  await page.waitForTimeout(300);
  evs = await evSince(page, n1);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'target during the ' + kind + ': ' + types(evs));
}
T.count_seq = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { topic: 'count', age: 4, seed: 8 });
  const i = await info(page);
  check(i.mode === 'countSeq' && i.k >= 2, 'not a countSeq round: ' + JSON.stringify(i));
  const L0 = await saidLen(page), n0 = await evLen(page);
  await playByTaps(cdp, page);
  await shot(page, d, '5-countseq');
  await waitEv(page, n0, 'roundDone', 20000);
  const evs = await evSince(page, n0);
  const rights = evs.filter(e => e.type === 'right');
  check(rights.length === i.k && rights.every((e, k) => e.count === k + 1), 'countSeq launches: ' + rights.map(e => e.count).join(','));
  const lines = await said(page, L0);
  check(lines.some(t => /number 1|\b1\b/i.test(t)) && lines.some(t => /number 2|\b2\b/i.test(t)), 'no "Number 1" / "Number 2" lines: ' + JSON.stringify(lines));
};
T.count_sel = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { topic: 'count', age: 4, seed: 8 });
  await botToNextRound(page);
  const i = await info(page);
  check(i.mode === 'countSel', 'round 1 is not countSel: ' + JSON.stringify(i));
  const th = await page.evaluate(id => DK.debug.world.matById(id).thing, i.a);
  check(th.kind === 'dots' && th.n >= 1, 'not a pinecone sign: ' + JSON.stringify(th));
  const L0 = await saidLen(page), n0 = await evLen(page);
  await tapMat(cdp, page, i.a);
  await pumpThree(cdp, page);
  await waitEv(page, n0, 'land', 10000);
  await page.waitForTimeout(600 + 400 * th.n);
  await shot(page, d, '5-countsel');
  await waitEv(page, n0, 'pennant', 15000);
  const evs = await evSince(page, n0);
  const counts = evs.filter(e => e.type === 'count' && e.id === i.a && !e.camp);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'no right: ' + types(evs));
  check(counts.length === th.n && counts.every((e, k) => e.i === k + 1), `count events ${counts.map(e => e.i).join(',')} for ${th.n} pinecones`);
  const lines = await said(page, L0);
  check(lines.some(t => /pinecones?!/i.test(t) && /^one\b/i.test(t)), 'no count run ("One, two, … pinecones!") in the voice: ' + JSON.stringify(lines));
};
T.two_misses_hint = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { age: 4, topic: 'colors', seed: 6 });
  const i = await info(page);
  check(i.others.length >= 1, 'need another mat: ' + JSON.stringify(i));
  const L0 = await saidLen(page), n0 = await evLen(page);
  await tapMat(cdp, page, i.others[0]); await page.waitForTimeout(400);
  let evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'hint'), 'hint after one miss: ' + types(evs));
  await page.waitForTimeout(1000);   // the same mat after the 1 s window is a new miss
  await tapMat(cdp, page, i.others[i.others.length > 1 ? 1 : 0]); await page.waitForTimeout(600);
  evs = await evSince(page, n0);
  const h = evs.find(e => e.type === 'hint');
  check(h && h.id === i.a, 'no hint on the target after 2 misses: ' + types(evs));
  await shot(page, d, '4-hint');
  const g = await page.evaluate(() => ({ hand: !!DK.debug.world.hintHand, m: DK.debug.world.misses }));
  check(g.hand && g.m === 2, 'hint hand / misses: ' + JSON.stringify(g));
  const lines = await said(page, L0);
  check(lines.length >= 2, 'no wrong + hint lines spoken: ' + JSON.stringify(lines));
};
T.mimi_repeat = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 11 });
  await page.waitForTimeout(3400);   // a Mimi tap repeats only after the prompt had its 3 s
  const prompt = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  const v0 = await page.evaluate(() => DK.debug.voiceLog.length), n0 = await evLen(page);
  const k = await page.evaluate(() => DK.debug.mimiScreen());
  check(k, 'no Mimi hit box');
  await tap(cdp, page, { x: k.cx, y: k.cy }, 90);
  await page.waitForTimeout(400);
  const evs = await evSince(page, n0);
  const log = await page.evaluate(n => DK.debug.voiceLog.slice(n).map(x => x.text), v0);
  check(evs.some(e => e.type === 'pokeMimi'), 'no pokeMimi on a Mimi tap: ' + types(evs));
  check(log.includes(prompt), 'Mimi tap did not repeat the prompt in voiceLog: ' + JSON.stringify({ prompt, log }));
  check(!evs.some(e => e.type === 'soft' || e.type === 'wrong'), 'Mimi tap softed / judged: ' + types(evs));
  await page.waitForTimeout(3400);
  const v1 = await page.evaluate(() => DK.debug.voiceLog.length), n1 = await evLen(page);
  await tapEl(page, '#bubble');
  await page.waitForTimeout(300);
  const log2 = await page.evaluate(n => DK.debug.voiceLog.slice(n).map(x => x.text), v1);
  check(log2.includes(prompt), 'bubble tap did not repeat the prompt: ' + JSON.stringify(log2));
  check(!(await evSince(page, n1)).some(e => e.type === 'soft'), 'bubble tap reached the canvas');
};
T.talk_time_tap = async ({ page, url, d }) => {
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 12 });
  await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); });
  await page.waitForFunction(() => DK.debug.world.state === 'talk', null, { timeout: 200000, polling: 'raf' });
  await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); });
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => ({ answered: DK.debug.world.talkAnswered, answer: DK.debug.world.talk.answer, n: document.querySelectorAll('#talkChoices button').length, mode: DK.debug.mode, q: document.getElementById('talkQ').textContent }));
  check(!t.answered, 'bot answered Talk before the test could');
  check(t.mode === 'talk' && await visible(page, 'scrTalk'), 'Talk screen not shown: ' + t.mode);
  check(t.n >= 2 && t.n <= 3, 'Talk choices: ' + t.n);
  check(t.q && !RAW.test(t.q), 'Talk question text: ' + t.q);
  await shot(page, d, '7-talk');
  const s0 = await page.evaluate(() => ({ r: DK.debug.stats.talkRight, st: DK.debug.world.stars }));
  await tapEl(page, `#talkChoices button[data-id="${t.answer}"]`);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ right: DK.debug.stats.talkRight, st: DK.debug.world.stars, cls: document.querySelector('#talkChoices .right') ? 1 : 0 }));
  check(r.right === s0.r + 1 && r.cls && r.st === s0.st + 1, 'tap on the right Talk answer not counted: ' + JSON.stringify(r));
  await page.waitForFunction(() => DK.debug.world.state !== 'talk', null, { timeout: 20000 });
  await page.waitForFunction(() => DK.debug.mode === 'play' && DK.debug.world.state === 'round', null, { timeout: 20000 });
  check(!(await visible(page, 'scrTalk')), 'Talk screen still shown after the answer');
};
T.pause_resume = async ({ page, url }) => {
  await setupRound(page, url);
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => DK.debug.mode) === 'paused' && await visible(page, 'scrPause'), 'pause did not open');
  const t0 = await page.evaluate(() => DK.debug.world.time);
  await page.waitForTimeout(700);
  check(await page.evaluate(() => DK.debug.world.time) === t0, 'world kept running while paused');
  const L0 = await saidLen(page);
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(700);
  const s = await page.evaluate(n => ({ mode: DK.debug.mode, t: DK.debug.world.time, said: window.__said.slice(n).map(x => x.text), bubble: document.getElementById('bubbleText').textContent }), L0);
  check(s.mode === 'play' && s.t > t0, 'resume did not continue: ' + JSON.stringify(s));
  check(!(await visible(page, 'scrPause')), 'pause screen still shown');
  check(s.said.includes(s.bubble), 'prompt not repeated after resume: ' + JSON.stringify(s.said));
};
T.visibility_pause = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 13 });
  const i = await info(page);
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no open grass point');
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(80);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ mode: DK.debug.mode, down: DK.debug.world.finger.down }));
  check(s.mode === 'paused', 'hidden page did not pause: ' + s.mode);
  check(!s.down, 'the gesture was not cancelled when hidden: ' + JSON.stringify(s));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  const n0 = await evLen(page);
  const at = await page.evaluate(id => DK.debug.matScreen(id), i.a);
  await touchMove(cdp, [tp(at.x, at.y)]);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ mode: DK.debug.mode }));
  const evs = await evSince(page, n0);
  check(s.mode === 'paused' && !evs.some(e => e.type === 'right' || e.type === 'wrong'), 'after becoming visible: ' + JSON.stringify(s) + ' ' + types(evs));
  check(await visible(page, 'scrPause'), 'pause screen not shown after returning');
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => DK.debug.mode) === 'play', 'resume after visibility pause failed');
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tapMat(cdp, page, j.a);
  await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right'), 'tap after visibility pause did not give right');
};
T.second_finger_ignored = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 16 });
  const i = await info(page);
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no open grass point');
  await touchStart(cdp, [tp(p.x, p.y, 1)]);
  await page.waitForTimeout(300);
  const n0 = await evLen(page);
  const at = await page.evaluate(id => DK.debug.matScreen(id), i.a);
  await touchStart(cdp, [tp(p.x, p.y, 1), tp(at.x, at.y, 2)]);   // a second finger lands on the target (play phase: ignored)
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
  let s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), title: document.title, saved: DK.debug.getState().settings.lang }));
  check(s.html === 'vi' && /Vịt Mimi/.test(s.logo) && /Tên Lửa Nước/.test(s.logo) && s.play === 'Chơi' && s.saved === 'vi', 'VI not applied on title: ' + JSON.stringify(s));
  check(/Tên Lửa Nước Của Vịt Mimi/.test(s.title), 'VI document title: ' + s.title);
  await shot(page, d, 'a-title-vi');
  await tapEl(page, '#btnPlay');
  await page.evaluate(() => window.__qa.hook());
  await page.evaluate(() => { const w = DK.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
  await waitAsk(page);
  await shot(page, d, 'b-vi-round');
  const vb = await page.evaluate(() => ({ bubble: document.getElementById('bubbleText').textContent, last: window.__asks.slice(-1)[0], said: window.__said.slice(-4) }));
  check(VI_CHARS.test(vb.bubble) && /màu|bé|tên lửa/i.test(vb.bubble), 'bubble not Vietnamese: ' + vb.bubble);
  check(vb.last && vb.last.lang === 'vi', 'ask built in ' + (vb.last && vb.last.lang));
  check(vb.said.some(x => x.text === vb.bubble), 'the VI prompt was not sent to the voice: ' + JSON.stringify(vb.said));
  const ov = await page.evaluate(() => document.getElementById('bubbleText').getBoundingClientRect().height - document.getElementById('bubble').clientHeight);
  check(ov <= 4, 'VI bubble text overflows by ' + ov + ' px');
  await tapEl(page, '#btnPause');
  await page.waitForFunction(() => DK.debug.mode === 'paused');
  check(await page.evaluate(() => document.querySelector('#scrPause h2').textContent) === 'Tạm dừng', 'pause title not translated');
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => DK.debug.mode === 'title');
  await tapEl(page, '.title-top [data-lang="en"]');
  await page.waitForTimeout(200);
  s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), saved: DK.debug.getState().settings.lang }));
  check(s.html === 'en' && /Mimi’s/.test(s.logo) && /Splash Rocket/.test(s.logo) && s.play === 'Play' && s.saved === 'en', 'EN not restored: ' + JSON.stringify(s));
  await tapEl(page, '#btnPlay');
  await waitAsk(page, 30000);
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
  check(keys.includes('dk:settings') && keys.every(k => k.startsWith('dk:')), 'storage keys not under dk: — ' + keys.join(','));
  await gotoTitle(page, url + '?mute=1');
  let s = await page.evaluate(() => ({ st: DK.debug.getState().settings, age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, vol: document.getElementById('optVolume').value, music: document.getElementById('optMusic').checked, sfx: document.getElementById('optSfx').checked, name: document.getElementById('inpName').value }));
  check(s.st.age === 6 && s.st.lang === 'vi' && s.st.name === 'Mầm' && Math.abs(s.st.volume - 0.4) < 1e-6 && s.st.music === false && s.st.sfx === false, 'settings not kept across reload: ' + JSON.stringify(s.st));
  check(/6/.test(s.age) && s.html === 'vi' && s.vol === '40' && !s.music && !s.sfx && s.name === 'Mầm', 'reloaded UI does not show the saved settings: ' + JSON.stringify(s));
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
  await page.waitForFunction(() => DK.debug.world.state === 'intro' || DK.debug.world.state === 'round', null, { timeout: 15000 });
  const playAge = await page.evaluate(() => DK.debug.world.age);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('dk:settings')));
  check(playAge === 3, '?age=3 not played: ' + playAge);
  check(stored.age === 6 && stored.lang === 'vi' && stored.speed === undefined && stored.mute === undefined, 'URL flags leaked into saved settings: ' + JSON.stringify(stored));
  check(Math.abs(stored.volume - 0.55) < 1e-6 && stored.name === 'Mam', 'settings changed under URL flags not saved: ' + JSON.stringify(stored));
  await gotoTitle(page, url + '?mute=1');
  s = await page.evaluate(() => ({ st: DK.debug.getState().settings, html: document.documentElement.lang, age: document.getElementById('titleAge').textContent, speed: DK.debug.getState().speed }));
  check(s.st.age === 6 && s.html === 'vi' && /6/.test(s.age) && s.speed === 1, 'flags stuck after reload without them: ' + JSON.stringify(s));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.audio_chain_volume = async ({ page, url }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');   // the unlock gesture
  await page.waitForTimeout(400);
  let a = await page.evaluate(() => { const A = DK.debug.audio(); return A.ctx ? { master: A.master.gain.value, user: A.user.gain.value, thr: A.comp && A.comp.threshold.value, ratio: A.comp && A.comp.ratio.value, chain: !!(A.master && A.comp && A.user && A.sfx && A.music && A.amb) } : null; });
  check(a && a.chain, 'audio chain missing: ' + JSON.stringify(a));
  check(a.thr <= -12 && a.ratio >= 2, 'compressor not set: ' + JSON.stringify(a));
  check(Math.abs(a.user - 1.6) < 0.05 && Math.abs(a.master - 1) < 0.05, 'loud makeup gain not applied: ' + JSON.stringify(a));
  // every synth sound + every mood's bed / ambience plays without throwing
  const bad = await page.evaluate(() => { const A = DK.debug.audio(), out = []; for (const n of A.SOUNDS) { try { A._lastPlay = {}; A.play(n, { i: 2, n: 3 }); } catch (e) { out.push(n + ': ' + e.message); } } for (let m = 0; m < 4; m++) { try { A.setMood(m); A._playStep(0, A.ctx.currentTime, { root: 60, prog: [[0, 4, 7]], lead: ['uke', 'marimba', 'marimba', 'bell'][m], swing: 0 }, 0.2); A._bubT = 0; A.tick(0.1); } catch (e) { out.push('mood ' + m + ': ' + e.message); } } return out; });
  check(bad.length === 0, 'sounds threw: ' + bad.join('; '));
  await page.waitForFunction(() => DK.debug.world.state === 'round', null, { timeout: 15000 });
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  for (let k = 0; k < 3; k++) { await tapEl(page, '#btnVolDown'); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: DK.debug.audio().user.gain.value, vol: DK.debug.getState().settings.volume, label: document.getElementById('volLevel').textContent, stored: JSON.parse(localStorage.getItem('dk:settings') || '{}').volume }));
  check(Math.abs(a.vol - 0.7) < 1e-6 && Math.abs(a.stored - 0.7) < 1e-6 && a.label === '70%', 'pause − did not set / save 70 %: ' + JSON.stringify(a));
  check(Math.abs(a.user - 0.7 * 1.6) < 0.08, 'user gain does not follow the volume: ' + JSON.stringify(a));
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => DK.debug.mode === 'title');
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '30'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: DK.debug.audio().user.gain.value, stored: JSON.parse(localStorage.getItem('dk:settings') || '{}').volume }));
  check(Math.abs(a.stored - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06, 'slider 30 %: ' + JSON.stringify(a));
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(500);
  a = await page.evaluate(() => ({ user: DK.debug.audio().user.gain.value, vol: DK.debug.getState().settings.volume, slider: document.getElementById('optVolume').value }));
  check(Math.abs(a.vol - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06 && a.slider === '30', 'volume not restored after reload: ' + JSON.stringify(a));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.release_over_hud = async ({ page, cdp, url }) => {
  // a gesture that ends over the pause button must not pause (the finger is captured by the canvas)
  await setupRound(page, url, { seed: 18 });
  const i = await info(page);
  const pb = await page.locator('#btnPause').boundingBox();
  const n0 = await evLen(page);
  const at = await page.evaluate(id => DK.debug.matScreen(id), i.a);
  await swipe(cdp, page, at, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 }, { n: 10, ms: 250 });
  await page.waitForTimeout(400);
  const evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right'), 'press on the target: ' + types(evs));
  check(await page.evaluate(() => DK.debug.mode) === 'play', 'releasing over the pause button paused the game');
  const n1 = await evLen(page);
  const hb = await page.locator('#hudStars').boundingBox();
  await tap(cdp, page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 });
  await page.waitForTimeout(200);
  check(!(await evSince(page, n1)).some(e => e.type === 'soft' || e.type === 'wrong' || e.type === 'right' || e.type === 'pump'), 'a HUD tap reached the canvas');
};
T.url_age_shown = async ({ page, url }) => {
  const bad = [];
  for (const [q, want] of [['2', 3], ['4.5', 5], ['9', 7]]) {
    await gotoTitle(page, `${url}?mute=1&age=${q}`);
    const s = await page.evaluate(() => ({ title: document.getElementById('titleAge').textContent }));
    await page.evaluate(() => { DK.debug.startGame(); });
    const played = await page.evaluate(() => DK.debug.world.age);
    const shown = (s.title.match(/[\d.]+\+?/) || [''])[0];
    if (played !== want || shown.replace('+', '') !== String(want)) bad.push(`?age=${q}: plays ${played}, title shows "${s.title.trim()}"`);
  }
  check(bad.length === 0, 'the title age differs from the age played: ' + bad.join('; '));
};

// a deterministic fake speechSynthesis (≈ 90 ms per char + 300 ms), voice ON, speed 1, real touches: the question is heard in
// full (never dropped / cut short), the pump count is spoken ("One!" … "Blast off!") and never cut, the pennant praise is spoken.
const FAKE_SYNTH = () => {
  window.__synth = { started: [], ended: [], cut: [] };
  const S = { speaking: false, pending: false, paused: false, _q: [], _cur: null, onvoiceschanged: null };
  const voices = [{ name: 'Samantha', lang: 'en-US', localService: true }, { name: 'Linh', lang: 'vi-VN', localService: true }];
  S.getVoices = () => voices; S.addEventListener = () => {}; S.pause = () => {}; S.resume = () => {};
  const next = () => {
    if (S._cur || !S._q.length) { S.speaking = !!S._cur; S.pending = S._q.length > 0; return; }
    const u = S._cur = S._q.shift(); S.speaking = true; S.pending = S._q.length > 0;
    u._t0 = performance.now(); u._dur = 300 + 90 * u.text.length;
    window.__synth.started.push({ text: u.text, t: u._t0 });
    setTimeout(() => { if (u.onstart) u.onstart({}); }, 15);
    u._timer = setTimeout(() => { if (S._cur !== u) return; S._cur = null; window.__synth.ended.push({ text: u.text }); if (u.onend) u.onend({}); next(); }, u._dur);
  };
  S.speak = u => { if (u.text.trim()) { S._q.push(u); setTimeout(next, 0); } else setTimeout(() => u.onend && u.onend({}), 5); };
  S.cancel = () => {
    const c = S._cur; S._cur = null; const q = S._q; S._q = [];
    if (c) { clearTimeout(c._timer); window.__synth.cut.push({ text: c.text, el: Math.round(performance.now() - c._t0), dur: c._dur }); if (c.onerror) c.onerror({ error: 'interrupted' }); }
    q.forEach(u => u.onerror && u.onerror({ error: 'canceled' }));
    S.speaking = false; S.pending = false;
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => S });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; };
};
T.voice_policy = async ({ browser, url, d }) => {
  const errors = [];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(FAKE_SYNTH); await ctx.addInitScript(INIT);
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  try {
    await page.goto(url + '?seed=31&age=4&lang=en');
    await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title', null, { timeout: 20000 });
    await page.evaluate(() => window.__qa.hook());
    await tapEl(page, '#btnPlay');   // the unlock gesture
    await page.evaluate(() => { const w = DK.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
    await page.waitForFunction(READY, null, { timeout: 40000, polling: 'raf' });
    const ask = await page.evaluate(() => document.getElementById('bubbleText').textContent);
    // a listening child: the first tap once the question has started (it is protected from then on)
    await page.waitForFunction(a => window.__synth.started.some(x => x.text.toLowerCase().startsWith(a.toLowerCase().slice(0, 10))), ask, { timeout: 15000, polling: 100 });
    await page.waitForTimeout(600);
    const n0 = await evLen(page);
    const a = await page.evaluate(() => DK.debug.answer().id);
    const col = await page.evaluate(id => DK.I18N.name('en', 'color', DK.debug.world.matById(id).thing.color), a);
    await tapMat(cdp, page, a);
    await pumpThree(cdp, page);
    await waitEv(page, n0, 'pennant', 20000);
    await page.waitForTimeout(4500);
    const sy = await page.evaluate(() => window.__synth);
    const said = sy.started.map(x => x.text);
    const askCut = sy.cut.filter(c => c.text.toLowerCase().startsWith(ask.toLowerCase().slice(0, 10)));
    check(said.some(t => t.toLowerCase().startsWith(ask.toLowerCase().slice(0, 10))) && askCut.length === 0, 'the question was not heard in full: ' + JSON.stringify({ ask, said, askCut }));
    const pumpLines = said.filter(t => /^(one|two|three)\b/i.test(t));
    const pumpWords = pumpLines.join(' ').toLowerCase();
    check(/one/.test(pumpWords) && /two/.test(pumpWords) && /three/.test(pumpWords) && /blast off/.test(pumpWords), 'the pump count was not spoken: ' + JSON.stringify(said));
    const cutPump = sy.cut.filter(c => /^(one|two|three)\b/i.test(c.text));
    check(cutPump.length === 0, 'a pump number was cut: ' + JSON.stringify(cutPump));
    const iThree = said.findIndex(t => /blast off/i.test(t));
    check(said.slice(iThree + 1).some(t => t.toLowerCase().includes(String(col).toLowerCase())), `the pennant praise (${col}) was not spoken after the launch: ` + JSON.stringify(said));
    check(errors.length === 0, 'errors: ' + errors.slice(0, 3).join(' | '));
  } finally { await ctx.close(); }
};
const CORE = ['boot_title', 'tap_right', 'tap_wrong', 'tap_grass_soft', 'full_round', 'rapid_pump', 'rotate_mid_round', 'rotate_mid_flight',
  'surprise_marmot', 'surprise_goat', 'surprise_bird'];
const EXTRA = ['auto_pump', 'count_seq', 'count_sel', 'two_misses_hint', 'mimi_repeat', 'talk_time_tap', 'pause_resume', 'visibility_pause',
  'second_finger_ignored', 'language_switch', 'parent_gate', 'settings_persist', 'audio_chain_volume', 'release_over_hud', 'url_age_shown', 'voice_policy'];

async function runDevice(browser, url, d) {
  const errors = [];
  const { ctx, page, cdp } = await newPage(browser, d, errors);
  let list = CORE.concat(d.extra ? EXTRA : []);
  if (process.env.TESTS) { const want = process.env.TESTS.split(','); list = CORE.concat(EXTRA).filter(t => want.includes(t)); }
  for (const name of list) {
    const e0 = errors.length;
    try {
      await T[name]({ page, cdp, url, d, errors, browser });
      const errs = errors.slice(e0);
      record(d.name, name, errs.length === 0, errs.length ? 'console/page errors: ' + errs.slice(0, 3).join(' | ') : '');
    } catch (e) {
      await shot(page, d, 'fail-' + name);
      let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = DK.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, topic: s.topic, round: s.round, launch: s.launch, mimi: s.mimi, rocket: s.rocket, W: s.W, H: s.H }; })); } catch (x) { /* ignore */ }
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
    await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'done', null, { timeout: 600000, polling: 500 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `bot-age${r.age}-${r.lang}-done.png`) });
    const res = await page.evaluate(() => ({ stats: DK.debug.stats, levels: DK.debug.world.levels, age: DK.debug.world.age, asks: window.__asks, said: window.__said.map(x => ({ text: x.text, lang: x.lang })), log: DK.debug.voiceLog.slice(), doneVisible: !document.getElementById('scrDone').classList.contains('hidden'), doneTitle: document.getElementById('doneTitle').textContent }));
    const s = res.stats;
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    check(res.age === r.age, 'played age ' + res.age);
    check(res.doneVisible && res.doneTitle && !RAW.test(res.doneTitle), 'done screen: ' + JSON.stringify(res.doneTitle));
    check(s.rounds >= 12 && s.correct >= 24 && s.launches >= 24 && s.lands >= 24 && s.pennants >= 24 && s.camps >= 12 && s.wipes >= 11 && s.talks >= 4, 'session too short: ' + JSON.stringify(s));
    const saidSet = new Set(res.said.map(x => x.lang + '|' + x.text));
    const missing = res.asks.filter(a => !saidSet.has(a.lang + '|' + a.text));
    check(res.asks.length >= 12, 'too few prompts built: ' + res.asks.length);
    check(res.asks.every(a => a.lang === r.lang), 'prompts in the wrong language: ' + JSON.stringify(res.asks.filter(a => a.lang !== r.lang).slice(0, 2)));
    check(missing.length === 0, `${missing.length}/${res.asks.length} prompts never reached the voice: ` + JSON.stringify(missing.slice(0, 2)));
    const raw = res.said.filter(x => !x.text || RAW.test(x.text));
    check(raw.length === 0, 'spoken lines with a raw key / {param} / undefined: ' + JSON.stringify(raw.slice(0, 4)));
    const rawLog = res.log.filter(x => !x.text || RAW.test(x.text));
    check(rawLog.length === 0, 'voice log lines with a raw key: ' + JSON.stringify(rawLog.slice(0, 4)));
    check(res.log.length > 0 && res.log.every(x => x.lang === r.lang), 'voice log language: ' + JSON.stringify(res.log.filter(x => x.lang !== r.lang).slice(0, 2)));
    if (r.lang === 'vi') {
      const notVi = res.said.filter(x => !VI_CHARS.test(x.text));
      check(notVi.length / res.said.length < 0.12, 'VI voice has English-looking lines: ' + JSON.stringify(notVi.slice(0, 6).map(x => x.text)));
    } else {
      const bad = res.said.filter(x => VI_CHARS.test(x.text));
      check(bad.length === 0, 'EN voice has Vietnamese lines: ' + JSON.stringify(bad.slice(0, 3)));
    }
    const again = r.age % 2 === 1;
    await tapEl(page, again ? '#btnAgain' : '#btnDoneHome');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ mode: DK.debug.mode, sessions: DK.debug.stats.sessions, st: DK.debug.world.state, title: !document.getElementById('scrTitle').classList.contains('hidden'), stars: document.getElementById('titleStars').textContent }));
    if (again) check(after.mode === 'play' && after.sessions === 2 && after.st !== 'sessionDone', 'Play again did not start a new session: ' + JSON.stringify(after));
    else check(after.mode === 'title' && after.title && +after.stars > 0, 'Home from the done screen: ' + JSON.stringify(after));
    check(errors.length === 0, 'errors: ' + errors.slice(0, 3).join(' | '));
    record(d.name, name, true, '');
    console.log(`      ${name}: ${secs}s, topics ${res.levels.join('/')}, rounds ${s.rounds}, right ${s.correct}, wrong ${s.wrong}, hints ${s.hints}, assists ${s.assists}, pumps ${s.pumps} (auto ${s.autoPumps}), lands ${s.lands}, pennants ${s.pennants}, talks ${s.talks}, surprises ${s.surprises} (taps ${s.marmotTaps}/${s.goatTaps}/${s.birdTaps}), prompts ${res.asks.length}, voice lines ${res.log.length}`);
  } catch (e) {
    let st = ''; try { st = JSON.stringify(await page.evaluate(() => DK.debug.getState())); } catch (x) { /* ignore */ }
    record(d.name, name, false, (e && e.message ? e.message.split('\n')[0] : e) + (st ? '  state ' + st.slice(0, 400) : ''));
  }
  await ctx.close();
}

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const t0 = Date.now();
  try {
    const devs = process.env.BOT_ONLY ? [] : DEVICES.filter(d => !process.env.ONLY || d.name === process.env.ONLY);
    for (const d of devs) await runDevice(browser, srv.url, d);
    const bots = process.env.SKIP_BOT || (!process.env.BOT_ONLY && (process.env.ONLY || process.env.TESTS)) ? [] : BOT_RUNS;
    for (let k = 0; k < bots.length; k += BOT_PAR) await Promise.all(bots.slice(k, k + BOT_PAR).map(r => runBot(browser, srv.url, r)));
  } catch (e) { record('-', 'runner', false, String(e && e.stack)); }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ date: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), results }, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log(`  ${f.device} ${f.test}: ${f.detail}`)); }
  process.exit(fails.length ? 1 : 0);
})();
