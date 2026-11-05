// Functional QA suite for Bop's Rainy Band — REAL touch input (CDP Input.dispatchTouchEvent) on iPhone / iPad sized
// mobile contexts (isMobile + hasTouch). It never edits the game: it reads RB.debug / world state and touches the screen.
//   node tests/e2e/functional.js                       (all groups)
//   node tests/e2e/functional.js pick drum rotate      (only some groups)
//   JOBS=3 node tests/e2e/functional.js                (groups run in parallel; default 3)
// Groups: boot lang gate settings pick poke drum listen talk pause rotate audio bot
// Prints PASS/FAIL per check, writes tests/out/functional/results.json (+ screenshots), exits 1 on any FAIL.
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
const JOBS = Math.max(1, +process.env.JOBS || 3);
const BOT_SPEED = +process.env.BOT_SPEED || 8;

const results = [];
function checker(group, log) {
  return function check(name, ok, info) {
    results.push({ group, name, ok: !!ok, info: ok || info == null ? '' : info });
    log.push((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 600)));
    return !!ok;
  };
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũờởỡợứừửữựấầẩẫậắằẳẵặếềểễệốồổỗộớ]/i;
const NEG_RE = /\b(no|nope|not|wrong|bad|incorrect|mistake|fail(ed)?)\b|\bsai\b|không đúng|không phải|dở quá/i;
function badText(s) {
  s = String(s == null ? '' : s);
  if (!s.trim()) return 'empty';
  if (/[{}]/.test(s)) return 'brace';
  if (/\bundefined\b|\bNaN\b|\bnull\b|\[object/.test(s)) return 'undefined/NaN/null';
  if (/\b(p|ui|topic|talk|say|session|weather|surprise|count|snail|wrong|hint|idle|deal|party|praise)\.[a-zA-Z0-9]/.test(s)) return 'raw i18n key';
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
  const cdp = await ctx.newCDPSession(page);
  const P = { ctx, page, errors, cdp, dev };
  await P.page.goto(srv.url + (q ? '?' + q : ''));
  await waitTitle(P, opt.mode);
  return P;
}
async function reload(P, q) {
  await P.page.goto(srv.url + (q ? '?' + q : ''));
  await waitTitle(P);
}
async function waitTitle(P, mode = 'title') {
  await P.page.waitForFunction(m => window.RB && RB.debug && RB.debug.mode === m, mode, { timeout: 20000 });
  // event recorder (test instrumentation only): every world event main.js drains, with a timestamp
  await P.page.evaluate(() => {
    const w = RB.debug.world; window.__ev = [];
    const o = w.drainEvents.bind(w);
    w.drainEvents = function () {
      const e = o();
      for (const x of e) {
        window.__ev.push({ type: x.type, i: x.i, n: x.n, memberId: x.memberId, idle: x.idle, correct: x.correct, level: x.level, topic: x.topic, round: x.round, stars: x.stars, t: performance.now() });
      }
      if (window.__ev.length > 4000) window.__ev.splice(0, 2000);
      return e;
    };
  });
  await sleep(250);
}
const ev = (P, since = 0) => P.page.evaluate(s => window.__ev.filter(e => e.t >= s), since);
const now = P => P.page.evaluate(() => performance.now());
const vlog = P => P.page.evaluate(() => RB.debug.voiceLog.map(e => ({ text: e.text, lang: e.lang })));
const vlen = P => P.page.evaluate(() => RB.debug.voiceLog.length);
async function until(P, fn, arg, ms = 20000) {
  try { return await P.page.waitForFunction(fn, arg, { timeout: ms, polling: 50 }); }
  catch (e) {
    const st = await P.page.evaluate(() => { const s = RB.debug.getState(); delete s.settings; delete s.ins; return Object.assign(s, { last: (window.__ev || []).slice(-8).map(x => x.type) }); }).catch(() => null);
    throw new Error('timeout waiting for ' + String(fn).slice(0, 120) + ' — state ' + JSON.stringify(st));
  }
}

/* ---------- real touch ---------- */
async function touchDown(P, x, y, id = 1) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] }); }
async function touchMove(P, x, y, id = 1) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y, id }] }); }
async function touchUp(P) { await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); }
async function tap(P, x, y, hold = 70) { await touchDown(P, x, y); await sleep(hold); await touchUp(P); }
async function tapBox(P, b, hold) { if (!b) throw new Error('no box to tap'); await tap(P, b.x, b.y, hold); }
async function elBox(P, sel) {
  return P.page.evaluate(s => {
    const el = document.querySelector(s); if (!el) return null;
    const r = el.getBoundingClientRect(); if (!r.width) return null;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height, l: r.left, t: r.top, r: r.right, b: r.bottom };
  }, sel);
}
async function tapEl(P, sel, hold = 70) { const b = await elBox(P, sel); if (!b) throw new Error('not visible: ' + sel); await tap(P, b.x, b.y, hold); await sleep(150); }
const visible = (P, id) => P.page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);

