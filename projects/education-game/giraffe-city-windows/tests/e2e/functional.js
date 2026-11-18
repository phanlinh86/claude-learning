// Functional QA suite for Gigi's Peekaboo Windows — REAL touch input on iPhone/iPad-sized mobile contexts.
//   node tests/e2e/functional.js                    (all groups)
//   node tests/e2e/functional.js pair mismatch      (only some groups)
// Groups: boot lang gate settings flags volume phases pair mismatch third tapopen gigi critter talk pause rotate bot
// Prints PASS/FAIL per check + a summary table, writes tests/out/functional/results.json (+ screenshots on failure),
// exits 1 on any FAIL. Env: GW_GAME_ROOT=<dir> tests another build of game/.
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
const T_START = Date.now();

const results = [];
let curGroup = '';
function check(name, ok, info) {
  results.push({ group: curGroup, name, ok: !!ok, info: info == null ? '' : info });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 700)));
  return !!ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũ]/i;
function badText(s) {
  if (s == null) return null;
  s = String(s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|chapter|weather|name|match|mismatch|flip|critter|walk|peek|hide|cheer)\.[a-zA-Z]/.test(s)) return 'raw i18n key';
  if (/\bDee\b|\bforest\b|\bkhu rừng\b/i.test(s)) return 'leftover from Dee';
  return null;
}

