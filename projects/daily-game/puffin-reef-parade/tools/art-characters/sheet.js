// Contact sheet for Dottie's Reef Parade characters/items (QA only).
// Usage: node sheet.js [assetDir] [outPng] [small|big|anchors|composed|cb|all]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || path.join(__dirname, '../../tests/out/art/characters_sheet.png');
const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const PUF = ['idle', 'happy', 'ouch', 'jump'].map(n => 'puffin_' + n);
const STARS = ['star_0', 'star_1', 'star_2', 'star_3', 'star_gold'];
const HUD = ['heart_full', 'heart_empty', 'flip', 'songbar'];
// in-game drawn sizes (DESIGN §4.1)
const SIZE = { puffin: 64, star: 30, star_gold: 36, heart_full: 28, heart_empty: 28, flip: 40, songbar: 44, icon: 64 };
const sz = n => SIZE[n] || SIZE[n.split('_')[0]];
const img = (n, s = 1, st = '') => { const w = sz(n); return `<img src="${uri(n)}" width="${w * s}" height="${w * s}" style="${st}">`; };
const BGS = [['light', '#f4f7fb'], ['dark', '#1f2a36'], ['spring', '#ecd49a'], ['summer', '#dff3ee'], ['autumn', '#d39b52'], ['winter', '#b6c3d1']];
const row = (bg, html) => `<div class="p" style="background:${bg}">${html}</div>`;
// Dottie with a soft shadow + a parade of stars behind her (like the renderer)
const parade = (s = 1, frame = 'puffin_idle') => `<span style="display:inline-flex;align-items:center;gap:${2 * s}px">${['star_3', 'star_gold', 'star_2', 'star_1', 'star_0'].map(n => img(n, s)).join('')}${img(frame, s, 'filter:drop-shadow(0 6px 3px #0003)')}</span>`;
const small = ([, bg]) => row(bg, PUF.map(n => img(n)).join('') + STARS.map(n => img(n)).join('') + HUD.map(n => img(n)).join('')
  + parade() + `<img src="${uri('icon')}" width="32" height="32"><img src="${uri('icon')}" width="64" height="64">`);
const big = ([, bg]) => row(bg, PUF.map(n => img(n, 4)).join('')) + row(bg, STARS.map(n => img(n, 4)).join('') + HUD.map(n => img(n, 3)).join(''));
const dot = (x, y, c) => `<div style="position:absolute;left:${x - 3}px;top:${y - 3}px;width:6px;height:6px;border-radius:50%;background:${c}"></div>`;
const circ = (x, y, r) => `<div style="position:absolute;left:${x - r}px;top:${y - r}px;width:${2 * r}px;height:${2 * r}px;border-radius:50%;border:1px dashed #f00"></div>`;
const anchors = row('#eef7f4', PUF.map(n => `<div style="position:relative"><img src="${uri(n)}" width="300" height="300" style="outline:1px dashed #0004">${dot(150, 156, 'red')}${circ(150, 156, 114)}</div>`).join('')
  + STARS.map(n => `<div style="position:relative"><img src="${uri(n)}" width="144" height="144" style="outline:1px dashed #0004">${dot(72, 72, 'red')}</div>`).join(''));
const composed = BGS.slice(2).map(([, bg]) => row(bg, parade(2, 'puffin_happy') + img('puffin_jump', 2) + img('puffin_ouch', 2)
  + `<img src="${uri('icon')}" width="256" height="256"><img src="${uri('icon')}" width="48" height="48">`)).join('');
// rough colour-blind checks: grayscale + deuteranopia/protanopia matrices
const cbm = { deut: '0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0', prot: '0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0', trit: '0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0' };
const cbDefs = `<svg width="0" height="0" style="position:absolute">${Object.entries(cbm).map(([k, v]) => `<filter id="${k}"><feColorMatrix type="matrix" values="${v}"/></filter>`).join('')}</svg>`;
const cb = cbDefs + ['grayscale(1)', 'url(#deut)', 'url(#prot)', 'url(#trit)'].map(f => row('#ecd49a', `<div class="p" style="filter:${f}">${STARS.map(n => img(n)).join('')}${STARS.map(n => img(n, 2)).join('')}${img('puffin_idle')}</div>`)).join('');
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:12px;padding:10px;align-items:center}</style>`;

(async () => {
  const which = process.argv[4] || 'all';
  const parts = { small: BGS.map(small).join(''), big: big(BGS[0]) + big(BGS[1]), anchors, composed, cb };
  const body = which === 'all' ? Object.values(parts).join('') : parts[which];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 400 } });
  await p.setContent(`<html><body>${css}${body}</body></html>`);
  await p.waitForTimeout(500);
  await p.screenshot({ path: OUT, fullPage: true });
  await b.close();
  console.log(OUT);
})();
