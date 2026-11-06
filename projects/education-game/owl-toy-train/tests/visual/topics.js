// Visual QA: every topic at every age (3–7), loaded state, on iPhone portrait (EN, @2 + train crop) and landscape (VI).
// Also records, for every round, whether any cargo is still visible on the rug while the train departs.
const L = require('./lib');
const path = require('path'), fs = require('fs');
const sharp = require('sharp');
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'homes'], 4: ['colors', 'shapes', 'count', 'homes'], 5: ['shapes', 'count', 'letters', 'homes'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
(async () => {
  const { srv, browser } = await L.launch();
  const res = [];
  for (const [vp, lang, dpr] of [['ip-p', 'en', 2], ['ip-l', 'vi', 1]]) {
    for (const age of Object.keys(AGE_TOPICS)) for (const topic of AGE_TOPICS[age]) {
      if (process.env.ONLY && process.env.ONLY !== topic) continue;
      const { ctx, page } = await L.open(browser, vp, `seed=${11 + +age}&age=${age}&lang=${lang}`, { url: srv.url, dpr });
      await page.evaluate(() => { TT.debug.world.cfg.surpriseRound = 99; });
      await L.startTopic(page, { topic, lvl: 0, round: 2 });
      await L.toLoad(page);
      await page.waitForTimeout(1300);
      const name = `topic-${vp}-${lang}-a${age}-${topic}`;
      await L.shot(page, name);
      const info = await page.evaluate(() => {
        const D = TT.debug, w = D.world;
        const cars = w.cars.map(c => { const b = D.carScreen(c.id); return { label: c.label, need: c.need, x: b.x - b.w / 2, w: b.w, y0: b.y - b.h / 2, h: b.h, y1: c.y1 }; });
        return { cars, items: w.items.map(i => ({ kind: i.item.kind, text: i.item.text, color: i.item.color, sprite: i.item.sprite, shape: i.item.shape })), bubble: document.getElementById('bubbleText').textContent,
          s: D.view().s, carH: w.cars[0] ? (w.cars[0].y1 - w.cars[0].y0) : 0, carW: w.cars[0] ? w.cars[0].w : 0, carScale: w.layout.carScale };
      });
      if (vp === 'ip-p') {   // crop the train (incl. sign plates) at @2
        const top = Math.max(0, Math.min(...info.cars.map(c => c.y0)) - 30), bot = info.cars[0].y0 + info.cars[0].h + 70;
        await sharp(path.join(L.OUT, name + '.png')).extract({ left: 0, top: Math.round(top * dpr), width: 393 * dpr, height: Math.round((bot - top) * dpr) }).toFile(path.join(L.OUT, name + '-train.png'));
      }
      // play it out: did any cargo remain visible on the rug while the train left?
      await L.solve(page);
      await L.until(page, () => TT.debug.world.phase === 'whistle' || TT.debug.world.phase === 'depart', null, 30000);
      const wh = await page.evaluate(() => TT.debug.whistleScreen());
      const cdp = await ctx.newCDPSession(page);
      await L.touch(cdp, 'touchStart', wh.x, wh.y); await page.waitForTimeout(60); await L.touch(cdp, 'touchEnd');
      await page.waitForTimeout(500);
      const left = await page.evaluate(() => TT.debug.world.items.filter(i => i.state !== 'in' && i.state !== 'gone' && i.alpha > 0.05).map(i => i.state + ':' + i.item.kind));
      if (left.length) await L.shot(page, name + '-depart-leftover');
      res.push({ vp, lang, age, topic, ...info, departLeftover: left, errors: page.errors });
      console.log(vp, age, topic, info.cars.length, 'cars', info.items.length, 'items', left.length ? 'LEFTOVER ' + left : '', page.errors.slice(0, 1));
      await ctx.close();
    }
  }
  fs.writeFileSync(path.join(L.OUT, 'topics-measure.json'), JSON.stringify(res, null, 1));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