let srv, browser;
const ctxOpt = d => ({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
async function open(dev, q = '', opt = {}) {
  const ctx = opt.ctx || await browser.newContext(ctxOpt(dev));
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
async function waitTitle(page) { await page.waitForFunction(() => window.GW && GW.debug && GW.debug.mode === 'title', null, { timeout: 15000 }); }
/* Record every world event (timestamp, world time, phase) and count world.pointerDown calls (proves menu taps never reach it). */
async function installEv(page) {
  await page.evaluate(() => {
    window.__ev = []; window.__downs = 0;
    const w = GW.debug.world;
    if (w.__hooked) return;
    w.__hooked = true;
    const o = w._emit;
    w._emit = function (e) {
      const r = Object.assign({ at: performance.now(), wt: this.time, phase: this.phase, st: this.state }, e);
      delete r.talk; delete r.face; delete r.faceA; delete r.faceB; delete r.building;
      window.__ev.push(r);
      if (e.type === 'talk' && window.__stopBotOnTalk) GW.debug.setBot(false);
      if (e.type === 'play' && window.__playSpeed != null) { GW.debug.setSpeed(window.__playSpeed); window.__playSpeed = null; }   // fast intro, real-time play
      if (e.type === 'play' && window.__stopBotAtRound != null && this.round === window.__stopBotAtRound) GW.debug.setBot(false);
      return o.call(this, e);
    };
    const pd = w.pointerDown;
    w.pointerDown = function (x, y) { window.__downs++; const r = pd.call(this, x, y); window.__lastHit = r; return r; };
  });
}
const evOf = (page, t) => page.evaluate(t => window.__ev.filter(e => e.type === t), t);
const evTypes = page => page.evaluate(() => window.__ev.map(e => e.type));
const clearEv = page => page.evaluate(() => { window.__ev = []; });
const mode = page => page.evaluate(() => GW.debug.mode);
const downs = page => page.evaluate(() => window.__downs);
const voiceN = page => page.evaluate(() => GW.debug.voiceLog.length);
const voiceSince = (page, n) => page.evaluate(n => GW.debug.voiceLog.slice(n).map(l => ({ lang: l.lang, text: l.text })), n);
const lastVoice = page => page.evaluate(() => GW.debug.voiceLog.slice(-1)[0]);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
async function shot(c, name) { try { await c.page.screenshot({ path: path.join(OUT, `${c.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }

/* Windows with state and screen rect (CSS px). */
const wins = page => page.evaluate(() => (GW.debug.world.cards || []).map(c => {
  const s = GW.debug.cardScreen(c.id);
  return { id: c.id, key: c.key, state: c.state, open: c.open, light: c.light, bloom: c.bloom, glow: c.glow, sx: s.x, sy: s.y, sw: s.w, sh: s.h };
}));
const wstate = page => page.evaluate(() => { const w = GW.debug.world; return { state: w.state, phase: w.phase, open: w.open.slice(), mismatches: w.mismatches, streak: w.streak, found: w.found, pairs: w.pairs, round: w.round, level: w.level, stars: w.stars, solved: w.solved, surprise: w.surprise }; });
async function waitPlay(page, timeout = 20000) {
  await page.waitForFunction(() => { const w = GW.debug.world; return GW.debug.mode === 'play' && w.state === 'round' && w.phase === 'play' && w.open.length === 0 && !w.solved && w.cards.some(c => c.state === 'down') && w.cards.every(c => c.state !== 'down' || c.open < 0.5); }, null, { timeout });
  await sleep(60);
}
async function waitState(page, st, timeout = 20000) { await page.waitForFunction(st => GW.debug.world.state === st, st, { timeout }); }
async function tapWin(c, id) {
  const p = await c.page.evaluate(id => GW.debug.cardScreen(id), id);
  if (!p) throw new Error('no window ' + id);
  await c.page.touchscreen.tap(p.x, p.y);
  return p;
}
async function pairDown(page) {
  const cs = (await wins(page)).filter(x => x.state === 'down');
  for (const a of cs) { const b = cs.find(x => x.id !== a.id && x.key === a.key); if (b) return [a, b]; }
  return null;
}
async function mismatchDown(page, avoid = []) {
  const cs = (await wins(page)).filter(x => x.state === 'down' && !avoid.includes(x.id));
  for (const a of cs) { const b = cs.find(x => x.key !== a.key); if (b) return [a, b]; }
  return null;
}
/* Finish the current round by touch: match every remaining pair. */
async function solveRound(c, timeout = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) {
    const s = await wstate(c.page);
    if (s.state !== 'round' || s.solved) return true;
    if (s.phase === 'play' && s.open.length === 1) {   // one window left open (e.g. a tap that landed just after the hide): open its partner
      const ws = await wins(c.page), o = ws.find(x => x.id === s.open[0]), q = o && ws.find(x => x.key === o.key && x.id !== o.id && x.state === 'down');
      if (q) { await tapWin(c, q.id); await sleep(250); continue; }
    }
    if (s.phase !== 'play' || s.open.length) { await sleep(80); continue; }
    const p = await pairDown(c.page);
    if (!p) { await sleep(80); continue; }
    await tapWin(c, p[0].id); await sleep(60); await tapWin(c, p[1].id); await sleep(250);
  }
  return false;
}
const nanCheck = page => page.evaluate(() => {
  const w = GW.debug.world, bad = [];
  const fin = (o, ks, tag) => o && ks.forEach(k => { if (o[k] != null && typeof o[k] === 'number' && !isFinite(o[k])) bad.push(tag + '.' + k + '=' + o[k]); });
  for (const c of w.cards || []) fin(c, ['x', 'y', 'w', 'h', 'open', 'light', 'bloom', 'bounce', 'wiggle', 'glow', '_px', '_py', '_popen'], 'c' + c.id);
  fin(w.gigi, ['headX', 'headY', '_phx', '_phy', 'hop', 'lookX', 'lookY', 'moodT'], 'gigi');
  if (w.critter) fin(w.critter, ['x', 'y', 'rot', 'sx', 'sy', 'swing'], 'critter');
  for (const t of w.traffic || []) fin(t, ['x', 'y', 'vx'], 'car' + t.id);
  fin(w, ['stars', 'wind', 'alpha', 'time', 'scroll', 'scrollT', 'buildingDx', 'cheer'], 'w');
  const hs = document.getElementById('hudStars').textContent;
  if (/NaN|undefined/.test(hs)) bad.push('hudStars=' + hs);
  return bad;
});
/* Layout problems right now (outside the scroll): windows off screen / under the DOM HUD or bubble / overlapping each other,
 * Gigi's head box overlapping (or < 0 px from) a window rect, head off screen. */
const layoutViolations = page => page.evaluate(() => {
  const w = GW.debug.world, v = GW.debug.view(), L = w.layout, out = [];
  if (w.state !== 'round' || w.phase === 'scroll' || !L.grid) return out;
  const dx = w.buildingDx || 0;
  const R = r => ({ l: r.x, t: r.y, r: r.x + r.w, b: r.y + r.h });
  const ov = (a, b, m = 1) => Math.min(a.r, b.r) - Math.max(a.l, b.l) > m && Math.min(a.b, b.b) - Math.max(a.t, b.t) > m;
  const css = r => ({ l: v.left + r.l * v.s, t: v.top + r.t * v.s, r: v.left + r.r * v.s, b: v.top + r.b * v.s });
  const dom = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
  const hud = dom('hud'), bub = dom('bubble');
  const head = R(GW.World.gigiHead(w));
  const ws = w.cards.map(c => ({ id: c.id, r: R({ x: c.x - c.w / 2 + dx, y: c.y - c.h / 2, w: c.w, h: c.h }) }));
  for (const k of ws) {
    const C = css(k.r);
    if (C.l < -1 || C.t < -1 || C.r > innerWidth + 1 || C.b > innerHeight + 1) out.push('window ' + k.id + ' off screen');
    if (hud && ov(C, hud)) out.push('window ' + k.id + ' under HUD');
    if (bub && ov(C, bub)) out.push('window ' + k.id + ' under bubble');
    if (ov(k.r, head, 0)) out.push('Gigi head on window ' + k.id + ' (' + w.phase + ')');
  }
  for (let i = 0; i < ws.length; i++) for (let j = i + 1; j < ws.length; j++) if (ov(ws[i].r, ws[j].r, 0.5)) out.push('windows ' + ws[i].id + '/' + ws[j].id + ' overlap');
  const H = css(head);
  if (H.l < -2 || H.t < -2 || H.r > innerWidth + 2 || H.b > innerHeight + 2) out.push('Gigi head off screen');
  return out;
});
/* Sample layoutViolations for ms milliseconds (head moves through its spring). */
async function sampleLayout(page, ms, every = 60) {
  const set = new Set(); const t0 = Date.now();
  while (Date.now() - t0 < ms) { (await layoutViolations(page)).forEach(x => set.add(x)); await sleep(every); }
  return [...set];
}

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
/* Starts a session; the intro / scroll / peek run at speed 4 unless fast = false, play runs at `speed`. */
async function startGame(c, speed = 1, fast = true) {
  await c.page.evaluate(([s, f]) => { window.__playSpeed = f && s < 4 ? s : null; GW.debug.setSpeed(f ? Math.max(4, s) : s); GW.debug.startGame(); }, [speed, fast]);
}
async function openSettingsByHold(c) {
  const g = await elCenter(c.page, '#btnParents');
  await touch(c.cdp, 'touchStart', [g]); await sleep(2300); await touch(c.cdp, 'touchEnd', []); await sleep(300);
  return visible(c.page, 'scrSettings');
}
const newCtx = (d = DEV.iphoneP) => browser.newContext(ctxOpt(d));
/* Run the bot fast until the given round of the current chapter starts play, then hand back to the finger at speed 1. */
async function botToRound(c, round, timeout = 60000) {
  await c.page.evaluate(r => { window.__stopBotAtRound = r; GW.debug.setBot(true, 1); GW.debug.setSpeed(12); }, round);
  await c.page.waitForFunction(r => { const w = GW.debug.world; return !GW.debug.bot && w.round === r && w.state === 'round' && w.phase === 'play'; }, round, { timeout });
  await c.page.evaluate(() => { window.__stopBotAtRound = null; GW.debug.setSpeed(1); });
  await waitPlay(c.page);
}
async function toTalk(c) {
  await c.page.evaluate(() => { window.__stopBotOnTalk = true; GW.debug.setBot(true, 1); GW.debug.setSpeed(16); });
  await c.page.waitForFunction(() => GW.debug.mode === 'talk' && GW.debug.world.state === 'talk', null, { timeout: 90000 });
  await c.page.evaluate(() => { window.__stopBotOnTalk = false; GW.debug.setBot(false); GW.debug.setSpeed(1); });
  await sleep(300);
}

/* ======================================================================= groups */
async function gBoot() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=3&age=4');
    await sleep(500);
    const st = await c.page.evaluate(() => ({ mode: GW.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      loading: !document.getElementById('loading').classList.contains('hidden'), logo: document.querySelector('.logo').textContent.trim(),
      play: document.getElementById('btnPlay').getBoundingClientRect().toJSON(), W: GW.debug.getState().W, H: GW.debug.getState().H, sw: document.documentElement.scrollWidth, iw: innerWidth, sh: document.documentElement.scrollHeight, ih: innerHeight }));
    check(`boot/${d.name}: title shown, loader gone, logo "Gigi"`, st.mode === 'title' && st.title && !st.loading && /Gigi/.test(st.logo) && /Peekaboo/.test(st.logo), st);
    check(`boot/${d.name}: play button on screen & ≥ 60 px`, st.play.width >= 60 && st.play.left >= 0 && st.play.right <= d.viewport.width && st.play.bottom <= d.viewport.height, st.play);
    check(`boot/${d.name}: logical short side 720`, Math.min(st.W, st.H) === 720, { W: st.W, H: st.H });
    check(`boot/${d.name}: no page scroll`, st.sw <= st.iw + 1 && st.sh <= st.ih + 1, st);
    await c.page.evaluate(() => { window.__playSpeed = 1; GW.debug.setSpeed(4); });
    await tapEl(c, '#btnPlay'); await sleep(400);
    check(`boot/${d.name}: Play (touch) starts the game, HUD shown`, (await mode(c.page)) === 'play' && await visible(c.page, 'hud'), await mode(c.page));
    await waitPlay(c.page).catch(() => {});
    const L = await c.page.evaluate(() => { const g = GW.debug.world.layout.grid; return g && { cw: g.cw, cols: g.cols, rows: g.rows, n: GW.debug.world.cards.length }; });
    check(`boot/${d.name}: first round reaches play with windows ≥ 120 px (age 4)`, L && L.cw >= 120 && L.n >= 4, L);
    const lv = await layoutViolations(c.page);
    check(`boot/${d.name}: windows on screen, clear of HUD/bubble/Gigi's head`, lv.length === 0, lv);
    check(`boot/${d.name}: zero console errors`, c.errors.length === 0, c.errors);
    if (results.some(r => !r.ok && r.name.startsWith(`boot/${d.name}`))) await shot(c, 'boot-fail');
    await c.close();
  }
}

async function gLang() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  const read = () => c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, l2: document.getElementById('logo2').textContent,
    title: document.title, lang: document.documentElement.lang, on: [...document.querySelectorAll('#scrTitle [data-lang]')].filter(b => b.classList.contains('on')).map(b => b.dataset.lang),
    tag: document.getElementById('tagline').textContent, age: document.getElementById('titleAge').textContent, gear: (document.querySelector('.gear-tip') || {}).textContent }));
  const a = await read();
  check('lang: default EN title / logo / document.title', a.lang === 'en' && /Gigi/.test(a.l1) && /Peekaboo Windows/.test(a.l2) && /Gigi/.test(a.title) && a.on.join() === 'en', a);
  check('lang: EN tagline clean', !badText(a.tag), a.tag);
  const n0 = await voiceN(c.page);
  await tapEl(c, '#scrTitle [data-lang="vi"]');
  const b = await read();
  check('lang: VI chip → "Hươu Gigi" / "Mở Cửa Sổ", document.title, html lang', b.lang === 'vi' && b.l1 === 'Hươu Gigi' && /Mở Cửa Sổ/.test(b.l2) && /Hươu Gigi/.test(b.title) && b.on.join() === 'vi', b);
  check('lang: VI tagline / age / gear tip translated', !badText(b.tag) && VI_RE.test(b.tag) && /Tuổi|tuổi/.test(b.age) && b.gear !== a.gear, b);
  const vl = (await voiceSince(c.page, n0)).slice(-1)[0];
  check('lang: switching says a welcome line in VI', vl && vl.lang === 'vi' && !badText(vl.text) && VI_RE.test(vl.text), vl);
  await c.page.reload(); await waitTitle(c.page);
  const r = await read();
  check('lang: VI choice persists across reload (gw:settings)', r.lang === 'vi' && r.l1 === 'Hươu Gigi', r);
  await tapEl(c, '#scrTitle [data-lang="en"]');
  const e = await read();
  check('lang: back to EN', e.lang === 'en' && /Gigi/.test(e.title) && !/Hươu/.test(e.title), e);
  // session-only ?lang=vi
  await c.page.goto(srv.url + '?mute=1&seed=5&lang=vi'); await waitTitle(c.page); await installEv(c.page);
  await startGame(c, 2); await waitPlay(c.page);
  const bub = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
  check('lang: ?lang=vi → Vietnamese prompt in the bubble', VI_RE.test(bub) && !badText(bub), bub);
  await c.page.evaluate(() => GW.debug.setSpeed(1));
  const p = await pairDown(c.page);
  const n1 = await voiceN(c.page);
  await tapWin(c, p[0].id); await sleep(250); await tapWin(c, p[1].id); await sleep(600);
  const fl = await voiceSince(c.page, n1);
  check('lang: VI window name + match lines are Vietnamese and clean', fl.length >= 2 && fl.every(l => l.lang === 'vi' && !badText(l.text)), fl);
  const saved = await c.page.evaluate(() => JSON.parse(localStorage.getItem('gw:settings') || '{}').lang);
  check('lang: ?lang=vi never saved (stored lang still en)', saved === 'en', saved);
  // "Gigi" → "Gi Gi" is a spoken-only rule (VOICE.md §0): the log keeps "Gigi", the TTS text says "Gi Gi"
  const gg = await c.page.evaluate(() => {
    const lines = GW.debug.voiceLog.filter(l => l.lang === 'vi').map(l => l.text);
    const named = lines.filter(t => /Gigi/.test(t));
    const sample = GW.I18N.t('vi', 'ui.welcome');
    return { logHasGiGi: lines.some(t => /Gi Gi/.test(t)), named: named.length, sample, spokenVi: GW.Voice.spoken('vi', 'Mình là hươu cao cổ Gigi'), spokenEn: GW.Voice.spoken('en', "I'm Gigi"), spokenSample: GW.Voice.spoken('vi', sample) };
  });
  check('lang: VI voice log keeps "Gigi" (never "Gi Gi") — log records display text', !gg.logHasGiGi, gg);
  check('lang: VI spoken text says "Gi Gi"; EN keeps "Gigi"', /Gi Gi/.test(gg.spokenVi) && !/\bGigi\b/.test(gg.spokenVi) && /Gigi/.test(gg.spokenEn), gg);
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
  const s1 = await c.page.evaluate(() => ({ gw: JSON.parse(localStorage.getItem('gw:settings') || '{}'), keys: Object.keys(localStorage) }));
  check('settings: saved to localStorage gw:settings', s1.gw.age === 6 && s1.gw.name === 'Mầm' && s1.gw.music === false && s1.gw.lang === 'vi', s1);
  check('settings: every storage key uses the gw: prefix', s1.keys.every(k => k.startsWith('gw:')), s1.keys);
  await tapEl(c, '#btnSettingsDone');
  check('settings: Done returns to title', await visible(c.page, 'scrTitle') && !(await visible(c.page, 'scrSettings')));
  const ageTxt = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('settings: title shows the new age', /6/.test(ageTxt), ageTxt);
  await c.page.reload(); await waitTitle(c.page);
  const st = await c.page.evaluate(() => GW.debug.getState().settings);
  check('settings: persist across reload (age, name, music, lang)', st.age === 6 && st.name === 'Mầm' && st.music === false && st.lang === 'vi', st);
  const chips = await c.page.evaluate(() => { GW.UI.refreshSettings(); return [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age); });
  check('settings: age chip 6 highlighted after reload', chips.join() === '6', chips);
  await installEv(c.page); await startGame(c, 2); await waitPlay(c.page);
  const ws = await c.page.evaluate(() => ({ age: GW.debug.world.age, topics: GW.debug.world.levels, pool6: (GW.AGE_POOLS || {})[6] || [] }));
  check('settings: saved age 6 is played (age-6 topic pool)', ws.age === 6 && ws.topics.length === 4 && ws.topics.every(t => ws.pool6.includes(t)), ws);
  const praise = await c.page.evaluate(() => { const o = []; for (let i = 0; i < 40; i++) o.push(GW.I18N.t('vi', 'great', { child: GW.debug.getState().settings.name })); return o; });
  check('settings: the child\'s name is used in praise', praise.some(l => /Mầm/.test(l)) && praise.every(l => !badText(l)), [...new Set(praise)]);
  check('settings: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gFlags() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1&lang=vi&age=6&speed=2&seed=9&level=1', { ctx });
  const t1 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, ls: localStorage.getItem('gw:settings') }));
  check('flags: ?lang=vi&age=6 applied for the session', t1.l1 === 'Hươu Gigi' && /6/.test(t1.age), t1);
  check('flags: nothing saved just by loading with flags', t1.ls == null, t1.ls);
  await openSettingsByHold(c);
  await tapEl(c, '#scrSettings label.toggle:has(#optSfx)');
  const s2 = await c.page.evaluate(() => JSON.parse(localStorage.getItem('gw:settings') || '{}'));
  check('flags: saving another setting does not store the flag values', s2.lang !== 'vi' && s2.age === 4 && s2.sfx === false && !('speed' in s2) && !('seed' in s2) && !('mute' in s2) && !('level' in s2), s2);
  const chips2 = await c.page.evaluate(() => [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age).join());
  check('flags: settings panel shows the age actually being played (6)', chips2 === '6', chips2);
  await tapEl(c, '#ageChips [data-age="5"]');
  const t5 = await c.page.evaluate(() => ({ title: document.getElementById('titleAge').textContent, saved: JSON.parse(localStorage.getItem('gw:settings')).age }));
  check('flags: a parent picking age 5 wins over ?age=6', /5/.test(t5.title) && t5.saved === 5, t5);
  await tapEl(c, '#ageChips [data-age="4"]');
  await tapEl(c, '#btnSettingsDone');
  await installEv(c.page);
  await c.page.evaluate(() => GW.debug.startGame());
  await sleep(200);
  check('flags: ?level=1 starts at chapter 2', (await c.page.evaluate(() => GW.debug.world.level)) === 1);
  await c.page.goto(srv.url + '?mute=1'); await waitTitle(c.page);
  const t2 = await c.page.evaluate(() => ({ l1: document.getElementById('logo1').textContent, age: document.getElementById('titleAge').textContent, s: GW.debug.getState().settings, sp: GW.debug.getState().speed }));
  check('flags: without flags → saved lang, age 4, normal speed again', t2.l1 === 'Gigi’s' && /4/.test(t2.age) && t2.s.sfx === false && t2.sp === 1, t2);
  check('flags: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

async function gVolume() {
  const ctx = await newCtx();
  const c = await open(DEV.iphoneP, 'mute=1', { ctx });
  await openSettingsByHold(c);
  const sl = await c.page.evaluate(() => { const e = document.getElementById('optVolume'); const r = e.getBoundingClientRect(); return { v: e.value, w: r.width, h: r.height, l: r.left, t: r.top }; });
  check('volume: settings slider present, default 100 %', sl.v === '100' && sl.w >= 120, sl);
  const y = sl.t + sl.h / 2;
  await touch(c.cdp, 'touchStart', [{ x: sl.l + sl.w - 4, y }]); await sleep(50);
  for (let k = 1; k <= 8; k++) { await touch(c.cdp, 'touchMove', [{ x: sl.l + sl.w - 4 - k * (sl.w * 0.7 / 8), y }]); await sleep(25); }
  await touch(c.cdp, 'touchEnd', []); await sleep(200);
  const rd = () => c.page.evaluate(() => ({ el: +document.getElementById('optVolume').value, S: GW.debug.getState().settings.volume, A: GW.Audio.volume, saved: JSON.parse(localStorage.getItem('gw:settings') || '{}').volume }));
  let v = await rd();
  if (v.el === 100) {   // headless chromium may not move a range input with touch: set it as a finger would
    console.log('      (touch drag did not move the range input in headless chromium; falling back to input events)');
    await c.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 30; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    v = await rd();
  }
  const wantV = v.el / 100;
  check('volume: slider → settings.volume, saved, GW.Audio.volume follows', v.el < 100 && Math.abs(v.S - wantV) < 1e-6 && Math.abs(v.saved - wantV) < 1e-6 && Math.abs(v.A - wantV) < 1e-6, v);
  check('volume: speech volume follows', Math.abs((await c.page.evaluate(() => GW.Voice._volume)) - wantV) < 1e-6);
  const g = await c.page.evaluate(async () => { const A = GW.debug.audio(); A.unlock(); await new Promise(r => setTimeout(r, 400)); return A.user ? { gain: A.user.gain.value, vol: A.volume, chain: !!A.ctx && !!A.master && !!A.user && !!A.sfx && !!A.music } : null; });
  check('volume: GW.Audio chain sfx/music → master → compressor → user gain exists', g && g.chain, g);
  check('volume: user gain = volume × 1.6 makeup', g && Math.abs(g.gain - g.vol * 1.6) < 0.05, g);
  await tapEl(c, '#btnSettingsDone');
  await c.page.reload(); await waitTitle(c.page);
  const r = await c.page.evaluate(() => ({ S: GW.debug.getState().settings.volume, A: GW.Audio.volume, el: +document.getElementById('optVolume').value }));
  check('volume: persists across reload (setting, audio, slider)', Math.abs(r.S - wantV) < 1e-6 && Math.abs(r.A - wantV) < 1e-6 && r.el === Math.round(wantV * 100), r);
  await installEv(c.page); await startGame(c, 1); await waitPlay(c.page);
  await tapEl(c, '#btnPause'); await sleep(200);
  const lv0 = await c.page.evaluate(() => document.getElementById('volLevel').textContent);
  check('volume: pause menu shows the level', lv0 === Math.round(wantV * 100) + '%', lv0);
  const vb = await c.page.evaluate(() => ['btnVolDown', 'btnVolUp'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { w: r.width, h: r.height }; }));
  check('volume: − / + buttons ≥ 44 px', vb.every(b => b.w >= 44 && b.h >= 44), vb);
  await tapEl(c, '#btnVolUp'); await tapEl(c, '#btnVolUp'); await sleep(100);
  const up = await c.page.evaluate(() => ({ S: GW.debug.getState().settings.volume, A: GW.Audio.volume, saved: JSON.parse(localStorage.getItem('gw:settings')).volume, lv: document.getElementById('volLevel').textContent }));
  const exp = Math.min(1, Math.round((wantV + 0.2) * 10) / 10);
  check('volume: + + raises the volume by 20 %, saved, audio follows', Math.abs(up.S - exp) < 1e-6 && Math.abs(up.A - exp) < 1e-6 && Math.abs(up.saved - exp) < 1e-6 && up.lv === Math.round(exp * 100) + '%', up);
  for (let k = 0; k < 8; k++) await tapEl(c, '#btnVolDown');
  const dn = await c.page.evaluate(() => ({ S: GW.debug.getState().settings.volume, A: GW.Audio.volume, lv: document.getElementById('volLevel').textContent }));
  check('volume: − clamps at 0 %', dn.S === 0 && dn.A === 0 && dn.lv === '0%', dn);
  for (let k = 0; k < 11; k++) await tapEl(c, '#btnVolUp');
  await tapEl(c, '#btnVolDown'); await sleep(150);
  const gg = await c.page.evaluate(async () => { await new Promise(r => setTimeout(r, 300)); return { gain: GW.Audio.user && GW.Audio.user.gain.value, vol: GW.Audio.volume, slider: +document.getElementById('optVolume').value }; });
  check('volume: + clamps at 100 %, then − → 90 %, user gain 1.44, slider follows', gg.vol === 0.9 && Math.abs(gg.gain - 1.44) < 0.05 && gg.slider === 90, gg);
  check('volume: pause −/+ taps never reach the canvas', (await downs(c.page)) === 0, await downs(c.page));
  check('volume: still paused after −/+', (await mode(c.page)) === 'paused');
  await c.page.reload(); await waitTitle(c.page);
  check('volume: pause-menu volume persists across reload', (await c.page.evaluate(() => GW.debug.getState().settings.volume)) === 0.9);
  check('volume: zero console errors', c.errors.length === 0, c.errors);
  await ctx.close();
}