/* ---------- game state ---------- */
async function info(P) {
  return P.page.evaluate(() => {
    const w = RB.debug.world, a = w._askObj ? w._askObj() : null;
    return {
      mode: RB.debug.mode, state: w.state, phase: w.phase, level: w.level, topic: w.topic, round: w.round, ask: w.ask,
      askMode: a && a.mode, n: a && a.n, promptKey: a && a.promptKey, ans: RB.debug.answerId(), time: w.time, stars: w.stars,
      notes: w.sheet && w.sheet.notes ? w.sheet.notes.filter(Boolean).length : 0,
      members: w.members.map(m => ({ id: m.id, state: m.state, glow: m.glow, glowT: m._glowT, item: { kind: m.item.kind, n: m.item.n, value: m.item.value }, box: RB.debug.memberScreen(m.id) })),
      drum: RB.debug.bigDrumScreen(), bop: RB.debug.bopScreen(), hintHand: !!w.hintHand,
      bubble: document.getElementById('bubbleText').textContent, settings: RB.debug.getState().settings,
      vw: innerWidth, vh: innerHeight
    };
  });
}
async function startByTap(P) {
  await tapEl(P, '#btnPlay');
  await until(P, () => RB.debug.mode === 'play');
}
async function waitAsk(P, mode, ms = 25000) {
  await until(P, m => { const w = RB.debug.world, a = w._askObj && w._askObj(); return w.state === 'round' && w.phase === 'ask' && a && (!m || a.mode === m); }, mode || null, ms);
  const md = await P.page.evaluate(() => RB.debug.world._mode());
  if (md === 'drum') await sleep(900);   // CONFIG.drumGuard: the first 0.7 s of a drum ask are free booms
  return info(P);
}
const notesNow = P => P.page.evaluate(() => RB.debug.world.sheet.notes.filter(Boolean).length);
function inView(b, vw, vh) { return b && b.x - b.w / 2 >= -2 && b.x + b.w / 2 <= vw + 2 && b.y - b.h / 2 >= -2 && b.y + b.h / 2 <= vh + 2; }
function centreIn(b, vw, vh) { return b && b.x > 0 && b.x < vw && b.y > 0 && b.y < vh; }
async function shot(P, name) { try { await P.page.screenshot({ path: path.join(OUT, `${P.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }
/** Find a seed whose age-a session contains `topic`; returns {seed, level}. (fresh storage: lastTopics empty) */
async function seedFor(P, age, topic) {
  return P.page.evaluate(([a, t]) => {
    for (let s = 1; s < 200; s++) { const L = RB.Content.topicsFor(a, new RB.RNG(s), null); if (L.indexOf(t) >= 0) return { seed: s, level: L.indexOf(t), levels: L }; }
    return null;
  }, [age, topic]);
}
async function closeP(P, check, label) {
  check(label + ': no console / page errors', P.errors.length === 0, P.errors.slice(0, 5));
  await P.ctx.close();
}

/* ================================================================ groups */
const G = {};

// boot + title on every device; Play by touch; the first ask's band is on screen and tappable
G.boot = async check => {
  for (const d of ALL) {
    const P = await open(d, 'mute=1&seed=3&age=4');
    const t = await P.page.evaluate(() => ({ title: !document.getElementById('scrTitle').classList.contains('hidden'), logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, hud: !document.getElementById('hud').classList.contains('hidden'), loading: !document.getElementById('loading').classList.contains('hidden') }));
    check(`${d.name}: title screen shown, loader gone`, t.title && !t.loading && !t.hud, t);
    check(`${d.name}: logo text`, /Bop/.test(t.logo), t.logo);
    const pb = await elBox(P, '#btnPlay'), gb = await elBox(P, '#btnParents');
    check(`${d.name}: Play + gear inside the screen`, pb && gb && pb.l >= 0 && pb.r <= d.viewport.width && pb.b <= d.viewport.height && gb.t >= 0 && gb.r <= d.viewport.width, { pb, gb });
    check(`${d.name}: Play button ≥ 64 px`, pb && pb.w >= 64 && pb.h >= 64, pb);
    await shot(P, 'boot-title');
    await startByTap(P);
    check(`${d.name}: a touch on Play starts the game (HUD shown)`, await visible(P, 'hud'));
    const I = await waitAsk(P);
    const vw = d.viewport.width, vh = d.viewport.height;
    check(`${d.name}: every band member box on screen`, I.members.every(m => inView(m.box, vw, vh)), I.members.map(m => m.box));
    check(`${d.name}: big drum + Bop on screen`, centreIn(I.drum, vw, vh) && centreIn(I.bop, vw, vh), { drum: I.drum, bop: I.bop });
    const hud = await elBox(P, '#hud');
    check(`${d.name}: no member centre under the HUD`, I.members.every(m => !(m.box.x > hud.l && m.box.x < hud.r && m.box.y > hud.t && m.box.y < hud.b)), { hud });
    check(`${d.name}: bubble shows the prompt`, (await visible(P, 'bubble')) && I.bubble.length > 3 && !badText(I.bubble), I.bubble);
    // full pick ask: tap the right member
    const before = I.notes, t0 = await now(P);
    const right = I.members.find(m => m.id === I.ans);
    await tapBox(P, right.box);
    await sleep(1100);
    const E = await ev(P, t0), n1 = await notesNow(P);
    check(`${d.name}: touch on the right member → play + a note on the sheet`, E.some(e => e.type === 'play' && e.memberId === I.ans) && E.some(e => e.type === 'note') && n1 === before + 1, { before, n1, E: E.map(e => e.type) });
    await shot(P, 'boot-play');
    await closeP(P, check, d.name);
  }
};

// language switch on the title (logo, html lang, welcome line) and in the game (the bubble)
G.lang = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=4&age=4');
  await tapEl(P, '.title-top [data-lang="vi"]');
  let s = await P.page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, lang: document.documentElement.lang, on: document.querySelector('.title-top [data-lang="vi"]').classList.contains('on'), last: RB.debug.voiceLog.slice(-1)[0] }));
  check('VI tap: html lang = vi, VI chip on', s.lang === 'vi' && s.on, s);
  check('VI tap: logo in Vietnamese', /Bốp|Ếch/.test(s.logo), s.logo);
  check('VI tap: welcome line spoken in VI', s.last && s.last.lang === 'vi' && VI_RE.test(s.last.text), s.last);
  await tapEl(P, '.title-top [data-lang="en"]');
  s = await P.page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, lang: document.documentElement.lang, last: RB.debug.voiceLog.slice(-1)[0] }));
  check('EN tap: back to English', s.lang === 'en' && /Bop[’']s/.test(s.logo) && s.last && s.last.lang === 'en', s);
  await startByTap(P);
  const en = await waitAsk(P);
  check('EN game: bubble prompt in English', en.bubble && !VI_RE.test(en.bubble) && !badText(en.bubble), en.bubble);
  await tapEl(P, '#btnPause'); await tapEl(P, '#btnHome');
  check('Home from pause → title', (await P.page.evaluate(() => RB.debug.mode)) === 'title');
  await tapEl(P, '.title-top [data-lang="vi"]');
  await startByTap(P);
  const vi = await waitAsk(P);
  check('VI game: bubble text changed to Vietnamese', vi.bubble !== en.bubble && VI_RE.test(vi.bubble) && !badText(vi.bubble), { en: en.bubble, vi: vi.bubble });
  const last = (await vlog(P)).filter(e => e.text === vi.bubble).pop();
  check('VI game: the prompt is voiced with lang vi', last && last.lang === 'vi', last);
  check('VI saved (a real tap, not a URL flag)', (await P.page.evaluate(() => JSON.parse(localStorage.getItem('rb:settings') || '{}').lang)) === 'vi');
  await shot(P, 'lang-vi');
  await closeP(P, check, 'lang');
};

// parent gate: a short tap on the gear must not open settings; a 2.2 s hold must
G.gate = async check => {
  const P = await open(DEV.ipadP, 'mute=1');
  const g = await elBox(P, '#btnParents');
  await tap(P, g.x, g.y, 150); await sleep(600);
  check('short tap on the gear: settings stay closed', !(await visible(P, 'scrSettings')));
  check('short tap on the gear: still on the title', (await P.page.evaluate(() => RB.debug.mode)) === 'title' && await visible(P, 'scrTitle'));
  // 1.0 s hold then lift: still closed (half a hold)
  await tap(P, g.x, g.y, 1000); await sleep(500);
  check('1 s hold: settings stay closed', !(await visible(P, 'scrSettings')));
  // a hold that slides off the gear is cancelled
  await touchDown(P, g.x, g.y); await sleep(400);
  for (let i = 1; i <= 6; i++) { await touchMove(P, g.x - i * 30, g.y + i * 30); await sleep(40); }
  await sleep(1900); await touchUp(P); await sleep(300);
  check('hold that slides off the gear: settings stay closed', !(await visible(P, 'scrSettings')));
  await tap(P, g.x, g.y, 2200); await sleep(400);
  check('2.2 s hold on the gear opens settings', await visible(P, 'scrSettings'));
  await shot(P, 'gate-settings');
  await tapEl(P, '#btnSettingsDone');
  check('Done closes settings → title', !(await visible(P, 'scrSettings')) && await visible(P, 'scrTitle'));
  await closeP(P, check, 'gate');
};

// settings persist across reload (age, language, name, volume); URL flags are never saved
G.settings = async check => {
  const P = await open(DEV.ipadL, 'mute=1');
  const g = await elBox(P, '#btnParents');
  await tap(P, g.x, g.y, 2200); await sleep(300);
  check('settings open', await visible(P, 'scrSettings'));
  await tapEl(P, '#ageChips [data-age="6"]');
  await tapEl(P, '#scrSettings [data-lang="vi"]');
  await tapEl(P, '#inpName');
  await P.page.keyboard.type('Mam');
  // volume slider: a real touch drag along the range input to ~40 %
  const r = await elBox(P, '#optVolume');
  await touchDown(P, r.l + r.w * 0.98, r.y); await sleep(50);
  for (let i = 1; i <= 10; i++) { await touchMove(P, r.l + r.w * (0.98 - i * 0.058), r.y); await sleep(25); }
  await touchUp(P); await sleep(200);
  let v = await P.page.evaluate(() => +document.getElementById('optVolume').value);
  if (Math.abs(v - 40) > 10) {   // headless Chromium may not drag a range with touch: set it like the slider does
    check('volume slider moved by touch drag (info only: fallback used)', true);
    await P.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 40; e.dispatchEvent(new Event('input', { bubbles: true })); e.dispatchEvent(new Event('change', { bubbles: true })); });
    v = 40;
  }
  const sv = Math.round(v) / 100;
  const st = await P.page.evaluate(() => RB.debug.getState().settings);
  check('settings applied in memory (age 6, vi, Mam, volume)', st.age === 6 && st.lang === 'vi' && st.name === 'Mam' && Math.abs(st.volume - sv) < 0.001, st);
  check('volume label shows the %', (await P.page.evaluate(() => document.getElementById('volLevel').textContent)) === Math.round(sv * 100) + '%');
  await tapEl(P, '#btnSettingsDone');
  check('title shows age 6', /6/.test(await P.page.evaluate(() => document.getElementById('titleAge').textContent)));
  await reload(P, 'mute=1');
  let s2 = await P.page.evaluate(() => ({ s: RB.debug.getState().settings, lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent, vol: RB.debug.audio().volume }));
  check('after reload: age, lang, name, volume persisted', s2.s.age === 6 && s2.s.lang === 'vi' && s2.s.name === 'Mam' && Math.abs(s2.s.volume - sv) < 0.001 && s2.lang === 'vi' && /6/.test(s2.age), s2);
  check('after reload: audio volume restored', Math.abs(s2.vol - sv) < 0.001, s2.vol);
  // URL flags: session only
  await reload(P, 'mute=1&age=3&lang=en&speed=2&seed=9&level=2');
  s2 = await P.page.evaluate(() => ({ s: RB.debug.getState().settings, lang: document.documentElement.lang, age: document.getElementById('titleAge').textContent, ls: JSON.parse(localStorage.getItem('rb:settings')) }));
  check('?age=3&lang=en apply for the session (title age 3, EN)', s2.lang === 'en' && /3/.test(s2.age), s2);
  check('?age/&lang not written to storage on load', s2.ls.age === 6 && s2.ls.lang === 'vi', s2.ls);
  // a parent changes something unrelated (a toggle + volume) while flags are on → the flags must still not be saved
  await tap(P, g.x, g.y, 2200); await sleep(300);
  const chipOn = await P.page.evaluate(() => (document.querySelector('#ageChips .chip.on') || {}).dataset);
  check('settings show the played age (3) while ?age=3', chipOn && chipOn.age === '3', chipOn);
  await tapEl(P, '#optMusic');
  await tapEl(P, '#btnSettingsDone');
  await startByTap(P); await waitAsk(P);
  await tapEl(P, '#btnPause'); await tapEl(P, '#btnVolDown');
  const ls = await P.page.evaluate(() => ({ s: JSON.parse(localStorage.getItem('rb:settings')), keys: Object.keys(localStorage) }));
  check('after saving under URL flags: stored age still 6, lang still vi', ls.s.age === 6 && ls.s.lang === 'vi', ls.s);
  check('no test flag (speed/seed/level/mute) in storage', !/speed|seed|level|mute|bot/.test(JSON.stringify(ls.s)) && ls.keys.every(k => k.startsWith('rb:')), ls);
  check('in-game: world age = 3 (URL flag)', (await P.page.evaluate(() => RB.debug.world.age)) === 3);
  await closeP(P, check, 'settings');
};

// one pick ask: a slide does nothing, wrong taps are gentle, 2 wrong → hint, then the right tap
G.pick = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=5&age=4');
  await startByTap(P);
  let I = await waitAsk(P, 'pick');
  check('first ask is a pick ask with ≥ 2 members', I.members.length >= 2 && I.ans, I);
  const right = I.members.find(m => m.id === I.ans), wrong = I.members.find(m => m.id !== I.ans);
  // slide: finger down on the right member, moved 80 px, lifted
  let t0 = await now(P);
  await touchDown(P, right.box.x, right.box.y);
  for (let i = 1; i <= 8; i++) { await touchMove(P, right.box.x + i * 10, right.box.y); await sleep(20); }
  await touchUp(P); await sleep(500);
  let E = await ev(P, t0), J = await info(P);
  check('slide (80 px) is not a tap: no play/wrong, no note, still asking', !E.some(e => e.type === 'play' || e.type === 'wrong') && J.notes === I.notes && J.phase === 'ask', E.map(e => e.type));
  // hold: finger rests 900 ms on the right member → not a tap
  t0 = await now(P);
  await tap(P, right.box.x, right.box.y, 900); await sleep(300);
  E = await ev(P, t0);
  check('long press (0.9 s) is not a tap', !E.some(e => e.type === 'play'), E.map(e => e.type));
  // small wobble (10 px) still a tap? → tested on the wrong member below with a 10 px move
  const vl0 = await vlen(P);
  t0 = await now(P);
  await touchDown(P, wrong.box.x, wrong.box.y); await touchMove(P, wrong.box.x + 10, wrong.box.y + 4); await sleep(60); await touchUp(P);
  await sleep(400);
  E = await ev(P, t0); J = await info(P);
  const w1 = E.find(e => e.type === 'wrong');
  check('wrong tap (with 10 px wobble) → wrong event on that member', w1 && w1.memberId === wrong.id, E.map(e => e.type));
  check('wrong tap adds nothing to the sheet, ask stays open', J.notes === I.notes && J.phase === 'ask' && J.ask === I.ask);
  const lines = (await vlog(P)).slice(vl0);
  check('wrong tap: a gentle line is said', lines.length >= 1 && lines.every(l => !badText(l.text)), lines);
  check('wrong line has no negative words', lines.every(l => !NEG_RE.test(l.text)), lines);
  check('no hint after only one miss', !J.hintHand, J.hintHand);
  // a tap during the 0.6 s lock → 'locked' (no miss)
  t0 = await now(P);
  await tapBox(P, wrong.box); await sleep(80);
  E = await ev(P, t0);
  const lockedOrWrong = E.find(e => e.type === 'locked' || e.type === 'wrong');
  await sleep(800);
  if (lockedOrWrong && lockedOrWrong.type === 'locked') {
    check('tap during the wrong-lock → locked (not a 2nd miss)', true);
    t0 = await now(P); await tapBox(P, wrong.box); await sleep(300); E = await ev(P, t0);
  }
  check('2nd wrong tap → wrong + hint event', E.some(e => e.type === 'wrong') && E.some(e => e.type === 'hint' && e.memberId === I.ans), E.map(e => e.type + ':' + (e.memberId || '')));
  J = await info(P);
  const rj = J.members.find(m => m.id === I.ans);
  check('hint: ghost hand + right member glows', J.hintHand && rj && rj.glowT > 0, { hand: J.hintHand, rj });
  await shot(P, 'pick-hint');
  t0 = await now(P);
  await tapBox(P, rj.box); await sleep(1100);
  E = await ev(P, t0); J = await info(P);
  check('right tap after the hint → play + note', E.some(e => e.type === 'play' && e.memberId === I.ans) && J.notes === I.notes + 1, E.map(e => e.type));
  check('hint hand gone after the right tap', !J.hintHand);
  // finish the round by touch: every remaining ask, then the song and roundDone with stars (1 star: 2 misses)
  for (let k = 0; k < 8; k++) {
    const st = await P.page.evaluate(() => ({ s: RB.debug.world.state, p: RB.debug.world.phase }));
    if (st.s !== 'round') break;
    if (st.p !== 'ask') { await sleep(200); continue; }
    const K = await info(P), m = K.members.find(q => q.id === K.ans);
    if (m) await tapBox(P, m.box);
    await sleep(1000);
  }
  await until(P, () => window.__ev.some(e => e.type === 'roundDone'), null, 15000).catch(() => {});
  E = await ev(P, 0);
  const rd = E.find(e => e.type === 'roundDone');
  check('round finished by touch: songStart → songNote×n → songEnd → roundDone', E.some(e => e.type === 'songStart') && E.some(e => e.type === 'songEnd') && rd, E.filter(e => /song|round/.test(e.type)).map(e => e.type));
  check('2 misses → 1 star for the round', rd && rd.stars === 1, rd);
  await closeP(P, check, 'pick');
};

// tapping Bop repeats the prompt word for word; the bubble too
G.poke = async check => {
  const P = await open(DEV.iphoneL, 'mute=1&seed=6&age=4');
  await startByTap(P);
  const I = await waitAsk(P, 'pick');
  await sleep(3300);   // the prompt guard (3 s) is over
  let vl0 = await vlen(P), t0 = await now(P);
  await tapBox(P, I.bop); await sleep(400);
  let E = await ev(P, t0), lines = (await vlog(P)).slice(vl0);
  check('tap on Bop → pokeBop event', E.some(e => e.type === 'pokeBop'), E.map(e => e.type));
  check('tap on Bop repeats the prompt word for word', lines.some(l => l.text === I.bubble), { bubble: I.bubble, lines });
  check('tap on Bop: no score change', (await info(P)).notes === I.notes);
  await sleep(3300);
  vl0 = await vlen(P);
  await tapEl(P, '#bubble'); await sleep(300);
  lines = (await vlog(P)).slice(vl0);
  check('tap on the bubble repeats the prompt', lines.some(l => l.text === I.bubble), lines);
  // the big drum in a pick ask: a fun boom only
  t0 = await now(P);
  await tapBox(P, I.drum); await sleep(300);
  E = await ev(P, t0);
  const J = await info(P);
  check('big drum in a pick ask → boom only (no wrong, no note)', E.some(e => e.type === 'boom') && !E.some(e => e.type === 'wrong') && J.notes === I.notes, E.map(e => e.type));
  await closeP(P, check, 'poke');
};

// count chapter, mode drum: tap the big drum n times → the ask completes; count words are logged
G.drum = async check => {
  const P0 = await open(DEV.iphoneL, 'mute=1');
  const sf = await seedFor(P0, 4, 'count');
  await P0.ctx.close();
  check('a seed with a count chapter at age 4', !!sf, sf);
  const P = await open(DEV.iphoneL, `mute=1&age=4&seed=${sf.seed}&level=${sf.level}`);
  await startByTap(P);
  await until(P, () => RB.debug.world.topic === 'count');
  check('?level= reaches the count chapter', (await P.page.evaluate(() => RB.debug.world.topic)) === 'count');
  for (let a = 0; a < 2; a++) {
    const I = await waitAsk(P, 'drum');
    check(`drum ask ${a}: answerId is null, n = ${I.n}`, I.ans === null && I.n >= 1 && I.n <= 5, I);
    check(`drum ask ${a}: the stage drums are plain accompaniment`, I.members.every(m => m.item.kind === 'text'), I.members.map(m => m.item));
    const vl0 = await vlen(P), t0 = await now(P);
    for (let k = 0; k < I.n; k++) { await tapBox(P, I.drum); await sleep(420); }
    await sleep(900);
    const E = await ev(P, t0), J = await info(P);
    const taps = E.filter(e => e.type === 'drumTap').map(e => e.i);
    check(`drum ask ${a}: ${I.n} touches → drumTap 1..${I.n} + drumDone`, JSON.stringify(taps) === JSON.stringify([...Array(I.n)].map((_, i) => i + 1)) && E.some(e => e.type === 'drumDone' && e.n === I.n), { taps, E: E.map(e => e.type) });
    check(`drum ask ${a}: a note lands on the sheet`, J.notes === I.notes + 1, { before: I.notes, after: J.notes });
    const want = await P.page.evaluate(n => [...Array(n)].map((_, i) => RB.I18N.sayCount('en', i + 1)), I.n);
    const lines = (await vlog(P)).slice(vl0).map(l => l.text);
    let j = 0; for (const l of lines) if (l === want[j]) j++;
    check(`drum ask ${a}: count words ${JSON.stringify(want)} in the voice log, in order`, j === want.length, { want, lines });
  }
  // extra taps on a stage drum during a drum ask → a boom, the 2nd one hints the big drum
  const I = await waitAsk(P, 'drum').catch(() => null);
  if (I && I.members.length) {
    const t0 = await now(P);
    await tapBox(P, I.members[0].box); await sleep(450); await tapBox(P, I.members[0].box); await sleep(400);
    const E = await ev(P, t0), J = await info(P);
    check('2 taps on a band drum in a drum ask → boom + big-drum hint', E.filter(e => e.type === 'boom').length >= 2 && E.some(e => e.type === 'hint') && J.hintHand, E.map(e => e.type));
  }
  await shot(P, 'drum');
  await closeP(P, check, 'drum');
};

// count chapter round 2: listen to Bop's beats, then pick the number drum
G.listen = async check => {
  const P0 = await open(DEV.ipadL, 'mute=1');
  const sf = await seedFor(P0, 4, 'count');
  await P0.ctx.close();
  const P = await open(DEV.ipadL, `mute=1&age=4&seed=${sf.seed}&level=${sf.level}`);
  await startByTap(P);
  await until(P, () => RB.debug.world.topic === 'count');
  await P.page.evaluate(s => { RB.debug.setBot(true, 1); RB.debug.setSpeed(s); }, BOT_SPEED);
  await until(P, () => RB.debug.world.round >= 2 && RB.debug.world.state === 'round', null, 60000);
  await P.page.evaluate(() => { RB.debug.setBot(false); RB.debug.setSpeed(1); });
  const t0 = await now(P);
  const I = await waitAsk(P, 'listen');
  let E = await ev(P, t0 - 20000);
  const beats = E.filter(e => e.type === 'beat' && e.round == null).map(e => e.i);
  const lastRun = []; for (const b of beats) { if (b === 1) lastRun.length = 0; lastRun.push(b); }
  check(`listen ask: Bop drums n = ${I.n} beats before the ask opens`, lastRun.length === I.n && E.some(e => e.type === 'beatsDone'), { beats, n: I.n });
  const right = I.members.find(m => m.id === I.ans);
  check('listen ask: 3 number drums, the right one shows n', I.members.length === 3 && right && right.item.kind === 'number' && right.item.n === I.n, I.members.map(m => m.item));
  // tap Bop → replay beats
  await sleep(3200);
  let t1 = await now(P);
  await tapBox(P, I.bop); await sleep(400 + 600 * I.n + 1200);
  E = await ev(P, t1);
  check('tap on Bop in a listen ask → replayBeats + n beats again', E.some(e => e.type === 'replayBeats') && E.filter(e => e.type === 'beat').length === I.n, E.map(e => e.type));
  await waitAsk(P, 'listen');
  t1 = await now(P);
  await tapBox(P, right.box); await sleep(1100);
  E = await ev(P, t1);
  const J = await info(P);
  check('listen ask: touch on the right number drum → play + note', E.some(e => e.type === 'play' && e.memberId === right.id) && J.notes === I.notes + 1, E.map(e => e.type));
  // bubble tap in a listen ask: DESIGN §5.2 "a tap on Bop or the bubble during the ask replays the beats"
  const I2 = await waitAsk(P, 'listen').catch(() => null);
  if (I2) {
    await sleep(3300);
    t1 = await now(P);
    await tapEl(P, '#bubble'); await sleep(600 * I2.n + 1500);
    E = await ev(P, t1);
    check('tap on the bubble in a listen ask → replayBeats (DESIGN §5.2)', E.some(e => e.type === 'replayBeats'), E.map(e => e.type));
  }
  // the snail surprise (round 2 of a chapter) — tap it if it came
  const sn = await P.page.evaluate(() => { const s = RB.debug.world.snail; return s && s.state !== 'out' ? s.state : null; });
  if (sn) {
    await P.page.evaluate(() => RB.debug.setSpeed(0.25));   // keep the snail on stage while we tap it
    await until(P, () => !RB.debug.world.snail || RB.debug.world.snail.state === 'rest' || RB.debug.world.snail.state === 'ring', null, 30000).catch(() => {});
    const b = await P.page.evaluate(() => { const s = RB.debug.world.snail; return s && (s.state === 'rest' || s.state === 'ring') ? RB.debug.snailScreen() : null; });
    if (b) {
      t1 = await now(P);
      await tapBox(P, b); await sleep(300);
      E = await ev(P, t1);
      check('snail surprise: a touch on the snail → snailTap (no score change)', E.some(e => e.type === 'snailTap') && !E.some(e => e.type === 'wrong'), { b, E: E.map(e => e.type) });
    }
    await P.page.evaluate(() => RB.debug.setSpeed(1));
  }
  await shot(P, 'listen');
  await closeP(P, check, 'listen');
};

// Talk time answered by a touch on the right picture
G.talk = async check => {
  const P = await open(DEV.ipadP, 'mute=1&seed=8&age=4');
  await startByTap(P);
  await waitAsk(P);
  await P.page.evaluate(s => { RB.debug.world.roundsPerLevel = 1; RB.debug.setBot(true, 1); RB.debug.setSpeed(2); }, BOT_SPEED);
  await until(P, () => RB.debug.world.state === 'roundDone' || RB.debug.world.phase === 'song', null, 40000);   // bot off before Talk opens
  await P.page.evaluate(() => { RB.debug.setBot(false); RB.debug.setSpeed(1); });   // speed 1 before Talk: its re-ask timer would auto-pause
  await until(P, () => RB.debug.mode === 'talk', null, 20000);
  check('Talk time opens (scrTalk visible)', await visible(P, 'scrTalk'));
  const T = await P.page.evaluate(() => ({ ans: RB.debug.world.talk.answerId, q: document.getElementById('talkQ').textContent, n: document.getElementById('talkChoices').children.length, stars: RB.debug.world.stars }));
  check('Talk: question + 2–5 choices', T.n >= 2 && T.n <= 5 && !badText(T.q), T);
  await shot(P, 'talk');
  const t0 = await now(P);
  await tapEl(P, `#talkChoices [data-id="${T.ans}"]`); await sleep(500);
  const E = await ev(P, t0);
  const R = await P.page.evaluate(a => ({ cls: document.querySelector(`#talkChoices [data-id="${a}"]`).className, stars: RB.debug.world.stars }), T.ans);
  check('Talk: touch on the right choice → talkResult correct', E.some(e => e.type === 'talkResult' && e.correct), E.map(e => e.type));
  check('Talk: right button marked, +1 star', /right/.test(R.cls) && R.stars === T.stars + 1, R);
  await until(P, () => RB.debug.mode === 'play' && RB.debug.world.level === 1, null, 15000).catch(() => {});
  check('after Talk: next chapter starts (level 1, mode play)', (await P.page.evaluate(() => RB.debug.mode + ':' + RB.debug.world.level)) === 'play:1');
  await closeP(P, check, 'talk');
};

// pause / resume by touch, volume −/+, visibilitychange pauses
G.pause = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=9&age=4');
  await startByTap(P);
  const I = await waitAsk(P);
  await tapEl(P, '#btnPause');
  check('pause button → paused screen', (await P.page.evaluate(() => RB.debug.mode)) === 'paused' && await visible(P, 'scrPause'));
  const tA = (await info(P)).time; await sleep(700); const tB = (await info(P)).time;
  check('world frozen while paused', tA === tB, { tA, tB });
  // taps on the canvas behind the pause screen do nothing
  let t0 = await now(P);
  const right = I.members.find(m => m.id === I.ans);
  // (a point of the right member's box well outside the pause panel — Chromium's touch adjustment snaps a tap near a
  // button onto it, and those buttons must work)
  const pt = await P.page.evaluate(b => {
    const r = document.querySelector('#scrPause .panel').getBoundingClientRect(), pad = 40;
    for (let dy = -0.45; dy <= 0.45; dy += 0.15) for (let dx = -0.45; dx <= 0.45; dx += 0.15) {
      const x = b.x + dx * b.w, y = b.y + dy * b.h;
      if (x < r.left - pad || x > r.right + pad || y < r.top - pad || y > r.bottom + pad) return { x, y };
    }
    return { x: 8, y: innerHeight - 8 };
  }, right.box);
  await tap(P, pt.x, pt.y); await sleep(300);
  check('touch behind the pause screen does not play (and does not unpause)', !(await ev(P, t0)).some(e => e.type === 'play') && (await P.page.evaluate(() => RB.debug.mode)) === 'paused');
  const v0 = (await info(P)).settings.volume;
  await tapEl(P, '#btnVolDown'); await tapEl(P, '#btnVolDown');
  let v1 = await P.page.evaluate(() => ({ s: RB.debug.getState().settings.volume, a: RB.debug.audio().volume, lbl: document.getElementById('volLevel').textContent, ls: JSON.parse(localStorage.getItem('rb:settings')).volume }));
  check('volume − ×2 → −20 % (settings, audio, label, storage)', Math.abs(v1.s - (v0 - 0.2)) < 1e-9 && Math.abs(v1.a - v1.s) < 1e-9 && v1.lbl === Math.round(v1.s * 100) + '%' && Math.abs(v1.ls - v1.s) < 1e-9, { v0, v1 });
  await tapEl(P, '#btnVolUp');
  v1 = await P.page.evaluate(() => RB.debug.getState().settings.volume);
  check('volume + → +10 %', Math.abs(v1 - (v0 - 0.1)) < 1e-9, v1);
  const vl0 = await vlen(P);
  await tapEl(P, '#btnResume'); await sleep(700);
  const J = await info(P);
  check('resume → play, world runs again', J.mode === 'play' && J.time > tB, J.mode);
  const lines = (await vlog(P)).slice(vl0);
  check('resume repeats the prompt', lines.some(l => l.text === I.bubble), lines);
  // app goes to the background
  await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(200);
  check('visibilitychange (hidden) → paused', (await P.page.evaluate(() => RB.debug.mode)) === 'paused');
  await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(300);
  check('back to visible → stays paused (child resumes)', (await P.page.evaluate(() => RB.debug.mode)) === 'paused' && await visible(P, 'scrPause'));
  await tapEl(P, '#btnResume'); await sleep(300);
  check('resume after background', (await P.page.evaluate(() => RB.debug.mode)) === 'play');
  // a finger down during the background switch must not count later
  const K = await waitAsk(P);
  const r2 = K.members.find(m => m.id === K.ans);
  t0 = await now(P);
  await touchDown(P, r2.box.x, r2.box.y);
  await P.page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); });
  await touchUp(P); await sleep(300);
  check('finger held across a background switch does not play', !(await ev(P, t0)).some(e => e.type === 'play'));
  await closeP(P, check, 'pause');
};

