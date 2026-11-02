#!/usr/bin/env node
// Contact sheet for the character art of Bao's Arctic Reel.
// - every asset at in-game drawn size and at 4x, on light (#bfe6f5) and dark (#0f2347)
// - Bao's 4 frames side by side with crosshairs at the seat line and the rod tip
// - gems inside bubble.svg
// - a mock scene (960x540): Bao on the ice at y=150, line from rod tip to the hook
// Output: docs/art/characters_sheet.png and docs/art/characters_zoom.png
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '../..');
const A = path.join(ROOT, 'game/assets/default');
const uri = (n) => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n)).toString('base64');

const ITEMS = [ // name, drawn w, drawn h
  ['bao_idle.svg', 128, 128], ['bao_reel.svg', 128, 128], ['bao_happy.svg', 128, 128], ['bao_oops.svg', 128, 128],
  ['bucket.svg', 44, 44], ['hook.svg', 24, 36], ['gem_amethyst.svg', 40, 40], ['gem_emerald.svg', 40, 40],
  ['gem_ruby.svg', 40, 40], ['gem_gold.svg', 44, 44], ['bubble.svg', 62, 62], ['puffer.svg', 64, 53],
  ['puffer_puffed.svg', 80, 80], ['fish_a.svg', 50, 30], ['fish_b.svg', 50, 30], ['spool.svg', 34, 34], ['icon.svg', 32, 32],
];
const BG = { light: '#bfe6f5', dark: '#0f2347' };
const TIPS = { idle: [150, 22], reel: [146, 14], happy: [150, 22], oops: [150, 22] };

