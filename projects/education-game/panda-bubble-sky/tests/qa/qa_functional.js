// Independent functional QA (report-only) for Bao's Bubble Sky — real CDP touches in isMobile/hasTouch contexts and a FAKE
// speechSynthesis that "speaks" each utterance for a realistic time (300 ms + 75 ms/char) so cut-off lines can be measured.
//   node tests/qa/qa_functional.js dev <ip|ipl|pad|padl> <test,test|all>
//   node tests/qa/qa_functional.js bot <age> <en|vi> [speed]          (full bot session + Play again)
//   node tests/qa/qa_functional.js live <age> <en|vi> <seconds> [skill]  (real-time bot play with the fake voice: cut lines)
// Appends one JSON line per test to tests/qa/out/results.jsonl, screenshots to tests/qa/out/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, 'out'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  ip: { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  ipl: { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  pad: { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  padl: { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const VI_CHARS = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const RAW = /\{|\}|undefined|NaN|\bnull\b|\[object|\b(ui|p|talk|topic|weather|right|wrong|surprise|bird|kite|snow|count|name|idle|session|goal)\.[a-z0-9]/i;
const NEG = /\b(no|nope|wrong|incorrect|bad|fail|mistake|oops|sorry|don't|don’t|not)\b|sai rồi|không đúng|chưa đúng|không phải/i;
class Fail extends Error {}
const check = (c, m) => { if (!c) throw new Fail(m); };
const results = [];
function record(device, test, ok, detail, data) {
  const r = { device, test, ok, detail: detail || '', data: data || null, at: new Date().toISOString() };
  results.push(r); fs.appendFileSync(path.join(OUT, 'results.jsonl'), JSON.stringify(r) + '\n');
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${device.padEnd(16)} ${test}${detail ? '  — ' + detail : ''}`);
}

/* ---------- init script: fake speech engine + event tap ---------- */
const INIT = () => {
  window.__utt = []; window.__cancels = []; window.__ev = []; window.__frames = [];
  const VOICES = [{ name: 'Samantha', lang: 'en-US', localService: true, default: true, voiceURI: 'Samantha' },
    { name: 'Linh', lang: 'vi-VN', localService: true, default: false, voiceURI: 'Linh' }];
  class Utt { constructor(t) { this.text = t; this.lang = ''; this.voice = null; this.rate = 1; this.pitch = 1; this.volume = 1; } }
  const S = {
    speaking: false, paused: false, pending: false, _q: [], _cur: null, onvoiceschanged: null,
    getVoices() { return VOICES; }, addEventListener() {}, removeEventListener() {},
    speak(u) { this._q.push(u); this._next(); },
    _next() {
      if (this._cur || !this._q.length) return;
      const u = this._q.shift(); this._cur = u; this.speaking = true;
      const rec = { text: u.text, lang: u.lang, voice: u.voice && u.voice.name, vol: u.volume, t0: performance.now(), dur: 300 + 75 * u.text.length / (u.rate || 1), wt: window.PB && PB.debug && PB.debug.world ? PB.debug.world.time : 0 };
      if (u.text.trim()) window.__utt.push(rec);
      u.__rec = rec;
      setTimeout(() => { if (this._cur === u && u.onstart) u.onstart({}); }, 15);
      u.__tm = setTimeout(() => { if (this._cur !== u) return; rec.end = 'end'; rec.t1 = performance.now(); this._cur = null; this.speaking = false; if (u.onend) u.onend({}); this._next(); }, rec.dur);
    },
    cancel() {
      const last = window.__ev.length ? window.__ev[window.__ev.length - 1] : null;
      window.__cancels.push({ t: performance.now(), lastEv: last && last.type, stack: (new Error().stack || '').split('\n').slice(2, 5).join(' < ') });
      const q = this._q; this._q = []; const c = this._cur; this._cur = null; this.speaking = false;
      if (c) { clearTimeout(c.__tm); c.__rec.end = 'interrupted'; c.__rec.t1 = performance.now(); c.__rec.cutBy = last && last.type; c.__rec.cutStack = window.__cancels[window.__cancels.length - 1].stack; if (c.onerror) c.onerror({ error: 'interrupted' }); }
      for (const u of q) if (u.onerror) u.onerror({ error: 'canceled' });
    },
    pause() { this.paused = true; }, resume() { this.paused = false; }
  };
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, get: () => S });
  window.SpeechSynthesisUtterance = Utt;
  let last = 0;
  const fr = ts => { if (last) window.__frames.push(ts - last); last = ts; if (window.__frames.length > 4000) window.__frames.splice(0, 2000); requestAnimationFrame(fr); };
  requestAnimationFrame(fr);
  window.__qa = {
    hook() {
      const w = PB.debug.world; if (!w || w.__qa) return;
      const o = w._emit; w.__qa = true;
      w._emit = function (e) { window.__ev.push(Object.assign({ _t: w.time }, e)); return o.call(this, e); };
    },
    toL(x, y) { const v = PB.debug.view(); return { x: (x - v.left) / v.s, y: (y - v.top) / v.s }; },
    softPoint() {
      const w = PB.debug.world, L = w.layout, out = [];
      const inBox = (b, x, y, p) => x >= b.x - p && x <= b.x + b.w + p && y >= b.y - p && y <= b.y + b.h + p;
      for (let gx = 0.05; gx < 0.96; gx += 0.03) for (let gy = 0.1; gy < 0.94; gy += 0.03) {
        const cx = innerWidth * gx, cy = innerHeight * gy, p = this.toL(cx, cy);
        if (p.x < 30 || p.y < 30 || p.x > L.W - 30 || p.y > L.groundY - 20) continue;
        const el = document.elementFromPoint(cx, cy); if (!el || el.id !== 'game') continue;
        if (inBox(L.bao.box, p.x, p.y, 30)) continue;
        if (w.bubbles.some(b => b.state !== 'gone' && Math.hypot(p.x - b.x, p.y - b.y) < L.hitR + 60)) continue;
        if (w._birdAt(p.x, p.y) || w._kiteAt(p.x, p.y) || w._snowAt(p.x, p.y)) continue;
        out.push({ x: Math.round(cx), y: Math.round(cy) });
      }
      return out.length ? out[Math.floor(out.length / 2)] : null;
    },
    badBubbles() {
      const w = PB.debug.world, v = PB.debug.view(), bad = [];
      for (const b of w.bubbles) {
        for (const k of ['x', 'y', 'r', 'vx', 'vy', 'wob', 'rot', 'hx', 'hy']) if (b[k] !== undefined && !Number.isFinite(b[k])) bad.push(`${b.id}.${k}=${b[k]}`);
        if (b.state !== 'float') continue;
        const p = PB.debug.toScreen(b.x, b.y), r = b.r * v.s;
        if (p.x - r < -1 || p.y - r < -1 || p.x + r > innerWidth + 1 || p.y + r > innerHeight + 1) bad.push(`${b.id} off screen at ${Math.round(p.x)},${Math.round(p.y)} r${Math.round(r)}`);
      }
      return bad;
    }
  };
};

/* ---------- helpers ---------- */
const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
const tS = (cdp, pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
const tM = (cdp, pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts });
const tE = (cdp, pts = []) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts });
async function tap(cdp, page, p, hold = 80) { await tS(cdp, [tp(p.x, p.y)]); await page.waitForTimeout(hold); await tE(cdp); }
async function tapBubble(cdp, page, id, hold = 70) { const at = await page.evaluate(i => PB.debug.bubbleScreen(i), id); check(at, 'bubble ' + id + ' not floating'); await tap(cdp, page, at, hold); return at; }
async function tapEl(page, sel) {
  let b = null;
  for (let k = 0; k < 12; k++) { const b1 = await page.locator(sel).first().boundingBox(); await page.waitForTimeout(80); b = await page.locator(sel).first().boundingBox(); if (b1 && b && Math.abs(b1.x - b.x) < .5 && Math.abs(b1.y - b.y) < .5) break; }
  check(b, 'not visible: ' + sel); await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2); return b;
}
const evLen = p => p.evaluate(() => window.__ev.length);
const evSince = (p, n) => p.evaluate(n => window.__ev.slice(n).map(e => { const c = {}; for (const k in e) { const v = e[k]; if (v === null || typeof v !== 'object') c[k] = v; } return c; }), n);
const waitEv = (p, n, t, to = 15000) => p.waitForFunction(([n, t]) => window.__ev.slice(n).some(e => e.type === t), [n, t], { timeout: to, polling: 'raf' });
const types = evs => evs.map(e => e.type).join(',');
const logLen = p => p.evaluate(() => PB.debug.voiceLog.length);
const logSince = (p, n) => p.evaluate(n => PB.debug.voiceLog.slice(n).map(x => ({ lang: x.lang, text: x.text })), n);
const uttSince = (p, n) => p.evaluate(n => window.__utt.slice(n), n);
const visible = (p, id) => p.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);
async function newPage(browser, d, errors) {
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  page.on('pageerror', e => errors.push('pageerror: ' + String(e)));
  page.on('requestfailed', r => errors.push('requestfailed: ' + r.url()));
  page.on('response', r => { if (r.status() >= 400) errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp };
}
async function gotoTitle(page, url) {
  await page.goto(url);
  await page.waitForFunction(() => window.PB && PB.debug && PB.debug.mode === 'title' && PB.debug.world, null, { timeout: 20000 });
  await page.evaluate(() => window.__qa.hook());
  await page.waitForTimeout(200);
}
const READY = () => { const w = PB.debug.world, a = PB.debug.answer(); return w.interactive && a && a.bubble != null && w.bubbles.every(b => b.state !== 'grow' && b.state !== 'wait') && w.phaseTime > 1.2; };
async function waitAsk(page, to = 25000) { await page.evaluate(() => PB.debug.setSpeed(4)); await page.waitForFunction(READY, null, { timeout: to, polling: 'raf' }); await page.evaluate(() => PB.debug.setSpeed(1)); await page.waitForTimeout(200); }
/** start a chapter of `topic` via the real Play button (unlock gesture), voice ON (fake engine) */
async function setupRound(page, cdp, url, { topic = 'colors', age = 4, seed = 3, lang = 'en', level = 0, prep = null } = {}) {
  await gotoTitle(page, `${url}?seed=${seed}&age=${age}&lang=${lang}`);
  await tapEl(page, '#btnPlay');
  await page.waitForFunction(() => PB.debug.mode === 'play');
  await page.evaluate(([t, lv, prep]) => { const w = PB.debug.world; w.levels[lv] = t; w.startLevel(lv); if (prep) (new Function('w', prep))(w); }, [topic, level, prep]);
  await waitAsk(page);
}
async function info(page) {
  return page.evaluate(() => {
    const w = PB.debug.world, a = PB.debug.answer(), tg = PB.debug.targets();
    return { a: a.bubble, targets: tg, others: w.bubbles.filter(b => b.state === 'float' && !tg.includes(b.id)).map(b => b.id), misses: w.misses, k: w.cur.k, mode: w.cur.mode };
  });
}
async function botToNextRound(page) {
  const r0 = await page.evaluate(() => PB.debug.world.round);
  await page.evaluate(() => { PB.debug.setBot(true, 1); PB.debug.setSpeed(6); });
  await page.waitForFunction(r => { const w = PB.debug.world; return w.state === 'round' && w.round !== r && w.phase === 'blow'; }, r0, { timeout: 60000, polling: 'raf' });
  await page.evaluate(() => PB.debug.setBot(false));
  await waitAsk(page);
}
const shot = (page, d, n) => page.screenshot({ path: path.join(OUT, `${d.name}-${n}.png`) }).catch(() => {});
const langOk = (lines, lang) => lines.filter(l => l.lang !== lang || (lang === 'en' ? VI_CHARS.test(l.text) : false));

/* ---------- tests ---------- */
const T = {};
T.boot = async ({ page, url, d }) => {
  await gotoTitle(page, url + '?seed=3&lang=en');
  await page.waitForTimeout(600);
  await shot(page, d, 'title');
  const s = await page.evaluate(() => ({ title: document.title, logo: logo1.textContent + ' ' + logo2.textContent, play: btnPlay.getBoundingClientRect().toJSON(), gear: btnParents.getBoundingClientRect().toJSON(), missing: PB.Assets.missing.slice(), loading: !document.getElementById('loading').classList.contains('hidden') }));
  check(/Bao/.test(s.title) && /Bubble Sky/.test(s.logo), 'title: ' + JSON.stringify(s));
  check(s.play.width >= 60 && s.play.height >= 60 && s.play.right <= innerW(d) && s.play.bottom <= d.viewport.height, 'play button: ' + JSON.stringify(s.play));
  check(s.gear.width >= 44 && s.gear.top >= 0 && s.gear.right <= d.viewport.width, 'gear: ' + JSON.stringify(s.gear));
  check(!s.missing.length && !s.loading, 'assets / loading: ' + JSON.stringify(s));
};
const innerW = d => d.viewport.width;

T.right = async ({ page, cdp, url, d }) => {
  await setupRound(page, cdp, url, { seed: 21 });
  const i = await info(page);
  const n0 = await evLen(page), L0 = await logLen(page);
  await tapBubble(cdp, page, i.a);
  await page.waitForTimeout(200);
  await shot(page, d, 'right');
  await waitEv(page, n0, 'paint', 8000);
  const evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right' && e.id === i.a) && evs.some(e => e.type === 'pop' && e.id === i.a) && evs.some(e => e.type === 'paint'), 'events: ' + types(evs));
  check(!evs.some(e => e.type === 'wrong' || e.type === 'soft'), 'extra events: ' + types(evs));
  const lines = await logSince(page, L0);
  const col = await page.evaluate(id => PB.I18N.name('en', 'color', PB.debug.world.bubbleById(id).thing.color), i.a);
  check(lines.some(l => l.text.toLowerCase().includes(col)), `right line does not name ${col}: ` + JSON.stringify(lines));
  check(await page.evaluate(() => PB.debug.world.misses) === 0, 'miss counted on a right tap');
};
T.wrong = async ({ page, cdp, url, d }) => {
  await setupRound(page, cdp, url, { seed: 22 });
  const i = await info(page);
  check(i.others.length >= 2, 'need 2 others');
  const n0 = await evLen(page), L0 = await logLen(page);
  // real speed 1: two taps on the same wrong bubble 0.5 s apart
  await tapBubble(cdp, page, i.others[0]);
  await page.waitForTimeout(150);
  const b1 = await page.evaluate(id => { const b = PB.debug.world.bubbleById(id); return { st: b.state, wob: b.wob, wig: b.wig, vx: b.vx, vy: b.vy }; }, i.others[0]);
  await page.waitForTimeout(350);
  await tapBubble(cdp, page, i.others[0]);
  await page.waitForTimeout(250);
  let evs = await evSince(page, n0);
  const s1 = await page.evaluate(() => ({ m: PB.debug.world.misses, hint: !!PB.debug.world.hintHand }));
  check(evs.filter(e => e.type === 'wrong').length === 1 && evs.some(e => e.type === 'squish' && e.repeat), 'same bubble twice in <1 s: ' + types(evs));
  check(s1.m === 1, 'misses after same-bubble repeat: ' + s1.m);
  check(!evs.some(e => e.type === 'pop' || e.type === 'right'), 'wrong bubble popped');
  check(b1.st === 'float' && (Math.abs(b1.wob) > 0.02 || Math.abs(b1.wig) > 0.02), 'no squish / wiggle visible: ' + JSON.stringify(b1));
  await shot(page, d, 'wrong');
  const lines = await logSince(page, L0);
  check(lines.length >= 1, 'no kind words line');
  check(lines.every(l => !NEG.test(l.text)), 'negative words: ' + JSON.stringify(lines));
  const th = await page.evaluate(id => PB.I18N.name('en', 'color', PB.debug.world.bubbleById(id).thing.color), i.others[0]);
  check(lines.some(l => l.text.toLowerCase().includes(th)), 'wrong line does not name the tapped thing (' + th + '): ' + JSON.stringify(lines));
  // after the 1 s window the same bubble IS a new miss → 2 misses → hint glows on a target
  await page.waitForTimeout(800);
  const n1 = await evLen(page);
  await tapBubble(cdp, page, i.others[1]);
  await page.waitForTimeout(500);
  evs = await evSince(page, n1);
  const s2 = await page.evaluate(() => { const w = PB.debug.world; return { m: w.misses, hand: !!w.hintHand, glow: w.bubbles.filter(b => b.glow > 0.2).map(b => b.id), tg: PB.debug.targets() }; });
  check(s2.m === 2, 'second miss not counted: ' + JSON.stringify(s2));
  const h = evs.find(e => e.type === 'hint');
  check(h && s2.tg.includes(h.id) && s2.hand && s2.glow.length && s2.glow.every(g => s2.tg.includes(g)), 'hint after 2 misses: ' + types(evs) + ' ' + JSON.stringify(s2));
  await shot(page, d, 'hint');
};
T.soft = async ({ page, cdp, url }) => {
  await setupRound(page, cdp, url, { seed: 23 });
  const p = await page.evaluate(() => window.__qa.softPoint());
  check(p, 'no empty point');
  const n0 = await evLen(page), L0 = await logLen(page);
  await tap(cdp, page, p); await page.waitForTimeout(300);
  const evs = await evSince(page, n0);
  const s = await page.evaluate(() => ({ m: PB.debug.world.misses, minis: PB.debug.world.minis.length }));
  check(evs[0] && evs[0].type === 'soft' && !evs.some(e => e.type === 'wrong' || e.type === 'right'), 'empty tap: ' + types(evs));
  check(s.m === 0 && s.minis > 0, 'after soft: ' + JSON.stringify(s));
  const lines = await logSince(page, L0);
  check(lines.length === 0, 'a soft tap spoke: ' + JSON.stringify(lines));
};
T.poke_during_count = async ({ page, cdp, url }) => {
  // countPop: pop one, then (the child wants to hear the question again) tap Bao / the speech bubble while "One!" is said
  const out = {};
  for (const via of (process.env.VIA || 'bao,bubble').split(',')) {
    await setupRound(page, cdp, url, { topic: 'count', age: 5, seed: 8 });
    const i = await info(page);
    check(i.mode === 'countPop' && i.k >= 2, 'not countPop');
    await page.waitForTimeout(3300);   // > 3 s after the prompt (Bao repeats only then)
    // let the prompt finish so nothing else is speaking
    await page.waitForFunction(() => !speechSynthesis.speaking, null, { timeout: 15000 });
    const U0 = await page.evaluate(() => window.__utt.length);
    const tg = await page.evaluate(() => PB.debug.targets());
    await tapBubble(cdp, page, tg[0], 50);
    await page.waitForTimeout(200);
    if (via === 'bao') { const k = await page.evaluate(() => PB.debug.baoScreen()); await tap(cdp, page, { x: k.cx, y: k.cy }, 70); }
    else await tapEl(page, '#bubble');
    await page.waitForTimeout(2500);
    const utt = await uttSince(page, U0);
    out[via] = utt.map(u => u.text + ' [' + u.end + ']');
    const one = utt.find(u => /^one\b/i.test(u.text));
    check(one && one.end === 'end', `${via} tap during the count cut "One!": ` + JSON.stringify(out[via]));
  }
  return out;
};
T.countpop = async ({ page, cdp, url, d }) => {
  await setupRound(page, cdp, url, { topic: 'count', age: 5, seed: 8 });
  const i = await info(page);
  check(i.mode === 'countPop' && i.k >= 2, 'not countPop: ' + JSON.stringify(i));
  const n0 = await evLen(page), U0 = await page.evaluate(() => window.__utt.length);
  // a quick child: pops all k within ~1 s — every count must still be said in full, in order
  for (let c = 0; c < i.k; c++) { const tg = await page.evaluate(() => PB.debug.targets()); await tapBubble(cdp, page, tg[0], 50); await page.waitForTimeout(120); }
  await waitEv(page, n0, 'roundDone', 12000);
  await page.waitForTimeout(500 + 1100 * i.k);
  const evs = await evSince(page, n0);
  const rights = evs.filter(e => e.type === 'right');
  check(rights.length === i.k && rights.every((e, k) => e.count === k + 1), 'counts: ' + rights.map(e => e.count));
  const utt = await uttSince(page, U0);
  const countUtt = utt.filter(u => /^(one|two|three|four|five|six|seven|eight|nine)\b/i.test(u.text));
  check(countUtt.length >= i.k, `count lines spoken ${countUtt.length}/${i.k}: ` + JSON.stringify(utt.map(u => u.text + '[' + u.end + ']')));
  check(countUtt.every(u => u.end === 'end'), 'a count line was cut: ' + JSON.stringify(countUtt.map(u => u.text + '[' + u.end + ' by ' + u.cutBy + ']')));
  check(countUtt.some(u => /bubbles/i.test(u.text)), 'no final "N bubbles!" run');
};
T.countsel = async ({ page, cdp, url }) => {
  await setupRound(page, cdp, url, { topic: 'count', age: 4, seed: 8 });
  await botToNextRound(page);
  const i = await info(page);
  check(i.mode === 'countSel', 'round 1 mode ' + i.mode);
  const n = await page.evaluate(id => PB.debug.world.bubbleById(id).thing.n, i.a);
  const n0 = await evLen(page), U0 = await page.evaluate(() => window.__utt.length);
  await tapBubble(cdp, page, i.a);
  await waitEv(page, n0, 'paint', 12000);
  await page.waitForTimeout(400 + 400 * n);
  const evs = await evSince(page, n0);
  const counts = evs.filter(e => e.type === 'count');
  check(counts.length === n, `count events ${counts.length} for ${n} stars`);
  const utt = await uttSince(page, U0);
  const run = utt.find(u => /stars?!/i.test(u.text));
  check(run && run.end === 'end', 'count run missing / cut: ' + JSON.stringify(utt.map(u => u.text + '[' + u.end + ' by ' + u.cutBy + ']')));
};
T.talk = async ({ page, cdp, url, d }) => {
  for (const want of ['wrong', 'right']) {
    await setupRound(page, cdp, url, { topic: 'colors', age: 4, seed: want === 'wrong' ? 31 : 32 });
    await page.evaluate(() => { PB.debug.setBot(true, 1); PB.debug.setSpeed(8); });
    await page.waitForFunction(() => PB.debug.world.state === 'talk', null, { timeout: 110000, polling: 'raf' });
    await page.evaluate(() => { PB.debug.setBot(false); PB.debug.setSpeed(1); });
    await page.waitForTimeout(600);
    const t = await page.evaluate(() => ({ ans: PB.debug.world.talk.answer, ids: [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id), done: PB.debug.world.talkAnswered, stars: PB.debug.world.stars, q: talkQ.textContent }));
    check(!t.done && t.ids.length >= 2, 'talk not open: ' + JSON.stringify(t));
    check(!RAW.test(t.q), 'talk question: ' + t.q);
    await shot(page, d, 'talk-' + want);
    const pick = want === 'right' ? t.ans : t.ids.find(x => x !== String(t.ans));
    const n0 = await evLen(page), L0 = await logLen(page);
    // a wrong-pick canvas press must not happen: tap the DOM button with a real touch
    await tapEl(page, `#talkChoices button[data-id="${pick}"]`);
    await page.waitForTimeout(400);
    const evs = await evSince(page, n0);
    const r = evs.find(e => e.type === 'talkResult');
    check(r && r.correct === (want === 'right'), `talk ${want}: ` + types(evs));
    check(!evs.some(e => e.type === 'soft'), 'talk tap reached the canvas');
    const lines = await logSince(page, L0);
    check(lines.length && lines.every(l => !NEG.test(l.text) && !RAW.test(l.text)), 'talk lines: ' + JSON.stringify(lines));
    const s = await page.evaluate(() => ({ stars: PB.debug.world.stars, right: document.querySelector('#talkChoices .right') ? 1 : 0 }));
    check(s.right === 1, 'right answer not marked');
    check(want === 'right' ? s.stars === t.stars + 1 : s.stars === t.stars, `stars after talk ${want}: ${t.stars} → ${s.stars}`);
    // a second tap after answering must not count twice
    const n1 = await evLen(page);
    await tapEl(page, `#talkChoices button[data-id="${t.ans}"]`).catch(() => {});
    await page.waitForTimeout(200);
    check(!(await evSince(page, n1)).some(e => e.type === 'talkResult'), 'a second talk tap counted');
    await page.waitForFunction(() => PB.debug.mode === 'play' && PB.debug.world.state !== 'talk', null, { timeout: 20000 });
  }
};
T.multitouch = async ({ page, cdp, url }) => {
  await setupRound(page, cdp, url, { seed: 24, age: 4 });
  const i = await info(page);
  // A: two fingers land at the same moment on a wrong bubble and a target → only the first is judged
  const a = await page.evaluate(id => PB.debug.bubbleScreen(id), i.others[0]);
  const b = await page.evaluate(id => PB.debug.bubbleScreen(id), i.a);
  let n0 = await evLen(page);
  await tS(cdp, [tp(a.x, a.y, 1), tp(b.x, b.y, 2)]); await page.waitForTimeout(80); await tE(cdp);
  await page.waitForTimeout(300);
  let evs = await evSince(page, n0);
  check(evs.filter(e => e.type === 'wrong' || e.type === 'right').length === 1 && evs.some(e => e.type === 'wrong'), 'two simultaneous fingers: ' + types(evs));
  // B: palm resting on the sky, another finger taps a target → ignored; C: lift the palm, tap → works
  await page.waitForTimeout(1200);
  const p = await page.evaluate(() => window.__qa.softPoint());
  await tS(cdp, [tp(p.x, p.y, 1)]); await page.waitForTimeout(200);
  n0 = await evLen(page);
  const b2 = await page.evaluate(id => PB.debug.bubbleScreen(id), i.a);
  await tS(cdp, [tp(p.x, p.y, 1), tp(b2.x, b2.y, 2)]); await page.waitForTimeout(80);
  await tE(cdp, [tp(p.x, p.y, 1)]); await page.waitForTimeout(80); await tE(cdp);
  await page.waitForTimeout(300);
  evs = await evSince(page, n0);
  check(!evs.some(e => e.type === 'right' || e.type === 'wrong'), 'second finger judged: ' + types(evs));
  n0 = await evLen(page);
  await tapBubble(cdp, page, i.a);
  await page.waitForTimeout(300);
  evs = await evSince(page, n0);
  check(evs.some(e => e.type === 'right'), 'tap after multi-touch did not work: ' + types(evs));
};
T.domtaps = async ({ page, cdp, url }) => {
  await setupRound(page, cdp, url, { seed: 25 });
  // the speech bubble, the HUD stars and the dots never reach the canvas
  for (const sel of ['#bubble', '#hudStars', '#hudDots']) {
    const n0 = await evLen(page);
    const bb = await page.locator(sel).boundingBox();
    if (!bb) continue;
    await tap(cdp, page, { x: bb.x + bb.width / 2, y: bb.y + bb.height / 2 });
    await page.waitForTimeout(250);
    const evs = await evSince(page, n0);
    check(!evs.some(e => ['soft', 'wrong', 'right', 'squish'].includes(e.type)), sel + ' tap reached the canvas: ' + types(evs));
  }
  // the pause button: pauses, no canvas event; resume: the canvas press right after it is not judged
  const n0 = await evLen(page);
  const pb = await tapEl(page, '#btnPause');
  await page.waitForTimeout(250);
  check(await page.evaluate(() => PB.debug.mode) === 'paused', 'pause button did not pause');
  check(!(await evSince(page, n0)).some(e => ['soft', 'wrong', 'right'].includes(e.type)), 'pause tap reached the canvas');
  const t0 = await page.evaluate(() => PB.debug.world.time);
  await page.waitForTimeout(600);
  check(await page.evaluate(() => PB.debug.world.time) === t0, 'world ran while paused');
  const L0 = await logLen(page);
  await tapEl(page, '#btnResume');
  await page.waitForTimeout(800);
  const s = await page.evaluate(() => ({ mode: PB.debug.mode, bubble: bubbleText.textContent }));
  const lines = await logSince(page, L0);
  check(s.mode === 'play' && lines.some(l => l.text === s.bubble), 'resume / prompt repeat: ' + JSON.stringify({ s, lines }));
};
T.visibility = async ({ page, cdp, url }) => {
  await setupRound(page, cdp, url, { seed: 26 });
  // make sure a line is being spoken when the page hides
  await page.evaluate(() => { const w = PB.debug.world; PB.Voice.say('Testing a long line that is spoken while the page goes away into the background', { priority: true }); });
  await page.waitForTimeout(150);
  const before = await page.evaluate(() => ({ sp: speechSynthesis.speaking, ctx: PB.debug.audio().ctx && PB.debug.audio().ctx.state }));
  const p = await page.evaluate(() => window.__qa.softPoint());
  await tS(cdp, [tp(p.x, p.y)]); await page.waitForTimeout(60);
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(400);
  const s = await page.evaluate(() => ({ mode: PB.debug.mode, ctx: PB.debug.audio().ctx && PB.debug.audio().ctx.state, sp: speechSynthesis.speaking, vs: PB.Voice.isSpeaking(), g: !!PB.debug.world._g, pause: !document.getElementById('scrPause').classList.contains('hidden') }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });   // iOS cancels touches when the page hides
  check(before.sp && before.ctx === 'running', 'precondition (speaking + running audio): ' + JSON.stringify(before));
  check(s.mode === 'paused' && s.pause, 'not paused: ' + JSON.stringify(s));
  check(s.ctx === 'suspended', 'audio not suspended: ' + JSON.stringify(s));
  check(!s.sp && !s.vs, 'speech not stopped: ' + JSON.stringify(s));
  check(!s.g, 'gesture not cancelled');
  await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForTimeout(300);
  const s2 = await page.evaluate(() => ({ mode: PB.debug.mode, ctx: PB.debug.audio().ctx.state }));
  check(s2.mode === 'paused', 'auto-resumed: ' + JSON.stringify(s2));
  await tapEl(page, '#btnResume'); await page.waitForTimeout(400);
  const s3 = await page.evaluate(() => ({ mode: PB.debug.mode, ctx: PB.debug.audio().ctx.state }));
  check(s3.mode === 'play' && s3.ctx === 'running', 'after resume: ' + JSON.stringify(s3));
};
T.held_release_menu = async ({ page, cdp, url }) => {
  // a press on the sky that is still down when a screen opens (pause here, as the visibility / idle auto-pause does), lifted
  // over a menu button
  await setupRound(page, cdp, url, { seed: 26 });
  await tapEl(page, '#btnPause'); await page.waitForTimeout(200);
  const hb = await page.locator('#btnHome').boundingBox();
  await tapEl(page, '#btnResume'); await page.waitForTimeout(400);
  const p = { x: hb.x + hb.width / 2, y: hb.y + hb.height / 2 };
  await tS(cdp, [tp(p.x, p.y, 1)]); await page.waitForTimeout(80);
  await page.evaluate(() => document.getElementById('btnPause').click());   // = pause() from any path
  await page.waitForTimeout(400);
  await tE(cdp); await page.waitForTimeout(400);
  const m = await page.evaluate(() => PB.debug.mode);
  check(m === 'paused', 'lifting a finger that pressed the sky before the pause hit the pause-menu Home button: mode ' + m);
};
T.held_into_talk = async ({ page, cdp, url }) => {
  // a press that starts on the canvas just before Talk time opens and is lifted over a choice must not answer Talk.
  // Pass 1 learns where the (deterministic, same seed) choices settle; pass 2 holds a finger there while Talk opens.
  const toTalk = async () => {
    await setupRound(page, cdp, url, { seed: 33 });
    await page.evaluate(() => { PB.debug.setBot(true, 1); PB.debug.setSpeed(8); });
    await page.waitForFunction(() => { const w = PB.debug.world; return w.round === (w.roundsPerLevel || 4) - 1 && w.state === 'roundDone'; }, null, { timeout: 110000, polling: 'raf' });
    await page.evaluate(() => { PB.debug.setBot(false); PB.debug.setSpeed(1); });
    await page.waitForFunction(() => PB.debug.world.state === 'roundDone' && PB.debug.world.phase === 'out', null, { timeout: 20000, polling: 'raf' });
  };
  await toTalk();
  await page.waitForFunction(() => PB.debug.world.state === 'talk', null, { timeout: 8000, polling: 'raf' });
  await page.waitForTimeout(1200);
  const rects = await page.evaluate(() => [...document.querySelectorAll('#talkChoices button')].map(b => ({ id: b.dataset.id, r: b.getBoundingClientRect().toJSON() })));
  await toTalk();
  const r0 = rects[0].r, c = { x: r0.x + r0.width / 2, y: r0.y + r0.height / 2 };
  const n0 = await evLen(page);
  await tS(cdp, [tp(c.x, c.y)]);
  await page.waitForFunction(() => PB.debug.world.state === 'talk', null, { timeout: 8000, polling: 'raf' });
  await page.waitForTimeout(+process.env.HOLD_MS || 300);
  const under = await page.evaluate(([x, y]) => { const e = document.elementFromPoint(x, y); const b = e && e.closest('button'); return b ? (b.id || 'choice ' + b.dataset.id) : (e && (e.id || e.className)); }, [c.x, c.y]);
  await tE(cdp); await page.waitForTimeout(400);
  const evs = await evSince(page, n0);
  const r = evs.find(e => e.type === 'talkResult');
  check(!r, `a press started on the canvas before Talk opened, lifted ${process.env.HOLD_MS || 300} ms after over ${under}, answered Talk (correct ${r && r.correct})`);
  return { under, rects };
};
T.rotate = async ({ page, cdp, url, d }) => {
  await setupRound(page, cdp, url, { seed: 27, age: 6, topic: 'colors' });
  const p = await page.evaluate(() => window.__qa.softPoint());
  const n0 = await evLen(page);
  await tS(cdp, [tp(p.x, p.y)]); await page.waitForTimeout(50);
  // rotate while the finger is still within the 0.25 s swipe window, then slide over every bubble
  await page.setViewportSize({ width: d.viewport.height, height: d.viewport.width });
  const bad = [];
  for (let k = 0; k < 12; k++) { await page.waitForTimeout(100); bad.push(...(await page.evaluate(() => window.__qa.badBubbles())).filter(x => /=/.test(x))); }
  const g = await page.evaluate(() => !!PB.debug.world._g);
  const pts = await page.evaluate(() => PB.debug.world.bubbles.filter(b => b.state === 'float').map(b => PB.debug.bubbleScreen(b.id)));
  for (const c of pts) { await tM(cdp, [tp(c.x, c.y)]); await page.waitForTimeout(20); }
  await tE(cdp);
  await page.waitForTimeout(1500);
  await shot(page, d, 'rotated');
  const evs = await evSince(page, n0);
  check(!g, 'gesture not cancelled by the rotation');
  check(!evs.some(e => e.type === 'right' || e.type === 'wrong'), 'cancelled gesture judged: ' + types(evs));
  check(bad.length === 0, 'NaN during rotation: ' + bad.slice(0, 5).join('; '));
  let out = await page.evaluate(() => window.__qa.badBubbles());
  check(out.length === 0, 'after rotation: ' + out.join('; '));
  // the hit test still matches the drawn bubble after rotation: a tap on a target is right
  await waitAsk(page);
  const i = await info(page);
  const n1 = await evLen(page);
  await tapBubble(cdp, page, i.a);
  await page.waitForTimeout(300);
  check((await evSince(page, n1)).some(e => e.type === 'right'), 'tap after rotation');
  // rotate back during the flight / paint
  await page.setViewportSize(d.viewport);
  await page.waitForTimeout(1500);
  out = await page.evaluate(() => window.__qa.badBubbles());
  check(out.length === 0, 'after rotating back: ' + out.join('; '));
  const ev2 = await evSince(page, n1);
  check(!ev2.some(e => Object.values(e).some(v => typeof v === 'number' && !Number.isFinite(v))), 'NaN in events: ' + JSON.stringify(ev2.find(e => Object.values(e).some(v => typeof v === 'number' && !Number.isFinite(v)))));
};
T.perf = async ({ page, cdp, url }) => {
  await setupRound(page, cdp, url, { seed: 28, age: 4 });
  await page.evaluate(() => { window.__frames = []; });
  await page.waitForTimeout(5000);
  const f = await page.evaluate(() => { const a = window.__frames.slice().sort((x, y) => x - y); const q = p => a[Math.floor(a.length * p)]; return { n: a.length, med: q(0.5), p95: q(0.95), max: a[a.length - 1], slow: PB.debug.stats.slowFrames, quality: PB.debug.render().quality, canvas: [game.width, game.height] }; });
  check(f.med < 20 && f.p95 < 40, 'frame times: ' + JSON.stringify(f));
  return f;
};
T.voicelog = async ({ page, cdp, url, d }) => {
  // VI round: every line in VI, wrong + right lines, no raw text
  await setupRound(page, cdp, url, { seed: 29, lang: 'vi', topic: 'shapes', age: 5 });
  const L0 = 0;
  const i = await info(page);
  await tapBubble(cdp, page, i.others[0]); await page.waitForTimeout(1700);
  await tapBubble(cdp, page, i.a); await page.waitForTimeout(400);
  const lines = await logSince(page, L0);
  const bad = lines.filter(l => l.lang !== 'vi' || RAW.test(l.text) || NEG.test(l.text));
  check(bad.length === 0, 'VI log: ' + JSON.stringify(bad));
  const nonVi = lines.filter(l => !VI_CHARS.test(l.text));
  check(nonVi.length === 0, 'VI lines without Vietnamese text: ' + JSON.stringify(nonVi));
  const utt = await page.evaluate(() => window.__utt.map(u => ({ t: u.text, lang: u.lang, v: u.voice })));
  check(utt.length && utt.every(u => /^vi/.test(u.lang) && u.v === 'Linh'), 'utterance lang/voice: ' + JSON.stringify(utt.slice(0, 3)));
  return { lines: lines.map(l => l.text) };
};
T.title_lang = async ({ page, cdp, url, d }) => {
  await page.goto(url); await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=5');
  const L0 = await logLen(page);
  await tapEl(page, '.title-top [data-lang="vi"]');
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => ({ html: document.documentElement.lang, logo: logo1.textContent + ' ' + logo2.textContent, tag: tagline.textContent, title: document.title, age: titleAge.textContent, play: btnPlay.getAttribute('aria-label') }));
  check(s.html === 'vi' && /Gấu Trúc Bảo/.test(s.logo) && /Gấu Trúc Bảo/.test(s.title) && /Tuổi|tuổi/.test(s.age), 'VI title: ' + JSON.stringify(s));
  const l1 = await logSince(page, L0);
  check(l1.length && l1.every(l => l.lang === 'vi' && VI_CHARS.test(l.text)), 'VI welcome line: ' + JSON.stringify(l1));
  await shot(page, d, 'title-vi');
  const L1 = await logLen(page);
  await tapEl(page, '.title-top [data-lang="en"]');
  await page.waitForTimeout(300);
  const e = await page.evaluate(() => ({ html: document.documentElement.lang, logo: logo1.textContent + ' ' + logo2.textContent, age: titleAge.textContent }));
  const l2 = await logSince(page, L1);
  check(e.html === 'en' && /Bao/.test(e.logo) && /Age/.test(e.age), 'EN title: ' + JSON.stringify(e));
  check(l2.length && l2.every(l => l.lang === 'en' && !VI_CHARS.test(l.text)), 'EN welcome line: ' + JSON.stringify(l2));
  const utt = await page.evaluate(() => window.__utt.map(u => u.text + '|' + u.lang + '|' + u.voice + '|' + u.end));
  return { utt };
};
T.gate = async ({ page, cdp, url }) => {
  await gotoTitle(page, url + '?seed=5');
  const g = await page.locator('#btnParents').boundingBox(), c = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  for (const ms of [60, 400, 1500]) { await tap(cdp, page, c, ms); await page.waitForTimeout(400); check(!(await visible(page, 'scrSettings')), `a ${ms} ms press opened settings`); }
  // two short taps in a row (a toddler hammering) must not add up
  for (let k = 0; k < 4; k++) { await tap(cdp, page, c, 700); await page.waitForTimeout(60); }
  await page.waitForTimeout(400);
  check(!(await visible(page, 'scrSettings')), 'repeated short presses added up to open the gate');
  await tap(cdp, page, c, 2200); await page.waitForTimeout(300);
  check(await visible(page, 'scrSettings'), '2.2 s hold did not open');
};
T.persist = async ({ page, cdp, url }) => {
  await page.goto(url); await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=5');
  const g = await page.locator('#btnParents').boundingBox(), c = { x: g.x + g.width / 2, y: g.y + g.height / 2 };
  await tap(cdp, page, c, 2200); await page.waitForTimeout(300);
  await tapEl(page, '#ageChips [data-age="5"]');
  await tapEl(page, '#scrSettings [data-lang="vi"]');
  await page.locator('#inpName').fill('  An <b>x</b> ');
  await page.evaluate(() => { const v = optVolume; v.value = '60'; v.dispatchEvent(new Event('input', { bubbles: true })); v.dispatchEvent(new Event('change', { bubbles: true })); });
  await tapEl(page, '#btnSettingsDone');
  await page.reload(); await page.waitForFunction(() => PB.debug && PB.debug.mode === 'title');
  let s = await page.evaluate(() => ({ st: PB.debug.getState().settings, keys: Object.keys(localStorage), age: titleAge.textContent, html: document.documentElement.lang, vol: optVolume.value }));
  check(s.st.age === 5 && s.st.lang === 'vi' && /^An( x)?$/.test(s.st.name) && Math.abs(s.st.volume - 0.6) < 1e-9 && s.vol === '60' && /5/.test(s.age) && s.html === 'vi', 'after reload: ' + JSON.stringify(s));
  check(s.keys.length && s.keys.every(k => k.startsWith('pb:')), 'keys: ' + s.keys);
  // URL flags: applied, never saved — also after playing and changing the volume in the pause menu
  await gotoTitle(page, url + '?lang=en&age=7&speed=2&seed=9&mute=1');
  s = await page.evaluate(() => ({ age: titleAge.textContent, html: document.documentElement.lang }));
  check(/7/.test(s.age) && s.html === 'en', 'flags not applied: ' + JSON.stringify(s));
  await tapEl(page, '#btnPlay'); await page.waitForTimeout(500);
  await tapEl(page, '#btnPause'); await page.waitForTimeout(200);
  await tapEl(page, '#btnVolUp'); await page.waitForTimeout(150);
  await tapEl(page, '#btnVolUp'); await page.waitForTimeout(150);
  const st = await page.evaluate(() => JSON.parse(localStorage.getItem('pb:settings')));
  check(st.age === 5 && st.lang === 'vi' && !('speed' in st) && !('mute' in st) && !('seed' in st), 'flags leaked: ' + JSON.stringify(st));
  check(Math.abs(st.volume - 0.8) < 1e-9, 'pause + did not save 80 %: ' + st.volume);
  const ug = await page.evaluate(() => PB.debug.audio().user && PB.debug.audio().user.gain.value);
  await page.goto(url + '?seed=5'); await page.waitForFunction(() => PB.debug && PB.debug.mode === 'title');
  s = await page.evaluate(() => ({ st: PB.debug.getState().settings, html: document.documentElement.lang, age: titleAge.textContent, vol: optVolume.value }));
  check(s.st.age === 5 && s.html === 'vi' && /5/.test(s.age) && s.vol === '80', 'after flags removed: ' + JSON.stringify(s));
  return { userGainAfterUp: ug };
};
T.audio = async ({ page, cdp, url }) => {
  await page.goto(url); await page.evaluate(() => { try { localStorage.clear(); } catch (e) {} });
  await gotoTitle(page, url + '?seed=5');
  await tapEl(page, '#btnPlay'); await page.waitForTimeout(500);
  const a = await page.evaluate(() => { const A = PB.debug.audio(); return { state: A.ctx && A.ctx.state, thr: A.comp.threshold.value, knee: A.comp.knee.value, ratio: A.comp.ratio.value, att: A.comp.attack.value, rel: A.comp.release.value, user: A.user.gain.value, master: A.master.gain.value }; });
  check(a.state === 'running' && a.thr === -18 && a.knee === 12 && a.ratio === 4 && Math.abs(a.att - 0.004) < 1e-4 && Math.abs(a.rel - 0.18) < 1e-3, 'compressor: ' + JSON.stringify(a));
  check(Math.abs(a.user - 1.6) < 0.02, 'makeup gain: ' + a.user);
  await tapEl(page, '#btnPause'); await page.waitForTimeout(200);
  for (let k = 0; k < 12; k++) { await tapEl(page, '#btnVolDown'); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  let v = await page.evaluate(() => ({ s: PB.debug.getState().settings.volume, u: PB.debug.audio().user.gain.value, lbl: volLevel.textContent, utt: PB.Voice._volume }));
  check(v.s === 0 && v.u < 0.01 && v.lbl === '0%', 'volume floor: ' + JSON.stringify(v));
  for (let k = 0; k < 13; k++) { await tapEl(page, '#btnVolUp'); await page.waitForTimeout(60); }
  await page.waitForTimeout(300);
  v = await page.evaluate(() => ({ s: PB.debug.getState().settings.volume, u: PB.debug.audio().user.gain.value, lbl: volLevel.textContent }));
  check(v.s === 1 && Math.abs(v.u - 1.6) < 0.03 && v.lbl === '100%', 'volume ceiling: ' + JSON.stringify(v));
  // speech uses the same volume
  await tapEl(page, '#btnVolDown'); await tapEl(page, '#btnVolDown'); await page.waitForTimeout(150);
  const U0 = await page.evaluate(() => window.__utt.length);
  await tapEl(page, '#btnResume');
  await page.waitForFunction(n => window.__utt.length > n, U0, { timeout: 20000 });
  const uv = await page.evaluate(n => window.__utt[n], U0);
  check(uv && Math.abs(uv.vol - 0.8) < 1e-6, 'utterance volume after 80 %: ' + JSON.stringify(uv));
};

/* ---------- bot sessions ---------- */
async function runBot(browser, url, age, lang, speed) {
  const d = DEV[['ip', 'ipl', 'pad', 'padl'][(age + (lang === 'vi' ? 1 : 0)) % 4]], errors = [];
  const { ctx, page } = await newPage(browser, d, errors);
  const name = `bot age ${age} ${lang} x${speed}`;
  try {
    const t0 = Date.now();
    await page.goto(`${url}?bot=1&speed=${speed}&autostart=1&age=${age}&lang=${lang}&seed=${100 + age}&skill=0.7`);
    await page.waitForFunction(() => PB.debug && PB.debug.world, null, { timeout: 20000 });
    await page.evaluate(() => window.__qa.hook());
    await page.waitForFunction(() => PB.debug.mode === 'done', null, { timeout: 115000, polling: 500 });
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, `bot-${age}-${lang}.png`) });
    const r = await page.evaluate(() => ({ s: PB.debug.stats, log: PB.debug.voiceLog.map(x => ({ lang: x.lang, text: x.text })), age: PB.debug.world.age, levels: PB.debug.world.levels, done: doneTitle.textContent, nan: window.__ev.filter(e => Object.values(e).some(v => typeof v === 'number' && !Number.isFinite(v))).length }));
    check(r.age === age, 'age ' + r.age);
    check(r.s.rounds >= 12 && r.s.talks >= 4, 'short session ' + JSON.stringify(r.s));
    check(r.nan === 0, 'NaN in events: ' + r.nan);
    const bad = r.log.filter(l => l.lang !== lang || RAW.test(l.text) || NEG.test(l.text) || (lang === 'en' && VI_CHARS.test(l.text)));
    check(bad.length === 0, 'bad lines: ' + JSON.stringify(bad.slice(0, 5)));
    if (lang === 'vi') { const nv = r.log.filter(l => !VI_CHARS.test(l.text) && !/^(Hai|Ba|Con heo|Con dê|Con cua)!?$/i.test(l.text.trim())); check(nv.length <= 2, 'VI lines with no Vietnamese: ' + JSON.stringify(nv.slice(0, 6))); }
    check(!RAW.test(r.done) && r.done, 'done title ' + r.done);
    await page.touchscreen.tap(...(await page.locator('#btnAgain').boundingBox().then(b => [b.x + b.width / 2, b.y + b.height / 2])));
    await page.waitForTimeout(800);
    const a = await page.evaluate(() => ({ mode: PB.debug.mode, sessions: PB.debug.stats.sessions, st: PB.debug.world.state, level: PB.debug.world.level, hud: !hud.classList.contains('hidden'), stars: hudStars.textContent }));
    check(a.mode === 'play' && a.sessions === 2 && a.st !== 'sessionDone' && a.hud && +a.stars <= 3, 'Play again: ' + JSON.stringify(a));
    const errs = errors.filter(e => !/AudioContext was not allowed to start|outside nominal range/.test(e));   // P3 noted separately   // ?autostart has no gesture (test flag only)
    check(errs.length === 0, 'errors: ' + errs.slice(0, 3).join(' | '));
    record(d.name, name, true, `${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.levels.join('/')}, rounds ${r.s.rounds}, right ${r.s.correct}, wrong ${r.s.wrong}, hints ${r.s.hints}, talks ${r.s.talks}/${r.s.talkRight}, lines ${r.log.length}`);
  } catch (e) {
    let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = PB.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, level: s.level, round: s.round }; })); } catch (x) {}
    record(d.name, name, false, (e.message || String(e)).split('\n')[0] + ' ' + st + (errors.length ? ' errors: ' + errors.slice(0, 2).join(' | ') : ''));
  }
  await ctx.close();
}
/** real-time play (speed 1) with the fake voice: which lines were cut, and by what */
async function runLive(browser, url, age, lang, secs, skill) {
  const d = DEV.padl, errors = [];
  const { ctx, page, cdp } = await newPage(browser, d, errors);
  await gotoTitle(page, `${url}?seed=${200 + age}&age=${age}&lang=${lang}`);
  await tapEl(page, '#btnPlay');
  await page.evaluate(s => PB.debug.setBot(true, s), skill);
  await page.waitForTimeout(secs * 1000);
  const r = await page.evaluate(() => ({ utt: window.__utt, asks: PB.debug.voiceLog.length, ev: window.__ev.map(e => ({ type: e.type, t: e._t })), st: PB.debug.getState() }));
  const askTexts = await page.evaluate(() => { const s = new Set(); return s; });
  const cut = r.utt.filter(u => u.end === 'interrupted');
  const summary = { age, lang, secs, utterances: r.utt.length, cut: cut.map(u => ({ text: u.text, by: u.cutBy, ms: Math.round(u.t1 - u.t0), of: Math.round(u.dur), wt: +u.wt.toFixed(1) })), state: { level: r.st.level, round: r.st.round, state: r.st.state }, errors };
  fs.writeFileSync(path.join(OUT, `live-${age}-${lang}.json`), JSON.stringify({ summary, utt: r.utt }, null, 1));
  record(d.name, `live age ${age} ${lang} ${secs}s`, errors.length === 0, `${r.utt.length} utterances, ${cut.length} cut`, summary);
  await ctx.close();
}