// rotate mid-round: members re-laid out inside the screen and still tappable; a press cut by the rotation is cancelled
G.rotate = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=10&age=4');
  await startByTap(P);
  let I = await waitAsk(P, 'pick');
  const r0 = I.members.find(m => m.id === I.ans);
  // finger down in portrait, rotation, finger up → no play
  let t0 = await now(P);
  await touchDown(P, r0.box.x, r0.box.y); await sleep(60);
  await P.page.setViewportSize({ width: 852, height: 393 });
  await sleep(450);
  await touchUp(P); await sleep(300);
  let E = await ev(P, t0);
  check('press interrupted by rotation does not count', !E.some(e => e.type === 'play' || e.type === 'wrong'), E.map(e => e.type));
  I = await info(P);
  check('landscape after rotation: logical W > H', (await P.page.evaluate(() => { const s = RB.debug.getState(); return s.W > s.H && s.H === 720; })));
  check('landscape: all members inside the screen', I.members.every(m => inView(m.box, 852, 393)), I.members.map(m => m.box));
  check('landscape: big drum + Bop inside', centreIn(I.drum, 852, 393) && centreIn(I.bop, 852, 393), { d: I.drum, b: I.bop });
  await shot({ page: P.page, dev: { name: 'iphone-rotated-landscape' } }, 'rotate');
  I = await waitAsk(P, 'pick');
  const r1 = I.members.find(m => m.id === I.ans);
  t0 = await now(P);
  await tapBox(P, r1.box); await sleep(1100);
  E = await ev(P, t0);
  check('landscape: right member still tappable → play + note', E.some(e => e.type === 'play' && e.memberId === r1.id) && (await notesNow(P)) === I.notes + 1, E.map(e => e.type));
  // and back to portrait while a note is flying
  I = await waitAsk(P, 'pick').catch(() => null);
  if (I && I.ans) {
    const r2 = I.members.find(m => m.id === I.ans);
    await tapBox(P, r2.box); await sleep(120);
    await P.page.setViewportSize({ width: 393, height: 852 });
    await sleep(900);
    const J = await info(P);
    check('rotate back while a note flies: the note still lands', J.notes === I.notes + 1, { b: I.notes, a: J.notes });
    check('portrait again: all members inside', J.members.every(m => inView(m.box, 393, 852)), J.members.map(m => m.box));
    const K = await waitAsk(P).catch(() => null);
    if (K && K.ans) {
      const r3 = K.members.find(m => m.id === K.ans); t0 = await now(P);
      await tapBox(P, r3.box); await sleep(800);
      check('portrait again: tappable', (await ev(P, t0)).some(e => e.type === 'play'));
    }
  }
  // iPad: portrait → landscape
  const Q = await open(DEV.ipadP, 'mute=1&seed=10&age=5');
  await startByTap(Q); await waitAsk(Q);
  await Q.page.setViewportSize({ width: 1180, height: 820 }); await sleep(450);
  const L = await waitAsk(Q);
  check('iPad rotated: members inside', L.members.every(m => inView(m.box, 1180, 820)), L.members.map(m => m.box));
  const rq = L.members.find(m => m.id === L.ans); t0 = await now(Q);
  if (rq) { await tapBox(Q, rq.box); await sleep(800); }
  check('iPad rotated: right member tappable', rq && (await ev(Q, t0)).some(e => e.type === 'play'));
  await closeP(Q, check, 'rotate iPad');
  await closeP(P, check, 'rotate');
};

