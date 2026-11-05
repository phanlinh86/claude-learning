// Functional QA suite for Lulu's Jungle Tower — REAL touch input (CDP Input.dispatchTouchEvent) on iPhone/iPad-sized
// mobile contexts (isMobile + hasTouch).
//   node tests/e2e/functional.js                        (all groups)
//   node tests/e2e/functional.js drag wrong rotate      (only some groups)
//   JOBS=2 node tests/e2e/functional.js                 (groups run in parallel pages; default 2)
// Groups: boot lang gate settings flags volume drag wrong miss tap poke multi talk pause visibility rotate idle countup
//         bot done layout
// Prints PASS/FAIL per check + a per-group summary, writes tests/out/functional/results.json (+ screenshots),
// exits 1 on any FAIL. Never edits the game: it only reads RB.debug / world state and touches the screen.
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
const JOBS = Math.max(1, +process.env.JOBS || 2);
const HEAVY = Math.max(1, +process.env.HEAVY || 2);   // parallel pages inside the bot group
const BOT_SPEED = +process.env.BOT_SPEED || 20;

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
const NEG_RE = /\b(no|nope|wrong|bad|incorrect|oops)\b|\bsai\b|không đúng|không phải/i;
function badText(s) {
  if (s == null) return null;
  s = String(s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|weather|surprise|stack|count|butterfly)\.[a-zA-Z0-9]/.test(s)) return 'raw i18n key';
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
  await page.waitForFunction(() => window.RB && RB.debug && RB.debug.mode === 'title', null, { timeout: 15000 });
}
/* Record a COPY of every world event (main still drains and handles them), every voice line (unbounded; RB.Voice.log
 * is trimmed at 600), every world.pointerDown call and every setViewport. */
