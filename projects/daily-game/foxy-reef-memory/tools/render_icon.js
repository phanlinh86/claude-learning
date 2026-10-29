// Render an SVG to square PNGs at the sizes a Windows .ico needs.  usage: node render_icon.js icon.svg outDir
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const [svgPath, outDir] = process.argv.slice(2);
  const svg = fs.readFileSync(svgPath, 'utf8');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  for (const s of [16, 20, 24, 32, 40, 48, 64, 128, 256]) {
    await page.setViewportSize({ width: s, height: s });
    await page.setContent(`<html><body style="margin:0;background:transparent">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" width="${s}" height="${s}" style="display:block"></body></html>`);
    await page.waitForTimeout(50);
    await page.screenshot({ path: path.join(outDir, `icon_${s}.png`), omitBackground: true });
  }
  await browser.close();
})();
