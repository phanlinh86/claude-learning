// Functional QA (Tibo's Dino Lake Fishing) — Playwright, isMobile + hasTouch contexts on iPhone / iPad, portrait + landscape.
// Every tap is a REAL CDP touch sequence (Input.dispatchTouchEvent → pointer events → TL.Input → World) on the MOVING fish at
// its current screen position: the bot bypasses the input layer, so this suite is the proof that fingers work.
//   node tests/e2e/functional.js                          (all: 4 devices + 10 bot sessions, ages 3–7 × EN / VI)
//   ONLY=iphone-portrait node tests/e2e/functional.js     (one device, no bot sessions)
//   TESTS=tap_right,critter_frog node tests/e2e/functional.js   (a subset of the per-device tests, all devices)
//   SKIP_BOT=1 node tests/e2e/functional.js               (skip the full bot sessions)
//   BOT_SPEED=8 BOT_PAR=4                                 (bot session speed / parallel pages)
// Writes screenshots + results.json to tests/out/functional/. Exits 1 on any failure.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'functional'); fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, extra: true },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2, extra: true }
];
const BOT_RUNS = [];
[3, 4, 5, 6, 7].forEach((age, i) => ['en', 'vi'].forEach((lang, j) => BOT_RUNS.push({ age, lang, dev: (i + j) % 4 })));
const BOT_SPEED = +process.env.BOT_SPEED || 8, BOT_PAR = +process.env.BOT_PAR || 4;
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
// a raw i18n key, an unfilled {param}, or a JS hole in a spoken line
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object|\b(ui|p|talk|topic|weather|right|wrong|surprise|critter|tibo|count|idle|session|lily|pond|enter|cast|bite|release|releaseFriend|joy|praise|great|party|hint)\.[a-z0-9]/i;

