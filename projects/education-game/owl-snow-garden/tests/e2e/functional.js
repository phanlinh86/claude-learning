// Functional QA suite for Owlet's Snow Garden — real touch/mouse input on iPhone/iPad-sized mobile contexts.
//   node tests/e2e/functional.js              (all groups)
//   node tests/e2e/functional.js input ask    (only some groups)
// Prints PASS/FAIL per check, writes tests/out/functional/results.json + screenshots, exits 1 on any FAIL.
// Env: SG_GAME_ROOT=<dir> tests another build of game/.
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
function check(name, ok, info) {
  results.push({ name, ok: !!ok, info: info == null ? '' : info });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 500)));
  return !!ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Text sanitiser shared by all groups.
const BARE_KEYS = ['praise', 'wrong', 'miss', 'hint', 'idle', 'great'];
function badText(s) {
  if (s == null) return null;
  s = String(s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|chapter)\.[a-zA-Z]/.test(s)) return 'raw i18n key';
  if (BARE_KEYS.includes(s.trim())) return 'bare key';
  return null;
}
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹằắặẳẵầấậẩẫềếệểễồốộổỗờớợởỡừứựửữ]/i;
const EN_WORDS = /\b(the|pot|pots|seed|seeds|flower|flowers|Plant|Put|Yes|Great|Chapter|Now|Next|Count|Which)\b/;

/* Collect every user-visible string: canvas fillText, and DOM text of bubble / talk / done / title. */
const INIT = () => {
  window.__texts = new Set();
  const add = t => { if (t != null && String(t).trim()) window.__texts.add(String(t)); };
  const P = CanvasRenderingContext2D.prototype, f = P.fillText;
  P.fillText = function (t, ...a) { add(t); return f.call(this, t, ...a); };
  window.__collect = () => ['bubbleText', 'talkQ', 'talkTitle', 'doneTitle', 'titleAge', 'tagline', 'micLabel']
    .forEach(id => { const e = document.getElementById(id); if (e) add(e.textContent); });
  document.addEventListener('DOMContentLoaded', () => {
    const mo = new MutationObserver(() => {
      window.__collect();
      document.querySelectorAll('#talkChoices button').forEach(b => add(b.textContent));
    });
    mo.observe(document.body, { subtree: true, childList: true, characterData: true });
  });
};

let srv, browser;
async function open(dev, q = '', opt = {}) {
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  if (opt.storage) await ctx.addInitScript(s => { if (!sessionStorage.getItem('__seeded')) { localStorage.clear(); for (const k in s) localStorage.setItem(k, s[k]); sessionStorage.setItem('__seeded', '1'); } }, opt.storage);
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(srv.url + (q ? '?' + q : ''));
  await waitTitle(page);
  await installEv(page);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, errors, cdp, dev };
}
async function waitTitle(page) {
  await page.waitForFunction(() => window.SG && SG.debug && SG.debug.mode && SG.debug.mode !== 'loading', null, { timeout: 15000 });
}
async function installEv(page) {
  await page.evaluate(() => {
    window.__ev = [];
    const w = SG.debug.world;
    if (w.__hooked) return;
    w.__hooked = true;
    const o = w._emit;
    w._emit = function (e) { window.__ev.push(Object.assign({ at: performance.now() }, e)); return o.call(this, e); };
  });
}
const evTypes = page => page.evaluate(() => window.__ev.map(e => e.type));
const evOf = (page, t) => page.evaluate(t => window.__ev.filter(e => e.type === t).map(e => { const o = Object.assign({}, e); delete o.talk; return o; }), t);
const clearEv = page => page.evaluate(() => { window.__ev = []; });
const mode = page => page.evaluate(() => SG.debug.mode);
const voiceN = page => page.evaluate(() => SG.debug.voiceLog.length);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
const itemOf = (page, id) => page.evaluate(id => { const i = SG.debug.world.items.find(i => i.id === id); return i && { id: i.id, state: i.state, x: i.x, y: i.y, homeX: i.homeX, homeY: i.homeY, planted: i.planted, grow: i.grow, bloomed: i.bloomed, basketId: i.basketId, alpha: i.alpha, misses: i.misses }; }, id);

/* ---------- input helpers (CDP touch = real touch + pointer events in Chromium) ---------- */
async function touch(cdp, type, pts) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0, radiusX: 4, radiusY: 4, force: 1 })) }); }
async function tap(c, x, y) { await touch(c.cdp, 'touchStart', [{ x, y }]); await sleep(50); await touch(c.cdp, 'touchEnd', []); }
async function tapEl(c, sel) {
  await c.page.locator(sel).first().evaluate(e => e.scrollIntoView({ block: 'nearest' }));   // parents scroll the settings panel
  const bb = await c.page.locator(sel).first().boundingBox();
  if (!bb) throw new Error('no box for ' + sel);
  await tap(c, bb.x + bb.width / 2, bb.y + bb.height / 2);
  await sleep(60);
}
const FLAKES = [];
async function drag(c, from, to, opt = {}) {
  const steps = opt.steps || 14;
  for (let attempt = 0; ; attempt++) {
    await touch(c.cdp, 'touchStart', [from]);
    await sleep(60);
    if (opt.expectGrab === false || attempt >= 1) break;
    const d = await c.page.evaluate(([x, y]) => {
      const w = SG.debug.world, v = SG.debug.view(), lx = (x - v.left) / v.s, ly = (y - v.top) / v.s;
      const near = w.items.map(i => ({ id: i.id, s: i.state, d: Math.hypot(i.x - lx, i.y - ly) | 0, r: (0.6 * i.size + 14) | 0 })).sort((a, b) => a.d - b.d)[0];
      return { held: w.held, mode: SG.debug.mode, state: w.state, lx: lx | 0, ly: ly | 0, near, el: (document.elementFromPoint(x, y) || {}).id };
    }, [from.x, from.y]);
    if (d.held) { c.grabbedOnce = true; break; }
    if (!c.grabbedOnce || !d.near || d.near.d > d.near.r || d.mode !== 'play' || d.state !== 'round') break;
    FLAKES.push(d);
    console.log('  note: touchStart did not grab, retrying once ' + JSON.stringify(d));
    await touch(c.cdp, 'touchEnd', []); await sleep(120);
  }
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    await touch(c.cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * u, y: from.y + (to.y - from.y) * u }]);
    await sleep(16);
  }
  await sleep(opt.settle || 260);           // let the spring catch up with the finger
  if (opt.beforeUp) await opt.beforeUp();
  await touch(c.cdp, 'touchEnd', []);
}
/** logical → CSS px */
async function css(page, x, y) { return page.evaluate(([x, y]) => { const v = SG.debug.view(); return { x: v.left + x * v.s, y: v.top + y * v.s }; }, [x, y]); }
async function waitRound(page, timeout = 15000) {
  await page.waitForFunction(() => SG.debug.mode === 'play' && SG.debug.world.state === 'round' && SG.debug.world.interactive &&
    SG.debug.world.items.every(i => i.state === 'idle' || i.state === 'in'), null, { timeout });
}
async function roundInfo(page) {
  return page.evaluate(() => {
    const w = SG.debug.world;
    return { mode: w.cur && w.cur.mode, round: w.round, level: w.level, topic: w.topic, target: w.target, queue: (w.queue || []).slice(),
      items: w.items.map(i => ({ id: i.id, answer: i.answer, goal: w.goalOf(i), x: i.x, y: i.y, size: i.size, state: i.state, homeX: i.homeX, homeY: i.homeY })),
      baskets: w.baskets.map(b => ({ id: b.id, kind: b.kind, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h, top: b.top, bottom: b.bottom, need: b.need, count: b.count, glow: b.glow })),
      layout: w.layout };
  });
}
async function dragItemToBasket(c, itemId, basketId, opt) {
  const r = await roundInfo(c.page);
  const it = r.items.find(i => i.id === itemId), b = r.baskets.find(x => x.id === basketId);
  const from = await css(c.page, it.x, it.y), to = await css(c.page, b.x, b.top + b.h * 0.15);
  await drag(c, from, to, opt);
}
async function startPlay(c) { await tapEl(c, '#btnPlay'); await waitRound(c.page); }

