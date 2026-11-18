// Visual QA pass 2 (art director): every screen at 960×540, 390×844 (DPR 3, touch) and 844×390 (DPR 3, touch),
// every weather level in play, a level transition, gust warning + windsock both ways, reel meter incl. golden snowflake,
// motion contact sheets (sink/rise, gust sway, catch arc, slip/escape, snap+puff, level-up), custom-picture gameplay,
// colour-blind simulations. Raw PNGs → tests/out/vqa/; small JPEG sheets → docs/reports/visual/.
// Run:  NODE_PATH=$(npm root -g) node tests/visual/vqa.js
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
// served over http (file:// taints canvases, so the Score Card cannot be made there)
const PORT = 47690 + Math.floor(Math.random() * 200);
const GAME = 'http://127.0.0.1:' + PORT + '/index.html';
const srv = require('child_process').spawn('python3', ['-m', 'http.server', String(PORT), '--bind', '127.0.0.1'], { cwd: path.resolve(__dirname, '../../game'), stdio: 'ignore' });
process.on('exit', () => srv.kill());
const OUT = path.resolve(__dirname, '../out/vqa'); fs.mkdirSync(OUT, { recursive: true });
const REP = path.resolve(__dirname, '../../docs/reports/visual'); fs.mkdirSync(REP, { recursive: true });
const shot = n => path.join(OUT, n + '.png');
const VIEWS = [
  { id: 'd960', viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 },
  { id: 'p390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { id: 'l844', viewport: { width: 844, height: 390 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true }
];
const errs = [], sheets = [];

function install() {
  const G = PR.Game, W = () => PR.debug.world;
  window.VQ = {
    freeze() { PR.debug.setSpeed(0); },
    adv(sec) { const n = Math.max(1, Math.round(sec * 120)); for (let i = 0; i < n; i++) { G.step(1 / 120); G.renderer.update(1 / 120); } G.renderer.draw(G.mode); },
    clearItems() { W().items.length = 0; },
    hookTop() { const w = W(), hk = w.hook; if (w.reel.active) w._endReel(); w._catching = false; hk.y = hk.prevY = w.layout.minHookY; hk.vy = 0; hk.holding = false; w.phase = 'roam'; w.invuln = 0; },
    place(kind, type, x, y, vx) {
      const w = W(), it = w._newItem(kind, type, y, 0, -1, kind === 'gummy' ? w.diff.gummyR : kind === 'flake' ? w.diff.flakeR : 14, 0, 1, true);
      it.x = it.prevX = x; it.y = it.prevY = it.by = y; it.vx = vx || 0.001; it.bobAmp = 0; return it;
    },
    lineup() {
      const w = W(), L = w.layout; this.clearItems();
      const narrow = G.renderer.VW < 700, dx = narrow ? 0.6 : 1;
      const ys = [L.bands[0] + 40, (L.bands[1] + L.bands[2]) / 2, L.bands[2] + 50];
      const xl = [L.holeX - 260 * dx, L.holeX - 170 * dx], xr = [L.holeX + 170 * dx, L.holeX + 260 * dx];
      this.place('flake', 'berry', xl[0], ys[0]); this.place('flake', 'lime', xl[1], ys[1]);
      this.place('flake', 'grape', xr[0], ys[2]); this.place('flake', 'gold', xr[1], ys[0]);
      this.place('gummy', 'gummy', xr[1], ys[1]); this.place('fish', 'a', xl[0], ys[2]); this.place('fish', 'b', xl[1] + 20, ys[2] - 50);
    },
    hookFlake(type, depth) {
      const w = W(), L = w.layout, hk = w.hook;
      hk.y = hk.prevY = L.minHookY + (L.maxHookY - L.minHookY) * (depth == null ? 0.5 : depth); w.phase = 'roam'; w.invuln = 0;
      const it = this.place('flake', type || 'lime', hk.x, hk.y); w._startReel(it); return it.id;
    },
    waitNeedle(kind) {
      const r = W().reel;
      for (let i = 0; i < 600; i++) {
        const d = Math.abs(r.needle - r.zone);
        const ok = kind === 'perfect' ? d <= r.perfect / 2 * 0.8 : kind === 'good' ? d > r.perfect / 2 + 0.01 && d < r.width / 2 - 0.01 : d > r.width / 2 + 0.08;
        if (ok) return true; G.step(1 / 240); G.renderer.update(1 / 240);
      }
      return false;
    },
    tap() { W().press(); },
    cssBox(lx, ly, lw, lh) { const c = G.renderer.canvas.getBoundingClientRect(), k = c.width / G.renderer.VW; return { x: Math.max(0, c.left + lx * k), y: Math.max(0, c.top + ly * k), width: Math.min(lw * k, c.width), height: Math.min(lh * k, c.height) }; },
    info() { const w = W(), R = G.renderer; return { L: w.layout, VW: R.VW, VH: R.VH, ins: R.ins, px: R.px, hook: { x: w.hook.x, y: w.hook.y }, sock: R.sockPos(w), pill: R.pillRect(w), hudBtn: R._hudBtn }; }
  };
}
async function open(b, v, query) {
  const ctx = await b.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, hasTouch: !!v.hasTouch, isMobile: !!v.isMobile });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(v.id + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(v.id + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&adaptive=0&seed=7' + (query || ''));
  await p.waitForFunction(() => window.PR && PR.debug && PR.debug.mode && PR.debug.mode !== 'boot', null, { timeout: 15000 });
  await p.evaluate(install); await p.waitForTimeout(400);
  return p;
}
async function frames(p, name, n, dt, clip, between) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const f = shot(name + '_f' + i); await p.screenshot({ path: f, clip }); list.push(f);
    if (between) await p.evaluate(between, i);
    await p.evaluate(d => VQ.adv(d), dt);
  }
  sheets.push({ name, frames: list, dt });
}
const geo = {};

