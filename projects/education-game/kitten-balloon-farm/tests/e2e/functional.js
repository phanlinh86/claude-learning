// Functional QA suite for Kitten's Balloon Farm — REAL touch input on iPhone/iPad-sized mobile contexts.
//   node tests/e2e/functional.js                 (all groups)
//   node tests/e2e/functional.js tap count ask   (only some groups)
// Groups: boot lang gate settings tap stars count ask multi repeat talk pause rotate hud bot
// Prints PASS/FAIL per check + a summary table, writes tests/out/functional/results.json (+ screenshots on failure),
// exits 1 on any FAIL. Env: KB_GAME_ROOT=<dir> tests another build of game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');

const OUT = path.join(__dirname, '..', 'out', 'functional'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ALL = [DEV.iphoneP, DEV.iphoneL, DEV.ipadP, DEV.ipadL];
const ONLY = process.argv.slice(2);
const want = g => !ONLY.length || ONLY.includes(g);

const results = [];
let curGroup = '';
function check(name, ok, info) {
  results.push({ group: curGroup, name, ok: !!ok, info: info == null ? '' : info });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 600)));
  return !!ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

function badText(s) {
  if (s == null) return null;
  s = String(s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|chapter)\.[a-zA-Z]/.test(s)) return 'raw i18n key';
  return null;
}

