/* KB.Renderer — side-view rhythm-stage renderer, mobile-first. The canvas fills the screen in portrait and landscape
 * (logical VW×VH, see computeView). The world is screen-independent (lanes + times); layout() maps it to the screen:
 * coins roll in from the right edge along two toy-train tracks and reach the catch rings in front of Kit on the beat.
 * The static toy room (wallpaper, window, shelf, floor, tracks, toys) is pre-rendered ONCE per time of day and size
 * into a device-pixel canvas and blitted pixel-exact, with a crossfade between levels. On top: rings, coins, pillows,
 * Kit and her rocket, Baron Fluff, weather particles, juicy effects and the HUD. */
(function (KB) {
  'use strict';
  const TOD_INFO = [
    { name: 'Dawn', color: '#ff9f8a', dark: '#6b3a5a', wall: '#f6d2c4', hint: 'Tap when a coin reaches the ring!' },
    { name: 'Noon', color: '#5ec2ff', dark: '#24527a', wall: '#cfe8f2', hint: 'Bop the pillows back on the beat!' },
    { name: 'Sunset', color: '#ff9a3d', dark: '#7a3a1e', wall: '#f5c99a', hint: 'Feel the groove, keep the combo!' },
    { name: 'Night', color: '#9d8cff', dark: '#22224e', wall: '#33386e', hint: 'Shhh… the night-light song!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const KIT = 96, COIN = 40, COIN_G = 44, PILLOW = [48, 36], FLUFF = [112, 140], RING = 72, FLAME = [26, 31];
  const COIN_LIFT = 18;          // coin centre sits this far above the rail line (it rolls ON the track)
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
      const dpr = window.devicePixelRatio || 1, touch = !!(KB.Game && KB.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear();
      this._hudK = clamp(0.8 / v.s, 1, 1.6);   // HUD scale so text stays ≥ ~20 CSS px on phones
      this.layout = this.computeLayout(v);
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 12) * S) + 'px'; hud.style.right = (v.left + (I.right + 12) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      this._measureHud();
      KB.Assets.setScale(this.px);
    }

    /* DESIGN §2: ring x (= kitX), lane rail lines, floor, window, boss box. All logical px. */
    computeLayout(v) {
      const VW = v.VW, VH = v.VH, I = v.ins, portrait = VW < VH;
      const hudH = (v.s < 0.75 ? 80 : HUD_H) * (portrait ? 1.1 : 1);
      const ringX = Math.round(I.left + Math.max(portrait ? 150 : 170, 0.2 * VW + 20));
      const laneY = portrait ? [Math.round(VH * 0.50), Math.round(VH * 0.68)] : [Math.round(VH * 0.50), Math.round(VH * 0.79)];
      // keep the lower lane above the bottom safe area, and the upper lane well below the HUD
      laneY[1] = Math.min(laneY[1], Math.round(VH - I.bottom - 70));
      laneY[0] = Math.max(laneY[0], Math.round(I.top + hudH + 150));
      const coinY = laneY.map(y => y - COIN_LIFT);
      const split = (coinY[0] + coinY[1]) / 2;
      const floorTop = laneY[1] - 46;
      const top = I.top + hudH;
      // window: centred to the right of Kit, between the HUD band and the shelf
      const room = laneY[0] - 40 - (top + 8);
      const ww = clamp(Math.min(room * 320 / 260, VW * (portrait ? 0.62 : 0.34)), 120, 420), wh = ww * 260 / 320;
      const win = { x: Math.round(clamp(VW * (portrait ? 0.5 : 0.58), ww / 2 + 10, VW - ww / 2 - 10) - ww / 2), y: Math.round(top + 8 + Math.max(0, (room - wh) * 0.45)), w: Math.round(ww), h: Math.round(wh) };
      // Baron Fluff hovers over the right part of the wall, above the upper track
      const boss = { x0: VW * 0.5, x1: VW - I.right - 70, y0: top + FLUFF[1] * 0.5, y1: Math.max(top + FLUFF[1] * 0.5 + 10, laneY[0] - 110) };
      return { VW, VH, s: v.s, ins: I, portrait, hudH, ringX, kitX: ringX - 56, laneY, coinY, split, floorTop, win, boss, xEnd: VW + 40 };
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
      this.banner = null; this.count = null; this.shake = 0; this.flash = 0; this.redFlash = 0;
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

    // ---------------- static toy room (pre-rendered per time of day + size) ----------------
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (KB.Assets._ver || 0) + '|' + (KB.Assets.hasCustom(KB.Assets.SLOTS[3 + b].id) ? 1 : 0) + '|' + (KB.Game && KB.Game.isTouch ? 1 : 0); }
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
      const A = KB.Assets, n = A.SEASONS[b], px = this.px, L = this.layout, info = TOD_INFO[b];
      const wall = A.img[n + '_wallpaper'];
      if (!wall && !A.restDone && b !== 0) return null;   // not loaded yet: caller falls back
      c = document.createElement('canvas'); c.width = Math.round(this.VW * px); c.height = Math.round(this.VH * px);
      const g = c.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.fillStyle = info.wall; g.fillRect(0, 0, c.width, c.height);
      const custom = A.custom[A.SLOTS[3 + b].id];
      if (custom) {   // player's picture covers the wall; calmed a little so coins read
        const k = Math.max(c.width / custom.width, c.height / custom.height);
        g.drawImage(custom, (c.width - custom.width * k) / 2, (c.height - custom.height * k) / 2, custom.width * k, custom.height * k);
        g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, 0, c.width, c.height);
      } else if (wall) {
        const t = document.createElement('canvas'); t.width = t.height = Math.max(8, Math.round(TILE * px));
        t.getContext('2d').drawImage(wall, 0, 0, t.width, t.height);
        g.fillStyle = g.createPattern(t, 'repeat'); g.fillRect(0, 0, c.width, c.height);
      }
      g.setTransform(px, 0, 0, px, 0, 0);
      // light shaft from the window (dawn / noon / sunset), a soft gradient on the wall
      const W = L.win;
      if (b < 3) {
        const col = ['255,214,190', '255,255,235', '255,190,120'][b];
        const gr = g.createLinearGradient(W.x, W.y, W.x - W.w * 0.3, L.floorTop + 60);
        gr.addColorStop(0, 'rgba(' + col + ',.35)'); gr.addColorStop(1, 'rgba(' + col + ',0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(W.x, W.y + W.h * 0.1); g.lineTo(W.x + W.w, W.y + W.h * 0.1);
        g.lineTo(W.x + W.w * 0.75, L.floorTop + 80); g.lineTo(W.x - W.w * 0.55, L.floorTop + 80); g.closePath(); g.fill();
      }
      // window with the sky of the time of day
      const win = A.img[n + '_window'];
      if (win) { g.save(); g.shadowColor = 'rgba(40,20,40,.25)'; g.shadowBlur = 12; g.shadowOffsetY = 4; g.drawImage(win, W.x, W.y, W.w, W.h); g.restore(); }
      else { g.fillStyle = ['#ffc6b0', '#9fd8ff', '#ffa65c', '#1d2357'][b]; g.fillRect(W.x, W.y, W.w, W.h); g.lineWidth = 8; g.strokeStyle = '#fff'; g.strokeRect(W.x, W.y, W.w, W.h); }
      // night-light star lamp on the wall at night, with a warm halo
      if (b === 3) {
        const nx = Math.max(L.ins.left + 60, L.kitX - 20), ny = Math.max(L.hudH + L.ins.top + 60, L.coinY[0] - 120), r = 120;
        const halo = g.createRadialGradient(nx, ny, 4, nx, ny, r);
        halo.addColorStop(0, 'rgba(255,230,150,.45)'); halo.addColorStop(1, 'rgba(255,230,150,0)');
        g.fillStyle = halo; g.fillRect(nx - r, ny - r, r * 2, r * 2);
        const nl = A.img.nightlight; if (nl) g.drawImage(nl, nx - 34, ny - 34, 68, 68);
      }
      // floor (from the skirting line down), then the shelf for the upper track
      const fl = A.img[n + '_floor'];
      g.fillStyle = ['#c98e64', '#d6a06a', '#b8743f', '#4b3f6b'][b]; g.fillRect(0, L.floorTop, this.VW, this.VH - L.floorTop);
      if (fl) for (let y = L.floorTop; y < this.VH; y += 190) { this._strip(g, fl, 512, 192, y, 192); }
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(0, L.floorTop - 6, this.VW, 6);   // skirting board
      g.fillStyle = 'rgba(60,30,30,.18)'; g.fillRect(0, L.floorTop, this.VW, 4);
      const shelfY = L.laneY[0] + 4;
      g.fillStyle = 'rgba(40,20,30,.16)'; g.fillRect(0, shelfY + 40, this.VW, 10);   // shelf shadow on the wall
      if (!this._strip(g, A.img.shelf, 512, 56, shelfY - 2, 56)) {
        g.fillStyle = '#b07a4f'; g.fillRect(0, shelfY + 8, this.VW, 26); g.fillStyle = '#8a5a35'; g.fillRect(0, shelfY + 30, this.VW, 8);
        g.fillStyle = 'rgba(90,55,35,.55)';   // fallback brackets (the shelf art has its own)
        for (let x = 120; x < this.VW; x += 320) { g.beginPath(); g.moveTo(x, shelfY + 30); g.lineTo(x + 26, shelfY + 30); g.lineTo(x + 6, shelfY + 64); g.lineTo(x, shelfY + 64); g.closePath(); g.fill(); }
      }
      // toys: one on the shelf left of Kit, a few on the floor (never inside the lanes' play band)
      const toy = (k, x, base, s, flip) => { const im = A.img['decor_' + k]; if (!im) return; g.save(); g.translate(x, base); if (flip) g.scale(-1, 1); g.drawImage(im, -s / 2, -s * 150 / 160, s, s); g.restore(); };
      const shelfToy = Math.min(84, L.kitX - L.ins.left - 52);
      if (shelfToy > 50) toy(0, L.ins.left + shelfToy / 2 + 6, shelfY - 6, shelfToy, false);
      // floor toys stand at the bottom edge and never reach up into the lower lane / Kit's flame
      const base = this.VH - L.ins.bottom - 4;
      const fs = clamp((base - (L.laneY[1] + 40)) / 0.94, 50, L.portrait ? 170 : 110);
      const kinds = [1, 3, 2, 4, 5];
      const nF = Math.max(2, Math.round(this.VW / 300));
      for (let i = 0; i < nF; i++) toy(kinds[(i + b) % kinds.length], L.ins.left + 70 + (this.VW - L.ins.left - L.ins.right - 140) * i / Math.max(1, nF - 1), base, fs, i % 2 === 1);
      // wall toy in portrait (lots of wall): a sailboat/robot on a little ledge under the window
      if (L.portrait && L.win.y + L.win.h + 150 < L.laneY[0] - 40) toy(5, this.VW * 0.2, L.win.y + L.win.h + 120, 110, false);
      // the two toy-train tracks
      for (const y of L.laneY) {
        g.fillStyle = 'rgba(40,20,30,.14)'; g.fillRect(0, y + 14, this.VW, 8);
        if (!this._strip(g, A.img.track, 512, 40, y - 20, 40)) { g.fillStyle = '#8a5a35'; for (let x = 0; x < this.VW; x += 22) g.fillRect(x, y - 8, 10, 22); g.fillStyle = '#9aa3b5'; g.fillRect(0, y - 6, this.VW, 4); g.fillRect(0, y + 6, this.VW, 4); }
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
            const [x, y] = this.laneXY(e.lane), gold = e.kind === 'gold', pillow = e.kind === 'pillow';
            this.ringFlash[e.lane] = 1;
            if (!pillow) {
              const col = gold ? '#ff9de2' : '#ffd23f';
              this.sparks(x, y, gold ? 16 : e.judge === 'perfect' ? 10 : 6, col);
              this.ring(x, y, col, 0.35, e.judge === 'perfect');
              this.fly.push({ k: 'coin', gold, x0: x, y0: y, t: 0, max: 0.22 });   // the coin pops into Kit's paw
            }
            const [word, col] = JUDGE[e.judge] || JUDGE.good;
            this.texts.push({ text: pillow ? 'Bop!' : word, x: x + 30, y: y - 58, life: 0, max: 0.6, size: e.judge === 'perfect' ? 26 : 22, color: pillow ? '#ffd1f0' : col });
            if (e.points) this.texts.push({ text: '+' + e.points, x: x + 96, y: y - 30, life: 0, max: 0.7, size: 17, color: '#ffffff' });
            if (gold && this.weather && this.weather.burst) this.weather.burst('sparkle', x, y, 6);
            break;
          }
          case 'miss': {
            const [x, y] = this.laneXY(e.lane);
            this.texts.push({ text: e.early ? 'Too early' : 'Miss', x: x + 30, y: y - 58, life: 0, max: 0.6, size: 20, color: '#c9c3d9' });
            break;
          }
          case 'empty': { const [x, y] = this.laneXY(e.lane < 0 ? (this.world.kit.lane || 0) : e.lane); this.puffs(x, y, 2, 'rgba(255,255,255,.6)'); break; }
          case 'tap': if (e.lane >= 0) this.ringFlash[e.lane] = Math.max(this.ringFlash[e.lane], 0.5); break;
          case 'multup': this.texts.push({ text: 'Combo ×' + e.mult + '!', x: this.VW / 2, y: L.hudH + L.ins.top + 70, life: 0, max: 1.3, size: 34, color: ['#fff', '#fff', '#9ff0c0', '#5ec2ff', '#ff9de2'][e.mult] || '#ffe14d', big: true }); this.confetti(this.VW / 2, L.hudH + 80, 14); break;
          case 'combobreak': break;
          case 'bossin': this.texts.push({ text: 'Here comes Baron Fluff!', x: this.VW / 2, y: L.hudH + L.ins.top + 70, life: 0, max: 1.8, size: 28, color: '#ffe0b0', big: true }); break;
          case 'throw': { const n = this._note(e.id); if (n) n._thrownAt = this.time; break; }
          case 'bounce': {
            const [x, y] = this.laneXY(e.lane), b = this.bossXY();
            this.fly.push({ k: 'pillowback', x0: x, y0: y, x1: b[0], y1: b[1] + 20, t: 0, max: 0.45, rot: 0 });
            this.texts.push({ text: 'Bop! +' + e.points, x: x + 40, y: y - 80, life: 0, max: 1, size: 26, color: '#ffd1f0' });
            this.puffs(x, y, 5, 'rgba(255,255,255,.85)');
            break;
          }
          case 'poof': {
            const L2 = this.layout, k = this.world.kit, ky = lerp(L2.coinY[0], L2.coinY[1], k.pos);
            this.shake = Math.max(this.shake, 0.18);
            this.puffs(L2.kitX, ky, 8, 'rgba(255,255,255,.9)');
            if (this.weather && this.weather.burst) this.weather.burst('feather', L2.kitX, ky, 6);
            this.texts.push({ text: 'Poof!', x: L2.kitX + 20, y: ky - 70, life: 0, max: 1, size: 30, color: '#ffffff' });
            break;
          }
          case 'count': this.count = { n: e.n, t: 0 }; break;
          case 'beat': this.beatPulse = 1; this._down = e.down; if (this.weather && this.weather.pulse) this.weather.pulse(); break;
          case 'groovelow': this.redFlash = 0.4; break;
          case 'songdone': this.texts.push({ text: 'Song complete!', x: this.VW / 2, y: this.VH * 0.3, life: 0, max: 2.4, size: 44, color: '#ffe14d', big: true }); this.confetti(this.VW / 2, this.VH * 0.3, 40); break;
          case 'cleared': if (e.bonus) this.texts.push({ text: 'Groove bonus +' + e.bonus, x: this.VW / 2, y: this.VH * 0.3 + 52, life: 0, max: 2.2, size: 24, color: '#ffffff', big: true }); break;
          case 'level': this.showBanner(e.tod); this.setSeason(e.tod); break;
          case 'dead': this.flash = 0.4; this.shake = 0.3; this.texts.push({ text: 'Out of groove!', x: this.VW / 2, y: this.VH * 0.32, life: 0, max: 2.5, size: 40, color: '#ffd1e6', big: true }); break;
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
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.2) this.banner = null; }
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
      for (const t of this.texts) { t.life += dt; if (!t.big) t.y -= 30 * dt; }
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
      this.drawRings(g, w);
      this.drawNotes(g, w, 0); this.drawNotes(g, w, 1);
      this.drawKit(g, w, al);
      this.drawFly(g);
      this.drawBoss(g, w, al);
      this.drawPillowsAir(g, w);
      this.drawParticles(g, 'front');
      this.drawFx(g);
      g.setTransform(px, 0, 0, px, 0, 0);
      if (this.redFlash > 0) { g.fillStyle = 'rgba(255,120,150,' + (this.redFlash * 0.2) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (this.flash > 0) { g.fillStyle = 'rgba(255,255,255,' + (this.flash * 0.5) + ')'; g.fillRect(0, 0, this.VW, this.VH); }
      if (mode !== 'title') { this.drawHud(g, w); this.drawBanner(g); this.drawCount(g); }
      this.drawTexts(g);
      if (this.debug) this.drawDebug(g, w);
    }

    spr(key, w, h) { return KB.Assets.sprite(key, w, h); }
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
      const touch = !!(KB.Game && KB.Game.isTouch), L = this.layout;
      if (!touch || (w.level || 0) > 1 || KB.Game.mode !== 'playing') return;
      const one = w.cfg && w.cfg.oneButton, x = this.VW - L.ins.right - 40, a = 0.55 + 0.25 * this.beatPulse;
      g.globalAlpha = a;
      if (one) this.drawSprite(g, 'tap_down', x - 26, L.split - 26, 52, 52);
      else { this.drawSprite(g, 'tap_up', x - 26, L.coinY[0] - 86, 52, 52); this.drawSprite(g, 'tap_down', x - 26, L.coinY[1] + 30, 52, 52); }
      g.globalAlpha = 1;
    }

    drawRings(g, w) {
      const L = this.layout, beatFrac = w.beat != null ? ((w.beat % 1) + 1) % 1 : 0;
      const pulse = (w.state === 'playing' || w.state === 'ready') ? Math.pow(1 - beatFrac, 3) : 0;
      // upcoming pillow targets: pulsing pink glow on that ring
      const warn = [0, 0];
      if (w.notes) for (const n of w.notes) if (n.kind === 'pillow' && n.state === 'live' && n.tThrow != null && w.songTime >= n.tThrow) warn[n.lane] = 1;
      for (let lane = 0; lane < 2; lane++) {
        const x = L.ringX, y = L.coinY[lane], s = RING * (1 + 0.08 * pulse + 0.12 * this.ringFlash[lane]);
        if (warn[lane]) { g.fillStyle = 'rgba(255,150,210,' + (0.25 + 0.2 * Math.sin(this.time * 12)) + ')'; g.beginPath(); g.arc(x, y, s * 0.62, 0, TAU); g.fill(); }
        g.fillStyle = 'rgba(255,255,255,' + (0.14 + 0.25 * this.ringFlash[lane]) + ')'; g.beginPath(); g.arc(x, y, s * 0.42, 0, TAU); g.fill();
        if (!this.drawSprite(g, 'ring', x - s / 2, y - s / 2, s, s)) { g.lineWidth = 6; g.strokeStyle = '#ff7f6e'; g.beginPath(); g.arc(x, y, s * 0.42, 0, TAU); g.stroke(); }
      }
    }

    drawCoin(g, x, y, gold, rot, scale, alpha) {
      const A = KB.Assets, glow = this.weather && this.weather.ambient ? this.weather.ambient.glow || 0 : 0;
      const s = (gold ? COIN_G : COIN) * (scale || 1);
      if (alpha != null) g.globalAlpha = alpha;
      if (glow > 0) {
        const r = s * 0.95, gr = g.createRadialGradient(x, y, 2, x, y, r);
        gr.addColorStop(0, 'rgba(255,230,120,' + (0.55 * glow) + ')'); gr.addColorStop(1, 'rgba(255,230,120,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
      }
      if (A.hasCustom('coin')) {
        const r = s / 2;
        g.beginPath(); g.arc(x, y, r + 2, 0, TAU); g.fillStyle = gold ? '#ff9de2' : '#ffd23f'; g.fill();
        g.lineWidth = 2.5; g.strokeStyle = 'rgba(90,60,20,.7)'; g.stroke();
        const [fw, fh] = A.fit('coin', s * 0.86, s * 0.86), c = this.spr('custom:coin', fw, fh);
        if (c) { g.save(); g.translate(x, y); g.rotate(rot || 0); g.drawImage(c, -fw / 2, -fh / 2, fw, fh); g.restore(); }
      } else {
        const c = this.spr(gold ? 'coin_gold' : 'coin', s, s);
        if (c) { g.save(); g.translate(x, y); g.rotate(rot || 0); g.drawImage(c, -s / 2, -s / 2, s, s); g.restore(); }
        else { g.fillStyle = gold ? '#ff9de2' : '#ffd23f'; g.beginPath(); g.arc(x, y, s / 2, 0, TAU); g.fill(); g.lineWidth = 3; g.strokeStyle = '#a66d00'; g.stroke(); }
      }
      g.globalAlpha = 1;
    }
    drawPillow(g, x, y, sx, sy, rot) {
      const A = KB.Assets, custom = A.hasCustom('pillow');
      const [w, h] = custom ? A.fit('pillow', 50, 42) : PILLOW;
      const c = this.spr(custom ? 'custom:pillow' : 'pillow', w, h);
      g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(sx, sy);
      if (c) g.drawImage(c, -w / 2, -h / 2, w, h); else { g.fillStyle = '#ffd1f0'; this.rr(g, -w / 2, -h / 2, w, h, 10); g.fill(); }
      g.restore();
    }

    drawNotes(g, w, lane) {
      const ns = w.notes; if (!ns) return;
      const L = this.layout, y0 = L.coinY[lane], rail = L.laneY[lane];
      for (const n of ns) {
        if (n.lane !== lane || n.kind === 'pillow') continue;
        if (n.state === 'hit') continue;   // flew into Kit's paw (fly fx)
        const x = this.noteX(n, w);
        if (x > L.xEnd + 30) break;        // sorted by time: everything after is further right
        if (x < -40) continue;
        let a = 1, y = y0;
        if (n.state === 'miss') {          // keeps rolling past Kit, fading and sinking a little behind the track
          const k = clamp((this.rt(w) - (n.tDone != null ? n.tDone : n.time)) / 0.5, 0, 1);
          a = 1 - k; if (a <= 0) continue; y += k * 8;
        }
        const gold = n.kind === 'gold', s = gold ? COIN_G : COIN;
        // shadow on the rail, then the coin rolling (rotation from the distance travelled)
        g.fillStyle = 'rgba(40,20,30,' + (0.18 * a) + ')'; g.beginPath(); g.ellipse(x, rail + 4, s * 0.38, 4, 0, 0, TAU); g.fill();
        const bob = n.state === 'live' ? Math.abs(Math.sin((this.rt(w) - n.time) / (w.beatLen || 0.6) * Math.PI)) * 3 : 0;
        this.drawCoin(g, x, y - bob, gold, x / (s / 2), 1, a);
        if (gold && n.state === 'live') { g.strokeStyle = 'rgba(255,157,226,' + (0.45 + 0.35 * Math.sin(this.time * 7)) + ')'; g.lineWidth = 3; g.beginPath(); g.arc(x, y - bob, s * 0.62, 0, TAU); g.stroke(); }
      }
    }

    bossXY() {
      const b = this.world && this.world.boss, B = this.layout.boss, al = this._al == null ? 1 : this._al;
      if (!b) return [this.VW - 120, B.y0];
      const x01 = lerp(b._px01 != null ? b._px01 : b.x01, b.x01, al), y01 = lerp(b._py01 != null ? b._py01 : b.y01, b.y01, al);
      return [lerp(B.x0, B.x1, x01 == null ? 1.3 : x01), lerp(B.y0, B.y1, y01 == null ? 0.5 : y01)];
    }
    /* Pillows in the air: thrown by Baron Fluff at tThrow, a lob that lands in the lane's ring exactly on the note's time. */
    drawPillowsAir(g, w) {
      const ns = w.notes; if (!ns) return;
      const L = this.layout;
      for (const n of ns) {
        const rt = this.rt(w);
        if (n.kind !== 'pillow' || n.state !== 'live' || n.tThrow == null || rt < n.tThrow) continue;
        const dur = Math.max(0.2, n.time - n.tThrow), k = clamp((rt - n.tThrow) / dur, 0, 1.15);
        const hand = this._handAt || this.bossXY();
        const x1 = L.ringX, y1 = L.coinY[n.lane];
        const x = lerp(hand[0], x1, k), arc = Math.min(160, Math.abs(hand[0] - x1) * 0.35);
        const y = lerp(hand[1], y1, k) - Math.sin(Math.min(1, k) * Math.PI) * arc;
        // dotted aim line along the remaining path (subtle) so the lane is readable
        if (k < 0.95) {
          g.fillStyle = 'rgba(255,255,255,.45)';
          for (let j = 1; j <= 5; j++) { const kk = k + (1 - k) * j / 6, xx = lerp(hand[0], x1, kk), yy = lerp(hand[1], y1, kk) - Math.sin(kk * Math.PI) * arc; g.beginPath(); g.arc(xx, yy, 2.5, 0, TAU); g.fill(); }
        }
        this.drawPillow(g, x, y, 1, 1, k * 5.5);
      }
    }

    drawKit(g, w, al) {
      const k = w.kit; if (!k) return;
      const A = KB.Assets, L = this.layout, t = this.time;
      const pos = lerp(k._ppos != null ? k._ppos : k.pos, k.pos, al);
      const vel = (k.pos - (k._ppos != null ? k._ppos : k.pos)) / ((w.cfg && w.cfg.step) || 1 / 120);
      const beatPh = w.beat != null ? w.beat : t * 1.5;
      const bob = Math.sin(beatPh * Math.PI) * 3;               // hovers in time with the music (one bob per beat)
      const x = L.kitX, y = lerp(L.coinY[0], L.coinY[1], pos) + bob;
      const tilt = clamp(vel * 0.012, -0.16, 0.16);
      // shadow on the floor (only meaningful over the lower lane / floor)
      const fy = L.laneY[1] + 10, d = fy - y;
      g.fillStyle = 'rgba(40,20,30,' + clamp(0.22 - d / 1600, 0.05, 0.22) + ')'; g.beginPath(); g.ellipse(x - 6, fy, 30 - d * 0.04, 6, 0, 0, TAU); g.fill();
      g.save(); g.translate(x, y); g.rotate(tilt + (k.dizzy > 0 ? Math.sin(t * 18) * 0.08 : 0));
      // rocket flame from the nozzle at (30,96) of the 120-box → relative to body centre (58,62)
      const s = KIT / 120, nx = (30 - 58) * s, ny = (96 - 62) * s;
      const fk = 1 + Math.abs(vel) * 0.01 + (k.reach < 0.15 ? 0.25 : 0) + Math.sin(t * 40) * 0.06;
      const fr = this.spr(Math.floor(t * 14) % 2 ? 'flame_1' : 'flame_2', FLAME[0], FLAME[1]);
      if (fr) g.drawImage(fr, nx - FLAME[0] / 2, ny - 2, FLAME[0], FLAME[1] * fk);
      else { g.fillStyle = '#ffb23f'; g.beginPath(); g.ellipse(nx, ny + 12 * fk, 7, 14 * fk, 0, 0, TAU); g.fill(); }
      if (A.hasCustom('hero')) {
        const [fw, fh] = A.fit('hero', 84, 84), c = this.spr('custom:hero', fw, fh);
        const sq = k.frame === 'reach' ? 1.08 : k.frame === 'happy' ? 1.05 : k.frame === 'dizzy' ? 0.92 : 1 + Math.sin(beatPh * TAU) * 0.02;
        if (c) { g.rotate(k.frame === 'reach' ? 0.12 : 0); g.drawImage(c, -fw / 2 * (2 - sq), -fh / 2 * sq, fw * (2 - sq), fh * sq); }
      } else {
        const c = this.spr('kit_' + (k.frame || 'idle'), KIT, KIT);
        if (c) g.drawImage(c, -58 * s, -62 * s, KIT, KIT);
        else { g.fillStyle = '#ffc98a'; g.beginPath(); g.arc(0, 0, 30, 0, TAU); g.fill(); g.fillStyle = '#e94b4b'; g.fillRect(-36, -10, 14, 30); }
      }
      g.restore();
      if (k.dizzy > 0) {
        for (let i = 0; i < 3; i++) {
          const a = t * 5 + i * TAU / 3, sx = x + Math.cos(a) * 22, sy = y - 52 + Math.sin(a) * 6;
          if (!this.drawSprite(g, 'p_sparkle', sx - 7, sy - 7, 14, 14)) { g.fillStyle = '#ffe14d'; g.beginPath(); g.arc(sx, sy, 4, 0, TAU); g.fill(); }
        }
      }
      this._kitXY = [x, y];
    }

    drawBoss(g, w, al) {
      const b = w.boss; this._handAt = null;
      if (!b || b.state === 'away') return;
      const [x, y] = this.bossXY(), t = this.time;
      const sway = Math.sin(t * 1.6) * 0.06, sc = FLUFF[0] / 160;
      // the basket centre is (80,160) in the 160×200 box
      const frame = b.frame === 'throw' ? 'throw' : b.frame === 'oof' ? 'oof' : 'idle';
      g.save(); g.translate(x, y); g.rotate(sway);
      const c = this.spr('fluff_' + frame, FLUFF[0], FLUFF[1]);
      if (c) g.drawImage(c, -80 * sc, -160 * sc, FLUFF[0], FLUFF[1]);
      else { g.fillStyle = '#ffb3c7'; g.beginPath(); g.arc(0, -100 * sc, 40, 0, TAU); g.fill(); g.fillStyle = '#b07a4f'; g.fillRect(-24, -20, 48, 34); }
      g.restore();
      // hand position (throw paw at (112,112)) rotated by the sway → where pillows start
      const hx = (112 - 80) * sc, hy = (112 - 160) * sc;
      this._handAt = [x + hx * Math.cos(sway) - hy * Math.sin(sway), y + hx * Math.sin(sway) + hy * Math.cos(sway)];
    }

    drawFly(g) {
      const L = this.layout, kxy = this._kitXY || [L.kitX, L.coinY[0]];
      for (const f of this.fly) {
        const k = clamp(f.t / f.max, 0, 1);
        if (f.k === 'coin') {   // into Kit's paw, shrinking
          const x = lerp(f.x0, kxy[0] + 30, k), y = lerp(f.y0, kxy[1], k) - Math.sin(k * Math.PI) * 18;
          this.drawCoin(g, x, y, f.gold, 0, 1 - k * 0.6, 1 - k * 0.5);
        } else if (f.k === 'pillowback') {
          const x = lerp(f.x0, f.x1, k), y = lerp(f.y0, f.y1, k) - Math.sin(k * Math.PI) * 120;
          this.drawPillow(g, x, y, 1 - k * 0.2, 1 - k * 0.2, -k * 9);
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
        const k = t.life / t.max, a = k > 0.7 ? (1 - k) / 0.3 : 1, sc = t.life < 0.18 ? easeOutBack(t.life / 0.18) : 1;
        g.globalAlpha = clamp(a, 0, 1);
        this.text(g, t.text, clamp(t.x, 80, this.VW - 80), Math.max(t.y, L.ins.top + L.hudH + t.size * 0.6), Math.max(1, Math.round(t.size * sc)), t.color);
      }
      g.globalAlpha = 1;
    }
    drawCount(g) {
      const c = this.count; if (!c) return;
      const L = this.layout, k = c.t / 0.7, s = (c.n === 0 ? 64 : 72) * (c.t < 0.15 ? easeOutBack(c.t / 0.15) : 1 - (k - 0.2) * 0.25);
      g.globalAlpha = clamp((1 - k) * 2, 0, 1);
      const y = Math.max(L.ins.top + L.hudH + 50, (L.coinY[0] - 110 + L.ins.top + L.hudH) / 2 + 20);
      this.text(g, c.n === 0 ? 'Go!' : String(c.n), L.ringX + (this.VW - L.ringX) * 0.35, y, Math.round(s), c.n === 0 ? '#9ff0c0' : '#ffffff');
      g.globalAlpha = 1;
    }
    drawHud(g, w) {
      const I = this.ins, K = this._hudK || 1, x0 = I.left + 14, y0 = I.top + 12;
      // left plate: score + combo multiplier, groove meter under it
      const bw = Math.round(150 * K), bh = Math.round(14 * K), ic = Math.round(28 * K);
      const plateW = ic + bw + 20 * K, plateH = Math.round(70 * K);
      g.fillStyle = 'rgba(30,25,60,.34)'; this.rr(g, x0 - 7, y0 - 6, plateW + 14, plateH, 12); g.fill();
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
      const gy = y0 + ss + 8 * K, bx = x0 + ic + 2;
      if (!this.drawSprite(g, 'groove', x0 - 4, gy - ic / 2 + bh / 2, ic, ic)) { g.fillStyle = '#ff7f6e'; g.beginPath(); g.arc(x0 + ic / 2 - 4, gy + bh / 2, ic / 3, 0, TAU); g.fill(); }
      g.fillStyle = 'rgba(20,20,40,.55)'; this.rr(g, bx, gy, bw, bh, bh / 2); g.fill();
      const f = clamp(w.groove || 0, 0, 1), low = f < 0.25;
      if (f > 0) {
        const col = f < 0.25 ? '#ff6b6b' : f < 0.5 ? '#ffc53d' : '#6ee07a';
        g.fillStyle = low && Math.floor(this.time * 6) % 2 ? '#ffb0b0' : col; this.rr(g, bx, gy, Math.max(bh, bw * f), bh, bh / 2); g.fill();
        g.fillStyle = 'rgba(255,255,255,.35)'; this.rr(g, bx + 3, gy + 2, Math.max(bh - 6, bw * f - 6), bh * 0.3, bh * 0.15); g.fill();
      }
      // song progress: a thin bar across the top centre with the time-of-day name
      const right = this._hudBtn ? this._hudBtn.l : this.VW - 120, leftEdge = x0 + plateW + 18;
      const pw = Math.min(260 * K, right - leftEdge - 20);
      if (pw > 60) {
        const px0 = (leftEdge + right) / 2 - pw / 2, py = y0 + 8;
        const info = TOD_INFO[(w.tod || 0) % 4], lap = w.lap ? ' ' + (w.lap + 1) : '';
        this.text(g, info.name + lap, px0 + pw / 2, py + 4, Math.round(15 * K), '#ffffff');
        const by = py + 18 * K;
        g.fillStyle = 'rgba(20,20,40,.45)'; this.rr(g, px0, by, pw, 8 * K, 4 * K); g.fill();
        const p = clamp(w.progress || 0, 0, 1);
        if (p > 0) { g.fillStyle = info.color; this.rr(g, px0, by, Math.max(8 * K, pw * p), 8 * K, 4 * K); g.fill(); }
        // boss marks on the progress bar would be nice, but the world does not expose the schedule; a blinking teddy
        // icon warns 3 s before a visit instead.
        const b = w.boss;
        if (b && b.state === 'away' && w.state === 'playing' && b.next < 3 && b.next > 0 && Math.floor(this.time * 4) % 2 === 0) {
          const c = this.spr('fluff_idle', 26 * K, 32 * K); if (c) g.drawImage(c, px0 + pw + 6, py - 6, 26 * K, 32 * K);
        }
      }
    }
    rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
    drawBanner(g) {
      const b = this.banner; if (!b) return;
      const info = TOD_INFO[b.s % 4], k = b.t, a = k < 0.25 ? k / 0.25 : k > 1.8 ? (2.2 - k) / 0.4 : 1;
      const L = this.layout, lap = this.world && this.world.lap ? '  (round ' + (this.world.lap + 1) + ')' : '';
      const one = this.world && this.world.cfg && this.world.cfg.oneButton && (this.world.level || 0) === 0;
      const hint = one ? 'Tap anywhere when a coin reaches the ring!' : info.hint;
      const w = Math.min(this.VW - 40, 540), cy = Math.max(L.ins.top + L.hudH + 56, Math.min(this.VH * 0.27, L.coinY[0] - 120));
      g.globalAlpha = clamp(a, 0, 1);
      g.fillStyle = info.dark + 'd9'; this.rr(g, this.VW / 2 - w / 2, cy - 44, w, 92, 22); g.fill();
      g.strokeStyle = info.color; g.lineWidth = 4; g.stroke();
      this.text(g, info.name + lap, this.VW / 2, cy - 12, this.VW < 700 ? 30 : 36, '#ffffff');
      this.text(g, hint, this.VW / 2, cy + 26, this.VW < 700 ? 16 : 19, '#ffe9a8');
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
      const st = KB.debug && KB.debug.getState && KB.debug.getState();
      if (st) { g.font = '12px monospace'; g.fillStyle = '#fff'; g.textAlign = 'left'; g.fillText(JSON.stringify(st).slice(0, 160), 10, this.VH - 10); }
    }
  }
  KB.Renderer = Renderer;
})(window.KB = window.KB || {});
