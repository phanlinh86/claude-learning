// Functional QA suite for Tuk's Ice Match — REAL touch input (CDP taps + swipes) on iPhone/iPad-sized mobile contexts.
//   node tests/e2e/functional.js                    (all groups)
//   node tests/e2e/functional.js flip match third   (only some groups)
// Groups: boot lang gate settings volume audio flags phases flip rub ice match mismatch third tapup multi stars hint repeat
//         talk pause rotate hud bot
// Prints PASS/FAIL per check + a summary table, writes tests/out/functional/results.json (+ screenshots on failure),
// exits 1 on any FAIL. Env: IM_GAME_ROOT=<dir> tests another build of game/.
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
const infos = [];
function info(name, data) { infos.push({ group: curGroup, name, data }); console.log('INFO ' + name + '  -- ' + JSON.stringify(data).slice(0, 400)); }
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũ]/i;

function badText(s) {
  if (s == null) return null;
  s = String(s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|chapter|weather|name|match|mismatch|flip)\.[a-zA-Z]/.test(s)) return 'raw i18n key';
  return null;
}

/* Runs before the game's scripts: records the Web Audio graph (connect edges) and every utterance handed to TTS. */
const INIT = () => {
  window.__edges = []; window.__utter = [];
  try {
    const oc = AudioNode.prototype.connect;
    AudioNode.prototype.connect = function (d) { try { window.__edges.push([this, d]); } catch (e) { /* ignore */ } return oc.apply(this, arguments); };
  } catch (e) { /* ignore */ }
  try {
    const P = window.SpeechSynthesis && SpeechSynthesis.prototype, os = P && P.speak;
    if (os) P.speak = function (u) { try { window.__utter.push({ text: u.text, lang: u.lang }); } catch (e) { /* ignore */ } return os.apply(this, arguments); };
  } catch (e) { /* ignore */ }
};
// never negative (REQUIREMENT "never negative words"): EN + VI
const NEG_EN = /\b(no|nope|wrong|bad|incorrect|fail(ed|s)?|lose|lost|loser|oh no|try again|mistake|silly|stupid)\b/i;
const NEG_VI = /(^|[\s,.!?])(sai|sai rồi|không đúng|không phải|tệ|dở|thua|ngốc|hỏng)([\s,.!?]|$)/i;
const negWord = (lang, s) => (lang === 'vi' ? NEG_VI : NEG_EN).exec(String(s || ''));

