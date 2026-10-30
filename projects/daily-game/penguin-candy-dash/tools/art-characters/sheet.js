// Contact sheet for Pip's Candy Dash characters/items.
// Usage: node sheet.js [assetDir] [outPng] [sections]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const DIR = process.argv[2] || path.join(__dirname, '../../game/assets/default');
const OUT = process.argv[3] || '/tmp/claude-0/candy-chars/sheet.png';
const uri = n => 'data:image/svg+xml;base64,' + fs.readFileSync(`${DIR}/${n}.svg`).toString('base64');
const PIP = ['idle', 'walk1', 'walk2', 'slide', 'hurt', 'cheer'].map(n => 'pip_' + n);
const KINDS = ['red', 'green', 'orange'];
const BEARS = KINDS.flatMap(k => ['1', '2', 'stun'].map(f => `bear_${k}_${f}`));
const GEMS = ['pink', 'blue', 'yellow', 'green'].map(c => 'gem_' + c);
const ITEMS = ['heart_full', 'heart_empty', 'jar', 'gate_closed', 'gate_open'];
const BGS = [['meadow', '#bff0c9'], ['river', '#8a5a3c'], ['clouds', '#f6d6ee'], ['glacier', '#fff4dc'], ['dark', '#1b1530']];
// in-game drawn sizes
const SIZE = n => n.startsWith('pip') ? [60, 60] : n.startsWith('bear') ? [52, 52] : n.startsWith('gem') ? [30, 30]
  : n.startsWith('heart') ? [28, 28] : n === 'jar' ? [44, 55] : n.startsWith('gate') ? [90, 120] : [64, 64];
const img = (n, s = 1, extra = '') => { const [w, h] = SIZE(n); return `<img src="${uri(n)}" width="${w * s}" height="${h * s}" ${extra}>`; };
const shadow = (w) => `<div style="position:absolute;left:50%;bottom:-${w * .06}px;width:${w * .6}px;height:${w * .16}px;margin-left:-${w * .3}px;border-radius:50%;background:rgba(0,0,0,.22)"></div>`;
const ent = (n, s = 1) => { const [w, h] = SIZE(n); return `<div style="position:relative;display:inline-block">${shadow(w * s)}<div style="position:relative">${img(n, s)}</div></div>`; };
// jar with a fake code-drawn fill (inner rect x10–54, y22–72) at 60 %
const jarFill = (s, pct = .6) => `<div style="position:relative;width:${44 * s}px;height:${55 * s}px">
  <div style="position:absolute;left:${10 / 64 * 44 * s}px;width:${44 / 64 * 44 * s}px;top:${(22 + 50 * (1 - pct)) / 80 * 55 * s}px;height:${50 * pct / 80 * 55 * s}px;background:repeating-linear-gradient(45deg,#ff8cc4 0 6px,#7ac8ff 6px 12px,#ffe066 12px 18px);border-radius:0 0 ${6 * s}px ${6 * s}px"></div>
  <img src="${uri('jar')}" width="${44 * s}" height="${55 * s}" style="position:absolute;left:0;top:0"></div>`;

function bgRow([name, bg]) {
  return `<div class="p" style="background:${bg}">${[...PIP, ...BEARS].map(n => ent(n)).join('')}</div>
<div class="p" style="background:${bg}">${GEMS.map(n => img(n)).join('')}${img('heart_full')}${img('heart_full')}${img('heart_empty')}${jarFill(1)}${img('gate_closed')}${img('gate_open')}
<img src="${uri('icon')}" width="32" height="32"><img src="${uri('icon')}" width="64" height="64">
<div style="position:relative;width:420px;height:120px">${ent('pip_walk1', 1.45).replace('display:inline-block', 'display:inline-block;position:absolute;left:10px;top:20px')}
${['bear_red_1', 'bear_green_2', 'bear_orange_1'].map((b, i) => `<div style="position:absolute;left:${120 + i * 70}px;top:${40 + (i % 2) * 20}px">${ent(b)}</div>`).join('')}
${GEMS.map((g, i) => `<div style="position:absolute;left:${110 + i * 75}px;top:${4 + (i % 2) * 90}px">${img(g)}</div>`).join('')}</div></div>`;
}
const big = `<div class="p" style="background:#bff0c9">${PIP.map(n => img(n, 3)).join('')}</div>
<div class="p" style="background:#f6d6ee">${BEARS.map(n => img(n, 3.4)).join('')}</div>
<div class="p" style="background:#8a5a3c">${GEMS.map(n => img(n, 4)).join('')}${img('heart_full', 4)}${img('heart_empty', 4)}${jarFill(3.4)}</div>
<div class="p" style="background:#fff4dc">${img('gate_closed', 2.4)}${img('gate_open', 2.4)}<img src="${uri('icon')}" width="256" height="256"><img src="${uri('icon')}" width="48" height="48"><img src="${uri('icon')}" width="32" height="32"><img src="${uri('icon')}" width="16" height="16"></div>`;
const scales = `<div class="p" style="background:#fff4dc;align-items:flex-end">${[1, 1.15, 1.3, 1.45, 1.6].map(s => ent('pip_idle', s)).join('')}
${[1, 1.15, 1.3, 1.45, 1.6].map(s => ent('pip_walk1', s)).join('')}</div>`;
// flipbook at 2x (192 px): feet line y = 90/96, anchor x = 48/96
const flip = `<div class="p" style="background:#bff0c9">${[...PIP, ...BEARS.slice(0, 3)].map(n => {
  const isB = n.startsWith('bear'), vb = isB ? 80 : 96, ay = isB ? 76 : 90, ax = isB ? 40 : 48, S = 192;
  return `<div style="position:relative"><img src="${uri(n)}" width="${S}" height="${S}" style="outline:1px dashed rgba(0,0,0,.35)">
  <div style="position:absolute;left:0;right:0;top:${ay / vb * S}px;border-top:1px solid red"></div>
  <div style="position:absolute;top:0;bottom:0;left:${ax / vb * S}px;border-left:1px solid red"></div></div>`;
}).join('')}</div>`;
const deut = `<svg width="0" height="0" style="position:absolute"><filter id="deut" color-interpolation-filters="linearRGB"><feColorMatrix type="matrix" values="0.367322 0.860646 -0.227968 0 0 0.280085 0.672501 0.047413 0 0 -0.011820 0.042940 0.968881 0 0 0 0 0 1 0"/></filter></svg>`;
const trio = s => KINDS.map(k => ent(`bear_${k}_1`, s)).join('') + GEMS.map(g => img(g, s * 1.2)).join('');
const cvd = `<div class="p" style="background:#bff0c9"><div class="p">${trio(1.5)}</div><div class="p" style="filter:url(#deut)">${trio(1.5)}</div><div class="p" style="filter:grayscale(1)">${trio(1.5)}</div></div>`;
const css = `<style>body{margin:0;background:#777}.p{display:flex;flex-wrap:wrap;gap:12px;padding:10px;align-items:center}</style>`;

(async () => {
  const which = process.argv[4] || 'all';
  const parts = { bgs: BGS.map(bgRow).join(''), big, scales, flip, cvd };
  const body = which === 'all' ? Object.values(parts).join('') : which.split(',').map(k => parts[k]).join('');
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1400, height: 400 } });
  await p.setContent(`<html><body>${css}${deut}${body}</body></html>`);
  await p.waitForTimeout(400);
  await p.screenshot({ path: OUT, fullPage: true });
  await b.close();
  console.log(OUT);
})();
