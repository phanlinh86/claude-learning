/* DD.Renderer — side-view rhythm-stage renderer, mobile-first. The canvas fills the screen in portrait and landscape
 * (logical VW×VH, see computeView). The world is screen-independent (lanes + times); layout() maps it to the screen:
 * gems HOP in from the right edge along two bamboo rails (one hop per beat) and land on the drums in front of Momo
 * on the beat. The static tower floor (wall, arch with the valley view, beam, deck, rails, props) is pre-rendered ONCE
 * per floor and size into a device-pixel canvas and blitted pixel-exact, with a crossfade between floors. On top:
 * drums, gems, Momo on his swing-lift, Pip the helper, weather particles, juicy effects and the HUD. */
(function (DD) {
  'use strict';
  const TOD_INFO = [
    { name: 'Riverbank', floor: 'Floor 1', color: '#ffb46b', dark: '#6b4325', wall: '#ebd1a7', hint: 'Drum when a gem lands on the drum!' },
    { name: 'Fern Canopy', floor: 'Floor 2', color: '#8fd16a', dark: '#2f5a24', wall: '#cdc792', hint: 'Catch 5 in a row and Pip comes to help!' },
    { name: 'Nest Ledge', floor: 'Floor 3', color: '#8cc4ff', dark: '#2c4a78', wall: '#dfe4ee', hint: 'Count the hops: 3, 2, 1, bonga!' },
    { name: 'Sky Roof', floor: 'Top floor', color: '#c4a2ff', dark: '#2a2152', wall: '#574a7d', hint: 'Drum under the stars!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const easeOutBounce = t => { const n = 7.5625, d = 2.75;
    if (t < 1 / d) return n * t * t; if (t < 2 / d) return n * (t -= 1.5 / d) * t + 0.75;
    if (t < 2.5 / d) return n * (t -= 2.25 / d) * t + 0.9375; return n * (t -= 2.625 / d) * t + 0.984375; };
  const KIT = 96, COIN = 40, COIN_G = 44, PIP = [84, 70], RING = 72, SWING = [96, 32];
  const COIN_LIFT = 18;          // gem centre sits this far above the rail line when it touches down
  const HOP = 30;                // px height of a gem's hop between two beats (scaled by gs)
  const HUD_H = 64, TILE = 192;
  const JUDGE = { perfect: ['Perfect!', '#ffe14d'], good: ['Good', '#9ff0c0'] };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = []; this.fly = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.redFlash = 0; this.beatPulse = 0; this.ringFlash = [0, 0];
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.count = null;
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
      const dpr = window.devicePixelRatio || 1, touch = !!(DD.Game && DD.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear();
      this._hudK = clamp(0.95 / v.s, 1, 1.7);   // HUD scale so small HUD text stays ≥ ~14 CSS px on phones
      this._view = v;
      this.layout = this.computeLayout(v);
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 12) * S) + 'px'; hud.style.right = (v.left + (I.right + 12) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      this._measureHud();
      this.layout = this.computeLayout(v);   // again, now that the HUD buttons are measured
      DD.Assets.setScale(this.px);
    }

    /* DESIGN §2: ring x (drums), lane rail lines, deck, arch window. Pip uses the HELPER box (helperXY). All logical px. */
    computeLayout(v) {
      const VW = v.VW, VH = v.VH, I = v.ins, portrait = VW < VH;
      // gameplay sprite scale: phones in portrait get bigger Kit / coins / rings (the play band was tiny there)
      const gs = this.gs = portrait && v.s < 0.9 ? 1.35 : 1;
      const hudH = (v.s < 0.75 ? 80 : HUD_H) * (portrait ? 1.1 : 1);
      const ringX = Math.round(I.left + Math.max(portrait ? 160 : 170, 0.2 * VW + 20));
      const laneY = portrait ? [Math.round(VH * (gs > 1 ? 0.52 : 0.50)), Math.round(VH * (gs > 1 ? 0.76 : 0.68))] : [Math.round(VH * 0.50), Math.round(VH * 0.79)];
      // keep the lower lane above the bottom safe area, and the upper lane well below the HUD
      laneY[1] = Math.min(laneY[1], Math.round(VH - I.bottom - 70));
      laneY[0] = Math.max(laneY[0], Math.round(I.top + hudH + 150));
      const coinY = laneY.map(y => y - COIN_LIFT * gs);
      const split = (coinY[0] + coinY[1]) / 2;
      const floorTop = laneY[1] - 46;
      const top = I.top + hudH;
      // window: centred to the right of Kit, between the HUD band and the shelf
      const room = laneY[0] - 40 - (top + 8);
      const ww = clamp(Math.min(room * 320 / 260, VW * (portrait ? 0.62 : 0.34)), 120, 420), wh = ww * 260 / 320;
      // portrait: the arch sits a bit right of centre (Pip perches top-left, near the drums)
      const ww2 = portrait ? Math.min(ww, VW * 0.6) : ww, wh2 = ww2 * 260 / 320;
      const wcx = portrait ? clamp(VW * 0.6, ww2 / 2 + 10, VW - ww2 / 2 - 10) : clamp(VW * 0.6, ww / 2 + 10, VW - ww / 2 - 10);
      const win = { x: Math.round(wcx - ww2 / 2), y: Math.round(top + 8 + Math.max(0, (room - wh2) * 0.45)), w: Math.round(ww2), h: Math.round(wh2) };
      return { VW, VH, s: v.s, ins: I, portrait, gs, hudH, ringX, kitX: ringX - 56 * gs, laneY, coinY, split, floorTop, win, xEnd: VW + 40 };
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    /* lane under a logical y: above the midpoint between the two lanes = 0 (upper), else 1 */
    laneAt(y) { return y < this.layout.split ? 0 : 1; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.fly.length = 0;
      this.banner = null; this.count = null; this.shake = 0; this.flash = 0; this.redFlash = 0; this._deadAt = null;
      if (weather && weather.resize) weather.resize(this.VW, this.VH);
    }
    setSeason(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    setLevel(i, instant) { this.setSeason(i, instant); }
    showBanner(tod) { this.banner = { s: tod, t: 0 }; }

    // ---------------- static tower floor (pre-rendered per floor + size) ----------------
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (DD.Assets._ver || 0) + '|' + (DD.Assets.hasCustom(DD.Assets.SLOTS[3 + b].id) ? 1 : 0) + '|' + (DD.Game && DD.Game.isTouch ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    _strip(g, img, iw, ih, y, h, alpha) {   // a horizontally tileable strip, drawn at logical height h, full width
      if (!img) return false;
      const w = iw * h / ih;
      if (alpha != null) g.globalAlpha = alpha;
      for (let x = -((this.VW * 0.37) % w); x < this.VW; x += w) g.drawImage(img, x, y, w + 0.5, h);
      g.globalAlpha = 1;
      return true;
    }
    background(b) {
      const key = this._bgKey(b);
      let c = this._bg.get(key);
      if (c) return c;
      const A = DD.Assets, n = A.SEASONS[b], px = this.px, L = this.layout, info = TOD_INFO[b];
      const wall = A.img[n + '_wallpaper'];
      if (!wall && !A.restDone && b !== 0) return null;   // not loaded yet: caller falls back
      c = document.createElement('canvas'); c.width = Math.round(this.VW * px); c.height = Math.round(this.VH * px);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.fillStyle = info.wall; g.fillRect(0, 0, c.width, c.height);
      const custom = A.custom[A.SLOTS[3 + b].id];
      if (custom) {   // player's picture covers the wall (not the deck); blurred, desaturated and washed so gems read
        const wallH = Math.round(L.floorTop * px);
        const k = Math.max(c.width / custom.width, wallH / custom.height);
        g.save(); g.beginPath(); g.rect(0, 0, c.width, wallH); g.clip();
        if ('filter' in g) g.filter = 'blur(' + Math.max(1, Math.round(2 * px)) + 'px) saturate(.75)';
        g.drawImage(custom, (c.width - custom.width * k) / 2, (wallH - custom.height * k) / 2, custom.width * k, custom.height * k);
        if ('filter' in g) g.filter = 'none';
        g.globalAlpha = b === 3 ? 0.45 : 0.35; g.fillStyle = b === 3 ? 'rgb(20,24,60)' : info.wall; g.fillRect(0, 0, c.width, wallH);
        g.restore();
      } else if (wall) {
        const t = document.createElement('canvas'); t.width = t.height = Math.max(8, Math.round(TILE * px));
        t.getContext('2d').drawImage(wall, 0, 0, t.width, t.height);
        g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, c.width, c.height);
      }
      g.setTransform(px, 0, 0, px, 0, 0);
      // light shaft from the arch (river / ferns / nests), a soft gradient on the wall
      const W = L.win;
      if (b < 3) {
        const col = ['255,214,160', '255,251,214', '250,252,255'][b];
        const gr = g.createLinearGradient(W.x, W.y, W.x - W.w * 0.3, L.floorTop + 60);
        gr.addColorStop(0, 'rgba(' + col + ',.35)'); gr.addColorStop(1, 'rgba(' + col + ',0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(W.x, W.y + W.h * 0.1); g.lineTo(W.x + W.w, W.y + W.h * 0.1);
        g.lineTo(W.x + W.w * 0.75, L.floorTop + 80); g.lineTo(W.x - W.w * 0.55, L.floorTop + 80); g.closePath(); g.fill();
      }
      // the arch with the valley view of this floor
      const win = A.img[n + '_window'];
      if (win) { g.save(); g.shadowColor = 'rgba(40,20,40,.25)'; g.shadowBlur = 12; g.shadowOffsetY = 4; g.drawImage(win, W.x, W.y, W.w, W.h); g.restore(); }
      else { g.fillStyle = ['#9fd2ef', '#bfdc8e', '#c3def7', '#25265a'][b]; g.fillRect(W.x, W.y, W.w, W.h); g.lineWidth = 8; g.strokeStyle = '#c9a26a'; g.strokeRect(W.x, W.y, W.w, W.h); }
      // Sky Roof: a firefly-jar lantern hangs on a string right of the arch, with a soft green-gold halo
      if (b === 3) {
        const nx = Math.min(this.VW - L.ins.right - 50, W.x + W.w + 56), ny = Math.max(L.hudH + L.ins.top + 70, W.y + 40), r = 110;
        if (nx > W.x + W.w + 30) {
          g.strokeStyle = 'rgba(230,210,170,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(nx, 0); g.lineTo(nx, ny - 30); g.stroke();
          const halo = g.createRadialGradient(nx, ny + 6, 4, nx, ny + 6, r);
          halo.addColorStop(0, 'rgba(234,255,154,.40)'); halo.addColorStop(1, 'rgba(234,255,154,0)');
          g.fillStyle = halo; g.fillRect(nx - r, ny + 6 - r, r * 2, r * 2);
          const nl = A.img.nightlight; if (nl) g.drawImage(nl, nx - 34, ny - 32, 68, 68);
        }
      }
      // deck (from the wall's foot down), then the bamboo beam for the upper rail
      const fl = A.img[n + '_floor'];
      g.fillStyle = ['#d3aa7e', '#baa662', '#d6cab7', '#4a4470'][b]; g.fillRect(0, L.floorTop, this.VW, this.VH - L.floorTop);
      if (fl) for (let y = L.floorTop; y < this.VH; y += 190) { this._strip(g, fl, 512, 192, y, 192); }
      g.fillStyle = b === 3 ? 'rgba(200,180,255,.25)' : 'rgba(255,255,255,.4)'; g.fillRect(0, L.floorTop - 5, this.VW, 5);   // deck edge highlight
      g.fillStyle = 'rgba(60,30,30,.18)'; g.fillRect(0, L.floorTop, this.VW, 4);
      const shelfY = L.laneY[0] + 4;
      g.fillStyle = 'rgba(40,20,30,.16)'; g.fillRect(0, shelfY + 40, this.VW, 10);   // shelf shadow on the wall
      if (!this._strip(g, A.img.shelf, 512, 56, shelfY - 2, 56)) {
        g.fillStyle = '#b07a4f'; g.fillRect(0, shelfY + 8, this.VW, 26); g.fillStyle = '#8a5a35'; g.fillRect(0, shelfY + 30, this.VW, 8);
        g.fillStyle = 'rgba(90,55,35,.55)';   // fallback brackets (the shelf art has its own)
        for (let x = 120; x < this.VW; x += 320) { g.beginPath(); g.moveTo(x, shelfY + 30); g.lineTo(x + 26, shelfY + 30); g.lineTo(x + 6, shelfY + 64); g.lineTo(x, shelfY + 64); g.closePath(); g.fill(); }
      }
      // props: one on the beam left of Momo, a few on the deck (never inside the lanes' play band)
      const toy = (k, x, base, s, flip) => { const im = A.img['decor_' + k]; if (!im) return; g.save(); g.translate(x, base); if (flip) g.scale(-1, 1); g.drawImage(im, -s / 2, -s * 150 / 160, s, s); g.restore(); };
      const shelfToy = Math.min(84, L.kitX - L.ins.left - 52);
      if (shelfToy > 50) toy(0, L.ins.left + shelfToy / 2 + 6, shelfY - 6, shelfToy, false);
      // deck props stand at the bottom edge and never reach up into the lower lane
      const base = this.VH - L.ins.bottom - 4;
      const fs = clamp((base - (L.laneY[1] + 40)) / 0.94, 50, L.portrait ? 130 : 110);
      const kinds = [1, 3, 2, 4, 5];
      const nF = Math.max(2, Math.round(this.VW / 300));
      // same props in the same spots on every floor, so the crossfade doesn't show two sets
      for (let i = 0; i < nF; i++) toy(kinds[i % kinds.length], L.ins.left + 70 + (this.VW - L.ins.left - L.ins.right - 140) * i / Math.max(1, nF - 1), base, fs, i % 2 === 1);
      // wall prop in portrait (lots of wall): the wind chime on a little ledge under the arch
      if (L.portrait && L.win.y + L.win.h + 120 < L.coinY[0] - 100 * L.gs) toy(4, L.win.x + L.win.w * 0.3, L.win.y + L.win.h + 120, 110, false);
      // floor light (environment artist's notes): warm morning, green dapple, airy haze, dusk
      g.fillStyle = ['rgba(255,196,120,0.07)', 'rgba(150,210,90,0.06)', 'rgba(235,240,255,0.06)', 'rgba(34,20,84,0.16)'][b]; g.fillRect(0, 0, this.VW, this.VH);
      if (b === 1) for (let i = 0; i < 5; i++) {   // dappled light blobs through the fern canopy
        const dx = (i * 0.23 + 0.08) * this.VW, dy = (L.hudH + 30) + ((i * 37) % 5) / 5 * Math.max(40, L.laneY[0] - L.hudH - 80), r = 40 + (i % 3) * 18;
        const gr = g.createRadialGradient(dx, dy, 2, dx, dy, r); gr.addColorStop(0, 'rgba(255,251,224,0.16)'); gr.addColorStop(1, 'rgba(255,251,224,0)');
        g.fillStyle = gr; g.fillRect(dx - r, dy - r, r * 2, r * 2);
      }
      // a slightly darker bed behind the lower rail on light floors, so the gems pop off the deck
      if (b < 3) { g.fillStyle = 'rgba(70,40,30,.16)'; g.fillRect(0, L.laneY[1] - 34 * L.gs - 4, this.VW, 40 * L.gs + 4); }
      // the two bamboo rails (darker at dusk on the roof)
      for (const y of L.laneY) {
        g.fillStyle = 'rgba(40,20,30,.14)'; g.fillRect(0, y + 14, this.VW, 8);
        if (b === 3 && 'filter' in g) g.filter = 'brightness(.82)';
        const okT = this._strip(g, A.img.track, 512, 40, y - 20, 40);
        if ('filter' in g) g.filter = 'none';
        if (!okT) { g.fillStyle = '#8a5a35'; for (let x = 0; x < this.VW; x += 22) g.fillRect(x, y - 8, 10, 22); g.fillStyle = '#9aa3b5'; g.fillRect(0, y - 6, this.VW, 4); g.fillRect(0, y + 6, this.VW, 4); }
      }
      // soft vignette so the play band reads first
      g.setTransform(1, 0, 0, 1, 0, 0);
      const vg = g.createRadialGradient(c.width * 0.45, c.height * 0.6, Math.min(c.width, c.height) * 0.3, c.width * 0.45, c.height * 0.6, Math.max(c.width, c.height) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, b === 3 ? 'rgba(5,5,25,.38)' : 'rgba(60,20,40,.16)');
      g.fillStyle = vg; g.fillRect(0, 0, c.width, c.height);
      this._bg.set(key, c);
      if (this._bg.size > 6) this._bg.delete(this._bg.keys().next().value);
      return c;
    }

    // ---------------- events → effects ----------------
    laneXY(lane) { const L = this.layout; return [L.ringX, L.coinY[lane || 0]]; }
    onEvents(evts) {
      const L = this.layout;
      for (const e of evts) {
        switch (e.type) {
          case 'hit': {
            const [x, y] = this.laneXY(e.lane), gold = e.kind === 'gold';
            this.ringFlash[e.lane] = 1;
            const col0 = gold ? '#ff9de2' : '#7ff0e0';
            this.sparks(x, y, gold ? 16 : e.judge === 'perfect' ? 10 : 6, col0);
            this.ring(x, y, col0, 0.35, e.judge === 'perfect');
            this.fly.push({ k: 'coin', gold, lane: e.lane, x0: x, y0: y, t: 0, max: 0.26 });   // the gem bounces off the drum into Momo's pouch
            const [word, col] = JUDGE[e.judge] || JUDGE.good, gs = L.gs || 1;
            // both above the highest gem top (the hop arc reaches coinY − 50), so they never sit on an incoming gem
            this.texts.push({ text: word, x: x + 44 * gs, y: y - 66 * gs, life: 0, max: 0.6, size: Math.round((e.judge === 'perfect' ? 26 : 22) * Math.sqrt(gs)), color: col });
            if (e.points) this.texts.push({ text: '+' + e.points + (e.helper ? ' ×2' : ''), x: x + 140 * gs, y: y - 66 * gs, life: 0, max: 0.7, size: Math.round(20 * Math.sqrt(gs)), color: e.helper ? '#ffd3a8' : '#ffffff' });
            if (gold && this.weather && this.weather.burst) this.weather.burst('sparkle', x, y, 6);
            break;
          }
          case 'miss': {
            const [x, y] = this.laneXY(e.lane);
            const gs = L.gs || 1;
            this.texts.push({ text: e.early ? 'Too early' : 'Miss', x: x + 44 * gs, y: y - 58 * gs, life: 0, max: 0.6, size: Math.round(24 * Math.sqrt(gs)), color: '#efeaff' });
            break;
          }
          case 'empty': { const [x, y] = this.laneXY(e.lane < 0 ? (this.world.kit.lane || 0) : e.lane); this.puffs(x, y, 2, 'rgba(255,255,255,.6)'); break; }
          case 'tap': if (e.lane >= 0) this.ringFlash[e.lane] = Math.max(this.ringFlash[e.lane], 0.5); break;
          case 'multup': this.texts.push({ text: 'Combo ×' + e.mult + '!', x: this.VW / 2, y: L.hudH + L.ins.top + 70, life: 0, max: 1.3, size: 34, color: ['#fff', '#fff', '#9ff0c0', '#5ec2ff', '#ff9de2'][e.mult] || '#ffe14d', big: true }); this.confetti(this.VW / 2, L.hudH + 80, 14); break;
          case 'combobreak': break;
          case 'helperin': {   // below the "Combo ×N!" line (hudH + 70), above the upper rail
            const by = L.portrait ? L.coinY[1] + 110 * L.gs : Math.max(L.hudH + L.ins.top + 118, L.coinY[0] - 120);
            // shown as Pip comes into view (~0.4 s into his 1 s fly-in from the AWAY anchor just above the screen)
            this.texts.push({ text: 'Pip is here! Points ×2', x: L.portrait ? this.VW / 2 : Math.max(this.VW / 2, L.ringX + 300), y: by, life: -0.35, max: 1.8, size: L.portrait ? 26 : 28, color: '#ffd3a8', big: true });
            break;
          }
          case 'helpersave': {
            const [x, y] = this.laneXY(e.lane), gs = L.gs || 1;
            // in the band between the two rails: clear of Pip's swoop path and of the gem hops
            this.texts.push({ text: 'Pip caught it!', x: x + 120 * gs, y: e.lane === 0 ? y + 72 * gs : y - 72 * gs, life: 0, max: 1.0, size: Math.round(24 * Math.sqrt(gs)), color: '#ffd3a8' });
            this.puffs(x, y, 5, 'rgba(255,255,255,.85)');
            if (this.weather && this.weather.burst) this.weather.burst('fluff', x, y, 5);
            this.fly.push({ k: 'pipgem', lane: e.lane, x0: x, y0: y, t: 0, max: 0.5, gold: false });
            break;
          }
          case 'helperout': break;
          case 'count': this.count = { n: e.n, t: 0 }; break;
          case 'beat': this.beatPulse = 1; this._down = e.down; if (this.weather && this.weather.pulse) this.weather.pulse(); break;
          case 'groovelow': this.redFlash = 0.4; break;
          case 'songdone': this.texts.push({ text: 'Song complete!', x: this.VW / 2, y: this.VH * 0.3, life: 0, max: 2.4, size: 44, color: '#ffe14d', big: true }); this.confetti(this.VW / 2, this.VH * 0.3, 40); break;
          case 'cleared': if (e.bonus) this.texts.push({ text: 'Groove bonus +' + e.bonus, x: this.VW / 2, y: this.VH * 0.3 + 52, life: 0, max: 2.2, size: 24, color: '#ffffff', big: true }); break;
          case 'level': this.showBanner(e.tod); this.setSeason(e.tod); this._deadAt = null; break;
          case 'start': this._deadAt = null; break;
          case 'dead': this._deadAt = this.time; this._deadPuffs = 0; this.banner = null; this.count = null; this.flash = 0.4; this.shake = 0.3; this.texts.push({ text: 'Momo is sleepy…', x: this.VW / 2, y: this.VH * 0.32, life: 0, max: 2.5, size: 40, color: '#ffd1e6', big: true }); break;
        }
      }
    }
    _note(id) { const ns = this.world && this.world.notes; if (!ns) return null; for (const n of ns) if (n.id === id) return n; return null; }
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 70 + Math.random() * 150; this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 80, life: 0, max: 0.35 + Math.random() * 0.25, size: 2 + Math.random() * 2.5, color }); }
    }
    puffs(x, y, n, color) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'puff', x: x + (Math.random() - .5) * 18, y: y + (Math.random() - .5) * 8, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * 30, g: 0, life: 0, max: 0.45 + Math.random() * 0.2, size: 6 + Math.random() * 6, color });
    }
    confetti(x, y, n) {
      const cols = ['#ff7fb0', '#5ec2ff', '#5edfa6', '#ffd23f', '#b99cff'];
      for (let i = 0; i < n; i++) { const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 160 + Math.random() * 240; this.fx.push({ k: 'conf', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 420, life: -i * 0.01, max: 1.4 + Math.random() * 0.5, size: 7 + Math.random() * 4, rot: Math.random() * TAU, vr: (Math.random() - 0.5) * 14, color: cols[i % cols.length] }); }
    }
    ring(x, y, color, max, big) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 14, r1: big ? 62 : 44, color }); }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 0.9);
      if (this.banner) {
        this.banner.t += dt;
        // hold the banner through the count-in (the 3·2·1 is drawn inside it), then let it fade out after "Go!"
        const w = this.world, counting = (w && w.state === 'ready') || (this.count && this.count.n === 0 && this.count.t < 0.45);
        if (counting && this.banner.t > 1.0) this.banner.t = 1.0;
        if (this.banner.t > 2.2) this.banner = null;
      }
      // groove ran out: the lift lowers Momo to the deck and he dozes off (three floating "z")
      if (this._deadAt != null && this.world && this.world.state === 'dead') {
        const dt2 = this.time - this._deadAt;
        while (this._deadPuffs < 3 && dt2 >= 0.7 + 0.35 * this._deadPuffs) {
          this._deadPuffs++;
          const kx = this._kitXY || [this.layout.kitX, this.layout.coinY[1]], gs = this.layout.gs || 1;
          this.texts.push({ text: 'z', x: kx[0] + (18 + 10 * this._deadPuffs) * gs, y: kx[1] - (50 + 8 * this._deadPuffs) * gs, life: 0, max: 1.4, size: Math.round((16 + 5 * this._deadPuffs) * Math.sqrt(gs)), color: '#e8e0ff' });
        }
      }
      if (this.count) { this.count.t += dt; if (this.count.t > 0.7) this.count = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      this.redFlash = Math.max(0, this.redFlash - dt * 2);
      this.beatPulse = Math.max(0, this.beatPulse - dt * 4);
      this.ringFlash[0] = Math.max(0, this.ringFlash[0] - dt * 5); this.ringFlash[1] = Math.max(0, this.ringFlash[1] - dt * 5);
      for (const f of this.fx) {
        f.life += dt; if (f.life < 0) continue;
        f.vy += (f.g || 0) * dt; f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt;
        if (f.k === 'conf') { f.vx *= 1 - 1.2 * dt; f.vy = Math.min(f.vy, 160); }
        if (f.vr) f.rot += f.vr * dt;
      }
      this.fx = this.fx.filter(f => f.life < f.max);
      if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
      for (const f of this.fly) f.t += dt;
      this.fly = this.fly.filter(f => f.t < f.max);
      for (const t of this.texts) { t.life += dt; if (!t.big && t.life > 0) t.y -= 30 * dt; }
      this.texts = this.texts.filter(t => t.life < t.max);
    }

    // ---------------- drawing ----------------
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px;
      if (!w) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = '#2b2350'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); return; }
      const al = w._acc != null && w.cfg && w.cfg.step ? clamp(w._acc / w.cfg.step, 0, 1) : 1;
      this._al = al;
      g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = 1;
      let shx = 0, shy = 0;
      if (this.shake > 0) { const m = this.shake * 12; shx = Math.round((Math.random() - 0.5) * m * px); shy = Math.round((Math.random() - 0.5) * m * px); }
      const cur = this.background(this.vis.cur) || this.background(0);
      if (cur) g.drawImage(cur, shx, shy); else { g.fillStyle = '#2b2350'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); }
      if (this.vis.t < 1 && this.vis.prev !== this.vis.cur) {
        const prev = this.background(this.vis.prev);
        if (prev) { g.globalAlpha = 1 - this.vis.t; g.drawImage(prev, shx, shy); g.globalAlpha = 1; }
      }
      g.setTransform(px, 0, 0, px, shx, shy);
      const amb = this.weather && this.weather.ambient;
      if (amb && amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, this.VW, this.VH); }   // room light only; characters stay bright
      this.drawParticles(g, 'back');
      this.drawLaneHints(g, w);
      this.drawRopes(g, w, al);   // behind the drums: a rope at ringX − 8 never crosses a drum face
      this.drawRings(g, w);
      this.drawNotes(g, w, 0); this.drawNotes(g, w, 1);
      this.drawKit(g, w, al);
      this.drawFly(g);
      this.drawHelper(g, w, al);
      this.drawParticles(g, 'front');
      this.drawFx(g);
      g.setTransform(px, 0, 0, px, 0, 0);
      if (this.redFlash > 0) { g.fillStyle = 'rgba(255,120,150,' + (this.redFlash * 0.2) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (this.flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.5) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (mode !== 'title') { this.drawHud(g, w); this.drawBanner(g); this.drawCount(g); }
      this.drawTexts(g);
      if (this.debug) this.drawDebug(g, w);
    }

    spr(key, w, h) { return DD.Assets.sprite(key, w, h); }
    drawSprite(g, key, x, y, w, h) { const c = this.spr(key, w, h); if (c) g.drawImage(c, x, y, w, h); return !!c; }

    drawParticles(g, layer) {
      const P = this.weather && this.weather.particles; if (!P) return;
      for (const p of P) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.sprite === 'dot') { g.fillStyle = p.color || '#fff'; g.beginPath(); g.arc(p.x, p.y, p.size / 2, 0, TAU); g.fill(); continue; }
        const c = this.spr('p_' + p.sprite, p.size, p.size);
        if (!c) { g.fillStyle = p.color || 'rgba(255,255,255,.8)'; g.beginPath(); g.arc(p.x, p.y, p.size / 4, 0, TAU); g.fill(); continue; }
        if (!p.rot && (p.flipX || 1) === 1) { g.drawImage(c, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); continue; }
        g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); g.scale(p.flipX || 1, 1);
        g.drawImage(c, -p.size / 2, -p.size / 2, p.size, p.size); g.restore();
      }
      g.globalAlpha = 1;
    }

    /* x of a note on its track: right edge at `approach` seconds before its hit time, the ring at its hit time */
    rt(w) { return (w.songTime || 0) + (w._acc || 0); }   // render time: the world's song time incl. the sub-step leftover
    noteX(n, w) { const L = this.layout, ap = w.approach || 1.8; return L.ringX + (n.time - this.rt(w)) / ap * (L.xEnd - L.ringX); }

    drawLaneHints(g, w) {
      // touch hint chips on the right edge for the first two levels (one-button Easy shows one chip in the middle)
      const touch = !!(DD.Game && DD.Game.isTouch), L = this.layout;
      if (!touch || (w.level || 0) > 1 || DD.Game.mode !== 'playing') return;
      const one = w.cfg && w.cfg.oneButton, x = this.VW - L.ins.right - 40, a = 0.55 + 0.25 * this.beatPulse;
      g.globalAlpha = a;
      if (one) {   // one button: a neutral "tap here" target (no up/down arrow), pulsing on the beat
        g.fillStyle = '#5cc65a'; g.beginPath(); g.arc(x, L.split, 18, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 4; g.beginPath(); g.arc(x, L.split, 22 + 10 * this.beatPulse, 0, TAU); g.stroke();
      }
      else { this.drawSprite(g, 'tap_up', x - 26, L.coinY[0] - 60 - 26 * L.gs, 52, 52); this.drawSprite(g, 'tap_down', x - 26, L.coinY[1] + 4 + 26 * L.gs, 52, 52); }
      g.globalAlpha = 1;
    }

    drawRings(g, w) {
      const L = this.layout, beatFrac = w.beat != null ? ((w.beat % 1) + 1) % 1 : 0;
      const pulse = (w.state === 'playing' || w.state === 'ready') ? Math.pow(1 - beatFrac, 3) : 0;
      for (let lane = 0; lane < 2; lane++) {
        // the drum: pulses gently on the beat; a hit squashes the skin down and it springs back
        const f = this.ringFlash[lane], x = L.ringX, y = L.coinY[lane], s = RING * L.gs * (1 + 0.06 * pulse + 0.06 * f);
        const sq = 1 - 0.14 * f * f;
        g.fillStyle = 'rgba(255,255,255,' + (0.12 + 0.28 * f) + ')'; g.beginPath(); g.ellipse(x, y, s * 0.5, s * 0.3, 0, 0, TAU); g.fill();
        const c = this.spr('ring', s, s);
        if (c) g.drawImage(c, x - s / 2, y - s / 2 + s * (1 - sq) * 0.3, s, s * sq);
        else { g.lineWidth = 6; g.strokeStyle = '#ff7f6e'; g.beginPath(); g.arc(x, y, s * 0.42, 0, TAU); g.stroke(); }
      }
    }

    drawCoin(g, x, y, gold, rot, scale, alpha) {
      const A = DD.Assets, glow = this.weather && this.weather.ambient ? this.weather.ambient.glow || 0 : 0;
      const s = (gold ? COIN_G : COIN) * (scale || 1) * (this.gs || 1);
      if (alpha != null) g.globalAlpha = alpha;
      if (glow > 0) {
        const r = s * 0.95, gr = g.createRadialGradient(x, y, 2, x, y, r);
        gr.addColorStop(0, gold ? 'rgba(255,190,240,' + (0.55 * glow) + ')' : 'rgba(150,255,235,' + (0.55 * glow) + ')'); gr.addColorStop(1, 'rgba(150,255,235,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      } else {
        // soft contact halo so the gem reads on any wall (the gem art also has its own white sticker edge)
        g.fillStyle = 'rgba(40,30,60,.32)'; g.beginPath(); g.arc(x, y, s * 0.60, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.stroke();   // white sticker ring: luminance contrast on light walls
      }
      if (A.hasCustom('coin')) {
        const r = s / 2;
        g.beginPath(); g.arc(x, y, r + 2, 0, TAU); g.fillStyle = gold ? '#ff9de2' : '#7ff0e0'; g.fill();
        g.lineWidth = 2.5; g.strokeStyle = 'rgba(13,83,99,.8)'; g.stroke();
        const [fw, fh] = A.fit('coin', s * 0.86, s * 0.86), c = this.spr('custom:coin', fw, fh);
        if (c) { g.save(); g.translate(x, y); g.rotate(rot || 0); g.drawImage(c, -fw / 2, -fh / 2, fw, fh); g.restore(); }
      } else {
        const c = this.spr(gold ? 'coin_gold' : 'coin', s, s);
        if (c) { g.save(); g.translate(x, y); g.rotate(rot || 0); g.drawImage(c, -s / 2, -s / 2, s, s); g.restore(); }
        else { g.fillStyle = gold ? '#ff9de2' : '#3ec9c0'; g.beginPath(); g.arc(x, y, s / 2, 0, TAU); g.fill(); g.lineWidth = 3; g.strokeStyle = '#0d5363'; g.stroke(); }
      }
      g.globalAlpha = 1;
    }
    drawNotes(g, w, lane) {
      const ns = w.notes; if (!ns) return;
      const L = this.layout, y0 = L.coinY[lane], rail = L.laneY[lane];
      for (const n of ns) {
        if (n.lane !== lane) continue;
        if (n.state === 'hit' || n.state === 'saved') continue;   // bounced into Momo's pouch / caught by Pip (fly fx)
        const x = this.noteX(n, w);
        if (x > L.xEnd + 30) break;        // sorted by time: everything after is further right
        if (x < -40) continue;
        let a = 1, y = y0, spin = 0, hop = 0, late = false;
        const bl = w.beatLen || 0.6, dtb = (n.time - this.rt(w)) / bl;   // beats until the gem lands on the drum
        if (n.state === 'miss' || (n.state === 'live' && dtb < 0)) {   // late: bounces off the drum's rim and tumbles off behind it
          const k = clamp(-dtb * bl / 0.35, 0, 1);
          a = 1 - k; if (a <= 0) continue; y += k * k * 46 - Math.sin(k * Math.PI) * 14; spin = k * 4; late = true;
        } else {
          // one hop per beat: a parabola that touches the rail on every beat, the last touch is ON the drum at the hit time
          const ph = dtb - Math.floor(dtb);                // 0..1 inside the current hop
          hop = 4 * ph * (1 - ph) * HOP * L.gs;            // ballistic arc (constant gravity), max HOP at mid-beat
        }
        const gold = n.kind === 'gold', s = (gold ? COIN_G : COIN) * L.gs;
        // shadow on the rail shrinks while the gem is up in the air
        const hk = 1 - hop / (HOP * L.gs + 1) * 0.55;
        g.fillStyle = 'rgba(40,20,30,' + (0.2 * a * hk) + ')'; g.beginPath(); g.ellipse(x, rail + 4, s * 0.38 * hk, 4, 0, 0, TAU); g.fill();
        // squash on touch-down, stretch on the way up; a tiny wobble instead of rolling (gems are faceted)
        const ph2 = late ? 0.5 : dtb - Math.floor(dtb), land = Math.min(ph2, 1 - ph2);
        const sqY = land < 0.08 && !late ? 0.86 + land * 1.75 : 1 + Math.min(0.06, hop / (HOP * L.gs + 1) * 0.06);
        g.save(); g.translate(x, y - hop + s / 2); g.scale(1 / Math.sqrt(sqY), sqY); g.translate(-x, -(y - hop + s / 2));
        this.drawCoin(g, x, y - hop, gold, Math.sin(dtb * Math.PI) * 0.12 + spin, 1, a);
        g.restore();
        if (gold && n.state === 'live') { g.strokeStyle = 'rgba(255,157,226,' + (0.45 + 0.35 * Math.sin(this.time * 7)) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(x, y - hop, s * 0.62, 0, TAU); g.stroke(); }
      }
    }

    /* Pip's HELPER box → screen (world.js header): drums at x01 = 0; lane-0 drum y01 = 0.5, lane-1 drum y01 = 1. */
    helperXY() {
      const h = this.world && this.world.helper, L = this.layout, al = this._al == null ? 1 : this._al;
      if (!h) return [this.VW + 100, -100];
      const x01 = lerp(h._px01 != null ? h._px01 : h.x01, h.x01, al), y01 = lerp(h._py01 != null ? h._py01 : h.y01, h.y01, al);
      return [L.ringX + x01 * 0.5 * (this.VW - L.ringX), L.coinY[0] + (y01 - 0.5) * 2 * (L.coinY[1] - L.coinY[0])];
    }
    drawHelper(g, w, al) {
      const h = w.helper; if (!h || h.state === 'away') return;
      const A = DD.Assets, L = this.layout, gs = L.gs || 1, t = this.time;
      const [x, y] = this.helperXY();
      if (x < -80 || y < -80 || x > this.VW + 80) return;
      const dx = h.x01 - (h._px01 != null ? h._px01 : h.x01);
      const flip = dx > 0.0005 ? 1 : dx < -0.0005 ? -1 : (this._pipFlip || 1);   // face the way Pip flies; perched = faces right
      this._pipFlip = h.state === 'with' ? 1 : flip;
      const W = PIP[0] * gs, H = PIP[1] * gs, sc = W / 120, beat = w.beat != null ? w.beat : t * 1.6;
      const perched = h.frame === 'cheer';
      // flapping: 2 flaps per beat in flight; perched Pip bounces on the beat
      const key = perched ? 'pip_cheer' : (Math.floor(beat * 4) % 2 ? 'pip_fly1' : 'pip_fly2');
      g.save(); g.translate(x, y);
      if (!perched) { g.fillStyle = 'rgba(40,20,40,.12)'; }
      g.scale(this._pipFlip, 1); g.rotate(perched ? 0 : clamp(-dx * 40, -0.25, 0.25));
      if (A.hasCustom('helper')) {
        const [fw0, fh0] = A.fit('helper', 70, 64), fw = fw0 * gs, fh = fh0 * gs, c = this.spr('custom:helper', fw, fh);
        const flap = perched ? 1 : 1 + 0.08 * Math.sin(beat * Math.PI * 4);
        if (c) g.drawImage(c, -fw / 2 * flap, -fh / 2 / flap, fw * flap, fh / flap);
        // little lilac wings so a custom picture still "flies"
        g.fillStyle = 'rgba(208,176,246,.9)'; g.strokeStyle = '#644498'; g.lineWidth = 2;
        const wa = perched ? 0.3 : Math.sin(beat * Math.PI * 4) * 0.6;
        for (const sd of [-1, 1]) { g.save(); g.translate(sd * fw * 0.42, -fh * 0.1); g.rotate(sd * (0.4 + wa)); g.beginPath(); g.ellipse(sd * 14 * gs, 0, 16 * gs, 7 * gs, 0, 0, TAU); g.fill(); g.stroke(); g.restore(); }
      } else {
        const c = this.spr(key, W, H);
        if (c) g.drawImage(c, -60 * sc, -56 * sc, W, H);
        else { g.fillStyle = '#ffae70'; g.beginPath(); g.arc(0, 0, 22 * gs, 0, TAU); g.fill(); }
      }
      g.restore();
      // "×2" badge over Pip while the double points last, with the time left as a shrinking ring
      if (perched && h.left > 0) {
        const K = this._hudK || 1, r = 16 * gs * K, bx = x + 30 * gs + r * 0.5, by = y - 34 * gs - r * 0.3, f =   // up-right of Pip's head, clear of his face
           clamp(h.left / ((w.cfg && w.cfg.helperStay) || 20), 0, 1);
        g.fillStyle = 'rgba(60,30,80,.65)'; g.beginPath(); g.arc(bx, by, r, 0, TAU); g.fill();
        g.strokeStyle = '#ffd3a8'; g.lineWidth = 3; g.beginPath(); g.arc(bx, by, r, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.stroke();
        this.text(g, '×2', bx, by + 1, Math.round(14 * gs * K), '#ffffff', 'center');
      }
    }

    /* Momo's pose on the swing-lift this frame (shared by drawRopes and drawKit, so the ropes meet the seat exactly). */
    _kitPose(w, al) {
      const k = w.kit, A = DD.Assets, L = this.layout, t = this.time, gs = L.gs || 1, KS = KIT * gs;
      const pos = lerp(k._ppos != null ? k._ppos : k.pos, k.pos, al);
      const vel = (k.pos - (k._ppos != null ? k._ppos : k.pos)) / ((w.cfg && w.cfg.step) || 1 / 120);
      const beatPh = w.beat != null ? w.beat : t * 1.5;
      const custom = A.hasCustom('hero');
      const bob = Math.abs(Math.sin(beatPh * Math.PI)) * (custom ? 4 : 2.5) * gs;   // the swing bounces a little on every beat
      const x = L.kitX;
      let y = lerp(L.coinY[0], L.coinY[1], pos) + bob;
      // out of groove: the lift lowers Momo gently down to the deck rail with a little bounce
      const dead = w.state === 'dead' && this._deadAt != null, dT = dead ? this.time - this._deadAt : 0;
      if (dead) { const fy0 = L.laneY[1] + 10 - 40 * gs; y += easeOutBounce(Math.min(1, dT / 0.9)) * Math.max(0, fy0 - y); }
      const tilt = dead ? 0.18 * Math.min(1, dT / 0.5) : clamp(vel * 0.012, -0.16, 0.16);
      const ang = tilt + (k.dizzy > 0 && !dead ? Math.sin(t * 18) * 0.08 : 0);
      // swing-lift: the seat top (y 10 of swing.svg) meets Momo's seat line (y 104 of his 120-box); both boxes share the
      // scale s and the left edge, so rope x 14 / 106 line up.
      const s = KS / 120, swL = -58 * s, swT = (104 - 62 - 10) * s;
      return { x, y, ang, dead, beatPh, custom, gs, KS, s, swL, swT };
    }
    /* The two swing ropes, drawn in their own pass BEHIND the drums and in un-rotated space: the seat ends follow
     * Momo's tilt, the tops stay fixed above the screen, so the ropes pivot at the ceiling like a pendulum. */
    drawRopes(g, w, al) {
      if (!w.kit) return;
      const P = this._kitPose(w, al), gs = P.gs, ca = Math.cos(P.ang), sa = Math.sin(P.ang);
      const topY = -40;   // fixed pivot above the top edge (the HUD plate's alpha .62 keeps them faint behind it)
      for (const pass of [0, 1]) {
        g.strokeStyle = pass ? 'rgba(255,230,180,.55)' : '#7a5a33'; g.lineWidth = (pass ? 1.2 : 3.2) * gs; g.lineCap = 'round';
        for (const rx of [14, 106]) {
          const sx = P.swL + rx * P.s - (pass ? 0.8 * gs : 0), sy = P.swT + 2 * P.s;
          const ax = P.x + sx * ca - sy * sa, ay = P.y + sx * sa + sy * ca;
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(P.x + sx, topY); g.stroke();
        }
      }
    }

    drawKit(g, w, al) {
      const k = w.kit; if (!k) return;
      const A = DD.Assets, L = this.layout, t = this.time;
      const P = this._kitPose(w, al), { x, y, dead, beatPh, custom, gs, KS, s, swL, swT } = P;
      // shadow on the deck (only meaningful over the lower lane / deck)
      const fy = L.laneY[1] + 10, d = fy - y;
      g.fillStyle = 'rgba(40,20,30,' + clamp(0.22 - d / 1600, 0.05, 0.22) + ')'; g.beginPath(); g.ellipse(x - 6 * gs, fy, (30 - d * 0.04) * gs, 6 * gs, 0, 0, TAU); g.fill();
      g.save(); g.translate(x, y); g.rotate(P.ang);   // seat + Momo tilt together; the ropes were drawn in drawRopes()
      const SWW = SWING[0] * gs, SWH = SWING[1] * gs;
      if (!this.drawSprite(g, 'swing', swL, swT, SWW, SWH)) { g.fillStyle = '#c9d75c'; this.rr(g, swL + 6 * s, swT + 8 * s, 108 * s, 12 * s, 5 * s); g.fill(); }
      // show the reaching paw for the first moments of every catch, even a Perfect (happy follows)
      let frame = k.frame || 'idle';
      if (dead) frame = 'dizzy'; else if (k.reach != null && k.reach < 0.08 && frame === 'happy') frame = 'reach';
      if (custom) {
        const [fw0, fh0] = A.fit('hero', 84, 84), fw = fw0 * gs, fh = fh0 * gs, c = this.spr('custom:hero', fw, fh);
        const sq = frame === 'reach' ? 1.08 : frame === 'happy' ? 1.06 : frame === 'dizzy' ? 0.92 : 1 + Math.pow(Math.abs(Math.cos(beatPh * Math.PI)), 6) * 0.05;
        // sits on the swing: picture bottom on the seat
        const seatY = swT + 8 * s;
        if (c) { g.save(); g.translate(0, seatY); g.rotate(frame === 'reach' ? 0.12 : frame === 'dizzy' ? -0.1 : 0); g.drawImage(c, -fw / 2 * (2 - sq), -fh * sq, fw * (2 - sq), fh * sq); g.restore(); }
      } else {
        const c = this.spr('kit_' + frame, KS, KS);
        if (c) g.drawImage(c, -58 * s, -62 * s, KS, KS);
        else { g.fillStyle = '#ffc98a'; g.beginPath(); g.arc(0, 0, 30 * gs, 0, TAU); g.fill(); g.fillStyle = '#e94b4b'; g.fillRect(-36 * gs, -10 * gs, 14 * gs, 30 * gs); }
      }
      g.restore();
      if (k.dizzy > 0 || dead) {
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * TAU / 3, sx = x + Math.cos(a) * 22 * gs, sy = y - 52 * gs + Math.sin(a) * 6;
          if (!this.drawSprite(g, dead ? 'p_star' : 'p_sparkle', sx - 7, sy - 7, 14, 14)) { g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(sx, sy, 4, 0, TAU); g.fill(); }
        }
      }
      this._kitXY = [x, y];
    }

    drawFly(g) {
      const L = this.layout, kxy = this._kitXY || [L.kitX, L.coinY[0]];
      for (const f of this.fly) {
        const k = clamp(f.t / f.max, 0, 1);
        if (f.k === 'coin') {   // the drum bounces the gem up and into Momo's pouch, shrinking (a short ballistic arc)
          const ty = f.lane != null ? L.coinY[f.lane] : kxy[1];
          const x = lerp(f.x0, kxy[0] + 22 * (L.gs || 1), k), y = lerp(f.y0, ty + 6, k) - 4 * k * (1 - k) * 46 * (L.gs || 1);
          this.drawCoin(g, x, y, f.gold, k * 3, 1 - k * 0.6, 1 - k * 0.5);
        } else if (f.k === 'pipgem') {   // Pip's rescue: the gem is snatched up towards the perch
          const [hx, hy] = this.helperXY();
          const x = lerp(f.x0, hx, k), y = lerp(f.y0, hy + 20, k) - Math.sin(k * Math.PI) * 30;
          this.drawCoin(g, x, y, false, k * 4, 1 - k * 0.5, 1 - k * 0.4);
        }
      }
    }

    drawFx(g) {
      for (const f of this.fx) {
        if (f.life < 0) continue;
        const k = f.life / f.max, a = 1 - k;
        if (f.k === 'spark') { g.globalAlpha = a; g.fillStyle = f.color; g.beginPath(); g.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, TAU); g.fill(); }
        else if (f.k === 'puff') { g.globalAlpha = a * 0.8; g.fillStyle = f.color; g.beginPath(); g.arc(f.x, f.y, f.size * (0.6 + k), 0, TAU); g.fill(); }
        else if (f.k === 'circle') { g.globalAlpha = a; g.strokeStyle = f.color; g.lineWidth = 3 * a + 1; g.beginPath(); g.arc(f.x, f.y, lerp(f.r0, f.r1, Math.sqrt(k)), 0, TAU); g.stroke(); }
        else if (f.k === 'conf') { g.globalAlpha = Math.min(1, a * 2); g.save(); g.translate(f.x, f.y); g.rotate(f.rot); g.scale(1, Math.cos(f.rot * 1.7)); g.fillStyle = f.color; g.fillRect(-f.size / 2, -f.size / 4, f.size, f.size / 2); g.restore(); }
        else if (f.k === 'sprite') { const c = this.spr(f.spr, f.size, f.size); if (c) { g.globalAlpha = a; g.save(); g.translate(f.x, f.y); g.rotate(f.rot || 0); g.drawImage(c, -f.size / 2, -f.size / 2, f.size, f.size); g.restore(); } }
      }
      g.globalAlpha = 1;
    }
    text(g, s, x, y, size, color, align, stroke) {
      g.font = '900 ' + size + 'px ' + FONT; g.textAlign = align || 'center'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(3, size * 0.16); g.strokeStyle = stroke || 'rgba(40,30,50,.85)';
      g.strokeText(s, x, y); g.fillStyle = color; g.fillText(s, x, y);
    }
    drawTexts(g) {
      const L = this.layout;
      for (const t of this.texts) {
        if (t.life < 0) continue;   // delayed text, not yet due
        const k = t.life / t.max, a = k > 0.7 ? (1 - k) / 0.3 : 1, sc = t.life < 0.18 ? easeOutBack(t.life / 0.18) : 1;
        g.globalAlpha = clamp(a, 0, 1);
        this.text(g, t.text, clamp(t.x, 80, this.VW - 80), Math.max(t.y, L.ins.top + L.hudH + t.size * 0.6), Math.max(1, Math.round(t.size * sc)), t.color);
      }
      g.globalAlpha = 1;
    }
    drawCount(g) {
      const c = this.count; if (!c || this.banner) return;   // with the banner up, the count is drawn inside it
      const L = this.layout, gs = L.gs || 1, k = c.t / 0.7, s = (c.n === 0 ? 56 : 64) * (c.t < 0.15 ? easeOutBack(c.t / 0.15) : 1 - (k - 0.2) * 0.25);
      g.globalAlpha = clamp((1 - k) * 2, 0, 1);
      // over the upper ring, where the first coins will arrive
      this.text(g, c.n === 0 ? 'Go!' : String(c.n), L.ringX + 90 * gs, L.coinY[0] - 70 * gs, Math.round(s), c.n === 0 ? '#9ff0c0' : '#ffffff');
      g.globalAlpha = 1;
    }
    drawHud(g, w) {
      const I = this.ins, K = this._hudK || 1, x0 = I.left + 14, y0 = I.top + 12;
      // left plate: score + combo multiplier, groove meter under it
      const bw = Math.round(150 * K), bh = Math.round(14 * K), ic = Math.round(28 * K);
      const plateW = ic + bw + 20 * K + 22 * K, plateH = Math.round(70 * K);   // + room for the low-groove "!" after the meter
      g.fillStyle = 'rgba(30,25,60,.62)'; this.rr(g, x0 - 7, y0 - 6, plateW + 14, plateH, 12); g.fill();
      const ss = Math.round(28 * K);
      this.text(g, String(w.score || 0), x0, y0 + ss * 0.55, ss, '#ffffff', 'left');
      const mult = w.mult || 1;
      if (mult > 1 || (w.combo || 0) >= 3) {
        g.font = '900 ' + ss + 'px ' + FONT; const sw = g.measureText(String(w.score || 0)).width;
        const mx = x0 + sw + 12 * K, col = ['#fff', '#fff', '#9ff0c0', '#5ec2ff', '#ff9de2'][mult];
        const pop = 1 + this.beatPulse * 0.06;
        this.text(g, (mult > 1 ? '×' + mult + '  ' : '') + w.combo + ' combo', mx, y0 + ss * 0.6, Math.round(15 * K * pop), col, 'left');
      }
      // groove meter (rocket fuel): red → yellow → green, blinks when low
      const gy = y0 + ss + 8 * K, bx = x0 + ic + 2, lowG = (w.groove || 0) < 0.25 && w.state !== 'dead';
      // low groove: the fuel can shakes on the beat and a "!" bubble shows (a shape cue, not only colour)
      const shk = lowG ? Math.sin(this.time * 40) * 2 * this.beatPulse : 0;
      if (!this.drawSprite(g, 'groove', x0 - 4 + shk, gy - ic / 2 + bh / 2, ic, ic)) { g.fillStyle = '#ff7f6e'; g.beginPath(); g.arc(x0 + ic / 2 - 4, gy + bh / 2, ic / 3, 0, TAU); g.fill(); }
      // low groove: the "!" bubble sits at the end of the meter, never over the score
      if (lowG) { const bx2 = bx + bw + 12 * K, by2 = gy + bh / 2; g.fillStyle = '#ffffff'; g.beginPath(); g.arc(bx2, by2, 8 * K, 0, TAU); g.fill(); this.text(g, '!', bx2, by2 + 1, Math.round(13 * K), '#e0384a', 'center', 'rgba(255,255,255,.9)'); }
      g.fillStyle = 'rgba(20,20,40,.55)'; this.rr(g, bx, gy, bw, bh, bh / 2); g.fill();
      const f = clamp(w.groove || 0, 0, 1), low = f < 0.25;
      if (f > 0) {
        const col = f < 0.25 ? '#ff6b6b' : f < 0.5 ? '#ffc53d' : '#6ee07a';
        g.fillStyle = low && Math.floor(this.time * 6) % 2 ? '#ffb0b0' : col; this.rr(g, bx, gy, Math.max(bh, bw * f), bh, bh / 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)'; this.rr(g, bx + 3, gy + 2, Math.max(bh - 6, bw * f - 6), bh * 0.3, bh * 0.15); g.fill();
      }
      // song progress: a thin bar across the top centre with the time-of-day name
      const right = this._hudBtn ? this._hudBtn.l : this.VW - 120, leftEdge = x0 + plateW + 18;
      let pw = Math.min(260 * K, right - leftEdge - 20), px0, py, lim = right;
      // narrow screens (phone portrait): no room between the plate and the buttons → floor name + bar go under the plate
      const under = pw < 90;
      if (under) {
        pw = plateW; px0 = x0; py = y0 - 6 + plateH + 12 * K; lim = this.VW - I.right - 8;
        g.fillStyle = 'rgba(30,25,60,.5)'; this.rr(g, x0 - 7, py - 10 * K, plateW + 14, 36 * K, 10); g.fill();
      } else { px0 = (leftEdge + right) / 2 - pw / 2; py = y0 + 8; }
      {
        const info = TOD_INFO[(w.tod || 0) % 4], lap = w.lap ? ' ' + (w.lap + 1) : '';
        this.text(g, info.name + lap, px0 + pw / 2, py + 4, Math.round(15 * K), '#ffffff');
        const by = py + 18 * K;
        g.fillStyle = 'rgba(20,20,40,.45)'; this.rr(g, px0, by, pw, 8 * K, 4 * K); g.fill();
        const p = clamp(w.progress || 0, 0, 1);
        if (p > 0) { g.fillStyle = info.color; this.rr(g, px0, by, Math.max(8 * K, pw * p), 8 * K, 4 * K); g.fill(); }
        // Pip call meter: little dots after the bar fill with the combo towards the next visit ("3 more for Pip!")
        const h = w.helper, need = (w.cfg && w.cfg.helperCombo) || 5;
        if (h && h.state === 'away' && w.state === 'playing') {
          const have = clamp(w._helperBase != null ? w.combo - w._helperBase : w.combo, 0, need), ic2 = 28 * K, dsp = 12 * K;
          const ix = px0 + pw + 8, iy = py - 4 - 4 * K;
          if (ix + ic2 + 6 * K + need * dsp < lim - 4) {
            g.globalAlpha = h.cool > 0 ? 0.4 : 1;
            this.drawSprite(g, 'pip_fly1', ix, iy, ic2, ic2 * 70 / 84);
            for (let i = 0; i < need; i++) { g.fillStyle = i < have ? '#ffd3a8' : 'rgba(20,20,40,.45)'; g.beginPath(); g.arc(ix + ic2 + 6 * K + i * dsp, iy + ic2 * 0.42, 4.5 * K, 0, TAU); g.fill(); }
            g.globalAlpha = 1;
          }
        }
      }
    }
    rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    drawBanner(g) {
      const b = this.banner; if (!b) return;
      const info = TOD_INFO[b.s % 4], k = b.t, a = k < 0.25 ? k / 0.25 : k > 1.8 ? (2.2 - k) / 0.4 : 1;
      const L = this.layout, lap = this.world && this.world.lap ? '  (round ' + (this.world.lap + 1) + ')' : '';
      const one = this.world && this.world.cfg && this.world.cfg.oneButton && (this.world.level || 0) === 0;
      const hint = one ? 'Tap anywhere when a gem lands on the drum!' : info.hint;
      const w = Math.min(this.VW - 40, 540), cy = Math.max(L.ins.top + L.hudH + 56, Math.min(this.VH * 0.27, L.coinY[0] - 120));
      const c = this.count, hasCount = !!c;
      g.globalAlpha = clamp(a, 0, 1);
      g.fillStyle = info.dark + 'd9'; this.rr(g, this.VW / 2 - w / 2, cy - 44, w, hasCount ? 112 : 92, 22); g.fill();
      g.strokeStyle = info.color; g.lineWidth = 4; g.stroke();
      this.text(g, info.floor + ' · ' + info.name + lap, this.VW / 2, cy - 12, this.VW < 700 ? 26 : 34, '#ffffff');
      if (hasCount) {   // the 3 · 2 · 1 · Go! count-in replaces the hint line
        const k = c.t / 0.7, sc = c.t < 0.15 ? easeOutBack(c.t / 0.15) : 1;
        g.globalAlpha = clamp(a, 0, 1) * clamp((1 - k) * 2.5, 0.25, 1);
        this.text(g, c.n === 0 ? 'Go!' : String(c.n), this.VW / 2, cy + 34, Math.max(1, Math.round(44 * sc)), c.n === 0 ? '#9ff0c0' : '#ffe9a8');
      } else this.text(g, hint, this.VW / 2, cy + 26, this.VW < 700 ? 16 : 19, '#ffe9a8');
      g.globalAlpha = 1;
    }
    drawDebug(g, w) {
      const L = this.layout, cfg = w.cfg || {}, ap = w.approach || 1.8, k = (L.xEnd - L.ringX) / ap;
      for (let lane = 0; lane < 2; lane++) {
        const y = L.coinY[lane];
        g.fillStyle = 'rgba(255,0,0,.15)'; g.fillRect(L.ringX - (cfg.earlyWin || 0.3) * k, y - 30, (cfg.earlyWin || 0.3) * k, 60);
        g.fillStyle = 'rgba(0,255,0,.18)'; g.fillRect(L.ringX - (cfg.goodWin || 0.15) * k, y - 26, 2 * (cfg.goodWin || 0.15) * k, 52);
        g.fillStyle = 'rgba(0,200,255,.3)'; g.fillRect(L.ringX - (cfg.perfectWin || 0.075) * k, y - 22, 2 * (cfg.perfectWin || 0.075) * k, 44);
      }
      g.strokeStyle = 'rgba(255,255,0,.7)'; g.beginPath(); g.moveTo(0, L.split); g.lineTo(this.VW, L.split); g.stroke();
      const st = DD.debug && DD.debug.getState && DD.debug.getState();
      if (st) { g.font = '12px monospace'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(JSON.stringify(st).slice(0, 160), 10, this.VH - 10); }
    }
  }
  DD.Renderer = Renderer;
})(window.DD = window.DD || {});
