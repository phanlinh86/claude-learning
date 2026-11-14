/* FF.Renderer — draws the world, parallax seasons, weather, juicy effects and the HUD on a canvas.
 * The world ("scene") is 960×540 logical px. The canvas fills the whole screen at any aspect (phone / tablet,
 * portrait / landscape, desktop window): its logical size is VW×VH (see computeView), the scene is drawn at
 * offset (SX, SY), bottom-anchored, and the extra room is the season's own scenery (sky continued upwards and
 * sideways, parallax hills and ground tiled across) — never black bars. The HUD is laid out in screen space
 * inside the safe area (notch, home bar). */
(function (FF) {
  'use strict';
  const W = 960, H = 540, GROUND_DRAW_Y = 460;
  const SEASON_INFO = [
    { name: 'Spring', color: '#ff7fb0', dark: '#b8336d', icon: 'p_blossom' },
    { name: 'Summer', color: '#ffb52e', dark: '#b86a00', icon: 'p_butterfly_a' },
    { name: 'Autumn', color: '#ff7a33', dark: '#a63c0a', icon: 'p_leaf_orange' },
    { name: 'Winter', color: '#7cc7ff', dark: '#2d6aa3', icon: 'p_snowflake' }
  ];
  const PARALLAX = { clouds: 0.06, far: 0.12, mid: 0.38, ground: 1.0 };
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0;
      this.shake = 0; this.flash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null;
      this.lines = [];
      for (let i = 0; i < 9; i++) this.lines.push({ x: Math.random() * W, y: 40 + Math.random() * 260, len: 40 + Math.random() * 70, a: 0.1 + Math.random() * 0.15 });
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 2;
      this.pointsPerSeason = 10;
      this.VW = W; this.VH = H; this.SX = 0; this.SY = 0; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._ext = new Map();
      this.touch = false;
      this.resize();
    }

    /* Logical canvas size for a screen of vw×vh CSS px (insets = safe-area insets in CSS px):
     *  wider than 16:9 (phones in landscape) → height 540, wider world (more turtles in view), scene centred;
     *  16:9 … square (iPad landscape, desktop) → width 960, taller sky above the scene;
     *  portrait → width 600 (phones) / 760 (tablets) around the bird (bird at 30 % from the left), tall sky;
     *  the scene is always bottom-anchored (ground at the bottom of the screen). */
    static computeView(vw, vh, insetsCss) {
      vw = Math.max(1, vw); vh = Math.max(1, vh);
      const ar = vw / vh;
      let VW, SX;
      if (ar >= 16 / 9) { VW = H * ar; SX = (VW - W) / 2; }
      else if (ar >= 1) { VW = W; SX = 0; }
      else { VW = ar >= 0.6 ? 760 : 600; SX = 0.3 * VW - 260; }
      const s = vw / VW, VH = Math.max(H, vh / s), SY = VH - H;
      const sa = insetsCss || { top: 0, right: 0, bottom: 0, left: 0 };
      const ins = { top: (sa.top || 0) / s, right: (sa.right || 0) / s, bottom: (sa.bottom || 0) / s, left: (sa.left || 0) / s };
      // what the world needs to know: visible x range and how high the bird may fly (a soft ceiling a little
      // below the top of the screen / the HUD, at most 300 px above the classic ceiling, so treats still fall a fair distance)
      const ceilingY = SY > 0 ? Math.max(-SY + ins.top + 30, -300) : 0;
      return { VW, VH, s, SX, SY, ins, viewL: -SX, viewR: VW - SX, ceilingY: Math.min(0, ceilingY) };
    }

    resize(insetsCss) {
      if (insetsCss) this._insCss = insetsCss;
      const stage = this.canvas.parentElement;
      const vw = (stage && stage.clientWidth) || window.innerWidth, vh = (stage && stage.clientHeight) || window.innerHeight;
      const v = Renderer.computeView(vw, vh, this._insCss);
      const s = v.s, dpr = window.devicePixelRatio || 1;
      Object.assign(this, { VW: v.VW, VH: v.VH, SX: v.SX, SY: v.SY, ins: v.ins, cssScale: s });
      this.view = v;
      this.canvas.style.width = vw + 'px';
      this.canvas.style.height = vh + 'px';
      // P3: cap the backing store (default 2 device px per logical px, and by area: ≈2.1 MP desktop, 2.8 MP
      // phone / tablet); the browser upscales the rest. Fill cost grows with pixels for ~no visible gain here.
      let px = Math.min(s * dpr, this.maxPx || 2);
      const cap = this.touch ? 2.8e6 : 1920 * 1080 * 1.02;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      this.px = Math.max(0.5, px); // device pixels per logical pixel
      this.canvas.width = Math.round(v.VW * this.px);
      this.canvas.height = Math.round(v.VH * this.px);
      this._sxd = Math.round(this.SX * this.px); this._syd = Math.round(this.SY * this.px);
      this._ext.clear();
      // DOM pieces (CSS px) inside the safe area
      const sa = this._insCss || { top: 0, right: 0, bottom: 0, left: 0 };
      const m = Math.max(8, 14 * s);
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      if (hud) { hud.style.top = (sa.top + m) + 'px'; hud.style.right = (sa.right + m) + 'px'; }
      if (toast) toast.style.bottom = (sa.bottom + Math.max(16, 30 * s)) + 'px';
      this._hudBtn = null; this._measureHud();
      FF.Assets.setScale(this.px);
      if (this.vis) FF.Assets.warmSeason(this.vis.cur);
    }
    /* Where the DOM pause / sound buttons start (left edge, logical screen px), so the canvas HUD keeps clear. */
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud || hud.classList.contains('hidden')) return;
      const r = hud.getBoundingClientRect();
      if (r.width > 0) this._hudBtn = { l: r.left / this.cssScale, b: r.bottom / this.cssScale };
    }

    attach(world, weather) { this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.banner = null; this.shake = 0; this.flash = 0; }

    setSeason(i, instant) {
      i = ((i % 4) + 4) % 4;
      FF.Assets.warmSeason((i + 1) % 4); FF.Assets.warmSeason(0);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }

    showBanner(seasonIdx) { this.banner = { s: seasonIdx, t: 0 }; }

    // ---------------- events → effects ----------------
    onEvents(evts) {
      for (const e of evts) {
        switch (e.type) {
          case 'flap': this.puffs(e.x - 22, e.y + 4, 3, '#ffffff', 0.55); break;
          case 'hit': {
            for (let i = 0; i < 7; i++) {
              const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9;
              const sp = 90 + Math.random() * 170;
              this.fx.push({ k: 'heart', x: e.x, y: e.y - 6, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 240, life: -i * 0.025, max: 0.9 + Math.random() * 0.3, size: 16 + Math.random() * 10, rot: (Math.random() - .5) * .6, vr: (Math.random() - .5) * 3 });
            }
            this.sparks(e.x, e.y - 4, 10, '#fff6a8');
            this.fx.push({ k: 'ring', x: e.x, y: e.y, life: 0, max: 0.45, color: '#ffffff' });
            const combo = e.combo || 1;
            this.texts.push({ text: '+' + (e.points || 1), x: e.x, y: e.y - 30, life: 0, max: 1.1, size: combo >= 3 ? 34 : 28, color: combo >= 3 ? '#ffe14d' : '#ffffff' });
            if (combo >= 2) this.texts.push({ text: 'Combo x' + combo + '!', x: e.x, y: e.y - 6, life: 0, max: 1.1, size: 18, color: '#ffe14d' });
            break;
          }
          case 'miss': this.puffs(e.x, e.y + 2, 7, this.vis.cur === 3 ? '#ffffff' : '#c9a777', 0.55, true, 9); break;
          case 'ceiling': this.puffs(e.x, e.y - 20, 3, '#ffffff', 0.4); break;
          case 'season': this.showBanner(e.season); this.flash = Math.max(this.flash, 0.35); this.setSeason(e.season); break;
          case 'dead': this.shake = 0.45; this.flash = 0.6; this.sparks(e.x, e.y, 12, '#ffffff'); break;
        }
      }
    }
    puffs(x, y, n, color, max, ground, minSize) {
      for (let i = 0; i < n; i++) {
        this.fx.push({ k: 'puff', x: x + (Math.random() - .5) * 10, y: y + (Math.random() - .5) * 8,
          vx: (ground ? (Math.random() - .5) * 80 : -40 - Math.random() * 60), vy: ground ? -20 - Math.random() * 40 : (Math.random() - .5) * 40,
          g: 0, life: 0, max: max + Math.random() * 0.2, size: (minSize || 6) + Math.random() * (minSize ? 8 : 6), color, scroll: ground });
      }
    }
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 80 + Math.random() * 160;
        this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 120, life: 0, max: 0.35 + Math.random() * 0.25, size: 2 + Math.random() * 2.5, color });
      }
    }

    update(dt) {
      this.time += dt;
      const sc = this.world ? this.world.scrollSpeed : 0;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.6);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.1) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      for (const f of this.fx) {
        f.life += dt;
        f.vy += (f.g || 0) * dt;
        f.x += f.vx * dt - (f.scroll ? sc * dt : 0);
        f.y += f.vy * dt;
        if (f.vr) f.rot += f.vr * dt;
      }
      this.fx = this.fx.filter(f => f.life < f.max);
      if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
      for (const t of this.texts) { t.life += dt; t.y -= 38 * dt; }
      this.texts = this.texts.filter(t => t.life < t.max);
      // speed lines: x in screen px, y in scene px (spread into the extra sky on tall screens)
      const top = this.world && this.world.cfg ? Math.max(this.world.cfg.ceilingY || 0, -300) : 0;
      for (const l of this.lines) {
        l.x -= (sc * 2.4 + 60) * dt;
        if (l.x + l.len < 0) { l.x = this.VW + Math.random() * 200; l.y = top + 40 + Math.random() * (260 - top); l.len = 40 + Math.random() * 70; }
      }
    }

    // ---------------- drawing helpers ----------------
    tile(key, off, y, w, h, alpha) {
      const spr = FF.Assets.sprite(key, w, h);
      if (!spr) return false;
      // Blit at 1:1 device pixels: a stretched full-screen drawImage (even by 1 px) takes the
      // filtered/resampling path, which costs 10x more in software and extra texture taps on a GPU.
      const g = this.ctx, sw = spr.width, cw = g.canvas.width;
      let x = -Math.round((((off % w) + w) % w) * sw / w);
      if (x + this._ox > 0) x -= sw * Math.ceil((x + this._ox) / sw);   // start at the screen's left edge
      g.setTransform(1, 0, 0, 1, this._ox, this._oy);
      if (alpha < 1) g.globalAlpha = alpha;
      for (const yd = Math.round(y * this.px); x + this._ox < cw; x += sw) g.drawImage(spr, x, yd);
      g.globalAlpha = 1;
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      return true;
    }
    customBg(slot, alpha) {
      const c = FF.Assets.custom[slot]; if (!c) return false;
      const g = this.ctx, VW = this.VW, VH = this.VH;
      // cover-fit the whole screen, then a slow one-way pan over mirrored copies (never reverses, no seam)
      const k = Math.max(VW / c.width, VH / c.height);
      const dw = c.width * k, dh = c.height * k, y = (VH - dh) / 2 - Math.min(20, (dh - VH) / 2);
      const scroll = this.world ? this.world.scroll : 0;
      const off = (scroll * 0.05) % (2 * dw);
      const spr = FF.Assets.sprite('custom:' + slot, dw, dh);
      g.setTransform(this.px, 0, 0, this.px, this._ox - this._sxd, this._oy - this._syd);   // screen space
      g.globalAlpha = alpha;
      for (let i = 0; i < 3; i++) {
        const x = -off + i * dw;
        if (x > VW || x + dw < 0) continue;
        if (i % 2 === 1) { g.save(); g.translate(x + dw, y); g.scale(-1, 1); g.drawImage(spr, 0, 0, dw + 1 / this.px, dh); g.restore(); }
        else g.drawImage(spr, x, y, dw + 1 / this.px, dh);
      }
      g.globalAlpha = 1;
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      return true;
    }
    /* The season's sky continued over the whole screen, built once per season / size into one device-pixel
     * canvas so the per-frame draw stays a 1:1 blit. Landscape wider than 16:9: the 960×540 sky in the middle,
     * its edge columns (averaged) stretched sideways. Portrait: the sky is right-aligned so the sun stays in view.
     * Taller screens: the sky's top colour continues upwards, deepening slightly towards the zenith. */
    skyExt(s) {
      const key = s + '|' + Math.round(this.VW) + 'x' + Math.round(this.VH) + '|' + this.px.toFixed(3);
      let c = this._ext.get(key);
      if (c) return c;
      const n = FF.Assets.SEASONS[s], spr = FF.Assets.sprite(n + '_sky', W, H);
      if (!spr) return null;
      c = document.createElement('canvas'); c.width = this.canvas.width; c.height = this.canvas.height;
      const g = c.getContext('2d'), sw = spr.width, sh = spr.height, dy = c.height - sh;
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const dx = this.SX >= 0 ? this._sxd : c.width - sw;
      g.drawImage(spr, dx, dy);
      const avg = (sx, sy, w, h) => { const t = document.createElement('canvas'); t.width = 1; t.height = Math.max(1, Math.round(h)); const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high'; tg.drawImage(spr, sx, sy, w, h, 0, 0, 1, t.height); return t; };
      if (dx > 0) {
        const e = Math.round(96 * this.px);
        g.drawImage(avg(0, 0, e, sh), 0, 0, 1, sh, 0, dy, dx + 1, sh);
        g.drawImage(avg(sw - e, 0, e, sh), 0, 0, 1, sh, dx + sw - 1, dy, c.width - dx - sw + 1, sh);
      }
      if (dy > 0) {
        // the sky's top rows (averaged vertically, kept per column so the sun's halo lines up) stretched upwards;
        // then a gentle deepening towards the zenith
        const t = document.createElement('canvas'); t.width = c.width; t.height = 1;
        const tg = t.getContext('2d'); tg.imageSmoothingEnabled = true; tg.imageSmoothingQuality = 'high';
        tg.drawImage(c, 0, dy + 1, c.width, Math.max(2, Math.round(4 * this.px)), 0, 0, c.width, 1);
        g.drawImage(t, 0, 0, c.width, 1, 0, 0, c.width, dy + 1);
        // feather the join: the band fades into the sky's top 70 px (no visible seam)
        const fh = Math.round(70 * this.px), f = document.createElement('canvas'); f.width = c.width; f.height = fh;
        const fg = f.getContext('2d'); fg.drawImage(t, 0, 0, c.width, 1, 0, 0, c.width, fh);
        fg.globalCompositeOperation = 'destination-in';
        const fgr = fg.createLinearGradient(0, 0, 0, fh); fgr.addColorStop(0, 'rgba(0,0,0,1)'); fgr.addColorStop(1, 'rgba(0,0,0,0)');
        fg.fillStyle = fgr; fg.fillRect(0, 0, c.width, fh);
        g.drawImage(f, 0, dy);
        const k = Math.min(1, dy / (600 * this.px));
        const grd = g.createLinearGradient(0, 0, 0, dy + 1);
        grd.addColorStop(0, 'rgba(30,70,150,' + (0.22 * k).toFixed(3) + ')'); grd.addColorStop(1, 'rgba(30,70,150,0)');
        g.fillStyle = grd; g.fillRect(0, 0, c.width, dy + 1);
      }
      if (this._ext.size > 4) this._ext.delete(this._ext.keys().next().value);
      this._ext.set(key, c);
      return c;
    }
    backdrop(s, alpha) {
      const name = FF.Assets.SEASONS[s];
      const scroll = this.world ? this.world.scroll : 0;
      if (this.customBg('bg_' + name, alpha)) {
        // keep drifting clouds over a photo so it still has depth
        this.tile(name + '_clouds', scroll * PARALLAX.clouds + this.time * 7, 0, W, H, alpha * 0.6);
        return;
      }
      const g = this.ctx;
      const sky = this.skyExt(s);
      g.globalAlpha = alpha;
      if (sky) { g.setTransform(1, 0, 0, 1, this._ox - this._sxd, this._oy - this._syd); g.drawImage(sky, 0, 0); g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy); }
      else { g.fillStyle = '#9fd8f5'; g.fillRect(-this.SX, -this.SY, this.VW, this.VH); }
      g.globalAlpha = 1;
      // extra sky above the scene (tablets, portrait): fainter, slower cloud bands higher up
      for (let k = 1; k < 6 && -k * 300 + 260 > -this.SY; k++) {
        this.tile(name + '_clouds', scroll * PARALLAX.clouds * 0.6 + this.time * (7 - k) + 331 * k, -k * 300, W, H, alpha * Math.max(0.45, 0.85 - 0.1 * k));
      }
      this.tile(name + '_clouds', scroll * PARALLAX.clouds + this.time * 7, 0, W, H, alpha);
      this.tile(name + '_far', scroll * PARALLAX.far, 0, W, H, alpha);
      this.tile(name + '_mid', scroll * PARALLAX.mid, 0, W, H, alpha);
    }
    ground(s, alpha) {
      const name = FF.Assets.SEASONS[s];
      const scroll = this.world ? this.world.scroll : 0;
      if (!this.tile(name + '_ground', scroll * PARALLAX.ground, GROUND_DRAW_Y, W, 80, alpha)) {
        this.ctx.fillStyle = '#7cc94f'; this.ctx.fillRect(-this.SX, GROUND_DRAW_Y, this.VW, 80);
      }
    }
    text(str, x, y, size, fill, stroke, align = 'center', lw) {
      const g = this.ctx;
      g.font = `900 ${size}px ${FONT}`;
      g.textAlign = align; g.textBaseline = 'middle';
      g.lineJoin = 'round';
      if (stroke) {
        g.lineWidth = lw || Math.max(3, size * 0.16);
        g.strokeStyle = stroke;
        g.strokeText(str, x, y + size * 0.06);
        g.strokeText(str, x, y);
      }
      g.fillStyle = fill;
      g.fillText(str, x, y);
    }
    shadow(x, height, w, alpha) {
      const g = this.ctx;
      const k = clamp(1 - height / 520, 0.25, 1);
      g.fillStyle = `rgba(40,30,20,${(alpha * k).toFixed(3)})`;
      g.beginPath(); g.ellipse(x, this.world.groundY + 3, w * k * 0.5, 5 * k + 1, 0, 0, TAU); g.fill();
    }
    roundRect(x, y, w, h, r) {
      const g = this.ctx; g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }

    // ---------------- main draw ----------------
    draw(mode) {
      const g = this.ctx, w = this.world;
      // scene → device: the scene's origin sits at (_sxd, _syd) device px; screen shake adds a few px
      this._ox = this._sxd; this._oy = this._syd;
      if (this.shake > 0) {
        const m = this.shake * 14 * this.px;
        this._ox += Math.round((Math.random() - .5) * m); this._oy += Math.round((Math.random() - .5) * m);
      }
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const v = this.vis;
      const lerped = w ? this.interp(w) : false;      // P2: draw the world between its last two 1/120 s steps
      if (this._trimKey !== v.cur * 4 + v.prev) { this._trimKey = v.cur * 4 + v.prev; FF.Assets.trimSeasons([v.cur, v.prev, (v.cur + 1) % 4, 0]); }

      // 1. sky + parallax backdrop (cross-faded between seasons)
      if (v.t < 1 && v.prev !== v.cur) { this.backdrop(v.prev, 1); this.fadeLayer(() => this.backdrop(v.cur, 1), v.t); }
      else this.backdrop(v.cur, 1);

      // 2. weather ambient + back particles
      if (this.weather) { this.ambient(this.weather.ambient); this.particles('back'); }

      // 3. speed lines sell the forward motion
      if (w && w.state === 'playing') {
        g.strokeStyle = '#ffffff'; g.lineCap = 'round'; g.lineWidth = 2;
        for (const l of this.lines) { const x = l.x - this.SX; g.globalAlpha = l.a; g.beginPath(); g.moveTo(x, l.y); g.lineTo(x + l.len, l.y); g.stroke(); }
        g.globalAlpha = 1;
      }

      // 4. ground
      if (v.t < 1 && v.prev !== v.cur) { this.ground(v.prev, 1); this.ground(v.cur, v.t); }
      else this.ground(v.cur, 1);

      if (mode === 'playing' && w && w.state === 'ready') this.readyOverlay();   // under the bird so it never hides it
      if (w) {
        this.drawTurtles();
        this.drawDrops();
        this.drawTexts();                               // score popups sit under the bird
        this.drawBird();
      }
      // 5. front weather + effects
      if (this.weather) this.particles('front');
      this.drawFx();

      g.setTransform(this.px, 0, 0, this.px, this._sxd, this._syd);   // scene space, no shake
      if (this.weather && this.weather.ambient && this.weather.ambient.fog > 0) {
        const fog = this.weather.ambient.fog;
        const grd = g.createLinearGradient(0, 260, 0, 540);
        grd.addColorStop(0, 'rgba(255,255,255,0)'); grd.addColorStop(1, `rgba(240,246,255,${(0.35 * fog).toFixed(3)})`);
        g.fillStyle = grd; g.fillRect(-this.SX, 260, this.VW, 280);
      }
      if (this.banner) this.drawBanner();
      if (this.debug && w) this.debugDraw();
      g.setTransform(this.px, 0, 0, this.px, 0, 0);                    // screen space
      if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${(this.flash * 0.6).toFixed(3)})`; g.fillRect(0, 0, this.VW, this.VH); }

      // 6. HUD (screen space, inside the safe area)
      if (w && (mode === 'playing' || mode === 'paused')) this.hud(mode);
      if (lerped) this.uninterp();
    }

    /* Render interpolation: World runs fixed 1/120 s steps; a display frame almost never lands exactly on a
     * step, so drawing the latest step makes motion advance 0,1,2 or 3 steps per frame (judder at 60/75/120/144 Hz).
     * World._step stores the previous step's positions (_p*); draw at prev + (cur - prev) * (acc / step). */
    interp(w) {
      const a = clamp(w._acc / (w.cfg.step || 1 / 120), 0, 1), S = this._saved || (this._saved = []);
      S.length = 0;
      this._a = a;
      this._lerp(w, 'scroll', '_pScroll');
      const b = w.bird; this._lerp(b, 'x', '_px'); this._lerp(b, 'y', '_py'); this._lerp(b, 'angle', '_pa');
      for (const t of w.turtles) { this._lerp(t, 'x', '_px'); this._lerp(t, 'y', '_py'); }
      for (const d of w.drops) { this._lerp(d, 'x', '_px'); this._lerp(d, 'y', '_py'); }
      this._rs = w.scroll;
      return S.length > 0;
    }
    _lerp(o, k, pk) {
      const p = o[pk]; if (p == null) return;
      const S = this._saved; S.push(o, k, o[k]);
      o[k] = p + (o[k] - p) * this._a;
    }
    uninterp() { const S = this._saved; for (let i = S.length - 3; i >= 0; i -= 3) S[i][S[i + 1]] = S[i + 2]; S.length = 0; }

    /* Draw fn() into an offscreen canvas at full strength, then blend it in once (clean cross-fade, no ghosting). */
    fadeLayer(fn, a) {
      const o = this._off || (this._off = document.createElement('canvas'));
      if (o.width !== this.canvas.width || o.height !== this.canvas.height) { o.width = this.canvas.width; o.height = this.canvas.height; }
      const g0 = this.ctx;
      this.ctx = o.getContext('2d');
      this.ctx.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      this.ctx.imageSmoothingQuality = 'high';
      try { fn(); } finally { this.ctx = g0; }
      g0.save(); g0.setTransform(1, 0, 0, 1, 0, 0); g0.globalAlpha = a; g0.drawImage(o, 0, 0); g0.restore();
    }

    ambient(a) {
      if (!a) return;
      const g = this.ctx;
      if (a.tint) { g.fillStyle = a.tint; g.fillRect(-this.SX - 20, -this.SY - 20, this.VW + 40, this.VH + 40); }
      if (a.sunRays > 0) {
        g.save();
        g.globalCompositeOperation = 'lighter';
        const cx = this.VW - this.SX - 140, cy = -this.SY - 40, rl = 1 + this.SY / 540;
        for (let i = 0; i < 6; i++) {
          const ang = 1.75 + i * 0.16 + Math.sin(this.time * 0.25 + i * 1.7) * 0.03;
          const alpha = a.sunRays * (0.05 + 0.03 * Math.sin(this.time * 0.6 + i * 2.1));
          const grd = g.createLinearGradient(cx, cy, cx + Math.cos(ang) * 600 * rl, cy + Math.sin(ang) * 600 * rl);
          grd.addColorStop(0, `rgba(255,240,180,${alpha.toFixed(3)})`); grd.addColorStop(1, 'rgba(255,240,180,0)');
          g.fillStyle = grd;
          g.beginPath(); g.moveTo(cx, cy);
          g.lineTo(cx + Math.cos(ang - 0.05) * 700 * rl, cy + Math.sin(ang - 0.05) * 700 * rl);
          g.lineTo(cx + Math.cos(ang + 0.05) * 700 * rl, cy + Math.sin(ang + 0.05) * 700 * rl);
          g.closePath(); g.fill();
        }
        g.restore();
      }
    }

    particles(layer) {
      const g = this.ctx, A = FF.Assets;
      for (const p of this.weather.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.sprite === 'dot') {
          g.fillStyle = p.color || '#ffffff';
          g.beginPath(); g.arc(p.x, p.y, p.size * 0.5, 0, TAU); g.fill();
          continue;
        }
        const spr = A.sprite('p_' + p.sprite, 32, 32);
        if (!spr) continue;
        const fx = p.flipX == null ? 1 : (Math.abs(p.flipX) < 0.22 ? 0.22 * Math.sign(p.flipX || 1) : p.flipX);
        g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
        g.translate(p.x, p.y); g.rotate(p.rot || 0); g.scale(fx, 1);
        g.drawImage(spr, -p.size / 2, -p.size / 2, p.size, p.size);
      }
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      g.globalAlpha = 1;
    }

    drawTurtles() {
      const g = this.ctx, w = this.world, A = FF.Assets;
      const custom = A.hasCustom('turtle');
      for (const t of w.turtles) {
        if (t.x < -this.SX - 200 || t.x > this.VW - this.SX + 200) continue;
        const tw = t.w || 132, th = t.h || 79;
        this.shadow(t.x, 0, tw * 0.85, 0.32);
        g.save();
        g.translate(t.x, t.y);
        if (t.dir < 0) g.scale(-1, 1);
        const happy = t.frame === 'happy' || t.happyTimer > 0;
        let sx = 1, sy = 1, bob = 0;
        if (happy) {
          const k = clamp(t.happyTimer / 0.6, 0, 1);
          sy = 1 + 0.12 * Math.sin((1 - k) * Math.PI * 3) * k; sx = 2 - sy;
        }
        if (custom) {
          const [cw, ch] = A.fit('turtle', tw, th);
          bob = happy ? -Math.abs(Math.sin(this.time * 16)) * 8 : -Math.abs(Math.sin((t.walkPhase || 0) * TAU)) * 3;
          const tilt = happy ? 0 : Math.sin((t.walkPhase || 0) * TAU) * 0.05;
          g.rotate(tilt); g.scale(sx, sy);
          g.drawImage(A.sprite('custom:turtle', cw, ch), -cw / 2, -ch + bob, cw, ch);
        } else {
          g.scale(sx, sy);
          const key = 'turtle_' + (happy ? 'happy' : (t.frame === 'walk2' ? 'walk2' : 'walk1'));
          const spr = A.sprite(key, tw, th);
          const ph = (t.walkPhase || 0) * TAU, walking = !happy && !t.paused;
          const bobD = walking ? -Math.abs(Math.sin(ph * 2)) * 1.6 : 0;   // small lift on each step
          if (walking) g.rotate(Math.sin(ph * 2) * 0.025);
          if (spr) g.drawImage(spr, -tw / 2, -th + bobD, tw, th);
        }
        g.restore();
      }
    }

    drawDrops() {
      const g = this.ctx, w = this.world, A = FF.Assets;
      const custom = A.hasCustom('drop');
      const [dw, dh] = custom ? A.fit('drop', 34, 34) : [32, 32];
      const spr = custom ? A.sprite('custom:drop', dw, dh) : A.sprite('drop', 32, 32);
      if (!spr) return;
      for (const d of w.drops) {
        let alpha = 1;
        if (d.landed) alpha = d.alpha != null ? d.alpha : clamp((d.life != null ? d.life : 0.6) / 0.6, 0, 1);
        if (d.alive === false && !d.landed) continue;
        if (alpha <= 0.01) continue;
        if (!d.landed) this.shadow(d.x, w.groundY - d.y, 22, 0.18);
        g.save();
        g.globalAlpha = alpha;
        g.translate(d.x, d.y); g.rotate(d.angle || 0);
        if (d.landed && (d.life == null || d.life > 0.75)) g.scale(1.25, 0.75);   // squish on landing
        g.drawImage(spr, -dw / 2, -dh / 2, dw, dh);
        g.restore();
      }
    }

    drawBird() {
      const g = this.ctx, w = this.world, b = w.bird, A = FF.Assets;
      this.shadow(b.x, w.groundY - b.y, 54, 0.2);
      const custom = A.hasCustom('bird');
      g.save();
      g.translate(b.x, b.y);
      g.rotate((b.angle || 0) * (custom ? 0.55 : 1));   // photos look odd nose-diving at 70°
      const sq = b.squash || 1;
      g.scale(1 / Math.sqrt(sq), sq);
      if (custom) {
        const [cw, ch] = A.fit('bird', 84, 70);
        const phase = (b.wingPhase || 0) * TAU;
        const wingA = -0.35 - Math.sin(phase) * 0.75;
        this.wing(-cw * 0.36, -ch * 0.02, cw * 0.62, wingA - 0.25, 1, '#dfe8f2');
        g.drawImage(A.sprite('custom:bird', cw, ch), -cw / 2, -ch / 2, cw, ch);
        this.wing(-cw * 0.30, ch * 0.02, cw * 0.62, wingA, 1, '#ffffff');
      } else {
        const frame = b.frame === 'up' || b.frame === 'down' ? b.frame : 'mid';
        const spr = A.sprite('bird_' + frame, 78, 65);
        if (spr) g.drawImage(spr, -37.7, -35.1, 78, 65);
      }
      g.restore();
      if (b.alive === false || w.state === 'dead') {
        // dizzy stars
        for (let i = 0; i < 3; i++) {
          const a = this.time * 5 + i * TAU / 3;
          this.star(b.x + Math.cos(a) * 26, b.y - 34 + Math.sin(a) * 7, 6, '#ffe14d');
        }
      }
    }
    wing(px, py, len, ang, alpha, fill) {
      const g = this.ctx;
      g.save(); g.translate(px, py); g.rotate(ang); g.globalAlpha = alpha;
      g.fillStyle = fill || '#ffffff'; g.strokeStyle = '#6f8fb5'; g.lineWidth = 3; g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(0, 0);
      g.quadraticCurveTo(-len * 0.35, -len * 0.55, -len, -len * 0.35);
      for (let i = 0; i < 3; i++) {
        const x0 = -len + i * len * 0.22, x1 = x0 + len * 0.22;
        g.quadraticCurveTo((x0 + x1) / 2 - 2, -len * 0.1 + i * 3, x1, -len * 0.22 + i * len * 0.05);
      }
      g.quadraticCurveTo(-len * 0.2, len * 0.12, 0, 0);
      g.fill(); g.stroke();
      g.restore();
    }
    star(x, y, r, color) {
      const g = this.ctx;
      g.fillStyle = color; g.strokeStyle = '#b8860b'; g.lineWidth = 1.5;
      g.beginPath();
      for (let i = 0; i < 10; i++) {
        const rr = i % 2 ? r * 0.45 : r, a = -Math.PI / 2 + i * Math.PI / 5;
        g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      g.closePath(); g.fill(); g.stroke();
    }

    drawFx() {
      const g = this.ctx, A = FF.Assets;
      for (const f of this.fx) {
        if (f.life < 0) continue;
        const k = f.life / f.max;
        if (f.k === 'heart') {
          const spr = A.sprite('heart', 48, 48);
          let s = f.size * (k < 0.15 ? k / 0.15 : 1);
          if (k > 0.7) s *= 1 - (k - 0.7) / 0.3 * 0.6;            // shrink away instead of turning murky
          g.save(); g.globalAlpha = k > 0.9 ? clamp((1 - k) * 10, 0, 1) * 0.9 : 1;
          g.translate(f.x, f.y); g.rotate(f.rot);
          if (spr) g.drawImage(spr, -s / 2, -s / 2, s, s);
          g.restore();
        } else if (f.k === 'puff') {
          g.globalAlpha = 0.7 * (1 - k);
          g.fillStyle = f.color;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.6 + k * 0.8), 0, TAU); g.fill();
        } else if (f.k === 'spark') {
          g.globalAlpha = 1 - k;
          g.fillStyle = f.color;
          g.beginPath(); g.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'ring') {
          g.globalAlpha = 0.8 * (1 - k);
          g.strokeStyle = f.color; g.lineWidth = 4 * (1 - k) + 1;
          g.beginPath(); g.ellipse(f.x, f.y, 20 + k * 60, 8 + k * 22, 0, 0, TAU); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    drawTexts() {
      const g = this.ctx;
      for (const t of this.texts) {
        const k = t.life / t.max;
        const pop = k < 0.2 ? easeOutBack(k / 0.2) : 1;
        g.save(); g.globalAlpha = clamp(1.8 - k * 1.8, 0, 1);
        g.translate(t.x, t.y); g.scale(pop, pop);
        this.text(t.text, 0, 0, t.size, t.color, '#5a3416');
        g.restore();
      }
    }

    /* HUD in screen space (this.VW × this.VH), inside the safe-area insets; a little bigger on phones. */
    hud(mode) {
      const g = this.ctx, w = this.world, I = this.ins;
      const L = I.left, T = I.top, R = this.VW - I.right, cx = (L + R) / 2;
      const k = this.cssScale < 0.8 ? 1.25 : 1;
      if (!this._hudBtn) this._measureHud();
      // big score
      const bounce = this._lastScore !== w.score ? 1 : 0;
      if (bounce) { this._scorePop = 1; this._lastScore = w.score; }
      this._scorePop = Math.max(0, (this._scorePop || 0) - 0.06);
      const s = 1 + 0.25 * this._scorePop;
      // narrow screens (portrait): the score goes under the season pill / buttons row instead of between them
      const sy = T + (R - L < 700 ? 62 + 64 * k : 62);
      g.save(); g.translate(cx, sy); g.scale(s, s);
      this.text(String(w.score), 0, 0, 64, '#ffffff', '#5a3416', 'center', 10);
      g.restore();
      if (w.combo >= 2) this.text('Combo x' + w.combo, cx, sy + 50, 22, '#ffe14d', '#5a3416');

      // season pill (top-left)
      g.save(); g.translate(L, T); g.scale(k, k);
      const si = SEASON_INFO[w.season] || SEASON_INFO[0];
      const pps = this.pointsPerSeason;
      const prog = (w.score % pps) / pps;
      g.fillStyle = 'rgba(255,255,255,0.85)';
      this.roundRect(16, 16, 196, 46, 23); g.fill();
      g.lineWidth = 3; g.strokeStyle = si.color; g.stroke();
      const icon = FF.Assets.sprite(si.icon, 32, 32);
      if (icon) g.drawImage(icon, 24, 23, 32, 32);
      const lap = Math.floor((w.seasonIndex || 0) / 4);
      this.text(si.name + (lap > 0 ? ' · Lap ' + (lap + 1) : ''), 62, 32, 17, si.dark, null, 'left');
      g.fillStyle = 'rgba(0,0,0,0.1)'; this.roundRect(62, 45, 136, 8, 4); g.fill();
      g.fillStyle = si.color; this.roundRect(62, 45, Math.max(8, 136 * prog), 8, 4); g.fill();
      g.restore();
    }

    readyOverlay() {
      const g = this.ctx, w = this.world;
      const t = this.time, cx = this.VW / 2 - this.SX;   // centre of the visible screen, scene px
      const narrow = this.VW < 700, tall = this.SY > 150;
      // tall screens: title + prompt in the sky above the bird, the tip between the bird and the turtles
      const yT = tall ? 40 : 140, yP = tall ? 120 : 320, yTip = tall ? 316 : 362;
      this.text('Get Ready!', cx, yT, 58, '#ffd23f', '#5a3416', 'center', 10);
      // tap prompt
      const pulse = 1 + 0.06 * Math.sin(t * 6);
      g.save(); g.translate(cx, yP); g.scale(pulse, pulse);
      if (this.touch) {
        g.fillStyle = 'rgba(255,255,255,0.92)'; this.roundRect(-170, -27, 340, 54, 27); g.fill();
        this.text('Tap anywhere to flap!', 0, 1, 26, '#3a5a7a', null);
      } else {
        g.fillStyle = 'rgba(255,255,255,0.92)'; this.roundRect(-210, -24, 420, 48, 24); g.fill();
        this.text('Click, tap or press SPACE to flap', 0, 1, 20, '#3a5a7a', null);
      }
      g.restore();
      // tip (two lines on narrow portrait screens)
      g.fillStyle = 'rgba(40,60,90,0.55)';
      if (narrow) {
        this.roundRect(cx - 240, yTip, 480, 58, 20); g.fill();
        this.text('Every flap drops a treat —', cx, yTip + 17, 19, '#ffffff', null);
        this.text('land it on a turtle\'s shell!', cx, yTip + 41, 19, '#ffffff', null);
      } else {
        this.roundRect(cx - 260, yTip, 520, 36, 18); g.fill();
        this.text('Every flap drops a treat — land it on a turtle\'s shell!', cx, yTip + 18, 16, '#ffffff', null);
      }
      // tap ripple near bird
      const b = w.bird, rk = (t * 1.2) % 1;
      g.strokeStyle = `rgba(255,255,255,${(1 - rk).toFixed(3)})`; g.lineWidth = 3;
      g.beginPath(); g.arc(b.x, b.y, 40 + rk * 30, 0, TAU); g.stroke();
    }

    drawBanner() {
      const g = this.ctx, b = this.banner, si = SEASON_INFO[b.s];
      const t = b.t, VW = this.VW;
      let x;
      if (t < 0.45) x = lerp(-VW, 0, easeOutBack(t / 0.45));
      else if (t < 1.6) x = 0;
      else x = lerp(0, VW, Math.pow((t - 1.6) / 0.5, 2));
      g.save(); g.translate(x + VW / 2 - this.SX - W / 2, 0);   // centred on the visible screen
      g.fillStyle = si.color; g.globalAlpha = 0.92;
      g.beginPath(); g.moveTo(W / 2 - 240, 120); g.lineTo(W / 2 + 240, 112); g.lineTo(W / 2 + 258, 184); g.lineTo(W / 2 - 222, 194); g.closePath(); g.fill();
      g.globalAlpha = 1;
      const icon = FF.Assets.sprite(si.icon, 32, 32);
      if (icon) { g.drawImage(icon, W / 2 - 205, 130, 42, 42); g.drawImage(icon, W / 2 + 165, 124, 42, 42); }
      this.text(si.name + '!', W / 2, 152, 44, '#ffffff', si.dark, 'center', 9);
      g.restore();
    }

    debugDraw() {
      const g = this.ctx, w = this.world;
      g.strokeStyle = 'red'; g.lineWidth = 1;
      for (const t of w.turtles) { const b = w.shellBox(t); g.strokeRect(b.x, b.y, b.w, b.h); }
      g.beginPath(); g.arc(w.bird.x, w.bird.y, w.bird.radius || 20, 0, TAU); g.stroke();
      g.beginPath(); g.moveTo(-this.SX, w.groundY); g.lineTo(this.VW - this.SX, w.groundY); g.stroke();
      const cy = w.cfg.ceilingY || 0; g.strokeStyle = 'orange';
      g.beginPath(); g.moveTo(-this.SX, cy); g.lineTo(this.VW - this.SX, cy); g.stroke();
    }
  }
  Renderer.SEASON_INFO = SEASON_INFO;
  FF.Renderer = Renderer;
})(window.FF = window.FF || {});
