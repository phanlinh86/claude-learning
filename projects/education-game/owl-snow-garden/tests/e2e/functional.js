// Functional QA suite for Dino Nest Sort — real touch/mouse input on mobile contexts.
//   node tests/e2e/functional.js            (all groups)
//   node tests/e2e/functional.js input talk (only some groups)
// Prints PASS/FAIL lines, writes tests/out/functional/results.json + screenshots, exits 1 on any FAIL.
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
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 400)));
  return !!ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Text sanitiser shared by all groups.
const BARE_KEYS = ['praise', 'wrong', 'miss', 'hint', 'idle', 'great'];
function badText(s) {
  if (s == null) return null;
  s = String(s);
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|chapter)\.[a-zA-Z]/.test(s)) return 'raw i18n key';
  if (BARE_KEYS.includes(s.trim())) return 'bare key';
  return null;
}

/* Collect every user-visible string: canvas fillText/strokeText, and DOM text of bubble / talk / done / title. */
const INIT = () => {
  window.__texts = new Set();
  const add = t => { if (t != null && String(t).trim()) window.__texts.add(String(t)); };
  const P = CanvasRenderingContext2D.prototype, f = P.fillText;
  P.fillText = function (t, ...a) { add(t); return f.call(this, t, ...a); };
  window.__collect = () => ['bubbleText', 'talkQ', 'talkTitle', 'doneTitle', 'titleAge', 'tagline', 'micLabel', 'voiceInfo']
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
const clearEv = page => page.evaluate(() => { window.__ev = []; });
const mode = page => page.evaluate(() => SG.debug.mode);
const voiceN = page => page.evaluate(() => SG.debug.voiceLog.length);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);

/* ---------- input helpers (CDP touch = real pointer/touch events in Chromium) ---------- */
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
    if (!c.grabbedOnce || !d.near || d.near.d > d.near.r || d.mode !== 'play' || d.state !== 'round') break;   // input never worked here / nothing grabbable: genuine
    FLAKES.push(d);                                     // an item was under the finger but no grab: retry once, logged
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
    SG.debug.world.items.every(i => i.state === 'idle'), null, { timeout });
}
async function roundInfo(page) {
  return page.evaluate(() => {
    const w = SG.debug.world;
    return { mode: w.cur.mode, round: w.round, level: w.level, topic: w.topic,
      items: w.items.map(i => ({ id: i.id, answer: i.answer, x: i.x, y: i.y, size: i.size, state: i.state, homeX: i.homeX, homeY: i.homeY })),
      baskets: w.baskets.map(b => ({ id: b.id, x: b.x, y: b.y, w: b.w, h: b.h, need: b.need, count: b.count })),
      layout: w.layout };
  });
}
async function dragItemToBasket(c, itemId, basketId) {
  const r = await roundInfo(c.page);
  const it = r.items.find(i => i.id === itemId), b = r.baskets.find(x => x.id === basketId);
  const from = await css(c.page, it.x, it.y), to = await css(c.page, b.x, b.y - b.h * 0.1);
  await drag(c, from, to);
}
async function startPlay(c) { await tapEl(c, '#btnPlay'); await waitRound(c.page); }

