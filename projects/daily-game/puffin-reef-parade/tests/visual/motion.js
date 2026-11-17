// Extra visual QA: motion contact sheets (turn left<->right, parade wiggle), particles per season, caustic flicker,
// gold-star contrast measure. Output: tests/out/visual/motion_*.png   Run: node tests/visual/motion.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual');
fs.mkdirSync(OUT, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

async function open(b, q) {
  const ctx = await b.newContext({ viewport: { width: 960, height: 540 } });
  const p = await ctx.newPage();
  await p.goto(GAME + '?mute=1&seed=7&autostart=1' + (q || ''));
  await p.waitForFunction(() => window.RP && RP.debug && RP.debug.mode !== 'boot', null, { timeout: 15000 });
  await p.evaluate(() => {
    const G = RP.Game;
    window.QA = {
      advance(t) { const h = 1 / 120; let n = Math.round(t / h); while (n-- > 0) { G.step(h); G.renderer.update(h); } G.renderer.draw(G.mode); },
      noGold() { G.world._goldNext = 1e9; G.world.notes = G.world.notes.filter(n => !n.gold); },
      clearFx() { G.renderer.fx.length = 0; G.renderer.texts.length = 0; G.renderer.banner = null; },
      place(x, y, h) { const s = G.world.hero; s.x = s._px = x; s.y = s._py = y; s.heading = h || 0; }
    };
  });
  return { ctx, p };
}
async function freeze(p, l) {
  await p.evaluate(l => { RP.debug.setBot(false); RP.debug.setSpeed(1); RP.debug.gotoLevel(l); }, l);
  await sleep(2300);
  await p.evaluate(() => { RP.debug.setSpeed(0); QA.noGold(); QA.clearFx(); });
}
async function sheet(b, name, title, imgs, cols = 4) {
  const cp = await b.newPage({ viewport: { width: 1600, height: 400 } });
  await cp.setContent(`<html><body style="margin:0;background:#222;font:600 14px system-ui;color:#fff">
    <div style="padding:8px 12px;font-size:18px">${title}</div>
    <div style="display:grid;grid-template-columns:repeat(${cols},1fr);gap:6px;padding:6px">
    ${imgs.map(d => `<div style="position:relative"><img style="width:100%;display:block" src="data:image/png;base64,${d.img}"><span style="position:absolute;left:4px;top:2px;background:#000a;padding:1px 5px;border-radius:4px">${d.label}</span></div>`).join('')}
    </div></body></html>`);
  await cp.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); console.log('  ' + name);
  await cp.close();
}
const clip = (x, y, w, h) => ({ x: Math.max(0, x), y: Math.max(0, y), width: w, height: h });   // 960x540 => logical = css

