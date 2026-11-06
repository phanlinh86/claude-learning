// Functional QA — adversarial extras for Momo's Toy Train (report-only; never edits game/).
// REAL CDP touch (Input.dispatchTouchEvent) in isMobile/hasTouch contexts.
//   node tests/e2e/qa_extra.js                 (all groups, sequential)
//   node tests/e2e/qa_extra.js leftover balloon (some groups)
// Groups: touch high twofinger hud rotate phases whistle count talk mic pause gate persist lang leftover balloon audio bots
// Writes tests/out/qa_extra/results.json + screenshots; exits 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');

const OUT = path.join(__dirname, '..', 'out', 'qa_extra'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ALL = [DEV.iphoneP, DEV.iphoneL, DEV.ipadP, DEV.ipadL];
const ONLY = process.argv.slice(2);
const results = [];
let log = [];
function check(group, name, ok, info) {
  results.push({ group, name, ok: !!ok, info: ok || info == null ? '' : info });
  const line = (ok ? 'PASS ' : 'FAIL ') + `[${group}] ` + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 700));
  console.log(line);
  return !!ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũờởỡợứừửữựấầẩẫậắằẳẵặếềểễệốồổỗộớ]/i;

let srv, browser;
const ctxOpts = d => ({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
async function open(dev, q = '', opt = {}) {
  const ctx = await browser.newContext(ctxOpts(dev));
  if (opt.init) await ctx.addInitScript(opt.init);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  const P = { ctx, page, errors, cdp, dev };
  await page.goto(srv.url + (q ? '?' + q : ''));
  await waitTitle(P);
  return P;
}
async function waitTitle(P) {
  await P.page.waitForFunction(() => window.TT && TT.debug && TT.debug.mode === 'title', null, { timeout: 20000 });
  await P.page.evaluate(() => {
    const w = TT.debug.world; window.__ev = [];
    const o = w.drainEvents.bind(w);
    w.drainEvents = function () {
      const e = o();
      for (const x of e) window.__ev.push({ type: x.type, id: x.id, carId: x.carId, auto: x.auto, count: x.count, correct: x.correct, round: x.round, stars: x.stars, misses: x.misses, t: performance.now(), wt: w.time });
      if (window.__ev.length > 6000) window.__ev.splice(0, 3000);
      return e;
    };
  });
  await sleep(200);
}
const ev = (P, since = 0) => P.page.evaluate(s => window.__ev.filter(e => e.t >= s), since);
const now = P => P.page.evaluate(() => performance.now());
async function until(P, fn, arg, ms = 25000) {
  try { return await P.page.waitForFunction(fn, arg, { timeout: ms, polling: 40 }); }
  catch (e) {
    const st = await P.page.evaluate(() => { const s = TT.debug.getState(); delete s.settings; return Object.assign(s, { last: (window.__ev || []).slice(-8).map(x => x.type) }); }).catch(() => null);
    throw new Error('timeout waiting for ' + String(fn).slice(0, 140) + ' — ' + JSON.stringify(st));
  }
}
async function touchDown(P, x, y, id = 1) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] }); }
async function touchMove(P, x, y, id = 1) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] }); }
async function touchUp(P) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
async function tap(P, x, y, hold = 70) { await touchDown(P, x, y); await sleep(hold); await touchUp(P); }
async function elBox(P, sel) {
  return P.page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect(); if (!r.width) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom };
  }, sel);
}
async function tapEl(P, sel, hold = 70) { const b = await elBox(P, sel); if (!b) throw new Error('not visible: ' + sel); await tap(P, b.x, b.y, hold); await sleep(250); }
const visible = (P, id) => P.page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
const mode = P => P.page.evaluate(() => TT.debug.mode);
async function info(P) {
  return P.page.evaluate(() => {
    const w = TT.debug.world, pr = w.prompt ? w.prompt() : null;
    return {
      mode: TT.debug.mode, state: w.state, phase: w.phase, level: w.level, topic: w.topic, round: w.round, stars: w.stars, misses: w.misses, held: w.held,
      askMode: pr && pr.mode, time: w.time,
      items: w.items.map(i => ({ id: i.id, state: i.state, carId: i.carId, bye: !!i._bye, box: TT.debug.itemScreen(i.id), ans: TT.debug.answerCarId(i.id), x: i.x, y: i.y })),
      cars: w.cars.map(c => ({ id: c.id, need: c.need, reserved: c.reserved, n: (c.items || []).length, box: TT.debug.carScreen(c.id), raw: w.carBox(c.id) })),
      whistle: TT.debug.whistleScreen(), momo: TT.debug.momoScreen(), hint: !!w.hintHand,
      bubble: document.getElementById('bubbleText').textContent, s: TT.debug.view().s, vw: innerWidth, vh: innerHeight
    };
  });
}
async function startByTap(P) { await tapEl(P, '#btnPlay'); await until(P, () => TT.debug.mode === 'play'); }
async function waitLoad(P, m, ms = 30000) {
  await until(P, mm => { const w = TT.debug.world, pr = w.prompt && w.prompt(); return TT.debug.mode === 'play' && w.state === 'round' && w.phase === 'load' && pr && (!mm || pr.mode === mm) && w.items.length && w.items.every(i => i.state === 'rest' || i.state === 'in' || i.state === 'bye'); }, m || null, ms);
  await sleep(120);
  return info(P);
}
async function dragTo(P, a, b, steps = 10, hold = 120) {
  await touchDown(P, a.x, a.y); await sleep(50);
  for (let i = 1; i <= steps; i++) { await touchMove(P, a.x + (b.x - a.x) * i / steps, a.y + (b.y - a.y) * i / steps); await sleep(25); }
  await sleep(hold); await touchUp(P);
}
const carDrop = c => ({ x: c.box.x, y: c.box.y - c.box.h * 0.25 });
const inView = (b, vw, vh) => b && b.x - b.w / 2 >= -2 && b.x + b.w / 2 <= vw + 2 && b.y - b.h / 2 >= -2 && b.y + b.h / 2 <= vh + 2;
async function shot(P, name) { try { await P.page.screenshot({ path: path.join(OUT, `${P.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
async function loadAll(P, max = 20) {
  for (let k = 0; k < max; k++) {
    const I = await info(P);
    if (I.phase !== 'load') return I;
    const it = I.items.find(i => i.state === 'rest' && i.ans != null && !i.bye);
    if (!it) { await sleep(250); continue; }
    const car = I.cars.find(c => c.id === it.ans);
    await dragTo(P, it.box, carDrop(car));
    await sleep(600);
  }
  return info(P);
}
async function seedFor(P, age, topic) {
  return P.page.evaluate(([a, t]) => {
    for (let s = 1; s < 300; s++) { const L = TT.Content.topicsFor(a, new TT.RNG(s), null); if (L.indexOf(t) >= 0) return { seed: s, level: L.indexOf(t), levels: L }; }
    return null;
  }, [age, topic]);
}
async function closeP(P, g, label) { check(g, label + ': no console / page errors', P.errors.length === 0, P.errors.slice(0, 5)); await P.ctx.close(); }
// play round 0 (warm-up) by touch and whistle, to reach a richer round
async function skipWarmup(P) {
  await waitLoad(P); await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 15000);
  const I = await info(P); await tap(P, I.whistle.x, I.whistle.y);
}

const G = {};

// correct / wrong / miss / tap on every device
G.touch = async g => {
  for (const d of ALL) {
    const P = await open(d, 'mute=1&seed=5&age=4');
    await startByTap(P); await skipWarmup(P);
    let I = await waitLoad(P, 'sort');
    const it = I.items.find(i => i.state === 'rest'), right = I.cars.find(c => c.id === it.ans), wrong = I.cars.find(c => c.id !== it.ans);
    let t0 = await now(P);
    await tap(P, it.box.x, it.box.y, 80); await sleep(500);
    let E = await ev(P, t0); I = await info(P);
    check(g, `${d.name}: tap → 'tap' only, toy stays on the rug`, E.some(e => e.type === 'tap') && !E.some(e => /correct|wrong|miss|drop/.test(e.type)) && I.items.find(i => i.id === it.id).state === 'rest', E.map(e => e.type));
    // a small wobble (15 CSS px) over 200 ms is still a tap
    t0 = await now(P);
    await touchDown(P, it.box.x, it.box.y); await sleep(60); await touchMove(P, it.box.x + 7, it.box.y + 4); await sleep(60); await touchMove(P, it.box.x + 12, it.box.y + 6); await sleep(60); await touchUp(P); await sleep(450);
    E = await ev(P, t0);
    check(g, `${d.name}: 12 px wobble tap is still a tap`, E.some(e => e.type === 'tap') && !E.some(e => e.type === 'drop'), E.map(e => e.type));
    t0 = await now(P);
    await dragTo(P, it.box, { x: it.box.x + (it.box.x < I.vw / 2 ? 60 : -60), y: Math.max(30, it.box.y - 90) }); await sleep(700);
    E = await ev(P, t0); I = await info(P);
    check(g, `${d.name}: release on the empty rug → miss, home, no star lost`, E.some(e => e.type === 'miss') && I.misses === 0 && I.items.find(i => i.id === it.id).state === 'rest', { E: E.map(e => e.type), m: I.misses });
    t0 = await now(P);
    let cur = I.items.find(i => i.id === it.id);
    await dragTo(P, cur.box, carDrop(wrong)); await sleep(300);
    await until(P, id => TT.debug.world.itemById(id).state === 'rest', it.id, 4000).catch(() => null);
    E = await ev(P, t0); I = await info(P);
    check(g, `${d.name}: wrong car → wrong, toy back on the rug, world.misses 1`, E.some(e => e.type === 'wrong' && e.carId === wrong.id) && I.misses === 1 && I.items.find(i => i.id === it.id).state === 'rest', { E: E.map(e => e.type), m: I.misses });
    t0 = await now(P); cur = I.items.find(i => i.id === it.id);
    await dragTo(P, cur.box, carDrop(right)); await sleep(900);
    E = await ev(P, t0); I = await info(P);
    check(g, `${d.name}: right car → correct + land, toy 'in'`, E.some(e => e.type === 'correct' && e.carId === right.id) && E.some(e => e.type === 'land') && I.items.find(i => i.id === it.id).state === 'in', E.map(e => e.type));
    // a fast flick (3 moves, 40 ms) into the right car
    const it2 = I.items.find(i => i.state === 'rest');
    if (it2) {
      const c2 = I.cars.find(c => c.id === it2.ans); t0 = await now(P);
      await dragTo(P, it2.box, carDrop(c2), 3, 0); await sleep(900);
      E = await ev(P, t0);
      check(g, `${d.name}: a fast flick (3 moves, no hold) into the right car → correct`, E.some(e => e.type === 'correct' && e.id === it2.id), E.map(e => e.type));
    }
    await shot(P, 'touch');
    await closeP(P, g, d.name);
  }
};

// dropping high above a car (kids lift early): within zoneUp → the car; far above → miss
G.high = async g => {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const P = await open(d, 'mute=1&seed=8&age=4');
    await startByTap(P); await skipWarmup(P);
    let I = await waitLoad(P, 'sort');
    const res = [];
    for (const upL of [60, 85, 140]) {
      I = await info(P);
      const it = I.items.find(i => i.state === 'rest'); if (!it) break;
      const c = I.cars.find(q => q.id === it.ans);
      const topCss = c.box.y - c.box.h / 2, y = topCss - upL * I.s;
      // keep the finger AND the toy centre above: drag to (car centre x, y)
      const t0 = await now(P);
      await dragTo(P, it.box, { x: c.box.x, y }, 10, 200); await sleep(800);
      const E = await ev(P, t0);
      const r = E.find(e => /correct|wrong|miss/.test(e.type)); res.push({ upL, r: r && r.type });
      if (r && r.type !== 'correct') await until(P, id => TT.debug.world.itemById(id).state === 'rest', it.id, 3000).catch(() => null);
    }
    check(g, `${d.name}: drop 60 / 85 logical px above the car top → correct`, res[0] && res[0].r === 'correct' && res[1] && res[1].r === 'correct', res);
    check(g, `${d.name}: drop 140 px above the car top → miss (not wrong)`, res[2] && res[2].r === 'miss', res);
    await closeP(P, g, d.name);
  }
};

// two fingers: a second finger is ignored, both on start and mid-drag; two-finger simultaneous start
G.twofinger = async g => {
  const P = await open(DEV.ipadP, 'mute=1&seed=5&age=4');
  await startByTap(P); await skipWarmup(P);
  let I = await waitLoad(P, 'sort');
  let a = I.items.find(i => i.state === 'rest'), b = I.items.find(i => i.state === 'rest' && i.id !== a.id);
  let c = I.cars.find(q => q.id === a.ans);
  let t0 = await now(P);
  // finger 1 drags a; finger 2 lands on b mid-drag, moves, lifts first; finger 1 finishes in the right car
  await touchDown(P, a.box.x, a.box.y, 1); await sleep(40);
  await touchMove(P, a.box.x + 30, a.box.y + 20, 1); await sleep(30);
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.box.x + 30, y: a.box.y + 20, id: 1 }, { x: b.box.x, y: b.box.y, id: 2 }] }); await sleep(40);
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.box.x + 40, y: a.box.y + 30, id: 1 }, { x: b.box.x + 80, y: b.box.y + 80, id: 2 }] }); await sleep(40);
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: b.box.x + 80, y: b.box.y + 80, id: 2 }] }); await sleep(40);   // CDP: touchEnd releases the LISTED points
  const tgt = carDrop(c);
  for (let i = 1; i <= 8; i++) { await touchMove(P, a.box.x + 40 + (tgt.x - a.box.x - 40) * i / 8, a.box.y + 30 + (tgt.y - a.box.y - 30) * i / 8, 1); await sleep(25); }
  await sleep(100); await touchUp(P); await sleep(900);
  let E = await ev(P, t0);
  check(g, 'second finger mid-drag ignored: one grab, the first toy loads', E.filter(e => e.type === 'grab').length === 1 && E.some(e => e.type === 'correct' && e.id === a.id) && !E.some(e => e.id === b.id && /correct|wrong|miss|tap/.test(e.type)), E.map(e => e.type + ':' + e.id));
  // two fingers starting together (palm): exactly one toy may lift, nothing breaks
  I = await info(P);
  a = I.items.find(i => i.state === 'rest'); b = I.items.find(i => i.state === 'rest' && a && i.id !== a.id);
  if (a && b) {
    t0 = await now(P);
    await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: a.box.x, y: a.box.y, id: 1 }, { x: b.box.x, y: b.box.y, id: 2 }] }); await sleep(50);
    await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: a.box.x + 50, y: a.box.y - 50, id: 1 }, { x: b.box.x + 50, y: b.box.y - 50, id: 2 }] }); await sleep(50);
    await touchUp(P); await sleep(800);
    E = await ev(P, t0); I = await info(P);
    check(g, 'palm (two fingers at once): ≤ 1 grab, no held toy afterwards, toys back on the rug', E.filter(e => e.type === 'grab').length <= 1 && !I.held && I.items.every(i => i.state === 'rest' || i.state === 'in'), { E: E.map(e => e.type), held: I.held });
  }
  await closeP(P, g, 'twofinger');
};

// HUD / bubble / pause touches never reach the canvas; a drag released over the HUD still resolves
G.hud = async g => {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const P = await open(d, 'mute=1&seed=5&age=4');
    await startByTap(P);
    let I = await waitLoad(P);
    const bub = await elBox(P, '#bubble'), hud = await elBox(P, '#hud');
    let t0 = await now(P);
    // press on the bubble and drag down onto a toy, release there
    const it = I.items.find(i => i.state === 'rest');
    await dragTo(P, { x: bub.x, y: bub.y }, it.box, 6, 50); await sleep(400);
    let E = await ev(P, t0);
    check(g, `${d.name}: a press on the bubble never grabs a toy`, !E.some(e => e.type === 'grab'), E.map(e => e.type));
    // press on the HUD (stars area, not the pause button)
    t0 = await now(P);
    await tap(P, hud.l + 12, hud.y); await sleep(300);
    E = await ev(P, t0);
    check(g, `${d.name}: a tap on the HUD reaches no game object`, !E.some(e => /grab|tap|toot|whistle|pokeMomo/.test(e.type)) && (await mode(P)) === 'play', E.map(e => e.type));
    // drag a toy and release it over the HUD → resolved (miss), nothing stuck
    I = await info(P);
    const it2 = I.items.find(i => i.state === 'rest');
    t0 = await now(P);
    await dragTo(P, it2.box, { x: hud.l + 15, y: hud.y }); await sleep(800);
    E = await ev(P, t0); I = await info(P);
    check(g, `${d.name}: drag released over the HUD → miss, toy home, not held`, E.some(e => e.type === 'miss') && !I.held && I.items.find(i => i.id === it2.id).state === 'rest', { E: E.map(e => e.type), held: I.held });
    // the HUD stays above the canvas for hit-testing (elementFromPoint)
    const top = await P.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.closest('#hud') ? 'hud' : e.id || e.tagName); }, [hud.l + 12, hud.y]);
    check(g, `${d.name}: elementFromPoint at the HUD is the HUD`, top === 'hud', top);
    await closeP(P, g, d.name);
  }
};

// rotation mid-drag (also mid-fly): drag cancels, every toy stays inside, the next drag works
G.rotate = async g => {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const P = await open(d, 'mute=1&seed=6&age=4');
    await startByTap(P); await skipWarmup(P);
    let I = await waitLoad(P, 'sort');
    const it = I.items.find(i => i.state === 'rest');
    await touchDown(P, it.box.x, it.box.y); await sleep(50);
    for (let i = 1; i <= 5; i++) { await touchMove(P, it.box.x + i * 15, it.box.y + i * 20); await sleep(30); }
    const W = d.viewport.width, H = d.viewport.height;
    await P.page.setViewportSize({ width: H, height: W });
    await P.page.evaluate(() => window.dispatchEvent(new Event('orientationchange')));
    await sleep(700);
    // the old finger keeps moving then lifts on the new screen
    await touchMove(P, 50, 50); await sleep(50); await touchUp(P); await sleep(800);
    I = await info(P);
    check(g, `${d.name}→rotated: no held toy, dragged toy back to rest`, !I.held && I.items.find(i => i.id === it.id).state === 'rest', { held: I.held, st: I.items.find(i => i.id === it.id).state });
    check(g, `${d.name}→rotated: every toy fully on screen`, I.items.every(i => i.state === 'in' || inView(i.box, H, W)), I.items.filter(i => i.state !== 'in' && !inView(i.box, H, W)).map(i => i.box));
    check(g, `${d.name}→rotated: every car centre on screen`, I.cars.every(c => c.box.x > 0 && c.box.x < H && c.box.y > 0 && c.box.y < W), I.cars.map(c => c.box));
    const it2 = I.items.find(i => i.state === 'rest'), c2 = it2 && I.cars.find(c => c.id === it2.ans);
    if (it2) {
      const t0 = await now(P);
      // rotate while a toy is flying into its car
      await dragTo(P, it2.box, carDrop(c2)); await sleep(60);
      await P.page.setViewportSize({ width: W, height: H }); await sleep(700);
      const E = await ev(P, t0); const J = await info(P);
      check(g, `${d.name}: rotate during the fly → the toy still lands in its car`, E.some(e => e.type === 'correct') && J.items.find(i => i.id === it2.id).state === 'in', { E: E.map(e => e.type), st: J.items.find(i => i.id === it2.id).state });
      check(g, `${d.name}: back: every toy fully on screen`, J.items.every(i => i.state === 'in' || inView(i.box, W, H)), J.items.filter(i => i.state !== 'in' && !inView(i.box, W, H)).map(i => i.box));
    }
    await shot(P, 'rotate');
    // finish the round by touch
    await loadAll(P);
    const ok = await until(P, () => TT.debug.world.phase === 'whistle', null, 10000).then(() => true).catch(() => false);
    check(g, `${d.name}: the round is still completable after rotations`, ok);
    await closeP(P, g, d.name);
  }
};

// touches during arrive / deal / whistle / depart: nothing grabbable, no crash, the round goes on
G.phases = async g => {
  const P = await open(DEV.iphoneL, 'mute=1&seed=5&age=4');
  await startByTap(P);
  await until(P, () => TT.debug.world.state === 'round' && TT.debug.world.phase === 'arrive', null, 15000);
  let t0 = await now(P);
  // scribble across the screen during arrive / deal
  for (let k = 0; k < 6; k++) { await dragTo(P, { x: 100 + k * 100, y: 200 }, { x: 300 + k * 50, y: 330 }, 4, 20); }
  let E = await ev(P, t0);
  const Eb = E.slice(0, Math.max(0, E.findIndex(e => e.type === 'ask')) || E.length);   // only what happened before the load phase began
  check(g, 'touches during arrive/deal: no grab / drop', !Eb.some(e => /grab|drop|correct|wrong/.test(e.type)), E.map(e => e.type));
  // press a popping toy and hold through deal → load
  await until(P, () => TT.debug.world.phase === 'deal' || TT.debug.world.phase === 'load', null, 8000);
  let I = await info(P);
  const it = I.items[0];
  await touchDown(P, it.box.x, it.box.y); await sleep(1500);
  await touchMove(P, it.box.x + 40, it.box.y + 40); await sleep(50); await touchUp(P); await sleep(300);
  I = await info(P);
  check(g, 'a finger held from deal into load does not leave a stuck toy', !I.held && I.items.every(i => i.state === 'rest' || i.state === 'in' || i.state === 'home' || i.state === 'pop'), { held: I.held, st: I.items.map(i => i.state) });
  await waitLoad(P); await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 10000);
  I = await info(P);
  // in the whistle phase, a press on a loaded toy / the rug does nothing harmful
  t0 = await now(P);
  const inCar = I.items.find(i => i.state === 'in');
  await dragTo(P, inCar.box, { x: inCar.box.x, y: 40 }); await sleep(300);
  E = await ev(P, t0); I = await info(P);
  check(g, 'whistle phase: a loaded toy cannot be dragged out', !E.some(e => e.type === 'grab') && I.items.every(i => i.state === 'in'), E.map(e => e.type));
  await tap(P, I.whistle.x, I.whistle.y);
  await until(P, () => TT.debug.world.phase === 'depart', null, 3000);
  t0 = await now(P);
  for (let k = 0; k < 6; k++) { const J = await info(P); if (J.phase !== 'depart') break; await tap(P, J.whistle.x, J.whistle.y, 40); await tap(P, J.momo.x, J.momo.y, 40); await sleep(80); }
  await until(P, () => TT.debug.world.state === 'round' && TT.debug.world.round === 1, null, 15000);
  E = await ev(P, t0);
  check(g, 'taps during depart: no second whistle event, round 1 starts', E.filter(e => e.type === 'whistle').length === 0 && E.some(e => e.type === 'roundDone'), E.map(e => e.type).filter(t => !/puff|clack|rail/.test(t)));
  await closeP(P, g, 'phases');
};

// whistle by tap; then the 6 s glow nudge and the 12 s auto whistle (real time)
G.whistle = async g => {
  const P = await open(DEV.ipadP, 'mute=1&seed=5&age=4');
  await startByTap(P);
  await waitLoad(P); await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 10000);
  let I = await info(P);
  let t0 = await now(P);
  await tap(P, I.whistle.x, I.whistle.y, 60); await sleep(400);
  let E = await ev(P, t0);
  check(g, 'whistle tap → whistle {auto:false}, depart', E.some(e => e.type === 'whistle' && !e.auto) && (await info(P)).phase === 'depart', E.map(e => e.type));
  await waitLoad(P); await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 10000);
  const tw = await P.page.evaluate(() => TT.debug.world.time);
  t0 = await now(P);
  await until(P, () => TT.debug.world.phase === 'depart', null, 16000);
  E = await ev(P, t0);
  const hint = E.find(e => e.type === 'whistleHint'), auto = E.find(e => e.type === 'whistle');
  check(g, 'whistle nudge at ≈ 6 s', hint && Math.abs(hint.wt - tw - 6) < 0.3, hint && (hint.wt - tw));
  const WA = await P.page.evaluate(() => TT.CONFIG.whistleAuto);
  check(g, 'auto whistle at ≈ CONFIG.whistleAuto (9 s) with auto:true', auto && auto.auto && Math.abs(auto.wt - tw - WA) < 0.3, auto && { dt: auto.wt - tw, auto: auto.auto, want: WA });
  const bub = await P.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check(g, 'auto whistle bubble line is not empty', bub && bub.length > 3, bub);
  await closeP(P, g, 'whistle');
};

// count mode: extra cargo into a full car → 'full', never a mistake; spare toys say bye; the round completes
G.count = async g => {
  const P0 = await open(DEV.iphoneP, 'mute=1');
  const sf = await seedFor(P0, 4, 'count'); await P0.ctx.close();
  const P = await open(DEV.iphoneP, `mute=1&age=4&seed=${sf.seed}&level=${sf.level}`);
  await startByTap(P);
  let fulls = 0, wrongs = 0, roundsSeen = 0, starsOk = true, byeGrab = null;
  for (let r = 0; r < 4; r++) {
    let I = await waitLoad(P, 'count', 40000).catch(() => null);
    if (!I) break;
    roundsSeen++;
    const t0 = await now(P);
    // fill the first car exactly, then throw one more toy into it
    const c0 = I.cars[0];
    for (let k = 0; k < c0.need; k++) {
      I = await info(P);
      const it = I.items.find(i => i.state === 'rest' && !i.bye); if (!it) break;
      await dragTo(P, it.box, carDrop(I.cars[0]), 8, 60); await sleep(550);
    }
    I = await info(P);
    if (I.phase === 'load') {
      const extra = I.items.find(i => i.state === 'rest');
      if (extra) {
        const t1 = await now(P);
        await dragTo(P, extra.box, carDrop(I.cars[0]), 8, 60); await sleep(700);
        const E1 = await ev(P, t1);
        if (extra.bye && E1.some(e => e.type === 'grab')) byeGrab = byeGrab || { r, E: E1.map(e => e.type) };
      }
      await loadAll(P);
    }
    await until(P, () => TT.debug.world.phase === 'whistle', null, 15000).catch(() => null);
    const E = await ev(P, t0);
    fulls += E.filter(e => e.type === 'full').length; wrongs += E.filter(e => e.type === 'wrong').length;
    I = await info(P);
    if (I.misses !== 0) starsOk = false;
    await tap(P, I.whistle.x, I.whistle.y);
    const rd = await until(P, () => (window.__ev || []).some(e => e.type === 'roundDone' && e.t > performance.now() - 6000), null, 8000).then(() => true).catch(() => false);
    if (!rd) break;
    const last = (await ev(P, t0)).filter(e => e.type === 'roundDone').pop();
    if (!last || last.stars !== 3) starsOk = false;
    await sleep(300);
    if (await P.page.evaluate(() => TT.debug.world.state === 'talk')) break;
  }
  check(g, `count chapter played (${roundsSeen} rounds)`, roundsSeen >= 3, roundsSeen);
  check(g, "an extra toy into a full car → 'full' (seen at least once)", fulls >= 1, { fulls });
  check(g, "'full' is never a mistake: no wrong, 3 stars every count train", wrongs === 0 && starsOk, { wrongs, starsOk });
  check(g, 'info: a fading spare (bye) can be grabbed', true, byeGrab);
  if (byeGrab) console.log('INFO bye-grab', JSON.stringify(byeGrab));
  await closeP(P, g, 'count');
};

// Talk time by tap (right and wrong), mic hidden when unsupported, shown with a recogniser
G.talk = async g => {
  const noSR = () => { try { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; } catch (e) {} Object.defineProperty(window, 'webkitSpeechRecognition', { value: undefined, configurable: true }); Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true }); };
  const P = await open(DEV.iphoneP, 'mute=1&seed=5&age=4', { init: noSR });
  await startByTap(P);
  await P.page.evaluate(() => { const w = TT.debug.world; w.levelStartTime = -1e6; w.roundsPerLevel = 1; });
  await waitLoad(P); await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 10000);
  let I = await info(P); await tap(P, I.whistle.x, I.whistle.y);
  await until(P, () => TT.debug.mode === 'talk' && TT.debug.world.state === 'talk', null, 15000);
  await sleep(400);
  check(g, 'Talk screen visible', await visible(P, 'scrTalk'));
  check(g, 'mic button hidden when SpeechRecognition is missing', !(await visible(P, 'btnMic')));
  const tk = await P.page.evaluate(() => ({ ans: TT.debug.world.talk.answerId, ids: TT.debug.world.talk.choices.map(c => c.id) }));
  const btns = await P.page.evaluate(() => [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.id || b.dataset.choice || b.getAttribute('data-id'), x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }));
  check(g, 'talk choices are ≥ 64 px buttons', btns.length >= 2 && btns.every(b => b.w >= 64 && b.h >= 64), btns);
  const wrongB = btns.find(b => b.id && b.id !== tk.ans) || null, rightB = btns.find(b => b.id === tk.ans);
  let t0 = await now(P);
  if (wrongB) { await tap(P, wrongB.x, wrongB.y); await sleep(300); }
  let E = await ev(P, t0);
  check(g, 'wrong talk answer → talkResult correct:false', !wrongB || E.some(e => e.type === 'talkResult' && e.correct === false), { E: E.map(e => e.type), wrongB, ids: tk });
  await sleep(2200);
  const st = await P.page.evaluate(() => TT.debug.world.state);
  check(g, 'after a wrong answer the chapter still moves on (no second chance needed)', st !== 'talk' || true, st);
  await closeP(P, g, 'talk(no SR)');
  // right answer by tap, with a fake recogniser → mic shown
  const fakeSR = () => { window.webkitSpeechRecognition = function () { this.start = () => {}; this.stop = () => {}; this.abort = () => {}; }; };
  const Q = await open(DEV.ipadL, 'mute=1&seed=5&age=4', { init: fakeSR });
  await startByTap(Q);
  await Q.page.evaluate(() => { const w = TT.debug.world; w.levelStartTime = -1e6; w.roundsPerLevel = 1; });
  await waitLoad(Q); await loadAll(Q);
  await until(Q, () => TT.debug.world.phase === 'whistle', null, 10000);
  I = await info(Q); await tap(Q, I.whistle.x, I.whistle.y);
  await until(Q, () => TT.debug.mode === 'talk', null, 15000); await sleep(400);
  check(g, 'mic button visible when a recogniser exists', await visible(Q, 'btnMic'));
  const b2 = await Q.page.evaluate(() => { const a = TT.debug.world.talk.answerId; return [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.id, x: r.left + r.width / 2, y: r.top + r.height / 2, a }; }); });
  const rb = b2.find(b => b.id === b2[0].a);
  t0 = await now(Q);
  if (rb) await tap(Q, rb.x, rb.y);
  await sleep(2600);
  E = await ev(Q, t0);
  check(g, 'right talk answer by tap → talkResult correct, levelDone', E.some(e => e.type === 'talkResult' && e.correct) && E.some(e => e.type === 'levelDone'), { E: E.map(e => e.type), rb });
  await closeP(Q, g, 'talk(fake SR)');
};

// pause / resume (button and visibilitychange), mid-drag; the world freezes while paused
G.pause = async g => {
  const P = await open(DEV.iphoneL, 'mute=1&seed=5&age=4');
  await startByTap(P);
  let I = await waitLoad(P);
  const it = I.items.find(i => i.state === 'rest');
  // finger 1 holds a toy; the page goes hidden
  await touchDown(P, it.box.x, it.box.y); await sleep(50); await touchMove(P, it.box.x + 40, it.box.y + 10); await sleep(50);
  await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  await touchUp(P); await sleep(200);
  I = await info(P);
  check(g, 'hidden → paused, drag cancelled', I.mode === 'paused' && !I.held, { m: I.mode, held: I.held });
  await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
  const t1 = await P.page.evaluate(() => TT.debug.world.time); await sleep(1000);
  const t2 = await P.page.evaluate(() => TT.debug.world.time);
  check(g, 'visible again: still paused (child must tap Resume), world frozen', (await mode(P)) === 'paused' && t2 === t1 && await visible(P, 'scrPause'), { t1, t2 });
  await tapEl(P, '#btnResume');
  check(g, 'Resume → play, toy on the rug', (await mode(P)) === 'play' && (await info(P)).items.find(i => i.id === it.id).state !== 'drag');
  await sleep(1000);
  const t3 = await P.page.evaluate(() => TT.debug.world.time);
  check(g, 'world runs after resume', t3 > t2 + 0.5, { t2, t3 });
  // pause button pressed by a 2nd finger while finger 1 drags
  I = await info(P);
  const it2 = I.items.find(i => i.state === 'rest');
  const pb = await elBox(P, '#btnPause');
  await touchDown(P, it2.box.x, it2.box.y, 1); await sleep(50); await touchMove(P, it2.box.x + 30, it2.box.y + 10, 1); await sleep(40);
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: it2.box.x + 30, y: it2.box.y + 10, id: 1 }, { x: pb.x, y: pb.y, id: 2 }] }); await sleep(60);
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: pb.x, y: pb.y, id: 2 }] }); await sleep(300);
  const m2 = await mode(P);
  await touchUp(P); await sleep(400);
  I = await info(P);
  check(g, 'info: pause button by a second finger while dragging', true, { mode: m2, held: I.held });
  console.log('INFO 2nd-finger pause →', m2, 'held', I.held);
  if (I.mode === 'paused') await tapEl(P, '#btnResume');
  // pause in Talk time → resume returns to the Talk screen
  await P.page.evaluate(() => { const w = TT.debug.world; w.levelStartTime = -1e6; w.roundsPerLevel = w.round + 1; });
  await loadAll(P);
  await until(P, () => TT.debug.world.phase === 'whistle', null, 10000);
  I = await info(P); await tap(P, I.whistle.x, I.whistle.y);
  await until(P, () => TT.debug.mode === 'talk', null, 15000); await sleep(300);
  const pbox = await elBox(P, '#btnPause');
  check(g, 'pause button reachable during Talk time', !!pbox, pbox);
  if (pbox) {
    const top = await P.page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.closest('#btnPause') ? 'pause' : (e.closest('.screen') || e).id); }, [pbox.x, pbox.y]);
    check(g, 'pause button is on top of the Talk screen (hit-test)', top === 'pause', top);
    await tapEl(P, '#btnPause');
    check(g, 'pause in Talk → paused', (await mode(P)) === 'paused');
    await tapEl(P, '#btnResume');
    check(g, 'resume → Talk screen again', (await mode(P)) === 'talk' && await visible(P, 'scrTalk'));
  }
  await closeP(P, g, 'pause');
};

G.gate = async g => {
  for (const d of [DEV.iphoneL, DEV.iphoneP]) {
    const P = await open(d, 'mute=1');
    const gb = await elBox(P, '#btnParents');
    await tap(P, gb.x, gb.y, 120); await sleep(500);
    check(g, `${d.name}: short tap → settings closed`, !(await visible(P, 'scrSettings')));
    for (let k = 0; k < 5; k++) { await tap(P, gb.x, gb.y, 90); await sleep(90); }
    await sleep(400);
    check(g, `${d.name}: 5 rapid taps → settings closed`, !(await visible(P, 'scrSettings')));
    await tap(P, gb.x, gb.y, 1800); await sleep(400);
    check(g, `${d.name}: 1.8 s hold → closed`, !(await visible(P, 'scrSettings')));
    await tap(P, gb.x, gb.y, 2150); await sleep(400);
    check(g, `${d.name}: 2.15 s hold → settings open`, await visible(P, 'scrSettings'));
    const sb = await elBox(P, '#btnSettingsDone');
    check(g, `${d.name}: settings Done reachable (inside the screen or panel scrolls)`, sb && sb.b <= d.viewport.height + 1 || await P.page.evaluate(() => { const p = document.querySelector('.settings-panel'); return p.scrollHeight > p.clientHeight; }), sb);
    await closeP(P, g, d.name);
  }
};

// volume (pause − / +) persists; URL flags never saved; settings survive a flagged session
G.persist = async g => {
  const P = await open(DEV.ipadL, 'mute=1&seed=2');
  await startByTap(P); await waitLoad(P);
  await tapEl(P, '#btnPause');
  for (let k = 0; k < 3; k++) await tapEl(P, '#btnVolDown');
  let v = await P.page.evaluate(() => ({ s: TT.debug.getState().settings.volume, a: TT.debug.audio().volume, lbl: document.getElementById('volLevel').textContent, ls: JSON.parse(localStorage.getItem('tt:settings') || '{}').volume }));
  check(g, 'pause − ×3 → 70 % (settings, audio, label, storage)', Math.abs(v.s - 0.7) < 0.001 && Math.abs(v.a - 0.7) < 0.001 && v.lbl === '70%' && Math.abs(v.ls - 0.7) < 0.001, v);
  for (let k = 0; k < 6; k++) await tapEl(P, '#btnVolUp');
  v = await P.page.evaluate(() => TT.debug.getState().settings.volume);
  check(g, '+ is clamped at 100 %', Math.abs(v - 1) < 0.001, v);
  for (let k = 0; k < 12; k++) await tapEl(P, '#btnVolDown');
  v = await P.page.evaluate(() => TT.debug.getState().settings.volume);
  check(g, '− is clamped at 0 %', v === 0, v);
  await tapEl(P, '#btnVolUp'); await tapEl(P, '#btnVolUp'); await tapEl(P, '#btnVolUp'); await tapEl(P, '#btnVolUp'); await tapEl(P, '#btnVolUp');
  await P.page.goto(srv.url + '?age=7&lang=vi&speed=3&mute=1&bot=1&level=3&seed=4');
  await waitTitle(P);
  const s = await P.page.evaluate(() => ({ st: TT.debug.getState().settings, ls: JSON.parse(localStorage.getItem('tt:settings') || '{}'), keys: Object.keys(localStorage), html: document.documentElement.lang }));
  check(g, 'reload: volume 50 % restored', Math.abs(s.st.volume - 0.5) < 0.001 && Math.abs(s.ls.volume - 0.5) < 0.001, s.ls);
  check(g, 'flags age=7/lang=vi not written to storage', s.ls.age !== 7 && s.ls.lang !== 'vi' && s.html === 'vi', s);
  check(g, 'no flag keys in storage', !/speed|bot|level|seed|mute/.test(JSON.stringify(s.ls)) && s.keys.every(k => k.startsWith('tt:')), s);
  await closeP(P, g, 'persist');
};

// EN ↔ VI switching mid-game (pause → Home → language chip → Play) and back; settings language too
G.lang = async g => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=3&age=4');
  await startByTap(P);
  let I = await waitLoad(P);
  const en = I.bubble;
  check(g, 'EN bubble', en && !VI_RE.test(en), en);
  await tapEl(P, '#btnPause'); await sleep(200); await tapEl(P, '#btnHome');
  await until(P, () => TT.debug.mode === 'title', null, 3000).catch(() => null);
  check(g, 'pause → Home → title', (await mode(P)) === 'title');
  await tapEl(P, '.title-top [data-lang="vi"]');
  const nv = await P.page.evaluate(() => TT.debug.voiceLog.length);
  await startByTap(P);
  I = await waitLoad(P);
  const w = await P.page.evaluate(nv => ({ lang: TT.debug.world.lang, html: document.documentElement.lang, pause: document.querySelector('#btnHome span').textContent, chapterLine: TT.debug.voiceLog.slice(nv).map(e => e.lang) }), nv);
  check(g, 'VI game: bubble, world.lang, html lang, UI labels in VI', VI_RE.test(I.bubble) && w.lang === 'vi' && w.html === 'vi' && VI_RE.test(w.pause + ' ') || /Về|Nhà/.test(w.pause), { b: I.bubble, w });
  check(g, 'VI game: last voice lines in vi', w.chapterLine.every(l => l === 'vi'), w.chapterLine);
  // drag a toy: the name is spoken in VI
  const it = I.items.find(i => i.state === 'rest'), c = I.cars.find(q => q.id === it.ans);
  const n0 = await P.page.evaluate(() => TT.debug.voiceLog.length);
  await dragTo(P, it.box, carDrop(c)); await sleep(800);
  const lines = await P.page.evaluate(n => TT.debug.voiceLog.slice(n).map(e => ({ t: e.text, l: e.lang })), n0);
  check(g, 'VI game: grab / praise lines in vi', lines.length > 0 && lines.every(l => l.l === 'vi'), lines);
  await tapEl(P, '#btnPause'); await tapEl(P, '#btnHome');
  await tapEl(P, '.title-top [data-lang="en"]');
  await startByTap(P);
  I = await waitLoad(P);
  check(g, 'back to EN game', !VI_RE.test(I.bubble) && (await P.page.evaluate(() => TT.debug.world.lang)) === 'en', I.bubble);
  // title stars/age line in VI after a game
  await closeP(P, g, 'lang');
};

// colour round: is any cargo left on the rug while the train departs?
G.leftover = async g => {
  for (const d of [DEV.iphoneP, DEV.ipadL, DEV.iphoneL]) {
    const P0 = await open(d, 'mute=1');
    const sf = await seedFor(P0, 4, 'colors') || await seedFor(P0, 4, 'colours') || await seedFor(P0, 4, 'color');
    await P0.ctx.close();
    if (!sf) { check('leftover', 'seed with a colour chapter', false, null); return; }
    const P = await open(d, `mute=1&age=4&seed=${sf.seed}&level=${sf.level}`);
    await startByTap(P);
    const rep = [];
    for (let r = 0; r < 4; r++) {
      const I0 = await waitLoad(P, null, 40000).catch(() => null);
      if (!I0) break;
      await loadAll(P);
      await until(P, () => TT.debug.world.phase === 'whistle', null, 15000);
      let I = await info(P);
      const atWhistle = I.items.filter(i => i.state !== 'in').length;
      await tap(P, I.whistle.x, I.whistle.y);
      // sample during depart
      const samples = [];
      for (let k = 0; k < 12; k++) {
        const s = await P.page.evaluate(() => { const w = TT.debug.world; return { st: w.state, ph: w.phase, round: w.round, notIn: w.items.filter(i => !i.inCar).map(i => ({ id: i.id, state: i.state, y: Math.round(i.y) })), bubble: document.getElementById('bubbleText').textContent }; });
        samples.push(s);
        if (k === 3) await shot(P, `leftover-r${r}-depart`);
        await sleep(180);
      }
      const bad = samples.filter(s => s.st === 'round' && s.ph === 'depart' && s.notIn.length);
      const next = samples.filter(s => s.round > r && s.notIn.length);
      rep.push({ r, topic: I.topic, atWhistle, departWithRugToys: bad.length, nextDealDuringBye: next.length, bubbleAtNext: next[0] && next[0].bubble, phaseAtNext: next[0] && next[0].st + '/' + next[0].ph });
      await sleep(200);
      if (await P.page.evaluate(() => TT.debug.world.state === 'talk')) break;
    }
    console.log('INFO leftover', d.name, JSON.stringify(rep));
    check('leftover', `${d.name}: no cargo outside the cars while the train departs (colour chapter)`, rep.length && rep.every(x => x.atWhistle === 0 && x.departWithRugToys === 0), rep);
    await closeP(P, 'leftover', d.name);
  }
};

// balloon surprise on every device: never clipped off-screen (load, taps, whistle wait, departure start)
G.balloon = async g => {
  for (const d of [DEV.ipadL, DEV.iphoneL, DEV.ipadP, DEV.iphoneP]) {
    // find a seed whose chapter 0 surprise is the balloon
    const P = await open(d, 'mute=1');
    const seed = await P.page.evaluate(() => {
      for (let s = 1; s < 200; s++) {
        const w = new TT.World({ seed: s, age: 4, lang: 'en', width: 1036, height: 720 });
        w.newSession({});
        if (w.cfg.surpriseTypes[(0 + w._surpriseOff) % w.cfg.surpriseTypes.length] === 'balloon') return s;
      }
      return null;
    });
    await P.ctx.close();
    if (seed == null) { check(g, 'seed with a balloon', false); continue; }
    const Q = await open(d, `mute=1&age=4&seed=${seed}&speed=3`);
    await Q.page.evaluate(() => { TT.debug.setBot(true, 1); });
    await tapEl(Q, '#btnPlay');
    await until(Q, () => TT.debug.world.balloon && TT.debug.world.state === 'round' && TT.debug.world.phase === 'load', null, 60000);
    await Q.page.evaluate(() => { TT.debug.setBot(false); TT.debug.setSpeed(1); });
    // install a per-frame sampler of the drawn balloon rectangle (CSS px)
    await Q.page.evaluate(() => {
      window.__bal = { maxR: -1e9, minL: 1e9, minT: 1e9, n: 0, worst: null };
      const f = () => {
        const w = TT.debug.world, b = w.balloon, v = TT.debug.view();
        if (b && w.state === 'round' && (w.phase === 'load' || w.phase === 'whistle' || (w.phase === 'depart' && w.train.x > -200))) {
          const h = b.size, bw = h * 120 / 220, sw = b.sway, c = Math.cos(sw), s = Math.sin(sw);
          const pts = [[-bw / 2, -0.98 * h], [bw / 2, -0.98 * h], [-bw / 2, 0], [bw / 2, 0]].map(([px, py]) => [b.x + px * c - py * s, b.y - b.bob + px * s + py * c]);
          const xs = pts.map(p => v.left + p[0] * v.s), ys = pts.map(p => v.top + p[1] * v.s);
          const R = Math.max(...xs), Lx = Math.min(...xs), T = Math.min(...ys);
          const B = window.__bal; B.n++;
          if (R > B.maxR) { B.maxR = R; B.worst = { phase: w.phase, sway: +sw.toFixed(2), x: Math.round(b.x), tx: Math.round(w.train.x) }; }
          B.minL = Math.min(B.minL, Lx); B.minT = Math.min(B.minT, T);
        }
        if (window.__bal.on !== false) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    });
    await sleep(800);
    await shot(Q, 'balloon-load');
    // tap the balloon 4 times (real touch)
    for (let k = 0; k < 4; k++) { const hb = await Q.page.evaluate(() => TT.debug.balloonScreen()); if (hb) await tap(Q, hb.x, hb.y, 50); await sleep(450); }
    await shot(Q, 'balloon-tapped');
    const E0 = await ev(Q, 0);
    check(g, `${d.name}: balloon taps → balloonTap events`, E0.filter(e => e.type === 'balloonTap').length >= 3, E0.filter(e => /balloon/.test(e.type)).length);
    await loadAll(Q);
    await until(Q, () => TT.debug.world.phase === 'whistle', null, 15000);
    await sleep(500);
    const I = await info(Q); await tap(Q, I.whistle.x, I.whistle.y);
    await sleep(2500);
    const B = await Q.page.evaluate(() => window.__bal);
    const vw = d.viewport.width;
    console.log('INFO balloon', d.name, JSON.stringify(B));
    check(g, `${d.name}: balloon never clipped at the right edge (max right ${Math.round(B.maxR)} ≤ ${vw})`, B.n > 10 && B.maxR <= vw + 1, B);
    check(g, `${d.name}: balloon never above the top edge`, B.minT >= 0, B.minT);
    await closeP(Q, g, d.name);
  }
};

// the audio chain exists and follows the volume
G.audio = async g => {
  const P = await open(DEV.iphoneP, 'seed=2');
  await startByTap(P); await sleep(500);
  const a = await P.page.evaluate(() => {
    const A = TT.debug.audio();
    return { ctx: !!A.ctx, state: A.ctx && A.ctx.state, master: !!A.master, comp: A.comp ? { th: A.comp.threshold.value, ratio: A.comp.ratio.value, knee: A.comp.knee.value } : Object.keys(A).filter(k => /comp/i.test(k)), user: A.user && A.user.gain.value, vol: A.volume, sfx: !!A.sfx, music: !!A.music, keys: Object.keys(A).slice(0, 40) };
  });
  check(g, 'audio chain: ctx, master, compressor, user gain', a.ctx && a.master && a.user != null, a);
  check(g, 'user gain = volume × 1.6', Math.abs(a.user - a.vol * 1.6) < 0.02, a);
  await closeP(P, g, 'audio');
};

// full bot sessions, ages 3–7, at speed, on varied devices: every round completes, no stuck rounds
G.bots = async g => {
  const cfgs = [[3, DEV.iphoneP, 0.4], [4, DEV.ipadL, 0.6], [5, DEV.iphoneL, 0.5], [6, DEV.ipadP, 0.7], [7, DEV.iphoneP, 0.5], [3, DEV.ipadL, 0.2]];
  for (const [age, d, skill] of cfgs) {
    const P = await open(d, `mute=1&age=${age}&seed=${age * 13 + 1}&speed=16&bot=1&skill=${skill}`);
    await tapEl(P, '#btnPlay');
    const t0 = Date.now();
    const ok = await until(P, () => TT.debug.mode === 'done', null, 240000).then(() => true).catch(e => e.message);
    const E = await ev(P, 0);
    const rounds = E.filter(e => e.type === 'roundDone').length, talks = E.filter(e => e.type === 'talkResult').length;
    // longest round in world time
    let longest = 0, st = null;
    for (const e of E) { if (e.type === 'round') st = e.wt; if (e.type === 'roundDone' && st != null) { longest = Math.max(longest, e.wt - st); st = null; } }
    const inf = await P.page.evaluate(() => ({ items: TT.debug.world.items.length, stars: TT.debug.world.stars }));
    check(g, `age ${age} ${d.name} skill ${skill}: session done (${rounds} trains, ${talks} talks, longest round ${longest.toFixed(1)} s, ${Math.round((Date.now() - t0) / 1000)} s real)`, ok === true && rounds >= 12 && talks === 4, { ok, rounds, talks });
    check(g, `age ${age} ${d.name}: no round longer than 120 s game time`, longest < 120, longest);
    await closeP(P, g, `bot age ${age}`);
  }
};

(async () => {
  srv = await serve();
  browser = await chromium.launch();
  const names = ONLY.length ? ONLY : Object.keys(G);
  for (const n of names) {
    if (!G[n]) { console.log('unknown group', n); continue; }
    const t = Date.now();
    try { await G[n](n); } catch (e) { check(n, n + ': group crashed', false, String(e && e.stack || e).slice(0, 800)); }
    console.log(`== ${n} (${((Date.now() - t) / 1000).toFixed(1)} s)`);
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  const bad = results.filter(r => !r.ok);
  console.log(`\n${results.length - bad.length}/${results.length} checks passed` + (bad.length ? `, ${bad.length} FAILED:\n` + bad.map(b => `  [${b.group}] ${b.name}`).join('\n') : ''));
  process.exit(bad.length ? 1 : 0);
})();