(async () => {
  await new Promise(r => setTimeout(r, 800));
  const b = await chromium.launch();
  for (const v of VIEWS) {
    // ---- screens ----
    let p = await open(b, v);
    await p.waitForTimeout(2500);
    await p.screenshot({ path: shot(v.id + '_title') });
    for (const s of ['scrHow', 'scrSettings', 'scrCustom']) {
      await p.evaluate(id => PR.UI.open(id, 'scrTitle'), s); await p.waitForTimeout(500);
      await p.screenshot({ path: shot(v.id + '_' + s.slice(3).toLowerCase()) });
      const ov = await p.evaluate(id => { const sc = document.getElementById(id), pn = sc.querySelector('.panel'); const r = pn.getBoundingClientRect(); return { panelH: Math.round(r.height), scrollH: pn.scrollHeight, clientH: pn.clientHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), vh: innerHeight, over: [...pn.querySelectorAll('*')].filter(e => e.scrollWidth > e.clientWidth + 2 && getComputedStyle(e).overflowX !== 'visible').map(e => e.id || e.className).slice(0, 5) }; }, s);
      geo[v.id + '_' + s] = ov;
    }
    await p.evaluate(() => { PR.UI.show('scrTitle'); PR.debug.startGame(); });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: shot(v.id + '_start') });
    await p.evaluate(() => PR.debug.setBot(true, 0.9)); await p.waitForTimeout(3500);
    await p.screenshot({ path: shot(v.id + '_play') });
    geo[v.id + '_play'] = await p.evaluate(() => VQ.info());
    await p.evaluate(() => PR.Game.pause()); await p.waitForTimeout(400);
    await p.screenshot({ path: shot(v.id + '_pause') });
    await p.evaluate(() => { PR.Game.resume(); PR.debug.setBot(false); const w = PR.debug.world; w.score = 1240; w.lines = 1; w.invuln = 0; w.phase = 'roam'; w._snap({ x: 0, y: 300 }); });
    await p.waitForFunction(() => PR.debug.mode === 'over', null, { timeout: 15000 });
    await p.waitForTimeout(900);
    await p.screenshot({ path: shot(v.id + '_over') });
    await p.evaluate(() => document.getElementById('btnScoreCard').click());
    await p.waitForFunction(() => { const m = document.getElementById('scScreen'); const i = document.getElementById('scImg'); return m && !m.classList.contains('hidden') && i && i.complete && i.naturalWidth > 0; }, null, { timeout: 8000 }).catch(() => {});
    await p.waitForTimeout(500);
    await p.screenshot({ path: shot(v.id + '_scorecard') });
    await p.context().close();

    // ---- levels in play + line-ups + gusts ----
    p = await open(b, v, '&autostart=1&bot=1&skill=0.9');
    await p.waitForFunction(() => PR.debug.mode === 'playing');
    for (let z = 0; z < 4; z++) {
      await p.evaluate(l => { PR.debug.setSpeed(1); PR.debug.gotoLevel(l); }, z);
      await p.waitForTimeout(z === 0 ? 4000 : 3400);
      await p.screenshot({ path: shot(v.id + '_level' + z + '_play') });
      await p.waitForTimeout(1200);
      await p.evaluate(() => { VQ.freeze(); PR.debug.setBot(false); VQ.hookTop(); VQ.lineup(); VQ.adv(0.05); });
      await p.screenshot({ path: shot(v.id + '_level' + z + '_lineup') });
      await p.evaluate(() => { VQ.clearItems(); PR.debug.setBot(true, 0.9); });
    }
    // reel meter with a golden snowflake (frozen)
    await p.evaluate(() => { PR.debug.setBot(false); PR.debug.gotoLevel(0); VQ.freeze(); VQ.adv(3); VQ.clearItems(); VQ.hookFlake('gold', 0.55); VQ.adv(0.35); });
    await p.screenshot({ path: shot(v.id + '_reel_gold') });
    await p.evaluate(() => { const w = PR.debug.world; w._endReel(); VQ.clearItems(); VQ.hookTop(); });
    // windsock both directions + gust warning: wind level, deep hook
    await p.evaluate(() => { PR.debug.gotoLevel(2); VQ.adv(3); VQ.clearItems(); const w = PR.debug.world; w.hook.y = w.hook.prevY = w.layout.maxHookY - 20; PR.debug.gust(1, true); VQ.adv(2.5); });
    await p.screenshot({ path: shot(v.id + '_sock_right') });
    await p.evaluate(() => { PR.debug.gust(-1); VQ.adv(0.6); });
    await p.screenshot({ path: shot(v.id + '_gustwarn_left') });
    await p.evaluate(() => VQ.adv(3));
    await p.screenshot({ path: shot(v.id + '_sock_left') });
    await p.context().close();
  }

  // ---- motion contact sheets (960×540, frozen time) ----
  const v = VIEWS[0];
  let p = await open(b, v, '&autostart=1');
  await p.waitForFunction(() => PR.debug.mode === 'playing');
  await p.evaluate(() => { VQ.freeze(); VQ.adv(3); });
  const I = await p.evaluate(() => VQ.info());
  const col = await p.evaluate(i => VQ.cssBox(i.L.holeX - 260, 40, 520, i.VH - 40), I);
  // transition crossfade
  await p.evaluate(() => { VQ.clearItems(); PR.debug.gotoLevel(1); VQ.adv(0.02); });
  await frames(p, 'sheet_levelup', 8, 0.33, undefined);
  await p.evaluate(() => { PR.debug.gotoLevel(0); VQ.adv(3); VQ.clearItems(); });
  // sink then rise
  await p.evaluate(() => { VQ.hookTop(); VQ.adv(0.05); VQ.tap(); });
  await frames(p, 'sheet_sink_rise', 12, 0.12, col, i => { if (i === 6) PR.debug.world.release(); });
  // hook sway in a gust (deep hook held)
  await p.evaluate(() => { const w = PR.debug.world; VQ.clearItems(); w.hook.y = w.hook.prevY = w.layout.maxHookY - 10; w.hook.holding = true; PR.debug.gust(1, true); VQ.adv(3); w.hook.holding = true; PR.debug.gust(-1, true); });
  await frames(p, 'sheet_gust_sway', 8, 0.2, col, () => { PR.debug.world.hook.holding = true; });
  await p.evaluate(() => PR.debug.world.release());
  // catch arc
  await p.evaluate(() => { VQ.adv(1); VQ.clearItems(); VQ.hookFlake('lime', 0.04); VQ.adv(0.3); VQ.waitNeedle('perfect'); VQ.tap();
    for (let i = 0; i < 120 && !PR.debug.world.items.some(it => it.state === 'caught'); i++) VQ.adv(1 / 120); });
  const wide = await p.evaluate(i => VQ.cssBox(i.L.holeX - 260, 0, 520, 300), I);
  await frames(p, 'sheet_catch', 8, 0.08, wide);
  await p.evaluate(() => VQ.adv(1.2));
  // slip ×3 → escape
  await p.evaluate(() => { VQ.clearItems(); VQ.hookFlake('grape', 0.9); VQ.adv(0.4); VQ.waitNeedle('miss'); VQ.tap(); VQ.adv(0.35); VQ.waitNeedle('miss'); VQ.tap(); VQ.adv(0.35); VQ.waitNeedle('miss'); VQ.tap(); });
  await frames(p, 'sheet_escape', 8, 0.12, col);
  await p.evaluate(() => VQ.adv(2));
  // gummy snap + puff
  await p.evaluate(() => {
    VQ.clearItems(); VQ.hookTop(); const w = PR.debug.world, L = w.layout;
    w.hook.y = w.hook.prevY = (L.bands[1] + L.bands[2]) / 2; w.hook.holding = true; w.lines = 3;
    const pf = VQ.place('gummy', 'gummy', w.hook.x - 70, w.hook.y + 20, 120);
    for (let i = 0; i < 240 && w.phase === 'roam'; i++) { w.hook.holding = true; w.hook.vy = 0; VQ.adv(1 / 120); }
    if (w.phase === 'roam') { w._snap(pf); VQ.adv(1 / 60); }
  });
  await frames(p, 'sheet_snap', 8, 0.1, col);
  await p.context().close();

  // ---- custom pictures in play (960 and phone) ----
  for (const cv of [VIEWS[0], VIEWS[1]]) {
    p = await open(b, cv);
    await p.evaluate(async () => {
      const mk = (w, h, draw, type) => new Promise(r => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); c.toBlob(bl => r(new File([bl], 'x.' + (type === 'image/png' ? 'png' : 'jpg'), { type })), type, 0.9); });
      const hero = await mk(300, 300, g => { g.fillStyle = '#7b4bd6'; g.beginPath(); g.arc(150, 160, 120, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(110, 130, 22, 0, 7); g.arc(190, 130, 22, 0, 7); g.fill(); g.fillStyle = '#222'; g.beginPath(); g.arc(112, 134, 10, 0, 7); g.arc(192, 134, 10, 0, 7); g.fill(); }, 'image/png');
      const flake = await mk(400, 300, g => { const gr = g.createLinearGradient(0, 0, 400, 300); gr.addColorStop(0, '#f6c'); gr.addColorStop(1, '#fd5'); g.fillStyle = gr; g.fillRect(0, 0, 400, 300); g.fillStyle = '#333'; g.font = 'bold 120px sans-serif'; g.fillText('☺', 130, 200); }, 'image/jpeg');
      const gum = await mk(240, 200, g => { g.fillStyle = '#2a2'; g.fillRect(30, 40, 180, 120); g.fillStyle = '#fff'; g.fillRect(150, 70, 30, 30); }, 'image/png');
      const bg = await mk(1600, 1000, g => { const gr = g.createLinearGradient(0, 0, 0, 1000); gr.addColorStop(0, '#ffefc0'); gr.addColorStop(0.45, '#7ac'); gr.addColorStop(1, '#134'); g.fillStyle = gr; g.fillRect(0, 0, 1600, 1000); for (let i = 0; i < 60; i++) { g.fillStyle = `hsl(${i * 47 % 360},70%,60%)`; g.beginPath(); g.arc((i * 911) % 1600, (i * 577) % 1000, 30 + i % 50, 0, 7); g.fill(); } }, 'image/jpeg');
      await PR.Assets.setCustom('hero', hero); await PR.Assets.setCustom('flake', flake); await PR.Assets.setCustom('gummy', gum); await PR.Assets.setCustom('bg_sunny', bg);
      PR.Assets._ver = (PR.Assets._ver || 0) + 1;
    });
    await p.evaluate(() => { PR.debug.startGame(); });
    await p.waitForTimeout(500);
    await p.evaluate(() => { VQ.freeze(); VQ.adv(3); VQ.hookTop(); VQ.lineup(); VQ.adv(0.05); });
    await p.screenshot({ path: shot(cv.id + '_custom_play') });
    await p.evaluate(() => { VQ.clearItems(); VQ.hookFlake('berry', 0.4); VQ.adv(0.3); });
    await p.screenshot({ path: shot(cv.id + '_custom_reel') });
    await p.context().close();
  }
  // ---- simulated iPhone safe areas (Chromium reports 0 insets): notch 47 px + home bar 34/21 px ----
  for (const [v, pad] of [[VIEWS[1], '47px 0px 34px 0px'], [VIEWS[2], '0px 47px 21px 47px']]) {
    p = await open(b, v, '&autostart=1&bot=1&skill=0.9');
    await p.addStyleTag({ content: `#safeProbe,.screen{padding:${pad}!important}` });
    await p.evaluate(() => PR.Game.relayout()); await p.waitForTimeout(3500);
    await p.evaluate(() => { VQ.freeze(); PR.debug.setBot(false); VQ.clearItems(); VQ.hookFlake('lime', 0.98); VQ.adv(0.3); });
    await p.screenshot({ path: shot(v.id + '_safe_play') });
    geo[v.id + '_safe'] = await p.evaluate(() => VQ.info());
    await p.evaluate(() => { PR.debug.setSpeed(1); const w = PR.debug.world; w._endReel(); w.lines = 1; w.phase = 'roam'; w.invuln = 0; w._snap({ x: 0, y: 300 }); });
    await p.waitForFunction(() => PR.debug.mode === 'over', null, { timeout: 15000 }); await p.waitForTimeout(900);
    await p.screenshot({ path: shot(v.id + '_safe_over') });
    await p.context().close();
  }
  await b.close();
  fs.writeFileSync(path.join(OUT, 'sheets.json'), JSON.stringify(sheets));
  fs.writeFileSync(path.join(OUT, 'geo.json'), JSON.stringify(geo, null, 1));
  execFileSync('python3', ['-I', '-c', PY, OUT, REP], { stdio: 'inherit' });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

