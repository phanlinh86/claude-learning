// Visual QA screenshots (Mimi's Splash Rocket): every key moment on iPhone + iPad, portrait + landscape, in all 4 moods.
//   node tests/e2e/screens.js                       (all devices, all moods)
//   ONLY=iphone-portrait MOODS=0,2 node tests/e2e/screens.js
//   GAME_LANG=vi node tests/e2e/screens.js
// Writes tests/out/screens/<device>-<mood>-<moment>.png (moments: title, play (mats unfolded), pump (aim + pump), flight
// (mid-flight with the chute), land, pennant, camp (fountain), talk, done). Exits 1 on any console / page error.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('./serve');
const OUT = path.join(__dirname, '..', 'out', 'screens'); fs.mkdirSync(OUT, { recursive: true });
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3 },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3 },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2 },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2 }
];
const MOODS = (process.env.MOODS || '0,1,2,3').split(',').map(Number);
const LANG = process.env.GAME_LANG === 'vi' ? 'vi' : 'en';
// a notch: the same CSS safe-area insets a real iPhone reports (portrait top 59 / bottom 34, landscape left/right 59 / bottom 21)
const NOTCH = d => d.name === 'iphone-portrait' ? { t: 59, r: 0, b: 34, l: 0 } : d.name === 'iphone-landscape' ? { t: 0, r: 59, b: 21, l: 59 } : { t: 24, r: 0, b: 20, l: 0 };

(async () => {
  const srv = await serve();
  const browser = await chromium.launch();
  const errors = [];
  for (const d of DEVICES) {
    if (process.env.ONLY && !process.env.ONLY.split(',').includes(d.name)) continue;
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    const n = NOTCH(d);
    await ctx.addInitScript(n => {
      document.addEventListener('DOMContentLoaded', () => {
        const st = document.createElement('style');
        st.textContent = `:root { --sa-t: ${n.t}px !important; --sa-r: ${n.r}px !important; --sa-b: ${n.b}px !important; --sa-l: ${n.l}px !important; }`;
        document.head.appendChild(st);
      });
    }, n);
    const page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(d.name + ' console: ' + m.text()); });
    page.on('pageerror', e => errors.push(d.name + ' pageerror: ' + String(e)));
    const shot = name => page.screenshot({ path: path.join(OUT, `${d.name}-${name}.png`) });
    const until = (fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 'raf' });
    for (const mood of MOODS) {
      const topic = ['colors', 'shapes', 'count', 'animals'][mood];
      await page.goto(`${srv.url}?mute=1&seed=${5 + mood}&age=4&lang=${LANG}`);
      await until(() => window.DK && DK.debug && DK.debug.mode === 'title');
      if (mood === 0) { await page.waitForTimeout(900); await shot('title'); }
      await page.evaluate(([m, t]) => {
        DK.debug.startGame(); const w = DK.debug.world; w.levels[m] = t; w.startLevel(m);
        DK.debug.weather.setWeather(m, { instant: true }); DK.debug.setSpeed(4);
      }, [mood, topic]);
      const tag = `m${mood}`;
      try {
        await until(() => { const w = DK.debug.world; return w.state === 'round' && w.phase === 'play' && w.phaseTime > 0.6; });
        await page.evaluate(() => DK.debug.setSpeed(1)); await page.waitForTimeout(400);
        await shot(`${tag}-play`);
        // right tap → aim → pump (2 stomps), screenshot while pumping
        await page.evaluate(() => { const w = DK.debug.world, h = w.matHit(w.answer().id); w.pointerDown(h.x, h.y); w.pointerUp(h.x, h.y); });
        await until(() => DK.debug.world.phase === 'pump');
        await page.evaluate(() => { const w = DK.debug.world, p = w.layout.pump; w.pointerDown(p.x, p.y); w.pointerUp(p.x, p.y); });
        await page.waitForTimeout(300);
        await page.evaluate(() => { const w = DK.debug.world, p = w.layout.pump; w.pointerDown(p.x, p.y); w.pointerUp(p.x, p.y); });
        await page.waitForTimeout(60);
        await shot(`${tag}-pump`);
        await page.waitForTimeout(300);
        await page.evaluate(() => { const w = DK.debug.world, p = w.layout.pump; w.pointerDown(p.x, p.y); w.pointerUp(p.x, p.y); });
        await until(() => { const r = DK.debug.world.rocket; return r.state === 'chute' && r.chute > 0.9; });
        await page.evaluate(() => DK.debug.setSpeed(0.0001)); await page.waitForTimeout(150);
        await shot(`${tag}-flight`);
        await page.evaluate(() => DK.debug.setSpeed(1));
        await until(() => DK.debug.events.some(e => e.type === 'land'));
        await page.waitForTimeout(250);
        await shot(`${tag}-land`);
        await until(() => DK.debug.events.some(e => e.type === 'pennant'));
        await page.waitForTimeout(400);
        await shot(`${tag}-pennant`);
        // the bot finishes the round: the camp fountain
        await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(3); });
        await until(() => DK.debug.world.fountain && DK.debug.world.fountain.h > 140);
        await page.evaluate(() => DK.debug.setSpeed(0.0001)); await page.waitForTimeout(150);
        await shot(`${tag}-camp`);
        if (mood === 1) {   // Talk time
          await page.evaluate(() => DK.debug.setSpeed(8));
          await until(() => DK.debug.world.state === 'talk' && !DK.debug.world.talkAnswered, null, 200000).catch(() => {});
          await page.evaluate(() => { DK.debug.setBot(false); DK.debug.setSpeed(1); }); await page.waitForTimeout(900);
          await shot('talk');
        }
        if (mood === 3) {   // the celebration
          await page.evaluate(() => { DK.debug.setBot(true, 1); DK.debug.setSpeed(10); });
          await until(() => DK.debug.mode === 'done', null, 300000);
          await page.evaluate(() => DK.debug.setSpeed(1)); await page.waitForTimeout(2600);
          await shot('done');
        }
      } catch (e) { errors.push(`${d.name} mood ${mood}: ${e.message.split('\n')[0]}`); await shot(`${tag}-fail`); }
    }
    await ctx.close();
  }
  await browser.close(); srv.close();
  console.log(errors.length ? 'ERRORS:\n' + errors.join('\n') : 'screens ok → ' + OUT);
  process.exit(errors.length ? 1 : 0);
})();
