// Functional QA suite for Bim's Rainbow Rocket — REAL touch input on iPhone/iPad-sized mobile contexts.
//   node tests/e2e/functional.js                    (all groups)
//   node tests/e2e/functional.js tap wrong drag     (only some groups)
// Groups: boot lang gate settings flags volume tap wrong drag poke flight boost autoboost talk pause visibility
//         rotate bot done
// Prints PASS/FAIL per check + a summary, writes tests/out/functional/results.json (+ screenshots),
// exits 1 on any FAIL.
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
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 700)));
  return !!ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũờởỡợứừửữựấầẩẫậắằẳẵặếềểễệốồổỗộớ]/i;
function badText(s) {
  if (s == null) return null;
  s = String(s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|weather|surprise|name|shooting)\.[a-zA-Z]/.test(s)) return 'raw i18n key';
  return null;
}

let srv, browser;
const ctxOpts = d => ({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
const newCtx = (d = DEV.iphoneP) => browser.newContext(ctxOpts(d));
async function open(dev, q = '', opt = {}) {
  const ctx = opt.ctx || await browser.newContext(ctxOpts(dev));
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
  await page.waitForFunction(() => window.FC && FC.debug && FC.debug.mode === 'title', null, { timeout: 15000 });
}
/* Record every world event (with world time + phase) and count world.pointerDown calls. */
async function installEv(page) {
  await page.evaluate(() => {
    window.__ev = []; window.__downs = 0;
    const w = FC.debug.world;
    if (w.__hooked) return;
    w.__hooked = true;
    const o = w._emit;
    w._emit = function (e) {
      const c = Object.assign({ at: performance.now(), wt: this.time, phase: this.phase, state: this.state }, e);
      delete c.talk; delete c.token;
      window.__ev.push(c);
      if (e.type === 'talk' && window.__stopBotOnTalk) { FC.debug.setBot(false); FC.debug.setSpeed(1); }
      if (e.type === 'boostReady' && window.__stopBotOnBoostReady) { FC.debug.setBot(false); FC.debug.setSpeed(1); }
      return o.call(this, e);
    };
    const pd = w.pointerDown;
    w.pointerDown = function (x, y) { window.__downs++; return pd.call(this, x, y); };
  });
}
const evOf = (page, t) => page.evaluate(t => window.__ev.filter(e => e.type === t), t);
const evTypes = page => page.evaluate(() => window.__ev.map(e => e.type));
const clearEv = page => page.evaluate(() => { window.__ev = []; });
const mode = page => page.evaluate(() => FC.debug.mode);
const downs = page => page.evaluate(() => window.__downs);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
async function shot(c, name) { try { await c.page.screenshot({ path: path.join(OUT, `${c.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
const wstate = page => page.evaluate(() => { const w = FC.debug.world; return { mode: FC.debug.mode, state: w.state, phase: w.phase, hop: w.hop, hops: w.hops, round: w.round, level: w.level, stars: w.stars, camY: w.camY, pad: w.rocket && w.rocket.pad, rphase: w.rocket && w.rocket.phase, misses: w.misses, hopMisses: w.hopMisses }; });

async function waitAsk(page, timeout = 25000) {
  await page.waitForFunction(() => { const w = FC.debug.world; return FC.debug.mode === 'play' && w.state === 'round' && w.phase === 'ask' && FC.debug.answerId() != null; }, null, { timeout });
  await sleep(60);
}
/* Islands of the current row (CSS px hit boxes), the right one flagged. */
const rowIslands = page => page.evaluate(() => {
  const w = FC.debug.world, a = FC.debug.answerId();
  return (w.islands || []).filter(i => i.state === 'idle' && i.id !== w.rocket.pad).map(i => Object.assign({ id: i.id, right: i.id === a, kind: i.token && i.token.nameKind, value: i.token && i.token.nameValue }, FC.debug.islandScreen(i.id)));
});
async function tapIsland(c, id) {
  const p = await c.page.evaluate(id => FC.debug.islandScreen(id), id);
  if (!p) throw new Error('no island ' + id);
  await c.page.touchscreen.tap(p.x, p.y);
  return p;
}
async function tapRight(c) { const id = await c.page.evaluate(() => FC.debug.answerId()); await tapIsland(c, id); return id; }
/* A point (CSS px) in the open sky: away from every island, the rocket, HUD, bubble. */
const emptyPoint = page => page.evaluate(() => {
  const w = FC.debug.world, obs = [];
  for (const i of w.islands || []) { const b = FC.debug.islandScreen(i.id); if (b) obs.push({ l: b.x - b.w / 2 - 50, t: b.y - b.h / 2 - 50, r: b.x + b.w / 2 + 50, b: b.y + b.h / 2 + 50 }); }
  const rk = FC.debug.rocketScreen(); if (rk) obs.push({ l: rk.x - rk.w / 2 - 60, t: rk.y - rk.h / 2 - 60, r: rk.x + rk.w / 2 + 60, b: rk.y + rk.h / 2 + 60 });
  for (const id of ['hud', 'bubble']) { const e = document.getElementById(id); if (e && !e.classList.contains('hidden')) { const r = e.getBoundingClientRect(); obs.push({ l: r.left - 20, t: r.top - 20, r: r.right + 20, b: r.bottom + 20 }); } }
  if (w.shooting) { const s = FC.debug.toScreen(w.shooting.x, w.shooting.y - w.camY); obs.push({ l: s.x - 120, t: s.y - 120, r: s.x + 120, b: s.y + 120 }); }
  for (let gy = 2; gy < 19; gy++) for (let gx = 1; gx < 20; gx++) {
    const x = innerWidth * gx / 20, y = innerHeight * gy / 20;
    if (!obs.some(r => x > r.l && x < r.r && y > r.t && y < r.b)) return { x, y };
  }
  return null;
});
/* CDP raw touches. */
async function touch(cdp, type, pts) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0, radiusX: 4, radiusY: 4, force: 1 })) });
}
async function drag(c, from, to, steps = 12, stepMs = 25) {
  await touch(c.cdp, 'touchStart', [from]); await sleep(stepMs);
  for (let k = 1; k <= steps; k++) { await touch(c.cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * k / steps, y: from.y + (to.y - from.y) * k / steps }]); await sleep(stepMs); }
  await touch(c.cdp, 'touchEnd', []); await sleep(80);
}
async function elCenter(page, sel) {
  const bb = await page.locator(sel).first().boundingBox();
  if (!bb) throw new Error('no box for ' + sel);
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
}
async function tapEl(c, sel) { const p = await elCenter(c.page, sel); await c.page.touchscreen.tap(p.x, p.y); await sleep(100); }
async function startGame(c, speed = 1) { await c.page.evaluate(s => { FC.debug.setSpeed(s); FC.debug.startGame(); }, speed); }
async function openSettingsByHold(c) {
  const g = await elCenter(c.page, '#btnParents');
  await touch(c.cdp, 'touchStart', [g]); await sleep(2300); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  return visible(c.page, 'scrSettings');
}
/* Play the rest of the current round by touch (right answers). Returns true when roundDone is reached. */
async function playRoundByTouch(c, timeout = 40000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await wstate(c.page);
    if (s.state === 'roundDone') return true;
    if (s.state === 'round' && s.phase === 'ask') {
      const a = await c.page.evaluate(() => FC.debug.answerId());
      if (a != null) { await tapIsland(c, a); await sleep(250); continue; }
    }
    await sleep(80);
  }
  return false;
}
const onScreen = (b, vw, vh) => b && b.x - b.w / 2 >= -2 && b.x + b.w / 2 <= vw + 2 && b.y - b.h / 2 >= -2 && b.y + b.h / 2 <= vh + 2;

/* ======================================================================= groups */
async function gBoot() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=3');
    await sleep(700);
    const st = await c.page.evaluate(() => ({ mode: FC.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      loading: !document.getElementById('loading').classList.contains('hidden'), logo: document.querySelector('.logo').textContent.trim(),
      play: document.getElementById('btnPlay').getBoundingClientRect().toJSON(), W: FC.debug.getState().W, H: FC.debug.getState().H, sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check(`boot/${d.name}: title shown, loader gone, logo "Bim"`, st.mode === 'title' && st.title && !st.loading && /Bim/.test(st.logo), st);
    check(`boot/${d.name}: play button on screen & ≥ 60 px`, st.play.width >= 60 && st.play.left >= 0 && st.play.right <= d.viewport.width && st.play.bottom <= d.viewport.height, st.play);
    check(`boot/${d.name}: logical short side 720`, Math.min(st.W, st.H) === 720, { W: st.W, H: st.H });
    check(`boot/${d.name}: no horizontal overflow`, st.sw <= st.iw + 1, { sw: st.sw, iw: st.iw });
    await shot(c, 'boot-title');
    await tapEl(c, '#btnPlay'); await sleep(400);
    check(`boot/${d.name}: Play (touch) starts the game`, (await mode(c.page)) === 'play' && await visible(c.page, 'hud'), await mode(c.page));
    await waitAsk(c.page).catch(() => {});
    const isl = await rowIslands(c.page);
    check(`boot/${d.name}: first row has ≥ 2 islands, all on screen, one right`, isl.length >= 2 && isl.filter(i => i.right).length === 1 && isl.every(b => onScreen(b, d.viewport.width, d.viewport.height)), isl);
    const bub = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
    check(`boot/${d.name}: bubble shows the prompt (clean)`, !badText(bub), bub);
    await shot(c, 'boot-ask');
    check(`boot/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gLang() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  const read = () => c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, l2: document.getElementById('logo2').textContent,
    title: document.title, lang: document.documentElement.lang, on: [...document.querySelectorAll('.title-screen [data-lang]')].filter(b => b.classList.contains('on')).map(b => b.dataset.lang),
    tag: document.getElementById('tagline').textContent, age: document.getElementById('titleAge').textContent }));
  const a = await read();
  check('lang: default EN title/logo', a.lang === 'en' && /Bim/.test(a.l1) && /Rainbow/.test(a.l2) && /Rainbow/.test(a.title) && a.on.join() === 'en', a);
  await tapEl(c, '.title-screen [data-lang="vi"]');
  const b = await read();
  check('lang: VI chip updates logo + document.title + html lang', b.lang === 'vi' && b.l1 === 'Voi Bim' && /Tên Lửa/.test(b.l2) && /Tên Lửa/.test(b.title) && b.on.join() === 'vi', b);
  check('lang: VI tagline / age translated', VI_RE.test(b.tag) && !badText(b.tag) && /Tuổi|tuổi/.test(b.age), b);
  const vl = await c.page.evaluate(() => FC.debug.voiceLog.slice(-1)[0]);
  check('lang: switching says a welcome line in VI', vl && vl.lang === 'vi' && !badText(vl.text) && VI_RE.test(vl.text), vl);
  await c.page.reload(); await waitTitle(c.page);
  const r = await read();
  check('lang: VI choice persists across reload', r.lang === 'vi' && r.l1 === 'Voi Bim', r);
  await tapEl(c, '.title-screen [data-lang="en"]');
  const e = await read();
  check('lang: back to EN', e.lang === 'en' && /Bim/.test(e.title) && !/Tên/.test(e.title), e);
  // in-game bubble language
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=vi'); await waitTitle(c.page); await installEv(c.page);
  await startGame(c, 2); await waitAsk(c.page);
  const bub = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('lang: ?lang=vi → Vietnamese prompt in the bubble', VI_RE.test(bub) && !badText(bub), bub);
  await c.page.evaluate(() => { FC.debug.setSpeed(1); FC.debug.voiceLog.length = 0; });
  await tapRight(c); await sleep(1500);
  const fl = await c.page.evaluate(() => FC.debug.voiceLog.map(l => l.lang + ':' + l.text));
  check('lang: VI lines after a right answer are Vietnamese & clean', fl.length >= 1 && fl.every(l => l.startsWith('vi:') && !badText(l.slice(3))), fl);
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=en'); await waitTitle(c.page); await installEv(c.page);
  await startGame(c, 2); await waitAsk(c.page);
  const bubE = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('lang: ?lang=en → English prompt in the bubble', !VI_RE.test(bubE) && /[a-z]/i.test(bubE) && !badText(bubE), bubE);
  check('lang: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gGate() {
  const c = await open(DEV.iphoneP, 'mute=1');
  const g = await elCenter(c.page, '#btnParents');
  await c.page.touchscreen.tap(g.x, g.y); await sleep(400);
  check('gate: short tap on ⚙ does NOT open settings', !(await visible(c.page, 'scrSettings')));
  await touch(c.cdp, 'touchStart', [g]); await sleep(1000); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  check('gate: 1 s hold does NOT open settings', !(await visible(c.page, 'scrSettings')));
  await touch(c.cdp, 'touchStart', [g]); await sleep(400);
  await touch(c.cdp, 'touchMove', [{ x: g.x - 150, y: g.y + 200 }]); await sleep(1900); await touch(c.cdp, 'touchEnd', []); await sleep(200);
  check('gate: hold that slides off the gear is cancelled', !(await visible(c.page, 'scrSettings')));
  await touch(c.cdp, 'touchStart', [g]); await sleep(1000);
  const mid = await c.page.evaluate(() => +document.getElementById('btnParents').style.getPropertyValue('--p'));
  await sleep(1300); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  check('gate: hold shows progress', mid > 0.3 && mid < 0.8, mid);
  check('gate: 2 s hold with real touch opens settings', await visible(c.page, 'scrSettings'));
  check('gate: title hidden behind settings', !(await visible(c.page, 'scrTitle')));
  await shot(c, 'settings');
  check('gate: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gSettings() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  check('settings: opened by hold', await openSettingsByHold(c));
  await tapEl(c, '#ageChips [data-age="5"]');
  await c.page.locator('#inpName').fill('Mầm');
  await tapEl(c, '#scrSettings label.toggle:has(#optMusic)');
  await tapEl(c, '#scrSettings [data-lang="vi"]');
  await c.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 60; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const s1 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('fc:settings') || '{}'));
  check('settings: saved to localStorage rr:settings', s1.age === 5 && s1.name === 'Mầm' && s1.music === false && s1.lang === 'vi' && Math.abs(s1.volume - 0.6) < 1e-6, s1);
  await tapEl(c, '#btnSettingsDone');
  check('settings: Done returns to title', await visible(c.page, 'scrTitle') && !(await visible(c.page, 'scrSettings')));
  const ageTxt = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('settings: title shows the new age', /5/.test(ageTxt), ageTxt);
  await c.page.reload(); await waitTitle(c.page);
  const st = await c.page.evaluate(() => FC.debug.getState().settings);
  check('settings: persist across reload (age, name, music, lang, volume)', st.age === 5 && st.name === 'Mầm' && st.music === false && st.lang === 'vi' && Math.abs(st.volume - 0.6) < 1e-6, st);
  const chips = await c.page.evaluate(() => { FC.UI.refreshSettings(); return { on: [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age), name: document.getElementById('inpName').value, vol: document.getElementById('optVolume').value }; });
  check('settings: panel shows saved values after reload', chips.on.join() === '5' && chips.name === 'Mầm' && chips.vol === '60', chips);
  await installEv(c.page); await startGame(c, 2); await waitAsk(c.page);
  check('settings: saved age 5 is played', (await c.page.evaluate(() => FC.debug.world.age)) === 5);
  const praise = await c.page.evaluate(() => { const o = []; for (let i = 0; i < 40; i++) o.push(FC.I18N.t('vi', 'great', { child: 'Mầm' })); return o; });
  check('settings: the child\'s name is used in praise', praise.some(l => /Mầm/.test(l)) && praise.every(l => !badText(l)), [...new Set(praise)]);
  check('settings: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gFlags() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1&lang=vi&age=7&speed=2&seed=9', { ctx });
  const t1 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, ls: localStorage.getItem('fc:settings') }));
  check('flags: ?lang=vi&age=7 applied for the session', t1.l1 === 'Voi Bim' && /7/.test(t1.age), t1);
  check('flags: nothing saved just by loading with flags', t1.ls == null, t1.ls);
  await openSettingsByHold(c);
  await tapEl(c, '#scrSettings label.toggle:has(#optSfx)');
  const s2 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('fc:settings') || '{}'));
  check('flags: saving another setting does not store the flag values', s2.lang === 'en' && s2.age === 4 && s2.sfx === false && !('speed' in s2) && !('seed' in s2) && !('mute' in s2), s2);
  await tapEl(c, '#btnSettingsDone');
  await c.page.goto(srv.url + '?mute=1'); await waitTitle(c.page);
  const t2 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, s: FC.debug.getState().settings, sp: FC.debug.getState().speed }));
  check('flags: without flags → saved EN, age 4, normal speed again', /Bim/.test(t2.l1) && t2.l1 !== 'Voi Bim' && /4/.test(t2.age) && t2.s.sfx === false && t2.sp === 1, t2);
  check('flags: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gVolume() {
  const ctx = await newCtx();
  await ctx.addInitScript(() => {   // count real DynamicsCompressor nodes and what feeds the user gain
    const P = (window.AudioContext || window.webkitAudioContext).prototype, o = P.createDynamicsCompressor;
    P.createDynamicsCompressor = function () { const n = o.apply(this, arguments); window.__comp = (window.__comp || []); window.__comp.push(n); return n; };
  });
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  const A0 = await c.page.evaluate(async () => {
    const A = FC.debug.audio(); A.unlock(); await new Promise(r => setTimeout(r, 300));
    return { hasCtx: !!A.ctx, master: !!A.master, user: !!A.user, sfx: !!A.sfx, music: !!A.music, comp: A.ctx && (A.master.numberOfOutputs >= 1), gain: A.user && A.user.gain.value, vol: A.volume };
  });
  check('volume: audio chain exists (ctx, master, user gain, sfx, music)', A0.hasCtx && A0.master && A0.user && A0.sfx && A0.music, A0);
  // walk the graph: is there a DynamicsCompressorNode between master and user? (wrap connect to observe)
  const comp = await c.page.evaluate(() => (window.__comp || []).map(n => ({ thr: n.threshold.value, ratio: n.ratio.value, sameCtx: n.context === FC.debug.audio().ctx })));
  check('volume: a DynamicsCompressor is created on the game AudioContext', comp.length >= 1 && comp.some(n => n.sameCtx), comp);
  check('volume: user gain = volume × 1.6 makeup', A0.user && Math.abs(A0.gain - A0.vol * 1.6) < 0.05, A0);
  await openSettingsByHold(c);
  await c.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(400);
  const v = await c.page.evaluate(() => ({ S: FC.debug.getState().settings.volume, A: FC.debug.audio().volume, g: FC.debug.audio().user.gain.value, saved: JSON.parse(localStorage.getItem('fc:settings') || '{}').volume }));
  check('volume: slider 30 % → setting, saved, audio gain 0.48', Math.abs(v.S - 0.3) < 1e-6 && Math.abs(v.saved - 0.3) < 1e-6 && Math.abs(v.A - 0.3) < 1e-6 && Math.abs(v.g - 0.48) < 0.05, v);
  await tapEl(c, '#btnSettingsDone');
  await c.page.reload(); await waitTitle(c.page);
  const r = await c.page.evaluate(() => ({ S: FC.debug.getState().settings.volume, A: FC.debug.audio().volume, el: +document.getElementById('optVolume').value }));
  check('volume: persists across reload (setting, audio, slider)', Math.abs(r.S - 0.3) < 1e-6 && Math.abs(r.A - 0.3) < 1e-6 && r.el === 30, r);
  await installEv(c.page); await startGame(c, 1); await waitAsk(c.page);
  await tapEl(c, '#btnPause'); await sleep(200);
  const lv0 = await c.page.evaluate(() => document.getElementById('volLevel').textContent);
  check('volume: pause menu shows the level', lv0 === '30%', lv0);
  await tapEl(c, '#btnVolUp'); await tapEl(c, '#btnVolUp');
  const up = await c.page.evaluate(() => ({ S: FC.debug.getState().settings.volume, saved: JSON.parse(localStorage.getItem('fc:settings')).volume, lv: document.getElementById('volLevel').textContent }));
  check('volume: + + in pause → 50 %, saved', Math.abs(up.S - 0.5) < 1e-6 && Math.abs(up.saved - 0.5) < 1e-6 && up.lv === '50%', up);
  check('volume: pause −/+ taps never reach the world', (await downs(c.page)) === 0, await downs(c.page));
  check('volume: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

/* REAL tap on the right island → go, ignite/fly, lands on it, collect, camera climbs. */
async function gTap() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=13&age=4');
    const tag = `tap/${d.name}`;
    await startGame(c, 1); await waitAsk(c.page);
    const s0 = await wstate(c.page);
    await clearEv(c.page);
    const id = await tapRight(c);
    await sleep(120);
    const s1 = await wstate(c.page);
    const go = await evOf(c.page, 'go');
    check(`${tag}: real tap on the right island → go event`, go.length === 1 && go[0].id === id, go);
    check(`${tag}: rocket ignites/flies`, ['ignite', 'fly'].includes(s1.phase) && ['ignite', 'fly'].includes(s1.rphase), s1);
    await shot(c, 'tap-fly');
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'collect'), null, { timeout: 8000 }).catch(() => {});
    const land = await evOf(c.page, 'land'), col = await evOf(c.page, 'collect');
    check(`${tag}: lands on that island (land event + rocket.pad)`, land.length >= 1 && land[0].id === id && (await wstate(c.page)).pad === id, { land, pad: (await wstate(c.page)).pad, id });
    check(`${tag}: collect event`, col.length === 1, col);
    await c.page.waitForFunction(() => { const w = FC.debug.world; return (w.state === 'round' && w.phase === 'ask') || w.state === 'roundDone'; }, null, { timeout: 10000 }).catch(() => {});
    const s2 = await wstate(c.page);
    check(`${tag}: camera climbed (camY decreased)`, s2.camY < s0.camY - 50, { before: s0.camY, after: s2.camY });
    check(`${tag}: next hop asked`, s2.state === 'roundDone' || (s2.hop === s0.hop + 1 && s2.phase === 'ask'), s2);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Wrong island → wrong event, nothing advances, hint after the 2nd miss on the hop. */
