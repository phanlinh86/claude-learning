// Contact sheets for Lolo + critters + UI (artist A).
// Usage (from the game folder): node tools/lolo_sheet.js [gameDir] [outDir]   (defaults: . and docs/art)
// Composites Lolo exactly as render.js does: log line → tail (code) → body svg (feet anchor) → head svg at the socket
// (joint anchor, tilted) → right arm (code, last). Backgrounds: light, jungle green, night.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(process.argv[2] || path.join(__dirname, '..'));
const OUT = path.resolve(process.argv[3] || path.join(ROOT, 'docs/art'));
const A = path.join(ROOT, 'game/assets/default');
fs.mkdirSync(OUT, { recursive: true });
const uri = rel => 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, rel)).toString('base64');
const BODIES = ['sit', 'hop', 'hang'];
const HEADS = ['idle', 'blink', 'talk', 'happy', 'cheer', 'think', 'oops'];
const imgs = {};
BODIES.forEach(n => imgs['b_' + n] = uri(`characters/lolo_body_${n}.svg`));
HEADS.forEach(n => imgs['h_' + n] = uri(`characters/lolo_head_${n}.svg`));
const art = fs.readFileSync(path.join(ROOT, 'game/js/lolo_art.js'), 'utf8');

const page = `<html><body style="margin:0;background:#555"><canvas id="c"></canvas><script>${art}</script><script>
const IM = ${JSON.stringify(imgs)};
const L = {};
const BGS = ['#F4F8EC', '#3E7A4E', '#1E2A4A'];
const HEADS_ = ${JSON.stringify(HEADS)};
Promise.all(Object.keys(IM).map(k => new Promise(r => { const i = new Image(); i.onload = r; i.onerror = r; i.src = IM[k]; L[k] = i; }))).then(go);
const LA = () => LL.LoloArt;
function dot(ctx, x, y, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, 3, 0, 7); ctx.fill(); }
// sitting / hopping Lolo, feet at (fx, fy)
function lolo(ctx, fx, fy, h, body, head, o) {
  o = o || {};
  const AN = LA().ANCHORS, B = AN.body, k = h / 256, hs = AN.headScale * h / 192;
  ctx.fillStyle = 'rgba(40,30,20,.2)'; ctx.beginPath(); ctx.ellipse(fx, fy - 2, h * 0.3, h * 0.045, 0, 0, 7); ctx.fill();
  ctx.save(); ctx.translate(fx, fy); ctx.rotate(o.lean || 0);
  LA().drawTail(ctx, (B.tail[0] - B.feet[0]) * k, (B.tail[1] - B.feet[1]) * k, h, o.phase || 0, { side: -1 });
  ctx.drawImage(L['b_' + body], -B.feet[0] * k, -B.feet[1] * k, h, h);
  const sx = (B.socket[0] - B.feet[0]) * k, sy = (B.socket[1] - B.feet[1]) * k;
  ctx.save(); ctx.translate(sx, sy); ctx.rotate(o.tilt || 0);
  ctx.drawImage(L['h_' + head], -AN.head.joint[0] * hs, -AN.head.joint[1] * hs, 192 * hs, 192 * hs);
  ctx.restore();
  const shx = (B.shoulder[0] - B.feet[0]) * k, shy = (B.shoulder[1] - B.feet[1]) * k;
  if (o.guides) { dot(ctx, sx, sy, 'red'); dot(ctx, (B.tail[0] - B.feet[0]) * k, (B.tail[1] - B.feet[1]) * k, 'blue'); dot(ctx, 0, 0, 'magenta'); }
  ctx.restore();
  if (o.arm !== false) {
    const c = Math.cos(o.lean || 0), s = Math.sin(o.lean || 0);
    const wx = fx + shx * c - shy * s, wy = fy + shx * s + shy * c;
    const ext = o.ext === undefined ? 1 : o.ext;
    LA().drawArm(ctx, wx, wy, o.ang === undefined ? 1.0 : o.ang, LA().armLen(h, ext), { point: ext > 0.4, scale: h / 150 });
    if (o.guides) dot(ctx, wx, wy, 'orange');
  }
}
// hanging Lolo: hand point at (hx, hy), vine from (px, py)
function hang(ctx, px, py, hx, hy, h, head, ang, o) {
  o = o || {};
  const AN = LA().ANCHORS, HG = AN.hang, k = h / 256, hs = AN.headScale * h / 192;
  ctx.save(); ctx.strokeStyle = '#5E7F32'; ctx.lineWidth = 7 * h / 150; ctx.lineCap = 'round';
  ctx.beginPath(); ctx.moveTo(px, py); ctx.quadraticCurveTo((px + hx) / 2 + 8, (py + hy) / 2, hx, hy); ctx.stroke();
  ctx.strokeStyle = '#8DB04E'; ctx.lineWidth = 2.5 * h / 150; ctx.stroke(); ctx.restore();
  ctx.save(); ctx.translate(hx, hy); ctx.rotate(-ang);
  LA().drawTail(ctx, (HG.tail[0] - HG.hand[0]) * k, (HG.tail[1] - HG.hand[1]) * k, h, o.phase || 0, { side: -1, hang: true });
  ctx.drawImage(L.b_hang, -HG.hand[0] * k, -HG.hand[1] * k, h, h);
  ctx.drawImage(L['h_' + head], (HG.socket[0] - HG.hand[0]) * k - AN.head.joint[0] * hs, (HG.socket[1] - HG.hand[1]) * k - AN.head.joint[1] * hs, 192 * hs, 192 * hs);
  if (o.guides) { dot(ctx, 0, 0, 'magenta'); dot(ctx, (HG.socket[0] - HG.hand[0]) * k, (HG.socket[1] - HG.hand[1]) * k, 'red'); }
  ctx.restore();
}
function label(ctx, t, x, y, bg, k) { ctx.fillStyle = bg === BGS[0] ? '#333' : '#fff'; ctx.font = (12 * k) + 'px sans-serif'; ctx.fillText(t, x, y); }
const SET = [
  ['rest (knee)', c => ({ ang: 1.0, ext: 0 })], ['point R', c => ({ ang: 0, ext: 1, tilt: -0.05 })],
  ['point UR', c => ({ ang: -0.8, ext: 1, tilt: -0.22, lean: 0.12 })], ['point U', c => ({ ang: -1.5, ext: 1, tilt: -0.3 })],
  ['point UL', c => ({ ang: -2.3, ext: 1, tilt: -0.1, lean: -0.14 })], ['hop + cheer', c => ({ body: 'hop', head: 'cheer', ang: -1.2, ext: 0.6 })],
  ['hang', null]
];
function go() {
  const mode = location.hash.slice(1);
  const c = document.getElementById('c'), ctx = c.getContext('2d');
  if (mode === 'poses' || mode === 'guides' || mode === 'x3') {
    const k = mode === 'x3' ? 3 : 1, h = 150 * k, cw = 260 * k, ch = 300 * k;
    const set = mode === 'x3' ? [2, 3, 6, 5] : SET.map((_, i) => i);
    c.width = set.length * cw; c.height = BGS.length * ch;
    BGS.forEach((bg, r) => set.forEach((si, j) => {
      const x0 = j * cw, y0 = r * ch;
      ctx.fillStyle = bg; ctx.fillRect(x0, y0, cw, ch);
      const [name, fn] = SET[si];
      if (fn) {
        const o = fn(); o.guides = mode === 'guides'; o.phase = j * 0.9;
        const fx = x0 + cw * 0.45, fy = y0 + ch - 26 * k;
        ctx.fillStyle = 'rgba(90,60,30,.35)'; ctx.fillRect(x0 + 10 * k, fy, cw - 20 * k, 8 * k);
        lolo(ctx, fx, fy, h, o.body || 'sit', o.head || 'idle', o);
      } else {
        hang(ctx, x0 + cw * 0.6, y0 - 10, x0 + cw * 0.5, y0 + 70 * k, h, 'happy', 0.18, { guides: mode === 'guides', phase: 1 });
      }
      label(ctx, name, x0 + 6 * k, y0 + 16 * k, bg, k);
    }));
  } else if (mode === 'moods') {
    c.width = 7 * 200; c.height = 3 * 250;
    BGS.forEach((bg, r) => { ctx.fillStyle = bg; ctx.fillRect(0, r * 250, c.width, 250);
      HEADS_.forEach((hd, i) => { lolo(ctx, i * 200 + 90, r * 250 + 230, 150, 'sit', hd, { ang: 1.0, ext: 0, phase: i });
        label(ctx, hd, i * 200 + 6, r * 250 + 16, bg, 1); }); });
  } else if (mode === 'tilt') {
    const tilts = [-0.3, -0.15, 0, 0.15, 0.3];
    c.width = 5 * 360; c.height = 460;
    tilts.forEach((t, i) => { ctx.fillStyle = BGS[i % 2 ? 0 : 1]; ctx.fillRect(i * 360, 0, 360, 460);
      lolo(ctx, i * 360 + 170, 440, 400, 'sit', 'idle', { tilt: t, arm: false });
      label(ctx, 'tilt ' + t, i * 360 + 6, 18, BGS[i % 2 ? 0 : 1], 1.4); });
  } else if (mode === 'heads') {
    c.width = 7 * 300; c.height = 600;
    HEADS_.forEach((hd, i) => { ctx.fillStyle = BGS[0]; ctx.fillRect(i * 300, 0, 300, 300);
      ctx.drawImage(L['h_' + hd], i * 300 + 6, 6, 288, 288);
      ctx.fillStyle = BGS[2]; ctx.fillRect(i * 300, 300, 300, 300); ctx.drawImage(L['h_' + hd], i * 300 + 6, 306, 288, 288); });
  } else if (mode === 'bodies') {
    c.width = 3 * 300; c.height = 600;
    BODIES.forEach((b, i) => [0, 2].forEach((bi, r) => { ctx.fillStyle = BGS[bi]; ctx.fillRect(i * 300, r * 300, 300, 300);
      ctx.drawImage(L['b_' + b], i * 300 + 22, r * 300 + 22, 256, 256);
      ctx.strokeStyle = 'rgba(255,0,0,.5)'; ctx.strokeRect(i * 300 + 22, r * 300 + 22, 256, 256);
      const AN = LA().ANCHORS, P = b === 'hang' ? AN.hang : AN.body;
      Object.keys(P).forEach(key => { if (Array.isArray(P[key])) dot(ctx, i * 300 + 22 + P[key][0], r * 300 + 22 + P[key][1], 'red'); }); }));
  }
  document.title = 'done';
}
const BODIES = ${JSON.stringify(BODIES)};
</script></body></html>`;
const tmp = path.join(OUT, '_lolo_sheet.html');
fs.writeFileSync(tmp, page);
(async () => {
  const b = await chromium.launch();
  for (const [name, hash] of [['lolo_poses.png', 'poses'], ['lolo_guides.png', 'guides'], ['lolo_poses_3x.png', 'x3'],
    ['lolo_moods.png', 'moods'], ['lolo_tilt.png', 'tilt'], ['lolo_heads.png', 'heads'], ['lolo_bodies.png', 'bodies']]) {
    const q = await b.newPage({ viewport: { width: 1400, height: 900 } });
    q.on('pageerror', e => console.log('[err]', e.message));
    await q.goto('file://' + tmp + '#' + hash);
    await q.waitForFunction(() => document.title === 'done', null, { timeout: 15000 });
    await q.locator('#c').screenshot({ path: path.join(OUT, name) });
    await q.close();
    console.log(name);
  }
  // critters / stars / title / icon
  const im = (rel, w, h, st = '') => `<img src="${uri(rel)}" width="${w}" height="${h}" style="${st}">`;
  const pan = (bg, inner) => `<div style="background:${bg};display:flex;gap:16px;padding:16px;align-items:flex-end;flex-wrap:wrap">${inner}</div>`;
  const misc = ['#F4F8EC', '#3E7A4E', '#1E2A4A'].map(bg => pan(bg,
    im('characters/toucan.svg', 56, 56) + im('characters/toucan_flap.svg', 56, 56) + im('characters/frog.svg', 56, 56) +
    im('characters/frog_jump.svg', 56, 56) + im('characters/toucan.svg', 192, 192) + im('characters/toucan_flap.svg', 192, 192) +
    im('characters/frog.svg', 192, 192) + im('characters/frog_jump.svg', 192, 192) + im('ui/star.svg', 32, 32) +
    im('ui/star_empty.svg', 32, 32) + im('ui/star.svg', 96, 96) + im('ui/star_empty.svg', 96, 96) +
    im('icon.svg', 60, 60, 'border-radius:13px') + im('characters/lolo_title.svg', 120, 180))).join('');
  const q = await b.newPage({ viewport: { width: 1500, height: 400 } });
  await q.setContent(`<html><body style="margin:0">${misc}</body></html>`);
  await q.waitForTimeout(300);
  await q.screenshot({ path: path.join(OUT, 'lolo_misc.png'), fullPage: true });
  console.log('lolo_misc.png');
  const q2 = await b.newPage({ viewport: { width: 1200, height: 560 } });
  await q2.setContent(`<html><body style="margin:0">${pan('#FFFFFF', im('icon.svg', 512, 512, 'border-radius:112px') +
    im('characters/lolo_title.svg', 320, 480, 'background:#3E7A4E') + im('characters/lolo_title.svg', 320, 480, 'background:#1E2A4A'))}</body></html>`);
  await q2.waitForTimeout(300);
  await q2.screenshot({ path: path.join(OUT, 'lolo_icon_title.png'), fullPage: true });
  console.log('lolo_icon_title.png');
  await b.close();
  fs.unlinkSync(tmp);
})();
