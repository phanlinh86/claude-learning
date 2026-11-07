// Visual QA for Pebble's Oasis Run environment art (DESIGN.md §2, §4.2, §4.3).
// Renders into docs/art/:
//  env_<ch>.png       960x540 composed scene mimicking the renderer: sky gradient (skyTop -> skyBottom at horizonY),
//                     sky.svg top-anchored, far.svg with its bottom on horizonY = 0.40·VH, sand plain gradient
//                     (sandFar -> sandNear), the 3-lane perspective path (k(z) = 3.2/(z+3.2)) with edge stones and
//                     divider dashes, props at x = ±2..3.5 scaled by k, stand-ins for Pebble/pots/log/tumble/shells,
//                     and the vignette. Layers are offset so tile seams fall on screen (ticks on the top edge).
//  env_portrait.png   grove + night composed at 560x1000 (horizonY 0.36·VH, laneW0 0.27·VW).
//  env_seams.png      every sky/far tile drawn 3x side by side (left) + a 2x crop around one join (right).
//  env_props.png      all 16 props on their chapter's sand with base line + centre marks.
//  env_particles.png  all particles at 4x on light and dark backgrounds.
// Usage: node sheet.js [assetsDir] [docsArtDir]
const { chromium } = require('playwright');
const fs = require('fs');
const os = require('os');
const path = require('path');
const A = path.resolve(process.argv[2] || path.join(__dirname, '../../game/assets/default'));
const OUT = path.resolve(process.argv[3] || path.join(__dirname, '../../docs/art'));
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'por-env-'));
fs.mkdirSync(OUT, { recursive: true });
const CH = ['grove', 'dunes', 'bazaar', 'night'];
const PARTS = ['dust', 'sand', 'sparkle', 'butterfly', 'petal', 'leaf', 'firefly', 'star', 'feather', 'puff', 'ring'];
const PAL = JSON.parse(fs.readFileSync(path.join(A, 'levels/palette.json'), 'utf8'));

