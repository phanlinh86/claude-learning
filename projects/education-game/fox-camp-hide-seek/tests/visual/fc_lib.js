// Shared helpers for the visual QA of Pip's Camp Hide & Seek (Playwright, phone/tablet contexts, hand-stepped world).
// The world is "frozen" by swapping world.update for a no-op (main.js keeps drawing and draining events); D.adv(s) steps it
// by hand. D.toRound(level, topic, ri) plays real right answers (world.pointerDown/Up on placeHit) until round ri gathers.
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
  await page.waitForFunction(() => window.FC && FC.debug && FC.debug.mode === 'title', null, { timeout: 20000 });
  await sleep(500);
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));   // re-measure the safe insets after the CSS override
  await sleep(300);
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
    const D = FC.debug;
    D.freeze = () => { const w = D.world; if (!w._upd) { w._upd = w.update; w.update = function () {}; } };
    D.thaw = () => { const w = D.world; if (w._upd) { w.update = w._upd; delete w._upd; } };
    D.adv = s => { const w = D.world, u = w._upd || w.update; for (let t = 0; t < s - 1e-9; t += 1 / 60) u.call(w, Math.min(1 / 60, s - t)); w.alpha = 1; D.sync(); };
    D.until = (f, max = 30) => { for (let t = 0; t < max; t += 1 / 60) { if (f()) return true; D.adv(1 / 60); } return !!f(); };
    D.sync = () => { const w = D.world; w.alpha = 1; (w.friends || []).forEach(f => { f._px = f.x; f._py = f.y; f._prot = f.rot; }); (w.places || []).forEach(p => { p._pshake = p.shake; }); };
    D.season = () => { const r = D.render(); r._prevSeason = r._season; r._fadeU = 1; };
    D.tap = id => { const w = D.world, b = w.placeHit(id); if (!b) return false; const y = b.y - b.h * 0.2; w.pointerDown(b.x, y); w.pointerUp(b.x, y); return true; };
    D.tapAnswer = () => { const id = D.world.answerId(); return id != null && D.tap(id); };
    D.wrongId = () => { const w = D.world, a = w.answerId(); const p = w.places.find(p => !p.found && p.id !== a && !p.leaving); return p ? p.id : null; };
    // start chapter `level` with `topic`, play right answers until round `ri` begins (phase gather)
    D.toRound = (level, topic, ri) => {
      const w = D.world;
      if (D.mode !== 'play') D.startGame();
      D.freeze();
      if (topic) w.levels[level] = topic;
      w.startLevel(level);
      D.weather.setWeather(level, { instant: true });
      for (let g = 0; g < 20000; g++) {
        if (w.state === 'round' && w.round === ri) break;
        if (w.state === 'round' && w.phase === 'ask') { D.tapAnswer(); D.adv(0.05); continue; }
        if (w.state === 'talk' || w.state === 'levelDone' || w.state === 'sessionDone') return false;
        D.adv(0.05);
      }
      D.sync(); D.season();
      return w.state === 'round' && w.round === ri;
    };
    D.toAsk = (level, topic, ri, ai) => {
      const w = D.world;
      if (!D.toRound(level, topic, ri)) return false;
      for (let g = 0; g < 4000; g++) {
        if (w.phase === 'ask' && w.ask === ai) break;
        if (w.state !== 'round') return false;
        if (w.phase === 'ask') { D.tapAnswer(); D.adv(0.05); continue; }
        D.adv(0.05);
      }
      D.until(() => w.places.every(p => (p.appear || 0) >= 1) && w.friends.every(f => !f._seg && !f._queue.length), 4);
      D.adv(0.3); D.sync();
      return w.phase === 'ask' && w.ask === ai;
    };
  });
  return { ctx, page };
}
const shot = (page, f) => page.screenshot({ path: f });

