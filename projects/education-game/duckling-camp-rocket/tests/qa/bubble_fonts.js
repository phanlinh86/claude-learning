// Speech-bubble font probe: the fitted font size (CSS px) of every prompt wording per device × language.
//   node tests/qa/bubble_fonts.js  → tests/out/qa_visual/bubble_fonts.json + a summary on stdout
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const DEVICES = [
  { name: 'iphone-portrait', viewport: { width: 393, height: 852 }, dpr: 3, n: { t: 59, r: 0, b: 34, l: 0 } },
  { name: 'iphone-landscape', viewport: { width: 852, height: 393 }, dpr: 3, n: { t: 0, r: 59, b: 21, l: 59 } },
  { name: 'ipad-portrait', viewport: { width: 820, height: 1180 }, dpr: 2, n: { t: 24, r: 0, b: 20, l: 0 } },
  { name: 'ipad-landscape', viewport: { width: 1180, height: 820 }, dpr: 2, n: { t: 24, r: 0, b: 20, l: 0 } }
];
(async () => {
  const srv = await serve(); const browser = await chromium.launch(); const all = {};
  for (const d of DEVICES) for (const lang of ['en', 'vi']) {
    const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
    await ctx.addInitScript(n => { document.addEventListener('DOMContentLoaded', () => { const st = document.createElement('style');
      st.textContent = `:root { --sa-t: ${n.t}px !important; --sa-r: ${n.r}px !important; --sa-b: ${n.b}px !important; --sa-l: ${n.l}px !important; }`; document.head.appendChild(st); }); }, d.n);
    const page = await ctx.newPage();
    await page.goto(`${srv.url}?mute=1&seed=3&age=4&lang=${lang}`);
    await page.waitForFunction(() => window.DK && DK.debug && DK.debug.mode === 'title');
    await page.evaluate(() => DK.debug.startGame());
    await page.waitForFunction(() => DK.debug.world.state === 'round', null, { timeout: 30000 });
    const res = await page.evaluate(async lang => {
      const out = []; const TOP = ['colors', 'shapes', 'size', 'animals', 'count', 'letters', 'lower', 'initial', 'add', 'sub', 'oddeven'];
      const seen = new Set();
      for (const age of [3, 4, 5, 6, 7]) for (const t of TOP) for (let s = 1; s <= 8; s++) for (const ri of [0, 1, 2]) {
        let r; try { r = DK.Content.makeRound(t, { age, lang, rng: new DK.RNG(s * 97 + age), roundIndex: ri, level: 0 }); } catch (e) { continue; }
        for (const first of [true, false]) {
          let txt; try { txt = DK.I18N.ask(lang, r.promptKey, r.params, { first, modeFirst: first }); } catch (e) { continue; }
          if (!txt || seen.has(txt)) continue; seen.add(txt);
          DK.UI.say(txt); await new Promise(res => requestAnimationFrame(res));
          const t2 = document.getElementById('bubbleText'), b = document.getElementById('bubble');
          out.push({ topic: t, age, first, len: txt.length, fs: parseFloat(t2.style.fontSize), h: b.offsetHeight, txt });
        }
      }
      return out;
    }, lang);
    all[`${d.name}-${lang}`] = res;
    const fsz = res.map(r => r.fs).sort((a, b) => a - b);
    const small = res.filter(r => r.fs < 16).length;
    console.log(`${d.name}-${lang}: n ${res.length}, font min ${fsz[0].toFixed(1)} p10 ${fsz[Math.floor(fsz.length * 0.1)].toFixed(1)} median ${fsz[Math.floor(fsz.length / 2)].toFixed(1)} max ${fsz[fsz.length - 1].toFixed(1)}; < 16 px: ${small}; worst: "${res.sort((a, b) => a.fs - b.fs)[0].txt}"`);
    await ctx.close();
  }
  fs.writeFileSync(path.join(__dirname, '..', 'out', 'qa_visual', 'bubble_fonts.json'), JSON.stringify(all, null, 1));
  await browser.close(); srv.close();
})();
