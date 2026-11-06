// Contact sheet: node tests/visual/sheet.js out.png tileW cols file1.png file2.png ...
const sharp = require('sharp');
(async () => {
  const [out, tw, cols, ...files] = process.argv.slice(2);
  const W = +tw, C = +cols;
  const tiles = await Promise.all(files.map(async f => { const img = sharp(f); const m = await img.metadata(); const h = Math.round(m.height * W / m.width); return { buf: await img.resize(W, h).png().toBuffer(), h }; }));
  const rows = []; for (let i = 0; i < tiles.length; i += C) rows.push(tiles.slice(i, i + C));
  const rh = rows.map(r => Math.max(...r.map(t => t.h)));
  const comp = []; let y = 0;
  rows.forEach((r, ri) => { r.forEach((t, ci) => comp.push({ input: t.buf, left: ci * (W + 6), top: y })); y += rh[ri] + 6; });
  await sharp({ create: { width: C * (W + 6), height: y, channels: 3, background: '#333' } }).composite(comp).png().toFile(out);
})();
