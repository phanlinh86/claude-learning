// Contact sheet for Foxy's Reef Memory characters/cards.
// Usage: node sheet.js [assetDir] [outPng]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || '/tmp/claude-0/reef-chars/sheet.png';
const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const FOX = ['fox_swim1', 'fox_swim2', 'fox_swim3', 'fox_eat', 'fox_oops', 'fox_cheer'];
const FACES = [...Array(12).keys()].map(i => 'face_' + String(i).padStart(2, '0'));
const BGS = [['spring', '#3fc1c9'], ['summer', '#4fc3f7'], ['autumn', '#c98a3a'], ['winter', '#1d2f5c'], ['dark', '#16182a']];
// in-game drawn sizes
const SIZE = n => n.startsWith('fox') ? [110, 94] : n.startsWith('card') ? [84, 98] : n.startsWith('face') ? [60, 60]
  : n === 'cupcake' ? [34, 34] : n === 'heart' ? [28, 28] : [64, 64];
const img = (n, s = 1, extra = '') => { const [w, h] = SIZE(n); return `<img src="${uri(n)}" width="${w * s}" height="${h * s}" ${extra}>`; };
const faceCard = (f, s = 1) => `<div style="position:relative;width:${84 * s}px;height:${98 * s}px">${img('card_front', s)}
  <img src="${uri(f)}" width="${60 * s}" height="${60 * s}" style="position:absolute;left:${12 * s}px;top:${19 * s}px"></div>`;

function seasonRow([name, bg]) {
  const small = [...FOX, 'card_back', 'card_front', 'cupcake', 'heart'].map(n => img(n)).join('') +
    `<img src="${uri('icon')}" width="32" height="32"><img src="${uri('icon')}" width="64" height="64">`;
  const faces = FACES.map(f => faceCard(f)).join('');
  return `<div class="p" style="background:${bg}">${small}</div><div class="p" style="background:${bg}">${faces}</div>`;
}
const big = `<div class="p" style="background:#3fc1c9">${FOX.map(n => img(n, 2.4)).join('')}</div>
<div class="p" style="background:#1d2f5c">${['card_back', 'card_front'].map(n => img(n, 3)).join('')}${img('cupcake', 4)}${img('heart', 4)}<img src="${uri('icon')}" width="256" height="256"></div>
<div class="p" style="background:#4fc3f7">${FACES.map(f => `<img src="${uri(f)}" width="200" height="200" style="background:#fff8ea;border-radius:16px">`).join('')}</div>`;
const grid = `<div class="p" style="background:#3fc1c9"><div style="display:grid;grid-template-columns:repeat(6,84px);gap:10px">${Array(24).fill(img('card_back')).join('')}</div>
<div style="display:grid;grid-template-columns:repeat(6,84px);gap:10px">${FACES.map(f => faceCard(f)).join('')}</div></div>`;
const flip = `<div class="p" style="background:#4fc3f7">${FOX.map(n => `<div style="position:relative">${img(n, 2, 'style="outline:1px dashed rgba(0,0,0,.35)"')}
  <div style="position:absolute;left:0;right:0;top:${62 / 120 * 188}px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:${66 / 140 * 220}px;border-left:1px solid red"></div></div>`).join('')}</div>`;
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:12px;padding:12px;align-items:center}</style>`;
// deuteranopia (Machado 2009, severity 1.0) applied in linear-ish space via feColorMatrix
const deut = `<svg width="0" height="0" style="position:absolute"><filter id="deut" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0"/></filter></svg>`;
const cvd = `<div class="p" style="background:#3fc1c9"><div style="display:grid;grid-template-columns:repeat(6,84px);gap:10px">${FACES.map(f => faceCard(f)).join('')}</div>
<div style="display:grid;grid-template-columns:repeat(6,84px);gap:10px;filter:url(#deut)">${FACES.map(f => faceCard(f)).join('')}</div>
<div style="display:grid;grid-template-columns:repeat(6,84px);gap:10px;filter:grayscale(1)">${FACES.map(f => faceCard(f)).join('')}</div></div>`;

(async () => {
  const which = process.argv[4] || 'all';
  const parts = { seasons: BGS.map(seasonRow).join(''), big, grid, flip, cvd };
  const body = which === 'all' ? Object.values(parts).join('') : which.split(',').map(k => parts[k]).join('');
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1340, height: 400 } });
  await p.setContent(`<html><body>${css}${deut}${body}</body></html>`);
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT, fullPage: true });
  await b.close();
  console.log(OUT);
})();