// round geometry in logical px (DOM rects converted)
const geom = page => page.evaluate(() => {
  const D = FC.debug, w = D.world, v = D.view(), L = w.layout, r = D.render(), CA = FC.CampArt;
  const R = id => { const e = document.getElementById(id); if (!e || e.classList.contains('hidden')) return null; const b = e.getBoundingClientRect(); if (!b.width) return null;
    return { x: (b.left - v.left) / v.s, y: (b.top - v.top) / v.s, w: b.width / v.s, h: b.height / v.s }; };
  const places = (w.places || []).map(p => ({ id: p.id, kind: p.kind, x: p.x, y: p.y, w: p.w, h: p.h, row: p.row, scale: p.scale, peekY: p.peekY, clueTop: p.clueTop, fs: p.fs,
    found: p.found, open: p.open, leaving: p.leaving, friendId: p.friendId, hit: w.placeHit(p.id) }));
  const friends = (w.friends || []).map(f => { const s = r.friendSize(w, f); return { id: f.id, animal: f.animal, clue: f.clue, x: f.x, y: f.y, size: s, state: f.state, rise: f.rise, seat: f.seat, home: f.home, found: f.found,
    clueH: CA && CA.clueHeight ? CA.clueHeight(f.clue, s) : 0 }; });
  const bt = document.getElementById('bubbleText'), bb = document.getElementById('bubble');
  return { W: L.W, H: L.H, s: v.s, ins: L.ins, portrait: L.portrait, tall: L.tall, age: w.age, level: w.level, topic: w.topic, round: w.round, ask: w.ask, phase: w.phase, state: w.state,
    places, friends, pip: L.pip, pipHit: w.pipHit(), camp: L.camp, bench: L.bench, seatSize: L.seatSize, spotW: L.spotW, groundY: L.groundY, rows: L.rows, safe: L.safe,
    hudKeep: w.hudKeep, layoutBubble: L.bubble, layoutHud: L.hud, geo: w.geo,
    bubble: R('bubble'), hud: R('hud'), bubbleFont: getComputedStyle(bt).fontSize, bubbleOverflow: [bb.scrollHeight - bb.clientHeight, bb.scrollWidth - bb.clientWidth], bubbleText: bt.textContent };
});

