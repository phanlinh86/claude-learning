/* BKF.Renderer — draws Biscuit's Kitchen Flight on a canvas.
 * The 960×540 logical stage is fitted with "contain"; the letterbox is filled by drawing the tileable
 * kitchen layers wider, so obstacles can be seen sliding in on wide phones.
 * Order: outside → outside particles → wall (transparent windows) → curtains/frost → room particles → rail
 *        → hangers → stacks/kettles → leaves → Biscuit → counter → darkness + lamp → tint → front particles
 *        → juice → HUD → banner.  Rendering is interpolated between fixed simulation steps (w.alpha). */
(function (BKF) {
  'use strict';
  const LW = 960, LH = 540, COUNTER_Y = 470, RAIL_Y = 40;
  const TAU = Math.PI * 2;
  const ZONE_INFO = [
    { key: 'sunny', name: 'Sunny Morning', tint: '#ffe3a3', tintA: 0.06, banner: '#f2b33d', wall: '#e8d7a2' },
    { key: 'rainy', name: 'Rainy Noon', tint: '#8a9bb0', tintA: 0.14, banner: '#5c8db8', wall: '#e8d7a2' },
    { key: 'windy', name: 'Windy Sunset', tint: '#ff9a5c', tintA: 0.18, banner: '#e8704a', wall: '#e8d7a2' },
    { key: 'snowy', name: 'Snowy Night', tint: '#3a4e8c', tintA: 0.22, banner: '#6f7fd6', wall: '#e8d7a2' }
  ];
  // windows in room/wall.svg (1200 wide tile): curtain pivots and opening corners
  const CURTAINS = [98, 502, 698, 1102];
  const OPENINGS = [[110, 490], [710, 1090]], WIN_Y0 = 120, WIN_Y1 = 390;
  const PART_AR = { raindrop: 3, wind: 16 / 120 };   // height / width for non-square particles
  const PAR = { outside: 0.08, wall: 0.35, counter: 1 };

  function hexRgb(h) { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  function mix(a, b, t) { const A = hexRgb(a), B = hexRgb(b); return 'rgb(' + A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',') + ')'; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function mod(a, n) { return ((a % n) + n) % n; }

  class Renderer {
    constructor(canvas) {
      this.c = canvas; this.g = canvas.getContext('2d', { alpha: false });
      this.px = 1; this.cssScale = 1; this.maxPx = 0;
      this.VW = LW; this.VH = LH; this.ox = 0; this.oy = 0;
      this.vis = { cur: 0, prev: -1, k: 1 };
      this.texts = []; this.rings = []; this.flyers = [];
      this.shake = 0; this.flash = 0; this.banner = null; this.t = 0;
      this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
      this._spr = { clear: () => BKF.Assets._cache.clear() };
      this.dk = document.createElement('canvas'); this.dg = this.dk.getContext('2d');
      this.custom = null;
    }
    static get ZONE_INFO() { return ZONE_INFO; }

    resize(insets) {
      if (insets) this.insets = insets;
      const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight), dpr = window.devicePixelRatio || 1;
      this.cssScale = Math.min(W / LW, H / LH);
      let px = this.cssScale * dpr;
      const cap = Math.sqrt((1920 * 1080) / (W * H * dpr * dpr));   // backing store ≈ ≤ 1920×1080 device px
      if (cap < 1) px *= cap;
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = px;
      this.VW = W / this.cssScale; this.VH = H / this.cssScale;
      this.ox = (this.VW - LW) / 2; this.oy = (this.VH - LH) / 2;
      this.c.width = Math.round(this.VW * px); this.c.height = Math.round(this.VH * px);
      this.c.style.width = W + 'px'; this.c.style.height = H + 'px';
      this.portrait = H > W;
      this.dk.width = Math.max(1, Math.round(this.VW / 2)); this.dk.height = Math.max(1, Math.round(this.VH / 2));
      BKF.Assets.setScale(px);
      this._bgCache = {};
      this._measureHud();
      this.prewarm(this.vis.cur);
    }
    _measureHud() {
      const k = 1 / this.cssScale, i = this.insets || {};
      this.safe = { l: (i.left || 0) * k, r: (i.right || 0) * k, t: (i.top || 0) * k, b: (i.bottom || 0) * k };
    }
    toLogical(cx, cy) { return [cx / this.cssScale - this.ox, cy / this.cssScale - this.oy]; }

    attach(world, weather) { this.world = world; this.weather = weather; this.texts.length = 0; this.rings.length = 0; this.flyers.length = 0; this.shake = 0; this.flash = 0; }
    setLevel(zone, instant) {
      zone = mod(zone, 4);
      if (instant || zone === this.vis.cur) { this.vis = { cur: zone, prev: -1, k: 1 }; }
      else this.vis = { cur: zone, prev: this.vis.cur, k: 0 };
      this.prewarm(zone); this.prewarm((zone + 1) % 4);
    }
    showBanner(zone) { this.banner = { text: ZONE_INFO[mod(zone, 4)].name, t: 0, zone: mod(zone, 4), sub: (this.world && this.world.loop > 0) ? 'Day ' + (this.world.loop + 1) : '' }; }

    /* Background layers rasterized pixel-exact at the current scale, in idle time where possible. */
    _layer(key, w, h) {
      const ck = key + '@' + this.px.toFixed(4);
      let c = this._bgCache[ck];
      if (c) return c;
      let src = BKF.Assets.img[key];
      if (!src) return null;
      c = document.createElement('canvas');
      c.width = Math.round(w * this.px); c.height = Math.round(h * this.px);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      this._bgCache[ck] = c;
      return c;
    }
    prewarm(zone) {
      const go = () => { this._layer('outside_' + ZONE_INFO[zone].key, 960, 540); this._layer('room_wall', 1200, 540); this._layer('room_counter', 600, 70); };
      const ric = window.requestIdleCallback || (f => setTimeout(f, 30));
      ric(go, { timeout: 400 });
    }
    _customWall() {
      const A = BKF.Assets, src = A.custom.wall;
      if (!src) return null;
      const ck = 'cw@' + this.px.toFixed(4) + '|' + this.VW.toFixed(1) + '|' + this.VH.toFixed(1) + '|' + (A._ver || 0);
      if (this._bgCache[ck]) return this._bgCache[ck];
      const c = document.createElement('canvas'); c.width = this.c.width; c.height = this.c.height;
      const g = c.getContext('2d'), k = Math.max(c.width / src.width, c.height / src.height);
      g.drawImage(src, (c.width - src.width * k) / 2, (c.height - src.height * k) / 2, src.width * k, src.height * k);
      this._bgCache[ck] = c;
      return c;
    }

    onEvents(evts) {
      const wx = this.weather, w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'flap': this.rings.push({ x: e.x - 8, y: e.y - 52, r: 10, t: 0, life: 0.3, col: '255,255,255', w: 3 }); break;
          case 'leaf':
            if (wx) { wx.burst('sparkle', e.x, e.y, 7); wx.burst('bit', e.x, e.y, 4); }
            this.texts.push({ x: e.x, y: e.y - 26, text: '+1', t: 0, life: 0.8, col: '#3fae4a', size: 30 });
            this.rings.push({ x: e.x, y: e.y, r: 16, t: 0, life: 0.35, col: '255,236,140', w: 4 });
            this.flyers.push({ x: e.x, y: e.y, sprite: e.sprite, t: 0, life: 0.55 });
            break;
          case 'pass': break;
          case 'bump': case 'counter':
            if (e.type === 'counter' && e.cost === false) break;
            this.shake = 0.28; this.flash = 0.18;
            if (wx) wx.burst('dust', e.x, e.y, 8);
            this.texts.push({ x: e.x, y: e.y - 40, text: e.type === 'counter' ? 'Boing!' : 'Bonk!', t: 0, life: 0.9, col: '#e5483c', size: 32 });
            break;
          case 'battery': this.texts.push({ x: w.pup.x, y: w.pup.y - 70, text: 'Battery +1!', t: 0, life: 1.3, col: '#2f9e44', size: 30 }); break;
          case 'steam': break;
          case 'gustWarn': this.gustWarn = { dir: e.dir, t: 0 }; break;
          case 'gust': if (wx) wx.gust(e.dir); break;
          case 'gustEnd': if (wx) wx.calm(); this.gustWarn = null; break;
          case 'levelUp': this.showBanner(e.zone); if (e.clean && !e.skip) this.texts.push({ x: 480, y: 210, text: 'No bumps! +5', t: 0, life: 1.8, col: '#f2b33d', size: 38 }); break;
          case 'down': this.texts.push({ x: w.pup.x, y: w.pup.y - 70, text: 'Zzz…', t: 0, life: 1.6, col: '#6f7fd6', size: 32 }); break;
        }
      }
    }

    update(dt) {
      this.t += dt;
      const w = this.world, wx = this.weather;
      if (wx && w) wx.update(dt, w.scrollSpeed);
      if (this.vis.k < 1) { this.vis.k = Math.min(1, this.vis.k + dt / 1.5); if (this.vis.k >= 1) this.vis.prev = -1; }
      for (const a of [this.texts, this.rings, this.flyers]) { for (let i = a.length - 1; i >= 0; i--) { a[i].t += dt; if (a[i].t >= a[i].life) a.splice(i, 1); } }
      this.shake = Math.max(0, this.shake - dt); this.flash = Math.max(0, this.flash - dt);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.4) this.banner = null; }
      if (this.gustWarn) this.gustWarn.t += dt;
      // kettle steam puffs (the world counts them; we turn them into particles)
      if (w && wx) for (const o of w.obstacles) if (o.kind === 'kettle' && o.puffs !== o._seen) { o._seen = o.puffs; if (o.x > -100 && o.x < LW + this.ox + 100) wx.steam(o.x + 50, COUNTER_Y - 82); }
    }

    // ------------------------------------------------------------------ drawing helpers
    _draw(key, x, y, w, h) { const s = BKF.Assets.sprite(key, w, h); if (s) this.g.drawImage(s, x, y, w, h); }
    _logical() { const p = this.px; this.g.setTransform(p, 0, 0, p, Math.round(this.ox * p), Math.round(this.oy * p)); }

    /* A tileable layer, pixel-exact: scroll in logical px, tile width tw, drawn at logical y. */
    _tile(key, tw, th, scroll, y, alpha) {
      const L = this._layer(key, tw, th); if (!L) return false;
      const g = this.g, p = this.px;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (alpha != null) g.globalAlpha = alpha;
      let start = -mod(scroll, tw);
      while (start > -this.ox) start -= tw;
      const yy = Math.round((this.oy + y) * p);
      for (let x = start; (x + this.ox) * p < this.c.width; x += tw) g.drawImage(L, Math.round((x + this.ox) * p), yy);
      g.globalAlpha = 1;
      return true;
    }

    draw(mode) {
      const g = this.g, w = this.world;
      if (!w) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#e8d7a2'; g.fillRect(0, 0, this.c.width, this.c.height); return; }
      const a = w.alpha || 0, A = BKF.Assets;
      const scroll = w.scroll - w.scrollSpeed * (1 - a) * (w.cfg ? w.cfg.step : 1 / 120);
      const vis = this.vis, z = vis.cur, zi = ZONE_INFO[z];
      // shake: small, damped
      let sx = 0, sy = 0;
      if (this.shake > 0) { const s = this.shake / 0.28 * 6; sx = Math.sin(this.t * 71) * s; sy = Math.cos(this.t * 53) * s * 0.6; }
      const ox0 = this.ox, oy0 = this.oy; this.ox += sx; this.oy += sy;

      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = zi.wall; g.fillRect(0, 0, this.c.width, this.c.height);

      // 1. outside (crossfade between zones) + outside particles
      const cw = this._customWall();
      if (!cw) {
        if (vis.prev >= 0) this._tile('outside_' + ZONE_INFO[vis.prev].key, 960, 540, scroll * PAR.outside, 0);
        this._tile('outside_' + zi.key, 960, 540, scroll * PAR.outside, 0, vis.prev >= 0 ? vis.k : null);
        this._logical();
        this._particles('outside');
        // 2. wall with transparent windows
        this._tile('room_wall', 1200, 540, scroll * PAR.wall, 0);
        if (this.oy > 0) {   // tall screens: extend the wallpaper above the stage
          g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = zi.wall; g.fillRect(0, 0, this.c.width, Math.ceil(this.oy * this.px));
        }
        this._logical();
        this._windowDecor(scroll * PAR.wall);
      } else {
        g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(cw, 0, 0);
        this._logical();
      }
      this._particles('room');
      // 3. rail (drawn over a custom wall too; the default wall already has it)
      if (cw) this._rail();
      // 4. obstacles
      for (const o of w.obstacles) {
        const x = lerp(o.prevX != null ? o.prevX : o.x, o.x, a);
        if (x < -this.ox - 200 || x > LW + this.ox + 200) continue;
        if (o.kind === 'hang') this._hanger(o, x, a);
        else if (o.kind === 'stack') this._stack(o, x);
        else this._kettle(o, x);
      }
      // 5. leaves
      const custLeaf = A.custom.leaf;
      for (const l of w.leaves) {
        const x = lerp(l.prevX, l.x, a), y = lerp(l.prevY, l.y, a), r = lerp(l.prevRot, l.rot, a);
        if (x < -this.ox - 60 || x > LW + this.ox + 60) continue;
        g.save(); g.translate(x, y); g.rotate(r);
        if (custLeaf) { const [fw, fh] = A.fit('leaf', 48, 48); this._draw('custom:leaf', -fw / 2, -fh / 2, fw, fh); }
        else this._draw('leaf_' + l.sprite, -22, -22, 44, 44);
        g.restore();
      }
      // 6. Biscuit (+ shadow on the counter)
      this._pup(w, a);
      // 7. counter
      {
        this._tile('room_counter', 600, 70, scroll * PAR.counter, COUNTER_Y);
        if (this.oy > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#7f9a6c'; g.fillRect(0, Math.floor((this.oy + LH) * this.px), this.c.width, this.c.height); }
        this._logical();
      }
      // 8. darkness + lamp, tint
      this._night(w, a);
      this._tint();
      this._logical();
      // 9. front particles, juice, gust warning
      this._particles('front');
      this._juice();
      this._gustArrow(w, a);
      if (this.debugView || BKF.Game && BKF.Game.debugView) this._debug(w);
      this.ox = ox0; this.oy = oy0;
      this._logical();
      // 10. HUD + banner + ready prompt
      if (mode !== 'title') this._hud(w);
      if (this.banner && mode !== 'title') this._banner();
      if (w.phase === 'ready' && (mode === 'playing' || mode === 'ready' || mode === 'paused')) this._readyPrompt(w);
      if (this.flash > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(255,120,100,' + (this.flash / 0.18 * 0.16).toFixed(3) + ')'; g.fillRect(0, 0, this.c.width, this.c.height); }
    }

    _particles(layer) {
      const wx = this.weather; if (!wx) return;
      const g = this.g;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const ar = PART_AR[p.sprite] || 1, w = p.size, h = p.size * ar;
        const s = BKF.Assets.sprite('p_' + p.sprite, p.sprite === 'wind' ? 120 : p.sprite === 'raindrop' ? 10 : 32, p.sprite === 'wind' ? 16 : p.sprite === 'raindrop' ? 30 : 32);
        if (!s) continue;
        g.globalAlpha = Math.min(1, p.alpha);
        if (p.rot || p.flipX) {
          g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
          g.drawImage(s, -w / 2, -h / 2, w, h); g.restore();
        } else g.drawImage(s, p.x - w / 2, p.y - h / 2, w, h);
      }
      g.globalAlpha = 1;
    }

    /* Curtains at every window edge (sway in the wind) and frost corners at night. */
    _windowDecor(s) {
      const g = this.g, w = this.world, vis = this.vis;
      const k = w.wind ? (w.wind.k || 0) : 0, dir = w.wind && w.wind.dir === 'up' ? -1 : 1;
      const frostA = (vis.cur === 3 ? (vis.prev >= 0 ? vis.k : 1) : 0) + (vis.prev === 3 ? 1 - vis.k : 0);
      let start = -mod(s, 1200);
      while (start > -this.ox) start -= 1200;
      for (let base = start; base < LW + this.ox; base += 1200) {
        // frost first (on the glass), then curtains in front
        if (frostA > 0.01) {
          g.globalAlpha = Math.min(1, frostA) * 0.9;
          for (const [x0, x1] of OPENINGS) {
            const fw = 190, fh = 140;
            this._mir(base + x0, WIN_Y0, fw, fh, 1, 1); this._mir(base + x1, WIN_Y0, fw, fh, -1, 1);
            this._mir(base + x0, WIN_Y1 - 40, fw * 0.8, fh * 0.8, 1, -1); this._mir(base + x1, WIN_Y1 - 40, fw * 0.8, fh * 0.8, -1, -1);
          }
          g.globalAlpha = 1;
        }
        CURTAINS.forEach((cx, i) => {
          const x = base + cx; if (x < -this.ox - 140 || x > LW + this.ox + 140) return;
          const right = i % 2 === 1;
          const sway = Math.sin(this.t * (1.3 + i * 0.17) + i) * (0.015 + k * 0.12) + k * 0.08 * (right ? -1 : 1) * 0.5;
          g.save(); g.translate(x, 98); g.rotate(sway); if (right) g.scale(-1, 1);
          this._draw('room_curtain', -60 + 34, 0, 120, 300 * (1 - k * 0.04));   // gathered toward the frame edge
          g.restore();
        });
      }
    }
    _mir(x, y, w, h, fx, fy) {
      const g = this.g; g.save(); g.translate(x, y); g.scale(fx, fy); this._draw('room_frost', 0, 0, w, h); g.restore();
    }
    _rail() {
      const g = this.g, x0 = -this.ox - 10, x1 = LW + this.ox + 10;
      g.fillStyle = '#7a4222'; g.fillRect(x0, 34, x1 - x0, 12);
      g.fillStyle = '#d98a5a'; g.fillRect(x0, 36, x1 - x0, 8);
      g.fillStyle = '#f6c9a0'; g.fillRect(x0, 37, x1 - x0, 2);
    }

    _hanger(o, x, a) {
      const g = this.g, w = this.world;
      const ang = lerp(o.prevAng != null ? o.prevAng : o.ang, o.ang, a);
      const hx = x + Math.sin(ang) * o.len, hy = RAIL_Y + Math.cos(ang) * o.len;
      // ring on the rail + chain links
      g.lineCap = 'round';
      if (o.len > 0) {
        const n = Math.max(1, Math.round(o.len / 10));
        for (let i = 0; i < n; i++) {
          const t0 = i / n, t1 = (i + 1) / n;
          g.strokeStyle = i % 2 ? '#93a2ad' : '#b9c5ce'; g.lineWidth = i % 2 ? 3 : 4.5;
          g.beginPath(); g.moveTo(lerp(x, hx, t0), lerp(RAIL_Y, hy, t0)); g.lineTo(lerp(x, hx, t1), lerp(RAIL_Y, hy, t1)); g.stroke();
        }
      }
      g.fillStyle = '#596773'; g.beginPath(); g.arc(x, RAIL_Y, 5, 0, TAU); g.fill();
      g.save(); g.translate(hx, hy); g.rotate(-ang);
      // soft shadow on the wall
      g.globalAlpha = 0.12; this._draw('hang_' + o.sprite, -60 + 6, -6 + 8, 120, 200); g.globalAlpha = 1;
      this._draw('hang_' + o.sprite, -60, -6, 120, 200);
      g.restore();
    }
    _stack(o, x) {
      const g = this.g;
      // contact shadow on the counter
      g.fillStyle = 'rgba(60,40,20,.18)'; g.beginPath(); g.ellipse(x, COUNTER_Y + 3, o.halfW * 0.9, 6, 0, 0, TAU); g.fill();
      for (const p of o.pieces) this._draw('stack_' + p.sprite, x + (p.dx || 0) - p.w / 2, p.y - p.h, p.w, p.h);
    }
    _kettle(o, x) {
      const g = this.g;
      g.fillStyle = 'rgba(60,40,20,.18)'; g.beginPath(); g.ellipse(x, COUNTER_Y + 3, 58, 6, 0, 0, TAU); g.fill();
      // faint warm column so the steam reads as a lift zone, even between puffs
      const top = COUNTER_Y - 120 - o.steamH;
      const gr = g.createLinearGradient(0, COUNTER_Y - 120, 0, top);
      gr.addColorStop(0, 'rgba(255,255,255,.22)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gr; g.fillRect(x - 40, top, 80, o.steamH);
      this._draw('kettle', x - 70, COUNTER_Y - 120, 140, 120);
    }

    _pup(w, a) {
      const g = this.g, p = w.pup, A = BKF.Assets;
      const x = lerp(p.prevX != null ? p.prevX : p.x, p.x, a), y = lerp(p.prevY, p.y, a), rot = lerp(p.prevRot, p.rot, a);
      // shadow on the counter: smaller and fainter the higher he flies
      const hgt = Math.max(0, COUNTER_Y - y - 40), k = Math.max(0.25, 1 - hgt / 420);
      g.fillStyle = 'rgba(50,35,20,' + (0.22 * k).toFixed(3) + ')'; g.beginPath(); g.ellipse(x, COUNTER_Y + 4, 34 * k + 6, 6 * k + 1, 0, 0, TAU); g.fill();
      if (p.hurtT > 0 && p.state !== 'sleep' && Math.floor(p.hurtT * 10) % 2 === 1) g.globalAlpha = 0.45;
      const sq = p.squash || 1, sxk = 1 + (1 - sq) * 0.8;
      g.save(); g.translate(x, y); g.rotate(rot); g.scale(sxk, sq);
      if (A.custom.pup) {
        const [fw, fh] = A.fit('pup', 96, 96), bob = Math.sin(this.t * 6) * 2;
        this._draw('custom:pup', -fw / 2, -fh / 2 + 6 + bob, fw, fh);
        // a little procedural propeller so a photo still flies
        const ph = (p.prop || 0) * TAU, top = -fh / 2 + 2 + bob, bw = 34 * Math.abs(Math.cos(ph));
        g.fillStyle = '#87241b'; g.fillRect(-3, top - 10, 6, 12);
        g.fillStyle = '#e5483c'; g.beginPath(); g.ellipse(0, top - 12, Math.max(4, bw), 5, 0, 0, TAU); g.fill();
        g.fillStyle = '#3fb8b0'; g.beginPath(); g.arc(0, top - 12, 4, 0, TAU); g.fill();
      } else {
        const key = p.state === 'sleep' ? 'pup_sleep' : p.state === 'hurt' || p.hurtT > 1.1 ? 'pup_hurt' : 'pup_' + (Math.floor((p.prop || 0) * 3) % 3);
        this._draw(key, -60, -64, 120, 110);
      }
      g.restore(); g.globalAlpha = 1;
    }

    /* Night: a soft dark overlay with a hole where Biscuit's nose lamp shines; leaves glow; obstacles get a light rim. */
    _night(w, a) {
      const d = w.darkness || 0; if (d < 0.01) return;
      const g = this.g, dk = this.dk, dg = this.dg, s = dk.width / this.VW;
      const p = w.pup, x = lerp(p.prevX != null ? p.prevX : p.x, p.x, a), y = lerp(p.prevY, p.y, a);
      const L = w.lamp || { x: x + 60, y, r: 180 };
      const lx = (L.x + (x - p.x) + this.ox) * s, ly = (L.y + (y - p.y) + this.oy) * s;
      dg.setTransform(1, 0, 0, 1, 0, 0); dg.globalCompositeOperation = 'source-over';
      dg.clearRect(0, 0, dk.width, dk.height);
      dg.fillStyle = 'rgba(12,16,46,' + d.toFixed(3) + ')'; dg.fillRect(0, 0, dk.width, dk.height);
      dg.globalCompositeOperation = 'destination-out';
      const hole = (cx, cy, r, k) => {
        const gr = dg.createRadialGradient(cx, cy, r * 0.15, cx, cy, r);
        gr.addColorStop(0, 'rgba(0,0,0,' + k + ')'); gr.addColorStop(0.6, 'rgba(0,0,0,' + (k * 0.7) + ')'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        dg.fillStyle = gr; dg.beginPath(); dg.arc(cx, cy, r, 0, TAU); dg.fill();
      };
      hole(lx, ly, L.r * s, 0.95);
      hole((x + this.ox) * s, (y + this.oy) * s, 80 * s, 0.9);
      for (const l of w.leaves) hole((lerp(l.prevX, l.x, a) + this.ox) * s, (lerp(l.prevY, l.y, a) + this.oy) * s, 40 * s, 0.75);
      dg.globalCompositeOperation = 'source-over';
      g.setTransform(1, 0, 0, 1, 0, 0); g.imageSmoothingEnabled = true;
      g.drawImage(dk, 0, 0, this.c.width, this.c.height);
      this._logical();
      // warm lamp glow + leaf glows + obstacle rims (fade in with the dark)
      const k = Math.min(1, d / 0.62);
      g.globalCompositeOperation = 'lighter';
      const glow = (cx, cy, r, col, al) => { const gr = g.createRadialGradient(cx, cy, 0, cx, cy, r); gr.addColorStop(0, 'rgba(' + col + ',' + al + ')'); gr.addColorStop(1, 'rgba(' + col + ',0)'); g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, r, 0, TAU); g.fill(); };
      glow(L.x + (x - p.x), L.y + (y - p.y), L.r * 0.7, '255,214,120', (0.16 * k).toFixed(3));
      for (const l of w.leaves) glow(lerp(l.prevX, l.x, a), lerp(l.prevY, l.y, a), 34, '170,255,150', (0.32 * k).toFixed(3));
      g.globalCompositeOperation = 'source-over';
      if (k > 0.3) {
        g.strokeStyle = 'rgba(255,236,190,' + (0.32 * (k - 0.3) / 0.7).toFixed(3) + ')'; g.lineWidth = 2.5; g.lineJoin = 'round';
        for (const sh of w.hitShapes()) {
          if (sh.tag === 'pup' || sh.tag === 'leaf' || sh.tag === 'steam') continue;
          g.beginPath();
          if (sh.kind === 'circle') g.arc(sh.x, sh.y, sh.r + 3, 0, TAU);
          else if (sh.kind === 'rect') { if (g.roundRect) g.roundRect(sh.x - 3, sh.y - 3, sh.w + 6, sh.h + 6, 12); else g.rect(sh.x - 3, sh.y - 3, sh.w + 6, sh.h + 6); }
          else { g.moveTo(sh.x1, sh.y1); g.lineTo(sh.x2, sh.y2); }
          g.stroke();
        }
      }
    }
    _tint() {
      const v = this.vis, cur = ZONE_INFO[v.cur];
      let col = cur.tint, al = cur.tintA;
      if (v.prev >= 0) { const pv = ZONE_INFO[v.prev]; col = mix(pv.tint, cur.tint, v.k); al = lerp(pv.tintA, cur.tintA, v.k); }
      const g = this.g; g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalAlpha = al; g.fillStyle = col; g.fillRect(0, 0, this.c.width, this.c.height); g.globalAlpha = 1;
    }

    _text(str, x, y, size, col, alpha, outline) {
      const g = this.g;
      g.font = '900 ' + size + 'px "Arial Rounded MT Bold","Segoe UI Black","Trebuchet MS",system-ui,sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.globalAlpha = alpha == null ? 1 : alpha;
      g.lineJoin = 'round'; g.lineWidth = size * 0.22; g.strokeStyle = outline || '#ffffff'; g.strokeText(str, x, y);
      g.fillStyle = col; g.fillText(str, x, y);
      g.globalAlpha = 1;
    }
    _juice() {
      const g = this.g;
      for (const r of this.rings) {
        const k = r.t / r.life;
        g.strokeStyle = 'rgba(' + r.col + ',' + (1 - k).toFixed(3) + ')'; g.lineWidth = r.w * (1 - k) + 0.5;
        g.beginPath(); g.arc(r.x, r.y, r.r + k * 26, 0, TAU); g.stroke();
      }
      for (const f of this.flyers) {   // the caught leaf zips to the score
        const k = f.t / f.life, e = k * k, tx = 480, ty = 34 - this.oy * 0;
        const x = lerp(f.x, tx, e), y = lerp(f.y, ty, e) - Math.sin(k * Math.PI) * 40, s = 44 * (1 - k * 0.6);
        g.globalAlpha = 1 - k * 0.3;
        if (BKF.Assets.custom.leaf) { const [fw, fh] = BKF.Assets.fit('leaf', s, s); this._draw('custom:leaf', x - fw / 2, y - fh / 2, fw, fh); }
        else this._draw('leaf_' + f.sprite, x - s / 2, y - s / 2, s, s);
      }
      g.globalAlpha = 1;
      for (const t of this.texts) {
        const k = t.t / t.life, pop = Math.min(1, t.t / 0.12);
        this._text(t.text, t.x, t.y - k * 30, Math.round(t.size * (0.7 + 0.3 * pop)), t.col, k > 0.7 ? (1 - k) / 0.3 : 1);
      }
    }
    _gustArrow(w, a) {
      const gw = this.gustWarn, wd = w.wind; if (!gw || !wd) return;
      if (wd.phase !== 'warn' && wd.phase !== 'gust') return;
      const g = this.g, up = (wd.dir || gw.dir) === 'up', x = w.pup.x + 90, y = w.pup.y + (up ? -60 : 60);
      const al = wd.phase === 'warn' ? 0.5 + 0.5 * Math.sin(this.t * 14) : Math.max(0, 0.7 * (wd.k || 0));
      g.save(); g.translate(x, y); if (!up) g.scale(1, -1);
      g.globalAlpha = Math.max(0, al);
      g.fillStyle = '#ffffff'; g.strokeStyle = '#5c8db8'; g.lineWidth = 4; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(0, -22); g.lineTo(18, 0); g.lineTo(7, 0); g.lineTo(7, 20); g.lineTo(-7, 20); g.lineTo(-7, 0); g.lineTo(-18, 0); g.closePath();
      g.fill(); g.stroke();
      g.restore(); g.globalAlpha = 1;
    }

    _hud(w) {
      const g = this.g, sf = this.safe || { l: 0, r: 0, t: 0 };
      const left = Math.max(-this.ox + 14 + sf.l, -this.ox + 14), top = -this.oy + 12 + sf.t;
      // batteries
      for (let i = 0; i < w.maxBatteries; i++) {
        const full = i < w.batteries, x = left + i * 54, low = w.batteries === 1 && full && Math.floor(this.t * 3) % 2 === 0;
        g.globalAlpha = low ? 0.55 : 1;
        this._draw(full ? 'battery_full' : 'battery_empty', x, top, 48, 30);
      }
      g.globalAlpha = 1;
      // score (centre)
      this._text(String(w.score), 480, top + 26, 48, '#e0662a', 1, '#fff7e6');
      // day bar under the score: 4 zone segments + Biscuit's position in the day
      const bw = 200, bx = 480 - bw / 2, by = top + 58;
      for (let i = 0; i < 4; i++) {
        g.fillStyle = ZONE_INFO[i].banner; g.globalAlpha = i === w.zone ? 1 : 0.45;
        g.beginPath(); g.roundRect ? g.roundRect(bx + i * 50 + 2, by, 46, 8, 4) : g.rect(bx + i * 50 + 2, by, 46, 8); g.fill();
      }
      g.globalAlpha = 1;
      const mx = bx + (w.dayT || 0) * bw;
      g.fillStyle = '#fff'; g.strokeStyle = '#1d6763'; g.lineWidth = 2.5; g.beginPath(); g.arc(mx, by + 4, 7, 0, TAU); g.fill(); g.stroke();
      // leaves until the next battery (only when a battery is missing)
      if (w.batteries < w.maxBatteries) {
        const per = (w.cfg && w.cfg.leavesPerBattery) || 15, left2 = per - (w.leafCount % per);
        this._text('🔋 in ' + left2 + ' leaves', left + 80, top + 46, 15, '#2f6e3a', 0.9, '#fff7e6');
      }
    }
    _banner() {
      const b = this.banner, k = b.t, al = k < 0.25 ? k / 0.25 : k > 1.8 ? Math.max(0, 1 - (k - 1.8) / 0.6) : 1;
      const col = ZONE_INFO[b.zone].banner, y = 150 - this.oy * 0;
      const sz = Math.round(44 * (0.85 + 0.15 * Math.min(1, k / 0.25)));
      this._text(b.text, 600, y, sz, col, al, '#fffaf0');
      if (b.sub) this._text(b.sub, 600, y + 40, 24, '#7a4222', al, '#fffaf0');
    }
    _readyPrompt(w) {
      const g = this.g, p = w.pup, bob = Math.sin(this.t * 4) * 6;
      const isTouch = BKF.Game && BKF.Game.isTouch;
      this._text(isTouch ? 'Tap to fly!' : 'Tap, click or Space to fly!', 560, 330 + bob, 34, '#1d6763', 1, '#fffaf0');
      this._text('Catch the herb leaves, dodge the pots!', 560, 374, 20, '#7a4222', 0.95, '#fffaf0');
      // a little tapping hand: a circle pulse
      const k = (this.t % 1);
      g.strokeStyle = 'rgba(29,103,99,' + (1 - k).toFixed(3) + ')'; g.lineWidth = 4;
      g.beginPath(); g.arc(p.x, p.y + 92, 12 + k * 18, 0, TAU); g.stroke();
    }
    _debug(w) {
      const g = this.g; g.lineWidth = 2;
      for (const s of w.hitShapes()) {
        g.strokeStyle = s.tag === 'pup' ? '#00e' : s.tag === 'leaf' ? '#0a0' : s.tag === 'steam' ? '#0aa' : '#e00';
        g.beginPath();
        if (s.kind === 'circle') g.arc(s.x, s.y, s.r, 0, TAU);
        else if (s.kind === 'rect') g.rect(s.x, s.y, s.w, s.h);
        else { g.lineWidth = s.r * 2; g.globalAlpha = 0.35; g.moveTo(s.x1, s.y1); g.lineTo(s.x2, s.y2); g.stroke(); g.globalAlpha = 1; g.lineWidth = 2; continue; }
        g.stroke();
      }
    }
  }
  BKF.Renderer = Renderer;
})(window.BKF = window.BKF || {});
