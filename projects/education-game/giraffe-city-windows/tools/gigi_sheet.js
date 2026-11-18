// Contact sheets for Gigi (artist A). node gigi_sheet.js <gameDir> <outDir>
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = process.argv[2];
const OUT = process.argv[3];
const A = path.join(ROOT, 'game/assets/default');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const BODIES = ['stand', 'walk_a', 'walk_b', 'hop'];
const HEADS = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'];
const imgs = {};
BODIES.forEach(n => imgs['b_' + n] = uri(`characters/gigi_body_${n}.svg`));
HEADS.forEach(n => imgs['h_' + n] = uri(`characters/gigi_head_${n}.svg`));
const art = fs.readFileSync(path.join(ROOT, 'game/js/gigi_art.js'), 'utf8');

const page = `<html><body style="margin:0;background:#555"><canvas id="c"></canvas><script>${art}</script><script>
const IM = ${JSON.stringify(imgs)};
const L = {};
Promise.all(Object.keys(IM).map(k => new Promise(r => { const i = new Image(); i.onload = r; i.src = IM[k]; L[k] = i; }))).then(go);
function gigi(ctx, fx, fy, h, body, head, off, guides) {
  const A = GW.GigiArt.ANCHORS, s = h / 256, hs = A.head.box * h / 192;
  ctx.drawImage(L['b_' + body], fx - A.body.feet[0] * s, fy - A.body.feet[1] * s, 256 * s, 256 * s);
  const bx = fx + (A.body.socket[0] - A.body.feet[0]) * s, by = fy + (A.body.socket[1] - A.body.feet[1]) * s;
  const hx = bx + off[0] * h, hy = by + off[1] * h;
  GW.GigiArt.drawNeck(ctx, bx, by, hx, hy, GW.GigiArt.thickFor(h), {});
  const a = GW.GigiArt.headAngle(bx, by, hx, hy);
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(a);
  ctx.drawImage(L['h_' + head], -A.head.joint[0] * hs, -A.head.joint[1] * hs, 192 * hs, 192 * hs);
  ctx.restore();
  if (guides) { ctx.fillStyle = 'red'; ctx.fillRect(bx - 2, by - 2, 4, 4); ctx.fillRect(hx - 2, hy - 2, 4, 4); ctx.fillRect(fx - 3, fy, 6, 1); }
}
function dirs(len) { // lean angle from vertical (deg) -> offset in h units
  return [-50, 0, 50].map(d => [Math.sin(d * Math.PI / 180) * len, -Math.cos(d * Math.PI / 180) * len]);
}
function go() {
  const mode = location.hash.slice(1);
  const c = document.getElementById('c'), ctx = c.getContext('2d');
  const k = mode === 'x3' ? 3 : 1;
  const h = 150 * k;
  const poses = [[0.12, -0.6]].concat(dirs(1.1), dirs(1.6), [[1.4, -0.5]]);
  const labels = ['rest', 'med UL', 'med U', 'med UR', 'full UL', 'full U', 'full UR', 'reach R'];
  const bgs = ['#F4F8EC', '#9EA3A8', '#273040'];
  const cellW = mode === 'x3' ? 3 * 500 : 500, cellH = mode === 'x3' ? 3 * 500 : 500;
  const cols = mode === 'x3' ? 2 : 4;
  const set = mode === 'x3' ? [0, 4, 5, 6] : poses.map((_, i) => i);
  const rows = mode === 'x3' ? Math.ceil(set.length / cols) : 3;
  c.width = cols * cellW; c.height = rows * cellH * (mode === 'x3' ? 1 : 1) + (mode === 'x3' ? 0 : 0);
  if (mode === 'moods') {
    c.width = 7 * 250; c.height = 3 * 330;
    bgs.forEach((bg, r) => { ctx.fillStyle = bg; ctx.fillRect(0, r * 330, c.width, 330);
      HEADS_.forEach((hd, i) => gigi(ctx, i * 250 + 80, r * 330 + 310, 150, BODIES_[i % 4], hd, [0.12, -0.6])); });
  } else if (mode === 'heads') {
    c.width = 7 * 300; c.height = 600;
    HEADS_.forEach((hd, i) => { ctx.fillStyle = i % 2 ? '#F4F8EC' : '#FFFFFF'; ctx.fillRect(i * 300, 0, 300, 300);
      ctx.drawImage(L['h_' + hd], i * 300 + 6, 6, 288, 288);
      ctx.fillStyle = '#273040'; ctx.fillRect(i * 300, 300, 300, 300); ctx.drawImage(L['h_' + hd], i * 300 + 6, 306, 288, 288); });
  } else if (mode === 'bodies') {
    c.width = 4 * 300; c.height = 300;
    BODIES_.forEach((b, i) => { ctx.fillStyle = '#F4F8EC'; ctx.fillRect(i * 300, 0, 300, 300); ctx.drawImage(L['b_' + b], i * 300 + 22, 22, 256, 256);
      ctx.strokeStyle = 'rgba(255,0,0,.5)'; ctx.strokeRect(i * 300 + 22, 22, 256, 256); ctx.fillStyle = 'red';
      ctx.fillRect(i * 300 + 22 + 128 - 4, 22 + 244, 8, 1); ctx.fillRect(i * 300 + 22 + 172 - 2, 22 + 96 - 2, 4, 4); });
  } else {
    const R = mode === 'x3' ? rows : 6;
    c.height = R * cellH;
    for (let r = 0; r < R; r++) for (let j = 0; j < cols; j++) {
      const idx = mode === 'x3' ? set[r * cols + j] : (r % 2) * 4 + j;
      if (idx === undefined) continue;
      const bg = mode === 'x3' ? bgs[(r * cols + j) % 3] : bgs[r >> 1];
      ctx.fillStyle = bg; ctx.fillRect(j * cellW, r * cellH, cellW, cellH);
      const fx = j * cellW + cellW * 0.45, fy = (r + 1) * cellH - 20 * k;
      ctx.fillStyle = 'rgba(0,0,0,.15)'; ctx.fillRect(j * cellW, fy, cellW, 2 * k);
      gigi(ctx, fx, fy, h, 'stand', 'idle', poses[idx], mode === 'guides');
      ctx.fillStyle = bg === '#273040' ? '#fff' : '#333'; ctx.font = (12 * k) + 'px sans-serif'; ctx.fillText(labels[idx], j * cellW + 6, r * cellH + 14 * k);
    }
  }
  document.title = 'done';
}
const HEADS_ = ${JSON.stringify(HEADS)}, BODIES_ = ${JSON.stringify(BODIES)};
</script></body></html>`;
const tmp = path.join(__dirname, '_sheet.html');
fs.writeFileSync(tmp, page);
(async () => {
  const b = await chromium.launch();
  for (const [name, hash] of [['gigi_poses.png', 'poses'], ['gigi_poses_3x.png', 'x3'], ['gigi_moods.png', 'moods'],
    ['gigi_heads.png', 'heads'], ['gigi_bodies.png', 'bodies']]) {
    const q = await b.newPage({ viewport: { width: 1400, height: 900 } });
    q.on('pageerror', e => console.log('[err]', e.message));
    await q.goto('file://' + tmp + '#' + hash);
    await q.waitForFunction(() => document.title === 'done', null, { timeout: 15000 });
    await q.locator('#c').screenshot({ path: path.join(OUT, name) });
    await q.close();
    console.log(name);
  }
  // pigeon / title / icon / stars sheet
  const im = (rel, w, h, st = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${st}">`;
  const pan = (bg, inner) => `<div style="background:${bg};display:flex;gap:16px;padding:16px;align-items:flex-end;flex-wrap:wrap">${inner}</div>`;
  const misc = ['#F4F8EC', '#9EA3A8', '#273040'].map(bg => pan(bg,
    im('characters/pigeon.svg', 64, 64) + im('characters/pigeon_flap.svg', 64, 64) + im('characters/pigeon.svg', 256, 256) +
    im('characters/pigeon_flap.svg', 256, 256) + im('ui/star.svg', 32, 32) + im('ui/star_empty.svg', 32, 32) +
    im('ui/star.svg', 96, 96) + im('ui/star_empty.svg', 96, 96) + im('icon.svg', 60, 60, 'border-radius:13px') +
    im('characters/gigi_title.svg', 160, 240))).join('') +
    pan('#FFFFFF', im('icon.svg', 512, 512, 'border-radius:112px') + im('characters/gigi_title.svg', 320, 480));
  const q = await b.newPage({ viewport: { width: 1300, height: 400 } });
  await q.setContent(`<html><body style="margin:0">${misc}</body></html>`);
  await q.waitForTimeout(300);
  await q.screenshot({ path: path.join(OUT, 'gigi_misc.png'), fullPage: true });
  console.log('gigi_misc.png');
  await b.close();
  fs.unlinkSync(tmp);
})();
