// Natural-flow shots (bot plays at speed, no hand-stepping): boost bubble text, Talk time, chapter stars banner, moon party.
//   node tests/visual/fc_natural.js
const path = require('path');
const V = require('./fc_lib');
(async () => {
  await V.start();
  const dir = V.mk(path.join(V.OUT, 'natural'));
  for (const dev of ['iphoneP', 'iphoneL']) {
    const { ctx, page } = await V.open(dev, 'age=4&lang=en');
    await page.evaluate(() => { const D = FC.debug; D.startGame(); D.setBot(true, 1); D.setSpeed(6); });
    const want = [['boost', s => s.state === 'roundDone' && s.phase === 'boost'], ['talk', s => s.state === 'talk'], ['levelDone', s => s.state === 'levelDone'],
      ['L3ask', s => s.level === 3 && s.state === 'round' && s.phase === 'ask'], ['done', s => s.mode === 'done']];
    for (const [nm, f] of want) {
      const t0 = Date.now();
      while (Date.now() - t0 < 240000) { const s = await page.evaluate(() => FC.debug.getState()); if (f(s)) break; await V.sleep(60); }
      if (nm === 'L3ask') { await page.evaluate(() => FC.debug.setSpeed(6)); }
      await page.evaluate(() => FC.debug.setSpeed(0.1)); await V.sleep(nm === 'done' ? 1500 : 250);
      await V.shot(page, path.join(dir, `${dev}-${nm}.png`));
      console.log(dev, nm, await page.evaluate(() => ({ s: FC.debug.getState().state, bubble: document.getElementById('bubbleText').textContent, hidden: document.getElementById('bubble').className })));
      if (nm === 'levelDone') await page.evaluate(() => { FC.debug.gotoLevel(3); });
      await page.evaluate(() => FC.debug.setSpeed(6));
    }
    await ctx.close();
  }
  await V.stop();
})();
