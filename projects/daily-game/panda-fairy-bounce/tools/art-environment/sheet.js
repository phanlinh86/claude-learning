#!/usr/bin/env node
// Visual QA contact sheets for the environment art (Playwright + Chromium, already installed).
// Writes to tests/out/art-environment/:
//   seams_far.png / seams_near.png   each tileable layer tiled 3x side by side at 1x (all seasons stacked)
//   seams_zoom.png                    4x crops around both seams of every far/near layer (magenta ticks = seam)
//   scene_<s>.png                     960x540 composed scene: sky cover-fit, far (bottom y 460), near (surface y 516),
//                                     a mock 10x5 brick grid, particles, plus the character art if present
//   scenes.png                        the four scenes in a 2x2 grid
//   scene_<s>_1280x540.png, scene_<s>_960x720.png   other aspect ratios
//   bricks.png                        every block at 1x and 3x, in colour and in greyscale (colour-blind check)
//   particles.png                     particles at 1x and 4x on light and dark
// Also prints a numeric seam report (mean RGBA delta between the last and first pixel column vs. a normal neighbour pair).
// Usage: node tools/art-environment/sheet.js [season-for-variants]
'use strict';
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const OUT = path.join(ROOT, 'tests/out/art-environment');
fs.mkdirSync(OUT, { recursive: true });
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
const VAR = process.argv[2] || 'winter';
const PARTS = { spring: ['petal', 'sparkle'], summer: ['firefly', 'butterfly'], autumn: ['leaf'], winter: ['snow'] };

const lib = `
const A = ${JSON.stringify('file://' + A)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => r(null); i.src = A + '/' + s; });
function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; document.body.appendChild(c); return c; }
// mirrors render.js computeView (DESIGN.md section 2); 960x540 forced to the art's 60 px/u
function view(VW, VH) {
  let unit = Math.min(VH / 9.1, VW / 16.4); if (VW === 960 && VH === 540) unit = 60;
  const k = unit / 60, groundPx = VH - 0.4 * unit, left = (VW - 16 * unit) / 2;
  return { unit, k, groundPx, left, farBottom: groundPx - 56 * k, sx: x => left + x * unit, sy: y => groundPx - y * unit };
}
async function scene(c, s, VW, VH, opt = {}) {
  const g = c.getContext('2d'); const v = view(VW, VH);
  const sky = await load('levels/' + s + '/sky.svg'), far = await load('levels/' + s + '/far.svg'), near = await load('levels/' + s + '/near.svg');
  // sky: cover-fit, centred
  const ks = Math.max(VW / 960, VH / 540); g.drawImage(sky, (VW - 960 * ks) / 2, (VH - 540 * ks) / 2, 960 * ks, 540 * ks);
  const tile = (im, h, top, off) => { const w = 960 * v.k; let x = (VW / 2 - w / 2 + off) % w; if (x > 0) x -= w; for (; x < VW; x += w) g.drawImage(im, x, top, w, h * v.k); };
  tile(far, 300, v.farBottom - 300 * v.k, opt.farOff || 0);
  tile(near, 200, v.groundPx - 150 * v.k, 0);
  // mock 10x5 grid: centres x = 0.8 + 1.6 i ... use 1.5 u pitch, centred; rows y 7.4 .. 4.4 u
  const kinds = ['bud', 'tough', 'crack', 'star'];
  const B = {}; for (const kk of ['', '_tough', '_crack']) B[kk] = await load('bricks/' + s + kk + '.svg'); B.star = await load('bricks/star.svg');
  const layout = ['bbsbbbbsbb', 'bttbbbbttb', 'bbbccbbbbb', 'tbbbsbbbbt', 'bbcbbbbcbb'];
  for (let r = 0; r < 5; r++) for (let i = 0; i < 10; i++) {
    const ch = layout[r][i]; const im = ch === 'b' ? B[''] : ch === 't' ? B._tough : ch === 'c' ? B._crack : B.star;
    const cx = v.sx(8 + (i - 4.5) * 1.5), cy = v.sy(7.4 - r * 0.6), w = 1.4 * v.unit, h = 0.5 * v.unit;
    g.drawImage(im, cx - w / 2, cy - h / 2, w, h);
  }
  // particles
  const ps = []; for (const p of ${JSON.stringify(PARTS)}[s]) ps.push(await load('particles/' + p + '.svg'));
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 26; i++) { const im = ps[i % ps.length], sz = 14 + rnd() * 16 * v.k; g.globalAlpha = .6 + rnd() * .4; g.drawImage(im, rnd() * VW, rnd() * VH * .9, sz, sz); }
  g.globalAlpha = 1;
  const chip = await load('particles/chip_' + s + '.svg'); for (let i = 0; i < 5; i++) g.drawImage(chip, v.sx(10.5) + i * 14, v.sy(3.9) + (i % 2) * 12, 20 * v.k, 20 * v.k);
  // characters (if another agent already drew them) or stand-ins
  const mochi = await load('mochi_idle.svg'), cap = await load('cap.svg'), ball = await load('ball.svg'), owl = await load('owl_0.svg'), star = await load('star.svg');
  const px = v.sx(7), pw = 3 * v.unit;
  if (mochi) g.drawImage(mochi, px - 1.35 * v.unit / 2, v.sy(0) - 116 / 120 * 1.35 * v.unit, 1.35 * v.unit, 1.35 * v.unit);
  if (cap) g.drawImage(cap, px - pw / 2, v.sy(1.35) - 12 / 72 * 0.3 * pw, pw, 0.3 * pw); else { g.fillStyle = '#ff6f8e'; g.fillRect(px - pw / 2, v.sy(1.35), pw, 16); }
  const bx = v.sx(9.3), by = v.sy(3.0);
  if (ball) g.drawImage(ball, bx - .3 * v.unit, by - .3 * v.unit, .6 * v.unit, .6 * v.unit); else { g.fillStyle = '#fff3c4'; g.beginPath(); g.arc(bx, by, 13, 0, 7); g.fill(); }
  if (owl) g.drawImage(owl, v.sx(4) - .75 * v.unit, v.sy(8.0) - .625 * v.unit, 1.5 * v.unit, 1.25 * v.unit);
  if (star) g.drawImage(star, v.sx(12) - .35 * v.unit, v.sy(2.4) - .35 * v.unit, .7 * v.unit, .7 * v.unit);
  // HUD pill mock in the season palette
  const pal = opt.pal; g.fillStyle = pal.bar; g.globalAlpha = .9; g.beginPath(); g.roundRect(12, 10, 200, 34, 17); g.fill(); g.globalAlpha = 1;
  g.fillStyle = pal.ink; g.font = '700 18px sans-serif'; g.fillText(s + '  1234', 28, 33);
  g.fillStyle = pal.glow; g.beginPath(); g.arc(196, 27, 8, 0, 7); g.fill();
  if (opt.guides) { g.strokeStyle = 'rgba(255,0,255,.5)'; g.setLineDash([4, 4]); for (const y of [60, 480, v.farBottom, v.groundPx]) { g.beginPath(); g.moveTo(0, y); g.lineTo(VW, y); g.stroke(); } g.setLineDash([]); }
}
`;

