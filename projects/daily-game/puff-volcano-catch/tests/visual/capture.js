// Visual QA capture: every screen at 3 viewports, gameplay per zone, zone crossfade, motion contact sheets,
// colour-blind / greyscale lineups and custom pictures. Output: tests/out/visual/*.png
// Run: node tests/visual/capture.js   (needs the preinstalled Playwright chromium)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual');
const FIX = path.join(OUT, 'fixtures');
fs.mkdirSync(FIX, { recursive: true });

const VIEWPORTS = {
  '1280': { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  '1920': { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 },
  'iphone': { viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }
};
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, name, opts) => { await p.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, opts || {})); console.log('  ' + name); };

async function open(b, vp, q) {
  const ctx = await b.newContext(VIEWPORTS[vp]);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(vp + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(vp + ': ' + String(e)));
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.VC && VC.debug && VC.debug.mode !== 'boot', null, { timeout: 15000 });
  return { ctx, p };
}

// ---------- in-page helpers (installed once per page) ----------
async function installHelpers(p) {
  await p.evaluate(() => {
    const G = VC.Game;
    window.QA = {
      // advance the simulation by `t` game-seconds deterministically (game speed must be 0)
      advance(t) {
        const h = 1 / 120; let n = Math.round(t / h);
        while (n-- > 0) { G.step(h); G.renderer.update(h); }
      },
      noEruptions() { const w = G.world; w._nextLaunch = 1e9; w._rumbling = false; w._plan = null; w.volcano.rumble = 0; },
      clearItems() { G.world.items.length = 0; G.renderer.fx.length = 0; G.renderer.texts.length = 0; },
      spawn(kind, metal, x, y, vx, vy, extra) {
        const w = G.world, c = w.cfg;
        const it = Object.assign({ id: w._nextId++, kind, metal: kind === 'coin' ? metal : null, value: kind === 'coin' ? c.coinValue[metal] : 0,
          x, y, vx, vy, _px: x, _py: y, rot: 0.4, spin: 0, r: kind === 'rock' ? c.rockR : c.coinR[metal], state: 'fly', t: 0, alpha: 1,
          tx: x, tCross: w.time + 1, apexY: y, fair: true, variant: 0, _w: kind === 'rock' ? 3 : 9, _bounces: 0, _off: 0 }, extra || {});
        w.items.push(it); return it.id;
      },
      // pointer-follow target (works with the bot off)
      target(x) { G.renderer.pointer = [x, 400]; G._mouseFollow = true; },
      puff() { const p = G.world.puff; return { x: p.x, rimX: p.rimX, y: p.y }; },
      canvasRect() { const r = document.getElementById('game').getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height }; }
    };
  });
}
async function clipL(p, x, y, w, h) {
  const r = await p.evaluate(() => QA.canvasRect());
  const k = r.width / 960;
  x = Math.max(0, Math.min(960 - w, x)); y = Math.max(0, Math.min(540 - h, y));
  return { x: r.left + x * k, y: r.top + y * k, width: w * k, height: h * k };
}
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

async function freezeInPlay(p, level) {
  await p.evaluate(l => { VC.debug.setBot(false); VC.debug.setSpeed(1); if (l != null) VC.debug.gotoLevel(l); }, level);
  await sleep(2200);  // let the banner and the crossfade finish in real time
  await p.evaluate(() => { VC.debug.setSpeed(0); QA.noEruptions(); QA.clearItems(); });
}

