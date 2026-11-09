// Functional QA (Pom's Puzzle Town) — Playwright, isMobile + hasTouch contexts on iPhone / iPad, portrait + landscape.
// Every drag is a REAL CDP touch sequence (Input.dispatchTouchEvent → pointer events → PZ.Input → World): the bot bypasses
// the input layer, so this suite is the proof that fingers work.
//   node tests/e2e/functional.js                 (all)
//   ONLY=iphone-portrait node tests/e2e/functional.js     (one device for the per-device tests)
//   SKIP_BOT=1 node tests/e2e/functional.js      (skip the full bot sessions)
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
const BOT_RUNS = [
  { age: 3, lang: 'en', dev: 0 }, { age: 4, lang: 'vi', dev: 1 }, { age: 5, lang: 'en', dev: 2 },
  { age: 6, lang: 'vi', dev: 3 }, { age: 7, lang: 'en', dev: 0 }
];
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;

const results = [];
function record(device, test, ok, detail) {
  results.push({ device, test, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(16)} ${test}${ok ? '' : '  — ' + detail}`);
}
class Fail extends Error {}
const check = (cond, msg) => { if (!cond) throw new Fail(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

// test-only instrumentation: record every prompt the game builds and every line it sends to the voice (uncapped)
const INIT = () => {
  window.__asks = []; window.__said = [];
  const PZ = window.PZ = window.PZ || {};
  let i18n, voice;
  Object.defineProperty(PZ, 'I18N', { configurable: true, get: () => i18n, set: v => {
    i18n = v;
    if (v && v.ask && !v.ask.__wrapped) { const o = v.ask; v.ask = function (lang, key) { const r = o.apply(this, arguments); window.__asks.push({ lang, key, text: r }); return r; }; v.ask.__wrapped = true; }
  } });
  Object.defineProperty(PZ, 'Voice', { configurable: true, get: () => voice, set: v => {
    voice = v;
    if (v && v.say && !v.say.__wrapped) { const o = v.say; v.say = function (text, opts) { window.__said.push({ text: String(text), lang: (opts && opts.lang) || v._lang }); return o.apply(this, arguments); }; v.say.__wrapped = true; }
  } });
};

/* ---------------------------------------------------------------- touch helpers (CDP) */
const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
async function touchStart(cdp, pts) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts }); }
async function touchMove(cdp, pts) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts }); }
async function touchEnd(cdp, pts = []) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts }); }
/** a real finger: press at a, n moves along a slight curve to b, hold still, lift */
async function drag(cdp, page, a, b, { n = 14, ms = 600, hold = 160, bow = 24 } = {}) {
  await touchStart(cdp, [tp(a.x, a.y)]);
  await page.waitForTimeout(90);
  for (let i = 1; i <= n; i++) {
    const u = i / n, bw = Math.sin(u * Math.PI) * bow;
    await touchMove(cdp, [tp(a.x + (b.x - a.x) * u + bw * 0.3, a.y + (b.y - a.y) * u - bw)]);
    await page.waitForTimeout(ms / n);
  }
  await page.waitForTimeout(hold);   // the spring-follow settles under the finger
  await touchEnd(cdp);
}
async function tap(cdp, page, p, hold = 80) {
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(hold);
  await touchEnd(cdp);
}
async function tapEl(page, sel) {
  const b = await page.locator(sel).first().boundingBox();
  check(b, 'element not visible: ' + sel);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
const evCount = (page, type, id) => page.evaluate(([t, i]) => PZ.debug.events.filter(e => e.type === t && (i == null || e.id === i)).length, [type, id]);
const evSince = (page, n0) => page.evaluate(n => PZ.debug.events.slice(n).map(e => e.type), n0);
const evLen = page => page.evaluate(() => PZ.debug.events.length);
const visible = (page, id) => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);

/* ---------------------------------------------------------------- setup */
async function newPage(browser, d, errors, init = true) {
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  if (init) await ctx.addInitScript(INIT);
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
  await page.waitForFunction(() => window.PZ && PZ.debug && PZ.debug.mode === 'title', null, { timeout: 20000 });
  await page.waitForTimeout(300);
}
/** a fresh round of `topic` at `age`, waiting for the first open ask (speed 1 when it is open) */
async function setupRound(page, url, { topic = 'colors', age = 4, seed = 3, lang = '' } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}${lang ? '&lang=' + lang : ''}`);
  await page.evaluate(t => { PZ.debug.startGame(); const w = PZ.debug.world; w.levels[0] = t; w.startLevel(0); PZ.debug.setSpeed(4); }, topic);
  await page.waitForFunction(() => PZ.debug.world.interactive && PZ.debug.answer(), null, { timeout: 20000 });
  await page.evaluate(() => PZ.debug.setSpeed(1));
  await page.waitForTimeout(300);
}
const waitInteractive = page => page.waitForFunction(() => PZ.debug.world.interactive && PZ.debug.answer() &&
  PZ.debug.world.pieces.every(p => p.state !== 'home' && p.state !== 'wrong' && p.state !== 'snap'), null, { timeout: 15000 });
