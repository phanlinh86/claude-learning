// Text-fit checks for Dee's Forest Memory (EN + VI) on every device:   node tests/visual/measure.js
// - the speech bubble with every prompt (p.*), the longest feedback lines, idle/hint lines: font size after _fitBubble,
//   overflow, real bottom vs the top of the tallest grid of that age (logical px; < 0 = covers cards)
// - the chapter banner: topic names are squeezed by fitText to bw − 60 → effective font px (62 nominal)
// - the Talk panel for every topic: overflow, rows of choices, clipped labels
const V = require('./lib');
const DEVS = ['iphoneP', 'iphoneL', 'ipadP', 'ipadL', 'seL'];
const TOPICS = ['colors', 'size', 'shapes', 'count', 'animals', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
(async () => {
  await V.start();
  for (const dev of DEVS) for (const lang of ['en', 'vi']) {
    const { ctx, page } = await V.open(dev, `age=7&lang=${lang}`);
    await page.evaluate(() => { const D = FC.debug; D.toRound(0, 'oddeven', 3); D.peekUp(); });
    await V.sleep(200);
    const r = await page.evaluate(([lang, TOPICS]) => {
      const D = FC.debug, v = D.view(), w = D.world, I = FC.I18N, b = document.getElementById('bubble'), t = document.getElementById('bubbleText');
      const lines = TOPICS.map(k => ['p.' + k, I.t(lang, 'p.' + k, { n: 5 })]);
      for (const k of ['hint', 'idle', 'peek', 'hide', 'great', 'praise']) { const s = I.t(lang, k); if (s && s !== k) lines.push([k, s]); }
      if (I.sayMismatch) lines.push(['mismatch', I.sayMismatch(lang, { topic: 'initial', nameKindA: 'animal', nameValueA: 'hedgehog', nameKindB: 'animal', nameValueB: 'squirrel', faceA: {}, faceB: {} })]);
      const gridTop = w.layout.grid.rect.y;
      const out = lines.map(([k, s]) => { FC.UI.say(s); const q = b.getBoundingClientRect();
        return { k, len: s.length, font: +parseFloat(t.style.fontSize).toFixed(1), overflow: b.scrollHeight - b.clientHeight, clear: +(gridTop - (q.bottom - v.top) / v.s).toFixed(1) }; });
      // banner squeeze
      const c = document.createElement('canvas').getContext('2d'), FONT = getComputedStyle(document.body).fontFamily, bw = Math.min(620, v.W - 80) - 60;
      const banner = TOPICS.map(k => { const s = I.t(lang, 'topic.' + k); c.font = `900 62px ${FONT}`; const wd = c.measureText(s).width; return { k, s, px: +(wd > bw ? 62 * bw / wd : 62).toFixed(1) }; });
      return { lines: out, banner, s: v.s };
    }, [lang, TOPICS]);
    const worst = r.lines.reduce((a, l) => (l.clear < a.clear ? l : a));
    const small = r.lines.reduce((a, l) => (l.font < a.font ? l : a));
    const bmin = r.banner.reduce((a, l) => (l.px < a.px ? l : a));
    console.log(`${dev.padEnd(8)} ${lang} bubble: min font ${small.font}px (${small.k}), max overflow ${Math.max(...r.lines.map(l => l.overflow))}, worst clearance to grid ${worst.clear} (${worst.k}) | banner min ${bmin.px}px logical = ${(bmin.px * r.s).toFixed(1)} css ("${bmin.s}")`);
    // Talk panel per topic
    const talk = [];
    for (const tp of TOPICS) {
      const t = await page.evaluate(tp => { const w = FC.debug.world; w.topic = tp; w._startTalk(); return true; }, tp);
      await V.sleep(250);
      talk.push(await page.evaluate(tp => { const p = document.querySelector('.talk-panel'), r = p.getBoundingClientRect(), ch = [...document.querySelectorAll('#talkChoices button')];
        const sh = document.getElementById('talkShow').getBoundingClientRect();
        return { tp, overflow: p.scrollHeight - p.clientHeight, off: Math.max(0, r.bottom - innerHeight, -r.top), rows: new Set(ch.map(b => Math.round(b.getBoundingClientRect().top))).size,
          clipped: ch.filter(b => b.scrollWidth > b.clientWidth + 1).length, show: Math.round(sh.width), minBtn: Math.min(...ch.map(b => Math.round(Math.min(b.getBoundingClientRect().width, b.getBoundingClientRect().height)))) }; }, tp));
      await page.evaluate(() => { const D = FC.debug, w = D.world; w.skipTalk(); D.toRound(0, 'oddeven', 3); });
    }
    console.log('   talk:', talk.map(t => `${t.tp}${t.overflow > 0 || t.off > 0 || t.clipped ? `!ov${t.overflow}/off${Math.round(t.off)}/clip${t.clipped}` : ''} r${t.rows} pic${t.show} btn${t.minBtn}`).join('  '));
    await ctx.close();
  }
  await V.stop();
})();
