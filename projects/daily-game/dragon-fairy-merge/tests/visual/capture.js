// Visual QA capture for Mossy's Egg Grove (report-only). Writes PNGs + metrics.json to tests/out/visual/ (gitignored).
// Run:  node tests/visual/capture.js          (everything)
//       ONLY=screens,seasons,wind,events,read,cvd,custom,views node tests/visual/capture.js
// Serves game/ over a tiny node http server; drives the game through the URL flags and window.MEG.debug.
// The sim is frozen (setSpeed(0)) and advanced by hand so every frame is deterministic and ~80 ms apart.
// Phones get a simulated iPhone safe area (notch / home bar) by overriding the env() paddings; a faint magenta
// strip shows the unsafe area on the screenshot so overlaps are visible.
const { chromium } = require('playwright');
const http = require('http'), path = require('path'), fs = require('fs');
const ROOT = path.resolve(__dirname, '../../game');
const OUT = path.resolve(__dirname, '../out/visual'); fs.mkdirSync(OUT, { recursive: true });
const ONLY = (process.env.ONLY || '').split(',').filter(Boolean);
const want = k => !ONLY.length || ONLY.includes(k);
const errs = [], metrics = {};

const VIEWS = {
  desk:   { viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 },
  ipad:   { viewport: { width: 1366, height: 1024 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true },
  phoneP: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, insets: [47, 0, 34, 0] },
  phoneL: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, insets: [0, 47, 21, 47] }
};
const SEASONS = ['spring', 'summer', 'autumn', 'winter'];

