// Shared helpers for the visual QA of Bim's Rainbow Rocket (Playwright, phone/tablet contexts, hand-stepped world).
// The world is "frozen" by swapping world.update for a no-op (main.js keeps drawing and draining events); D.adv(s) steps it by
// hand, D.toAsk(...) plays real taps (world.pointerDown on the right island) until a given round/hop is up.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3, notch: 'P' },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3, notch: 'L' },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2, notch: 'PAD' },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2, notch: 'PAD' },
  seL: { viewport: { width: 667, height: 375 }, dpr: 2, notch: null }
};
const NOTCH = {   // CSS px safe areas (Dynamic Island iPhone 15/16, iPad Pro 11")
  P: ':root{--sa-t:59px !important;--sa-b:34px !important}',
  L: ':root{--sa-l:59px !important;--sa-r:59px !important;--sa-b:21px !important}',
  PAD: ':root{--sa-t:24px !important;--sa-b:20px !important}'
};
const AGE_TOPICS = { 3: ['colors', 'shapes', 'size', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
  5: ['shapes', 'count', 'letters', 'animals'], 6: ['lower', 'initial', 'add', 'count'], 7: ['initial', 'add', 'sub', 'oddeven'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const jl = (f, o) => fs.appendFileSync(f, JSON.stringify(o) + '\n');

let srv, browser;
async function start() { srv = await serve(); browser = await chromium.launch(); }
async function stop() { await browser.close(); srv.close(); }

async function open(dev, q, opts = {}) {
  const d = DEV[dev];
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  pageerror', dev, String(e)));
  page.on('console', m => { if (m.type() === 'error') console.log('  console.error', dev, m.text()); });
  const notch = opts.notch === false ? null : d.notch;
  if (notch) await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }); }, NOTCH[notch]);
  await page.goto(srv.url + '?mute=1&novoice=1&seed=' + (opts.seed || 5) + '&' + q);
  await page.waitForFunction(() => window.RR && RR.debug && RR.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(500);
  if (notch) await page.evaluate(n => {   // paint the unsafe zones + the island / home bar so they show in the shots
    const add = st => { const e = document.createElement('div'); e.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(e); };
    if (n === 'P') { add('left:0;right:0;top:0;height:59px;background:rgba(255,0,0,.14)'); add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
      add('left:0;right:0;bottom:0;height:34px;background:rgba(255,0,0,.14)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else if (n === 'L') { add('left:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.14)'); add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
      add('right:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.14)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.14)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
    else { add('left:0;right:0;top:0;height:24px;background:rgba(255,0,0,.14)'); add('left:0;right:0;bottom:0;height:20px;background:rgba(255,0,0,.14)'); }
  }, notch);
  await page.evaluate(() => {
    const D = RR.debug;
    D.freeze = () => { const w = D.world; if (!w._upd) { w._upd = w.update; w.update = function () {}; } };
    D.thaw = () => { const w = D.world; if (w._upd) { w.update = w._upd; delete w._upd; } };
    D.adv = s => { const w = D.world, u = w._upd || w.update; for (let t = 0; t < s - 1e-9; t += 1 / 60) u.call(w, Math.min(1 / 60, s - t)); w.alpha = 1; w._pcamY = w.camY; };
    D.until = (f, max = 30) => { for (let t = 0; t < max; t += 1 / 60) { if (f()) return true; D.adv(1 / 60); } return false; };
    D.sync = () => { const w = D.world; w.alpha = 1; w._pcamY = w.camY; };
    D.tapAnswer = () => { const w = D.world, id = w.answerId(); const i = id != null && w.islandById(id); if (!i) return false; w.pointerDown(i.x, i.y - w.camY - 10); w.pointerUp(i.x, i.y - w.camY - 10); return true; };
    // start a session (topic forced for chapter `level`), play right answers until (round ri, hop hi) is asked
    D.toAsk = (level, topic, ri, hi) => {
      const w = D.world;
      if (D.mode !== 'play') D.startGame();
      D.freeze();
      if (topic) w.levels[level] = topic;
      w.startLevel(level);
      D.weather.setWeather(level, { instant: true });
      for (let g = 0; g < 4000; g++) {
        if (w.state === 'round' && w.phase === 'ask' && w.round === ri && w.hop === hi) break;
        if (w.state === 'round' && w.phase === 'ask') { D.tapAnswer(); D.adv(0.1); continue; }
        if (w.state === 'roundDone' && w.phase === 'boostReady') { w.pointerDown(w.layout.W / 2, w.layout.H / 2); D.adv(0.1); continue; }
        if (w.state === 'talk' || w.state === 'levelDone') return false;
        D.adv(0.1);
      }
      D.until(() => w.islands.every(i => i.state !== 'appear'), 3); D.adv(0.4); D.sync();
      return w.state === 'round' && w.phase === 'ask';
    };
  });
  return { ctx, page };
}
const shot = (page, f) => page.screenshot({ path: f });

// round geometry in logical px (DOM rects converted) + bubble fit
const geom = page => page.evaluate(() => {
  const D = RR.debug, w = D.world, v = D.view(), L = w.layout, cam = w.camY;
  const R = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); if (!b.width) return null;
    return { x: (b.left - v.left) / v.s, y: (b.top - v.top) / v.s, w: b.width / v.s, h: b.height / v.s }; };
  const ts = w.tokenSize();
  const isl = w.islands.filter(i => i.state !== 'gone' && i.state !== 'leave' && i.token).map(i => {
    const sy = i.y - cam, th = i.token.kind === 'color' ? 0 : ts * (i.token.scale || 1);
    return { id: i.id, state: i.state, kind: i.token.kind, value: i.token.value, color: i.token.color || null, n: i.token.n, text: i.token.text,
      body: { x: i.x - i.w / 2, y: sy, w: i.w, h: i.h }, token: th ? { x: i.x - th / 2, y: sy - th, w: th, h: th } : null, hit: w.islandHit(i.id), style: i.style };
  });
  const bt = document.getElementById('bubbleText'), bb = document.getElementById('bubble'), rb = w._rocketBox();
  return { W: L.W, H: L.H, s: v.s, ins: L.ins, portrait: L.portrait, age: w.age, level: w.level, topic: w.topic, round: w.round, hop: w.hop, phase: w.phase, state: w.state,
    islands: isl, tokenSize: ts, islandW: L.islandW, rocket: { x: rb.x, y: rb.y - cam, w: rb.w, h: rb.h }, padY: L.padY, rowY: L.rowY,
    wagon: { x: w.wagon.x, y: w.wagon.y - cam, w: L.wagon.w, h: L.wagon.h }, hudKeep: w.hudKeep, layoutBubble: L.bubble,
    bubble: R('bubble'), hud: R('hud'), bubbleFont: getComputedStyle(bt).fontSize, bubbleOverflow: [bb.scrollHeight - bb.clientHeight, bb.scrollWidth - bb.clientWidth], bubbleText: bt.textContent };
});
// sky behind each island: redraw without islands/particles, sample around the island centre
const skyProbe = page => page.evaluate(() => {
  const D = RR.debug, w = D.world, r = D.render(), wx = D.weather, cv = document.getElementById('game'), g = cv.getContext('2d');
  const keepI = w.islands, keepP = wx.particles, keepF = r.fx;
  w.islands = []; wx.particles = []; r.fx = [];
  r.draw(w, wx, { dt: 0, lang: 'en', title: false, done: false });
  const rs = cv.width / w.layout.W, img = g.getImageData(0, 0, cv.width, cv.height).data;
  const px = (x, y) => { const X = Math.max(0, Math.min(cv.width - 1, Math.round(x * rs))), Y = Math.max(0, Math.min(cv.height - 1, Math.round(y * rs))), i = (Y * cv.width + X) * 4; return [img[i], img[i + 1], img[i + 2]]; };
  const out = keepI.filter(i => i.token && i.state !== 'gone').map(i => { const cy = i.y - w.camY + i.h / 2, s = [];
    for (let a = 0; a < 12; a++) s.push(px(i.x + Math.cos(a / 12 * 6.283) * i.w * 0.62, cy + Math.sin(a / 12 * 6.283) * i.h * 0.75));
    return { id: i.id, kind: i.token.kind, value: i.token.value, color: i.token.color || null, samples: s }; });
  w.islands = keepI; wx.particles = keepP; r.fx = keepF;
  return out;
});
module.exports = { OUT, mk, DEV, AGE_TOPICS, sleep, jl, start, stop, open, shot, geom, skyProbe };
