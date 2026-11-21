// Visual QA capture for Bristle's Moon Pop (MP namespace).
// Run: node tests/visual/capture.js [section ...]   sections: screens zones motion cb seam custom portrait  (default: all)
// Output: tests/out/visual/*.png (DPR 1 unless noted; contact sheets via sheet()).
// The simulation is frozen (speed 0) and advanced by hand with QA.adv(seconds) so every frame is deterministic.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual');
fs.mkdirSync(OUT, { recursive: true });

const VP = {
  d960: { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 },
  d1280: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  iphL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  iphP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  ipad: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
  iphL2: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  ipad2: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }
};
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
let browser;

async function open(vp, q) {
  const ctx = await browser.newContext(VP[vp]);
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(vp + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(vp + ': ' + String(e)));
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.MP && MP.debug && MP.debug.mode !== 'boot', null, { timeout: 15000 });
  await p.evaluate(() => {
    const G = MP.Game;
    window.QA = {
      freeze() { MP.debug.setSpeed(0); },
      adv(t, fn) { const h = 1 / 120; let n = Math.round(t / h); while (n-- > 0) { if (fn) fn(); G.step(h); G.renderer.update(h); } },
      quiet() { const w = G.world; w._nextSpawn = 1e9; w._nextPebble = 1e9; },
      clear() { G.world.items.length = 0; G.renderer.fx.length = 0; G.renderer.texts.length = 0; G.renderer.banner = null; }
    };
  });
  await sleep(300);
  return { ctx, p };
}
const frame = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function shot(p, name, opts) { await frame(p); await p.screenshot(Object.assign({ path: path.join(OUT, name + '.png') }, opts || {})); console.log('  ' + name); }
// grab the canvas region (scene clip) as a data URL for contact sheets
async function grab(p, clip) { await frame(p); const b = await p.screenshot({ clip }); return 'data:image/png;base64,' + b.toString('base64'); }
async function sheet(name, imgs, cols, w, h, labels) {
  const pg = await browser.newPage({ viewport: { width: cols * w, height: Math.ceil(imgs.length / cols) * (h + 16) }, deviceScaleFactor: 1 });
  await pg.setContent('<body style="margin:0;background:#222;display:flex;flex-wrap:wrap;font:11px sans-serif;color:#fff">' +
    imgs.map((s, i) => `<div style="width:${w}px;height:${h + 16}px"><img src="${s}" style="width:${w}px;height:${h}px;display:block"><div>${labels ? labels[i] : i}</div></div>`).join('') + '</body>');
  await sleep(150);
  await pg.screenshot({ path: path.join(OUT, name + '.png') }); await pg.close(); console.log('  ' + name);
}

/* ---------------- every screen at every viewport ---------------- */
async function screens() {
  for (const vp of ['d960', 'd1280', 'iphL', 'iphP', 'ipad']) {
    const { ctx, p } = await open(vp);
    await sleep(800);
    await shot(p, `scr_title_${vp}`);
    for (const id of ['scrHow', 'scrSettings', 'scrCustom']) {
      await p.evaluate(id => MP.UI.show(id), id); await sleep(250);
      await shot(p, `scr_${id.slice(3).toLowerCase()}_${vp}`);
      // scrolled to the bottom when the panel overflows
      const of = await p.evaluate(id => { const s = document.getElementById(id); const pn = s.querySelector('.panel'); return { sh: s.scrollHeight, ch: s.clientHeight, psh: pn.scrollHeight, pch: pn.clientHeight }; }, id);
      if (of.sh > of.ch + 4 || of.psh > of.pch + 4) { console.log('    overflow', id, vp, JSON.stringify(of)); await p.evaluate(id => { const s = document.getElementById(id); s.scrollTop = 1e5; s.querySelector('.panel').scrollTop = 1e5; }, id); await shot(p, `scr_${id.slice(3).toLowerCase()}_${vp}_bottom`); }
    }
    await p.evaluate(() => { MP.UI.show('scrTitle'); MP.debug.startGame(); });
    await sleep(2500);
    await shot(p, `scr_play_${vp}`);
    await p.evaluate(() => MP.Game.pause()); await sleep(250);
    await shot(p, `scr_pause_${vp}`);
    await p.evaluate(() => { MP.Game.resume(); const w = MP.Game.world; w.score = 12345; MP.Game.run.cupcakes = 23; MP.Game.run.skyPops = 4; w.bestChain = 3; MP.Game.gameOver(); });
    await sleep(600);
    await shot(p, `scr_over_${vp}`);
    await p.click('#btnScoreCard').catch(e => console.log('    no score btn', e.message));
    await sleep(1200);
    await shot(p, `scr_scorecard_${vp}`);
    await ctx.close();
  }
}

