// QA functional probes (report-only) for Mimi's Splash Rocket — edge cases a real 4-year-old produces, beyond tests/e2e/functional.js.
// Every finger is a REAL CDP touch (Input.dispatchTouchEvent → pointer events → DK.Input → World) in isMobile/hasTouch contexts.
//   node tests/qa/qa_functional.js                 (all probes)
//   PROBES=unfold_taps,pump_spam node tests/qa/qa_functional.js
// Writes tests/out/qa/results.json; exits 1 when a probe fails.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'qa'); fs.mkdirSync(OUT, { recursive: true });

const DEV = {
  ip: { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  il: { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  pp: { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  pl: { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const results = [];
class Fail extends Error {}
const check = (c, m) => { if (!c) throw new Fail(m); };
const notes = [];
const note = (probe, s) => { notes.push({ probe, s }); console.log('   note ' + probe + ': ' + s); };

const INIT = () => {
  window.__ev = [];
  window.__qa = {
    hook() {
      const w = DK.debug.world; if (!w || w.__qa) return;
      const o = w._emit; w.__qa = true;
      w._emit = function (e) { e._t = w.time; window.__ev.push(e); return o.call(this, e); };
    },
    toL(x, y) { const v = DK.debug.view(); return { x: (x - v.left) / v.s, y: (y - v.top) / v.s }; },
    /** screen point of a mat's hit point, even while it is unfolding / in flight phases (matScreen is null then) */
    matPt(id) {
      const w = DK.debug.world, m = w.matById(id), L = w.layout; if (!m) return null;
      return DK.debug.toScreen(m.x, m.y - 0.3 * L.itemH * (m.ds || 1));
    },
    nan() {   // every numeric field of the moving world objects is finite
      const w = DK.debug.world, bad = [];
      const scan = (o, p, d) => {
        if (!o || d > 2) return;
        for (const k in o) {
          const v = o[k];
          if (typeof v === 'number' && !isFinite(v) && !(v === -1e9 || v === 1e9) && Math.abs(v) !== Infinity) bad.push(p + '.' + k + '=' + v);
          else if (typeof v === 'number' && isNaN(v)) bad.push(p + '.' + k + '=NaN');
          else if (v && typeof v === 'object' && !Array.isArray(v) && k !== 'thing' && k[0] !== '_') scan(v, p + '.' + k, d + 1);
        }
      };
      (w.mats || []).forEach((m, i) => scan(m, 'mats[' + i + ']', 0));
      scan(w.rocket, 'rocket', 0); scan(w.mimi, 'mimi', 0); scan(w.pump, 'pump', 0);
      if (w.flyer) scan(w.flyer, 'flyer', 0);
      (w.pennants || []).forEach((m, i) => scan(m, 'pennants[' + i + ']', 0));
      if (w.fountain) scan(w.fountain, 'fountain', 0);
      ['stars', 'misses', 'time', 'wind', 'gust', 'alpha'].forEach(k => { if (typeof w[k] === 'number' && isNaN(w[k])) bad.push(k + '=NaN'); });
      return bad;
    }
  };
};

/* ---------- touch helpers (CDP) */
const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
const tStart = (c, p) => c.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: p });
const tMove = (c, p) => c.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: p });
const tEnd = (c, p = []) => c.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: p });
async function tap(c, page, p, hold = 70) { await tStart(c, [tp(p.x, p.y)]); await page.waitForTimeout(hold); await tEnd(c); }
const evLen = page => page.evaluate(() => window.__ev.length);
const evSince = (page, n) => page.evaluate(n0 => window.__ev.slice(n0).map(e => { const c = {}; for (const k in e) { const v = e[k]; if (v === null || typeof v !== 'object') c[k] = v; } return c; }), n);
const types = evs => evs.map(e => e.type + (e.id ? ':' + e.id : '')).join(',');
const W = (page, fn, arg, timeout = 20000) => page.waitForFunction(fn, arg, { timeout, polling: 'raf' });
const visible = (page, id) => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);
async function elBox(page, sel) { return page.locator(sel).first().boundingBox(); }
async function tapEl(page, sel) { const b = await elBox(page, sel); check(b, 'no ' + sel); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); }

