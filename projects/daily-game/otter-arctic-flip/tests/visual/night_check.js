// Visual QA (art director pass): night readability, popups vs Ollie, banner vs hazards, extra viewport 1366×1024.
// Output: tests/out/visual/night/*.png + a JSON summary on stdout.   Run: node tests/visual/night_check.js [part=night,overlap,screens]
// Night: the floor's light is forced to the worst case (0.32, the end of the Lantern Deck) and the game is stepped
// frame-exactly; a full screenshot is taken at the moment each hazard enters the reaction window (seeAhead units ahead)
// and when it first enters the screen, plus a luminance contrast number for the hazard box vs. its surround.
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
const GAME = 'file://' + path.resolve(__dirname, '../../game/index.html');
const OUT = path.resolve(__dirname, '../out/visual/night'); fs.mkdirSync(OUT, { recursive: true });
const part = (process.argv.find(a => a.startsWith('part=')) || '').slice(5).split(',').filter(Boolean);
const want = n => !part.length || part.includes(n);
const VIEWS = {
  small: { viewport: { width: 960, height: 540 } },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  ipadP: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  ipadPro: { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true }
};
const out = { night: [], overlap: [], banner: [] };

async function open(b, view, q) {
  const ctx = await b.newContext(VIEWS[view]);
  const p = await ctx.newPage();
  p.on('pageerror', e => console.log(view + ' pageerror: ' + e));
  await p.goto(GAME + '?mute=1' + (/seed=/.test(q || '') ? '' : '&seed=11') + (q || ''));
  await p.waitForFunction(() => window.OF && OF.debug && OF.Game && OF.Game.mode !== 'boot', null, { timeout: 15000 });
  return p;
}

