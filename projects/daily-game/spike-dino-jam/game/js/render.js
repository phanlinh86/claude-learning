/* DJ.Renderer — mobile-first top-down renderer. The canvas fills the screen in portrait and landscape
 * (logical VW×VH, see computeView); world coordinates = logical canvas coordinates. The playable arena is the
 * canvas minus safe-area insets, the HUD band and a bush border; the world is told about it with setArena().
 * The static background (tiled ground + rotated border strips + decor) is pre-rendered ONCE per biome and size
 * into a device-pixel canvas and blitted pixel-exact. On top: shadows, notes, the melody trail, Spike on his
 * board, Mumbles' pillows, Mumbles, weather particles, juicy effects and the HUD. */
(function (DJ) {
  'use strict';
  const BIOME_INFO = [
    { name: 'Fern Meadow', color: '#5cb85c', dark: '#2a5e2e', hint: 'Collect the notes to wake up the valley!' },
    { name: 'Misty Swamp', color: '#3fa3a0', dark: '#1d5054', hint: "Don't bump into your own tail!" },
    { name: 'Red Rock Canyon', color: '#d9774a', dark: '#6e3222', hint: 'Kickflip over pillows and your tail!' },
    { name: 'Snowy Peaks', color: '#7f8fbf', dark: '#3c4878', hint: 'The last song! Skate it home!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const NOTE_COLORS = ['#ff7fb0', '#5ec2ff', '#5edfa6', '#ffb23f'];
  const GOLD = '#ffd23f';
  const SPIKE = 64, FEET = 88 / 100 * SPIKE, NOTE = 30, NOTE_G = 34, PILLOW = [44, 33], PTERA = [112, 80], BOARD = [60, 25];
  const HUD_H = 64, BORDER = 28, TILE = 384;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.redFlash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.pointer = null;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map();
      this._sortBuf = [];
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 0;
      this.resize();
    }

    /* Logical canvas size by aspect (education-game rule): landscape ≥ 16:9 → 540 tall, up to 1280 wide;
     * other landscape → 960 wide, up to 960 tall; portrait → 560 wide (720 on tablets), up to 1600 tall.
     * Beyond the clamps the canvas letter-boxes. insets = safe-area insets in CSS px (from #safeProbe). */
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
      const dpr = window.devicePixelRatio || 1, touch = !!(DJ.Game && DJ.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear();
      const S = v.s, I = v.ins;
      // arena: whole canvas minus safe areas, HUD band and the bush border
      const hudH = S < 0.75 ? 80 : HUD_H;   // phones: the HUD is drawn bigger, so the band is taller
      this._hudK = clamp(0.8 / S, 1, 1.6);   // HUD scale so hearts / counters stay ≥ ~20 CSS px on phones
      const ar = { x0: Math.round(I.left + BORDER), y0: Math.round(I.top + hudH + 12), x1: Math.round(v.VW - I.right - BORDER), y1: Math.round(v.VH - I.bottom - BORDER + 4) };
      // touch kickflip button: bottom-right, ≥ 66 CSS px; notes never spawn under it
      const B = Math.max(84, 70 / S);
      const ab = { x: v.VW - I.right - 14 - B, y: v.VH - I.bottom - 14 - B, w: B, h: B };
      const avoid = touch ? [{ x: ab.x + B / 2, y: ab.y + B / 2, r: B * 0.75 + 20 }] : [];
      this.layout = { VW: v.VW, VH: v.VH, s: S, ins: I, arena: ar, avoid, act: ab };
      const hud = document.getElementById('hud'), toast = document.getElementById('toast'), act = document.getElementById('btnAction');
      if (hud) { hud.style.top = (v.top + (I.top + 12) * S) + 'px'; hud.style.right = (v.left + (I.right + 12) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (act) {
        act.style.width = act.style.height = (B * S) + 'px';
        act.style.left = (v.left + ab.x * S) + 'px'; act.style.top = (v.top + ab.y * S) + 'px';
        act.style.right = act.style.bottom = 'auto';
        this._act = act;
      }
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      this._measureHud();
      DJ.Assets.setScale(this.px);
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.banner = null; this.shake = 0; this.flash = 0; this.redFlash = 0;
      if (weather && weather.resize) weather.resize(this.VW, this.VH);
    }
    setSeason(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(b) { this.banner = { s: b, t: 0 }; }

    // ---------------- static background (pre-rendered per biome + size) ----------------
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (DJ.Assets._ver || 0) + '|' + (DJ.Assets.hasCustom(DJ.Assets.SLOTS[3 + b].id) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    background(b) {
      const key = this._bgKey(b);
      let c = this._bg.get(key);
      if (c) return c;
      const A = DJ.Assets, n = A.SEASONS[b], px = this.px, L = this.layout, ar = L.arena;
      const ground = A.img[n + '_ground'];
      if (!ground && !A.restDone && b !== 0) return null;   // not loaded yet: caller falls back
      c = document.createElement('canvas'); c.width = Math.round(this.VW * px); c.height = Math.round(this.VH * px);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.fillStyle = BIOME_INFO[b].dark; g.fillRect(0, 0, c.width, c.height);
      const custom = A.custom[A.SLOTS[3 + b].id];
      if (custom) {   // player's picture: cover the whole canvas, slightly darkened at the margins by the border
        const k = Math.max(c.width / custom.width, c.height / custom.height);
        g.drawImage(custom, (c.width - custom.width * k) / 2, (c.height - custom.height * k) / 2, custom.width * k, custom.height * k);
        g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, 0, c.width, c.height);   // calm a busy photo so notes read
      } else if (ground) {
        const t = document.createElement('canvas'); t.width = t.height = Math.max(8, Math.round(TILE * px));
        t.getContext('2d').drawImage(ground, 0, 0, t.width, t.height);
        const pat = g.createPattern(t, 'repeat');
        g.fillStyle = pat; g.fillRect(0, 0, c.width, c.height);
      }
      // border strips: rotated so the strip's bottom lies on the arena edge, facing inward (clockwise)
      const edge = A.img[n + '_edge'];
      if (edge) {
        const es = document.createElement('canvas'); es.width = Math.round(512 * px); es.height = Math.round(72 * px);
        es.getContext('2d').drawImage(edge, 0, 0, es.width, es.height);
        const sides = [
          [ar.x0 - 72, ar.y0, 0, ar.x1 - ar.x0 + 144], [ar.x1, ar.y0 - 72, Math.PI / 2, ar.y1 - ar.y0 + 144],
          [ar.x1 + 72, ar.y1, Math.PI, ar.x1 - ar.x0 + 144], [ar.x0, ar.y1 + 72, -Math.PI / 2, ar.y1 - ar.y0 + 144]
        ];
        // fill beyond the strips (safe areas / margins) with the strip's darkest tone: draw extra strips stacked outward
        for (const [ox, oy, a, len] of sides) {
          for (let row = 0; row < 3; row++) {
            g.save(); g.setTransform(px, 0, 0, px, 0, 0); g.translate(ox, oy); g.rotate(a);
            const offset = (row * 173) % 512;
            for (let x = -offset; x < len; x += 512) g.drawImage(es, x, -72 - row * 52, 512, 72);
            g.restore();
          }
        }
      }
      // decor props on the border (avoid the HUD: hearts top-left, score top-centre, buttons top-right; and the touch button)
      const spots = this._decorSpots();
      g.setTransform(px, 0, 0, px, 0, 0);
      for (const [x, y, k, s, flip] of spots) {
        const im = A.img[n + '_decor_' + k]; if (!im) continue;
        g.save(); g.translate(x, y); if (flip) g.scale(-1, 1);
        g.drawImage(im, -s / 2, -s * 112 / 128, s, s); g.restore();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      // soft inner shadow along the arena edge so the clearing reads as a sunken lawn
      g.save(); g.setTransform(px, 0, 0, px, 0, 0);
      g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 6; g.strokeRect(ar.x0 + 3, ar.y0 + 3, ar.x1 - ar.x0 - 6, ar.y1 - ar.y0 - 6);
      g.restore();
      this._bg.set(key, c);
      if (this._bg.size > 6) this._bg.delete(this._bg.keys().next().value);
      return c;
    }
    _decorSpots() {
      const L = this.layout, ar = L.arena, touch = !!(DJ.Game && DJ.Game.isTouch), out = [];
      const W = ar.x1 - ar.x0, H = ar.y1 - ar.y0, s = 84;
      // left / right sides
      const nSide = Math.max(1, Math.round(H / 260));
      for (let i = 0; i < nSide; i++) {
        const y = ar.y0 + H * (i + 0.6) / (nSide + 0.2);
        out.push([Math.max(ar.x0 - 30, 24), y, i % 2 === 0 ? 3 : 0, s, false]);   // on the bush strip, but never off-screen
        out.push([Math.min(ar.x1 + 30, this.VW - 24), y + 40, i % 2 === 0 ? 1 : 2, s * 0.9, true]);
      }
      // bottom
      const nB = Math.max(1, Math.round(W / 330));
      for (let i = 0; i < nB; i++) {
        const x = ar.x0 + W * (i + 0.5) / nB;
        if (touch && x > L.act.x - 60) continue;
        out.push([x, ar.y1 + 50, [0, 2, 1][i % 3], s, i % 2 === 1]);
      }
      // top: only between the hearts and the score, and between the score and the buttons
      if (W > 700) out.push([ar.x0 + W * 0.30, ar.y0 - 18, 0, s * 0.8, false]);
      if (W > 820) out.push([ar.x0 + W * 0.68, ar.y0 - 18, 2, s * 0.8, true]);
      return out;
    }

    // ---------------- events → effects ----------------
    onEvents(evts) {
      for (const e of evts) {
        switch (e.type) {
          case 'note': {
            const col = e.gold ? GOLD : NOTE_COLORS[e.kind || 0];
            this.sparks(e.x, e.y - 10, e.gold ? 14 : 8, col);
            this.ring(e.x, e.y - 8, col, 0.4, !!e.gold);
            this.texts.push({ text: '+' + e.points, x: e.x, y: e.y - 40, life: 0, max: 0.9, size: e.gold ? 26 : 20, color: e.gold ? '#ffe14d' : '#ffffff' });
            if (this.weather && this.weather.burst && e.gold) this.weather.burst('sparkle', e.x, e.y, 6);
            break;
          }
          case 'bonk':
            this.shake = 0.3; this.redFlash = 0.45;
            this.texts.push({ text: 'Boing!', x: e.x, y: e.y - 60, life: 0, max: 1, size: 30, color: '#ffd1e6' });
            this.stars(e.x, e.y - 40);
            break;
          case 'bounce': this.puffs(e.x, e.y, 6, 'rgba(255,255,255,.8)'); break;
          case 'flip': this.puffs(e.x, e.y + 4, 4, 'rgba(255,255,255,.75)'); break;
          case 'land': this.puffs(e.x, e.y + 4, 3, 'rgba(255,255,255,.7)'); break;
          case 'flipready': this._flipPop = 1; break;
          case 'dodge': this.texts.push({ text: 'Nice dodge! +' + (e.points || 15), x: e.x, y: e.y - 70, life: 0, max: 1.1, size: 22, color: '#c9f4ff' }); break;
          case 'bossin': this.texts.push({ text: 'Here comes Mumbles!', x: this.VW / 2, y: this.layout.arena.y0 + 40, life: 0, max: 1.8, size: 28, color: '#e8d6ff', big: true }); break;
          case 'pillowland':
            this.puffs(e.x, e.y, 6, 'rgba(255,255,255,.85)');
            if (this.weather && this.weather.burst) this.weather.burst('feather', e.x, e.y, 3);
            break;
          case 'pillowhit':
            this.shake = Math.max(this.shake, 0.2);
            this.texts.push({ text: 'Poof!', x: e.x, y: e.y - 64, life: 0, max: 1, size: 32, color: '#ffffff' });
            this.stars(e.x, e.y - 40);
            break;
          case 'pillowpuff': if (this.weather && this.weather.burst) this.weather.burst('feather', e.x, e.y, 4); this.puffs(e.x, e.y, 5, 'rgba(255,255,255,.9)'); break;
          case 'loosegone': this.puffs(e.x, e.y, 2, 'rgba(255,255,255,.7)'); break;
          case 'songdone': this.texts.push({ text: 'Song complete!', x: this.VW / 2, y: this.VH * 0.4, life: 0, max: 2.2, size: 44, color: '#ffe14d', big: true }); break;
          case 'cleared': {
            if (e.bonus) this.texts.push({ text: 'Heart bonus +' + e.bonus, x: this.VW / 2, y: this.VH * 0.4 + 52, life: 0, max: 2.2, size: 24, color: '#ffffff', big: true });
            const w = this.world, sp = w && w.spike;
            const cx = sp ? sp.x : this.VW / 2, cy = sp ? sp.y : this.VH / 2;
            for (let i = 0; i < 22; i++) {
              const a = Math.random() * TAU, v = 140 + Math.random() * 220;
              this.fx.push({ k: 'note', kind: i % 4, x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, g: 300, life: -i * 0.02, max: 1.6, size: 22 + Math.random() * 10, rot: 0, vr: (Math.random() - 0.5) * 6 });
            }
            break;
          }
          case 'go': this.texts.push({ text: 'Go!', x: this.VW / 2, y: this.VH * 0.3 + 92, life: 0, max: 0.8, size: 46, color: '#ffffff', big: true }); break;
          case 'biome': case 'season': { const z = e.biome != null ? e.biome : e.season; this.showBanner(z); this.setSeason(z); break; }
          case 'dead': this.flash = 0.4; this.shake = 0.3; this.texts.push({ text: 'Out of hearts!', x: this.VW / 2, y: this.VH * 0.45, life: 0, max: 2.5, size: 40, color: '#ffd1e6', big: true }); break;
        }
      }
    }
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 70 + Math.random() * 150; this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 80, life: 0, max: 0.35 + Math.random() * 0.25, size: 2 + Math.random() * 2.5, color }); }
    }
    puffs(x, y, n, color) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'puff', x: x + (Math.random() - .5) * 18, y: y + (Math.random() - .5) * 8, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * 30, g: 0, life: 0, max: 0.45 + Math.random() * 0.2, size: 6 + Math.random() * 6, color });
    }
    stars(x, y) { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; this.fx.push({ k: 'sprite', spr: 'p_sparkle', x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 8, vx: Math.cos(a) * 40, vy: Math.sin(a) * 20 - 20, g: 0, life: 0, max: 0.8, size: 16, rot: 0, vr: 4 }); } }
    ring(x, y, color, max, big) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 8, r1: big ? 60 : 34, color }); }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 0.7);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.8) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.redFlash = Math.max(0, this.redFlash - dt * 2);
      this._flipPop = Math.max(0, (this._flipPop || 0) - dt * 2);
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

    // ---------------- drawing ----------------
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px;
      if (!w) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#2a5e2e'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); return; }
      const al = w._acc != null && w.cfg ? clamp(w._acc / w.cfg.step, 0, 1) : 1;
      this._al = al;
      // background (pixel-exact blit, crossfade between biomes)
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
      let shx = 0, shy = 0;
      if (this.shake > 0) { const m = this.shake * 14; shx = Math.round((Math.random() - 0.5) * m * px); shy = Math.round((Math.random() - 0.5) * m * px); }
      const cur = this.background(this.vis.cur) || this.background(0);
      if (cur) g.drawImage(cur, shx, shy); else { g.fillStyle = '#2a5e2e'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      if (this.vis.t < 1 && this.vis.prev !== this.vis.cur) {
        const prev = this.background(this.vis.prev);
        if (prev) { g.globalAlpha = 1 - this.vis.t; g.drawImage(prev, shx, shy); g.globalAlpha = 1; }
      }
      g.setTransform(px, 0, 0, px, shx, shy);
      this.drawParticles(g, 'back');
      this.drawWorld(g, al);
      this.drawParticles(g, 'front');
      this.drawBoss(g, al);
      this.drawFx(g);
      // ambient tint
      const amb = this.weather && this.weather.ambient;
      if (amb && amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, this.VW, this.VH); }
      g.setTransform(px, 0, 0, px, 0, 0);
      if (this.redFlash > 0) { g.fillStyle = 'rgba(255,120,150,' + (this.redFlash * 0.22) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (this.flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.5) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (mode !== 'title') { this.drawHud(g, w); this.drawBanner(g); }
      this.drawTexts(g);
      if (this.debug) this.drawDebug(g, w);
      this.syncActionButton(w, mode);
    }

    spr(key, w, h) { return DJ.Assets.sprite(key, w, h); }
    drawSprite(g, key, x, y, w, h) { const c = this.spr(key, w, h); if (c) g.drawImage(c, x, y, w, h); }

    drawParticles(g, layer) {
      const P = this.weather && this.weather.particles; if (!P) return;
      for (const p of P) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.sprite === 'dot') { g.fillStyle = p.color || '#fff'; g.beginPath(); g.arc(p.x, p.y, p.size / 2, 0, TAU); g.fill(); continue; }
        const c = this.spr('p_' + p.sprite, p.size, p.size); if (!c) continue;
        if (!p.rot && (p.flipX || 1) === 1) { g.drawImage(c, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); continue; }
        g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); g.scale(p.flipX || 1, 1);
        g.drawImage(c, -p.size / 2, -p.size / 2, p.size, p.size); g.restore();
      }
      g.globalAlpha = 1;
    }

    shadow(g, x, y, rx, ry, a) { g.fillStyle = 'rgba(30,40,20,' + a + ')'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }

    noteSprite(kind, gold) {
      const A = DJ.Assets;
      if (A.hasCustom('note')) return null;
      return gold ? ['note_gold', NOTE_G] : ['note_' + (kind || 0), NOTE];
    }
    drawNote(g, x, y, kind, gold, scale, alpha, rot) {
      const A = DJ.Assets;
      if (alpha != null) g.globalAlpha = alpha;
      if (A.hasCustom('note')) {
        const [fw, fh] = A.fit('note', 28, 28), col = gold ? GOLD : NOTE_COLORS[kind || 0], r = 17 * scale;
        g.beginPath(); g.arc(x, y, r + 2, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.lineWidth = 3; g.strokeStyle = 'rgba(40,30,50,.7)'; g.stroke();
        const c = this.spr('custom:note', fw, fh);
        if (c) g.drawImage(c, x - fw * scale / 2, y - fh * scale / 2, fw * scale, fh * scale);
      } else {
        const [key, s] = this.noteSprite(kind, gold), d = s * scale;
        const c = this.spr(key, s, s);
        if (c) {
          if (rot) { g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(c, -d / 2, -d * 26 / 48, d, d); g.restore(); }
          else g.drawImage(c, x - d / 2, y - d * 26 / 48, d, d);
        }
      }
      g.globalAlpha = 1;
    }

    drawWorld(g, al) {
      const w = this.world, s = w.spike, t = this.time;
      const ip = (o, k) => lerp(o._px != null ? o._px : o.x, o.x, al);
      const iq = o => lerp(o._py != null ? o._py : o.y, o.y, al);
      // landed pillows + pillow shadows / target rings (on the ground)
      for (const p of w.pillows) {
        if (p.state === 'fall') {
          const zMax = p.zMax || 120, z = lerp(p._pz != null ? p._pz : p.z, p.z, al), k = clamp(1 - z / zMax, 0, 1);
          // two-tone marching ring: readable on snow and on grass, grows bolder as the pillow drops
          const rx = 34, ry = 17;
          g.lineWidth = 4; g.strokeStyle = 'rgba(40,30,70,' + (0.35 + 0.35 * k) + ')';
          g.beginPath(); g.ellipse(p.x, p.y, rx, ry, 0, 0, TAU); g.stroke();
          g.lineWidth = 2; g.strokeStyle = 'rgba(255,255,255,' + (0.6 + 0.4 * k) + ')'; g.setLineDash([7, 6]); g.lineDashOffset = -this.time * 20;
          g.beginPath(); g.ellipse(p.x, p.y, rx, ry, 0, 0, TAU); g.stroke(); g.setLineDash([]); g.lineDashOffset = 0;
          this.shadow(g, p.x, p.y, 10 + 22 * k, 5 + 11 * k, 0.18 + 0.27 * k);
        } else {
          const a = clamp(p.life / 0.4, 0, 1), sq = 1 + Math.max(0, 0.25 - (1.5 - p.life)) * 1.2;
          this.shadow(g, p.x, p.y + 6, 22, 9, 0.18 * a);
          g.globalAlpha = a; this.drawPillow(g, p.x, p.y, sq, 1 / sq, 0); g.globalAlpha = 1;
        }
      }
      // field notes (spawn / idle / loose)
      for (const n of w.notes) {
        const x = ip(n), y = iq(n);
        let sc = 1, a = 1, z = n.z || 0;
        if (n.state === 'spawn') sc = easeOutBack(clamp(n.t / 0.3, 0, 1));
        if (n.state === 'idle') { z = 4 + Math.sin(t * 3 + n.id) * 3; g.fillStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(x, y, 18 + Math.sin(t * 4 + n.id) * 2, 0, TAU); g.fill(); }
        if (n.state === 'loose' && n.life < 1.2) a = (Math.floor(n.life * 8) % 2) ? 0.35 : 1;
        this.shadow(g, x, y + 2, 10 * sc, 4 * sc, 0.2);
        if (n.gold) { g.strokeStyle = 'rgba(255,214,60,' + (0.5 + 0.4 * Math.sin(t * 6)) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(x, y - z - 8, 21 + Math.sin(t * 6) * 3, 0, TAU); g.stroke(); }
        this.drawNote(g, x, y - z - 8, n.kind, n.gold, sc, a, 0);
      }
      // trail + Spike, y-sorted
      const list = this._sortBuf; list.length = 0;
      for (let i = 0; i < w.trail.length; i++) list.push(i);
      list.push(-1);
      const ty = i => i < 0 ? iq(s) + 14 : iq(w.trail[i]);   // Spike's board covers the first notes
      list.sort((a, b) => ty(a) - ty(b));
      for (const tr of w.trail) this.shadow(g, ip(tr), iq(tr) + 2, 10, 4, 0.18);
      for (const i of list) {
        if (i < 0) { this.drawSpike(g, ip(s), iq(s), s); continue; }
        const tr = w.trail[i], x = ip(tr), y = iq(tr);
        const sc = tr.join != null ? 0.5 + 0.5 * easeOutBack(clamp(tr.join, 0, 1)) : 1;
        const pop = tr.pop ? 1 + tr.pop * 0.3 : 1;
        this.drawNote(g, x, y - (tr.z || 0) - 8, tr.kind, tr.gold, sc * pop, s.invuln > 0 && i >= (w.cfg.safeNeck || 4) ? 0.75 : 1, Math.sin(t * 5 + i * 0.7) * 0.12);
      }
      // flying pillows (above everything on the ground)
      for (const p of w.pillows) {
        if (p.state !== 'fall') continue;
        const cx = lerp(p._pcx != null ? p._pcx : p.cx, p.cx, al), cy = lerp(p._pcy != null ? p._pcy : p.cy, p.cy, al), z = lerp(p._pz != null ? p._pz : p.z, p.z, al);
        this.drawPillow(g, cx, cy - z, 1, 1, p.rot || 0);
      }
    }
    drawPillow(g, x, y, sx, sy, rot) {
      const A = DJ.Assets, custom = A.hasCustom('pillow');
      const [w, h] = custom ? A.fit('pillow', 46, 40) : PILLOW;
      const c = this.spr(custom ? 'custom:pillow' : 'pillow', w, h); if (!c) return;
      g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(sx, sy); g.drawImage(c, -w / 2, -h / 2, w, h); g.restore();
    }
    drawSpike(g, x, y, s) {
      const A = DJ.Assets, t = this.time, z = s.z || 0, inv = s.invuln > 0 && Math.floor(t * 12) % 2 === 0;
      this.shadow(g, x, y + 3, 26 - z * 0.25, 9 - z * 0.08, 0.26);
      if (inv) g.globalAlpha = 0.55;
      // board (top view, rotated by heading); during a kickflip it spins around its long axis
      const bc = this.spr('board', BOARD[0], BOARD[1]);
      const jt = s.jump > 0 && this.world.cfg.jumpTime ? clamp(s.jump / this.world.cfg.jumpTime, 0, 1) : 0;
      if (bc) {
        g.save(); g.translate(x, y - z); g.scale(1, 0.62); g.rotate(s.heading || 0);   // 3/4 camera: the ground plane is squashed
        const k = 1 + z / 90; g.scale(k, k * (jt ? Math.cos(jt * TAU) : 1));
        g.drawImage(bc, -BOARD[0] / 2, -BOARD[1] / 2, BOARD[0], BOARD[1]); g.restore();
      }
      // Spike (upright 3/4 sprite) standing on the board, leaning into turns, flipped by facing
      const bob = s.jump > 0 ? 0 : Math.abs(Math.sin(t * 9)) * 1.2;
      const lean = clamp((s.lean || 0) * 0.18, -0.25, 0.25) * (s.facing || 1);
      g.save(); g.translate(x, y - z - 2 - bob); g.rotate(lean); g.scale(s.facing < 0 ? -1 : 1, 1);
      if (A.hasCustom('hero')) {
        const [fw, fh] = A.fit('hero', 58, 58), c = this.spr('custom:hero', fw, fh);
        const sq = s.frame === 'ouch' ? 0.9 : s.frame === 'happy' ? 1.06 : 1;
        if (c) { g.rotate(s.dizzy > 0 ? Math.sin(t * 20) * 0.15 : 0); g.drawImage(c, -fw / 2, -fh * sq, fw, fh * sq); }
      } else {
        const c = this.spr('spike_' + (s.frame || 'idle'), SPIKE, SPIKE);
        if (c) g.drawImage(c, -SPIKE / 2, -FEET, SPIKE, SPIKE);
      }
      g.restore();
      g.globalAlpha = 1;
      // dizzy stars
      if (s.dizzy > 0) {
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * TAU / 3, sx = x + Math.cos(a) * 20, sy = y - z - 62 + Math.sin(a) * 6;
          const c = this.spr('p_sparkle', 14, 14); if (c) g.drawImage(c, sx - 7, sy - 7, 14, 14);
        }
      }
    }
    drawBoss(g, al) {
      const b = this.world.boss; if (!b || b.state === 'away') return;
      const x = lerp(b._px != null ? b._px : b.x, b.x, al), y = lerp(b._py != null ? b._py : b.y, b.y, al);
      const fr = b.frame === 'throw' ? 'throw' : (Math.floor(this.time * 8) % 2 ? 'fly1' : 'fly2');
      const c = this.spr('ptera_' + fr, PTERA[0], PTERA[1]); if (!c) return;
      // soft shadow on the ground far below
      this.shadow(g, x, Math.min(this.layout.arena.y1 - 10, y + 150), 30, 10, 0.1);
      g.save(); g.translate(x, y); g.scale(b.facing < 0 ? -1 : 1, 1);
      g.drawImage(c, -PTERA[0] / 2, -PTERA[1] / 2, PTERA[0], PTERA[1]); g.restore();
    }
    drawFx(g) {
      for (const f of this.fx) {
        if (f.life < 0) continue;
        const k = f.life / f.max, a = 1 - k;
        if (f.k === 'spark') { g.globalAlpha = a; g.fillStyle = f.color; g.beginPath(); g.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, TAU); g.fill(); }
        else if (f.k === 'puff') { g.globalAlpha = a * 0.8; g.fillStyle = f.color; g.beginPath(); g.arc(f.x, f.y, f.size * (0.6 + k), 0, TAU); g.fill(); }
        else if (f.k === 'circle') { g.globalAlpha = a; g.strokeStyle = f.color; g.lineWidth = 3 * a + 1; g.beginPath(); g.arc(f.x, f.y, lerp(f.r0, f.r1, Math.sqrt(k)), 0, TAU); g.stroke(); }
        else if (f.k === 'sprite') { const c = this.spr(f.spr, f.size, f.size); if (c) { g.globalAlpha = a; g.save(); g.translate(f.x, f.y); g.rotate(f.rot || 0); g.drawImage(c, -f.size / 2, -f.size / 2, f.size, f.size); g.restore(); } }
        else if (f.k === 'note') { g.globalAlpha = 1; this.drawNote(g, f.x, f.y, f.kind, false, f.size / NOTE, a, f.rot); }
      }
      g.globalAlpha = 1;
    }
    text(g, s, x, y, size, color, align, stroke) {
      g.font = '900 ' + size + 'px ' + FONT; g.textAlign = align || 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(3, size * 0.16); g.strokeStyle = stroke || 'rgba(40,30,50,.85)';
      g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y);
    }
    drawTexts(g) {
      for (const t of this.texts) {
        const k = t.life / t.max, a = k > 0.75 ? (1 - k) / 0.25 : 1, sc = t.big ? (t.life < 0.25 ? easeOutBack(t.life / 0.25) : 1) : 1;
        g.globalAlpha = clamp(a, 0, 1);
        this.text(g, t.text, clamp(t.x, 90, this.VW - 90), Math.max(t.y, this.layout.arena.y0 + t.size * 0.6), Math.round(t.size * sc), t.color);
      }
      g.globalAlpha = 1;
    }
    drawHud(g, w) {
      const I = this.ins, K = this._hudK || 1, x0 = I.left + 14, y0 = I.top + 12, touch = !!(DJ.Game && DJ.Game.isTouch);
      // hearts on a soft plate (readable on snow)
      const hs = Math.round(26 * K), bw = Math.round(130 * K), bh = Math.round(13 * K);
      const plateW = Math.max(w.heartsMax * (hs + 3), 30 * K + bw + 48 * K) + 14, plateH = hs + bh + 30 * K;
      g.fillStyle = 'rgba(20,30,40,.30)'; this.rr(g, x0 - 7, y0 - 6, plateW, plateH, 12); g.fill();
      for (let i = 0; i < w.heartsMax; i++) this.drawSprite(g, i < w.hearts ? 'heart_full' : 'heart_empty', x0 + i * (hs + 3), y0, hs, hs);
      // song progress bar under the hearts
      const by = y0 + hs + 8 * K, ic = Math.round(26 * K), bx = x0 + ic;
      this.drawSprite(g, 'songbar', x0 - 3, by - 6 * K, ic, ic);
      g.fillStyle = 'rgba(30,30,50,.5)'; this.rr(g, bx, by, bw, bh, bh / 2); g.fill();
      const f = w.songTarget ? clamp(w.song / w.songTarget, 0, 1) : 0;
      if (f > 0) { const grd = g.createLinearGradient(bx, 0, bx + bw, 0); grd.addColorStop(0, '#ff7fb0'); grd.addColorStop(0.5, '#5ec2ff'); grd.addColorStop(1, '#5edfa6'); g.fillStyle = grd; this.rr(g, bx, by, Math.max(bh, bw * f), bh, bh / 2); g.fill(); }
      this.text(g, w.song + '/' + w.songTarget, bx + bw + 6, by + bh / 2, Math.round(16 * K), '#ffffff', 'left');
      // score: centred between the hearts plate and the HUD buttons
      const right = this._hudBtn ? this._hudBtn.l : this.VW - 120, leftEdge = x0 + plateW;
      const cx = (right - leftEdge) > 260 ? clamp(this.VW / 2, leftEdge + 70, right - 70) : (leftEdge + right) / 2;
      const ss = Math.round(Math.min(36, 26 * K * 1.15));
      this.text(g, String(w.score), cx, y0 + ss * 0.55, ss, '#ffffff');
      // kickflip charge (desktop: small meter under the score; touch: the button shows it)
      if (!touch) {
        const s = w.spike, fc = clamp(s.flip, 0, 1), mx = cx - 46, my = y0 + 44;
        this.drawSprite(g, 'flip', mx - 4, my - 9, 26, 26);
        g.fillStyle = 'rgba(30,30,50,.45)'; this.rr(g, mx + 26, my, 66, 9, 4.5); g.fill();
        g.fillStyle = fc >= 1 ? '#ffd34d' : '#b9a7ff'; this.rr(g, mx + 26, my, Math.max(9, 66 * fc), 9, 4.5); g.fill();
        if (this._flipPop > 0) { g.globalAlpha = this._flipPop; g.strokeStyle = '#fff'; g.lineWidth = 2; this.rr(g, mx + 24, my - 2, 70, 13, 6); g.stroke(); g.globalAlpha = 1; }
      }
      // boss warning: a small Mumbles icon blinks 3 s before a visit (under the score, never under the buttons)
      const b = w.boss, iw = 50, ih = 36, wide = right - cx > 150;
      const wr = this._warnRect = { x0: Math.min(wide ? cx + 60 : cx - iw / 2, right - iw - 6), y0: wide ? y0 + 2 : y0 + ss + 4 };
      wr.x1 = wr.x0 + iw; wr.y1 = wr.y0 + ih;
      if (b && b.state === 'away' && w.state === 'playing' && b.next < 3 && b.next > 0 && Math.floor(this.time * 4) % 2 === 0) {
        const c = this.spr('ptera_fly1', iw, ih); if (c) g.drawImage(c, wr.x0, wr.y0, iw, ih);
      }
    }
    rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    drawBanner(g) {
      const b = this.banner; if (!b) return;
      const info = BIOME_INFO[b.s % 4], k = b.t, a = k < 0.25 ? k / 0.25 : k > 1.4 ? (1.8 - k) / 0.4 : 1;
      const lap = this.world && this.world.lap ? '  (lap ' + (this.world.lap + 1) + ')' : '';
      const cy = this.VH * 0.3, w = Math.min(this.VW - 40, 520);
      g.globalAlpha = clamp(a, 0, 1);
      g.fillStyle = info.dark + 'cc'; this.rr(g, this.VW / 2 - w / 2, cy - 44, w, 92, 22); g.fill();
      g.strokeStyle = info.color; g.lineWidth = 4; g.stroke();
      this.text(g, info.name + lap, this.VW / 2, cy - 12, this.VW < 700 ? 30 : 36, '#ffffff');
      this.text(g, info.hint, this.VW / 2, cy + 26, this.VW < 700 ? 16 : 19, '#ffe9a8');
      g.globalAlpha = 1;
    }
    syncActionButton(w, mode) {
      const b = this._act; if (!b || b.classList.contains('hidden')) return;
      const f = Math.round(clamp(w.spike.flip, 0, 1) * 100);
      if (f !== this._lastFlip) { this._lastFlip = f; b.style.setProperty('--charge', f + '%'); b.classList.toggle('ready', f >= 100); }
    }
    drawDebug(g, w) {
      const A = w.arena; g.strokeStyle = 'rgba(255,0,0,.8)'; g.lineWidth = 1; g.strokeRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
      g.strokeStyle = 'rgba(0,255,255,.8)';
      g.beginPath(); g.arc(w.spike.x, w.spike.y, w.cfg.spikeR, 0, TAU); g.stroke();
      for (let i = 0; i < w.trail.length; i++) { const t = w.trail[i]; g.strokeStyle = i < w.cfg.safeNeck ? 'rgba(0,255,0,.6)' : 'rgba(255,80,80,.8)'; g.beginPath(); g.arc(t.x, t.y, w.cfg.bonkR, 0, TAU); g.stroke(); }
      for (const a of this.layout.avoid) { g.strokeStyle = 'rgba(255,255,0,.7)'; g.beginPath(); g.arc(a.x, a.y, a.r, 0, TAU); g.stroke(); }
      const st = DJ.debug && DJ.debug.getState && DJ.debug.getState();
      if (st) { g.font = '12px monospace'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(JSON.stringify({ st: st.state, lvl: st.level, tr: st.trail, b: st.boss, fx: this.fx.length, p: st.particles }), 10, this.VH - 10); }
    }
  }
  DJ.Renderer = Renderer;
})(window.DJ = window.DJ || {});
