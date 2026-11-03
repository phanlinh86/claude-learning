// Functional QA suite for Pip's Camp Hide & Seek — REAL touch input (CDP) on iPhone/iPad-sized mobile contexts.
//   node tests/e2e/functional.js                       (all groups)
//   node tests/e2e/functional.js tap wrong rotate      (only some groups)
//   JOBS=3 node tests/e2e/functional.js                (groups run in parallel pages; default 2–3 by CPU count)
// Groups: boot lang gate settings flags volume tap wrong empty poke count countup talk pause visibility rotate bot done
//         layout misc surprise
// Prints PASS/FAIL per check + a per-group summary, writes tests/out/functional/results.json (+ screenshots),
// exits 1 on any FAIL. Never edits the game: it only reads FC.debug / world state and taps the screen.
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
const JOBS = Math.max(1, +process.env.JOBS || Math.min(3, Math.max(2, require('os').cpus().length - 1)));
const HEAVY = Math.max(1, Math.min(4, require('os').cpus().length - 1));   // parallel pages inside the bot / layout groups

const results = [];
function checker(group, log) {
  return function check(name, ok, info) {
    results.push({ group, name, ok: !!ok, info: ok || info == null ? '' : info });
    log.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 700)));
    return !!ok;
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũờởỡợứừửữựấầẩẫậắằẳẵặếềểễệốồổỗộớ]/i;
function badText(s) {
  if (s == null) return null;
  s = String(s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|weather|surprise|name|countNum|critter|gather)\.[a-zA-Z0-9]/.test(s)) return 'raw i18n key';
  return null;
}