let srv, browser;
async function open(dev, q = '', opt = {}) {
  const ctx = opt.ctx || await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.goto(srv.url + (q ? '?' + q : ''));
  await waitTitle(page);
  await installEv(page);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, errors, cdp, dev, close: () => (opt.ctx ? page.close() : ctx.close()) };
}
async function waitTitle(page) {
  await page.waitForFunction(() => window.KB && KB.debug && KB.debug.mode === 'title', null, { timeout: 15000 });
}
/* Record every world event (with a timestamp) and count world.pointerDown calls (to prove HUD/menu taps never reach it). */
async function installEv(page) {
  await page.evaluate(() => {
    window.__ev = []; window.__downs = 0;
    const w = KB.debug.world;
    if (w.__hooked) return;
    w.__hooked = true;
    const o = w._emit;
    w._emit = function (e) {
      window.__ev.push(Object.assign({ at: performance.now(), wt: this.time }, e));
      if (e.type === 'talk' && window.__stopBotOnTalk) KB.debug.setBot(false);
      return o.call(this, e);
    };
    const pd = w.pointerDown;
    w.pointerDown = function (x, y) { window.__downs++; return pd.call(this, x, y); };
  });
}
const evOf = (page, t) => page.evaluate(t => window.__ev.filter(e => e.type === t).map(e => { const o = Object.assign({}, e); delete o.talk; return o; }), t);
const clearEv = page => page.evaluate(() => { window.__ev = []; });
const mode = page => page.evaluate(() => KB.debug.mode);
const downs = page => page.evaluate(() => window.__downs);
const voiceN = page => page.evaluate(() => KB.debug.voiceLog.length);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
async function shot(c, name) { try { await c.page.screenshot({ path: path.join(OUT, `${c.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }

/* Live balloons with their screen position (CSS px) and whether a tap on them is right now. */
const balloons = page => page.evaluate(() => {
  const w = KB.debug.world, m = w.cur && w.cur.mode;
  return w.balloons.map(b => {
    const s = KB.debug.balloonScreen(b.id);
    return { id: b.id, state: b.state, popT: b.popT, cool: b.cool, tap: w.canTap(b), right: m === 'count' ? true : m === 'ask' ? b.id === w.target : !!b.answer,
      nameValue: b.nameValue, x: b.x, y: b.y, hx: b.hx, hy: b.hy, size: b.size, sx: s.x, sy: s.y, r: s.r };
  });
});
async function waitInteractive(page, timeout = 20000) {
  await page.waitForFunction(() => { const w = KB.debug.world; return KB.debug.mode === 'play' && w.state === 'round' && w.interactive && !w.solved && w.balloons.some(b => w.canTap(b)); }, null, { timeout });
  await sleep(120);
}
async function waitState(page, st, timeout = 20000) {
  await page.waitForFunction(st => KB.debug.world.state === st, st, { timeout });
}
/* A REAL touch tap at a balloon's current centre (balloons bob: re-read right before tapping). */
async function tapBalloon(c, id) {
  const p = await c.page.evaluate(id => KB.debug.balloonScreen(id), id);
  if (!p) throw new Error('no balloon ' + id);
  await c.page.touchscreen.tap(p.x, p.y);
  return p;
}
/* Pick a point on the empty sky far (> hit radius + 40 px) from every balloon and from Miu / the sign. */
const emptySky = page => page.evaluate(() => {
  const w = KB.debug.world, v = KB.debug.view(), L = w.layout, P = L.play;
  let best = null, bd = -1;
  for (let gx = 0; gx <= 10; gx++) for (let gy = 0; gy <= 8; gy++) {
    const x = P.x + P.w * gx / 10, y = P.y + P.h * gy / 8;
    if (x < L.sign.x + 140 && y > L.groundY - 340) continue;
    let d = 1e9;
    for (const b of w.balloons) if (b.state !== 'gone') d = Math.min(d, Math.hypot(b.x - x, b.y - y) - (0.6 * b.size + 14));
    if (d > bd) { bd = d; best = { x, y }; }
  }
  return best && { x: v.left + best.x * v.s, y: v.top + best.y * v.s, clear: bd };
});
const nanCheck = page => page.evaluate(() => {
  const w = KB.debug.world, bad = [];
  const fin = (o, ks, tag) => ks.forEach(k => { if (o[k] != null && !isFinite(o[k])) bad.push(tag + '.' + k + '=' + o[k]); });
  for (const b of w.balloons) { fin(b, ['x', 'y', 'rot', 'size', 'sx', 'sy', 'hx', 'hy', 'vx', 'vy'], 'b' + b.id); (b.string || []).forEach((p, i) => fin(p, ['x', 'y'], 'b' + b.id + 's' + i)); }
  for (const f of w.friends) fin(f, ['x', 'y', 'rot', 'sx', 'sy'], 'f' + f.id);
  fin(w.miu, ['lookX', 'lookY', 'hop'], 'miu');
  return bad;
});

/* ---------- CDP touch helpers ---------- */
async function touch(cdp, type, pts) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0, radiusX: 4, radiusY: 4, force: 1 })) });
}
async function elCenter(page, sel) {
  const bb = await page.locator(sel).first().boundingBox();
  if (!bb) throw new Error('no box for ' + sel);
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
}
async function tapEl(c, sel) { const p = await elCenter(c.page, sel); await c.page.touchscreen.tap(p.x, p.y); await sleep(80); }
async function startGame(c, speed = 1) {
  await c.page.evaluate(s => { KB.debug.setSpeed(s); KB.debug.startGame(); }, speed);
}

/* ======================================================================= groups */
async function gBoot() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=3');
    await sleep(700);
    const st = await c.page.evaluate(() => ({ mode: KB.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      loading: !document.getElementById('loading').classList.contains('hidden'), logo: document.querySelector('.logo').textContent.trim(),
      play: document.getElementById('btnPlay').getBoundingClientRect(), W: KB.debug.getState().W, H: KB.debug.getState().H, sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check(`boot/${d.name}: title shown, loader gone`, st.mode === 'title' && st.title && !st.loading, st);
    check(`boot/${d.name}: play button on screen & ≥ 60 px`, st.play.width >= 60 && st.play.left >= 0 && st.play.right <= d.viewport.width && st.play.bottom <= d.viewport.height, st.play);
    check(`boot/${d.name}: logical short side 720`, Math.min(st.W, st.H) === 720, { W: st.W, H: st.H });
    check(`boot/${d.name}: no horizontal overflow`, st.sw <= st.iw + 1, { sw: st.sw, iw: st.iw });
    // tap Play with a real touch
    await tapEl(c, '#btnPlay');
    await sleep(500);
    check(`boot/${d.name}: Play (touch) starts the game`, (await mode(c.page)) === 'play' && await visible(c.page, 'hud'), await mode(c.page));
    check(`boot/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gLang() {
  const ctx = await browser.newContext({ viewport: DEV.iphoneP.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US' });
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  const read = () => c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, l2: document.getElementById('logo2').textContent,
    title: document.title, lang: document.documentElement.lang, on: [...document.querySelectorAll('.title-screen [data-lang]')].filter(b => b.classList.contains('on')).map(b => b.dataset.lang),
    tag: document.getElementById('tagline').textContent, age: document.getElementById('titleAge').textContent, gear: document.querySelector('.gear-tip').textContent }));
  const a = await read();
  check('lang: default EN title/logo', a.lang === 'en' && /Kitten/.test(a.l1 + a.l2) && /Kitten/.test(a.title) && a.on.join() === 'en', a);
  await tapEl(c, '.title-screen [data-lang="vi"]');
  const b = await read();
  check('lang: VI chip updates logo + document.title + html lang', b.lang === 'vi' && b.l1 === 'Bóng Bay' && /Mèo Con/.test(b.l2) && /Bóng Bay/.test(b.title) && b.on.join() === 'vi', b);
  check('lang: VI tagline / age / gear tip translated', !badText(b.tag || 'x') && /Tuổi|tuổi/.test(b.age) && b.gear !== a.gear, b);
  const vl = await c.page.evaluate(() => KB.debug.voiceLog.slice(-1)[0]);
  check('lang: switching says a welcome line in VI', vl && vl.lang === 'vi' && !badText(vl.text), vl);
  await c.page.reload(); await waitTitle(c.page);
  const r = await read();
  check('lang: VI choice persists across reload', r.lang === 'vi' && r.l1 === 'Bóng Bay', r);
  await tapEl(c, '.title-screen [data-lang="en"]');
  const e = await read();
  check('lang: back to EN', e.lang === 'en' && /Kitten/.test(e.title), e);
  // in-game prompt follows the language
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=vi'); await waitTitle(c.page); await installEv(c.page);
  await startGame(c, 2); await waitInteractive(c.page);
  const bub = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('lang: ?lang=vi → Vietnamese prompt in the bubble', /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũ]/i.test(bub) && !badText(bub), bub);
  check('lang: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gGate() {
  const c = await open(DEV.iphoneP, 'mute=1');
  const g = await elCenter(c.page, '#btnParents');
  // short tap
  await c.page.touchscreen.tap(g.x, g.y); await sleep(400);
  check('gate: short tap on ⚙ does NOT open settings', !(await visible(c.page, 'scrSettings')));
  // 1 s hold
  await touch(c.cdp, 'touchStart', [g]); await sleep(1000); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  check('gate: 1 s hold does NOT open settings', !(await visible(c.page, 'scrSettings')));
  // hold that slides away
  await touch(c.cdp, 'touchStart', [g]); await sleep(400);
  await touch(c.cdp, 'touchMove', [{ x: g.x - 150, y: g.y + 200 }]); await sleep(1900); await touch(c.cdp, 'touchEnd', []); await sleep(200);
  check('gate: hold that slides off the gear is cancelled', !(await visible(c.page, 'scrSettings')));
  // 2 s+ hold
  await touch(c.cdp, 'touchStart', [g]); await sleep(1000);
  const mid = await c.page.evaluate(() => +getComputedStyle(document.getElementById('btnParents')).getPropertyValue('--p') || +document.getElementById('btnParents').style.getPropertyValue('--p'));
  await sleep(1300); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  check('gate: hold shows progress', mid > 0.3 && mid < 0.8, mid);
  check('gate: 2 s hold with real touch opens settings', await visible(c.page, 'scrSettings'));
  check('gate: title hidden behind settings', !(await visible(c.page, 'scrTitle')));
  check('gate: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function openSettingsByHold(c) {
  const g = await elCenter(c.page, '#btnParents');
  await touch(c.cdp, 'touchStart', [g]); await sleep(2300); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  return visible(c.page, 'scrSettings');
}
async function gSettings() {
  const ctx = await browser.newContext({ viewport: DEV.iphoneP.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US' });
  let c = await open(DEV.iphoneP, 'mute=1', { ctx });
  check('settings: opened by hold', await openSettingsByHold(c));
  await tapEl(c, '#ageChips [data-age="6"]');
  await c.page.locator('#inpName').fill('Mầm');
  await tapEl(c, '#scrSettings label.toggle:has(#optMusic)');
  await tapEl(c, '#scrSettings [data-lang="vi"]');
  const s1 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('kb:settings') || '{}'));
  check('settings: saved to localStorage kb:settings', s1.age === 6 && s1.name === 'Mầm' && s1.music === false && s1.lang === 'vi', s1);
  await tapEl(c, '#btnSettingsDone');
  check('settings: Done returns to title', await visible(c.page, 'scrTitle') && !(await visible(c.page, 'scrSettings')));
  const ageTxt = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('settings: title shows the new age', /6/.test(ageTxt), ageTxt);
  await c.page.reload(); await waitTitle(c.page);
  const st = await c.page.evaluate(() => KB.debug.getState().settings);
  check('settings: persist across reload (age, name, music, lang)', st.age === 6 && st.name === 'Mầm' && st.music === false && st.lang === 'vi', st);
  const chips = await c.page.evaluate(() => { KB.UI.refreshSettings(); return [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age); });
  check('settings: age chip 6 highlighted after reload', chips.join() === '6', chips);
  // child's name used in praise
  await installEv(c.page); await startGame(c, 2); await waitInteractive(c.page);
  await c.page.evaluate(() => KB.debug.voiceLog.length = 0);
  const r = (await balloons(c.page)).find(b => b.tap && b.right);
  await tapBalloon(c, r.id); await sleep(500);
  const lines = await c.page.evaluate(() => KB.debug.voiceLog.map(l => l.text));
  check('settings: lines are clean after a tap (no raw keys)', lines.length > 0 && lines.every(l => !badText(l)), lines);
  await c.page.close();

  // URL flags are never saved
  await c.page.evaluate && null;
  const ctx2 = await browser.newContext({ viewport: DEV.iphoneP.viewport, deviceScaleFactor: 3, isMobile: true, hasTouch: true, locale: 'en-US' });
  c = await open(DEV.iphoneP, 'mute=1&lang=vi&age=6', { ctx: ctx2 });
  const t1 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, ls: localStorage.getItem('kb:settings') }));
  check('flags: ?lang=vi&age=6 applied for the session', t1.l1 === 'Bóng Bay' && /6/.test(t1.age), t1);
  check('flags: nothing saved just by loading with flags', t1.ls == null, t1.ls);
  // play one tap so progress is saved, and change an unrelated setting (sound) → settings saved
  await openSettingsByHold(c);
  await tapEl(c, '#scrSettings label.toggle:has(#optSfx)');
  const s2 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('kb:settings') || '{}'));
  check('flags: saving another setting does not store the flag values', s2.lang === 'en' && s2.age === 4 && s2.sfx === false, s2);
  const chips2 = await c.page.evaluate(() => [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age).join());
  check('flags: settings panel shows the age actually being played (6)', chips2 === '6', 'age chips highlight ' + chips2 + ' while the session plays age 6 (URL flag)');
  await tapEl(c, '#ageChips [data-age="5"]');
  const t5 = await c.page.evaluate(() => ({ title: document.getElementById('titleAge').textContent, saved: JSON.parse(localStorage.getItem('kb:settings')).age }));
  check('flags: a parent picking age 5 in settings is applied to this session', /5/.test(t5.title), Object.assign(t5, { note: 'URL ?age=6 keeps overriding the chip the parent just tapped' }));
  await tapEl(c, '#ageChips [data-age="4"]');
  await tapEl(c, '#btnSettingsDone');
  await c.page.goto(srv.url + '?mute=1'); await waitTitle(c.page);
  const t2 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, s: KB.debug.getState().settings }));
  check('flags: without flags → saved EN, age 4 again', t2.l1 !== 'Bóng Bay' && /4/.test(t2.age) && t2.s.sfx === false, t2);
  check('settings: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close(); await ctx2.close();
}

