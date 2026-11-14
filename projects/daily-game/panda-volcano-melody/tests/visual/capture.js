// Visual QA capture: every screen at 3 device sizes, each season, motion bursts as contact sheets,
// colour-blind simulations, safe-area / portrait, custom pictures. Report-only (never edits game/).
// Usage: node tests/visual/capture.js [outDir]     (default tests/visual/out)
const { chromium } = require('playwright');
const http = require('http'), fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..', 'game');
const OUT = process.argv[2] || path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const p = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, '/index.html'));
  fs.readFile(p, (e, d) => { if (e) { res.writeHead(404); res.end(); return; } res.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'application/octet-stream' }); res.end(d); });
});
const log = (...a) => console.log(...a);
const errors = [];
const VIEWS = {
  desk: { viewport: { width: 1280, height: 720 } },
  iphone: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  ipad: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};

let base, browser, tool;   // tool = a blank page for contact sheets / colour filters

async function newPage(view, q) {
  const ctx = await browser.newContext(VIEWS[view] || view);
  const p = await ctx.newPage();
  p.on('pageerror', e => errors.push(String(e)));
  p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  await p.goto(base + '?' + (q || 'mute=1&seed=7'));
  await p.waitForFunction(() => window.PVM && PVM.debug && PVM.debug.mode !== 'boot' && PVM.Game.renderer, null, { timeout: 15000 });
  return p;
}
const shot = (p, name, opt) => p.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, opt || {}));
// freeze the loop and step the simulation + renderer by hand (deterministic frames)
const freeze = p => p.evaluate(() => PVM.debug.setSpeed(0));
const adv = (p, sec) => p.evaluate(s => {
  const G = PVM.Game, n = Math.max(1, Math.round(s * 60));
  for (let i = 0; i < n; i++) { G.step(1 / 60); G.renderer.update(1 / 60); }
}, sec);
const frameWait = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
// logical stage rect → CSS clip
async function clipOf(p, x, y, w, h) {
  const r = await p.evaluate(() => ({ s: PVM.Game.renderer.cssScale, ox: PVM.Game.renderer.ox, oy: PVM.Game.renderer.oy }));
  return { x: Math.max(0, (x + r.ox) * r.s), y: Math.max(0, (y + r.oy) * r.s), width: w * r.s, height: h * r.s };
}
async function grab(p, rect) { await frameWait(p); return p.screenshot({ clip: rect }); }

// contact sheet: frames (PNG buffers) in a grid with frame numbers, built in a blank page
async function sheet(name, frames, cols, labels) {
  const data = frames.map(b => 'data:image/png;base64,' + b.toString('base64'));
  const url = await tool.evaluate(async ({ data, cols, labels }) => {
    const ims = await Promise.all(data.map(d => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = d; })));
    const w = ims[0].width, h = ims[0].height, rows = Math.ceil(ims.length / cols), pad = 6;
    const c = document.createElement('canvas'); c.width = cols * (w + pad) + pad; c.height = rows * (h + pad + 18) + pad;
    const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
    ims.forEach((im, i) => {
      const x = pad + (i % cols) * (w + pad), y = pad + Math.floor(i / cols) * (h + pad + 18);
      g.drawImage(im, x, y + 18); g.fillStyle = '#fff'; g.font = 'bold 13px sans-serif'; g.fillText((labels && labels[i]) || ('#' + i), x + 2, y + 13);
    });
    return c.toDataURL('image/png');
  }, { data, cols, labels });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(url.split(',')[1], 'base64'));
}
// colour-vision simulation (Machado et al. 2009, severity 1.0) of a saved PNG; writes name_deutan / _protan / _gray
async function cvd(srcName) {
  const d = 'data:image/png;base64,' + fs.readFileSync(path.join(OUT, srcName + '.png')).toString('base64');
  const res = await tool.evaluate(async d => {
    const M = {
      deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
      protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998],
      gray: [0.299, 0.587, 0.114, 0.299, 0.587, 0.114, 0.299, 0.587, 0.114]
    };
    const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = d; });
    const out = {};
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const enc = v => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
    for (const k in M) {
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
      const g = c.getContext('2d'); g.drawImage(im, 0, 0);
      const id = g.getImageData(0, 0, c.width, c.height), a = id.data, m = M[k];
      for (let i = 0; i < a.length; i += 4) {
        const r = lin(a[i]), gg = lin(a[i + 1]), b = lin(a[i + 2]);
        a[i] = enc(m[0] * r + m[1] * gg + m[2] * b); a[i + 1] = enc(m[3] * r + m[4] * gg + m[5] * b); a[i + 2] = enc(m[6] * r + m[7] * gg + m[8] * b);
      }
      g.putImageData(id, 0, 0); out[k] = c.toDataURL('image/png');
    }
    return out;
  }, d);
  for (const k in res) fs.writeFileSync(path.join(OUT, srcName + '_' + k + '.png'), Buffer.from(res[k].split(',')[1], 'base64'));
}