async function answerInfo(page) {
  return page.evaluate(() => {
    const a = PZ.debug.answer(), w = PZ.debug.world;
    const other = w.pieces.find(p => p.state === 'rest' && p.id !== a.piece);
    return { a, from: PZ.debug.pieceScreen(a.piece), to: PZ.debug.slotScreen(a.slot), other: other ? { id: other.id, from: PZ.debug.pieceScreen(other.id) } : null };
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
  check(/Pom/.test(await page.title()), 'document title: ' + await page.title());
  check(await visible(page, 'scrTitle'), 'title screen hidden');
  check(!(await visible(page, 'loading')), 'loading screen still shown');
  const pb = await page.locator('#btnPlay').boundingBox();
  check(pb && pb.width >= 44 && pb.height >= 44, 'play button too small / missing: ' + JSON.stringify(pb));
  check(pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= d.viewport.width && pb.y + pb.height <= d.viewport.height, 'play button off screen');
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => PZ.debug.mode === 'play', null, { timeout: 5000 });
  await page.waitForFunction(() => PZ.debug.world.state === 'round', null, { timeout: 15000 });
  await page.waitForTimeout(1500);
  check(errors.length === e0, 'boot errors: ' + errors.slice(e0).join(' | '));
};
T.drag_correct = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  const n0 = await evCount(page, 'placed', i.a.piece);
  await drag(cdp, page, i.from, i.to);
  await page.waitForTimeout(500);
  await shot(page, d, '1-placed');
  const st = await page.evaluate(id => PZ.debug.world.pieceById(id).state, i.a.piece);
  check(await evCount(page, 'placed', i.a.piece) === n0 + 1, 'no placed event; piece state ' + st);
  check(st === 'placed', 'piece state after snap: ' + st);
  check(await evCount(page, 'pickup', i.a.piece) >= 1, 'no pickup event');
};
T.drag_wrong = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  check(i.other, 'no other piece in the tray');
  const n0 = await evLen(page);
  await drag(cdp, page, i.other.from, i.to);
  await page.waitForTimeout(250);
  await shot(page, d, '2-wrong');
  const evs = await evSince(page, n0);
  check(evs.includes('wrong'), 'no wrong event: ' + evs.join(','));
  check(!evs.includes('placed'), 'wrong piece was placed');
  await page.waitForTimeout(1500);
  const st = await page.evaluate(id => PZ.debug.world.pieceById(id).state, i.other.id);
  check(st === 'rest', 'wrong piece did not fly home: ' + st);
  const misses = await page.evaluate(() => PZ.debug.world.misses);
  check(misses === 1, 'misses after one wrong drop: ' + misses);
};
T.near_miss_then_magnet = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  // the board point farthest from the asked slot's drop zone (logical), in CSS px
  const far = await page.evaluate(sid => {
    const w = PZ.debug.world, Z = w.boardZone(), sz = w.slotZone(sid), B = w.layout.board;
    let best = null, bd = -1;
    for (let gx = 0.08; gx <= 0.92; gx += 0.07) for (let gy = 0.1; gy <= 0.9; gy += 0.07) {
      const x = B.x + gx * B.w, y = B.y + gy * B.h;
      const dx = Math.max(sz.x - x, 0, x - (sz.x + sz.w)), dy = Math.max(sz.y - y, 0, y - (sz.y + sz.h)), dd = Math.hypot(dx, dy);
      if (dd > bd) { bd = dd; best = { x, y }; }
    }
    void Z;
    return { pt: PZ.debug.toScreen(best.x, best.y), d: bd };
  }, i.a.slot);
  check(far.d > 40, 'board too small for a near-miss point outside the zone (' + far.d + ')');
  const n0 = await evLen(page);
  await drag(cdp, page, i.from, far.pt);
  await page.waitForTimeout(250);
  let evs = await evSince(page, n0);
  check(evs.includes('nearMiss'), 'no nearMiss event: ' + evs.join(','));
  check(!evs.includes('wrong') && !evs.includes('placed'), 'near miss counted as wrong/placed: ' + evs.join(','));
  check(await page.evaluate(() => PZ.debug.world.magnet === true && PZ.debug.world.misses === 0), 'magnet not set or a miss counted');
  await waitInteractive(page);
  const from2 = await page.evaluate(id => PZ.debug.pieceScreen(id), i.a.piece);
  const n1 = await evLen(page);
  await drag(cdp, page, from2, far.pt);
  await page.waitForTimeout(500);
  evs = await evSince(page, n1);
  check(evs.includes('placed'), 'second drop anywhere on the board did not snap (magnet): ' + evs.join(','));
};
T.drop_outside_home = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  const pt = await page.evaluate(([vw, vh, from]) => {
    const w = PZ.debug.world, Z = w.boardZone(), v = PZ.debug.view();
    const toL = (x, y) => ({ x: (x - v.left) / v.s, y: (y - v.top) / v.s });
    const inZ = p => p.x >= Z.x && p.x <= Z.x + Z.w && p.y >= Z.y && p.y <= Z.y + Z.h;
    const c = [[0.5, 0.97], [0.04, 0.5], [0.96, 0.5], [0.08, 0.92], [0.92, 0.92], [0.5, 0.6], [0.92, 0.4], [0.08, 0.4]]
      .map(([a, b]) => ({ x: a * vw, y: b * vh }))
      .filter(p => !inZ(toL(p.x, p.y)) && Math.hypot(p.x - from.x, p.y - from.y) > 80);
    return c[0] || null;
  }, [d.viewport.width, d.viewport.height, i.from]);
  check(pt, 'no point outside the board found');
  const n0 = await evLen(page);
  await drag(cdp, page, i.from, pt);
  await page.waitForTimeout(250);
  const evs = await evSince(page, n0);
  check(evs.includes('home'), 'no home event: ' + evs.join(','));
  check(!evs.some(t => t === 'wrong' || t === 'placed' || t === 'nearMiss'), 'drop outside judged as ' + evs.join(','));
  await page.waitForTimeout(900);
  const st = await page.evaluate(id => PZ.debug.world.pieceById(id).state, i.a.piece);
  check(st === 'rest', 'piece not back home: ' + st);
};
T.quick_tap = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  const n0 = await evLen(page);
  await tap(cdp, page, i.from, 90);
  await page.waitForTimeout(500);
  const evs = await evSince(page, n0);
  check(evs.includes('tapPiece'), 'no tapPiece event: ' + evs.join(','));
  check(!evs.some(t => t === 'placed' || t === 'wrong' || t === 'nearMiss'), 'tap judged as a drop: ' + evs.join(','));
  await page.waitForTimeout(400);
  const s = await page.evaluate(id => ({ st: PZ.debug.world.pieceById(id).state, m: PZ.debug.world.misses }), i.a.piece);
  check(s.st === 'rest' && s.m === 0, 'after tap: ' + JSON.stringify(s));
};
T.drop_high = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  // 60 logical px ABOVE the top edge of the slot's piece box (children let go high: the zone reaches 90 px up)
  const hi = await page.evaluate(sid => {
    const w = PZ.debug.world, s = w.slotById(sid), b = w._box(s.thing, s.size);
    return { pt: PZ.debug.toScreen(s.x, s.y - b.h / 2 - 60), dy: b.h / 2 + 60 };
  }, i.a.slot);
  const n0 = await evLen(page);
  await drag(cdp, page, i.from, hi.pt, { bow: 0 });
  await page.waitForTimeout(500);
  const evs = await evSince(page, n0);
  check(evs.includes('placed'), `drop ${hi.dy.toFixed(0)} px above the slot centre did not snap: ` + evs.join(','));
};
T.second_finger_ignored = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  check(i.other, 'no other piece');
  const n0 = await evLen(page);
  const a = i.from, b = i.to, o = i.other.from;
  await touchStart(cdp, [tp(a.x, a.y, 1)]);
  await page.waitForTimeout(80);
  const mid = { x: a.x + (b.x - a.x) * 0.3, y: a.y + (b.y - a.y) * 0.3 };
  await touchMove(cdp, [tp(mid.x, mid.y, 1)]);
  await page.waitForTimeout(60);
  // a second finger lands on another tray piece and wiggles; then it lifts first
  await touchStart(cdp, [tp(mid.x, mid.y, 1), tp(o.x, o.y, 2)]);
  await page.waitForTimeout(60);
  await touchMove(cdp, [tp(mid.x, mid.y, 1), tp(o.x + 40, o.y - 60, 2)]);
  await page.waitForTimeout(60);
  const heldMid = await page.evaluate(() => PZ.debug.world.held);
  // CDP: a touchEnd always lifts EVERY finger; a touchMove that leaves finger 2 out lifts only finger 2
  await touchMove(cdp, [tp(mid.x, mid.y, 1)]);
  await page.waitForTimeout(60);
  const heldAfter2 = await page.evaluate(() => PZ.debug.world.held);
  check(heldAfter2 === i.a.piece, 'lifting the second finger dropped the piece: ' + heldAfter2);
  for (let k = 1; k <= 8; k++) { const u = 0.3 + 0.7 * k / 8; await touchMove(cdp, [tp(a.x + (b.x - a.x) * u, a.y + (b.y - a.y) * u, 1)]); await page.waitForTimeout(40); }
  await page.waitForTimeout(160);
  await touchEnd(cdp);
  await page.waitForTimeout(500);
  const evs = await evSince(page, n0);
  check(heldMid === i.a.piece, 'second finger changed the held piece: ' + heldMid);
  check(evs.filter(t => t === 'pickup').length === 1, 'pickups: ' + evs.join(','));
  check(evs.includes('placed'), 'first finger lost its piece after a second finger: ' + evs.join(','));
};
T.rotate_mid_drag = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  const n0 = await evLen(page);
  await touchStart(cdp, [tp(i.from.x, i.from.y)]);
  await page.waitForTimeout(80);
  for (let k = 1; k <= 5; k++) { await touchMove(cdp, [tp(i.from.x + (i.to.x - i.from.x) * k / 10, i.from.y + (i.to.y - i.from.y) * k / 10)]); await page.waitForTimeout(40); }
  check(await page.evaluate(() => PZ.debug.world.held) === i.a.piece, 'piece not held before rotating');
  const rot = { width: d.viewport.height, height: d.viewport.width };
  await page.setViewportSize(rot);
  await page.waitForTimeout(450);
  await touchMove(cdp, [tp(Math.min(rot.width - 5, i.to.x), Math.min(rot.height - 5, i.to.y))]);
  await page.waitForTimeout(80);
  await touchEnd(cdp);
  await page.waitForTimeout(1200);
  await shot(page, d, '3-rotated');
  const evs = await evSince(page, n0);
  const s = await page.evaluate(([vw, vh]) => {
    const w = PZ.debug.world, v = PZ.debug.view(), out = [];
    const bad = (x, y, r) => x - r < -1 || y - r < -1 || x + r > vw + 1 || y + r > vh + 1;
    for (const p of w.pieces) {
      if (p.state === 'gone') continue;
      const c = PZ.debug.toScreen(p.x, p.y), r = p.size * 0.45 * v.s;
      if (bad(c.x, c.y, r)) out.push('piece ' + p.id + ' ' + p.state + ' at ' + Math.round(c.x) + ',' + Math.round(c.y));
    }
    for (const q of w.slots) { const c = PZ.debug.slotScreen(q.id), r = q.size * 0.45 * v.s; if (bad(c.x, c.y, r)) out.push('slot ' + q.id + ' at ' + Math.round(c.x) + ',' + Math.round(c.y)); }
    const B = PZ.debug.boardScreen();
    return { out, held: w.held, states: w.pieces.map(p => p.state), W: v.W, H: v.H, board: B };
  }, [rot.width, rot.height]);
  check(!evs.some(t => t === 'placed' || t === 'wrong' || t === 'nearMiss'), 'the cancelled drag was judged: ' + evs.join(','));
  check(!s.held && !s.states.includes('held'), 'drag not cancelled: ' + JSON.stringify(s.states));
  check(s.out.length === 0, 'outside the screen after rotation: ' + s.out.join('; '));
  // fingers still work in the new orientation
  await waitInteractive(page);
  const j = await answerInfo(page);
  const n1 = await evLen(page);
  await drag(cdp, page, j.from, j.to);
  await page.waitForTimeout(500);
  const ev2 = await evSince(page, n1);
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(300);
  check(ev2.includes('placed'), 'drag after rotation did not place: ' + ev2.join(','));
};