let srv, browser;
const ctxOpts = d => ({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
async function open(dev, q = '', opt = {}) {
  const ctx = opt.ctx || await browser.newContext(ctxOpts(dev));
  if (opt.init) await ctx.addInitScript(opt.init);
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
/* Record a COPY of every world event (main still drains and handles them) + count world.pointerDown calls. */
async function installEv(page) {
  await page.evaluate(() => {
    window.__ev = window.__ev || []; window.__downs = window.__downs || 0;
    const w = FC.debug.world;
    if (w.__hooked) return;
    w.__hooked = true;
    const o = w._emit;
    w._emit = function (e) {
      const c = Object.assign({ at: performance.now(), wt: this.time, ph: this.phase, st: this.state }, e);
      delete c.talk; delete c.clue;
      if (e.type === 'wrong') c.lockLeft = this._lockUntil - this.time;
      window.__ev.push(c);
      if (window.__ev.length > 4000) window.__ev.splice(0, 1000);
      if (e.type === 'talk' && window.__stopBotOnTalk) { FC.debug.setBot(false); FC.debug.setSpeed(1); }
      return o.call(this, e);
    };
    const pd = w.pointerDown;
    window.__downLog = []; window.__vpLog = [];
    const sv = w.setViewport;
    w.setViewport = function (W, H, ins) { window.__vpLog.push({ W, H, ph: this.phase, st: this.state, fstates: (this.friends || []).map(f => f.state).join() }); return sv.call(this, W, H, ins); };
    w.pointerDown = function (x, y) {
      window.__downs++;
      const ph = this.phase, st = this.state, t = this.time, lock = this._lockUntil;
      const r = pd.call(this, x, y); window.__lastDown = r;
      window.__downLog.push({ ph, st, t, lock, r: r == null ? null : r });
      if (window.__downLog.length > 500) window.__downLog.splice(0, 100);
      return r;
    };
  });
}
const evOf = (page, t) => page.evaluate(t => window.__ev.filter(e => e.type === t), t);
const evTypes = page => page.evaluate(() => window.__ev.map(e => e.type));
const clearEv = page => page.evaluate(() => { window.__ev = []; window.__downLog = []; });
const downLog = page => page.evaluate(() => window.__downLog.slice());
const mode = page => page.evaluate(() => FC.debug.mode);
const downs = page => page.evaluate(() => window.__downs);
const vlen = page => page.evaluate(() => FC.debug.voiceLog.length);
const vsince = (page, n) => page.evaluate(n => FC.debug.voiceLog.slice(n).map(l => l.text), n);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
async function shot(c, name) { try { await c.page.screenshot({ path: path.join(OUT, `${c.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
const wstate = page => page.evaluate(() => { const w = FC.debug.world; return { mode: FC.debug.mode, state: w.state, phase: w.phase, round: w.round, level: w.level, topic: w.topic, ask: w.ask, asks: w.asks, stars: w.stars, misses: w.misses, askMisses: w.askMisses }; });
const setSpeed = (page, s) => page.evaluate(s => FC.debug.setSpeed(s), s);

async function waitAsk(page, timeout = 25000) {
  await page.waitForFunction(() => { const w = FC.debug.world; return FC.debug.mode === 'play' && w.state === 'round' && w.phase === 'ask' && FC.debug.answerId() != null; }, null, { timeout });
  await sleep(60);
}
/* Places of the round (CSS px hit boxes) + their friend's state; the right one flagged. */
const placesInfo = page => page.evaluate(() => {
  const w = FC.debug.world, a = FC.debug.answerId();
  return (w.places || []).filter(p => !p.leaving).map(p => { const f = w.friendById(p.friendId); return Object.assign({ id: p.id, right: p.id === a, found: !!p.found, fstate: f && f.state, glow: p.glow || 0, kind: p.kind }, FC.debug.placeScreen(p.id)); });
});
async function tapAt(c, p) { await c.page.touchscreen.tap(p.x, p.y); }
async function tapPlace(c, id) {
  const p = await c.page.evaluate(id => FC.debug.placeScreen(id), id);
  if (!p) throw new Error('no place ' + id);
  c.__lastTap = { id, x: Math.round(p.x), y: Math.round(p.y) };
  await tapAt(c, p);
  return p;
}
async function tapRight(c) { const id = await c.page.evaluate(() => FC.debug.answerId()); await tapPlace(c, id); return id; }
/* CDP raw touches. */
async function touch(cdp, type, pts) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0, radiusX: 4, radiusY: 4, force: 1 })) });
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
/* Play the rest of the current round by real touch (right answers). Returns true when the round's party / roundDone is reached. */
async function playRoundByTouch(c, timeout = 40000) {
  const t0 = Date.now(), r0 = (await wstate(c.page)).round;
  while (Date.now() - t0 < timeout) {
    const s = await wstate(c.page);
    if (s.state === 'roundDone' || (s.state === 'round' && s.phase === 'party') || s.round !== r0 || s.state !== 'round') return true;
    if (s.phase === 'ask') {
      const a = await c.page.evaluate(() => FC.debug.answerId());
      if (a != null) { await tapPlace(c, a); await sleep(250); continue; }
    }
    await sleep(60);
  }
  return false;
}
const onScreen = (b, vw, vh) => b && b.x - b.w / 2 >= -2 && b.x + b.w / 2 <= vw + 2 && b.y - b.h / 2 >= -2 && b.y + b.h / 2 <= vh + 2;
/* Every place (hit box) and every visible friend (feet + head) in CSS px; returns violations. */
const sceneAudit = page => page.evaluate(() => {
  const w = FC.debug.world, out = [], vw = innerWidth, vh = innerHeight;
  for (const p of w.places || []) {
    if (p.leaving) continue;
    const b = FC.debug.placeScreen(p.id);
    if (!b || b.x - b.w / 2 < -2 || b.x + b.w / 2 > vw + 2 || b.y - b.h / 2 < -2 || b.y + b.h / 2 > vh + 2) out.push(`place ${p.id} off screen ${JSON.stringify(b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h) })}`);
  }
  for (const f of w.friends || []) {
    if (['enter', 'leave', 'gone'].includes(f.state)) continue;
    const s = FC.debug.toScreen(f.x, f.y);
    if (!isFinite(s.x) || !isFinite(s.y) || s.x < -2 || s.x > vw + 2 || s.y < -2 || s.y > vh + 2) out.push(`friend ${f.id} (${f.state}) feet off screen ${Math.round(s.x)},${Math.round(s.y)}`);
  }
  return out;
});

/* ======================================================================= groups */
async function gBoot(check) {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=3');
    await sleep(700);
    const st = await c.page.evaluate(() => ({ mode: FC.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      loading: !document.getElementById('loading').classList.contains('hidden'), logo: document.querySelector('.logo').textContent.trim(),
      play: document.getElementById('btnPlay').getBoundingClientRect().toJSON(), W: FC.debug.getState().W, H: FC.debug.getState().H, sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check(`boot/${d.name}: title shown, loader gone, logo "Pip"`, st.mode === 'title' && st.title && !st.loading && /Pip/.test(st.logo), st);
    check(`boot/${d.name}: play button on screen & ≥ 60 px`, st.play.width >= 60 && st.play.left >= 0 && st.play.right <= d.viewport.width && st.play.bottom <= d.viewport.height, st.play);
    check(`boot/${d.name}: logical short side 720`, Math.min(st.W, st.H) === 720, { W: st.W, H: st.H });
    check(`boot/${d.name}: no horizontal overflow`, st.sw <= st.iw + 1, { sw: st.sw, iw: st.iw });
    await shot(c, 'boot-title');
    await tapEl(c, '#btnPlay'); await sleep(400);
    check(`boot/${d.name}: Play (touch) starts the game`, (await mode(c.page)) === 'play' && await visible(c.page, 'hud'), await mode(c.page));
    await setSpeed(c.page, 3);
    await waitAsk(c.page).catch(() => {});
    await setSpeed(c.page, 1);
    const pl = await placesInfo(c.page);
    check(`boot/${d.name}: first round has ≥ 2 places, all on screen, exactly one right`, pl.length >= 2 && pl.filter(i => i.right).length === 1 && pl.every(b => onScreen(b, d.viewport.width, d.viewport.height)), pl);
    const bub = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
    check(`boot/${d.name}: bubble shows the prompt (clean)`, !badText(bub), bub);
    await shot(c, 'boot-ask');
    check(`boot/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gLang(check) {
  const ctx = await browser.newContext(ctxOpts(DEV.iphoneP));
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  const read = () => c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, l2: document.getElementById('logo2').textContent,
    title: document.title, lang: document.documentElement.lang, on: [...document.querySelectorAll('.title-screen [data-lang]')].filter(b => b.classList.contains('on')).map(b => b.dataset.lang),
    tag: document.getElementById('tagline').textContent, age: document.getElementById('titleAge').textContent }));
  const a = await read();
  check('lang: default EN title/logo', a.lang === 'en' && /Pip/.test(a.l1) && /Hide/.test(a.l2) && /Hide/.test(a.title) && a.on.join() === 'en', a);
  await tapEl(c, '.title-screen [data-lang="vi"]');
  const b = await read();
  check('lang: VI chip updates logo + document.title + html lang', b.lang === 'vi' && b.l1 === 'Cáo Pip' && /Trốn Tìm/.test(b.l2) && /Trốn Tìm/.test(b.title) && b.on.join() === 'vi', b);
  check('lang: VI tagline / age translated', VI_RE.test(b.tag) && !badText(b.tag) && /Tuổi/.test(b.age), b);
  const vl = await c.page.evaluate(() => FC.debug.voiceLog.slice(-1)[0]);
  check('lang: switching says a welcome line in VI', vl && vl.lang === 'vi' && !badText(vl.text) && VI_RE.test(vl.text), vl);
  await c.page.reload(); await waitTitle(c.page);
  const r = await read();
  check('lang: VI choice persists across reload', r.lang === 'vi' && r.l1 === 'Cáo Pip', r);
  await tapEl(c, '.title-screen [data-lang="en"]');
  const e = await read();
  check('lang: back to EN', e.lang === 'en' && /Hide/.test(e.title) && !/Trốn/.test(e.title.split('·')[0]), e);
  // in-game bubble language
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=vi'); await waitTitle(c.page); await installEv(c.page);
  await startGame(c, 3); await waitAsk(c.page);
  const bub = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('lang: ?lang=vi → Vietnamese prompt in the bubble', VI_RE.test(bub) && !badText(bub), bub);
  await setSpeed(c.page, 1);
  const n0 = await vlen(c.page);
  await tapRight(c); await sleep(1500);
  const fl = await c.page.evaluate(n => FC.debug.voiceLog.slice(n).map(l => l.lang + ':' + l.text), n0);
  check('lang: VI lines after a right answer are Vietnamese & clean', fl.length >= 1 && fl.every(l => l.startsWith('vi:') && !badText(l.slice(3))), fl);
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=en'); await waitTitle(c.page); await installEv(c.page);
  await startGame(c, 3); await waitAsk(c.page);
  const bubE = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('lang: ?lang=en → English prompt in the bubble', !VI_RE.test(bubE) && /[a-z]/i.test(bubE) && !badText(bubE), bubE);
  check('lang: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gGate(check) {
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

async function gSettings(check) {
  const ctx = await browser.newContext(ctxOpts(DEV.iphoneP));
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  check('settings: opened by hold', await openSettingsByHold(c));
  await tapEl(c, '#ageChips [data-age="5"]');
  await c.page.locator('#inpName').fill('Mầm');
  await tapEl(c, '#scrSettings label.toggle:has(#optMusic)');
  await tapEl(c, '#scrSettings [data-lang="vi"]');
  await c.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 60; e.dispatchEvent(new Event('input', { bubbles: true })); });
  const s1 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('fc:settings') || '{}'));
  check('settings: saved to localStorage fc:settings', s1.age === 5 && s1.name === 'Mầm' && s1.music === false && s1.lang === 'vi' && Math.abs(s1.volume - 0.6) < 1e-6, s1);
  await tapEl(c, '#btnSettingsDone');
  check('settings: Done returns to title', await visible(c.page, 'scrTitle') && !(await visible(c.page, 'scrSettings')));
  const ageTxt = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('settings: title shows the new age', /5/.test(ageTxt), ageTxt);
  await c.page.reload(); await waitTitle(c.page);
  const st = await c.page.evaluate(() => FC.debug.getState().settings);
  check('settings: persist across reload (age, name, music, lang, volume)', st.age === 5 && st.name === 'Mầm' && st.music === false && st.lang === 'vi' && Math.abs(st.volume - 0.6) < 1e-6, st);
  const chips = await c.page.evaluate(() => { FC.UI.refreshSettings(); return { on: [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age), name: document.getElementById('inpName').value, vol: document.getElementById('optVolume').value }; });
  check('settings: panel shows saved values after reload', chips.on.join() === '5' && chips.name === 'Mầm' && chips.vol === '60', chips);
  await installEv(c.page); await startGame(c, 3); await waitAsk(c.page);
  check('settings: saved age 5 is played', (await c.page.evaluate(() => FC.debug.world.age)) === 5);
  const praise = await c.page.evaluate(() => { const o = []; for (let i = 0; i < 40; i++) o.push(FC.I18N.t('vi', 'great', { child: 'Mầm' })); return o; });
  check('settings: the child\'s name is used in praise', praise.some(l => /Mầm/.test(l)) && praise.every(l => !badText(l)), [...new Set(praise)]);
  check('settings: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gFlags(check) {
  const ctx = await browser.newContext(ctxOpts(DEV.iphoneP));
  const c = await open(DEV.iphoneP, 'mute=1&lang=vi&age=7&speed=2&seed=9', { ctx });
  const t1 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, ls: localStorage.getItem('fc:settings') }));
  check('flags: ?lang=vi&age=7 applied for the session', t1.l1 === 'Cáo Pip' && /7/.test(t1.age), t1);
  check('flags: nothing saved just by loading with flags', t1.ls == null, t1.ls);
  await startGame(c, 3); await waitAsk(c.page);
  check('flags: ?age=7 is played', (await c.page.evaluate(() => FC.debug.world.age)) === 7);
  await c.page.evaluate(() => FC.debug.goTitle());
  await openSettingsByHold(c);
  await tapEl(c, '#scrSettings label.toggle:has(#optSfx)');
  const s2 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('fc:settings') || '{}'));
  check('flags: saving another setting does not store the flag values', s2.lang === 'en' && s2.age === 4 && s2.sfx === false && !('speed' in s2) && !('seed' in s2) && !('mute' in s2) && !('level' in s2), s2);
  const keys = await c.page.evaluate(() => Object.keys(localStorage));
  check('flags: only fc: keys in localStorage', keys.every(k => k.startsWith('fc:')), keys);
  await tapEl(c, '#btnSettingsDone');
  await c.page.goto(srv.url + '?mute=1'); await waitTitle(c.page);
  const t2 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, s: FC.debug.getState().settings, sp: FC.debug.getState().speed }));
  check('flags: without flags → saved EN, age 4, normal speed again', /Pip/.test(t2.l1) && t2.l1 !== 'Cáo Pip' && /4/.test(t2.age) && t2.s.sfx === false && t2.sp === 1, t2);
  check('flags: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gVolume(check) {
  const ctx = await browser.newContext(ctxOpts(DEV.iphoneP));
  await ctx.addInitScript(() => {   // record real DynamicsCompressor nodes
    const P = (window.AudioContext || window.webkitAudioContext).prototype, o = P.createDynamicsCompressor;
    P.createDynamicsCompressor = function () { const n = o.apply(this, arguments); (window.__comp = window.__comp || []).push(n); return n; };
  });
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  const A0 = await c.page.evaluate(async () => {
    const A = FC.debug.audio(); A.unlock(); await new Promise(r => setTimeout(r, 300));
    return { hasCtx: !!A.ctx, master: !!A.master, user: !!A.user, sfx: !!A.sfx, music: !!A.music, gain: A.user && A.user.gain.value, vol: A.volume, mgain: A.master && A.master.gain.value };
  });
  check('volume: audio chain exists (ctx, master, user gain, sfx, music)', A0.hasCtx && A0.master && A0.user && A0.sfx && A0.music, A0);
  const comp = await c.page.evaluate(() => (window.__comp || []).map(n => ({ thr: n.threshold.value, ratio: n.ratio.value, sameCtx: n.context === FC.debug.audio().ctx })));
  check('volume: a DynamicsCompressor is created on the game AudioContext', comp.length >= 1 && comp.some(n => n.sameCtx), comp);
  check('volume: user gain = volume × 1.6 makeup', A0.user && Math.abs(A0.gain - A0.vol * 1.6) < 0.05, A0);
  check('volume: ?mute=1 silences the master gain', A0.mgain != null && A0.mgain < 0.01, A0);
  await openSettingsByHold(c);
  await c.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(400);
  const v = await c.page.evaluate(() => ({ S: FC.debug.getState().settings.volume, A: FC.debug.audio().volume, g: FC.debug.audio().user.gain.value, saved: JSON.parse(localStorage.getItem('fc:settings') || '{}').volume }));
  check('volume: slider 30 % → setting, saved, audio gain 0.48', Math.abs(v.S - 0.3) < 1e-6 && Math.abs(v.saved - 0.3) < 1e-6 && Math.abs(v.A - 0.3) < 1e-6 && Math.abs(v.g - 0.48) < 0.05, v);
  await tapEl(c, '#btnSettingsDone');
  await c.page.reload(); await waitTitle(c.page);
  const r = await c.page.evaluate(() => ({ S: FC.debug.getState().settings.volume, A: FC.debug.audio().volume, el: +document.getElementById('optVolume').value }));
  check('volume: persists across reload (setting, audio, slider)', Math.abs(r.S - 0.3) < 1e-6 && Math.abs(r.A - 0.3) < 1e-6 && r.el === 30, r);
  await installEv(c.page); await startGame(c, 3); await waitAsk(c.page); await setSpeed(c.page, 1);
  const d0 = await downs(c.page);
  await tapEl(c, '#btnPause'); await sleep(200);
  const lv0 = await c.page.evaluate(() => document.getElementById('volLevel').textContent);
  check('volume: pause menu shows the level', lv0 === '30%', lv0);
  await tapEl(c, '#btnVolUp'); await tapEl(c, '#btnVolUp');
  const up = await c.page.evaluate(() => ({ S: FC.debug.getState().settings.volume, saved: JSON.parse(localStorage.getItem('fc:settings')).volume, lv: document.getElementById('volLevel').textContent }));
  check('volume: + + in pause → 50 %, saved', Math.abs(up.S - 0.5) < 1e-6 && Math.abs(up.saved - 0.5) < 1e-6 && up.lv === '50%', up);
  for (let i = 0; i < 7; i++) await tapEl(c, '#btnVolDown');
  const dn = await c.page.evaluate(() => ({ S: FC.debug.getState().settings.volume, lv: document.getElementById('volLevel').textContent }));
  check('volume: − clamps at 0 %', dn.S === 0 && dn.lv === '0%', dn);
  check('volume: pause −/+ taps never reach the world', (await downs(c.page)) === d0, await downs(c.page));
  await c.page.reload(); await waitTitle(c.page);
  check('volume: 0 % persists across reload', (await c.page.evaluate(() => FC.debug.getState().settings.volume)) === 0);
  check('volume: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

/* REAL tap on the right place → peek → found → the friend hops to the bench and sits. */
async function gTap(check) {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=13&age=4');
    const tag = `tap/${d.name}`;
    await startGame(c, 3); await waitAsk(c.page); await setSpeed(c.page, 1);
    await clearEv(c.page);
    const id = await tapRight(c);
    await sleep(60);
    const s1 = await wstate(c.page);
    const pk = await evOf(c.page, 'peek');
    check(`${tag}: real tap on the right place → peek (right)`, pk.length === 1 && pk[0].placeId === id && pk[0].right === true && ['peek', 'found'].includes(s1.phase), { pk, s1 });
    await shot(c, 'tap-peek');
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'found'), null, { timeout: 5000 }).catch(() => {});
    const fd = await evOf(c.page, 'found');
    check(`${tag}: found event for that place, n = 1, clean name`, fd.length === 1 && fd[0].placeId === id && fd[0].n === 1, fd);
    const fid = fd[0] && fd[0].friendId;
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'seat'), null, { timeout: 8000 }).catch(() => {});
    const seat = await evOf(c.page, 'seat');
    const fr = await c.page.evaluate(fid => { const f = FC.debug.world.friendById(fid); return f && { state: f.state, place: f.place, x: f.x, y: f.y }; }, fid);
    check(`${tag}: the found friend sits on the bench (seat event, state seated|dance)`, seat.some(e => e.friendId === fid) && fr && ['seated', 'dance'].includes(fr.state), { seat, fr });
    const pl = await c.page.evaluate(id => { const p = FC.debug.world.placeById(id); return p && { found: p.found, open: p.open }; }, id);
    check(`${tag}: the place stays found/open (empty)`, pl && pl.found === true, pl);
    const fire = await evOf(c.page, 'roundDone');
    check(`${tag}: warm-up round (1 ask) → party / roundDone with 3 stars`, fire.length === 1 && fire[0].stars === 3, { fire, s: await wstate(c.page) });
    await c.page.waitForFunction(() => FC.debug.world.round === 1 && FC.debug.world.phase === 'ask', null, { timeout: 15000 }).catch(() => {});
    const s2 = await wstate(c.page);
    check(`${tag}: next round starts and asks`, s2.round === 1 && s2.phase === 'ask', s2);
    const hud = await c.page.evaluate(() => +document.getElementById('hudStars').textContent);
    check(`${tag}: HUD stars = 3`, hud === 3 && s2.stars === 3, { hud, ws: s2.stars });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Wrong place → wrong (boo → duck), tap lock → locked, 2nd miss → hint glow on the answer, right tap still works. */
