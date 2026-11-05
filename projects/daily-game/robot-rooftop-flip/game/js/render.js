/* RF.Renderer — the city scene, rooftops and sky-rail, Bolt, fireflies, gates, obstacles, the rescue drone,
 * particles, juice and the HUD (DESIGN §2–§4).
 * Layers: sky / far / mid are pre-rendered as device-pixel tiles at screen height and blitted pixel-exact with
 * parallax (0.02 / 0.12 / 0.35 of the scroll). Roof and rail spans are tiled from cached sprites in world space
 * (screenX = worldX − cam.x). Time-of-day changes crossfade. Everything that moves is lerped with world.alpha. */
(function (RF) {
  'use strict';
  const ZONE_INFO = [
    { name: 'Dawn', color: '#ffc9b8', dark: '#3a2a4a', wall: '#b56a5a', bottom: '#6e3a3a', vig: 'rgba(40,20,40,.22)', hint: 'Tap to flip up to the rail!' },
    { name: 'Noon', color: '#bfe6ff', dark: '#1d3d66', wall: '#c9a27a', bottom: '#7e5d42', vig: 'rgba(10,30,60,.18)', hint: 'Catch fireflies of your colour!' },
    { name: 'Sunset', color: '#ffc28a', dark: '#2e1d3e', wall: '#7d4e5e', bottom: '#43283a', vig: 'rgba(40,10,30,.28)', hint: 'Run through an arch to change colour!' },
    { name: 'Night', color: '#b9c4ff', dark: '#0a1130', wall: '#3b4466', bottom: '#20263f', vig: 'rgba(4,6,24,.38)', hint: 'Flip over the gaps!' }
  ];
  const COLORS = ['pink', 'yellow', 'cyan'];
  const COL = ['#ff5fa2', '#ffd23f', '#39e1ff'];
  const COL_LINE = ['#a8235f', '#a87a00', '#0f7f9e'];
  const COL_NAME = ['Pink', 'Yellow', 'Blue'];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const shade = (hex, k) => {   // k < 0 darkens, > 0 lightens
    const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  };
  // Bolt sprite (128×128): body centre (64,74), feet line y 120, chest screen (60,82) r 10. Drawn 0.95·unit.
  const BOLT_K = 0.95, BOLT_FEET = 120 / 128, BOLT_STAND = 0.42;

  /* Colour symbols (heart / star / drop), centred at (x, y), radius r. Shape + colour for colour-blind play. */
  function symbolPath(g, c, x, y, r) {
    g.beginPath();
    if (c === 0) {        // heart
      g.moveTo(x, y + r * 0.9);
      g.bezierCurveTo(x - r * 1.25, y + r * 0.05, x - r * 0.95, y - r * 1.05, x, y - r * 0.4);
      g.bezierCurveTo(x + r * 0.95, y - r * 1.05, x + r * 1.25, y + r * 0.05, x, y + r * 0.9);
    } else if (c === 1) { // star
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r * 1.05; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    } else {              // drop
      g.moveTo(x, y - r * 1.05);
      g.bezierCurveTo(x + r * 0.35, y - r * 0.45, x + r * 0.85, y + r * 0.05, x + r * 0.85, y + r * 0.35);
      g.arc(x, y + r * 0.35, r * 0.85, 0, Math.PI, false);
      g.bezierCurveTo(x - r * 0.85, y + r * 0.05, x - r * 0.35, y - r * 0.45, x, y - r * 1.05);
    }
    g.closePath();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fff6d0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.hintOn = true; this.multShow = 0; this.heartPulse = 0; this.colorPulse = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._glow = {};
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
      const dpr = window.devicePixelRatio || 1, touch = !!(RF.Game && RF.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._glow = {};
      this._hudK = clamp(0.95 / v.s, 1, 1.6);
      this._view = v;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      if (this.world && this.world.setLayout && (this.world.layout.width !== v.VW || this.world.layout.height !== v.VH)) this.world.setLayout(v.VW, v.VH);
      this._measureHud();
      RF.Assets.setScale(this.px);
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width, b: (r.bottom - c.top) * this.VH / c.height } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.multShow = 0; this.heartPulse = 0; this.colorPulse = 0;
      this.hintOn = !!world && (world.level || 0) === 0; this._hintT = 0;
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
    showBanner(z) { this.banner = { s: z, t: 0, loop: this.world ? this.world.loop || 0 : 0 }; }

    // ---------------- pre-rendered scenes ----------------
    _slot(b) { return RF.Assets.SLOTS[2 + b].id; }
    _custom(b) { return RF.Assets.hasCustom(this._slot(b)); }
    _unit() { return this.world ? this.world.layout.unit : Math.min(this.VW / 9.6, this.VH / 5.4); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (RF.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => {
        this._warmQ = this._warmQ.filter(x => x !== b); this.background(b);
        const u = this._unit(), n = RF.Assets.SEASONS[b];
        RF.Assets.warm([[n + '_building', 2.4 * u, 4 * u], [n + '_rail', 2.4 * u, 1.6 * u], [n + '_rail_end', 0.4 * u, 1.6 * u]]);
      }, { timeout: 400 });
    }
    _canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* {sky, far, mid, custom, vig}: one tile each, scaled to the screen height, in device px. */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = RF.Assets, n = A.SEASONS[b], px = this.px, VW = this.VW, VH = this.VH, info = ZONE_INFO[b];
      bg = { sky: null, far: null, mid: null, custom: false };
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
        bg.sky = tile('sky'); bg.far = tile('far'); bg.mid = tile('mid');
        if (!bg.sky) { bg.sky = this._canvas(tw, th); const sg = bg.sky.getContext('2d'); sg.fillStyle = info.dark; sg.fillRect(0, 0, tw, th); }
      }
      const vc = this._canvas(VW * px, VH * px), vg0 = vc.getContext('2d');
      vg0.setTransform(px, 0, 0, px, 0, 0);
      const vg = vg0.createRadialGradient(VW / 2, VH * 0.5, Math.min(VW, VH) * 0.4, VW / 2, VH * 0.5, Math.max(VW, VH) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, info.vig);
      vg0.fillStyle = vg; vg0.fillRect(0, 0, VW, VH);
      bg.vig = vc;
      this._bg.set(key, bg);
      if (this._bg.size > 4) { const keep = [this.vis.cur, this.vis.prev, (this.vis.cur + 1) % 4].map(z => this._bgKey(z)); for (const k of this._bg.keys()) if (!keep.includes(k)) this._bg.delete(k); }
      return bg;
    }
    _blitTile(g, tile, off, alpha) {
      if (!tile) return;
      const tw = tile.width, cw = this.canvas.width;
      let x = -Math.round(((off * this.px) % tw + tw) % tw);
      g.globalAlpha = alpha;
      for (; x < cw; x += tw) g.drawImage(tile, x, 0);
    }
    drawSceneBack(g, b, alpha, camX) {
      const bg = this.background(b);
      if (bg.custom) { g.globalAlpha = alpha; g.drawImage(bg.sky, 0, 0); g.globalAlpha = 1; return; }
      this._blitTile(g, bg.sky, camX * 0.02 + this.time * 2, alpha);
      this._blitTile(g, bg.far, camX * 0.12, alpha);
      this._blitTile(g, bg.mid, camX * 0.35, alpha);
      g.globalAlpha = 1;
    }

    // ---------------- events → juice ----------------
    _sx(x) { return x - this.camX(); }
    onEvents(evts) {
      const w = this.world, L = w && w.layout, wx = this.weather, u = L ? L.unit / 100 : 1;
      const h = w && w.hero;
      for (const e of evts) {
        switch (e.type) {
          case 'flip': this.hintOn = false; break;
          case 'land': {
            const v = clamp((e.speed || 0) / 960, 0, 1);
            if (wx && v > 0.25) {
              const fy = e.side === 'ceil' ? L.ceilY : L.floorY, up = e.side === 'ceil' ? -1 : 1;
              wx.burst('puff', L.heroX - 18 * u, fy, 2 + Math.round(v * 2), { speed: 60 * u, life: 0.45, size: 13 * u, gravity: -12 * up, spread: 1.0, angle: Math.PI, layer: 'front', scroll: 1 });
              wx.burst('spark', L.heroX + 10 * u, fy, 3, { speed: 120 * u, life: 0.3, size: 8 * u, gravity: 300 * up, spread: 1.4, angle: up > 0 ? -Math.PI / 2 : Math.PI / 2, layer: 'front', scroll: 1 });
            }
            this.shake = Math.max(this.shake, 0.8 + v * 1.4);
            break;
          }
          case 'catch': {
            const x = this._sx(e.x), c = e.ff ? e.ff.color : h.color;
            if (wx) wx.burst('bit_' + COLORS[c], x, e.y, 7, { speed: 150 * u, life: 0.55, size: 12 * u, gravity: 80, layer: 'front', scroll: 0.6 });
            this.ring(x, e.y, COL[c], 0.35, 26 * u, 3);
            this.pop('+' + e.points, x + 6 * u, e.y - 26 * u, COL[c], 17);
            break;
          }
          case 'wrong': {
            const x = this._sx(e.ff.x);
            this.pop('✕', x, e.ff.y - 20 * u, '#ffffff', 18);
            this._wrongN = (this._wrongN || 0) + 1;
            if (this._wrongN <= 3 || this._wrongN % 6 === 0) this.say('Not my colour!', this._sayX(), this._sayY(), '#ffffff', 20, 'wrong');
            break;
          }
          case 'combo': this.multShow = 1.2; this.say('×' + e.mult + ' Glow streak!', this._sayX(), this._sayY(), '#fff2a8', 24, 'combo'); break;
          case 'comboBreak': this.multShow = 0.6; break;
          case 'gate': {
            this.colorPulse = 1; this.flash = 0.35; this.flashCol = COL[e.color];
            this.say(COL_NAME[e.color] + '!', this._sayX(), this._sayY(), COL[e.color], 28, 'gate');
            if (wx) wx.burst('bit_' + COLORS[e.color], L.heroX, h ? h.y : L.midY, 12, { speed: 200 * u, life: 0.7, size: 13 * u, gravity: 0, layer: 'front', scroll: 0.3 });
            break;
          }
          case 'bump': {
            this.shake = Math.max(this.shake, 6);
            this.say('Boing!', this._sayX(), this._sayY(), '#ffd0a0', 26, 'ouch');
            if (wx && e.ob) wx.burst('star', this._sx(e.ob.x), h.y, 6, { speed: 160 * u, life: 0.6, size: 13 * u, gravity: 120, layer: 'front', scroll: 1 });
            break;
          }
          case 'fall': this.say('Whee-e-e!', this._sayX(), this._sayY(), '#ffd0e8', 26, 'ouch'); break;
          case 'rescue': if (wx && h) wx.burst('puff', L.heroX, h.y, 6, { speed: 90 * u, life: 0.5, size: 16 * u, gravity: 0, layer: 'front', scroll: 1 }); break;
          case 'heartLost': this.heartPulse = 1; break;
          case 'heartGain': this.heartPulse = 0.8; break;
          case 'finish': {
            this.flash = 0.5; this.flashCol = '#fff2c4';
            this.texts = this.texts.filter(t => !t.big);
            if (wx) wx.burst('star', L.heroX + L.unit, L.midY, 16, { speed: 260 * u, life: 1.0, size: 16 * u, gravity: 160, layer: 'front', scroll: 0.5 });
            break;
          }
          case 'levelUp': {
            this.showBanner(e.zone);
            if (e.bonus) this.pop('+' + e.bonus, L.heroX + L.unit * 1.2, L.midY - L.unit * 0.3, '#ffd23f', 26);
            break;
          }
          case 'gameOver': this.shake = 4; this.say('Out of batteries!', this.VW / 2, this._sayY(), '#ffd0e8', 30, 'goal'); break;
        }
      }
    }
    /* Big callouts float in the middle of the corridor ahead of Bolt, never on top of him. */
    _sayX() { const L = this.world.layout; return Math.min(this.VW - 120, L.heroX + Math.max(2.6 * L.unit, (this.VW - L.heroX) * 0.42)); }
    _sayY() { return this.world.layout.midY; }
    _quiet() { return RF.Game && RF.Game.mode === 'title'; }   // the title demo stays calm behind the menu
    ring(x, y, col, life, r, wdt) {
      if (this._quiet()) return; this.fx.push({ kind: 'ring', x, y, col, t: 0, life, r, w: wdt || 3 }); if (this.fx.length > 40) this.fx.shift(); }
    pop(txt, x, y, col, size) {
      if (this._quiet()) return;
      for (const t of this.texts) if (!t.big && t.t < 0.35 && Math.abs(t.x - x) < 60 && Math.abs(t.y - y) < size) y = t.y - size * 1.1;
      this.texts.push({ txt, x, y, col, size, t: 0, life: 0.8, vy: -60, vx: -0.25 * (this.world ? this.world.speed : 0) }); if (this.texts.length > 24) this.texts.shift(); }
    say(txt, x, y, col, size, key) {
      if (this._quiet()) return;
      if (key) this.texts = this.texts.filter(t => t.key !== key);
      for (const t of this.texts) if (t.big && t.t < 1.0 && Math.abs(t.y - y) < size * 1.2) t.y -= size * 1.25;
      this.texts.push({ txt, x, y, col, size, t: 0, life: 1.2, vy: -16, vx: 0, big: true, key }); if (this.texts.length > 24) this.texts.shift();
    }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.6);
      this.shake = Math.max(0, this.shake - dt * 18);
      this.flash = Math.max(0, this.flash - dt * 1.6);
      this.multShow = Math.max(0, this.multShow - dt);
      this.heartPulse = Math.max(0, this.heartPulse - dt * 1.5);
      this.colorPulse = Math.max(0, this.colorPulse - dt * 1.4);
      if (this.hintOn) { this._hintT = (this._hintT || 0) + dt; if (this._hintT > 12) this.hintOn = false; }
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.4) this.banner = null; }
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter(f => f.t < f.life);
      for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; t.x += t.vx * dt; }
      this.texts = this.texts.filter(t => t.t < t.life);
    }

    // ---------------- drawing ----------------
    camX() { const w = this.world; return w ? lerp(w.cam.prevX, w.cam.x, w.alpha || 0) : this.time * 120; }
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px, camX = this.camX();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      const v = this.vis;
      if (v.t < 1) { this.drawSceneBack(g, v.prev, 1, camX); this.drawSceneBack(g, v.cur, v.t, camX); }
      else this.drawSceneBack(g, v.cur, 1, camX);
      g.setTransform(px, 0, 0, px, 0, 0);
      this.drawParticles(g, 'back');
      if (!w) return;
      const sh = this.shake > 0 ? this.shake : 0;
      const sx = sh ? Math.sin(this.time * 71) * sh : 0, sy = sh ? Math.cos(this.time * 53) * sh * 0.6 : 0;
      // world space: x shifted by the scroll
      g.setTransform(px, 0, 0, px, (sx - camX) * px, sy * px);
      if (v.t < 1) { this.drawTrack(g, w, v.prev, 1, camX); this.drawTrack(g, w, v.cur, v.t, camX); }
      else this.drawTrack(g, w, v.cur, 1, camX);
      this.drawFinish(g, w, camX);
      this.drawGates(g, w, camX);
      this.drawObstacles(g, w, camX);
      this.drawFireflies(g, w, camX);
      this.drawDrone(g, w, camX, true);
      this.drawHero(g, w, mode);
      this.drawDrone(g, w, camX, false);
      g.setTransform(px, 0, 0, px, sx * px, sy * px);
      this.drawParticles(g, 'front');
      this.drawFx(g);
      if (this.debug) { g.setTransform(px, 0, 0, px, -camX * px, 0); this.drawDebug(g, w, camX); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      { const bg = this.background(v.cur); if (bg.vig) g.drawImage(bg.vig, 0, 0); }
      g.setTransform(px, 0, 0, px, 0, 0);
      const tint = this.weather && this.weather.ambient && this.weather.ambient.tint;
      if (tint) { g.fillStyle = tint; g.fillRect(0, 0, this.VW, this.VH); }
      if (mode !== 'title') this.drawHud(g, w, mode);
      else {
        const dg = g.createRadialGradient(this.VW / 2, this.VH / 2, 0, this.VW / 2, this.VH / 2, Math.max(this.VW, this.VH) * 0.6);
        dg.addColorStop(0, 'rgba(10,12,40,.55)'); dg.addColorStop(1, 'rgba(10,12,40,.18)');
        g.fillStyle = dg; g.fillRect(0, 0, this.VW, this.VH);
      }
      if (this.banner && mode !== 'title') this.drawBanner(g);
      if (this.flash > 0) { g.globalAlpha = Math.min(0.35, this.flash * 0.6); g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.globalAlpha = 1; }
    }

    spr(key, w, h) { return RF.Assets.sprite(key, w, h); }

    /* Rooftops (tiled building.svg, roof line y16 at floorY) and the sky-rail (rail.svg, underside y144 at ceilY). */
    drawTrack(g, w, b, alpha, camX) {
      const L = w.layout, u = L.unit, n = RF.Assets.SEASONS[b], info = ZONE_INFO[b];
      const x0v = camX - 2 * u, x1v = camX + this.VW + 2 * u;
      g.globalAlpha = alpha;
      // ---- rooftops
      const bw = 2.4 * u, bh = 4 * u, top = L.floorY - 0.16 * u, bot = top + bh;
      const bim = this.spr(n + '_building', bw, bh), wallC = shade(info.wall, -0.32);
      for (const r of w.roofs) {
        if (r.x1 < x0v || r.x0 > x1v) continue;
        const a = Math.max(r.x0, x0v - bw), e = Math.min(r.x1, x1v);
        let k = Math.floor((a - r.x0) / bw);
        for (let x = r.x0 + k * bw; x < e; x += bw) {
          const cw = Math.min(bw, r.x1 - x);
          if (cw <= 0.5) break;
          if (bim) g.drawImage(bim, 0, 0, bim.width * cw / bw, bim.height, x, top, cw, bh);
          else { g.fillStyle = info.wall; g.fillRect(x, top, cw, bh); }
        }
        if (bot < this.VH) { g.fillStyle = info.bottom; g.fillRect(r.x0, bot - 1, r.x1 - r.x0, this.VH - bot + 1); }
        // side walls at the gaps (a darker strip, so a gap reads as a gap)
        g.fillStyle = wallC;
        g.fillRect(r.x0, top + 0.16 * u, 0.1 * u, this.VH - top);
        g.fillRect(r.x1 - 0.1 * u, top + 0.16 * u, 0.1 * u, this.VH - top);
      }
      // ---- sky-rail
      const rw = 2.4 * u, rh = 1.6 * u, rtop = L.ceilY - 1.44 * u;
      const rim = this.spr(n + '_rail', rw, rh), cap = this.spr(n + '_rail_end', 0.4 * u, rh);
      for (const r of w.rails) {
        if (r.x1 < x0v || r.x0 > x1v) continue;
        const a = Math.max(r.x0, x0v - rw), e = Math.min(r.x1, x1v);
        let k = Math.floor((a - r.x0) / rw);
        for (let x = r.x0 + k * rw; x < e; x += rw) {
          const cw = Math.min(rw, r.x1 - x);
          if (cw <= 0.5) break;
          if (rim) g.drawImage(rim, 0, 0, rim.width * cw / rw, rim.height, x, rtop, cw, rh);
          else { g.fillStyle = '#7a8296'; g.fillRect(x, L.ceilY - 0.4 * u, cw, 0.4 * u); }
        }
        if (cap) {
          if (r.x1 < x1v) g.drawImage(cap, r.x1 - 0.4 * u, rtop, 0.4 * u, rh);
          if (r.x0 > x0v) { g.save(); g.translate(r.x0 + 0.4 * u, rtop); g.scale(-1, 1); g.drawImage(cap, 0, 0, 0.4 * u, rh); g.restore(); }
        }
      }
      g.globalAlpha = 1;
    }

    drawFinish(g, w, camX) {
      const L = w.layout, u = L.unit, fw = 1.4 * u, im = this.spr('finish', fw, L.corridorH);
      const xs = new Set();
      for (const p of (w.plans || [])) if (p && p.finishX != null) xs.add(p.finishX);
      if (w.finish) xs.add(w.finish.x);
      for (const x of xs) {
        if (x < camX - fw || x > camX + this.VW + fw) continue;
        if (im) g.drawImage(im, x - fw / 2, L.ceilY, fw, L.corridorH);
      }
    }

    drawGates(g, w, camX) {
      const L = w.layout, u = L.unit, gw = 0.95 * u;
      for (const gt of w.gates) {
        if (gt.x < camX - gw || gt.x > camX + this.VW + gw) continue;
        const im = this.spr('gate_' + COLORS[gt.color], gw, L.corridorH);
        g.globalAlpha = gt.passed ? 0.65 : 1;
        // soft additive glow behind the curtain
        g.globalCompositeOperation = 'lighter';
        const gl = this._glowSpr(gt.color, 1.3 * u);
        const pulse = 0.55 + 0.2 * Math.sin(this.time * 4 + gt.x * 0.01);
        g.globalAlpha *= pulse;
        g.drawImage(gl, gt.x - 1.3 * u, L.midY - 1.3 * u, 2.6 * u, 2.6 * u);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = gt.passed ? 0.65 : 1;
        if (im) g.drawImage(im, gt.x - gw / 2, L.ceilY, gw, L.corridorH);
        else { g.fillStyle = COL[gt.color]; g.fillRect(gt.x - gw / 4, L.ceilY, gw / 2, L.corridorH); }
      }
      g.globalAlpha = 1;
    }

    drawObstacles(g, w, camX) {
      const L = w.layout;
      for (const o of w.obstacles) {
        if (o.x + o.w < camX || o.x - o.w > camX + this.VW) continue;
        const key = o.kind + '_' + (o.variant || 0), im = this.spr(key, o.w, o.h);
        const ht = o.hit ? (o.hitT || 0) : 99, sq = ht < 0.5 ? Math.sin(ht / 0.5 * Math.PI) * 0.18 * (1 - ht / 0.5) : 0;
        g.save();
        if (o.kind === 'vent') {
          g.translate(o.x, L.floorY);
          g.scale(1 + sq, 1 - sq);
          g.globalAlpha = o.hit ? 0.75 : 1;
          if (im) g.drawImage(im, -o.w / 2, -o.h, o.w, o.h); else { g.fillStyle = '#8a9688'; g.fillRect(-o.w / 2, -o.h, o.w, o.h); }
        } else {
          const sw = Math.sin(this.time * 2.2 + o.x * 0.013) * 0.05 + (ht < 1.2 ? Math.sin(ht * 14) * 0.25 * (1 - ht / 1.2) : 0);
          g.translate(o.x, L.ceilY);
          g.rotate(sw);
          g.globalAlpha = o.hit ? 0.75 : 1;
          if (im) g.drawImage(im, -o.w / 2, 0, o.w, o.h); else { g.fillStyle = '#b0845a'; g.fillRect(-o.w / 2, 0, o.w, o.h); }
        }
        g.restore();
      }
    }

    /* A soft radial glow sprite per colour (additive). */
    _glowSpr(c, r) {
      const key = c + '|' + Math.round(r);
      if (this._glow[key]) return this._glow[key];
      const s = Math.ceil(r * 2 * this.px), cv = this._canvas(s, s), gg = cv.getContext('2d');
      const gr = gg.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      gr.addColorStop(0, COL[c] + 'cc'); gr.addColorStop(0.35, COL[c] + '55'); gr.addColorStop(1, COL[c] + '00');
      gg.fillStyle = gr; gg.fillRect(0, 0, s, s);
      this._glow[key] = cv; return cv;
    }

    drawFireflies(g, w, camX) {
      const L = w.layout, u = L.unit, a = w.alpha || 0, S = 0.44 * u, A = RF.Assets, custom = A.hasCustom('firefly');
      const hero = w.hero, night = (w.zone % 4) === 3;
      for (const f of w.fireflies) {
        if (f.state === 'gone') continue;
        const x = lerp(f.prevX, f.x, a), y = lerp(f.prevY, f.y, a);
        if (x < camX - S || x > camX + this.VW + S) continue;
        let k = 1, al = 1;
        if (f.state === 'caught') { const t = clamp(f.t / 0.22, 0, 1); k = 1 - t * 0.8; al = 1 - t * 0.6; }
        else if (f.state === 'flee') { al = 1 - clamp(f.t / 1.1, 0, 1); }
        const match = f.color === hero.color;
        const tw = 0.75 + 0.25 * Math.sin(this.time * 6 + f.id * 1.7);
        // glow (brighter at night, and for Bolt's own colour)
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = al * tw * (night ? 0.95 : 0.7) * (match ? 1 : 0.6);
        const gr = (match ? 0.62 : 0.48) * u * k;
        g.drawImage(this._glowSpr(f.color, 0.62 * u), x - gr, y - gr, gr * 2, gr * 2);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = al;
        const s = S * k * (match ? 1.06 : 0.92);
        if (custom) {
          const im = this.spr('custom:firefly', s, s);
          g.beginPath(); g.arc(x, y, s * 0.55, 0, TAU); g.fillStyle = COL[f.color]; g.fill();
          if (im) g.drawImage(im, x - s * 0.45, y - s * 0.45, s * 0.9, s * 0.9);
          symbolPath(g, f.color, x + s * 0.38, y + s * 0.34, s * 0.2);
          g.fillStyle = COL[f.color]; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
        } else {
          const fr = Math.floor(this.time * 14 + f.id) % 2;
          const im = this.spr('ff_' + COLORS[f.color] + '_' + fr, s, s);
          if (im) g.drawImage(im, x - s / 2, y - s / 2, s, s);
          else { symbolPath(g, f.color, x, y, s * 0.3); g.fillStyle = COL[f.color]; g.fill(); }
        }
      }
      g.globalAlpha = 1;
    }

    drawDrone(g, w, camX, behind) {
      const d = w.drone; if (!d) return;
      // the drone is drawn in front of Bolt, except its rope when it carries him from below (flipY)
      if (behind) return;
      const L = w.layout, u = L.unit, a = w.alpha || 0, dw = 1.0 * u, dh = 0.75 * u;
      const x = lerp(d.prevX, d.x, a), y = lerp(d.prevY, d.y, a);
      const im = this.spr('drone', dw, dh);
      g.save();
      g.translate(x, y + Math.sin(this.time * 9) * 1.5);
      if (d.flipY) g.scale(1, -1);
      g.rotate(Math.sin(this.time * 3) * 0.05);
      if (im) g.drawImage(im, -dw / 2, -dh * 36 / 96, dw, dh);
      else { g.fillStyle = '#f4f1ea'; g.beginPath(); g.arc(0, 0, dw * 0.25, 0, TAU); g.fill(); }
      // spinning propeller shimmer
      g.globalAlpha = 0.35;
      g.fillStyle = '#ffffff';
      const pw = dw * 0.28 * (0.6 + 0.4 * Math.abs(Math.sin(this.time * 40)));
      g.beginPath(); g.ellipse(-dw * 0.33, -dh * 0.36, pw, dh * 0.05, 0, 0, TAU); g.fill();
      g.beginPath(); g.ellipse(dw * 0.33, -dh * 0.36, pw, dh * 0.05, 0, 0, TAU); g.fill();
      g.restore();
      g.globalAlpha = 1;
    }

    drawHero(g, w, mode) {
      const h = w.hero, L = w.layout, u = L.unit, a = w.alpha || 0;
      const x = lerp(h.prevX, h.x, a), y = lerp(h.prevY, h.y, a), ft = lerp(h.prevFlipT, h.flipT, a);
      const S = u * BOLT_K;
      // blink while safe after a bump
      if (h.invuln > 0 && w.phase !== 'over' && Math.floor(this.time * 10) % 2 === 0) g.globalAlpha = 0.45;
      // turn-over: vertical scale through ±0.18 plus a tilt (nose leads in the direction of travel)
      let sy = Math.cos(Math.PI * ft);
      if (Math.abs(sy) < 0.18) sy = sy < 0 ? -0.18 : 0.18;
      const going = h.grav < 0 ? -1 : 1;
      const tilt = -Math.sin(Math.PI * ft) * 0.55 * going + (h.knock || 0) * Math.sin(this.time * 30) * 0.12;
      const sq = h.squash || 0;
      g.save();
      g.translate(x, y);
      g.rotate(tilt);
      g.scale(1 + sq * 0.16, sy * (1 - sq * 0.16));
      // shadow-ish contact glow on the surface (only when standing)
      const custom = RF.Assets.hasCustom('hero');
      const air = !h.grounded || h.state === 'rescue';
      let frame;
      if (w.phase === 'over' || (h.bumpT != null && h.bumpT < 0.6)) frame = 'bump';
      else if (air) frame = 'air';
      else if (h.happyT != null && h.happyT < 0.3) frame = 'happy';
      else frame = 'run_' + (Math.floor((h.runPhase || 0) * 4) % 4);
      const topY = BOLT_STAND * u - S * BOLT_FEET;   // sprite top relative to the hit centre (feet on the surface)
      if (custom) {
        const R = S * 0.42, cy = -0.02 * u, bob = air ? 0 : Math.abs(Math.sin((h.runPhase || 0) * TAU)) * 2.5;
        // little magnet legs
        g.fillStyle = '#2a3350';
        const lp = (h.runPhase || 0) * TAU;
        for (let i = 0; i < 2; i++) { const lx = (i ? 0.18 : -0.18) * u + Math.sin(lp + i * Math.PI) * (air ? 0 : 0.06 * u); g.fillRect(lx - 0.05 * u, cy + R * 0.7, 0.1 * u, BOLT_STAND * u - R * 0.7); }
        g.fillStyle = '#ff8a3d';
        for (let i = 0; i < 2; i++) { const lx = (i ? 0.18 : -0.18) * u + Math.sin(lp + i * Math.PI) * (air ? 0 : 0.06 * u); g.fillRect(lx - 0.08 * u, BOLT_STAND * u - 0.06 * u, 0.16 * u, 0.06 * u); }
        g.beginPath(); g.arc(0, cy - bob, R + 4, 0, TAU); g.fillStyle = '#eef2f8'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#2a3350'; g.stroke();
        const im = this.spr('custom:hero', R * 2, R * 2);
        if (im) { g.save(); g.beginPath(); g.arc(0, cy - bob, R, 0, TAU); g.clip(); g.drawImage(im, -R, cy - bob - R, R * 2, R * 2); g.restore(); }
        // colour badge
        g.beginPath(); g.arc(R * 0.72, cy - bob + R * 0.72, R * 0.36, 0, TAU); g.fillStyle = '#1d2440'; g.fill();
        symbolPath(g, h.color, R * 0.72, cy - bob + R * 0.72, R * 0.22); g.fillStyle = COL[h.color]; g.fill();
      } else {
        const im = this.spr('bolt_' + frame, S, S) || this.spr('bolt_run_0', S, S);
        if (im) g.drawImage(im, -S / 2, topY, S, S);
        else { g.fillStyle = '#eef2f8'; g.fillRect(-S * 0.3, -S * 0.3, S * 0.6, S * 0.6); }
        // chest light: Bolt's colour symbol on his chest screen (60,82)
        const cx = (60 - 64) / 128 * S, cy = topY + 82 / 128 * S, r = 10 / 128 * S;
        const pulse = 1 + this.colorPulse * 0.5;
        g.globalCompositeOperation = 'lighter';
        const gl = this._glowSpr(h.color, 0.4 * u), gr = r * 2.6 * pulse;
        g.globalAlpha *= 0.85;
        g.drawImage(gl, cx - gr, cy - gr, gr * 2, gr * 2);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = (h.invuln > 0 && w.phase !== 'over' && Math.floor(this.time * 10) % 2 === 0) ? 0.45 : 1;
        symbolPath(g, h.color, cx, cy + r * 0.05, r * 0.72 * pulse);
        g.fillStyle = COL[h.color]; g.fill();
        g.lineWidth = 1.2; g.strokeStyle = '#ffffff'; g.stroke();
      }
      g.restore();
      g.globalAlpha = 1;
    }

    drawParticles(g, layer) {
      const wx = this.weather; if (!wx) return;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const pw = p.sprite === 'shoot' ? p.size * 2 : p.size, ph = p.sprite === 'shoot' ? p.size / 2 : p.size;
        const im = this.spr('p_' + p.sprite, pw, ph);
        if (!im) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.rot || p.flipX) {
          g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
          g.drawImage(im, -pw / 2, -ph / 2, pw, ph); g.restore();
        } else g.drawImage(im, p.x - pw / 2, p.y - ph / 2, pw, ph);
      }
      g.globalAlpha = 1;
    }

    drawFx(g) {
      for (const f of this.fx) {
        const k = f.t / f.life;
        if (f.kind === 'ring') {
          g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = f.col; g.lineWidth = f.w * (1 - k) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.r * (0.3 + 0.7 * Math.sqrt(k)), 0, TAU); g.stroke();
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
        g.lineWidth = Math.max(3, t.size * 0.22); g.strokeStyle = 'rgba(16,14,44,.9)'; g.strokeText(t.txt, x, t.y);
        g.fillStyle = t.col; g.fillText(t.txt, x, t.y);
      }
      g.globalAlpha = 1;
    }

    // ---------------- HUD ----------------
    _rr(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    _panel(g, x, y, w, h, r) {
      this._rr(g, x, y, w, h, r);
      g.fillStyle = 'rgba(16,18,52,.72)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(170,190,255,.45)'; g.stroke();
    }
    _text(g, txt, x, y, size, col, align, weight) {
      g.font = (weight || '900') + ' ' + Math.round(size) + 'px ' + FONT; g.textAlign = align || 'left'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, size * 0.18); g.strokeStyle = 'rgba(14,12,44,.95)'; g.strokeText(txt, x, y);
      g.fillStyle = col; g.fillText(txt, x, y);
    }
    /* Panels fade when Bolt runs up under them (on the rail at small heights). */
    _fadeFor(w, x, y, wd, ht) {
      const h = w.hero, L = w.layout, S = L.unit * BOLT_K;
      const l = L.heroX - S / 2, r = L.heroX + S / 2, t = h.y - S * 0.6, b = h.y + S * 0.6;
      return (r > x && l < x + wd && b > y && t < y + ht) ? 0.3 : 1;
    }
    drawHud(g, w, mode) {
      const L = w.layout, K = Math.min(this._hudK, 1.25), I = this.ins, VW = this.VW;
      const best = RF.Game ? RF.Game.best(RF.Game.runDifficulty) : 0;
      const x0 = I.left + 12, top = I.top + 12, hb = this._hudBtn;
      this._hudA = this._hudA || [1, 1];
      // score + best + batteries (left)
      const hs = 22 * Math.min(K, 1.15), pw = Math.max(190 * Math.min(K, 1.1), 28 + w.maxHearts * (hs + 4));
      this._hudA[0] += (this._fadeFor(w, x0, top, pw, 98) - this._hudA[0]) * 0.15;
      g.globalAlpha = this._hudA[0];
      this._panel(g, x0, top, pw, 98, 18);
      this._text(g, String(w.score), x0 + 16, top + 30, 32 * K, '#fff', 'left');
      this._text(g, 'Best ' + Math.max(best, w.score), x0 + 16, top + 58, 13 * K, '#ffd98a', 'left', '800');
      if ((w.mult || 1) >= 2) this._text(g, '×' + w.mult, x0 + pw - 16, top + 30, (22 + (this.multShow > 0 ? 5 : 0)) * K, '#fff2a8', 'right');
      for (let i = 0; i < w.maxHearts; i++) {
        const on = i < w.hearts, pulse = (i === (on ? w.hearts - 1 : w.hearts) && this.heartPulse > 0) ? 1 + this.heartPulse * 0.5 : 1;
        const im = this.spr(on ? 'battery' : 'battery_empty', hs, hs), hx = x0 + 14 + i * (hs + 4), hy = top + 72;
        if (im) g.drawImage(im, hx + hs / 2 - hs * pulse / 2, hy + hs / 2 - hs * pulse / 2 - 6, hs * pulse, hs * pulse);
      }
      // time of day + progress + "catch" colour (centre top in landscape, second row in portrait)
      const right = hb ? hb.l - 10 : VW - 110;
      let cx, cy, cw;
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 220, 340); cx = Math.max(x0 + pw + 12 + cw / 2, VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = top; }
      else { cw = Math.min(VW - I.left - I.right - 24, 420); cx = VW / 2; cy = top + 108; }
      g.globalAlpha = 1;
      this._hudA[1] += (this._fadeFor(w, cx - cw / 2, cy, cw, 78) - this._hudA[1]) * 0.15;
      g.globalAlpha = this._hudA[1];
      this._panel(g, cx - cw / 2, cy, cw, 78, 18);
      const info = ZONE_INFO[w.zone % 4];
      this._text(g, info.name + (w.loop ? ' ★' + (w.loop + 1) : ''), cx - cw / 2 + 14, cy + 18, 14 * K, info.color, 'left', '800');
      // progress bar with a little sun/moon marker
      const bx = cx - cw / 2 + 14, bw = cw - 28, by = cy + 34, bhh = 10, k = clamp(w.progress || 0, 0, 1);
      this._rr(g, bx, by, bw, bhh, 5); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill();
      if (k > 0) { this._rr(g, bx, by, Math.max(10, bw * k), bhh, 5); const gr = g.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#ffb38a'); gr.addColorStop(1, '#fff2a8'); g.fillStyle = gr; g.fill(); }
      this._star(g, bx + bw * k, by + bhh / 2, 8, '#fff2a8');
      // "Catch:" colour chip
      const c = w.hero.color, cyy = cy + 62, pulse = 1 + this.colorPulse * 0.4;
      this._text(g, 'Catch', bx, cyy, 12 * K, '#e8ecff', 'left', '800');
      const sx = bx + 52 * Math.min(K, 1.1);
      for (let i = 0; i < 3; i++) {
        const on = i === c, xx = sx + i * 28;
        g.globalAlpha = this._hudA[1] * (on ? 1 : 0.28);
        symbolPath(g, i, xx, cyy, (on ? 8.5 * pulse : 6.5));
        g.fillStyle = COL[i]; g.fill();
        if (on) { g.lineWidth = 1.6; g.strokeStyle = '#fff'; g.stroke(); }
      }
      g.globalAlpha = this._hudA[1];
      this._text(g, Math.round(w.distance || 0) + ' m', bx + bw, cyy, 12 * K, '#e8ecff', 'right', '800');
      g.globalAlpha = 1;
      if (this.hintOn && mode === 'playing' && !this.banner) this._text(g, ZONE_INFO[0].hint, VW / 2, this._lowY(), 19 * K, '#fff', 'center', '800');
    }
    /* A line on the building facades under the roof (never over the play corridor). */
    _lowY() { const L = this.world.layout; return Math.min(this.VH - 24 - this.ins.bottom, L.floorY + Math.max(40, (this.VH - L.floorY) * 0.45)); }
    _star(g, x, y, r, col) {
      g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = col; g.fill();
    }

    drawBanner(g) {
      const b = this.banner, info = ZONE_INFO[b.s % 4], t = b.t;
      const a = t < 0.3 ? t / 0.3 : t > 2.0 ? Math.max(0, (2.4 - t) / 0.4) : 1;
      const h = 76, cx = this.VW / 2, y = this._lowY() - (1 - a) * 16;
      const w = Math.min(this.VW - 40, 420);
      g.globalAlpha = a * 0.85;
      this._panel(g, cx - w / 2, y - h / 2, w, h, 22);
      g.globalAlpha = a;
      this._text(g, info.name + (b.loop ? '  ★' + (b.loop + 1) : ''), cx, y - 14, 26, info.color, 'center');
      this._text(g, b.s === 0 && !b.loop ? 'Good morning, Bolt!' : 'Run to the light arch!', cx, y + 18, 17, '#fff', 'center', '800');
      g.globalAlpha = 1;
    }

    drawDebug(g, w, camX) {
      const L = w.layout, u = L.unit, h = w.hero;
      g.strokeStyle = 'rgba(0,255,120,.8)'; g.lineWidth = 1;
      const hk = (w.D && w.D.hitK) || 1;
      g.strokeRect(h.x - 0.25 * u * hk, h.y - 0.25 * u * hk, 0.5 * u * hk, 0.5 * u * hk);
      for (const o of w.obstacles) { const y0 = o.kind === 'vent' ? L.floorY - o.h : L.ceilY; g.strokeStyle = o.hit ? 'rgba(255,255,0,.5)' : 'rgba(255,60,60,.9)'; g.strokeRect(o.x - o.w / 2, y0, o.w, o.h); }
      g.strokeStyle = 'rgba(0,200,255,.7)';
      for (const f of w.fireflies) { if (f.state !== 'fly') continue; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(255,0,180,.8)';
      for (const r of w.roofs) { g.beginPath(); g.moveTo(r.x0, L.floorY); g.lineTo(r.x1, L.floorY); g.stroke(); }
      for (const r of w.rails) { g.beginPath(); g.moveTo(r.x0, L.ceilY); g.lineTo(r.x1, L.ceilY); g.stroke(); }
      g.fillStyle = '#0f8'; g.font = '11px monospace'; g.textAlign = 'left';
      g.fillText(w.phase + ' ' + h.state + ' side ' + h.side + ' v ' + (w.speed || 0).toFixed(0) + ' d ' + (w.distance || 0).toFixed(0), camX + 10, this.VH - 10);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.symbolPath = symbolPath;
  Renderer.COL = COL;
  RF.Renderer = Renderer;
})(window.RF = window.RF || {});