async function startPlaying(p) {
  await p.waitForFunction(() => PVM.debug.mode === 'playing' && PVM.debug.world.phase === 'playing', null, { timeout: 20000 });
}
// quiet a world: bot off, no crabs moving into the shot unless we want them
const setup = (p, fn, arg) => p.evaluate(fn, arg);

async function screens(view) {
  const p = await newPage(view, 'mute=1&seed=7');
  await p.waitForTimeout(2500);
  await shot(p, `scr_${view}_title`);
  for (const [btn, scr] of [['#btnHow', 'how'], ['#btnSettings', 'settings'], ['#btnCustomize', 'custom']]) {
    await p.click(btn); await p.waitForTimeout(450);
    await shot(p, `scr_${view}_${scr}`);
    await p.click('#scr' + { how: 'How', settings: 'Settings', custom: 'Custom' }[scr] + ' .btn-back'); await p.waitForTimeout(300);
  }
  await p.click('#btnPlay');
  await p.waitForTimeout(700);
  await shot(p, `scr_${view}_intro`);
  await startPlaying(p); await p.waitForTimeout(1500);
  await shot(p, `scr_${view}_playing`);
  await p.evaluate(() => PVM.Game.pause()); await p.waitForTimeout(400);
  await shot(p, `scr_${view}_pause`);
  await p.evaluate(() => PVM.Game.resume()); await p.waitForTimeout(200);
  await p.evaluate(() => { const w = PVM.debug.world; w.hearts = 1; w.invulnT = 0; });
  await forcePinch(p);
  await p.waitForTimeout(500);
  await shot(p, `scr_${view}_nap`);
  await p.waitForFunction(() => PVM.debug.mode === 'over', null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(700);
  await shot(p, `scr_${view}_over`);
  await p.context().close();
}
// put a crab right on Tofu so the world registers a pinch
async function forcePinch(p) {
  await p.evaluate(() => {
    const w = PVM.debug.world, T = w.tofu;
    let c = w.crabs[0];
    if (!c) { w._spawnCrab(); c = w.crabs[0]; }
    c.state = 'chase'; c.stateT = 0; c.x = c.prevX = T.x + 22; c.y = c.prevY = T.y;
  });
}

async function seasons() {
  const p = await newPage('desk', 'mute=1&seed=11&autostart=1&bot=1&diff=normal');
  await startPlaying(p);
  for (let s = 0; s < 4; s++) {
    await p.evaluate(s => { PVM.debug.gotoLevel(s); PVM.Game._setLevelVisuals(s, true); }, s);
    await p.waitForTimeout(6500);
    await shot(p, `season_${s}_play`);
  }
  await p.context().close();
}

// all characters + 4 notes side by side on each season's meadow (crop), plus colour-blind versions
async function lineups() {
  const p = await newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }, 'mute=1&seed=4&autostart=1&diff=easy');
  await startPlaying(p);
  for (let s = 0; s < 4; s++) {
    await p.evaluate(s => { PVM.debug.gotoLevel(s); PVM.Game._setLevelVisuals(s, true); }, s);
    await adv(p, 1.6); await freeze(p);
    await p.evaluate(() => {
      const w = PVM.debug.world;
      w.phase = 'playing';
      const tpl = { z: 0, vx: 0, vy: 0, vz: 0, prevZ: 0, state: 'ground', age: 1, life: 999, src: 'pop' };
      w.notes.length = 0;
      [0, 1, 2, 3].forEach((k, i) => w.notes.push(Object.assign({}, tpl, { id: 900 + i, kind: k, x: 360 + i * 56, y: 470, prevX: 360 + i * 56, prevY: 470 })));
      const T = w.tofu; T.x = T.prevX = 280; T.y = T.prevY = 470; T.state = 'idle'; T.vx = T.vy = 0;
      w.crabs.length = 0; w._spawnCrab(); const c = w.crabs[0]; c.state = 'wander'; c.x = c.prevX = 620; c.y = c.prevY = 472; c.vx = c.vy = 0;
      w.mango = { x: 680, y: 470, z: 0, vz: 0, prevX: 680, prevY: 470, prevZ: 0, age: 1, life: 999 };
      w.hearts = 1;
    });
    await frameWait(p);
    await shot(p, `lineup_${s}`, { clip: await clipOf(p, 230, 390, 500, 110) });
    await cvd(`lineup_${s}`);
  }
  await p.context().close();
}

