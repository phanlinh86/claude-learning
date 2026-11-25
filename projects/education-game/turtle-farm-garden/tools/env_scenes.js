// Tumi's Flower Farm: outdoor environment recipe + preview scenes + seam test (Playwright + canvas).
// Run after tools/art_env.js:   node tools/env_scenes.js [filter]
// Writes docs/art/env_<1556x720|960x720|720x1556>_<mood>.png, docs/art/env_seams.png, docs/art/env_particles.png.
//
// RECIPE (render.js reproduces it; copy envLayout() + tileXs() verbatim — pure, no DOM, no requires):
//   E = envLayout(W, H, groundY, { trayTop, trayBottom, trayCx, portrait })   (all opt fields optional)
//   0 fill : fillRect(0, 0, W, H) with ambient.skyBottom (the sky svg's last rows are exactly this colour)
//   1 sky  : drawImage(sky_m, E.sky.x, E.sky.y, E.sky.w, E.sky.h)          — one cover rect, NOT tiled (sun in it)
//   2 light: (summer etc.) drawImage(light, E.light.x, E.light.y, E.light.w, E.light.h), globalAlpha = ambient.light
//   3 far  : tile far_m   at x ∈ tileXs(E.far.x0, E.far.w, W), y = E.far.y, size E.far.w × E.far.h
//   4 mid  : tile mid_m   (E.mid …)   — prop bases (vb y 270) land on E.midY
//   5 meadow: if E.meadow.h > 0 (portrait) fillRect(0, E.meadow.y, W, E.meadow.h) with ambient.meadow
//   6 ground: tile ground_m (E.ground …) — landscape: meadow top (vb y 12) = E.midY + 2; portrait: tile bottom = H; then
//            fillRect(0, E.ground.fillY, W, H − fillY) with ambient.floor when fillY < H (portrait)
//   7 tint : if ambient.tint, fillRect over the whole screen (skip during the bed draw)
//   Every layer is uniformly scaled (k) so FT.Assets.exact(name, round(w·rs), round(h·rs)) can pre-render it once
//   (names 'sky_spring', 'far_spring', 'mid_spring', 'ground_spring', 'light').
//   Mood crossfade: draw both moods' stacks with alpha (1 − mix) / mix, or crossfade per layer.
//
// AMBIENT (from art_env.js, for weather.js):
//   spring { skyTop '#BFE3F2', skyBottom '#EAF6F4', meadow '#9CC77A', floor '#8EBB6D', light 0.35 }
//   summer { skyTop '#A3D6F0', skyBottom '#E8F6F0', meadow '#97C474', floor '#89B767', light 0.8, tint 'rgba(255,240,200,0.05)' }
//   autumn { skyTop '#C2D8E0', skyBottom '#F5E2C4', meadow '#AEBF7B', floor '#A2B56F', light 0.4, tint 'rgba(240,180,100,0.06)' }
//   winter { skyTop '#C6D8E8', skyBottom '#EEF3F6', meadow '#DDE8E4', floor '#D2E0D8', light 0.15 }
//   (wall = skyBottom for legacy callers)
'use strict';
const fs = require('fs');
const path = require('path');

/** Pure layout of the farm layers for a W × H screen whose feet line is groundY.
 *  Returns { portrait, horizonY, midY, sun:{x,y}, sky:{k,x,y,w,h}, light:{k,x,y,w,h}, far:{k,w,h,x0,y},
 *  mid:{k,w,h,x0,y}, meadow:{y,h}, ground:{k,w,h,x0,y,fillY} }. Tile x positions: tileXs(layer.x0, layer.w, W). */