// Pixel probe: for every friend, redraw the frame with and without it (particles/fx off) → visible pixels vs its full
// sprite (clipped at the peek line when hidden); the real drawn top of each friend+clue; the colour behind each hat;
// for each hidden friend the columns where the clip line is exposed (no place art just below peekY).
const probe = page => page.evaluate(() => {
  const D = FC.debug, w = D.world, r = D.render(), wx = D.weather, cv = document.getElementById('game'), g = cv.getContext('2d');
  const keepP = wx.particles, keepF = r.fx, all = w.friends.slice();
  wx.particles = []; r.fx = [];
  const rs = cv.width / w.layout.W;
  const draw = () => r.draw(w, wx, { dt: 0, lang: 'en', title: false, done: false });
  const grab = b => g.getImageData(b.X, b.Y, b.Wd, b.Hd).data;
  const HID = { hidden: 1, pop: 1, boo: 1, duck: 1 };
  const out = [];
  for (const f of all) {
    if (f.state === 'gone') continue;
    const s = r.friendSize(w, f), ch = FC.CampArt.clueHeight(f.clue, s);
    const l = f.x - s * 0.75, t = f.y - s * 0.96 + s * 0.14 - ch - 12, rr = f.x + s * 0.75, bt = f.y + s * 0.15;
    const b = { X: Math.max(0, Math.floor(l * rs)), Y: Math.max(0, Math.floor(t * rs)) };
    b.Wd = Math.max(1, Math.min(cv.width, Math.ceil(rr * rs)) - b.X); b.Hd = Math.max(1, Math.min(cv.height, Math.ceil(bt * rs)) - b.Y);
    w.friends = all; draw(); const A = grab(b);
    w.friends = all.filter(x => x !== f); draw(); const B = grab(b);
    const p = f.place != null ? w.placeById(f.place) : null, hidden = !!(p && HID[f.state]);
    g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(rs, 0, 0, rs, 0, 0);
    if (hidden) { const open = Math.max(0, Math.min(1, p.open || 0)), py = p.peekY + (open > 0.5 ? -p.w * 0.25 * (open - 0.5) * 2 : 0);
      g.save(); g.beginPath(); g.rect(-50, -400, w.layout.W + 100, py + 400); g.clip(); r._friend(w, f, 1, true, p); g.restore(); }
    else r._friend(w, f, 1, false);
    const F = grab(b);
    let full = 0, vis = 0, topY = 1e9, bg = [0, 0, 0, 0];
    const hatY0 = f.y - s * 0.82 - 0.3 * s, hatY1 = f.y - s * 0.82 + 0.18 * s;
    for (let y = 0; y < b.Hd; y++) for (let x = 0; x < b.Wd; x++) {
      const i = (y * b.Wd + x) * 4;
      const d = Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]);
      if (F[i + 3] > 128) { full++; if (d > 24) vis++; }
      if (d > 24 && F[i + 3] > 128) { const ly = (b.Y + y) / rs; if (ly < topY) topY = ly;
        if (f.clue && f.clue.kind === 'hat' && ly > hatY0 && ly < hatY1 && Math.abs((b.X + x) / rs - f.x) < s * 0.36) { /* behind hat */ } }
    }
    // background right around the hat (ring 4–14 px outside the drawn hat pixels, from B)
    if (f.clue && f.clue.kind === 'hat') {
      const n = [0, 0, 0]; let c = 0; const k = Math.round(8 * rs);
      for (let y = k; y < b.Hd - k; y += 2) for (let x = k; x < b.Wd - k; x += 2) {
        const ly = (b.Y + y) / rs; if (ly < hatY0 || ly > hatY1) continue;
        const i = (y * b.Wd + x) * 4; if (F[i + 3] > 20) continue;
        let near = false; for (const [dx, dy] of [[k, 0], [-k, 0], [0, k], [0, -k]]) { const j = ((y + dy) * b.Wd + x + dx) * 4; if (F[j + 3] > 200) near = true; }
        if (!near) continue;
        n[0] += B[i]; n[1] += B[i + 1]; n[2] += B[i + 2]; c++;
      }
      bg = c ? [n[0] / c, n[1] / c, n[2] / c, c] : null;
    } else bg = null;
    // exposed clip line: columns where the friend reaches the peek line but no place art sits 3 px below it
    let cut = null;
    if (hidden) {
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, cv.width, cv.height); g.setTransform(rs, 0, 0, rs, 0, 0);
      const keepPl = w.places; w.places = [p]; r._place(w, p, [], 1); w.places = keepPl;
      const Pl = grab(b);
      const open = Math.max(0, Math.min(1, p.open || 0)), py = p.peekY + (open > 0.5 ? -p.w * 0.25 * (open - 0.5) * 2 : 0);
      const yA = Math.round(py * rs) - b.Y - 2, yB = Math.round(py * rs) - b.Y + 3;
      let cols = 0, bad = 0, maxGap = 0;
      if (yA >= 0 && yB < b.Hd) for (let x = 0; x < b.Wd; x++) {
        if (F[(yA * b.Wd + x) * 4 + 3] < 128) continue;
        cols++;
        if (Pl[(yB * b.Wd + x) * 4 + 3] < 128) { bad++; let gp = 0; for (let y = yB; y < b.Hd && Pl[(y * b.Wd + x) * 4 + 3] < 128; y++) gp++; maxGap = Math.max(maxGap, gp / rs); }
      }
      cut = { cols, bad, maxGap: Math.round(maxGap) };
    }
    out.push({ id: f.id, animal: f.animal, state: f.state, clue: f.clue, x: f.x, y: f.y, size: s, place: f.place, full, vis, frac: full ? vis / full : null, drawnTop: topY < 1e9 ? topY : null, hatBg: bg, cut });
  }
  w.friends = all; wx.particles = keepP; r.fx = keepF; draw();
  return out;
});
module.exports = { OUT, mk, DEV, AGE_TOPICS, sleep, jl, start, stop, open, shot, geom, probe };