/* Phase order scroll → peek → hide → play; taps during scroll / peek / hide are ignored. */
async function gPhases() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=12&age=4');
  await startGame(c, 1, false);
  const seen = {};
  const t0 = Date.now();
  while (Date.now() - t0 < 15000) {
    const s = await wstate(c.page);
    if (s.state === 'round' && ['scroll', 'peek', 'hide'].includes(s.phase) && !seen[s.phase]) {
      seen[s.phase] = true;
      const cs = await wins(c.page);
      const n = (await c.page.evaluate(() => window.__ev.length));
      for (const k of cs.slice(0, 3)) await c.page.touchscreen.tap(k.sx, k.sy);
      await sleep(20);
      const ev = await c.page.evaluate(n => window.__ev.slice(n).filter(e => ['flip', 'tap', 'match', 'mismatch'].includes(e.type) && !['play', 'resolve'].includes(e.phase)).map(e => e.type + '@' + e.phase), n);
      check(`phases: taps during ${s.phase} are ignored`, ev.length === 0, ev);
    }
    if (s.phase === 'play') break;
    await sleep(30);
  }
  check('phases: saw scroll, peek and hide before play', seen.scroll && seen.peek && seen.hide, seen);
  const order = (await evTypes(c.page)).filter(t => ['scroll', 'round', 'peek', 'hide', 'play'].includes(t));
  check('phases: event order scroll → round → peek → hide → play', order.slice(0, 5).join() === 'scroll,round,peek,hide,play', order);
  const sc = (await evOf(c.page, 'scroll'))[0];
  check('phases: first scroll of the session is first:true', sc && sc.first === true, sc);
  await c.page.waitForFunction(() => GW.debug.world.phase === 'play', null, { timeout: 8000 }).catch(() => {});
  await sleep(300);
  const all = await wins(c.page);
  check('phases: every window closed at play start (unless tapped late)', all.filter(k => k.state === 'down').every(k => k.open < 0.5), all.map(k => [k.id, k.state, +k.open.toFixed(2)]));
  check('phases: footsteps during the scroll (walk events)', (await evOf(c.page, 'walk')).length >= 3);
  await clearEv(c.page);
  await solveRound(c);
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'cheer'), null, { timeout: 5000 }).catch(() => {});
  const cs = await wins(c.page);
  const nb = await c.page.evaluate(() => window.__ev.length);
  if (cs.length) await c.page.touchscreen.tap(cs[0].sx, cs[0].sy);
  await sleep(50);
  const after = await c.page.evaluate(n => window.__ev.slice(n).filter(e => e.type === 'flip' || e.type === 'mismatch').length, nb);
  check('phases: cheer after the last pair, a tap in the cheer opens nothing', (await evOf(c.page, 'cheer')).length === 1 && after === 0, after);
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'scroll'), null, { timeout: 8000 }).catch(() => {});
  const order2 = (await evTypes(c.page)).filter(t => ['match', 'cheer', 'roundDone', 'scroll', 'round'].includes(t));
  check('phases: last match → cheer → roundDone → scroll (next building)', /match,cheer,roundDone,scroll/.test(order2.join()), order2);
  const sc2 = (await evOf(c.page, 'scroll'))[0];
  check('phases: 2nd scroll has first:false (old building leaves)', sc2 && sc2.first === false, sc2);
  check('phases: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Matching pair by real touch: opens on touch-down, match, both stay matched (lit, flowers), never gone. */
async function gPair() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=13&age=4');
    await startGame(c, 1); await waitPlay(c.page);
    const tag = `pair/${d.name}`;
    const [a, b] = await pairDown(c.page);
    await clearEv(c.page);
    const n0 = await voiceN(c.page);
    // touch-DOWN only: the window opens before the finger lifts
    await touch(c.cdp, 'touchStart', [{ x: a.sx, y: a.sy }]); await sleep(40);
    const f = await evOf(c.page, 'flip');
    check(`${tag}: window opens on touch-down (flip before touchEnd)`, f.length === 1 && f[0].id === a.id && f[0].open === 1, f);
    await touch(c.cdp, 'touchEnd', []);
    await sleep(250);
    const a1 = (await wins(c.page)).find(x => x.id === a.id);
    check(`${tag}: shutters swung open (open ≥ 0.9, state up)`, a1.state === 'up' && a1.open >= 0.9, a1);
    const lines = await voiceSince(c.page, n0);
    check(`${tag}: Gigi names the window (voice line)`, lines.length >= 1 && lines.every(l => !badText(l.text)), lines);
    await tapWin(c, b.id);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'match'), null, { timeout: 3000 }).catch(() => {});
    const m = await evOf(c.page, 'match');
    check(`${tag}: match event for the pair`, m.length === 1 && [m[0].a, m[0].b].sort().join() === [a.id, b.id].sort().join() && m[0].found === 1, m);
    check(`${tag}: no mismatch`, (await evOf(c.page, 'mismatch')).length === 0);
    await sleep(1200);
    const ab = (await wins(c.page)).filter(x => x.id === a.id || x.id === b.id);
    check(`${tag}: both windows stay "matched" (not gone), lamps on, flowers bloomed`, ab.length === 2 && ab.every(x => x.state === 'matched' && x.light > 0.9 && x.bloom > 0.5 && x.open > 0.9), ab);
    const bl = await evOf(c.page, 'bloom');
    check(`${tag}: two bloom events (pop-pop)`, bl.length === 2, bl.length);
    check(`${tag}: no removed-event types (deal/reward/land/gone)`, !(await evTypes(c.page)).some(t => ['deal', 'reward', 'land', 'gone'].includes(t)));
    const st = await wstate(c.page);
    check(`${tag}: open list empty, phase back to play`, st.open.length === 0 && st.phase === 'play' && st.found === 1, st);
    check(`${tag}: layout clean (windows / Gigi's head)`, (await sampleLayout(c.page, 400)).length === 0, await layoutViolations(c.page));
    check(`${tag}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    if (results.some(r => !r.ok && r.name.startsWith(tag))) await shot(c, 'pair-fail');
    await c.close();
  }
}

/* Mismatching pair → mismatch, both stay open for 1.0 s (age 3: 1.2 s) then clack shut. */
async function gMismatch() {
  for (const [d, age] of [[DEV.iphoneP, 3], [DEV.ipadL, 4]]) {
    const c = await open(d, `mute=1&seed=17&age=${age}`);
    await startGame(c, 1); await waitPlay(c.page);
    const tag = `mismatch/${d.name} age${age}`;
    const [a, b] = await mismatchDown(c.page);
    await clearEv(c.page);
    const n0 = await voiceN(c.page);
    await tapWin(c, a.id); await sleep(150); await tapWin(c, b.id);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'mismatch'), null, { timeout: 3000 }).catch(() => {});
    const mm = await evOf(c.page, 'mismatch');
    check(`${tag}: mismatch event`, mm.length === 1 && mm[0].mismatches === 1 && mm[0].streak === 1, mm);
    await sleep(400);
    const mid = (await wins(c.page)).filter(x => x.id === a.id || x.id === b.id).map(x => x.state + ':' + x.open.toFixed(2));
    check(`${tag}: both stay open while the mismatch shows`, mid.every(s => s.startsWith('up')), mid);
    const lines = await voiceSince(c.page, n0);
    check(`${tag}: kind voice lines (no negative words)`, lines.length >= 2 && lines.every(l => !badText(l.text) && !/\b(no|wrong|bad|sai|không đúng)\b/i.test(l.text)), lines);
    const show = age === 3 ? 1.2 : 1.0, t0 = mm[0].wt;
    await c.page.waitForFunction(([a, b]) => GW.debug.world.cardById(a).state === 'down' && GW.debug.world.cardById(b).state === 'down', [a.id, b.id], { timeout: 5000 }).catch(() => {});
    const tDown = await c.page.evaluate(() => GW.debug.world.time);
    check(`${tag}: close after ≈ ${show} s`, tDown - t0 >= show - 0.05 && tDown - t0 < show + 0.3, tDown - t0);
    await sleep(600);
    const end = (await wins(c.page)).filter(x => x.id === a.id || x.id === b.id).map(x => x.state + ':' + x.open.toFixed(2));
    const st = await wstate(c.page);
    check(`${tag}: both shut again, open empty, phase play`, end.every(s => s.startsWith('down') && Math.abs(parseFloat(s.split(':')[1])) < 0.1) && st.open.length === 0 && st.phase === 'play', { end, st });
    const cl = (await evOf(c.page, 'clack')).filter(e => e.id === a.id || e.id === b.id);
    check(`${tag}: two clacks when the shutters hit shut (v ≥ 4)`, cl.length === 2 && cl.every(e => e.v >= 4), cl);
    await clearEv(c.page);
    await tapWin(c, a.id); await sleep(50);
    check(`${tag}: next tap opens normally`, (await evOf(c.page, 'flip')).length === 1);
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Third-tap reset rule + a pending match is never broken. */
async function gThird() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=23&age=5');
  await startGame(c, 1); await waitPlay(c.page);
  {
    const [a, b] = await mismatchDown(c.page);
    const k = (await wins(c.page)).find(x => x.state === 'down' && x.id !== a.id && x.id !== b.id);
    await clearEv(c.page);
    await tapWin(c, a.id); await sleep(40); await tapWin(c, b.id); await sleep(150); await tapWin(c, k.id); await sleep(60);
    const cs = await wins(c.page), S = id => cs.find(x => x.id === id).state;
    check('third: an early 3rd tap (< 0.5 s of mismatch) is ignored', S(a.id) === 'up' && S(b.id) === 'up' && S(k.id) === 'down', { a: S(a.id), b: S(b.id), k: S(k.id) });
    await waitPlay(c.page, 5000).catch(() => {});
  }
  {
    const [a, b] = await mismatchDown(c.page);
    const k = (await wins(c.page)).find(x => x.state === 'down' && x.id !== a.id && x.id !== b.id);
    await clearEv(c.page);
    const m0 = (await wstate(c.page)).mismatches;
    await tapWin(c, a.id); await sleep(60); await tapWin(c, b.id);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'mismatch'), null, { timeout: 3000 }).catch(() => {});
    await sleep(650);
    const ph = (await wstate(c.page)).phase;
    await tapWin(c, k.id); await sleep(60);
    const st = await wstate(c.page), cs = await wins(c.page), S = id => cs.find(x => x.id === id).state;
    check('third: 3rd tap after 0.5 s of mismatch → A, B close at once, C opens, phase play', ph === 'resolve' && S(a.id) === 'down' && S(b.id) === 'down' && S(k.id) === 'up' && st.open.join() === String(k.id) && st.phase === 'play', { ph, st });
    check('third: the mismatch is counted once', st.mismatches === m0 + 1 && (await evOf(c.page, 'mismatch')).length === 1, st.mismatches - m0);
  }
  check('third: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
  const c2 = await open(DEV.ipadP, 'mute=1&seed=19&age=5');
  await startGame(c2, 1); await waitPlay(c2.page);
  const [p, q] = await pairDown(c2.page);
  const r = (await wins(c2.page)).find(x => x.state === 'down' && x.key !== p.key);
  await clearEv(c2.page);
  await tapWin(c2, p.id); await sleep(40); await tapWin(c2, q.id); await sleep(30); await tapWin(c2, r.id); await sleep(100);
  const fl = (await evOf(c2.page, 'flip')).map(e => e.id);
  check('third: a 3rd tap during a pending match is ignored', fl.length === 2 && !fl.includes(r.id), fl);
  await sleep(500);
  check('third: the pending match is confirmed', (await evOf(c2.page, 'match')).length === 1);
  await clearEv(c2.page);
  await tapWin(c2, r.id); await sleep(80);
  check('third: the window ignored during the match opens on the next tap', (await evOf(c2.page, 'flip')).length === 1);
  check('third: zero console errors (2)', c2.errors.length === 0, c2.errors);
  await c2.close();
}

/* Tapping an open window / a matched window says its name again; it never changes anything. */
async function gTapOpen() {
  const c = await open(DEV.iphoneP, 'mute=1&seed=20&age=4');
  await startGame(c, 1); await waitPlay(c.page);
  const k = (await wins(c.page)).find(x => x.state === 'down');
  await clearEv(c.page);
  await tapWin(c, k.id); await sleep(40); await tapWin(c, k.id); await sleep(100);
  let st = await wstate(c.page);
  check('tapopen: double-tap on one window → exactly one flip, no mismatch', (await evOf(c.page, 'flip')).length === 1 && st.open.length === 1 && st.mismatches === 0, st);
  await sleep(1200);
  await clearEv(c.page);
  const n0 = await voiceN(c.page);
  await tapWin(c, k.id); await sleep(150);
  const tp = await evOf(c.page, 'tap');
  st = await wstate(c.page);
  const kk = (await wins(c.page)).find(x => x.id === k.id);
  check('tapopen: tap on an open window → tap event (name again)', tp.length === 1 && tp[0].id === k.id && tp[0].nameKind != null, tp);
  check('tapopen: state unchanged (still up, still the only open one)', kk.state === 'up' && st.open.join() === String(k.id) && (await evOf(c.page, 'flip')).length === 0, { kk: kk.state, open: st.open });
  const lines = await voiceSince(c.page, n0);
  check('tapopen: Gigi says its name again', lines.length >= 1 && lines.every(l => !badText(l.text)), lines);
  const partner = (await wins(c.page)).find(x => x.key === k.key && x.id !== k.id);
  await tapWin(c, partner.id);
  await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'match'), null, { timeout: 3000 }).catch(() => {});
  await sleep(1000);
  await clearEv(c.page);
  const n1 = await voiceN(c.page);
  await tapWin(c, k.id); await sleep(150);
  const ev = await evTypes(c.page);
  check('tapopen: tap on a matched window → tap only (no flip / mismatch)', ev.includes('tap') && !ev.includes('flip') && !ev.includes('mismatch'), ev);
  check('tapopen: matched window still matched', (await wins(c.page)).find(x => x.id === k.id).state === 'matched');
  check('tapopen: matched window name is said again', (await voiceSince(c.page, n1)).length >= 1, await voiceSince(c.page, n1));
  // 3 taps on the one open window → auto hint
  const k2 = (await wins(c.page)).find(x => x.state === 'down');
  await clearEv(c.page);
  await tapWin(c, k2.id); await sleep(1000);
  for (let i = 0; i < 3; i++) { await tapWin(c, k2.id); await sleep(1000); }
  check('tapopen: 3 extra taps on the same open window → a hint', (await evOf(c.page, 'hint')).length >= 1, await evTypes(c.page));
  check('tapopen: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Tapping Gigi (body / head) or the bubble repeats the prompt word for word. */
async function gGigi() {
  for (const d of [DEV.iphoneL, DEV.ipadP]) {
    const c = await open(d, 'mute=1&seed=61&age=4');
    await startGame(c, 1); await waitPlay(c.page);
    const tag = `gigi/${d.name}`;
    const prompt = await c.page.evaluate(() => document.getElementById('bubbleText').textContent);
    const G = await c.page.evaluate(() => GW.debug.gigiScreen());
    const body = { x: G.body.x + G.body.w * 0.5, y: G.body.y + G.body.h * 0.7 };
    await sleep(3500);   // let the queued peek / hide lines go by
    const n0 = await voiceN(c.page);
    await clearEv(c.page);
    await c.page.touchscreen.tap(body.x, body.y); await sleep(250);
    const lines = await voiceSince(c.page, n0);
    const hit = await c.page.evaluate(() => window.__lastHit);
    check(`${tag}: tap on Gigi's body → pointerDown returns 'gigi'`, hit === 'gigi', hit);
    check(`${tag}: tap on Gigi repeats the prompt (voice line = bubble)`, lines.length >= 1 && lines[lines.length - 1].text === prompt, { lines, prompt });
    check(`${tag}: tap on Gigi opens no window`, (await evOf(c.page, 'flip')).length === 0);
    check(`${tag}: Gigi looks thoughtful`, (await c.page.evaluate(() => GW.debug.world.gigi.mood)) === 'think');
    const H = await c.page.evaluate(() => GW.debug.gigiScreen().head);
    const n1 = await voiceN(c.page);
    await c.page.touchscreen.tap(H.x + H.w / 2, H.y + H.h / 2); await sleep(250);
    const hl = await voiceSince(c.page, n1);
    check(`${tag}: tap on Gigi's head repeats the prompt`, (await c.page.evaluate(() => window.__lastHit)) === 'gigi' && hl.length >= 1 && hl[hl.length - 1].text === prompt, { hl, hit: await c.page.evaluate(() => window.__lastHit) });
    const n2 = await voiceN(c.page), d0 = await downs(c.page);
    await tapEl(c, '#bubble'); await sleep(250);
    const l2 = await voiceSince(c.page, n2);
    check(`${tag}: tap on the bubble repeats the prompt`, l2.length >= 1 && l2[l2.length - 1].text === prompt, l2);
    check(`${tag}: bubble tap never reaches the world`, (await downs(c.page)) === d0);
    for (let i = 0; i < 8; i++) { await c.page.touchscreen.tap(body.x, body.y); await sleep(40); }
    check(`${tag}: zero console errors (incl. rapid Gigi taps)`, c.errors.length === 0, c.errors);
    await c.close();
  }
}