// y-sorting: Tofu just behind / in front of a palm and the volcano; flying notes over the volcano
async function ysort() {
  const p = await newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }, 'mute=1&seed=4&autostart=1&diff=easy');
  await startPlaying(p); await freeze(p);
  const frames = [], labels = [];
  const place = async (x, y, lab) => {
    await p.evaluate(([x, y]) => { const w = PVM.debug.world, T = w.tofu; T.x = T.prevX = x; T.y = T.prevY = y; T.vx = T.vy = 0; T.state = 'idle'; w.crabs.length = 0; }, [x, y]);
    await adv(p, 0.02);
    labels.push(lab);
  };
  // spring palm at (170,200): collider r18 at (170,192)
  for (const [x, y, l, cx, cy] of [[170, 168, 'behind palm', 90, 60], [170, 226, 'front of palm', 90, 60], [480, 222, 'behind volcano', 340, 120], [480, 392, 'front of volcano', 340, 120]]) {
    await place(x, y, l);
    frames.push(await grab(p, await clipOf(p, cx, cy, 280, 300 - (cy === 60 ? 0 : 0))));
  }
  // eruption over the volcano with Tofu behind it
  await place(480, 222, 'erupt, Tofu behind');
  await p.evaluate(() => { const w = PVM.debug.world; w.volcano.next = 0.001; });
  await adv(p, 1.25);
  frames.push(await grab(p, await clipOf(p, 340, 120, 280, 300)));
  await sheet('ysort', frames, 5, labels);
  await p.context().close();
}

