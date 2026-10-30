// Functional QA suite for Puppy Garden Catch — real touch input (CDP Input.dispatchTouchEvent) on mobile contexts.
//   node tests/e2e/functional.js                 (all groups)
//   node tests/e2e/functional.js input talk      (only some groups)
// Groups: boot lang gate settings input count talk pause rotate hud bot
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
const ALL = [DEV.iphoneP, DEV.iphoneL, DEV.ipadP, DEV.ipadL].filter(d => !process.env.DEVS || process.env.DEVS.split(',').includes(d.name));
const ONLY = process.argv.slice(2);
const want = g => !ONLY.length || ONLY.includes(g);
const SKEY = 'pg:settings';            // the key the game uses today (see the [storage] check)

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
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|chapter|sound)\.[a-zA-Z]/.test(s)) return 'raw i18n key';
  if (BARE_KEYS.includes(s.trim())) return 'bare key';
  return null;
}

/* Collect every user-visible string: canvas fillText, and DOM text of bubble / talk / done / title. */
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
  await page.waitForFunction(() => window.PG && PG.debug && PG.debug.mode && PG.debug.mode !== 'loading', null, { timeout: 15000 });
}
/* Event tap on world._emit + in-page planning helpers (__T). */
async function installEv(page) {
  await page.evaluate(() => {
    window.__ev = [];
    const w = PG.debug.world;
    if (!w.__hooked) {
      w.__hooked = true;
      const o = w._emit;
      w._emit = function (e) {
        window.__ev.push(Object.assign({ at: performance.now(), dn: Date.now(), wt: this.time }, e));
        if (e.type === 'talk' && window.__stopAtTalk) { window.__stopAtTalk = false; PG.debug.setBot(false); PG.debug.setSpeed(1); }
        return o.call(this, e);
      };
    }
    const AIR = s => s === 'appear' || s === 'fall';
    window.__T = {
      info() {
        const w = PG.debug.world, L = w.layout, p = w.pup, b = w.basket, v = PG.debug.view();
        return { mode: PG.debug.mode, state: w.state, round: w.round, level: w.level, topic: w.topic, stars: w.stars,
          roundMistakes: w.roundMistakes, cur: w.cur && { mode: w.cur.mode, need: w.cur.need, promptKey: w.cur.promptKey, params: w.cur.params },
          pup: { x: p.x, targetX: p.targetX, steering: p.steering, minX: L.pup.minX, maxX: L.pup.maxX, y: L.pup.y, h: L.pup.h, hop: p.hop },
          basket: { x: b.x, y: b.y, w: b.w, count: b.count, need: b.need, reserved: b.reserved },
          finger: Object.assign({}, w.finger),
          items: w.items.map(i => ({ id: i.id, right: i.right, state: i.state, x: i.x, y: i.y, size: i.size, nameKind: i.nameKind, nameValue: i.nameValue })),
          L: { W: L.W, H: L.H, groundY: L.groundY, lanes: L.lanes, pupTapR: L.pupTap.r, chestK: w.cfg.pupChestK }, view: { s: v.s, left: v.left, top: v.top, W: v.W, H: v.H } };
      },
      pred(it) {   // where the bubble's centre will be when it reaches the rim (same model as PG.Bot)
        const w = PG.debug.world, b = w.basket, A = w.cfg.swayAmp;
        const vy = Math.max(it.vy, 0.6 * w._fallV(w.age));
        const tR = Math.max(0, (b.y - it.y) / vy);
        return { t: tR, x: it.xb + it.ub * tR + A * Math.sin(it.phase + 2 * Math.PI / it._swP * tR) };
      },
      airLowest(right) {
        const w = PG.debug.world;
        return w.items.filter(i => AIR(i.state) && i.right === right && i.y < w.basket.y - 20).sort((a, b) => b.y - a.y)[0] || null;
      },
      settled(id) { return window.__ev.find(e => e.id === id && (e.type === 'catch' || e.type === 'miss')) || null; },
      /* kind: 'right' | 'wrong' | 'away'. Returns {id, x (logical), done, why} */
      plan(kind, id) {
        const w = PG.debug.world, L = w.layout, cl = x => Math.max(L.pup.minX, Math.min(L.pup.maxX, x));
        if (w.state !== 'round') return { id, x: w.pup.x, done: !!id, why: 'state ' + w.state };
        let it = id ? w.itemById(id) : null;
        if (id && this.settled(id)) return { id, x: w.pup.x, done: true, why: 'settled' };
        if (id && (!it || !(AIR(it.state)))) return { id, x: w.pup.x, done: true, why: 'gone ' + (it && it.state) };
        if (!it) { it = this.airLowest(kind !== 'wrong'); if (!it) return { id: null, x: w.pup.x, done: false, why: 'waiting' }; }
        const px = this.pred(it).x;
        if (kind !== 'away') return { id: it.id, x: cl(px), done: false };
        // farthest lane x from every right bubble's landing point
        const preds = w.items.filter(i => i.right && (AIR(i.state))).map(i => this.pred(i).x);
        let best = L.pup.minX, bs = -1;
        for (let k = 0; k <= 24; k++) {
          const x = L.pup.minX + (L.pup.maxX - L.pup.minX) * k / 24;
          const s = Math.min(...preds.map(p => Math.abs(p - x)));
          if (s > bs) { bs = s; best = x; }
        }
        return { id: it.id, x: best, done: false };
      },
      inScreen() {   // Pip and every bubble inside the logical screen
        const w = PG.debug.world, L = w.layout, bad = [];
        if (!(w.pup.x >= L.pup.minX - 0.5 && w.pup.x <= L.pup.maxX + 0.5)) bad.push({ pup: w.pup.x, minX: L.pup.minX, maxX: L.pup.maxX });
        if (!(w.pup.targetX >= L.pup.minX - 0.5 && w.pup.targetX <= L.pup.maxX + 0.5)) bad.push({ pupTarget: w.pup.targetX });
        for (const i of w.items) {
          if (i.state === 'leave' || i.state === 'rise') continue;      // rising bubbles legitimately exit at the top
          const r = 0.5 * 1.35 * i.size;
          if (!isFinite(i.x) || !isFinite(i.y) || i.x < -r * 0.2 || i.x > L.W + r * 0.2 || i.y < -r || i.y > L.H) bad.push({ id: i.id, s: i.state, x: i.x | 0, y: i.y | 0, W: L.W, H: L.H });
        }
        return bad;
      }
    };
  });
}
const evs = (page, types) => page.evaluate(t => window.__ev.filter(e => !t || t.includes(e.type)), types || null);
const clearEv = page => page.evaluate(() => { window.__ev = []; });
const info = page => page.evaluate(() => __T.info());
const mode = page => page.evaluate(() => PG.debug.mode);
const voice2 = page => page.evaluate(() => PG.debug.voiceLog.map(l => ({ t: l.t, lang: l.lang, text: l.text })));
const voice = page => page.evaluate(() => PG.debug.voiceLog.map(l => ({ lang: l.lang, text: l.text })));
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
const setHidden = (page, h) => page.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);

