// Functional QA suite for Mầm's Treasure Reef — real touch input on iPhone/iPad-sized mobile contexts.
//   node tests/e2e/functional.js                 (all groups)
//   node tests/e2e/functional.js drag dig        (only some groups)
// Groups: boot lang gate profiles map resume drag dig count talk settings rotate bot
// Prints PASS/FAIL per check, writes tests/out/functional/results.json + screenshots, exits 1 on any FAIL.
// The bot bypasses the input layer, so every "finger" here is a real touch (CDP touch events → pointer events)
// or page.touchscreen.tap; the bot is only used to fast-forward to a state (then switched off by a page-side hook).
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
const BASE = 'mute=1&profile=test';          // every page: silent, progress in memory

const results = [];
let curGroup = '';
function check(name, ok, info) {
  results.push({ group: curGroup, name, ok: !!ok, info: info == null ? '' : info });
  console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || info == null ? '' : '  -- ' + (typeof info === 'string' ? info : JSON.stringify(info)).slice(0, 600)));
  return !!ok;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
const VI_RE = /[ăâđêôơưàáạảãèéẹẻẽìíịỉĩòóọỏõùúụủũỳýỵỷỹằắặẳẵầấậẩẫềếệểễồốộổỗờớợởỡừứựửữ]/i;

let srv, browser;
async function open(dev, q = '') {
  const ctx = await browser.newContext({ viewport: dev.viewport, deviceScaleFactor: dev.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(srv.url + '?' + BASE + (q ? '&' + q : ''));
  await waitTitle(page);
  await installHook(page);
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, errors, cdp, dev, N: `[${dev.name}]` };
}
async function waitTitle(page) {
  await page.waitForFunction(() => window.TR && TR.debug && TR.debug.mode && TR.debug.mode !== 'loading', null, { timeout: 20000 });
}
/* Page-side hook: every drained world event is copied into window.__events; window.__stopOn(e) (optional) switches the
 * bot off and the speed to 1 as soon as a matching event is drained (deterministic hand-over from bot to finger). */
async function installHook(page) {
  await page.evaluate(() => {
    window.__events = [];
    const w = TR.debug.world;
    if (w.__hooked) return;
    w.__hooked = true;
    const o = w.drainEvents;
    w.drainEvents = function () {
      const evs = o.call(this);
      for (const e of evs) {
        const c = Object.assign({ at: Math.round(performance.now()) }, e); delete c.talk;
        window.__events.push(c);
        if (window.__stopOn) { try { if (window.__stopOn(e)) { window.__stopOn = null; TR.debug.setBot(false); TR.debug.setSpeed(1); } } catch (err) { window.__stopOn = null; } }
      }
      return evs;
    };
  });
}
const stopOn = (page, body) => page.evaluate(b => { window.__stopOn = new Function('e', b); }, body);
const evTypes = page => page.evaluate(() => window.__events.map(e => e.type));
const evOf = (page, t) => page.evaluate(t => window.__events.filter(e => e.type === t), t);
const clearEv = page => page.evaluate(() => { window.__events = []; });
const lastEv = (page, n = 12) => page.evaluate(n => window.__events.slice(-n).map(e => { const o = Object.assign({}, e); delete o.at; return o; }), n);
const mode = page => page.evaluate(() => TR.debug.mode);
const visible = (page, id) => page.evaluate(i => { const e = document.getElementById(i); return !!e && !e.classList.contains('hidden') && e.getBoundingClientRect().width > 0; }, id);
const itemOf = (page, id) => page.evaluate(id => { const i = TR.debug.world.items.find(i => i.id === id); return i && { id: i.id, state: i.state, x: i.x, y: i.y, homeX: i.homeX, homeY: i.homeY, basketId: i.basketId, misses: i.misses, size: i.size }; }, id);
const moundOf = (page, id) => page.evaluate(id => { const m = TR.debug.world.mounds.find(m => m.id === id); return m && { id: m.id, state: m.state, glow: m.glow, crab: m.crab, itemId: m.itemId, x: m.x, y: m.y, w: m.w, h: m.h }; }, id);
async function shot(c, name) { try { await c.page.screenshot({ path: path.join(OUT, `${c.dev.name}-${name}.png`) }); } catch (e) { /* ignore */ } }

/* ---------- input helpers (CDP touch = real touch → pointer events in Chromium) ---------- */
async function touch(cdp, type, pts) { await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(p => ({ x: p.x, y: p.y, id: p.id || 0, radiusX: 4, radiusY: 4, force: 1 })) }); }
async function tap(c, x, y) { await c.page.touchscreen.tap(x, y); }
async function hold(c, x, y, ms) { await touch(c.cdp, 'touchStart', [{ x, y }]); await sleep(ms); await touch(c.cdp, 'touchEnd', []); }
async function box(c, sel) {
  const loc = c.page.locator(sel).first();
  await loc.evaluate(e => e.scrollIntoView({ block: 'nearest' })).catch(() => {});
  return loc.boundingBox();
}
async function tapEl(c, sel) {
  const bb = await box(c, sel);
  if (!bb) throw new Error('no box for ' + sel);
  await tap(c, bb.x + bb.width / 2, bb.y + bb.height / 2);
  await sleep(80);
}
/** finger path from → to with `steps` moves (≥ 8), then release (unless opt.noUp) */
async function drag(c, from, to, opt = {}) {
  const steps = Math.max(8, opt.steps || 12);
  await touch(c.cdp, 'touchStart', [from]);
  await sleep(opt.holdFirst || 60);
  for (let i = 1; i <= steps; i++) {
    const u = i / steps, e = u * u * (3 - 2 * u);
    await touch(c.cdp, 'touchMove', [{ x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e }]);
    await sleep(16);
  }
  await sleep(opt.settle || 280);           // let the spring catch up with the finger
  if (opt.beforeUp) await opt.beforeUp();
  if (!opt.noUp) await touch(c.cdp, 'touchEnd', []);
}
/** logical → CSS px */
async function css(page, x, y) { return page.evaluate(([x, y]) => { const v = TR.debug.view(); return { x: v.left + x * v.s, y: v.top + y * v.s }; }, [x, y]); }
async function waitRound(page, timeout = 20000) {
  await page.waitForFunction(() => TR.debug.mode === 'play' && TR.debug.world.state === 'round' && TR.debug.world.interactive &&
    TR.debug.world.items.every(i => i.state === 'idle' || i.state === 'in' || i.state === 'buried'), null, { timeout });
}
async function roundInfo(page) {
  return page.evaluate(() => {
    const w = TR.debug.world;
    return { mode: w.cur && w.cur.mode, mech: w.cur && w.cur.mech, topic: w.topic, round: w.round, level: w.level, target: w.target, queue: (w.queue || []).slice(), crab: w.cur && w.cur.crab || null, need: w.cur && w.cur.need || null,
      items: w.items.map(i => ({ id: i.id, answer: i.answer, goal: w.goalOf ? w.goalOf(i) : i.answer, x: i.x, y: i.y, size: i.size, scale: i.scale, state: i.state, homeX: i.homeX, homeY: i.homeY, moundId: i.moundId, label: i.label })),
      baskets: w.baskets.map(b => ({ id: b.id, kind: b.kind, label: b.label, x: b.x, y: b.y, w: b.w, h: b.h, top: b.top, bottom: b.bottom, need: b.need, count: b.count, reserved: b.reserved, glow: b.glow })),
      mounds: w.mounds.map(m => ({ id: m.id, x: m.x, y: m.y, w: m.w, h: m.h, state: m.state, itemId: m.itemId, crab: m.crab, glow: m.glow })),
      targetMound: (w.targetMound && w.targetMound() || {}).id || null, roundMistakes: w.roundMistakes, layout: { W: w.layout.W, H: w.layout.H, play: w.layout.play, groundY: w.layout.groundY, tutu: w.layout.tutu } };
  });
}
async function startGame(c, lagoon, opt = {}) {
  await c.page.evaluate(([l, bot, speed]) => { TR.debug.setBot(!!bot, 1); TR.debug.setSpeed(speed || 1); TR.debug.startGame(l); }, [lagoon, !!opt.bot, opt.speed || 1]);
  if (!opt.bot) await waitRound(c.page);
}
/** drop point in CSS px for a chest: 60 logical px ABOVE the opening (kids drop high) */
async function dropPoint(page, b) { return css(page, b.x, b.y - 60); }
async function moundPoint(page, m) { return css(page, m.x, m.y - m.h * 0.5); }
/** an empty point (logical) in the play band that is in no chest's drop zone and away from items */
async function emptyPoint(page) {
  return page.evaluate(() => {
    const w = TR.debug.world, L = w.layout, P = w.playRect || L.play;
    const bad = (x, y) => w.chestAt(x, y) || w.chestAt(x, y - 10) || w.chestAt(x, y + 20) ||
      (Math.abs(x - L.tutu.x) < L.tutu.h * 0.6 && y < L.tutu.y + 20 && y > L.tutu.y - L.tutu.h * 1.1) ||
      w.items.some(i => i.state !== 'leave' && Math.hypot(i.x - x, i.y - y) < 0.6 * i.size + 40);
    for (let y = P.y + 20; y < P.y + P.h; y += 12) for (let x = P.x + 20; x < P.x + P.w; x += 14) if (!bad(x, y)) return { x, y };
    return { x: P.x + P.w / 2, y: P.y + 20 };
  });
}
/* geometry validator: items + mounds inside the logical viewport, nothing stuck in drag */
async function geometry(page) {
  return page.evaluate(() => {
    const w = TR.debug.world, L = w.layout, probs = [];
    for (const it of w.items) {
      if (it.state === 'leave') continue;
      const hs = (it.size * (it.scale || 1)) / 2;
      if (it.x - hs < -2 || it.x + hs > L.W + 2 || it.y - hs < -2 || it.y + hs > L.H + 2) probs.push(`${it.id} off-screen (${it.x | 0},${it.y | 0}) ${it.state} W=${L.W} H=${L.H}`);
      if (it.state === 'drag' && it.id !== w.held) probs.push(`${it.id} stuck in drag`);
    }
    for (const m of w.mounds) if (m.x - m.w / 2 < -2 || m.x + m.w / 2 > L.W + 2 || m.y > L.H + 2 || m.y - m.h < -2) probs.push(`mound ${m.id} off-screen (${m.x | 0},${m.y | 0})`);
    for (const b of w.baskets) if (b.x - b.w / 2 < -2 || b.x + b.w / 2 > L.W + 2 || b.bottom > L.H + 2) probs.push(`chest ${b.id} off-screen`);
    return probs;
  });
}