const common = `
const A = ${JSON.stringify('file://' + A)};
const PAL = ${JSON.stringify(PAL)};
const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.onerror = () => { console.log('MISSING ' + s); r(null); }; i.src = s; });
const loadCh = async ch => { const o = { sky: await load(A + '/levels/' + ch + '/sky.svg'), far: await load(A + '/levels/' + ch + '/far.svg'), props: [] };
  for (let i = 0; i < 4; i++) o.props.push(await load(A + '/levels/' + ch + '/prop_' + i + '.svg')); return o; };
// recommended drawn widths (u) per prop index, reported to the integrator
const PROP_W = { grove: [2.0, 2.0, 1.4, 1.5], dunes: [2.0, 1.6, 1.3, 1.1], bazaar: [1.9, 1.4, 1.3, 1.7], night: [2.0, 1.4, 1.7, 1.4] };
function scene(c, L, ch, VW, VH, portrait, off, o = {}) {
  const P = PAL[ch];
  const horizonY = Math.round(VH * (portrait ? 0.36 : 0.40)), footY = VH - Math.max(0.13 * VH, 70);
  const laneW0 = portrait ? 0.27 * VW : Math.min(0.19 * VW, 0.36 * VH);
  const camX = o.camX || 0, dist = o.dist || 0;
  const K = z => 3.2 / (z + 3.2);
  const pr = (x, y, z) => { const k = K(z); return [VW / 2 + (x - camX) * laneW0 * k, horizonY + (footY - horizonY) * k - y * laneW0 * k, k]; };
  // sky gradient
  let g = c.createLinearGradient(0, 0, 0, horizonY); g.addColorStop(0, P.skyTop); g.addColorStop(1, P.skyBottom);
  c.fillStyle = g; c.fillRect(0, 0, VW, horizonY + 2);
  const tw = Math.max(VW, 960), sc = tw / 960;
  const tile = (im, ox, y, h) => { let x = Math.round(-((ox % tw) + tw) % tw); for (; x < VW; x += tw) c.drawImage(im, x, Math.round(y), tw, h); }; // snap to whole px: a fractional x shows a hairline at the join
  tile(L.sky, off.sky, 0, 540 * sc);
  tile(L.far, off.far - camX * 18, horizonY - 300 * sc, 300 * sc);
  // sand plain
  g = c.createLinearGradient(0, horizonY, 0, VH); g.addColorStop(0, P.sandFar); g.addColorStop(1, P.sandNear);
  c.fillStyle = g; c.fillRect(0, horizonY, VW, VH - horizonY);
  // path trapezoid
  const zN = -1.2, zF = 36;
  const q = [pr(-1.5, 0, zN), pr(1.5, 0, zN), pr(1.5, 0, zF), pr(-1.5, 0, zF)];
  c.fillStyle = P.path; c.beginPath(); q.forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.fill();
  // edge stones every 1 u, dividers every 2 u
  for (let s = Math.ceil(dist + zN); s < dist + zF; s++) {
    const z = s - dist;
    for (const sx of [-1.56, 1.56]) { const [x, y, k] = pr(sx, 0, z); c.fillStyle = P.pathEdge; c.beginPath(); c.ellipse(x, y, 0.09 * laneW0 * k, 0.045 * laneW0 * k, 0, 0, 7); c.fill(); }
  }
  for (let s = Math.ceil((dist + zN) / 2) * 2; s < dist + zF; s += 2) {
    const z = s - dist;
    for (const lx of [-0.5, 0.5]) {
      const a = pr(lx - 0.025, 0, z), b = pr(lx + 0.025, 0, z), d = pr(lx + 0.025, 0, z + 0.8), e = pr(lx - 0.025, 0, z + 0.8);
      c.fillStyle = P.divider; c.beginPath(); [a, b, d, e].forEach(([x, y], i) => i ? c.lineTo(x, y) : c.moveTo(x, y)); c.fill();
    }
  }
  // drawables sorted far -> near
  const items = [];
  const PROPW = o.propW || PROP_W[ch];
  (o.props || [[-2.2, 3, 0], [2.6, 6, 1], [-3.2, 10, 2], [3.0, 15, 3], [-2.6, 22, 0], [2.3, 28, 2], [3.4, 1.2, 0], [-3.4, 0.8, 3]]).forEach(([x, z, i]) => items.push({ z, draw: () => {
    const [sx, sy, k] = pr(x, 0, z), w = PROPW[i] * laneW0 * k, h = w * 220 / 160; c.drawImage(L.props[i], sx - w / 2, sy - h * 214 / 220, w, h); } }));
  if (o.standins !== false) {
    const blob = (x, y, z, wU, hU, fill, out) => { const [sx, sy, k] = pr(x, y, z), w = wU * laneW0 * k, h = hU * laneW0 * k;
      c.fillStyle = 'rgba(40,25,10,.18)'; const [, gy] = pr(x, 0, z); c.beginPath(); c.ellipse(sx, gy, w * 0.5, w * 0.12, 0, 0, 7); c.fill();
      c.fillStyle = fill; c.strokeStyle = out; c.lineWidth = Math.max(1.5, 3 * k); c.beginPath(); c.ellipse(sx, sy - h / 2, w / 2, h / 2, 0, 0, 7); c.fill(); c.stroke(); return [sx, sy, k, w, h]; };
    items.push({ z: 0, draw: () => { const [sx, sy, k, w, h] = blob(0, 0, 0, 0.75, 0.7, '#f3dfb8', '#6b4a2b'); c.fillStyle = '#ff5a5f'; c.fillRect(sx - w * 0.35, sy - h * 0.62, w * 0.7, h * 0.12); c.fillStyle = '#2ec4b6'; c.beginPath(); c.arc(sx, sy - h - 6 * k, 5 * k, 0, 7); c.fill(); } });
    items.push({ z: 5, draw: () => blob(-1, 0, 5, 0.8, 1.5, '#c8643b', '#7a3a20') });
    items.push({ z: 9, draw: () => { const [sx, sy, k] = pr(1, 0, 9), w = 0.95 * laneW0 * k, h = 0.4 * laneW0 * k; c.fillStyle = '#8a5a3a'; c.strokeStyle = '#4a2e1a'; c.lineWidth = 2; c.beginPath(); c.roundRect(sx - w / 2, sy - h, w, h, h / 2); c.fill(); c.stroke(); } });
    items.push({ z: 13, draw: () => blob(0, 0, 13, 0.6, 0.55, '#a7844f', '#5e4526') });
    [['#ff8fb1', 0, 3], ['#ffb067', 0, 4.2], ['#b9a3ff', 0, 5.4], ['#ff8fb1', 1, 16], ['#ffb067', 1, 17.2]].forEach(([col, x, z]) =>
      items.push({ z, draw: () => blob(x, 0.15, z, 0.38, 0.36, col, 'rgba(90,40,60,.6)') }));
  }
  items.sort((a, b) => b.z - a.z).forEach(it => it.draw());
  // vignette
  g = c.createRadialGradient(VW / 2, VH * 0.55, Math.min(VW, VH) * 0.35, VW / 2, VH * 0.55, Math.max(VW, VH) * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, P.vig); c.fillStyle = g; c.fillRect(0, 0, VW, VH);
  if (o.marks !== false) {
    c.save(); c.setLineDash([5, 7]); c.strokeStyle = 'rgba(255,0,255,.5)'; c.lineWidth = 1;
    c.beginPath(); c.moveTo(0, horizonY + 0.5); c.lineTo(VW, horizonY + 0.5); c.stroke(); c.restore();
    const cols = { sky: '#ff00ff', far: '#00e5ff' };
    for (const l of ['sky', 'far']) { let x = -(((off[l] - (l === 'far' ? camX * 18 : 0)) % tw) + tw) % tw; for (; x <= VW; x += tw) { c.fillStyle = cols[l]; c.fillRect(x - 1, l === 'sky' ? 0 : horizonY - 10, 3, 10); } }
  }
}
`;
const OFF = { sky: 330, far: 610 };
const page = (body, w = 960, h = 540) => `<!doctype html><html><body style="margin:0;background:#222"><div id="w" style="display:inline-flex">${body}</div><script>${common}
`;
const zonePage = ch => page('<canvas id="a" width="960" height="540"></canvas>') + `
(async () => { const L = await loadCh(${JSON.stringify(ch)}); scene(document.getElementById('a').getContext('2d'), L, ${JSON.stringify(ch)}, 960, 540, false, ${JSON.stringify(OFF)}, { camX: 0.2 }); document.title = 'done'; })();
</script></body></html>`;
const portraitPage = () => page('<canvas id="a" width="560" height="1000"></canvas><canvas id="b" width="560" height="1000"></canvas><canvas id="c" width="560" height="1000"></canvas>') + `
(async () => { for (const [id, ch] of [['a', 'grove'], ['b', 'bazaar'], ['c', 'night']]) { const L = await loadCh(ch);
  scene(document.getElementById(id).getContext('2d'), L, ch, 560, 1000, true, ${JSON.stringify(OFF)}, { props: [[-2.0, 2.5, 0], [2.2, 5, 1], [-2.6, 9, 2], [2.8, 14, 3], [-2.4, 20, 1], [2.4, 26, 0]] }); }
  document.title = 'done'; })();
</script></body></html>`;
const seamPage = () => page('<canvas id="a" width="10" height="10"></canvas>') + `
(async () => {
  const S = 0.5, Z = 2, HW = 70, gap = 8, rows = [];
  for (const ch of ${JSON.stringify(CH)}) { const L = await loadCh(ch); rows.push([ch, 'sky', L.sky, 540]); rows.push([ch, 'far', L.far, 300]); }
  const cv = document.getElementById('a'); cv.width = 960 * 3 * S + 2 * HW * Z + 3 * gap; cv.height = rows.reduce((a, r) => a + r[3] * S + gap, gap);
  const c = cv.getContext('2d'); c.fillStyle = '#222'; c.fillRect(0, 0, cv.width, cv.height);
  let Y = gap;
  for (const [ch, l, im, h] of rows) {
    const P = PAL[ch], bg = (x, y, w, hh, h0, h1) => { const g = c.createLinearGradient(0, y, 0, y + hh); g.addColorStop(0, P.skyTop); g.addColorStop(1, P.skyBottom); c.fillStyle = g; c.fillRect(x, y, w, hh); };
    bg(gap, Y, 960 * 3 * S, h * S);
    for (let i = 0; i < 3; i++) c.drawImage(im, gap + i * 960 * S, Y, 960 * S, h * S);
    c.fillStyle = '#ff00ff'; for (let i = 1; i < 3; i++) { c.fillRect(gap + i * 960 * S - 1, Y, 2, 6); c.fillRect(gap + i * 960 * S - 1, Y + h * S - 6, 2, 6); }
    // 2x crop of the join: right edge of tile A then left edge of tile B
    const X = gap * 2 + 960 * 3 * S, ch2 = Math.min(h, 270), y0 = l === 'sky' ? 0 : h - ch2, hh = ch2 * S * (h * S / (ch2 * S));
    bg(X, Y, 2 * HW * Z, h * S);
    c.drawImage(im, 960 - HW, y0, HW, ch2, X, Y, HW * Z, h * S);
    c.drawImage(im, 0, y0, HW, ch2, X + HW * Z, Y, HW * Z, h * S);
    c.fillStyle = '#ff00ff'; c.fillRect(X + HW * Z - 1, Y, 2, 6);
    Y += h * S + gap;
  }
  document.title = 'done'; })();
</script></body></html>`;
const propPage = () => page('<canvas id="a" width="10" height="10"></canvas>') + `
(async () => {
  const cv = document.getElementById('a'), S = 1.5, cw = 160 * S + 20, chh = 220 * S + 20; cv.width = cw * 4; cv.height = chh * 4;
  const c = cv.getContext('2d'); let r = 0;
  for (const ch of ${JSON.stringify(CH)}) { const L = await loadCh(ch), P = PAL[ch];
    const g = c.createLinearGradient(0, r * chh, 0, (r + 1) * chh); g.addColorStop(0, P.skyBottom); g.addColorStop(0.7, P.sandFar); g.addColorStop(1, P.sandNear); c.fillStyle = g; c.fillRect(0, r * chh, cv.width, chh);
    L.props.forEach((im, i) => { const x = i * cw + 10, y = r * chh + 10; c.strokeStyle = 'rgba(0,0,0,.2)'; c.strokeRect(x, y, 160 * S, 220 * S); c.drawImage(im, x, y, 160 * S, 220 * S);
      c.fillStyle = '#ff00ff'; c.fillRect(x, y + 214 * S, 160 * S, 1); c.fillRect(x + 80 * S, y + 214 * S - 6, 1, 12); });
    r++; }
  document.title = 'done'; })();
</script></body></html>`;
const partPage = () => page('<canvas id="a" width="10" height="10"></canvas>') + `
(async () => {
  const names = ${JSON.stringify(PARTS)}, ims = []; for (const n of names) ims.push(await load(A + '/particles/' + n + '.svg'));
  const cell = 160, cv = document.getElementById('a'); cv.width = cell * names.length; cv.height = cell * 3;
  const c = cv.getContext('2d'); ['#efe3c8', '#d9a764', '#1f2850'].forEach((b, i) => { c.fillStyle = b; c.fillRect(0, i * cell, cv.width, cell); });
  names.forEach((n, i) => { const im = ims[i]; if (!im) return; const w = im.width * 4, h = im.height * 4;
    for (let row = 0; row < 3; row++) { const cx = i * cell + cell / 2, cy = row * cell + cell / 2 + 10; c.strokeStyle = 'rgba(128,128,160,.35)'; c.strokeRect(cx - w / 2, cy - h / 2, w, h); c.drawImage(im, cx - w / 2, cy - h / 2, w, h); c.drawImage(im, i * cell + 6, row * cell + 6); } });
  document.title = 'done'; })();
</script></body></html>`;

(async () => {
  const browser = await chromium.launch();
  const page_ = await browser.newPage({ viewport: { width: 1900, height: 2000 } });
  page_.on('console', m => console.log('page:', m.text()));
  const shot = async (html, name, sel = '#a') => {
    const f = path.join(TMP, name + '.html'); fs.writeFileSync(f, html);
    await page_.goto('file://' + f); await page_.waitForFunction(() => document.title === 'done', null, { timeout: 30000 });
    await (await page_.$(sel)).screenshot({ path: path.join(OUT, name + '.png') });
    console.log('wrote', path.join(OUT, name + '.png'));
  };
  for (const ch of CH) await shot(zonePage(ch), 'env_' + ch);
  await shot(portraitPage(), 'env_portrait', '#w');
  await shot(seamPage(), 'env_seams');
  await shot(propPage(), 'env_props');
  await shot(partPage(), 'env_particles');
  await browser.close();
})();