const results = [];
function record(device, test, ok, detail) {
  results.push({ device, test, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(16)} ${test}${ok ? '' : '  — ' + detail}`);
}
class Fail extends Error {}
const check = (cond, msg) => { if (!cond) throw new Fail(msg); };

// test-only instrumentation: every prompt the game builds, full copies of world events, page-side helpers
const INIT = () => {
  window.__asks = []; window.__ev = [];
  const TL = window.TL = window.TL || {};
  let i18n;
  Object.defineProperty(TL, 'I18N', { configurable: true, get: () => i18n, set: v => {
    i18n = v;
    if (v && v.ask && !v.ask.__wrapped) { const o = v.ask; v.ask = function (lang, key) { const r = o.apply(this, arguments); window.__asks.push({ lang, key, text: r }); return r; }; v.ask.__wrapped = true; }
  } });
  window.__qa = {
    hook() {
      const w = TL.debug.world;
      if (!w || w.__qa) return;
      const o = w._emit; w.__qa = true;
      w._emit = function (e) {
        const c = {};
        for (const k in e) { const v = e[k]; try { c[k] = (v && typeof v === 'object') ? JSON.parse(JSON.stringify(v)) : v; } catch (x) { c[k] = String(v); } }
        c._t = w.time; window.__ev.push(c); return o.call(this, e);
      };
      window.__darted = {};
      const u = w.update; w.update = function () { const r = u.apply(this, arguments); for (const m of this.members) if (m.state === 'dart') window.__darted[m.id] = (window.__darted[m.id] || 0) + 1; return r; };
    },
    toL(x, y) { const v = TL.debug.view(); return { x: (x - v.left) / v.s, y: (y - v.top) / v.s }; },
    onCanvas(x, y) { if (x < 1 || y < 1 || x > innerWidth - 1 || y > innerHeight - 1) return false; const el = document.elementFromPoint(x, y); return !!el && el.id === 'game'; },
    /** screen point of a member now, if it is touchable, on the bare canvas, and the nearest thing there */
    memberPoint(id) {
      const w = TL.debug.world, s = TL.debug.memberScreen(id);
      if (!s || !this.onCanvas(s.x, s.y)) return null;
      const p = this.toL(s.x, s.y), c = w.critterHit();
      if (c && Math.hypot(p.x - c.x, p.y - c.y) < c.r * 2.2) return null;
      for (const m of w.members) {
        if (m.id === id || m.state === 'gone') continue;
        const h = w.memberHit(m.id); if (h && Math.hypot(h.x - p.x, h.y - p.y) < h.r + 6) return null;   // overlapped: nearest centre would be ambiguous
      }
      return s;
    },
    /** a CSS-px point on the bare canvas, in the water, clear of every fish (+ margin), Tibo, the critter, the HUD / bubble */
    softPoint(margin = 70) {
      const w = TL.debug.world, L = w.layout, cands = [];
      for (let gx = 0.05; gx < 0.96; gx += 0.03) for (let gy = 0.05; gy < 0.96; gy += 0.03) {
        const cx = innerWidth * gx, cy = innerHeight * gy, p = this.toL(cx, cy);
        if (p.y < L.surfaceY + 30 || p.y > L.groundY - 20 || p.x < 20 || p.x > L.W - 20) continue;
        if (!this.onCanvas(cx, cy)) continue;
        const b = L.tiboBox; if (p.x > b.x - 30 && p.x < b.x + b.w + 30 && p.y > b.y - 30 && p.y < b.y + b.h + 30) continue;
        if (w.members.some(m => m.state !== 'gone' && Math.hypot(p.x - m.x, p.y - m.y) < w._hitR(m) + margin)) continue;
        if (!w._clearOfKeep(p.x, p.y, 48)) continue;
        if (w.critter) { const c = w.critter; if (Math.hypot(p.x - (c.hx || c.x), p.y - (c.hy || c.y)) < (c.r || 60) * 3) continue; }
        cands.push({ x: Math.round(cx), y: Math.round(cy), lx: p.x, ly: p.y, d: Math.min(...w.members.filter(m => m.state !== 'gone').map(m => Math.hypot(p.x - m.x, p.y - m.y))) });
      }
      cands.sort((a, b) => b.d - a.d);
      return cands.length ? cands[0] : null;
    },
    /** everything that should be visible is inside the logical screen (members, Tibo, the hook, lilies, bubble) */
    outside() {
      const w = TL.debug.world, L = w.layout, out = [];
      const inScr = (x, y, m = 0) => x >= -m && y >= -m && x <= L.W + m && y <= L.H + m;
      for (const m of w.members) {
        if (m.state === 'gone' || m.alpha <= 0.05 || m.state === 'enter' || m.state === 'leave') continue;
        const r = w._len(m) * 0.25;
        if (!inScr(m.x - r, m.y - r) || !inScr(m.x + r, m.y + r)) out.push(`${m.id} ${m.state} at ${Math.round(m.x)},${Math.round(m.y)} (W ${L.W} H ${L.H})`);
      }
      const b = L.tiboBox; if (!inScr(b.x, b.y, 2) || !inScr(b.x + b.w, b.y + b.h, 2)) out.push('tibo box ' + JSON.stringify(b));
      if (w.line && w.line.hook && w.line.state !== 'rest' && !inScr(w.line.hook.x, w.line.hook.y, 20)) out.push('hook ' + JSON.stringify(w.line.hook));
      for (const q of w.lilies || []) if (!inScr(q.x, q.y)) out.push('lily ' + Math.round(q.x) + ',' + Math.round(q.y));
      const B = L.bubble; if (B && (!inScr(B.x, B.y, 1) || !inScr(B.x + B.w, B.y + B.h, 1))) out.push('bubble box ' + JSON.stringify(B));
      return out;
    }
  };
};

/* ---------------------------------------------------------------- touch helpers (CDP) */
const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
async function touchStart(cdp, pts) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts }); }
async function touchMove(cdp, pts) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts }); }
async function touchEnd(cdp, pts = []) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts }); }
async function tap(cdp, page, p, hold = 70) { await touchStart(cdp, [tp(p.x, p.y)]); await page.waitForTimeout(hold); await touchEnd(cdp); }
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
/** a real touch on a MOVING fish where it is right now (retries while it is under the bubble / HUD / overlapped) */
async function tapMember(cdp, page, id, timeout = 8000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await page.evaluate(i => window.__qa.memberPoint(i), id);
    if (s) { await touchStart(cdp, [tp(s.x, s.y)]); await page.waitForTimeout(60); await touchEnd(cdp); return s; }
    await page.waitForTimeout(60);
  }
  throw new Fail('fish ' + id + ' never reachable on the bare canvas in ' + timeout + ' ms');
}
const evLen = page => page.evaluate(() => window.__ev.length);
const evSince = (page, n0) => page.evaluate(n => window.__ev.slice(n), n0);
const waitEv = (page, n0, type, timeout = 15000) => page.waitForFunction(([n, t]) => window.__ev.slice(n).some(e => e.type === t), [n0, type], { timeout, polling: 'raf' });
const types = evs => evs.map(e => e.type + (e.id != null ? ':' + e.id : '')).join(',');
const visible = (page, id) => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);
const vlog = (page, n0) => page.evaluate(n => TL.debug.voiceLog.slice(n).map(x => ({ lang: x.lang, text: x.text })), n0);
const vlogLen = page => page.evaluate(() => TL.debug.voiceLog.length);
const order = (evs, list) => { let k = 0; for (const e of evs) if (e.type === list[k]) k++; return k === list.length ? null : list[k]; };

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
  await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'title' && TL.debug.world, null, { timeout: 20000 });
  await page.evaluate(() => window.__qa.hook());
  await page.waitForTimeout(250);
}
/** a fresh chapter of `topic` (level `level`) at `age`; waits for the first open ask with every fish swimming (speed 1 then) */
async function setupRound(page, url, { topic = 'colors', age = 4, seed = 3, lang = '', level = 0, prep = null } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}${lang ? '&lang=' + lang : ''}`);
  await page.evaluate(([t, lv, prep]) => {
    TL.debug.startGame(); const w = TL.debug.world; w.levels[lv] = t; w.startLevel(lv);
    if (prep) (new Function('w', prep))(w);
    TL.debug.setSpeed(4);
  }, [topic, level, prep]);
  await waitAsk(page);
}
const READY = () => { const w = TL.debug.world, a = TL.debug.answer(); return TL.debug.mode === 'play' && w.interactive && a && a.member != null && w.members.every(m => m.state === 'swim'); };
async function waitAsk(page, timeout = 25000) {
  await page.evaluate(() => TL.debug.setSpeed(4));
  await page.waitForFunction(READY, null, { timeout, polling: 'raf' });
  await page.evaluate(() => TL.debug.setSpeed(1));
  await page.waitForTimeout(200);
}
/** finish the current round with the bot (fast), stop the bot at the next round's enter, wait for its ask */
async function botToNextRound(page, timeout = 60000) {
  const r0 = await page.evaluate(() => TL.debug.world.round);
  await page.evaluate(() => { TL.debug.setBot(true, 1); TL.debug.setSpeed(6); });
  await page.waitForFunction(r => { const w = TL.debug.world; return w.state === 'round' && w.round !== r && w.phase === 'enter'; }, r0, { timeout, polling: 'raf' });
  await page.evaluate(() => TL.debug.setBot(false));
  await waitAsk(page);
}
async function info(page) {
  return page.evaluate(() => {
    const w = TL.debug.world, a = TL.debug.answer(), t = w.memberById(a.member);
    const others = w.members.filter(m => m.id !== a.member && m.state === 'swim' && Math.hypot(m.x - t.x, m.y - t.y) > w._hitR(m) + 10)   /* nearest centre wins: a tap on its centre is unambiguous */.map(m => m.id);
    return { a: a.member, thing: t.thing, others, misses: w.misses, n: w.members.length, topic: w.topic, rule: w.cur.rule, round: w.round };
  });
}
/** info() once another fish swims clear of the target (round 0 has only 2 fish; they may overlap for a moment) */
async function infoOther(page, timeout = 8000) {
  const t0 = Date.now(); let i;
  do { i = await info(page); if (i.others.length) return i; await page.waitForTimeout(150); } while (Date.now() - t0 < timeout);
  return i;
}
async function shot(page, d, name) { try { await page.screenshot({ path: path.join(OUT, `${d.name}-${name}.png`) }); } catch (e) { /* ignore */ } }

