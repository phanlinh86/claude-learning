/* FH.Renderer — Clover's Farm Hop on a 2D canvas (DESIGN §2–§4). A vertical column of world units (12 u wide)
 * mapped to the screen; the camera (world.camY, lerped) only climbs. Per weather level the sky (cover-fit) and the
 * floating far décor tile are pre-rendered once into device-pixel canvases and blitted pixel-exact; level changes
 * crossfade. The farmyard scene sits under world y = 0, fence posts mark the column edges. Everything that moves
 * is lerped with world.alpha. Sprites are cached per size by FH.Assets. */
(function (FH) {
  'use strict';
  // fallback colours (also in assets/default/levels/palette.json; built in so file:// works without fetch)
  const PAL = {
    sunny: { skyTop: '#8fd3ff', skyBottom: '#e8f7ff', ink: '#2f4a6b', bar: '#7ed957' },
    rain:  { skyTop: '#9fb3b8', skyBottom: '#dfe8e4', ink: '#2f4a4f', bar: '#5fc2e8' },
    wind:  { skyTop: '#f2b7a4', skyBottom: '#fff1e4', ink: '#6b3a2e', bar: '#ff9a62' },
    snow:  { skyTop: '#b7a6d9', skyBottom: '#f6e3ec', ink: '#4a3a6b', bar: '#b9a3ff' }
  };
  const ZONE_INFO = [
    { key: 'sunny', name: 'Sunny Meadow', hint: 'Hold left or right to steer Clover!' },
    { key: 'rain', name: 'Rainy Orchard', hint: 'Puff clouds go poof after one bounce!' },
    { key: 'wind', name: 'Windy Hill', hint: 'Watch the weather vane: here comes the wind!' },
    { key: 'snow', name: 'Snowy Rooftops', hint: 'Almost at the clouds, Clover!' }
  ];
  ZONE_INFO.forEach(z => { const p = PAL[z.key]; z.top = p.skyTop; z.bottom = p.skyBottom; z.pal = p; });
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  // sprite boxes [viewBox w, h, anchor x, top-surface / feet y]
  const BOX = {
    clover: [128, 128, 64, 118], hay: [192, 96, 96, 14], plank: [160, 48, 80, 8], cart: [224, 128, 112, 22], puff: [192, 96, 96, 18],
    trampoline: [256, 96, 128, 26], spring: [64, 80, 32, 78], firefly: [64, 64, 32, 34], ground: [1280, 420, 640, 330]
  };
  const HERO_W = 1.35, FLY_W = 0.75, BOTTOM_PAD = 1.0;   // u; the screen bottom shows world y = camY − BOTTOM_PAD

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.texts = []; this.flyers = []; this.rings = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fffaf0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.hintOn = true; this.heartPulse = 0; this.jarPulse = 0; this.vanePulse = 0;
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
      const dpr = window.devicePixelRatio || 1, touch = !!(FH.Game && FH.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._spr.clear();
      this.portrait = v.VH > v.VW;
      // world → screen (DESIGN §2)
      const COLW = FH.World ? FH.World.CONFIG.COLW : 12;
      this.unit = this.portrait ? v.VW / (COLW + 0.8) : v.VH / 11.5;
      this.colX = v.VW / 2 - COLW / 2 * this.unit;
      this.colW = COLW * this.unit;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      this._syncWeather();
      FH.Assets.setScale(this.px);
    }
    _syncWeather() { const wx = this.weather; if (wx && wx.resize) wx.resize(this.VW, this.VH); }
    _measureHud() {}
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.texts.length = 0; this.flyers.length = 0; this.rings.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heartPulse = 0; this.jarPulse = 0;
      this.hintOn = !!world && (world.level || 0) === 0; this._hintT = 0; this._seenWind = false; this._windMsg = 0;
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
      c = FH.Assets.sprite(key, W, H);
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
    _slot(b) { return FH.Assets.SLOTS[2 + b].id; }
    _custom(b) { return FH.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (FH.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
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
      const A = FH.Assets, n = A.SEASONS[b], P = ZONE_INFO[b].pal, px = this.px;
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
      if (y0 + 90 * k < this.VH) { g.fillStyle = '#7a5434'; g.fillRect(0, y0 + 88 * k, this.VW, this.VH); }
    }
    drawPoles(g, cam) {
      const u = this.unit, pw = Math.round(0.62 * u), ph = Math.round(pw * 256 / 48);
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
      const u = this.unit, x = this.sx(lerp(p.prevX == null ? p.x : p.prevX, p.x, a)), y = this.sy(p.y, cam);
      if (y < -80 || y > this.VH + 120) return;
      if (p.kind === 'ground') return;
      let W = p.w * u, alpha = 1, sc = 1;
      if (p.state === 'poof') { const k = clamp(p.t / 0.35, 0, 1); sc = 1 + 0.35 * k; alpha = 1 - k; }
      else if (p.regrown && p.t < 0.45) { const k = p.t / 0.45; sc = 0.5 + 0.5 * k; alpha = k; }
      if (p.kind === 'rescue' && p.bounces > 0) alpha = Math.max(0, 1 - (p.t || 0) / 0.5);
      if (alpha <= 0.01) return;
      const key = p.kind === 'rescue' ? 'trampoline' : p.kind, B = BOX[key] || BOX.hay;
      const H = W * B[1] / B[0];
      // soft drop shadow for depth
      if (p.kind !== 'puff') { g.globalAlpha = 0.12 * alpha; g.fillStyle = '#203040'; g.beginPath(); g.ellipse(x, y + H * 0.85 + 3, W * 0.42, Math.max(3, H * 0.12), 0, 0, TAU); g.fill(); g.globalAlpha = 1; }
      if (p.kind === 'cart') {
        const wd = 0.38 * W, rot = (p.x * u) / (wd / 2) * 0.6;
        for (const wx of [56, 168]) this.drawSpr(g, 'wheel', x + (wx - 112) / 224 * W, y + (104 - 22) / 224 * W, wd, wd, 0.5, 0.5, rot, null, null, alpha);
      }
      // a bounce squash on the platform itself (bounces counter changes: we keep a per-id spring)
      const sq = this._platSq(p);
      this.drawSpr(g, key, x, y, W * sc * (1 + 0.06 * sq), H * sc * (1 - 0.12 * sq), B[2] / B[0], B[3] / B[1], 0, null, null, alpha);
      if (p.spring && p.kind === 'hay') {
        const sw = 0.55 * u, sh = sw * 80 / 64, up = p.springT < 0.25;
        this.drawSpr(g, up ? 'spring_up' : 'spring', x, y + 2, sw, sh * (up ? 1.2 : 1), 0.5, 78 / 80);
      }
      if ((p.lvl != null ? p.lvl % 4 : this.vis.cur) === 3 && p.kind !== 'puff' && p.kind !== 'rescue') {   // snow caps
        g.globalAlpha = alpha; g.fillStyle = '#ffffff'; g.strokeStyle = 'rgba(150,140,200,.55)'; g.lineWidth = 1.5;
        const cw = W * 0.86, ch = Math.max(4, u * 0.16), cx0 = x - cw / 2;
        g.beginPath(); g.moveTo(cx0, y + ch * 0.3);
        for (let i = 0; i <= 6; i++) { const xx = cx0 + cw * i / 6; g.quadraticCurveTo(xx - cw / 12, y - ch * (0.9 + 0.3 * Math.sin(p.id * 3 + i)), xx, y + ch * 0.2); }
        g.lineTo(cx0 + cw, y + ch * 0.6); g.quadraticCurveTo(x, y + ch * 1.2, cx0, y + ch * 0.6); g.closePath(); g.fill(); g.stroke();
        g.globalAlpha = 1;
      }
      if ((p.lvl != null ? p.lvl % 4 : -1) === 1 && p.kind !== 'puff' && p.kind !== 'rescue') {   // rain: a wet shine line
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
      const s = FLY_W * this.unit, pulse = 0.85 + 0.15 * Math.sin(this.time * 5 + f.id);
      // warm halo (additive)
      g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.35 * pulse;
      this.drawSpr(g, 'p_glow', x, y, s * 1.5, s * 1.5, 0.5, 0.5);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      const custom = FH.Assets.hasCustom('firefly');
      const fr = Math.floor(this.time * 10 + f.id) % 2;
      const flip = this.world && this.world.wind.strength > 0.2 ? this.world.wind.dir < 0 : Math.sin(this.time * 0.8 + f.id) < 0;
      if (custom) this.drawSpr(g, 'custom:firefly', x, y, s * 0.8, s * 0.8, 0.5, 0.5, Math.sin(this.time * 3 + f.id) * 0.15);
      else this.drawSpr(g, 'firefly_' + fr, x, y, s * pulse, s * pulse, 0.5, 34 / 64, Math.sin(this.time * 3 + f.id) * 0.12, flip ? -1 : 1, 1);
    }
    heroKey(h) {
      switch (h.mood) {
        case 'crouch': return 'clover_crouch';
        case 'up': return 'clover_up';
        case 'fall': return 'clover_fall';
        case 'ouch': return 'clover_ouch';
        case 'happy': return 'clover_happy';
        default: return 'clover_idle';
      }
    }
    drawHero(g, cam, a) {
      const w = this.world, h = w.hero, u = this.unit;
      const x = this.sx(lerp(h.prevX, h.x, a)), y = this.sy(lerp(h.prevY, h.y, a), cam);
      const S = HERO_W * u;
      if (h.invuln > 0 && w.phase === 'play' && Math.floor(this.time * 12) % 2 === 0 && h.rescueT <= 0) g.globalAlpha = 0.55;
      const sq = h.squash || 0, st = h.stretch || 0;
      const kx = (1 + 0.24 * sq - 0.07 * st), ky = (1 - 0.24 * sq + 0.13 * st);
      const face = h.face < 0 ? -1 : 1;
      // tiny shadow on the platform below when close
      if (FH.Assets.hasCustom('hero')) {
        const r = S * 0.42, cy = y - r * ky - 2;
        g.save(); g.translate(x, y); g.rotate(h.tilt || 0); g.scale(kx, ky);
        // procedural little legs
        g.strokeStyle = '#2f6b2a'; g.lineWidth = Math.max(3, u * 0.09); g.lineCap = 'round';
        const leg = h.vy > 0 ? 0.35 : 0.15;
        for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * r * 0.35, -r * 0.4); g.lineTo(s * r * (0.55 + leg), -2); g.stroke(); }
        g.restore();
        this.drawSpr(g, 'custom:hero', x, cy, r * 2 * kx, r * 2 * ky, 0.5, 0.5, (h.tilt || 0) + Math.sin(this.time * 6) * 0.04);
      } else {
        this.drawSpr(g, this.heroKey(h), x, y, S * kx, S * ky, 0.5, 118 / 128, h.tilt || 0, face, 1);
      }
      g.globalAlpha = 1;
      if (h.rescueT > 0) {   // a rescue bubble
        const k = clamp(h.rescueT / 1.2, 0, 1), r = S * 0.62;
        g.globalAlpha = 0.6 * k; g.strokeStyle = '#ffffff'; g.lineWidth = 3; g.fillStyle = 'rgba(190,230,255,0.25)';
        g.beginPath(); g.arc(x, y - S * 0.42, r, 0, TAU); g.fill(); g.stroke();
        g.globalAlpha = 0.8 * k; g.beginPath(); g.arc(x - r * 0.4, y - S * 0.42 - r * 0.45, r * 0.12, 0, TAU); g.fillStyle = '#fff'; g.fill();
        g.globalAlpha = 1;
      }
      this._heroScr = { x, y: y - S * 0.42 };
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
              if (e.kind === 'hay' || e.kind === 'cart') wx.burst('straw', x, y, e.spring ? 6 : 3, { speed: 110, life: 0.55, size: 0.28 * u, spread: Math.PI * 0.9, angle: -Math.PI / 2, gravity: 260, spin: 6, layer: 'front' });
              else if (e.kind === 'puff') wx.burst('puff', x, y, 4, { speed: 70, life: 0.5, size: 0.4 * u, spread: Math.PI, angle: -Math.PI / 2, drag: 2.5, layer: 'front' });
              else if (e.kind === 'plank') wx.burst('dust', x, y, 3, { speed: 70, life: 0.4, size: 0.3 * u, spread: Math.PI * 0.8, angle: -Math.PI / 2, drag: 3, layer: 'front' });
              if (e.spring) { wx.burst('sparkle', x, y - 0.4 * u, 8, { speed: 200, life: 0.6, size: 0.26 * u, spread: TAU, layer: 'front', drag: 2 }); this.texts.push({ x, y: y - u * 1.6, s: 'BOING!', t: 0, col: '#ff5a5f' }); }
            }
            if (e.kind === 'rescue') { this.texts.push({ x, y: y - u * 1.8, s: 'Boing! Up you go!', t: 0, col: '#ffffff' }); }
            break;
          }
          case 'poof': {
            const p = e.p, x = this.sx(p.x), y = this.sy(p.y, cam);
            if (wx) wx.burst('puff', x, y + 0.3 * u, 7, { speed: 120, life: 0.7, size: 0.5 * u, spread: TAU, drag: 2, layer: 'front' });
            break;
          }
          case 'firefly': {
            const x = this.sx(e.x), y = this.sy(e.y, cam);
            if (wx) wx.burst('sparkle', x, y, 5, { speed: 130, life: 0.45, size: 0.22 * u, spread: TAU, layer: 'front' });
            this.rings.push({ x, y, t: 0 });
            this.texts.push({ x, y: y - 0.5 * u, s: '+10', t: 0, col: '#fff27a', off: (this._txtOff = ((this._txtOff || 0) + 1) % 3) });
            this.flyers.push({ x, y, t: 0 });
            break;
          }
          case 'lantern': this.texts.push({ x: this.VW / 2, y: this.VH * 0.4, s: 'Lantern full! +1 heart', t: 0, col: '#fff27a', big: true }); this.flash = 0.3; this.flashCol = '#fff6c0'; break;
          case 'heartGain': case 'fall': this.heartPulse = 1; if (e.type === 'fall') { this.shake = Math.max(this.shake, 0.3); this.flash = 0.2; this.flashCol = '#d6ecff'; } break;
          case 'rescue': { const x = this.sx(e.x), y = this.sy(e.y, cam); if (wx) wx.burst('sparkle', x, this.VH - 30, 10, { speed: 220, life: 0.7, size: 0.26 * u, spread: Math.PI, angle: -Math.PI / 2, layer: 'front' }); break; }
          case 'windWarn': this.vanePulse = 1; this._windMsg = this._seenWind ? 1.6 : 3.2; this._seenWind = true; break;
          case 'windStart': if (wx) { for (let i = 0; i < 3; i++) wx.burst('gust', e.dir > 0 ? -40 : this.VW + 40, this.VH * (0.25 + 0.2 * i), 1, { speed: 520, life: 1.6, size: 2.2 * u, angle: e.dir > 0 ? 0 : Math.PI, spread: 0.1, layer: 'front', drag: 0.4 }); } break;
          case 'levelUp': this.showBanner(e.zone); this.flash = 0.45; this.flashCol = '#fffaf0'; if (e.bonus) this.texts.push({ x: this.VW / 2, y: this.VH * 0.62, s: 'Weather bonus +' + e.bonus, t: 0, col: '#fff3c4', big: true }); break;
          case 'gameOver': this.shake = 0.25; break;
        }
      }
    }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.4);
      this.shake = Math.max(0, this.shake - dt); this.flash = Math.max(0, this.flash - dt);
      this.heartPulse = Math.max(0, this.heartPulse - dt * 2); this.jarPulse = Math.max(0, this.jarPulse - dt * 3); this.vanePulse = Math.max(0, this.vanePulse - dt);
      if (this._windMsg > 0) this._windMsg = Math.max(0, this._windMsg - dt);
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
        this.weather.setWind(w.wind.dir, w.wind.state === 'blow' ? w.wind.strength : 0);
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
        this.drawPoles(g, cam);
        for (const p of w.platforms) this.drawPlatform(g, p, cam, a);
        const fl = w.fireflies; for (let i = 0; i < fl.length; i++) this.drawFirefly(g, fl[i], cam, a, i);
        this.drawHero(g, cam, a);
      }
      if (wx) {
        this.drawParticles(g, 'front');
        if (wx.ambient && wx.ambient.tint) { g.fillStyle = wx.ambient.tint; g.fillRect(0, 0, VW, VH); }
      }
      if (w) this.drawJuice(g);
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
        const y = t.y - (t.big ? 18 : 36) * Math.min(1, t.t / 0.5) - (t.off || 0) * 16, fs = t.big ? 28 : 21, pop = 1 + 0.3 * Math.max(0, 1 - t.t / 0.15);
        g.globalAlpha = Math.max(0, a); g.font = '900 ' + Math.round(fs * pop) + 'px ' + FONT;
        g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(40,40,70,.75)'; g.strokeText(t.s, t.x, y);
        g.fillStyle = t.col; g.fillText(t.s, t.x, y);
      }
      g.globalAlpha = 1;
      const hp = this._hudJar || { x: this.VW - 160, y: 30 };
      for (const f of this.flyers) {
        const k = f.t / 0.6, e = k * k * (3 - 2 * k), x = lerp(f.x, hp.x, e), y = lerp(f.y, hp.y, e) - Math.sin(k * Math.PI) * 50, s = lerp(30, 16, e);
        g.globalCompositeOperation = 'lighter'; this.drawSpr(g, 'p_glow', x, y, s * 1.6, s * 1.6, 0.5, 0.5, 0, null, null, 0.6); g.globalCompositeOperation = 'source-over';
        this.drawSpr(g, FH.Assets.hasCustom('firefly') ? 'custom:firefly' : 'firefly_0', x, y, s, s, 0.5, 0.5);
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
      const fill = clamp((w.lantern || 0) / (FH.World.CONFIG.lanternSize || 20), 0, 1);
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
      // the weather vane: shows the coming / blowing gust direction
      const W = w.wind;
      if (W && W.state !== 'calm' && w.phase === 'play') {
        const vs = 64, vx = this.VW / 2, vy = by + (this.portrait ? 92 : 84);
        const warn = W.state === 'warn', blink = warn ? (Math.sin(this.time * 14) * 0.5 + 0.5) : 1;
        g.globalAlpha = 0.85; g.fillStyle = 'rgba(255,253,245,.75)'; g.beginPath(); g.arc(vx, vy, vs * 0.55, 0, TAU); g.fill(); g.globalAlpha = 1;
        const wob = warn ? Math.sin(this.time * 9) * 0.25 * (1 - W.t / Math.max(0.1, W.dur || 1.6)) : Math.sin(this.time * 20) * 0.05 * W.strength;
        this.drawSpr(g, 'vane', vx, vy, vs, vs, 0.5, 0.5, wob, W.dir < 0 ? -1 : 1, 1, 0.6 + 0.4 * blink);
        // big chevrons pointing where the wind will push
        g.fillStyle = warn ? 'rgba(255,255,255,' + (0.5 + 0.5 * blink) + ')' : '#ffffff'; g.strokeStyle = 'rgba(47,59,82,.55)'; g.lineWidth = 2.5;
        for (let i = 0; i < 3; i++) {
          const cx = vx + W.dir * (vs * 0.75 + i * 18 + (this.time * 40 % 18)), cy = vy;
          g.beginPath(); g.moveTo(cx - W.dir * 7, cy - 10); g.lineTo(cx + W.dir * 5, cy); g.lineTo(cx - W.dir * 7, cy + 10); g.lineTo(cx - W.dir * 2, cy); g.closePath(); g.fill(); g.stroke();
        }
        if (this._windMsg > 0 && !this.banner) {
          const a = Math.min(1, this._windMsg / 0.4), s = W.dir > 0 ? 'Wind blowing →' : '← Wind blowing';
          g.globalAlpha = a; g.textAlign = 'center'; g.font = '900 18px ' + FONT; g.lineWidth = 5; g.lineJoin = 'round';
          g.strokeStyle = 'rgba(40,50,80,.85)'; g.fillStyle = '#ffffff'; g.strokeText(s, vx, vy + 46); g.fillText(s, vx, vy + 46); g.globalAlpha = 1;
        }
      }
    }
    drawBanner(g) {
      if (!this.banner) return;
      const VW = this.VW, b = this.banner, t = b.t, a = t < 0.35 ? t / 0.35 : t > 2.4 ? Math.max(0, 1 - (t - 2.4) / 0.6) : 1;
      const topY = this.portrait ? this.ins.top + 190 : this.ins.top + 72;
      const y = topY - (1 - Math.min(1, t / 0.35)) * 20;
      const info = ZONE_INFO[b.s], bw = Math.min(VW - 40, 420), bh = 72;
      g.globalAlpha = a;
      g.fillStyle = '#fffdf5'; g.strokeStyle = info.pal.bar; g.lineWidth = 4;
      this._rr(g, VW / 2 - bw / 2, y, bw, bh, 22); g.fill(); g.stroke();
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 14px ' + FONT; g.fillStyle = '#5b6b86';
      g.fillText('Level ' + ((b.level || 0) + 1) + (b.loop ? '  ·  round ' + (b.loop + 1) : ''), VW / 2, y + 20);
      g.font = '900 ' + (bw < 380 ? 24 : 28) + 'px ' + FONT; g.fillStyle = info.pal.ink;
      g.fillText(info.name, VW / 2, y + 47);
      g.globalAlpha = 1;
    }
    drawHints(g) {
      if (!this.hintOn || (this.banner && this.banner.t < 2.2)) return;
      const t = this._hintT, a = Math.min(1, t / 0.5) * (t > 9 ? Math.max(0, 1 - (t - 9)) : 1);
      if (a <= 0) return;
      const VW = this.VW, y = this.VH - (this.portrait ? 70 : 30) - this.ins.bottom, touch = FH.Game && FH.Game.isTouch;
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
        g.fillText('Hold  ←  →  to steer Clover', VW / 2, y);
      }
      g.globalAlpha = 1;
    }
    drawDebug(g, cam) {
      const w = this.world, u = this.unit;
      g.strokeStyle = 'rgba(255,0,0,.8)'; g.lineWidth = 1;
      for (const p of w.platforms) { const x = this.sx(p.x), y = this.sy(p.y, cam); g.strokeRect(x - p.w / 2 * u, y - 2, p.w * u, 4); }
      for (const f of w.fireflies) { g.beginPath(); g.arc(this.sx(f.x), this.sy(f.y, cam), FH.World.CONFIG.catchR * u, 0, TAU); g.stroke(); }
      const h = w.hero; g.strokeStyle = 'rgba(0,0,255,.8)'; g.beginPath(); g.arc(this.sx(h.x), this.sy(h.y + 0.55, cam), 0.4 * u, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(0, this.sy(w.camY - 1.2, cam)); g.lineTo(this.VW, this.sy(w.camY - 1.2, cam)); g.stroke();
      g.fillStyle = '#000'; g.font = '12px monospace'; g.textAlign = 'left';
      g.fillText('y ' + h.y.toFixed(1) + ' cam ' + w.camY.toFixed(1) + ' plats ' + w.platforms.length + ' wind ' + w.wind.state + ' ' + w.wind.strength.toFixed(2), 10, this.VH - 10);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  FH.Renderer = Renderer;
})(window.FH = window.FH || {});