/* ---------------- gameplay per zone ---------------- */
async function zones() {
  for (const vp of ['d960', 'iphL', 'iphP', 'ipad']) {
    for (let z = 0; z < 4; z++) {
      const { ctx, p } = await open(vp, `&autostart=1&level=${z}`);
      await p.evaluate(() => { QA.freeze(); QA.adv(1.8); });   // banner gone
      await p.evaluate(() => { MP.debug.setBot(true, 0.6); QA.adv(9); });
      await shot(p, `zone${z}_${vp}`);
      await ctx.close();
    }
  }
  // lineup: one bubble of each kind + pebble + Bristle, on every sky (bubbles in the play band and high in the sky)
  const { ctx, p } = await open('d960', '&autostart=1');
  const imgs = [];
  for (let z = 0; z < 4; z++) {
    await p.evaluate(z => { QA.freeze(); MP.debug.gotoLevel(z); MP.Game.renderer.setSeason(z, true); MP.Game.weather.setSeason(z, { instant: true }); QA.adv(2); QA.quiet(); QA.clear(); }, z);
    await p.evaluate(() => {
      const w = MP.Game.world, mk = (kind, x, y, color) => ({ id: 900 + x, kind, color: color || 0, x, y, vx: 0, vy: 0, r: 30, wob: 0, squish: 0, rot: 0, spin: 0, vent: 0, state: 'rise', t: 1, alpha: 1, _px: x, _py: y, _R: 30, _sw: 0, _evx: 0, _puff: 1, _k: 1, _vR: 0 });
      w.items.push(mk('cupcake', 200, 330, 0), mk('cupcake', 300, 330, 1), mk('cupcake', 400, 330, 2), mk('magnet', 520, 330),
        mk('cupcake', 200, 110, 0), mk('magnet', 300, 110), mk('cupcake', 760, 110, 2));
      const pb = w._newPebble(640); pb.y = 300; pb._py = 300; pb.lx = 640; pb.shadow = 0.6; w.items.push(pb);
      w.hog.x = w.hog._px = w.hog.board.x = w.hog.board._px = 800;
      for (const it of w.items) { it.vy = 0; it._vR = 0; }
    });
    await frame(p);
    imgs.push(await grab(p, { x: 0, y: 0, width: 960, height: 540 }));
    await shot(p, `lineup_z${z}`);
  }
  await sheet('lineup_sheet', imgs, 2, 480, 270, ['dawn', 'noon', 'sunset', 'night']);
  // colour-blind / greyscale of the lineup
  const filt = {
    deut: '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
    prot: '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
    grey: '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0'
  };
  for (const [k, m] of Object.entries(filt)) {
    const pg = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 });
    await pg.setContent(`<body style="margin:0;background:#222"><svg width="0" height="0" style="position:absolute"><filter id="f"><feColorMatrix type="matrix" values="${m}"/></filter></svg>` +
      `<div style="display:flex;flex-wrap:wrap;filter:url(#f)">${imgs.map(s => `<img src="${s}" style="width:480px;height:270px">`).join('')}</div></body>`);
    await sleep(200); await pg.screenshot({ path: path.join(OUT, `lineup_${k}.png`) }); await pg.close(); console.log('  lineup_' + k);
  }
  // crisp crop of the noon bubbles (white rim on pale sky) at 2x
  await ctx.close();
  const c2 = await browser.newContext({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 2 });
  const p2 = await c2.newPage(); await p2.goto(GAME + '?mute=1&seed=7&autostart=1&level=1');
  await p2.waitForFunction(() => MP.debug && MP.debug.mode === 'playing');
  await p2.evaluate(() => { const G = MP.Game; MP.debug.setSpeed(0); const h = 1 / 120; for (let i = 0; i < 240; i++) { G.step(h); G.renderer.update(h); } const w = G.world; w._nextSpawn = 1e9; w._nextPebble = 1e9; w.items.length = 0;
    const mk = (kind, x, y, color) => ({ id: 900 + x, kind, color: color || 0, x, y, vx: 0, vy: 0, r: 30, wob: 0, squish: 0, rot: 0, spin: 0, vent: 0, state: 'rise', t: 1, alpha: 1, _px: x, _py: y, _R: 30, _sw: 0, _evx: 0, _puff: 1, _k: 1, _vR: 0 });
    w.items.push(mk('cupcake', 600, 120, 2), mk('cupcake', 700, 120, 1), mk('magnet', 800, 120), mk('cupcake', 600, 360, 0));
    G.renderer.fx.length = 0; G.renderer.texts.length = 0; G.renderer.banner = null; });
  await sleep(200);
  await p2.screenshot({ path: path.join(OUT, 'noon_rim_2x.png'), clip: { x: 540, y: 70, width: 320, height: 340 } }); console.log('  noon_rim_2x');
  await c2.close();
}