/* ---------------------------------------------------------------- tests */
const T = {};
T.boot_title = async ({ page, url, d, errors }) => {
  const e0 = errors.length;
  await gotoTitle(page, url + '?mute=1&seed=3&lang=en');
  await page.waitForTimeout(800);
  await shot(page, d, '0-title');
  check(/Tibo/.test(await page.title()) && /Dino Lake Fishing/.test(await page.title()), 'document title: ' + await page.title());
  check(await visible(page, 'scrTitle'), 'title screen hidden');
  check(!(await visible(page, 'loading')), 'loading screen still shown');
  const logo = await page.evaluate(() => document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent);
  check(/Tibo/.test(logo) && /Dino Lake Fishing/.test(logo), 'logo: ' + logo);
  const pb = await page.locator('#btnPlay').boundingBox();
  check(pb && pb.width >= 44 && pb.height >= 44, 'play button too small / missing: ' + JSON.stringify(pb));
  check(pb.x >= 0 && pb.y >= 0 && pb.x + pb.width <= d.viewport.width && pb.y + pb.height <= d.viewport.height, 'play button off screen');
  const gb = await page.locator('#btnParents').boundingBox();
  check(gb && gb.width >= 40 && gb.x + gb.width <= d.viewport.width && gb.y >= 0, 'gear button: ' + JSON.stringify(gb));
  const missing = await page.evaluate(() => TL.Assets.missing.slice());
  check(missing.length === 0, 'assets failed to load: ' + missing.join(', '));
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => TL.debug.mode === 'play', null, { timeout: 5000 });
  await page.waitForFunction(() => TL.debug.world.state === 'round', null, { timeout: 15000 });
  check(await visible(page, 'hud'), 'HUD not shown in play');
  await page.waitForTimeout(1500);
  await shot(page, d, '0-play');
  check(errors.length === e0, 'boot errors: ' + errors.slice(e0).join(' | '));
};
T.tap_right = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 5 });
  const i = await info(page);
  const n0 = await evLen(page), L0 = await vlogLen(page), lit0 = await page.evaluate(() => TL.debug.getState().lilies);
  await tapMember(cdp, page, i.a);
  await waitEv(page, n0, 'right', 3000).catch(() => {});
  let evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right' && e.id === i.a), 'real tap on the moving target gave no right: ' + types(evs));
  check(!evs.some(e => e.type === 'wrong' || e.type === 'soft'), 'wrong / soft on the right tap: ' + types(evs));
  await page.waitForTimeout(900);
  await shot(page, d, '1-cast');
  await page.evaluate(() => TL.debug.setSpeed(2));
  await waitEv(page, n0, 'lily', 25000);
  await page.evaluate(() => TL.debug.setSpeed(1));
  await page.waitForTimeout(250);
  await shot(page, d, '1-lily');
  evs = await evSince(page, n0);
  const miss = order(evs, ['right', 'cast', 'plop', 'bite', 'reel', 'surface', 'show', 'roundDone', 'release', 'dive', 'lily']);
  check(!miss, `catch sequence broken at "${miss}": ` + types(evs));
  const lit = await page.evaluate(() => TL.debug.getState().lilies);
  check(lit === lit0 + 1, `lilies open ${lit0} → ${lit}`);
  const rd = evs.find(e => e.type === 'roundDone');
  check(rd && rd.stars === 3 && rd.misses === 0, 'round stars without a miss: ' + JSON.stringify(rd));
  const lines = await vlog(page, L0);
  const col = await page.evaluate(c => TL.I18N.name('en', 'color', c), i.thing.color);
  check(lines.some(t => t.text.toLowerCase().includes(String(col).toLowerCase())), `the right line naming "${col}" not in the voice log: ` + JSON.stringify(lines.map(x => x.text)));
};
T.tap_wrong = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 6, age: 5 });
  const i = await infoOther(page);
  check(i.others.length, 'no other fish to tap');
  const n0 = await evLen(page), stars0 = await page.evaluate(() => TL.debug.world.stars), L0 = await vlogLen(page);
  await page.evaluate(() => { window.__darted = {}; });
  await tapMember(cdp, page, i.others[0]);
  await waitEv(page, n0, 'wrong', 3000).catch(() => {});
  await page.waitForTimeout(80);
  const st = await page.evaluate(id => { const w = TL.debug.world; return { m: window.__darted[id] ? 'dart' : w.memberById(id).state, misses: w.misses, inter: w.interactive, phase: w.phase, ans: TL.debug.answer() }; }, i.others[0]);
  await shot(page, d, '2-wrong');
  const evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'wrong' && e.id === i.others[0]), 'no wrong event: ' + types(evs));
  check(!evs.some(e => e.type === 'right' || e.type === 'lily' || e.type === 'cast'), 'right / cast / lily on a wrong fish: ' + types(evs));
  check(st.m === 'dart', 'wrong fish did not dart: ' + st.m);
  check(st.misses === 1 && st.inter && st.phase === 'play' && st.ans && st.ans.member === i.a, 'after one wrong tap: ' + JSON.stringify(st));
  const lines = (await vlog(page, L0)).map(x => x.text);
  check(lines.length >= 1 && lines.every(t => !/\b(no|nope|wrong|oops|incorrect|sorry)\b/i.test(t)), 'kind words after a wrong tap: ' + JSON.stringify(lines));
  // no fail state: the target still works, 2 stars
  await page.waitForTimeout(400);
  await tapMember(cdp, page, i.a);
  await page.evaluate(() => TL.debug.setSpeed(2));
  await waitEv(page, n0, 'roundDone', 25000);
  await page.evaluate(() => TL.debug.setSpeed(1));
  const rd = (await evSince(page, n0)).find(e => e.type === 'roundDone');
  check(rd && rd.stars === 2 && rd.misses === 1, 'round stars after one miss: ' + JSON.stringify(rd));
  check(await page.evaluate(() => TL.debug.world.stars) === stars0 + 2, 'stars did not go up by 2');
};
T.tap_water_soft = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 7 });
  const bad = [];
  for (let k = 0; k < 2; k++) {
    const p = await page.evaluate(() => window.__qa.softPoint());
    check(p, 'no empty water point found');
    const n0 = await evLen(page);
    await tap(cdp, page, p, 60);
    await page.waitForTimeout(250);
    const evs = await evSince(page, n0);
    if (!(evs.length && evs[0].type === 'soft' && evs[0].kind === 'water' && evs.every(e => ['soft', 'hint', 'assistArmed', 'splash'].includes(e.type)))) bad.push(`tap ${k} at ${p.x},${p.y}: ` + types(evs));
  }
  const s = await page.evaluate(() => ({ m: TL.debug.world.misses, st: TL.debug.world.state, ph: TL.debug.world.phase, wrong: TL.debug.stats.wrong }));
  check(bad.length === 0, bad.join('; '));
  check(s.m === 0 && s.wrong === 0 && s.st === 'round' && s.ph === 'play', 'after soft taps: ' + JSON.stringify(s));
};
T.two_misses_hint = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 8, age: 5 });
  const i = await infoOther(page);
  check(i.others.length >= 1, 'no other fish');
  const n0 = await evLen(page);
  await tapMember(cdp, page, i.others[0]);
  await waitEv(page, n0, 'wrong', 3000);
  // past the 1 s same-fish window in WORLD time (headless frames run the world slower than the wall clock)
  await page.waitForFunction(n => { const e = window.__ev.slice(n).find(x => x.type === 'wrong'); return TL.debug.world.time - e._t > 1.15; }, n0, { timeout: 10000, polling: 'raf' });
  const j = await infoOther(page);
  check(j.others.length, 'no other fish clear of the target for the second miss');
  await tapMember(cdp, page, j.others[j.others.length > 1 ? 1 : 0]);
  await waitEv(page, n0, 'hint', 3000).catch(() => {});
  await page.waitForTimeout(150);
  await shot(page, d, '3-hint');
  const evs = await evSince(page, n0);
  const wr = evs.filter(e => e.type === 'wrong');
  check(wr.length === 2, 'two wrong events expected: ' + types(evs));
  check(evs.some(e => e.type === 'hint' && e.id === i.a), 'no hint on the target after 2 misses: ' + types(evs));
  // (wrong.hint is set on the event object after _emit, so the copy taken at emit time cannot show it; main reads the live object)
  check(evs.findIndex(e => e.type === 'hint') > evs.indexOf(wr[1]), 'hint came before the second miss: ' + types(evs));
  const h = await page.evaluate(() => ({ hand: !!TL.debug.world.hintHand, glow: TL.debug.world.target._glowT > 0 }));
  check(h.hand && h.glow, 'hint hand / glow missing: ' + JSON.stringify(h));
};
T.count_topic = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { topic: 'count', seed: 9, age: 4 });
  const i = await info(page);
  check(i.thing.mark && i.thing.mark.n >= 1, 'count target has no spots: ' + JSON.stringify(i.thing));
  const n = i.thing.mark.n, n0 = await evLen(page), L0 = await vlogLen(page);
  await tapMember(cdp, page, i.a);
  await page.evaluate(() => TL.debug.setSpeed(1.5));
  await waitEv(page, n0, 'roundDone', 25000);
  await page.evaluate(() => TL.debug.setSpeed(1));
  const evs = await evSince(page, n0);
  const r = evs.find(e => e.type === 'right');
  check(r && r.count && r.count.n === n, 'right event count: ' + JSON.stringify(r && r.count));
  const cs = evs.filter(e => e.type === 'count').map(e => e.i);
  check(cs.length === n && cs.every((v, k) => v === k + 1), `count events ${JSON.stringify(cs)} for ${n} spots`);
  check(evs.findIndex(e => e.type === 'show') < evs.findIndex(e => e.type === 'count'), 'count before show');
  const run = await page.evaluate(k => TL.I18N.sayCountRun('en', k), n);
  const lines = (await vlog(page, L0)).map(x => x.text);
  check(lines.includes(run), `count run "${run}" not in the voice log: ` + JSON.stringify(lines));
  const st = await page.evaluate(() => TL.debug.stats.counts);
  check(st >= n, 'stats.counts ' + st);
};
T.animals_topic = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { topic: 'animals', seed: 10, age: 5 });
  let i = await info(page);
  const kinds = await page.evaluate(() => TL.debug.world.members.map(m => m.thing.kind));
  check(kinds.every(k => k === 'bubble'), 'animals round members are not bubbles: ' + kinds);
  const bub = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  check(bub && !RAW.test(bub), 'bubble text: ' + bub);
  const nm = await page.evaluate(a => TL.I18N.name('en', 'animal', a), i.thing.animal || i.rule.value);
  check(bub.toLowerCase().includes(String(nm).toLowerCase()), `bubble "${bub}" does not name ${nm}`);
  await shot(page, d, '4-animals');
  let n0 = await evLen(page);
  await tapMember(cdp, page, i.a);
  await waitEv(page, n0, 'right', 3000);
  // round 1+ at age ≥ 4: "who lives in …?" (home rule) → a home badge event
  await botToNextRound(page);
  i = await info(page);
  check(i.rule.kind === 'home', 'round 1 at age 5 is not a home round: ' + JSON.stringify(i.rule));
  const hb = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  const at = await page.evaluate(h => TL.I18N.name('en', 'homeAt', h), i.rule.value);
  check(hb.toLowerCase().includes(String(at).toLowerCase()), `home bubble "${hb}" lacks "${at}"`);
  n0 = await evLen(page);
  await tapMember(cdp, page, i.a);
  await page.evaluate(() => TL.debug.setSpeed(2));
  await waitEv(page, n0, 'roundDone', 25000);
  await page.evaluate(() => TL.debug.setSpeed(1));
  const evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right' && e.id === i.a) && evs.some(e => e.type === 'home'), 'home round: ' + types(evs));
};
T.tibo_repeat = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 11 });
  await page.waitForTimeout(3300);   // > 3 s since the ask
  const b = await page.evaluate(() => {
    const h = TL.debug.tiboScreen();
    for (const [fx, fy] of [[0.5, 0.5], [0.5, 0.35], [0.4, 0.6], [0.6, 0.6], [0.5, 0.75]]) {
      const x = h.x + h.w * fx, y = h.y + h.h * fy;
      if (window.__qa.onCanvas(x, y)) return { x, y };
    }
    return null;
  });
  check(b, 'no bare-canvas point on Tibo');
  const n0 = await evLen(page), L0 = await vlogLen(page);
  const bub = await page.evaluate(() => document.getElementById('bubbleText').textContent);
  await tap(cdp, page, b, 60);
  await page.waitForTimeout(500);
  const evs = await evSince(page, n0), lines = (await vlog(page, L0)).map(x => x.text);
  check(evs.some(e => e.type === 'pokeTibo' && !e.busy), 'no pokeTibo: ' + types(evs));
  check(!evs.some(e => e.type === 'wrong' || e.type === 'soft'), 'Tibo tap counted as soft / wrong: ' + types(evs));
  check(lines.includes(bub), `question not repeated word for word ("${bub}"): ` + JSON.stringify(lines));
};
T.talk_time_tap = async ({ page, url, d }) => {
  await setupRound(page, url, { topic: 'colors', age: 4, seed: 12 });
  await page.evaluate(() => { TL.debug.setBot(true, 1); TL.debug.setSpeed(8); });
  await page.waitForFunction(() => TL.debug.world.state === 'talk', null, { timeout: 150000, polling: 'raf' });
  await page.evaluate(() => { TL.debug.setBot(false); TL.debug.setSpeed(1); });
  await page.waitForTimeout(1300);   // talkLock 1 s
  const t = await page.evaluate(() => ({ answered: TL.debug.world.talkAnswered, answer: TL.debug.world.talk.answer, n: document.querySelectorAll('#talkChoices button').length, mode: TL.debug.mode, q: document.getElementById('talkQ').textContent }));
  check(!t.answered, 'bot answered Talk before the test could');
  check(t.mode === 'talk' && await visible(page, 'scrTalk'), 'Talk screen not shown: ' + t.mode);
  check(t.n >= 2 && t.n <= 3, 'Talk choices: ' + t.n);
  check(t.q && !RAW.test(t.q), 'Talk question text: ' + t.q);
  await shot(page, d, '5-talk');
  const s0 = await page.evaluate(() => ({ r: TL.debug.stats.talkRight, st: TL.debug.world.stars }));
  await tapEl(page, `#talkChoices button[data-id="${t.answer}"]`);
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ right: TL.debug.stats.talkRight, st: TL.debug.world.stars, cls: document.querySelector('#talkChoices .right') ? 1 : 0 }));
  check(r.right === s0.r + 1 && r.cls && r.st === s0.st + 1, 'tap on the right Talk answer not counted: ' + JSON.stringify(r));
  await page.waitForFunction(() => TL.debug.world.state !== 'talk', null, { timeout: 20000 });
  await page.evaluate(() => TL.debug.setSpeed(3));
  await page.waitForFunction(() => TL.debug.mode === 'play' && TL.debug.world.state === 'round', null, { timeout: 25000 });
  await page.evaluate(() => TL.debug.setSpeed(1));
  check(!(await visible(page, 'scrTalk')), 'Talk screen still shown after the answer');
};
T.pause_resume = async ({ page, url }) => {
  await setupRound(page, url, { seed: 13 });
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  check(await page.evaluate(() => TL.debug.mode) === 'paused' && await visible(page, 'scrPause'), 'pause did not open');
  const t0 = await page.evaluate(() => TL.debug.world.time);
  await page.waitForTimeout(700);
  check(await page.evaluate(() => TL.debug.world.time) === t0, 'world kept running while paused');
  const L0 = await vlogLen(page);
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(800);
  const s = await page.evaluate(n => ({ mode: TL.debug.mode, t: TL.debug.world.time, said: TL.debug.voiceLog.slice(n).map(x => x.text), bubble: document.getElementById('bubbleText').textContent }), L0);
  check(s.mode === 'play' && s.t > t0, 'resume did not continue: ' + JSON.stringify(s));
  check(!(await visible(page, 'scrPause')), 'pause screen still shown');
  check(s.said.includes(s.bubble), 'prompt not repeated after resume: ' + JSON.stringify(s.said));
};
T.visibility_pause = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 14 });
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no soft point');
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(80);
  const setHidden = h => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true);
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ mode: TL.debug.mode, g: !!TL.debug.world._g, down: TL.debug.world.finger.down, t: TL.debug.world.time }));
  check(s.mode === 'paused', 'hidden page did not pause: ' + s.mode);
  check(!s.g && !s.down, 'the gesture was not cancelled when hidden: ' + JSON.stringify(s));
  await setHidden(false);
  const n0 = await evLen(page);
  const i = await info(page).catch(() => null);
  if (i) { const a = await page.evaluate(id => TL.debug.memberScreen(id), i.a); if (a) await touchMove(cdp, [tp(a.x, a.y)]); }
  await touchEnd(cdp);
  await page.waitForTimeout(300);
  s = await page.evaluate(() => ({ mode: TL.debug.mode }));
  const evs = await evSince(page, n0);
  check(s.mode === 'paused' && !evs.some(e => e.type === 'right' || e.type === 'wrong'), 'after becoming visible: ' + JSON.stringify(s) + ' ' + types(evs));
  check(await visible(page, 'scrPause'), 'pause screen not shown after returning');
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(400);
  check(await page.evaluate(() => TL.debug.mode) === 'play', 'resume after visibility pause failed');
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tapMember(cdp, page, j.a);
  await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right'), 'tap after visibility pause did not give right');
};
T.rotate_mid_round = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 15, age: 5 });
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no empty point');
  const n0 = await evLen(page);
  await touchStart(cdp, [tp(p.x, p.y)]);
  await page.waitForTimeout(400);   // past the slide window
  check(await page.evaluate(() => !!TL.debug.world._g), 'gesture not active before rotating');
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(600);
  const g1 = await page.evaluate(() => ({ g: !!TL.debug.world._g, W: TL.debug.world.layout.W, H: TL.debug.world.layout.H }));
  // the old finger slides over every fish: a cancelled gesture must never judge
  const pts = await page.evaluate(() => TL.debug.world.members.map(m => TL.debug.memberScreen(m.id)).filter(Boolean));
  for (const c of pts) { await touchMove(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(30); }
  await touchEnd(cdp);
  await page.waitForTimeout(500);
  await shot(page, d, '8-rotated');
  const evs = await evSince(page, n0);
  check(!g1.g, 'gesture not cancelled by the rotation');
  check(!evs.some(e => e.type === 'right' || e.type === 'wrong'), 'the cancelled gesture still judged: ' + types(evs));
  const out = await page.evaluate(() => window.__qa.outside());
  check(out.length === 0, 'outside the screen after rotation: ' + out.join('; '));
  await waitAsk(page);
  const j = await info(page);
  const n1 = await evLen(page);
  await tapMember(cdp, page, j.a);
  await page.waitForTimeout(400);
  check((await evSince(page, n1)).some(e => e.type === 'right' && e.id === j.a), 'tap after rotation');
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(600);
  const out2 = await page.evaluate(() => window.__qa.outside());
  check(out2.length === 0, 'outside the screen after rotating back: ' + out2.join('; '));
};
T.rotate_mid_reel = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 16 });
  const i = await info(page);
  const n0 = await evLen(page);
  await tapMember(cdp, page, i.a);
  await page.evaluate(() => TL.debug.setSpeed(0.6));
  await page.waitForFunction(() => TL.debug.world.phase === 'reel', null, { timeout: 15000, polling: 'raf' });
  // a second finger presses during the reel, then the device rotates
  const p = await page.evaluate(() => window.__qa.softPoint(30));
  if (p) await touchStart(cdp, [tp(p.x, p.y)]);
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(500);
  const s1 = await page.evaluate(() => ({ g: !!TL.debug.world._g, phase: TL.debug.world.phase, out: window.__qa.outside() }));
  await shot(page, d, '9-rotated-reel');
  if (p) await touchEnd(cdp);
  check(!s1.g, 'gesture survived the rotation');
  check(s1.out.length === 0, 'outside after rotating mid-reel: ' + s1.out.join('; '));
  // samples through the rest of the catch: nothing leaves the screen, the round finishes
  const outs = [];
  await page.evaluate(() => TL.debug.setSpeed(1.5));
  for (let k = 0; k < 12; k++) {
    await page.waitForTimeout(250);
    const o = await page.evaluate(() => ({ ph: TL.debug.world.phase, st: TL.debug.world.state, out: window.__qa.outside() }));
    if (o.out.length) outs.push(o.ph + ': ' + o.out.join(','));
  }
  await waitEv(page, n0, 'lily', 25000);
  check(outs.length === 0, 'left the screen during the catch after rotation: ' + outs.slice(0, 3).join('; '));
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(400);
  await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'ask' || e.type === 'talk' || e.type === 'pondFull'), n0, { timeout: 25000, polling: 'raf' });
  const st = await page.evaluate(() => TL.debug.getState());
  check(['round', 'roundDone', 'talk'].includes(st.state), 'state after rotate mid-reel: ' + JSON.stringify(st.state));
  await page.evaluate(() => TL.debug.setSpeed(1));
};
/** rotation in the 0.27 s cast wind-up (right → line release): the catch must still happen (QA P1: the round got stuck) */
T.rotate_mid_cast = async ({ page, cdp, url, d }) => {
  await setupRound(page, url, { seed: 19 });
  const i = await info(page);
  const n0 = await evLen(page);
  await page.evaluate(() => TL.debug.setSpeed(0.05));   // widen the wind-up window (0.27 s world ≈ 5 s wall)
  await tapMember(cdp, page, i.a);
  await waitEv(page, n0, 'right', 3000);
  const before = await page.evaluate(() => ({ phase: TL.debug.world.phase, line: TL.debug.world.line.state }));
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  await page.waitForTimeout(700);
  await page.evaluate(() => TL.debug.setSpeed(1.5));
  const ok = await page.waitForFunction(n => window.__ev.slice(n).some(e => e.type === 'lily'), n0, { timeout: 20000, polling: 'raf' }).then(() => true, () => false);
  const st = await page.evaluate(id => { const w = TL.debug.world, m = w.memberById(id); return { state: w.state, phase: w.phase, inter: w.interactive, fish: m && m.state, line: w.line.state, lineId: w.line.id, tappable: !!TL.debug.memberScreen(id) }; }, i.a);
  await page.evaluate(() => TL.debug.setSpeed(1));
  await page.setViewportSize(d.viewport);
  check(ok, 'rotating during the cast wind-up left the round stuck (before ' + JSON.stringify(before) + ', after ' + JSON.stringify(st) + ', events ' + types(await evSince(page, n0)) + ')');
};
/** Critters: one per chapter (level % 4 → ptero / bronto / frog / fireflies) in round 1 here */
function critterTest(kind, level) {
  return async ({ page, cdp, url, d }) => {
    await setupRound(page, url, { seed: 17 + level, level, prep: 'w._surpriseRound = 1;' });
    await botToNextRound(page);
    const ok = await page.waitForFunction(k => { const c = TL.debug.critterScreen(); return c && c.kind === k && window.__qa.onCanvas(c.x, c.y); }, kind, { timeout: 15000, polling: 'raf' }).then(() => true, () => false);
    const st0 = await page.evaluate(() => ({ cr: TL.debug.world.critter && TL.debug.world.critter.kind + ':' + TL.debug.world.critter.state, surprise: TL.debug.world.surprise, round: TL.debug.world.round, level: TL.debug.world.level }));
    check(ok, `${kind} never became tappable on the bare canvas: ` + JSON.stringify(st0));
    const m0 = await page.evaluate(() => ({ misses: TL.debug.world.misses, noProg: TL.debug.world._noProg }));
    const n0 = await evLen(page);
    const c = await page.evaluate(() => TL.debug.critterScreen());
    await tap(cdp, page, c, 60);
    await page.waitForTimeout(300);
    await shot(page, d, 'c-' + kind);
    const evs = await evSince(page, n0);
    const m1 = await page.evaluate(() => ({ misses: TL.debug.world.misses, noProg: TL.debug.world._noProg }));
    check(evs.some(e => e.type === 'critterTap' && e.kind === kind), `no critterTap for ${kind}: ` + types(evs));
    check(!evs.some(e => e.type === 'wrong' || e.type === 'soft' || e.type === 'right'), 'critter tap judged: ' + types(evs));
    check(m1.misses === m0.misses && m1.noProg === m0.noProg, 'critter tap counted as a miss / no progress: ' + JSON.stringify([m0, m1]));
  };
}
T.critter_ptero = critterTest('ptero', 0);
T.critter_bronto = critterTest('bronto', 1);
T.critter_frog = critterTest('frog', 2);
T.critter_fireflies = critterTest('fireflies', 3);