async function gWrong(check) {
  for (const d of [DEV.iphoneP, DEV.ipadL, DEV.iphoneL]) {
    const c = await open(d, 'mute=1&seed=17&age=4');
    const tag = `wrong/${d.name}`;
    await startGame(c, 3); await waitAsk(c.page); await setSpeed(c.page, 1);
    const s0 = await wstate(c.page);
    const wr = (await placesInfo(c.page)).filter(i => !i.right && !i.found);
    await clearEv(c.page);
    const n0 = await vlen(c.page);
    await tapPlace(c, wr[0].id);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'wrong'), null, { timeout: 3000 }).catch(() => {});
    await setSpeed(c.page, 0.25);   // the 0.8 s lock lasts 3.2 s of real time: room for the checks below
    const w1 = await evOf(c.page, 'wrong'), s1 = await wstate(c.page);
    check(`${tag}: wrong place → peek(right=false) + wrong event (misses 1, want ≠ shown)`, w1.length === 1 && w1[0].placeId === wr[0].id && w1[0].misses === 1 && (await evOf(c.page, 'peek'))[0].right === false, w1);
    const fs1 = await c.page.evaluate(id => FC.debug.world.friendById(FC.debug.world.placeById(id).friendId).state, wr[0].id);
    check(`${tag}: the popped friend says boo`, ['boo', 'duck'].includes(fs1), fs1);
    check(`${tag}: nothing advances (phase ask, same ask, no found)`, s1.phase === 'ask' && s1.ask === s0.ask && (await evOf(c.page, 'found')).length === 0, s1);
    check(`${tag}: no hint after the 1st miss`, (await evOf(c.page, 'hint')).length === 0);
    // tap lock: tap the right place right away → locked, no peek
    await clearEv(c.page);
    await tapRight(c); await sleep(80);
    const lk = await evOf(c.page, 'locked');
    check(`${tag}: a tap inside the wrong-tap lock → 'locked', no peek`, lk.length >= 1 && (await evOf(c.page, 'peek')).length === 0, await evTypes(c.page));
    const dlk = (await downLog(c.page)).slice(-1)[0];
    check(`${tag}: … and that tap really was inside the lock window`, dlk && dlk.t < dlk.lock && dlk.r === 'locked', dlk);
    await setSpeed(c.page, 1);
    await sleep(500);
    const lines = await vsince(c.page, n0);
    check(`${tag}: kind voice line (no negative words)`, lines.length >= 1 && lines.every(l => !badText(l) && !/\b(no|wrong|bad|sai|không đúng)\b/i.test(l)), lines);
    // wait for the friend to duck back in, then the 2nd miss
    await c.page.waitForFunction(id => { const w = FC.debug.world, p = w.placeById(id); return w.friendById(p.friendId).state === 'hidden' && w.time >= w._lockUntil; }, wr[0].id, { timeout: 6000 }).catch(() => {});
    const fs2 = await c.page.evaluate(id => { const w = FC.debug.world, p = w.placeById(id); return { f: w.friendById(p.friendId).state, open: p.open }; }, wr[0].id);
    check(`${tag}: the friend ducks back and the place closes`, fs2.f === 'hidden', fs2);
    await clearEv(c.page);
    await tapPlace(c, (wr[1] || wr[0]).id);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'wrong'), null, { timeout: 3000 }).catch(() => {});
    await sleep(100);
    const h = await evOf(c.page, 'hint'), aid = await c.page.evaluate(() => FC.debug.answerId());
    check(`${tag}: hint on the right place after the 2nd miss`, h.length === 1 && h[0].placeId === aid && !h[0].idle, { h, aid, wrong: await evOf(c.page, 'wrong') });
    await sleep(300);
    const glow = await c.page.evaluate(id => { const p = FC.debug.world.placeById(id); return p && p.glow; }, aid);
    check(`${tag}: the right place glows`, glow > 0, glow);
    check(`${tag}: still asking`, (await wstate(c.page)).phase === 'ask');
    await shot(c, 'wrong-hint');
    // the lock after the 2nd miss is 1.6 s
    const w2 = (await evOf(c.page, 'wrong'))[0], lockLeft = w2 && w2.lockLeft, lock1 = w1[0] && w1[0].lockLeft;
    check(`${tag}: lock 0.8 s after the 1st miss, 1.6 s after the 2nd`, Math.abs(lock1 - 0.8) < 0.02 && Math.abs(lockLeft - 1.6) < 0.02, { lock1, lockLeft });
    await c.page.waitForFunction(() => FC.debug.world.time >= FC.debug.world._lockUntil, null, { timeout: 8000 }).catch(() => {});
    await clearEv(c.page);
    await tapRight(c);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'found'), null, { timeout: 4000 }).catch(() => {});
    check(`${tag}: the right tap after misses still finds`, (await evOf(c.page, 'found')).length === 1, await evTypes(c.page));
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'roundDone'), null, { timeout: 6000 }).catch(() => {});
    const rd = await evOf(c.page, 'roundDone');
    check(`${tag}: 2 misses → 1 star`, rd.length === 1 && rd[0].stars === 1 && rd[0].misses === 2, rd);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* A tap on an already-found (empty) place → 'empty', no miss. Needs a round with ≥ 2 asks (round 1). */
