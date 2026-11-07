#!/usr/bin/env node
// Nini's Sea Painting — contact sheets for the line drawings and the paint props (character artist B).
// Run from the game folder root:   node tools/pictures_sheet.js        → docs/art/pictures_{parts,shapes,count,scene,labels}.png,
//                                                                         docs/art/shells_brush.png
// Each template: unpainted / half painted (answer colours, one part mid-fill, one glowing) / fully painted (def fills),
// on the cream canvas frame at in-game size (picture 600 × 400 at scale 1 ≈ the canvas on an iPad).
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const JS = path.join(ROOT, 'game', 'js');
const OUT = path.join(ROOT, 'docs', 'art');

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent('<!doctype html><html><body style="margin:0;background:#2E8FA8"></body></html>');
  await page.addScriptTag({ path: path.join(JS, 'pictures.js') });
  await page.addScriptTag({ path: path.join(JS, 'paint_art.js') });

  const sheets = await page.evaluate(() => {
    const P = SP.Pictures, A = SP.PaintArt, COLORS = ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'pink'];
    const CW = 680, CH = 470, HEAD = 34;
    function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function bg(ctx, w, h) {
      const g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, '#7FD3D8'); g.addColorStop(1, '#2E8FA8');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    }
    function label(ctx, txt, x, y) {
      ctx.font = '700 22px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif'; ctx.fillStyle = '#FFFFFF';
      ctx.textBaseline = 'top'; ctx.fillText(txt, x, y);
    }
    function states(pic, mode) {
      const st = {};
      const targets = pic.parts.filter(p => p.role !== 'part' || pic.kind === 'parts');
      pic.parts.forEach((p, i) => {
        if (mode === 'full') st[p.id] = { color: p.def, t: 1 };
        else if (mode === 'half') {
          const k = targets.indexOf(p);
          if (k >= 0 && k < Math.ceil(targets.length / 2)) st[p.id] = { color: COLORS[(k + pic.id.length) % 7], t: k === 0 ? 0.55 : 1, ox: p.cx, oy: p.cy, sparkle: k === 1 ? 1 : 0 };
          else if (k === Math.ceil(targets.length / 2)) st[p.id] = { glow: 1 };
        }
      });
      return st;
    }
    function cell(ctx, pic, mode, x, y, title) {
      label(ctx, title, x + 12, y + 4);
      const box = { x: x + 40, y: y + HEAD + 18, w: 600, h: 400 };
      A.drawCanvasFrame(ctx, box, { glow: mode === 'half' ? 0 : 0 });
      ctx.save(); ctx.translate(box.x, box.y); A.drawPicture(ctx, pic, states(pic, mode), { time: 1.3 });
      // safe tap points (small crosses) on the unpainted cell — what the tests tap
      if (mode === 'none') pic.parts.forEach(p => { ctx.strokeStyle = 'rgba(232,74,74,0.9)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(p.cx - 7, p.cy); ctx.lineTo(p.cx + 7, p.cy); ctx.moveTo(p.cx, p.cy - 7); ctx.lineTo(p.cx, p.cy + 7); ctx.stroke(); });
      ctx.restore();
    }
    function sheet(rows) {   // rows: [[title, pic, mode]…] × 3
      const c = canvas(CW * 3, (CH + HEAD) * rows.length), ctx = c.getContext('2d');
      bg(ctx, c.width, c.height);
      rows.forEach((r, i) => r.forEach((q, j) => cell(ctx, q[1], q[2], j * CW, i * (CH + HEAD), q[0])));
      return c.toDataURL('image/png');
    }
    const out = {};
    const M = ['none', 'half', 'full'], ML = ['unpainted', 'half painted', 'painted (def)'];
    out.pictures_parts = sheet(P.list('parts').map(id => M.map((m, j) => [id + ' — ' + ML[j], P.build(id), m])));
    out.pictures_shapes = sheet(P.list('shapes').map((id, i) => {
      const n = P.TEMPLATES[id].maxSlots, sh = k => Array.from({ length: k }, (_, j) => SP.SHAPES[(j + i * 3) % 8]);
      return [[id + ' ×' + n + ' unpainted', P.build(id, { shapes: sh(n) }), 'none'], [id + ' ×3 half', P.build(id, { shapes: sh(3).reverse() }), 'half'],
        [id + ' ×2 painted', P.build(id, { shapes: sh(2) }), 'full']];
    }).concat([SP.SHAPES.slice(0, 4), SP.SHAPES.slice(4, 8)].map((s, i) => [['sub_windows ' + s.join(','), P.build('sub_windows', { shapes: s }), 'full'],
      ['rock_wall ' + s.join(','), P.build('rock_wall', { shapes: s.concat([SP.SHAPES[i]]) }), 'half'], ['flag_boat ' + s.join(','), P.build('flag_boat', { shapes: s }), 'full']])));
    out.pictures_count = sheet(P.list('count').map(id => [[id + ' n=4', P.build(id, { n: 4, seed: 3 }), 'none'],
      [id + ' n=8', P.build(id, { n: 8, seed: 5 }), 'half'], [id + ' n=12', P.build(id, { n: 12, seed: 9 }), 'full']]));
    const AN = SP.SEA_ANIMALS;
    out.pictures_scene = sheet(P.list('scene').map((id, i) => [[id + ' ×4', P.build(id, { animals: AN.slice((i * 4) % 8, (i * 4) % 8 + 4) }), 'none'],
      [id + ' ×3', P.build(id, { animals: [AN[(i + 5) % 8], AN[(i + 6) % 8], AN[(i + 7) % 8]] }), 'half'],
      [id + ' big/small', P.build(id, { animals: [AN[i + 1], AN[i + 1]], sizes: i % 2 ? ['small', 'big'] : ['big', 'small'] }), 'full']])
      .concat([[['reef animals 1-4 painted', P.build('reef', { animals: AN.slice(0, 4) }), 'full'], ['kelp animals 5-8 painted', P.build('kelp', { animals: AN.slice(4, 8) }), 'full'],
        ['rocks dolphin + whale', P.build('rocks', { animals: ['dolphin', 'whale'] }), 'half']]]));
    out.pictures_labels = sheet(P.list('labels').map(id => [[id + ' ×3', P.build(id, { labels: ['A', 'B', 'C'] }), 'none'],
      [id + ' ×4', P.build(id, { labels: ['7', '12', '3', '9'], kind: 'number' }), 'half'], [id + ' ×5', P.build(id, { labels: ['m', 'b', 'D', 'q', 'S'] }), 'full']]));

    // shells, brush, splash, icons, ghost hand
    const c = canvas(1500, 1180), ctx = c.getContext('2d');
    bg(ctx, c.width, c.height);
    ctx.fillStyle = '#EAD7AE'; ctx.fillRect(0, 140, c.width, 120); ctx.fillRect(0, 400, c.width, 120);
    label(ctx, 'paint shells r=58 (all colours)', 16, 10);
    COLORS.forEach((col, i) => { ctx.save(); ctx.translate(110 + i * 190, 150); A.drawPaintShell(ctx, col, 58, { time: 0.3 }); ctx.restore(); });
    label(ctx, 'states: normal · lift · wob · glow · selected · dim · lift+selected', 16, 270);
    [{}, { lift: 1 }, { wob: 6 }, { glow: 1 }, { selected: true }, { dim: true }, { lift: 1, selected: true }].forEach((o, i) => {
      ctx.save(); ctx.translate(110 + i * 190, 410); o.time = 0.3; A.drawPaintShell(ctx, 'blue', 58, o); ctx.restore();
    });
    label(ctx, 'brush (size 180): clean · each colour · drip · angled', 16, 540);
    [null].concat(COLORS).forEach((col, i) => { ctx.save(); ctx.translate(70 + i * 120, 770); A.drawBrush(ctx, col, 180, 0, {}); ctx.restore(); });
    ctx.save(); ctx.translate(1060, 770); A.drawBrush(ctx, 'red', 180, 0, { drip: 1 }); ctx.restore();
    ctx.save(); ctx.translate(1200, 770); A.drawBrush(ctx, 'green', 180, -0.6, { drip: 0.5 }); ctx.restore();
    ctx.save(); ctx.translate(1380, 770); A.drawBrush(ctx, 'purple', 180, 0.7, {}); ctx.restore();
    label(ctx, 'splash t=0.1/0.3/0.6 · ghost hand · icons', 16, 800);
    [0.1, 0.3, 0.6].forEach((t, i) => { ctx.save(); ctx.translate(70 + i * 120, 900); A.drawSplash(ctx, COLORS[i], 50, t); ctx.restore(); });
    ctx.save(); ctx.translate(430, 850); A.drawGhostHand(ctx, 110, 0.5); ctx.restore();
    const icons = [{ kind: 'blob', color: 'orange' }, { kind: 'shape', shape: 'heart', color: 'pink' }, { kind: 'shape', shape: 'star' },
      { kind: 'number', n: 7 }, { kind: 'letter', text: 'B' }, { kind: 'dots', n: 5 }, { kind: 'size', size: 'big', animal: 'whale', color: 'blue' },
      { kind: 'size', size: 'small', animal: 'whale', color: 'blue' }];
    icons.forEach((t, i) => { ctx.save(); ctx.translate(600 + i * 110, 900); A.drawIcon(ctx, t, 100); ctx.restore(); });
    AN.forEach((a, i) => { ctx.save(); ctx.translate(80 + i * 180, 1080); A.drawIcon(ctx, { kind: 'animal', animal: a, color: i % 2 ? null : COLORS[i % 7] }, 160); ctx.restore(); });
    out.shells_brush = c.toDataURL('image/png');
    return out;
  });
  for (const [name, url] of Object.entries(sheets)) {
    const f = path.join(OUT, name + '.png');
    fs.writeFileSync(f, Buffer.from(url.split(',')[1], 'base64'));
    console.log('wrote', path.relative(ROOT, f));
  }
  await browser.close();
}
main().catch(e => { console.error(e); process.exit(1); });