const PY = String.raw`
import sys, json, os, glob
from PIL import Image, ImageDraw
out, rep = sys.argv[1], sys.argv[2]
def save(im, name, maxw=1100, q=72):
    if im.width > maxw: im = im.resize((maxw, int(im.height * maxw / im.width)), Image.LANCZOS)
    im.convert('RGB').save(os.path.join(rep, name + '.jpg'), quality=q, optimize=True)
for s in json.load(open(os.path.join(out, 'sheets.json'))):
    ims = [Image.open(f).convert('RGB') for f in s['frames']]
    w, h = ims[0].size; k = min(1.0, 260 / w); tw, th = int(w * k), int(h * k)
    cols = 4; rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw + (cols + 1) * 6, rows * (th + 18) + 6), (20, 20, 28)); d = ImageDraw.Draw(sheet)
    for i, im in enumerate(ims):
        x = 6 + (i % cols) * (tw + 6); y = 6 + (i // cols) * (th + 18)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 14)); d.text((x, y), f"{s['name']} t={int(i*s['dt']*1000)}ms", fill=(255, 255, 255))
    sheet.save(os.path.join(out, s['name'] + '.png')); save(sheet, s['name'])
M = {'deutan': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
     'protan': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]}
def lin(c): c /= 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def srgb(c): c = max(0, min(1, c)); return round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055))
L2S = [srgb(i / 4095) for i in range(4096)]; S2L = [lin(float(i)) for i in range(256)]
def sim(im, m):
    lut = {}
    px = list(im.getdata()); o = []
    for c in px:
        r = lut.get(c)
        if r is None:
            a, b, cc = S2L[c[0]], S2L[c[1]], S2L[c[2]]
            r = tuple(L2S[int(max(0, min(1, m[i][0]*a + m[i][1]*b + m[i][2]*cc)) * 4095)] for i in range(3)); lut[c] = r
        o.append(r)
    n = Image.new('RGB', im.size); n.putdata(o); return n
# colour-blind strip: normal / deutan / protan of each 960 line-up, scaled to half
for z in range(4):
    src = os.path.join(out, f'd960_level{z}_lineup.png')
    if not os.path.exists(src): continue
    im = Image.open(src).convert('RGB').resize((480, 270), Image.LANCZOS)
    strip = Image.new('RGB', (480 * 3 + 8, 270 + 16), (20, 20, 28)); d = ImageDraw.Draw(strip)
    for i, (nm, m) in enumerate([('normal', None)] + list(M.items())):
        strip.paste(im if m is None else sim(im, m), (i * 484, 16)); d.text((i * 484 + 4, 2), f'level {z} {nm}', fill=(255, 255, 255))
    save(strip, f'cb_level{z}', maxw=1452)
# small-size readability: phone line-ups at 1/3 (≈ 1x css) side by side
ims = [Image.open(os.path.join(out, f'p390_level{z}_lineup.png')).convert('RGB') for z in range(4) if os.path.exists(os.path.join(out, f'p390_level{z}_lineup.png'))]
if ims:
    tw, th = 260, int(260 * ims[0].height / ims[0].width); s = Image.new('RGB', (len(ims) * (tw + 6), th), (20, 20, 28))
    for i, im in enumerate(ims): s.paste(im.resize((tw, th), Image.LANCZOS), (i * (tw + 6), 0))
    save(s, 'phone_levels_lineup', maxw=1100)
# screen boards per view
for v in ['d960', 'p390', 'l844']:
    names = ['title', 'how', 'settings', 'custom', 'start', 'play', 'pause', 'over', 'scorecard']
    ims = [(n, Image.open(os.path.join(out, f'{v}_{n}.png')).convert('RGB')) for n in names if os.path.exists(os.path.join(out, f'{v}_{n}.png'))]
    w0, h0 = ims[0][1].size; tw = 300 if w0 > h0 else 150; th = int(tw * h0 / w0); cols = 3 if w0 > h0 else 5
    rows = (len(ims) + cols - 1) // cols
    s = Image.new('RGB', (cols * (tw + 6) + 6, rows * (th + 18) + 6), (20, 20, 28)); d = ImageDraw.Draw(s)
    for i, (n, im) in enumerate(ims):
        x = 6 + (i % cols) * (tw + 6); y = 6 + (i // cols) * (th + 18)
        s.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 14)); d.text((x, y), f'{v} {n}', fill=(255, 255, 255))
    save(s, f'screens_{v}', maxw=1000)
    lv = [(n, Image.open(os.path.join(out, f'{v}_{n}.png')).convert('RGB')) for n in ['level0_play', 'level1_play', 'level2_play', 'level3_play', 'reel_gold', 'sock_right', 'gustwarn_left', 'sock_left', 'custom_play', 'custom_reel'] if os.path.exists(os.path.join(out, f'{v}_{n}.png'))]
    rows = (len(lv) + cols - 1) // cols
    s = Image.new('RGB', (cols * (tw + 6) + 6, rows * (th + 18) + 6), (20, 20, 28)); d = ImageDraw.Draw(s)
    for i, (n, im) in enumerate(lv):
        x = 6 + (i % cols) * (tw + 6); y = 6 + (i // cols) * (th + 18)
        s.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 14)); d.text((x, y), f'{v} {n}', fill=(255, 255, 255))
    save(s, f'play_{v}', maxw=1000)
`;
