// Independent functional QA for Nim's River Hop (report-only; written by the functional QA tester).
// Playwright isMobile + hasTouch contexts; every game tap is a REAL touch (CDP Input.dispatchTouchEvent or page.touchscreen).
//   node tests/qa/qa_functional.js                 all groups
//   QA_GROUPS=chapters,voice node tests/qa/qa_functional.js
//   DEV=iphone-p node tests/qa/qa_functional.js    one device for the per-device groups
// Output: tests/qa/out/results.json (+ screenshots). Exit 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });

const DEVS = {
  'iphone-p': { viewport: { width: 393, height: 852 }, dpr: 3 },
  'iphone-l': { viewport: { width: 852, height: 393 }, dpr: 3 },
  'ipad-p': { viewport: { width: 820, height: 1180 }, dpr: 2 },
  'ipad-l': { viewport: { width: 1180, height: 820 }, dpr: 2 },
  'iphone-p-notch': { viewport: { width: 393, height: 852 }, dpr: 3, sa: { t: 59, r: 0, b: 34, l: 0 } },
  'iphone-l-notch': { viewport: { width: 852, height: 393 }, dpr: 3, sa: { t: 0, r: 59, b: 21, l: 59 } }
};
const IOS_UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const BANNED = /bubble|rainbow|\bBao\b|panda|bong bóng|cầu vồng|gấu trúc|\bBảo\b/i;
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object/;

