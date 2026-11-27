// Functional QA (Tupi's Bakery Delivery) — Playwright, isMobile + hasTouch contexts on iPhone / iPad, portrait + landscape.
// Every gesture on the canvas is a REAL CDP touch sequence (Input.dispatchTouchEvent → pointer events → BD.Input → World):
// the bot bypasses the input layer, so this suite is the proof that fingers drive Tupi's cart.
//   node tests/e2e/functional.js                              (4 devices × the per-device tests + 10 bot sessions, ages 3–7 × EN / VI)
//   ONLY=iphone-portrait node tests/e2e/functional.js         (one device, no bot sessions)
//   TESTS=drag_right,wrong_house node tests/e2e/functional.js (a subset of the per-device tests)
//   SKIP_BOT=1 …  (skip the bot sessions)     BOT_ONLY=1 …  (only them)     BOT_SPEED=8 (default)
// Writes screenshots + results.json to tests/out/functional/. Exits 1 on any failure (also on any console / page error).
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'functional'); fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
];
const BOT_SPEED = +process.env.BOT_SPEED || 8;
const BOT_RUNS = [];
[3, 4, 5, 6, 7].forEach((age, i) => ['en', 'vi'].forEach((lang, j) => BOT_RUNS.push({ age, lang, dev: (2 * i + j) % 4 })));
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const LEAK = /undefined|NaN|\{|\}|\[object|\bnull\b/;

const results = [];
function record(device, test, ok, detail) {
  results.push({ device, test, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(16)} ${test}${detail ? '  — ' + detail : ''}`);
}
class Fail extends Error {}
const check = (cond, msg) => { if (!cond) throw new Fail(msg); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------------------------------------------------------------- page helpers */
const evCount = (page, type) => page.evaluate(t => BD.debug.events.filter(e => e.type === t).length, type);
const evCounts = (page, types) => page.evaluate(ts => { const o = {}; ts.forEach(t => { o[t] = BD.debug.events.filter(e => e.type === t).length; }); return o; }, types);
const st = page => page.evaluate(() => BD.debug.getState());
const tp = (p, id) => ({ x: Math.round(p[0]), y: Math.round(p[1]), id: id || 1, radiusX: 8, radiusY: 8, force: 1 });
async function touchDrag(page, cdp, pts, stepMs, onStep) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(pts[0])] });
  for (let i = 1; i < pts.length; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(pts[i])] });
    await page.waitForTimeout(stepMs);
    if (onStep) await onStep(i);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
async function tapEl(page, sel) {
  const b = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : null; }, sel);
  check(b, 'element not visible: ' + sel);
  await page.touchscreen.tap(Math.round(b.x), Math.round(b.y));
  return b;
}
const visible = (page, sel) => page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; const r = el.getBoundingClientRect(); return !el.classList.contains('hidden') && r.width > 0 && getComputedStyle(el).display !== 'none'; }, sel);
async function freshBoot(page, url, q) {   // empty storage, then boot
  await page.goto(url + '?mute=1');
  await page.evaluate(() => localStorage.clear());
  await boot(page, url, q);
}
async function boot(page, url, q) {
  await page.goto(url + (q || '?mute=1&seed=3'));
  await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'title', null, { timeout: 20000 });
  await page.waitForTimeout(300);
}
/** start a game whose chapter 0 is `topic`, fast-forward to the first interactive moment */
async function toPlay(page, topic, opt) {
  opt = opt || {};
  await page.evaluate(([t, lv]) => { BD.debug.startGame(); const w = BD.debug.world; if (t) { w.levels[lv] = t; } w.startLevel(lv); BD.debug.setSpeed(4); }, [topic || null, opt.level || 0]);
  await waitInteractive(page);
}
async function waitInteractive(page, timeout) {
  await page.evaluate(() => BD.debug.setSpeed(4));
  await page.waitForFunction(() => { const w = BD.debug.world, a = BD.debug.answer(); return BD.debug.mode === 'play' && w.interactive && a && w.cart.state === 'wait' && BD.debug.cartScreen() && w.phaseTime > 0.4 && (!w.hintHand || !w.hintHand.demo); }, null, { timeout: timeout || 30000, polling: 50 });
  await page.evaluate(() => BD.debug.setSpeed(1));
  await page.waitForTimeout(350);   // inputBlockUntil (250 ms) after Play
}
/** distance of the cart from its road + whole cart art box on the logical screen */
const cartCheck = page => page.evaluate(() => {
  const w = BD.debug.world, c = w.cart, R = w.roads, e = BD.Roads.edge(R, c.edge), q = e ? BD.Roads.at(e, c.s) : null;
  const pr = BD.Roads.project(R, c.x, c.y);
  const b = w.cartBox ? w.cartBox() : null, L = w.layout;
  const box = b ? (b.x0 !== undefined ? b : { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h }) : null;
  return { state: c.state, edge: c.edge, s: c.s, x: c.x, y: c.y, onEdge: q ? Math.hypot(q.x - c.x, q.y - c.y) : 1e9, nearest: pr ? pr.d : 1e9,
    box, W: L.W, H: L.H, offScreen: box ? Math.max(0, -box.x0, -box.y0, box.x1 - L.W, box.y1 - L.H) : 0 };
});
const otherHouse = page => page.evaluate(() => { const a = BD.debug.answer(); const h = BD.debug.world.houses.find(h => h.id !== a.houseId); return h ? h.id : null; });

/* ---------------------------------------------------------------- per-device tests */
const T = {};

T.boot_title = async (page, ctx, cdp, url, errors) => {
  await boot(page, url);
  const r = await page.evaluate(() => ({ missing: BD.Assets.missing.slice(), loaded: BD.Assets.loaded, total: BD.Assets.total, title: document.title,
    logo: document.querySelector('.logo').textContent.trim(), titleVis: !document.getElementById('scrTitle').classList.contains('hidden'),
    loadingHidden: document.getElementById('loading').classList.contains('hidden'), hudHidden: document.getElementById('hud').classList.contains('hidden'),
    sw: document.documentElement.scrollWidth, iw: innerWidth, age: document.getElementById('titleAge').textContent }));
  check(r.missing.length === 0, 'assets missing: ' + r.missing.join(', '));
  check(/Tupi/.test(r.title) && /Tupi/.test(r.logo), 'title / logo: ' + r.title + ' / ' + r.logo);
  check(r.titleVis && r.loadingHidden && r.hudHidden, 'title screen state ' + JSON.stringify(r));
  check(r.sw <= r.iw + 1, 'horizontal scroll ' + r.sw + ' > ' + r.iw);
  check(await visible(page, '#btnPlay'), 'Play button not visible');
  check(errors.length === 0, 'console errors on boot: ' + errors.join(' | '));
  // the real ▶ tap starts the game
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => BD.debug.mode === 'play', null, { timeout: 3000 });
  check(await visible(page, '#hud'), 'HUD hidden after Play');
  return `assets ${r.loaded}/${r.total}, "${r.logo}", ${r.age.trim()}`;
};

T.language = async (page, ctx, cdp, url) => {
  await freshBoot(page, url, '?mute=1&seed=5');
  await tapEl(page, '#scrTitle [data-lang="en"]');
  const en = await page.evaluate(() => document.querySelector('.logo').textContent.trim());
  await toPlay(page, 'colors');
  const enB = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  await page.evaluate(() => BD.debug.goTitle()); await page.waitForTimeout(200);
  await tapEl(page, '#scrTitle [data-lang="vi"]');
  await page.waitForTimeout(150);
  const vi = await page.evaluate(() => ({ logo: document.querySelector('.logo').textContent.trim(), lang: document.documentElement.lang, play: document.getElementById('btnPlay').getAttribute('aria-label'), welcome: BD.debug.voiceLog.slice(-1)[0] }));
  await toPlay(page, 'colors');
  const viB = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  check(en !== vi.logo, 'logo did not change: ' + en);
  check(vi.lang === 'vi', 'html lang ' + vi.lang);
  check(enB && viB && enB !== viB, 'bubble text did not change: ' + enB + ' / ' + viB);
  check(!VI_CHARS.test(enB), 'EN bubble has Vietnamese letters: ' + enB);
  check(VI_CHARS.test(viB), 'VI bubble has no diacritics: ' + viB);
  check(vi.welcome && vi.welcome.lang === 'vi', 'no VI welcome line after the switch: ' + JSON.stringify(vi.welcome));
  // back to EN for the next tests
  await page.evaluate(() => BD.debug.goTitle()); await tapEl(page, '#scrTitle [data-lang="en"]');
  return `EN "${enB}" → VI "${viB}"`;
};

T.parent_gate = async (page, ctx, cdp, url) => {
  await boot(page, url);
  await tapEl(page, '#btnParents');
  await page.waitForTimeout(2400);
  check(!(await visible(page, '#scrSettings')), 'a short tap opened the settings');
  // a 1 s hold is not enough either
  const g = await page.evaluate(() => { const r = document.getElementById('btnParents').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(g)] });
  await page.waitForTimeout(1000);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(1300);
  check(!(await visible(page, '#scrSettings')), 'a 1 s hold opened the settings');
  // a 2 s hold opens
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(g)] });
  await page.waitForTimeout(2300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  check(await visible(page, '#scrSettings'), 'a 2.3 s hold did not open the settings');
  await tapEl(page, '#btnSettingsDone');
  await page.waitForTimeout(200);
  check(await visible(page, '#scrTitle') && !(await visible(page, '#scrSettings')), 'Done did not return to the title');
  return 'tap ✗, 1 s ✗, 2.3 s ✓';
};

T.settings_persist = async (page, ctx, cdp, url) => {
  await freshBoot(page, url);
  // open settings through the real gate
  const g = await page.evaluate(() => { const r = document.getElementById('btnParents').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(g)] });
  await page.waitForTimeout(2250);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(250);
  check(await visible(page, '#scrSettings'), 'settings did not open');
  await tapEl(page, '#ageChips .chip[data-age="6"]');
  await tapEl(page, '#scrSettings [data-lang="vi"]');
  await tapEl(page, '#inpName'); await page.keyboard.type('Mai'); await page.evaluate(() => document.getElementById('inpName').blur());
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = 60; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await tapEl(page, '#optMusic');
  await tapEl(page, '#btnSettingsDone');
  const before = await page.evaluate(() => BD.debug.getState().settings);
  await page.reload();
  await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'title', null, { timeout: 20000 });
  const after = await page.evaluate(() => ({ s: BD.debug.getState().settings, age: document.getElementById('titleAge').textContent, lang: document.documentElement.lang,
    gain: BD.debug.audio().volume }));
  check(after.s.age === 6 && after.s.lang === 'vi' && after.s.name === 'Mai' && Math.abs(after.s.volume - 0.6) < 1e-6 && after.s.music === false,
    'settings not restored: ' + JSON.stringify(after.s) + ' (before ' + JSON.stringify(before) + ')');
  check(/6/.test(after.age) && after.lang === 'vi', 'title not restored: ' + after.age + ' ' + after.lang);
  // URL flags are session-only
  const saved0 = await page.evaluate(() => localStorage.getItem('bd:settings'));
  await page.goto(url + '?mute=1&lang=en&age=3&seed=2');
  await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'title', null, { timeout: 20000 });
  const fl = await page.evaluate(() => ({ lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent }));
  check(fl.lang === 'en' && /3/.test(fl.age), '?lang=en&age=3 not applied: ' + JSON.stringify(fl));
  // play with the flags, change the volume from the pause menu (a real save), and the flags must still not be saved
  await toPlay(page, 'colors');
  await tapEl(page, '#btnPause'); await page.waitForTimeout(200);
  await tapEl(page, '#btnVolUp'); await page.waitForTimeout(100);
  const saved1 = await page.evaluate(() => JSON.parse(localStorage.getItem('bd:settings')));
  check(saved1.lang === 'vi' && saved1.age === 6, 'URL flags leaked into storage: ' + JSON.stringify(saved1));
  check(Math.abs(saved1.volume - 0.7) < 1e-6, 'pause-menu volume + not saved (want 0.7): ' + saved1.volume);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  check(keys.length > 0 && keys.every(k => k.startsWith('bd:')), 'storage keys outside bd: ' + keys.join(','));
  await page.evaluate(() => localStorage.clear());
  return `restored ${JSON.stringify({ age: after.s.age, lang: after.s.lang, name: after.s.name, volume: after.s.volume })}; flags not saved (${saved0 ? 'ok' : '?'}); keys ${keys.join(',')}`;
};

T.volume_chain = async (page, ctx, cdp, url) => {
  await freshBoot(page, url, '?seed=4');   // not muted: the real chain
  await tapEl(page, '#btnPlay');       // a user gesture unlocks the audio
  await page.waitForTimeout(400);
  const a = await page.evaluate(() => { const A = BD.debug.audio(); return { ctx: !!A.ctx, state: A.ctx && A.ctx.state, master: !!A.master, comp: !!A.comp, user: !!A.user, sfx: !!A.sfx, music: !!A.music,
    thr: A.comp && A.comp.threshold.value, ratio: A.comp && A.comp.ratio.value, vol: A.volume }; });
  check(a.ctx && a.master && a.comp && a.user && a.sfx && a.music, 'audio chain incomplete: ' + JSON.stringify(a));
  check(Math.abs(a.thr + 18) < 0.5 && Math.abs(a.ratio - 4) < 0.1, 'compressor settings ' + JSON.stringify(a));
  await page.waitForFunction(() => BD.debug.mode === 'play');
  await tapEl(page, '#btnPause'); await page.waitForTimeout(200);
  await tapEl(page, '#btnVolDown'); await page.waitForTimeout(80); await tapEl(page, '#btnVolDown'); await page.waitForTimeout(300);
  const v = await page.evaluate(() => ({ s: BD.debug.getState().settings.volume, a: BD.debug.audio().volume, g: BD.debug.audio().user.gain.value, txt: document.getElementById('volLevel').textContent }));
  check(Math.abs(v.s - 0.8) < 1e-6 && Math.abs(v.a - 0.8) < 1e-6, 'volume − × 2 ≠ 0.8: ' + JSON.stringify(v));
  check(v.txt === '80%', 'volume label ' + v.txt);
  check(Math.abs(v.g - 0.8 * 1.6) < 0.05, 'user gain not following the volume: ' + v.g);
  await page.reload();
  await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'title', null, { timeout: 20000 });
  const r = await page.evaluate(() => ({ s: BD.debug.getState().settings.volume, a: BD.debug.audio().volume, slider: document.getElementById('optVolume').value }));
  check(Math.abs(r.s - 0.8) < 1e-6 && Math.abs(r.a - 0.8) < 1e-6 && r.slider === '80', 'volume not restored: ' + JSON.stringify(r));
  await page.evaluate(() => localStorage.clear());
  return `ctx ${a.state}, master→comp(−18 dB, 4:1)→user; 0.8 restored`;
};

T.drag_right = async (page, ctx, cdp, url) => {
  await boot(page, url);
  await toPlay(page, 'colors');
  const r = await page.evaluate(() => { const a = BD.debug.answer(); return { a, pts: BD.debug.routeScreen(a.houseId), cart: BD.debug.cartScreen() }; });
  const e0 = await evCounts(page, ['grab', 'right', 'deliver', 'wrong', 'drive']);
  let off = 0, maxOn = 0;
  await touchDrag(page, cdp, [[r.cart.x, r.cart.y]].concat(r.pts), 16, async i => { if (i % 5 === 0) { const c = await cartCheck(page); maxOn = Math.max(maxOn, c.onEdge); off = Math.max(off, c.offScreen); } });
  await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'deliver').length > n, e0.deliver, { timeout: 8000 }).catch(() => {});
  const e1 = await evCounts(page, ['grab', 'right', 'deliver', 'wrong', 'drive']);
  check(e1.grab > e0.grab, 'no grab');
  check(e1.right === e0.right + 1 && e1.wrong === e0.wrong, 'right/wrong ' + JSON.stringify([e0, e1]));
  check(e1.deliver > e0.deliver, 'no deliver');
  check(maxOn < 2, 'cart off its edge by ' + maxOn.toFixed(1) + ' px');
  check(off < 2, 'cart art off screen by ' + off.toFixed(1) + ' px');
  await page.screenshot({ path: path.join(OUT, page.__dev + '-drag-right.png') });
  return `${r.pts.length} pts → right + deliver`;
};

T.wrong_house = async (page, ctx, cdp, url) => {
  await boot(page, url, '?mute=1&seed=8');
  await toPlay(page, 'colors');
  const id = await otherHouse(page);
  check(id, 'no wrong house to drive to');
  const r = await page.evaluate(h => ({ pts: BD.debug.routeScreen(h), cart: BD.debug.cartScreen() }), id);
  const e0 = await evCounts(page, ['wrong', 'right', 'reverse']);
  await touchDrag(page, cdp, [[r.cart.x, r.cart.y]].concat(r.pts), 16);
  await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'wrong').length > n, e0.wrong, { timeout: 8000 }).catch(() => {});
  let sawReverse = false;
  for (let i = 0; i < 60 && !sawReverse; i++) { const s = await st(page); if (s.cart.state === 'reverse') sawReverse = true; else await page.waitForTimeout(50); }
  await page.waitForFunction(() => BD.debug.world.interactive && BD.debug.world.cart.state === 'wait', null, { timeout: 10000 }).catch(() => {});
  const e1 = await evCounts(page, ['wrong', 'right', 'reverse']);
  const s = await st(page);
  const wl = await page.evaluate(() => BD.debug.voiceLog.slice(-4).map(l => l.text));
  check(e1.wrong === e0.wrong + 1, 'no wrong event ' + JSON.stringify([e0, e1]));
  check(e1.right === e0.right, 'a wrong house counted as right');
  check(e1.reverse > e0.reverse || sawReverse, 'the cart did not reverse');
  check(s.mode === 'play' && s.state === 'round' && s.interactive, 'not back in play: ' + JSON.stringify({ m: s.mode, st: s.state, ph: s.phase, c: s.cart }));
  const stopS = await page.evaluate(id => { const e = BD.Roads.edge(BD.debug.world.roads, 'to_' + id); return e ? e.stopS : 0; }, id);
  check(s.cart.edge !== 'to_' + id || s.cart.s < 0.3 * stopS, `the cart stayed near the wrong house: ${s.cart.edge} s=${s.cart.s.toFixed(0)} / stop ${stopS.toFixed(0)}`);
  check(s.misses >= 1, 'misses not counted');
  return `wrong → reverse → back on ${s.cart.edge} s=${s.cart.s.toFixed(0)}/${stopS.toFixed(0)}; said "${wl.slice(-1)[0]}"`;
};

T.drag_offroad = async (page, ctx, cdp, url) => {
  await boot(page, url, '?mute=1&seed=9');
  await toPlay(page, 'colors');
  // drag from the cart to the far corner opposite the houses and around in circles over empty table
  const v = await page.evaluate(() => { const vw = BD.debug.view(); const c = BD.debug.cartScreen(); return { c, W: innerWidth, H: innerHeight }; });
  const pts = [[v.c.x, v.c.y]];
  for (let i = 1; i <= 30; i++) pts.push([v.c.x + (v.W * 0.05 - v.c.x) * i / 30, v.c.y + (v.H * 0.95 - v.c.y) * i / 30]);
  for (let i = 0; i <= 30; i++) { const a = i / 30 * Math.PI * 2; pts.push([v.W / 2 + Math.cos(a) * v.W * 0.35, v.H * 0.55 + Math.sin(a) * v.H * 0.3]); }
  let maxOn = 0, maxNear = 0, off = 0;
  const e0 = await evCounts(page, ['grab', 'right', 'wrong']);
  await touchDrag(page, cdp, pts, 16, async i => { if (i % 3 === 0) { const c = await cartCheck(page); maxOn = Math.max(maxOn, c.onEdge); maxNear = Math.max(maxNear, c.nearest); off = Math.max(off, c.offScreen); } });
  await page.waitForTimeout(1500);
  const c = await cartCheck(page);
  maxOn = Math.max(maxOn, c.onEdge);
  check(maxOn < 2 && maxNear < 2, `cart left the road: on-edge ${maxOn.toFixed(1)} px, nearest road ${maxNear.toFixed(1)} px`);
  check(off < 2, 'cart off screen by ' + off.toFixed(1));
  const e1 = await evCounts(page, ['grab', 'right', 'wrong']);
  check(e1.grab > e0.grab, 'no grab');
  return `cart on ${c.edge} s=${c.s.toFixed(0)}, max off-road ${maxOn.toFixed(2)} px; right ${e1.right - e0.right} wrong ${e1.wrong - e0.wrong}`;
};

T.tap_cart_honk = async (page, ctx, cdp, url) => {
  await boot(page, url);
  await toPlay(page, 'colors');
  const c0 = await cartCheck(page), cs = await page.evaluate(() => BD.debug.cartScreen());
  const e0 = await evCounts(page, ['honk', 'grab', 'autoDrive', 'right', 'wrong']);
  await page.touchscreen.tap(Math.round(cs.x), Math.round(cs.y));
  await page.waitForTimeout(700);
  const c1 = await cartCheck(page), e1 = await evCounts(page, ['honk', 'grab', 'autoDrive', 'right', 'wrong']);
  check(e1.honk === e0.honk + 1, 'no honk ' + JSON.stringify([e0, e1]));
  check(e1.autoDrive === e0.autoDrive && e1.right === e0.right && e1.wrong === e0.wrong, 'a tap drove: ' + JSON.stringify([e0, e1]));
  check(Math.hypot(c1.x - c0.x, c1.y - c0.y) < 4, 'cart moved ' + Math.hypot(c1.x - c0.x, c1.y - c0.y).toFixed(1) + ' px on a tap');
  const v = await page.evaluate(() => BD.debug.voiceLog.slice(-3).map(l => l.text));
  return 'honk; said ' + JSON.stringify(v.slice(-2));
};

T.tap_house_autodrive = async (page, ctx, cdp, url) => {
  await boot(page, url);
  await toPlay(page, 'colors');
  const a = await page.evaluate(() => BD.debug.answer());
  const hb = await page.evaluate(id => BD.debug.houseScreen(id), a.houseId);
  const e0 = await evCounts(page, ['autoDrive', 'right']);
  await page.touchscreen.tap(Math.round(hb.cx), Math.round(hb.cy));
  await page.waitForTimeout(150);
  const ad = await page.evaluate(() => BD.debug.events.filter(e => e.type === 'autoDrive').slice(-1)[0]);
  const s1 = await st(page);
  await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'right').length > n, e0.right, { timeout: 8000 }).catch(() => {});
  const e1 = await evCounts(page, ['autoDrive', 'right']);
  check(e1.autoDrive === e0.autoDrive + 1 && ad && ad.id === a.houseId, 'no autoDrive to the house: ' + JSON.stringify(ad));
  check(s1.cart.state === 'auto', 'cart not auto-driving: ' + s1.cart.state);
  check(e1.right === e0.right + 1, 'auto-drive did not reach the right house');
  return 'autoDrive → right';
};

T.count_chapter = async (page, ctx, cdp, url) => {
  await boot(page, url, '?mute=1&seed=12&age=4');
  await page.evaluate(() => { BD.debug.startGame(); const w = BD.debug.world; w.levels[0] = 'count'; w.startLevel(0); BD.debug.setSpeed(3); });
  await waitInteractive(page);
  const r = await page.evaluate(() => {
    const ev = BD.debug.events.filter(e => e.type === 'count'), ask = BD.debug.world.events ? null : null;
    const o = BD.debug.world.orderObj, n = o.count;
    const log = BD.debug.voiceLog.map(l => l.text);
    const want = []; for (let i = 1; i <= n; i++) want.push(BD.I18N.sayCount('en', i));
    const run = BD.I18N.sayCountRun('en', n, 'cookies');
    return { n, nEv: ev.length, is: ev.map(e => BD.debug.world && e.id), cargoCount: BD.debug.world.cart.cargoCount, want, run, missing: want.filter(w => !log.includes(w)), hasRun: log.includes(run),
      bubble: document.getElementById('bubbleText').textContent, topic: BD.debug.world.topic };
  });
  check(r.topic === 'count', 'topic ' + r.topic);
  check(r.n >= 1 && r.nEv === r.n, `count events ${r.nEv} ≠ n ${r.n}`);
  check(r.cargoCount === r.n, 'cargoCount ' + r.cargoCount + ' ≠ ' + r.n);
  check(r.missing.length === 0, 'count numbers not said: ' + r.missing.join(','));
  check(r.hasRun, 'count run not said: ' + r.run);
  check(new RegExp('\\b' + r.n + '\\b').test(r.bubble), 'bubble lacks the number: ' + r.bubble);
  // deliver it with a real drag
  const q = await page.evaluate(() => { const a = BD.debug.answer(); return { pts: BD.debug.routeScreen(a.houseId), cart: BD.debug.cartScreen() }; });
  const e0 = await evCount(page, 'right');
  await touchDrag(page, cdp, [[q.cart.x, q.cart.y]].concat(q.pts), 16);
  await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'right').length > n, e0, { timeout: 8000 }).catch(() => {});
  check(await evCount(page, 'right') === e0 + 1, 'count delivery not right');
  return `${r.n} cookies: ${r.want.join(' ')} ${r.run}; "${r.bubble}"`;
};

T.talk_time = async (page, ctx, cdp, url) => {
  await boot(page, url, '?mute=1&seed=21&age=4');
  await page.evaluate(() => {
    BD.debug.startGame(); BD.debug.setBot(true, 1); BD.debug.setSpeed(8);
    const w = BD.debug.world, u = w.update.bind(w);
    w.update = dt => { u(dt); if (w.state === 'talk' && BD.debug.bot) { BD.debug.setBot(false); BD.debug.setSpeed(1); } };
  });
  await page.waitForFunction(() => BD.debug.mode === 'talk' && document.querySelectorAll('#talkChoices button').length >= 2, null, { timeout: 90000, polling: 100 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, page.__dev + '-talk.png') });
  const t = await page.evaluate(() => { const tk = BD.debug.world.talk; return { ans: String(tk.answerId != null ? tk.answerId : tk.answer), n: tk.choices.length, q: document.getElementById('talkQ').textContent, answered: BD.debug.world.talkAnswered, stars: BD.debug.world.stars }; });
  check(!t.answered, 'Talk time already answered before the tap');
  const e0 = await evCount(page, 'talkResult');
  await tapEl(page, `#talkChoices button[data-id="${t.ans}"]`);
  await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'talkResult').length > n, e0, { timeout: 4000 }).catch(() => {});
  const res = await page.evaluate(() => BD.debug.events.filter(e => e.type === 'talkResult').slice(-1)[0]);
  const ev = await page.evaluate(() => { const w = BD.debug.world; return { correct: w.talkAnswered, stars: w.stars }; });
  check(res, 'no talkResult after the tap');
  const full = await page.evaluate(() => (window.__lastTalk = null));
  const detail = await page.evaluate(() => { const e = BD.debug.world; return { state: e.state, mode: BD.debug.mode }; });
  await page.waitForFunction(() => BD.debug.mode === 'play' && BD.debug.world.state !== 'talk', null, { timeout: 12000 }).catch(() => {});
  const after = await st(page);
  check(after.mode === 'play' && after.state !== 'talk', 'did not leave Talk time: ' + JSON.stringify({ m: after.mode, s: after.state }));
  check(ev.stars >= t.stars + 1, 'no Talk-time star: ' + t.stars + ' → ' + ev.stars);
  return `"${t.q}" ${t.n} choices, tapped the answer → +1★ (${t.stars}→${ev.stars}), next ${after.state}/${after.level}`;
};