async function main() {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--disable-web-security'] });
  const page = await browser.newPage();
  const tmp = path.join(OUT, '_page.html');
  fs.writeFileSync(tmp, `<!doctype html><html><body style="margin:0;background:#222"><script>${lib}</script></body></html>`);
  await page.goto('file://' + tmp);
  const pal = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));
  const save = async (name, js) => {
    const url = await page.evaluate(js);
    fs.writeFileSync(path.join(OUT, name), Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, path.join(OUT, name)));
  };
  // scenes
  for (const s of SEASONS) await save(`scene_${s}.png`, `(async () => { const c = canvas(960, 540); await scene(c, '${s}', 960, 540, { pal: ${JSON.stringify(pal[s])} }); return c.toDataURL(); })()`);
  await save('scenes.png', `(async () => { const c = canvas(1930, 1090); const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, 1930, 1090);
    const S = ${JSON.stringify(SEASONS)}; const P = ${JSON.stringify(pal)};
    for (let i = 0; i < 4; i++) { const t = canvas(960, 540); await scene(t, S[i], 960, 540, { pal: P[S[i]], guides: true }); g.drawImage(t, (i % 2) * 970, Math.floor(i / 2) * 550); t.remove(); }
    return c.toDataURL(); })()`);
  for (const [w, h] of [[1280, 540], [960, 720]]) await save(`scene_${VAR}_${w}x${h}.png`, `(async () => { const c = canvas(${w}, ${h}); await scene(c, '${VAR}', ${w}, ${h}, { pal: ${JSON.stringify(pal[VAR])}, guides: true }); return c.toDataURL(); })()`);
  await save(`scene_spring_1280x540.png`, `(async () => { const c = canvas(1280, 540); await scene(c, 'spring', 1280, 540, { pal: ${JSON.stringify(pal.spring)} }); return c.toDataURL(); })()`);
  // seams
  for (const L of ['far', 'near']) {
    const H = L === 'far' ? 300 : 200;
    await save(`seams_${L}.png`, `(async () => { const S = ${JSON.stringify(SEASONS)}; const c = canvas(2880, ${H} * 4 + 30); const g = c.getContext('2d');
      g.fillStyle = '#888'; g.fillRect(0, 0, c.width, c.height);
      for (let i = 0; i < 4; i++) { const sky = await load('levels/' + S[i] + '/sky.svg'), im = await load('levels/' + S[i] + '/${L}.svg'); const y = i * (${H} + 10);
        for (let t = 0; t < 3; t++) { g.drawImage(sky, t * 960, y, 960, ${H}); g.drawImage(im, t * 960, y, 960, ${H}); } }
      return c.toDataURL(); })()`);
  }
  await save('seams_zoom.png', `(async () => { const S = ${JSON.stringify(SEASONS)}; const Z = 4, cw = 60, c = canvas(8 * (cw * Z + 10), 2 * (200 * Z / 2 + 20)); const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
    g.fillStyle = '#333'; g.fillRect(0, 0, c.width, c.height); let row = 0;
    for (const L of ['far', 'near']) for (const s of S) {
      const H = L === 'far' ? 300 : 200, im = await load('levels/' + s + '/' + L + '.svg'), t = canvas(2880, H), tg = t.getContext('2d');
      tg.fillStyle = '#bbb'; tg.fillRect(0, 0, 2880, H); for (let k = 0; k < 3; k++) tg.drawImage(im, k * 960, 0, 960, H);
      const y0 = L === 'far' ? 120 : 0, hh = L === 'far' ? 180 : 200;
      for (let j = 0; j < 2; j++) { const sx = 960 * (j + 1) - cw / 2, dx = (row % 4) * 2 * (cw * Z + 10) + j * (cw * Z + 10), dy = Math.floor(row / 4) * (hh * Z / 2 + 10) * 1 + (L === 'near' ? 0 : 0);
        g.drawImage(t, sx, y0, cw, hh, dx, Math.floor(row / 4) * (200 * Z / 2 + 20), cw * Z, hh * Z / 2); g.fillStyle = '#f0f'; g.fillRect(dx + cw * Z / 2 - 1, Math.floor(row / 4) * (200 * Z / 2 + 20), 2, 8); }
      t.remove(); row++; }
    return c.toDataURL(); })()`);
  // numeric seam report
  const rep = await page.evaluate(`(async () => { const out = {};
    for (const s of ${JSON.stringify(SEASONS)}) for (const L of ['far', 'near']) { const H = L === 'far' ? 300 : 200, im = await load('levels/' + s + '/' + L + '.svg');
      const t = canvas(1920, H), g = t.getContext('2d'); g.drawImage(im, 0, 0, 960, H); g.drawImage(im, 960, 0, 960, H);
      const col = x => g.getImageData(x, 0, 1, H).data; const d = (a, b) => { let m = 0, mx = 0; for (let i = 0; i < a.length; i++) { const pa = i % 4 === 3 ? 255 : a[i - i % 4 + 3], pb = i % 4 === 3 ? 255 : b[i - i % 4 + 3]; const q = Math.abs(a[i] * pa / 255 - b[i] * pb / 255); m += q; mx = Math.max(mx, q); } return [+(m / a.length).toFixed(2), mx]; };
      out[s + '/' + L] = { seam: d(col(959), col(960)), neighbour: d(col(958), col(959)), next: d(col(960), col(961)) }; t.remove(); }
    return out; })()`);
  console.log('seam report [mean, max] premultiplied channel delta (seam vs. a normal neighbour pair):');
  for (const [k, v] of Object.entries(rep)) console.log('  ' + k.padEnd(14), 'seam', JSON.stringify(v.seam).padEnd(12), 'left pair', JSON.stringify(v.neighbour).padEnd(12), 'right pair', JSON.stringify(v.next));
  fs.writeFileSync(path.join(OUT, 'seam_report.json'), JSON.stringify(rep, null, 2));
  // bricks
  await save('bricks.png', `(async () => { const S = ${JSON.stringify(SEASONS)}; const c = canvas(1500, 760); const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1500, 380); g.fillStyle = '#20284e'; g.fillRect(0, 380, 1500, 380);
    for (let half = 0; half < 2; half++) { g.filter = half ? 'grayscale(1)' : 'none';
      for (let i = 0; i < 4; i++) { const names = [S[i], S[i] + '_tough', S[i] + '_crack', 'star'];
        const sky = await load('levels/' + S[i] + '/sky.svg');
        for (let j = 0; j < 4; j++) { const im = await load('bricks/' + names[j] + '.svg'); const x = 10 + j * 150 + half * 750, y = 10 + i * 90;
          g.drawImage(im, x, y, 140, 50);
          g.drawImage(sky, 380, 150, 100, 40, x, 390 + i * 90, 145, 80); g.drawImage(im, x + 4, 395 + i * 90, 84, 30); g.drawImage(im, x + 4, 430 + i * 90, 84, 30); g.drawImage(im, x + 93, 395 + i * 90, 50, 18); } } }
    g.filter = 'none'; return c.toDataURL(); })()`);
  // particles
  await save('particles.png', `(async () => { const N = ['petal','firefly','butterfly','leaf','snow','sparkle','puff','glow','chip_spring','chip_summer','chip_autumn','chip_winter','zzz','feather'];
    const c = canvas(N.length * 140, 300); const g = c.getContext('2d'); g.fillStyle = '#f4efe6'; g.fillRect(0, 0, c.width, 150); g.fillStyle = '#1d2550'; g.fillRect(0, 150, c.width, 150);
    for (let i = 0; i < N.length; i++) { const im = await load('particles/' + N[i] + '.svg'); if (!im) continue; for (const y of [0, 150]) { g.drawImage(im, i * 140 + 4, y + 10, 128, 128); g.drawImage(im, i * 140 + 104, y + 110, 32, 32); } }
    return c.toDataURL(); })()`);
  fs.unlinkSync(tmp);
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