// motion bursts
async function bursts() {
  const p = await newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 2 }, 'mute=1&seed=4&autostart=1&diff=easy');
  await startPlaying(p); await freeze(p);
  const clean = () => p.evaluate(() => { const w = PVM.debug.world; w.crabs.length = 0; w._crabsLeft = 0; w.notes.length = 0; w.mango = null; w.volcano.next = 999; w._mangoT = 999; });
  await clean();

  // 1. walking strip
  await p.evaluate(() => { const T = PVM.debug.world.tofu; T.x = T.prevX = 300; T.y = T.prevY = 470; PVM.debug.setAxis(1, 0); });
  await adv(p, 0.5);
  let f = [];
  for (let i = 0; i < 12; i++) {
    const tx = await p.evaluate(() => PVM.debug.world.tofu.x);
    f.push(await grab(p, await clipOf(p, tx - 50, 380, 100, 110)));
    await adv(p, 1 / 15);
  }
  await p.evaluate(() => PVM.debug.setAxis(0, 0));
  await sheet('burst_walk', f, 12);

  // 2. a note being caught → "+N" (twice for a combo)
  await clean();
  await p.evaluate(() => {
    const w = PVM.debug.world, T = w.tofu; T.x = T.prevX = 360; T.y = T.prevY = 460; T.vx = T.vy = 0;
    const tpl = { z: 0, vx: 0, vy: 0, vz: 0, prevZ: 0, state: 'ground', age: 1, life: 999, src: 'pop' };
    w.notes.push(Object.assign({}, tpl, { id: 801, kind: 1, x: 430, y: 460, prevX: 430, prevY: 460 }));
    w.notes.push(Object.assign({}, tpl, { id: 802, kind: 3, x: 500, y: 460, prevX: 500, prevY: 460 }));
    PVM.debug.setAxis(1, 0);
  });
  f = [];
  for (let i = 0; i < 16; i++) { f.push(await grab(p, await clipOf(p, 300, 300, 300, 200))); await adv(p, 0.07); }
  await p.evaluate(() => PVM.debug.setAxis(0, 0));
  await sheet('burst_catch', f, 8);

  // 3. volcano rumble + eruption, notes in flight, landing rings, bounce
  await clean(); await adv(p, 1.5);
  await p.evaluate(() => { const w = PVM.debug.world, T = w.tofu; T.x = T.prevX = 480; T.y = T.prevY = 480; w.volcano.next = 0.001; });
  f = []; const lab = [];
  for (let i = 0; i < 20; i++) { f.push(await grab(p, await clipOf(p, 180, 60, 600, 470))); lab.push('t=' + (i * 0.12).toFixed(2)); await adv(p, 0.12); }
  await sheet('burst_eruption', f, 5, lab);

  // 4. crab pinch: dizzy stars, Ouch!, heart pop, invulnerability blink
  await clean();
  await p.evaluate(() => { const w = PVM.debug.world, T = w.tofu; T.x = T.prevX = 480; T.y = T.prevY = 470; w.invulnT = 0; w.hearts = 3; w._spawnCrab(); const c = w.crabs[0]; c.state = 'chase'; c.stateT = 0; c.x = c.prevX = 540; c.y = c.prevY = 470; });
  f = [];
  for (let i = 0; i < 18; i++) { f.push(await grab(p, await clipOf(p, 360, 340, 240, 180))); await adv(p, 0.1); }
  await sheet('burst_pinch', f, 9);
  // HUD heart pop during the pinch
  await shot(p, 'burst_pinch_hud', { clip: await clipOf(p, 560, 0, 400, 70) });

  // 5. Coco arriving and swooping to notes
  await clean(); await adv(p, 2.2);
  await p.evaluate(() => {
    const w = PVM.debug.world, T = w.tofu; T.x = T.prevX = 300; T.y = T.prevY = 440;
    const tpl = { z: 0, vx: 0, vy: 0, vz: 0, prevZ: 0, state: 'ground', age: 1, life: 999, src: 'pop' };
    [[420, 380, 0], [360, 250, 2], [200, 330, 1]].forEach(([x, y, k], i) => w.notes.push(Object.assign({}, tpl, { id: 700 + i, kind: k, x, y, prevX: x, prevY: y })));
    w._summonCoco();
  });
  f = []; const lc = [];
  for (let i = 0; i < 16; i++) { f.push(await grab(p, await clipOf(p, 0, 0, 960, 540))); lc.push('t=' + (i * 0.25).toFixed(2)); await adv(p, 0.25); }
  await sheet('burst_coco', f.map(x => x), 4, lc);

  // 6. mango pop + pick-up
  await clean(); await adv(p, 3);
  await p.evaluate(() => { const w = PVM.debug.world, T = w.tofu; T.x = T.prevX = 330; T.y = T.prevY = 450; w.hearts = 1; w.mango = { x: 420, y: 450, z: 0, vz: 200, prevX: 420, prevY: 450, prevZ: 0, age: 0, life: 999 }; w._emit('mangoPop', { x: 420, y: 450 }); });
  f = [];
  for (let i = 0; i < 6; i++) { f.push(await grab(p, await clipOf(p, 270, 330, 240, 170))); await adv(p, 0.08); }
  await p.evaluate(() => PVM.debug.setAxis(1, 0));
  for (let i = 0; i < 10; i++) { f.push(await grab(p, await clipOf(p, 270, 330, 240, 170))); await adv(p, 0.08); }
  await p.evaluate(() => PVM.debug.setAxis(0, 0));
  await sheet('burst_mango', f, 8);
  await shot(p, 'burst_mango_hud', { clip: await clipOf(p, 560, 0, 400, 70) });

  // 7. season clear banner + confetti + crossfade into summer
  await clean(); await adv(p, 0.5);
  await p.evaluate(() => { const w = PVM.debug.world, T = w.tofu; T.x = T.prevX = 480; T.y = T.prevY = 470; w.got = w.goal - 1; const tpl = { z: 0, vx: 0, vy: 0, vz: 0, prevZ: 0, state: 'ground', age: 1, life: 999, src: 'pop' }; w.notes.push(Object.assign({}, tpl, { id: 600, kind: 0, x: 482, y: 470, prevX: 482, prevY: 470 })); w.notes.push(Object.assign({}, tpl, { id: 601, kind: 2, x: 700, y: 300, prevX: 700, prevY: 300 })); });
  f = []; const lb = [];
  for (let i = 0; i < 24; i++) { f.push(await grab(p, await clipOf(p, 0, 0, 960, 540))); lb.push('t=' + (i * 0.2).toFixed(1) + ' ' + await p.evaluate(() => PVM.debug.world.phase)); await adv(p, 0.2); }
  await sheet('burst_clear_crossfade', f, 4, lb);

  // 8. game over nap
  await clean(); await adv(p, 1.5);
  await p.evaluate(() => { const w = PVM.debug.world, T = w.tofu; T.x = T.prevX = 480; T.y = T.prevY = 470; w.hearts = 1; w.invulnT = 0; w._crabsLeft = 1; w._spawnCrab(); const c = w.crabs[0]; c.state = 'chase'; c.x = c.prevX = 500; c.y = c.prevY = 470; });
  f = [];
  for (let i = 0; i < 12; i++) { f.push(await grab(p, await clipOf(p, 0, 0, 960, 540))); await adv(p, 0.2); }
  await sheet('burst_nap', f, 4);
  await p.context().close();
}