T.pause_resume = async (page, ctx, cdp, url) => {
  await boot(page, url);
  await toPlay(page, 'colors');
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  const t0 = await page.evaluate(() => ({ m: BD.debug.mode, t: BD.debug.world.time }));
  await page.waitForTimeout(800);
  const t1 = await page.evaluate(() => ({ m: BD.debug.mode, t: BD.debug.world.time, vis: !document.getElementById('scrPause').classList.contains('hidden') }));
  check(t0.m === 'paused' && t1.vis, 'pause menu not shown: ' + JSON.stringify(t1));
  check(t1.t === t0.t, 'world ran while paused: ' + t0.t + ' → ' + t1.t);
  // a touch on the dim pause screen never reaches the world
  const g0 = await evCounts(page, ['grab', 'soft', 'autoDrive']);
  // at the cart's point unless a pause-menu button sits there (a tap on Home would legitimately leave), else a dim corner
  const cs = await page.evaluate(() => { const c = BD.debug.cartScreen(); const el = document.elementFromPoint(c.x, c.y); return el && el.closest('button') ? { x: 12, y: innerHeight - 12 } : c; });
  await page.touchscreen.tap(Math.round(cs.x), Math.round(cs.y));
  check(JSON.stringify(await evCounts(page, ['grab', 'soft', 'autoDrive'])) === JSON.stringify(g0), 'a touch through the pause menu reached the world');
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(500);
  const t2 = await page.evaluate(() => ({ m: BD.debug.mode, t: BD.debug.world.time, i: BD.debug.world.interactive }));
  check(t2.m === 'play' && t2.t > t1.t, 'did not resume: ' + JSON.stringify(t2));
  // still drivable after resume
  const r = await page.evaluate(() => { const a = BD.debug.answer(); return a ? { pts: BD.debug.routeScreen(a.houseId), cart: BD.debug.cartScreen() } : null; });
  check(r, 'no answer after resume');
  const e0 = await evCount(page, 'right');
  await touchDrag(page, cdp, [[r.cart.x, r.cart.y]].concat(r.pts), 16);
  await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'right').length > n, e0, { timeout: 8000 }).catch(() => {});
  check(await evCount(page, 'right') === e0 + 1, 'drag after resume not right');
  return 'pause freezes the world, resume + drag ok';
};