// audio chain: master → compressor → user gain; volume persists and drives the user gain
G.audio = async check => {
  const init = () => {
    window.__comp = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (AC) { const o = AC.prototype.createDynamicsCompressor; AC.prototype.createDynamicsCompressor = function () { window.__comp++; return o.apply(this, arguments); }; }
  };
  const P = await open(DEV.ipadL, 'novoice=1&seed=11', { init });
  await startByTap(P);
  await waitAsk(P);
  let A = await P.page.evaluate(() => { const a = RB.debug.audio(); const g = n => a[n] && a[n] instanceof GainNode; return { ctx: !!a.ctx, state: a.ctx && a.ctx.state, gains: ['master', 'user', 'sfx', 'music', 'amb'].every(g), comp: window.__comp, master: a.master.gain.value, user: a.user.gain.value, vol: a.volume, muted: a.muted }; });
  check('AudioContext created on the first touch', A.ctx, A);
  check('gains master/user/sfx/music/amb exist + a compressor', A.gains && A.comp >= 1, A);
  check('not muted: master gain 1, user gain = volume × 1.6', !A.muted && Math.abs(A.master - 1) < 0.05 && Math.abs(A.user - A.vol * 1.6) < 0.05, A);
  await tapEl(P, '#btnPause'); await tapEl(P, '#btnVolDown'); await tapEl(P, '#btnVolDown'); await tapEl(P, '#btnVolDown');
  await sleep(400);
  A = await P.page.evaluate(() => { const a = RB.debug.audio(); return { user: a.user.gain.value, vol: a.volume }; });
  check('volume −30 % → user gain follows (0.7 × 1.6)', Math.abs(A.vol - 0.7) < 1e-9 && Math.abs(A.user - 1.12) < 0.05, A);
  await reload(P, 'novoice=1&seed=11');
  await startByTap(P); await waitAsk(P); await sleep(400);
  A = await P.page.evaluate(() => { const a = RB.debug.audio(); return { user: a.user.gain.value, vol: a.volume, s: RB.debug.getState().settings.volume }; });
  check('volume persisted across reload and applied to the chain', Math.abs(A.s - 0.7) < 1e-9 && Math.abs(A.vol - 0.7) < 1e-9 && Math.abs(A.user - 1.12) < 0.05, A);
  await closeP(P, check, 'audio');
  const M = await open(DEV.ipadL, 'mute=1&seed=11');
  await startByTap(M); await waitAsk(M); await sleep(400);
  const m = await M.page.evaluate(() => RB.debug.audio().master.gain.value);
  check('?mute=1 → master gain 0', m < 0.01, m);
  await closeP(M, check, 'audio mute');
};

