// Functional QA — exploratory probes (report-only; findings go to docs/reports/qa_functional.md). Each probe prints
// PASS / FAIL / INFO; exit code is always 0 (the gate is tests/e2e/functional.js).
//   node tests/qa/qa_functional.js            (PROBES=idle_autopause,pause_in_talk to run a subset)
const { chromium } = require('playwright');
const serve = require('../e2e/serve');

const tp = (x, y, id = 1) => ({ x: Math.round(x), y: Math.round(y), id, radiusX: 8, radiusY: 8, force: 1 });
const ts = (cdp, pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts });
const tm = (cdp, pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts });
const te = (cdp, pts = []) => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts });
async function tap(cdp, page, p, hold = 60) { await ts(cdp, [tp(p.x, p.y)]); await page.waitForTimeout(hold); await te(cdp); }
const log = (s, name, msg) => console.log(`${s.padEnd(5)} ${name}${msg ? ' — ' + msg : ''}`);

async function page0(browser, vp = { width: 393, height: 852 }, dpr = 3) {
  const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  const cdp = await ctx.newCDPSession(page);
  return { ctx, page, cdp, errors };
}
async function round(page, url, q = '', topic = 'colors', lv = 0) {
  await page.goto(url + '?mute=1&seed=3&age=4' + q);
  await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'title');
  await page.evaluate(([t, lv]) => { TL.debug.startGame(); const w = TL.debug.world; w.levels[lv] = t; w.startLevel(lv); TL.debug.setSpeed(4); }, [topic, lv]);
  await page.waitForFunction(() => TL.debug.world.interactive && TL.debug.world.members.every(m => m.state === 'swim'), null, { timeout: 25000 });
  await page.evaluate(() => TL.debug.setSpeed(1));
}
const P = {};
/** 5 idle nudges → auto-pause; then resume works and the question comes back */
P.idle_autopause = async (browser, url) => {
  const { ctx, page } = await page0(browser);
  await round(page, url);
  await page.evaluate(() => TL.debug.setSpeed(8));
  const ok = await page.waitForFunction(() => TL.debug.mode === 'paused', null, { timeout: 90000, polling: 250 }).then(() => true, () => false);
  const s = await page.evaluate(() => ({ mode: TL.debug.mode, idles: TL.debug.events.filter(e => e.type === 'idle').length, t: TL.debug.world.time }));
  log(ok ? 'PASS' : 'FAIL', 'idle_autopause', JSON.stringify(s));
  await ctx.close();
};
/** pause during Talk: the HUD (z 12 while #stage.talking) sits ABOVE the pause screen (z 10) */
P.pause_in_talk = async (browser, url) => {
  const { ctx, page } = await page0(browser);
  await round(page, url);
  await page.evaluate(() => { TL.debug.setBot(true, 1); TL.debug.setSpeed(8); });
  await page.waitForFunction(() => TL.debug.world.state === 'talk', null, { timeout: 150000, polling: 'raf' });
  await page.evaluate(() => { TL.debug.setBot(false); TL.debug.setSpeed(1); });
  await page.waitForTimeout(400);
  const b = await page.locator('#btnPause').boundingBox();
  await page.touchscreen.tap(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForTimeout(300);
  const s = await page.evaluate(() => {
    const r = document.getElementById('btnPause').getBoundingClientRect(), el = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { mode: TL.debug.mode, talking: document.getElementById('stage').classList.contains('talking'), hudOnTopOfPause: !!el && !!el.closest('#hud'), hudZ: getComputedStyle(document.getElementById('hud')).zIndex };
  });
  log(s.mode === 'paused' && !s.hudOnTopOfPause ? 'PASS' : 'FAIL', 'pause_in_talk (HUD above the pause menu?)', JSON.stringify(s));
  await page.locator('#btnResume').tap();
  await page.waitForTimeout(1300);
  const r = await page.evaluate(() => ({ mode: TL.debug.mode, talk: !document.getElementById('scrTalk').classList.contains('hidden'), answer: TL.debug.world.talk && TL.debug.world.talk.answer }));
  if (r.talk) { await page.locator(`#talkChoices button[data-id="${r.answer}"]`).tap(); await page.waitForTimeout(300); }
  const r2 = await page.evaluate(() => ({ answered: !!TL.debug.world.talkAnswered }));
  log(r.mode === 'talk' && r.talk && r2.answered ? 'PASS' : 'FAIL', 'resume_into_talk', JSON.stringify([r, r2]));
  await ctx.close();
};
/** Tibo tap while busy (cast / reel) must not repeat the question nor cut the right line */
P.tibo_busy = async (browser, url) => {
  const { ctx, page, cdp } = await page0(browser);
  await round(page, url);
  const a = await page.evaluate(() => TL.debug.memberScreen(TL.debug.answer().member));
  await tap(cdp, page, a);
  await page.waitForFunction(() => TL.debug.world.phase === 'reel', null, { timeout: 15000 });
  const n0 = await page.evaluate(() => TL.debug.voiceLog.length), q = await page.evaluate(() => window.TL.debug.events.length);
  const h = await page.evaluate(() => TL.debug.tiboScreen());
  await tap(cdp, page, { x: h.cx, y: h.cy });
  await page.waitForTimeout(300);
  const s = await page.evaluate(([n]) => ({ lines: TL.debug.voiceLog.slice(n).map(x => x.text), poke: TL.debug.events.slice(-10).filter(e => e.type === 'pokeTibo').length }), [n0, q]);
  log(s.lines.length <= 1 ? 'PASS' : 'FAIL', 'tibo_busy', JSON.stringify(s));
  await ctx.close();
};
/** a second finger landing on the target while the first rests on the water is ignored */
P.second_finger = async (browser, url) => {
  const { ctx, page, cdp } = await page0(browser);
  await round(page, url);
  const s = await page.evaluate(() => { const L = TL.debug.world.layout; return TL.debug.toScreen(L.W * 0.5, L.groundY - 30); });
  await ts(cdp, [tp(s.x, s.y, 1)]); await page.waitForTimeout(300);
  const n0 = await page.evaluate(() => TL.debug.stats.correct);
  const a = await page.evaluate(() => TL.debug.memberScreen(TL.debug.answer().member));
  await ts(cdp, [tp(s.x, s.y, 1), tp(a.x, a.y, 2)]); await page.waitForTimeout(60);
  await te(cdp, [tp(s.x, s.y, 1)]); await page.waitForTimeout(60); await te(cdp);
  await page.waitForTimeout(200);
  const n1 = await page.evaluate(() => TL.debug.stats.correct);
  log(n1 === n0 ? 'PASS' : 'FAIL', 'second_finger_ignored', `correct ${n0} → ${n1}`);
  await ctx.close();
};
/** fast repeated rotations through enter / play / cast / show — stuck states, errors */
P.rotate_storm = async (browser, url) => {
  const { ctx, page, errors } = await page0(browser);
  await round(page, url);
  await page.evaluate(() => { TL.debug.setBot(true, 0.6); TL.debug.setSpeed(2); });
  const sizes = [{ width: 393, height: 852 }, { width: 852, height: 393 }, { width: 820, height: 1180 }, { width: 1180, height: 820 }];
  let stuck = 0, last = '', same = 0;
  for (let k = 0; k < 40; k++) {
    await page.setViewportSize(sizes[k % 4]);
    await page.waitForTimeout(350);
    const st = await page.evaluate(() => TL.debug.world.state + '/' + TL.debug.world.phase + '/' + TL.debug.world.round + '/' + TL.debug.world.level);
    if (st === last) same++; else same = 0;
    if (same > 12) stuck++;
    last = st;
  }
  const s = await page.evaluate(() => ({ st: TL.debug.getState(), rounds: TL.debug.stats.rounds }));
  log(!stuck && errors.length === 0 && s.rounds >= 3 ? 'PASS' : 'FAIL', 'rotate_storm', `rounds ${s.rounds}, stuck ${stuck}, errors ${errors.slice(0, 2).join(' | ')}, ${s.st.state}/${s.st.phase}`);
  await ctx.close();
};
/** a child's name with markup is cleaned, and ?lang= used from the URL never saved even after a title language tap */
P.name_clean = async (browser, url) => {
  const { ctx, page } = await page0(browser);
  await page.goto(url + '?mute=1');
  await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'title');
  const r = await page.evaluate(() => { const i = document.getElementById('inpName'); i.value = '<b>Mi</b>{x} Na  '; i.dispatchEvent(new Event('input')); return { s: TL.debug.getState().settings.name, line: TL.I18N.t('en', 'ui.welcome', { child: TL.debug.getState().settings.name }) }; });
  log(!/[<>{}]/.test(r.s) && !/[<>{}]/.test(r.line) ? 'PASS' : 'FAIL', 'name_clean', JSON.stringify(r));
  await ctx.close();
};
/** double-tap on Play: the second tap must not reach the canvas as a fish tap in the first 250 ms */
P.play_double_tap = async (browser, url) => {
  const { ctx, page, cdp, errors } = await page0(browser);
  await page.goto(url + '?mute=1&seed=3&age=4');
  await page.waitForFunction(() => window.TL && TL.debug && TL.debug.mode === 'title');
  const b = await page.locator('#btnPlay').boundingBox();
  await tap(cdp, page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 40);
  await page.waitForTimeout(60);
  await tap(cdp, page, { x: b.x + b.width / 2, y: b.y + b.height / 2 }, 40);
  await page.waitForTimeout(600);
  const s = await page.evaluate(() => ({ mode: TL.debug.mode, sessions: TL.debug.stats.sessions, soft: TL.debug.stats.soft }));
  log(s.mode === 'play' && s.sessions === 1 && !errors.length ? 'PASS' : 'FAIL', 'play_double_tap', JSON.stringify(s));
  await ctx.close();
};
/** voice log at test speed (?speed=8) — every line is logged even though nothing is spoken */
P.voice_log_speed = async (browser, url) => {
  const { ctx, page } = await page0(browser);
  await page.goto(url + '?bot=1&speed=8&autostart=1&mute=1&age=4&lang=vi&seed=4');
  await page.waitForFunction(() => window.TL && TL.debug && TL.debug.stats.rounds >= 3, null, { timeout: 120000, polling: 300 });
  const s = await page.evaluate(() => { const L = TL.debug.voiceLog; return { n: L.length, vi: L.filter(x => x.lang === 'vi').length, sample: L.slice(0, 6).map(x => x.text) }; });
  log(s.n > 5 && s.vi === s.n ? 'PASS' : 'FAIL', 'voice_log_speed', JSON.stringify(s));
  await ctx.close();
};
/** landscape: after `right` the bubble fades (MECHANICS §11) until the next ask */
P.bubble_fade = async (browser, url) => {
  const { ctx, page, cdp } = await page0(browser, { width: 852, height: 393 });
  await round(page, url);
  const a = await page.evaluate(() => TL.debug.memberScreen(TL.debug.answer().member));
  await tap(cdp, page, a);
  await page.waitForTimeout(300);
  const f1 = await page.evaluate(() => document.getElementById('bubble').classList.contains('fade'));
  await page.evaluate(() => TL.debug.setSpeed(3));
  await page.waitForFunction(() => TL.debug.world.interactive && TL.debug.world.round === 1, null, { timeout: 40000 });
  const f2 = await page.evaluate(() => document.getElementById('bubble').classList.contains('fade'));
  log(f1 && !f2 ? 'PASS' : 'FAIL', 'bubble_fade_landscape', JSON.stringify({ afterRight: f1, nextAsk: f2 }));
  await ctx.close();
};

(async () => {
  const srv = await serve(); const browser = await chromium.launch();
  const want = process.env.PROBES ? process.env.PROBES.split(',') : Object.keys(P);
  for (const k of want) { try { await P[k](browser, srv.url); } catch (e) { log('FAIL', k, 'exception ' + (e.message || e).split('\n')[0]); } }
  await browser.close(); srv.close();
})();
