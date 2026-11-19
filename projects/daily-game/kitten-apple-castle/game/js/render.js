/* AC.Renderer — the castle scene at four times of day, the crate tower with its lanterns, Ziggy's hover-rocket,
 * floating apples, Granny Boo, particles, the darkness layer (the day-to-night twist) and the HUD (DESIGN §2–§4, §6).
 * Layers: sky (fixed, drifting) and far (sinks as the camera rises) are pre-rendered as device-pixel tiles and blitted
 * pixel-exact (svg x 480 sits at the tower column cx); the ground strip is pre-rendered once per zone / size and drawn in
 * world space. Zone changes crossfade. Everything that moves is lerped between simulation steps with world.alpha.
 * Order: scene → darkness (½-res offscreen, light cut-outs) → glow things (window glints, moon, lanterns, glow apples,
 * glow particles) → texts → HUD. */
(function (AC) {
  'use strict';
  const ZONE_INFO = [
    { key: 'dawn', name: 'Dawn · Garden Gate', short: 'Dawn', color: '#ffc4dc', dark: '#5a3a6a', ground: '#668f5c', vig: 'rgba(60,20,50,.26)', hint: 'Tap to drop the crate on the tower!' },
    { key: 'noon', name: 'Noon · Sunny Courtyard', short: 'Noon', color: '#bfe6ff', dark: '#3a6a9a', ground: '#548f4c', vig: 'rgba(20,40,60,.20)', hint: 'Land in the middle to light a lantern!' },
    { key: 'sunset', name: 'Sunset · Bat Ramparts', short: 'Sunset', color: '#ffc08a', dark: '#4a2a50', ground: '#525e40', vig: 'rgba(40,10,30,.30)', hint: 'Lanterns light the way!' },
    { key: 'night', name: 'Night · Moon Tower', short: 'Night', color: '#d4d6ff', dark: '#1b1e4a', ground: '#2b3450', vig: 'rgba(6,8,30,.34)', hint: 'Perfect drops keep the tower lit!' }
  ];
  // darkness tint per time of day (blended by world.dayT; index 4 = the next dawn)
  const TINT = [[70, 30, 80], [70, 40, 84], [80, 30, 60], [12, 14, 48], [70, 30, 80]];
  const DARK_K = 0.82;      // darkness alpha = (1 − light) · DARK_K (DESIGN §6)
  // lit castle windows (far-svg coords) and night ground lights (ground-svg coords) from tools/art-environment/lights.json
  const GLINTS = {
    dawn: [[192, 252, 29], [793, 307, 22]],
    noon: [],
    sunset: [[62, 310, 20], [192, 252, 29], [172, 318, 20], [317, 326, 18], [650, 329, 18], [796, 238, 29], [890, 305, 18]],
    night: [[62, 310, 20], [192, 252, 29], [172, 318, 20], [212, 318, 20], [317, 326, 18], [650, 329, 18], [796, 238, 29, 'ghost'], [793, 307, 22]]
  };
  const GROUND_LIGHTS = { night: [[120, 10, 40], [232, 25, 36], [270, 32, 24], [726, 27, 30]] };
  const MOON = { x: 300, y: 92, r: 60 };
  const STYLE_COL = ['#ff5a5a', '#4ccf6a', '#ffc93c', '#58b4ff'];
  const STYLE_LINE = ['#9e2a32', '#1f7a3a', '#8f5c00', '#1a5a96'];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const Z_K = 1.55, Z_CY = 78 / 160, Z_EMIT = (140 - 78) / 160;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = []; this.flyers = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fff6d0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.drift = 0; this.hintOn = true; this.comboShow = 0; this.heartPulse = 0; this.piePulse = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._glow = new Map(); this._born = new WeakMap();
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
      const dpr = window.devicePixelRatio || 1, touch = !!(AC.Game && AC.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._glow.clear();
      this._hudK = clamp(0.95 / v.s, 1, 1.6);
      this._view = v;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      if (this.world && this.world.setLayout && (this.world.layout.width !== v.VW || this.world.layout.height !== v.VH)) this.world.setLayout(v.VW, v.VH);
      this._measureHud();
      AC.Assets.setScale(this.px);
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width, b: (r.bottom - c.top) * this.VH / c.height } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.flyers.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.comboShow = 0; this.heartPulse = 0; this.piePulse = 0;
      this.hintOn = !!world && (world.level || 0) === 0;
      if (weather && weather.resize) weather.resize(this.VW, this.VH);
      if (world && world.setLayout && world.layout && (world.layout.width !== this.VW || world.layout.height !== this.VH)) world.setLayout(this.VW, this.VH);
    }
    setLevel(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(z) { this.banner = { s: z, t: 0, loop: this.world ? this.world.loop || 0 : 0, goal: this.world ? this.world.goal : 10 }; }

    // ---------------- pre-rendered scenes ----------------
    _slot(b) { return AC.Assets.SLOTS[3 + b].id; }
    _custom(b) { return AC.Assets.hasCustom(this._slot(b)); }
    _unit() { return this.world ? this.world.layout.unit : Math.min(this.VW / 9.6, this.VH / 5.4); }
    _cx() { return this.world ? this.world.layout.cx : this.VW / 2; }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (AC.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    _canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* {sky, far, ground, custom}: sky/far = one tile scaled to the screen height (device px); ground = a strip the
     * width of the screen (device px) holding the tiled ground.svg, its surface line at 40·u from the top. */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = AC.Assets, n = A.SEASONS[b], px = this.px, VW = this.VW, VH = this.VH, info = ZONE_INFO[b], u = this._unit() / 100;
      bg = { sky: null, far: null, ground: null, custom: false };
      if (this._custom(b)) {
        const im = A.custom[this._slot(b)], k = Math.max(VW / im.width, VH / im.height);
        const c = this._canvas(VW * px, VH * px), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.setTransform(px, 0, 0, px, 0, 0);
        g.drawImage(im, (VW - im.width * k) / 2, (VH - im.height * k) / 2, im.width * k, im.height * k);
        bg.sky = c; bg.custom = true;
      } else {
        const k = VH / 540, tw = Math.round(960 * k * px), th = Math.round(VH * px);
        const tile = name => {
          const im = A.img[n + '_' + name]; if (!im) return null;
          const c = this._canvas(tw, th), cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high';
          cg.drawImage(im, 0, 0, tw, th); return c;
        };
        bg.sky = tile('sky'); bg.far = tile('far');
        if (!bg.sky) { bg.sky = this._canvas(tw, th); const sg = bg.sky.getContext('2d'); sg.fillStyle = info.dark; sg.fillRect(0, 0, tw, th); }
      }
      const gw = 960 * u, gh = 180 * u;
      const gc = this._canvas(VW * px, gh * px), gg = gc.getContext('2d'); gg.imageSmoothingQuality = 'high';
      gg.setTransform(px, 0, 0, px, 0, 0);
      const gim = A.img[n + '_ground'];
      if (gim) { let x0 = this._cx() - gw / 2; while (x0 > 0) x0 -= gw; for (let x = x0; x < VW; x += gw) gg.drawImage(gim, x, 0, gw, gh); }
      else { gg.fillStyle = info.ground; gg.fillRect(0, 40 * u, VW, gh); }
      bg.ground = gc; bg.groundH = gh;
      const vc = this._canvas(VW * px, VH * px), vg0 = vc.getContext('2d');
      vg0.setTransform(px, 0, 0, px, 0, 0);
      const vg = vg0.createRadialGradient(VW / 2, VH * 0.5, Math.min(VW, VH) * 0.35, VW / 2, VH * 0.5, Math.max(VW, VH) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, info.vig);
      vg0.fillStyle = vg; vg0.fillRect(0, 0, VW, VH);
      bg.vig = vc;
      this._bg.set(key, bg);
      if (this._bg.size > 4) { const keep = [this.vis.cur, this.vis.prev, (this.vis.cur + 1) % 4].map(z => this._bgKey(z)); for (const k of this._bg.keys()) if (!keep.includes(k)) this._bg.delete(k); }
      return bg;
    }
    /* Left edge (logical px) of the tile that holds svg x 0, so that svg x 480 sits at cx, shifted left by `off`. */
    _tileX0(off) { return this._cx() - 480 * this.VH / 540 - off; }
    _blitTile(g, tile, off, dy, alpha) {
      if (!tile) return;
      const tw = tile.width, cw = this.canvas.width;
      let x = Math.round(((this._tileX0(off) * this.px) % tw + tw) % tw);
      if (x > 0) x -= tw;
      g.globalAlpha = alpha;
      for (; x < cw; x += tw) g.drawImage(tile, x, dy);
    }
    _farDY(camY) { return Math.round(-camY * 0.15 * this.px); }
    /* Sky (drifting) and far (sinks with the camera: −camY·0.15). */
    drawSceneBack(g, b, alpha, camY) {
      const bg = this.background(b);
      if (bg.custom) { g.globalAlpha = alpha; g.drawImage(bg.sky, 0, 0); g.globalAlpha = 1; return; }
      this._blitTile(g, bg.sky, this.drift * 3, 0, alpha);
      const dy = this._farDY(camY);
      if (dy < this.canvas.height) this._blitTile(g, bg.far, this.drift * 1.2, dy, alpha);
      g.globalAlpha = 1;
    }
    /* Ground strip in world space: its surface line (40·u) sits at world groundY. Fill below with the soil colour. */
    drawGround(g, b, alpha, camY) {
      const bg = this.background(b), L = this.world.layout, u = L.unit / 100;
      const y = Math.round((L.groundY - 40 * u - camY) * this.px);
      if (y >= this.canvas.height) return;
      g.globalAlpha = alpha;
      g.drawImage(bg.ground, 0, y);
      const bot = y + Math.round(bg.groundH * this.px) - 1;
      if (bot < this.canvas.height) { g.fillStyle = ZONE_INFO[b].ground; g.fillRect(0, bot, this.canvas.width, this.canvas.height - bot); }
      g.globalAlpha = 1;
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world, L = w && w.layout, wx = this.weather, u = L ? L.unit / 100 : 1;
      for (const e of evts) {
        switch (e.type) {
          case 'drop': this.hintOn = false; break;
          case 'land': {
            const c = e.crate, v = clamp((e.speed || 0) / 1100, 0, 1);
            if (wx && c) {
              const by = c.y + c.h / 2;
              wx.burst('puff', c.x - c.w * 0.45, by, 2 + Math.round(v * 3), { speed: 70 * u, life: 0.5, size: 14 * u, gravity: -10, spread: 1.2, angle: Math.PI, layer: 'front' });
              wx.burst('puff', c.x + c.w * 0.45, by, 2 + Math.round(v * 3), { speed: 70 * u, life: 0.5, size: 14 * u, gravity: -10, spread: 1.2, angle: 0, layer: 'front' });
            }
            this.shake = Math.max(this.shake, 1.5 + v * 2);
            break;
          }
          case 'perfect': {
            const c = e.crate;
            this.ring(c.x, c.y - c.h / 2, '#fff2a8', 0.5, c.w * 0.8, 4);
            if (wx) wx.burst('sparkle', c.x, c.y - c.h / 2, 8 + Math.min(8, e.combo * 2), { speed: 160 * u, life: 0.6, size: 14 * u, gravity: 60, up: 0.5, layer: 'front', glow: true });
            this.say((e.combo >= 2 ? 'Perfect ×' + Math.min(5, e.combo) + '!' : 'Perfect!') + ' Lantern lit', c.x, c.y - c.h * 1.6, '#fff2a8', 24, 'perfect');
            this.pop('+' + (10 + 10 * Math.min(5, e.combo)), c.x + c.w * 0.75, c.y - c.h * 0.4, '#ffe9a8', 18);
            this.comboShow = 1.2;
            break;
          }
          case 'lantern': {
            const c = e.crate;
            if (c && w.lanternPos) {
              this._born.set(c, this.time);
              const p = w.lanternPos(c);
              if (wx) wx.burst('spark', p.lx, p.ly, 10, { speed: 110 * u, life: 0.7, size: 11 * u, gravity: 40, layer: 'front', glow: true });
            }
            break;
          }
          case 'edge': {
            const c = e.crate;
            this.pop('+10', c.x + c.w * 0.75 * (e.dx < 0 ? -1 : 1), c.y - c.h * 0.4, '#ffffff', 17);
            if (Math.abs(e.dx) > c.w * 0.3) this.say('Wobbly!', c.x, c.y - c.h * 1.5, '#ffd0a0', 20, 'perfect');
            break;
          }
          case 'miss': this.say('Oops!', e.crate.x, e.crate.y - e.crate.h * 1.2, '#ffb0c8', 26, 'perfect'); break;
          case 'topple': this.shake = Math.max(this.shake, 7); this.say('Timber-r-r!', L.cx, (e.y || w.tower.topY) - L.unit * 0.8, '#ffb0c8', 26, 'perfect'); break;
          case 'heartLost': this.heartPulse = 1; break;
          case 'apple': {
            if (wx) wx.burst('applebit', e.x, e.y, 7, { speed: 130 * u, life: 0.55, size: 12 * u, gravity: 260, up: 0.6, layer: 'front' });
            if (e.glow) {
              if (wx) wx.burst('spark', e.x, e.y, 8, { speed: 120 * u, life: 0.6, size: 10 * u, gravity: 30, layer: 'front', glow: true });
              this.say('Glow apple +' + (e.points || 10), e.x, e.y - 34 * u, '#ffe08a', 20, 'apple');
            } else this.pop('+' + (e.points || 5), e.x, e.y - 24 * u, '#ffd0d0', 17);
            this.flyers.push({ x: e.x, y: e.y - (w.cam ? w.cam.y : 0), t: 0, life: 0.6 });
            break;
          }
          case 'pie': {
            this.piePulse = 1;
            const s = w.saucer;
            this.say(e.gained ? 'Apple pie! +1 ♥' : 'Apple pie! Yum!', s.x, s.y - L.unit * 1.0, '#ffd98a', 24, 'pie');
            if (wx) wx.burst('heart', s.x, s.y, 10, { speed: 180 * u, life: 0.9, size: 16 * u, gravity: 80, layer: 'front' });
            break;
          }
          case 'combo': this.comboShow = 1.2; break;
          case 'goal': {
            this.flash = 0.45; this.flashCol = '#fff2c4';
            this.texts = this.texts.filter(t => t.big ? t.key !== 'perfect' : t.t > 0.6);
            this.say('Tower done!', L.cx, w.layout.saucerScreenY + w.cam.y + L.unit * 1.4, '#ffe9a8', 30, 'goal');
            this.pop('+' + e.bonus, e.x + L.unit * 0.9, e.y - L.unit * 0.3, '#ffd23f', 24);
            if (wx) wx.burst('star', e.x, e.y, 16, { speed: 260 * u, life: 1.0, size: 16 * u, gravity: 220, up: 0.5, layer: 'front', glow: true });
            break;
          }
          case 'ghost': {
            const gh = w.ghost;
            if (gh) {
              this.say('Thank you, Ziggy!', gh.x, gh.y - L.unit * 1.0, '#efe8ff', 22, 'ghost');
              if (wx) wx.burst('sparkle', gh.x, gh.y, 10, { speed: 140 * u, life: 0.8, size: 13 * u, gravity: 20, layer: 'front', glow: true });
            }
            break;
          }
          case 'levelUp': this.showBanner(e.zone); break;
          case 'gameOver': this.shake = 5; this.say('Out of hearts!', L.cx, L.saucerScreenY + w.cam.y + L.unit * 1.6, '#ffd0e8', 30, 'goal'); break;
        }
      }
    }
    _quiet() { return AC.Game && AC.Game.mode === 'title'; }   // the title demo stays calm behind the menu
    ring(x, y, col, life, r, wdt) {
      if (this._quiet()) return; this.fx.push({ kind: 'ring', x, y, col, t: 0, life, r, w: wdt || 3 }); if (this.fx.length > 40) this.fx.shift(); }
    pop(txt, x, y, col, size) {
      if (this._quiet()) return;
      for (const t of this.texts) if (!t.big && t.t < 0.35 && Math.abs(t.x - x) < 60 && Math.abs(t.y - y) < size) y = t.y - size * 1.1;
      this.texts.push({ txt, x, y, col, size, t: 0, life: 0.9, vy: -55 }); if (this.texts.length > 24) this.texts.shift(); }
    say(txt, x, y, col, size, key) {
      if (this._quiet()) return;
      if (key) this.texts = this.texts.filter(t => t.key !== key);
      for (const t of this.texts) if (t.big && t.t < 1.2 && Math.abs(t.y - y) < size * 1.2) t.y -= size * 1.25;
      this.texts.push({ txt, x, y, col, size, t: 0, life: 1.4, vy: -18, big: true, key }); if (this.texts.length > 24) this.texts.shift();
    }

    update(dt) {
      this.time += dt; this.drift += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 0.9);
      this.shake = Math.max(0, this.shake - dt * 18);
      this.flash = Math.max(0, this.flash - dt * 1.6);
      this.comboShow = Math.max(0, this.comboShow - dt);
      this.heartPulse = Math.max(0, this.heartPulse - dt * 1.5);
      this.piePulse = Math.max(0, this.piePulse - dt * 1.2);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.2) this.banner = null; }
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter(f => f.t < f.life);
      for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; }
      this.texts = this.texts.filter(t => t.t < t.life);
      for (const f of this.flyers) f.t += dt;
      this.flyers = this.flyers.filter(f => f.t < f.life);
    }

    // ---------------- drawing ----------------
    camY() { const w = this.world; return w ? lerp(w.cam.prevY, w.cam.y, w.alpha || 0) : 0; }
    light() { const w = this.world; return w && w.light != null ? clamp(w.light, 0, 1) : 1; }
    /* 0 in daylight … 1 at the darkest night: how strongly glow things shine. */
    glowK() { return clamp((1 - this.light() - 0.04) / 0.5, 0, 1); }
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px, camY = this.camY();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      const v = this.vis;
      if (v.t < 1) { this.drawSceneBack(g, v.prev, 1, camY); this.drawSceneBack(g, v.cur, v.t, camY); }
      else this.drawSceneBack(g, v.cur, 1, camY);
      g.setTransform(px, 0, 0, px, 0, 0);
      this.drawParticles(g, 'back', camY, false);
      if (!w) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (v.t < 1) { this.drawGround(g, v.prev, 1, camY); this.drawGround(g, v.cur, v.t, camY); }
      else this.drawGround(g, v.cur, 1, camY);
      const sh = this.shake > 0 ? this.shake : 0;
      const sx = sh ? Math.sin(this.time * 71) * sh : 0, sy = sh ? Math.cos(this.time * 53) * sh * 0.6 : 0;
      // world space
      const world = () => g.setTransform(px, 0, 0, px, sx * px, (sy - camY) * px);
      world();
      this.drawBase(g, w);
      this.drawTower(g, w);
      this.drawFlag(g, w);
      this.drawGhost(g, w);
      this.drawApples(g, w);
      this.drawGuide(g, w, mode);
      this.drawSaucer(g, w, mode);
      g.setTransform(px, 0, 0, px, sx * px, sy * px);
      this.drawParticles(g, 'front', camY, false);
      // the twist: darkness with light cut-outs, then everything that glows
      this.drawDarkness(g, w, camY, sx, sy);
      g.setTransform(px, 0, 0, px, 0, 0);
      this.drawGlints(g, camY);
      world();
      this.drawAppleGlows(g, w);
      this.drawLanterns(g, w);
      g.setTransform(px, 0, 0, px, sx * px, sy * px);
      this.drawParticles(g, 'back', camY, true);
      this.drawParticles(g, 'front', camY, true);
      world();
      this.drawFx(g);
      if (this.debug) this.drawDebug(g, w);
      g.setTransform(1, 0, 0, 1, 0, 0);
      { const bg = this.background(v.cur); if (bg.vig) g.drawImage(bg.vig, 0, 0); }
      g.setTransform(px, 0, 0, px, 0, 0);
      const tint = this.weather && this.weather.ambient && this.weather.ambient.tint;
      if (tint) { g.fillStyle = tint; g.fillRect(0, 0, this.VW, this.VH); }
      if (mode !== 'title') { this.drawFlyers(g, w); this.drawHud(g, w, mode); }
      else {
        const dg = g.createRadialGradient(this.VW / 2, this.VH / 2, 0, this.VW / 2, this.VH / 2, Math.max(this.VW, this.VH) * 0.6);
        dg.addColorStop(0, 'rgba(10,8,34,.5)'); dg.addColorStop(1, 'rgba(10,8,34,.12)');
        g.fillStyle = dg; g.fillRect(0, 0, this.VW, this.VH);
      }
      if (this.banner && mode !== 'title') this.drawBanner(g);
      if (this.flash > 0) { g.globalAlpha = Math.min(0.5, this.flash * 0.8); g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.globalAlpha = 1; }
    }

    // ---------------- light (DESIGN §6) ----------------
    _tint(dayT) {
      const t = clamp(dayT || 0, 0, 3.999), i = Math.floor(t), f = t - i, a = TINT[i], b = TINT[i + 1];
      return [Math.round(lerp(a[0], b[0], f)), Math.round(lerp(a[1], b[1], f)), Math.round(lerp(a[2], b[2], f))];
    }
    /* ½-resolution offscreen darkness: zone tint at (1 − light)·0.82, soft holes cut for every world light. */
    drawDarkness(g, w, camY, sx, sy) {
      const light = this.light();
      this._darkA = 0;
      if (light > 0.97) return;
      const A = (1 - light) * DARK_K, cw = Math.ceil(this.canvas.width / 2), ch = Math.ceil(this.canvas.height / 2);
      let d = this._dark;
      if (!d || d.width !== cw || d.height !== ch) { d = this._dark = this._canvas(cw, ch); this._darkG = d.getContext('2d'); }
      const dg = this._darkG, k = this.px / 2, c = this._tint(w.dayT);
      dg.globalCompositeOperation = 'source-over';
      dg.setTransform(1, 0, 0, 1, 0, 0);
      dg.clearRect(0, 0, cw, ch);
      dg.fillStyle = 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + A.toFixed(3) + ')';
      dg.fillRect(0, 0, cw, ch);
      dg.globalCompositeOperation = 'destination-out';
      dg.setTransform(k, 0, 0, k, sx * k, (sy - camY) * k);
      const lights = w.lights ? w.lights() : [];
      for (const L of lights) {
        if (L.y - L.r - camY > this.VH || L.y + L.r - camY < 0) continue;
        const gr = dg.createRadialGradient(L.x, L.y, 0, L.x, L.y, L.r), a = clamp(L.a, 0, 1);
        // (1 − d²/r²)² falloff, the same shape the world uses for litAt()
        gr.addColorStop(0, 'rgba(0,0,0,' + a + ')');
        gr.addColorStop(0.25, 'rgba(0,0,0,' + (a * 0.88).toFixed(3) + ')');
        gr.addColorStop(0.5, 'rgba(0,0,0,' + (a * 0.56).toFixed(3) + ')');
        gr.addColorStop(0.75, 'rgba(0,0,0,' + (a * 0.19).toFixed(3) + ')');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        dg.fillStyle = gr;
        dg.fillRect(L.x - L.r, L.y - L.r, L.r * 2, L.r * 2);
      }
      dg.globalCompositeOperation = 'source-over';
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(d, 0, 0, this.canvas.width, this.canvas.height);
      this._darkA = A;
    }
    /* Cached soft round glow (64² device-independent sprite) in an rgb colour; drawn additive and scaled. */
    _glowSpr(rgb) {
      let c = this._glow.get(rgb);
      if (c) return c;
      c = this._canvas(64, 64); const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(0.3, 'rgba(' + rgb + ',.55)'); gr.addColorStop(0.65, 'rgba(' + rgb + ',.16)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
      g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      this._glow.set(rgb, c);
      return c;
    }
    _glowAt(g, rgb, x, y, r, a) {
      if (a <= 0.01 || r <= 0) return;
      g.globalAlpha = clamp(a, 0, 1);
      g.drawImage(this._glowSpr(rgb), x - r, y - r, r * 2, r * 2);
    }
    /* Castle windows, the moon and the night ground lamps (screen space, additive), following the layer offsets. */
    drawGlints(g, camY) {
      const gk = this.glowK(); if (gk <= 0.01 || !this.world) return;
      const v = this.vis, zs = v.t < 1 && v.prev !== v.cur ? [[v.prev, 1 - v.t], [v.cur, v.t]] : [[v.cur, 1]];
      const k = this.VH / 540, tw = 960 * k, u = this.world.layout.unit / 100, L = this.world.layout, VW = this.VW;
      g.save(); g.globalCompositeOperation = 'lighter';
      const each = (x0, sx, period, r, fn) => { let x = x0 + sx; x = ((x % period) + period) % period; for (x -= period; x < VW + r; x += period) if (x > -r) fn(x); };
      for (const [z, wz] of zs) {
        if (this._custom(z) || wz <= 0.01) continue;
        const key = ZONE_INFO[z].key, a0 = gk * wz;
        const fx0 = this._tileX0(this.drift * 1.2), fdy = this._farDY(camY) / this.px;
        if (fdy < this.VH) for (const [x, y, r, kind] of GLINTS[key]) {
          const fl = 0.85 + 0.15 * Math.sin(this.time * 3.1 + x * 0.37), col = kind === 'ghost' ? '210,190,255' : '255,196,100';
          each(fx0, x * k, tw, r * k * 1.8, X => this._glowAt(g, col, X, fdy + y * k, r * k * 1.8, 0.55 * a0 * fl));
        }
        if (key === 'night') {
          const sx0 = this._tileX0(this.drift * 3);
          each(sx0, MOON.x * k, tw, MOON.r * k * 2.2, X => this._glowAt(g, '255,246,205', X, MOON.y * k, MOON.r * k * 2.2, 0.28 * a0));
          const gy0 = L.groundY - 40 * u - camY;
          if (gy0 < this.VH) for (const [x, y, r] of GROUND_LIGHTS.night) {
            const fl = 0.8 + 0.2 * Math.sin(this.time * 5.3 + x);
            each(L.cx - 480 * u, x * u, 960 * u, r * u * 1.6, X => this._glowAt(g, '255,180,80', X, gy0 + y * u, r * u * 1.6, 0.6 * a0 * fl));
          }
        }
      }
      g.restore(); g.globalAlpha = 1;
    }

    spr(key, w, h) { return AC.Assets.sprite(key, w, h); }

    drawBase(g, w) {
      const b = w.base; if (!b) return;
      const im = this.spr('base', b.w, b.h);
      if (im) g.drawImage(im, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      else { g.fillStyle = '#8f86b8'; g.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); }
    }

    /* One crate: centre (x,y), size w×h, rotation, squash (0..1, flattens on landing, anchored at the bottom). */
    drawCrate(g, c, x, y, rot, alpha) {
      const A = AC.Assets, q = c.squash || 0, W = c.w, H = c.h;
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      if (rot) g.rotate(rot);
      if (q) { g.translate(0, H / 2); g.scale(1 + q * 0.14, 1 - q * 0.18); g.translate(0, -H / 2); }
      if (A.hasCustom('crate')) {
        const col = STYLE_COL[c.style % 4], line = STYLE_LINE[c.style % 4], r = Math.min(8, H * 0.12), f = Math.max(3, W * 0.05);
        this._rr(g, -W / 2, -H / 2, W, H, r); g.fillStyle = '#d9a066'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#6b3f1f'; g.stroke();
        g.save(); this._rr(g, -W / 2 + f, -H / 2 + f, W - f * 2, H - f * 2, r * 0.6); g.clip();
        const im = A.custom.crate, iw = W - f * 2, ih = H - f * 2, k = Math.max(iw / im.width, ih / im.height);
        const sp = this.spr('custom:crate', im.width * k, im.height * k);
        if (sp) g.drawImage(sp, -im.width * k / 2, -im.height * k / 2, im.width * k, im.height * k);
        g.restore();
        g.fillStyle = col; g.fillRect(-W / 2 + f, H / 2 - f - 4, W - f * 2, 4); g.lineWidth = 1; g.strokeStyle = line; g.strokeRect(-W / 2 + f, H / 2 - f - 4, W - f * 2, 4);
      } else {
        const im = this.spr('crate_' + (c.style % 4), W, H);
        if (im) g.drawImage(im, -W / 2, -H / 2, W, H);
        else { g.fillStyle = '#d9a066'; g.fillRect(-W / 2, -H / 2, W, H); }
      }
      g.restore();
    }
    _rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }

    drawTower(g, w) {
      const a = w.alpha || 0, T = w.tower, H = Math.max(1, T.height);
      const sway = lerp(T.prevSway, T.sway, a);
      for (const c of w.crates) {
        if (c.state === 'gone' || c.state === 'held') continue;
        const al = c.alpha == null ? 1 : clamp(c.alpha, 0, 1);
        if (al <= 0.01) continue;
        let x = lerp(c.prevX, c.x, a), y = lerp(c.prevY, c.y, a), rot = lerp(c.prevRot || 0, c.rot || 0, a);
        if (c.state === 'placed') {
          x += w.swayOffsetLerp(y, a);
          rot += sway * 0.002 * clamp((w.layout.groundY - y) / H, 0, 1);
        }
        this.drawCrate(g, c, x, y, rot, al);
      }
    }

    /* Lanterns on Perfect crates: lantern.svg rotated about its hook (24,0), drawn above the darkness with a warm core. */
    drawLanterns(g, w) {
      if (!w.lanternPos) return;
      const a = w.alpha || 0, u = w.layout.unit, LW = 0.34 * u, LH = 0.45 * u, gk = this.glowK(), camY = this.camY();
      const im = this.spr('lantern', LW, LH);
      for (const c of w.crates) {
        if (!c.lantern || c.state === 'gone' || c.state === 'held') continue;
        const al = c.alpha == null ? 1 : clamp(c.alpha, 0, 1);
        if (al <= 0.01) continue;
        const p = w.lanternPos(c, a);
        if (p.y - camY > this.VH + LH || p.y - camY < -LH * 2) continue;
        const rot = p.rot + (lerp(c.prevLanternRot == null ? c.lanternRot : c.prevLanternRot, c.lanternRot || 0, a) - (c.lanternRot || 0));
        const b = this._born.get(c), k = b == null ? 1 : clamp((this.time - b) / 0.35, 0, 1);
        const sc = b == null ? 1 : 1 + 2.70158 * Math.pow(k - 1, 3) + 1.70158 * Math.pow(k - 1, 2);   // easeOutBack: pops in with a little overshoot
        if (sc <= 0.02) continue;
        const pulse = 0.9 + 0.1 * Math.sin(this.time * 4 + c.id);
        g.save(); g.globalCompositeOperation = 'lighter';
        this._glowAt(g, '255,190,90', p.lx, p.ly, u * (0.45 + 0.35 * gk) * sc, (0.25 + 0.5 * gk) * pulse * al);
        g.restore();
        g.save(); g.globalAlpha = al; g.translate(p.x, p.y); g.rotate(rot); g.scale(sc, sc);
        if (im) g.drawImage(im, -LW / 2, 0, LW, LH);
        else { g.fillStyle = '#ffcf5a'; g.beginPath(); g.arc(0, LH * 0.55, LW * 0.4, 0, TAU); g.fill(); }
        g.restore();
      }
      g.globalAlpha = 1;
    }

    /* Drop guide: a dotted line from the held crate to where it would land; on Easy coloured by the result. */
    drawGuide(g, w, mode) {
      if (mode === 'title' || !w.held || w.phase !== 'swing' || w.difficulty === 'hard') return;
      const p = w.predictLanding && w.predictLanding(); if (!p) return;
      const c = w.held, a = w.alpha || 0, hx = lerp(c.prevX, c.x, a), hy = lerp(c.prevY, c.y, a) + c.h / 2;
      const easy = w.difficulty === 'easy';
      const col = !easy ? 'rgba(255,255,255,.6)' : p.perfect ? '#ffe14d' : p.ok ? '#ffffff' : '#ff4d6d';
      const ly = w.tower.topY;
      g.save();
      g.globalAlpha = 0.6 + 0.15 * Math.sin(this.time * 6);
      g.setLineDash([4, 7]); g.lineWidth = 3; g.strokeStyle = col;
      g.beginPath(); g.moveTo(hx, hy + 4); g.lineTo(p.x, ly - 8); g.stroke(); g.setLineDash([]);
      // landing shadow on top of the tower: solid bar = stays, dashed + ✕ = falls off, star = perfect (shape, not only colour)
      g.globalAlpha = easy ? 0.85 : 0.4;
      if (p.ok) { g.fillStyle = col; this._rr(g, p.x - c.w / 2, ly - 6, c.w, 6, 3); g.fill(); }
      else {
        g.setLineDash([8, 6]); g.lineWidth = 3; g.strokeStyle = col; this._rr(g, p.x - c.w / 2, ly - 6, c.w, 6, 3); g.stroke(); g.setLineDash([]);
        if (easy) { const r = 7; g.beginPath(); g.moveTo(p.x - r, ly - 20 - r); g.lineTo(p.x + r, ly - 20 + r); g.moveTo(p.x + r, ly - 20 - r); g.lineTo(p.x - r, ly - 20 + r); g.lineWidth = 4; g.stroke(); }
      }
      if (easy && p.perfect) this._star(g, p.x, ly - 20, 11, col);
      g.restore();
    }

    _appleAlpha(c) { return c.state === 'gone' ? clamp(c.fade == null ? 0 : c.fade, 0, 1) : 1; }
    drawApples(g, w) {
      const a = w.alpha || 0, A = AC.Assets, list = w.appleList || [], u = w.layout.unit, s = 0.42 * u;
      for (const c of list) {
        if (c.state === 'collected') continue;   // drawn as a flyer to the HUD
        const al = this._appleAlpha(c);
        if (al <= 0.01) continue;
        const x = lerp(c.prevX, c.x, a), y = lerp(c.prevY, c.y, a), rot = lerp(c.prevRot == null ? c.rot || 0 : c.prevRot, c.rot || 0, a);
        g.save(); g.globalAlpha = al; g.translate(x, y); if (rot) g.rotate(rot);
        if (A.hasCustom('apple')) {
          const R = s * 0.5;
          g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fillStyle = '#ff4d4d'; g.fill();
          g.save(); g.beginPath(); g.arc(0, 0, R * 0.8, 0, TAU); g.clip();
          const im = this.spr('custom:apple', R * 1.6, R * 1.6); if (im) g.drawImage(im, -R * 0.8, -R * 0.8, R * 1.6, R * 1.6);
          g.restore(); g.lineWidth = 2; g.strokeStyle = '#7a1b26'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
          g.beginPath(); g.ellipse(R * 0.35, -R * 1.05, R * 0.32, R * 0.16, -0.5, 0, TAU); g.fillStyle = '#5ccf5c'; g.fill();
        } else {
          const im = this.spr('apple_' + (c.frame ? 1 : 0), s, s);
          if (im) g.drawImage(im, -s / 2, -s * 34 / 64, s, s);
          else { g.beginPath(); g.arc(0, 0, s * 0.4, 0, TAU); g.fillStyle = '#ff4d4d'; g.fill(); }
        }
        g.restore();
      }
      g.globalAlpha = 1;
    }
    /* apple_glow.svg (0.9 unit) under glow apples when it is dark, additive above the darkness. */
    drawAppleGlows(g, w) {
      const list = w.appleList || []; if (!list.length) return;
      const gk = clamp((0.62 - this.light()) / 0.3, 0, 1); if (gk <= 0.01) return;
      const a = w.alpha || 0, u = w.layout.unit, s = 0.9 * u, im = this.spr('apple_glow', s, s);
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const c of list) {
        if (c.state === 'collected' || !c.glow) continue;
        const al = this._appleAlpha(c) * gk * (0.75 + 0.25 * Math.sin(this.time * 3 + (c.id || 0)));
        if (al <= 0.01) continue;
        const x = lerp(c.prevX, c.x, a), y = lerp(c.prevY, c.y, a);
        g.globalAlpha = al;
        if (im) g.drawImage(im, x - s / 2, y - s / 2, s, s);
      }
      g.restore(); g.globalAlpha = 1;
    }

    drawFlag(g, w) {
      const f = w.flag; if (!f) return;
      const u = w.layout.unit, k = clamp(f.t / 0.5, 0, 1), e = 1 - Math.pow(1 - k, 3);
      const fw = 0.6 * u, fh = 1.2 * u * e, x = f.x + w.swayOffsetLerp(f.y, w.alpha || 0);
      if (fh < 2) return;
      const al = w.phase === 'travel' ? clamp(1 - w.phaseT / 0.8, 0, 1) : 1;
      const im = this.spr('flag', fw, 1.2 * u);
      g.save(); g.globalAlpha = al;
      const by = f.y - fh + fh * 14 / 128;
      const hg = g.createRadialGradient(x, by, 0, x, by, u * 0.6);
      hg.addColorStop(0, 'rgba(255,220,110,' + (0.45 + 0.2 * Math.sin(this.time * 8)) + ')'); hg.addColorStop(1, 'rgba(255,220,110,0)');
      g.fillStyle = hg; g.beginPath(); g.arc(x, by, u * 0.6, 0, TAU); g.fill();
      if (im) g.drawImage(im, x - fw * 12 / 64, f.y - fh * 124 / 128, fw, fh);
      g.restore();
    }

    /* Granny Boo (goal show): ghost.svg / ghost_wave.svg, centre (48,80), 0.9×1.5 unit, with a soft lilac halo. */
    drawGhost(g, w) {
      const gh = w.ghost; if (!gh) return;
      const u = w.layout.unit, a = w.alpha || 0, x = lerp(gh.prevX, gh.x, a), y = lerp(gh.prevY, gh.y, a);
      const gw = 0.9 * u, ghh = 1.5 * u, im = this.spr(gh.wave ? 'ghost_wave' : 'ghost', gw, ghh) || this.spr('ghost', gw, ghh);
      g.save();
      const hg = g.createRadialGradient(x, y, 0, x, y, u * 0.95);
      hg.addColorStop(0, 'rgba(235,225,255,.35)'); hg.addColorStop(1, 'rgba(235,225,255,0)');
      g.fillStyle = hg; g.beginPath(); g.arc(x, y, u * 0.95, 0, TAU); g.fill();
      g.translate(x, y);
      g.rotate(clamp((gh.vx || 0) * 0.0004, -0.15, 0.15));
      if (im) g.drawImage(im, -gw / 2, -ghh * 80 / 160, gw, ghh);
      else { g.fillStyle = '#f4f0ff'; g.beginPath(); g.ellipse(0, 0, gw * 0.45, ghh * 0.48, 0, 0, TAU); g.fill(); }
      g.restore();
    }

    drawSaucer(g, w, mode) {
      const s = w.saucer, a = w.alpha || 0, A = AC.Assets, u = w.layout.unit;
      const x = lerp(s.prevX, s.x, a), y = lerp(s.prevY, s.y, a);
      const S = u * Z_K;
      // warm lantern glow + held crate
      if (w.held) {
        const c = w.held, hx = lerp(c.prevX, c.x, a), hy = lerp(c.prevY, c.y, a);
        const ex = x, ey = y + S * Z_EMIT, bh = hy - c.h / 2 - ey;
        const bim = this.spr('beam', 80, 120);
        if (bim && bh > 2) {
          g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.55 + 0.12 * Math.sin(this.time * 9);
          g.translate(ex, ey); g.rotate(Math.atan2(-(hx - ex), bh) * 0.8);
          g.drawImage(bim, -c.w * 0.55, 0, c.w * 1.1, bh + 4); g.restore();
        }
        this.drawCrate(g, c, hx, hy, lerp(c.prevRot || 0, c.rot || 0, a), 1);
      }
      g.save();
      g.translate(x, y);
      g.rotate((s.tilt || 0) + (s.anim === 'oops' ? Math.sin(this.time * 28) * 0.05 : 0));
      if (this.piePulse > 0) { const k = 1 + Math.sin(this.piePulse * Math.PI * 3) * 0.05 * this.piePulse; g.scale(k, k); }
      if (A.hasCustom('hero')) this._customHero(g, S);
      else {
        const frame = w.phase === 'over' ? 'oops' : (w.phase === 'goal' || w.phase === 'travel') ? 'happy' : (s.anim || 'idle');
        const im = this.spr('ziggy_' + frame, S, S) || this.spr('ziggy_idle', S, S);
        if (im) g.drawImage(im, -S / 2, -S * Z_CY, S, S);
      }
      g.restore();
    }
    /* The player's picture riding in a procedural mint hover-rocket (portholes, fins, glowing lantern nozzle). */
    _customHero(g, S) {
      const A = AC.Assets, R = S * 0.42, top = S * 0.02, bw = R * 2.1, bh = S * 0.3;
      // fins
      g.fillStyle = '#ff8a7a'; g.strokeStyle = '#a84a4a'; g.lineWidth = 2.5;
      for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(sg * bw * 0.42, top + bh * 0.2); g.lineTo(sg * bw * 0.68, top + bh * 1.05); g.lineTo(sg * bw * 0.36, top + bh * 0.85); g.closePath(); g.fill(); g.stroke(); }
      // the picture, bobbing above the rim
      const [fw, fh] = A.fit('hero', R * 1.6, R * 1.6), bob = Math.sin(this.time * 5) * S * 0.015;
      const im = this.spr('custom:hero', fw, fh);
      if (im) g.drawImage(im, -fw / 2, top - fh * 0.82 + bob, fw, fh);
      // barrel
      this._rr(g, -bw / 2, top, bw, bh, bh * 0.45); g.fillStyle = '#3fd6c0'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#1f7f73'; g.stroke();
      g.fillStyle = '#ffffff'; g.fillRect(-bw / 2 + 4, top + bh * 0.12, bw - 8, bh * 0.14);
      for (let i = -1; i <= 1; i++) {
        g.beginPath(); g.arc(i * bw * 0.26, top + bh * 0.6, bh * 0.17, 0, TAU); g.fillStyle = '#fff6c8'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#1f7f73'; g.stroke();
      }
      const ey = S * Z_EMIT;
      const hg = g.createRadialGradient(0, ey, 0, 0, ey, S * 0.12); hg.addColorStop(0, 'rgba(255,230,140,.9)'); hg.addColorStop(1, 'rgba(255,230,140,0)');
      g.fillStyle = hg; g.beginPath(); g.arc(0, ey, S * 0.12, 0, TAU); g.fill();
      g.beginPath(); g.arc(0, ey, S * 0.035, 0, TAU); g.fillStyle = '#ffe28a'; g.fill();
    }

    /* glow === true → only glow particles (above the darkness, additive), false → only the rest. */
    drawParticles(g, layer, camY, glow) {
      const wx = this.weather; if (!wx) return;
      if (glow) g.globalCompositeOperation = 'lighter';
      for (const p of wx.particles) {
        if (p.layer !== layer || !!p.glow !== glow || p.alpha <= 0.01) continue;
        const im = this.spr('p_' + p.sprite, p.size, p.size);
        if (!im) continue;
        const y = p.world ? p.y - camY : p.y;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.rot || p.flipX) {
          g.save(); g.translate(p.x, y); if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
          g.drawImage(im, -p.size / 2, -p.size / 2, p.size, p.size); g.restore();
        } else g.drawImage(im, p.x - p.size / 2, y - p.size / 2, p.size, p.size);
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }

    drawFx(g) {
      for (const f of this.fx) {
        const k = f.t / f.life;
        if (f.kind === 'ring') {
          g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = f.col; g.lineWidth = f.w * (1 - k) + 1;
          g.beginPath(); g.ellipse(f.x, f.y, f.r * (0.3 + 0.7 * Math.sqrt(k)), f.r * 0.35 * (0.3 + 0.7 * Math.sqrt(k)), 0, 0, TAU); g.stroke();
        }
      }
      g.globalAlpha = 1;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const k = t.t / t.life, sc = t.big ? (k < 0.15 ? 0.6 + k / 0.15 * 0.5 : k < 0.25 ? 1.1 - (k - 0.15) : 1) : 1;
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = '900 ' + Math.round(t.size * sc * this._hudK) + 'px ' + FONT;
        const maxW = this.VW - 40, tw = g.measureText(t.txt).width;
        if (tw > maxW) g.font = '900 ' + Math.floor(t.size * sc * this._hudK * maxW / tw) + 'px ' + FONT;
        const half = Math.min(tw, maxW) / 2 + 10, x = clamp(t.x, half, this.VW - half);
        g.lineWidth = Math.max(3, t.size * 0.22); g.strokeStyle = 'rgba(40,16,48,.9)'; g.strokeText(t.txt, x, t.y);
        g.fillStyle = t.col; g.fillText(t.txt, x, t.y);
      }
      g.globalAlpha = 1;
    }

    /* Collected apples fly (screen space) to the pie counter in the HUD. */
    drawFlyers(g, w) {
      if (!this._pieAt) return;
      const s = w.layout.unit * 0.42;
      for (const f of this.flyers) {
        const k = f.t / f.life, e = k * k * (3 - 2 * k), z = 1 - k * 0.5;
        const x = lerp(f.x, this._pieAt.x, e), y = lerp(f.y, this._pieAt.y, e) - Math.sin(k * Math.PI) * 40;
        const im = AC.Assets.hasCustom('apple') ? null : this.spr('apple_0', s, s);
        g.globalAlpha = 1 - k * 0.3;
        if (im) g.drawImage(im, x - s / 2 * z, y - s / 2 * z, s * z, s * z);
        else { g.beginPath(); g.arc(x, y, s * 0.4 * z, 0, TAU); g.fillStyle = '#ff4d4d'; g.fill(); }
      }
      g.globalAlpha = 1;
    }

    // ---------------- HUD ----------------
    _panel(g, x, y, w, h, r) {
      this._rr(g, x, y, w, h, r);
      g.fillStyle = 'rgba(40,22,64,.72)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(255,214,160,.45)'; g.stroke();
    }
    _text(g, txt, x, y, size, col, align, weight) {
      g.font = (weight || '900') + ' ' + Math.round(size) + 'px ' + FONT; g.textAlign = align || 'left'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, size * 0.18); g.strokeStyle = 'rgba(30,12,40,.95)'; g.strokeText(txt, x, y);
      g.fillStyle = col; g.fillText(txt, x, y);
    }
    /* Panels fade when Ziggy's rocket flies under them (and during the goal show), so she is never hidden. */
    _fadeFor(w, x, y, wd, ht) {
      if (w.phase === 'goal' || w.phase === 'travel') return 0.35;
      const s = w.saucer, a = w.alpha || 0, S = w.layout.unit * Z_K * (s.scale || 1), camY = this.camY();
      const sx = lerp(s.prevX, s.x, a), sy = lerp(s.prevY, s.y, a) - camY;
      const l = sx - S * 0.45, r = sx + S * 0.45, t = sy - S * Z_CY, b = sy + S * 0.3;
      return (r > x && l < x + wd && b > y && t < y + ht) ? 0.3 : 1;
    }
    drawHud(g, w, mode) {
      const L = w.layout, K = Math.min(this._hudK, 1.25), I = this.ins, VW = this.VW;
      const best = AC.Game ? AC.Game.best(AC.Game.runDifficulty) : 0;
      const x0 = I.left + 12, top = I.top + 12, hb = this._hudBtn;
      // score + best + hearts (left)
      const pw = 190 * Math.min(K, 1.1);
      this._hudA = this._hudA || [1, 1];
      this._hudA[0] += (this._fadeFor(w, x0, top, pw, 98) - this._hudA[0]) * 0.15;
      g.globalAlpha = this._hudA[0];
      this._panel(g, x0, top, pw, 98, 18);
      this._text(g, String(w.score), x0 + 16, top + 30, 32 * K, '#fff', 'left');
      this._text(g, 'Best ' + Math.max(best, w.score), x0 + 16, top + 58, 13 * K, '#ffd98a', 'left', '800');
      if ((w.combo || 0) >= 2) this._text(g, '×' + Math.min(5, w.combo), x0 + pw - 16, top + 30, (20 + (this.comboShow > 0 ? 4 : 0)) * K, '#fff2a8', 'right');
      const hs = 22 * Math.min(K, 1.15);
      for (let i = 0; i < w.maxHearts; i++) {
        const on = i < w.hearts, pulse = (!on && i === w.hearts && this.heartPulse > 0) ? 1 + this.heartPulse * 0.5 : (on && i === w.hearts - 1 && this.piePulse > 0) ? 1 + this.piePulse * 0.4 : 1;
        const im = this.spr(on ? 'heart' : 'heart_empty', hs, hs), hx = x0 + 14 + i * (hs + 4), hy = top + 72;
        if (im) g.drawImage(im, hx + hs / 2 - hs * pulse / 2, hy + hs / 2 - hs * pulse / 2 - 6, hs * pulse, hs * pulse);
      }
      // time of day + crates + apple/pie counter + sun/moon dial (centre top in landscape, second row in portrait)
      const right = hb ? hb.l - 10 : VW - 110;
      let cx, cy, cw;
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 200, 320); cx = Math.max(x0 + pw + 12 + cw / 2, VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = top; }
      else { cw = Math.min(VW - I.left - I.right - 24, 420); cx = VW / 2; cy = top + 108; }
      g.globalAlpha = 1;
      this._hudA[1] += (this._fadeFor(w, cx - cw / 2, cy, cw, 78) - this._hudA[1]) * 0.15;
      const HA = this._hudA[1];
      g.globalAlpha = HA;
      this._panel(g, cx - cw / 2, cy, cw, 78, 18);
      const info = ZONE_INFO[w.zone % 4];
      const bx = cx - cw / 2 + 14, bw = cw - 28;
      this._text(g, (cw >= 260 ? info.name : info.short) + (w.loop ? ' ★' + (w.loop + 1) : ''), bx, cy + 18, 13 * K, info.color, 'left', '800');
      this._text(g, Math.min(w.placed, w.goal) + ' / ' + w.goal, cx + cw / 2 - 14, cy + 18, 15 * K, '#fff', 'right');
      // progress bar
      const by = cy + 32, bhh = 10, k = clamp(w.placed / Math.max(1, w.goal), 0, 1);
      this._rr(g, bx, by, bw, bhh, 5); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill();
      if (k > 0) { this._rr(g, bx, by, Math.max(10, bw * k), bhh, 5); const gr = g.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#ffb15c'); gr.addColorStop(1, '#ffd23f'); g.fillStyle = gr; g.fill(); }
      // apple counter: pie icon + 5 apple pips (pieApples/5)
      const gy = cy + 60, cs = 15, ps = 26 * Math.min(K, 1.1);
      const pie = this.spr('pie', ps, ps * 0.75), pk = 1 + this.piePulse * 0.35;
      if (pie) g.drawImage(pie, bx + ps / 2 - ps * pk / 2, gy - ps * 0.375 * pk, ps * pk, ps * 0.75 * pk);
      const ax0 = bx + ps + 6;
      for (let i = 0; i < 5; i++) {
        const on = i < (w.pieApples || 0), im = this.spr('apple_0', cs, cs);
        g.globalAlpha = (on ? 1 : 0.28) * HA;
        if (im) g.drawImage(im, ax0 + i * (cs + 3), gy - cs * 34 / 64, cs, cs);
      }
      g.globalAlpha = HA;
      this._pieAt = { x: ax0 + Math.min(4, w.pieApples || 0) * (cs + 3) + cs / 2, y: gy };
      const pies = (w.stats && w.stats.pies) || 0;
      if (pies > 0) this._text(g, '×' + pies, ax0 + 5 * (cs + 3) + 2, gy, 12 * K, '#ffd98a', 'left', '800');
      this._dial(g, bx + bw - 16, gy + 6, 15, w.dayT || 0);
      g.globalAlpha = 1;
      if (this.hintOn && mode === 'playing' && !this.banner) this._text(g, ZONE_INFO[0].hint, L.cx, Math.min(this.VH - 24, L.groundY - this.camY() + (this.VH - L.groundY) * 0.5), 18 * K, '#fff', 'center', '800');
    }
    /* Small sun/moon dial: the marker travels along a half-circle from dawn (left) to night (right). */
    _dial(g, x, y, r, dayT) {
      const t = clamp((dayT % 4) / 4, 0, 1), ang = Math.PI + t * Math.PI, mx = x + Math.cos(ang) * r, my = y + Math.sin(ang) * r;
      const ga = g.globalAlpha;
      g.lineWidth = 3; g.lineCap = 'round';
      const gr = g.createLinearGradient(x - r, 0, x + r, 0);
      gr.addColorStop(0, '#ffb3c8'); gr.addColorStop(0.35, '#8fd4ff'); gr.addColorStop(0.68, '#ff9a5a'); gr.addColorStop(1, '#4b4aa0');
      g.strokeStyle = gr; g.beginPath(); g.arc(x, y, r, Math.PI, TAU); g.stroke();
      g.lineCap = 'butt';
      if (dayT % 4 < 2.7) {   // sun
        g.fillStyle = '#ffd23f'; g.beginPath(); g.arc(mx, my, 5.5, 0, TAU); g.fill();
        g.strokeStyle = '#c98a00'; g.lineWidth = 1.5; g.stroke();
      } else {                 // crescent moon
        g.fillStyle = '#f4f0c8'; g.beginPath(); g.arc(mx, my, 5.5, 0, TAU); g.fill();
        g.globalAlpha = ga; g.fillStyle = 'rgba(40,22,64,1)'; g.beginPath(); g.arc(mx + 2.6, my - 1.6, 4.4, 0, TAU); g.fill();
      }
      g.globalAlpha = ga;
    }
    _star(g, x, y, r, col) {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = col; g.fill();
    }

    drawBanner(g) {
      const b = this.banner, info = ZONE_INFO[b.s % 4], t = b.t, L = this.world.layout;
      const a = t < 0.3 ? t / 0.3 : t > 1.8 ? Math.max(0, (2.2 - t) / 0.4) : 1;
      const h = 76, cx = L.cx, y = Math.min(this.VH - h / 2 - 6, L.groundY - this.camY() + (this.VH - L.groundY) * 0.5) - (1 - a) * 16;
      const w = Math.min(this.VW - 40, 440);
      g.globalAlpha = a * 0.85;
      this._panel(g, cx - w / 2, y - h / 2, w, h, 22);
      g.globalAlpha = a;
      this._text(g, info.name + (b.loop ? '  ★' + (b.loop + 1) : ''), cx, y - 14, 24, info.color, 'center');
      this._text(g, 'Stack ' + b.goal + ' crates for Granny Boo!', cx, y + 18, 16, '#fff', 'center', '800');
      g.globalAlpha = 1;
    }

    drawDebug(g, w) {
      const L = w.layout;
      g.strokeStyle = 'rgba(0,255,120,.7)'; g.lineWidth = 1;
      for (const c of w.crates) { if (c.state === 'gone') continue; g.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h); }
      g.beginPath(); g.moveTo(0, L.groundY); g.lineTo(this.VW, L.groundY); g.stroke();
      g.strokeStyle = 'rgba(255,0,180,.6)'; const cy = w.cam.y;
      g.beginPath(); g.moveTo(0, cy + L.topLine); g.lineTo(this.VW, cy + L.topLine); g.stroke();
      for (const c of (w.appleList || [])) { g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.stroke(); }
      if (w.lights) { g.strokeStyle = 'rgba(255,220,0,.5)'; for (const l of w.lights()) { g.beginPath(); g.arc(l.x, l.y, l.r, 0, TAU); g.stroke(); } }
      g.fillStyle = '#0f8'; g.font = '11px monospace'; g.textAlign = 'left';
      g.fillText(w.phase + ' light ' + (w.light || 0).toFixed(2) + ' dayT ' + (w.dayT || 0).toFixed(2) + ' sway ' + w.tower.sway.toFixed(1) + ' crates ' + w.crates.length + ' cam ' + cy.toFixed(0), 10, cy + this.VH - 10);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  AC.Renderer = Renderer;
})(window.AC = window.AC || {});
