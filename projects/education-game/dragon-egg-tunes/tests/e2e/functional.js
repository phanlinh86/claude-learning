// Functional QA (Rio's Singing Eggs) — Playwright, isMobile + hasTouch contexts on iPhone / iPad, portrait + landscape.
// Every tap / swipe is a REAL CDP touch sequence (Input.dispatchTouchEvent → pointer events → SE.Input → World): the bot
// bypasses the input layer, so this suite is the proof that fingers work.
// The echo game: every round (and every beat step) starts with Rio's DEMO (phase 'demo': sparks fly to the tune's eggs,
// demoNote / demoCount, demoEnd) and only then the child's turn (`ask {afterDemo}`); a wrong egg → `wrong {replay}` → a
// replay demo 1.6 s later; poking Rio ≥ 3 s after a demo → a replay. Tests that only need the play phase wait for
// SE.debug.answer() (null during the demo); the demo_* / wrong_replay / rio_poke / rotate_mid_demo / pause_mid_demo tests
// touch the demo itself.
//   node tests/e2e/functional.js                          (all: 4 devices + 10 bot sessions)
//   ONLY=iphone-portrait node tests/e2e/functional.js     (one device, no bot sessions)
//   TESTS=tap_right,song_swipe node tests/e2e/functional.js   (a subset of the per-device tests)
//   SKIP_BOT=1 node tests/e2e/functional.js               (skip the full bot sessions)
//   BOT_ONLY=1 node tests/e2e/functional.js               (only the 10 full bot sessions, ages 3–7 × EN / VI)
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
const BOT_SPEED = +process.env.BOT_SPEED || 8, BOT_PAR = +process.env.BOT_PAR || 4;
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
// a raw i18n key, an unfilled {param}, or a JS hole in a spoken line
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object|\b(ui|p|talk|topic|weather|right|wrong|surprise|lamb|bird|firefly|rio|count|name|idle|session|demo|turn|cymbal)\.[a-z0-9]/i;
// the tune-flow lines (i18n demo.start / demo.replay / demo.beat / turn.first / turn.beat), by language
const LISTEN = { en: /listen|count with me|watch and count|count my taps|here it is again|once more/i, vi: /nghe|đếm|rio hát lại/i };
const TURN = { en: /your turn|now you/i, vi: /đến lượt bé|giờ tới bé|bé hát lại/i };

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
  const SE = window.SE = window.SE || {};
  let i18n, voice;
  Object.defineProperty(SE, 'I18N', { configurable: true, get: () => i18n, set: v => {
    i18n = v;
    if (v && v.ask && !v.ask.__wrapped) { const o = v.ask; v.ask = function (lang, key) { const r = o.apply(this, arguments); window.__asks.push({ lang, key, text: r }); return r; }; v.ask.__wrapped = true; }
  } });
  Object.defineProperty(SE, 'Voice', { configurable: true, get: () => voice, set: v => {
    voice = v;
    if (v && v.say && !v.say.__wrapped) { const o = v.say; v.say = function (text, opts) { window.__said.push({ text: String(text), lang: (opts && opts.lang) || v._lang, t: performance.now() }); return o.apply(this, arguments); }; v.say.__wrapped = true; }
  } });
  window.__qa = {
    // full world events (SE.debug.events keeps only type + id): wrap world._emit once per world
    hook() {
      const w = SE.debug.world;
      if (!w || w.__qa) return;
      const o = w._emit; w.__qa = true;
      // the world may finish an event's flat fields right after emitting it (wrong.replay): re-copy them in a microtask
      w._emit = function (e) { const c = {}; for (const k in e) { const v = e[k]; c[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; } c._t = w.time; window.__ev.push(c);
        if (e.type === 'demoNote' && w.cur && w.cur.steps[e.step]) { const st = w.cur.steps[e.step]; c._ctx = { topic: w.topic, promptKey: st.promptKey, params: JSON.parse(JSON.stringify(st.params || {})) }; }
        queueMicrotask(() => { for (const k in e) { const v = e[k]; if (!(v && typeof v === 'object')) c[k] = v; } }); return o.call(this, e); };
    },
    v() { return SE.debug.view(); },
    toL(x, y) { const v = SE.debug.view(); return { x: (x - v.left) / v.s, y: (y - v.top) / v.s }; },
    // a CSS-px point on the bare canvas (no DOM above it), clear of every egg + cushion (+ a margin for the hop / tilt),
    // Rio, the cymbal and the surprises; inBand: inside the egg band (true → soft 'stage') / outside it (false → 'sky') / either
    softPoint(inBand) {
      const w = SE.debug.world, L = w.layout, band = L.band, kb = L.rioBox, cb = L.cymbalBox;
      const inBox = (b, x, y, m = 0) => x >= b.x - m && x <= b.x + b.w + m && y >= b.y - m && y <= b.y + b.h + m;
      for (const M of [60, 30, 12]) {
        const cands = [];
        for (let gx = 0.03; gx < 0.98; gx += 0.02) for (let gy = 0.05; gy < 0.95; gy += 0.02) {
          const cx = innerWidth * gx, cy = innerHeight * gy, p = this.toL(cx, cy);
          if (p.x < 10 || p.y < 10 || p.x > L.W - 10 || p.y > L.groundY - 10) continue;
          const el = document.elementFromPoint(cx, cy); if (!el || el.id !== 'game') continue;
          if (inBand === true && !inBox(band, p.x, p.y)) continue;
          if (inBand === false && inBox(band, p.x, p.y)) continue;
          if (inBox(kb, p.x, p.y, 20) || (cb && inBox(cb, p.x, p.y, 20))) continue;
          if (w.eggs.some(c => c.state !== 'gone' && (Math.hypot(p.x - c.cx, p.y - c.cy) <= w._hitR(c) + M || inBox(w._cushionBox(c), p.x, p.y, M / 2)))) continue;
          if (w._eggAt(p.x, p.y)) continue;
          if (!w._clearOfKeep(p.x, p.y, 48)) continue;   // the bubble / HUD boxes (even while the DOM bubble is hidden)
          const s = [w.lambHit(), w.birdHit(), w.fireflyHit()].filter(Boolean);
          if (s.some(c => Math.hypot(p.x - c.x, p.y - c.y) < c.r + 40)) continue;
          if (w.fireflies && w.fireflies.some(f => Math.hypot(p.x - f.x, p.y - f.y) < 60)) continue;
          cands.push({ x: Math.round(cx), y: Math.round(cy) });
        }
        if (cands.length) return cands[Math.floor(cands.length / 2)];
      }
      return null;
    },
    hang() { return SE.debug.world.eggs.filter(c => c.state === 'stand'); },
    // a CSS-px point on egg id's RIM (between its core and its hit circle), not on any other egg, on the bare canvas
    rimPoint(id) {
      const w = SE.debug.world, c = w.eggById(id), rc = w._coreR(c), rh = w._hitR(c), d = (rc + rh) / 2;
      for (let k = 0; k < 24; k++) {
        const a = Math.PI / 2 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * Math.PI / 12;   // below the body first, then around
        const x = c.cx + Math.cos(a) * d, y = c.cy + Math.sin(a) * d;
        if (w._eggAt(x, y) !== c) continue;
        if (w.eggs.some(q => q !== c && q.state !== 'gone' && Math.hypot(x - q.cx, y - q.cy) <= w._hitR(q) + 6)) continue;
        if (!w._clearOfKeep(x, y, 20)) continue;
        const sp = SE.debug.toScreen(x, y), el = document.elementFromPoint(sp.x, sp.y);
        if (!el || el.id !== 'game') continue;
        return { x: Math.round(sp.x), y: Math.round(sp.y), dist: Math.hypot(x - c.cx, y - c.cy), rc, rh, s: SE.debug.view().s };
      }
      return null;
    },
    // every standing egg's body (circle at its centre, r = 0.45 size) and its cushion inside the CSS viewport?
    outside() {
      const w = SE.debug.world, v = SE.debug.view(), out = [];
      for (const c of w.eggs) {
        if (c.state === 'gone' || c.state === 'out') continue;
        const p = SE.debug.toScreen(c.cx, c.cy), r = Math.min(c.bw || c.size, c.bh || c.size) * 0.45 * v.s;
        if (p.x - r < -1 || p.y - r < -1 || p.x + r > innerWidth + 1 || p.y + r > innerHeight + 1) out.push(`${c.id} ${c.state} at ${Math.round(p.x)},${Math.round(p.y)} r ${Math.round(r)}`);
        const a = SE.debug.toScreen(c.padX - c.cushionW / 2, c.padY), b = SE.debug.toScreen(c.padX + c.cushionW / 2, c.padY + c.cushionH);
        if (a.x < -1 || a.y < -1 || b.x > innerWidth + 1 || b.y > innerHeight + 1) out.push(`${c.id} cushion ${Math.round(a.x)},${Math.round(a.y)}…${Math.round(b.x)},${Math.round(b.y)}`);
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
  await page.waitForFunction(() => window.SE && SE.debug && SE.debug.mode === 'title' && SE.debug.world, null, { timeout: 20000 });
  await page.evaluate(() => window.__qa.hook());
  await page.waitForTimeout(250);
}
/** a fresh chapter of `topic` (level `level`) at `age`; waits for the first open ask (speed 1 once it is open) */
async function setupRound(page, url, { topic = 'colors', age = 4, seed = 3, lang = '', level = 0, prep = null } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}${lang ? '&lang=' + lang : ''}`);
  await page.evaluate(([t, lv, prep]) => {
    SE.debug.startGame(); const w = SE.debug.world; w.levels[lv] = t; w.startLevel(lv);
    if (prep) (new Function('w', prep))(w);
    SE.debug.setSpeed(4);
  }, [topic, level, prep]);
  await waitAsk(page);
}
async function waitAsk(page, timeout = 20000, { listen = true } = {}) {
  await page.evaluate(() => SE.debug.setSpeed(4));
  await page.waitForFunction(() => { const w = SE.debug.world, a = SE.debug.answer(); return w.interactive && a && a.egg != null && w.eggs.every(c => c.state === 'stand'); }, null, { timeout, polling: 'raf' });
  await page.evaluate(() => SE.debug.setSpeed(1));
  if (!listen) return;   // beat mode: the caller wants to touch inside the beatListen window
  await page.waitForTimeout(350);   // the eggs settle a little
  // beat mode: beats in the first CONFIG.beatListen s after the ask only boom (the child hears the number first)
  await page.waitForFunction(() => { const w = SE.debug.world, B = w._beat; return !B || !w.stepInfo || w.stepInfo.mode !== 'beat' || w.time - B.askT >= SE.CONFIG.beatListen + 0.02; }, null, { timeout: 5000, polling: 'raf' });
}
/** finish the current round with the bot (fast), stop the bot at the next round's first ask */
async function botToNextRound(page, timeout = 60000) {
  const r0 = await page.evaluate(() => SE.debug.world.round);
  await page.evaluate(() => { SE.debug.setBot(true, 1); SE.debug.setSpeed(6); });
  await page.waitForFunction(r => { const w = SE.debug.world; return w.state === 'round' && w.round !== r && w.phase === 'enter'; }, r0, { timeout, polling: 'raf' });
  await page.evaluate(() => SE.debug.setBot(false));
  await waitAsk(page);
}
/** a fresh chapter of `topic` at `age`; stops (speed 1) right at the start of the round's first demo */
async function setupDemo(page, url, { topic = 'colors', age = 5, seed = 3, lang = '', level = 0 } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}${lang ? '&lang=' + lang : ''}`);
  await page.evaluate(([t, lv]) => { SE.debug.startGame(); const w = SE.debug.world; w.levels[lv] = t; w.startLevel(lv); SE.debug.setSpeed(3); }, [topic, level]);
  await page.waitForFunction(() => { const w = SE.debug.world; return w.state === 'round' && w.phase === 'demo' && w.demo; }, null, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => SE.debug.setSpeed(1));
}
/** wait for the next demoStart after event index n0 (speed s while waiting) */
async function waitDemoStart(page, n0, timeout = 15000) {
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'demoStart'), n0, { timeout, polling: 'raf' });
}
/** at a new round with ≥ k tune steps (bot plays rounds until one is found); stops at its first ask after the demo */
async function roundWithSteps(page, k, tries = 6) {
  for (let t = 0; t < tries; t++) {
    const s = await page.evaluate(() => { const w = SE.debug.world; return { n: w.cur ? w.cur.steps.length : 0, step: w.step, mode: w.stepInfo && w.stepInfo.mode }; });
    if (s.n >= k && s.step === 0 && s.mode === 'find') return true;
    await botToNextRound(page);
  }
  return false;
}
async function info(page) {
  return page.evaluate(() => {
    const w = SE.debug.world, a = SE.debug.answer();
    const hang = w.eggs.filter(c => c.state === 'stand');
    const others = hang.filter(c => c.id !== a.egg && !c.done).map(c => ({ id: c.id, at: SE.debug.eggScreen(c.id) }));
    return { a: a.egg, at: SE.debug.eggScreen(a.egg), others, all: hang.map(c => ({ id: c.id, at: SE.debug.eggScreen(c.id), done: c.done })), misses: w.misses };
  });
}
async function shot(page, d, name) { try { await page.screenshot({ path: path.join(OUT, `${d.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
async function finishRoundByTaps(cdp, page) {
  for (let k = 0; k < 14; k++) {
    try { await page.waitForFunction(() => SE.debug.world.state === 'roundDone' || (SE.debug.world.interactive && SE.debug.answer() && SE.debug.answer().egg != null), null, { timeout: 8000 }); } catch (e) { /* retry */ }
    if (await page.evaluate(() => SE.debug.world.state === 'roundDone')) return true;
    await page.waitForTimeout(250);
    const at = await page.evaluate(() => { const a = SE.debug.answer(); return SE.debug.world.interactive && a && a.egg != null ? SE.debug.eggScreen(a.egg) : null; });
    if (at) { await tap(cdp, page, at); await page.waitForTimeout(600); }
  }
  return page.evaluate(() => SE.debug.world.state === 'roundDone');
}

/* ---------------------------------------------------------------- tests */
const T = {};
T.boot_title = async ({ page, url, d, errors }) => {
  const e0 = errors.length;
  await gotoTitle(page, url + '?mute=1&seed=3');
  await page.waitForTimeout(800);
  await shot(page, d, '0-title');
  check(/Rio/.test(await page.title()), 'document title: ' + await page.title());
  check(await visible(page, 'scrTitle'), 'title screen hidden');
  check(!(await visible(page, 'loading')), 'loading screen still shown');
  const pb = await page.locator('#btnPlay').boundingBox();
  check(pb && pb.width >= 44 && pb.height >= 44, 'play button too small / missing: ' + JSON.stringify(pb));
  check(pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= d.viewport.width && pb.y + pb.height <= d.viewport.height, 'play button off screen');
  const gb = await page.locator('#btnParents').boundingBox();
  check(gb && gb.width >= 40 && gb.x + gb.width <= d.viewport.width && gb.y >= 0, 'gear button: ' + JSON.stringify(gb));
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => SE.debug.mode === 'play', null, { timeout: 5000 });
  await page.waitForFunction(() => SE.debug.world.state === 'round', null, { timeout: 15000 });
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
  const st = await page.evaluate(id => ({ done: SE.debug.world.eggById(id).done, lit: SE.debug.world.lanterns.map(l => l.lit) }), i.a);
  check(evs.some(e => e.type === 'ring' && e.judged && e.id === i.a && !e.dull), 'no judged ring on the asked egg: ' + types(evs));
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'no right event: ' + types(evs));
  check(!evs.some(e => e.type === 'wrong'), 'a wrong event on the right tap: ' + types(evs));
  check(evs.some(e => e.type === 'lantern'), 'no lantern event: ' + types(evs));
  check(st.done && st.lit[0] > 0.9, 'egg not done / lantern 0 not lit: ' + JSON.stringify(st));
};
T.tap_wrong = async ({ page, cdp, url, d }) => {
  await setupRound(page, url);
  let i = await info(page);
  if (!i.others.length) { await botToNextRound(page); i = await info(page); }
  check(i.others.length, 'no other egg to tap');
  const n0 = await evLen(page), stars0 = await page.evaluate(() => SE.debug.world.stars);
  await tap(cdp, page, i.others[0].at);
  await page.waitForTimeout(400);
  await shot(page, d, '2-wrong');
  const evs = await evSince(page, n0);
  const s = await page.evaluate(([id]) => { const w = SE.debug.world; return { misses: w.misses, state: w.state, phase: w.phase, inter: w.interactive, done: w.eggById(id).done, ans: SE.debug.answer() }; }, [i.others[0].id]);
  check(evs.some(e => e.type === 'wrong' && e.id === i.others[0].id), 'no wrong event: ' + types(evs));
  check(evs.some(e => e.type === 'ring' && e.judged && e.dull), 'the wrong ring is not dull: ' + types(evs));
  check(!evs.some(e => e.type === 'right'), 'right on a wrong egg');
  check(s.misses === 1 && s.state === 'round' && s.phase === 'play' && s.inter && !s.done && s.ans && s.ans.egg === i.a, 'after one wrong tap: ' + JSON.stringify(s));
  // no fail state: the right egg still works, and the round's stars just drop to 2
  await tap(cdp, page, i.at);
  await page.waitForTimeout(300);
  const ev2 = await evSince(page, n0);
  check(ev2.some(e => e.type === 'right' && e.id === i.a), 'the right egg after a wrong one: ' + types(ev2));
  const ok = await finishRoundByTaps(cdp, page);
  check(ok, 'round did not finish');
  const rd = (await evSince(page, n0)).find(e => e.type === 'roundDone');
  check(rd && rd.stars === 2 && rd.misses === 1, 'round stars after one miss: ' + JSON.stringify(rd));
  check(await page.evaluate(() => SE.debug.world.stars) === stars0 + 2, 'stars did not go up by 2');
};
T.swipe_from_right = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 4 });
  // a 1-note tune ends the round on the right tap (the song phase takes over the finger): use a tune of ≥ 2 notes
  check(await roundWithSteps(page, 2), 'no round with a 2-note tune');
  let i = await info(page);
  check(i.others.length, 'no other egg to swipe through');
  // start ON the asked egg, swipe straight through the farthest other egg (and every one in between)
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
  check(!evs.some(e => e.type === 'wrong'), 'a later egg of the swipe was judged wrong: ' + types(evs));
  check(brush.some(e => e.id === far.id), 'the swipe did not brush the far egg ' + far.id + ': ' + types(evs));
  check(await page.evaluate(() => SE.debug.world.misses) === 0, 'misses after a right swipe');
};
T.swipe_from_sky = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 5 });
  const s = await page.evaluate(() => {
    const w = SE.debug.world, L = w.layout, y = w._eggMidY();
    const hang = w.eggs.filter(c => c.state === 'stand').sort((a, b) => a.cx - b.cx);
    // start left of the leftmost egg's circle on empty sky (not Rio), end right of the rightmost
    const first = hang[0], lastC = hang[hang.length - 1];
    let x0 = first.cx - w._hitR(first) - 30;
    const inB = (b, x, yy) => b && x >= b.x - 6 && x <= b.x + b.w + 6 && yy >= b.y - 6 && yy <= b.y + b.h + 6, inK = (x, yy) => inB(L.rioBox, x, yy) || inB(L.cymbalBox, x, yy);
    while (x0 > 8 && (w._eggAt(x0, y) || inK(x0, y))) x0 -= 10;
    x0 = Math.max(8, x0);
    const x1 = Math.min(L.W - 8, lastC.cx + w._hitR(lastC) + 30);
    // expected judged egg (fairSwipe): the first body CORE the straight path enters; margin = how clear the entry is
    const cores = hang.map(c => { const r = w._coreR(c), dy = Math.abs(c.cy - y); return dy < r ? { id: c.id, xin: c.cx - Math.sqrt(r * r - dy * dy), slack: r - dy } : null; }).filter(Boolean).sort((p, q) => p.xin - q.xin);
    const a = SE.debug.toScreen(x0, y), b = SE.debug.toScreen(x1, y);
    const el = document.elementFromPoint(a.x, a.y);
    return { a, b, expect: cores[0] || null, onEgg: !!w._eggAt(x0, y), el: el && el.id, ans: SE.debug.answer().egg };
  });
  check(!s.onEgg && s.el === 'game', 'no empty start point: ' + JSON.stringify(s));
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
    check(evs.some(e => e.type === want && e.id === judged[0].id), `the judged egg ${judged[0].id} (asked ${s.ans}) gave no ${want}: ` + types(evs));
    check(rings.slice(0, ji).every(e => e.brush), 'rings before the judged one are not brushes: ' + types(evs));
  }
  check(rings.length >= 2, 'the swipe across the band rang only ' + rings.length + ' egg(s): ' + types(evs));
  const m = await page.evaluate(() => SE.debug.world.misses);
  const wantM = judged.length && judged[0].id !== s.ans ? 1 : 0;
  check(m === wantM, 'misses ' + m + ' (the sky start / rim brushes must not count as a miss)');
  check(!evs.some(e => e.type === 'hint'), 'a hint after one swipe: ' + types(evs));
};
T.rim_tap = async ({ page, cdp, url, d }) => {
  // fairSwipe: a press on the asked egg's rim only brushes; released without sliding it is judged as a tap on that egg
  await setupRound(page, url, { seed: 19 });
  let i = await info(page);
  let p = await page.evaluate(id => window.__qa.rimPoint(id), i.a);
  check(p, 'no rim point on the asked egg');
  let n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(90);
  const mid = await evSince(page, n0);
  await touchEnd(cdp);
  await page.waitForTimeout(350);
  let evs = await evSince(page, n0);
  check(mid.some(e => e.type === 'ring' && e.brush && e.id === i.a) && !mid.some(e => e.type === 'right' || e.type === 'wrong'), 'rim press (finger still down) was not just a brush: ' + types(mid));
  check(evs.some(e => e.type === 'ring' && e.judged && e.id === i.a) && evs.some(e => e.type === 'right' && e.id === i.a), 'rim tap not judged right on release: ' + types(evs));
  // a rim press on ANOTHER egg that slides away ≥ 24 px into empty sky: a brush only, never a mistake
  await waitAsk(page);
  i = await info(page);
  if (!i.others.length) return;
  const o = i.others[0];
  p = await page.evaluate(id => window.__qa.rimPoint(id), o.id);
  check(p, 'no rim point on another egg');
  const away = await page.evaluate(([px, py, id]) => {
    const w = SE.debug.world, c = w.eggById(id), v = SE.debug.view(), q = window.__qa.toL(px, py);
    const dx = q.x - c.cx, dy = q.y - c.cy, n = Math.hypot(dx, dy) || 1;
    for (let k = 40; k <= 90; k += 10) { const x = q.x + dx / n * k, y = q.y + dy / n * k; if (!w._eggAt(x, y) && !w.eggs.some(z => z.state !== 'gone' && Math.hypot(x - z.cx, y - z.cy) <= w._coreR(z) + 4)) { const s = SE.debug.toScreen(x, y); return { x: s.x, y: s.y }; } }
    void v; return null;
  }, [p.x, p.y, o.id]);
  if (!away) return;   // nowhere empty next to it: the slide case is covered by swipe_from_sky
  n0 = await evLen(page);
  await swipe(cdp, page, p, away, { n: 6, ms: 150 });
  await page.waitForTimeout(300);
  evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'wrong' || e.type === 'right' || (e.type === 'ring' && e.judged)), 'a rim press that slid off was judged: ' + types(evs));
  check(evs.some(e => e.type === 'ring' && e.brush && e.id === o.id), 'the rim press did not brush its egg: ' + types(evs));
  check(await page.evaluate(() => SE.debug.world.misses) === 0, 'a rim slide counted as a miss');
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
    check(evs[0].kind === (band ? 'stage' : 'sky'), 'soft kind: ' + evs[0].kind + ' (want ' + (band ? 'stage' : 'sky') + ')');
  }
  const s = await page.evaluate(() => ({ m: SE.debug.world.misses, st: SE.debug.world.state, ph: SE.debug.world.phase }));
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
  check(h && h.id === i.a, 'no hint on the asked egg after a miss + a soft press: ' + types(evs));
  await shot(page, d, '4-hint');
  const g = await page.evaluate(id => ({ glow: SE.debug.world.eggById(id).glow, hand: !!SE.debug.world.hintHand, m: SE.debug.world.misses }), i.a);
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
  check(evs.some(e => e.type === 'assist' && e.id === i.a) && evs.some(e => e.type === 'right' && e.id === i.a), 'the assisted press did not ring the asked egg: ' + types(evs));
  check(await page.evaluate(() => SE.debug.world.misses) === 0, 'soft presses counted as misses');
  const n2 = await evLen(page);
  check(await finishRoundByTaps(cdp, page), 'assisted round did not finish');
  const rd = (await evSince(page, n2)).find(e => e.type === 'roundDone');
  check(rd && rd.stars <= 2, 'an assisted round gave ' + (rd && rd.stars) + ' stars (want ≤ 2)');
};
T.beat_count = async ({ page, cdp, url, d }) => {
  // age 4 count = beat mode: ONE big egg + a number card; every real tap ≥ 0.2 s after the last counted one is a beat
  await setupRound(page, url, { topic: 'count', age: 4, seed: 8 });
  let doubled = false, fastChecked = 0, listenChecked = false, nStep = 0;
  for (let rr = 0; rr < 2; rr++) {   // the warm-up round (1 step, n ∈ {1, 2}), then a full one (2 steps, one n ≥ 3)
  const Lpre = await page.evaluate(() => SE.debug.voiceLog.length);
  if (rr > 0) { nStep = await evLen(page); await waitAsk(page, 30000); }
  if (rr === 0) nStep = 0;   // setupRound reloaded the page: __ev holds this round's demo from index 0
  const st0 = await page.evaluate(() => { const w = SE.debug.world, live = w.eggs.filter(c => c.state !== 'gone'); return { mode: w.stepInfo.mode, need: w.stepInfo.need, kind: live[0].thing.kind, n: live.length, steps: w.cur.steps.map(s => s.need), card: w.card ? { n: w.card.n, lit: w.card.lit } : null, round: w.round }; });
  check(st0.mode === 'beat' && st0.kind === 'big' && st0.n === 1, 'not a beat round with one big egg: ' + JSON.stringify(st0));
  check(st0.card && st0.card.n === st0.need && st0.card.lit === 0, 'number card at the ask: ' + JSON.stringify(st0));
  const L0 = await page.evaluate(() => SE.debug.voiceLog.length), n0 = await evLen(page);
  // a touch beside the big egg is soft (never a wrong, never a count)
  if (rr === 0) {
  const sp = await page.evaluate(() => window.__qa.softPoint(null));
  check(sp, 'no soft point beside the big egg');
  await tap(cdp, page, sp, 60); await page.waitForTimeout(250);
  const evs = await evSince(page, n0);
  check(evs.length && evs[0].type === 'soft' && !evs.some(e => e.type === 'count' || e.type === 'wrong'), 'tap beside the big egg: ' + types(evs));
  }
  let evs;
  for (let si = 0; si < st0.steps.length; si++) {
    if (si > 0) {
      if (rr === 1 && si === 1) {   // a beat inside CONFIG.beatListen after the ask booms (ring brush beat) but does not count
        await waitAsk(page, 20000, { listen: false });
        const e0 = await evLen(page);
        const q = await page.evaluate(() => { const w = SE.debug.world; return { at: SE.debug.eggScreen(SE.debug.answer().egg), since: w.time - w._beat.askT, listen: SE.CONFIG.beatListen }; });
        check(q.since < q.listen - 0.15, `could not tap inside beatListen (${q.since.toFixed(2)} s after the ask, window ${q.listen})`);
        await tap(cdp, page, q.at, 50); await page.waitForTimeout(60);
        const el = await evSince(page, e0), r = el.filter(e => e.type === 'ring' && e.beat);
        const lt = await page.evaluate(() => ({ lit: SE.debug.world.card.lit, i: SE.debug.world._beat.i }));
        check(r.length === 1 && r[0].brush && !r[0].judged && !el.some(e => e.type === 'count' || e.type === 'right' || e.type === 'wrong') && lt.lit === 0 && lt.i === 0, 'a beat inside beatListen counted / did not boom: ' + types(el) + ' ' + JSON.stringify(lt));
        await page.waitForFunction(() => { const w = SE.debug.world; return w.time - w._beat.askT >= SE.CONFIG.beatListen + 0.02 && w.time - w._beat.lastT >= SE.CONFIG.beatGap; }, null, { timeout: 5000, polling: 'raf' });
        listenChecked = true;
      } else await waitAsk(page);
    }
    const s = await page.evaluate(() => { const w = SE.debug.world; return { need: w.stepInfo.need, mode: w.stepInfo.mode, step: w.step, lit: w.card ? w.card.lit : null, cn: w.card ? w.card.n : null }; });
    check(s.mode === 'beat' && s.lit === 0 && s.cn === s.need, `step ${si} at its ask: ` + JSON.stringify(s));
    {   // Rio's beat demo for this step: demoStart {mode beat, need} → demoCount 1..need → demoEnd → ask {afterDemo}
      const dv = await evSince(page, nStep);
      const ds = dv.filter(e => e.type === 'demoStart'), dc = dv.filter(e => e.type === 'demoCount'), de = dv.findIndex(e => e.type === 'demoEnd');
      const ak = dv.findIndex(e => e.type === 'ask' && e.step === s.step);
      check(ds.length === 1 && ds[0].mode === 'beat' && ds[0].need === s.need && ds[0].step === s.step, `step ${si}: beat demoStart: ` + JSON.stringify(ds));
      check(dc.length === s.need && dc.every((e, j) => e.i === j + 1 && e.n === s.need), `step ${si}: demoCounts ${dc.map(e => e.i).join(',')} (need ${s.need})`);
      check(de >= 0 && ak > de && dv[ak].afterDemo, `step ${si}: demoEnd → ask {afterDemo} order: ` + types(dv));
      const djudged = dv.slice(0, de).filter(e => ['right', 'wrong', 'count', 'soft', 'hint'].includes(e.type));
      check(djudged.length === 0, `step ${si}: judged events during the beat demo: ` + types(djudged));
    }
    const e1 = await evLen(page);
    for (let k = 1; k <= s.need; k++) {
      const at = await page.evaluate(() => SE.debug.eggScreen(SE.debug.answer().egg));
      check(at, `no big egg to beat (step ${si}, beat ${k})`);
      const jx = ((k * 37) % 21 - 10) / 100 * at.r, jy = ((k * 53) % 21 - 10) / 100 * at.r;   // real fingers wander a little
      if (k === 1 && s.need >= 2 && !doubled) {   // a too-fast double tap (2nd touch < 0.2 s later): it booms, it does not count
        doubled = true;
        // both touches go out back to back (CDP keeps the order); a slow headless frame can still put them ≥ 0.2 s apart
        // in world time — then the 2nd one rightly counts, and the double is retried on a later step
        const P = tp(at.x + jx, at.y + jy), Q = tp(at.x, at.y);
        await Promise.all([touchStart(cdp, [P]), touchEnd(cdp), touchStart(cdp, [Q]), touchEnd(cdp)]);
        await page.waitForTimeout(60);
        const ed = await evSince(page, e1);
        const rings = ed.filter(e => e.type === 'ring' && e.beat), counts = ed.filter(e => e.type === 'count' && e.beat);
        check(rings.length === 2, 'a double tap on the big egg gave ' + rings.length + ' beat rings: ' + types(ed));
        const dt = rings[1]._t - rings[0]._t;
        if (dt >= 0.2 - 1e-6) {
          check(counts.length === 2 && rings[1].judged, `two beats ${dt.toFixed(3)} s apart (≥ 0.2) did not both count: ` + types(ed));
          console.log(`      beat_count ${d.name}: double tap was ${dt.toFixed(3)} s apart in world time (slow frame) — retrying later`);
          doubled = false; k++;
        } else { check(rings[1].brush && !rings[1].judged && counts.length === 1, 'a beat < 0.2 s after the last one counted / did not boom: ' + types(ed) + ' dt ' + dt.toFixed(3)); fastChecked++; }
      } else await tap(cdp, page, { x: at.x + jx, y: at.y + jy }, 60);
      await page.waitForTimeout(330);
      const es = await evSince(page, e1);
      const counts = es.filter(e => e.type === 'count' && e.beat), rights = es.filter(e => e.type === 'right');
      const lit = await page.evaluate(() => SE.debug.world.card ? SE.debug.world.card.lit : null);
      check(counts.length === k && counts.every((e, j) => e.i === j + 1 && e.n === s.need), `step ${si}: after ${k} beats, counts ${counts.map(e => e.i).join(',')}: ` + types(es));
      check(lit === k, `card.lit ${lit} after ${k} beats (need ${s.need})`);
      if (k < s.need) check(rights.length === 0, `right after only ${k} of ${s.need} beats: ` + types(es));
      else {
        check(rights.length === 1 && rights[0].beat && rights[0].count && rights[0].count.n === s.need, `no single beat right at the ${s.need}th beat: ` + types(es));
        const ci = es.findIndex(e => e.type === 'count' && e.i === s.need), ri = es.findIndex(e => e.type === 'right');
        check(ci >= 0 && ri > ci, 'right must follow the last count: ' + types(es));
        check(es.some(e => e.type === 'stepDone'), 'no stepDone after the count: ' + types(es));
      }
    }
    nStep = await evLen(page);   // the next step's beat demo starts after this step's stepDone gap
    if (si === 0 && rr === 1) await shot(page, d, '5-beat');
    // extra beats after the count is complete only boom (the egg is done in the gap)
    const e2 = await evLen(page);
    const at2 = await page.evaluate(() => { const w = SE.debug.world, c = w.eggs.find(q => q.state === 'stand'); return c ? SE.debug.eggScreen(c.id) : null; });
    if (at2 && si < st0.steps.length - 1) {
      await tap(cdp, page, at2, 50); await page.waitForTimeout(150);
      const ex = await evSince(page, e2);
      check(!ex.some(e => e.type === 'count' || e.type === 'right' || e.type === 'wrong'), 'a beat in the gap after a complete count was judged: ' + types(ex));
    }
  }
  await page.waitForFunction(() => SE.debug.world.state === 'roundDone', null, { timeout: 8000 });
  evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'wrong'), 'a wrong event in beat mode: ' + types(evs));
  check(await page.evaluate(() => SE.debug.world.misses) === 0, 'misses in beat mode');
  const rd = evs.find(e => e.type === 'roundDone');
  check(rd && rd.stars === 3, 'beat round stars: ' + JSON.stringify(rd));
  await page.waitForTimeout(400);
  const log = await page.evaluate(n => SE.debug.voiceLog.slice(n).map(x => x.text), L0);
  const maxNeed = Math.max(...st0.steps), word = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six'][maxNeed];
  // the child's own counts: "One!" … for every beat but the last of a step (the last one is the right line)
  if (maxNeed >= 2) check(log.includes('One!'), 'no child count word "One!" in the voice log: ' + JSON.stringify(log));
  if (maxNeed >= 3) check(log.includes('Two!'), 'no count word "Two!" in the voice log: ' + JSON.stringify(log));
  // Rio's demo of this round (rr > 0: the whole demo is in this slice; rr 0: it ran before setupRound returned): "Count with me!" + One! … N!
  if (rr > 0) {
    const dlog = await page.evaluate(n => SE.debug.voiceLog.slice(n).map(x => x.text), Lpre);
    const ci = dlog.findIndex(t => LISTEN.en.test(t));
    check(ci >= 0, 'no "Count with me!" demo line: ' + JSON.stringify(dlog.slice(0, 10)));
    check(dlog.indexOf('One!', ci) > ci, 'Rio\'s demo count "One!" is not in the voice log after the demo line: ' + JSON.stringify(dlog.slice(0, 10)));
    check(dlog.some(t => TURN.en.test(t) && /time|once|twice/i.test(t)), 'no "Your turn — tap the big egg N times!" line: ' + JSON.stringify(dlog.slice(0, 14)));
  }
  check(log.some(t => t.startsWith(word + '!') && t.length > word.length + 2), `no beat right line starting "${word}!" in the voice log: ` + JSON.stringify(log));
  check(!log.some(t => RAW.test(t)), 'raw key in the beat lines: ' + JSON.stringify(log));
  console.log(`      beat_count ${d.name} round ${st0.round}: steps ${st0.steps.join('/')}, lines ${JSON.stringify(log.slice(0, 12))}`);
  // the song of a beat round: the big egg three times, then the cymbal
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'songDone'), n0, { timeout: 15000 }).catch(() => {});
  const se = (await evSince(page, n0)).filter(e => ['songNote', 'cymbal', 'songDone'].includes(e.type));
  check(se.filter(e => e.type === 'songNote').length === 3 && se.some(e => e.type === 'cymbal'), 'beat song: ' + types(se));
  }
  check(fastChecked >= 1, 'the too-fast double tap was never checked (every try landed ≥ 0.2 s apart)');
  check(listenChecked, 'the beatListen window was never checked');
};
T.rotate_beat = async ({ page, cdp, url, d }) => {
  // beat mode across a rotation: the partial count survives, the big egg + card stay on screen (card above ↔ beside)
  await setupRound(page, url, { topic: 'count', age: 4, seed: 9 });
  await page.waitForFunction(() => SE.debug.world.stepInfo && SE.debug.world.stepInfo.need >= 2 && SE.debug.world.interactive, null, { timeout: 100 }).catch(() => {});
  let need = await page.evaluate(() => SE.debug.world.stepInfo.need);
  if (need < 2) {   // step 0 of the warm-up is n = 1: beat it, wait for the n = 2 step
    const at = await page.evaluate(() => SE.debug.eggScreen(SE.debug.answer().egg));
    await tap(cdp, page, at); await waitAsk(page);
    need = await page.evaluate(() => SE.debug.world.stepInfo.need);
  }
  check(need >= 2, 'no beat step with n ≥ 2');
  const n0 = await evLen(page);
  let at = await page.evaluate(() => SE.debug.eggScreen(SE.debug.answer().egg));
  await tap(cdp, page, at); await page.waitForTimeout(300);
  const inView = () => page.evaluate(() => {
    const w = SE.debug.world, c = w.eggs.find(q => q.state === 'stand'), b = SE.debug.cardScreen(), bad = window.__qa.outside();
    if (b && (b.x < -1 || b.y < -1 || b.x + b.w > innerWidth + 1 || b.y + b.h > innerHeight + 1)) bad.push('card ' + JSON.stringify(b));
    if (b && c) { const p = SE.debug.eggScreen(c.id), r = 0.42 * c.size * SE.debug.view().s;   // the card never covers the egg body
      if (p.x + r > b.x + 4 && p.x - r < b.x + b.w - 4 && p.y + r > b.y + 4 && p.y - r < b.y + b.h - 4) bad.push('card overlaps the big egg'); }
    return { bad, lit: w.card && w.card.lit, mode: w.card && w.card.mode, lmode: w.layout.beat && w.layout.beat.mode };
  });
  const s0 = await inView();
  check(s0.bad.length === 0 && s0.lit === 1, 'before rotating: ' + JSON.stringify(s0));
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(600);
  const s1 = await inView();
  await shot(page, d, 'c-beat-rotated');
  check(s1.bad.length === 0, 'after rotating: ' + s1.bad.join('; '));
  check(s1.lit === 1, 'the partial count was lost on rotation: ' + JSON.stringify(s1));
  for (let k = 2; k <= need; k++) { at = await page.evaluate(() => SE.debug.eggScreen(SE.debug.answer().egg)); await tap(cdp, page, at); await page.waitForTimeout(320); }
  const evs = await evSince(page, n0);
  check(evs.filter(e => e.type === 'count' && e.beat).length === need && evs.some(e => e.type === 'right' && e.beat), `beats after rotation (need ${need}): ` + types(evs));
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(500);
  const s2 = await inView();
  check(s2.bad.length === 0, 'after rotating back: ' + s2.bad.join('; '));
  console.log(`      rotate_beat ${d.name}: card ${s0.mode} → ${s1.mode} → ${s2.mode}`);
};
T.beat_nudge = async ({ page, cdp, url, d }) => {
  // a partial count and no finger: Rio nudges after 4 s ("One! One more!"), not the generic idle line
  await setupRound(page, url, { topic: 'count', age: 4, seed: 9 });
  let need = await page.evaluate(() => SE.debug.world.stepInfo.need);
  if (need < 2) { const at = await page.evaluate(() => SE.debug.eggScreen(SE.debug.answer().egg)); await tap(cdp, page, at); await waitAsk(page); need = await page.evaluate(() => SE.debug.world.stepInfo.need); }
  check(need >= 2, 'no beat step with n ≥ 2');
  const at = await page.evaluate(() => SE.debug.eggScreen(SE.debug.answer().egg));
  await tap(cdp, page, at);
  const v0 = await page.evaluate(() => SE.debug.voiceLog.length), n0 = await evLen(page);
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'beatNudge'), n0, { timeout: 9000 });
  await page.waitForTimeout(200);
  const evs = await evSince(page, n0), nd = evs.find(e => e.type === 'beatNudge');
  const log = await page.evaluate(n => SE.debug.voiceLog.slice(n).map(x => x.text), v0);
  const dt = nd._t - (await page.evaluate(n => { const c = window.__ev.slice(0, n).reverse().find(e => e.type === 'count'); return c ? c._t : 0; }, n0));
  check(nd.i === 1 && nd.n === need, 'beatNudge payload: ' + JSON.stringify(nd));
  const bn = await page.evaluate(() => SE.CONFIG.beatNudge);
  check(dt > bn - 0.2 && dt < bn + 0.4, `beatNudge ${dt.toFixed(2)} s after the beat (want ${bn})`);
  check(!evs.some(e => e.type === 'idle'), 'a generic idle nudge during a partial count: ' + types(evs));
  check(log.length >= 1 && /one/i.test(log[log.length - 1]) && !RAW.test(log[log.length - 1]), 'beat nudge line: ' + JSON.stringify(log));
  check(await page.evaluate(() => SE.debug.world.card.lit) === 1, 'the nudge reset the card');
};
T.animal_prompt = async ({ page, cdp, url, d }) => {
  // "Who says quack? Tap the duckling!" — find a cow ask (seeded), check the bubble / voice log, then tap it: "Quack! The duckling!"
  let found = null, tried = [];
  for (let seed = 30; seed < 60 && !found; seed++) {
    await setupRound(page, url, { topic: 'animals', age: 4, seed });
    for (let k = 0; k < 5; k++) {
      const a = await page.evaluate(() => { const w = SE.debug.world, an = SE.debug.answer(); const c = an && an.egg != null ? w.eggById(an.egg) : null; return c ? { id: c.id, animal: c.thing.animal, bubble: document.getElementById('bubbleText').textContent, at: SE.debug.eggScreen(c.id) } : null; });
      if (!a) break;
      tried.push(a.animal);
      if (a.animal === 'duck') { found = a; break; }
      await tap(cdp, page, a.at); await page.waitForTimeout(300);
      if (await page.evaluate(() => SE.debug.world.state !== 'round')) break;
      try { await waitAsk(page, 8000); } catch (e) { break; }
    }
  }
  check(found, 'no duckling asked in 30 seeds: ' + tried.join(','));
  const L0 = await page.evaluate(() => SE.debug.voiceLog.length - 6);
  const log0 = await page.evaluate(n => SE.debug.voiceLog.slice(Math.max(0, n)).map(x => x.text), L0);
  check(/quack/i.test(found.bubble) && /duckling/i.test(found.bubble), 'the duckling prompt does not name quack + duckling: ' + found.bubble);
  // echo flow: the voice says "Your turn!" / the cue, the bubble keeps the full prompt
  check(log0.every(t => !RAW.test(t)), 'raw line near the duckling prompt: ' + JSON.stringify(log0));
  console.log(`      animal_prompt ${d.name}: "${found.bubble}" (Who says quack: ${/Who says quack\?/.test(found.bubble)})`);
  const v1 = await page.evaluate(() => SE.debug.voiceLog.length), n0 = await evLen(page);
  await tap(cdp, page, found.at);
  await page.waitForTimeout(500);
  const evs = await evSince(page, n0);
  const log = await page.evaluate(n => SE.debug.voiceLog.slice(n).map(x => x.text), v1);
  check(evs.some(e => e.type === 'right' && e.id === found.id), 'tap on the duckling: ' + types(evs));
  check(log.some(t => /quack/i.test(t) && /duckling/i.test(t)), 'no "Quack! The duckling!" right line: ' + JSON.stringify(log));
};
T.song_swipe = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 9 });
  check(await finishRoundByTaps(cdp, page), 'round not finished');
  await page.waitForFunction(() => { const a = SE.debug.answer(); return a && a.song; }, null, { timeout: 8000 });
  await page.waitForTimeout(500);
  const B = await page.evaluate(() => { const w = SE.debug.world, y = w._eggMidY(); const b = w.layout.band; return { a: SE.debug.toScreen(b.x + 6, y), b: SE.debug.toScreen(b.x + b.w - 6, y), n: w.eggs.filter(c => c.state === 'stand').length }; });
  const n0 = await evLen(page);
  await swipe(cdp, page, B.a, B.b, { n: 20, ms: 500 });
  await page.waitForTimeout(400 + 160 * B.n + 900);
  await shot(page, d, '6-song');
  const evs = await evSince(page, n0);
  const notes = evs.filter(e => e.type === 'songNote'), done = evs.find(e => e.type === 'songDone');
  check(notes.length === B.n, `songNotes ${notes.length} for ${B.n} eggs: ` + types(evs));
  check(notes.every((e, k) => e.i === k), 'cascade order: ' + notes.map(e => e.i).join(','));
  check(done && done.auto === false, 'songDone after a real swipe: ' + JSON.stringify(done));
  check(!evs.some(e => e.type === 'wrong'), 'wrong during song');
  await checkCymbal(page, evs);
};
async function checkCymbal(page, evs) {
  const cd = await page.evaluate(() => SE.CONFIG.cymbalDelay);
  const notes = evs.filter(e => e.type === 'songNote'), cy = evs.filter(e => e.type === 'cymbal'), done = evs.find(e => e.type === 'songDone');
  check(cy.length === 1, 'cymbal events in the song: ' + cy.length + ' — ' + types(evs));
  const last = notes[notes.length - 1];
  check(last && cy[0]._t > last._t && (!done || done._t > cy[0]._t), 'cymbal not between the last song note and songDone: ' + types(evs));
  check(Math.abs(cy[0]._t - last._t - cd) < 0.05, `cymbal ${(cy[0]._t - last._t).toFixed(3)} s after the last note (want CONFIG.cymbalDelay ${cd})`);
}
T.song_tap = async ({ page, cdp, url, d }) => {
  // a plain tap on any egg in song time starts the wave (the egg touched just booms; never judged)
  await setupRound(page, url, { seed: 21 });
  check(await finishRoundByTaps(cdp, page), 'round not finished');
  await page.waitForFunction(() => { const a = SE.debug.answer(); return a && a.song; }, null, { timeout: 8000 });
  await page.waitForTimeout(300);
  const t = await page.evaluate(() => { const c = window.__qa.hang()[0]; return { id: c.id, at: SE.debug.eggScreen(c.id), n: window.__qa.hang().length }; });
  const n0 = await evLen(page);
  await tap(cdp, page, t.at, 70);
  await page.waitForTimeout(400 + 180 * t.n + 1100);
  const evs = await evSince(page, n0);
  const notes = evs.filter(e => e.type === 'songNote'), done = evs.find(e => e.type === 'songDone');
  check(notes.length === t.n && notes.every((e, k) => e.i === k), `tap in song time: songNotes ${notes.map(e => e.i).join(',')} of ${t.n}: ` + types(evs));
  const xs = notes.map(e => e.x);
  check(xs.every((x, k) => k === 0 || x >= xs[k - 1] - 1), 'the wave is not left → right: ' + xs.map(Math.round).join(','));
  check(done && done.auto === false, 'songDone after a tap: ' + JSON.stringify(done));
  check(!evs.some(e => e.type === 'wrong' || e.type === 'right' || (e.type === 'ring' && e.judged)), 'a judged ring in song time: ' + types(evs));
  await checkCymbal(page, evs);
};
T.cymbal_tap = async ({ page, cdp, url, d }) => {
  // the cymbal beside Rio: a tap is a soft crash (cymbalTap), never soft / progress / a miss
  await setupRound(page, url, { seed: 22, age: 5 });
  const c = await page.evaluate(() => { const k = SE.debug.cymbalScreen(), p = window.__qa.toL(k.x, k.y), el = document.elementFromPoint(k.x, k.y); return { k, onEgg: !!SE.debug.world._eggAt(p.x, p.y), el: el && el.id, rio: (() => { const b = SE.debug.world.layout.rioBox; return p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h; })() }; });
  check(c.k && c.k.x > 0 && c.k.y > 0 && c.k.x < d.viewport.width && c.k.y < d.viewport.height, 'cymbal off screen: ' + JSON.stringify(c.k));
  check(!c.onEgg && c.el === 'game' && !c.rio, 'the cymbal centre is covered: ' + JSON.stringify(c));
  const n0 = await evLen(page), ans = await page.evaluate(() => SE.debug.answer().egg);
  for (let k = 0; k < 3; k++) { await tap(cdp, page, { x: c.k.x, y: c.k.y }, 60); await page.waitForTimeout(250); }
  const evs = await evSince(page, n0);
  const ring = await page.evaluate(() => ({ ring: SE.debug.world.cymbal.ring, tilt: SE.debug.world.cymbal.tilt }));
  check(evs.filter(e => e.type === 'cymbalTap').length === 3, 'cymbalTap events: ' + types(evs));
  check(!evs.some(e => ['soft', 'ring', 'wrong', 'hint', 'assistArmed'].includes(e.type)), 'a cymbal tap counted as soft / no-progress / a strike: ' + types(evs));
  check(ring.ring > 0, 'the cymbal does not ring after a tap: ' + JSON.stringify(ring));
  check(await page.evaluate(() => SE.debug.world.misses) === 0, 'cymbal taps counted as misses');
  const i = await info(page);
  check(i.a === ans, 'the asked egg changed after cymbal taps');
  const n1 = await evLen(page);
  await tap(cdp, page, i.at); await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right' && e.id === i.a), 'asked egg after cymbal taps');
};
T.song_band_press = async ({ page, cdp, url, d }) => {
  // a press on the empty egg band in song time plays the song (the left → right wave)
  await setupRound(page, url, { seed: 20 });
  check(await finishRoundByTaps(cdp, page), 'round not finished');
  await page.waitForFunction(() => { const a = SE.debug.answer(); return a && a.song; }, null, { timeout: 8000 });
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
  await checkCymbal(page, evs);
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
  await checkCymbal(page, evs);
  const dt = note._t - ask._t;   // world seconds (a slow headless frame rate stretches wall time: dt is capped per frame)
  const sw = await page.evaluate(() => SE.CONFIG.songWait);
  check(dt > sw - 0.2 && dt < sw + 0.3, `auto cascade ${dt.toFixed(2)} s (world) after songAsk (want CONFIG.songWait ${sw} s)`);
};
T.rio_poke = async ({ page, cdp, url }) => {
  // poke Rio in play: < pokeReplayCooldown (3 s) after a demo → pokeRio {replay:false}, no demo; later → pokeRio {replay:true}
  // + a replay demo from the current step ("Listen again!"), then "Your turn!" again; never a ring / soft / miss
  await setupRound(page, url, { seed: 11, age: 5 });
  const k = await page.evaluate(() => SE.debug.rioScreen());
  const onEgg = await page.evaluate(([x, y]) => { const p = window.__qa.toL(x, y); return !!SE.debug.world._eggAt(p.x, p.y); }, [k.x, k.y]);
  check(!onEgg, 'Rio\'s centre is under an egg');
  const since = await page.evaluate(() => SE.debug.world.time - SE.debug.world._lastDemoEnd);
  let n0 = await evLen(page);
  await tap(cdp, page, { x: k.x, y: k.y }, 90);
  await page.waitForTimeout(250);
  let evs = await evSince(page, n0);
  const p1 = evs.find(e => e.type === 'pokeRio');
  check(p1, 'no pokeRio on a Rio tap: ' + types(evs));
  if (since < 2.5) check(p1.replay === false && !evs.some(e => e.type === 'demoStart'), `a poke ${since.toFixed(2)} s after the demo replayed (cooldown 3 s): ` + types(evs));
  check(!evs.some(e => e.type === 'ring' || e.type === 'soft'), 'Rio tap rang / softed: ' + types(evs));
  // after the cooldown: a replay demo from the current step
  await page.waitForFunction(() => SE.debug.world.time - SE.debug.world._lastDemoEnd > SE.CONFIG.pokeReplayCooldown + 0.3, null, { timeout: 8000, polling: 'raf' });
  const step = await page.evaluate(() => SE.debug.world.step);
  const v0 = await page.evaluate(() => SE.debug.voiceLog.length);
  n0 = await evLen(page);
  await tap(cdp, page, { x: k.x, y: k.y }, 90);
  await page.waitForTimeout(300);
  evs = await evSince(page, n0);
  const p2 = evs.find(e => e.type === 'pokeRio'), ds = evs.find(e => e.type === 'demoStart');
  check(p2 && p2.replay === true, 'pokeRio after the cooldown is not a replay: ' + JSON.stringify(p2));
  check(ds && ds.replay === true && ds.from === step, 'no replay demoStart from the current step after the poke: ' + JSON.stringify(ds));
  const di = await page.evaluate(() => ({ demo: SE.debug.world.demoInfo(), phase: SE.debug.world.phase, ans: SE.debug.answer() }));
  check(di.phase === 'demo' && di.demo && di.demo.replay && di.ans === null, 'not in a replay demo after the poke: ' + JSON.stringify(di));
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'ask' && e.replay && e.afterDemo), n0, { timeout: 15000, polling: 'raf' });
  await page.waitForTimeout(200);
  evs = await evSince(page, n0);
  const log = await page.evaluate(n => SE.debug.voiceLog.slice(n).map(x => x.text), v0);
  check(log.some(t => LISTEN.en.test(t)), 'no "Listen again!" after a replay poke: ' + JSON.stringify(log));
  check(log.some(t => TURN.en.test(t)), 'no "Your turn!" after the replay: ' + JSON.stringify(log));
  check(evs.filter(e => e.type === 'demoNote').length === ds.n, `replay demoNotes ${evs.filter(e => e.type === 'demoNote').length} of ${ds.n}`);
  check(!evs.some(e => ['ring', 'soft', 'wrong', 'right'].includes(e.type)), 'the replay poke rang / judged: ' + types(evs));
  check(await page.evaluate(() => SE.debug.world.misses) === 0, 'Rio tap counted as a miss');
  // the asked egg still works after the replay
  await waitAsk(page);
  const i = await info(page), n1 = await evLen(page);
  await tap(cdp, page, i.at); await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right' && e.id === i.a), 'asked egg after a poke replay');
  // tapping the speech bubble repeats the last prompt line (and never reaches the canvas)
  await waitAsk(page).catch(() => {});
  await page.waitForTimeout(3200);
  const v1 = await page.evaluate(() => SE.debug.voiceLog.length), n2 = await evLen(page);
  if (await visible(page, 'bubble')) {
    await tapEl(page, '#bubble');
    await page.waitForTimeout(300);
    const log2 = await page.evaluate(n => SE.debug.voiceLog.slice(n).map(x => x.text), v1);
    check(log2.length >= 1 && !RAW.test(log2[0]), 'bubble tap did not repeat a prompt line: ' + JSON.stringify(log2));
    check(!(await evSince(page, n2)).some(e => e.type === 'soft' || e.type === 'ring'), 'bubble tap reached the canvas');
  }
};
T.talk_time_tap = async ({ page, url, d }) => {
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 12 });
  await page.evaluate(() => { SE.debug.setBot(true, 1); SE.debug.setSpeed(8); });
  await page.waitForFunction(() => SE.debug.world.state === 'talk', null, { timeout: 120000, polling: 'raf' });
  await page.evaluate(() => { SE.debug.setBot(false); SE.debug.setSpeed(1); });
  await page.waitForTimeout(700);
  const t = await page.evaluate(() => ({ answered: SE.debug.world.talkAnswered, answer: SE.debug.world.talk.answer, n: document.querySelectorAll('#talkChoices button').length, mode: SE.debug.mode, q: document.getElementById('talkQ').textContent }));
  check(!t.answered, 'bot answered Talk before the test could');
  check(t.mode === 'talk' && await visible(page, 'scrTalk'), 'Talk screen not shown: ' + t.mode);
  check(t.n >= 2 && t.n <= 3, 'Talk choices: ' + t.n);
  check(t.q && !RAW.test(t.q), 'Talk question text: ' + t.q);
  await shot(page, d, '7-talk');
  const s0 = await page.evaluate(() => ({ r: SE.debug.stats.talkRight, st: SE.debug.world.stars }));
  await tapEl(page, `#talkChoices button[data-id="${t.answer}"]`);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ right: SE.debug.stats.talkRight, st: SE.debug.world.stars, cls: document.querySelector('#talkChoices .right') ? 1 : 0 }));
  check(r.right === s0.r + 1 && r.cls && r.st === s0.st + 1, 'tap on the right Talk answer not counted: ' + JSON.stringify(r));
  await page.waitForFunction(() => SE.debug.world.state !== 'talk', null, { timeout: 20000 });
  await page.waitForFunction(() => SE.debug.mode === 'play' && SE.debug.world.state === 'round', null, { timeout: 20000 });
  check(!(await visible(page, 'scrTalk')), 'Talk screen still shown after the answer');
};
T.pause_resume = async ({ page, url }) => {
  await setupRound(page, url);
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => SE.debug.mode) === 'paused' && await visible(page, 'scrPause'), 'pause did not open');
  const t0 = await page.evaluate(() => SE.debug.world.time);
  await page.waitForTimeout(700);
  const t1 = await page.evaluate(() => SE.debug.world.time);
  check(t1 === t0, 'world kept running while paused');
  const L0 = await saidLen(page);
  const turnLine = await page.evaluate(() => { const t = window.__said.map(x => x.text).filter(x => /your turn|now you/i.test(x)); return t[t.length - 1] || null; });
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(700);
  const s = await page.evaluate(n => ({ mode: SE.debug.mode, t: SE.debug.world.time, said: window.__said.slice(n).map(x => x.text), bubble: document.getElementById('bubbleText').textContent }), L0);
  check(s.mode === 'play' && s.t > t1, 'resume did not continue: ' + JSON.stringify(s));
  check(!(await visible(page, 'scrPause')), 'pause screen still shown');
  // the echo flow: the prompt Rio said was the "Your turn!" line (the bubble keeps the full text) → repeated word for word
  check(turnLine, 'no "Your turn!" line was spoken after the demo');
  check(s.said.includes(turnLine) || s.said.includes(s.bubble), 'prompt not repeated after resume: ' + JSON.stringify({ turnLine, said: s.said }));
};
T.pause_mid_demo = async ({ page, url, d }) => {
  // pause during Rio's demo: the world (and the demo) freezes; resume → the demo goes on to demoEnd → "Your turn!"
  await setupDemo(page, url, { seed: 23, age: 4 });
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => SE.debug.mode) === 'paused', 'pause did not open during the demo');
  const a = await page.evaluate(() => ({ t: SE.debug.world.time, d: SE.debug.world.demoInfo(), dt: SE.debug.world.demo && SE.debug.world.demo.t }));
  check(a.d, 'the demo was gone when the pause opened: ' + JSON.stringify(a));
  await page.waitForTimeout(800);
  const b = await page.evaluate(() => ({ t: SE.debug.world.time, dt: SE.debug.world.demo && SE.debug.world.demo.t }));
  check(b.t === a.t && b.dt === a.dt, 'the demo ran on while paused: ' + JSON.stringify({ a, b }));
  const n0 = await evLen(page);
  await tapEl(page, '#btnResume');
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'ask' && e.afterDemo), n0, { timeout: 15000, polling: 'raf' });
  const evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'demoEnd'), 'no demoEnd after resuming: ' + types(evs));
  check(await page.evaluate(() => SE.debug.mode) === 'play', 'not playing after the resumed demo');
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
  let s = await page.evaluate(() => ({ mode: SE.debug.mode, g: !!SE.debug.world._g, down: SE.debug.world.finger.down }));
  check(s.mode === 'paused', 'hidden page did not pause: ' + s.mode);
  check(!s.g && !s.down, 'the gesture was not cancelled when hidden: ' + JSON.stringify(s));
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  const n0 = await evLen(page);
  await touchMove(cdp, [tp(i.at.x, i.at.y)]);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ mode: SE.debug.mode }));
  const evs = await evSince(page, n0);
  check(s.mode === 'paused' && !evs.some(e => e.type === 'ring'), 'after becoming visible: ' + JSON.stringify(s) + ' ' + types(evs));
  check(await visible(page, 'scrPause'), 'pause screen not shown after returning');
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => SE.debug.mode) === 'play', 'resume after visibility pause failed');
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
  check(await page.evaluate(() => !!SE.debug.world._g), 'gesture not active before rotating');
  const rot = { width: d.viewport.height, height: d.viewport.width };
  await page.setViewportSize(rot);
  await page.waitForTimeout(500);
  const g1 = await page.evaluate(() => ({ g: !!SE.debug.world._g, W: SE.debug.view().W, H: SE.debug.view().H }));
  // keep moving the same finger straight across every egg of the new layout: nothing may ring
  const pts = await page.evaluate(() => window.__qa.hang().map(c => SE.debug.eggScreen(c.id)));
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
  // and back: the eggs stay inside the original screen too
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(500);
  const out2 = await page.evaluate(() => window.__qa.outside());
  check(ev2.some(e => e.type === 'right' && e.id === j.a), 'tap after rotation: ' + types(ev2));
  check(out2.length === 0, 'outside the screen after rotating back: ' + out2.join('; '));
};
T.rotate_bouncing = async ({ page, cdp, url, d }) => {
  // a hard swipe sets every egg hopping, then rotate twice: the bodies + cushions must stay on screen every settled frame
  await setupRound(page, url, { seed: 15, age: 6 });
  const B = await page.evaluate(() => { const w = SE.debug.world, y = w._eggMidY(); const b = w.layout.band; return { a: SE.debug.toScreen(b.x - 30, y), b: SE.debug.toScreen(b.x + b.w + 30, y) }; });
  await swipe(cdp, page, { x: Math.max(3, B.a.x), y: B.a.y }, { x: Math.min(d.viewport.width - 3, B.b.x), y: B.b.y }, { n: 6, ms: 90 });
  await page.evaluate(() => { window.__out = []; const f = () => { const v = SE.debug.view(), fresh = (v.W > v.H) === (innerWidth > innerHeight) && Math.abs(v.cssW - Math.min(innerWidth, innerHeight * v.W / v.H)) < 2;
    if (fresh) window.__fresh = (window.__fresh || 0) + 1;
    const o = fresh ? window.__qa.outside() : []; if (o.length) window.__out.push(o.join('; ')); window.__raf = requestAnimationFrame(f); }; f(); });
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(900);
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(900);
  const o = await page.evaluate(() => { cancelAnimationFrame(window.__raf); return window.__out.slice(0, 3); });
  const fresh = await page.evaluate(() => window.__fresh || 0);
  check(fresh >= 10, 'too few settled frames checked: ' + fresh);
  check(o.length === 0, 'a hopping egg left the screen around a rotation: ' + o.join(' | '));
};
T.second_finger_ignored = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 16 });
  const i = await info(page);
  const p = await page.evaluate(() => window.__qa.softPoint(null));
  const n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y, 1)]);
  await page.waitForTimeout(80);
  await touchStart(cdp, [tp(p.x, p.y, 1), tp(i.at.x, i.at.y, 2)]);   // a second finger lands on the asked egg
  await page.waitForTimeout(80);
  await touchMove(cdp, [tp(p.x, p.y, 1)]);   // finger 2 lifts
  await page.waitForTimeout(60);
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'ring'), 'a second finger rang a egg: ' + types(evs));
};
T.surprise_lamb = async (ctx) => surpriseTest(ctx, 'lamb', 0);
T.surprise_bird = async (ctx) => surpriseTest(ctx, 'bird', 1);
T.surprise_fireflies = async (ctx) => surpriseTest(ctx, 'fireflies', 3);
async function surpriseTest({ page, cdp, url, d }, kind, level) {
  // chapter `level`, the surprise forced into round 1 of type `kind`
  const off = kind === 'lamb' ? (2 - level % 2) % 2 : (3 - level % 2) % 2;   // (level + off) % 2 → 0 lamb, 1 bird
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 17 + level, level, prep: `w._surpriseRound = 1; w._surpriseOff = ${off};` });
  await botToNextRound(page);
  const sp = await page.evaluate(() => SE.debug.world.surprise);
  check(sp === kind, 'surprise of round 1: ' + sp);
  const fn = { lamb: 'lambScreen', bird: 'birdScreen', fireflies: 'fireflyScreen' }[kind];
  // let it arrive (spawn 3–8 s after the first ask) — speed 3 while waiting, then 1
  await page.evaluate(() => SE.debug.setSpeed(3));
  await page.waitForFunction(f => !!SE.debug[f](), fn, { timeout: 20000, polling: 'raf' });
  await page.evaluate(() => SE.debug.setSpeed(1));
  await page.waitForTimeout(kind === 'fireflies' ? 400 : 200);
  // never blocks a egg: every egg centre still strikes the egg, and the surprise circle is clear of egg centres
  const chk = await page.evaluate(f => {
    const w = SE.debug.world, s = SE.debug[f](), v = SE.debug.view(), bad = [];
    for (const c of w.eggs.filter(c => c.state === 'stand')) {
      if (w._eggAt(c.cx, c.cy) !== c) bad.push('egg ' + c.id + ' not hit at its centre');
      const sc = SE.debug.toScreen(c.cx, c.cy);
      if (Math.hypot(sc.x - s.x, sc.y - s.y) < s.r) bad.push('egg ' + c.id + ' centre inside the ' + f + ' circle');
    }
    const el = document.elementFromPoint(s.x, s.y);
    if (!el || el.id !== 'game') bad.push('surprise under DOM ' + (el && (el.id || el.className)));
    if (s.x < 0 || s.y < 0 || s.x > innerWidth || s.y > innerHeight) bad.push('surprise off screen');
    void v;
    return { s, bad };
  }, fn);
  check(chk.bad.length === 0, kind + ': ' + chk.bad.join('; '));
  await shot(page, d, '9-' + kind);
  const tapEv = { lamb: 'lambTap', bird: 'birdTap', fireflies: 'fireflyTap' }[kind];
  const s2 = await page.evaluate(f => SE.debug[f](), fn);   // fresh position (it moves)
  check(s2, kind + ' no longer tappable');
  const n0 = await evLen(page);
  await tap(cdp, page, s2, 60);
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  check(evs.some(e => e.type === tapEv), `tap on the ${kind} gave no ${tapEv}: ` + types(evs));
  check(!evs.some(e => e.type === 'ring' || e.type === 'wrong'), `${kind} tap rang a egg: ` + types(evs));
  check(await page.evaluate(() => SE.debug.world.misses) === 0, kind + ' tap counted as a miss');
  // the asked egg still works while the surprise is around
  await waitAsk(page);
  const i = await info(page);
  const n1 = await evLen(page);
  await tap(cdp, page, i.at);
  await page.waitForTimeout(300);
  evs = await evSince(page, n1);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'asked egg during the ' + kind + ': ' + types(evs));
}
T.language_switch = async ({ page, url, d }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?mute=1&seed=5&age=4');
  await tapEl(page, '.title-top [data-lang="vi"]');
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), age: document.getElementById('titleAge').textContent, title: document.title, saved: SE.debug.getState().settings.lang }));
  check(s.html === 'vi' && /Rồng Rio/.test(s.logo) && /Trứng Biết Hát/.test(s.logo) && s.play === 'Chơi' && s.saved === 'vi', 'VI not applied on title: ' + JSON.stringify(s));
  check(/Trứng Biết Hát/.test(s.title), 'VI document title: ' + s.title);
  await shot(page, d, 'a-title-vi');
  await tapEl(page, '#btnPlay');
  await page.evaluate(() => window.__qa.hook());
  await page.evaluate(() => { const w = SE.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
  await waitAsk(page);
  await shot(page, d, 'b-vi-round');
  const vb = await page.evaluate(() => ({ bubble: document.getElementById('bubbleText').textContent, last: window.__asks.slice(-1)[0], said: window.__said.slice(-8) }));
  check(VI_CHARS.test(vb.bubble) && /trứng|bé/i.test(vb.bubble), 'bubble not Vietnamese: ' + vb.bubble);
  check(vb.last && vb.last.lang === 'vi', 'ask built in ' + (vb.last && vb.last.lang));
  // the echo flow: Rio sang the tune ("Bé nghe Rio hát nhé!"), then "Đến lượt bé rồi!" went to the voice
  check(vb.said.some(x => TURN.vi.test(x.text) && x.lang === 'vi'), 'the VI "your turn" line was not sent to the voice: ' + JSON.stringify(vb.said));
  check(vb.said.every(x => !RAW.test(x.text)), 'raw VI line: ' + JSON.stringify(vb.said));
  // back to English through pause → home
  await tapEl(page, '#btnPause');
  await page.waitForFunction(() => SE.debug.mode === 'paused');
  check(await page.evaluate(() => document.querySelector('#scrPause h2').textContent) !== 'Paused', 'pause title not translated');
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => SE.debug.mode === 'title');
  await tapEl(page, '.title-top [data-lang="en"]');
  await page.waitForTimeout(200);
  s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), saved: SE.debug.getState().settings.lang }));
  check(s.html === 'en' && /Rio/.test(s.logo) && /Singing Eggs/.test(s.logo) && s.play === 'Play' && s.saved === 'en', 'EN not restored: ' + JSON.stringify(s));
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
  check(keys.includes('se:settings') && keys.every(k => k.startsWith('se:')), 'storage keys not under se: — ' + keys.join(','));
  await gotoTitle(page, url + '?mute=1');
  let s = await page.evaluate(() => ({ st: SE.debug.getState().settings, age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, vol: document.getElementById('optVolume').value, music: document.getElementById('optMusic').checked, sfx: document.getElementById('optSfx').checked, name: document.getElementById('inpName').value }));
  check(s.st.age === 6 && s.st.lang === 'vi' && s.st.name === 'Mầm' && Math.abs(s.st.volume - 0.4) < 1e-6 && s.st.music === false && s.st.sfx === false, 'settings not kept across reload: ' + JSON.stringify(s.st));
  check(/6/.test(s.age) && s.html === 'vi' && s.vol === '40' && !s.music && !s.sfx && s.name === 'Mầm', 'reloaded UI does not show the saved settings: ' + JSON.stringify(s));
  // the name reaches the lines ({child})
  check(await page.evaluate(() => { for (let k = 0; k < 60; k++) if (/Mầm/.test(SE.I18N.t('vi', 'great', {}))) return true; return false; }), 'child name never used by t("great")');
  // URL flags are session-only: they apply but are never saved — even when a setting is changed while they are active
  await gotoTitle(page, url + '?mute=1&age=3&lang=en&speed=2&seed=4');
  s = await page.evaluate(() => ({ age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, wage: SE.debug.world.age }));
  check(/3/.test(s.age) && s.html === 'en', 'URL flags not applied: ' + JSON.stringify(s));
  await tap(cdp, page, { x: g.x + g.width / 2, y: g.y + g.height / 2 }, 2300);
  await page.waitForTimeout(300);
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '55'; v.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.fill('#inpName', 'Mam');
  await tapEl(page, '#btnSettingsDone');
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => SE.debug.world.state === 'intro' || SE.debug.world.state === 'round', null, { timeout: 15000 });
  const playAge = await page.evaluate(() => SE.debug.world.age);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('se:settings')));
  check(playAge === 3, '?age=3 not played: ' + playAge);
  check(stored.age === 6 && stored.lang === 'vi' && stored.speed === undefined && stored.mute === undefined, 'URL flags leaked into saved settings: ' + JSON.stringify(stored));
  check(Math.abs(stored.volume - 0.55) < 1e-6 && stored.name === 'Mam', 'settings changed under URL flags not saved: ' + JSON.stringify(stored));
  await gotoTitle(page, url + '?mute=1');
  s = await page.evaluate(() => ({ st: SE.debug.getState().settings, html: document.documentElement.lang, age: document.getElementById('titleAge').textContent, speed: SE.debug.getState().speed }));
  check(s.st.age === 6 && s.html === 'vi' && /6/.test(s.age) && s.speed === 1, 'flags stuck after reload without them: ' + JSON.stringify(s));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.audio_chain_volume = async ({ page, url }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');   // the unlock gesture
  await page.waitForTimeout(400);
  let a = await page.evaluate(() => { const A = SE.debug.audio(); return A.ctx ? { state: A.ctx.state, master: A.master.gain.value, user: A.user.gain.value, thr: A.comp && A.comp.threshold.value, ratio: A.comp && A.comp.ratio.value, sfx: A.sfx.gain.value, vol: A.volume, chain: !!(A.master && A.comp && A.user && A.sfx && A.music && A.amb) } : null; });
  check(a && a.chain, 'audio chain missing: ' + JSON.stringify(a));
  check(a.thr <= -12 && a.ratio >= 2, 'compressor not set: ' + JSON.stringify(a));
  check(Math.abs(a.user - 1.6) < 0.05 && Math.abs(a.master - 1) < 0.05, 'loud makeup gain not applied: ' + JSON.stringify(a));
  await page.waitForFunction(() => SE.debug.world.state === 'round', null, { timeout: 15000 });
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  for (let k = 0; k < 3; k++) { await tapEl(page, '#btnVolDown'); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: SE.debug.audio().user.gain.value, vol: SE.debug.getState().settings.volume, label: document.getElementById('volLevel').textContent, stored: JSON.parse(localStorage.getItem('se:settings') || '{}').volume }));
  check(Math.abs(a.vol - 0.7) < 1e-6 && Math.abs(a.stored - 0.7) < 1e-6 && a.label === '70%', 'pause − did not set / save 70 %: ' + JSON.stringify(a));
  check(Math.abs(a.user - 0.7 * 1.6) < 0.08, 'user gain does not follow the volume: ' + JSON.stringify(a));
  // the settings slider: 30 % → user gain 0.48, saved
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => SE.debug.mode === 'title');
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '30'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: SE.debug.audio().user.gain.value, stored: JSON.parse(localStorage.getItem('se:settings') || '{}').volume }));
  check(Math.abs(a.stored - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06, 'slider 30 %: ' + JSON.stringify(a));
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(500);
  a = await page.evaluate(() => ({ user: SE.debug.audio().user.gain.value, vol: SE.debug.getState().settings.volume, slider: document.getElementById('optVolume').value }));
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
  check(evs.some(e => e.type === 'right'), 'swipe from the asked egg: ' + types(evs));
  check(await page.evaluate(() => SE.debug.mode) === 'play', 'releasing a swipe over the pause button paused the game');
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
    await page.evaluate(() => { SE.debug.startGame(); });
    const played = await page.evaluate(() => SE.debug.world.age);
    const shown = (s.title.match(/[\d.]+\+?/) || [''])[0];
    if (played !== want || shown.replace('+', '') !== String(want)) bad.push(`?age=${q}: plays ${played}, title shows "${s.title.trim()}"`);
  }
  check(bad.length === 0, 'the title age differs from the age played: ' + bad.join('; '));
};

