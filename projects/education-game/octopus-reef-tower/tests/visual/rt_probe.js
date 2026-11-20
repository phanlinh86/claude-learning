// Extra visual probes for Pip's Reef Tower: the puffer's facing vs its swim direction (in / sit / tapped / away), the
// starfish crown on the jellyfish bell at full device resolution (crops), and the notch-free vs notched HUD.
//   VQA_OUT=/scratch node tests/visual/rt_probe.js      → $VQA_OUT/probe/*.png + probe.jsonl
const path = require('path'), fs = require('fs');
const V = require('./rt_lib');
const { OUT, mk, sleep, jl, open, shot, settle } = V;

(async () => {
  await V.start();
  const dir = mk(path.join(OUT, 'probe')), J = path.join(dir, 'probe.jsonl');
  try { fs.unlinkSync(J); } catch (e) {}
  try {
    for (const dev of ['iphoneP', 'ipadL']) {
      const { ctx, page } = await open(dev, 'age=4&lang=en', { seed: 9 });
      // puffer: step through its states, record position delta (swim direction) and the flip used by render
      await page.evaluate(() => { const D = RT.debug, w = D.world; D.toAsk(2, 'colors', 2, 1); w._beeDone = false; w.puffer = null; w._beeAt = w.time + 0.01; D.until(() => !!w.puffer, 3); });
      for (const [lab, cond, extra] of [['in', "B.state==='in' && B.t > 0.6", 0], ['sit', "B.state==='sit'", 0.3], ['away', "B.state==='away' && B.t > 0.3", 0]]) {
        const r = await page.evaluate(([cond, extra]) => { const D = RT.debug, w = D.world; const f = new Function('B', 'return ' + cond);
          D.until(() => w.puffer && f(w.puffer), 12); D.adv(extra); const B = w.puffer; if (!B) return null;
          const x0 = B.x, y0 = B.y; D.adv(1 / 30); const P2 = w.puffer || B; return { state: P2.state, x: P2.x, y: P2.y, dx: P2.x - x0, dy: P2.y - y0, flip: P2.flip, rot: P2.rot }; }, [cond, extra]);
        await settle(page); await shot(page, path.join(dir, `${dev}-puffer-${lab}.png`)); jl(J, { dev, puffer: lab, r });
      }
      // tapped: puff + loop
      const rt = await page.evaluate(() => { const D = RT.debug, w = D.world; D.toAsk(2, 'colors', 2, 1); w._beeDone = false; w.puffer = null; w._beeAt = w.time + 0.01;
        D.until(() => w.puffer && w.puffer.state === 'sit', 8); const B = w.puffer; if (!B) return null; w.pointerDown(B.x, B.y); w.pointerUp(B.x, B.y); D.adv(0.35); return { state: w.puffer && w.puffer.state, puff: w.puffer && w.puffer.puff }; });
      await settle(page, true); await shot(page, path.join(dir, `${dev}-puffer-tapped.png`)); jl(J, { dev, puffer: 'tapped', r: rt });
      // crown on jellyfish: geometry
      const cj = await page.evaluate(() => { const D = RT.debug, w = D.world; D.toAsk(0, 'colors', 0, 0); return { cloud: w.cloudPose(1), crown: w.crownPose(1), goal: w.layout.goal, s: D.view().s }; });
      await settle(page); await shot(page, path.join(dir, `${dev}-jelly.png`)); jl(J, { dev, jelly: cj });
      await ctx.close();
    }
    // no-notch variants (plain browser) for the HUD + bubble
    for (const dev of ['iphoneP', 'iphoneL']) {
      const { ctx, page } = await open(dev, 'age=4&lang=vi', { notch: false });
      await page.evaluate(() => RT.debug.toAsk(0, 'colors', 3, 1)); await settle(page);
      await shot(page, path.join(dir, `${dev}-nonotch-vi.png`)); await ctx.close();
    }
  } catch (e) { console.log('FAILED', e); }
  await V.stop(); console.log('done');
})();