/* Surprise round (round index 2): find each critter type, tap it with a real finger. */
async function gCritter() {
  const found = {};
  for (let seed = 301; seed < 309 && Object.keys(found).length < 3; seed++) {
    const c = await open(DEV.iphoneL, `mute=1&seed=${seed}&age=4`);
    await startGame(c, 4);
    await botToRound(c, 2);
    const s = await wstate(c.page);
    const type = s.surprise;
    if (!type || found[type]) { if (!type) check(`critter/seed${seed}: round index 2 is a surprise round`, false, s); await c.close(); continue; }
    found[type] = true;
    const tag = `critter/${type}`;
    const rounds = await c.page.evaluate(() => window.__ev.filter(e => e.type === 'round').map(e => e.surprise));
    check(`${tag}: only round index 2 of the chapter has a surprise`, rounds.length === 3 && rounds[0] == null && rounds[1] == null && rounds[2] === type, rounds);
    // main protects the round prompt for 300 + 72·len ms of wall time (speakPrompt): a critter line inside it is skipped by design
    await c.page.evaluate(() => GW.debug.setSpeed(0.25));
    await c.page.waitForFunction(() => { const r = window.__ev.filter(e => e.type === 'round').pop(); const t = document.getElementById('bubbleText').textContent;
      return r && performance.now() - r.at > 450 + 72 * t.length; }, null, { timeout: 15000 }).catch(() => {});
    await c.page.evaluate(() => GW.debug.setSpeed(3));
    const ok = await c.page.waitForFunction(() => { const k = GW.debug.world.critter; if (!k) return false;
      return (k.type === 'pigeon' && k.state === 'sit') || (k.type === 'bus' && k.state === 'stop') || (k.type === 'balloon' && k.state === 'rise' && k.t > 0.8); }, null, { timeout: 15000 }).then(() => true).catch(() => false);
    check(`${tag}: appears and settles (enter event)`, ok && (await evOf(c.page, 'critter')).some(e => e.action === 'enter' && e.critter === type), await evOf(c.page, 'critter'));
    await c.page.evaluate(() => GW.debug.setSpeed(1));
    if (!ok) { await shot(c, `critter-${type}-fail`); await c.close(); continue; }
    const R = await c.page.evaluate(() => GW.debug.critterScreen());
    await clearEv(c.page);
    const n0 = await voiceN(c.page), st0 = await wstate(c.page);
    const idle0 = await c.page.evaluate(() => GW.debug.world._idleT);
    await c.page.touchscreen.tap(R.x + R.w / 2, R.y + R.h / 2); await sleep(200);
    const hit = await c.page.evaluate(() => window.__lastHit);
    const ce = await evOf(c.page, 'critter');
    check(`${tag}: real tap on critterScreen() → 'critter' + critter tap event`, hit === 'critter' && ce.some(e => e.action === 'tap' && e.critter === type), { hit, ce, R });
    const ev = await evTypes(c.page), st1 = await wstate(c.page);
    check(`${tag}: a critter tap is never a mistake (no flip / mismatch, counts unchanged)`, !ev.includes('flip') && !ev.includes('mismatch') && st1.mismatches === st0.mismatches && st1.open.length === st0.open.length, { ev, st0, st1 });
    const idle1 = await c.page.evaluate(() => GW.debug.world._idleT);
    check(`${tag}: critter tap does not reset the idle timer`, idle1 >= idle0, { idle0, idle1 });
    const lines = await voiceSince(c.page, n0);
    check(`${tag}: a tap reaction line`, lines.length >= 1 && lines.every(l => !badText(l.text)), lines);
    if (type !== 'bus') {
      await sleep(300);
      check(`${tag}: tapped ${type} leaves (away / gone)`, await c.page.evaluate(() => { const k = GW.debug.world.critter; return !k || k.state === 'away' || k.state === 'gone'; }));
    } else check(`${tag}: bus honks (honk > 0)`, await c.page.evaluate(() => { const k = GW.debug.world.critter; return !!k && k.honk > 0; }));
    // play continues: open a pair with touch
    await waitPlay(c.page, 5000).catch(() => {});
    const p = await pairDown(c.page);
    await clearEv(c.page);
    await tapWin(c, p[0].id); await sleep(150); await tapWin(c, p[1].id); await sleep(400);
    check(`${tag}: windows still play normally after the critter`, (await evOf(c.page, 'match')).length === 1, await evTypes(c.page));
    check(`${tag}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    await c.close();
  }
  check('critter: all three surprise types exercised (pigeon, bus, balloon)', found.pigeon && found.bus && found.balloon, found);
}

async function gTalk() {
  const c = await open(DEV.iphoneL, 'mute=1&seed=71&age=4');
  await startGame(c, 2);
  await toTalk(c);
  check('talk: Talk time screen opens after the chapter', await visible(c.page, 'scrTalk'));
  const tk = await c.page.evaluate(() => { const t = GW.debug.world.talk; return { answerId: t.answerId, ids: t.choices.map(c => c.id), q: document.getElementById('talkQ').textContent, btns: [...document.querySelectorAll('#talkChoices button')].map(b => ({ id: b.dataset.id, w: b.getBoundingClientRect().width, h: b.getBoundingClientRect().height })) }; });
  check('talk: 2–4 choice buttons, ≥ 64 px', tk.btns.length >= 2 && tk.btns.length <= 4 && tk.btns.every(b => b.w >= 64 && b.h >= 64), tk.btns);
  check('talk: question text clean', !badText(tk.q), tk.q);
  const s0 = await c.page.evaluate(() => GW.debug.world.stars);
  await clearEv(c.page);
  const d0 = await downs(c.page);
  await tapEl(c, `#talkChoices button[data-id="${tk.answerId}"]`); await sleep(300);
  const tr = await evOf(c.page, 'talkResult');
  check('talk: right answer by tap → talkResult correct', tr.length === 1 && tr[0].correct === true, tr);
  check('talk: +1 star', (await c.page.evaluate(() => GW.debug.world.stars)) === s0 + 1);
  check('talk: right button marked', await c.page.evaluate(id => document.querySelector(`#talkChoices button[data-id="${id}"]`).classList.contains('right'), String(tk.answerId)));
  check('talk: choice taps never reach the canvas', (await downs(c.page)) === d0);
  const other = tk.ids.find(i => i !== tk.answerId);
  await tapEl(c, `#talkChoices button[data-id="${other}"]`); await sleep(200);
  check('talk: a second answer is ignored', (await evOf(c.page, 'talkResult')).length === 1);
  await c.page.evaluate(() => GW.debug.setSpeed(4));
  await c.page.waitForFunction(() => GW.debug.world.level === 1 && GW.debug.mode === 'play', null, { timeout: 10000 }).catch(() => {});
  check('talk: next chapter starts, talk screen closed', (await c.page.evaluate(() => GW.debug.world.level)) === 1 && !(await visible(c.page, 'scrTalk')) && (await mode(c.page)) === 'play');
  await toTalk(c);
  const tk2 = await c.page.evaluate(() => { const t = GW.debug.world.talk; return { answerId: t.answerId, ids: t.choices.map(c => c.id) }; });
  await clearEv(c.page);
  const wrongId = tk2.ids.find(i => i !== tk2.answerId), s1 = await c.page.evaluate(() => GW.debug.world.stars);
  await tapEl(c, `#talkChoices button[data-id="${wrongId}"]`); await sleep(300);
  const tr2 = await evOf(c.page, 'talkResult');
  check('talk: wrong answer → correct:false, no star lost, right answer shown', tr2.length === 1 && tr2[0].correct === false && (await c.page.evaluate(() => GW.debug.world.stars)) === s1 && await c.page.evaluate(id => document.querySelector(`#talkChoices button[data-id="${id}"]`).classList.contains('right'), String(tk2.answerId)), tr2);
  const wl = await lastVoice(c.page);
  check('talk: wrong-answer line is kind and clean', wl && !badText(wl.text), wl);
  await c.page.evaluate(() => GW.debug.setSpeed(4));
  await c.page.waitForFunction(() => GW.debug.world.level === 2, null, { timeout: 10000 }).catch(() => {});
  check('talk: game goes on after a wrong answer', (await c.page.evaluate(() => GW.debug.world.level)) === 2);
  check('talk: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

async function gPause() {
  const c = await open(DEV.iphoneP, 'mute=1&seed=81&age=4');
  await startGame(c, 1); await waitPlay(c.page);
  const d0 = await downs(c.page);
  await tapEl(c, '#btnPause'); await sleep(300);
  check('pause: HUD pause button → paused screen', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  check('pause: the HUD tap did not reach the canvas', (await downs(c.page)) === d0);
  const t0 = await c.page.evaluate(() => GW.debug.world.time);
  await sleep(700);
  const t1 = await c.page.evaluate(() => GW.debug.world.time);
  check('pause: world frozen while paused', t1 === t0, { t0, t1 });
  const pr = await c.page.evaluate(() => { const r = document.querySelector('#scrPause .panel').getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; });
  const k = (await wins(c.page)).find(x => x.state === 'down' && !(x.sx > pr.l - 10 && x.sx < pr.r + 10 && x.sy > pr.t - 10 && x.sy < pr.b + 10)) || { sx: 8, sy: 300 };
  await clearEv(c.page);
  await c.page.touchscreen.tap(k.sx, k.sy); await sleep(150);
  check('pause: tapping a window behind the pause screen opens nothing', (await evOf(c.page, 'flip')).length === 0 && (await mode(c.page)) === 'paused');
  await tapEl(c, '#btnResume'); await sleep(300);
  check('pause: Resume → play', (await mode(c.page)) === 'play' && !(await visible(c.page, 'scrPause')));
  check('pause: Resume tap did not reach the canvas', (await downs(c.page)) === d0);
  await sleep(300);
  check('pause: world runs again', (await c.page.evaluate(() => GW.debug.world.time)) > t1);
  const kd = (await wins(c.page)).find(x => x.state === 'down');
  await clearEv(c.page); await tapWin(c, kd.id); await sleep(150);
  check('pause: taps work after resume', (await evOf(c.page, 'flip')).length === 1);
  const hide = h => c.page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await sleep(200);
  check('visibility: hidden → paused', (await mode(c.page)) === 'paused');
  const open0 = (await wstate(c.page)).open;
  await hide(false); await sleep(300);
  check('visibility: back → stays on the pause screen (child resumes)', (await mode(c.page)) === 'paused' && await visible(c.page, 'scrPause'));
  await tapEl(c, '#btnResume'); await sleep(200);
  check('visibility: resume works, the open window is still open', (await mode(c.page)) === 'play' && (await wstate(c.page)).open.join() === open0.join(), { open0 });
  await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(300);
  check('pause: Home → title', (await mode(c.page)) === 'title' && await visible(c.page, 'scrTitle'));
  await tapEl(c, '#btnPlay'); await sleep(300);
  check('pause: Play from title after Home → fresh session', (await mode(c.page)) === 'play' && (await c.page.evaluate(() => GW.debug.world.level)) === 0 && (await c.page.evaluate(() => GW.debug.world.stars)) === 0);
  await toTalk(c);
  await hide(true); await sleep(200); await hide(false);
  check('pause: visibility pause during Talk time', (await mode(c.page)) === 'paused');
  await tapEl(c, '#btnResume'); await sleep(200);
  check('pause: resume returns to Talk time', (await mode(c.page)) === 'talk' && await visible(c.page, 'scrTalk'));
  check('pause: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Rotate mid-round: windows re-laid out on screen, no overlaps, Gigi's head never on a window, taps still work. */
async function gRotate() {
  const pairsV = [[DEV.iphoneP, DEV.iphoneL], [DEV.iphoneL, DEV.iphoneP], [DEV.ipadL, DEV.ipadP], [DEV.ipadP, DEV.ipadL]];
  for (const [a, b] of pairsV) {
    const c = await open(a, `mute=1&seed=91&age=5`);
    await startGame(c, 1); await waitPlay(c.page);
    const tag = `rotate/${a.name}→${b.name}`;
    const p = await pairDown(c.page);
    await tapWin(c, p[0].id); await sleep(100); await tapWin(c, p[1].id); await sleep(700);
    await waitPlay(c.page);
    const op = (await wins(c.page)).find(x => x.state === 'down');
    await tapWin(c, op.id); await sleep(300);
    const before = await wstate(c.page);
    await c.page.setViewportSize(b.viewport); await sleep(350);
    const st = await c.page.evaluate(() => { const w = GW.debug.world, L = w.layout; return { W: L.W, H: L.H, cw: L.grid && L.grid.cw, state: w.state, round: w.round, found: w.found, open: w.open.slice(), cards: w.cards.map(c => ({ id: c.id, state: c.state, open: c.open })) }; });
    const landscape = b.viewport.width > b.viewport.height;
    check(`${tag}: world re-laid out to the new shape`, landscape ? st.W > st.H : st.H > st.W, { W: st.W, H: st.H });
    check(`${tag}: same round, found pairs kept`, st.round === before.round && st.found === before.found && st.state === 'round', { before, st });
    check(`${tag}: open window keeps its state, matched stay matched`, st.open.join() === String(op.id) && st.cards.find(x => x.id === op.id).state === 'up' && st.cards.filter(x => x.state === 'matched').length === 2, st.cards);
    check(`${tag}: windows ≥ 104 px`, st.cw >= 104, st.cw);
    const lv = await sampleLayout(c.page, 400);
    check(`${tag}: windows on screen, no overlaps, clear of HUD/bubble, Gigi's head never on a window`, lv.length === 0, lv);
    await clearEv(c.page);
    const partner = (await wins(c.page)).find(x => x.key === op.key && x.id !== op.id);
    await tapWin(c, partner.id);
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'match'), null, { timeout: 3000 }).catch(() => {});
    check(`${tag}: real tap after rotation matches the open window's partner`, (await evOf(c.page, 'match')).length === 1);
    const lv2 = await sampleLayout(c.page, 350);
    check(`${tag}: head stays off the windows while it stretches after the rotation`, lv2.length === 0, lv2);
    // rotate back while the head is stretched toward a window
    await waitPlay(c.page, 5000).catch(() => {});
    const k3 = (await wins(c.page)).find(x => x.state === 'down');
    if (k3) { await tapWin(c, k3.id); await sleep(150); }
    await c.page.setViewportSize(a.viewport); await sleep(400);
    const lv3 = await sampleLayout(c.page, 350);
    check(`${tag}: rotate back with the head stretched → still clean`, lv3.length === 0, lv3);
    await c.page.evaluate(() => GW.debug.setSpeed(3));
    const done = await solveRound(c);
    await waitState(c.page, 'roundDone', 8000).catch(() => {});
    check(`${tag}: round finishes after rotation`, done && (await c.page.evaluate(() => GW.debug.world.state)) !== 'round');
    const ui = await c.page.evaluate(() => ['hud', 'bubble'].map(id => { const r = document.getElementById(id).getBoundingClientRect(); return { id, l: r.left | 0, r: r.right | 0, t: r.top | 0, b: r.bottom | 0 }; }));
    check(`${tag}: HUD and bubble on screen`, ui.every(u => u.l >= 0 && u.r <= a.viewport.width + 1 && u.t >= 0 && u.b <= a.viewport.height), ui);
    check(`${tag}: no NaN`, (await nanCheck(c.page)).length === 0, await nanCheck(c.page));
    check(`${tag}: zero console errors`, c.errors.length === 0, c.errors);
    if (results.some(r => !r.ok && r.name.startsWith(tag))) await shot(c, 'rotate-fail');
    await c.close();
  }
  // rotation during the scroll and during the peek
  const c = await open(DEV.iphoneL, 'mute=1&seed=97&age=4');
  await startGame(c, 1, false);
  await c.page.waitForFunction(() => GW.debug.world.phase === 'scroll' && GW.debug.world.scrollT > 0.2, null, { timeout: 10000 });
  await c.page.setViewportSize(DEV.iphoneP.viewport); await sleep(300);
  await c.page.waitForFunction(() => GW.debug.world.phase === 'peek', null, { timeout: 8000 }).catch(() => {});
  await c.page.setViewportSize(DEV.iphoneL.viewport); await sleep(300);
  const lv = await sampleLayout(c.page, 400);
  check('rotate/during scroll + peek: layout clean afterwards', lv.length === 0, lv);
  await waitPlay(c.page).catch(() => {});
  const dx = await c.page.evaluate(() => ({ dx: GW.debug.world.buildingDx, phase: GW.debug.world.phase }));
  check('rotate/during scroll: building settles at dx 0 and play starts', dx.dx === 0 && dx.phase === 'play', dx);
  check('rotate/during scroll: zero console errors', c.errors.length === 0, c.errors);
  await c.close();
}

/* Full bot sessions: ages 3–7 × en / vi at high speed, a few in parallel. */
async function gBot() {
  const jobs = [];
  let k = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const lang of ['en', 'vi']) jobs.push({ age, lang, d: ALL[k % ALL.length], seed: 200 + k++ });
  const SPEED = 20;
  const table = [];
  async function run(j) {
    const c = await open(j.d, `mute=1&seed=${j.seed}&age=${j.age}&lang=${j.lang}`);
    await c.page.evaluate(s => { GW.debug.setBot(true, 0.75); GW.debug.setSpeed(s); GW.debug.startGame(); }, SPEED);
    const t0 = Date.now();
    let nan = [], texts = new Set(), bad = [], lv = new Set(), small = new Set(), done = false;
    while (Date.now() - t0 < 150000) {
      await sleep(400);
      const s = await c.page.evaluate(() => ({ m: GW.debug.mode, b: document.getElementById('bubbleText').textContent, q: document.getElementById('talkQ').textContent, g: GW.debug.world.layout.grid && GW.debug.world.layout.grid.minOk, cw: GW.debug.world.layout.grid && GW.debug.world.layout.grid.cw | 0 }));
      [s.b, s.q].forEach(t => { if (t && !texts.has(t)) { texts.add(t); if (badText(t)) bad.push(t); } });
      const nn = await nanCheck(c.page); if (nn.length) nan = nan.concat(nn).slice(0, 10);
      (await layoutViolations(c.page)).forEach(v => lv.add(v.replace(/\d+/g, '#')));
      if (s.g === false) small.add(s.cw);
      if (s.m === 'done') { done = true; break; }
    }
    const tag = `bot/age${j.age}-${j.lang} (${j.d.name})`;
    const res = await c.page.evaluate(() => ({ st: GW.debug.getState(), stats: GW.debug.bot && GW.debug.bot.stats, done: document.getElementById('doneTitle').textContent, ds: document.getElementById('doneStars').textContent, lines: GW.debug.voiceLog.map(l => l.lang + '|' + l.text) }));
    const evs = await c.page.evaluate(() => ({ sd: window.__ev.filter(e => e.type === 'sessionDone'), levels: window.__ev.filter(e => e.type === 'level').map(e => e.topic), surprises: window.__ev.filter(e => e.type === 'round' && e.surprise).map(e => e.round + ':' + e.surprise), rounds: window.__ev.filter(e => e.type === 'round').length }));
    check(`${tag}: finishes — sessionDone event + done screen`, done && evs.sd.length === 1 && await visible(c.page, 'scrDone'), { st: res.st, sd: evs.sd });
    check(`${tag}: 4 chapters played`, evs.levels.length === 4, evs.levels);
    check(`${tag}: a surprise in round index 2 of every chapter`, evs.surprises.length === 4 && evs.surprises.every(x => x.startsWith('2:')), evs.surprises);
    check(`${tag}: no NaN`, nan.length === 0, nan);
    const badLines = res.lines.filter(l => badText(l.split('|')[1]));
    check(`${tag}: all bubble / voice text clean`, bad.length === 0 && badLines.length === 0, bad.concat(badLines).slice(0, 5));
    check(`${tag}: every voice line in ${j.lang}`, res.lines.every(l => l.startsWith(j.lang + '|')), res.lines.filter(l => !l.startsWith(j.lang + '|')).slice(0, 4));
    if (j.lang === 'vi') check(`${tag}: done title in Vietnamese`, VI_RE.test(res.done), res.done);
    check(`${tag}: windows never below the age minimum`, small.size === 0, [...small]);
    check(`${tag}: windows on screen, clear of HUD/bubble, Gigi's head never on a window`, lv.size === 0, [...lv]);
    const stars = res.st.stars;
    check(`${tag}: stars 1..52 and shown on the done screen`, stars > 0 && stars <= 52 && +res.ds === stars, { stars, ds: res.ds });
    table.push({ age: j.age, lang: j.lang, dev: j.d.name, wall: ((Date.now() - t0) / 1000).toFixed(0) + 's', rounds: evs.rounds, stars, topics: evs.levels.join('/') });
    if (j.age === 4) {
      await clearEv(c.page);
      await c.page.evaluate(() => { GW.debug.setBot(false); GW.debug.setSpeed(1); });
      await tapEl(c, '#btnAgain'); await sleep(400);
      const pa = await c.page.evaluate(() => ({ m: GW.debug.mode, lvl: GW.debug.world.level, stars: GW.debug.world.stars, hud: !document.getElementById('hud').classList.contains('hidden'), hs: document.getElementById('hudStars').textContent, done: !document.getElementById('scrDone').classList.contains('hidden') }));
      check(`${tag}: Play again → fresh session`, pa.m === 'play' && pa.lvl === 0 && pa.stars === 0 && pa.hud && pa.hs === '0' && !pa.done, pa);
      await waitPlay(c.page).catch(() => {});
      const kk = (await wins(c.page)).find(x => x.state === 'down');
      if (kk) { await tapWin(c, kk.id); await sleep(150); }
      check(`${tag}: real taps work in the replayed session`, (await evOf(c.page, 'flip')).length === 1);
    }
    check(`${tag}: zero console / page errors`, c.errors.length === 0, c.errors);
    if (!done) await shot(c, `bot-age${j.age}-${j.lang}-stuck`);
    await c.close();
  }
  const PAR = 5;
  for (let i = 0; i < jobs.length; i += PAR) await Promise.all(jobs.slice(i, i + PAR).map(run));
  console.table(table);
}

(async () => {
  srv = await serve(process.env.GW_GAME_ROOT || undefined);
  browser = await chromium.launch();
  const groups = [['boot', gBoot], ['lang', gLang], ['gate', gGate], ['settings', gSettings], ['flags', gFlags], ['volume', gVolume],
    ['phases', gPhases], ['pair', gPair], ['mismatch', gMismatch], ['third', gThird], ['tapopen', gTapOpen], ['gigi', gGigi],
    ['critter', gCritter], ['talk', gTalk], ['pause', gPause], ['rotate', gRotate], ['bot', gBot]];
  const unknown = ONLY.filter(g => !groups.some(x => x[0] === g));
  if (unknown.length) { console.log('unknown group(s): ' + unknown.join(', ') + '\ngroups: ' + groups.map(g => g[0]).join(' ')); process.exit(2); }
  const times = {};
  for (const [g, fn] of groups) {
    if (!want(g)) continue;
    curGroup = g;
    console.log(`\n== ${g}`);
    const t0 = Date.now();
    try { await fn(); } catch (e) { check(`${g}: group crashed`, false, String(e && e.stack || e).slice(0, 800)); }
    times[g] = ((Date.now() - t0) / 1000).toFixed(1);
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  const byGroup = {};
  for (const r of results) { const g = byGroup[r.group] = byGroup[r.group] || { group: r.group, pass: 0, fail: 0 }; r.ok ? g.pass++ : g.fail++; }
  console.log('\n== summary');
  console.table(Object.values(byGroup).map(g => ({ group: g.group, pass: g.pass, fail: g.fail, secs: times[g.group], result: g.fail ? 'FAIL' : 'PASS' })));
  const fails = results.filter(r => !r.ok);
  console.log(`${results.length - fails.length}/${results.length} checks passed in ${((Date.now() - T_START) / 1000).toFixed(0)} s`);
  fails.forEach(f => console.log('FAIL ' + f.name));
  process.exit(fails.length ? 1 : 0);
})();