/* ---------------- level change crossfade + banner ---------------- */
async function crossfade() {
  for (const vp of ['d960', 'iphP']) {
    const { ctx, p } = await open(vp, '&autostart=1');
    await p.evaluate(() => { QA.freeze(); QA.adv(2); MP.debug.setBot(true, 1); QA.adv(4); });
    await p.evaluate(() => { const w = MP.Game.world; w.box = w.boxTarget - 1; });
    // run until the level changes
    await p.evaluate(() => { const w = MP.Game.world; let n = 0; while (w.level === 0 && n++ < 4000) QA.adv(1 / 60); });
    const box = vp === 'd960' ? { x: 0, y: 0, width: 960, height: 540 } : { x: 0, y: 0, width: 390, height: 844 };
    const imgs = [], lab = [];
    for (let i = 0; i < 10; i++) { imgs.push(await grab(p, box)); lab.push((i * 0.18).toFixed(2) + 's'); await p.evaluate(() => QA.adv(0.18)); }
    await sheet(`crossfade_${vp}`, imgs, 5, vp === 'd960' ? 384 : 156, vp === 'd960' ? 216 : 338, lab);
    await ctx.close();
  }
}

/* ---------------- motion contact sheets ---------------- */
async function motion() {
  const { ctx, p } = await open('d960', '&autostart=1');
  await p.evaluate(() => { QA.freeze(); QA.adv(2); QA.quiet(); QA.clear(); });
  const crop = (x, y, w, h) => ({ x, y, width: w, height: h });
  async function seq(name, n, dt, clip, fn, lab) {
    const imgs = [], L = [];
    for (let i = 0; i < n; i++) { imgs.push(await grab(p, typeof clip === 'function' ? await clip() : clip)); L.push((lab || '') + (i * dt * 1000 | 0) + 'ms'); await p.evaluate(({ dt, fn }) => QA.adv(dt, fn ? new Function(fn) : null), { dt, fn }); }
    await sheet(name, imgs, 8, clip.width || 240, clip.height || 240, L);
  }
  const mk = `(kind,x,y,color)=>({ id: Math.random()*1e6|0, kind, color: color||0, x, y, vx: 0, vy: 0, r: 30, wob: 0, squish: 0, rot: 0, spin: 0, vent: 0, state: 'rise', t: 1, alpha: 1, _px: x, _py: y, _R: 30, _sw: 0, _evx: 0, _puff: 1, _k: 1.2, _vR: 0 })`;
  // jump -> ball spin -> air pop -> chain -> landing
  await p.evaluate(mk => { const M = eval(mk), w = MP.Game.world; w.hog.x = w.hog._px = w.hog.board.x = w.hog.board._px = 480; w.setTarget(480);
    w.items.push(M('cupcake', 480, 300, 0), M('cupcake', 485, 200, 1), M('cupcake', 480, 120, 2)); w.action(); }, mk);
  await seq('m_jump_chain', 32, 0.05, crop(280, 60, 400, 480));
  // skate push
  await p.evaluate(() => { QA.clear(); const w = MP.Game.world; w.hog.x = w.hog._px = 150; w.setTarget(800); });
  await seq('m_skate', 16, 0.05, crop(0, 360, 960, 180));
  // bubble emerging from a crater (puff telegraph) then rising, then escape at the top
  await p.evaluate(() => { QA.clear(); const w = MP.Game.world; w.setTarget(60); w.hog.x = w.hog._px = 60; w.vents.forEach(v => v.cool = 0); w._spawnBubble(); window._vx = w.items[w.items.length - 1].x; });
  const vx = await p.evaluate(() => window._vx);
  await seq('m_emerge', 24, 0.05, crop(Math.max(0, Math.round(vx) - 100), 240, 200, 290));
  await p.evaluate(() => { const it = MP.Game.world.items[0]; if (it) { it.y = it._py = 120; } });
  await seq('m_escape', 16, 0.05, crop(Math.max(0, Math.round(vx) - 120), 0, 240, 220));
  // magnet pickup + field
  await p.evaluate(mk => { QA.clear(); const M = eval(mk), w = MP.Game.world; w.hog.x = w.hog._px = w.hog.board.x = w.hog.board._px = 400; w.setTarget(400);
    w.items.push(M('magnet', 470, 430), M('cupcake', 700, 300, 0), M('cupcake', 200, 250, 1), M('cupcake', 600, 150, 2)); w.setTarget(480); }, mk);
  await seq('m_magnet', 24, 0.08, crop(0, 0, 960, 540));
  // pebble warning shadow -> bonk (dizzy)
  await p.evaluate(() => { QA.clear(); const w = MP.Game.world; w.magnet.t = 0; w.hog.x = w.hog._px = w.hog.board.x = w.hog.board._px = 480; w.setTarget(480); w.hog.invuln = 0;
    const pb = w._newPebble(480); pb._A = 0; pb.x = pb._bx = 480; w._predictLand(pb); w.items.push(pb); });
  await seq('m_bonk', 32, 0.06, crop(300, 0, 360, 540));
  // box full -> cleared
  await p.evaluate(mk => { QA.clear(); const M = eval(mk), w = MP.Game.world; w.hearts = 3; w.box = w.boxTarget - 1; w.hog.x = w.hog._px = w.hog.board.x = w.hog.board._px = 480; w.setTarget(480); w.items.push(M('cupcake', 480, 440, 0)); }, mk);
  await seq('m_boxfull', 24, 0.15, crop(0, 0, 960, 540));
  await ctx.close();
}