T.visibility_pause = async (page, ctx, cdp, url) => {
  await boot(page, url);
  await toPlay(page, 'colors');
  // the child holds the cart, then the page goes to the background
  const r = await page.evaluate(() => { const a = BD.debug.answer(); return { pts: BD.debug.routeScreen(a.houseId), cart: BD.debug.cartScreen() }; });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp([r.cart.x, r.cart.y])] });
  for (let i = 0; i < 5; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(r.pts[i])] }); await page.waitForTimeout(16); }
  const d0 = await page.evaluate(() => BD.debug.world.cart.state);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(200);
  const s1 = await page.evaluate(() => ({ m: BD.debug.mode, c: BD.debug.world.cart.state, g: !!BD.debug.world._g, a: BD.debug.audio().ctx ? BD.debug.audio().ctx.state : 'none' }));
  for (let i = 5; i < 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(r.pts[i])] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { value: false, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  const s2 = await page.evaluate(() => ({ m: BD.debug.mode, c: BD.debug.world.cart.state, pauseVis: !document.getElementById('scrPause').classList.contains('hidden') }));
  check(d0 === 'drag', 'the drag did not start: ' + d0);
  check(s1.m === 'paused', 'hidden page did not pause: ' + s1.m);
  check(!s1.g && s1.c !== 'drag', 'the drag survived the background: ' + JSON.stringify(s1));
  check(s2.m === 'paused' && s2.pauseVis, 'not waiting on the pause menu after return: ' + JSON.stringify(s2));
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(300);
  check((await st(page)).mode === 'play', 'resume after visibility failed');
  return `hidden → paused, drag cancelled (cart ${s1.c}), audio ${s1.a}`;
};