// ---- extra tests (run on the "extra" devices)
T.language_switch = async ({ page, url, d }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?mute=1&seed=5&age=4');
  await tapEl(page, '.title-top [data-lang="vi"]');
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), saved: PZ.debug.getState().settings.lang }));
  check(s.html === 'vi' && /Voi Pom/.test(s.logo) && s.saved === 'vi', 'VI not applied on title: ' + JSON.stringify(s));
  await tapEl(page, '#btnPlay');
  await page.evaluate(() => { const w = PZ.debug.world; w.levels[0] = 'colors'; w.startLevel(0); PZ.debug.setSpeed(4); });
  await page.waitForFunction(() => PZ.debug.world.interactive, null, { timeout: 20000 });
  await page.evaluate(() => PZ.debug.setSpeed(1));
  await page.waitForTimeout(400);
  await shot(page, d, '4-vi-round');
  const vb = await page.evaluate(() => ({ bubble: document.getElementById('bubbleText').textContent, last: window.__asks.slice(-1)[0], said: window.__said.slice(-3) }));
  check(VI_CHARS.test(vb.bubble) && /mảnh|bé/i.test(vb.bubble), 'bubble not Vietnamese: ' + vb.bubble);
  check(vb.last && vb.last.lang === 'vi', 'ask built in ' + (vb.last && vb.last.lang));
  check(vb.said.some(x => x.text === vb.bubble), 'the VI prompt was not sent to the voice: ' + JSON.stringify(vb.said));
  // back to English through pause → home
  await tapEl(page, '#btnPause');
  await page.waitForFunction(() => PZ.debug.mode === 'paused');
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => PZ.debug.mode === 'title');
  await tapEl(page, '.title-top [data-lang="en"]');
  await page.waitForTimeout(200);
  s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo2').textContent, saved: PZ.debug.getState().settings.lang }));
  check(s.html === 'en' && /Puzzle/.test(s.logo) && s.saved === 'en', 'EN not restored: ' + JSON.stringify(s));
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => PZ.debug.world.interactive, null, { timeout: 25000 });
  const eb = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  check(!VI_CHARS.test(eb), 'bubble not English after switching back: ' + eb);
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
  await tap(cdp, page, c, 1200);
  await page.waitForTimeout(300);
  check(!(await visible(page, 'scrSettings')), 'a 1.2 s hold opened settings');
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
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '40'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await tapEl(page, '#btnSettingsDone');
  await page.waitForTimeout(200);
  check(await visible(page, 'scrTitle'), 'Done did not return to the title');
  await gotoTitle(page, url + '?mute=1');
  let s = await page.evaluate(() => ({ st: PZ.debug.getState().settings, age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, vol: document.getElementById('optVolume').value }));
  check(s.st.age === 6 && s.st.lang === 'vi' && s.st.name === 'Mầm' && Math.abs(s.st.volume - 0.4) < 1e-6, 'settings not kept across reload: ' + JSON.stringify(s.st));
  check(/6/.test(s.age) && s.html === 'vi' && s.vol === '40', 'reloaded UI does not show the saved settings: ' + JSON.stringify(s));
  // URL flags are session-only: they apply but are never saved — even when a setting is changed while they are active
  await gotoTitle(page, url + '?mute=1&age=3&lang=en');
  s = await page.evaluate(() => ({ age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, wage: PZ.debug.world.age }));
  check(/3/.test(s.age) && s.html === 'en', 'URL flags not applied: ' + JSON.stringify(s));
  await tap(cdp, page, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, 2300);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '55'; v.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.fill('#inpName', 'Mam');
  await tapEl(page, '#btnSettingsDone');
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => PZ.debug.world.state === 'round', null, { timeout: 15000 });
  const playAge = await page.evaluate(() => PZ.debug.world.age);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('pz:settings')));
  check(playAge === 3, '?age=3 not played: ' + playAge);
  check(stored.age === 6 && stored.lang === 'vi', 'URL flags leaked into saved settings: ' + JSON.stringify(stored));
  check(Math.abs(stored.volume - 0.55) < 1e-6 && stored.name === 'Mam', 'settings changed under URL flags not saved: ' + JSON.stringify(stored));
  await gotoTitle(page, url + '?mute=1');
  s = await page.evaluate(() => ({ st: PZ.debug.getState().settings, html: document.documentElement.lang, age: document.getElementById('titleAge').textContent }));
  check(s.st.age === 6 && s.html === 'vi' && /6/.test(s.age), 'flags stuck after reload without them: ' + JSON.stringify(s));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.count_topic = async ({ page, cdp, url }) => {
  await setupRound(page, url, { topic: 'count', age: 4 });
  const i = await answerInfo(page);
  const info = await page.evaluate(id => { const p = PZ.debug.world.pieceById(id); return { kind: p.thing.kind, n: p.thing.n, topic: PZ.debug.world.topic }; }, i.a.piece);
  check(info.topic === 'count' && info.kind === 'bunch', 'not a balloon count round: ' + JSON.stringify(info));
  const n0 = await evLen(page);
  await drag(cdp, page, i.from, i.to);
  await page.waitForTimeout(600 + 700 * info.n);
  const evs = await evSince(page, n0);
  const counts = await evCount(page, 'count', i.a.piece);
  check(evs.includes('placed'), 'count piece not placed: ' + evs.join(','));
  check(counts >= info.n, `count events ${counts} for a bunch of ${info.n}`);
  const run = await page.evaluate(() => window.__said.slice(-6).map(s => s.text));
  check(run.some(t => /one/i.test(t) && /balloon/i.test(t)), 'no count run in the voice: ' + JSON.stringify(run));
};
T.talk_time_tap = async ({ page, url, d }) => {
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 9 });
  await page.evaluate(() => { PZ.debug.setBot(true, 1); PZ.debug.setSpeed(8); });
  await page.waitForFunction(() => PZ.debug.world.state === 'talk', null, { timeout: 120000, polling: 'raf' });
  await page.evaluate(() => { PZ.debug.setBot(false); PZ.debug.setSpeed(1); });
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => ({ answered: PZ.debug.world.talkAnswered, answer: PZ.debug.world.talk.answer, n: document.querySelectorAll('#talkChoices button').length, mode: PZ.debug.mode }));
  check(!t.answered, 'bot answered Talk before the test could');
  check(t.mode === 'talk' && await visible(page, 'scrTalk'), 'Talk screen not shown: ' + t.mode);
  check(t.n >= 2 && t.n <= 3, 'Talk choices: ' + t.n);
  await shot(page, d, '5-talk');
  const right0 = await page.evaluate(() => PZ.debug.stats.talkRight);
  await tapEl(page, `#talkChoices button[data-id="${t.answer}"]`);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ right: PZ.debug.stats.talkRight, cls: document.querySelector('#talkChoices .right') ? 1 : 0 }));
  check(r.right === right0 + 1 && r.cls, 'tap on the right Talk answer not counted: ' + JSON.stringify(r));
  await page.waitForFunction(() => PZ.debug.world.state !== 'talk', null, { timeout: 20000 });
  await page.waitForFunction(() => PZ.debug.mode === 'play' && PZ.debug.world.state === 'round', null, { timeout: 20000 });
  check(!(await visible(page, 'scrTalk')), 'Talk screen still shown after the answer');
};
T.pom_and_bubble_repeat = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  await page.waitForTimeout(3400);   // a Pom tap repeats only after the prompt had its 3 s
  const prompt = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  const L0 = await page.evaluate(() => window.__said.length);
  const n0 = await evLen(page);
  const pb = await page.evaluate(() => PZ.debug.pomScreen());
  await tap(cdp, page, { x: pb.x, y: pb.y }, 90);
  await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  const said = await page.evaluate(n => window.__said.slice(n).map(s => s.text), L0);
  check(evs.includes('pokePom'), 'no pokePom on a Pom tap: ' + evs.join(','));
  check(said.includes(prompt), 'Pom tap did not repeat the prompt: ' + JSON.stringify({ prompt, said }));
  check(await page.evaluate(() => !PZ.debug.world.held && PZ.debug.world.misses === 0), 'Pom tap had side effects');
  // tapping the speech bubble also repeats it (and never reaches the canvas)
  const L1 = await page.evaluate(() => window.__said.length), n1 = await evLen(page);
  await tapEl(page, '#bubble');
  await page.waitForTimeout(300);
  const said2 = await page.evaluate(n => window.__said.slice(n).map(s => s.text), L1);
  const ev2 = await evSince(page, n1);
  check(said2.includes(prompt), 'bubble tap did not repeat the prompt: ' + JSON.stringify(said2));
  check(!ev2.includes('soft'), 'bubble tap reached the canvas: ' + ev2.join(','));
};
T.pause_resume = async ({ page, url }) => {
  await setupRound(page, url);
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => PZ.debug.mode) === 'paused' && await visible(page, 'scrPause'), 'pause did not open');
  const t0 = await page.evaluate(() => PZ.debug.world.time);
  await page.waitForTimeout(700);
  const t1 = await page.evaluate(() => PZ.debug.world.time);
  check(t1 === t0, 'world kept running while paused');
  const L0 = await page.evaluate(() => window.__said.length);
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(700);
  const s = await page.evaluate(n => ({ mode: PZ.debug.mode, t: PZ.debug.world.time, said: window.__said.slice(n).map(x => x.text), bubble: document.getElementById('bubbleText').textContent }), L0);
  check(s.mode === 'play' && s.t > t1, 'resume did not continue: ' + JSON.stringify(s));
  check(!(await visible(page, 'scrPause')), 'pause screen still shown');
  check(s.said.includes(s.bubble), 'prompt not repeated after resume: ' + JSON.stringify(s.said));
};
T.visibility_pause = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  // hide the page while a piece is held
  await touchStart(cdp, [tp(i.from.x, i.from.y)]);
  await page.waitForTimeout(80);
  await touchMove(cdp, [tp(i.from.x + 30, i.from.y - 60)]);
  await page.waitForTimeout(60);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ mode: PZ.debug.mode, held: PZ.debug.world.held, ac: PZ.debug.audio().ctx && PZ.debug.audio().ctx.state }));
  check(s.mode === 'paused', 'hidden page did not pause: ' + s.mode);
  check(!s.held, 'held piece not released when hidden');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await touchMove(cdp, [tp(i.to.x, i.to.y)]);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ mode: PZ.debug.mode, placed: PZ.debug.events.filter(e => e.type === 'placed').length }));
  check(s.mode === 'paused' && s.placed === 0, 'after becoming visible: ' + JSON.stringify(s));
  check(await visible(page, 'scrPause'), 'pause screen not shown after returning');
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => PZ.debug.mode) === 'play', 'resume after visibility pause failed');
  await waitInteractive(page);
  const j = await answerInfo(page);
  await drag(cdp, page, j.from, j.to);
  await page.waitForTimeout(500);
  check(await evCount(page, 'placed') === 1, 'drag after visibility pause did not place');
};
T.audio_chain_volume = async ({ page, url }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');   // the unlock gesture
  await page.waitForTimeout(400);
  let a = await page.evaluate(() => { const A = PZ.debug.audio(); return A.ctx ? { master: A.master.gain.value, user: A.user.gain.value, thr: A.comp && A.comp.threshold.value, ratio: A.comp && A.comp.ratio.value, sfx: A.sfx.gain.value, vol: A.volume, chain: !!(A.master && A.comp && A.user && A.sfx && A.music && A.amb) } : null; });
  check(a && a.chain, 'audio chain missing: ' + JSON.stringify(a));
  check(a.thr <= -12 && a.ratio >= 2, 'compressor not set: ' + JSON.stringify(a));
  check(Math.abs(a.user - 1.6) < 0.05 && Math.abs(a.master - 1) < 0.05, 'loud makeup gain not applied: ' + JSON.stringify(a));
  await page.waitForFunction(() => PZ.debug.world.state === 'round', null, { timeout: 15000 });
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  for (let k = 0; k < 3; k++) { await tapEl(page, '#btnVolDown'); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: PZ.debug.audio().user.gain.value, vol: PZ.debug.getState().settings.volume, label: document.getElementById('volLevel').textContent, stored: JSON.parse(localStorage.getItem('pz:settings') || '{}').volume }));
  check(Math.abs(a.vol - 0.7) < 1e-6 && Math.abs(a.stored - 0.7) < 1e-6 && a.label === '70%', 'pause − did not set / save 70 %: ' + JSON.stringify(a));
  check(Math.abs(a.user - 0.7 * 1.6) < 0.08, 'user gain does not follow the volume: ' + JSON.stringify(a));
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(500);
  a = await page.evaluate(() => ({ user: PZ.debug.audio().user.gain.value, vol: PZ.debug.getState().settings.volume, slider: document.getElementById('optVolume').value }));
  check(Math.abs(a.vol - 0.7) < 1e-6 && Math.abs(a.user - 1.12) < 0.08 && a.slider === '70', 'volume not restored after reload: ' + JSON.stringify(a));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};

