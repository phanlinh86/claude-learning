/* PR.Renderer — side cross-section of the sea ice: sky and Bao on top, water below (DESIGN §2).
 * Layers: the sky + far horizon drift slowly (pre-rendered device-pixel strips, blitted pixel-exact); the water,
 * seabed, ice slab (with the hole cut out) and hole rim are pre-rendered ONCE per zone and size into one
 * device-pixel canvas. Zone changes crossfade. On top: Bao, the line and hook, gems in bubbles, fish, pufferfish,
 * weather particles, the reel meter, juicy effects and the HUD. Positions are lerped with world.alpha. */
(function (PR) {
  'use strict';
  const ZONE_INFO = [
    { name: 'Sunny Shallows', color: '#5fd3f0', dark: '#1d5f86', back: ['#5aa9cc', '#7fd6e8'], hint: 'Hold to sink the hook, let go to float up!' },
    { name: 'Kelp Garden', color: '#8fe08a', dark: '#1f5c58', back: ['#4f9fa0', '#5cc2b0'], hint: 'Deeper gems are worth more!' },
    { name: 'Twilight Waters', color: '#c9a2ff', dark: '#26285e', back: ['#36588f', '#3c6fb0'], hint: 'Mind the puffy pufferfish!' },
    { name: 'Aurora Deep', color: '#7dffc8', dark: '#0d1d42', back: ['#1a3460', '#1d3a6b'], hint: 'The gems glow under the aurora!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const BAO = 128, BK = BAO / 160;                         // Bao drawn 128 px from a 160 viewBox
  const ROD = { idle: [150, 22], happy: [150, 22], oops: [150, 22], reel: [146, 14] };
  const GEM = 40, GEM_G = 44, BUBBLE = 62, HOOK = [24, 36], PUF = [64, 53], PUFF = 80, FISH = [50, 30], BUCKET = 44;
  const GEM_COL = { amethyst: '#c08cff', emerald: '#5fe0a0', ruby: '#ff6b80', gold: '#ffd84a' };
  const GAP = 64;                                          // hole width in the ice slab (DESIGN §2)

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.goldFlash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.drift = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map();
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 0;
      this.resize();
    }

    /* Logical canvas size by aspect: landscape ≥ 16:9 → 540 tall, up to 1280 wide; other landscape → 960 wide, up to
     * 960 tall; portrait → 560 wide (720 on tablets), up to 1600 tall. Beyond the clamps the canvas letter-boxes. */
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
      const dpr = window.devicePixelRatio || 1, touch = !!(PR.Game && PR.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear();
      this._hudK = clamp(0.95 / v.s, 1, 1.7);
      this._view = v;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      if (this.world && this.world.setLayout && (this.world.layout.width !== v.VW || this.world.layout.height !== v.VH)) this.world.setLayout(v.VW, v.VH);
      this._measureHud();
      PR.Assets.setScale(this.px);
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.goldFlash = 0;
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

    // ---------------- pre-rendered scene per zone ----------------
    _custom(b) { return PR.Assets.hasCustom(PR.Assets.SLOTS[3 + b].id); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (PR.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    _canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* {sky, low, custom}: sky = one 960-wide tile (sky+far) in device px for the drifting band; low = full-screen
     * canvas (water, reef, back wall of the hole, ice with the gap, rim). With a custom picture: low holds it all. */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = PR.Assets, n = A.SEASONS[b], px = this.px, VW = this.VW, VH = this.VH, info = ZONE_INFO[b];
      const holeX = Math.round(VW / 2), cust = this._custom(b);
      const low = this._canvas(VW * px, VH * px), g = low.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.setTransform(px, 0, 0, px, 0, 0);
      let sky = null;
      if (cust) {
        const im = A.custom[A.SLOTS[3 + b].id], k = Math.max(VW / im.width, VH / im.height);
        g.drawImage(im, (VW - im.width * k) / 2, (VH - im.height * k) / 2, im.width * k, im.height * k);
      } else {
        // sky tile (sky + far) — drawn separately so it can drift
        const tw = Math.round(960 * px), th = Math.round(200 * px);
        sky = this._canvas(tw, th);
        const sg = sky.getContext('2d'); sg.imageSmoothingQuality = 'high';
        if (A.img[n + '_sky']) sg.drawImage(A.img[n + '_sky'], 0, 0, tw, th); else { sg.fillStyle = info.dark; sg.fillRect(0, 0, tw, th); }
        const far = A.img[n + '_far'];
        bg = { sky, far: null, low };
        if (far) { const fc = this._canvas(tw, th); fc.getContext('2d').drawImage(far, 0, 0, tw, th); bg.far = fc; }
        // water stretched from y 170 to the bottom
        const water = A.img[n + '_water'];
        if (water) g.drawImage(water, 0, 170, VW, VH - 170);
        else { const gr = g.createLinearGradient(0, 170, 0, VH); gr.addColorStop(0, info.back[1]); gr.addColorStop(1, info.dark); g.fillStyle = gr; g.fillRect(0, 170, VW, VH - 170); }
        // reef: bottom-aligned, tiles, its calm centre (svg x 480) under the hole
        const reef = A.img[n + '_reef'];
        if (reef) { const off = ((holeX - 480) % 960 + 960) % 960 - 960; for (let x = off; x < VW; x += 960) g.drawImage(reef, x, VH - 320, 960, 320); }
      }
      // back wall of the hole (the gap between the snow and the water)
      const bw = g.createLinearGradient(0, 156, 0, 190);
      bw.addColorStop(0, info.back[0]); bw.addColorStop(1, info.back[1]);
      g.fillStyle = bw; g.fillRect(holeX - GAP / 2 - 2, 156, GAP + 4, 36);
      // ice slab with the gap cut out
      const ice = A.img[n + '_ice'];
      if (ice) {
        g.save(); g.beginPath(); g.rect(0, 0, holeX - GAP / 2, VH); g.rect(holeX + GAP / 2, 0, VW, VH); g.clip();
        const off = ((holeX - 480) % 960 + 960) % 960 - 960;
        for (let x = off; x < VW; x += 960) g.drawImage(ice, x, 140, 960, 80);
        g.restore();
      } else { g.fillStyle = '#e8f6fc'; g.fillRect(0, 150, holeX - GAP / 2, 40); g.fillRect(holeX + GAP / 2, 150, VW, 40); }
      const rim = A.img.hole_rim;
      if (rim) g.drawImage(rim, holeX - 48, 140, 96, 80);
      bg = bg || { sky: null, far: null, low };
      bg.custom = cust;
      this._bg.set(key, bg);
      // keep only the current, previous and next zones
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
    drawScene(g, b, alpha) {
      const bg = this.background(b);
      if (!bg) return;
      if (bg.sky) {
        // aurora: the sky gently breathes
        const au = b === 3 ? 0.9 + 0.1 * Math.sin(this.time * 0.7) : 1;
        this._blitTile(g, bg.sky, this.drift * 5, alpha * au);
        if (au < 1) { g.globalAlpha = alpha * (1 - au); g.fillStyle = '#071233'; g.fillRect(0, 0, this.canvas.width, Math.round(200 * this.px)); }
        this._blitTile(g, bg.far, this.drift * 2, alpha);
      }
      g.globalAlpha = alpha; g.drawImage(bg.low, 0, 0); g.globalAlpha = 1;
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world, L = w && w.layout, wx = this.weather;
      for (const e of evts) {
        switch (e.type) {
          case 'hook': {
            const it = e.item;
            this.ring(it.x, it.y, '#e3fbff', 0.45, 46);
            if (wx) wx.burst('bubble_s', it.x, it.y, 8, { speed: 90, life: 0.8, size: 12, up: 0.6 });
            this.say(it.type === 'gold' ? 'Golden gem!' : 'Hooked!', it.x, it.y - 50, it.type === 'gold' ? '#ffe14d' : '#e3fbff', 26);
            break;
          }
          case 'reelGood': {
            const hk = w.hook;
            const sx = this.reelPos(w)[0] > hk.x ? hk.x - 70 : hk.x + 70;
            if (e.perfect) { this.say('Perfect!', sx, hk.y - 30, '#ffe14d', 24); this.ring(hk.x, e.y + 18, '#ffe14d', 0.4, 40); }
            else { this.say('Good!', sx, hk.y - 30, '#9dffbf', 20); this.ring(hk.x, e.y + 18, '#53d88a', 0.35, 34); }
            if (wx) wx.burst('bubble_s', hk.x, hk.y + 10, e.perfect ? 7 : 4, { speed: 70, life: 0.7, size: 10, up: 0.9 });
            break;
          }
          case 'reelSlip': { const hk = w.hook, sx = this.reelPos(w)[0] > hk.x ? hk.x - 70 : hk.x + 70; this.say('Oops!', sx, hk.y - 20, '#ff8a7a', 22); this.reelFlash = 0.3; break; }
          case 'escape': if (e.item) this.say('It got away!', e.item.x, e.item.y - 50, '#ffd0b0', 22); break;
          case 'catch': {
            const it = e.item, gold = it && it.type === 'gold';
            this.say('+' + e.points, e.x + 50, L.surfaceY - 50, gold ? '#ffe14d' : '#ffffff', gold ? 40 : 30);
            if (wx) {
              wx.burst('drop', e.x, L.waterTop - 6, 10, { speed: 160, gravity: 500, life: 0.8, size: 12, up: 1, spread: 1.6 });
              wx.burst(gold ? 'star' : 'sparkle', e.x, L.waterTop - 30, gold ? 18 : 9, { speed: gold ? 200 : 130, gravity: 120, life: 1, size: gold ? 20 : 14 });
            }
            if (gold) { this.goldFlash = 1; this.shake = 0.18; }
            this.bucketPop = 1;
            break;
          }
          case 'splash': if (wx) wx.burst('drop', e.x, e.y - 4, 6, { speed: 110, gravity: 500, life: 0.6, size: 10, up: 1, spread: 1.4 }); break;
          case 'puff': if (e.item) this.ring(e.item.x, e.item.y, '#ffd36b', 0.5, 60); break;
          case 'snap': {
            this.shake = 0.35; this.flash = 0.6;
            this.say('Boing! The line snapped', e.x, Math.max(L.waterTop + 60, e.y - 60), '#ffd36b', 24);
            if (wx) wx.burst('puff', e.x, e.y, 8, { speed: 80, life: 0.9, size: 34 });
            break;
          }
          case 'lineBack': this.say('+1 line', 90, 120, '#ff8f8f', 22); break;
          case 'golden': this.goldHint = 2.5; break;
          case 'levelUp': this.showBanner(e.zone); break;
        }
      }
    }
    say(text, x, y, color, size) { this.texts.push({ text, x, y, color, size, life: 0, max: 1.3 }); if (this.texts.length > 12) this.texts.shift(); }
    ring(x, y, color, max, r1) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 10, r1, color }); }

    update(dt) {
      this.time += dt; this.drift += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.1);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.goldFlash = Math.max(0, this.goldFlash - dt * 1.5);
      this.bucketPop = Math.max(0, (this.bucketPop || 0) - dt * 3);
      this.goldHint = Math.max(0, (this.goldHint || 0) - dt);
      this.reelFlash = Math.max(0, (this.reelFlash || 0) - dt);
      for (const f of this.fx) f.life += dt;
      this.fx = this.fx.filter(f => f.life < f.max);
      for (const t of this.texts) { t.life += dt; t.y -= 26 * dt; }
      this.texts = this.texts.filter(t => t.life < t.max);
    }

    // ---------------- drawing ----------------
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
      if (!w) { g.fillStyle = '#1d3a6b'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); return; }
      g.fillStyle = '#1d3a6b'; g.fillRect(0, 0, this.canvas.width, this.canvas.height);
      this.drawScene(g, this.vis.cur, 1);
      if (this.vis.t < 1 && this.vis.prev !== this.vis.cur) this.drawScene(g, this.vis.prev, 1 - this.vis.t);
      let shx = 0, shy = 0;
      if (this.shake > 0) { const m = this.shake * 10; shx = (Math.random() - 0.5) * m; shy = (Math.random() - 0.5) * m; }
      g.setTransform(px, 0, 0, px, shx * px, shy * px);
      const amb = this.weather && this.weather.ambient;
      if (amb && amb.aurora > 0.01) {   // faint green aurora wash over the sky
        g.globalAlpha = amb.aurora * (0.04 + 0.03 * Math.sin(this.time * 0.9));
        g.fillStyle = '#5dffb4'; g.fillRect(0, 0, this.VW, 150); g.globalAlpha = 1;
      }
      const al = clamp(w.alpha == null ? 1 : w.alpha, 0, 1);
      this.drawParticles(g, 'sky');
      this.drawParticles(g, 'back');
      if (amb && amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, w.layout.waterTop, this.VW, this.VH - w.layout.waterTop); }   // water light only; items stay bright
      this.drawItems(g, w, al, false);
      this.drawBucket(g, w);
      this.drawLineAndHook(g, w, al);
      this.drawBao(g, w);
      this.drawItems(g, w, al, true);     // hooked / caught gems above the line
      this.drawParticles(g, 'front');
      this.drawFx(g);
      g.setTransform(px, 0, 0, px, 0, 0);
      if (this.flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.35) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (this.goldFlash > 0) { g.fillStyle = 'rgba(255,220,90,' + (this.goldFlash * 0.22) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (w.reel && w.reel.active && mode !== 'title') this.drawReel(g, w);
      if (mode !== 'title') { this.drawHint(g, w); this.drawHud(g, w); this.drawBanner(g); }
      if (mode !== 'title') this.drawTexts(g);
      if (this.debug) this.drawDebug(g, w);
    }

    spr(key, w, h) { return PR.Assets.sprite(key, w, h); }
    drawSprite(g, key, x, y, w, h) { const c = this.spr(key, w, h); if (c) g.drawImage(c, x, y, w, h); return !!c; }
    /* a sprite centred on (x,y), optionally flipped / rotated / squashed */
    drawC(g, key, x, y, w, h, flip, rot, sx, sy) {
      const c = this.spr(key, w, h); if (!c) return false;
      if (!flip && !rot && !sx && !sy) { g.drawImage(c, x - w / 2, y - h / 2, w, h); return true; }
      g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale((flip ? -1 : 1) * (sx || 1), sy || 1);
      g.drawImage(c, -w / 2, -h / 2, w, h); g.restore(); return true;
    }
    custom(slot, bw, bh) { const A = PR.Assets; if (!A.hasCustom(slot)) return null; const [w, h] = A.fit(slot, bw, bh); return { key: 'custom:' + slot, w, h }; }

    drawParticles(g, layer) {
      const P = this.weather && this.weather.particles; if (!P) return;
      for (const p of P) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        const c = this.spr('p_' + p.sprite, p.size, p.size);
        if (!c) { g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(p.x, p.y, p.size / 4, 0, TAU); g.fill(); continue; }
        if (p.glow) g.globalCompositeOperation = 'lighter';
        if (!p.rot && (p.flipX || 1) === 1 && (p.sx || 1) === 1) g.drawImage(c, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        else {
          g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); g.scale((p.flipX || 1) * (p.sx || 1), 1 / (p.sx || 1));
          g.drawImage(c, -p.size / 2, -p.size / 2, p.size, p.size); g.restore();
        }
        if (p.glow) g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = 1;
    }

    // ---------------- Bao, bucket, line, hook ----------------
    baoBox(w) { const L = w.layout; return { x: L.holeX - 4 - ROD.idle[0] * BK, y: L.surfaceY - 150 * BK }; }
    rodTip(w) {
      const b = this.baoBox(w), a = w.bao && w.bao.anim || 'idle', r = ROD[a] || ROD.idle, tug = w.reel ? w.reel.tug || 0 : 0;
      if (PR.Assets.hasCustom('hero')) return [w.layout.holeX - 2, w.layout.surfaceY - 100 + tug * 6];
      return [b.x + r[0] * BK, b.y + r[1] * BK + tug * 7];
    }
    drawBao(g, w) {
      const L = w.layout, b = this.baoBox(w), a = (w.bao && w.bao.anim) || 'idle', t = w.bao ? w.bao.t : 0;
      const breathe = Math.sin(this.time * 2.2) * 0.012, hop = a === 'happy' ? Math.max(0, Math.sin(Math.min(t, 0.5) / 0.5 * Math.PI)) * 8 : 0;
      const cu = this.custom('hero', 112, 112);
      if (cu) {
        // custom hero: sits left of the hole, bobs and squashes; we draw the rod ourselves
        const cx = L.holeX - 70, by = L.surfaceY + 2 - hop, sq = 1 + breathe * 2 + (a === 'reel' ? Math.sin(this.time * 18) * 0.03 : 0);
        g.save(); g.translate(cx, by); g.scale(1 / sq, sq);
        g.drawImage(this.spr(cu.key, cu.w, cu.h), -cu.w / 2, -cu.h, cu.w, cu.h); g.restore();
        const tip = this.rodTip(w);
        g.strokeStyle = '#8a5a2b'; g.lineWidth = 5; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx + 18, by - cu.h * 0.45); g.lineTo(tip[0], tip[1]); g.stroke();
        return;
      }
      const key = 'bao_' + a, sy = 1 + breathe;
      const c = this.spr(key, BAO, BAO) || this.spr('bao_idle', BAO, BAO);
      if (!c) return;
      g.save(); g.translate(b.x + 68 * BK, L.surfaceY - hop); g.scale(1 / sy, sy);
      g.drawImage(c, -68 * BK, -150 * BK, BAO, BAO); g.restore();
    }
    drawBucket(g, w) {
      const L = w.layout, x = L.holeX - 150, p = this.bucketPop || 0, s = 1 + p * 0.18;
      g.save(); g.translate(x, L.surfaceY + 2); g.scale(1 / (1 + p * 0.1), s);
      this.drawSprite(g, 'bucket', -BUCKET / 2, -BUCKET * 62 / 64, BUCKET, BUCKET); g.restore();
      // gem counter on the bucket
      if (w.totalGems > 0) this.text(g, String(w.totalGems), x, L.surfaceY + 16, 15, '#ffffff', 'center', 'rgba(20,40,70,.85)');
    }
    hookPos(w, al) { const h = w.hook; return [h.x, lerp(h.prevY == null ? h.y : h.prevY, h.y, al)]; }
    drawLineAndHook(g, w, al) {
      const hk = w.hook; if (!hk) return;
      const tip = this.rodTip(w), [hx, hy] = this.hookPos(w, al);
      if (hk.lost) {   // snapped: a curly loose end dangles from the rod
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(tip[0], tip[1]);
        for (let i = 1; i <= 18; i++) g.lineTo(tip[0] + Math.sin(i * 1.4 + this.time * 3) * 5, tip[1] + i * 3);
        g.stroke();
        // the cut hook sinks and fades in the water with a short wavy bit of line
        const fa = clamp((w._snapT || 0) / 1.0, 0, 1);
        if (fa > 0.02 && hy > w.layout.waterTop) {
          g.globalAlpha = fa; g.beginPath(); g.moveTo(hx, hy - 70);
          for (let i = 1; i <= 8; i++) g.lineTo(hx + Math.sin(i * 1.3 + this.time * 4) * 4, hy - 70 + i * 5);
          g.stroke();
          const hc = this.spr('hook', HOOK[0], HOOK[1]);
          if (hc) { g.save(); g.translate(hx, hy - 30); g.rotate(hk.tilt || 0.3); g.drawImage(hc, -12, -1.5, HOOK[0], HOOK[1]); g.restore(); }
          g.globalAlpha = 1;
        }
        return;
      }
      const ax = hx + Math.sin(hk.tilt || 0) * 0, ay = hy - 30;   // line attach is 30 px above the hit centre
      // the line sags a little when slack (rising / idle) and is straight when tense (sinking / reeling)
      const tense = (w.reel && w.reel.active) || hk.holding ? 1 : clamp(1 - Math.abs(hk.vy || 0) / 200, 0, 1) * 0.4 + 0.6;
      const sag = (1 - tense) * 26 + Math.sin(this.time * 1.7) * 2;
      g.strokeStyle = 'rgba(250,250,255,.9)'; g.lineWidth = 1.6;
      g.beginPath(); g.moveTo(tip[0], tip[1]);
      g.quadraticCurveTo(tip[0] + (ax - tip[0]) * 0.5 + sag, tip[1] + (ay - tip[1]) * 0.5, ax, ay); g.stroke();
      // hook sprite rotated around the attach point
      const c = this.spr('hook', HOOK[0], HOOK[1]);
      g.save(); g.translate(ax, ay); g.rotate(hk.tilt || 0);
      if (c) g.drawImage(c, -12, -1.5, HOOK[0], HOOK[1]);
      else { g.fillStyle = '#ef3b3f'; g.beginPath(); g.arc(0, 8, 6, 0, TAU); g.fill(); }
      g.restore();
    }

    // ---------------- swimmers ----------------
    gemKey(type) { return 'gem_' + type; }
    drawGem(g, type, x, y, scale, bubble, alpha) {
      const glow = this.weather && this.weather.ambient ? this.weather.ambient.glow : 0, gold = type === 'gold';
      const s = (gold ? GEM_G : GEM) * scale, cu = this.custom('gem', s, s);
      g.globalAlpha = alpha == null ? 1 : alpha;
      if (glow > 0.05 || gold || cu) {   // a coloured glow ring keeps values readable (also on custom gems)
        const r = s * 1.1, gr = g.createRadialGradient(x, y, s * 0.2, x, y, r);
        const col = GEM_COL[type] || '#fff', ga = gold ? 0.55 + 0.25 * Math.sin(this.time * 6) : Math.max(glow * 0.75, cu ? 0.45 : 0);
        gr.addColorStop(0, col); gr.addColorStop(0.45, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.globalAlpha = (alpha == null ? 1 : alpha) * ga; g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.globalAlpha = alpha == null ? 1 : alpha;
      }
      if (cu) g.drawImage(this.spr(cu.key, cu.w, cu.h), x - cu.w / 2, y - cu.h / 2, cu.w, cu.h);
      else if (!this.drawC(g, this.gemKey(type), x, y, s, s)) { g.fillStyle = GEM_COL[type]; g.beginPath(); g.arc(x, y, s / 2.4, 0, TAU); g.fill(); }
      if (gold) {   // twinkle
        const k = (this.time * 1.3) % 1;
        g.globalAlpha = (alpha == null ? 1 : alpha) * (1 - k);
        this.drawC(g, 'p_sparkle', x + s * 0.32, y - s * 0.3, 14 + 6 * k, 14 + 6 * k);
      }
      if (bubble) { g.globalAlpha = (alpha == null ? 1 : alpha) * 0.95; this.drawC(g, 'bubble', x, y, BUBBLE * scale, BUBBLE * scale); }
      g.globalAlpha = 1;
    }
    drawItems(g, w, al, top) {
      for (const it of w.items) {
        const hooked = it.state === 'hooked' || it.state === 'caught';
        if (hooked !== top) continue;
        const x = lerp(it.prevX == null ? it.x : it.prevX, it.x, al), y = lerp(it.prevY == null ? it.y : it.prevY, it.y, al);
        const left = (it.vx || 0) < 0;
        if (it.kind === 'gem') {
          if (it.state === 'caught') { const k = clamp(it.t / 0.75, 0, 1); this.drawGem(g, it.type, x, y, 1 - clamp((k - 0.6) / 0.4, 0, 1) * 0.45, false, 1); }
          else if (it.state === 'hooked') this.drawGem(g, it.type, x, y, 1, false, 1);
          else if (it.state === 'escape') this.drawGem(g, it.type, x, y, 1, true, clamp((3 - it.t) / 0.8, 0, 1));
          else this.drawGem(g, it.type, x, y + Math.sin(this.time * 2 + it.id) * 1.5, 1, true, 1);
        } else if (it.kind === 'fish') {
          const wig = Math.sin(this.time * 9 + it.id) * 0.06;
          g.globalAlpha = 0.95;
          this.drawC(g, 'fish_' + (it.type === 'b' ? 'b' : 'a'), x, y, FISH[0], FISH[1], left, wig * (left ? -1 : 1), 1 - Math.abs(wig));
          g.globalAlpha = 1;
        } else if (it.kind === 'puffer') {
          const cu = this.custom('puffer', PUF[0], PUF[1]);
          let a = 1;
          if (it.state === 'puffed' && it.t > 5) a = clamp((7 - it.t) / 2, 0, 1);
          if (it.leaving) a = Math.min(a, 0.85);
          g.globalAlpha = a;
          const pf = it.state === 'puffed' ? (it.puff == null ? 1 : it.puff) : 0;
          if (cu) {
            const s = 1 + pf * 0.45;
            this.drawC(g, cu.key, x, y, cu.w * s, cu.h * s, left, 0, 1, 1);
          } else if (pf > 0.35) {
            const s = PUFF * (0.8 + 0.2 * pf) * (1 + Math.sin(this.time * 8) * 0.02);
            this.drawC(g, 'puffer_puffed', x, y, s, s, left);
          } else {
            const sw = Math.sin(this.time * 6 + it.id) * 0.04;
            this.drawC(g, 'puffer', x, y, PUF[0], PUF[1], left, sw, 1 + pf * 0.3, 1 + pf * 0.3);
          }
          g.globalAlpha = 1;
        }
      }
    }

    // ---------------- reel meter ----------------
    reelPos(w) {
      const L = w.layout, hy = w.hook.y, R = 64;
      let cx = L.holeX + 170;
      if (cx + R + 14 > this.VW - this.ins.right) cx = L.holeX - 170;
      const cy = clamp(hy + 20, L.waterTop + R + 50, this.VH - this.ins.bottom - 46);
      return [cx, cy, R];
    }
    drawReel(g, w) {
      const r = w.reel, [cx, cy, R] = this.reelPos(w);
      const a0 = Math.PI * 1.08, a1 = Math.PI * 1.92, ang = u => lerp(a0, a1, clamp(u, 0, 1));
      // plate
      const rf = this.reelFlash || 0, nx = rf > 0 ? Math.sin(rf * 60) * 3 : 0;
      g.fillStyle = rf > 0 ? 'rgba(150,40,50,.8)' : 'rgba(12,28,60,.72)'; this.rr(g, cx - R - 16 + nx, cy - R - 42, 2 * R + 32, R + 86, 22); g.fill();
      g.strokeStyle = 'rgba(227,251,255,.55)'; g.lineWidth = 2; g.stroke();
      g.lineCap = 'round';
      g.lineWidth = 16; g.strokeStyle = 'rgba(255,255,255,.22)'; g.beginPath(); g.arc(cx, cy, R, a0, a1); g.stroke();
      const z0 = r.zone - r.width / 2, z1 = r.zone + r.width / 2;
      g.strokeStyle = '#53d88a'; g.beginPath(); g.arc(cx, cy, R, ang(z0), ang(z1)); g.stroke();
      const p0 = r.zone - r.perfect / 2, p1 = r.zone + r.perfect / 2;
      g.lineWidth = 16; g.strokeStyle = '#ffd84a'; g.beginPath(); g.arc(cx, cy, R, ang(p0), ang(p1)); g.stroke();
      g.lineCap = 'butt';
      // needle
      const na = ang(r.needle), inZone = Math.abs(r.needle - r.zone) <= r.width / 2;
      g.strokeStyle = inZone ? '#ffffff' : '#ffb3a0'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(na) * (R + 12), cy + Math.sin(na) * (R + 12)); g.stroke(); g.lineCap = 'butt';
      g.fillStyle = '#e5383b'; g.beginPath(); g.arc(cx, cy, 9 + (r.tug || 0) * 4, 0, TAU); g.fill();
      g.strokeStyle = '#fff3e0'; g.lineWidth = 3; g.stroke();
      // taps left (dots) and slips left (bubbles)
      const steps = r.steps || 0, show = Math.min(steps, 8);
      for (let i = 0; i < show; i++) { g.fillStyle = '#e3fbff'; g.beginPath(); g.arc(cx - (show - 1) * 7 + i * 14, cy + 22, 5, 0, TAU); g.fill(); }
      for (let i = 0; i < (r.maxSlips || 3); i++) {
        g.fillStyle = i < (r.slips || 0) ? 'rgba(255,140,120,.95)' : 'rgba(255,255,255,.28)';
        g.beginPath(); g.arc(cx - 14 + i * 14, cy + 36, 5, 0, TAU); g.fill();
      }
      const pulse = inZone ? 1 + 0.08 * Math.sin(this.time * 20) : 1;
      this.text(g, inZone ? 'TAP!' : 'Reel', cx, cy - R - 24, Math.round(17 * pulse), inZone ? '#9dffbf' : '#e3fbff');
    }

    // ---------------- fx, text, HUD ----------------
    drawFx(g) {
      for (const f of this.fx) {
        const k = f.life / f.max, a = 1 - k;
        if (f.k === 'circle') { g.globalAlpha = a; g.strokeStyle = f.color; g.lineWidth = 3 * a + 1; g.beginPath(); g.arc(f.x, f.y, lerp(f.r0, f.r1, Math.sqrt(k)), 0, TAU); g.stroke(); }
      }
      g.globalAlpha = 1;
    }
    text(g, s, x, y, size, color, align, stroke) {
      g.font = '900 ' + size + 'px ' + FONT; g.textAlign = align || 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(3, size * 0.16); g.strokeStyle = stroke || 'rgba(16,30,60,.85)';
      g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y);
    }
    drawTexts(g) {
      for (const t of this.texts) {
        const k = t.life / t.max, a = k > 0.7 ? (1 - k) / 0.3 : 1, sc = t.life < 0.18 ? easeOutBack(t.life / 0.18) : 1;
        g.globalAlpha = clamp(a, 0, 1);
        g.font = '900 ' + t.size + 'px ' + FONT;
        const half = g.measureText(t.text).width / 2 + 8;
        this.text(g, t.text, clamp(t.x, half, this.VW - half), t.y, Math.max(1, Math.round(t.size * sc)), t.color);
      }
      g.globalAlpha = 1;
    }
    drawHint(g, w) {
      // first zone: a pulsing "hold to sink" chip next to the hook until the player hooks the first gem
      if (w.level === 0 && w.stats && w.stats.hooks === 0 && w.phase === 'roam' && !(PR.Game && PR.Game.bot)) {
        const [hx, hy] = this.hookPos(w, 1), a = 0.9 + 0.1 * Math.sin(this.time * 5);
        const touch = PR.Game && PR.Game.isTouch, msg = touch ? 'Hold = sink · let go = float' : 'Hold SPACE = sink · let go = float';
        const fs = Math.round(17 * Math.min(this._hudK || 1, 1.4)), ty = Math.min(this.VH - 40, Math.max(w.layout.waterTop + 40, hy + 56));
        g.font = '900 ' + fs + 'px ' + FONT; const tw = g.measureText(msg).width;
        g.globalAlpha = a;
        g.fillStyle = 'rgba(16,34,70,.55)'; this.rr(g, hx - tw / 2 - 12, ty - fs * 0.8, tw + 24, fs * 1.6, fs * 0.8); g.fill();
        this.text(g, msg, hx, ty, fs, '#ffffff');
        // arrow under the hook
        const ay = hy + 24 + Math.sin(this.time * 5) * 4;
        g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(hx - 7, ay); g.lineTo(hx + 7, ay); g.lineTo(hx, ay + 10); g.closePath(); g.fill();
        g.globalAlpha = 1;
      }
      if (this.goldHint > 0 && w.phase === 'roam') {
        const gem = w.items.find(it => it.type === 'gold' && it.state === 'swim');
        if (gem) { g.globalAlpha = clamp(this.goldHint, 0, 1); this.text(g, '★ Golden gem! ★', clamp(gem.x, 110, this.VW - 110), gem.y - 46, 18, '#ffe14d'); g.globalAlpha = 1; }
      }
    }
    /* HUD: score + lines plate (top-left in landscape; in portrait just under the ice on the left, because Bao and
     * his bucket fill the narrow sky) and the zone pill with gem progress (right of the hole, below the buttons in portrait). */
    drawHud(g, w) {
      const I = this.ins, L = w.layout, portrait = this.VW < this.VH;
      const K = portrait ? Math.min(this._hudK || 1, 1.1) : (this._hudK || 1);
      const x0 = I.left + 12, y0 = I.top + 10;
      const ss = Math.round(26 * K), ic = Math.round(26 * K);
      const plateW = Math.round(Math.max(3 * (ic + 4) + 16, 120 * K)), plateH = Math.round(76 * K);
      g.fillStyle = 'rgba(16,34,70,.5)'; this.rr(g, x0 - 4, y0 - 4, plateW, plateH, 12); g.fill();
      this.text(g, String(w.score || 0), x0 + 6, y0 + ss * 0.55, ss, '#ffffff', 'left');
      const ly = y0 + ss + 18 * K;
      for (let i = 0; i < (w.maxLines || 3); i++) {
        g.globalAlpha = i < w.lines ? 1 : 0.25;
        if (!this.drawSprite(g, 'spool', x0 + 4 + i * (ic + 4), ly - ic / 2, ic, ic)) { g.fillStyle = '#e5383b'; g.beginPath(); g.arc(x0 + 16 + i * (ic + 4), ly, ic / 3, 0, TAU); g.fill(); }
      }
      g.globalAlpha = 1;
      // zone name + gem progress
      const btnL = this._hudBtn ? this._hudBtn.l : this.VW - 110;
      let left = L.holeX + 60, right = btnL - 10, py = I.top + 10;
      if (portrait || right - left < 200) { left = L.holeX + 26; right = this.VW - I.right - 10; py = I.top + 74 * (this._hudK || 1); }
      const pw = Math.min(250 * K, right - left - 16);
      if (pw > 70) {
        const cx = (left + right) / 2, info = ZONE_INFO[(w.zone || 0) % 4], loop = w.loop ? ' ' + (w.loop + 1) : '';
        g.fillStyle = 'rgba(16,34,70,.55)'; this.rr(g, cx - pw / 2 - 8, py - 4, pw + 16, Math.round(50 * K), 12); g.fill();
        g.font = '900 ' + Math.round(15 * K) + 'px ' + FONT;
        const fs = Math.round(15 * K * Math.min(1, pw / Math.max(1, g.measureText(info.name + loop).width)));
        this.text(g, info.name + loop, cx, py + 9 * K, fs, '#ffffff');
        const n = w.gemsNeeded || 8, got = Math.min(n, w.gemsInZone || 0), d = Math.min(18 * K, pw / n), gx0 = cx - (n - 1) * d / 2;
        for (let i = 0; i < n; i++) {
          const gx = gx0 + i * d, gy = py + 30 * K;
          if (i < got) this.drawC(g, 'gem_amethyst', gx, gy, Math.min(15 * K, d * 0.95), Math.min(15 * K, d * 0.95));
          else { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(gx, gy, 5 * K, 0, TAU); g.fill(); g.strokeStyle = 'rgba(16,34,70,.5)'; g.lineWidth = 1.5; g.stroke(); }
        }
      }
    }
    rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    drawBanner(g) {
      const b = this.banner; if (!b) return;
      const info = ZONE_INFO[b.s % 4], k = b.t, a = k < 0.25 ? k / 0.25 : k > 2.1 ? (2.6 - k) / 0.5 : 1;
      const L = this.world.layout, side = L.holeX - 150 >= 300;
      // keep the hook column clear: beside it on wide screens, low in the water on narrow ones
      const w = side ? Math.min(460, L.holeX - 160) : Math.min(this.VW - 40, 520);
      const bx = side ? Math.max(this.ins.left + 12, (L.holeX - 150 - w) / 2 + 6) : this.VW / 2 - w / 2, mx = bx + w / 2;
      const cy = side ? L.waterTop + 110 : Math.round(this.VH * 0.74);
      const loop = b.loop ? '  (dive ' + (b.loop + 1) + ')' : '';
      g.globalAlpha = clamp(a, 0, 1);
      g.fillStyle = info.dark + 'd9'; this.rr(g, bx, cy - 42, w, 88, 22); g.fill();
      g.strokeStyle = info.color; g.lineWidth = 4; g.stroke();
      const fit = (t, sz) => { g.font = '900 ' + sz + 'px ' + FONT; return Math.max(10, Math.floor(sz * Math.min(1, (w - 28) / g.measureText(t).width))); };
      this.text(g, info.name + loop, mx, cy - 12, fit(info.name + loop, w < 420 ? 26 : 32), '#ffffff');
      this.text(g, info.hint, mx, cy + 24, fit(info.hint, w < 420 ? 14 : 17), '#e3fbff');
      g.globalAlpha = 1;
    }
    drawDebug(g, w) {
      g.strokeStyle = 'rgba(255,255,0,.8)'; g.lineWidth = 1;
      const hk = w.hook; g.beginPath(); g.arc(hk.x, hk.y, hk.r || 11, 0, TAU); g.stroke();
      for (const it of w.items) { g.strokeStyle = it.kind === 'puffer' ? 'rgba(255,80,80,.9)' : 'rgba(80,255,120,.9)'; g.beginPath(); g.arc(it.x, it.y, it.r || 20, 0, TAU); g.stroke(); }
      const L = w.layout; g.strokeStyle = 'rgba(255,255,255,.4)';
      for (const y of L.bands) { g.beginPath(); g.moveTo(0, y); g.lineTo(this.VW, y); g.stroke(); }
      const st = PR.debug && PR.debug.getState && PR.debug.getState();
      if (st) { g.font = '12px monospace'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(JSON.stringify(st).slice(0, 170), 10, this.VH - 10); }
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  PR.Renderer = Renderer;
})(window.PR = window.PR || {});