/* ---------------- side-extended sky seam (wide screens) ---------------- */
async function seam() {
  for (const [vp, q] of [['iphL2', ''], ['d1280w', '']]) {
    const cfg = vp === 'd1280w' ? { viewport: { width: 1280, height: 540 }, deviceScaleFactor: 1 } : VP[vp];
    VP[vp] = cfg;
    for (let z = 0; z < 4; z++) {
      const { ctx, p } = await open(vp, `&autostart=1&level=${z}`);
      await p.evaluate(() => { QA.freeze(); QA.adv(2); QA.quiet(); QA.clear(); });
      await shot(p, `seam_${vp}_z${z}`);
      // measure the column-to-column luminance step around the scene's left/right edge
      const r = await p.evaluate(() => {
        const R = MP.Game.renderer, c = R.canvas, g = c.getContext('2d'), sx = R._sxd, sw = Math.round(960 * R.px);
        const out = [];
        for (const edge of [sx, sx + sw]) {
          const d = g.getImageData(edge - 6, 0, 12, Math.round(480 * R.px)).data, cols = [];
          for (let x = 0; x < 12; x++) { let s = 0, n = 0; for (let y = 0; y < Math.round(480 * R.px); y += 2) { const i = (y * 12 + x) * 4; s += d[i] + d[i + 1] + d[i + 2]; n++; } cols.push(+(s / n / 3).toFixed(1)); }
          out.push({ edge, cols });
        }
        return { px: R.px, SX: R.SX, sxd: R._sxd, out };
      });
      console.log('    seam', vp, z, JSON.stringify(r));
      await ctx.close();
    }
  }
}

