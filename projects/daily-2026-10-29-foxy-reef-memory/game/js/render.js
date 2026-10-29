/* RF.Renderer — draws the reef (gently swaying parallax layers), the card tray, cards with flip/slide/match
 * animation, Foxy, cupcakes, weather, juicy effects and the HUD. Logical space 960×540, letter-boxed.
 * Performance rules from Family Flappy apply: pixel-exact layer blits, capped backing store, render
 * interpolation between fixed sim steps, season layers pre-warmed in idle time. */
(function (RF) {
  'use strict';
  const W = 960, H = 540, FLOOR_Y = 450;
  const SEASON_INFO = [
    { name: 'Spring Reef', short: 'Spring', color: '#ff8fb8', dark: '#b8336d', icon: 'face_00', hint: 'Shells float UP!', arrow: [0, -1] },
    { name: 'Summer Shallows', short: 'Summer', color: '#ffc23a', dark: '#a86a00', icon: 'face_06', hint: 'Calm water: shells stay put', arrow: [0, 0] },
    { name: 'Autumn Kelp', short: 'Autumn', color: '#ff8a3d', dark: '#a63c0a', icon: 'face_03', hint: 'A current pushes shells SIDEWAYS!', arrow: [1, 0] },
    { name: 'Winter Deep', short: 'Winter', color: '#8fd3ff', dark: '#2d6aa3', icon: 'face_07', hint: 'Shells SINK down!', arrow: [0, 1] }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const CW = 84, CH = 98;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const FOX_W = 110, FOX_H = 94, FOX_CX = 66 * 110 / 140, FOX_CY = 62 * 94 / 120;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null;
      this.hoverId = null; this.showCursor = false;
      this._ox = 0; this._oy = 0;
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 2;
      this.resize();
    }

    resize() {
      const vw = window.innerWidth, vh = window.innerHeight;
      const s = Math.min(vw / W, vh / H);
      const dpr = window.devicePixelRatio || 1;
      this.cssScale = s;
      this.canvas.style.width = Math.round(W * s) + 'px';
      this.canvas.style.height = Math.round(H * s) + 'px';
      this.px = Math.min(s * dpr, this.maxPx || 2);   // backing store capped (≤1920×1080 by default)
      this.canvas.width = Math.round(W * this.px);
      this.canvas.height = Math.round(H * this.px);
      const ox = (vw - W * s) / 2, oy = (vh - H * s) / 2;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      if (hud) { hud.style.top = (oy + 14 * s) + 'px'; hud.style.right = (ox + 14 * s) + 'px'; }
      if (toast) toast.style.bottom = (oy + 30 * s) + 'px';
      RF.Assets.setScale(this.px);
      this._tray = null;
      if (this.vis) RF.Assets.warmSeason(this.vis.cur);
    }

    /* map a client (mouse) position to logical coordinates */
    toLogical(clientX, clientY) {
      const r = this.canvas.getBoundingClientRect();
      return [(clientX - r.left) / r.width * W, (clientY - r.top) / r.height * H];
    }

    attach(world, weather) { this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.banner = null; this.shake = 0; this.flash = 0; this._tray = null; }

    setSeason(i, instant) {
      i = ((i % 4) + 4) % 4;
      RF.Assets.warmSeason((i + 1) % 4); RF.Assets.warmSeason(0);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(seasonIdx, sub) { this.banner = { s: seasonIdx, t: 0, sub }; }

    // ---------------- events → effects ----------------
    onEvents(evts) {
      const w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'flip': { const c = this.card(e.id); if (c) this.bubbles(c.x, c.y + 30, 2, 0.6); break; }
          case 'match': {
            const ids = e.ids || [];
            for (const id of ids) { const c = this.card(id); if (c) { this.sparks(c.x, c.y, 10, '#fff6a8'); this.fx.push({ k: 'ring', x: c.x, y: c.y, life: 0, max: 0.5, color: '#ffffff' }); } }
            const x = e.x != null ? e.x : W / 2, y = e.y != null ? e.y : H / 2;
            for (let i = 0; i < 6; i++) {
              const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.9, sp = 80 + Math.random() * 150;
              this.fx.push({ k: 'heart', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 160, life: -i * 0.03, max: 1, size: 16 + Math.random() * 10, rot: (Math.random() - .5) * .6, vr: (Math.random() - .5) * 3 });
            }
            const combo = e.combo || 1;
            this.texts.push({ text: '+' + (e.points || 10), x, y: y - 24, life: 0, max: 1.1, size: combo >= 3 ? 34 : 28, color: combo >= 3 ? '#ffe14d' : '#ffffff' });
            if (combo >= 2) this.texts.push({ text: 'Combo x' + combo + '!', x, y: y + 6, life: 0, max: 1.1, size: 18, color: '#ffe14d' });
            break;
          }
          case 'mismatch': for (const id of (e.ids || [])) { const c = this.card(id); if (c) this.bubbles(c.x, c.y, 3, 0.5); } break;
          case 'eat': this.sparks(e.x, e.y, 8, '#ffd1e8'); this.texts.push({ text: 'Yum!', x: e.x, y: e.y - 40, life: 0, max: 0.9, size: 20, color: '#ffffff' }); break;
          case 'cupcake': this.bubbles(e.x, e.y, 4, 0.8); break;
          case 'airlow': this.texts.push({ text: 'Air is low!', x: 820, y: 130, life: 0, max: 1.6, size: 20, color: '#ffd1d1' }); break;
          case 'cleared':
            this.flash = Math.max(this.flash, 0.3);
            for (let i = 0; i < 26; i++) this.bubbles(300 + Math.random() * 560, 520, 1, 1.6 + Math.random());
            this.texts.push({ text: 'Reef cleared!', x: 585, y: 230, life: 0, max: 2.2, size: 46, color: '#ffe14d', big: true });
            if (e.bonus) this.texts.push({ text: 'Air bonus +' + e.bonus, x: 585, y: 284, life: 0, max: 2.2, size: 24, color: '#ffffff', big: true });
            break;
          case 'season': this.showBanner(e.season); this.setSeason(e.season); break;
          case 'dead': this.flash = 0.4; this.shake = 0.25; break;
        }
      }
    }
    card(id) { const w = this.world; if (!w) return null; for (const c of w.cards) if (c.id === id) return c; return null; }
    bubbles(x, y, n, max) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'bubble', x: x + (Math.random() - .5) * 24, y: y + (Math.random() - .5) * 10, vx: (Math.random() - .5) * 20, vy: -40 - Math.random() * 50, g: -20, life: 0, max: max + Math.random() * 0.4, size: 6 + Math.random() * 9, wob: Math.random() * TAU });
    }
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * TAU, sp = 70 + Math.random() * 150;
        this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 60, life: 0, max: 0.35 + Math.random() * 0.25, size: 2 + Math.random() * 2.5, color });
      }
    }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.6);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      for (const f of this.fx) {
        f.life += dt;
        if (f.life < 0) continue;
        f.vy += (f.g || 0) * dt;
        f.x += f.vx * dt + (f.k === 'bubble' ? Math.sin(this.time * 5 + f.wob) * 12 * dt : 0);
        f.y += f.vy * dt;
        if (f.vr) f.rot += f.vr * dt;
      }
      this.fx = this.fx.filter(f => f.life < f.max);
      if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
      for (const t of this.texts) { t.life += dt; if (!t.big) t.y -= 34 * dt; }
      this.texts = this.texts.filter(t => t.life < t.max);
      // Foxy breathes out a little bubble now and then
      const w = this.world;
      if (w && w.fox && (this._bub = (this._bub || 0) - dt) < 0) {
        this._bub = 1.1 + Math.random() * 1.2;
        const f = w.fox, dir = f.flipX || 1;
        this.fx.push({ k: 'bubble', x: f.x + dir * 30, y: f.y - 38, vx: 0, vy: -30, g: -25, life: 0, max: 2.2, size: 5 + Math.random() * 5, wob: Math.random() * TAU });
      }
    }

    // ---------------- drawing helpers ----------------
    /* Blit a full-width layer at exact device pixels (no resampling), wrapping horizontally. */
    tile(key, off, y, w, h, alpha, additive) {
      const spr = RF.Assets.sprite(key, w, h);
      if (!spr) return false;
      const g = this.ctx, sw = spr.width, cw = g.canvas.width;
      let x = -Math.round((((off % w) + w) % w) * sw / w);
      g.setTransform(1, 0, 0, 1, this._ox, this._oy);
      if (alpha < 1) g.globalAlpha = alpha;
      if (additive) g.globalCompositeOperation = 'lighter';
      for (const yd = Math.round(y * this.px); x < cw; x += sw) g.drawImage(spr, x, yd);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      return true;
    }
    customBg(slot, alpha) {
      const c = RF.Assets.custom[slot]; if (!c) return false;
      const g = this.ctx;
      const k = Math.max(W * 1.08 / c.width, H / c.height);
      const dw = c.width * k, dh = c.height * k;
      const x = -(dw - W) * (0.5 + 0.5 * Math.sin(this.time * 0.05));   // slow sway: we're floating, not travelling
      g.globalAlpha = alpha;
      g.drawImage(RF.Assets.sprite('custom:' + slot, dw, dh), x, (H - dh) / 2, dw, dh);
      g.globalAlpha = 1;
      return true;
    }
    backdrop(s, alpha) {
      const n = RF.Assets.SEASONS[s], t = this.time;
      const sway = s === 2 ? 1.8 : 1;   // autumn current
      if (this.customBg('bg_' + n, alpha)) {
        this.tile(n + '_rays', Math.sin(t * 0.07) * 30, 0, W, H, alpha * 0.6, true);
        return;
      }
      if (!this.tile(n + '_water', 0, 0, W, H, alpha)) { const g = this.ctx; g.fillStyle = '#2c8fb0'; g.fillRect(0, 0, W, H); }
      this.tile(n + '_far', Math.sin(t * 0.08) * 14 * sway + t * 2 * (sway - 1), 0, W, H, alpha);
      this.tile(n + '_rays', Math.sin(t * 0.07) * 30, 0, W, H, alpha * (0.75 + 0.25 * Math.sin(t * 0.6)), true);
      this.tile(n + '_mid', Math.sin(t * 0.12 + 1) * 22 * sway + t * 5 * (sway - 1), 0, W, H, alpha);
    }
    floor(s, alpha) {
      const n = RF.Assets.SEASONS[s];
      if (!this.tile(n + '_floor', 0, FLOOR_Y, W, 90, alpha)) { this.ctx.fillStyle = '#e6cf9a'; this.ctx.fillRect(0, FLOOR_Y, W, 90); }
    }
    text(str, x, y, size, fill, stroke, align = 'center', lw) {
      const g = this.ctx;
      g.font = `900 ${size}px ${FONT}`;
      g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (stroke) {
        g.lineWidth = lw || Math.max(3, size * 0.16); g.strokeStyle = stroke;
        g.strokeText(str, x, y + size * 0.06); g.strokeText(str, x, y);
      }
      g.fillStyle = fill; g.fillText(str, x, y);
    }
    roundRect(x, y, w, h, r, g) {
      g = g || this.ctx; g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    /* Draw fn() offscreen at full strength, then blend in once (clean cross-fade). */
    fadeLayer(fn, a) {
      const o = this._off || (this._off = document.createElement('canvas'));
      if (o.width !== this.canvas.width || o.height !== this.canvas.height) { o.width = this.canvas.width; o.height = this.canvas.height; }
      const g0 = this.ctx, ox = this._ox, oy = this._oy;
      this.ctx = o.getContext('2d'); this._ox = 0; this._oy = 0;
      this.ctx.setTransform(this.px, 0, 0, this.px, 0, 0); this.ctx.imageSmoothingQuality = 'high';
      try { fn(); } finally { this.ctx = g0; this._ox = ox; this._oy = oy; }
      g0.save(); g0.setTransform(1, 0, 0, 1, ox, oy); g0.globalAlpha = a; g0.drawImage(o, 0, 0); g0.restore();
    }

    // ---------------- render interpolation ----------------
    interp(w) {
      const step = (w.cfg && w.cfg.step) || 1 / 120;
      if (w._acc == null) return false;
      this._a = clamp(w._acc / step, 0, 1);
      const S = this._saved || (this._saved = []); S.length = 0;
      for (const c of w.cards) { this._lerp(c, 'x', '_px'); this._lerp(c, 'y', '_py'); }
      if (w.fox) { this._lerp(w.fox, 'x', '_px'); this._lerp(w.fox, 'y', '_py'); }
      for (const k of w.cupcakes || []) { this._lerp(k, 'x', '_px'); this._lerp(k, 'y', '_py'); }
      return S.length > 0;
    }
    _lerp(o, k, pk) { const p = o[pk]; if (p == null) return; this._saved.push(o, k, o[k]); o[k] = p + (o[k] - p) * this._a; }
    uninterp() { const S = this._saved; for (let i = S.length - 3; i >= 0; i -= 3) S[i][S[i + 1]] = S[i + 2]; S.length = 0; }

    // ---------------- main draw ----------------
    draw(mode) {
      const g = this.ctx, w = this.world;
      this._ox = 0; this._oy = 0;
      if (this.shake > 0) { const m = this.shake * 10 * this.px; this._ox = Math.round((Math.random() - .5) * m); this._oy = Math.round((Math.random() - .5) * m); }
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      const v = this.vis;
      const lerped = w ? this.interp(w) : false;
      if (this._trimKey !== v.cur * 4 + v.prev) { this._trimKey = v.cur * 4 + v.prev; RF.Assets.trimSeasons([v.cur, v.prev, (v.cur + 1) % 4, 0]); }

      if (v.t < 1 && v.prev !== v.cur) { this.backdrop(v.prev, 1); this.floor(v.prev, 1); this.fadeLayer(() => { this.backdrop(v.cur, 1); this.floor(v.cur, 1); }, v.t); }
      else { this.backdrop(v.cur, 1); this.floor(v.cur, 1); }

      if (this.weather) { this.ambient(this.weather.ambient); this.particles('back'); }
      if (w) {
        this.drawTray();
        this.drawCards(mode);
        this.drawCupcakes();
        this.drawTexts();
        this.drawFox();
      }
      if (this.weather) this.particles('front');
      this.drawFx();
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${(this.flash * 0.55).toFixed(3)})`; g.fillRect(0, 0, W, H); }
      if (w && w.state === 'dead') { g.fillStyle = 'rgba(10,30,60,0.25)'; g.fillRect(0, 0, W, H); }
      if (w && (mode === 'playing' || mode === 'paused')) this.hud();
      if (w && mode === 'playing' && w.state === 'ready') this.readyOverlay();
      if (this.banner) this.drawBanner();
      if (this.debug && w) this.debugDraw();
      if (lerped) this.uninterp();
    }

    ambient(a) {
      if (!a) return;
      const g = this.ctx;
      if (a.tint) { g.fillStyle = a.tint; g.fillRect(0, 0, W, H); }
      if (a.fog > 0) {
        const grd = this._fogGrad || (this._fogGrad = (() => { const gr = g.createLinearGradient(0, 200, 0, 540); gr.addColorStop(0, 'rgba(200,225,255,0)'); gr.addColorStop(1, 'rgba(200,225,255,0.5)'); return gr; })());
        g.globalAlpha = clamp(a.fog, 0, 1); g.fillStyle = grd; g.fillRect(0, 200, W, 340); g.globalAlpha = 1;
      }
    }

    particles(layer) {
      const g = this.ctx, A = RF.Assets;
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

    /* translucent sandy tray behind the cards — cached per size */
    drawTray() {
      const w = this.world, t = w.tray; if (!t) return;
      const key = [t.x, t.y, t.w, t.h, this.px, this.vis.cur].join('|');
      if (!this._tray || this._tray.key !== key) {
        const pad = 16, c = document.createElement('canvas');
        c.width = Math.ceil((t.w + pad * 2 + 20) * this.px); c.height = Math.ceil((t.h + pad * 2 + 24) * this.px);
        const g = c.getContext('2d'); g.scale(this.px, this.px);
        g.fillStyle = 'rgba(0,20,40,0.25)'; this.roundRect(10, 16, t.w + pad * 2, t.h + pad * 2, 26, g); g.fill();
        g.fillStyle = 'rgba(255,248,230,0.20)'; this.roundRect(10, 10, t.w + pad * 2, t.h + pad * 2, 26, g); g.fill();
        g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,0.45)'; g.stroke();
        this._tray = { key, c, x: t.x - pad - 10, y: t.y - pad - 10 };
      }
      const g = this.ctx;
      g.drawImage(this._tray.c, this._tray.x, this._tray.y, this._tray.c.width / this.px, this._tray.c.height / this.px);
    }

    drawCards(mode) {
      const g = this.ctx, w = this.world, A = RF.Assets;
      const backKey = A.hasCustom('cardback') ? null : 'card_back';
      const back = backKey ? A.sprite(backKey, CW, CH) : this.customCardBack();
      const front = A.sprite('card_front', CW, CH);
      const cur = w.cursor;
      for (const c of w.cards) {
        if (c.state === 'gone') continue;
        const alpha = c.alpha == null ? 1 : c.alpha;
        if (alpha <= 0.01) continue;
        const flip = clamp(c.flip || 0, 0, 1);
        const sx = Math.max(0.04, Math.abs(Math.cos(flip * Math.PI)));
        const showFace = flip >= 0.5;
        const sc = c.scale == null ? 1 : c.scale;
        const hover = this.hoverId === c.id && c.state === 'down' && mode === 'playing' ? 1 : 0;
        const lift = hover ? -4 : 0;
        // shadow
        g.globalAlpha = 0.22 * alpha;
        g.fillStyle = '#0a2238';
        this.roundRect(c.x - CW / 2 * sx * sc + 3, c.y - CH / 2 * sc + 6, CW * sx * sc, CH * sc, 12);
        g.fill();
        g.globalAlpha = alpha;
        g.save();
        g.translate(c.x, c.y + lift);
        if (c.wiggle > 0) g.rotate(Math.sin(this.time * 38) * 0.09 * c.wiggle);
        g.scale(sx * sc, sc);
        if (showFace) {
          if (front) g.drawImage(front, -CW / 2, -CH / 2, CW, CH);
          const face = A.sprite('face_' + String(c.face).padStart(2, '0'), 60, 60);
          if (face) g.drawImage(face, -30, -30, 60, 60);
        } else if (back) g.drawImage(back, -CW / 2, -CH / 2, CW, CH);
        if (c.glow > 0) {
          g.globalAlpha = alpha * c.glow;
          g.lineWidth = 5; g.strokeStyle = '#fff3a0';
          this.roundRect(-CW / 2 - 2, -CH / 2 - 2, CW + 4, CH + 4, 14); g.stroke();
        }
        if (hover) { g.globalAlpha = 0.18; g.fillStyle = '#ffffff'; this.roundRect(-CW / 2, -CH / 2, CW, CH, 12); g.fill(); }
        g.restore();
        g.globalAlpha = 1;
      }
      // keyboard cursor ring
      if (this.showCursor && cur && mode === 'playing' && w.state === 'playing') {
        const c = w.cards.find(k => k.col === cur.col && k.row === cur.row && k.state !== 'gone');
        if (c) {
          const p = 0.5 + 0.5 * Math.sin(this.time * 6);
          g.lineWidth = 4; g.strokeStyle = `rgba(255,225,80,${0.6 + 0.4 * p})`;
          this.roundRect(c.x - CW / 2 - 6, c.y - CH / 2 - 6, CW + 12, CH + 12, 16); g.stroke();
        }
      }
    }
    customCardBack() {
      const A = RF.Assets, src = A.custom.cardback; if (!src) return null;
      const key = 'cb|' + this.px + '|' + src.width + 'x' + src.height + '|' + (A._ver || 0);
      if (this._cb && this._cb.key === key) return this._cb.c;
      const c = document.createElement('canvas'); c.width = Math.round(CW * this.px); c.height = Math.round(CH * this.px);
      const g = c.getContext('2d'); g.scale(this.px, this.px);
      this.roundRect(1.5, 1.5, CW - 3, CH - 3, 12, g); g.save(); g.clip();
      const k = Math.max(CW / src.width, CH / src.height);
      g.drawImage(src, (CW - src.width * k) / 2, (CH - src.height * k) / 2, src.width * k, src.height * k);
      g.restore();
      g.lineWidth = 3; g.strokeStyle = '#ffffff'; this.roundRect(1.5, 1.5, CW - 3, CH - 3, 12, g); g.stroke();
      this._cb = { key, c };
      return c;
    }

    drawCupcakes() {
      const g = this.ctx, w = this.world, A = RF.Assets;
      const custom = A.hasCustom('treat');
      const [dw, dh] = custom ? A.fit('treat', 38, 38) : [34, 34];
      const spr = custom ? A.sprite('custom:treat', dw, dh) : A.sprite('cupcake', 34, 34);
      if (!spr) return;
      for (const k of w.cupcakes || []) {
        if (k.alive === false) continue;
        const s = k.scale == null ? 1 : k.scale;
        g.save(); g.translate(k.x, k.y); g.rotate(k.rot || 0); g.scale(s, s);
        g.drawImage(spr, -dw / 2, -dh / 2, dw, dh);
        g.restore();
      }
    }

    drawFox() {
      const g = this.ctx, w = this.world, f = w.fox, A = RF.Assets;
      if (!f) return;
      const custom = A.hasCustom('hero');
      g.save();
      g.translate(f.x, f.y + (f.bob || 0));
      g.rotate((f.angle || 0) * (custom ? 0.5 : 1));
      if ((f.flipX || 1) < 0) g.scale(-1, 1);
      if (custom) {
        const [cw, ch] = A.fit('hero', FOX_W, FOX_H);
        const sq = f.frame === 'eat' ? 1.08 : f.frame === 'cheer' ? 1.05 + 0.04 * Math.sin(this.time * 18) : 1;
        g.scale(2 - sq, sq);
        // a little diving helmet ring so a photo still looks underwater
        g.drawImage(A.sprite('custom:hero', cw, ch), -cw / 2, -ch / 2, cw, ch);
        g.globalAlpha = 0.55; g.lineWidth = 3; g.strokeStyle = '#e8fbff';
        g.beginPath(); g.ellipse(0, -4, cw * 0.56, ch * 0.6, 0, 0, TAU); g.stroke();
        g.globalAlpha = 0.35; g.fillStyle = '#ffffff';
        g.beginPath(); g.ellipse(-cw * 0.22, -ch * 0.32, cw * 0.08, ch * 0.05, -0.6, 0, TAU); g.fill();
      } else {
        const fr = ['swim1', 'swim2', 'swim3', 'eat', 'oops', 'cheer'].includes(f.frame) ? f.frame : 'swim1';
        const spr = A.sprite('fox_' + fr, FOX_W, FOX_H);
        if (spr) g.drawImage(spr, -FOX_CX, -FOX_CY, FOX_W, FOX_H);
      }
      g.restore();
    }

    drawFx() {
      const g = this.ctx, A = RF.Assets;
      for (const f of this.fx) {
        if (f.life < 0) continue;
        const k = f.life / f.max;
        if (f.k === 'heart') {
          const spr = A.sprite('heart', 48, 48);
          let s = f.size * (k < 0.15 ? k / 0.15 : 1);
          if (k > 0.7) s *= 1 - (k - 0.7) / 0.3 * 0.6;
          g.save(); g.globalAlpha = k > 0.9 ? clamp((1 - k) * 10, 0, 1) : 1;
          g.translate(f.x, f.y); g.rotate(f.rot);
          if (spr) g.drawImage(spr, -s / 2, -s / 2, s, s);
          g.restore();
        } else if (f.k === 'bubble') {
          const spr = A.sprite('p_bubble', 32, 32);
          g.globalAlpha = k > 0.8 ? (1 - k) * 5 : 0.9;
          const s = f.size * (1 + k * 0.3);
          if (spr) g.drawImage(spr, f.x - s / 2, f.y - s / 2, s, s);
          else { g.strokeStyle = '#ffffff'; g.lineWidth = 1.5; g.beginPath(); g.arc(f.x, f.y, s / 2, 0, TAU); g.stroke(); }
        } else if (f.k === 'spark') {
          g.globalAlpha = 1 - k; g.fillStyle = f.color;
          g.beginPath(); g.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'ring') {
          g.globalAlpha = 0.8 * (1 - k); g.strokeStyle = f.color; g.lineWidth = 4 * (1 - k) + 1;
          this.roundRect(f.x - CW / 2 - k * 20, f.y - CH / 2 - k * 20, CW + k * 40, CH + k * 40, 14 + k * 10); g.stroke();
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
        this.text(t.text, 0, 0, t.size, t.color, '#123a55');
        g.restore();
      }
    }

    hud() {
      const g = this.ctx, w = this.world;
      // score
      if (this._lastScore !== w.score) { this._scorePop = 1; this._lastScore = w.score; }
      this._scorePop = Math.max(0, (this._scorePop || 0) - 0.06);
      const s = 1 + 0.22 * this._scorePop;
      g.save(); g.translate(W / 2, 46); g.scale(s, s);
      this.text(String(w.score), 0, 0, 52, '#ffffff', '#123a55', 'center', 9);
      g.restore();
      const left = w.cards.filter(c => c.state !== 'gone' && c.state !== 'matched').length / 2;
      this.text('Pairs left: ' + Math.ceil(left) + (w.combo >= 2 ? '   Combo x' + w.combo : ''), W / 2, 86, 16, w.combo >= 2 ? '#ffe14d' : '#e8fbff', '#123a55', 'center', 5);
      // season pill
      const si = SEASON_INFO[w.season] || SEASON_INFO[0];
      g.fillStyle = 'rgba(255,255,255,0.88)'; this.roundRect(16, 16, 214, 46, 23); g.fill();
      g.lineWidth = 3; g.strokeStyle = si.color; g.stroke();
      const icon = RF.Assets.sprite(si.icon, 32, 32);
      if (icon) g.drawImage(icon, 24, 23, 32, 32);
      this.text(si.short + (w.lap > 0 ? ' · Lap ' + (w.lap + 1) : ''), 62, 31, 17, si.dark, null, 'left');
      this.text('Level ' + (w.level + 1), 62, 50, 12, '#55708a', null, 'left');
      // cupcakes counter
      const cup = RF.Assets.hasCustom('treat') ? RF.Assets.sprite('custom:treat', ...RF.Assets.fit('treat', 26, 26)) : RF.Assets.sprite('cupcake', 26, 26);
      g.fillStyle = 'rgba(255,255,255,0.88)'; this.roundRect(16, 70, 96, 34, 17); g.fill();
      if (cup) { const [cw, ch] = RF.Assets.hasCustom('treat') ? RF.Assets.fit('treat', 26, 26) : [26, 26]; g.drawImage(cup, 24, 87 - ch / 2, cw, ch); }
      this.text('× ' + w.cupcakes, 56, 87, 17, '#b8336d', null, 'left');
      // air meter (a row of bubbles inside a pill)
      const frac = clamp(w.air / (w.airMax || 1), 0, 1), low = frac < 0.25;
      const x0 = 712, y0 = 78, mw = 232, mh = 26;
      g.fillStyle = 'rgba(10,40,70,0.55)'; this.roundRect(x0, y0, mw, mh, 13); g.fill();
      const pulse = low ? 0.6 + 0.4 * Math.sin(this.time * 10) : 1;
      g.fillStyle = low ? `rgba(255,120,120,${pulse})` : '#7fe3ff';
      this.roundRect(x0 + 3, y0 + 3, Math.max(20, (mw - 6) * frac), mh - 6, 10); g.fill();
      g.fillStyle = 'rgba(255,255,255,0.45)'; this.roundRect(x0 + 8, y0 + 5, Math.max(10, (mw - 16) * frac), 5, 3); g.fill();
      const bub = RF.Assets.sprite('p_bubble', 32, 32);
      if (bub) g.drawImage(bub, x0 - 16, y0 - 4, 32, 32);
      this.text('AIR', x0 + mw / 2, y0 + mh / 2 + 1, 14, '#ffffff', '#123a55', 'center', 4);
    }

    readyOverlay() {
      const w = this.world;
      const peeking = w.cards.some(c => (c.flip || 0) > 0.5);
      const label = peeking ? 'Remember the sea friends!' : 'Get ready…';
      const a = 0.85 + 0.15 * Math.sin(this.time * 6);
      this.ctx.globalAlpha = a;
      this.text(label, 585, 470, 24, '#ffe14d', '#123a55', 'center', 6);
      this.ctx.globalAlpha = 1;
    }

    drawBanner() {
      const g = this.ctx, b = this.banner, si = SEASON_INFO[b.s];
      const t = b.t;
      let x;
      if (t < 0.45) x = lerp(-W, 0, easeOutBack(t / 0.45));
      else if (t < 2.1) x = 0;
      else x = lerp(0, W, Math.pow((t - 2.1) / 0.5, 2));
      g.save(); g.translate(x, 0);
      g.fillStyle = si.color; g.globalAlpha = 0.93;
      g.beginPath(); g.moveTo(W / 2 - 280, 190); g.lineTo(W / 2 + 280, 182); g.lineTo(W / 2 + 298, 290); g.lineTo(W / 2 - 262, 300); g.closePath(); g.fill();
      g.globalAlpha = 1;
      this.text(si.name + '!', W / 2, 222, 42, '#ffffff', si.dark, 'center', 9);
      this.text(si.hint, W / 2, 266, 20, '#ffffff', si.dark, 'center', 5);
      // gravity arrow
      const [ax, ay] = si.arrow;
      if (ax || ay) {
        const cx = W / 2 + 240, cy = 238, L = 22;
        g.strokeStyle = '#ffffff'; g.lineWidth = 6; g.lineCap = 'round';
        const bob = Math.sin(this.time * 6) * 4;
        const ex = cx + ax * (L + bob), ey = cy + ay * (L + bob);
        g.beginPath(); g.moveTo(cx - ax * L, cy - ay * L); g.lineTo(ex, ey); g.stroke();
        g.beginPath(); g.moveTo(ex, ey); g.lineTo(ex - ax * 10 - ay * 10, ey - ay * 10 - ax * 10);
        g.moveTo(ex, ey); g.lineTo(ex - ax * 10 + ay * 10, ey - ay * 10 + ax * 10); g.stroke();
      }
      g.restore();
    }

    debugDraw() {
      const g = this.ctx, w = this.world;
      g.strokeStyle = 'red'; g.lineWidth = 1;
      if (w.tray) g.strokeRect(w.tray.x, w.tray.y, w.tray.w, w.tray.h);
      g.font = '10px monospace'; g.fillStyle = '#ff0';
      for (const c of w.cards) if (c.state !== 'gone') g.fillText(c.face + ' ' + c.col + ',' + c.row, c.x - 30, c.y + 45);
    }
  }
  Renderer.SEASON_INFO = SEASON_INFO;
  RF.Renderer = Renderer;
})(window.RF = window.RF || {});
