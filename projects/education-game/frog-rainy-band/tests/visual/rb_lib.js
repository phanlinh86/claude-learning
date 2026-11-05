// Shared helpers for the visual QA of Bop's Rainy Band (Playwright phone/tablet contexts, hand-stepped world).
// The world is "frozen" by swapping world.update for a no-op (main.js keeps drawing and draining events); D.adv(s) steps
// it by hand. D.tapRight() taps the right member (or the big drum in a drum ask) through world.pointerDown/Up.
// Raw captures go to $RB_VIS_OUT (default: tests/out/visual, gitignored); the report keeps a curated subset in
// docs/reports/visual/ (copied by hand, then python3 tests/visual/rb_compact.py).
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = process.env.RB_VIS_OUT || path.join(__dirname, '..', 'out', 'visual');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 1, notch: 'P' },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 1, notch: 'L' },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 1, notch: 'PAD' },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 1, notch: 'PAD' }
};
const NOTCH = {   // CSS px safe areas (iPhone 15 class: 47 top / 34 bottom portrait, 47 sides / 21 bottom landscape; iPad)
  P: ':root{--sa-t:47px !important;--sa-b:34px !important}',
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
  await page.waitForFunction(() => window.RB && RB.debug && RB.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(400);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));   // re-measure the safe insets after the CSS override
  await sleep(300);
  if (notch) await page.evaluate(n => {   // paint the unsafe zones + the island / home bar so they show in the shots
    const add = st => { const e = document.createElement('div'); e.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(e); };
    if (n === 'P') { add('left:0;right:0;top:0;height:47px;background:rgba(255,0,0,.14)'); add('left:50%;top:11px;width:126px;height:34px;margin-left:-63px;border-radius:18px;background:#000');
      add('left:0;right:0;bottom:0;height:34px;background:rgba(255,0,0,.14)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else if (n === 'L') { add('left:0;top:0;bottom:0;width:47px;background:rgba(255,0,0,.14)'); add('left:8px;top:50%;width:34px;height:126px;margin-top:-63px;border-radius:18px;background:#000');
      add('right:0;top:0;bottom:0;width:47px;background:rgba(255,0,0,.14)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.14)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
    else { add('left:0;right:0;top:0;height:24px;background:rgba(255,0,0,.14)'); add('left:0;right:0;bottom:0;height:20px;background:rgba(255,0,0,.14)'); }
  }, notch);
  await page.evaluate(() => {
    const D = RB.debug;
    D.freeze = () => { const w = D.world; if (!w._upd) { w._upd = w.update; w.update = function () {}; } };
    D.thaw = () => { const w = D.world; if (w._upd) { w.update = w._upd; delete w._upd; } };
    D.adv = s => { const w = D.world, u = w._upd || w.update; for (let t = 0; t < s - 1e-9; t += 1 / 60) u.call(w, Math.min(1 / 60, s - t)); w.alpha = 1; };
    D.until = (f, max = 30) => { for (let t = 0; t < max; t += 1 / 60) { if (f()) return true; D.adv(1 / 60); } return !!f(); };
    D.tod = i => D.weather.setWeather(i, { instant: true });
    D.tap = (x, y) => { const w = D.world; w.pointerDown(x, y); D.adv(1 / 60); return w.pointerUp(x, y); };
    D.restAll = () => D.until(() => { const w = D.world; return w.state === 'round' && w.phase === 'ask' && w.members.every(m => m.state === 'rest') && !w._locked(); }, 8);
    D.tapRight = () => {
      const w = D.world, a = w._askObj(); if (!a || w.phase !== 'ask') return null;
      if (a.mode === 'drum') { const b = w.bigDrumHit(); return D.tap(b.x, b.y); }
      const m = w.memberById(w.answerId()); return m ? D.tap(m.homeX, m.homeY) : null;
    };
    D.wrongM = () => { const w = D.world, a = w.answerId(); return w.members.find(m => m.id !== a && m.state === 'rest'); };
    D.tapWrong = () => { const m = D.wrongM(); return m ? D.tap(m.homeX, m.homeY) : null; };
    // a full drum ask (n taps) or one right tap
    D.solve = () => {
      const w = D.world, a = w._askObj(); if (!a) return;
      if (a.mode === 'drum') { for (let i = 0; i < a.n && w.phase === 'ask'; i++) { D.tapRight(); D.adv(0.3); } }
      else D.tapRight();
    };
    D.toRound = (level, topic, ri) => {
      const w = D.world;
      if (D.mode !== 'play') D.startGame();
      D.freeze();
      if (topic) w.levels[level] = topic;
      w.startLevel(level); D.tod(level);
      for (let g = 0; g < 30000; g++) {
        if (w.state === 'round' && w.round === ri) break;
        if (w.state === 'round' && w.phase === 'ask' && D.restAll()) { D.solve(); D.adv(0.05); continue; }
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
        if (w.phase === 'ask' && D.restAll()) { if (w.ask === ai) break; D.solve(); D.adv(0.05); continue; }
        D.adv(0.05);
      }
      D.restAll(); D.adv(0.6);
      return w.phase === 'ask' && w.ask === ai;
    };
    D.finishAsks = () => { const w = D.world; for (let i = 0; i < 6000 && w.state === 'round' && w.phase !== 'song'; i++) { if (w.phase === 'ask' && D.restAll()) D.solve(); D.adv(0.05); } return w.phase === 'song'; };
  });
  return { ctx, page };
}
const shot = (page, f) => page.screenshot({ path: f });
// wait two frames so main.js drains events (bubble text, fx), then clear the transient fx
const settle = async (page, keepFx) => { await sleep(180); if (!keepFx) await page.evaluate(() => { RB.debug.render().fx = []; }); await sleep(120); };

// geometry in logical px (DOM rects converted) — used by the analyser
const geom = page => page.evaluate(() => {
  const D = RB.debug, w = D.world, v = D.view(), L = w.layout;
  const R = id => { const e = typeof id === 'string' ? document.getElementById(id) : id; if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); if (!b.width) return null;
    return { x: (b.left - v.left) / v.s, y: (b.top - v.top) / v.s, w: b.width / v.s, h: b.height / v.s }; };
  const members = (w.members || []).filter(m => m.state !== 'gone').map(m => ({ id: m.id, kind: m.item.kind, value: m.item.value, color: m.item.color, size: m.item.size, x: m.homeX, y: m.homeY, state: m.state }));
  const bt = document.getElementById('bubbleText'), bb = document.getElementById('bubble');
  const sh = w.sheet || { n: 0 };
  return { W: L.W, H: L.H, s: v.s, ins: L.ins, portrait: L.portrait, tall: L.tall, S: L.S, age: w.age, level: w.level, topic: w.topic, round: w.round, ask: w.ask, phase: w.phase, state: w.state,
    members, stage: L.stage, sheet: { y: L.sheet.y, slots: L.sheet.slots.slice(0, sh.n || 0), n: sh.n, filled: (sh.notes || []).filter(Boolean).length }, countCard: w.countCard && w.countCard.show > 0.05 ? L.countCard : null,
    bigDrum: L.bigDrum, bop: L.bop, bopHit: w.bopHit(), snail: w.snail ? { x: w.snail.x, y: w.snail.y, size: w.snail.size } : null, hintHand: w.hintHand ? { x: w.hintHand.x, y: w.hintHand.y } : null,
    flyNotes: (w.flyNotes || []).map(n => ({ x: n.x, y: n.y })), hudKeep: w.hudKeep, layoutBubble: L.bubble,
    bubble: R('bubble'), hud: R('hud'), bubbleFont: getComputedStyle(bt).fontSize, bubbleOverflow: [bb.scrollHeight - bb.clientHeight, bb.scrollWidth - bb.clientWidth], bubbleText: bt.textContent };
});
// DOM rects (CSS px) + text overflow for the given selectors
const domRects = (page, sels) => page.evaluate(sels => {
  const o = {};
  for (const s of sels) { const e = document.querySelector(s); if (!e) continue; const b = e.getBoundingClientRect(); if (!b.width) continue;
    o[s] = { css: [Math.round(b.left), Math.round(b.top), Math.round(b.right), Math.round(b.bottom)], over: [e.scrollWidth - e.clientWidth, e.scrollHeight - e.clientHeight], txt: (e.textContent || '').trim().slice(0, 70), fs: getComputedStyle(e).fontSize }; }
  const cs = getComputedStyle(document.getElementById('safeProbe'));
  return { vw: innerWidth, vh: innerHeight, sa: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat), rects: o };
}, sels);
module.exports = { OUT, mk, DEV, AGE_TOPICS, sleep, jl, start, stop, open, shot, settle, geom, domRects };