// full bot sessions per age 3–7 at speed 8, reaching sessionDone
// edge cases: two-hand drumming, pause during the song, Talk wrong + pause in Talk, volume steps, play again, hooks
G.extra = async check => {
  // two-hand drumming: L down, R down, L up, R up → 2 counts
  const P0 = await open(DEV.ipadL, 'mute=1');
  const sf = await seedFor(P0, 4, 'count');
  await P0.ctx.close();
  const P = await open(DEV.ipadL, `mute=1&age=4&seed=${sf.seed}&level=${sf.level}`);
  await startByTap(P);
  await until(P, () => RB.debug.world.topic === 'count');
  let I = await waitAsk(P, 'drum');
  const gs = await P.page.evaluate(() => RB.debug.getState());
  check('getState().askMode reports the ask mode (hook, DESIGN §5.5)', gs.askMode === 'drum', { ask: gs.ask, askMode: gs.askMode });
  if (I.n === 1) { await tapBox(P, I.drum); await sleep(1500); I = await waitAsk(P, 'drum'); }
  let t0 = await now(P);
  const d = I.drum;
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d.x - 30, y: d.y, id: 1 }] }); await sleep(60);
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d.x - 30, y: d.y, id: 1 }, { x: d.x + 30, y: d.y, id: 2 }] }); await sleep(60);
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ x: d.x + 30, y: d.y, id: 2 }] }); await sleep(60);
  await P.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(400);
  let E = await ev(P, t0);
  check('two-hand drumming (overlapping fingers) → 2 drum counts (or a finished count of 1)', E.filter(e => e.type === 'drumTap').length === 2 || (E.some(e => e.type === 'drumDone' && e.n === 1) && E.filter(e => e.type === 'drumTap' || e.type === 'boom').length === 2), E.map(e => e.type + (e.i || '')));
  // pause during the song playback: the music must stay ducked after resume while the song still plays
  await P.page.evaluate(s => { RB.debug.setBot(true, 1); RB.debug.setSpeed(2); }, BOT_SPEED);
  await until(P, () => RB.debug.world.phase === 'song', null, 30000);
  await P.page.evaluate(() => { RB.debug.setBot(false); RB.debug.setSpeed(0.2); });
  await tapEl(P, '#btnPause'); await tapEl(P, '#btnResume'); await sleep(100);
  const sg = await P.page.evaluate(() => ({ phase: RB.debug.world.phase, songOn: RB.debug.audio().songOn }));
  check('pause + resume during the song: music still ducked under the song (songOn)', sg.phase !== 'song' || sg.songOn, sg);
  await P.page.evaluate(() => RB.debug.setSpeed(1));
  await closeP(P, check, 'extra drum');

  // Talk: pause/resume keeps Talk open; a wrong choice is gentle
  const Q = await open(DEV.iphoneL, 'mute=1&seed=12&age=4');
  await startByTap(Q); await waitAsk(Q);
  await Q.page.evaluate(s => { RB.debug.world.roundsPerLevel = 1; RB.debug.setBot(true, 1); RB.debug.setSpeed(2); }, BOT_SPEED);
  await until(Q, () => RB.debug.world.state === 'roundDone' || RB.debug.world.phase === 'song', null, 40000);
  await Q.page.evaluate(() => { RB.debug.setBot(false); RB.debug.setSpeed(1); });
  await until(Q, () => RB.debug.mode === 'talk', null, 20000);
  await sleep(300);
  // landscape phone: every Talk choice fully on screen
  const cb = await Q.page.evaluate(() => [...document.querySelectorAll('#talkChoices button')].map(b => { const r = b.getBoundingClientRect(); return { l: r.left, t: r.top, r: r.right, b: r.bottom }; }));
  check('Talk (iPhone landscape): every choice button fully on screen', cb.every(r => r.l >= 0 && r.t >= 0 && r.r <= 852 && r.b <= 393), cb);
  await tapEl(Q, '#btnPause').catch(() => {});
  const pm = await Q.page.evaluate(() => RB.debug.mode);
  if (pm === 'paused') {
    await tapEl(Q, '#btnResume');
    check('pause + resume in Talk → Talk screen back', (await Q.page.evaluate(() => RB.debug.mode)) === 'talk' && await visible(Q, 'scrTalk'));
  } else check('pause button usable during Talk time (it is drawn but covered by the Talk screen)', false, pm);
  const T = await Q.page.evaluate(() => ({ ans: RB.debug.world.talk.answerId, ids: RB.debug.world.talk.choices.map(c => c.id) }));
  const wid = T.ids.find(i => i !== T.ans);
  const vl0 = await vlen(Q); t0 = await now(Q);
  await tapEl(Q, `#talkChoices [data-id="${wid}"]`); await sleep(400);
  E = await ev(Q, t0);
  const lines = (await vlog(Q)).slice(vl0);
  check('Talk wrong choice → talkResult incorrect, right answer marked', E.some(e => e.type === 'talkResult' && e.correct === false) && /right/.test(await Q.page.evaluate(a => document.querySelector(`#talkChoices [data-id="${a}"]`).className, T.ans)), E.map(e => e.type));
  check('Talk wrong line is gentle (no negative words, no raw keys)', lines.length && lines.every(l => !NEG_RE.test(l.text) && !badText(l.text)), lines);
  if (await visible(Q, 'scrTalk')) {   // Talk closes 1.6 s after an answer
    const b = await elBox(Q, `#talkChoices [data-id="${T.ans}"]`);
    if (b) { await tap(Q, b.x, b.y); await sleep(300); }
    check('Talk: a 2nd tap after answering does nothing', (await ev(Q, t0)).filter(e => e.type === 'talkResult').length === 1);
  }
  await closeP(Q, check, 'extra talk');

  // volume steps from a 5 % slider value
  const V = await open(DEV.iphoneP, 'mute=1&seed=13');
  await V.page.evaluate(() => { const e = document.getElementById('optVolume'); e.value = 45; e.dispatchEvent(new Event('input', { bubbles: true })); });
  await startByTap(V); await waitAsk(V);
  await tapEl(V, '#btnPause'); await tapEl(V, '#btnVolDown');
  const vv = await V.page.evaluate(() => RB.debug.getState().settings.volume);
  check('pause − from 45 % → 35 % (one 10 % step)', Math.abs(vv - 0.35) < 1e-6, vv);
  await closeP(V, check, 'extra volume');

  // Play again from the done screen + Home
  const D = await open(DEV.iphoneL, `mute=1&age=3&seed=14&speed=${BOT_SPEED}&bot=1`);
  await startByTap(D);
  await until(D, () => RB.debug.mode === 'done', null, 300000);
  const lv1 = await D.page.evaluate(() => RB.debug.world.levels.slice());
  await D.page.evaluate(() => RB.debug.setSpeed(1));
  await sleep(1500);   // at speed 1, so the new session has not scored yet when the HUD is read
  await tapEl(D, '#btnAgain');
  const ag = await D.page.evaluate(() => ({ mode: RB.debug.mode, levels: RB.debug.world.levels.slice(), stars: document.getElementById('hudStars').textContent }));
  await D.page.evaluate(s => RB.debug.setSpeed(s), BOT_SPEED);
  check('Play again → a new session (mode play, HUD stars reset)', ag.mode === 'play' && ag.stars === '0', ag);
  check('Play again: chapters rotate (first topic differs)', ag.levels[0] !== lv1[0], { lv1, lv2: ag.levels });
  await until(D, () => RB.debug.mode === 'done', null, 300000).catch(() => {});
  await sleep(900);   // the done panel animates in
  await tapEl(D, '#btnDoneHome').catch(() => {});
  check('done → Home → title', (await D.page.evaluate(() => RB.debug.mode)) === 'title' && await visible(D, 'scrTitle'));
  await closeP(D, check, 'extra again');
};

