// Shared helpers for the visual QA scripts (Momo's Toy Train). Report-only: never touches game/.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', '..', 'docs', 'reports', 'visual');
fs.mkdirSync(OUT, { recursive: true });
const VIEWPORTS = {
  'ip-p': { width: 393, height: 852 }, 'ip-l': { width: 852, height: 393 },
  'pad-p': { width: 820, height: 1180 }, 'pad-l': { width: 1180, height: 820 }
};
// iPhone 15-ish notch/home-indicator insets (CSS px) per orientation, injected through the --sa-* vars the safe probe reads
const NOTCH = { 'ip-p': { t: 59, r: 0, b: 34, l: 0 }, 'ip-l': { t: 0, r: 59, b: 21, l: 59 }, 'pad-p': { t: 24, r: 0, b: 20, l: 0 }, 'pad-l': { t: 24, r: 0, b: 20, l: 0 } };

async function open(browser, vp, q, opt = {}) {
  const ctx = await browser.newContext({ viewport: VIEWPORTS[vp], deviceScaleFactor: opt.dpr || 1, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.errors = [];
  page.on('console', m => { if (m.type() === 'error') page.errors.push(m.text()); });
  page.on('pageerror', e => page.errors.push(String(e)));
  await page.goto(opt.url + '?mute=1&novoice=1&' + q);
  await page.waitForFunction(() => window.TT && TT.debug && TT.debug.mode === 'title', null, { timeout: 20000 });
  if (opt.notch) {
    const n = NOTCH[vp];
    await page.addStyleTag({ content: `:root{--sa-t:${n.t}px!important;--sa-r:${n.r}px!important;--sa-b:${n.b}px!important;--sa-l:${n.l}px!important}` });
    await page.evaluate(() => window.dispatchEvent(new Event('resize')));
    await page.waitForTimeout(300);
  }
  await page.waitForTimeout(400);
  return { ctx, page };
}
const until = (page, fn, arg, t = 60000) => page.waitForFunction(fn, arg, { timeout: t, polling: 30 });
/** Start a session and jump to chapter `lvl` (mood) with `topic` forced; optional surprise forced on round 0. */
async function startTopic(page, { topic, lvl = 0, surprise = null, round = 0 } = {}) {
  await page.evaluate(({ topic, lvl, surprise, round }) => {
    TT.debug.startGame();
    const w = TT.debug.world;
    if (topic) w.levels[lvl] = topic;
    if (surprise) { w.cfg.surpriseTypes = [surprise]; w.cfg.surpriseRound = round; }
    w.startLevel(lvl);
    if (round) w.round = round;
  }, { topic, lvl, surprise, round });
}
async function toLoad(page) {
  await page.evaluate(() => TT.debug.setSpeed(8));
  await until(page, () => { const w = TT.debug.world; return w.state === 'round' && w.phase === 'load' && w.items.every(i => i.state === 'rest'); });
  await page.evaluate(() => TT.debug.setSpeed(1));
  await page.waitForTimeout(250);
}
async function touch(cdp, type, x, y) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
}
async function dragTo(page, cdp, a, b, { steps = 10, hold = false } = {}) {
  await touch(cdp, 'touchStart', a.x, a.y); await page.waitForTimeout(50);
  for (let i = 1; i <= steps; i++) { const t = i / steps; await touch(cdp, 'touchMove', a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t); await page.waitForTimeout(25); }
  if (!hold) { await page.waitForTimeout(80); await touch(cdp, 'touchEnd'); }
}
/** Solve the round instantly through the world API (load every right cargo). */
async function solve(page) {
  await page.evaluate(() => TT.debug.setBot(true, 1));
  await page.evaluate(() => TT.debug.setSpeed(6));
  await until(page, () => TT.debug.world._solved() || ['whistle', 'depart'].includes(TT.debug.world.phase));
  await page.evaluate(() => { TT.debug.setBot(false); TT.debug.setSpeed(1); });
}
const shot = (page, name, o = {}) => page.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, o));
async function launch() { const srv = await serve(); const browser = await chromium.launch(); return { srv, browser }; }
module.exports = { OUT, VIEWPORTS, NOTCH, open, until, startTopic, toLoad, dragTo, touch, solve, shot, launch };
