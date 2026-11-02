// Visual QA capture: every screen at 4 viewports, every zone in play, zone crossfade, reel moments,
// catch / golden catch / snap, motion contact sheets, gem line-ups for colour-blind checks.
// Run:  NODE_PATH=$(npm root -g) node tests/visual/capture.js      (then python3 tests/visual/sheets.py is NOT needed:
// contact sheets + colour-blind sims are composed at the end of this script by an inline Python/Pillow call.)
// Time is frozen (setSpeed(0)) and advanced by hand with PR.Game.step so every frame is deterministic.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs'), { execFileSync } = require('child_process');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out'); fs.mkdirSync(OUT, { recursive: true });
const shot = n => path.join(OUT, 'visual_' + n + '.png');

const VIEWS = [
  { id: 'land1280', viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
  { id: 'land1024', viewport: { width: 1024, height: 768 }, deviceScaleFactor: 1 },
  { id: 'phone390', viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  { id: 'ipad1024', viewport: { width: 1024, height: 1366 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
];

// helpers injected into the page
function install() {
  const G = PR.Game, W = () => PR.debug.world;
  window.VQ = {
    freeze() { PR.debug.setSpeed(0); },
    adv(sec) {   // advance game + renderer by sec at 120 Hz, then draw
      const n = Math.max(1, Math.round(sec * 120));
      for (let i = 0; i < n; i++) { G.step(1 / 120); G.renderer.update(1 / 120); }
      G.renderer.draw(G.mode);
    },
    clearItems() { W().items.length = 0; },
    hookTop() { const w = W(), hk = w.hook; if (w.reel.active) w._endReel(); w._catching = false; hk.y = hk.prevY = w.layout.minHookY; hk.vy = 0; hk.holding = false; w.phase = 'roam'; w.invuln = 0; },
    place(kind, type, x, y, vx) {
      const w = W(), it = w._newItem(kind, type, y, 0, -1, kind === 'puffer' ? w.diff.pufferR : kind === 'gem' ? w.diff.gemR : 14, 0, 1, true);
      it.x = it.prevX = x; it.y = it.prevY = it.by = y; it.vx = vx || 0.001; it.bobAmp = 0;
      return it;
    },
    lineup() {   // one of each gem, a puffer and a fish, away from the hook column
      const w = W(), L = w.layout; this.clearItems();
      const ys = [L.bands[0] + 40, (L.bands[1] + L.bands[2]) / 2, L.bands[2] + 50];
      const xl = [L.holeX - 260, L.holeX - 170], xr = [L.holeX + 170, L.holeX + 260];
      this.place('gem', 'amethyst', xl[0], ys[0]); this.place('gem', 'emerald', xl[1], ys[1]);
      this.place('gem', 'ruby', xr[0], ys[2]); this.place('gem', 'gold', xr[1], ys[0]);
      this.place('puffer', 'puffer', xr[1], ys[1]); this.place('fish', 'a', xl[0], ys[2]); this.place('fish', 'b', xl[1] + 20, ys[2] - 50);
    },
    hookGem(type, depth) {   // put a gem on the hook (depth 0..1 of the hook range, default mid) and start the reel
      const w = W(), L = w.layout, hk = w.hook;
      hk.y = hk.prevY = L.minHookY + (L.maxHookY - L.minHookY) * (depth == null ? 0.5 : depth); w.phase = 'roam'; w.invuln = 0;
      const it = this.place('gem', type || 'emerald', hk.x, hk.y);
      w._startReel(it); return it.id;
    },
    // advance until the needle is in the wanted region: 'perfect' | 'good' | 'miss'
    waitNeedle(kind) {
      const r = W().reel;
      for (let i = 0; i < 600; i++) {
        const d = Math.abs(r.needle - r.zone);
        const ok = kind === 'perfect' ? d <= r.perfect / 2 * 0.8 : kind === 'good' ? d > r.perfect / 2 + 0.01 && d < r.width / 2 - 0.01 : d > r.width / 2 + 0.08;
        if (ok) return true;
        G.step(1 / 240); G.renderer.update(1 / 240);
      }
      return false;
    },
    tap() { W().press(); },
    cssBox(lx, ly, lw, lh) {   // logical rect → css clip
      const c = G.renderer.canvas.getBoundingClientRect(), k = c.width / G.renderer.VW;
      return { x: Math.max(0, c.left + lx * k), y: Math.max(0, c.top + ly * k), width: lw * k, height: lh * k };
    },
    info() { const w = W(); return { L: w.layout, VW: G.renderer.VW, VH: G.renderer.VH, hook: { x: w.hook.x, y: w.hook.y }, phase: w.phase, mode: G.mode }; }
  };
}

async function open(b, v, query) {
  const ctx = await b.newContext({ viewport: v.viewport, deviceScaleFactor: v.deviceScaleFactor, hasTouch: !!v.hasTouch, isMobile: !!v.isMobile });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(v.id + ': ' + e));
  p.on('console', m => { if (m.type() === 'error') errs.push(v.id + ': ' + m.text()); });
  await p.goto(GAME + '?mute=1&adaptive=0&seed=7' + (query || ''));
  await p.waitForFunction(() => window.PR && PR.debug && PR.debug.mode && PR.debug.mode !== 'boot', null, { timeout: 15000 });
  await p.evaluate(install);
  await p.waitForTimeout(400);
  return p;
}
const errs = [];
const sheets = [];   // {name, frames:[paths]}

async function frames(p, name, n, dt, clip) {
  const list = [];
  for (let i = 0; i < n; i++) {
    const f = shot(name + '_f' + i);
    await p.screenshot({ path: f, clip });
    list.push(f);
    await p.evaluate(d => VQ.adv(d), dt);
  }
  sheets.push({ name, frames: list });
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------- every screen at every viewport ----------
  for (const v of VIEWS) {
    const p = await open(b, v);
    await p.waitForTimeout(3000);
    await p.screenshot({ path: shot(v.id + '_title') });
    for (const s of ['scrHow', 'scrSettings', 'scrCustom']) {
      await p.evaluate(id => PR.UI.open(id, 'scrTitle'), s);
      await p.waitForTimeout(500);
      await p.screenshot({ path: shot(v.id + '_' + s.slice(3).toLowerCase()) });
    }
    await p.evaluate(() => { PR.UI.show('scrTitle'); PR.debug.startGame(); });
    await p.waitForTimeout(1200);
    await p.screenshot({ path: shot(v.id + '_start') });          // banner + hint, no bot
    await p.evaluate(() => PR.debug.setBot(true, 0.9));
    await p.waitForTimeout(3500);
    await p.screenshot({ path: shot(v.id + '_play') });
    await p.evaluate(() => PR.Game.pause());
    await p.waitForTimeout(400);
    await p.screenshot({ path: shot(v.id + '_pause') });
    await p.evaluate(() => { PR.Game.resume(); PR.debug.setBot(false); const w = PR.debug.world; w.lines = 1; w.invuln = 0; w.phase = 'roam'; w._snap({ x: 0, y: 300 }); });
    await p.waitForFunction(() => PR.debug.mode === 'over', null, { timeout: 15000 });
    await p.waitForTimeout(900);
    await p.screenshot({ path: shot(v.id + '_over') });
    // reel meter in this layout
    await p.evaluate(() => { PR.debug.startGame(); });
    await p.waitForTimeout(300);
    await p.evaluate(() => { VQ.freeze(); VQ.adv(3.0); VQ.hookGem('ruby'); VQ.adv(0.3); });
    await p.screenshot({ path: shot(v.id + '_reel') });
    await p.context().close();
  }

  // ---------- zones in play (landscape 1280 + phone) ----------
  for (const v of [VIEWS[0], VIEWS[2]]) {
    const p = await open(b, v, '&autostart=1&bot=1&skill=0.9');
    await p.waitForFunction(() => PR.debug.mode === 'playing');
    for (let z = 0; z < 4; z++) {
      await p.evaluate(l => { PR.debug.setSpeed(1); PR.debug.gotoLevel(l); }, z);
      await p.waitForTimeout(z === 0 ? 4000 : 3600);
      await p.screenshot({ path: shot(v.id + '_zone' + z + '_play') });
      await p.waitForTimeout(1500);
      await p.evaluate(() => { VQ.freeze(); PR.debug.setBot(false); VQ.hookTop(); VQ.lineup(); VQ.adv(0.05); });
      await p.screenshot({ path: shot(v.id + '_zone' + z + '_lineup') });
      await p.evaluate(() => { VQ.clearItems(); PR.debug.setBot(true, 0.9); });
    }
    await p.context().close();
  }

  // ---------- mechanics moments (1280×720, frozen time) ----------
  const v = VIEWS[0];
  const p = await open(b, v, '&autostart=1');
  await p.waitForFunction(() => PR.debug.mode === 'playing');
  await p.evaluate(() => { VQ.freeze(); VQ.adv(3); });   // past the banner
  const I = await p.evaluate(() => VQ.info());
  const col = await p.evaluate(i => VQ.cssBox(i.L.holeX - 330, 0, 660, i.VH), I);   // hook column + reel meter

  // zone transition crossfade, 3 frames
  await p.evaluate(() => { VQ.clearItems(); PR.debug.gotoLevel(1); VQ.adv(0.02); });
  for (let i = 0; i < 3; i++) { await p.screenshot({ path: shot('xfade_' + i) }); await p.evaluate(() => VQ.adv(0.36)); }
  await p.evaluate(() => { PR.debug.gotoLevel(0); VQ.adv(3); VQ.clearItems(); });

  // sinking hook
  await p.evaluate(() => { VQ.hookTop(); VQ.adv(0.05); VQ.tap(); });
  await frames(p, 'sheet_sink', 8, 0.06, col);
  await p.evaluate(() => PR.debug.world.release());

  // reel moments (deep gem so the reel lasts): idle, good, slip, perfect
  await p.evaluate(() => { VQ.clearItems(); VQ.hookGem('ruby', 0.95); VQ.adv(0.4); });
  await p.screenshot({ path: shot('reel_idle') });
  await p.evaluate(() => { VQ.waitNeedle('good'); VQ.tap(); VQ.adv(0.08); });
  await p.screenshot({ path: shot('reel_good') });
  await p.evaluate(() => { VQ.adv(0.3); VQ.waitNeedle('miss'); VQ.tap(); VQ.adv(0.08); });
  await p.screenshot({ path: shot('reel_slip') });
  await p.evaluate(() => { VQ.adv(0.3); VQ.waitNeedle('perfect'); VQ.tap(); VQ.adv(0.08); });
  await p.screenshot({ path: shot('reel_perfect') });
  // tug contact sheet (perfect tap)
  await p.evaluate(() => { VQ.adv(0.4); VQ.waitNeedle('perfect'); VQ.tap(); });
  await frames(p, 'sheet_tug', 8, 0.06, col);
  // slip contact sheet
  await p.evaluate(() => { VQ.adv(0.4); VQ.waitNeedle('miss'); VQ.tap(); });
  await frames(p, 'sheet_slip', 8, 0.06, col);
  // catch: a shallow hooked gem, one perfect tap lands it; frames of the gem flying into the bucket
  await p.evaluate(() => { VQ.adv(1); VQ.clearItems(); VQ.hookGem('emerald', 0.04); VQ.adv(0.3); VQ.waitNeedle('perfect'); VQ.tap();
    for (let i = 0; i < 120 && !PR.debug.world.items.some(it => it.state === 'caught'); i++) VQ.adv(1 / 120); });
  const wide = await p.evaluate(i => VQ.cssBox(i.L.holeX - 330, 0, 660, 330), I);
  await frames(p, 'sheet_catch', 8, 0.06, wide);
  await p.evaluate(() => VQ.adv(1.2));

  // golden gem catch: same, full frame at the landing moment
  await p.evaluate(() => { VQ.clearItems(); VQ.hookGem('gold', 0.6); VQ.adv(0.3); });
  await p.screenshot({ path: shot('gold_reel') });
  await p.evaluate(() => { const w = PR.debug.world; for (let i = 0; i < 40 && w.phase === 'reel' && !w._catching; i++) { VQ.waitNeedle('perfect'); VQ.tap(); VQ.adv(0.02); if (!w._catching) VQ.adv(0.3); } });
  await p.evaluate(() => { for (let i = 0; i < 120 && !PR.debug.world.items.some(it => it.state === 'caught'); i++) VQ.adv(1 / 120); VQ.adv(0.1); });
  await p.screenshot({ path: shot('gold_catch') });
  await p.evaluate(() => VQ.adv(0.25));
  await p.screenshot({ path: shot('gold_catch_b') });
  await p.evaluate(() => VQ.adv(1.5));

  // golden gem swimming (hint text) — spawn and let it come in
  await p.evaluate(() => { VQ.clearItems(); VQ.hookTop(); const it = PR.debug.spawnGold(); it.x = it.prevX = PR.debug.world.layout.holeX - 250; VQ.adv(0.5); });
  await p.screenshot({ path: shot('gold_swim') });

  // pufferfish snap: a puffer swims into the parked hook
  await p.evaluate(() => {
    VQ.clearItems(); VQ.hookTop(); const w = PR.debug.world, L = w.layout;
    w.hook.y = w.hook.prevY = (L.bands[1] + L.bands[2]) / 2; w.hook.holding = true; w.lines = 3;
    const pf = VQ.place('puffer', 'puffer', w.hook.x - 70, w.hook.y + 20, 120);
    for (let i = 0; i < 240 && w.phase === 'roam'; i++) { w.hook.holding = true; w.hook.vy = 0; VQ.adv(1 / 120); }
    if (w.phase === 'roam') { w._snap(pf); VQ.adv(1 / 60); }
  });
  await frames(p, 'sheet_snap', 8, 0.06, col);
  await p.evaluate(() => VQ.adv(0.3));
  await p.screenshot({ path: shot('snap_after') });
  await p.context().close();
  await b.close();

  fs.writeFileSync(path.join(OUT, 'visual_sheets.json'), JSON.stringify(sheets));
  // contact sheets + colour-blind simulation with Pillow
  execFileSync('python3', ['-I', '-c', PY, OUT], { stdio: 'inherit' });
  console.log(errs.length ? 'ERRORS:\n' + errs.join('\n') : 'no console errors');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });

const PY = String.raw`
import sys, json, os
from PIL import Image, ImageDraw
out = sys.argv[1]
for s in json.load(open(os.path.join(out, 'visual_sheets.json'))):
    ims = [Image.open(f).convert('RGB') for f in s['frames']]
    w, h = ims[0].size; k = min(1.0, 330 / w); tw, th = int(w * k), int(h * k)
    cols = 4; rows = (len(ims) + cols - 1) // cols
    sheet = Image.new('RGB', (cols * tw + (cols + 1) * 6, rows * (th + 20) + 6), (20, 20, 28))
    d = ImageDraw.Draw(sheet)
    for i, im in enumerate(ims):
        x = 6 + (i % cols) * (tw + 6); y = 6 + (i // cols) * (th + 20)
        sheet.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 14)); d.text((x, y), f"{s['name']} t={i*60}ms", fill=(255, 255, 255))
    sheet.save(os.path.join(out, 'visual_' + s['name'] + '.png'))
    for f in s['frames']: os.remove(f)
# colour-blind simulation (Machado et al. 2009, severity 1.0) on the zone line-ups
M = {'deutan': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
     'protan': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]]}
def lin(c): c /= 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
def srgb(c): c = max(0, min(1, c)); return round(255 * (12.92 * c if c <= 0.0031308 else 1.055 * c ** (1 / 2.4) - 0.055))
L2S = [srgb(i / 4095) for i in range(4096)]
S2L = [lin(float(i)) for i in range(256)]
for z in range(4):
    src = os.path.join(out, f'visual_land1280_zone{z}_lineup.png')
    if not os.path.exists(src): continue
    im = Image.open(src).convert('RGB')
    for name, m in M.items():
        px = im.load(); o = Image.new('RGB', im.size); po = o.load()
        cache = {}
        for y in range(im.size[1]):
            for x in range(im.size[0]):
                c = px[x, y]
                if c not in cache:
                    r, g, b = S2L[c[0]], S2L[c[1]], S2L[c[2]]
                    cache[c] = tuple(L2S[int(max(0, min(1, m[i][0]*r + m[i][1]*g + m[i][2]*b)) * 4095)] for i in range(3))
                po[x, y] = cache[c]
        o.save(os.path.join(out, f'visual_cb_{name}_zone{z}.png'))
`;