async function newPage(browser, d, errors) {
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  page.on('crash', () => errors.push('PAGE CRASH'));
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}
async function gotoTitle(page, url) {
  await page.goto(url);
  await W(page, () => window.DK && DK.debug && DK.debug.mode === 'title' && DK.debug.world, null, 20000);
  await page.evaluate(() => window.__qa.hook());
  await page.waitForTimeout(200);
}
const READY = () => { const w = DK.debug.world, a = DK.debug.answer(); return w.interactive && w.phase === 'play' && a && a.id != null && !!DK.debug.matScreen(a.id) && w.phaseTime > 0.6 && w.mats.filter(m => m.launch === w.launch).every(m => m.state === 'rest'); };
async function waitAsk(page, timeout = 30000) {
  await page.evaluate(() => DK.debug.setSpeed(4));
  await W(page, READY, null, timeout);
  await page.evaluate(() => DK.debug.setSpeed(1));
  await page.waitForTimeout(150);
}
async function startRound(page, url, { topic = 'colors', age = 4, seed = 3, extra = '', waitReady = true } = {}) {
  await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}${extra}`);
  await page.evaluate(t => { DK.debug.startGame(); const w = DK.debug.world; w.levels[0] = t; w.startLevel(0); }, topic);
  if (waitReady) await waitAsk(page);
}
async function info(page) {
  return page.evaluate(() => {
    const w = DK.debug.world, a = DK.debug.answer();
    const cur = w.mats.filter(m => m.launch === w.launch && m.state === 'rest');
    return { a: a && a.id, launch: w.launch, others: cur.filter(m => !m.target).map(m => m.id), misses: w.misses, k: w.cur && w.cur.k, phase: w.phase, stars: w.stars };
  });
}
async function pumpThree(c, page) {
  await W(page, () => DK.debug.world.phase === 'pump' && DK.debug.world.interactive, null, 10000);
  for (let k = 0; k < 3; k++) { const p = await page.evaluate(() => DK.debug.pumpScreen()); await tap(c, page, p, 50); await page.waitForTimeout(280); }
}
/** taps every visible mat position + pump + a grass point, returns nothing; used in non-play phases */
async function tapEverything(c, page) {
  const pts = await page.evaluate(() => {
    const w = DK.debug.world, out = [];
    w.mats.forEach(m => { if (m.state !== 'hidden' && m.state !== 'gone') { const p = window.__qa.matPt(m.id); if (p) out.push(p); } });
    const p = DK.debug.pumpScreen(); if (p) out.push(p);
    return out;
  });
  let n = 0;
  for (const p of pts) {
    // never tap once the next launch is open (overlapping launches): that tap would be a legit answer
    if (await page.evaluate(() => { const w = DK.debug.world; return w.interactive && w.phase === 'play'; })) break;
    await tap(c, page, p, 40); n++; await page.waitForTimeout(60);
  }
  return n;
}
const nonPlayJudged = evs => evs.filter(e => e.type === 'right' || e.type === 'wrong' || e.type === 'hint' || e.type === 'assistArmed' || e.type === 'pump');

/* ================================================================== probes */
const P = {};

P.unfold_taps = async ({ page, cdp, url }) => {
  // tap every mat while it is still unfolding (first launch of a round, then the 2nd launch's unfold)
  await startRound(page, url, { waitReady: false, seed: 21 });
  await W(page, () => { const w = DK.debug.world; return w.state === 'round' && w.phase === 'unfold' && w.mats.some(m => m.state === 'unfold'); });
  // slow motion while tapping: a tap sequence takes real time, the unfold must not end in the middle of it (probe race)
  await page.evaluate(() => DK.debug.setSpeed(0.15));
  const n0 = await evLen(page), m0 = await page.evaluate(() => DK.debug.world.misses);
  let taps = 0;
  for (let k = 0; k < 6; k++) {
    const ph = await page.evaluate(() => DK.debug.world.phase);
    if (ph !== 'unfold') break;
    taps += await tapEverything(cdp, page);
  }
  await page.evaluate(() => DK.debug.setSpeed(1));
  const evs = await evSince(page, n0);
  const bad = evs.filter(e => (e.type === 'right' || e.type === 'wrong'));
  const m1 = await page.evaluate(() => DK.debug.world.misses);
  check(taps > 0, 'no taps landed in the unfold phase');
  check(bad.length === 0 && m1 === m0, `taps during unfold were judged: ${types(bad)} misses ${m0}->${m1}`);
  // also: during the NEXT launch's unfold (after a right answer + 3 stomps, the next mats unfold during collect)
  await waitAsk(page);
  const i = await info(page);
  if (i.k > 1) {
    await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a));
    await pumpThree(cdp, page);
    await W(page, () => DK.debug.world.mats.some(m => m.state === 'unfold' && m.launch === 1), null, 15000);
    await page.evaluate(() => DK.debug.setSpeed(0.15));
    const n1 = await evLen(page), mm = await page.evaluate(() => DK.debug.world.misses);
    for (let k = 0; k < 4; k++) { if (!(await page.evaluate(() => DK.debug.world.mats.some(m => m.state === 'unfold')))) break; await tapEverything(cdp, page); }
    await page.evaluate(() => DK.debug.setSpeed(1));
    const e2 = (await evSince(page, n1)).filter(e => e.type === 'right' || e.type === 'wrong');
    check(e2.length === 0 && mm === await page.evaluate(() => DK.debug.world.misses), 'taps during the 2nd launch unfold were judged: ' + types(e2));
  }
};

P.busy_phase_taps = async ({ page, cdp, url }) => {
  // tap mats / pump / grass during aim, flight, collect, camp, wipe: no right / wrong / miss / extra stomp
  await startRound(page, url, { seed: 22 });
  const seen = {};
  for (let launch = 0; launch < 4; launch++) {
    const st = await page.evaluate(() => { const w = DK.debug.world; return { ok: w.state === 'round' && w.phase === 'play' && w.launch < w.cur.k }; });
    if (!st.ok) break;
    const i = await info(page);
    await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a));
    // aim phase (0.45 s)
    let n0 = await evLen(page), m0 = await page.evaluate(() => DK.debug.world.misses);
    if (await page.evaluate(() => DK.debug.world.phase) === 'aim') {
      seen.aim = 1;
      const others = i.others.length ? i.others : [i.a];
      for (const id of others.concat([i.a])) { const p = await page.evaluate(x => window.__qa.matPt(x), id); await tap(cdp, page, p, 30); }
      const e = await evSince(page, n0);
      const judged = e.filter(x => x.type === 'right' || x.type === 'wrong');
      check(judged.length === 0 && m0 === await page.evaluate(() => DK.debug.world.misses), 'tap during aim judged: ' + types(e));
      const stompInAim = e.filter(x => x.type === 'pump');
      if (stompInAim.length) note('busy_phase_taps', 'a tap during aim counted as a stomp: ' + types(e));
    }
    await pumpThree(cdp, page);
    // flight → collect: keep tapping everything until the next launch is ready or the camp starts
    n0 = await evLen(page); m0 = await page.evaluate(() => DK.debug.world.misses);
    const pumps0 = await page.evaluate(() => window.__ev.filter(e => e.type === 'pump').length);
    await page.evaluate(() => DK.debug.setSpeed(0.4));   // slow motion: a tap sent just before the next launch opens must not land after it (probe race)
    for (let k = 0; k < 120; k++) {
      const s = await page.evaluate(() => { const w = DK.debug.world; return { st: w.state, ph: w.phase, r: w.rocket.state, inter: w.interactive }; });
      if (s.st === 'round' && s.ph === 'play' && s.inter) break;
      seen[s.st + '/' + s.ph] = 1;
      if (s.st === 'talk') break;
      await tapEverything(cdp, page);
    }
    await page.evaluate(() => DK.debug.setSpeed(1));
    const e = await evSince(page, n0);
    const bad = e.filter(x => x.type === 'right' || x.type === 'wrong' || x.type === 'pump');
    check(bad.length === 0, 'taps during flight/collect/camp/wipe judged: ' + types(bad));
    check(m0 === await page.evaluate(() => DK.debug.world.misses) || await page.evaluate(() => DK.debug.world.phase) !== 'play', 'misses changed during busy phases');
    await page.waitForTimeout(100);
    if (await page.evaluate(() => DK.debug.world.state) !== 'round') break;
    await waitAsk(page).catch(() => {});
  }
  note('busy_phase_taps', 'phases tapped: ' + Object.keys(seen).join(' '));
};

P.pump_spam = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 23 });
  const i = await info(page);
  await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a));
  await W(page, () => DK.debug.world.phase === 'pump' && DK.debug.world.interactive, null, 10000);
  const n0 = await evLen(page);
  const p = await page.evaluate(() => DK.debug.pumpScreen());
  const t0 = Date.now();
  for (let k = 0; k < 10; k++) { await tap(cdp, page, p, 25); await page.waitForTimeout(35); }
  const wall = Date.now() - t0;
  await W(page, n => window.__ev.slice(n).some(e => e.type === 'land'), n0, 15000);
  const evs = await evSince(page, n0);
  const pumps = evs.filter(e => e.type === 'pump');
  check(pumps.length === 3 && pumps.map(e => e.n).join() === '1,2,3', `10 fast taps (${wall} ms): pumps ` + JSON.stringify(pumps.map(e => [e.n, e.auto])));
  check(evs.filter(e => e.type === 'launch').length === 1, 'launches: ' + types(evs));
  const kid = pumps.filter(e => !e.auto).length;
  note('pump_spam', `10 taps in ${wall} ms → ${kid} kid stomps + ${3 - kid} auto (merge 0.22 s)`);
  // 10 slower taps (~250 ms apart): 3 stomps, the rest harmless during flight
  await page.evaluate(() => DK.debug.setSpeed(4)); await W(page, () => { const w = DK.debug.world; return (w.phase === 'play' && w.interactive) || w.phase === 'camp' || w.state !== 'round'; }, null, 20000);
  await page.evaluate(() => DK.debug.setSpeed(1));
};

P.pump_before_mat = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 24 });
  const n0 = await evLen(page);
  const p = await page.evaluate(() => DK.debug.pumpScreen());
  check(p, 'pumpScreen null in play');
  for (let k = 0; k < 2; k++) { await tap(cdp, page, p, 60); await page.waitForTimeout(400); }
  const evs = await evSince(page, n0), s = await info(page);
  check(!evs.some(e => ['pump', 'launch', 'right', 'wrong'].includes(e.type)) && s.misses === 0 && s.phase === 'play', 'pump tapped before a mat: ' + types(evs) + ' ' + JSON.stringify(s));
  note('pump_before_mat', 'events: ' + types(evs) + ' (soft presses count as no-progress: 3 → hint)');
};

P.long_press = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 25 });
  const i = await info(page);
  const n0 = await evLen(page);
  const at = await page.evaluate(id => DK.debug.matScreen(id), i.a);
  await tStart(cdp, [tp(at.x, at.y)]);
  await page.waitForTimeout(2500);   // held through aim into the pump phase
  const mid = await page.evaluate(() => ({ ph: DK.debug.world.phase, g: !!DK.debug.world._g }));
  await tEnd(cdp);
  await page.waitForTimeout(200);
  let evs = await evSince(page, n0);
  check(evs.filter(e => e.type === 'right').length === 1 && !evs.some(e => e.type === 'wrong'), 'long press on the right mat: ' + types(evs));
  // now a stomp must work right after releasing the long press
  const p = await page.evaluate(() => DK.debug.pumpScreen());
  const n1 = await evLen(page);
  if (await page.evaluate(() => DK.debug.world.phase === 'pump')) {
    await tap(cdp, page, p, 50); await page.waitForTimeout(150);
    const e2 = await evSince(page, n1);
    check(e2.some(e => e.type === 'pump' && !e.auto), 'a stomp right after the long press did not count: ' + types(e2) + ' mid ' + JSON.stringify(mid));
  }
  await page.evaluate(() => DK.debug.setSpeed(4));
  await W(page, () => { const w = DK.debug.world; return (w.phase === 'play' && w.interactive) || w.phase === 'camp'; });
  await page.evaluate(() => DK.debug.setSpeed(1));
  // long press on the grass for 14 s of game time: does an idle nudge still come? (finger resting = not idle?)
  if (await page.evaluate(() => DK.debug.world.phase === 'play')) {
    await waitAsk(page);
    const g = await page.evaluate(() => { const w = DK.debug.world, M = w.layout.meadow; const p = DK.debug.toScreen((M.x0 + M.x1) / 2, w.layout.horizon + 30); return p; });
    const n2 = await evLen(page);
    await tStart(cdp, [tp(g.x, g.y)]);
    await page.evaluate(() => DK.debug.setSpeed(4));
    await page.waitForTimeout(4500);   // ≈ 18 s game time
    const e3 = await evSince(page, n2);
    await tEnd(cdp);
    await page.evaluate(() => DK.debug.setSpeed(1));
    note('long_press', 'finger resting on the grass ≈ 18 s game time → events ' + (types(e3) || '(none)') + (e3.some(e => e.type === 'idle') ? '' : ' — no idle nudge while a finger rests'));
  }
};

P.same_wrong_repeat = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 26 });
  const i = await info(page);
  check(i.others.length, 'no wrong mat');
  const n0 = await evLen(page);
  // 8 taps 0.25 s apart on the same wrong mat (2 s) → expect one miss per second ⇒ ≤ 2-3, ideally 1-2
  const t0 = await page.evaluate(() => DK.debug.world.time);
  for (let k = 0; k < 8; k++) { const p = await page.evaluate(id => window.__qa.matPt(id), i.others[0]); await tap(cdp, page, p, 40); await page.waitForTimeout(210); }
  const t1 = await page.evaluate(() => DK.debug.world.time);
  const evs = await evSince(page, n0), s = await info(page);
  const wrongs = evs.filter(e => e.type === 'wrong').length;
  note('same_wrong_repeat', `8 taps over ${(t1 - t0).toFixed(2)} s game time → wrong ${wrongs}, squish ${evs.filter(e => e.type === 'squish').length}, misses ${s.misses}, hint ${evs.filter(e => e.type === 'hint').length}, assistArmed ${evs.filter(e => e.type === 'assistArmed').length}`);
  check(s.misses >= 1, 'no miss at all');
  check(s.misses <= Math.ceil(t1 - t0), `more than one miss per second: ${s.misses} in ${(t1 - t0).toFixed(2)} s`);
};

P.hint_after_two = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 27 });
  const i = await info(page);
  check(i.others.length, 'no wrong mat');
  const n0 = await evLen(page);
  const w1 = i.others[0], w2 = i.others[1] || i.others[0];
  await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), w1)); await page.waitForTimeout(1300);
  await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), w2)); await page.waitForTimeout(250);
  const evs = await evSince(page, n0);
  const s = await page.evaluate(a => { const w = DK.debug.world, m = w.matById(a); return { misses: w.misses, glow: m.glow, glowT: m._glowT, hand: w.hintHand && w.hintHand.id, others: w.mats.filter(x => x.id !== a && x._glowT > 0).map(x => x.id) }; }, i.a);
  const h = evs.find(e => e.type === 'hint');
  check(s.misses === 2, 'misses ' + s.misses + ' ' + types(evs));
  check(h && h.id === i.a, 'no hint on the right mat after 2 misses: ' + types(evs));
  check(s.glowT > 0 && s.hand === i.a && s.others.length === 0, 'glow state: ' + JSON.stringify(s));
  // the hinted round: tapping the glowing mat works
  await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a)); await page.waitForTimeout(150);
  check((await evSince(page, n0)).some(e => e.type === 'right'), 'tap on the glowing mat');
};

P.hint_cooldown_gap = async ({ page, cdp, url }) => {
  // an idle hint (2nd idle at 30 s) followed by 2 misses ~5.5 s later: is the 2nd miss still hinted?
  await startRound(page, url, { seed: 28 });
  const i = await info(page);
  check(i.others.length, 'no wrong mat');
  await page.evaluate(() => DK.debug.setSpeed(6));
  const n0 = await evLen(page);
  await W(page, n => window.__ev.slice(n).filter(e => e.type === 'hint').length >= 1, n0, 30000);
  await page.evaluate(() => DK.debug.setSpeed(1));
  const th = await page.evaluate(() => window.__ev.filter(e => e.type === 'hint').slice(-1)[0]._t);
  // wait until the glow is over (5 s) but cooldown (6 s) not
  await page.evaluate(() => DK.debug.setSpeed(2));
  await W(page, t => DK.debug.world.time >= t + 5.15, th, 10000);
  await page.evaluate(() => DK.debug.setSpeed(1));
  const n1 = await evLen(page);
  const w1 = i.others[0], w2 = i.others[1] || i.others[0];
  await tap(cdp, page, await page.evaluate(id => window.__qa.matPt(id), w1)); await page.waitForTimeout(80);
  if (w2 === w1) await page.waitForTimeout(1000);
  await tap(cdp, page, await page.evaluate(id => window.__qa.matPt(id), w2)); await page.waitForTimeout(200);
  const t2 = await page.evaluate(() => DK.debug.world.time);
  const evs = await evSince(page, n1);
  const glowing = await page.evaluate(a => { const w = DK.debug.world, m = w.matById(a); return m._glowT > 0 || (w.hintHand && w.hintHand.id === a); }, i.a);
  const s = await info(page);
  note('hint_cooldown_gap', `idle hint at t=${th.toFixed(2)}, 2 misses ending at t=${t2.toFixed(2)} (misses ${s.misses}) → ${types(evs)}; right mat glowing now: ${glowing}`);
  check(glowing || s.misses < 2, `2 misses (${s.misses}) inside the hint cooldown → nothing glows: ${types(evs)}`);
};

P.edge_taps = async ({ page, cdp, url, d }) => {
  await startRound(page, url, { seed: 29 });
  const n0 = await evLen(page);
  const { width: vw, height: vh } = d.viewport;
  const pts = [[1, 1], [vw - 2, 1], [1, vh - 2], [vw - 2, vh - 2], [vw / 2, 2], [vw / 2, vh - 2], [1, vh / 2], [vw - 2, vh / 2], [vw / 2, 30], [30, vh / 2]];
  const hits = [];
  for (const [x, y] of pts) {
    const el = await page.evaluate(([a, b]) => { const e = document.elementFromPoint(a, b); return e ? (e.id || e.className || e.tagName) : null; }, [x, y]);
    await tap(cdp, page, { x, y }, 60); await page.waitForTimeout(150);
    const mode = await page.evaluate(() => DK.debug.mode);
    hits.push(`${Math.round(x)},${Math.round(y)}:${el}${mode !== 'play' ? '→' + mode : ''}`);
    if (mode === 'paused') { await tapEl(page, '#btnResume'); await page.waitForTimeout(400); }
  }
  const evs = await evSince(page, n0), s = await info(page);
  note('edge_taps', hits.join(' | ') + ' ; events ' + types(evs));
  const ar = evs.filter(e => e.type === 'right'), as = evs.filter(e => e.type === 'assist');
  check(ar.length === as.length, 'an edge tap answered without the assist: ' + types(evs));
  if (as.length) note('edge_taps', 'edge taps armed and then USED the assist (soft presses ×5 → the next meadow press picks the target): ' + types(evs));

  const paused = hits.filter(h => /paused/.test(h));
  if (paused.length) note('edge_taps', 'edge taps that PAUSED the game: ' + paused.join(' '));
};

P.two_finger = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 30 });
  const i = await info(page);
  check(i.others.length, 'no wrong mat');
  const n0 = await evLen(page);
  const a = await page.evaluate(id => DK.debug.matScreen(id), i.others[0]), b = await page.evaluate(id => DK.debug.matScreen(id), i.a);
  await tStart(cdp, [tp(a.x, a.y, 1), tp(b.x, b.y, 2)]);   // both fingers land at once (wrong first)
  await page.waitForTimeout(80);
  await tEnd(cdp);
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  const judged = evs.filter(e => e.type === 'right' || e.type === 'wrong');
  check(judged.length <= 1, 'two fingers judged twice: ' + types(evs));
  note('two_finger', 'simultaneous wrong+right → ' + types(judged));
  // two-finger tap on the grass + a mat during the flight (busy) → nothing
  if (judged.length && judged[0].type === 'wrong') {
    await page.waitForTimeout(1200);
    await tStart(cdp, [tp(b.x, b.y, 3), tp(a.x, a.y, 4)]); await page.waitForTimeout(60); await tEnd(cdp); await page.waitForTimeout(300);
    evs = (await evSince(page, n0)).filter(e => e.type === 'right' || e.type === 'wrong');
    check(evs.filter(e => e.type === 'right').length === 1, 'right+wrong pair: ' + types(evs));
  }
};

async function rotate(page, d) { await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width }); await page.waitForTimeout(600); }
async function unrotate(page, d) { await page.setViewportSize(d.viewport); await page.waitForTimeout(600); }
async function outside(page) {
  return page.evaluate(() => {
    const w = DK.debug.world, v = DK.debug.view(), out = [];
    for (const m of w.mats) { if (m.state !== 'rest') continue; const p = DK.debug.toScreen(m.x, m.y); if (p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) out.push(m.id); }
    const r = DK.debug.toScreen(w.rocket.x, w.rocket.y); if (r.x < 0 || r.y < -400 || r.x > innerWidth || r.y > innerHeight + 1) out.push('rocket');
    const n = DK.debug.toScreen(w.mimi.x, w.mimi.y); if (n.x < 0 || n.y < 0 || n.x > innerWidth || n.y > innerHeight + 1) out.push('mimi');
    return out;
  });
}

P.rotate_pump = async ({ page, cdp, url, d }) => {
  await startRound(page, url, { seed: 31 });
  const i = await info(page);
  await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a));
  await W(page, () => DK.debug.world.phase === 'pump' && DK.debug.world.interactive, null, 10000);
  const n0 = await evLen(page);
  await tap(cdp, page, await page.evaluate(() => DK.debug.pumpScreen()), 50);
  await page.waitForTimeout(300);
  await rotate(page, d);
  let o = await outside(page);
  check(o.length === 0, 'outside after rotating in pump: ' + o.join());
  const ph = await page.evaluate(() => DK.debug.world.phase);
  if (ph === 'pump') {
    for (let k = 0; k < 2; k++) { await tap(cdp, page, await page.evaluate(() => DK.debug.pumpScreen()), 50); await page.waitForTimeout(300); }
  }
  await W(page, n => window.__ev.slice(n).some(e => e.type === 'land'), n0, 15000);
  const evs = await evSince(page, n0);
  const land = evs.find(e => e.type === 'land');
  const pumps = evs.filter(e => e.type === 'pump');
  check(land && land.id === i.a && land.err <= 2, 'landing after rotate in pump: ' + JSON.stringify(land));
  note('rotate_pump', `phase after rotation: ${ph}; pumps ${pumps.map(p => p.n + (p.auto ? 'a' : '')).join(',')}`);
  const bad = await page.evaluate(() => window.__qa.nan()); check(bad.length === 0, 'NaN: ' + bad.join());
  await unrotate(page, d);
};

P.rotate_camp_talk = async ({ page, cdp, url, d, errors }) => {
  await startRound(page, url, { seed: 32 });
  await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(3); });
  await W(page, () => DK.debug.world.phase === 'camp' || DK.debug.world.state === 'roundDone', null, 60000);
  await page.evaluate(() => DK.debug.setSpeed(1));
  await rotate(page, d);
  let o = await outside(page); check(o.length === 0, 'outside after rotating in camp: ' + o.join());
  let bad = await page.evaluate(() => window.__qa.nan()); check(bad.length === 0, 'NaN after camp rotation: ' + bad.join());
  const pen = await page.evaluate(() => DK.debug.world.pennants.map(p => [Math.round(p.x), Math.round(p.y)]));
  const pole = await page.evaluate(() => DK.debug.world.layout.pole);
  const penOff = pen.filter(([x]) => Math.abs(x - pole.x) > 4);
  if (penOff.length) note('rotate_camp_talk', 'pennants not on the pole after rotation: ' + JSON.stringify(pen) + ' pole x ' + pole.x);
  await unrotate(page, d);
  // talk
  await page.evaluate(() => DK.debug.setSpeed(8));
  await W(page, () => DK.debug.world.state === 'talk', null, 200000);
  await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); });
  await page.waitForTimeout(500);
  await rotate(page, d);
  const t = await page.evaluate(() => {
    const bs = [...document.querySelectorAll('#talkChoices button')].map(b => b.getBoundingClientRect());
    return { mode: DK.debug.mode, vis: !document.getElementById('scrTalk').classList.contains('hidden'), bs: bs.map(r => [r.left, r.top, r.right, r.bottom].map(Math.round)), iw: innerWidth, ih: innerHeight, ans: DK.debug.world.talkAnswered };
  });
  check(t.mode === 'talk' && t.vis && !t.ans, 'talk after rotation: ' + JSON.stringify(t));
  const off = t.bs.filter(r => r[0] < 0 || r[1] < 0 || r[2] > t.iw || r[3] > t.ih);
  check(off.length === 0, 'talk choice off screen after rotation: ' + JSON.stringify(t));
  const ans = await page.evaluate(() => DK.debug.world.talk.answer);
  await tapEl(page, `#talkChoices button[data-id="${ans}"]`);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => DK.debug.world.talkAnswered && DK.debug.world.talkAnswered.correct), 'talk answer by tap after rotation failed');
  await unrotate(page, d);
};

