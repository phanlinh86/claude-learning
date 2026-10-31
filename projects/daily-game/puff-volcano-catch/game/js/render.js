/* VC.Renderer — mobile-first: the canvas fills the screen in portrait and landscape (logical VW×VH, see
 * resize()). The 960×540 "scene" (crater at 480,210, ground at 492) is bottom-anchored and centred inside it;
 * the sky and ground are extended to the sides / top, and the HUD is laid out in screen space around the
 * safe-area insets (notch, home bar). Draws the island zone (pixel-exact sky / drifting clouds / volcano / ground layers),
 * the crater glow, flying coins and sizzly rocks, Puff with the swinging basket on two ropes, the Cool Rain
 * column, weather particles, juicy effects and the HUD (hearts, rain meter, score + combo, coin pouch).
 * Logical space 960×540, letter-boxed. Performance rules from the sister games apply. */
(function (VC) {
  'use strict';
  const W = 960, H = 540;   // the scene (all gameplay coordinates); the canvas is this.VW × this.VH
  const ZONE_INFO = [
    { name: 'Sunny Beach', color: '#35b8c8', dark: '#145a72', hint: 'Catch the coins Mount Bumble burps up!' },
    { name: 'Jungle Slopes', color: '#5cb85c', dark: '#2a5e2e', hint: 'Watch out for warm sizzly rocks!' },
    { name: 'Ash Fields', color: '#c07a9a', dark: '#5a3058', hint: 'Busy sunset! Keep that combo going' },
    { name: 'Crater Rim', color: '#4a58a8', dark: '#1c2350', hint: 'Night eruption! Cool Rain saves the day' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const PUFF_W = 96, PUFF_H = 80, PK = 0.8;            // Puff drawn size; viewBox → drawn scale
  const ROPE_A = [(34 - 60) * PK, (72 - 50) * PK];      // rope attach (left) relative to Puff's body centre
  const ROPE_B = [(86 - 60) * PK, (72 - 50) * PK];
  const BK_W = 76, BK_H = 57, BK = 76 / 96;             // basket drawn size; viewBox → drawn scale
  const BK_RIM = [48 * BK, 16 * BK];                    // rim centre inside the drawn basket
  const COIN_SIZE = { copper: 28, silver: 30, gold: 34 };
  const METAL_COLORS = { copper: '#f0965a', silver: '#e6eef8', gold: '#ffd84a' };
  const ROCK = 34;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.redFlash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.pointer = null;
      this._ox = 0; this._oy = 0; this._shx = 0; this._shy = 0;
      this.VW = W; this.VH = H; this.SX = 0; this.SY = 0; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._ext = new Map();
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 0;
      this.resize();
    }

    /* Logical canvas size by aspect (education-game rule, adapted to a side-view scene):
     *  landscape ≥ 16:9 → height 540, width up to 1280 (iPhone ≈ 1170);  4:3-ish landscape → width 960, taller sky (iPad 960×720);
     *  portrait → width 560 (scene cropped to its middle 560 px so Puff stays big on a phone), height up to 1600
     *  (sky above the volcano).
     *  Beyond the clamps the canvas letter-boxes. insets = safe-area insets in CSS px (from #safeProbe). */
    static computeView(vw, vh, insetsCss) {
      const ar = vw / Math.max(1, vh);
      let VW, VH;
      if (ar >= 16 / 9) { VH = H; VW = Math.min(1280, Math.round(H * ar)); }
      else if (ar >= 1) { VW = W; VH = Math.min(960, Math.round(W / ar)); }
      else { VW = 560; VH = Math.min(1600, Math.round(560 / ar)); }
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
      const dpr = window.devicePixelRatio || 1, touch = !!(VC.Game && VC.Game.isTouch);
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
      // visible part of the scene and the shore Puff may use on this screen
      const visL = -this.SX + I.left, visR = this.VW - this.SX - I.right;
      let playMin = Math.max(70, visL + 50), playMax = Math.min(890, visR - 50);
      // on-screen Cool Rain button (touch): in the empty sky when there is room above the scene (portrait, iPad),
      // otherwise bottom-right, and then Puff's range stops short of it so the button never covers him
      const B = Math.max(100, 66 / S);   // ≥ 66 CSS px: a toddler's thumb
      let ab = null;
      if (this.SY >= 150) ab = { x: this.VW - I.right - 20 - B, y: Math.max(I.top + 150, this.SY - B - 46), w: B, h: B, place: 'sky' };
      else { ab = { x: this.VW - I.right - 16 - B, y: this.VH - I.bottom - 16 - B, w: B, h: B, place: 'corner' }; if (touch) playMax = Math.min(playMax, ab.x - this.SX - 58); }
      this.layout = { VW: v.VW, VH: v.VH, SX: this.SX, SY: this.SY, s: S, ins: I, visL, visR, playMin, playMax, act: ab };
      if (act) {
        act.style.width = act.style.height = (B * S) + 'px'; act.style.fontSize = (B * S * 0.45) + 'px';
        act.style.left = (v.left + ab.x * S) + 'px'; act.style.top = (v.top + ab.y * S) + 'px';
        act.style.right = act.style.bottom = 'auto';
        this._act = act; this._actPlace = ab.place;
      }
      this._hudBtn = null; this._measureHud();
      VC.Assets.setScale(this.px);
      if (this.vis) VC.Assets.warmSeason(this.vis.cur);
    }
    /* Where the DOM pause/sound buttons sit, in logical px (they are sized in CSS px, ≥ 44 px for fingers). */
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      if (r.width > 0 && c.width > 0) { const k = this.VW / c.width; this._hudBtn = { l: (r.left - c.left) * k, b: (r.bottom - c.top) * k }; }
    }
    /* Pointer (CSS px) → SCENE coordinates (what the world uses). */
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW - this.SX, (cy - r.top) / r.height * this.VH - this.SY]; }
    attach(world, weather) { this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.banner = null; this.shake = 0; this.flash = 0; this.redFlash = 0; }

    setSeason(i, instant) {
      i = ((i % 4) + 4) % 4;
      VC.Assets.warmSeason((i + 1) % 4); VC.Assets.warmSeason(0);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(b) { this.banner = { s: b, t: 0 }; }

    // ---------------- events → effects ----------------
    onEvents(evts) {
      const w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'catch': {
            this.sparks(e.x, e.y - 6, e.metal === 'gold' ? 14 : 8, METAL_COLORS[e.metal] || '#fff');
            const big = e.mult >= 3;
            this.texts.push({ text: '+' + e.points, x: e.x, y: e.y - 96, life: 0, max: 0.9, size: 20 + 3 * Math.min(5, e.mult), color: e.metal === 'gold' || big ? '#ffe14d' : '#ffffff' });
            if (e.metal === 'gold') this.ring(e.x, e.y, '#ffe14d', 0.5, false);
            break;
          }
          case 'multup':
            this.texts.push({ text: '×' + e.mult + ' COMBO!', x: 480, y: 128, life: 0, max: 1.3, size: 30 + e.mult * 3, color: '#ffe14d', big: true });
            this._multPop = 1;
            break;
          case 'miss':
            this.puffs(e.x, e.y, 4, '#f6e6c4');
            if (e.combo >= 3) this.texts.push({ text: 'Combo lost', x: clamp(e.x, 90, 870), y: e.y - 64, life: 0, max: 0.9, size: 20, color: '#ffd1d1' });
            break;
          case 'ouch':
            this.shake = 0.28; this.redFlash = 0.5;
            this.texts.push({ text: 'Ouch!', x: e.x, y: e.y - 110, life: 0, max: 0.9, size: 30, color: '#ffb3a0' });
            this.sparks(e.x, e.y, 10, '#ff8a2a');
            break;
          case 'rockland': this.puffs(e.x, e.y, 5, '#8a7a88'); this.sparks(e.x, e.y - 4, 4, '#ff9a4a'); break;
          case 'steam':
            for (let i = 0; i < 3; i++) this.fx.push({ k: 'sprite', spr: 'p_steam', x: e.x + (i - 1) * 9, y: e.y, vx: (i - 1) * 14, vy: -50 - i * 10, g: 0, life: -i * 0.05, max: 0.9, size: 22 + i * 4, rot: 0, vr: (i - 1) * 1.5 });
            if (e.points) this.texts.push({ text: '+' + e.points, x: e.x, y: e.y - 20, life: 0, max: 0.8, size: 18, color: '#c9ecff' });
            break;
          case 'raincharged': this._rainPop = 1; break;
          case 'erupt':
            this.shake = Math.max(this.shake, 0.12);
            this.sparks(e.x, e.y, 10, '#ffb060');
            break;
          case 'pouchfull':
            this.texts.push({ text: 'Pouch full!', x: 480, y: 180, life: 0, max: 1.6, size: 40, color: '#ffe14d', big: true });
            break;
          case 'cleared':
            this.texts.push({ text: 'Zone cleared!', x: 480, y: 230, life: 0, max: 2.2, size: 46, color: '#ffe14d', big: true });
            if (e.bonus) this.texts.push({ text: 'Heart bonus +' + e.bonus, x: 480, y: 282, life: 0, max: 2.2, size: 24, color: '#ffffff', big: true });
            for (let i = 0; i < 30; i++) { const a = Math.random() * TAU, sp = 120 + Math.random() * 220; this.fx.push({ k: 'sprite', spr: 'p_sparkle', x: 480, y: 210, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120, g: 200, life: -i * 0.015, max: 1.4, size: 14 + Math.random() * 12, rot: 0, vr: 3 }); }
            break;
          case 'heal': this.texts.push({ text: '+1 heart', x: 110, y: 90, life: 0, max: 1.4, size: 22, color: '#ff8fae' }); break;
          case 'zone': case 'season': { const z = e.zone != null ? e.zone : e.season; this.showBanner(z); this.setSeason(z); break; }
          case 'dead': this.flash = 0.4; this.shake = 0.3; this.texts.push({ text: 'Out of hearts!', x: 480, y: 250, life: 0, max: 2.5, size: 40, color: '#ffd1e6', big: true }); break;
        }
      }
    }
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 70 + Math.random() * 150; this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 80, life: 0, max: 0.35 + Math.random() * 0.25, size: 2 + Math.random() * 2.5, color }); }
    }
    puffs(x, y, n, color) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'puff', x: x + (Math.random() - .5) * 16, y: y - 4 + (Math.random() - .5) * 6, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * 30, g: 0, life: 0, max: 0.45 + Math.random() * 0.2, size: 6 + Math.random() * 6, color });
    }
    ring(x, y, color, max, big) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 10, r1: big ? 110 : 50, color }); }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.2);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.6) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.redFlash = Math.max(0, this.redFlash - dt * 2);
      this._multPop = Math.max(0, (this._multPop || 0) - dt * 2);
      this._rainPop = Math.max(0, (this._rainPop || 0) - dt * 2);
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
      const spr = VC.Assets.sprite(key, lw || W, lh || H);   // scene-space layer at its own size
      if (!spr) return false;
      const g = this.ctx;
      g.setTransform(1, 0, 0, 1, this._ox + Math.round((dx || 0) * this.px), this._oy + Math.round((dy || 0) * this.px));
      if (alpha < 1) g.globalAlpha = alpha;
      g.drawImage(spr, 0, 0);
      g.globalAlpha = 1;
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      return true;
    }
    screenOn() { this._ox = this._shx; this._oy = this._shy; this.ctx.setTransform(this.px, 0, 0, this.px, this._ox, this._oy); }
    sceneOn() { this._ox = this._shx + this._sxd; this._oy = this._shy + this._syd; this.ctx.setTransform(this.px, 0, 0, this.px, this._ox, this._oy); }
    /* Custom background: covers the whole screen (screen space). */
    customBg(slot, alpha) {
      const c = VC.Assets.custom[slot]; if (!c) return false;
      const g = this.ctx, VW = this.VW, VH = this.VH, k = Math.max(VW / c.width, VH / c.height), dw = c.width * k, dh = c.height * k;
      this.screenOn();
      g.globalAlpha = alpha;
      g.drawImage(VC.Assets.sprite('custom:' + slot, dw, dh), (VW - dw) / 2, (VH - dh) / 2, dw, dh);
      g.fillStyle = 'rgba(255,248,240,0.25)'; g.fillRect(0, 0, VW, VH);   // soften so Puff and coins stay readable
      g.globalAlpha = 1;
      this.sceneOn();
      return true;
    }
    /* The zone's sky stretched to the full canvas, built once per zone/size into one device-pixel canvas so the
     * per-frame draw stays a 1:1 blit: the 960×540 sky in the middle, its edge columns stretched sideways (sky
     * gradient + sea / dunes continue), its top row stretched upwards (portrait), plus a few stars at night. */
    skyExt(z) {
      const key = z + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3);
      let c = this._ext.get(key);
      if (c) return c;
      const n = VC.Assets.SEASONS[z], spr = VC.Assets.sprite(n + '_sky', W, H);
      if (!spr) return null;
      c = document.createElement('canvas'); c.width = Math.round(this.VW * this.px); c.height = Math.round(this.VH * this.px);
      const g = c.getContext('2d'), dx = this._sxd, dy = this._syd, sw = spr.width, sh = spr.height;
      g.imageSmoothingEnabled = true;
      g.drawImage(spr, dx, dy);
      if (dx > 0) { g.drawImage(spr, 0, 0, 2, sh, 0, dy, dx + 1, sh); g.drawImage(spr, sw - 2, 0, 2, sh, dx + sw - 1, dy, c.width - dx - sw + 1, sh); }
      if (dy > 0) {
        // average the sky's top rows down to a 16-px strip first, so a star or cloud pixel in that row can't
        // stretch into a vertical streak
        const t = document.createElement('canvas'); t.width = 16; t.height = 1;
        const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
        tg.drawImage(c, 0, dy + 1, c.width, Math.max(2, Math.round(6 * this.px)), 0, 0, 16, 1);
        g.drawImage(t, 0, 0, 16, 1, 0, 0, c.width, dy + 1);
        if (z === 3) {   // night: stars in the extra sky (the weather only twinkles stars inside the scene)
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
    backdrop(b, alpha) {
      const n = VC.Assets.SEASONS[b], w = this.world, g = this.ctx;
      const sh = w && w.volcano ? w.volcano.shake || 0 : 0;
      if (!this.customBg('bg_' + n, alpha)) {
        const ext = this.skyExt(b);
        this.screenOn();
        if (ext) { g.setTransform(1, 0, 0, 1, this._shx, this._shy); if (alpha < 1) g.globalAlpha = alpha; g.drawImage(ext, 0, 0); g.globalAlpha = 1; }
        else { g.fillStyle = '#8fd0f2'; g.fillRect(0, 0, this.VW, this.VH); }
        this.sceneOn();
        // drifting cloud strip, tiled across the visible width; portrait gets fainter strips higher up the sky
        for (let k = 0; ; k++) {
          const y = 20 - 330 * k;
          if (k > 0 && y < -this.SY - 120) break;
          const off = -((this.time * (6 - k) + 377 * k) % W), a = alpha * (k === 0 ? 1 : Math.max(0.35, 0.8 - 0.2 * k));
          for (let x = off - W * Math.ceil(Math.max(0, this.SX) / W + 1); x < this.VW - this.SX; x += W) if (x + W > -this.SX) this.layer(n + '_clouds', a, x, y, W, 220);
          if (k > 6) break;
        }
      }
      this.layer(n + '_volcano', alpha, sh ? Math.sin(this.time * 70) * sh : 0, 0);
    }
    /* Ground strip + mirrored copies to the sides on wide screens (seamless at the joins, pixel-exact). */
    ground(z, alpha) {
      const spr = VC.Assets.sprite(VC.Assets.SEASONS[z] + '_ground', W, H);
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
      try { fn(); } finally { this.ctx = g0; this._shx = shx; this._shy = shy; }
      g0.save(); g0.setTransform(1, 0, 0, 1, shx, shy); g0.globalAlpha = a; g0.drawImage(o, 0, 0); g0.restore();
      this.sceneOn();
    }

    // ---------------- interpolation ----------------
    interp(w) {
      const step = (w.cfg && w.cfg.step) || 1 / 120;
      if (w._acc == null) return false;
      this._a = clamp(w._acc / step, 0, 1);
      const S = this._saved || (this._saved = []); S.length = 0;
      if (w.puff) { this._lerp(w.puff, 'x', '_px'); this._lerp(w.puff, 'y', '_py'); }
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
      if (this._trimKey !== v.cur * 4 + v.prev) { this._trimKey = v.cur * 4 + v.prev; VC.Assets.trimSeasons([v.cur, v.prev, (v.cur + 1) % 4, 0]); }
      const fading = v.t < 1 && v.prev !== v.cur;

      if (fading) { this.backdrop(v.prev, 1); this.fadeLayer(() => this.backdrop(v.cur, 1), v.t); }
      else this.backdrop(v.cur, 1);
      if (w) this.drawCraterGlow();
      if (this.weather) { this.ambient(this.weather.ambient); this.particles('back'); }
      if (w) {
        this.drawRain();
        this.drawPuff(mode);
        this.drawItems(false);   // flying items in front of Puff so they stay visible all the way into the basket
      }
      if (fading) { this.ground(v.prev, 1 - v.t); this.ground(v.cur, v.t); }
      else this.ground(v.cur, 1);
      if (w) this.drawItems(true);   // settled coins / fizzling rocks sit on the sand, in front of it
      if (this.weather) this.particles('front');
      this.drawFx();
      if (w && mode !== 'title') this.drawPointer(mode);
      if (mode !== 'title') this.drawTexts();
      if (this.banner && mode !== 'title') this.drawBanner();
      if (this.debug && w) this.debugDraw();
      this.screenOn();
      const VW = this.VW, VH = this.VH;
      if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${(this.flash * 0.55).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
      if (this.redFlash > 0) { g.fillStyle = `rgba(255,120,90,${(this.redFlash * 0.22).toFixed(3)})`; g.fillRect(0, 0, VW, VH); }
      if (w && w.state === 'dead') { g.fillStyle = 'rgba(40,20,60,0.22)'; g.fillRect(0, 0, VW, VH); }
      if (w && (mode === 'playing' || mode === 'paused')) this.hud();
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
      const g = this.ctx, A = VC.Assets;
      for (const p of this.weather.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.sprite === 'dot') { g.fillStyle = p.color || '#ffffff'; g.beginPath(); g.arc(p.x, p.y, p.size * 0.5, 0, TAU); g.fill(); continue; }
        const spr = A.sprite('p_' + p.sprite, 32, 32); if (!spr) continue;
        const fx = p.flipX == null ? 1 : (Math.abs(p.flipX) < 0.22 ? 0.22 * Math.sign(p.flipX || 1) : p.flipX);
        g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
        g.translate(p.x, p.y); g.rotate(p.rot || 0); g.scale(fx, 1);
        g.drawImage(spr, -p.size / 2, -p.size / 2, p.size, p.size);
        if (p.dark > 0.05) { g.globalAlpha = clamp(p.alpha, 0, 1) * p.dark * 0.5; g.fillStyle = '#6a6070'; g.beginPath(); g.arc(0, 0, p.size * 0.36, 0, TAU); g.fill(); }
      }
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      g.globalAlpha = 1;
    }

    drawCraterGlow() {
      const g = this.ctx, v = this.world.volcano || {}, c = (this.world.cfg && this.world.cfg.crater) || { x: 480, y: 210 };
      const rb = v.rumble || 0, k = clamp(0.2 + 0.4 * (v.glow || 0) + 1.0 * rb, 0, 1) * (0.9 + 0.1 * Math.sin(this.time * 5));
      if (k < 0.02) return;
      const gr = this._glowGrad || (this._glowGrad = (() => {
        const r = g.createRadialGradient(0, 0, 4, 0, 0, 120);
        r.addColorStop(0, 'rgba(255,230,140,0.9)'); r.addColorStop(0.35, 'rgba(255,160,80,0.45)'); r.addColorStop(1, 'rgba(255,120,80,0)');
        return r;
      })());
      g.save(); g.translate(c.x, c.y - 4); g.scale(1 + 0.6 * rb, (1 + 0.6 * rb) * 0.62); g.globalAlpha = k; g.fillStyle = gr;
      g.beginPath(); g.arc(0, 0, 120, 0, TAU); g.fill(); g.restore();
    }

    drawRain() {
      const g = this.ctx, w = this.world, r = w.rain;
      if (!r || !(r.active > 0)) return;
      const cw = r.w || 130, x = r.x != null ? r.x : w.puff.x, top = 0, bot = w.puff.y - 28;
      const a = clamp(r.active / 0.25, 0, 1) * 0.9;
      const gr = this._rainGrad || (this._rainGrad = (() => { const q = g.createLinearGradient(0, 0, 0, 400); q.addColorStop(0, 'rgba(150,210,255,0.12)'); q.addColorStop(1, 'rgba(150,210,255,0.45)'); return q; })());
      g.globalAlpha = a; g.fillStyle = gr;
      this.roundRect(x - cw / 2, top, cw, bot - top, 24); g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2; g.setLineDash([10, 8]); g.lineDashOffset = -this.time * 120;
      g.beginPath(); g.moveTo(x - cw / 2, top); g.lineTo(x - cw / 2, bot); g.moveTo(x + cw / 2, top); g.lineTo(x + cw / 2, bot); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }

    itemSprite(it) {
      const A = VC.Assets;
      if (it.kind === 'coin') {
        const s = COIN_SIZE[it.metal] || 30;
        if (A.hasCustom('coin')) { const [fw, fh] = A.fit('coin', s, s); return { spr: A.sprite('custom:coin', fw, fh), w: fw, h: fh, ring: METAL_COLORS[it.metal], s }; }
        return { spr: A.sprite('coin_' + it.metal, s, s), w: s, h: s, s };
      }
      if (A.hasCustom('rock')) { const [fw, fh] = A.fit('rock', ROCK, ROCK); return { spr: A.sprite('custom:rock', fw, fh), w: fw, h: fh, ring: '#e8253a', dash: true, s: ROCK }; }
      return { spr: A.sprite(it.variant ? 'rock_2' : 'rock', ROCK, ROCK), w: ROCK, h: ROCK, s: ROCK };
    }
    drawItem(it) {
      const g = this.ctx, d = this.itemSprite(it);
      if (!d.spr) return;
      let a = it.alpha == null ? 1 : it.alpha;
      if (it.state === 'steam') a *= 0.6;
      if (a <= 0.01) return;
      g.save(); g.globalAlpha = a; g.translate(it.x, it.y);
      if (it.kind === 'coin') {
        let sx = Math.cos(it.spin || 0); sx = Math.abs(sx) < 0.14 ? 0.14 * (sx < 0 ? -1 : 1) : sx;
        if (it.state === 'caught' || it.state === 'ground') sx = it.state === 'ground' ? 1 : sx;
        g.scale(sx, 1);
      } else g.rotate(it.rot || 0);
      if (it.kind === 'rock') {   // warm pulsing halo: rocks read on the night zone and on dark ground
        const hg = this._haloGrad || (this._haloGrad = (() => { const r = g.createRadialGradient(0, 0, 4, 0, 0, 26); r.addColorStop(0, 'rgba(255,150,60,0.9)'); r.addColorStop(1, 'rgba(255,150,60,0)'); return r; })());
        const ga = g.globalAlpha; g.globalAlpha = ga * (0.45 + 0.15 * Math.sin(this.time * 7 + it.id)); g.fillStyle = hg; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill(); g.globalAlpha = ga;
        if (d.dash) { g.fillStyle = 'rgba(232,37,58,0.22)'; g.beginPath(); g.arc(0, 0, d.s * 0.62, 0, TAU); g.fill(); }
      }
      if (d.ring) { g.strokeStyle = d.ring; g.lineWidth = d.dash ? 4 : 3; if (d.dash) g.setLineDash([5, 4]); g.beginPath(); g.arc(0, 0, d.s * 0.55, 0, TAU); g.stroke(); g.setLineDash([]); }
      g.drawImage(d.spr, -d.w / 2, -d.h / 2, d.w, d.h);
      if (it.kind === 'coin' && it.metal === 'gold' && it.state === 'fly') {   // rare gold twinkles
        const sp = VC.Assets.sprite('p_sparkle', 32, 32), s = 10 + 4 * Math.sin(this.time * 9 + it.id);
        if (sp) { g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy); g.drawImage(sp, it.x + 10 - s / 2, it.y - 12 - s / 2, s, s); }
      }
      g.restore();
      const pf = this.world && this.world.puff;
      if (it.kind === 'rock' && it.state === 'fly' && (this._trailT = (this._trailT || 0) + 1) % 2 === 0 && this.fx.length < 300 &&
          !(pf && it.y > pf.y - 50 && Math.abs(it.x - pf.x) < 56)) {   // no smoke specks on Puff's face
        this.fx.push({ k: 'puff', x: it.x, y: it.y, vx: 0, vy: -10, g: 0, life: 0, max: 0.55, size: 8, color: 'rgba(150,130,140,0.45)' });
      }
    }
    /* grounded = false → flying items (behind Puff and the ground); true → items resting on the sand. */
    drawItems(grounded) {
      for (const it of this.world.items) {
        if (it.state === 'caught') continue;               // drawn inside the basket
        if ((it.state === 'ground') !== grounded) continue;
        this.drawItem(it);
      }
    }

    drawPuff(mode) {
      const g = this.ctx, w = this.world, p = w.puff, A = VC.Assets;
      if (!p) return;
      const bob = p.bob || 0;
      const blink = p.invuln > 0 && w.state !== 'dead' && Math.floor(this.time * 12) % 2 === 0, BA = 0.7;
      const sw = p.swing || 0;
      const rimX = p.rimX != null ? p.rimX : p.x, rimY = (p.rimY != null ? p.rimY : 446) + bob;
      // rope attach points on Puff (rotated by tilt)
      const ct = Math.cos(p.tilt || 0), st = Math.sin(p.tilt || 0);
      const att = q => [p.x + q[0] * ct - q[1] * st, p.y + q[0] * st + q[1] * ct];
      const a1 = att(ROPE_A), a2 = att(ROPE_B);
      const cs = Math.cos(sw * 0.6), ss = Math.sin(sw * 0.6);
      const hang = dx => [rimX + dx * cs, rimY + dx * ss];
      const h1 = hang(-38 * BK), h2 = hang(38 * BK);
      // shadow on the sand
      g.fillStyle = 'rgba(40,30,60,0.16)'; g.beginPath(); g.ellipse(rimX, 496, 34, 7, 0, 0, TAU); g.fill();
      if (blink) g.globalAlpha = BA;
      // ropes
      g.strokeStyle = '#7a4a22'; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(a1[0], a1[1]); g.quadraticCurveTo((a1[0] + h1[0]) / 2 - 2, (a1[1] + h1[1]) / 2 + 3, h1[0], h1[1]);
      g.moveTo(a2[0], a2[1]); g.quadraticCurveTo((a2[0] + h2[0]) / 2 + 2, (a2[1] + h2[1]) / 2 + 3, h2[0], h2[1]); g.stroke();
      // basket back, caught items, basket front
      g.save(); g.translate(rimX, rimY); g.rotate(sw * 0.6);
      const bk = A.sprite('basket', BK_W, BK_H), bf = A.sprite('basket_front', BK_W, BK_H);
      if (bk) g.drawImage(bk, -BK_RIM[0], -BK_RIM[1], BK_W, BK_H);
      g.restore();
      for (const it of w.items) if (it.state === 'caught') this.drawItem(it);
      g.save(); g.globalAlpha = blink ? BA : 1; g.translate(rimX, rimY); g.rotate(sw * 0.6);
      if (bf) g.drawImage(bf, -BK_RIM[0], -BK_RIM[1], BK_W, BK_H);
      g.restore();
      // Puff
      const sq = p.squash || 0;
      g.save(); g.globalAlpha = blink ? BA : 1;
      g.translate(p.x, p.y); g.rotate(p.tilt || 0); g.scale(1 + 0.18 * sq, 1 - 0.18 * sq);
      if (A.hasCustom('hero')) {
        const [fw, fh] = A.fit('hero', PUFF_W, PUFF_H), spr = A.sprite('custom:hero', fw, fh);
        const wob = 1 + 0.03 * Math.sin(this.time * 4);   // gentle breathing so a photo still feels alive
        g.scale(wob, 2 - wob);
        if (spr) g.drawImage(spr, -fw / 2, -fh / 2, fw, fh);
        // little cloud hands that hold the ropes
        g.fillStyle = '#c99a5e'; g.strokeStyle = '#7a4a22'; g.lineWidth = 2;   // rope knots
        [ROPE_A, ROPE_B].forEach(q => { g.beginPath(); g.arc(q[0], q[1], 4.5, 0, TAU); g.fill(); g.stroke(); });
      } else {
        const fr = A.sprite('puff_' + (p.frame || 'idle'), PUFF_W, PUFF_H) || A.sprite('puff_idle', PUFF_W, PUFF_H);
        if (fr) g.drawImage(fr, -PUFF_W / 2, -PUFF_H / 2, PUFF_W, PUFF_H);
      }
      g.restore();
      g.globalAlpha = 1;
    }

    drawPointer(mode) {
      if (!(this.pointer && this.pointerHeld && mode === 'playing')) return;
      const c = this.world.cfg || {}, g = this.ctx, x = clamp(this.pointer[0], c.xMin || 70, c.xMax || 890), p = 0.5 + 0.5 * Math.sin(this.time * 8);
      g.fillStyle = `rgba(255,255,255,${0.55 + 0.3 * p})`;
      g.beginPath(); g.moveTo(x, 514); g.lineTo(x - 9, 528); g.lineTo(x + 9, 528); g.closePath(); g.fill();
    }

    drawFx() {
      const g = this.ctx, A = VC.Assets;
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

    /* HUD in screen space, kept inside the safe area. Narrow screens (portrait) drop the pouch to a second row
     * under the pause/sound buttons and use a compact rain meter. */
    hud() {
      const g = this.ctx, w = this.world, A = VC.Assets, hm = w.heartsMax || 3, I = this.ins, VW = this.VW;
      if (this._act) {   // corner button: fade while Puff floats near it so he never hides behind it
        const op = this._actPlace === 'corner' && w.puff && w.puff.x > (this.layout ? this.layout.playMax - 70 : 780) ? '0.45' : '';
        if (this._act.style.opacity !== op) this._act.style.opacity = op;
      }
      if (!this._hudBtn) this._measureHud();
      const L = I.left, T = I.top, narrow = VW < 900;
      g.save(); g.translate(L, T);
      // hearts (top-left)
      g.fillStyle = 'rgba(255,255,255,0.94)'; this.roundRect(14, 12, 24 + 30 * hm, 46, 23); g.fill();
      const hf = A.sprite('heart_full', 28, 28), he = A.sprite('heart_empty', 28, 28);
      for (let i = 0; i < hm; i++) { const s = i < w.hearts ? hf : he; if (s) g.drawImage(s, 26 + i * 30, 21, 28, 28); }
      // Cool Rain meter (next to the hearts)
      const rx = 14 + 24 + 30 * hm + 10, r = w.rain || { charge: 1 }, ready = r.charge >= 1 && !(r.active > 0);
      const rp = 1 + 0.25 * (this._rainPop || 0), wide = ready && !narrow;
      g.fillStyle = 'rgba(255,255,255,0.94)'; this.roundRect(rx, 12, wide ? 128 : 58, 46, 23); g.fill();
      g.strokeStyle = 'rgba(79,180,255,0.25)'; g.lineWidth = 5; g.beginPath(); g.arc(rx + 29, 35, 16, 0, TAU); g.stroke();
      g.strokeStyle = ready ? '#2a86e0' : '#7cc4ff';
      g.beginPath(); g.arc(rx + 29, 35, 16, -Math.PI / 2, -Math.PI / 2 + TAU * (r.active > 0 ? 0 : clamp(r.charge, 0, 1))); g.stroke();
      const dr = A.sprite('drop', 22, 22);
      if (dr) { g.save(); g.translate(rx + 29, 35); g.scale(rp, rp); g.globalAlpha = ready || r.active > 0 ? 1 : 0.5; g.drawImage(dr, -11, -11, 22, 22); g.restore(); }
      if (wide) this.text(VC.Game && VC.Game.isTouch ? 'RAIN!' : 'SPACE', rx + 52, 36, 17, '#2a6ab0', null, 'left');
      g.restore();
      // score + combo (centre of the safe area)
      const cx = (L + VW - I.right) / 2, leftEnd = L + rx + (wide ? 128 : 58);
      const sdy = leftEnd > cx - 86 ? 60 : 0;   // narrow phone + many hearts: score drops to a second row
      g.save(); g.translate(cx, T + sdy);
      if (this._lastScore !== w.score) { this._scorePop = 1; this._lastScore = w.score; }
      this._scorePop = Math.max(0, (this._scorePop || 0) - 0.06);
      const s = 1 + 0.2 * this._scorePop;
      g.save(); g.translate(0, 34); g.scale(s, s); this.text(String(w.score), 0, 0, 44, '#ffffff', '#3a2550', 'center', 8); g.restore();
      const th = (w.cfg && w.cfg.multThresholds) || [0, 5, 12, 22, 35], m = w.mult || 1;
      const lo = th[m - 1] || 0, hi = th[m], frac = hi ? clamp(((w.combo || 0) - lo) / (hi - lo), 0, 1) : 1;
      const mp = 1 + 0.3 * (this._multPop || 0);
      g.fillStyle = 'rgba(40,25,70,0.55)'; this.roundRect(-80, 62, 160, 22, 11); g.fill();
      g.fillStyle = m >= 5 ? '#ffd84a' : ['#bfe6ff', '#9fe3ff', '#8ff0b0', '#ffc46b', '#ffd84a'][m - 1];
      if (frac > 0) { this.roundRect(-78, 64, Math.max(18, 156 * frac), 18, 9); g.globalAlpha = 0.55; g.fill(); g.globalAlpha = 1; }
      this.text('combo ' + (w.combo || 0), -72, 73, 16, '#ffffff', '#3a2550', 'left', 4);
      g.save(); g.translate(54, 73); g.scale(mp, mp); this.text('×' + m, 0, 0, 17, m >= 2 ? '#ffe14d' : '#ffffff', '#3a2550', 'center', 4); g.restore();
      g.restore();
      // coin pouch: left of the pause/sound buttons, or on a second row under them when that would hit the score
      const btn = this._hudBtn || { l: VW - I.right - 130, b: T + 64 };
      let jx = btn.l - 12 - 128, jy = T + 8;
      if (jx - 8 < cx + 92) { jx = VW - I.right - 14 - 128; jy = Math.max(T + 8, btn.b + 4); }
      const pouch = A.sprite('pouch', 40, 45);
      g.fillStyle = 'rgba(255,255,255,0.94)'; this.roundRect(jx - 8, jy + 4, 136, 46, 23); g.fill();
      if (pouch) g.drawImage(pouch, jx - 2, jy + 1, 40, 45);
      const pf = clamp(w.pouch / (w.pouchTarget || 1), 0, 1);
      this.text(w.pouch + '/' + w.pouchTarget, jx + 44, jy + 21, 18, pf >= 1 ? '#2d9a52' : '#7a4316', null, 'left');
      g.fillStyle = 'rgba(122,67,22,0.18)'; this.roundRect(jx + 44, jy + 34, 74, 8, 4); g.fill();
      if (pf > 0) { g.fillStyle = '#f5b21c'; this.roundRect(jx + 44, jy + 34, Math.max(8, 74 * pf), 8, 4); g.fill(); }
      const zi = ZONE_INFO[w.zone] || ZONE_INFO[0];
      this.text(zi.name + (w.lap > 0 ? ' · Lap ' + (w.lap + 1) : ''), jx + 60, jy + 62, 16, '#ffffff', '#3a2550', 'center', 4);
    }

    drawBanner() {
      const g = this.ctx, b = this.banner, bi = ZONE_INFO[b.s] || ZONE_INFO[0], t = b.t;
      let x;
      if (t < 0.4) x = lerp(-W, 0, easeOutBack(t / 0.4)); else if (t < 1.25) x = 0; else x = lerp(0, W, Math.pow((t - 1.25) / 0.35, 2));
      g.save(); g.translate(x, 0);
      g.fillStyle = bi.color; g.globalAlpha = 0.94;
      g.beginPath(); g.moveTo(W / 2 - 310, 112); g.lineTo(W / 2 + 310, 104); g.lineTo(W / 2 + 328, 206); g.lineTo(W / 2 - 292, 214); g.closePath(); g.fill();
      g.globalAlpha = 1;
      this.text(bi.name + '!', W / 2, 142, 42, '#ffffff', bi.dark, 'center', 9);
      this.text(bi.hint, W / 2, 184, 20, '#ffffff', bi.dark, 'center', 5);
      g.restore();
    }

    debugDraw() {
      const g = this.ctx, w = this.world, c = w.cfg || {}, p = w.puff;
      g.strokeStyle = 'red'; g.lineWidth = 1;
      const hw = c.catchHalfW || 38;
      g.strokeRect(p.rimX - hw, (c.rimY || 446) - 2, hw * 2, 4);
      g.beginPath(); g.moveTo(-this.SX, c.groundY || 492); g.lineTo(this.VW - this.SX, c.groundY || 492); g.stroke();
      g.strokeStyle = '#0f0'; g.strokeRect(c.xMin, 380, c.xMax - c.xMin, 120);
      for (const it of w.items) { if (it.state !== 'fly') continue; g.beginPath(); g.arc(it.x, it.y, it.r || 15, 0, TAU); g.stroke(); if (it.tx != null) { g.beginPath(); g.arc(it.tx, c.rimY || 446, 3, 0, TAU); g.stroke(); } }
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  VC.Renderer = Renderer;
})(window.VC = window.VC || {});
