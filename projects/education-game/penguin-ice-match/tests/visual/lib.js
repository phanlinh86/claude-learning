// Shared helpers for the visual QA scripts of Dee's Forest Memory (Playwright, phone/tablet contexts, frozen world).
// The world is frozen by swapping world.update for a no-op (the renderer keeps drawing); D.adv(s) steps it by hand
// (setSpeed() clamps to ≥ 0.1, so it cannot freeze a frame). D.sync() copies x→_px, flip→_pflip … so the
// interpolation never smears a hand-set state.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const serve = require('../e2e/serve');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const mk = d => { fs.mkdirSync(d, { recursive: true }); return d; };
const DEV = {
  iphoneP: { viewport: { width: 393, height: 852 }, dpr: 3 },
  iphoneL: { viewport: { width: 852, height: 393 }, dpr: 3 },
  ipadP: { viewport: { width: 820, height: 1180 }, dpr: 2 },
  ipadL: { viewport: { width: 1180, height: 820 }, dpr: 2 },
  seL: { viewport: { width: 667, height: 375 }, dpr: 2 },      // iPhone SE landscape (shortest phone)
  miniL: { viewport: { width: 812, height: 375 }, dpr: 3 },    // iPhone 13 mini landscape
  seP: { viewport: { width: 375, height: 667 }, dpr: 2 }
};
// CSS px safe areas of real devices (Dynamic Island iPhone 15/16, iPad Pro 11")
const NOTCH = {
  P: ':root{--sa-t:59px !important;--sa-b:34px !important}',
  L: ':root{--sa-l:59px !important;--sa-r:59px !important;--sa-b:21px !important}',
  PAD: ':root{--sa-t:24px !important;--sa-b:20px !important}'
};
const AGE_TOPICS = { 3: ['colors', 'size', 'shapes', 'animals'], 4: ['colors', 'shapes', 'count', 'animals'],
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
  if (opts.notch) {   // main.js readInsets() reads the computed padding of #safeProbe (= the --sa-* custom properties)
    await page.addInitScript(c => { document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = c; document.head.appendChild(s); }); }, NOTCH[opts.notch]);
  }
  await page.goto(srv.url + '?mute=1&novoice=1&seed=' + (opts.seed || 5) + '&' + q);
  await page.waitForFunction(() => window.IM && IM.debug && IM.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(400);
  if (opts.notch) await page.evaluate(n => {   // paint the unsafe zones so they show in the shots
    const add = st => { const d = document.createElement('div'); d.style.cssText = 'position:fixed;z-index:999;pointer-events:none;' + st; document.body.appendChild(d); };
    if (n === 'P') { add('left:0;right:0;top:0;height:59px;background:rgba(255,0,0,.18)'); add('left:50%;top:11px;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000');
      add('left:0;right:0;bottom:0;height:34px;background:rgba(255,0,0,.18)'); add('left:50%;bottom:8px;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#000'); }
    else if (n === 'L') { add('left:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000');
      add('right:0;top:0;bottom:0;width:59px;background:rgba(255,0,0,.18)'); add('left:0;right:0;bottom:0;height:21px;background:rgba(255,0,0,.18)');
      add('left:50%;bottom:8px;width:200px;height:5px;margin-left:-100px;border-radius:3px;background:#000'); }
    else { add('left:0;right:0;top:0;height:24px;background:rgba(255,0,0,.18)'); add('left:0;right:0;bottom:0;height:20px;background:rgba(255,0,0,.18)'); }
  }, opts.notch);
  await page.evaluate(() => {
    const D = IM.debug;
    D.freeze = () => { const w = D.world; if (!w._upd) { w._upd = w.update; w.update = function () {}; } };
    D.thaw = () => { const w = D.world; if (w._upd) { w.update = w._upd; delete w._upd; } };
    D.adv = s => { const w = D.world, u = w._upd || w.update; for (let t = 0; t < s - 1e-9; t += 0.05) u.call(w, Math.min(0.05, s - t)); };
    D.sync = () => { const w = D.world; w.alpha = 1;
      for (const c of w.cards) { c._px = c.x; c._py = c.y; c._prot = c.rot; c._pflip = c.flip; }
      for (const r of w.rewards) { r._px = r.x; r._py = r.y; r._prot = r.rot; for (const p of r.pieces || []) { p._px = p.x; p._py = p.y; p._prot = p.rot; } } };
    D.until = (f, max = 20) => { for (let t = 0; t < max; t += 0.05) { if (f()) return true; D.adv(0.05); } return false; };
    // start a game frozen at (level, topic, round index)
    D.toRound = (level, topic, ri, pairs) => {
      const w = D.world;
      D.startGame(); D.freeze();
      if (topic) w.levels[level] = topic;
      w.startLevel(level);
      D.adv(2.6);
      if (ri > 0 || pairs) { w.round = ri; if (pairs) { w._cfgSave = w.cfg.pairsByAge; const t = {}; for (const a in w.cfg.pairsByAge) t[a] = [pairs, pairs, pairs, pairs]; w.cfg.pairsByAge = t; }
        w._beginRound(); if (pairs) w.cfg.pairsByAge = w._cfgSave; }
      D.weather.setWeather(level, { instant: true });
    };
    D.peekUp = () => { const w = D.world; D.until(() => w.phase === 'peek'); D.until(() => w.cards.every(c => c.flip >= 0.97)); D.adv(0.1); D.sync(); };
    D.toPlay = () => { const w = D.world; D.until(() => w.phase === 'play'); D.until(() => w.cards.every(c => c.flip < 0.01), 3); D.adv(0.2); D.sync(); };
    D.tap = c => D.world.pointerDown(c.hx, c.hy);
    // play the current chapter by hand until round ri has `left` pairs left; rewards settle
    D.playTo = (ri, left) => {
      const w = D.world;
      for (let guard = 0; guard < 4000; guard++) {
        if (w.state === 'round' && w.round === ri && w.pairs - w.found <= left && !w._anims.length) break;
        if (w.state === 'talk') break;
        if (w.state === 'round' && w.phase === 'play' && !w.open.length && !w._anims.length) {
          const free = w.cards.filter(c => c.state === 'down');
          const a = free[0], b = free.find(c => c !== a && c.key === a.key);
          if (a && b) { D.tap(a); D.adv(0.35); D.tap(b); D.adv(0.3); continue; }
        }
        D.adv(0.1);
      }
      for (let k = 0; k < 400 && w.rewards.some(r => r.state !== 'idle'); k++) for (const r of w.rewards) w._stepReward(r, 1 / 120);
      for (const r of w.rewards) for (let k = 0; k < 120; k++) w._stepReward(r, 1 / 120);
      D.sync();
    };
  });
  return { ctx, page };
}
const shot = (page, f) => page.screenshot({ path: f });