async function gEmpty(check) {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const c = await open(d, 'mute=1&seed=21&age=4');
    const tag = `empty/${d.name}`;
    await startGame(c, 3); await waitAsk(c.page);
    await playRoundByTouch(c);
    await c.page.waitForFunction(() => FC.debug.world.round === 1 && FC.debug.world.phase === 'ask', null, { timeout: 20000 });
    await setSpeed(c.page, 1);
    const s0 = await wstate(c.page);
    check(`${tag}: round 1 has ≥ 2 asks`, s0.asks >= 2, s0);
    const id = await tapRight(c);
    await c.page.waitForFunction(() => FC.debug.world.phase === 'ask' && FC.debug.world.ask === 1, null, { timeout: 8000 }).catch(() => {});
    const s1 = await wstate(c.page);
    await clearEv(c.page);
    const n0 = await vlen(c.page);
    await tapPlace(c, id); await sleep(250);
    const em = await evOf(c.page, 'empty'), s2 = await wstate(c.page);
    check(`${tag}: tap on the found (empty) place → empty event`, em.length === 1 && em[0].placeId === id, await evTypes(c.page));
    check(`${tag}: no miss, no peek, still asking`, s2.misses === s1.misses && s2.phase === 'ask' && (await evOf(c.page, 'peek')).length === 0 && (await evOf(c.page, 'wrong')).length === 0, { s1, s2 });
    const l = await vsince(c.page, n0);
    check(`${tag}: a friendly "nobody there" line`, l.length >= 1 && l.every(x => !badText(x)), l);
    // an empty tap is not locked: immediately afterwards the right place still opens
    await clearEv(c.page);
    await tapRight(c); await sleep(120);
    check(`${tag}: right tap right after the empty tap opens`, (await evOf(c.page, 'peek')).length === 1, await evTypes(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Short tap on Pip → pokePip, prompt repeated (voiceLog grows). Bubble tap too. */
async function gPoke(check) {
  for (const d of [DEV.iphoneL, DEV.ipadP]) {
    const c = await open(d, 'mute=1&seed=61&age=4');
    const tag = `poke/${d.name}`;
    await startGame(c, 3); await waitAsk(c.page); await setSpeed(c.page, 1); await sleep(300);
    const prompt = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
    const pp = await c.page.evaluate(() => FC.debug.pipScreen());
    const n0 = await vlen(c.page);
    await clearEv(c.page);
    await tapAt(c, pp); await sleep(300);
    const ev = await evTypes(c.page);
    const lines = await vsince(c.page, n0);
    check(`${tag}: short tap on Pip → pokePip event`, ev.includes('pokePip') && !ev.includes('peek') && !ev.includes('wrong'), ev);
    check(`${tag}: voiceLog grows with the same prompt`, lines.length >= 1 && lines.includes(prompt), { lines, prompt });
    check(`${tag}: phase still ask`, (await wstate(c.page)).phase === 'ask');
    // long press on Pip → not a poke
    await clearEv(c.page);
    await touch(c.cdp, 'touchStart', [pp]); await sleep(700); await touch(c.cdp, 'touchEnd', []); await sleep(150);
    check(`${tag}: long press on Pip is not a poke`, !(await evTypes(c.page)).includes('pokePip'), await evTypes(c.page));
    // bubble tap repeats
    const n1 = await vlen(c.page), d0 = await downs(c.page);
    await tapEl(c, '#bubble'); await sleep(300);
    const l2 = await vsince(c.page, n1);
    check(`${tag}: tap on the bubble repeats the prompt`, l2.includes(prompt), { l2, prompt });
    check(`${tag}: bubble tap never reaches the world`, (await downs(c.page)) === d0);
    for (let i = 0; i < 8; i++) { await tapAt(c, pp); await sleep(40); }
    check(`${tag}: rapid Pip taps → still asking`, (await wstate(c.page)).phase === 'ask');
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Taps during gather / count / peek / found / party are ignored; count events 1-2-3 then ready. */
async function gCount(check) {
  for (const d of [DEV.ipadL, DEV.iphoneP]) {
    const c = await open(d, 'mute=1&seed=41&age=4');
    const tag = `count/${d.name}`;
    await clearEv(c.page);
    await startGame(c, 1);
    await c.page.waitForFunction(() => FC.debug.world.state === 'round', null, { timeout: 10000 });
    const seen = {};
    const t0 = Date.now();
    while (Date.now() - t0 < 9000) {
      const s = await wstate(c.page);
      if (s.phase === 'ask') break;
      const pt = await c.page.evaluate(() => FC.debug.world.phaseTime);
      if (s.state === 'round' && (s.phase === 'gather' || (s.phase === 'count' && pt < 1.6))) {
        seen[s.phase] = (seen[s.phase] || 0) + 1;
        // one tap per poll (a place in turn, then Pip) so no tap lags into the ask phase
        const pl = (await placesInfo(c.page)).filter(p => p.x != null);
        const k = seen[s.phase] % (pl.length + 1);
        await tapAt(c, k < pl.length ? pl[k] : await c.page.evaluate(() => FC.debug.pipScreen()));
      }
      await sleep(50);
    }
    const ev = await c.page.evaluate(() => window.__ev.map(e => ({ type: e.type, n: e.n, ph: e.ph })));
    const dl = (await downLog(c.page)).filter(x => ['gather', 'count'].includes(x.ph));
    const bad = dl.filter(x => x.r !== null);
    check(`${tag}: saw gather and count phases`, seen.gather > 0 && seen.count > 0, seen);
    check(`${tag}: taps during gather/count ignored (pointerDown → null)`, dl.length >= 3 && bad.length === 0, { taps: dl.length, bad });
    const early = ev.filter((e, i) => ['peek', 'wrong', 'locked', 'empty', 'found'].includes(e.type) && i < ev.findIndex(x => x.type === 'ask'));
    check(`${tag}: no peek/wrong/locked before the first ask`, early.length === 0, early);
    const cn = ev.filter(e => e.type === 'countNum').map(e => e.n);
    check(`${tag}: countNum 1,2,3 then ready then ask`, cn.join() === '1,2,3' && ev.findIndex(e => e.type === 'ready') > ev.findIndex(e => e.type === 'countNum' && e.n === 3) && ev.some(e => e.type === 'ask'), ev.map(e => e.type + (e.n ? e.n : '')));
    const hid = ev.filter(e => e.type === 'hideIn').length, np0 = (await evOf(c.page, 'round'))[0];
    const np = np0 && np0.places;
    check(`${tag}: every friend hid (hideIn per place)`, hid === np, { hid, np });
    // during the peek and found phases other taps are ignored (wait out any lock a late tap may have caused)
    await waitAsk(c.page).catch(() => {});
    await c.page.waitForFunction(() => { const w = FC.debug.world; return w.time >= w._lockUntil && w.friends.every(f => f.found || f.state === 'hidden'); }, null, { timeout: 6000 }).catch(() => {});
    await clearEv(c.page);
    const others = (await placesInfo(c.page)).filter(p => !p.right);
    await tapRight(c);
    const ph = {};
    const t1 = Date.now();
    while (Date.now() - t1 < 4000) {
      const s = await wstate(c.page);
      if (s.state !== 'round' || s.phase === 'ask') break;
      if (!ph[s.phase]) { ph[s.phase] = 1; for (const o of others) await tapPlace(c, o.id); await tapAt(c, await c.page.evaluate(() => FC.debug.pipScreen())); }
      await sleep(30);
    }
    const dl2 = (await downLog(c.page)).filter(x => ['peek', 'found', 'party', 'leave'].includes(x.ph));
    const bad2 = dl2.filter(x => x.r !== null);
    const pk2 = await evOf(c.page, 'peek');
    check(`${tag}: taps during peek/found/party ignored (pointerDown → null, one peek)`, dl2.length >= 2 && bad2.length === 0 && pk2.length === 1, { bad2, ph, taps: dl2.length, peeks: pk2.length, allDowns: await downLog(c.page), ev: await evTypes(c.page), tapAt: c.__lastTap, now: await wstate(c.page) });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* The count topic: rounds 0–1 count up (asks n = 1, 2, 3 … in order); rounds 2–3 stars only. */
async function gCountUp(check) {
  for (const [d, age] of [[DEV.iphoneL, 4], [DEV.ipadP, 5], [DEV.iphoneP, 6]]) {
    const c = await open(d, `mute=1&seed=77&age=${age}`);
    const tag = `countup/${d.name} age${age}`;
    await startGame(c, 3);
    await c.page.waitForFunction(() => FC.debug.world.levels && FC.debug.world.levels.length, null, { timeout: 8000 });
    const idx = await c.page.evaluate(() => FC.debug.world.levels.indexOf('count'));
    check(`${tag}: session has a count chapter`, idx >= 0, await c.page.evaluate(() => FC.debug.world.levels));
    if (idx < 0) { await c.close(); continue; }
    await c.page.evaluate(i => FC.debug.gotoLevel(i), idx);
    await clearEv(c.page);
    await c.page.waitForFunction(() => FC.debug.world.state === 'round' && FC.debug.world.topic === 'count', null, { timeout: 10000 }).catch(() => {});
    check(`${tag}: gotoLevel(${idx}) → topic count`, (await wstate(c.page)).topic === 'count', await wstate(c.page));
    const per = {};
    for (let r = 0; r < 3; r++) {
      await waitAsk(c.page).catch(() => {});
      const s = await wstate(c.page);
      const clues = await c.page.evaluate(() => FC.debug.world.friends.map(f => f.clue && { kind: f.clue.kind, n: f.clue.n, text: f.clue.text }));
      per[s.round] = { clues };
      await playRoundByTouch(c);
      await c.page.waitForFunction(r => FC.debug.world.round > r || FC.debug.world.state !== 'round', s.round, { timeout: 15000 }).catch(() => {});
    }
    const asks = await c.page.evaluate(() => window.__ev.filter(e => e.type === 'ask' || e.type === 'round').map(e => e.type === 'round' ? 'R' + e.round : e.promptKey + ':' + (e.params && e.params.n)));
    // split by round
    const byR = {}; let cur = null;
    for (const a of asks) { if (a[0] === 'R') { cur = +a.slice(1); byR[cur] = []; } else if (cur != null) byR[cur].push(a); }
    const upOk = [1].every(r => byR[r] && byR[r].length >= 1 && byR[r].every((a, i) => a === 'p.countUp:' + (i + 1)));
    check(`${tag}: round 1 counts up in order (MECHANICS: round 0 = warm-up stars) (p.countUp n = 1, 2, 3 …)`, upOk, byR);
    const r2 = byR[2] || [];
    check(`${tag}: rounds 0 and 2 ask by stars only (p.count)`, r2.length >= 1 && r2.every(a => a.startsWith('p.count:')) && (byR[0] || []).every(a => a.startsWith('p.count:')), { r0: byR[0], r2 });
    const signs = Object.values(per).every(p => p.clues.every(cl => cl && cl.kind === 'sign' && cl.n >= 1));
    check(`${tag}: every clue is a star sign with n ≥ 1`, signs, per);
    const n0 = (per[0] || { clues: [] }).clues.map(c => c.n).sort().join(), n1 = (per[1] || { clues: [] }).clues.map(c => c.n).sort().join();
    check(`${tag}: count-up signs are 1…N`, n1 === [...Array((per[1] || { clues: [] }).clues.length)].map((_, i) => i + 1).join(), { n0, n1 });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
    // the ?level=N flag (fresh context, same seed → same chapter list) starts straight in the count chapter
    const c2 = await open(d, `mute=1&seed=77&age=${age}&level=${idx}`);
    await startGame(c2, 3); await waitAsk(c2.page).catch(() => {});
    const s2 = await wstate(c2.page);
    const a2 = (await evOf(c2.page, 'ask'))[0];
    check(`${tag}: ?level=${idx} → chapter ${idx}, topic count, first ask p.count (warm-up)`, s2.level === idx && s2.topic === 'count' && a2 && a2.promptKey === 'p.count', { s2, a2: a2 && { k: a2.promptKey, p: a2.params } });
    const ls = await c2.page.evaluate(() => JSON.parse(localStorage.getItem('fc:settings') || 'null'));
    check(`${tag}: ?level is never saved`, !ls || !('level' in ls), ls);
    check(`${tag}: ?level page: zero console errors`, c2.errors.length === 0, c2.errors);
    await c2.close();
  }
}

/* Talk time answered by tapping a choice. */
async function toTalk(c) {
  await c.page.evaluate(() => { window.__stopBotOnTalk = true; FC.debug.setBot(true, 1); FC.debug.setSpeed(20); });
  await c.page.waitForFunction(() => FC.debug.mode === 'talk' && FC.debug.world.state === 'talk', null, { timeout: 240000, polling: 250 });
  await c.page.evaluate(() => { window.__stopBotOnTalk = false; FC.debug.setBot(false); FC.debug.setSpeed(1); });
  await sleep(400);
}
async function gTalk(check) {
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
    await sleep(1500);
    await setSpeed(c.page, 2);
    await c.page.waitForFunction(() => FC.debug.world.level === 1 && FC.debug.mode === 'play', null, { timeout: 15000 }).catch(() => {});
    check(`${tag}: next chapter (next season) starts, talk screen closed`, (await c.page.evaluate(() => FC.debug.world.level)) === 1 && !(await visible(c.page, 'scrTalk')) && (await mode(c.page)) === 'play', await wstate(c.page));
    await waitAsk(c.page).catch(() => {});
    const kinds = await c.page.evaluate(() => [...new Set(FC.debug.world.places.map(p => p.kind))]);
    check(`${tag}: chapter 2 uses summer places (tent/rock)`, kinds.every(k => ['tent', 'rock'].includes(k)), kinds);
    await sleep(800);
    const hud = await c.page.evaluate(() => +document.getElementById('hudStars').textContent);
    const ws = await c.page.evaluate(() => FC.debug.world.stars);
    check(`${tag}: HUD star count = world stars`, hud === ws, { hud, ws });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Pause / resume via the pause button. */
async function gPause(check) {
  const c = await open(DEV.iphoneP, 'mute=1&seed=81&age=4');
  await startGame(c, 3); await waitAsk(c.page); await setSpeed(c.page, 1);
  await tapEl(c, '#btnPause'); await sleep(200);
  check('pause: pause button → paused, pause screen', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  await shot(c, 'pause');
  const t0 = await c.page.evaluate(() => FC.debug.world.time);
  await sleep(800);
  const t1 = await c.page.evaluate(() => FC.debug.world.time);
  check('pause: world time frozen while paused', t1 === t0, { t0, t1 });
  // a tap on the canvas under the pause panel never reaches the world
  const d0 = await downs(c.page);
  const rp = await c.page.evaluate(() => { for (let gy = 1; gy < 20; gy++) for (let gx = 1; gx < 10; gx++) { const x = innerWidth * gx / 10, y = innerHeight * gy / 20, e = document.elementFromPoint(x, y); if (e && !e.closest('button,input,label') && e.closest('#scrPause')) return { x, y }; } return null; });
  await tapAt(c, rp); await sleep(100);
  check('pause: taps while paused do not reach the world', (await downs(c.page)) === d0 && (await mode(c.page)) === 'paused');
  const n0 = await vlen(c.page);
  await tapEl(c, '#btnResume'); await sleep(600);
  check('pause: resume → play, pause screen hidden', (await mode(c.page)) === 'play' && !(await visible(c.page, 'scrPause')));
  check('pause: resume tap does not reach the world', (await downs(c.page)) === d0);
  check('pause: resume repeats the prompt', (await vsince(c.page, n0)).length >= 1, await vsince(c.page, n0));
  await clearEv(c.page);
  await tapRight(c); await sleep(80);
  check('pause: a tap on the right place still works after resume', (await evOf(c.page, 'peek')).length === 1);
  // pause mid-peek → resume → the find completes
  await tapEl(c, '#btnPause'); await sleep(300); await tapEl(c, '#btnResume');
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'seat'), null, { timeout: 8000 }).catch(() => {});
  check('pause: peek/found/seat completes after pause/resume mid-peek', (await evOf(c.page, 'found')).length === 1 && (await evOf(c.page, 'seat')).length === 1, await evTypes(c.page));
  // Home
  await setSpeed(c.page, 3);
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

async function gVisibility(check) {
  const c = await open(DEV.ipadP, 'mute=1&seed=82&age=4');
  await startGame(c, 3); await waitAsk(c.page); await setSpeed(c.page, 1);
  const hide = h => c.page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await sleep(200);
  check('visibility: hidden page → paused', (await mode(c.page)) === 'paused');
  const t0 = await c.page.evaluate(() => FC.debug.world.time); await sleep(400);
  await hide(false); await sleep(300);
  check('visibility: back visible → still paused (waits for the child)', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  check('visibility: world did not run while hidden', (await c.page.evaluate(() => FC.debug.world.time)) === t0);
  await tapEl(c, '#btnResume');
  await clearEv(c.page); await tapRight(c); await sleep(100);
  check('visibility: play continues after resume', (await evOf(c.page, 'peek')).length === 1);
  // hidden during the peek → resume → completes
  await hide(true); await sleep(100); await hide(false); await sleep(100);
  await tapEl(c, '#btnResume');
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'seat'), null, { timeout: 8000 }).catch(() => {});
  check('visibility: hidden mid-peek → the find still completes after resume', (await evOf(c.page, 'seat')).length === 1, await evTypes(c.page));
  // hidden during Talk time → pause; resume returns to talk
  check('visibility: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Rotate mid-peek (round 0) and mid-hop (round 1): every place and friend stays inside, nothing stuck, rounds complete. */
async function gRotate(check) {
  const pairs = [[DEV.iphoneP, DEV.iphoneL], [DEV.iphoneL, DEV.iphoneP], [DEV.ipadL, DEV.ipadP], [DEV.ipadP, DEV.ipadL]];
  for (const [a, b] of pairs) {
    const c = await open(a, 'mute=1&seed=91&age=4');
    const tag = `rotate/${a.name}→${b.name}`;
    await startGame(c, 3); await waitAsk(c.page);
    await setSpeed(c.page, 0.15);    // slow so the resize lands inside the peek
    await clearEv(c.page);
    await c.page.evaluate(() => { window.__vpLog = []; });
    const id = await tapRight(c);
    await c.page.setViewportSize(b.viewport);
    await c.page.waitForFunction(() => window.__vpLog.length > 0, null, { timeout: 5000 }).catch(() => {});
    await sleep(150);
    const ph = await c.page.evaluate(() => { const v = window.__vpLog[0]; return v ? v.ph + ' (' + window.__vpLog.length + ' relayouts)' : 'no-relayout'; });
    const v1 = await sceneAudit(c.page);
    check(`${tag} mid-peek (relayout during ${ph}): places and friends inside the screen`, /^peek/.test(ph) && v1.length === 0, { ph, v1 });
    await setSpeed(c.page, 1);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'seat'), null, { timeout: 8000 }).catch(() => {});
    const fd = await evOf(c.page, 'found'), seat = await evOf(c.page, 'seat');
    check(`${tag} mid-peek: the find completes (found + seat)`, fd.length === 1 && fd[0].placeId === id && seat.length === 1, await evTypes(c.page));
    await shot({ page: c.page, dev: b }, 'rotate-after-peek');
    await c.page.waitForFunction(() => FC.debug.world.round === 1 && FC.debug.world.phase === 'ask', null, { timeout: 30000 }).catch(() => {});
    check(`${tag}: round 1 asks after rotating`, (await wstate(c.page)).round === 1 && (await wstate(c.page)).phase === 'ask', await wstate(c.page));
    const v2 = await sceneAudit(c.page);
    check(`${tag}: round 1 places inside the rotated screen`, v2.length === 0, v2);
    // mid-hop: tap right, wait until the friend is hopping to the bench, rotate back
    await clearEv(c.page);
    await tapRight(c);
    await c.page.waitForFunction(() => FC.debug.world.friends.some(f => f.state === 'hop' && f.place == null), null, { timeout: 5000, polling: 'raf' }).catch(() => {});
    await setSpeed(c.page, 0.2);
    await c.page.evaluate(() => { window.__vpLog = []; });
    await c.page.setViewportSize(a.viewport);
    await c.page.waitForFunction(() => window.__vpLog.length > 0, null, { timeout: 5000 }).catch(() => {});
    await sleep(150);
    const hs = await c.page.evaluate(() => { const v = window.__vpLog[0]; return v ? v.fstates.split(',').filter(x => x === 'jump' || x === 'hop') : []; });
    await setSpeed(c.page, 1);
    const v3 = await sceneAudit(c.page);
    check(`${tag} mid-hop (${hs.join()}): places and friends inside the screen`, hs.length >= 1 && v3.length === 0, { hs, v3 });
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'seat'), null, { timeout: 8000 }).catch(() => {});
    const seat2 = await evOf(c.page, 'seat');
    const sp = seat2[0] && await c.page.evaluate(fid => { const f = FC.debug.world.friendById(fid), L = FC.debug.world.layout, S = L.bench[f.seat]; return { f: { x: f.x, y: f.y, state: f.state }, S }; }, seat2[0].friendId);
    check(`${tag} mid-hop: the friend still reaches its bench seat (on the new layout)`, seat2.length === 1 && sp && Math.hypot(sp.f.x - sp.S.x, sp.f.y - sp.S.y) < 4, { seat2, sp });
    const ok = await playRoundByTouch(c, 30000);
    check(`${tag}: round 1 completes by touch after rotation`, ok, await wstate(c.page));
    await sleep(300);
    const v4 = await sceneAudit(c.page);
    check(`${tag}: party: seated friends inside the screen`, v4.length === 0, v4);
    await shot(c, 'rotate-party');
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Full bot sessions at high speed: ages 3..7 in both languages (run in parallel pages). */
async function gBot(check) {
  const devs = [DEV.iphoneP, DEV.ipadL, DEV.iphoneL, DEV.ipadP];
  const runs = [];
  [3, 4, 5, 6, 7].forEach((age, i) => ['en', 'vi'].forEach((lang, j) => runs.push([age, lang, devs[(i * 2 + j) % 4]])));
  await pool(runs, HEAVY, async ([age, lang, d]) => {
    const c = await open(d, `mute=1&seed=${100 + age}&age=${age}&lang=${lang}`);
    const tag = `bot/age${age} ${lang} ${d.name}`;
    await c.page.evaluate(() => { FC.debug.setBot(true, 0.7); FC.debug.setSpeed(20); FC.debug.startGame(); });
    const t0 = Date.now();
    let ok = true;
    try { await c.page.waitForFunction(() => FC.debug.mode === 'done', null, { timeout: 420000, polling: 1000 }); } catch (e) { ok = false; }
    const st = await c.page.evaluate(() => ({ s: FC.debug.getState(), stats: FC.debug.stats, age: FC.debug.world.age, levels: FC.debug.world.levels }));
    check(`${tag}: session reaches mode done`, ok, st);
    check(`${tag}: played at age ${age}`, st.age === age, st.age);
    const cnt = await c.page.evaluate(() => { const n = t => window.__ev.filter(e => e.type === t).length; return { level: n('level'), talk: n('talk'), round: n('round'), roundDone: n('roundDone'), sessionDone: n('sessionDone'), wrong: n('wrong'), found: n('found'), seat: n('seat'), reveal: n('reveal'), asks: n('ask') }; });
    check(`${tag}: 4 chapters, 4 talks, every round done, every find + last-friend reveal seated`, cnt.level === 4 && cnt.talk === 4 && cnt.round === cnt.roundDone && cnt.round >= 12 && cnt.sessionDone === 1 && cnt.found === cnt.asks && cnt.found + cnt.reveal === cnt.seat && cnt.reveal === cnt.roundDone, cnt);
    const vl = await c.page.evaluate(() => FC.debug.voiceLog.map(l => l.lang + '|' + l.text));
    const bad = vl.filter(t => { const s = t.slice(3); return /[{}]|\bundefined\b|\bNaN\b|\[object/.test(s) || /\b(p|ui|topic|talk|session|weather|surprise|countNum|critter)\.[a-zA-Z0-9]/.test(s); });
    check(`${tag}: no raw keys / undefined in voice lines`, bad.length === 0, bad.slice(0, 5));
    const wrongLang = vl.filter(t => !t.startsWith(lang + '|'));
    check(`${tag}: every voice line in ${lang}`, wrongLang.length === 0, wrongLang.slice(0, 5));
    if (lang === 'vi') { const viShare = vl.filter(t => VI_RE.test(t)).length / Math.max(1, vl.length); check(`${tag}: VI lines carry Vietnamese diacritics (≥ 80 %)`, viShare >= 0.8, { viShare, sample: vl.filter(t => !VI_RE.test(t)).slice(0, 5) }); }
    const done = await c.page.evaluate(() => ({ t: document.getElementById('doneTitle').textContent, s: +document.getElementById('doneStars').textContent, ws: FC.debug.world.stars }));
    check(`${tag}: done screen with stars = world stars`, await visible(c.page, 'scrDone') && done.s === done.ws && done.s > 0 && !badText(done.t), done);
    c.note = `${tag}: ${((Date.now() - t0) / 1000).toFixed(1)} s, stars ${done.ws}, ${JSON.stringify(cnt)}`;
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors.slice(0, 5));
    console.log('      ' + c.note);
    await c.close();
  });
}

/* Session done screen, Play again, Home. */
async function gDone(check) {
  for (const [d, path] of [[DEV.iphoneP, 'again'], [DEV.ipadL, 'home']]) {
    const c = await open(d, 'mute=1&seed=120&age=4');
    const tag = `done/${d.name}`;
    await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(20); FC.debug.startGame(); });
    await c.page.waitForFunction(() => FC.debug.mode === 'done', null, { timeout: 420000, polling: 1000 }).catch(() => {});
    await c.page.evaluate(() => { FC.debug.setBot(false); FC.debug.setSpeed(1); });
    await sleep(1200);
    const st = await c.page.evaluate(() => ({ mode: FC.debug.mode, title: document.getElementById('doneTitle').textContent, stars: +document.getElementById('doneStars').textContent, ws: FC.debug.world.stars }));
    check(`${tag}: campfire party screen shown with stars`, st.mode === 'done' && await visible(c.page, 'scrDone') && st.stars === st.ws && st.stars > 0 && !badText(st.title), st);
    await shot(c, 'done');
    const btns = await c.page.evaluate(() => ['btnAgain', 'btnDoneHome'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, b: r.bottom, r: r.right }; }));
    check(`${tag}: Play again / Home buttons ≥ 44 px & on screen`, btns.every(b => b.w >= 44 && b.h >= 44 && b.b <= d.viewport.height && b.r <= d.viewport.width), btns);
    if (path === 'again') {
      await tapEl(c, '#btnAgain'); await sleep(300);
      await setSpeed(c.page, 3);
      await waitAsk(c.page).catch(() => {});
      await setSpeed(c.page, 1);
      const s = await wstate(c.page);
      check(`${tag}: Play again → new session (level 0, round 0, stars 0, HUD 0)`, s.mode === 'play' && s.level === 0 && s.round === 0 && s.stars === 0 && (await c.page.evaluate(() => document.getElementById('hudStars').textContent)) === '0' && !(await visible(c.page, 'scrDone')), s);
      const lv = await c.page.evaluate(() => FC.debug.world.levels);
      check(`${tag}: the new session plans 4 chapters`, lv && lv.length === 4, lv);
      await clearEv(c.page);
      await tapRight(c); await sleep(150);
      check(`${tag}: taps work in the new session`, (await evOf(c.page, 'peek')).length === 1);
    } else {
      await tapEl(c, '#btnDoneHome'); await sleep(300);
      const t = await c.page.evaluate(() => ({ mode: FC.debug.mode, stars: +document.getElementById('titleStars').textContent }));
      check(`${tag}: Home → title, total stars = session stars`, t.mode === 'title' && await visible(c.page, 'scrTitle') && t.stars === st.ws, { t, st });
      await c.page.reload(); await waitTitle(c.page);
      const t2 = await c.page.evaluate(() => +document.getElementById('titleStars').textContent);
      check(`${tag}: total stars persist across reload`, t2 === t.stars, { t2, t: t.stars });
    }
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Every ask through a whole session (bot) on every device: places on screen, clear of the DOM HUD/bubble, hit boxes big
 * and not overlapping, the centre of each hit box resolves to that place, Pip on screen. */
const askAudit = page => page.evaluate(() => {
  const w = FC.debug.world, out = [], a = FC.debug.answerId();
  const ps = (w.places || []).filter(p => !p.leaving);
  const box = b => ({ l: b.x - b.w / 2, t: b.y - b.h / 2, r: b.x + b.w / 2, b: b.y + b.h / 2 });
  const ov = (p, q) => Math.min(p.r, q.r) - Math.max(p.l, q.l) > 2 && Math.min(p.b, q.b) - Math.max(p.t, q.t) > 2;
  const dom = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const hud = dom('hud'), bub = dom('bubble'), v = FC.debug.view();
  for (const p of ps) {
    const raw = FC.debug.placeScreen(p.id), b = box(raw);
    if (b.l < -2 || b.t < -2 || b.r > innerWidth + 2 || b.b > innerHeight + 2) out.push(`place ${p.id} off screen`);
    // the clue band (top of the hit box down to peekY) must be clear of the HUD / bubble
    const clue = { l: b.l, t: b.t, r: b.r, b: v.top + p.peekY * v.s };
    if (hud && ov(clue, hud)) out.push(`place ${p.id} clue under HUD`);
    if (bub && ov(clue, bub)) out.push(`place ${p.id} clue under bubble (${Math.round(Math.min(clue.b, bub.b) - Math.max(clue.t, bub.t))} px)`);
    if (raw.w < 60 || raw.h < 60) out.push(`place ${p.id} small ${Math.round(raw.w)}×${Math.round(raw.h)}`);
    const hc = w.placeHit(p.id), hit = w._hit(hc.x, hc.y);
    if (hit !== p) out.push(`centre of place ${p.id} resolves to ${hit && hit.id != null ? 'place ' + hit.id : hit}`);
    const pk = w._hit(p.x, p.peekY - p.peekRise * 0.5);
    if (pk !== p) out.push(`peeking head of place ${p.id} resolves to ${pk && pk.id != null ? 'place ' + pk.id : pk}`);
  }
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) {
    const A = ps[i], B = ps[j];
    if (Math.min(A.x + A.w / 2, B.x + B.w / 2) - Math.max(A.x - A.w / 2, B.x - B.w / 2) > 2 && Math.min(A.y, B.y) - Math.max(A.peekY, B.peekY) > 2) out.push(`places ${A.id}/${B.id} objects overlap`);
  }
  // the asked friend really hides in the answer place, and its clue matches the prompt's parameters
  if (a != null) {
    const ap = w.placeById(a), af = ap && w.friendById(ap.friendId), pr = w.prompt();
    const AF = w._answerF && w._answerF();
    if (!af || (AF && AF.id !== af.id)) out.push(`answer place ${a} holds ${af && af.id}, the ask wants ${AF && AF.id}`);
    else if (pr && pr.params) {
      // semantic match of a friend against the prompt (works for every topic)
      const A = +pr.params.a, Bv = +pr.params.b, k = pr.promptKey;
      const valsOf = f => { const cl = f.clue || {}; return [cl.nameValue, cl.value, cl.n, cl.text, cl.color, cl.shape].filter(v => v != null).map(String); };
      const matches = f => {
        const vals = valsOf(f);
        if (/^p\.add/.test(k) && isFinite(A + Bv)) return vals.includes(String(A + Bv));
        if (/^p\.sub/.test(k) && isFinite(A - Bv)) return vals.includes(String(A - Bv));
        if (/^p\.oddeven/.test(k)) { const n = +((f.clue || {}).nameValue != null ? f.clue.nameValue : f.clue.n); return isFinite(n) && (n % 2 === 0) === (pr.params.parity === 'even'); }
        if (/^p\.size/.test(k)) return f.animal === pr.params.animal && vals.includes(String(pr.params.size));
        const pv = Object.entries(pr.params).filter(([kk]) => kk !== 'child').map(([, v]) => String(v));
        return pv.some(v => vals.includes(v) || v === f.animal);
      };
      if (!matches(af)) out.push(`prompt ${k} ${JSON.stringify(pr.params)} does not match the answer clue ${JSON.stringify(valsOf(af))}`);
      const dup = ps.filter(p => p.id !== a && !p.found).map(p => w.friendById(p.friendId)).filter(f => f && matches(f));
      if (dup.length) out.push(`ambiguous ${k} ${JSON.stringify(pr.params)}: ${dup.length} other hidden friend(s) also match (${dup.map(f => JSON.stringify(valsOf(f)) + ' ' + f.animal).join(', ')})`);
    }
  }
  const pp = FC.debug.pipScreen();
  if (!pp || pp.x - pp.w / 2 < -2 || pp.x + pp.w / 2 > innerWidth + 2 || pp.y - pp.h / 2 < -2 || pp.y + pp.h / 2 > innerHeight + 2) out.push('Pip off screen ' + JSON.stringify(pp));
  return { out, n: ps.length, a, hasA: a == null || ps.some(p => p.id === a), level: w.level, round: w.round, ask: w.ask, topic: w.topic };
});
async function gLayout(check) {
  const runs = [[DEV.iphoneP, 5], [DEV.iphoneL, 6], [DEV.ipadP, 4], [DEV.ipadL, 7], [DEV.iphoneP, 3]];
  await pool(runs, Math.max(1, HEAVY - 1), async ([d, age]) => {
    const c = await open(d, `mute=1&seed=${200 + age}&age=${age}`);
    const tag = `layout/${d.name} age${age}`;
    await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(6); FC.debug.startGame(); });
    const seen = new Set(), viol = [], counts = {};
    const t0 = Date.now();
    let lastShot = -1, nullA = 0;
    while (Date.now() - t0 < 420000) {
      const s = await c.page.evaluate(() => ({ mode: FC.debug.mode, st: FC.debug.world.state, ph: FC.debug.world.phase, k: FC.debug.world.level + ':' + FC.debug.world.round + ':' + FC.debug.world.ask }));
      if (s.mode === 'done') break;
      if (s.st === 'round' && s.ph === 'ask' && !seen.has(s.k)) {
        const r = await askAudit(c.page);
        seen.add(s.k);
        counts[r.topic] = counts[r.topic] || new Set(); counts[r.topic].add(r.n);
        if (r.a == null) nullA++;
        if (!r.hasA) viol.push(s.k + ' answer not among the places');
        r.out.forEach(o => viol.push(`${s.k} ${r.topic}: ${o}`));
        if (r.out.length && lastShot !== r.level) { lastShot = r.level; await shot(c, `layout-age${age}-L${r.level}-viol`); }
      }
      await sleep(40);
    }
    const totalAsks = (await evOf(c.page, 'ask')).length;
    check(`${tag}: audited ≥ 80 % of the session's asks`, seen.size >= 0.8 * totalAsks && totalAsks >= 20, { seen: seen.size, totalAsks, nullA });
    check(`${tag}: every ask: places on screen, clues clear of HUD/bubble, big, no overlap, hits resolve`, viol.length === 0, viol.slice(0, 8).concat(viol.length > 8 ? ['… ' + viol.length + ' total'] : []));
    console.log(`      ${tag}: places per topic ${JSON.stringify(Object.fromEntries(Object.entries(counts).map(([k, v]) => [k, [...v]])))}`);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors.slice(0, 5));
    await c.close();
  });
}

/* Input edge cases: second finger, touchcancel, grass taps, idle nudges. */
async function gMisc(check) {
  const c = await open(DEV.iphoneL, 'mute=1&seed=301&age=4');
  await startGame(c, 3); await waitAsk(c.page); await setSpeed(c.page, 1);
  const pl = await placesInfo(c.page), wrongP = pl.find(i => !i.right), right = pl.find(i => i.right);
  const pp = await c.page.evaluate(() => FC.debug.pipScreen());
  // second simultaneous finger on a wrong place is ignored
  await clearEv(c.page);
  await touch(c.cdp, 'touchStart', [{ x: pp.x, y: pp.y, id: 1 }]); await sleep(60);
  await touch(c.cdp, 'touchStart', [{ x: pp.x, y: pp.y, id: 1 }, { x: wrongP.x, y: wrongP.y, id: 2 }]); await sleep(60);
  await touch(c.cdp, 'touchEnd', [{ x: wrongP.x, y: wrongP.y, id: 2 }]); await sleep(40);
  await touch(c.cdp, 'touchEnd', []); await sleep(150);
  check('misc: second simultaneous finger on a wrong place is ignored', (await evOf(c.page, 'wrong')).length === 0 && (await evOf(c.page, 'peek')).length === 0, await evTypes(c.page));
  // touchcancel on Pip → no poke
  await clearEv(c.page);
  await touch(c.cdp, 'touchStart', [pp]); await sleep(40); await touch(c.cdp, 'touchCancel', []); await sleep(150);
  check('misc: touchcancel on Pip → no pokePip', !(await evTypes(c.page)).includes('pokePip'), await evTypes(c.page));
  // grass tap (top-centre sky / far from everything) does nothing and does not reset idle
  await clearEv(c.page);
  const sky = await c.page.evaluate(() => { const v = FC.debug.view(), L = FC.debug.world.layout; return FC.debug.toScreen(L.W * 0.5, L.groundY + 10 > L.H ? L.H - 5 : L.groundY + 10); });
  const r0 = await c.page.evaluate(() => window.__lastDown);
  await tapAt(c, sky); await sleep(100);
  const r1 = await c.page.evaluate(() => window.__lastDown);
  check('misc: tap on the grass → nothing (null)', r1 === null && (await evTypes(c.page)).length === 0, { r0, r1, ev: await evTypes(c.page), sky });
  // idle nudges: no tap for 12 s → idle; the 2nd idle also hints
  await clearEv(c.page);
  await setSpeed(c.page, 8);
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'idle').length >= 2, null, { timeout: 15000 }).catch(() => {});
  await setSpeed(c.page, 1);
  const idl = await evOf(c.page, 'idle'), hi = await evOf(c.page, 'hint');
  check('misc: idle nudges (12 s, then ×1.5), 2nd idle hints', idl.length >= 2 && hi.length >= 1 && Math.abs((idl[1].wt - idl[0].wt) - 18) < 1.5, { idl: idl.map(i => i.wt), hi: hi.map(h => h.wt + (h.idle ? ' idle' : '')) });
  check('misc: still play mode (no auto-pause after 2 idles)', (await mode(c.page)) === 'play');
  // ≥ 5 idles → auto-pause
  await setSpeed(c.page, 10);
  await c.page.waitForFunction(() => FC.debug.mode === 'paused', null, { timeout: 30000 }).catch(() => {});
  check('misc: ≈ 2 min without a tap → auto-pause', (await mode(c.page)) === 'paused', { m: await mode(c.page), idle: (await evOf(c.page, 'idle')).length });
  await setSpeed(c.page, 1);
  await tapEl(c, '#btnResume'); await sleep(200);
  await clearEv(c.page); await tapPlace(c, right.id); await sleep(120);
  check('misc: tap works after auto-pause/resume', (await evOf(c.page, 'peek')).length === 1, await evTypes(c.page));
  check('misc: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Surprises + rotation in the other phases: rotate during gather / count / swap / leave (nothing off screen, game moves on);
 * a REAL tap on the squirrel → critterTap; taps during the swap are ignored and the asks stay right after the swap. */
async function gSurprise(check) {
  const P = DEV.iphoneP, Lnd = DEV.iphoneL;
  const conds = {
    gather: "FC.debug.world.phase === 'gather' && FC.debug.world.friends.length > 0",
    count: "FC.debug.world.phase === 'count' && FC.debug.world.friends.some(f => f.state === 'run')",
    swap: "FC.debug.world.phase === 'swap' && FC.debug.world.friends.some(f => f.state === 'hop')",
    leave: "FC.debug.world.state === 'roundDone' && FC.debug.world.friends.some(f => f.state === 'leave')"
  };
  for (const [ph, A, B] of [['gather', P, Lnd], ['count', Lnd, P], ['swap', P, Lnd], ['leave', Lnd, P]]) {
    const c = await open(A, 'mute=1&seed=300&age=5');
    const tag = `surprise/rotate ${A.name}→${B.name} during ${ph}`;
    await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(3); FC.debug.startGame(); });
    const ok = await c.page.waitForFunction(new Function('return ' + conds[ph]), null, { timeout: 90000, polling: 'raf' }).then(() => true).catch(() => false);
    check(`${tag}: reached`, ok, await wstate(c.page));
    if (!ok) { await c.close(); continue; }
    const k0 = await c.page.evaluate(() => FC.debug.world.level * 10 + FC.debug.world.round);
    if (ph === 'swap') {
      await c.page.evaluate(() => FC.debug.setBot(false));
      const pl = await placesInfo(c.page);
      await clearEv(c.page);
      for (const p of pl) if (!p.found) await tapAt(c, p);
      const dl = (await downLog(c.page)).filter(x => x.ph === 'swap');
      check(`surprise/swap: taps during the swap are ignored`, dl.every(x => x.r === null), dl);
      await c.page.evaluate(() => FC.debug.setBot(true, 1));
    }
    await c.page.setViewportSize(B.viewport);
    await c.page.waitForFunction(() => window.__vpLog.length > 0, null, { timeout: 5000 }).catch(() => {});
    await sleep(300);
    const v = await sceneAudit(c.page);
    check(`${tag}: places and friends inside the screen`, v.length === 0, v);
    if (ph === 'swap') {
      await c.page.evaluate(() => FC.debug.setBot(false));
      await waitAsk(c.page).catch(() => {});
      const r = await askAudit(c.page);
      check(`surprise/swap: after the swap (and rotation) the ask's answer is where the asked friend hides`, r.out.filter(o => /answer|prompt|ambiguous/.test(o)).length === 0 && r.a != null, r);
      await c.page.evaluate(() => FC.debug.setSpeed(1));
      await clearEv(c.page); await tapRight(c);
      await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'found'), null, { timeout: 4000 }).catch(() => {});
      check(`surprise/swap: a real tap on the swapped answer finds it`, (await evOf(c.page, 'found')).length === 1, await evTypes(c.page));
      await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(3); });
    }
    const prog = await c.page.waitForFunction(k0 => { const w = FC.debug.world; return w.level * 10 + w.round > k0 || FC.debug.mode !== 'play'; }, k0, { timeout: 40000 }).then(() => true).catch(() => false);
    check(`${tag}: nothing stuck, the game moves on to the next round`, prog, await wstate(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
  // the squirrel: a real touch tap
  for (const d of [DEV.ipadL, DEV.iphoneP]) {
    const c = await open(d, 'mute=1&seed=300&age=5');
    await c.page.evaluate(() => { FC.debug.setBot(true, 1); FC.debug.setSpeed(3); FC.debug.startGame(); });
    const ok = await c.page.waitForFunction(() => FC.debug.world.critter && FC.debug.world.critter.state === 'up', null, { timeout: 120000, polling: 'raf' }).then(() => true).catch(() => false);
    check(`surprise/critter ${d.name}: the squirrel pops up in a critter round`, ok);
    if (ok) {
      await c.page.evaluate(() => { FC.debug.setBot(false); FC.debug.setSpeed(1); });
      const p = await c.page.evaluate(() => { const C = FC.debug.world.critter; return FC.debug.toScreen(C.x, C.y - C.size * 0.5); });
      const vis = p.x > 0 && p.x < d.viewport.width && p.y > 0 && p.y < d.viewport.height;
      const under = await c.page.evaluate(p => { const e = document.elementFromPoint(p.x, p.y); return e && e.id; }, p);
      check(`surprise/critter ${d.name}: squirrel on screen and not under the DOM HUD/bubble`, vis && under === 'game', { p, under });
      await clearEv(c.page);
      const n0 = await vlen(c.page);
      await tapAt(c, p); await sleep(250);
      check(`surprise/critter ${d.name}: real tap → critterTap + a voice line, no score change`, (await evOf(c.page, 'critterTap')).length === 1 && (await vsince(c.page, n0)).length >= 1 && (await evOf(c.page, 'wrong')).length === 0, { ev: await evTypes(c.page) });
    }
    check(`surprise/critter ${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function pool(items, n, fn) {
  const q = items.slice(); const ws = [];
  for (let i = 0; i < Math.min(n, q.length); i++) ws.push((async () => { while (q.length) await fn(q.shift()); })());
  await Promise.all(ws);
}

const GROUPS = { boot: gBoot, lang: gLang, gate: gGate, settings: gSettings, flags: gFlags, volume: gVolume, tap: gTap, wrong: gWrong,
  empty: gEmpty, poke: gPoke, count: gCount, countup: gCountUp, talk: gTalk, pause: gPause, visibility: gVisibility, rotate: gRotate,
  bot: gBot, done: gDone, layout: gLayout, misc: gMisc, surprise: gSurprise };

(async () => {
  const bad = ONLY.filter(g => !GROUPS[g]);
  if (bad.length) { console.error('unknown group(s): ' + bad.join(', ') + '\nknown: ' + Object.keys(GROUPS).join(' ')); process.exit(2); }
  srv = await serve(process.env.FC_GAME_ROOT || undefined);
  browser = await chromium.launch();
  const T0 = Date.now();
  // heavy groups first so the pool finishes evenly
  const order = ['layout', 'bot', 'surprise', 'rotate', 'countup', 'done', 'talk', 'misc'];
  const names = Object.keys(GROUPS).filter(g => !ONLY.length || ONLY.includes(g)).sort((a, b) => (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) - (order.indexOf(b) < 0 ? 99 : order.indexOf(b)));
  const time = {};
  await pool(names, JOBS, async g => {
    const log = [], check = checker(g, log), t0 = Date.now();
    try { await GROUPS[g](check); } catch (e) { check(`${g}: group ran without exception`, false, String(e && e.stack || e).slice(0, 600)); }
    time[g] = (Date.now() - t0) / 1000;
    console.log(`--- ${g} (${time[g].toFixed(0)} s)\n` + log.join('\n'));
  });
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  const byG = {};
  results.forEach(r => { byG[r.group] = byG[r.group] || { pass: 0, fail: 0 }; byG[r.group][r.ok ? 'pass' : 'fail']++; });
  console.log('\n=== summary');
  for (const g of Object.keys(GROUPS)) if (byG[g]) console.log(`${g.padEnd(11)} ${String(byG[g].pass).padStart(3)} pass ${String(byG[g].fail).padStart(3)} fail  ${String(Math.round(time[g] || 0)).padStart(4)} s`);
  console.log(`TOTAL ${results.length - fails.length} pass, ${fails.length} fail, ${((Date.now() - T0) / 1000).toFixed(0)} s`);
  if (fails.length) { console.log('\n=== failures'); fails.forEach(f => console.log(`[${f.group}] ${f.name}  -- ${(typeof f.info === 'string' ? f.info : JSON.stringify(f.info)).slice(0, 400)}`)); }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})();