/** An empty point (logical) where a dropped seed is a miss: prefers the snow below/between the pots, else open sky. */
async function emptyPoint(page, preferSnow = true) {
  return page.evaluate(pref => {
    const w = SG.debug.world, L = w.layout, v = SG.debug.view();
    const hit = (x, y) => {
      const el = document.elementFromPoint(v.left + x * v.s, v.top + y * v.s);
      if (!el || el.id !== 'game') return true;                         // HUD / bubble cover it
      // a seed held at the finger centre rides 10 px above it; check finger point and seed point
      if (w.potAt(x, y) || w.potAt(x, y - 10) || w.potAt(x, y - 30) || w.potAt(x, y + 10)) return true;
      if (Math.abs(x - L.lumi.x) < L.lumi.h * 0.6 && y < L.lumi.y + 20 && y > L.lumi.y - L.lumi.h * 1.1) return true;
      return w.items.some(i => i.state !== 'leave' && Math.hypot(i.x - x, i.y - y) < 0.6 * i.size + 30);
    };
    if (pref) {
      for (let y = L.H - 18; y > L.groundY; y -= 8)
        for (let x = 60; x < L.W - 60; x += 12) if (!hit(x, y)) return { x, y, where: 'snow' };
    }
    const P = w.playRect || L.play;
    for (let y = P.y + 10; y < P.y + P.h; y += 10)
      for (let x = P.x + 10; x < P.x + P.w; x += 12) if (!hit(x, y)) return { x, y, where: 'sky' };
    return null;
  }, preferSnow);
}

/* Layout validator: idle items inside the play band, pots on screen, nothing under HUD / bubble. */
async function validateLayout(page) {
  return page.evaluate(() => {
    const w = SG.debug.world, L = w.layout, v = SG.debug.view(), P = w.playRect || L.play, probs = [];
    const toCss = (x, y, wd, ht) => ({ l: v.left + x * v.s, t: v.top + y * v.s, r: v.left + (x + wd) * v.s, b: v.top + (y + ht) * v.s });
    const rectOf = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const r = e.getBoundingClientRect(); return r.width ? { l: r.left, t: r.top, r: r.right, b: r.bottom } : null; };
    const hud = rectOf('hud'), bub = rectOf('bubble');
    const ov = (a, b) => a && b && a.l < b.r && a.r > b.l && a.t < b.b && a.b > b.t;
    const tol = 8;
    for (const it of w.items) {
      if (it.state === 'leave') continue;
      const hs = it.size / 2;
      if (it.state === 'idle' || it.state === 'appear') {
        if (it.homeX - hs < P.x - tol || it.homeX + hs > P.x + P.w + tol || it.homeY - hs < P.y - tol || it.homeY + hs > P.y + P.h + tol)
          probs.push(`${it.id} home outside play (${it.homeX | 0},${it.homeY | 0}) play=${P.x | 0},${P.y | 0},${P.w | 0},${P.h | 0}`);
        if (Math.abs(it.x - it.homeX) > 6 || Math.abs(it.y - it.homeY) > 6) probs.push(`${it.id} idle but not at home`);
      }
      if (it.x - hs < -2 || it.x + hs > L.W + 2 || it.y - hs < -2 || it.y + hs > L.H + 2) probs.push(`${it.id} off-screen (${it.x | 0},${it.y | 0}) ${it.state}`);
      if (it.state === 'idle') {
        const r = toCss(it.x - hs, it.y - hs, it.size, it.size);
        if (ov(r, hud)) probs.push(`${it.id} under HUD`);
        if (ov(r, bub)) probs.push(`${it.id} under bubble`);
      }
      if (it.state === 'in') {
        const b = w.baskets.find(b => b.id === it.basketId);
        if (!b || Math.abs(it.x - b.x) > b.w / 2 + 5 || it.y < b.top - 40 || it.y > b.bottom) probs.push(`${it.id} 'in' but not in its pot`);
      }
    }
    for (const b of w.baskets) {
      if (b.x - b.w / 2 < -1 || b.x + b.w / 2 > L.W + 1 || b.bottom > L.H + 1) probs.push(`pot ${b.id} off-screen`);
      const r = toCss(b.x - b.w / 2, b.top, b.w, b.h);
      if (ov(r, hud)) probs.push(`pot ${b.id} under HUD`);
    }
    if (ov(hud, bub)) probs.push('bubble overlaps HUD');
    if (w.held) { const it = w.items.find(i => i.id === w.held); if (!it || it.state !== 'drag') probs.push('held id but item not dragging'); }
    for (const it of w.items) if (it.state === 'drag' && it.id !== w.held) probs.push(`${it.id} stuck in drag`);
    return probs;
  });
}

/* ======================================================================= groups */

