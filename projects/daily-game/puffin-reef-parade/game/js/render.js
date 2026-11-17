/* RP.Renderer — mobile-first top-down renderer for Dottie's Reef Parade. The canvas fills the screen in portrait and
 * landscape (logical VW×VH, see computeView); world coordinates = logical canvas coordinates. The playable arena is the
 * canvas minus safe-area insets, the HUD band and a coral border; the world is told about it with setArena().
 * The static background (tiled sand + rotated reef strips + decor + depth tint) is pre-rendered ONCE per season and size
 * into a device-pixel canvas and blitted pixel-exact. On top: light caustics, shadows on the sand, sea stars, the parade,
 * Dottie swimming, weather particles, juicy effects and the HUD. */
(function (RP) {
  'use strict';
  // underwater palette per season: color = accent, dark = deep water behind everything, sand = fallback floor,
  // wash = depth tint baked into the background (winter darker/bluer), edge = vignette at the arena edges, caus = caustic strength
  const BIOME_INFO = [
    { name: 'Spring Bloom', color: '#ff8fb1', dark: '#1d5670', sand: '#ead3a4', wash: 'rgba(70,150,180,0.07)', edge: 'rgba(14,50,80,0.30)', caus: 0.08, hint: 'Collect the sea stars for the parade!' },
    { name: 'Summer Shallows', color: '#3fd6d0', dark: '#11657c', sand: '#e7f2e6', wash: 'rgba(40,180,210,0.05)', edge: 'rgba(10,70,100,0.24)', caus: 0.085, hint: "Don't bump into your own parade!" },
    { name: 'Autumn Kelp', color: '#ff9f45', dark: '#24524a', sand: '#d8a965', wash: 'rgba(40,100,80,0.10)', edge: 'rgba(16,44,36,0.34)', caus: 0.07, hint: 'Flip over your parade to slip free!' },
    { name: 'Winter Glow', color: '#9cc4ff', dark: '#172b55', sand: '#a7b5c6', wash: 'rgba(24,50,140,0.30)', edge: 'rgba(6,14,56,0.55)', caus: 0.05, hint: 'Catch the golden star: it counts as 5!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const STAR_COLORS = ['#ff7aa8', '#5ec8ff', '#5fe0a8', '#b48cff'];
  const STAR_DARK = ['#b8406c', '#2b7fb8', '#2a9a68', '#7550c0'];
  const GOLD = '#ffd23f';
  const HERO = 64, HERO_CX = 50 / 100 * HERO, HERO_CY = 52 / 100 * HERO, STAR = 30, STAR_G = 36;
  const CRUISE = 12;            // px Dottie swims above the sand (her shadow sits below her)
  const HUD_H = 64, BORDER = 28, TILE = 384;

  /* Tileable caustic light pattern: bright where two Voronoi cells meet (the classic pool-floor network). */
  function makeCaustics(n, seed) {
    const c = document.createElement('canvas'); c.width = c.height = n;
    const g = c.getContext('2d'), img = g.createImageData(n, n), d = img.data;
    let sd = seed || 7; const rnd = () => (sd = (sd * 16807) % 2147483647) / 2147483647;
    const P = []; for (let i = 0; i < 11; i++) P.push([rnd(), rnd()]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const u = x / n, v = y / n; let d1 = 9, d2 = 9;
      for (const [px, py] of P) for (let ox = -1; ox <= 1; ox++) for (let oy = -1; oy <= 1; oy++) {
        const dx = px + ox - u, dy = py + oy - v, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < d1) { d2 = d1; d1 = dd; } else if (dd < d2) d2 = dd;
      }
      const k = Math.pow(clamp(1 - (d2 - d1) * 11, 0, 1), 2.4), i = (y * n + x) * 4;
      d[i] = 255; d[i + 1] = 255; d[i + 2] = 236; d[i + 3] = Math.round(k * 255);
    }
    g.putImageData(img, 0, 0);
    return c;
  }
  function radial(size, stops) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    const g = c.getContext('2d'), gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    for (const [o, col] of stops) gr.addColorStop(o, col);
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    return c;
  }
  /* chunky 5-armed sea star path (fallback when the SVG is not there, also used for the HUD count) */
  function starPath(g, x, y, r, rot) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const a = rot - Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.5 : r;
      const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr;
      if (i) g.lineTo(px, py); else g.moveTo(px, py);
    }
    g.closePath();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.redFlash = 0; this.goldFlash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.pointer = null;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map();
      this._sortBuf = [];
      this._hv = { fx: 1, tilt: 0 };       // Dottie's smoothed facing (scale x, passes through 0 when she turns round) and body tilt
      this._hide = new Map();              // golden-star id → renderer time it started to burrow
      this._bubT = 0; this._sparkT = 0;
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
      const dpr = window.devicePixelRatio || 1, touch = !!(RP.Game && RP.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear();
      const S = v.s, I = v.ins;
      // arena: whole canvas minus safe areas, HUD band and the reef border
      const hudH = S < 0.75 ? 80 : HUD_H;   // phones: the HUD is drawn bigger, so the band is taller
      this._hudK = clamp(0.8 / S, 1, 1.6);   // HUD scale so hearts / counters stay ≥ ~20 CSS px on phones
      const ar = { x0: Math.round(I.left + BORDER), y0: Math.round(I.top + hudH + 12), x1: Math.round(v.VW - I.right - BORDER), y1: Math.round(v.VH - I.bottom - BORDER + 4) };
      // touch Flip button: bottom-right, ≥ 66 CSS px; stars never spawn under it
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
      RP.Assets.setScale(this.px);
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
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.banner = null;
      this.shake = 0; this.flash = 0; this.redFlash = 0; this.goldFlash = 0; this._hide.clear();
      if (world && world.hero) this._hv = { fx: world.hero.facing < 0 ? -1 : 1, tilt: 0 };
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

    // ---------------- static background (pre-rendered per season + size) ----------------
    _bgKey(b) { const A = RP.Assets; return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (A._ver || 0) + '|' + (A.hasCustom(A.bgSlot(b).id) ? 1 : 0); }
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
      const A = RP.Assets, n = A.SEASONS[b], px = this.px, L = this.layout, ar = L.arena, info = BIOME_INFO[b];
      const ground = A.img[n + '_ground'];
      if (!ground && !A.restDone && b !== 0) return null;   // not loaded yet: caller falls back
      c = document.createElement('canvas'); c.width = Math.round(this.VW * px); c.height = Math.round(this.VH * px);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.fillStyle = info.dark; g.fillRect(0, 0, c.width, c.height);
      const custom = A.custom[A.bgSlot(b).id];
      if (custom) {   // player's picture: cover the whole canvas, calmed a little so the stars read
        const k = Math.max(c.width / custom.width, c.height / custom.height);
        g.drawImage(custom, (c.width - custom.width * k) / 2, (c.height - custom.height * k) / 2, custom.width * k, custom.height * k);
        g.fillStyle = 'rgba(255,255,255,.16)'; g.fillRect(0, 0, c.width, c.height);
      } else if (ground) {
        const t = document.createElement('canvas'); t.width = t.height = Math.max(8, Math.round(TILE * px));
        t.getContext('2d').drawImage(ground, 0, 0, t.width, t.height);
        g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, c.width, c.height);
      } else {        // art not there: soft procedural sand with ripples
        g.setTransform(px, 0, 0, px, 0, 0);
        g.fillStyle = info.sand; g.fillRect(ar.x0 - 8, ar.y0 - 8, ar.x1 - ar.x0 + 16, ar.y1 - ar.y0 + 16);
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3;
        for (let y = ar.y0 + 20; y < ar.y1; y += 34) { g.beginPath(); for (let x = ar.x0; x <= ar.x1; x += 16) g.lineTo(x, y + Math.sin(x * 0.03 + y) * 5); g.stroke(); }
        g.setTransform(1, 0, 0, 1, 0, 0);
      }
      // depth tint over the sea floor (baked, so it costs nothing per frame)
      g.fillStyle = info.wash; g.fillRect(0, 0, c.width, c.height);
      // reef border strips: rotated so the strip's bottom lies on the arena edge, facing inward (clockwise)
      const edge = A.img[n + '_edge'];
      if (edge) {
        const es = document.createElement('canvas'); es.width = Math.round(512 * px); es.height = Math.round(72 * px);
        es.getContext('2d').drawImage(edge, 0, 0, es.width, es.height);
        const sides = [
          [ar.x0 - 72, ar.y0, 0, ar.x1 - ar.x0 + 144], [ar.x1, ar.y0 - 72, Math.PI / 2, ar.y1 - ar.y0 + 144],
          [ar.x1 + 72, ar.y1, Math.PI, ar.x1 - ar.x0 + 144], [ar.x0, ar.y1 + 72, -Math.PI / 2, ar.y1 - ar.y0 + 144]
        ];
        // fill beyond the strips (safe areas / margins): extra strips stacked outward
        for (const [ox, oy, a, len] of sides) {
          for (let row = 0; row < 3; row++) {
            g.save(); g.setTransform(px, 0, 0, px, 0, 0); g.translate(ox, oy); g.rotate(a);
            const offset = (row * 173) % 512;
            for (let x = -offset; x < len; x += 512) g.drawImage(es, x, -72 - row * 52, 512, 72);
            g.restore();
          }
        }
      } else {        // no strip art yet: a soft coral-coloured rim
        g.save(); g.setTransform(px, 0, 0, px, 0, 0);
        g.fillStyle = info.dark;
        g.fillRect(0, 0, this.VW, ar.y0); g.fillRect(0, ar.y1, this.VW, this.VH - ar.y1); g.fillRect(0, 0, ar.x0, this.VH); g.fillRect(ar.x1, 0, this.VW - ar.x1, this.VH);
        g.strokeStyle = info.color; g.lineWidth = 10; g.lineJoin = 'round'; g.strokeRect(ar.x0 - 5, ar.y0 - 5, ar.x1 - ar.x0 + 10, ar.y1 - ar.y0 + 10);
        g.restore();
      }
      // decor props on the border (avoid the HUD: hearts top-left, score top-centre, buttons top-right; and the touch button)
      const spots = this._decorSpots();
      g.setTransform(px, 0, 0, px, 0, 0);
      for (const [x, y, k, s, flip] of spots) {
        const im = A.img[n + '_decor_' + k]; if (!im) continue;
        g.save(); g.translate(x, y); if (flip) g.scale(-1, 1);
        g.drawImage(im, -s / 2, -s * 112 / 128, s, s); g.restore();
      }
      // depth vignette: the water gets deeper (darker) toward the reef, and a soft inner shadow under the coral
      const cx = (ar.x0 + ar.x1) / 2, cy = (ar.y0 + ar.y1) / 2, R = Math.hypot(this.VW, this.VH) / 2;
      const vg = g.createRadialGradient(cx, cy, Math.min(ar.x1 - ar.x0, ar.y1 - ar.y0) * 0.35, cx, cy, R);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, info.edge);
      g.fillStyle = vg; g.fillRect(0, 0, this.VW, this.VH);
      g.strokeStyle = 'rgba(10,30,50,0.12)'; g.lineWidth = 6; g.strokeRect(ar.x0 + 3, ar.y0 + 3, ar.x1 - ar.x0 - 6, ar.y1 - ar.y0 - 6);
      g.setTransform(1, 0, 0, 1, 0, 0);
      this._bg.set(key, c);
      if (this._bg.size > 6) this._bg.delete(this._bg.keys().next().value);
      return c;
    }
    _decorSpots() {
      const L = this.layout, ar = L.arena, touch = !!(RP.Game && RP.Game.isTouch), out = [];
      const W = ar.x1 - ar.x0, H = ar.y1 - ar.y0, s = 84;
      const nSide = Math.max(1, Math.round(H / 260));
      for (let i = 0; i < nSide; i++) {
        const y = ar.y0 + H * (i + 0.6) / (nSide + 0.2);
        out.push([Math.max(ar.x0 - 30, 24), y, i % 2 === 0 ? 3 : 0, s, false]);   // on the reef strip, never off-screen
        out.push([Math.min(ar.x1 + 30, this.VW - 24), y + 40, i % 2 === 0 ? 1 : 2, s * 0.9, true]);
      }
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
    burst(sprite, x, y, n) { if (this.weather && this.weather.burst) { try { this.weather.burst(sprite, x, y, n); } catch (e) { /* older weather */ } } }
    goldFx(x, y, points) {
      this._goldFxAt = this.time;
      this.goldFlash = 1; this.shake = Math.max(this.shake, 0.12);
      this.sparks(x, y - 10, 20, GOLD); this.ring(x, y - 8, GOLD, 0.55, true); this.ring(x, y - 8, '#fff6c2', 0.35, false);
      this.texts.push({ text: '+5!', x, y: y - 62, life: 0, max: 1.4, size: 58, color: '#ffd84a', stroke: 'rgba(120,70,0,.9)', pop: true });
      if (points) this.texts.push({ text: '+' + points, x, y: y - 22, life: 0, max: 1.1, size: 22, color: '#fff3b0' });
      this.burst('sparkle', x, y, 8);
      for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; this.fx.push({ k: 'sprite', spr: 'p_sparkle', x: x + Math.cos(a) * 14, y: y - 8 + Math.sin(a) * 14, vx: Math.cos(a) * 120, vy: Math.sin(a) * 120, g: 0, life: 0, max: 0.7, size: 18, rot: 0, vr: 5 }); }
    }
    onEvents(evts) {
      const w = this.world, L = this.layout;
      for (const e of evts) {
        switch (e.type) {
          case 'note': {
            if (e.gold) { if (this.time - (this._goldFxAt == null ? -9 : this._goldFxAt) > 0.05) this.goldFx(e.x, e.y, e.points); break; }
            const col = STAR_COLORS[e.kind || 0];
            this.sparks(e.x, e.y - 10, 8, col);
            this.ring(e.x, e.y - 6, col, 0.4, false);
            this.texts.push({ text: '+' + e.points, x: e.x, y: e.y - 40, life: 0, max: 0.9, size: 20, color: '#ffffff' });
            this.bubbles(e.x, e.y, 2);
            break;
          }
          case 'gold': if (this.time - (this._goldFxAt == null ? -9 : this._goldFxAt) > 0.05) this.goldFx(e.x, e.y, e.points); else this.goldFlash = 1; break;
          case 'goldspawn': {
            const hx = w && w.hero ? w.hero.x : this.VW / 2, ar = L.arena, W = ar.x1 - ar.x0;
            const tx = hx < (ar.x0 + ar.x1) / 2 ? ar.x0 + W * 0.74 : ar.x0 + W * 0.26;   // away from Dottie, just under the HUD
            this.texts.push({ text: 'Golden star!', x: tx, y: ar.y0 + 30, life: 0, max: 1.8, size: 24, color: '#ffe066', stroke: 'rgba(110,60,0,.9)', still: true });
            this.ring(e.x, e.y, GOLD, 0.6, true);
            this.puffs(e.x, e.y + 4, 6, 'rgba(240,215,160,.85)');
            this.burst('sand', e.x, e.y, 4); this.burst('sparkle', e.x, e.y, 4);
            break;
          }
          case 'goldhide': this.puffs(e.x, e.y + 4, 8, 'rgba(235,210,160,.85)'); this.burst('sand', e.x, e.y, 5); break;
          case 'regrab': this.bubbles(e.x, e.y, 2); break;
          case 'bonk':
            this.shake = 0.3; this.redFlash = 0.45;
            this.texts.push({ text: 'Boing!', x: e.x, y: e.y - 60, life: 0, max: 1, size: 30, color: '#ffd1e6' });
            this.stars(e.x, e.y - 40);
            this.bubbles(e.x, e.y - 10, 9); this.burst('bubble', e.x, e.y, 6);
            break;
          case 'bounce': this.puffs(e.x, e.y, 5, 'rgba(235,215,170,.75)'); this.bubbles(e.x, e.y, 3); break;
          case 'flip': this.bubbles(e.x, e.y - 8, 7); this.burst('bubble', e.x, e.y, 5); break;
          case 'land': this.puffs(e.x, e.y + 6, 4, 'rgba(235,215,170,.7)'); this.bubbles(e.x, e.y, 2); break;
          case 'flipready': this._flipPop = 1; break;
          case 'loosegone': this.bubbles(e.x, e.y, 3); break;
          case 'songdone': this.texts.push({ text: 'Parade complete!', x: this.VW / 2, y: this.VH * 0.4, life: 0, max: 2.2, size: 44, color: '#ffe14d', big: true }); break;
          case 'cleared': {
            if (e.bonus) this.texts.push({ text: 'Heart bonus +' + e.bonus, x: this.VW / 2, y: this.VH * 0.4 + 52, life: 0, max: 2.2, size: 24, color: '#ffffff', big: true });
            const sp = w && w.hero, cx = sp ? sp.x : this.VW / 2, cy = sp ? sp.y : this.VH / 2;
            for (let i = 0; i < 22; i++) {
              const a = Math.random() * TAU, v = 140 + Math.random() * 220;
              this.fx.push({ k: 'star', kind: i % 4, x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 160, g: 220, drag: 1.2, life: -i * 0.02, max: 1.6, size: 22 + Math.random() * 10, rot: 0, vr: (Math.random() - 0.5) * 6 });
            }
            this.bubbles(cx, cy, 10);
            break;
          }
          case 'go': this.texts.push({ text: 'Swim!', x: this.VW / 2, y: this.VH * 0.3 + 92, life: 0, max: 0.8, size: 46, color: '#ffffff', big: true }); break;
          case 'biome': case 'season': { const z = e.biome != null ? e.biome : e.season; this.showBanner(z); this.setSeason(z); break; }
          case 'dead': this.flash = 0.4; this.shake = 0.3; this.texts.push({ text: 'Out of hearts!', x: this.VW / 2, y: this.VH * 0.45, life: 0, max: 2.5, size: 40, color: '#ffd1e6', big: true }); break;
        }
      }
    }
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 70 + Math.random() * 150; this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, drag: 3, life: 0, max: 0.35 + Math.random() * 0.25, size: 2 + Math.random() * 2.5, color }); }
    }
    puffs(x, y, n, color) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'puff', x: x + (Math.random() - .5) * 18, y: y + (Math.random() - .5) * 8, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * 20, g: 0, drag: 2, life: 0, max: 0.5 + Math.random() * 0.25, size: 6 + Math.random() * 6, color });
    }
    /* small bubbles that wobble up toward the surface (= up the screen), grow a little and pop */
    bubbles(x, y, n) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'bubble', x: x + (Math.random() - .5) * 14, y: y + (Math.random() - .5) * 10, vx: (Math.random() - .5) * 30, vy: -30 - Math.random() * 40, g: -20, drag: 1.5, life: 0, max: 0.8 + Math.random() * 0.6, size: 4 + Math.random() * 5, ph: Math.random() * TAU });
    }
    stars(x, y) { for (let i = 0; i < 5; i++) { const a = i / 5 * TAU; this.fx.push({ k: 'sprite', spr: 'p_sparkle', x: x + Math.cos(a) * 18, y: y + Math.sin(a) * 8, vx: Math.cos(a) * 40, vy: Math.sin(a) * 20 - 20, g: 0, life: 0, max: 0.8, size: 16, rot: 0, vr: 4 }); } }
    ring(x, y, color, max, big) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 8, r1: big ? 62 : 34, color }); }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 0.7);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.8) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.redFlash = Math.max(0, this.redFlash - dt * 2);
      this.goldFlash = Math.max(0, this.goldFlash - dt * 3);
      this._flipPop = Math.max(0, (this._flipPop || 0) - dt * 2);
      const w = this.world, s = w && w.hero;
      if (s) {
        // Dottie's body: smooth facing (passes through 0 = a quick turn-round squash) and a tilt toward her heading (±0.5 rad)
        const hv = this._hv, f = s.facing < 0 ? -1 : 1, h = s.heading || 0;
        hv.fx += (f - hv.fx) * Math.min(1, dt * 10);
        const tt = clamp(Math.atan2(Math.sin(h), Math.cos(h) * f), -0.5, 0.5);
        hv.tilt += (tt - hv.tilt) * Math.min(1, dt * 8);
        // bubble trail from the beak: a few now and then, more on hard turns
        const swimming = w.state === 'playing' || w.state === 'ready' || w.state === 'cleared';
        this._bubT -= dt * (1 + Math.abs(s.lean || 0) * 3);
        if (swimming && this._bubT <= 0 && this.fx.length < 300) {
          this._bubT = 0.42 + Math.random() * 0.3;
          this.fx.push({ k: 'bubble', x: s.x + f * 20, y: s.y - CRUISE - (s.z || 0) - 6, vx: f * 10 + (Math.random() - .5) * 12, vy: -28 - Math.random() * 18, g: -14, drag: 1.2, life: 0, max: 0.9 + Math.random() * 0.5, size: 3 + Math.random() * 3.5, ph: Math.random() * TAU });
        }
        // golden star sparkles + burrow tracking
        this._sparkT -= dt;
        for (const n of w.notes) {
          if (!n.gold) continue;
          if (n.state === 'hide' && !this._hide.has(n.id)) { this._hide.set(n.id, this.time); this.puffs(n.x, n.y + 4, 5, 'rgba(235,210,160,.85)'); }
          if (this._sparkT <= 0 && n.state !== 'hide') {
            const a = Math.random() * TAU, r = 14 + Math.random() * 12;
            this.fx.push({ k: 'sprite', spr: 'p_sparkle', x: n.x + Math.cos(a) * r, y: n.y - 4 + Math.sin(a) * r * 0.8, vx: 0, vy: -18, g: 0, life: 0, max: 0.6, size: 10 + Math.random() * 6, rot: 0, vr: 3 });
          }
        }
        if (this._sparkT <= 0) this._sparkT = 0.16;
        if (this._hide.size > 8) this._hide.clear();
      }
      for (const fx of this.fx) {
        fx.life += dt; if (fx.life < 0) continue;
        if (fx.drag) { const k = Math.exp(-fx.drag * dt); fx.vx *= k; fx.vy *= k; }   // water slows everything down
        fx.vy += (fx.g || 0) * dt; fx.x += (fx.vx || 0) * dt; fx.y += (fx.vy || 0) * dt;
        if (fx.vr) fx.rot += fx.vr * dt;
      }
      this.fx = this.fx.filter(f => f.life < f.max);
      if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
      for (const t of this.texts) { t.life += dt; if (!t.big && !t.still) t.y -= 34 * dt; }
      this.texts = this.texts.filter(t => t.life < t.max);
    }

    // ---------------- drawing ----------------
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px;
      if (!w) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = BIOME_INFO[0].dark; g.fillRect(0, 0, this.canvas.width, this.canvas.height); return; }
      const al = w._acc != null && w.cfg ? clamp(w._acc / w.cfg.step, 0, 1) : 1;
      this._al = al;
      // background (pixel-exact blit, crossfade between seasons)
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
      let shx = 0, shy = 0;
      if (this.shake > 0) { const m = this.shake * 14; shx = Math.round((Math.random() - 0.5) * m * px); shy = Math.round((Math.random() - 0.5) * m * px); }
      const cur = this.background(this.vis.cur) || this.background(0);
      if (cur) g.drawImage(cur, shx, shy); else { g.fillStyle = BIOME_INFO[this.vis.cur].dark; g.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      if (this.vis.t < 1 && this.vis.prev !== this.vis.cur) {
        const prev = this.background(this.vis.prev);
        if (prev) { g.globalAlpha = 1 - this.vis.t; g.drawImage(prev, shx, shy); g.globalAlpha = 1; }
      }
      g.setTransform(px, 0, 0, px, shx, shy);
      this.drawCaustics(g);
      this.drawParticles(g, 'back');
      this.drawWorld(g, al);
      this.drawParticles(g, 'front');
      this.drawFx(g);
      const amb = this.weather && this.weather.ambient;
      if (amb && amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, this.VW, this.VH); }
      g.setTransform(px, 0, 0, px, 0, 0);
      if (this.redFlash > 0) { g.fillStyle = 'rgba(255,120,150,' + (this.redFlash * 0.22) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (this.goldFlash > 0) { g.globalCompositeOperation = 'lighter'; g.fillStyle = 'rgba(255,205,70,' + (this.goldFlash * 0.22) + ')'; g.fillRect(0, 0, this.VW, this.VH); g.globalCompositeOperation = 'source-over'; }
      if (this.flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.5) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (mode !== 'title') { this.drawHud(g, w); this.drawBanner(g); }
      this.drawTexts(g);
      if (this.debug) this.drawDebug(g, w);
      this.syncActionButton(w, mode);
    }

    /* Light caustics: one (or two, at full quality) scrolled copies of a pre-rendered tileable pattern, added with
     * 'lighter' at low alpha over the arena only. The pattern tile is small (128 px) and scaled up: soft and cheap. */
    drawCaustics(g) {
      const ar = this.layout.arena, info = BIOME_INFO[this.vis.cur], t = this.time;
      if (!this._caus) {
        try { this._caus = makeCaustics(128, 11); this._causPat = g.createPattern(this._caus, 'repeat'); }
        catch (e) { this._caus = 'none'; }
      }
      const pat = this._causPat; if (!pat || !pat.setTransform || typeof DOMMatrix === 'undefined') return;
      const layers = this.maxPx && RP.Game && RP.Game._adaptHold != null ? 1 : 2;   // adaptive quality dropped the resolution → one layer
      g.save(); g.globalCompositeOperation = 'lighter';
      g.beginPath(); g.rect(ar.x0 - 6, ar.y0 - 6, ar.x1 - ar.x0 + 12, ar.y1 - ar.y0 + 12); g.clip();
      for (let i = 0; i < layers; i++) {
        const k = i ? 2.3 : 1.75, ox = i ? -t * 7 + Math.sin(t * 0.31) * 30 : t * 9 + Math.sin(t * 0.23) * 24, oy = i ? t * 6 : t * 4 + Math.cos(t * 0.27) * 20;
        pat.setTransform(new DOMMatrix([k, 0, 0, k, ox, oy]));
        g.globalAlpha = info.caus * (i ? 0.75 : 1) * (0.85 + 0.15 * Math.sin(t * 0.9 + i * 2));
        g.fillStyle = pat; g.fillRect(ar.x0 - 6, ar.y0 - 6, ar.x1 - ar.x0 + 12, ar.y1 - ar.y0 + 12);
      }
      g.restore();
    }

    spr(key, w, h) { return RP.Assets.sprite(key, w, h); }
    drawSprite(g, key, x, y, w, h) { const c = this.spr(key, w, h); if (c) g.drawImage(c, x, y, w, h); return !!c; }

    drawParticles(g, layer) {
      const P = this.weather && this.weather.particles; if (!P) return;
      const AS = RP.Assets.PARTICLE_ASPECT || {};
      for (const p of P) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.sprite === 'dot') { g.fillStyle = p.color || '#fff'; g.beginPath(); g.arc(p.x, p.y, p.size / 2, 0, TAU); g.fill(); continue; }
        // tall sprites (the summer light shafts): p.w/p.h when given, otherwise size = drawn WIDTH (Weather contract), height = width × aspect
        let pw = p.size, ph = p.size;
        if (p.w && p.h) { pw = p.w; ph = p.h; } else if (AS[p.sprite]) { pw = p.size; ph = p.size * AS[p.sprite]; }
        if (p.sx || p.sy) { pw *= p.sx || 1; ph *= p.sy || 1; }
        const c = this.spr('p_' + p.sprite, pw, ph);
        if (!c) {
          if (p.sprite === 'bubble') { g.strokeStyle = 'rgba(230,250,255,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(p.x, p.y, p.size / 2.4, 0, TAU); g.stroke(); }
          continue;
        }
        if (p.sprite === 'ray' || p.additive) g.globalCompositeOperation = 'lighter';
        if (!p.rot && (p.flipX || 1) === 1) g.drawImage(c, p.x - pw / 2, p.y - ph / 2, pw, ph);
        else { g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); g.scale(p.flipX || 1, 1); g.drawImage(c, -pw / 2, -ph / 2, pw, ph); g.restore(); }
        g.globalCompositeOperation = 'source-over';
      }
      g.globalAlpha = 1;
    }

    shadow(g, x, y, rx, ry, a) { g.fillStyle = 'rgba(16,40,62,' + a + ')'; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill(); }
    glow() { return this._glow || (this._glow = radial(128, [[0, 'rgba(255,236,140,0.95)'], [0.35, 'rgba(255,214,70,0.55)'], [0.7, 'rgba(255,190,40,0.16)'], [1, 'rgba(255,190,40,0)']])); }
    softDisc() { return this._disc || (this._disc = radial(64, [[0, 'rgba(255,255,255,0.55)'], [0.6, 'rgba(255,255,255,0.18)'], [1, 'rgba(255,255,255,0)']])); }

    /* one sea star; x, y = its centre. scale 1 = default size, rot in rad. */
    drawStar(g, x, y, kind, gold, scale, alpha, rot) {
      const A = RP.Assets;
      if (alpha != null) g.globalAlpha = alpha;
      if (A.hasCustom('note')) {
        const [fw, fh] = A.fit('note', 28, 28), col = gold ? GOLD : STAR_COLORS[kind || 0], r = 17 * scale;
        g.beginPath(); g.arc(x, y, r + 2, 0, TAU); g.fillStyle = '#ffffff'; g.fill();
        g.fillStyle = col; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        g.lineWidth = 3; g.strokeStyle = 'rgba(30,40,60,.7)'; g.stroke();
        const c = this.spr('custom:note', fw, fh);
        if (c) { g.save(); g.translate(x, y); if (rot) g.rotate(rot * 0.5); g.drawImage(c, -fw * scale / 2, -fh * scale / 2, fw * scale, fh * scale); g.restore(); }
      } else {
        const s = gold ? STAR_G : STAR, d = s * scale, c = this.spr(gold ? 'star_gold' : 'star_' + (kind || 0), s, s);
        if (c) {
          if (rot) { g.save(); g.translate(x, y); g.rotate(rot); g.drawImage(c, -d / 2, -d / 2, d, d); g.restore(); }
          else g.drawImage(c, x - d / 2, y - d / 2, d, d);
        } else {   // procedural fallback
          starPath(g, x, y, d * 0.48, rot || 0);
          g.fillStyle = gold ? GOLD : STAR_COLORS[kind || 0]; g.fill();
          g.lineJoin = 'round'; g.lineWidth = 2.5; g.strokeStyle = gold ? '#b07a00' : STAR_DARK[kind || 0]; g.stroke();
          g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(x - d * 0.08, y - d * 0.1, d * 0.07, 0, TAU); g.fill();
        }
      }
      g.globalAlpha = 1;
    }

    drawWorld(g, al) {
      const w = this.world, s = w.hero, t = this.time, C = w.cfg || {};
      const ip = o => lerp(o._px != null ? o._px : o.x, o.x, al);
      const iq = o => lerp(o._py != null ? o._py : o.y, o.y, al);
      // stars on the sand (spawn / idle / loose / golden flee / hide)
      for (const n of w.notes) {
        const x = ip(n), y = iq(n), id = n.id || 0;
        let sc = 1, a = 1, z = n.z || 0, rot = Math.sin(t * 1.3 + id) * 0.22, dy = 0;
        if (n.state === 'spawn') sc = easeOutBack(clamp((n.t || 0) / (n.gold ? (C.goldSpawnTime || 0.4) : 0.3), 0, 1));
        if (n.state === 'idle') { sc *= 1 + Math.sin(t * 2.4 + id) * 0.04; g.globalAlpha = 0.8; g.drawImage(this.softDisc(), x - 22, y - 22, 44, 44); g.globalAlpha = 1; }
        if (n.state === 'loose') { rot = t * 1.6 + id; if (n.life < 1.2) a = (Math.floor(n.life * 8) % 2) ? 0.35 : 1; }
        if (n.gold) {
          rot = Math.sin(t * 7 + id) * 0.28;
          if (n.state === 'flee' && n.life != null && n.life < (C.goldBlink || 2)) a = (Math.floor(n.life * 8) % 2) ? 0.4 : 1;
          if (n.state === 'hide') {   // burrow: sink and shrink into a sand puff
            const k = C.goldHideTime && n.t != null ? clamp(n.t / C.goldHideTime, 0, 1) : clamp((t - (this._hide.get(id) != null ? this._hide.get(id) : t)) / 0.5, 0, 1);
            sc *= 1 - k * 0.85; dy = k * 7; a *= 1 - k * 0.6; rot += k * 3;
          }
          // glow ring
          const gr = 34 * sc * (1 + Math.sin(t * 5) * 0.08);
          g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.75 * a;
          g.drawImage(this.glow(), x - gr, y - gr, gr * 2, gr * 2);
          g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
          g.strokeStyle = 'rgba(255,224,90,' + ((0.5 + 0.4 * Math.sin(t * 6)) * a) + ')'; g.lineWidth = 3;
          g.beginPath(); g.arc(x, y - 2, (22 + Math.sin(t * 6) * 3) * sc, 0, TAU); g.stroke();
        }
        this.shadow(g, x + 3, y + 5, 11 * sc, 4.5 * sc, 0.18 * a);
        this.drawStar(g, x, y - 2 - z + dy, n.kind, n.gold, sc, a, rot);
      }
      // parade + Dottie, y-sorted (Dottie on top while she is up in a flip)
      const list = this._sortBuf; list.length = 0;
      for (let i = 0; i < w.trail.length; i++) list.push(i);
      list.push(-1);
      const sy = iq(s) + 6 + ((s.z || 0) > 3 ? 1e4 : 0);
      const ty = i => i < 0 ? sy : iq(w.trail[i]);
      list.sort((a, b) => ty(a) - ty(b));
      for (const tr of w.trail) this.shadow(g, ip(tr) + 3, iq(tr) + 6, 10, 4, 0.16);
      const neck = (w.cfg && w.cfg.safeNeck) || 4;
      for (const i of list) {
        if (i < 0) { this.drawHero(g, ip(s), iq(s), s); continue; }
        const tr = w.trail[i], x = ip(tr), y = iq(tr);
        const sc = tr.join != null ? 0.5 + 0.5 * easeOutBack(clamp(tr.join, 0, 1)) : 1;
        const pop = tr.pop ? 1 + tr.pop * 0.3 : 1, wave = 1 + Math.sin(t * 6 - i * 0.6) * 0.05;   // a happy wave runs down the parade
        if (tr.gold) { const gr = 26; g.globalCompositeOperation = 'lighter'; g.globalAlpha = 0.45; g.drawImage(this.glow(), x - gr, y - 2 - gr, gr * 2, gr * 2); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; }
        this.drawStar(g, x, y - 3 - (tr.z || 0), tr.kind, tr.gold, sc * pop * wave, s.invuln > 0 && i >= neck ? 0.75 : 1, Math.sin(t * 5 + i * 0.7) * 0.2);
      }
    }

    /* Dottie swimming: soft shadow on the sand, body tilted toward her heading (never upside down: the sprite is
     * mirrored for left), a gentle bob and wing-stroke squash-stretch (faster on turns), a full somersault in a flip. */
    drawHero(g, x, y, s) {
      const A = RP.Assets, t = this.time, cfg = (this.world && this.world.cfg) || {}, z = s.z || 0, hv = this._hv;
      const H = cfg.jumpHeight || 28, jt = s.jump > 0 && cfg.jumpTime ? clamp(s.jump / cfg.jumpTime, 0, 1) : 0;
      const zk = clamp(z / (H * 1.3), 0, 1);
      // shadow: light from above-left, so it sits a bit down-right; smaller and fainter the higher she is
      this.shadow(g, x + 5 + z * 0.35, y + 9 + z * 0.3, 24 * (1 - 0.45 * zk), 9 * (1 - 0.45 * zk), 0.26 * (1 - 0.6 * zk));
      const inv = s.invuln > 0 && Math.floor(t * 12) % 2 === 0;
      if (inv) g.globalAlpha = 0.55;
      const turnK = clamp(Math.abs(s.lean || 0), 0, 1);
      const stroke = jt ? 0 : Math.sin(t * (7 + 6 * turnK));
      const amp = 0.03 + 0.06 * turnK;
      const bob = jt ? 0 : Math.sin(t * 3.4) * 2;
      const k = 1 + z / 110;                                   // closer to the camera = a little bigger
      const jumpStretch = jt ? Math.sin(jt * Math.PI) * 0.08 : 0;
      const fxs = Math.abs(hv.fx) < 0.12 ? (hv.fx < 0 ? -0.12 : 0.12) : hv.fx;
      g.save();
      g.translate(x, y - CRUISE - z + bob);
      g.scale(fxs * k, k);
      g.rotate(hv.tilt - jt * TAU + (s.dizzy > 0 ? Math.sin(t * 20) * 0.12 : 0));
      g.scale(1 + amp * stroke + jumpStretch, 1 - amp * stroke - jumpStretch * 0.5);
      if (A.hasCustom('hero')) {
        const [fw, fh] = A.fit('hero', 58, 58), c = this.spr('custom:hero', fw, fh);
        const sq = s.frame === 'ouch' ? 0.9 : s.frame === 'happy' ? 1.06 : 1;
        if (c) g.drawImage(c, -fw / 2, -fh * sq / 2, fw, fh * sq);
      } else {
        const c = this.spr('puffin_' + (s.frame || 'idle'), HERO, HERO) || this.spr('puffin_idle', HERO, HERO);
        if (c) g.drawImage(c, -HERO_CX, -HERO_CY, HERO, HERO);
        else this.drawPuffinFallback(g, s.frame);
      }
      g.restore();
      g.globalAlpha = 1;
      if (s.dizzy > 0) {   // dizzy sparkles circling her head
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * TAU / 3, px = x + Math.cos(a) * 20, py = y - CRUISE - z - 34 + Math.sin(a) * 6;
          const c = this.spr('p_sparkle', 14, 14);
          if (c) g.drawImage(c, px - 7, py - 7, 14, 14); else { g.fillStyle = '#fff6b0'; starPath(g, px, py, 6, a); g.fill(); }
        }
      }
    }
    /* simple puffin drawn with paths (only while the SVGs are missing), facing right, centred on the body */
    drawPuffinFallback(g, frame) {
      g.lineJoin = 'round'; g.lineWidth = 3;
      g.fillStyle = '#f08a3c'; g.beginPath(); g.ellipse(-22, 8, 9, 5, 0.4, 0, TAU); g.fill();          // feet
      g.fillStyle = '#1f2a44'; g.strokeStyle = '#121a2e'; g.beginPath(); g.ellipse(0, 0, 26, 19, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(4, 6, 17, 11, 0, 0, TAU); g.fill();             // tummy
      g.beginPath(); g.arc(12, -5, 11, 0, TAU); g.fill();                                               // face
      g.fillStyle = '#ff7a3d'; g.strokeStyle = '#b8481c'; g.beginPath(); g.moveTo(20, -9); g.quadraticCurveTo(36, -4, 21, 2); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#26314d'; g.beginPath(); g.arc(13, -7, frame === 'happy' ? 2 : 3, 0, TAU); g.fill();
      g.fillStyle = '#2b3858'; g.beginPath(); g.ellipse(-4, -2, 12, 6, frame === 'jump' ? -0.9 : -0.3, 0, TAU); g.fill();   // wing
    }

    drawFx(g) {
      for (const f of this.fx) {
        if (f.life < 0) continue;
        const k = f.life / f.max, a = 1 - k;
        if (f.k === 'spark') { g.globalAlpha = a; g.fillStyle = f.color; g.beginPath(); g.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, TAU); g.fill(); }
        else if (f.k === 'puff') { g.globalAlpha = a * 0.8; g.fillStyle = f.color; g.beginPath(); g.arc(f.x, f.y, f.size * (0.6 + k), 0, TAU); g.fill(); }
        else if (f.k === 'bubble') {
          const r = f.size * (0.8 + k * 0.5), bx = f.x + Math.sin(f.life * 9 + f.ph) * 2.5;
          g.globalAlpha = k > 0.85 ? (1 - k) / 0.15 : 0.9;
          const c = this.spr('p_bubble', 16, 16);
          if (c) g.drawImage(c, bx - r, f.y - r, r * 2, r * 2);
          else { g.strokeStyle = 'rgba(235,250,255,.95)'; g.lineWidth = 1.4; g.beginPath(); g.arc(bx, f.y, r, 0, TAU); g.stroke(); g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(bx - r * 0.35, f.y - r * 0.35, r * 0.25, 0, TAU); g.fill(); }
        }
        else if (f.k === 'circle') { g.globalAlpha = a; g.strokeStyle = f.color; g.lineWidth = 3 * a + 1; g.beginPath(); g.arc(f.x, f.y, lerp(f.r0, f.r1, Math.sqrt(k)), 0, TAU); g.stroke(); }
        else if (f.k === 'sprite') {
          const c = this.spr(f.spr, f.size, f.size); g.globalAlpha = a;
          if (c) { g.save(); g.translate(f.x, f.y); g.rotate(f.rot || 0); g.drawImage(c, -f.size / 2, -f.size / 2, f.size, f.size); g.restore(); }
          else { g.fillStyle = '#fff4b0'; starPath(g, f.x, f.y, f.size * 0.4, f.rot || 0); g.fill(); }
        }
        else if (f.k === 'star') { this.drawStar(g, f.x, f.y, f.kind, false, f.size / STAR, a, f.rot); }
      }
      g.globalAlpha = 1;
    }
    text(g, s, x, y, size, color, align, stroke) {
      g.font = '900 ' + size + 'px ' + FONT; g.textAlign = align || 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(3, size * 0.16); g.strokeStyle = stroke || 'rgba(20,35,60,.85)';
      g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y);
    }
    drawTexts(g) {
      for (const t of this.texts) {
        const k = t.life / t.max, a = k > 0.75 ? (1 - k) / 0.25 : 1;
        const sc = (t.big || t.pop) ? (t.life < 0.25 ? easeOutBack(t.life / 0.25) : 1) : 1;
        g.globalAlpha = clamp(a, 0, 1);
        this.text(g, t.text, clamp(t.x, 90, this.VW - 90), Math.max(t.y, this.layout.arena.y0 + t.size * 0.6), Math.max(1, Math.round(t.size * sc)), t.color, 'center', t.stroke);
      }
      g.globalAlpha = 1;
    }
    drawHud(g, w) {
      const I = this.ins, K = this._hudK || 1, x0 = I.left + 14, y0 = I.top + 12, touch = !!(RP.Game && RP.Game.isTouch);
      // hearts on a soft plate (readable on every sand colour)
      const hs = Math.round(26 * K), bw = Math.round(130 * K), bh = Math.round(13 * K);
      const plateW = Math.max(w.heartsMax * (hs + 3), 30 * K + bw + 48 * K) + 14, plateH = hs + bh + 30 * K;
      g.fillStyle = 'rgba(10,30,55,.34)'; this.rr(g, x0 - 7, y0 - 6, plateW, plateH, 12); g.fill();
      for (let i = 0; i < w.heartsMax; i++) {
        const full = i < w.hearts;
        if (!this.drawSprite(g, full ? 'heart_full' : 'heart_empty', x0 + i * (hs + 3), y0, hs, hs)) {
          g.fillStyle = full ? '#ff6b8f' : 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x0 + i * (hs + 3) + hs / 2, y0 + hs / 2, hs * 0.4, 0, TAU); g.fill();
        }
      }
      // song (parade) progress bar under the hearts
      const by = y0 + hs + 8 * K, ic = Math.round(26 * K), bx = x0 + ic;
      if (!this.drawSprite(g, 'songbar', x0 - 3, by - 6 * K, ic, ic)) { g.fillStyle = '#ffd23f'; starPath(g, x0 - 3 + ic / 2, by - 6 * K + ic / 2, ic * 0.4, 0); g.fill(); }
      g.fillStyle = 'rgba(15,30,55,.5)'; this.rr(g, bx, by, bw, bh, bh / 2); g.fill();
      const f = w.songTarget ? clamp(w.song / w.songTarget, 0, 1) : 0;
      if (f > 0) { const grd = g.createLinearGradient(bx, 0, bx + bw, 0); grd.addColorStop(0, STAR_COLORS[0]); grd.addColorStop(0.35, STAR_COLORS[1]); grd.addColorStop(0.7, STAR_COLORS[2]); grd.addColorStop(1, STAR_COLORS[3]); g.fillStyle = grd; this.rr(g, bx, by, Math.max(bh, bw * f), bh, bh / 2); g.fill(); }
      this.text(g, w.song + '/' + w.songTarget, bx + bw + 6, by + bh / 2, Math.round(16 * K), '#ffffff', 'left');
      // score: centred between the hearts plate and the HUD buttons
      const right = this._hudBtn ? this._hudBtn.l : this.VW - 120, leftEdge = x0 + plateW;
      const cx = (right - leftEdge) > 260 ? clamp(this.VW / 2, leftEdge + 70, right - 70) : (leftEdge + right) / 2;
      const ss = Math.round(Math.min(36, 26 * K * 1.15));
      this.text(g, String(w.score), cx, y0 + ss * 0.55, ss, '#ffffff');
      // Flip charge (desktop: small meter under the score; touch: the button shows it)
      if (!touch) {
        const s = w.hero, fc = clamp(s.flip, 0, 1), mx = cx - 46, my = y0 + 44;
        this.drawSprite(g, 'flip', mx - 4, my - 9, 26, 26);
        g.fillStyle = 'rgba(15,30,55,.45)'; this.rr(g, mx + 26, my, 66, 9, 4.5); g.fill();
        g.fillStyle = fc >= 1 ? '#ffd34d' : '#7fd8ff'; this.rr(g, mx + 26, my, Math.max(9, 66 * fc), 9, 4.5); g.fill();
        if (this._flipPop > 0) { g.globalAlpha = this._flipPop; g.strokeStyle = '#fff'; g.lineWidth = 2; this.rr(g, mx + 24, my - 2, 70, 13, 6); g.stroke(); g.globalAlpha = 1; }
      }
    }
    rr(g, x, y, w, h, r) { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    drawBanner(g) {
      const b = this.banner; if (!b) return;
      const info = BIOME_INFO[b.s % 4], k = b.t, a = k < 0.25 ? k / 0.25 : k > 1.4 ? (1.8 - k) / 0.4 : 1;
      const lap = this.world && this.world.lap ? '  (lap ' + (this.world.lap + 1) + ')' : '';
      const cy = this.VH * 0.3, w = Math.min(this.VW - 40, 520);
      g.globalAlpha = clamp(a, 0, 1);
      g.fillStyle = info.dark + 'd8'; this.rr(g, this.VW / 2 - w / 2, cy - 44, w, 92, 22); g.fill();
      g.strokeStyle = info.color; g.lineWidth = 4; g.stroke();
      this.text(g, info.name + lap, this.VW / 2, cy - 12, this.VW < 700 ? 30 : 36, '#ffffff');
      this.text(g, info.hint, this.VW / 2, cy + 26, this.VW < 700 ? 16 : 19, '#ffe9a8');
      g.globalAlpha = 1;
    }
    syncActionButton(w, mode) {
      const b = this._act; if (!b || b.classList.contains('hidden')) return;
      const f = Math.round(clamp(w.hero.flip, 0, 1) * 100);
      if (f !== this._lastFlip) { this._lastFlip = f; b.style.setProperty('--charge', f + '%'); b.classList.toggle('ready', f >= 100); }
    }
    drawDebug(g, w) {
      const A = w.arena; g.strokeStyle = 'rgba(255,0,0,.8)'; g.lineWidth = 1; g.strokeRect(A.x0, A.y0, A.x1 - A.x0, A.y1 - A.y0);
      g.strokeStyle = 'rgba(0,255,255,.8)';
      g.beginPath(); g.arc(w.hero.x, w.hero.y, w.cfg.heroR, 0, TAU); g.stroke();
      for (let i = 0; i < w.trail.length; i++) { const t = w.trail[i]; g.strokeStyle = i < w.cfg.safeNeck ? 'rgba(0,255,0,.6)' : 'rgba(255,80,80,.8)'; g.beginPath(); g.arc(t.x, t.y, w.cfg.bonkR, 0, TAU); g.stroke(); }
      for (const a of this.layout.avoid) { g.strokeStyle = 'rgba(255,255,0,.7)'; g.beginPath(); g.arc(a.x, a.y, a.r, 0, TAU); g.stroke(); }
      const st = RP.debug && RP.debug.getState && RP.debug.getState();
      if (st) { g.font = '12px monospace'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(JSON.stringify({ st: st.state, lvl: st.level, tr: st.trail, gold: (w.notes || []).filter(n => n.gold).map(n => n.state).join(), fx: this.fx.length, p: st.particles }), 10, this.VH - 10); }
    }
  }
  Renderer.BIOME_INFO = BIOME_INFO;
  RP.Renderer = Renderer;
})(window.RP = window.RP || {});