T.rotate_mid_drag = async (page, ctx, cdp, url, errors, dev) => {
  await boot(page, url, '?mute=1&seed=14');
  await toPlay(page, 'colors');
  const r = await page.evaluate(() => { const a = BD.debug.answer(); return { a, pts: BD.debug.routeScreen(a.houseId), cart: BD.debug.cartScreen() }; });
  const half = Math.floor(r.pts.length / 2);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp([r.cart.x, r.cart.y])] });
  for (let i = 0; i < half; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(r.pts[i])] }); await page.waitForTimeout(16); }
  const before = await cartCheck(page);
  const g0 = await evCount(page, 'grab');
  await page.setViewportSize({ width: dev.viewport.height, height: dev.viewport.width });
  await page.waitForTimeout(700);
  const mid = await page.evaluate(() => ({ g: !!BD.debug.world._g, c: BD.debug.world.cart.state, W: BD.debug.view().W, H: BD.debug.view().H }));
  // the finger keeps moving (old coordinates are meaningless now) and lifts
  for (let i = half; i < r.pts.length; i += 3) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(r.pts[i])] }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(800);
  const after = await cartCheck(page);
  const houses = await page.evaluate(() => { const w = BD.debug.world, L = w.layout; return w.houses.map(h => { const b = BD.debug.houseScreen(h.id); return { id: h.id, x: h.x, y: h.y, in: h.x > 0 && h.x < L.W && h.y > 0 && h.y < L.H, box: b, iw: innerWidth, ih: innerHeight }; }); });
  const s = await st(page);
  check(before.state === 'drag', 'drag had not started: ' + before.state);
  check(!mid.g && mid.c !== 'drag', 'drag survived the rotation: ' + JSON.stringify(mid));
  check(after.onEdge < 2 && after.nearest < 2, 'cart off the road after rotation: ' + JSON.stringify(after));
  check(after.offScreen < 2, 'cart off screen after rotation by ' + after.offScreen.toFixed(1));
  check(houses.every(h => h.in && h.box && h.box.cx > 0 && h.box.cx < h.iw && h.box.cy > 0 && h.box.cy < h.ih), 'house off screen: ' + JSON.stringify(houses));
  check(await evCount(page, 'grab') === g0, 'the stale finger re-grabbed the cart');
  check(s.mode === 'play' && (s.interactive || s.phase === 'arrive'), 'game state after rotation ' + JSON.stringify({ m: s.mode, st: s.state, ph: s.phase, c: s.cart }));
  // a fresh drag in the new orientation reaches the house
  await page.waitForFunction(() => BD.debug.world.interactive && BD.debug.world.cart.state === 'wait', null, { timeout: 6000 }).catch(() => {});
  const q = await page.evaluate(() => { const a = BD.debug.answer(); return a ? { pts: BD.debug.routeScreen(a.houseId), cart: BD.debug.cartScreen() } : null; });
  check(q, 'not interactive after rotation');
  const e0 = await evCount(page, 'right');
  await touchDrag(page, cdp, [[q.cart.x, q.cart.y]].concat(q.pts), 16);
  await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'right').length > n, e0, { timeout: 8000 }).catch(() => {});
  check(await evCount(page, 'right') === e0 + 1, 'drag after rotation not right');
  await page.screenshot({ path: path.join(OUT, dev.name + '-rotated.png') });
  await page.setViewportSize(dev.viewport);
  await page.waitForTimeout(500);
  return `${mid.W}×${mid.H}: drag cancelled, cart on ${after.edge} (${after.state}), ${houses.length} houses on screen, new drag ok`;
};