/* Basic real-touch taps on every viewport: right → correct + pop, wrong → wrong (gentle), empty sky → nothing. */
async function gTap() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=11&age=4');
    await startGame(c, 1); await waitInteractive(c.page);
    let bs = await balloons(c.page);
    const right = bs.find(b => b.tap && b.right), wrong = bs.find(b => b.tap && !b.right);
    check(`tap/${d.name}: round has a right and a wrong balloon`, right && wrong, bs.map(b => [b.id, b.right, b.state]));
    // empty sky
    const sky = await emptySky(c.page);
    await clearEv(c.page);
    const d0 = await downs(c.page);
    await c.page.touchscreen.tap(sky.x, sky.y); await sleep(250);
    const evE = await c.page.evaluate(() => window.__ev.map(e => e.type).filter(t => t === 'correct' || t === 'wrong' || t === 'pop'));
    check(`tap/${d.name}: tap on empty sky reaches the world but pops nothing`, (await downs(c.page)) === d0 + 1 && evE.length === 0 && (await mode(c.page)) === 'play', { sky, evE });
    // wrong
    await clearEv(c.page);
    await tapBalloon(c, wrong.id); await sleep(150);
    const we = await evOf(c.page, 'wrong'), pe = await evOf(c.page, 'pop');
    check(`tap/${d.name}: wrong balloon → wrong event, no pop`, we.length === 1 && we[0].id === wrong.id && pe.length === 0, { we, pe });
    const wb = (await balloons(c.page)).find(b => b.id === wrong.id);
    check(`tap/${d.name}: wrong balloon is gentle (still floating, squashed, not popped)`, wb && (wb.state === 'float' || wb.state === 'rise') && wb.popT < 0, wb);
    check(`tap/${d.name}: wrong event names the target`, we[0] && we[0].target != null && we[0].targetNameValue != null, we[0]);
    // wrong balloon comes back home
    await sleep(1600);
    const wb2 = (await balloons(c.page)).find(b => b.id === wrong.id);
    check(`tap/${d.name}: wrong balloon floats back home (< 30 px)`, wb2 && Math.hypot(wb2.x - wb2.hx, wb2.y - wb2.hy) < 30, wb2 && Math.hypot(wb2.x - wb2.hx, wb2.y - wb2.hy));
    // right
    await clearEv(c.page);
    const c0 = await c.page.evaluate(() => KB.debug.stats.correct);
    await tapBalloon(c, right.id); await sleep(350);
    const ce = await evOf(c.page, 'correct'), pp = await evOf(c.page, 'pop');
    check(`tap/${d.name}: right balloon → correct event at touch-down`, ce.length === 1 && ce[0].id === right.id, ce);
    check(`tap/${d.name}: pop event follows ≈ 0.08 s later`, pp.length === 1 && pp[0].id === right.id && pp[0].at - ce[0].at >= 40 && pp[0].at - ce[0].at < 400, pp[0] && ce[0] && pp[0].at - ce[0].at);
    check(`tap/${d.name}: stats.correct counted`, (await c.page.evaluate(() => KB.debug.stats.correct)) === c0 + 1);
    const rb = (await balloons(c.page)).find(b => b.id === right.id);
    check(`tap/${d.name}: popped balloon is gone from play`, rb && (rb.state === 'pop' || rb.state === 'gone'), rb && rb.state);
    // finish the round by touch
    for (let k = 0; k < 10; k++) {
      const r2 = (await balloons(c.page)).find(b => b.tap && b.right);
      if (!r2 || await c.page.evaluate(() => KB.debug.world.solved)) break;
      await tapBalloon(c, r2.id); await sleep(250);
    }
    try { await waitState(c.page, 'roundDone', 8000); check(`tap/${d.name}: round ends after all right balloons`, true); }
    catch (e) { check(`tap/${d.name}: round ends after all right balloons`, false, await c.page.evaluate(() => KB.debug.getState())); }
    check(`tap/${d.name}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
    check(`tap/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    if (results.some(r => !r.ok && r.name.includes(d.name))) await shot(c, 'tap-fail');
    await c.close();
  }
}