/* ---------------------------------------------------------------- the demo (Rio plays the tune first) */
const JUDGED = ['right', 'wrong', 'count', 'soft', 'hint', 'assist', 'assistArmed', 'stepDone'];
T.demo_harmless = async ({ page, cdp, url, d }) => {
  // during the demo: not interactive, answer() / hint() / prompt() null; real taps on every egg = brushes only, the sky and
  // Rio = nothing; a finger pressed in the demo and lifted after it stays brush-only; then the round plays normally
  await setupDemo(page, url, { seed: 24, age: 5 });
  const st = await page.evaluate(() => { const w = SE.debug.world; return { inter: w.interactive, ans: SE.debug.answer(), hint: w.hint(), prompt: w.prompt(), demo: w.demoInfo(), list: w.demo.list.map(x => x.id), song: w.cur.song.slice(), steps: w.cur.steps.map(s => s.targets.slice()), mouth: w.rioMouth() }; });
  check(!st.inter && st.ans === null && st.hint === null && st.prompt === null && st.demo && !st.demo.replay && st.demo.from === 0, 'hooks during the demo: ' + JSON.stringify(st));
  check(JSON.stringify(st.list) === JSON.stringify([].concat(...st.steps)), 'the demo order is not the tune (step) order: ' + JSON.stringify(st));
  await shot(page, d, 'd-demo');
  const n0 = await page.evaluate(() => window.__ev.map(e => e.type).lastIndexOf('demoStart'));   // the whole demo
  const pts = await page.evaluate(() => window.__qa.hang().map(c => ({ id: c.id, at: SE.debug.eggScreen(c.id) })));
  const sky = await page.evaluate(() => window.__qa.softPoint(false)), rio = await page.evaluate(() => SE.debug.rioScreen());
  let tapped = 0;
  for (const p of pts.map(q => q.at).concat([sky, { x: rio.x, y: rio.y }]).filter(Boolean)) {
    if (!(await page.evaluate(() => SE.debug.world.phase === 'demo'))) break;
    await tap(cdp, page, p, 60); await page.waitForTimeout(90); tapped++;
  }
  check(tapped >= 3, 'the demo ended before 3 taps (' + tapped + ')');
  // a finger pressed on the first tune egg during the demo, held past demoEnd, then lifted
  let held = false;
  const first = pts.find(q => q.id === st.list[0]);
  if (await page.evaluate(() => SE.debug.world.phase === 'demo')) {
    held = true;
    await touchStart(cdp, [tp(first.at.x, first.at.y)]);
    await page.waitForFunction(() => SE.debug.world.phase === 'play', null, { timeout: 15000, polling: 'raf' });
    await page.waitForTimeout(150);
    await touchEnd(cdp);
    await page.waitForTimeout(250);
  } else await page.waitForFunction(() => SE.debug.world.phase === 'play', null, { timeout: 15000, polling: 'raf' });
  const evs = await evSince(page, n0), de = evs.findIndex(e => e.type === 'demoEnd');
  check(de >= 0, 'no demoEnd: ' + types(evs));
  const inDemo = evs.slice(0, de);
  const bad = inDemo.filter(e => JUDGED.includes(e.type) || e.type === 'pokeRio' || (e.type === 'ring' && (e.judged || !e.brush)));
  check(bad.length === 0, 'taps during the demo were judged / softed / poked: ' + types(bad));
  check(inDemo.some(e => e.type === 'ring' && e.brush), 'a tap on an egg during the demo did not brush (sing softly): ' + types(inDemo));
  const after = evs.slice(de);
  if (held) check(!after.some(e => e.type === 'right' || e.type === 'wrong' || (e.type === 'ring' && e.judged)), 'a press from the demo, lifted after it, was judged: ' + types(after));
  const sparks = evs.filter(e => e.type === 'spark'), notes = evs.filter(e => e.type === 'demoNote');
  check(sparks.length === st.list.length && notes.length === st.list.length, `sparks ${sparks.length} / demoNotes ${notes.length} for ${st.list.length} notes`);
  check(sparks.every(e => Math.abs(e.x - st.mouth.x) < 1 && Math.abs(e.y - st.mouth.y) < 1), 'a spark did not leave Rio\'s mouth: ' + JSON.stringify(sparks.map(e => [e.x, e.y])) + ' mouth ' + JSON.stringify(st.mouth));
  check(notes.map(e => e.id).join() === st.list.join(), 'demoNote order: ' + notes.map(e => e.id).join());
  check(after.some(e => e.type === 'ask' && e.afterDemo && e.step === 0), 'no ask {afterDemo} after demoEnd: ' + types(after));
  check(await page.evaluate(() => SE.debug.world.misses) === 0, 'taps during the demo counted as misses');
  // and the child's turn works
  await waitAsk(page);
  const i = await info(page), n1 = await evLen(page);
  check(i.a === st.list[0], `asked ${i.a}, the demo played ${st.list[0]} first`);
  await tap(cdp, page, i.at); await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right' && e.id === i.a), 'the first tune egg after the demo was not right');
};
T.demo_copy_tune = async ({ page, cdp, url, d }) => {
  // after the demo: tap the eggs in the demo's order → right, right, …, roundDone 3★; every pod lights in the egg's colour
  await setupDemo(page, url, { seed: 25, age: 5 });
  const n0 = await evLen(page);
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'ask' && e.afterDemo), 0, { timeout: 15000, polling: 'raf' });
  const notes = (await evSince(page, 0)).filter(e => e.type === 'demoNote').map(e => e.id);
  check(notes.length >= 2, 'a 2+ note tune expected at age 5: ' + notes.join());
  for (let k = 0; k < notes.length; k++) {
    await waitAsk(page);
    const i = await info(page);
    check(i.a === notes[k], `step ${k}: asked ${i.a}, the demo played ${notes[k]}`);
    await tap(cdp, page, i.at); await page.waitForTimeout(350);
  }
  await page.waitForFunction(() => SE.debug.world.state === 'roundDone', null, { timeout: 8000 });
  const evs = await evSince(page, n0);
  const rights = evs.filter(e => e.type === 'right').map(e => e.id);
  check(rights.join() === notes.join(), 'right order ' + rights.join() + ' vs the tune ' + notes.join());
  check(!evs.some(e => e.type === 'wrong'), 'a wrong while copying the tune: ' + types(evs));
  const rd = evs.find(e => e.type === 'roundDone');
  check(rd && rd.stars === 3, 'stars for a clean copy: ' + JSON.stringify(rd));
  await page.waitForTimeout(800);
  const lit = await page.evaluate(() => SE.debug.world.lanterns.map(l => +l.lit.toFixed(2)));
  check(lit.length >= notes.length && lit.slice(0, notes.length).every(v => v >= 0.85), 'pods not lit after the tune: ' + JSON.stringify(lit));
};
T.wrong_replay = async ({ page, cdp, url, d }) => {
  // a wrong egg after the demo → wrong {replay:true} + kind words ("… Listen again!"), replayDelay later a replay demo from
  // the current step (remaining notes) with no 2nd "Listen again!"; then the right egg works. A 2nd miss → hint, no replay.
  await setupRound(page, url, { seed: 26, age: 5 });
  const i = await info(page);
  check(i.others.length, 'no other egg to tap');
  const nn = await page.evaluate(() => SE.debug.world.cur.steps.length);
  const v0 = await page.evaluate(() => SE.debug.voiceLog.length), n0 = await evLen(page);
  await tap(cdp, page, i.others[0].at);
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  const w = evs.find(e => e.type === 'wrong');
  check(w && w.id === i.others[0].id && w.replay === true, 'wrong {replay:true}: ' + JSON.stringify(w) + ' ' + types(evs));
  check(!evs.some(e => e.type === 'right' || e.type === 'hint'), 'right / hint after one wrong: ' + types(evs));
  await waitDemoStart(page, n0, 8000);
  evs = await evSince(page, n0);
  const ds = evs.find(e => e.type === 'demoStart'), rd = await page.evaluate(() => SE.CONFIG.replayDelay);
  check(ds.replay === true && ds.from === 0 && ds.n === nn, 'replay demoStart: ' + JSON.stringify(ds));
  check(Math.abs(ds._t - w._t - rd) < 0.15, `replay ${(ds._t - w._t).toFixed(2)} s after the wrong (want ${rd})`);
  await shot(page, d, 'e-replay');
  check(await page.evaluate(() => SE.debug.answer() === null && !SE.debug.world.interactive), 'interactive during the replay');
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'ask' && e.replay && e.afterDemo), n0, { timeout: 15000, polling: 'raf' });
  await page.waitForTimeout(150);
  evs = await evSince(page, n0);
  check(evs.filter(e => e.type === 'demoNote').length === nn, 'replay demoNotes: ' + types(evs));
  const log = await page.evaluate(n => SE.debug.voiceLog.slice(n).map(x => x.text), v0);
  const listens = log.filter(t => LISTEN.en.test(t));
  check(log.length && /listen again|let.s listen/i.test(log[0]) && !RAW.test(log[0]), 'the wrong line is not "That\'s … Listen again!": ' + JSON.stringify(log));
  check(listens.length === 1, `"Listen again" said ${listens.length} times around one replay (want 1: the wrong line): ` + JSON.stringify(log));
  check(log.some(t => TURN.en.test(t)), 'no "Your turn!" after the replay: ' + JSON.stringify(log));
  // the 2nd miss: the hint glow, no replay
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tap(cdp, page, j.others[0].at);
  await page.waitForTimeout(2600);
  evs = await evSince(page, n1);
  const w2 = evs.find(e => e.type === 'wrong');
  check(w2 && !w2.replay && evs.some(e => e.type === 'hint') && !evs.some(e => e.type === 'demoStart'), '2nd miss: hint, no replay: ' + types(evs) + ' ' + JSON.stringify(w2));
  const n2 = await evLen(page);
  await tap(cdp, page, j.at); await page.waitForTimeout(300);
  check((await evSince(page, n2)).some(e => e.type === 'right' && e.id === j.a), 'the right egg after a replay + hint');
};
T.rotate_mid_demo = async ({ page, cdp, url, d }) => {
  // rotate while a spark flies: eggs + cushions stay on screen, the demo finishes (every note lands), "Your turn!" follows
  await setupDemo(page, url, { seed: 27, age: 5 });
  await page.waitForFunction(() => SE.debug.world.sparks.length > 0, null, { timeout: 8000, polling: 'raf' });
  const n = await page.evaluate(() => SE.debug.world.demo.list.length);
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(400);
  await shot(page, d, 'f-demo-rotated');
  const s = await page.evaluate(() => ({ out: window.__qa.outside(), sp: SE.debug.world.sparks.map(q => [q.x, q.y]), ph: SE.debug.world.phase, W: SE.debug.view().W, H: SE.debug.view().H }));
  check(s.out.length === 0, 'outside the screen after rotating mid-demo: ' + s.out.join('; '));
  check(s.sp.every(([x, y]) => isFinite(x) && isFinite(y) && x >= -50 && y >= -50 && x <= s.W + 50 && y <= s.H + 50), 'a spark off the new layout: ' + JSON.stringify(s));
  await page.waitForFunction(() => window.__ev.some(e => e.type === 'ask' && e.afterDemo), null, { timeout: 15000, polling: 'raf' });
  const evs = await evSince(page, 0);
  check(evs.filter(e => e.type === 'demoNote').length === n, `demoNotes ${evs.filter(e => e.type === 'demoNote').length} of ${n} after a rotation`);
  const last = await page.evaluate(() => { const w = SE.debug.world; return window.__ev.filter(e => e.type === 'demoNote').map(e => { const c = w.eggById(e.id); return Math.hypot(e.x - c.cx, e.y - c.cy); }); });
  check(last.slice(-1)[0] < 60, 'the note after the rotation did not land on its egg (offset ' + last.slice(-1)[0] + ')');
  await waitAsk(page);
  const i = await info(page), n1 = await evLen(page);
  await tap(cdp, page, i.at); await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right' && e.id === i.a), 'tap after a mid-demo rotation');
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(500);
  const out2 = await page.evaluate(() => window.__qa.outside());
  check(out2.length === 0, 'outside the screen after rotating back: ' + out2.join('; '));
};
async function demoVoice(page, url, lang) {
  // the demo's lines in the voice log, in order: listen → one name per note (= sayDemo) → your turn; no raw keys
  await setupDemo(page, url, { seed: 28, age: 4, lang });
  await page.waitForFunction(() => window.__ev.some(e => e.type === 'ask' && e.afterDemo), null, { timeout: 15000, polling: 'raf' });
  await page.waitForTimeout(300);
  const r = await page.evaluate(L => {
    const log = SE.debug.voiceLog.map(x => ({ text: x.text, lang: x.lang }));
    const notes = window.__ev.filter(e => e.type === 'demoNote');
    const want = notes.map(e => SE.I18N.sayDemo(L, Object.assign({}, e._ctx || {}, e)));
    return { log, want };
  }, lang);
  const texts = r.log.map(x => x.text);
  const li = texts.findIndex(t => LISTEN[lang].test(t)), ti = texts.findIndex((t, k) => k > li && TURN[lang].test(t));
  check(li >= 0, `${lang}: no "listen" demo line: ` + JSON.stringify(texts));
  check(ti > li, `${lang}: no "your turn" line after the demo: ` + JSON.stringify(texts));
  check(r.want.length >= 1 && r.want.every(Boolean), `${lang}: sayDemo gave an empty name: ` + JSON.stringify(r.want));
  let k = li;
  for (const wname of r.want) { const j = texts.indexOf(wname, k + 1); check(j > li && j < ti, `${lang}: note name "${wname}" not between listen and your turn: ` + JSON.stringify(texts)); k = j; }
  const raw = texts.filter(t => !t || RAW.test(t));
  check(raw.length === 0, `${lang}: raw / undefined / {param} lines: ` + JSON.stringify(raw));
  if (lang === 'vi') check(VI_CHARS.test(texts[li]) && VI_CHARS.test(texts[ti]) && r.want.every(t => VI_CHARS.test(t)), 'VI demo lines without diacritics: ' + JSON.stringify(texts.slice(li, ti + 1)));
  check(r.log.slice(li).every(x => !x.lang || x.lang === lang), `${lang}: voice log lines in another language: ` + JSON.stringify(r.log.slice(li)));
  console.log(`      demo_voice ${lang}: ${JSON.stringify(texts.slice(li, ti + 1))}`);
}
T.demo_voice = async ({ page, url }) => { await demoVoice(page, url, 'en'); await demoVoice(page, url, 'vi'); };

