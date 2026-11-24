// Visual QA capture for Lolo's Jungle Leaf Match (report-only: never changes game code).
//   node tests/visual/capture.js [section ...]   sections: screens moods critters talk notch   (default: all)
// Output: tests/out/visual/<section>/*.png + geometry.jsonl (CSS-px rects of leaves / bubble / HUD / Lolo + overlap checks).
// The world is frozen by swapping world.update for a no-op (the renderer and main's event handling keep running);
// D.adv(s) steps it by hand, D.sync() copies every _p partner so interpolation never smears a hand-set state.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'qa_visual', 'extra');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 }
};
// emulated safe areas (CSS px): iPhone 15/16 portrait / landscape, iPad Pro 11"
const NOTCH = { P: [47, 0, 34, 0], L: [0, 47, 21, 47], PAD: [24, 0, 20, 0] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jl = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');
const want = process.argv.slice(2);
const on = s => !want.length || want.includes(s);
let srv, browser;

async function open(dev, q, opts = {}) {
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  pageerror', dev, String(e)));
  page.on('console', m => { if (m.type() === 'error') console.log('  console.error', dev, m.text()); });
  if (opts.notch) {
    // main.js readInsets() reads the computed padding of #safeProbe = var(--sa-*). Override the vars on :root before boot
    // (this DOMContentLoaded listener is registered before main.js's, so it runs first).
    const [t, r, b, l] = NOTCH[opts.notch];
    await page.addInitScript(([t, r, b, l]) => {
      document.addEventListener('DOMContentLoaded', () => {
        const s = document.createElement('style');
        s.textContent = `:root{--sa-t:${t}px !important;--sa-r:${r}px !important;--sa-b:${b}px !important;--sa-l:${l}px !important}`;
        document.head.appendChild(s);
      });
    }, [t, r, b, l]);
  }
  await page.goto(srv.url + '?mute=1&novoice=1&seed=' + (opts.seed || 5) + '&' + q);
  await page.waitForFunction(() => window.LL && LL.debug && LL.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(500);
  if (opts.notch) await page.evaluate(([n, ins]) => {   // paint the unsafe zones (+ island / home indicator) so they show
    const add = st => { const e = document.createElement('div'); e.className = 'qa-notch'; e.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(e); };
    const [t, r, b, l] = ins, red = 'background:rgba(255,0,0,.16)';
    if (t) add(`left:0;right:0;top:0;height:${t}px;${red}`);
    if (b) add(`left:0;right:0;bottom:0;height:${b}px;${red}`);
    if (l) add(`left:0;top:0;bottom:0;width:${l}px;${red}`);
    if (r) add(`right:0;top:0;bottom:0;width:${r}px;${red}`);
    if (n === 'P') add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
    if (n === 'L') add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
    if (n !== 'PAD') add(`left:50%;bottom:8px;width:${n === 'L' ? 200 : 140}px;height:5px;margin-left:-${n === 'L' ? 100 : 70}px;border-radius:3px;background:#000`);
  }, [opts.notch, NOTCH[opts.notch]]);
  await page.evaluate(() => {
    const D = LL.debug;
    D.freeze = () => { const w = D.world; if (!w._upd) { w._upd = w.update; w.update = function () {}; } };
    D.adv = s => { const w = D.world, u = w._upd || w.update; for (let t = 0; t < s - 1e-9; t += 0.05) u.call(w, Math.min(0.05, s - t)); };
    D.sync = () => { const w = D.world; w.alpha = 1; w._pscroll = w.scroll; w._pscrollT = w.scrollT;
      for (const c of w.cards) { c._px = c.x; c._py = c.y; c._prot = c.rot; c._popen = c.open; c._pflip = c.flip; c._pbloom = c.bloom; c._pbounce = c.bounce; }
      const G = w.lolo; if (G) { G._phx = G.headX; G._phy = G.headY; G._phop = G.hop; }
      const k = w.critter; if (k) { k._px = k.x; k._py = k.y; k._prot = k.rot; }
      for (const t of w.traffic || []) { t._px = t.x; t._py = t.y; } };
    D.until = (f, max = 20) => { for (let t = 0; t < max; t += 0.05) { if (f()) return true; D.adv(0.05); } return false; };
    D.toRound = (level, topic, ri) => {   // frozen game at chapter `level`, topic, round index; stops at the start of the scroll
      const w = D.world; D.startGame(); D.freeze();
      if (topic) w.levels[level] = topic;
      w.startLevel(level); D.weather.setWeather(level, { instant: true });
      D.until(() => w.state === 'round');
      if (ri > 0) { w.round = ri; w._beginRound(); }
    };
    D.peekUp = () => { const w = D.world; D.until(() => w.phase === 'peek'); D.until(() => w.cards.every(c => c.open >= 0.97 && Math.abs(c.open - 1) < 0.03), 6); D.adv(0.1); D.sync(); };
    D.toPlay = () => { const w = D.world; D.until(() => w.phase === 'play', 30); D.until(() => w.cards.every(c => c.open < 0.01), 3); D.adv(0.3); D.sync(); };
    D.tap = c => D.world.pointerDown(c.x, c.y);
    D.pair = () => { const w = D.world, free = w.cards.filter(c => c.state === 'down'); const a = free[0]; return [a, free.find(c => c !== a && c.key === a.key)]; };
    D.matchOne = () => { const w = D.world, [a, b] = D.pair(); D.tap(a); D.adv(0.4); D.tap(b); D.until(() => a.bloom > 0.9 && b.bloom > 0.9, 4); D.adv(0.3); return [a, b]; };
    D.solve = () => { const w = D.world; for (let g = 0; g < 60 && !w.solved; g++) { D.until(() => w.phase === 'play', 5); if (w.solved) break; const [a, b] = D.pair(); if (!a) break; D.tap(a); D.adv(0.35); D.tap(b); D.adv(0.6); } };
  });
  return { ctx, page };
}
const shot = (page, f) => page.screenshot({ path: f });
DEV.tall = { viewport: { width: 430, height: 932 }, dpr: 3 };
const AGES = { 3: ['colors', 'shapes', 'size', 'animals', 'food'], 4: ['colors', 'shapes', 'count', 'food', 'animals', 'size'], 5: ['shapes', 'count', 'letters', 'food', 'colors'], 6: ['lower', 'initial', 'add', 'count', 'letters'], 7: ['initial', 'add', 'sub', 'oddeven', 'lower'] };
const allOpen = () => { const D = LL.debug, w = D.world; for (const c of w.cards) { c.open = 1; c.flip = 1; } D.sync(); };
async function topics() {
  const dir = mk(path.join(OUT, 'topics'));
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL']) for (const age of [3, 4, 5, 6, 7]) {
    const lang = (age + dev.length) % 2 ? 'vi' : 'en';
    const { ctx, page } = await open(dev, `age=${age}&lang=${lang}`, { seed: 11 + age });
    for (const t of AGES[age]) {
      const r = await page.evaluate(t => { try { const D = LL.debug, w = D.world; D.toRound(1, t, 3); D.peekUp(); D.toPlay(); for (const c of w.cards) { c.open = 1; c.flip = 1; } D.sync(); return w.cards.length; } catch (e) { return String(e); } }, t);
      await sleep(250); await shot(page, path.join(dir, `${dev}-a${age}-${lang}-${t}.png`));
      if (typeof r === 'string') console.log('ERR', dev, age, t, r);
    }
    await ctx.close(); console.log('topics', dev, age);
  }
}
async function flips() {
  const dir = mk(path.join(OUT, 'flip'));
  for (const dev of ['iphoneP', 'ipadL']) for (const m of [0, 3]) {
    const { ctx, page } = await open(dev, 'age=4&lang=en', { seed: 9 });
    await page.evaluate(m => { const D = LL.debug; D.toRound(m, 'colors', 2); D.toPlay(); }, m);
    for (const o of [0.3, 0.5, 0.7]) {
      await page.evaluate(o => { const D = LL.debug, w = D.world; w.cards.forEach((c, i) => { c.open = o; c.flip = o; c.swing = i % 2 ? 0.15 : -0.1; }); D.sync(); }, o);
      await sleep(200); await shot(page, path.join(dir, `${dev}-m${m}-open${o}.png`));
    }
    // hint glow
    await page.evaluate(() => { const D = LL.debug, w = D.world; w.cards.forEach(c => { c.open = 0; c.flip = 0; c.swing = 0; }); w._lastHintT = -99; w.hint(); D.adv(0.3); D.sync(); });
    await sleep(200); await shot(page, path.join(dir, `${dev}-m${m}-hint.png`));
    // match: orchid + butterflies
    await page.evaluate(() => { const D = LL.debug, w = D.world; D.adv(6); const [a, b] = D.pair(); D.tap(a); D.adv(0.4); D.tap(b); D.adv(0.6); D.sync(); });
    await sleep(200); await shot(page, path.join(dir, `${dev}-m${m}-match-early.png`));
    await page.evaluate(() => { const D = LL.debug; D.adv(0.8); D.sync(); });
    await sleep(200); await shot(page, path.join(dir, `${dev}-m${m}-match-late.png`));
    await ctx.close(); console.log('flips', dev, m);
  }
}
async function swing() {
  const dir = mk(path.join(OUT, 'swing'));
  for (const dev of ['iphoneP', 'iphoneL', 'ipadP', 'ipadL', 'tall']) {
    const { ctx, page } = await open(dev, 'age=4&lang=vi', { seed: 4 });
    await page.evaluate(() => { const D = LL.debug, w = D.world; D.toRound(1, 'colors', 2); D.toPlay(); D.solve(); D.until(() => w.phase === 'cheer', 6); D.adv(0.3); D.sync(); });
    await sleep(200); await shot(page, path.join(dir, `${dev}-cheer0.png`));
    await page.evaluate(() => { const D = LL.debug; D.adv(0.4); D.sync(); });
    await sleep(200); await shot(page, path.join(dir, `${dev}-cheer1-backflip.png`));
    await page.evaluate(() => { const D = LL.debug, w = D.world; D.until(() => w.phase === 'scroll', 8); D.sync(); });
    for (const k of [0.1, 0.3, 0.5, 0.7, 0.9]) {
      await page.evaluate(k => { const D = LL.debug, w = D.world; D.until(() => w.scrollT >= k || w.phase !== 'scroll', 6); D.sync(); }, k);
      await sleep(150); await shot(page, path.join(dir, `${dev}-scroll${k}.png`));
    }
    await ctx.close(); console.log('swing', dev);
  }
}
async function tall() {
  const dir = mk(path.join(OUT, 'tall'));
  for (const lang of ['en', 'vi']) {
    const { ctx, page } = await open('tall', `age=4&lang=${lang}`, { seed: 5 });
    await shot(page, path.join(dir, `${lang}-title.png`));
    for (const m of [0, 1, 2, 3]) {
      await page.evaluate(m => { const D = LL.debug; D.toRound(m, ['colors','shapes','count','food'][m], 2); D.toPlay(); }, m);
      await sleep(250); await shot(page, path.join(dir, `${lang}-m${m}-closed.png`));
    }
    await page.evaluate(() => { const D = LL.debug, w = D.world; w._startTalk(); });
    await sleep(600); await shot(page, path.join(dir, `${lang}-talk.png`));
    await ctx.close();
  }
  console.log('tall done');
}
(async () => {
  srv = await serve(); browser = await chromium.launch();
  try {
    if (on('topics')) await topics();
    if (on('flips')) await flips();
    if (on('swing')) await swing();
    if (on('tall')) await tall();
  } finally { await browser.close(); srv.close(); }
})().catch(e => { console.error(e); process.exit(1); });