T.second_finger = async (page, ctx, cdp, url) => {
  await boot(page, url, '?mute=1&seed=15');
  await toPlay(page, 'colors');
  const r = await page.evaluate(() => { const a = BD.debug.answer(); const o = BD.debug.world.houses.find(h => h.id !== a.houseId); return { pts: BD.debug.routeScreen(a.houseId), cart: BD.debug.cartScreen(), other: BD.debug.houseScreen(o.id) }; });
  const e0 = await evCounts(page, ['autoDrive', 'soft', 'grab', 'right', 'wrong']);
  const f2 = [r.other.cx, r.other.cy];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp([r.cart.x, r.cart.y], 1)] });
  let states = [];
  for (let i = 0; i < r.pts.length; i++) {
    const both = i >= 3 && i < 12;
    if (i === 3) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(r.pts[i], 1), tp(f2, 2)] });
    else if (i === 12) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [tp([f2[0] + 11, f2[1]], 2)] });   // CDP touchEnd lists the point(s) that lift: finger 2
    else await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: both ? [tp(r.pts[i], 1), tp([f2[0] + i, f2[1]], 2)] : [tp(r.pts[i], 1)] });
    await page.waitForTimeout(16);
    if (i === 6 || i === 13) states.push(await page.evaluate(() => BD.debug.world.cart.state));
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForFunction(n => BD.debug.events.filter(e => e.type === 'right').length > n, e0.right, { timeout: 8000 }).catch(() => {});
  const e1 = await evCounts(page, ['autoDrive', 'soft', 'grab', 'right', 'wrong']);
  check(e1.grab === e0.grab + 1, 'finger 1 was lifted / re-grabbed: ' + JSON.stringify([e0, e1]));
  check(e1.autoDrive === e0.autoDrive && e1.soft === e0.soft, 'the second finger reached the world: ' + JSON.stringify([e0, e1]));
  check(states.every(s => s === 'drag'), 'drag lost while the 2nd finger was down: ' + states.join(','));
  check(e1.right === e0.right + 1 && e1.wrong === e0.wrong, 'drag with a second finger did not deliver: ' + JSON.stringify([e0, e1]));
  return 'finger 2 on the other house ignored; finger 1 delivered';
};