(async () => {
  const b = await chromium.launch();
  const { ctx, p } = await open(b);
  await freeze(p, 0);
  // 1) turn right -> left -> right
  await p.evaluate(() => { const A = RP.debug.world.arena; QA.place((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, 0); RP.debug.world.hero.facing = 1; RP.debug.world.notes.length = 0; RP.Game.keys = {}; QA.advance(0.3); RP.Game.keys.ArrowLeft = true; });
  let imgs = [];
  for (let i = 0; i < 16; i++) {
    if (i === 8) await p.evaluate(() => { RP.Game.keys = { ArrowRight: true }; });
    await p.evaluate(() => QA.advance(0.07)); await raf(p);
    const s = await p.evaluate(() => { const h = RP.debug.world.hero; return [h.x, h.y, h.heading, RP.Game.renderer._hv.fx, RP.Game.renderer._hv.tilt]; });
    imgs.push({ label: `#${i} fx=${s[3].toFixed(2)} tilt=${s[4].toFixed(2)}`, img: (await p.screenshot({ clip: clip(s[0] - 80, s[1] - 90, 160, 130) })).toString('base64') });
  }
  await sheet(b, 'motion_turn', 'Dottie turning right→left (0–7) then left→right (8–15), 70 ms apart', imgs, 8);
  if (process.argv[2] === 'turn') { await ctx.close(); await b.close(); return; }
  // 2) vertical swims: up and down (tilt clamp)
  imgs = [];
  for (const [dx, dy, lab] of [[0, -1, 'up'], [0, 1, 'down'], [-1, -1, 'up-left'], [1, 1, 'down-right']]) {
    await p.evaluate(([dx, dy]) => { const A = RP.debug.world.arena; QA.place((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, Math.atan2(dy, dx)); RP.debug.world.setDir(dx, dy); QA.advance(0.5); QA.place((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, Math.atan2(dy, dx)); QA.advance(0.02); }, [dx, dy]); await raf(p);
    const s = await p.evaluate(() => { const h = RP.debug.world.hero; return [h.x, h.y]; });
    imgs.push({ label: lab, img: (await p.screenshot({ clip: clip(s[0] - 80, s[1] - 90, 160, 130) })).toString('base64') });
  }
  await sheet(b, 'motion_dirs', 'Dottie swimming up / down / diagonals (never upside down?)', imgs, 4);
  // 3) parade wiggle: long parade, frames
  await p.evaluate(() => { RP.debug.setBot(true, 1); RP.debug.world.songTarget = 99; QA.advance(25); RP.debug.setBot(false); QA.noGold(); QA.clearFx(); });
  imgs = [];
  for (let i = 0; i < 8; i++) {
    await p.evaluate(() => QA.advance(0.08)); await raf(p);
    imgs.push({ label: '#' + i + ' +' + i * 80 + 'ms', img: (await p.screenshot()).toString('base64') });
  }
  const tl = await p.evaluate(() => RP.debug.world.trail.length);
  await sheet(b, 'motion_wiggle', `Parade wiggle, ${tl} stars, 80 ms apart`, imgs, 4);
  // 4) particles per season, 3 frames 0.5 s apart, plus caustic-only frames
  for (let lv = 0; lv < 4; lv++) {
    await freeze(p, lv);
    await p.evaluate(() => { RP.debug.world.trail.length = 0; RP.debug.world.notes.length = 0; QA.advance(3); });
    imgs = [];
    for (let i = 0; i < 4; i++) { await p.evaluate(() => QA.advance(0.5)); await raf(p); imgs.push({ label: `season ${lv} +${i * 500}ms`, img: (await p.screenshot()).toString('base64') }); }
    await sheet(b, 'motion_particles_' + lv, `Ambient particles, season ${lv}`, imgs, 2);
  }
  // 5) caustic flicker + sand colour: pixel stats of screenshots, decoded on an about:blank page (no taint)
  const an = await b.newPage();
  const stats = async buf => an.evaluate(async u => { const im = new Image(); im.src = u; await im.decode(); const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height).data; let s = 0, mx = 0, mn = 1e9, r = 0, gg = 0, bb = 0; const n = d.length / 4;
    for (let j = 0; j < d.length; j += 4) { const l = 0.2126 * d[j] + 0.7152 * d[j + 1] + 0.0722 * d[j + 2]; s += l; mx = Math.max(mx, l); mn = Math.min(mn, l); r += d[j]; gg += d[j + 1]; bb += d[j + 2]; }
    return { mean: s / n, range: mx - mn, rgb: [r / n | 0, gg / n | 0, bb / n | 0] }; }, 'data:image/png;base64,' + buf.toString('base64'));
  const res = {};
  for (let lv = 0; lv < 4; lv++) {
    await freeze(p, lv);
    await p.evaluate(() => { RP.debug.world.trail.length = 0; RP.debug.world.notes.length = 0; QA.place(-500, -500, 0); });
    const A = await p.evaluate(() => RP.debug.world.arena);
    const m = []; let rng = 0, rgb;
    for (let i = 0; i < 30; i++) {
      await p.evaluate(() => { QA.advance(1 / 30); RP.debug.weather.particles.length = 0; RP.Game.renderer.draw(RP.Game.mode); }); await raf(p);
      const st = await stats(await p.screenshot({ clip: clip((A.x0 + A.x1) / 2 - 60, A.y0 + 60, 120, 120) }));
      m.push(st.mean); rng = Math.max(rng, st.range); rgb = st.rgb;
    }
    const d = m.slice(1).map((v, i) => Math.abs(v - m[i]));
    res[lv] = { meanLum: +(m.reduce((a, c) => a + c) / m.length).toFixed(1), lumSwing: +(Math.max(...m) - Math.min(...m)).toFixed(2), maxFrameDelta: +Math.max(...d).toFixed(2), patchRange: Math.round(rng), sandRGB: rgb };
  }
  console.log('CAUSTICS', JSON.stringify(res));
  await ctx.close(); await b.close();
})();
