/* FIF.Renderer — Finn's Island Fling on a 2D canvas (DESIGN §2–§5). A fixed camera: the world field (16 × 9 u, y up,
 * sea at y 0) is mapped to the screen (landscape unit = VH/9, portrait unit = VW/16.4). Per island the sky and the
 * "land" (far islands, near islands, sea, beach rock) are pre-rendered once into device-pixel canvases and blitted
 * pixel-exact; island changes crossfade. The day cycle (world.light / dayT) adds a sun or moon, a dusk glow, a night
 * tint over the background, and a darkness layer with light holes (Finn, the raft lantern, the sling torch, leaves).
 * Everything that moves is lerped with world.alpha. Sprites are cached per size by FIF.Assets. */
(function (FIF) {
  'use strict';
  const PAL = {
    cove:    { skyTop: '#86c6e6', skyBottom: '#e8f5f6', sea: '#3fb2b6', ink: '#1f4b5c', bar: '#fff6df', nightTop: '#141d44', nightBottom: '#2f4a7a' },
    jungle:  { skyTop: '#8fbfcc', skyBottom: '#e5efe0', sea: '#38a69f', ink: '#1f4a3e', bar: '#f4f8e8', nightTop: '#111c38', nightBottom: '#284a63' },
    lagoon:  { skyTop: '#a3bfe8', skyBottom: '#f7e4ea', sea: '#4cbfc6', ink: '#3f3a66', bar: '#fff1f4', nightTop: '#1a1a46', nightBottom: '#3e3f78' },
    lantern: { skyTop: '#8ea7d3', skyBottom: '#f3dac8', sea: '#3497ad', ink: '#3a2f55', bar: '#fff1dc', nightTop: '#100f33', nightBottom: '#33305f' }
  };
  const ZONE_INFO = [
    { key: 'cove', name: 'Sunny Cove', hint: 'Drag back and let go to fling Finn!' },
    { key: 'jungle', name: 'Jungle Isle', hint: 'The raft drifts — fling where it will be!' },
    { key: 'lagoon', name: 'Coral Lagoon', hint: 'Watch out for the sleepy seagull!' },
    { key: 'lantern', name: 'Lantern Bay', hint: 'Lanterns light the way at night!' }
  ];
  ZONE_INFO.forEach(z => { const p = PAL[z.key]; z.top = p.skyTop; z.bottom = p.skyBottom; z.pal = p; });
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const HERO = 1.3, LEAF = 0.8;
  // JSON-free copy of palette.json "lights" (glow spots on the far / near art, art px) so file:// works
  const LIGHTS = {"cove":{"near":[],"far":[]},"jungle":{"near":[[371,131,16],[414,151,14]],"far":[]},"lagoon":{"near":[[790,59,22]],"far":[]},"lantern":{"near":[[382,116,14],[412,78,14],[472,67,14],[494,74,14],[528,104,14],[410,176,12],[450,176,12],[490,176,12],[554,131,14],[679,139,16],[831,143,15],[738,175,12],[765,181,12],[792,175,12],[188,129,16]],"far":[[250,288,10],[276,285,10],[300,276,10],[326,281,10],[288,285,10],[730,288,10],[756,285,10],[782,276,10],[520,211,12]]}};

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.texts = []; this.flyers = []; this.rings = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fffaf0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.heartPulse = 0; this.leafPulse = 0; this.land = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._spr = new Map();
      this.dark = document.createElement('canvas');
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
      const dpr = window.devicePixelRatio || 1, touch = !!(FIF.Game && FIF.Game.isTouch);
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
      else { this.unit = v.VH / 9; this.ox = 0; this.seaPx = Math.round(v.VH - 1.2 * this.unit); }
      this.k = this.unit / 60;   // art scale: the art was drawn for 60 px per unit
      this.dark.width = Math.ceil(v.VW / 4); this.dark.height = Math.ceil(v.VH / 4);
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      this._syncWeather();
      FIF.Assets.setScale(this.px);
    }
    _syncWeather() { const wx = this.weather; if (wx) { if (wx.resize) wx.resize(this.VW, this.VH); if (wx.setHorizon) wx.setHorizon(this.seaPx); } }
    _measureHud() {}
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.texts.length = 0; this.flyers.length = 0; this.rings.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heartPulse = 0; this.leafPulse = 0; this.land = 0;
      this.hint = world && (world.level || 0) === 0 ? 'drag' : null; this._flutterHinted = false; this._nightHinted = false;
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
      c = FIF.Assets.sprite(key, W, H);
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
    _slot(b) { return FIF.Assets.SLOTS[2 + b].id; }
    _custom(b) { return FIF.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (FIF.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
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
      const A = FIF.Assets, n = A.SEASONS[b], pal = PAL[n], P = this.px, W = this.VW, H = this.VH, k = this.k, sea = this.seaPx;
      const mk = () => { const c = document.createElement('canvas'); c.width = Math.round(W * P); c.height = Math.round(H * P); const g = c.getContext('2d'); g.scale(P, P); g.imageSmoothingQuality = 'high'; return [c, g]; };
      const [sky, gs] = mk(), [land, gl] = mk();
      // sky: gradient fallback, then the sky art cover-fit (or the player's picture)
      const gr = gs.createLinearGradient(0, 0, 0, sea); gr.addColorStop(0, pal.skyTop); gr.addColorStop(1, pal.skyBottom);
      gs.fillStyle = gr; gs.fillRect(0, 0, W, H);
      const custom = this._custom(b) ? A.custom[this._slot(b)] : null;
      const cover = (g, img, iw, ih, bottom) => { const s = Math.max(W / iw, bottom / ih); g.drawImage(img, (W - iw * s) / 2, bottom - ih * s, iw * s, ih * s); };
      if (custom) cover(gs, custom, custom.width, custom.height, sea);
      else if (A.img[n + '_sky']) cover(gs, A.img[n + '_sky'], 960, 540, sea + 20 * k);
      // land: transparent above the islands
      const tile = (img, iw, ih, bottom) => {
        if (!img) return;
        const w = iw * k, h = ih * k;
        for (let x = 0; x < W; x += w) gl.drawImage(img, Math.floor(x), bottom - h, Math.ceil(w) + 1, h);
      };
      if (!custom) { tile(A.img[n + '_far'], 960, 300, sea - 76 * k); tile(A.img[n + '_near'], 960, 200, sea - 6 * k); }
      // the sea: tile from the surface (art surface line at y 20), then deep colour below
      gl.fillStyle = '#17657a'; gl.fillRect(0, sea, W, H - sea);
      const seaImg = A.img.sea;
      if (seaImg) { const w = 960 * k, h = 240 * k; for (let x = 0; x < W; x += w) gl.drawImage(seaImg, Math.floor(x), sea - 20 * k, Math.ceil(w) + 1, h); }
      else { gl.fillStyle = pal.sea; gl.fillRect(0, sea, W, H - sea); }
      // beach rock under the sling: left edge flush at world x 0, top surface (art y 40) at world y 1.2
      const rk = A.img.rock;
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

    // ---------------- day cycle ----------------
    nightK() { const w = this.world; const l = w ? w.light : 1; return clamp((1 - l) / 0.7, 0, 1); }
    drawSky(g, b, alpha) {
      const bg = this.background(b);
      g.save(); g.globalAlpha = alpha; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bg.sky, 0, 0); g.restore();
    }
    drawLand(g, b, alpha) {
      const bg = this.background(b);
      g.save(); g.globalAlpha = alpha; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bg.land, 0, 0); g.restore();
    }
    drawCelestial(g) {
      const w = this.world; if (!w) return;
      const d = w.dayT, nk = this.nightK(), W = this.VW, sea = this.seaPx;
      const pal = PAL[FIF.Assets.SEASONS[this.vis.cur]];
      // night sky: a gradient over the day sky
      if (nk > 0.01) {
        g.save(); g.globalAlpha = nk * 0.92;
        const gr = g.createLinearGradient(0, 0, 0, sea); gr.addColorStop(0, pal.nightTop); gr.addColorStop(1, pal.nightBottom);
        g.fillStyle = gr; g.fillRect(0, 0, W, sea + 2); g.restore();
      }
      // dusk / dawn glow near the horizon
      const glow = Math.max(0, 1 - Math.abs(w.light - 0.62) / 0.3) * (w.light < 0.98 ? 1 : 0);
      if (glow > 0.01) {
        g.save(); g.globalAlpha = glow * 0.55;
        const gr = g.createLinearGradient(0, sea * 0.35, 0, sea); gr.addColorStop(0, 'rgba(255,160,110,0)'); gr.addColorStop(1, '#ffa36e');
        g.fillStyle = gr; g.fillRect(0, sea * 0.35, W, sea * 0.65 + 2); g.restore();
      }
      // sun during the day part (0 … 0.7), moon at night (0.6 … 1.12): rise on the left, set on the right
      const arc = (t, r, col, ring) => {
        const x = lerp(-0.05, 1.05, t) * W, y = sea - Math.sin(t * Math.PI) * sea * 0.78 + 20 * this.k;
        if (y > sea + r) return;
        g.save();
        g.fillStyle = ring; g.beginPath(); g.arc(x, y, r * 1.7, 0, TAU); g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.restore();
        return [x, y];
      };
      const R = 26 * this.k;
      if (d < 0.7) arc(d / 0.7, R, '#fff2a8', 'rgba(255,240,170,0.35)');
      let dm = d >= 0.6 ? d - 0.6 : d + 0.4;
      if (dm < 0.52) {
        const p = arc(dm / 0.52, R * 0.85, '#f4f6ff', 'rgba(200,215,255,0.25)');
        if (p) { g.save(); g.fillStyle = pal.nightTop; g.globalAlpha = 0.85; g.beginPath(); g.arc(p[0] + R * 0.38, p[1] - R * 0.2, R * 0.72, 0, TAU); g.fill(); g.restore(); }   // crescent
      }
    }
    drawNightTint(g) {
      const nk = this.nightK(); if (nk < 0.01) return;
      g.save(); g.globalAlpha = nk * 0.55; g.fillStyle = '#1b2350'; g.fillRect(0, 0, this.VW, this.VH); g.restore();
      // the art's own light spots (windows, lanterns) glow at night
      const n = FIF.Assets.SEASONS[this.vis.cur], L = LIGHTS && LIGHTS[n];
      if (!L || this._custom(this.vis.cur)) return;
      const k = this.k, sea = this.seaPx, t = this.time;
      g.save(); g.globalCompositeOperation = 'lighter';
      const spot = (list, ih, bottom, iw) => {
        for (const [x, y, r] of list) {
          for (let ox = 0; ox < this.VW; ox += iw * k) {
            const X = ox + x * k, Y = bottom - (ih - y) * k, rr = r * k * (2.2 + 0.15 * Math.sin(t * 2 + x));
            const gr = g.createRadialGradient(X, Y, 0, X, Y, rr);
            gr.addColorStop(0, 'rgba(255,214,120,' + (0.55 * nk) + ')'); gr.addColorStop(1, 'rgba(255,180,80,0)');
            g.fillStyle = gr; g.fillRect(X - rr, Y - rr, rr * 2, rr * 2);
          }
        }
      };
      spot(L.far || [], 300, sea - 76 * k, 960); spot(L.near || [], 200, sea - 6 * k, 960);
      g.restore();
    }
    /* darkness with light holes, drawn at quarter resolution and scaled up (one cheap layer) */
    drawDarkness(g, a) {
      const nk = this.nightK(), w = this.world; if (nk < 0.02 || !w) return;
      const d = this.dark, x = d.getContext('2d'), q = d.width / this.VW;
      x.setTransform(1, 0, 0, 1, 0, 0); x.globalCompositeOperation = 'source-over';
      x.clearRect(0, 0, d.width, d.height);
      x.fillStyle = 'rgba(6,8,28,' + (0.72 * nk) + ')'; x.fillRect(0, 0, d.width, d.height);
      x.globalCompositeOperation = 'destination-out';
      const hole = (wx, wy, r, s) => {
        const X = this.sx(wx) * q, Y = this.sy(wy) * q, R = r * this.unit * q;
        const gr = x.createRadialGradient(X, Y, R * 0.15, X, Y, R);
        gr.addColorStop(0, 'rgba(0,0,0,' + s + ')'); gr.addColorStop(0.6, 'rgba(0,0,0,' + (s * 0.6) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        x.fillStyle = gr; x.beginPath(); x.arc(X, Y, R, 0, TAU); x.fill();
      };
      const f = this.foxPos(a);
      hole(f.x, f.y, 2.6, 1);
      const r = w.raft; if (r) { const rx = lerp(r.px, r.x, a); hole(rx + r.hw * 0.75, r.top + 0.9, 2.3, 1); hole(rx, r.top, 1.6, 0.8); }
      hole(w.sling.x - 0.55, w.sling.y + 0.75, 1.7, 0.95);
      for (const l of w.leaves) hole(lerp(l.px, l.x, a), lerp(l.py, l.y, a), l.kind === 'moon' ? 0.95 : 0.7, l.kind === 'moon' ? 1 : 0.8);
      for (const p of this.previewPts || []) hole(p.x, p.y, 0.35, 0.9);
      g.save(); g.setTransform(this.px, 0, 0, this.px, 0, 0); g.imageSmoothingEnabled = true;
      g.drawImage(d, 0, 0, d.width, d.height, 0, 0, this.VW, this.VH);
      g.restore();
    }

    // ---------------- world objects ----------------
    foxPos(a) {
      const f = this.world.fox;
      return { x: lerp(f.px, f.x, a), y: lerp(f.py, f.y, a), rot: lerp(f.prot != null ? f.prot : f.rot, f.rot, a) };
    }
    drawWaves(g) {   // ambient: two thin wave crests sliding along the sea surface
      const sea = this.seaPx, t = this.time, u = this.unit;
      g.save(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1.5, 2 * this.k); g.lineCap = 'round';
      for (let row = 0; row < 2; row++) {
        const y0 = sea + (0.25 + row * 0.55) * u, sp = (row ? -18 : 26) * this.k, len = 0.7 * u, gap = 2.6 * u;
        for (let x = ((t * sp) % gap) - gap; x < this.VW; x += gap) {
          const xx = x + row * gap * 0.5;
          g.beginPath(); g.moveTo(xx, y0); g.quadraticCurveTo(xx + len / 2, y0 - 4 * this.k, xx + len, y0); g.stroke();
        }
      }
      g.restore();
    }
    drawRaft(g, a) {
      const r = this.world.raft; if (!r) return;
      const x = lerp(r.px, r.x, a), w = (2 * r.hw + 0.3) * this.unit, h = w * 112 / 256;
      const bob = Math.sin(this.time * 2.1) * 0.06 * this.unit;
      const cx = this.sx(x), cy = this.sy(r.top) + bob;
      this.drawSpr(g, 'raft', cx, cy, w, h, 0.5, 34 / 112);
      // the lantern glows more at night
      const nk = this.nightK();
      if (nk > 0.05) {
        const lx = cx + (222 - 128) / 256 * w, ly = cy - (34 - 7) / 112 * h, R = 0.9 * this.unit;
        g.save(); g.globalCompositeOperation = 'lighter';
        const gr = g.createRadialGradient(lx, ly, 0, lx, ly, R); gr.addColorStop(0, 'rgba(255,220,120,' + 0.6 * nk + ')'); gr.addColorStop(1, 'rgba(255,190,90,0)');
        g.fillStyle = gr; g.fillRect(lx - R, ly - R, R * 2, R * 2); g.restore();
      }
      // gently mark the bullseye while aiming on the first island so kids learn what X means
      if (this.world.phase === 'aim' && this.world.level === 0 && this.world.shots < 3) {
        const p = 0.5 + 0.5 * Math.sin(this.time * 4);
        g.save(); g.globalAlpha = 0.25 + 0.35 * p; g.strokeStyle = '#fff6b0'; g.lineWidth = 3 * this.k;
        g.beginPath(); g.ellipse(cx, cy - 2 * this.k, r.bull * this.unit + 6 * this.k, 9 * this.k, 0, 0, TAU); g.stroke(); g.restore();
      }
    }
    drawLeaves(g, a) {
      const w = this.world, s = LEAF * this.unit, custom = FIF.Assets.hasCustom('leaf'), nk = this.nightK();
      for (const l of w.leaves) {
        const x = this.sx(lerp(l.px, l.x, a)), y = this.sy(lerp(l.py, l.y, a));
        const rot = Math.sin(this.time * 1.7 + l.id) * 0.25;
        if (l.kind === 'moon' || nk > 0.3) {   // glow halo (moon leaves always; any leaf at night)
          g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = l.kind === 'moon' ? 0.75 : 0.45 * nk;
          const R = s * (l.kind === 'moon' ? 0.95 : 0.75) * (1 + 0.08 * Math.sin(this.time * 3 + l.id));
          const gr = g.createRadialGradient(x, y, 0, x, y, R); gr.addColorStop(0, l.kind === 'moon' ? 'rgba(200,245,255,0.9)' : 'rgba(190,255,150,0.8)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2); g.restore();
        }
        if (custom) { const [cw, ch] = FIF.Assets.fit('leaf', s, s); this.drawSpr(g, 'custom:leaf', x, y, cw, ch, 0.5, 0.5, rot); if (l.kind === 'moon') this.drawSpr(g, 'leaf_moon', x + s * 0.3, y - s * 0.3, s * 0.45, s * 0.45, 0.5, 0.5); }
        else this.drawSpr(g, l.kind === 'moon' ? 'leaf_moon' : 'leaf', x, y, s, s, 0.5, 0.5, rot);
      }
    }
    drawGulls(g, a) {
      for (const gl of this.world.gulls) {
        const x = this.sx(lerp(gl.px, gl.x, a)), y = this.sy(lerp(gl.py, gl.y, a));
        const fr = (Math.floor(this.time * 5 + gl.id) % 2) ? 'gull_1' : 'gull_0';
        const flip = gl.vx < 0 ? -1 : 1;
        this.drawSpr(g, fr, x, y, 1.2 * this.unit, 0.8 * this.unit, 0.5, 0.5, 0, flip, 1);
      }
    }
    drawSling(g, back) {
      const w = this.world, u = this.unit, sw = 1.6 * u, sh = 2.56 * u;
      const ax = this.sx(w.sling.x), ay = this.sy(w.sling.y);
      const L = [ax + (34 - 80) / 160 * sw, ay + (46 - 50) / 256 * sh], Rr = [ax + (126 - 80) / 160 * sw, ay + (46 - 50) / 256 * sh];
      // the band: back strand (behind Finn) from the left prong, front strand from the right prong, to Finn's seat
      let seat = [ax, ay + 0.15 * u];
      if (w.phase === 'aim') { const p = w.pull; if (p) seat = [this.sx(w.sling.x + p.x) - 0.2 * u, this.sy(w.sling.y + p.y) + 0.25 * u]; }
      else if (w.phase === 'fly' && w.fox.flightT < 0.18) { const k = 1 - w.fox.flightT / 0.18; seat = [ax + Math.sin(this.time * 40) * 0.15 * u * k, ay + 0.1 * u]; }
      g.save(); g.lineCap = 'round';
      if (back) {
        this.drawSpr(g, 'sling', ax, ay, sw, sh, 0.5, 50 / 256);
        g.strokeStyle = '#6b3a1f'; g.lineWidth = 5 * this.k;
        g.beginPath(); g.moveTo(L[0], L[1]); g.lineTo(seat[0], seat[1]); g.stroke();
      } else {
        g.strokeStyle = '#8a4a26'; g.lineWidth = 5 * this.k;
        g.beginPath(); g.moveTo(Rr[0], Rr[1]); g.lineTo(seat[0], seat[1]); g.stroke();
        g.fillStyle = '#5a2e14'; g.beginPath(); g.ellipse(seat[0], seat[1], 7 * this.k, 5 * this.k, 0, 0, TAU); g.fill();   // the leather pouch
      }
      g.restore();
      if (back) {   // torch glow
        const tx = ax + (20 - 80) / 160 * sw, ty = ay + (20 - 50) / 256 * sh, nk = this.nightK();
        if (nk > 0.05) {
          const R = (0.7 + 0.06 * Math.sin(this.time * 9)) * u;
          g.save(); g.globalCompositeOperation = 'lighter';
          const gr = g.createRadialGradient(tx, ty, 0, tx, ty, R); gr.addColorStop(0, 'rgba(255,200,100,' + 0.65 * nk + ')'); gr.addColorStop(1, 'rgba(255,150,60,0)');
          g.fillStyle = gr; g.fillRect(tx - R, ty - R, R * 2, R * 2); g.restore();
        }
      }
    }
    drawPreview(g) {
      const w = this.world;
      const pts = this.previewPts = w.phase === 'aim' && w.pull ? w.preview(w.previewCount()) : [];
      if (!pts.length) return;
      g.save();
      const n = pts.length;
      for (let i = 0; i < n; i++) {
        const p = pts[i], fade = 1 - i / (n + 2);
        const r = (4.2 - 1.6 * i / n) * this.k;
        g.globalAlpha = 0.9 * fade;
        g.fillStyle = 'rgba(40,60,80,0.45)'; g.beginPath(); g.arc(this.sx(p.x), this.sy(p.y) + 1.5 * this.k, r + 1.4 * this.k, 0, TAU); g.fill();
        g.fillStyle = i % 2 ? '#ffffff' : '#fff3b0'; g.beginPath(); g.arc(this.sx(p.x), this.sy(p.y), r, 0, TAU); g.fill();
      }
      g.restore();
    }
    heroKey(st) {
      const w = this.world;
      if (w.phase === 'aim') return w.pull ? 'pull' : 'sit';
      return ({ sit: 'sit', pull: 'pull', fly: 'fly', flutter: 'flutter', land: 'land', splash: 'splash', bonk: 'bonk' })[st] || 'fly';
    }
    drawHero(g, a) {
      const w = this.world, f = w.fox, P = this.foxPos(a), s = HERO * this.unit;
      let x = this.sx(P.x), y = this.sy(P.y), rot = -P.rot, sx = 1, sy = 1;
      const key = this.heroKey(f.state);
      if (key === 'sit') { sy = 1 + 0.03 * Math.sin(this.time * 3); sx = 2 - sy; rot = 0; }
      if (key === 'pull') rot = 0;
      if (key === 'land') { const t = w.phaseT || 0; const sq = Math.exp(-t * 7) * Math.cos(t * 22) * 0.18; sx = 1 + sq; sy = 1 - sq; rot = 0; }
      if (key === 'splash') { rot = 0; y = this.sy(0) - 0.25 * s + Math.sin(this.time * 6) * 2 * this.k; }
      // squash / stretch along the flight (a bit of cartoon feel)
      if (key === 'fly') { const v = Math.hypot(f.vx, f.vy); sx = 1 + Math.min(0.12, v * 0.006); sy = 2 - sx; }
      const custom = FIF.Assets.hasCustom('hero');
      if (custom) {
        const [cw, ch] = FIF.Assets.fit('hero', s * 0.95, s * 0.95);
        const wob = key === 'fly' || key === 'flutter' ? Math.sin(this.time * (key === 'flutter' ? 40 : 14)) * 0.08 : 0;
        this.drawSpr(g, 'custom:hero', x, y, cw, ch, 0.5, 0.5, rot + wob, sx, sy, key === 'splash' ? 0.9 : 1);
        if (key === 'splash') { g.save(); g.fillStyle = PAL[FIF.Assets.SEASONS[this.vis.cur]].sea; g.globalAlpha = 0.85; g.fillRect(x - s, this.sy(0) + 2 * this.k, s * 2, s * 0.6); g.restore(); }
      } else this.drawSpr(g, 'finn_' + key, x, y, s, s, 0.5, 0.5, rot, sx, sy);
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world, wx = this.weather, u = this.unit, title = FIF.Game && FIF.Game.mode === 'title';
      for (const e of evts) {
        const X = e.x != null ? this.sx(e.x) : 0, Y = e.y != null ? this.sy(e.y) : 0;
        switch (e.type) {
          case 'pull': if (this.hint === 'drag') this.hint = null; break;
          case 'launch': this.shake = Math.max(this.shake, 2 * (e.power || 0.5)); break;
          case 'leaf':
            if (wx) wx.burst('leaf', X, Y, 7);
            if (!title) { this.text('+' + e.value, X, Y - 0.5 * u, e.kind === 'moon' ? '#c9f6ff' : '#d4ff9e'); this.flyers.push({ x: X, y: Y, t: 0, moon: e.kind === 'moon' }); }
            break;
          case 'flutter': { const P = this.foxPos(1); if (wx) wx.burst('flutter', this.sx(P.x) - 0.3 * u, this.sy(P.y) + 0.2 * u, 5); this._flutterHinted = true; if (this.hint === 'flutter') this.hint = null; break; }
          case 'bump': if (wx) wx.burst('bump', X, Y, 6); this.shake = Math.max(this.shake, 5); if (!title) this.text('Bonk!', X, Y - 0.6 * u, '#ffffff'); break;
          case 'land':
            if (wx) wx.burst('land', X, this.sy(w.raft ? w.raft.top : 0.35), 8);
            this.rings.push({ x: X, y: this.sy(w.raft ? w.raft.top : 0.35), t: 0, col: e.bull ? '#ffe36a' : '#ffffff' });
            if (!title) {
              this.text(e.bull ? 'Bullseye! +' + e.points : 'Landed! +' + e.points, X, Y - 1.1 * u, e.bull ? '#ffe36a' : '#ffffff', e.bull ? 1.3 : 1.05);
              if (e.streak >= 2) this.text('Streak ×' + e.streak, X, Y - 1.75 * u, '#ffb36b', 0.85);
            }
            if (e.bull) { this.flash = 0.35; this.flashCol = '#fff6c8'; }
            break;
          case 'splash': if (wx) wx.burst('splash', X, this.seaPx, 12); this.shake = Math.max(this.shake, 3); if (!title) this.text('Splash!', X, this.seaPx - 1.3 * u, '#d8f6ff'); break;
          case 'flop': if (wx) wx.burst('land', X, this.sy(1.2), 5); if (!title) this.text('Oops! Pull further', X + 0.6 * u, Y - 1.1 * u, '#ffffff', 0.85); break;
          case 'heartLost': this.heartPulse = -1; break;
          case 'heartGain': this.heartPulse = 1; if (!title) this.text('+1 ♥', this.VW / 2, this.VH * 0.32, '#ff8fa0', 1.2); break;
          case 'newShot': if (!this._flutterHinted && w.shots >= 2 && w.level === 0 && !title) this.hint = 'flutterSoon'; break;
          case 'levelUp': this.showBanner(e.zone); break;
          case 'night': if (!title && !this._nightHinted) { this._nightHinted = true; this.text('Night falls… follow the glowing leaves!', this.VW / 2, this.VH * 0.38, '#c9f6ff', 0.95, 3); } break;
          case 'dawn': if (!title) this.text('Good morning!', this.VW / 2, this.VH * 0.38, '#fff2a8', 1.05, 2); break;
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
      this.heartPulse *= Math.pow(0.02, dt); this.leafPulse = Math.max(0, this.leafPulse - dt * 3);
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter(t => t.t < t.life);
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter(r => r.t < 0.7);
      const L = this._leafHud || [60, 60];
      for (const f of this.flyers) { f.t += dt * 1.8; }
      this.flyers = this.flyers.filter(f => { if (f.t >= 1) { this.leafPulse = 1; return false; } return true; });
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
      if (this.weather && this.world) this.weather.setLight(this.world.light);
    }

    draw(mode) {
      const g = this.ctx, w = this.world;
      g.setTransform(this.px, 0, 0, this.px, 0, 0);
      if (!w) { g.fillStyle = '#86c6e6'; g.fillRect(0, 0, this.VW, this.VH); return; }
      const a = w.alpha || 0, v = this.vis;
      g.save();
      if (this.shake > 0.05) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      // sky (crossfade between islands), sun / moon / night sky
      this.drawSky(g, v.cur, 1);
      if (v.t < 1) this.drawSky(g, v.prev, 1 - v.t);
      this.drawCelestial(g);
      this.drawParticles(g, 'sky');
      this.drawLand(g, v.cur, 1);
      if (v.t < 1) this.drawLand(g, v.prev, 1 - v.t);
      this.drawWaves(g);
      this.drawNightTint(g);
      this.drawParticles(g, 'back');
      this.drawRaft(g, a);
      this.drawLeaves(g, a);
      this.drawGulls(g, a);
      this.drawSling(g, true);
      this.drawPreview(g);
      this.drawHero(g, a);
      if (w.phase === 'aim') this.drawSling(g, false);
      this.drawParticles(g, 'front');
      this.drawDarkness(g, a);
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
      for (const f of this.flyers) {   // collected leaves fly to the leaf counter on an arc
        const e = f.t * f.t * (3 - 2 * f.t), x = lerp(f.x, L[0], e), y = lerp(f.y, L[1], e) - Math.sin(f.t * Math.PI) * 60 * this.k, s = LEAF * this.unit * (1 - 0.45 * e);
        this.drawSpr(g, f.moon ? 'leaf_moon' : 'leaf', x, y, s, s, 0.5, 0.5, f.t * 6);
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
      // leaf counter: leaves toward the next heart
      const lx = x0 + 14, ly = y0 + 112, every = FIF.World.CONFIG.HEART_EVERY, toNext = w.leafCount % every;
      this._leafHud = [lx + 16, ly + 16];
      g.fillStyle = 'rgba(20,35,60,0.4)'; this._pill(g, x0, ly - 2, 150, 36); g.fill();
      this.drawSpr(g, 'leaf', lx + 16, ly + 16, 30 * (1 + 0.3 * this.leafPulse), 30 * (1 + 0.3 * this.leafPulse), 0.5, 0.5);
      g.fillStyle = '#e9ffd9'; g.font = `800 20px ${FONT}`; g.fillText(String(w.leafCount), lx + 38, ly + 17);
      g.fillStyle = 'rgba(255,255,255,0.25)'; g.fillRect(lx + 84, ly + 12, 48, 9);
      g.fillStyle = '#ff8fa0'; g.fillRect(lx + 84, ly + 12, 48 * toNext / every, 9);
      // island name + landings to the next island + a day dial (top centre)
      const cx = this.VW / 2, pal = PAL[FIF.Assets.SEASONS[w.zone]];
      const name = ZONE_INFO[w.zone].name + (w.loop ? ' ★' + (w.loop + 1) : '');
      g.font = `800 18px ${FONT}`; const tw = g.measureText(name).width;
      const pw = tw + 110, px = cx - pw / 2, py = y0 + (this.portrait ? 160 : 0);
      g.fillStyle = 'rgba(20,35,60,0.4)'; this._pill(g, px, py, pw, 40); g.fill();
      // day dial: sun / moon disc
      const dx = px + 22, dy = py + 20, nk = this.nightK();
      g.fillStyle = nk > 0.5 ? '#e8ecff' : '#ffd84a'; g.beginPath(); g.arc(dx, dy, 10, 0, TAU); g.fill();
      if (nk > 0.5) { g.fillStyle = 'rgba(20,35,60,0.9)'; g.beginPath(); g.arc(dx + 4, dy - 3, 8, 0, TAU); g.fill(); }
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(name, px + 40, py + 21);
      const per = FIF.World.CONFIG.LANDINGS_PER_LEVEL;
      for (let i = 0; i < per; i++) {   // raft pips: landings on this island
        g.fillStyle = i < w.levelLandings ? '#ffe36a' : 'rgba(255,255,255,0.3)';
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
      const sub = 'Island ' + (b.level + 1) + (b.loop ? ' · round ' + (b.loop + 1) : '');
      g.strokeText(sub, this.VW / 2, y - 30); g.fillStyle = '#fff'; g.fillText(sub, this.VW / 2, y - 30);
      g.font = `900 46px ${FONT}`; g.lineWidth = 8;
      g.strokeText(ZONE_INFO[b.s].name, this.VW / 2, y + 10); g.fillStyle = '#ffe36a'; g.fillText(ZONE_INFO[b.s].name, this.VW / 2, y + 10);
      g.font = `700 19px ${FONT}`; g.lineWidth = 5;
      g.strokeText(ZONE_INFO[b.s].hint, this.VW / 2, y + 50); g.fillStyle = '#fff'; g.fillText(ZONE_INFO[b.s].hint, this.VW / 2, y + 50);
      g.restore();
    }
    drawHints(g) {
      const w = this.world; if (!this.hint) return;
      const touch = FIF.Game && FIF.Game.isTouch;
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (this.hint === 'drag' && w.phase === 'aim' && !w.pull) {
        // a ghost hand drags back from Finn and lets go, on a loop
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
      } else if (this.hint === 'flutter' && w.phase === 'fly' && !w.fluttered) {
        const msg = touch ? 'Tap to flutter higher!' : 'Tap / Space to flutter!';
        g.font = `900 24px ${FONT}`; g.lineWidth = 6; g.strokeStyle = 'rgba(20,35,60,0.7)';
        g.strokeText(msg, this.VW / 2, this.VH * 0.2); g.fillStyle = '#ffe9a8'; g.fillText(msg, this.VW / 2, this.VH * 0.2);
      }
      g.restore();
    }
    drawDebug(g, a) {
      const w = this.world, u = this.unit, C = FIF.World.CONFIG;
      g.save(); g.lineWidth = 2;
      const P = this.foxPos(a);
      g.strokeStyle = '#f0f'; g.beginPath(); g.arc(this.sx(P.x), this.sy(P.y), C.R_FOX * u, 0, TAU); g.stroke();
      g.strokeStyle = '#0f0'; for (const l of w.leaves) { g.beginPath(); g.arc(this.sx(l.x), this.sy(l.y), C.R_LEAF * u, 0, TAU); g.stroke(); }
      g.strokeStyle = '#ff0'; for (const gl of w.gulls) { g.beginPath(); g.arc(this.sx(gl.x), this.sy(gl.y), gl.r * u, 0, TAU); g.stroke(); }
      const r = w.raft; g.strokeStyle = '#0ff'; g.beginPath(); g.moveTo(this.sx(r.x - r.hw - C.LAND_PAD), this.sy(r.top)); g.lineTo(this.sx(r.x + r.hw + C.LAND_PAD), this.sy(r.top)); g.stroke();
      g.strokeStyle = '#f00'; g.beginPath(); g.moveTo(this.sx(r.x - r.bull), this.sy(r.top) - 4); g.lineTo(this.sx(r.x + r.bull), this.sy(r.top) - 4); g.stroke();
      g.fillStyle = '#fff'; g.font = '12px monospace'; g.textAlign = 'left';
      g.fillText(`phase ${w.phase} day ${w.dayT.toFixed(2)} light ${w.light.toFixed(2)} px ${this.px.toFixed(2)}`, 10, this.VH - 10);
      g.restore();
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  FIF.Renderer = Renderer;
})(window.FIF = window.FIF || {});
