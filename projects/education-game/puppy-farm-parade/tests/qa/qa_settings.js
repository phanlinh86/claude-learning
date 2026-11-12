// Independent QA: parent gate, settings mid-session (language, age 3→7, name with diacritics, volume 0 → back), Play again,
// autostart flows, URL flags never saved. Real touch input.  node tests/qa/qa_settings.js [ONLY=ipp]
const L = require('./qa_lib');
const { tap, touch, tp } = L;
const results = [];
const rec = (dev, test, ok, detail) => { results.push({ dev, test, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'} ${dev.padEnd(16)} ${test}  — ${JSON.stringify(detail).slice(0, 1400)}`); };
const VI = /[ăâđêôơưàáảãạằắẳẵặầấẩẫậèéẻẽẹềếểễệìíỉĩịòóỏõọồốổỗộờớởỡợùúủũụừứửữựỳýỷỹỵ]/i;
const center = (page, sel) => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
async function holdGear(page, cdp, ms) { const c = await center(page, '#btnParents'); await touch(cdp, 'touchStart', [tp(c.x, c.y)]); await page.waitForTimeout(ms); await touch(cdp, 'touchEnd'); await page.waitForTimeout(250); }
async function ctap(page, cdp, sel) { await page.waitForSelector(sel, { state: 'visible', timeout: 10000 }); await page.waitForTimeout(120); const c = await center(page, sel); await tap(cdp, page, c, 50); await page.waitForTimeout(120); }
const vis = (page, id) => page.evaluate(i => !document.getElementById(i).classList.contains('hidden'), id);

const T = {};
T.settings_mid_session = async ({ page, cdp, url }) => {
  const out = {};
  await L.gotoTitle(page, url + '?mute=1&seed=7');
  await page.evaluate(() => localStorage.clear());
  await L.gotoTitle(page, url + '?mute=1&seed=7');
  // play a round in EN at the default age
  await ctap(page, cdp, '#btnPlay');
  await page.waitForFunction(() => FP.debug.mode === 'play');
  out.age0 = await page.evaluate(() => FP.debug.world.age);
  await L.waitReady(page);
  // pause → home → short tap on the gear must NOT open; 2.2 s hold opens
  await ctap(page, cdp, '#btnPause'); await page.waitForTimeout(200);
  await ctap(page, cdp, '#btnHome'); await page.waitForTimeout(300);
  await holdGear(page, cdp, 300);
  out.shortOpens = await vis(page, 'scrSettings');
  await holdGear(page, cdp, 2300);
  out.longOpens = await vis(page, 'scrSettings');
  // VI, age 7, name with diacritics, volume 0
  await ctap(page, cdp, '#scrSettings [data-lang="vi"]');
  await ctap(page, cdp, '#ageChips [data-age="3"]');
  await ctap(page, cdp, '#ageChips [data-age="7"]');
  await ctap(page, cdp, '#inpName');
  await page.locator('#inpName').fill('');
  await page.keyboard.type('Mầm Đức<b>{x}');
  await page.evaluate(() => { const s = document.getElementById('optVolume'); s.value = 0; s.dispatchEvent(new Event('input')); s.dispatchEvent(new Event('change')); });
  await page.waitForTimeout(300);
  out.audio0 = await page.evaluate(() => { const A = FP.debug.audio(); return { vol: A.volume, user: A.user && +A.user.gain.value.toFixed(3), voiceVol: FP.Voice._volume !== undefined ? FP.Voice._volume : (FP.Voice.volume !== undefined ? FP.Voice.volume : '?') }; });
  out.saved = await page.evaluate(() => JSON.parse(localStorage.getItem('fp:settings') || 'null'));
  await ctap(page, cdp, '#btnSettingsDone'); await page.waitForTimeout(200);
  out.titleAge = await page.evaluate(() => document.getElementById('titleAge').textContent);
  out.titleLang = await page.evaluate(() => document.getElementById('btnPlay').getAttribute('aria-label'));
  const s0 = await L.saidLen(page);
  await ctap(page, cdp, '#btnPlay');
  await page.waitForFunction(() => FP.debug.mode === 'play');
  await L.waitReady(page);
  out.world = await page.evaluate(() => ({ age: FP.debug.world.age, lang: FP.debug.world.lang, levels: FP.debug.world.levels, bubble: document.getElementById('bubbleText').textContent }));
  // a full round by the bot to collect a great/praise line with the name
  await page.evaluate(() => { FP.debug.setBot(true, 1); FP.debug.setSpeed(4); });
  await page.waitForFunction(() => FP.debug.world.round >= 2, null, { timeout: 60000 });
  await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
  const said = (await L.saidSince(page, s0)).map(s => s.text);
  out.saidNotVi = said.filter(t => !VI.test(t) && !/^[\d\s+\-=.,!?…]+$/.test(t));
  out.nameLines = said.filter(t => /Mầm Đức/.test(t));
  out.badName = said.filter(t => /[<>{}]/.test(t) || /M\?m|Mầm Ð/.test(t));
  // volume back up in the pause menu
  await ctap(page, cdp, '#btnPause'); await page.waitForTimeout(200);
  for (let k = 0; k < 3; k++) { await ctap(page, cdp, '#btnVolUp'); await page.waitForTimeout(80); }
  await page.waitForTimeout(300);
  out.audioUp = await page.evaluate(() => { const A = FP.debug.audio(); return { vol: A.volume, user: A.user && +A.user.gain.value.toFixed(3), label: document.getElementById('volLevel').textContent, saved: JSON.parse(localStorage.getItem('fp:settings')).volume }; });
  for (let k = 0; k < 15; k++) await ctap(page, cdp, '#btnVolDown');
  out.audioMin = await page.evaluate(() => ({ vol: FP.debug.audio().volume, label: document.getElementById('volLevel').textContent }));
  for (let k = 0; k < 15; k++) await ctap(page, cdp, '#btnVolUp');
  out.audioMax = await page.evaluate(() => ({ vol: FP.debug.audio().volume, label: document.getElementById('volLevel').textContent }));
  await ctap(page, cdp, '#btnResume');
  const ok = !out.shortOpens && out.longOpens && out.world.age === 7 && out.world.lang === 'vi' && out.world.levels.every(t => ['count', 'initial', 'add', 'sub', 'oddeven'].includes(t)) &&
    out.audio0.vol === 0 && out.audio0.user === 0 && out.saidNotVi.length === 0 && out.nameLines.length > 0 && out.badName.length === 0 && out.audioUp.vol > 0.25 && out.audioMin.vol === 0 && out.audioMax.vol === 1 && out.saved && out.saved.name === 'Mầm Đứcbx';
  return { ok, detail: out };
};
T.title_lang_switch = async ({ page, cdp, url }) => {
  // mid-session: pause → home → language chip on the title → play: everything in the new language, then back
  await L.gotoTitle(page, url + '?mute=1&seed=9&age=4');
  await ctap(page, cdp, '#scrTitle [data-lang="en"]');
  await ctap(page, cdp, '#btnPlay'); await L.waitReady(page);
  await ctap(page, cdp, '#btnPause'); await ctap(page, cdp, '#btnHome');
  await ctap(page, cdp, '#scrTitle [data-lang="vi"]');
  const s0 = await L.saidLen(page);
  await ctap(page, cdp, '#btnPlay'); await L.waitReady(page);
  const said = (await L.saidSince(page, s0)).map(s => s.text);
  const r = await page.evaluate(() => ({ lang: FP.debug.world.lang, bubble: document.getElementById('bubbleText').textContent, html: document.documentElement.lang, pause: document.querySelector('#scrPause h2').textContent }));
  const notVi = said.filter(t => !VI.test(t));
  return { ok: r.lang === 'vi' && VI.test(r.bubble) && r.html === 'vi' && notVi.length === 0, detail: { r, said: said.slice(0, 4), notVi } };
};
T.play_again = async ({ page, cdp, url }) => {
  await L.gotoTitle(page, url + '?mute=1&seed=12&age=4&lang=en');
  await page.evaluate(() => { FP.debug.startGame(); FP.debug.setBot(true, 1); FP.debug.setSpeed(10); });
  await page.waitForFunction(() => FP.debug.mode === 'done', null, { timeout: 300000, polling: 500 });
  await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
  await page.waitForTimeout(1500);
  const done = await page.evaluate(() => ({ stars: FP.debug.world.stars, shown: document.getElementById('doneStars').textContent, title: document.getElementById('doneTitle').textContent, hud: !document.getElementById('hud').classList.contains('hidden') }));
  await L.shot(page, 'done');
  // a 3-year-old double-taps Play again
  const b = await center(page, '#btnAgain');
  await tap(cdp, page, b, 40); await page.waitForTimeout(30); await tap(cdp, page, b, 40);
  await page.waitForTimeout(500);
  const again = await page.evaluate(() => ({ mode: FP.debug.mode, sessions: FP.debug.stats.sessions, stars: FP.debug.world.stars, hud: document.getElementById('hudStars').textContent, dots: [...document.getElementById('hudDots').children].map(c => c.className).join(','), done: !document.getElementById('scrDone').classList.contains('hidden'), state: FP.debug.world.state, gallery: (FP.debug.render().gallery || []).length }));
  await L.waitReady(page);
  const i = await L.info(page);
  const n0 = await L.evLen(page);
  await tap(cdp, page, i.at); await page.waitForTimeout(300);
  const right = (await L.evSince(page, n0)).some(e => e.type === 'right');
  return { ok: again.mode === 'play' && again.stars === 0 && again.hud === '0' && !again.done && right && again.sessions === 2, detail: { done, again, right } };
};
T.autostart = async ({ page, cdp, url }) => {
  await page.goto(url + '?mute=1&seed=4&autostart=1&lang=vi&age=7');
  await page.waitForFunction(() => window.FP && FP.debug && FP.debug.mode === 'play', null, { timeout: 20000 });
  await page.evaluate(() => window.__hook());
  await L.waitReady(page);
  const r = await page.evaluate(() => ({ age: FP.debug.world.age, lang: FP.debug.world.lang, title: !document.getElementById('scrTitle').classList.contains('hidden'), saved: localStorage.getItem('fp:settings') }));
  const i = await L.info(page), n0 = await L.evLen(page);
  await tap(cdp, page, i.at); await page.waitForTimeout(300);
  const right = (await L.evSince(page, n0)).some(e => e.type === 'right');
  // reload without flags: nothing from the URL was saved
  await L.gotoTitle(page, url);
  const s = await page.evaluate(() => ({ age: FP.debug.world.age, st: FP.debug.getState().settings, speed: FP.debug.getState().speed }));
  return { ok: r.age === 7 && r.lang === 'vi' && !r.title && right && !(s.st.lang === 'vi' && s.st.age === 7) && s.speed === 1, detail: { r, right, s } };
};
T.autostart_bot_no_restart = async ({ page, cdp, url }) => {
  // ?autostart=1&bot=1 without autorestart: the done screen stays, nothing errors, title after Home
  await page.goto(url + '?mute=1&seed=5&autostart=1&bot=1&speed=10&age=3');
  await page.waitForFunction(() => window.FP && FP.debug && FP.debug.mode === 'done', null, { timeout: 300000, polling: 500 });
  await page.waitForTimeout(2000);
  const m1 = await page.evaluate(() => FP.debug.mode);
  await ctap(page, cdp, '#btnDoneHome'); await page.waitForTimeout(400);
  const m2 = await page.evaluate(() => ({ mode: FP.debug.mode, title: !document.getElementById('scrTitle').classList.contains('hidden'), stars: document.getElementById('titleStars').textContent }));
  return { ok: m1 === 'done' && m2.mode === 'title' && m2.title, detail: { m1, m2 } };
};
T.talk_double_tap = async ({ page, cdp, url }) => {
  // Talk time: a child double-taps the WRONG picture then the right one: one result, no 2nd star, kind words
  await L.gotoTitle(page, url + '?mute=1&seed=3&age=4&lang=en');
  await page.evaluate(() => { FP.debug.startGame(); const w = FP.debug.world; w.levels[0] = 'count'; w.startLevel(0); w.round = w.roundsPerLevel - 1; FP.debug.setBot(true, 1); FP.debug.setSpeed(6); });
  await page.waitForFunction(() => FP.debug.mode === 'talk', null, { timeout: 60000 });
  await page.evaluate(() => { FP.debug.setBot(false); FP.debug.setSpeed(1); });
  await page.waitForTimeout(500);
  const t = await page.evaluate(() => ({ ans: FP.debug.world.talk.answer, ids: FP.debug.world.talk.choices.map(c => c.id), stars: FP.debug.world.stars }));
  const wrongId = t.ids.find(i => i !== t.ans);
  const s0 = await L.saidLen(page);
  const wb = await center(page, `#talkChoices button[data-id="${wrongId}"]`), rb = await center(page, `#talkChoices button[data-id="${t.ans}"]`);
  await tap(cdp, page, wb, 40); await tap(cdp, page, wb, 40); await tap(cdp, page, rb, 40);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ results: window.__ev.filter(e => e.type === 'talkResult').length, stars: FP.debug.world.stars, sizes: [...document.querySelectorAll('#talkChoices button')].map(b => Math.round(b.getBoundingClientRect().width) + 'x' + Math.round(b.getBoundingClientRect().height)) }));
  const said = (await L.saidSince(page, s0)).map(s => s.text);
  return { ok: r.results === 1 && r.stars === t.stars && said.length >= 1, detail: { t, r, said } };
};

(async () => {
  const srv = await L.serve(), browser = await L.chromium.launch();
  const only = (process.env.ONLY || 'ipp,padl').split(',');
  const tests = process.env.TESTS ? process.env.TESTS.split(',') : Object.keys(T);
  for (const k of only) for (const t of tests) {
    const d = L.DEVICES[k], errors = [];
    const { ctx, page, cdp } = await L.newPage(browser, d, errors);
    try {
      const r = await T[t]({ page, cdp, url: srv.url, d });
      rec(d.name, t, r.ok && !errors.length, Object.assign({}, r.detail, errors.length ? { errors } : {}));
    } catch (e) { let st = null; try { st = await page.evaluate(() => FP.debug.getState()); } catch (er) { /* */ } rec(d.name, t, false, { exc: e.message.split('\n')[0], st: st && { mode: st.mode, state: st.state, phase: st.phase }, errors }); }
    await ctx.close();
  }
  await browser.close(); srv.close();
  L.fs.writeFileSync(L.path.join(L.OUT, 'qa_settings.json'), JSON.stringify(results, null, 1));
})();