/* ---------------- custom pictures ---------------- */
async function custom() {
  // generate a "photo" (a dog face-ish) and a donut-ish cupcake as PNGs
  const pg = await browser.newPage({ viewport: { width: 400, height: 300 } });
  const make = async (fn, w, h) => pg.evaluate(({ fn, w, h }) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); new Function('g', 'w', 'h', fn)(g, w, h); return c.toDataURL('image/png'); }, { fn, w, h });
  const hero = await make(`const gr=g.createLinearGradient(0,0,0,h);gr.addColorStop(0,'#6ab0de');gr.addColorStop(1,'#3d7a3a');g.fillStyle=gr;g.fillRect(0,0,w,h);
    g.fillStyle='#c98b4f';g.beginPath();g.ellipse(w/2,h*0.55,w*0.3,h*0.33,0,0,7);g.fill();g.fillStyle='#8a5a2c';g.beginPath();g.ellipse(w*0.25,h*0.35,40,70,-0.4,0,7);g.fill();g.beginPath();g.ellipse(w*0.75,h*0.35,40,70,0.4,0,7);g.fill();
    g.fillStyle='#222';g.beginPath();g.arc(w*0.42,h*0.5,12,0,7);g.arc(w*0.58,h*0.5,12,0,7);g.fill();g.beginPath();g.ellipse(w/2,h*0.65,22,15,0,0,7);g.fill();`, 640, 480);
  const cup = await make(`g.fillStyle='#fff';g.fillRect(0,0,w,h);g.fillStyle='#e0a050';g.beginPath();g.arc(w/2,h/2,w*0.4,0,7);g.fill();g.fillStyle='#ff6fa8';g.beginPath();g.arc(w/2,h/2,w*0.32,0,7);g.fill();g.fillStyle='#fff';g.beginPath();g.arc(w/2,h/2,w*0.1,0,7);g.fill();`, 300, 300);
  await pg.close();
  const tmp = path.join(OUT, 'fixtures'); fs.mkdirSync(tmp, { recursive: true });
  fs.writeFileSync(path.join(tmp, 'hero.png'), Buffer.from(hero.split(',')[1], 'base64'));
  fs.writeFileSync(path.join(tmp, 'cup.png'), Buffer.from(cup.split(',')[1], 'base64'));
  for (const vp of ['d960', 'iphP']) {
    const { ctx, p } = await open(vp);
    await p.evaluate(() => localStorage.clear());
    await p.evaluate(() => MP.UI.show('scrCustom')); await sleep(300);
    for (const [slot, f] of [['hero', 'hero.png'], ['cupcake', 'cup.png']]) {
      const [fc] = await Promise.all([p.waitForEvent('filechooser'), p.evaluate(slot => { MP.UI._pickSlot = slot; document.getElementById('filePick').click(); }, slot)]);
      await fc.setFiles(path.join(tmp, f)); await sleep(900);
    }
    await shot(p, `custom_screen_${vp}`);
    await p.evaluate(() => { MP.UI.show('scrTitle'); MP.debug.startGame(); QA.freeze(); QA.adv(2); MP.debug.setBot(true, 0.7); QA.adv(8); });
    await shot(p, `custom_play_${vp}`);
    await p.evaluate(() => { MP.debug.setBot(false); const w = MP.Game.world; let n = 0; while (w.hog.air && n++ < 600) QA.adv(1 / 60); QA.adv(0.3); });
    await shot(p, `custom_floor_${vp}`);
    await p.evaluate(() => { const w = MP.Game.world; w.hog.air = true; w.action(); QA.adv(0.25); });
    await shot(p, `custom_air_${vp}`);
    await p.evaluate(() => { localStorage.clear(); });
    await ctx.close();
  }
}

(async () => {
  browser = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const want = process.argv.slice(2);
  const all = { screens, zones, crossfade, motion, seam, custom };
  for (const [k, fn] of Object.entries(all)) if (!want.length || want.includes(k)) { console.log(k); try { await fn(); } catch (e) { console.log('  FAILED ' + k + ': ' + e.stack); } }
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no page errors');
  await browser.close();
})();