async function installEv(page) {
  await page.evaluate(() => {
    window.__ev = window.__ev || []; window.__downs = window.__downs || 0; window.__vl = window.__vl || [];
    window.__downLog = window.__downLog || []; window.__vpLog = window.__vpLog || [];
    if (RB.Voice && !RB.Voice.__hooked) {
      RB.Voice.__hooked = true;
      const vs = RB.Voice.say;
      RB.Voice.say = function (text, opts) { window.__vl.push({ lang: (opts && opts.lang) || RB.Voice.getLang(), text: String(text == null ? '' : text), ev: window.__ev.length }); return vs.apply(this, arguments); };
    }
    const w = RB.debug.world;
    if (w.__hooked) return;
    w.__hooked = true;
    const o = w._emit;
    w._emit = function (e) {
      const c = Object.assign({ at: performance.now(), wt: this.time, ph: this.phase, st: this.state, lv: this.level, rd: this.round, vl: window.__vl.length }, e);
      if (e.talk) c.tk = { promptKey: e.talk.promptKey, params: e.talk.params, answerId: e.talk.answerId };
      delete c.talk; delete c.block; delete c.want;
      window.__ev.push(c);
      if (window.__ev.length > 20000) window.__ev.splice(0, 5000);
      if (e.type === 'talk' && window.__stopBotOnTalk) { RB.debug.setBot(false); RB.debug.setSpeed(1); }
      return o.call(this, e);
    };
    const pd = w.pointerDown;
    w.pointerDown = function (x, y) {
      window.__downs++;
      const ph = this.phase, st = this.state;
      const r = pd.call(this, x, y); window.__lastDown = r;
      window.__downLog.push({ ph, st, x: Math.round(x), y: Math.round(y), r: r == null ? null : r });
      if (window.__downLog.length > 500) window.__downLog.splice(0, 100);
      return r;
    };
    const sv = w.setViewport;
    w.setViewport = function (W, H, ins) {
      const pressed = !!this._press;
      window.__vpLog.push({ W, H, ph: this.phase, st: this.state, pressed, states: (this.pieces || []).map(p => p.state).join() });
      return sv.call(this, W, H, ins);
    };
  });
}
const evOf = (page, t) => page.evaluate(t => window.__ev.filter(e => e.type === t), t);
const evTypes = page => page.evaluate(() => window.__ev.map(e => e.type));
const clearEv = page => page.evaluate(() => { window.__ev = []; window.__downLog = []; });
const mode = page => page.evaluate(() => RB.debug.mode);
const downs = page => page.evaluate(() => window.__downs);
const vlen = page => page.evaluate(() => window.__vl.length);
const vsince = (page, n) => page.evaluate(n => window.__vl.slice(n).map(l => l.text), n);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
async function shot(c, name) { try { await c.page.screenshot({ path: path.join(OUT, `${c.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
const wstate = page => page.evaluate(() => { const w = RB.debug.world; return { mode: RB.debug.mode, state: w.state, phase: w.phase, round: w.round, level: w.level, topic: w.topic, ask: w.ask, asks: w.asks, stars: w.stars, misses: w.misses, askMisses: w.askMisses, tower: w.tower ? w.tower.blocks.length : 0 }; });
const setSpeed = (page, s) => page.evaluate(s => RB.debug.setSpeed(s), s);
const towerN = page => page.evaluate(() => RB.debug.world.tower.blocks.length);

async function waitAsk(page, timeout = 25000) {
  await page.waitForFunction(() => { const w = RB.debug.world; return RB.debug.mode === 'play' && w.state === 'round' && w.phase === 'ask' && RB.debug.answerId() != null && !w._locked() && w.pieces.filter(p => p.askIdx === w.ask).every(p => p.state === 'rest'); }, null, { timeout });
  await sleep(60);
}
/* The current ask's choice blocks (CSS px hit boxes) + state; the right one flagged. */
const piecesInfo = page => page.evaluate(() => {
  const w = RB.debug.world, a = RB.debug.answerId();
  return w.pieces.filter(p => p.askIdx === w.ask && p.state !== 'out').map(p => Object.assign({ id: p.id, right: p.id === a, state: p.state, glow: p.glow || 0, homeX: p.homeX, homeY: p.homeY, lx: p.x, ly: p.y }, RB.debug.pieceScreen(p.id)));
});
const pieceState = (page, id) => page.evaluate(id => { const p = RB.debug.world.pieceById(id); return p && { state: p.state, x: p.x, y: p.y, homeX: p.homeX, homeY: p.homeY, atHome: Math.hypot(p.x - p.homeX, p.y - p.homeY) < 3 }; }, id);
const waitRest = (page, id, timeout = 6000) => page.waitForFunction(id => { const p = RB.debug.world.pieceById(id); return !p || (p.state === 'rest' && Math.hypot(p.x - p.homeX, p.y - p.homeY) < 3); }, id, { timeout }).then(() => true).catch(() => false);
const waitEv = (page, t, timeout = 5000) => page.waitForFunction(t => window.__ev.some(e => e.type === t), t, { timeout }).then(() => true).catch(() => false);

/* CDP raw touches. */
async function touch(cdp, type, pts) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0, radiusX: 4, radiusY: 4, force: 1 })) });
}
/* A real one-finger drag from → to (CSS px) in `steps` moves `dt` ms apart, then lift. */
async function drag(c, from, to, o = {}) {
  const steps = o.steps || 12, dt = o.dt || 16;
  await touch(c.cdp, 'touchStart', [{ x: from.x, y: from.y, id: 1 }]);
  for (let k = 1; k <= steps; k++) {
    const u = k / steps, arc = Math.sin(Math.PI * u) * (o.arc || 0);
    await touch(c.cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u - arc, id: 1 }]);
    await sleep(dt);
  }
  if (o.hold) await sleep(o.hold);
  if (!o.keep) await touch(c.cdp, 'touchEnd', []);
}
async function tapAt(c, p, ms = 70) {
  await touch(c.cdp, 'touchStart', [{ x: p.x, y: p.y, id: 1 }]); await sleep(ms); await touch(c.cdp, 'touchEnd', []);
}
const dropPt = page => page.evaluate(() => RB.debug.dropScreen());
async function dragPiece(c, id, to, o) {
  const from = await c.page.evaluate(id => RB.debug.pieceScreen(id), id);
  if (!from) throw new Error('no piece ' + id);
  await drag(c, from, to || await dropPt(c.page), Object.assign({ arc: 20 }, o || {}));
}
async function dragRight(c, o) { const id = await c.page.evaluate(() => RB.debug.answerId()); await dragPiece(c, id, null, o); return id; }
/* A point on the grass (CSS px) outside the drop zone, clear of Lulu, the blocks, HUD and bubble. */
const grassPt = page => page.evaluate(() => {
  const w = RB.debug.world, L = w.layout, D = L.drop;
  const xs = L.portrait ? [D.x1 + 30, D.x0 - 30, L.W * 0.5] : [D.x1 + 22, (D.x0 + (L.lulu.x + 0.3 * L.lulu.h)) / 2];
  for (const x of xs) {
    const y = L.groundY - 8;
    if (x >= D.x0 && x <= D.x1 && y < D.y1) continue;
    const s = RB.debug.toScreen(x, y);
    const e = document.elementFromPoint(s.x, s.y);
    if (e && e.id === 'game' && w._hit(x, y) == null) return s;
  }
  return RB.debug.toScreen(xs[0], L.groundY - 8);
});
async function elCenter(page, sel) {
  const bb = await page.locator(sel).first().boundingBox();
  if (!bb) throw new Error('no box for ' + sel);
  return { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 };
}
async function tapEl(c, sel) { const p = await elCenter(c.page, sel); await c.page.touchscreen.tap(p.x, p.y); await sleep(100); }
async function startGame(c, speed = 1) { await c.page.evaluate(s => { RB.debug.setSpeed(s); RB.debug.startGame(); }, speed); }
async function openSettingsByHold(c) {
  const g = await elCenter(c.page, '#btnParents');
  await touch(c.cdp, 'touchStart', [g]); await sleep(2300); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  return visible(c.page, 'scrSettings');
}
const hidePage = (page, h) => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
async function begin(c, speed = 4) { await startGame(c, speed); await waitAsk(c.page); await setSpeed(c.page, 1); }
/* Every resting choice block, the tower top and Lulu inside the screen. */
const sceneAudit = page => page.evaluate(() => {
  const w = RB.debug.world, out = [], vw = innerWidth, vh = innerHeight;
  for (const p of w.pieces || []) {
    if (p.state === 'out' || p.state === 'in') continue;
    const c0 = RB.debug.toScreen(p.homeX, p.homeY), sd = (p.side || w.layout.S) * RB.debug.view().s, b = { x: c0.x, y: c0.y, w: sd, h: sd };   // the drawn block at its slot (hit boxes are padded)
    if (!isFinite(b.x) || b.x - b.w / 2 < -2 || b.x + b.w / 2 > vw + 2 || b.y - b.h / 2 < -2 || b.y + b.h / 2 > vh + 2) out.push(`piece ${p.id} (${p.state}) off screen ${JSON.stringify(b && { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.w), h: Math.round(b.h), vw, vh, W: w.layout.W, H: w.layout.H, lx: Math.round(p.x), ly: Math.round(p.y), hx: Math.round(p.homeX), hy: Math.round(p.homeY) })}`);
  }
  const t = w.towerTop(), ts = RB.debug.toScreen(t.x, t.y);
  if (!isFinite(ts.x) || ts.x < 0 || ts.x > vw || ts.y < 0 || ts.y > vh) out.push('tower top off screen');
  const l = RB.debug.luluScreen();
  if (!l || l.x < 0 || l.x > vw || l.y < 0 || l.y > vh) out.push('Lulu off screen');
  return out;
});

/* ======================================================================= groups */
async function gBoot(check) {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=3');
    await sleep(700);
    const st = await c.page.evaluate(() => ({ mode: RB.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      loading: !document.getElementById('loading').classList.contains('hidden'), logo: document.querySelector('.logo').textContent.trim(),
      play: document.getElementById('btnPlay').getBoundingClientRect().toJSON(), W: RB.debug.getState().W, H: RB.debug.getState().H, sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check(`boot/${d.name}: title shown, loader gone, logo "Lulu… Jungle Tower"`, st.mode === 'title' && st.title && !st.loading && /Lulu/.test(st.logo) && /Jungle Tower/.test(st.logo), st);
    check(`boot/${d.name}: play button on screen & ≥ 60 px`, st.play.width >= 60 && st.play.left >= 0 && st.play.right <= d.viewport.width && st.play.bottom <= d.viewport.height, st.play);
    check(`boot/${d.name}: logical short side 720`, Math.min(st.W, st.H) === 720, { W: st.W, H: st.H });
    check(`boot/${d.name}: no horizontal overflow`, st.sw <= st.iw + 1, { sw: st.sw, iw: st.iw });
    await shot(c, 'boot-title');
    await tapEl(c, '#btnPlay'); await sleep(400);
    check(`boot/${d.name}: Play (touch) starts the game`, (await mode(c.page)) === 'play' && await visible(c.page, 'hud'), await mode(c.page));
    await setSpeed(c.page, 4);
    await waitAsk(c.page).catch(() => {});
    await setSpeed(c.page, 1);
    const pl = await piecesInfo(c.page);
    const onS = b => b.x - b.w / 2 >= -2 && b.x + b.w / 2 <= d.viewport.width + 2 && b.y - b.h / 2 >= -2 && b.y + b.h / 2 <= d.viewport.height + 2;
    check(`boot/${d.name}: first ask has ≥ 2 blocks, all on screen, exactly one right`, pl.length >= 2 && pl.filter(i => i.right).length === 1 && pl.every(onS), pl);
    check(`boot/${d.name}: block hit boxes ≥ 44 CSS px`, pl.every(b => b.w >= 44 && b.h >= 44), pl.map(b => [Math.round(b.w), Math.round(b.h)]));
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
  check('lang: default EN title/logo (Lulu’s / Jungle Tower)', a.lang === 'en' && /Lulu/.test(a.l1) && /Jungle Tower/.test(a.l2) && /Jungle Tower/.test(a.title) && a.on.join() === 'en', a);
  await tapEl(c, '.title-screen [data-lang="vi"]');
  const b = await read();
  check('lang: VI chip → logo "Hươu Lulu" / "Xếp Tháp", document.title, html lang', b.lang === 'vi' && b.l1 === 'Hươu Lulu' && b.l2 === 'Xếp Tháp' && /Xếp Tháp/.test(b.title) && b.on.join() === 'vi', b);
  check('lang: VI tagline / age translated (diacritics)', VI_RE.test(b.tag) && !badText(b.tag) && /Tuổi/.test(b.age), b);
  const vl = await c.page.evaluate(() => window.__vl.slice(-1)[0]);
  check('lang: switching says a welcome line in VI', vl && vl.lang === 'vi' && !badText(vl.text) && VI_RE.test(vl.text), vl);
  await c.page.reload(); await waitTitle(c.page);
  const r = await read();
  check('lang: VI choice persists across reload', r.lang === 'vi' && r.l1 === 'Hươu Lulu', r);
  await installEv(c.page);
  await tapEl(c, '.title-screen [data-lang="en"]');
  const e = await read();
  check('lang: back to EN', e.lang === 'en' && /Jungle Tower/.test(e.title) && e.l1 !== 'Hươu Lulu', e);
  // in-game bubble language
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=vi'); await waitTitle(c.page); await installEv(c.page);
  await begin(c);
  const bub = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('lang: ?lang=vi → Vietnamese prompt in the bubble (diacritics)', VI_RE.test(bub) && !badText(bub), bub);
  const n0 = await vlen(c.page);
  await dragRight(c);
  await waitEv(c.page, 'stack', 4000); await sleep(400);
  const fl = await c.page.evaluate(n => window.__vl.slice(n).map(l => l.lang + ':' + l.text), n0);
  check('lang: VI lines after a right stack are Vietnamese & clean', fl.length >= 1 && fl.every(l => l.startsWith('vi:') && !badText(l.slice(3))), fl);
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=en'); await waitTitle(c.page); await installEv(c.page);
  await begin(c);
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
  const s1 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('jt:settings') || '{}'));
  check('settings: saved to localStorage jt:settings', s1.age === 5 && s1.name === 'Mầm' && s1.music === false && s1.lang === 'vi' && Math.abs(s1.volume - 0.6) < 1e-6, s1);
  await tapEl(c, '#btnSettingsDone');
  check('settings: Done returns to title', await visible(c.page, 'scrTitle') && !(await visible(c.page, 'scrSettings')));
  const ageTxt = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('settings: title shows the new age', /5/.test(ageTxt), ageTxt);
  await c.page.reload(); await waitTitle(c.page);
  const st = await c.page.evaluate(() => RB.debug.getState().settings);
  check('settings: persist across reload (age, name, music, lang, volume)', st.age === 5 && st.name === 'Mầm' && st.music === false && st.lang === 'vi' && Math.abs(st.volume - 0.6) < 1e-6, st);
  const chips = await c.page.evaluate(() => { RB.UI.refreshSettings(); return { on: [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age), name: document.getElementById('inpName').value, vol: document.getElementById('optVolume').value }; });
  check('settings: panel shows saved values after reload', chips.on.join() === '5' && chips.name === 'Mầm' && chips.vol === '60', chips);
  await installEv(c.page); await begin(c);
  check('settings: saved age 5 is played', (await c.page.evaluate(() => RB.debug.world.age)) === 5);
  const praise = await c.page.evaluate(() => { const o = []; for (let i = 0; i < 40; i++) o.push(RB.I18N.t('vi', 'great', { child: 'Mầm' })); return o; });
  check('settings: the child\'s name is used in praise', praise.some(l => /Mầm/.test(l)) && praise.every(l => !badText(l)), [...new Set(praise)]);
  const keys = await c.page.evaluate(() => Object.keys(localStorage));
  check('settings: only jt: keys in localStorage', keys.length > 0 && keys.every(k => k.startsWith('jt:')), keys);
  check('settings: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gFlags(check) {
  const ctx = await browser.newContext(ctxOpts(DEV.iphoneP));
  const c = await open(DEV.iphoneP, 'mute=1&lang=vi&age=7&speed=2&seed=9', { ctx });
  const t1 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, ls: localStorage.getItem('jt:settings') }));
  check('flags: ?lang=vi&age=7 applied for the session', t1.l1 === 'Hươu Lulu' && /7/.test(t1.age), t1);
  check('flags: nothing saved just by loading with flags', t1.ls == null, t1.ls);
  await begin(c);
  check('flags: ?age=7 is played', (await c.page.evaluate(() => RB.debug.world.age)) === 7);
  await c.page.evaluate(() => RB.debug.goTitle());
  await openSettingsByHold(c);
  await tapEl(c, '#scrSettings label.toggle:has(#optSfx)');
  const s2 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('jt:settings') || '{}'));
  check('flags: saving another setting does not store the flag values (lang/age/speed/seed/mute/level)', s2.lang === 'en' && s2.age === 4 && s2.sfx === false && !('speed' in s2) && !('seed' in s2) && !('mute' in s2) && !('level' in s2) && !('bot' in s2), s2);
  const keys = await c.page.evaluate(() => Object.keys(localStorage));
  check('flags: only jt: keys in localStorage', keys.every(k => k.startsWith('jt:')), keys);
  await tapEl(c, '#btnSettingsDone');
  await c.page.goto(srv.url + '?mute=1'); await waitTitle(c.page);
  const t2 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, s: RB.debug.getState().settings, sp: RB.debug.getState().speed }));
  check('flags: without flags → saved EN, age 4, normal speed again', t2.l1 !== 'Hươu Lulu' && /Lulu/.test(t2.l1) && /4/.test(t2.age) && t2.s.sfx === false && t2.sp === 1, t2);
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
    const A = RB.debug.audio(); A.unlock(); await new Promise(r => setTimeout(r, 300));
    return { hasCtx: !!A.ctx, master: !!A.master, user: !!A.user, sfx: !!A.sfx, music: !!A.music, gain: A.user && A.user.gain.value, vol: A.volume, mgain: A.master && A.master.gain.value };
  });
  check('volume: audio chain exists (ctx, master, user gain, sfx, music)', A0.hasCtx && A0.master && A0.user && A0.sfx && A0.music, A0);
  const comp = await c.page.evaluate(() => (window.__comp || []).map(n => ({ thr: n.threshold.value, ratio: n.ratio.value, sameCtx: n.context === RB.debug.audio().ctx })));
  check('volume: a DynamicsCompressor is created on the game AudioContext', comp.length >= 1 && comp.some(n => n.sameCtx), comp);
  check('volume: user gain = volume × 1.6 makeup', A0.user && Math.abs(A0.gain - A0.vol * 1.6) < 0.05, A0);
  check('volume: ?mute=1 silences the master gain', A0.mgain != null && A0.mgain < 0.01, A0);
  await openSettingsByHold(c);
  await c.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
  await sleep(400);
  const v = await c.page.evaluate(() => ({ S: RB.debug.getState().settings.volume, A: RB.debug.audio().volume, g: RB.debug.audio().user.gain.value, saved: JSON.parse(localStorage.getItem('jt:settings') || '{}').volume }));
  check('volume: slider 30 % → setting, saved, audio gain 0.48', Math.abs(v.S - 0.3) < 1e-6 && Math.abs(v.saved - 0.3) < 1e-6 && Math.abs(v.A - 0.3) < 1e-6 && Math.abs(v.g - 0.48) < 0.05, v);
  await tapEl(c, '#btnSettingsDone');
  await c.page.reload(); await waitTitle(c.page);
  const r = await c.page.evaluate(() => ({ S: RB.debug.getState().settings.volume, A: RB.debug.audio().volume, el: +document.getElementById('optVolume').value }));
  check('volume: persists across reload (setting, audio, slider)', Math.abs(r.S - 0.3) < 1e-6 && Math.abs(r.A - 0.3) < 1e-6 && r.el === 30, r);
  await installEv(c.page); await begin(c);
  const d0 = await downs(c.page);
  await tapEl(c, '#btnPause'); await sleep(200);
  const lv0 = await c.page.evaluate(() => document.getElementById('volLevel').textContent);
  check('volume: pause menu shows the level', lv0 === '30%', lv0);
  await tapEl(c, '#btnVolUp'); await tapEl(c, '#btnVolUp');
  const up = await c.page.evaluate(() => ({ S: RB.debug.getState().settings.volume, saved: JSON.parse(localStorage.getItem('jt:settings')).volume, lv: document.getElementById('volLevel').textContent, A: RB.debug.audio().volume }));
  check('volume: + + in pause → 50 %, saved, audio volume follows', Math.abs(up.S - 0.5) < 1e-6 && Math.abs(up.saved - 0.5) < 1e-6 && up.lv === '50%' && Math.abs(up.A - 0.5) < 1e-6, up);
  for (let i = 0; i < 7; i++) await tapEl(c, '#btnVolDown');
  await sleep(300);
  const dn = await c.page.evaluate(() => ({ S: RB.debug.getState().settings.volume, lv: document.getElementById('volLevel').textContent, g: RB.debug.audio().user.gain.value }));
  check('volume: − clamps at 0 % (user gain → 0)', dn.S === 0 && dn.lv === '0%' && dn.g < 0.02, dn);
  check('volume: pause −/+ taps never reach the world', (await downs(c.page)) === d0, await downs(c.page));
  await c.page.reload(); await waitTitle(c.page);
  check('volume: 0 % persists across reload', (await c.page.evaluate(() => RB.debug.getState().settings.volume)) === 0);
  check('volume: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

/* REAL drag of the right block onto the tower → drop / land / stack, tower +1, next ask. */
async function gDrag(check) {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=13&age=4');
    const tag = `drag/${d.name}`;
    await begin(c);
    await clearEv(c.page);
    const n0 = await towerN(c.page), s0 = await wstate(c.page), v0 = await vlen(c.page);
    const id = await dragRight(c);
    await waitEv(c.page, 'stack', 4000);
    await sleep(200);
    const ev = await c.page.evaluate(() => window.__ev.filter(e => ['grab', 'drop', 'land', 'stack', 'wrong', 'miss', 'tapPiece'].includes(e.type)).map(e => ({ t: e.type, id: e.pieceId, right: e.right, n: e.n })));
    const types = ev.map(e => e.t).join();
    check(`${tag}: real drag → grab, drop(right), land, stack (in order)`, types === 'grab,drop,land,stack' && ev[1].right === true && ev[1].id === id && ev[2].id === id, ev);
    const n1 = await towerN(c.page);
    const inT = await c.page.evaluate(id => RB.debug.world.tower.blocks.some(b => b.id === id), id);
    check(`${tag}: tower +1 and holds that block`, n1 === n0 + 1 && inT && ev[3] && ev[3].n === n1, { n0, n1, inT });
    const lines = await vsince(c.page, v0);
    check(`${tag}: a clean praise line is spoken`, lines.length >= 1 && lines.every(l => !badText(l)), lines);
    const land = (await evOf(c.page, 'land'))[0];
    const off = await c.page.evaluate(() => { const w = RB.debug.world, T = w.tower, b = T.blocks[T.blocks.length - 1]; return Math.abs(b.dx) / w.layout.S; });
    check(`${tag}: landing within ± 0.18·S of the axis, impact 0..1`, off <= 0.181 && land && land.impact >= 0 && land.impact <= 1, { off, impact: land && land.impact });
    if (s0.asks > 1) {
      await c.page.waitForFunction(() => RB.debug.world.ask === 1 && RB.debug.world.phase === 'ask', null, { timeout: 6000 }).catch(() => {});
      check(`${tag}: next ask follows`, (await wstate(c.page)).ask === 1, await wstate(c.page));
      await waitAsk(c.page).catch(() => {});
      await dragRight(c);
      await waitEv(c.page, 'towerDone', 5000);
    }
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'roundDone'), null, { timeout: 12000 }).catch(() => {});
    const rd = await evOf(c.page, 'roundDone'), cnt = (await evOf(c.page, 'count')).map(e => e.i);
    check(`${tag}: tower done → count 1…n bottom-up, roundDone 3 stars`, rd.length === 1 && rd[0].stars === 3 && cnt.join() === [...Array(s0.asks)].map((_, i) => i + 1).join(), { rd, cnt });
    check(`${tag}: monkey grabs the bananas`, (await evOf(c.page, 'bananas')).length === 1, await evTypes(c.page));
    await shot(c, 'drag-done');
    await c.page.waitForFunction(() => RB.debug.world.round === 1 && RB.debug.world.phase === 'ask', null, { timeout: 15000 }).catch(() => {});
    await sleep(800);
    const s2 = await wstate(c.page);
    const hud = await c.page.evaluate(() => +document.getElementById('hudStars').textContent);
    check(`${tag}: next tower starts (round 1 asks), tower empty, HUD stars 3`, s2.round === 1 && s2.phase === 'ask' && s2.tower === 0 && hud === 3 && s2.stars === 3, { s2, hud });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Wrong block → bounces off (tower unchanged), flies home, kind words; tap lock; 2nd wrong → hint (glow + hand). */
async function gWrong(check) {
  for (const d of [DEV.iphoneP, DEV.ipadL, DEV.iphoneL]) {
    const c = await open(d, 'mute=1&seed=17&age=4');
    const tag = `wrong/${d.name}`;
    await begin(c);
    const s0 = await wstate(c.page);
    const wr = (await piecesInfo(c.page)).filter(i => !i.right);
    await clearEv(c.page);
    const n0 = await vlen(c.page);
    await dragPiece(c, wr[0].id);
    const got = await waitEv(c.page, 'wrong', 4000);
    const w1 = await evOf(c.page, 'wrong'), dr = await evOf(c.page, 'drop');
    check(`${tag}: wrong block dropped → drop(right=false) + wrong event (misses 1)`, got && dr.length === 1 && dr[0].right === false && w1.length === 1 && w1[0].pieceId === wr[0].id && w1[0].misses === 1, { dr, w1 });
    // tap lock: press the right block during the bounce → 'locked', no grab
    const rp = (await piecesInfo(c.page)).find(i => i.right);
    await tapAt(c, rp, 60); await sleep(60);
    const lk = await evOf(c.page, 'locked');
    check(`${tag}: a press during the bounce / lock → 'locked', no grab`, lk.length >= 1 && (await evOf(c.page, 'grab')).filter(e => e.pieceId === rp.id).length === 0, await evTypes(c.page));
    const home = await waitRest(c.page, wr[0].id, 6000);
    const ps = await pieceState(c.page, wr[0].id), s1 = await wstate(c.page);
    check(`${tag}: the wrong block returns to its slot (rest at home)`, home && ps.atHome, ps);
    check(`${tag}: tower unchanged, no land/stack, same ask`, s1.tower === s0.tower && s1.ask === s0.ask && (await evOf(c.page, 'stack')).length === 0 && (await evOf(c.page, 'land')).length === 0, { s0, s1 });
    check(`${tag}: no hint after the 1st wrong drop`, (await evOf(c.page, 'hint')).length === 0);
    await sleep(300);
    const lines = await vsince(c.page, n0);
    check(`${tag}: a kind voice line, no negative words`, lines.length >= 1 && lines.every(l => !badText(l) && !NEG_RE.test(l)), lines);
    // 2nd wrong drop → hint on the right block
    await waitAsk(c.page).catch(() => {});
    await clearEv(c.page);
    await dragPiece(c, (wr[1] || wr[0]).id);
    await waitEv(c.page, 'wrong', 4000);
    await sleep(250);
    const h = await evOf(c.page, 'hint'), aid = await c.page.evaluate(() => RB.debug.answerId());
    check(`${tag}: 2nd wrong drop → hint on the right block`, h.length === 1 && h[0].pieceId === aid && !h[0].idle, { h, aid, ev: await evTypes(c.page) });
    const hh = await c.page.evaluate(() => { const w = RB.debug.world, a = RB.debug.answerId(), p = w.pieceById(a); return { glow: p && p.glow, hand: w.hintHand && { pieceId: w.hintHand.pieceId, alpha: w.hintHand.alpha } }; });
    check(`${tag}: the right block glows and the ghost hand shows`, hh.glow > 0 && hh.hand && hh.hand.pieceId === aid, hh);
    await shot(c, 'wrong-hint');
    await waitAsk(c.page).catch(() => {});
    await clearEv(c.page);
    await dragRight(c);
    check(`${tag}: the right drag after misses still stacks`, await waitEv(c.page, 'stack', 4000), await evTypes(c.page));
    if (s0.asks === 1 || (await wstate(c.page)).asks === s0.asks) {
      // finish the tower to see the stars (warm-up tower: 2 blocks at age 4)
      for (let k = 0; k < 6 && !(await c.page.evaluate(() => window.__ev.some(e => e.type === 'towerDone'))); k++) {
        await waitAsk(c.page, 8000).catch(() => {});
        if (await c.page.evaluate(() => window.__ev.some(e => e.type === 'towerDone'))) break;
        await dragRight(c); await waitEv(c.page, 'stack', 4000); await sleep(150);
      }
      await waitEv(c.page, 'roundDone', 12000);
      const rd = await evOf(c.page, 'roundDone');
      check(`${tag}: 2 wrong drops → 1 star (no fail state)`, rd.length === 1 && rd[0].stars === 1 && rd[0].misses === 2, rd);
    }
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Let go on the grass → 'miss': block flies home, not a mistake; the 3rd soft tap hints. */
async function gMiss(check) {
  for (const d of [DEV.iphoneP, DEV.iphoneL, DEV.ipadP]) {
    const c = await open(d, 'mute=1&seed=23&age=4');
    const tag = `miss/${d.name}`;
    await begin(c);
    const s0 = await wstate(c.page);
    const g = await grassPt(c.page);
    await clearEv(c.page);
    const id = await c.page.evaluate(() => RB.debug.answerId());
    await dragPiece(c, id, g, { arc: 0 });
    await waitEv(c.page, 'miss', 3000);
    const ms = await evOf(c.page, 'miss');
    check(`${tag}: release on the grass → miss event`, ms.length === 1 && ms[0].pieceId === id && (await evOf(c.page, 'drop')).length === 0, { ev: await evTypes(c.page), g });
    const home = await waitRest(c.page, id, 5000), s1 = await wstate(c.page);
    check(`${tag}: the block flies home`, home, await pieceState(c.page, id));
    check(`${tag}: not a mistake (misses / askMisses unchanged, no wrong), tower unchanged`, s1.misses === s0.misses && s1.askMisses === 0 && s1.tower === s0.tower && (await evOf(c.page, 'wrong')).length === 0, { s0, s1 });
    check(`${tag}: no hint after one grass release`, (await evOf(c.page, 'hint')).length === 0);
    // two more grass releases → the 3rd soft tap hints
    for (let k = 0; k < 2; k++) { await waitAsk(c.page).catch(() => {}); await dragPiece(c, id, g, { arc: 0 }); await waitRest(c.page, id, 5000); }
    await sleep(200);
    const h = await evOf(c.page, 'hint');
    check(`${tag}: 3rd grass release → hint on the right block (soft-tap rule)`, h.length === 1 && h[0].pieceId === id, await evTypes(c.page));
    // tap assist: once hinted, a TAP on the right block hops it onto the tower
    await waitAsk(c.page).catch(() => {});
    await clearEv(c.page);
    const rp = (await piecesInfo(c.page)).find(i => i.right);
    await tapAt(c, rp, 70);
    const st = await waitEv(c.page, 'stack', 4000);
    const ta = await evOf(c.page, 'tapPiece'), da = await evOf(c.page, 'drop');
    check(`${tag}: tap on the hinted right block → assisted hop onto the tower (stack)`, st && ta.length === 1 && ta[0].assist === true && da.length === 1 && da[0].assisted === true, await evTypes(c.page));
    await waitAsk(c.page, 8000).catch(() => {});
    if ((await wstate(c.page)).phase === 'ask') {
      await clearEv(c.page);
      await dragRight(c);
      check(`${tag}: a real drag still stacks afterwards`, await waitEv(c.page, 'stack', 4000));
    }
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* A short tap (< 24 px, < 0.35 s) only names the block. */
async function gTap(check) {
  for (const [d, lang] of [[DEV.iphoneP, 'en'], [DEV.ipadL, 'vi'], [DEV.iphoneL, 'en']]) {
    const c = await open(d, `mute=1&seed=29&age=4&lang=${lang}`);
    const tag = `tap/${d.name} ${lang}`;
    await begin(c);
    await sleep(800);   // the 700 ms name throttle after the start
    const s0 = await wstate(c.page);
    const p = (await piecesInfo(c.page)).find(i => !i.right);
    await clearEv(c.page);
    const n0 = await vlen(c.page);
    await tapAt(c, p, 80);
    await sleep(300);
    const tp = await evOf(c.page, 'tapPiece');
    check(`${tag}: tap → tapPiece (no assist), no grab / drop / miss`, tp.length === 1 && tp[0].pieceId === p.id && !tp[0].assist && (await evOf(c.page, 'grab')).length === 0 && (await evOf(c.page, 'drop')).length === 0 && (await evOf(c.page, 'miss')).length === 0, await evTypes(c.page));
    const nm = tp[0] && await c.page.evaluate(([l, k, v]) => RB.I18N.name(l, k, v), [lang, tp[0].nameKind, tp[0].nameValue]);
    const lines = await vsince(c.page, n0);
    const norm = s => String(s).toLowerCase().replace(/[!.?,]/g, '').trim();
    check(`${tag}: the voice log has the block's name ("${nm}")`, lines.length >= 1 && lines.some(l => norm(l).includes(norm(nm))) && lines.every(l => !badText(l)), { lines, nm });
    if (lang === 'vi') check(`${tag}: VI name has diacritics or is a number/letter`, lines.some(l => VI_RE.test(l) || /\d|^[A-ZĐ]/.test(l)), lines);
    await waitRest(c.page, p.id, 3000);
    const s1 = await wstate(c.page);
    check(`${tag}: no stack, tower unchanged, still asking`, s1.tower === s0.tower && s1.phase === 'ask' && s1.ask === s0.ask && (await evOf(c.page, 'stack')).length === 0, s1);
    // a tap on the RIGHT block also only names it (not hinted yet)
    await sleep(800);
    await clearEv(c.page);
    const r = (await piecesInfo(c.page)).find(i => i.right);
    await tapAt(c, r, 80); await sleep(500);
    check(`${tag}: a tap on the right block (no hint yet) does not stack it`, (await evOf(c.page, 'stack')).length === 0 && (await evOf(c.page, 'tapPiece')).length === 1 && (await towerN(c.page)) === s0.tower, await evTypes(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Tap on Lulu → pokeLulu, the prompt is repeated word for word; bubble tap too. */
async function gPoke(check) {
  for (const d of [DEV.iphoneL, DEV.ipadP, DEV.iphoneP]) {
    const c = await open(d, 'mute=1&seed=61&age=4');
    const tag = `poke/${d.name}`;
    await begin(c); await sleep(3300);   // taps on Lulu < 3 s after the prompt started are ignored (playtest P1-1)
    const prompt = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
    // a point on Lulu that the DOM bubble does not cover
    const pp = await c.page.evaluate(() => {
      const b = RB.debug.luluScreen();
      for (const f of [0.25, 0.1, 0.35, 0, -0.15]) { const p = { x: b.x, y: b.y + f * b.h }; const e = document.elementFromPoint(p.x, p.y); if (e && e.id === 'game' && RB.debug.world._hit((p.x - RB.debug.view().left) / RB.debug.view().s, (p.y - RB.debug.view().top) / RB.debug.view().s) === 'lulu') return p; }
      return { x: b.x, y: b.y, fallback: true };
    });
    const n0 = await vlen(c.page);
    await clearEv(c.page);
    await tapAt(c, pp); await sleep(300);
    const ev = await evTypes(c.page);
    const lines = await vsince(c.page, n0);
    check(`${tag}: short tap on Lulu → pokeLulu event`, ev.includes('pokeLulu') && !ev.includes('grab') && !ev.includes('wrong'), { ev, pp });
    check(`${tag}: voice repeats the same prompt`, lines.includes(prompt), { lines, prompt });
    check(`${tag}: phase still ask`, (await wstate(c.page)).phase === 'ask');
    // long press on Lulu → not a poke
    await clearEv(c.page);
    await touch(c.cdp, 'touchStart', [pp]); await sleep(700); await touch(c.cdp, 'touchEnd', []); await sleep(150);
    check(`${tag}: long press on Lulu is not a poke`, !(await evTypes(c.page)).includes('pokeLulu'), await evTypes(c.page));
    // bubble tap repeats
    const n1 = await vlen(c.page), d0 = await downs(c.page);
    await tapEl(c, '#bubble'); await sleep(300);
    const l2 = await vsince(c.page, n1);
    check(`${tag}: tap on the bubble repeats the prompt`, l2.includes(prompt), { l2, prompt });
    check(`${tag}: bubble tap never reaches the world`, (await downs(c.page)) === d0);
    for (let i = 0; i < 8; i++) { await tapAt(c, pp, 30); await sleep(40); }
    check(`${tag}: rapid Lulu taps → still asking, no crash`, (await wstate(c.page)).phase === 'ask');
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Multi-finger: a second finger never steals or adds a drag; touchcancel sends the block home. */
async function gMulti(check) {
  for (const d of [DEV.iphoneL, DEV.ipadP]) {
    const c = await open(d, 'mute=1&seed=301&age=4');
    const tag = `multi/${d.name}`;
    await begin(c);
    const pl = await piecesInfo(c.page), wrongP = pl.find(i => !i.right), right = pl.find(i => i.right);
    const to = await dropPt(c.page), n0 = await towerN(c.page), d0 = await downs(c.page);
    await clearEv(c.page);
    const f1 = { x: right.x, y: right.y, id: 1 };
    await touch(c.cdp, 'touchStart', [f1]);
    for (let k = 1; k <= 4; k++) { await touch(c.cdp, 'touchMove', [{ x: right.x + (to.x - right.x) * k / 12, y: right.y + (to.y - right.y) * k / 12, id: 1 }]); await sleep(16); }
    const f1m = { x: right.x + (to.x - right.x) / 3, y: right.y + (to.y - right.y) / 3, id: 1 };
    // second finger lands on a wrong block and drags it to the tower
    await touch(c.cdp, 'touchStart', [f1m, { x: wrongP.x, y: wrongP.y, id: 2 }]); await sleep(16);
    for (let k = 1; k <= 8; k++) { await touch(c.cdp, 'touchMove', [f1m, { x: wrongP.x + (to.x - wrongP.x) * k / 8, y: wrongP.y + (to.y - wrongP.y) * k / 8, id: 2 }]); await sleep(16); }
    await touch(c.cdp, 'touchMove', [f1m]); await sleep(30);   // finger 2 lifts
    const wp = await pieceState(c.page, wrongP.id);
    check(`${tag}: second finger does not move the wrong block`, wp.state === 'rest' && wp.atHome, wp);
    for (let k = 5; k <= 12; k++) { await touch(c.cdp, 'touchMove', [{ x: right.x + (to.x - right.x) * k / 12, y: right.y + (to.y - right.y) * k / 12, id: 1 }]); await sleep(16); }
    await touch(c.cdp, 'touchEnd', []);
    await waitEv(c.page, 'stack', 4000); await sleep(200);
    const ev = await evTypes(c.page);
    check(`${tag}: the first finger's drag still stacks; no wrong`, ev.includes('stack') && !ev.includes('wrong') && (await towerN(c.page)) === n0 + 1, ev);
    check(`${tag}: world.pointerDown called once (the 2nd finger never reached the world)`, (await downs(c.page)) - d0 === 1, (await downs(c.page)) - d0);
    // touchcancel mid-drag → block flies home, no drop / miss event
    await waitAsk(c.page).catch(() => {});
    const r2 = (await piecesInfo(c.page)).find(i => i.right);
    await clearEv(c.page);
    await drag(c, r2, to, { keep: true });
    await touch(c.cdp, 'touchCancel', []);
    const home = await waitRest(c.page, r2.id, 5000);
    const ev2 = await evTypes(c.page);
    check(`${tag}: touchcancel mid-drag → block home, no drop / miss / stack`, home && !ev2.includes('drop') && !ev2.includes('miss') && !ev2.includes('stack'), ev2);
    await waitAsk(c.page).catch(() => {});
    await clearEv(c.page);
    await dragRight(c);
    check(`${tag}: next real drag works after the cancel`, await waitEv(c.page, 'stack', 4000), await evTypes(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Talk time answered by tapping a choice. */
async function toTalk(c) {
  await c.page.evaluate(() => { window.__stopBotOnTalk = true; RB.debug.setBot(true, 1); RB.debug.setSpeed(20); });
  await c.page.waitForFunction(() => RB.debug.mode === 'talk' && RB.debug.world.state === 'talk', null, { timeout: 120000, polling: 200 });
  await c.page.evaluate(() => { window.__stopBotOnTalk = false; RB.debug.setBot(false); RB.debug.setSpeed(1); });
  await sleep(500);
}
async function gTalk(check) {
  for (const [d, lang] of [[DEV.ipadL, 'en'], [DEV.iphoneP, 'vi'], [DEV.iphoneL, 'en']]) {
    const c = await open(d, `mute=1&seed=71&age=4&lang=${lang}`);
    const tag = `talk/${d.name} ${lang}`;
    await startGame(c, 2);
    await toTalk(c);
    check(`${tag}: Talk time screen opens after the chapter`, await visible(c.page, 'scrTalk'));
    await shot(c, 'talk');
    const tk = await c.page.evaluate(() => { const t = RB.debug.world.talk; return { answerId: t.answerId, ids: t.choices.map(c => c.id), q: document.getElementById('talkQ').textContent, btns: [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.id, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom }; }) }; });
    check(`${tag}: 2–4 choice buttons ≥ 64 px, on screen`, tk.btns.length >= 2 && tk.btns.length <= 4 && tk.btns.every(b => b.w >= 64 && b.h >= 64 && b.l >= 0 && b.t >= 0 && b.r <= d.viewport.width && b.b <= d.viewport.height), tk.btns);
    check(`${tag}: question text clean${lang === 'vi' ? ' (VI diacritics)' : ''}`, !badText(tk.q) && (lang !== 'vi' || VI_RE.test(tk.q)), tk.q);
    const tq = await c.page.evaluate(() => window.__vl.slice(-6).map(l => l.text));
    check(`${tag}: the Talk question is spoken`, tq.some(l => l.includes(tk.q)), { tq, q: tk.q });
    if (d === DEV.ipadL) {   // app switch during Talk time → paused; resume returns to the question
      await hidePage(c.page, true); await sleep(150); await hidePage(c.page, false); await sleep(150);
      check(`${tag}: hidden during Talk → paused`, (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
      const nq = await vlen(c.page);
      await tapEl(c, '#btnResume'); await sleep(300);
      check(`${tag}: resume → Talk screen back, question repeated`, (await mode(c.page)) === 'talk' && await visible(c.page, 'scrTalk') && (await vsince(c.page, nq)).some(l => l.includes(tk.q)), { m: await mode(c.page), l: await vsince(c.page, nq) });
    }
    const s0 = await c.page.evaluate(() => RB.debug.world.stars);
    await clearEv(c.page);
    const d0 = await downs(c.page);
    await tapEl(c, `#talkChoices button[data-id="${tk.answerId}"]`); await sleep(300);
    const tr = await evOf(c.page, 'talkResult');
    check(`${tag}: right answer by tap → talkResult correct`, tr.length === 1 && tr[0].correct === true, tr);
    check(`${tag}: stars +1`, (await c.page.evaluate(() => RB.debug.world.stars)) === s0 + 1, { s0, s1: await c.page.evaluate(() => RB.debug.world.stars) });
    check(`${tag}: choice taps never reach the world`, (await downs(c.page)) === d0);
    const other = tk.ids.find(i => i !== tk.answerId);
    await tapEl(c, `#talkChoices button[data-id="${other}"]`); await sleep(200);
    check(`${tag}: a second answer is ignored`, (await evOf(c.page, 'talkResult')).length === 1);
    await sleep(1500);
    await setSpeed(c.page, 3);
    await c.page.waitForFunction(() => RB.debug.world.level === 1 && RB.debug.mode === 'play', null, { timeout: 15000 }).catch(() => {});
    check(`${tag}: next chapter (next time of day) starts, talk screen closed`, (await c.page.evaluate(() => RB.debug.world.level)) === 1 && (await c.page.evaluate(() => RB.debug.world.weather)) === 1 && !(await visible(c.page, 'scrTalk')) && (await mode(c.page)) === 'play', await wstate(c.page));
    await waitAsk(c.page).catch(() => {});
    await setSpeed(c.page, 1);
    await sleep(800);
    const hud = await c.page.evaluate(() => +document.getElementById('hudStars').textContent);
    const ws = await c.page.evaluate(() => RB.debug.world.stars);
    check(`${tag}: HUD star count = world stars`, hud === ws, { hud, ws });
    await clearEv(c.page);
    await dragRight(c);
    check(`${tag}: real drag works in chapter 2`, await waitEv(c.page, 'stack', 4000), await evTypes(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Pause / resume via the pause button. */
async function gPause(check) {
  const c = await open(DEV.iphoneP, 'mute=1&seed=81&age=4');
  await begin(c);
  await tapEl(c, '#btnPause'); await sleep(200);
  check('pause: pause button → paused, pause screen', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  await shot(c, 'pause');
  const t0 = await c.page.evaluate(() => RB.debug.world.time);
  await sleep(800);
  const t1 = await c.page.evaluate(() => RB.debug.world.time);
  check('pause: world time frozen while paused', t1 === t0, { t0, t1 });
  const d0 = await downs(c.page);
  const rp = await c.page.evaluate(() => { for (let gy = 1; gy < 20; gy++) for (let gx = 1; gx < 10; gx++) { const x = innerWidth * gx / 10, y = innerHeight * gy / 20, e = document.elementFromPoint(x, y); if (e && !e.closest('button,input,label') && e.closest('#scrPause')) return { x, y }; } return { x: 10, y: 10 }; });
  await tapAt(c, rp); await sleep(100);
  check('pause: taps while paused do not reach the world', (await downs(c.page)) === d0 && (await mode(c.page)) === 'paused');
  const n0 = await vlen(c.page);
  await tapEl(c, '#btnResume'); await sleep(700);
  check('pause: resume → play, pause screen hidden', (await mode(c.page)) === 'play' && !(await visible(c.page, 'scrPause')));
  check('pause: resume tap does not reach the world', (await downs(c.page)) === d0);
  const prompt = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('pause: resume repeats the prompt', (await vsince(c.page, n0)).includes(prompt), { l: await vsince(c.page, n0), prompt });
  await clearEv(c.page);
  await dragRight(c);
  check('pause: a real drag stacks after resume', await waitEv(c.page, 'stack', 4000), await evTypes(c.page));
  // pause while the block falls → resume → it lands
  await waitAsk(c.page).catch(() => {});
  await clearEv(c.page);
  await dragRight(c);
  await tapEl(c, '#btnPause'); await sleep(300);
  const ph = await c.page.evaluate(() => RB.debug.world.phase);
  await tapEl(c, '#btnResume');
  check(`pause: paused mid-fall (${ph}) → resume → the block lands and stacks`, await waitEv(c.page, 'stack', 5000), await evTypes(c.page));
  // Home
  await setSpeed(c.page, 3);
  await waitAsk(c.page).catch(() => {});
  await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(300);
  check('pause: Home → title (HUD + bubble hidden)', (await mode(c.page)) === 'title' && await visible(c.page, 'scrTitle') && !(await visible(c.page, 'hud')) && !(await visible(c.page, 'bubble')));
  await tapEl(c, '#btnPlay'); await sleep(300);
  await waitAsk(c.page).catch(() => {});
  const s = await wstate(c.page);
  check('pause: Play after Home starts a fresh session', s.mode === 'play' && s.level === 0 && s.round === 0 && s.stars === 0 && s.tower === 0, s);
  check('pause: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gVisibility(check) {
  const c = await open(DEV.ipadP, 'mute=1&seed=82&age=4');
  await begin(c);
  const hide = h => c.page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await sleep(200);
  check('visibility: hidden page → paused', (await mode(c.page)) === 'paused');
  const t0 = await c.page.evaluate(() => RB.debug.world.time); await sleep(400);
  await hide(false); await sleep(300);
  check('visibility: back visible → still paused (waits for the child)', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  check('visibility: world did not run while hidden', (await c.page.evaluate(() => RB.debug.world.time)) === t0);
  await tapEl(c, '#btnResume');
  await waitAsk(c.page).catch(() => {});
  await clearEv(c.page); await dragRight(c);
  check('visibility: play continues after resume (real drag stacks)', await waitEv(c.page, 'stack', 4000));
  // hidden in the MIDDLE of a drag → paused, the drag is cancelled, the block goes home after resume
  await waitAsk(c.page).catch(() => {});
  const r = (await piecesInfo(c.page)).find(i => i.right);
  await clearEv(c.page);
  await drag(c, r, await dropPt(c.page), { keep: true, steps: 6 });
  await hide(true); await sleep(100);
  await touch(c.cdp, 'touchEnd', []);
  await hide(false); await sleep(100);
  check('visibility: hidden mid-drag → paused, drag cancelled', (await mode(c.page)) === 'paused' && (await c.page.evaluate(() => RB.debug.world._press)) == null);
  await tapEl(c, '#btnResume');
  const home = await waitRest(c.page, r.id, 5000);
  check('visibility: after resume the block is home, no drop / stack', home && !(await evTypes(c.page)).some(t => t === 'drop' || t === 'stack'), await evTypes(c.page));
  await waitAsk(c.page).catch(() => {});
  await dragRight(c);
  check('visibility: the next real drag stacks', await waitEv(c.page, 'stack', 4000));
  check('visibility: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Rotate the device while a block is being dragged: the drag is cancelled, everything stays inside, the game continues. */
async function gRotate(check) {
  const pairs = [[DEV.iphoneP, DEV.iphoneL], [DEV.iphoneL, DEV.iphoneP], [DEV.ipadL, DEV.ipadP], [DEV.ipadP, DEV.ipadL]];
  for (const [a, b] of pairs) {
    const c = await open(a, 'mute=1&seed=91&age=4');
    const tag = `rotate/${a.name}→${b.name}`;
    await begin(c);
    const r = (await piecesInfo(c.page)).find(i => i.right), to = await dropPt(c.page), n0 = await towerN(c.page);
    await clearEv(c.page);
    await c.page.evaluate(() => { window.__vpLog = []; });
    await drag(c, r, { x: (r.x + to.x) / 2, y: (r.y + to.y) / 2 }, { keep: true, steps: 6 });
    const dragging = await c.page.evaluate(id => RB.debug.world.pieceById(id).state, r.id);
    await c.page.setViewportSize(b.viewport);
    await c.page.waitForFunction(() => window.__vpLog.some(v => v.W !== window.__vpLog[0].W || true) && window.__vpLog.length > 0, null, { timeout: 5000 }).catch(() => {});
    await sleep(250);
    const vp = await c.page.evaluate(() => window.__vpLog.slice());
    const st = await c.page.evaluate(id => ({ press: RB.debug.world._press, p: RB.debug.world.pieceById(id) && RB.debug.world.pieceById(id).state }), r.id);
    check(`${tag}: rotated while dragging (${dragging}) → drag cancelled`, dragging === 'drag' && vp.length >= 1 && st.press == null && st.p !== 'drag', { dragging, vp, st });
    // the finger keeps moving and lifts over the (old) drop point: nothing may be dropped
    await touch(c.cdp, 'touchMove', [{ x: to.x, y: to.y, id: 1 }]); await sleep(30);
    await touch(c.cdp, 'touchEnd', []);
    await waitRest(c.page, r.id, 5000);
    await sleep(200);
    const ev = await evTypes(c.page);
    check(`${tag}: the stale finger lifting drops nothing`, !ev.includes('drop') && !ev.includes('stack') && !ev.includes('wrong') && (await towerN(c.page)) === n0, ev);
    const v1 = await sceneAudit(c.page);
    const ps = await pieceState(c.page, r.id);
    check(`${tag}: blocks / tower / Lulu inside the rotated screen, block home`, v1.length === 0 && ps.state === 'rest' && ps.atHome, { v1, ps });
    const W = await c.page.evaluate(() => RB.debug.getState());
    check(`${tag}: logical size switched orientation`, (b.viewport.width > b.viewport.height) === (W.W > W.H), { W: W.W, H: W.H });
    await shot({ page: c.page, dev: b }, 'rotate-after-drag');
    await waitAsk(c.page).catch(() => {});
    await clearEv(c.page);
    await dragRight(c);
    check(`${tag}: a real drag on the new layout stacks`, await waitEv(c.page, 'stack', 4000), await evTypes(c.page));
    // rotate again while the right block FALLS → it still lands
    await waitAsk(c.page, 8000).catch(() => {});
    const s = await wstate(c.page);
    if (s.phase === 'ask') {
      await clearEv(c.page);
      await dragRight(c);
      await c.page.setViewportSize(a.viewport);
      check(`${tag}: rotated during the fall → it still lands (stack)`, await waitEv(c.page, 'stack', 5000), await evTypes(c.page));
    }
    await c.page.evaluate(() => { RB.debug.setBot(true, 1); RB.debug.setSpeed(4); });
    const k0 = await c.page.evaluate(() => RB.debug.world.level * 10 + RB.debug.world.round);
    const prog = await c.page.waitForFunction(k0 => { const w = RB.debug.world; return w.level * 10 + w.round > k0 && w.phase === 'ask'; }, k0, { timeout: 30000 }).then(() => true).catch(() => false);
    check(`${tag}: the game continues to the next tower`, prog, await wstate(c.page));
    const v2 = await sceneAudit(c.page);
    check(`${tag}: next tower inside the screen`, v2.length === 0, v2);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Count chapter: towers 0, 1 and 2 count up (tower 3, when the chapter reaches it, asks by dots in ascending order) (p.countUp n = 1, 2, 3 … bottom-up; ages 6–7 count on from 2…5). */
async function gCountUp(check) {
  for (const [d, age] of [[DEV.iphoneL, 4], [DEV.ipadP, 5], [DEV.iphoneP, 6]]) {
    let c = null, idx = -1, seed = 0;
    for (const s of [77, 78, 79, 80, 81, 82, 83, 84]) {
      c = await open(d, `mute=1&seed=${s}&age=${age}`);
      await startGame(c, 1);
      await c.page.waitForFunction(() => RB.debug.world.levels && RB.debug.world.levels.length, null, { timeout: 8000 });
      idx = await c.page.evaluate(() => RB.debug.world.levels.indexOf('count'));
      seed = s;
      if (idx >= 0) break;
      await c.close();
    }
    const tag = `countup/${d.name} age${age}`;
    check(`${tag}: found a session with a count chapter (seed ${seed})`, idx >= 0);
    if (idx < 0) continue;
    await c.page.evaluate(i => { window.__ev = []; RB.debug.gotoLevel(i); RB.debug.setBot(true, 1); RB.debug.setSpeed(6); }, idx);
    await c.page.waitForFunction(() => window.__ev.some(e => (e.type === 'ask' && e.rd === 3 && e.ask >= 1) || e.type === 'levelDone' || e.type === 'talk'), null, { timeout: 90000 }).catch(() => {});
    await c.page.evaluate(() => RB.debug.setBot(false));
    const byR = await c.page.evaluate(() => { const o = {}; let cur = null; for (const e of window.__ev) { if (e.type === 'round') { cur = e.round; o[cur] = { topic: e.topic, n: e.n, asks: [] }; } else if (e.type === 'ask' && cur != null) o[cur].asks.push({ k: e.promptKey, n: e.params && e.params.n }); } return o; });
    for (const r of [0, 1, 2]) {
      const R = byR[r];
      if (r === 2 && !R) continue;   // the chapter time limit may end after 2 towers
      const ok = R && R.topic === 'count' && R.asks.length === R.n && R.asks.every(a => a.k === 'p.countUp') && R.asks.every((a, i) => a.n === R.asks[0].n + i) && (age >= 6 ? R.asks[0].n >= 1 : R.asks[0].n === 1);
      check(`${tag}: tower ${r} counts up in order (p.countUp n = ${age >= 6 ? 'k, k+1' : '1, 2'}, …)`, ok, R);
    }
    const R3 = byR[3];
    if (R3) check(`${tag}: tower 3 asks by dice dots in ascending order (p.count)`, R3.asks.length >= 1 && R3.asks.every(a => a.k === 'p.count') && R3.asks.every((a, i) => i === 0 || a.n > R3.asks[i - 1].n), R3);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
    // ?level=N starts straight in that chapter
    const c2 = await open(d, `mute=1&seed=${seed}&age=${age}&level=${idx}`);
    await startGame(c2, 4); await waitAsk(c2.page).catch(() => {});
    const s2 = await wstate(c2.page), a2 = (await evOf(c2.page, 'ask'))[0];
    check(`${tag}: ?level=${idx} → chapter ${idx}, topic count, first ask p.countUp`, s2.level === idx && s2.topic === 'count' && a2 && a2.promptKey === 'p.countUp', { s2, a2: a2 && { k: a2.promptKey, p: a2.params } });
    const ls = await c2.page.evaluate(() => JSON.parse(localStorage.getItem('jt:settings') || 'null'));
    check(`${tag}: ?level is never saved`, !ls || !('level' in ls), ls);
    check(`${tag}: ?level page: zero console errors`, c2.errors.length === 0, c2.errors);
    await c2.close();
  }
}

/* Full bot sessions at high speed: ages 3..7 in both languages; every chapter's prompts must be spoken. */
async function gBot(check) {
  const devs = [DEV.iphoneP, DEV.ipadL, DEV.iphoneL, DEV.ipadP];
  const runs = [];
  [3, 4, 5, 6, 7].forEach((age, i) => ['en', 'vi'].forEach((lang, j) => runs.push([age, lang, devs[(i * 2 + j) % 4]])));
  await pool(runs, HEAVY, async ([age, lang, d]) => {
    const c = await open(d, `mute=1&seed=${100 + age}&age=${age}&lang=${lang}`);
    const tag = `bot/age${age} ${lang} ${d.name}`;
    await c.page.evaluate(s => { RB.debug.setBot(true, 0.7); RB.debug.setSpeed(s); RB.debug.startGame(); }, BOT_SPEED);
    const t0 = Date.now();
    let ok = true;
    try { await c.page.waitForFunction(() => RB.debug.mode === 'done', null, { timeout: 150000, polling: 500 }); } catch (e) { ok = false; }
    const st = await c.page.evaluate(() => ({ s: RB.debug.getState(), stats: RB.debug.stats, age: RB.debug.world.age, levels: RB.debug.world.levels, t: RB.debug.world.time }));
    check(`${tag}: session reaches mode done`, ok, st);
    check(`${tag}: played at age ${age}`, st.age === age, st.age);
    const cnt = await c.page.evaluate(() => { const n = t => window.__ev.filter(e => e.type === t).length; return { level: n('level'), talk: n('talk'), round: n('round'), roundDone: n('roundDone'), towerDone: n('towerDone'), sessionDone: n('sessionDone'), wrong: n('wrong'), stack: n('stack'), asks: n('ask'), bananas: n('bananas') }; });
    check(`${tag}: 4 chapters, 4 talks, every tower done, one stack per ask`, cnt.level === 4 && cnt.talk === 4 && cnt.round === cnt.roundDone && cnt.round === cnt.towerDone && cnt.round >= 12 && cnt.sessionDone === 1 && cnt.stack === cnt.asks && cnt.bananas === cnt.round, cnt);
    // every ask's prompt spoken (one of the prompt's wordings, in the session language), chapter by chapter
    const pr = await c.page.evaluate(lang => {
      const vl = window.__vl, out = { perLevel: {}, missing: [] };
      const variants = (key, params) => { const s = new Set(); for (let i = 0; i < 48; i++) s.add(RB.I18N.t(lang, key, Object.assign({ child: '' }, params || {}), () => (i + 0.5) / 48)); return s; };
      for (const e of window.__ev) {
        if (e.type !== 'ask' && e.type !== 'talk') continue;
        const key = e.type === 'ask' ? e.promptKey : e.tk.promptKey, params = e.type === 'ask' ? e.params : e.tk.params;
        const V = variants(key, params);
        const L = out.perLevel[e.lv] = out.perLevel[e.lv] || { asks: 0, spoken: 0, talk: 0, topic: null, keys: new Set() };
        const hit = vl.slice(e.vl, e.vl + 40).some(l => l.lang === lang && (V.has(l.text) || [...V].some(v => l.text.endsWith(' ' + v))));
        if (e.type === 'ask') { L.asks++; if (hit) L.spoken++; L.keys.add(key); } else if (hit) L.talk++;
        if (!hit && out.missing.length < 6) out.missing.push({ lv: e.lv, type: e.type, key, params, near: vl.slice(e.vl, e.vl + 4).map(l => l.text) });
      }
      for (const k in out.perLevel) out.perLevel[k].keys = [...out.perLevel[k].keys];
      return out;
    }, lang);
    const lvOk = [0, 1, 2, 3].every(i => pr.perLevel[i] && pr.perLevel[i].asks > 0 && pr.perLevel[i].spoken === pr.perLevel[i].asks && pr.perLevel[i].talk >= 1);
    check(`${tag}: every chapter's prompts + Talk question are spoken in ${lang}`, lvOk && pr.missing.length === 0, pr);
    // count-up order in a count chapter
    const cu = await c.page.evaluate(() => { const o = []; let cur = null; for (const e of window.__ev) { if (e.type === 'round') { cur = { lv: e.lv, round: e.round, topic: e.topic, n: e.n, ns: [] }; o.push(cur); } else if (e.type === 'ask' && cur && e.promptKey === 'p.countUp') cur.ns.push(e.params.n); } return o.filter(r => r.topic === 'count'); });
    if (cu.length) {
      const bad = cu.filter(r => (r.round <= 2) !== (r.ns.length > 0) || (r.round <= 2 && (r.ns.length !== r.n || r.ns.some((n, i) => n !== r.ns[0] + i) || (age <= 5 && r.ns[0] !== 1))));
      check(`${tag}: count chapter: towers 0–2 count up in order`, bad.length === 0, bad);
    }
    const vl = await c.page.evaluate(() => window.__vl.map(l => l.lang + '|' + l.text));
    const bad = vl.filter(t => badText(t.slice(3)) !== null).map(t => t);
    check(`${tag}: no raw keys / undefined in voice lines`, bad.length === 0, bad.slice(0, 5));
    function badText(s) { if (!s.trim()) return 'empty'; if (/[{}]|\bundefined\b|\bNaN\b|\[object/.test(s)) return 'x'; if (/\b(p|ui|topic|talk|session|weather|surprise|stack)\.[a-zA-Z0-9]/.test(s)) return 'key'; return null; }
    const wrongLang = vl.filter(t => !t.startsWith(lang + '|'));
    check(`${tag}: every voice line in ${lang}`, wrongLang.length === 0, wrongLang.slice(0, 5));
    const neg = vl.filter(t => NEG_RE.test(t.slice(3)));
    check(`${tag}: no negative words in any voice line`, neg.length === 0, [...new Set(neg)].slice(0, 6));
    if (lang === 'vi') { const viShare = vl.filter(t => VI_RE.test(t)).length / Math.max(1, vl.length); check(`${tag}: VI lines carry Vietnamese diacritics (≥ 80 %)`, viShare >= 0.8, { viShare, sample: vl.filter(t => !VI_RE.test(t)).slice(0, 8) }); }
    const done = await c.page.evaluate(() => ({ t: document.getElementById('doneTitle').textContent, s: +document.getElementById('doneStars').textContent, ws: RB.debug.world.stars }));
    check(`${tag}: done screen with stars = world stars`, await visible(c.page, 'scrDone') && done.s === done.ws && done.s > 0 && !badText(done.t), done);
    const sway = await c.page.evaluate(() => Math.abs(RB.debug.world.tower.theta || 0));
    check(`${tag}: numbers stay finite (tower theta)`, isFinite(sway), sway);
    c.note = `${tag}: ${((Date.now() - t0) / 1000).toFixed(1)} s real, ${st.t.toFixed(0)} s game, stars ${done.ws}, topics ${(st.levels || []).join('/')}, ${JSON.stringify(cnt)}`;
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors.slice(0, 5));
    console.log('      ' + c.note);
    await c.close();
  });
}

/* Session done screen, Play again, Home. */
async function gDone(check) {
  for (const [d, p] of [[DEV.iphoneP, 'again'], [DEV.ipadL, 'home']]) {
    const c = await open(d, 'mute=1&seed=120&age=4');
    const tag = `done/${d.name}`;
    await c.page.evaluate(s => { RB.debug.setBot(true, 1); RB.debug.setSpeed(s); RB.debug.startGame(); }, BOT_SPEED);
    await c.page.waitForFunction(() => RB.debug.mode === 'done', null, { timeout: 150000, polling: 500 }).catch(() => {});
    await c.page.evaluate(() => { RB.debug.setBot(false); RB.debug.setSpeed(1); });
    await sleep(1200);
    const st = await c.page.evaluate(() => ({ mode: RB.debug.mode, title: document.getElementById('doneTitle').textContent, stars: +document.getElementById('doneStars').textContent, ws: RB.debug.world.stars }));
    check(`${tag}: party screen shown with stars`, st.mode === 'done' && await visible(c.page, 'scrDone') && st.stars === st.ws && st.stars > 0 && !badText(st.title), st);
    await shot(c, 'done');
    const btns = await c.page.evaluate(() => ['btnAgain', 'btnDoneHome'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, w: r.width, h: r.height, b: r.bottom, r: r.right }; }));
    check(`${tag}: Play again / Home buttons ≥ 44 px & on screen`, btns.every(b => b.w >= 44 && b.h >= 44 && b.b <= d.viewport.height && b.r <= d.viewport.width), btns);
    if (p === 'again') {
      await tapEl(c, '#btnAgain'); await sleep(300);
      await setSpeed(c.page, 4);
      await waitAsk(c.page).catch(() => {});
      await setSpeed(c.page, 1);
      const s = await wstate(c.page);
      check(`${tag}: Play again → new session (level 0, round 0, stars 0, HUD 0)`, s.mode === 'play' && s.level === 0 && s.round === 0 && s.stars === 0 && (await c.page.evaluate(() => document.getElementById('hudStars').textContent)) === '0' && !(await visible(c.page, 'scrDone')), s);
      const lv = await c.page.evaluate(() => RB.debug.world.levels);
      check(`${tag}: the new session plans 4 chapters`, lv && lv.length === 4, lv);
      await clearEv(c.page);
      await dragRight(c);
      check(`${tag}: real drags work in the new session`, await waitEv(c.page, 'stack', 4000));
    } else {
      await tapEl(c, '#btnDoneHome'); await sleep(300);
      const t = await c.page.evaluate(() => ({ mode: RB.debug.mode, stars: +document.getElementById('titleStars').textContent }));
      check(`${tag}: Home → title, total stars = session stars`, t.mode === 'title' && await visible(c.page, 'scrTitle') && t.stars === st.ws, { t, st });
      await c.page.reload(); await waitTitle(c.page);
      const t2 = await c.page.evaluate(() => +document.getElementById('titleStars').textContent);
      check(`${tag}: total stars persist across reload`, t2 === t.stars, { t2, t: t.stars });
    }
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Every ask for a while (bot) on every device: blocks on screen, not under the DOM HUD/bubble, the centre of each hit box
 * picks that block, the drop point is on screen and on the canvas. */
const askAudit = page => page.evaluate(() => {
  const w = RB.debug.world, out = [];
  const all = w.pieces.filter(p => p.askIdx === w.ask);
  if (w.state !== 'round' || w.phase !== 'ask' || !all.length || !all.every(p => p.state === 'rest')) return null;   // checked atomically (the bot runs in rAF)
  const ps = all;
  const v = RB.debug.view();
  for (const p of ps) {
    const b = RB.debug.pieceScreen(p.id), c0 = RB.debug.toScreen(p.homeX, p.homeY), sd = (p.side || w.layout.S) * v.s;
    if (c0.x - sd / 2 < -2 || c0.y - sd / 2 < -2 || c0.x + sd / 2 > innerWidth + 2 || c0.y + sd / 2 > innerHeight + 2) out.push(`piece ${p.id} drawn off screen`);
    if (b.x - b.w / 2 < -40 || b.y - b.h / 2 < -40 || b.x + b.w / 2 > innerWidth + 40 || b.y + b.h / 2 > innerHeight + 40) out.push(`piece ${p.id} hit box far off screen`);
    const e = document.elementFromPoint(b.x, b.y);
    if (!e || e.id !== 'game') out.push(`piece ${p.id} centre under #${e && (e.id || e.className)}`);
    const h = w.pieceHit(p.id), hit = w._hit(h.x, h.y);
    if (hit !== p) out.push(`centre of piece ${p.id} resolves to ${hit && hit.id != null ? 'piece ' + hit.id : hit}`);
  }
  const dp = RB.debug.dropScreen(), de = dp && document.elementFromPoint(dp.x, dp.y);
  if (!dp || dp.x < 0 || dp.y < 0 || dp.x > innerWidth || dp.y > innerHeight) out.push('drop point off screen');
  else if (!de || de.id !== 'game') out.push(`drop point under #${de && (de.id || de.className)}`);
  const a = RB.debug.answerId();
  if (ps.filter(p => p.id === a).length !== 1) out.push('answer not among the resting blocks');
  return { out, n: ps.length, topic: w.topic, k: w.level + ':' + w.round + ':' + w.ask };
});
async function gLayout(check) {
  const runs = [[DEV.iphoneP, 5], [DEV.iphoneL, 6], [DEV.ipadP, 3], [DEV.ipadL, 7]];
  for (const [d, age] of runs) {
    const c = await open(d, `mute=1&seed=${200 + age}&age=${age}`);
    const tag = `layout/${d.name} age${age}`;
    await c.page.evaluate(() => { RB.debug.setBot(true, 1); RB.debug.setSpeed(5); RB.debug.startGame(); });
    const seen = new Set(), viol = [];
    const t0 = Date.now();
    while (Date.now() - t0 < 35000) {
      const s = await c.page.evaluate(() => ({ mode: RB.debug.mode, st: RB.debug.world.state, ph: RB.debug.world.phase, k: RB.debug.world.level + ':' + RB.debug.world.round + ':' + RB.debug.world.ask, rest: RB.debug.world.pieces.filter(p => p.askIdx === RB.debug.world.ask).every(p => p.state === 'rest') }));
      if (s.mode === 'done') break;
      if (s.st === 'round' && s.ph === 'ask' && s.rest && !seen.has(s.k)) {
        const r = await askAudit(c.page);
        if (!r) continue;
        seen.add(s.k);
        r.out.forEach(o => viol.push(`${s.k} ${r.topic}: ${o}`));
      }
      await sleep(30);
    }
    check(`${tag}: audited ≥ 10 asks`, seen.size >= 10, seen.size);
    check(`${tag}: every audited ask: blocks on screen, on the canvas, hits resolve, drop point clear`, viol.length === 0, viol.slice(0, 8).concat(viol.length > 8 ? ['… ' + viol.length + ' total'] : []));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors.slice(0, 5));
    await c.close();
  }
}

/* Idle help: 12 s without a grab → idle nudge (prompt again), the 2nd idle hints, ≈ 2 min → auto-pause. */
async function gIdle(check) {
  const c = await open(DEV.iphoneL, 'mute=1&seed=311&age=4');
  await begin(c);
  await clearEv(c.page);
  const n0 = await vlen(c.page);
  await setSpeed(c.page, 8);
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'idle').length >= 2, null, { timeout: 15000 }).catch(() => {});
  await setSpeed(c.page, 1);
  const idl = await evOf(c.page, 'idle'), hi = await evOf(c.page, 'hint');
  check('idle: nudges at 12 s, then ×1.5 (18 s)', idl.length >= 2 && Math.abs((idl[1].wt - idl[0].wt) - 18) < 1.5, idl.map(i => i.wt));
  check('idle: the 2nd idle hints (glow + hand)', hi.some(h => h.idle) && (await c.page.evaluate(() => !!RB.debug.world.hintHand || RB.debug.world.pieces.some(p => p._hinted))), hi);
  const prompt = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  const lines = await vsince(c.page, n0);
  check('idle: the nudge repeats the prompt', lines.some(l => l.endsWith(prompt)), { lines, prompt });
  check('idle: still playing after 2 nudges', (await mode(c.page)) === 'play');
  await setSpeed(c.page, 12);
  await c.page.waitForFunction(() => RB.debug.mode === 'paused', null, { timeout: 30000 }).catch(() => {});
  await setSpeed(c.page, 1);
  check('idle: ≈ 2 min without a grab → auto-pause', (await mode(c.page)) === 'paused', { m: await mode(c.page), idle: (await evOf(c.page, 'idle')).length });
  await tapEl(c, '#btnResume'); await sleep(300);
  await waitAsk(c.page).catch(() => {});
  await clearEv(c.page); await dragRight(c);
  check('idle: a real drag works after the auto-pause', await waitEv(c.page, 'stack', 4000), await evTypes(c.page));
  check('idle: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function pool(items, n, fn) {
  const q = items.slice(); const ws = [];
  for (let i = 0; i < Math.min(n, q.length); i++) ws.push((async () => { while (q.length) await fn(q.shift()); })());
  await Promise.all(ws);
}

const GROUPS = { boot: gBoot, lang: gLang, gate: gGate, settings: gSettings, flags: gFlags, volume: gVolume, drag: gDrag, wrong: gWrong,
  miss: gMiss, tap: gTap, poke: gPoke, multi: gMulti, talk: gTalk, pause: gPause, visibility: gVisibility, rotate: gRotate,
  idle: gIdle, countup: gCountUp, bot: gBot, done: gDone, layout: gLayout };

(async () => {
  const bad = ONLY.filter(g => !GROUPS[g]);
  if (bad.length) { console.error('unknown group(s): ' + bad.join(', ') + '\nknown: ' + Object.keys(GROUPS).join(' ')); process.exit(2); }
  srv = await serve(process.env.JT_GAME_ROOT || undefined);
  browser = await chromium.launch();
  const T0 = Date.now();
  // heavy groups first so the pool finishes evenly
  const order = ['bot', 'layout', 'rotate', 'countup', 'done', 'talk'];
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
  if (fails.length) { console.log('\n=== failures'); fails.forEach(f => console.log(`[${f.group}] ${f.name}  -- ${(typeof f.info === 'string' ? f.info : JSON.stringify(f.info)).slice(0, 500)}`)); }
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  process.exit(fails.length ? 1 : 0);
})();
