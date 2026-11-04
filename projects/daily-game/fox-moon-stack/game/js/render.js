/* MS.Renderer — the planet scene, the crate tower, Juno's saucer, coins, particles, juice and the HUD (DESIGN §2–§4).
 * Layers: sky (fixed, drifting) and far (sinks as the camera rises) are pre-rendered as device-pixel tiles and blitted
 * pixel-exact; the ground strip is pre-rendered once per planet / size and drawn in world space. Planet changes
 * crossfade. Everything that moves is lerped between simulation steps with world.alpha. */
(function (MS) {
  'use strict';
  const ZONE_INFO = [
    { name: 'Moon Base', color: '#c9d0ff', dark: '#141a40', ground: '#4a4c7e', vig: 'rgba(6,8,30,.40)', hint: 'Tap to drop the crate on the tower!' },
    { name: 'Rusty Dunes', color: '#ffb48a', dark: '#2a1638', ground: '#6e3028', vig: 'rgba(30,8,20,.40)', hint: 'Grab the star-coins to grow!' },
    { name: 'Ring World', color: '#8ff0e4', dark: '#0d2238', ground: '#2c5a6c', vig: 'rgba(2,12,24,.42)', hint: 'Land in the middle for Perfect!' },
    { name: 'Comet Garden', color: '#ffb8e2', dark: '#1e1040', ground: '#5e4589', vig: 'rgba(16,6,34,.42)', hint: 'Stack them all for the rocket!' }
  ];
  const STYLE_COL = ['#ff6b6b', '#ffc93c', '#4fb8ff', '#3fd6a0'];
  const STYLE_LINE = ['#9e2a32', '#8f5c00', '#1a5a96', '#11704c'];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const JUNO_K = 1.55, JUNO_CY = 78 / 160, JUNO_EMIT = (140 - 78) / 160;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = []; this.flyers = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fff6d0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.drift = 0; this.hintOn = true; this.comboShow = 0; this.heartPulse = 0; this.growPulse = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map();
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
      const dpr = window.devicePixelRatio || 1, touch = !!(MS.Game && MS.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear();
      this._hudK = clamp(0.95 / v.s, 1, 1.6);
      this._view = v;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      if (this.world && this.world.setLayout && (this.world.layout.width !== v.VW || this.world.layout.height !== v.VH)) this.world.setLayout(v.VW, v.VH);
      this._measureHud();
      MS.Assets.setScale(this.px);
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width, b: (r.bottom - c.top) * this.VH / c.height } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.flyers.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.comboShow = 0; this.heartPulse = 0; this.growPulse = 0;
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
    _slot(b) { return MS.Assets.SLOTS[3 + b].id; }
    _custom(b) { return MS.Assets.hasCustom(this._slot(b)); }
    _unit() { return this.world ? this.world.layout.unit : Math.min(this.VW / 9.6, this.VH / 5.4); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (MS.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
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
      const A = MS.Assets, n = A.SEASONS[b], px = this.px, VW = this.VW, VH = this.VH, info = ZONE_INFO[b], u = this._unit() / 100;
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
        // vignette baked into the sky tile is not tileable → draw it on a screen overlay instead
      }
      const gw = 960 * u, gh = 180 * u;
      const gc = this._canvas(VW * px, gh * px), gg = gc.getContext('2d'); gg.imageSmoothingQuality = 'high';
      gg.setTransform(px, 0, 0, px, 0, 0);
      const gim = A.img[n + '_ground'];
      if (gim) { let x0 = VW / 2 - gw / 2; while (x0 > 0) x0 -= gw; for (let x = x0; x < VW; x += gw) gg.drawImage(gim, x, 0, gw, gh); }
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
    _blitTile(g, tile, off, dy, alpha) {
      if (!tile) return;
      const tw = tile.width, cw = this.canvas.width;
      let x = -Math.round(((off * this.px) % tw + tw) % tw);
      g.globalAlpha = alpha;
      for (; x < cw; x += tw) g.drawImage(tile, x, dy);
    }
    /* Sky (drifting) and far (sinks with the camera: −camY·0.15). */
    drawSceneBack(g, b, alpha, camY) {
      const bg = this.background(b);
      if (bg.custom) { g.globalAlpha = alpha; g.drawImage(bg.sky, 0, 0); g.globalAlpha = 1; return; }
      this._blitTile(g, bg.sky, this.drift * 3, 0, alpha);
      const dy = Math.round(-camY * 0.15 * this.px);
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
            if (wx) {
              const by = c.y + c.h / 2;
              wx.burst('puff', c.x - c.w * 0.45, by, 2 + Math.round(v * 3), { speed: 70 * u, life: 0.5, size: 14 * u, gravity: -10, spread: 1.2, angle: Math.PI, layer: 'front' });
              wx.burst('puff', c.x + c.w * 0.45, by, 2 + Math.round(v * 3), { speed: 70 * u, life: 0.5, size: 14 * u, gravity: -10, spread: 1.2, angle: 0, layer: 'front' });
            }
            this.shake = Math.max(this.shake, 1.5 + v * 2 + (w.grow || 0) * 0.3);
            break;
          }
          case 'perfect': {
            const c = e.crate;
            this.ring(c.x, c.y - c.h / 2, '#fff2a8', 0.5, c.w * 0.8, 4);
            if (wx) wx.burst('sparkle', c.x, c.y - c.h / 2, 8 + Math.min(8, e.combo * 2), { speed: 160 * u, life: 0.6, size: 14 * u, gravity: 60, up: 0.5, layer: 'front' });
            this.say(e.combo >= 2 ? 'Perfect ×' + Math.min(5, e.combo) + '!' : 'Perfect!', c.x, c.y - c.h * 1.6, '#fff2a8', 26, 'perfect');
            this.pop('+' + (10 + 10 * Math.min(5, e.combo)), c.x + c.w * 0.75, c.y - c.h * 0.4, '#ffe9a8', 18);
            this.comboShow = 1.2;
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
          case 'coin': {
            if (wx) wx.burst('coinbit', e.x, e.y, 6, { speed: 120 * u, life: 0.5, size: 12 * u, gravity: 200, up: 0.6, layer: 'front' });
            this.pop('+5', e.x, e.y - 24 * u, '#ffd23f', 17);
            this.flyers.push({ x: e.x, y: e.y - (w.cam ? w.cam.y : 0), t: 0, life: 0.6 });
            break;
          }
          case 'grow': {
            this.growPulse = 1;
            const s = w.saucer;
            this.say('Juno grows bigger!', L.cx, w.layout.saucerScreenY + w.cam.y + L.unit * 1.5, '#9ff5ea', 22, 'grow');
            if (wx) wx.burst('star', s.x, s.y, 12, { speed: 200 * u, life: 0.8, size: 14 * u, gravity: 100, layer: 'front' });
            break;
          }
          case 'shrink': this.growPulse = 0.6; break;
          case 'combo': this.comboShow = 1.2; break;
          case 'goal': {
            this.flash = 0.55; this.flashCol = '#fff2c4';
            this.say('Planet done!', L.cx, w.layout.saucerScreenY + w.cam.y + L.unit * 1.4, '#ffe9a8', 30, 'goal');
            this.pop('+' + e.bonus, e.x, e.y - L.unit * 0.3, '#ffd23f', 24);
            if (wx) wx.burst('star', e.x, e.y, 16, { speed: 260 * u, life: 1.0, size: 16 * u, gravity: 220, up: 0.5, layer: 'front' });
            break;
          }
          case 'rocket': {
            const r = w.rocket; this.shake = Math.max(this.shake, 3);
            if (r && wx) wx.burst('puff', r.x, L.groundY, 10, { speed: 160 * u, life: 0.8, size: 20 * u, gravity: -30, spread: 3, up: 0.2, layer: 'front' });
            break;
          }
          case 'levelUp': this.showBanner(e.zone); break;
          case 'gameOver': this.shake = 5; this.say('Out of hearts!', L.cx, L.saucerScreenY + w.cam.y + L.unit * 1.6, '#ffd0e8', 30, 'goal'); break;
        }
      }
    }
    _quiet() { return MS.Game && MS.Game.mode === 'title'; }   // the title demo stays calm behind the menu
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
      this.growPulse = Math.max(0, this.growPulse - dt * 1.2);
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
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px, camY = this.camY();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      const v = this.vis;
      if (v.t < 1) { this.drawSceneBack(g, v.prev, 1, camY); this.drawSceneBack(g, v.cur, v.t, camY); }
      else this.drawSceneBack(g, v.cur, 1, camY);
      g.setTransform(px, 0, 0, px, 0, 0);
      this.drawParticles(g, 'back', camY);
      if (!w) return;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (v.t < 1) { this.drawGround(g, v.prev, 1, camY); this.drawGround(g, v.cur, v.t, camY); }
      else this.drawGround(g, v.cur, 1, camY);
      const sh = this.shake > 0 ? this.shake : 0;
      const sx = sh ? Math.sin(this.time * 71) * sh : 0, sy = sh ? Math.cos(this.time * 53) * sh * 0.6 : 0;
      // world space
      g.setTransform(px, 0, 0, px, sx * px, (sy - camY) * px);
      this.drawBase(g, w);
      this.drawRocket(g, w);
      this.drawTower(g, w);
      this.drawFlag(g, w);
      this.drawCoins(g, w);
      this.drawGuide(g, w, mode);
      this.drawSaucer(g, w, mode);
      g.setTransform(px, 0, 0, px, sx * px, sy * px);
      this.drawParticles(g, 'front', camY);
      g.setTransform(px, 0, 0, px, sx * px, (sy - camY) * px);
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
        dg.addColorStop(0, 'rgba(10,8,34,.55)'); dg.addColorStop(1, 'rgba(10,8,34,.15)');
        g.fillStyle = dg; g.fillRect(0, 0, this.VW, this.VH);
      }
      if (this.banner && mode !== 'title') this.drawBanner(g);
      if (this.flash > 0) { g.globalAlpha = Math.min(0.5, this.flash * 0.8); g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.globalAlpha = 1; }
    }

    spr(key, w, h) { return MS.Assets.sprite(key, w, h); }

    drawBase(g, w) {
      const b = w.base; if (!b) return;
      const im = this.spr('base', b.w, b.h);
      if (im) g.drawImage(im, b.x - b.w / 2, b.y - b.h / 2, b.w, b.h);
      else { g.fillStyle = '#c9c2f0'; g.fillRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); }
    }

    /* One crate: centre (x,y), size w×h, rotation, squash (0..1, flattens on landing, anchored at the bottom). */
    drawCrate(g, c, x, y, rot, alpha) {
      const A = MS.Assets, q = c.squash || 0, W = c.w, H = c.h;
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      if (rot) g.rotate(rot);
      if (q) { g.translate(0, H / 2); g.scale(1 + q * 0.14, 1 - q * 0.18); g.translate(0, -H / 2); }
      if (A.hasCustom('crate')) {
        const col = STYLE_COL[c.style % 4], line = STYLE_LINE[c.style % 4], r = Math.min(8, H * 0.12), f = Math.max(3, W * 0.05);
        this._rr(g, -W / 2, -H / 2, W, H, r); g.fillStyle = col; g.fill(); g.lineWidth = 2.5; g.strokeStyle = line; g.stroke();
        g.save(); this._rr(g, -W / 2 + f, -H / 2 + f, W - f * 2, H - f * 2, r * 0.6); g.clip();
        const im = A.custom.crate, iw = W - f * 2, ih = H - f * 2, k = Math.max(iw / im.width, ih / im.height);
        const sp = this.spr('custom:crate', im.width * k, im.height * k);
        if (sp) g.drawImage(sp, -im.width * k / 2, -im.height * k / 2, im.width * k, im.height * k);
        g.restore();
      } else {
        const im = this.spr('crate_' + (c.style % 4), W, H);
        if (im) g.drawImage(im, -W / 2, -H / 2, W, H);
        else { g.fillStyle = STYLE_COL[c.style % 4]; g.fillRect(-W / 2, -H / 2, W, H); }
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

    /* Drop guide: a dotted line from the held crate to where it would land; on Easy coloured by the result. */
    drawGuide(g, w, mode) {
      if (mode === 'title' || !w.held || w.phase !== 'swing' || w.difficulty === 'hard') return;
      const p = w.predictLanding && w.predictLanding(); if (!p) return;
      const c = w.held, a = w.alpha || 0, hx = lerp(c.prevX, c.x, a), hy = lerp(c.prevY, c.y, a) + c.h / 2;
      const easy = w.difficulty === 'easy';
      const col = !easy ? 'rgba(255,255,255,.55)' : p.perfect ? '#9dffb0' : p.ok ? '#ffffff' : '#ff8aa0';
      const ly = w.tower.topY;
      g.save();
      g.globalAlpha = 0.45 + 0.15 * Math.sin(this.time * 6);
      g.setLineDash([4, 7]); g.lineWidth = 2; g.strokeStyle = col;
      g.beginPath(); g.moveTo(hx, hy + 4); g.lineTo(p.x, ly - 8); g.stroke(); g.setLineDash([]);
      // landing shadow: a soft bar on top of the tower
      g.globalAlpha = easy ? 0.5 : 0.3; g.fillStyle = col;
      this._rr(g, p.x - c.w / 2, ly - 6, c.w, 6, 3); g.fill();
      g.restore();
    }

    drawCoins(g, w) {
      const a = w.alpha || 0, A = MS.Assets, list = w.coinList || [];
      for (const c of list) {
        if (c.state === 'collected') continue;   // drawn as a flyer to the HUD
        const al = c.state === 'gone' ? clamp(c.fade == null ? 0 : c.fade, 0, 1) : 1;
        if (al <= 0.01) continue;
        const x = lerp(c.prevX, c.x, a), y = lerp(c.prevY, c.y, a), s = c.r * 2.1;
        // soft golden glow so coins pop over any sky
        const hg = g.createRadialGradient(x, y, 0, x, y, s * 0.9);
        hg.addColorStop(0, 'rgba(255,220,90,.35)'); hg.addColorStop(1, 'rgba(255,220,90,0)');
        g.globalAlpha = al; g.fillStyle = hg; g.beginPath(); g.arc(x, y, s * 0.9, 0, TAU); g.fill();
        const f = Math.floor(c.spin || 0) % 4;
        if (A.hasCustom('coin')) {
          const sx = Math.max(0.15, Math.abs(Math.cos((c.spin || 0) / 4 * TAU)));
          g.save(); g.translate(x, y); g.scale(sx, 1);
          g.beginPath(); g.arc(0, 0, s * 0.5, 0, TAU); g.fillStyle = '#e0a400'; g.fill();
          g.save(); g.beginPath(); g.arc(0, 0, s * 0.42, 0, TAU); g.clip();
          const im = this.spr('custom:coin', s * 0.84, s * 0.84); if (im) g.drawImage(im, -s * 0.42, -s * 0.42, s * 0.84, s * 0.84);
          g.restore(); g.lineWidth = 2; g.strokeStyle = '#9a6400'; g.beginPath(); g.arc(0, 0, s * 0.5, 0, TAU); g.stroke();
          g.restore();
        } else {
          const im = this.spr('coin_' + (f === 3 ? 1 : f), s, s);
          if (im) {
            if (f === 3) { g.save(); g.translate(x, y); g.scale(-1, 1); g.drawImage(im, -s / 2, -s / 2, s, s); g.restore(); }
            else g.drawImage(im, x - s / 2, y - s / 2, s, s);
          }
        }
        g.globalAlpha = 1;
      }
    }

    drawFlag(g, w) {
      const f = w.flag; if (!f) return;
      const u = w.layout.unit, k = clamp(f.t / 0.5, 0, 1), e = 1 - Math.pow(1 - k, 3);
      const fw = 0.6 * u, fh = 1.2 * u * e, x = f.x + w.swayOffsetLerp(f.y, w.alpha || 0);
      if (fh < 2) return;
      const al = w.phase === 'travel' ? clamp(1 - w.phaseT / 0.8, 0, 1) : 1;
      const im = this.spr('flag', fw, 1.2 * u);
      g.save(); g.globalAlpha = al;
      // beacon glow
      const by = f.y - fh + fh * 10 / 128;
      const hg = g.createRadialGradient(x, by, 0, x, by, u * 0.6);
      hg.addColorStop(0, 'rgba(255,230,90,' + (0.45 + 0.2 * Math.sin(this.time * 8)) + ')'); hg.addColorStop(1, 'rgba(255,230,90,0)');
      g.fillStyle = hg; g.beginPath(); g.arc(x, by, u * 0.6, 0, TAU); g.fill();
      if (im) g.drawImage(im, x - fw * 12 / 64, f.y - fh * 124 / 128, fw, fh);
      g.restore();
    }

    drawRocket(g, w) {
      const r = w.rocket; if (!r) return;
      const u = w.layout.unit, a = w.alpha || 0, x = lerp(r.prevX, r.x, a), y = lerp(r.prevY, r.y, a);
      const rw = 0.9 * u, rh = 1.5 * u;
      const burning = r.state !== 'land';
      if (burning) {
        const fl = this.spr('flame', 0.45 * u, 0.6 * u), fk = 0.85 + 0.25 * Math.sin(this.time * 40);
        if (fl) g.drawImage(fl, x - 0.225 * u, y + rh * 72 / 160 - 2, 0.45 * u, 0.6 * u * fk);
      }
      const im = this.spr('rocket', rw, rh);
      if (im) g.drawImage(im, x - rw / 2, y - rh / 2, rw, rh);
    }

    drawSaucer(g, w, mode) {
      const s = w.saucer, L = w.layout, a = w.alpha || 0, A = MS.Assets, u = L.unit;
      if (w.phase === 'travel' && w.phaseT > 0.5) return;
      const x = lerp(s.prevX, s.x, a), y = lerp(s.prevY, s.y, a), sc = lerp(s.prevScale || s.scale, s.scale, a);
      const S = u * JUNO_K * sc;
      // beam + held crate
      if (w.held) {
        const c = w.held, hx = lerp(c.prevX, c.x, a), hy = lerp(c.prevY, c.y, a);
        const ex = x, ey = y + S * JUNO_EMIT, bh = hy - c.h / 2 - ey;
        const bim = this.spr('beam', 80, 120);
        if (bim && bh > 2) {
          g.save(); g.globalAlpha = 0.75 + 0.2 * Math.sin(this.time * 9);
          g.translate(ex, ey); g.rotate(Math.atan2(-(hx - ex), bh) * 0.8);
          g.drawImage(bim, -c.w * 0.55, 0, c.w * 1.1, bh + 4); g.restore();
        }
        this.drawCrate(g, c, hx, hy, lerp(c.prevRot || 0, c.rot || 0, a), 1);
      }
      g.save();
      g.translate(x, y);
      g.rotate((s.tilt || 0) + (s.anim === 'oops' ? Math.sin(this.time * 28) * 0.05 : 0));
      if (this.growPulse > 0) { const k = 1 + Math.sin(this.growPulse * Math.PI * 3) * 0.06 * this.growPulse; g.scale(k, k); }
      if (A.hasCustom('hero')) {
        // a procedural saucer with the player's picture in the dome
        const R = S * 0.42;
        g.beginPath(); g.ellipse(0, S * 0.12, R * 1.15, R * 0.42, 0, 0, TAU); g.fillStyle = '#eae6ff'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#5b5196'; g.stroke();
        for (let i = 0; i < 7; i++) {
          const ang = (i / 6) * Math.PI, lx = Math.cos(ang) * R * 0.95, on = ((this.time * 4 + i) | 0) % 3 === 0;
          g.beginPath(); g.arc(lx, S * 0.12 + Math.sin(ang) * R * 0.18, S * 0.03, 0, TAU); g.fillStyle = on ? '#ffd23f' : '#3fe0d0'; g.fill();
        }
        const [fw, fh] = A.fit('hero', R * 1.5, R * 1.5), bob = Math.sin(this.time * 5) * S * 0.015;
        const im = this.spr('custom:hero', fw, fh);
        if (im) g.drawImage(im, -fw / 2, -fh * 0.82 + bob, fw, fh);
        g.beginPath(); g.arc(0, -S * 0.08, R * 0.82, Math.PI, 0); g.fillStyle = 'rgba(207,238,255,.22)'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#8db6e6'; g.stroke();
        g.beginPath(); g.arc(0, S * 0.3, S * 0.05, 0, TAU); g.fillStyle = '#46e8d8'; g.fill();
      } else {
        const frame = w.phase === 'over' ? 'oops' : (s.anim || 'idle');
        const im = this.spr('juno_' + frame, S, S) || this.spr('juno_idle', S, S);
        if (im) g.drawImage(im, -S / 2, -S * JUNO_CY, S, S);
      }
      g.restore();
    }

    drawParticles(g, layer, camY) {
      const wx = this.weather; if (!wx) return;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const im = this.spr('p_' + p.sprite, p.size, p.size);
        if (!im) continue;
        const y = p.world ? p.y - camY : p.y;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.rot || p.flipX) {
          g.save(); g.translate(p.x, y); if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
          g.drawImage(im, -p.size / 2, -p.size / 2, p.size, p.size); g.restore();
        } else g.drawImage(im, p.x - p.size / 2, y - p.size / 2, p.size, p.size);
      }
      g.globalAlpha = 1;
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
        const x = clamp(t.x, 90, this.VW - 90);
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = '900 ' + Math.round(t.size * sc * this._hudK) + 'px ' + FONT;
        const maxW = this.VW - 40, tw = g.measureText(t.txt).width;
        if (tw > maxW) g.font = '900 ' + Math.floor(t.size * sc * this._hudK * maxW / tw) + 'px ' + FONT;
        g.lineWidth = Math.max(3, t.size * 0.22); g.strokeStyle = 'rgba(16,12,48,.9)'; g.strokeText(t.txt, x, t.y);
        g.fillStyle = t.col; g.fillText(t.txt, x, t.y);
      }
      g.globalAlpha = 1;
    }

    /* Collected coins fly (screen space) to the grow meter in the HUD. */
    drawFlyers(g, w) {
      if (!this._growAt) return;
      const s = w.layout.unit * 0.42;
      for (const f of this.flyers) {
        const k = f.t / f.life, e = k * k * (3 - 2 * k);
        const x = lerp(f.x, this._growAt.x, e), y = lerp(f.y, this._growAt.y, e) - Math.sin(k * Math.PI) * 40;
        const im = MS.Assets.hasCustom('coin') ? null : this.spr('coin_0', s, s);
        g.globalAlpha = 1 - k * 0.3;
        if (im) g.drawImage(im, x - s / 2 * (1 - k * 0.4), y - s / 2 * (1 - k * 0.4), s * (1 - k * 0.4), s * (1 - k * 0.4));
        else { g.beginPath(); g.arc(x, y, s * 0.4, 0, TAU); g.fillStyle = '#ffd23f'; g.fill(); }
      }
      g.globalAlpha = 1;
    }

    // ---------------- HUD ----------------
    _panel(g, x, y, w, h, r) {
      this._rr(g, x, y, w, h, r);
      g.fillStyle = 'rgba(16,14,52,.72)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(160,180,255,.45)'; g.stroke();
    }
    _text(g, txt, x, y, size, col, align, weight) {
      g.font = (weight || '900') + ' ' + Math.round(size) + 'px ' + FONT; g.textAlign = align || 'left'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, size * 0.18); g.strokeStyle = 'rgba(14,10,44,.95)'; g.strokeText(txt, x, y);
      g.fillStyle = col; g.fillText(txt, x, y);
    }
    drawHud(g, w, mode) {
      const L = w.layout, K = Math.min(this._hudK, 1.25), I = this.ins, VW = this.VW;
      const best = MS.Game ? MS.Game.best() : 0;
      const x0 = I.left + 12, top = I.top + 12, hb = this._hudBtn;
      // score + best + hearts (left)
      const pw = 190 * Math.min(K, 1.1);
      this._panel(g, x0, top, pw, 98, 18);
      this._text(g, String(w.score), x0 + 16, top + 30, 32 * K, '#fff', 'left');
      this._text(g, 'Best ' + Math.max(best, w.score), x0 + 16, top + 58, 13 * K, '#ffd98a', 'left', '800');
      if ((w.combo || 0) >= 2) this._text(g, '×' + Math.min(5, w.combo), x0 + pw - 16, top + 30, (20 + (this.comboShow > 0 ? 4 : 0)) * K, '#fff2a8', 'right');
      const hs = 22 * Math.min(K, 1.15);
      for (let i = 0; i < w.maxHearts; i++) {
        const on = i < w.hearts, pulse = (!on && i === w.hearts && this.heartPulse > 0) ? 1 + this.heartPulse * 0.5 : 1;
        const im = this.spr(on ? 'heart' : 'heart_empty', hs, hs), hx = x0 + 14 + i * (hs + 4), hy = top + 72;
        if (im) g.drawImage(im, hx + hs / 2 - hs * pulse / 2, hy + hs / 2 - hs * pulse / 2 - 6, hs * pulse, hs * pulse);
      }
      // planet progress + grow meter (centre top in landscape, second row in portrait)
      const right = hb ? hb.l - 10 : VW - 110;
      let cx, cy, cw;
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 200, 320); cx = Math.max(x0 + pw + 12 + cw / 2, VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = top; }
      else { cw = Math.min(VW - I.left - I.right - 24, 420); cx = VW / 2; cy = top + 108; }
      this._panel(g, cx - cw / 2, cy, cw, 78, 18);
      const info = ZONE_INFO[w.zone % 4];
      this._text(g, info.name + (w.loop ? ' ★' + (w.loop + 1) : ''), cx - cw / 2 + 14, cy + 18, 13 * K, info.color, 'left', '800');
      this._text(g, Math.min(w.placed, w.goal) + ' / ' + w.goal, cx + cw / 2 - 14, cy + 18, 15 * K, '#fff', 'right');
      // progress bar of little crates
      const bx = cx - cw / 2 + 14, bw = cw - 28, by = cy + 34, bhh = 10, k = clamp(w.placed / Math.max(1, w.goal), 0, 1);
      this._rr(g, bx, by, bw, bhh, 5); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill();
      if (k > 0) { this._rr(g, bx, by, Math.max(10, bw * k), bhh, 5); const gr = g.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#3fd6a0'); gr.addColorStop(1, '#ffd23f'); g.fillStyle = gr; g.fill(); }
      // grow meter: 5 coin pips + grow stars
      const gy = cy + 62, cs = 14;
      this._text(g, 'GROW', bx, gy, 11 * K, '#9ff5ea', 'left', '800');
      const gx0 = bx + 48 * Math.min(K, 1.1);
      for (let i = 0; i < 5; i++) {
        const on = w.grow >= 5 || i < w.growCoins, im = this.spr('coin_0', cs, cs);
        g.globalAlpha = on ? 1 : 0.28;
        if (im) g.drawImage(im, gx0 + i * (cs + 4), gy - cs / 2, cs, cs);
      }
      g.globalAlpha = 1;
      this._growAt = { x: gx0 + Math.min(4, w.growCoins) * (cs + 4) + cs / 2, y: gy };
      for (let i = 0; i < 5; i++) {
        const on = i < w.grow, sx = bx + bw - 8 - (4 - i) * 15;
        this._star(g, sx, gy, on ? 6.5 * (1 + (i === w.grow - 1 ? this.growPulse * 0.6 : 0)) : 5, on ? '#9ff5ea' : 'rgba(159,245,234,.25)');
      }
      if (this.hintOn && mode === 'playing' && !this.banner) this._text(g, ZONE_INFO[0].hint, L.cx, w.tower.topY - this.camY() - L.unit * 1.25, 18 * K, '#fff', 'center', '800');
    }
    _star(g, x, y, r, col) {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = col; g.fill();
    }

    drawBanner(g) {
      const b = this.banner, info = ZONE_INFO[b.s % 4], t = b.t, L = this.world.layout;
      const a = t < 0.3 ? t / 0.3 : t > 1.8 ? Math.max(0, (2.2 - t) / 0.4) : 1;
      const cx = L.cx, y = L.saucerScreenY + L.unit * 1.75 - (1 - a) * 16;
      const w = Math.min(this.VW - 40, 420), h = 86;
      g.globalAlpha = a * 0.85;
      this._panel(g, cx - w / 2, y - h / 2, w, h, 22);
      g.globalAlpha = a;
      this._text(g, info.name + (b.loop ? '  ★' + (b.loop + 1) : ''), cx, y - 16, 28, info.color, 'center');
      this._text(g, 'Stack ' + b.goal + ' crates!', cx, y + 20, 18, '#fff', 'center', '800');
      g.globalAlpha = 1;
    }

    drawDebug(g, w) {
      const L = w.layout;
      g.strokeStyle = 'rgba(0,255,120,.7)'; g.lineWidth = 1;
      for (const c of w.crates) { if (c.state === 'gone') continue; g.strokeRect(c.x - c.w / 2, c.y - c.h / 2, c.w, c.h); }
      g.beginPath(); g.moveTo(0, L.groundY); g.lineTo(this.VW, L.groundY); g.stroke();
      g.strokeStyle = 'rgba(255,0,180,.6)'; const cy = w.cam.y;
      g.beginPath(); g.moveTo(0, cy + L.topLine); g.lineTo(this.VW, cy + L.topLine); g.stroke();
      for (const c of (w.coinList || [])) { g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.stroke(); }
      g.fillStyle = '#0f8'; g.font = '11px monospace'; g.textAlign = 'left';
      g.fillText(w.phase + ' sway ' + w.tower.sway.toFixed(1) + ' crates ' + w.crates.length + ' cam ' + cy.toFixed(0), 10, cy + this.VH - 10);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  MS.Renderer = Renderer;
})(window.MS = window.MS || {});