// safe-area (simulated iPhone notch insets), portrait letterbox, rotate prompt
async function deviceEdges() {
  let p = await newPage('iphone', 'mute=1&seed=7&autostart=1&bot=1');
  await startPlaying(p); await p.waitForTimeout(2500);
  await shot(p, 'edge_iphone_noinset');
  await p.addStyleTag({ content: '#safeProbe{padding:0 47px 21px 47px !important}#hud{right:53px !important;top:6px !important}.screen{padding:0 47px 21px 47px !important}' });
  await p.evaluate(() => PVM.Game.relayout()); await p.waitForTimeout(600);
  await shot(p, 'edge_iphone_inset47');
  await p.evaluate(() => PVM.Game.pause()); await p.waitForTimeout(300);
  await shot(p, 'edge_iphone_inset47_pause');
  await p.context().close();
  // portrait
  p = await newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }, 'mute=1&seed=7');
  await p.waitForTimeout(2000);
  await shot(p, 'edge_portrait_title');
  await p.click('#btnPlay'); await p.waitForTimeout(1500);
  await shot(p, 'edge_portrait_rotate');
  if (await p.isVisible('#btnRotateOk')) { await p.click('#btnRotateOk'); await p.waitForTimeout(2500); }
  await shot(p, 'edge_portrait_play');
  await p.context().close();
  // iPad portrait
  p = await newPage({ viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }, 'mute=1&seed=7&autostart=1&bot=1');
  await p.waitForTimeout(3500);
  await shot(p, 'edge_ipad_portrait_play');
  await p.context().close();
}