function cross(x, y, c) {
  return `<div style="position:absolute;left:${x - 8}px;top:${y - 0.5}px;width:16px;height:1px;background:${c}"></div>` +
    `<div style="position:absolute;left:${x - 0.5}px;top:${y - 8}px;width:1px;height:16px;background:${c}"></div>`;
}
function baoFrame(fr, scale) {
  const k = (128 / 160) * scale; // px per viewBox unit
  const [tx, ty] = TIPS[fr];
  return `<div style="position:relative;display:inline-block;width:${128 * scale}px;height:${128 * scale}px;margin:4px;outline:1px dashed rgba(0,0,0,.2)">
    <img src="${uri('bao_' + fr + '.svg')}" style="position:absolute;left:0;top:0;width:${128 * scale}px;height:${128 * scale}px">
    <div style="position:absolute;left:0;top:${150 * k}px;width:100%;height:1px;background:#f0f"></div>
    ${cross(tx * k, ty * k, '#f0f')}${cross(68 * k, 96 * k, '#0c0')}
  </div>`;
}
function panel(bg) {
  let h = `<div style="background:${BG[bg]};padding:10px;color:${bg === 'dark' ? '#fff' : '#123'}">`;
  h += `<div style="font:bold 14px sans-serif">${bg} - in-game size</div><div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px">`;
  for (const [n, w, hh] of ITEMS) h += `<div style="text-align:center;font:10px sans-serif"><img src="${uri(n)}" width="${w}" height="${hh}"><br>${n.replace('.svg', '')}</div>`;
  h += `</div><div style="font:bold 14px sans-serif;margin-top:8px">gems in bubbles (in-game size)</div><div style="display:flex;gap:10px">`;
  for (const g of ['amethyst', 'emerald', 'ruby', 'gold']) {
    const gs = g === 'gold' ? 44 : 40;
    h += `<div style="position:relative;width:62px;height:62px"><img src="${uri('gem_' + g + '.svg')}" style="position:absolute;left:${31 - gs / 2}px;top:${31 - gs / 2}px;width:${gs}px"><img src="${uri('bubble.svg')}" style="position:absolute;left:0;top:0;width:62px"></div>`;
  }
  h += `</div><div style="font:bold 14px sans-serif;margin-top:8px">Bao frames 1x and 2x (magenta = seat line + rod tip, green = body centre)</div><div>`;
  for (const fr of ['idle', 'reel', 'happy', 'oops']) h += baoFrame(fr, 1);
  for (const fr of ['idle', 'reel', 'happy', 'oops']) h += baoFrame(fr, 2);
  h += `</div><div style="font:bold 14px sans-serif;margin-top:8px">4x</div><div style="display:flex;flex-wrap:wrap;align-items:flex-end;gap:10px">`;
  for (const [n, w, hh] of ITEMS) {
    if (n.startsWith('bao_')) continue;
    const s = n === 'icon.svg' ? 4 : n.startsWith('puffer') || n === 'bubble.svg' ? 2.5 : 4;
    h += `<img src="${uri(n)}" width="${w * s}" height="${hh * s}">`;
  }
  h += `</div></div>`;
  return h;
}
function scene() {
  const W = 960, H = 540, holeX = 480, k = 128 / 160;
  // place Bao so rod tip (150,22) lands at (holeX-4, 70)
  const bx = holeX - 4 - 150 * k, by = 70 - 22 * k; // seat line = by + 150k
  const hookY = 330;
  const it = (n, x, y, w, hh, flip) => `<img src="${uri(n)}" style="position:absolute;left:${x - w / 2}px;top:${y - hh / 2}px;width:${w}px;height:${hh}px;${flip ? 'transform:scaleX(-1)' : ''}">`;
  let h = `<div style="position:relative;width:${W}px;height:${H}px;overflow:hidden;background:linear-gradient(#9fd8f5,#e6f6ff 150px)">`;
  h += `<div style="position:absolute;left:0;top:190px;width:${W}px;height:${H - 190}px;background:linear-gradient(#7fd6e8,#2d8fb8 60%,#182f63)"></div>`;
  h += `<div style="position:absolute;left:0;top:150px;width:${holeX - 32}px;height:40px;background:#f4fbff;border-bottom:4px solid #a9d6ec"></div>`;
  h += `<div style="position:absolute;left:${holeX + 32}px;top:150px;width:${W - holeX - 32}px;height:40px;background:#f4fbff;border-bottom:4px solid #a9d6ec"></div>`;
  h += `<svg style="position:absolute;left:0;top:0" width="${W}" height="${H}"><line x1="${holeX - 4}" y1="70" x2="${holeX - 4}" y2="${hookY - 18 + 2 * 36 / 48}" stroke="#e8f4ff" stroke-width="1.4"/></svg>`;
  h += it('bucket.svg', bx - 6, 150 - 22 + 0.5, 44, 44);
  h += `<img src="${uri('bao_idle.svg')}" style="position:absolute;left:${bx}px;top:${by}px;width:128px;height:128px">`;
  h += it('hook.svg', holeX - 4, hookY, 24, 36);
  const gemB = (g, x, y) => it('gem_' + g + '.svg', x, y, g === 'gold' ? 44 : 40, g === 'gold' ? 44 : 40) + it('bubble.svg', x, y, 62, 62);
  h += gemB('amethyst', 260, 250) + gemB('emerald', 700, 340) + gemB('ruby', 330, 450) + gemB('gold', 620, 230);
  h += it('puffer.svg', 820, 270, 64, 53, true) + it('puffer_puffed.svg', 150, 360, 80, 80);
  h += it('fish_a.svg', 560, 420, 50, 30) + it('fish_b.svg', 120, 230, 50, 30, true) + it('fish_b.svg', 860, 470, 50, 30);
  for (let i = 0; i < 3; i++) h += it('spool.svg', 30 + i * 38, 26, 34, 34);
  h += `</div>`;
  return h;
}

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 800 } });
  await page.setContent(`<!doctype html><html><body style="margin:0;width:1400px">${panel('light')}${panel('dark')}<div style="padding:10px;background:#333">${scene()}</div></body></html>`);
  await page.waitForTimeout(300);
  fs.mkdirSync(path.join(ROOT, 'docs/art'), { recursive: true });
  await page.screenshot({ path: path.join(ROOT, 'docs/art/characters_sheet.png'), fullPage: true });
  const z = `<!doctype html><body style="margin:0;background:${BG.light};width:1400px">` +
    ['idle', 'reel', 'happy', 'oops'].map((n) => `<img src="${uri('bao_' + n + '.svg')}" width="340" height="340">`).join('') +
    `<br><div style="background:${BG.dark};display:inline-block">` + ['gem_amethyst', 'gem_emerald', 'gem_ruby', 'gem_gold'].map((n) => `<img src="${uri(n + '.svg')}" width="200">`).join('') + `</div>` +
    `<img src="${uri('icon.svg')}" width="256"><img src="${uri('icon.svg')}" width="32" style="vertical-align:top">` +
    `<br><img src="${uri('puffer.svg')}" width="288"><img src="${uri('puffer_puffed.svg')}" width="288"><img src="${uri('hook.svg')}" width="128"><img src="${uri('bucket.svg')}" width="200"><img src="${uri('spool.svg')}" width="160">` +
    `<br><img src="${uri('fish_a.svg')}" width="320"><img src="${uri('fish_b.svg')}" width="320"></body>`;
  await page.setContent(z);
  await page.waitForTimeout(200);
  await page.screenshot({ path: path.join(ROOT, 'docs/art/characters_zoom.png'), fullPage: true });
  await browser.close();
  console.log('wrote docs/art/characters_sheet.png and characters_zoom.png');
})();