T.release_over_hud = async ({ page, cdp, url }) => {
  await setupRound(page, url);
  const i = await answerInfo(page);
  const pb = await page.locator('#btnPause').boundingBox();
  const n0 = await evLen(page);
  await drag(cdp, page, i.from, { x: pb.x + pb.width / 2, y: pb.y + pb.height / 2 }, { bow: 0 });
  await page.waitForTimeout(500);
  const evs = await evSince(page, n0);
  check(evs.includes('home') && !evs.includes('wrong'), 'release over the HUD: ' + evs.join(','));
  check(await page.evaluate(() => PZ.debug.mode) === 'play', 'releasing a piece over the pause button paused the game');
};
T.soft_taps_hint_assist = async ({ page, cdp, url }) => {
  await setupRound(page, url, { age: 3 });
  const B = await page.evaluate(() => PZ.debug.boardScreen());
  const n0 = await evLen(page);
  for (let k = 0; k < 7; k++) { await tap(cdp, page, { x: B.x + B.w * 0.12, y: B.y + B.h * 0.12 }, 60); await page.waitForTimeout(300); }
  await page.waitForTimeout(800);
  const evs = await evSince(page, n0);
  check(evs.includes('hint'), 'no hint after soft taps: ' + evs.join(','));
  check(evs.includes('assist') && evs.includes('placed'), 'no assist (the asked piece flies in) after many soft taps: ' + evs.join(','));
  check(await page.evaluate(() => PZ.debug.world.misses) === 0, 'soft taps counted as misses');
};
T.url_age_shown = async ({ page, url }) => {
  const bad = [];
  for (const [q, want] of [['2', 3], ['4.5', 5], ['9', 7]]) {
    await gotoTitle(page, `${url}?mute=1&age=${q}`);
    const s = await page.evaluate(() => ({ title: document.getElementById('titleAge').textContent, chip: (document.querySelector('#ageChips .chip.on') || {}).textContent || null }));
    await page.evaluate(() => { PZ.debug.startGame(); });
    const played = await page.evaluate(() => PZ.debug.world.age);
    const shown = (s.title.match(/[\d.]+\+?/) || [''])[0];
    if (played !== want || shown.replace('+', '') !== String(want)) bad.push(`?age=${q}: plays ${played}, title shows "${s.title.trim()}", chip ${s.chip}`);
  }
  check(bad.length === 0, 'the title age differs from the age played: ' + bad.join('; '));
};