/* ---------- input helpers (CDP touch = real touch + pointer events in Chromium) ---------- */
async function touch(cdp, type, pts) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0, radiusX: 4, radiusY: 4, force: 1 })) }); }
async function tap(c, x, y, ms = 50) { await touch(c.cdp, 'touchStart', [{ x, y }]); await sleep(ms); await touch(c.cdp, 'touchEnd', []); }
async function tapEl(c, sel) {
  await c.page.locator(sel).first().evaluate(e => e.scrollIntoView({ block: 'nearest' }));
  const bb = await c.page.locator(sel).first().boundingBox();
  if (!bb) throw new Error('no box for ' + sel);
  await tap(c, bb.x + bb.width / 2, bb.y + bb.height / 2);
  await sleep(60);
}
/** logical → CSS px */
async function css(page, x, y) { return page.evaluate(([x, y]) => { const v = PG.debug.view(); return { x: v.left + x * v.s, y: v.top + y * v.s }; }, [x, y]); }
async function fingerCssY(page) { return page.evaluate(() => { const w = PG.debug.world, L = w.layout, v = PG.debug.view(); return v.top + Math.min(L.groundY + 24, L.H - L.ins.bottom - 8) * v.s; }); }
async function waitRound(page, timeout = 20000) {
  await page.waitForFunction(() => PG.debug.mode === 'play' && PG.debug.world.state === 'round' && PG.debug.world.interactive, null, { timeout });
}
async function startPlay(c) { await tapEl(c, '#btnPlay'); await waitRound(c.page); }
/* main.js adapt() steps the render quality down on slow frames (headless Chromium is slow). Before the F1 fix that
 * cancelled the steer; the first [input] steer and the bot watchdog check it does not any more. The other groups
 * still let the quality settle so a regression shows up in one place instead of everywhere. */
async function settleQuality(page, maxMs = 15000) {
  const t0 = Date.now(); let q = await page.evaluate(() => PG.debug.render().quality), since = Date.now();
  while (Date.now() - t0 < maxMs) {
    await sleep(400);
    const q2 = await page.evaluate(() => PG.debug.render().quality);
    if (q2 !== q) { q = q2; since = Date.now(); }
    if (q <= 0.6 || Date.now() - since > 3500) break;
  }
  return q;
}

/** Real one-finger steer on the grass: touchStart, then touchMove to the planned x every ~50 ms until the plan is done. */
async function steer(c, kind, opt = {}) {
  const p = c.page, ms = opt.timeout || 20000, t0 = Date.now();
  let st = await p.evaluate(([k]) => __T.plan(k, null), [kind]);
  const fy = await fingerCssY(p);
  let f, down = false;
  if (opt.wander && !st.id) {
    // like a playing child: finger down, Pip running back and forth (so neither the idle hold nor the
    // still-Pip guard applies) until a bubble of the wanted kind is in the air
    const ln = await p.evaluate(() => { const L = PG.debug.world.layout; return { a: L.pup.minX, b: L.pup.maxX }; });
    f = await css(p, (ln.a + ln.b) / 2, 0);
    await touch(c.cdp, 'touchStart', [{ x: f.x, y: fy }]); down = true;
    const w0 = Date.now();
    while (!st.id && Date.now() - t0 < ms) {
      await sleep(50);
      const u = 0.5 + 0.5 * Math.sin((Date.now() - w0) / 1000 * 2 * Math.PI / 2.4);
      f = await css(p, ln.a + (ln.b - ln.a) * u, 0);
      await touch(c.cdp, 'touchMove', [{ x: f.x, y: fy }]);
      st = await p.evaluate(([k]) => __T.plan(k, null), [kind]);
    }
  } else {
    while (!st.id && Date.now() - t0 < ms) { await sleep(60); st = await p.evaluate(([k]) => __T.plan(k, null), [kind]); if (st.done) return st; }
  }
  if (!st.id) { if (down) await touch(c.cdp, 'touchEnd', []); return Object.assign(st, { why: 'no target bubble' }); }
  const id = st.id;
  f = await css(p, st.x, 0);
  if (down) await touch(c.cdp, 'touchMove', [{ x: f.x, y: fy }]);
  else await touch(c.cdp, 'touchStart', [{ x: f.x, y: fy }]);
  const samples = [];
  while (Date.now() - t0 < ms) {
    await sleep(50);
    st = await p.evaluate(([k, id]) => __T.plan(k, id), [kind, id]);
    if (st.done) break;
    f = await css(p, st.x, 0);
    await touch(c.cdp, 'touchMove', [{ x: f.x, y: fy }]);
    if (opt.sample) samples.push(await p.evaluate(x => ({ fx: x, tx: PG.debug.world.pup.targetX, st: PG.debug.world.pup.steering }), st.x));
  }
  if (!opt.keepDown) await touch(c.cdp, 'touchEnd', []);
  st.id = id; st.samples = samples;
  st.settled = await p.evaluate(id => __T.settled(id), id);
  return st;
}

/* ======================================================================= groups */