async function gWrong() {
  for (const d of [DEV.iphoneP, DEV.ipadL, DEV.iphoneL]) {
    const c = await open(d, 'mute=1&seed=17&age=4');
    const tag = `wrong/${d.name}`;
    await startGame(c, 1); await waitAsk(c.page);
    const s0 = await wstate(c.page);
    const wr = (await rowIslands(c.page)).filter(i => !i.right);
    await clearEv(c.page);
    const n0 = await c.page.evaluate(() => FC.debug.voiceLog.length);
    await tapIsland(c, wr[0].id); await sleep(250);
    const w1 = await evOf(c.page, 'wrong'), s1 = await wstate(c.page);
    check(`${tag}: wrong island → wrong event`, w1.length === 1 && w1[0].id === wr[0].id && w1[0].misses === 1, w1);
    check(`${tag}: nothing advances (phase ask, same hop, same pad, no go)`, s1.phase === 'ask' && s1.hop === s0.hop && s1.pad === s0.pad && (await evOf(c.page, 'go')).length === 0, s1);
    check(`${tag}: no hint after the 1st miss`, (await evOf(c.page, 'hint')).length === 0);
    const lines = await c.page.evaluate(n => FC.debug.voiceLog.slice(n).map(l => l.text), n0);
    check(`${tag}: kind voice line (no negative words)`, lines.length >= 1 && lines.every(l => !badText(l) && !/\b(no|wrong|bad|sai|không đúng)\b/i.test(l)), lines);
    await sleep(500);
    await tapIsland(c, (wr[1] || wr[0]).id); await sleep(250);
    const h = await evOf(c.page, 'hint'), aid = await c.page.evaluate(() => FC.debug.answerId());
    check(`${tag}: hint on the right island after the 2nd miss on that hop`, h.length === 1 && h[0].id === aid, { h, aid, wrong: (await evOf(c.page, 'wrong')).length });
    await sleep(300);
    const glow = await c.page.evaluate(id => { const i = FC.debug.world.islandById(id); return i && (i.glow || i._glowT || 0); }, aid);
    check(`${tag}: the right island glows`, glow > 0, glow);
    check(`${tag}: still asking`, (await wstate(c.page)).phase === 'ask');
    await shot(c, 'wrong-hint');
    // the tap lock (1.6 s after the 2nd miss) ignores island taps: a spamming tap is 'locked', then the right tap works
    await clearEv(c.page);
    await tapRight(c); await sleep(120);
    check(`${tag}: a tap inside the wrong-tap lock is ignored (locked, no go)`, (await evOf(c.page, 'go')).length === 0 && (await evOf(c.page, 'locked')).length >= 1);
    await c.page.waitForFunction(() => FC.debug.world.time >= (FC.debug.world._lockUntil || 0), null, { timeout: 8000 }).catch(() => {});
    await clearEv(c.page);
    await tapRight(c); await sleep(150);
    check(`${tag}: the right tap after misses still launches`, (await evOf(c.page, 'go')).length === 1);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Drag from the rocket to the right island → launch; release on empty sky → cancels quietly. */
async function gDrag() {
  for (const d of [DEV.iphoneP, DEV.iphoneL, DEV.ipadP, DEV.ipadL]) {
    const c = await open(d, 'mute=1&seed=31&age=4');
    const tag = `drag/${d.name}`;
    await startGame(c, 1); await waitAsk(c.page);
    // (a) drag to empty sky → nothing
    const rk = await c.page.evaluate(() => FC.debug.rocketScreen());
    const e = await emptyPoint(c.page);
    check(`${tag}: found an empty sky point`, !!e, e);
    await clearEv(c.page);
    const s0 = await wstate(c.page);
    await touch(c.cdp, 'touchStart', [rk]); await sleep(30);
    const steps = 10;
    for (let k = 1; k <= steps; k++) { await touch(c.cdp, 'touchMove', [{ x: rk.x + (e.x - rk.x) * k / steps, y: rk.y + (e.y - rk.y) * k / steps }]); await sleep(25); }
    const aimMid = await c.page.evaluate(() => FC.debug.world.aim);
    await touch(c.cdp, 'touchEnd', []); await sleep(200);
    const ev = await evTypes(c.page), s1 = await wstate(c.page);
    check(`${tag}: aim line shown while dragging`, !!aimMid, aimMid);
    check(`${tag}: release on empty sky cancels quietly (no go / wrong / pokeBim)`, !ev.includes('go') && !ev.includes('wrong') && !ev.includes('pokeBim') && s1.phase === 'ask' && s1.misses === s0.misses, { ev, s1 });
    check(`${tag}: aim cleared after cancel`, (await c.page.evaluate(() => FC.debug.world.aim)) === null);
    // (b) drag to the right island → launch
    await clearEv(c.page);
    const id = await c.page.evaluate(() => FC.debug.answerId());
    const tgt = await c.page.evaluate(id => FC.debug.islandScreen(id), id);
    await touch(c.cdp, 'touchStart', [rk]); await sleep(30);
    let aimT = null;
    for (let k = 1; k <= steps; k++) {
      await touch(c.cdp, 'touchMove', [{ x: rk.x + (tgt.x - rk.x) * k / steps, y: rk.y + (tgt.y - rk.y) * k / steps }]); await sleep(25);
      if (k === steps) aimT = await c.page.evaluate(() => FC.debug.world.aim);
    }
    await touch(c.cdp, 'touchEnd', []); await sleep(150);
    const go = await evOf(c.page, 'go'), s2 = await wstate(c.page);
    check(`${tag}: aim targets the island under the finger`, aimT && aimT.target === id, aimT);
    check(`${tag}: drag released on the right island → launch`, go.length === 1 && go[0].id === id && ['ignite', 'fly'].includes(s2.phase), { go, s2 });
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'land'), null, { timeout: 8000 }).catch(() => {});
    check(`${tag}: lands on the dragged-to island`, (await wstate(c.page)).pad === id);
    // (c) drag to a wrong island → wrong event
    await waitAsk(c.page).catch(() => {});
    const st = await wstate(c.page);
    if (st.state === 'round') {
      await clearEv(c.page);
      const rk2 = await c.page.evaluate(() => FC.debug.rocketScreen());
      const wi = (await rowIslands(c.page)).find(i => !i.right);
      await drag(c, rk2, wi, 10, 25); await sleep(150);
      const w = await evOf(c.page, 'wrong');
      check(`${tag}: drag released on a wrong island → wrong event, no launch`, w.length === 1 && w[0].id === wi.id && (await evOf(c.page, 'go')).length === 0, { w, ev: await evTypes(c.page) });
    }
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Short tap on the rocket → pokeBim, prompt repeated. Bubble tap too. */
async function gPoke() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=61&age=4');
  await startGame(c, 1); await waitAsk(c.page); await sleep(400);
  const prompt = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  const rk = await c.page.evaluate(() => FC.debug.rocketScreen());
  const n0 = await c.page.evaluate(() => FC.debug.voiceLog.length);
  await clearEv(c.page);
  await c.page.touchscreen.tap(rk.x, rk.y); await sleep(300);
  const ev = await evTypes(c.page);
  const lines = await c.page.evaluate(n => FC.debug.voiceLog.slice(n).map(l => l.text), n0);
  check('poke: short tap on the rocket → pokeBim event', ev.includes('pokeBim') && !ev.includes('go') && !ev.includes('wrong'), ev);
  check('poke: voiceLog grows with the prompt', lines.length >= 1 && lines.includes(prompt), { lines, prompt });
  check('poke: phase still ask', (await wstate(c.page)).phase === 'ask');
  // long press without moving → not a poke, not a launch
  await clearEv(c.page);
  await touch(c.cdp, 'touchStart', [rk]); await sleep(700); await touch(c.cdp, 'touchEnd', []); await sleep(150);
  const ev2 = await evTypes(c.page);
  check('poke: long still press on the rocket does nothing', !ev2.includes('go') && !ev2.includes('wrong') && (await wstate(c.page)).phase === 'ask', ev2);
  // bubble tap repeats
  const n1 = await c.page.evaluate(() => FC.debug.voiceLog.length);
  const d0 = await downs(c.page);
  await tapEl(c, '#bubble'); await sleep(300);
  const l2 = await c.page.evaluate(n => FC.debug.voiceLog.slice(n).map(l => l.text), n1);
  check('poke: tap on the bubble repeats the prompt', l2.includes(prompt), { l2, prompt });
  check('poke: bubble tap never reaches the world', (await downs(c.page)) === d0);
  for (let i = 0; i < 8; i++) { await c.page.touchscreen.tap(rk.x, rk.y); await sleep(40); }
  check('poke: rapid rocket taps → still asking, no errors', (await wstate(c.page)).phase === 'ask' && c.errors.length === 0, c.errors);
  check('poke: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Taps during ignite / fly / land / climb are ignored. */
async function gFlight() {
  const c = await open(DEV.ipadL, 'mute=1&seed=41&age=4');
  await startGame(c, 1); await waitAsk(c.page);
  const isl = await rowIslands(c.page);
  const others = isl.filter(i => !i.right);
  await clearEv(c.page);
  await tapRight(c);
  const seen = {};
  const t0 = Date.now();
  while (Date.now() - t0 < 6000) {
    const s = await wstate(c.page);
    if (s.state !== 'round' || s.phase === 'ask' || s.phase === 'appear') break;
    if (!seen[s.phase]) {
      seen[s.phase] = true;
      for (const o of others) { const b = await c.page.evaluate(id => FC.debug.islandScreen(id), o.id); if (b) await c.page.touchscreen.tap(b.x, b.y); }
      const rk = await c.page.evaluate(() => FC.debug.rocketScreen()); if (rk) await c.page.touchscreen.tap(rk.x, rk.y);
    }
    await sleep(30);
  }
  const bad = await c.page.evaluate(() => window.__ev.filter(e => ['go', 'wrong', 'pokeBim', 'tapPad'].includes(e.type)).map(e => e.type + '@' + e.phase));
  check('flight: saw flight phases', Object.keys(seen).some(p => ['ignite', 'fly'].includes(p)), seen);
  check('flight: taps during ignite/fly/land/climb are ignored', bad.length === 1 && bad[0] === 'go@ask', bad);
  check('flight: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Boost by tap on the sky in boostReady. */
async function gBoost() {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const c = await open(d, 'mute=1&seed=51&age=4');
    const tag = `boost/${d.name}`;
    await startGame(c, 1); await waitAsk(c.page);
    const ok = await playRoundByTouch(c);
    check(`${tag}: round 1 finished by touch → roundDone`, ok, await wstate(c.page));
    const rd = await evOf(c.page, 'roundDone');
    check(`${tag}: roundDone with 3 stars (no miss)`, rd.length === 1 && rd[0].stars === 3, rd);
    await c.page.waitForFunction(() => FC.debug.world.phase === 'boostReady', null, { timeout: 6000 }).catch(() => {});
    check(`${tag}: phase boostReady after stars`, (await wstate(c.page)).phase === 'boostReady');
    await shot(c, 'boost-ready');
    const cam0 = (await wstate(c.page)).camY;
    await clearEv(c.page);
    const e = await emptyPoint(c.page);
    await c.page.touchscreen.tap(e.x, e.y); await sleep(150);
    const b = await evOf(c.page, 'boost');
    check(`${tag}: tap on the sky in boostReady → boost (not auto)`, b.length === 1 && b[0].auto === false, b);
    await sleep(500); await shot(c, 'boost-fly');
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'boostEnd'), null, { timeout: 8000 }).catch(() => {});
    check(`${tag}: boostEnd`, (await evOf(c.page, 'boostEnd')).length === 1);
    await waitAsk(c.page).catch(() => {});
    const s = await wstate(c.page);
    check(`${tag}: next round starts asking, camera climbed`, s.state === 'round' && s.round === 1 && s.phase === 'ask' && s.camY < cam0 - 100, { s, cam0 });
    // tap on the rocket in boostReady also boosts
    const ok2 = await playRoundByTouch(c);
    await c.page.waitForFunction(() => FC.debug.world.phase === 'boostReady', null, { timeout: 6000 }).catch(() => {});
    await clearEv(c.page);
    const rk = await c.page.evaluate(() => FC.debug.rocketScreen());
    await c.page.touchscreen.tap(rk.x, rk.y); await sleep(150);
    const b2 = await evOf(c.page, 'boost');
    check(`${tag}: tap on the rocket in boostReady → boost`, ok2 && b2.length === 1 && b2[0].auto === false, b2);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* No tap in boostReady → auto boost after ~5 s. */
async function gAutoBoost() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=52&age=4');
  await startGame(c, 1); await waitAsk(c.page);
  await playRoundByTouch(c);
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'boostReady'), null, { timeout: 6000 }).catch(() => {});
  const t0 = Date.now();
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'boost'), null, { timeout: 9000 }).catch(() => {});
  const real = (Date.now() - t0) / 1000;
  const br = (await evOf(c.page, 'boostReady'))[0], b = (await evOf(c.page, 'boost'))[0];
  const dt = br && b ? b.wt - br.wt : null;
  const ab = await c.page.evaluate(() => FC.CONFIG.autoBoost);
  check('autoboost: boost starts by itself after CONFIG.autoBoost s (world time)', b && b.auto === true && dt > ab - 0.2 && dt < ab + 0.3, { dt, ab, real, b });
  await waitAsk(c.page).catch(() => {});
  check('autoboost: next round asks', (await wstate(c.page)).phase === 'ask');
  check('autoboost: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Talk time answered by tapping a choice. */
async function toTalk(c) {
  await c.page.evaluate(() => { window.__stopBotOnTalk = true; FC.debug.setBot(true, 1); FC.debug.setSpeed(8); });
  await c.page.waitForFunction(() => FC.debug.mode === 'talk' && FC.debug.world.state === 'talk', null, { timeout: 120000 });
  await c.page.evaluate(() => { window.__stopBotOnTalk = false; FC.debug.setBot(false); FC.debug.setSpeed(1); });
  await sleep(400);
}
async function gTalk() {
  for (const d of [DEV.ipadL, DEV.iphoneP, DEV.iphoneL]) {
    const c = await open(d, 'mute=1&seed=71&age=4');
    const tag = `talk/${d.name}`;
    await startGame(c, 2);
    await toTalk(c);
    check(`${tag}: Talk time screen opens after the chapter`, await visible(c.page, 'scrTalk'));
    await shot(c, 'talk');
    const tk = await c.page.evaluate(() => { const t = FC.debug.world.talk; return { answerId: t.answerId, ids: t.choices.map(c => c.id), q: document.getElementById('talkQ').textContent, btns: [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.id, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; }) }; });
    check(`${tag}: 2–4 choice buttons ≥ 64 px, on screen`, tk.btns.length >= 2 && tk.btns.length <= 4 && tk.btns.every(b => b.w >= 64 && b.h >= 64 && b.l >= 0 && b.t >= 0 && b.r <= d.viewport.width && b.b <= d.viewport.height), tk.btns);
    check(`${tag}: question text clean`, !badText(tk.q), tk.q);
    const s0 = await c.page.evaluate(() => FC.debug.world.stars);
    await clearEv(c.page);
    const d0 = await downs(c.page);
    await tapEl(c, `#talkChoices button[data-id="${tk.answerId}"]`); await sleep(300);
    const tr = await evOf(c.page, 'talkResult');
    check(`${tag}: right answer by tap → talkResult correct`, tr.length === 1 && tr[0].correct === true, tr);
    check(`${tag}: stars +1`, (await c.page.evaluate(() => FC.debug.world.stars)) === s0 + 1, { s0, s1: await c.page.evaluate(() => FC.debug.world.stars) });
    check(`${tag}: choice taps never reach the world`, (await downs(c.page)) === d0);
    const other = tk.ids.find(i => i !== tk.answerId);
    await tapEl(c, `#talkChoices button[data-id="${other}"]`); await sleep(200);
    check(`${tag}: a second answer is ignored`, (await evOf(c.page, 'talkResult')).length === 1);
    await sleep(2500);
    await c.page.evaluate(() => FC.debug.setSpeed(2));
    await c.page.waitForFunction(() => FC.debug.world.level === 1 && FC.debug.mode === 'play', null, { timeout: 15000 }).catch(() => {});
    check(`${tag}: next chapter starts, talk screen closed`, (await c.page.evaluate(() => FC.debug.world.level)) === 1 && !(await visible(c.page, 'scrTalk')) && (await mode(c.page)) === 'play', await wstate(c.page));
    await waitAsk(c.page).catch(() => {});
    const hud = await c.page.evaluate(() => +document.getElementById('hudStars').textContent);
    const ws = await c.page.evaluate(() => FC.debug.world.stars);
    check(`${tag}: HUD star count = world stars`, hud === ws, { hud, ws });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Pause / resume via the pause button. */
async function gPause() {
  const c = await open(DEV.iphoneP, 'mute=1&seed=81&age=4');
  await startGame(c, 1); await waitAsk(c.page);
  await tapEl(c, '#btnPause'); await sleep(200);
  check('pause: pause button → paused, pause screen', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  await shot(c, 'pause');
  const t0 = await c.page.evaluate(() => FC.debug.world.time);
  await sleep(800);
  const t1 = await c.page.evaluate(() => FC.debug.world.time);
  check('pause: world time frozen while paused', t1 === t0, { t0, t1 });
  const d0 = await downs(c.page);
  await tapEl(c, '#btnResume'); await sleep(200);
  check('pause: resume → play, pause screen hidden', (await mode(c.page)) === 'play' && !(await visible(c.page, 'scrPause')));
  check('pause: resume tap does not reach the world', (await downs(c.page)) === d0);
  await clearEv(c.page);
  await tapRight(c); await sleep(150);
  check('pause: a tap on the right island still works after resume', (await evOf(c.page, 'go')).length === 1);
  // pause mid-flight → resume → flight completes
  await tapEl(c, '#btnPause'); await sleep(300); await tapEl(c, '#btnResume');
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'collect'), null, { timeout: 8000 }).catch(() => {});
  check('pause: flight completes after pause/resume mid-flight', (await evOf(c.page, 'collect')).length === 1);
  // Home
  await waitAsk(c.page).catch(() => {});
  await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(300);
  check('pause: Home → title', (await mode(c.page)) === 'title' && await visible(c.page, 'scrTitle') && !(await visible(c.page, 'hud')) && !(await visible(c.page, 'bubble')));
  await tapEl(c, '#btnPlay'); await sleep(300);
  await waitAsk(c.page).catch(() => {});
  const s = await wstate(c.page);
  check('pause: Play after Home starts a fresh session', s.mode === 'play' && s.level === 0 && s.round === 0 && s.stars === 0, s);
  check('pause: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gVisibility() {
  const c = await open(DEV.ipadP, 'mute=1&seed=82&age=4');
  await startGame(c, 1); await waitAsk(c.page);
  await c.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  check('visibility: hidden page → paused', (await mode(c.page)) === 'paused');
  await c.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  check('visibility: back visible → still paused (waits for the child)', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  await tapEl(c, '#btnResume');
  await clearEv(c.page); await tapRight(c); await sleep(150);
  check('visibility: play continues after resume', (await evOf(c.page, 'go')).length === 1);
  // hidden mid-drag cancels the aim
  await waitAsk(c.page);
  const rk = await c.page.evaluate(() => FC.debug.rocketScreen());
  await touch(c.cdp, 'touchStart', [rk]); await touch(c.cdp, 'touchMove', [{ x: rk.x + 10, y: rk.y - 80 }]); await sleep(50);
  await c.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); });
  await touch(c.cdp, 'touchEnd', []); await sleep(100);
  check('visibility: hidden mid-drag → aim cancelled', (await c.page.evaluate(() => FC.debug.world.aim)) === null);
  check('visibility: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Rotate mid-flight and mid-ask. */
async function gRotate() {
  const pairs = [[DEV.iphoneP, DEV.iphoneL], [DEV.iphoneL, DEV.iphoneP], [DEV.ipadL, DEV.ipadP], [DEV.ipadP, DEV.ipadL]];
  for (const [a, b] of pairs) {
    const c = await open(a, 'mute=1&seed=91&age=4');
    const tag = `rotate/${a.name}→${b.name}`;
    await startGame(c, 1); await waitAsk(c.page);
    // mid-ask
    await c.page.setViewportSize(b.viewport); await sleep(600);
    const isl = await rowIslands(c.page);
    const inside = isl.every(i => onScreen(i, b.viewport.width, b.viewport.height));
    check(`${tag} mid-ask: islands stay inside the screen`, isl.length >= 2 && inside, isl.map(i => ({ id: i.id, x: Math.round(i.x), y: Math.round(i.y), w: Math.round(i.w), h: Math.round(i.h) })));
    const rk = await c.page.evaluate(() => FC.debug.rocketScreen());
    check(`${tag} mid-ask: rocket inside the screen`, onScreen({ x: rk.x, y: rk.y, w: rk.w * 0.5, h: rk.h * 0.5 }, b.viewport.width, b.viewport.height), rk);
    check(`${tag} mid-ask: still asking`, (await wstate(c.page)).phase === 'ask');
    await shot(c, 'rotate-ask-' + b.name);
    await clearEv(c.page);
    const id = await tapRight(c); await sleep(150);
    check(`${tag} mid-ask: right tap after rotating launches`, (await evOf(c.page, 'go')).length === 1);
    // mid-flight: rotate back
    await c.page.waitForFunction(() => FC.debug.world.phase === 'fly', null, { timeout: 3000 }).catch(() => {});
    await c.page.setViewportSize(a.viewport); await sleep(300);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'collect'), null, { timeout: 8000 }).catch(() => {});
    check(`${tag} mid-flight: rocket lands on the tapped island`, (await wstate(c.page)).pad === id && (await evOf(c.page, 'collect')).length === 1, await wstate(c.page));
    await waitAsk(c.page).catch(() => {});
    const isl2 = await rowIslands(c.page);
    check(`${tag} mid-flight: next row inside the screen`, isl2.length >= 2 && isl2.every(i => onScreen(i, a.viewport.width, a.viewport.height)), isl2.map(i => ({ x: Math.round(i.x), y: Math.round(i.y), w: Math.round(i.w), h: Math.round(i.h) })));
    const rk2 = await c.page.evaluate(() => FC.debug.rocketScreen());
    check(`${tag} mid-flight: rocket on screen afterwards`, onScreen({ x: rk2.x, y: rk2.y, w: rk2.w * 0.5, h: rk2.h * 0.5 }, a.viewport.width, a.viewport.height), rk2);
    await clearEv(c.page);
    const st = await wstate(c.page);
    if (st.state === 'round') { await tapRight(c); await sleep(150); }
    check(`${tag}: a later tap on the right island still works`, st.state === 'roundDone' || (await evOf(c.page, 'go')).length === 1, st);
    await shot(c, 'rotate-after');
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Full bot sessions at high speed. */
async function gBot() {
  const runs = [[3, DEV.iphoneP], [4, DEV.ipadL], [5, DEV.iphoneL], [7, DEV.ipadP]];
  for (const [age, d] of runs) {
    const c = await open(d, `mute=1&seed=${100 + age}&age=${age}`);
    const tag = `bot/age${age} ${d.name}`;
    await c.page.evaluate(() => { FC.debug.setBot(true, 0.7); FC.debug.setSpeed(10); FC.debug.startGame(); });
    const t0 = Date.now();
    let ok = true;
    try { await c.page.waitForFunction(() => FC.debug.mode === 'done', null, { timeout: 240000 }); } catch (e) { ok = false; }
    const st = await c.page.evaluate(() => ({ s: FC.debug.getState(), stats: FC.debug.stats, age: FC.debug.world.age, levels: FC.debug.world.levels }));
    check(`${tag}: session reaches mode done`, ok, st);
    check(`${tag}: played at age ${age}`, st.age === age, st.age);
    const cnt = await c.page.evaluate(() => { const n = t => window.__ev.filter(e => e.type === t).length; return { level: n('level'), talk: n('talk'), roundDone: n('roundDone'), boost: n('boost'), sessionDone: n('sessionDone'), wrong: n('wrong'), go: n('go') }; });
    check(`${tag}: 4 chapters, 4 talks, every round boosted`, cnt.level === 4 && cnt.talk === 4 && cnt.roundDone === cnt.boost && cnt.sessionDone === 1, cnt);
    const vl = await c.page.evaluate(() => FC.debug.voiceLog.map(l => l.text).filter(t => { return /[{}]|\bundefined\b|\bNaN\b|\[object/.test(t) || /\b(p|ui|topic|talk|session|weather|surprise)\.[a-zA-Z]/.test(t); }));
    check(`${tag}: no raw keys / undefined in voice lines`, vl.length === 0, vl.slice(0, 5));
    console.log(`      ${tag}: ${((Date.now() - t0) / 1000).toFixed(1)} s, stats ${JSON.stringify(st.stats)}`);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors.slice(0, 5));
    await c.close();
  }
}

/* Moon party screen, Play again, Home. */
async function gDone() {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const c = await open(d, 'mute=1&seed=120&age=4');
    const tag = `done/${d.name}`;
    await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(10); FC.debug.startGame(); });
    await c.page.waitForFunction(() => FC.debug.mode === 'done', null, { timeout: 240000 }).catch(() => {});
    await c.page.evaluate(() => { FC.debug.setBot(false); FC.debug.setSpeed(1); });
    await sleep(1200);
    const st = await c.page.evaluate(() => ({ mode: FC.debug.mode, title: document.getElementById('doneTitle').textContent, stars: +document.getElementById('doneStars').textContent, ws: FC.debug.world.stars, weather: FC.debug.weather && FC.debug.weather.index }));
    check(`${tag}: moon party screen shown with stars`, st.mode === 'done' && await visible(c.page, 'scrDone') && st.stars === st.ws && st.stars > 0 && !badText(st.title), st);
    await shot(c, 'done');
    const btns = await c.page.evaluate(() => ['btnAgain', 'btnDoneHome'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, b: r.bottom, r: r.right }; }));
    check(`${tag}: Play again / Home buttons ≥ 44 px & on screen`, btns.every(b => b.w >= 44 && b.h >= 44 && b.b <= d.viewport.height && b.r <= d.viewport.width), btns);
    const titleStars0 = await c.page.evaluate(() => +document.getElementById('titleStars').textContent);
    await clearEv(c.page);
    await tapEl(c, '#btnAgain'); await sleep(300);
    await waitAsk(c.page).catch(() => {});
    const s = await wstate(c.page);
    check(`${tag}: Play again → new session (level 0, round 0, stars 0, HUD 0)`, s.mode === 'play' && s.level === 0 && s.round === 0 && s.stars === 0 && (await c.page.evaluate(() => document.getElementById('hudStars').textContent)) === '0' && !(await visible(c.page, 'scrDone')), s);
    await clearEv(c.page);
    await tapRight(c); await sleep(150);
    check(`${tag}: taps work in the new session`, (await evOf(c.page, 'go')).length === 1);
    // finish again and go Home
    await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(10); });
    await c.page.waitForFunction(() => FC.debug.mode === 'done', null, { timeout: 240000 }).catch(() => {});
    await c.page.evaluate(() => { FC.debug.setBot(false); FC.debug.setSpeed(1); });
    await sleep(600);
    await tapEl(c, '#btnDoneHome'); await sleep(300);
    const t = await c.page.evaluate(() => ({ mode: FC.debug.mode, stars: +document.getElementById('titleStars').textContent }));
    check(`${tag}: Home → title, total stars grew`, t.mode === 'title' && await visible(c.page, 'scrTitle') && t.stars > titleStars0, { t, titleStars0 });
    await c.page.reload(); await waitTitle(c.page);
    const t2 = await c.page.evaluate(() => +document.getElementById('titleStars').textContent);
    check(`${tag}: total stars persist across reload`, t2 === t.stars, { t2, t: t.stars });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Every asked row through a whole session (bot) on every device / several ages: islands on screen, clear of the DOM HUD and
 * bubble, hit boxes ≥ 60 px and not overlapping, rocket + wagon on screen. */
