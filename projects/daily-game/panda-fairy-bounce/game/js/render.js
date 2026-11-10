/* MFB.Renderer — Mochi's Fairy Bounce on a 2D canvas (DESIGN §2, §5). A fixed camera maps the world field
 * (x 0…16 u, y up, ground y 0, ceiling 8.6) to the screen: landscape unit = min(VH/9.1, VW/16.4), field centred,
 * ground 0.4 u above the bottom edge. Per season the sky + far trees + near forest floor are pre-rendered once into a
 * device-pixel canvas and blitted pixel-exact; season changes crossfade. Everything that moves is lerped with
 * world.alpha. Sprites are cached per size by MFB.Assets. Juice: block chips, popups, rings, feathers, a ball trail,
 * cap squash, screen shake, a flash and a season banner. */
(function (MFB) {
  'use strict';
  const PAL = {
    spring: { skyTop: '#b8dcef', skyBottom: '#fce9ee', ink: '#3b4767', bar: '#fff7fa', glow: '#ffc8dd', ground: '#8a6a52' },
    summer: { skyTop: '#a3d6e0', skyBottom: '#fde3a8', ink: '#4a3a1e', bar: '#fffaea', glow: '#ffd76a', ground: '#7c5e42' },
    autumn: { skyTop: '#8a82bf', skyBottom: '#f8bd8c', ink: '#3b2240', bar: '#fff0e2', glow: '#ffab5a', ground: '#6e4a3a' },
    winter: { skyTop: '#16214b', skyBottom: '#4562a0', ink: '#1b2450', bar: '#e7efff', glow: '#9fe8ff', ground: '#c9d6ee' }
  };
  const ZONE_INFO = [
    { key: 'spring', name: 'Spring Meadow', hint: 'Slide to move Mochi · tap to serve!' },
    { key: 'summer', name: 'Summer Glade', hint: 'Hit the ball with the edge of the cap to send it sideways!' },
    { key: 'autumn', name: 'Autumn Hollow', hint: 'Catch the falling stars for a heart!' },
    { key: 'winter', name: 'Winter Glow', hint: 'Bonk Hoot 3 times to tickle him!' }
  ];
  ZONE_INFO.forEach(z => { const p = PAL[z.key]; z.top = p.skyTop; z.bottom = p.skyBottom; z.pal = p; });
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const MOCHI = 1.35, BALL = 0.6, STAR = 0.7, OWL_W = 1.5, OWL_H = 1.25, PILLOW_W = 0.75, PILLOW_H = 0.56;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.texts = []; this.flyers = []; this.rings = []; this.trail = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fffaf0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.heartPulse = 0; this.starPulse = 0; this.capSquash = 0; this.netFlash = 0; this.brickIn = 9; this.zzzT = 0;
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
      const dpr = window.devicePixelRatio || 1, touch = !!(MFB.Game && MFB.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._spr.clear();
      this.portrait = v.VH > v.VW;
      if (this.portrait) { this.unit = v.VW / 16.4; this.groundPx = Math.round(v.VH / 2 + 4.6 * this.unit); }
      else { this.unit = Math.min(v.VH / 9.1, v.VW / 16.4); this.groundPx = Math.round(v.VH - 0.4 * this.unit); }
      this.ox = (v.VW - 16 * this.unit) / 2;
      this.k = this.unit / 60;   // the art was drawn for 60 px per unit
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 8) * S) + 'px'; hud.style.right = (v.left + (I.right + 8) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      this._syncWeather();
      MFB.Assets.setScale(this.px);
    }
    _syncWeather() { const wx = this.weather; if (wx) { if (wx.resize) wx.resize(this.VW, this.VH); if (wx.setGround) wx.setGround(this.groundPx); } }
    _measureHud() {}
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    /* screen px → world x (u) for the pointer */
    toWorldX(lx) { return (lx - this.ox) / this.unit; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.texts.length = 0; this.flyers.length = 0; this.rings.length = 0; this.trail.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heartPulse = 0; this.starPulse = 0; this.capSquash = 0; this.netFlash = 0;
      this.brickIn = 0; this.hint = world && (world.level || 0) === 0;
      this._syncWeather();
    }
    setLevel(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(z) { this.banner = { s: z, t: 0, loop: this.world ? this.world.loop || 0 : 0 }; }

    // ---------------- mapping ----------------
    sx(x) { return this.ox + x * this.unit; }
    sy(y) { return this.groundPx - y * this.unit; }

    // ---------------- sprites ----------------
    spr(key, w, h) {
      const W = Math.max(4, Math.round(w)), H = Math.max(4, Math.round(h)), ck = key + '|' + W + '|' + H;
      let c = this._spr.get(ck);
      if (c) return c;
      c = MFB.Assets.sprite(key, W, H);
      if (c) { if (this._spr.size > 500) this._spr.clear(); this._spr.set(ck, c); }
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
    /* a custom picture fitted into a box (keeps its aspect), else the default sprite */
    drawSlot(g, slot, defKey, cx, cy, bw, bh, ax, ay, rot, sx, sy) {
      if (MFB.Assets.hasCustom(slot)) {
        const [w, h] = MFB.Assets.fit(slot, bw, bh);
        return this.drawSpr(g, 'custom:' + slot, cx, cy + (ay - 0.5) * (bh - h), w, h, ax, ay, rot, sx, sy);
      }
      return this.drawSpr(g, defKey, cx, cy, bw, bh, ax, ay, rot, sx, sy);
    }

    // ---------------- pre-rendered season backgrounds (device px) ----------------
    _slot(b) { return MFB.Assets.SLOTS[3 + b].id; }
    _custom(b) { return MFB.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (MFB.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
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
      const A = MFB.Assets, n = A.SEASONS[b], pal = PAL[n], P = this.px, W = this.VW, H = this.VH, k = this.k, gy = this.groundPx;
      const c = document.createElement('canvas'); c.width = Math.round(W * P); c.height = Math.round(H * P);
      const g = c.getContext('2d'); g.scale(P, P); g.imageSmoothingQuality = 'high';
      const gr = g.createLinearGradient(0, 0, 0, gy); gr.addColorStop(0, pal.skyTop); gr.addColorStop(1, pal.skyBottom);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const custom = this._custom(b) ? A.custom[this._slot(b)] : null;
      const cover = (img, iw, ih, bottom) => { const s = Math.max(W / iw, bottom / ih); g.drawImage(img, (W - iw * s) / 2, bottom - ih * s, iw * s, ih * s); };
      // tiles at whole device pixels so the seams never show a hairline
      const tile = (img, iw, ih, top) => {
        if (!img) return;
        const w = Math.round(iw * k * P) / P, h = ih * k;
        const x0 = Math.round(((W - w) / 2 % w - w) * P) / P;   // centre one tile, so the clumps at the tile edges sit at both screen sides
        for (let x = x0; x < W; x += w) g.drawImage(img, x, top, w + 1 / P, h);
      };
      if (custom) {
        cover(custom, custom.width, custom.height, gy + 10 * k);
        g.fillStyle = 'rgba(250,245,255,0.38)'; g.fillRect(0, 0, W, gy);   // a pale veil keeps a busy photo behind the play
        g.fillStyle = pal.ground; g.fillRect(0, gy, W, H - gy);
        g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, gy, W, 3 * k);
      } else {
        if (A.img[n + '_sky']) cover(A.img[n + '_sky'], 960, 540, Math.max(gy + 24 * k, H * 0.9));
        tile(A.img[n + '_far'], 960, 300, gy - 56 * k - 300 * k);
        g.fillStyle = pal.ground; g.fillRect(0, gy + 40 * k, W, H);
        tile(A.img[n + '_near'], 960, 200, gy - 150 * k);
      }
      bg = { c, b };
      this._bg.set(key, bg);
      if (this._bg.size > 6) { const first = this._bg.keys().next().value; this._bg.delete(first); }
      return bg;
    }
    drawBg(g, b, alpha) {
      const bg = this.background(b);
      g.save(); g.globalAlpha = alpha; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(bg.c, 0, 0); g.restore();
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world; if (!w) return;
      const u = this.unit;
      for (const e of evts) {
        switch (e.type) {
          case 'brick': {
            const X = this.sx(e.x), Y = this.sy(e.y), z = MFB.Assets.SEASONS[(e.zone != null ? e.zone : w.zone) % 4];
            const n = e.broken ? 7 : 3;
            for (let i = 0; i < n; i++) this.flyers.push({ key: 'p_chip_' + z, x: X + (Math.random() - 0.5) * 0.9 * u, y: Y, vx: (Math.random() - 0.5) * 5 * u, vy: -(1.5 + Math.random() * 3) * u, g: 14 * u, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10, size: (0.22 + Math.random() * 0.14) * u, life: 0.9, t: 0 });
            if (e.broken) this.rings.push({ x: X, y: Y, r0: 0.2 * u, r1: 1.0 * u, t: 0, life: 0.35, col: e.kind === 'star' ? '#ffe27a' : '#ffffff' });
            if (e.pts) this.popup(X, Y, '+' + e.pts, e.combo >= 3 ? '#ffe36a' : '#ffffff', e.combo >= 3 ? 1.15 : 0.9);
            break;
          }
          case 'combo': this.popup(this.sx(w.ball ? w.ball.x : 8), this.sy(w.ball ? w.ball.y + 0.8 : 4), 'Combo ×' + e.n + '!', '#ffcf3f', 1.3); break;
          case 'paddle': this.capSquash = 1; this.rings.push({ x: this.sx(e.x), y: this.sy(e.y || w.paddle.y), r0: 0.1 * u, r1: 0.6 * u, t: 0, life: 0.25, col: '#fff3c4' }); break;
          case 'wall': this.rings.push({ x: this.sx(e.x), y: this.sy(e.y), r0: 0.05 * u, r1: 0.35 * u, t: 0, life: 0.2, col: '#ffffff' }); break;
          case 'starCatch':
            this.starPulse = 1; this.popup(this.sx(e.x), this.sy(e.y + 0.6), '+' + e.pts, '#ffe36a', 1.15);
            this.sparkle(this.sx(e.x), this.sy(e.y), 9, '#ffe36a'); break;
          case 'bossHit':
            this.popup(this.sx(e.x), this.sy(e.y - 0.7), e.pts ? '+' + e.pts : 'Hoo!', '#ffffff', 1);
            this.feathers(this.sx(e.x), this.sy(e.y), 4); break;
          case 'bossTickled':
            this.popup(this.sx(e.x), this.sy(e.y - 1.1), 'Tickled! +' + e.pts, '#ffcf3f', 1.4);
            this.feathers(this.sx(e.x), this.sy(e.y), 12); this.flash = 0.35; this.flashCol = '#fff6d8'; break;
          case 'pillowHit':
            this.feathers(this.sx(e.x), this.sy(1.4), 10); this.shake = Math.max(this.shake, 0.25);
            this.popup(this.sx(e.x), this.sy(2.4), 'Sleepy…', '#d9d2ff', 1); break;
          case 'pillowPop':
            this.feathers(this.sx(e.x), this.sy(e.y), 8);
            if (e.pts) this.popup(this.sx(e.x), this.sy(e.y + 0.4), '+' + e.pts, '#ffffff', 0.9); break;
          case 'pillowLand': this.puff(this.sx(e.x), this.sy(0.15)); break;
          case 'net': this.netFlash = 1; this.rings.push({ x: this.sx(e.x), y: this.sy(0.3), r0: 0.1 * u, r1: 1.2 * u, t: 0, life: 0.45, col: '#b8ffb0' }); this.sparkle(this.sx(e.x), this.sy(0.3), 8, '#c8ffb8'); break;
          case 'ballLost': this.shake = 0.45; this.popup(this.sx(clamp(e.x, 1, 15)), this.sy(1.9), 'Oops!', '#ffd0d8', 1.2); break;
          case 'heartLost': this.heartPulse = -1; break;
          case 'heartGain': this.heartPulse = 1; this.popup(this.sx(w.paddle.x), this.sy(2.9), '+1 ♥', '#ff8fae', 1.2); break;
          case 'levelClear': this.flash = 0.5; this.flashCol = '#fffbe8'; for (let i = 0; i < 4; i++) this.sparkle(this.sx(2 + Math.random() * 12), this.sy(4 + Math.random() * 3), 8, '#ffe36a'); break;
          case 'levelUp': this.brickIn = 0; this.showBanner(e.zone); this.hint = false; break;
        }
      }
    }
    popup(x, y, s, col, sc) { if (this.texts.length > 30) this.texts.shift(); this.texts.push({ x, y, s, col, sc: sc || 1, t: 0, life: 1.1 }); }
    sparkle(x, y, n, col) {
      const u = this.unit;
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = (1.5 + Math.random() * 2.5) * u; this.flyers.push({ key: 'p_sparkle', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - u, g: 3 * u, drag: 2.5, rot: 0, spin: 3, size: (0.22 + Math.random() * 0.2) * u, life: 0.7, t: 0 }); }
    }
    feathers(x, y, n) {
      const u = this.unit;
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = (1 + Math.random() * 2.5) * u; this.flyers.push({ key: 'p_feather', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.8 * u, g: 1.2 * u, drag: 2.2, sway: 1, ph: Math.random() * 6, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 3, size: (0.3 + Math.random() * 0.15) * u, life: 1.6, t: 0 }); }
    }
    puff(x, y) { const u = this.unit; for (let i = 0; i < 4; i++) this.flyers.push({ key: 'p_puff', x: x + (i - 1.5) * 0.25 * u, y, vx: (i - 1.5) * 0.8 * u, vy: -0.4 * u, g: 0, drag: 2, rot: 0, spin: 0, size: 0.45 * u, grow: 0.6, life: 0.55, t: 0 }); }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.1);
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.flash = Math.max(0, this.flash - dt * 1.8);
      this.capSquash = Math.max(0, this.capSquash - dt * 5);
      this.netFlash = Math.max(0, this.netFlash - dt * 2);
      this.starPulse = Math.max(0, this.starPulse - dt * 3);
      this.heartPulse = this.heartPulse > 0 ? Math.max(0, this.heartPulse - dt * 2) : Math.min(0, this.heartPulse + dt * 2);
      this.brickIn += dt;
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
      for (const f of this.flyers) {
        f.t += dt; f.vy += (f.g || 0) * dt;
        if (f.drag) { const d = Math.exp(-f.drag * dt); f.vx *= d; f.vy *= d; }
        f.x += f.vx * dt + (f.sway ? Math.sin(f.t * 4 + f.ph) * 0.6 * this.unit * dt : 0); f.y += f.vy * dt; f.rot += f.spin * dt;
        if (f.grow) f.size *= 1 + f.grow * dt;
      }
      this.flyers = this.flyers.filter(f => f.t < f.life);
      if (this.flyers.length > 160) this.flyers.splice(0, this.flyers.length - 160);
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter(t => t.t < t.life);
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter(r => r.t < r.life);
      const w = this.world;
      if (w && w.paddle && w.paddle.sleepy > 0) {
        this.zzzT -= dt;
        if (this.zzzT <= 0) { this.zzzT = 0.45; const u = this.unit; this.flyers.push({ key: 'p_zzz', x: this.sx(w.paddle.x + 0.3), y: this.sy(1.1), vx: 0.35 * u, vy: -0.7 * u, g: 0, rot: 0, spin: 0, sway: 1, ph: 0, size: 0.32 * u, grow: 0.5, life: 1.2, t: 0 }); }
      }
      // ball trail (render positions)
      if (w && w.ball && !w.ball.onPaddle) {
        const b = w.ball; this.trail.push([b.x, b.y]); if (this.trail.length > 9) this.trail.shift();
      } else this.trail.length = 0;
    }

    // ---------------- draw ----------------
    draw(mode) {
      const g = this.ctx, w = this.world, P = this.px;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      // background (crossfade between seasons)
      const v = this.vis;
      this.drawBg(g, v.cur, 1);
      if (v.t < 1 && v.prev !== v.cur) this.drawBg(g, v.prev, 1 - easeOut(v.t));
      let shx = 0, shy = 0;
      if (this.shake > 0) { const s = this.shake * 0.14 * this.unit; shx = Math.sin(this.time * 71) * s; shy = Math.cos(this.time * 53) * s; }
      g.setTransform(P, 0, 0, P, shx * P, shy * P);
      if (this.weather) this.drawParticles(g, 'back');
      if (w) {
        const a = w.alpha || 0;
        this.drawNet(g, w);
        this.drawBricks(g, w);
        this.drawStars(g, w, a);
        this.drawBoss(g, w, a);
        this.drawPillows(g, w, a);
        this.drawBall(g, w, a);
        this.drawMochi(g, w, a);
        this.drawFlyers(g);
        if (this.debug) this.drawDebug(g, w);
      }
      if (this.weather) this.drawParticles(g, 'front');
      g.setTransform(P, 0, 0, P, 0, 0);
      if (w) this.drawTexts(g);
      if (this.flash > 0) { g.save(); g.globalAlpha = Math.min(0.6, this.flash); g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.restore(); }
      if (w && mode !== 'title') { this.drawHud(g, w); this.drawHints(g, w, mode); }
      if (this.banner && mode !== 'title') this.drawBanner(g);
    }

    drawParticles(g, layer) {
      for (const p of this.weather.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const sx = (p.flipX ? -1 : 1) * (p.flap != null ? 0.35 + 0.65 * p.flap : 1);
        this.drawSpr(g, p.sprite, p.x, p.y, p.size, p.size, 0.5, 0.5, p.rot, sx, 1, p.alpha);
      }
    }

    drawNet(g, w) {
      const n = w.net ? w.net.saves : 0;
      if (n <= 0 && this.netFlash <= 0) return;
      const y = this.sy(0.3), x0 = this.sx(0.1), x1 = this.sx(15.9), u = this.unit, t = this.time;
      g.save();
      g.globalAlpha = n > 0 ? 0.75 + 0.25 * this.netFlash : this.netFlash;
      g.lineCap = 'round';
      g.strokeStyle = 'rgba(190,255,170,0.35)'; g.lineWidth = 0.22 * u;
      const path = () => { g.beginPath(); for (let x = x0; x <= x1 + 1; x += 8) { const yy = y + Math.sin(x * 0.045 + t * 1.6) * 0.06 * u; x === x0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } };
      path(); g.stroke();
      g.strokeStyle = '#5fbf62'; g.lineWidth = 0.07 * u; path(); g.stroke();
      // a leaf + glow bud per save left
      for (let i = 0; i < 6; i++) {
        const x = lerp(x0, x1, (i + 0.5) / 6), yy = y + Math.sin(x * 0.045 + t * 1.6) * 0.06 * u;
        g.fillStyle = '#7fd27a'; g.beginPath(); g.ellipse(x, yy - 0.08 * u, 0.13 * u, 0.06 * u, -0.5, 0, TAU); g.fill();
      }
      for (let i = 0; i < n; i++) {
        const x = this.sx(8 + (i - (n - 1) / 2) * 1.2), yy = y + Math.sin(x * 0.045 + t * 1.6) * 0.06 * u;
        const r = (0.14 + 0.03 * Math.sin(t * 4 + i)) * u;
        g.fillStyle = 'rgba(220,255,200,0.45)'; g.beginPath(); g.arc(x, yy, r * 2, 0, TAU); g.fill();
        g.fillStyle = '#eaffd8'; g.beginPath(); g.arc(x, yy, r, 0, TAU); g.fill();
      }
      g.restore();
    }

    brickKey(b, zone) {
      const z = MFB.Assets.SEASONS[zone];
      if (b.kind === 'star') return 'brick_star';
      if (b.kind === 'tough') return b.hp >= 2 ? 'brick_' + z + '_tough' : 'brick_' + z + '_crack';
      return 'brick_' + z;
    }
    drawBricks(g, w) {
      const u = this.unit, zone = w.zone % 4, bw = 1.4 * u, bh = 0.5 * u;
      for (const b of w.bricks) {
        if (!b.alive) continue;
        let X = this.sx(b.x), Y = this.sy(b.y), al = 1, sc = 1;
        // the season's blocks drop in row by row
        const d = this.brickIn - ((b.row || 0) * 0.07 + (b.col || 0) * 0.025);
        if (d < 0.45) { const e = easeOut(d / 0.45); Y -= (1 - e) * 2.4 * u; al = clamp(d / 0.2, 0, 1); }
        if (b.hitT != null && b.hitT < 0.3) sc = 1 + 0.12 * Math.sin(b.hitT * 30) * (1 - b.hitT / 0.3);
        if (al <= 0) continue;
        this.drawSpr(g, this.brickKey(b, zone), X, Y, bw, bh, 0.5, 0.5, 0, sc, 2 - sc, al);
        if (b.kind === 'star') {   // a soft glint sweeping across star blocks
          const ph = (this.time * 0.5 + b.x * 0.13) % 1;
          if (ph < 0.25) { g.save(); g.globalAlpha = 0.5 * Math.sin(ph / 0.25 * Math.PI) * al; g.fillStyle = '#fff'; g.beginPath(); g.arc(X - bw / 2 + ph / 0.25 * bw, Y, 0.12 * u, 0, TAU); g.fill(); g.restore(); }
        }
      }
    }
    drawStars(g, w, a) {
      const u = this.unit, s = STAR * u;
      for (const st of w.stars) {
        const x = this.sx(lerp(st.px, st.x, a)), y = this.sy(lerp(st.py, st.y, a));
        g.save(); g.globalAlpha = 0.35 + 0.15 * Math.sin(this.time * 6 + st.id); g.fillStyle = '#fff3b0';
        g.beginPath(); g.arc(x, y, s * 0.62, 0, TAU); g.fill(); g.restore();
        this.drawSlot(g, 'star', 'star', x, y, s, s, 0.5, 0.5, -st.rot);
      }
    }
    drawBoss(g, w, a) {
      const b = w.boss; if (!b) return;
      const u = this.unit, x = this.sx(lerp(b.px, b.x, a)), y = this.sy(lerp(b.py, b.y, a));
      const key = b.state === 'throw' ? 'owl_throw' : b.state === 'giggle' ? 'owl_giggle' : (b.flap < 0.5 ? 'owl_1' : 'owl_0');
      let rot = 0, sx = 1, sy = 1;
      if (b.state === 'giggle') { rot = Math.sin(this.time * 24) * 0.12; sx = 1.06; sy = 0.95; }
      if (b.state === 'throw') { rot = -0.08; }
      // a little "warning" glow when a pillow is about to come
      if (b.nextThrow < 1.5 && b.state === 'float' && w.phase === 'play') {
        g.save(); g.globalAlpha = 0.35 * (1 - b.nextThrow / 1.5) * (0.6 + 0.4 * Math.sin(this.time * 14)); g.fillStyle = '#ffd6e2';
        g.beginPath(); g.arc(x, y, 0.95 * u, 0, TAU); g.fill(); g.restore();
      }
      this.drawSpr(g, key, x, y, OWL_W * u, OWL_H * u, 0.5, 0.5, rot, sx, sy);
    }
    drawPillows(g, w, a) {
      const u = this.unit;
      for (const p of w.pillows) {
        const x = this.sx(lerp(p.px, p.x, a)), y = this.sy(lerp(p.py, p.y, a));
        // shadow on the ground where it will land (grows as it comes down)
        const k = clamp(1 - p.y / 8, 0.15, 1);
        g.save(); g.globalAlpha = 0.18 + 0.3 * k; g.fillStyle = '#3a2a4a';
        g.beginPath(); g.ellipse(this.sx(p.landX), this.sy(0) - 0.04 * u, (0.25 + 0.3 * k) * u, (0.07 + 0.06 * k) * u, 0, 0, TAU); g.fill(); g.restore();
        this.drawSpr(g, 'pillow', x, y, PILLOW_W * u, PILLOW_H * u, 0.5, 0.5, -p.rot);
      }
    }
    drawBall(g, w, a) {
      const b = w.ball; if (!b) return;
      const u = this.unit, x = this.sx(lerp(b.px, b.x, a)), y = this.sy(lerp(b.py, b.y, a));
      // trail
      g.save();
      for (let i = 0; i < this.trail.length - 1; i++) {
        const [tx, ty] = this.trail[i], k = (i + 1) / this.trail.length;
        g.globalAlpha = 0.28 * k; g.fillStyle = '#fff1b0';
        g.beginPath(); g.arc(this.sx(tx), this.sy(ty), b.r * u * (0.5 + 0.5 * k), 0, TAU); g.fill();
      }
      g.restore();
      const s = BALL * u * (1 + 0.04 * Math.sin(this.time * 9));
      if (MFB.Assets.hasCustom('ball')) {
        g.save(); g.globalAlpha = 0.5; g.fillStyle = '#ffe9a0'; g.beginPath(); g.arc(x, y, s * 0.55, 0, TAU); g.fill(); g.restore();
        this.drawSlot(g, 'ball', 'ball', x, y, s * 0.8, s * 0.8, 0.5, 0.5, (b.spin || 0) * 0 + this.time * 2);
      } else this.drawSpr(g, 'ball', x, y, s, s, 0.5, 0.5);
    }
    drawMochi(g, w, a) {
      const p = w.paddle, u = this.unit;
      const x = this.sx(lerp(p.px, p.x, a)), gy = this.sy(0);
      const face = p.face || 'idle';
      const custom = MFB.Assets.hasCustom('hero');
      const step = Math.abs(p.vx) > 1.5 ? Math.abs(Math.sin(this.time * 14)) * 0.05 * u : 0;
      const breathe = 1 + 0.015 * Math.sin(this.time * 3);
      const H = MOCHI * u;
      // ground shadow
      g.save(); g.globalAlpha = 0.25; g.fillStyle = '#2a1d3a';
      g.beginPath(); g.ellipse(x, gy - 0.02 * u, 0.55 * u, 0.09 * u, 0, 0, TAU); g.fill(); g.restore();
      if (custom) {
        const bob = Math.sin(this.time * 5) * 0.04 * u;
        this.drawSlot(g, 'hero', 'mochi_idle', x, gy - 0.05 * u + bob - step, 1.25 * u, 1.15 * u, 0.5, 1, Math.max(-0.12, Math.min(0.12, -p.vx * 0.01)), 1, breathe);
      } else {
        this.drawSpr(g, 'mochi_' + face, x, gy + (4 / 120) * H - step, H, H, 0.5, 1, 0, 1, breathe);
      }
      // the cap: art y 12 (bounce line) on world y 1.35; squash when the ball hits it
      const W = p.w * u, Hc = 0.3 * p.w * u, sq = this.capSquash;
      const top = this.sy(p.y) - (12 / 72) * Hc;
      const sxk = 1 + 0.07 * sq, syk = 1 - 0.16 * sq;
      this.drawSpr(g, 'cap', x, top + (12 / 72) * Hc, W, Hc, 0.5, 12 / 72, 0, sxk, syk);
      if (p.sleepy > 0) { g.save(); g.globalAlpha = 0.18; g.fillStyle = '#6a5acd'; g.beginPath(); g.ellipse(x, gy - 0.6 * u, 0.8 * u, 0.75 * u, 0, 0, TAU); g.fill(); g.restore(); }
    }
    drawFlyers(g) {
      for (const f of this.flyers) {
        const al = clamp(1 - f.t / f.life, 0, 1) * (f.t < 0.06 ? f.t / 0.06 : 1);
        this.drawSpr(g, f.key, f.x, f.y, f.size, f.size, 0.5, 0.5, f.rot, 1, 1, al);
      }
      for (const r of this.rings) {
        const k = r.t / r.life;
        g.save(); g.globalAlpha = (1 - k) * 0.8; g.strokeStyle = r.col; g.lineWidth = Math.max(1, 0.06 * this.unit * (1 - k));
        g.beginPath(); g.arc(r.x, r.y, lerp(r.r0, r.r1, easeOut(k)), 0, TAU); g.stroke(); g.restore();
      }
    }
    drawTexts(g) {
      const u = this.unit;
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const k = t.t / t.life, pop = k < 0.15 ? 0.6 + 0.4 * easeOut(k / 0.15) * 1.15 : 1;
        const size = 0.42 * u * t.sc * pop;
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = '900 ' + size.toFixed(1) + 'px ' + FONT;
        const y = t.y - easeOut(k) * 0.8 * u;
        g.lineWidth = size * 0.22; g.strokeStyle = 'rgba(58,42,74,0.9)'; g.strokeText(t.s, t.x, y);
        g.fillStyle = t.col; g.fillText(t.s, t.x, y);
      }
      g.restore();
    }

    pill(g, x, y, w, h, col) {
      const r = h / 2;
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); g.closePath();
      g.fillStyle = col; g.fill();
    }
    drawHud(g, w) {
      const pal = PAL[MFB.Assets.SEASONS[w.zone % 4]], I = this.ins;
      const s = Math.max(0.8, Math.min(1.15, this.VH / 540)) * (this.portrait ? 1.25 : 1);
      const x0 = 10 + I.left, y0 = 8 + I.top, h = 34 * s;
      g.save();
      g.font = '900 ' + (22 * s).toFixed(1) + 'px ' + FONT; g.textBaseline = 'middle';
      const sc = String(w.score), tw = g.measureText(sc).width;
      const heartsW = w.maxHearts * 22 * s, starW = 80 * s;
      const W = 18 * s + tw + 14 * s + heartsW + starW;
      g.globalAlpha = 0.86; this.pill(g, x0, y0, W, h, pal.bar); g.globalAlpha = 1;
      g.fillStyle = '#3a2a4a'; g.fillText(sc, x0 + 14 * s, y0 + h / 2 + 1);
      let hx = x0 + 14 * s + tw + 14 * s;
      for (let i = 0; i < w.maxHearts; i++) {
        const full = i < w.hearts;
        if (!full && i >= Math.max(3, w.hearts + 1)) continue;   // show empty slots up to 3 (the start), more only when earned
        let sz = 20 * s;
        if (this.heartPulse > 0 && i === w.hearts - 1) sz *= 1 + 0.4 * this.heartPulse;
        if (this.heartPulse < 0 && i === w.hearts) sz *= 1 + 0.4 * -this.heartPulse;
        this.drawSpr(g, full ? 'heart' : 'heart_empty', hx + 10 * s, y0 + h / 2, sz, sz, 0.5, 0.5);
        hx += 22 * s;
      }
      hx += 6 * s;
      const ss = 22 * s * (1 + 0.35 * this.starPulse);
      this.drawSlot(g, 'star', 'star', hx + 10 * s, y0 + h / 2, ss, ss, 0.5, 0.5, 0);
      g.font = '900 ' + (17 * s).toFixed(1) + 'px ' + FONT; g.fillStyle = '#3a2a4a';
      g.fillText(String(w.starCount % 10) + '/10', hx + 23 * s, y0 + h / 2 + 1);
      g.restore();
    }
    drawHints(g, w, mode) {
      if (mode !== 'playing') return;
      const u = this.unit, touch = !!(MFB.Game && MFB.Game.isTouch);
      if (w.phase === 'serve' && w.ball) {
        const x = this.sx(w.paddle.x), y = this.sy(w.paddle.y + 1.25);
        const msg = touch ? 'Tap to serve!' : 'Click or Space to serve!';
        g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
        const size = 0.4 * u * (this.portrait ? 1.2 : 1), bob = Math.sin(this.time * 4) * 0.08 * u;
        g.font = '900 ' + size.toFixed(1) + 'px ' + FONT;
        g.globalAlpha = 0.95; g.lineWidth = size * 0.24; g.strokeStyle = 'rgba(58,42,74,0.85)'; g.strokeText(msg, clamp(x, 3 * u, this.VW - 3 * u), y + bob);
        g.fillStyle = '#ffffff'; g.fillText(msg, clamp(x, 3 * u, this.VW - 3 * u), y + bob);
        if (this.hint) {
          const m2 = touch ? '← slide to move Mochi →' : '← move the mouse or use the arrow keys →';
          g.font = '800 ' + (size * 0.75).toFixed(1) + 'px ' + FONT; g.lineWidth = size * 0.18;
          g.strokeText(m2, this.VW / 2, this.sy(2.9)); g.fillStyle = '#fff6c8'; g.fillText(m2, this.VW / 2, this.sy(2.9));
        }
        g.restore();
      }
      if (w.phase === 'clear') {
        const k = clamp((2 - (w.clearT || 0)) / 0.3, 0, 1);
        this.bigText(g, 'Season cleared!', this.VW / 2, this.sy(4.6), 0.9 * u * (0.6 + 0.4 * easeOut(k)), '#ffe36a', k);
      }
    }
    bigText(g, s, x, y, size, col, al) {
      g.save(); g.globalAlpha = al; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.font = '900 ' + size.toFixed(1) + 'px ' + FONT;
      g.lineWidth = size * 0.2; g.strokeStyle = '#4a2a6e'; g.strokeText(s, x, y);
      g.fillStyle = col; g.fillText(s, x, y); g.restore();
    }
    drawBanner(g) {
      const b = this.banner, z = ZONE_INFO[b.s % 4], u = this.unit, t = b.t;
      const al = t < 0.3 ? t / 0.3 : t > 2.1 ? Math.max(0, (2.6 - t) / 0.5) : 1;
      const y = this.sy(3.0);
      const name = z.name + (b.loop > 0 ? ' · round ' + (b.loop + 1) : '');
      this.bigText(g, name, this.VW / 2, y, 0.75 * u * (this.portrait ? 1.1 : 1), '#ffffff', al);
      g.save(); g.globalAlpha = al * 0.95; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const s2 = 0.34 * u * (this.portrait ? 1.15 : 1);
      g.font = '800 ' + s2.toFixed(1) + 'px ' + FONT; g.lineWidth = s2 * 0.22; g.strokeStyle = 'rgba(58,42,74,0.85)';
      g.strokeText(z.hint, this.VW / 2, y + 0.7 * u); g.fillStyle = '#fff6c8'; g.fillText(z.hint, this.VW / 2, y + 0.7 * u);
      g.restore();
    }
    drawDebug(g, w) {
      const u = this.unit;
      g.save(); g.lineWidth = 1; g.strokeStyle = '#f0f';
      for (const b of w.bricks) if (b.alive) g.strokeRect(this.sx(b.x - b.w / 2), this.sy(b.y + b.h / 2), b.w * u, b.h * u);
      if (w.ball) { g.beginPath(); g.arc(this.sx(w.ball.x), this.sy(w.ball.y), w.ball.r * u, 0, TAU); g.stroke(); }
      const p = w.paddle; g.strokeStyle = '#0ff'; g.beginPath(); g.moveTo(this.sx(p.x - p.w / 2), this.sy(p.y)); g.lineTo(this.sx(p.x + p.w / 2), this.sy(p.y)); g.stroke();
      if (w.boss) { g.beginPath(); g.arc(this.sx(w.boss.x), this.sy(w.boss.y), 0.55 * u, 0, TAU); g.stroke(); }
      g.strokeStyle = '#ff0'; g.strokeRect(this.sx(0), this.sy(8.6), 16 * u, 8.6 * u);
      g.restore();
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  MFB.Renderer = Renderer;
})(window.MFB = window.MFB || {});
