// Functional QA (Bun's Dino Dig) — REAL CDP touch input (Input.dispatchTouchEvent) on isMobile / hasTouch contexts:
// iPhone 393×852 @3 (portrait + landscape 852×393), iPad 820×1180 / 1180×820 @2. Report-only: never edits game/.
// DD.debug is used to READ state, to jump to a chapter topic / round, and (said in the check name) to force Talk time or
// a surprise round; every child action (dig, Bun, sand, Talk answer, mole, pterosaur, buttons, gear, slider) is a touch.
//   node tests/e2e/functional.js                 (all groups)
//   node tests/e2e/functional.js dig rotate      (some groups)
// Groups: layout boot lang gate persist audio dig count help talk pause rotate multi surprise bots
// Writes tests/out/functional/results.json; exits 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');

const OUT = path.join(__dirname, '..', 'out', 'functional'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 }, iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 }, ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ONLY = process.argv.slice(2);
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũầấậẩẫềếệểễồốộổỗờớợởỡừứựửữằắặẳẵ]/i;
let srv, browser;

// ---------------------------------------------------------------- page helpers
async function newCtx(dev) {
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
  // record the Web Audio graph (the compressor is a local in audio.js, so the connections are the only way to see it)
  await ctx.addInitScript(() => {
    window.__ag = [];
    const AN = window.AudioNode && AudioNode.prototype;
    if (!AN) return;
    const name = n => (n instanceof GainNode ? 'gain' : n instanceof DynamicsCompressorNode ? 'comp' : n instanceof AudioDestinationNode ? 'dest' : n.constructor.name);
    const oc = AN.connect;
    AN.connect = function (d) { if (d instanceof AudioNode) window.__ag.push({ from: this, to: d, f: name(this), t: name(d) }); return oc.apply(this, arguments); };
  });
  return ctx;
}
async function attach(ctx, page) {
  const P = { ctx, page, errors: [] };
  page.on('console', m => { if (m.type() === 'error') P.errors.push(m.text()); });
  page.on('pageerror', e => P.errors.push(String(e)));
  page.on('requestfailed', r => P.errors.push('REQFAIL ' + r.url() + ' ' + (r.failure() && r.failure().errorText)));
  page.on('response', r => { if (r.status() >= 400) P.errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  page.on('crash', () => P.errors.push('PAGE CRASH'));
  P.cdp = await ctx.newCDPSession(page);
  return P;
}
async function instrument(P) {
  await P.page.waitForFunction(() => window.DD && DD.debug && DD.debug.world && (DD.debug.mode === 'title' || DD.debug.mode === 'play'), null, { timeout: 20000 });
  await P.page.evaluate(() => {
    const w = DD.debug.world; window.__ev = [];
    const o = w.drainEvents.bind(w);
    w.drainEvents = function () { const e = o(); for (const x of e) window.__ev.push(Object.assign({ t: performance.now(), wt: w.time }, x, { talk: undefined, treasures: undefined, thing: x.thing ? { kind: x.thing.kind, color: x.thing.color } : undefined })); return e; };
    window.__drops = []; let prevH = 0, prevW = 0, sess = DD.debug.stats.sessions;
    setInterval(() => {
      const m = DD.debug.mode, s = DD.debug.stats.sessions;
      if (s !== sess || m === 'title') { sess = s; prevH = 0; prevW = 0; return; }
      const h = +document.getElementById('hudStars').textContent || 0, ws = DD.debug.world.stars || 0;
      if (h < prevH || ws < prevW) window.__drops.push({ m, h, prevH, ws, prevW });
      prevH = Math.max(prevH, h); prevW = Math.max(prevW, ws);
    }, 100);
    // a CSS-px screen point: inside the viewport, outside the DOM HUD / bubble, outside the logical HUD / bubble / shelf
    // keep-outs, and the canvas is what the finger hits
    window.__probe = function (p) {
      if (!p) return { ok: false, why: 'null' };
      const vw = innerWidth, vh = innerHeight, inR = r => r.width > 0 && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
      const hud = document.getElementById('hud'), bub = document.getElementById('bubble');
      const hr = hud.classList.contains('hidden') ? { width: 0 } : hud.getBoundingClientRect();
      const br = bub.classList.contains('hidden') ? { width: 0 } : bub.getBoundingClientRect();
      const v = DD.debug.view(), L = DD.debug.world.layout, lx = (p.x - v.left) / v.s, ly = (p.y - v.top) / v.s;
      const inB = b => b && lx >= b.x && lx <= b.x + b.w && ly >= b.y && ly <= b.y + b.h;
      const el = document.elementFromPoint(p.x, p.y);
      const r = { x: Math.round(p.x), y: Math.round(p.y), inside: p.x >= 2 && p.y >= 2 && p.x <= vw - 2 && p.y <= vh - 2, domHud: inR(hr), domBubble: inR(br),
        lHud: inB(L.hud), lBubble: inB(L.bubble), lShelf: inB(L.shelf), el: el ? (el.id || el.tagName) : null };
      r.ok = r.inside && !r.domHud && !r.domBubble && !r.lHud && !r.lBubble && !r.lShelf && r.el === 'game';
      return r;
    };
  });
}
async function open(dev, q = 'mute=1') {
  const ctx = await newCtx(dev); const page = await ctx.newPage();
  const P = await attach(ctx, page);
  await page.goto(srv.url + '?' + q);
  await instrument(P);
  return P;
}
const W = (P, fn, arg) => P.page.evaluate(fn, arg);
const until = (P, fn, arg, t = 30000) => P.page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
async function touch(P, type, pts) { await P.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' || type === 'touchCancel' ? [] : pts }); }
async function tap(P, p, hold = 70) { await touch(P, 'touchStart', [{ x: p.x, y: p.y, id: 1 }]); await sleep(hold); await touch(P, 'touchEnd'); await sleep(50); }
const center = (P, sel) => W(P, s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);
async function tapEl(P, sel, hold) { const c = await center(P, sel); if (!c || !c.w) throw new Error('no visible ' + sel); await tap(P, c, hold); }
async function hold(P, sel, ms) {   // returns how long the page saw the finger down
  const c = await center(P, sel);
  await W(P, s => { const e = document.querySelector(s); window.__hold = {}; e.addEventListener('pointerdown', () => { window.__hold.d = performance.now(); }, { once: true, capture: true }); window.addEventListener('pointerup', () => { window.__hold.u = performance.now(); }, { once: true, capture: true }); }, sel);
  await touch(P, 'touchStart', [{ x: c.x, y: c.y, id: 1 }]); await sleep(ms); await touch(P, 'touchEnd'); await sleep(250);
  return W(P, () => window.__hold.u - window.__hold.d);
}
const evs = (P, type) => W(P, t => window.__ev.filter(e => e.type === t), type);
const evTypes = P => W(P, () => window.__ev.map(e => e.type));
const clearEv = P => W(P, () => { window.__ev.length = 0; });
const vlog = (P, from = 0) => W(P, f => DD.debug.voiceLog.slice(f).map(x => ({ lang: x.lang, text: x.text })), from);
const vlen = P => W(P, () => DD.debug.voiceLog.length);
const moundPt = (P, id) => W(P, i => DD.debug.moundScreen(i), id);
const state = P => W(P, () => DD.debug.getState());
// jump to a chapter topic (a level), optionally a later round; setup runs before and after startLevel (world internals)
async function startTopic(P, topic, lvl = 0, setup) {
  await W(P, ({ topic, lvl, setup }) => {
    if (DD.debug.mode !== 'play') DD.debug.startGame();
    const w = DD.debug.world;
    if (setup) (new Function('w', setup))(w);
    w.levels[lvl] = topic; w.startLevel(lvl);
    if (setup) (new Function('w', setup))(w);
    DD.debug.setSpeed(5);
  }, { topic, lvl, setup: setup || null });
  await until(P, () => DD.debug.world.interactive);
  await W(P, () => DD.debug.setSpeed(1));
  await sleep(150);
}
async function playRoundByTouch(P, max = 60) {   // finish the round with real taps on the right mound
  for (let i = 0; i < max; i++) {
    const s = await W(P, () => ({ st: DD.debug.world.state, ph: DD.debug.world.phase }));
    if (s.st !== 'round') return true;
    const a = await W(P, () => { const a = DD.debug.answer(); return a ? { id: a.mound, dig: !!a.digging, p: DD.debug.moundScreen(a.mound) } : null; });
    if (a && a.p) await tap(P, a.p);
    await sleep(a ? (a.dig ? 200 : 350) : 200);
  }
  return false;
}
const noErr = (check, tag, P) => check(`${tag}: no console errors / failed requests`, P.errors.length === 0, P.errors.slice(0, 5));

// ---------------------------------------------------------------- groups
const G = {
  // every mound tap point (and Bun's) on 4 viewports × ages 3–7 × every topic of the age pool × rounds 0–3 × 3 rerolls
  async layout(check) {
    for (const [n, d] of Object.entries(DEV)) {
      const P = await open(d, 'mute=1&seed=21&age=4');
      await tapEl(P, '#btnPlay');
      await until(P, () => DD.debug.mode === 'play' && DD.debug.world.state === 'round', null, 20000);
      await sleep(300);
      for (const age of [3, 4, 5, 6, 7]) {
        const r = await W(P, age => {
          const w = DD.debug.world, bad = [], hitBad = [], wrongHit = [], seen = {};
          let n = 0, rounds = 0;
          // the bubble at its tallest: the longest VI prompt with "Next one!"
          const I = DD.I18N, longTxt = I.ask('vi', 'p.shapes5', { shape: 'diamond', color: 'purple' }, { next: true });
          DD.UI.say(longTxt);
          w.setAge(age); w.newSession({});
          const pool = (DD.AGE_POOLS && DD.AGE_POOLS[age]) || DD.AGE_TOPICS[age];
          for (const topic of pool) for (let lvl = 0; lvl < 4; lvl++) for (let k = 0; k < 4; k++) for (let rep = 0; rep < 2; rep++) {
            w.levels[lvl] = topic; w.startLevel(lvl); w.round = k;
            try { w._beginRound(); } catch (e) { bad.push({ topic, k, err: String(e) }); continue; }
            rounds++;
            for (const m of w.mounds) m.pop = 1;   // as after the enter phase (_moundAt skips mounds still popping up)
            for (const m of w.mounds) {
              n++;
              const p = DD.debug.moundScreen(m.id), pr = window.__probe(p);
              if (!pr.ok) bad.push({ topic, lvl, k, id: m.id, n: w.mounds.length, pr });
              const t = w.moundTap(m.id), got = w._moundAt(t.x, t.y);
              if (!got || got.id !== m.id) wrongHit.push({ topic, k, id: m.id, got: got && got.id });
              // the whole hit circle vs the keep-out boxes (info)
              const h = w.moundHit(m.id);
              for (const b of w.layout.keep) {
                const cx = Math.max(b.x, Math.min(h.x, b.x + b.w)), cy = Math.max(b.y, Math.min(h.y, b.y + b.h));
                if (Math.hypot(h.x - cx, h.y - cy) < h.r * 0.5) { const key = b.kind + ':' + w.mounds.length + ':' + m.row; if (!seen[key]) { seen[key] = 1; hitBad.push({ topic, k, id: m.id, row: m.row, kind: b.kind, n: w.mounds.length }); } }
              }
              // thing (peek) inside the screen
              if (m.x - m.w / 2 < -1 || m.x + m.w / 2 > w.layout.W + 1 || m.y > w.layout.H + 1) bad.push({ topic, k, id: m.id, offscreen: [m.x, m.y, m.w] });
            }
          }
          const b = DD.debug.bunScreen(), bp = window.__probe(b), bunOverMound = w.mounds.some(m => w._moundAt(w.bunHit().x, w.bunHit().y));
          return { n, rounds, bad: bad.slice(0, 6), nbad: bad.length, wrongHit: wrongHit.slice(0, 4), nwrong: wrongHit.length, hitBad: hitBad.slice(0, 6), nhit: hitBad.length, bun: bp, bunOverMound, L: { W: w.layout.W, H: w.layout.H, cap: w.layout.capacity, item: w.layout.item } };
        }, age);
        check(`${n} age ${age}: every mound tap point (${r.n} in ${r.rounds} rounds) inside the screen, clear of DOM HUD/bubble and logical HUD/bubble/shelf, hits the canvas`, r.nbad === 0, { nbad: r.nbad, bad: r.bad, L: r.L });
        check(`${n} age ${age}: moundTap(id) hits that same mound (nearest centre)`, r.nwrong === 0, r.wrongHit);
        check(`${n} age ${age}: no hit circle half under a keep-out box (info)`, r.nhit === 0, r.hitBad);
        check(`${n} age ${age}: Bun tap point hits the canvas, not a mound`, r.bun.ok && !r.bunOverMound, r.bun);
      }
      noErr(check, n + ' layout', P);
      await P.ctx.close();
    }
  },
  async boot(check) {
    for (const [n, d] of Object.entries(DEV)) {
      const P = await open(d, 'mute=1&seed=3&age=4');
      const t = await W(P, () => ({ title: !document.getElementById('scrTitle').classList.contains('hidden'), loading: document.getElementById('loading').classList.contains('hidden'),
        logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, hud: document.getElementById('hud').classList.contains('hidden') }));
      check(`${n} boot: title shown, loader gone, HUD hidden (${t.logo})`, t.title && t.loading && t.hud, t);
      const pl = await center(P, '#btnPlay');
      check(`${n} boot: Play button ≥ 88 CSS px and on screen`, pl && pl.w >= 88 && pl.h >= 88 && pl.y + pl.h / 2 <= d.viewport.height, pl);
      const g = await center(P, '#btnParents');
      check(`${n} boot: gear on screen`, g && g.w > 30 && g.x > 0 && g.y > 0);
      await tapEl(P, '#btnPlay');
      await until(P, () => window.__ev.some(e => e.type === 'ask'), null, 15000).catch(() => {});
      const s = await state(P);
      check(`${n} boot: real tap on Play → play mode, chapter 1 round 0 asks`, s.mode === 'play' && s.level === 0 && (await evs(P, 'ask')).length >= 1, s);
      const hudPause = await W(P, () => { const b = document.getElementById('btnPause').getBoundingClientRect(); const e = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return { w: b.width, h: b.height, hit: !!(e && e.closest('#btnPause')) }; });
      check(`${n} boot: pause button ≥ 44 px and tappable`, hudPause.w >= 44 && hudPause.h >= 44 && hudPause.hit, hudPause);
      noErr(check, n + ' boot', P);
      await P.ctx.close();
    }
  },
  async lang(check) {
    const P = await open(DEV.iphoneP, 'mute=1&seed=3&age=4');
    await tapEl(P, '#scrTitle [data-lang="vi"]'); await sleep(250);
    const ti = await W(P, () => ({ lang: document.documentElement.lang, logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, tag: document.getElementById('tagline').textContent, on: document.querySelector('#scrTitle [data-lang="vi"]').classList.contains('on') }));
    check('lang: VI chip tap → title UI in Vietnamese', ti.lang === 'vi' && VI_RE.test(ti.logo + ti.tag) && ti.on, ti);
    const w1 = await vlog(P);
    check('lang: VI chip → welcome line logged in vi', w1.length >= 1 && w1[w1.length - 1].lang === 'vi', w1);
    await tapEl(P, '#btnPlay');
    await until(P, () => window.__ev.some(e => e.type === 'ask'), null, 15000);
    await sleep(200);
    let txt = await W(P, () => document.getElementById('bubbleText').textContent);
    let lg = await vlog(P);
    check('lang VI: bubble prompt is Vietnamese', VI_RE.test(txt), txt);
    check('lang VI: every voice line is lang vi with Vietnamese text', lg.length > 1 && lg.every(l => l.lang === 'vi') && lg.slice(1).some(l => VI_RE.test(l.text)), lg.slice(0, 4));
    await tapEl(P, '#btnPause'); await sleep(200); await tapEl(P, '#btnHome'); await sleep(250);
    check('lang: pause → Home returns to the title', await W(P, () => DD.debug.mode === 'title'));
    await hold(P, '#btnParents', 2300);
    await tapEl(P, '#scrSettings [data-lang="en"]'); await sleep(150);
    check('lang: settings EN chip → both switches agree', await W(P, () => document.querySelector('#scrTitle [data-lang="en"]').classList.contains('on') && document.querySelector('#scrSettings [data-lang="en"]').classList.contains('on') && document.documentElement.lang === 'en'));
    await tapEl(P, '#btnSettingsDone'); await sleep(150);
    const n0 = await vlen(P); await clearEv(P);
    await tapEl(P, '#btnPlay');
    await until(P, () => window.__ev.some(e => e.type === 'ask'), null, 15000);
    await sleep(200);
    txt = await W(P, () => document.getElementById('bubbleText').textContent);
    lg = await vlog(P, n0);
    check('lang EN: bubble prompt is English', /[a-z]/i.test(txt) && !VI_RE.test(txt), txt);
    check('lang EN: new voice lines are lang en, English text', lg.length > 0 && lg.every(l => l.lang === 'en' && !VI_RE.test(l.text)), lg.slice(0, 4));
    noErr(check, 'lang', P);
    await P.ctx.close();
  },
  async gate(check) {
    for (const [n, d] of [['iphoneP', DEV.iphoneP], ['ipadL', DEV.ipadL], ['iphoneL', DEV.iphoneL]]) {
      const P = await open(d, 'mute=1&seed=13');
      const closed = () => W(P, () => document.getElementById('scrSettings').classList.contains('hidden'));
      await tapEl(P, '#btnParents'); await sleep(300);
      check(`${n} gate: a short tap on the gear does not open settings`, await closed());
      const held = await hold(P, '#btnParents', 1000);
      check(`${n} gate: a 1 s hold (page saw ${Math.round(held)} ms) does not open settings`, held >= 1900 || await closed(), held);
      await hold(P, '#btnParents', 2300);
      check(`${n} gate: a 2 s hold opens settings`, !(await closed()));
      check(`${n} gate: still on the title, game not started`, await W(P, () => DD.debug.mode === 'title' && DD.debug.stats.sessions === 0));
      const vis = await W(P, () => { const r = document.getElementById('btnSettingsDone').getBoundingClientRect(); const p = document.querySelector('.settings-panel'); return { done: r.bottom <= innerHeight || p.scrollHeight > p.clientHeight, r: [r.top, r.bottom, innerHeight] }; });
      check(`${n} gate: settings Done reachable (on screen or panel scrolls)`, vis.done, vis);
      noErr(check, n + ' gate', P);
      await P.ctx.close();
    }
  },
  async persist(check) {
    const ctx = await newCtx(DEV.ipadP); const page = await ctx.newPage(); const P = await attach(ctx, page);
    await page.goto(srv.url + '?mute=1'); await instrument(P);
    await hold(P, '#btnParents', 2300);
    await tapEl(P, '#ageChips [data-age="6"]'); await sleep(100);
    check('persist: settings stay open after an age-chip tap', await W(P, () => !document.getElementById('scrSettings').classList.contains('hidden')));
    await tapEl(P, '#scrSettings [data-lang="vi"]'); await sleep(100);
    await tapEl(P, '#inpName'); await page.keyboard.type('Mai'); await sleep(150);
    const vr = await W(P, () => { const r = document.getElementById('optVolume').getBoundingClientRect(); return { x: r.x + r.width * 0.3, y: r.y + r.height / 2 }; });
    await tap(P, vr); await sleep(150);
    let vol = await W(P, () => DD.debug.getState().settings.volume);
    check('persist: a real tap on the volume slider track changes the volume', vol < 0.9, vol);
    if (!(vol < 0.9)) { await page.fill('#optVolume', '30'); await W(P, () => document.getElementById('optVolume').dispatchEvent(new Event('input'))); }
    const before = await W(P, () => DD.debug.getState().settings);
    await tapEl(P, '#btnSettingsDone');
    const raw0 = await W(P, () => localStorage.getItem('dd:settings'));
    await page.reload(); await instrument(P);
    const after = await W(P, () => DD.debug.getState().settings);
    check('persist: age 6 / vi / name Mai / volume survive a reload', after.age === 6 && after.lang === 'vi' && after.name === 'Mai' && Math.abs(after.volume - before.volume) < 1e-9, { before, after, raw0 });
    check('persist: title shows Vietnamese + age after reload', await W(P, () => document.documentElement.lang === 'vi' && /6/.test(document.getElementById('titleAge').textContent)), await W(P, () => document.getElementById('titleAge').textContent));
    check('persist: audio volume applied from storage', await W(P, v => Math.abs(DD.debug.audio().volume - v) < 1e-9, before.volume));
    // URL flags never saved
    await page.goto(srv.url + '?mute=1&age=3&lang=en&speed=2&seed=4'); await instrument(P);
    check('flags: ?lang=en and ?age=3 applied for the session', await W(P, () => document.documentElement.lang === 'en' && /3/.test(document.getElementById('titleAge').textContent)));
    await hold(P, '#btnParents', 2300);
    await tap(P, await center(P, 'label:has(#optSfx)')); await sleep(100);   // forces a save
    await tap(P, await center(P, 'label:has(#optSfx)')); await sleep(100);
    await tapEl(P, '#btnSettingsDone');
    await tapEl(P, '#btnPlay'); await sleep(600);   // starting a game must not save flags either
    const raw = await W(P, () => JSON.parse(localStorage.getItem('dd:settings')));
    check('flags: ?age= / ?lang= / ?speed= never written to storage', raw.age === 6 && raw.lang === 'vi' && raw.speed === undefined && raw.seed === undefined, raw);
    await page.goto(srv.url + '?mute=1'); await instrument(P);
    const s2 = await W(P, () => DD.debug.getState().settings);
    check('flags: reload without flags → saved age 6 / vi back', s2.age === 6 && s2.lang === 'vi', s2);
    check('persist: every storage key uses the dd: prefix', await W(P, () => { const k = []; for (let i = 0; i < localStorage.length; i++) k.push(localStorage.key(i)); return k.every(x => x.startsWith('dd:')); }), await W(P, () => Object.keys(localStorage)));
    noErr(check, 'persist', P);
    await ctx.close();
  },
  async audio(check) {
    const ctx = await newCtx(DEV.iphoneP); const page = await ctx.newPage(); const P = await attach(ctx, page);
    await page.goto(srv.url + '?seed=12&age=4&novoice=1'); await instrument(P);   // NOT muted: the real chain
    await tapEl(P, '#btnPlay'); await sleep(600);
    const ch = await W(P, () => {
      const A = DD.debug.audio(), g = window.__ag;
      const outs = n => g.filter(e => e.from === n);
      const comp = g.find(e => e.from === A.master && e.t === 'comp');
      const c2u = comp && g.some(e => e.from === comp.to && e.to === A.user);
      const u2d = g.some(e => e.from === A.user && e.t === 'dest');
      const C = comp && comp.to;
      return { ctx: !!A.ctx, state: A.ctx && A.ctx.state, sfx2m: outs(A.sfx).some(e => e.to === A.master), mus2m: outs(A.music).some(e => e.to === A.master), amb2m: A.amb ? outs(A.amb).some(e => e.to === A.master) : null,
        m2c: !!comp, c2u, u2d, comp: C ? { th: C.threshold.value, knee: C.knee.value, ratio: C.ratio.value, att: +C.attack.value.toFixed(4), rel: +C.release.value.toFixed(3) } : null,
        exposed: !!(A.comp || A.compressor), gain: A.user && A.user.gain.value, vol: A.volume };
    });
    check('audio: chain sfx/music/amb → master → DynamicsCompressor → user gain → destination', ch.ctx && ch.sfx2m && ch.mus2m && ch.m2c && ch.c2u && ch.u2d, ch);
    check('audio: compressor −18 dB / knee 12 / ratio 4 / 4 ms / 180 ms', ch.comp && ch.comp.th === -18 && ch.comp.knee === 12 && ch.comp.ratio === 4 && ch.comp.att === 0.004 && ch.comp.rel === 0.18, ch.comp);
    check('audio: user gain = volume × 1.6 makeup', Math.abs(ch.gain - ch.vol * 1.6) < 0.05, ch);
    check('audio: compressor reachable from DD.Audio / DD.debug.audio() (skill: QA checks the gains)', ch.exposed, 'DD.Audio has master/user/sfx/music/amb but the compressor is a local `comp` in audio.js ensure()');
    await tapEl(P, '#btnPause'); await sleep(200);
    await tapEl(P, '#btnVolDown'); await sleep(100); await tapEl(P, '#btnVolDown'); await sleep(400);
    const v = await W(P, () => ({ txt: document.getElementById('volLevel').textContent, vol: DD.debug.audio().volume, gain: DD.debug.audio().user.gain.value }));
    check('audio: pause − − → 80 % and the user gain follows (1.28)', v.txt === '80%' && Math.abs(v.vol - 0.8) < 1e-6 && Math.abs(v.gain - 1.28) < 0.05, v);
    await tapEl(P, '#btnVolUp'); await sleep(100); await tapEl(P, '#btnVolUp'); await sleep(100); await tapEl(P, '#btnVolUp'); await sleep(300);
    const v1 = await W(P, () => DD.debug.audio().volume);
    check('audio: + + + caps at 100 %', Math.abs(v1 - 1) < 1e-6, v1);
    await tapEl(P, '#btnVolDown'); await sleep(100); await tapEl(P, '#btnVolDown'); await sleep(200);
    await page.reload(); await instrument(P);
    const v2 = await W(P, () => ({ vol: DD.debug.getState().settings.volume, a: DD.debug.audio().volume }));
    check('audio: volume 80 % persists across reload', Math.abs(v2.vol - 0.8) < 1e-6 && Math.abs(v2.a - 0.8) < 1e-6, v2);
    await tapEl(P, '#btnPlay'); await sleep(300); await tapEl(P, '#btnPause'); await sleep(200);
    check('audio: pause menu shows the saved 80 %', await W(P, () => document.getElementById('volLevel').textContent === '80%'));
    const as = await W(P, () => ({ type: navigator.audioSession ? navigator.audioSession.type : 'n/a' }));
    check(`audio: audioSession (${as.type}) — WebKit-only, n/a in Chromium (info)`, true);
    noErr(check, 'audio', P);
    await ctx.close();
  },
  // tap rules of the dig phase, all by touch
  async dig(check) {
    for (const [n, d] of [['iphoneP', DEV.iphoneP], ['ipadL', DEV.ipadL], ['iphoneL', DEV.iphoneL], ['ipadP', DEV.ipadP]]) {
      const P = await open(d, 'mute=1&seed=5&age=4');
      // ---- A. correct dig by ONE tap: dig → scoops → reveal → found → hatch → hop → shelved
      await startTopic(P, 'colors', 0, 'w.cfg.surpriseTypes = [];');
      let info = await W(P, () => { const w = DD.debug.world, s = w.stepInfo; return { target: s.targets[0], others: w.mounds.filter(m => m.id !== s.targets[0]).map(m => m.id), n: w.mounds.length, scoops: w.cur.scoops }; });
      await clearEv(P);
      await tap(P, await moundPt(P, info.target));
      await until(P, () => window.__ev.some(e => e.type === 'shelved'), null, 8000).catch(() => {});
      let ty = await evTypes(P);
      const seq = ['dig', 'scoop', 'reveal', 'found', 'hatch', 'hop', 'shelved'];
      let pos = -1; const order = seq.every(t => { const i = ty.indexOf(t, pos + 1); if (i < 0) return false; pos = i; return true; });
      check(`${n} dig: one real tap on the right mound → dig → scoop → reveal → found → hatch → hop → shelved`, order, ty);
      const sc = (await evs(P, 'scoop')).length;
      check(`${n} dig: ${info.scoops} scoops from one tap (the shovel keeps going)`, sc === info.scoops, sc);
      const ms = await W(P, id => { const w = DD.debug.world, m = w.moundById(id); return { state: m && m.state, shelf: w.shelfItems.length, dino: w.shelfItems[0] && w.shelfItems[0].dino }; }, info.target);
      check(`${n} dig: the mound is an empty hole, a dino is on the shelf`, ms.state === 'empty' && ms.shelf === 1 && !!ms.dino, ms);
      await until(P, () => window.__ev.some(e => e.type === 'roundDone'), null, 8000).catch(() => {});
      const rd = await evs(P, 'roundDone');
      check(`${n} dig: warm-up round done with 3 stars (no misses)`, rd.length === 1 && rd[0].stars === 3, rd);

      // ---- B. wrong dig + already + busy + Bun + sand + soft in a later round (≥ 3 mounds)
      await startTopic(P, 'colors', 1, 'w.cfg.surpriseTypes = []; w.round = 1;');
      info = await W(P, () => { const w = DD.debug.world, s = w.stepInfo; return { target: s.targets[0], others: w.mounds.filter(m => !s.targets.includes(m.id)).map(m => m.id), n: w.mounds.length, steps: w.cur.steps.length }; });
      const wrongId = info.others[0];
      let n0 = await vlen(P); await clearEv(P);
      // long press 1.3 s on a buried mound → soft hold, no dig
      const wp = await moundPt(P, wrongId);
      await touch(P, 'touchStart', [{ x: wp.x, y: wp.y, id: 1 }]); await sleep(1300); await touch(P, 'touchEnd'); await sleep(300);
      let sf = await evs(P, 'soft');
      check(`${n} soft: a 1.3 s press on a mound digs nothing (soft hold)`, sf.length === 1 && sf[0].kind === 'hold' && (await evs(P, 'dig')).length === 0, await evTypes(P));
      // drag 120 CSS px starting on a mound → soft drag
      await clearEv(P);
      await touch(P, 'touchStart', [{ x: wp.x, y: wp.y, id: 1 }]);
      for (let i = 1; i <= 8; i++) { await touch(P, 'touchMove', [{ x: wp.x + i * 15 * (wp.x > d.viewport.width / 2 ? -1 : 1), y: wp.y - i * 4, id: 1 }]); await sleep(15); }
      await touch(P, 'touchEnd'); await sleep(300);
      sf = await evs(P, 'soft');
      check(`${n} soft: a 120 px drag from a mound digs nothing (soft drag)`, sf.length === 1 && sf[0].kind === 'drag' && (await evs(P, 'dig')).length === 0, await evTypes(P));
      // a small 8 px wobble is still a tap → digs (use the wrong mound: this is our wrong dig)
      await clearEv(P);
      await touch(P, 'touchStart', [{ x: wp.x, y: wp.y, id: 1 }]); await touch(P, 'touchMove', [{ x: wp.x + 8, y: wp.y + 3, id: 1 }]); await sleep(60); await touch(P, 'touchEnd'); await sleep(250);
      check(`${n} tap: an 8 px wobble is still a tap (wrong mound starts digging)`, (await evs(P, 'dig')).length === 1, await evTypes(P));
      // tap another mound while digging → busy, no miss
      await tap(P, await moundPt(P, info.target)); await sleep(150);
      const bz = await evs(P, 'busy');
      check(`${n} busy: tapping another mound while digging → busy, no dig there`, bz.length === 1 && await W(P, id => DD.debug.world.moundById(id).state === 'buried', info.target), await evTypes(P));
      await until(P, () => window.__ev.some(e => e.type === 'wrong'), null, 6000).catch(() => {});
      const we = await evs(P, 'wrong');
      check(`${n} wrong: the wrong egg → wrong {kind:'thing'} once`, we.length === 1 && we[0].kind === 'thing' && we[0].id === wrongId, we);
      const st1 = await W(P, id => ({ misses: DD.debug.world.misses, state: DD.debug.world.state, phase: DD.debug.world.phase, m: DD.debug.world.moundById(id).state }), wrongId);
      check(`${n} wrong: 1 miss, the round goes on (no fail state), the egg stays in its open hole`, st1.misses === 1 && st1.state === 'round' && st1.phase === 'dig' && st1.m === 'open', st1);
      await sleep(300);
      let lg = await vlog(P, n0);
      const names = await W(P, ({ a, b }) => [DD.I18N.name('en', 'color', a), DD.I18N.name('en', 'color', b)], { a: we[0] && we[0].got && we[0].got.nameValue, b: we[0] && we[0].want && we[0].want.nameValue });
      check(`${n} wrong: the kind line names what was dug and the goal (${names.join(' → ')})`, lg.some(l => names.every(x => l.text.toLowerCase().includes(String(x).toLowerCase()))), lg);
      check(`${n} wrong: no negative words`, lg.every(l => !/\b(no|not|wrong|bad|oops|sorry|fail)\b/i.test(l.text)), lg);
      // tap the open hole → already (not a mistake)
      await sleep(1500); await clearEv(P);
      await tap(P, await moundPt(P, wrongId)); await sleep(300);
      check(`${n} already: tapping the open hole → already, still 1 miss`, (await evs(P, 'already')).length === 1 && (await evs(P, 'dig')).length === 0 && await W(P, () => DD.debug.world.misses === 1), await evTypes(P));
      // sand tap
      const sand = await W(P, () => {
        const w = DD.debug.world, L = w.layout, v = DD.debug.view(), B = w._bunBox();
        for (let y = L.groundY - 20; y > L.field.y0 - 30; y -= 13) for (let x = L.field.x0; x < L.field.x1; x += 13) {
          if (w._moundAt(x, y)) continue; if (x >= B.x && x <= B.x + B.w && y >= B.y && y <= B.y + B.h) continue;
          let near = false; for (const m of w.mounds) { const h = w.moundHit(m.id); if (Math.hypot(h.x - x, h.y - y) < h.r + 40) near = true; } if (near) continue;
          const p = DD.debug.toScreen(x, y); if (window.__probe(p).ok) return p;
        }
        return null;
      });
      if (sand) {
        await clearEv(P); const m0 = await W(P, () => DD.debug.world.misses);
        await tap(P, sand); await sleep(250);
        check(`${n} sand: tap on empty sand → sandTap, no line, no miss`, (await evs(P, 'sandTap')).length === 1 && await W(P, m => DD.debug.world.misses === m, m0), await evTypes(P));
      } else check(`${n} sand: found an empty sand spot to tap`, false, 'none');
      // tap Bun → the prompt again (needs > 3 s after the ask)
      await sleep(3200);
      n0 = await vlen(P); await clearEv(P);
      const bub = await W(P, () => document.getElementById('bubbleText').textContent);
      await tap(P, await W(P, () => DD.debug.bunScreen())); await sleep(350);
      lg = await vlog(P, n0);
      check(`${n} Bun: tap → pokeBun and the prompt is said again word for word`, (await evs(P, 'pokeBun')).length === 1 && lg.some(l => l.text === bub), { bub, lg, ev: await evTypes(P) });
      // the right mound, tapping along → digs faster
      await clearEv(P);
      const tp = await moundPt(P, info.target);
      const tStart = Date.now();
      await tap(P, tp, 50);
      for (let i = 0; i < 5; i++) { await sleep(110); await tap(P, tp, 50); }
      await until(P, () => window.__ev.some(e => e.type === 'reveal'), null, 6000).catch(() => {});
      const dg = await evs(P, 'dig'), rv = await evs(P, 'reveal');
      const fastT = rv.length && dg.length ? rv[0].wt - dg[0].wt : null;
      check(`${n} faster: re-tapping the digging mound → dig{again, added} and the reveal comes sooner (${fastT && fastT.toFixed(2)} s vs 1.60 s single)`, dg.some(e => e.again && e.added) && fastT != null && fastT < 1.3, { dg: dg.map(e => [e.again, e.added, e.queued]), fastT, wall: Date.now() - tStart });
      check(`${n} faster: extra taps on the digging mound are not busy / misses`, (await evs(P, 'busy')).length === 0 && await W(P, () => DD.debug.world.misses === 1));
      const done = await playRoundByTouch(P);
      await until(P, () => window.__ev.some(e => e.type === 'roundDone'), null, 10000).catch(() => {});
      const rd2 = await evs(P, 'roundDone');
      check(`${n} wrong: round finishes by touch; the star count is lower (2 stars after 1 miss)`, done && rd2.length === 1 && rd2[0].stars === 2, { done, rd2, steps: info.steps });
      await sleep(1600);
      const hs = await W(P, () => ({ hud: +document.getElementById('hudStars').textContent, w: DD.debug.world.stars }));
      check(`${n} stars: HUD shows 3 + 2 = 5 = world.stars`, hs.hud === 5 && hs.w === 5, hs);
      check(`${n} stars never drop`, (await W(P, () => window.__drops)).length === 0);
      noErr(check, n + ' dig', P);
      await P.ctx.close();
    }
  },
  async count(check) {
    for (const [n, d, age, L] of [['ipadP', DEV.ipadP, 4, 'en'], ['iphoneL', DEV.iphoneL, 5, 'vi'], ['iphoneP', DEV.iphoneP, 6, 'en']]) {
      const P = await open(d, `mute=1&seed=7&age=${age}&lang=${L}`);
      await startTopic(P, 'count', 1, 'w.cfg.surpriseTypes = []; w.round = 2;');
      const info = await W(P, () => { const w = DD.debug.world, s = w.stepInfo; return { need: s.need, targets: s.targets.slice(), mode: s.mode, n: w.mounds.length, steps: w.cur.steps.map(x => x.mode) }; });
      check(`${n} count: count step with N + spares (N ${info.need}, mounds ${info.n})`, info.mode === 'count' && info.n > info.need, info);
      const n0 = await vlen(P); await clearEv(P);
      for (let i = 0; i < info.need; i++) {
        await tap(P, await moundPt(P, info.targets[i]));
        await until(P, k => window.__ev.filter(e => e.type === 'found').length >= k, i + 1, 8000).catch(() => {});
        if (i === 0) {
          await sleep(1200);
          await tap(P, await moundPt(P, info.targets[0])); await sleep(250);
          check(`${n} count: re-tapping a dug hole → already, not counted`, (await evs(P, 'already')).length >= 1 && await W(P, () => DD.debug.world.misses === 0), await evTypes(P));
        }
      }
      await until(P, () => window.__ev.some(e => e.type === 'stepDone'), null, 8000).catch(() => {});
      const fe = (await evs(P, 'found')).filter(e => e.count);
      check(`${n} count: N finds counted 1..N`, fe.length === info.need && fe.every((e, i) => e.count.i === i + 1 && e.count.n === info.need), fe.map(e => e.count));
      const after = await W(P, t => ({ st: DD.debug.world.state, spares: t.map(id => DD.debug.world.moundById(id) && DD.debug.world.moundById(id).state) }), info.targets.slice(info.need));
      check(`${n} count: the step ends at N, the spares stay buried`, (await evs(P, 'stepDone')).length >= 1 && after.spares.every(s => s === 'buried'), after);
      await sleep(800);
      const lg = await vlog(P, n0), words = await W(P, ({ N, L }) => { const a = []; for (let i = 1; i <= N; i++) a.push(DD.I18N.sayCount(L, i)); return a; }, { N: info.need, L });
      check(`${n} count: counted aloud in ${L} (${words.join(' ')})`, words.every(w => lg.some(l => l.text === w && l.lang === L)), { words, lg: lg.map(l => l.text) });
      const ok = await playRoundByTouch(P);
      check(`${n} count: the round finishes by touch`, ok);
      noErr(check, n + ' count', P);
      await P.ctx.close();
    }
  },
  // help: hint after 2 taps without progress, assist after 4 (age 4), idle nudge, bubble tap repeats
  async help(check) {
    for (const [n, d] of [['iphoneP', DEV.iphoneP], ['ipadL', DEV.ipadL]]) {
      const P = await open(d, 'mute=1&seed=9&age=4');
      await startTopic(P, 'animals', 1, 'w.cfg.surpriseTypes = []; w.round = 1;');
      const want = await W(P, () => DD.debug.world.stepInfo.targets[0]);
      const sand = await W(P, () => {
        const w = DD.debug.world, L = w.layout, B = w._bunBox();
        for (let y = L.groundY - 20; y > L.field.y0 - 30; y -= 13) for (let x = L.field.x1; x > L.field.x0; x -= 13) {
          if (w._moundAt(x, y)) continue; if (x >= B.x && x <= B.x + B.w && y >= B.y && y <= B.y + B.h) continue;
          let near = false; for (const m of w.mounds) { const h = w.moundHit(m.id); if (Math.hypot(h.x - x, h.y - y) < h.r + 30) near = true; } if (near) continue;
          if (!w._inField(x, y)) continue;
          const p = DD.debug.toScreen(x, y); if (window.__probe(p).ok) return p;
        }
        return null;
      });
      if (!sand) { check(`${n} help: an empty sand spot inside the dig site exists`, false); await P.ctx.close(); continue; }
      await clearEv(P);
      await tap(P, sand); await sleep(150);
      check(`${n} hint: none after 1 sand tap`, (await evs(P, 'hint')).length === 0);
      await tap(P, sand); await sleep(250);
      const h = await evs(P, 'hint');
      const g = await W(P, id => ({ glow: DD.debug.world.moundById(id).glow, hand: !!DD.debug.world.hintHand }), want);
      check(`${n} hint: 2nd tap without progress → hint on the right mound, glow + ghost hand`, h.length === 1 && h[0].id === want && g.glow > 0.1 && g.hand, { h, g });
      for (let i = 0; i < 2; i++) { await tap(P, sand); await sleep(120); }
      await clearEv(P);
      await tap(P, sand); await sleep(300);
      const as = await evs(P, 'assist'), dg = await evs(P, 'dig');
      check(`${n} assist: after 4 taps (assistAfter, ages ≤ 4) without progress a sand tap digs the right mound`, as.length === 1 && as[0].id === want && dg.length === 1 && dg[0].id === want && dg[0].assist, await evTypes(P));
      check(`${n} assist: sand taps are never misses`, await W(P, () => DD.debug.world.misses === 0));
      await until(P, () => window.__ev.some(e => e.type === 'found'), null, 6000).catch(() => {});
      check(`${n} assist: the assisted dig is found`, (await evs(P, 'found')).length === 1);
      // idle nudge (speed 6 → ~2 s real) and bubble tap
      await startTopic(P, 'shapes', 2, 'w.cfg.surpriseTypes = [];');
      await clearEv(P); let n0 = await vlen(P);
      await W(P, () => DD.debug.setSpeed(6));
      await until(P, () => window.__ev.some(e => e.type === 'idle'), null, 15000).catch(() => {});
      await W(P, () => DD.debug.setSpeed(1));
      const bub = await W(P, () => document.getElementById('bubbleText').textContent);
      check(`${n} idle: nudge after ~12 s without a touch, logged with the prompt (voice is log-only at speed > 1)`, (await evs(P, 'idle')).length >= 1, await evTypes(P));
      await sleep(3300);
      n0 = await vlen(P);
      await tapEl(P, '#bubble'); await sleep(300);
      const lg = await vlog(P, n0);
      check(`${n} bubble: a tap on the speech bubble repeats the prompt`, lg.some(l => l.text === bub), { bub, lg });
      check(`${n} bubble: the bubble tap does not reach the canvas`, (await evs(P, 'sandTap')).length === 0 && (await evs(P, 'dig')).length === 0);
      noErr(check, n + ' help', P);
      await P.ctx.close();
    }
  },
  async talk(check) {
    for (const [n, d, L] of [['iphoneL', DEV.iphoneL, 'en'], ['ipadP', DEV.ipadP, 'vi'], ['iphoneP', DEV.iphoneP, 'en'], ['ipadL', DEV.ipadL, 'en']]) {
      const P = await open(d, `mute=1&seed=8&age=4&lang=${L}`);
      for (const [right, topic] of [[true, 'shapes'], [false, 'count']]) {
        await startTopic(P, topic, right ? 1 : 2, 'w.cfg.surpriseTypes = [];');
        const s0 = await W(P, () => DD.debug.world.stars);
        await W(P, () => DD.debug.world._startTalk());   // forced via world internals (Talk normally follows round 4)
        await until(P, () => DD.debug.mode === 'talk');
        await sleep(500);
        const b = await W(P, r => {
          const w = DD.debug.world, btn = [...document.querySelectorAll('#talkChoices button')];
          const t = btn.find(x => r ? x.dataset.id === String(w.talk.answer) : x.dataset.id !== String(w.talk.answer));
          const q = t.getBoundingClientRect(), vis = btn.every(x => { const g = x.getBoundingClientRect(); return g.top >= 0 && g.bottom <= innerHeight && g.left >= 0 && g.right <= innerWidth && g.width >= 60 && g.height >= 60; });
          const e = document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2);
          return { p: { x: q.x + q.width / 2, y: q.y + q.height / 2 }, vis, el: !!(e && e.closest('button') === t), n: btn.length, sizes: btn.map(x => Math.round(x.getBoundingClientRect().width) + 'x' + Math.round(x.getBoundingClientRect().height)) };
        }, right);
        check(`${n} talk ${topic}: every choice on screen, ≥ 60 px, tappable`, b.vis && b.el, b);
        await clearEv(P);
        const n0 = await vlen(P);
        await tap(P, b.p); await sleep(400);
        const r = await evs(P, 'talkResult');
        check(`${n} talk ${topic}: tap the ${right ? 'right' : 'other'} answer → talkResult correct=${right}`, r.length === 1 && r[0].correct === right && !r[0].auto, r);
        await tap(P, b.p); await sleep(200);
        check(`${n} talk ${topic}: a second tap does not answer twice`, (await evs(P, 'talkResult')).length === 1);
        const lg = await vlog(P, n0);
        check(`${n} talk ${topic}: ${right ? 'praise' : 'kind'} line in ${L}, clean`, lg.length >= 1 && lg.every(l => l.lang === L && !/undefined|\{|\}|NaN/.test(l.text)) && lg.every(l => !/\b(no|not|wrong|oops)\b/i.test(l.text)), lg);
        await sleep(2600);
        const s1 = await W(P, () => DD.debug.world.stars);
        check(`${n} talk ${topic}: stars ${right ? '+1' : 'unchanged'} (${s0} → ${s1})`, s1 === s0 + (right ? 1 : 0));
        check(`${n} talk ${topic}: Talk time closes, play goes on`, await W(P, () => DD.debug.mode === 'play' && DD.debug.world.state !== 'talk' && document.getElementById('scrTalk').classList.contains('hidden')), await state(P));
      }
      noErr(check, n + ' talk', P);
      await P.ctx.close();
    }
  },
  async pause(check) {
    const P = await open(DEV.iphoneL, 'mute=1&seed=9&age=4');
    await startTopic(P, 'colors', 0, 'w.cfg.surpriseTypes = [];');
    await tapEl(P, '#btnPause'); await sleep(300);
    check('pause: pause button tap → paused, pause screen shown', await W(P, () => DD.debug.mode === 'paused' && !document.getElementById('scrPause').classList.contains('hidden')));
    const t0 = await W(P, () => DD.debug.world.time); await sleep(500);
    check('pause: world frozen', await W(P, t => DD.debug.world.time === t, t0));
    await clearEv(P);
    const a = await W(P, () => DD.debug.world.stepInfo.targets[0]);
    await tap(P, await moundPt(P, a)); await sleep(200);
    check('pause: a tap where the mound is does not dig', (await evs(P, 'dig')).length === 0 && await W(P, () => DD.debug.mode === 'paused'));
    await tapEl(P, '#btnResume'); await sleep(500);
    check('pause: Resume → play, the prompt is repeated', await W(P, () => DD.debug.mode === 'play') && (await evs(P, 'ask')).length + (await vlog(P)).length > 0);
    // pause mid-dig: the dig waits and then completes
    await clearEv(P);
    await tap(P, await moundPt(P, a)); await sleep(250);
    await tapEl(P, '#btnPause'); await sleep(600);
    const dp = await W(P, () => ({ dig: !!DD.debug.world.dig, ev: window.__ev.map(e => e.type) }));
    await tapEl(P, '#btnResume');
    await until(P, () => window.__ev.some(e => e.type === 'found'), null, 6000).catch(() => {});
    check('pause mid-dig: the dig holds while paused and completes after Resume', dp.dig && !dp.ev.includes('reveal') && (await evs(P, 'found')).length === 1, { dp, ev: await evTypes(P) });
    // visibilitychange
    await startTopic(P, 'shapes', 1, 'w.cfg.surpriseTypes = [];');
    const hide = (h) => W(P, h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')); }, h);
    await hide(true); await sleep(200);
    check('visibility: hidden → paused', await W(P, () => DD.debug.mode === 'paused'));
    await hide(false); await sleep(200);
    check('visibility: visible again → stays paused until Resume', await W(P, () => DD.debug.mode === 'paused'));
    await tapEl(P, '#btnResume'); await sleep(300);
    await clearEv(P);
    await tap(P, await moundPt(P, await W(P, () => DD.debug.answer().mound))); await sleep(300);
    check('visibility: after Resume a real tap digs again', (await evs(P, 'dig')).length === 1);
    // Talk time: pause button reachable and hide → paused → back to Talk
    await until(P, () => DD.debug.world.state === 'round' && !DD.debug.world.dig, null, 8000).catch(() => {});
    await W(P, () => DD.debug.world._startTalk()); await until(P, () => DD.debug.mode === 'talk');
    check('pause: the pause button is reachable during Talk time', await W(P, () => { const b = document.getElementById('btnPause'), r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.width > 0 && !!e && !!e.closest('#btnPause'); }));
    await hide(true); await sleep(150); await hide(false); await sleep(150);
    check('pause: Talk time pauses on hide', await W(P, () => DD.debug.mode === 'paused'));
    await tapEl(P, '#btnResume'); await sleep(300);
    check('pause: Resume returns to Talk time with its choices', await W(P, () => DD.debug.mode === 'talk' && !document.getElementById('scrTalk').classList.contains('hidden') && document.querySelectorAll('#talkChoices button').length > 1));
    noErr(check, 'pause', P);
    await P.ctx.close();
  },
  async rotate(check) {
    const pairs = [['iphone P→L', DEV.iphoneP, DEV.iphoneL], ['iphone L→P', DEV.iphoneL, DEV.iphoneP], ['ipad L→P', DEV.ipadL, DEV.ipadP], ['ipad P→L', DEV.ipadP, DEV.ipadL]];
    for (const [n, d1, d2] of pairs) {
      const P = await open(d1, 'mute=1&seed=11&age=5');
      await startTopic(P, 'shapes', 1, 'w.cfg.surpriseTypes = []; w.round = 2;');
      const nm = await W(P, () => DD.debug.world.mounds.length);
      const a = await W(P, () => DD.debug.answer().mound);
      await clearEv(P);
      await tap(P, await moundPt(P, a)); await sleep(350);
      const mid = await W(P, id => ({ dig: !!DD.debug.world.dig, d: DD.debug.world.moundById(id).dig }), a);
      await P.page.setViewportSize(d2.viewport); await sleep(700);
      const L = await W(P, () => ({ W: DD.debug.world.layout.W, H: DD.debug.world.layout.H, portrait: DD.debug.world.layout.portrait }));
      check(`${n} rotate mid-dig (dig ${mid.d.toFixed(2)}): layout re-flows to the new orientation`, mid.dig && (L.W > L.H) === (d2.viewport.width > d2.viewport.height), { mid, L });
      const pr = await W(P, () => { const w = DD.debug.world, bad = []; for (const m of w.mounds) { const r = window.__probe(DD.debug.moundScreen(m.id)); if (!r.ok) bad.push({ id: m.id, r }); if (m.x - m.w / 2 < 0 || m.x + m.w / 2 > w.layout.W) bad.push({ id: m.id, off: [m.x, m.w] }); } const S = w.shovel; return { bad, sh: { x: S.x, y: S.y, st: S.state } }; });
      check(`${n} rotate: all ${nm} mounds inside the new screen, tap points clear of HUD/bubble/shelf`, pr.bad.length === 0, pr.bad.slice(0, 3));
      await until(P, () => window.__ev.some(e => e.type === 'found' || e.type === 'wrong'), null, 6000).catch(() => {});
      await until(P, () => window.__ev.some(e => e.type === 'shelved'), null, 6000).catch(() => {});
      const sh = await W(P, id => { const w = DD.debug.world, s = w.layout.shelf; return { found: window.__ev.some(e => e.type === 'found' && e.id === id), shelved: window.__ev.some(e => e.type === 'shelved'), items: w.shelfItems.map(i => [Math.round(i.x), Math.round(i.y)]), shelf: [s.x, s.y, s.w, s.h] }; }, a);
      check(`${n} rotate: the running dig completes (found + shelved)`, sh.found && sh.shelved, sh);
      check(`${n} rotate: shelf items sit on the new shelf`, sh.items.every(([x, y]) => x >= sh.shelf[0] && x <= sh.shelf[0] + sh.shelf[2] && y >= sh.shelf[1] && y <= sh.shelf[1] + sh.shelf[3] + 4), sh);
      // rotate back while a second dig runs, then finish the round
      const b = await W(P, () => { const x = DD.debug.answer(); return x && x.mound; });
      if (b) { await tap(P, await moundPt(P, b)); await sleep(200); await P.page.setViewportSize(d1.viewport); await sleep(700); }
      const ok = await playRoundByTouch(P);
      await until(P, () => window.__ev.some(e => e.type === 'roundDone'), null, 10000).catch(() => {});
      check(`${n} rotate back mid-dig: the round still finishes by touch (roundDone)`, ok && (await evs(P, 'roundDone')).length >= 1);
      noErr(check, n + ' rotate', P);
      await P.ctx.close();
    }
  },
  async multi(check) {
    for (const [n, d] of [['ipadL', DEV.ipadL], ['iphoneP', DEV.iphoneP]]) {
      const P = await open(d, 'mute=1&seed=15&age=4');
      await startTopic(P, 'colors', 1, 'w.cfg.surpriseTypes = []; w.round = 1;');
      const ids = await W(P, () => { const w = DD.debug.world, t = w.stepInfo.targets[0]; return { right: t, wrong: w.mounds.find(m => m.id !== t).id }; });
      const right = await moundPt(P, ids.right), wrong = await moundPt(P, ids.wrong);
      const rest = await W(P, () => { const L = DD.debug.world.layout; return DD.debug.toScreen(L.W / 2, L.H - 6); });
      await clearEv(P);
      // finger 1 rests, finger 2 taps the right mound → ignored
      await touch(P, 'touchStart', [{ x: rest.x, y: rest.y, id: 1 }]); await sleep(60);
      await touch(P, 'touchStart', [{ x: rest.x, y: rest.y, id: 1 }, { x: right.x, y: right.y, id: 2 }]); await sleep(70);
      await touch(P, 'touchMove', [{ x: rest.x, y: rest.y, id: 1 }]); await sleep(60);
      await touch(P, 'touchEnd'); await sleep(400);
      check(`${n} multi: a second finger on a mound is ignored (no dig)`, (await evs(P, 'dig')).length === 0, await evTypes(P));
      // finger 1 on the right mound, finger 2 on a wrong one → one dig, no mistake
      await clearEv(P);
      await touch(P, 'touchStart', [{ x: right.x, y: right.y, id: 1 }]); await sleep(40);
      await touch(P, 'touchStart', [{ x: right.x, y: right.y, id: 1 }, { x: wrong.x, y: wrong.y, id: 2 }]); await sleep(40);
      await touch(P, 'touchEnd'); await sleep(2400);
      const ds = await evs(P, 'dig');
      check(`${n} multi: first finger digs, the second makes no dig and no mistake`, ds.length === 1 && ds[0].id === ids.right && (await evs(P, 'wrong')).length === 0 && (await evs(P, 'busy')).length === 0, await evTypes(P));
      noErr(check, n + ' multi', P);
      await P.ctx.close();
    }
  },
  async surprise(check) {
    for (const [n, d] of Object.entries(DEV)) {
      for (const kind of ['mole', 'ptero']) {
        const P = await open(d, 'mute=1&seed=14&age=4');
        // forced: the surprise type and round via world.cfg / _surpriseRound (one surprise round per chapter normally)
        await startTopic(P, 'animals', 1, `w.cfg.surpriseTypes = ['${kind}']; w._surpriseRound = 1; w.round = 1;`);
        const got = await W(P, () => DD.debug.world.surprise);
        const fn = kind === 'mole' ? () => !!DD.debug.moleScreen() : () => { const p = DD.debug.pteroScreen(); return !!p && p.x > 60 && p.x < innerWidth - 60; };
        let seen = true;
        await until(P, fn, null, 20000).catch(() => { seen = false; });
        if (!seen) { check(`${n} ${kind}: surprise appears and becomes tappable (round surprise=${got})`, false, await W(P, () => ({ mole: DD.debug.world.mole, ptero: DD.debug.world.ptero && { x: DD.debug.world.ptero.x, y: DD.debug.world.ptero.y }, L: DD.debug.world.layout.pteroY, ev: window.__ev.map(e => e.type) }))); await P.ctx.close(); continue; }
        await sleep(kind === 'mole' ? 300 : 0);
        const p = await W(P, k => { if (k === 'mole') return DD.debug.moleScreen(); const q = DD.debug.pteroScreen(), pt = DD.debug.world.ptero, s = DD.debug.view().s; return { x: q.x + pt.dir * 170 * 0.06 * s, y: q.y, r: q.r }; }, kind);
        const pr = await W(P, p => window.__probe(p), p);
        check(`${n} ${kind}: tap point on screen, clear of HUD/bubble, hits the canvas`, pr.inside && !pr.domHud && !pr.domBubble && pr.el === 'game', pr);
        const s0 = await W(P, () => ({ stars: DD.debug.world.stars, misses: DD.debug.world.misses, noProg: DD.debug.world._noProg }));
        await clearEv(P);
        const n0 = await vlen(P);
        await tap(P, p); await sleep(400);
        const tapEv = kind + 'Tap';
        check(`${n} ${kind}: real tap → ${tapEv}`, (await evs(P, tapEv)).length === 1, await evTypes(P));
        const s1 = await W(P, () => ({ stars: DD.debug.world.stars, misses: DD.debug.world.misses, noProg: DD.debug.world._noProg }));
        check(`${n} ${kind}: no score / miss / no-progress change, no dig`, JSON.stringify(s0) === JSON.stringify(s1) && (await evs(P, 'wrong')).length === 0 && (await evs(P, 'dig')).length === 0 && (await evs(P, 'sandTap')).length === 0, { s0, s1 });
        const lg = await vlog(P, n0);
        check(`${n} ${kind}: a tap line is logged`, lg.length >= 1, lg);
        const ok = await playRoundByTouch(P);
        check(`${n} ${kind}: round still finishes by touch`, ok);
        noErr(check, `${n} ${kind}`, P);
        await P.ctx.close();
      }
    }
  },
  async bots(check) {
    const jobs = [];
    const devs = Object.entries(DEV);
    let k = 0;
    for (const age of [3, 4, 5, 6, 7]) for (const [dn, dev] of devs) jobs.push({ age, dn, dev, lang: (k++ % 2) ? 'vi' : 'en' });
    const run = async j => {
      const P = await open(j.dev, `mute=1&seed=${30 + j.age}&age=${j.age}&lang=${j.lang}&speed=8&bot=1&autostart=1`);
      const t0 = Date.now();
      let ok = true, info = null;
      try { await P.page.waitForFunction(() => DD.debug.mode === 'done', null, { timeout: 300000, polling: 250 }); }
      catch (e) { ok = false; info = await W(P, () => DD.debug.getState()); }
      await sleep(1200);
      const r = await W(P, L => {
        const sd = window.__ev.filter(e => e.type === 'sessionDone')[0];
        const lines = DD.debug.voiceLog.map(x => x.text);
        const ty = {}; window.__ev.forEach(e => { ty[e.type] = (ty[e.type] || 0) + 1; });
        const done = document.getElementById('scrDone'), btn = document.getElementById('btnAgain').getBoundingClientRect();
        return { sd: sd && sd.stars, world: DD.debug.world.stars, hud: +document.getElementById('hudStars').textContent, done: +document.getElementById('doneStars').textContent,
          doneShown: !done.classList.contains('hidden'), againOn: btn.width > 0 && btn.bottom <= innerHeight,
          drops: window.__drops, stats: DD.debug.stats, wrongLang: DD.debug.voiceLog.filter(x => x.lang !== L).length,
          badLines: lines.filter(t => !t.trim() || /[{}]|undefined|NaN|\bnull\b/.test(t)).slice(0, 3), vi: lines.filter(t => /[ạàáảãđươ]/i.test(t)).length, lines: lines.length,
          levels: ty.level, talks: ty.talk, surprises: (ty.mole || 0) + (ty.ptero || 0) };
      }, j.lang);
      const tag = `bot ${j.dn} ${j.lang} age ${j.age}`;
      check(`${tag}: reaches the done screen (${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.stats.rounds} rounds, ${r.talks} talks, ${r.surprises} surprises)`, ok && r.doneShown && r.againOn, info || r);
      check(`${tag}: 4 chapters × 4 rounds, Talk time after each chapter`, r.stats.rounds === 16 && r.talks === 4, { rounds: r.stats.rounds, talks: r.talks });
      check(`${tag}: stars only go up; sessionDone = world = HUD = done panel (${r.sd})`, r.drops.length === 0 && r.sd === r.world && r.done === r.sd, r);
      check(`${tag}: voice lines clean and all in ${j.lang}`, r.badLines.length === 0 && r.wrongLang === 0 && (j.lang === 'vi' ? r.vi > r.lines * 0.5 : r.vi === 0), r);
      noErr(check, tag, P);
      await P.ctx.close();
    };
    const q = jobs.slice();
    await Promise.all(Array.from({ length: 3 }, async () => { while (q.length) await run(q.shift()); }));
  }
};

(async () => {
  srv = await serve(); browser = await chromium.launch();
  for (const n of Object.keys(G)) {
    if (ONLY.length && !ONLY.includes(n)) continue;
    const log = [];
    const check = (name, ok, info) => { results.push({ group: n, name, ok: !!ok, info: ok ? '' : info }); log.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + JSON.stringify(info).slice(0, 700))); };
    const t0 = Date.now();
    try { await G[n](check); } catch (e) { check(`${n}: group crashed`, false, String(e && e.stack || e).slice(0, 700)); }
    console.log(`[${n}] ${((Date.now() - t0) / 1000).toFixed(0)} s\n  ` + log.join('\n  '));
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed` + (fails.length ? `, ${fails.length} FAILED` : ''));
  process.exit(fails.length ? 1 : 0);
})();