const hide = page => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
const show = page => page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });

P.visibility_flight = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 33 });
  const i = await info(page);
  await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a));
  await W(page, () => DK.debug.world.phase === 'pump' && DK.debug.world.interactive, null, 10000);
  const n0 = await evLen(page);
  for (let k = 0; k < 3; k++) { await tap(cdp, page, await page.evaluate(() => DK.debug.pumpScreen()), 50); await page.waitForTimeout(280); }
  await W(page, () => ['boost', 'coast'].includes(DK.debug.world.rocket.state), null, 5000);
  await hide(page);
  await page.waitForTimeout(200);
  const a = await page.evaluate(() => ({ mode: DK.debug.mode, t: DK.debug.world.time, r: [DK.debug.world.rocket.x, DK.debug.world.rocket.y, DK.debug.world.rocket.state] }));
  await page.waitForTimeout(1500);
  const b = await page.evaluate(() => ({ t: DK.debug.world.time, r: [DK.debug.world.rocket.x, DK.debug.world.rocket.y] }));
  check(a.mode === 'paused' && a.t === b.t && a.r[0] === b.r[0], 'flight kept running while hidden: ' + JSON.stringify({ a, b }));
  await show(page);
  await page.waitForTimeout(300);
  check(await page.evaluate(() => DK.debug.mode) === 'paused', 'did not stay paused after becoming visible');
  await tapEl(page, '#btnResume');
  await W(page, n => window.__ev.slice(n).some(e => e.type === 'land'), n0, 15000);
  const land = (await evSince(page, n0)).find(e => e.type === 'land');
  check(land.id === i.a && land.err <= 2 && land.flight < 4, 'landing after hidden mid-flight: ' + JSON.stringify(land));
  const bad = await page.evaluate(() => window.__qa.nan()); check(bad.length === 0, 'NaN: ' + bad.join());
};

