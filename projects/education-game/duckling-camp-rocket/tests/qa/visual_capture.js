// Visual QA capture (Nim's River Hop) — report-only. Screenshots + per-frame measurements of every screen.
//   node tests/qa/visual_capture.js <device> <lang> [notch 0|1] [part main|ages]
//   device: iphone-portrait | iphone-landscape | ipad-portrait | ipad-landscape
// Writes tests/out/qa_visual/<tag>/<n>-<name>.png and tests/out/qa_visual/<tag>.json (tag = device-lang[-notch][-ages]).
'use strict';
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const { PAGE_JS } = require('./visual_lib');

const DEV = {
  'iphone-portrait': { viewport: { width: 393, height: 852 }, dpr: 2, notch: { t: 59, b: 34, l: 0, r: 0 } },
  'iphone-landscape': { viewport: { width: 852, height: 393 }, dpr: 2, notch: { t: 0, b: 21, l: 59, r: 59 } },
  'ipad-portrait': { viewport: { width: 820, height: 1180 }, dpr: 1, notch: { t: 24, b: 20, l: 0, r: 0 } },
  'ipad-landscape': { viewport: { width: 1180, height: 820 }, dpr: 1, notch: { t: 24, b: 20, l: 0, r: 0 } }
};
const [device = 'iphone-portrait', lang = 'en', notchArg = '0', part = 'main'] = process.argv.slice(2);
const notch = notchArg === '1';
const tag = `${device}-${lang}${notch ? '-notch' : ''}${part === 'ages' ? '-ages' : ''}`;
const OUT = path.join(__dirname, '..', 'out', 'qa_visual', tag); fs.mkdirSync(OUT, { recursive: true });
const D = DEV[device];
const waitFor = (page, fn, arg, timeout = 60000) => page.waitForFunction(fn, arg, { timeout, polling: 'raf' });

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: D.viewport, deviceScaleFactor: D.dpr, isMobile: true, hasTouch: true });
  const sa = notch ? D.notch : null;
  await ctx.addInitScript(({ js, sa }) => {
    // eslint-disable-next-line no-eval
    (0, eval)(js);
    if (sa) document.addEventListener('DOMContentLoaded', () => {
      const st = document.createElement('style');
      st.textContent = `:root{--sa-t:${sa.t}px !important;--sa-r:${sa.r}px !important;--sa-b:${sa.b}px !important;--sa-l:${sa.l}px !important}`;
      document.head.appendChild(st);
    });
  }, { js: PAGE_JS, sa });
  const page = await ctx.newPage(), errs = [], data = { tag, device, lang, notch: sa, shots: {}, rec: {} };
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push(String(e)));
  let n = 0;
  const shot = async (name) => {
    const file = `${String(n++).padStart(2, '0')}-${name}.png`;
    let m = null; try { m = await page.evaluate(l => window.__qa.measure(l), name); } catch (e) { m = { err: e.message.split('\n')[0] }; }
    await page.screenshot({ path: path.join(OUT, file) });
    data.shots[file] = m;
    return m;
  };
  const fresh = async (q = {}) => {
    await page.goto(`${srv.url}?mute=1&seed=${q.seed || 3}&age=${q.age || 4}&lang=${lang}${q.extra || ''}`);
    await waitFor(page, () => window.DK && DK.debug && DK.debug.mode === 'title', null, 20000);
    await page.waitForTimeout(200);
  };
  const start = async (topic, level, opt = {}) => {
    await page.evaluate(([t, lv]) => { DK.debug.startGame(); const w = DK.debug.world; w.levels[lv] = t; w.startLevel(lv); DK.debug.setSpeed(4); }, [topic, level]);
    await waitFor(page, () => DK.debug.world.interactive && DK.debug.world.phaseTime > 1.2);
    await page.evaluate(() => DK.debug.setSpeed(1));
    await page.waitForTimeout(opt.wait || 300);
  };
  const tapAnswer = () => page.evaluate(() => { const w = DK.debug.world, a = DK.debug.answer(); if (a == null) return false; const h = w.stoneHit(a.id != null ? a.id : a); if (!h) return false; w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); return true; });
  const step = async (name, fn) => { try { await fn(); } catch (e) { errs.push(`${name}: ${e.message.split('\n')[0]}`); } };

  if (part === 'main') {
    await step('title', async () => { await fresh({}); await page.waitForTimeout(1600); await shot('title'); });
    await step('settings', async () => {
      await page.evaluate(() => { if (DK.UI.refreshSettings) DK.UI.refreshSettings(); DK.UI.only('scrSettings'); });
      await page.waitForTimeout(400); await shot('settings');
    });
    await step('banner', async () => {
      await fresh({ seed: 4 });
      await page.evaluate(() => { DK.debug.startGame(); const w = DK.debug.world; w.levels[0] = 'colors'; w.startLevel(0); });
      await waitFor(page, () => DK.debug.world.state === 'intro' && DK.debug.world.stateTime > 0.7);
      await page.evaluate(() => DK.debug.setSpeed(0.1));
      await page.waitForTimeout(150); await shot('banner');
    });
    // play in each season, colours topic (for the answer-colour contrast) + the season's default topic
    const seasons = ['spring', 'summer', 'autumn', 'winter'];
    for (let lv = 0; lv < 4; lv++) {
      await step('play-' + seasons[lv], async () => {
        await fresh({ seed: 3 + lv, age: 4 });
        await start('colors', lv, { wait: lv === 0 ? 400 : 2900 });
        await shot(`play-${seasons[lv]}-colors`);
      });
      await step('play5-' + seasons[lv], async () => {
        await fresh({ seed: 30 + lv, age: 5 });
        await start('colors', lv, { wait: lv === 0 ? 400 : 2900 });   // age 5: pink + every pair allowed
        await shot(`play-${seasons[lv]}-colors-age5`);
      });
      await step('playt-' + seasons[lv], async () => {
        await fresh({ seed: 9 + lv, age: lv === 2 ? 6 : 4 });
        await start(['shapes', 'count', 'animals', 'count'][lv], lv, { wait: lv === 0 ? 400 : 2900 });
        await shot(`play-${seasons[lv]}-${['shapes', 'count', 'animals', 'count'][lv]}`);
      });
    }
    // wrong + hint hand, hop mid-air, Nim on each row, bank roll, fruit sticking, fruit on back
    await step('crossing', async () => {
      await fresh({ seed: 6 });
      await start('colors', 0);
      await page.evaluate(() => { const w = DK.debug.world, wr = w.stones.filter(s => s.row === w.row && !s.target && s.state === 'rest'); for (const s of wr.slice(0, 2)) { const h = w.stoneHit(s.id); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); } });
      await page.waitForTimeout(160); await shot('wrong-wobble');
      await page.waitForTimeout(500);
      await page.evaluate(() => { const w = DK.debug.world; if (w.hint) w.hint(); });
      await page.waitForTimeout(700); await shot('wrong-hint');
      await page.waitForTimeout(1500);
      const k = await page.evaluate(() => DK.debug.world.cur.k);
      for (let r = 0; r < k; r++) {
        await waitFor(page, () => DK.debug.world.interactive);
        await page.evaluate(() => DK.debug.setSpeed(0.25)); await tapAnswer();
        if (r === 0) { await waitFor(page, () => DK.debug.world.nim.state === 'air' && DK.debug.world._hop && DK.debug.world._hop.t > 0.25); await page.evaluate(() => DK.debug.setSpeed(0.1)); await shot('hop-midair'); await page.evaluate(() => DK.debug.setSpeed(0.25)); }
        await waitFor(page, r2 => DK.debug.world.nim.state === 'stand' && DK.debug.world.nim.onRow === r2, r);
        await page.evaluate(() => DK.debug.setSpeed(1)); await page.waitForTimeout(900);
        await shot(`nim-on-row${r}`);
      }
      await waitFor(page, () => DK.debug.world.nim.state === 'roll' && DK.debug.world.nim.curl > 0.8);
      await page.evaluate(() => DK.debug.setSpeed(0.1)); await page.waitForTimeout(100); await shot('bank-roll');
      await page.evaluate(() => DK.debug.setSpeed(0.3));
      await waitFor(page, () => DK.debug.world.fruit && DK.debug.world.fruit.state !== 'wait');
      await page.evaluate(() => DK.debug.setSpeed(0.1)); await page.waitForTimeout(100); await shot('fruit-sticking');
      await page.evaluate(() => DK.debug.setSpeed(1));
      await waitFor(page, () => DK.debug.world.state === 'roundDone');
      await page.waitForTimeout(400); await shot('fruit-on-back');
      await waitFor(page, () => DK.debug.world.wipe && DK.debug.world.wipe.t > 0.3);
      await page.evaluate(() => DK.debug.setSpeed(0.1)); await page.waitForTimeout(120); await shot('wipe');
      await page.evaluate(() => DK.debug.setSpeed(1));
      // pause
      await waitFor(page, () => DK.debug.world.interactive, null, 30000);
      await page.evaluate(() => document.getElementById('btnPause').click());
      await page.waitForTimeout(500); await shot('pause');
      await page.evaluate(() => document.getElementById('btnResume').click());
    });
    // countSel counted above Nim + a homeBadge
    await step('count-sel', async () => {
      await fresh({ seed: 8 });
      await start('count', 0);
      await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(6); });
      await waitFor(page, () => DK.debug.world.round === 1 && DK.debug.world.interactive && DK.debug.world.phaseTime > 1, null, 90000);
      await page.evaluate(() => DK.debug.setBot(false)); await page.evaluate(() => DK.debug.setSpeed(1));
      await tapAnswer();
      await waitFor(page, () => DK.debug.world.stones.some(s => s.count >= 2));
      await shot('count-sel');
    });
    await step('home-badge', async () => {
      await fresh({ seed: 12, age: 5 });
      await start('animals', 2, { wait: 2900 });
      await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(4); });
      await waitFor(page, () => DK.debug.world.round >= 1 && DK.debug.world.interactive && DK.debug.world.phaseTime > 1, null, 90000);
      await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); });
      await tapAnswer();
      await waitFor(page, () => DK.debug.events.slice(-12).some(e => e.type === 'homeBadge'), null, 8000).catch(() => {});
      await page.waitForTimeout(250); await shot('home-badge');
    });
    // Talk time (natural, after a chapter) + done, a whole fast bot session with the sampler running
    await step('session', async () => {
      await page.goto(`${srv.url}?mute=1&seed=11&age=4&lang=${lang}&bot=1&speed=8&autostart=1`);
      await waitFor(page, () => window.DK && DK.debug && DK.debug.mode === 'play', null, 30000);
      await page.evaluate(() => window.__qa.startRec());
      await waitFor(page, () => DK.debug.world.state === 'talk', null, 200000);
      await page.evaluate(() => { DK.debug.setSpeed(1); DK.debug.setBot(false); });
      await page.waitForTimeout(900); await shot('talk');
      await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); });
      await waitFor(page, () => DK.debug.world.state === 'levelDone' && DK.debug.world.stateTime > 0.5, null, 60000);
      await page.evaluate(() => DK.debug.setSpeed(0.1)); await page.waitForTimeout(150); await shot('chapter-stars');
      await page.evaluate(() => DK.debug.setSpeed(8));
      await waitFor(page, () => DK.debug.world.state === 'round' && DK.debug.world.nim.fruits.length >= 3 && DK.debug.world.nim.onRow === -1 && DK.debug.world.interactive, null, 200000);
      await page.evaluate(() => { DK.debug.setSpeed(0.1); }); await page.waitForTimeout(150); await shot('fruits3-on-back');
      await page.evaluate(() => DK.debug.setSpeed(10));
      await waitFor(page, () => DK.debug.mode === 'done', null, 500000);
      data.rec.session = await page.evaluate(() => window.__qa.stopRec());
      await page.evaluate(() => DK.debug.setSpeed(1)); await page.waitForTimeout(2500); await shot('done');
    });
    // extra sampler: two more chapters at ages 6 and 3 (more stone layouts)
    for (const [age, seed] of [[6, 21], [3, 22], [7, 23]]) {
      await step('rec' + age, async () => {
        await page.goto(`${srv.url}?mute=1&seed=${seed}&age=${age}&lang=${lang}&bot=1&speed=10&autostart=1`);
        await waitFor(page, () => window.DK && DK.debug && DK.debug.mode === 'play', null, 30000);
        await page.evaluate(() => window.__qa.startRec());
        await waitFor(page, () => DK.debug.mode === 'done', null, 500000);
        data.rec['age' + age] = await page.evaluate(() => window.__qa.stopRec());
      });
    }
  } else {
    // every topic at ages 3, 5, 6, 7: one round each + its Talk time
    const TOP = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'], 5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
    for (const age of [3, 4, 5, 6, 7]) {
      for (let i = 0; i < TOP[age].length; i++) {
        const topic = TOP[age][i];
        await step(`a${age}-${topic}`, async () => {
          await fresh({ seed: 40 + age * 7 + i, age });
          await start(topic, i, { wait: i === 0 ? 500 : 2900 });
          // round 1 (not the warm-up) for a fuller row layout
          await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(8); });
          await waitFor(page, () => DK.debug.world.round >= 1 && DK.debug.world.interactive && DK.debug.world.phaseTime > 1.2, null, 90000);
          await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); });
          await page.waitForTimeout(400);
          await shot(`age${age}-${topic}`);
          await page.evaluate(() => DK.debug.world._startTalk());
          await page.waitForTimeout(900);
          await shot(`age${age}-${topic}-talk`);
        });
      }
    }
  }
  data.errors = errs;
  fs.writeFileSync(path.join(__dirname, '..', 'out', 'qa_visual', tag + '.json'), JSON.stringify(data, null, 1));
  console.log(tag, 'shots', n, errs.length ? 'ERRORS ' + errs.slice(0, 6).join(' | ') : 'ok');
  await browser.close(); srv.close();
})();