const CORE = ['boot_title', 'drag_correct', 'drag_wrong', 'near_miss_then_magnet', 'drop_outside_home', 'quick_tap', 'drop_high', 'second_finger_ignored', 'rotate_mid_drag'];
const EXTRA = ['language_switch', 'parent_gate', 'settings_persist', 'count_topic', 'talk_time_tap', 'pom_and_bubble_repeat', 'pause_resume', 'visibility_pause', 'audio_chain_volume',
  'release_over_hud', 'soft_taps_hint_assist', 'url_age_shown'];

async function runDevice(browser, url, d) {
  const errors = [];
  const { ctx, page, cdp } = await newPage(browser, d, errors);
  const list = CORE.concat(d.extra ? EXTRA : []);
  for (const name of list) {
    const e0 = errors.length;
    try {
      await T[name]({ page, cdp, url, d, errors });
      const errs = errors.slice(e0);
      record(d.name, name, errs.length === 0, errs.length ? 'console/page errors: ' + errs.slice(0, 3).join(' | ') : '');
    } catch (e) {
      await shot(page, d, 'fail-' + name);
      let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = PZ.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, topic: s.topic, held: s.held, pieces: s.pieces }; })); } catch (x) { /* ignore */ }
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
    await page.goto(`${url}?bot=1&speed=8&autostart=1&mute=1&age=${r.age}&lang=${r.lang}&seed=${20 + r.age}`);
    await page.waitForFunction(() => window.PZ && PZ.debug && PZ.debug.mode === 'done', null, { timeout: 420000, polling: 500 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `bot-age${r.age}-${r.lang}-done.png`) });
    const res = await page.evaluate(() => ({ stats: PZ.debug.stats, levels: PZ.debug.world.levels, age: PZ.debug.world.age, asks: window.__asks, said: window.__said, log: PZ.debug.voiceLog.slice(), doneVisible: !document.getElementById('scrDone').classList.contains('hidden'), doneTitle: document.getElementById('doneTitle').textContent }));
    const s = res.stats;
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    check(res.age === r.age, 'played age ' + res.age);
    check(res.doneVisible, 'done screen not visible');
    check(s.rounds >= 12 && s.correct >= 24 && s.talks >= 4, 'session too short: ' + JSON.stringify(s));
    const saidSet = new Set(res.said.map(x => x.lang + '|' + x.text));
    const missing = res.asks.filter(a => !saidSet.has(a.lang + '|' + a.text));
    check(res.asks.length >= 24, 'too few prompts built: ' + res.asks.length);
    check(res.asks.every(a => a.lang === r.lang), 'prompts in the wrong language: ' + JSON.stringify(res.asks.filter(a => a.lang !== r.lang).slice(0, 2)));
    check(missing.length === 0, `${missing.length}/${res.asks.length} prompts never reached the voice: ` + JSON.stringify(missing.slice(0, 2)));
    check(res.log.length > 0 && res.log.every(x => x.lang === r.lang), 'voice log language: ' + JSON.stringify(res.log.filter(x => x.lang !== r.lang).slice(0, 2)));
    const logSet = new Set(res.log.map(x => x.text));
    const tail = res.asks.slice(-10).filter(a => !logSet.has(a.text));
    check(tail.length === 0, 'PZ.debug.voiceLog misses recent prompts: ' + JSON.stringify(tail.slice(0, 2)));
    if (r.lang === 'vi') {
      const viShare = res.log.filter(x => VI_CHARS.test(x.text)).length / res.log.length;
      check(viShare > 0.8, 'VI voice log has English-looking lines: ' + (viShare * 100).toFixed(0) + '% VI ' + JSON.stringify(res.log.filter(x => !VI_CHARS.test(x.text)).slice(0, 5).map(x => x.text)));
    } else {
      const bad = res.log.filter(x => VI_CHARS.test(x.text.replace(/Mầm/g, '')));
      check(bad.length === 0, 'EN voice log has Vietnamese lines: ' + JSON.stringify(bad.slice(0, 3)));
    }
    // the done screen's buttons: odd ages "Play again" (a new session starts), even ages "Home" (back to the title)
    const again = r.age % 2 === 1;
    await tapEl(page, again ? '#btnAgain' : '#btnDoneHome');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ mode: PZ.debug.mode, sessions: PZ.debug.stats.sessions, st: PZ.debug.world.state, title: !document.getElementById('scrTitle').classList.contains('hidden'), stars: document.getElementById('titleStars').textContent }));
    if (again) check(after.mode === 'play' && after.sessions === 2 && after.st !== 'sessionDone', 'Play again did not start a new session: ' + JSON.stringify(after));
    else check(after.mode === 'title' && after.title && +after.stars > 0, 'Home from the done screen: ' + JSON.stringify(after));
    check(errors.length === 0, 'errors: ' + errors.slice(0, 3).join(' | '));
    record(d.name, name, true, '');
    console.log(`      ${name}: ${secs}s, topics ${res.levels.join('/')}, rounds ${s.rounds}, placed ${s.correct}, wrong ${s.wrong}, near ${s.nearMiss}, hints ${s.hints}, assists ${s.assists}, talks ${s.talks}, prompts ${res.asks.length}, voice lines ${res.said.length}`);
  } catch (e) {
    let st = ''; try { st = JSON.stringify(await page.evaluate(() => PZ.debug.getState())); } catch (x) { /* ignore */ }
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
    const bots = process.env.SKIP_BOT || process.env.ONLY ? [] : BOT_RUNS;
    // the bot sessions run alongside the per-device suites (separate contexts)
    const botP = Promise.all(bots.map(r => runBot(browser, srv.url, r)));
    for (const d of devs) await runDevice(browser, srv.url, d);
    await botP;
  } catch (e) { record('-', 'runner', false, String(e && e.stack)); }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ date: new Date().toISOString(), secs: Math.round((Date.now() - t0) / 1000), results }, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} passed in ${Math.round((Date.now() - t0) / 1000)} s`);
  if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log(`  ${f.device} ${f.test}: ${f.detail}`)); }
  process.exit(fails.length ? 1 : 0);
})();