async function gBoot() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=3');
    const t = await c.page.evaluate(() => ({ mode: SG.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      stars: document.getElementById('titleStars').textContent, age: document.getElementById('titleAge').textContent,
      logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, doc: document.title,
      hud: document.getElementById('hud').classList.contains('hidden'), loading: document.getElementById('loading').classList.contains('hidden') }));
    check(`[${d.name}] boot to title`, t.mode === 'title' && t.title && t.hud && t.loading, t);
    check(`[${d.name}] title shows logo, stars + age`, /Owlet/.test(t.logo) && /Snow Garden/.test(t.logo) && /^\d+$/.test(t.stars) && /4/.test(t.age), t);
    const bb = await c.page.locator('#btnPlay').boundingBox();
    check(`[${d.name}] play button on screen, >= 60px`, bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= d.viewport.width && bb.y + bb.height <= d.viewport.height && bb.width >= 60, bb);
    await c.page.screenshot({ path: path.join(OUT, d.name + '-title.png') });
    await sleep(300);
    check(`[${d.name}] no console errors at boot`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

async function gLang() {
  const d = DEV.iphoneP;
  const c = await open(d, 'mute=1', { storage: { 'sg:settings': JSON.stringify({ lang: 'en', age: 5 }) } });
  const read = () => c.page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent,
    tag: document.getElementById('tagline').textContent, lang: document.documentElement.lang, doc: document.title,
    viOn: document.querySelector('#scrTitle .chip[data-lang="vi"]').classList.contains('on'), age: document.getElementById('titleAge').textContent,
    tTitle: SG.I18N.t(document.documentElement.lang, 'ui.title') }));
  const before = await read();
  check('[lang] EN title texts', /Owlet/.test(before.logo) && before.lang === 'en' && before.tag.length > 0 && before.doc === before.tTitle, before);
  await tapEl(c, '#scrTitle .chip[data-lang="vi"]');
  await sleep(150);
  const after = await read();
  check('[lang] chip EN→VI changes logo/tagline/document title (ui.title)', after.logo === 'Vườn Hoa Cú Tuyết' && after.tag !== before.tag && VI_RE.test(after.tag) && after.lang === 'vi' && after.viOn && after.doc === 'Vườn Hoa Cú Tuyết', { before, after });
  check('[lang] VI title shows age in Vietnamese', /Tuổi 5/.test(after.age), after.age);
  const vl = await c.page.evaluate(() => SG.debug.voiceLog.slice(-1)[0]);
  check('[lang] chip tap greets in Vietnamese', vl && vl.lang === 'vi' && VI_RE.test(vl.text), vl);
  await c.page.reload(); await waitTitle(c.page);
  const re = await c.page.evaluate(() => [document.getElementById('logo1').textContent, document.documentElement.lang, JSON.parse(localStorage.getItem('sg:settings') || '{}').lang]);
  check('[lang] VI persists after reload (sg:settings)', re[0] === 'Vườn Hoa' && re[1] === 'vi' && re[2] === 'vi', re);
  await tapEl(c, '#scrTitle .chip[data-lang="en"]'); await sleep(100);
  const back = await read();
  check('[lang] VI→EN switches back', /Owlet/.test(back.logo) && back.lang === 'en', back);
  check('[lang] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

async function gGate() {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const c = await open(d, 'mute=1');
    const g = await c.page.locator('#btnParents').boundingBox();
    const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
    check(`[gate ${d.name}] gear is >= 44px tap target`, g.width >= 44 && g.height >= 44, g);
    await tap(c, gx, gy); await sleep(500);
    check(`[gate ${d.name}] short tap on gear does NOT open settings`, !(await visible(c.page, 'scrSettings')));
    await touch(c.cdp, 'touchStart', [{ x: gx, y: gy }]); await sleep(1200); await touch(c.cdp, 'touchEnd', []); await sleep(300);
    check(`[gate ${d.name}] 1.2 s hold does NOT open settings`, !(await visible(c.page, 'scrSettings')));
    await touch(c.cdp, 'touchStart', [{ x: gx, y: gy }]); await sleep(400);
    await touch(c.cdp, 'touchMove', [{ x: gx - 150, y: gy + 150 }]); await sleep(2000); await touch(c.cdp, 'touchEnd', []); await sleep(200);
    check(`[gate ${d.name}] hold that slides off the gear is cancelled`, !(await visible(c.page, 'scrSettings')));
    await touch(c.cdp, 'touchStart', [{ x: gx, y: gy }]); await sleep(2200); await touch(c.cdp, 'touchEnd', []); await sleep(300);
    check(`[gate ${d.name}] 2.2 s touch hold opens settings`, await visible(c.page, 'scrSettings'));
    await c.page.screenshot({ path: path.join(OUT, d.name + '-settings.png') });
    const pan = await c.page.evaluate(() => { const p = document.querySelector('.settings-panel').getBoundingClientRect(); return { b: p.bottom, t: p.top, vh: innerHeight }; });
    check(`[gate ${d.name}] settings panel inside viewport`, pan.t >= 0 && pan.b <= pan.vh + 1, pan);
    await tapEl(c, '#btnSettingsDone'); await sleep(200);
    check(`[gate ${d.name}] Done returns to title`, (await visible(c.page, 'scrTitle')) && !(await visible(c.page, 'scrSettings')));
    await c.page.mouse.move(gx, gy); await c.page.mouse.down(); await sleep(400); await c.page.mouse.up(); await sleep(300);
    check(`[gate ${d.name}] short mouse click does NOT open settings`, !(await visible(c.page, 'scrSettings')));
    await c.page.mouse.down(); await sleep(2200); await c.page.mouse.up(); await sleep(300);
    check(`[gate ${d.name}] 2.2 s mouse hold opens settings`, await visible(c.page, 'scrSettings'));
    check(`[gate ${d.name}] no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

async function openSettingsByHold(c) {
  const g = await c.page.locator('#btnParents').boundingBox();
  await touch(c.cdp, 'touchStart', [{ x: g.x + g.width / 2, y: g.y + g.height / 2 }]); await sleep(2200); await touch(c.cdp, 'touchEnd', []); await sleep(250);
  return visible(c.page, 'scrSettings');
}

async function gSettings() {
  const d = DEV.iphoneP;
  const c = await open(d, 'mute=1', { storage: { 'sg:settings': JSON.stringify({ lang: 'en', age: 4 }) } });
  check('[settings] gate opens', await openSettingsByHold(c));
  await tapEl(c, '#ageChips .chip[data-age="6"]');
  await tapEl(c, '#scrSettings .chip[data-lang="vi"]');
  await c.page.locator('#inpName').fill('Linh');
  for (const id of ['optSfx', 'optMusic', 'optMic']) { await tapEl(c, `label:has(#${id})`); }
  await sleep(150);
  const ls = await c.page.evaluate(() => Object.keys(localStorage));
  const st = await c.page.evaluate(() => JSON.parse(localStorage.getItem('sg:settings') || 'null'));
  check('[settings] changes saved to sg:settings', st && st.age === 6 && st.lang === 'vi' && st.name === 'Linh' && st.sfx === false && st.music === false && st.mic === false && st.voice === true, st);
  check('[settings] every storage key uses the sg: prefix', ls.every(k => k.startsWith('sg:')), ls);
  await tapEl(c, '#btnSettingsDone'); await sleep(150);
  const ta = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('[settings] title age updates after Done', /6/.test(ta), ta);
  await c.page.reload(); await waitTitle(c.page); await installEv(c.page);
  await openSettingsByHold(c);
  const dom = await c.page.evaluate(() => ({ age: [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age), name: document.getElementById('inpName').value,
    sfx: document.getElementById('optSfx').checked, music: document.getElementById('optMusic').checked, voice: document.getElementById('optVoice').checked, mic: document.getElementById('optMic').checked, lang: document.documentElement.lang }));
  check('[settings] persist across reload (DOM)', dom.age.join() === '6' && dom.name === 'Linh' && !dom.sfx && !dom.music && dom.voice && !dom.mic && dom.lang === 'vi', dom);
  await c.page.locator('#inpName').fill('{child}<b>');
  await sleep(100);
  const nm = await c.page.evaluate(() => JSON.parse(localStorage.getItem('sg:settings')).name);
  check('[settings] name strips {} <>', !/[{}<>]/.test(nm), nm);
  await c.page.locator('#inpName').fill('Linh');
  await tapEl(c, '#ageChips .chip[data-age="7"]'); await tapEl(c, '#btnSettingsDone'); await sleep(100);
  const t7 = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('[settings] age 7 shows 7+', /7\+/.test(t7), t7);
  await startPlay(c);
  const wa = await c.page.evaluate(() => ({ age: SG.debug.world.age, lang: SG.debug.world.lang, levels: SG.debug.world.levels }));
  check('[settings] game starts at saved age 7 + saved lang vi', wa.age === 7 && wa.lang === 'vi', wa);
  check('[settings] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();

  // ---- URL flags must not leak into saved settings
  const c2 = await open(d, 'lang=vi&age=6&mute=1', { storage: { 'sg:settings': JSON.stringify({ lang: 'en', age: 4, name: '', sfx: true, music: true, voice: true, mic: true }) } });
  let s0 = await c2.page.evaluate(() => JSON.parse(localStorage.getItem('sg:settings')));
  check('[flags] boot with ?lang=vi&age=6&mute=1 does not write settings', s0.lang === 'en' && s0.age === 4, s0);
  const ui = await c2.page.evaluate(() => ({ lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent }));
  check('[flags] ?lang=vi applies to the UI for the session', ui.lang === 'vi', ui);
  check('[flags] title age reflects ?age=6 override', /6/.test(ui.age), ui);
  await openSettingsByHold(c2);
  await tapEl(c2, 'label:has(#optSfx)'); await sleep(100);
  s0 = await c2.page.evaluate(() => JSON.parse(localStorage.getItem('sg:settings')));
  check('[flags] toggling a setting under ?lang=vi does not save lang=vi', s0.lang === 'en', s0);
  check('[flags] toggling a setting under ?age=6 does not save age=6', s0.age === 4, s0);
  check('[flags] ?mute=1 not saved', !('mute' in s0) && s0.sfx === false, s0);
  await c2.ctx.close();
}

/* Real touch input on the canvas: correct drop → plant/grow/bloom, wrong, miss on snow, tap, hint, Lumi, 2nd finger. */
async function gInput() {
  for (const d of ALL) {
    const N = `[${d.name}]`;
    const c = await open(d, 'mute=1&seed=4&age=4');
    const p = c.page;
    await startPlay(c);
    let r = await roundInfo(p);
    check(`${N} round 1 is sort mode with >= 2 pots`, r.mode === 'sort' && r.baskets.length >= 2 && r.baskets.every(b => b.kind === 'pot'), { mode: r.mode, n: r.baskets.length });
    let probs = await validateLayout(p);
    check(`${N} initial layout valid`, probs.length === 0, probs);
    const bub = await p.evaluate(() => document.getElementById('bubbleText').textContent);
    check(`${N} prompt shown in bubble`, !badText(bub), bub);

    // --- HUD / bubble taps never grab; bubble repeats the prompt
    await clearEv(p);
    const vn0 = await voiceN(p);
    await tapEl(c, '#hud .hud-stars'); await sleep(400);
    await tapEl(c, '#bubble'); await sleep(200);
    let ev = await evTypes(p);
    check(`${N} tapping HUD / bubble never grabs`, !ev.includes('grab') && (await p.evaluate(() => SG.debug.world.held)) == null, ev);
    const lastLine = await p.evaluate(() => SG.debug.voiceLog.slice(-1)[0].text);
    check(`${N} tapping bubble repeats the prompt`, (await voiceN(p)) > vn0 && lastLine === bub, { lastLine, bub });

    // --- tap Lumi repeats the prompt
    const lu = r.layout.lumi;
    const lp = await css(p, lu.x, lu.y - lu.h * 0.5);
    const vn1 = await voiceN(p);
    await clearEv(p);
    await tap(c, lp.x, lp.y); await sleep(250);
    const ll = await p.evaluate(() => SG.debug.voiceLog.slice(-1)[0].text);
    check(`${N} tap Lumi repeats the prompt (voiceLog grows)`, (await voiceN(p)) > vn1 && ll === bub && !(await evTypes(p)).includes('grab'),
      { ll, bub, el: await p.evaluate(([x, y]) => (document.elementFromPoint(x, y) || {}).id, [lp.x, lp.y]) });

    // --- tap on a seed is not a drop
    r = await roundInfo(p);
    const T0 = r.items.find(i => i.state === 'idle');
    await clearEv(p);
    const vnT = await voiceN(p);
    const tp = await css(p, T0.x, T0.y);
    await tap(c, tp.x, tp.y); await sleep(500);
    ev = await evTypes(p);
    const tI = await itemOf(p, T0.id);
    check(`${N} quick tap on a seed = 'tap' (no drop/miss/wrong), seed stays home, name spoken`,
      ev.includes('tap') && !ev.includes('drop') && !ev.includes('miss') && !ev.includes('wrong') && tI.state === 'idle' && tI.misses === 0 && (await voiceN(p)) > vnT, { ev, tI });

    // --- correct drop → planted, grows and blooms
    r = await roundInfo(p);
    const A = r.items.find(i => i.state === 'idle');
    await clearEv(p);
    const vn2 = await voiceN(p);
    const aFrom = await css(p, A.x, A.y), goalB = r.baskets.find(b => b.id === A.goal);
    const aTo = await css(p, goalB.x, goalB.top + goalB.h * 0.15);
    let follow = null;
    await drag(c, aFrom, aTo, { beforeUp: async () => {
      follow = await p.evaluate(([id, tx, ty]) => { const w = SG.debug.world, v = SG.debug.view(), it = w.items.find(i => i.id === id); return { held: w.held, state: it.state, dx: Math.abs(it.x - (tx - v.left) / v.s), dy: Math.abs(it.y - (ty - v.top) / v.s) }; }, [A.id, aTo.x, aTo.y]);
    } });
    check(`${N} dragged seed follows the finger`, follow && follow.held === A.id && follow.state === 'drag' && follow.dx < 30 && follow.dy < 40, follow);
    await p.waitForFunction(id => { const i = SG.debug.world.items.find(i => i.id === id); return !i || i.grow >= 1 || i.state === 'leave'; }, A.id, { timeout: 5000 }).catch(() => {});
    ev = await evTypes(p);
    const aI = await itemOf(p, A.id);
    const bl = (await evOf(p, 'bloom')).find(e => e.id === A.id);
    check(`${N} correct drop → grab+drop+correct+land, seed planted in its pot`, ['grab', 'drop', 'correct', 'land'].every(t => ev.includes(t)) && aI && aI.planted && aI.basketId === A.goal, { ev, aI });
    check(`${N} planted seed grows (grow→1) and blooms (bloom event)`, aI && (aI.grow >= 0.999 || aI.state === 'leave') && aI.bloomed && bl && bl.basketId === A.goal && bl.n >= 1, { aI, bl });
    check(`${N} correct drop makes Lumi speak`, (await voiceN(p)) > vn2);

    // --- wrong drop → bounces home, not planted
    r = await roundInfo(p);
    const B = r.items.find(i => i.state === 'idle');
    const wrongB = r.baskets.find(b => b.id !== B.goal);
    await clearEv(p);
    await dragItemToBasket(c, B.id, wrongB.id);
    await sleep(150);
    const midB = await itemOf(p, B.id);
    await sleep(800);
    ev = await evTypes(p);
    const bs = await itemOf(p, B.id);
    const wr = (await evOf(p, 'wrong'))[0];
    check(`${N} drag to wrong pot → wrong event, seed bounces home, not planted`, ev.includes('wrong') && !ev.includes('correct') && midB.state === 'return' &&
      bs.state === 'idle' && !bs.planted && Math.abs(bs.x - bs.homeX) < 6 && Math.abs(bs.y - bs.homeY) < 6 && wr && wr.target === B.goal, { ev, midB: midB.state, bs, wr });

    // --- miss on empty snow (x2) → hint glows the right pot
    r = await roundInfo(p);
    const C = r.items.find(i => i.state === 'idle' && i.id !== B.id) || r.items.find(i => i.state === 'idle');
    const ep = await emptyPoint(p, true);
    if (!ep) { check(`${N} found an empty spot to miss on`, false, 'none'); }
    else {
      const epc = await css(p, ep.x, ep.y);
      await clearEv(p);
      let Ci = await itemOf(p, C.id);
      await drag(c, await css(p, Ci.x, Ci.y), epc);
      await sleep(800);
      ev = await evTypes(p);
      Ci = await itemOf(p, C.id);
      check(`${N} drop on empty ${ep.where} → miss, seed returns home, not planted`, ev.includes('miss') && !ev.includes('wrong') && !ev.includes('correct') && Ci.state === 'idle' && !Ci.planted, { ev, ep, Ci });
      await drag(c, await css(p, Ci.x, Ci.y), epc);
      await sleep(500);
      ev = await evTypes(p);
      const gl = await p.evaluate(id => { const w = SG.debug.world; const it = w.items.find(i => i.id === id); const g = w.goalOf(it); return { goal: g, glows: w.baskets.map(b => [b.id, +b.glow.toFixed(2)]) }; }, C.id);
      const hintE = (await evOf(p, 'hint'))[0];
      const gGoal = gl.glows.find(x => x[0] === gl.goal), others = gl.glows.filter(x => x[0] !== gl.goal);
      check(`${N} two misses on one seed → hint, the right pot glows (others don't)`, ev.filter(e => e === 'miss').length === 2 && hintE && hintE.basketId === gl.goal && gGoal[1] > 0.5 && others.every(o => o[1] === 0), { ev, gl, hintE });
    }

    // --- second finger ignored
    await sleep(500);
    r = await roundInfo(p);
    const idle = r.items.filter(i => i.state === 'idle');
    if (idle.length >= 2) {
      await clearEv(p);
      const f1 = await css(p, idle[0].x, idle[0].y), f2 = await css(p, idle[1].x, idle[1].y);
      await touch(c.cdp, 'touchStart', [{ x: f1.x, y: f1.y, id: 0 }]); await sleep(50);
      await touch(c.cdp, 'touchStart', [{ x: f1.x, y: f1.y, id: 0 }, { x: f2.x, y: f2.y, id: 1 }]); await sleep(50);
      await touch(c.cdp, 'touchMove', [{ x: f1.x + 20, y: f1.y - 20, id: 0 }, { x: f2.x + 40, y: f2.y - 40, id: 1 }]); await sleep(100);
      const held = await p.evaluate(() => SG.debug.world.held);
      await touch(c.cdp, 'touchMove', [{ x: f1.x + 20, y: f1.y - 20, id: 0 }]); await sleep(50);
      await touch(c.cdp, 'touchEnd', []); await sleep(700);
      ev = await evTypes(p);
      check(`${N} second finger ignored (one grab, first seed)`, ev.filter(e => e === 'grab').length === 1 && held === idle[0].id, { ev, held });
    } else check(`${N} second finger ignored`, true, 'skipped: <2 idle seeds');

    // --- finish the round correctly → roundDone + HUD stars
    await sleep(400);
    for (let k = 0; k < 14; k++) {
      if ((await p.evaluate(() => SG.debug.world.state)) !== 'round') break;
      r = await roundInfo(p);
      const it = r.items.find(i => i.state === 'idle');
      if (!it) { await sleep(300); continue; }
      await dragItemToBasket(c, it.id, it.goal); await sleep(650);
    }
    await p.waitForFunction(() => SG.debug.world.state !== 'round', null, { timeout: 6000 }).catch(() => {});
    await sleep(1600);
    const hs = await p.evaluate(() => ({ hud: +document.getElementById('hudStars').textContent, stars: SG.debug.world.stars, ev: window.__ev.filter(e => e.type === 'roundDone').map(e => e.stars), blooms: window.__ev.filter(e => e.type === 'bloom').length, lands: window.__ev.filter(e => e.type === 'land').length }));
    check(`${N} round done after every seed bloomed → stars fly into HUD counter`, hs.ev.length === 1 && hs.stars >= 1 && hs.hud === hs.stars && hs.blooms === hs.lands, hs);
    check(`${N} input: no console errors`, c.errors.length === 0, c.errors);
    await c.page.screenshot({ path: path.join(OUT, d.name + '-after-round.png') });
    await c.ctx.close();
  }
}

/* Dispatched PointerEvents (iPad with Pencil/trackpad path) and mouse drag */
async function gPointer() {
  const c = await open(DEV.ipadL, 'mute=1&seed=4&age=4');
  await startPlay(c);
  let r = await roundInfo(c.page);
  let it = r.items[0], b = r.baskets.find(x => x.id === it.goal);
  await clearEv(c.page);
  await c.page.evaluate(([fx, fy, tx, ty]) => new Promise(res => {
    const v = SG.debug.view(), cv = document.getElementById('game');
    const P = (type, x, y) => cv.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: v.left + x * v.s, clientY: v.top + y * v.s }));
    P('pointerdown', fx, fy);
    let k = 0;
    const iv = setInterval(() => { k++; const u = Math.min(1, k / 14); P('pointermove', fx + (tx - fx) * u, fy + (ty - fy) * u); if (k >= 24) { clearInterval(iv); P('pointerup', tx, ty); res(); } }, 16);
  }), [it.x, it.y, b.x, b.top + b.h * 0.15]);
  await sleep(900);
  let ev = await evTypes(c.page);
  check('[pointer] dispatched PointerEvent drag to the right pot plants the seed', ev.includes('correct') && ev.includes('land'), ev);
  r = await roundInfo(c.page);
  it = r.items.find(i => i.state === 'idle'); b = r.baskets.find(x => x.id === it.goal);
  const f = await css(c.page, it.x, it.y), t = await css(c.page, b.x, b.top + b.h * 0.15);
  await clearEv(c.page);
  await c.page.mouse.move(f.x, f.y); await c.page.mouse.down();
  await c.page.mouse.move(t.x, t.y, { steps: 14 }); await sleep(300); await c.page.mouse.up(); await sleep(800);
  ev = await evTypes(c.page);
  check('[mouse] mouse drag to correct pot works', ev.includes('correct') && ev.includes('land'), ev);
  check('[pointer] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

/* Count mode: one planter with N holes; exactly N seeds end the round, extras fade away. */
async function gCount() {
  const lvl = await (async () => { const c = await open(DEV.ipadL, 'mute=1&age=4'); const l = await c.page.evaluate(() => SG.AGE_TOPICS[4].indexOf('count')); await c.ctx.close(); return l; })();
  check('[count] age 4 has a count chapter', lvl >= 0, lvl);
  for (const [seed, dev] of [[5, DEV.ipadL], [9, DEV.iphoneP]]) {
    const N = `[count s${seed} ${dev.name}]`;
    const c = await open(dev, `mute=1&seed=${seed}&age=4&level=${lvl}`);
    const p = c.page;
    await startPlay(c);
    let r = await roundInfo(p);
    const b = r.baskets[0];
    check(`${N} count round with 1 planter`, r.mode === 'count' && r.baskets.length === 1 && b.kind === 'planter' && b.need >= 1, { mode: r.mode, n: r.baskets.length, kind: b.kind, need: b.need, topic: r.topic });
    const bub = await p.evaluate(() => document.getElementById('bubbleText').textContent);
    check(`${N} prompt names the number`, !badText(bub) && (bub.includes(String(b.need)) || /\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/i.test(bub)), bub);
    check(`${N} more seeds than holes (real counting)`, r.items.length > b.need, { items: r.items.length, need: b.need });
    await clearEv(p);
    const vlBefore = await voiceN(p);
    let ok = true;
    for (let k = 0; k < b.need; k++) {
      r = await roundInfo(p);
      const it = r.items.find(i => i.state === 'idle');
      if (!it) { ok = false; check(`${N} idle seed available for ${k + 1}/${b.need}`, false, r.items.map(i => i.state)); break; }
      await dragItemToBasket(c, it.id, b.id);
      await sleep(600);
      const st = await p.evaluate(() => ({ s: SG.debug.world.state, c: SG.debug.world.baskets[0] && SG.debug.world.baskets[0].count, comp: SG.debug.world.completing }));
      if (k < b.need - 1 && (st.s !== 'round' || st.comp)) { ok = false; check(`${N} round ended early after ${k + 1}/${b.need}`, false, st); break; }
    }
    await sleep(250);
    const mid = await p.evaluate(() => { const w = SG.debug.world; return { s: w.state, comp: w.completing, count: w.baskets[0].count, extras: w.items.filter(i => !i.planted).map(i => [i.state, +i.alpha.toFixed(2)]) }; });
    check(`${N} planter full → extras fade away at once (state leave)`, ok && mid.count === b.need && mid.extras.length > 0 && mid.extras.every(e => e[0] === 'leave'), mid);
    await p.waitForFunction(() => SG.debug.world.state === 'roundDone', null, { timeout: 5000 }).catch(() => {});
    const st = await p.evaluate(() => ({ s: SG.debug.world.state, count: SG.debug.world.baskets[0].count, inN: SG.debug.world.items.filter(i => i.planted).length, bloomed: SG.debug.world.items.filter(i => i.bloomed).length, extras: SG.debug.world.items.filter(i => !i.planted).map(i => +i.alpha.toFixed(2)) }));
    check(`${N} exactly N seeds bloom and end the round; extras invisible`, ok && st.s === 'roundDone' && st.count === b.need && st.inN === b.need && st.bloomed === b.need && st.extras.every(a => a === 0), { need: b.need, st });
    const blooms = (await evOf(p, 'bloom')).map(e => e.n);
    check(`${N} bloom events count 1..N`, blooms.join() === Array.from({ length: b.need }, (_, i) => i + 1).join(), blooms);
    const nums = await p.evaluate(n => SG.debug.voiceLog.slice(-n).map(l => l.text), (await voiceN(p)) - vlBefore);
    check(`${N} Lumi counts aloud on bloom`, nums.length >= b.need && nums.every(s => !badText(s)), nums);
    check(`${N} no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
  // overfill: an extra seed thrown while the last one is in the air must not count
  const c = await open(DEV.ipadL, `mute=1&seed=5&age=4&level=${lvl}`);
  await startPlay(c);
  let r = await roundInfo(c.page);
  const b = r.baskets[0];
  for (let k = 0; k < b.need - 1; k++) { r = await roundInfo(c.page); const it = r.items.find(i => i.state === 'idle'); await dragItemToBasket(c, it.id, b.id); await sleep(600); }
  r = await roundInfo(c.page);
  const idle = r.items.filter(i => i.state === 'idle');
  const to = await css(c.page, b.x, b.top + b.h * 0.15);
  await drag(c, await css(c.page, idle[0].x, idle[0].y), to, { steps: 4, settle: 120 });
  await drag(c, await css(c.page, idle[1].x, idle[1].y), to, { steps: 4, settle: 120 });
  await sleep(900);
  const st = await c.page.evaluate(() => ({ s: SG.debug.world.state, count: SG.debug.world.baskets[0] ? SG.debug.world.baskets[0].count : -1, mistakes: SG.debug.world.roundMistakes }));
  check('[count] extra seed after the Nth is rejected without penalty', st.count === b.need && st.mistakes === 0, { need: b.need, st });
  check('[count] overfill: no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

/* Ask mode (animals): Lumi asks for one animal at a time, world.target is the asked pot. */
async function gAsk() {
  for (const [dev, lang, seed] of [[DEV.ipadL, 'en', 12], [DEV.iphoneP, 'vi', 13]]) {
    const N = `[ask ${dev.name} ${lang}]`;
    const c = await open(dev, `mute=1&seed=${seed}&age=4&level=3&lang=${lang}`);
    const p = c.page;
    await startPlay(c);
    let r = await roundInfo(p);
    check(`${N} level 3 at age 4 is an animals/ask round`, r.topic === 'animals' && r.mode === 'ask' && r.baskets.length >= 2 && r.target && r.queue[0] === r.target, { topic: r.topic, mode: r.mode, target: r.target, q: r.queue });
    const animalName = await p.evaluate(([lang, id]) => { const b = SG.debug.world.baskets.find(b => b.id === id); return SG.I18N.name(lang, b.label.type, b.label.value); }, [lang, r.target]);
    let bub = await p.evaluate(() => document.getElementById('bubbleText').textContent);
    check(`${N} bubble asks for the target animal`, bub.toLowerCase().includes(String(animalName).toLowerCase()) && !badText(bub) && (lang === 'en' || VI_RE.test(bub)), { bub, animalName });
    // wrong pot
    const t0 = r.target;
    let it = r.items.find(i => i.state === 'idle');
    const other = r.baskets.find(b => b.id !== t0);
    await clearEv(p);
    await dragItemToBasket(c, it.id, other.id); await sleep(900);
    let ev = await evTypes(p);
    let wr = (await evOf(p, 'wrong'))[0];
    let afterW = await p.evaluate(() => SG.debug.world.target);
    let iw = await itemOf(p, it.id);
    check(`${N} drop into a non-target pot is wrong, target unchanged, seed home`, ev.includes('wrong') && !ev.includes('correct') && wr && wr.target === t0 && afterW === t0 && iw.state === 'idle' && !iw.planted, { ev, wr, afterW, iw });
    // right pot
    r = await roundInfo(p);
    const q1 = r.queue[1] || null;
    it = r.items.find(i => i.state === 'idle');
    await clearEv(p);
    await dragItemToBasket(c, it.id, t0); await sleep(1500);
    ev = await evTypes(p);
    const asks = await evOf(p, 'ask');
    const tNow = await p.evaluate(() => SG.debug.world.target);
    iw = await itemOf(p, it.id);
    check(`${N} drop into world.target is correct, seed planted + bloomed there`, ev.includes('correct') && iw.planted && iw.basketId === t0 && iw.bloomed, { ev, iw });
    check(`${N} target advances to the next queued animal (+ ask event)`, tNow === q1 && (q1 == null || (asks.length === 1 && asks[0].basketId === q1)), { tNow, q1, asks });
    if (q1) {
      const nm2 = await p.evaluate(([lang, id]) => { const b = SG.debug.world.baskets.find(b => b.id === id); return SG.I18N.name(lang, b.label.type, b.label.value); }, [lang, q1]);
      bub = await p.evaluate(() => document.getElementById('bubbleText').textContent);
      const said = await p.evaluate(() => SG.debug.voiceLog.slice(-3).map(l => l.text));
      check(`${N} bubble + voice name the next animal`, bub.toLowerCase().includes(String(nm2).toLowerCase()) && said.some(s => s.toLowerCase().includes(String(nm2).toLowerCase())), { bub, said, nm2 });
      // hint in ask mode glows the target
      r = await roundInfo(p);
      it = r.items.find(i => i.state === 'idle');
      const ep = await emptyPoint(p, true);
      await clearEv(p);
      for (let k = 0; k < 2; k++) { const cur = await itemOf(p, it.id); await drag(c, await css(p, cur.x, cur.y), await css(p, ep.x, ep.y)); await sleep(700); }
      const hint = (await evOf(p, 'hint'))[0];
      const glow = await p.evaluate(() => { const w = SG.debug.world; return w.baskets.find(b => b.id === w.target).glow; });
      check(`${N} hint after 2 misses glows the asked pot`, hint && hint.basketId === q1 && glow > 0.5, { hint, glow, q1 });
    }
    // finish the round by dropping into the target each time
    for (let k = 0; k < 14; k++) {
      if ((await p.evaluate(() => SG.debug.world.state)) !== 'round') break;
      r = await roundInfo(p);
      it = r.items.find(i => i.state === 'idle');
      if (!it || !r.target) { await sleep(300); continue; }
      await dragItemToBasket(c, it.id, r.target); await sleep(650);
    }
    await p.waitForFunction(() => SG.debug.world.state !== 'round', null, { timeout: 6000 }).catch(() => {});
    const fin = await p.evaluate(() => ({ s: SG.debug.world.state, target: SG.debug.world.target, q: SG.debug.world.queue.length }));
    check(`${N} round completes when every asked animal got a flower`, fin.s === 'roundDone' && fin.target == null && fin.q === 0, fin);
    check(`${N} no console errors`, c.errors.length === 0, c.errors);
    await p.screenshot({ path: path.join(OUT, `ask-${dev.name}-${lang}.png`) });
    await c.ctx.close();
  }
}

/* Talk time via the bot, then hand control to a real finger. */
async function reachTalk(c) {
  const p = c.page;
  await p.evaluate(() => { SG.debug.setBot(true, 1); SG.debug.setSpeed(12); });
  await p.waitForFunction(() => {
    if (SG.debug.world.state === 'talk' && !SG.debug.world.talkAnswered) { SG.debug.setBot(false); SG.debug.world.cancelDrag(); SG.debug.setSpeed(1); return true; }
    return false;
  }, null, { timeout: 90000, polling: 'raf' });
  await sleep(500);
  return p.evaluate(() => ({ mode: SG.debug.mode, answered: SG.debug.world.talkAnswered, talk: SG.debug.world.talk, visible: !document.getElementById('scrTalk').classList.contains('hidden') }));
}
async function gTalk() {
  for (const [d, right, lang] of [[DEV.ipadP, false, 'en'], [DEV.iphoneL, true, 'vi'], [DEV.iphoneP, true, 'en']]) {
    const N = `[talk ${d.name} ${right ? 'right' : 'wrong'} ${lang}]`;
    const c = await open(d, `mute=1&seed=6&age=4&lang=${lang}`);
    const p = c.page;
    await startPlay(c);
    const t = await reachTalk(c);
    if (!check(`${N} talk panel opens, unanswered`, t.mode === 'talk' && t.visible && !t.answered, { mode: t.mode, visible: t.visible, answered: t.answered })) { await c.ctx.close(); continue; }
    const txt = await p.evaluate(() => ({ q: document.getElementById('talkQ').textContent, title: document.getElementById('talkTitle').textContent, ch: [...document.querySelectorAll('#talkChoices button')].map(b => b.textContent + '|' + b.dataset.id) }));
    check(`${N} talk texts clean`, [txt.q, txt.title, ...txt.ch].every(s => s && !badText(s)) && (lang === 'en' || VI_RE.test(txt.q)), txt);
    await p.screenshot({ path: path.join(OUT, `${d.name}-talk-${lang}.png`) });
    const boxes = await p.evaluate(() => [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }));
    check(`${N} choices on screen, >= 60px`, boxes.length >= 2 && boxes.every(b => b.l >= 0 && b.t >= 0 && b.r <= d.viewport.width && b.b <= d.viewport.height && b.w >= 60 && b.h >= 60), boxes);
    const ans = t.talk.answerId;
    const pick = right ? ans : t.talk.choices.find(x => x.id !== ans).id;
    const other = t.talk.choices.find(x => x.id !== pick).id;
    await clearEv(p);
    // boxes first: on a slow headless renderer the panel may close (1.6 game-s after the answer) before a 3rd tap
    const bb = await p.locator(`#talkChoices button[data-id="${pick}"]`).boundingBox();
    const ob = await p.locator(`#talkChoices button[data-id="${other}"]`).boundingBox();
    await tap(c, bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(40);
    const cls0 = await p.evaluate(() => [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id + ':' + b.className));
    await tap(c, bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(40);
    await tap(c, ob.x + ob.width / 2, ob.y + ob.height / 2);
    await sleep(200);
    const res = await p.evaluate(() => ({ ev: window.__ev.filter(e => e.type === 'talkResult').map(e => ({ correct: e.correct, choiceId: e.choiceId })), talks: SG.debug.stats.talks, cls: [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id + ':' + b.className) }));
    check(`${N} tapping a choice answers; exactly one talkResult`, res.ev.length === 1 && res.talks === 1 && res.ev[0].correct === right && res.ev[0].choiceId === pick, res);
    check(`${N} right answer highlighted`, cls0.some(s => s.startsWith(ans + ':') && /right/.test(s)), cls0);
    const said = await p.evaluate(() => SG.debug.voiceLog.slice(-1)[0]);
    check(`${N} Lumi responds in ${lang}`, said && said.lang === lang && !badText(said.text) && (lang === 'en' || VI_RE.test(said.text)), said);
    await p.waitForFunction(() => SG.debug.mode === 'play' && document.getElementById('scrTalk').classList.contains('hidden'), null, { timeout: 6000 }).catch(() => {});
    check(`${N} panel closes, mode back to play`, (await mode(p)) === 'play' && !(await visible(p, 'scrTalk')));
    await p.waitForFunction(() => SG.debug.world.state === 'round' && SG.debug.world.level === 1, null, { timeout: 8000 }).catch(() => {});
    const s2 = await p.evaluate(() => ({ s: SG.debug.world.state, l: SG.debug.world.level }));
    check(`${N} game continues to next chapter`, s2.s === 'round' && s2.l === 1, s2);
    check(`${N} no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

async function gPause() {
  const d = DEV.iphoneL;
  const c = await open(d, 'seed=2&age=4');     // NOT muted: check music state
  const p = c.page;
  await startPlay(c);
  const mus = () => p.evaluate(() => !!SG.Audio._playing);
  const hasMusicFlag = await p.evaluate(() => '_playing' in SG.Audio);
  check('[pause] music playing in game', !hasMusicFlag || await mus(), { hasMusicFlag });
  const r = await roundInfo(p);
  const it0 = r.items.find(i => i.state === 'idle');
  const f = await css(p, it0.x, it0.y);
  await touch(c.cdp, 'touchStart', [f]); await sleep(50); await touch(c.cdp, 'touchMove', [{ x: f.x + 30, y: f.y + 30 }]); await sleep(80);
  const held0 = await p.evaluate(() => SG.debug.world.held);
  await p.evaluate(() => document.getElementById('btnPause').click());   // a second hand presses pause
  await sleep(150);
  await touch(c.cdp, 'touchEnd', []); await sleep(100);
  const ps = await p.evaluate(() => ({ mode: SG.debug.mode, held: SG.debug.world.held, drag: SG.debug.world.items.filter(i => i.state === 'drag').length }));
  check('[pause] pausing while holding cancels the drag', held0 && ps.mode === 'paused' && !ps.held && ps.drag === 0, { held0, ps });
  await tapEl(c, '#btnResume'); await sleep(200);
  check('[pause] resume via button', (await mode(p)) === 'play' && !(await visible(p, 'scrPause')) && (!hasMusicFlag || await mus()));
  await tapEl(c, '#btnPause'); await sleep(200);
  check('[pause] HUD pause button pauses (touch)', (await mode(p)) === 'paused' && (await visible(p, 'scrPause')) && (!hasMusicFlag || !(await mus())));
  const t0 = await p.evaluate(() => SG.debug.world.time); await sleep(500);
  check('[pause] world frozen while paused', (await p.evaluate(() => SG.debug.world.time)) === t0);
  await tapEl(c, '#btnResume'); await sleep(200);
  check('[pause] resume', (await mode(p)) === 'play');
  const setHidden = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  // visibilitychange while dragging
  const r2 = await roundInfo(p);
  const it1 = r2.items.find(i => i.state === 'idle');
  const f1 = await css(p, it1.x, it1.y);
  await touch(c.cdp, 'touchStart', [f1]); await sleep(50); await touch(c.cdp, 'touchMove', [{ x: f1.x + 30, y: f1.y + 20 }]); await sleep(80);
  await setHidden(true); await sleep(200);
  const hv = await p.evaluate(() => ({ mode: SG.debug.mode, held: SG.debug.world.held }));
  check('[pause] page hidden → paused, drag cancelled', hv.mode === 'paused' && !hv.held, hv);
  await touch(c.cdp, 'touchEnd', []);
  const tH = await p.evaluate(() => SG.debug.world.time); await sleep(400);
  check('[pause] world frozen while hidden', (await p.evaluate(() => SG.debug.world.time)) === tH);
  await setHidden(false); await sleep(200);
  check('[pause] page visible again → stays paused until child taps', (await mode(p)) === 'paused' && (await visible(p, 'scrPause')));
  await tapEl(c, '#btnResume'); await sleep(200);
  check('[pause] resume after visibility', (await mode(p)) === 'play');
  await tapEl(c, '#btnPause'); await sleep(150);
  await tapEl(c, '#btnHome'); await sleep(300);
  const h = await p.evaluate(() => ({ mode: SG.debug.mode, music: !!SG.Audio._playing, hud: document.getElementById('hud').classList.contains('hidden'), bubble: document.getElementById('bubble').classList.contains('hidden'), title: !document.getElementById('scrTitle').classList.contains('hidden') }));
  check('[pause] Home → title, music stopped, HUD+bubble hidden', h.mode === 'title' && !h.music && h.hud && h.bubble && h.title, h);
  await startPlay(c);
  check('[pause] Play from title after Home starts a fresh session', (await p.evaluate(() => SG.debug.world.level === 0 && SG.debug.world.round === 0)));
  await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(200);
  const s0 = await p.evaluate(() => SG.debug.stats.sessions);
  const pb = await p.locator('#btnPlay').boundingBox();
  await tap(c, pb.x + pb.width / 2, pb.y + pb.height / 2); await tap(c, pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(300);
  check('[pause] double tap on Play starts exactly one session', (await p.evaluate(() => SG.debug.stats.sessions)) === s0 + 1);
  // pause / resume during Talk time
  await waitRound(p);
  await reachTalk(c);
  const tp = await p.evaluate(() => { const r = document.getElementById('btnPause').getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return { mode: SG.debug.mode, pauseReachable: !!e && !!e.closest('#btnPause') }; });
  await setHidden(true); await sleep(150);
  const mt = await p.evaluate(() => ({ mode: SG.debug.mode, music: !!SG.Audio._playing, ctx: SG.Audio.ctx && SG.Audio.ctx.state }));
  await setHidden(false); await sleep(150);
  check('[pause] page hidden during Talk time silences audio', !mt.music || mt.ctx !== 'running', mt);
  if (mt.mode === 'paused') {
    await tapEl(c, '#btnResume'); await sleep(200);
    check('[pause] resume during Talk time returns to the Talk panel', (await mode(p)) === 'talk' && (await visible(p, 'scrTalk')), { tp, mode: await mode(p) });
  } else check('[pause] page hidden during Talk time pauses the game (shows Pause on return)', false, { tp, mt });
  check('[pause] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

/* Rotation: resize portrait↔landscape while idle and while holding a seed. */
async function gRotate() {
  for (const [P, L] of [[DEV.iphoneP, DEV.iphoneL], [DEV.ipadP, DEV.ipadL]]) {
    const dn = P.name.split('-')[0];
    const c = await open(P, 'mute=1&seed=8&age=5');
    const p = c.page;
    await startPlay(c);
    let r = await roundInfo(p);
    const first = r.items.find(i => i.state === 'idle');
    await dragItemToBasket(c, first.id, first.goal); await sleep(800);
    for (const [k, vp] of [['→landscape idle', L.viewport], ['→portrait idle', P.viewport]]) {
      await p.setViewportSize(vp); await sleep(600);
      const probs = await validateLayout(p);
      const v = await p.evaluate(() => { const v = SG.debug.view(); return { fits: v.cssW <= innerWidth + 1 && v.cssH <= innerHeight + 1, W: v.W, H: v.H, iw: innerWidth, ih: innerHeight }; });
      check(`[rotate ${dn}] ${k}: layout valid`, probs.length === 0 && v.fits && (v.W > v.H) === (v.iw > v.ih), { probs, v });
    }
    for (const [k, vp, back] of [['hold →landscape', L.viewport, P.viewport], ['hold →portrait', P.viewport, L.viewport]]) {
      await p.setViewportSize(back); await sleep(500);
      if ((await p.evaluate(() => SG.debug.world.state)) !== 'round') await waitRound(p).catch(() => {});
      await clearEv(p);
      r = await roundInfo(p);
      const it = r.items.find(i => i.state === 'idle');
      if (!it) { check(`[rotate ${dn}] ${k}`, true, 'skipped: no idle seed'); continue; }
      const f = await css(p, it.x, it.y);
      await touch(c.cdp, 'touchStart', [f]); await sleep(50);
      await touch(c.cdp, 'touchMove', [{ x: f.x + 15, y: f.y - 15 }]); await sleep(100);
      const held = await p.evaluate(() => SG.debug.world.held);
      await p.setViewportSize(vp); await sleep(500);
      const mid = await p.evaluate(() => { const w = SG.debug.world; return { held: w.held, W: w.layout.W, H: w.layout.H }; });
      const probsMid = await validateLayout(p);
      const inside = await p.evaluate(() => { const w = SG.debug.world, L = w.layout; return w.items.filter(i => i.state !== 'leave').every(i => i.x >= 0 && i.x <= L.W && i.y >= 0 && i.y <= L.H); });
      await touch(c.cdp, 'touchEnd', []); await sleep(900);
      const after = await p.evaluate(id => { const w = SG.debug.world; const i = w.items.find(i => i.id === id); return { held: w.held, s: i && i.state }; }, it.id);
      const probs = await validateLayout(p);
      const ev = await evTypes(p);
      check(`[rotate ${dn}] ${k}: rotation cancels the drag, seeds stay inside the screen`, held === it.id && !mid.held && inside && probsMid.length === 0, { held, mid, inside, probsMid });
      check(`[rotate ${dn}] ${k}: no stale drop after lifting the finger`, !ev.includes('correct') && !ev.includes('wrong') && !ev.includes('miss') && !ev.includes('drop'), { ev });
      check(`[rotate ${dn}] ${k}: after release seed settled, layout valid`, !after.held && after.s !== 'drag' && probs.length === 0, { after, probs });
    }
    await p.setViewportSize(P.viewport); await sleep(500);
    r = await roundInfo(p);
    const it2 = r.items.find(i => i.state === 'idle');
    if (it2) {
      const ep = await emptyPoint(p, false);
      if (ep) {
        await drag(c, await css(p, it2.x, it2.y), await css(p, ep.x, ep.y), { settle: 120 });
        await p.setViewportSize(L.viewport); await sleep(900);
        const probs = await validateLayout(p);
        check(`[rotate ${dn}] rotate while a seed flies home: layout valid`, probs.length === 0, probs);
      }
    }
    await p.setViewportSize(L.viewport); await sleep(400);
    if ((await p.evaluate(() => SG.debug.world.state)) !== 'round') await waitRound(p, 20000).catch(() => {});
    r = await roundInfo(p);
    const it3 = r.items.find(i => i.state === 'idle');
    if (it3) {
      await clearEv(p);
      await dragItemToBasket(c, it3.id, it3.goal); await sleep(800);
      check(`[rotate ${dn}] still playable after rotations`, (await evTypes(p)).includes('correct'));
    }
    await p.screenshot({ path: path.join(OUT, `rotate-${dn}.png`) });
    check(`[rotate ${dn}] no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* Full bot sessions at high speed for every age, both languages. */
async function botSession(age, lang, dev, seed) {
  const N = `[bot age${age} ${lang} ${dev.name}]`;
  const c = await open(dev, `speed=12&bot=1&autostart=1&seed=${seed}&mute=1&age=${age}&lang=${lang}&skill=0.7`);
  const p = c.page;
  const t0 = Date.now();
  let done = false;
  try { await p.waitForFunction(() => SG.debug.mode === 'done', null, { timeout: 240000, polling: 500 }); done = true; } catch (e) { /* report below */ }
  const st = await p.evaluate(() => ({ s: SG.debug.getState(), stats: SG.debug.stats, bot: SG.debug.bot && SG.debug.bot.stats, levels: SG.debug.world.levels }));
  check(`${N} session reaches done (${((Date.now() - t0) / 1000).toFixed(0)} s)`, done, st);
  await p.evaluate(() => window.__collect());
  const dt = await p.evaluate(() => ({ done: document.getElementById('doneTitle').textContent, stars: document.getElementById('doneStars').textContent, wstars: SG.debug.world.stars }));
  if (done) {
    check(`${N} done screen shows stars`, +dt.stars === dt.wstars && dt.wstars > 0 && !badText(dt.done), dt);
    check(`${N} played all 4 chapters incl. Talk time`, st.stats.talks === 4 && st.levels.length === 4, { talks: st.stats.talks, levels: st.levels });
    await p.screenshot({ path: path.join(OUT, `bot-${age}-${lang}-done.png`) });
    await p.evaluate(() => SG.debug.setSpeed(1));
    await tapEl(c, '#btnAgain');
    await sleep(400);
    const ag = await p.evaluate(() => ({ mode: SG.debug.mode, level: SG.debug.world.level, sessions: SG.debug.stats.sessions, hud: document.getElementById('hudStars').textContent }));
    check(`${N} play again starts a new session`, ag.mode === 'play' && ag.level === 0 && ag.sessions === 2 && ag.hud === '0', ag);
  }
  const texts = await p.evaluate(() => ({ voice: SG.debug.voiceLog.map(l => l.lang + '|' + l.text), canvas: [...window.__texts] }));
  const bad = [];
  for (const v of texts.voice) { const [l, ...rest] = v.split('|'); const s = rest.join('|'); const why = badText(s); if (why) bad.push(why + ': ' + s); if (l !== lang) bad.push('wrong lang: ' + v); }
  for (const s of texts.canvas) { const why = badText(s); if (why) bad.push(why + ': ' + s); }
  check(`${N} every voice line non-empty, right language, no placeholders (${texts.voice.length} voice + ${texts.canvas.length} UI strings)`, texts.voice.length > 20 && bad.length === 0, [...new Set(bad)].slice(0, 12));
  if (lang === 'vi') {
    const viLike = texts.voice.filter(v => VI_RE.test(v)).length;
    const en = texts.voice.filter(v => EN_WORDS.test(v));
    check(`${N} Vietnamese lines really Vietnamese (diacritics)`, viLike / Math.max(1, texts.voice.length) > 0.6 && en.length === 0, { viLike, n: texts.voice.length, en: en.slice(0, 5) });
  }
  check(`${N} no console errors`, c.errors.length === 0, c.errors.slice(0, 5));
  fs.writeFileSync(path.join(OUT, `texts-${age}-${lang}.json`), JSON.stringify(texts, null, 1));
  await c.ctx.close();
  return Date.now() - t0;
}
async function gBot() {
  const jobs = [];
  const devs = [DEV.ipadL, DEV.iphoneP, DEV.iphoneL, DEV.ipadP];
  let k = 0;
  for (const age of [3, 4, 5, 6, 7]) for (const lang of ['en', 'vi']) jobs.push([age, lang, devs[k++ % devs.length], 10 + k]);
  const PAR = 5;
  for (let i = 0; i < jobs.length; i += PAR) await Promise.all(jobs.slice(i, i + PAR).map(j => botSession(...j)));
  const c = await open(DEV.iphoneL, 'speed=12&bot=1&autostart=1&autorestart=1&seed=3&mute=1&age=3');
  let ok = false;
  try { await c.page.waitForFunction(() => SG.debug.stats.sessions >= 2 && SG.debug.mode === 'play', null, { timeout: 240000, polling: 500 }); ok = true; } catch (e) { /* */ }
  check('[bot] autorestart starts a new session after done', ok, await c.page.evaluate(() => SG.debug.getState()));
  check('[bot] autorestart: no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

/* Low-skill bot exercising hints/idle at age 3 (mistake + help lines), both languages. */
async function gHelpLines() {
  for (const lang of ['en', 'vi']) {
    const c = await open(DEV.iphoneP, `speed=12&bot=1&autostart=1&seed=21&mute=1&age=3&lang=${lang}&skill=0`);
    await c.page.waitForFunction(() => SG.debug.world.level >= 1 || SG.debug.mode === 'done', null, { timeout: 120000, polling: 500 }).catch(() => {});
    await c.page.evaluate(() => { SG.debug.setBot(false); SG.debug.world.cancelDrag(); });
    await c.page.waitForFunction(() => SG.debug.world.state === 'round' && SG.debug.world.interactive, null, { timeout: 20000 }).catch(() => {});
    await c.page.evaluate(() => { window.__ev = []; });
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'idle'), null, { timeout: 20000 }).catch(() => {});
    const texts = await c.page.evaluate(() => SG.debug.voiceLog.map(l => l.lang + '|' + l.text));
    const ev = await c.page.evaluate(() => window.__ev.map(e => e.type));
    check(`[help ${lang}] idle nudge fires after 12 s`, ev.includes('idle'), ev);
    const bad = texts.map(s => { const [l, ...r] = s.split('|'); const t = r.join('|'); return [badText(t) || (l !== lang ? 'wrong lang' : null), s]; }).filter(x => x[0]);
    check(`[help ${lang}] wrong/miss/hint/idle lines clean (${texts.length} lines)`, bad.length === 0, bad.slice(0, 8));
    const st = await c.page.evaluate(() => SG.debug.stats);
    check(`[help ${lang}] low-skill bot made mistakes (wrong/miss) that were voiced`, st.wrong + st.misses > 0, st);
    await c.ctx.close();
  }
}

(async () => {
  const root = process.env.SG_GAME_ROOT ? path.resolve(process.env.SG_GAME_ROOT) : undefined;
  srv = await serve(root);
  if (root) console.log('NOTE: testing game at ' + root);
  browser = await chromium.launch();
  const T0 = Date.now();
  const groups = { boot: gBoot, lang: gLang, gate: gGate, settings: gSettings, input: gInput, pointer: gPointer, count: gCount, ask: gAsk, talk: gTalk, pause: gPause, rotate: gRotate, help: gHelpLines, bot: gBot };
  for (const [g, fn] of Object.entries(groups)) {
    if (!want(g)) continue;
    const t0 = Date.now();
    try { await fn(); } catch (e) { check(`[${g}] group crashed`, false, String(e.stack || e).slice(0, 600)); }
    console.log(`  (${g} ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), seconds: Math.round((Date.now() - T0) / 1000), pass: results.length - fails.length, fail: fails.length, flakeRetries: FLAKES, results }, null, 1));
  if (FLAKES.length) console.log(`(${FLAKES.length} touch-start retries, see results.json flakeRetries)`);
  console.log(`\n${results.length - fails.length} passed, ${fails.length} failed  (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
  process.exit(fails.length ? 1 : 0);
})();