const rowAudit = page => page.evaluate(() => {
  const w = FC.debug.world, out = [], a = FC.debug.answerId();
  const rows = (w.islands || []).filter(i => i.state === 'idle' && i.id !== w.rocket.pad);
  const box = b => ({ l: b.x - b.w / 2, t: b.y - b.h / 2, r: b.x + b.w / 2, b: b.y + b.h / 2 });
  const ov = (p, q) => Math.min(p.r, q.r) - Math.max(p.l, q.l) > 2 && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 2;
  const dom = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const hud = dom('hud'), bub = dom('bubble');
  const bs = rows.map(i => ({ id: i.id, b: box(FC.debug.islandScreen(i.id)), raw: FC.debug.islandScreen(i.id) }));
  for (const x of bs) {
    if (x.b.l < -2 || x.b.t < -2 || x.b.r > innerWidth + 2 || x.b.b > innerHeight + 2) out.push(`island ${x.id} off screen ${JSON.stringify(x.b)}`);
    if (hud && ov(x.b, hud)) out.push(`island ${x.id} under HUD`);
    if (bub && ov(x.b, bub)) out.push(`island ${x.id} under bubble (${Math.round(Math.min(x.b.b, bub.b) - Math.max(x.b.t, bub.t))} px)`);
    if (x.raw.w < 60 || x.raw.h < 60) out.push(`island ${x.id} small ${Math.round(x.raw.w)}×${Math.round(x.raw.h)}`);
  }
  // taps on an island's cloud body or its token must resolve to that island (nearest wins where hit pads touch),
  // and centres keep the DESIGN §2 spacing (islandW + 28 logical px; 6 px tolerance)
  for (const i of rows) {
    const a = w._rowIsland(i.x, i.y + i.h / 2), b = w._rowIsland(i.x, i.y - w.tokenSize(i) / 2);
    if (!a || a.id !== i.id) out.push(`tap on island ${i.id} body resolves to ${a && a.id}`);
    if (!b || b.id !== i.id) out.push(`tap on island ${i.id} token resolves to ${b && b.id}`);
    for (const j of rows) if (j.id > i.id && Math.hypot(i.x - j.x, i.y - j.y) < w.layout.islandW + 28 - 6) out.push(`islands ${i.id}/${j.id} closer than islandW+28 (${Math.round(Math.hypot(i.x - j.x, i.y - j.y))} < ${w.layout.islandW + 28})`);
  }
  const rk = FC.debug.rocketScreen();
  if (rk && (rk.x < 0 || rk.x > innerWidth || rk.y - rk.h / 2 < -2 || rk.y + rk.h / 2 > innerHeight + 2)) out.push('rocket off screen ' + JSON.stringify(rk));
  return { out, n: rows.length, hasA: rows.some(i => i.id === a), level: w.level, round: w.round, hop: w.hop, topic: w.topic };
});
async function gLayout() {
  const runs = [[DEV.iphoneP, 5], [DEV.iphoneL, 5], [DEV.ipadP, 4], [DEV.ipadL, 4], [DEV.iphoneP, 3], [DEV.iphoneL, 7], [DEV.iphoneP, 7], [DEV.ipadP, 6]];
  for (const [d, age] of runs) {
    const c = await open(d, `mute=1&seed=${200 + age}&age=${age}`);
    const tag = `layout/${d.name} age${age}`;
    await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(3); FC.debug.startGame(); });
    const seen = new Set(), viol = [], counts = {};
    const t0 = Date.now();
    let lastShot = -1;
    while (Date.now() - t0 < 300000) {
      const s = await c.page.evaluate(() => ({ mode: FC.debug.mode, st: FC.debug.world.state, ph: FC.debug.world.phase, k: FC.debug.world.level + ':' + FC.debug.world.round + ':' + FC.debug.world.hop }));
      if (s.mode === 'done') break;
      if (s.st === 'round' && s.ph === 'ask' && !seen.has(s.k)) {
        await sleep(30);
        const r = await rowAudit(c.page);
        seen.add(s.k);
        counts[r.topic] = counts[r.topic] || new Set(); counts[r.topic].add(r.n);
        if (!r.hasA) viol.push(s.k + ' answer not in row');
        r.out.forEach(o => viol.push(`${s.k} ${r.topic}: ${o}`));
        if (r.out.length && lastShot !== r.level) { lastShot = r.level; await shot(c, `layout-age${age}-L${r.level}-viol`); }
      }
      await sleep(40);
    }
    check(`${tag}: audited ≥ 30 asked rows`, seen.size >= 30, seen.size);
    check(`${tag}: every row on screen, clear of HUD/bubble, big, no overlap`, viol.length === 0, viol.slice(0, 8).concat(viol.length > 8 ? ['… ' + viol.length + ' total'] : []));
    console.log(`      ${tag}: islands per topic ${JSON.stringify(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, [...v]])))}`);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors.slice(0, 5));
    await c.close();
  }
}

