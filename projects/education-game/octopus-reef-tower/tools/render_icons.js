// Renders the app icon SVG to the PNGs iOS/Android need for "Add to Home Screen".
// Usage: node tools/render_icons.js
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const root = path.join(__dirname, '..', 'game');
  const svg = fs.readFileSync(path.join(root, 'assets/default/icon.svg'), 'utf8');
  const out = path.join(root, 'assets/icons'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, s] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    await p.setViewportSize({ width: s, height: s });
    await p.setContent(`<html><body style="margin:0">${svg.replace('<svg', `<svg style="width:${s}px;height:${s}px;display:block"`)}</body></html>`);
    await p.screenshot({ path: path.join(out, name), omitBackground: false });
  }
  await b.close(); console.log('icons written to', out);
})();
