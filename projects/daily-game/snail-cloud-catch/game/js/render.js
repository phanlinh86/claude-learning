/* SC.Renderer — mobile-first: the canvas fills the screen in portrait and landscape (logical VW×VH, see
 * resize()). The 960×540 "scene" (cloud bank at the top, cloud floor at y 492) is bottom-anchored and centred
 * inside it; the sky, cloud strips, cloud bank and floor are extended to the sides / top, and the HUD is laid out in
 * screen space around the safe-area insets (notch, home bar).
 * Draw order (DESIGN §2): sky → castle → drifting clouds → back particles → cloud bank → peeking twinkles →
 * falling items → Shelly (jet flame, shadow) + basket → caught items → basket front → floor → front particles →
 * fx → HUD → level banner. Performance rules from the sister games apply (pixel-exact layer blits, interpolation,
 * cached gradients, pre-warm, capped backing store, adaptive quality). */
(function (SC) {
  'use strict';
  const W = 960, H = 540;   // the scene (all gameplay coordinates); the canvas is this.VW × this.VH
  const ZONE_INFO = [
    { key: 'sunny', name: 'Sunny Skies', color: '#4fb4ec', dark: '#1d5a86', hint: 'Catch the falling stars!' },
    { key: 'rain', name: 'Rainy Clouds', color: '#7d7fb8', dark: '#34356a', hint: 'Wet stars fall faster. Watch the thunder puffs!' },
    { key: 'wind', name: 'Windy Heights', color: '#e88f6a', dark: '#7a3a24', hint: 'Whoosh! Gusts push the stars sideways' },
    { key: 'snow', name: 'Snowy Towers', color: '#6a5aa8', dark: '#2a2058', hint: 'Icy clouds: Shelly slides!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  // top colours (body / highlight) of each weather's cloud bank, for the puffy shelf top on tall screens (palette.json bankTop overrides)
  const BANK_TOP = { sunny: ['#f4f9ff', '#ffffff'], rain: ['#d9d8ea', '#ecebf6'], wind: ['#fbe9e2', '#fff6f0'], snow: ['#dfe2f6', '#f4f5ff'] };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const SH_W = 96, SH_H = 80, SK = 0.8;                 // Shelly drawn size; viewBox (120×100) → drawn scale
  const SH_ANCHOR = [60 * SK, 58 * SK];                 // body centre inside the drawn sprite
  const NOZZLE = [(22 - 60) * SK, (78 - 58) * SK];      // jet nozzle relative to the body centre (facing right)
  const BK_W = 64, BK_H = 48, BK = 0.8;                 // basket drawn size; viewBox (80×60) → drawn scale
  const BK_RIM = [40 * BK, 14 * BK];                    // rim centre inside the drawn basket
  const STAR = 32, GOLD = 44, PUFF_W = 46, PUFF_H = 40;
  const STAR_KEYS = ['star_yellow', 'star_pink', 'star_blue'];
  const STAR_COLORS = ['#ffd84a', '#ff8fc8', '#7cc8ff'];
  const GOLD_COLOR = '#ffc21a';
  const PEEK_Y = 96;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.zapFlash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.pointer = null;
      this._ox = 0; this._oy = 0; this._shx = 0; this._shy = 0;
      this.VW = W; this.VH = H; this.SX = 0; this.SY = 0; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._ext = new Map(); this._grads = {};
      this._cloudOff = 0; this._bankOff = 0; this._trailAcc = 0;
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 0;
      this.resize();
    }

    /* Logical canvas size by aspect (education-game rule, adapted to a side-view scene):
     *  landscape ≥ 16:9 → height 540, width up to 1280 (iPhone ≈ 1170);  4:3-ish landscape → width 960, taller sky (iPad 960×720);
     *  portrait → width 560 (scene cropped to its middle 560 px so Shelly stays big on a phone), height up to 1600 (sky above).
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
      const dpr = window.devicePixelRatio || 1, touch = !!(SC.Game && SC.Game.isTouch);
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
      // visible part of the scene and the cloud floor Shelly may use on this screen
      const visL = -this.SX + I.left, visR = this.VW - this.SX - I.right;
      let playMin = Math.max(70, visL + 50), playMax = Math.min(890, visR - 50);
      // on-screen 🚀 Jet Hop button (touch): in the empty sky when there is room above the scene (portrait, iPad),
      // otherwise bottom-right, and then Shelly's range stops short of it so the button never covers her
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
      SC.Assets.setScale(this.px);
      if (this.vis) SC.Assets.warmSeason(this.vis.cur);
    }
    /* Where the DOM pause/sound buttons sit, in logical px (they are sized in CSS px, ≥ 44 px for fingers). */
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      if (r.width > 0 && c.width > 0) { const k = this.VW / c.width; this._hudBtn = { l: (r.left - c.left) * k, b: (r.bottom - c.top) * k }; }
    }
    /* Pointer (CSS px) → SCENE coordinates (what the world uses). */
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW - this.SX, (cy - r.top) / r.height * this.VH - this.SY]; }
    attach(world, weather) { this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.banner = null; this.shake = 0; this.flash = 0; this.zapFlash = 0; }

    setSeason(i, instant) {
      i = ((i % 4) + 4) % 4;
      SC.Assets.warmSeason((i + 1) % 4); SC.Assets.warmSeason(0);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(b) { this.banner = { s: b, t: 0 }; }
    zoneInfo(z) {
      const zi = ZONE_INFO[z] || ZONE_INFO[0], p = SC.Assets.palette && SC.Assets.palette[zi.key];
      return p && p.banner ? Object.assign({}, zi, { color: p.banner }) : zi;
    }

    /* Jet nozzle in scene coordinates (also used by main.js to emit the weather's jet puffs). */
    nozzle(s) {
      const f = s.face < 0 ? -1 : 1, t = s.tilt || 0, ct = Math.cos(t), st = Math.sin(t);
      const lx = NOZZLE[0] * f, ly = NOZZLE[1];
      return [s.x + lx * ct - ly * st, s.y + (this._bob || 0) + lx * st + ly * ct];
    }

    // ---------------- events → effects ----------------
    onEvents(evts) {
      const w = this.world, s = w && w.snail;
      for (const e of evts) {
        switch (e.type) {
          case 'catch': {
            const gold = e.kind === 'gold', col = gold ? GOLD_COLOR : '#fff6c0';
            this.ring(e.x, e.y, gold ? '#ffe14d' : '#ffffff', gold ? 0.6 : 0.35, gold);
            this.sparks(e.x, e.y - 4, gold ? 16 : 7, col);
            if (gold) for (let i = 0; i < 12; i++) { const a = i / 12 * TAU, sp = 110 + Math.random() * 80; this.fx.push({ k: 'sprite', spr: 'p_sparkle', x: e.x, y: e.y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 160, life: -i * 0.01, max: 0.8, size: 12 + Math.random() * 8, rot: 0, vr: 4 }); }
            // "+N" popup behind Shelly's back (her face is on the side she is looking at)
            const f = s && s.face < 0 ? -1 : 1, px = clamp(e.x - f * 34, 40, 920);
            this.texts.push({ text: '+' + e.points, x: px, y: e.y - 44, life: 0, max: 0.9, size: gold ? 30 : 20 + 3 * Math.min(3, e.mult || 1), color: gold || (e.mult || 1) >= 3 ? '#ffe14d' : '#ffffff' });
            if (gold) this.texts.push({ text: 'GOLDEN STAR!', x: 480, y: 168, life: 0, max: 1.2, size: 34, color: '#ffe14d', big: true });
            break;
          }
          case 'multup':
            this.texts.push({ text: '×' + e.mult + ' STREAK!', x: 480, y: 150, life: 0, max: 1.3, size: 30 + e.mult * 4, color: '#ffe14d', big: true });
            this._multPop = 1;
            break;
          case 'miss':
            this.puffs(e.x, Math.min(e.y, 490), 5, '#ffffff');
            if (Math.max(e.lost || 0, e.combo || 0) >= 3) this.texts.push({ text: 'Streak lost', x: clamp(e.x, 90, 870), y: 430, life: 0, max: 0.9, size: 20, color: '#ffe0f0' });
            break;
          case 'zap':
            this.shake = 0.22; this.zapFlash = 0.5;
            this.texts.push({ text: 'Bzzt!', x: clamp(e.x, 80, 880), y: e.y - 70, life: 0, max: 0.9, size: 30, color: '#fff27a' });
            for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.45, sp = 120 + Math.random() * 60; this.fx.push({ k: 'sprite', spr: 'p_zap', x: e.x, y: e.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 220, life: 0, max: 0.55, size: 16 + Math.random() * 6, rot: a, vr: 6 }); }
            this.sparks(e.x, e.y, 8, '#fff27a');
            break;
          case 'pop': this.puffs(e.x, e.y, 5, '#c8cce8'); break;
          case 'heal': this.texts.push({ text: '+1 heart', x: 110, y: 90, life: 0, max: 1.4, size: 22, color: '#ff8fae' }); break;
          case 'puffland': this.puffs(e.x, e.y, 6, '#b8bcd8'); this.sparks(e.x, e.y - 6, 4, '#fff27a'); break;
          case 'jet': if (s) { const n = this.nozzle(s); this.ring(n[0], n[1] + 4, '#ffffff', 0.35, false); this.puffs(n[0], n[1] + 6, 4, '#ffffff'); } break;
          case 'jetland': if (s) this.puffs(s.x, 492, 6, '#ffffff'); break;
          case 'jetcharged': this._jetPop = 1; break;
          case 'gust': this._gustPop = 1; break;
          case 'jarfull':
            this.texts.push({ text: 'Star jar full!', x: 480, y: 190, life: 0, max: 1.6, size: 40, color: '#ffe14d', big: true });
            this._jarPop = 1;
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
    ring(x, y, color, max, big) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 10, r1: big ? 90 : 44, color }); }

    update(dt) {
      this.time += dt;
      const w = this.world;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.2);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.6) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.zapFlash = Math.max(0, this.zapFlash - dt * 2);
      ['_multPop', '_jetPop', '_gustPop', '_jarPop'].forEach(k => { this[k] = Math.max(0, (this[k] || 0) - dt * 2); });
      // drifting cloud strip: 6 px/s; in the wind level it follows the wind
      const wx = w && w.wind && this.vis.cur === 2 ? (w.wind.x || 0) : 0;
      this._cloudOff += (6 + wx * 0.25) * dt;
      this._bankOff += (1.5 + wx * 0.06) * dt;
      // golden stars leave a sparkle trail
      if (w && w.items) {
        this._trailAcc += dt;
        if (this._trailAcc > 0.06) {
          this._trailAcc = 0;
          for (const it of w.items) if (it.kind === 'gold' && it.state === 'fall' && this.fx.length < 300)
            this.fx.push({ k: 'sprite', spr: Math.random() < 0.5 ? 'p_sparkle' : 'p_twinkle', x: it.x + (Math.random() - .5) * 14, y: it.y - 8, vx: (Math.random() - .5) * 20, vy: -12, g: 0, life: 0, max: 0.5, size: 8 + Math.random() * 6, rot: 0, vr: 3 });
        }
      }
      for (const f of this.fx) {
        f.life += dt; if (f.life < 0) continue;
        f.vy += (f.g || 0) * dt; f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt;
        if (f.vr) f.rot += f.vr * dt;
      }
      this.fx = this.fx.filter(f => f.life < f.max);
      if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
      for (const t of this.texts) { t.life += dt; if (!t.big) t.y -= 34 * dt; }
      this.texts = this.texts.filter(t => t.life < t.max);
    }

    // ---------------- helpers ----------------
    /* 1:1 device-pixel blit of a pre-rasterized layer (no resampling). dx/dy in logical px, rounded to device px. */
    layer(key, alpha, dx, dy, lw, lh) {
      const spr = SC.Assets.sprite(key, lw || W, lh || H);   // scene-space layer at its own size
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
      const c = SC.Assets.custom[slot]; if (!c) return false;
      const g = this.ctx, VW = this.VW, VH = this.VH, k = Math.max(VW / c.width, VH / c.height), dw = c.width * k, dh = c.height * k;
      if (VH > VW * 1.2) return this.customBgTall(slot, c, alpha);
      this.screenOn();
      g.globalAlpha = alpha;
      g.drawImage(SC.Assets.sprite('custom:' + slot, dw, dh), (VW - dw) / 2, (VH - dh) / 2, dw, dh);
      g.fillStyle = 'rgba(255,248,240,0.25)'; g.fillRect(0, 0, VW, VH);   // soften so Shelly and the stars stay readable
      g.globalAlpha = 1;
      this.sceneOn();
      return true;
    }
    /* Tall portrait: fit the photo to the sky band (top of the screen down to just under the horizon), top-aligned,
     * and fade its lower edge into the zone's own sky; built once per picture/size into a device-pixel canvas. */
    customBgTall(slot, c, alpha) {
      const zone = SC.Assets.SLOTS.find(q => q.id === slot), z = zone ? zone.season : 0;
      const key = 'c|' + slot + '|' + (SC.Assets._ver || 0) + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + c.width;
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
     * sideways, its top rows averaged and stretched upwards (portrait), plus a few stars in the snowy twilight. */
    skyExt(z) {
      const key = z + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3);
      let c = this._ext.get(key);
      if (c) return c;
      const n = SC.Assets.SEASONS[z], spr = SC.Assets.sprite(n + '_sky', W, H);
      if (!spr) return null;
      c = document.createElement('canvas'); c.width = Math.round(this.VW * this.px); c.height = Math.round(this.VH * this.px);
      const g = c.getContext('2d'), dx = this._sxd, dy = this._syd, sw = spr.width, sh = spr.height;
      g.imageSmoothingEnabled = true;
      g.drawImage(spr, dx, dy);
      if (dx > 0) {
        const col = (sx0) => { const t = document.createElement('canvas'); t.width = 1; t.height = sh; const tg = t.getContext('2d'); tg.imageSmoothingQuality = 'high'; tg.drawImage(spr, sx0, 0, Math.round(96 * this.px), sh, 0, 0, 1, sh); return t; };
        g.drawImage(col(0), 0, 0, 1, sh, 0, dy, dx + 1, sh);
        g.drawImage(col(sw - Math.round(96 * this.px)), 0, 0, 1, sh, dx + sw - 1, dy, c.width - dx - sw + 1, sh);
      }
      if (dy > 0) {
        const t = document.createElement('canvas'); t.width = 1; t.height = 1;
        const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
        tg.drawImage(c, 0, dy + 1, c.width, Math.max(2, Math.round(6 * this.px)), 0, 0, 1, 1);
        g.drawImage(t, 0, 0, 1, 1, 0, 0, c.width, dy + 1);
        if (z === 3) {   // snowy twilight: stars in the extra sky
          let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
          const nStars = Math.round(this.VW * this.SY / 9000);
          for (let i = 0; i < nStars; i++) {
            g.globalAlpha = 0.35 + 0.55 * rnd(); g.fillStyle = '#fff6d8';
            g.beginPath(); g.arc(rnd() * c.width, rnd() * dy, (0.8 + rnd() * 1.6) * this.px, 0, TAU); g.fill();
          }
          g.globalAlpha = 1;
        }
      }
      if (this._ext.size > 4) this._ext.delete(this._ext.keys().next().value);
      this._ext.set(key, c);
      return c;
    }
    /* sky + castle islands + drifting clouds (or the player's own background) */
    backdrop(b, alpha) {
      const n = SC.Assets.SEASONS[b], g = this.ctx;
      if (this.customBg('bg_' + n, alpha)) return;
      const ext = this.skyExt(b);
      this.screenOn();
      if (ext) { g.setTransform(1, 0, 0, 1, this._shx, this._shy); if (alpha < 1) g.globalAlpha = alpha; g.drawImage(ext, 0, 0); g.globalAlpha = 1; }
      else { const p = SC.Assets.palette[n]; g.fillStyle = (p && p.sky) || '#9fd8f5'; g.fillRect(0, 0, this.VW, this.VH); }
      this.sceneOn();
      // far cloud islands (1:1 blit, centred; on wide screens their sides simply fade into the extended sky)
      this.layer(n + '_castle', alpha, 0, 0);
      // drifting cloud strip at y 120, tiled across the visible width; portrait gets fainter strips higher up
      const cs = SC.Assets.sprite(n + '_clouds', W, 220);
      if (cs) for (let k = 0; k < 8; k++) {
        const y = 120 - 230 * k;
        if (k > 0 && y < -this.SY - 120) break;
        const a = alpha * (k === 0 ? 1 : Math.max(0.5, 0.85 - 0.12 * k));
        this.tiled(cs, y, this._cloudOff * (k === 0 ? 1 : 0.6 + 0.1 * k) + 377 * k, a);
      }
    }
    /* Cloud bank across the top (tileable). On tall screens (sky above the scene) a puffy shelf top in the bank's own
       top colour makes it read as one floating cloud shelf (a mirrored copy looked like a doubled white wall). */
    bank(z, alpha) {
      if (alpha <= 0) return;
      const n = SC.Assets.SEASONS[z], spr = SC.Assets.sprite(n + '_bank', W, 150);
      if (!spr) return;
      if (this.SY > 0) {
        const g = this.ctx, pal = SC.Assets.palette && SC.Assets.palette[n];
        const [c0, c1] = (pal && pal.bankTop) || BANK_TOP[n] || BANK_TOP.sunny;
        const x0 = -this.SX - 40, x1 = this.VW - this.SX + 40, off = ((this._bankOff % 120) + 120) % 120;
        g.globalAlpha = alpha; g.fillStyle = c0;
        for (let x = x0 - off, i = 0; x < x1 + 120; x += 60, i++) { const r = 34 + 7 * (i % 3); g.beginPath(); g.arc(x, 30 - r * 0.35, r, 0, TAU); g.fill(); }
        g.fillStyle = c1; g.globalAlpha = alpha * 0.7;
        for (let x = x0 - off + 30, i = 0; x < x1 + 120; x += 60, i++) { const r = 16 + 6 * (i % 2); g.beginPath(); g.arc(x, 20 - r * 0.6, r, 0, TAU); g.fill(); }
        g.globalAlpha = alpha; g.fillStyle = c0; g.fillRect(x0, 20, x1 - x0, 30);
        g.globalAlpha = 1;
      }
      this.tiled(spr, 0, this._bankOff, alpha);
    }
    /* Cloud floor + mirrored copies to the sides on wide screens (seamless at the joins, pixel-exact). */
    ground(z, alpha) {
      const spr = SC.Assets.sprite(SC.Assets.SEASONS[z] + '_ground', W, H);
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
      if (w.snail) { const s = w.snail; this._lerp(s, 'x', '_px'); this._lerp(s, 'y', '_py'); this._lerp(s, 'rimX', '_prx'); this._lerp(s, 'rimY', '_pry'); }
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
      if (this._trimKey !== v.cur * 4 + v.prev) { this._trimKey = v.cur * 4 + v.prev; SC.Assets.trimSeasons([v.cur, v.prev, (v.cur + 1) % 4, 0]); }
      const fading = v.t < 1 && v.prev !== v.cur;
      const s = w && w.snail;
      this._bob = s && !(s.hop > 1) && w.state !== 'dead' ? Math.sin(this.time * 4.2) * 1.8 : 0;

      if (fading) { this.backdrop(v.prev, 1); this.fadeLayer(() => this.backdrop(v.cur, 1), v.t); }
      else this.backdrop(v.cur, 1);
      if (this.weather) { this.ambient(this.weather.ambient); this.particles('back'); }
      if (fading) { this.bank(v.prev, Math.min(1, 2 - 2 * v.t)); this.bank(v.cur, v.t); }
      else this.bank(v.cur, 1);
      if (w) {
        this.drawPeeks();
        this.drawItems('fall');
        this.drawShelly(mode);
      }
      if (fading) { this.ground(v.prev, Math.min(1, 2 - 2 * v.t)); this.ground(v.cur, v.t); }
      else this.ground(v.cur, 1);
      if (w) this.drawShadow();          // on top of the cloud floor, so Jet Hop keeps its height cue
      if (w) this.drawItems('floor');   // bouncing / fading stars and popping puffs sit on the cloud floor
      if (this.weather) this.particles('front');
      this.drawFx();
      if (w && mode !== 'title') this.drawPointer(mode);
      if (mode !== 'title') this.drawTexts();
      if (this.banner && mode !== 'title') this.drawBanner();
      if (this.debug && w) this.debugDraw();
      this.screenOn();
      const VW = this.VW, VH = this.VH;
      if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${(this.flash * 0.55).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
      if (this.zapFlash > 0) { g.fillStyle = `rgba(255,240,140,${(this.zapFlash * 0.25).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
      if (w && w.state === 'dead') { g.fillStyle = 'rgba(40,30,80,0.22)'; g.fillRect(0, 0, VW, VH); }
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
      const g = this.ctx, A = SC.Assets;
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

    /* a twinkle that grows out of the cloud bank where the next item will drop (gold = golden, puff = grey) */
    drawPeeks() {
      const g = this.ctx, w = this.world, A = SC.Assets, pt = (w.cfg && w.cfg.peekTime) || 0.6;
      const tw = A.sprite('p_twinkle', 32, 32);
      for (const it of w.items) {
        if (it.state !== 'peek') continue;
        const k = clamp((it.t || 0) / pt, 0, 1), pulse = 0.85 + 0.15 * Math.sin(this.time * 14 + it.id);
        const col = it.kind === 'gold' ? GOLD_COLOR : it.kind === 'puff' ? '#8a8fb8' : STAR_COLORS[it.color || 0];
        const r = (14 + 22 * k) * pulse * (it.kind === 'gold' ? 1.3 : 1), y = it.y != null ? it.y : PEEK_Y;
        g.save(); g.translate(it.x, y);
        // soft blue-grey backing disc so the glow reads on the white cloud bank
        g.globalAlpha = 0.4 + 0.6 * k; g.fillStyle = 'rgba(60,80,150,0.16)';
        g.beginPath(); g.ellipse(0, 0, r * 1.1, r * 0.9, 0, 0, TAU); g.fill();
        g.globalAlpha = 0.35 + 0.5 * k; g.fillStyle = this.glow(col);
        g.save(); g.scale(r, r * 0.8); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore();
        if (it.kind === 'puff') {   // a little grey puff and a tiny zigzag peeking out
          g.globalAlpha = 0.5 + 0.5 * k; g.fillStyle = '#9a9ec4';
          g.beginPath(); g.arc(-5, 0, 6 + 3 * k, 0, TAU); g.arc(5, -2, 7 + 3 * k, 0, TAU); g.fill();
          g.strokeStyle = '#ffd84a'; g.lineWidth = 2; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-2, 8); g.lineTo(2, 12); g.lineTo(-1, 14); g.lineTo(3, 19); g.stroke();
        } else if (tw) {
          const s = (18 + 18 * k) * pulse; g.globalAlpha = 0.6 + 0.4 * k; g.rotate(this.time * 2 + it.id);
          g.drawImage(tw, -s / 2, -s / 2, s, s);
        }
        g.restore();
      }
      g.globalAlpha = 1;
    }

    itemSprite(it) {
      const A = SC.Assets;
      if (it.kind === 'puff') {
        const fr = (Math.floor(this.time * 4 + (it.id || 0)) % 2) ? 'thunder_2' : 'thunder';
        if (A.hasCustom('puff')) { const [fw, fh] = A.fit('puff', PUFF_W, PUFF_H); return { spr: A.sprite('custom:puff', fw, fh), w: fw, h: fh, zig: true, s: PUFF_W }; }
        return { spr: A.sprite(fr, PUFF_W, PUFF_H), w: PUFF_W, h: PUFF_H, s: PUFF_W };
      }
      const gold = it.kind === 'gold', s = gold ? GOLD : STAR;
      if (A.hasCustom('star')) { const cs = gold ? 38 : STAR; const [fw, fh] = A.fit('star', cs, cs); return { spr: A.sprite('custom:star', fw, fh), w: fw, h: fh, ring: gold ? GOLD_COLOR : STAR_COLORS[it.color || 0], halo: gold, s: cs }; }
      return { spr: A.sprite(gold ? 'star_gold' : STAR_KEYS[it.color || 0] || 'star_yellow', s, s), w: s, h: s, s };
    }
    drawItem(it, inBasket) {
      const g = this.ctx, d = this.itemSprite(it);
      if (!d.spr) return;
      let a = it.alpha == null ? 1 : it.alpha;
      if (a <= 0.01) return;
      const puff = it.kind === 'puff';
      g.save(); g.globalAlpha = a;
      let y = it.y;
      if (puff && it.state === 'fall') y += Math.sin(this.time * 3.2 + (it.id || 0)) * 3;   // grumpy bob
      g.translate(it.x, y);
      let k = this.cssScale < 0.8 ? 1.35 : 1;   // phones: items drawn 35 % bigger (visual only, hitboxes unchanged)
      if (inBasket) k *= 1 - 0.35 * clamp((it.t || 0) / 0.25, 0, 1);
      if (it.state === 'pop') k *= 1 + 0.6 * clamp((it.t || 0) / 0.3, 0, 1);
      g.scale(k, k);
      if (!puff) {
        if (d.halo || it.kind === 'gold') {   // gold: warm pulsing halo, reads as special by size + glow (colour-blind safe)
          const ga = g.globalAlpha; g.globalAlpha = ga * (0.45 + 0.2 * Math.sin(this.time * 6 + it.id)); g.fillStyle = this.glow('rgba(255,214,80,0.7)');
          g.save(); g.scale(34, 34); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); g.globalAlpha = ga;
        }
        g.rotate(it.rot || 0);
        const fl = 1 + 0.06 * Math.sin(it.sway || 0);   // flutter squish
        g.scale(fl, 2 - fl);
      } else {
        // soft white back-glow: the only hazard must read at a glance on every sky (snow was ≈ 1 : 1)
        const ga = g.globalAlpha; g.globalAlpha = ga * 0.55; g.fillStyle = this.glow('rgba(255,255,255,0.6)');
        g.save(); g.scale(30, 26); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); g.globalAlpha = ga;
        g.rotate(clamp(it.vx || 0, -60, 60) / 600);
        if (d.zig) {   // custom puff picture: a white disc + ring, like the custom star, so it shows on dark backgrounds
          g.fillStyle = 'rgba(255,255,255,0.8)'; g.beginPath(); g.arc(0, 0, d.s * 0.56, 0, TAU); g.fill();
          g.strokeStyle = '#7a7fc0'; g.lineWidth = 3; g.beginPath(); g.arc(0, 0, d.s * 0.56, 0, TAU); g.stroke();
        }
      }
      if (d.ring) { g.fillStyle = 'rgba(255,255,255,0.85)'; g.beginPath(); g.arc(0, 0, d.s * 0.56, 0, TAU); g.fill(); g.strokeStyle = d.ring; g.lineWidth = 4; g.beginPath(); g.arc(0, 0, d.s * 0.56, 0, TAU); g.stroke(); }
      g.drawImage(d.spr, -d.w / 2, -d.h / 2, d.w, d.h);
      if (d.zig) {   // custom thunder puff: the code adds its little zigzag
        g.strokeStyle = '#ffd84a'; g.lineWidth = 3; g.lineJoin = 'round'; g.lineCap = 'round';
        const zx = Math.floor(this.time * 4) % 2 ? 1 : -1;
        g.beginPath(); g.moveTo(-3 * zx, d.h / 2 - 2); g.lineTo(4 * zx, d.h / 2 + 5); g.lineTo(-2 * zx, d.h / 2 + 8); g.lineTo(5 * zx, d.h / 2 + 15); g.stroke();
      }
      g.restore();
    }
    /* which: 'fall' = peek-free items in the air (behind the basket front), 'floor' = items on the cloud floor */
    drawItems(which) {
      for (const it of this.world.items) {
        const st = it.state;
        if (st === 'peek' || st === 'caught') continue;
        const onFloor = st === 'ground' || st === 'pop';
        if ((which === 'floor') !== onFloor) continue;
        this.drawItem(it, false);
      }
    }

    jetFlame(s, n, f) {
      const g = this.ctx, face = s.face < 0 ? -1 : 1;
      const gr = this._flameGrad || (this._flameGrad = (() => {
        const q = g.createLinearGradient(0, 0, 1, 0);
        q.addColorStop(0, 'rgba(255,255,240,1)'); q.addColorStop(0.25, 'rgba(255,230,120,0.95)'); q.addColorStop(0.45, 'rgba(255,140,50,0.9)'); q.addColorStop(0.6, 'rgba(255,150,70,0.75)'); q.addColorStop(1, 'rgba(255,110,90,0)');
        return q;
      })());
      const L = (10 + 34 * f) * (0.9 + 0.1 * Math.sin(this.time * 40)), Wd = 5 + 5 * f;
      const ang = Math.atan2(1, -0.5 * face) + (s.tilt || 0);   // points down and back (away from her face)
      g.save(); g.translate(n[0], n[1]); g.rotate(ang); g.globalAlpha = 0.7 + 0.3 * f;
      g.scale(L, Wd); g.fillStyle = gr;
      g.beginPath(); g.moveTo(0, -0.6); g.quadraticCurveTo(0.5, -0.7, 1, 0); g.quadraticCurveTo(0.5, 0.7, 0, 0.6); g.closePath(); g.fill();
      g.restore();
      if (f > 0.4) { g.globalAlpha = 0.35 * f; g.fillStyle = this.glow('rgba(255,200,90,0.6)'); g.save(); g.translate(n[0], n[1]); g.scale(18 * f, 18 * f); g.beginPath(); g.arc(0, 0, 1, 0, TAU); g.fill(); g.restore(); g.globalAlpha = 1; }
    }

    /* Shelly's shadow on the cloud floor (drawn after the ground), shrinking and fading with hop height */
    drawShadow() {
      const g = this.ctx, s = this.world.snail;
      if (!s) return;
      const sk = clamp(1 - Math.max(0, s.hop || 0) / 220, 0.45, 1);
      g.fillStyle = `rgba(60,60,120,${(0.22 * sk).toFixed(3)})`; g.beginPath(); g.ellipse(s.x, 486, 34 * sk, 7 * sk, 0, 0, TAU); g.fill();
    }

    drawShelly(mode) {
      const g = this.ctx, w = this.world, s = w.snail, A = SC.Assets;
      if (!s) return;
      const bob = this._bob || 0, face = s.face < 0 ? -1 : 1;
      const blink = s.invuln > 0 && w.state !== 'dead' && Math.floor(this.time * 12) % 2 === 0, BA = 0.55;
      if (blink) g.globalAlpha = BA;
      // jet flame (behind Shelly): a small hover flicker, big while hopping
      const f = clamp(Math.max(s.flame || 0, w.state === 'dead' ? 0 : 0.12), 0, 1);
      this.jetFlame(s, this.nozzle(s), f);
      g.globalAlpha = blink ? BA : 1;
      // Shelly
      const sq = s.squash || 0;
      g.save();
      g.translate(s.x, s.y + bob); g.rotate(s.tilt || 0); g.scale(1 + 0.16 * sq, 1 - 0.16 * sq);
      if (A.hasCustom('hero')) {
        const [fw, fh] = A.fit('hero', SH_W, SH_H), spr = A.sprite('custom:hero', fw, fh);
        const wob = 1 + 0.03 * Math.sin(this.time * 4);   // gentle breathing so a photo still feels alive
        g.scale(wob, 2 - wob);
        if (s.frame === 'zap') g.rotate(Math.sin(this.time * 50) * 0.06);
        if (spr) g.drawImage(spr, -fw / 2, -fh / 2, fw, fh);
      } else {
        g.scale(face, 1);
        const fr = A.sprite('shelly_' + (s.frame || 'idle'), SH_W, SH_H) || A.sprite('shelly_idle', SH_W, SH_H);
        if (fr) g.drawImage(fr, -SH_ANCHOR[0], -SH_ANCHOR[1], SH_W, SH_H);
      }
      g.restore();
      // basket on the shell: back, caught items, front
      // the basket is drawn 5 px towards the shell centre (visual only; the catch line stays at s.rimX)
      const rimX = (s.rimX != null ? s.rimX : s.x) - 5 * face, rimY = (s.rimY != null ? s.rimY : s.y - 46) + bob;
      const rot = (s.tilt || 0) + (s.sway || 0) * 0.012;
      const bk = A.sprite('basket', BK_W, BK_H), bf = A.sprite('basket_front', BK_W, BK_H);
      g.save(); g.translate(rimX, rimY); g.rotate(rot); g.scale(1 + 0.1 * sq, 1 - 0.1 * sq);
      if (bk) g.drawImage(bk, -BK_RIM[0], -BK_RIM[1], BK_W, BK_H);
      g.restore();
      g.save(); g.translate(-5 * face, 0);
      for (const it of w.items) if (it.state === 'caught') this.drawItem(it, true);
      g.restore();
      g.save(); g.globalAlpha = blink ? BA : 1; g.translate(rimX, rimY); g.rotate(rot); g.scale(1 + 0.1 * sq, 1 - 0.1 * sq);
      if (bf) g.drawImage(bf, -BK_RIM[0], -BK_RIM[1], BK_W, BK_H);
      g.restore();
      g.globalAlpha = 1;
    }

    drawPointer(mode) {
      if (!(this.pointer && this.pointerHeld && mode === 'playing')) return;
      const c = this.world.cfg || {}, g = this.ctx, x = clamp(this.pointer[0], c.xMin || 70, c.xMax || 890), p = 0.5 + 0.5 * Math.sin(this.time * 8);
      g.fillStyle = `rgba(255,255,255,${0.55 + 0.3 * p})`;
      g.beginPath(); g.moveTo(x, 512); g.lineTo(x - 9, 526); g.lineTo(x + 9, 526); g.closePath(); g.fill();
    }

    drawFx() {
      const g = this.ctx, A = SC.Assets;
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
          g.beginPath(); g.ellipse(f.x, f.y, lerp(f.r0, f.r1, k), lerp(f.r0, f.r1, k) * 0.6, 0, 0, TAU); g.stroke();
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

    /* HUD in screen space, kept inside the safe area: hearts + jet meter (top-left), score + streak (centre),
     * star jar (top-right, left of the pause/sound buttons, or under them on narrow screens), windsock next to the jar. */
    hud() {
      const g = this.ctx, w = this.world, A = SC.Assets, hm = w.heartsMax || 3, I = this.ins, VW = this.VW;
      const s = w.snail || {};
      if (this._act) {   // corner button: fade while Shelly flies near it so she never hides behind it
        const op = this._actPlace === 'corner' && s.x > (this.layout ? this.layout.playMax - 70 : 780) ? '0.45' : '';
        if (this._act.style.opacity !== op) this._act.style.opacity = op;
        const j = w.jet || { charge: 1 }, rdy = j.charge >= 1 && !j.air;
        if (this._act._rdy !== rdy) { this._act._rdy = rdy; this._act.classList.toggle('charging', !rdy); }
      }
      if (!this._hudBtn) this._measureHud();
      const zn = SC.Assets.SEASONS[w.zone || 0], pal = (A.palette && A.palette[zn]) || {}, pill = this.pillColor(pal.hud);
      this._pill = pill;
      const L = I.left, T = I.top, narrow = VW < 900;
      g.save(); g.translate(L, T);
      // hearts (top-left)
      g.fillStyle = pill; this.roundRect(14, 12, 24 + 30 * hm, 46, 23); g.fill();
      const hf = A.sprite('heart_full', 28, 28), he = A.sprite('heart_empty', 28, 28);
      for (let i = 0; i < hm; i++) { const sp = i < w.hearts ? hf : he; if (sp) g.drawImage(sp, 26 + i * 30, 21, 28, 28); }
      // Jet Hop meter (next to the hearts)
      const rx = 14 + 24 + 30 * hm + 10, j = w.jet || { charge: 1 }, ready = j.charge >= 1 && !j.air;
      const rp = 1 + 0.3 * (this._jetPop || 0), wide = ready && !narrow;
      g.fillStyle = pill; this.roundRect(rx, 12, wide ? 128 : 58, 46, 23); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.22)'; g.lineWidth = 5; g.beginPath(); g.arc(rx + 29, 35, 16, 0, TAU); g.stroke();
      g.strokeStyle = ready ? '#ff6a3d' : '#ffb08a';
      g.beginPath(); g.arc(rx + 29, 35, 16, -Math.PI / 2, -Math.PI / 2 + TAU * (j.air ? 0 : clamp(j.charge, 0, 1))); g.stroke();
      const rk = A.sprite('rocket', 26, 26);
      if (rk) { g.save(); g.translate(rx + 29, 35); g.scale(rp, rp); g.globalAlpha = ready ? 1 : 0.5; g.drawImage(rk, -13, -13, 26, 26); g.restore(); }
      if (wide) this.text(SC.Game && SC.Game.isTouch ? 'JET!' : 'SPACE', rx + 52, 36, 17, '#ffd84a', null, 'left');
      g.restore();
      // score + streak (centre of the safe area)
      const cx = (L + VW - I.right) / 2, leftEnd = L + rx + (wide ? 128 : 58);
      const sdy = leftEnd > cx - 86 ? 60 : 0;   // narrow phone + many hearts: score drops to a second row
      g.save(); g.translate(cx, T + sdy);
      if (this._lastScore !== w.score) { this._scorePop = 1; this._lastScore = w.score; }
      this._scorePop = Math.max(0, (this._scorePop || 0) - 0.06);
      const sc = 1 + 0.2 * this._scorePop;
      g.save(); g.translate(0, 34); g.scale(sc, sc); this.text(String(w.score), 0, 0, 44, '#ffffff', '#3a2550', 'center', 8); g.restore();
      const c = w.cfg || {}, th = c.multThresholds || c.multAt || c.streakThresholds || [0, 8, 20], m = w.mult || 1;
      const lo = th[m - 1] || 0, hi = th[m], frac = hi ? clamp(((w.combo || 0) - lo) / (hi - lo), 0, 1) : 1;
      const mp = 1 + 0.3 * (this._multPop || 0);
      g.fillStyle = 'rgba(40,25,70,0.55)'; this.roundRect(-90, 61, 180, 24, 12); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1.5; g.stroke();
      g.fillStyle = ['#bfe6ff', '#8ff0b0', '#ffd84a'][Math.min(3, m) - 1];
      if (frac > 0) { this.roundRect(-78, 64, Math.max(18, 156 * frac), 18, 9); g.globalAlpha = 0.6; g.fill(); g.globalAlpha = 1; }
      this.text('streak ' + (w.combo || 0), -72, 73, this.cssScale < 0.8 ? 19 : 16, '#ffffff', '#3a2550', 'left', 4);
      g.save(); g.translate(54, 73); g.scale(mp, mp); this.text('×' + m, 0, 0, this.cssScale < 0.8 ? 20 : 17, m >= 2 ? '#ffe14d' : '#ffffff', '#3a2550', 'center', 4); g.restore();
      g.restore();
      // star jar: left of the pause/sound buttons, or on a second row under them when that would hit the score
      const btn = this._hudBtn || { l: VW - I.right - 130, b: T + 64 };
      let jx = btn.l - 12 - 128, jy = T + 8, second = false;
      if (jx - 8 < cx + 92) { jx = VW - I.right - 14 - 128; jy = Math.max(T + 8, btn.b + 4); second = true; }
      const jp = 1 + 0.25 * (this._jarPop || 0);
      g.fillStyle = pill; this.roundRect(jx - 8, jy + 4, 136, 46, 23); g.fill();
      const jar = A.sprite('jar', 36, 40);
      const jf = clamp((w.jar || 0) / (w.jarTarget || 1), 0, 1);
      if (jar) { g.save(); g.translate(jx + 16, jy + 26); g.scale(jp, jp); g.drawImage(jar, -18, -21, 36, 40); g.restore(); }
      this.text((w.jar || 0) + '/' + (w.jarTarget || 0), jx + 44, jy + 21, 18, jf >= 1 ? '#8ff0b0' : '#ffffff', null, 'left');
      g.fillStyle = 'rgba(255,255,255,0.22)'; this.roundRect(jx + 44, jy + 34, 74, 8, 4); g.fill();
      if (jf > 0) { g.fillStyle = '#ffc21a'; this.roundRect(jx + 44, jy + 34, Math.max(8, 74 * jf), 8, 4); g.fill(); }
      const zi = this.zoneInfo(w.zone || 0);
      this.text(zi.name + (w.lap > 0 ? ' · Lap ' + (w.lap + 1) : ''), jx + 60, jy + 62, this.cssScale < 0.8 ? 19 : 16, '#ffffff', '#3a2550', 'center', 4);
      // windsock (wind level): turns + stretches with the wind; pulses during a gust warning
      // (narrow portrait: if it would overlap the streak pill, it goes under the jar pill instead)
      if ((w.zone || 0) === 2 && w.wind) {
        if (second && jx - 64 < cx + 98) this.windsock(jx + 70, jy + 76, w);
        else this.windsock(second ? jx - 64 : jx - 70, second ? jy + 6 : jy + 4, w);
      }
    }
    /* HUD pill colour: the zone palette's hud colour (a dark tone of the sky) at 85 % so the sky shows through */
    pillColor(hex) {
      if (this._pillHex === hex && this._pillCol) return this._pillCol;
      let c = 'rgba(47,103,156,0.85)';
      const m = /^#([0-9a-f]{6})$/i.exec(hex || '');
      if (m) { const n = parseInt(m[1], 16); c = `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},0.85)`; }
      this._pillHex = hex; this._pillCol = c; return c;
    }
    windsock(x, y, w) {
      const g = this.ctx, A = SC.Assets, wd = w.wind;
      const str = wd.level != null ? clamp(wd.level, 0, 1) : clamp(Math.abs(wd.x || 0) / Math.max(60, Math.abs(wd.target || 0)), 0, 1);
      const warn = (wd.warn || 0) > 0;
      const dir = warn ? (wd.nextDir || 1) : ((wd.x || 0) < 0 ? -1 : 1);
      g.save(); g.translate(x, y);
      g.fillStyle = this._pill || 'rgba(47,103,156,0.85)'; this.roundRect(0, 0, 58, 46, 23); g.fill();
      if (warn) {
        const p = 0.5 + 0.5 * Math.sin(this.time * 14);
        g.strokeStyle = `rgba(255,120,40,${(0.5 + 0.5 * p).toFixed(3)})`; g.lineWidth = 3 + 2 * p; this.roundRect(0, 0, 58, 46, 23); g.stroke();
      }
      const ws = A.sprite('windsock', 46, 34);
      if (ws) {
        const flap = Math.sin(this.time * (6 + 10 * str)) * 0.05 * (0.3 + str);
        const sx = 0.45 + 0.55 * (warn ? Math.max(str, 0.5 + 0.2 * Math.sin(this.time * 10)) : str);
        g.save(); g.translate(29 - dir * 19, 23); g.scale(dir, 1);
        g.rotate(flap + (1 - sx) * 0.5);   // weak wind: the sock droops
        g.drawImage(ws, -4, -17, 46 * sx + 4 * (1 - sx), 34);
        g.restore();
      }
      g.restore();
    }

    drawBanner() {
      const g = this.ctx, b = this.banner, bi = this.zoneInfo(b.s), t = b.t, w = this.world;
      let x;
      if (t < 0.4) x = lerp(-W, 0, easeOutBack(t / 0.4)); else if (t < 1.25) x = 0; else x = lerp(0, W, Math.pow((t - 1.25) / 0.35, 2));
      // tall screens: high in the upper sky (clear of the 🚀 button); narrow screens: scaled to fit the visible width
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
      const g = this.ctx, w = this.world, c = w.cfg || {}, s = w.snail;
      if (!s) return;
      g.strokeStyle = 'red'; g.lineWidth = 1.5;
      const hw = c.catchHalfW || 36;
      g.strokeRect(s.rimX - hw, s.rimY - 2, hw * 2, 4);
      g.beginPath(); g.moveTo(-this.SX, c.floorY || c.groundY || 492); g.lineTo(this.VW - this.SX, c.floorY || c.groundY || 492); g.stroke();
      g.strokeStyle = '#0f0'; g.lineWidth = 2;
      const x0 = c.xMin != null ? c.xMin : 70, x1 = c.xMax != null ? c.xMax : 890;
      g.beginPath(); g.moveTo(x0, 90); g.lineTo(x0, 500); g.moveTo(x1, 90); g.lineTo(x1, 500); g.stroke();
      g.lineWidth = 1;
      for (const it of w.items) { if (it.state !== 'fall' && it.state !== 'peek') continue; g.beginPath(); g.arc(it.x, it.y, it.r || 14, 0, TAU); g.stroke(); }
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  SC.Renderer = Renderer;
})(window.SC = window.SC || {});