T.language_switch = async ({ page, url, d }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?mute=1&seed=5&age=4');
  await tapEl(page, '.title-top [data-lang="vi"]');
  await page.waitForTimeout(200);
  let s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), title: document.title, saved: TL.debug.getState().settings.lang, wantPlay: TL.I18N.t('vi', 'ui.play') }));
  check(s.html === 'vi' && /Rùa Tibo/.test(s.logo) && /Câu Cá Hồ Khủng Long/.test(s.logo) && s.play === s.wantPlay && s.saved === 'vi', 'VI not applied on title: ' + JSON.stringify(s));
  check(/Rùa Tibo Câu Cá Hồ Khủng Long/.test(s.title), 'VI document title: ' + s.title);
  await shot(page, d, 'a-title-vi');
  await tapEl(page, '#btnPlay');
  await page.evaluate(() => { const w = TL.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
  await waitAsk(page);
  await shot(page, d, 'b-vi-round');
  const vb = await page.evaluate(() => ({ bubble: document.getElementById('bubbleText').textContent, last: window.__asks.slice(-1)[0], log: TL.debug.voiceLog.slice(-4) }));
  check(VI_CHARS.test(vb.bubble) && /màu|bé|cá/i.test(vb.bubble), 'bubble not Vietnamese: ' + vb.bubble);
  check(vb.last && vb.last.lang === 'vi', 'ask built in ' + (vb.last && vb.last.lang));
  check(vb.log.some(x => x.text === vb.bubble && x.lang === 'vi'), 'the VI prompt was not sent to the voice: ' + JSON.stringify(vb.log));
  const ov = await page.evaluate(() => document.getElementById('bubbleText').getBoundingClientRect().height - document.getElementById('bubble').clientHeight);
  check(ov <= 4, 'VI bubble text overflows by ' + ov + ' px');
  await tapEl(page, '#btnPause');
  await page.waitForFunction(() => TL.debug.mode === 'paused');
  check(await page.evaluate(() => document.querySelector('#scrPause h2').textContent === TL.I18N.t('vi', 'ui.paused')), 'pause title not translated');
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => TL.debug.mode === 'title');
  await tapEl(page, '.title-top [data-lang="en"]');
  await page.waitForTimeout(200);
  s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, play: document.getElementById('btnPlay').getAttribute('aria-label'), saved: TL.debug.getState().settings.lang }));
  check(s.html === 'en' && /Tibo/.test(s.logo) && /Dino Lake Fishing/.test(s.logo) && s.play === 'Play' && s.saved === 'en', 'EN not restored: ' + JSON.stringify(s));
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
  await tap(cdp, page, c, 1200);
  await page.waitForTimeout(400);
  check(!(await visible(page, 'scrSettings')), 'a 1.2 s hold opened settings');
  await touchStart(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(300);
  await touchMove(cdp, [tp(c.x - 160, c.y + 200)]); await page.waitForTimeout(2000); await touchEnd(cdp);
  await page.waitForTimeout(300);
  const slid = await visible(page, 'scrSettings');
  if (slid) { await tapEl(page, '#btnSettingsDone'); await page.waitForTimeout(200); }
  check(!slid, 'a hold that slid off the gear opened settings');
  await tap(cdp, page, c, 2300);
  await page.waitForTimeout(300);
  check(await visible(page, 'scrSettings'), 'a 2.3 s hold did not open settings');
  await tapEl(page, '#btnSettingsDone');
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
  check(keys.includes('tl:settings') && keys.every(k => k.startsWith('tl:')), 'storage keys not under tl: — ' + keys.join(','));
  await gotoTitle(page, url + '?mute=1');
  let s = await page.evaluate(() => ({ st: TL.debug.getState().settings, age: document.getElementById('titleAge').textContent, html: document.documentElement.lang, vol: document.getElementById('optVolume').value, music: document.getElementById('optMusic').checked, sfx: document.getElementById('optSfx').checked, name: document.getElementById('inpName').value }));
  check(s.st.age === 6 && s.st.lang === 'vi' && s.st.name === 'Mầm' && Math.abs(s.st.volume - 0.4) < 1e-6 && s.st.music === false && s.st.sfx === false, 'settings not kept across reload: ' + JSON.stringify(s.st));
  check(/6/.test(s.age) && s.html === 'vi' && s.vol === '40' && !s.music && !s.sfx && s.name === 'Mầm', 'reloaded UI does not show the saved settings: ' + JSON.stringify(s));
  check(await page.evaluate(() => { for (let k = 0; k < 80; k++) if (/Mầm/.test(TL.I18N.t('vi', 'great', {}))) return true; return false; }), 'child name never used by t("great")');
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
  await page.waitForFunction(() => TL.debug.world.state === 'intro' || TL.debug.world.state === 'round', null, { timeout: 15000 });
  const playAge = await page.evaluate(() => TL.debug.world.age);
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('tl:settings')));
  check(playAge === 3, '?age=3 not played: ' + playAge);
  check(stored.age === 6 && stored.lang === 'vi' && stored.speed === undefined && stored.mute === undefined, 'URL flags leaked into saved settings: ' + JSON.stringify(stored));
  check(Math.abs(stored.volume - 0.55) < 1e-6 && stored.name === 'Mam', 'settings changed under URL flags not saved: ' + JSON.stringify(stored));
  await gotoTitle(page, url + '?mute=1');
  s = await page.evaluate(() => ({ st: TL.debug.getState().settings, html: document.documentElement.lang, age: document.getElementById('titleAge').textContent, speed: TL.debug.getState().speed }));
  check(s.st.age === 6 && s.html === 'vi' && /6/.test(s.age) && s.speed === 1, 'flags stuck after reload without them: ' + JSON.stringify(s));
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
T.url_age_shown = async ({ page, url }) => {
  const bad = [];
  for (const [q, want] of [['2', 3], ['4.5', 5], ['9', 7]]) {
    await gotoTitle(page, `${url}?mute=1&age=${q}`);
    const s = await page.evaluate(() => ({ title: document.getElementById('titleAge').textContent }));
    await page.evaluate(() => { TL.debug.startGame(); });
    const played = await page.evaluate(() => TL.debug.world.age);
    const shown = (s.title.match(/[\d.]+\+?/) || [''])[0];
    if (played !== want || shown.replace('+', '') !== String(want)) bad.push(`?age=${q}: plays ${played}, title shows "${s.title.trim()}"`);
  }
  check(bad.length === 0, 'the title age differs from the age played: ' + bad.join('; '));
};
T.audio_chain_volume = async ({ page, url }) => {
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');   // the unlock gesture
  await page.waitForTimeout(400);
  const g = await page.evaluate(() => { const A = TL.debug.audio(); return A.gains ? A.gains() : null; });
  check(g, 'TL.debug.audio().gains() missing');
  const want = { threshold: -18, knee: 12, ratio: 4, attack: 0.004, release: 0.18 };
  const off = Object.keys(want).filter(k => Math.abs(g[k] - want[k]) > (k === 'attack' || k === 'release' ? 0.0015 : 0.01));
  check(off.length === 0, 'compressor differs from the skill rule (−18 dB, knee 12, 4:1, 4 ms, 180 ms): ' + JSON.stringify(g));
  check(Math.abs(g.user - 1.6) < 0.05 && Math.abs(g.master - 1) < 0.05 && g.sfx > 0, 'loud makeup gain not applied: ' + JSON.stringify(g));
  check(g.state === 'running' || g.state === 'suspended', 'audio context state ' + g.state);
  await page.waitForFunction(() => TL.debug.world.state === 'round', null, { timeout: 15000 });
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(200);
  for (let k = 0; k < 3; k++) { await tapEl(page, '#btnVolDown'); await page.waitForTimeout(120); }
  await page.waitForTimeout(400);
  let a = await page.evaluate(() => ({ user: TL.debug.audio().gains().user, vol: TL.debug.getState().settings.volume, label: document.getElementById('volLevel').textContent, stored: JSON.parse(localStorage.getItem('tl:settings') || '{}').volume }));
  check(Math.abs(a.vol - 0.7) < 1e-6 && Math.abs(a.stored - 0.7) < 1e-6 && a.label === '70%', 'pause − did not set / save 70 %: ' + JSON.stringify(a));
  check(Math.abs(a.user - 0.7 * 1.6) < 0.08, 'user gain does not follow the volume: ' + JSON.stringify(a));
  await tapEl(page, '#btnHome');
  await page.waitForFunction(() => TL.debug.mode === 'title');
  await page.evaluate(() => { const v = document.getElementById('optVolume'); v.value = '30'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await page.waitForTimeout(400);
  a = await page.evaluate(() => ({ user: TL.debug.audio().gains().user, stored: JSON.parse(localStorage.getItem('tl:settings') || '{}').volume }));
  check(Math.abs(a.stored - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06, 'slider 30 %: ' + JSON.stringify(a));
  await gotoTitle(page, url + '?seed=3&novoice=1');
  await tapEl(page, '#btnPlay');
  await page.waitForTimeout(500);
  a = await page.evaluate(() => ({ user: TL.debug.audio().gains().user, vol: TL.debug.getState().settings.volume, slider: document.getElementById('optVolume').value, vv: TL.Voice._volume }));
  check(Math.abs(a.vol - 0.3) < 1e-6 && Math.abs(a.user - 0.48) < 0.06 && a.slider === '30', 'volume not restored after reload: ' + JSON.stringify(a));
  check(Math.abs(a.vv - 0.3) < 1e-6, 'speech volume does not follow the setting: ' + a.vv);
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
};
/** voice log at speed 1 (mute: log only) in EN and VI: ask, right, wrong, count run, release/lily/praise exist and match the language */
T.voice_log_langs = async ({ page, cdp, url }) => {
  for (const lang of ['en', 'vi']) {
    await setupRound(page, url, { topic: 'count', seed: 21, age: 5, lang });
    const L0 = await page.evaluate(() => TL.debug.voiceLog.length - 3);
    const i = await infoOther(page);
    if (i.others.length) { const n0 = await evLen(page); await tapMember(cdp, page, i.others[0]); await waitEv(page, n0, 'wrong', 3000).catch(() => {}); await page.waitForTimeout(1700); }
    await tapMember(cdp, page, i.a);
    await page.evaluate(() => TL.debug.setSpeed(1));
    await page.waitForFunction(() => TL.debug.world.state === 'round' && TL.debug.world.round === 1 && TL.debug.world.interactive, null, { timeout: 40000, polling: 'raf' });
    const lines = await vlog(page, Math.max(0, L0));
    const want = await page.evaluate(([lang, n]) => ({ run: TL.I18N.sayCountRun(lang, n) }), [lang, i.thing.mark.n]);
    const texts = lines.map(x => x.text);
    check(lines.every(x => x.lang === lang), `${lang}: voice log in another language: ` + JSON.stringify(lines.filter(x => x.lang !== lang).slice(0, 2)));
    check(texts.includes(want.run), `${lang}: count run missing: ` + JSON.stringify(texts));
    check(texts.length >= (i.others.length ? 4 : 3), `${lang}: too few lines (want ask, wrong, right, count, …): ` + JSON.stringify(texts));
    const raw = texts.filter(t => !t || RAW.test(t));
    check(raw.length === 0, `${lang}: raw keys in the voice: ` + JSON.stringify(raw));
    if (lang === 'vi') check(texts.filter(t => VI_CHARS.test(t)).length >= texts.length - 1, 'VI lines without Vietnamese: ' + JSON.stringify(texts));
    else check(!texts.some(t => VI_CHARS.test(t)), 'EN lines with Vietnamese: ' + JSON.stringify(texts));
  }
};
T.hud_tap_ignored = async ({ page, cdp, url }) => {
  await setupRound(page, url, { seed: 22 });
  const n1 = await evLen(page);
  const hb = await page.locator('#hudStars').boundingBox();
  await tap(cdp, page, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 });
  const bb = await page.locator('#bubble').boundingBox();
  if (bb) await tap(cdp, page, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
  await page.waitForTimeout(200);
  check(!(await evSince(page, n1)).some(e => ['soft', 'wrong', 'right', 'wiggle'].includes(e.type)), 'a HUD / bubble tap reached the canvas: ' + types(await evSince(page, n1)));
};

const CORE = ['boot_title', 'tap_right', 'tap_wrong', 'tap_water_soft', 'rotate_mid_round', 'rotate_mid_cast', 'rotate_mid_reel',
  'critter_ptero', 'critter_bronto', 'critter_frog', 'critter_fireflies'];
const EXTRA = ['two_misses_hint', 'count_topic', 'animals_topic', 'tibo_repeat', 'talk_time_tap', 'pause_resume', 'visibility_pause',
  'language_switch', 'parent_gate', 'settings_persist', 'url_age_shown', 'audio_chain_volume', 'voice_log_langs', 'hud_tap_ignored'];

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
      let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = TL.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, topic: s.topic, round: s.round, critter: s.critter, W: s.W, H: s.H }; })); } catch (x) { /* ignore */ }
      record(d.name, name, false, (e instanceof Fail ? '' : 'exception: ') + (e && e.message ? e.message.split('\n')[0] : e) + (st ? '  state ' + st : ''));
      try { await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); } catch (x) { /* ignore */ }
    }
    try { await page.setViewportSize(d.viewport); } catch (x) { /* ignore */ }
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
    await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'done', null, { timeout: 600000, polling: 500 });
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `bot-age${r.age}-${r.lang}-done.png`) });
    const res = await page.evaluate(() => ({ stats: TL.debug.stats, levels: TL.debug.world.levels, age: TL.debug.world.age, asks: window.__asks, log: TL.debug.voiceLog.map(x => ({ text: x.text, lang: x.lang })), doneVisible: !document.getElementById('scrDone').classList.contains('hidden'), doneTitle: document.getElementById('doneTitle').textContent }));
    const s = res.stats;
    const secs = ((Date.now() - t0) / 1000).toFixed(0);
    check(res.age === r.age, 'played age ' + res.age);
    check(res.doneVisible && res.doneTitle && !RAW.test(res.doneTitle), 'done screen: ' + JSON.stringify(res.doneTitle));
    check(s.rounds >= 8 && s.correct >= 8 && s.lilies >= 8 && s.casts >= 8 && s.talks >= 4 && s.ponds >= 4, 'session too short: ' + JSON.stringify(s));
    const saidSet = new Set(res.log.map(x => x.lang + '|' + x.text));
    const missing = res.asks.filter(a => !saidSet.has(a.lang + '|' + a.text));
    check(res.asks.length >= 8, 'too few prompts built: ' + res.asks.length);
    check(res.asks.every(a => a.lang === r.lang), 'prompts in the wrong language: ' + JSON.stringify(res.asks.filter(a => a.lang !== r.lang).slice(0, 2)));
    check(missing.length === 0, `${missing.length}/${res.asks.length} prompts never reached the voice: ` + JSON.stringify(missing.slice(0, 2)));
    const raw = res.log.filter(x => !x.text || RAW.test(x.text));
    check(raw.length === 0, 'spoken lines with a raw key / {param} / undefined: ' + JSON.stringify(raw.slice(0, 4)));
    check(res.log.length > 0 && res.log.every(x => x.lang === r.lang), 'voice log language: ' + JSON.stringify(res.log.filter(x => x.lang !== r.lang).slice(0, 2)));
    if (r.lang === 'vi') {
      const notVi = res.log.filter(x => !VI_CHARS.test(x.text));
      check(notVi.length / res.log.length < 0.1, 'VI voice has English-looking lines: ' + JSON.stringify(notVi.slice(0, 6).map(x => x.text)));
    } else {
      const bad = res.log.filter(x => VI_CHARS.test(x.text));
      check(bad.length === 0, 'EN voice has Vietnamese lines: ' + JSON.stringify(bad.slice(0, 3)));
    }
    const again = r.age % 2 === 1;
    await tapEl(page, again ? '#btnAgain' : '#btnDoneHome');
    await page.waitForTimeout(600);
    const after = await page.evaluate(() => ({ mode: TL.debug.mode, sessions: TL.debug.stats.sessions, st: TL.debug.world.state, title: !document.getElementById('scrTitle').classList.contains('hidden'), stars: document.getElementById('titleStars').textContent }));
    if (again) check(after.mode === 'play' && after.sessions === 2 && after.st !== 'sessionDone', 'Play again did not start a new session: ' + JSON.stringify(after));
    else check(after.mode === 'title' && after.title && +after.stars > 0, 'Home from the done screen: ' + JSON.stringify(after));
    check(errors.length === 0, 'errors: ' + errors.slice(0, 3).join(' | '));
    record(d.name, name, true, '');
    console.log(`      ${name}: ${secs}s, topics ${res.levels.join('/')}, rounds ${s.rounds}, right ${s.correct}, wrong ${s.wrong}, hints ${s.hints}, assists ${s.assists}, lilies ${s.lilies}, casts ${s.casts}, talks ${s.talks}, critters ${s.critters} (taps ${s.critterTaps}), prompts ${res.asks.length}, voice lines ${res.log.length}`);
  } catch (e) {
    let st = ''; try { st = JSON.stringify(await page.evaluate(() => TL.debug.getState())); } catch (x) { /* ignore */ }
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