P.pause_in_pump = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 34 });
  const i = await info(page);
  await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a));
  await W(page, () => DK.debug.world.phase === 'pump' && DK.debug.world.interactive, null, 10000);
  const tP = await page.evaluate(() => DK.debug.world.time);
  await page.waitForTimeout(2000);   // 2 s into the 3 s auto window
  const n0 = await evLen(page);
  await tapEl(page, '#btnPause');
  await page.waitForTimeout(150);
  check(await page.evaluate(() => DK.debug.mode) === 'paused', 'not paused');
  const tA = await page.evaluate(() => DK.debug.world.time);
  await page.waitForTimeout(5000);
  const e1 = await evSince(page, n0);
  check(!e1.some(e => e.type === 'pump' || e.type === 'pumpAuto'), 'auto-pump fired while paused: ' + types(e1));
  await tapEl(page, '#btnResume');
  const tR = await page.evaluate(() => DK.debug.world.time);
  await W(page, n => window.__ev.slice(n).some(e => e.type === 'pump'), n0, 10000);
  const first = (await evSince(page, n0)).find(e => e.type === 'pump');
  note('pause_in_pump', `pump started t=${tP.toFixed(2)}, paused at ${tA.toFixed(2)} (${(tA - tP).toFixed(2)} s in), resumed ${tR.toFixed(2)}, first auto stomp ${(first._t - tR).toFixed(2)} s after resume (auto=${first.auto})`);
  check(first._t - tR >= 0.9 || !first.auto, `Mimi stomped by herself ${(first._t - tR).toFixed(2)} s after Resume — the child had no chance to pump`);
};