/* Star rules: 3 (no mistakes) / 2 (one) / 1 (two or more). Rounds run back to back in chapter 1 (colours). */
async function gStars() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=21&age=4');
  await startGame(c, 2);
  const plan = [0, 1, 2, 3];
  for (let i = 0; i < plan.length; i++) {
    await waitInteractive(c.page);
    const rnd = await c.page.evaluate(() => KB.debug.world.round);
    await clearEv(c.page);
    for (let k = 0; k < (i === 1 ? 0 : plan[i]); k++) {
      const bs = await balloons(c.page);
      const w = bs.filter(b => b.tap && !b.right && b.cool <= 0);
      if (!w.length) break;
      await tapBalloon(c, w[k % w.length].id); await sleep(1000);   // > CONFIG.wrongLock (0.8 s): taps right after a wrong one are ignored
    }
    if (i === 1) {   // a double tap on the same wrong balloon (within its 0.3 s cooldown) counts once
      const w2 = (await balloons(c.page)).find(b => b.tap && !b.right && b.cool <= 0);
      if (w2) { const p = await c.page.evaluate(id => KB.debug.balloonScreen(id), w2.id); await c.page.touchscreen.tap(p.x, p.y); await sleep(30); await c.page.touchscreen.tap(p.x, p.y); await sleep(200); }
      plan[i] = 1;
    }
    const nw = (await evOf(c.page, 'wrong')).length;
    for (let k = 0; k < 12; k++) {
      if (await c.page.evaluate(() => KB.debug.world.solved)) break;
      const r = (await balloons(c.page)).find(b => b.tap && b.right);
      if (r) await tapBalloon(c, r.id);
      await sleep(200);
    }
    await waitState(c.page, 'roundDone', 8000).catch(() => {});
    const rd = (await evOf(c.page, 'roundDone'))[0];
    const exp = plan[i] === 0 ? 3 : plan[i] === 1 ? 2 : 1;
    check(`stars: round ${rnd} with ${nw} wrong → ${exp} stars`, rd && nw === plan[i] && rd.stars === exp && rd.mistakes === nw, { rd, nw });
    if (plan[i] >= 2) {
      const h = await evOf(c.page, 'hint');
      check(`stars: round ${rnd} — 2nd wrong tap glows the right balloon (hint)`, h.length >= 1, h);
    }
  }
  const tot = await c.page.evaluate(() => KB.debug.world.stars);
  check('stars: world total = 3+2+1+1', tot === 7, tot);
  await sleep(1500);
  const hud = await c.page.evaluate(() => +document.getElementById('hudStars').textContent);
  check('stars: HUD star count matches', hud === 7, hud);
  check('stars: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gCount() {
  const c = await open(DEV.ipadP, 'mute=1&seed=31&age=4');
  await startGame(c, 2);
  await c.page.evaluate(() => KB.debug.gotoLevel(KB.debug.world.levels.indexOf('count')));
  const topic = await c.page.evaluate(() => KB.debug.world.topic);
  check('count: age 4 has a count chapter', topic === 'count', topic);
  for (let r = 0; r < 2; r++) {
    await waitInteractive(c.page);
    const info = await c.page.evaluate(() => ({ mode: KB.debug.world.cur.mode, need: KB.debug.world.sign.need, n: KB.debug.world.balloons.length, filled: KB.debug.world.sign.filled }));
    check(`count r${r}: mode count, N + extras balloons`, info.mode === 'count' && info.need >= 1 && info.n > info.need && info.filled === 0, info);
    await clearEv(c.page);
    const fills = [];
    for (let k = 0; k < info.need; k++) {
      const b = (await balloons(c.page)).find(b => b.tap);
      if (!b) break;
      const wasSolved = await c.page.evaluate(() => KB.debug.world.solved);
      check(`count r${r}: not solved before pop ${k + 1}`, !wasSolved);
      await tapBalloon(c, b.id); await sleep(220);
      fills.push(await c.page.evaluate(() => KB.debug.world.sign.filled));
    }
    check(`count r${r}: sign.filled follows every pop (1..N)`, fills.join() === Array.from({ length: info.need }, (_, i) => i + 1).join(), fills);
    const ce = await evOf(c.page, 'correct');
    check(`count r${r}: correct events carry n and need`, ce.length === info.need && ce.every((e, i) => e.n === i + 1 && e.need === info.need), ce.map(e => [e.n, e.need]));
    const after = await c.page.evaluate(() => ({ solved: KB.debug.world.solved, live: KB.debug.world.balloons.filter(b => b.state === 'float' || b.state === 'rise').length }));
    check(`count r${r}: exactly N pops solves the round, extras fly away`, after.solved && after.live === 0, after);
    // an extra tap where an extra balloon was must not count
    const extra = (await balloons(c.page)).find(b => b.state === 'away');
    if (extra) { await c.page.touchscreen.tap(extra.sx, extra.sy); await sleep(150); }
    check(`count r${r}: no (N+1)th pop`, (await evOf(c.page, 'correct')).length === info.need && (await c.page.evaluate(() => KB.debug.world.sign.filled)) === info.need);
    await waitState(c.page, 'roundDone', 8000).catch(() => {});
    const rd = (await evOf(c.page, 'roundDone'))[0];
    check(`count r${r}: roundDone with count = need, 3 stars`, rd && rd.count === info.need && rd.stars === 3, rd);
    await waitState(c.page, 'round', 10000).catch(() => {});
  }
  check('count: no NaN', (await nanCheck(c.page)).length === 0);
  check('count: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gAsk() {
  const c = await open(DEV.iphoneP, 'mute=1&seed=41&age=4');
  await startGame(c, 2);
  await c.page.evaluate(() => KB.debug.gotoLevel(KB.debug.world.levels.indexOf('animals')));
  await clearEv(c.page);
  for (let r = 0; r < 2; r++) {
    await waitInteractive(c.page);
    const since = await c.page.evaluate(() => window.__ev.filter(e => e.type === 'round').slice(-1)[0].at - 1);
    const evR = t => c.page.evaluate(([t, s]) => window.__ev.filter(e => e.type === t && e.at >= s).map(e => { const o = Object.assign({}, e); delete o.talk; return o; }), [t, since]);
    const info = await c.page.evaluate(() => ({ mode: KB.debug.world.cur.mode, queue: KB.debug.world.queue.slice(), target: KB.debug.world.target }));
    check(`ask r${r}: mode ask, target = queue[0]`, info.mode === 'ask' && info.queue.length >= 2 && info.target === info.queue[0], info);
    const first = (await evR('ask'))[0];
    check(`ask r${r}: first ask event names the target`, first && first.first && first.balloonId === info.target, first);
    // wrong animal
    const wrongB = (await balloons(c.page)).find(b => b.tap && b.id !== info.target);
    await tapBalloon(c, wrongB.id); await sleep(200);
    const we = await evR('wrong');
    const t2 = await c.page.evaluate(() => KB.debug.world.target);
    check(`ask r${r}: wrong animal → wrong event (target unchanged, balloon kept)`, we.length === 1 && we[0].target === info.target && t2 === info.target && (await balloons(c.page)).find(b => b.id === wrongB.id).popT < 0, { we, t2 });
    await sleep(400);
    const popped = [], bubbles = [];
    for (let k = 0; k < info.queue.length + 2; k++) {
      const tg = await c.page.evaluate(() => KB.debug.world.target);
      if (tg == null || await c.page.evaluate(() => KB.debug.world.solved)) break;
      // wait until the target is tappable
      await c.page.waitForFunction(id => { const w = KB.debug.world, b = w.balloonById(id); return b && w.canTap(b) && b.cool <= 0; }, tg, { timeout: 5000 }).catch(() => {});
      await tapBalloon(c, tg); await sleep(350);
      popped.push(tg);
      bubbles.push(await c.page.evaluate(() => document.getElementById('bubbleText').textContent));
    }
    check(`ask r${r}: targets popped in queue order`, popped.join() === info.queue.join(), { popped, queue: info.queue });
    const asks = (await evR('ask')).map(e => e.balloonId);
    check(`ask r${r}: an ask event per target, in order`, asks.join() === info.queue.join(), { asks, queue: info.queue });
    check(`ask r${r}: bubble follows the next animal`, bubbles.slice(0, -1).every(t => !badText(t)) && new Set(bubbles.slice(0, -1)).size === Math.max(1, bubbles.length - 1), bubbles);
    await waitState(c.page, 'roundDone', 8000).catch(() => {});
    const rd = (await evR('roundDone'))[0];
    check(`ask r${r}: round done, 2 stars (one mistake)`, rd && rd.stars === 2, rd);
    const fr = await c.page.evaluate(() => KB.debug.world.friends.map(f => ({ s: f.state, x: f.x | 0, y: f.y | 0 })));
    const midAir = fr.filter(f => f.s === 'fall').length;
    check(`ask r${r}: friends are on the grass when the round ends (stars)`, midAir === 0, { dev: 'iphone-portrait', fr });
    await sleep(1200);   // speed 2 → 2.4 s of game time, before the friends fade
    const land = await evR('land');
    check(`ask r${r}: every animal friend lands on the grass`, land.length === info.queue.length, { land: land.length });
    check(`ask r${r}: no NaN in friends`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
  }
  check('ask: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gMulti() {
  const c = await open(DEV.ipadL, 'mute=1&seed=51&age=4');
  await startGame(c, 1); await waitInteractive(c.page);
  const bs = await balloons(c.page);
  const right = bs.find(b => b.tap && b.right);
  const sky = await emptySky(c.page);
  await clearEv(c.page);
  // finger 1 rests on the sky, finger 2 lands on the right balloon
  await touch(c.cdp, 'touchStart', [{ x: sky.x, y: sky.y, id: 1 }]); await sleep(80);
  const p = await c.page.evaluate(id => KB.debug.balloonScreen(id), right.id);
  await touch(c.cdp, 'touchStart', [{ x: sky.x, y: sky.y, id: 1 }, { x: p.x, y: p.y, id: 2 }]); await sleep(80);
  await touch(c.cdp, 'touchEnd', [{ x: sky.x, y: sky.y, id: 1 }]); await sleep(40);
  await touch(c.cdp, 'touchEnd', []); await sleep(200);
  const ce = await evOf(c.page, 'correct');
  check('multi: second simultaneous finger is ignored', ce.length === 0, ce);
  // both fingers down at once (one touchStart with two points): only the first counts
  await clearEv(c.page);
  const p2 = await c.page.evaluate(id => KB.debug.balloonScreen(id), right.id);
  await touch(c.cdp, 'touchStart', [{ x: sky.x, y: sky.y, id: 3 }, { x: p2.x, y: p2.y, id: 4 }]); await sleep(80);
  await touch(c.cdp, 'touchEnd', []); await sleep(200);
  check('multi: two fingers in one touchStart → only the first is used', (await evOf(c.page, 'correct')).length === 0, await evOf(c.page, 'correct'));
  // a normal single tap still works afterwards (no stuck pointer)
  await clearEv(c.page);
  await tapBalloon(c, right.id); await sleep(250);
  check('multi: a single tap afterwards still pops', (await evOf(c.page, 'correct')).length === 1);
  // CDP touchCancel recovery
  await touch(c.cdp, 'touchStart', [{ x: sky.x, y: sky.y, id: 5 }]); await sleep(50);
  await touch(c.cdp, 'touchCancel', []); await sleep(80);
  await clearEv(c.page);
  const r2 = (await balloons(c.page)).find(b => b.tap && b.right) || (await balloons(c.page)).find(b => b.tap);
  if (r2) { await tapBalloon(c, r2.id); await sleep(250); }
  const evs = await c.page.evaluate(() => window.__ev.filter(e => e.type === 'correct' || e.type === 'wrong').length);
  check('multi: taps work after a touchcancel', !r2 || evs === 1, evs);
  check('multi: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gRepeat() {
  // voice NOT disabled by flags (no mute/novoice), speed 1; headless may have no TTS voices → check the log
  const c = await open(DEV.iphoneL, 'seed=61&age=4');
  await startGame(c, 1); await waitInteractive(c.page);
  const info = await c.page.evaluate(() => ({ en: KB.Voice.isEnabled(), sup: KB.Voice.isSupported(), voices: KB.Voice.voices().length }));
  console.log('      voice in headless:', JSON.stringify(info));
  check('repeat: voice enabled at speed 1 without flags', info.en === true, info);
  const prompt = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  const L = await c.page.evaluate(() => { const v = KB.debug.view(), m = KB.debug.world.layout.miu, s = KB.debug.world.layout.sign; return { mx: v.left + m.x * v.s, my: v.top + (m.y - m.h * 0.5) * v.s, sx: v.left + s.x * v.s, sy: v.top + (s.y - s.w * 0.5) * v.s }; });
  const n0 = await voiceN(c.page);
  await clearEv(c.page);
  await c.page.touchscreen.tap(L.mx, L.my); await sleep(300);
  const n1 = await voiceN(c.page);
  const last = await c.page.evaluate(() => KB.debug.voiceLog.slice(-1)[0]);
  const ev1 = await c.page.evaluate(() => window.__ev.filter(e => e.type === 'correct' || e.type === 'wrong').length);
  check('repeat: tap on Miu repeats the prompt (voiceLog grows)', n1 === n0 + 1 && last && !badText(last.text), { n0, n1, last, prompt });
  check('repeat: tap on Miu pops nothing', ev1 === 0, ev1);
  check('repeat: Miu looks thoughtful', (await c.page.evaluate(() => KB.debug.world.miu.mood)) === 'think');
  await tapEl(c, '#bubble'); await sleep(300);
  const n2 = await voiceN(c.page);
  check('repeat: tap on the bubble repeats the prompt', n2 === n1 + 1, { n1, n2 });
  check('repeat: bubble tap never reaches the world', (await c.page.evaluate(() => window.__ev.filter(e => e.type === 'correct' || e.type === 'wrong').length)) === 0);
  await c.page.touchscreen.tap(L.sx, L.sy); await sleep(300);
  check('repeat: tap on the sign repeats the prompt', (await voiceN(c.page)) === n2 + 1, await voiceN(c.page));
  // speech queue never piles up: tap Miu many times quickly
  for (let i = 0; i < 8; i++) { await c.page.touchscreen.tap(L.mx, L.my); await sleep(40); }
  check('repeat: rapid Miu taps → no errors', c.errors.length === 0, c.errors);
  // voice off at high speed
  await c.page.evaluate(() => KB.debug.setSpeed(4));
  check('repeat: voice disabled at speed > 1', (await c.page.evaluate(() => KB.Voice.isEnabled())) === false);
  check('repeat: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function toTalk(c) {
  await c.page.evaluate(() => { window.__stopBotOnTalk = true; KB.debug.setBot(true, 1); KB.debug.setSpeed(6); });
  await c.page.waitForFunction(() => KB.debug.mode === 'talk' && KB.debug.world.state === 'talk', null, { timeout: 60000 });
  await c.page.evaluate(() => { window.__stopBotOnTalk = false; KB.debug.setBot(false); KB.debug.setSpeed(1); });
  await sleep(300);
}
async function gTalk() {
  const c = await open(DEV.ipadL, 'mute=1&seed=71&age=4');
  await startGame(c, 2);
  // chapter 1: answer right by tap
  await toTalk(c);
  check('talk: Talk time screen opens after the chapter', await visible(c.page, 'scrTalk'));
  const tk = await c.page.evaluate(() => { const t = KB.debug.world.talk; return { answerId: t.answerId, ids: t.choices.map(c => c.id), q: document.getElementById('talkQ').textContent, btns: [...document.querySelectorAll('#talkChoices button')].map(b => ({ id: b.dataset.id, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })) }; });
  check('talk: 2–4 choice buttons, ≥ 64 px', tk.btns.length >= 2 && tk.btns.length <= 4 && tk.btns.every(b => b.w >= 64 && b.h >= 64), tk.btns);
  check('talk: question text clean', !badText(tk.q), tk.q);
  const s0 = await c.page.evaluate(() => KB.debug.world.stars);
  await clearEv(c.page);
  const d0 = await downs(c.page);
  await tapEl(c, `#talkChoices button[data-id="${tk.answerId}"]`); await sleep(300);
  const tr = await evOf(c.page, 'talkResult');
  check('talk: right answer by tap → talkResult correct', tr.length === 1 && tr[0].correct === true, tr);
  check('talk: +1 star', (await c.page.evaluate(() => KB.debug.world.stars)) === s0 + 1);
  check('talk: right button marked', await c.page.evaluate(id => document.querySelector(`#talkChoices button[data-id="${id}"]`).classList.contains('right'), String(tk.answerId)));
  check('talk: choice taps never reach the canvas', (await downs(c.page)) === d0, { d0, d1: await downs(c.page) });
  // a second tap is ignored
  const other = tk.ids.find(i => i !== tk.answerId);
  await tapEl(c, `#talkChoices button[data-id="${other}"]`); await sleep(200);
  check('talk: a second answer is ignored', (await evOf(c.page, 'talkResult')).length === 1);
  await c.page.waitForFunction(() => KB.debug.world.state === 'intro' && KB.debug.world.level === 1, null, { timeout: 10000 }).catch(() => {});
  check('talk: next chapter starts, talk screen closed', (await c.page.evaluate(() => KB.debug.world.level)) === 1 && !(await visible(c.page, 'scrTalk')) && (await mode(c.page)) === 'play');

  // chapter 2: wait for the re-asks (auto-glow), then answer wrong
  await toTalk(c);
  await clearEv(c.page);
  const tk2 = await c.page.evaluate(() => { const t = KB.debug.world.talk; return { answerId: t.answerId, ids: t.choices.map(c => c.id) }; });
  await c.page.evaluate(() => KB.debug.setSpeed(4));
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'talkAsk').length >= 1, null, { timeout: 15000 }).catch(() => {});
  await sleep(100);
  const g1 = await c.page.evaluate(() => [...document.querySelectorAll('#talkChoices button.glow')].map(b => b.dataset.id));
  check('talk: 1st re-ask (12 s) does not glow yet', g1.length === 0, g1);
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'talkAsk').length >= 2, null, { timeout: 15000 }).catch(() => {});
  await sleep(100);
  const g2 = await c.page.evaluate(() => [...document.querySelectorAll('#talkChoices button.glow')].map(b => b.dataset.id));
  const asks = await evOf(c.page, 'talkAsk');
  check('talk: re-ask every 12 s', asks.length >= 2 && Math.abs(asks[1].wt - asks[0].wt - 12) < 0.1, asks.map(a => a.wt));
  check('talk: 2nd re-ask glows the right answer (only)', g2.length === 1 && g2[0] === String(tk2.answerId), g2);
  check('talk: world talk.glowAnswer set', await c.page.evaluate(() => KB.debug.world.talk.glowAnswer === true));
  await c.page.evaluate(() => KB.debug.setSpeed(1));
  const wrongId = tk2.ids.find(i => i !== tk2.answerId);
  const s1 = await c.page.evaluate(() => KB.debug.world.stars);
  await tapEl(c, `#talkChoices button[data-id="${wrongId}"]`); await sleep(300);
  const tr2 = await evOf(c.page, 'talkResult');
  check('talk: wrong answer by tap → talkResult correct:false, no star lost', tr2.length === 1 && tr2[0].correct === false && (await c.page.evaluate(() => KB.debug.world.stars)) === s1, tr2);
  const marks = await c.page.evaluate(() => [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id + ':' + b.className));
  check('talk: wrong pick marked, right answer shown', marks.some(m => m.startsWith(String(tk2.answerId) + ':') && /right/.test(m)) && marks.some(m => m.startsWith(String(wrongId) + ':') && /wrongpick/.test(m)), marks);
  await c.page.waitForFunction(() => KB.debug.world.level === 2, null, { timeout: 10000 }).catch(() => {});
  check('talk: game goes on after a wrong answer', (await c.page.evaluate(() => KB.debug.world.level)) === 2);
  // chapter 3: nobody answers — re-asks keep coming, but Miu stops speaking after the 3rd (empty room)
  await toTalk(c);
  await clearEv(c.page);
  const vl0 = await voiceN(c.page);
  await c.page.evaluate(() => KB.debug.setSpeed(8));
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'talkAsk').length >= 4, null, { timeout: 30000 }).catch(() => {});
  await sleep(300);
  await c.page.evaluate(() => KB.debug.setSpeed(1));
  const nAsk = (await evOf(c.page, 'talkAsk')).length, spoken = (await voiceN(c.page)) - vl0;
  check('talk: after 4 silent re-asks Miu has spoken only 3 of them', nAsk >= 4 && spoken === 3, { nAsk, spoken });
  check('talk: nobody answering → the game pauses itself (no fail, no timeout), Talk time still open', (await mode(c.page)) === 'paused' && (await c.page.evaluate(() => KB.debug.world.state)) === 'talk');
  await tapEl(c, '#btnResume'); await sleep(300);
  check('talk: Resume returns to the open Talk time', (await mode(c.page)) === 'talk');
  check('talk: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gPause() {
  const c = await open(DEV.iphoneP, 'mute=1&seed=81&age=4');
  await startGame(c, 1); await waitInteractive(c.page);
  const d0 = await downs(c.page);
  await tapEl(c, '#btnPause'); await sleep(300);
  check('pause: HUD pause button → paused screen', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  check('pause: the HUD tap did not reach the canvas', (await downs(c.page)) === d0, { d0, d1: await downs(c.page) });
  const t0 = await c.page.evaluate(() => KB.debug.world.time);
  await sleep(800);
  const t1 = await c.page.evaluate(() => KB.debug.world.time);
  check('pause: world frozen while paused', t1 === t0, { t0, t1 });
  await tapEl(c, '#btnResume'); await sleep(300);
  check('pause: Resume → play', (await mode(c.page)) === 'play' && !(await visible(c.page, 'scrPause')));
  check('pause: Resume tap did not reach the canvas', (await downs(c.page)) === d0);
  await sleep(400);
  check('pause: world runs again', (await c.page.evaluate(() => KB.debug.world.time)) > t1);
  const r = (await balloons(c.page)).find(b => b.tap && b.right);
  await clearEv(c.page); await tapBalloon(c, r.id); await sleep(250);
  check('pause: taps work after resume', (await evOf(c.page, 'correct')).length === 1);
  // visibilitychange
  await c.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  check('visibility: hidden → paused', (await mode(c.page)) === 'paused');
  await c.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
  check('visibility: back → stays on the pause screen (child resumes)', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  await tapEl(c, '#btnResume'); await sleep(200);
  check('visibility: resume works', (await mode(c.page)) === 'play');
  // Home from pause → title, then Play works again
  await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(300);
  check('pause: Home → title', (await mode(c.page)) === 'title' && await visible(c.page, 'scrTitle'));
  await tapEl(c, '#btnPlay'); await sleep(300);
  check('pause: Play from title after Home', (await mode(c.page)) === 'play');
  // pause during talk
  await toTalk(c);
  await c.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  await sleep(200);
  check('pause: visibility pause during Talk time', (await mode(c.page)) === 'paused');
  await tapEl(c, '#btnResume'); await sleep(200);
  check('pause: resume returns to Talk time', (await mode(c.page)) === 'talk' && await visible(c.page, 'scrTalk'));
  check('pause: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gRotate() {
  const pairs = [[DEV.iphoneP, DEV.iphoneL], [DEV.ipadL, DEV.ipadP], [DEV.iphoneL, DEV.iphoneP]];
  for (const [a, b] of pairs) {
    for (const lvl of [0, 2]) {
      const c = await open(a, 'mute=1&seed=9' + lvl + '&age=4');
      await startGame(c, 1);
      if (lvl) await c.page.evaluate(l => KB.debug.gotoLevel(l), lvl);
      await waitInteractive(c.page);
      // pop one first (so there is a mid-round state)
      // change the round state first: pop one if more than one is needed, else make a gentle wrong tap
      const bs0 = await balloons(c.page), rights = bs0.filter(x => x.tap && x.right);
      const need = await c.page.evaluate(() => KB.debug.world.cur.mode === 'count' ? KB.debug.world.sign.need : null);
      const r0 = (need ? need > 1 : rights.length > 1) ? rights[0] : bs0.find(x => x.tap && !x.right);
      if (r0) { await tapBalloon(c, r0.id); await sleep(200); }
      const before = await c.page.evaluate(() => ({ round: KB.debug.world.round, level: KB.debug.world.level, pops: KB.debug.world.pops, state: KB.debug.world.state }));
      const tag = `rotate/${a.name}→${b.name} L${lvl}`;
      await c.page.setViewportSize(b.viewport); await sleep(500);
      const st = await c.page.evaluate(() => {
        const w = KB.debug.world, L = w.layout, P = L.play, v = KB.debug.view();
        const live = w.balloons.filter(x => x.state === 'float' || x.state === 'rise');
        return { W: L.W, H: L.H, view: { W: v.W, H: v.H }, round: w.round, level: w.level, pops: w.pops, state: w.state,
          outScreen: live.filter(x => x.x - x.size / 2 < -1 || x.x + x.size / 2 > L.W + 1 || x.y - x.size / 2 < -1 || (x.state !== 'rise' && x.y + x.size / 2 > L.H + 1)).map(x => x.id),   // rising balloons come up from below the grass by design
          outBand: live.filter(x => x.hx < P.x - 1 || x.hx > P.x + P.w + 1 || x.hy < P.y - 1 || x.hy > P.y + P.h + 1).map(x => [x.id, x.hx | 0, x.hy | 0]),
          P, n: live.length };
      });
      const landscape = b.viewport.width > b.viewport.height;
      check(`${tag}: world re-laid out to the new shape`, landscape ? st.W > st.H : st.H > st.W, { W: st.W, H: st.H });
      check(`${tag}: round continues (same round, pops kept)`, st.round === before.round && st.level === before.level && st.pops === before.pops && st.state === 'round', { before, st });
      check(`${tag}: live balloons inside the screen`, st.outScreen.length === 0, st.outScreen);
      check(`${tag}: balloon homes inside the play band`, st.outBand.length === 0, { out: st.outBand, P: st.P });
      await sleep(1500);
      const st2 = await c.page.evaluate(() => { const w = KB.debug.world, P = w.layout.play;
        return w.balloons.filter(x => x.state === 'float').map(x => ({ id: x.id, d: Math.hypot(x.x - x.hx, x.y - x.hy) | 0, inBand: x.y > P.y - 40 && x.y < P.y + P.h + 40 && x.x > P.x - 40 && x.x < P.x + P.w + 40 })); });
      check(`${tag}: balloons settle in the band after rotation`, st2.every(x => x.inBand && x.d < 40), st2.filter(x => !x.inBand || x.d >= 40));
      // taps still work (real touch at the new positions)
      await clearEv(c.page);
      let ok = 0;
      for (let k = 0; k < 14; k++) {
        if (await c.page.evaluate(() => KB.debug.world.solved)) break;
        const r = (await balloons(c.page)).find(x => x.tap && x.right);
        if (!r) break;
        await tapBalloon(c, r.id); await sleep(230); ok++;
      }
      const ce = (await evOf(c.page, 'correct')).length;
      check(`${tag}: taps after rotation pop the right balloons`, ce === ok && ok > 0, { ce, ok });
      await waitState(c.page, 'roundDone', 8000).catch(() => {});
      check(`${tag}: round finishes after rotation`, ['roundDone', 'round', 'talk', 'intro'].includes(await c.page.evaluate(() => KB.debug.world.state)) && await c.page.evaluate(() => KB.debug.world.solved || KB.debug.world.state !== 'round'));
      // HUD + bubble still inside the screen
      const ui = await c.page.evaluate(() => ['hud', 'bubble'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left | 0, r: r.right | 0, t: r.top | 0, b: r.bottom | 0 }; }));
      check(`${tag}: HUD and bubble on screen`, ui.every(u => u.l >= 0 && u.r <= b.viewport.width + 1 && u.t >= 0 && u.b <= b.viewport.height), ui);
      check(`${tag}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
      check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
      if (results.some(r => !r.ok && r.name.startsWith(tag))) await shot(c, `rotate-L${lvl}-fail`);
      await c.close();
    }
  }
  // rotate during the rise (balloons travelling) and during the friends' fall
  const c = await open(DEV.iphoneL, 'mute=1&seed=97&age=4');
  await startGame(c, 1);
  await c.page.evaluate(() => KB.debug.gotoLevel(3));
  await c.page.waitForFunction(() => KB.debug.world.state === 'round' && KB.debug.world.balloons.some(b => b.state === 'rise' && b.t > 0.1), null, { timeout: 10000 });
  await c.page.setViewportSize(DEV.iphoneP.viewport); await sleep(1800);
  const s = await c.page.evaluate(() => { const w = KB.debug.world, P = w.layout.play; return w.balloons.filter(b => b.state === 'float' || b.state === 'rise').map(b => ({ id: b.id, st: b.state, x: b.x | 0, y: b.y | 0, ok: b.x > P.x - 40 && b.x < P.x + P.w + 40 && b.y > P.y - 40 && b.y < P.y + P.h + 40 })); });
  check('rotate/during rise: rising balloons end up in the new band', s.length > 0 && s.every(x => x.ok), s.filter(x => !x.ok));
  await waitInteractive(c.page);
  const tg = await c.page.evaluate(() => KB.debug.world.target);
  await tapBalloon(c, tg); await sleep(150);
  await c.page.setViewportSize(DEV.iphoneL.viewport); await sleep(2500);
  const f = await c.page.evaluate(() => { const w = KB.debug.world, L = w.layout; return w.friends.map(f => ({ st: f.state, x: f.x | 0, y: f.y | 0, ok: isFinite(f.x) && f.x > 0 && f.x < L.W && Math.abs(f.y - L.yard.y) < 60 })); });
  check('rotate/during friend fall: friend lands in the new yard', f.length >= 1 && f.every(x => x.ok), f);
  check('rotate/during rise: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gHud() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=101&age=4');
  await startGame(c, 1); await waitInteractive(c.page);
  // tap on the HUD star counter (not a button) and the dots
  const d0 = await downs(c.page);
  for (const sel of ['#hud .hud-stars', '#hudDots', '#bubble']) { await tapEl(c, sel); await sleep(120); }
  check('hud: HUD / bubble taps never reach the world', (await downs(c.page)) === d0, { d0, d1: await downs(c.page) });
  // a balloon right under the HUD? find the closest balloon to the HUD and make sure it is not under it
  const hud = await c.page.evaluate(() => { const r = document.getElementById('hud').getBoundingClientRect(); const v = KB.debug.view(); return { l: (r.left - v.left) / v.s, b: (r.bottom - v.top) / v.s }; });
  const under = (await balloons(c.page)).filter(b => b.hx + b.size / 2 > hud.l && b.hy - b.size / 2 < hud.b);
  check('hud: no balloon home under the HUD', under.length === 0, { hud, under: under.map(b => [b.id, b.hx | 0, b.hy | 0]) });
  // play-again flow is covered by the bot group; title buttons should not leak into the world either
  check('hud: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gBot() {
  const ages = [3, 4, 5, 6, 7], langs = ['en', 'vi'];
  let k = 0;
  const table = [];
  for (const age of ages) for (const lang of langs) {
    const d = ALL[k++ % ALL.length];
    const c = await open(d, `mute=1&seed=${200 + k}&age=${age}&lang=${lang}`);
    await c.page.evaluate(() => { KB.debug.setBot(true, 0.75); KB.debug.setSpeed(8); KB.debug.startGame(); });
    const t0 = Date.now();
    let nan = [], texts = new Set(), bad = [];
    let done = false;
    while (Date.now() - t0 < 150000) {
      await sleep(400);
      const s = await c.page.evaluate(() => ({ m: KB.debug.mode, b: document.getElementById('bubbleText').textContent, q: document.getElementById('talkQ').textContent }));
      [s.b, s.q].forEach(t => { if (t && !texts.has(t)) { texts.add(t); if (badText(t)) bad.push(t); } });
      const nn = await nanCheck(c.page); if (nn.length) nan = nan.concat(nn).slice(0, 10);
      if (s.m === 'done') { done = true; break; }
    }
    const tag = `bot/age${age}-${lang} (${d.name})`;
    const res = await c.page.evaluate(() => ({ st: KB.debug.getState(), stats: KB.debug.bot && KB.debug.bot.stats, done: document.getElementById('doneTitle').textContent, ds: document.getElementById('doneStars').textContent, lines: KB.debug.voiceLog.map(l => l.text) }));
    check(`${tag}: reaches the done screen`, done && await visible(c.page, 'scrDone'), res.st);
    const topics = (await evOf(c.page, 'level')).map(e => e.topic);
    check(`${tag}: 4 chapters played`, topics.length === 4, topics);
    check(`${tag}: no NaN in balloons / friends`, nan.length === 0, nan);
    const badLines = res.lines.filter(l => badText(l));
    check(`${tag}: all bubble/voice text clean`, bad.length === 0 && badLines.length === 0, bad.concat(badLines).slice(0, 5));
    if (lang === 'vi') check(`${tag}: done title in Vietnamese`, /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũ]/i.test(res.done), res.done);
    const stars = res.st.stars, rpl = await c.page.evaluate(() => KB.debug.world.roundsPerLevel), maxStars = 4 * (rpl * 3 + 1);
    check(`${tag}: stars ≤ ${maxStars} and shown on the done screen`, stars > 0 && stars <= maxStars && +res.ds === stars, { stars, ds: res.ds, rpl });
    table.push({ age, lang, dev: d.name, secs: ((Date.now() - t0) / 1000).toFixed(0), stars, topics: topics.join('/') });
    if (age === 4 || age === 7) {
      // Play again (real touch)
      await clearEv(c.page);
      await c.page.evaluate(() => KB.debug.setBot(false));
      await tapEl(c, '#btnAgain'); await sleep(400);
      const pa = await c.page.evaluate(() => ({ m: KB.debug.mode, st: KB.debug.world.state, lvl: KB.debug.world.level, stars: KB.debug.world.stars, hud: !document.getElementById('hud').classList.contains('hidden'), hs: document.getElementById('hudStars').textContent, done: !document.getElementById('scrDone').classList.contains('hidden') }));
      check(`${tag}: Play again → fresh session`, pa.m === 'play' && pa.lvl === 0 && pa.stars === 0 && pa.hud && pa.hs === '0' && !pa.done, pa);
      await waitInteractive(c.page).catch(() => {});
      const r = (await balloons(c.page)).find(b => b.tap && b.right);
      if (r) { await tapBalloon(c, r.id); await sleep(250); }
      check(`${tag}: real taps work in the replayed session`, (await evOf(c.page, 'correct')).length === 1);
    }
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    if (!done) await shot(c, `bot-age${age}-${lang}-stuck`);
    await c.close();
  }
  console.table(table);
}

(async () => {
  srv = await serve(process.env.KB_GAME_ROOT || undefined);
  browser = await chromium.launch();
  const groups = [['boot', gBoot], ['lang', gLang], ['gate', gGate], ['settings', gSettings], ['tap', gTap], ['stars', gStars], ['count', gCount],
    ['ask', gAsk], ['multi', gMulti], ['repeat', gRepeat], ['talk', gTalk], ['pause', gPause], ['rotate', gRotate], ['hud', gHud], ['bot', gBot]];
  for (const [g, fn] of groups) {
    if (!want(g)) continue;
    curGroup = g;
    console.log(`\n== ${g}`);
    try { await fn(); } catch (e) { check(`${g}: group crashed`, false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  const byGroup = {};
  for (const r of results) { const g = byGroup[r.group] = byGroup[r.group] || { group: r.group, pass: 0, fail: 0 }; r.ok ? g.pass++ : g.fail++; }
  console.log('\n== summary');
  console.table(Object.values(byGroup).map(g => ({ group: g.group, pass: g.pass, fail: g.fail, result: g.fail ? 'FAIL' : 'PASS' })));
  const fails = results.filter(r => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  fails.forEach(f => console.log('FAIL ' + f.name));
  process.exit(fails.length ? 1 : 0);
})();
