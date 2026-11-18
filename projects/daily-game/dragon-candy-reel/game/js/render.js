/* PR.Renderer — side view of the Fizzy Soda Lake: sky, Taffy on the wafer dock, soda water below (DESIGN §2).
 * Layers: the sky + far shore drift slowly (pre-rendered device-pixel strips, blitted pixel-exact); the water,
 * lake bed, wafer dock (with the 64 px gap cut out) and the gap ends are pre-rendered ONCE per level and size into
 * one device-pixel canvas. Level changes crossfade. On top: Taffy, the candy jar, the windsock, the wind-bowed line
 * and bobber, snowflakes in soda bubbles, gummy fish, sour gummies, weather particles, the reel meter, juicy
 * effects and the HUD. Positions are lerped with world.alpha. */
(function (PR) {
  'use strict';
  const ZONE_INFO = [
    { name: 'Sunny Shore', color: '#ffb3d1', dark: '#1f6f8c', back: ['#a6ecef', '#8fe3e0'], hint: 'Hold to sink, let go to float up!' },
    { name: 'Sprinkle Rain', color: '#d2c2ff', dark: '#3d4f78', back: ['#a3cbd6', '#7cc4cf'], hint: 'Deeper snowflakes are worth more!' },
    { name: 'Windy Swirl', color: '#9ff0e0', dark: '#1f6a86', back: ['#a8e9ea', '#86dcd6'], hint: 'Big gusts! Watch the windsock!' },
    { name: 'Sugar Snow', color: '#ffe3a3', dark: '#24305f', back: ['#6a8cc4', '#4f7fb8'], hint: 'The snowflakes glow in the snow!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const HERO = 128, HK = HERO / 160;                       // Taffy drawn 128 px from a 160 viewBox
  const ROD = { idle: [150, 22], happy: [150, 22], oops: [150, 22], reel: [146, 14] };
  const FLAKE = 40, FLAKE_G = 44, BUBBLE = 62, HOOK = [24, 36], GUM = [64, 53], GUM_P = 80, FISH = [50, 30], JAR = 44;
  const HOOK_K = HOOK[0] / 32, HOOK_ATTACH = [16 * HOOK_K, 2 * HOOK_K], HOOK_HIT = 32 * HOOK_K;   // hook.svg: line (16,2), hit (16,32)
  const FLAKE_COL = { berry: '#ff6fa8', lime: '#8fe34a', grape: '#b27cff', gold: '#ffd84a' };
  const GAP = 64;                                          // gap in the wafer dock (DESIGN §2)
  const SOCK = [72, 48], SOCK_K = SOCK[0] / 96;            // windsock.svg 96×64 drawn 72×48, pointing right
  const SOCK_SPLIT = 11, SOCK_AXIS = 18;                   // svg x where the sock starts, svg y of its axis

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.goldFlash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.drift = 0; this.skyDrift = 0; this.lean = 0; this.sock = { len: 1, ang: 1.5 }; this.gustT = 0;
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
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width, b: (r.bottom - c.top) * this.VH / c.height } : null;
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
     * canvas (water, lake bed, the opening in the gap, the dock with the gap cut out, the gap ends). With a custom picture: low holds it all. */
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
        // reef: bottom-aligned, tiles, its calm centre (svg x 480) under the gap
        const reef = A.img[n + '_reef'];
        if (reef) { const off = ((holeX - 480) % 960 + 960) % 960 - 960; for (let x = off; x < VW; x += 960) g.drawImage(reef, x, VH - 320, 960, 320); }
      }
      // through the gap: soda water from the deck line down (so the opening reads as a way into the lake)
      const bw = g.createLinearGradient(0, 158, 0, 192);
      bw.addColorStop(0, info.back[0]); bw.addColorStop(1, info.back[1]);
      g.fillStyle = bw; g.fillRect(holeX - GAP / 2 - 2, 158, GAP + 4, 34);
      // wafer dock with the gap cut out
      const dock = A.img[n + '_dock'];
      if (dock) {
        g.save(); g.beginPath(); g.rect(0, 0, holeX - GAP / 2, VH); g.rect(holeX + GAP / 2, 0, VW, VH); g.clip();
        const off = ((holeX - 480) % 960 + 960) % 960 - 960;
        for (let x = off; x < VW; x += 960) g.drawImage(dock, x, 140, 960, 80);
        g.restore();
      } else { g.fillStyle = '#e9b86a'; g.fillRect(0, 150, holeX - GAP / 2, 40); g.fillRect(holeX + GAP / 2, 150, VW, 40); }
      const ends = A.img.dock_gap;
      if (ends) g.drawImage(ends, holeX - 48, 140, 96, 80);
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
        // the clouds drift with the wind a little (speed only; a tile never jumps)
        this._blitTile(g, bg.sky, this.skyDrift, alpha);
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
            this.say(it.type === 'gold' ? 'Golden snowflake!' : 'Hooked!', it.x, it.y - 50, it.type === 'gold' ? '#ffe14d' : '#e3fbff', 26);
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
          case 'escape': if (e.item) this.say('It floated away!', e.item.x, e.item.y - 50, '#ffd0b0', 22); break;
          case 'catch': {
            const it = e.item, gold = it && it.type === 'gold';
            this.say('+' + e.points, L.holeX - 64, L.surfaceY - 118,   // above Taffy's head, clear of the windsock and the HUD
               gold ? '#ffe14d' : '#ffffff', gold ? 40 : 30);
            if (wx) {
              wx.burst('drop', e.x, L.waterTop - 6, 10, { speed: 160, gravity: 500, life: 0.8, size: 12, up: 1, spread: 1.6 });
              wx.burst(gold ? 'star' : 'sparkle', e.x, L.waterTop - 30, gold ? 18 : 9, { speed: gold ? 200 : 130, gravity: 120, life: 1, size: gold ? 20 : 14 });
            }
            if (gold) { this.goldFlash = 1; this.shake = 0.18; }
            this.jarPop = 1;
            break;
          }
          case 'splash': if (wx) wx.burst('drop', e.x, e.y - 4, 6, { speed: 110, gravity: 500, life: 0.6, size: 10, up: 1, spread: 1.4 }); break;
          case 'puff': if (e.item) this.ring(e.item.x, e.item.y, '#ffb54a', 0.5, 60); break;
          case 'snap': {
            this.shake = 0.35; this.flash = 0.6;
            this.say('Fizz, boing! The line snapped', e.x, Math.max(L.waterTop + 60, e.y - 60), '#ffd36b', 24);
            if (wx) { wx.burst('puff', e.x, e.y, 8, { speed: 80, life: 0.9, size: 34 }); wx.burst('bubble_s', e.x, e.y, 12, { speed: 120, life: 0.9, size: 10, up: 0.8 }); }
            break;
          }
          case 'lineBack': this.say('+1 line', 90, 120, '#ff8f8f', 22); break;
          case 'golden': this.goldHint = 2.5; break;
          case 'levelUp': this.showBanner(e.zone); this.gustT = 0; break;
          case 'gustWarn': {
            this.gustT = 1.5; this.gustDir = e.dir;
            // the first gusts of a game get a word next to the windsock, so a child learns what it means
            if (w && w.stats && (w.stats.gusts || 0) < 2) {
              const [sx, sy] = this.sockPos(w), tall = this.VW < this.VH;
              this.say('Whoosh! Wind!', tall ? sx - 20 : sx + e.dir * 40, tall ? L.waterTop + 34 : sy - 62 * SOCK_K * this.sockScale() - 10, '#ffffff', 20);
            }
            break;
          }
          case 'gust': if (wx && L) wx.burst('sparkle', this.sockPos(w)[0] + e.dir * 30, this.sockPos(w)[1] - 30, 5, { speed: 90, life: 0.6, size: 12, layer: 'sky' }); break;
        }
      }
    }
    say(text, x, y, color, size) { this.texts.push({ text, x, y, color, size, life: 0, max: 1.3 }); if (this.texts.length > 12) this.texts.shift(); }
    ring(x, y, color, max, r1) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 10, r1, color }); }

    update(dt) {
      this.time += dt; this.drift += dt;
      const wv = this.world && this.world.wind ? this.world.wind.value : 0;
      this.skyDrift += dt * (5 + 12 * wv);
      this.lean += (wv - this.lean) * (1 - Math.exp(-dt * 3));   // Taffy and the rod lean a little behind the wind
      this.gustT = Math.max(0, this.gustT - dt);
      this._reelDt = dt;
      if (this.world && this.world.reel && !this.world.reel.active) this._reelSide = null;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.1);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.goldFlash = Math.max(0, this.goldFlash - dt * 1.5);
      this.jarPop = Math.max(0, (this.jarPop || 0) - dt * 3);
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
      const al = clamp(w.alpha == null ? 1 : w.alpha, 0, 1);
      this.drawParticles(g, 'sky');
      this.drawParticles(g, 'back');
      if (amb && amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, w.layout.waterTop, this.VW, this.VH - w.layout.waterTop); }   // water light only; items stay bright
      this.drawItems(g, w, al, false);
      this.drawJar(g, w);
      this.drawWindsock(g, w);
      this.drawLineAndHook(g, w, al);
      this.drawTaffy(g, w);
      this.drawItems(g, w, al, true);     // hooked / caught snowflakes above the line
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
        const q = p.size <= 8 ? 8 : p.size <= 16 ? 16 : p.size <= 32 ? 32 : 64, c = this.spr('p_' + p.sprite, q, q);   // 4 cached sizes per sprite
        if (!c) { g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(p.x, p.y, p.size / 4, 0, TAU); g.fill(); continue; }
        if (p.glow) g.globalCompositeOperation = 'lighter';
        const sy = p.sx || 1, fl = p.flipX ? -1 : 1;   // rings: size wide × size·sx tall (flat ripples)
        if (!p.rot && fl === 1 && sy === 1) g.drawImage(c, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
        else {
          g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); if (fl !== 1) g.scale(-1, 1);
          g.drawImage(c, -p.size / 2, -p.size * sy / 2, p.size, p.size * sy); g.restore();
        }
        if (p.glow) g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = 1;
    }

    // ---------------- Taffy, jar, windsock, line, hook ----------------
    heroBox(w) { const L = w.layout; return { x: L.holeX - 4 - ROD.idle[0] * HK, y: L.surfaceY - 150 * HK }; }
    /* Taffy leans a little behind the wind (a skew around the seat): + = top pushed right */
    leanK() { return clamp(this.lean, -1, 1) * 0.035; }
    rodTip(w) {
      const b = this.heroBox(w), a = w.taffy && w.taffy.anim || 'idle', r = ROD[a] || ROD.idle, tug = w.reel ? w.reel.tug || 0 : 0;
      const L = w.layout, lk = this.leanK();
      if (PR.Assets.hasCustom('hero')) return [L.holeX - 2 + lk * 100, L.surfaceY - 100 + tug * 6];
      const ty = b.y + r[1] * HK + tug * 7;
      // the rod tip flexes downwind a bit more than the body leans
      return [b.x + r[0] * HK - lk * (ty - L.surfaceY) * 1.6, ty];
    }
    drawTaffy(g, w) {
      const L = w.layout, b = this.heroBox(w), a = (w.taffy && w.taffy.anim) || 'idle', t = w.taffy ? w.taffy.t : 0;
      const breathe = Math.sin(this.time * 2.2) * 0.012, hop = a === 'happy' ? Math.max(0, Math.sin(Math.min(t, 0.5) / 0.5 * Math.PI)) * 8 : 0;
      const lk = this.leanK() + Math.sin(this.time * 7.3) * 0.004 * Math.abs(this.lean);   // a little flutter in strong wind
      const cu = this.custom('hero', 112, 112);
      if (cu) {
        // custom hero: sits left of the gap, bobs and squashes; we draw the rod ourselves
        const cx = L.holeX - 70, by = L.surfaceY + 2 - hop, sq = 1 + breathe * 2 + (a === 'reel' ? Math.sin(this.time * 18) * 0.03 : 0);
        g.save(); g.translate(cx, by); g.transform(1, 0, -lk, 1, 0, 0); g.scale(1 / sq, sq);
        g.drawImage(this.spr(cu.key, cu.w, cu.h), -cu.w / 2, -cu.h, cu.w, cu.h); g.restore();
        const tip = this.rodTip(w);
        g.strokeStyle = '#f4f0ea'; g.lineWidth = 6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(cx + 18, by - cu.h * 0.45); g.lineTo(tip[0], tip[1]); g.stroke();
        g.strokeStyle = '#e8486a'; g.lineWidth = 2; g.setLineDash([5, 5]); g.stroke(); g.setLineDash([]);
        return;
      }
      const key = 'taffy_' + a, sy = 1 + breathe;
      const c = this.spr(key, HERO, HERO) || this.spr('taffy_idle', HERO, HERO);
      if (!c) return;
      g.save(); g.translate(b.x + 68 * HK, L.surfaceY - hop); g.transform(1, 0, -lk, 1, 0, 0); g.scale(1 / sy, sy);
      g.drawImage(c, -68 * HK, -150 * HK, HERO, HERO); g.restore();
    }
    drawJar(g, w) {
      const L = w.layout, x = L.holeX - 150, p = this.jarPop || 0, s = 1 + p * 0.18;
      g.save(); g.translate(x, L.surfaceY + 1); g.scale(1 / (1 + p * 0.1), s);
      this.drawSprite(g, 'jar', -JAR / 2, -JAR * 62 / 64, JAR, JAR); g.restore();
      // snowflake counter on the dock front under the jar
      if (w.totalFlakes > 0) this.text(g, String(w.totalFlakes), x, L.surfaceY + 17, 15, '#ffffff', 'center', 'rgba(110,50,30,.85)');
    }
    /* The windsock stands on the dock right of the gap (kept clear of the HUD pill and buttons; inside the screen in
     * portrait). Returns [poleX, poleBottomY]. */
    sockPos(w) {
      const L = w.layout;
      const x = Math.min(L.holeX + 150, this.VW - this.ins.right - 70 * this.sockScale());
      return [Math.round(x), L.surfaceY];
    }
    /* drawn bigger in landscape (there is room in the sky under the level pill); 72×48 in portrait */
    sockScale() { return this.VW < this.VH || this.VW < 800 ? 1 : 1.3; }
    drawWindsock(g, w) {
      const wd = w.wind; if (!wd) return;
      const c = this.spr('windsock', SOCK[0] * this.sockScale(), SOCK[1] * this.sockScale());
      const [px0, py0] = this.sockPos(w), SC = this.sockScale(), K = SOCK_K * SC, top = py0 - 62 * K;   // pole bottom (10,62) on the deck
      const SH = SOCK[1] * SC;
      const v = clamp(wd.value || 0, -1, 1), av = Math.abs(v), warn = wd.warn > 0 || this.gustT > 0;
      // sock: hangs limp in calm air, lifts and stretches with the wind, flutters faster when it blows harder
      const lift = Math.pow(clamp(av / 0.7, 0, 1), 0.8);
      const fl = Math.sin(this.time * (5 + 11 * av)) * (0.05 + 0.05 * av) + (warn ? Math.sin(this.time * 23) * 0.05 : 0);
      const droop = 0.12 + (Math.PI / 2 - 0.12) * (1 - lift) + fl * (0.4 + lift);
      const len = 0.72 + 0.5 * av + Math.sin(this.time * 13 + 1) * 0.03 * av;
      const dir = v >= 0 ? 1 : -1;
      const ax = px0 + (SOCK_SPLIT - 10) * K, ay = top + SOCK_AXIS * K;   // sock pivot (on the pole)
      if (c) {
        const kx = c.width / 96, ky = c.height / 64;
        g.save(); g.translate(ax, ay); g.rotate(dir * droop); g.scale(dir * len, 1 + Math.sin(this.time * 9) * 0.04 * av);
        g.drawImage(c, SOCK_SPLIT * kx, 0, (96 - SOCK_SPLIT) * kx, 40 * ky, 0, -SOCK_AXIS * K, (96 - SOCK_SPLIT) * K, 40 * K);
        g.restore();
        // pole + lollipop knob on top (drawn after, so the sock swings behind the pole)
        g.drawImage(c, 0, 0, 12 * kx, c.height, px0 - 10 * K, top, 12 * K, SH);
      } else {
        g.strokeStyle = '#fff7ea'; g.lineWidth = 3; g.beginPath(); g.moveTo(px0, py0); g.lineTo(px0, top + 6); g.stroke();
        g.save(); g.translate(ax, ay); g.rotate(dir * droop); g.scale(dir * len, 1);
        g.fillStyle = '#ff7aa8'; g.beginPath(); g.moveTo(0, -10); g.lineTo(58, -4); g.lineTo(58, 4); g.lineTo(0, 10); g.closePath(); g.fill(); g.restore();
      }
      // a coming gust: a pulsing arrow above the windsock, pointing where the wind will blow
      if (warn) {
        const d = wd.warn > 0 ? wd.warnDir : (this.gustDir || dir), k = wd.warn > 0 ? wd.warn / 1.5 : this.gustT / 1.5;
        const pulse = 0.5 + 0.5 * Math.sin(this.time * 14), ay2 = ay - 2, cx = px0 + d * (34 + (1 - k) * 20) * Math.max(1, SC * 0.9);
        g.save(); g.translate(cx, ay2); g.scale(d * (1 + 0.12 * pulse), 1 + 0.12 * pulse);
        g.globalAlpha = 0.65 + 0.35 * pulse;
        g.beginPath(); g.moveTo(-16, -5); g.lineTo(4, -5); g.lineTo(4, -12); g.lineTo(18, 0); g.lineTo(4, 12); g.lineTo(4, 5); g.lineTo(-16, 5); g.closePath();
        g.lineJoin = 'round'; g.lineWidth = 4; g.strokeStyle = 'rgba(30,40,90,.8)'; g.stroke();
        g.fillStyle = '#ffffff'; g.fill();
        // two little wind streaks behind the arrow
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2.4; g.lineCap = 'round';
        for (let i = 0; i < 2; i++) { const o = ((this.time * 2.2 + i * 0.5) % 1); g.globalAlpha = (1 - o) * 0.9; g.beginPath(); g.moveTo(-22 - o * 14, -9 + i * 18); g.lineTo(-34 - o * 14, -9 + i * 18); g.stroke(); }
        g.restore(); g.globalAlpha = 1; g.lineCap = 'butt';
      }
    }
    hookPos(w, al) { const h = w.hook; return [lerp(h.prevX == null ? h.x : h.prevX, h.x, al), lerp(h.prevY == null ? h.y : h.prevY, h.y, al)]; }
    /* The line: rod tip → through the dock gap → the bobber. Above the water it is a gently bowed curve pushed
     * downwind; under water it bows downwind with depth (the current drags it) and is tighter while reeling. */
    drawLineAndHook(g, w, al) {
      const hk = w.hook; if (!hk) return;
      const L = w.layout, tip = this.rodTip(w), [hx, hy] = this.hookPos(w, al);
      const v = w.wind ? clamp(w.wind.value || 0, -1, 1) : 0;
      if (hk.lost) {   // snapped: a curly loose end dangles from the rod, blown by the wind
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(tip[0], tip[1]);
        for (let i = 1; i <= 18; i++) g.lineTo(tip[0] + Math.sin(i * 1.4 + this.time * 3) * 5 + v * i * 0.9, tip[1] + i * 3);
        g.stroke();
        // the cut bobber sinks and fades in the water with a short wavy bit of line
        const fa = clamp((w._snapT || 0) / 1.0, 0, 1);
        if (fa > 0.02 && hy > L.waterTop) {
          g.globalAlpha = fa; g.beginPath(); g.moveTo(hx, hy - 70);
          for (let i = 1; i <= 8; i++) g.lineTo(hx + Math.sin(i * 1.3 + this.time * 4) * 4, hy - 70 + i * 5);
          g.stroke();
          const hc = this.spr('hook', HOOK[0], HOOK[1]);
          if (hc) { g.save(); g.translate(hx, hy - 30); g.rotate(hk.tilt || 0.3); g.drawImage(hc, -HOOK_ATTACH[0], -HOOK_ATTACH[1], HOOK[0], HOOK[1]); g.restore(); }
          g.globalAlpha = 1;
        }
        return;
      }
      // line attach point on the bobber (the hook is drawn rotated by tilt around it)
      const ax = hx, ay = hy - (HOOK_HIT - HOOK_ATTACH[1]);
      const reel = w.reel && w.reel.active, tense = reel || hk.holding ? 1 : clamp(1 - Math.abs(hk.vy || 0) / 200, 0, 1) * 0.4 + 0.6;
      const sag = (1 - tense) * 18 + Math.sin(this.time * 1.7) * 1.5;
      const flutter = Math.sin(this.time * 9.5) * 1.4 * Math.abs(v);
      g.strokeStyle = 'rgba(250,250,255,.92)'; g.lineWidth = 1.6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(tip[0], tip[1]);
      if (ay <= L.waterTop + 2) {
        // bobber above or at the surface (dropping in / hanging after a catch): one soft curve
        g.quadraticCurveTo((tip[0] + ax) / 2 + v * 10 + sag * 0.3 + flutter, (tip[1] + ay) / 2, ax, ay);
      } else {
        const depth = clamp((ay - L.waterTop) / Math.max(1, L.maxHookY - L.waterTop), 0, 1);
        // where the line enters the water: inside the dock gap, nudged by the wind and toward the swayed bobber
        const ex = clamp(lerp(tip[0], ax, 0.18) + v * 5, L.holeX - GAP / 2 + 6, L.holeX + GAP / 2 - 6), ey = L.waterTop;
        // air part: bowed downwind
        g.quadraticCurveTo((tip[0] + ex) / 2 + v * (reel ? 4 : 9) + flutter, (tip[1] + ey) / 2, ex, ey);
        // water part: leaves the surface nearly straight down, then the current drags it toward the bobber
        const bow = v * (reel ? 6 : 16) * (0.4 + depth) + sag * 0.5;
        g.quadraticCurveTo(lerp(ex, ax, 0.15) + bow, lerp(ey, ay, 0.6), ax, ay);
      }
      g.stroke(); g.lineCap = 'butt';
      // bobber + hook sprite rotated around the attach point
      const c = this.spr('hook', HOOK[0], HOOK[1]);
      g.save(); g.translate(ax, ay); g.rotate(hk.tilt || 0);
      if (c) g.drawImage(c, -HOOK_ATTACH[0], -HOOK_ATTACH[1], HOOK[0], HOOK[1]);
      else { g.fillStyle = '#ff6fa8'; g.beginPath(); g.arc(0, 8, 6, 0, TAU); g.fill(); }
      g.restore();
    }

    // ---------------- swimmers ----------------
    flakeKey(type) { return 'flake_' + type; }
    /* A sugar snowflake: coloured glow ring (values stay readable on any water and with a custom picture), a slow
     * spin, a twinkle when golden, and the soda bubble around it while it drifts. */
    drawFlake(g, type, x, y, scale, bubble, alpha, spin) {
      const A0 = alpha == null ? 1 : alpha, glow = this.weather && this.weather.ambient ? this.weather.ambient.glow : 0, gold = type === 'gold';
      const s = (gold ? FLAKE_G : FLAKE) * scale, cu = this.custom('flake', s, s), col = FLAKE_COL[type] || '#fff';
      const r = s * (bubble ? 0.86 : 0.8), gr = g.createRadialGradient(x, y, s * 0.18, x, y, r);
      const ga = gold ? 0.6 + 0.25 * Math.sin(this.time * 6) : 0.34 + glow * 0.45 + (cu ? 0.15 : 0);
      gr.addColorStop(0, col); gr.addColorStop(0.5, col); gr.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalAlpha = A0 * Math.min(1, ga); g.fillStyle = gr; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
      g.globalAlpha = A0;
      if (cu) g.drawImage(this.spr(cu.key, cu.w, cu.h), x - cu.w / 2, y - cu.h / 2, cu.w, cu.h);
      else if (!this.drawC(g, this.flakeKey(type), x, y, s, s, false, spin || 0)) { g.fillStyle = col; g.beginPath(); g.arc(x, y, s / 2.4, 0, TAU); g.fill(); }
      if (gold) {   // twinkle
        const k = (this.time * 1.3) % 1;
        g.globalAlpha = A0 * (1 - k);
        this.drawC(g, 'p_sparkle', x + s * 0.32, y - s * 0.3, 14 + 6 * k, 14 + 6 * k);
      }
      if (bubble) {
        g.globalAlpha = A0 * 0.95;
        const wob = Math.sin(this.time * 3.1 + x * 0.05) * 0.03;   // soft soda-bubble wobble
        this.drawC(g, 'bubble', x, y, BUBBLE * scale, BUBBLE * scale, false, 0, 1 + wob, 1 - wob);
      }
      g.globalAlpha = 1;
    }
    drawItems(g, w, al, top) {
      for (const it of w.items) {
        const hooked = it.state === 'hooked' || it.state === 'caught';
        if (hooked !== top) continue;
        const x = lerp(it.prevX == null ? it.x : it.prevX, it.x, al), y = lerp(it.prevY == null ? it.y : it.prevY, it.y, al);
        const left = (it.vx || 0) < 0;
        if (it.kind === 'flake') {
          const spin = Math.sin(this.time * 0.9 + it.id * 1.7) * 0.35;
          if (it.state === 'caught') { const k = clamp(it.t / 0.75, 0, 1); this.drawFlake(g, it.type, x, y, 1 - clamp((k - 0.6) / 0.4, 0, 1) * 0.45, false, 1, k * TAU); }
          else if (it.state === 'hooked') this.drawFlake(g, it.type, x, y, 1, false, 1, Math.sin(this.time * 6) * 0.25);
          else if (it.state === 'escape') this.drawFlake(g, it.type, x, y, 1, true, clamp((3 - it.t) / 0.8, 0, 1), spin);
          else this.drawFlake(g, it.type, x, y + Math.sin(this.time * 2 + it.id) * 1.5, 1, true, 1, spin);
        } else if (it.kind === 'fish') {
          const wig = Math.sin(this.time * 9 + it.id) * 0.06;
          g.globalAlpha = 0.95;
          this.drawC(g, 'fish_' + (it.type === 'b' ? 'b' : 'a'), x, y, FISH[0], FISH[1], left, wig * (left ? -1 : 1), 1 - Math.abs(wig));
          g.globalAlpha = 1;
        } else if (it.kind === 'gummy') {
          const cu = this.custom('gummy', GUM[0], GUM[1]);
          let a = 1;
          if (it.state === 'puffed' && it.t > 5) a = clamp((7 - it.t) / 2, 0, 1);
          if (it.leaving || it.state === 'leave') a = Math.min(a, 0.85);
          g.globalAlpha = a;
          const pf = it.state === 'puffed' ? (it.puff == null ? 1 : it.puff) : 0;
          if (cu) {
            const s = 1 + pf * 0.45, wob = pf > 0 ? Math.sin(this.time * 10) * 0.05 : 0;
            this.drawC(g, cu.key, x, y, cu.w * s, cu.h * s, left, wob, 1, 1);
          } else if (pf > 0.35) {
            const s = GUM_P * (0.8 + 0.2 * pf) * (1 + Math.sin(this.time * 8) * 0.02);
            this.drawC(g, 'gummy_puffed', x, y, s, s, left, Math.sin(this.time * 2.3 + it.id) * 0.12);
          } else {
            // jelly swim: squash and stretch along the body
            const sw = Math.sin(this.time * 6 + it.id), q = 1 + sw * 0.035;
            this.drawC(g, 'gummy', x, y, GUM[0], GUM[1], left, sw * 0.04, q * (1 + pf * 0.3), (1 / q) * (1 + pf * 0.3));
          }
          g.globalAlpha = 1;
        }
      }
    }

    // ---------------- reel meter ----------------
    /* The reel meter sits beside the (wind-swayed) hook: right of it, or mirrored left when it would leave the
     * screen. Its x eases after the hook so it never jitters; it keeps its side unless it really has to switch. */
    reelPos(w) {
      const L = w.layout, hy = w.hook.y, R = 64, off = 140, hx = w.hook.x;
      const fitsR = hx + off + R + 16 <= this.VW - this.ins.right - 6, fitsL = hx - off - R - 16 >= this.ins.left + 6;
      if (this._reelSide == null || !(this._reelSide > 0 ? fitsR : fitsL)) this._reelSide = fitsR || !fitsL ? 1 : -1;
      const want = hx + this._reelSide * off;
      if (this._reelX == null || !w.reel.active) this._reelX = want;
      else this._reelX += (want - this._reelX) * Math.min(1, (this._reelDt || 0.016) * 6);
      const cx = clamp(this._reelX, R + 22 + this.ins.left, this.VW - this.ins.right - R - 22);
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
      // first level: a pulsing "hold to sink" chip next to the bobber until the player hooks the first snowflake
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
        const fl = w.items.find(it => it.type === 'gold' && it.state === 'swim');
        if (fl) { g.globalAlpha = clamp(this.goldHint, 0, 1); this.text(g, '★ Golden snowflake! ★', clamp(fl.x, 130, this.VW - 130), fl.y - 46, 18, '#ffe14d'); g.globalAlpha = 1; }
      }
    }
    /* HUD: score + lines plate (top-left) and the level pill with snowflake progress (right of the gap at the top in
     * landscape, below the buttons in portrait). The windsock stands on the dock under it (drawWindsock). */
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
      // level name + snowflake progress
      const P = this.pillRect(w), info = ZONE_INFO[(w.zone || 0) % 4], name = info.name + (w.loop ? ' ' + (w.loop + 1) : '');
      if (!P) return;
      const n = w.flakesNeeded || 8, got = Math.min(n, w.flakesInZone || 0), PK = P.K;
      g.fillStyle = 'rgba(16,34,70,.55)'; this.rr(g, P.x, P.y, P.w, P.h, 12); g.fill();
      const dot = (gx, gy, d, i) => {
        if (i < got) this.drawC(g, 'flake_berry', gx, gy, Math.min(15 * PK, d * 0.95), Math.min(15 * PK, d * 0.95));
        else { g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(gx, gy, Math.min(5 * PK, d * 0.32), 0, TAU); g.fill(); g.strokeStyle = 'rgba(16,34,70,.5)'; g.lineWidth = 1.5; g.stroke(); }
      };
      if (P.row) {   // compact: name on the left, the snowflake dots on the right, one line
        g.font = '900 ' + Math.round(14 * PK) + 'px ' + FONT;
        const nw = Math.min(g.measureText(name).width, P.w * 0.46), fs = Math.round(14 * PK * Math.min(1, nw / Math.max(1, g.measureText(name).width)));
        this.text(g, name, P.x + 10, P.y + P.h / 2, fs, '#ffffff', 'left');
        const room = P.w - nw - 30, d = Math.min(17 * PK, room / n), gx0 = P.x + P.w - 12 - (n - 1) * d - d * 0.2;
        for (let i = 0; i < n; i++) dot(gx0 + i * d, P.y + P.h / 2, d, i);
      } else {
        const pw = P.w - 16, cx = P.x + P.w / 2;
        g.font = '900 ' + Math.round(15 * PK) + 'px ' + FONT;
        const fs = Math.round(15 * PK * Math.min(1, pw / Math.max(1, g.measureText(name).width)));
        this.text(g, name, cx, P.y + 4 + 9 * PK, fs, '#ffffff');
        const d = Math.min(18 * PK, pw / n), gx0 = cx - (n - 1) * d / 2;
        for (let i = 0; i < n; i++) dot(gx0 + i * d, P.y + 4 + 30 * PK, d, i);
      }
    }
    /* Level pill: two lines at the top right of the gap in landscape; in portrait (or a narrow sky) a compact one-line
     * pill under the HUD buttons, so the windsock on the dock below it stays clear. */
    pillRect(w) {
      const I = this.ins, L = w.layout, portrait = this.VW < this.VH;
      const K = portrait ? Math.min(this._hudK || 1, 1.1) : (this._hudK || 1);
      const btnL = this._hudBtn ? this._hudBtn.l : this.VW - 110, btnB = this._hudBtn && this._hudBtn.b > 0 ? this._hudBtn.b : I.top + 62 * (this._hudK || 1);
      let left = L.holeX + 60, right = btnL - 10;
      if (!portrait && right - left >= 200) {
        const pw = Math.min(250 * K, right - left - 16);
        return { x: (left + right) / 2 - pw / 2 - 8, y: I.top + 6, w: pw + 16, h: Math.round(50 * K), K, row: false };
      }
      left = L.holeX + 34; right = this.VW - I.right - 8;
      // fit between the buttons and the windsock's knob (a very tall notch inset leaves no room: then sit under the buttons)
      const sockTop = L.surfaceY - 62 * SOCK_K * this.sockScale() - 3, y = btnB + 4;
      const room = sockTop - y, h = Math.round(room >= 20 ? Math.min(28 * K, room) : 28 * K), PK = Math.min(K, h / 28);
      if (right - left < 120) return null;
      return { x: left, y, w: right - left, h, K: PK, row: true };
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
      const loop = b.loop ? '  (round ' + (b.loop + 1) + ')' : '';
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
      for (const it of w.items) { g.strokeStyle = it.kind === 'gummy' ? 'rgba(255,80,80,.9)' : 'rgba(80,255,120,.9)'; g.beginPath(); g.arc(it.x, it.y, it.r || 20, 0, TAU); g.stroke(); }
      const L = w.layout; g.strokeStyle = 'rgba(255,255,255,.4)';
      for (const y of L.bands) { g.beginPath(); g.moveTo(0, y); g.lineTo(this.VW, y); g.stroke(); }
      const st = PR.debug && PR.debug.getState && PR.debug.getState();
      if (st) { g.font = '12px monospace'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(JSON.stringify(st).slice(0, 170), 10, this.VH - 10); }
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  PR.Renderer = Renderer;
})(window.PR = window.PR || {});