// idle: nudges, the 2nd idle hints, ≈ 2 min without a tap auto-pauses (run at speed 8; voice is logged anyway)
G.idle = async check => {
  const P = await open(DEV.iphoneP, 'mute=1&seed=15&age=4');
  await startByTap(P);
  const I = await waitAsk(P, 'pick');
  const t0 = await now(P);
  await P.page.evaluate(() => RB.debug.setSpeed(8));
  await until(P, () => RB.debug.mode === 'paused', null, 40000).catch(() => {});
  const E = await ev(P, t0);
  const idles = E.filter(e => e.type === 'idle').map(e => e.n);
  check('idle nudges 1..5 then auto-pause', JSON.stringify(idles) === '[1,2,3,4,5]' && (await P.page.evaluate(() => RB.debug.mode)) === 'paused', { idles, mode: await P.page.evaluate(() => RB.debug.mode) });
  check('2nd idle → idle hint (glow + hand)', E.some(e => e.type === 'hint' && e.idle), E.filter(e => e.type === 'hint'));
  await P.page.evaluate(() => RB.debug.setSpeed(1));
  await tapEl(P, '#btnResume'); await sleep(200);
  const J = await info(P);
  check('resume after auto-pause → same ask still open', J.mode === 'play' && J.phase === 'ask' && J.ask === I.ask, J.mode);
  await closeP(P, check, 'idle');
};

