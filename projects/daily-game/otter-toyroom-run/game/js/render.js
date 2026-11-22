/* OD.Renderer — the playroom in pseudo-3D (DESIGN §2–§4): a flat 3-lane toy road projected with a simple
 * camera, roadside props, block towers / foam blocks / bouncy balls / acorns, Otto from behind,
 * particles, juice, the gravity badge and the canvas HUD. Per biome the sky gradient + floor plain, the sky décor tile and the horizon
 * band are pre-rendered once into device-pixel canvases and blitted pixel-exact; biome changes crossfade.
 * Everything that moves is lerped with world.alpha. Sprites are rasterized on a size ladder (×1.25 steps) so the
 * cache stays small while things grow with perspective. */
(function (OD) {
  'use strict';
  // colours from assets/default/levels/palette.json (built in so file:// works without fetch)
  const PAL = {
    meadow: { skyTop: '#bfe0ea', skyBottom: '#fbf1da', floorFar: '#cfe2a9', floorNear: '#a8c97c', path: '#eee2c4', pathEdge: '#b89b6c', divider: '#fffaec', vig: 'rgba(60,70,30,0.15)' },
    pillows: { skyTop: '#cbc3ec', skyBottom: '#fde8ea', floorFar: '#e8d5ee', floorNear: '#cdb3db', path: '#f6ebe2', pathEdge: '#b9909f', divider: '#e6c3d0', vig: 'rgba(80,50,90,0.16)' },
    crayon: { skyTop: '#b2dbd2', skyBottom: '#fff0d2', floorFar: '#ead8b8', floorNear: '#cfb790', path: '#f6f0e1', pathEdge: '#86aac0', divider: '#b9d2e2', vig: 'rgba(80,60,30,0.16)' },
    stars: { skyTop: '#141b45', skyBottom: '#3c4b89', floorFar: '#3e4b82', floorNear: '#2a3464', path: '#9ba7d6', pathEdge: '#5b67a2', divider: '#e2e7fa', vig: 'rgba(6,8,30,0.32)' }
  };
  const ZONE_INFO = [
    { key: 'meadow', name: 'The Felt Meadow', grav: 'Normal hops', hint: 'Swipe to change lanes!', props: [1.6, 1.3, 1.6, 1.5] },
    { key: 'pillows', name: 'Pillow Mountains', grav: 'Floaty jumps!', hint: 'Floaty jumps! Hop over the foam blocks!', props: [1.6, 1.4, 1.3, 1.5] },
    { key: 'crayon', name: 'The Crayon Jungle', grav: 'Quick heavy hops!', hint: 'Heavy hops! Bouncy balls roll across!', props: [1.8, 1.8, 1.1, 1.2] },
    { key: 'stars', name: 'The Glow-Star Galaxy', grav: 'Moon jumps!', hint: 'Moon jumps! Float over everything!', props: [1.5, 1.4, 1.5, 1.4] }
  ];
  ZONE_INFO.forEach(z => { const p = PAL[z.key]; z.top = p.skyTop; z.bottom = p.skyBottom; z.pal = p; });
  const ACORN_COL = ['#ffb35c', '#ffd84d', '#ff6f95'];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const CAM = { h: 1.9, d: 3.2 }, ZMAX = 36, ZMIN = -1.15;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const hex = c => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
  const clear = c => { if (c[0] === '#') { const v = hex(c); return 'rgba(' + v.join(',') + ',0)'; } return c.replace('rgb(', 'rgba(').replace(')', ',0)'); };
  const mix = (a, b, t) => { const A = hex(a), B = hex(b); return 'rgb(' + A.map((v, i) => Math.round(lerp(v, B[i], t))).join(',') + ')'; };
  const hash = n => { const h = Math.sin(n * 127.1 + 311.7) * 43758.5453; return h - Math.floor(h); };
  // sprite boxes [viewBox w, h, anchor x, anchor y (feet/base line)]
  const BOX = {
    otto: [128, 128, 64, 120], tower: [128, 160, 64, 154], blocks: [160, 80, 80, 74], ball: [96, 96, 48, 48],
    acorn: [64, 64, 32, 34], prop: [160, 220, 80, 214]
  };
  const WIDTH = { otto: 0.95, tower: 0.86, blocks: 0.95, ball: 0.62, acorn: 0.42 };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = []; this.flyers = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fff6d0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.hintOn = true; this.heartPulse = 0; this.acornPulse = 0; this.gravPulse = 0; this.gravMsg = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._spr = new Map(); this._dustT = 0; this._dist = 0;
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
      const dpr = window.devicePixelRatio || 1, touch = !!(OD.Game && OD.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._spr.clear(); this._vig = null;
      this._view = v;
      // projection (DESIGN §2)
      const portrait = v.VH > v.VW;
      this.portrait = portrait;
      this.laneW0 = portrait ? 0.27 * v.VW : Math.min(0.19 * v.VW, 0.36 * v.VH);
      this.footY = v.VH - Math.max(0.13 * v.VH, 70) - v.ins.bottom;
      this.horizonY = Math.round(v.VH * (portrait ? 0.36 : 0.40));
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      this._syncWeather();
      OD.Assets.setScale(this.px);
    }
    _syncWeather() {
      const wx = this.weather; if (!wx) return;
      if (wx.resize) wx.resize(this.VW, this.VH);
      if (wx.setHorizon) wx.setHorizon(this.horizonY);
    }
    playInsets() { return { top: (this.ins ? this.ins.top : 0) + 90, left: 0, right: 0 }; }
    _measureHud() {}
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.flyers.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heartPulse = 0; this.acornPulse = 0; this.gravPulse = 0; this.gravMsg = 0;
      this.hintOn = !!world && (world.level || 0) === 0; this._hintT = 0;
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

    // ---------------- projection ----------------
    camX() { const w = this.world; if (!w) return 0; const h = w.hero; return 0.35 * lerp(h.prevX, h.x, w.alpha || 0); }
    proj(x, y, z, cx) {
      const k = CAM.d / Math.max(0.05, z + CAM.d), L = this.laneW0;
      return { sx: this.VW / 2 + (x - cx) * L * k, sy: this.horizonY + (this.footY - this.horizonY) * k - y * L * k, k, u: L * k };
    }

    // ---------------- sprites on a size ladder ----------------
    spr(key, w, h) {
      const W = Math.max(8, Math.pow(1.25, Math.ceil(Math.log(Math.max(8, w)) / Math.log(1.25))));
      const H = W * h / w, ck = key + '|' + Math.round(W) + '|' + Math.round(H);
      let c = this._spr.get(ck);
      if (c) return c;
      c = OD.Assets.sprite(key, W, H);
      if (c) this._spr.set(ck, c);
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

    // ---------------- pre-rendered biome scenes ----------------
    _slot(b) { return OD.Assets.SLOTS[2 + b].id; }
    _custom(b) { return OD.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (OD.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    _canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* {base (sky gradient or photo + floor plain), sky (décor tile, drifts), far (horizon tile, parallax)} in device px. */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = OD.Assets, n = A.SEASONS[b], px = this.px, VW = this.VW, VH = this.VH, P = ZONE_INFO[b].pal, hy = this.horizonY;
      bg = { base: null, sky: null, far: null, custom: false };
      {
        const c = this._canvas(VW * px, VH * px), g = c.getContext('2d');
        g.imageSmoothingQuality = 'high'; g.setTransform(px, 0, 0, px, 0, 0);
        if (this._custom(b)) {
          const im = A.custom[this._slot(b)], s = Math.max(VW / im.width, (hy + 30) / im.height);
          g.filter = 'saturate(0.8)';
          g.drawImage(im, (VW - im.width * s) / 2, hy + 30 - im.height * s, im.width * s, im.height * s);
          g.filter = 'none';
          if (b === 3) { g.globalAlpha = 0.4; g.fillStyle = '#18204a'; g.fillRect(0, 0, VW, hy); g.globalAlpha = 1; }
          bg.custom = true;
        } else {
          const gr = g.createLinearGradient(0, 0, 0, hy); gr.addColorStop(0, P.skyTop); gr.addColorStop(1, P.skyBottom);
          g.fillStyle = gr; g.fillRect(0, 0, VW, hy + 2);
        }
        const sg = g.createLinearGradient(0, hy, 0, VH); sg.addColorStop(0, P.floorFar); sg.addColorStop(1, P.floorNear);
        g.fillStyle = sg; g.fillRect(0, hy, VW, VH - hy);
        if (bg.custom) { const fg = g.createLinearGradient(0, hy - 24, 0, hy + 4); fg.addColorStop(0, clear(P.floorFar)); fg.addColorStop(1, P.floorFar); g.fillStyle = fg; g.fillRect(0, hy - 24, VW, 28); }
        // the floor's texture (static): felt tufts, quilt stitches, paper fibres, carpet glints
        g.globalAlpha = b === 3 ? 0.18 : 0.13; g.strokeStyle = b === 3 ? '#8d97c4' : '#ffffff'; g.lineWidth = 2;
        if (b === 1) g.setLineDash([6, 6]);
        for (let i = 0; i < 9; i++) {
          const y = hy + (VH - hy) * Math.pow((i + 1) / 10, 1.6), w = 40 + i * 30;
          for (let j = 0; j < 3; j++) { const x = hash(i * 7 + j + b * 31) * VW; g.beginPath(); g.ellipse(x, y, w, 3 + i * 0.6, 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); }
        }
        g.setLineDash([]); g.globalAlpha = 1;
        bg.base = c;
      }
      if (!bg.custom && A.img[n + '_sky']) {
        const ks = Math.max(VW, 960) / 960, tw = Math.round(960 * ks * px), th = Math.round(540 * ks * px);
        const c = this._canvas(tw, th), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(A.img[n + '_sky'], 0, 0, tw, th); bg.sky = c;
      }
      if (!bg.custom && A.img[n + '_far']) {
        const kf = clamp(VW / 960, 0.75, 1.1), tw = Math.round(960 * kf * px), th = Math.round(300 * kf * px);
        const c = this._canvas(tw, th), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(A.img[n + '_far'], 0, 0, tw, th); bg.far = c;
      }
      this._bg.set(key, bg);
      if (this._bg.size > 4) { const keep = [this.vis.cur, this.vis.prev, (this.vis.cur + 1) % 4].map(z => this._bgKey(z)); for (const kk of this._bg.keys()) if (!keep.includes(kk)) this._bg.delete(kk); }
      return bg;
    }
    drawScene(g, b, alpha, camX) {
      const bg = this.background(b), px = this.px;
      g.globalAlpha = alpha;
      g.drawImage(bg.base, 0, 0);
      const cw = this.canvas.width;
      if (bg.sky) {   // clipped to the sky: on wide screens the scaled tile's low clouds would land on the floor
        g.save(); g.beginPath(); g.rect(0, 0, cw, Math.round(this.horizonY * px)); g.clip();
        const tw = bg.sky.width;
        let x = -Math.round(((this.time * 4 * px) % tw + tw) % tw);
        for (; x < cw; x += tw) g.drawImage(bg.sky, x, 0);
        g.restore();
      }
      if (bg.far) {
        const tw = bg.far.width, sh = this.weather && this.weather.ambient ? this.weather.ambient.shimmer || 0 : 0;
        const y = Math.round((this.horizonY + 1) * px - bg.far.height + Math.sin(this.time * 2.2) * sh * 1.2 * px);
        let x = -Math.round(((camX * 18 * px) % tw + tw) % tw);
        for (; x < cw; x += tw) g.drawImage(bg.far, x, y);
      }
      g.globalAlpha = 1;
    }

    // ---------------- the path ----------------
    drawPath(g, P, cx) {
      const w = this.world, dist = w ? w.dist - w.speed * OD.World.CONFIG.step * (1 - (w.alpha || 0)) : 0;
      this._dist = dist;
      const quad = (x0, x1, z0, z1) => {
        const a = this.proj(x0, 0, z0, cx), b = this.proj(x1, 0, z0, cx), c = this.proj(x1, 0, z1, cx), d = this.proj(x0, 0, z1, cx);
        g.beginPath(); g.moveTo(a.sx, a.sy); g.lineTo(b.sx, b.sy); g.lineTo(c.sx, c.sy); g.lineTo(d.sx, d.sy); g.closePath(); g.fill();
      };
      g.fillStyle = P.path; quad(-1.55, 1.55, ZMIN, ZMAX);
      g.fillStyle = P.pathEdge; g.globalAlpha = 0.28; quad(-1.55, -1.4, ZMIN, ZMAX); quad(1.4, 1.55, ZMIN, ZMAX); g.globalAlpha = 1;
      // lane dividers: stitched dashes every 2 u
      const base = Math.floor(dist / 2) * 2;
      g.fillStyle = P.divider;
      for (let i = 0; i < 20; i++) {
        const z0 = base + i * 2 - dist; if (z0 > ZMAX || z0 + 0.9 < ZMIN) continue;
        const z1 = Math.min(ZMAX, z0 + 0.9), zz0 = Math.max(ZMIN, z0);
        quad(-0.535, -0.465, zz0, z1); quad(0.465, 0.535, zz0, z1);
      }
      // edge studs every 1 u
      const b1 = Math.floor(dist);
      g.fillStyle = P.pathEdge;
      for (let i = 0; i < 38; i++) {
        const z = b1 + i - dist; if (z > ZMAX || z < ZMIN) continue;
        for (const lx of [-1.6, 1.6]) {
          const p = this.proj(lx, 0, z, cx), r = 0.07 * p.u;
          if (r < 0.6) continue;
          g.beginPath(); g.ellipse(p.sx, p.sy, r * 1.6, r * 0.7, 0, 0, TAU); g.fill();
        }
      }
      // haze toward the horizon
      const hy = this.horizonY, fh = (this.footY - hy) * 0.16;
      const fg = g.createLinearGradient(0, hy, 0, hy + fh); fg.addColorStop(0, P.floorFar); fg.addColorStop(1, clear(P.floorFar));
      g.fillStyle = fg; g.fillRect(0, hy, this.VW, fh);
    }

    // ---------------- world items (sorted far → near) ----------------
    _items(cx) {
      const w = this.world, a = w.alpha || 0, items = [], dist = this._dist, zi = this.vis.cur;
      // roadside props (deterministic per 2.6 u segment)
      const SEG = 2.6, s0 = Math.floor((dist + ZMIN) / SEG);
      for (let i = s0; i < s0 + Math.ceil((ZMAX - ZMIN) / SEG) + 2; i++) {
        for (const side of [-1, 1]) {
          const hsh = hash(i * 2 + (side > 0 ? 1 : 0)); if (hsh < 0.35) continue;
          const z = i * SEG + hash(i * 3.3 + side) * 1.2 - dist; if (z > ZMAX || z < ZMIN) continue;
          const idx = Math.floor(hash(i * 5.7 + side * 9) * 4) % 4;
          const pz = (w.endS != null && i * SEG > w.endS) ? (zi + 1) % 4 : zi;   // past the arch: the next biome's look
          const pw = ZONE_INFO[pz].props[idx];
          items.push({ t: 'prop', z, x: side * (1.7 + 0.45 * pw + hash(i * 1.9 + side) * 1.2), idx, zone: pz });
        }
      }
      for (const o of w.objects) {
        if (o.state === 'gone') continue;
        const z = lerp(o.prevZ, o.z, a); if (z > ZMAX + 2 || z < ZMIN) continue;
        items.push({ t: 'obj', o, z, x: lerp(o.prevX, o.x, a), y: lerp(o.prevY, o.y, a), rot: lerp(o.prevRot || 0, o.rot || 0, a) });
      }
      const H = w.hero;
      items.push({ t: 'hero', z: 0, x: lerp(H.prevX, H.x, a), y: lerp(H.prevY, H.y, a) });
      if (w.endS != null) { const z = w.endS - dist; if (z < ZMAX && z > ZMIN) items.push({ t: 'arch', z }); }
      items.sort((p, q) => (q.z - p.z) || (p.t === 'hero' ? 1 : q.t === 'hero' ? -1 : 0));
      return items;
    }
    fade(z) { return clamp((ZMAX - z) / 5, 0, 1); }
    shadow(g, x, z, wU, cx, alpha) {
      const p = this.proj(x, 0, z, cx);
      g.globalAlpha = alpha * this.fade(z);
      g.fillStyle = this.vis.cur === 3 ? '#0d1230' : '#5a3d2a';
      g.beginPath(); g.ellipse(p.sx, p.sy, wU * p.u * 0.5, wU * p.u * 0.13, 0, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    drawItem(g, it, cx) {
      const f = this.fade(it.z);
      if (it.t === 'prop') {
        const z = ZONE_INFO[it.zone], wU = z.props[it.idx], p = this.proj(it.x, 0, it.z, cx), W = wU * p.u, H = W * 220 / 160;
        if (W < 2 || p.sx + W < 0 || p.sx - W > this.VW) return;
        this.shadow(g, it.x, it.z, wU * 0.7, cx, 0.18);
        this.drawSpr(g, z.key + '_prop_' + it.idx, p.sx, p.sy, W, H, 0.5, 214 / 220, 0, null, null, f);
        return;
      }
      if (it.t === 'arch') { this.drawArch(g, it.z, cx); return; }
      if (it.t === 'hero') { this.drawHero(g, it, cx); return; }
      const o = it.o, kind = o.kind;
      if (kind === 'acorn') {
        const p = this.proj(it.x, it.y, it.z, cx), W = WIDTH.acorn * p.u;
        if (W < 1.5) return;
        if (o.state === 'taken') return;   // the flyer carries it to the counter
        const al = f;
        if (o.state === 'live' && it.y < 0.6) this.shadow(g, it.x, it.z, 0.3, cx, 0.16);
        const bob = Math.sin(this.time * 3 + o.id) * 0.03 * p.u;
        { const hr = W * 0.56, hg = g.createRadialGradient(p.sx, p.sy + bob, 0, p.sx, p.sy + bob, hr);   // soft light halo: acorns pop on any floor
          hg.addColorStop(0, 'rgba(255,255,240,0.5)'); hg.addColorStop(0.7, 'rgba(255,255,240,0.3)'); hg.addColorStop(1, 'rgba(255,255,240,0)');
          g.globalAlpha = f; g.fillStyle = hg; g.beginPath(); g.arc(p.sx, p.sy + bob, hr, 0, TAU); g.fill(); g.globalAlpha = 1; }
        const wob = Math.sin(this.time * 2.4 + o.id * 1.7) * 0.12;
        if (OD.Assets.hasCustom('acorn')) {
          const col = ACORN_COL[o.variant % 3];
          g.save(); g.globalAlpha = al; g.fillStyle = '#fff';
          g.beginPath(); g.arc(p.sx, p.sy + bob, W * 0.5, 0, TAU); g.fill(); g.restore();
          this.drawSpr(g, 'custom:acorn', p.sx, p.sy + bob, W * 0.86, W * 0.86, 0.5, 0.5, wob, null, null, al);
          g.save(); g.globalAlpha = al; g.strokeStyle = col; g.lineWidth = Math.max(1, W * 0.09); g.beginPath(); g.arc(p.sx, p.sy + bob, W * 0.47, 0, TAU); g.stroke(); g.restore();
        } else this.drawSpr(g, 'acorn_' + (o.variant % 3), p.sx, p.sy + bob, W, W, 0.5, 34 / 64, wob, null, null, al);
        return;
      }
      const B = BOX[kind], Wu = WIDTH[kind], p = this.proj(it.x, it.y, it.z, cx), W = Wu * p.u, H = W * B[1] / B[0];
      if (!B || W < 1.5) return;
      if (kind === 'ball') {   // its shadow stays on the floor while it bounces: the "where will it land" cue
        const p0 = this.proj(it.x, 0, it.z, cx);
        const air = clamp(it.y / 1.6, 0, 1);
        this.shadow(g, it.x, it.z, Wu * 0.85 * (1 - 0.4 * air), cx, 0.26 * (1 - 0.5 * air));
        const sq = o.squash || 0, sxk = 1 + 0.2 * sq * (it.y < 0.08 ? 1 : 0.3), syk = 1 - 0.25 * sq * (it.y < 0.08 ? 1 : 0.3);
        this.drawSpr(g, 'ball', p.sx, p.sy - W / 2 * syk, W, W, 0.5, 0.5, it.rot, sxk, syk, f);
        void p0;
        return;
      }
      if (it.y < 1.5) this.shadow(g, it.x, it.z, Wu * (kind === 'tower' ? 0.95 : 0.85), cx, 0.22 * clamp(1 - it.y / 1.5, 0, 1));
      const sq = o.squash || 0, sxk = 1 + 0.18 * sq, syk = 1 - 0.22 * sq;
      const key = kind === 'tower' ? 'tower_' + ((o.variant || 0) % 2) : kind;
      this.drawSpr(g, key, p.sx, p.sy, W, H, B[2] / B[0], B[3] / B[1], it.rot, sxk, syk, f);
    }
    drawHero(g, it, cx) {
      const w = this.world, h = w.hero, p = this.proj(it.x, it.y, 0, cx), u = p.u;
      const W = WIDTH.otto * u;
      const air = clamp(it.y / 1.3, 0, 1);
      this.shadow(g, it.x, 0, 0.75 * (1 - 0.35 * air), cx, 0.3 * (1 - 0.5 * air));
      let alpha = 1;
      if (h.invuln > 0 && w.phase !== 'over') alpha = (Math.floor(this.time * 12) % 2) ? 0.4 : 1;
      const sq = h.squash || 0, st = h.stretch || 0, sx = 1 - 0.08 * st + 0.18 * sq, sy = 1 + 0.18 * st - 0.22 * sq;
      const tilt = h.tilt || 0, run = lerp(h.prevRun || 0, h.run || 0, w.alpha || 0);
      if (OD.Assets.hasCustom('hero')) {
        const R = W * 0.42, bob = h.onGround ? Math.abs(Math.sin(run * Math.PI * 2)) * 0.08 * u : 0;
        g.save(); g.globalAlpha = alpha; g.translate(p.sx, p.sy - bob); g.rotate(tilt); g.scale(sx, sy);
        g.fillStyle = '#7a4a2e'; g.strokeStyle = '#3b2414'; g.lineWidth = Math.max(1, u * 0.02);
        for (let i = 0; i < 2; i++) { const ph = Math.sin(run * TAU + i * Math.PI) * 0.06 * u; g.beginPath(); g.ellipse((i ? 1 : -1) * R * 0.45, -R * 0.12 + (h.onGround ? ph : -0.04 * u), R * 0.2, R * 0.16, 0, 0, TAU); g.fill(); g.stroke(); }
        g.restore();
        this.drawSpr(g, 'custom:hero', p.sx, p.sy - bob - R * 1.1 * sy, R * 2, R * 2, 0.5, 0.5, tilt, sx, sy, alpha);
        return;
      }
      let key;
      if (h.mood === 'ouch') key = 'otto_ouch';
      else if (h.mood === 'happy') key = 'otto_happy';
      else if (!h.onGround) key = 'otto_jump';
      else key = 'otto_' + ((Math.floor(run * 4) % 4) + 4) % 4;
      this.drawSpr(g, key, p.sx, p.sy, W, W, 0.5, 120 / 128, tilt, sx, sy, alpha);
    }
    drawArch(g, z, cx) {
      // the toy-block archway at the end of a biome: two stacked block pillars, a rainbow lintel and a glow star
      const f = this.fade(z), u = this.proj(-1.8, 0, z, cx).u;
      if (u < 2) return;
      const COLS = ['#e8453c', '#f6b928', '#3b6fd8', '#4cc35a', '#b58cf0'], bs = 0.42;
      g.save(); g.globalAlpha = f; g.lineJoin = 'round';
      const cube = (x, y, c) => {
        const a = this.proj(x - bs / 2, y, z, cx), b = this.proj(x + bs / 2, y + bs, z, cx);
        g.fillStyle = c; g.strokeStyle = 'rgba(40,30,30,.7)'; g.lineWidth = Math.max(1, 0.03 * u);
        this._rr(g, a.sx, b.sy, b.sx - a.sx, a.sy - b.sy, Math.max(1, 0.05 * u)); g.fill(); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.35)'; g.fillRect(a.sx + 0.05 * u, b.sy + 0.05 * u, (b.sx - a.sx) * 0.3, (a.sy - b.sy) * 0.18);
      };
      for (const side of [-1, 1]) for (let i = 0; i < 6; i++) cube(side * 1.85, i * bs, COLS[(i + (side > 0 ? 2 : 0)) % 5]);
      const top = 6 * bs, Lt = this.proj(-2.06, top, z, cx), Rt = this.proj(2.06, top + 0.34, z, cx);
      const bands = ['#e8453c', '#f6b928', '#4cc35a', '#3b6fd8'], bh = (Lt.sy - Rt.sy) / bands.length;
      bands.forEach((c, i) => { g.fillStyle = c; g.fillRect(Lt.sx, Rt.sy + i * bh, Rt.sx - Lt.sx, bh + 0.5); });
      g.strokeStyle = 'rgba(40,30,30,.7)'; g.lineWidth = Math.max(1, 0.03 * u); g.strokeRect(Lt.sx, Rt.sy, Rt.sx - Lt.sx, Lt.sy - Rt.sy);
      g.restore();
      const mx = (Lt.sx + Rt.sx) / 2, sy = Rt.sy - 0.32 * u, nz = ((this.vis.cur + 1) % 4);
      this.drawSpr(g, 'grav_' + nz, mx, sy, 0.62 * u, 0.62 * u, 0.5, 0.5, Math.sin(this.time * 2) * 0.08, null, null, f);
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world; if (!w) return;
      const cx = this.camX(), wx = this.weather;
      for (const e of evts) {
        switch (e.type) {
          case 'acorn': {
            const p = this.proj(e.x, e.y, Math.max(0, e.z), cx);
            if (wx) { wx.burst('sparkle', p.sx, p.sy, 5, { speed: 120, life: 0.45, size: 0.12 * p.u + 6, spread: TAU, layer: 'front' }); wx.burst('ring', p.sx, p.sy, 1, { speed: 0, life: 0.3, size: 0.3 * p.u, layer: 'front' }); }
            this.texts.push({ x: p.sx, y: p.sy - 0.3 * p.u, s: '+' + e.points, t: 0, col: ACORN_COL[e.variant % 3] });
            this.flyers.push({ x: p.sx, y: p.sy, t: 0, v: e.variant % 3 });
            break;
          }
          case 'combo': this.texts.push({ x: this.VW / 2, y: this.footY - this.laneW0 * 1.9, s: e.combo + ' acorns in a row!', t: 0, col: '#fff3c4', big: true }); break;
          case 'land': {
            const p = this.proj(w.hero.x, 0, 0, cx);
            if (wx) wx.burst('dust', p.sx, p.sy, e.hard ? 7 : 4, { speed: 90, life: 0.5, size: 0.22 * p.u, spread: Math.PI * 0.8, angle: -Math.PI / 2, gravity: -20, drag: 2.5, layer: 'front' });
            break;
          }
          case 'bump': {
            this.shake = Math.max(this.shake, 0.35); this.flash = 0.25; this.flashCol = '#ffd6d6';
            const p = this.proj(w.hero.x, 0.6, 0.3, cx);
            if (wx) wx.burst('puff', p.sx, p.sy, 6, { speed: 160, life: 0.8, size: 0.16 * p.u, spread: TAU, gravity: -10, spin: 4, drag: 1.5, layer: 'front' });
            this.texts.push({ x: p.sx, y: p.sy - 0.9 * p.u, s: e.kind === 'ball' ? 'Bwop!' : e.kind === 'blocks' ? 'Squish!' : 'Bonk!', t: 0, col: '#ffffff' });
            break;
          }
          case 'heartLost': case 'heartGain': this.heartPulse = 1; break;
          case 'gravity': this.gravPulse = 1; if (e.from !== e.to) this.gravMsg = 2.6; break;
          case 'levelUp': this.showBanner(e.zone); this.gravPulse = 1; this.flash = 0.5; this.flashCol = '#fffaf0'; if (e.bonus) this.texts.push({ x: this.VW / 2, y: this.footY - this.laneW0 * 1.9, s: 'Biome bonus +' + e.bonus, t: 0, col: '#fff3c4', big: true }); break;
          case 'gameOver': this.shake = 0.3; break;
        }
      }
    }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.3);
      this.shake = Math.max(0, this.shake - dt); this.flash = Math.max(0, this.flash - dt);
      this.heartPulse = Math.max(0, this.heartPulse - dt * 2); this.acornPulse = Math.max(0, this.acornPulse - dt * 3); this.gravPulse = Math.max(0, this.gravPulse - dt);
      if (this.gravMsg > 0) this.gravMsg = Math.max(0, this.gravMsg - dt);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 3.2) this.banner = null; }
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter(t => t.t < (t.big ? 1.8 : 0.9));
      for (const f of this.flyers) { f.t += dt; if (f.t >= 0.55 && !f.done) { f.done = true; this.acornPulse = 1; } }
      this.flyers = this.flyers.filter(f => f.t < 0.55);
      if (this.hintOn) { this._hintT += dt; if (this._hintT > 12) this.hintOn = false; }
      const w = this.world;
      if (w && w.hero.onGround && w.speed > 1 && this.weather) {   // running dust at Otto's feet
        this._dustT += dt * w.speed;
        if (this._dustT > 2.2) {
          this._dustT = 0;
          const p = this.proj(w.hero.x, 0, -0.1, this.camX());
          this.weather.burst('dust', p.sx + (Math.random() - 0.5) * 0.3 * p.u, p.sy, 1, { speed: 40, life: 0.45, size: 0.18 * p.u, spread: 1.2, angle: -Math.PI / 2, drag: 3, layer: 'front' });
        }
      }
    }

    // ---------------- frame ----------------
    draw(mode) {
      const g = this.ctx, px = this.px, VW = this.VW, VH = this.VH, w = this.world;
      g.setTransform(1, 0, 0, 1, 0, 0);
      const cx = this.camX(), v = this.vis;
      if (v.t < 1) { this.drawScene(g, v.prev, 1, cx); this.drawScene(g, v.cur, v.t, cx); } else this.drawScene(g, v.cur, 1, cx);
      const Pa = ZONE_INFO[v.prev].pal, Pb = ZONE_INFO[v.cur].pal, t = v.t;
      const P = t >= 1 ? Pb : { path: mix(Pa.path, Pb.path, t), pathEdge: mix(Pa.pathEdge, Pb.pathEdge, t), divider: mix(Pa.divider, Pb.divider, t), floorFar: mix(Pa.floorFar, Pb.floorFar, t) };
      const sh = this.shake > 0 ? this.shake * 10 : 0;
      g.setTransform(px, 0, 0, px, sh ? (Math.random() - 0.5) * sh * px : 0, sh ? (Math.random() - 0.5) * sh * px : 0);
      const wx = this.weather;
      if (wx) this.drawParticles(g, 'back');
      if (w) {
        this.drawPath(g, P, cx);
        for (const it of this._items(cx)) this.drawItem(g, it, cx);
      }
      if (wx) {
        this.drawParticles(g, 'front');
        if (wx.ambient && wx.ambient.tint) { g.fillStyle = wx.ambient.tint; g.fillRect(0, 0, VW, VH); }
      }
      const vk = VW + 'x' + VH + '|' + v.cur;
      if (!this._vig || this._vig.k !== vk) {
        const vg = g.createRadialGradient(VW / 2, VH * 0.55, Math.min(VW, VH) * 0.45, VW / 2, VH * 0.55, Math.max(VW, VH) * 0.85);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, Pb.vig);
        this._vig = { k: vk, g: vg };
      }
      g.fillStyle = this._vig.g; g.fillRect(0, 0, VW, VH);
      if (w) this.drawJuice(g);
      if (this.flash > 0) { g.globalAlpha = Math.min(0.6, this.flash); g.fillStyle = this.flashCol; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1; }
      g.setTransform(px, 0, 0, px, 0, 0);
      if (w && (mode === 'playing' || mode === 'paused' || mode === 'over')) this.drawHud(g, mode);
      if (w && mode === 'playing') { this.drawBanner(g); this.drawHints(g); }
      if (this.debug && w) this.drawDebug(g, cx);
    }
    drawParticles(g, layer) {
      const ps = this.weather.particles;
      for (let i = 0; i < ps.length; i++) {
        const p = ps[i]; if (p.layer !== layer || p.alpha <= 0.01 || p.size < 1) continue;
        this.drawSpr(g, 'p_' + p.sprite, p.x, p.y, p.size, p.size, 0.5, 0.5, p.rot || 0, p.flipX ? -1 : 1, 1, p.alpha);
      }
    }
    drawJuice(g) {
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const t of this.texts) {
        const life = t.big ? 1.8 : 0.9, k = t.t / life, a = k < 0.7 ? 1 : 1 - (k - 0.7) / 0.3;
        const y = t.y - (t.big ? 18 : 40) * Math.min(1, t.t / 0.5), fs = t.big ? 28 : 22, pop = 1 + 0.3 * Math.max(0, 1 - t.t / 0.15);
        g.globalAlpha = Math.max(0, a); g.font = '900 ' + Math.round(fs * pop) + 'px ' + FONT;
        g.lineWidth = 5; g.lineJoin = 'round'; g.strokeStyle = 'rgba(70,40,20,.75)'; g.strokeText(t.s, t.x, y);
        g.fillStyle = t.col; g.fillText(t.s, t.x, y);
      }
      g.globalAlpha = 1;
      const hp = this._hudAcorn || { x: 40, y: 80 };
      for (const f of this.flyers) {
        const k = f.t / 0.55, e = k * k * (3 - 2 * k), x = lerp(f.x, hp.x, e), y = lerp(f.y, hp.y, e) - Math.sin(k * Math.PI) * 60, s = lerp(34, 22, e);
        this.drawSpr(g, OD.Assets.hasCustom('acorn') ? 'custom:acorn' : 'acorn_' + f.v, x, y, s, s, 0.5, 0.5);
      }
    }
    _rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
    _pill(g, x, y, w, h) {
      const night = this.vis.cur === 3;
      g.fillStyle = night ? 'rgba(10,14,40,.6)' : 'rgba(255,248,232,.78)';
      g.strokeStyle = night ? 'rgba(200,210,255,.35)' : 'rgba(107,74,43,.35)'; g.lineWidth = 2;
      this._rr(g, x, y, w, h, h / 2); g.fill(); g.stroke();
    }
    drawHud(g) {
      const w = this.world, I = this.ins, night = this.vis.cur === 3, ink = night ? '#fff6e3' : '#5a3a1e';
      const x0 = I.left + 12, y0 = I.top + 10;
      const n = w.maxHearts || 3, hs = 26, gap = 4;
      this._pill(g, x0, y0, n * (hs + gap) + 14, 38);
      for (let i = 0; i < n; i++) {
        const full = i < w.hearts, pulse = (i === w.hearts || i === w.hearts - 1) ? this.heartPulse : 0, s = hs * (1 + 0.3 * pulse);
        this.drawSpr(g, full ? 'heart' : 'heart_empty', x0 + 7 + i * (hs + gap) + hs / 2, y0 + 19, s, s, 0.5, 0.5);
      }
      const y1 = y0 + 46;
      this._pill(g, x0, y1, 156, 38);
      const ss = 28 * (1 + 0.35 * this.acornPulse);
      this._hudAcorn = { x: x0 + 22, y: y1 + 19 };
      this.drawSpr(g, OD.Assets.hasCustom('acorn') ? 'custom:acorn' : 'acorn_0', x0 + 22, y1 + 19, ss, ss, 0.5, 0.5);
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.font = '900 22px ' + FONT; g.fillStyle = ink;
      g.fillText(String(w.acorns || 0), x0 + 40, y1 + 20);
      g.font = '800 14px ' + FONT; g.globalAlpha = 0.75; g.textAlign = 'right'; g.fillText(String(w.score) + ' pts', x0 + 146, y1 + 20); g.globalAlpha = 1;
      // biome progress (gravity badge + bar); in portrait it sits under the buttons row on the right
      const bw = Math.min(250, this.VW * (this.portrait ? 0.5 : 0.3));
      const bx = this.portrait ? this.VW - I.right - 12 - bw - 8 : this.VW / 2 - bw / 2, by = this.portrait ? y0 + 64 : y0 + 4;
      this._pill(g, bx - 8, by - 4, bw + 16, 38);
      const bk = 32 * (1 + 0.3 * this.gravPulse), gz = (w.zone != null ? w.zone : (w.level || 0) % 4);
      this.drawSpr(g, 'grav_' + gz, bx + 14, by + 15, bk, bk, 0.5, 0.5, Math.sin(this.time * 2.5) * 0.08 * (gz === 1 || gz === 3 ? 1 : 0.3));
      const tx = bx + 36, tw = bw - 44;
      g.font = '900 13px ' + FONT; g.fillStyle = ink; g.textAlign = 'left';
      g.fillText('Biome ' + ((w.level || 0) + 1) + ' · ' + ZONE_INFO[gz].grav.replace('!', ''), tx, by + 7);
      g.fillStyle = night ? 'rgba(255,255,255,.18)' : 'rgba(107,74,43,.18)';
      this._rr(g, tx, by + 17, tw, 9, 4.5); g.fill();
      g.fillStyle = '#2ec4b6';
      this._rr(g, tx, by + 17, Math.max(9, tw * clamp(w.progress || 0, 0, 1)), 9, 4.5); g.fill();
    }
    drawBanner(g) {
      const VW = this.VW;
      const topY = this.portrait ? this.ins.top + 150 : this.horizonY - 82;
      if (this.banner) {
        const b = this.banner, t = b.t, a = t < 0.35 ? t / 0.35 : t > 2.6 ? Math.max(0, 1 - (t - 2.6) / 0.6) : 1;
        const y = topY - (1 - Math.min(1, t / 0.35)) * 20;
        const info = ZONE_INFO[b.s], bw = Math.min(VW - 40, 460), bh = 76;
        g.globalAlpha = a;
        g.fillStyle = '#fff6e3'; g.strokeStyle = '#a8875a'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(VW / 2 - bw / 2, y); g.lineTo(VW / 2 + bw / 2, y); g.lineTo(VW / 2 + bw / 2 - 14, y + bh / 2); g.lineTo(VW / 2 + bw / 2, y + bh); g.lineTo(VW / 2 - bw / 2, y + bh); g.lineTo(VW / 2 - bw / 2 + 14, y + bh / 2); g.closePath(); g.fill(); g.stroke();
        g.textAlign = 'center'; g.textBaseline = 'middle';
        g.font = '800 15px ' + FONT; g.fillStyle = '#2a8f86';
        g.fillText('Biome ' + ((b.level || 0) + 1) + (b.loop ? '  ·  round ' + (b.loop + 1) : '') + '  ·  ' + info.grav, VW / 2, y + 22);
        g.font = '900 ' + (bw < 400 ? 24 : 28) + 'px ' + FONT; g.fillStyle = '#5a3a1e';
        g.fillText(info.name, VW / 2, y + 50);
        g.globalAlpha = 1;
      }
      if (this.gravMsg > 0 && (!this.banner || this.banner.t > 2.4)) {
        const a = Math.min(1, this.gravMsg / 0.4), y = this.portrait ? topY + 30 : this.ins.top + 116;
        const z = this.world ? this.world.zone % 4 : 0, s = ZONE_INFO[z].hint;
        g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '900 ' + (VW < 700 ? 20 : 24) + 'px ' + FONT;
        g.lineWidth = 6; g.lineJoin = 'round'; g.strokeStyle = 'rgba(21,88,102,.9)'; g.fillStyle = '#ffe9b0';
        g.strokeText(s, VW / 2, y); g.fillText(s, VW / 2, y);
        g.globalAlpha = 1;
      }
    }
    drawHints(g) {
      if (!this.hintOn || (this.banner && this.banner.t < 2.4)) return;
      const t = this._hintT, a = Math.min(1, t / 0.5) * (t > 11 ? Math.max(0, 1 - (t - 11)) : 1);
      if (a <= 0) return;
      const VW = this.VW, y = this.VH - (this.portrait ? 60 : 30) - this.ins.bottom, touch = OD.Game && OD.Game.isTouch;
      g.globalAlpha = a * 0.92; g.textAlign = 'center'; g.textBaseline = 'middle';
      if (touch) {
        const labels = ['◀ tap', '▲ jump', 'tap ▶'];
        for (let i = 0; i < 3; i++) {
          const x = VW * (i + 0.5) / 3;
          this._pill(g, x - 56, y - 18, 112, 36);
          g.font = '900 17px ' + FONT; g.fillStyle = this.vis.cur === 3 ? '#fff' : '#5a3a1e'; g.fillText(labels[i], x, y);
        }
      } else {
        this._pill(g, VW / 2 - 200, y - 18, 400, 36);
        g.font = '900 16px ' + FONT; g.fillStyle = this.vis.cur === 3 ? '#fff' : '#5a3a1e';
        g.fillText('←  →  change lanes      ↑ / Space  jump', VW / 2, y);
      }
      g.globalAlpha = 1;
    }
    drawDebug(g, cx) {
      const w = this.world;
      g.strokeStyle = 'rgba(255,0,0,.8)'; g.lineWidth = 1;
      for (const o of w.objects) {
        if (o.state === 'gone' || o.z > ZMAX || o.z < ZMIN) continue;
        const a = this.proj(o.x - o.w, 0, o.z - o.d, cx), b = this.proj(o.x + o.w, o.h, o.z - o.d, cx);
        g.strokeRect(a.sx, b.sy, b.sx - a.sx, a.sy - b.sy);
      }
      g.fillStyle = '#000'; g.font = '12px monospace'; g.textAlign = 'left';
      g.fillText('dist ' + w.dist.toFixed(1) + ' v ' + w.speed.toFixed(2) + ' obj ' + w.objects.length + ' gk ' + (w.gk || 1).toFixed(2), 10, this.VH - 10);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  OD.Renderer = Renderer;
})(window.OD = window.OD || {});