const results = []; const findings = [];
function rec(dev, group, test, ok, detail) {
  results.push({ dev, group, test, ok, detail: detail || '' });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${dev.padEnd(15)} ${group}/${test}${detail ? '  — ' + String(detail).slice(0, 300) : ''}`);
}
const note = (dev, s) => { findings.push(dev + ': ' + s); console.log('NOTE  ' + dev + ': ' + s); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------ in-page instrumentation */
const INIT = (opts) => {
  window.__ev = []; window.__says = []; window.__synth = { started: [], cut: [], ended: [] };
  if (opts.sa) {
    const css = `:root{--sa-t:${opts.sa.t}px !important;--sa-r:${opts.sa.r}px !important;--sa-b:${opts.sa.b}px !important;--sa-l:${opts.sa.l}px !important}`;
    document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); });
  }
  if (opts.fakeSynth) {
    // a deterministic speechSynthesis: one line at a time, ~90 ms per character + 300 ms, records cuts
    const S = { speaking: false, pending: false, paused: false, _q: [], _cur: null, onvoiceschanged: null };
    const voices = [{ name: 'Samantha', lang: 'en-US', localService: true }, { name: 'Linh', lang: 'vi-VN', localService: true }];
    S.getVoices = () => voices;
    S.addEventListener = () => {};
    S.pause = () => {}; S.resume = () => {};
    const next = () => {
      if (S._cur || !S._q.length) { S.speaking = !!S._cur; S.pending = S._q.length > 0; return; }
      const u = S._cur = S._q.shift(); S.speaking = true; S.pending = S._q.length > 0;
      u._t0 = performance.now(); u._dur = 300 + 90 * u.text.length;
      window.__synth.started.push({ text: u.text, t: u._t0 });
      setTimeout(() => { if (u.onstart) u.onstart({}); }, 15);
      u._timer = setTimeout(() => { if (S._cur !== u) return; S._cur = null; window.__synth.ended.push({ text: u.text }); if (u.onend) u.onend({}); next(); }, u._dur);
    };
    S.speak = u => { if (u.text.trim()) { S._q.push(u); setTimeout(next, 0); } else { setTimeout(() => u.onend && u.onend({}), 5); } };
    S.cancel = () => {
      const c = S._cur; S._cur = null; const q = S._q; S._q = [];
      if (c) { clearTimeout(c._timer); const el = performance.now() - c._t0; window.__synth.cut.push({ text: c.text, el: Math.round(el), dur: c._dur }); if (c.onerror) c.onerror({ error: 'interrupted' }); }
      q.forEach(u => u.onerror && u.onerror({ error: 'canceled' }));
      S.speaking = false; S.pending = false;
    };
    Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => S });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; this.lang = ''; this.rate = 1; this.pitch = 1; this.volume = 1; };
  }
  const DK = window.DK = window.DK || {};
  let voice;
  Object.defineProperty(DK, 'Voice', { configurable: true, get: () => voice, set: v => {
    voice = v;
    if (v && v.say && !v.say.__w) {
      const o = v.say;
      v.say = function (text, op) {
        const rec = { text: String(text), op: Object.assign({}, op || {}), t: performance.now(), res: null };
        window.__says.push(rec);
        const p = o.apply(this, arguments); if (p && p.then) p.then(r => { rec.res = r && r.reason; }); return p;
      };
      v.say.__w = true;
    }
  } });
  window.__qa = {
    hook() {
      const w = DK.debug.world; if (!w || w.__qa) return; w.__qa = true;
      const o = w._emit;
      w._emit = function (e) {
        e._t = w.time; e._st = w.stars;
        window.__ev.push(e);
        const r = o.call(this, e);
        if (e.type === 'land' && e.id != null) { const st = w.stoneById(e.id); e._dx = st ? Math.abs(w.nim.x - st.x) : -1; e._onRow = w.nim.onRow; e._row = st && st.row; e._S = w.layout.S;
          const n = DK.debug.toScreen(w.nim.x, w.nim.y); e._nimIn = n.x >= 0 && n.y >= 0 && n.x <= innerWidth && n.y <= innerHeight + 1; }
        if (e.type === 'ask') { const li = window.__qa.layoutIssues(); if (li.length) (window.__layout = window.__layout || []).push({ topic: w.topic, round: w.round, li }); }
        if (e.type === 'round' && DK.Content && DK.Content.validate && w.cur) { const v = DK.Content.validate(w.cur); if (v) (window.__invalid = window.__invalid || []).push(w.topic + ': ' + v); }
        return r;
      };
    },
    variants(a) { const set = new Set(); for (let i = 0; i < 80; i++) for (const f of [true, false]) set.add(DK.I18N.ask(DK.debug.world.lang, a.promptKey, Object.assign({ child: DK.debug.getState().settings.name || '' }, a.params), { first: f })); return set; },
    /** the wording Nim actually said for the latest ask */
    saidPrompt() { const a = window.__ev.filter(e => e.type === 'ask').pop(); if (!a) return null; const V = this.variants(a), L = DK.debug.voiceLog; for (let i = L.length - 1; i >= 0; i--) if (V.has(L[i].text)) return L[i].text; return null; },
    /** asks whose question never appeared in the voice log */
    missingPrompts() { const L = DK.debug.voiceLog.map(l => l.text); return window.__ev.filter(e => e.type === 'ask').filter(a => { const V = this.variants(a); return !L.some(t => V.has(t)); }).map(a => a.promptKey + ' ' + JSON.stringify(a.params)); },
    rectOf(el) { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; },
    safe() { const cs = getComputedStyle(document.getElementById('safeProbe')); return { t: parseFloat(cs.paddingTop) || 0, r: parseFloat(cs.paddingRight) || 0, b: parseFloat(cs.paddingBottom) || 0, l: parseFloat(cs.paddingLeft) || 0 }; },
    /** stones (footprints) vs the DOM bubble + HUD + the safe screen */
    layoutIssues() {
      const w = DK.debug.world, L = w.layout, v = DK.debug.view(), sa = this.safe(), out = [];
      const keeps = [];
      const hud = document.getElementById('hud'); if (!hud.classList.contains('hidden')) keeps.push(['hud', this.rectOf(hud)]);
      const B = L.bubble; keeps.push(['bubbleLayout', { x: v.left + B.x * v.s, y: v.top + B.y * v.s, w: B.w * v.s, h: B.h * v.s }]);
      const bd = document.getElementById('bubble'); if (!bd.classList.contains('hidden')) keeps.push(['bubbleDOM', this.rectOf(bd)]);
      for (const s of w.stones) {
        if (s.state !== 'rest') continue;
        const x0 = v.left + (s.x - L.S / 2) * v.s, x1 = v.left + (s.x + L.S / 2) * v.s, y0 = v.top + (s.y - L.itemH) * v.s, y1 = v.top + (s.y + 0.4 * L.S) * v.s;
        for (const [n, k] of keeps) if (x0 < k.x + k.w - 2 && x1 > k.x + 2 && y0 < k.y + k.h - 2 && y1 > k.y + 2) out.push(`${s.id} overlaps ${n} (stone ${x0 | 0},${y0 | 0}-${x1 | 0},${y1 | 0} vs ${k.x | 0},${k.y | 0} ${k.w | 0}x${k.h | 0})`);
        if (x0 < sa.l - 2 || x1 > innerWidth - sa.r + 2 || y0 < sa.t - 2 || y1 > innerHeight - sa.b + 2) out.push(`${s.id} outside safe screen (${x0 | 0},${y0 | 0}-${x1 | 0},${y1 | 0})`);
      }
      const n = DK.debug.toScreen(w.nim.x, w.nim.y);
      if (n.x < sa.l || n.x > innerWidth - sa.r || n.y > innerHeight - sa.b + 2 || n.y < sa.t) out.push(`Nim feet outside safe (${n.x | 0},${n.y | 0})`);
      return out;
    },
    /** a CSS point on open water clear of every stone / Nim / surprise / DOM */
    softPoint() {
      const w = DK.debug.world, L = w.layout, R = L.river, v = DK.debug.view(), nb = w.nimHit();
      let best = null, bd = -1;
      for (let gx = 0.04; gx < 0.97; gx += 0.03) for (let gy = 0.05; gy < 0.96; gy += 0.03) {
        const cx = innerWidth * gx, cy = innerHeight * gy, x = (cx - v.left) / v.s, y = (cy - v.top) / v.s;
        if (x < R.x + 15 || x > R.x + R.w - 15 || y < R.y + 15 || y > R.y + R.h - 15) continue;
        const el = document.elementFromPoint(cx, cy); if (!el || el.id !== 'game') continue;
        if (nb && x > nb.x - 30 && x < nb.x + nb.w + 30 && y > nb.y - 30 && y < nb.y + nb.h + 30) continue;
        let d = 1e9;
        for (const s of w.stones) if (s.state !== 'gone' && s.state !== 'hidden') d = Math.min(d, Math.hypot(x - s.x, y - s.y), Math.hypot(x - s.x, y - s.y + 0.35 * L.itemH));
        for (const c of [w.fishHit(), w.frogHit(), w.snowHit()]) if (c) d = Math.min(d, Math.hypot(x - c.cx, y - c.cy) - c.r);
        if (d < L.hitR + 30) continue;
        if (d > bd) { bd = d; best = { x: Math.round(cx), y: Math.round(cy) }; }
      }
      return best;
    },
    /** a CSS point inside Nim's box but off every stone hit area */
    nimPoint() {
      const w = DK.debug.world, L = w.layout, v = DK.debug.view(), b = w.nimHit(); if (!b) return null;
      let best = null, bd = -1;
      for (let i = 1; i < 10; i++) for (let j = 1; j < 10; j++) {
        const x = b.x + b.w * i / 10, y = b.y + b.h * j / 10;
        let d = 1e9; for (const s of w.stones) if (s.state === 'rest' && !s.visited) d = Math.min(d, Math.hypot(x - s.x, y - s.y), Math.hypot(x - s.x, y - s.y + 0.35 * L.itemH));
        const cx = v.left + x * v.s, cy = v.top + y * v.s, el = document.elementFromPoint(cx, cy);
        if (!el || el.id !== 'game') continue;
        if (d > bd) { bd = d; best = { x: Math.round(cx), y: Math.round(cy), d }; }
      }
      return best && best.d > L.hitR + 2 ? best : null;
    },
    st() {
      const w = DK.debug.world, a = DK.debug.answer();
      const rest = w.stones.filter(s => s.state === 'rest');
      return { mode: DK.debug.mode, state: w.state, phase: w.phase, round: w.round, level: w.level, topic: w.topic, row: w.row, k: w.cur && w.cur.k, m: w.cur && w.cur.m,
        cmode: w.cur && w.cur.mode, inter: w.interactive, a: a && a.id, misses: w.misses, stars: w.stars, hud: +document.getElementById('hudStars').textContent,
        others: rest.filter(s => s.row === w.row && !s.target && !s.visited).map(s => s.id), ahead: rest.filter(s => s.row > w.row).map(s => s.id),
        nimRow: w.nim.onRow, nimState: w.nim.state, hint: !!w.hintHand, rpl: w.roundsPerLevel };
    }
  };
};

/* ------------------------------------------------------------ touch helpers */
const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 6, radiusY: 6, force: 1 });
const tStart = (cdp, pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
const tMove = (cdp, pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts });
const tEnd = (cdp, pts = []) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts });
async function tap(cdp, p, hold = 60) { await tStart(cdp, [tp(p.x, p.y)]); await sleep(hold); await tEnd(cdp); }
async function tapStone(cdp, page, id, hold = 60) {
  const at = await page.evaluate(i => DK.debug.stoneScreen(i), id);
  if (!at) throw new Error('stone ' + id + ' not tappable');
  await tap(cdp, at, hold); return at;
}
async function tapEl(page, sel) {
  let b = null;
  for (let k = 0; k < 15; k++) { const b1 = await page.locator(sel).first().boundingBox(); await sleep(70); b = await page.locator(sel).first().boundingBox(); if (b1 && b && Math.abs(b1.x - b.x) < .5 && Math.abs(b1.y - b.y) < .5) break; }
  if (!b) throw new Error('not visible ' + sel);
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
}
const S = page => page.evaluate(() => window.__qa.st());
const evN = page => page.evaluate(() => window.__ev.length);
const evs = (page, n) => page.evaluate(n => window.__ev.slice(n).map(e => { const c = {}; for (const k in e) { const v = e[k]; if (v === null || typeof v !== 'object') c[k] = v; } if (e.got) c.got = e.got; if (e.want) c.want = { count: e.want.count, value: e.want.value, nameKind: e.want.nameKind }; return c; }), n);
const vlN = page => page.evaluate(() => DK.debug.voiceLog.length);
const vl = (page, n) => page.evaluate(n => DK.debug.voiceLog.slice(n).map(l => l.text), n);
const speed = (page, n) => page.evaluate(n => DK.debug.setSpeed(n), n);
const READY = () => { const w = DK.debug.world, a = DK.debug.answer(); return w.interactive && a && a.id != null && !!DK.debug.stoneScreen(a.id) && w.phase === 'play' && w.stones.every(s => s.state !== 'rise'); };
async function waitReady(page, timeout = 40000, sp = 4) {
  await speed(page, sp);
  await page.waitForFunction(READY, null, { timeout, polling: 'raf' });
  await speed(page, 1); await sleep(150);
}
async function waitStand(page, timeout = 15000) {
  await speed(page, 3);
  await page.waitForFunction(() => { const w = DK.debug.world, a = DK.debug.answer(); return (w.interactive && a && DK.debug.stoneScreen(a.id)) || w.state !== 'round' || w.phase !== 'play' || w.row >= (w.cur ? w.cur.k : 0); }, null, { timeout, polling: 'raf' });
  await speed(page, 1); await sleep(100);
}
async function newPage(browser, name, errors, extra = {}) {
  const d = DEVS[name];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true, userAgent: extra.ios ? IOS_UA : undefined });
  await ctx.addInitScript(INIT, { sa: d.sa || null, fakeSynth: !!extra.fakeSynth });
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e && e.stack || e)));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  page.on('crash', () => errors.push('CRASH'));
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}
async function gotoTitle(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title' && DK.debug.world, null, { timeout: 25000 });
  await page.evaluate(() => window.__qa.hook());
  await sleep(300);
}
const check = (c, m) => { if (!c) throw new Error(m); };

/* ------------------------------------------------------------ group: boot + language */
async function gBoot(browser, url, dev) {
  const errors = []; const { ctx, page, cdp } = await newPage(browser, dev, errors);
  const G = 'boot';
  try {
    await gotoTitle(page, url + '?seed=5');
    const title = await page.title();
    rec(dev, G, 'title (EN)', /Nim/.test(title) && /River Hop/.test(title), title);
    const lay = await page.evaluate(() => { const r = id => document.getElementById(id).getBoundingClientRect(); const p = r('btnPlay'), g = r('btnParents'); return { p: [p.left, p.top, p.width, p.height], g: [g.left, g.top, g.width, g.height], sa: window.__qa.safe(), W: innerWidth, H: innerHeight }; });
    const inside = b => b[0] >= lay.sa.l - 1 && b[1] >= lay.sa.t - 1 && b[0] + b[2] <= lay.W - lay.sa.r + 1 && b[1] + b[3] <= lay.H - lay.sa.b + 1;
    rec(dev, G, 'play+gear inside safe area, ≥44px', inside(lay.p) && inside(lay.g) && lay.p[2] >= 44 && lay.g[2] >= 40, JSON.stringify(lay));
    // language: tap Tiếng Việt chip on the title
    let n0 = await vlN(page);
    await tapEl(page, '#scrTitle [data-lang="vi"]'); await sleep(400);
    let st = await page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, lang: document.documentElement.lang, stored: localStorage.getItem('nh:settings'), title: document.title, play: document.getElementById('btnPlay').getAttribute('aria-label') }));
    rec(dev, G, 'title (VI)', /Nhím Nim/.test(st.title), st.title + ' / play aria ' + st.play);
    let lines = await vl(page, n0);
    rec(dev, G, 'switch EN→VI relabels + speaks VI', /Nhím/.test(st.logo) && st.lang === 'vi' && lines.length >= 1 && VI_CHARS.test(lines[lines.length - 1]) && /"lang":"vi"/.test(st.stored || ''), JSON.stringify({ st, lines }));
    n0 = await vlN(page);
    await tapEl(page, '#scrTitle [data-lang="en"]'); await sleep(400);
    st = await page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, lang: document.documentElement.lang }));
    lines = await vl(page, n0);
    rec(dev, G, 'switch VI→EN relabels + speaks EN', /River Hop/.test(st.logo) && st.lang === 'en' && lines.length >= 1 && !VI_CHARS.test(lines[lines.length - 1]), JSON.stringify({ st, lines }));
    // start by tapping ▶
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => DK.debug.mode === 'play' && DK.debug.world.state === 'round', null, { timeout: 15000 });
    rec(dev, G, 'play button starts a session', true);
    await page.screenshot({ path: path.join(OUT, dev + '-boot.png') });
  } catch (e) { rec(dev, G, 'exception', false, e.message); }
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ group: parent gate + settings persistence + URL flags */
async function gSettings(browser, url, dev) {
  const errors = []; const { ctx, page, cdp } = await newPage(browser, dev, errors);
  const G = 'settings';
  const visible = id => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);
  const gearC = async () => { const b = await page.locator('#btnParents').boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  try {
    await gotoTitle(page, url + '?seed=2');
    await page.touchscreen.tap((await gearC()).x, (await gearC()).y); await sleep(700);
    rec(dev, G, 'short tap on gear does NOT open settings', !(await visible('scrSettings')));
    const g = await gearC();
    await tStart(cdp, [tp(g.x, g.y)]); await sleep(1000); await tEnd(cdp); await sleep(600);
    rec(dev, G, '1 s hold does NOT open settings', !(await visible('scrSettings')));
    await tStart(cdp, [tp(g.x, g.y)]); await sleep(2300); await tEnd(cdp); await sleep(500);
    rec(dev, G, '2 s hold opens settings', await visible('scrSettings'));
    // change everything by touch
    await tapEl(page, '#ageChips [data-age="6"]');
    await tapEl(page, '#scrSettings [data-lang="vi"]');
    await page.locator('#inpName').tap(); await page.keyboard.type('Mai'); await page.locator('#inpName').dispatchEvent('change'); await page.keyboard.press('Enter').catch(() => {});
    for (const id of ['optSfx', 'optMusic', 'optVoice', 'optMic']) await tapEl(page, `label.toggle:has(#${id})`);
    await page.evaluate(() => { const s = document.getElementById('optVolume'); s.value = 40; s.dispatchEvent(new Event('input', { bubbles: true })); s.dispatchEvent(new Event('change', { bubbles: true })); });
    await sleep(200);
    await tapEl(page, '#btnSettingsDone'); await sleep(300);
    const saved1 = await page.evaluate(() => localStorage.getItem('nh:settings'));
    let s1 = {}; try { s1 = JSON.parse(saved1); } catch (e) {}
    const want = { age: 6, lang: 'vi', name: 'Mai', sfx: false, music: false, voice: false, mic: false, volume: 0.4 };
    const diff = Object.keys(want).filter(k => s1[k] !== want[k]);
    rec(dev, G, 'all 8 settings saved under nh:settings', diff.length === 0, 'diff ' + diff.join(',') + ' saved=' + saved1);
    const keys = await page.evaluate(() => Object.keys(localStorage));
    rec(dev, G, 'every storage key has nh: prefix', keys.every(k => k.startsWith('dk:')), keys.join(','));
    // reload: restored
    await gotoTitle(page, url + '?seed=2');
    const after = await page.evaluate(() => ({ s: DK.debug.getState().settings, age: document.getElementById('titleAge').textContent, lang: document.documentElement.lang }));
    const d2 = Object.keys(want).filter(k => after.s[k] !== want[k]);
    rec(dev, G, 'settings restored after reload', d2.length === 0 && after.lang === 'vi', JSON.stringify(after));
    // URL flags: age=3&lang=en are session-only
    await gotoTitle(page, url + '?seed=2&age=3&lang=en');
    const ov = await page.evaluate(() => ({ age: document.getElementById('titleAge').textContent, lang: document.documentElement.lang }));
    const g2 = await gearC(); await tStart(cdp, [tp(g2.x, g2.y)]); await sleep(2300); await tEnd(cdp); await sleep(400);
    await tapEl(page, 'label.toggle:has(#optSfx)'); await sleep(150);   // a save while the flags are active
    await tapEl(page, '#btnSettingsDone'); await sleep(200);
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => DK.debug.world.state === 'round', null, { timeout: 15000 }).catch(async () => { const st = await page.evaluate(() => ({ mode: DK.debug.mode, st: DK.debug.world.state, scr: [...document.querySelectorAll('.screen')].filter(s => !s.classList.contains('hidden')).map(s => s.id) })); await page.screenshot({ path: path.join(OUT, dev + '-settings-fail.png') }); throw new Error('play after settings did not start: ' + JSON.stringify(st)); });
    const played = await page.evaluate(() => ({ age: DK.debug.world.age, lang: DK.debug.world.lang }));
    const s3 = JSON.parse(await page.evaluate(() => localStorage.getItem('nh:settings')));
    rec(dev, G, 'URL ?age=3&lang=en used for play', played.age === 3 && played.lang === 'en' && /3/.test(ov.age) && ov.lang === 'en', JSON.stringify({ ov, played }));
    rec(dev, G, 'URL flags never saved', s3.age === 6 && s3.lang === 'vi' && s3.sfx === true, JSON.stringify(s3));
  } catch (e) { rec(dev, G, 'exception', false, e.message); }
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ group: a whole age-4 session by real taps, one topic per chapter */
const AHEAD_RE = /one at a time|từng hòn/i;
async function gChapters(browser, url, dev, { topics = ['colors', 'shapes', 'count', 'animals'], lang = 'en', age = 4, seed = 11 } = {}) {
  const errors = []; const { ctx, page, cdp } = await newPage(browser, dev, errors);
  const G = 'chapters-' + lang;
  const fails = []; let passes = 0;
  const ok = (c, m) => { if (c) passes++; else fails.push(m); return c; };
  const modes = new Set(); let starTrace = [], hudTrace = [];
  try {
    await gotoTitle(page, `${url}?mute=1&seed=${seed}&age=${age}&lang=${lang}`);
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => DK.debug.mode === 'play', null, { timeout: 8000 });
    await page.evaluate(t => { const w = DK.debug.world; w.levels = t.slice(); w.startLevel(0); }, topics);
    const sample = async () => { const s = await S(page); starTrace.push(s.stars); hudTrace.push(s.hud); return s; };
    for (let lv = 0; lv < topics.length; lv++) {
      let roundsPlayed = 0;
      for (let r = 0; r < 4; r++) {
        await waitReady(page, 45000);
        let s = await sample();
        if (s.state !== 'round') break;
        ok(s.level === lv && s.topic === topics[lv], `chapter ${lv} topic ${s.topic}`);
        modes.add(s.cmode);
        const tag = `${topics[lv]} r${s.round} (${s.cmode} ${s.k}x${s.m})`;
        const li = await page.evaluate(() => window.__qa.layoutIssues());
        ok(li.length === 0, `${tag} layout: ${li.join('; ')}`);
        roundsPlayed++;
        const askEv = await page.evaluate(() => { const a = window.__ev.filter(e => e.type === 'ask').pop(); return a && { k: a.promptKey }; });
        const askLines = await page.evaluate(() => DK.debug.voiceLog.map(l => l.text));
        const pText = await page.evaluate(() => window.__qa.saidPrompt());
        ok(askLines.length > 0, `${tag} no prompt in voiceLog`);
        let expectStars = 3;
        if (s.round === 0 && s.others.length) {
          // ---- wrong stone, repeat within 1 s, 2nd miss → hint
          const wid = s.others[0];
          let n0 = await evN(page), v0 = await vlN(page);
          await tapStone(cdp, page, wid); await sleep(120);
          const nRep = await evN(page);
          await tapStone(cdp, page, wid); await sleep(150);   // the same stone again well within 1 s
          let e = await evs(page, n0), s2 = await S(page);
          const eRep = await evs(page, nRep);
          const w1 = e.find(x => x.type === 'wrong');
          ok(w1 && w1.id === wid, `${tag} wrong event missing: ${e.map(x => x.type).join(',')}`);
          ok(!e.some(x => x.type === 'hop'), `${tag} a wrong stone made Nim hop`);
          ok(s2.misses === 1 && s2.nimRow === -1, `${tag} after wrong + same-stone repeat misses=${s2.misses} nimRow=${s2.nimRow}`);
          ok(eRep.some(x => x.type === 'squish' && x.repeat) && !eRep.some(x => x.type === 'wrong'), `${tag} same wrong stone <1 s: ev=${eRep.map(x => x.type).join(',')}`);
          await sleep(300);
          const wl = (await vl(page, v0)).join(' | ');
          const names = await page.evaluate(([id]) => { const w = DK.debug.world, st = w.stoneById(id), L = w.lang, I = DK.I18N;
            const got = [I.name(L, st.thing.nameKind, st.thing.nameValue), String(st.thing.nameValue)];
            const goal = w.cur.mode === 'countSeq' ? [String(w.row + 1)] : [I.name(L, w.cur.rule.nameKind || w.cur.rule.kind, w.cur.rule.value), String(w.cur.rule.value)];
            return { got, goal }; }, [wid]);
          const low = wl.toLowerCase(), has = arr => arr.some(t => t && low.includes(String(t).toLowerCase()));
          ok(wl && has(names.got) && has(names.goal), `${tag} wrong line should name ${JSON.stringify(names.got)} then goal ${JSON.stringify(names.goal)}: "${wl}"`);
          ok(wl && low.indexOf(String(names.got[0]).toLowerCase()) <= Math.max(...names.goal.map(g => low.lastIndexOf(String(g).toLowerCase()))), `${tag} wrong line: goal before tapped name: "${wl}"`);
          await sleep(1100);
          n0 = await evN(page); v0 = await vlN(page);
          await tapStone(cdp, page, s.others[1] || wid); await sleep(300);
          e = await evs(page, n0); s2 = await S(page);
          const glow = await page.evaluate(() => { const w = DK.debug.world, a = DK.debug.answer(); const st = w.stoneById(a.id); return { hand: !!w.hintHand, handOn: w.hintHand && w.hintHand.id === a.id, glow: st && (st.glow || st._glowT) }; });
          ok(s2.misses === 2 && e.some(x => x.type === 'hint') && glow.hand && glow.handOn, `${tag} 2 misses → hint: misses=${s2.misses} ev=${e.map(x => x.type).join(',')} ${JSON.stringify(glow)}`);
          expectStars = 1;
        } else if (s.round === 1) {
          // ---- ahead ×2, water, Nim poke, tap mid-hop, one miss
          const v0 = await vlN(page); let n0 = await evN(page);
          if (s.ahead.length) {
            await tapStone(cdp, page, s.ahead[0]); await sleep(500); await tapStone(cdp, page, s.ahead[s.ahead.length - 1]); await sleep(300);
            const e = await evs(page, n0), s2 = await S(page);
            const nA = e.filter(x => x.type === 'ahead').length;
            ok(nA === 2 && s2.misses === 0 && !e.some(x => x.type === 'hop' || x.type === 'wrong'), `${tag} ahead taps: ${e.map(x => x.type).join(',')} misses ${s2.misses}`);
            const al = (await vl(page, v0)).filter(l => AHEAD_RE.test(l));
            ok(al.length <= 1, `${tag} "One at a time" said ${al.length}×`);
          }
          const sp = await page.evaluate(() => window.__qa.softPoint());
          if (sp) {
            n0 = await evN(page); await tap(cdp, sp); await sleep(200);
            const e = await evs(page, n0), s2 = await S(page);
            ok(e.some(x => x.type === 'soft') && s2.misses === 0 && !e.some(x => x.type === 'wrong' || x.type === 'hop'), `${tag} water tap: ${e.map(x => x.type).join(',')}`);
          } else ok(false, `${tag} no water point found`);
          // Nim poke after the prompt had time to be heard (askAgain waits 3 s since the prompt)
          await sleep(3300);
          await waitReady(page, 10000);
          const np = await page.evaluate(() => window.__qa.nimPoint());
          if (np) {
            n0 = await evN(page); const v1 = await vlN(page);
            await tap(cdp, np); await sleep(500);
            const e = await evs(page, n0), s2 = await S(page), l = await vl(page, v1);
            ok(e.some(x => x.type === 'pokeNim') && s2.misses === 0 && !e.some(x => x.type === 'wrong'), `${tag} Nim tap: ${e.map(x => x.type).join(',')}`);
            ok(pText && l.some(x => x === pText), `${tag} Nim tap did not repeat the question word for word: ${JSON.stringify(l)} (want "${pText}")`);
          } else note(dev, `${tag}: no clear point on Nim's box off the stones (could not test Nim poke here)`);
          await waitReady(page, 10000);
          s = await S(page);
          if (s.others.length) { await tapStone(cdp, page, s.others[0]); await sleep(300); expectStars = 2; }
          // right tap, then taps while airborne: a sinking sibling, Nim, the water
          s = await S(page);
          const sib = s.others[0];
          n0 = await evN(page);
          await tapStone(cdp, page, s.a, 40);
          await sleep(60);
          const sibAt = sib ? await page.evaluate(i => { const w = DK.debug.world, st = w.stoneById(i); return st ? DK.debug.toScreen(st.x, st.y - 0.2 * w.layout.itemH) : null; }, sib) : null;
          if (sibAt) await tap(cdp, sibAt, 30);
          const nb = await page.evaluate(() => DK.debug.nimScreen());
          if (nb) await tap(cdp, { x: nb.cx, y: nb.cy }, 30);
          await waitStand(page);
          const e = await evs(page, n0), s2 = await S(page);
          ok(s2.misses === (expectStars === 2 ? 1 : 0) && !e.some(x => x.type === 'wrong'), `${tag} taps mid-air changed misses: ${s2.misses} ${e.map(x => x.type).join(',')}`);
        }
        // ---- cross by taps: right → hop/land, Nim ends on the stone
        for (let h = 0; h < 6; h++) {
          s = await S(page);
          if (!(s.state === 'round' && s.phase === 'play' && s.row < s.k)) break;
          if (!s.inter) { await waitStand(page); s = await S(page); if (!s.inter) break; }
          const id = s.a, n0 = await evN(page);
          await tapStone(cdp, page, id);
          await waitStand(page);
          await speed(page, 3);
          await page.waitForFunction(i => window.__ev.some(e => e.type === 'land' && e.id === i), id, { timeout: 8000, polling: 'raf' }).catch(() => {});
          await speed(page, 1);
          const e = await evs(page, n0);
          const pos = e.find(x => x.type === 'land' && x.id === id) || {};
          ok(e.some(x => x.type === 'right' && x.id === id) && e.some(x => x.type === 'hop' && x.id === id) && e.some(x => x.type === 'land' && x.id === id), `${tag} right ${id}: ${e.map(x => x.type).join(',')}`);
          ok(pos._onRow === pos._row && pos._dx >= 0 && pos._dx < pos._S * 0.25 && pos._nimIn, `${tag} at land Nim not on stone ${id}: ${JSON.stringify(pos)}`);
          if (s.cmode === 'countSel') {
            await speed(page, 2);
            const cn = await page.waitForFunction(([i, n0]) => { const c = window.__ev.slice(n0).filter(e => e.type === 'count' && e.id === i); return c.length && c[c.length - 1].i === c[c.length - 1].n ? c.map(e => e.i) : null; }, [id, n0], { timeout: 10000, polling: 'raf' }).then(h => h.jsonValue()).catch(() => null);
            await speed(page, 1);
            ok(cn && cn.every((v, q) => v === q + 1), `${tag} countSel ${id}: count events ${JSON.stringify(cn)}`);
          }
        }
        // ---- round done → stars
        const n0 = await evN(page) - 40;
        await speed(page, 4);
        await page.waitForFunction(() => window.__ev.slice(-30).some(e => e.type === 'roundDone' && e._t > 0) , null, { timeout: 20000, polling: 'raf' }).catch(() => {});
        await page.waitForFunction(r => { const w = DK.debug.world; return w.state !== 'round' || w.round !== r; }, s.round, { timeout: 20000, polling: 'raf' }).catch(() => {});
        const rd = await page.evaluate(r => window.__ev.filter(e => e.type === 'roundDone' && e.round === r).pop(), s.round);
        await speed(page, 1);
        const diag = rd ? '' : JSON.stringify(await page.evaluate(() => ({ st: window.__qa.st(), last: window.__ev.slice(-25).map(e => e.type + (e.round != null ? e.round : '')) })));
        ok(rd && rd.stars === expectStars, `${tag} stars ${rd && rd.stars} want ${expectStars} (misses ${rd && rd.misses}, assisted ${rd && rd.assisted}) ${diag}`);
        await sample();
        const st2 = await S(page);
        if (st2.state === 'talk' || st2.mode === 'talk') break;
      }
      // ---- Talk time by tap (right on even chapters, wrong on odd)
      await speed(page, 4);
      await page.waitForFunction(() => DK.debug.mode === 'talk' && document.querySelectorAll('#talkChoices button').length > 0, null, { timeout: 30000, polling: 'raf' });
      await speed(page, 1); await sleep(400);
      const tk = await page.evaluate(() => { const w = DK.debug.world; return { ans: w.talk.answer, ids: w.talk.choices.map(c => String(c.id)), el: w.time - w.levelStartTime, rounds: w.round, rpl: w.roundsPerLevel, stars: w.stars }; });
      ok(roundsPlayed === 4 || (roundsPlayed >= 3 && tk.el > 75), `${topics[lv]}: chapter ended after ${roundsPlayed} rounds at ${tk.el.toFixed(1)} s`);
      const pick = lv % 2 === 0 ? String(tk.ans) : tk.ids.find(i => i !== String(tk.ans));
      const n1 = await evN(page);
      await tapEl(page, `#talkChoices button[data-id="${pick}"]`);
      await sleep(400);
      const tr = (await evs(page, n1)).find(x => x.type === 'talkResult');
      const st3 = await S(page);
      ok(tr && tr.correct === (lv % 2 === 0) && st3.stars === tk.stars + (lv % 2 === 0 ? 1 : 0), `${topics[lv]} talk by tap (${lv % 2 === 0 ? 'right' : 'wrong'}): ${JSON.stringify(tr)} stars ${tk.stars}→${st3.stars}`);
      await sample();
    }
    // ---- session done
    await speed(page, 4);
    await page.waitForFunction(() => DK.debug.mode === 'done', null, { timeout: 40000, polling: 'raf' });
    await speed(page, 1); await sleep(600);
    const done = await page.evaluate(() => ({ ev: window.__ev.filter(e => e.type === 'sessionDone').pop(), done: +document.getElementById('doneStars').textContent, hud: +document.getElementById('hudStars').textContent, w: DK.debug.world.stars }));
    ok(done.ev && done.ev.stars === done.done && done.done === done.w && done.hud === done.w, `done stars: ${JSON.stringify({ ev: done.ev && done.ev.stars, done: done.done, hud: done.hud, w: done.w })}`);
    let mono = true; for (let i = 1; i < starTrace.length; i++) if (starTrace[i] < starTrace[i - 1] || hudTrace[i] < hudTrace[i - 1]) mono = false;
    ok(mono, `stars went down: world ${starTrace.join(',')} hud ${hudTrace.join(',')}`);
    if (topics.includes('count')) ok(modes.has('countSeq') && modes.has('countSel'), `count modes seen: ${[...modes].join(',')}`);
    await page.screenshot({ path: path.join(OUT, `${dev}-${lang}-done.png`) });
    // voice log content
    const log = await page.evaluate(() => DK.debug.voiceLog.map(l => l.text));
    const mp = await page.evaluate(() => window.__qa.missingPrompts());
    ok(mp.length === 0, 'asks never said: ' + mp.join(' | '));
    const ban = log.filter(l => BANNED_RE.test(l));
    ok(ban.length === 0, 'banned words: ' + ban.join(' | '));
    const raw = log.filter(l => /\{|\}|undefined|NaN|\[object/.test(l));
    ok(raw.length === 0, 'raw text: ' + raw.join(' | '));
    if (lang === 'vi') { const en = log.filter(l => !VI_CHARS.test(l) && /[a-z]{3,}/i.test(l) && !/^(nim|hai|ba)!?$/i.test(l.trim())); ok(en.length === 0, 'VI session lines without Vietnamese: ' + en.slice(0, 8).join(' | ')); }
    // play again
    await tapEl(page, '#btnAgain');
    await page.waitForFunction(() => DK.debug.mode === 'play' && DK.debug.world.state !== 'sessionDone', null, { timeout: 8000 });
    const pa = await S(page);
    ok(pa.stars === 0 && pa.level === 0 && pa.hud === 0, 'play again: ' + JSON.stringify(pa));
  } catch (e) { fails.push('exception: ' + e.message); }
  const li = await page.evaluate(() => window.__layout || []).catch(() => []);
  for (const f of fails) rec(dev, G, 'check', false, f);
  rec(dev, G, `${passes} checks passed`, fails.length === 0);
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}
const BANNED_RE = BANNED;