const CORE = ['boot_title', 'demo_harmless', 'demo_copy_tune', 'wrong_replay', 'rotate_mid_demo', 'tap_right', 'tap_wrong', 'swipe_from_right', 'swipe_from_sky', 'rim_tap', 'tap_sky_soft', 'song_swipe', 'song_band_press', 'rotate_mid_round', 'rotate_bouncing', 'surprise_lamb', 'surprise_bird', 'surprise_fireflies'];
const EXTRA = ['two_misses_hint', 'assist_young', 'beat_count', 'beat_nudge', 'rotate_beat', 'animal_prompt', 'cymbal_tap', 'song_tap', 'song_auto', 'rio_poke', 'talk_time_tap', 'pause_resume', 'pause_mid_demo', 'visibility_pause', 'demo_voice',
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
      let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = SE.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, topic: s.topic, round: s.round, step: s.step, eggs: s.eggs, W: s.W, H: s.H }; })); } catch (x) { /* ignore */ }
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
    await page.waitForFunction(() => window.SE && SE.debug && SE.debug.world, null, { timeout: 20000, polling: 'raf' });
    await page.evaluate(() => window.__qa.hook());
    await page.waitForFunction(() => window.SE && SE.debug && SE.debug.mode === 'done', null, { timeout: 600000, polling: 500 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `bot-age${r.age}-${r.lang}-done.png`) });
    const res = await page.evaluate(L => {
      // the hook goes in while the page boots (autostart): start at the first complete round
      const ev = window.__ev.slice(Math.max(0, window.__ev.findIndex(e => e.type === 'round'))), bad = [], open = [];
      let inDemo = false, demos = 0, ends = 0, replays = 0, notes = 0, counts = 0;
      for (const e of ev) {
        if (e.type === 'demoStart') { if (inDemo) open.push('demoStart inside a demo'); inDemo = true; demos++; if (e.replay) replays++; }
        else if (e.type === 'demoEnd') { inDemo = false; ends++; }
        else if (inDemo && ['right', 'wrong', 'count', 'soft', 'hint', 'assist', 'stepDone', 'pokeRio'].includes(e.type)) bad.push(e.type + ':' + e.id);
        if (e.type === 'demoNote') notes++;
        if (e.type === 'demoCount') counts++;
      }
      const names = ev.filter(e => e.type === 'demoNote').map(e => SE.I18N.sayDemo(L, Object.assign({}, e._ctx || {}, e)));   // as main's ev2(e)
      return { stats: SE.debug.stats, levels: SE.debug.world.levels, age: SE.debug.world.age, asks: window.__asks, said: window.__said.map(x => ({ text: x.text, lang: x.lang })), log: SE.debug.voiceLog.slice(),
        doneVisible: !document.getElementById('scrDone').classList.contains('hidden'), doneTitle: document.getElementById('doneTitle').textContent,
        demo: { demos, ends, replays, notes, counts, bad: bad.slice(0, 6), nbad: bad.length, open, afterDemoAsks: ev.filter(e => e.type === 'ask' && e.afterDemo).length, rounds: ev.filter(e => e.type === 'round').length }, names };
    }, r.lang);
    const s = res.stats;
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    check(res.age === r.age, 'played age ' + res.age);
    check(res.doneVisible && res.doneTitle && !RAW.test(res.doneTitle), 'done screen: ' + JSON.stringify(res.doneTitle));
    check(s.rounds >= 12 && s.correct >= 24 && s.talks >= 4 && s.songs >= 12, 'session too short: ' + JSON.stringify(s));
    // the demo: one per round at least (+ one per later beat step + replays); balanced; nothing judged inside one
    const D = res.demo;
    check(D.demos >= D.rounds && D.rounds >= 12 && D.ends === D.demos && D.open.length === 0, 'demo starts / ends / rounds: ' + JSON.stringify(D));
    check(D.nbad === 0, `${D.nbad} judged / soft / poke events during demos: ` + JSON.stringify(D.bad));
    check(D.afterDemoAsks === D.demos, 'ask {afterDemo} after every demo: ' + JSON.stringify(D));
    check(D.notes + D.counts >= D.demos, 'demos without notes: ' + JSON.stringify(D));
    check(res.asks.length >= 24, 'too few prompts built: ' + res.asks.length);
    check(res.asks.every(a => a.lang === r.lang), 'prompts in the wrong language: ' + JSON.stringify(res.asks.filter(a => a.lang !== r.lang).slice(0, 2)));
    // the echo flow: the voice says the demo lines (listen / note names / your turn), the bubble keeps the full prompt
    const saidT = res.said.map(x => x.text), saidSet = new Set(saidT);
    const nListen = saidT.filter(t => LISTEN[r.lang].test(t)).length, nTurn = saidT.filter(t => TURN[r.lang].test(t)).length;
    check(nListen >= D.rounds && nTurn >= D.rounds, `demo lines spoken: listen ${nListen}, your turn ${nTurn} for ${D.rounds} rounds`);
    const missNames = res.names.filter(t => !t || !saidSet.has(t));
    check(missNames.length === 0, `${missNames.length}/${res.names.length} demo note names (sayDemo) never sent to the voice: ` + JSON.stringify(missNames.slice(0, 4)));
    const raw = res.said.filter(x => !x.text || RAW.test(x.text));
    check(raw.length === 0, 'spoken lines with a raw key / {param} / undefined: ' + JSON.stringify(raw.slice(0, 4)));
    check(res.log.length > 0 && res.log.every(x => x.lang === r.lang), 'voice log language: ' + JSON.stringify(res.log.filter(x => x.lang !== r.lang).slice(0, 2)));
    const logSet = new Set(res.log.map(x => x.text));
    const tail = saidT.slice(-10).filter(t => !logSet.has(t));
    check(tail.length === 0, 'SE.debug.voiceLog misses recent lines: ' + JSON.stringify(tail.slice(0, 2)));
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
    const after = await page.evaluate(() => ({ mode: SE.debug.mode, sessions: SE.debug.stats.sessions, st: SE.debug.world.state, title: !document.getElementById('scrTitle').classList.contains('hidden'), stars: document.getElementById('titleStars').textContent }));
    if (again) check(after.mode === 'play' && after.sessions === 2 && after.st !== 'sessionDone', 'Play again did not start a new session: ' + JSON.stringify(after));
    else check(after.mode === 'title' && after.title && +after.stars > 0, 'Home from the done screen: ' + JSON.stringify(after));
    check(errors.length === 0, 'errors: ' + errors.slice(0, 3).join(' | '));
    record(d.name, name, true, '');
    console.log(`      ${name}: ${secs}s, topics ${res.levels.join('/')}, rounds ${s.rounds}, right ${s.correct}, wrong ${s.wrong}, brushes ${s.brushes}, hints ${s.hints}, assists ${s.assists}, songs ${s.songs} (auto ${s.songAuto}), talks ${s.talks}, surprises ${s.lambTaps}/${s.birdTaps}/${s.fireflyTaps}, prompts ${res.asks.length}, voice lines ${res.said.length}, demos ${D.demos} (replays ${D.replays}, notes ${D.notes}, counts ${D.counts})`);
  } catch (e) {
    let st = ''; try { st = JSON.stringify(await page.evaluate(() => SE.debug.getState())); } catch (x) { /* ignore */ }
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
