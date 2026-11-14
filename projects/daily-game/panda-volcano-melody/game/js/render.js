/* PVM.Renderer — draws Tofu's Volcano Melody on a canvas.
 * The 960×540 logical stage is fitted with "contain"; the letterbox is filled with the tileable sea (the
 * ground art's outer edge is exactly the sea colour, so the island floats in one continuous ocean).
 * Order: sea → ground (crossfade between seasons) → tint → ground particles → landing marks → shadows
 *        → y-sorted props / volcano / crabs / notes / mango / Tofu → flying notes → Coco → air particles
 *        → front particles → juice (rings, "+N") → HUD → banners.
 * Moving things are interpolated between fixed simulation steps (world.alpha). Background layers are
 * rasterized once per scale and blitted pixel-exact. */
(function (PVM) {
  'use strict';
  const LW = 960, LH = 540, TAU = Math.PI * 2;
  const SEASON_INFO = [
    { key: 'spring', name: 'Spring' }, { key: 'summer', name: 'Summer' },
    { key: 'autumn', name: 'Autumn' }, { key: 'winter', name: 'Winter' }
  ];
  const PSIZE = { blossom: [20, 20], butterfly: [24, 20], sunmote: [16, 16], leaf: [20, 20], snowflake: [24, 24], smoke: [64, 64], dust: [32, 32], sparkle: [32, 32], spark: [12, 12], ripple: [48, 24] };
  const PROP_SIZE = { palm: [96, 120], rock: [70, 56], bush: [80, 64] };
  const NOTE_COL = ['#e8383c', '#2f7de0', '#2fae4a', '#9b4fd6'];

  const lerp = (a, b, t) => a + (b - a) * t;
  const mod = (a, n) => ((a % n) + n) % n;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function rr(g, x, y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }
  function ix(o, a) { return o.prevX != null ? lerp(o.prevX, o.x, a) : o.x; }
  function iy(o, a) { return o.prevY != null ? lerp(o.prevY, o.y, a) : o.y; }
  function iz(o, a) { return o.z == null ? 0 : (o.prevZ != null ? lerp(o.prevZ, o.z, a) : o.z); }
  /* the few raster sizes a particle sprite is cached at (prewarm and draw must ask for the same key) */
  function partBox(sprite, w) { const ps = PSIZE[sprite] || [16, 16], bw = Math.ceil(ps[0] * 1.5 / 8) * 8 * (w > ps[0] * 1.5 ? 2 : 1); return [bw, bw * ps[1] / ps[0]]; }
  function pal(season) { const P = PVM.Assets.palette || PVM.Assets.DEFAULT_PALETTE; return P[SEASON_INFO[mod(season, 4)].key] || PVM.Assets.DEFAULT_PALETTE.spring; }

  class Renderer {
    constructor(canvas) {
      this.c = canvas; this.g = canvas.getContext('2d', { alpha: false });
      this.px = 1; this.cssScale = 1; this.maxPx = 0;
      this.VW = LW; this.VH = LH; this.ox = 0; this.oy = 0;
      this.vis = { cur: 0, prev: -1, k: 1 };
      this.texts = []; this.rings = [];
      this.shake = 0; this.t = 0; this.banner = null; this.ribbon = null;
      this.comboPop = 9; this.meterPop = 9; this.heartPop = 9; this.dispGot = 0;
      this.insets = { top: 0, right: 0, bottom: 0, left: 0 };
      this.hudRight = LW - 110;
      this._spr = { clear: () => { PVM.Assets._cache.clear(); PVM.Assets._stale = null; this._bgCache = {}; this._bgStale = null; } };
      this._bgCache = {};
    }
    static get SEASON_INFO() { return SEASON_INFO; }

    resize(insets) {
      if (insets) this.insets = insets;
      const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight), dpr = window.devicePixelRatio || 1;
      const stale = Object.assign({}, this._bgStale);
      for (let s = 0; s < 4; s++) { const L = this._cachedGround(s); if (L) stale[s] = L; }
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
      PVM.Assets.setScale(px);
      this._bgCache = {}; this._seaPat = null; this._bgStale = stale;
      this._measureHud();
      this.prewarm(this.vis.cur); this.prewarm(this.vis.cur + 1);
    }
    _measureHud() {
      const k = 1 / this.cssScale, i = this.insets || {};
      this.safe = { l: (i.left || 0) * k, r: (i.right || 0) * k, t: (i.top || 0) * k, b: (i.bottom || 0) * k };
      const b = document.getElementById('hud');
      if (b && !b.classList.contains('hidden')) {
        const r = b.getBoundingClientRect();
        if (r.width > 0) { this.hudRight = r.left * k - this.ox - 10; this.hudBottom = r.bottom * k - this.oy; }
      }
    }
    /* CSS px (relative to the canvas' top-left) → logical stage coordinates */
    toLogical(cx, cy) { return [cx / this.cssScale - this.ox, cy / this.cssScale - this.oy]; }

    attach(world, weather) {
      this.world = world; this.weather = weather; this.texts.length = 0; this.rings.length = 0; this.shake = 0;
      this.banner = null; this.ribbon = null; this.comboPop = 9; this.meterPop = 9; this.heartPop = 9; this.dispGot = 0;
      this._lastHearts = world ? world.hearts : 0;
    }
    setLevel(season, instant) {
      season = mod(season, 4);
      if (instant || season === this.vis.cur) this.vis = { cur: season, prev: -1, k: 1 };
      else this.vis = { cur: season, prev: this.vis.cur, k: 0 };
      const keep = [season, mod(season + 1, 4), this.vis.prev];
      for (const k in this._bgCache) {
        const m = /^(?:ground_(\w+)|cg(\d))@/.exec(k); if (!m) continue;
        const s = m[1] ? SEASON_INFO.findIndex(i => i.key === m[1]) : +m[2];
        if (!keep.includes(s)) delete this._bgCache[k];
      }
      this.prewarm(season); this.prewarm(season + 1);
    }

    /* ---------- cached layers ---------- */
    _layer(key, w, h) {
      const ck = key + '@' + this.px.toFixed(4);
      let c = this._bgCache[ck];
      if (c) return c;
      const src = PVM.Assets.img[key];
      if (!src) return null;
      c = document.createElement('canvas');
      c.width = Math.round(w * this.px); c.height = Math.round(h * this.px);
      c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
      this._bgCache[ck] = c;
      return c;
    }
    /* The ground of a season; with a custom "meadow" picture, the picture covers the island inside the beach. */
    _ground(season) {
      const key = 'ground_' + SEASON_INFO[mod(season, 4)].key, A = PVM.Assets;
      if (!A.custom.ground) return this._layer(key, LW, LH);
      const ck = 'cg' + season + '@' + this.px.toFixed(4) + '|' + (A._ver || 0);
      if (this._bgCache[ck]) return this._bgCache[ck];
      for (const k in this._bgCache) if (k.startsWith('cg' + season + '@')) delete this._bgCache[k];
      const base = this._layer(key, LW, LH);
      const c = document.createElement('canvas'); c.width = Math.round(LW * this.px); c.height = Math.round(LH * this.px);
      const g = c.getContext('2d'), p = this.px;
      if (base) g.drawImage(base, 0, 0);
      const src = A.custom.ground, bx = 28, by = 80, bw = LW - 56, bh = LH - 80 - 18;
      const k = Math.max(bw / src.width, bh / src.height), dw = src.width * k, dh = src.height * k;
      g.save(); g.scale(p, p); rr(g, bx, by, bw, bh, 26); g.clip();
      // soften a photo so Tofu, the crabs and the notes stay readable on it (filter where supported + a light wash)
      try { g.filter = 'saturate(.55) contrast(.7) brightness(1.1)'; } catch (e) { /* old Safari */ }
      g.drawImage(src, bx + (bw - dw) / 2, by + (bh - dh) / 2, dw, dh);
      g.filter = 'none';
      g.fillStyle = 'rgba(255,250,235,.28)'; g.fillRect(bx, by, bw, bh);
      g.restore();
      this._bgCache[ck] = c;
      return c;
    }
    /* the ground layer if it is already rasterized at the current scale (never rasterizes) */
    _cachedGround(season) {
      season = mod(season, 4);
      const A = PVM.Assets, px = this.px.toFixed(4);
      return this._bgCache[A.custom.ground ? 'cg' + season + '@' + px + '|' + (A._ver || 0) : 'ground_' + SEASON_INFO[season].key + '@' + px] || null;
    }
    /* for the frame: current-scale layer, else the old-scale stand-in after a resize, else rasterize now */
    _groundNow(season) { return this._cachedGround(season) || (this._bgStale && this._bgStale[mod(season, 4)]) || this._ground(season); }
    _sea() {
      if (this._seaPat) return this._seaPat;
      const L = this._layer('sea', 240, 240); if (!L) return null;
      this._seaPat = this.g.createPattern(L, 'repeat');
      return this._seaPat;
    }
    prewarm(season) {
      season = mod(season, 4);
      const key = SEASON_INFO[season].key, jobs = this._warmJobs || (this._warmJobs = []);
      const add = (id, fn) => { if (!jobs.some(j => j.id === id)) jobs.push({ id, fn }); };
      add('ground_' + key, () => this._force(this._ground(season)));
      add('sea', () => this._force(this._layer('sea', 240, 240)));
      add('props_' + key, () => {
        const A = PVM.Assets, list = [[season === 3 ? 'volcano_winter' : 'volcano', 216, 180]];
        ['palm', 'rock', 'bush'].forEach(k => list.push([k + '_' + key, PROP_SIZE[k][0], PROP_SIZE[k][1]]));
        A.warm(list);
      });
      add('chars', () => {
        const list = [];
        ['idle', 'walk1', 'walk2', 'happy', 'hurt', 'sleep'].forEach(f => list.push(['tofu_' + f, 72, 72]));
        ['1', '2', 'dizzy'].forEach(f => list.push(['crab_' + f, 56, 45]));
        list.push(['coco_1', 64, 53], ['coco_2', 64, 53], ['coco_1', 40, 33], ['mango', 36, 36], ['heart_full', 26, 24], ['heart_empty', 26, 24], ['p_sparkle', 24, 24]);
        [0, 1, 2, 3].forEach(k => list.push(['note_' + k, 40, 40], ['note_' + k, 22, 22]));
        PVM.Assets.warm(list);
      });
      const ps = { spring: ['blossom'], summer: ['sunmote', 'butterfly'], autumn: ['leaf'], winter: ['snowflake'] }[key];
      add('parts_' + key, () => PVM.Assets.warm(ps.concat(['smoke', 'dust', 'ripple', 'sparkle', 'spark']).map(p => ['p_' + p].concat(partBox(p, 0)))));
      this._pumpWarm();
    }
    _pumpWarm() {
      if (!this._warmJobs || !this._warmJobs.length) { if (!this._warmT) this._bgStale = null; return; }   // all new layers ready
      if (this._warmT) return;
      const ric = window.requestIdleCallback ? (f => window.requestIdleCallback(f, { timeout: 300 }))
                                             : (f => setTimeout(() => f({ timeRemaining: () => 0 }), 40));   // iOS Safari: no rIC
      this._warmT = ric(dl => {
        this._warmT = 0;
        do { const j = this._warmJobs.shift(); if (!j) break; try { j.fn(); } catch (e) { /* missing art: fallbacks */ } }
        while (this._warmJobs.length && dl.timeRemaining() > 12);
        this._pumpWarm();
      });
    }
    _force(c) { if (c) { try { c.getContext('2d').getImageData(0, 0, 1, 1); } catch (e) { /* ignore */ } } return c; }
    _draw(key, x, y, w, h) { const s = PVM.Assets.sprite(key, w, h); if (s) { this.g.drawImage(s, x, y, w, h); return true; } return false; }

    /* ---------- events → juice ---------- */
    onEvents(evts) {
      const wx = this.weather, w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'intro': {
            const s = mod(e.season != null ? e.season : e.level, 4), P = pal(s);
            this.banner = null;
            this.ribbon = { text: SEASON_INFO[s].name + ((w && w.loop > 0) ? ' · Year ' + (w.loop + 1) : ''), sub: 'Catch ' + (w ? w.goal : 10) + ' notes!', t: 0, life: 1.6, col: P.banner };
            this.dispGot = 0;
            break;
          }
          case 'go': this.ribbon = { text: 'Go!', t: 0, life: 0.8, col: '#3c9a3d' }; break;
          case 'step': if (wx && Math.random() < 0.8) wx.dust(e.x, e.y); break;
          case 'pop': this.rings.push({ x: e.x, y: e.y, r: 10, t: 0, life: 0.45, col: '255,255,255', w: 3, flat: true }); break;
          case 'rumble': this.shake = Math.max(this.shake, 0.25); this._shakeAmp = 2; break;
          case 'erupt': if (wx) { wx.smoke(PVM.CRATER.x, PVM.CRATER.y); wx.smoke(PVM.CRATER.x - 8, PVM.CRATER.y + 4); wx.burst('stars', PVM.CRATER.x, PVM.CRATER.y, 8); } break;
          case 'land': if (wx) { wx.ripple(e.x, e.y); wx.dust(e.x, e.y); } break;
          case 'note': {
            const col = NOTE_COL[e.kind || 0];
            if (wx) { wx.burst('sparkle', e.x, e.y - 22, 6); wx.burst('spark', e.x, e.y - 22, 4); }
            this.rings.push({ x: e.x, y: e.y - 22, r: 14, t: 0, life: 0.4, col: '255,240,170', w: 4 });
            this.texts.push({ x: e.x, y: e.y - 58, text: '+' + e.score, t: 0, life: 0.8, col, size: 28 });
            if (e.combo >= 2) { this.comboPop = 0; if (e.combo === 5 || e.combo % 10 === 0) this.texts.push({ x: e.x, y: e.y - 88, text: 'Combo ×' + e.combo + '!', t: 0, life: 0.95, col: '#e0662a', size: 24, delay: 0.06 }); }
            this.meterPop = 0;
            break;
          }
          case 'comboEnd': break;
          case 'helperIn': this.ribbon = { text: 'Coco is here to help!', t: 0, life: 1.5, col: '#2fae4a' }; break;
          case 'pinch': this.shake = 0.35; this._shakeAmp = 6; this.heartPop = 0; if (wx) wx.burst('stars', e.x, e.y - 50, 7); this.texts.push({ x: e.x, y: e.y - 80, text: 'Ouch!', t: 0, life: 0.8, col: '#d94a3a', size: 26 }); break;
          case 'mangoPop': this.rings.push({ x: e.x, y: e.y, r: 12, t: 0, life: 0.6, col: '255,190,60', w: 4, flat: true }); break;
          case 'mango': this.heartPop = 0; if (wx) wx.burst('sparkle', e.x, e.y - 20, 10); this.texts.push({ x: e.x, y: e.y - 60, text: '+1 ♥', t: 0, life: 0.9, col: '#ff4d6a', size: 28 }); break;
          case 'fade': break;
          case 'levelClear': {
            const s = mod(e.level, 4), P = pal(s);
            if (wx) { wx.burst('confetti', 480, 150, 60); wx.burst('sparkle', 480, 270, 12); }
            this.banner = { text: SEASON_INFO[s].name + ' song done!', sub: 'Bonus +' + (e.bonus || 0) + (e.perfect ? '  ·  Perfect!' : ''), t: 0, life: 2.5, col: P.banner };
            this.ribbon = null;
            break;
          }
          case 'gameOver': this.banner = { text: 'Nap time!', sub: 'Tofu is a sleepy panda…', t: 0, life: 99, col: '#6f86c8' }; this.ribbon = null; break;
        }
      }
    }

    update(dt) {
      this.t += dt;
      const w = this.world, wx = this.weather;
      if (wx) wx.update(dt);
      if (this.vis.k < 1) { this.vis.k = Math.min(1, this.vis.k + dt / 1.2); if (this.vis.k >= 1) this.vis.prev = -1; }
      for (const a of [this.texts, this.rings]) { for (let i = a.length - 1; i >= 0; i--) { a[i].t += dt; if (a[i].t >= a[i].life + (a[i].delay || 0)) a.splice(i, 1); } }
      this.shake = Math.max(0, this.shake - dt);
      this.comboPop += dt; this.meterPop += dt; this.heartPop += dt;
      if (this.banner) { this.banner.t += dt; if (this.banner.t > this.banner.life) this.banner = null; }
      if (this.ribbon) { this.ribbon.t += dt; if (this.ribbon.t > this.ribbon.life) this.ribbon = null; }
      if (w) this.dispGot += ((w.got || 0) - this.dispGot) * Math.min(1, dt * 10);
    }

    /* ---------- frame ---------- */
    draw(mode) {
      const g = this.g, p = this.px, w = this.world;
      const a = w && w.alpha != null ? w.alpha : 0;
      g.setTransform(1, 0, 0, 1, 0, 0);
      let sx = 0, sy = 0;
      if (this.shake > 0) { const m = (this._shakeAmp || 4) * Math.min(1, this.shake / 0.25); sx = Math.sin(this.t * 71) * m; sy = Math.cos(this.t * 53) * m; }
      const gx = Math.round((this.ox + sx) * p), gy = Math.round((this.oy + sy) * p), gw = Math.round(LW * p), gh = Math.round(LH * p);
      const cur = this._groundNow(this.vis.cur), CW = this.c.width, CH = this.c.height;
      // 1. sea, drifting slowly — only where the opaque ground will not cover it (the pattern fill was ~⅓ of the frame)
      if (!cur || gx > 0 || gy > 0 || gx + gw < CW || gy + gh < CH) {
        g.save();
        if (cur) { g.beginPath(); g.rect(0, 0, CW, CH); g.rect(gx + 1, gy + 1, gw - 2, gh - 2); g.clip('evenodd'); }
        const pat = this._sea();
        if (pat) {
          const dx = (this.t * 6) % 240, dy = Math.sin(this.t * 0.4) * 6;
          g.setTransform(1, 0, 0, 1, Math.round((this.ox - dx) * p), Math.round((this.oy + dy) * p));
          g.fillStyle = pat; g.fillRect(-(this.ox - dx + 240) * p, -(this.oy + 240) * p, CW + 480 * p, CH + 480 * p);
        } else { g.fillStyle = pal(this.vis.cur).sea || '#4cb8c4'; g.fillRect(0, 0, CW, CH); }
        g.restore();
      }
      // 2. ground (pixel-exact), crossfading between seasons
      if (cur) g.drawImage(cur, gx, gy, gw, gh);
      if (this.vis.prev >= 0 && this.vis.k < 1) { const pr = this._groundNow(this.vis.prev); if (pr) { g.globalAlpha = 1 - this.vis.k; g.drawImage(pr, gx, gy, gw, gh); g.globalAlpha = 1; } }

      g.setTransform(p, 0, 0, p, (this.ox + sx) * p, (this.oy + sy) * p);
      const P = pal(this.vis.cur);
      // letterbox: blend the island picture's flat sea edge into the wavy tiled sea (no visible band)
      if (cur && (this.ox > 1 || this.oy > 1)) this._seaBlend(P.sea || '#4cb8c4');
      if (P.tintAlpha > 0) { g.globalAlpha = P.tintAlpha; g.fillStyle = P.tint; g.fillRect(0, 0, LW, LH); g.globalAlpha = 1; }
      if (w) {
        this._particles('ground');
        this._landMarks(w);
        this._shadows(w, a);
        this._sorted(w, a);
        this._coco(w, a);
      }
      this._particles('air');
      this._particles('front');
      this._juice();
      if (w && this.debugView) this._debug(w, a);
      // HUD + banners (no shake)
      g.setTransform(p, 0, 0, p, this.ox * p, this.oy * p);
      if (mode !== 'title' && w) this._hud(w);
      this._banners(mode);
      if (mode === 'over') this._napBeside();
    }

    _particles(layer) {
      const wx = this.weather; if (!wx) return;
      const g = this.g;
      for (const q of wx.particles) {
        if (q.layer !== layer || q.alpha <= 0.01) continue;
        g.globalAlpha = clamp(q.alpha, 0, 1);
        if (q.sprite === 'confetti') {
          g.save(); g.translate(q.x, q.y); g.rotate(q.rot || 0); g.scale(q.flipX || 1, 1);
          g.fillStyle = q.color || '#ffd23f'; g.fillRect(-q.size / 2, -q.size * 0.3, q.size, q.size * 0.6); g.restore();
          continue;
        }
        const ps = PSIZE[q.sprite] || [16, 16], w = q.size, h = q.size * ps[1] / ps[0];
        const bb = partBox(q.sprite, w);   // cache a few raster sizes only
        const s = PVM.Assets.sprite('p_' + q.sprite, bb[0], bb[1]);
        if (!s) continue;
        if (q.color && q.sprite === 'sparkle') { /* tinted stars: draw a soft dot of the colour behind */ g.fillStyle = q.color; g.beginPath(); g.arc(q.x, q.y, w * 0.18, 0, TAU); g.fill(); }
        if ((q.rot || 0) !== 0 || (q.flipX || 1) !== 1) {
          g.save(); g.translate(q.x, q.y); g.rotate(q.rot || 0); g.scale(q.flipX || 1, 1);
          g.drawImage(s, -w / 2, -h / 2, w, h); g.restore();
        } else g.drawImage(s, q.x - w / 2, q.y - h / 2, w, h);
      }
      g.globalAlpha = 1;
    }

    /* where a volcano note will land: a soft pulsing ring (kids read it like the shadow) */
    _landMarks(w) {
      const g = this.g;
      for (const n of w.notes) {
        if (n.state !== 'fly' || n.landX == null) continue;
        const k = 0.5 + 0.5 * Math.sin(this.t * 10 + n.id);
        g.strokeStyle = 'rgba(255,248,220,' + (0.35 + 0.35 * k).toFixed(3) + ')'; g.lineWidth = 2.5;
        g.beginPath(); g.ellipse(n.landX, n.landY, 15 + 3 * k, 7 + 1.5 * k, 0, 0, TAU); g.stroke();
      }
    }
    _shadow(x, y, rx, ry, al) { const g = this.g; g.fillStyle = 'rgba(28,40,24,' + al.toFixed(3) + ')'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
    _shadows(w, a) {
      const T = w.tofu;
      this._shadow(ix(T, a), iy(T, a) - 1, 22, 7, 0.24);
      for (const c of w.crabs) this._shadow(ix(c, a), iy(c, a) - 2, 19, 6, c.state === 'enter' ? 0.1 : 0.22);
      for (const n of w.notes) { const z = iz(n, a), k = 1 / (1 + z / 120); this._shadow(ix(n, a), iy(n, a), 13 * k, 5 * k, 0.22 * k); }
      if (w.mango) { const m = w.mango, z = iz(m, a), k = 1 / (1 + z / 120); this._shadow(ix(m, a), iy(m, a), 13 * k, 5 * k, 0.22 * k); }
      if (w.coco) { const c = w.coco, z = iz(c, a), k = 1 / (1 + z / 90); this._shadow(ix(c, a), iy(c, a), 20 * k, 6 * k, 0.2 * k); }
    }

    _sorted(w, a) {
      const list = [];
      for (const o of (w.obstacles || [])) list.push({ y: o.y, k: 'obs', o });
      for (const c of w.crabs) list.push({ y: iy(c, a), k: 'crab', o: c });
      const flying = [];
      for (const n of w.notes) { if (n.state === 'fly' && iz(n, a) > 24) flying.push(n); else list.push({ y: iy(n, a), k: 'note', o: n }); }
      if (w.mango) list.push({ y: iy(w.mango, a), k: 'mango', o: w.mango });
      list.push({ y: iy(w.tofu, a), k: 'tofu', o: w.tofu });
      list.sort((A, B) => A.y - B.y);
      for (const it of list) {
        if (it.k === 'obs') this._obstacle(it.o, w);
        else if (it.k === 'crab') this._crab(it.o, a);
        else if (it.k === 'note') this._note(it.o, a, w);
        else if (it.k === 'mango') this._mango(it.o, a);
        else this._tofu(w, a);
      }
      for (const n of flying) this._note(n, a, w);
    }

    /* 1 normally; lower when Tofu stands behind this obstacle (so a child never loses sight of him) */
    _seeThrough(o, w, halfW, height, al) {
      const T = w.tofu, dx = Math.abs(T.x - o.x), dy = o.y - T.y;
      if (dy > 0 && dy < height && dx < halfW) return al;
      return 1;
    }
    _obstacle(o, w) {
      const g = this.g, key = SEASON_INFO[this.vis.cur].key;
      if (o.kind === 'volcano') {
        g.globalAlpha = this._seeThrough(o, w, 96, 150, 0.6);
        const V = w.volcano || {}, x = PVM.VOLCANO.x, y = PVM.VOLCANO.y;
        let sxk = 1, syk = 1, rot = 0;
        if (V.rumbleT > 0) { const k = V.rumbleT; rot = Math.sin(this.t * 38) * 0.02; sxk = 1 + 0.02 * Math.sin(this.t * 31); syk = 1 - 0.015 * Math.sin(this.t * 31) + 0.02 * (1 - k); }
        if (V.puffT > 0) { const k = V.puffT / 0.6; syk *= 1 + 0.08 * Math.sin(k * Math.PI); sxk *= 1 - 0.04 * Math.sin(k * Math.PI); }
        const sp = this.vis.cur === 3 ? 'volcano_winter' : 'volcano';
        g.save(); g.translate(x, y); g.rotate(rot); g.scale(sxk, syk);
        if (!this._draw(sp, -108, -171, 216, 180)) { g.fillStyle = '#8a5a3c'; g.beginPath(); g.moveTo(-100, 0); g.lineTo(-30, -130); g.lineTo(30, -130); g.lineTo(100, 0); g.fill(); }
        g.restore();
        // crater glow while rumbling / erupting
        const glow = Math.max(V.rumbleT > 0 ? 0.5 + 0.5 * Math.sin(this.t * 20) : 0, V.puffT > 0 ? V.puffT / 0.6 : 0);
        if (glow > 0.02) {
          const C = PVM.CRATER, rg = g.createRadialGradient(C.x, C.y, 2, C.x, C.y, 46);
          rg.addColorStop(0, 'rgba(255,200,150,' + (0.55 * glow).toFixed(3) + ')'); rg.addColorStop(1, 'rgba(255,160,140,0)');
          g.fillStyle = rg; g.beginPath(); g.arc(C.x, C.y, 46, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
        return;
      }
      const S = PROP_SIZE[o.kind] || [70, 56];
      const pop = this.vis.k < 1 ? clamp(this.vis.k * 1.6, 0, 1) : 1;   // the new season's props grow in with the crossfade
      g.globalAlpha = this._seeThrough(o, w, S[0] * 0.62, S[1] * 0.95, o.kind === 'palm' ? 0.5 : 0.6) * pop;
      if (pop < 1) { const sc = 0.6 + 0.4 * pop; g.save(); g.translate(o.x, o.y); g.scale(sc, sc); g.translate(-o.x, -o.y); this._propDraw(o, S, key); g.restore(); }
      else this._propDraw(o, S, key);
      g.globalAlpha = 1;
    }
    _propDraw(o, S, key) {
      const g = this.g;
      let rot = 0;
      if (o.kind === 'palm') rot = Math.sin(this.t * 0.9 + o.x * 0.01) * 0.025;
      if (rot) { g.save(); g.translate(o.x, o.y); g.rotate(rot); this._draw(o.kind + '_' + key, -S[0] / 2, -S[1], S[0], S[1]); g.restore(); }
      else if (!this._draw(o.kind + '_' + key, o.x - S[0] / 2, o.y - S[1], S[0], S[1])) { g.fillStyle = '#6a8a5a'; g.beginPath(); g.arc(o.cx || o.x, o.cy || o.y, o.r || 24, 0, TAU); g.fill(); }
    }

    _crab(c, a) {
      const g = this.g, x = ix(c, a), y = iy(c, a);
      const fr = c.state === 'dizzy' ? 'crab_dizzy' : (Math.floor((c.walk || 0) * 2) % 2 ? 'crab_2' : 'crab_1');
      const moving = Math.hypot(c.vx || 0, c.vy || 0) > 8;
      const roll = moving ? Math.sin((c.walk || 0) * TAU) * 0.08 : 0;
      const hop = moving ? Math.abs(Math.sin((c.walk || 0) * TAU)) * 2 : 0;
      g.save();
      if (c.state === 'enter') g.globalAlpha = clamp((c.stateT || 0) / 0.4, 0, 1);
      g.translate(x, y - hop); g.rotate(roll);
      if (c.state === 'scared') g.translate(Math.sin(this.t * 40) * 1.2, 0);
      if (!this._draw(fr, -28, -42.75, 56, 45)) { g.fillStyle = '#a3abb5'; g.beginPath(); g.ellipse(0, -18, 22, 16, 0, 0, TAU); g.fill(); }
      g.restore();
      if (c.state === 'dizzy') this._stars(x, y - 46, 14, 3);
      if (c.state === 'scared') { g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '900 16px ' + this._font(); g.textAlign = 'center'; g.fillText('!', x + 14, y - 46); }
    }

    _note(n, a, w) {
      const g = this.g, x = ix(n, a), y = iy(n, a), z = iz(n, a);
      const left = (n.life || 99) - (n.age || 0);
      if (n.state === 'ground' && left < 2 && Math.floor(left * 8) % 2 === 0) return;   // blink before it fades
      const age = n.age || 0;
      let s = 1;
      if (n.src === 'pop' && age < 0.35) { const k = age / 0.35; s = 1 + Math.sin(k * Math.PI) * 0.25 - (1 - k) * 0.6; s = Math.max(0.2, s); }
      const bob = n.state === 'ground' ? Math.sin(this.t * 3 + n.id * 1.7) * 3 : 0;
      const sway = n.state === 'ground' ? Math.sin(this.t * 2.2 + n.id) * 0.08 : (n.vx || 0) * 0.0015;
      const sz = 40;
      g.save(); g.translate(x, y - 22 - z - bob); g.rotate(sway); if (s !== 1) g.scale(s, s);
      if (PVM.Assets.hasCustom('note')) { const [fw, fh] = PVM.Assets.fit('note', sz, sz); this._draw('custom:note', -fw / 2, -fh / 2, fw, fh); }
      else if (!this._draw('note_' + (n.kind || 0), -sz / 2, -sz / 2, sz, sz)) { g.fillStyle = NOTE_COL[n.kind || 0]; g.beginPath(); g.arc(0, 6, 10, 0, TAU); g.fill(); g.fillRect(6, -16, 4, 22); }
      g.restore();
    }
    _mango(m, a) {
      const g = this.g, x = ix(m, a), y = iy(m, a), z = iz(m, a);
      const left = (m.life || 99) - (m.age || 0);
      if (left < 2 && Math.floor(left * 8) % 2 === 0) return;
      const bob = Math.sin(this.t * 4) * 2.5;
      g.save(); g.translate(x, y - 20 - z - bob); g.rotate(Math.sin(this.t * 3) * 0.12);
      if (!this._draw('mango', -18, -18, 36, 36)) { g.fillStyle = '#ffb428'; g.beginPath(); g.arc(0, 0, 14, 0, TAU); g.fill(); }
      g.restore();
    }

    _tofu(w, a) {
      const g = this.g, T = w.tofu, x = ix(T, a), y = iy(T, a), A = PVM.Assets;
      const st = T.state || 'idle', ph = T.walk || 0;
      let key = 'tofu_idle', bob = 0, sq = 1, rot = 0;
      if (st === 'walk') { key = Math.floor(ph * 2) % 2 ? 'tofu_walk2' : 'tofu_walk1'; bob = Math.abs(Math.sin(ph * TAU)) * 3; rot = Math.sin(ph * TAU) * 0.05; }
      else if (st === 'happy') { key = 'tofu_happy'; const k = clamp((T.stateT || 0) / 0.45, 0, 1); bob = Math.sin(k * Math.PI) * 10; sq = 1 + Math.sin(k * Math.PI) * 0.05; }
      else if (st === 'hurt') { key = 'tofu_hurt'; rot = Math.sin(this.t * 18) * 0.08; }
      else if (st === 'sleep') key = 'tofu_sleep';
      else { sq = 1 + Math.sin(this.t * 2.4) * 0.018; }   // idle breathing
      if (w.invulnT > 0 && st !== 'sleep' && Math.floor(w.invulnT * 10) % 2 === 0) g.globalAlpha = 0.45;
      g.save(); g.translate(x, y - bob); g.rotate(rot); g.scale((T.face || 1) < 0 ? -1 : 1, 1); g.scale(1 / sq, sq);
      if (A.hasCustom('hero')) {
        const [fw, fh] = A.fit('hero', 70, 70);
        const wob = st === 'walk' ? Math.sin(ph * TAU) * 0.12 : 0;
        g.rotate(wob); this._draw('custom:hero', -fw / 2, -fh, fw, fh);
      } else if (!this._draw(key, -36, -68.4, 72, 72) && !this._draw('tofu_idle', -36, -68.4, 72, 72)) {
        g.fillStyle = '#f7f5f0'; g.beginPath(); g.arc(0, -30, 26, 0, TAU); g.fill();
      }
      g.restore(); g.globalAlpha = 1;
      if (st === 'hurt') this._stars(x, y - 74, 20, 3);
      if (st === 'sleep') {
        g.fillStyle = 'rgba(255,255,255,.85)'; g.font = '900 18px ' + this._font(); g.textAlign = 'center';
        const k = (this.t * 0.6) % 1; g.globalAlpha = 1 - k; g.fillText('z', x + 30 + k * 10, y - 70 - k * 26); g.globalAlpha = 1;
      }
    }
    _stars(x, y, r, n) {
      const g = this.g;
      for (let i = 0; i < n; i++) {
        const ang = this.t * 5 + i * TAU / n, sx = x + Math.cos(ang) * r, sy = y + Math.sin(ang) * r * 0.35;
        const s = PVM.Assets.sprite('p_sparkle', 24, 24); if (s) g.drawImage(s, sx - 7, sy - 7, 14, 14);
        else { g.fillStyle = '#ffe066'; g.beginPath(); g.arc(sx, sy, 4, 0, TAU); g.fill(); }
      }
    }

    _coco(w, a) {
      const co = w.coco; if (!co) return;
      const g = this.g, x = ix(co, a), y = iy(co, a), z = iz(co, a);
      const fr = Math.floor((co.flap || 0) * 2) % 2 ? 'coco_2' : 'coco_1';
      const tilt = clamp((co.vy || 0) * 0.0008, -0.25, 0.25) * (co.face || 1);
      g.save(); g.translate(x, y - z - 26); g.scale((co.face || 1) < 0 ? -1 : 1, 1); g.rotate(tilt);
      if (!this._draw(fr, -32, -27.5, 64, 53)) { g.fillStyle = '#3cc24a'; g.beginPath(); g.ellipse(0, 0, 22, 14, 0, 0, TAU); g.fill(); }
      g.restore();
    }

    _juice() {
      const g = this.g;
      for (const r of this.rings) {
        const k = r.t / r.life, al = 1 - k;
        g.strokeStyle = 'rgba(' + r.col + ',' + al.toFixed(3) + ')'; g.lineWidth = r.w * (1 - k * 0.5);
        g.beginPath();
        if (r.flat) g.ellipse(r.x, r.y, r.r + 34 * k, (r.r + 34 * k) * 0.45, 0, 0, TAU);
        else g.arc(r.x, r.y, r.r + 30 * k, 0, TAU);
        g.stroke();
      }
      g.textAlign = 'center'; g.textBaseline = 'middle';
      for (const q of this.texts) {
        const tt = q.t - (q.delay || 0); if (tt < 0) continue;
        const k = tt / q.life, pop = k < 0.15 ? 0.6 + k / 0.15 * 0.5 : 1.1 - Math.min(0.1, (k - 0.15));
        const y = q.y - 26 * Math.sqrt(k);
        g.globalAlpha = k > 0.6 ? Math.max(0, 1 - (k - 0.6) / 0.4) : 1;
        g.font = '900 ' + Math.round(q.size * pop) + 'px ' + this._font();
        g.lineWidth = 5; g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineJoin = 'round'; g.strokeText(q.text, q.x, y);
        g.fillStyle = q.col; g.fillText(q.text, q.x, y);
      }
      g.globalAlpha = 1;
    }

    _font() { return '"Segoe UI Black","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif'; }

    _pill(x, y, w, h, col) {
      const g = this.g;
      g.fillStyle = 'rgba(0,0,0,.18)'; rr(g, x, y + 3, w, h, h / 2); g.fill();
      g.fillStyle = col; rr(g, x, y, w, h, h / 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 2; rr(g, x + 1, y + 1, w - 2, h - 2, h / 2 - 1); g.stroke();
    }
    _hud(w) {
      const g = this.g, sf = this.safe || { l: 0, r: 0, t: 0 }, P = pal(this.vis.cur), F = this._font();
      const top = (this.portrait ? -this.oy + sf.t : Math.max(-this.oy + sf.t, -64)) + 8;
      const left = Math.max(12, -this.ox + sf.l + 12);
      const right = Math.min(LW + this.ox - sf.r - 12, this.hudRight != null ? this.hudRight : LW - 110);
      g.textBaseline = 'middle';
      // score
      this._pill(left, top, 168, 42, P.hud);
      const s = PVM.Assets.sprite('note_0', 22, 22); if (s) g.drawImage(s, left + 10, top + 10, 22, 22);
      g.font = '900 26px ' + F; g.textAlign = 'left'; g.fillStyle = '#fff'; g.fillText(String(w.score || 0), left + 40, top + 22);
      // hearts (right)
      const n = w.maxHearts || 3, hw = 28, hx0 = right - n * hw - 14;
      this._pill(hx0 - 4, top, n * hw + 22, 42, P.hud);
      for (let i = 0; i < n; i++) {
        const full = i < (w.hearts || 0);
        let k = 1;
        if (this.heartPop < 0.4 && i === (w.hearts || 0) - (full ? 1 : 0)) k = 1 + Math.sin(this.heartPop / 0.4 * Math.PI) * 0.35;
        const hx = hx0 + 7 + i * hw + 13, hy = top + 21;
        g.save(); g.translate(hx, hy); g.scale(k, k);
        if (!this._draw(full ? 'heart_full' : 'heart_empty', -13, -12, 26, 24)) { g.fillStyle = full ? '#ff4d6a' : '#ddd'; g.beginPath(); g.arc(0, 0, 10, 0, TAU); g.fill(); }
        g.restore();
      }
      // song meter (centre between the pills)
      const mx0 = left + 168 + 18, mx1 = hx0 - 22, mw = Math.max(120, mx1 - mx0), my = top + 6, mh = 30;
      this._pill(mx0, top, mw, 42, P.hud);
      const goal = Math.max(1, w.goal || 1), fill = clamp(this.dispGot / goal, 0, 1);
      const bx = mx0 + 14, bw = mw - 28, by = my + 9, bh = 12;
      g.fillStyle = 'rgba(255,255,255,.28)'; rr(g, bx, by, bw, bh, 6); g.fill();
      if (fill > 0) { const grd = g.createLinearGradient(bx, 0, bx + bw, 0); grd.addColorStop(0, '#ffe066'); grd.addColorStop(1, '#ff8fb1'); g.fillStyle = grd; rr(g, bx, by, Math.max(bh, bw * fill), bh, 6); g.fill(); }
      // a dot per note of the song
      if (goal <= 30) for (let i = 1; i < goal; i++) { const dx = bx + bw * i / goal; g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(dx - 0.75, by + 2, 1.5, bh - 4); }
      const pk = this.meterPop < 0.3 ? 1 + Math.sin(this.meterPop / 0.3 * Math.PI) * 0.3 : 1;
      g.save(); g.translate(bx + bw * fill, by + bh / 2); g.scale(pk, pk);
      const ns = PVM.Assets.sprite('note_2', 22, 22); if (ns) g.drawImage(ns, -11, -13, 22, 22); g.restore();
      g.font = '900 13px ' + F; g.textAlign = 'center'; g.fillStyle = 'rgba(255,255,255,.95)';
      g.fillText(Math.min(w.got || 0, goal) + ' / ' + goal + ' notes', mx0 + mw / 2, top + 34);
      // combo badge under the meter, with a ring that empties as the chain window runs out
      if ((w.combo || 0) >= 2 && w.comboT > 0) {
        const cx = mx0 + mw / 2, cy = top + 66, pk2 = this.comboPop < 0.3 ? 1 + Math.sin(this.comboPop / 0.3 * Math.PI) * 0.25 : 1;
        g.save(); g.translate(cx, cy); g.scale(pk2, pk2);
        this._pill(-68, -16, 136, 32, '#e0662a');
        const k = clamp(w.comboT / (w.comboWindow || 2.4), 0, 1);
        g.strokeStyle = '#ffe066'; g.lineWidth = 3; g.beginPath(); g.arc(-50, 0, 9, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
        g.font = '900 17px ' + F; g.textAlign = 'center'; g.fillStyle = '#fff'; g.fillText('Combo ×' + w.combo, 12, 1);
        g.restore();
      }
      if (w.coco && w.coco.state !== 'out') {
        const cx = left + 30, cy = top + 70;
        const s2 = PVM.Assets.sprite('coco_1', 40, 33); if (s2) g.drawImage(s2, cx - 20, cy - 16, 40, 33);
      }
    }

    _banners(mode) {
      const g = this.g, F = this._font();
      const draw = (b, y, big) => {
        const k = b.t, life = b.life, ain = Math.min(1, k / 0.18), aout = life < 50 ? Math.min(1, (life - k) / 0.3) : 1;
        const al = clamp(Math.min(ain, aout), 0, 1); if (al <= 0) return;
        const sc = 0.7 + 0.3 * Math.min(1, k / 0.18) + (k < 0.3 ? Math.sin(k / 0.3 * Math.PI) * 0.06 : 0);
        g.save(); g.globalAlpha = al; g.translate(LW / 2, y); g.scale(sc, sc);
        g.font = '900 ' + (big ? 46 : 36) + 'px ' + F; g.textAlign = 'center'; g.textBaseline = 'middle';
        const tw = g.measureText(b.text).width, bw = tw + 64, bh = big ? 70 : 58;
        g.fillStyle = 'rgba(0,0,0,.2)'; rr(g, -bw / 2, -bh / 2 + 5, bw, bh, bh / 2); g.fill();
        g.fillStyle = b.col || '#e0662a'; rr(g, -bw / 2, -bh / 2, bw, bh, bh / 2); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; rr(g, -bw / 2 + 3, -bh / 2 + 3, bw - 6, bh - 6, bh / 2 - 3); g.stroke();
        g.fillStyle = '#fff'; g.fillText(b.text, 0, 2);
        if (b.sub) {
          g.font = '800 20px ' + F; const sw = g.measureText(b.sub).width + 34;
          g.fillStyle = 'rgba(255,255,255,.94)'; rr(g, -sw / 2, bh / 2 + 6, sw, 32, 16); g.fill();
          g.fillStyle = '#5a4030'; g.fillText(b.sub, 0, bh / 2 + 23);
        }
        g.restore();
      };
      if (mode === 'title') return;
      // banners sit in the top third, above the volcano (Tofu starts at the bottom)
      if (this.banner) draw(this.banner, 128, true);
      else if (this.ribbon) draw(this.ribbon, 126, false);
    }

    _seaBlend(col) {
      const g = this.g, F = 48;
      const grad = (x0, y0, x1, y1) => { const q = g.createLinearGradient(x0, y0, x1, y1); q.addColorStop(0, col); q.addColorStop(1, 'rgba(76,184,196,0)'); return q; };
      if (this.oy > 1) {
        g.fillStyle = grad(0, 0, 0, -F); g.fillRect(-this.ox, -F, this.VW, F);
        g.fillStyle = grad(0, LH, 0, LH + F); g.fillRect(-this.ox, LH, this.VW, F);
      }
      if (this.ox > 1) {
        g.fillStyle = grad(0, 0, -F, 0); g.fillRect(-F, -this.oy, F, this.VH);
        g.fillStyle = grad(LW, 0, LW + F, 0); g.fillRect(LW, -this.oy, F, this.VH);
      }
    }
    /* the game-over panel covers the island centre: show Tofu's nap in the free strip left of it */
    _napBeside() {
      const el = document.querySelector('#scrOver .panel'); if (!el) return;
      const r = el.getBoundingClientRect(), k = 1 / this.cssScale;
      const panelL = r.left * k - this.ox, room = panelL + this.ox;   // logical px between the screen edge and the panel
      if (room < 120) return;
      const s = Math.min(144, room * 0.8), x = panelL - room / 2, y = Math.min(LH - 40, (r.bottom * k - this.oy) - 10);
      const g = this.g, b = Math.sin(this.t * 2) * 0.02;
      g.fillStyle = 'rgba(28,40,24,.22)'; g.beginPath(); g.ellipse(x, y, s * 0.32, s * 0.08, 0, 0, TAU); g.fill();
      g.save(); g.translate(x, y); g.scale(1 + b, 1 - b);
      if (PVM.Assets.hasCustom('hero')) { const [fw, fh] = PVM.Assets.fit('hero', s, s); this._draw('custom:hero', -fw / 2, -fh, fw, fh); }
      else this._draw('tofu_sleep', -s / 2, -s * 0.95, s, s);
      g.restore();
      g.fillStyle = 'rgba(255,255,255,.9)'; g.font = '900 ' + Math.round(s * 0.18) + 'px ' + this._font(); g.textAlign = 'center';
      const q = (this.t * 0.6) % 1; g.globalAlpha = 1 - q; g.fillText('z', x + s * 0.35 + q * 12, y - s * 0.9 - q * 30); g.globalAlpha = 1;
    }

    _debug(w, a) {
      const g = this.g, A = PVM.ARENA;
      g.strokeStyle = 'rgba(255,0,255,.8)'; g.lineWidth = 1.5; g.strokeRect(A.x, A.y, A.w, A.h);
      for (const o of (w.obstacles || [])) { g.beginPath(); g.arc(o.cx != null ? o.cx : o.x, o.cy != null ? o.cy : o.y, o.r, 0, TAU); g.stroke(); }
      const T = w.tofu; g.strokeStyle = 'rgba(0,255,255,.9)'; g.beginPath(); g.arc(ix(T, a), iy(T, a), w.cfg ? w.cfg.tofuR : 18, 0, TAU); g.stroke();
      g.beginPath(); g.arc(ix(T, a), iy(T, a), PVM.CONFIG.pickR, 0, TAU); g.setLineDash([4, 4]); g.stroke(); g.setLineDash([]);
      g.strokeStyle = 'rgba(255,80,0,.9)'; for (const c of w.crabs) { g.beginPath(); g.arc(ix(c, a), iy(c, a), PVM.CONFIG.crabR, 0, TAU); g.stroke(); }
      if (w.target) { g.fillStyle = 'rgba(255,255,0,.9)'; g.beginPath(); g.arc(w.target.x, w.target.y, 5, 0, TAU); g.fill(); }
    }
  }
  PVM.Renderer = Renderer;
})(window.PVM = window.PVM || {});