/* ------------------------------------------------------------ group: voice policy with a fake synthesizer (speed 1, not muted) */
async function gVoice(browser, url, dev, lang) {
  const errors = []; const { ctx, page, cdp } = await newPage(browser, dev, errors, { fakeSynth: true, ios: true });
  const G = 'voice-' + lang;
  const fails = []; let passes = 0;
  const ok = (c, m) => { if (c) passes++; else fails.push(m); return c; };
  try {
    await gotoTitle(page, `${url}?seed=21&age=4&lang=${lang}`);
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => DK.debug.mode === 'play', null, { timeout: 8000 });
    await page.evaluate(() => { const w = DK.debug.world; w.levels = ['count', 'colors', 'animals', 'shapes']; w.startLevel(0); });
    // play 2 count rounds (countSeq then countSel) as a QUICK child: tap the next stone the moment it can be tapped
    for (let r = 0; r < 4; r++) {
      await page.waitForFunction(READY, null, { timeout: 40000, polling: 'raf' });
      for (let h = 0; h < 6; h++) {
        const s = await S(page);
        if (!(s.state === 'round' && s.phase === 'play' && s.row < s.k)) break;
        await page.waitForFunction(() => { const w = DK.debug.world, a = DK.debug.answer(); return (w.interactive && a && DK.debug.stoneScreen(a.id)) || w.row >= w.cur.k || w.phase !== 'play'; }, null, { timeout: 15000, polling: 'raf' });
        const a = await page.evaluate(() => { const w = DK.debug.world, a = DK.debug.answer(); return w.interactive && a ? a.id : null; });
        if (a == null) break;
        await tapStone(cdp, page, a, 40);
        // poke Nim and tap water while counting (should never cut a count line)
        if (h === 1) { const nb = await page.evaluate(() => DK.debug.nimScreen()); if (nb) await tap(cdp, { x: nb.cx, y: nb.cy }, 30); }
      }
      await page.waitForFunction(r => (DK.debug.world.round > r && DK.debug.world.state === 'round') || DK.debug.world.state === 'talk', r, { timeout: 40000, polling: 'raf' });
      if ((await S(page)).state === 'talk') break;
    }
    await sleep(8000);   // let the queue drain
    const sy = await page.evaluate(() => ({ says: window.__says.map(s => ({ text: s.text, res: s.res, pr: !!s.op.priority, int: !!s.op.interrupt })), synth: window.__synth }));
    const countRe = lang === 'en' ? /^(One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve)!$|dots?!$/ : /^(Một|Hai|Ba|Bốn|Năm|Sáu|Bảy|Tám|Chín|Mười)!$|chấm!$/;
    const counts = sy.says.filter(s => countRe.test(s.text.trim()));
    ok(counts.length >= 3, `count lines logged: ${counts.length}`);
    const notFull = counts.filter(s => s.res !== 'end');
    ok(notFull.length === 0, `count lines not fully spoken: ${notFull.map(s => s.text + '→' + s.res).join(' | ')}`);
    const cutCounts = sy.synth.cut.filter(c => countRe.test(c.text.trim()));
    ok(cutCounts.length === 0, `count lines cut by synth.cancel: ${JSON.stringify(cutCounts)}`);
    // prompts
    const asks = await page.evaluate(() => window.__ev.filter(e => e.type === 'ask').length);
    const promptSays = sy.says.filter(s => s.pr && !countRe.test(s.text.trim()) && /hop|nhảy|stone|đá|find|tìm|which|ai|đâu/i.test(s.text));
    const promptCut = sy.synth.cut.filter(c => promptSays.some(p => p.text.replace(/[A-ZĐ]{2,}/g, m => m.toLowerCase()) && c.text.length > 10 && p.text.toLowerCase().replace(/\s+/g, ' ').includes(c.text.toLowerCase().slice(0, 12))));
    ok(sy.synth.cut.length === 0 || promptCut.length === 0, `prompt cut: ${JSON.stringify(promptCut)}`);
    ok(asks >= 2, `asks ${asks}`);
    // every ask's prompt appears in the voice log
    const missing = await page.evaluate(() => window.__qa.missingPrompts());
    ok(missing.length === 0, 'prompts not in voiceLog: ' + missing.join(' | '));
    fs.writeFileSync(path.join(OUT, `voice-${dev}-${lang}.json`), JSON.stringify(sy, null, 1));
    if (sy.synth.cut.length) note(dev, `${lang}: ${sy.synth.cut.length} lines cut by cancel(): ${sy.synth.cut.map(c => `"${c.text}" at ${c.el}/${c.dur} ms`).join(' ; ')}`);
    const dropped = sy.says.filter(s => s.res && s.res !== 'end');
    if (dropped.length) note(dev, `${lang}: ${dropped.length} lines never (fully) spoken: ${dropped.map(s => `"${s.text}"→${s.res}`).join(' ; ')}`);
    // VI check on the whole log
    const log = sy.says.map(s => s.text);
    ok(!log.some(l => BANNED.test(l)), 'banned words');
    if (lang === 'vi') { const en = log.filter(l => !VI_CHARS.test(l) && /[a-z]{3,}/i.test(l) && !/^(nim|hai|ba)!?$/i.test(l.trim())); ok(en.length === 0, 'VI lines without Vietnamese: ' + en.join(' | ')); }
  } catch (e) { fails.push('exception: ' + e.message); }
  for (const f of fails) rec(dev, G, 'check', false, f);
  rec(dev, G, `${passes} checks passed`, fails.length === 0);
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ group: pause, visibility, rotation, HUD/bubble, multi-touch, zoom, volume */
async function gRobust(browser, url, dev) {
  const errors = []; const { ctx, page, cdp } = await newPage(browser, dev, errors);
  const G = 'robust';
  const fails = []; let passes = 0;
  const ok = (c, m) => { if (c) passes++; else fails.push(m); return c; };
  const d = DEVS[dev];
  const visible = id => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);
  try {
    await gotoTitle(page, `${url}?mute=1&seed=8&age=4`);
    // zoom guards on the title: double-tap + pinch
    const vp = await page.evaluate(() => ({ meta: document.querySelector('meta[name=viewport]').content, ta: getComputedStyle(document.getElementById('game')).touchAction, bta: getComputedStyle(document.body).touchAction }));
    ok(/user-scalable=no/.test(vp.meta) && /maximum-scale=1/.test(vp.meta), 'viewport meta ' + vp.meta);
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => DK.debug.mode === 'play', null, { timeout: 8000 });
    await waitReady(page);
    const c = { x: d.viewport.width / 2, y: d.viewport.height / 2 };
    const sp0 = await page.evaluate(() => window.__qa.softPoint());
    await tap(cdp, sp0, 30); await sleep(60); await tap(cdp, sp0, 30); await sleep(400);
    await cdp.send('Input.synthesizePinchGesture', { x: sp0.x, y: sp0.y, scaleFactor: 2.0, gestureSourceType: 'touch' }).catch(e => note(dev, 'pinch synth: ' + e.message));
    await sleep(400);
    const zoom = await page.evaluate(() => (window.visualViewport ? visualViewport.scale : 1));
    ok(Math.abs(zoom - 1) < 0.01, `page zoomed to ${zoom} after double-tap/pinch`);
    ok(vp.ta === 'none', 'canvas touch-action ' + vp.ta);
    await waitReady(page);
    // HUD / bubble / menus never reach the canvas
    let n0 = await evN(page);
    const hb = await page.locator('#hud .hud-stars').boundingBox();
    await tap(cdp, { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 });
    const bub = await page.locator('#bubble').boundingBox();
    if (bub && bub.width) await tap(cdp, { x: bub.x + bub.width / 2, y: bub.y + bub.height / 2 });
    await sleep(200);
    let e = await evs(page, n0);
    ok(!e.some(x => ['soft', 'wrong', 'right', 'ahead', 'squish', 'pokeNim'].includes(x.type)), 'HUD/bubble tap reached the world: ' + e.map(x => x.type).join(','));
    // pause by tap, the pause panel over a stone, resume re-says the question
    let s = await S(page);
    const stoneAt = await page.evaluate(i => DK.debug.stoneScreen(i), s.a);
    await tapEl(page, '#btnPause'); await sleep(250);
    ok((await S(page)).mode === 'paused' && await visible('scrPause'), 'pause button');
    n0 = await evN(page);
    // a tap on the dim area of the pause screen right over the right stone
    const pp = await page.locator('#scrPause .panel').boundingBox();
    const outside = (stoneAt.x < pp.x || stoneAt.x > pp.x + pp.width || stoneAt.y < pp.y || stoneAt.y > pp.y + pp.height);
    if (outside) await tap(cdp, stoneAt);
    await sleep(200);
    e = await evs(page, n0);
    ok(!e.some(x => ['right', 'wrong', 'hop', 'soft'].includes(x.type)), 'tap on the pause screen reached the world: ' + e.map(x => x.type).join(','));
    // volume − / +
    await tapEl(page, '#btnVolDown'); await tapEl(page, '#btnVolDown'); await sleep(150);
    let vol = await page.evaluate(() => ({ s: DK.debug.getState().settings.volume, lbl: document.getElementById('volLevel').textContent, st: JSON.parse(localStorage.getItem('nh:settings') || '{}').volume, a: DK.debug.audio().volume, u: DK.debug.audio().user && DK.debug.audio().user.gain.value, chain: !!(DK.debug.audio().master && DK.debug.audio().comp && DK.debug.audio().user) }));
    ok(Math.abs(vol.s - 0.8) < 1e-6 && vol.lbl === '80%' && Math.abs(vol.st - 0.8) < 1e-6 && Math.abs(vol.a - 0.8) < 1e-6, 'vol down ×2: ' + JSON.stringify(vol));
    ok(vol.chain, 'audio chain master→comp→user missing ' + JSON.stringify(vol));
    await tapEl(page, '#btnVolUp'); await sleep(150);
    vol = await page.evaluate(() => ({ s: DK.debug.getState().settings.volume, lbl: document.getElementById('volLevel').textContent }));
    ok(Math.abs(vol.s - 0.9) < 1e-6 && vol.lbl === '90%', 'vol up: ' + JSON.stringify(vol));
    for (let i = 0; i < 4; i++) await tapEl(page, '#btnVolUp');
    vol = await page.evaluate(() => DK.debug.getState().settings.volume); ok(vol === 1, 'vol clamps at 100%: ' + vol);
    const v0 = await vlN(page);
    await tapEl(page, '#btnResume'); await sleep(900);
    const rl = await vl(page, v0);
    const pText = await page.evaluate(() => window.__qa.saidPrompt());
    ok((await S(page)).mode === 'play' && rl.includes(pText), `resume re-says the question: ${JSON.stringify(rl)} want "${pText}"`);
    // visibilitychange → pause
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    ok((await S(page)).mode === 'paused', 'hidden page did not pause');
    await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    ok((await S(page)).mode === 'paused', 'page came back: should stay paused until Resume');
    await tapEl(page, '#btnResume'); await sleep(400);
    await waitReady(page);
    // multi-touch: finger 1 held on the water, finger 2 on a wrong stone, then on the right stone
    s = await S(page);
    const sp = await page.evaluate(() => window.__qa.softPoint());
    const wrongAt = s.others.length ? await page.evaluate(i => DK.debug.stoneScreen(i), s.others[0]) : null;
    const rightAt = await page.evaluate(i => DK.debug.stoneScreen(i), s.a);
    n0 = await evN(page);
    await tStart(cdp, [tp(sp.x, sp.y, 1)]); await sleep(80);
    if (wrongAt) { await tStart(cdp, [tp(sp.x, sp.y, 1), tp(wrongAt.x, wrongAt.y, 2)]); await sleep(80); await tEnd(cdp, [tp(sp.x, sp.y, 1)]); await sleep(50); }
    await tStart(cdp, [tp(sp.x, sp.y, 1), tp(rightAt.x, rightAt.y, 3)]); await sleep(80);
    await tEnd(cdp, [tp(sp.x, sp.y, 1)]); await sleep(80); await tEnd(cdp); await sleep(300);
    e = await evs(page, n0);
    ok(!e.some(x => x.type === 'wrong' || x.type === 'right' || x.type === 'hop'), 'second finger reached the world: ' + e.map(x => x.type).join(','));
    await sleep(400);
    // rotate mid-round with a finger held down
    s = await S(page);
    const fp = await page.evaluate(() => window.__qa.softPoint());
    await tStart(cdp, [tp(fp.x, fp.y)]); await sleep(60);
    await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width }); await sleep(700);
    let g = await page.evaluate(() => ({ g: !!DK.debug.world._g, li: window.__qa.layoutIssues(), out: (() => { const w = DK.debug.world, v = DK.debug.view(); return w.stones.filter(s => s.state === 'rest').map(s => DK.debug.toScreen(s.x, s.y)).filter(p => p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight).length; })() }));
    await tEnd(cdp); await sleep(200);
    ok(!g.g, 'rotation did not cancel the held gesture');
    ok(g.out === 0, `after rotation ${g.out} stones off screen`);
    await sleep(800);
    g = await page.evaluate(() => window.__qa.layoutIssues());
    if (g.length) note(dev, 'after mid-round rotation (layout squeezed until next round is allowed): ' + g.join('; '));
    await waitReady(page);
    s = await S(page);
    n0 = await evN(page);
    await tapStone(cdp, page, s.a);
    ok((await evs(page, n0)).some(x => x.type === 'right'), 'tap after rotation not judged right');
    // rotate mid-hop (back)
    await sleep(120);
    await page.setViewportSize(d.viewport); await sleep(250);
    await waitStand(page);
    const pos = await page.evaluate(i => { const w = DK.debug.world, st = w.stoneById(i), n = DK.debug.toScreen(w.nim.x, w.nim.y); return { dx: Math.abs(w.nim.x - st.x), S: w.layout.S, onRow: w.nim.onRow, row: st.row, nx: n.x, ny: n.y, W: innerWidth, H: innerHeight }; }, s.a);
    ok(pos.onRow === pos.row && pos.dx < pos.S / 2 && pos.nx > 0 && pos.ny > 0 && pos.nx < pos.W && pos.ny <= pos.H + 1, 'after rotate mid-hop Nim not on his stone/on screen: ' + JSON.stringify(pos));
    await page.screenshot({ path: path.join(OUT, dev + '-robust.png') });
  } catch (e) { fails.push('exception: ' + e.message); }
  for (const f of fails) rec(dev, G, 'check', false, f);
  rec(dev, G, `${passes} checks passed`, fails.length === 0);
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ group: 75 s rule */
async function gTimeRule(browser, url, dev) {
  const errors = []; const { ctx, page } = await newPage(browser, dev, errors);
  const G = 'time-rule';
  try {
    await gotoTitle(page, `${url}?mute=1&seed=4&age=4`);
    await page.evaluate(() => DK.debug.startGame());
    await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); });
    await page.waitForFunction(() => DK.debug.world.state === 'round' && DK.debug.world.round === 1 && DK.debug.world.phase === 'play', null, { timeout: 60000, polling: 'raf' });
    await page.evaluate(() => { DK.debug.world.levelStartTime -= 90; });
    await page.waitForFunction(() => DK.debug.mode === 'talk' || DK.debug.world.state === 'talk', null, { timeout: 60000, polling: 'raf' });
    const r = await page.evaluate(() => ({ round: DK.debug.world.round, rpl: DK.debug.world.roundsPerLevel, dots: document.querySelectorAll('#hudDots > *').length }));
    rec(dev, G, 'chapter > 75 s ends after 3 rounds', r.round === 3 && r.rpl === 3, JSON.stringify(r));
    await page.waitForFunction(() => DK.debug.world.level === 1 && DK.debug.world.state === 'round', null, { timeout: 60000, polling: 'raf' });
    const r2 = await page.evaluate(() => DK.debug.world.roundsPerLevel);
    rec(dev, G, 'next chapter back to 4 rounds', r2 === 4, 'rpl ' + r2);
  } catch (e) { rec(dev, G, 'exception', false, e.message); }
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ group: voice policy, colours / animals at a natural pace (fake synth) */
async function gVoice2(browser, url, dev, lang) {
  const errors = []; const { ctx, page, cdp } = await newPage(browser, dev, errors, { fakeSynth: true, ios: true });
  const G = 'voice2-' + lang;
  const fails = []; let passes = 0;
  const ok = (c, m) => { if (c) passes++; else fails.push(m); return c; };
  try {
    await gotoTitle(page, `${url}?seed=9&age=4&lang=${lang}`);
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => DK.debug.mode === 'play', null, { timeout: 8000 });
    const pokes = [];
    for (let r = 0; r < 4; r++) {
      await page.waitForFunction(READY, null, { timeout: 40000, polling: 'raf' });
      let s = await S(page);
      if (r === 0 && s.others.length) { await sleep(500); await tapStone(cdp, page, s.others[0]); await sleep(1500); }   // a wrong stone while the question is said
      for (let h = 0; h < 6; h++) {
        await page.waitForFunction(() => { const w = DK.debug.world, a = DK.debug.answer(); return (w.interactive && a && DK.debug.stoneScreen(a.id)) || w.row >= w.cur.k || w.phase !== 'play'; }, null, { timeout: 15000, polling: 'raf' });
        s = await S(page);
        if (!s.inter) break;
        await sleep(1200);
        await tapStone(cdp, page, s.a, 50);
      }
      // poke Nim on the bank (the question is over: never repeat it)
      await page.waitForFunction(() => DK.debug.world.phase === 'bank' || DK.debug.world.state === 'roundDone', null, { timeout: 15000, polling: 'raf' }).catch(() => {});
      await sleep(300);
      const nb = await page.evaluate(() => DK.debug.nimScreen());
      const i0 = await page.evaluate(() => window.__says.length);
      if (nb) await tap(cdp, { x: nb.cx, y: nb.cy }, 40);
      await sleep(300);
      pokes.push(await page.evaluate(([i0]) => ({ lines: window.__says.slice(i0).map(x => x.text), ask: window.__qa.saidPrompt(), ph: DK.debug.world.phase }), [i0]));
      await page.waitForFunction(r => (DK.debug.world.round > r && DK.debug.world.state === 'round') || DK.debug.world.state === 'talk', r, { timeout: 40000, polling: 'raf' });
      if ((await S(page)).state === 'talk') break;
    }
    const rep = pokes.filter(p => p.lines.includes(p.ask));
    ok(rep.length === 0, 'Nim poke on the bank repeated the finished question: ' + JSON.stringify(rep));
    // Talk: answer at once (while the question is still said)
    await page.waitForFunction(() => DK.debug.mode === 'talk' && document.querySelectorAll('#talkChoices button').length > 0, null, { timeout: 40000, polling: 'raf' });
    await sleep(700);
    const ans = await page.evaluate(() => String(DK.debug.world.talk.answer));
    await tapEl(page, `#talkChoices button[data-id="${ans}"]`);
    await sleep(6000);
    const sy = await page.evaluate(() => ({ says: window.__says.map(s => ({ text: s.text, res: s.res, pr: !!s.op.priority, int: !!s.op.interrupt, t: Math.round(s.t) })), synth: window.__synth, asks: window.__ev.filter(e => e.type === 'ask').length }));
    fs.writeFileSync(path.join(OUT, `voice2-${dev}-${lang}.json`), JSON.stringify(sy, null, 1));
    const norm = t => t.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').replace(/\s+/g, ' ').trim();
    const promptSet = new Set(sy.says.filter(x => x.pr && !/talk time|nói chuyện/i.test(x.text)).map(x => norm(x.text)));
    const cutPrompts = sy.synth.cut.filter(c => promptSet.has(norm(c.text)));
    ok(cutPrompts.length === 0, 'question cut while being said: ' + JSON.stringify(cutPrompts));
    if (sy.synth.cut.length) note(dev, `voice2 ${lang}: cut lines ${sy.synth.cut.map(c => `"${c.text}" ${c.el}/${c.dur} ms`).join(' ; ')}`);
    const nf = sy.says.filter(x => x.res && x.res !== 'end');
    if (nf.length) note(dev, `voice2 ${lang}: not fully spoken ${nf.map(x => `"${x.text}"→${x.res}`).join(' ; ')}`);
    const wrongSaid = sy.says.filter(x => /that’s|that's|this one|look, a|đây là|hòn này/i.test(x.text));
    const sticks = await page.evaluate(() => window.__ev.filter(e => e.type === 'stick').length);
    const fruitLines = sy.says.filter(x => /yum|got an? |nim has|ôi, |có quả|có hạt|có cây|rồi nè/i.test(x.text) && !/^(that|look, a)/i.test(x.text));
    ok(fruitLines.length >= Math.ceil(sticks / 2), `fruit praise (stick → sayFruit) said ${fruitLines.length}× for ${sticks} fruits: ${fruitLines.map(x => x.text).join(' | ')}`);
    ok(wrongSaid.length >= 1 && wrongSaid.every(x => x.res === 'end'), 'wrong line during the question: ' + JSON.stringify(wrongSaid));
  } catch (e) { fails.push('exception: ' + e.message); }
  for (const f of fails) rec(dev, G, 'check', false, f);
  rec(dev, G, `${passes} checks passed`, fails.length === 0);
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ group: assist after 6 no-progress presses → ≤ 2 stars; queued tap */
async function gAssist(browser, url, dev) {
  const errors = []; const { ctx, page, cdp } = await newPage(browser, dev, errors);
  const G = 'assist';
  try {
    await gotoTitle(page, `${url}?mute=1&seed=6&age=4`);
    await tapEl(page, '#btnPlay'); await page.waitForFunction(() => DK.debug.mode === 'play', null, { timeout: 8000 });
    await waitReady(page);
    // queued: tap the next row's right stone while Nim is in the air
    let s = await S(page);
    if (s.row < s.k - 1) {
      const nxt = await page.evaluate(r => { const w = DK.debug.world; const t = w.stones.find(st => st.row === r && st.target); return t && t.id; }, s.row + 1);
      const n2 = await evN(page);
      await tapStone(cdp, page, s.a, 30);
      await sleep(350);   // in the air (hop ≥ 0.42 s), ≤ 0.35 s before landing
      await tapStone(cdp, page, nxt, 30);
      await waitStand(page); await sleep(300); await waitStand(page);
      const e = await evs(page, n2);
      rec(dev, G, 'tap on the next row mid-hop is judged on landing (no miss)', e.filter(x => x.type === 'right').length === 2 && !e.some(x => x.type === 'wrong'), e.map(x => x.type + (x.id ? ':' + x.id : '')).join(','));
    }
    // finish round 0 by taps, then the assist test in round 1
    await waitStand(page);
    for (let h = 0; h < 4; h++) { s = await S(page); if (!(s.state === 'round' && s.phase === 'play' && s.row < s.k && s.inter)) break; await tapStone(cdp, page, s.a); await waitStand(page); }
    await speed(page, 4); await page.waitForFunction(() => DK.debug.world.round === 1, null, { timeout: 30000, polling: 'raf' });
    await waitReady(page);
    const sp = await page.evaluate(() => window.__qa.softPoint());
    const n0 = await evN(page);
    const nAssist = await page.evaluate(() => DK.CONFIG.assistAfter);   // 5 since fix round 1 (was 6)
    for (let i = 0; i < nAssist; i++) { await tap(cdp, sp, 40); await sleep(250); }
    let e = await evs(page, n0);
    const armed = e.some(x => x.type === 'assistArmed'), hint = e.some(x => x.type === 'hint');
    rec(dev, G, '3 soft → hint, assistAfter soft → assist armed, no misses', armed && hint && (await S(page)).misses === 0, e.map(x => x.type).join(','));
    const n1 = await evN(page);
    await tap(cdp, sp, 40); await sleep(300);
    e = await evs(page, n1);
    rec(dev, G, 'armed assist: a river press picks the target', e.some(x => x.type === 'assist') && e.some(x => x.type === 'right'), e.map(x => x.type).join(','));
    await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(6); });
    await page.waitForFunction(() => window.__ev.some(e => e.type === 'roundDone' && e.round === 1), null, { timeout: 30000, polling: 'raf' });
    const rd = await page.evaluate(() => window.__ev.find(e => e.type === 'roundDone' && e.round === 1));
    rec(dev, G, 'assisted round ≤ 2★', rd.stars <= 2 && rd.assisted, JSON.stringify({ stars: rd.stars, assisted: rd.assisted, misses: rd.misses }));
  } catch (e) { rec(dev, G, 'exception', false, e.message); }
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ group: bot sessions ages 3–7 × EN/VI to the done screen */
async function gBot(browser, url, dev, age, lang) {
  const errors = []; const { ctx, page } = await newPage(browser, dev, errors);
  const G = `bot-a${age}-${lang}`;
  try {
    await gotoTitle(page, `${url}?mute=1&seed=${30 + age}&age=${age}&lang=${lang}`);
    await tapEl(page, '#btnPlay');
    await page.waitForFunction(() => DK.debug.mode === 'play', null, { timeout: 8000 });
    await page.evaluate(() => { DK.debug.setBot(true, 0.75); DK.debug.setSpeed(10);
      window.__samp = []; setInterval(() => { const w = DK.debug.world; if (DK.debug.mode === 'play' && w.state === 'round' && w.phase === 'play' && w.stones.every(s => s.state !== 'rise')) { const li = window.__qa.layoutIssues().filter(x => !/Nim feet/.test(x)); if (li.length) window.__samp.push(w.topic + ' r' + w.round + ' "' + document.getElementById('bubbleText').textContent + '": ' + li.join('; ')); } }, 300); });
    // the bot cannot pick Talk buttons by DOM: does it answer Talk? (it should via world.talkAnswer)
    await page.waitForFunction(() => DK.debug.mode === 'done', null, { timeout: 240000, polling: 1000 });
    await page.evaluate(() => DK.debug.setSpeed(1)); await sleep(500);
    const r = await page.evaluate(() => ({ ev: (window.__ev.filter(e => e.type === 'sessionDone').pop() || {}).stars, done: +document.getElementById('doneStars').textContent, w: DK.debug.world.stars,
      rd: window.__ev.filter(e => e.type === 'roundDone').reduce((a, e) => a + e.stars, 0), tr: window.__ev.filter(e => e.type === 'talkResult' && e.correct).length,
      levels: DK.debug.world.levels.slice(), lay: window.__layout || [], samp: window.__samp || [], inv: window.__invalid || [], log: DK.debug.voiceLog.map(l => l.text) }));
    rec(dev, G, `sessionDone stars == done screen == world (${r.ev})`, r.ev === r.done && r.done === r.w && r.w === r.rd + r.tr, JSON.stringify({ ev: r.ev, done: r.done, w: r.w, rounds: r.rd, talks: r.tr }));
    rec(dev, G, `topics ${r.levels.join(',')} valid rounds`, r.inv.length === 0, r.inv.join('; '));
    rec(dev, G, 'no stone overlaps HUD/bubble/safe edge at any ask', r.lay.length === 0, r.lay.slice(0, 4).map(x => x.topic + ' r' + x.round + ': ' + x.li.join('; ')).join(' || '));
    rec(dev, G, 'no stone overlaps the DOM bubble/HUD while playing (sampled, incl. wrong lines)', r.samp.length === 0, [...new Set(r.samp)].slice(0, 4).join(' || '));
    const ban = r.log.filter(l => BANNED.test(l)), raw = r.log.filter(l => RAW.test(l));
    rec(dev, G, 'voiceLog: no banned / raw text', !ban.length && !raw.length, [...ban, ...raw].slice(0, 5).join(' | '));
    if (lang === 'vi') { const en = r.log.filter(l => !VI_CHARS.test(l) && /[a-z]{3,}/i.test(l) && !/^(nim|hai|ba)!?$/i.test(l.trim())); rec(dev, G, 'voiceLog VI lines are Vietnamese', en.length === 0, [...new Set(en)].slice(0, 6).join(' | ')); }
    else { const vi = r.log.filter(l => VI_CHARS.test(l)); rec(dev, G, 'voiceLog EN lines are English', vi.length === 0, vi.slice(0, 4).join(' | ')); }
    await page.evaluate(() => DK.debug.setBot(false));
    await tapEl(page, '#btnAgain');
    await page.waitForFunction(() => DK.debug.mode === 'play' && DK.debug.world.state !== 'sessionDone' && DK.debug.world.stars === 0, null, { timeout: 8000 });
    await page.waitForFunction(() => DK.debug.world.state === 'round', null, { timeout: 15000 });
    rec(dev, G, 'Play again starts a fresh session', true);
  } catch (e) { rec(dev, G, 'exception', false, e.message); }
  rec(dev, G, 'zero console/page errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

/* ------------------------------------------------------------ main */
async function pool(jobs, n) { const q = jobs.slice(); await Promise.all(Array.from({ length: n }, async () => { while (q.length) { const j = q.shift(); await j(); } })); }
(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const url = srv.url;
  const want = (process.env.QA_GROUPS || 'boot,settings,chapters,voice,voice2,robust,time,assist,bot').split(',');
  const devs = process.env.DEV ? process.env.DEV.split(',') : Object.keys(DEVS);
  const jobs = [];
  if (want.includes('boot')) devs.forEach(d => jobs.push(() => gBoot(browser, url, d)));
  if (want.includes('settings')) ['iphone-p', 'ipad-l'].filter(d => devs.includes(d)).forEach(d => jobs.push(() => gSettings(browser, url, d)));
  if (want.includes('chapters')) devs.forEach((d, i) => jobs.push(() => gChapters(browser, url, d, { lang: i === 1 || i === 4 ? 'vi' : 'en', seed: 11 + i })));
  if (want.includes('voice')) { jobs.push(() => gVoice(browser, url, 'iphone-p', 'en')); jobs.push(() => gVoice(browser, url, 'ipad-l', 'vi')); }
  if (want.includes('robust')) devs.forEach(d => jobs.push(() => gRobust(browser, url, d)));
  if (want.includes('voice2')) { jobs.push(() => gVoice2(browser, url, 'iphone-l', 'en')); jobs.push(() => gVoice2(browser, url, 'ipad-p', 'vi')); }
  if (want.includes('assist')) ['iphone-p', 'ipad-l'].forEach(d => jobs.push(() => gAssist(browser, url, d)));
  if (want.includes('time')) jobs.push(() => gTimeRule(browser, url, 'ipad-l'));
  if (want.includes('bot')) { const dl = Object.keys(DEVS); let i = 0; for (const age of [3, 4, 5, 6, 7]) for (const lang of ['en', 'vi']) { const d = dl[i++ % dl.length]; jobs.push(() => gBot(browser, url, d, age, lang)); } }
  await pool(jobs, +process.env.PAR || 3);
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ results, findings }, null, 1));
  const pass = results.filter(r => r.ok).length, fail = results.length - pass;
  console.log(`\n${pass} PASS, ${fail} FAIL`);
  findings.forEach(f => console.log('NOTE ' + f));
  process.exit(fail ? 1 : 0);
})();