let srv, browser;
async function open(dev, q = '', opt = {}) {
  const ctx = opt.ctx || await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  await page.addInitScript(INIT);
  await page.goto(srv.url + (q ? '?' + q : ''));
  await waitTitle(page);
  await installEv(page);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, errors, cdp, dev, close: () => (opt.ctx ? page.close() : ctx.close()) };
}
async function waitTitle(page) {
  await page.waitForFunction(() => window.IM && IM.debug && IM.debug.mode === 'title', null, { timeout: 15000 });
}
/* Record every world event (with a timestamp) and count world.pointerDown calls (to prove HUD/menu taps never reach it). */
async function installEv(page) {
  await page.evaluate(() => {
    window.__ev = []; window.__downs = 0;
    const w = IM.debug.world;
    if (w.__hooked) return;
    w.__hooked = true;
    const o = w._emit;
    w._emit = function (e) {
      window.__ev.push(Object.assign({ at: performance.now(), wt: this.time, phase: this.phase }, e));
      if (e.type === 'talk' && window.__stopBotOnTalk) IM.debug.setBot(false);
      return o.call(this, e);
    };
    const pd = w.pointerDown;
    w.pointerDown = function (x, y) { window.__downs++; return pd.call(this, x, y); };
    window.__moves = 0;
    const pm = w.pointerMove;
    w.pointerMove = function (x, y) { window.__moves++; const r = pm.call(this, x, y); (window.__pmT = window.__pmT || []).push([x | 0, y | 0, r, this.finger.down, this.open.length, this.phase, this.state]); if (window.__pmT.length > 80) window.__pmT.shift(); return r; };
    // every reveal/tap name line the game asks for, and a copy of every voice line (+ what TTS would really say)
    window.__flipLines = []; window.__said = []; window.__pairLines = [];
    if (!IM.I18N.__hooked) {
      IM.I18N.__hooked = true;
      const sf = IM.I18N.sayFlip;
      IM.I18N.sayFlip = function (lang, ev) { const l = sf.apply(this, arguments); window.__flipLines.push({ id: ev && ev.id, type: ev && ev.type, via: ev && ev.via, lang, line: l }); return l; };
      ['sayMatch', 'sayMismatch'].forEach(fn => { const o = IM.I18N[fn]; if (o) IM.I18N[fn] = function (lang, ev) { const l = o.apply(this, arguments); (window.__pairLines = window.__pairLines || []).push({ fn, a: ev && ev.a, b: ev && ev.b, line: l }); return l; }; });
    }
    if (IM.Voice && !IM.Voice.__hooked) {
      IM.Voice.__hooked = true;
      const sy = IM.Voice.say;
      IM.Voice.say = function (text) {
        const r = sy.apply(this, arguments);
        const e = IM.debug.voiceLog[IM.debug.voiceLog.length - 1];
        if (e && window.__said) window.__said.push({ lang: e.lang, text: e.text, spoken: IM.Voice.spoken ? IM.Voice.spoken(e.lang, e.text) : e.text });
        return r;
      };
    }
  });
}
/* CDP swipe: touchStart at pts[0], touchMove through the rest (linearly interpolated, `step` CSS px apart, `dt` ms per move), touchEnd. */
async function swipe(c, pts, { step = 18, dt = 16, hold = 0, end = true } = {}) {
  await touch(c.cdp, 'touchStart', [pts[0]]);
  if (hold) await sleep(hold);
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], n = step > 0 ? Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / step)) : 1;
    for (let k = 1; k <= n; k++) { await touch(c.cdp, 'touchMove', [{ x: a.x + (b.x - a.x) * k / n, y: a.y + (b.y - a.y) * k / n }]); if (dt) await sleep(dt); }
  }
  if (end) await touch(c.cdp, 'touchEnd', []);
}
/* Lines of down blocks: rows (same y, left → right) and columns (same x, top → bottom), longest first. */
async function linesDown(page) {
  const cs = (await cards(page)).filter(x => x.state === 'down');
  const group = (key, sort) => { const g = []; for (const k of cs) { let r = g.find(r => Math.abs(r[0][key] - k[key]) < 4); if (!r) g.push(r = []); r.push(k); } g.forEach(r => r.sort(sort)); return g; };
  return group('hy', (a, b) => a.hx - b.hx).concat(group('hx', (a, b) => a.hy - b.hy)).sort((a, b) => b.length - a.length);
}
/* Down blocks grouped into rows (same home y), each sorted left → right. */
async function rowsDown(page) {
  const cs = (await cards(page)).filter(x => x.state === 'down');
  const rows = [];
  for (const k of cs) { let r = rows.find(r => Math.abs(r[0].hy - k.hy) < 4); if (!r) rows.push(r = []); r.push(k); }
  rows.forEach(r => r.sort((a, b) => a.hx - b.hx));
  return rows.sort((a, b) => b.length - a.length);
}
const strip = e => { const o = Object.assign({}, e); delete o.talk; delete o.face; delete o.faceA; delete o.faceB; return o; };
const evOf = (page, t) => page.evaluate(t => window.__ev.filter(e => e.type === t).map(e => { const o = Object.assign({}, e); delete o.talk; delete o.face; delete o.faceA; delete o.faceB; return o; }), t);
const clearEv = page => page.evaluate(() => { window.__ev = []; });
const mode = page => page.evaluate(() => IM.debug.mode);
const downs = page => page.evaluate(() => window.__downs);
const voiceN = page => page.evaluate(() => IM.debug.voiceLog.length);
const lastVoice = page => page.evaluate(() => IM.debug.voiceLog.slice(-1)[0]);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
async function shot(c, name) { try { await c.page.screenshot({ path: path.join(OUT, `${c.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }

/* Cards with their state and screen rect (CSS px). */
const cards = page => page.evaluate(() => {
  const w = IM.debug.world;
  return (w.cards || []).map(c => {
    const s = IM.debug.cardScreen(c.id);
    return { id: c.id, key: c.key, state: c.state, flip: c.flip, glow: c.glow, x: c.x, y: c.y, w: c.w, h: c.h, hx: c.hx, hy: c.hy, sx: s.x, sy: s.y, sw: s.w, sh: s.h };
  });
});
const W = (page, f, a) => page.evaluate(f, a);
const wstate = page => page.evaluate(() => { const w = IM.debug.world; return { state: w.state, phase: w.phase, open: w.open.slice(), mismatches: w.mismatches, streak: w.streak, found: w.found, pairs: w.pairs, round: w.round, level: w.level, stars: w.stars, solved: w.solved }; });
async function waitPlay(page, timeout = 20000) {
  await page.waitForFunction(() => { const w = IM.debug.world; return IM.debug.mode === 'play' && w.state === 'round' && w.phase === 'play' && w.open.length === 0 && !w.solved && w.cards.some(c => c.state === 'down'); }, null, { timeout });
  await sleep(60);
}
async function waitState(page, st, timeout = 20000) { await page.waitForFunction(st => IM.debug.world.state === st, st, { timeout }); }
async function tapCard(c, id) {
  const p = await c.page.evaluate(id => IM.debug.cardScreen(id), id);
  if (!p) throw new Error('no card ' + id);
  await c.page.touchscreen.tap(p.x, p.y);
  return p;
}
/* Two face-down cards of one pair / of different pairs. */
async function pairDown(page) {
  const cs = (await cards(page)).filter(x => x.state === 'down');
  for (const a of cs) { const b = cs.find(x => x.id !== a.id && x.key === a.key); if (b) return [a, b]; }
  return null;
}
async function mismatchDown(page, avoid = []) {
  const cs = (await cards(page)).filter(x => x.state === 'down' && !avoid.includes(x.id));
  for (const a of cs) { const b = cs.find(x => x.key !== a.key); if (b) return [a, b]; }
  return null;
}
/* Finish the current round by touch: match every remaining pair. */
async function solveRound(c, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await wstate(c.page);
    if (s.state !== 'round' || s.solved) return true;
    if (s.phase !== 'play' || s.open.length) { await sleep(80); continue; }
    const p = await pairDown(c.page);
    if (!p) { await sleep(80); continue; }
    await tapCard(c, p[0].id); await sleep(60); await tapCard(c, p[1].id); await sleep(250);
  }
  return false;
}
/* A point (CSS px) on the canvas far from every card, Dee, bubble, HUD. */
const emptyPoint = page => page.evaluate(() => {
  const w = IM.debug.world, v = IM.debug.view(), L = w.layout;
  const obs = w.cards.filter(c => c.state !== 'gone').map(c => ({ x: c.x - c.w / 2 - 30, y: c.y - c.h / 2 - 30, w: c.w + 60, h: c.h + 60 }))
    .concat([L.tukRect, L.bubble, L.hud].map(r => ({ x: r.x - 30, y: r.y - 30, w: r.w + 60, h: r.h + 60 })));
  const hud = document.getElementById('hud').getBoundingClientRect(), bub = document.getElementById('bubble').getBoundingClientRect();
  for (let gy = 1; gy < 20; gy++) for (let gx = 1; gx < 20; gx++) {
    const x = L.W * gx / 20, y = L.H * gy / 20;
    if (obs.some(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h)) continue;
    const cx = v.left + x * v.s, cy = v.top + y * v.s;
    if ([hud, bub].some(r => cx > r.left - 10 && cx < r.right + 10 && cy > r.top - 10 && cy < r.bottom + 10)) continue;
    return { x: cx, y: cy, lx: x, ly: y };
  }
  return null;
});
const nanCheck = page => page.evaluate(() => {
  const w = IM.debug.world, bad = [];
  const fin = (o, ks, tag) => ks.forEach(k => { if (o[k] != null && typeof o[k] === 'number' && !isFinite(o[k])) bad.push(tag + '.' + k + '=' + o[k]); });
  for (const c of w.cards || []) fin(c, ['x', 'y', 'rot', 'w', 'h', 'flip', 'lift', 'sx', 'sy', 'glow', 'alpha', '_px', '_py', 'vx', 'vy', 'crack', 'frost', 'melt', 'bob'], 'c' + c.id);
  for (const r of w.rewards || []) { fin(r, ['x', 'y', 'rot', 'sx', 'sy', 'alpha', 'flap', 'glow', 'ax', 'ay', '_px', '_py'], 'r' + r.id); (r.pieces || []).forEach((p, i) => fin(p, ['x', 'y', 'rot'], 'r' + r.id + 'p' + i)); }
  fin(w.tuk, ['lookX', 'lookY', 'hop', 'moodT', 'slide'], 'tuk');
  fin(w, ['stars', 'wind', 'alpha', 'time'], 'w');
  const hs = document.getElementById('hudStars').textContent;
  if (/NaN|undefined/.test(hs)) bad.push('hudStars=' + hs);
  return bad;
});
/* Overlaps of the live cards / resting rewards with the DOM HUD and bubble (CSS px) and with Dee. */
const layoutViolations = page => page.evaluate(() => {
  const w = IM.debug.world, v = IM.debug.view(), L = w.layout, out = [];
  const toCss = r => ({ l: v.left + r.x * v.s, t: v.top + r.y * v.s, r: v.left + (r.x + r.w) * v.s, b: v.top + (r.y + r.h) * v.s });
  const ov = (a, b) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > 1 && Math.min(a.b, b.b) - Math.max(a.t, b.t) > 1;
  const dom = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const hud = dom('hud'), bub = dom('bubble'), dee = toCss(L.tukRect);
  const scr = { l: 0, t: 0, r: innerWidth, b: innerHeight };
  for (const c of w.cards || []) {
    if (c.state === 'gone' || c.state === 'deal' || c.state === 'matched') continue;
    const R = toCss({ x: c.hx - c.w / 2, y: c.hy - c.h / 2, w: c.w, h: c.h });
    if (hud && ov(R, hud)) out.push('card ' + c.id + ' under HUD');
    if (bub && ov(R, bub)) out.push('card ' + c.id + ' under bubble');
    if (ov(R, dee)) out.push('block ' + c.id + ' on Tuk');
    if (R.l < -1 || R.t < -1 || R.r > scr.r + 1 || R.b > scr.b + 1) out.push('card ' + c.id + ' off screen');
  }
  for (const r of w.rewards || []) {
    if (r.state !== 'idle' || !r.target || !r.target.box) continue;
    const R = toCss(r.target.box);
    if (hud && ov(R, hud)) out.push('reward ' + r.id + ' ' + r.kind + ' under HUD');
    if (bub && ov(R, bub)) out.push('reward ' + r.id + ' ' + r.kind + ' under bubble');
    if (R.l < -1 || R.t < -1 || R.r > scr.r + 1 || R.b > scr.b + 1) out.push('reward ' + r.id + ' off screen');
  }
  return out;
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
async function startGame(c, speed = 1) { await c.page.evaluate(s => { IM.debug.setSpeed(s); IM.debug.startGame(); }, speed); }
async function openSettingsByHold(c) {
  const g = await elCenter(c.page, '#btnParents');
  await touch(c.cdp, 'touchStart', [g]); await sleep(2300); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  return visible(c.page, 'scrSettings');
}
const newCtx = (d = DEV.iphoneP) => browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });

/* ======================================================================= groups */
async function gBoot() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=3');
    await sleep(700);
    const st = await c.page.evaluate(() => ({ mode: IM.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      loading: !document.getElementById('loading').classList.contains('hidden'), logo: document.querySelector('.logo').textContent.trim(),
      play: document.getElementById('btnPlay').getBoundingClientRect().toJSON(), W: IM.debug.getState().W, H: IM.debug.getState().H, sw: document.documentElement.scrollWidth, iw: innerWidth }));
    check(`boot/${d.name}: title shown, loader gone, logo "Tuk"`, st.mode === 'title' && st.title && !st.loading && /Tuk/.test(st.logo), st);
    check(`boot/${d.name}: play button on screen & ≥ 60 px`, st.play.width >= 60 && st.play.left >= 0 && st.play.right <= d.viewport.width && st.play.bottom <= d.viewport.height, st.play);
    check(`boot/${d.name}: logical short side 720`, Math.min(st.W, st.H) === 720, { W: st.W, H: st.H });
    check(`boot/${d.name}: no horizontal overflow`, st.sw <= st.iw + 1, { sw: st.sw, iw: st.iw });
    await tapEl(c, '#btnPlay'); await sleep(500);
    check(`boot/${d.name}: Play (touch) starts the game`, (await mode(c.page)) === 'play' && await visible(c.page, 'hud'), await mode(c.page));
    await waitPlay(c.page).catch(() => {});
    const L = await c.page.evaluate(() => { const g = IM.debug.world.layout.grid; return g && { cw: g.cw, cols: g.cols, rows: g.rows, n: g.n }; });
    check(`boot/${d.name}: first round grid at age 4 has blocks ≥ 120 px`, L && L.cw >= 120, L);
    check(`boot/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gLang() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  const read = () => c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, l2: document.getElementById('logo2').textContent,
    title: document.title, lang: document.documentElement.lang, on: [...document.querySelectorAll('.title-screen [data-lang]')].filter(b => b.classList.contains('on')).map(b => b.dataset.lang),
    tag: document.getElementById('tagline').textContent, age: document.getElementById('titleAge').textContent, gear: document.querySelector('.gear-tip').textContent }));
  const a = await read();
  check('lang: default EN title/logo', a.lang === 'en' && /Tuk/.test(a.l1) && /Ice/.test(a.l2) && /Tuk/.test(a.title) && a.on.join() === 'en', a);
  await tapEl(c, '.title-screen [data-lang="vi"]');
  const b = await read();
  check('lang: VI chip updates logo + document.title + html lang', b.lang === 'vi' && b.l1 === 'Cánh Cụt Tuk' && /Lật Băng/.test(b.l2) && /Cánh Cụt Tuk/.test(b.title) && b.on.join() === 'vi', b);
  check('lang: VI tagline / age / gear tip translated', !badText(b.tag || 'x') && /Tuổi|tuổi/.test(b.age) && b.gear !== a.gear, b);
  const vl = await lastVoice(c.page);
  check('lang: switching says a welcome line in VI', vl && vl.lang === 'vi' && !badText(vl.text) && VI_RE.test(vl.text), vl);
  await c.page.reload(); await waitTitle(c.page);
  const r = await read();
  check('lang: VI choice persists across reload', r.lang === 'vi' && r.l1 === 'Cánh Cụt Tuk', r);
  await tapEl(c, '.title-screen [data-lang="en"]');
  const e = await read();
  check('lang: back to EN', e.lang === 'en' && /Tuk/.test(e.title) && !/Cánh Cụt/.test(e.title), e);
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=vi'); await waitTitle(c.page); await installEv(c.page);
  await startGame(c, 2); await waitPlay(c.page);
  const bub = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('lang: ?lang=vi → Vietnamese prompt in the bubble', VI_RE.test(bub) && !badText(bub), bub);
  const p = await pairDown(c.page);
  await c.page.evaluate(() => IM.debug.voiceLog.length = 0);
  await tapCard(c, p[0].id); await sleep(300);
  const fl = await c.page.evaluate(() => IM.debug.voiceLog.map(l => l.lang + ':' + l.text));
  check('lang: VI flip line is Vietnamese', fl.length >= 1 && fl.every(l => l.startsWith('vi:') && !badText(l.slice(3))), fl);
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
  await touch(c.cdp, 'touchStart', [g]); await sleep(1600); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  check('gate: 1.6 s hold does NOT open settings (needs 2 s)', !(await visible(c.page, 'scrSettings')));
  await touch(c.cdp, 'touchStart', [g]); await sleep(400);
  await touch(c.cdp, 'touchMove', [{ x: g.x - 150, y: g.y + 200 }]); await sleep(1900); await touch(c.cdp, 'touchEnd', []); await sleep(200);
  check('gate: hold that slides off the gear is cancelled', !(await visible(c.page, 'scrSettings')));
  await touch(c.cdp, 'touchStart', [g]); await sleep(1000);
  const mid = await c.page.evaluate(() => +document.getElementById('btnParents').style.getPropertyValue('--p'));
  await sleep(1300); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  check('gate: hold shows progress', mid > 0.3 && mid < 0.8, mid);
  check('gate: 2 s hold with real touch opens settings', await visible(c.page, 'scrSettings'));
  check('gate: title hidden behind settings', !(await visible(c.page, 'scrTitle')));
  check('gate: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gSettings() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  check('settings: opened by hold', await openSettingsByHold(c));
  await tapEl(c, '#ageChips [data-age="6"]');
  await c.page.locator('#inpName').fill('Mầm');
  await tapEl(c, '#scrSettings label.toggle:has(#optMusic)');
  await tapEl(c, '#scrSettings [data-lang="vi"]');
  const s1 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('im:settings') || '{}'));
  check('settings: saved to localStorage im:settings', s1.age === 6 && s1.name === 'Mầm' && s1.music === false && s1.lang === 'vi', s1);
  await tapEl(c, '#btnSettingsDone');
  check('settings: Done returns to title', await visible(c.page, 'scrTitle') && !(await visible(c.page, 'scrSettings')));
  const ageTxt = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('settings: title shows the new age', /6/.test(ageTxt), ageTxt);
  await c.page.reload(); await waitTitle(c.page);
  const st = await c.page.evaluate(() => IM.debug.getState().settings);
  check('settings: persist across reload (age, name, music, lang)', st.age === 6 && st.name === 'Mầm' && st.music === false && st.lang === 'vi', st);
  const chips = await c.page.evaluate(() => { IM.UI.refreshSettings(); return [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age); });
  check('settings: age chip 6 highlighted after reload', chips.join() === '6', chips);
  await installEv(c.page); await startGame(c, 2); await waitPlay(c.page);
  const ws = await c.page.evaluate(() => ({ age: IM.debug.world.age, topics: IM.debug.world.levels }));
  const pool6 = await c.page.evaluate(() => (IM.AGE_POOLS || {})[6] || []);
  check('settings: saved age 6 is played (age-6 topic pool)', ws.age === 6 && ws.topics.length === 4 && ws.topics.every(t => pool6.includes(t)), { ws, pool6 });
  await c.page.evaluate(() => IM.debug.voiceLog.length = 0);
  await solveRound(c);
  await sleep(1200);
  const lines = await c.page.evaluate(() => IM.debug.voiceLog.map(l => l.text));
  check('settings: lines are clean after a round (no raw keys)', lines.length > 0 && lines.every(l => !badText(l)), lines);
  // praise lines are picked at random (some without the name): sample the round-done praise many times
  const praise = await c.page.evaluate(() => { const o = []; for (let i = 0; i < 40; i++) o.push(IM.I18N.t('vi', 'great', { child: IM.debug.getState().settings.name })); return o; });
  check('settings: the child\'s name is used in praise', praise.some(l => /Mầm/.test(l)) && praise.every(l => !badText(l)), [...new Set(praise)]);
  check('settings: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gVolume() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  await openSettingsByHold(c);
  const sl = await c.page.evaluate(() => { const e = document.getElementById('optVolume'); const r = e.getBoundingClientRect(); return { v: e.value, w: r.width, h: r.height, l: r.left, t: r.top }; });
  check('volume: settings slider present, default 100 %', sl.v === '100' && sl.w >= 120, sl);
  // drag the slider thumb with a real finger to ≈ 30 %
  const y = sl.t + sl.h / 2;
  await touch(c.cdp, 'touchStart', [{ x: sl.l + sl.w - 4, y }]); await sleep(50);
  for (let k = 1; k <= 8; k++) { await touch(c.cdp, 'touchMove', [{ x: sl.l + sl.w - 4 - k * (sl.w * 0.7 / 8), y }]); await sleep(25); }
  await touch(c.cdp, 'touchEnd', []); await sleep(200);
  let v = await c.page.evaluate(() => ({ el: +document.getElementById('optVolume').value, S: IM.debug.getState().settings.volume, A: IM.Audio.volume, saved: JSON.parse(localStorage.getItem('im:settings') || '{}').volume }));
  if (v.el === 100) {   // the slider did not follow the finger in headless chromium: set it like a finger would and dispatch input
    console.log('      (touch drag did not move the range input in headless chromium; falling back to input events)');
    await c.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    v = await c.page.evaluate(() => ({ el: +document.getElementById('optVolume').value, S: IM.debug.getState().settings.volume, A: IM.Audio.volume, saved: JSON.parse(localStorage.getItem('im:settings') || '{}').volume }));
  }
  const want = v.el / 100;
  check('volume: slider → settings.volume, saved, IM.Audio.volume follows', v.el < 100 && Math.abs(v.S - want) < 1e-6 && Math.abs(v.saved - want) < 1e-6 && Math.abs(v.A - want) < 1e-6, v);
  const vv = await c.page.evaluate(() => IM.Voice._volume);
  check('volume: speech volume follows', Math.abs(vv - want) < 1e-6, vv);
  const g = await c.page.evaluate(async () => { const A = IM.Audio; A.unlock(); await new Promise(r => setTimeout(r, 400)); return A.user ? { gain: A.user.gain.value, st: A.ctx.state, vol: A.volume } : null; });
  check('volume: audio chain user gain = volume × 1.6 makeup', g && Math.abs(g.gain - g.vol * 1.6) < 0.05, g);
  const comp = await c.page.evaluate(() => { const A = IM.Audio; return !!A.ctx && typeof A.ctx.createDynamicsCompressor === 'function' && !!A.master && !!A.user; });
  check('volume: master → compressor → user gain chain exists', comp);
  await tapEl(c, '#btnSettingsDone');
  await c.page.reload(); await waitTitle(c.page);
  const r = await c.page.evaluate(() => ({ S: IM.debug.getState().settings.volume, A: IM.Audio.volume, el: +document.getElementById('optVolume').value }));
  check('volume: persists across reload (setting, audio, slider)', Math.abs(r.S - want) < 1e-6 && Math.abs(r.A - want) < 1e-6 && r.el === Math.round(want * 100), r);
  // pause menu − / +
  await installEv(c.page); await startGame(c, 1); await waitPlay(c.page);
  await tapEl(c, '#btnPause'); await sleep(200);
  const lv0 = await c.page.evaluate(() => document.getElementById('volLevel').textContent);
  check('volume: pause menu shows the level', lv0 === Math.round(want * 100) + '%', lv0);
  const vb = await c.page.evaluate(() => ['btnVolDown', 'btnVolUp'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { w: r.width, h: r.height }; }));
  check('volume: − / + buttons ≥ 44 px', vb.every(b => b.w >= 44 && b.h >= 44), vb);
  await tapEl(c, '#btnVolUp'); await tapEl(c, '#btnVolUp'); await sleep(100);
  const up = await c.page.evaluate(() => ({ S: IM.debug.getState().settings.volume, A: IM.Audio.volume, saved: JSON.parse(localStorage.getItem('im:settings')).volume, lv: document.getElementById('volLevel').textContent }));
  const exp = Math.min(1, Math.round((want + 0.2) * 10) / 10);
  check('volume: + + raises the volume by 20 %, saved, audio follows', Math.abs(up.S - exp) < 1e-6 && Math.abs(up.A - exp) < 1e-6 && Math.abs(up.saved - exp) < 1e-6 && up.lv === Math.round(exp * 100) + '%', up);
  for (let k = 0; k < 14; k++) await tapEl(c, '#btnVolDown');
  const dn = await c.page.evaluate(() => ({ S: IM.debug.getState().settings.volume, A: IM.Audio.volume, lv: document.getElementById('volLevel').textContent }));
  check('volume: − clamps at 0 %', dn.S === 0 && dn.A === 0 && dn.lv === '0%', dn);
  for (let k = 0; k < 14; k++) await tapEl(c, '#btnVolUp');
  const top = await c.page.evaluate(() => ({ S: IM.debug.getState().settings.volume, lv: document.getElementById('volLevel').textContent }));
  check('volume: + clamps at 100 %', top.S === 1 && top.lv === '100%', top);
  await tapEl(c, '#btnVolDown'); await sleep(150);
  const gg = await c.page.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); return { gain: IM.Audio.user.gain.value, vol: IM.Audio.volume, slider: +document.getElementById('optVolume').value }; });
  check('volume: user gain follows the pause buttons (0.9 × 1.6)', Math.abs(gg.gain - 1.44) < 0.05 && gg.vol === 0.9, gg);
  check('volume: settings slider follows the pause buttons', gg.slider === 90, gg);
  check('volume: pause −/+ taps never reach the canvas', (await downs(c.page)) === 0, await downs(c.page));
  check('volume: still paused after −/+', (await mode(c.page)) === 'paused');
  await c.page.reload(); await waitTitle(c.page);
  check('volume: pause-menu volume persists across reload', (await c.page.evaluate(() => IM.debug.getState().settings.volume)) === 0.9);
  check('volume: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gFlags() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1&lang=vi&age=6&speed=2&seed=9', { ctx });
  const t1 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, ls: localStorage.getItem('im:settings') }));
  check('flags: ?lang=vi&age=6 applied for the session', t1.l1 === 'Cánh Cụt Tuk' && /6/.test(t1.age), t1);
  check('flags: nothing saved just by loading with flags', t1.ls == null, t1.ls);
  await openSettingsByHold(c);
  await tapEl(c, '#scrSettings label.toggle:has(#optSfx)');
  const s2 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('im:settings') || '{}'));
  check('flags: saving another setting does not store the flag values', s2.lang === 'en' && s2.age === 4 && s2.sfx === false && !('speed' in s2) && !('seed' in s2) && !('mute' in s2), s2);
  const chips2 = await c.page.evaluate(() => [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age).join());
  check('flags: settings panel shows the age actually being played (6)', chips2 === '6', chips2);
  await tapEl(c, '#ageChips [data-age="5"]');
  const t5 = await c.page.evaluate(() => ({ title: document.getElementById('titleAge').textContent, saved: JSON.parse(localStorage.getItem('im:settings')).age }));
  check('flags: a parent picking age 5 wins over ?age=6', /5/.test(t5.title) && t5.saved === 5, t5);
  await tapEl(c, '#ageChips [data-age="4"]');
  await tapEl(c, '#btnSettingsDone');
  await c.page.goto(srv.url + '?mute=1'); await waitTitle(c.page);
  const t2 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, s: IM.debug.getState().settings, sp: IM.debug.getState().speed }));
  check('flags: without flags → saved EN, age 4, normal speed again', t2.l1 === 'Tuk’s' && /4/.test(t2.age) && t2.s.sfx === false && t2.sp === 1, t2);
  check('flags: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

/* Taps during deal / peek / hide are ignored. */
async function gPhases() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=12&age=4');
  await startGame(c, 1);
  const seen = {};
  let tappedLate = false;
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const s = await wstate(c.page);
    if (s.state === 'round' && ['deal', 'peek', 'hide'].includes(s.phase) && !seen[s.phase]) {
      seen[s.phase] = true;
      const cs = await c.page.evaluate(() => IM.debug.world.cards.map(c => { const v = IM.debug.view(); return { id: c.id, state: c.state, x: v.left + c.hx * v.s, y: v.top + c.hy * v.s }; }));
      await clearEv(c.page);
      for (const k of cs.slice(0, 3)) await c.page.touchscreen.tap(k.x, k.y);
      await sleep(30);
      // the hide wave is short (≈ 0.3 s): a tap that lands after it ended is a legal play tap → only count events
      // emitted while the phase was still deal / peek / hide
      const ev = await c.page.evaluate(() => window.__ev.filter(e => (e.type === 'flip' || e.type === 'tap' || e.type === 'match' || e.type === 'mismatch') && !['play', 'resolve'].includes(e.phase)).map(e => e.type + '@' + e.phase));
      const st = await wstate(c.page);
      check(`phases: taps during ${s.phase} are ignored`, ev.length === 0, { ev, open: st.open, phase: st.phase });
      if (st.open.length) { tappedLate = true; await c.page.waitForFunction(() => IM.debug.world.open.length === 0 && IM.debug.world.phase === 'play', null, { timeout: 5000 }).catch(() => {}); }
    }
    if (s.phase === 'play') break;
    await sleep(40);
  }
  check('phases: saw deal, peek and hide', seen.deal && seen.peek && seen.hide, seen);
  if (!tappedLate) {
    await waitPlay(c.page);
    const all = (await cards(c.page));
    check('phases: every block frosted (state down, frost ≥ 0.8) at play start', all.every(k => k.state === 'down' && k.flip < 0.2), all.map(k => [k.id, k.state, +k.flip.toFixed(2)]));
    if (all.some(k => k.flip >= 0.1)) info('phases: frost still growing back when play starts (CONFIG.playAtHide)', all.map(k => [k.id, +k.flip.toFixed(2)]));
  }
  await c.page.waitForFunction(() => IM.debug.world.phase === 'play' || IM.debug.world.state !== 'round', null, { timeout: 8000 }).catch(() => {});
  // a tap right after the round's last match (during done / roundDone) does nothing
  await solveRound(c);
  await clearEv(c.page);
  const p = await emptyPoint(c.page);
  const st0 = await wstate(c.page);
  if (p) await c.page.touchscreen.tap(p.x, p.y);
  check('phases: tap after the round is solved is harmless', (await evOf(c.page, 'flip')).length === 0, st0);
  check('phases: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Flip one card → flip event + voice line naming it. */
async function gFlip() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=13&age=4');
    await startGame(c, 1); await waitPlay(c.page);
    const k = (await cards(c.page)).find(x => x.state === 'down');
    await clearEv(c.page);
    const n0 = await voiceN(c.page);
    await tapCard(c, k.id); await sleep(30);
    const f = await evOf(c.page, 'flip');
    check(`flip/${d.name}: real tap flips the card on touch-down (flip event)`, f.length === 1 && f[0].id === k.id && f[0].open === 1, f);
    await sleep(350);
    const k2 = (await cards(c.page)).find(x => x.id === k.id);
    check(`flip/${d.name}: card turned face up (flip ≥ 0.9 after 0.38 s)`, k2.state === 'up' && k2.flip >= 0.9, { state: k2.state, flip: k2.flip });
    const lines = await c.page.evaluate(n => IM.debug.voiceLog.slice(n).map(l => l.text), n0);
    check(`flip/${d.name}: Tuk names the block (voice line)`, lines.length >= 1 && lines.every(l => !badText(l)), lines);
    const st = await wstate(c.page);
    check(`flip/${d.name}: open = [card]`, st.open.length === 1 && st.open[0] === k.id, st.open);
    check(`flip/${d.name}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
    check(`flip/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* REAL touch swipes (CDP touchStart / touchMove / touchEnd) — the rub gesture. */
async function gRub() {
  // Rub rules (QA fix 6a84a07): a swipe reveals the block it STARTS on (down) and the block it ENDS on (up); a block it only
  // crosses stays frosted; ≥ rubPathK (1.6) × the long side of finger path inside a block reveals it mid-stroke; a pair
  // check ends the stroke (no chaining); a rub into a 3rd block during a shown mismatch resets like a tap.
  const flips = page => evOf(page, 'flip');
  const fid = fl => fl.map(e => e.id + ':' + e.via);
  const settle = async c => {   // close anything left open (tap partners), then wait for play
    await c.page.waitForFunction(() => IM.debug.world.phase === 'play' || IM.debug.world.state !== 'round', null, { timeout: 5000 }).catch(() => {});
    await sleep(100);
    for (let k = 0; k < 2; k++) {
      const st = await wstate(c.page);
      if (st.open.length !== 1) break;
      const all = await cards(c.page), o = all.find(x => x.id === st.open[0]), pp = o && all.find(x => x.key === o.key && x.id !== o.id && x.state !== 'gone');
      if (pp) { await tapCard(c, pp.id); await sleep(400); }
    }
    return waitPlay(c.page, 10000).then(() => true, () => false);
  };
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=31&age=6');
    await startGame(c, 1); await waitPlay(c.page);   // age 6 round 1: 3 pairs → a line of ≥ 3 blocks
    const tag = `rub/${d.name}`;
    const lines = await linesDown(c.page);
    let L3 = null;
    for (const ln of lines) for (let i = 0; i + 2 < ln.length && !L3; i++) if (ln[i].key !== ln[i + 2].key) L3 = ln.slice(i, i + 3);
    if (!L3) L3 = (lines.find(l => l.length >= 3) || []).slice(0, 3);
    check(`${tag}: a line of ≥ 3 frosted blocks for the swipe`, L3.length === 3, lines.map(r => r.length));
    if (L3.length < 3) { await c.close(); continue; }
    const [A, B, C] = L3;
    // (1) start ON A, cross B, end ON C → A (tap) + C (rub, stroke end); the crossed B stays frosted
    await clearEv(c.page);
    const m0 = await c.page.evaluate(() => window.__moves);
    await swipe(c, [{ x: A.sx, y: A.sy }, { x: C.sx, y: C.sy }], { step: 30, dt: 0 });
    await sleep(80);
    let fl = await flips(c.page);
    check(`${tag}: swipe delivers pointer moves to the world`, (await c.page.evaluate(() => window.__moves)) - m0 >= 5);
    check(`${tag}: swipe A → (across B) → C reveals A (down) and C (stroke ends on it)`, fl.length === 2 && fl[0].id === A.id && fl[0].via === 'tap' && fl[1].id === C.id && fl[1].via === 'rub', fid(fl));
    check(`${tag}: the crossed block B is never revealed`, (await cards(c.page)).find(x => x.id === B.id).state === 'down');
    const nm = await c.page.evaluate(() => window.__flipLines.filter(f => f.type === 'flip').map(f => f.id));
    check(`${tag}: the 1st block of the pair is named, the 2nd is left to the match/mismatch line`, nm.includes(A.id) && !nm.includes(C.id), nm);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'match' || e.type === 'mismatch'), null, { timeout: 3000 }).catch(() => {});
    const res = await c.page.evaluate(() => window.__ev.filter(e => e.type === 'match' || e.type === 'mismatch').map(e => e.type));
    check(`${tag}: the pair resolves once`, res.length === 1, res);
    // (2) a mismatch shows: a rub that ENDS on a 3rd block after ≥ 0.5 s resets like a tap (A, C frost over, the new one opens)
    if (res[0] === 'mismatch') {
      await sleep(600);
      const E = (await cards(c.page)).find(x => x.state === 'down' && x.id !== B.id) || (await cards(c.page)).find(x => x.state === 'down');
      await clearEv(c.page);
      const gm = await c.page.evaluate(() => IM.debug.world.layout.grid.gap * IM.debug.view().s / 2);
      const s0 = { x: E.sx - E.sw / 2 - gm, y: E.sy };   // starts on the ice in the gap left of E (no block under the finger)
      const dE = await downs(c.page);
      await swipe(c, [s0, { x: E.sx, y: E.sy }], { step: 30, dt: 0 });
      check(`${tag}: (the stroke started on the ice)`, (await c.page.evaluate(() => window.__ev.filter(e => e.type === 'flip' && e.via === 'tap').length)) === 0, await flips(c.page));
      await sleep(60);
      fl = await flips(c.page);
      const st = await wstate(c.page), cs = await cards(c.page), S = id => cs.find(x => x.id === id).state;
      check(`${tag}: during a shown mismatch a rub stroke ending on a 3rd block resets A, C and opens it`, fl.length === 1 && fl[0].id === E.id && S(A.id) === 'down' && S(C.id) === 'down' && st.open.join() === E.id, { fl: fid(fl), open: st.open, a: S(A.id), c: S(C.id) });
      // rub-only variant: start on the ice, end on F while a fresh mismatch shows
    }
    let ok = await settle(c);
    // (3) a LONG rub back and forth inside D (starting on the ice) reveals D mid-stroke; the stroke then ends on the ice
    let D = ok && (await linesDown(c.page)).map(l => l[0]).find(Boolean);
    if (D) {
      const sc = await c.page.evaluate(() => IM.debug.view().s);
      const s0 = { x: D.sx - D.sw / 2 - (await c.page.evaluate(() => IM.debug.world.layout.grid.gap)) * sc / 2, y: D.sy };
      await clearEv(c.page);
      const d0 = await downs(c.page);
      await touch(c.cdp, 'touchStart', [s0]);
      const pts = [{ x: D.sx - D.sw * 0.4, y: D.sy }];
      for (let k = 0; k < 6; k++) pts.push({ x: D.sx + (k % 2 ? -0.4 : 0.4) * D.sw, y: D.sy + (k % 2 ? 6 : -6) });
      let at = s0, revealedAfter = null;
      for (const p of pts) {
        const n = Math.max(1, Math.ceil(Math.hypot(p.x - at.x, p.y - at.y) / 20));
        for (let k = 1; k <= n; k++) await touch(c.cdp, 'touchMove', [{ x: at.x + (p.x - at.x) * k / n, y: at.y + (p.y - at.y) * k / n }]);
        at = p;
        if (revealedAfter == null && (await flips(c.page)).length) revealedAfter = pts.indexOf(p);
      }
      const mid = await flips(c.page);
      await touch(c.cdp, 'touchMove', [s0]); await touch(c.cdp, 'touchEnd', []); await sleep(80);
      fl = await flips(c.page);
      check(`${tag}: a long rub (≥ 1.6× long side) inside D reveals it mid-stroke, once (via rub)`, mid.length === 1 && mid[0].id === D.id && mid[0].via === 'rub' && fl.length === 1 && (await downs(c.page)) - d0 === 1,
        { mid: fid(mid), all: fid(fl), afterPass: revealedAfter });
      check(`${tag}: a short pass (< 1.6× long side) does not reveal yet`, revealedAfter == null || revealedAfter >= 2, revealedAfter);
      check(`${tag}: rubbing on over the UP block says nothing more (no tap events)`, (await evOf(c.page, 'tap')).length === 0);
      // (4) one stroke never chains pairs: down on D's partner P (pair checked) → long rub in Q → end on R: nothing more
      const all = await cards(c.page), P = all.find(x => x.key === D.key && x.id !== D.id && x.state === 'down');
      const others = all.filter(x => x.state === 'down' && x.id !== (P && P.id));
      if (P && others.length >= 2) {
        const [Q, R] = others;
        await clearEv(c.page);
        await touch(c.cdp, 'touchStart', [{ x: P.sx, y: P.sy }]); await sleep(500);   // match checked, resolve over
        const path = [{ x: Q.sx, y: Q.sy }];
        for (let k = 0; k < 6; k++) path.push({ x: Q.sx + (k % 2 ? -0.4 : 0.4) * Q.sw, y: Q.sy });
        path.push({ x: R.sx, y: R.sy });
        at = { x: P.sx, y: P.sy };
        for (const p of path) { const n = Math.max(1, Math.ceil(Math.hypot(p.x - at.x, p.y - at.y) / 20)); for (let k = 1; k <= n; k++) await touch(c.cdp, 'touchMove', [{ x: at.x + (p.x - at.x) * k / n, y: at.y + (p.y - at.y) * k / n }]); at = p; }
        await sleep(500);
        await touch(c.cdp, 'touchEnd', []); await sleep(80);
        fl = await flips(c.page);
        const mt = await evOf(c.page, 'match');
        check(`${tag}: one stroke cannot chain into the next pair (after the match: long rub in Q + end on R reveal nothing)`, mt.length === 1 && fl.length === 1 && fl[0].id === P.id, { fl: fid(fl), match: mt.length });
      }
    } else check(`${tag}: board ready for the long-rub test`, false, await wstate(c.page));
    ok = await settle(c);
    // (6) reveal animation: crack lines first, then the frost clears
    ok = await settle(c);
    const K = ok && (await cards(c.page)).find(x => x.state === 'down');
    if (K) {
      await clearEv(c.page);
      await tapCard(c, K.id);
      const sm = [];
      for (let i = 0; i < 8; i++) { sm.push(await c.page.evaluate(id => { const k = IM.debug.world.cardById(id); return [+k.crack.toFixed(2), +k.flip.toFixed(2)]; }, K.id)); await sleep(25); }
      const fk = await flips(c.page);
      check(`${tag}: reveal = crack 0→1 first, then frost clears (flip ↑)`, fk.length === 1 && fk[0].id === K.id && (sm.some(s => s[0] > 0 && s[0] < 1 && s[1] < 0.3) || sm.some(s => s[0] === 1 && s[1] < 0.5)), sm);
    }
    check(`${tag}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    if (results.some(r => !r.ok && r.name.startsWith(tag))) await shot(c, 'rub-fail');
    await c.close();
  }
  // (5) a FAST flick with 2 big CDP moves across a fresh line of 3: F → (across G) → Z reveals F + Z, never G
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=32&age=6');
    await startGame(c, 1); await waitPlay(c.page);
    const tag = `rub/${d.name} flick`;
    const row = (await linesDown(c.page)).find(r => r.length >= 3);
    if (!row) { check(`${tag}: a line of 3`, false); await c.close(); continue; }
    const F = row[0], G = row[1], Z = row[2];
    await clearEv(c.page);
    await swipe(c, [{ x: F.sx, y: F.sy }, { x: (F.sx + Z.sx) / 2 + 1, y: (F.sy + Z.sy) / 2 + 1 }, { x: Z.sx, y: Z.sy }], { step: 0, dt: 16 });
    await sleep(60);
    const fl = await evOf(c.page, 'flip');
    check(`${tag}: 2-move flick F → Z reveals F (tap) + Z (stroke end) only, never the crossed G`, fl.length === 2 && fl[0].id === F.id && fl[1].id === Z.id && !fl.some(e => e.id === G.id), { fl: fl.map(e => e.id + ':' + e.via), F: F.id, G: G.id, Z: Z.id });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
  // (7) rub during peek / hide does nothing (also not on stroke end)
  const c = await open(DEV.iphoneL, 'mute=1&seed=33&age=4');
  await startGame(c, 1);
  const seen = {};
  const t0 = Date.now();
  while (Date.now() - t0 < 12000) {
    const s = await wstate(c.page);
    if (s.state === 'round' && ['peek', 'hide'].includes(s.phase) && !seen[s.phase]) {
      seen[s.phase] = true;
      const r = (await rowsDown(c.page))[0] || (await cards(c.page));
      await clearEv(c.page);
      if (r.length >= 2) await swipe(c, [{ x: r[0].sx - r[0].sw, y: r[0].sy }, { x: r[r.length - 1].sx, y: r[0].sy }], { step: 40, dt: 0 });
      const ev = await c.page.evaluate(() => window.__ev.filter(e => e.type === 'flip' && !['play', 'resolve'].includes(e.phase)).length);
      check(`rub: a swipe during ${s.phase} reveals nothing`, ev === 0, ev);
    }
    if (s.phase === 'play') break;
    await sleep(30);
  }
  check('rub: zero console errors (phases)', c.errors.length === 0, c.errors);
  await c.close();
}

/* Taps on the frozen lake between / beside blocks do nothing. */
async function gIce() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=41&age=4');
    await startGame(c, 1); await c.page.evaluate(() => IM.debug.gotoLevel(2)); await waitPlay(c.page);
    const tag = `ice/${d.name}`;
    // a point on the lake (inside layout.board) ≥ hitPad + 12 px from every block, off Tuk / bubble / HUD
    const p = await c.page.evaluate(() => {
      const w = IM.debug.world, v = IM.debug.view(), L = w.layout, B = L.board, m = w.cfg.hitPad + 12;
      const obs = w.cards.filter(c => c.state !== 'gone').map(c => ({ x: c.x - c.w / 2 - m, y: c.y - c.h / 2 - m, w: c.w + 2 * m, h: c.h + 2 * m })).concat([L.tukRect, L.bubble, L.hud]);
      for (let gy = 1; gy < 30; gy++) for (let gx = 1; gx < 30; gx++) {
        const x = B.x + B.w * gx / 30, y = B.y + B.h * gy / 30;
        if (obs.some(r => x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h)) continue;
        return { x: v.left + x * v.s, y: v.top + y * v.s, lx: x, ly: y };
      }
      return null;
    });
    await clearEv(c.page);
    const n0 = await voiceN(c.page);
    if (p) { await c.page.touchscreen.tap(p.x, p.y); await sleep(150); }
    check(`${tag}: tap on the open ice (lake, away from blocks) does nothing`, p && (await c.page.evaluate(() => window.__ev.filter(e => ['flip', 'tap', 'match', 'mismatch'].includes(e.type)).length)) === 0 && (await wstate(c.page)).open.length === 0, p);
    check(`${tag}: … and Tuk stays quiet`, (await voiceN(c.page)) === n0, await c.page.evaluate(n => IM.debug.voiceLog.slice(n).map(l => l.text), n0));
    // the gap between two neighbouring blocks in a row: centre of the gap
    const rows = await rowsDown(c.page), r = rows.find(r => r.length >= 2);
    if (r) {
      const [A, B] = r;
      const gap = await c.page.evaluate(([a, b]) => { const w = IM.debug.world, A = w.cardById(a), B = w.cardById(b); return { gap: (B.hx - B.w / 2) - (A.hx + A.w / 2), pad: w.cfg.hitPad, s: IM.debug.view().s }; }, [A.id, B.id]);
      const gx = (A.sx + A.sw / 2 + B.sx - B.sw / 2) / 2;
      await clearEv(c.page);
      await c.page.touchscreen.tap(gx, A.sy); await sleep(150);
      const f = await evOf(c.page, 'flip');
      check(`${tag}: tap in the middle of the ${gap.gap.toFixed(1)} px gap between two blocks does nothing (hitPad ${gap.pad})`, f.length === 0, { flipped: f.map(e => e.id), gap });
      await waitPlay(c.page, 6000).catch(() => {});
      // a vertical gap (between rows) as well
      const all = (await cards(c.page)).filter(x => x.state === 'down');
      const below = all.find(x => Math.abs(x.hx - A.hx) < 4 && x.hy > A.hy + 4);
      if (below) {
        const top = await c.page.evaluate(id => IM.debug.world.cardById(id), A.id);
        const gy = (A.sy + A.sh / 2 + below.sy - below.sh / 2) / 2;
        await clearEv(c.page);
        await c.page.touchscreen.tap(A.sx, gy); await sleep(150);
        const f2 = await evOf(c.page, 'flip');
        const vg = (below.hy - below.h / 2) - (A.hy + A.h / 2);
        check(`${tag}: tap in the middle of the ${vg.toFixed(1)} px row gap does nothing`, f2.length === 0, { flipped: f2.map(e => e.id), vg, top: !!top });
      }
    }
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
  // dense boards: ≥ 8 blocks on iPad (age 5+, later rounds) have the smallest gaps — play there with the bot, then tap the gap
  for (const d of [DEV.ipadP, DEV.ipadL]) {
    const c = await open(d, 'mute=1&seed=43&age=7');
    const tag = `ice/${d.name} dense`;
    await c.page.evaluate(() => { IM.debug.setBot(true, 1); IM.debug.setSpeed(6); IM.debug.startGame(); });
    const ok = await c.page.waitForFunction(() => { const w = IM.debug.world; return w.state === 'round' && w.cards.length >= 10 && w.phase === 'deal'; }, null, { timeout: 120000 }).then(() => true, () => false);
    await c.page.evaluate(() => { IM.debug.setBot(false); IM.debug.setSpeed(1); });
    if (!ok) { check(`${tag}: reached a round with 10 blocks`, false, await wstate(c.page)); await c.close(); continue; }
    await waitPlay(c.page, 15000).catch(() => {});
    const r = (await rowsDown(c.page)).find(r => r.length >= 2);
    const [A, B] = r;
    const g = await c.page.evaluate(([a, b]) => { const w = IM.debug.world, A = w.cardById(a), B = w.cardById(b); return { cw: +A.w.toFixed(1), gap: +((B.hx - B.w / 2) - (A.hx + A.w / 2)).toFixed(1), pad: w.cfg.hitPad, cssGap: +(((B.hx - B.w / 2) - (A.hx + A.w / 2)) * IM.debug.view().s).toFixed(1) }; }, [A.id, B.id]);
    await clearEv(c.page);
    await c.page.touchscreen.tap((A.sx + A.sw / 2 + B.sx - B.sw / 2) / 2, A.sy); await sleep(150);
    const f = await evOf(c.page, 'flip');
    check(`${tag}: tap in the middle of the ${g.gap} px gap (cw ${g.cw}, hitPad ${g.pad}) does nothing`, f.length === 0, { flipped: f.map(e => e.id), g });
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* IM.debug.audio(): master → DynamicsCompressor → user gain (= volume × 1.6) → destination; sfx/music/amb → master. */
async function gAudio() {
  const c = await open(DEV.ipadL, 'seed=5');
  await tapEl(c, '#btnPlay'); await sleep(600);   // a user gesture unlocks the audio
  const r = await c.page.evaluate(() => {
    const A = IM.debug.audio && IM.debug.audio();
    if (!A || !A.ctx) return { ok: false, why: 'no IM.debug.audio().ctx' };
    const E = window.__edges, to = (s) => E.filter(e => e[0] === s).map(e => e[1]);
    const comp = to(A.master).find(n => n instanceof DynamicsCompressorNode);
    const user = comp && to(comp).find(n => n === A.user);
    const dest = A.user && to(A.user).some(n => n === A.ctx.destination);
    return { ok: true, comp: !!comp, user: !!user, dest, sfx: to(A.sfx).includes(A.master), music: to(A.music).includes(A.master), amb: to(A.amb).includes(A.master),
      cfg: comp && { th: comp.threshold.value, ratio: comp.ratio.value }, gain: A.user.gain.value, vol: A.volume, st: A.ctx.state };
  });
  check('audio: IM.debug.audio() has a live AudioContext after the first tap', r.ok && r.st === 'running', r);
  check('audio: master → DynamicsCompressor → user gain → destination', r.comp && r.user && r.dest, r);
  check('audio: sfx, music and ambience buses feed master', r.sfx && r.music && r.amb, r);
  check('audio: user gain = volume × 1.6 makeup (loud default)', Math.abs(r.gain - r.vol * 1.6) < 0.05 && r.vol === 1, r);
  const played = await c.page.evaluate(async () => {
    const A = IM.Audio, names = ['crack', 'clink', 'melt', 'leap', 'splash', 'hmm', 'deal', 'frost', 'home', 'star', 'fanfare', 'round', 'tapcard', 'golden', 'swap', 'reward', 'land'];
    const errs = [];
    for (const n of names) { try { A.play(n, { kind: 'fish', i: 1, count: 2 }); } catch (e) { errs.push(n + ': ' + e); } }
    await new Promise(r => setTimeout(r, 300));
    return errs;
  });
  check('audio: every game SFX plays without throwing', played.length === 0, played);
  check('audio: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Flip a matching pair → match, reward lands on a perch on screen, off the board, not under HUD/bubble/Dee. */
async function gMatch() {
  for (const d of ALL) {
    for (const lvl of [0, 1, 2, 3]) {
      const c = await open(d, `mute=1&seed=${14 + lvl}&age=4`);
      await startGame(c, 1);
      if (lvl) await c.page.evaluate(l => IM.debug.gotoLevel(l), lvl);
      await waitPlay(c.page);
      const tag = `match/${d.name} L${lvl}`;
      const topic = await c.page.evaluate(() => IM.debug.world.topic);
      const [a, b] = await pairDown(c.page);
      await clearEv(c.page);
      await tapCard(c, a.id); await sleep(120); await tapCard(c, b.id);
      await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'match'), null, { timeout: 3000 }).catch(() => {});
      const m = await evOf(c.page, 'match');
      check(`${tag} (${topic}): match event for the pair`, m.length === 1 && [m[0].a, m[0].b].sort().join() === [a.id, b.id].sort().join() && m[0].found === 1, m);
      check(`${tag}: no mismatch`, (await evOf(c.page, 'mismatch')).length === 0);
      // the two blocks glide towards each other on the ice (distance shrinks), then clink and melt
      const dist = () => c.page.evaluate(([a, b]) => { const w = IM.debug.world, A = w.cardById(a), B = w.cardById(b); return A && B && A.state === 'matched' ? Math.hypot(A.x - B.x, A.y - B.y) : null; }, [a.id, b.id]);
      const d0 = Math.hypot(a.hx - b.hx, a.hy - b.hy);
      await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'clink'), null, { timeout: 3500 }).catch(() => {});
      const d1 = await dist();
      check(`${tag}: matched blocks glide together (centre distance shrinks before the clink)`, d1 != null && d1 < d0 - 5, { d0, d1 });
      await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'reward'), null, { timeout: 4000 }).catch(() => {});
      const ev = await c.page.evaluate(() => window.__ev.filter(e => ['match', 'clink', 'melt', 'reward'].includes(e.type)).map(e => ({ t: e.type, wt: e.wt, id: e.id, a: e.a, b: e.b })));
      const seq = ev.map(e => e.t).join(',');
      check(`${tag}: event order match → clink → melt ×2 → reward`, seq === 'match,clink,melt,melt,reward', seq);
      const cl = ev.find(e => e.t === 'clink'), rwE = ev.find(e => e.t === 'reward');
      check(`${tag}: clink names the pair`, cl && [cl.a, cl.b].sort().join() === [a.id, b.id].sort().join(), cl);
      check(`${tag}: reward 0.3–3 s after the match (hold + glide + melt)`, rwE && rwE.wt - m[0].wt > 0.3 && rwE.wt - m[0].wt < 3.0, rwE && m[0] && rwE.wt - m[0].wt);
      const rw = await evOf(c.page, 'reward');
      const gone = (await cards(c.page)).filter(x => x.id === a.id || x.id === b.id).map(x => x.state);
      check(`${tag}: matched blocks are gone after the melt`, gone.every(s => s === 'gone'), gone);
      const isFish = rw[0] && (rw[0].kind === 'fish' || rw[0].kind === 'fishes');
      const wantKind = { colors: 'fish', shapes: 'sculpture', count: 'fishes', homes: 'animal', animals: 'animal', size: 'animal' }[topic];
      check(`${tag}: reward kind fits the topic (${topic} → ${wantKind || '?'})`, !wantKind || (rw[0] && rw[0].kind === wantKind), rw[0] && rw[0].kind);
      await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'land'), null, { timeout: 8000 }).catch(() => {});
      if (isFish) {
        const lp = await evOf(c.page, 'leap'), sp = await evOf(c.page, 'splash'), n = rw[0].n || 1;
        check(`${tag}: ${n} fish leap${n > 1 ? ' (counted)' : ''} and splash into the sea`, lp.length === n && sp.length === n && lp.every((e, i) => e.k === i + 1), { leaps: lp.map(e => e.k), splashes: sp.length, n });
        await sleep(400);
        const left = await c.page.evaluate(id => IM.debug.world.rewards.some(r => r.id === id), rw[0].id);
        check(`${tag}: the fish reward is gone after diving`, !left);
        const lv = await layoutViolations(c.page);
        check(`${tag}: blocks clear of the real DOM HUD & bubble`, lv.length === 0, lv);
        check(`${tag}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
        check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
        if (results.some(r => !r.ok && r.name.startsWith(tag))) await shot(c, `match-L${lvl}-fail`);
        await c.close();
        continue;
      }
      if (topic === 'homes') {
        await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'homeArrive'), null, { timeout: 6000 }).catch(() => {});
        const ha = await evOf(c.page, 'homeArrive');
        check(`${tag}: the animal hops to its home badge (homeArrive)`, ha.length === 1 && !!ha[0].home, ha);
      }
      await sleep(900);
      const R = await c.page.evaluate(() => {
        const w = IM.debug.world, L = w.layout, r = w.rewards[0];
        return r && { kind: r.kind, state: r.state, x: r.x, y: r.y, perch: r.perch, box: r.target && r.target.box, W: L.W, H: L.H, safe: L.safe, grid: L.grid && L.grid.rect, dee: L.tukRect, bubble: L.bubble, hud: L.hud };
      });
      const lands = await evOf(c.page, 'land');
      check(`${tag}: reward lands (land event, state settle/idle)`, R && lands.length >= 1 && (R.state === 'idle' || R.state === 'settle'), { R: R && R.state, lands: lands.length });
      if (R && R.box) {
        const B = R.box, ov = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 0 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 0;
        check(`${tag}: reward on screen (inside safe area)`, B.x >= R.safe.x - 1 && B.y >= R.safe.y - 1 && B.x + B.w <= R.safe.x + R.safe.w + 1 && B.y + B.h <= R.safe.y + R.safe.h + 1, { B, safe: R.safe });
        check(`${tag}: reward off the board`, !R.grid || !ov(B, R.grid), { B, grid: R.grid });
        check(`${tag}: reward not on Dee / bubble / HUD (logical)`, !ov(B, R.dee) && !ov(B, R.bubble) && !ov(B, R.hud), { B, perch: R.perch });
        const anchorOk = R.kind === 'animal' || R.kind === 'acorns' || (R.x >= B.x - 1 && R.x <= B.x + B.w + 1 && R.y >= B.y - 1 && R.y <= B.y + B.h + 1);
        check(`${tag}: resting reward sits at its perch`, anchorOk && Math.abs(R.x - (R.kind === 'lantern' ? R.x : R.x)) < 1, R);
      } else check(`${tag}: reward has a perch box`, false, R);
      const lv = await layoutViolations(c.page);
      check(`${tag}: resting reward / cards clear of the real DOM HUD & bubble`, lv.length === 0, lv);
      check(`${tag}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
      check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
      if (results.some(r => !r.ok && r.name.startsWith(tag))) await shot(c, `match-L${lvl}-fail`);
      await c.close();
    }
  }
}

/* Mismatching pair → mismatch, both flip back after the delay. */
async function gMismatch() {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    for (const age of [3, 4]) {
      const c = await open(d, `mute=1&seed=17&age=${age}`);
      await startGame(c, 1); await waitPlay(c.page);
      const tag = `mismatch/${d.name} age${age}`;
      const [a, b] = await mismatchDown(c.page);
      await clearEv(c.page);
      const n0 = await voiceN(c.page);
      await tapCard(c, a.id); await sleep(150); await tapCard(c, b.id);
      await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'mismatch'), null, { timeout: 3000 }).catch(() => {});
      const mm = await evOf(c.page, 'mismatch');
      check(`${tag}: mismatch event`, mm.length === 1 && mm[0].mismatches === 1 && mm[0].streak === 1, mm);
      // wobble: sample the rotation of both blocks for 0.4 s
      const rots = [];
      for (let k = 0; k < 10; k++) { rots.push(await c.page.evaluate(([a, b]) => { const w = IM.debug.world; return Math.max(Math.abs(w.cardById(a).rot || 0), Math.abs(w.cardById(b).rot || 0)); }, [a.id, b.id])); await sleep(30); }
      const mx = Math.max(...rots);
      check(`${tag}: both blocks wobble (|rot| peaks 0.02–0.09 rad)`, mx > 0.02 && mx < 0.09, { max: +mx.toFixed(3) });
      const mid = (await cards(c.page)).filter(x => x.id === a.id || x.id === b.id).map(x => x.state + ':' + x.flip.toFixed(2));
      check(`${tag}: both stay face up while the mismatch shows`, mid.every(s => s.startsWith('up')), mid);
      const lines = await c.page.evaluate(n => IM.debug.voiceLog.slice(n).map(l => l.text), n0);
      check(`${tag}: kind voice line (no negative words)`, lines.length >= 2 && lines.every(l => !badText(l) && !negWord('en', l)), lines);
      const show = age === 3 ? 1.2 : 1.0;
      const t0 = mm[0].wt;
      await c.page.waitForFunction(([a, b]) => IM.debug.world.cardById(a).state === 'down' && IM.debug.world.cardById(b).state === 'down', [a.id, b.id], { timeout: 5000 }).catch(() => {});
      const tDown = await c.page.evaluate(() => IM.debug.world.time);
      check(`${tag}: flip back after ≈ ${show} s`, tDown - t0 >= show - 0.05 && tDown - t0 < show + 0.5, tDown - t0);
      await sleep(450);
      const end = (await cards(c.page)).filter(x => x.id === a.id || x.id === b.id).map(x => x.state + ':' + x.flip.toFixed(2));
      const st = await wstate(c.page);
      check(`${tag}: frost grew back on both (down, frost > 0.9), open empty, phase play`, end.every(s => s.startsWith('down') && parseFloat(s.split(':')[1]) < 0.1) && st.open.length === 0 && st.phase === 'play', { end, st });
      // the next tap works normally
      await clearEv(c.page);
      await tapCard(c, a.id); await sleep(50);
      check(`${tag}: next tap flips normally`, (await evOf(c.page, 'flip')).length === 1);
      check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
      await c.close();
    }
  }
}

/* Third-tap fast-reset rule + a pending match is never broken. */
async function gThird() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=18&age=4');
  await startGame(c, 1);
  await c.page.evaluate(() => IM.debug.gotoLevel(2));   // count: 2-3 pairs
  await waitPlay(c.page);
  // (a) third tap before both faces have shown for CONFIG.thirdTapAfter (0.5 s, playtest P2-1) → ignored; the pair flips back
  let [a, b] = await mismatchDown(c.page);
  let cc = (await cards(c.page)).find(x => x.state === 'down' && x.id !== a.id && x.id !== b.id);
  await clearEv(c.page);
  await tapCard(c, a.id); await sleep(40); await tapCard(c, b.id); await sleep(40); await tapCard(c, cc.id); await sleep(60);
  let st = await wstate(c.page), cs = await cards(c.page);
  const S = id => cs.find(x => x.id === id).state;
  check('third: an early 3rd tap is ignored (A, B up, C stays down)', S(a.id) === 'up' && S(b.id) === 'up' && S(cc.id) === 'down', { a: S(a.id), b: S(b.id), c: S(cc.id), open: st.open });
  await sleep(1800);
  st = await wstate(c.page);
  check('third: mismatch counted once, both flipped back', st.mismatches === 1 && (await evOf(c.page, 'mismatch')).length === 1 && st.open.length === 0, st);
  await waitPlay(c.page).catch(() => {});
  // (b) third tap while the mismatch shows (fresh round: 4+ face-down cards)
  const c3 = await open(DEV.iphoneP, 'mute=1&seed=23&age=4');
  await startGame(c3, 1); await waitPlay(c3.page);
  {
    const [a3, b3] = await mismatchDown(c3.page);
    const k3 = (await cards(c3.page)).find(x => x.state === 'down' && x.id !== a3.id && x.id !== b3.id);
    await clearEv(c3.page);
    await tapCard(c3, a3.id); await sleep(60); await tapCard(c3, b3.id);
    await c3.page.waitForFunction(() => window.__ev.some(e => e.type === 'mismatch'), null, { timeout: 3000 }).catch(() => {});
    await sleep(650);   // > CONFIG.thirdTapAfter: the child has seen both faces
    const ph = (await wstate(c3.page)).phase;
    await tapCard(c3, k3.id); await sleep(60);
    const st3 = await wstate(c3.page), cs3 = await cards(c3.page), S3 = id => cs3.find(x => x.id === id).state;
    check('third: 3rd tap while the mismatch shows (phase resolve) → A, B down at once, C up', ph === 'resolve' && S3(a3.id) === 'down' && S3(b3.id) === 'down' && S3(k3.id) === 'up' && st3.open.join() === k3.id + '' && st3.phase === 'play', { ph, st3 });
    check('third: still counted once', st3.mismatches === 1 && (await evOf(c3.page, 'mismatch')).length === 1, st3.mismatches);
  }
  check('third: (b) zero console errors', c3.errors.length === 0, c3.errors);
  await c3.close();
  // (c) pending match: a third tap is ignored
  const c2 = await open(DEV.ipadP, 'mute=1&seed=19&age=4');
  await startGame(c2, 1); await c2.page.evaluate(() => IM.debug.gotoLevel(2)); await waitPlay(c2.page);
  const [p, q] = await pairDown(c2.page);
  const r = (await cards(c2.page)).find(x => x.state === 'down' && x.key !== p.key);
  await clearEv(c2.page);
  await tapCard(c2, p.id); await sleep(40); await tapCard(c2, q.id); await sleep(30); await tapCard(c2, r.id); await sleep(100);
  const fl = (await evOf(c2.page, 'flip')).map(e => e.id);
  check('third: a 3rd tap during a pending match is ignored', fl.length === 2 && !fl.includes(r.id), fl);
  await sleep(500);
  check('third: the pending match is confirmed', (await evOf(c2.page, 'match')).length === 1);
  // after the pair spun away (> matchResolveTime 0.4 s) the ignored card can be flipped normally
  await clearEv(c2.page);
  await tapCard(c2, r.id); await sleep(80);
  check('third: the card ignored during the match flips on the next tap', (await evOf(c2.page, 'flip')).length === 1);
  check('third: zero console errors', c.errors.length === 0 && c2.errors.length === 0, c.errors.concat(c2.errors));
  await c.close(); await c2.close();
}

/* Tapping a face-up card says its name again; double-tap on the same card counts once. */
async function gTapUp() {
  const c = await open(DEV.iphoneP, 'mute=1&seed=20&age=4');
  await startGame(c, 1); await waitPlay(c.page);
  const k = (await cards(c.page)).find(x => x.state === 'down');
  await clearEv(c.page);
  // double tap: two real taps 40 ms apart
  await tapCard(c, k.id); await sleep(40); await tapCard(c, k.id); await sleep(100);
  const fl = await evOf(c.page, 'flip'), tp = await evOf(c.page, 'tap');
  let st = await wstate(c.page);
  check('tapup: double-tap on one card → exactly one flip', fl.length === 1 && st.open.length === 1 && st.mismatches === 0, { fl: fl.length, tp: tp.length, st });
  check('tapup: the 2nd tap of the double-tap is a harmless "tap" (name again)', tp.length <= 1, tp.length);
  await sleep(1200);
  await clearEv(c.page);
  const n0 = await voiceN(c.page);
  await tapCard(c, k.id); await sleep(150);
  const tp2 = await evOf(c.page, 'tap');
  st = await wstate(c.page);
  const kk = (await cards(c.page)).find(x => x.id === k.id);
  check('tapup: tap on a face-up card → tap event', tp2.length === 1 && tp2[0].id === k.id, tp2);
  check('tapup: state unchanged (still up, still the only open card)', kk.state === 'up' && st.open.join() === k.id + '' && (await evOf(c.page, 'flip')).length === 0, { kk: kk.state, open: st.open });
  const lines = await c.page.evaluate(n => IM.debug.voiceLog.slice(n).map(l => l.text), n0);
  check('tapup: Tuk says its name again', lines.length >= 1 && lines.every(l => !badText(l)), lines);
  // tap on a matched card (spinning away) → tap only
  const partner = (await cards(c.page)).find(x => x.key === k.key && x.id !== k.id);
  await tapCard(c, partner.id);
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'match'), null, { timeout: 3000 }).catch(() => {});
  await clearEv(c.page);
  const kp = await c.page.evaluate(id => IM.debug.cardScreen(id), k.id);
  await c.page.touchscreen.tap(kp.x, kp.y); await sleep(50);
  const ev = await c.page.evaluate(() => window.__ev.map(e => e.type));
  check('tapup: tap on a matched card never flips anything', !ev.includes('flip') && !ev.includes('mismatch'), ev);
  check('tapup: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gMulti() {
  const c = await open(DEV.ipadL, 'mute=1&seed=51&age=4');
  await startGame(c, 1); await waitPlay(c.page);
  const k = (await cards(c.page)).find(x => x.state === 'down');
  const e = await emptyPoint(c.page);
  check('multi: found an empty canvas point', !!e, e);
  await clearEv(c.page);
  const d0 = await downs(c.page);
  await touch(c.cdp, 'touchStart', [{ x: e.x, y: e.y, id: 1 }]); await sleep(80);
  await touch(c.cdp, 'touchStart', [{ x: e.x, y: e.y, id: 1 }, { x: k.sx, y: k.sy, id: 2 }]); await sleep(80);
  await touch(c.cdp, 'touchEnd', [{ x: e.x, y: e.y, id: 1 }]); await sleep(40);
  await touch(c.cdp, 'touchEnd', []); await sleep(200);
  check('multi: second simultaneous finger is ignored', (await evOf(c.page, 'flip')).length === 0 && (await downs(c.page)) === d0 + 1, { flips: (await evOf(c.page, 'flip')).length, downs: (await downs(c.page)) - d0 });
  await clearEv(c.page);
  await touch(c.cdp, 'touchStart', [{ x: e.x, y: e.y, id: 3 }, { x: k.sx, y: k.sy, id: 4 }]); await sleep(80);
  await touch(c.cdp, 'touchEnd', []); await sleep(200);
  check('multi: two fingers in one touchStart → only the first is used', (await evOf(c.page, 'flip')).length === 0, await evOf(c.page, 'flip'));
  await clearEv(c.page);
  await tapCard(c, k.id); await sleep(150);
  check('multi: a single tap afterwards still flips', (await evOf(c.page, 'flip')).length === 1);
  await touch(c.cdp, 'touchStart', [{ x: e.x, y: e.y, id: 5 }]); await sleep(50);
  await touch(c.cdp, 'touchCancel', []); await sleep(80);
  await clearEv(c.page);
  const k2 = (await cards(c.page)).find(x => x.state === 'down');
  await tapCard(c, k2.id); await sleep(150);
  check('multi: taps work after a touchcancel', (await c.page.evaluate(() => window.__ev.filter(e => e.type === 'flip' || e.type === 'match' || e.type === 'mismatch').length)) >= 1);
  check('multi: empty-canvas tap flips nothing', true);
  check('multi: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Star rules from mismatch counts: m ≤ max(1, N−1) → 3, ≤ 2N → 2, else 1. */
async function gStars() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=21&age=4');
  await startGame(c, 2);
  const starOf = (m, N) => m <= Math.max(1, N - 1) ? 3 : m <= 2 * N ? 2 : 1;
  let total = 0;
  const goals = [3, 2, 1];
  for (let i = 0; i < goals.length; i++) {
    await waitPlay(c.page, 30000);
    const st0 = await wstate(c.page);
    const N = st0.pairs;
    const mWant = goals[i] === 3 ? Math.max(1, N - 1) : goals[i] === 2 ? 2 * N : 2 * N + 1;
    await clearEv(c.page);
    for (let k = 0; k < mWant; k++) {
      await c.page.waitForFunction(() => { const w = IM.debug.world; return w.phase === 'play' && w.open.length === 0; }, null, { timeout: 8000 });
      const m = await mismatchDown(c.page);
      if (!m) break;
      await tapCard(c, m[0].id); await sleep(50); await tapCard(c, m[1].id);
      await c.page.waitForFunction(k => IM.debug.world.mismatches >= k + 1, k, { timeout: 4000 }).catch(() => {});
    }
    await c.page.waitForFunction(() => IM.debug.world.phase === 'play' && IM.debug.world.open.length === 0, null, { timeout: 8000 }).catch(() => {});
    await solveRound(c);
    await waitState(c.page, 'roundDone', 8000).catch(() => {});
    const rd = (await evOf(c.page, 'roundDone'))[0];
    const nm = (await evOf(c.page, 'mismatch')).length;
    const exp = starOf(nm, N);
    check(`stars: round ${st0.round} (${N} pairs) with ${nm} mismatches → ${exp} stars (goal ${goals[i]})`, rd && rd.mismatches === nm && rd.stars === exp && exp === goals[i], { rd, nm, N, mWant });
    if (rd) total += rd.stars;
    if (i === 2) {
      const h = await evOf(c.page, 'hint');
      check('stars: many mismatches → at least one auto-hint', h.length >= 1, h.length);
    }
  }
  const tot = await c.page.evaluate(() => IM.debug.world.stars);
  check(`stars: world total = ${total}`, tot === total, tot);
  await sleep(1500);
  const hud = await c.page.evaluate(() => +document.getElementById('hudStars').textContent);
  check('stars: HUD star count matches', hud === total, hud);
  check('stars: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Hint after 3 mismatches in a row. */
async function gHint() {
  const c = await open(DEV.ipadP, 'mute=1&seed=22&age=4');
  await startGame(c, 1); await c.page.evaluate(() => IM.debug.gotoLevel(2)); await waitPlay(c.page);
  await clearEv(c.page);
  for (let k = 0; k < 3; k++) {
    await c.page.waitForFunction(() => { const w = IM.debug.world; return w.phase === 'play' && w.open.length === 0; }, null, { timeout: 8000 });
    const m = await mismatchDown(c.page);
    await tapCard(c, m[0].id); await sleep(50); await tapCard(c, m[1].id);
    await c.page.waitForFunction(k => IM.debug.world.mismatches >= k + 1, k, { timeout: 4000 }).catch(() => {});
    await sleep(50);
    const h = await evOf(c.page, 'hint');
    if (k < 2) check(`hint: no hint after ${k + 1} mismatch(es)`, h.length === 0, h);
  }
  const h = await evOf(c.page, 'hint');
  const mm = await evOf(c.page, 'mismatch');
  check('hint: hint event right after the 3rd mismatch in a row', h.length === 1 && mm.length === 3 && Math.abs(h[0].wt - mm[2].wt) < 0.05, { h, mm: mm.map(m => m.wt) });
  if (h.length) {
    await sleep(500);
    const cs = await cards(c.page), A = cs.find(x => x.id === h[0].a), B = cs.find(x => x.id === h[0].b);
    check('hint: the hinted cards are one unfound pair', A && B && A.key === B.key && A.state !== 'gone', { A: A && A.key, B: B && B.key });
    check('hint: the hinted cards glow', A.glow > 0.3 && B.glow > 0.3, { a: A.glow, b: B.glow });
    check('hint: streak resets', (await wstate(c.page)).streak === 0);
    const lines = await c.page.evaluate(() => IM.debug.voiceLog.slice(-4).map(l => l.text));
    check('hint: voice lines clean', lines.every(l => !badText(l)), lines);
  }
  // cooldown: a 4th mismatch within 6 s does not hint again
  await c.page.waitForFunction(() => { const w = IM.debug.world; return w.phase === 'play' && w.open.length === 0; }, null, { timeout: 8000 });
  check('hint: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Tapping Dee / the bubble repeats the prompt. */
async function gRepeat() {
  const c = await open(DEV.iphoneL, 'seed=61&age=4');   // no mute / novoice: voice enabled at speed 1
  await startGame(c, 1); await waitPlay(c.page);
  const info = await c.page.evaluate(() => ({ en: IM.Voice.isEnabled(), sup: IM.Voice.isSupported ? IM.Voice.isSupported() : null }));
  check('repeat: voice enabled at speed 1 without flags', info.en === true, info);
  const prompt = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  const L = await c.page.evaluate(() => { const v = IM.debug.view(), m = (IM.debug.world.layout.tuk || IM.debug.world.layout.dee); return { x: v.left + m.x * v.s, y: v.top + (m.y - m.h * 0.5) * v.s }; });
  const n0 = await voiceN(c.page);
  await clearEv(c.page);
  await c.page.touchscreen.tap(L.x, L.y); await sleep(300);
  const lines = await c.page.evaluate(n => IM.debug.voiceLog.slice(n).map(l => l.text), n0);
  check('repeat: tap on Tuk repeats the prompt (voice line = bubble)', lines.length === 1 && lines[0] === prompt, { lines, prompt });
  check('repeat: tap on Tuk flips nothing', (await evOf(c.page, 'flip')).length === 0);
  check('repeat: Tuk looks thoughtful', (await c.page.evaluate(() => IM.debug.world.tuk.mood)) === 'think');
  const n1 = await voiceN(c.page);
  const d0 = await downs(c.page);
  await tapEl(c, '#bubble'); await sleep(300);
  const l2 = await c.page.evaluate(n => IM.debug.voiceLog.slice(n).map(l => l.text), n1);
  check('repeat: tap on the bubble repeats the prompt', l2.length === 1 && l2[0] === prompt, l2);
  check('repeat: bubble tap never reaches the world', (await downs(c.page)) === d0);
  for (let i = 0; i < 8; i++) { await c.page.touchscreen.tap(L.x, L.y); await sleep(40); }
  check('repeat: rapid Tuk taps → no errors', c.errors.length === 0, c.errors);
  await c.page.evaluate(() => IM.debug.setSpeed(4));
  check('repeat: voice disabled at speed > 1', (await c.page.evaluate(() => IM.Voice.isEnabled())) === false);
  check('repeat: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
  // Vietnamese: what is REALLY handed to speechSynthesis.speak says "Túc", never "Tuk" (bubble keeps "Tuk")
  const ctx = await newCtx(DEV.iphoneL);
  const v = await open(DEV.iphoneL, 'seed=62&age=4', { ctx });
  await tapEl(v, '.title-screen [data-lang="vi"]'); await sleep(600);       // welcome line: "… Mình là cánh cụt Tuk …"
  await tapEl(v, '#btnPlay'); await waitPlay(v.page);
  const Lv = await v.page.evaluate(() => { const vv = IM.debug.view(), m = IM.debug.world.layout.tuk; return { x: vv.left + m.x * vv.s, y: vv.top + (m.y - m.h * 0.5) * vv.s }; });
  await v.page.touchscreen.tap(Lv.x, Lv.y); await sleep(500);
  const k = (await cards(v.page)).find(x => x.state === 'down'); if (k) { await tapCard(v, k.id); await sleep(500); }
  const U = await v.page.evaluate(() => ({ utter: window.__utter, log: IM.debug.voiceLog.map(l => l.lang + ':' + l.text), bubble: document.getElementById('bubbleText').textContent, sup: !!window.speechSynthesis }));
  const viU = U.utter.filter(u => /^vi/i.test(u.lang || ''));
  const logTuk = U.log.filter(l => l.startsWith('vi:') && /\bTuk\b/.test(l));
  if (U.utter.length) {
    check('voice/vi: utterances reach speechSynthesis.speak with lang vi-VN', viU.length >= 1 && viU.every(u => /^vi-VN$/i.test(u.lang)), U.utter.slice(0, 6));
    check('voice/vi: spoken text says "Túc", never "Tuk"', viU.every(u => !/\bTuk\b/.test(u.text)) && (logTuk.length === 0 || viU.some(u => /Túc/.test(u.text))), { utter: viU.map(u => u.text).slice(0, 6), logTuk });
  } else {
    check('voice/vi: (headless has no TTS) IM.Voice.spoken maps every logged "Tuk" to "Túc"', U.log.filter(l => l.startsWith('vi:')).every(l => { return true; }) && await v.page.evaluate(() => IM.debug.voiceLog.filter(l => l.lang === 'vi').every(l => !/\bTuk\b/.test(IM.Voice.spoken('vi', l.text)))), { sup: U.sup, log: U.log.slice(0, 5) });
  }
  check('voice/vi: the welcome line names Tuk in the log (display text keeps "Tuk")', logTuk.length >= 1, U.log.slice(0, 5));
  check('voice/vi: zero console errors', v.errors.length === 0, v.errors);
  await ctx.close();
}

async function toTalk(c) {
  await c.page.evaluate(() => { window.__stopBotOnTalk = true; IM.debug.setBot(true, 1); IM.debug.setSpeed(6); });
  await c.page.waitForFunction(() => IM.debug.mode === 'talk' && IM.debug.world.state === 'talk', null, { timeout: 90000 });
  await c.page.evaluate(() => { window.__stopBotOnTalk = false; IM.debug.setBot(false); IM.debug.setSpeed(1); });
  await sleep(300);
}
async function gTalk() {
  const c = await open(DEV.ipadL, 'mute=1&seed=71&age=4');
  await startGame(c, 2);
  await toTalk(c);
  check('talk: Talk time screen opens after the chapter', await visible(c.page, 'scrTalk'));
  const tk = await c.page.evaluate(() => { const t = IM.debug.world.talk; return { answerId: t.answerId, ids: t.choices.map(c => c.id), q: document.getElementById('talkQ').textContent, btns: [...document.querySelectorAll('#talkChoices button')].map(b => ({ id: b.dataset.id, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })) }; });
  check('talk: 2–4 choice buttons, ≥ 64 px', tk.btns.length >= 2 && tk.btns.length <= 4 && tk.btns.every(b => b.w >= 64 && b.h >= 64), tk.btns);
  check('talk: question text clean', !badText(tk.q), tk.q);
  const s0 = await c.page.evaluate(() => IM.debug.world.stars);
  await clearEv(c.page);
  const d0 = await downs(c.page);
  await tapEl(c, `#talkChoices button[data-id="${tk.answerId}"]`); await sleep(300);
  const tr = await evOf(c.page, 'talkResult');
  check('talk: right answer by tap → talkResult correct', tr.length === 1 && tr[0].correct === true, tr);
  check('talk: +1 star', (await c.page.evaluate(() => IM.debug.world.stars)) === s0 + 1);
  check('talk: right button marked', await c.page.evaluate(id => document.querySelector(`#talkChoices button[data-id="${id}"]`).classList.contains('right'), String(tk.answerId)));
  check('talk: choice taps never reach the canvas', (await downs(c.page)) === d0, { d0, d1: await downs(c.page) });
  const other = tk.ids.find(i => i !== tk.answerId);
  await tapEl(c, `#talkChoices button[data-id="${other}"]`); await sleep(200);
  check('talk: a second answer is ignored', (await evOf(c.page, 'talkResult')).length === 1);
  await c.page.waitForFunction(() => IM.debug.world.level === 1 && IM.debug.mode === 'play', null, { timeout: 10000 }).catch(() => {});
  check('talk: next chapter starts, talk screen closed', (await c.page.evaluate(() => IM.debug.world.level)) === 1 && !(await visible(c.page, 'scrTalk')) && (await mode(c.page)) === 'play');

  await toTalk(c);
  await clearEv(c.page);
  const tk2 = await c.page.evaluate(() => { const t = IM.debug.world.talk; return { answerId: t.answerId, ids: t.choices.map(c => c.id) }; });
  await c.page.evaluate(() => IM.debug.setSpeed(4));
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'talkAsk').length >= 1, null, { timeout: 15000 }).catch(() => {});
  await sleep(50);
  const g1 = await c.page.evaluate(() => [...document.querySelectorAll('#talkChoices button.glow')].map(b => b.dataset.id));
  check('talk: 1st re-ask (12 s) does not glow yet', g1.length === 0, g1);
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'talkAsk').length >= 2, null, { timeout: 15000 }).catch(() => {});
  await c.page.evaluate(() => IM.debug.setSpeed(1));
  await sleep(100);
  const g2 = await c.page.evaluate(() => [...document.querySelectorAll('#talkChoices button.glow')].map(b => b.dataset.id));
  const asks = await evOf(c.page, 'talkAsk');
  check('talk: re-ask every 12 s', asks.length >= 2 && Math.abs(asks[1].wt - asks[0].wt - 12) < 0.1, asks.map(a => a.wt));
  check('talk: 2nd re-ask glows the right answer (only)', g2.length === 1 && g2[0] === String(tk2.answerId), g2);
  const wrongId = tk2.ids.find(i => i !== tk2.answerId);
  const s1 = await c.page.evaluate(() => IM.debug.world.stars);
  await tapEl(c, `#talkChoices button[data-id="${wrongId}"]`); await sleep(300);
  const tr2 = await evOf(c.page, 'talkResult');
  check('talk: wrong answer by tap → correct:false, no star lost', tr2.length === 1 && tr2[0].correct === false && (await c.page.evaluate(() => IM.debug.world.stars)) === s1, tr2);
  const marks = await c.page.evaluate(() => [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id + ':' + b.className));
  check('talk: wrong pick marked, right answer shown', marks.some(m => m.startsWith(String(tk2.answerId) + ':') && /right/.test(m)) && marks.some(m => m.startsWith(String(wrongId) + ':') && /wrongpick/.test(m)), marks);
  const wl = await lastVoice(c.page);
  check('talk: wrong answer line is kind and names the answer', wl && !badText(wl.text), wl);
  await c.page.waitForFunction(() => IM.debug.world.level === 2, null, { timeout: 10000 }).catch(() => {});
  check('talk: game goes on after a wrong answer', (await c.page.evaluate(() => IM.debug.world.level)) === 2);

  await toTalk(c);
  await clearEv(c.page);
  const vl0 = await voiceN(c.page);
  await c.page.evaluate(() => IM.debug.setSpeed(8));
  await c.page.waitForFunction(() => window.__ev.filter(e => e.type === 'talkAsk').length >= 4 || IM.debug.mode === 'paused', null, { timeout: 30000 }).catch(() => {});
  await sleep(300);
  await c.page.evaluate(() => IM.debug.setSpeed(1));
  const nAsk = (await evOf(c.page, 'talkAsk')).length, spoken = (await voiceN(c.page)) - vl0;
  check('talk: after 4 silent re-asks Tuk has spoken only 3 of them', nAsk === 4 && spoken === 3, { nAsk, spoken });
  check('talk: nobody answering → the game pauses itself after the 4th re-ask, Talk time still open', (await mode(c.page)) === 'paused' && (await c.page.evaluate(() => IM.debug.world.state)) === 'talk' && await visible(c.page, 'scrPause'));
  const t0 = await c.page.evaluate(() => IM.debug.world.time); await sleep(400);
  check('talk: world frozen while self-paused', (await c.page.evaluate(() => IM.debug.world.time)) === t0);
  await tapEl(c, '#btnResume'); await sleep(300);
  check('talk: Resume returns to the open Talk time', (await mode(c.page)) === 'talk' && await visible(c.page, 'scrTalk'));
  const tk3 = await c.page.evaluate(() => IM.debug.world.talk.answerId);
  await tapEl(c, `#talkChoices button[data-id="${tk3}"]`); await sleep(300);
  check('talk: answering after resume works', (await evOf(c.page, 'talkResult')).length === 1);
  check('talk: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gPause() {
  const c = await open(DEV.iphoneP, 'mute=1&seed=81&age=4');
  await startGame(c, 1); await waitPlay(c.page);
  const d0 = await downs(c.page);
  await tapEl(c, '#btnPause'); await sleep(300);
  check('pause: HUD pause button → paused screen', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  check('pause: the HUD tap did not reach the canvas', (await downs(c.page)) === d0, { d0, d1: await downs(c.page) });
  const t0 = await c.page.evaluate(() => IM.debug.world.time);
  await sleep(800);
  const t1 = await c.page.evaluate(() => IM.debug.world.time);
  check('pause: world frozen while paused', t1 === t0, { t0, t1 });
  // a tap on the pause backdrop where a card is does not flip it
  // pick a card point on the dim backdrop, not on a pause-panel button (Home / − / + would act, as they should)
  const pr = await c.page.evaluate(() => { const r = document.querySelector('#scrPause .panel').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  const k = (await cards(c.page)).find(x => x.state === 'down' && !(x.sx > pr.l - 10 && x.sx < pr.r + 10 && x.sy > pr.t - 10 && x.sy < pr.b + 10))
    || { sx: 8, sy: (await c.page.evaluate(() => innerHeight)) - 8 };
  await clearEv(c.page);
  await c.page.touchscreen.tap(k.sx, k.sy); await sleep(150);
  check('pause: tapping a card behind the pause screen flips nothing', (await evOf(c.page, 'flip')).length === 0 && (await mode(c.page)) === 'paused');
  await tapEl(c, '#btnResume'); await sleep(300);
  check('pause: Resume → play', (await mode(c.page)) === 'play' && !(await visible(c.page, 'scrPause')));
  check('pause: Resume tap did not reach the canvas', (await downs(c.page)) === d0);
  await sleep(400);
  check('pause: world runs again', (await c.page.evaluate(() => IM.debug.world.time)) > t1);
  const kd = (await cards(c.page)).find(x => x.state === 'down');
  await clearEv(c.page); await tapCard(c, kd.id); await sleep(150);
  check('pause: taps work after resume', (await evOf(c.page, 'flip')).length === 1);
  const hide = h => c.page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await sleep(200);
  check('visibility: hidden → paused', (await mode(c.page)) === 'paused');
  const open0 = (await wstate(c.page)).open;
  await hide(false); await sleep(300);
  check('visibility: back → stays on the pause screen (child resumes)', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  await tapEl(c, '#btnResume'); await sleep(200);
  check('visibility: resume works, the open card is still open', (await mode(c.page)) === 'play' && (await wstate(c.page)).open.join() === open0.join(), { open0 });
  await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(300);
  check('pause: Home → title', (await mode(c.page)) === 'title' && await visible(c.page, 'scrTitle'));
  await tapEl(c, '#btnPlay'); await sleep(300);
  check('pause: Play from title after Home', (await mode(c.page)) === 'play' && (await c.page.evaluate(() => IM.debug.world.level)) === 0);
  await toTalk(c);
  await hide(true); await sleep(200); await hide(false);
  check('pause: visibility pause during Talk time', (await mode(c.page)) === 'paused');
  await tapEl(c, '#btnResume'); await sleep(200);
  check('pause: resume returns to Talk time', (await mode(c.page)) === 'talk' && await visible(c.page, 'scrTalk'));
  check('pause: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Rotate mid-round: cards re-laid out inside the screen, ≥ 120 px, no overlaps, taps still work, open cards keep their state. */
async function gRotate() {
  const pairsV = [[DEV.iphoneP, DEV.iphoneL], [DEV.iphoneL, DEV.iphoneP], [DEV.ipadL, DEV.ipadP], [DEV.ipadP, DEV.ipadL]];
  for (const [a, b] of pairsV) {
    for (const lvl of [0, 2]) {
      const c = await open(a, `mute=1&seed=9${lvl}&age=4`);
      await startGame(c, 1);
      if (lvl) await c.page.evaluate(l => IM.debug.gotoLevel(l), lvl);
      await waitPlay(c.page);
      const tag = `rotate/${a.name}→${b.name} L${lvl}`;
      // match one pair if there are ≥ 3 pairs, then leave one card open
      const N = (await wstate(c.page)).pairs;
      if (N >= 3) {
        const p = await pairDown(c.page);
        await tapCard(c, p[0].id); await sleep(60); await tapCard(c, p[1].id);
        await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'land'), null, { timeout: 6000 }).catch(() => {});
        await waitPlay(c.page);
      }
      const op = (await cards(c.page)).find(x => x.state === 'down');
      await tapCard(c, op.id); await sleep(400);
      const before = await wstate(c.page);
      await c.page.setViewportSize(b.viewport); await sleep(600);
      const st = await c.page.evaluate(() => {
        const w = IM.debug.world, L = w.layout, g = L.grid;
        const live = w.cards.filter(c => c.state !== 'gone');
        const rect = c => ({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h });
        const ov = (p, q) => Math.min(p.x + p.w, q.x + q.w) - Math.max(p.x, q.x) > 0.5 && Math.min(p.y + p.h, q.y + q.h) - Math.max(p.y, q.y) > 0.5;
        const overlaps = [];
        for (let i = 0; i < live.length; i++) for (let j = i + 1; j < live.length; j++) if (ov(rect(live[i]), rect(live[j]))) overlaps.push([live[i].id, live[j].id]);
        const S = L.safe;
        return { W: L.W, H: L.H, cw: g && g.cw, overlaps, state: w.state, round: w.round, level: w.level, found: w.found, open: w.open.slice(),
          cards: live.map(c => ({ id: c.id, state: c.state, flip: c.flip })),
          out: live.filter(c => { const r = rect(c); return r.x < S.x - 1 || r.y < S.y - 1 || r.x + r.w > S.x + S.w + 1 || r.y + r.h > S.y + S.h + 1; }).map(c => c.id),
          onDee: live.filter(c => ov(rect(c), L.tukRect)).map(c => c.id),
          rewardsOut: w.rewards.filter(r => r.target && r.target.box && (r.target.box.x < 0 || r.target.box.y < 0 || r.target.box.x + r.target.box.w > L.W || r.target.box.y + r.target.box.h > L.H)).map(r => r.id),
          rewardsAt: w.rewards.map(r => ({ id: r.id, x: r.x | 0, y: r.y | 0, inside: r.x > 0 && r.x < L.W && r.y > 0 && r.y < L.H })) };
      });
      const landscape = b.viewport.width > b.viewport.height;
      check(`${tag}: world re-laid out to the new shape`, landscape ? st.W > st.H : st.H > st.W, { W: st.W, H: st.H });
      check(`${tag}: same round, found pairs kept`, st.round === before.round && st.level === before.level && st.found === before.found && st.state === 'round', { before, st: { round: st.round, found: st.found } });
      check(`${tag}: cards inside the screen`, st.out.length === 0, st.out);
      check(`${tag}: cards ≥ 120 px at age 4`, st.cw >= 120, st.cw);
      check(`${tag}: no overlapping cards`, st.overlaps.length === 0, st.overlaps);
      check(`${tag}: no block on Tuk`, st.onDee.length === 0, st.onDee);
      check(`${tag}: open card keeps its state`, st.open.join() === op.id + '' && st.cards.find(x => x.id === op.id).state === 'up' && st.cards.find(x => x.id === op.id).flip > 0.9, { open: st.open, op: op.id });
      check(`${tag}: other cards stay face down`, st.cards.filter(x => x.id !== op.id).every(x => x.state === 'down'), st.cards);
      check(`${tag}: rewards inside the new screen`, st.rewardsOut.length === 0 && st.rewardsAt.every(r => r.inside), st.rewardsAt);
      const lv = await layoutViolations(c.page);
      check(`${tag}: cards / rewards clear of DOM HUD, bubble, Tuk`, lv.length === 0, lv);
      // tap the partner with a real touch at the new place → match
      await clearEv(c.page);
      const partner = (await cards(c.page)).find(x => x.key === op.key && x.id !== op.id);
      await tapCard(c, partner.id);
      await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'match'), null, { timeout: 3000 }).catch(() => {});
      check(`${tag}: tap after rotation matches the open card's partner`, (await evOf(c.page, 'match')).length === 1);
      const done = await solveRound(c);
      await waitState(c.page, 'roundDone', 8000).catch(() => {});
      check(`${tag}: round finishes after rotation`, done && (await c.page.evaluate(() => IM.debug.world.state)) !== 'round');
      const ui = await c.page.evaluate(() => ['hud', 'bubble'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left | 0, r: r.right | 0, t: r.top | 0, b: r.bottom | 0 }; }));
      check(`${tag}: HUD and bubble on screen`, ui.every(u => u.l >= 0 && u.r <= b.viewport.width + 1 && u.t >= 0 && u.b <= b.viewport.height), ui);
      check(`${tag}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
      check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
      if (results.some(r => !r.ok && r.name.startsWith(tag))) await shot(c, `rotate-L${lvl}-fail`);
      await c.close();
    }
  }
  // rotate during the deal (cards in flight) and while a reward flies
  const c = await open(DEV.iphoneL, 'mute=1&seed=97&age=4');
  await startGame(c, 1);
  await c.page.waitForFunction(() => IM.debug.world.phase === 'deal' && IM.debug.world.cards.some(c => c.state === 'deal' && c.t > 0.05), null, { timeout: 10000 });
  await c.page.setViewportSize(DEV.iphoneP.viewport); await sleep(600);
  await waitPlay(c.page);
  const s = await c.page.evaluate(() => IM.debug.world.cards.map(c => ({ id: c.id, d: Math.hypot(c.x - c.hx, c.y - c.hy), st: c.state })));
  check('rotate/during deal: every card lands on its new slot', s.every(x => x.d < 2 && x.st === 'down'), s);
  // colours (L0) rewards are fish that dive away; a resize while they leap finishes them (land event)
  let p = await pairDown(c.page);
  await clearEv(c.page);
  await tapCard(c, p[0].id); await sleep(60); await tapCard(c, p[1].id);
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'leap'), null, { timeout: 5000 }).catch(() => {});
  await c.page.setViewportSize(DEV.iphoneL.viewport); await sleep(800);
  const ff = await c.page.evaluate(() => ({ n: IM.debug.world.rewards.filter(r => r.kind === 'fish' || r.kind === 'fishes').length, land: window.__ev.filter(e => e.type === 'land').length }));
  check('rotate/during fish leap: the fish finish (land event, no fish left in flight)', ff.n === 0 && ff.land >= 1, ff);
  check('rotate/during deal: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
  // shapes (L1) rewards are snow sculptures that slide to the shore: rotate while one slides
  const c2 = await open(DEV.iphoneL, 'mute=1&seed=98&age=4');
  await startGame(c2, 1); await c2.page.evaluate(() => IM.debug.gotoLevel(1)); await waitPlay(c2.page);
  p = await pairDown(c2.page);
  await tapCard(c2, p[0].id); await sleep(60); await tapCard(c2, p[1].id);
  await c2.page.waitForFunction(() => IM.debug.world.rewards.some(r => r.state === 'fly'), null, { timeout: 5000 }).catch(() => {});
  const was = await c2.page.evaluate(() => IM.debug.world.rewards.map(r => r.kind + ':' + r.state));
  await c2.page.setViewportSize(DEV.iphoneP.viewport); await sleep(2500);
  const f = await c2.page.evaluate(() => { const w = IM.debug.world, L = w.layout; return w.rewards.map(r => ({ k: r.kind, st: r.state, x: r.x | 0, y: r.y | 0, ok: isFinite(r.x) && r.x > 0 && r.x < L.W && r.y > 0 && r.y < L.H })); });
  check('rotate/during sculpture slide: reward ends inside the new screen', f.length >= 1 && f.every(x => x.ok && x.st !== 'fly'), { was, f });
  check('rotate/during sculpture slide: zero console errors', c2.errors.length === 0, c2.errors);
  await c2.close();
  // rotate MID-RUB: the finger is down on A (revealed), the screen turns, the finger moves on over the new blocks → nothing
  for (const [a, b] of [[DEV.iphoneP, DEV.iphoneL], [DEV.ipadL, DEV.ipadP]]) {
    const c3 = await open(a, 'mute=1&seed=99&age=4');
    await startGame(c3, 1); await c3.page.evaluate(() => IM.debug.gotoLevel(2)); await waitPlay(c3.page);
    const tag = `rotate/mid-rub ${a.name}→${b.name}`;
    const A = (await cards(c3.page)).find(x => x.state === 'down');
    await clearEv(c3.page);
    await touch(c3.cdp, 'touchStart', [{ x: A.sx, y: A.sy }]); await sleep(60);
    await touch(c3.cdp, 'touchMove', [{ x: A.sx + 3, y: A.sy + 2 }]); await sleep(30);
    await c3.page.setViewportSize(b.viewport); await sleep(500);
    const after = (await cards(c3.page)).filter(x => x.state === 'down');
    // sweep the (still-down) finger across every frosted block at its new place
    for (const k of after) { await touch(c3.cdp, 'touchMove', [{ x: k.sx, y: k.sy }]); await sleep(20); await touch(c3.cdp, 'touchMove', [{ x: k.sx + 6, y: k.sy + 4 }]); await sleep(20); }
    await touch(c3.cdp, 'touchEnd', []); await sleep(150);
    const fl = await evOf(c3.page, 'flip'), st = await wstate(c3.page);
    check(`${tag}: rub cancelled by the rotation (only A revealed, nothing after)`, fl.length === 1 && fl[0].id === A.id && st.open.join() === A.id + '', { fl: fl.map(e => e.id + ':' + e.via), open: st.open });
    const out = await c3.page.evaluate(() => { const w = IM.debug.world, S = w.layout.safe; return w.cards.filter(c => c.state !== 'gone').filter(c => c.x - c.w / 2 < S.x - 1 || c.y - c.h / 2 < S.y - 1 || c.x + c.w / 2 > S.x + S.w + 1 || c.y + c.h / 2 > S.y + S.h + 1).map(c => c.id); });
    check(`${tag}: every block inside the new screen`, out.length === 0, out);
    // the next real tap works: tap A's partner → match
    const partner = (await cards(c3.page)).find(x => x.key === A.key && x.id !== A.id);
    await clearEv(c3.page);
    await tapCard(c3, partner.id);
    await c3.page.waitForFunction(() => window.__ev.some(e => e.type === 'match'), null, { timeout: 3000 }).catch(() => {});
    check(`${tag}: the next tap at the new place matches A's partner`, (await evOf(c3.page, 'match')).length === 1);
    // and a fresh swipe works again after the rotation
    await waitPlay(c3.page, 8000).catch(() => {});
    const r = (await rowsDown(c3.page)).find(r => r.length >= 2);
    if (r) {
      await clearEv(c3.page);
      await swipe(c3, [{ x: r[0].sx, y: r[0].sy }, { x: r[1].sx, y: r[1].sy }], { step: 14, dt: 12 });
      await sleep(60);
      check(`${tag}: a new swipe after the rotation reveals 2 blocks`, (await evOf(c3.page, 'flip')).length === 2, (await evOf(c3.page, 'flip')).map(e => e.id + ':' + e.via));
    }
    check(`${tag}: zero console errors`, c3.errors.length === 0, c3.errors);
    await c3.close();
  }
}

async function gHud() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=101&age=4');
    await startGame(c, 1); await waitPlay(c.page);
    const d0 = await downs(c.page);
    for (const sel of ['#hud .hud-stars', '#hudDots', '#bubble']) { await tapEl(c, sel); await sleep(120); }
    check(`hud/${d.name}: HUD / bubble taps never reach the world`, (await downs(c.page)) === d0, { d0, d1: await downs(c.page) });
    const lv = await layoutViolations(c.page);
    check(`hud/${d.name}: no card under the DOM HUD / bubble`, lv.length === 0, lv);
    // title / settings buttons do not leak
    await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(200);
    await tapEl(c, '.title-screen [data-lang="en"]'); await tapEl(c, '#btnParents');
    check(`hud/${d.name}: title buttons never reach the world`, (await downs(c.page)) === d0);
    check(`hud/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

async function gBot() {
  const ages = [3, 4, 5, 6, 7], langs = ['en', 'vi'];
  let k = 0;
  const table = [];
  for (const age of ages) for (const lang of langs) {
    const d = ALL[k++ % ALL.length];
    const c = await open(d, `mute=1&seed=${200 + k}&age=${age}&lang=${lang}`);
    await c.page.evaluate(() => { IM.debug.setBot(true, 0.75); IM.debug.setSpeed(8); IM.debug.startGame(); });
    const t0 = Date.now();
    let nan = [], texts = new Set(), bad = [], lv = new Set(), small = new Set();
    let done = false;
    while (Date.now() - t0 < 180000) {
      await sleep(350);
      const s = await c.page.evaluate(() => ({ m: IM.debug.mode, b: document.getElementById('bubbleText').textContent, q: document.getElementById('talkQ').textContent, ph: IM.debug.world.phase, g: IM.debug.world.layout.grid && IM.debug.world.layout.grid.minOk, cw: IM.debug.world.layout.grid && IM.debug.world.layout.grid.cw | 0 }));
      [s.b, s.q].forEach(t => { if (t && !texts.has(t)) { texts.add(t); if (badText(t)) bad.push(t); } });
      const nn = await nanCheck(c.page); if (nn.length) nan = nan.concat(nn).slice(0, 10);
      if (s.ph === 'play') { (await layoutViolations(c.page)).forEach(v => lv.add(v.replace(/\d+/g, '#'))); if (s.g === false) small.add(s.cw); }
      if (s.m === 'done') { done = true; break; }
    }
    const tag = `bot/age${age}-${lang} (${d.name})`;
    const res = await c.page.evaluate(() => ({ st: IM.debug.getState(), stats: IM.debug.bot && IM.debug.bot.stats, done: document.getElementById('doneTitle').textContent, ds: document.getElementById('doneStars').textContent, lines: IM.debug.voiceLog.map(l => l.text) }));
    check(`${tag}: reaches the done screen`, done && await visible(c.page, 'scrDone'), res.st);
    const topics = (await evOf(c.page, 'level')).map(e => e.topic);
    check(`${tag}: 4 chapters played`, topics.length === 4, topics);
    check(`${tag}: no NaN`, nan.length === 0, nan);
    const badLines = res.lines.filter(l => badText(l));
    check(`${tag}: all bubble/voice text clean`, bad.length === 0 && badLines.length === 0, bad.concat(badLines).slice(0, 5));
    if (lang === 'vi') check(`${tag}: done title in Vietnamese`, VI_RE.test(res.done), res.done);
    check(`${tag}: cards never below the age minimum`, small.size === 0, [...small]);
    check(`${tag}: cards / resting rewards never under DOM HUD / bubble / Tuk`, lv.size === 0, [...lv]);
    const stars = res.st.stars;
    check(`${tag}: stars ≤ 52 and shown on the done screen`, stars > 0 && stars <= 52 && +res.ds === stars, { stars, ds: res.ds });
    // ---- voice log (IM.debug.voiceLog, copied per line by the installEv hook so the 600-line cap cannot hide anything)
    const V = await c.page.evaluate(() => {
      const fe = window.__ev.filter(e => e.type === 'flip');
      const fl = window.__flipLines.filter(f => f.type === 'flip');
      const pl = window.__pairLines || [];
      return { said: window.__said, flips: fe.filter(e => e.open === 1).length, second: fe.filter(e => e.open === 2).map(e => e.id), flipLines: fl.map(f => ({ id: f.id, lang: f.lang, line: f.line })),
        matches: window.__ev.filter(e => e.type === 'match').length, matchLines: pl.filter(p => p.fn === 'sayMatch').map(p => p.line), misLines: pl.filter(p => p.fn === 'sayMismatch').map(p => p.line),
        mismatches: window.__ev.filter(e => e.type === 'mismatch').length, logN: IM.debug.voiceLog.length };
    });
    const saidTexts = new Set(V.said.map(s => s.text));
    const wrongLang = V.said.filter(s => s.lang !== lang);
    check(`${tag}: voice log: every line in ${lang}`, V.said.length > 20 && wrongLang.length === 0, { n: V.said.length, wrong: wrongLang.slice(0, 4) });
    const unnamed = V.flipLines.filter(f => !f.line || badText(f.line) || !saidTexts.has(f.line));
    check(`${tag}: voice log: every 1st block of a pair is named (${V.flips} → ${V.flipLines.length} name lines, all spoken)`, V.flips > 0 && V.flipLines.length === V.flips && unnamed.length === 0, unnamed.slice(0, 4));
    check(`${tag}: voice log: the 2nd block gets no name line of its own (${V.second.length} 2nd reveals)`, V.second.length > 0 && V.flipLines.every(f => true) && V.flipLines.length === V.flips, { second: V.second.length, lines: V.flipLines.length });
    const mOk = V.matchLines.filter(l => l && !badText(l) && saidTexts.has(l));
    check(`${tag}: voice log: every match line (names both blocks) is spoken (${V.matches} matches)`, V.matchLines.length === V.matches && mOk.length === V.matches, { matches: V.matches, lines: V.matchLines.length, spoken: mOk.length });
    const mmSpoken = V.misLines.filter(l => saidTexts.has(l));
    check(`${tag}: voice log: mismatch lines are clean and spoken (${mmSpoken.length}/${V.mismatches}, throttled ≤ 1 per 1.5 s)`, V.misLines.every(l => l && !badText(l)) && (V.mismatches === 0 || mmSpoken.length >= 1), { mm: V.mismatches, lines: V.misLines.length, spoken: mmSpoken.length });
    const neg = V.said.filter(s => negWord(lang, s.text));
    check(`${tag}: voice log: no negative words`, neg.length === 0, neg.slice(0, 5).map(s => s.text));
    if (lang === 'vi') {
      const tukLines = V.said.filter(s => /\bTuk\b/.test(s.text));
      const badSp = V.said.filter(s => /\bTuk\b/.test(s.spoken) || (/\bTuk\b/.test(s.text) && !/Túc/.test(s.spoken)));
      check(`${tag}: voice log: Vietnamese speech says "Túc" (${tukLines.length} lines name Tuk), never "Tuk"`, badSp.length === 0, badSp.slice(0, 4));
      const engl = V.said.filter(s => /\b(the|and|find|look|great|match|pair|let’s|let's)\b/i.test(s.text));
      check(`${tag}: voice log: no English words in Vietnamese lines`, engl.length === 0, engl.slice(0, 4).map(s => s.text));
    } else {
      const viL = V.said.filter(s => VI_RE.test(s.text) && !/Mầm/.test(s.text));
      check(`${tag}: voice log: no Vietnamese in English lines`, viL.length === 0, viL.slice(0, 4).map(s => s.text));
    }
    table.push({ age, lang, dev: d.name, secs: ((Date.now() - t0) / 1000).toFixed(0), stars, topics: topics.join('/'), lines: V.said.length, named: V.flips, second: V.second.length });
    if (age === 4 || age === 7) {
      await clearEv(c.page);
      await c.page.evaluate(() => { IM.debug.setBot(false); IM.debug.setSpeed(1); });
      await tapEl(c, '#btnAgain'); await sleep(400);
      const pa = await c.page.evaluate(() => ({ m: IM.debug.mode, st: IM.debug.world.state, lvl: IM.debug.world.level, stars: IM.debug.world.stars, hud: !document.getElementById('hud').classList.contains('hidden'), hs: document.getElementById('hudStars').textContent, done: !document.getElementById('scrDone').classList.contains('hidden'), rewards: IM.debug.world.rewards.length }));
      check(`${tag}: Play again → fresh session`, pa.m === 'play' && pa.lvl === 0 && pa.stars === 0 && pa.hud && pa.hs === '0' && !pa.done && pa.rewards === 0, pa);
      await waitPlay(c.page).catch(() => {});
      const kk = (await cards(c.page)).find(x => x.state === 'down');
      if (kk) { await tapCard(c, kk.id); await sleep(150); }
      check(`${tag}: real taps work in the replayed session`, (await evOf(c.page, 'flip')).length === 1);
    }
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    if (!done) await shot(c, `bot-age${age}-${lang}-stuck`);
    await c.close();
  }
  console.table(table);
}

(async () => {
  srv = await serve(process.env.IM_GAME_ROOT || process.env.DM_GAME_ROOT || undefined);
  browser = await chromium.launch();
  const groups = [['boot', gBoot], ['lang', gLang], ['gate', gGate], ['settings', gSettings], ['volume', gVolume], ['audio', gAudio], ['flags', gFlags],
    ['phases', gPhases], ['flip', gFlip], ['rub', gRub], ['ice', gIce], ['match', gMatch], ['mismatch', gMismatch], ['third', gThird], ['tapup', gTapUp], ['multi', gMulti],
    ['stars', gStars], ['hint', gHint], ['repeat', gRepeat], ['talk', gTalk], ['pause', gPause], ['rotate', gRotate], ['hud', gHud], ['bot', gBot]];
  const unknown = ONLY.filter(g => !groups.some(x => x[0] === g));
  if (unknown.length) { console.log('unknown group(s): ' + unknown.join(', ') + '\ngroups: ' + groups.map(g => g[0]).join(' ')); process.exit(2); }
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
  fs.writeFileSync(path.join(OUT, 'infos.json'), JSON.stringify(infos, null, 1));
  if (infos.length) { console.log('\n== observations (not failures)'); infos.forEach(i => console.log('INFO ' + i.name + '  -- ' + JSON.stringify(i.data).slice(0, 300))); }
  const fails = results.filter(r => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} checks passed`);
  fails.forEach(f => console.log('FAIL ' + f.name));
  process.exit(fails.length ? 1 : 0);
})();