// geometry of the round on screen in logical px (DOM rects converted)
const geom = page => page.evaluate(() => {
  const D = IM.debug, w = D.world, v = D.view(), L = w.layout, G = L.grid;
  const R = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden') || e.getBoundingClientRect().width === 0) return null; const b = e.getBoundingClientRect();
    return { x: (b.left - v.left) / v.s, y: (b.top - v.top) / v.s, w: b.width / v.s, h: b.height / v.s }; };
  const cards = w.cards.filter(c => c.state !== 'gone').map(c => ({ id: c.id, key: c.key, kind: c.face.kind, color: c.face.color || null, x: c.hx - c.w / 2, y: c.hy - c.h / 2, w: c.w, h: c.h }));
  const bt = document.getElementById('bubbleText'), bb = document.getElementById('bubble');
  return { W: L.W, H: L.H, s: v.s, ins: L.ins, portrait: L.portrait, age: w.age, topic: w.topic, round: w.round, pairs: w.pairs,
    grid: G && { cols: G.cols, rows: G.rows, cw: G.cw, ch: G.ch, gap: G.gap, rect: G.rect, boardIndex: G.boardIndex, minOk: G.minOk, cssW: G.cw * v.s },
    cards, dee: L.deeRect, deeAnchor: L.dee, groundY: L.groundY, layoutBubble: L.bubble,
    bubble: R('bubble'), hud: R('hud'), bubbleFont: parseFloat(bt.style.fontSize) || null, bubbleOverflow: bb.scrollHeight - bb.clientHeight, bubbleText: bt.textContent,
    rewards: w.rewards.map(r => ({ id: r.id, kind: r.kind, color: r.color, sprite: r.sprite, state: r.state, x: r.x, y: r.y, perch: r.perch && r.perch.kind, box: r.target && r.target.box })) };
});
// background probe: redraw with no cards / rewards / particles and sample the pixels where they sit
const bgProbe = page => page.evaluate(() => {
  const D = IM.debug, w = D.world, r = D.render(), wx = D.weather, cv = document.getElementById('game'), g = cv.getContext('2d');
  const keepC = w.cards, keepR = w.rewards, keepP = wx.particles;
  w.cards = []; w.rewards = []; wx.particles = [];
  r.draw(w, wx, { dt: 0, lang: 'en', title: false, done: false });
  const rs = cv.width / w.layout.W, img = g.getImageData(0, 0, cv.width, cv.height).data;
  const px = (x, y) => { const X = Math.max(0, Math.min(cv.width - 1, Math.round(x * rs))), Y = Math.max(0, Math.min(cv.height - 1, Math.round(y * rs))), i = (Y * cv.width + X) * 4; return [img[i], img[i + 1], img[i + 2]]; };
  const ring = (cx, cy, rad) => { const s = []; for (let a = 0; a < 16; a++) for (const k of [0, 0.5, 1]) s.push(px(cx + Math.cos(a / 16 * 6.283) * rad * k, cy + Math.sin(a / 16 * 6.283) * rad * k)); return s; };
  const G = w.layout.grid, panel = [], around = [];
  if (G) { const R = G.rect; for (let iy = 0; iy <= 8; iy++) for (let ix = 0; ix <= 8; ix++) panel.push(px(R.x + R.w * ix / 8, R.y + R.h * iy / 8));
    for (let k = 0; k < 40; k++) { const t = k / 40; around.push(px(R.x - 60 + (R.w + 120) * t, R.y - 60), px(R.x - 60 + (R.w + 120) * t, R.y + R.h + 60)); } }
  const rew = keepR.map(q => ({ id: q.id, kind: q.kind, color: q.color, x: q.x, y: q.y, samples: ring(q.x, q.kind === 'animal' ? q.y - 35 : q.y, 26) }));
  w.cards = keepC; w.rewards = keepR; wx.particles = keepP;
  r.draw(w, wx, { dt: 0, lang: 'en', title: false, done: false });
  return { panel, around, rewards: rew, season: w.level };
});

module.exports = { OUT, mk, DEV, AGE_TOPICS, sleep, jl, start, stop, open, shot, geom, bgProbe, get srv() { return srv; }, get browser() { return browser; } };
