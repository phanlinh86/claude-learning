// Renders the home-screen icons iOS / Android need ("Add to Home Screen" and the web manifest).
// icon.svg is already opaque and full-bleed (night square + round badge), so it is drawn 1:1; the page
// background matches its edge colour in case of sub-pixel gaps.
// Usage: node tools/render_mobile_icons.js   → game/assets/icons/{apple-touch-icon,icon-192,icon-512}.png
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const root = path.join(__dirname, '..', 'game');
  const svg = fs.readFileSync(path.join(root, 'assets/default/icon.svg'), 'utf8');
  const out = path.join(root, 'assets/icons'); fs.mkdirSync(out, { recursive: true });
  const b = await chromium.launch(); const p = await b.newPage();
  for (const [name, s] of [['apple-touch-icon.png', 180], ['icon-192.png', 192], ['icon-512.png', 512]]) {
    await p.setViewportSize({ width: s, height: s });
    const k = 1;   // full-bleed art: iOS rounds the corners; Wisp + pearl sit inside the maskable 80 % safe zone
    await p.setContent(`<html><body style="margin:0;width:${s}px;height:${s}px;display:grid;place-items:center;overflow:hidden;
      background:#141a48">
      <img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:${s * k}px;height:${s * k}px;display:block"></body></html>`);
    await p.waitForTimeout(80);
    await p.screenshot({ path: path.join(out, name) });
  }
  await b.close(); console.log('icons written to', out);
})();