(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });

  // ---------- 1. night readability ----------
  if (want('night')) for (const view of ['small', 'phoneL', 'phone', 'ipadP']) for (const diff of ['easy', 'normal']) {
    const p = await open(b, view, '&autostart=1&bot=1&skill=0.9&level=3&diff=' + diff);
    await p.waitForTimeout(600);
    await p.evaluate(() => {
      const w = OF.debug.world; OF.debug.setSpeed(0);
      w.lightAt = function () { return 0.32; }; w.light = w.lightView = 0.32;
      OF.Game.renderer.banner = null; OF.Game.renderer.hintOn = false;
      w.hearts = w.maxHearts;   // kept full every step
      const G = OF.Game, h = 1 / 120;
      for (let i = 0; i < 120 * 3; i++) { G.step(h); G.renderer.update(h); }   // settle (lamps on, light eased, crossfade done)
      w.lightView = 0.32;
      window.NQ = {
        seen: {}, // hazard key → stage done
        // advance until a hazard crosses `edge` (units ahead of Ollie); returns info or null
        runTo(maxSec) {
          const w = OF.debug.world, G = OF.Game, h = 1 / 120, u = w.layout.unit;
          for (let n = 0; n < maxSec * 120; n++) {
            G.step(h); G.renderer.update(h); w.hearts = w.maxHearts; if (G.renderer.banner) G.renderer.banner = null;
            const see = w.seeAheadUnits(), reach = w.screenReachUnits();
            for (const z of w.hazards) {
              const k = z.side + ':' + Math.round(z.x0), d = (z.x0 - w.hero.x) / u;
              const st = NQ.seen[k] || 0;
              const edge = st === 0 ? Math.min(reach - 0.6, 40) : st === 1 ? see : -1;
              if (edge > 0 && d <= edge && d > edge - 0.5) {
                NQ.seen[k] = st + 1;
                                return { stage: st === 0 ? 'enter' : 'react', kind: z.kind, side: z.side, d: +d.toFixed(2), see: +see.toFixed(2), reach: +reach.toFixed(2),
                  sx: z.x0 - w.cam.x, x1: z.x1 - w.cam.x, light: +w.lightView.toFixed(2), lampsOn: w.lampsOn, unit: u, L: w.layout };
              }
              if (d < edge - 0.5 && st < 2 && d < see - 0.5) NQ.seen[k] = 2;
            }
          }
          return null;
        }
      };
    });
    let shots = 0;
    for (let i = 0; i < 40 && shots < 8; i++) {
      const info = await p.evaluate(() => NQ.runTo(20));
      if (!info) break;
      await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
      // contrast: mean luminance of the hazard box vs a band of the same height just right of it
      const lum = await p.evaluate((inf) => {
        const R = OF.Game.renderer, c = R.canvas, k = c.width / R.VW, g = c.getContext('2d');
        const L = inf.L, u = inf.unit;
        const box = (x0, x1, y0, y1) => {
          x0 = Math.max(0, x0 * k); x1 = Math.min(c.width - 1, x1 * k); y0 = Math.max(0, y0 * k); y1 = Math.min(c.height - 1, y1 * k);
          if (x1 - x0 < 2 || y1 - y0 < 2) return null;
          const d = g.getImageData(x0, y0, x1 - x0, y1 - y0).data; let s = 0, n = 0;
          for (let i = 0; i < d.length; i += 16) { s += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]; n++; }
          return s / n / 255;
        };
        let hz, bg;
        if (inf.kind === 'gap') {
          const y = inf.side === 'floor' ? L.floorY : L.ceilY, dy = 0.25 * u, s = inf.side === 'floor' ? 1 : -1;
          const ya = s > 0 ? [y + 2, y + dy] : [y - dy, y - 2];
          hz = box(inf.sx + 2, Math.min(inf.x1, inf.sx + u) - 2, ya[0], ya[1]);
          bg = box(inf.sx - u, inf.sx - 2, ya[0], ya[1]);
        } else {
          const w = inf.x1 - inf.sx, y0 = inf.side === 'floor' ? L.floorY - 0.6 * u : L.ceilY, y1 = inf.side === 'floor' ? L.floorY : L.ceilY + 0.6 * u;
          hz = box(inf.sx + w * 0.2, inf.x1 - w * 0.2, y0, y1);
          bg = box(inf.sx - w - 0.2 * u, inf.sx - 0.2 * u, y0, y1);
        }
        return { hz: hz && +hz.toFixed(3), bg: bg && +bg.toFixed(3) };
      }, info);
      const name = `${view}_${diff}_${String(shots).padStart(2, '0')}_${info.stage}_${info.side}_${info.kind}`;
      await p.screenshot({ path: OUT + '/' + name + '.png' });
      delete info.L; out.night.push({ name, ...info, ...lum });
      shots++;
    }
    await p.context().close();
  }

  // ---------- 2. popups / callouts over Ollie, banner over hazards, HUD over the band (real play, all floors) ----------
  if (want('overlap')) for (const view of ['small', 'phoneL', 'phone', 'ipadP', 'ipadPro']) {
    const p = await open(b, view, '&autostart=1&bot=1&skill=0.55&diff=normal&autorestart=1');
    await p.waitForTimeout(500);
    const res = await p.evaluate(async () => {
      const R = OF.Game.renderer, G = OF.Game, rec = { textHits: [], bannerHaz: 0, bannerFrames: 0, hudBand: null, frames: 0, examples: [] };
      const orig = R.drawTexts.bind(R);
      R.drawTexts = function (g) {
        orig(g);
        const w = this.world; if (!w) return;
        const L = w.layout, u = L.unit, S = u * 0.95, h = w.hero, a = w.alpha || 0;
        const hy = h.prevY + (h.y - h.prevY) * a;
        const hb = [L.heroX - S * 0.45, hy - S * 0.5, L.heroX + S * 0.45, hy + S * 0.5];
        rec.frames++;
        for (const t of this.texts) {
          const k = t.t / t.life; if (k > 0.85) continue;
          const sc = t.big ? (k < 0.15 ? 0.6 + k / 0.15 * 0.5 : k < 0.25 ? 1.1 - (k - 0.15) : 1) : 1;
          const fs = Math.round(t.size * sc * this._hudK); g.font = '900 ' + fs + 'px sans-serif';
          const tw = g.measureText(t.txt).width, x = Math.min(t.x, this.VW - 12 - this.ins.right - tw);
          const tb = [x, t.y - fs * 0.5, x + tw, t.y + fs * 0.5];
          const ox = Math.min(tb[2], hb[2]) - Math.max(tb[0], hb[0]), oy = Math.min(tb[3], hb[3]) - Math.max(tb[1], hb[1]);
          if (ox > 4 && oy > 4) { rec.textHits.push(t.txt + ' @' + h.state + '/' + h.side + ' ft' + h.flipT.toFixed(2)); }
        }
        if (this.banner) {
          rec.bannerFrames++;
          const hgt = 76, cx = this.VW / 2, y = this._lowY(), bw = Math.min(this.VW - 40, 440);
          const bb = [cx - bw / 2, y - hgt / 2, cx + bw / 2, y + hgt / 2], cam = w.cam.x;
          for (const z of w.hazards) {
            const x0 = z.x0 - cam, x1 = Math.min(z.x1, z.x0 + 3 * u) - cam;
            const top = z.side === 'floor' ? (z.kind === 'gap' ? L.floorY : L.floorY - 0.8 * u) : L.ceilY;
            const bot = z.side === 'floor' ? L.floorY + 0.4 * u : L.ceilY + 0.8 * u;
            if (x1 > bb[0] && x0 < bb[2] && bot > bb[1] && top < bb[3] && x0 > L.heroX) { rec.bannerHaz++; if (rec.examples.length < 6) rec.examples.push(z.kind + '/' + z.side + ' x' + Math.round(x0) + ' banner[' + bb.map(Math.round) + '] t' + this.banner.t.toFixed(1)); break; }
          }
        }
        if (!rec.hudBand && this.hudRects) {
          const H = this.hudRects, z = H.zone, s = H.score;
          rec.hudBand = { ceilY: Math.round(L.ceilY), floorY: Math.round(L.floorY), scoreBottom: Math.round(s[1] + s[3]), zoneBottom: Math.round(z[1] + z[3]), VW: this.VW, VH: this.VH, unit: Math.round(u), lowY: Math.round(this._lowY()) };
        }
      };
      OF.debug.setSpeed(4);
      const t0 = performance.now();
      while (performance.now() - t0 < 45000) { await new Promise(r => setTimeout(r, 500)); if (OF.debug.world.level >= 4) break; }
      OF.debug.setSpeed(1);
      const s = {}; for (const x of rec.textHits) { const k = x.split(' @')[0].replace(/\d+/g, 'N'); s[k] = (s[k] || 0) + 1; }
      return { frames: rec.frames, textHitFrames: rec.textHits.length, byText: s, sample: rec.textHits.slice(0, 8), bannerFrames: rec.bannerFrames, bannerHazFrames: rec.bannerHaz, examples: rec.examples, hud: rec.hudBand, level: OF.debug.world.level };
    });
    out.overlap.push({ view, ...res });
    await p.context().close();
  }

  // ---------- 3. iPad Pro 1366×1024: every screen ----------
  if (want('screens')) {
    const v = 'ipadPro', p = await open(b, v);
    const shot = n => p.screenshot({ path: OUT + '/' + v + '_' + n + '.png' });
    await p.waitForTimeout(2500); await shot('title');
    for (const [btn, name] of [['btnHow', 'how'], ['btnSettings', 'settings'], ['btnCustomize', 'custom']]) {
      await p.click('#' + btn); await p.waitForTimeout(400); await shot(name);
      await p.click('.screen:not(.hidden) .btn-back'); await p.waitForTimeout(300);
    }
    await p.click('#btnPlay'); await p.waitForTimeout(1100); await shot('banner');
    await p.evaluate(() => { OF.debug.setBot(true, 0.9); OF.debug.setSpeed(2); }); await p.waitForTimeout(4000);
    await p.evaluate(() => OF.debug.setSpeed(1)); await p.waitForTimeout(300); await shot('play');
    await p.evaluate(() => { OF.debug.gotoLevel(3); OF.debug.setSpeed(3); }); await p.waitForTimeout(3500);
    await p.evaluate(() => OF.debug.setSpeed(1)); await p.waitForTimeout(300); await shot('night');
    await p.click('#btnPause'); await p.waitForTimeout(400); await shot('pause');
    await p.click('#btnResume'); await p.waitForTimeout(200);
    await p.evaluate(() => { const w = OF.debug.world; w.score = 1234; w.hearts = 1; w._loseHeart(); });
    await p.waitForFunction(() => OF.debug.mode === 'over', null, { timeout: 15000 }).catch(() => {});
    await p.waitForTimeout(1200); await shot('over');
    await p.context().close();
  }

  // ---------- 4. the floor banner over a floor hatch (start of a run and after a real stairway door) ----------
  if (want('banner')) for (const view of ['small', 'phoneL']) for (const viaDoor of [false, true]) for (const seed of [1, 2, 3, 4, 5, 6]) {
    if (out.banner.some(x => x.view === view && x.viaDoor === viaDoor && x.ok)) break;
    const p = await open(b, view, '&autostart=1&bot=1&skill=0.9&diff=normal&seed=' + seed);
    await p.waitForTimeout(300);
    const r = await p.evaluate(async (viaDoor) => {
      OF.debug.setSpeed(0);
      const G = OF.Game, R = G.renderer, w = OF.debug.world, h = 1 / 120;
      const st = () => { G.step(h); R.update(h); w.hearts = w.maxHearts; };
      if (viaDoor) { let n = 0; while (w.level < 1 && n++ < 120 * 120) st(); for (let i = 0; i < 6; i++) st(); }
      for (let n = 0; n < 120 * 3; n++) {
        st();
        if (!R.banner) continue;
        const bw = Math.min(R.VW - 40, 440), x0 = R.VW / 2 - bw / 2, x1 = R.VW / 2 + bw / 2, L = w.layout;
        for (const z of w.hazards) {
          const a = z.x0 - w.cam.x;
          if (z.kind === 'gap' && z.side === 'floor' && a > x0 + 20 && a < x1 - 60 && a > L.heroX) return { ok: true, t: R.banner.t.toFixed(2), x: Math.round(a), d: ((z.x0 - w.hero.x) / L.unit).toFixed(2), level: w.level };
        }
      }
      return { ok: false, level: w.level };
    }, viaDoor);
    await p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    if (r.ok) await p.screenshot({ path: OUT + '/banner_' + view + (viaDoor ? '_door' : '_start') + '.png' });
    out.banner.push({ view, viaDoor, seed, ...r });
    await p.context().close();
  }

  fs.writeFileSync(OUT + '/summary.json', JSON.stringify(out, null, 1));
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
