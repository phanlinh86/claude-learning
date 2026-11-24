/* CFF.Renderer — Nubi's Farm Fling on a 2D canvas (DESIGN §2–§5). A fixed camera: the world field (16 × 9 u, y up,
 * grass top at y 0) is mapped to the screen (landscape unit = min(VH/9, VW/16.4), portrait unit = VW/16.4). Per season
 * the sky and the "land" (far hills, near farm, ground, hay bale) are pre-rendered once into device-pixel canvases and
 * blitted pixel-exact; season changes crossfade. Nubi is drawn × world.nubi.size (lerped), with squash and stretch;
 * after a landing the crops pop up on the wagon. Everything that moves is lerped with world.alpha. */
(function (CFF) {
  'use strict';
  const PAL = {
    spring: { skyTop: '#6fa6d4', skyBottom: '#b5d6e4', ground: '#6e8f55', ink: '#2c4a36', bar: '#f4faee' },
    summer: { skyTop: '#5f9ad0', skyBottom: '#b2d2dc', ground: '#7d8f4c', ink: '#3a4622', bar: '#fbf8e8' },
    autumn: { skyTop: '#7f9fc7', skyBottom: '#d6c9bd', ground: '#7d6045', ink: '#4a3122', bar: '#fbf1e4' },
    winter: { skyTop: '#73879f', skyBottom: '#a8b4c2', ground: '#a9b6c6', ink: '#2c3a50', bar: '#eef3f8' }
  };
  const ZONE_INFO = [
    { key: 'spring', name: 'Spring Sprouts', hint: 'Drag back and let go to fling Nubi!' },
    { key: 'summer', name: 'Sunflower Summer', hint: 'The wagon rolls — fling where it will be!' },
    { key: 'autumn', name: 'Pumpkin Autumn', hint: 'Watch out for the sleepy crow!' },
    { key: 'winter', name: 'Snowy Winter', hint: 'Nubi snows on the winter cabbages!' }
  ];
  ZONE_INFO.forEach(z => { const p = PAL[z.key]; z.top = p.skyTop; z.bottom = p.skyBottom; z.pal = p; });
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const HERO = 1.3, FLY = 0.8;   // drawn sizes in u (× this.big in portrait; the hero also × nubi.size)
  const CROP_X = [-0.62, -0.31, 0, 0.31, 0.62];   // crop spots along the soil, as a share of the wagon half width

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.texts = []; this.flyers = []; this.rings = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fffaf0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.heartPulse = 0; this.leafPulse = 0; this.sizePulse = 0; this.land = 0; this.crops = [];
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._spr = new Map();
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 0;
      this.resize();
    }

    static computeView(vw, vh, insetsCss) {
      const ar = vw / Math.max(1, vh);
      let VW, VH;
      if (ar >= 16 / 9) { VH = 540; VW = Math.min(1280, Math.round(540 * ar)); }
      else if (ar >= 1) { VW = 960; VH = Math.min(960, Math.round(960 / ar)); }
      else { VW = ar >= 0.6 ? 720 : 560; VH = Math.min(1600, Math.round(VW / ar)); }
      const s = Math.min(vw / VW, vh / VH), cssW = VW * s, cssH = VH * s, left = (vw - cssW) / 2, top = (vh - cssH) / 2;
      const sa = insetsCss || { top: 0, right: 0, bottom: 0, left: 0 };
      const ins = { top: Math.max(0, sa.top - top) / s, right: Math.max(0, sa.right - left) / s, bottom: Math.max(0, sa.bottom - top) / s, left: Math.max(0, sa.left - left) / s };
      return { VW, VH, s, cssW, cssH, left, top, ins };
    }

    resize(insetsCss) {
      if (insetsCss) this._insCss = insetsCss;
      const v = Renderer.computeView(window.innerWidth, window.innerHeight, this._insCss);
      Object.assign(this, { VW: v.VW, VH: v.VH, ins: v.ins, cssScale: v.s });
      const c = this.canvas;
      c.style.width = v.cssW + 'px'; c.style.height = v.cssH + 'px'; c.style.left = v.left + 'px'; c.style.top = v.top + 'px';
      const dpr = window.devicePixelRatio || 1, touch = !!(CFF.Game && CFF.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._spr.clear();
      this.portrait = v.VH > v.VW;
      // world → screen (DESIGN §2): x = 0 at the left edge (landscape) so the beach rock is always flush left
      if (this.portrait) { this.unit = v.VW / 16.4; this.ox = 0.2 * this.unit; this.seaPx = Math.round(v.VH * 0.64); }
      else {   // landscape: fit 9 u of height, but never cut the 16-u field on 4:3 / 16:10 screens (iPad)
        this.unit = Math.min(v.VH / 9, v.VW / 16.4);
        const spare = v.VH - 9 * this.unit;
        this.ox = v.VW >= 16 * this.unit + 0.4 * this.unit && this.unit < v.VH / 9 ? (v.VW - 16 * this.unit) / 2 : 0;
        this.seaPx = Math.round(v.VH - 1.2 * this.unit - spare * 0.35);
      }
      this.big = this.portrait ? 1.35 : 1;   // portrait: Nubi, fireflies and dots a bit bigger than the field scale
      this.k = this.unit / 60;   // art scale: the art was drawn for 60 px per unit
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      this._syncWeather();
      CFF.Assets.setScale(this.px);
    }
    _syncWeather() { const wx = this.weather; if (wx) { if (wx.resize) wx.resize(this.VW, this.VH); if (wx.setHorizon) wx.setHorizon(this.seaPx); } }
    _measureHud() {}
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.texts.length = 0; this.flyers.length = 0; this.rings.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heartPulse = 0; this.leafPulse = 0; this.sizePulse = 0; this.land = 0; this.crops = [];
      this.hint = world && (world.level || 0) === 0 ? 'drag' : null; this._flutterHinted = false;
      this._syncWeather();
    }
    setLevel(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(z) { this.banner = { s: z, t: 0, loop: this.world ? this.world.loop || 0 : 0, level: this.world ? this.world.level || 0 : z }; }

    // ---------------- mapping ----------------
    sx(x) { return this.ox + x * this.unit; }
    sy(y) { return this.seaPx - y * this.unit; }

    // ---------------- sprites ----------------
    spr(key, w, h) {
      const W = Math.max(4, Math.round(w)), H = Math.max(4, Math.round(h)), ck = key + '|' + W + '|' + H;
      let c = this._spr.get(ck);
      if (c) return c;
      c = CFF.Assets.sprite(key, W, H);
      if (c) { if (this._spr.size > 400) this._spr.clear(); this._spr.set(ck, c); }
      return c;
    }
    drawSpr(g, key, cx, cy, w, h, ax, ay, rot, sx, sy, alpha) {
      const c = this.spr(key, w, h); if (!c) return false;
      g.save();
      if (alpha != null && alpha < 1) g.globalAlpha *= alpha;
      g.translate(cx, cy);
      if (rot) g.rotate(rot);
      if (sx != null) g.scale(sx, sy);
      g.drawImage(c, -ax * w, -ay * h, w, h);
      g.restore();
      return true;
    }

    // ---------------- pre-rendered island backgrounds (device px): sky and land ----------------
    _slot(b) { return CFF.Assets.SLOTS[2 + b].id; }
    _custom(b) { return CFF.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (CFF.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = CFF.Assets, n = A.SEASONS[b], pal = PAL[n], P = this.px, W = this.VW, H = this.VH, k = this.k, sea = this.seaPx;
      const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * P); c.height = Math.round(H * P); const g = c.getContext('2d'); g.scale(P, P); g.imageSmoothingQuality = 'high'; return [c, g]; };
      const [sky, gs] = mk(), [land, gl] = mk();
      // sky: gradient fallback, then the sky art cover-fit (or the player's picture)
      const gr = gs.createLinearGradient(0, 0, 0, sea); gr.addColorStop(0, pal.skyTop); gr.addColorStop(1, pal.skyBottom);
      gs.fillStyle = gr; gs.fillRect(0, 0, W, H);
      const custom = this._custom(b) ? A.custom[this._slot(b)] : null;
      const cover = (g, img, iw, ih, bottom) => { const s = Math.max(W / iw, bottom / ih); g.drawImage(img, (W - iw * s) / 2, bottom - ih * s, iw * s, ih * s); };
      if (custom) { cover(gs, custom, custom.width, custom.height, sea); gs.fillStyle = 'rgba(235,248,255,0.35)'; gs.fillRect(0, 0, W, sea); }   // a pale veil keeps a busy photo behind the play
      else if (A.img[n + '_sky']) cover(gs, A.img[n + '_sky'], 960, 540, sea + 20 * k);
      // land: transparent above the islands
      const tile = (img, iw, ih, bottom) => {
        if (!img) return;
        const w = iw * k, h = ih * k;
        for (let x = 0; x < W; x += w) gl.drawImage(img, Math.floor(x), bottom - h, Math.ceil(w) + 1, h);
      };
      if (!custom) { tile(A.img[n + '_far'], 960, 300, sea - 76 * k); tile(A.img[n + '_near'], 960, 200, sea - 6 * k); }
      // the field: ground tile from the grass line (art grass top at y 20), then the season's ground colour below
      gl.fillStyle = pal.ground; gl.fillRect(0, sea + 10 * k, W, H - sea);
      const gImg = A.img[n + '_ground'];
      if (gImg) { const w = 960 * k, h = 240 * k; for (let x = 0; x < W; x += w) gl.drawImage(gImg, Math.floor(x), sea - 20 * k, Math.ceil(w) + 1, h); }
      // hay bale under the sling: left edge flush at world x 0, top surface (art y 40) at world y 1.2
      const rk = A.img.bale;
      if (rk) {
        const rw = 4.8 * this.unit, rh = 2.2 * this.unit, rx = this.sx(0), ry = this.sy(1.2) - 40 / 220 * rh;
        gl.drawImage(rk, rx, ry, rw, rh);
        if (rx > 0) { gl.drawImage(rk, 0, 0, 40, 220, 0, ry, rx + 1, rh); }   // portrait: stretch the rock's left edge to the screen edge
      }
      bg = { sky, land, b };
      this._bg.set(key, bg);
      if (this._bg.size > 6) { const first = this._bg.keys().next().value; this._bg.delete(first); }
      return bg;
    }

    drawSky(g, b, alpha) {
      const bg = this.background(b);
      g.save(); g.globalAlpha = alpha; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bg.sky, 0, 0); g.restore();
    }
    drawLand(g, b, alpha) {
      const bg = this.background(b);
      g.save(); g.globalAlpha = alpha; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bg.land, 0, 0); g.restore();
    }

    // ---------------- world objects ----------------
    heroPos(a) {
      const f = this.world.nubi;
      return { x: lerp(f.px, f.x, a), y: lerp(f.py, f.y, a), rot: lerp(f.prot != null ? f.prot : f.rot, f.rot, a),
        size: lerp(f.psize != null ? f.psize : f.size, f.size, a) || 1 };
    }
    foxPos(a) { return this.heroPos(a); }
    wagonGeom(a) {
      const r = this.world.wagon; if (!r) return null;
      const x = lerp(r.px, r.x, a), w = (2 * r.hw + 0.3) * this.unit, h = w * 128 / 256;
      return { x, cx: this.sx(x), cy: this.sy(r.top), w, h, r };
    }
    drawWagon(g, a) {
      const W = this.wagonGeom(a); if (!W) return;
      const { cx, cy, w, h, r } = W;
      const roll = r.amp ? Math.sin(this.time * 3) * 0.6 * this.k : 0;
      this.drawSpr(g, 'wagon', cx, cy + roll * 0.2, w, h, 0.5, 40 / 128);
      // crops that sprang up after the last watering (they ride along with the wagon until the next shot)
      const key = 'crop_' + CFF.Assets.SEASONS[this.vis.cur], cw = 0.6 * this.unit, ch = 0.9 * this.unit;
      for (const c of this.crops) {
        const t = c.t, k = t < 0 ? 0 : t < 0.5 ? 1 - Math.exp(-t * 9) * Math.cos(t * 16) : 1;   // springy pop
        if (k <= 0.01) continue;
        const sway = Math.sin(this.time * 2.2 + c.i) * 0.05;
        this.drawSpr(g, key, cx + c.off * r.hw * this.unit, cy + 3 * this.k, cw, ch * k, 0.5, 1, sway, 1, 1);
      }
      // gently mark the thirsty patch while aiming on the first season so kids learn the bullseye
      if (this.world.phase === 'aim' && this.world.level === 0) {
        const p = 0.5 + 0.5 * Math.sin(this.time * 4);
        g.save(); g.globalAlpha = 0.3 + 0.4 * p; g.strokeStyle = '#ffffff'; g.lineWidth = 3 * this.k;
        g.beginPath(); g.ellipse(cx, cy + 4 * this.k, r.bull * this.unit + 6 * this.k, 8 * this.k, 0, 0, TAU); g.stroke(); g.restore();
      }
    }
    drawFlies(g, a) {
      const w = this.world, s = FLY * this.unit * this.big, custom = CFF.Assets.hasCustom('fly');
      for (const l of w.flies) {
        const x = this.sx(lerp(l.px, l.x, a)), y = this.sy(lerp(l.py, l.y, a));
        const rot = Math.sin(this.time * 2.3 + l.id) * 0.2, gold = l.kind === 'gold';
        // glow halo that breathes like a real firefly's light
        const pulse = 0.65 + 0.35 * Math.sin(this.time * 3.2 + l.id * 1.7);
        g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = (gold ? 0.6 : 0.42) * pulse;
        const R = s * (gold ? 1.05 : 0.85);
        const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, gold ? 'rgba(255,220,110,0.95)' : 'rgba(225,255,120,0.9)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); g.restore();
        if (custom) { const [cw, ch] = CFF.Assets.fit('fly', s, s); this.drawSpr(g, 'custom:fly', x, y, cw, ch, 0.5, 0.5, rot); if (gold) this.drawSpr(g, 'firefly_gold', x + s * 0.3, y - s * 0.3, s * 0.45, s * 0.45, 0.5, 0.5); }
        else this.drawSpr(g, gold ? 'firefly_gold' : 'firefly', x, y, s, s, 0.5, 0.5, rot);
      }
    }
    drawCrows(g, a) {
      for (const c of this.world.crows) {
        const x = this.sx(lerp(c.px, c.x, a)), y = this.sy(lerp(c.py, c.y, a));
        const fr = (Math.floor(this.time * 5 + c.id) % 2) ? 'crow_1' : 'crow_0';
        const flip = c.vx < 0 ? -1 : 1;
        this.drawSpr(g, fr, x, y, 1.2 * this.unit, 0.8 * this.unit, 0.5, 0.5, 0, flip, 1);
      }
    }
    drawSling(g, back) {
      const w = this.world, u = this.unit, sw = 1.6 * u, sh = 2.56 * u;
      const ax = this.sx(w.sling.x), ay = this.sy(w.sling.y);
      const L = [ax + (34 - 80) / 160 * sw, ay + (46 - 50) / 256 * sh], Rr = [ax + (126 - 80) / 160 * sw, ay + (46 - 50) / 256 * sh];
      // the band: back strand (behind Nubi) from the left prong, front strand from the right prong, to Nubi's seat
      let seat = [ax, ay + 0.15 * u];
      if (w.phase === 'aim') { const p = w.pull; if (p) seat = [this.sx(w.sling.x + p.x) - 0.2 * u, this.sy(w.sling.y + p.y) + 0.25 * u]; }
      else if (w.phase === 'fly' && w.nubi.flightT < 0.18) { const k = 1 - w.nubi.flightT / 0.18; seat = [ax + Math.sin(this.time * 40) * 0.15 * u * k, ay + 0.1 * u]; }
      g.save(); g.lineCap = 'round';
      if (back) {
        this.drawSpr(g, 'sling', ax, ay, sw, sh, 0.5, 50 / 256);
        g.strokeStyle = '#6b3a1f'; g.lineWidth = 5 * this.k;
        g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(seat[0], seat[1]); g.stroke();
      } else {
        g.strokeStyle = '#8a4a26'; g.lineWidth = 5 * this.k;
        g.beginPath(); g.moveTo(Rr[0], Rr[1]); g.lineTo(seat[0], seat[1]); g.stroke();
        g.fillStyle = '#6b4a2e'; g.beginPath(); g.ellipse(seat[0], seat[1], 9 * this.k, 5 * this.k, 0, 0, TAU); g.fill();   // the canvas pouch
      }
      g.restore();
    }
    drawPreview(g) {
      const w = this.world;
      const pts = this.previewPts = w.phase === 'aim' && w.pull ? w.preview(w.previewCount()) : [];
      if (!pts.length) return;
      g.save();
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[i], fade = 1 - i / (n + 2);
        const dk = Math.max(this.k, 0.8) * this.big, r = (5 - 1.8 * i / n) * dk;
        g.globalAlpha = 0.95 * fade;
        g.fillStyle = i % 2 ? '#ffffff' : '#8fd2ff'; g.strokeStyle = 'rgba(30,45,70,0.8)'; g.lineWidth = 2 * dk;
        g.beginPath(); g.arc(this.sx(p.x), this.sy(p.y), r, 0, TAU); g.fill(); g.stroke();
      }
      g.restore();
    }
    heroKey(st) {
      const w = this.world;
      if (w.phase === 'aim') return w.pull ? 'pull' : 'sit';
      if (w.phase === 'land') return 'rain';
      return ({ sit: 'sit', pull: 'pull', fly: 'fly', puff: 'puff', rain: 'rain', plop: 'plop', bonk: 'bonk', flop: 'plop' })[st] || 'fly';
    }
    drawHero(g, a) {
      const w = this.world, f = w.nubi, P = this.heroPos(a), s = HERO * this.unit * this.big * P.size;
      let x = this.sx(P.x), y = this.sy(P.y), rot = clamp(-P.rot, -0.6, 0.6), sx = 1, sy = 1;
      const key = this.heroKey(f.state);
      if (key === 'sit') { sy = 1 + 0.04 * Math.sin(this.time * 2.6); sx = 2 - sy; rot = 0; y += Math.sin(this.time * 1.3) * 2 * this.k; }
      if (key === 'pull') { rot = 0; const p = w.pull ? Math.hypot(w.pull.x, w.pull.y) / CFF.World.CONFIG.PULL_MAX : 0; sx = 1 - 0.08 * p; sy = 1 + 0.06 * p; }
      if (key === 'rain') { const t = w.phaseT || 0; const sq = Math.exp(-t * 6) * Math.cos(t * 18) * 0.2; sx = 1 + sq; sy = 1 - sq; rot = (this._flyRot || 0) * Math.exp(-t * 10); y += Math.sin(this.time * 5) * 1.5 * this.k; }
      if (key === 'plop') { rot = 0; y = this.sy(0) - (110 - 64) / 128 * s; }
      // squash / stretch along the flight: a soft cloud stretches more than a fox
      if (key === 'fly') { const v = Math.hypot(f.vx, f.vy); sx = 1 + Math.min(0.16, v * 0.009); sy = 2 - sx; }
      if (key === 'puff') { const t = f.puffT || 0; const k = Math.exp(-t * 5); sx = 1 + 0.14 * k; sy = 1 + 0.14 * k; }
      if (key === 'fly' || key === 'puff' || key === 'bonk') this._flyRot = rot;
      const custom = CFF.Assets.hasCustom('hero');
      if (custom) {
        const [cw, ch] = CFF.Assets.fit('hero', s * 0.95, s * 0.95);
        const wob = key === 'fly' || key === 'puff' ? Math.sin(this.time * (key === 'puff' ? 30 : 10)) * 0.07 : 0;
        if (key === 'plop') { sx = 1.25; sy = 0.6; y = this.sy(0) - 0.3 * ch; }
        this.drawSpr(g, 'custom:hero', x, y, cw, ch, 0.5, 0.5, rot + wob, sx, sy);
      } else {
        // raster Nubi once at max size and scale down: one cache entry per frame, however the size changes
        const S = HERO * this.unit * this.big * CFF.World.CONFIG.SIZE_MAX, k = P.size / CFF.World.CONFIG.SIZE_MAX;
        this.drawSpr(g, 'nubi_' + key, x, y, S, S, 0.5, 0.5, rot, sx * k, sy * k);
      }
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world, wx = this.weather, u = this.unit, title = CFF.Game && CFF.Game.mode === 'title';
      for (const e of evts) {
        const X = e.x != null ? this.sx(e.x) : 0, Y = e.y != null ? this.sy(e.y) : 0;
        switch (e.type) {
          case 'pull': if (this.hint === 'drag') this.hint = null; break;
          case 'launch': this.shake = Math.max(this.shake, 2 * (e.power || 0.5)); break;
          case 'fly':
            if (wx) wx.burst('fly', X, Y, 7);
            if (!title) { this.text('+' + e.value, X + 0.8 * u, Y - 0.9 * u, e.kind === 'gold' ? '#ffd36a' : '#eaff9a', e.kind === 'gold' ? 1.2 : 1); this.flyers.push({ x: X, y: Y, t: 0, gold: e.kind === 'gold' }); }
            break;
          case 'grow': { const P = this.heroPos(1); if (wx) wx.burst('grow', this.sx(P.x), this.sy(P.y), 6, { r: 0.7 * u * P.size }); this.sizePulse = 1; break; }
          case 'big': if (!title) this.text('Big Nubi!', this.VW / 2, this.VH * 0.2, '#d6ecff', 1.1); break;
          case 'puff': { const P = this.heroPos(1); if (wx) wx.burst('puff', this.sx(P.x) - 0.2 * u, this.sy(P.y) - 0.5 * u * P.size, 5); this._flutterHinted = true; if (this.hint === 'flutter') this.hint = null; break; }
          case 'bump': if (wx) wx.burst('bump', X, Y, 6); this.shake = Math.max(this.shake, 5); if (!title) this.text('Bonk!', X + 0.9 * u, Y - 1.1 * u, '#ffffff'); break;
          case 'land': {
            const top = this.sy(w.wagon ? w.wagon.top : 0.55), W = this.wagonGeom(1);
            const width = Math.max(0.9, 1.4 * (e.size || 1)) * u;
            if (wx) wx.burst('land', X, Y + 0.3 * u * (e.size || 1), 14, { width, fall: (Y < top ? top - Y : 0.5 * u), snow: w.zone === 3 });
            this.rings.push({ x: X, y: top, t: 0, col: e.bull ? '#bfe6ff' : '#ffffff' });
            // crops spring up one after another, the ones under the rain first
            const off = W ? (e.x - W.x) / W.r.hw : 0;
            this.crops = CROP_X.map((c, i) => ({ off: c, i, t: -0.12 - Math.abs(c - off) * 0.35 }));
            if (!title) {
              this.text(e.bull ? 'Bullseye! +' + e.points : 'Watered! +' + e.points, X, Y - 1.2 * u * (e.size || 1), e.bull ? '#bfe6ff' : '#ffffff', e.bull ? 1.3 : 1.05);
              if (e.big) this.text('Big Shower!', X, Y - 1.85 * u * (e.size || 1), '#d6ecff', 0.95);
              else if (e.streak >= 2) this.text('Streak ×' + e.streak, X, Y - 1.85 * u * (e.size || 1), '#ffb36b', 0.85);
            }
            if (e.bull) { this.flash = 0.3; this.flashCol = '#eef8ff'; }
            break;
          }
          case 'plop': if (wx) wx.burst('plop', X, this.seaPx, 12); this.shake = Math.max(this.shake, 3); if (!title) this.text('Pfff!', X, this.seaPx - 1.3 * u, '#ffffff'); break;
          case 'flop': if (wx) wx.burst('puff', X, this.sy(1.2), 5); if (!title) this.text('Oops! Pull further', X + 0.6 * u, Y - 1.1 * u, '#ffffff', 0.85); break;
          case 'heartLost': this.heartPulse = -1; break;
          case 'heartGain': this.heartPulse = 1; if (!title) this.text('+1 ♥', 110, 200, '#ff8fa0', 1.2); break;
          case 'newShot': if (!e.retry) this.crops = []; if (!this._flutterHinted && w.shots >= 2 && w.level === 0 && !title) this.hint = 'flutterSoon'; break;
          case 'levelUp': this.showBanner(e.zone); break;
        }
      }
      if (w && w.phase === 'fly' && this.hint === 'flutterSoon') this.hint = 'flutter';
    }
    text(s, x, y, col, size, life) {
      // keep pop-ups on screen and away from each other
      x = clamp(x, 120 * this.k + 40, this.VW - 120 * this.k - 40); y = clamp(y, 90, this.VH - 40);
      for (const t of this.texts) if (Math.abs(t.y - y) < 26 && Math.abs(t.x - x) < 160 && t.t < 0.6) y -= 30;
      this.texts.push({ s, x, y, col, size: size || 1, t: 0, life: life || 1.3 });
      if (this.texts.length > 10) this.texts.shift();
    }

    update(dt) {
      this.time += dt;
      const v = this.vis; if (v.t < 1) v.t = Math.min(1, v.t + dt / 1.2);
      this.shake = Math.max(0, this.shake - dt * 18); this.flash = Math.max(0, this.flash - dt * 1.6);
      this.heartPulse *= Math.pow(0.02, dt); this.leafPulse = Math.max(0, this.leafPulse - dt * 3); this.sizePulse = Math.max(0, this.sizePulse - dt * 2.5);
      for (const c of this.crops) c.t += dt;
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter(t => t.t < t.life);
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter(r => r.t < 0.7);
      const L = this._leafHud || [60, 60];
      for (const f of this.flyers) { f.t += dt * 1.8; }
      this.flyers = this.flyers.filter(f => { if (f.t >= 1) { this.leafPulse = 1; return false; } return true; });
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
    }

    draw(mode) {
      const g = this.ctx, w = this.world;
      g.setTransform(this.px, 0, 0, this.px, 0, 0);
      if (!w) { g.fillStyle = '#86c6e6'; g.fillRect(0, 0, this.VW, this.VH); return; }
      const a = w.alpha || 0, v = this.vis;
      g.save();
      if (this.shake > 0.05) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      // sky (crossfade between seasons)
      this.drawSky(g, v.cur, 1);
      if (v.t < 1) this.drawSky(g, v.prev, 1 - v.t);
      this.drawParticles(g, 'sky');
      this.drawLand(g, v.cur, 1);
      if (v.t < 1) this.drawLand(g, v.prev, 1 - v.t);
      this.drawParticles(g, 'back');
      this.drawWagon(g, a);
      this.drawFlies(g, a);
      this.drawCrows(g, a);
      this.drawSling(g, true);
      this.drawPreview(g);
      this.drawHero(g, a);
      if (w.phase === 'aim') this.drawSling(g, false);
      this.drawParticles(g, 'front');
      this.drawJuice(g);
      if (this.debug) this.drawDebug(g, a);
      g.restore();
      if (this.flash > 0) { g.save(); g.globalAlpha = this.flash; g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.restore(); }
      if (mode !== 'title') { this.drawHud(g); this.drawBanner(g); this.drawHints(g); }
    }

    drawParticles(g, layer) {
      const wx = this.weather; if (!wx) return;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const fx = p.flap != null && p.sprite === 'p_butterfly' ? Math.max(0.25, p.flap) : 1;
        this.drawSpr(g, p.sprite, p.x, p.y, p.size, p.size, 0.5, 0.5, p.rot, (p.flipX ? -1 : 1) * fx, 1, p.alpha);
      }
    }
    drawJuice(g) {
      for (const r of this.rings) {
        const k = r.t / 0.7;
        g.save(); g.globalAlpha = 1 - k; g.strokeStyle = r.col; g.lineWidth = 4 * this.k * (1 - k) + 1;
        g.beginPath(); g.ellipse(r.x, r.y, (0.4 + 2.2 * k) * this.unit, (0.12 + 0.5 * k) * this.unit, 0, 0, TAU); g.stroke(); g.restore();
      }
      const L = this._leafHud || [60, 60];
      for (const f of this.flyers) {   // gulped fireflies zip to the firefly counter on an arc
        const e = f.t * f.t * (3 - 2 * f.t), x = lerp(f.x, L[0], e), y = lerp(f.y, L[1], e) - Math.sin(f.t * Math.PI) * 60 * this.k, s = FLY * this.unit * (1 - 0.45 * e);
        this.drawSpr(g, f.gold ? 'firefly_gold' : 'firefly', x, y, s, s, 0.5, 0.5, Math.sin(f.t * 12) * 0.3);
      }
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const k = t.t / t.life, sc = t.t < 0.12 ? 0.6 + t.t / 0.12 * 0.4 : 1;
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = `900 ${Math.round(26 * t.size * sc * Math.max(0.85, this.k))}px ${FONT}`;
        const y = t.y - k * 34;
        g.lineWidth = 6; g.strokeStyle = 'rgba(30,40,70,0.75)'; g.strokeText(t.s, t.x, y);
        g.fillStyle = t.col; g.fillText(t.s, t.x, y);
      }
      g.restore();
    }
    _pill(g, x, y, w, h) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, h / 2); else g.rect(x, y, w, h); }
    drawHud(g) {
      const w = this.world, I = this.ins, x0 = 14 + I.left, y0 = 12 + I.top;
      g.save(); g.textBaseline = 'middle';
      // score
      g.fillStyle = 'rgba(20,35,60,0.45)'; this._pill(g, x0, y0, 150, 46); g.fill();
      g.fillStyle = '#fff'; g.font = `900 30px ${FONT}`; g.textAlign = 'left';
      g.fillText(String(w.score), x0 + 16, y0 + 25);
      // hearts
      const hp = this.heartPulse, hs = 28;
      for (let i = 0; i < w.maxHearts; i++) {
        const full = i < w.hearts, pulse = (i === w.hearts - 1 && hp > 0.05) || (i === w.hearts && hp < -0.05) ? 1 + 0.35 * Math.abs(hp) : 1;
        this.drawSpr(g, full ? 'heart' : 'heart_empty', x0 + 14 + i * (hs + 4) + hs / 2, y0 + 64 + hs / 2, hs * pulse, hs * pulse, 0.5, 0.5);
      }
      // firefly counter: fireflies toward the next heart
      const lx = x0 + 14, ly = y0 + 112, every = (w.D && w.D.heartEvery) || CFF.World.CONFIG.HEART_EVERY, toNext = w.flyCount % every;
      this._leafHud = [lx + 16, ly + 16];
      g.fillStyle = 'rgba(20,35,60,0.4)'; this._pill(g, x0, ly - 2, 150, 36); g.fill();
      this.drawSpr(g, 'firefly', lx + 16, ly + 16, 30 * (1 + 0.3 * this.leafPulse), 30 * (1 + 0.3 * this.leafPulse), 0.5, 0.5);
      g.fillStyle = '#f3ffd0'; g.font = `800 20px ${FONT}`; g.fillText(String(w.flyCount), lx + 38, ly + 17);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(lx + 84, ly + 12, 48, 9);
      g.fillStyle = '#ff8fa0'; g.fillRect(lx + 84, ly + 12, 48 * toNext / every, 9);
      // size meter: how puffy Nubi is (1× … SIZE_MAX), with the BIG mark
      { const C = CFF.World.CONFIG, my = ly + 44, P = this.heroPos(w.alpha || 0), k = clamp((P.size - 1) / (C.SIZE_MAX - 1), 0, 1), bk = (C.BIG_AT - 1) / (C.SIZE_MAX - 1);
        g.fillStyle = 'rgba(20,35,60,0.4)'; this._pill(g, x0, my - 2, 150, 36); g.fill();
        const ps = 30 * (0.8 + 0.35 * k) * (1 + 0.25 * this.sizePulse);
        this.drawSpr(g, 'nubi_sit', lx + 16, my + 16, ps, ps, 0.5, 0.5);
        const bx = lx + 40, bw = 92;
        g.fillStyle = 'rgba(255,255,255,0.25)'; this._pill(g, bx, my + 10, bw, 12); g.fill();
        g.fillStyle = P.size >= C.BIG_AT ? '#bfe6ff' : '#ffffff'; if (k > 0.02) { this._pill(g, bx, my + 10, Math.max(12, bw * k), 12); g.fill(); }
        g.fillStyle = '#3a5a8a'; g.fillRect(bx + bw * bk - 1, my + 6, 2, 20); }
      // season name + waterings to the next season (top centre)
      const cx = this.VW / 2, pal = PAL[CFF.Assets.SEASONS[w.zone]];
      const name = ZONE_INFO[w.zone].name + (w.loop ? ' ★' + (w.loop + 1) : '');
      g.font = `800 18px ${FONT}`; const tw = g.measureText(name).width;
      const pw = tw + 110, px = cx - pw / 2, py = y0 + (this.portrait ? 160 : 0);
      g.fillStyle = 'rgba(20,35,60,0.4)'; this._pill(g, px, py, pw, 40); g.fill();
      this.drawSpr(g, 'crop_' + CFF.Assets.SEASONS[w.zone], px + 22, py + 33, 16, 24, 0.5, 1);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(name, px + 40, py + 21);
      const per = CFF.World.CONFIG.LANDINGS_PER_LEVEL;
      for (let i = 0; i < per; i++) {   // pips: waterings this season
        g.fillStyle = i < w.levelLandings ? '#8fd2ff' : 'rgba(255,255,255,0.3)';
        g.beginPath(); g.arc(px + 48 + tw + i * 11, py + 21, 4, 0, TAU); g.fill();
      }
      g.restore();
    }
    drawBanner(g) {
      const b = this.banner; if (!b) return;
      const t = b.t, a = t < 0.3 ? t / 0.3 : t > 2.1 ? Math.max(0, (2.6 - t) / 0.5) : 1;
      const y = this.VH * 0.24 - (1 - Math.min(1, t / 0.3)) * 20;
      g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.font = `800 20px ${FONT}`; g.lineWidth = 5; g.strokeStyle = 'rgba(20,35,60,0.7)';
      const sub = 'Season ' + (b.level + 1) + (b.loop ? ' · round ' + (b.loop + 1) : '');
      g.strokeText(sub, this.VW / 2, y - 30); g.fillStyle = '#fff'; g.fillText(sub, this.VW / 2, y - 30);
      g.font = `900 46px ${FONT}`; g.lineWidth = 8;
      g.strokeText(ZONE_INFO[b.s].name, this.VW / 2, y + 10); g.fillStyle = '#d6ecff'; g.fillText(ZONE_INFO[b.s].name, this.VW / 2, y + 10);
      g.font = `700 19px ${FONT}`; g.lineWidth = 5;
      g.strokeText(ZONE_INFO[b.s].hint, this.VW / 2, y + 50); g.fillStyle = '#fff'; g.fillText(ZONE_INFO[b.s].hint, this.VW / 2, y + 50);
      g.restore();
    }
    drawHints(g) {
      const w = this.world; if (!this.hint) return;
      const touch = CFF.Game && CFF.Game.isTouch;
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (this.hint === 'drag' && w.phase === 'aim' && !w.pull) {
        // a ghost hand drags back from Nubi and lets go, on a loop
        const t = (this.time % 2.2) / 2.2, k = t < 0.15 ? 0 : t < 0.7 ? (t - 0.15) / 0.55 : 1;
        const fx = this.sx(w.sling.x), fy = this.sy(w.sling.y);
        const hx = fx - k * 1.4 * this.unit, hy = fy + k * 1.0 * this.unit;
        g.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 0.9;
        g.fillStyle = '#fff'; g.strokeStyle = 'rgba(20,35,60,0.6)'; g.lineWidth = 3;
        g.beginPath(); g.arc(hx, hy, 14 * this.k, 0, TAU); g.fill(); g.stroke();
        g.globalAlpha = 1;
        const msg = touch ? 'Drag back and let go!' : 'Drag back with the mouse (or ← → ↑ ↓ + Space)';
        g.font = `900 24px ${FONT}`; g.lineWidth = 6; g.strokeStyle = 'rgba(20,35,60,0.7)';
        const y = this.portrait ? this.sy(w.sling.y) - 2.0 * this.unit : this.VH * 0.42;
        const x = this.portrait ? this.VW / 2 : this.sx(w.sling.x) + 3.2 * this.unit;
        g.strokeText(msg, x, y); g.fillStyle = '#fff'; g.fillText(msg, x, y);
      } else if (this.hint === 'flutter' && w.phase === 'fly' && !w.puffed) {
        const msg = touch ? 'Tap to puff up higher!' : 'Tap / Space to puff up higher!';
        g.font = `900 24px ${FONT}`; g.lineWidth = 6; g.strokeStyle = 'rgba(20,35,60,0.7)';
        const hy = this.VH * 0.88; g.strokeText(msg, this.VW / 2, hy); g.fillStyle = '#d6ecff'; g.fillText(msg, this.VW / 2, hy);
      }
      g.restore();
    }
    drawDebug(g, a) {
      const w = this.world, u = this.unit, C = CFF.World.CONFIG;
      g.save(); g.lineWidth = 2;
      const P = this.heroPos(a);
      g.strokeStyle = '#f0f'; g.beginPath(); g.arc(this.sx(P.x), this.sy(P.y), C.R_NUBI * P.size * u, 0, TAU); g.stroke();
      g.strokeStyle = '#0f0'; for (const l of w.flies) { g.beginPath(); g.arc(this.sx(l.x), this.sy(l.y), C.R_FLY * u, 0, TAU); g.stroke(); }
      g.strokeStyle = '#ff0'; for (const c of w.crows) { g.beginPath(); g.arc(this.sx(c.x), this.sy(c.y), c.r * u, 0, TAU); g.stroke(); }
      const r = w.wagon, pad = CFF.World.padAt(P.size); g.strokeStyle = '#0ff'; g.beginPath(); g.moveTo(this.sx(r.x - r.hw - pad), this.sy(r.top)); g.lineTo(this.sx(r.x + r.hw + pad), this.sy(r.top)); g.stroke();
      g.strokeStyle = '#f00'; g.beginPath(); g.moveTo(this.sx(r.x - r.bull), this.sy(r.top) - 4); g.lineTo(this.sx(r.x + r.bull), this.sy(r.top) - 4); g.stroke();
      g.fillStyle = '#fff'; g.font = '12px monospace'; g.textAlign = 'left';
      g.fillText(`phase ${w.phase} size ${P.size.toFixed(2)} px ${this.px.toFixed(2)}`, 10, this.VH - 10);
      g.restore();
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  CFF.Renderer = Renderer;
})(window.CFF = window.CFF || {});