/* ======================================================================= 1. boot, language, gate */
async function gBoot() {
  curGroup = 'boot';
  for (const d of ALL) {
    const c = await open(d, 'seed=3');
    const t = await c.page.evaluate(() => ({ mode: TR.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'),
      logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, tag: document.getElementById('tagline').textContent,
      hud: document.getElementById('hud').classList.contains('hidden'), loading: document.getElementById('loading').classList.contains('hidden'), who: document.getElementById('titleWho').textContent }));
    check(`${c.N} boot to title (hud + loader hidden)`, t.mode === 'title' && t.title && t.hud && t.loading, t);
    check(`${c.N} title shows EN logo + tagline + profile name`, /Treasure Reef/.test(t.logo) && t.tag.length > 0 && /Mầm/.test(t.who), t);
    const bb = await c.page.locator('#btnPlay').boundingBox();
    check(`${c.N} play button on screen, >= 60px`, bb && bb.x >= 0 && bb.y >= 0 && bb.x + bb.width <= d.viewport.width && bb.y + bb.height <= d.viewport.height && bb.width >= 60, bb);
    await shot(c, 'title');
    // language toggle en → vi → en
    await tapEl(c, '#scrTitle .chip[data-lang="vi"]'); await sleep(150);
    const vi = await c.page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, tag: document.getElementById('tagline').textContent, lang: document.documentElement.lang, doc: document.title }));
    check(`${c.N} lang chip EN→VI switches logo/tagline/document title`, vi.logo === 'Mầm Tìm Kho Báu' && VI_RE.test(vi.tag) && vi.lang === 'vi' && vi.doc === 'Mầm Tìm Kho Báu', vi);
    await tapEl(c, '#scrTitle .chip[data-lang="en"]'); await sleep(150);
    const en = await c.page.evaluate(() => ({ logo: document.getElementById('logo1').textContent + ' ' + document.getElementById('logo2').textContent, lang: document.documentElement.lang }));
    check(`${c.N} lang chip VI→EN switches back`, /Treasure Reef/.test(en.logo) && en.lang === 'en', en);
    // parent gate
    const g = await c.page.locator('#btnParents').boundingBox();
    const gx = g.x + g.width / 2, gy = g.y + g.height / 2;
    check(`${c.N} gear is >= 44px tap target`, g.width >= 44 && g.height >= 44, g);
    await tap(c, gx, gy); await sleep(500);
    check(`${c.N} short tap on gear does NOT open settings`, !(await visible(c.page, 'scrSettings')) && (await mode(c.page)) === 'title');
    await hold(c, gx, gy, 900); await sleep(300);
    check(`${c.N} 0.9 s hold does NOT open settings`, !(await visible(c.page, 'scrSettings')));
    await hold(c, gx, gy, 2300); await sleep(300);
    check(`${c.N} 2.3 s hold opens settings`, (await visible(c.page, 'scrSettings')) && (await mode(c.page)) === 'settings');
    await shot(c, 'settings');
    await tapEl(c, '#btnSettingsDone'); await sleep(200);
    check(`${c.N} settings Done returns to title`, (await visible(c.page, 'scrTitle')) && !(await visible(c.page, 'scrSettings')));
    check(`${c.N} no console errors (boot/lang/gate)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* ======================================================================= 2. profiles */
async function gProfiles() {
  curGroup = 'profiles';
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const c = await open(d, 'seed=3');
    const p0 = await c.page.evaluate(() => { const p = TR.Progress.current(); return { n: TR.Progress.list().length, name: p && p.name, age: p && p.age, avatar: p && p.avatar, sayAs: p && p.sayAs }; });
    check(`${c.N} default profile "Mầm" exists (age 4, turtle)`, p0.n === 1 && p0.name === 'Mầm' && p0.age === 4 && p0.avatar === 'turtle', p0);
    await tapEl(c, '#btnPlay'); await sleep(300);
    check(`${c.N} with one profile Play goes straight to the map`, (await mode(c.page)) === 'map' && (await visible(c.page, 'scrMap')) && !(await visible(c.page, 'scrProfiles')), await mode(c.page));
    await c.page.evaluate(() => TR.debug.goTitle()); await sleep(150);
    // create a 2nd profile through the parent gate
    const g = await c.page.locator('#btnParents').boundingBox();
    await hold(c, g.x + g.width / 2, g.y + g.height / 2, 2300); await sleep(250);
    check(`${c.N} gate opens settings`, await visible(c.page, 'scrSettings'));
    const nBtn = await c.page.evaluate(() => document.querySelectorAll('#settingsProfiles button').length);
    check(`${c.N} settings lists 1 player + "+ new player"`, nBtn === 2, nBtn);
    await tapEl(c, '#settingsProfiles button:last-child'); await sleep(200);
    check(`${c.N} "+ new player" opens the editor`, await visible(c.page, 'scrProfileEdit'));
    await c.page.locator('#inpName').fill('Anna');
    await c.page.locator('#inpSayAs').fill('');
    await tapEl(c, '#ageChips .chip[data-age="5"]');
    await tapEl(c, '#btnProfileSave'); await sleep(250);
    const after = await c.page.evaluate(() => ({ list: TR.Progress.list().map(p => [p.name, p.age, p.sayAs]), cur: TR.Progress.current().name, settings: !document.getElementById('scrSettings').classList.contains('hidden'), n: document.querySelectorAll('#settingsProfiles button').length }));
    check(`${c.N} Save creates Anna (age 5, sayAs "") and returns to settings`, after.list.length === 2 && after.list[1][0] === 'Anna' && after.list[1][1] === 5 && after.list[1][2] === '' && after.settings && after.n === 3, after);
    await tapEl(c, '#btnSettingsDone'); await sleep(200);
    await tapEl(c, '#btnPlay'); await sleep(300);
    const cards = await c.page.evaluate(() => [...document.querySelectorAll('#profileCards .profile-card')].map(b => b.querySelector('b') && b.querySelector('b').textContent));
    check(`${c.N} with 2 profiles Play shows the picker with both cards`, (await mode(c.page)) === 'profiles' && cards.length === 2 && cards.includes('Mầm') && cards.includes('Anna'), cards);
    await shot(c, 'profiles');
    const annaIdx = cards.indexOf('Anna');
    await tapEl(c, `#profileCards .profile-card:nth-child(${annaIdx + 1})`); await sleep(300);
    const mp = await c.page.evaluate(() => ({ mode: TR.debug.mode, name: document.getElementById('mapName').textContent, prof: TR.debug.profile && TR.debug.profile.name, age: TR.debug.profile && TR.debug.profile.age }));
    check(`${c.N} tapping Anna's card opens the map as Anna`, mp.mode === 'map' && mp.name === 'Anna' && mp.prof === 'Anna' && mp.age === 5, mp);
    // max 4 profiles
    const mx = await c.page.evaluate(() => { const a = TR.Progress.create({ name: 'Bo', age: 3 }), b = TR.Progress.create({ name: 'Cu', age: 6 }), e = TR.Progress.create({ name: 'Five', age: 7 }); return { a: !!a, b: !!b, fifth: e, n: TR.Progress.list().length }; });
    check(`${c.N} max 4 profiles (5th create returns null)`, mx.a && mx.b && mx.fifth === null && mx.n === 4, mx);
    await c.page.evaluate(() => TR.debug.goTitle()); await sleep(150);
    await hold(c, g.x + g.width / 2, g.y + g.height / 2, 2300); await sleep(250);
    const btns = await c.page.evaluate(() => [...document.querySelectorAll('#settingsProfiles button')].map(b => b.textContent.trim()));
    check(`${c.N} settings with 4 players hides "+ new player"`, btns.length === 4 && !btns.some(t => t.startsWith('+')), btns);
    check(`${c.N} no console errors (profiles)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* ======================================================================= 3. reef map, bot lagoon, trophies */
async function gMap() {
  curGroup = 'map';
  for (const d of ALL) {
    const c = await open(d, 'seed=5');
    await c.page.evaluate(() => TR.debug.goMap()); await sleep(300);
    const m0 = await c.page.evaluate(() => [...document.querySelectorAll('#lagoons .lagoon')].map(e => ({ id: e.dataset.lagoon, locked: e.classList.contains('locked'), lock: !!e.querySelector('.lock'), trophy: !!e.querySelector('.trophy') })));
    check(`${c.N} map: lagoon 1 unlocked, 2–6 locked`, m0.length === 6 && !m0[0].locked && m0.slice(1).every(l => l.locked && l.lock) && !m0.some(l => l.trophy), m0);
    await shot(c, 'map0');
    await tapEl(c, '#lagoons .lagoon[data-lagoon="2"]'); await sleep(600);
    check(`${c.N} tapping a locked badge does not start a lagoon`, (await mode(c.page)) === 'map' && (await visible(c.page, 'scrMap')), await mode(c.page));
    const res0 = await visible(c.page, 'resumeBar');
    check(`${c.N} no resume bar before any play`, !res0);
    // bot finishes lagoon 1
    await startGame(c, 1, { bot: true, speed: 8 });
    const t0 = Date.now();
    let finished = true;
    try { await c.page.waitForFunction(() => TR.debug.mode === 'done', null, { timeout: 120000 }); }
    catch (e) { finished = false; }
    const secs = Math.round((Date.now() - t0) / 1000);
    check(`${c.N} bot finishes lagoon 1 (mode done, ${secs}s)`, finished, finished ? '' : await c.page.evaluate(() => TR.debug.getState()));
    if (!finished) { await c.ctx.close(); continue; }
    await sleep(400);
    await c.page.evaluate(() => TR.debug.setBot(false));
    const sd = (await evOf(c.page, 'sessionDone'))[0] || {};
    const pr = await c.page.evaluate(() => { const p = TR.debug.profile, P = TR.Progress; return { l1: p.lagoons['1'], unlocked2: P.unlocked(p, 2), unlocked3: P.unlocked(p, 3), trophy: P.trophy(p, 1), total: p.totalStars, pearls: p.pearls, resume: p.resume, doneTrophy: document.getElementById('doneTrophy').getAttribute('src'), doneStars: document.getElementById('doneStars').textContent }; });
    await shot(c, 'done');
    check(`${c.N} lagoon 1 recorded done, stars persisted in TR.Progress (${pr.total})`, pr.l1 && pr.l1.done && pr.total === sd.stars && pr.total >= 0 && pr.total <= 52 && pr.l1.stars.reduce((a, b) => a + b, 0) === sd.stars, { pr, sd });
    check(`${c.N} lagoon 2 unlocked, 3 still locked, resume cleared`, pr.unlocked2 && !pr.unlocked3 && pr.resume === null, pr);
    check(`${c.N} trophy awarded and shown on the done screen`, !!pr.trophy && /trophy_/.test(pr.doneTrophy || '') && pr.doneStars === String(sd.stars), pr);
    await tapEl(c, '#btnNext'); await sleep(500);
    const st = await c.page.evaluate(() => TR.debug.getState());
    check(`${c.N} "Next lagoon" starts lagoon 2`, st.mode === 'play' && st.lagoon === 2, st);
    await c.page.evaluate(() => { TR.debug.setBot(false); TR.debug.goMap(); }); await sleep(300);
    const m1 = await c.page.evaluate(() => [...document.querySelectorAll('#lagoons .lagoon')].map(e => ({ id: e.dataset.lagoon, locked: e.classList.contains('locked'), trophy: !!e.querySelector('.trophy'), next: e.classList.contains('next') })));
    check(`${c.N} map after lagoon 1: badge 1 has a trophy, 2 unlocked + next, 3–6 locked`, m1[0].trophy && !m1[1].locked && m1[1].next && m1.slice(2).every(l => l.locked), m1);
    await shot(c, 'map1');
    await tapEl(c, '#btnTreasure'); await sleep(300);
    const tr = await c.page.evaluate(() => ({ mode: TR.debug.mode, lit: document.querySelectorAll('#trophies .trophy-slot img:not(.dim)').length, slots: document.querySelectorAll('#trophies .trophy-slot').length, totals: document.getElementById('treasureTotals').textContent }));
    check(`${c.N} Treasure Room shows 1 trophy of 6`, tr.mode === 'treasure' && tr.lit === 1 && tr.slots === 6, tr);
    await shot(c, 'treasure');
    check(`${c.N} no console errors (map)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* ======================================================================= 4. resume */
async function gResume() {
  curGroup = 'resume';
  for (const d of [DEV.iphoneL, DEV.ipadP]) {
    const c = await open(d, 'seed=4');
    await stopOn(c.page, "return e.type === 'level' && e.level === 1");
    await startGame(c, 1, { bot: true, speed: 8 });
    await c.page.waitForFunction(() => TR.debug.world.level === 1 && !TR.debug.bot, null, { timeout: 60000 });
    const ld = (await evOf(c.page, 'levelDone'))[0];
    check(`${c.N} bot finishes chapter 1 (levelDone level 0, world.level 1)`, ld && ld.level === 0 && ld.stars >= 0, ld);
    await waitRound(c.page);
    const r0 = await c.page.evaluate(() => ({ resume: TR.debug.profile.resume, speed: TR.debug.getState().speed }));
    check(`${c.N} after chapter 1, resume = {lagoon 1, level 1}`, r0.resume && r0.resume.lagoon === 1 && r0.resume.level === 1, r0);
    await tapEl(c, '#btnPause'); await sleep(200);
    check(`${c.N} pause button pauses`, (await mode(c.page)) === 'paused' && (await visible(c.page, 'scrPause')));
    await tapEl(c, '#btnMap'); await sleep(300);
    const r1 = await c.page.evaluate(() => ({ mode: TR.debug.mode, resume: TR.debug.profile.resume, bar: !document.getElementById('resumeBar').classList.contains('hidden'), text: document.getElementById('resumeText').textContent }));
    check(`${c.N} "Map" from pause → map with resume {1,1} and a visible resume bar`, r1.mode === 'map' && r1.resume && r1.resume.lagoon === 1 && r1.resume.level === 1 && r1.bar && /2/.test(r1.text), r1);
    await shot(c, 'resume-map');
    await tapEl(c, '#btnResumeLagoon'); await sleep(400);
    const r2 = await c.page.evaluate(() => ({ mode: TR.debug.mode, level: TR.debug.world.level, lagoon: TR.debug.getState().lagoon, stars: TR.debug.world.stars }));
    check(`${c.N} resume bar continues at chapter 2 (world.level 1) with the stars kept`, r2.mode === 'play' && r2.level === 1 && r2.lagoon === 1 && r2.stars === (ld ? ld.stars : -1), { r2, ld });
    // tapping the lagoon-1 badge with a resume also continues at chapter 2
    await c.page.evaluate(() => { TR.debug.pause(); }); await sleep(100);
    await tapEl(c, '#btnMap'); await sleep(250);
    await tapEl(c, '#lagoons .lagoon[data-lagoon="1"]'); await sleep(400);
    const r3 = await c.page.evaluate(() => ({ mode: TR.debug.mode, level: TR.debug.world.level }));
    check(`${c.N} badge 1 with a resume continues at chapter 2`, r3.mode === 'play' && r3.level === 1, r3);
    // edge: pausing during the chapter-end dance (levelDone state) must not lose the finished chapter
    await c.page.evaluate(() => { TR.debug.setBot(true, 1); TR.debug.setSpeed(8); });
    await stopOn(c.page, "return e.type === 'levelDone' && e.level === 1");
    await c.page.waitForFunction(() => !TR.debug.bot && TR.debug.world.state === 'levelDone', null, { timeout: 60000 }).catch(() => {});
    await c.page.evaluate(() => TR.debug.pause()); await sleep(100);
    await tapEl(c, '#btnMap'); await sleep(250);
    const r4 = await c.page.evaluate(() => ({ mode: TR.debug.mode, resume: TR.debug.profile.resume, state: TR.debug.world.state }));
    check(`${c.N} pause during the chapter-end dance keeps resume at the NEXT chapter (level 2)`, r4.resume && r4.resume.level === 2, r4);
    check(`${c.N} no console errors (resume)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* ======================================================================= 5. real touch: drag chapter (lagoon 2 chapter 1) */
async function gDrag() {
  curGroup = 'drag';
  for (const d of ALL) {
    const c = await open(d, 'seed=3'), p = c.page;
    await startGame(c, 2);
    let r = await roundInfo(p);
    check(`${c.N} lagoon 2 chapter 1 is a drag sort round with >= 2 chests`, r.mech === 'drag' && r.mode === 'sort' && r.baskets.length >= 2 && r.items.length >= 3, { mech: r.mech, mode: r.mode, n: r.baskets.length, items: r.items.length });
    let probs = await geometry(p);
    check(`${c.N} drag round geometry valid`, probs.length === 0, probs);
    await shot(c, 'drag0');
    // --- correct drag: finger path, drop 60 px above the chest opening
    const A = r.items.find(i => i.state === 'idle' && i.goal);
    const gb = r.baskets.find(b => b.id === A.goal);
    await clearEv(p);
    const from = await css(p, A.x, A.y), to = await dropPoint(p, gb);
    let follow = null;
    await drag(c, from, to, { beforeUp: async () => {
      follow = await p.evaluate(([id, tx, ty]) => { const w = TR.debug.world, v = TR.debug.view(), it = w.items.find(i => i.id === id); return { held: w.held, state: it.state, dx: Math.abs(it.x - (tx - v.left) / v.s), dy: Math.abs(it.y - (ty - v.top) / v.s) }; }, [A.id, to.x, to.y]);
    } });
    check(`${c.N} dragged treasure follows the finger`, follow && follow.held === A.id && follow.state === 'drag' && follow.dx < 30 && follow.dy < 45, follow);
    await p.waitForFunction(id => { const i = TR.debug.world.items.find(i => i.id === id); return i && i.state === 'in'; }, A.id, { timeout: 4000 }).catch(() => {});
    let ev = await evTypes(p);
    const aI = await itemOf(p, A.id);
    const cnt = await p.evaluate(id => TR.debug.world.baskets.find(b => b.id === id).count, gb.id);
    check(`${c.N} correct drop (60 px high) → grab, drop, correct, land; chest.count 0→1`, ['grab', 'drop', 'correct', 'land', 'sparkle'].every(t => ev.includes(t)) && !ev.includes('wrong') && aI.state === 'in' && aI.basketId === gb.id && cnt === 1, { ev, aI, cnt });
    // --- wrong chest → 'wrong', treasure returns home
    r = await roundInfo(p);
    const B = r.items.find(i => i.state === 'idle' && i.goal);
    const wb = r.baskets.find(b => b.id !== B.goal);
    await clearEv(p);
    await drag(c, await css(p, B.x, B.y), await dropPoint(p, wb));
    await sleep(1100);
    ev = await evTypes(p);
    const bI = await itemOf(p, B.id), wr = (await evOf(p, 'wrong'))[0];
    check(`${c.N} wrong chest → 'wrong' (basket ${wb.id}), treasure back home, not in a chest`, ev.includes('wrong') && !ev.includes('correct') && wr && wr.basketId === wb.id && bI.state === 'idle' && bI.basketId == null && Math.abs(bI.x - bI.homeX) < 8 && Math.abs(bI.y - bI.homeY) < 12, { ev, bI, wr });
    // --- quick tap (< 0.35 s, < 24 px) → 'tap', never a drop
    await clearEv(p);
    const tp = await css(p, B.x, B.y);
    await touch(c.cdp, 'touchStart', [tp]); await sleep(60); await touch(c.cdp, 'touchMove', [{ x: tp.x + 3, y: tp.y + 2 }]); await sleep(40); await touch(c.cdp, 'touchEnd', []);
    await sleep(500);
    ev = await evTypes(p);
    const tI = await itemOf(p, B.id);
    check(`${c.N} quick tap → 'tap' event only (no drop/miss/wrong), treasure stays home`, ev.includes('tap') && ev.includes('grab') && !ev.includes('drop') && !ev.includes('miss') && !ev.includes('wrong') && tI.state === 'idle' && tI.basketId == null, { ev, tI });
    // --- release in empty space → 'miss', floats home
    r = await roundInfo(p);
    const C = r.items.find(i => i.state === 'idle');
    const ep = await emptyPoint(p);
    await clearEv(p);
    await drag(c, await css(p, C.x, C.y), await css(p, ep.x, ep.y));
    await sleep(900);
    ev = await evTypes(p);
    const cI = await itemOf(p, C.id);
    check(`${c.N} release in empty space → 'miss', treasure floats home`, ev.includes('miss') && !ev.includes('wrong') && !ev.includes('correct') && cI.state === 'idle' && Math.abs(cI.x - cI.homeX) < 8, { ev, cI, ep });
    probs = await geometry(p);
    check(`${c.N} geometry still valid, nothing held`, probs.length === 0 && (await p.evaluate(() => TR.debug.world.held)) == null, probs);
    check(`${c.N} no console errors (drag)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* ======================================================================= 6. real touch: dig chapter (lagoon 1 chapter 1) */
async function gDig() {
  curGroup = 'dig';
  for (const d of ALL) {
    const c = await open(d, 'seed=3'), p = c.page;      // seed 3: round 2 of chapter 1 has a crab mound
    await startGame(c, 1);
    let r = await roundInfo(p);
    check(`${c.N} lagoon 1 chapter 1 is a dig round (4 mounds, 1 chest)`, r.mech === 'dig' && r.mode === 'dig' && r.mounds.length >= 4 && r.baskets.length === 1 && r.targetMound, { mech: r.mech, mode: r.mode, mounds: r.mounds.length, tm: r.targetMound });
    let probs = await geometry(p);
    check(`${c.N} dig round geometry valid`, probs.length === 0, probs);
    await shot(c, 'dig0');
    const tgtLabel = r.items.find(i => i.id === r.target).label;
    const wrongMounds = r.mounds.filter(m => m.state === 'buried' && !m.crab && m.itemId && !sameLabel(r.items.find(i => i.id === m.itemId).label, tgtLabel));
    check(`${c.N} round has wrong mounds to test with`, wrongMounds.length >= 1, wrongMounds.map(m => m.id));
    // --- wrong tap → 'wrong', peek, back to buried within ~1.5 s
    await clearEv(p);
    const w1 = wrongMounds[0];
    let mp = await moundPoint(p, w1);
    await tap(c, mp.x, mp.y);
    await sleep(250);
    const peek = await moundOf(p, w1.id);
    await sleep(1400);
    const back = await moundOf(p, w1.id);
    let ev = await evTypes(p);
    const wr = (await evOf(p, 'wrong'))[0];
    check(`${c.N} wrong mound tap → dig{correct:false} + wrong, mound peeks then re-buries`, ev.includes('dig') && ev.includes('wrong') && !ev.includes('correct') && wr && wr.moundId === w1.id && peek.state === 'peek' && back.state === 'buried', { ev, peek: peek.state, back: back.state, wr });
    // --- second wrong tap → hint glows the target mound
    r = await roundInfo(p);
    const w2 = wrongMounds.length > 1 ? wrongMounds[1] : w1;
    await clearEv(p);
    mp = await moundPoint(p, w2);
    await tap(c, mp.x, mp.y);
    await sleep(350);
    ev = await evTypes(p);
    const hint = (await evOf(p, 'hint'))[0];
    const tm = await moundOf(p, r.targetMound);
    const rm = await p.evaluate(() => TR.debug.world.roundMistakes);
    check(`${c.N} 2nd wrong tap → 'hint' on the target mound, glow > 0, roundMistakes 2`, ev.includes('hint') && hint && hint.moundId === r.targetMound && tm.glow > 0 && rm === 2, { ev, hint, glow: tm.glow, rm });
    await shot(c, 'dig-hint');
    await sleep(1300);
    // --- a finger that moves > 24 px before release does nothing
    r = await roundInfo(p);
    const T = r.mounds.find(m => m.id === r.targetMound);
    await clearEv(p);
    mp = await moundPoint(p, T);
    const far = await css(p, T.x + 70, T.y - T.h * 0.5);
    await drag(c, mp, far, { steps: 8, settle: 100 });
    await sleep(400);
    ev = await evTypes(p);
    const tAfter = await moundOf(p, T.id);
    check(`${c.N} finger moving > 24 px before release does nothing (target still buried)`, !ev.includes('dig') && !ev.includes('wrong') && !ev.includes('correct') && tAfter.state === 'buried', { ev, state: tAfter.state });
    // --- correct tap → dig correct, the item flies into the chest
    await clearEv(p);
    const q0 = r.queue.length;
    await tap(c, mp.x, mp.y);
    await p.waitForFunction(id => { const w = TR.debug.world, it = w.items.find(i => i.moundId === id); return it && it.state === 'in'; }, T.id, { timeout: 4000 }).catch(() => {});
    ev = await evTypes(p);
    const dg = (await evOf(p, 'dig')).find(e => e.correct);
    const tI = await p.evaluate(id => { const w = TR.debug.world, it = w.items.find(i => i.moundId === id); const m = w.mounds.find(m => m.id === id); return { state: it.state, basketId: it.basketId, mound: m.state, count: w.baskets[0].count, q: w.queue.length }; }, T.id);
    check(`${c.N} target mound tap → dig{correct:true}, correct, land; item in the chest, mound open`, dg && dg.moundId === T.id && ev.includes('correct') && ev.includes('land') && tI.state === 'in' && tI.basketId === 'b0' && tI.mound === 'open' && tI.count >= 1 && tI.q === q0 - 1, { ev, dg, tI });
    // --- finish the warm-up round via taps, then look for the crab in round 2
    await finishDigRound(c);
    await waitRound(p).catch(() => {});
    r = await roundInfo(p);
    check(`${c.N} round 2 reached by real taps (round ${r.round}, ${r.mounds.length} mounds)`, r.round === 1 && r.mode === 'dig', { round: r.round, mounds: r.mounds.length });
    if (r.crab) {
      const cm = r.mounds.find(m => m.id === r.crab);
      const rm0 = r.roundMistakes;
      await clearEv(p);
      mp = await moundPoint(p, cm);
      await tap(c, mp.x, mp.y);
      await sleep(300);
      ev = await evTypes(p);
      const cr = (await evOf(p, 'crab'))[0];
      const after = await p.evaluate(id => ({ rm: TR.debug.world.roundMistakes, m: TR.debug.world.mounds.find(m => m.id === id).state }), cm.id);
      check(`${c.N} crab mound tap → 'crab' event, no 'wrong', roundMistakes unchanged`, cr && cr.moundId === cm.id && !ev.includes('wrong') && !ev.includes('dig') && after.rm === rm0 && after.m === 'open', { ev, cr, after });
      await shot(c, 'crab');
    } else check(`${c.N} crab mound present in round 2 (seed 3)`, false, { crab: r.crab, mounds: r.mounds.length });
    probs = await geometry(p);
    check(`${c.N} dig geometry still valid`, probs.length === 0, probs);
    check(`${c.N} no console errors (dig)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}
function sameLabel(a, b) { return !!a && !!b && a.type === b.type && String(a.value) === String(b.value); }
/** taps the target mound until the round is solved (real taps) */
async function finishDigRound(c, max = 8) {
  const p = c.page;
  for (let i = 0; i < max; i++) {
    const t = await p.evaluate(() => { const w = TR.debug.world; if (w.state !== 'round' || !w.interactive || w.completing) return null; const m = w.targetMound(); return m ? { x: m.x, y: m.y, h: m.h } : null; });
    if (!t) break;
    const mp = await css(p, t.x, t.y - t.h * 0.5);
    await tap(c, mp.x, mp.y);
    await sleep(900);
  }
}

/* ======================================================================= 7. count rounds via real touch */
async function gCount() {
  curGroup = 'count';
  // dig pearls: age 4, lagoon 3 chapter 1 = count:1-5 dig
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const c = await open(d, 'seed=3&age=4'), p = c.page;
    await startGame(c, 3);
    let r = await roundInfo(p);
    check(`${c.N} age 4 lagoon 3 chapter 1 is a dig COUNT round (long chest, need N)`, r.mode === 'dig' && r.topic === 'count' && r.need >= 1 && r.baskets[0].kind === 'long', { mode: r.mode, topic: r.topic, need: r.need, kind: r.baskets[0].kind });
    await clearEv(p);
    await finishDigRound(c, r.need + 2);
    await p.waitForFunction(() => window.__events.some(e => e.type === 'roundDone'), null, { timeout: 6000 }).catch(() => {});
    const ev = await evTypes(p), counts = await evOf(p, 'count'), rd = (await evOf(p, 'roundDone'))[0];
    check(`${c.N} tapping ${r.need} pearl mounds completes the count round (count events 1..N, roundDone)`, rd && counts.length >= r.need && counts[counts.length - 1].n === r.need && ev.filter(t => t === 'correct').length === r.need, { ev, counts: counts.map(e => e.n), rd });
    await shot(c, 'count-dig');
    check(`${c.N} no console errors (dig count)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
  // drag pearls into the long chest: age 5, lagoon 2 chapter 1 = count:3-10 drag
  for (const d of [DEV.iphoneL, DEV.ipadP]) {
    const c = await open(d, 'seed=3&age=5'), p = c.page;
    await startGame(c, 2);
    let r = await roundInfo(p);
    const need = r.need || r.baskets[0].need;          // drag count: need lives on the long chest
    check(`${c.N} age 5 lagoon 2 chapter 1 is a drag COUNT round (long chest, need N)`, r.mode === 'count' && need >= 1 && r.baskets[0].kind === 'long', { mode: r.mode, topic: r.topic, need, kind: r.baskets[0].kind });
    await clearEv(p);
    const lb = r.baskets[0];
    for (let i = 0; i < need; i++) {
      r = await roundInfo(p);
      const it = r.items.find(x => x.state === 'idle');
      if (!it) break;
      await drag(c, await css(p, it.x, it.y), await dropPoint(p, lb));
      await p.waitForFunction(id => { const i = TR.debug.world.items.find(i => i.id === id); return !i || i.state === 'in'; }, it.id, { timeout: 3000 }).catch(() => {});
      await sleep(150);
    }
    await p.waitForFunction(() => window.__events.some(e => e.type === 'roundDone'), null, { timeout: 6000 }).catch(() => {});
    const ev = await evTypes(p), counts = await evOf(p, 'count'), rd = (await evOf(p, 'roundDone'))[0];
    check(`${c.N} dragging ${need} pearls into the long chest completes the round (count 1..N, roundDone)`, rd && counts.length >= need && counts[counts.length - 1].n === need && !ev.includes('wrong'), { ev, counts: counts.map(e => e.n), rd });
    await shot(c, 'count-drag');
    check(`${c.N} no console errors (drag count)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* ======================================================================= 8. talk time */
async function gTalk() {
  curGroup = 'talk';
  for (const d of [DEV.iphoneP, DEV.ipadL]) {
    const c = await open(d, 'seed=6'), p = c.page;
    await stopOn(p, "return e.type === 'talk'");
    await startGame(c, 1, { bot: true, speed: 8 });
    await p.waitForFunction(() => TR.debug.mode === 'talk' && !TR.debug.bot, null, { timeout: 60000 });
    await sleep(300);
    const tk = await p.evaluate(() => { const t = TR.debug.world.talk; return { answerId: t.answerId, choices: t.choices.map(c => c.id), answered: TR.debug.world.talkAnswered, q: document.getElementById('talkQ').textContent, btns: [...document.querySelectorAll('#talkChoices button')].map(b => b.dataset.id) }; });
    check(`${c.N} Talk time opens with the question + ${tk.choices.length} choice buttons, unanswered`, (await visible(p, 'scrTalk')) && tk.q.length > 0 && tk.btns.join() === tk.choices.join() && !tk.answered, tk);
    await shot(c, 'talk');
    await clearEv(p);
    await tapEl(c, `#talkChoices [data-id="${tk.answerId}"]`); await sleep(300);
    const tr = (await evOf(p, 'talkResult'))[0];
    const cls = await p.evaluate(id => document.querySelector(`#talkChoices [data-id="${id}"]`).className, tk.answerId);
    check(`${c.N} tapping the right choice → talkResult correct, button marked right`, tr && tr.correct === true && tr.choiceId === tk.answerId && /right/.test(cls), { tr, cls });
    // second talk (chapter 2): tap a wrong choice
    await p.waitForFunction(() => TR.debug.world.level === 1, null, { timeout: 15000 });
    await stopOn(p, "return e.type === 'talk'");
    await p.evaluate(() => { TR.debug.setBot(true, 1); TR.debug.setSpeed(8); });
    await p.waitForFunction(() => TR.debug.mode === 'talk' && !TR.debug.bot && TR.debug.world.level === 1, null, { timeout: 60000 });
    await sleep(300);
    const tk2 = await p.evaluate(() => { const t = TR.debug.world.talk; return { answerId: t.answerId, wrong: t.choices.map(c => c.id).find(id => id !== t.answerId) }; });
    await clearEv(p);
    await tapEl(c, `#talkChoices [data-id="${tk2.wrong}"]`); await sleep(300);
    const tr2 = (await evOf(p, 'talkResult'))[0];
    const cls2 = await p.evaluate(ids => ids.map(id => document.querySelector(`#talkChoices [data-id="${id}"]`).className), [tk2.wrong, tk2.answerId]);
    check(`${c.N} tapping a wrong choice → talkResult wrong, pick marked wrongpick, answer marked right`, tr2 && tr2.correct === false && tr2.choiceId === tk2.wrong && /wrongpick/.test(cls2[0]) && /right/.test(cls2[1]), { tr2, cls2 });
    await tapEl(c, `#talkChoices [data-id="${tk2.answerId}"]`); await sleep(200);
    const n = await p.evaluate(() => window.__events.filter(e => e.type === 'talkResult').length);
    check(`${c.N} a second answer is ignored (one talkResult)`, n === 1, n);
    check(`${c.N} no console errors (talk)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* ======================================================================= 9. pause / visibility / volume / settings persistence */
async function gSettings() {
  curGroup = 'settings';
  const d = DEV.iphoneP;
  const c = await open(d, 'seed=3&lang=vi'), p = c.page;
  await p.evaluate(() => localStorage.removeItem('tr:settings'));
  const ui0 = await p.evaluate(() => ({ lang: document.documentElement.lang, logo: document.getElementById('logo1').textContent }));
  check('[settings] ?lang=vi applies to the UI for the session', ui0.lang === 'vi' && ui0.logo === 'Mầm', ui0);
  await startGame(c, 2);
  await tapEl(c, '#btnPause'); await sleep(200);
  check('[settings] pause button → mode paused', (await mode(p)) === 'paused' && (await visible(p, 'scrPause')));
  const v0 = await p.evaluate(() => TR.debug.getState().settings.volume);
  await tapEl(c, '#btnQuieter'); await sleep(100);
  const v1 = await p.evaluate(() => TR.debug.getState().settings.volume);
  await tapEl(c, '#btnLouder'); await tapEl(c, '#btnLouder'); await sleep(100);
  const v2 = await p.evaluate(() => TR.debug.getState().settings.volume);
  check(`[settings] volume −/+ steps of 10 and clamps at 100 (${v0}→${v1}→${v2})`, v0 === 100 && v1 === 90 && v2 === 100, { v0, v1, v2 });
  for (let i = 0; i < 12; i++) await tapEl(c, '#btnQuieter');
  const v3 = await p.evaluate(() => ({ v: TR.debug.getState().settings.volume, meter: document.getElementById('volMeter').style.width }));
  check('[settings] volume clamps at 0', v3.v === 0 && v3.meter === '0%', v3);
  for (let i = 0; i < 4; i++) await tapEl(c, '#btnLouder');
  const s1 = await p.evaluate(() => JSON.parse(localStorage.getItem('tr:settings') || 'null'));
  check('[settings] volume saved to tr:settings (40) and ?lang=vi NOT saved', s1 && s1.volume === 40 && s1.lang !== 'vi' && !('mute' in s1) && !('profile' in s1) && !('seed' in s1), s1);
  await tapEl(c, '#btnResume'); await sleep(150);
  check('[settings] Resume → mode play', (await mode(p)) === 'play');
  // visibilitychange → pause
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { get: () => true, configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(150);
  const hid = await mode(p);
  await p.evaluate(() => { delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(150);
  check('[settings] visibilitychange (hidden) pauses the game, pause screen shown', hid === 'paused' && (await visible(p, 'scrPause')), hid);
  check('[settings] coming back does not auto-resume (stays paused until tap)', (await mode(p)) === 'paused');
  await tapEl(c, '#btnHome'); await sleep(200);
  check('[settings] Home from pause → title', (await mode(p)) === 'title');
  // settings slider persists across reload
  const g = await p.locator('#btnParents').boundingBox();
  await hold(c, g.x + g.width / 2, g.y + g.height / 2, 2300); await sleep(250);
  check('[settings] gate opens settings', await visible(p, 'scrSettings'));
  const sl = await p.evaluate(() => ({ v: document.getElementById('inpVolume').value, l: document.getElementById('volLabel').textContent }));
  check('[settings] slider shows the pause-menu volume (40)', sl.v === '40' && sl.l === '40%', sl);
  await p.evaluate(() => { const i = document.getElementById('inpVolume'); i.value = '65'; i.dispatchEvent(new Event('input', { bubbles: true })); });
  await tapEl(c, 'label:has(#optMusic)'); await sleep(150);
  const s2 = await p.evaluate(() => JSON.parse(localStorage.getItem('tr:settings') || 'null'));
  check('[settings] slider 65 + music off saved; lang still not vi', s2 && s2.volume === 65 && s2.music === false && s2.lang !== 'vi', s2);
  await p.reload(); await waitTitle(p); await installHook(p);
  const g2 = await p.locator('#btnParents').boundingBox();
  await hold(c, g2.x + g2.width / 2, g2.y + g2.height / 2, 2300); await sleep(250);
  const dom = await p.evaluate(() => ({ v: document.getElementById('inpVolume').value, music: document.getElementById('optMusic').checked, st: TR.debug.getState().settings.volume, lang: document.documentElement.lang }));
  check('[settings] reload keeps volume 65 + music off (and ?lang=vi still only a session override)', dom.v === '65' && !dom.music && dom.st === 65 && dom.lang === 'vi', dom);
  const keys = await p.evaluate(() => Object.keys(localStorage));
  check('[settings] every storage key uses the tr: prefix, progress not written with ?profile=test', keys.every(k => k.startsWith('tr:')) && !keys.includes('tr:progress'), keys);
  // language chip in settings saves lang
  await tapEl(c, '#scrSettings .chip[data-lang="en"]'); await sleep(150);
  const s3 = await p.evaluate(() => JSON.parse(localStorage.getItem('tr:settings')).lang);
  check('[settings] language chip (user action) saves lang=en', s3 === 'en', s3);
  check('[settings] no console errors (settings)', c.errors.length === 0, c.errors);
  await c.ctx.close();
}

/* ======================================================================= 10. rotation mid-round */
async function gRotate() {
  curGroup = 'rotate';
  for (const d of [DEV.iphoneP, DEV.iphoneL, DEV.ipadP, DEV.ipadL]) {
    const swapped = { width: d.viewport.height, height: d.viewport.width };
    // drag chapter: rotate while a finger holds a treasure
    let c = await open(d, 'seed=3'), p = c.page;
    await startGame(c, 2);
    let r = await roundInfo(p);
    const A = r.items.find(i => i.state === 'idle');
    const from = await css(p, A.x, A.y), ep = await emptyPoint(p), to = await css(p, ep.x, ep.y);
    await drag(c, from, to, { noUp: true, settle: 150 });
    const held0 = await p.evaluate(() => TR.debug.world.held);
    check(`${c.N} drag in progress before rotation`, held0 === A.id, held0);
    await p.setViewportSize(swapped);
    await sleep(700);
    const st = await p.evaluate(() => ({ held: TR.debug.world.held, W: TR.debug.getState().W, H: TR.debug.getState().H, mode: TR.debug.mode, states: TR.debug.world.items.map(i => i.state) }));
    const portraitNow = swapped.height > swapped.width;
    check(`${c.N} rotation to ${swapped.width}×${swapped.height} cancels the drag cleanly (held null, no item in drag)`, st.held === null && !st.states.includes('drag') && (portraitNow ? st.W === 720 : st.H === 720), st);
    await touch(c.cdp, 'touchEnd', []); await sleep(800);
    let probs = await geometry(p);
    check(`${c.N} after rotation all treasures + chests inside the viewport`, probs.length === 0 && (await p.evaluate(() => TR.debug.world.held)) === null, probs);
    await shot(c, 'rotated-drag');
    // the game is still playable with a finger after rotation
    r = await roundInfo(p);
    const B = r.items.find(i => i.state === 'idle' && i.goal), gb = r.baskets.find(b => b.id === B.goal);
    await clearEv(p);
    await drag(c, await css(p, B.x, B.y), await dropPoint(p, gb));
    await sleep(900);
    check(`${c.N} a correct drag still works after rotation`, (await evTypes(p)).includes('correct'), await lastEv(p, 8));
    await p.setViewportSize(d.viewport); await sleep(600);
    probs = await geometry(p);
    check(`${c.N} rotating back keeps geometry valid`, probs.length === 0, probs);
    check(`${c.N} no console errors (rotate drag)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
    // dig chapter
    c = await open(d, 'seed=3'); p = c.page;
    await startGame(c, 1);
    await p.setViewportSize(swapped); await sleep(700);
    probs = await geometry(p);
    const dg = await p.evaluate(() => ({ mounds: TR.debug.world.mounds.map(m => m.state), items: TR.debug.world.items.map(i => i.state), W: TR.debug.getState().W, H: TR.debug.getState().H }));
    check(`${c.N} dig rotation: mounds + items inside the viewport, all still buried`, probs.length === 0 && dg.mounds.every(s => s === 'buried') && dg.items.every(s => s === 'buried'), { probs, dg });
    await shot(c, 'rotated-dig');
    r = await roundInfo(p);
    const T = r.mounds.find(m => m.id === r.targetMound);
    await clearEv(p);
    const mp = await moundPoint(p, T);
    await tap(c, mp.x, mp.y); await sleep(600);
    const dig = (await evOf(p, 'dig'))[0];
    check(`${c.N} a correct mound tap still works after rotation`, dig && dig.correct && dig.moundId === T.id, await lastEv(p, 8));
    check(`${c.N} no console errors (rotate dig)`, c.errors.length === 0, c.errors);
    await c.ctx.close();
  }
}

/* ======================================================================= 11. full bot sessions, ages 3..7, lagoons 1 and 6 */
async function gBot() {
  curGroup = 'bot';
  const jobs = [];
  for (const age of [3, 4, 5, 6, 7]) for (const lagoon of [1, 6]) jobs.push({ age, lagoon, dev: (age + lagoon) % 2 ? DEV.iphoneL : DEV.ipadP });
  const run = async j => {
    const c = await open(j.dev, `seed=${j.age * 10 + j.lagoon}&age=${j.age}&lang=${j.lagoon === 6 ? 'vi' : 'en'}`);
    const p = c.page, tag = `[bot age ${j.age} lagoon ${j.lagoon} ${j.dev.name}]`;
    await startGame(c, j.lagoon, { bot: true, speed: 8 });
    const t0 = Date.now();
    let done = true;
    try { await p.waitForFunction(() => TR.debug.mode === 'done', null, { timeout: 150000 }); } catch (e) { done = false; }
    const secs = Math.round((Date.now() - t0) / 1000);
    const st = await p.evaluate(() => ({ s: TR.debug.getState(), stats: TR.debug.stats, pearls: window.__events.filter(e => e.type === 'pearl').map(e => e.total), sd: window.__events.find(e => e.type === 'sessionDone'), levels: window.__events.filter(e => e.type === 'level').map(e => e.mech + ':' + e.topic), stuck: window.__events.filter(e => e.type === 'round').length, profile: TR.debug.profile && { pearls: TR.debug.profile.pearls, total: TR.debug.profile.totalStars } }));
    const mono = st.pearls.every((v, i) => i === 0 || v >= st.pearls[i - 1]);
    check(`${tag} session finishes (${secs}s, ${st.stuck} rounds, ${st.levels.join(' ')})`, done, done ? '' : st.s);
    check(`${tag} zero console errors`, c.errors.length === 0, c.errors.slice(0, 5));
    if (done) {
      check(`${tag} stars within 0..52 (${st.sd && st.sd.stars}), profile total matches`, st.sd && st.sd.stars >= 0 && st.sd.stars <= 52 && st.profile.total === st.sd.stars, { sd: st.sd, profile: st.profile });
      check(`${tag} pearls monotonic (${st.pearls.length} pearl events, last ${st.pearls.slice(-1)[0]}) and profile pearls = world pearls`, mono && st.pearls.length > 0 && st.profile.pearls === st.sd.pearls, { last: st.pearls.slice(-5), profile: st.profile, sd: st.sd && st.sd.pearls });
      check(`${tag} 4 chapters alternate dig/drag`, st.levels.length === 4 && st.levels.every((l, i) => i === 0 || l.split(':')[0] !== st.levels[i - 1].split(':')[0]), st.levels);
    }
    await c.ctx.close();
  };
  // run 5 at a time
  for (let i = 0; i < jobs.length; i += 5) await Promise.all(jobs.slice(i, i + 5).map(run));
}

/* ======================================================================= main */
(async () => {
  const T0 = Date.now();
  srv = await serve(process.env.TR_GAME_ROOT || undefined);
  browser = await chromium.launch();
  const groups = [['boot', gBoot], ['profiles', gProfiles], ['map', gMap], ['resume', gResume], ['drag', gDrag], ['dig', gDig], ['count', gCount], ['talk', gTalk], ['settings', gSettings], ['rotate', gRotate], ['bot', gBot]];
  for (const [name, fn] of groups) {
    if (!want(name)) continue;
    console.log(`\n=== ${name} ===`);
    try { await fn(); } catch (e) { curGroup = name; check(`[${name}] group crashed`, false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); srv.close();
  const fails = results.filter(r => !r.ok);
  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify({ when: new Date().toISOString(), seconds: Math.round((Date.now() - T0) / 1000), results }, null, 1));
  console.log(`\n${results.length - fails.length}/${results.length} checks passed in ${Math.round((Date.now() - T0) / 1000)}s` + (fails.length ? `\nFAILED:\n` + fails.map(f => '  ' + f.name).join('\n') : ''));
  process.exit(fails.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