async function gBoot() {
  for (const d of ALL) {
    const c = await open(d, 'mute=1&seed=3');
    const t = await c.page.evaluate(() => ({ mode: PG.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent,
      stars: document.getElementById('titleStars').textContent, age: document.getElementById('titleAge').textContent,
      hud: document.getElementById('hud').classList.contains('hidden'), loading: document.getElementById('loading').classList.contains('hidden') }));
    check(`[boot ${d.name}] boots to title`, t.mode === 'title' && t.title && t.hud && t.loading, t);
    check(`[boot ${d.name}] title shows game name, stars + age`, /Puppy/.test(t.logo) && /^\d+$/.test(t.stars) && /4/.test(t.age), t);
    const bb = await c.page.locator('#btnPlay').boundingBox();
    check(`[boot ${d.name}] play button on screen, >= 44 px`, bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= d.viewport.width && bb.y + bb.height <= d.viewport.height && bb.width >= 44, bb);
    await c.page.screenshot({ path: path.join(OUT, d.name + '-title.png') });
    // real tap on Play starts a session with HUD
    await startPlay(c);
    const g = await c.page.evaluate(() => ({ mode: PG.debug.mode, hud: !document.getElementById('hud').classList.contains('hidden'), bubble: document.getElementById('bubbleText').textContent }));
    const sb = await c.page.evaluate(() => { const v = PG.debug.view(), L = PG.debug.world.layout, r = document.getElementById('bubble').getBoundingClientRect();
      const maxSize = Math.max(...PG.debug.world.cur.pool.map(t => t.size));
      return { bubbleBottom: Math.round((r.bottom - v.top) / v.s), spawnY: Math.round(L.spawnY), newBubbleTop: Math.round(L.spawnY - 0.5 * 1.35 * maxSize), topReserve: L.topReserve }; });
    check(`[boot ${d.name}] (F3) a new bubble is born below the speech bubble`, sb.newBubbleTop >= sb.bubbleBottom - 1, sb);
    check(`[boot ${d.name}] tap Play → round with HUD + prompt`, g.mode === 'play' && g.hud && g.bubble.length > 3 && !badText(g.bubble), g);
    await sleep(1500);
    await c.page.screenshot({ path: path.join(OUT, d.name + '-play.png') });
    check(`[boot ${d.name}] no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

async function gLang() {
  const d = DEV.iphoneP;
  const c = await open(d, 'mute=1', { storage: { [SKEY]: JSON.stringify({ lang: 'en', age: 5 }) } });
  const before = await c.page.evaluate(() => [document.getElementById('logo1').textContent, document.getElementById('tagline').textContent, document.documentElement.lang]);
  await tapEl(c, '#scrTitle .chip[data-lang="vi"]');
  await sleep(150);
  const after = await c.page.evaluate(() => [document.getElementById('logo1').textContent, document.getElementById('tagline').textContent, document.documentElement.lang, document.querySelector('#scrTitle .chip[data-lang="vi"]').classList.contains('on'), document.getElementById('titleAge').textContent, document.title]);
  check('[lang] title chip EN→VI changes DOM text', before[0] === 'Puppy' && after[0] !== before[0] && after[1] !== before[1] && after[2] === 'vi' && after[3], { before, after });
  check('[lang] VI title uses the Vietnamese name and age word', /Cún/.test(after[0]) && /Tuổi 5/.test(after[4]) && /Cún/.test(after[5]), after);
  const vl = await c.page.evaluate(() => PG.debug.voiceLog.slice(-1)[0]);
  check('[lang] chip tap greets in Vietnamese (voiceLog lang vi)', vl && vl.lang === 'vi' && /Pip/.test(vl.text) && !badText(vl.text), vl);
  // VI in game: prompt + voice in vi
  await startPlay(c);
  const g = await c.page.evaluate(() => ({ bubble: document.getElementById('bubbleText').textContent, v: PG.debug.voiceLog.slice(-3), wl: PG.debug.world.lang }));
  check('[lang] VI session: world lang vi, prompt + voice lines in vi', g.wl === 'vi' && g.v.every(l => l.lang === 'vi') && /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũ]/i.test(g.bubble), g);
  await c.page.reload(); await waitTitle(c.page);
  const re = await c.page.evaluate(k => [document.getElementById('logo1').textContent, document.documentElement.lang, JSON.parse(localStorage.getItem(k) || '{}').lang], SKEY);
  check('[lang] VI persists after reload', re[0] === after[0] && re[1] === 'vi' && re[2] === 'vi', re);
  await tapEl(c, '#scrTitle .chip[data-lang="en"]'); await sleep(100);
  const back = await c.page.evaluate(() => [document.getElementById('logo1').textContent, PG.debug.voiceLog.slice(-1)[0]]);
  check('[lang] VI→EN switches back (text + voice lang en)', back[0] === 'Puppy' && back[1] && back[1].lang === 'en', back);
  check('[lang] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

async function gGate() {
  for (const d of [DEV.iphoneP, DEV.iphoneL, DEV.ipadL]) {
    const c = await open(d, 'mute=1');
    const g = await c.page.locator('#btnParents').boundingBox();
    const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
    check(`[gate ${d.name}] gear is >= 44 px tap target`, g.width >= 44 && g.height >= 44, g);
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
  const c = await open(d, 'mute=1', { storage: { [SKEY]: JSON.stringify({ lang: 'en', age: 4 }) } });
  await openSettingsByHold(c);
  await tapEl(c, '#ageChips .chip[data-age="6"]');
  await tapEl(c, '#scrSettings .chip[data-lang="vi"]');
  await c.page.locator('#inpName').fill('Linh');
  for (const id of ['optSfx', 'optMusic', 'optMic']) await tapEl(c, `label:has(#${id})`);
  await sleep(150);
  const st = await c.page.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), SKEY);
  check('[settings] changes saved', st && st.age === 6 && st.lang === 'vi' && st.name === 'Linh' && st.sfx === false && st.music === false && st.mic === false && st.voice === true, st);
  await tapEl(c, '#btnSettingsDone'); await sleep(150);
  const ta = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('[settings] title age updates after Done', /6/.test(ta), ta);
  await c.page.reload(); await waitTitle(c.page); await installEv(c.page);
  await openSettingsByHold(c);
  const dom = await c.page.evaluate(() => ({ age: [...document.querySelectorAll('#ageChips .chip.on')].map(b => b.dataset.age), name: document.getElementById('inpName').value,
    sfx: document.getElementById('optSfx').checked, music: document.getElementById('optMusic').checked, voice: document.getElementById('optVoice').checked, mic: document.getElementById('optMic').checked, lang: document.documentElement.lang }));
  check('[settings] persist across reload (DOM)', dom.age.join() === '6' && dom.name === 'Linh' && !dom.sfx && !dom.music && dom.voice && !dom.mic && dom.lang === 'vi', dom);
  await c.page.locator('#inpName').fill('{child}<b>'); await sleep(100);
  const nm = await c.page.evaluate(k => JSON.parse(localStorage.getItem(k)).name, SKEY);
  check('[settings] name strips {} <>', !/[{}<>]/.test(nm), nm);
  await c.page.locator('#inpName').fill('Linh');
  await tapEl(c, '#ageChips .chip[data-age="7"]'); await tapEl(c, '#btnSettingsDone'); await sleep(100);
  const t7 = await c.page.evaluate(() => document.getElementById('titleAge').textContent);
  check('[settings] age 7 shows 7+', /7\+/.test(t7), t7);
  await startPlay(c);
  const wa = await c.page.evaluate(() => ({ age: PG.debug.world.age, levels: PG.debug.world.levels }));
  check('[settings] game starts at saved age (7 → add/sub/initial/oddeven)', wa.age === 7 && wa.levels[0] === 'add', wa);
  const keys = await c.page.evaluate(() => Object.keys(localStorage));
  check('[storage] localStorage keys are namespaced for this game (not the Dino game\'s shared "dn:" prefix on the same github.io origin)',
    keys.every(k => !k.startsWith('dn:')) && keys.includes('pg:settings'), keys);
  check('[settings] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();

  // ---- URL flags must not leak into saved settings
  const c2 = await open(d, 'lang=vi&age=6&mute=1&speed=2&seed=5&level=1', { storage: { [SKEY]: JSON.stringify({ lang: 'en', age: 4, name: '', sfx: true, music: true, voice: true, mic: true }) } });
  let s0 = await c2.page.evaluate(k => JSON.parse(localStorage.getItem(k)), SKEY);
  check('[flags] boot with ?lang=vi&age=6&mute=1&speed&seed&level does not write settings', s0.lang === 'en' && s0.age === 4 && Object.keys(s0).length === 7, s0);
  const ui = await c2.page.evaluate(() => ({ lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent }));
  check('[flags] ?lang=vi + ?age=6 apply to the UI for the session', ui.lang === 'vi' && /6/.test(ui.age), ui);
  await openSettingsByHold(c2);
  await tapEl(c2, 'label:has(#optSfx)'); await sleep(100);
  s0 = await c2.page.evaluate(k => JSON.parse(localStorage.getItem(k)), SKEY);
  check('[flags] toggling a setting under ?lang=vi&age=6 saves neither', s0.lang === 'en' && s0.age === 4 && s0.sfx === false, s0);
  check('[flags] no mute/speed/seed/level/bot keys saved', ['mute', 'speed', 'seed', 'level', 'bot', 'autostart'].every(k => !(k in s0)), s0);
  await c2.ctx.close();
  const c3 = await open(d, 'mute=1', { storage: { [SKEY]: JSON.stringify({ lang: 'en', age: 4, name: '', sfx: false, music: true, voice: true, mic: true }) } });
  const c3s = await c3.page.evaluate(() => ({ lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent }));
  check('[flags] a later visit without flags is back to the saved EN / age 4', c3s.lang === 'en' && /4/.test(c3s.age), c3s);
  await c3.ctx.close();
}

/* Real touch steering: catch right, catch wrong, miss, tap a bubble, tap Pip. */
async function gInput() {
  for (const d of ALL) {
    const N = `[input ${d.name}]`;
    // ---------- right catch (age 4)
    let c = await open(d, 'mute=1&seed=4&age=4&speed=2');
    let p = c.page;
    await startPlay(c);
    let i0 = await info(p);
    check(`${N} round 1 is a catch round, need ${i0.cur.need}`, i0.cur.mode === 'catch' && i0.cur.need >= 1, i0.cur);
    let st = await steer(c, 'right', { sample: true });
    let ev = await evs(p);
    const cid = st.id;
    const caught = ev.find(e => e.type === 'catch' && e.id === cid);
    const cor = ev.find(e => e.type === 'correct' && e.id === cid);
    await sleep(500);
    ev = await evs(p);
    const land = ev.find(e => e.type === 'land' && e.id === cid);
    check(`${N} drag steers Pip under a right bubble → catch(right) + correct + land`, caught && caught.right === true && cor && land && land.count >= 1, { st: { why: st.why, settled: st.settled }, types: ev.map(e => e.type + (e.id ? ':' + e.id : '')) });
    const follow = st.samples.filter(s => s.st && Math.abs(s.tx - s.fx) < 2).length / Math.max(1, st.samples.length);
    const q1 = await p.evaluate(() => PG.debug.render().quality);
    check(`${N} (F1) while the finger is down Pip's targetX follows the finger x, also through render-quality steps (quality now ${q1.toFixed(2)})`, follow > 0.9, { follow, n: st.samples.length, last: st.samples.slice(-3) });
    {
      await settleQuality(p);
      await waitRound(p).catch(() => {});
      const st2 = await steer(c, 'right', { sample: true });
      const f2 = st2.samples.filter(s => s.st && Math.abs(s.tx - s.fx) < 2).length / Math.max(1, st2.samples.length);
      check(`${N} (after render quality settled) Pip's targetX follows the finger x`, f2 > 0.9, { f2, n: st2.samples.length });
    }
    const cv = await voice(p);
    check(`${N} correct catch spoken (praise / name line)`, cv.length >= 2 && !badText(cv[cv.length - 1].text), cv.slice(-2));
    await c.ctx.close();

    // ---------- wrong catch (age 5: no magnet, need ≥ 2 → more time with wrong bubbles in the air)
    c = await open(d, 'mute=1&seed=6&age=5&speed=2');
    p = c.page;
    await startPlay(c); await settleQuality(p);
    let wrongDone = null, tries = [];
    for (let k = 0; k < 6 && !wrongDone; k++) {
      await waitRound(p).catch(() => {});
      await clearEv(p);
      const pre = await info(p);
      st = await steer(c, 'wrong', { timeout: 20000, wander: true });
      tries.push({ why: st.why, settled: st.settled && st.settled.type });
      if (st.settled && st.settled.type === 'catch' && st.settled.right === false) {
        const at = await info(p);
        await sleep(350);   // 0.12 s dip + hop
        const after = await info(p);
        const it = after.items.find(i => i.id === st.id);
        ev = await evs(p);
        wrongDone = { pre, at, after, it, ev, id: st.id };
      }
    }
    if (!check(`${N} steer under a WRONG bubble → catch(right:false) + wrong event`, wrongDone, tries)) { await c.ctx.close(); continue; }
    {
      const { pre, after, it, ev: wev, id } = wrongDone;
      const we = wev.find(e => e.type === 'wrong' && e.id === id);
      check(`${N} wrong event names the item, counts the mistake`, we && we.nameKind && we.nameValue != null && after.roundMistakes >= 1, { we, rm: after.roundMistakes });
      check(`${N} wrong item hops out (bounce/rise, above the rim) and is not added to the basket`,
        it && (it.state === 'bounce' || it.state === 'rise') && it.y < after.basket.y + 5 && !wev.some(e => e.type === 'land' && e.id === id), { it, basket: after.basket });
      check(`${N} wrong catch does not take stars away`, after.stars >= pre.stars, { pre: pre.stars, after: after.stars });
      const rd = await p.waitForFunction(() => window.__ev.find(e => e.type === 'roundDone'), null, { timeout: 30000 }).then(h => h.jsonValue()).catch(() => null);
      // keep catching rights to finish the round if needed
      if (!rd) check(`${N} round with a wrong catch finishes`, false, 'no roundDone in 30 s');
      else {
        const wn = (await evs(p, ['wrong'])).filter(e => e.at <= rd.at).length;
        const expect = wn === 0 ? 3 : wn === 1 ? 2 : 1;
        check(`${N} round stars follow the rule (wrong ${wn} → ${expect})`, rd.stars === expect && rd.mistakes === wn, { rd, wn });
      }
      const wv = (await voice(p)).filter(v => !badText(v.text));
      check(`${N} wrong catch spoken kindly (no "no"/"wrong" words)`, wv.length > 0 && !(await voice(p)).some(v => /\b(no|wrong|bad)\b/i.test(v.text)), (await voice(p)).slice(-4));
    }
    await c.ctx.close();

    // ---------- miss: keep Pip away from a right bubble
    c = await open(d, 'mute=1&seed=9&age=4&speed=2');
    p = c.page;
    await startPlay(c); await settleQuality(p); await p.evaluate(() => PG.debug.goTitle()); await startPlay(c);
    await clearEv(p);
    const s0 = await info(p);
    st = await steer(c, 'away', { timeout: 25000 });
    if (check(`${N} a right bubble left to fall reaches the grass → miss`, st.settled && st.settled.type === 'miss', { why: st.why, settled: st.settled })) {
      const mid = st.id;
      const a1 = await info(p);
      ev = await evs(p);
      check(`${N} miss bounces on the grass, costs no star / no mistake`, ev.some(e => e.type === 'bounce' && e.id === mid) && a1.roundMistakes === 0 && a1.stars >= s0.stars, { rm: a1.roundMistakes, stars: [s0.stars, a1.stars] });
      await sleep(900);
      const a2 = await info(p);
      const it = a2.items.find(i => i.id === mid);
      check(`${N} missed bubble floats back up (rise)`, !it || it.state === 'rise' || it.state === 'ground', it);
      const back = await p.waitForFunction(id => { const w = PG.debug.world; return window.__ev.some(e => e.type === 'appear' && e.id !== id && (w.itemById(e.id) || {}).right) || w.items.some(i => i.id !== id && i.right && (i.state === 'fall' || i.state === 'appear')); }, mid, { timeout: 12000 }).then(() => true).catch(() => false);
      check(`${N} after a miss a right bubble comes again`, back);
      const mv = await voice(p);
      const lines = await p.evaluate(() => [].concat(PG.I18N.raw(PG.debug.world.lang, 'miss')));
      check(`${N} miss line spoken`, mv.some(v => lines.includes(v.text)), mv.slice(-4));
    }
    await c.ctx.close();

    // ---------- tap a bubble: names it, Pip does not run; tap Pip: prompt repeated
    c = await open(d, 'mute=1&seed=11&age=4');
    p = c.page;
    await startPlay(c); await settleQuality(p); await p.evaluate(() => PG.debug.goTitle()); await startPlay(c);
    const target = await p.waitForFunction(() => {
      const w = PG.debug.world;
      return w.items.find(i => i.state === 'fall' && Math.abs(i.x - w.pup.x) > 150 && i.y < w.basket.y - 200 && i.y > w.layout.spawnY + 20) && w.pup.vx === 0 ? true : null;
    }, null, { timeout: 20000, polling: 50 }).then(() => true).catch(() => false);
    if (!check(`${N} a bubble away from Pip to tap`, target)) { await c.ctx.close(); continue; }
    for (const ms of [60, 200]) {
      await clearEv(p);
      const b = await p.evaluate(() => { const w = PG.debug.world; const i = w.items.filter(i => i.state === 'fall' && i.y < w.basket.y - 150).sort((a, b) => Math.abs(b.x - w.pup.x) - Math.abs(a.x - w.pup.x))[0]; return i && { id: i.id, x: i.x, y: i.y, vy: i.vy, pup: w.pup.x, nk: i.nameKind, nv: i.nameValue, name: PG.I18N.name(w.lang, i.nameKind, i.nameValue) }; });
      if (!b) { check(`${N} tap (${ms} ms) on a bubble`, false, 'no bubble'); continue; }
      const q = await css(p, b.x, b.y + b.vy * 0.03);
      b.el = await p.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); return e && (e.id || e.className); }, [q.x, q.y]);
      await tap(c, q.x, q.y, ms);
      await sleep(1200);
      const a = await info(p);
      ev = await evs(p);
      const te = ev.find(e => e.type === 'tap');
      check(`${N} (F3) ${ms} ms tap on a bubble → tap event with its name`, te && te.id === b.id && te.nameKind === b.nk, { te, b, ev: ev.map(e => e.type) });
      const moved = Math.abs(a.pup.x - b.pup);
      check(`${N} (F2) ${ms} ms tap on a bubble: Pip does not run (moved ${moved.toFixed(1)} px, finger ${Math.abs(b.x - b.pup) | 0} px away)`, moved < 12 && !a.pup.steering, { moved, from: b.pup, to: a.pup.x, bubbleX: b.x });
      const tv = await voice(p);
      check(`${N} ${ms} ms tap: voice names the item ("${b.name}")`, tv.some(v => v.text === b.name), tv.slice(-2));
      await sleep(300);
    }
    // tap Pip
    await clearEv(p);
    await p.waitForFunction(() => { const w = PG.debug.world, L = w.layout; if (w.state !== 'round' || w.pup.vx !== 0) return false;
      const cy = L.pup.y - w.cfg.pupChestK * L.pup.h - w.pup.hop, b = w.basket;
      // nothing under the finger and no bubble about to drop into the basket (a catch would end the round mid-test)
      const incoming = w.items.some(i => (i.state === 'fall' || i.state === 'appear') && Math.abs(i.x - b.x) < b.w + 120 && i.y > b.y - 350);
      return !w.itemAt(w.pup.x, cy) && !incoming && b.reserved < b.need; }, null, { timeout: 20000, polling: 50 }).catch(() => {});
    const pi = await info(p);
    const promptNow = await p.evaluate(() => document.getElementById('bubbleText').textContent);
    const vBefore = (await voice(p)).length;
    const chest = await css(p, pi.pup.x, pi.pup.y - pi.L.chestK * pi.pup.h - (pi.pup.hop || 0));
    await tap(c, chest.x, chest.y, 60);
    await sleep(300);
    ev = await evs(p);
    const tv = (await voice(p)).slice(vBefore);
    check(`${N} tap on Pip → tapPup event`, ev.some(e => e.type === 'tapPup'), ev.map(e => e.type));
    check(`${N} tap on Pip repeats the prompt in voice`, tv.some(v => v.text === promptNow), { promptNow, tv });
    check(`${N} no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* Count mode: age 4 level 2 (count). Basket count reaches need, numbers spoken. */
async function gCount() {
  for (const [d, lang] of [[DEV.iphoneL, 'en'], [DEV.ipadP, 'vi'], [DEV.iphoneP, 'en']]) {
    const N = `[count ${d.name} ${lang}]`;
    const c = await open(d, `mute=1&seed=12&age=4&level=2&speed=2&lang=${lang}`);
    const p = c.page;
    await startPlay(c); await settleQuality(p); await p.evaluate(() => PG.debug.goTitle()); await startPlay(c);
    for (let r = 0; r < 2; r++) {
      await waitRound(p).catch(() => {});
      const i0 = await info(p);
      if (!check(`${N} round ${r + 1}: topic count, mode count, need ${i0.cur && i0.cur.need}`, i0.topic === 'count' && i0.cur.mode === 'count' && i0.cur.need >= 1, { topic: i0.topic, cur: i0.cur })) break;
      const t0 = Date.now();
      const tStart = Date.now() - 4000;
      const rdOf = async () => (await evs(p, ['roundDone'])).find(e => e.round === i0.round && e.dn > tStart);
      let rd = await rdOf();
      while (!rd && Date.now() - t0 < 60000) { await steer(c, 'right', { timeout: 15000 }); rd = await rdOf(); }
      await sleep(600);
      const all = await evs(p);
      const rs = rd && all.filter(e => e.type === 'round' && e.round === i0.round && e.at < rd.at).pop();
      const lands = rs && rd ? all.filter(e => e.type === 'land' && e.at > rs.at && e.at <= rd.at).map(e => e.count) : [];
      check(`${N} round ${r + 1}: basket count reaches need (${lands.join(',')} / ${i0.cur.need})`, rd && rd.count === i0.cur.need && lands.length === i0.cur.need && lands.every((n, k) => n === k + 1), { rd, lands });
      const vl = rs && rd ? (await voice2(p)).filter(v => v.t >= rs.dn && v.t <= rd.dn + 400) : [];
      const names = await p.evaluate(([l, n]) => Array.from({ length: n }, (_, k) => PG.I18N.name(l, 'number', k + 1)), [lang, i0.cur.need]);
      // a count is "spoken" as the word ("two"/"hai") or as the digit TTS reads out ("2 apples")
      const spoken = names.map((nm, k) => vl.some(v => v.text.toLowerCase().includes(String(nm).toLowerCase()) || new RegExp('(^|\\D)' + (k + 1) + '(\\D|$)').test(v.text)));
      check(`${N} round ${r + 1}: each number 1..${i0.cur.need} spoken in ${lang}`, spoken.every(Boolean) && vl.every(v => v.lang === lang), { names, spoken, vl: vl.map(v => v.text) });
      const bad = vl.filter(v => badText(v.text));
      check(`${N} round ${r + 1}: count lines clean`, bad.length === 0, bad);
    }
    check(`${N} no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* Talk time answered by tapping a choice: once right, once wrong. */
async function reachTalk(c, speedUp = 8) {
  await c.page.evaluate(s => { window.__stopAtTalk = true; PG.debug.setBot(true, 0.9); PG.debug.setSpeed(s); }, speedUp);
  await c.page.waitForFunction(() => PG.debug.mode === 'talk' && !document.getElementById('scrTalk').classList.contains('hidden'), null, { timeout: 120000, polling: 100 });
  await sleep(400);
}
async function gTalk() {
  for (const [d, lang] of [[DEV.ipadP, 'en'], [DEV.iphoneL, 'vi']]) {
    const N = `[talk ${d.name} ${lang}]`;
    const c = await open(d, `mute=1&seed=14&age=4&lang=${lang}`);
    const p = c.page;
    await startPlay(c);
    for (const right of [true, false]) {
      try { await reachTalk(c); } catch (e) { check(`${N} reach Talk time`, false, await info(p)); break; }
      const t = await p.evaluate(() => { const w = PG.debug.world; return { answerId: w.talk.answerId, choices: w.talk.choices, stars: w.stars, bot: !!PG.debug.bot, q: document.getElementById('talkQ').textContent,
        btns: [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { id: b.dataset.id, x: r.x, y: r.y, w: r.width, h: r.height }; }) }; });
      check(`${N} Talk time open, bot off, question text clean`, !t.bot && t.q.length > 3 && !badText(t.q), t.q);
      check(`${N} choice buttons >= 44 px and on screen`, t.btns.length >= 2 && t.btns.every(b => b.w >= 44 && b.h >= 44 && b.x >= 0 && b.y >= 0 && b.x + b.w <= d.viewport.width && b.y + b.h <= d.viewport.height), t.btns);
      const pick = right ? String(t.answerId) : t.btns.find(b => b.id !== String(t.answerId)).id;
      await clearEv(p);
      const v0 = (await voice(p)).length;
      await tapEl(c, `#talkChoices button[data-id="${pick}"]`);
      await sleep(300);
      const tr = (await evs(p, ['talkResult']))[0];
      const after = await p.evaluate(() => ({ stars: PG.debug.world.stars, marks: [...document.querySelectorAll('#talkChoices button')].map(b => b.className) }));
      check(`${N} tap ${right ? 'right' : 'wrong'} choice → talkResult correct=${right}`, tr && tr.correct === right && String(tr.choiceId) === pick, tr);
      check(`${N} ${right ? 'right answer +1 star' : 'wrong answer: no star lost / gained'}`, after.stars === t.stars + (right ? 1 : 0), { before: t.stars, after: after.stars });
      check(`${N} buttons marked (right${right ? '' : ' + wrongpick'})`, after.marks.some(m => /right/.test(m)) && (right || after.marks.some(m => /wrongpick/.test(m))), after.marks);
      const vl = (await voice(p)).slice(v0);
      const ans = t.choices.find(ch => String(ch.id) === String(t.answerId));
      const ansName = await p.evaluate(([l, a]) => PG.I18N.name(l, a.kind, a.value), [lang, ans]);
      check(`${N} ${right ? 'praise' : 'gentle "it is <answer>"'} spoken in ${lang}`, vl.length > 0 && vl.every(v => v.lang === lang && !badText(v.text)) && (right || vl.some(v => v.text.includes(ansName))), { vl, ansName });
      // a second tap is ignored
      await tapEl(c, `#talkChoices button[data-id="${t.btns[0].id}"]`);
      check(`${N} second tap after answering ignored`, (await evs(p, ['talkResult'])).length === 1);
      await p.waitForFunction(() => PG.debug.mode === 'play' && ['intro', 'round', 'sessionDone'].includes(PG.debug.world.state) || PG.debug.mode === 'done', null, { timeout: 8000 }).catch(() => {});
      check(`${N} game continues after Talk time`, ['play', 'done'].includes(await mode(p)), await info(p));
    }
    await p.screenshot({ path: path.join(OUT, `talk-${lang}.png`) });
    check(`${N} no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

async function gPause() {
  const d = DEV.iphoneL;
  const c = await open(d, 'seed=2&age=4');     // NOT muted: check music state
  const p = c.page;
  await startPlay(c); await settleQuality(p);
  const mus = () => p.evaluate(() => PG.Audio._playing);
  check('[pause] music playing in game', await mus());
  // steer, then a second hand presses pause: the steer must cancel
  const fy = await fingerCssY(p);
  await touch(c.cdp, 'touchStart', [{ x: 100, y: fy }]); await sleep(60); await touch(c.cdp, 'touchMove', [{ x: 140, y: fy }]); await sleep(80);
  const st0 = await p.evaluate(() => PG.debug.world.pup.steering);
  await p.evaluate(() => document.getElementById('btnPause').click());
  await sleep(150);
  await touch(c.cdp, 'touchMove', [{ x: 700, y: fy }]); await sleep(60);
  await touch(c.cdp, 'touchEnd', []); await sleep(100);
  const ps = await p.evaluate(() => ({ mode: PG.debug.mode, steering: PG.debug.world.pup.steering, down: PG.debug.world.finger.down, tx: PG.debug.world.pup.targetX, x: PG.debug.world.pup.x }));
  check('[pause] pausing while steering cancels the steer', st0 && ps.mode === 'paused' && !ps.steering && !ps.down && Math.abs(ps.tx - ps.x) < 1, { st0, ps });
  const t0 = await p.evaluate(() => PG.debug.world.time); await sleep(500);
  check('[pause] world frozen while paused', (await p.evaluate(() => PG.debug.world.time)) === t0);
  check('[pause] music stopped while paused', !(await mus()));
  await tapEl(c, '#btnResume'); await sleep(200);
  check('[pause] resume via button (touch)', (await mode(p)) === 'play' && !(await visible(p, 'scrPause')) && await mus());
  const t1 = await p.evaluate(() => PG.debug.world.time); await sleep(300);
  check('[pause] world runs again after resume', (await p.evaluate(() => PG.debug.world.time)) > t1);
  await tapEl(c, '#btnPause'); await sleep(200);
  check('[pause] HUD pause button pauses (touch)', (await mode(p)) === 'paused' && (await visible(p, 'scrPause')) && !(await mus()));
  await tapEl(c, '#btnResume'); await sleep(200);
  // visibility hidden → paused
  await setHidden(p, true); await sleep(200);
  check('[visibility] page hidden → paused, voice stopped', (await mode(p)) === 'paused');
  await setHidden(p, false); await sleep(200);
  check('[visibility] page visible again → stays paused until child taps', (await mode(p)) === 'paused' && (await visible(p, 'scrPause')));
  await tapEl(c, '#btnResume'); await sleep(200);
  check('[visibility] resume after hide', (await mode(p)) === 'play');
  await tapEl(c, '#btnPause'); await sleep(150);
  await tapEl(c, '#btnHome'); await sleep(300);
  const h = await p.evaluate(() => ({ mode: PG.debug.mode, music: PG.Audio._playing, hud: document.getElementById('hud').classList.contains('hidden'), bubble: document.getElementById('bubble').classList.contains('hidden'), title: !document.getElementById('scrTitle').classList.contains('hidden') }));
  check('[pause] Home → title, music stopped, HUD+bubble hidden', h.mode === 'title' && !h.music && h.hud && h.bubble && h.title, h);
  await startPlay(c);
  check('[pause] Play after Home starts a fresh session', (await p.evaluate(() => PG.debug.world.level === 0 && PG.debug.world.round === 0)) && await mus());
  await tapEl(c, '#btnPause'); await tapEl(c, '#btnHome'); await sleep(200);
  const s0 = await p.evaluate(() => PG.debug.stats.sessions);
  const pb = await p.locator('#btnPlay').boundingBox();
  await tap(c, pb.x + pb.width / 2, pb.y + pb.height / 2); await tap(c, pb.x + pb.width / 2, pb.y + pb.height / 2); await sleep(300);
  check('[pause] double tap on Play starts exactly one session', (await p.evaluate(() => PG.debug.stats.sessions)) === s0 + 1);
  // hidden during Talk time
  await waitRound(p);
  await reachTalk(c);
  await setHidden(p, true); await sleep(150);
  const mt = await p.evaluate(() => ({ mode: PG.debug.mode, music: PG.Audio._playing, ctx: PG.Audio.ctx && PG.Audio.ctx.state }));
  await setHidden(p, false); await sleep(150);
  check('[visibility] page hidden during Talk time silences audio', !mt.music || mt.ctx !== 'running', mt);
  check('[pause] no console errors', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

/* Rotation mid-steer: steer cancels, Pip and bubbles stay inside, play continues. */
async function gRotate() {
  for (const [A, B] of [[DEV.iphoneP, DEV.iphoneL], [DEV.ipadL, DEV.ipadP], [DEV.iphoneL, DEV.iphoneP]]) {
    const N = `[rotate ${A.name}→${B.name}]`;
    const c = await open(A, 'mute=1&seed=8&age=4');
    const p = c.page;
    await startPlay(c); await settleQuality(p);
    await p.waitForFunction(() => PG.debug.world.items.filter(i => i.state === 'fall').length >= 2, null, { timeout: 20000 }).catch(() => {});
    // steer to the far right edge, finger down
    const fy = await fingerCssY(p);
    let pre, retries = 0;
    for (; retries < 3; retries++) {   // a render-quality step (BUG F1) can cancel the steer before we rotate: retry
      await touch(c.cdp, 'touchStart', [{ x: 20, y: fy }]); await sleep(60);
      for (let k = 1; k <= 6; k++) { await touch(c.cdp, 'touchMove', [{ x: 20 + (A.viewport.width - 40) * k / 6, y: fy }]); await sleep(40); }
      await sleep(500);
      pre = await info(p);
      if (pre.pup.steering) break;
      await touch(c.cdp, 'touchEnd', []); await sleep(300);
    }
    if (retries) console.log(`  note: ${N} steer had to be restarted ${retries}x before rotating (F1)`);
    await clearEv(p);
    await p.setViewportSize(B.viewport); await sleep(700);
    const mid = await info(p);
    const bad = await p.evaluate(() => __T.inScreen());
    check(`${N} steer cancelled by rotation`, pre.pup.steering && !mid.pup.steering && !mid.finger.down, { pre: pre.pup, mid: mid.pup });
    check(`${N} layout switched (W ${pre.L.W}→${mid.L.W})`, (mid.L.W > mid.L.H) === (B.viewport.width > B.viewport.height), { pre: [pre.L.W, pre.L.H], mid: [mid.L.W, mid.L.H] });
    check(`${N} Pip + bubbles inside the new screen`, bad.length === 0, bad);
    // the stale finger keeps moving: Pip must NOT follow it
    const tx0 = mid.pup.targetX;
    await touch(c.cdp, 'touchMove', [{ x: 10, y: fy }]); await sleep(120);
    await touch(c.cdp, 'touchMove', [{ x: 30, y: fy }]); await sleep(120);
    const m2 = await info(p);
    check(`${N} the old finger does not steer after rotation`, !m2.pup.steering && Math.abs(m2.pup.targetX - tx0) < 1, { tx0, tx: m2.pup.targetX });
    await touch(c.cdp, 'touchEnd', []); await sleep(200);
    const ev = await evs(p);
    check(`${N} no tap/tapPup from the cancelled touch`, !ev.some(e => e.type === 'tap' || e.type === 'tapPup'), ev.map(e => e.type));
    // canvas fits the new viewport
    const v = await p.evaluate(() => { const v = PG.debug.view(); return { fits: v.cssW <= innerWidth + 1 && v.cssH <= innerHeight + 1, iw: innerWidth, ih: innerHeight }; });
    check(`${N} canvas fits the new viewport`, v.fits, v);
    // still playable: a fresh steer catches a right bubble
    await waitRound(p).catch(() => {});
    await clearEv(p);
    let st = await steer(c, 'right', { timeout: 20000 });
    if (!(st.settled && st.settled.type === 'catch')) { await waitRound(p).catch(() => {}); st = await steer(c, 'right', { timeout: 20000 }); }
    check(`${N} still playable after rotation (fresh steer catches)`, st.settled && st.settled.type === 'catch' && st.settled.right, { why: st.why, settled: st.settled });
    // rotate back while bubbles fall, check again a few times
    await p.setViewportSize(A.viewport); await sleep(300);
    let worst = [];
    for (let k = 0; k < 6; k++) { await sleep(250); const b2 = await p.evaluate(() => __T.inScreen()); if (b2.length) worst = b2; }
    check(`${N} rotate back: Pip + bubbles inside over 1.5 s`, worst.length === 0, worst);
    await p.screenshot({ path: path.join(OUT, `rotate-${A.name}.png`) });
    check(`${N} no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* HUD / speech-bubble taps never steer Pip. */
async function gHud() {
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const N = `[hud ${d.name}]`;
    const c = await open(d, 'mute=1&seed=5&age=4');
    const p = c.page;
    await startPlay(c); await settleQuality(p);
    for (const sel of ['.hud-stars', '#hudDots', '#bubble']) {
      const bb = await p.locator(sel).first().boundingBox();
      if (!bb || bb.width === 0) { check(`${N} ${sel} visible to tap`, false, bb); continue; }
      const x0 = (await info(p)).pup.x;
      await clearEv(p);
      const v0 = (await voice(p)).length;
      await touch(c.cdp, 'touchStart', [{ x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 }]); await sleep(150);
      const mid = await info(p);
      await touch(c.cdp, 'touchMove', [{ x: bb.x + bb.width / 2 + 60, y: bb.y + bb.height / 2 + 10 }]); await sleep(150);
      const mid2 = await info(p);
      await touch(c.cdp, 'touchEnd', []); await sleep(400);
      const a = await info(p);
      check(`${N} touch on ${sel} does not steer Pip`, !mid.pup.steering && !mid2.pup.steering && Math.abs(a.pup.x - x0) < 3, { x0, x: a.pup.x, steering: [mid.pup.steering, mid2.pup.steering] });
      if (sel === '#bubble') {
        await tapEl(c, '#bubble'); await sleep(200);
        const vl = (await voice(p)).slice(v0);
        const pr = await p.evaluate(() => document.getElementById('bubbleText').textContent);
        check(`${N} tap on the speech bubble repeats the prompt`, vl.some(v => v.text === pr), { pr, vl });
      }
    }
    // second finger is ignored while steering
    const fy = await fingerCssY(p);
    await touch(c.cdp, 'touchStart', [{ x: 60, y: fy, id: 1 }]); await sleep(80);
    await touch(c.cdp, 'touchStart', [{ x: 60, y: fy, id: 1 }, { x: d.viewport.width - 60, y: fy, id: 2 }]); await sleep(80);
    await touch(c.cdp, 'touchMove', [{ x: 60, y: fy, id: 1 }, { x: d.viewport.width - 80, y: fy, id: 2 }]); await sleep(80);
    const two = await info(p);
    const lx = (60 - two.view.left) / two.view.s;
    await touch(c.cdp, 'touchEnd', []); await sleep(100);
    check(`${N} a second finger does not take over the steer`, Math.abs(two.pup.targetX - Math.max(two.pup.minX, Math.min(two.pup.maxX, lx))) < 3, { tx: two.pup.targetX, lx, pup: two.pup, finger: two.finger, q: await p.evaluate(() => PG.debug.render().quality) });
    check(`${N} no console errors`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* Full bot sessions at speed 10 for every age, both languages. */
async function botSession(age, lang, dev, seed) {
  const N = `[bot age${age} ${lang} ${dev.name}]`;
  const c = await open(dev, `speed=10&bot=1&autostart=1&seed=${seed}&mute=1&age=${age}&lang=${lang}&skill=0.7`);
  const p = c.page;
  const t0 = Date.now();
  let done = false, stuck = null;
  // watchdog: a single round longer than 150 s game time is a stuck round → dump the world and stop waiting
  await p.evaluate(() => { const w = PG.debug.world; window.__rt = 0; const o = w._beginRound; w._beginRound = function () { window.__rt = this.time; return o.apply(this, arguments); }; });
  while (Date.now() - t0 < 300000) {
    await sleep(1000);
    const s = await p.evaluate(() => { const w = PG.debug.world; return { mode: PG.debug.mode, st: w.state, rt: w.time - window.__rt }; });
    if (s.mode === 'done') { done = true; break; }
    if (s.st === 'round' && s.rt > 150) {
      stuck = await p.evaluate(() => { const w = PG.debug.world, b = w.basket; return { roundTime: (w.time - window.__rt) | 0, topic: w.cur.topic, mode: w.cur.mode, need: w.cur.need, maxAir: w.cur.maxAir,
        pool: w.cur.pool.map(t => t.nameValue + (t.right ? '+' : '-')), basket: { x: b.x | 0, y: b.y | 0, w: b.w | 0, count: b.count, reserved: b.reserved, need: b.need }, roundEnded: w._roundEnded,
        spawnCount: w._spawnCount, sinceSpawn: +(w._sinceSpawn || 0).toFixed(1), counters: w.counters, pup: { x: w.pup.x | 0, steering: w.pup.steering }, botFingerDown: PG.debug.bot && PG.debug.bot.finger.down, worldFingerDown: w.finger.down, quality: PG.debug.render().quality,
        items: w.items.map(i => ({ id: i.id, r: i.right, s: i.state, x: i.x | 0, y: i.y | 0, t: +i.t.toFixed(1), slot: i.slot })),
        L: { W: w.layout.W, H: w.layout.H, groundY: w.layout.groundY, spawnY: w.layout.spawnY, lanes: w.layout.lanes } }; });
      break;
    }
  }
  if (stuck) { check(`${N} no stuck round (watchdog 150 s)`, false, stuck); fs.writeFileSync(path.join(OUT, `stuck-${age}-${lang}-${seed}.json`), JSON.stringify(stuck, null, 1)); }
  const st = await p.evaluate(() => ({ s: PG.debug.getState(), stats: PG.debug.stats, bot: PG.debug.bot && PG.debug.bot.stats, levels: PG.debug.world.levels, wt: PG.debug.world.time }));
  check(`${N} session reaches done (${(st.wt | 0)} s game time, ${((Date.now() - t0) / 1000) | 0} s wall)`, done, st.s);
  await p.evaluate(() => window.__collect());
  if (done) {
    const dt = await p.evaluate(() => ({ done: document.getElementById('doneTitle').textContent, stars: document.getElementById('doneStars').textContent, wstars: PG.debug.world.stars }));
    check(`${N} done screen shows stars`, +dt.stars === dt.wstars && dt.wstars > 0 && !badText(dt.done), dt);
    check(`${N} played 4 chapters incl. 4 Talk times`, st.stats.talks === 4 && st.levels.length === 4, { talks: st.stats.talks, levels: st.levels });
    check(`${N} session ≤ 8 min game time`, st.wt <= 480, st.wt);
    // star rule per round: wrong catches 0→3, 1→2, ≥2→1; misses never cost stars
    const ev = await evs(p, ['round', 'wrong', 'roundDone']);
    const badR = []; let w = 0;
    for (const e of ev) { if (e.type === 'round') w = 0; else if (e.type === 'wrong') w++; else { const x = w === 0 ? 3 : w === 1 ? 2 : 1; if (e.stars !== x || e.mistakes !== w) badR.push({ e, w }); } }
    check(`${N} every round's stars follow the rule (${ev.filter(e => e.type === 'roundDone').length} rounds)`, badR.length === 0, badR.slice(0, 4));
    await p.screenshot({ path: path.join(OUT, `bot-${age}-${lang}-done.png`) });
    await p.evaluate(() => PG.debug.setSpeed(1));
    await tapEl(c, '#btnAgain');
    await sleep(400);
    const ag = await p.evaluate(() => ({ mode: PG.debug.mode, level: PG.debug.world.level, sessions: PG.debug.stats.sessions, hud: document.getElementById('hudStars').textContent }));
    check(`${N} play again starts a new session`, ag.mode === 'play' && ag.level === 0 && ag.sessions === 2 && ag.hud === '0', ag);
  }
  const texts = await p.evaluate(() => ({ voice: PG.debug.voiceLog.map(l => l.lang + '|' + l.text), canvas: [...window.__texts] }));
  const bad = [];
  for (const v of texts.voice) { const [l, ...rest] = v.split('|'); const s = rest.join('|'); const why = badText(s); if (why) bad.push(why + ': ' + s); if (l !== lang) bad.push('wrong lang: ' + v); }
  for (const s of texts.canvas) { const why = badText(s); if (why) bad.push(why + ': ' + s); }
  check(`${N} no "{", undefined/NaN or wrong-language line in ${texts.voice.length} voice + ${texts.canvas.length} UI strings`, bad.length === 0, [...new Set(bad)].slice(0, 12));
  if (lang === 'vi') {
    const viLike = texts.voice.filter(v => /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹ]/i.test(v)).length;
    const en = texts.voice.filter(v => /\b(the|Catch|basket|Yes|Great|Chapter|Pip says|Woof)\b/.test(v.split('|').slice(1).join('|')) && !/Gâu/.test(v));
    check(`${N} Vietnamese lines really Vietnamese`, viLike / Math.max(1, texts.voice.length) > 0.6 && en.length === 0, { viLike, n: texts.voice.length, en: en.slice(0, 5) });
  }
  check(`${N} no console errors`, c.errors.length === 0, c.errors.slice(0, 5));
  fs.writeFileSync(path.join(OUT, `texts-${age}-${lang}.json`), JSON.stringify(texts, null, 1));
  await c.ctx.close();
}
async function gBot() {
  const jobs = [];
  const devs = [DEV.ipadL, DEV.iphoneP, DEV.iphoneL, DEV.ipadP];
  let k = 0;
  const REP = +(process.env.REP || 1);
  for (let r = 0; r < REP; r++) for (const age of [3, 4, 5, 6, 7]) for (const lang of ['en', 'vi']) jobs.push([age, lang, devs[k++ % devs.length], 10 + k]);
  const PAR = +(process.env.PAR || 3);
  for (let i = 0; i < jobs.length; i += PAR) await Promise.all(jobs.slice(i, i + PAR).map(j => botSession(...j)));
}

(async () => {
  srv = await serve();
  browser = await chromium.launch();
  const groups = { boot: gBoot, lang: gLang, gate: gGate, settings: gSettings, input: gInput, count: gCount, talk: gTalk, pause: gPause, rotate: gRotate, hud: gHud, bot: gBot };
  for (const [g, fn] of Object.entries(groups)) {
    if (!want(g)) continue;
    const t0 = Date.now();
    try { await fn(); } catch (e) { check(`[${g}] group crashed`, false, String(e.stack || e).slice(0, 600)); }
    console.log(`  (${g} ${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), pass: results.length - fails.length, fail: fails.length, results }, null, 1));
  console.log(`\n${results.length - fails.length} passed, ${fails.length} failed`);
  if (fails.length) { console.log('FAILED:'); fails.forEach(f => console.log('  - ' + f.name)); }
  process.exit(fails.length ? 1 : 0);
})();
