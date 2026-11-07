// Full visual QA sweep (Nini's Sea Painting): every screen x EN/VI on 6 device shapes with emulated notch insets.
//   node tests/visual/qa_full.js               -> docs/reports/visual/*.png + geometry.json
//   DEV=ip-p,pad-l  LANGS=en  FULL=1 (all screens on every device; default: core set on se / pro)
// Report-only: drives the page through SP.debug, never edits game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', '..', 'docs', 'reports', 'visual'); fs.mkdirSync(OUT, { recursive: true });
// insets in CSS px (iPhone 15 / Dynamic Island; iPad home indicator; SE none)
const DEVS = {
  'ip-p': { vp: [393, 852], ins: [59, 0, 34, 0] }, 'ip-l': { vp: [852, 393], ins: [0, 59, 21, 59] },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0] }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0] },
  'se-p': { vp: [375, 667], ins: [20, 0, 0, 0] }, 'pro-l': { vp: [1366, 1024], ins: [24, 0, 20, 0] }
};
const CORE = new Set(['ip-p', 'ip-l', 'pad-p', 'pad-l']);
const until = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
const geo = {};

async function run(browser, srv, dev, lang) {
  const d = DEVS[dev], full = CORE.has(dev) || process.env.FULL === '1', key = dev + '-' + lang;
  const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', e => errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(srv.url + `?mute=1&novoice=1&seed=5&age=4&lang=${lang}`);
  await until(page, () => window.SP && SP.debug && SP.debug.mode === 'title');
  await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await page.waitForTimeout(400);
  const G = geo[key] = {};
  const shot = async (n, close) => {
    await page.screenshot({ path: path.join(OUT, `${key}-${n}.png`) });
    G[n] = await page.evaluate(() => {
      const r = id => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return b.width ? { x: +b.x.toFixed(1), y: +b.y.toFixed(1), w: +b.width.toFixed(1), h: +b.height.toFixed(1) } : null; };
      const w = SP.debug.world, v = SP.debug.view(), L = w.layout, sc = b => b && { x: +(v.left + b.x * v.s).toFixed(1), y: +(v.top + b.y * v.s).toFixed(1), w: +((b.w || 0) * v.s).toFixed(1), h: +((b.h || 0) * v.s).toFixed(1) };
      const bt = document.getElementById('bubbleText');
      return { mode: SP.debug.mode, state: w.state, phase: w.phase, topic: w.topic, age: w.age, tpl: w.cur && w.cur.templateId, alive: w.picture && w.picture.alive,
        ins: v.ins, s: v.s, W: v.W, H: v.H, bubble: r('bubble'), bubbleText: bt && bt.textContent, bubbleOverflow: bt ? bt.scrollHeight - bt.clientHeight : 0,
        hud: r('hud'), canvas: L && sc({ x: L.canvas.x - L.frame, y: L.canvas.y - L.frame, w: L.canvas.w + 2 * L.frame, h: L.canvas.h + 2 * L.frame }),
        nini: L && sc({ x: L.nini.x - L.nini.w / 2, y: L.nini.y - L.nini.h, w: L.nini.w, h: L.nini.h }), niniUp: L && !!L.nini.up,
        shells: L && L.palette.slots.map(q => ({ x: +(v.left + q.x * v.s).toFixed(1), y: +(v.top + q.y * v.s).toFixed(1), r: +((q.r || w.cfg.shellR) * v.s).toFixed(1) })),
        clam: L && L.clam && sc({ x: L.clam.x - L.clam.w / 2, y: L.clam.y - L.clam.h, w: L.clam.w, h: L.clam.h }),
        talkBox: r('scrTalk') && (() => { const p = document.querySelector('#scrTalk .panel, #scrTalk > div'); return p ? (b => ({ x: b.x, y: b.y, w: b.width, h: b.height }))(p.getBoundingClientRect()) : null; })(),
        overflowText: [...document.querySelectorAll('.screen:not(.hidden) *, #bubble, #hud *')].filter(e => e.offsetParent !== null && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1) && e.children.length === 0 && e.textContent.trim()).map(e => (e.id || e.className) + ':' + e.textContent.trim().slice(0, 30))
      };
    });
  };
  const ev = (fn, a) => page.evaluate(fn, a);
  const toPaint = async () => { await ev(() => SP.debug.setSpeed(6)); await until(page, () => SP.debug.world.interactive); await ev(() => SP.debug.setSpeed(1)); await page.waitForTimeout(450); };
  const level = async (topic, age, li) => {   // a chapter of a topic, waiting for the first paint step
    await ev(([t, a, i]) => { SP.debug.setBot(false); const w = SP.debug.world; w.cfg.surpriseTypes = []; if (a) w.age = a; w.levels[i] = t; w.startLevel(i); }, [topic, age, li]);
    await toPaint();
  };

  await page.waitForTimeout(500); await shot('01-title');
  // settings: hold the parents' gear 2 s
  const g = await page.$('#btnParents'); const gb = await g.boundingBox();
  await page.mouse.move(gb.x + gb.width / 2, gb.y + gb.height / 2); await page.mouse.down(); await page.waitForTimeout(2300); await page.mouse.up();
  await page.waitForTimeout(400); await shot('02-settings');
  await page.click('#btnSettingsDone').catch(() => {}); await page.waitForTimeout(300);

  await ev(() => { SP.debug.startGame(); const w = SP.debug.world; w.cfg.surpriseTypes = []; w.levels[0] = 'colors'; w.startLevel(0); });
  await page.waitForTimeout(700); await shot('03-banner');
  await toPaint(); await shot('04-colors');
  await ev(() => { const w = SP.debug.world, a = w.answer(); const h = w.shellHit(a.shell); w.tap(h.x, h.y); });
  await page.waitForTimeout(140); await shot('05-brush-fly');
  await page.waitForTimeout(800);
  await ev(() => { const w = SP.debug.world, a = w.answer(); if (a && a.part) { const p = w.partTap(a.part); w.tap(p.x, p.y); } });
  await page.waitForTimeout(320); await shot('06-fill');
  if (full || lang === 'en') {
    await page.waitForTimeout(900);
    await ev(() => SP.debug.world.hint()); await page.waitForTimeout(700); await shot('07-hint');
  }
  // pause
  await page.click('#btnPause'); await page.waitForTimeout(400); await shot('08-pause');
  await page.click('#btnResume'); await page.waitForTimeout(300);
  // finish sweep + alive with the bot
  await ev(() => { SP.debug.setBot(true, 1); SP.debug.setSpeed(3); });
  await until(page, () => SP.debug.world.phase === 'finish'); await ev(() => SP.debug.setSpeed(0.3)); await page.waitForTimeout(250); await shot('09-finish');
  await ev(() => SP.debug.setSpeed(3));
  await until(page, () => SP.debug.world.phase === 'alive' && SP.debug.world.phaseTime > 0.6); await ev(() => SP.debug.setSpeed(0.1)); await page.waitForTimeout(150); await shot('10-alive');
  await ev(() => SP.debug.setBot(false));

  // step types
  const steps = full ? [['shapes', 4], ['count', 4], ['animals', 4], ['size', 3], ['letters', 5], ['add', 6], ['oddeven', 7], ['initial', 7], ['sub', 7], ['lower', 6]] : [['count', 4], ['letters', 5], ['add', 6]];
  for (const [t, a] of steps) { await level(t, a, 1); await shot('11-step-' + t); }
  await ev(() => { SP.debug.world.age = 4; });

  // seasons (canvas only: EN, plus VI on one device)
  if (lang === 'en' || dev === 'ip-p') for (let i = 0; i < 4; i++) { await level('colors', 4, i); await page.waitForTimeout(1600); await shot('12-season-' + ['spring', 'summer', 'autumn', 'winter'][i]); }

  // alive kinds (EN only, core devices)
  if (lang === 'en' && full) for (const kind of ['swim', 'scuttle', 'sail', 'float', 'bob']) {
    let ok = false;
    for (let k = 0; k < 30 && !ok; k++) {
      const topic = kind === 'sail' && k % 2 ? 'shapes' : 'colors';
      await ev(t => { SP.debug.setBot(false); const w = SP.debug.world; w.cfg.surpriseTypes = []; w.levels[0] = t; w.startLevel(0); SP.debug.setSpeed(8); }, topic);
      await until(page, () => SP.debug.world.state === 'round' && SP.debug.world.picture);
      ok = await ev(kd => SP.debug.world.picture.alive === kd, kind);
    }
    if (!ok) { console.log('no template for', kind); continue; }
    await ev(() => { SP.debug.setBot(true, 1); SP.debug.setSpeed(4); });
    await until(page, () => SP.debug.world.phase === 'alive' && SP.debug.world.phaseTime > 0.45);
    await ev(() => SP.debug.setSpeed(0.1)); await page.waitForTimeout(120); await shot('13-alive-' + kind);
    await ev(() => SP.debug.setSpeed(1)); await page.waitForTimeout(350);    // +0.35 s later in the motion
    await ev(() => SP.debug.setSpeed(0.1)); await shot('13-alive-' + kind + '-b');
    await ev(() => SP.debug.setBot(false));
  }

  // fishy + pearl
  for (const sp of ['pearl', 'fishy']) {
    await ev(sp => { SP.debug.setBot(false); const w = SP.debug.world; w.cfg.surpriseTypes = [sp]; w.levels[1] = 'animals'; w.startLevel(1); w._surpriseRound = 1; w.round = 1; SP.debug.setSpeed(6); }, sp);
    await until(page, () => SP.debug.world.state === 'round' && SP.debug.world.interactive);
    if (sp === 'fishy') await until(page, () => !!SP.debug.world.fishy && SP.debug.world.fishy.x > 300 && SP.debug.world.fishy.x < SP.debug.world.layout.W - 300, null, 20000).catch(() => {});
    await ev(() => { SP.debug.setSpeed(1); const c = SP.debug.world.clamHit && SP.debug.world.clamHit(); if (c) SP.debug.world.pointerDown(c.x, c.y); });
    await page.waitForTimeout(sp === 'fishy' ? 200 : 600); await shot('14-' + sp);
  }
  await ev(() => { SP.debug.world.cfg.surpriseTypes = []; });

  // Talk time per topic
  const talks = full ? [['colors', 4], ['shapes', 4], ['size', 3], ['animals', 4], ['count', 4], ['letters', 5], ['lower', 6], ['initial', 6], ['add', 6], ['sub', 7], ['oddeven', 7]] : [['colors', 4], ['initial', 6], ['oddeven', 7]];
  for (const [t, a] of talks) {
    await ev(([t, a]) => { SP.debug.setBot(false); const w = SP.debug.world; w.age = a; w.levels[2] = t; w.startLevel(2); SP.debug.setSpeed(6); }, [t, a]);
    await until(page, () => SP.debug.world.state === 'round');
    await ev(() => { SP.debug.world._startTalk(); SP.debug.setSpeed(1); });
    await page.waitForTimeout(700); await shot('15-talk-' + t);
  }
  await ev(() => { SP.debug.world.age = 4; });

  // session done (gallery)
  await ev(() => { SP.debug.goTitle(); SP.debug.setBot(true, 0.85); SP.debug.setSpeed(40); SP.debug.startGame(); });
  await until(page, () => SP.debug.mode === 'done', null, 300000);
  await ev(() => SP.debug.setSpeed(1)); await page.waitForTimeout(1600); await shot('16-done');
  await ctx.close();
  return errs;
}

(async () => {
  const srv = await serve(), browser = await chromium.launch();
  const devs = (process.env.DEV || Object.keys(DEVS).join(',')).split(','), langs = (process.env.LANGS || 'en,vi').split(',');
  const all = [];
  for (const dev of devs) for (const lang of langs) {
    const t0 = Date.now();
    try { const e = await run(browser, srv, dev, lang); all.push(...e.map(x => dev + '-' + lang + ' ' + x)); }
    catch (e) { all.push(dev + '-' + lang + ' FAIL ' + e.message.split('\n')[0]); }
    console.log(dev, lang, ((Date.now() - t0) / 1000).toFixed(0) + 's');
  }
  const gf = path.join(OUT, 'geometry-' + devs.join('_') + '.json');
  fs.writeFileSync(gf, JSON.stringify(geo, null, 1));
  await browser.close(); srv.close();
  console.log(all.length ? 'ERRORS\n' + all.join('\n') : 'no console errors');
})();
