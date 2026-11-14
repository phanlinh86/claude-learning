// Shared helpers for the visual QA of Lulu's Jungle Tower (Playwright, phone/tablet contexts, hand-stepped world).
// The world is "frozen" by swapping world.update for a no-op (main.js keeps drawing and draining events); D.adv(s) steps
// it by hand. D.stack() drags the right block onto the tower through world.pointerDown/Move/Up (real input path).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', '..', 'docs', 'reports', 'visual');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3, notch: 'P' },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3, notch: 'L' },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2, notch: 'PAD' },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2, notch: 'PAD' }
};
const NOTCH = {   // CSS px safe areas (iPhone 14/15 class: 47 px; iPad: status bar + home indicator)
  P: ':root{--sa-t:47px !important;--sa-b:47px !important}',
  L: ':root{--sa-l:47px !important;--sa-r:47px !important;--sa-b:21px !important}',
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
  const ctx = await browser.newContext({ viewport: d.viewport, deviceScaleFactor: opts.dpr || d.dpr, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page.on('pageerror', e => console.log('  pageerror', dev, String(e)));
  page.on('console', m => { if (m.type() === 'error') console.log('  console.error', dev, m.text()); });
  const notch = opts.notch === false ? null : d.notch;
  if (notch) await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }); }, NOTCH[notch]);
  await page.goto(srv.url + '?mute=1&novoice=1&seed=' + (opts.seed || 5) + '&' + q);
  await page.waitForFunction(() => window.CK && CK.debug && CK.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(400);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));   // re-measure the safe insets after the CSS override
  await sleep(300);
  if (notch) await page.evaluate(n => {   // paint the unsafe zones + the island / home bar so they show in the shots
    const add = st => { const e = document.createElement('div'); e.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(e); };
    if (n === 'P') { add('left:0;right:0;top:0;height:47px;background:rgba(255,0,0,.14)'); add('left:50%;top:11px;width:126px;height:34px;margin-left:-63px;border-radius:18px;background:#000');
      add('left:0;right:0;bottom:0;height:47px;background:rgba(255,0,0,.14)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else if (n === 'L') { add('left:0;top:0;bottom:0;width:47px;background:rgba(255,0,0,.14)'); add('left:8px;top:50%;width:34px;height:126px;margin-top:-63px;border-radius:18px;background:#000');
      add('right:0;top:0;bottom:0;width:47px;background:rgba(255,0,0,.14)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.14)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
    else { add('left:0;right:0;top:0;height:24px;background:rgba(255,0,0,.14)'); add('left:0;right:0;bottom:0;height:20px;background:rgba(255,0,0,.14)'); }
  }, notch);
  await page.evaluate(() => {
    const D = CK.debug;
    D.freeze = () => { const w = D.world; if (!w._upd) { w._upd = w.update; w.update = function () {}; } };
    D.thaw = () => { const w = D.world; if (w._upd) { w.update = w._upd; delete w._upd; } };
    D.adv = s => { const w = D.world, u = w._upd || w.update; for (let t = 0; t < s - 1e-9; t += 1 / 60) u.call(w, Math.min(1 / 60, s - t)); w.alpha = 1; };
    D.until = (f, max = 30) => { for (let t = 0; t < max; t += 1 / 60) { if (f()) return true; D.adv(1 / 60); } return !!f(); };
    D.tod = i => D.weather.setWeather(i, { instant: true });
    D.piece = id => D.world.pieceById(id);
    D.rightP = () => D.world.pieces.find(p => p.id === D.world.answerId());
    D.wrongP = () => { const w = D.world, a = w.answerId(); return w.pieces.find(p => p.id !== a && p.askIdx === w.ask && p.state === 'rest'); };
    D.restAll = () => D.until(() => D.world.phase === 'ask' && D.world.pieces.filter(p => p.askIdx === D.world.ask).every(p => p.state === 'rest') && !D.world._locked(), 8);
    // drag piece p to the drop point in k steps; release unless keep
    D.drag = (p, k = 8, keep = false, frac = 1) => {
      const w = D.world, dp = w.dropPoint(); if (!p || !dp) return false;
      const x0 = p.x, y0 = p.y; w.pointerDown(x0, y0);
      for (let i = 1; i <= k; i++) { const u = (i / k) * frac; w.pointerMove(x0 + (dp.x - x0) * u, y0 + (dp.y - y0) * u); D.adv(1 / 30); }
      if (!keep) w.pointerUp(); return true;
    };
    D.stack = () => { const p = D.rightP(); return D.drag(p); };
    D.toRound = (level, topic, ri) => {
      const w = D.world;
      if (D.mode !== 'play') D.startGame();
      D.freeze();
      if (topic) w.levels[level] = topic;
      w.startLevel(level); D.tod(level);
      for (let g = 0; g < 30000; g++) {
        if (w.state === 'round' && w.round === ri) break;
        if (w.state === 'round' && w.phase === 'ask' && D.restAll()) { D.stack(); D.adv(0.05); continue; }
        if (w.state === 'talk' || w.state === 'levelDone' || w.state === 'sessionDone') return false;
        D.adv(0.05);
      }
      return w.state === 'round' && w.round === ri;
    };
    D.toAsk = (level, topic, ri, ai) => {
      const w = D.world;
      if (!D.toRound(level, topic, ri)) return false;
      for (let g = 0; g < 6000; g++) {
        if (w.phase === 'ask' && w.ask === ai) break;
        if (w.state !== 'round') return false;
        if (w.phase === 'ask' && D.restAll()) { D.stack(); D.adv(0.05); continue; }
        D.adv(0.05);
      }
      D.restAll(); D.adv(1.0);   // tower sway settles
      return w.phase === 'ask' && w.ask === ai;
    };
    D.finishTower = () => { const w = D.world; for (let i = 0; i < 6000 && w.state === 'round' && w.phase !== 'done'; i++) { if (w.phase === 'ask' && D.restAll()) D.stack(); D.adv(0.05); } return w.phase === 'done'; };
  });
  return { ctx, page };
}
const shot = (page, f) => page.screenshot({ path: f });
// wait two frames so main.js drains events (bubble text, fx), then clear the transient fx
const settle = async (page, keepFx) => { await sleep(160); if (!keepFx) await page.evaluate(() => { CK.debug.render().fx = []; }); await sleep(120); };

// geometry in logical px (DOM rects converted) — used by the analyser
const geom = page => page.evaluate(() => {
  const D = CK.debug, w = D.world, v = D.view(), L = w.layout;
  const R = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); if (!b.width) return null;
    return { x: (b.left - v.left) / v.s, y: (b.top - v.top) / v.s, w: b.width / v.s, h: b.height / v.s }; };
  const pieces = (w.pieces || []).filter(p => p.state !== 'gone').map(p => ({ id: p.id, kind: p.block.kind, x: p.x, y: p.y, side: p.side, state: p.state, right: p.right, askIdx: p.askIdx }));
  const tower = w.tower ? w.tower.blocks.map((b, i) => w.blockPose(i, 1)) : [];
  const bt = document.getElementById('bubbleText'), bb = document.getElementById('bubble');
  return { W: L.W, H: L.H, s: v.s, ins: L.ins, portrait: L.portrait, S: L.S, age: w.age, level: w.level, topic: w.topic, round: w.round, ask: w.ask, phase: w.phase, state: w.state,
    pieces, tower, towerX: L.tower, goalY: L.goalY, goal: w.goal && { x: w.goal.x, y: w.goal.y }, lulu: L.lulu, luluHit: w.luluHit(), drop: L.drop, slots: L.slots, hudKeep: w.hudKeep, layoutBubble: L.bubble,
    bubble: R('bubble'), hud: R('hud'), bubbleFont: getComputedStyle(bt).fontSize, bubbleOverflow: [bb.scrollHeight - bb.clientHeight, bb.scrollWidth - bb.clientWidth], bubbleText: bt.textContent };
});
// DOM rects (CSS px) + text overflow for the given selectors
const domRects = (page, sels) => page.evaluate(sels => {
  const o = {};
  for (const s of sels) { const e = document.querySelector(s); if (!e) continue; const b = e.getBoundingClientRect(); if (!b.width) continue;
    o[s] = { css: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], over: [e.scrollWidth - e.clientWidth, e.scrollHeight - e.clientHeight], txt: (e.textContent || '').trim().slice(0, 70) }; }
  const cs = getComputedStyle(document.getElementById('safeProbe'));
  return { vw: innerWidth, vh: innerHeight, sa: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat), rects: o };
}, sels);
module.exports = { OUT, mk, DEV, AGE_TOPICS, sleep, jl, start, stop, open, shot, settle, geom, domRects };