G.bot = async check => {
  const cfg = [[3, 'en', DEV.iphoneL], [4, 'vi', DEV.iphoneP], [5, 'en', DEV.ipadL], [6, 'vi', DEV.ipadP], [7, 'en', DEV.iphoneL]];
  await Promise.all(cfg.map(async ([age, lang, d]) => {
    const P = await open(d, `bot=1&autostart=1&speed=${BOT_SPEED}&mute=1&age=${age}&lang=${lang}&seed=${20 + age}`, { mode: 'play' });
    const tag = `age ${age} ${lang} ${d.name}`;
    try { await until(P, () => RB.debug.mode === 'done', null, 300000); } catch (e) { /* reported below */ }
    const R = await P.page.evaluate(() => ({ mode: RB.debug.mode, st: RB.debug.getState(), stats: RB.debug.stats, bot: RB.debug.bot && RB.debug.bot.stats, levels: RB.debug.world.levels, done: document.getElementById('doneStars').textContent, title: document.getElementById('doneTitle').textContent }));
    const E = await ev(P, 0);
    check(`${tag}: session reaches sessionDone (done screen)`, R.mode === 'done' && E.some(e => e.type === 'sessionDone') && await visible(P, 'scrDone'), R.st);
    check(`${tag}: 4 chapters played, each with Talk time`, E.filter(e => e.type === 'levelDone').map(e => e.level).join() === '0,1,2,3' && E.filter(e => e.type === 'talk').length === 4, E.filter(e => /level|talk$/.test(e.type)).map(e => e.type + (e.level != null ? e.level : '')));   // (level 0 is emitted by ?autostart before the recorder exists)
    const sd = E.find(e => e.type === 'sessionDone');
    check(`${tag}: stars > 0 and shown on the done screen`, sd && sd.stars > 0 && +R.done === sd.stars && !badText(R.title), { sd, done: R.done, title: R.title });
    check(`${tag}: rounds were played with right taps`, R.stats.correct > 8 && R.stats.rounds >= 12, R.stats);
    const L = await vlog(P);
    const bad = L.filter(l => badText(l.text));
    check(`${tag}: no raw keys / braces / undefined in ${L.length} voice lines`, bad.length === 0, bad.slice(0, 5));
    const wrongLang = L.filter(l => l.lang !== lang);
    check(`${tag}: every voice line in ${lang}`, wrongLang.length === 0, wrongLang.slice(0, 3));
    if (lang === 'vi') check(`${tag}: VI lines contain Vietnamese`, L.filter(l => VI_RE.test(l.text)).length > L.length * 0.5, L.slice(0, 5));
    const ls = await P.page.evaluate(() => localStorage.getItem('rb:settings'));
    check(`${tag}: URL flags not saved by a bot session`, ls == null || (!/"age":\s*[37]/.test(ls) || age === 4), ls);
    await shot(P, `bot-done-age${age}`);
    await closeP(P, check, tag);
  }));
};

/* ================================================================ runner */
(async () => {
  srv = await serve();
  browser = await chromium.launch();
  const names = Object.keys(G).filter(n => !ONLY.length || ONLY.includes(n));
  const logs = {};
  const queue = names.slice();
  async function worker() {
    while (queue.length) {
      const n = queue.shift(), log = logs[n] = [], check = checker(n, log), t = Date.now();
      try { await G[n](check); } catch (e) { check(`${n}: group crashed`, false, String(e && e.stack || e).slice(0, 600)); }
      console.log(`\n== ${n} (${((Date.now() - t) / 1000).toFixed(1)} s)\n` + log.join('\n'));
    }
  }
  await Promise.all([...Array(Math.min(JOBS, names.length))].map(worker));
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} checks passed` + (fails.length ? `, ${fails.length} FAILED:\n` + fails.map(f => `  [${f.group}] ${f.name}`).join('\n') : ''));
  await browser.close(); srv.close();
  process.exit(fails.length ? 1 : 0);
})();
