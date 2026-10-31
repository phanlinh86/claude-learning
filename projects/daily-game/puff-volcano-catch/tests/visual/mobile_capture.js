// Mobile visual QA capture (iPhone / iPad, portrait + landscape, emulated touch).
// Screens, gameplay in all 4 zones, a portrait zone crossfade, a simulated notch + home bar, a custom background
// picture in portrait, and the home-screen icons. Output: tests/out/visual_mobile/*.png
// Run: node tests/visual/mobile_capture.js   (needs the preinstalled Playwright chromium)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../..');
const GAME = 'file://' + path.join(ROOT, 'game/index.html');
const OUT = path.resolve(__dirname, '../out/visual_mobile');
fs.mkdirSync(OUT, { recursive: true });

const DEVICES = [
  ['iphone-p', 393, 852, 3], ['iphone-l', 852, 393, 3], ['se-p', 375, 667, 2],
  ['ipad-p', 820, 1180, 2], ['ipad-l', 1180, 820, 2], ['ipadpro-l', 1366, 1024, 2]
];
const errs = [];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const shot = async (p, name) => { await p.screenshot({ path: path.join(OUT, name + '.png') }); console.log('  ' + name); };

async function open(b, dev, q) {
  const [name, w, h, dsf] = dev;
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: dsf, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(name + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(name + ': ' + String(e)));
  await p.goto(GAME + '?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.VC && VC.debug && VC.debug.mode !== 'boot', null, { timeout: 15000 });
  return { ctx, p };
}
const NOTCH = portrait => portrait
  ? '#safeProbe{padding:59px 0 34px 0 !important}.screen{padding:59px 0 34px 0 !important}'
  : '#safeProbe{padding:0 59px 21px 59px !important}.screen{padding:0 59px 21px 59px !important}';
async function notch(p, portrait) {
  await p.addStyleTag({ content: NOTCH(portrait) });
  await p.evaluate(() => VC.Game.relayout());
  await sleep(200);
}
// draw a fake notch / home bar on top so the screenshot shows where they would be
async function notchOverlay(p, portrait) {
  await p.evaluate(portrait => {
    const d = document.createElement('div'); d.id = 'qaNotch';
    d.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:99';
    d.innerHTML = portrait
      ? '<div style="position:absolute;top:11px;left:50%;width:126px;height:37px;margin-left:-63px;border-radius:20px;background:#000"></div><div style="position:absolute;bottom:8px;left:50%;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#111"></div>'
      : '<div style="position:absolute;left:11px;top:50%;width:37px;height:126px;margin-top:-63px;border-radius:20px;background:#000"></div><div style="position:absolute;bottom:8px;left:50%;width:140px;height:5px;margin-left:-70px;border-radius:3px;background:#111"></div>';
    document.body.appendChild(d);
  }, portrait);
}

async function screens(b, dev) {
  const name = dev[0];
  const { ctx, p } = await open(b, dev);
  await sleep(1500);
  await shot(p, `${name}_title`);
  for (const s of ['scrHow', 'scrSettings', 'scrCustom']) {
    await p.evaluate(s => VC.UI.show(s), s); await sleep(500);
    await shot(p, `${name}_${s.slice(3).toLowerCase()}`);
  }
  await p.evaluate(() => VC.UI.show('scrTitle'));
  // pause + game over from a real run
  await p.evaluate(() => VC.Game.startGame()); await sleep(2500);
  await shot(p, `${name}_play_start`);
  await p.evaluate(() => VC.Game.pause()); await sleep(500);
  await shot(p, `${name}_pause`);
  await p.evaluate(() => { VC.Game.resume(); const w = VC.debug.world; w.score = 12345; }); await sleep(200);
  await p.evaluate(() => VC.Game.gameOver()); await sleep(1200);
  await shot(p, `${name}_over`);
  await ctx.close();
}

async function zones(b, dev) {
  const name = dev[0];
  for (let lv = 0; lv < 4; lv++) {
    const { ctx, p } = await open(b, dev, `&autostart=1&bot=1&level=${lv}`);
    if (lv === 0) { await sleep(700); await shot(p, `${name}_banner`); }
    await sleep(lv === 0 ? 4300 : 5000);
    await shot(p, `${name}_zone${lv}`);
    await ctx.close();
  }
}

async function crossfade(b) {
  const dev = DEVICES[0];
  const { ctx, p } = await open(b, dev, '&autostart=1&bot=1&level=0');
  await sleep(3000);
  await p.evaluate(() => VC.debug.gotoLevel(1));
  await sleep(550);
  await shot(p, `${dev[0]}_crossfade`);
  await p.evaluate(() => { VC.debug.gotoLevel(3); }); await sleep(550);
  await shot(p, `${dev[0]}_crossfade_night`);
  await ctx.close();
}

async function notched(b) {
  for (const dev of [DEVICES[0], DEVICES[1]]) {
    const portrait = dev[2] > dev[1];
    const { ctx, p } = await open(b, dev);
    await notch(p, portrait); await sleep(800); await notchOverlay(p, portrait);
    await shot(p, `${dev[0]}_notch_title`);
    await p.evaluate(() => VC.UI.show('scrCustom')); await sleep(400);
    await shot(p, `${dev[0]}_notch_custom`);
    await p.evaluate(() => { VC.UI.show('scrTitle'); VC.Game.startGame(); }); await sleep(600);
    await p.evaluate(() => VC.Game.relayout());
    await p.evaluate(() => VC.debug.setBot && VC.debug.setBot(true));
    await sleep(3500);
    await shot(p, `${dev[0]}_notch_play`);
    await p.evaluate(() => VC.debug.gotoLevel(3)); await sleep(3000);
    await shot(p, `${dev[0]}_notch_zone3`);
    await ctx.close();
  }
}

async function customBg(b) {
  const dev = DEVICES[0];
  const { ctx, p } = await open(b, dev);
  await sleep(800);
  // generate a JPEG (a colourful "family photo"-like picture) via canvas in the page
  const b64 = await p.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 1200; c.height = 900; const g = c.getContext('2d');
    const gr = g.createLinearGradient(0, 0, 0, 900); gr.addColorStop(0, '#ff9ec7'); gr.addColorStop(0.55, '#ffd27a'); gr.addColorStop(1, '#5fb85c');
    g.fillStyle = gr; g.fillRect(0, 0, 1200, 900);
    for (let i = 0; i < 40; i++) { g.fillStyle = `hsla(${i * 37},80%,60%,.7)`; g.beginPath(); g.arc((i * 211) % 1200, (i * 97) % 600, 20 + (i % 5) * 14, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = '#fff'; g.font = 'bold 90px sans-serif'; g.fillText('FAMILY PHOTO', 260, 450);
    return c.toDataURL('image/jpeg', 0.85).split(',')[1];
  });
  const jpg = path.join(OUT, 'fixture_bg.jpg'); fs.writeFileSync(jpg, Buffer.from(b64, 'base64'));
  await p.evaluate(() => VC.UI.show('scrCustom')); await sleep(400);
  await p.evaluate(() => { VC.UI._pickSlot = 'bg_beach'; });
  await p.setInputFiles('#filePick', jpg);
  await sleep(1500);
  await shot(p, `${dev[0]}_custom_after_pick`);
  await p.evaluate(() => { VC.UI.show('scrTitle'); VC.Game.startGame(); VC.debug.setBot(true); }); await sleep(3500);
  await shot(p, `${dev[0]}_custom_bg_play`);
  await ctx.close();
}

async function icons(b) {
  const ctx = await b.newContext({ viewport: { width: 900, height: 560 } });
  const p = await ctx.newPage();
  // data: URIs (an about:blank page can't load file:// images)
  const ic = ['apple-touch-icon.png', 'icon-192.png', 'icon-512.png'].map(f => 'data:image/png;base64,' + fs.readFileSync(path.join(ROOT, 'game/assets/icons', f)).toString('base64') + '#' + f);
  await p.setContent(`<body style="margin:0;background:#2b2b33;display:flex;gap:24px;align-items:center;padding:20px;font:14px sans-serif;color:#ddd">
    ${ic.map(s => `<figure style="margin:0;text-align:center"><img src="${s}" style="width:180px;height:180px;border-radius:40px"><figcaption>${s.split('#')[1]} (rounded mask)</figcaption></figure>`).join('')}
    <figure style="margin:0;text-align:center"><img src="${ic[2]}" style="width:60px;height:60px;border-radius:13px"><img src="${ic[2]}" style="width:40px;height:40px;border-radius:9px;margin-left:8px"><figcaption>home-screen sizes</figcaption></figure></body>`);
  await sleep(500);
  await p.screenshot({ path: path.join(OUT, 'icons.png') }); console.log('  icons');
  await ctx.close();
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  try {
    if (process.argv.includes('--icons')) { await icons(b); return; }
    for (const dev of DEVICES) { console.log(dev[0]); await screens(b, dev); await zones(b, dev); }
    await crossfade(b); await notched(b); await customBg(b); await icons(b);
  } finally { await b.close(); }
  console.log(errs.length ? 'console errors:\n' + errs.join('\n') : 'no console errors');
})();
