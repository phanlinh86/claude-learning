// Visual QA capture: every screen at 4 sizes, every zone mid-play, zone crossfade, motion contact sheets
// (frame-exact, 50 ms apart, by stepping the game by hand), custom pictures, colour-blind simulations,
// and a numeric "does any overlay cover Biscuit" check. Output: tests/out/visual/*.png + overlap.json.
// Run: node tests/visual/capture.js   (uses the installed Chromium; never runs `playwright install`)
const { chromium, devices } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const BASE = '?mute=1&adaptive=0&seed=7';
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));

const SIZES = {
  desk: { viewport: { width: 1280, height: 720 } },
  iphone: devices['iPhone 13 landscape'],
  ipadL: devices['iPad Pro 11 landscape'],
  ipadP: devices['iPad Pro 11']
};

async function open(b, size, q) {
  const ctx = await b.newContext({ ...SIZES[size] });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(size + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(size + ' console: ' + m.text()); });
  await p.goto(GAME + BASE + (q || ''));
  await p.waitForFunction(() => window.BKF && BKF.debug && BKF.debug.mode !== 'boot' && BKF.debug.world, null, { timeout: 15000 });
  await sleep(600);
  return p;
}
const shot = (p, name, opt) => p.screenshot({ path: OUT + '/' + name + '.png', ...(opt || {}) });

// freeze the real-time loop and advance the game by hand: n × 50 ms (stepped at 1/60 s like main.js)
async function freeze(p) { await p.evaluate(() => BKF.debug.setSpeed(0)); await sleep(60); }
async function adv(p, ms) {
  await p.evaluate(ms => {
    const G = BKF.Game, n = Math.round(ms / (1000 / 120));
    for (let i = 0; i < n; i++) G.step(1 / 120);
    G.renderer.update(ms / 1000);
  }, ms);
  await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
}
// css-pixel clip around Biscuit (logical box w×h centred on the pup + offset)
async function pupClip(p, w, h, dx, dy) {
  return p.evaluate(([w, h, dx, dy]) => {
    const R = BKF.Game.renderer, pu = BKF.debug.world.pup, s = R.cssScale;
    let x = (pu.x + dx - w / 2 + R.ox) * s, y = (pu.y + dy - h / 2 + R.oy) * s;
    x = Math.max(0, x); y = Math.max(0, y);
    return { x, y, width: Math.min(w * s, innerWidth - x), height: Math.min(h * s, innerHeight - y) };
  }, [w, h, dx || 0, dy || 0]);
}

// compose a contact sheet from PNG buffers (in a blank page)
let tool;
async function sheet(name, bufs, labels, cols) {
  cols = cols || Math.min(bufs.length, 4);
  const imgs = bufs.map((b, i) => `<figure><img src="data:image/png;base64,${b.toString('base64')}"><figcaption>${labels ? labels[i] : i}</figcaption></figure>`).join('');
  await tool.setContent(`<style>body{margin:0;background:#222;font:14px sans-serif;color:#eee}
    .g{display:grid;grid-template-columns:repeat(${cols},auto);gap:6px;padding:6px;width:max-content}
    figure{margin:0}img{display:block;max-width:${cols > 3 ? 420 : 560}px}figcaption{padding:2px 4px}</style><div class="g">${imgs}</div>`);
  await tool.waitForFunction(() => [...document.images].every(i => i.complete));
  const el = await tool.$('.g');
  await el.screenshot({ path: OUT + '/' + name + '.png' });
}
// colour-blind simulation (Machado 2009, severity 1.0) on a PNG buffer, in linear RGB
const CB = {
  deutan: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  protan: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998]
};
async function cbSim(buf, kind, name) {
  const out = await tool.evaluate(async ([b64, M]) => {
    const im = new Image(); im.src = 'data:image/png;base64,' + b64; await im.decode();
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
    const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    const lin = v => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    const srgb = v => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };
    const T = new Float32Array(256); for (let i = 0; i < 256; i++) T[i] = lin(i);
    for (let i = 0; i < a.length; i += 4) {
      const r = T[a[i]], gg = T[a[i + 1]], bb = T[a[i + 2]];
      a[i] = srgb(M[0] * r + M[1] * gg + M[2] * bb); a[i + 1] = srgb(M[3] * r + M[4] * gg + M[5] * bb); a[i + 2] = srgb(M[6] * r + M[7] * gg + M[8] * bb);
    }
    g.putImageData(d, 0, 0); return c.toDataURL('image/png').split(',')[1];
  }, [buf.toString('base64'), CB[kind]]);
  const ob = Buffer.from(out, 'base64'); fs.writeFileSync(OUT + '/' + name + '.png', ob); return ob;
}

