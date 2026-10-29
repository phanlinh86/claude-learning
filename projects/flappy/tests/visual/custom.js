// Visual QA: custom pictures (bird Fit/Round, drop, turtle, spring background).
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const BASE = 'http://localhost:8772/index.html?mute=1&seed=42';

async function makeImages(page) {
  return page.evaluate(() => {
    const mk = (w, h, draw, type = 'image/png') => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); return c.toDataURL(type, 0.92); };
    // "photo-like" face: opaque rectangular photo with gradient background (like a pet photo)
    const face = mk(640, 480, (g, w, h) => {
      const bg = g.createLinearGradient(0, 0, w, h); bg.addColorStop(0, '#6a8caf'); bg.addColorStop(1, '#c9d6a3'); g.fillStyle = bg; g.fillRect(0, 0, w, h);
      const skin = g.createRadialGradient(300, 220, 30, 320, 250, 190); skin.addColorStop(0, '#ffe0c2'); skin.addColorStop(1, '#d99a6c');
      g.fillStyle = skin; g.beginPath(); g.ellipse(320, 250, 160, 190, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#5b3a1e'; g.beginPath(); g.ellipse(320, 110, 170, 80, 0, Math.PI, 0); g.fill();
      g.fillStyle = '#fff'; [260, 380].forEach(x => { g.beginPath(); g.ellipse(x, 230, 30, 22, 0, 0, 7); g.fill(); });
      g.fillStyle = '#2a4a7a'; [260, 380].forEach(x => { g.beginPath(); g.arc(x + 4, 232, 13, 0, 7); g.fill(); });
      g.strokeStyle = '#a0402a'; g.lineWidth = 10; g.lineCap = 'round'; g.beginPath(); g.arc(320, 300, 70, 0.2, Math.PI - 0.2); g.stroke();
      for (let i = 0; i < 4000; i++) { g.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    }, 'image/jpeg');
    // transparent PNG "cookie" for the drop
    const cookie = mk(200, 200, (g) => {
      g.fillStyle = '#d9a35b'; g.beginPath(); g.arc(100, 100, 85, 0, 7); g.fill();
      g.fillStyle = '#5a3416'; for (let i = 0; i < 9; i++) { g.beginPath(); g.arc(50 + (i * 37) % 100, 50 + (i * 53) % 100, 9, 0, 7); g.fill(); }
    });
    // a wide photo of a "dog" (opaque) for turtle
    const dog = mk(800, 500, (g, w, h) => {
      g.fillStyle = '#e8e2d0'; g.fillRect(0, 0, w, h);
      g.fillStyle = '#a0703a'; g.beginPath(); g.ellipse(400, 300, 260, 120, 0, 0, 7); g.fill();
      g.beginPath(); g.ellipse(640, 200, 90, 80, 0, 0, 7); g.fill();
      g.fillRect(200, 360, 40, 120); g.fillRect(520, 360, 40, 120);
      g.fillStyle = '#000'; g.beginPath(); g.arc(670, 185, 10, 0, 7); g.fill();
    }, 'image/jpeg');
    // a landscape "holiday photo" background
    const bg = mk(1600, 1000, (g, w, h) => {
      const s = g.createLinearGradient(0, 0, 0, h); s.addColorStop(0, '#2e6fb5'); s.addColorStop(0.55, '#9fd2f0'); s.addColorStop(0.56, '#2f7d3a'); s.addColorStop(1, '#1f5226');
      g.fillStyle = s; g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff'; for (let i = 0; i < 6; i++) { g.beginPath(); g.ellipse(200 + i * 260, 160 + (i % 2) * 60, 110, 40, 0, 0, 7); g.fill(); }
      g.fillStyle = '#7a6a5a'; g.beginPath(); g.moveTo(0, 560); g.lineTo(400, 300); g.lineTo(800, 560); g.lineTo(1100, 350); g.lineTo(1600, 560); g.fill();
      g.fillStyle = '#c0392b'; g.fillRect(900, 600, 220, 160); g.fillStyle = '#7b241c'; g.beginPath(); g.moveTo(880, 600); g.lineTo(1010, 500); g.lineTo(1140, 600); g.fill();
    }, 'image/jpeg');
    return { face, cookie, dog, bg };
  });
}
const toFile = (name, dataUrl) => {
  const [head, b64] = dataUrl.split(',');
  return { name, mimeType: head.includes('jpeg') ? 'image/jpeg' : 'image/png', buffer: Buffer.from(b64, 'base64') };
};

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; page.on('pageerror', e => errs.push(String(e)));
  await page.goto(BASE);
  await page.waitForFunction(() => window.FF && FF.debug && FF.debug.mode === 'title');
  const imgs = await makeImages(page);
  for (const [k, v] of Object.entries(imgs)) fs.writeFileSync(path.join(OUT, `input_${k}.${v.includes('jpeg') ? 'jpg' : 'png'}`), Buffer.from(v.split(',')[1], 'base64'));
  await page.click('#btnCustomize'); await page.waitForTimeout(300);
  const upload = async (slotIdx, file) => {
    const [fc] = await Promise.all([page.waitForEvent('filechooser'), page.locator('.slot').nth(slotIdx).locator('[data-act=pick]').click()]);
    await fc.setFiles(file);
    await page.waitForTimeout(700);
  };
  await upload(0, toFile('face.jpg', imgs.face));
  await upload(1, toFile('cookie.png', imgs.cookie));
  await upload(2, toFile('dog.jpg', imgs.dog));
  await upload(3, toFile('holiday.jpg', imgs.bg));
  await page.screenshot({ path: path.join(OUT, 'custom_panel_after_upload.png') });
  await page.locator('#slotGrid').screenshot({ path: path.join(OUT, 'custom_panel_grid.png') });

  const play = async (tag) => {
    await page.evaluate(() => { FF.debug.startGame(); FF.debug.setBot(true, 1); FF.debug.flap(); });
    await page.waitForTimeout(3000);
    await page.screenshot({ path: path.join(OUT, `custom_play_${tag}.png`) });
    // frozen-clock flap burst, bird-centred crops
    await page.evaluate(() => FF.debug.setSpeed(0));
    const shots = [];
    for (let i = 0; i < 12; i++) {
      const b = await page.evaluate(() => { const G = FF.Game; for (let j = 0; j < 1; j++) { G.step(1 / 60); G.renderer.update(1 / 60); } G.renderer.draw(G.mode); const b = G.world.bird; return { x: b.x, y: b.y }; });
      const s = 1280 / 960;
      shots.push(await page.screenshot({ clip: { x: (b.x - 70) * s, y: Math.max(0, (b.y - 60) * s), width: 140 * s, height: 120 * s } }));
    }
    shots.forEach((buf, i) => fs.writeFileSync(path.join(OUT, 'frames', `custom_${tag}_${String(i).padStart(2, '0')}.png`), buf));
    await page.evaluate(() => FF.debug.setSpeed(1));
  };
  await page.evaluate(() => FF.UI.back());
  await play('fit');
  // Round bird
  await page.evaluate(() => { FF.Assets.setShape('bird', 'circle'); FF.Assets.setShape('turtle', 'circle'); });
  await play('round');
  // also check title screen with custom pictures
  await page.evaluate(() => FF.Game.toTitle()); await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(OUT, 'custom_title.png') });
  console.log('errors', errs);
  await browser.close();
})();