T.hud_bubble_taps = async (page, ctx, cdp, url) => {
  await boot(page, url);
  await toPlay(page, 'colors');
  const vis = await visible(page, '#bubble');
  const e0 = await evCounts(page, ['grab', 'soft', 'autoDrive', 'honk', 'pokeTupi']);
  const v0 = await page.evaluate(() => BD.debug.voiceLog.length);
  const hit = [];
  for (const sel of ['#bubble', '.hud-stars', '#hudDots']) {
    if (!(await visible(page, sel))) continue;
    const b = await tapEl(page, sel);
    // what is under that point in the DOM?
    hit.push(await page.evaluate(([x, y]) => { const el = document.elementFromPoint(x, y); return el ? el.id || el.className || el.tagName : 'none'; }, [b.x, b.y]));
    await page.waitForTimeout(250);
  }
  // also a drag that starts on the bubble and slides over the cart
  if (vis) {
    const bb = await page.evaluate(() => { const r = document.getElementById('bubble').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
    const cs = await page.evaluate(() => BD.debug.cartScreen());
    const pts = []; for (let i = 0; i <= 15; i++) pts.push([bb[0] + (cs.x - bb[0]) * i / 15, bb[1] + (cs.y - bb[1]) * i / 15]);
    await touchDrag(page, cdp, pts, 16);
    await page.waitForTimeout(300);
  }
  const e1 = await evCounts(page, ['grab', 'soft', 'autoDrive', 'honk', 'pokeTupi']);
  const v1 = await page.evaluate(() => BD.debug.voiceLog.slice(-2).map(l => l.text));
  check(JSON.stringify(e0) === JSON.stringify(e1), 'a HUD / bubble touch reached the canvas: ' + JSON.stringify([e0, e1]));
  check(await page.evaluate(() => BD.debug.mode) === 'play', 'mode changed');
  return `bubble ${vis ? 'visible' : 'hidden'}; hit ${hit.join(', ')}; 0 world events`;
};

/* ---------------------------------------------------------------- bot sessions */
async function botSession(browser, url, run) {
  const dev = DEVICES[run.dev];
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const name = `bot age ${run.age} ${run.lang.toUpperCase()}`;
  const t0 = Date.now();
  try {
    await page.goto(url + `?speed=${BOT_SPEED}&bot=1&autostart=1&mute=1&age=${run.age}&lang=${run.lang}&seed=${100 + run.age * 7 + (run.lang === 'vi' ? 1 : 0)}`);
    await page.waitForFunction(() => window.BD && BD.debug && BD.debug.mode === 'done', null, { timeout: 420000, polling: 500 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `bot-${run.age}-${run.lang}-${dev.name}-done.png`) });
    const r = await page.evaluate(() => ({ stats: BD.debug.stats, log: BD.debug.voiceLog.map(l => ({ lang: l.lang, text: l.text })), done: !document.getElementById('scrDone').classList.contains('hidden'),
      title: document.getElementById('doneTitle').textContent, missing: BD.Assets.missing.slice(), keys: Object.keys(localStorage), saved: localStorage.getItem('bd:settings'),
      topics: BD.debug.world.levels.slice(), age: BD.debug.world.age }));
    const s = r.stats;
    check(r.done, 'done screen not visible');
    check(s.rounds >= 12 && s.correct >= 14 && s.deliveries >= 14 && s.talks >= 4, 'session too short: ' + JSON.stringify({ rounds: s.rounds, correct: s.correct, deliveries: s.deliveries, talks: s.talks }));
    check(errors.length === 0, 'console errors: ' + errors.slice(0, 3).join(' | '));
    check(r.missing.length === 0, 'missing assets ' + r.missing.join(','));
    const leaks = r.log.filter(l => LEAK.test(l.text));
    check(leaks.length === 0, 'voice leaks: ' + leaks.slice(0, 4).map(l => JSON.stringify(l.text)).join(' | '));
    const wrongLang = r.log.filter(l => l.lang !== run.lang);
    check(wrongLang.length === 0, `lines in the wrong language (${wrongLang.length}): ` + wrongLang.slice(0, 3).map(l => l.text).join(' | '));
    check(r.keys.every(k => k.startsWith('bd:')), 'storage keys ' + r.keys.join(','));
    check(!r.saved, 'URL flags saved a settings record: ' + r.saved);
    let viNote = '';
    if (run.lang === 'vi') {
      const words = r.log.filter(l => /[a-zà-ỹ]{3,}/i.test(l.text));
      const plain = words.filter(l => !VI_CHARS.test(l.text));
      const uniq = [...new Set(plain.map(l => l.text))];
      check(words.length > 20 && plain.length / words.length < 0.15, `VI lines without diacritics ${plain.length}/${words.length}: ` + uniq.slice(0, 6).join(' | '));
      viNote = `, VI lines w/o diacritics ${plain.length}/${words.length}${uniq.length ? ' (' + uniq.slice(0, 4).join(' | ') + ')' : ''}`;
    } else {
      const vi = r.log.filter(l => VI_CHARS.test(l.text));
      check(vi.length === 0, 'EN lines with Vietnamese letters: ' + vi.slice(0, 3).map(l => l.text).join(' | '));
    }
    record(dev.name, name, true, `${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.topics.join('/')}, rounds ${s.rounds}, right ${s.correct}, wrong ${s.wrong}, talks ${s.talks}/${s.talkRight}, hints ${s.hints}, surprises ${s.surprises}, ${r.log.length} lines${viNote}; "${r.title}"`);
  } catch (e) {
    let state = '';
    try { state = JSON.stringify(await page.evaluate(() => { const s = BD.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, level: s.level, round: s.round, cart: s.cart }; })); } catch (_) { /* */ }
    record(dev.name, name, false, (e instanceof Fail ? e.message : 'exception: ' + (e && e.message)) + ' ' + state + (errors.length ? ' errors: ' + errors.slice(0, 2).join(' | ') : ''));
  }
  await ctx.close();
}

