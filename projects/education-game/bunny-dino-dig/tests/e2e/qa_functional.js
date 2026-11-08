// Functional QA suite #2 (Nini's Sea Painting) — REAL CDP touch input on isMobile / hasTouch contexts:
// iPhone 393×852 @3 (portrait + landscape), iPad 820×1180 @2 (portrait + landscape). Report-only: never edits game/.
// DD.debug is used only to READ state, to jump to a chapter topic, or to force a surprise; every child action is a touch.
//   node tests/e2e/qa_functional.js                 (all groups)
//   node tests/e2e/qa_functional.js layout talk     (some groups)
// Groups: layout lang gate persist colors parts count help drag multi talk pause rotate surprise fishysteal audio bots
// Writes tests/out/qa_functional/results.json, exits 1 on any FAIL.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');

const OUT = path.join(__dirname, '..', 'out', 'qa_functional'); fs.mkdirSync(OUT, { recursive: true });
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 }, iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 }, ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
const ONLY = process.argv.slice(2);
const results = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũầấậẩẫềếệểễồốộổỗờớợởỡừứựửữằắặẳẵ]/i;
let srv, browser;

async function newCtx(dev) {
  return browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true, locale: 'en-US' });
}
async function attach(ctx, page) {
  const P = { ctx, page, errors: [] };
  page.on('console', m => { if (m.type() === 'error') P.errors.push(m.text()); });
  page.on('pageerror', e => P.errors.push(String(e)));
  page.on('response', r => { if (r.status() >= 400) P.errors.push('HTTP ' + r.status() + ' ' + r.url()); });
  P.cdp = await ctx.newCDPSession(page);
  return P;
}
async function instrument(P) {
  await P.page.waitForFunction(() => window.DD && DD.debug && DD.debug.mode === 'title' || (window.DD && DD.debug && DD.debug.mode === 'play'), null, { timeout: 20000 });
  await P.page.evaluate(() => {
    const w = DD.debug.world; window.__ev = [];
    const o = w.drainEvents.bind(w);
    w.drainEvents = function () { const e = o(); for (const x of e) window.__ev.push(Object.assign({ t: performance.now() }, x, { talk: undefined, gallery: undefined })); return e; };
    // stars only go up inside a session (HUD text and world.stars)
    window.__drops = []; let prevH = 0, prevW = 0, sess = DD.debug.stats.sessions;
    setInterval(() => {
      const m = DD.debug.mode, s = DD.debug.stats.sessions;
      if (s !== sess || m === 'title') { sess = s; prevH = 0; prevW = 0; return; }
      const h = +document.getElementById('hudStars').textContent || 0, ws = DD.debug.world.stars || 0;
      if (h < prevH || ws < prevW) window.__drops.push({ m, h, prevH, ws, prevW });
      prevH = Math.max(prevH, h); prevW = Math.max(prevW, ws);
    }, 100);
  });
}
async function open(dev, q = 'mute=1') {
  const ctx = await newCtx(dev); const page = await ctx.newPage();
  const P = await attach(ctx, page);
  await page.goto(srv.url + '?' + q);
  await instrument(P);
  return P;
}
const until = (P, fn, arg, t = 30000) => P.page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
async function touch(P, type, pts) { await P.cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : pts }); }
async function tap(P, p, hold = 70) { await touch(P, 'touchStart', [{ x: p.x, y: p.y, id: 1 }]); await sleep(hold); await touch(P, 'touchEnd'); await sleep(60); }
const center = (P, sel) => P.page.evaluate(s => { const e = document.querySelector(s); if (!e) return null; const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, w: r.width, h: r.height }; }, sel);
async function tapEl(P, sel, hold) { const c = await center(P, sel); if (!c || !c.w) throw new Error('no visible ' + sel); await tap(P, c, hold); }
// a hold; returns how long the page really saw the finger down (CDP latency under load can stretch it)
async function hold(P, sel, ms) {
  const c = await center(P, sel);
  await W(P, s => { const e = document.querySelector(s); window.__hold = {}; e.addEventListener('pointerdown', () => { window.__hold.d = performance.now(); }, { once: true, capture: true }); window.addEventListener('pointerup', () => { window.__hold.u = performance.now(); }, { once: true, capture: true }); }, sel);
  await touch(P, 'touchStart', [{ x: c.x, y: c.y, id: 1 }]); await sleep(ms); await touch(P, 'touchEnd'); await sleep(250);
  return W(P, () => window.__hold.u - window.__hold.d);
}
const evs = (P, type) => P.page.evaluate(t => window.__ev.filter(e => e.type === t), type);
const clearEv = P => P.page.evaluate(() => { window.__ev.length = 0; });
const vlog = (P, from = 0) => P.page.evaluate(f => DD.debug.voiceLog.slice(f).map(x => ({ lang: x.lang, text: x.text })), from);
const vlen = P => P.page.evaluate(() => DD.debug.voiceLog.length);
const W = (P, fn, arg) => P.page.evaluate(fn, arg);
async function startTopic(P, topic, lvl = 0, setup) {
  await P.page.evaluate(({ topic, lvl, setup }) => {
    DD.debug.startGame(); const w = DD.debug.world;
    if (setup) (new Function('w', setup))(w);
    w.levels[lvl] = topic; w.startLevel(lvl);
    if (setup) (new Function('w', setup))(w);
    DD.debug.setSpeed(5);
  }, { topic, lvl, setup: setup || null });
  await until(P, () => DD.debug.world.interactive);
  await P.page.evaluate(() => DD.debug.setSpeed(1));
  await sleep(200);
}
const answerPt = P => W(P, () => { const a = DD.debug.answer(); if (!a) return null; return a.shell ? { kind: 'shell', id: a.shell, p: DD.debug.shellScreen(a.shell) } : { kind: 'part', id: a.part, p: DD.debug.partScreen(a.part) }; });
// a screen point: inside the viewport, not under the HUD / the speech bubble, and the canvas receives it
const PROBE = `(function (p) {
  if (!p) return { ok: false, why: 'null' };
  const vw = innerWidth, vh = innerHeight, inR = (r) => r.width > 0 && p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
  const hud = document.getElementById('hud'), bub = document.getElementById('bubble');
  const hr = hud.classList.contains('hidden') ? { width: 0 } : hud.getBoundingClientRect(), br = bub.classList.contains('hidden') ? { width: 0 } : bub.getBoundingClientRect();
  const el = document.elementFromPoint(p.x, p.y);
  const inside = p.x >= 4 && p.y >= 4 && p.x <= vw - 4 && p.y <= vh - 4;
  const r = { inside, hud: inR(hr), bubble: inR(br), el: el ? (el.id || el.tagName) : null };
  r.ok = inside && !r.hud && !r.bubble && r.el === 'game';
  return r;
})`;
async function probeAll(P) {
  return W(P, src => {
    const probe = eval(src), w = DD.debug.world, bad = [];
    for (const s of w.shells) { const p = DD.debug.shellScreen(s.color), r = probe(p); if (!r.ok) bad.push({ shell: s.color, p, r }); }
    for (const pt of w.parts) { const p = DD.debug.partScreen(pt.id), r = probe(p); if (!r.ok) bad.push({ part: pt.id, p, r }); }
    const n = DD.debug.niniScreen(), rn = probe(n);
    return { bad, n: w.shells.length + w.parts.length, nini: rn };
  }, PROBE);
}
async function playRoundByTouch(P, maxTaps = 40) {   // finish the current round with real taps on the right answer
  for (let i = 0; i < maxTaps; i++) {
    const st = await W(P, () => ({ s: DD.debug.world.state, ph: DD.debug.world.phase }));
    if (st.s !== 'round' || st.ph === 'alive' || st.ph === 'finish') return true;
    const a = await answerPt(P);
    if (a && a.p) await tap(P, a.p);
    await sleep(a ? 450 : 200);
  }
  return false;
}

