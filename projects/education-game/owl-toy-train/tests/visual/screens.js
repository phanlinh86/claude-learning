// Visual QA: every screen × 4 viewports × EN/VI, plus DOM measurements (overlap, touch targets, text fit).
//   node tests/visual/screens.js   (ONLY=ip-p LANGS=en to narrow; NOTCH=1 to emulate safe-area insets)
const L = require('./lib');
const path = require('path'), fs = require('fs');
(async () => {
  const { srv, browser } = await L.launch();
  const notch = process.env.NOTCH === '1', tag = notch ? 'notch-' : '';
  const langs = (process.env.LANGS || 'en,vi').split(',');
  const meas = [];
  for (const vp of Object.keys(L.VIEWPORTS)) { if (process.env.ONLY && process.env.ONLY !== vp) continue;
    for (const lang of langs) {
      const N = s => `scr-${tag}${vp}-${lang}-${s}`;
      const { ctx, page } = await L.open(browser, vp, `seed=5&age=4&lang=${lang}`, { url: srv.url, notch });
      const cdp = await ctx.newCDPSession(page);
      const m = { vp, lang, notch };
      await L.shot(page, N('01-title'));
      m.title = await page.evaluate(() => {
        const r = s => { const e = document.querySelector(s); if (!e) return null; const b = e.getBoundingClientRect(); return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) }; };
        return { play: r('#btnPlay'), gear: r('#btnParents'), en: r('.title-top [data-lang=en]'), vi: r('.title-top [data-lang=vi]'), logo: r('.logo'), tagline: r('#tagline'), vw: innerWidth, vh: innerHeight };
      });
      // settings
      await page.evaluate(() => { TT.UI.refreshSettings && TT.UI.refreshSettings(); TT.UI.only('scrSettings'); });
      await page.waitForTimeout(250);
      await L.shot(page, N('02-settings'));
      m.settings = await page.evaluate(() => {
        const p = document.querySelector('.settings-panel').getBoundingClientRect();
        const over = [...document.querySelectorAll('#scrSettings label, #scrSettings button, #scrSettings h2')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent.trim().slice(0, 30));
        const chips = [...document.querySelectorAll('#ageChips .chip')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; });
        const done = document.getElementById('btnSettingsDone').getBoundingClientRect();
        const sc = document.querySelector('.settings-panel');
        return { panel: [Math.round(p.x), Math.round(p.y), Math.round(p.width), Math.round(p.height)], scrolls: sc.scrollHeight > sc.clientHeight + 1, overflowText: over, chip: chips[0], doneVisible: done.bottom <= innerHeight && done.top >= 0, done: [Math.round(done.width), Math.round(done.height)] };
      });
      await page.evaluate(() => TT.UI.only('scrTitle'));
      // chapter banner + arrive
      await L.startTopic(page, { topic: 'colors', lvl: 0 });
      await page.waitForTimeout(500);
      await L.shot(page, N('03-banner'));
      await L.until(page, () => TT.debug.world.phase === 'arrive');
      await page.waitForTimeout(500);
      await L.shot(page, N('04-arrive'));
      await L.toLoad(page);
      // skip warm-up to a 3-car round
      await L.solve(page);
      await page.evaluate(() => { TT.debug.setSpeed(8); });
      await L.until(page, () => { const w = TT.debug.world; return w.round >= 1 && w.phase === 'load' && w.items.every(i => i.state === 'rest'); });
      await page.evaluate(() => TT.debug.setSpeed(1));
      await page.waitForTimeout(1500);
      await L.shot(page, N('05-ask'));
      m.play = await page.evaluate(() => {
        const D = TT.debug, w = D.world, v = D.view();
        const r = s => { const e = document.querySelector(s); const b = e.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
        const hud = r('#hud'), bub = r('#bubble'), pause = r('#btnPause');
        const inter = (a, b) => !(a.r <= b.x || b.r <= a.x || a.b <= b.y || b.b <= a.y);
        const items = w.items.map(i => { const h = D.itemScreen(i.id); return { x: h.x - h.w / 2, y: h.y - h.h / 2, w: h.w, h: h.h, r: h.x + h.w / 2, b: h.y + h.h / 2, size: i.size }; });
        const bubText = document.getElementById('bubbleText');
        return { s: v.s, W: v.W, H: v.H, ins: v.ins, hud, bub, pauseCss: [Math.round(pause.w), Math.round(pause.h)], pauseLogical: Math.round(pause.w / v.s),
          bubOverHud: inter(hud, bub), itemsUnderHud: items.filter(b => inter(b, hud)).length, itemsUnderBubble: items.filter(b => inter(b, bub)).length,
          itemsOff: items.filter(b => b.x < 0 || b.y < 0 || b.r > innerWidth || b.b > innerHeight).length,
          itemHitLogical: Math.round(items[0].w / v.s), itemSizeLogical: Math.round(items[0].size), itemCss: Math.round(items[0].w),
          bubbleClipped: bubText.scrollHeight > document.getElementById('bubble').clientHeight + 2 || bub.r > innerWidth || bub.x < 0,
          bubbleText: bubText.textContent, cars: w.cars.map(c => { const b = D.carScreen(c.id); return [Math.round(b.x - b.w / 2), Math.round(b.y), Math.round(b.w), Math.round(b.h)]; }),
          whistle: (b => [Math.round(b.w), Math.round(b.x), Math.round(b.y)])(D.whistleScreen()), momo: (b => [Math.round(b.x), Math.round(b.y), Math.round(b.w), Math.round(b.h)])(D.momoScreen()),
          layout: { trackY: w.layout.trackY, groundY: w.layout.groundY, rug: w.layout.rug, bubble: w.layout.bubble, S: w.layout.S, carScale: w.layout.carScale } };
      });
      // drag in progress (finger held over the right car)
      const tgt = await page.evaluate(() => { const D = TT.debug, w = D.world; const it = w.items.find(i => i.state === 'rest'); const cars = w.cars.map(c => c.id); const right = D.answerCarId(it.id); const wrong = cars.find(c => c !== right);
        return { id: it.id, a: D.itemScreen(it.id), right: D.carScreen(right), wrong: D.carScreen(wrong) }; });
      await L.dragTo(page, cdp, tgt.a, { x: (tgt.a.x + tgt.right.x) / 2, y: (tgt.a.y + tgt.right.y) / 2 }, { hold: true });
      await page.waitForTimeout(120);
      await L.shot(page, N('06-drag'));
      // wrong drop: continue to the wrong car and release
      for (let i = 1; i <= 6; i++) { await L.touch(cdp, 'touchMove', tgt.a.x + (tgt.wrong.x - tgt.a.x) * i / 6, tgt.a.y + (tgt.wrong.y - tgt.wrong.h * 0.4 - tgt.a.y) * i / 6); await page.waitForTimeout(25); }
      await page.waitForTimeout(80); await L.touch(cdp, 'touchEnd');
      await page.waitForTimeout(220);
      await L.shot(page, N('07-wrong'));
      await page.waitForTimeout(1200);
      // hint with ghost hand
      await page.evaluate(() => { TT.debug.world._lastHintT = -1e9; TT.debug.world.hint(); });
      await page.waitForTimeout(900);
      await L.shot(page, N('08-hint'));
      // whistle phase
      await L.solve(page);
      await L.until(page, () => TT.debug.world.phase === 'whistle');
      await page.evaluate(() => { TT.debug.setSpeed(8); });
      await L.until(page, () => TT.debug.world.phaseTime > 6.5, null, 20000);   // nudge glow + tap hand
      await page.evaluate(() => TT.debug.setSpeed(1));
      await page.waitForTimeout(500);
      await L.shot(page, N('09-whistle'));
      // depart (tap the whistle with a real touch)
      const wh = await page.evaluate(() => TT.debug.whistleScreen());
      await L.touch(cdp, 'touchStart', wh.x, wh.y); await page.waitForTimeout(60); await L.touch(cdp, 'touchEnd');
      await page.waitForTimeout(450); await L.shot(page, N('10-depart-a'));
      await page.waitForTimeout(500); await L.shot(page, N('10-depart-b'));
      // pause
      await page.evaluate(() => document.getElementById('btnPause').click());
      await page.waitForTimeout(300);
      await L.shot(page, N('11-pause'));
      m.pause = await page.evaluate(() => [...document.querySelectorAll('#scrPause button')].map(e => { const b = e.getBoundingClientRect(); return [e.id, Math.round(b.width), Math.round(b.height), e.scrollWidth > e.clientWidth + 1]; }));
      await page.evaluate(() => document.getElementById('btnResume').click());
      // talk time + done: let the bot run the rest
      await page.evaluate(() => { TT.debug.setBot(true, 0.9); TT.debug.setSpeed(8); });
      await L.until(page, () => TT.debug.mode === 'talk', null, 120000);
      await page.evaluate(() => { TT.debug.setBot(false); TT.debug.setSpeed(1); });
      await page.waitForTimeout(1500);
      await L.shot(page, N('12-talk'));
      m.talk = await page.evaluate(() => { const p = document.querySelector('.talk-panel').getBoundingClientRect();
        return { panel: [Math.round(p.x), Math.round(p.y), Math.round(p.width), Math.round(p.height)], fits: p.bottom <= innerHeight && p.top >= 0,
          q: document.getElementById('talkQ').textContent, choices: [...document.querySelectorAll('#talkChoices button')].map(e => { const b = e.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }) }; });
      await page.evaluate(() => { TT.debug.setBot(true, 0.9); TT.debug.setSpeed(8); });
      // chapter 2 banner
      await L.until(page, () => TT.debug.world.state === 'intro' && TT.debug.world.level >= 1, null, 120000);
      await page.evaluate(() => TT.debug.setSpeed(1)); await page.waitForTimeout(400);
      await L.shot(page, N('13-banner2'));
      await page.evaluate(() => TT.debug.setSpeed(8));
      await page.evaluate(() => { TT.debug.world.startLevel(3); });
      await L.until(page, () => TT.debug.mode === 'done', null, 240000);
      await page.evaluate(() => TT.debug.setSpeed(1)); await page.waitForTimeout(1800);
      await L.shot(page, N('14-done'));
      m.done = await page.evaluate(() => [...document.querySelectorAll('#scrDone button, #doneTitle')].map(e => { const b = e.getBoundingClientRect(); return [e.id, Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height), e.textContent.trim()]; }));
      m.errors = page.errors;
      meas.push(m);
      console.log(vp, lang, 'ok', page.errors.length ? page.errors.slice(0, 2) : '');
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(L.OUT, `screens-${tag}measure.json`), JSON.stringify(meas, null, 1));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