P.pause_idle_reset = async ({ page, cdp, url }) => {
  // resume → the idle timers and prompt again; pause button tapped during flight is fine
  await startRound(page, url, { seed: 35 });
  await tapEl(page, '#btnPause'); await page.waitForTimeout(200);
  await tapEl(page, '#btnResume'); await page.waitForTimeout(200);
  // a tap on the canvas in the 250 ms block after Resume falls through (blocked) — then a tap 400 ms later must work
  const i = await info(page);
  const n0 = await evLen(page);
  await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a)); await page.waitForTimeout(200);
  check((await evSince(page, n0)).some(e => e.type === 'right'), 'tap 400 ms after resume did not count');
};

P.lang_switch_vi = async ({ page, url }) => {
  await gotoTitle(page, url + '?mute=1&seed=36&age=4');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?mute=1&seed=36&age=4');
  await tapEl(page, '.title-top [data-lang="vi"]');
  await page.waitForTimeout(250);
  const welcome = await page.evaluate(() => (DK.debug.voiceLog || []).slice(-1)[0]);
  await tapEl(page, '#btnPlay');
  await page.evaluate(() => window.__qa.hook());
  await page.evaluate(() => DK.debug.setSpeed(4));
  await W(page, () => window.__ev.some(e => e.type === 'ask'), null, 30000);
  await page.evaluate(() => DK.debug.setSpeed(1));
  await page.waitForTimeout(300);
  const log = await page.evaluate(() => (DK.debug.voiceLog || []).slice(-8).map(e => ({ lang: e.lang, text: e.text })));
  const viLines = log.filter(e => VI_CHARS_TEST(e.text));
  function VI_CHARS_TEST() { return false; }
  const ok = log.length && log.every(e => e.lang === 'vi' || /^vi/.test(e.lang || ''));
  const viText = log.filter(e => /[ăâđêôơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/i.test(e.text));
  check(welcome && /vi/.test(welcome.lang) && /[ạảấầơư]|chào|bé/i.test(welcome.text), 'the title welcome after switching to VI: ' + JSON.stringify(welcome));
  check(ok && viText.length >= 1, 'voiceLog after VI switch: ' + JSON.stringify(log));
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dk:settings') || '{}').lang);
  check(saved === 'vi', 'VI not saved: ' + saved);
};

P.parent_gate = async ({ page, cdp, url }) => {
  await gotoTitle(page, url + '?mute=1&seed=37');
  const b = await elBox(page, '#btnParents');
  const c = { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  const isOpen = () => visible(page, 'scrSettings');
  await page.touchscreen.tap(c.x, c.y); await page.waitForTimeout(400);
  check(!(await isOpen()), 'a short tap opened the settings');
  for (let k = 0; k < 5; k++) { await page.touchscreen.tap(c.x, c.y); await page.waitForTimeout(90); }
  await page.waitForTimeout(300);
  check(!(await isOpen()), '5 quick taps opened the settings');
  await tStart(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(1300); await tEnd(cdp); await page.waitForTimeout(800);
  check(!(await isOpen()), 'a 1.3 s hold opened the settings');
  // hold, slide off the gear, keep holding: must not open
  await tStart(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(300); await tMove(cdp, [tp(c.x + 120, c.y + 200)]); await page.waitForTimeout(2200); await tEnd(cdp); await page.waitForTimeout(300);
  const slid = await isOpen();
  if (slid) { note('parent_gate', 'a hold that SLID OFF the gear still opened the settings after 2 s'); await tapEl(page, '#btnSettingsDone'); await page.waitForTimeout(300); }
  await tStart(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(2300);
  const openWhileHeld = await isOpen();
  await tEnd(cdp); await page.waitForTimeout(400);
  check(await isOpen(), 'a 2.3 s hold did not open the settings');
  note('parent_gate', 'opened while still held: ' + openWhileHeld);
  // does the finger lifting over the settings screen click something under it?
  const st = await page.evaluate(() => DK.debug.getState().settings);
  note('parent_gate', 'settings after open: ' + JSON.stringify(st));
};

P.settings_persist = async ({ page, cdp, url }) => {
  await gotoTitle(page, url + '?mute=1&seed=38');
  await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?mute=1&seed=38');
  const b = await elBox(page, '#btnParents');
  await tStart(cdp, [tp(b.x + b.width / 2, b.y + b.height / 2)]); await page.waitForTimeout(2300); await tEnd(cdp); await page.waitForTimeout(400);
  check(await visible(page, 'scrSettings'), 'settings did not open');
  await tapEl(page, '#ageChips .chip[data-age="6"]');
  await tapEl(page, '#optMusic');
  await page.locator('#inpName').fill('Bông');
  await tapEl(page, '#btnSettingsDone'); await page.waitForTimeout(300);
  await gotoTitle(page, url + '?mute=1&seed=38');
  let s = await page.evaluate(() => ({ st: DK.debug.getState().settings, age: document.getElementById('titleAge').textContent }));
  check(s.st.age === 6 && s.st.music === false && s.st.name === 'Bông' && /6/.test(s.age), 'settings after reload: ' + JSON.stringify(s));
  // URL flags never saved: ?lang=vi&age=3, then change a setting (volume −) from the pause menu, reload clean
  await gotoTitle(page, url + '?mute=1&seed=38&lang=vi&age=3');
  const t = await page.evaluate(() => ({ lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent }));
  await tapEl(page, '#btnPlay'); await page.waitForTimeout(600);
  await tapEl(page, '#btnPause'); await page.waitForTimeout(300);
  await tapEl(page, '#btnVolDown'); await page.waitForTimeout(200);
  await tapEl(page, '#btnHome'); await page.waitForTimeout(300);
  const raw = await page.evaluate(() => localStorage.getItem('dk:settings'));
  await gotoTitle(page, url + '?mute=1&seed=38');
  s = await page.evaluate(() => ({ st: DK.debug.getState().settings, html: document.documentElement.lang }));
  check(t.lang === 'vi' && /3/.test(t.age), 'URL flags not applied: ' + JSON.stringify(t));
  check(s.st.lang === 'en' && s.st.age === 6 && s.html === 'en' && Math.abs(s.st.volume - 0.9) < 0.01, 'URL flags leaked into saved settings: ' + JSON.stringify(s) + ' raw ' + raw);
};

P.age_override_session = async ({ page, url }) => {
  // ?age=6 plays age 6 even if saved age is 4; the world's age follows
  await gotoTitle(page, url + '?mute=1&seed=39&age=6');
  await tapEl(page, '#btnPlay'); await page.waitForTimeout(500);
  const a = await page.evaluate(() => DK.debug.world.age);
  check(a === 6, 'world age with ?age=6: ' + a);
};

P.idle_backoff = async ({ page, url }) => {
  await startRound(page, url, { seed: 40 });
  const tAsk = await page.evaluate(() => window.__ev.filter(e => e.type === 'ask').slice(-1)[0]._t);
  await page.evaluate(() => DK.debug.setSpeed(8));
  await W(page, () => DK.debug.mode === 'paused' || window.__ev.filter(e => e.type === 'idle').length >= 6, null, 60000);
  await page.evaluate(() => DK.debug.setSpeed(1));
  const idles = await page.evaluate(() => window.__ev.filter(e => e.type === 'idle').map(e => e._t));
  const hints = await page.evaluate(() => window.__ev.filter(e => e.type === 'hint').map(e => ({ t: e._t, idle: !!e.idle })));
  const rel = idles.map(t => +(t - tAsk).toFixed(1));
  const mode = await page.evaluate(() => DK.debug.mode);
  note('idle_backoff', `idle nudges at +${rel.join(', +')} s after the ask; hints ${JSON.stringify(hints.map(h => +(h.t - tAsk).toFixed(1)))}; mode ${mode}`);
  const want = [12, 30, 57, 87, 117];
  check(rel.length >= 4 && rel.slice(0, 4).every((t, k) => Math.abs(t - want[k]) < 1.0), 'idle schedule: ' + rel.join());
  check(hints.length >= 1 && Math.abs(hints[0].t - tAsk - 30) < 1, 'the 2nd idle did not hint');
  check(mode === 'paused', 'no auto-pause after the 5th idle (mode ' + mode + ')');
  const said = await page.evaluate(() => (DK.debug.voiceLog || []).length);
  check(said > 0, 'voice log empty');
};

P.talk_reask = async ({ page, url }) => {
  await startRound(page, url, { seed: 41 });
  await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); });
  await W(page, () => DK.debug.world.state === 'talk', null, 200000);
  await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); });
  const t0 = await page.evaluate(() => window.__ev.filter(e => e.type === 'talk').slice(-1)[0]._t);
  const v0 = await page.evaluate(() => (DK.debug.voiceLog || []).length);
  const q = await page.evaluate(() => { const tk = DK.debug.world.talk; return tk.promptKey; });
  // check: no glow before the 2nd re-ask
  await page.evaluate(() => DK.debug.setSpeed(4));
  const glowAt = [];
  for (let k = 0; k < 200; k++) {
    const s = await page.evaluate(() => ({ t: DK.debug.world.time, g: !!document.querySelector('#talkChoices .glow'), ans: DK.debug.world.talkAnswered, st: DK.debug.world.state }));
    if (s.g && !glowAt.length) glowAt.push(s.t);
    if (s.ans || s.st !== 'talk') break;
    await page.waitForTimeout(100);
  }
  await page.evaluate(() => DK.debug.setSpeed(1));
  const asks = await page.evaluate(() => window.__ev.filter(e => e.type === 'talkAsk').map(e => ({ n: e.n, t: e._t, g: e.glowAnswer })));
  const res = await page.evaluate(() => window.__ev.filter(e => e.type === 'talkResult').slice(-1)[0]);
  const lines = await page.evaluate(n => (DK.debug.voiceLog || []).slice(n).map(e => ({ t: e.t, text: e.text })), v0);
  const rel = asks.map(a => +(a.t - t0).toFixed(1));
  note('talk_reask', `re-asks at +${rel.join(', +')} s; glow from +${glowAt.length ? (glowAt[0] - t0).toFixed(1) : '-'} s; auto answer at +${res ? (res._t - t0).toFixed(1) : '-'} s (auto ${res && res.auto}); ${lines.length} lines spoken after talk start: ${lines.map(l => l.text).join(' / ').slice(0, 300)}`);
  check(asks.length === 3 && rel.every((t, k) => Math.abs(t - 12 * (k + 1)) < 0.6), 're-ask timing: ' + rel.join());
  check(!asks[0].g && asks[1].g, 'glow flags: ' + JSON.stringify(asks));
  check(glowAt.length && glowAt[0] - t0 >= 23.5, 'the answer glowed before the 2nd re-ask: ' + (glowAt[0] - t0));
  check(res && res.auto && Math.abs(res._t - t0 - 38) < 0.6, 'auto answer: ' + JSON.stringify(res));
  // silent after the 3rd re-ask: only the kind auto line (+ level lines) after it
  const after3 = lines.filter(l => l.t != null);
  const st = await page.evaluate(() => DK.debug.stats.talkRight);
  check(st === 0, 'auto answer counted as right');
};