(async () => {
  const [mode, a1, a2, a3, a4] = process.argv.slice(2);
  const srv = await serve();
  const browser = await chromium.launch();
  try {
    if (mode === 'dev') {
      const d = DEV[a1]; const list = a2 === 'all' ? Object.keys(T) : a2.split(',');
      const errors = [];
      const { ctx, page, cdp } = await newPage(browser, d, errors);
      for (const t of list) {
        const e0 = errors.length;
        try {
          const data = await T[t]({ page, cdp, url: srv.url, d, errors });
          const errs = errors.slice(e0);
          record(d.name, t, errs.length === 0, errs.length ? 'console: ' + errs.slice(0, 3).join(' | ') : '', data);
        } catch (e) {
          await shot(page, d, 'fail-' + t);
          let st = ''; try { st = JSON.stringify(await page.evaluate(() => { const s = PB.debug.getState(); return { mode: s.mode, state: s.state, phase: s.phase, round: s.round }; })); } catch (x) {}
          record(d.name, t, false, (e instanceof Fail ? '' : 'exception: ') + (e.message || '').split('\n')[0] + ' ' + st);
          try { await page.setViewportSize(d.viewport); await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] }); } catch (x) {}
        }
      }
      await ctx.close();
    } else if (mode === 'bot') await runBot(browser, srv.url, +a1, a2, +(a3 || 12));
    else if (mode === 'live') await runLive(browser, srv.url, +a1, a2, +a3, a4 == null ? 0.6 : +a4);
  } finally { await browser.close(); srv.close(); }
  process.exit(results.some(r => !r.ok) ? 1 : 0);
})();