/* Input edge cases. */
async function gMisc() {
  const c = await open(DEV.iphoneP, 'mute=1&seed=301&age=4');
  await startGame(c, 1); await waitAsk(c.page);
  // tap the launch pad (under the rocket's wagon side) → repeats the prompt
  const pad = await c.page.evaluate(() => { const w = FC.debug.world, p = w.islandById(w.rocket.pad); if (!p) return null; const r = FC.debug.rocketScreen(), v = FC.debug.view(); const b = FC.debug.islandScreen(p.id); return { b, r, edge: { x: v.left + (p.x + p.w * 0.42) * v.s, y: v.top + (p.y + p.h * 0.5 - w.camY) * v.s } }; });
  await clearEv(c.page);
  if (pad) { await c.page.touchscreen.tap(pad.edge.x, pad.edge.y); await sleep(200); }
  const ev = await evTypes(c.page);
  check('misc: tap on the pad edge → tapPad or pokeBim (prompt repeat), no answer', ev.some(t => t === 'tapPad' || t === 'pokeBim') && !ev.includes('go') && !ev.includes('wrong'), { ev, pad });
  // a second finger while the first is down is ignored
  const isl = await rowIslands(c.page), right = isl.find(i => i.right), wrongI = isl.find(i => !i.right);
  const e = await emptyPoint(c.page);
  await clearEv(c.page);
  await touch(c.cdp, 'touchStart', [{ x: e.x, y: e.y, id: 1 }]); await sleep(60);
  await touch(c.cdp, 'touchStart', [{ x: e.x, y: e.y, id: 1 }, { x: wrongI.x, y: wrongI.y, id: 2 }]); await sleep(60);
  await touch(c.cdp, 'touchEnd', [{ x: e.x, y: e.y, id: 1 }]); await sleep(40);
  await touch(c.cdp, 'touchEnd', []); await sleep(150);
  check('misc: second simultaneous finger on a wrong island is ignored', (await evOf(c.page, 'wrong')).length === 0, await evTypes(c.page));
  // touchcancel mid-drag → aim cleared, no launch; then a tap works
  const rk = await c.page.evaluate(() => FC.debug.rocketScreen());
  await clearEv(c.page);
  await touch(c.cdp, 'touchStart', [rk]); await touch(c.cdp, 'touchMove', [{ x: (rk.x + right.x) / 2, y: (rk.y + right.y) / 2 }]); await touch(c.cdp, 'touchMove', [{ x: right.x, y: right.y }]); await sleep(40);
  await touch(c.cdp, 'touchCancel', []); await sleep(150);
  check('misc: touchcancel mid-drag → no launch, aim cleared', (await evOf(c.page, 'go')).length === 0 && (await c.page.evaluate(() => FC.debug.world.aim)) === null, await evTypes(c.page));
  // rotate mid-drag: the drag is cancelled, no stuck aim
  await touch(c.cdp, 'touchStart', [rk]); await touch(c.cdp, 'touchMove', [{ x: rk.x, y: rk.y - 100 }]); await sleep(40);
  await c.page.setViewportSize(DEV.iphoneL.viewport); await sleep(500);
  await touch(c.cdp, 'touchEnd', []); await sleep(100);
  check('misc: rotate mid-drag → aim cleared, still asking', (await c.page.evaluate(() => FC.debug.world.aim)) === null && (await wstate(c.page)).phase === 'ask', await wstate(c.page));
  await clearEv(c.page); await tapRight(c); await sleep(150);
  check('misc: tap after cancel/rotate launches', (await evOf(c.page, 'go')).length === 1);
  // rotate mid-boost
  await c.page.setViewportSize(DEV.iphoneP.viewport); await sleep(400);
  await playRoundByTouch(c);
  await c.page.waitForFunction(() => FC.debug.world.phase === 'boostReady', null, { timeout: 6000 }).catch(() => {});
  await clearEv(c.page);
  const e2 = await emptyPoint(c.page); await c.page.touchscreen.tap(e2.x, e2.y);
  await sleep(300);
  await c.page.setViewportSize(DEV.iphoneL.viewport); await sleep(400);
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'boostEnd'), null, { timeout: 8000 }).catch(() => {});
  await waitAsk(c.page).catch(() => {});
  const isl2 = await rowIslands(c.page), rk2 = await c.page.evaluate(() => FC.debug.rocketScreen());
  check('misc: rotate mid-boost → next row on screen, rocket on screen', (await wstate(c.page)).phase === 'ask' && isl2.every(i => onScreen(i, 852, 393)) && rk2.y + rk2.h / 2 <= 395 && rk2.y - rk2.h / 2 >= -2, { isl2, rk2 });
  await shot({ page: c.page, dev: DEV.iphoneL }, 'misc-after-boost-rotate');
  await clearEv(c.page); await tapRight(c); await sleep(150);
  check('misc: tap works after rotate mid-boost', (await evOf(c.page, 'go')).length === 1);
  // idle: no tap for 12 s → idle nudge; second idle → hint
  await waitAsk(c.page).catch(() => {});
  await clearEv(c.page);
  await c.page.evaluate(() => FC.debug.setSpeed(6));
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'idle').length >= 2, null, { timeout: 15000 }).catch(() => {});
  await c.page.evaluate(() => FC.debug.setSpeed(1));
  const idl = await evOf(c.page, 'idle'), hi = await evOf(c.page, 'hint');
  check('misc: idle nudges (12 s), 2nd idle hints', idl.length >= 2 && hi.length >= 1, { idl: idl.map(i => i.wt), hi: hi.length });
  check('misc: still play mode (no auto-pause after 2 idles)', (await mode(c.page)) === 'play');
  check('misc: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Shooting star surprise: visible (not behind the DOM bubble/HUD) and tappable. */
async function gShooting() {
  for (const d of [DEV.ipadL, DEV.iphoneP, DEV.iphoneL]) {
    const c = await open(d, 'mute=1&seed=400&age=4');
    const tag = `shooting/${d.name}`;
    await startGame(c, 1);
    await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(4); });
    const has = await c.page.waitForFunction(() => !!FC.debug.world.shooting, null, { timeout: 60000 }).then(() => true).catch(() => false);
    check(`${tag}: a shooting-star surprise appears in chapter 1 (seed 400)`, has);
    if (!has) { await c.close(); continue; }
    await c.page.evaluate(() => { FC.debug.setBot(false); FC.debug.setSpeed(1); });
    await clearEv(c.page);
    // sample the path: which DOM element is on top of the star?
    let n = 0, hidden = 0, tapped = false;
    for (let k = 0; k < 60; k++) {
      const q = await c.page.evaluate(() => {
        const w = FC.debug.world, s = w.shooting; if (!s || s.caught) return null;
        const p = FC.debug.toScreen(s.x, s.y - w.camY); if (p.x < 0 || p.x > innerWidth) return { off: true };
        const v = FC.debug.view(), r = 26 * v.s;   // the drawn star head ≈ 26 logical px
        const rects = ['bubble', 'hud'].map(id => document.getElementById(id)).filter(e => e && !e.classList.contains('hidden')).map(e => e.getBoundingClientRect());
        const under = rects.some(R => p.x + r > R.left && p.x - r < R.right && p.y + r > R.top && p.y - r < R.bottom);
        const clear = !rects.some(R => p.x + 40 > R.left && p.x - 40 < R.right && p.y + 40 > R.top && p.y - 40 < R.bottom);
        return { x: p.x, y: p.y, under, clear };
      });
      if (!q) break;
      if (!q.off) { n++; if (q.under) hidden++; }
      if (!tapped && !q.off && q.clear && q.x > d.viewport.width * 0.5) {
        const p = await c.page.evaluate(() => { const w = FC.debug.world, s = w.shooting; return FC.debug.toScreen(s.x + s.vx * 0.04, s.y + s.vy * 0.04 - w.camY); });
        await c.page.touchscreen.tap(p.x, p.y); tapped = true; await sleep(100);
      }
      await sleep(45);
    }
    check(`${tag}: shooting star never hidden behind the bubble / HUD`, n > 0 && hidden === 0, { samplesOnScreen: n, behindDom: hidden, pct: n ? Math.round(100 * hidden / n) + '%' : '-' });
    check(`${tag}: tap on the shooting star where it is clear of the DOM → shootingTap`, tapped && (await evOf(c.page, 'shootingTap')).length === 1, { tapped, ev: await evTypes(c.page), note: tapped ? '' : 'star never clear of bubble/HUD by 40 px on its path' });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

const GROUPS = { boot: gBoot, lang: gLang, gate: gGate, settings: gSettings, flags: gFlags, volume: gVolume, tap: gTap, wrong: gWrong, drag: gDrag,
  poke: gPoke, flight: gFlight, boost: gBoost, autoboost: gAutoBoost, talk: gTalk, pause: gPause, visibility: gVisibility, rotate: gRotate, bot: gBot, done: gDone, layout: gLayout, misc: gMisc, shooting: gShooting };

(async () => {
  srv = await serve(process.env.RR_GAME_ROOT || undefined);
  browser = await chromium.launch();
  for (const [g, fn] of Object.entries(GROUPS)) {
    if (!want(g)) continue;
    curGroup = g;
    console.log(`--- ${g}`);
    try { await fn(); } catch (e) { check(`${g}: group ran without exception`, false, String(e && e.stack || e).slice(0, 600)); }
  }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  const byG = {};
  results.forEach(r => { byG[r.group] = byG[r.group] || { pass: 0, fail: 0 }; byG[r.group][r.ok ? 'pass' : 'fail']++; });
  console.log('\n=== summary');
  for (const [g, v] of Object.entries(byG)) console.log(`${g.padEnd(11)} ${String(v.pass).padStart(3)} pass ${String(v.fail).padStart(3)} fail`);
  console.log(`TOTAL ${results.length - fails.length} pass, ${fails.length} fail`);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})();