// custom pictures: a photo-like JPEG (hero + meadow) and a transparent PNG (note)
async function customPictures() {
  const imgs = await tool.evaluate(async () => {
    const mk = (w, h, draw, type) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL(type, 0.85); };
    const photo = mk(1200, 900, (g, w, h) => {   // a "dog photo": sky, lawn, a brown blob with eyes, sensor noise
      let gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9cc3e6'); gr.addColorStop(0.55, '#d7e4ee'); gr.addColorStop(0.56, '#5d8a3c'); gr.addColorStop(1, '#3b5e26'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = '#8a5a34'; g.beginPath(); g.ellipse(600, 560, 260, 230, 0, 0, 7); g.fill();
      g.fillStyle = '#6a4024'; g.beginPath(); g.ellipse(420, 400, 70, 140, -0.4, 0, 7); g.fill(); g.beginPath(); g.ellipse(780, 400, 70, 140, 0.4, 0, 7); g.fill();
      g.fillStyle = '#111'; [[520, 520], [680, 520]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 22, 0, 7); g.fill(); });
      g.beginPath(); g.ellipse(600, 620, 40, 28, 0, 0, 7); g.fill();
      const id = g.getImageData(0, 0, w, h); for (let i = 0; i < id.data.length; i += 4) { const n = (Math.random() - 0.5) * 30; id.data[i] += n; id.data[i + 1] += n; id.data[i + 2] += n; } g.putImageData(id, 0, 0);
    }, 'image/jpeg');
    const sticker = mk(400, 400, (g) => {   // a child's star drawing on transparency
      g.lineWidth = 18; g.strokeStyle = '#ff7a00'; g.fillStyle = '#ffd400'; g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, r = i % 2 ? 80 : 180; g.lineTo(200 + Math.cos(a) * r, 200 + Math.sin(a) * r); }
      g.closePath(); g.fill(); g.stroke();
    }, 'image/png');
    return { photo, sticker };
  });
  const jp = path.join(OUT, 'custom_photo.jpg'), pn = path.join(OUT, 'custom_sticker.png');
  fs.writeFileSync(jp, Buffer.from(imgs.photo.split(',')[1], 'base64'));
  fs.writeFileSync(pn, Buffer.from(imgs.sticker.split(',')[1], 'base64'));
  const p = await newPage('desk', 'mute=1&seed=7');
  await p.waitForTimeout(1200);
  await p.click('#btnCustomize'); await p.waitForTimeout(400);
  for (const [i, file] of [[0, jp], [1, pn], [2, jp]]) {
    const btn = p.locator('#slotGrid .slot').nth(i).locator('[data-act=pick]');
    const [fc] = await Promise.all([p.waitForEvent('filechooser'), btn.click()]);
    await fc.setFiles(file);
    await p.waitForTimeout(1500);
  }
  await shot(p, 'custom_screen_filled');
  await p.locator('#scrCustom .btn-back').click(); await p.waitForTimeout(300);
  await p.click('#btnPlay'); await startPlaying(p);
  await p.evaluate(() => PVM.debug.setBot(true, 0.9)); await p.waitForTimeout(4000);
  await shot(p, 'custom_play');
  await p.evaluate(s => { PVM.debug.gotoLevel(3); PVM.Game._setLevelVisuals(3, true); }); await p.waitForTimeout(4000);
  await shot(p, 'custom_play_winter');
  await p.context().close();
}

server.listen(0, async () => {
  base = 'http://127.0.0.1:' + server.address().port + '/';
  browser = await chromium.launch();
  tool = await (await browser.newContext()).newPage();
  const only = process.env.ONLY ? process.env.ONLY.split(',') : null;
  const jobs = { screens: async () => { for (const v of Object.keys(VIEWS)) await screens(v); }, seasons, lineups, ysort, bursts, deviceEdges, customPictures };
  for (const [k, fn] of Object.entries(jobs)) {
    if (only && !only.includes(k)) continue;
    const t0 = Date.now();
    try { await fn(); log('OK   ' + k + ' (' + ((Date.now() - t0) / 1000).toFixed(1) + ' s)'); }
    catch (e) { log('FAIL ' + k + ': ' + (e && e.stack || e)); }
  }
  log(errors.length ? 'console errors: ' + errors.slice(0, 5).join(' | ') : 'no console errors');
  await browser.close(); server.close();
  log('frames in ' + OUT);
});
