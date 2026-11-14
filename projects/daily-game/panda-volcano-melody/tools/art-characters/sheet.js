// Contact sheet for the character art: node tools/art-characters/sheet.js [out.png]
// Renders every sprite at its drawn size and at 4x on meadow / snow / dark,
// plus the Tofu walk strip and the Coco flap strip. Anchors are marked with a
// small cross on the 4x row.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..', '..');
const A = path.join(ROOT, 'game', 'assets', 'default');
const OUT = process.argv[2] || path.join(__dirname, 'out', 'sheet.png');

const S = [ // name, viewBox w,h, drawn w,h, anchor
  ['tofu_idle', 120, 120, 72, 72, [60, 114]], ['tofu_walk1', 120, 120, 72, 72, [60, 114]],
  ['tofu_walk2', 120, 120, 72, 72, [60, 114]], ['tofu_happy', 120, 120, 72, 72, [60, 114]],
  ['tofu_hurt', 120, 120, 72, 72, [60, 114]], ['tofu_sleep', 120, 120, 72, 72, [60, 114]],
  ['crab_1', 100, 80, 56, 45, [50, 76]], ['crab_2', 100, 80, 56, 45, [50, 76]],
  ['crab_dizzy', 100, 80, 56, 45, [50, 76]],
  ['coco_1', 120, 100, 64, 53, [60, 50]], ['coco_2', 120, 100, 64, 53, [60, 50]],
  ['note_0', 64, 64, 40, 40, [32, 32]], ['note_1', 64, 64, 40, 40, [32, 32]],
  ['note_2', 64, 64, 40, 40, [32, 32]], ['note_3', 64, 64, 40, 40, [32, 32]],
  ['mango', 64, 64, 36, 36, [32, 32]], ['heart_full', 40, 36, 26, 24, null],
  ['heart_empty', 40, 36, 26, 24, null], ['icon', 256, 256, 96, 96, null],
];
const BG = [['meadow', '#9fd27a'], ['snow', '#eef3f7'], ['dark', '#2a3a4a']];
const src = n => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');

function cell(s, k, mark) {
  const [n, , , w, h, anc] = s;
  const W = w * k, H = h * k;
  let m = '';
  if (mark && anc) {
    const x = anc[0] / s[1] * W, y = anc[1] / s[2] * H;
    m = `<div style="position:absolute;left:${x - 5}px;top:${y}px;width:10px;height:1px;background:#f0f"></div>` +
        `<div style="position:absolute;left:${x}px;top:${y - 5}px;width:1px;height:10px;background:#f0f"></div>`;
  }
  return `<div style="position:relative;display:inline-block;margin:4px;vertical-align:bottom;outline:1px dashed rgba(0,0,0,.15)">` +
    `<img src="${src(n)}" style="width:${W}px;height:${H}px;display:block">${m}</div>`;
}

let html = '<html><body style="margin:0;font:12px sans-serif">';
for (const [bn, bg] of BG) {
  html += `<div style="background:${bg};padding:8px;color:${bn === 'dark' ? '#fff' : '#000'}">${bn} — drawn size<br>`;
  html += S.map(s => cell(s, 1, false)).join('');
  html += '<br>walk strip (idle, walk1, walk2, walk1) and flap: ';
  html += ['tofu_idle', 'tofu_walk1', 'tofu_walk2', 'tofu_walk1'].map(n => cell(S.find(s => s[0] === n), 1, false)).join('');
  html += ['coco_1', 'coco_2', 'coco_1', 'coco_2'].map(n => cell(S.find(s => s[0] === n), 1, false)).join('');
  html += '</div>';
}
html += '<div style="background:#9fd27a;padding:8px">4x (magenta cross = anchor)<br>';
html += S.filter(s => s[0] !== 'icon').map(s => cell(s, s[3] > 60 ? 3 : 4, true)).join('');
html += cell(S.find(s => s[0] === 'icon'), 2.5, false);
html += '</div><div style="background:#eef3f7;padding:8px">walk strip 3x: ';
html += ['tofu_idle', 'tofu_walk1', 'tofu_walk2', 'tofu_walk1'].map(n => cell(S.find(s => s[0] === n), 3, true)).join('');
html += ' flap 3x: ' + ['coco_1', 'coco_2'].map(n => cell(S.find(s => s[0] === n), 3, true)).join('');
html += '</div></body></html>';

(async () => {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1500, height: 800 } });
  await p.setContent(html);
  await p.waitForTimeout(300);
  await p.screenshot({ path: OUT, fullPage: true });
  await b.close();
  console.log('wrote', OUT);
})();