// ---------- static server ----------
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
function serve() {
  return new Promise(res => {
    const srv = http.createServer((req, rsp) => {
      let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
      const f = path.join(ROOT, p);
      if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { rsp.writeHead(404); rsp.end(); return; }
      rsp.writeHead(200, { 'Content-Type': MIME[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(f).pipe(rsp);
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

// ---------- page helpers ----------
const raf = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
async function open(b, base, view, q) {
  const V = VIEWS[view];
  const ctx = await b.newContext({ viewport: V.viewport, deviceScaleFactor: V.deviceScaleFactor, hasTouch: !!V.hasTouch, isMobile: !!V.isMobile });
  const p = await ctx.newPage();
  p.on('console', m => { if (m.type() === 'error') errs.push(view + ': ' + m.text()); });
  p.on('pageerror', e => errs.push(view + ': ' + e));
  await p.goto(base + '/index.html?mute=1&seed=7' + (q || ''));
  await p.waitForFunction(() => window.MEG && MEG.debug && MEG.debug.mode && MEG.debug.mode !== 'boot', null, { timeout: 20000 });
  if (V.insets) {
    const [t, r, bt, l] = V.insets;
    await p.addStyleTag({ content: `#safeProbe{padding:${t}px ${r}px ${bt}px ${l}px !important}.screen{padding:${t}px ${r}px ${bt}px ${l}px !important}
      .qa-unsafe{position:fixed;background:rgba(255,0,200,.18);pointer-events:none;z-index:99999}` });
    await p.evaluate(([t, r, bt, l]) => {
      const mk = css => { const d = document.createElement('div'); d.className = 'qa-unsafe'; Object.assign(d.style, css); document.body.appendChild(d); };
      if (t) mk({ left: 0, right: 0, top: 0, height: t + 'px' }); if (bt) mk({ left: 0, right: 0, bottom: 0, height: bt + 'px' });
      if (l) mk({ left: 0, top: 0, bottom: 0, width: l + 'px' }); if (r) mk({ right: 0, top: 0, bottom: 0, width: r + 'px' });
      MEG.Game.relayout();
    }, V.insets);
  }
  await installHelpers(p);
  if (/autostart=1/.test(q || '')) await p.waitForFunction(() => MEG.debug.mode === 'playing', null, { timeout: 15000 });
  await raf(p);
  return { ctx, p };
}
function installHelpers(p) {
  return p.evaluate(() => {
    const D = MEG.debug, G = MEG.Game;
    D.adv = (sec) => { const n = Math.max(1, Math.round(sec * 120)), h = sec / n; for (let i = 0; i < n; i++) G.step(h); G.renderer.update(sec); };
    D.freeze = () => D.setSpeed(0);
    D.clear = () => { const w = G.world; w.eggs.length = 0; w.danger = 0; G.renderer.texts.length = 0; G.renderer.rings.length = 0; };
    D.quiet = () => { const R = G.renderer; R.banner = null; R.hint = null; R.texts.length = 0; };
    // a resting pile: [kind, x, y] dropped in, then settled
    D.pile = (list, settle) => { for (const [k, x, y] of list) { D.spawnEgg(k, x, y); D.adv(0.12); } D.adv(settle == null ? 3 : settle); };
    D.calm = () => { const w = G.world.wind; w.phase = 'calm'; w.t = 0; w.dur = 999; w.force = 0; w.dir = 0; };
    // logical px → CSS px box (for crops)
    D.box = (lx, ly, lw, lh) => { const R = G.renderer, c = R.canvas.getBoundingClientRect(), s = c.width / R.px / R.VW;
      const k = c.width / R.VW / (R.canvas.width / c.width) ; const sc = c.width / R.VW;
      return { x: c.left + lx * sc, y: c.top + ly * sc, width: lw * sc, height: lh * sc }; };
    D.geo = () => { const R = G.renderer; return { VW: R.VW, VH: R.VH, unit: R.unit, ox: R.ox, groundPx: R.groundPx, portrait: R.portrait, sc: R.sc, ins: R.ins, topHud: R.topHud }; };
  });
}
async function shot(p, name, clip) {
  const opt = { path: path.join(OUT, name + '.png') };
  if (clip) { const vp = p.viewportSize(); clip.x = Math.max(0, clip.x); clip.y = Math.max(0, clip.y); clip.width = Math.min(clip.width, vp.width - clip.x); clip.height = Math.min(clip.height, vp.height - clip.y); opt.clip = clip; }
  return p.screenshot(opt);
}
const buf = async (p, clip) => p.screenshot(clip ? { clip } : {});
const ev = (p, f, a) => p.evaluate(f, a);

// ---------- piles ----------
const HALF = [[8, 2.2, 2.2], [7, 6.6, 1.8], [1, 8.4, 0.6], [6, 1.7, 5.6], [5, 4.8, 5], [4, 7.6, 4.6], [3, 2.2, 8.5], [2, 5.2, 8], [1, 3.6, 9], [3, 7.4, 8]];
const FULL = HALF.concat([[5, 6.9, 9.5], [2, 1.2, 10.5], [4, 4.3, 10.5], [6, 1.8, 12], [1, 8.3, 11], [3, 5.6, 12.5], [2, 3.4, 13], [5, 7.2, 13.5], [4, 2.0, 14.5]]);

// ---------- contact sheets / filters (in a blank page) ----------
let composer;
async function sheet(name, frames, cols, scale, labels) {
  const imgs = frames.map(b => 'data:image/png;base64,' + b.toString('base64'));
  const out = await composer.evaluate(async ([imgs, cols, scale, labels]) => {
    const ims = await Promise.all(imgs.map(s => new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = s; })));
    const w = Math.round(ims[0].width * scale), h = Math.round(ims[0].height * scale), rows = Math.ceil(ims.length / cols), pad = 4, lab = 16;
    const c = document.createElement('canvas'); c.width = cols * (w + pad) + pad; c.height = rows * (h + pad + lab) + pad;
    const g = c.getContext('2d'); g.fillStyle = '#222'; g.fillRect(0, 0, c.width, c.height);
    ims.forEach((im, i) => { const x = pad + (i % cols) * (w + pad), y = pad + Math.floor(i / cols) * (h + pad + lab);
      g.drawImage(im, x, y + lab, w, h); g.fillStyle = '#ddd'; g.font = '12px monospace'; g.fillText(labels ? labels[i] : String(i), x + 2, y + 12); });
    return c.toDataURL('image/png').split(',')[1];
  }, [imgs, cols, scale, labels || null]);
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(out, 'base64'));
}
// Machado et al. 2009 (severity 1), applied in linear RGB
const CVD = {
  deut: [0.367322, 0.860646, -0.227968, 0.280085, 0.672501, 0.047413, -0.011820, 0.042940, 0.968881],
  prot: [0.152286, 1.052583, -0.204868, 0.114503, 0.786281, 0.099216, -0.003882, -0.048116, 1.051998]
};
async function cvd(name, png, kind) {
  const out = await composer.evaluate(async ([src, M]) => {
    const im = await new Promise(r => { const i = new Image(); i.onload = () => r(i); i.src = src; });
    const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const g = c.getContext('2d'); g.drawImage(im, 0, 0);
    const d = g.getImageData(0, 0, c.width, c.height), a = d.data;
    const lin = new Float32Array(256); for (let i = 0; i < 256; i++) { const v = i / 255; lin[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }
    const enc = v => { v = v < 0 ? 0 : v > 1 ? 1 : v; return Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)); };
    for (let i = 0; i < a.length; i += 4) { const r = lin[a[i]], gg = lin[a[i + 1]], b = lin[a[i + 2]];
      a[i] = enc(M[0] * r + M[1] * gg + M[2] * b); a[i + 1] = enc(M[3] * r + M[4] * gg + M[5] * b); a[i + 2] = enc(M[6] * r + M[7] * gg + M[8] * b); }
    g.putImageData(d, 0, 0); return c.toDataURL('image/png').split(',')[1];
  }, ['data:image/png;base64,' + png.toString('base64'), CVD[kind]]);
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(out, 'base64'));
}
// synthetic custom pictures: a photo-like opaque PNG (gradients + grain, a pet-ish face) and a transparent crayon drawing
async function makeInputs() {
  const r = await composer.evaluate(() => {
    const photo = document.createElement('canvas'); photo.width = 800; photo.height = 600; let g = photo.getContext('2d');
    let gr = g.createLinearGradient(0, 0, 0, 600); gr.addColorStop(0, '#8fb3d9'); gr.addColorStop(0.55, '#d9c7a8'); gr.addColorStop(1, '#6b5a44'); g.fillStyle = gr; g.fillRect(0, 0, 800, 600);
    g.fillStyle = '#4d7a3a'; g.fillRect(0, 430, 800, 170);
    gr = g.createRadialGradient(400, 300, 30, 400, 320, 230); gr.addColorStop(0, '#e6b07a'); gr.addColorStop(1, '#9a6337'); g.fillStyle = gr;
    g.beginPath(); g.ellipse(400, 320, 210, 190, 0, 0, 7); g.fill();
    g.beginPath(); g.moveTo(230, 210); g.lineTo(260, 60); g.lineTo(340, 170); g.fill(); g.beginPath(); g.moveTo(570, 210); g.lineTo(540, 60); g.lineTo(460, 170); g.fill();
    g.fillStyle = '#1d1410'; g.beginPath(); g.arc(330, 290, 26, 0, 7); g.arc(470, 290, 26, 0, 7); g.fill(); g.beginPath(); g.ellipse(400, 360, 30, 20, 0, 0, 7); g.fill();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(338, 280, 8, 0, 7); g.arc(478, 280, 8, 0, 7); g.fill();
    const d = g.getImageData(0, 0, 800, 600); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 26; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0);
    const draw = document.createElement('canvas'); draw.width = 600; draw.height = 600; g = draw.getContext('2d'); g.lineCap = g.lineJoin = 'round';
    g.lineWidth = 14; g.strokeStyle = '#e0457b'; g.fillStyle = '#ffd1e0';
    g.beginPath(); g.moveTo(300, 90); g.bezierCurveTo(470, 80, 520, 300, 470, 430); g.bezierCurveTo(420, 540, 180, 540, 130, 430); g.bezierCurveTo(80, 300, 130, 95, 300, 90); g.fill(); g.stroke();
    g.strokeStyle = '#3355cc'; g.lineWidth = 12; g.beginPath(); g.arc(240, 270, 18, 0, 7); g.stroke(); g.beginPath(); g.arc(360, 270, 18, 0, 7); g.stroke();
    g.strokeStyle = '#1f8f3a'; g.beginPath(); g.arc(300, 340, 70, 0.2, Math.PI - 0.2); g.stroke();
    g.strokeStyle = '#f0a000'; g.lineWidth = 10; for (let i = 0; i < 7; i++) { const a = i / 7 * 6.28; g.beginPath(); g.moveTo(300 + Math.cos(a) * 250, 320 + Math.sin(a) * 250); g.lineTo(300 + Math.cos(a) * 285, 320 + Math.sin(a) * 285); g.stroke(); }
    return [photo.toDataURL('image/png'), draw.toDataURL('image/png')];
  });
  const files = { photo: path.join(OUT, 'input_photo.png'), drawing: path.join(OUT, 'input_drawing.png') };
  fs.writeFileSync(files.photo, Buffer.from(r[0].split(',')[1], 'base64'));
  fs.writeFileSync(files.drawing, Buffer.from(r[1].split(',')[1], 'base64'));
  return r;
}

// =====================================================================================================
(async () => {
  const srv = await serve(), base = 'http://127.0.0.1:' + srv.address().port;
  const b = await chromium.launch();
  composer = await (await b.newContext()).newPage();
  await composer.setContent('<html><body></body></html>');

  // ---------- 1. every screen × 4 viewports ----------
  if (want('screens')) for (const view of Object.keys(VIEWS)) {
    const { ctx, p } = await open(b, base, view, '');
    await ev(p, () => MEG.debug.adv(2)); await raf(p);
    await shot(p, `screen_${view}_title`);
    for (const [btn, name] of [['btnHow', 'how'], ['btnSettings', 'settings'], ['btnCustomize', 'pictures']]) {
      await ev(p, id => { document.getElementById(id).click(); }, btn); await p.waitForTimeout(250);
      await shot(p, `screen_${view}_${name}`);
      // scroll the panel to the bottom too (does the Done button fit?)
      await ev(p, () => { document.querySelectorAll('.screen:not(.hidden), .screen:not(.hidden) .panel').forEach(e => e.scrollTop = 1e5); }); await p.waitForTimeout(100);
      await shot(p, `screen_${view}_${name}_bottom`);
      await ev(p, () => MEG.UI.back ? MEG.UI.back() : MEG.Game.toTitle()); await p.waitForTimeout(150);
    }
    await ev(p, () => { MEG.debug.startGame(); }); await p.waitForTimeout(200);
    await ev(p, () => { MEG.debug.freeze(); MEG.debug.adv(0.5); }); await raf(p);
    await shot(p, `screen_${view}_play_banner`);
    await ev(p, () => { MEG.debug.adv(2.5); MEG.debug.pile([[3, 3, 1], [2, 6, 1], [1, 7.5, 1]], 1.5); }); await raf(p);
    await shot(p, `screen_${view}_play_hint`);
    await ev(p, () => MEG.Game.pause()); await p.waitForTimeout(200);
    await shot(p, `screen_${view}_pause`);
    await ev(p, () => { MEG.Game.resume(); MEG.debug.freeze(); const w = MEG.Game.world; w.score = 742; w.stats.maxKind = 7; w.stats.merges = 41; w.stats.maxCombo = 3; w.stats.hatches = 1; w.stats.drops = 88; MEG.Game.gameOver(); });
    await p.waitForTimeout(500);
    await shot(p, `screen_${view}_over`);
    await ctx.close();
  }

  // ---------- 2. each season with a half-full nest of all 8 kinds (+ deut/prot copies) ----------
  if (want('seasons') || want('cvd') || want('read')) {
    const { ctx, p } = await open(b, base, 'desk', '&autostart=1&diff=normal');
    await ev(p, () => { MEG.debug.freeze(); MEG.debug.adv(0.2); MEG.debug.calm(); MEG.debug.clear(); });
    await ev(p, HALF => MEG.debug.pile(HALF, 4), HALF);
    metrics.halfKinds = await ev(p, () => MEG.Game.world.eggs.map(e => e.kind).sort());
    // jitter: how far do resting eggs move in 1 s of a settled pile?
    metrics.jitterHalf = await ev(p, () => { const w = MEG.Game.world, a = w.eggs.map(e => [e.id, e.x, e.y, e.rot]); MEG.debug.adv(1);
      let m = 0, mr = 0; for (const [id, x, y, r] of a) { const e = w.eggs.find(q => q.id === id); if (e) { m = Math.max(m, Math.hypot(e.x - x, e.y - y)); mr = Math.max(mr, Math.abs(e.rot - r)); } } return { maxMoveU: m, maxRot: mr }; });
    for (let s = 0; s < 4; s++) {
      await ev(p, s => { const G = MEG.Game; G.world.gotoLevel(s); G.renderer.setLevel(s, true); G.weather.setLevel(s, { instant: true }); MEG.debug.adv(0.1); MEG.debug.quiet(); MEG.debug.calm(); G.world.moveTo(4.5); MEG.debug.adv(1.5); MEG.debug.quiet(); }, s);
      await raf(p);
      const full = await buf(p);
      fs.writeFileSync(path.join(OUT, `season_${s}_${SEASONS[s]}_half.png`), full);
      if (want('cvd') || !ONLY.length) { await cvd(`cvd_deut_${SEASONS[s]}`, full, 'deut'); await cvd(`cvd_prot_${SEASONS[s]}`, full, 'prot'); }
      // readability crops (2× zoom via a hi-dpi context below), plus numeric contrast samples
      const g = await ev(p, () => MEG.debug.geo());
      await shot(p, `read_${SEASONS[s]}_nest`, await ev(p, g => MEG.debug.box(g.ox - 0.8 * g.unit, g.groundPx - 11.5 * g.unit, 10.6 * g.unit, 12.2 * g.unit), g));
      await shot(p, `read_${SEASONS[s]}_mossy`, await ev(p, g => MEG.debug.box(g.ox + 2.5 * g.unit, g.groundPx - 14.2 * g.unit, 4 * g.unit, 3.6 * g.unit), g));
      await shot(p, `read_${SEASONS[s]}_hud`, await ev(p, () => { const R = MEG.Game.renderer, [x, y, W] = R._scoreBox || [0, 0, 200]; return MEG.debug.box(x - 10, y - 10, W + 20, 150); }));
      metrics['contrast_' + SEASONS[s]] = await ev(p, () => {
        const R = MEG.Game.renderer, c = R.canvas, g = c.getContext('2d'), P = R.px;
        const samp = (lx, ly, r) => { const d = g.getImageData(Math.round((lx - r) * P), Math.round((ly - r) * P), Math.round(2 * r * P), Math.round(2 * r * P)).data; let s = [0, 0, 0], n = 0; for (let i = 0; i < d.length; i += 4) { s[0] += d[i]; s[1] += d[i + 1]; s[2] += d[i + 2]; n++; } return s.map(v => Math.round(v / n)); };
        const L = ([r, g2, b]) => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g2) + 0.0722 * f(b); };
        const CR = (a, b2) => { const x = L(a), y = L(b2); return +((Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05)).toFixed(2); };
        const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
        const w = MEG.Game.world; const saved = w.eggs.slice(); w.eggs.length = 0; w.mossy.x = w.mossy.px = 8.4; R.draw('playing');
        const back = samp(R.sx(4.5), R.sy(4), 6), backHi = samp(R.sx(4.5), R.sy(10.5), 6), sky = samp(R.sx(2), R.sy(12.8), 6), side = samp(R.sx(-3), R.sy(8), 6);
        w.eggs.push(...saved); w.mossy.x = w.mossy.px = 4.5; R.draw('playing');
        const K = MEG.Renderer.KCOL.map(h => CR(hex(h), back));
        return { nestBack: back, nestBackTop: backHi, skyBehindMossy: sky, beside: side, eggVsBack: K, mossyBodyVsSky: CR(hex('#6cbb4a'), sky), mossyOutlineVsSky: CR(hex('#336628'), sky), whiteVsSky: CR([255, 255, 255], sky) };
      });
    }
    await ctx.close();
  }

  // ---------- 3. nearly full nest + vine warning + rescue fairy (sheet) ----------
  if (want('events')) {
    const { ctx, p } = await open(b, base, 'desk', '&autostart=1&diff=normal');
    await ev(p, () => { MEG.debug.freeze(); MEG.debug.adv(3); MEG.debug.quiet(); MEG.debug.calm(); MEG.debug.clear(); });
    await ev(p, FULL => MEG.debug.pile(FULL, 0.8), FULL);
    // advance until the warning is on
    metrics.fullWarn = await ev(p, () => { const w = MEG.Game.world; let t = 0; while (w.danger < 0.5 && t < 4) { MEG.debug.adv(0.05); t += 0.05; } return { danger: w.danger, t, eggs: w.eggs.length, rescues: w.rescues }; });
    await raf(p); await shot(p, 'full_warning');
    const fr = [], lab = [];
    for (let i = 0; i < 40; i++) { await ev(p, () => MEG.debug.adv(0.08)); await raf(p); fr.push(await buf(p)); lab.push((i * 80) + 'ms d=' + (await ev(p, () => MEG.Game.world.danger.toFixed(2)))); }
    await sheet('sheet_rescue', fr, 5, 0.4, lab);
    fs.writeFileSync(path.join(OUT, 'rescue_frame_mid.png'), fr.find((_, i) => /d=0\.00/.test(lab[i]) && i > 0) ? fr[lab.findIndex(l => /d=0\.00/.test(l)) + 6] || fr[20] : fr[20]);

    // merge burst
    const run = async (name, setup, n, cols, scale, step) => {
      await ev(p, setup);
      const f = [], l = [];
      for (let i = 0; i < n; i++) { await raf(p); f.push(await buf(p)); l.push(i * Math.round((step || 0.08) * 1000) + 'ms'); await ev(p, s => MEG.debug.adv(s), step || 0.08); }
      await sheet(name, f, cols, scale, l);
      return f;
    };
    const reset = () => { const D = MEG.debug, G = MEG.Game; D.clear(); G.world.rescues = 3; G.renderer.fairies.length = 0; G.renderer.hatches.length = 0; D.calm(); D.quiet(); G.world.moveTo(7.5); D.adv(0.6); };
    const m = await run('sheet_merge', () => { (function () { const D = MEG.debug, G = MEG.Game; D.clear(); G.world.rescues = 3; G.renderer.fairies.length = 0; D.calm(); D.quiet(); G.world.moveTo(7.5); D.adv(0.6);
      D.pile([[6, 1.5, 1.5], [5, 7.5, 1.3]], 1.5); D.spawnEgg(3, 3.9, 0.84); D.spawnEgg(3, 5.4, 0.84); })(); }, 12, 4, 0.5);
    fs.writeFileSync(path.join(OUT, 'merge_frame2.png'), m[2]);
    const c = await run('sheet_combo', () => { const D = MEG.debug, G = MEG.Game; D.clear(); D.calm(); D.quiet(); G.world.moveTo(8); D.adv(0.6);
      D.pile([[4, 7.0, 1], [3, 4.6, 0.9]], 1.5); D.spawnEgg(2, 2.0, 0.66); D.spawnEgg(2, 3.25, 0.66); }, 16, 4, 0.5);
    metrics.combo = await ev(p, () => ({ bestCombo: MEG.Game.world.bestCombo, kinds: MEG.Game.world.eggs.map(e => e.kind) }));
    if (!metrics.combo.bestCombo || metrics.combo.bestCombo < 2) {   // natural chain did not happen: inject the event to see the text styling
      await ev(p, () => { const R = MEG.Game.renderer; R.onEvents([{ type: 'merge', x: 4.5, y: 2, kind: 4, points: 10 }, { type: 'combo', n: 3 }]); MEG.debug.adv(0.1); }); await raf(p);
      await shot(p, 'combo_injected'); metrics.comboInjected = true;
    }
    fs.writeFileSync(path.join(OUT, 'combo_frame.png'), c[Math.min(c.length - 1, 5)]);
    const h = await run('sheet_hatch', () => { const D = MEG.debug, G = MEG.Game; D.clear(); D.calm(); D.quiet(); G.world.moveTo(8); D.adv(0.6);
      D.pile([[5, 1.3, 1.3], [4, 7.9, 1.1]], 1.5); D.spawnEgg(8, 2.4, 3.4); D.spawnEgg(8, 6.6, 3.4); }, 40, 5, 0.4);
    fs.writeFileSync(path.join(OUT, 'hatch_frame04.png'), h[4]); fs.writeFileSync(path.join(OUT, 'hatch_frame12.png'), h[12]);
    // level-up banner + season crossfade (spring → summer)
    const lv = await run('sheet_levelup', () => { const D = MEG.debug, G = MEG.Game; D.clear(); D.calm(); D.quiet(); G.world.gotoLevel(0); G.renderer.setLevel(0, true); G.weather.setLevel(0, { instant: true }); D.adv(0.1); D.quiet();
      D.pile([[5, 2, 1.3], [3, 5, 1], [2, 7.5, 1]], 1.5); G.world.gotoLevel(1); G.world.score += 3; }, 36, 6, 0.33);
    fs.writeFileSync(path.join(OUT, 'levelup_frame06.png'), lv[6]); fs.writeFileSync(path.join(OUT, 'levelup_frame12.png'), lv[12]);
    // a land puff (plonk) sheet at full speed
    await run('sheet_drop', () => { const D = MEG.debug, G = MEG.Game; D.clear(); D.calm(); D.quiet(); G.world.gotoLevel(0); G.renderer.setLevel(0, true);
      D.pile([[4, 6.5, 1.1]], 1.2); G.world.moveTo(3); D.adv(1.2); G.world.drop(); }, 16, 4, 0.5, 0.05);
    await ctx.close();
  }

  // ---------- 4. gusts: warn + each direction, bent guide, egg mid-flight; every viewport ----------
  if (want('wind')) for (const view of Object.keys(VIEWS)) {
    const { ctx, p } = await open(b, base, view, '&autostart=1&diff=normal&level=2');
    await ev(p, () => { MEG.debug.freeze(); MEG.debug.adv(3); MEG.debug.quiet(); MEG.debug.calm(); MEG.debug.clear(); MEG.debug.pile([[5, 2, 1.3], [3, 5, 1], [4, 7.6, 1.1], [2, 3.6, 3]], 2); MEG.debug.quiet(); });
    for (const dir of [-1, 1]) {
      await ev(p, dir => { const G = MEG.Game, w = G.world, W = w.wind; G.world.moveTo(dir > 0 ? 2.5 : 6.5); MEG.debug.adv(1); W.phase = 'warn'; W.t = 0; W.dur = 1.5; W.nextDir = dir; W.dir = 0; W.force = 0; MEG.debug.adv(0.3); }, dir);
      await raf(p); await shot(p, `wind_${view}_warn_${dir > 0 ? 'right' : 'left'}`);
      await ev(p, dir => { MEG.debug.setWind(dir, null); MEG.debug.adv(0.7); }, dir); await raf(p);
      await shot(p, `wind_${view}_gust_${dir > 0 ? 'right' : 'left'}`);
      if (view === 'desk') {
        const f = [], l = [];
        await ev(p, () => MEG.Game.world.drop());
        for (let i = 0; i < 10; i++) { await ev(p, () => MEG.debug.adv(0.08)); await raf(p); f.push(await buf(p)); l.push((i + 1) * 80 + 'ms'); }
        await sheet(`sheet_gust_${dir > 0 ? 'right' : 'left'}`, f, 5, 0.4, l);
        await ev(p, () => MEG.debug.adv(1));
      }
      await ev(p, () => MEG.debug.calm());
    }
    await ctx.close();
  }

  // ---------- 5. gameplay layout on every viewport, every season (half nest) ----------
  if (want('views')) for (const view of ['ipad', 'phoneP', 'phoneL']) {
    const { ctx, p } = await open(b, base, view, '&autostart=1&diff=normal');
    await ev(p, () => { MEG.debug.freeze(); MEG.debug.adv(3); MEG.debug.calm(); MEG.debug.clear(); });
    await ev(p, HALF => MEG.debug.pile(HALF, 3), HALF);
    for (let s = 0; s < 4; s++) {
      await ev(p, s => { const G = MEG.Game; G.world.gotoLevel(s); G.renderer.setLevel(s, true); G.weather.setLevel(s, { instant: true }); MEG.debug.adv(0.1); MEG.debug.quiet(); MEG.debug.calm(); G.world.moveTo(4.5); MEG.debug.adv(1.2); MEG.debug.quiet(); }, s);
      await raf(p); await shot(p, `view_${view}_${SEASONS[s]}`);
    }
    metrics['geo_' + view] = await ev(p, () => MEG.debug.geo());
    await ctx.close();
  }

  // ---------- 6. custom pictures (photo + drawing) for hero and egg ----------
  if (want('custom')) {
    const [photo, drawing] = await makeInputs();
    for (const view of ['desk', 'phoneP']) for (const [nm, src] of [['photo', photo], ['drawing', drawing]]) {
      const { ctx, p } = await open(b, base, view, '');
      await ev(p, async src => { const bl = await (await fetch(src)).blob(); for (const slot of ['hero', 'egg']) { await MEG.Assets.setCustom(slot, new File([bl], 'x.png', { type: 'image/png' })); } MEG.Game.picturesChanged(); }, src);
      await ev(p, () => document.getElementById('btnCustomize').click()); await p.waitForTimeout(300);
      await shot(p, `custom_${view}_${nm}_screen`);
      await ev(p, () => { MEG.UI.back ? MEG.UI.back() : 0; MEG.debug.startGame(); }); await p.waitForTimeout(200);
      await ev(p, HALF => { MEG.debug.freeze(); MEG.debug.adv(3); MEG.debug.quiet(); MEG.debug.calm(); MEG.debug.clear(); MEG.debug.pile(HALF, 3); MEG.Game.world.moveTo(4.5); MEG.debug.adv(1); MEG.debug.quiet(); }, HALF);
      await raf(p); await shot(p, `custom_${view}_${nm}_play`);
      if (view === 'desk') { const g = await ev(p, () => MEG.debug.geo()); await shot(p, `custom_${view}_${nm}_zoom`, await ev(p, g => MEG.debug.box(g.ox - 0.5 * g.unit, g.groundPx - 14.4 * g.unit, 10 * g.unit, 14.8 * g.unit), g)); }
      // the round sticker option
      await ev(p, () => { MEG.Assets.setShape('hero', 'circle'); MEG.Assets.setShape('egg', 'circle'); MEG.Game.picturesChanged(); MEG.debug.adv(0.1); }); await raf(p);
      await shot(p, `custom_${view}_${nm}_round`);
      await ctx.close();
    }
  }

  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify({ metrics, errors: errs }, null, 1));
  console.log('done →', OUT, '\nerrors:', errs.length ? errs.join('\n') : 'none');
  await b.close(); srv.close();
})().catch(e => { console.error(e); process.exit(1); });
