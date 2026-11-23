/* PH.Renderer — Puddle's Greenhouse Hop on a 2D canvas (DESIGN §2–§4). A vertical column of world units (12 u wide)
 * mapped to the screen; the camera (world.camY, lerped) only climbs. Per greenhouse floor the back wall (cover-fit) and
 * the floating far décor tile are pre-rendered once into device-pixel canvases and blitted pixel-exact; floor changes
 * crossfade. The entrance floor sits under world y = 0, iron pillars mark the column edges and a floor beam marks each
 * floor boundary. Leaves bend about their stem, baskets swing on chains, Puddle is drawn at her (lerped) size.
 * Everything that moves is lerped with world.alpha. Sprites are cached per size by PH.Assets. */
(function (PH) {
  'use strict';
  // fallback colours (also in assets/default/levels/palette.json; built in so file:// works without fetch)
  const PAL = {
    potting: { skyTop: '#a9bcc9', skyBottom: '#e7eef0', ink: '#2f4a6b', bar: '#d9774a' },
    fern:    { skyTop: '#9cc9b4', skyBottom: '#e3f2ea', ink: '#24564a', bar: '#4fb06a' },
    balcony: { skyTop: '#a7a9c9', skyBottom: '#e9e8f4', ink: '#4a3f7a', bar: '#c06ad8' },
    roof:    { skyTop: '#8d86c2', skyBottom: '#f3dbe4', ink: '#4a3a6b', bar: '#ff7fa8' }
  };
  const ZONE_INFO = [
    { key: 'potting', name: 'Potting Shed', hint: 'Hold left or right to steer Puddle!' },
    { key: 'fern', name: 'Fern Floor', hint: 'Leaves bend! Bigger Puddle bounces higher.' },
    { key: 'balcony', name: 'Orchid Balcony', hint: 'Baskets swing: time your hop!' },
    { key: 'roof', name: 'Rooftop Rain Garden', hint: 'Almost at the roof, Puddle!' }
  ];
  ZONE_INFO.forEach(z => { const p = PAL[z.key]; z.top = p.skyTop; z.bottom = p.skyBottom; z.pal = p; });
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  // sprite boxes [viewBox w, h, anchor x, top-surface / feet y]
  const BOX = {
    puddle: [128, 128, 64, 118], pot: [192, 96, 96, 14], shelf: [160, 48, 80, 8], leaf: [192, 64, 4, 16], basket: [160, 112, 80, 22],
    umbrella: [256, 112, 128, 26], mushroom: [64, 80, 32, 78], firefly: [64, 64, 32, 34], ground: [1280, 420, 640, 330]
  };
  const HERO_W = 1.35, FLY_W = 0.85, BOTTOM_PAD = 1.0;   // u; the screen bottom shows world y = camY − BOTTOM_PAD

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.texts = []; this.flyers = []; this.rings = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fffaf0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.hintOn = true; this.heartPulse = 0; this.jarPulse = 0; this.growPulse = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._spr = new Map(); this._lastCam = 0;
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
      const dpr = window.devicePixelRatio || 1, touch = !!(PH.Game && PH.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._spr.clear();
      this.portrait = v.VH > v.VW;
      // world → screen (DESIGN §2)
      const COLW = PH.World ? PH.World.CONFIG.COLW : 12;
      this.unit = this.portrait ? v.VW / (COLW + 0.8) : v.VH / 11.5;
      this.colX = v.VW / 2 - COLW / 2 * this.unit;
      this.colW = COLW * this.unit;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      this._syncWeather();
      PH.Assets.setScale(this.px);
    }
    _syncWeather() { const wx = this.weather; if (wx && wx.resize) wx.resize(this.VW, this.VH); }
    _measureHud() {}
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.texts.length = 0; this.flyers.length = 0; this.rings.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heartPulse = 0; this.jarPulse = 0;
      this.hintOn = !!world && (world.level || 0) === 0; this._hintT = 0; this.growPulse = 0;
      this._lastCam = world ? world.camY : 0;
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
    cam() { const w = this.world; if (!w) return 0; return lerp(w.prevCamY, w.camY, w.alpha || 0) - BOTTOM_PAD; }
    sx(x) { return this.colX + x * this.unit; }
    sy(y, cam) { return this.VH - (y - cam) * this.unit; }

    // ---------------- sprites ----------------
    spr(key, w, h) {
      const W = Math.max(4, Math.round(w)), H = Math.max(4, Math.round(h)), ck = key + '|' + W + '|' + H;
      let c = this._spr.get(ck);
      if (c) return c;
      c = PH.Assets.sprite(key, W, H);
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

    // ---------------- pre-rendered level backgrounds (device px) ----------------
    _slot(b) { return PH.Assets.SLOTS[2 + b].id; }
    _custom(b) { return PH.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (PH.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    _canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* {sky: full-screen canvas, far: tile canvas, fw, fh (device px)} */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = PH.Assets, n = A.SEASONS[b], P = ZONE_INFO[b].pal, px = this.px;
      const W = Math.round(this.VW * px), H = Math.round(this.VH * px);
      const sky = this._canvas(W, H), g = sky.getContext('2d');
      const gr = g.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, P.skyTop); gr.addColorStop(1, P.skyBottom);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const src = this._custom(b) ? A.custom[this._slot(b)] : A.img[n + '_sky'];
      if (src) {
        const iw = src.naturalWidth || src.width, ih = src.naturalHeight || src.height, k = Math.max(W / iw, H / ih);
        g.imageSmoothingQuality = 'high';
        g.drawImage(src, (W - iw * k) / 2, (H - ih * k) / 2, iw * k, ih * k);
      }
      // the far décor tile: 960×1080 at a scale that fits the screen width (pixel-exact blits later)
      const fk = Math.max(this.VW / 960, this.VH / 1080, 0.6);
      const fw = Math.round(960 * fk * px), fh = Math.round(1080 * fk * px);
      let far = null;
      const fi = A.img[n + '_far'];
      if (fi && !this._custom(b)) { far = this._canvas(fw, fh); const fg = far.getContext('2d'); fg.imageSmoothingQuality = 'high'; fg.drawImage(fi, 0, 0, fw, fh); }
      bg = { sky, far, fw, fh };
      for (const k of this._bg.keys()) if (k.split('|')[1] !== key.split('|')[1] || k.split('|')[2] !== key.split('|')[2]) this._bg.delete(k);
      this._bg.set(key, bg);
      return bg;
    }
    drawScene(g, b, alpha, cam) {
      const bg = this.background(b);
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = alpha;
      g.drawImage(bg.sky, 0, 0);
      if (bg.far) {
        const px = this.px, W = this.canvas.width, H = this.canvas.height;
        const off = Math.round((cam * this.unit * 0.25 + this.time * 4) * px);   // climbs slowly + a gentle drift
        const yb = ((off % bg.fh) + bg.fh) % bg.fh;                                 // tile bottoms at H + yb − k·fh
        const xs = ((Math.round((W - bg.fw) / 2 - this.time * 3 * px) % bg.fw) + bg.fw) % bg.fw - bg.fw;
        for (let yy = H + yb - bg.fh; yy + bg.fh > 0; yy -= bg.fh)
          for (let x = xs; x < W; x += bg.fw) g.drawImage(bg.far, x, yy);
      }
      g.globalAlpha = 1;
    }

    // ---------------- world layers ----------------
    drawGround(g, cam) {
      const y0 = this.sy(0, cam);
      if (y0 < -10) return;
      const k = this.unit / 42, w = 1280 * k, h = 420 * k;
      this.drawSpr(g, 'ground', this.VW / 2, y0, w, h, 0.5, 330 / 420);
      if (y0 + 90 * k < this.VH) { g.fillStyle = '#8f6c5f'; g.fillRect(0, y0 + 88 * k, this.VW, this.VH); }
    }
    /* decorative iron floor beams where this floor began and where the next one starts (never collide) */
    drawBeams(g, cam) {
      const w = this.world; if (!w) return;
      const u = this.unit, bh = Math.round(u * 0.9), bw = Math.round(bh * 960 / 48);
      const ys = [];
      if ((w.level || 0) > 0) ys.push(w.levelY0);
      if (w.goal) ys.push(w.levelY0 + w.goal);
      for (const wy of ys) {
        const y = Math.round(this.sy(wy, cam) - bh * 0.5);   // the beam is centred on the floor line, the hero passes in front
        if (y > this.VH + 10 || y + bh < -10) continue;
        for (let x = ((Math.round(this.VW / 2 - bw / 2) % bw) + bw) % bw - bw; x < this.VW; x += bw) this.drawSpr(g, 'beam', x, y, bw, bh, 0, 0, 0, null, null, 0.9);
      }
    }
    drawPoles(g, cam) {
      const u = this.unit, pw = Math.round(0.8 * u), ph = Math.round(pw * 256 / 48);
      // side areas outside the column: a soft veil so the column reads
      if (!this.portrait) {
        g.fillStyle = 'rgba(255,255,255,0.10)';
        g.fillRect(0, 0, this.colX, this.VH); g.fillRect(this.colX + this.colW, 0, this.VW - this.colX - this.colW, this.VH);
      }
      const base = Math.round(this.sy(0, cam));   // posts stand on the farmyard ground and stack upward
      let k = Math.max(0, Math.floor((base - this.VH) / ph));
      for (; base - k * ph > 0; k++) {
        const Y = base - (k + 1) * ph;
        this.drawSpr(g, 'pole', Math.round(this.colX), Y, pw, ph, 0.5, 0);
        this.drawSpr(g, 'pole', Math.round(this.colX + this.colW), Y, pw, ph, 0.5, 0, 0, -1, 1);
      }
    }
    drawPlatform(g, p, cam, a) {
      const u = this.unit, x = this.sx(lerp(p.prevX == null ? p.x : p.prevX, p.x, a)), y = this.sy(lerp(p.prevY == null ? p.y : p.prevY, p.y, a), cam);
      if (y < -80 || y > this.VH + 140) return;
      if (p.kind === 'ground') return;
      let W = p.w * u, alpha = 1;
      if (p.kind === 'rescue' && p.bounces > 0) alpha = Math.max(0, 1 - (p.t || 0) / 0.5);
      if (alpha <= 0.01) return;
      const key = p.kind === 'rescue' ? 'umbrella' : p.kind, B = BOX[key] || BOX.pot;
      const H = W * B[1] / B[0];
      const sq = this._platSq(p);
      if (p.kind === 'leaf') {   // a damped torsion spring about its stem: rotate the sprite by the (lerped) bend
        const side = p.side || -1, bend = lerp(p.prevBend == null ? p.bend : p.prevBend, p.bend, a) || 0;
        const stx = this.sx(p.x + side * p.w / 2), sty = this.sy(p.y0 != null ? p.y0 : p.y, cam);
        g.globalAlpha = 0.10; g.fillStyle = '#203040'; g.beginPath(); g.ellipse(this.sx(p.x), sty + H * 0.9, W * 0.38, Math.max(3, H * 0.12), 0, 0, TAU); g.fill(); g.globalAlpha = 1;
        // the stalk back to the pillar side: a short curved stem so the leaf looks attached
        g.strokeStyle = '#2f7a37'; g.lineWidth = Math.max(3, u * 0.09); g.lineCap = 'round';
        g.beginPath(); g.moveTo(stx, sty + 2); g.quadraticCurveTo(stx + side * u * 0.35, sty + u * 0.25, stx + side * u * 0.55, sty + u * 0.65); g.stroke();
        this.drawSpr(g, 'leaf', stx, sty, W, H, B[2] / B[0], B[3] / B[1], -side * bend, -side, 1, alpha);
        return;
      }
      if (p.kind === 'basket' && p.px != null) {   // chains from the pivot to the rim (behind the basket)
        const pxs = this.sx(p.px), pys = this.sy(p.py, cam), ang = Math.atan2(p.x - p.px, p.py - p.y);
        const ca = Math.cos(ang), sa = Math.sin(ang);
        g.strokeStyle = 'rgba(90,95,115,0.9)'; g.lineWidth = Math.max(1.5, u * 0.045);
        for (const ex of [-0.36, 0, 0.36]) {
          const ox = ex * W, oy = 2;   // rim eyelets in the basket frame, rotated with it
          g.beginPath(); g.moveTo(pxs, pys); g.lineTo(x + ox * ca + oy * sa, y - ox * sa + oy * ca); g.stroke();
        }
        g.fillStyle = '#5a5f73'; g.beginPath(); g.arc(pxs, pys, Math.max(3, u * 0.08), 0, TAU); g.fill();
        g.globalAlpha = 0.10; g.fillStyle = '#203040'; g.beginPath(); g.ellipse(x, y + H * 0.95, W * 0.32, Math.max(3, H * 0.1), 0, 0, TAU); g.fill(); g.globalAlpha = 1;
        this.drawSpr(g, 'basket', x, y, W * (1 + 0.05 * sq), H * (1 - 0.08 * sq), B[2] / B[0], B[3] / B[1], -ang, null, null, alpha);
        return;
      }
      // soft drop shadow for depth
      g.globalAlpha = 0.12 * alpha; g.fillStyle = '#203040'; g.beginPath(); g.ellipse(x, y + H * 0.85 + 3, W * 0.42, Math.max(3, H * 0.12), 0, 0, TAU); g.fill(); g.globalAlpha = 1;
      const Hd = p.kind === 'pot' ? H * 0.85 : H;   // pots a little squatter so the column stays airy
      this.drawSpr(g, key, x, y, W * (1 + 0.06 * sq), Hd * (1 - 0.12 * sq), B[2] / B[0], B[3] / B[1], 0, null, null, alpha);
      if (p.spring && p.kind === 'pot') {
        const sw = 0.6 * u, sh = sw * 80 / 64, up = p.springT < 0.25;
        this.drawSpr(g, up ? 'mushroom_up' : 'mushroom', x, y + 2, sw * (up ? 1.15 : 1), sh, 0.5, 78 / 80);
      }
      if ((p.lvl != null ? p.lvl % 4 : -1) === 2 && p.kind !== 'rescue') {   // balcony rain: a wet shine line
        g.globalAlpha = 0.35 * alpha; g.strokeStyle = '#ffffff'; g.lineWidth = 2; g.lineCap = 'round';
        g.beginPath(); g.moveTo(x - W * 0.3, y + 3); g.lineTo(x - W * 0.05, y + 3); g.stroke(); g.globalAlpha = 1;
      }
    }
    _platSq(p) {
      const m = this._sq || (this._sq = new Map());
      let s = m.get(p.id);
      if (!s) { s = { b: p.bounces, t: 9 }; m.set(p.id, s); if (m.size > 300) m.clear(); }
      if (p.bounces !== s.b) { s.b = p.bounces; s.t = 0; }
      return s.t < 0.25 ? Math.sin(s.t / 0.25 * Math.PI) * (1 - s.t / 0.25) * 1.6 : 0;
    }
    drawFirefly(g, f, cam, a, i) {
      if (f.state !== 'live') return;
      const x = this.sx(lerp(f.prevX, f.x, a)), y = this.sy(lerp(f.prevY, f.y, a), cam);
      if (y < -40 || y > this.VH + 40) return;
      const s = FLY_W * this.unit * (this.portrait ? 1.2 : 1), pulse = 0.85 + 0.15 * Math.sin(this.time * 5 + f.id);
      // a soft plum backing disc with a bright rim (reads over pots and pale glass), then the warm additive halo
      g.globalAlpha = 0.35; g.fillStyle = '#5a3d5c'; g.beginPath(); g.arc(x, y, s * 0.46, 0, TAU); g.fill();
      g.globalAlpha = 0.55 * pulse; g.strokeStyle = '#fff6b0'; g.lineWidth = 2; g.stroke();
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * pulse;
      this.drawSpr(g, 'p_glow', x, y, s * 1.5, s * 1.5, 0.5, 0.5);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const custom = PH.Assets.hasCustom('firefly');
      const fr = Math.floor(this.time * 10 + f.id) % 2;
      const flip = Math.sin(this.time * 0.8 + f.id) < 0;
      if (custom) this.drawSpr(g, 'custom:firefly', x, y, s, s, 0.5, 0.5, Math.sin(this.time * 3 + f.id) * 0.15);
      else this.drawSpr(g, 'firefly_' + fr, x, y, s * pulse, s * pulse, 0.5, 34 / 64, Math.sin(this.time * 3 + f.id) * 0.12, flip ? -1 : 1, 1);
    }
    hs() { return this.portrait ? 1.25 : 1; }   // hero draw scale (hit boxes unchanged)
    heroKey(h) {
      switch (h.mood) {
        case 'crouch': return 'puddle_crouch';
        case 'up': return 'puddle_up';
        case 'fall': return 'puddle_fall';
        case 'ouch': return 'puddle_ouch';
        case 'happy': return 'puddle_happy';
        default: return 'puddle_idle';
      }
    }
    drawHero(g, cam, a) {
      const w = this.world, h = w.hero, u = this.unit;
      const x = this.sx(lerp(h.prevX, h.x, a)), y = this.sy(lerp(h.prevY, h.y, a), cam);
      const size = lerp(h.prevSize || h.size || 1, h.size || 1, a), S = HERO_W * u * this.hs() * size;
      if (h.invuln > 0 && w.phase === 'play' && Math.floor(this.time * 12) % 2 === 0 && h.rescueT <= 0) g.globalAlpha = 0.55;
      const sq = h.squash || 0, st = h.stretch || 0;
      const kx = (1 + 0.24 * sq - 0.07 * st), ky = (1 - 0.24 * sq + 0.13 * st);
      const face = h.face < 0 ? -1 : 1;
      // tiny shadow on the platform below when close
      if (PH.Assets.hasCustom('hero')) {
        const r = S * 0.42, cy = y - r * ky - 2;
        g.save(); g.translate(x, y); g.rotate(h.tilt || 0); g.scale(kx, ky);
        // procedural little legs
        // procedural orange feet and flapping slate flippers
        g.fillStyle = '#ff9f1c'; g.strokeStyle = '#b8650a'; g.lineWidth = 2;
        for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * r * 0.32, -r * 0.08, r * 0.24, r * 0.1, 0, 0, TAU); g.fill(); g.stroke(); }
        const flap = h.vy > 0 ? Math.sin(this.time * 18) * 0.5 : 0.2;
        g.fillStyle = '#33476e'; g.strokeStyle = '#1a2440';
        for (const s of [-1, 1]) { g.save(); g.translate(s * r * 0.9, -r * 1.05); g.rotate(s * (0.6 + flap)); g.beginPath(); g.ellipse(0, r * 0.25, r * 0.16, r * 0.38, 0, 0, TAU); g.fill(); g.stroke(); g.restore(); }
        g.restore();
        this.drawSpr(g, 'custom:hero', x, cy, r * 2 * kx, r * 2 * ky, 0.5, 0.5, (h.tilt || 0) + Math.sin(this.time * 6) * 0.04);
      } else {
        this.drawSpr(g, this.heroKey(h), x, y, S * kx, S * ky, 0.5, 118 / 128, h.tilt || 0, face, 1);
      }
      g.globalAlpha = 1;
      if (h.rescueT > 0) {   // a rescue bubble
        const k = clamp(h.rescueT / 1.2, 0, 1), r = S * 0.62;
        g.globalAlpha = 0.9 * k; g.strokeStyle = '#ffffff'; g.lineWidth = 4; g.fillStyle = 'rgba(170,220,255,0.4)';
        g.beginPath(); g.arc(x, y - S * 0.42, r, 0, TAU); g.fill(); g.stroke();
        g.globalAlpha = 0.8 * k; g.beginPath(); g.arc(x - r * 0.4, y - S * 0.42 - r * 0.45, r * 0.12, 0, TAU); g.fillStyle = '#fff'; g.fill();
        g.globalAlpha = 1;
      }
      if (h.big && w.phase === 'play') {   // a soft warm glow on her tummy while she's big (×2 metres)
        g.globalCompositeOperation = 'lighter'; this.drawSpr(g, 'p_glow', x, y - S * 0.35, S * 0.7, S * 0.7, 0.5, 0.5, 0, null, null, 0.12 + 0.06 * Math.sin(this.time * 4));
        g.globalCompositeOperation = 'source-over';
      }
      this._heroScr = { x, y: y - S * 0.42, r: S * 0.5 };
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world; if (!w) return;
      const cam = this.cam(), wx = this.weather, u = this.unit;
      for (const e of evts) {
        switch (e.type) {
          case 'bounce': {
            const x = this.sx(w.hero.x), y = this.sy(e.p ? e.p.y : w.hero.y, cam);
            if (wx) {
              const sz = w.hero.size || 1;
              if (e.kind === 'pot') wx.burst('soil', x, y, e.spring ? 6 : 3, { speed: 110, life: 0.55, size: 0.22 * u, spread: Math.PI * 0.9, angle: -Math.PI / 2, gravity: 260, spin: 6, layer: 'front' });
              else if (e.kind === 'leaf') { wx.burst('drip', x, y, Math.round(3 + 3 * (sz - 1) * 2), { speed: 120 + 60 * (sz - 1), life: 0.6, size: 0.2 * u, spread: Math.PI * 0.8, angle: -Math.PI / 2, gravity: 420, layer: 'front' }); if ((e.flick || 1) > 1.04) this.texts.push({ x: x + (w.hero.x < 6 ? 1 : -1) * u * 1.2, y: y + u * 0.6, s: 'Flick!', t: 0, col: '#bff5a8', down: true }); }
              else if (e.kind === 'basket') wx.burst('petal', x, y, 3, { speed: 90, life: 0.8, size: 0.24 * u, spread: Math.PI, angle: -Math.PI / 2, gravity: 120, spin: 4, drag: 1.5, layer: 'front' });
              else if (e.kind === 'shelf') wx.burst('puff', x, y, 3, { speed: 70, life: 0.4, size: 0.24 * u, spread: Math.PI * 0.8, angle: -Math.PI / 2, drag: 3, layer: 'front' });
              if (e.spring) { wx.burst('sparkle', x, y - 0.4 * u, 8, { speed: 200, life: 0.6, size: 0.26 * u, spread: TAU, layer: 'front', drag: 2 }); this.texts.push({ x, y: y + u * 0.7, s: 'BOING!', t: 0, col: '#ff5a5f', down: true }); }
            }
            if (e.kind === 'rescue') { this.texts.push({ x, y: y + u * 0.8, s: 'Umbrella boing!', t: 0, col: '#ffffff', down: true }); }
            break;
          }
          case 'grow': this.growPulse = 1; if (wx && this._heroScr) wx.burst('sparkle', this._heroScr.x, this._heroScr.y, 3, { speed: 90, life: 0.4, size: 0.18 * u, spread: TAU, layer: 'front', drag: 2 }); break;
          case 'big': this.growPulse = 1; this.texts.push({ x: this.VW / 2, y: 0, s: 'Big Puddle! Metres ×2', t: 0, col: '#ffd2dc', big: true, ay: 0.3 }); break;
          case 'firefly': {
            const x = this.sx(e.x), y = this.sy(e.y, cam);
            if (wx) wx.burst('sparkle', x, y, 5, { speed: 130, life: 0.45, size: 0.22 * u, spread: TAU, layer: 'front' });
            this.rings.push({ x, y, t: 0 });
            // one "+N" beside Puddle (the side away from the nearer wall), merged instead of stacking on her face
            const side = w.hero.x < (PH.World.CONFIG.COLW / 2) ? 1 : -1, hx = this.sx(w.hero.x) + side * (0.75 * this.hs() * u + 18);
            const last = this.texts.find(t => t.plus && t.t < 0.45);
            if (last) { last.n += 10; last.s = '+' + last.n; last.t = 0.05; last.x = hx; last.y = this.sy(w.hero.y, cam) - 0.6 * u; }
            else this.texts.push({ x: hx, y: this.sy(w.hero.y, cam) - 0.6 * u, s: '+10', n: 10, plus: true, t: 0, col: '#fff27a' });
            this.flyers.push({ x, y, t: 0 });
            break;
          }
          case 'lantern': this.texts.push({ x: this.VW / 2, y: this.VH * 0.4, s: 'Lantern full! +1 heart', t: 0, col: '#fff27a', big: true, ay: 0.26 }); this.flash = 0.3; this.flashCol = '#fff6c0'; break;
          case 'heartGain': case 'fall': this.heartPulse = 1; if (e.type === 'fall') { this.shake = Math.max(this.shake, 0.3); this.flash = 0.2; this.flashCol = '#d6ecff'; } break;
          case 'rescue': { const x = this.sx(e.x), y = this.sy(e.y, cam); if (wx) wx.burst('sparkle', x, this.VH - 30, 10, { speed: 220, life: 0.7, size: 0.26 * u, spread: Math.PI, angle: -Math.PI / 2, layer: 'front' }); break; }
          case 'levelUp': {
            this.showBanner(e.zone); this.flash = 0.45; this.flashCol = '#fffaf0';
            const tot = (e.bonus || 0) + (e.sizeBonus || 0);
            if (tot) this.texts.push({ x: this.VW / 2, y: this.VH * 0.8, s: 'Floor bonus +' + (e.bonus || 0) + (e.sizeBonus ? '  ·  size +' + e.sizeBonus : ''), t: 0, col: '#fff3c4', big: true });
            if (wx && this._heroScr) wx.burst('drip', this._heroScr.x, this._heroScr.y, 14, { speed: 260, life: 0.7, size: 0.2 * u, spread: TAU, gravity: 400, layer: 'front' });   // the shake-off splash
            break;
          }
          case 'gameOver': this.shake = 0.25; break;
        }
      }
    }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.4);
      this.shake = Math.max(0, this.shake - dt); this.flash = Math.max(0, this.flash - dt);
      this.heartPulse = Math.max(0, this.heartPulse - dt * 2); this.jarPulse = Math.max(0, this.jarPulse - dt * 3); this.growPulse = Math.max(0, this.growPulse - dt * 2.5);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 3.0) this.banner = null; }
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter(t => t.t < (t.big ? 1.8 : 0.8));
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter(r => r.t < 0.35);
      for (const f of this.flyers) { f.t += dt; if (f.t >= 0.6 && !f.done) { f.done = true; this.jarPulse = 1; } }
      this.flyers = this.flyers.filter(f => f.t < 0.6);
      if (this._sq) for (const s of this._sq.values()) s.t += dt;
      if (this.hintOn) { this._hintT += dt; if (this._hintT > 10 || (this.world && this.world.maxY > 30)) this.hintOn = false; }
      const w = this.world;
      if (w && this.weather) {
        const cam = w.camY, vy = dt > 0 ? (cam - this._lastCam) * this.unit / dt : 0;
        this._lastCam = cam;
        this._climbVy = clamp(vy, -2000, 2000);
      }
    }

    // ---------------- frame ----------------
    draw(mode) {
      const g = this.ctx, px = this.px, VW = this.VW, VH = this.VH, w = this.world, v = this.vis;
      const cam = w ? this.cam() : -BOTTOM_PAD;
      if (v.t < 1) { this.drawScene(g, v.prev, 1, cam); this.drawScene(g, v.cur, v.t, cam); } else this.drawScene(g, v.cur, 1, cam);
      const sh = this.shake > 0 ? this.shake * 10 : 0;
      g.setTransform(px, 0, 0, px, sh ? (Math.random() - 0.5) * sh * px : 0, sh ? (Math.random() - 0.5) * sh * px : 0);
      const wx = this.weather;
      if (wx) this.drawParticles(g, 'back');
      if (w) {
        const a = w.alpha || 0;
        this.drawGround(g, cam);
        this.drawBeams(g, cam);
        this.drawPoles(g, cam);
        for (const p of w.platforms) this.drawPlatform(g, p, cam, a);
        const fl = w.fireflies; for (let i = 0; i < fl.length; i++) this.drawFirefly(g, fl[i], cam, a, i);
        this.drawHero(g, cam, a);
      }
      if (wx) {
        this.drawParticles(g, 'front');
        if (wx.ambient && wx.ambient.tint) { g.fillStyle = wx.ambient.tint; g.fillRect(0, 0, VW, VH); }
      }
      if (w && mode !== 'title') this.drawJuice(g);
      if (this.flash > 0) { g.globalAlpha = Math.min(0.55, this.flash); g.fillStyle = this.flashCol; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
      g.setTransform(px, 0, 0, px, 0, 0);
      if (w && (mode === 'playing' || mode === 'paused' || mode === 'over')) this.drawHud(g, mode);
      if (w && mode === 'playing') { this.drawBanner(g); this.drawHints(g); }
      if (this.debug && w) this.drawDebug(g, cam);
    }
    drawParticles(g, layer) {
      const ps = this.weather.particles;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]; if (p.layer !== layer || p.alpha <= 0.01 || p.size < 1) continue;
        const ar = p.ar || 1, fx = (p.flipX ? -1 : 1) * (p.flap != null ? Math.max(0.2, p.flap) : 1);
        this.drawSpr(g, 'p_' + p.sprite, p.x, p.y, p.size, p.size * ar, 0.5, 0.5, p.rot || 0, fx, 1, p.alpha);
      }
    }
    drawJuice(g) {
      for (const r of this.rings) {
        const k = r.t / 0.35; g.globalAlpha = 1 - k; g.strokeStyle = '#fff6a0'; g.lineWidth = 3;
        g.beginPath(); g.arc(r.x, r.y, (0.3 + 0.7 * k) * this.unit, 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const t of this.texts) {
        const life = t.big ? 1.8 : 0.8, k = t.t / life, a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const by = t.ay ? this.VH * t.ay + (this.ins.top || 0) : t.y;
        const y = by + (t.down ? 14 : -(t.big ? 18 : 30)) * Math.min(1, t.t / 0.5), fs = t.big ? 28 : 21, pop = 1 + 0.3 * Math.max(0, 1 - t.t / 0.15);
        const H = this._heroScr, over = H && Math.abs(t.x - H.x) < (t.big ? 200 : 60) && Math.abs(y - H.y) < 0.9 * this.unit * this.hs() + 14;
        g.globalAlpha = Math.max(0, a) * (over ? 0.35 : 1); g.font = '900 ' + Math.round(fs * pop) + 'px ' + FONT;
        g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(40,40,70,.75)'; g.strokeText(t.s, t.x, y);
        g.fillStyle = t.col; g.fillText(t.s, t.x, y);
      }
      g.globalAlpha = 1;
      const hp = this._hudJar || { x: this.VW - 160, y: 30 };
      for (const f of this.flyers) {
        const k = f.t / 0.6, e = k * k * (3 - 2 * k), x = lerp(f.x, hp.x, e), y = lerp(f.y, hp.y, e) - Math.sin(k * Math.PI) * 50, s = lerp(30, 16, e);
        g.globalCompositeOperation = 'lighter'; this.drawSpr(g, 'p_glow', x, y, s * 1.6, s * 1.6, 0.5, 0.5, 0, null, null, 0.6); g.globalCompositeOperation = 'source-over';
        this.drawSpr(g, PH.Assets.hasCustom('firefly') ? 'custom:firefly' : 'firefly_0', x, y, s, s, 0.5, 0.5);
      }
    }
    _rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
    _pill(g, x, y, w, h) {
      g.fillStyle = 'rgba(255,253,245,.82)'; g.strokeStyle = 'rgba(47,74,107,.30)'; g.lineWidth = 2;
      this._rr(g, x, y, w, h, h / 2); g.fill(); g.stroke();
    }
    drawHud(g) {
      const w = this.world, I = this.ins, P = ZONE_INFO[this.vis.cur].pal, ink = '#2f3b52';
      const x0 = I.left + 12, y0 = I.top + 10;
      // hearts
      const n = w.maxHearts || 3, hs = 26, gap = 4;
      this._pill(g, x0, y0, n * (hs + gap) + 14, 38);
      for (let i = 0; i < n; i++) {
        const full = i < w.hearts, pulse = (i === w.hearts || i === w.hearts - 1) ? this.heartPulse : 0, s = hs * (1 + 0.3 * pulse);
        this.drawSpr(g, full ? 'heart' : 'heart_empty', x0 + 7 + i * (hs + gap) + hs / 2, y0 + 19, s, s, 0.5, 0.5);
      }
      // lantern jar + fireflies + score
      const y1 = y0 + 46;
      this._pill(g, x0, y1, 168, 40);
      const jx = x0 + 22, jy = y1 + 20, js = 34 * (1 + 0.25 * this.jarPulse);
      this._hudJar = { x: jx, y: jy };
      const fill = clamp((w.lantern || 0) / (PH.World.CONFIG.lanternSize || 20), 0, 1);
      if (fill > 0) {   // the glow inside the jar (inner area x 16..48, y 20..56 of 64)
        const k = js / 64, ih = 36 * k * fill;
        g.fillStyle = 'rgba(255,214,70,0.85)'; this._rr(g, jx - 16 * k, jy + 24 * k - ih, 32 * k, ih, 5 * k); g.fill();
        g.globalCompositeOperation = 'lighter'; this.drawSpr(g, 'p_glow', jx, jy + 6 * k, js * (0.9 + fill * 0.6), js * (0.9 + fill * 0.6), 0.5, 0.5, 0, null, null, 0.25 + 0.4 * fill); g.globalCompositeOperation = 'source-over';
      }
      this.drawSpr(g, 'jar', jx, jy, js, js, 0.5, 0.5);
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '900 22px ' + FONT; g.fillStyle = ink;
      g.fillText(String(w.fireflyCount || 0), x0 + 42, y1 + 21);
      g.font = '800 14px ' + FONT; g.globalAlpha = 0.75; g.textAlign = 'right'; g.fillText(String(w.score) + ' pts', x0 + 158, y1 + 21); g.globalAlpha = 1;
      // height + level progress (top centre in landscape; under the buttons in portrait)
      const bw = Math.min(250, this.VW * (this.portrait ? 0.5 : 0.28));
      const bx = this.portrait ? this.VW - I.right - 12 - bw - 8 : this.VW / 2 - bw / 2, by = this.portrait ? y0 + 100 : y0 + 4;
      this._pill(g, bx - 8, by - 4, bw + 16, 40);
      g.font = '900 20px ' + FONT; g.fillStyle = ink; g.textAlign = 'left';
      g.fillText(Math.floor(w.maxY || 0) + ' m', bx + 4, by + 16);
      const tx = bx + 70, tw = bw - 76;
      g.font = '900 12px ' + FONT; g.fillText(ZONE_INFO[this.vis.cur].name, tx, by + 7);
      g.fillStyle = 'rgba(47,59,82,.15)'; this._rr(g, tx, by + 17, tw, 10, 5); g.fill();
      g.fillStyle = P.bar; this._rr(g, tx, by + 17, Math.max(10, tw * clamp(w.progress || 0, 0, 1)), 10, 5); g.fill();
      // the size meter (the twist): a little penguin badge and a bar from 1.0 to maxSize; "×2" once she's big
      const h = w.hero, C = PH.World.CONFIG, maxS = (C.difficulty[w.difficulty] || {}).maxSize || C.maxSize;
      const y2 = y1 + 48, mw = 168;
      this._pill(g, x0, y2, mw, 36);
      const gs = 30 * (1 + 0.25 * this.growPulse);
      this.drawSpr(g, 'grow', x0 + 20, y2 + 18, gs, gs, 0.5, 0.5);
      const mx = x0 + 40, mW = mw - (h.big ? 92 : 52), k = clamp(((h.size || 1) - 1) / Math.max(0.01, maxS - 1), 0, 1), kb = clamp((C.bigAt - 1) / Math.max(0.01, maxS - 1), 0, 1);
      g.fillStyle = 'rgba(47,59,82,.15)'; this._rr(g, mx, y2 + 13, mW, 10, 5); g.fill();
      g.fillStyle = h.big ? '#ff5d73' : '#6f86b8'; this._rr(g, mx, y2 + 13, Math.max(10, mW * k), 10, 5); g.fill();
      g.fillStyle = 'rgba(47,59,82,.55)'; g.fillRect(Math.round(mx + mW * kb) - 1, y2 + 10, 2, 16);   // the "big" mark
      if (h.big) { g.font = '900 18px ' + FONT; g.fillStyle = '#d93d58'; g.textAlign = 'right'; g.fillText('×2', x0 + mw - 10, y2 + 19); }
      this._hudGrow = { x: x0, y: y2, w: mw, h: 36 };
    }
    drawBanner(g) {
      if (!this.banner) return;
      const VW = this.VW, b = this.banner, t = b.t, a = t < 0.35 ? t / 0.35 : t > 2.4 ? Math.max(0, 1 - (t - 2.4) / 0.6) : 1;
      const topY = this.portrait ? this.ins.top + 190 : this.ins.top + 58;
      const y = topY - (1 - Math.min(1, t / 0.35)) * 20;
      const info = ZONE_INFO[b.s], bw = Math.min(VW - 40, 420), bh = 72;
      const H = this._heroScr, under = H && Math.abs(H.x - VW / 2) < bw / 2 + 40 && H.y < y + bh + 0.9 * this.unit * this.hs();
      g.globalAlpha = a * (under ? 0.3 : 1);
      g.fillStyle = '#fffdf5'; g.strokeStyle = info.pal.bar; g.lineWidth = 4;
      this._rr(g, VW / 2 - bw / 2, y, bw, bh, 22); g.fill(); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 14px ' + FONT; g.fillStyle = '#5b6b86';
      g.fillText('Floor ' + ((b.level || 0) + 1) + (b.loop ? '  ·  round ' + (b.loop + 1) : ''), VW / 2, y + 20);
      g.font = '900 ' + (bw < 380 ? 24 : 28) + 'px ' + FONT; g.fillStyle = info.pal.ink;
      g.fillText(info.name, VW / 2, y + 47);
      g.globalAlpha = 1;
    }
    drawHints(g) {
      if (!this.hintOn || (this.banner && this.banner.t < 2.2)) return;
      const t = this._hintT, a = Math.min(1, t / 0.5) * (t > 9 ? Math.max(0, 1 - (t - 9)) : 1);
      if (a <= 0) return;
      const VW = this.VW, y = this.VH - (this.portrait ? 70 : 30) - this.ins.bottom, touch = PH.Game && PH.Game.isTouch;
      g.globalAlpha = a * 0.92; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (touch) {
        const labels = ['◀ hold here', 'hold here ▶'];
        for (let i = 0; i < 2; i++) {
          const x = VW * (i + 0.5) / 2;
          this._pill(g, x - 70, y - 18, 140, 36);
          g.font = '900 17px ' + FONT; g.fillStyle = '#2f3b52'; g.fillText(labels[i], x, y);
        }
      } else {
        this._pill(g, VW / 2 - 180, y - 18, 360, 36);
        g.font = '900 16px ' + FONT; g.fillStyle = '#2f3b52';
        g.fillText('Hold  ←  →  to steer Puddle', VW / 2, y);
      }
      g.globalAlpha = 1;
    }
    drawDebug(g, cam) {
      const w = this.world, u = this.unit;
      g.strokeStyle = 'rgba(255,0,0,.8)'; g.lineWidth = 1;
      for (const p of w.platforms) { const x = this.sx(p.x), y = this.sy(p.y, cam); g.strokeRect(x - p.w / 2 * u, y - 2, p.w * u, 4); }
      const h = w.hero, cr = PH.World.CONFIG.catchR * (0.75 + 0.25 * (h.size || 1));
      for (const f of w.fireflies) { g.beginPath(); g.arc(this.sx(f.x), this.sy(f.y, cam), cr * u, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(0,0,255,.8)'; g.beginPath(); g.arc(this.sx(h.x), this.sy(h.y + 0.55 * (h.size || 1), cam), 0.4 * (h.size || 1) * u, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(0, this.sy(w.camY - 1.2, cam)); g.lineTo(this.VW, this.sy(w.camY - 1.2, cam)); g.stroke();
      g.fillStyle = '#000'; g.font = '12px monospace'; g.textAlign = 'left';
      g.fillText('y ' + h.y.toFixed(1) + ' cam ' + w.camY.toFixed(1) + ' plats ' + w.platforms.length + ' size ' + (h.size || 1).toFixed(2), 10, this.VH - 10);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  PH.Renderer = Renderer;
})(window.PH = window.PH || {});