async function playBot(p, skill) { await p.evaluate(s => { BKF.debug.setBot(true, s); }, skill == null ? 1 : skill); }
async function gotoZone(p, z, lt) {
  await p.evaluate(([z, lt]) => { BKF.debug.gotoLevel(z); BKF.debug.world.levelT = lt; }, [z, lt]);
}

const ONLY = process.env.ONLY || '';
const run = k => !ONLY || ONLY.split(',').includes(k);
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  tool = await (await b.newContext({ viewport: { width: 1800, height: 1200 } })).newPage();

  // ---------------------------------------------------------------- 1. screens × sizes
  if (run('screens')) for (const size of Object.keys(SIZES)) {
    let p = await open(b, size);
    await sleep(3000); await shot(p, `scr_${size}_title`);
    for (const [id, nm] of [['scrHow', 'how'], ['scrSettings', 'settings'], ['scrCustom', 'custom']]) {
      await p.evaluate(id => BKF.UI.open(id, 'scrTitle'), id); await sleep(400); await shot(p, `scr_${size}_${nm}`);
      await p.evaluate(() => BKF.UI.show('scrTitle'));
    }
    await p.close();
    p = await open(b, size, '&autostart=1&diff=easy');
    await sleep(700); await shot(p, `scr_${size}_ready`);
    await p.evaluate(() => { BKF.debug.world.flap(); }); await playBot(p, 1);
    await sleep(4500); await shot(p, `scr_${size}_playing`);
    await p.evaluate(() => BKF.Game.pause()); await sleep(400); await shot(p, `scr_${size}_pause`);
    await p.evaluate(() => BKF.Game.resume());
    await p.evaluate(() => { BKF.debug.setBot(false); const w = BKF.debug.world; w.batteries = 1; w.pup.hurtT = 0; w.pup.y = 455; w.pup.vy = 400; });
    await p.waitForFunction(() => BKF.debug.mode === 'over', null, { timeout: 15000 }).catch(() => errs.push(size + ': no game over'));
    await sleep(900); await shot(p, `scr_${size}_over`);
    await p.close();
  }
  // rotate card: phone held upright
  if (run('screens')) {
    const ctx = await b.newContext({ ...devices['iPhone 13'] });
    const p = await ctx.newPage(); p.on('pageerror', e => errs.push('rot: ' + e));
    await p.goto(GAME + BASE + '&autostart=1'); await p.waitForFunction(() => BKF.debug && BKF.debug.mode === 'ready');
    await sleep(800); await shot(p, 'scr_iphoneP_rotate');
    await p.click('#btnRotateOk'); await sleep(600); await shot(p, 'scr_iphoneP_upright_ready');
    await ctx.close();
  }

  // ---------------------------------------------------------------- 2. zones mid-play, night, crossfade
  if (run('zones')) for (const size of ['desk', 'iphone', 'ipadP']) {
    const p = await open(b, size, '&autostart=1&diff=easy');
    await p.evaluate(() => BKF.debug.world.flap()); await playBot(p, 1); await sleep(3500);
    const plan = [[0, 25], [1, 25], [2, 25], [3, 20], [3, 35], [3, 50]];
    for (const [z, lt] of plan) {
      await gotoZone(p, z, lt); await sleep(2600);
      await p.evaluate(lt => { BKF.debug.world.levelT = Math.max(BKF.debug.world.levelT, lt); }, lt); await sleep(500);
      const buf = await shot(p, `zone${z}_${size}_t${lt}`);
      const d = await p.evaluate(() => BKF.debug.world.darkness);
      if (size === 'desk') console.log('zone', z, 'levelT', lt, 'darkness', d.toFixed(3));
      if (size === 'desk') { await cbSim(buf, 'deutan', `cb_deutan_zone${z}_t${lt}`); await cbSim(buf, 'protan', `cb_protan_zone${z}_t${lt}`); }
    }
    if (size === 'desk') {
      // crossfades 0→1 and 2→3
      for (const [from, to] of [[0, 1], [2, 3]]) {
        await gotoZone(p, from, 20); await sleep(2500);
        await p.evaluate(to => BKF.debug.gotoLevel(to), to);
        const t0 = Date.now(), bufs = [];
        for (const ms of [300, 800, 1300]) { await sleep(Math.max(0, ms - (Date.now() - t0))); bufs.push(await p.screenshot()); }
        await sheet(`xfade_${from}to${to}`, bufs, ['0.3 s', '0.8 s', '1.3 s'], 3);
      }
    }
    await p.close();
  }

  // ---------------------------------------------------------------- 3. motion bursts (frame-exact, 50 ms)
  if (run('motion')) {
    const p = await open(b, 'desk', '&autostart=1&diff=easy');
    await p.evaluate(() => BKF.debug.world.flap()); await playBot(p, 1); await sleep(4000);
    // a) puff
    await p.evaluate(() => { BKF.debug.setBot(false); const w = BKF.debug.world; w.obstacles.length = 0; w.pup.y = 280; w.pup.vy = 120; });
    await freeze(p); await adv(p, 300);
    let bufs = [], lab = [];
    await p.evaluate(() => BKF.debug.world.flap());
    for (let i = 0; i < 10; i++) { await adv(p, i ? 50 : 0); bufs.push(await p.screenshot({ clip: await pupClip(p, 240, 240, 10, -20) })); lab.push((i * 50) + ' ms'); }
    await sheet('motion_puff', bufs, lab, 5);
    // b) leaf pickup
    await p.evaluate(() => { const w = BKF.debug.world, pu = w.pup; pu.y = 280; pu.vy = 0;
      const l = w.leaves[0]; if (!l) return 'noleaf';
      Object.assign(l, { x: pu.x + 34, prevX: pu.x + 34, y: pu.y + 4, prevY: pu.y + 4 }); pu.vy = 0; });
    await adv(p, 0); bufs = [await p.screenshot({ clip: await pupClip(p, 520, 420, 120, -80) })]; lab = ['before'];
    for (let i = 1; i < 10; i++) { await adv(p, 50); if (i % 1 === 0) { bufs.push(await p.screenshot({ clip: await pupClip(p, 520, 420, 120, -80) })); lab.push(i * 50 + ' ms'); } }
    await sheet('motion_leaf', bufs, lab, 5);
    // whole-frame view of the leaf flyer reaching the score
    // c) bump into a stack (shake, blink, Bonk!)
    await adv(p, 1500);
    await p.evaluate(() => { const w = BKF.debug.world, pu = w.pup; pu.hurtT = 0; pu.y = 420; pu.vy = 0;
      const o = w.obstacles.find(o => o.kind === 'stack') || w.obstacles.find(o => o.kind === 'hang');
      if (o) { o.x = pu.x + 45; o.prevX = o.x; } });
    bufs = []; lab = [];
    for (let i = 0; i < 12; i++) { await adv(p, i ? 50 : 0); bufs.push(await p.screenshot({ clip: { x: 0, y: 120, width: 900, height: 600 } })); lab.push(i * 50 + ' ms'); }
    await sheet('motion_bump', bufs, lab, 4);
    // later blink frames
    bufs = []; lab = [];
    for (let i = 0; i < 8; i++) { await adv(p, 100); bufs.push(await p.screenshot({ clip: await pupClip(p, 260, 240, 0, -20) })); lab.push(650 + i * 100 + ' ms'); }
    await sheet('motion_bump_blink', bufs, lab, 4);
    // d) counter bounce
    await adv(p, 1600);
    await p.evaluate(() => { const w = BKF.debug.world, pu = w.pup; w.obstacles.length = 0; w.batteries = 3; w.phase = 'playing'; pu.hurtT = 0; pu.y = 430; pu.vy = 380; });
    bufs = []; lab = [];
    for (let i = 0; i < 12; i++) { await adv(p, 50); bufs.push(await p.screenshot({ clip: { x: 100, y: 300, width: 700, height: 420 } })); lab.push((i + 1) * 50 + ' ms'); }
    await sheet('motion_counter', bufs, lab, 4);
    // e) power-down and game over
    await adv(p, 1600);
    await p.evaluate(() => { const w = BKF.debug.world, pu = w.pup; w.obstacles.length = 0; w.batteries = 1; pu.hurtT = 0; pu.y = 430; pu.vy = 380; });
    bufs = []; lab = [];
    for (let i = 0; i < 12; i++) { await adv(p, 150); bufs.push(await p.screenshot({ clip: { x: 0, y: 0, width: 1280, height: 720 } })); lab.push((i + 1) * 150 + ' ms ' + (await p.evaluate(() => BKF.debug.world.phase + '/' + BKF.debug.mode))); }
    await sheet('motion_powerdown', bufs, lab, 4);
    await p.evaluate(() => BKF.debug.setSpeed(1)); await sleep(1200); await shot(p, 'motion_powerdown_end');
    await p.close();
  }
  // f) wind gust + g) kettle steam
  if (run('motion') || run('kettle')) {
    const p = await open(b, 'desk', '&autostart=1&diff=easy');
    await p.evaluate(() => BKF.debug.world.flap()); await playBot(p, 1); await sleep(3000);
    await gotoZone(p, 2, 10); await sleep(2500);
    await freeze(p);
    await p.evaluate(() => { const w = BKF.debug.world; w.wind.phase = 'calm'; w.wind.nextT = 1.0; });
    let bufs = [], lab = [];
    for (let i = 0; i < 16; i++) { await adv(p, 250); bufs.push(await p.screenshot()); lab.push((i + 1) * 250 + ' ms ' + (await p.evaluate(() => BKF.debug.world.wind.phase + ' k=' + (BKF.debug.world.wind.k || 0).toFixed(2) + ' ' + BKF.debug.world.wind.dir))); }
    await sheet('motion_gust', bufs, lab, 4);
    fs.writeFileSync(OUT + '/gust_peak.png', bufs[7]);
    // kettle: rainy zone, wait for one to be on screen
    await p.evaluate(() => BKF.debug.setSpeed(2)); await gotoZone(p, 1, 5);
    await p.waitForFunction(() => BKF.debug.world.obstacles.some(o => o.kind === 'kettle' && o.x > 380 && o.x < 760), null, { timeout: 90000, polling: 50 }).catch(() => errs.push('no kettle seen'));
    await freeze(p); bufs = []; lab = [];
    for (let i = 0; i < 8; i++) { await adv(p, 100); bufs.push(await p.screenshot({ clip: { x: 200, y: 0, width: 1080, height: 720 } })); lab.push((i + 1) * 100 + ' ms'); }
    await sheet('motion_kettle', bufs, lab, 4);
    // same kettle at night (glow rims)
    await p.evaluate(() => BKF.debug.setSpeed(1));
    await p.close();
  }

  // ---------------------------------------------------------------- 4. custom pictures (via Change Pictures + file chooser)
  if (run('custom')) {
    const p = await open(b, 'desk');
    // generate a photo-like opaque PNG, a transparent cut-out and a wall photo
    const pics = await p.evaluate(() => {
      const mk = (w, h, fn) => { const c = document.createElement('canvas'); c.width = w; c.height = h; fn(c.getContext('2d'), w, h); return c.toDataURL('image/png').split(',')[1]; };
      const photo = mk(640, 480, (g, w, h) => {   // "photo": sky/grass gradient, a brown dog-ish blob, noise
        let gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#9cc7e8'); gr.addColorStop(0.6, '#d9e6c8'); gr.addColorStop(1, '#6b8f4a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
        g.fillStyle = '#8a5a34'; g.beginPath(); g.ellipse(320, 280, 170, 140, 0, 0, 7); g.fill();
        g.fillStyle = '#5a3a20'; g.beginPath(); g.ellipse(190, 190, 50, 90, -0.4, 0, 7); g.fill(); g.beginPath(); g.ellipse(450, 190, 50, 90, 0.4, 0, 7); g.fill();
        g.fillStyle = '#111'; [[260, 250], [380, 250]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 16, 0, 7); g.fill(); });
        g.beginPath(); g.ellipse(320, 320, 28, 20, 0, 0, 7); g.fill();
        const d = g.getImageData(0, 0, w, h); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 30; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0);
      });
      const cut = mk(400, 400, (g) => {   // transparent cut-out: a yellow cat-ish sticker / leaf
        g.fillStyle = '#f2c230'; g.strokeStyle = '#8a5a00'; g.lineWidth = 10;
        g.beginPath(); g.moveTo(80, 120); g.lineTo(120, 30); g.lineTo(170, 100); g.lineTo(230, 100); g.lineTo(280, 30); g.lineTo(320, 120);
        g.quadraticCurveTo(380, 300, 200, 370); g.quadraticCurveTo(20, 300, 80, 120); g.closePath(); g.fill(); g.stroke();
        g.fillStyle = '#222'; g.beginPath(); g.arc(150, 190, 18, 0, 7); g.arc(250, 190, 18, 0, 7); g.fill();
      });
      const wall = mk(1600, 900, (g, w, h) => {   // a busy family-room photo: stripes, frames, a window
        for (let x = 0; x < w; x += 80) { g.fillStyle = (x / 80) % 2 ? '#c96f5a' : '#e9b9a4'; g.fillRect(x, 0, 80, h); }
        g.fillStyle = '#4c6a8a'; g.fillRect(500, 150, 600, 380); g.fillStyle = '#fff'; g.fillRect(790, 150, 20, 380); g.fillRect(500, 330, 600, 20);
        g.fillStyle = '#3d2a1c'; g.fillRect(0, 700, w, 200);
        for (let i = 0; i < 6; i++) { g.fillStyle = ['#2b5', '#e44', '#36c', '#fb0', '#a3c', '#0aa'][i]; g.fillRect(80 + i * 250, 600, 120, 100); }
      });
      return { photo, cut, wall };
    });
    for (const k of Object.keys(pics)) fs.writeFileSync(OUT + '/in_' + k + '.png', Buffer.from(pics[k], 'base64'));
    await p.evaluate(() => BKF.UI.open('scrCustom', 'scrTitle')); await sleep(300);
    const choose = async (idx, file) => {
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.locator('#slotGrid .slot').nth(idx).locator('[data-act=pick]').click()]);
      await fc.setFiles(OUT + '/' + file);
      await p.waitForFunction(i => BKF.Assets.hasCustom(BKF.Assets.SLOTS[i].id), idx, { timeout: 8000 }).catch(() => errs.push('custom slot ' + idx + ' not applied'));
      await sleep(400);
    };
    await choose(0, 'in_photo.png'); await choose(1, 'in_cut.png');
    await shot(p, 'custom_screen_2pics');
    await p.locator('.btn-back').last().click(); await sleep(200);
    await p.evaluate(() => BKF.Game.startGame()); await sleep(600); await shot(p, 'custom_ready_photo_pup');
    await p.evaluate(() => BKF.debug.world.flap()); await playBot(p, 1); await sleep(4500); await shot(p, 'custom_play_photo_pup');
    await gotoZone(p, 3, 40); await sleep(3000); await shot(p, 'custom_play_night');
    // cut-out pup + wall
    await p.evaluate(() => BKF.Game.pause()); await p.evaluate(() => BKF.Game.toTitle());
    await p.evaluate(() => BKF.UI.open('scrCustom', 'scrTitle')); await sleep(300);
    await choose(0, 'in_cut.png'); await choose(2, 'in_wall.png');
    await shot(p, 'custom_screen_3pics');
    await p.locator('.btn-back').last().click(); await sleep(200);
    await p.evaluate(() => BKF.Game.startGame()); await p.evaluate(() => BKF.debug.world.flap()); await playBot(p, 1);
    await sleep(4500); await shot(p, 'custom_play_wall_cut');
    for (const z of [1, 2, 3]) { await gotoZone(p, z, z === 3 ? 40 : 20); await sleep(2800); await shot(p, 'custom_wall_zone' + z); }
    // iPhone with custom wall (cover crop)
    await p.close();
  }

  // ---------------------------------------------------------------- 5. overlay-vs-Biscuit numeric check + HUD close-ups
  const overlap = {};
  if (run('hud')) for (const size of ['desk', 'iphone', 'ipadP']) {
    const p = await open(b, size, '&autostart=1&diff=easy');
    await sleep(500);
    const r = await p.evaluate(() => {
      const R = BKF.Game.renderer, w = BKF.debug.world, g = R.g, pu = w.pup;
      const F = s => '900 ' + s + 'px "Arial Rounded MT Bold","Segoe UI Black","Trebuchet MS",system-ui,sans-serif';
      const box = (txt, x, y, s) => { g.font = F(s); const m = g.measureText(txt).width + s * 0.22; return [x - m / 2, y - s * 0.6, x + m / 2, y + s * 0.6]; };
      const pupBox = [pu.x - 52, pu.y - 64, pu.x + 52, pu.y + 40];   // sprite incl. propeller, body ±52
      const touch = BKF.Game.isTouch;
      const items = {
        ready: box(touch ? 'Tap to fly!' : 'Tap, click or Space to fly!', 560, 330, 34),
        readySub: box('Catch the herb leaves, dodge the pots!', 560, 374, 20),
        banner: box('Sunny Morning', 600, 150, 44), bannerLong: box('Windy Sunset', 600, 150, 44),
        score: box('888', 480, 12 - R.oy + 26, 48)
      };
      const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
      // pup range: ready hover y and full flight band 52..442
      const res = { pupReady: pupBox, items };
      for (const k in items) { res[k + '_vsReady'] = hit(items[k], pupBox); res[k + '_vsBand'] = hit(items[k], [pu.x - 52, 24, pu.x + 52, 470]); }
      return res;
    });
    overlap[size] = r;
    await p.close();
  }
  if (run('hud')) fs.writeFileSync(OUT + '/overlap.json', JSON.stringify(overlap, null, 1));
  // HUD close-up with a missing battery (desk + iphone), and colour-blind sims of the HUD
  if (run('hud')) for (const size of ['desk', 'iphone']) {
    const p = await open(b, size, '&autostart=1&diff=easy');
    await p.evaluate(() => BKF.debug.world.flap()); await playBot(p, 1); await sleep(3500);
    await p.evaluate(() => { BKF.debug.world.batteries = 2; });
    await sleep(400);
    const vp = p.viewportSize();
    const buf = await p.screenshot({ clip: { x: 0, y: 0, width: vp.width, height: Math.round(vp.height * 0.25) } });
    fs.writeFileSync(OUT + `/hud_${size}.png`, buf);
    await cbSim(buf, 'deutan', `cb_deutan_hud_${size}`); await cbSim(buf, 'protan', `cb_protan_hud_${size}`);
    await p.evaluate(() => { BKF.debug.world.batteries = 1; }); await sleep(250);
    await p.screenshot({ path: OUT + `/hud_${size}_low.png`, clip: { x: 0, y: 0, width: vp.width, height: Math.round(vp.height * 0.25) } });
    // night HUD
    await gotoZone(p, 3, 45); await sleep(2800);
    await p.screenshot({ path: OUT + `/hud_${size}_night.png`, clip: { x: 0, y: 0, width: vp.width, height: Math.round(vp.height * 0.25) } });
    await p.close();
  }

  await b.close();
  console.log(errs.length ? 'ERRORS\n' + errs.join('\n') : 'no page errors');
  console.log('wrote', fs.readdirSync(OUT).length, 'files to', OUT);
})().catch(e => { console.error(e); process.exit(1); });