P.assisted_round = async ({ page, cdp, url }) => {
  await startRound(page, url, { seed: 42 });
  const n0 = await evLen(page);
  const stars0 = await page.evaluate(() => DK.debug.world.stars);
  // 5 soft taps on grass → assist armed; then a tap anywhere on the meadow picks the target
  const g = await page.evaluate(() => {
    const w = DK.debug.world, L = w.layout, M = L.meadow, out = [];
    for (let gx = 0.1; gx < 0.95; gx += 0.05) for (let gy = 0.1; gy < 0.95; gy += 0.05) {
      const lx = M.x0 + (M.x1 - M.x0) * gx, ly = L.horizon + 20 + (M.y1 - L.horizon - 40) * gy;
      if (w.mats.some(m => m.state !== 'hidden' && m.state !== 'gone' && Math.hypot(lx - m.x, ly - m.y + 0.3 * L.itemH) < L.hitR + 60)) continue;
      if (Math.hypot(lx - L.pump.x, ly - L.pump.y) < 120 || Math.hypot(lx - L.pad.x, ly - L.pad.y) < 140) continue;
      const mb = w.mimiHit(); if (lx > mb.x - 20 && lx < mb.x + mb.w + 20 && ly > mb.y - 20 && ly < mb.y + mb.h + 20) continue;
      const p = DK.debug.toScreen(lx, ly), el = document.elementFromPoint(p.x, p.y);
      if (el && el.id === 'game' && w._clearOfKeep(lx, ly)) out.push(p);
    }
    return out[Math.floor(out.length / 2)];
  });
  check(g, 'no grass point');
  const nA = await page.evaluate(() => DK.debug.world.cfg.assistAfter);   // 4 since the QA fix round (was 5)
  for (let k = 0; k < nA; k++) { await tap(cdp, page, g, 50); await page.waitForTimeout(350); }
  let evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'assistArmed'), nA + ' soft taps did not arm the assist: ' + types(evs));
  await tap(cdp, page, g, 50); await page.waitForTimeout(250);
  evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'assist') && evs.some(e => e.type === 'right'), 'assist tap: ' + types(evs));
  // finish the round by real taps
  await pumpThree(cdp, page);
  for (let k = 0; k < 5; k++) {
    await page.evaluate(() => DK.debug.setSpeed(4));
    await W(page, () => { const w = DK.debug.world; return (w.phase === 'play' && w.interactive && DK.debug.answer() && DK.debug.matScreen(DK.debug.answer().id) && w.mats.filter(m => m.launch === w.launch).every(m => m.state === 'rest')) || w.state !== 'round' || w.phase === 'camp'; }, null, 20000);
    await page.evaluate(() => DK.debug.setSpeed(1));
    const s = await page.evaluate(() => { const w = DK.debug.world; return w.state === 'round' && w.phase === 'play' && w.launch < w.cur.k; });
    if (!s) break;
    await page.waitForTimeout(150);
    const i = await info(page);
    await tap(cdp, page, await page.evaluate(id => DK.debug.matScreen(id), i.a));
    await pumpThree(cdp, page);
  }
  await page.evaluate(() => DK.debug.setSpeed(4));
  await W(page, n => window.__ev.slice(n).some(e => e.type === 'roundDone'), n0, 30000);
  await page.evaluate(() => DK.debug.setSpeed(1));
  const rd = (await evSince(page, n0)).find(e => e.type === 'roundDone');
  check(rd.assisted && rd.stars <= 2, 'assisted round stars: ' + JSON.stringify(rd));
  check(await page.evaluate(() => DK.debug.world.stars) === stars0 + rd.stars, 'stars total');
};