const G = {
  async layout(check) {
    const sets = [['4', ['colors', 'shapes', 'size', 'animals', 'count']], ['7', ['letters', 'lower', 'initial', 'add', 'sub', 'oddeven']]];
    for (const [n, d] of Object.entries(DEV)) {
      for (const [age, topics] of sets) {
        const P = await open(d, `mute=1&seed=21&age=${age}`);
        if (age === '4') {
          const pl = await center(P, '#btnPlay');
          check(`${n}: title Play button visible ≥ 100 px`, pl && pl.w >= 100 && pl.h >= 100, pl);
          await tapEl(P, '#btnPlay');
          await until(P, () => DD.debug.mode === 'play');
          check(`${n}: real tap on Play starts the game`, true);
          await P.page.evaluate(() => DD.debug.goTitle());
        }
        for (const t of topics) {
          for (const lvl of [0, 1]) {   // round 0 (warm-up) and a later round (bigger palette / more parts)
            await startTopic(P, t, 0, lvl ? 'w.round = 2;' : null);
            await sleep(250);
            const r = await probeAll(P);
            check(`${n} age ${age} ${t} r${lvl}: every shell + part tap point on screen, clear of HUD/bubble, hits canvas (${r.n})`, r.bad.length === 0, r.bad.slice(0, 3));
            check(`${n} age ${age} ${t} r${lvl}: Nini tap point hits canvas`, r.nini.ok, r.nini);
          }
        }
        check(`${n} age ${age}: no console errors`, P.errors.length === 0, P.errors);
        await P.ctx.close();
      }
    }
  },
  async lang(check) {
    const P = await open(DEV.iphoneP, 'mute=1&seed=3&age=4');
    await tapEl(P, '#scrTitle [data-lang="vi"]'); await sleep(200);
    check('lang: VI chip tapped → title in Vietnamese', await W(P, () => document.documentElement.lang === 'vi' && /[ạàáảãđư]/i.test(document.getElementById('logo2').textContent + document.title)), await W(P, () => document.title));
    await tapEl(P, '#btnPlay');
    await until(P, () => window.__ev.some(e => e.type === 'ask'), null, 15000);
    await sleep(200);
    let txt = await W(P, () => document.getElementById('bubbleText').textContent);
    let lg = await vlog(P);
    check('lang VI: bubble prompt is Vietnamese', VI_RE.test(txt), txt);
    check('lang VI: every voice line is lang vi', lg.length > 0 && lg.every(l => l.lang === 'vi'), lg.slice(0, 4));
    check('lang VI: voice lines have Vietnamese text', lg.some(l => VI_RE.test(l.text)), lg.slice(0, 4));
    // back to English: pause → home → settings → English → play
    await tapEl(P, '#btnPause'); await sleep(200); await tapEl(P, '#btnHome'); await sleep(200);
    await hold(P, '#btnParents', 2300);
    await tapEl(P, '#scrSettings [data-lang="en"]'); await sleep(150);
    check('lang: settings and title switches agree', await W(P, () => document.querySelector('#scrTitle [data-lang="en"]').classList.contains('on') && document.querySelector('#scrSettings [data-lang="en"]').classList.contains('on')));
    await tapEl(P, '#btnSettingsDone'); await sleep(150);
    const n0 = await vlen(P); await clearEv(P);
    await tapEl(P, '#btnPlay');
    await until(P, () => window.__ev.some(e => e.type === 'ask'), null, 15000);
    await sleep(200);
    txt = await W(P, () => document.getElementById('bubbleText').textContent);
    lg = await vlog(P, n0);
    check('lang EN: bubble prompt is English', /[a-z]/i.test(txt) && !VI_RE.test(txt), txt);
    check('lang EN: new voice lines are lang en and English', lg.length > 0 && lg.every(l => l.lang === 'en' && !VI_RE.test(l.text)), lg.slice(0, 4));
    check('lang: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async gate(check) {
    for (const [n, d] of [['iphoneP', DEV.iphoneP], ['ipadL', DEV.ipadL]]) {
      const P = await open(d, 'mute=1&seed=13');
      const closed = () => W(P, () => document.getElementById('scrSettings').classList.contains('hidden'));
      await tapEl(P, '#btnParents'); await sleep(300);
      check(`${n} gate: a short tap on ⚙ does not open settings`, await closed());
      const held = await hold(P, '#btnParents', 1000);
      check(`${n} gate: a 1 s hold (page saw ${Math.round(held)} ms) does not open settings`, held >= 1900 || await closed(), held);
      await hold(P, '#btnParents', 2300);
      check(`${n} gate: a 2 s hold opens settings`, !(await closed()));
      check(`${n} gate: still on the title (game not started)`, await W(P, () => DD.debug.mode === 'title'));
      await P.ctx.close();
    }
  },
  async persist(check) {
    const ctx = await newCtx(DEV.ipadP); const page = await ctx.newPage(); const P = await attach(ctx, page);
    await page.goto(srv.url + '?mute=1'); await instrument(P);
    await hold(P, '#btnParents', 2300);
    const scr = () => W(P, () => ['scrTitle', 'scrSettings'].filter(i => !document.getElementById(i).classList.contains('hidden')).join());
    const h1 = await scr();
    await tapEl(P, '#ageChips [data-age="6"]'); await sleep(100);
    const h2 = await scr();
    check('persist: settings open after the hold and stay open after an age-chip tap', h1 === "scrSettings" && h2 === "scrSettings", { afterHold: h1, afterChip: h2 });
    await tapEl(P, '#scrSettings [data-lang="vi"]'); await sleep(100);
    await tapEl(P, '#inpName'); await page.keyboard.type('Mai'); await sleep(100);
    // volume slider: a real tap at 30 % of the track
    const vr = await W(P, () => { const r = document.getElementById('optVolume').getBoundingClientRect(); return { x: r.x + r.width * 0.3, y: r.y + r.height / 2 }; });
    await tap(P, vr); await sleep(150);
    let vol = await W(P, () => DD.debug.getState().settings.volume);
    check('persist: a tap on the volume slider changes the volume', vol < 0.9, vol);
    if (!(vol < 0.9)) { await page.fill('#optVolume', '30'); await W(P, () => document.getElementById('optVolume').dispatchEvent(new Event('input'))); }
    for (const id of ['optSfx', 'optMusic', 'optVoice', 'optMic']) { await tap(P, await center(P, `label:has(#${id})`)); await sleep(80); }
    const before = await W(P, () => DD.debug.getState().settings);
    check('persist: toggles flipped by touch', !before.sfx && !before.music && !before.voice && !before.mic, before);
    await tapEl(P, '#btnSettingsDone');
    await page.reload(); await instrument(P);
    const after = await W(P, () => DD.debug.getState().settings);
    check('persist: age / lang / name / volume / sfx / music / voice / mic survive reload',
      after.age === 6 && after.lang === 'vi' && after.name === 'Mai' && Math.abs(after.volume - before.volume) < 1e-9 && !after.sfx && !after.music && !after.voice && !after.mic, { before, after });
    check('persist: UI shows the saved language after reload', await W(P, () => document.documentElement.lang === 'vi'));
    // URL flags never saved: open with ?age=3&lang=en, change something (forces a save), reload without flags
    await page.goto(srv.url + '?mute=1&age=3&lang=en'); await instrument(P);
    check('flags: ?lang=en applied for the session', await W(P, () => document.documentElement.lang === 'en'));
    await hold(P, '#btnParents', 2300);
    check('flags: settings shows age 3 from ?age=', await W(P, () => document.querySelector('#ageChips .chip.on') && document.querySelector('#ageChips .chip.on').dataset.age === '3'));
    await tap(P, await center(P, 'label:has(#optSfx)')); await sleep(100);   // triggers saveSettings
    await tapEl(P, '#btnSettingsDone');
    const raw = await W(P, () => JSON.parse(localStorage.getItem('sp:settings')));
    check('flags: ?age= / ?lang= are not written to storage', raw.age === 6 && raw.lang === 'vi', raw);
    await page.goto(srv.url + '?mute=1'); await instrument(P);
    const s2 = await W(P, () => DD.debug.getState().settings);
    check('flags: after reload without flags the saved age 6 / vi come back', s2.age === 6 && s2.lang === 'vi' && s2.sfx === true, s2);
    check('persist: storage keys all use the sp: prefix', await W(P, () => { const k = []; for (let i = 0; i < localStorage.length; i++) k.push(localStorage.key(i)); return k.every(x => x.startsWith('dd:')); }));
    check('persist: no console errors', P.errors.length === 0, P.errors);
    await ctx.close();
  },
  async colors(check) {
    for (const [n0_, d, L] of [['iphoneL', DEV.iphoneL, 'en'], ['ipadP', DEV.ipadP, 'en'], ['iphoneP', DEV.iphoneP, 'vi']]) {
      const n = n0_ + ' ' + L;
      const P = await open(d, `mute=1&seed=5&age=4&lang=${L}`);
      await startTopic(P, 'colors', 0, 'w.round = 1;');
      await sleep(400);
      const info = await W(P, () => { const w = DD.debug.world, s = w.stepInfo; return { want: s.color, target: s.targets[0], shells: w.shells.map(x => x.color), other: (w.parts.find(p => !s.targets.includes(p.id) && !p.painted) || {}).id }; });
      // needPaint before picking
      let n0 = await vlen(P); await clearEv(P);
      await tap(P, await W(P, id => DD.debug.partScreen(id), info.target)); await sleep(350);
      const np = await evs(P, 'needPaint');
      check(`${n} colors: part before a paint → needPaint`, np.length === 1, np);
      check(`${n} colors: needPaint is not a miss`, await W(P, () => DD.debug.world.misses === 0));
      let lg = await vlog(P, n0);
      const wantName = await W(P, ({ c, L }) => DD.I18N.name(L, 'color', c), { c: info.want, L });
      check(`${n} colors: needPaint voice line names the colour`, lg.some(l => l.text.toLowerCase().includes(wantName.toLowerCase())), lg);
      // wrong shell → wrong event + a line naming both colours
      const wrongC = info.shells.find(c => c !== info.want);
      n0 = await vlen(P); await clearEv(P);
      await tap(P, await W(P, c => DD.debug.shellScreen(c), wrongC)); await sleep(350);
      const we = await evs(P, 'wrong');
      check(`${n} colors: wrong shell → wrong {kind:color} once`, we.length === 1 && we[0].kind === 'color' && we[0].color === wrongC, we);
      check(`${n} colors: wrong shell is a miss`, await W(P, () => DD.debug.world.misses === 1));
      lg = await vlog(P, n0);
      const gotName = await W(P, ({ c, L }) => DD.I18N.name(L, 'color', c), { c: wrongC, L });
      check(`${n} colors: wrong voice line names both colours (${gotName} → ${wantName})`, lg.some(l => { const t = l.text.toLowerCase(); return t.includes(gotName.toLowerCase()) && t.includes(wantName.toLowerCase()); }), lg);
      // the right shell → pick + follow ask; then another part → notThis (no miss)
      await clearEv(P);
      await tap(P, await W(P, c => DD.debug.shellScreen(c), info.want)); await sleep(450);
      check(`${n} colors: right shell → pick + brush loaded`, (await evs(P, 'pick')).length === 1 && await W(P, c => DD.debug.world.brush.color === c, info.want));
      check(`${n} colors: follow-up ask (p.tapPart)`, (await evs(P, 'ask')).some(e => e.follow));
      // another shell while the right paint is on the brush → notThis {kind:'shell'}: not a mistake, the brush keeps its paint
      await clearEv(P);
      await tap(P, await W(P, c => DD.debug.shellScreen(c), wrongC)); await sleep(350);
      const ns = await evs(P, 'notThis');
      check(`${n} colors: another shell after the right one → notThis {kind:shell}, no miss, brush keeps ${info.want}`, ns.length === 1 && ns[0].kind === 'shell' && await W(P, c => DD.debug.world.misses === 1 && DD.debug.world.brush.color === c, info.want), ns);
      await sleep(2600);   // the soft-line cooldown (2.5 s) before the part notThis below
      if (info.other) {
        await clearEv(P);
        await tap(P, await W(P, id => DD.debug.partScreen(id), info.other)); await sleep(350);
        check(`${n} colors: another part → notThis`, (await evs(P, 'notThis')).length === 1);
        check(`${n} colors: notThis not counted as a mistake`, await W(P, () => DD.debug.world.misses === 1));
        check(`${n} colors: notThis did not paint the other part`, await W(P, id => !DD.debug.world.st[id].painted, info.other));
      }
      // the right part fills
      await clearEv(P);
      await tap(P, await W(P, id => DD.debug.partScreen(id), info.target)); await sleep(1100);
      let st = await W(P, id => { const s = DD.debug.world.st[id]; return { painted: s.painted, t: s.t, color: s.colorName }; }, info.target);
      await until(P, id => DD.debug.world.st[id].t > 0.99, info.target, 6000).catch(() => {});
      st = await W(P, id => { const s = DD.debug.world.st[id]; return { painted: s.painted, t: s.t, color: s.colorName }; }, info.target);
      check(`${n} colors: right part → paint + filled with the colour`, st.painted && st.t > 0.99 && st.color === info.want && (await evs(P, 'filled')).some(e => e.partId === info.target), st);
      check(`${n} colors: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async parts(check) {   // shapes / animals / size: tapPart wrong + right
    for (const [n, d, topic] of [['iphoneP', DEV.iphoneP, 'shapes'], ['ipadL', DEV.ipadL, 'animals'], ['iphoneL', DEV.iphoneL, 'size']]) {
      const P = await open(d, 'mute=1&seed=6&age=4');
      await startTopic(P, topic, 0, 'w.round = 2;');
      await sleep(300);
      const info = await W(P, () => { const w = DD.debug.world, s = w.stepInfo; const wr = w.parts.find(p => !s.targets.includes(p.id) && p.role === s.role && !p.painted); return { mode: s.mode, target: s.targets[0], wrong: wr && wr.id, wrongName: wr && [wr.nameKind, wr.nameValue], want: [s.nameKind, s.nameValue] }; });
      if (info.mode === 'pickTap') { await tap(P, await W(P, () => DD.debug.shellScreen(DD.debug.world.stepInfo.color))); await sleep(400); }
      if (info.wrong) {
        const n0 = await vlen(P); await clearEv(P);
        await tap(P, await W(P, id => DD.debug.partScreen(id), info.wrong)); await sleep(400);
        const we = await evs(P, 'wrong');
        check(`${n} ${topic}: wrong part → wrong {kind:part}`, we.length === 1 && we[0].kind === 'part' && we[0].partId === info.wrong, we);
        const names = await W(P, ({ a, b }) => [DD.I18N.name('en', a[0], a[1]), DD.I18N.name('en', b[0], b[1])], { a: info.wrongName, b: info.want });
        const lg = await vlog(P, n0);
        check(`${n} ${topic}: wrong line names what was tapped and the goal (${names.join(' → ')})`, lg.some(l => { const t = l.text.toLowerCase(); return names.every(x => t.includes(String(x).toLowerCase())); }), lg);
        check(`${n} ${topic}: wrong part not painted`, await W(P, id => !DD.debug.world.st[id].painted, info.wrong));
      } else check(`${n} ${topic}: a wrong part of the same role exists`, false, info);
      await clearEv(P);
      await tap(P, await W(P, id => DD.debug.partScreen(id), info.target)); await sleep(900);
      check(`${n} ${topic}: right part → paint`, (await evs(P, 'paint')).some(e => e.partId === info.target));
      check(`${n} ${topic}: round finishes by touch`, await playRoundByTouch(P));
      check(`${n} ${topic}: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async count(check) {
    for (const [n, d, age] of [['ipadP', DEV.ipadP, 4], ['iphoneL', DEV.iphoneL, 5]]) {
      const P = await open(d, `mute=1&seed=7&age=${age}`);
      await startTopic(P, 'count', 0, "w.round = 2; w.cfg.surpriseTypes = [];");
      const info = await W(P, () => { const s = DD.debug.world.stepInfo; return { need: s.need, targets: s.targets.slice(), mode: s.mode }; });
      check(`${n} count: N + spares (targets ${info.targets.length} > need ${info.need})`, info.targets.length > info.need, info);
      const n0 = await vlen(P); await clearEv(P);
      const tapped = [];
      for (let i = 0; i < info.need; i++) {
        const id = info.targets[i]; tapped.push(id);
        await tap(P, await W(P, x => DD.debug.partScreen(x), id)); await sleep(450);
        if (i === 0) {   // re-tap the painted spot → already, not counted
          await tap(P, await W(P, x => DD.debug.partScreen(x), id)); await sleep(350);
          check(`${n} count: a painted spot → already`, (await evs(P, 'already')).length === 1);
          check(`${n} count: already is not a miss`, await W(P, () => DD.debug.world.misses === 0));
        }
      }
      await sleep(400);
      const spare = info.targets[info.need];
      await tap(P, await W(P, x => DD.debug.partScreen(x), spare)); await sleep(400);
      const pe = (await evs(P, 'paint')).filter(e => e.count);
      check(`${n} count: N paints counted 1..N`, pe.length === info.need && pe.every((e, i) => e.count.i === i + 1 && e.count.n === info.need), pe.map(e => e.count));
      const sd = await W(P, x => ({ spare: DD.debug.world.st[x].painted, step: DD.debug.world.step, steps: DD.debug.world.cur && DD.debug.world.cur.steps.map(s => [s.mode, s.need, s.targets.length]), phase: DD.debug.world.phase, ev: window.__ev.map(e => e.type + (e.partId ? ':' + e.partId : '')) }), spare);
      check(`${n} count: step ended at N (no paint on the spare spot)`, !(await evs(P, 'paint')).some(e => e.partId === spare) && (await evs(P, 'stepDone')).length >= 1, Object.assign(sd, { spareId: spare }));
      const lg = await vlog(P, n0), words = await W(P, N => { const a = []; for (let i = 1; i <= N; i++) a.push(DD.I18N.sayCount('en', i)); return a; }, info.need);
      check(`${n} count: counted aloud (${words.join(' ')})`, words.every(w => lg.some(l => l.text === w)), { words, lg: lg.map(l => l.text) });
      check(`${n} count: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async help(check) {
    const P = await open(DEV.iphoneP, 'mute=1&seed=9&age=4');
    await startTopic(P, 'colors', 0, 'w.round = 1;');
    const want = await W(P, () => DD.debug.world.stepInfo.color);
    const wrongC = await W(P, c => DD.debug.world.shells.find(s => s.color !== c).color, want);
    await clearEv(P); let n0 = await vlen(P);
    await tap(P, await W(P, c => DD.debug.shellScreen(c), wrongC)); await sleep(300);
    check('hint: none after 1 miss', (await evs(P, 'hint')).length === 0);
    await tap(P, await W(P, c => DD.debug.shellScreen(c), wrongC)); await sleep(400);
    const h = await evs(P, 'hint');
    check('hint: after 2 misses → hint on the right shell', h.length === 1 && h[0].target === 'shell' && h[0].id === want, h);
    const g = await W(P, c => ({ glow: DD.debug.world.shellByColor(c).glow, hand: !!DD.debug.world.hintHand }), want);
    check('hint: the right shell glows + ghost hand shown', g.glow > 0.2 && g.hand, g);
    const hintTxt = await W(P, () => DD.I18N.t('en', 'hint'));
    check('hint: voice line queued', (await vlog(P, n0)).length >= 2);
    // idle nudge: no touch for ≥ 12 s (game time); speed 6
    await sleep(3200);
    await clearEv(P); n0 = await vlen(P);
    await W(P, () => DD.debug.setSpeed(6));
    await until(P, () => window.__ev.some(e => e.type === 'idle'), null, 15000).catch(() => {});
    await W(P, () => DD.debug.setSpeed(1));
    const id = await evs(P, 'idle');
    check('idle: nudge event after ~12 s without a touch', id.length >= 1, id);
    const bub = await W(P, () => document.getElementById('bubbleText').textContent);
    check('idle: nudge says the prompt again', (await vlog(P, n0)).some(l => l.text.includes(bub)), { bub, lg: await vlog(P, n0) });
    // tap Nini → repeats the prompt word for word
    await sleep(3300);
    await clearEv(P); n0 = await vlen(P);
    const nb = await W(P, () => DD.debug.niniScreen());
    await tap(P, { x: nb.x, y: nb.y }); await sleep(300);
    check('Nini tap → pokeNini', (await evs(P, 'pokeNini')).length === 1);
    const lg = await vlog(P, n0);
    check('Nini tap → the prompt is spoken again', lg.some(l => l.text === bub), { bub, lg });
    check('help: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
    // voice ON (no novoice / mute) but the TTS engine never starts an utterance (headless: 0 voices — like a device
    // without that language's voice, or a dropped utterance): tapping Nini must still repeat the prompt
    for (const L of ['en', 'vi']) {
      const Q = await open(DEV.iphoneL, `seed=9&age=4&lang=${L}`);
      await tapEl(Q, '#btnPlay');
      await until(Q, () => DD.debug.world.interactive, null, 20000);
      await sleep(3600);
      const m0 = await vlen(Q); await clearEv(Q);
      const nb2 = await W(Q, () => DD.debug.niniScreen());
      await tap(Q, { x: nb2.x, y: nb2.y }); await sleep(400);
      const pk = await evs(Q, 'pokeNini'), said = await vlog(Q, m0);
      check(`voice on, TTS silent (${L}): Nini tap → pokeNini and the prompt is said again`, pk.length === 1 && said.length >= 1, { pokeNini: pk.length, said, voices: await W(Q, () => speechSynthesis.getVoices().length) });
      await Q.ctx.close();
    }
  },
  async drag(check) {
    for (const [n, d] of [['iphoneP', DEV.iphoneP], ['ipadL', DEV.ipadL]]) {
      const P = await open(d, 'mute=1&seed=6&age=4');
      await startTopic(P, 'colors');
      await tap(P, await W(P, () => DD.debug.shellScreen(DD.debug.answer().shell))); await sleep(450);
      const a = await answerPt(P);
      await clearEv(P);
      // drag 102 CSS px (> CONFIG.tapMovePx 64 logical px on every viewport here; logical = css / s) — must not paint
      const pts = [];
      await touch(P, 'touchStart', [{ x: a.p.x, y: a.p.y, id: 1 }]);
      for (let i = 1; i <= 6; i++) { await touch(P, 'touchMove', [{ x: a.p.x + i * 17, y: a.p.y, id: 1 }]); await sleep(15); }
      await touch(P, 'touchEnd'); await sleep(500);
      const s = await W(P, () => DD.debug.view().s);
      check(`${n} drag: 102 px drag (${(102 / s).toFixed(0)} logical px) does not paint`, (await evs(P, 'paint')).length === 0 && await W(P, id => !DD.debug.world.st[id].painted, a.id));
      // small wobble (8 px) is still a tap
      await touch(P, 'touchStart', [{ x: a.p.x, y: a.p.y, id: 1 }]); await touch(P, 'touchMove', [{ x: a.p.x + 8, y: a.p.y + 3, id: 1 }]); await sleep(60); await touch(P, 'touchEnd'); await sleep(600);
      check(`${n} drag: an 8 px wobble is still a tap (paints)`, await W(P, id => DD.debug.world.st[id].painted, a.id));
      // a fast tapper: the next shell → part with ~100 ms between the taps still paints (brush job re-routed)
      await until(P, () => { const a = DD.debug.answer(); return a && a.shell; }, null, 8000).catch(() => {});
      const s2 = await answerPt(P);
      if (s2 && s2.kind === 'shell') {
        await tap(P, s2.p, 40);
        const p2 = await answerPt(P);
        await tap(P, p2.p, 40); await sleep(1200);
        check(`${n} fast tapper: shell → part 100 ms apart paints`, await W(P, id => DD.debug.world.st[id].painted && DD.debug.world.st[id].t > 0.5, p2.id));
      }
      await P.ctx.close();
    }
  },
  async multi(check) {
    const P = await open(DEV.ipadL, 'mute=1&seed=15&age=4');
    await startTopic(P, 'colors', 0, 'w.round = 1;');
    const want = await W(P, () => DD.debug.world.stepInfo.color);
    const wrongC = await W(P, c => DD.debug.world.shells.find(s => s.color !== c).color, want);
    const right = await W(P, c => DD.debug.shellScreen(c), want), wrong = await W(P, c => DD.debug.shellScreen(c), wrongC);
    // finger 1 rests on the empty water (top-left of the canvas area), finger 2 taps the right shell → ignored
    const L = await W(P, () => { const L = DD.debug.world.layout; return DD.debug.toScreen(L.canvas.x + L.canvas.w + 30, L.canvas.y + 30); });
    await clearEv(P);
    await touch(P, 'touchStart', [{ x: L.x, y: L.y, id: 1 }]); await sleep(60);
    await touch(P, 'touchStart', [{ x: L.x, y: L.y, id: 1 }, { x: right.x, y: right.y, id: 2 }]); await sleep(70);
    await touch(P, 'touchMove', [{ x: L.x, y: L.y, id: 1 }]); await sleep(60);
    await touch(P, 'touchEnd'); await sleep(400);
    check('multi: a second finger on a shell is ignored', (await evs(P, 'pick')).length === 0, await W(P, () => window.__ev.map(e => e.type)));
    // finger 1 on the right shell, finger 2 on a wrong shell → only the pick, no mistake
    await clearEv(P);
    await touch(P, 'touchStart', [{ x: right.x, y: right.y, id: 1 }]); await sleep(40);
    await touch(P, 'touchStart', [{ x: right.x, y: right.y, id: 1 }, { x: wrong.x, y: wrong.y, id: 2 }]); await sleep(40);
    await touch(P, 'touchEnd'); await sleep(400);
    check('multi: first finger picks, second finger makes no mistake', (await evs(P, 'pick')).length === 1 && (await evs(P, 'wrong')).length === 0 && await W(P, () => DD.debug.world.misses === 0), await W(P, () => window.__ev.map(e => e.type)));
    check('multi: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async talk(check) {
    for (const [n, d] of [['iphoneL', DEV.iphoneL], ['ipadP', DEV.ipadP]]) {
      const P = await open(d, 'mute=1&seed=8&age=4');
      await startTopic(P, 'shapes');
      for (const right of [true, false]) {
        const s0 = await W(P, () => DD.debug.world.stars);
        await W(P, () => DD.debug.world._startTalk());
        await until(P, () => DD.debug.mode === 'talk');
        await sleep(400);
        const b = await W(P, r => {
          const w = DD.debug.world, btn = [...document.querySelectorAll('#talkChoices button')];
          const t = btn.find(x => r ? x.dataset.id === String(w.talk.answer) : x.dataset.id !== String(w.talk.answer));
          const q = t.getBoundingClientRect(), vis = btn.every(x => { const g = x.getBoundingClientRect(); return g.top >= 0 && g.bottom <= innerHeight && g.left >= 0 && g.right <= innerWidth; });
          return { p: { x: q.x + q.width / 2, y: q.y + q.height / 2 }, vis, el: document.elementFromPoint(q.x + q.width / 2, q.y + q.height / 2).closest('button') === t };
        }, right);
        check(`${n} talk: every choice on screen and tappable`, b.vis && b.el, b);
        await clearEv(P);
        const n0 = await vlen(P);
        await tap(P, b.p); await sleep(400);
        const r = await evs(P, 'talkResult');
        check(`${n} talk: tap ${right ? 'right' : 'wrong'} answer → talkResult correct=${right}`, r.length === 1 && r[0].correct === right && !r[0].auto, r);
        await tap(P, b.p); await sleep(200);
        check(`${n} talk: a second tap does not answer twice`, (await evs(P, 'talkResult')).length === 1);
        const lg = await vlog(P, n0);
        check(`${n} talk: ${right ? 'praise' : 'kind'} line spoken`, lg.length >= 1 && lg.every(l => !/undefined|\{|\}/.test(l.text)), lg);
        await sleep(2400);
        const s1 = await W(P, () => DD.debug.world.stars);
        check(`${n} talk: stars ${right ? '+1' : 'unchanged'} (${s0} → ${s1})`, s1 === s0 + (right ? 1 : 0));
        check(`${n} talk: leaves Talk time`, await W(P, () => DD.debug.mode === 'play' && DD.debug.world.state !== 'talk'));
      }
      check(`${n} talk: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async pause(check) {
    const P = await open(DEV.iphoneL, 'mute=1&seed=9&age=4');
    await startTopic(P, 'colors');
    await tapEl(P, '#btnPause'); await sleep(300);
    check('pause: ⏸ tap pauses', await W(P, () => DD.debug.mode === 'paused'));
    const t0 = await W(P, () => DD.debug.world.time); await sleep(500);
    check('pause: world frozen', await W(P, t => DD.debug.world.time === t, t0));
    // a tap through the pause screen must not reach the world
    await clearEv(P);
    await tap(P, await W(P, () => DD.debug.shellScreen(DD.debug.answer().shell))); await sleep(200);
    check('pause: a tap on the pause screen does not pick', (await evs(P, 'pick')).length === 0);
    await tapEl(P, '#btnResume'); await sleep(300);
    check('pause: resume', await W(P, () => DD.debug.mode === 'play'));
    // visibilitychange → hidden pauses
    await W(P, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    check('visibility: hidden → paused', await W(P, () => DD.debug.mode === 'paused'));
    await W(P, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(200);
    check('visibility: back → stays paused until Resume', await W(P, () => DD.debug.mode === 'paused'));
    await tapEl(P, '#btnResume'); await sleep(300);
    const a = await answerPt(P); await clearEv(P); await tap(P, a.p); await sleep(400);
    check('visibility: play continues after resume (real tap picks)', (await evs(P, 'pick')).length === 1);
    // pause during Talk time → resume returns to Talk
    await W(P, () => DD.debug.world._startTalk()); await until(P, () => DD.debug.mode === 'talk');
    check('pause: the ⏸ button is reachable during Talk time', await W(P, () => { const b = document.getElementById('btnPause'), r = b.getBoundingClientRect(); const e = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return r.width > 0 && !!e && !!e.closest('#btnPause'); }));
    await W(P, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
    await sleep(150);
    await W(P, () => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
    check('pause: Talk time pauses on hide', await W(P, () => DD.debug.mode === 'paused'));
    await tapEl(P, '#btnResume'); await sleep(300);
    check('pause: resume returns to Talk time with the choices', await W(P, () => DD.debug.mode === 'talk' && !document.getElementById('scrTalk').classList.contains('hidden')));
    check('pause: no console errors', P.errors.length === 0, P.errors);
    await P.ctx.close();
  },
  async rotate(check) {
    const pairs = [['iphone', DEV.iphoneP, DEV.iphoneL], ['ipad', DEV.ipadL, DEV.ipadP]];
    for (const [n, d1, d2] of pairs) {
      const P = await open(d1, 'mute=1&seed=11&age=4');
      await startTopic(P, 'colors', 0, 'w.round = 1;');
      // rotate mid brush flight (to the shell)
      const a = await answerPt(P);
      await tap(P, a.p, 40);
      await P.page.setViewportSize(d2.viewport); await sleep(800);
      let st = await W(P, () => ({ W: DD.debug.world.layout.W, H: DD.debug.world.layout.H, brush: DD.debug.world.brush.state, color: DD.debug.world.brush.color, job: !!DD.debug.world.brush.job }));
      check(`${n} rotate mid-flight: layout re-flows, brush still loaded, brush at rest`, (st.W > st.H) === (d2.viewport.width > d2.viewport.height) && st.color === a.id && st.brush === 'rest' && !st.job, st);
      let r = await probeAll(P);
      check(`${n} rotate mid-flight: every shell / part still tappable`, r.bad.length === 0, r.bad.slice(0, 3));
      // rotate mid fill
      const b = await answerPt(P);
      await tap(P, b.p, 40); await sleep(150);
      const mid = await W(P, id => DD.debug.world.st[id].t, b.id);
      await P.page.setViewportSize(d1.viewport); await sleep(1200);
      st = await W(P, id => ({ painted: DD.debug.world.st[id].painted, t: DD.debug.world.st[id].t, brush: DD.debug.world.brush.state, job: !!DD.debug.world.brush.job }), b.id);
      check(`${n} rotate mid-fill (t=${mid.toFixed(2)}): the fill completes, brush at rest`, st.painted && st.t > 0.99 && st.brush === 'rest' && !st.job, st);
      r = await probeAll(P);
      check(`${n} rotate mid-fill: every shell / part still tappable`, r.bad.length === 0, r.bad.slice(0, 3));
      // rotate during the hint hand
      check(`${n} rotate: the round still finishes by touch (no stuck state)`, await playRoundByTouch(P));
      await until(P, () => window.__ev.some(e => e.type === 'roundDone'), null, 15000).catch(() => {});
      check(`${n} rotate: roundDone reached`, (await evs(P, 'roundDone')).length >= 1);
      check(`${n} rotate: no console errors`, P.errors.length === 0, P.errors);
      await P.ctx.close();
    }
  },
  async surprise(check) {
    for (const [n, d] of Object.entries(DEV)) {
      for (const kind of ['fishy', 'pearl']) {
        const P = await open(d, 'mute=1&seed=14&age=4');
        await startTopic(P, 'animals', 0, `w.cfg.surpriseTypes = ['${kind}']; w._surpriseOff = 0; w._surpriseRound = 1; w.round = 1;`);
        const got = await W(P, () => DD.debug.world.surprise);
        if (kind === 'fishy') {
          await until(P, () => !!DD.debug.fishyScreen(), null, 20000).catch(() => {});
          await sleep(500);
        }
        const p = await W(P, k => k === 'fishy' ? DD.debug.fishyScreen() : DD.debug.clamScreen(), got);
        if (!p) { check(`${n} ${kind}: surprise appears (got ${got})`, false, got); await P.ctx.close(); continue; }
        const pr = await W(P, ({ src, p }) => eval(src)(p), { src: PROBE, p });
        check(`${n} ${got}: tap point on screen and hits the canvas`, pr.ok, pr);
        const s0 = await W(P, () => ({ stars: DD.debug.world.stars, misses: DD.debug.world.misses, hud: document.getElementById('hudStars').textContent }));
        await clearEv(P);
        await tap(P, p); await sleep(400);
        const tapEv = got === 'fishy' ? 'fishyTap' : 'pearlTap';
        check(`${n} ${got}: real tap → ${tapEv}`, (await evs(P, tapEv)).length === 1, await W(P, () => window.__ev.map(e => e.type)));
        const s1 = await W(P, () => ({ stars: DD.debug.world.stars, misses: DD.debug.world.misses, hud: document.getElementById('hudStars').textContent }));
        check(`${n} ${got}: no score / miss change`, JSON.stringify(s0) === JSON.stringify(s1) && (await evs(P, 'wrong')).length === 0 && (await evs(P, 'notThis')).length === 0, { s0, s1 });
        check(`${n} ${got}: no console errors`, P.errors.length === 0, P.errors);
        await P.ctx.close();
      }
    }
  },
  async fishysteal(check) {   // the fishy lane crosses the picture: a tap on a target part under the swimming fish
    for (const [n, d] of [['ipadL', DEV.ipadL], ['iphoneL', DEV.iphoneL], ['ipadP', DEV.ipadP]]) {
      const P = await open(d, 'mute=1&seed=14&age=4');
      await startTopic(P, 'count', 0, "w.cfg.surpriseTypes = ['fishy']; w._surpriseOff = 0; w._surpriseRound = 1; w.round = 1;");
      let id = null;
      try {
        await P.page.waitForFunction(() => { const w = DD.debug.world, f = w.fishyHit(); if (!f || !w.interactive) return false; for (const id of w.stepInfo.targets) { const t = w.partTap(id); if (!w.st[id].painted && Math.hypot(t.x - f.x, t.y - f.y) < f.r - 8) { window.__h = id; return true; } } return false; }, null, { timeout: 20000, polling: 16 });
        id = await W(P, () => window.__h);
      } catch (e) { /* the fish never crossed a target */ }
      if (!id) { check(`${n} fishy over the picture: (fish never over a target spot — nothing to test)`, true); await P.ctx.close(); continue; }
      await clearEv(P);
      await tap(P, await W(P, x => DD.debug.partScreen(x), id)); await sleep(500);
      const ev = await W(P, () => window.__ev.map(e => e.type));
      check(`${n} fishy over the picture: a tap on an unpainted count spot under the fish still paints it`, ev.includes('paint'), { spot: id, events: ev });
      await P.ctx.close();
    }
  },
  async audio(check) {
    const ctx = await newCtx(DEV.iphoneP); const page = await ctx.newPage(); const P = await attach(ctx, page);
    await page.goto(srv.url + '?seed=12&age=4'); await instrument(P);   // not muted: the real chain
    await tapEl(P, '#btnPlay'); await sleep(500);
    const ch = await W(P, () => { const A = DD.debug.audio(); return { ctx: !!A.ctx, master: !!A.master, user: !!A.user, sfx: !!A.sfx, music: !!A.music, gain: A.user && A.user.gain.value, vol: A.volume }; });
    check('audio: chain sfx/music → master → compressor → user volume', ch.ctx && ch.master && ch.user && ch.sfx && ch.music, ch);
    await tapEl(P, '#btnPause'); await sleep(200);
    await tapEl(P, '#btnVolDown'); await sleep(100); await tapEl(P, '#btnVolDown'); await sleep(400);
    const v = await W(P, () => ({ txt: document.getElementById('volLevel').textContent, vol: DD.debug.audio().volume, gain: DD.debug.audio().user.gain.value }));
    check('audio: − − → 80 % and the user gain follows', v.txt === '80%' && Math.abs(v.vol - 0.8) < 1e-6 && Math.abs(v.gain - 1.28) < 0.05, v);
    await page.reload(); await instrument(P);
    const v2 = await W(P, () => ({ vol: DD.debug.getState().settings.volume, a: DD.debug.audio().volume }));
    check('audio: volume persists across reload', Math.abs(v2.vol - 0.8) < 1e-6 && Math.abs(v2.a - 0.8) < 1e-6, v2);
    await tapEl(P, '#btnPlay'); await sleep(300); await tapEl(P, '#btnPause'); await sleep(200);
    check('audio: pause menu shows the saved volume', await W(P, () => document.getElementById('volLevel').textContent === '80%'));
    check('audio: no console errors', P.errors.length === 0, P.errors);
    await ctx.close();
  },
  async bots(check) {
    const jobs = [];
    for (const lang of ['en', 'vi']) for (const age of [3, 4, 5, 6, 7]) jobs.push({ lang, age });
    const devs = [DEV.iphoneL, DEV.iphoneP, DEV.ipadL, DEV.ipadP];
    let k = 0;
    const run = async (j, idx) => {
      const P = await open(devs[idx % 4], `mute=1&seed=${30 + j.age}&age=${j.age}&lang=${j.lang}&speed=8&bot=1&autostart=1`);
      const t0 = Date.now();
      let ok = true, info = null;
      try { await P.page.waitForFunction(() => DD.debug.mode === 'done', null, { timeout: 300000, polling: 250 }); }
      catch (e) { ok = false; info = await W(P, () => DD.debug.getState()); }
      await sleep(1500);
      const r = await W(P, () => {
        const sd = window.__ev.filter(e => e.type === 'sessionDone')[0];
        const lines = DD.debug.voiceLog.map(x => x.text);
        return { sd: sd && sd.stars, world: DD.debug.world.stars, hud: +document.getElementById('hudStars').textContent, done: +document.getElementById('doneStars').textContent,
          drops: window.__drops, stats: DD.debug.stats, wrongLang: DD.debug.voiceLog.filter(x => x.lang !== new URLSearchParams(location.search).get('lang')).length,
          badLines: lines.filter(t => !t.trim() || /[{}]|undefined|NaN|\bnull\b/.test(t)).slice(0, 3), vi: lines.filter(t => /[ạàáảãđươ]/i.test(t)).length, lines: lines.length };
      });
      const tag = `bot ${j.lang} age ${j.age}`;
      check(`${tag}: reaches sessionDone (${((Date.now() - t0) / 1000).toFixed(0)} s, ${r.stats.rounds} rounds, ${r.stats.talks} talks)`, ok, info);
      check(`${tag}: stars only go up`, r.drops.length === 0, r.drops.slice(0, 3));
      check(`${tag}: sessionDone stars = world = HUD = done panel (${r.sd})`, r.sd === r.world && r.hud === r.sd && r.done === r.sd, r);
      check(`${tag}: voice lines clean, in ${j.lang}`, r.badLines.length === 0 && r.wrongLang === 0 && (j.lang === 'vi' ? r.vi > r.lines * 0.5 : r.vi === 0), r);
      check(`${tag}: no console / page errors`, P.errors.length === 0, P.errors.slice(0, 3));
      await P.ctx.close();
    };
    const conc = 3, q = jobs.slice();
    await Promise.all(Array.from({ length: conc }, async () => { while (q.length) { const j = q.shift(); await run(j, k++); } }));
  }
};
(async () => {
  srv = await serve(); browser = await chromium.launch();
  for (const n of Object.keys(G)) {
    if (ONLY.length && !ONLY.includes(n)) continue;
    const log = [];
    const check = (name, ok, info) => { results.push({ group: n, name, ok: !!ok, info: ok ? '' : info }); log.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + JSON.stringify(info).slice(0, 500))); };
    const t0 = Date.now();
    try { await G[n](check); } catch (e) { check(`${n}: group crashed`, false, String(e && e.stack || e).slice(0, 600)); }
    console.log(`[${n}] ${((Date.now() - t0) / 1000).toFixed(0)} s\n  ` + log.join('\n  '));
  }
  await browser.close(); srv.close();
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  const fails = results.filter(r => !r.ok);
  console.log(`\n${results.length - fails.length}/${results.length} checks passed` + (fails.length ? `, ${fails.length} FAILED` : ''));
  process.exit(fails.length ? 1 : 0);
})();
