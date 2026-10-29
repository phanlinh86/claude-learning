// Numeric seam check: draw each tileable layer twice side-by-side on a canvas and compare
// the column-pair diff across the seam (959|960) to the max diff of any other adjacent column pair.
const { chromium } = require('playwright');
const A = '/home/claude/claude-learning/projects/flappy/game/assets/default';
(async () => {
  const fs=require('fs');const data={};for(const s of ['spring','summer','autumn','winter'])for(const l of ['clouds','far','mid','ground'])data[s+'/'+l]='data:image/svg+xml;base64,'+fs.readFileSync(`${A}/seasons/${s}/${l}.svg`).toString('base64');
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.goto('file:///tmp/claude-0/art-env/out/tmp.html');
  const res = await pg.evaluate(async (data) => {
    const out = [];
    for (const s of ['spring', 'summer', 'autumn', 'winter']) for (const [l, h] of [['clouds', 540], ['far', 540], ['mid', 540], ['ground', 80]]) {
      const img = new Image(); img.src = data[s+'/'+l]; await img.decode();
      const c = document.createElement('canvas'); c.width = 1920; c.height = h; const g = c.getContext('2d');
      g.drawImage(img, 0, 0, 960, h); g.drawImage(img, 960, 0, 960, h);
      const d = g.getImageData(0, 0, 1920, h).data;
      const col = (x1, x2) => { let t = 0; for (let y = 0; y < h; y++) { const i = (y * 1920 + x1) * 4, j = (y * 1920 + x2) * 4; for (let k = 0; k < 4; k++) t += Math.abs(d[i + k] - d[j + k]); } return t / h; };
      const seam = col(959, 960); let sum = 0, n = 0, mx = 0; for (let x = 400; x < 560; x++) { const v = col(x, x + 1); sum += v; n++; mx = Math.max(mx, v); }
      out.push(`${s}/${l}: seam=${seam.toFixed(2)} interiorAvg=${(sum / n).toFixed(2)} interiorMax=${mx.toFixed(2)}`);
    }
    return out;
  }, data);
  console.log(res.join('\n')); await b.close();
})();
