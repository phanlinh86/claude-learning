/* ZJB.Renderer — draws the world (logical 960×540 stage, y down) onto a full-window canvas.
 * The stage is fitted (contain) and centred; the backgrounds cover the letterbox.
 * Per biome three full-screen layers are pre-rendered once per size (pixel-exact, never stretched):
 *   back  = sky (cover) … far (drifting, tiled, drawn live) … floor + burrow backs
 *   front = burrow fronts + near foliage frame
 * Critters, stars, paws and Zippy are pre-rasterized sprites drawn between back and front.
 * Rendering is interpolated between fixed simulation steps (world.alpha). */
(function (ZJB) {
  'use strict';
  const LW = 960, LH = 540, HOME = { x: 480, y: 112 };
  const COL = [
    { fill: '#ff5d73', dark: '#a3223a', name: 'Coral', glow: 'rgba(255,93,115,' },
    { fill: '#ffc93c', dark: '#9a6608', name: 'Sunny', glow: 'rgba(255,201,60,' },
    { fill: '#3fa7ff', dark: '#14508f', name: 'Sky', glow: 'rgba(63,167,255,' },
    { fill: '#a46bff', dark: '#4f2596', name: 'Grape', glow: 'rgba(164,107,255,' }
  ];
  const ZONE_INFO = [
    { name: 'Riverbank Morning', sky: '#bfe6ee', ground: '#9fc27a', banner: '#2f5d3a', drift: 6 },
    { name: 'Bamboo Grove', sky: '#eef1c6', ground: '#b7b680', banner: '#4a5a1e', drift: 5 },
    { name: 'Treetop Canopy', sky: '#a9dcf0', ground: '#9cb67c', banner: '#24513c', drift: 8 },
    { name: 'Waterfall Ruins', sky: '#6a557f', ground: '#8f9582', banner: '#3a2f4e', drift: 0 }   // static: the spray must stay on the waterfall
  ];
  const P_ASPECT = { dragonfly: 32 / 48, leaf: 1, butterfly_0: 36 / 40, butterfly_1: 36 / 40, firefly: 1, mist: 96 / 256, sparkle: 1, drop: 24 / 16 };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.VW = LW; this.VH = LH;
      this.px = 1; this.maxPx = 0; this.cssScale = 1; this.k = 1; this.ox = 0; this.oy = 0;
      this.vis = { cur: -1, prev: -1, fade: 1 };
      this._bg = new Map();     // zone → { back, far, front, w, h }
      this._spr = { clear: () => { this._bg.clear(); ZJB.Assets._cache.clear(); } };
      this.texts = []; this.rings = []; this.flyers = [];
      this.shake = 0; this.flash = 0; this.time = 0; this.drift = 0;
      this.banner = null; this.warnTo = -1; this.colourPulse = 0; this.leafPulse = 0; this.scorePulse = 0;
      this.portrait = false;
    }

    // ---------- layout ----------
    resize(insets) {
      if (insets) this.insets = insets;
      const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
      let px = window.devicePixelRatio || 1;
      // cap the backing store at ~1920×1080 worth of pixels; CSS upscales the rest
      const cap = Math.sqrt((1920 * 1080) / (W * H));
      px = Math.min(px, Math.max(1, cap));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = px;
      const bw = Math.round(W * px), bh = Math.round(H * px);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
      this.W = W; this.H = H; this.portrait = H > W * 1.05;
      this.cssScale = Math.min(W / LW, H / LH);
      // device px per logical px, rounded to 1/64 so cached layers stay pixel-exact
      this.k = Math.floor(this.cssScale * px * 64) / 64;
      this.ox = Math.floor((bw - LW * this.k) / 2); this.oy = Math.round((bh - LH * this.k) / 2);
      // portrait phones/tablets: keep the stage nearer the bottom thumb area but leave sky above
      if (this.portrait) this.oy = Math.round((bh - LH * this.k) * 0.55);
      ZJB.Assets.setScale(this.k);
      this._bg.clear();
      if (this.vis.cur >= 0) this._layers(this.vis.cur);
    }
    toLogical(cx, cy) {
      const r = this.canvas.getBoundingClientRect();
      const dx = (cx - r.left) * (this.canvas.width / r.width), dy = (cy - r.top) * (this.canvas.height / r.height);
      return [(dx - this.ox) / this.k, (dy - this.oy) / this.k];
    }
    _measureHud() {}
    /* logical y offset that moves the HUD band from the stage top to the screen top (tall screens), below the notch */
    hudDy() { const top = ((this.insets && this.insets.top) || 0) * this.px; return -Math.max(0, this.oy - top) / this.k; }

    attach(world, weather) { this.world = world; this.weather = weather; this.texts.length = 0; this.rings.length = 0; this.flyers.length = 0; this.warnTo = -1; this.banner = null; }
    setLevel(zone, instant) {
      zone = ((zone % 4) + 4) % 4;
      if (zone === this.vis.cur) return;
      this.vis.prev = instant ? -1 : this.vis.cur; this.vis.cur = zone; this.vis.fade = instant || this.vis.prev < 0 ? 1 : 0;
      this._layers(zone);
      for (const z of [...this._bg.keys()]) if (z !== zone && z !== this.vis.prev) this._bg.delete(z);
      this.prewarm((zone + 1) % 4);
    }
    showBanner(zone) { this.banner = { text: ZONE_INFO[zone % 4].name, t: 0, zone: zone % 4, sub: this.world && this.world.loop ? 'Round ' + (this.world.loop + 1) : '' }; }
    /* Pre-render the next biome in idle time so a level change never rasterizes on the transition frame. */
    prewarm(zone) {
      if (this._bg.has(zone) || this._warming === zone) return;
      this._warming = zone;
      const ric = window.requestIdleCallback || (f => setTimeout(f, 200));
      ric(() => { this._warming = -1; if (ZJB.Assets.restDone || zone === 0) this._layers(zone); }, { timeout: 1500 });
    }

    // ---------- pre-rendered biome layers ----------
    _layers(zone) {
      let L = this._bg.get(zone);
      if (L && L.w === this.canvas.width && L.h === this.canvas.height && L.k === this.k && L.ver === ZJB.Assets._ver) return L;
      const A = ZJB.Assets, n = A.SEASONS[zone], k = this.k, bw = this.canvas.width, bh = this.canvas.height;
      const info = ZONE_INFO[zone], ox = this.ox, oy = this.oy;
      const custom = A.custom['bg_' + n];
      const back = mk(bw, bh), bg = back.getContext('2d');
      bg.imageSmoothingQuality = 'high';
      // sky: cover the whole canvas
      const sky = custom || A.img[n + '_sky'];
      if (sky) {
        const sw = sky.naturalWidth || sky.width || LW, sh = sky.naturalHeight || sky.height || LH;
        const sc = Math.max(bw / sw, bh / sh);
        bg.drawImage(sky, (bw - sw * sc) / 2, (bh - sh * sc) / 2, sw * sc, sh * sc);
        if (custom) { bg.fillStyle = 'rgba(255,255,255,.18)'; bg.fillRect(0, 0, bw, bh); }
      } else { bg.fillStyle = info.sky; bg.fillRect(0, 0, bw, bh); }
      // far layer: one 1920-wide tile at logical scale (drawn live so it can drift)
      let far = null;
      if (!custom && A.img[n + '_far']) {
        far = mk(1920 * k, LH * k);
        far.getContext('2d').drawImage(A.img[n + '_far'], 0, 0, far.width, far.height);
      }
      const floorC = mk(bw, bh), fg = floorC.getContext('2d');
      if (!custom) {
        const fl = A.img[n + '_floor'];
        // ground colour under the stage (portrait / tall screens)
        fg.fillStyle = info.ground; fg.fillRect(0, oy + (LH - 2) * k, bw, bh);
        if (fl) {
          const tw = 1920 * k, x0 = ox + (480 - 960) * k;   // stage x480 = file x960
          for (let x = x0 - Math.ceil((x0 + 1) / tw) * tw; x < bw; x += tw) {
            fg.drawImage(fl, Math.round(x), oy, Math.round(tw), Math.round(LH * k));
            // tall screens: repeat the floor's lower band (file y 380–540) downward so there is no flat band or streaks
            for (let y = oy + (LH - 1) * k; y < bh; y += 160 * k - 1) fg.drawImage(fl, 0, 380, 1920, 160, Math.round(x), Math.round(y), Math.round(tw), Math.round(160 * k));
          }
        }
      }
      const layout = ZJB.World.LAYOUTS[zone];
      const front = mk(bw, bh), frg = front.getContext('2d');
      const bb = A.img[n + '_burrow_back'], bf = A.img[n + '_burrow_front'];
      for (const h of layout) {
        const w = 170 * h.s * k, hh = 90 * h.s * k, x = ox + h.x * k - w / 2, y = oy + h.y * k - hh / 2;
        if (custom) {   // soft shadow so burrows sit on a photo
          fg.fillStyle = 'rgba(30,40,20,.28)'; fg.beginPath(); fg.ellipse(ox + h.x * k, oy + (h.y + 14 * h.s) * k, 82 * h.s * k, 30 * h.s * k, 0, 0, Math.PI * 2); fg.fill();
        }
        if (bb) fg.drawImage(bb, x, y, w, hh);
      }   // the burrow fronts are drawn per hole right after its critter (so a back-row lip never covers a front-row face)
      const nr = !custom && A.img[n + '_near'];
      if (nr) {
        // each quarter of the foliage frame hugs its own screen corner (wide phones, tall iPads); the gaps between
        // quarters are bridged by stretching the frame's middle row / column, so vines and stalks run on unbroken
        const hw = LW / 2, hh = LH / 2, qw = hw * k, qh = hh * k;
        const xl = ox > 2 ? 0 : ox, xr = ox > 2 ? bw - qw : ox + qw, yt = oy > 2 ? 0 : oy, yb = oy > 2 ? bh - qh : oy + qh;
        frg.drawImage(nr, 0, 0, hw, hh, xl, yt, qw, qh); frg.drawImage(nr, hw, 0, hw, hh, xr, yt, qw, qh);
        frg.drawImage(nr, 0, hh, hw, hh, xl, yb, qw, qh); frg.drawImage(nr, hw, hh, hw, hh, xr, yb, qw, qh);
        if (yb > yt + qh + 1) { frg.drawImage(nr, 0, hh - 1, hw, 2, xl, yt + qh - 1, qw, yb - yt - qh + 2); frg.drawImage(nr, hw, hh - 1, hw, 2, xr, yt + qh - 1, qw, yb - yt - qh + 2); }
        if (xr > xl + qw + 1) { frg.drawImage(nr, hw - 1, 0, 2, hh, xl + qw - 1, yt, xr - xl - qw + 2, qh); frg.drawImage(nr, hw - 1, hh, 2, hh, xl + qw - 1, yb, xr - xl - qw + 2, qh); }
      }
      // compose sky + floor into one canvas when the far layer is static (one fewer full-screen draw)
      L = { back, far, floor: floorC, front, w: bw, h: bh, k, ver: A._ver, zone };
      if (!far || !info.drift) {
        if (far) {
          let x = ox + (480 - 960) * k; while (x > 0) x -= far.width;
          for (; x < bw; x += far.width) { bg.drawImage(far, Math.round(x), oy); if (oy > 0) bg.drawImage(far, 0, 0, far.width, 1, Math.round(x), 0, far.width, oy + 1); }
        }
        bg.drawImage(floorC, 0, 0); L.far = null; L.floor = null;
      }
      this._bg.set(zone, L);
      return L;
    }
    _drawBack(L, alpha) {
      const g = this.g;
      g.globalAlpha = alpha;
      g.drawImage(L.back, 0, 0);
      if (L.far) {
        const tw = L.far.width, off = ((this.drift * this.k) % tw + tw) % tw;
        let x = Math.round(this.ox + (480 - 960) * this.k - off);
        while (x > 0) x -= tw;
        for (; x < L.w; x += tw) { g.drawImage(L.far, x, this.oy); if (this.oy > 0) g.drawImage(L.far, 0, 0, tw, 1, x, 0, tw, this.oy + 1); }
      }
      if (L.floor) g.drawImage(L.floor, 0, 0);
      g.globalAlpha = 1;
    }

    // ---------- events → juice ----------
    onEvents(evts) {
      const w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'boop': {
            this.rings.push({ x: e.x, y: e.y, t: 0, col: COL[e.colour].fill, max: 0.45 });
            this.texts.push({ x: e.x, y: Math.max(96, e.y - 175), t: 0, text: '+' + e.points, col: COL[e.colour].fill, size: e.mult > 1 ? 34 : 28, sub: e.mult > 1 ? '×' + e.mult : '' });
            if (this.weather) this.weather.burst('sparkle', e.x, e.y);
            this.flyers.push({ x: e.x, y: e.y, t: 0, colour: e.colour });   // star flies to the target badge
            this.scorePulse = 1;
            break;
          }
          case 'wrong': this.texts.push({ x: e.x, y: e.y - 115, t: 0, text: 'Oops!', col: '#ffffff', size: 28 }); this.shake = 0.25; break;
          case 'empty': this.rings.push({ x: e.x, y: e.y, t: 0, col: 'rgba(255,255,255,.8)', max: 0.3, small: true }); break;
          case 'miss': break;
          case 'leafLost': this.leafPulse = -1; break;
          case 'leafGained': this.leafPulse = 1; this.texts.push({ x: 300, y: 80, t: 0, text: '+1 🍃', col: '#63d449', size: 24 }); break;
          case 'colourWarn': this.warnTo = e.to; break;
          case 'colour': this.warnTo = -1; this.colourPulse = 1; this.texts.push({ x: 480, y: 168, t: 0, text: 'New colour!', col: COL[e.to].fill, size: 30, big: true }); break;
          case 'combo': this.texts.push({ x: 480, y: 172, t: 0, text: 'Combo ' + e.n + '!', col: '#fff6c8', size: 32, big: true }); break;
          case 'levelClear': this.flash = 0.6; this.texts.push({ x: 480, y: 150, t: 0, text: 'Biome cleared! +' + e.bonus, col: '#fff6c8', size: 36, big: true, life: 1.6 }); break;
          case 'levelUp': this.showBanner(e.zone); this.warnTo = -1; break;
          case 'gameOver': this.shake = 0.15; break;
          case 'nap': this.texts.push({ x: 480, y: 172, t: 0, text: 'Zzz… look for the stars!', col: '#ffffff', size: 26, big: true, life: 1.6 }); break;
        }
      }
      if (this.texts.length > 14) this.texts.splice(0, this.texts.length - 14);
      if (this.rings.length > 12) this.rings.splice(0, this.rings.length - 12);
    }

    update(dt) {
      this.time += dt;
      this.drift += dt * ZONE_INFO[Math.max(0, this.vis.cur)].drift;
      if (this.vis.fade < 1) this.vis.fade = Math.min(1, this.vis.fade + dt / 0.9);
      for (const t of this.texts) t.t += dt;
      for (const r of this.rings) r.t += dt;
      for (const f of this.flyers) f.t += dt;
      this.texts = this.texts.filter(t => t.t < (t.life || (t.big ? 1.3 : 0.9)));
      this.rings = this.rings.filter(r => r.t < r.max);
      this.flyers = this.flyers.filter(f => f.t < 0.45);
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt);
      this.colourPulse = Math.max(0, this.colourPulse - dt * 1.5);
      this.scorePulse = Math.max(0, this.scorePulse - dt * 4);
      if (this.leafPulse) this.leafPulse = this.leafPulse > 0 ? Math.max(0, this.leafPulse - dt * 2) : Math.min(0, this.leafPulse + dt * 2);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.0) this.banner = null; }
    }

    // ---------- drawing ----------
    draw(mode) {
      const g = this.g, w = this.world;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      const cur = this._layers(Math.max(0, this.vis.cur));
      this._drawBack(cur, 1);
      const prev = this.vis.fade < 1 && this.vis.prev >= 0 ? this._bg.get(this.vis.prev) : null;
      if (prev) this._drawBack(prev, 1 - this.vis.fade);
      // stage transform (with a little shake)
      let sx = 0, sy = 0;
      if (this.shake > 0) { const a = this.shake * 24; sx = Math.sin(this.time * 70) * a; sy = Math.cos(this.time * 53) * a * 0.6; }
      const T = () => g.setTransform(this.k, 0, 0, this.k, this.ox + sx * this.k, this.oy + sy * this.k);
      T();
      if (w) {
        this._particles('back');
        this._critters(w);
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(cur.front, Math.round(sx * this.k), Math.round(sy * this.k));
      if (prev) { g.globalAlpha = 1 - this.vis.fade; g.drawImage(prev.front, 0, 0); g.globalAlpha = 1; }
      T();
      if (w) {
        this._particles('front');
        this._zippy(w);
        this._fx();
        if (mode !== 'title') { g.translate(0, this.hudDy()); this._hud(w); g.translate(0, -this.hudDy()); }
        this._banner();
        if (ZJB.Game && ZJB.Game.debugView) this._debug(w);
      }
      if (this.flash > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(255,255,230,' + (this.flash * 0.5).toFixed(3) + ')'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    }

    _sprite(key, w, h) { return ZJB.Assets.sprite(key, w, h); }
    _img(key, x, y, w, h) { const s = this._sprite(key, w, h); if (s) this.g.drawImage(s, x, y, w, h); return !!s; }

    _particles(layer) {
      const wx = this.weather; if (!wx) return;
      const g = this.g;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const asp = P_ASPECT[p.sprite] || 1, w = p.size, h = p.size * asp;
        const s = this._sprite('p_' + p.sprite, Math.max(4, Math.round(w)), Math.max(4, Math.round(h)));
        if (!s) continue;
        g.save(); g.globalAlpha = clamp(p.alpha, 0, 1);
        g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
        g.drawImage(s, -w / 2, -h / 2, w, h);
        g.restore();
      }
    }

    _critters(w) {
      const g = this.g, A = ZJB.Assets, a = w.alpha || 0, easy = w.difficulty === 'easy';
      const okColour = c => c === w.colour || c === w.graceColour;
      const customC = A.custom.critter;
      for (const hole of w.holes) {
        this._critter(w, hole, a, easy, okColour, customC);
        this._img(A.SEASONS[w.zone % 4] + '_burrow_front', hole.x - 85 * hole.s, hole.y - 45 * hole.s, 170 * hole.s, 90 * hole.s);
      }
    }
    _critter(w, hole, a, easy, okColour, customC) {
      const g = this.g, A = ZJB.Assets;
      {
        const c = hole.critter; if (!c) return;
        const s = hole.s, h = lerp(c.hPrev == null ? c.h : c.hPrev, c.h, a);
        if (h <= 0.01) return;
        const bottom = hole.y + 25 * s + (1 - h) * 140 * s;
        const cw = 140 * s, ch = 150 * s, x0 = hole.x - cw / 2, y0 = bottom - ch;
        // squash/stretch: a happy wobble when booped, a pop stretch while rising
        let sqx = 1, sqy = 1;
        if (c.state === 'booped') { const t = c.t || 0, e = Math.exp(-t * 7) * Math.cos(t * 26); sqx = 1 + 0.12 * e; sqy = 1 - 0.12 * e; }
        else if (c.state === 'wow') { const t = c.t || 0; sqx = 1 + 0.04 * Math.sin(t * 40) * Math.exp(-t * 6); }
        g.save();
        g.beginPath(); g.rect(hole.x - 120 * s, hole.y - 260 * s, 240 * s, 264 * s); g.clip();
        g.translate(hole.x, bottom); g.scale(sqx, sqy); g.translate(-hole.x, -bottom);
        const face = c.state === 'booped' ? 'happy' : c.state === 'wow' ? 'wow' : 'up';
        // Easy: a soft halo behind friends who hold Zippy's colour
        if (easy && okColour(c.colour) && (c.state === 'rise' || c.state === 'up')) {
          const pr = 0.5 + 0.5 * Math.sin(this.time * 6);
          const gr = g.createRadialGradient(hole.x, y0 + 80 * s, 10 * s, hole.x, y0 + 80 * s, 92 * s);
          gr.addColorStop(0, COL[c.colour].glow + (0.38 + pr * 0.2) + ')'); gr.addColorStop(1, COL[c.colour].glow + '0)');
          g.fillStyle = gr; g.fillRect(hole.x - 95 * s, y0 - 15 * s, 190 * s, 190 * s);
        }
        if (customC) {
          const [fw, fh] = A.fit('critter', 120 * s, 120 * s);
          this._img('custom:critter', hole.x - fw / 2, bottom - 18 * s - fh, fw, fh);
        } else this._img(c.kind + '_' + face, x0, y0, cw, ch);
        if (c.state !== 'booped') {   // the star is handed over on a boop (it flies to the badge)
          const ss = 68 * s, scx = hole.x, scy = y0 + 96 * s - 2 * s;
          const wig = c.state === 'up' || c.state === 'rise' ? Math.sin(this.time * 5 + c.id) * 0.06 : 0;
          g.save(); g.translate(scx, scy); g.rotate(wig);
          this._img('star_' + c.colour, -ss / 2, -ss / 2 - 2 * s, ss, ss);
          g.restore();
          if (!customC) this._img(c.kind + '_paws', x0, y0, cw, ch);
        }
        g.restore();
      }
    }

    _zippy(w) {
      const g = this.g, z = w.zippy, a = w.alpha || 0, A = ZJB.Assets;
      const x = lerp(z.px, z.x, a), y = lerp(z.py, z.y, a);
      const colour = this.warnTo >= 0 && (Math.floor(this.time * 3) % 2) ? this.warnTo : w.colour;
      const C = COL[colour] || COL[0];
      const st = z.state;
      const sp = Math.hypot(z.vx || 0, z.vy || 0);
      const W = 120, H = 105, sc = W / 160;
      g.save();
      g.translate(x, y);
      // shadow-ish glow behind him in his colour
      const pulse = 1 + this.colourPulse * 0.6;
      const gr = g.createRadialGradient(0, 0, 10, 0, 0, 78 * pulse);
      gr.addColorStop(0, C.glow + (0.42 + this.colourPulse * 0.3) + ')'); gr.addColorStop(1, C.glow + '0)');
      g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 80 * pulse, 0, Math.PI * 2); g.fill();
      g.rotate(z.tilt || 0);
      if (z.face < 0) g.scale(-1, 1);
      let sqx = 1, sqy = 1;
      if (st === 'boop') { const t = clamp((z.t || 0) / 0.18, 0, 1), e = Math.sin(t * Math.PI); sqx = 1 + 0.18 * e; sqy = 1 - 0.18 * e; }
      else if (st === 'fly') { sqx = 1.06; sqy = 0.95; }
      else if (st === 'dizzy') { g.rotate(Math.sin(this.time * 18) * 0.12); }
      g.scale(sqx, sqy);
      // jetpack flame at the nozzle (34,104) → relative to body centre (80,82)
      const nx = (34 - 80) * sc, ny = (104 - 82) * sc;
      const flick = 0.85 + 0.15 * Math.sin(this.time * 47) + 0.1 * Math.sin(this.time * 31);
      const len = (st === 'fly' ? 34 : st === 'return' ? 22 : 13 + Math.min(10, sp * 0.02)) * flick;
      g.save(); g.translate(nx, ny); g.rotate(0.35);   // nozzle points down-left (20° off vertical)
      const fgr = g.createLinearGradient(0, 0, 0, len);
      fgr.addColorStop(0, '#ffffff'); fgr.addColorStop(0.35, C.fill); fgr.addColorStop(1, C.glow + '0)');
      g.fillStyle = fgr; g.beginPath();
      g.moveTo(-6, 0); g.quadraticCurveTo(-7, len * 0.55, 0, len); g.quadraticCurveTo(7, len * 0.55, 6, 0); g.closePath(); g.fill();
      g.restore();
      const key = st === 'fly' ? 'zippy_fly' : st === 'boop' ? 'zippy_boop' : st === 'dizzy' ? 'zippy_dizzy' : 'zippy_idle';
      if (A.custom.hero) {
        const [fw, fh] = A.fit('hero', 100, 100);
        g.strokeStyle = C.fill; g.lineWidth = 7; g.beginPath(); g.arc(0, 0, Math.max(fw, fh) / 2 + 6, 0, Math.PI * 2); g.stroke();
        this._img('custom:hero', -fw / 2, -fh / 2, fw, fh);
        this._img('star_' + colour, Math.max(fw, fh) / 2 - 16, -Math.max(fw, fh) / 2 - 10, 30, 30);
      } else this._img(key, -80 * sc, -82 * sc, W, H);
      // antenna bulbs glow in the current colour
      if (!A.custom.hero) {
        for (const [ax, ay, r] of [[114, 20, 5.6], [132, 30, 5]]) {
          const bx = (ax - 80) * sc, by = (ay - 82) * sc;
          g.fillStyle = C.fill; g.beginPath(); g.arc(bx, by, r * sc * 1.15, 0, Math.PI * 2); g.fill();
          g.fillStyle = C.glow + '0.35)'; g.beginPath(); g.arc(bx, by, r * sc * 2.6, 0, Math.PI * 2); g.fill();
          g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(bx - 1.2, by - 1.2, r * sc * 0.4, 0, Math.PI * 2); g.fill();
        }
      }
      g.restore();
    }

    _fx() {
      const g = this.g;
      for (const r of this.rings) {
        const t = r.t / r.max;
        g.strokeStyle = r.col; g.globalAlpha = 1 - t; g.lineWidth = (r.small ? 3 : 6) * (1 - t) + 1;
        g.beginPath(); g.arc(r.x, r.y, (r.small ? 14 : 26) + t * (r.small ? 22 : 60), 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
      // stars flying from the critter to the target badge
      for (const f of this.flyers) {
        const t = clamp(f.t / 0.45, 0, 1), e = t * t * (3 - 2 * t);
        const x = lerp(f.x, 480, e), y = lerp(f.y, 38 + this.hudDy(), e) - Math.sin(t * Math.PI) * 60, s = lerp(46, 26, e);
        g.globalAlpha = 1 - t * 0.4;
        this._img('star_' + f.colour, x - s / 2, y - s / 2, s, s);
      }
      g.globalAlpha = 1;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const life = t.life || (t.big ? 1.3 : 0.9), p = t.t / life;
        const y = t.y - (t.big ? 10 : 46) * Math.min(1, p * 1.6);
        const pop = t.t < 0.12 ? 0.6 + 0.4 * (t.t / 0.12) * 1.15 : 1;
        g.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
        g.font = '900 ' + Math.round(t.size * pop) + 'px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
        g.lineWidth = 7; g.strokeStyle = 'rgba(40,30,50,.75)'; g.strokeText(t.text, t.x, y);
        g.fillStyle = t.col; g.fillText(t.text, t.x, y);
        if (t.sub) { g.font = '900 20px system-ui, sans-serif'; g.lineWidth = 5; g.strokeText(t.sub, t.x + 44, y - 16); g.fillStyle = '#fff6c8'; g.fillText(t.sub, t.x + 44, y - 16); }
      }
      g.globalAlpha = 1;
    }

    _pill(x, y, w, h) {
      const g = this.g, r = h / 2;
      g.fillStyle = 'rgba(28,44,30,.55)'; g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.stroke();
    }
    _hud(w) {
      const g = this.g;
      // score (top-left)
      this._pill(14, 12, 172, 48);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      const sp = 1 + this.scorePulse * 0.12;
      g.save(); g.translate(30, 37); g.scale(sp, sp);
      g.font = '900 30px "Baloo 2", "Trebuchet MS", system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(String(w.score), 0, 0);
      g.restore();
      if (w.mult > 1) { g.font = '900 20px system-ui, sans-serif'; g.fillStyle = '#ffe27a'; g.textAlign = 'right'; g.fillText('×' + w.mult, 176, 37); }
      // leaves (lives)
      const n = w.maxLeaves || 5, lp = this.leafPulse;
      for (let i = 0; i < n; i++) {
        const full = i < w.leaves, s = 30 + (full && i === w.leaves - 1 && lp > 0 ? lp * 10 : 0);
        const x = 200 + i * 33, y = 36;
        if (!full && i >= Math.max(3, w.leaves + (lp < 0 ? 1 : 0))) continue;   // only show empty slots up to 3 (or the one just lost)
        let dx = 0; if (lp < 0 && i === w.leaves) dx = Math.sin(this.time * 60) * 4 * -lp;
        this._img(full ? 'leaf' : 'leaf_empty', x - s / 2 + dx + 15, y - s / 2, s, s);
      }
      // target badge (top-centre): Zippy's colour, with the biome progress as a ring
      const C = COL[w.colour] || COL[0], cx = 480, cy = 38, R = 30 + this.colourPulse * 6;
      g.fillStyle = 'rgba(28,44,30,.6)'; g.beginPath(); g.arc(cx, cy, R + 3, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.stroke();
      const prog = clamp((w.levelBoops || 0) / (w.levelGoal || 15), 0, 1);
      if (prog > 0) { g.strokeStyle = '#8ef07a'; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, R - 2, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.stroke(); g.lineCap = 'butt'; }
      const warn = this.warnTo >= 0 && Math.floor(this.time * 3) % 2;
      const sc = 44 * (1 + this.colourPulse * 0.25);
      this._img('star_' + (warn ? this.warnTo : w.colour), cx - sc / 2, cy - sc / 2 - 1, sc, sc);
      void C;
    }

    _banner() {
      const b = this.banner; if (!b) return;
      const g = this.g, t = b.t;
      const a = t < 0.3 ? t / 0.3 : t > 1.5 ? Math.max(0, 1 - (t - 1.5) / 0.5) : 1;
      if (a <= 0) return;
      const y = 150 - (t < 0.3 ? (1 - t / 0.3) * 16 : 0);
      const text = b.text + (b.sub ? ' · ' + b.sub : '');
      g.globalAlpha = a;
      g.font = '900 38px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
      const tw = g.measureText(text).width;
      this._pill(480 - tw / 2 - 26, y - 28, tw + 52, 56);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.lineWidth = 6; g.strokeStyle = ZONE_INFO[b.zone].banner; g.strokeText(text, 480, y + 1);
      g.fillStyle = '#fffbe6'; g.fillText(text, 480, y + 1);
      g.globalAlpha = 1;
    }

    _debug(w) {
      const g = this.g;
      g.lineWidth = 2;
      w.holes.forEach((h, i) => {
        g.strokeStyle = 'rgba(255,0,255,.8)'; g.beginPath(); g.arc(h.x, h.y - 45 * h.s, 88 * h.s, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#f0f'; g.font = '700 16px monospace'; g.fillText(String(i + 1), h.x, h.y - 45 * h.s);
      });
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.COL = COL;
  ZJB.Renderer = Renderer;
})(window.ZJB = window.ZJB || {});