/* ---------------------------------------------------------------- main */
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const only = process.env.ONLY, sel = process.env.TESTS ? process.env.TESTS.split(',') : null;
  const t0 = Date.now();
  if (!process.env.BOT_ONLY) {
    for (const d of DEVICES) {
      if (only && d.name !== only) continue;
      const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
      for (const [name, fn] of Object.entries(T)) {
        if (sel && !sel.includes(name)) continue;
        const page = await ctx.newPage();
        page.__dev = d.name;
        const cdp = await ctx.newCDPSession(page);
        const errors = [];
        page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
        page.on('pageerror', e => errors.push(String(e)));
        page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
        page.on('crash', () => errors.push('PAGE CRASH'));
        try {
          const det = await fn(page, ctx, cdp, srv.url, errors, d);
          if (errors.length) throw new Fail('console errors: ' + errors.slice(0, 3).join(' | '));
          record(d.name, name, true, det);
        } catch (e) {
          try { await page.screenshot({ path: path.join(OUT, `${d.name}-FAIL-${name}.png`) }); } catch (_) { /* */ }
          record(d.name, name, false, e instanceof Fail ? e.message : 'exception: ' + (e && e.stack ? e.stack.split('\n').slice(0, 2).join(' ') : e));
        }
        await page.close();
      }
      await ctx.close();
    }
  }
  if (!only && !process.env.SKIP_BOT) {
    const PAR = +process.env.BOT_PAR || 2;
    const queue = BOT_RUNS.slice();
    await Promise.all(Array.from({ length: PAR }, async () => { while (queue.length) await botSession(browser, srv.url, queue.shift()); }));
  }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), seconds: Math.round((Date.now() - t0) / 1000), results }, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} passed, ${fails.length} failed (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  process.exit(fails.length ? 1 : 0);
})();