function envLayout(W, H, groundY, opt) {
  opt = opt || {};
  const portrait = opt.portrait != null ? !!opt.portrait : H > W;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // anchors inside the SVGs (tools/art_env.js)
  const FAR_HZ = 170, FARM_X = 420, FOCUS_X = 500, MID_BASE = 270, GROUND_LINE = 12, SUN_X = 470, SUN_Y = 625;
  let horizonY, midY, kf, km, kg, farmX, sunX, sunY;
  if (!portrait) {
    const tt = opt.trayTop != null ? opt.trayTop : 150;
    horizonY = Math.round(H * 0.42);
    midY = horizonY + Math.round(H * 0.16);
    kf = clamp(H / 900, 0.7, 1.0);
    km = clamp(H / 1000, 0.62, 0.9);
    kg = Math.max(0.9, (H + 4 - midY) / (260 - GROUND_LINE));
    farmX = 150;                                   // the free column left of the bed (above Tumi, below the fence)
    sunX = W * 0.68; sunY = clamp(tt * 0.55, 46, 120);
  } else {
    const tt = opt.trayTop != null ? opt.trayTop : Math.round(H * 0.25);
    horizonY = Math.round(tt - 60);                // hills + the farm show in the band just above the bed
    midY = Math.round(tt + 40);                    // hedge / scarecrow tops peek over the bed's top edge
    kf = clamp(W / 960, 0.62, 0.9);
    km = clamp(W / 900, 0.7, 1.0);
    kg = clamp(W / 520, 1.2, 1.6);                 // the meadow tile sits at the BOTTOM (around Tumi / the fence)
    farmX = W * 0.3;
    sunX = W * 0.55; sunY = clamp(tt * 0.18, 40, 90);
  }
  const ks = Math.max(W / 800, 0.6) * 1.15;        // a bit wider than the screen so the sun can be placed
  const sky = { k: ks, w: 800 * ks, h: 720 * ks, x: 0, y: 0 };
  sky.x = clamp(sunX - SUN_X * ks, W - sky.w, 0);
  sky.y = Math.min(0, sunY - SUN_Y * ks);
  const sun = { x: sky.x + SUN_X * ks, y: sky.y + SUN_Y * ks };
  const kl = portrait ? H / 900 : H / 720;
  const light = { k: kl, w: 600 * kl, h: 720 * kl, x: sun.x - 560 * kl, y: sun.y + 40 * kl - 60 * kl };
  const far = { k: kf, w: 1600 * kf, h: 360 * kf, x0: farmX - FARM_X * kf, y: horizonY - FAR_HZ * kf };
  const mid = { k: km, w: 1200 * km, h: 300 * km, x0: farmX - FOCUS_X * km, y: midY - MID_BASE * km };
  const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: W / 2 - 600 * kg, y: midY + 2 - GROUND_LINE * kg };
  if (portrait) ground.y = Math.max(ground.y, H + 2 - 258 * kg);
  ground.fillY = ground.y + 258 * kg;
  // plain meadow between the mid layer's base and the ground tile's top (portrait only; h 0 in landscape)
  const meadow = { y: midY, h: Math.max(0, Math.ceil(ground.y + (GROUND_LINE + 6) * kg - midY)) };
  return { portrait, horizonY, midY, sun, sky, light, far, mid, meadow, ground };
}
/** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

// placeholder UI layout (judging the previews only): bed, Tumi box, bubble, HUD, packets, fence
function uiLayout(W, H) {
  const portrait = H > W;
  if (!portrait) {
    const tray = { x: 290, y: 150, w: Math.min(1500, W - 40) - 290, h: 410 };
    if (W < 1200) { tray.w = W - 30 - 290; tray.h = Math.min(410, tray.w / 1.5 + 0); tray.y = 150; }
    return { portrait, groundY: H - 18, tray, bubble: { x: 24, y: 18, w: Math.min(560, W - 224), h: 122 }, tumi: { x: 20, y: H - 18 - 250, w: 250, h: 250 }, rack: { x: 24, y: 160, w: 230, h: 60 }, palY: tray.y + tray.h + 70, palX: tray.x + tray.w / 2 };
  }
  const tray = { x: 20, y: 330, w: 680, h: 460 };
  return { portrait, groundY: H - 30, tray, bubble: { x: 24, y: 110, w: W - 48, h: 124 }, tumi: { x: 20, y: H - 30 - 250, w: 230, h: 250 }, rack: { x: 300, y: H - 200, w: 380, h: 60 }, palY: tray.y + tray.h + 90, palX: W / 2 };
}

module.exports = { envLayout, tileXs, uiLayout };
if (require.main !== module) return;

// ----------------------------------------------------------------------------------------------------- previews
const { chromium } = require('playwright');
const { MOODS, AMBIENT, PARTICLES } = require('./art_env.js');
const ROOT = path.join(__dirname, '..');
const A = path.join(ROOT, 'game/assets/default');
const ART = path.join(ROOT, 'docs/art');
const NAMES = ['env/light', ...MOODS.flatMap(s => ['sky', 'far', 'mid', 'ground'].map(l => `env/${l}_${s}`)), ...PARTICLES.map(p => 'particles/' + p)];
const SRC = {}; for (const n of NAMES) SRC[n] = 'data:image/svg+xml;base64,' + fs.readFileSync(path.join(A, n + '.svg')).toString('base64');
const VPS = [[1556, 720], [960, 720], [720, 1556]];
const PACKS = { spring: ['#E84A4A', '#3C8DE8', '#FFD23F'], summer: ['#4CC26B', '#FF9A2E', '#8E44AD'], autumn: ['#3C8DE8', '#FFD23F', '#FF8FC0'], winter: ['#FF9A2E', '#4CC26B', '#E84A4A'] };

function pageScene({ mood, W, H, E, U, src, amb, packs, tileXsSrc }) {
  const tileXs = eval('(' + tileXsSrc + ')');
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const im = {}; for (const k of Object.keys(src)) im[k] = await load(src[k]);
    const c = document.createElement('canvas'); c.width = W; c.height = H; const g = c.getContext('2d');
    g.fillStyle = amb.skyBottom; g.fillRect(0, 0, W, H);
    g.drawImage(im['env/sky_' + mood], E.sky.x, E.sky.y, E.sky.w, E.sky.h);
    g.save(); g.globalAlpha = amb.light; g.drawImage(im['env/light'], E.light.x, E.light.y, E.light.w, E.light.h); g.restore();
    const lay = (name, Ly) => { for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(im[name], x, Ly.y, Ly.w + 0.5, Ly.h); };
    lay('env/far_' + mood, E.far); lay('env/mid_' + mood, E.mid);
    if (E.meadow.h > 0) { g.fillStyle = amb.meadow; g.fillRect(0, E.meadow.y, W, E.meadow.h); }
    lay('env/ground_' + mood, E.ground);
    if (E.ground.fillY < H) { g.fillStyle = amb.floor; g.fillRect(0, E.ground.fillY, W, H - E.ground.fillY); }
    if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
    // a few particles drifting
    const pk = { spring: 'petal', summer: 'pollen', autumn: 'leaf_a', winter: 'snow' }[mood];
    for (let i = 0; i < 14; i++) { const s = 14 + (i % 3) * 6; g.drawImage(im['particles/' + pk], ((i * 0.618 + 0.13) % 1) * W, ((i * 0.377 + 0.05) % 1) * H, s, s); }
    for (let i = 0; i < 5; i++) g.drawImage(im['particles/seed'], ((i * 0.43 + 0.3) % 1) * W, ((i * 0.29 + 0.2) % 1) * H * 0.6, 22, 22);
    // ---- placeholders
    const rr = (x, y, w, h, r, fill, st, lw = 4) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fillStyle = fill; g.fill(); if (st) { g.lineWidth = lw; g.strokeStyle = st; g.stroke(); } };
    rr(U.bubble.x, U.bubble.y, U.bubble.w, U.bubble.h, 26, 'rgba(255,255,255,0.93)');
    rr(W - 160, 16, 144, 64, 20, 'rgba(255,255,255,0.9)');
    const t = U.tray;
    g.save(); g.globalAlpha = 0.25; g.fillStyle = '#3A2A1A'; g.beginPath(); g.roundRect(t.x - 10, t.y + 6, t.w + 24, t.h + 24, 22); g.fill(); g.restore();
    rr(t.x - 16, t.y - 16, t.w + 32, t.h + 32, 20, '#C9935E', '#6E4526', 5);
    rr(t.x, t.y, t.w, t.h, 10, '#6B4630', '#4A2F1F', 3);
    const cx = t.x + t.w / 2, cy = t.y + t.h / 2, cs = t.h / 400;
    g.beginPath(); g.arc(cx, cy, 150 * cs, 0, 7); g.fillStyle = '#8A5E40'; g.fill();
    g.fillStyle = '#FFF3DC'; for (let i = 0; i < 12; i++) { g.beginPath(); g.arc(cx - 120 * cs + i * 22 * cs, cy + Math.sin(i * 0.7) * 40 * cs, 7, 0, 7); g.fill(); }
    // flowers in the answer colours on the bed (do they pop against the scene?)
    packs.forEach((col, i) => { for (let k = 0; k < 4; k++) { const x = cx - 120 * cs + k * 70 * cs, y = cy - 80 * cs + i * 70 * cs; g.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p * 1.2566; g.beginPath(); g.arc(x + Math.cos(a) * 11, y + Math.sin(a) * 11, 9, 0, 7); g.fill(); } g.fillStyle = '#FFE08A'; g.beginPath(); g.arc(x, y, 7, 0, 7); g.fill(); } });
    // seed packets (choices)
    packs.forEach((col, i) => {
      const x = U.palX + (i - 1) * 140, y = U.palY;
      g.save(); g.globalAlpha = 0.22; g.fillStyle = '#2A3A1A'; g.beginPath(); g.ellipse(x, y + 52, 44, 8, 0, 0, 7); g.fill(); g.restore();
      rr(x - 38, y - 50, 76, 100, 8, '#FBF3E2', '#B9A27A', 3); rr(x - 38, y - 50, 76, 22, 6, col);
      g.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p * 1.2566; g.beginPath(); g.arc(x + Math.cos(a) * 12, y + 10 + Math.sin(a) * 12, 10, 0, 7); g.fill(); }
    });
    // Tumi placeholder box + fence
    const n = U.tumi; rr(n.x, n.y, n.w, n.h, 30, 'rgba(185,204,147,0.85)', '#5E7446', 4);
    g.fillStyle = '#C68B4F'; g.beginPath(); g.ellipse(n.x + n.w * 0.45, n.y + n.h * 0.6, n.w * 0.35, n.h * 0.25, 0, Math.PI, 0); g.fill();
    const rk = U.rack; g.fillStyle = '#D7B58A'; g.strokeStyle = '#9C6B3E'; g.lineWidth = 3;
    g.fillRect(rk.x, rk.y + 14, rk.w, 8); g.fillRect(rk.x, rk.y + 38, rk.w, 8);
    for (let x = rk.x + 6; x < rk.x + rk.w; x += 28) { g.beginPath(); g.roundRect(x, rk.y, 16, rk.h, [8, 8, 2, 2]); g.fill(); g.stroke(); }
    return c.toDataURL('image/png');
  })();
}

function pageSeams({ src, list }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    let total = 0; for (const [, w, h] of list) total += h / 2 * (1200 / w) + 12;
    const out = document.createElement('canvas'); out.width = 1800; out.height = Math.ceil(total);
    const o = out.getContext('2d'); o.fillStyle = '#556'; o.fillRect(0, 0, out.width, out.height);
    const scores = []; let y = 0;
    for (const [n, w, h, zy] of list) {
      const im = await load(src[n]);
      const c = document.createElement('canvas'); c.width = 2 * w; c.height = h; const g = c.getContext('2d');
      g.fillStyle = '#BFE3F2'; g.fillRect(0, 0, 2 * w, h);
      g.drawImage(im, 0, 0, w, h); g.drawImage(im, w, 0, w, h);
      const d = g.getImageData(0, 0, 2 * w, h).data;
      const col = (x1, x2) => { let t = 0; for (let yy = 0; yy < h; yy++) { const i = (yy * 2 * w + x1) * 4, j = (yy * 2 * w + x2) * 4; for (let q = 0; q < 3; q++) t += Math.abs(d[i + q] - d[j + q]); } return t / h; };
      const seam = col(w - 1, w); let sum = 0; for (let x = 50; x < w - 50; x++) sum += col(x, x + 1);
      const avg = sum / (w - 100);
      scores.push(`${n.padEnd(22)} seam=${seam.toFixed(2)} interiorAvg=${avg.toFixed(2)} ${seam <= Math.max(1.5, avg * 3) ? 'OK' : 'CHECK'}`);
      const dh = h / 2 * (1200 / w);
      o.drawImage(c, 0, y, 1200, dh);
      o.save(); o.setLineDash([6, 6]); o.strokeStyle = 'red'; o.lineWidth = 1.5; o.beginPath(); o.moveTo(600, y); o.lineTo(600, y + dh); o.stroke(); o.restore();
      const zh = Math.min(h, dh / 4);
      o.imageSmoothingEnabled = false; o.drawImage(c, w - 74, Math.max(0, Math.min(h - zh, zy)), 148, zh, 1210, y, 592, Math.min(dh, zh * 4)); o.imageSmoothingEnabled = true;
      o.save(); o.setLineDash([8, 6]); o.strokeStyle = 'red'; o.lineWidth = 2; o.beginPath(); o.moveTo(1506, y); o.lineTo(1506, y + dh); o.stroke(); o.restore();
      y += dh + 12;
    }
    return { url: out.toDataURL('image/png'), scores };
  })();
}

function pageParticles({ src, parts }) {
  const load = s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; });
  return (async () => {
    const n = parts.length, c = document.createElement('canvas'); c.width = 20 + n * 110; c.height = 360; const g = c.getContext('2d');
    g.fillStyle = '#EAF6F4'; g.fillRect(0, 0, c.width, 120); g.fillStyle = '#9CC77A'; g.fillRect(0, 120, c.width, 120); g.fillStyle = '#6B4630'; g.fillRect(0, 240, c.width, 120);
    let x = 20;
    for (const p of parts) { const im = await load(src['particles/' + p]); for (const y0 of [0, 120, 240]) g.drawImage(im, x, y0 + 16, 88, 88); x += 110; }
    return c.toDataURL('image/png');
  })();
}

(async () => {
  fs.mkdirSync(ART, { recursive: true });
  const b = await chromium.launch(); const pg = await b.newPage();
  await pg.setContent('<html><body style="margin:0"></body></html>');
  const save = (url, file) => fs.writeFileSync(file, Buffer.from(url.split(',')[1], 'base64'));
  const only = process.argv[2];
  for (const [W, H] of VPS) for (const m of MOODS) {
    const vp = `${W}x${H}`; if (only && !`${vp}_${m}`.includes(only)) continue;
    const U = uiLayout(W, H);
    const E = envLayout(W, H, U.groundY, { trayTop: U.tray.y, trayBottom: U.tray.y + U.tray.h, trayCx: U.tray.x + U.tray.w / 2, portrait: U.portrait });
    save(await pg.evaluate(pageScene, { mood: m, W, H, E, U, src: SRC, amb: AMBIENT[m], packs: PACKS[m], tileXsSrc: tileXs.toString() }), path.join(ART, `env_${vp}_${m}.png`));
    if (m === 'spring') console.log(vp, JSON.stringify({ horizonY: E.horizonY, midY: E.midY, sky: [E.sky.x, E.sky.y, E.sky.w].map(Math.round), kf: +E.far.k.toFixed(3), farY: Math.round(E.far.y), km: +E.mid.k.toFixed(3), kg: +E.ground.k.toFixed(3), fillY: Math.round(E.ground.fillY) }));
  }
  if (!only || only === 'sheet') save(await pg.evaluate(pageParticles, { src: SRC, parts: PARTICLES }), path.join(ART, 'env_particles.png'));
  if (!only || only === 'seams') {
    const list = MOODS.flatMap(s => [['env/far_' + s, 1600, 360, 150], ['env/mid_' + s, 1200, 300, 150], ['env/ground_' + s, 1200, 260, 20]]);
    const sm = await pg.evaluate(pageSeams, { src: SRC, list }); save(sm.url, path.join(ART, 'env_seams.png')); console.log(sm.scores.join('\n'));
  }
  await b.close(); console.log('wrote', ART);
})().catch(e => { console.error(e); process.exit(1); });
