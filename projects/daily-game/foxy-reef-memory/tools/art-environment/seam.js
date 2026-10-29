// Numeric seam check: draw each tileable layer twice side-by-side and compare the column diff
// across the seam (959|960) to the average/max diff of interior adjacent column pairs.
// Usage: node seam.js [assetsDir]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const A = process.argv[2] || path.join(__dirname, '../../game/assets/default');
(async () => {
  const data = {};
  for (const s of ['spring', 'summer', 'autumn', 'winter']) for (const l of ['far', 'mid', 'floor']) data[s + '/' + l] = 'data:image/svg+xml;base64,' + fs.readFileSync(`${A}/seasons/${s}/${l}.svg`).toString('base64');
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body></body></html>');
  const res = await pg.evaluate(async (data) => {
    const out = [];
    for (const k of Object.keys(data)) {
      const h = k.endsWith('floor') ? 90 : 540;
      const img = new Image(); img.src = data[k]; await img.decode();
      const c = document.createElement('canvas'); c.width = 1920; c.height = h; const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 960, h); g.drawImage(img, 960, 0, 960, h);
      const d = g.getImageData(0, 0, 1920, h).data;
      const col = (x1, x2) => { let t = 0; for (let y = 0; y < h; y++) { const i = (y * 1920 + x1) * 4, j = (y * 1920 + x2) * 4; for (let q = 0; q < 4; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(959, 960); let sum = 0, n = 0, mx = 0; for (let x = 100; x < 860; x++) { const v = col(x, x + 1); sum += v; n++; mx = Math.max(mx, v); }
      out.push(`${k.padEnd(14)} seam=${seam.toFixed(2)} interiorAvg=${(sum / n).toFixed(2)} interiorMax=${mx.toFixed(2)} ${seam <= mx ? 'OK' : 'SEAM!'}`);
    }
    return out;
  }, data);
  console.log(res.join('\n')); await b.close();
})();
