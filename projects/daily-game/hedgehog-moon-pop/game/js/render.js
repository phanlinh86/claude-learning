/* MP.Renderer — mobile-first: the canvas fills the screen in portrait and landscape (logical VW×VH, see
 * resize()). The 960×540 "scene" (Moon floor at y 492, escape line at y 60) is bottom-anchored and centred inside
 * it; the sky and haze are extended to the sides / top, the floor is mirrored to the sides, and the HUD is laid out
 * in screen space around the safe-area insets (notch, home bar).
 * Draw order (DESIGN §2): sky → far → drifting haze → back particles → ground → vent craters → pebble shadow
 * rings → bubbles (item, then film) → board → Bristle → falling pebbles → front particles → fx → HUD → banner.
 * Performance rules from the sister games apply (pixel-exact layer blits, interpolation, cached gradients,
 * pre-warm, capped backing store, adaptive quality). */
(function (MP) {
  'use strict';
  const W = 960, H = 540;   // the scene (all gameplay coordinates); the canvas is this.VW × this.VH
  const ZONE_INFO = [
    { key: 'dawn', name: 'Dawn — Earthrise', short: 'Dawn', color: '#e9849a', dark: '#6a2a48', hint: 'Skate into the bubbles to pop them!' },
    { key: 'noon', name: 'Noon — Bright Moon', short: 'Noon', color: '#6f8fd8', dark: '#26346e', hint: 'Jump! High pops score ×2, sky pops ×3' },
    { key: 'sunset', name: 'Sunset — Ringed Planet', short: 'Sunset', color: '#e2794a', dark: '#6a2a18', hint: 'Watch out for sleepy moon pebbles!' },
    { key: 'night', name: 'Night — Starry Bakery', short: 'Night', color: '#4a4fa8', dark: '#1a1c50', hint: 'Pop again in the air to bounce: chain pops!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const HOG_W = 96, HOG_H = 80, HK = 0.8;               // Bristle drawn size; viewBox (120×100) → drawn scale
  const HOG_ANCHOR = [60 * HK, 54 * HK];                // body centre inside the drawn sprite
  const FEET = (94 - 54) * HK;                          // feet line below the body centre (32 px → 478 at rest)
  const BALL = 76;                                      // curled ball drawn size (viewBox 100, centre 50,50)
  const BOARD_K = 0.62, BOARD_W = 120 * BOARD_K, BOARD_H = 40 * BOARD_K;   // deck top (vb y 10) → wheels (vb y 38) = 17 px
  const BOARD_TOP = [60 * BOARD_K, 10 * BOARD_K];
  const CRATER_W = 96, CRATER_H = 32;
  const BUBBLE_R = 30, CUP = 36, MAG = 34, PEB = 40;
  const CUP_KEYS = ['cupcake_pink', 'cupcake_mint', 'cupcake_lemon'];
  const CUP_COLORS = ['#ff8fc0', '#7fe0b8', '#ffe27a'];
  const MAGNET_COLOR = '#ff5a6a';
  const FLOOR = 492;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.bonkFlash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.pointer = null;
      this._ox = 0; this._oy = 0; this._shx = 0; this._shy = 0;
      this.VW = W; this.VH = H; this.SX = 0; this.SY = 0; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._ext = new Map(); this._grads = {};
      this._hazeOff = 0; this._sparkAcc = 0; this._combo = 0;
      this._boxPos = [880, 40];
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 0;
      this.resize();
    }
    /* Logical canvas size by aspect (education-game rule, adapted to a side-view scene):
     *  landscape ≥ 16:9 → height 540, width up to 1280 (iPhone ≈ 1170);  4:3-ish landscape → width 960, taller sky (iPad 960×720);
     *  portrait → width 560 (scene cropped to its middle 560 px so Bristle stays big on a phone), height up to 1600 (sky above).
     *  Beyond the clamps the canvas letter-boxes. insets = safe-area insets in CSS px (from #safeProbe). */
    static computeView(vw, vh, insetsCss) {
      const ar = vw / Math.max(1, vh);
      let VW, VH;
      if (ar >= 16 / 9) { VH = H; VW = Math.min(1280, Math.round(H * ar)); }
      else if (ar >= 1) { VW = W; VH = Math.min(960, Math.round(W / ar)); }
      else { VW = ar >= 0.6 ? 720 : 560; VH = Math.min(1600, Math.round(VW / ar)); }   // tablets see more sky
      const s = Math.min(vw / VW, vh / VH), cssW = VW * s, cssH = VH * s, left = (vw - cssW) / 2, top = (vh - cssH) / 2;
      const sa = insetsCss || { top: 0, right: 0, bottom: 0, left: 0 };
      const ins = { top: Math.max(0, sa.top - top) / s, right: Math.max(0, sa.right - left) / s, bottom: Math.max(0, sa.bottom - top) / s, left: Math.max(0, sa.left - left) / s };
      return { VW, VH, s, cssW, cssH, left, top, ins, SX: (VW - W) / 2, SY: VH - H };
    }

    resize(insetsCss) {
      if (insetsCss) this._insCss = insetsCss;
      const vw = window.innerWidth, vh = window.innerHeight;
      const v = Renderer.computeView(vw, vh, this._insCss);
      Object.assign(this, { VW: v.VW, VH: v.VH, SX: v.SX, SY: v.SY, ins: v.ins, cssScale: v.s });
      const c = this.canvas;
      c.style.width = v.cssW + 'px'; c.style.height = v.cssH + 'px'; c.style.left = v.left + 'px'; c.style.top = v.top + 'px';
      // backing store: device pixels, capped by area (touch ≈ 3.2 MP for iPad Pro / iPhone Pro, desktop ≈ 1920×1080)
      const dpr = window.devicePixelRatio || 1, touch = !!(MP.Game && MP.Game.isTouch);
      let px = v.s * dpr * (this.quality || 1);
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._sxd = Math.round(this.SX * this.px); this._syd = Math.round(this.SY * this.px);
      this._ext.clear();
      // DOM pieces anchored to the canvas + safe areas
      const S = v.s, I = v.ins;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast'), act = document.getElementById('btnAction');
      if (hud) { hud.style.top = (v.top + (I.top + 14) * S) + 'px'; hud.style.right = (v.left + (I.right + 14) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 30) * S) + 'px';
      // visible part of the scene and the Moon floor Bristle may use on this screen
      const visL = -this.SX + I.left, visR = this.VW - this.SX - I.right;
      let playMin = Math.max(60, visL + 50), playMax = Math.min(900, visR - 50);
      // on-screen jump button (touch): in the empty sky when there is room above the scene (portrait, iPad),
      // otherwise bottom-right, and then Bristle's range stops short of it so the button never covers him
      const B = Math.max(100, 66 / S);   // ≥ 66 CSS px: a small child's thumb
      let ab = null;
      if (this.SY >= 150) ab = { x: this.VW - I.right - 20 - B, y: Math.max(I.top + 150, this.SY - B - 68), w: B, h: B, place: 'sky' };
      else { ab = { x: this.VW - I.right - 16 - B, y: this.VH - I.bottom - 16 - B, w: B, h: B, place: 'corner' }; if (touch) playMax = Math.min(playMax, ab.x - this.SX - 58); }
      this.layout = { VW: v.VW, VH: v.VH, SX: this.SX, SY: this.SY, s: S, ins: I, visL, visR, playMin, playMax, act: ab };
      if (act) {
        act.style.width = act.style.height = (B * S) + 'px'; act.style.fontSize = (B * S * 0.45) + 'px';
        act.style.left = (v.left + ab.x * S) + 'px'; act.style.top = (v.top + ab.y * S) + 'px';
        act.style.right = act.style.bottom = 'auto';
        this._act = act; this._actPlace = ab.place;
      }
      this._hudBtn = null; this._measureHud();
      MP.Assets.setScale(this.px);
      if (this.vis) MP.Assets.warmSeason(this.vis.cur);
    }
    /* Where the DOM pause/sound buttons sit, in logical px (they are sized in CSS px, ≥ 44 px for fingers). */
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      if (r.width > 0 && c.width > 0) { const k = this.VW / c.width; this._hudBtn = { l: (r.left - c.left) * k, b: (r.bottom - c.top) * k }; }
    }
    /* Pointer (CSS px) → SCENE coordinates (what the world uses). */
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW - this.SX, (cy - r.top) / r.height * this.VH - this.SY]; }
    attach(world, weather) { this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.banner = null; this.shake = 0; this.flash = 0; this.bonkFlash = 0; }

    setSeason(i, instant) {
      i = ((i % 4) + 4) % 4;
      MP.Assets.warmSeason((i + 1) % 4); MP.Assets.warmSeason(0);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(b) { this.banner = { s: b, t: 0 }; }
    zoneInfo(z) {
      const zi = ZONE_INFO[z] || ZONE_INFO[0], p = MP.Assets.palette && MP.Assets.palette[zi.key];
      return p && p.banner ? Object.assign({}, zi, { color: p.banner }) : zi;
    }

    // ---------------- events → effects ----------------
    onEvents(evts) {
      const w = this.world, s = w && w.hog;
      for (const e of evts) {
        switch (e.type) {
          case 'pop': {
            const tier = e.tier || 1, mag = e.kind === 'magnet';
            const col = mag ? MAGNET_COLOR : tier >= 3 ? '#ffe14d' : '#ffffff';
            this.ring(e.x, e.y, col, tier >= 3 ? 0.55 : 0.4, tier >= 3 || mag, true);
            if (!(this.weather && this.weather.burst)) this.sparks(e.x, e.y, 10, '#e8f4ff');
            this.sparks(e.x, e.y, tier >= 3 ? 10 : 5, tier >= 3 ? '#ffe14d' : mag ? MAGNET_COLOR : CUP_COLORS[e.color || 0]);
            if (e.kind === 'cupcake') {   // the freed cupcake hops up a little, then flies into the box in the HUD
              this.fx.push({ k: 'fly', x0: e.x, y0: e.y, x: e.x, y: e.y, color: e.color || 0, life: 0, max: 0.75, rot: 0, vr: (Math.random() - .5) * 8 });
            }
            // "+N" popup on the side away from Bristle's face, above the pop
            const f = s && s.face < 0 ? -1 : 1, air = !!(s && s.air);
            // never on Bristle: on the floor above him; in the air (he bounces up after a pop) beside him, behind his back
            let px = clamp(e.x - f * 26, 40, 920), py = Math.max(Math.min(e.y, s ? s.y : e.y) - 58, 70);
            if (air) { px = e.x - f * 92; if (px < 50 || px > 910) px = e.x + f * 92; py = Math.max(e.y, 90); }
            const big = tier >= 3 || (e.mult || 1) >= 3;
            this.texts.push({ text: '+' + e.points, x: px, y: py, life: 0, max: 0.9, size: 20 + 3 * tier + 2 * Math.min(3, e.mult || 1), color: big ? '#ffe14d' : '#ffffff' });
            if (tier >= 2 && !mag) this.texts.push({ text: tier >= 3 ? 'Sky pop! ×3' : 'High pop ×2', x: px, y: py - 26, life: 0, max: 0.9, size: tier >= 3 ? 19 : 16, color: tier >= 3 ? '#ffe14d' : '#bfe6ff' });
            break;
          }
          case 'chain':
            { const f = s && s.face < 0 ? -1 : 1; let cx = (e.x || 480) - f * 110; if (cx < 90 || cx > 870) cx = (e.x || 480) + f * 110;
            this.texts.push({ text: 'Chain ×' + e.n + '!', x: clamp(cx, 90, 870), y: Math.max(90, (e.y || 300) + 34), life: 0, max: 1.0, size: 24 + Math.min(5, e.n) * 3, color: '#8ff0ff' }); }
            break;
          case 'multup':
            this.texts.push({ text: '×' + e.mult + ' STREAK!', x: 480, y: 150, life: 0, max: 1.3, size: 30 + e.mult * 4, color: '#ffe14d', big: true });
            this._multPop = 1;
            break;
          case 'emerge': this.ring(e.x, 474, 'rgba(255,255,255,0.8)', 0.3, false); break;
          case 'escape': {
            this.sparks(e.x, Math.max(e.y, 40), 4, '#ffffff');
            const lost = Math.max(e.lost || 0, e.combo || 0);
            if (lost >= 3) this.texts.push({ text: 'Streak lost', x: clamp(e.x, 90, 870), y: 110, life: 0, max: 0.9, size: 20, color: '#ffe0f0' });
            break;
          }
          case 'magnet':
            this.texts.push({ text: 'MAGNET!', x: 480, y: 168, life: 0, max: 1.2, size: 38, color: '#ff8a96', big: true });
            if (s) this.ring(s.x, s.y, MAGNET_COLOR, 0.6, true, true);
            this._magPop = 1;
            break;
          case 'bonk':
            this.shake = 0.22; this.bonkFlash = 0.5;
            this.texts.push({ text: 'Boing!', x: clamp(e.x, 80, 880), y: Math.max(80, e.y - 76), life: 0, max: 0.9, size: 30, color: '#ffd1e6' });
            for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.5, sp = 110 + Math.random() * 50; this.fx.push({ k: 'sprite', spr: 'p_star', x: e.x, y: e.y - 30, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 200, life: 0, max: 0.7, size: 16 + Math.random() * 6, rot: a, vr: 5 }); }
            break;
          case 'heal': this.texts.push({ text: '+1 heart', x: 110, y: 90, life: 0, max: 1.4, size: 22, color: '#ff8fae' }); break;
          case 'pebbleland': this.puffs(e.x, Math.min(e.y + 12, 490), 6, '#d8d4e8'); break;
          case 'jump': this.puffs(e.x, 490, 5, '#e6e2f2'); break;
          case 'land': this.puffs(e.x, 490, 6, '#e6e2f2'); break;
          case 'boxfull':
            this.texts.push({ text: 'Cupcake box full!', x: 480, y: 190, life: 0, max: 1.6, size: 40, color: '#ffe14d', big: true });
            this._boxPop = 1;
            break;
          case 'cleared':
            this.texts.push({ text: 'Level clear!', x: 480, y: 240, life: 0, max: 2.2, size: 46, color: '#ffe14d', big: true });
            if (e.bonus) this.texts.push({ text: 'Heart bonus +' + e.bonus, x: 480, y: 292, life: 0, max: 2.2, size: 24, color: '#ffffff', big: true });
            for (let i = 0; i < 30; i++) { const a = Math.random() * TAU, sp = 120 + Math.random() * 220; this.fx.push({ k: 'sprite', spr: 'p_sparkle', x: 480, y: 230, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 200, life: -i * 0.015, max: 1.4, size: 14 + Math.random() * 12, rot: 0, vr: 3 }); }
            break;
          case 'zone': case 'season': { const z = e.zone != null ? e.zone : e.season; this.showBanner(z); this.setSeason(z); break; }
          case 'dead': this.flash = 0.4; this.shake = 0.3; this.texts.push({ text: 'Out of hearts!', x: 480, y: 250, life: 0, max: 2.5, size: 40, color: '#ffd1e6', big: true }); break;
        }
      }
    }
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 70 + Math.random() * 150; this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 80, life: 0, max: 0.35 + Math.random() * 0.25, size: 2 + Math.random() * 2.5, color }); }
    }
    puffs(x, y, n, color) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'puff', x: x + (Math.random() - .5) * 18, y: y - 4 + (Math.random() - .5) * 6, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * 30, g: 0, life: 0, max: 0.45 + Math.random() * 0.2, size: 6 + Math.random() * 6, color });
    }
    ring(x, y, color, max, big, round) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 10, r1: big ? 90 : 46, color, round: !!round }); }

    update(dt) {
      this.time += dt;
      const w = this.world;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.2);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.6) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.bonkFlash = Math.max(0, this.bonkFlash - dt * 2);
      ['_multPop', '_magPop', '_boxPop'].forEach(k => { this[k] = Math.max(0, (this[k] || 0) - dt * 2); });
      this._hazeOff += 6 * dt;
      if (w) this._combo = w.combo || 0;
      // magnet: little red-white sparks run along the pull lines toward Bristle
      const s = w && w.hog, m = w && w.magnet;
      if (s && m && m.t > 0) {
        this._sparkAcc += dt;
        if (this._sparkAcc > 0.07 && this.fx.length < 300) {
          this._sparkAcc = 0;
          const R = m.r || 300;
          for (const it of w.items) {
            if (it.state !== 'rise') continue;
            const dx = s.x - it.x, dy = s.y - it.y, d = Math.hypot(dx, dy);
            if (d > R || d < 20 || Math.random() < 0.5) continue;
            this.fx.push({ k: 'sprite', spr: 'p_spark', x: it.x, y: it.y, vx: dx / d * 260, vy: dy / d * 260, g: 0, life: 0, max: Math.min(0.5, d / 260), size: 10, rot: Math.atan2(dy, dx), vr: 0 });
          }
        }
      }
      for (const f of this.fx) {
        f.life += dt; if (f.life < 0) continue;
        if (f.k === 'fly') { this.flyStep(f); continue; }
        f.vy += (f.g || 0) * dt; f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt;
        if (f.vr) f.rot += f.vr * dt;
      }
      this.fx = this.fx.filter(f => f.life < f.max);
      if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
      for (const t of this.texts) { t.life += dt; if (!t.big) t.y -= 34 * dt; }
      this.texts = this.texts.filter(t => t.life < t.max);
    }
    /* a freed cupcake: a small hop (0–25 %), then an eased arc into the HUD box (scene coords of the box icon) */
    flyStep(f) {
      const k = clamp(f.life / f.max, 0, 1), [tx, ty] = this._boxPos;
      if (k < 0.25) { const q = k / 0.25; f.x = f.x0; f.y = f.y0 - 26 * Math.sin(q * Math.PI / 2); }
      else {
        const q = (k - 0.25) / 0.75, e = q * q * (3 - 2 * q), sx = f.x0, sy = f.y0 - 26;
        const cx = (sx + tx) / 2, cy = Math.min(sy, ty) - 80;   // quadratic Bézier over the top
        f.x = (1 - e) * (1 - e) * sx + 2 * (1 - e) * e * cx + e * e * tx;
        f.y = (1 - e) * (1 - e) * sy + 2 * (1 - e) * e * cy + e * e * ty;
      }
      f.rot += f.vr * 0.016;
    }

    // ---------------- helpers ----------------
    // ---------------- helpers ----------------
    /* 1:1 device-pixel blit of a pre-rasterized layer (no resampling). dx/dy in logical px, rounded to device px. */
    layer(key, alpha, dx, dy, lw, lh) {
      const spr = MP.Assets.sprite(key, lw || W, lh || H);   // scene-space layer at its own size
      if (!spr) return false;
      const g = this.ctx;
      g.setTransform(1, 0, 0, 1, this._ox + Math.round((dx || 0) * this.px), this._oy + Math.round((dy || 0) * this.px));
      if (alpha < 1) g.globalAlpha = alpha;
      g.drawImage(spr, 0, 0);
      g.globalAlpha = 1;
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      return true;
    }
    /* A horizontally tileable layer repeated across the whole canvas width at scene y, scrolled by off (logical px). */
    tiled(spr, y, off, alpha, flipY) {
      if (!spr) return;
      const g = this.ctx, step = spr.width;
      const offD = -Math.round((((off * this.px) % step) + step) % step);
      const left = -this._sxd, right = this.canvas.width - this._sxd;
      let xd = offD - step * Math.ceil(Math.max(0, offD - left) / step);
      if (alpha < 1) g.globalAlpha = alpha;
      const yd = this._oy + Math.round(y * this.px);
      for (; xd < right; xd += step) {
        if (flipY) g.setTransform(1, 0, 0, -1, this._ox + xd, yd + spr.height); else g.setTransform(1, 0, 0, 1, this._ox + xd, yd);
        g.drawImage(spr, 0, 0);
      }
      g.globalAlpha = 1;
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
    }
    screenOn() { this._ox = this._shx; this._oy = this._shy; this.ctx.setTransform(this.px, 0, 0, this.px, this._ox, this._oy); }
    sceneOn() { this._ox = this._shx + this._sxd; this._oy = this._shy + this._syd; this.ctx.setTransform(this.px, 0, 0, this.px, this._ox, this._oy); }
    /* Custom background: covers the whole screen (screen space). */
    customBg(slot, alpha) {
      const c = MP.Assets.custom[slot]; if (!c) return false;
      const g = this.ctx, VW = this.VW, VH = this.VH, k = Math.max(VW / c.width, VH / c.height), dw = c.width * k, dh = c.height * k;
      if (VH > VW * 1.2) return this.customBgTall(slot, c, alpha);
      this.screenOn();
      g.globalAlpha = alpha;
      g.drawImage(MP.Assets.sprite('custom:' + slot, dw, dh), (VW - dw) / 2, (VH - dh) / 2, dw, dh);
      g.fillStyle = 'rgba(255,248,240,0.25)'; g.fillRect(0, 0, VW, VH);   // soften so Bristle and the bubbles stay readable
      g.globalAlpha = 1;
      this.sceneOn();
      return true;
    }
    /* Tall portrait: fit the photo to the sky band (top of the screen down to just under the horizon), top-aligned,
     * and fade its lower edge into the zone's own sky; built once per picture/size into a device-pixel canvas. */
    customBgTall(slot, c, alpha) {
      const zone = MP.Assets.SLOTS.find(q => q.id === slot), z = zone ? zone.season : 0;
      const key = 'c|' + slot + '|' + (MP.Assets._ver || 0) + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + c.width;
      let out = this._ext.get(key);
      if (!out) {
        const base = this.skyExt(z);
        out = document.createElement('canvas'); out.width = Math.round(this.VW * this.px); out.height = Math.round(this.VH * this.px);
        const o = out.getContext('2d');
        if (base) o.drawImage(base, 0, 0);
        const bh = (this.SY + 330) * this.px, k = Math.max(out.width / c.width, bh / c.height), dw = c.width * k, dh = c.height * k;
        const t = document.createElement('canvas'); t.width = out.width; t.height = Math.ceil(bh);
        const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high';
        tg.drawImage(c, (t.width - dw) / 2, 0, dw, dh);
        tg.globalCompositeOperation = 'destination-in';
        const gr = tg.createLinearGradient(0, bh - 80 * this.px, 0, bh); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        tg.fillStyle = gr; tg.fillRect(0, 0, t.width, t.height);
        o.drawImage(t, 0, 0);
        o.fillStyle = 'rgba(255,248,240,0.22)'; o.fillRect(0, 0, out.width, bh);
        if (this._ext.size > 4) this._ext.delete(this._ext.keys().next().value);
        this._ext.set(key, out);
      }
      this.screenOn();
      const g = this.ctx; g.setTransform(1, 0, 0, 1, this._shx, this._shy);
      if (alpha < 1) g.globalAlpha = alpha; g.drawImage(out, 0, 0); g.globalAlpha = 1;
      this.sceneOn();
      return true;
    }
    /* The zone's sky stretched to the full canvas, built once per zone/size into one device-pixel canvas so the
     * per-frame draw stays a 1:1 blit: the 960×540 sky in the middle, its edge columns averaged and stretched
     * sideways, its top rows averaged and stretched upwards (portrait), plus stars at dawn (faint) and at night. */
    skyExt(z) {
      const key = z + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3);
      let c = this._ext.get(key);
      if (c) return c;
      const n = MP.Assets.SEASONS[z], spr = MP.Assets.sprite(n + '_sky', W, H);
      if (!spr) return null;
      c = document.createElement('canvas'); c.width = Math.round(this.VW * this.px); c.height = Math.round(this.VH * this.px);
      const g = c.getContext('2d'), dx = this._sxd, dy = this._syd, sw = spr.width, sh = spr.height;
      g.imageSmoothingEnabled = true;
      g.drawImage(spr, dx, dy);
      if (dx > 0) {
        const col = (sx0) => { const t = document.createElement('canvas'); t.width = 1; t.height = sh; const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(spr, sx0, 0, Math.round(96 * this.px), sh, 0, 0, 1, sh); return t; };
        g.drawImage(col(0), 0, 0, 1, sh, 0, dy, dx + 1, sh);
        g.drawImage(col(sw - Math.round(96 * this.px)), 0, 0, 1, sh, dx + sw - 1, dy, c.width - dx - sw + 1, sh);
        // feather the joins: a mirrored copy of the sky's edge fades out into the averaged sides (no hard seam where
        // the night's milky band or the dawn glow reaches the edge)
        const fw = Math.min(dx, Math.round(140 * this.px));
        const t = document.createElement('canvas'); t.width = fw; t.height = sh;
        const tg = t.getContext('2d');
        for (const side of [0, 1]) {
          tg.globalCompositeOperation = 'source-over'; tg.clearRect(0, 0, fw, sh);
          tg.save(); tg.translate(fw, 0); tg.scale(-1, 1);
          tg.drawImage(spr, side ? sw - fw : 0, 0, fw, sh, 0, 0, fw, sh);
          tg.restore();
          tg.globalCompositeOperation = 'destination-in';
          const gr = tg.createLinearGradient(0, 0, fw, 0);
          gr.addColorStop(side ? 0 : 1, 'rgba(0,0,0,1)'); gr.addColorStop(side ? 1 : 0, 'rgba(0,0,0,0)');
          tg.fillStyle = gr; tg.fillRect(0, 0, fw, sh);
          g.drawImage(t, side ? dx + sw : dx - fw, dy);
        }
      }
      if (dy > 0) {
        const t = document.createElement('canvas'); t.width = 1; t.height = 1;
        const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
        tg.drawImage(c, 0, dy + 1, c.width, Math.max(2, Math.round(6 * this.px)), 0, 0, 1, 1);
        g.drawImage(t, 0, 0, 1, 1, 0, 0, c.width, dy + 1);
        // blend from the palette's top-of-sky colour down into the averaged strip (no flat band in tall portrait)
        const pal = MP.Assets.palette && MP.Assets.palette[n];
        if (pal && pal.skyTop) {
          const gr = g.createLinearGradient(0, 0, 0, dy + 1);
          gr.addColorStop(0, pal.skyTop);
          const d = t.getContext('2d').getImageData(0, 0, 1, 1).data;
          gr.addColorStop(1, `rgba(${d[0]},${d[1]},${d[2]},1)`);
          g.fillStyle = gr; g.fillRect(0, 0, c.width, dy + 1);
        }
        if (z === 3 || z === 0) {   // dawn / night: stars in the extra sky
          let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
          const nStars = Math.round(this.VW * this.SY / 9000);
          for (let i = 0; i < nStars; i++) {
            g.globalAlpha = (0.35 + 0.55 * rnd()) * (z === 0 ? 0.4 : 1); g.fillStyle = '#fff6d8';
            g.beginPath(); g.arc(rnd() * c.width, rnd() * dy, (0.8 + rnd() * 1.6) * this.px, 0, TAU); g.fill();
          }
          g.globalAlpha = 1;
        }
      }
      if (this._ext.size > 4) this._ext.delete(this._ext.keys().next().value);
      this._ext.set(key, c);
      return c;
    }
    /* sky + far hills/bakery + drifting haze (or the player's own background) */
    backdrop(b, alpha) {
      const n = MP.Assets.SEASONS[b], g = this.ctx;
      if (this.customBg('bg_' + n, alpha)) return;
      const ext = this.skyExt(b);
      this.screenOn();
      if (ext) { g.setTransform(1, 0, 0, 1, this._shx, this._shy); if (alpha < 1) g.globalAlpha = alpha; g.drawImage(ext, 0, 0); g.globalAlpha = 1; }
      else { const p = MP.Assets.palette[n]; g.fillStyle = (p && p.sky) || '#9fd8f5'; g.fillRect(0, 0, this.VW, this.VH); }
      this.sceneOn();
      // far moon hills + the Moon Bakery (1:1 blit, centred; on wide screens mirrored copies continue the hills sideways)
      this.mirrored(n + '_far', alpha);
      // drifting nebula haze at y 140, tiled across the visible width; portrait gets fainter strips higher up
      const hs = MP.Assets.sprite(n + '_haze', W, 220);
      if (hs) for (let k = 0; k < 8; k++) {
        const y = 140 - 240 * k;
        if (k > 0 && y < -this.SY - 120) break;
        const a = alpha * (k === 0 ? 1 : Math.max(0.4, 0.8 - 0.12 * k));
        this.tiled(hs, y, this._hazeOff * (k === 0 ? 1 : 0.6 + 0.1 * k) + 377 * k, a);
      }
    }
    /* A full-scene layer with mirrored copies to the left and right on wide screens (seamless at the joins). */
    mirrored(key, alpha) {
      const spr = MP.Assets.sprite(key, W, H);
      if (!spr || alpha <= 0) return;
      const g = this.ctx;
      if (alpha < 1) g.globalAlpha = alpha;
      g.setTransform(1, 0, 0, 1, this._ox, this._oy); g.drawImage(spr, 0, 0);
      if (this.SX > 0) {
        g.setTransform(-1, 0, 0, 1, this._ox, this._oy); g.drawImage(spr, 0, 0);
        g.setTransform(-1, 0, 0, 1, this._ox + 2 * spr.width, this._oy); g.drawImage(spr, 0, 0);
      }
      g.globalAlpha = 1;
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
    }
    /* Moon floor + mirrored copies to the sides on wide screens (seamless at the joins, pixel-exact). */
    ground(z, alpha) {
      const spr = MP.Assets.sprite(MP.Assets.SEASONS[z] + '_ground', W, H);
      if (!spr || alpha <= 0) return;
      const g = this.ctx;
      if (alpha < 1) g.globalAlpha = alpha;
      g.setTransform(1, 0, 0, 1, this._ox, this._oy); g.drawImage(spr, 0, 0);
      if (this.SX > 0) {
        g.setTransform(-1, 0, 0, 1, this._ox, this._oy); g.drawImage(spr, 0, 0);
        g.setTransform(-1, 0, 0, 1, this._ox + 2 * spr.width, this._oy); g.drawImage(spr, 0, 0);
      }
      g.globalAlpha = 1;
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
    }
    text(str, x, y, size, fill, stroke, align = 'center', lw) {
      const g = this.ctx;
      g.font = `900 ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (stroke) { g.lineWidth = lw || Math.max(3, size * 0.16); g.strokeStyle = stroke; g.strokeText(str, x, y + size * 0.06); g.strokeText(str, x, y); }
      g.fillStyle = fill; g.fillText(str, x, y);
    }
    roundRect(x, y, w, h, r, g) {
      g = g || this.ctx; g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    fadeLayer(fn, a) {
      const o = this._off || (this._off = document.createElement('canvas'));
      if (o.width !== this.canvas.width || o.height !== this.canvas.height) { o.width = this.canvas.width; o.height = this.canvas.height; }
      const g0 = this.ctx, shx = this._shx, shy = this._shy;
      this.ctx = o.getContext('2d'); this._shx = 0; this._shy = 0;
      this.ctx.setTransform(1, 0, 0, 1, 0, 0); this.ctx.clearRect(0, 0, o.width, o.height);
      this.ctx.imageSmoothingQuality = 'high';
      try { this.sceneOn(); fn(); } finally { this.ctx = g0; this._shx = shx; this._shy = shy; }
      g0.save(); g0.setTransform(1, 0, 0, 1, shx, shy); g0.globalAlpha = a; g0.drawImage(o, 0, 0); g0.restore();
      this.sceneOn();
    }
    /* soft radial glow, cached per colour (drawn with a scale) */
    glow(color) {
      let gr = this._grads[color];
      if (!gr) {
        gr = this.ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
        gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(0.3, color); gr.addColorStop(1, 'rgba(255,255,255,0)');
        this._grads[color] = gr;
      }
      return gr;
    }


    // ---------------- interpolation ----------------
    interp(w) {
      const step = (w.cfg && w.cfg.step) || 1 / 120;
      if (w._acc == null) return false;
      this._a = clamp(w._acc / step, 0, 1);
      const S = this._saved || (this._saved = []); S.length = 0;
      if (w.hog) {
        const s = w.hog; this._lerp(s, 'x', '_px'); this._lerp(s, 'y', '_py');
        if (s.board) { this._lerp(s.board, 'x', '_px'); this._lerp(s.board, 'y', '_py'); }
      }
      for (const m of w.items) { this._lerp(m, 'x', '_px'); this._lerp(m, 'y', '_py'); }
      return S.length > 0;
    }
    _lerp(o, k, pk) { const p = o[pk]; if (p == null) return; this._saved.push(o, k, o[k]); o[k] = p + (o[k] - p) * this._a; }
    uninterp() { const S = this._saved; for (let i = S.length - 3; i >= 0; i -= 3) S[i][S[i + 1]] = S[i + 2]; S.length = 0; }

    // ---------------- main draw ----------------
    draw(mode) {
      const g = this.ctx, w = this.world;
      this._shx = 0; this._shy = 0;
      if (this.shake > 0) { const m = this.shake * 10 * this.px; this._shx = Math.round((Math.random() - .5) * m); this._shy = Math.round((Math.random() - .5) * m); }
      this.sceneOn();
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const v = this.vis;
      const lerped = w ? this.interp(w) : false;
      if (this._trimKey !== v.cur * 4 + v.prev) { this._trimKey = v.cur * 4 + v.prev; MP.Assets.trimSeasons([v.cur, v.prev, (v.cur + 1) % 4, 0]); }
      const fading = v.t < 1 && v.prev !== v.cur;
      const s = w && w.hog;
      this._bob = s && !s.air && w.state !== 'dead' ? Math.sin(this.time * 9) * 0.8 * clamp(Math.abs(s.vx || 0) / 200, 0.3, 1) : 0;

      if (fading) { this.backdrop(v.prev, 1); this.fadeLayer(() => this.backdrop(v.cur, 1), v.t); }
      else this.backdrop(v.cur, 1);
      if (this.weather) { this.ambient(this.weather.ambient); this.particles('back'); }
      if (fading) { this.ground(v.prev, Math.min(1, 2 - 2 * v.t)); this.ground(v.cur, v.t); }
      else this.ground(v.cur, 1);
      if (w) {
        this.drawVents();
        this.drawShadows();
        this.drawBubbles();
        this.drawMagnetField();
        this.drawHog(mode);
        this.drawPebbles();
      }
      if (this.weather) this.particles('front');
      this.drawFx();
      if (w && mode !== 'title') this.drawPointer(mode);
      if (mode !== 'title') this.drawTexts();
      if (this.banner && mode !== 'title') this.drawBanner();
      if (this.debug && w) this.debugDraw();
      this.screenOn();
      const VW = this.VW, VH = this.VH;
      if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${(this.flash * 0.55).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
      if (this.bonkFlash > 0) { g.fillStyle = `rgba(255,190,220,${(this.bonkFlash * 0.22).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
      if (w && w.state === 'dead') { g.fillStyle = 'rgba(30,25,70,0.22)'; g.fillRect(0, 0, VW, VH); }
      if (w && mode === 'playing') this.hud();   // paused: the panel covers it on small screens
      if (lerped) this.uninterp();
    }

    ambient(a) {
      if (!a) return;
      const g = this.ctx;
      const x0 = -this.SX, y0 = -this.SY;   // scene space: cover the whole canvas
      if (a.tint) { g.fillStyle = a.tint; g.fillRect(x0, y0, this.VW, this.VH); }
      if (a.fog > 0) { g.globalAlpha = clamp(a.fog, 0, 1) * 0.4; g.fillStyle = '#ffffff'; g.fillRect(x0, y0, this.VW, this.VH); g.globalAlpha = 1; }
    }
    particles(layer) {
      const g = this.ctx, A = MP.Assets;
      for (const p of this.weather.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.sprite === 'dot') { g.fillStyle = p.color || '#ffffff'; g.beginPath(); g.arc(p.x, p.y, p.size * 0.5, 0, TAU); g.fill(); continue; }
        if (p.sprite === 'confetti') {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot || 0); g.scale(p.flipX == null ? 1 : p.flipX, 1);
          g.fillStyle = p.color || '#ffd84a'; g.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6); g.restore(); continue;
        }
        const spr = A.sprite('p_' + p.sprite, 32, 32); if (!spr) continue;
        const fx = p.flipX == null ? 1 : (Math.abs(p.flipX) < 0.22 ? 0.22 * Math.sign(p.flipX || 1) : p.flipX);
        g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
        g.translate(p.x, p.y); g.rotate(p.rot || 0); g.scale(fx, 1);
        g.drawImage(spr, -p.size / 2, -p.size / 2, p.size, p.size);
      }
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      g.globalAlpha = 1;
    }

    zoneTint() { const p = MP.Assets.palette && MP.Assets.palette[MP.Assets.SEASONS[this.vis.cur]]; return (p && p.tint) || '#c9c4dc'; }
    nightGlow() { const a = this.weather && this.weather.ambient; return a && a.glow != null ? clamp(a.glow, 0, 1) : (this.vis.cur === 3 ? 1 : 0); }

    /* vent craters in the floor; a vent that is about to puff glows and breathes (telegraph) */
    drawVents() {
      const g = this.ctx, w = this.world, A = MP.Assets, cr = A.sprite('crater', CRATER_W, CRATER_H);
      if (!w.vents) return;
      for (const v of w.vents) {
        const p = clamp(v.puff || 0, 0, 1), x = v.x, y = FLOOR - 22;
        if (p > 0) {   // soft glow out of the mouth, pulsing faster as the bubble is about to come out
          const pulse = 0.8 + 0.2 * Math.sin(this.time * (8 + 10 * p));
          g.globalAlpha = 0.35 + 0.5 * p; g.fillStyle = this.glow('rgba(190,235,255,0.75)');
          g.save(); g.translate(x, y + 12); g.scale(40 * pulse * (0.6 + 0.6 * p), 26 * pulse * (0.6 + 0.6 * p)); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
          g.globalAlpha = 1;
        }
        if (cr) {
          const sq = 1 + 0.06 * p * Math.sin(this.time * 18);
          g.save(); g.translate(x, y + CRATER_H); g.scale(sq, 2 - sq); g.drawImage(cr, -CRATER_W / 2, -CRATER_H, CRATER_W, CRATER_H); g.restore();
        } else {
          g.fillStyle = '#8a86a6'; g.beginPath(); g.ellipse(x, y + 16, 40, 10, 0, 0, TAU); g.fill();
          g.fillStyle = '#4a4668'; g.beginPath(); g.ellipse(x, y + 16, 28, 6, 0, 0, TAU); g.fill();
        }
      }
    }

    /* Bristle's shadow + every falling pebble's warning ring (grows and darkens as the pebble comes down) */
    drawShadows() {
      const g = this.ctx, w = this.world, s = w.hog;
      if (s) {
        const sk = clamp(1 - Math.max(0, s.lift || 0) / 260, 0.4, 1);
        g.fillStyle = `rgba(40,30,90,${(0.24 * sk).toFixed(3)})`; g.beginPath(); g.ellipse(s.x, FLOOR - 1, 34 * sk, 6 * sk, 0, 0, TAU); g.fill();
      }
      for (const it of w.items) {
        if (it.kind !== 'pebble' || it.state !== 'fall') continue;
        if (it.harmless) continue;
        const k = it.shadow != null ? clamp(it.shadow, 0, 1) : clamp((it.y + 30) / (FLOOR - 40 + 30), 0, 1);
        const lx = it.lx != null ? it.lx : it.x, pulse = 0.5 + 0.5 * Math.sin(this.time * (8 + 8 * k));
        g.fillStyle = `rgba(40,30,90,${(0.12 + 0.28 * k).toFixed(3)})`;
        g.beginPath(); g.ellipse(lx, FLOOR - 1, 10 + 20 * k, 3 + 4 * k, 0, 0, TAU); g.fill();
        g.strokeStyle = `rgba(255,140,120,${(0.35 + 0.45 * k * pulse).toFixed(3)})`; g.lineWidth = 2 + 1.5 * k;
        g.beginPath(); g.ellipse(lx, FLOOR - 1, 16 + 22 * k, 5 + 5 * k, 0, 0, TAU); g.stroke();
      }
    }

    /* the cupcake (or magnet) inside a bubble */
    contentSprite(it) {
      const A = MP.Assets;
      if (it.kind === 'magnet') return { spr: A.sprite('magnet', MAG, MAG), w: MAG, h: MAG };
      if (A.hasCustom('cupcake')) { const [fw, fh] = A.fit('cupcake', CUP, CUP); return { spr: A.sprite('custom:cupcake', fw, fh), w: fw, h: fh }; }
      return { spr: A.sprite(CUP_KEYS[it.color || 0] || CUP_KEYS[0], CUP, CUP), w: CUP, h: CUP };
    }
    drawBubbles() {
      const g = this.ctx, w = this.world, A = MP.Assets, film = A.sprite('bubble', 80 * 0.75, 80 * 0.75);
      const glow = this.nightGlow(), phone = this.cssScale < 0.8 ? 1.2 : 1;   // phones: bubbles drawn 20 % bigger (visual only)
      const puffT = (w.cfg && w.cfg.puffTime) || 0.8;
      for (const it of w.items) {
        if (it.kind === 'pebble') continue;
        const st = it.state;
        let a = st === 'puff' ? 1 : (it.alpha == null ? 1 : it.alpha);   // 'puff': the world keeps alpha 0, we draw a swelling bubble
        if (a <= 0.01) continue;
        const r = (it.r || BUBBLE_R) * phone;
        let k = 1, x = it.x, y = it.y;
        if (st === 'puff') {   // a small bubble swelling in the crater mouth
          const q = clamp((it.t || 0) / puffT, 0, 1);
          k = 0.25 + 0.45 * q; y = (FLOOR - 10) - r * k * 0.6; a *= 0.5 + 0.5 * q;
        }
        let popK = 0;
        if (st === 'pop') { popK = clamp((it.t || 0) / 0.25, 0, 1); a *= 1 - popK; k *= 1 + 0.35 * popK; }
        const wob = it.wob || 0, sq = clamp(it.squish || 0, 0, 1);
        const fx = 1 + 0.05 * Math.sin(wob) + 0.12 * sq, fy = 1 + 0.05 * Math.sin(wob + Math.PI) - 0.1 * sq;
        g.save(); g.globalAlpha = a; g.translate(x, y);
        // night (and the magnet bubble always): a soft glow behind, so the film reads on the dark sky
        if (glow > 0 || it.kind === 'magnet') {
          const ga = g.globalAlpha; g.globalAlpha = ga * (it.kind === 'magnet' ? 0.5 + 0.2 * Math.sin(this.time * 6) : 0.35 * glow);
          g.fillStyle = this.glow(it.kind === 'magnet' ? 'rgba(255,110,130,0.6)' : 'rgba(170,220,255,0.55)');
          g.save(); g.scale(r * 1.45 * k, r * 1.45 * k); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); g.globalAlpha = ga;
        }
        if (st !== 'pop') {   // content (stays while the film bursts → the fly fx takes over)
          const d = this.contentSprite(it);
          if (d.spr) {
            g.save(); g.scale(k * phone, k * phone); g.rotate((it.rot || 0) + 0.08 * Math.sin(wob * 0.5));
            if (A.hasCustom('cupcake') && it.kind === 'cupcake') { g.fillStyle = 'rgba(255,255,255,0.75)'; g.beginPath(); g.arc(0, 0, CUP * 0.56, 0, TAU); g.fill(); g.strokeStyle = CUP_COLORS[it.color || 0]; g.lineWidth = 3; g.stroke(); }
            g.drawImage(d.spr, -d.w / 2, -d.h / 2, d.w, d.h); g.restore();
          }
        }
        g.scale(fx * k, fy * k);
        if (film) g.drawImage(film, -r * 40 / 37, -r * 40 / 37, r * 80 / 37, r * 80 / 37);
        else { g.strokeStyle = 'rgba(255,255,255,0.85)'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.stroke(); }
        if (it.kind === 'magnet') { g.strokeStyle = `rgba(255,90,106,${(0.55 + 0.3 * Math.sin(this.time * 6)).toFixed(3)})`; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, r + 3, 0, TAU); g.stroke(); }
        g.restore();
      }
      g.globalAlpha = 1;
    }

    /* magnet power-up: a dashed field ring around Bristle + faint pull lines to the bubbles it is pulling */
    drawMagnetField() {
      const g = this.ctx, w = this.world, s = w.hog, m = w.magnet;
      if (!s || !m || !(m.t > 0)) return;
      const R = m.r || 300, fade = clamp(m.t / 0.6, 0, 1), warn = m.t < 1.5 ? 0.5 + 0.5 * Math.sin(this.time * 18) : 1;
      g.save();
      g.beginPath(); g.rect(s.x - R - 10, s.y - R - 10, 2 * R + 20, FLOOR - (s.y - R - 10)); g.clip();   // the field stops at the floor
      g.globalAlpha = 0.4 * fade * warn; g.strokeStyle = MAGNET_COLOR; g.lineWidth = 3;
      g.setLineDash([10, 12]); g.lineDashOffset = -this.time * 40;
      g.beginPath(); g.arc(s.x, s.y, R * (0.96 + 0.04 * Math.sin(this.time * 5)), 0, TAU); g.stroke();
      g.setLineDash([]);
      g.globalAlpha = 0.18 * fade; g.fillStyle = this.glow('rgba(255,120,140,0.5)');
      g.save(); g.translate(s.x, s.y); g.scale(70, 70); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
      g.lineWidth = 1.5; g.strokeStyle = '#ffd0d6';
      for (const it of w.items) {
        if (it.state !== 'rise' || it.kind === 'pebble') continue;
        const d = Math.hypot(it.x - s.x, it.y - s.y); if (d > R) continue;
        g.globalAlpha = 0.35 * fade * (1 - d / R);
        g.beginPath(); g.moveTo(it.x, it.y); g.lineTo(s.x, s.y); g.stroke();
      }
      g.restore();
    }

    drawPebbles() {
      const g = this.ctx, w = this.world, A = MP.Assets, custom = A.hasCustom('pebble');
      for (const it of w.items) {
        if (it.kind !== 'pebble') continue;
        const a = it.alpha == null ? 1 : it.alpha; if (a <= 0.01) continue;
        let spr, dw = PEB, dh = PEB;
        if (custom) { [dw, dh] = A.fit('pebble', PEB, PEB); spr = A.sprite('custom:pebble', dw, dh); }
        else spr = A.sprite((Math.floor(this.time * 2.5 + (it.id || 0)) % 2) ? 'pebble_2' : 'pebble', PEB, PEB);
        g.save(); g.globalAlpha = a; g.translate(it.x, it.y);
        if (it.state === 'fall') {   // a faint glowing trail above it (it's coming from the sky)
          const ga = g.globalAlpha; g.globalAlpha = ga * 0.35; g.fillStyle = this.glow('rgba(255,230,200,0.5)');
          g.save(); g.translate(0, -18); g.scale(16, 30); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); g.globalAlpha = ga;
        }
        // soft white back-glow so the only hazard reads on every sky
        const ga = g.globalAlpha; g.globalAlpha = ga * 0.4; g.fillStyle = this.glow('rgba(255,255,255,0.55)');
        g.save(); g.scale(28, 28); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); g.globalAlpha = ga;
        g.rotate(it.rot || 0);
        if (custom) { g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(0, 0, PEB * 0.56, 0, TAU); g.fill(); g.strokeStyle = '#8a7fb0'; g.lineWidth = 3; g.stroke(); }
        if (spr) g.drawImage(spr, -dw / 2, -dh / 2, dw, dh);
        g.restore();
      }
      g.globalAlpha = 1;
    }

    /* Bristle on his skateboard: skate / push frames on the floor, a spinning spiky ball in the air; the board
     * follows hog.board (kick-flip rotation in the air). Tilt, squash, a little bob, invulnerability blink. */
    drawHog(mode) {
      const g = this.ctx, w = this.world, s = w.hog, A = MP.Assets;
      if (!s) return;
      const bob = this._bob || 0, face = s.face < 0 ? -1 : 1, sq = clamp(s.squash || 0, 0, 1);
      const blink = s.invuln > 0 && w.state !== 'dead' && Math.floor(this.time * 12) % 2 === 0;
      g.save(); if (blink) g.globalAlpha = 0.5;
      // board
      const b = s.board || { x: s.x, y: s.y + 38, rot: 0 };
      const bd = A.sprite('board', BOARD_W, BOARD_H);
      g.save(); g.translate(b.x, b.y - 6 + (s.air ? 0 : bob * 0.3)); g.rotate(b.rot || 0); g.scale(face, 1);   // deck top = 6 px above the deck centre
      if (bd) g.drawImage(bd, -BOARD_TOP[0], -BOARD_TOP[1], BOARD_W, BOARD_H);
      g.restore();
      // Bristle
      const ball = s.frame === 'ball' || (s.air && (s.curl || 0) > 0.5);
      const custom = A.hasCustom('hero');
      g.save(); g.translate(s.x, s.y + bob);
      if (ball) {
        g.rotate((s.spin || 0) * face);
        const k = 0.85 + 0.15 * clamp(s.curl == null ? 1 : s.curl, 0, 1);
        g.scale(k * (1 + 0.12 * sq), k * (1 - 0.12 * sq));
        if (custom) {
          const [fw, fh] = A.fit('hero', BALL, BALL), spr = A.sprite('custom:hero', fw, fh);
          if (spr) g.drawImage(spr, -fw / 2, -fh / 2, fw, fh);
        } else {
          const spr = A.sprite('bristle_ball', BALL, BALL);
          g.scale(face, 1);
          if (spr) g.drawImage(spr, -BALL / 2, -BALL / 2, BALL, BALL);
        }
      } else {
        // squash anchored at the feet so landing looks grounded
        g.translate(0, FEET); g.rotate(s.tilt || 0); g.scale(1 + 0.16 * sq, 1 - 0.16 * sq); g.translate(0, -FEET);
        if (custom) {
          const [fw, fh] = A.fit('hero', HOG_W, HOG_H), spr = A.sprite('custom:hero', fw, fh);
          const wob = 1 + 0.03 * Math.sin(this.time * 4);   // gentle breathing so a photo still feels alive
          g.scale(wob, 2 - wob);
          if (s.frame === 'bonk') g.rotate(Math.sin(this.time * 40) * 0.08);
          if (spr) g.drawImage(spr, -fw / 2, FEET - fh, fw, fh);
        } else {
          g.scale(face, 1);
          const fr = A.sprite('bristle_' + (s.frame || 'skate'), HOG_W, HOG_H) || A.sprite('bristle_skate', HOG_W, HOG_H);
          if (fr) g.drawImage(fr, -HOG_ANCHOR[0], -HOG_ANCHOR[1], HOG_W, HOG_H);
        }
      }
      g.restore();
      // dizzy stars circling his head after a bonk
      if (s.frame === 'bonk' && !ball) {
        const st = A.sprite('p_star', 32, 32);
        if (st) for (let i = 0; i < 3; i++) { const a = this.time * 6 + i * TAU / 3; g.drawImage(st, s.x + Math.cos(a) * 22 - 7, s.y - 40 + Math.sin(a) * 6 - 7, 14, 14); }
      }
      g.restore();
      g.globalAlpha = 1;
    }

    drawPointer(mode) {
      if (!(this.pointer && this.pointerHeld && mode === 'playing')) return;
      const c = this.world.cfg || {}, g = this.ctx, x = clamp(this.pointer[0], c.xMin || 60, c.xMax || 900), p = 0.5 + 0.5 * Math.sin(this.time * 8);
      g.fillStyle = `rgba(255,255,255,${0.55 + 0.3 * p})`;
      g.beginPath(); g.moveTo(x, 512); g.lineTo(x - 9, 526); g.lineTo(x + 9, 526); g.closePath(); g.fill();
    }

    drawFx() {
      const g = this.ctx, A = MP.Assets;
      for (const f of this.fx) {
        if (f.life < 0) continue;
        const k = f.life / f.max;
        if (f.k === 'sprite') {
          const spr = A.sprite(f.spr, 32, 32); if (!spr) continue;
          let s = f.size * (k < 0.15 ? k / 0.15 : 1); if (k > 0.7) s *= 1 - (k - 0.7) / 0.3 * 0.6;
          g.save(); g.globalAlpha = k > 0.75 ? (1 - k) * 4 : 1; g.translate(f.x, f.y); g.rotate(f.rot || 0);
          g.drawImage(spr, -s / 2, -s / 2, s, s); g.restore();
        } else if (f.k === 'spark') {
          g.globalAlpha = 1 - k; g.fillStyle = f.color;
          g.beginPath(); g.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'puff') {
          g.globalAlpha = 0.7 * (1 - k); g.fillStyle = f.color;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.6 + k * 0.8), 0, TAU); g.fill();
        } else if (f.k === 'circle') {
          g.globalAlpha = 0.85 * (1 - k); g.strokeStyle = f.color; g.lineWidth = 5 * (1 - k) + 1;
          const rr = lerp(f.r0, f.r1, 1 - (1 - k) * (1 - k));
          g.beginPath(); g.ellipse(f.x, f.y, rr, rr * (f.round ? 1 : 0.6), 0, 0, TAU); g.stroke();
        } else if (f.k === 'fly') {   // freed cupcake flying into the HUD box, shrinking a little on the way
          const d = this.contentSprite({ kind: 'cupcake', color: f.color }); if (!d.spr) continue;
          const s = 1 - 0.35 * Math.max(0, (k - 0.25) / 0.75);
          g.save(); g.globalAlpha = k > 0.92 ? (1 - k) / 0.08 : 1; g.translate(f.x, f.y); g.rotate(f.rot || 0); g.scale(s, s);
          g.drawImage(d.spr, -d.w / 2, -d.h / 2, d.w, d.h); g.restore();
        }
      }
      g.globalAlpha = 1;
    }
    drawTexts() {
      const g = this.ctx;
      for (const t of this.texts) {
        const k = t.life / t.max, pop = k < 0.2 ? easeOutBack(k / 0.2) : 1;
        g.save(); g.globalAlpha = clamp(1.8 - k * 1.8, 0, 1);
        g.translate(t.x, t.y); g.scale(pop, pop);
        this.text(t.text, 0, 0, t.size, t.color, '#3a2550');
        g.restore();
      }
    }

    /* HUD in screen space, kept inside the safe area: hearts + magnet timer (top-left), score + streak (centre),
     * cupcake box (top-right, left of the pause/sound buttons, or under them on narrow screens). */
    hud() {
      const g = this.ctx, w = this.world, A = MP.Assets, hm = w.heartsMax || 3, I = this.ins, VW = this.VW;
      const s = w.hog || {};
      if (this._act) {   // corner button: fade while Bristle skates near it so he never hides behind it
        const op = this._actPlace === 'corner' && s.x > (this.layout ? this.layout.playMax - 70 : 780) ? '0.45' : '';
        if (this._act.style.opacity !== op) this._act.style.opacity = op;
        const rdy = !s.air;
        if (this._act._rdy !== rdy) { this._act._rdy = rdy; this._act.classList.toggle('charging', !rdy); }
      }
      if (!this._hudBtn) this._measureHud();
      const zn = MP.Assets.SEASONS[w.zone || 0], pal = (A.palette && A.palette[zn]) || {}, pill = this.pillColor(pal.hud);
      this._pill = pill;
      const L = I.left, T = I.top;
      g.save(); g.translate(L, T);
      // hearts (top-left)
      g.fillStyle = pill; this.roundRect(14, 12, 24 + 30 * hm, 46, 23); g.fill();
      const hf = A.sprite('heart_full', 28, 28), he = A.sprite('heart_empty', 28, 28);
      for (let i = 0; i < hm; i++) { const sp = i < w.hearts ? hf : he; if (sp) g.drawImage(sp, 26 + i * 30, 21, 28, 28); }
      // magnet timer (next to the hearts, only while the magnet is on)
      const rx = 14 + 24 + 30 * hm + 10, m = w.magnet || { t: 0 };
      let leftW = 0;
      if (m.t > 0) {
        leftW = 58;
        const fr = clamp(m.t / (m.dur || 7), 0, 1), mp = 1 + 0.3 * (this._magPop || 0);
        g.fillStyle = pill; this.roundRect(rx, 12, 58, 46, 23); g.fill();
        g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 5; g.beginPath(); g.arc(rx + 29, 35, 16, 0, TAU); g.stroke();
        g.strokeStyle = m.t < 1.5 && Math.floor(this.time * 8) % 2 ? '#ffffff' : MAGNET_COLOR;
        g.beginPath(); g.arc(rx + 29, 35, 16, -Math.PI / 2, -Math.PI / 2 + TAU * fr); g.stroke();
        const mg = A.sprite('magnet', 24, 24);
        if (mg) { g.save(); g.translate(rx + 29, 35); g.scale(mp, mp); g.drawImage(mg, -12, -12, 24, 24); g.restore(); }
      }
      g.restore();
      // score + streak (centre of the safe area)
      const cx = (L + VW - I.right) / 2, leftEnd = L + rx + leftW;
      const sdy = leftEnd > cx - 86 ? 60 : 0;   // narrow phone + many hearts: score drops to a second row
      g.save(); g.translate(cx, T + sdy);
      if (this._lastScore !== w.score) { this._scorePop = 1; this._lastScore = w.score; }
      this._scorePop = Math.max(0, (this._scorePop || 0) - 0.06);
      const sc = 1 + 0.2 * this._scorePop;
      g.save(); g.translate(0, 34); g.scale(sc, sc); this.text(String(w.score), 0, 0, 44, '#ffffff', '#3a2550', 'center', 8); g.restore();
      const c = w.cfg || {}, th = c.multThresholds || c.multAt || c.streakThresholds || [0, 8, 20], mu = w.mult || 1;
      const lo = th[mu - 1] || 0, hi = th[mu], frac = hi ? clamp(((w.combo || 0) - lo) / (hi - lo), 0, 1) : 1;
      const mpp = 1 + 0.3 * (this._multPop || 0);
      g.fillStyle = 'rgba(40,25,70,0.55)'; this.roundRect(-90, 61, 180, 24, 12); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = ['#bfe6ff', '#8ff0b0', '#ffd84a'][Math.min(3, mu) - 1];
      if (frac > 0) { this.roundRect(-78, 64, Math.max(18, 156 * frac), 18, 9); g.globalAlpha = 0.6; g.fill(); g.globalAlpha = 1; }
      this.text('streak ' + (w.combo || 0), -72, 73, this.cssScale < 0.8 ? 19 : 16, '#ffffff', '#3a2550', 'left', 4);
      g.save(); g.translate(54, 73); g.scale(mpp, mpp); this.text('×' + mu, 0, 0, this.cssScale < 0.8 ? 20 : 17, mu >= 2 ? '#ffe14d' : '#ffffff', '#3a2550', 'center', 4); g.restore();
      g.restore();
      // cupcake box: left of the pause/sound buttons, or on a second row under them when that would hit the score
      const btn = this._hudBtn || { l: VW - I.right - 130, b: T + 64 };
      let jx = btn.l - 12 - 128, jy = T + 8;
      if (jx - 8 < cx + 92) { jx = VW - I.right - 14 - 128; jy = Math.max(T + 8, btn.b + 4); }
      const jp = 1 + 0.25 * (this._boxPop || 0);
      g.fillStyle = pill; this.roundRect(jx - 8, jy + 4, 136, 46, 23); g.fill();
      const box = A.sprite('box', 40, 35);
      const jf = clamp((w.box || 0) / (w.boxTarget || 1), 0, 1);
      if (box) { g.save(); g.translate(jx + 16, jy + 27); g.scale(jp, jp); g.drawImage(box, -20, -18, 40, 35); g.restore(); }
      this._boxPos = [jx + 16 - this.SX, jy + 27 - this.SY];   // where freed cupcakes fly to (scene coords)
      this.text((w.box || 0) + '/' + (w.boxTarget || 0), jx + 44, jy + 21, 18, jf >= 1 ? '#8ff0b0' : '#ffffff', null, 'left');
      g.fillStyle = 'rgba(255,255,255,0.22)'; this.roundRect(jx + 44, jy + 34, 74, 8, 4); g.fill();
      if (jf > 0) { g.fillStyle = '#ff9cc8'; this.roundRect(jx + 44, jy + 34, Math.max(8, 74 * jf), 8, 4); g.fill(); }
      const zi = this.zoneInfo(w.zone || 0);
      this.text(zi.short + (w.lap > 0 ? ' · Lap ' + (w.lap + 1) : ''), jx + 60, jy + 62, this.cssScale < 0.8 ? 19 : 16, '#ffffff', '#3a2550', 'center', 4);
    }
    /* HUD pill colour: the zone palette's hud colour (a dark tone of the sky) at 85 % so the sky shows through */
    pillColor(hex) {
      if (this._pillHex === hex && this._pillCol) return this._pillCol;
      let c = 'rgba(47,103,156,0.85)';
      const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
      if (m) { const n = parseInt(m[1], 16); c = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.85)`; }
      this._pillHex = hex; this._pillCol = c; return c;
    }

    drawBanner() {
      const g = this.ctx, b = this.banner, bi = this.zoneInfo(b.s), t = b.t, w = this.world;
      let x;
      if (t < 0.4) x = lerp(-W, 0, easeOutBack(t / 0.4)); else if (t < 1.25) x = 0; else x = lerp(0, W, Math.pow((t - 1.25) / 0.35, 2));
      // tall screens: high in the upper sky (clear of the jump button); narrow screens: scaled to fit the visible width
      g.save(); g.translate(x, this.SY >= 150 ? -Math.round(this.SY * 0.5) - 140 : 40);
      const k = Math.min(1, (this.VW - 32) / 660);
      if (k < 1) { g.translate(W / 2, 160); g.scale(k, k); g.translate(-W / 2, -160); }
      g.fillStyle = bi.color; g.globalAlpha = 0.94;
      g.beginPath(); g.moveTo(W / 2 - 310, 112); g.lineTo(W / 2 + 310, 104); g.lineTo(W / 2 + 328, 206); g.lineTo(W / 2 - 292, 214); g.closePath(); g.fill();
      g.globalAlpha = 1;
      const lv = w ? (w.level || 0) + 1 : 1;
      this.text('Level ' + lv + ': ' + bi.name + '!', W / 2, 142, 38, '#ffffff', bi.dark, 'center', 9);
      let hs = 20;   // the hint must fit inside the visible width after scaling
      g.font = `900 ${hs}px ${FONT}`;
      while (hs > 14 && g.measureText(bi.hint).width * k > this.VW - 40) { hs--; g.font = `900 ${hs}px ${FONT}`; }
      this.text(bi.hint, W / 2, 184, hs, '#ffffff', bi.dark, 'center', 5);
      g.restore();
    }

    debugDraw() {
      const g = this.ctx, w = this.world, c = w.cfg || {}, s = w.hog;
      if (!s) return;
      g.strokeStyle = 'red'; g.lineWidth = 1.5;
      g.beginPath(); g.arc(s.x, s.y, lerp(c.hogR || 28, c.hogBallR || 30, clamp(s.curl || 0, 0, 1)), 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-this.SX, c.floorY || FLOOR); g.lineTo(this.VW - this.SX, c.floorY || FLOOR); g.stroke();
      g.strokeStyle = '#ff0'; g.beginPath(); g.moveTo(-this.SX, c.escapeY || 60); g.lineTo(this.VW - this.SX, c.escapeY || 60); g.stroke();
      g.strokeStyle = '#0f0'; g.lineWidth = 2;
      const x0 = c.xMin != null ? c.xMin : 60, x1 = c.xMax != null ? c.xMax : 900;
      g.beginPath(); g.moveTo(x0, 90); g.lineTo(x0, 500); g.moveTo(x1, 90); g.lineTo(x1, 500); g.stroke();
      g.lineWidth = 1; g.strokeStyle = '#0ff';
      for (const it of w.items) { if (it.state !== 'rise' && it.state !== 'fall') continue; g.beginPath(); g.arc(it.x, it.y, it.r || (it.kind === 'pebble' ? 18 : BUBBLE_R), 0, TAU); g.stroke(); }
      g.strokeStyle = '#f0f'; for (const v of (w.vents || [])) { g.strokeRect(v.x - 3, 468, 6, 6); }
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  MP.Renderer = Renderer;
})(window.MP = window.MP || {});
