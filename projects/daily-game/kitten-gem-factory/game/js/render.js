/* CGF.Renderer — draws Comet's Gem Factory on a canvas.
 * The 960×540 logical stage is fitted with "contain"; the letterbox is filled by drawing the tileable
 * factory layers wider (and plain wall panels above / conveyor base below on tall screens).
 * Order: outside → outside particles → wall (transparent windows) → gears → room particles → floor/conveyor
 *        → bench → cards → Gizmo → flyers → Comet → tint → front particles → juice → HUD → banners.
 * Moving things are interpolated between fixed simulation steps (w.alpha). */
(function (CGF) {
  'use strict';
  const LW = 960, LH = 540, FLOOR_Y = 478, FLOOR_DRAW_Y = 470;
  const BOARD = { x: 180, y: 76, w: 720, h: 392 };
  const GIZMO = { x: 92, y: 478 }, HOPPER = { x: 92, y: 322 };
  const TAU = Math.PI * 2;
  const SEASON_INFO = [
    { key: 'spring', name: 'Spring', banner: '#ef6f9a', wall: '#d9e8e2' },
    { key: 'summer', name: 'Summer', banner: '#f2a72e', wall: '#e3e8d5' },
    { key: 'autumn', name: 'Autumn', banner: '#e0662a', wall: '#e8ddcc' },
    { key: 'winter', name: 'Winter', banner: '#5f7fd0', wall: '#d6dbe8' }
  ];
  const CARD = { back: '#1f8a8a', bevel: '#176b6b', edge: '#0e4f50', rivet: '#bfe9e4', face: '#fff7e6', panel: '#ffeccc', faceEdge: '#b07a3a', glow: '#ffe066', ring: '#ff7a59' };
  const PSIZE = { blossom: [20, 20], sunmote: [16, 16], butterfly: [24, 20], leaf: [20, 20], snowflake: [24, 24], steam: [64, 64], sparkle: [32, 32], spark: [12, 12] };

  function lerp(a, b, t) { return a + (b - a) * t; }
  function mod(a, n) { return ((a % n) + n) % n; }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  const ip = (o, k, a) => (o['prev' + k[0].toUpperCase() + k.slice(1)] != null ? lerp(o['prev' + k[0].toUpperCase() + k.slice(1)], o[k], a) : o[k]);

  class Renderer {
    constructor(canvas) {
      this.c = canvas; this.g = canvas.getContext('2d', { alpha: false });
      this.px = 1; this.cssScale = 1; this.maxPx = 0;
      this.VW = LW; this.VH = LH; this.ox = 0; this.oy = 0;
      this.vis = { cur: 0, prev: -1, k: 1 };
      this.texts = []; this.rings = [];
      this.shake = 0; this.t = 0; this.banner = null; this.ribbon = null;
      this.comboPop = 9; this.comboDrop = 9; this.hurryT = 9; this.faceRight = true; this.dispCombo = 0;
      this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
      this._spr = { clear: () => { CGF.Assets._cache.clear(); this._plates = {}; this._bgCache = {}; } };
      this._bgCache = {}; this._plates = {};
    }
    static get SEASON_INFO() { return SEASON_INFO; }
    static get ZONE_INFO() { return SEASON_INFO; }

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
      this.ox = (this.VW - LW) / 2; this.oy = (this.VH - LH) * (H > W ? 0.62 : 0.5);   // portrait: factory a bit lower, the floor continues below
      this.c.width = Math.round(this.VW * px); this.c.height = Math.round(this.VH * px);
      this.c.style.width = W + 'px'; this.c.style.height = H + 'px';
      this.portrait = H > W;
      CGF.Assets.setScale(px);
      this._bgCache = {}; this._plates = {};
      this._measureHud();
      this.prewarm(this.vis.cur); this.prewarm(this.vis.cur + 1);
    }
    _measureHud() {
      const k = 1 / this.cssScale, i = this.insets || {};
      this.safe = { l: (i.left || 0) * k, r: (i.right || 0) * k, t: (i.top || 0) * k, b: (i.bottom || 0) * k };
    }
    /* CSS px (relative to the canvas' top-left) → logical stage coordinates */
    toLogical(cx, cy) { return [cx / this.cssScale - this.ox, cy / this.cssScale - this.oy]; }

    attach(world, weather) {
      this.world = world; this.weather = weather; this.texts.length = 0; this.rings.length = 0; this.shake = 0;
      this.banner = null; this.ribbon = null; this.dispCombo = 0; this.comboPop = 9; this.comboDrop = 9; this.hurryT = 9;
      if (weather && weather.setVents) {
        const pal = CGF.Assets.palette || CGF.Assets.DEFAULT_PALETTE, v = (pal && pal.vents) || [];
        weather.setVents(v.filter(p => p.x >= 0 && p.x <= LW).map(p => ({ x: p.x, y: p.y })));
      }
    }
    setLevel(season, instant) {
      season = mod(season, 4);
      if (instant || season === this.vis.cur) this.vis = { cur: season, prev: -1, k: 1 };
      else this.vis = { cur: season, prev: this.vis.cur, k: 0 };
      this.prewarm(season); this.prewarm((season + 1) % 4);
    }

    /* Background layers rasterized pixel-exact at the current scale. */
    _layer(key, w, h) {
      const ck = key + '@' + this.px.toFixed(4);
      let c = this._bgCache[ck];
      if (c) return c;
      const src = CGF.Assets.img[key];
      if (!src) return null;
      c = document.createElement('canvas');
      c.width = Math.round(w * this.px); c.height = Math.round(h * this.px);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      this._bgCache[ck] = c;
      return c;
    }
    /* Pre-warm everything a season needs (layers, bench, card plates, gem + particle sprites) in idle time,
     * ONE job per idle callback (an SVG layer costs ~20–30 ms at 1920×1080 on a desktop CPU, 3–4× that on a
     * phone), and force each raster now: canvas 2D defers the SVG draw until the canvas is first used, which
     * would otherwise land the cost in the first frame of the new season. */
    prewarm(season) {
      season = mod(season, 4);
      const key = SEASON_INFO[season].key, jobs = this._warmJobs || (this._warmJobs = []);
      const add = (id, fn) => { if (!jobs.some(j => j.id === id)) jobs.push({ id, fn }); };
      add('outside_' + key, () => this._force(this._layer('outside_' + key, 960, 540)));
      add('wall', () => this._force(this._layer('room_wall', 1200, 540)));
      add('floor', () => this._force(this._layer('room_floor', 600, 70)));
      add('bench_' + key, () => this._force(this._benchPlate(season)));
      const w = this.world, L = CGF.LEVELS && CGF.LEVELS[season];
      if (w && L && w.layoutFor) {
        const lay = w.layoutFor(L.cols, L.rows), cw = lay.cardW, ch = lay.cardH, s = Math.min(cw, ch) * 0.74;
        add('plates_' + cw + 'x' + ch, () => { this._force(this._plate('back', cw, ch)); this._force(this._plate('face', cw, ch)); });
        add('gems_' + cw + 'x' + ch, () => CGF.Assets.warm(CGF.Assets.GEM_KINDS.map(k => ['gem_' + k, s, s]).concat(CGF.Assets.GEM_KINDS.map(k => ['gem_' + k, 56, 56]))));
      }
      const ps = { spring: ['blossom'], summer: ['sunmote', 'butterfly'], autumn: ['leaf'], winter: ['snowflake'] }[key].concat(['steam', 'sparkle', 'spark']);
      add('parts_' + key, () => CGF.Assets.warm(ps.map(p => ['p_' + p, PSIZE[p][0] * 1.5, PSIZE[p][1] * 1.5])));
      this._pumpWarm();
    }
    _pumpWarm() {
      if (this._warmT || !this._warmJobs || !this._warmJobs.length) return;
      const ric = window.requestIdleCallback ? (f => window.requestIdleCallback(f, { timeout: 300 }))
                                             : (f => setTimeout(() => f({ timeRemaining: () => 0 }), 40));   // iOS Safari: no rIC
      this._warmT = ric(dl => {
        this._warmT = 0;
        do { const j = this._warmJobs.shift(); if (!j) break; try { j.fn(); } catch (e) { /* missing art: renderer has fallbacks */ } }
        while (this._warmJobs.length && dl.timeRemaining() > 12);
        this._pumpWarm();
      });
    }
    _force(c) { if (c) { try { c.getContext('2d').getImageData(0, 0, 1, 1); } catch (e) { /* tainted / lost: ignore */ } } return c; }
    _customWall() {
      const A = CGF.Assets, src = A.custom.wall;
      if (!src) return null;
      const ck = 'cw@' + this.px.toFixed(4) + '|' + (A._ver || 0);
      if (this._bgCache[ck]) return this._bgCache[ck];
      for (const k in this._bgCache) if (k.startsWith('cw@')) delete this._bgCache[k];
      const tw = Math.max(480, Math.round(src.width * LH / src.height)), p = this.px;
      const c = document.createElement('canvas'); c.width = Math.round(tw * 2 * p); c.height = Math.round(LH * p);
      const g = c.getContext('2d'), half = Math.round(tw * p);
      g.drawImage(src, 0, 0, half, c.height);
      g.save(); g.translate(c.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0, c.width - half, c.height); g.restore();
      c.tw = tw * 2;
      this._bgCache[ck] = c;
      return c;
    }

    _cardById(id) { const w = this.world; if (!w) return null; return w.cards.find(c => c.id === id) || w.cards[id] || null; }
    onEvents(evts) {
      const wx = this.weather, w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'deal': this.banner = null; this.ribbon = { text: SEASON_INFO[mod(e.season != null ? e.season : e.level, 4)].name + ((w && w.loop > 0) ? ' · Year ' + (w.loop + 1) : ''), t: 0, life: 1.6, col: SEASON_INFO[mod(e.season != null ? e.season : 0, 4)].banner }; break;
          case 'peekStart': this.ribbon = { text: 'Remember the gems!', t: 0, life: 99, col: '#1f8a8a', peek: true }; break;
          case 'peekEnd': this.ribbon = { text: 'Go!', t: 0, life: 0.9, col: '#3c9a3d' }; break;
          case 'flip': break;
          case 'match': {
            const ids = e.ids || [];
            ids.forEach(id => { const c = this._cardById(id); if (!c) return; const cx = c.cx != null ? c.cx : c.x + c.w / 2, cy = c.cy != null ? c.cy : c.y + c.h / 2; if (wx) { wx.burst('sparkle', cx, cy, 6); wx.burst('spark', cx, cy, 5); } this.rings.push({ x: cx, y: cy, r: Math.min(c.w, c.h) * 0.4, t: 0, life: 0.4, col: '255,224,102', w: 5 }); });
            // on the matched card itself (it pops away), never over a neighbour the child wants to tap next
            const mc = this._cardById(ids[1] != null ? ids[1] : ids[0]);
            const x = mc ? (mc.cx != null ? mc.cx : mc.x + mc.w / 2) : (e.x != null ? e.x : 540), y = mc ? (mc.cy != null ? mc.cy : mc.y + mc.h / 2) : (e.y != null ? e.y : 270);
            this.texts.push({ x, y: y - 6, text: '+' + (e.score != null ? e.score : 10), t: 0, life: 0.75, col: '#2f9e44', size: 34, fadeLate: true });
            if ((e.mult || 1) > 1) this.texts.push({ x, y: y + 24, text: '×' + e.mult + '!', t: 0, life: 0.75, col: '#e0662a', size: 24, delay: 0.08, fadeLate: true });
            break;
          }
          case 'miss': if (e.broke === false && w) { /* unlucky first look: nothing is lost */ } break;
          case 'comboUp': this.comboPop = 0; break;
          case 'comboDown': this.comboDrop = 0; break;
          case 'gemLand': this.rings.push({ x: HOPPER.x, y: HOPPER.y, r: 12, t: 0, life: 0.35, col: '255,255,255', w: 4 }); if (wx) wx.burst('spark', HOPPER.x, HOPPER.y - 6, 4); break;
          case 'timeBonus': { const n = this.texts.filter(q => q.hud).length; this.texts.push({ x: 0, y: 0, text: '+' + Math.round(e.s) + 's', t: 0, life: 0.9, col: '#1f8a8a', size: 22, hud: true, slot: n }); break; }
          case 'hurry': this.hurryT = 0; this.ribbon = { text: 'Hurry, hurry!', t: 0, life: 1.4, col: '#e0662a' }; break;
          case 'tick': this.hurryT = 0; break;
          case 'levelClear':
            if (wx) { wx.burst('confetti', 540, 160, 60); wx.burst('sparkle', 540, 270, 12); }
            this.banner = { text: SEASON_INFO[mod(e.level, 4)].name + ' done!', sub: (e.bonus ? 'Time bonus +' + e.bonus : '') + (e.perfect ? (e.bonus ? '  ·  ' : '') + 'Perfect +50' : ''), t: 0, life: 2.4, col: SEASON_INFO[mod(e.level, 4)].banner };
            this.ribbon = null;
            break;
          case 'levelUp': break;
          case 'gameOver': this.banner = { text: "Time's up!", sub: 'Gizmo needs a nap…', t: 0, life: 99, col: '#5f7fd0' }; this.ribbon = null; break;
        }
      }
    }

    update(dt) {
      this.t += dt; this._dtLast = dt;
      const w = this.world, wx = this.weather;
      if (wx) wx.update(dt);
      if (this.vis.k < 1) { this.vis.k = Math.min(1, this.vis.k + dt / 1.4); if (this.vis.k >= 1) this.vis.prev = -1; }
      for (const a of [this.texts, this.rings]) { for (let i = a.length - 1; i >= 0; i--) { a[i].t += dt; if (a[i].t >= a[i].life + (a[i].delay || 0)) a.splice(i, 1); } }
      this.shake = Math.max(0, this.shake - dt);
      this.comboPop += dt; this.comboDrop += dt; this.hurryT += dt;
      if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
      if (this.ribbon) { this.ribbon.t += dt; if (this.ribbon.t > this.ribbon.life) this.ribbon = null; }
      if (this.ribbon && this.ribbon.peek && w && w.phase !== 'peek') this.ribbon = null;
      if (w) { const target = clamp(w.combo01 != null ? w.combo01 : (w.streak || 0) / 5, 0, 1); this.dispCombo += (target - this.dispCombo) * Math.min(1, dt * 8); }
    }

    // ------------------------------------------------------------------ helpers
    _draw(key, x, y, w, h) { const s = CGF.Assets.sprite(key, w, h); if (s) { this.g.drawImage(s, x, y, w, h); return true; } return false; }
    _logical() { const p = this.px; this.g.setTransform(p, 0, 0, p, Math.round(this.ox * p), Math.round(this.oy * p)); }
    _tile(key, tw, th, scroll, y, alpha) { return this._tileC(this._layer(key, tw, th), tw, scroll, y, alpha); }
    _tileC(L, tw, scroll, y, alpha) {
      if (!L) return false;
      const g = this.g, p = this.px;
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (alpha != null) g.globalAlpha = alpha;
      let start = -mod(scroll, tw);
      while (start > -this.ox) start -= tw;
      const yy = Math.round((this.oy + y) * p);
      for (let X = Math.round((start + this.ox) * p); X < this.c.width; X += L.width) g.drawImage(L, X, yy);
      g.globalAlpha = 1;
      return true;
    }
    _text(s, x, y, size, col, alpha, stroke) {
      const g = this.g;
      g.globalAlpha = alpha == null ? 1 : alpha;
      g.font = '900 ' + size + 'px "Segoe UI Black","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = Math.max(3, size * 0.16); g.strokeStyle = stroke || '#ffffff'; g.strokeText(s, x, y);
      g.fillStyle = col; g.fillText(s, x, y);
      g.globalAlpha = 1;
    }

    // ------------------------------------------------------------------ frame
    draw(mode) {
      const g = this.g, w = this.world;
      const zi = SEASON_INFO[this.vis.cur];
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = zi.wall; g.fillRect(0, 0, this.c.width, this.c.height);
      if (!w) return;
      const a = w.alpha || 0, vis = this.vis;
      let sx = 0, sy = 0;
      if (this.shake > 0) { const s = this.shake / 0.25 * 4; sx = Math.sin(this.t * 71) * s; sy = Math.cos(this.t * 53) * s * 0.6; }
      const ox0 = this.ox, oy0 = this.oy; this.ox += sx; this.oy += sy;

      // 1. outside + outside particles, wall with windows
      const cw = this._customWall(), drift = this.t * 6;
      if (!cw) {
        if (vis.prev >= 0) this._tile('outside_' + SEASON_INFO[vis.prev].key, 960, 540, drift, 0);
        this._tile('outside_' + zi.key, 960, 540, drift, 0, vis.prev >= 0 ? vis.k : null);
        this._logical();
        this._particles('outside');
        if (!this._tile('room_wall', 1200, 540, 0, 0)) { this._logical(); this._fallbackWall(); }
      } else {
        this._tileC(cw, cw.tw, 0, 0);
        this._logical();
        g.globalAlpha = 0.45; this._particles('outside'); g.globalAlpha = 1;
      }
      this._logical();
      if (this.oy > 0.5) this._bandTop();
      this._gears();
      this._particles('room');
      // 2. floor / conveyor
      if (!this._tile('room_floor', 600, 70, this.t * 30, FLOOR_DRAW_Y)) { this._logical(); g.fillStyle = '#5b6b78'; g.fillRect(-this.ox, FLOOR_DRAW_Y, this.VW, 70); }
      this._logical();
      if (this.VH - this.oy - LH > 0.5) this._bandBottom();
      this._logical();
      // 3. bench + cards
      this._bench(w);
      this._cards(w, mode);
      // 4. Gizmo, flyers, Comet
      this._gizmo(w);
      this._flyers(w, a);
      this._comet(w, a);
      // 5. tint, front particles, juice
      this._tint();
      this._logical();
      this._particles('front');
      this._juice();
      if (CGF.Game && CGF.Game.debugView) this._debug(w);
      this.ox = ox0; this.oy = oy0;
      this._logical();
      // 6. HUD + banners
      if (mode !== 'title') this._hud(w);
      if (mode !== 'title') { if (this.ribbon) this._ribbon(); if (this.banner && mode !== 'over') this._banner(); }
    }

    _fallbackWall() {
      const g = this.g;
      g.fillStyle = '#cfe3dc'; g.fillRect(-this.ox, 0, this.VW, LH);
      g.fillStyle = 'rgba(255,255,255,.35)';
      for (let x = -this.ox - mod(-this.ox, 320); x < LW + this.ox; x += 320) { rr(g, x + 40, 100, 220, 190, 16); g.fill(); }
    }
    _bandTop() {
      const g = this.g;
      const gr = g.createLinearGradient(0, -this.oy, 0, 0);
      gr.addColorStop(0, '#9fc9c2'); gr.addColorStop(1, '#c9e0da');
      g.fillStyle = gr; g.fillRect(-this.ox, -this.oy - 2, this.VW, this.oy + 3);
      g.fillStyle = '#7aa9a2';
      for (let x = -this.ox - mod(-this.ox, 60) + 20; x < LW + this.ox; x += 60) for (let y = -24; y > -this.oy; y -= 90) { g.beginPath(); g.arc(x, y, 3, 0, TAU); g.fill(); }
      g.fillStyle = '#5b8f88'; g.fillRect(-this.ox, -6, this.VW, 6);
    }
    _bandBottom() {
      const g = this.g, top = LH, h = this.VH - this.oy - LH + 2;
      const gr = g.createLinearGradient(0, top, 0, top + h);
      gr.addColorStop(0, '#c8956a'); gr.addColorStop(1, '#9c6b45');            // the wooden floor continues
      g.fillStyle = gr; g.fillRect(-this.ox, top, this.VW, h);
      g.fillStyle = 'rgba(90,50,20,.18)';
      for (let y = top + 46; y < top + h; y += 46) g.fillRect(-this.ox, y, this.VW, 2);
      g.fillStyle = '#7a5236'; g.fillRect(-this.ox, top, this.VW, 6);
    }
    _gears() {
      const pal = CGF.Assets.palette || CGF.Assets.DEFAULT_PALETTE, list = (pal && pal.gears) || [];
      if (CGF.Assets.custom.wall) return;
      const g = this.g;
      for (let base = -1200; base < LW + this.ox + 1200; base += 1200) {
        list.forEach((q, i) => {
          const x = base + q.x; if (x < -this.ox - q.r * 2 || x > LW + this.ox + q.r * 2) return;
          g.save(); g.translate(x, q.y); g.rotate(this.t * (i % 2 ? -0.5 : 0.7) * (40 / Math.max(16, q.r)));
          if (!this._draw('room_gear', -q.r, -q.r, q.r * 2, q.r * 2)) { g.fillStyle = '#8fb3ad'; g.beginPath(); g.arc(0, 0, q.r * 0.8, 0, TAU); g.fill(); }
          g.restore();
        });
      }
    }
    _particles(layer) {
      const wx = this.weather; if (!wx) return;
      const g = this.g, base = g.globalAlpha;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = Math.min(1, p.alpha) * base;
        if (p.sprite === 'confetti') {
          g.save(); g.translate(p.x, p.y); g.rotate(p.rot || 0);
          g.fillStyle = p.color || '#ffb43a'; g.fillRect(-p.size / 2, -p.size * 0.3, p.size, p.size * 0.6 * Math.abs(Math.cos((p.rot || 0) * 2)) + 1);
          g.restore(); continue;
        }
        const ns = PSIZE[p.sprite] || [32, 32], ar = ns[1] / ns[0], w = p.size, h = p.size * ar;
        const s = CGF.Assets.sprite('p_' + p.sprite, ns[0] * 1.5, ns[1] * 1.5);
        if (!s) continue;
        if (p.rot || p.flipX) {
          g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
          g.drawImage(s, -w / 2, -h / 2, w, h); g.restore();
        } else g.drawImage(s, p.x - w / 2, p.y - h / 2, w, h);
      }
      g.globalAlpha = base;
    }
    _tint() {
      const pal = CGF.Assets.palette || CGF.Assets.DEFAULT_PALETTE, vis = this.vis, g = this.g;
      const one = (s, k) => {
        const p = pal[SEASON_INFO[s].key]; if (!p || !p.tintAlpha) return;
        g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = p.tintAlpha * k; g.fillStyle = p.tint; g.fillRect(0, 0, this.c.width, this.c.height); g.globalAlpha = 1;
      };
      if (vis.prev >= 0) one(vis.prev, 1 - vis.k);
      one(vis.cur, vis.prev >= 0 ? vis.k : 1);
    }

    /* The bench (big translucent rounded rects + strokes) is static per season: draw it once per scale and blit. */
    /* The bench hugs the card grid (x and width follow the board; it eases over 0.4 s when a new season is dealt). */
    _benchTarget(w) {
      let x0 = 1e9, x1 = -1e9;
      if (w && w.cards) for (const c of w.cards) { x0 = Math.min(x0, c.x); x1 = Math.max(x1, c.x + c.w); }
      if (!(x1 > x0)) return { x: BOARD.x - 12, w: BOARD.w + 24 };
      return { x: Math.round(x0 - 22), w: Math.round(x1 - x0 + 44) };
    }
    _bench(w) {
      const tg = this._benchTarget(w), B = this._benchBox || (this._benchBox = { x: tg.x, w: tg.w, fx: tg.x, fw: tg.w, tx: tg.x, tw: tg.w, t: 1 });
      if (B.tx !== tg.x || B.tw !== tg.w) { B.fx = B.x; B.fw = B.w; B.tx = tg.x; B.tw = tg.w; B.t = 0; }
      if (B.t < 1) {
        B.t = Math.min(1, B.t + (this._dtLast || 1 / 60) / 0.4);
        const e = B.t < 0.5 ? 2 * B.t * B.t : 1 - Math.pow(-2 * B.t + 2, 2) / 2;
        B.x = B.fx + (B.tx - B.fx) * e; B.w = B.fw + (B.tw - B.fw) * e;
        if (B.t < 1) { this._benchDraw(this.g, this.vis.cur, B.x, BOARD.y - 10, B.w, BOARD.h + 18); return; }   // easing: draw live
      }
      const pl = this._benchPlate(this.vis.cur, B.w), p = this.px;
      if (!pl) return;
      // blit 1:1 on whole device pixels (a sub-pixel or scaled blit is resampled, which costs more than the paths)
      this.g.setTransform(1, 0, 0, 1, 0, 0);
      this.g.drawImage(pl, Math.round((this.ox + B.x - 4) * p), Math.round((this.oy + BOARD.y - 10 - 4) * p));
      this._logical();
    }
    _benchPlate(season, bw) {
      bw = Math.round(bw || (BOARD.w + 24));
      const k = 'bench' + season + 'w' + bw + '@' + this.px.toFixed(3);
      if (this._plates[k]) return this._plates[k];
      const ww = bw, hh = BOARD.h + 18, pad = 4, p = this.px, c = document.createElement('canvas');
      c.lw = ww + pad * 2 + 4; c.lh = hh + pad * 2 + 8;
      c.width = Math.ceil(c.lw * p); c.height = Math.ceil(c.lh * p);
      const g = c.getContext('2d'); g.scale(p, p); g.translate(pad, pad);
      this._benchDraw(g, season, 0, 0, ww, hh);
      this._plates[k] = c;
      return c;
    }
    _benchDraw(g, season, x, y, ww, hh) {
      const pal = CGF.Assets.palette || CGF.Assets.DEFAULT_PALETTE, p = pal[SEASON_INFO[season].key] || {};
      g.fillStyle = 'rgba(14,79,80,.20)'; rr(g, x + 4, y + 8, ww, hh, 22); g.fill();
      g.fillStyle = p.bench || '#f6e7c8'; rr(g, x, y, ww, hh, 22); g.fill();                       // opaque: nothing ghosts through
      g.fillStyle = 'rgba(255,255,255,.10)'; rr(g, x + 10, y + 10, ww - 20, hh - 20, 16); g.fill();
      g.lineWidth = 4; g.strokeStyle = '#b8936a'; rr(g, x, y, ww, hh, 22); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; rr(g, x + 6, y + 6, ww - 12, hh - 12, 17); g.stroke();
      // corner bolts
      g.fillStyle = '#c9a77c';
      [[x + 14, y + 14], [x + ww - 14, y + 14], [x + 14, y + hh - 14], [x + ww - 14, y + hh - 14]].forEach(([bx, by]) => { g.beginPath(); g.arc(bx, by, 4, 0, TAU); g.fill(); });
    }

    /* Card plates are pre-rendered per size (back with emblem; face) so a frame only blits them. */
    _plate(kind, cw, ch) {
      const k = kind + '|' + Math.round(cw) + 'x' + Math.round(ch) + '@' + this.px.toFixed(3);
      if (this._plates[k]) return this._plates[k];
      const p = this.px, pad = 2, c = document.createElement('canvas');
      c.width = Math.ceil((cw + pad * 2) * p); c.height = Math.ceil((ch + pad * 2) * p);
      const g = c.getContext('2d'); g.scale(p, p); g.translate(pad, pad);
      const r = Math.min(cw, ch) * 0.14;
      if (kind === 'back') {
        g.fillStyle = CARD.back; rr(g, 0, 0, cw, ch, r); g.fill();
        g.fillStyle = CARD.bevel; rr(g, 0, ch * 0.55, cw, ch * 0.45, r); g.fill();
        g.fillStyle = CARD.back; g.fillRect(0, ch * 0.55, cw, Math.min(r, ch * 0.1));
        g.strokeStyle = 'rgba(191,233,228,.35)'; g.lineWidth = 2; rr(g, cw * 0.09, ch * 0.08, cw * 0.82, ch * 0.84, r * 0.7); g.stroke();
        g.fillStyle = CARD.rivet;
        const ri = Math.max(2, Math.min(cw, ch) * 0.035);
        [[0.12, 0.1], [0.88, 0.1], [0.12, 0.9], [0.88, 0.9]].forEach(([a, b]) => { g.beginPath(); g.arc(cw * a, ch * b, ri, 0, TAU); g.fill(); });
        const em = CGF.Assets.img.card_emblem, es = cw * 0.58;
        if (em) g.drawImage(em, (cw - es) / 2, (ch - es) / 2, es, es);
        else { g.fillStyle = '#fff7e6'; g.beginPath(); g.arc(cw / 2, ch / 2, es * 0.3, 0, TAU); g.fill(); }
        g.lineWidth = 3; g.strokeStyle = CARD.edge; rr(g, 0, 0, cw, ch, r); g.stroke();
        g.fillStyle = 'rgba(255,255,255,.16)'; rr(g, cw * 0.06, ch * 0.05, cw * 0.88, ch * 0.18, r * 0.6); g.fill();
      } else {
        g.fillStyle = CARD.face; rr(g, 0, 0, cw, ch, r); g.fill();
        g.fillStyle = CARD.panel; rr(g, cw * 0.08, ch * 0.07, cw * 0.84, ch * 0.86, r * 0.7); g.fill();
        g.lineWidth = 3; g.strokeStyle = CARD.faceEdge; rr(g, 0, 0, cw, ch, r); g.stroke();
      }
      this._plates[k] = c;
      return c;
    }
    _gemOnCard(kind, s, alpha) {
      const g = this.g;
      if (kind === 'custom' && CGF.Assets.custom.gem) {
        const [fw, fh] = CGF.Assets.fit('gem', s, s);
        g.globalAlpha = alpha; this._draw('custom:gem', -fw / 2, -fh / 2, fw, fh); g.globalAlpha = 1; return;
      }
      g.globalAlpha = alpha;
      if (!this._draw('gem_' + kind, -s / 2, -s / 2, s, s)) {
        const i = Math.max(0, CGF.Assets.GEM_KINDS.indexOf(kind));
        g.fillStyle = 'hsl(' + (i * 30) + ',75%,55%)'; g.beginPath(); g.arc(0, 0, s * 0.38, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }
    _cards(w, mode) {
      const g = this.g, cfg = w.cfg || (CGF.CONFIG || {}), popTime = cfg.popTime || 0.6, wigT = cfg.wiggleTime || 0.4, a = w.alpha || 0;
      const cur = w.cursorOn && w.phase === 'playing' && mode !== 'title' ? w.cards[w.cursor] : null;
      for (const c of w.cards) {
        if (c.state === 'gone') continue;
        const ccx = c.cx != null ? c.cx : c.x + c.w / 2, ccy = c.cy != null ? c.cy : c.y + c.h / 2;
        // the deal slide is fast (~3000 px/s): interpolate it between 1/120 s steps like the comet, or it judders
        const dx = c.prevDealX != null ? lerp(c.prevDealX, c.dealX || 0, a) : (c.dealX || 0);
        let x = ccx + dx, y = ccy, scale = 1, alpha = 1;
        if (x - c.w / 2 > LW + this.ox + 20) continue;   // still waiting on the conveyor, off screen
        if (c.wiggleX != null) x += c.wiggleX; else if (c.wiggleT > 0) x += Math.sin(c.wiggleT * 48) * 6 * Math.min(1, c.wiggleT / wigT);
        const f = clamp(c.flip || 0, 0, 1), sxF = Math.max(0.02, Math.abs(Math.cos(Math.PI * f)));
        const liftPx = c.lift != null ? c.lift : Math.sin(Math.PI * f) * 6, lift = Math.sin(Math.PI * f);
        scale *= 1 + 0.07 * lift;
        let glow = 0;
        if (c.state === 'matched') {
          const k = clamp((c.popT || 0) / popTime, 0, 1);
          glow = 1 - k * 0.4;
          scale *= k < 0.55 ? 1 + 0.1 * Math.sin(k / 0.55 * Math.PI / 2) : 1.1 * (1 - (k - 0.55) / 0.45) + 0.0001;
          alpha = k < 0.55 ? 1 : 1 - (k - 0.55) / 0.45;
        }
        const cw = c.w, ch = c.h;
        // shadow (lifts away when the card is mid-flip)
        g.globalAlpha = 0.22 * alpha;
        g.fillStyle = '#0e3a3c';
        rr(g, x - cw * sxF * scale / 2 + 3 + liftPx * 0.6, y - ch * scale / 2 + 5 + liftPx, cw * sxF * scale, ch * scale, Math.min(cw, ch) * 0.14); g.fill();
        g.globalAlpha = 1;
        const face = f > 0.5, pl = this._plate(face ? 'face' : 'back', cw, ch), p = this.px, A = CGF.Assets;
        const gs = Math.min(cw, ch) * 0.74, gem = face && c.kind !== 'custom' && Math.abs(A.scale - p) < 0.01 ? A.sprite('gem_' + c.kind, gs, gs) : null;
        if ((f === 0 || f === 1) && scale === 1 && glow === 0 && alpha === 1 && !c.wiggleRot && !(c.wiggleT > 0) && (!face || gem)) {
          // a resting card: blit plate and gem 1:1 on whole device pixels (no resampling: ~4-6x cheaper on a CPU canvas)
          g.setTransform(1, 0, 0, 1, 0, 0);
          g.drawImage(pl, Math.round((this.ox + x - cw / 2 - 2) * p), Math.round((this.oy + y - liftPx - ch / 2 - 2) * p));
          if (gem) g.drawImage(gem, Math.round((this.ox + x - gs / 2) * p), Math.round((this.oy + y - liftPx - gs / 2) * p));
          this._logical();
        } else {
          g.save(); g.translate(x, y - liftPx); if (c.wiggleRot) g.rotate(c.wiggleRot); g.scale(sxF * scale, scale);
          if (glow > 0) { g.globalAlpha = 0.55 * glow * alpha; g.fillStyle = CARD.glow; rr(g, -cw / 2 - 7, -ch / 2 - 7, cw + 14, ch + 14, Math.min(cw, ch) * 0.2); g.fill(); g.globalAlpha = 1; }
          g.globalAlpha = alpha;
          g.drawImage(pl, -cw / 2 - 2, -ch / 2 - 2, cw + 4, ch + 4);
          g.globalAlpha = 1;
          if (face) this._gemOnCard(c.kind, gs, alpha * (c.state === 'matched' ? Math.max(0.25, 1 - (c.popT || 0) / (popTime * 0.4)) : 1));
          if (face && c.wiggleT > 0) { g.fillStyle = 'rgba(255,110,90,.16)'; rr(g, -cw / 2, -ch / 2, cw, ch, Math.min(cw, ch) * 0.14); g.fill(); }   // a soft "no" tint
          g.restore();
        }
        if (cur === c) {
          const pulse = 0.5 + 0.5 * Math.sin(this.t * 6);
          g.lineWidth = 4 + pulse * 2; g.strokeStyle = CARD.ring;
          rr(g, x - cw / 2 - 6, y - liftPx - ch / 2 - 6, cw + 12, ch + 12, Math.min(cw, ch) * 0.2); g.stroke();
        }
      }
    }

    _gizmo(w) {
      const g = this.g, gz = w.gizmo || { state: 'idle', stateT: 0 };
      const st = gz.state || 'idle', T = gz.stateT || 0;
      let sy = 1, sx = 1, bob = Math.sin(this.t * 2.2) * 2;
      if (st === 'eat') { const k = Math.min(1, T / 0.35); sy = 1 - 0.07 * Math.sin(k * Math.PI); sx = 1 + 0.05 * Math.sin(k * Math.PI); bob = 0; }
      else if (st === 'happy') { bob = -Math.abs(Math.sin(this.t * 9)) * 7; }
      else if (st === 'sleep') { bob = Math.sin(this.t * 1.2) * 1.5; sy = 0.98; }
      // floor shadow
      g.fillStyle = 'rgba(20,40,50,.22)'; g.beginPath(); g.ellipse(GIZMO.x, GIZMO.y + 2, 50, 9, 0, 0, TAU); g.fill();
      g.save(); g.translate(GIZMO.x, GIZMO.y + bob * 0); g.scale(sx, sy); g.translate(0, bob);
      if (!this._draw('gizmo_' + st, -64, -176, 128, 176) && !this._draw('gizmo_idle', -64, -176, 128, 176)) {
        g.fillStyle = '#7cc4ea'; rr(g, -44, -150, 88, 140, 20); g.fill(); g.fillStyle = '#ff7a59'; g.beginPath(); g.moveTo(-30, -176); g.lineTo(30, -176); g.lineTo(12, -150); g.lineTo(-12, -150); g.fill();
      }
      g.restore();
      if (st === 'sleep') { const k = mod(this.t, 2) / 2; this._text('z', GIZMO.x + 34 + k * 16, GIZMO.y - 150 - k * 30, 20 + k * 8, '#5f7fd0', 1 - k); }
    }
    _flyers(w, a) {
      const g = this.g;
      for (const f of (w.flyers || [])) {
        const x = ip(f, 'x', a), y = ip(f, 'y', a), r = ip(f, 'rot', a) || 0;
        // shrink with the transform, not the sprite size: a size that changes every frame meant a fresh SVG
        // rasterization per flyer per frame and a sprite cache that kept growing
        const k = f.T ? clamp(f.t / f.T, 0, 1) : 0, sc = 1 - 0.45 * k;
        // starts at the size the gem had on its card, so it visibly "leaves" the card; drawn at a fixed 56 px sprite
        const sz = (f.size || 56) / 56;
        g.save(); g.translate(x, y); g.rotate(r); g.scale(sc * sz, sc * sz);
        this._gemOnCard(f.kind, 56, 1);
        g.restore();
      }
    }
    _comet(w, a) {
      const cm = w.comet; if (!cm) return;
      const g = this.g, A = CGF.Assets;
      const x = ip(cm, 'x', a), y = ip(cm, 'y', a), rot = ip(cm, 'rot', a) || 0, st = cm.state || 'fly';
      const vx = cm.vx || 0;
      if (vx > 40) this.faceRight = true; else if (vx < -40) this.faceRight = false;
      const dir = this.faceRight ? 1 : -1, hover = st === 'sleep' ? 0 : Math.sin(this.t * 4.2) * 2.5;
      // shadow on the bench / floor
      g.fillStyle = 'rgba(20,40,50,.12)'; g.beginPath(); g.ellipse(x, Math.min(FLOOR_Y, y + 60), 22, 5, 0, 0, TAU); g.fill();
      const small = y < FLOOR_Y && x > BOARD.x ? 0.8 : 1;            // smaller while over the board: never hides a gem
      g.save(); g.translate(x, y + hover); g.rotate(rot); g.scale(dir * small, small);
      // rocket flame (behind the body): nozzle at (24,86) in the 120×110 box → (−25, +20) at the drawn 0.7 scale
      if (st !== 'sleep') {
        const fl = clamp(cm.flame != null ? cm.flame : 0.4, 0, 1), flick = 0.85 + 0.15 * Math.sin(this.t * 40);
        const len = (12 + fl * 22) * flick, nx = -25, ny = 20;
        g.save(); g.translate(nx, ny); g.rotate(0.75);
        const gr = g.createLinearGradient(0, 0, 0, len);
        gr.addColorStop(0, 'rgba(255,250,200,.95)'); gr.addColorStop(0.4, 'rgba(255,190,60,.9)'); gr.addColorStop(1, 'rgba(255,100,60,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(-6, 0); g.quadraticCurveTo(-5, len * 0.6, 0, len); g.quadraticCurveTo(5, len * 0.6, 6, 0); g.closePath(); g.fill();
        g.restore();
      }
      if (A.custom.hero) {
        const [fw, fh] = A.fit('hero', 80, 80), sq = 1 + 0.05 * Math.sin(this.t * 8);
        g.scale(1 / sq, sq);
        this._draw('custom:hero', -fw / 2, -fh / 2, fw, fh);
      } else {
        const key = st === 'happy' ? 'kitten_happy' : st === 'oops' ? 'kitten_oops' : st === 'sleep' ? 'kitten_sleep' : 'kitten_' + (Math.floor(this.t * 12) % 2);
        if (!this._draw(key, -42, -40.6, 84, 77) && !this._draw('kitten_0', -42, -40.6, 84, 77)) { g.fillStyle = '#ff9f43'; g.beginPath(); g.arc(0, 0, 26, 0, TAU); g.fill(); }
      }
      g.restore();
      if (st === 'sleep') { const k = mod(this.t + 1, 2) / 2; this._text('z', x + 26 + k * 12, y - 34 - k * 24, 16 + k * 6, '#5f7fd0', 1 - k); }
    }

    _juice() {
      const g = this.g;
      for (const r of this.rings) {
        const k = r.t / r.life;
        g.strokeStyle = 'rgba(' + r.col + ',' + (1 - k).toFixed(3) + ')'; g.lineWidth = r.w * (1 - k) + 0.5;
        g.beginPath(); g.arc(r.x, r.y, r.r + k * 26, 0, TAU); g.stroke();
      }
      for (const t of this.texts) {
        if (t.hud) continue;
        this._oneText(t);
      }
    }
    _oneText(t, rise) {
      const tt = t.t - (t.delay || 0); if (tt < 0) return;
      const k = tt / t.life, pop = Math.min(1, tt / 0.12);
      const fade = t.fadeLate ? (k > 0.5 ? (1 - k) / 0.5 : 1) : (k > 0.7 ? (1 - k) / 0.3 : 1);
      this._text(t.text, t.x, t.y - k * (rise != null ? rise : t.fadeLate ? 44 : 30), Math.round(t.size * (0.7 + 0.3 * pop)), t.col, fade);
    }

    _hud(w) {
      const g = this.g, sf = this.safe || { l: 0, r: 0, t: 0 };
      const top = Math.max(-this.oy + sf.t, Math.min(0, -86)) + 10;   // tall screens: the HUD hugs the top of the factory, clear of the HTML buttons
      const pill = (x, y, ww, hh, fill) => {
        g.fillStyle = fill || 'rgba(255,247,230,.88)'; g.strokeStyle = 'rgba(14,79,80,.45)'; g.lineWidth = 2.5;
        rr(g, x, y, ww, hh, hh / 2); g.fill(); g.stroke();
      };
      // score (left)
      const left = Math.max(16, -this.ox + 16 + sf.l);
      pill(left, top, 168, 44);
      this._draw('gem_star', left + 8, top + 6, 32, 32);
      g.textAlign = 'left';
      this._textL(String(w.score || 0), left + 48, top + 23, 30, '#e0662a');
      // fuel gauge (centre)
      const gx = 270, gw = 280, gy = top + 8, gh = 28;
      const lim = Math.max(1, w.timeLimit || 60), tl = Math.max(0, w.timeLeft != null ? w.timeLeft : lim), k = clamp(tl / lim, 0, 1);
      const low = tl < 10 && w.phase === 'playing', vlow = tl < 5 && w.phase === 'playing';
      const pulse = low ? 1 + 0.06 * Math.max(0, 1 - this.hurryT / 0.4) : 1;
      g.save(); g.translate(gx + gw / 2, gy + gh / 2); g.scale(pulse, pulse); g.translate(-(gx + gw / 2), -(gy + gh / 2));
      pill(gx - 46, gy - 8, gw + 100, gh + 16);
      // little clock
      g.fillStyle = '#fff'; g.strokeStyle = '#0e4f50'; g.lineWidth = 3; g.beginPath(); g.arc(gx - 22, gy + gh / 2, 13, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = '#e0662a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(gx - 22, gy + gh / 2); g.lineTo(gx - 22 + 8 * Math.sin(k * TAU), gy + gh / 2 - 8 * Math.cos(k * TAU)); g.stroke();
      g.fillStyle = 'rgba(14,79,80,.18)'; rr(g, gx, gy, gw, gh, gh / 2); g.fill();
      const col = vlow ? (Math.floor(this.t * 4) % 2 ? '#ff4d4d' : '#e5483c') : low ? '#ff9f43' : k < 0.5 ? '#f2c230' : '#5cc65a';
      if (k > 0.001) { g.fillStyle = col; rr(g, gx + 2, gy + 2, Math.max(gh - 4, (gw - 4) * k), gh - 4, (gh - 4) / 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)'; rr(g, gx + 8, gy + 5, Math.max(4, (gw - 16) * k), 6, 3); g.fill(); }
      this._textL(Math.ceil(tl) + 's', gx + gw + 8, gy + gh / 2 + 1, 20, low ? '#e5483c' : '#0e4f50');
      g.restore();
      // season dots under the gauge
      for (let i = 0; i < 4; i++) {
        g.fillStyle = SEASON_INFO[i].banner; g.globalAlpha = i === (w.season != null ? w.season : 0) ? 1 : 0.35;
        g.beginPath(); g.arc(gx + gw / 2 - 27 + i * 18, gy + gh + 13, i === w.season ? 6.5 : 5, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
      // "+Ns" pops under the seconds label; several in a row stack 22 px apart
      let hi = 0;
      for (const t of this.texts) if (t.hud) { t.x = gx + gw - 6; t.y = gy + gh + 22 + 22 * (t.slot || 0); this._oneText(t, 12); hi++; }   // under the seconds label, clear of the combo meter
      // combo meter (right of the gauge)
      const cx = 628, cy = top + 4;
      const mult = Math.max(1, w.mult || 1);
      pill(cx - 8, cy, 158, 40);
      for (let i = 0; i < 5; i++) {
        const on = this.dispCombo * 5 > i + 0.02;
        g.fillStyle = on ? ['#5cc65a', '#9ad33b', '#f2c230', '#ff9f43', '#ff5a7a'][i] : 'rgba(14,79,80,.18)';
        rr(g, cx + 4 + i * 19, cy + 12, 15, 16, 5); g.fill();
      }
      const bp = this.comboPop < 0.35 ? 1 + 0.35 * Math.sin(this.comboPop / 0.35 * Math.PI) : 1;
      const dropShake = this.comboDrop < 0.35 ? Math.sin(this.comboDrop * 50) * 3 : 0;
      g.save(); g.translate(cx + 124 + dropShake, cy + 20); g.scale(bp, bp);
      const gr = g.createRadialGradient(-5, -6, 2, 0, 0, 22);
      gr.addColorStop(0, '#fff6d0'); gr.addColorStop(0.6, mult > 1 ? '#ffb43a' : '#ffe9a0'); gr.addColorStop(1, mult > 1 ? '#e0662a' : '#f2c230');
      g.fillStyle = gr; g.strokeStyle = '#7a3a10'; g.lineWidth = 2.5; g.beginPath(); g.arc(0, 0, 23, 0, TAU); g.fill(); g.stroke();
      this._text('×' + mult, 0, 1, 22, '#ffffff', 1, '#7a3a10');
      g.restore();
    }
    _textL(s, x, y, size, col) {
      const g = this.g;
      g.font = '900 ' + size + 'px "Segoe UI Black","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
      g.textAlign = 'left'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.lineWidth = Math.max(3, size * 0.16); g.strokeStyle = '#fff'; g.strokeText(s, x, y);
      g.fillStyle = col; g.fillText(s, x, y);
    }
    /* Small messages ride on the conveyor strip below the board, so they never cover a card. */
    _ribbon() {
      const r = this.ribbon, g = this.g, k = r.t;
      const al = k < 0.2 ? k / 0.2 : (r.life < 50 && k > r.life - 0.3) ? Math.max(0, (r.life - k) / 0.3) : 1;
      const size = 28, y = 507, x = 540;
      g.font = '900 ' + size + 'px "Segoe UI Black","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
      const tw = g.measureText(r.text).width + 48;
      g.globalAlpha = al;
      g.fillStyle = 'rgba(255,247,230,.95)'; g.strokeStyle = r.col; g.lineWidth = 4;
      const pop = k < 0.2 ? 0.85 + 0.15 * (k / 0.2) : 1;
      g.save(); g.translate(x, y); g.scale(pop, pop); rr(g, -tw / 2, -22, tw, 44, 22); g.fill(); g.stroke(); g.restore();
      g.globalAlpha = 1;
      this._text(r.text, x, y + 1, Math.round(size * pop), r.col, al, '#fffaf0');
    }
    _banner() {
      const b = this.banner, k = b.t, al = k < 0.25 ? k / 0.25 : (b.life < 50 && k > b.life - 0.5) ? Math.max(0, (b.life - k) / 0.5) : 1;
      const y = 250, sz = Math.round(56 * (0.8 + 0.2 * Math.min(1, k / 0.25)));
      const g = this.g;
      g.globalAlpha = al * 0.9; g.fillStyle = 'rgba(255,250,240,.9)'; rr(g, 540 - 260, y - 50, 520, b.sub ? 128 : 96, 30); g.fill(); g.globalAlpha = 1;
      this._text(b.text, 540, y, sz, b.col, al, '#fffaf0');
      if (b.sub) this._text(b.sub, 540, y + 50, 24, '#7a4222', al, '#fffaf0');
    }
    _debug(w) {
      const g = this.g;
      g.lineWidth = 1.5; g.strokeStyle = '#ff00aa'; g.fillStyle = '#ff00aa'; g.font = 'bold 12px sans-serif'; g.textAlign = 'left';
      w.cards.forEach((c, i) => { g.strokeRect(c.x, c.y, c.w, c.h); g.fillText(i + ':' + c.kind + (c.seen ? '*' : ''), c.x + 3, c.y + 12); });
      g.strokeRect(BOARD.x, BOARD.y, BOARD.w, BOARD.h);
      g.beginPath(); g.arc(HOPPER.x, HOPPER.y, 6, 0, TAU); g.stroke();
    }
  }
  Renderer.BOARD = BOARD; Renderer.GIZMO = GIZMO; Renderer.HOPPER = HOPPER;
  CGF.Renderer = Renderer;
})(window.CGF = window.CGF || {});