P.talk_canvas_taps = async ({ page, cdp, url }) => {
  // taps on the canvas area around the Talk panel and spamming a wrong choice: one answer only
  await startRound(page, url, { seed: 43 });
  await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); });
  await W(page, () => DK.debug.world.state === 'talk', null, 200000);
  await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); });
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => ({ ans: DK.debug.world.talk.answer, ids: [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id), st: DK.debug.world.stars }));
  const wrong = t.ids.find(x => x !== String(t.ans));
  for (let k = 0; k < 4; k++) { await tapEl(page, `#talkChoices button[data-id="${wrong}"]`); await page.waitForTimeout(60); }
  await tapEl(page, `#talkChoices button[data-id="${t.ans}"]`).catch(() => {});
  await page.waitForTimeout(300);
  const r = await page.evaluate(() => ({ res: window.__ev.filter(e => e.type === 'talkResult').length, ans: DK.debug.world.talkAnswered, st: DK.debug.world.stars }));
  check(r.res === 1 && r.ans && !r.ans.correct && r.st === t.st, 'talk spam: ' + JSON.stringify(r));
};

/* ---------- bot sessions with monitors */
async function botSession(browser, url, { age, lang, dev }, errors) {
  const d = DEV[dev];
  const { ctx, page } = await newPage(browser, d, errors);
  try {
    await page.goto(`${url}?mute=1&seed=${50 + age}&age=${age}&lang=${lang}&speed=10&bot=1&autostart=1`);
    await W(page, () => window.DK && DK.debug && DK.debug.world && DK.debug.mode === 'play', null, 20000);
    await page.evaluate(() => window.__qa.hook());
    const mon = { stars: [], nan: [], stuck: 0 };
    let lastStars = -1, lastChange = Date.now(), lastSig = '';
    const t0 = Date.now();
    for (;;) {
      const s = await page.evaluate(() => ({ mode: DK.debug.mode, stars: DK.debug.world.stars, nan: window.__qa.nan(), sig: DK.debug.world.state + '/' + DK.debug.world.phase + '/' + DK.debug.world.round + '/' + DK.debug.world.launch + '/' + DK.debug.world.level }));
      if (s.stars < lastStars) mon.stars.push(`${lastStars}->${s.stars}`);
      lastStars = s.stars;
      if (s.nan.length) mon.nan.push(...s.nan.slice(0, 3));
      if (s.sig !== lastSig) { lastSig = s.sig; lastChange = Date.now(); }
      else if (Date.now() - lastChange > 45000) { mon.stuck = s.sig; break; }
      if (s.mode === 'done') break;
      if (Date.now() - t0 > 400000) { mon.stuck = 'timeout ' + s.sig; break; }
      await page.waitForTimeout(250);
    }
    const ev = await page.evaluate(() => window.__ev.filter(e => ['roundDone', 'sessionDone', 'talkResult'].includes(e.type)).map(e => ({ type: e.type, stars: e.stars, assisted: e.assisted, misses: e.misses, correct: e.correct, auto: e.auto })));
    const said = await page.evaluate(() => (DK.debug.voiceLog || []).map(e => ({ lang: e.lang, text: e.text })));
    const rd = ev.filter(e => e.type === 'roundDone'), sd = ev.find(e => e.type === 'sessionDone');
    const badAssist = rd.filter(e => e.assisted && e.stars > 2);
    const tr = ev.filter(e => e.type === 'talkResult');
    const sum = rd.reduce((a, e) => a + e.stars, 0) + tr.filter(e => e.correct).length;
    const wrongLang = said.filter(x => !String(x.lang || '').startsWith(lang)).slice(0, 3);
    const raw = said.filter(x => /\{|\}|undefined|NaN|\[object/.test(x.text)).slice(0, 3);
    const viMissing = lang === 'vi' ? said.filter(x => /\b(the|find|one|tap|pump)\b/i.test(x.text) && !VI_CHARS.test(x.text)).slice(0, 3) : [];
    const res = { age, lang, dev: d.name, rounds: rd.length, stars: sd && sd.stars, sumStars: sum, assisted: rd.filter(e => e.assisted).length, badAssist: badAssist.length, starsDown: mon.stars, nan: mon.nan.slice(0, 5), stuck: mon.stuck, wrongLang, raw, viMissing, wall: Math.round((Date.now() - t0) / 1000) };
    return res;
  } finally { await ctx.close(); }
}

/* ---------- runner */
const PLAN = [
  ['unfold_taps', 'ip'], ['unfold_taps', 'pl'], ['busy_phase_taps', 'ip'], ['busy_phase_taps', 'il'], ['pump_spam', 'ip'], ['pump_spam', 'pp'],
  ['pump_before_mat', 'ip'], ['long_press', 'ip'], ['same_wrong_repeat', 'ip'], ['same_wrong_repeat', 'pl'], ['hint_after_two', 'ip'], ['hint_after_two', 'il'],
  ['hint_cooldown_gap', 'ip'], ['edge_taps', 'ip'], ['edge_taps', 'il'], ['edge_taps', 'pp'], ['edge_taps', 'pl'], ['two_finger', 'ip'], ['two_finger', 'pp'],
  ['rotate_pump', 'ip'], ['rotate_pump', 'pl'], ['rotate_camp_talk', 'ip'], ['rotate_camp_talk', 'pp'], ['visibility_flight', 'ip'], ['visibility_flight', 'pl'],
  ['pause_in_pump', 'ip'], ['pause_idle_reset', 'il'], ['lang_switch_vi', 'ip'], ['parent_gate', 'ip'], ['parent_gate', 'pl'], ['settings_persist', 'pp'],
  ['age_override_session', 'ip'], ['idle_backoff', 'ip'], ['talk_reask', 'ip'], ['assisted_round', 'ip'], ['assisted_round', 'pl'], ['talk_canvas_taps', 'il']
];
const BOTS = [{ age: 3, lang: 'en', dev: 'ip' }, { age: 5, lang: 'vi', dev: 'il' }, { age: 6, lang: 'en', dev: 'pp' }, { age: 7, lang: 'vi', dev: 'pl' }];

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const want = process.env.PROBES ? process.env.PROBES.split(',') : null;
  const plan = PLAN.filter(([p]) => !want || want.includes(p));
  const par = +process.env.PAR || 3;
  let idx = 0;
  async function worker() {
    while (idx < plan.length) {
      const [name, dk] = plan[idx++]; const d = DEV[dk];
      const errors = [];
      const { ctx, page, cdp } = await newPage(browser, d, errors);
      const t0 = Date.now();
      try {
        await P[name]({ page, cdp, url: srv.url, d, errors });
        check(errors.length === 0, 'console/page errors: ' + errors.slice(0, 3).join(' | '));
        results.push({ probe: name, device: d.name, ok: true });
        console.log(`PASS ${d.name.padEnd(16)} ${name} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
      } catch (e) {
        let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = DK.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, launch: s.launch, misses: s.misses }; })); } catch (x) {}
        const msg = (e && e.message ? e.message.split('\n')[0] : String(e)) + ' ' + st;
        results.push({ probe: name, device: d.name, ok: false, detail: msg });
        console.log(`FAIL ${d.name.padEnd(16)} ${name} — ${msg}`);
      }
      await ctx.close();
    }
  }
  await Promise.all(Array.from({ length: par }, worker));
  if (!want || want.includes('bots')) {
    const out = await Promise.all(BOTS.map(async b => { const errors = []; try { const r = await botSession(browser, srv.url, b, errors); r.errors = errors.slice(0, 3); return r; } catch (e) { return { ...b, error: String(e), errors }; } }));
    for (const r of out) {
      const ok = !r.error && !r.stuck && !r.badAssist && !r.starsDown.length && !r.nan.length && !r.errors.length && !r.raw.length && !r.wrongLang.length && r.stars === r.sumStars;
      results.push({ probe: 'bot_session', device: r.dev || r.dev, ok, detail: JSON.stringify(r) });
      console.log(`${ok ? 'PASS' : 'FAIL'} bot age ${r.age} ${r.lang} ${r.dev}: ` + JSON.stringify(r));
    }
  }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, notes }, null, 1));
  await browser.close(); srv.close();
  const f = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - f}/${results.length} passed`);
  process.exit(f ? 1 : 0);
})();
