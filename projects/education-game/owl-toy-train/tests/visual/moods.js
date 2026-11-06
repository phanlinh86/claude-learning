// Visual QA: the 4 moods (level 0..3) × 4 viewports, plus measured colour contrast of every answer colour (car body and
// cargo block) against its rendered surroundings in every mood, and pairwise ΔE00 between answer colours (normal + CVD).
const L = require('./lib');
const C = require('./colour');
const path = require('path'), fs = require('fs');
const sharp = require('sharp');
const COLS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
const MOODS = ['morning', 'noon', 'sunset', 'night'];
function lum(rgb) { const l = C.lin(rgb); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; }
const cr = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function median(px) { const k = [0, 1, 2].map(c => px.map(p => p[c]).sort((a, b) => a - b)[px.length >> 1]); return k; }
function region(raw, info, x0, y0, x1, y1, ring) {
  const out = [];
  for (let y = Math.max(0, Math.round(y0)); y < Math.min(info.height, Math.round(y1)); y++)
    for (let x = Math.max(0, Math.round(x0)); x < Math.min(info.width, Math.round(x1)); x++) {
      if (ring && ring(x, y)) continue;
      const i = (y * info.width + x) * info.channels; out.push([raw[i], raw[i + 1], raw[i + 2]]);
    }
  return out.length ? median(out) : null;
}
const hx = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
(async () => {
  const { srv, browser } = await L.launch();
  const rows = [], pairs = [];
  for (const vp of Object.keys(L.VIEWPORTS)) {
    for (let lvl = 0; lvl < 4; lvl++) {
      const { ctx, page } = await L.open(browser, vp, `seed=21&age=5&lang=${lvl % 2 ? 'vi' : 'en'}`, { url: srv.url });
      await page.evaluate(() => { TT.debug.world.cfg.surpriseRound = 99; });
      await L.startTopic(page, { topic: 'colors', lvl, round: 2 });
      await L.toLoad(page);
      await page.waitForTimeout(3200);   // let the weather crossfade (2.5 s) settle
      await L.shot(page, `mood-${vp}-${MOODS[lvl]}`);
      if (vp === 'ip-p' || vp === 'pad-l') {
        // repaint the cars + cargo in every answer colour, 3 at a time, and sample
        for (let k = 0; k < COLS.length; k += 3) {
          const set = [COLS[k], COLS[(k + 1) % 7], COLS[(k + 2) % 7]];
          const geo = await page.evaluate(set => {
            const D = TT.debug, w = D.world, v = D.view();
            w.cars.forEach((c, i) => { const col = set[i % set.length]; c.label = Object.assign({}, c.label, { color: col, value: col }); });
            w.items.forEach((it, i) => { it.item = Object.assign({}, it.item, { color: set[i % set.length], toy: 'cube' }); });
            const sc = (x, y) => D.toScreen(x, y);
            return { s: v.s, cars: w.cars.map(c => { const a = sc(c.x0 + c.ox, c.y0), b = sc(c.x0 + c.ox + c.w, c.floorY), t = sc(0, w.layout.trackY - 26); return { col: c.label.color, x0: a.x, x1: b.x, y0: a.y, floor: b.y, wheels: t.y }; }),
              items: w.items.filter(i => i.state === 'rest').map(i => { const p = sc(i.x, i.y); return { col: i.item.color, x: p.x, y: p.y, r: i.size * v.s / 2 }; }) };
          }, set);
          await page.waitForTimeout(250);
          const buf = await page.screenshot();
          const { data: raw, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
          for (const c of geo.cars.slice(0, 3)) {
            const w = c.x1 - c.x0, body = region(raw, info, c.x0 + 0.2 * w, c.floor + 0.3 * (c.wheels - c.floor), c.x1 - 0.2 * w, c.floor + 0.6 * (c.wheels - c.floor));
            const bg = region(raw, info, c.x0 + 0.1 * w, c.y0 - 34 * 0.5, c.x1 - 0.1 * w, c.y0 - 6);
            if (body && bg) rows.push({ vp, mood: MOODS[lvl], what: 'car', col: c.col, rgb: hx(body), bg: hx(bg), cr: +cr(body, bg).toFixed(2), de: +C.de00(C.lab(body), C.lab(bg)).toFixed(1), _rgb: body });
          }
          for (const it of geo.items.slice(0, 3)) {
            const r = it.r, body = region(raw, info, it.x - 0.18 * r, it.y - 0.05 * r, it.x + 0.18 * r, it.y + 0.3 * r);
            const bg = region(raw, info, it.x - 1.6 * r, it.y - 1.2 * r, it.x + 1.6 * r, it.y + 0.6 * r, (x, y) => Math.hypot(x - it.x, y - it.y) < 1.25 * r);
            if (body && bg) rows.push({ vp, mood: MOODS[lvl], what: 'cargo', col: it.col, rgb: hx(body), bg: hx(bg), cr: +cr(body, bg).toFixed(2), de: +C.de00(C.lab(body), C.lab(bg)).toFixed(1), _rgb: body });
          }
          if (vp === 'ip-p' && k === 0) await L.shot(page, `mood-${vp}-${MOODS[lvl]}-recolour`);
        }
      }
      await ctx.close();
      console.log(vp, MOODS[lvl], page.errors.slice(0, 1));
    }
  }
  // pairwise ΔE00 of rendered car colours per mood (ip-p), normal and simulated deuteranopia/protanopia
  for (const mood of MOODS) {
    const cars = {}; rows.filter(r => r.vp === 'ip-p' && r.mood === mood && r.what === 'car').forEach(r => { cars[r.col] = r._rgb; });
    const ks = Object.keys(cars);
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
      const a = cars[ks[i]], b = cars[ks[j]];
      pairs.push({ mood, a: ks[i], b: ks[j], de: +C.de00(C.lab(a), C.lab(b)).toFixed(1), deut: +C.de00(C.lab(a, 'deut'), C.lab(b, 'deut')).toFixed(1), prot: +C.de00(C.lab(a, 'prot'), C.lab(b, 'prot')).toFixed(1) });
    }
  }
  rows.forEach(r => delete r._rgb);
  fs.writeFileSync(path.join(L.OUT, 'contrast.json'), JSON.stringify({ rows, pairs }, null, 1));
  await browser.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