/* Layout validator: idle items inside the play area, nests in the nest band, nothing under HUD / bubble. */
async function validateLayout(page) {
  return page.evaluate(() => {
    const w = SG.debug.world, L = w.layout, v = SG.debug.view(), P = L.play, probs = [];
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
      if (it.x < -1 || it.x > L.W + 1 || it.y < -1 || it.y > L.H + 1) probs.push(`${it.id} off-screen (${it.x | 0},${it.y | 0}) ${it.state}`);
      if (it.state === 'idle') {
        const r = toCss(it.x - hs, it.y - hs, it.size, it.size);
        if (ov(r, hud)) probs.push(`${it.id} under HUD`);
        if (ov(r, bub)) probs.push(`${it.id} under bubble`);
      }
      if (it.state === 'in') {
        const b = w.baskets.find(b => b.id === it.basketId);
        if (!b || Math.abs(it.x - b.x) > b.w / 2 + 5 || Math.abs(it.y - b.y) > b.h) probs.push(`${it.id} 'in' but not in its nest`);
      }
    }
    for (const b of w.baskets) {
      if (b.x - b.w / 2 < -1 || b.x + b.w / 2 > L.W + 1 || b.y > L.H) probs.push(`nest ${b.id} off-screen`);
      const r = toCss(b.x - b.w / 2, b.y - b.h * 0.4, b.w, b.h);
      if (ov(r, hud)) probs.push(`nest ${b.id} under HUD`);
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
      hud: document.getElementById('hud').classList.contains('hidden'), loading: document.getElementById('loading').classList.contains('hidden') }));
    check(`[${d.name}] boot to title`, t.mode === 'title' && t.title && t.hud && t.loading, t);
    check(`[${d.name}] title shows stars + age`, /^\d+$/.test(t.stars) && /4/.test(t.age), t);
    // play button inside the viewport, not clipped
    const bb = await c.page.locator('#btnPlay').boundingBox();
    check(`[${d.name}] play button on screen`, bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= d.viewport.width && bb.y + bb.height <= d.viewport.height, bb);
    await c.page.screenshot({ path: path.join(OUT, d.name + '-title.png') });
    await sleep(300);
    check(`[${d.name}] no console errors at boot`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

async function gLang() {
  const d = DEV.iphoneP;
  const c = await open(d, 'mute=1', { storage: { 'dn:settings': JSON.stringify({ lang: 'en', age: 5 }) } });
  const before = await c.page.evaluate(() => [document.getElementById('logo1').textContent, document.getElementById('tagline').textContent, document.documentElement.lang]);
  await tapEl(c, '#scrTitle .chip[data-lang="vi"]');
  await sleep(150);
  const after = await c.page.evaluate(() => [document.getElementById('logo1').textContent, document.getElementById('tagline').textContent, document.documentElement.lang, document.querySelector('#scrTitle .chip[data-lang="vi"]').classList.contains('on'), document.getElementById('titleAge').textContent]);
  check('[lang] title chip EN→VI changes DOM text', before[0] === 'Dino' && after[0] !== before[0] && after[1] !== before[1] && after[2] === 'vi' && after[3], { before, after });
  check('[lang] VI title shows age in Vietnamese', /5/.test(after[4]) && after[4] !== 'Age 5', after[4]);
  const vl = await c.page.evaluate(() => SG.debug.voiceLog.slice(-1)[0]);
  check('[lang] chip tap greets in the new language', vl && vl.lang === 'vi', vl);
  await c.page.reload(); await waitTitle(c.page);
  const re = await c.page.evaluate(() => [document.getElementById('logo1').textContent, document.documentElement.lang, JSON.parse(localStorage.getItem('dn:settings') || '{}').lang]);
  check('[lang] VI persists after reload', re[0] === after[0] && re[1] === 'vi' && re[2] === 'vi', re);
  await tapEl(c, '#scrTitle .chip[data-lang="en"]'); await sleep(100);
  const back = await c.page.evaluate(() => document.getElementById('logo1').textContent);
  check('[lang] VI→EN switches back', back === 'Dino', back);
  check('[lang] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

async function gGate() {
  for (const d of [DEV.iphoneP, DEV.iphoneL, DEV.ipadL]) {
    const c = await open(d, 'mute=1');
    const g = await c.page.locator('#btnParents').boundingBox();
    const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
    check(`[${d.name}] gear is >= 44px tap target`, g.width >= 44 && g.height >= 44, g);
    // short tap
    await tap(c, gx, gy); await sleep(500);
    check(`[${d.name}] short tap on gear does NOT open settings`, !(await visible(c.page, 'scrSettings')));
    // 1.2 s hold then release: still closed
    await touch(c.cdp, 'touchStart', [{ x: gx, y: gy }]); await sleep(1200); await touch(c.cdp, 'touchEnd', []); await sleep(300);
    check(`[${d.name}] 1.2 s hold does NOT open settings`, !(await visible(c.page, 'scrSettings')));
    // hold + slide away cancels
    await touch(c.cdp, 'touchStart', [{ x: gx, y: gy }]); await sleep(400);
    await touch(c.cdp, 'touchMove', [{ x: gx - 150, y: gy + 150 }]); await sleep(2000); await touch(c.cdp, 'touchEnd', []); await sleep(200);
    check(`[${d.name}] hold that slides off the gear is cancelled`, !(await visible(c.page, 'scrSettings')));
    // touch hold 2.2 s
    await touch(c.cdp, 'touchStart', [{ x: gx, y: gy }]); await sleep(2200); await touch(c.cdp, 'touchEnd', []); await sleep(300);
    check(`[${d.name}] 2.2 s touch hold opens settings`, await visible(c.page, 'scrSettings'));
    await c.page.screenshot({ path: path.join(OUT, d.name + '-settings.png') });
    // settings panel fits / scrolls
    const pan = await c.page.evaluate(() => { const p = document.querySelector('.settings-panel').getBoundingClientRect(); const done = document.getElementById('btnSettingsDone'); return { b: p.bottom, t: p.top, vh: innerHeight, sh: document.querySelector('.settings-panel').scrollHeight, ch: document.querySelector('.settings-panel').clientHeight, doneTop: done.offsetTop }; });
    check(`[${d.name}] settings panel inside viewport`, pan.t >= 0 && pan.b <= pan.vh + 1, pan);
    const doneVis = await c.page.evaluate(() => { const r = document.getElementById('btnSettingsDone').getBoundingClientRect(); return { top: r.top, bottom: r.bottom, vh: innerHeight }; });
    check(`[${d.name}] settings Done button visible without scrolling`, doneVis.bottom <= doneVis.vh, doneVis);
    await tapEl(c, '#btnSettingsDone'); await sleep(200);
    check(`[${d.name}] Done returns to title`, (await visible(c.page, 'scrTitle')) && !(await visible(c.page, 'scrSettings')));
    // mouse hold 2.2 s
    await c.page.mouse.move(gx, gy); await c.page.mouse.down(); await sleep(400); await c.page.mouse.up(); await sleep(300);
    check(`[${d.name}] short mouse click does NOT open settings`, !(await visible(c.page, 'scrSettings')));
    await c.page.mouse.down(); await sleep(2200); await c.page.mouse.up(); await sleep(300);
    check(`[${d.name}] 2.2 s mouse hold opens settings`, await visible(c.page, 'scrSettings'));
    check(`[${d.name}] gate: no console errors`, c.errors.length === 0, c.errors);
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
  const c = await open(d, 'mute=1', { storage: { 'dn:settings': JSON.stringify({ lang: 'en', age: 4 }) } });
  await openSettingsByHold(c);
  await tapEl(c, '#ageChips .chip[data-age="6"]');
  await tapEl(c, '#scrSettings .chip[data-lang="vi"]');
  await c.page.locator('#inpName').fill('Linh');
  for (const id of ['optSfx', 'optMusic', 'optMic']) { await tapEl(c, `label:has(#${id})`); }
  await sleep(150);
  const st = await c.page.evaluate(() => JSON.parse(localStorage.getItem('dn:settings') || 'null'));
  check('[settings] changes saved to dn:settings', st && st.age === 6 && st.lang === 'vi' && st.name === 'Linh' && st.sfx === false && st.music === false && st.mic === false && st.voice === true, st);
  await tapEl(c, '#btnSettingsDone'); await sleep(150);
  const ta = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('[settings] title age updates after Done', /6/.test(ta), ta);
  await c.page.reload(); await waitTitle(c.page); await installEv(c.page);
  await openSettingsByHold(c);
  const dom = await c.page.evaluate(() => ({ age: [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age), name: document.getElementById('inpName').value,
    sfx: document.getElementById('optSfx').checked, music: document.getElementById('optMusic').checked, voice: document.getElementById('optVoice').checked, mic: document.getElementById('optMic').checked, lang: document.documentElement.lang }));
  check('[settings] persist across reload (DOM)', dom.age.join() === '6' && dom.name === 'Linh' && !dom.sfx && !dom.music && dom.voice && !dom.mic && dom.lang === 'vi', dom);
  // name sanitised
  await c.page.locator('#inpName').fill('{child}<b>');
  await sleep(100);
  const nm = await c.page.evaluate(() => JSON.parse(localStorage.getItem('dn:settings')).name);
  check('[settings] name strips {} <>', !/[{}<>]/.test(nm), nm);
  await c.page.locator('#inpName').fill('Linh');
  // age 7 chip shows 7+
  await tapEl(c, '#ageChips .chip[data-age="7"]'); await tapEl(c, '#btnSettingsDone'); await sleep(100);
  const t7 = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('[settings] age 7 shows 7+', /7\+/.test(t7), t7);
  // name appears in what Bo says
  await startPlay(c);
  const lines = await c.page.evaluate(() => SG.debug.voiceLog.map(l => l.text));
  check('[settings] game starts at saved age (7 → topics for 7)', (await c.page.evaluate(() => SG.debug.world.age)) >= 7, await c.page.evaluate(() => SG.debug.world.age));
  check('[settings] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();

  // ---- URL flags must not leak into saved settings
  const c2 = await open(d, 'lang=vi&age=6&mute=1', { storage: { 'dn:settings': JSON.stringify({ lang: 'en', age: 4, name: '', sfx: true, music: true, voice: true, mic: true }) } });
  let s0 = await c2.page.evaluate(() => JSON.parse(localStorage.getItem('dn:settings')));
  check('[flags] boot with ?lang=vi&age=6&mute=1 does not write settings', s0.lang === 'en' && s0.age === 4, s0);
  const ui = await c2.page.evaluate(() => ({ lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent }));
  check('[flags] ?lang=vi applies to the UI for the session', ui.lang === 'vi', ui);
  check('[flags] title age reflects ?age=6 override', /6/.test(ui.age), ui);
  await openSettingsByHold(c2);
  await tapEl(c2, 'label:has(#optSfx)'); await sleep(100);       // parent toggles an unrelated option
  s0 = await c2.page.evaluate(() => JSON.parse(localStorage.getItem('dn:settings')));
  check('[flags] toggling a setting under ?lang=vi does not save lang=vi', s0.lang === 'en', s0);
  check('[flags] toggling a setting under ?age=6 does not save age=6', s0.age === 4, s0);
  check('[flags] ?mute=1 not saved', !('mute' in s0) && s0.sfx === false, s0);
  await c2.ctx.close();
}

/* Real input on the canvas: correct / wrong / miss / hint / HUD / bubble / second finger / tap Bo. */
async function gInput() {
  for (const d of ALL) {
    const N = `[${d.name}]`;
    const c = await open(d, 'mute=1&seed=4&age=4');
    const p = c.page;
    await startPlay(c);
    let r = await roundInfo(p);
    check(`${N} round 1 is sort mode with >= 2 nests`, r.mode === 'sort' && r.baskets.length >= 2, { mode: r.mode, n: r.baskets.length });
    let probs = await validateLayout(p);
    check(`${N} initial layout valid`, probs.length === 0, probs);

    // --- HUD tap (star counter, not a button) and bubble tap must not grab
    await clearEv(p);
    const vn0 = await voiceN(p);
    await tapEl(c, '#hud .hud-stars'); await sleep(400);    // >320 ms: kidProof swallows a 2nd tap within 320 ms (double-tap-zoom guard)
    await tapEl(c, '#bubble'); await sleep(200);
    let ev = await evTypes(p);
    check(`${N} tapping HUD / bubble never grabs`, !ev.includes('grab') && (await p.evaluate(() => SG.debug.world.held)) == null, ev);
    const lastLine = await p.evaluate(() => SG.debug.voiceLog.slice(-1)[0].text), bub = await p.evaluate(() => document.getElementById('bubbleText').textContent);
    check(`${N} tapping bubble repeats the prompt`, (await voiceN(p)) > vn0 && lastLine === bub, { lastLine, bub });

    // --- tap Bo repeats the prompt
    const bo = r.layout.bo;
    const bp = await css(p, bo.x, bo.y - bo.h * 0.5);
    const vn1 = await voiceN(p);
    await clearEv(p);
    await tap(c, bp.x, bp.y); await sleep(200);
    const ll = await p.evaluate(() => SG.debug.voiceLog.slice(-1)[0].text);
    check(`${N} tap Bo repeats the prompt`, (await voiceN(p)) > vn1 && ll === bub && !(await evTypes(p)).includes('grab'), { ll, bub });

    // --- correct drop
    r = await roundInfo(p);
    const A = r.items[0];
    await clearEv(p);
    const vn2 = await voiceN(p);
    await dragItemToBasket(c, A.id, A.answer);
    await sleep(800);
    ev = await evTypes(p);
    const stA = await p.evaluate(id => SG.debug.world.items.find(i => i.id === id).state, A.id);
    check(`${N} drag to correct nest → grab+correct+land, item in nest`, ev.includes('grab') && ev.includes('correct') && ev.includes('land') && stA === 'in', { ev, stA });
    check(`${N} correct drop makes Bo speak`, (await voiceN(p)) > vn2);

    // --- wrong drop (needs a different nest)
    r = await roundInfo(p);
    const B = r.items.find(i => i.state === 'idle');
    const wrongB = r.baskets.find(b => b.id !== B.answer);
    await clearEv(p);
    await dragItemToBasket(c, B.id, wrongB.id);
    await sleep(900);
    ev = await evTypes(p);
    const bs = await p.evaluate(id => { const i = SG.debug.world.items.find(i => i.id === id); return { s: i.state, dx: Math.abs(i.x - i.homeX), dy: Math.abs(i.y - i.homeY) }; }, B.id);
    check(`${N} drag to wrong nest → wrong event, item returns home`, ev.includes('wrong') && !ev.includes('correct') && bs.s === 'idle' && bs.dx < 6 && bs.dy < 6, { ev, bs });

    // --- miss x2 → hint glow (use another idle item, or B again if alone)
    r = await roundInfo(p);
    const C = r.items.find(i => i.state === 'idle' && i.id !== B.id) || r.items.find(i => i.state === 'idle');
    const sky = await css(p, r.layout.play.x + r.layout.play.w * 0.5, r.layout.bubble.y + r.layout.bubble.h + 10 > r.layout.play.y ? r.layout.play.y + 5 : r.layout.play.y);
    // pick a sky point that is not over a nest: top-middle of play area
    await clearEv(p);
    let cc = await roundInfo(p); let Ci = cc.items.find(i => i.id === C.id);
    await drag(c, await css(p, Ci.x, Ci.y), sky);
    await sleep(800);
    ev = await evTypes(p);
    check(`${N} drop on empty sky → miss, item returns`, ev.includes('miss') && !ev.includes('wrong') && !ev.includes('correct'), { ev, C: { id: Ci.id, x: Ci.x | 0, y: Ci.y | 0, s: Ci.state }, sky, bo: r.layout.bo, mode: await mode(p), st: await p.evaluate(() => SG.debug.world.state) });
    cc = await roundInfo(p); Ci = cc.items.find(i => i.id === C.id);
    await drag(c, await css(p, Ci.x, Ci.y), sky);
    await sleep(500);
    ev = await evTypes(p);
    const glow = await p.evaluate(id => { const w = SG.debug.world; const it = w.items.find(i => i.id === id); return w.baskets.find(b => b.id === it.answer).glow; }, C.id);
    check(`${N} two misses on one item → hint, its nest glows`, ev.filter(e => e === 'miss').length === 2 && ev.includes('hint') && glow > 0.5, { ev, glow });

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
      await touch(c.cdp, 'touchMove', [{ x: f1.x + 20, y: f1.y - 20, id: 0 }]); await sleep(50);     // finger 2 lifts (CDP: point omitted)
      await touch(c.cdp, 'touchEnd', []); await sleep(700);
      ev = await evTypes(p);
      check(`${N} second finger ignored (one grab, first item)`, ev.filter(e => e === 'grab').length === 1 && held === idle[0].id, { ev, held });
      // second finger lifted first must not drop the first finger's item
      await clearEv(p);
      await touch(c.cdp, 'touchStart', [{ x: f1.x, y: f1.y, id: 0 }]); await sleep(50);
      await touch(c.cdp, 'touchStart', [{ x: f1.x, y: f1.y, id: 0 }, { x: f2.x, y: f2.y, id: 1 }]); await sleep(50);
      await touch(c.cdp, 'touchMove', [{ x: f1.x + 5, y: f1.y + 5, id: 0 }]); await sleep(80);     // 2nd finger lifts, 1st stays
      const still = await p.evaluate(() => SG.debug.world.held);
      await touch(c.cdp, 'touchEnd', []); await sleep(600);
      check(`${N} lifting the 2nd finger keeps the 1st finger's drag`, still === idle[0].id, { still });
    } else check(`${N} second finger ignored`, true, 'skipped: <2 idle items');

    // --- finish the round correctly → roundDone + HUD stars
    await sleep(400);
    for (let k = 0; k < 12; k++) {
      r = await roundInfo(p);
      if (p && (await p.evaluate(() => SG.debug.world.state)) !== 'round') break;
      const it = r.items.find(i => i.state === 'idle');
      if (!it) { await sleep(300); continue; }
      await dragItemToBasket(c, it.id, it.answer); await sleep(650);
    }
    await p.waitForFunction(() => SG.debug.world.state !== 'round', null, { timeout: 5000 }).catch(() => {});
    await sleep(1600);
    const hs = await p.evaluate(() => ({ hud: +document.getElementById('hudStars').textContent, stars: SG.debug.world.stars, ev: window.__ev.filter(e => e.type === 'roundDone').map(e => e.stars) }));
    check(`${N} round done → stars fly into HUD counter`, hs.ev.length === 1 && hs.stars >= 1 && hs.hud === hs.stars, hs);
    check(`${N} input: no console errors`, c.errors.length === 0, c.errors);
    await c.page.screenshot({ path: path.join(OUT, d.name + '-after-round.png') });
    await c.ctx.close();
  }
}

/* Mouse drag (iPad with trackpad / desktop) */
async function gMouse() {
  const c = await open(DEV.ipadL, 'mute=1&seed=4&age=4');
  await startPlay(c);
  const r = await roundInfo(c.page);
  const it = r.items[0], b = r.baskets.find(x => x.id === it.answer);
  const f = await css(c.page, it.x, it.y), t = await css(c.page, b.x, b.y - b.h * 0.1);
  await clearEv(c.page);
  await c.page.mouse.move(f.x, f.y); await c.page.mouse.down();
  await c.page.mouse.move(t.x, t.y, { steps: 14 }); await sleep(300); await c.page.mouse.up(); await sleep(800);
  const ev = await evTypes(c.page);
  check('[mouse] mouse drag to correct nest works', ev.includes('correct') && ev.includes('land'), ev);
  await c.ctx.close();
}

/* Count mode at age 4: the chapter index comes from SG.AGE_TOPICS (task spec said level 2; order may change). */
let COUNT_LVL = null;
async function countLevel() {
  if (COUNT_LVL != null) return COUNT_LVL;
  const c = await open(DEV.ipadL, 'mute=1&age=4');
  COUNT_LVL = await c.page.evaluate(() => SG.AGE_TOPICS[4].indexOf('count'));
  check('[count] age 4 has a count chapter', COUNT_LVL >= 0, COUNT_LVL);
  await c.ctx.close();
  return COUNT_LVL;
}
async function gCount() {
  const lvl = await countLevel();
  for (const seed of [5, 9]) {
    const c = await open(DEV.ipadL, `mute=1&seed=${seed}&age=4&level=${lvl}`);
    const p = c.page;
    await startPlay(c);
    let r = await roundInfo(p);
    const b = r.baskets[0];
    check(`[count s${seed}] level=${lvl} at age 4 is a count round with 1 nest`, r.mode === 'count' && r.baskets.length === 1 && b.need >= 1, { mode: r.mode, nests: r.baskets.length, need: b.need, topic: r.topic });
    const bub = await p.evaluate(() => document.getElementById('bubbleText').textContent);
    check(`[count s${seed}] prompt mentions the number`, bub.length > 0 && !badText(bub), bub);
    check(`[count s${seed}] more fruit than needed (real counting)`, r.items.length > b.need, { items: r.items.length, need: b.need });
    await clearEv(p);
    const vlBefore = await voiceN(p);
    let ok = true;
    for (let k = 0; k < b.need; k++) {
      r = await roundInfo(p);
      const it = r.items.find(i => i.state === 'idle');
      await dragItemToBasket(c, it.id, b.id);
      await sleep(700);
      const st = await p.evaluate(() => ({ s: SG.debug.world.state, c: SG.debug.world.baskets[0] && SG.debug.world.baskets[0].count }));
      if (k < b.need - 1 && st.s !== 'round') { ok = false; check(`[count s${seed}] round ended early after ${k + 1}/${b.need}`, false, st); break; }
    }
    const st = await p.evaluate(() => ({ s: SG.debug.world.state, count: SG.debug.world.baskets[0].count, inN: SG.debug.world.items.filter(i => i.state === 'in').length }));
    check(`[count s${seed}] exactly N fruit ends the round`, ok && st.s === 'roundDone' && st.count === b.need && st.inN === b.need, { need: b.need, st });
    const nums = await p.evaluate(n => SG.debug.voiceLog.slice(-n).map(l => l.text), (await voiceN(p)) - vlBefore);
    check(`[count s${seed}] Bo counts aloud while landing`, nums.length >= b.need, nums);
    check(`[count s${seed}] no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
  // overfill: a quick extra fruit thrown while the last one is in the air must not count
  const c = await open(DEV.ipadL, `mute=1&seed=5&age=4&level=${lvl}`);
  await startPlay(c);
  let r = await roundInfo(c.page);
  const b = r.baskets[0];
  for (let k = 0; k < b.need - 1; k++) { r = await roundInfo(c.page); const it = r.items.find(i => i.state === 'idle'); await dragItemToBasket(c, it.id, b.id); await sleep(700); }
  r = await roundInfo(c.page);
  const idle = r.items.filter(i => i.state === 'idle');
  const to = await css(c.page, b.x, b.y - b.h * 0.1);
  await drag(c, await css(c.page, idle[0].x, idle[0].y), to, { steps: 4, settle: 120 });
  await drag(c, await css(c.page, idle[1].x, idle[1].y), to, { steps: 4, settle: 120 });
  await sleep(900);
  const st = await c.page.evaluate(() => ({ s: SG.debug.world.state, count: SG.debug.world.baskets[0] ? SG.debug.world.baskets[0].count : -1 }));
  check('[count] extra fruit after the Nth is rejected', st.count === b.need, { need: b.need, st });
  await c.ctx.close();
}

/* Talk time via the bot, then hand control to a real finger. */
async function reachTalk(c) {
  const p = c.page;
  await p.evaluate(() => { SG.debug.setBot(true, 1); SG.debug.setSpeed(12); });
  await p.waitForFunction(() => {
    if (SG.debug.world.state === 'talk' && !SG.debug.world.talkAnswered) { SG.debug.setBot(false); SG.debug.world.cancelDrag(); SG.debug.setSpeed(1); return true; }
    return false;
  }, null, { timeout: 60000, polling: 'raf' });
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
    check(`${N} talk texts clean`, [txt.q, txt.title, ...txt.ch].every(s => s && !badText(s)), txt);
    await p.screenshot({ path: path.join(OUT, `${d.name}-talk-${lang}.png`) });
    // all choices visible inside the viewport and big enough
    const boxes = await p.evaluate(() => [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: r.width, h: r.height }; }));
    check(`${N} choices on screen, >= 60px`, boxes.length >= 2 && boxes.every(b => b.l >= 0 && b.t >= 0 && b.r <= d.viewport.width && b.b <= d.viewport.height && b.w >= 60 && b.h >= 60), boxes);
    const ans = t.talk.answerId;
    const pick = right ? ans : t.talk.choices.find(x => x.id !== ans).id;
    const other = t.talk.choices.find(x => x.id !== pick).id;
    await clearEv(p);
    const sel = `#talkChoices button[data-id="${pick}"]`;
    const bb = await p.locator(sel).boundingBox();
    // double tap the same choice, then tap another one: only one answer may count
    await tap(c, bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(40);
    await tap(c, bb.x + bb.width / 2, bb.y + bb.height / 2); await sleep(40);
    await tapEl(c, `#talkChoices button[data-id="${other}"]`);
    await sleep(200);
    const res = await p.evaluate(() => ({ ev: window.__ev.filter(e => e.type === 'talkResult'), talks: SG.debug.stats.talks, cls: [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id + ':' + b.className) }));
    check(`${N} exactly one talkResult (double tap / second choice ignored)`, res.ev.length === 1 && res.talks === 1 && res.ev[0].correct === right, res);
    check(`${N} right answer highlighted`, res.cls.some(s => s.startsWith(ans + ':') && /right/.test(s)), res.cls);
    const said = await p.evaluate(() => SG.debug.voiceLog.slice(-1)[0]);
    check(`${N} Bo responds in ${lang}`, said && said.lang === lang && !badText(said.text), said);
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
  const mus = () => p.evaluate(() => SG.Audio._playing);
  check('[pause] music playing in game', await mus());
  // hold an item, then pause: drag must cancel
  const r = await roundInfo(p);
  const f = await css(p, r.items[0].x, r.items[0].y);
  await touch(c.cdp, 'touchStart', [f]); await sleep(50); await touch(c.cdp, 'touchMove', [{ x: f.x + 30, y: f.y + 30 }]); await sleep(80);
  const held0 = await p.evaluate(() => SG.debug.world.held);
  await p.evaluate(() => document.getElementById('btnPause').click());   // a second hand presses pause
  await sleep(150);
  await touch(c.cdp, 'touchEnd', []); await sleep(100);
  const ps = await p.evaluate(() => ({ mode: SG.debug.mode, held: SG.debug.world.held, drag: SG.debug.world.items.filter(i => i.state === 'drag').length }));
  check('[pause] pausing while holding cancels the drag', held0 && ps.mode === 'paused' && !ps.held && ps.drag === 0, { held0, ps });
  await tapEl(c, '#btnResume'); await sleep(200);
  check('[pause] resume via button', (await mode(p)) === 'play' && !(await visible(p, 'scrPause')) && await mus());
  // HUD pause by real tap
  await tapEl(c, '#btnPause'); await sleep(200);
  check('[pause] HUD pause button pauses (touch)', (await mode(p)) === 'paused' && (await visible(p, 'scrPause')) && !(await mus()));
  const t0 = await p.evaluate(() => SG.debug.world.time); await sleep(500);
  check('[pause] world frozen while paused', (await p.evaluate(() => SG.debug.world.time)) === t0);
  await tapEl(c, '#btnResume'); await sleep(200);
  check('[pause] resume', (await mode(p)) === 'play');
  // visibility hidden → paused
  const setHidden = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await setHidden(true); await sleep(200);
  check('[pause] page hidden → paused', (await mode(p)) === 'paused');
  await setHidden(false); await sleep(200);
  check('[pause] page visible again → stays paused until child taps', (await mode(p)) === 'paused' && (await visible(p, 'scrPause')));
  await tapEl(c, '#btnResume'); await sleep(200);
  // home
  await tapEl(c, '#btnPause'); await sleep(150);
  await tapEl(c, '#btnHome'); await sleep(300);
  const h = await p.evaluate(() => ({ mode: SG.debug.mode, music: SG.Audio._playing, hud: document.getElementById('hud').classList.contains('hidden'), bubble: document.getElementById('bubble').classList.contains('hidden'), title: !document.getElementById('scrTitle').classList.contains('hidden') }));
  check('[pause] Home → title, music stopped, HUD+bubble hidden', h.mode === 'title' && !h.music && h.hud && h.bubble && h.title, h);
  // play again from title
  await startPlay(c);
  check('[pause] Play from title after Home starts a fresh session', (await p.evaluate(() => SG.debug.world.level === 0 && SG.debug.world.round === 0)) && await mus());
  // double tap on Play (fast) must not start two sessions
  await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(200);
  const s0 = await p.evaluate(() => SG.debug.stats.sessions);
  const pb = await p.locator('#btnPlay').boundingBox();
  await tap(c, pb.x + pb.width / 2, pb.y + pb.height / 2); await tap(c, pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(300);
  check('[pause] double tap on Play starts exactly one session', (await p.evaluate(() => SG.debug.stats.sessions)) === s0 + 1);
  // visibility hidden while in Talk time
  await waitRound(p);
  await reachTalk(c);
  await setHidden(true); await sleep(150);
  const mt = await p.evaluate(() => ({ mode: SG.debug.mode, music: SG.Audio._playing, ctx: SG.Audio.ctx && SG.Audio.ctx.state }));
  await setHidden(false); await sleep(150);
  check('[pause] page hidden during Talk time silences audio', !mt.music || mt.ctx !== 'running', mt);
  check('[pause] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

/* Rotation: resize portrait↔landscape while idle and while holding an item. */
async function gRotate() {
  for (const [P, L] of [[DEV.iphoneP, DEV.iphoneL], [DEV.ipadP, DEV.ipadL]]) {
    const dn = P.name.split('-')[0];
    const c = await open(P, 'mute=1&seed=8&age=5');
    const p = c.page;
    await startPlay(c);
    // place one item in a nest first so 'in' items get relaid too
    let r = await roundInfo(p);
    await dragItemToBasket(c, r.items[0].id, r.items[0].answer); await sleep(800);
    for (const [k, vp] of [['→landscape idle', L.viewport], ['→portrait idle', P.viewport]]) {
      await p.setViewportSize(vp); await sleep(600);
      const probs = await validateLayout(p);
      const v = await p.evaluate(() => { const v = SG.debug.view(); return { fits: v.cssW <= innerWidth + 1 && v.cssH <= innerHeight + 1, W: v.W, H: v.H, iw: innerWidth, ih: innerHeight }; });
      check(`[rotate ${dn}] ${k}: layout valid`, probs.length === 0 && v.fits && (v.W > v.H) === (v.iw > v.ih), { probs, v });
    }
    // hold an item and rotate
    for (const [k, vp, back] of [['hold →landscape', L.viewport, P.viewport], ['hold →portrait', P.viewport, L.viewport]]) {
      await p.setViewportSize(back); await sleep(500);
      await p.evaluate(() => { window.__ev = []; });
      r = await roundInfo(p);
      const it = r.items.find(i => i.state === 'idle');
      if (!it) { check(`[rotate ${dn}] ${k}`, true, 'skipped: no idle item'); continue; }
      const f = await css(p, it.x, it.y);
      await touch(c.cdp, 'touchStart', [f]); await sleep(50);
      await touch(c.cdp, 'touchMove', [{ x: f.x + 15, y: f.y - 15 }]); await sleep(100);
      const held = await p.evaluate(() => SG.debug.world.held);
      await p.setViewportSize(vp); await sleep(500);
      const mid = await p.evaluate(() => { const w = SG.debug.world; const it = w.items.find(i => i.id === w.held); return { held: w.held, it: it && { x: it.x, y: it.y, s: it.state }, W: w.layout.W, H: w.layout.H }; });
      const probsMid = await validateLayout(p);
      // finger is now at a meaningless spot; lift it
      await touch(c.cdp, 'touchEnd', []); await sleep(900);
      const after = await p.evaluate(id => { const w = SG.debug.world; const i = w.items.find(i => i.id === id); return { held: w.held, s: i && i.state }; }, it.id);
      const probs = await validateLayout(p);
      const ev = await evTypes(p);
      check(`[rotate ${dn}] ${k}: held item stays on screen during rotation`, held && probsMid.length === 0, { held, mid, probsMid });
      check(`[rotate ${dn}] ${k}: drag cancelled by rotation (no stale drop)`, !ev.includes('correct') && !ev.includes('wrong') && !ev.includes('miss'), { ev, mid });
      check(`[rotate ${dn}] ${k}: after release item settled, layout valid`, !after.held && after.s !== 'drag' && probs.length === 0, { after, probs });
    }
    // rotate during flight / return arcs
    await p.setViewportSize(P.viewport); await sleep(500);
    r = await roundInfo(p);
    const it2 = r.items.find(i => i.state === 'idle');
    if (it2) {
      const sky = await css(p, r.layout.play.x + r.layout.play.w / 2, r.layout.play.y + 4);
      await drag(c, await css(p, it2.x, it2.y), sky, { settle: 120, beforeUp: async () => {} });
      await p.setViewportSize(L.viewport); await sleep(900);
      const probs = await validateLayout(p);
      check(`[rotate ${dn}] rotate while an item flies home: layout valid`, probs.length === 0, probs);
    }
    // finish game state sanity: still playable after rotations
    await p.setViewportSize(L.viewport); await sleep(400);
    r = await roundInfo(p);
    const it3 = r.items.find(i => i.state === 'idle');
    if (it3) {
      await clearEv(p);
      await dragItemToBasket(c, it3.id, it3.answer); await sleep(800);
      check(`[rotate ${dn}] still playable after rotations`, (await evTypes(p)).includes('correct'));
    }
    await p.screenshot({ path: path.join(OUT, `rotate-${dn}.png`) });
    check(`[rotate ${dn}] no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* Full bot sessions at speed 12 for every age, both languages. */
async function botSession(age, lang, dev, seed) {
  const N = `[bot age${age} ${lang} ${dev.name}]`;
  const c = await open(dev, `speed=12&bot=1&autostart=1&seed=${seed}&mute=1&age=${age}&lang=${lang}&skill=0.7`);
  const p = c.page;
  const t0 = Date.now();
  let done = false;
  try { await p.waitForFunction(() => SG.debug.mode === 'done', null, { timeout: 240000, polling: 500 }); done = true; } catch (e) { /* report below */ }
  const st = await p.evaluate(() => ({ s: SG.debug.getState(), stats: SG.debug.stats, bot: SG.debug.bot && SG.debug.bot.stats, levels: SG.debug.world.levels }));
  check(`${N} session reaches done`, done, st.s);
  await p.evaluate(() => window.__collect());
  const dt = await p.evaluate(() => ({ done: document.getElementById('doneTitle').textContent, stars: document.getElementById('doneStars').textContent, wstars: SG.debug.world.stars }));
  if (done) {
    check(`${N} done screen shows stars`, +dt.stars === dt.wstars && dt.wstars > 0 && !badText(dt.done), dt);
    check(`${N} played all chapters (4) incl. Talk time`, st.stats.talks === 4 && st.levels.length === 4, { talks: st.stats.talks, levels: st.levels });
    await p.screenshot({ path: path.join(OUT, `bot-${age}-${lang}-done.png`) });
    // play again (back to speed 1 so the bot cannot earn stars before we look)
    await p.evaluate(() => SG.debug.setSpeed(1));
    await tapEl(c, '#btnAgain');
    await sleep(400);
    const ag = await p.evaluate(() => ({ mode: SG.debug.mode, level: SG.debug.world.level, sessions: SG.debug.stats.sessions, hud: document.getElementById('hudStars').textContent }));
    check(`${N} play again starts a new session`, ag.mode === 'play' && ag.level === 0 && ag.sessions === 2 && ag.hud === '0', ag);
  }
  // text checks
  const texts = await p.evaluate(() => ({ voice: SG.debug.voiceLog.map(l => l.lang + '|' + l.text), canvas: [...window.__texts] }));
  const bad = [];
  for (const v of texts.voice) { const [l, ...rest] = v.split('|'); const s = rest.join('|'); const why = badText(s); if (why) bad.push(why + ': ' + s); if (l !== lang) bad.push('wrong lang: ' + v); }
  for (const s of texts.canvas) { const why = badText(s); if (why) bad.push(why + ': ' + s); }
  check(`${N} no placeholder/undefined/NaN in ${texts.voice.length} voice + ${texts.canvas.length} UI strings`, bad.length === 0, [...new Set(bad)].slice(0, 12));
  if (lang === 'vi') {
    const viLike = texts.voice.filter(v => /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(v)).length;
    const en = texts.voice.filter(v => /\b(the|nest|Put|egg|Yes|Great|Chapter)\b/.test(v));
    check(`${N} Vietnamese lines really Vietnamese`, viLike / Math.max(1, texts.voice.length) > 0.6 && en.length === 0, { viLike, n: texts.voice.length, en: en.slice(0, 5) });
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
  // autorestart
  const c = await open(DEV.iphoneL, 'speed=12&bot=1&autostart=1&autorestart=1&seed=3&mute=1&age=3');
  let ok = false;
  try { await c.page.waitForFunction(() => SG.debug.stats.sessions >= 2 && SG.debug.mode === 'play', null, { timeout: 240000, polling: 500 }); ok = true; } catch (e) { /* */ }
  check('[bot] autorestart starts a new session after done', ok, await c.page.evaluate(() => SG.debug.getState()));
  check('[bot] autorestart: no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

/* Low-skill bot exercising hints/idle at age 3 in VI (mistake + help lines). */
async function gHelpLines() {
  for (const lang of ['en', 'vi']) {
    const c = await open(DEV.iphoneP, `speed=12&bot=1&autostart=1&seed=21&mute=1&age=3&lang=${lang}&skill=0`);
    await c.page.waitForFunction(() => SG.debug.world.level >= 1 || SG.debug.mode === 'done', null, { timeout: 120000, polling: 500 }).catch(() => {});
    // idle line: stop the bot and wait 12 s of sim time
    await c.page.evaluate(() => { SG.debug.setBot(false); SG.debug.world.cancelDrag(); });   // bot may have been mid-drag
    await c.page.waitForFunction(() => SG.debug.world.state === 'round' && SG.debug.world.interactive, null, { timeout: 20000 }).catch(() => {});
    await c.page.evaluate(() => { window.__ev = []; });
    await c.page.waitForFunction(() => window.__ev.some(e => e.type === 'idle'), null, { timeout: 20000 }).catch(() => {});
    const texts = await c.page.evaluate(() => SG.debug.voiceLog.map(l => l.text));
    const ev = await c.page.evaluate(() => window.__ev.map(e => e.type));
    check(`[help ${lang}] idle nudge fires after 12 s`, ev.includes('idle'), ev);
    const bad = texts.map(s => [badText(s), s]).filter(x => x[0]);
    check(`[help ${lang}] wrong/miss/hint/idle lines clean (${texts.length} lines)`, bad.length === 0, bad.slice(0, 8));
    await c.ctx.close();
  }
}

(async () => {
  srv = await serve(process.env.DN_GAME_ROOT ? path.resolve(process.env.DN_GAME_ROOT) : undefined);
  if (process.env.DN_GAME_ROOT) console.log('NOTE: testing game at ' + process.env.DN_GAME_ROOT);
  browser = await chromium.launch();
  const groups = { boot: gBoot, lang: gLang, gate: gGate, settings: gSettings, input: gInput, mouse: gMouse, count: gCount, talk: gTalk, pause: gPause, rotate: gRotate, help: gHelpLines, bot: gBot };
  for (const [g, fn] of Object.entries(groups)) {
    if (!want(g)) continue;
    const t0 = Date.now();
    try { await fn(); } catch (e) { check(`[${g}] group crashed`, false, String(e.stack || e).slice(0, 600)); }
    console.log(`  (${g} ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), pass: results.length - fails.length, fail: fails.length, flakeRetries: FLAKES, results }, null, 1));
  if (FLAKES.length) console.log(`(${FLAKES.length} touch-start retries, see results.json flakeRetries)`);
  console.log(`\n${results.length - fails.length} passed, ${fails.length} failed`);
  process.exit(fails.length ? 1 : 0);
})();