// frames: [{label, before: fn-string evaluated before shot}], dt: game seconds between frames
async function burst(b, p, name, { frames = 8, dt = 0.05, region, setup, title }) {
  const imgs = [];
  if (setup) await p.evaluate(setup);
  for (let i = 0; i < frames; i++) {
    if (i) await p.evaluate(t => QA.advance(t), dt);
    await raf(p);
    const clip = typeof region === 'function' ? await region() : await clipL(p, ...region);
    imgs.push((await p.screenshot({ clip })).toString('base64'));
  }
  // contact sheet
  const cp = await b.newPage({ viewport: { width: 1600, height: 400 } });
  const cols = 4;
  await cp.setContent(`<html><body style="margin:0;background:#222;font:600 14px system-ui;color:#fff">
    <div style="padding:8px 12px;font-size:18px">${title || name} — ${frames} frames, ${Math.round(dt * 1000)} ms game-time apart</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">
    ${imgs.map((d, i) => `<div style="position:relative"><img style="width:100%;display:block" src="data:image/png;base64,${d}"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 5px;border-radius:4px">#${i} +${Math.round(i * dt * 1000)}ms</span></div>`).join('')}
    </div></body></html>`);
  await shot(cp, name, { fullPage: true });
  await cp.close();
}

// ---------- fixtures: photo-like JPEGs and transparent PNGs drawn on a canvas ----------
async function makeFixtures(p) {
  const data = await p.evaluate(() => {
    const out = {};
    const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
    let s = 12345; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
    // 1) photo-like landscape (bright sky, white clouds, green field, a white house): stress test for white Puff
    {
      const [c, g] = mk(1600, 1000);
      let gr = g.createLinearGradient(0, 0, 0, 600); gr.addColorStop(0, '#6aa8e8'); gr.addColorStop(1, '#e8f2ff'); g.fillStyle = gr; g.fillRect(0, 0, 1600, 1000);
      for (let i = 0; i < 14; i++) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.ellipse(rnd() * 1600, 120 + rnd() * 380, 80 + rnd() * 160, 30 + rnd() * 50, 0, 0, 7); g.fill(); }
      gr = g.createLinearGradient(0, 600, 0, 1000); gr.addColorStop(0, '#6fae3a'); gr.addColorStop(1, '#2f5a1c'); g.fillStyle = gr; g.fillRect(0, 600, 1600, 400);
      g.fillStyle = '#f4f1ea'; g.fillRect(900, 470, 300, 220); g.fillStyle = '#b8442c'; g.beginPath(); g.moveTo(880, 480); g.lineTo(1050, 360); g.lineTo(1220, 480); g.fill();
      g.fillStyle = '#d8c070'; g.beginPath(); g.ellipse(400, 760, 260, 40, 0, 0, 7); g.fill();   // gold-ish sand patch (coin camouflage)
      const id = g.getImageData(0, 0, 1600, 1000), d = id.data;
      for (let i = 0; i < d.length; i += 4) { const n = (rnd() - .5) * 26; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
      g.putImageData(id, 0, 0);
      out.photo_day = c.toDataURL('image/jpeg', 0.85);
    }
    // 2) dark photo-like night city (for crater)
    {
      const [c, g] = mk(1280, 960);
      const gr = g.createLinearGradient(0, 0, 0, 960); gr.addColorStop(0, '#0b1030'); gr.addColorStop(1, '#2a1a3a'); g.fillStyle = gr; g.fillRect(0, 0, 1280, 960);
      for (let i = 0; i < 40; i++) { const x = rnd() * 1280, w = 40 + rnd() * 90, h = 150 + rnd() * 420; g.fillStyle = '#15182a'; g.fillRect(x, 960 - h, w, h);
        for (let k = 0; k < 20; k++) { g.fillStyle = rnd() < .5 ? '#ffd56a' : '#ff9a4a'; g.fillRect(x + rnd() * w, 960 - rnd() * h, 6, 8); } }
      out.photo_night = c.toDataURL('image/jpeg', 0.85);
    }
    // 3) opaque portrait photo (pet-like face) for the coin slot -> should become a round sticker
    {
      const [c, g] = mk(600, 800);
      g.fillStyle = '#7a8c5a'; g.fillRect(0, 0, 600, 800);
      g.fillStyle = '#c98a4a'; g.beginPath(); g.ellipse(300, 420, 210, 240, 0, 0, 7); g.fill();
      g.fillStyle = '#9a6030'; g.beginPath(); g.ellipse(140, 230, 70, 120, -0.4, 0, 7); g.ellipse(460, 230, 70, 120, 0.4, 0, 7); g.fill();
      g.fillStyle = '#222'; g.beginPath(); g.arc(230, 380, 26, 0, 7); g.arc(370, 380, 26, 0, 7); g.fill();
      g.fillStyle = '#3a2416'; g.beginPath(); g.ellipse(300, 480, 40, 28, 0, 0, 7); g.fill();
      out.portrait = c.toDataURL('image/jpeg', 0.88);
    }
    // 4) transparent PNG cut-out character (child's drawing style) for the hero
    {
      const [c, g] = mk(512, 512);
      g.lineWidth = 10; g.strokeStyle = '#2a2a6a'; g.fillStyle = '#ff7ab6';
      g.beginPath(); g.arc(256, 280, 170, 0, 7); g.fill(); g.stroke();
      g.fillStyle = '#ff7ab6'; g.beginPath(); g.moveTo(120, 170); g.lineTo(150, 40); g.lineTo(220, 120); g.fill(); g.stroke();
      g.beginPath(); g.moveTo(392, 170); g.lineTo(362, 40); g.lineTo(292, 120); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.beginPath(); g.arc(200, 260, 34, 0, 7); g.arc(312, 260, 34, 0, 7); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(205, 265, 15, 0, 7); g.arc(317, 265, 15, 0, 7); g.fill();
      g.strokeStyle = '#2a2a6a'; g.beginPath(); g.arc(256, 330, 50, 0.2, Math.PI - 0.2); g.stroke();
      out.hero_png = c.toDataURL('image/png');
    }
    // 5) transparent PNG rock (grey-green blob, low contrast on purpose)
    {
      const [c, g] = mk(256, 256);
      g.fillStyle = '#6a7a6a'; g.strokeStyle = '#3a4a3a'; g.lineWidth = 8;
      g.beginPath(); g.moveTo(40, 150); g.quadraticCurveTo(50, 50, 140, 50); g.quadraticCurveTo(230, 60, 220, 160); g.quadraticCurveTo(200, 230, 120, 220); g.quadraticCurveTo(40, 215, 40, 150); g.fill(); g.stroke();
      out.rock_png = c.toDataURL('image/png');
    }
    return out;
  });
  const files = {};
  for (const [k, v] of Object.entries(data)) {
    const ext = v.startsWith('data:image/png') ? 'png' : 'jpg';
    const f = path.join(FIX, k + '.' + ext);
    fs.writeFileSync(f, Buffer.from(v.split(',')[1], 'base64'));
    files[k] = f;
  }
  return files;
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ===== 1. Screens at every viewport =====
  for (const vp of Object.keys(VIEWPORTS)) {
    console.log('screens @' + vp);
    let { ctx, p } = await open(b, vp);
    await sleep(2500);
    await shot(p, `screen_title_${vp}`);
    for (const [id, nm] of [['scrHow', 'how'], ['scrSettings', 'settings'], ['scrCustom', 'custom']]) {
      await p.evaluate(i => VC.UI.open(i, 'scrTitle'), id); await sleep(700);
      await shot(p, `screen_${nm}_${vp}`);
    }
    await ctx.close();
    ({ ctx, p } = await open(b, vp, '&autostart=1&bot=1'));
    await installHelpers(p);
    await sleep(1000); await shot(p, `play_banner_${vp}`);
    await sleep(4500); await shot(p, `play_zone0_${vp}`);
    await p.evaluate(() => VC.Game.pause()); await sleep(600);
    await shot(p, `screen_pause_${vp}`);
    await p.evaluate(() => VC.Game.resume()); await sleep(2500);
    await p.evaluate(() => VC.Game.gameOver()); await sleep(1200);
    await shot(p, `screen_over_${vp}`);
    await ctx.close();
  }

  // ===== 2. Gameplay in all 4 zones with the bot (1280 + iPhone), + debug overlay once =====
  for (const vp of ['1280', 'iphone']) {
    for (let lv = 0; lv < 4; lv++) {
      const { ctx, p } = await open(b, vp, `&autostart=1&bot=1&level=${lv}`);
      await sleep(lv === 0 ? 6000 : 7500);
      await shot(p, `zone${lv}_play_${vp}`);
      await sleep(1500);
      await shot(p, `zone${lv}_play_${vp}_b`);
      await ctx.close();
    }
  }
  {
    const { ctx, p } = await open(b, '1280', '&autostart=1&bot=1&level=2&debug=1');
    await sleep(6000); await shot(p, 'zone2_debug_1280'); await ctx.close();
  }

  // ===== 3. Zone crossfade mid-transition =====
  {
    console.log('crossfade');
    const { ctx, p } = await open(b, '1280', '&autostart=1');
    await installHelpers(p);
    await freezeInPlay(p, null);
    for (const [from, to] of [[0, 1], [1, 2], [2, 3]]) {
      await p.evaluate(f => { VC.debug.setSpeed(1); VC.debug.gotoLevel(f); }, from); await sleep(2000);
      await p.evaluate(t => { VC.debug.setSpeed(0); VC.debug.gotoLevel(t); QA.advance(0.6); }, to);
      await raf(p);
      const vis = await p.evaluate(() => JSON.stringify(VC.Game.renderer.vis));
      console.log('   vis ' + vis);
      await shot(p, `crossfade_${from}to${to}_1280`);
    }
    await ctx.close();
  }

  // ===== 4. Motion bursts (contact sheets) =====
  {
    console.log('bursts');
    const { ctx, p } = await open(b, '1280', '&autostart=1');
    await installHelpers(p);
    await freezeInPlay(p, 0);
    // park Puff at x=300
    await p.evaluate(() => { QA.target(300); QA.advance(2.5); });
    const around = (cx, cy, w = 260, h = 230) => async () => clipL(p, cx - w / 2, cy - h / 2, w, h);
    const P = await p.evaluate(() => QA.puff());

    // catch: a gold coin drops into the basket
    await burst(b, p, 'burst_catch', { title: 'Catch (gold coin into basket, Puff squash + happy)', region: around(P.rimX, 400),
      setup: `QA.clearItems(); (()=>{const p=QA.puff(); QA.spawn('coin','gold',p.rimX+6,446-80,0,260);})()` });
    await p.evaluate(() => QA.advance(1.5));
    // catch at combo x3 (bigger popup)
    await p.evaluate(() => { const w = VC.Game.world; w.combo = 11; w.mult = 2; });
    await burst(b, p, 'burst_catch_mult', { title: 'Catch that raises the multiplier (×3 COMBO! popup)', region: [180, 60, 600, 470],
      setup: `QA.clearItems(); (()=>{const p=QA.puff(); QA.spawn('coin','silver',p.rimX-4,446-80,0,260);})()` });
    await p.evaluate(() => QA.advance(2));
    // Cool Rain
    await burst(b, p, 'burst_rain', { title: 'Cool Rain: rock in flight above Puff turns to steam', region: around(P.x, 300, 320, 420),
      setup: `QA.clearItems(); (()=>{const p=QA.puff(); QA.spawn('rock',null,p.x+20,180,-10,120); const w=VC.Game.world; w.rain.charge=1; w.action();})()` });
    await p.evaluate(() => QA.advance(2.5));
    // ouch
    await p.evaluate(() => { VC.Game.world.puff.invuln = 0; VC.Game.world.rain.charge = 0; });
    await burst(b, p, 'burst_ouch', { title: 'Ouch: rock caught in the basket', region: around(P.rimX, 380, 320, 300),
      setup: `QA.clearItems(); (()=>{const p=QA.puff(); QA.spawn('rock',null,p.rimX,446-80,0,260);})()` });
    await p.evaluate(() => QA.advance(2.5));
    // miss: coin bouncing on the sand far from Puff
    await burst(b, p, 'burst_miss', { title: 'Miss: copper coin bounces on the sand, fades', frames: 8, dt: 0.08, region: around(700, 430, 280, 200),
      setup: `QA.clearItems(); VC.Game.world.combo=6; QA.spawn('coin','copper',700,400,40,330);` });
    await p.evaluate(() => QA.advance(1));
    // rock landing on the ground
    await burst(b, p, 'burst_rockland', { title: 'Rock lands on the ground and fizzles', frames: 8, dt: 0.08, region: around(660, 430, 280, 200),
      setup: `QA.clearItems(); QA.spawn('rock',null,660,400,30,330);` });
    // eruption: rumble glow + launch
    await burst(b, p, 'burst_erupt', { title: 'Eruption: rumble telegraph → launch', frames: 12, dt: 0.08, region: [250, 60, 460, 300],
      setup: `QA.clearItems(); (()=>{const w=VC.Game.world; w.levelTime=60; w._nextRumble=0.6; w._nextLaunch=0.62;})()` });
    await p.evaluate(() => { QA.noEruptions(); QA.advance(3); QA.clearItems(); });
    // Puff moving fast left -> right
    await p.evaluate(() => { QA.target(110); QA.advance(3); });
    await burst(b, p, 'burst_move', { title: 'Puff dashing left → right (tilt + basket pendulum)', frames: 12, dt: 0.06, region: [40, 300, 880, 220],
      setup: `QA.target(860)` });
    await p.evaluate(() => QA.advance(0.3));
    await burst(b, p, 'burst_stop', { title: 'Puff arriving / stopping (basket overshoot settle)', frames: 8, dt: 0.08, region: [480, 300, 480, 220] });
    await ctx.close();
  }

  // ===== 5. Readability lineups: normal / greyscale / deuteranopia per zone =====
  {
    console.log('lineups');
    const { ctx, p } = await open(b, '1280', '&autostart=1');
    await installHelpers(p);
    await p.evaluate(() => {
      const s = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute"><filter id="deut"><feColorMatrix type="matrix" values="0.367 0.861 -0.228 0 0  0.280 0.673 0.047 0 0  -0.012 0.043 0.969 0 0  0 0 0 1 0"/></filter><filter id="prot"><feColorMatrix type="matrix" values="0.152 1.053 -0.205 0 0  0.115 0.786 0.099 0 0  -0.004 -0.048 1.052 0 0  0 0 0 1 0"/></filter></svg>';
      document.body.insertAdjacentHTML('beforeend', s);
    });
    for (let z = 0; z < 4; z++) {
      await freezeInPlay(p, z);
      await p.evaluate(() => {
        QA.target(480); QA.advance(2); QA.clearItems();
        // lineup in Puff's band and up in the sky
        QA.spawn('coin', 'copper', 300, 330, 0, 0); QA.spawn('coin', 'silver', 360, 330, 0, 0); QA.spawn('coin', 'gold', 420, 330, 0, 0);
        QA.spawn('rock', null, 560, 330, 0, 0); QA.spawn('rock', null, 620, 330, 0, 0, { variant: 1 });
        QA.spawn('coin', 'copper', 200, 150, 0, 0); QA.spawn('coin', 'silver', 260, 150, 0, 0); QA.spawn('coin', 'gold', 700, 150, 0, 0);
        QA.spawn('rock', null, 760, 150, 0, 0); QA.spawn('rock', null, 480, 120, 0, 0, { variant: 1 });
        QA.spawn('coin', 'silver', 820, 470, 0, 0); QA.spawn('rock', null, 140, 470, 0, 0);
      });
      await raf(p);
      for (const [f, css] of [['normal', ''], ['grey', 'grayscale(1)'], ['deut', 'url(#deut)'], ['prot', 'url(#prot)']]) {
        await p.evaluate(c => { document.getElementById('game').style.filter = c; }, css);
        await raf(p);
        await shot(p, `lineup_zone${z}_${f}`);
      }
      await p.evaluate(() => { document.getElementById('game').style.filter = ''; });
    }
    await ctx.close();
  }

  // ===== 6. Custom pictures through the Change Pictures screen =====
  {
    console.log('custom pictures');
    let { ctx, p } = await open(b, '1280');
    await installHelpers(p);
    const fx = await makeFixtures(p);
    await p.evaluate(() => VC.UI.open('scrCustom', 'scrTitle')); await sleep(400);
    const set = async (slot, file) => {
      await p.evaluate(s => { VC.UI._pickSlot = s; }, slot);
      await p.setInputFiles('#filePick', file);
      await p.waitForFunction(() => /saved|room|Could/.test(document.getElementById('toast').textContent), null, { timeout: 10000 });
      const t = await p.evaluate(() => document.getElementById('toast').textContent);
      console.log('   ' + slot + ': ' + t);
      await sleep(300);
      await p.evaluate(() => { document.getElementById('toast').textContent = ''; });
    };
    await set('hero', fx.hero_png);
    await set('coin', fx.portrait);
    await set('rock', fx.rock_png);
    await set('bg_beach', fx.photo_day);
    await set('bg_crater', fx.photo_night);
    await sleep(500);
    await shot(p, 'custom_screen_filled_1280');
    await p.evaluate(() => VC.UI.back()); await sleep(1500);
    await shot(p, 'custom_title_1280');
    await p.evaluate(() => { VC.debug.setBot(true, 1); VC.Game.botMode = true; VC.Game.startGame(); });
    await sleep(6000); await shot(p, 'custom_play_zone0_1280');
    await p.evaluate(() => VC.debug.gotoLevel(3)); await sleep(6000); await shot(p, 'custom_play_zone3_1280');
    // frozen lineup with custom art
    await p.evaluate(() => { VC.debug.setBot(false); VC.debug.gotoLevel(0); }); await sleep(2200);
    await p.evaluate(() => {
      VC.debug.setSpeed(0); QA.noEruptions(); QA.clearItems(); QA.target(480); QA.advance(2);
      QA.spawn('coin', 'copper', 300, 330, 0, 0); QA.spawn('coin', 'silver', 360, 330, 0, 0); QA.spawn('coin', 'gold', 420, 330, 0, 0);
      QA.spawn('rock', null, 580, 330, 0, 0); QA.spawn('rock', null, 660, 200, 0, 0);
    });
    await raf(p); await shot(p, 'custom_lineup_zone0_1280');
    await ctx.close();
  }

  console.log(errs.length ? 'CONSOLE ERRORS:\n' + errs.join('\n') : 'no console errors');
  await b.close();
})().catch(e => { console.error(e); process.exit(1); });
