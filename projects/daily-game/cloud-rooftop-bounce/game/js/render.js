/* WRB.Renderer — Wisp's Rooftop Bounce on a 2D canvas (DESIGN §2, §5). A fixed camera maps the world field
 * (x 0…16 u, y up, roof line y 0, ceiling 8.6) to the screen: landscape unit = min(VH/9.1, VW/16.4), field centred,
 * roof line 0.4 u above the bottom edge. Per zone the sky, the far skyline and the near roof are pre-rendered once
 * into device-pixel canvases and blitted pixel-exact (the far layer slides with Wisp at whole device pixels, so it is
 * never resampled). A zone change is a "descend": the old scene slides up while the new one rises from below and
 * fades in. Everything that moves is lerped with world.alpha. Juice: block chips, popups, rings, sparkles, puffs,
 * a pearl trail, Wisp's squash and bob, the magnet ring and field, the aim guide, screen shake, a flash, a banner. */
(function (WRB) {
  'use strict';
  const PAL = {
    cloud:   { skyTop: '#141a4a', skyBottom: '#3b3f86', ink: '#2c2f5a', bar: '#eef0ff', glow: '#b9c8ff', ground: '#6f6aa8', ground2: '#3f3a78' },
    spires:  { skyTop: '#0d1640', skyBottom: '#25407a', ink: '#1d2550', bar: '#e8f0ff', glow: '#9fd8ff', ground: '#2f3866', ground2: '#1a2046' },
    gardens: { skyTop: '#1a1748', skyBottom: '#5a3e78', ink: '#2a2250', bar: '#f6eeff', glow: '#ffc48a', ground: '#3a3560', ground2: '#221f40' },
    lanes:   { skyTop: '#2a1a52', skyBottom: '#6a3c6e', ink: '#2e1f4e', bar: '#fff0f2', glow: '#ffb15a', ground: '#4a3552', ground2: '#2a1e34' }
  };
  const ZONE_INFO = [
    { key: 'cloud', name: 'Cloud Deck', hint: 'Slide to move Wisp · tap to serve!' },
    { key: 'spires', name: 'Skyscraper Spires', hint: 'Hit the pearl with Wisp’s edge to send it sideways!' },
    { key: 'gardens', name: 'Rooftop Gardens', hint: 'Catch the magnet: the pearl sticks, aim and tap!' },
    { key: 'lanes', name: 'Lantern Lane', hint: 'Every 10 gems give you a heart!' }
  ];
  const syncInfo = () => ZONE_INFO.forEach(z => { const p = PAL[z.key]; z.top = p.skyTop; z.bottom = p.skyBottom; z.pal = p; });
  syncInfo();
  const GEM_COL = ['#3fe6d4', '#ff86c8', '#b592ff'];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOut = t => 1 - Math.pow(1 - clamp(t, 0, 1), 3);
  const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
  const BALL = 0.6, GEM = 0.7, MAG = 0.8;
  // Wisp art (240×100): bounce line y 14 across x 6…234 (= paddle w), body bottom ≈ y 92, face centre (120, 56)
  const WISP_ART_W = 240, WISP_ART_H = 100, WISP_SPAN = 228, WISP_TOP = 14, WISP_BOTTOM = 92;
  const DESCEND_T = 2.3;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.texts = []; this.flyers = []; this.rings = []; this.trail = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#f4f2ff';
      this.vis = { cur: 0, prev: 0, t: 1, dur: DESCEND_T };
      this.banner = null; this.heartPulse = 0; this.gemPulse = 0; this.squash = 0; this.netFlash = 0; this.brickIn = 9; this.magPulse = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._spr = new Map();
      this.debug = /[?&]debug=1/.test(location.search);
      const mp = /[?&]maxpx=([\d.]+)/.exec(location.search); this.maxPx = mp ? +mp[1] : 0;
      this.resize();
    }

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
      const dpr = window.devicePixelRatio || 1, touch = !!(WRB.Game && WRB.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._spr.clear();
      this.portrait = v.VH > v.VW;
      if (this.portrait) { this.unit = v.VW / 16.4; this.groundPx = Math.round(v.VH - Math.max(0.4 * this.unit, 0.14 * v.VH)); }
      else { this.unit = Math.min(v.VH / 9.1, v.VW / 16.4); this.groundPx = Math.round(v.VH - 0.4 * this.unit); }
      this.ox = (v.VW - 16 * this.unit) / 2;
      this.k = this.unit / 60;   // the art was drawn for 60 px per unit
      // the letterbox (outside the canvas) takes the zone's own night colour, never black bars
      this._syncLetterbox();
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      const uc = Math.min(window.innerWidth / 100, window.innerHeight * 0.0178), btn = Math.max(44, uc * 4);
      this._btnL = v.VW - I.right - 8 - (2 * btn + 0.8 * uc) / S - 10;   // logical x where the pause / mute buttons begin
      if (hud) { hud.style.top = (v.top + (I.top + 5) * S) + 'px'; hud.style.right = (v.left + (I.right + 8) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      this._syncWeather();
      WRB.Assets.setScale(this.px);
      if (this.vis) this.prewarm((this.vis.cur + 1) % 4);
    }
    _syncLetterbox() {
      const p = PAL[ZONE_INFO[(this.vis ? this.vis.cur : 0) % 4].key];
      const st = document.getElementById('stage');
      if (st) st.style.background = 'linear-gradient(' + p.skyTop + ',' + p.skyBottom + ' 70%,' + p.ground2 + ')';
    }
    _syncWeather() { const wx = this.weather; if (wx) { if (wx.resize) wx.resize(this.VW, this.VH); if (wx.setGround) wx.setGround(this.groundPx); } }
    _measureHud() {}
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    /* screen px → world x (u) for the pointer */
    toWorldX(lx) { return (lx - this.ox) / this.unit; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.texts.length = 0; this.flyers.length = 0; this.rings.length = 0; this.trail.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heartPulse = 0; this.gemPulse = 0; this.squash = 0; this.netFlash = 0;
      this.brickIn = 0; this.hint = world && (world.level || 0) === 0; this._lastGem = 0;
      this._syncWeather();
    }
    /* switch the scene to zone i: instantly, or with the descend transition (unless one is already heading there) */
    setLevel(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1, dur: DESCEND_T }; this._syncLetterbox(); return; }
      if (i === this.vis.cur) return;
      this.descend(i, 1.4);
    }
    /* start floating down to zone i (called when a zone is cleared, so the 2.5 s 'clear' phase is the journey) */
    descend(i, dur) {
      i = ((i % 4) + 4) % 4;
      if (i === this.vis.cur) return;
      this.background(i);   // normally pre-warmed already; a cache hit costs nothing
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0, dur: dur || DESCEND_T };
      this._syncLetterbox();
      this.prewarm((i + 1) % 4);
    }
    showBanner(z) { this.banner = { s: z, t: 0, loop: this.world ? this.world.loop || 0 : 0 }; }

    // ---------------- mapping ----------------
    sx(x) { return this.ox + x * this.unit; }
    sy(y) { return this.groundPx - y * this.unit; }

    // ---------------- sprites ----------------
    spr(key, w, h) {
      const W = Math.max(4, Math.round(w)), H = Math.max(4, Math.round(h)), ck = key + '|' + W + '|' + H;
      let c = this._spr.get(ck);
      if (c) return c;
      c = WRB.Assets.sprite(key, W, H);
      if (c) { if (this._spr.size > 500) this._spr.clear(); this._spr.set(ck, c); }
      return c;
    }
    drawSpr(g, key, cx, cy, w, h, ax, ay, rot, sx, sy, alpha) {
      const c = this.spr(key, w, h); if (!c) return false;
      g.save();
      if (alpha != null && alpha < 1) g.globalAlpha *= alpha;
      g.translate(cx, cy);
      if (rot) g.rotate(rot);
      if (sx != null) g.scale(sx, sy);
      g.drawImage(c, -ax * w, -ay * h, w, h);
      g.restore();
      return true;
    }
    /* a custom picture fitted into a box (keeps its aspect), else the default sprite */
    drawSlot(g, slot, defKey, cx, cy, bw, bh, ax, ay, rot, sx, sy) {
      if (WRB.Assets.hasCustom(slot)) {
        const [w, h] = WRB.Assets.fit(slot, bw, bh);
        return this.drawSpr(g, 'custom:' + slot, cx, cy + (ay - 0.5) * (bh - h), w, h, ax, ay, rot, sx, sy);
      }
      return this.drawSpr(g, defKey, cx, cy, bw, bh, ax, ay, rot, sx, sy);
    }

    // ---------------- pre-rendered zone backgrounds (device px) ----------------
    _slot(b) { return WRB.Assets.SLOTS[3 + b].id; }
    _custom(b) { return WRB.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (WRB.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    /* three device-pixel canvases per zone: sky (opaque, full screen, with the ground fill), far (wider than the
     * screen by the parallax margin) and near (the roof Wisp floats above). World y 0 = near art y 150. */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = WRB.Assets, n = A.ZONES[b], pal = PAL[n], P = this.px, W = this.VW, H = this.VH, k = this.k, gy = this.groundPx;
      const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * P)); c.height = Math.max(1, Math.round(h * P)); const g = c.getContext('2d'); g.scale(P, P); g.imageSmoothingQuality = 'high'; return [c, g]; };
      const [sky, g] = mk(W, H);
      const gr = g.createLinearGradient(0, 0, 0, gy); gr.addColorStop(0, pal.skyTop); gr.addColorStop(1, pal.skyBottom);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const custom = this._custom(b) ? A.custom[this._slot(b)] : null;
      const cover = (gg, img, iw, ih, bottom) => { const s = Math.max(W / iw, bottom / ih); gg.drawImage(img, (W - iw * s) / 2, bottom - ih * s, iw * s, ih * s); };
      const groundFill = (gg, from) => { const g2 = gg.createLinearGradient(0, from, 0, H); g2.addColorStop(0, pal.ground); g2.addColorStop(1, pal.ground2); gg.fillStyle = g2; gg.fillRect(0, from, W, H - from); };
      // tiles at whole device pixels so the seams never show a hairline; one tile centred
      const tile = (gg, img, iw, ih, top, width, x0off) => {
        if (!img) return;
        const w = Math.round(iw * k * P) / P, h = ih * k;
        const x0 = Math.round((((width - w) / 2) % w - w + (x0off || 0)) * P) / P;
        for (let x = x0; x < width; x += w) gg.drawImage(img, x, top, w + 1 / P, h);
      };
      let far = null, near = null, farM = 0;
      if (custom) {
        g.filter = 'blur(2px) saturate(.85)'; cover(g, custom, custom.width, custom.height, gy + 10 * k); g.filter = 'none';
        g.fillStyle = 'rgba(20,22,60,0.5)'; g.fillRect(0, 0, W, gy);   // a night veil keeps a busy photo behind the play (Wisp and the pearl are white)
        groundFill(g, gy);
        g.fillStyle = 'rgba(220,225,255,0.35)'; g.fillRect(0, gy, W, 3 * k);
      } else {
        if (A.img[n + '_sky']) cover(g, A.img[n + '_sky'], 960, 540, Math.max(gy + 24 * k, H * 0.9));
        groundFill(g, gy + 40 * k);
        if (A.img[n + '_far']) {
          farM = Math.ceil(0.9 * this.unit);
          const fh = 300 * k, [fc, fg] = mk(W + 2 * farM, fh);
          tile(fg, A.img[n + '_far'], 960, 300, 0, W + 2 * farM, 0);
          far = { c: fc, top: gy - 56 * k - fh, m: farM };
        }
        if (A.img[n + '_near']) {
          const nh = 200 * k, [nc, ng] = mk(W, nh);
          tile(ng, A.img[n + '_near'], 960, 200, 0, W, 0);
          near = { c: nc, top: gy - 150 * k };
        }
      }
      bg = { sky, far, near, b };
      this._bg.set(key, bg);
      if (this._bg.size > 6) { const first = this._bg.keys().next().value; this._bg.delete(first); }
      return bg;
    }
    /* one zone scene at a vertical offset (logical px, rounded to device px) — every blit is 1:1 */
    drawScene(g, b, dy, alpha, par) {
      const bg = this.background(b), P = this.px, d = Math.round(dy * P);
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha;
      g.drawImage(bg.sky, 0, d);
      if (bg.far) g.drawImage(bg.far.c, Math.round((-bg.far.m + par) * P), Math.round(bg.far.top * P) + d);
      if (bg.near) g.drawImage(bg.near.c, 0, Math.round(bg.near.top * P) + d);
      if (d > 0) {   // the strip above a rising scene: its own sky colour
        g.fillStyle = PAL[ZONE_INFO[b].key].skyTop; g.fillRect(0, 0, this.canvas.width, d);
      }
      g.restore();
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world; if (!w) return;
      const u = this.unit;
      for (const e of evts) {
        switch (e.type) {
          case 'brick': {
            const X = this.sx(e.x), Y = this.sy(e.y), z = WRB.Assets.ZONES[(e.zone != null ? e.zone : w.zone) % 4];
            const n = e.broken ? 7 : 3;
            for (let i = 0; i < n; i++) this.flyers.push({ key: 'p_chip_' + z, x: X + (Math.random() - 0.5) * 0.9 * u, y: Y, vx: (Math.random() - 0.5) * 5 * u, vy: -(1.5 + Math.random() * 3) * u, g: 14 * u, rot: Math.random() * 6, spin: (Math.random() - 0.5) * 10, size: (0.22 + Math.random() * 0.14) * u, life: 0.9, t: 0 });
            if (e.broken) this.rings.push({ x: X, y: Y, r0: 0.2 * u, r1: 1.0 * u, t: 0, life: 0.35, col: e.kind === 'gem' ? GEM_COL[0] : e.kind === 'magnet' ? '#ff7a7a' : '#e8ecff' });
            if (e.broken && (e.kind === 'gem' || e.kind === 'magnet')) this.sparkle(X, Y, 6, '#ffffff');
            if (e.pts) this.popup(X, Y, '+' + e.pts, e.combo >= 3 ? '#ffe36a' : '#ffffff', e.combo >= 3 ? 1.15 : 0.9);
            break;
          }
          case 'combo': this.popup(this.sx(w.ball ? w.ball.x : 8), this.sy(w.ball ? w.ball.y + 0.8 : 4), 'Combo ×' + e.n + '!', '#ffcf3f', 1.3); break;
          case 'paddle': {
            this.squash = 1;
            const X = this.sx(e.x), Y = this.sy(e.y != null ? e.y : w.paddle.y);
            this.rings.push({ x: X, y: Y, r0: 0.1 * u, r1: 0.6 * u, t: 0, life: 0.25, col: '#dfe6ff' });
            this.puffs(X, Y + 0.1 * u, 2, 0.5);
            break;
          }
          case 'wall': this.rings.push({ x: this.sx(e.x), y: this.sy(e.y), r0: 0.05 * u, r1: 0.35 * u, t: 0, life: 0.2, col: '#ffffff' }); break;
          case 'gemSpawn': this.sparkle(this.sx(e.x), this.sy(e.y), 4, GEM_COL[e.color || 0]); break;
          case 'gemCatch': {
            this.gemPulse = 1; const c = GEM_COL[e.color || 0];
            this.popup(this.sx(e.x), this.sy(e.y + 0.6), '+' + (e.pts || 25), c, 1.1);
            this.sparkle(this.sx(e.x), this.sy(e.y), 9, c);
            this.rings.push({ x: this.sx(e.x), y: this.sy(e.y), r0: 0.1 * u, r1: 0.7 * u, t: 0, life: 0.3, col: c });
            break;
          }
          case 'gemMiss': this.puffs(this.sx(clamp(e.x, 0.5, 15.5)), this.sy(0.1), 2, 0.3); break;
          case 'magnetSpawn': this.sparkle(this.sx(e.x), this.sy(e.y), 6, '#ff9a9a'); break;
          case 'magnetGet':
            this.magPulse = 1; this.flash = 0.25; this.flashCol = '#ffd6dc';
            this.popup(this.sx(w.paddle.x), this.sy(3.4), 'Magnet!', '#ff8a8a', 1.35);
            this.rings.push({ x: this.sx(w.paddle.x), y: this.sy(0.8), r0: 0.4 * u, r1: 2.6 * u, t: 0, life: 0.55, col: '#ff8a8a' });
            this.rings.push({ x: this.sx(w.paddle.x), y: this.sy(0.8), r0: 0.2 * u, r1: 2.0 * u, t: -0.1, life: 0.5, col: '#8ab8ff' });
            break;
          case 'magnetMiss': this.puffs(this.sx(clamp(e.x, 0.5, 15.5)), this.sy(0.1), 3, 0.4); break;
          case 'magnetWarn': this.magPulse = 0.6; break;
          case 'magnetEnd': this.puffs(this.sx(w.paddle.x), this.sy(1.0), 3, 0.5); break;
          case 'stick': this.squash = 0.7; this.rings.push({ x: this.sx(e.x), y: this.sy(e.y), r0: 0.1 * u, r1: 0.55 * u, t: 0, life: 0.3, col: '#ff9a9a' }); this.sparkle(this.sx(e.x), this.sy(e.y), 4, '#ffd0d0'); break;
          case 'release': this.rings.push({ x: this.sx(e.x), y: this.sy(e.y), r0: 0.1 * u, r1: 0.8 * u, t: 0, life: 0.3, col: '#ffffff' }); this.sparkle(this.sx(e.x), this.sy(e.y), 5, '#dfe8ff'); break;
          case 'net': this.netFlash = 1; this.rings.push({ x: this.sx(e.x), y: this.sy(0.3), r0: 0.1 * u, r1: 1.2 * u, t: 0, life: 0.45, col: '#bfe0ff' }); this.sparkle(this.sx(e.x), this.sy(0.3), 8, '#dbeaff'); break;
          case 'ballLost': { const lx = this.sx(clamp(e.x, 0.5, 15.5)); this.puffs(lx, this.sy(0.05), 3, 0.6); this.rings.push({ x: lx, y: this.sy(0.05), r0: 0.1 * u, r1: 0.9 * u, t: 0, life: 0.4, col: '#ffd0d8' }); }
            this.shake = 0.45; this.popup(this.sx(clamp(e.x, 1, 15)), this.sy(1.9), 'Oops!', '#ffd0d8', 1.2); break;
          case 'heartLost': this.heartPulse = -1; break;
          case 'heartGain': this.heartPulse = 1; this.popup(this.sx(w.paddle.x), this.sy(2.9), '+1 ♥', '#ff8fae', 1.2); break;
          case 'levelClear':
            this.flash = 0.45; this.flashCol = '#eef0ff';
            for (let i = 0; i < 4; i++) this.sparkle(this.sx(2 + Math.random() * 12), this.sy(4 + Math.random() * 3), 8, '#ffe36a');
            this.descend(((e.zone != null ? e.zone : w.zone) + 1) % 4, DESCEND_T);
            break;
          case 'levelUp': this.brickIn = 0; this.showBanner(e.zone); this.hint = false; break;
        }
      }
    }
    popup(x, y, s, col, sc) {
      if (this.texts.length > 30) this.texts.shift();
      // never pile up: the same word again refreshes the recent one; a new popup near a recent one goes below it
      const u = this.unit, same = this.texts.find(t => t.s === s && t.t < 0.6);
      if (same) { same.t = 0; same.x = x; return; }
      for (let n = 0; n < 4; n++) {
        const hit = this.texts.some(t => t.t < 0.5 && Math.abs(t.x - x) < 1.8 * u && Math.abs(t.y - y) < 0.45 * u);
        if (!hit) break; y += 0.42 * u * (sc || 1) * 1.2;
      }
      this.texts.push({ x, y, s, col, sc: sc || 1, t: 0, life: 1.1 });
    }
    sparkle(x, y, n) {
      const u = this.unit;
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, v = (1.5 + Math.random() * 2.5) * u; this.flyers.push({ key: 'p_sparkle', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - u, g: 3 * u, drag: 2.5, rot: 0, spin: 3, size: (0.22 + Math.random() * 0.2) * u, life: 0.7, t: 0 }); }
    }
    /* little cloud puffs (Wisp's squash, misses): drift sideways, grow and fade */
    puffs(x, y, n, sc) {
      const u = this.unit;
      for (let i = 0; i < n * 2; i++) {
        const side = i % 2 ? 1 : -1;
        this.flyers.push({ key: 'p_puff', x: x + side * (0.2 + Math.random() * 0.3) * u, y, vx: side * (0.8 + Math.random() * 0.8) * u, vy: -(0.1 + Math.random() * 0.3) * u, g: 0, drag: 2.4, rot: 0, spin: 0, size: (0.3 + 0.2 * Math.random()) * u * (sc || 1) * 1.6, grow: 0.7, life: 0.55, t: 0 });
      }
    }

    update(dt) {
      this.time += dt;
      const v = this.vis;
      if (v.t < 1) { v.t = Math.min(1, v.t + dt / (v.dur || DESCEND_T)); if (v.t >= 1) this.trim(); }
      this.shake = Math.max(0, this.shake - dt * 1.6);
      this.flash = Math.max(0, this.flash - dt * 1.8);
      this.squash = Math.max(0, this.squash - dt * 4.5);
      this.netFlash = Math.max(0, this.netFlash - dt * 2);
      this.gemPulse = Math.max(0, this.gemPulse - dt * 3);
      this.magPulse = Math.max(0, this.magPulse - dt * 2);
      this.heartPulse = this.heartPulse > 0 ? Math.max(0, this.heartPulse - dt * 2) : Math.min(0, this.heartPulse + dt * 2);
      this.brickIn += dt;
      if (this.banner) { this.banner.t += dt; if (this.world && this.world.phase === 'play' && this.banner.t < 2.1) this.banner.t = 2.1; if (this.banner.t > 2.6) this.banner = null; }
      for (const f of this.flyers) {
        f.t += dt; f.vy += (f.g || 0) * dt;
        if (f.drag) { const d = Math.exp(-f.drag * dt); f.vx *= d; f.vy *= d; }
        f.x += f.vx * dt; f.y += f.vy * dt; f.rot += f.spin * dt;
        if (f.grow) f.size *= 1 + f.grow * dt;
      }
      this.flyers = this.flyers.filter(f => f.t < f.life);
      if (this.flyers.length > 160) this.flyers.splice(0, this.flyers.length - 160);
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter(t => t.t < t.life);
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter(r => r.t < r.life);
      const w = this.world;
      // descending: little cloud wisps stream up past Wisp so the fall reads
      if (v.t < 0.8 && w) {
        this._streamT = (this._streamT || 0) - dt;
        if (this._streamT <= 0) {
          this._streamT = 0.1; const u = this.unit;
          this.flyers.push({ key: 'p_puff', x: Math.random() * this.VW, y: this.VH + 0.5 * u, vx: 0, vy: -(9 + Math.random() * 5) * u, g: 0, rot: 0, spin: 0, size: (0.35 + Math.random() * 0.4) * u, life: 1.1, t: 0, fade: 0.3 });
        }
      }
      // pearl trail (world positions)
      if (w && w.ball && !w.ball.onPaddle) {
        const b = w.ball; this.trail.push([b.x, b.y]); if (this.trail.length > 10) this.trail.shift();
      } else this.trail.length = 0;
    }
    /* drop cached scenes that are neither on screen nor next */
    trim() {
      const keep = [this.vis.cur, (this.vis.cur + 1) % 4];
      for (const [k, bg] of this._bg) if (!keep.includes(bg.b)) this._bg.delete(k);
    }

    // ---------------- draw ----------------
    draw(mode) {
      const g = this.ctx, w = this.world, P = this.px, u = this.unit;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      const v = this.vis, par = w && w.paddle ? Math.round(-(lerp(w.paddle.px != null ? w.paddle.px : w.paddle.x, w.paddle.x, w.alpha || 0) - 8) * 0.1 * u * P) / P : 0;
      if (v.t < 1 && v.prev !== v.cur) {
        // descend: the old scene slides up and out, the new one rises from below and fades in
        const e = smooth(v.t), D = this.VH * 0.6;
        this.drawScene(g, v.prev, -e * D, 1, par);
        this.drawScene(g, v.cur, (1 - e) * D, smooth(v.t * 1.25), par);
      } else this.drawScene(g, v.cur, 0, 1, par);
      let shx = 0, shy = 0;
      if (this.shake > 0) { const s = this.shake * 0.14 * u; shx = Math.sin(this.time * 71) * s; shy = Math.cos(this.time * 53) * s; }
      g.setTransform(P, 0, 0, P, shx * P, shy * P);
      if (this.weather) this.drawParticles(g, 'back');
      if (w) {
        const a = w.alpha || 0;
        this.drawNet(g, w);
        this.drawBricks(g, w);
        this.drawGems(g, w, a);
        this.drawMagnets(g, w, a);
        this.drawAim(g, w, a);
        this.drawWisp(g, w, a);
        this.drawBall(g, w, a);
        this.drawFlyers(g);
        if (this.debug) this.drawDebug(g, w, a);
      }
      if (this.weather) this.drawParticles(g, 'front');
      g.setTransform(P, 0, 0, P, 0, 0);
      if (w) this.drawTexts(g);
      if (this.flash > 0) { g.save(); g.globalAlpha = Math.min(0.6, this.flash); g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.restore(); }
      if (w && mode !== 'title') {
        this.drawHud(g, w);
        this.drawHints(g, w, mode);
      }
      if (this.banner && mode !== 'title') this.drawBanner(g);
    }

    drawParticles(g, layer) {
      for (const p of this.weather.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const sx = (p.flipX ? -1 : 1) * (p.flap != null ? 0.35 + 0.65 * p.flap : 1);
        this.drawSpr(g, p.sprite, p.x, p.y, p.size, p.size * (p.sprite === 'p_shooting' ? 0.5 : 1), 0.5, 0.5, p.rot, sx, 1, p.alpha);
      }
    }

    /* the moonbeam net: a soft silver-blue beam just above the roof, one glowing bead per save left */
    drawNet(g, w) {
      const n = w.net ? w.net.saves : 0;
      if (n <= 0 && this.netFlash <= 0) return;
      const y = this.sy(0.3), x0 = this.sx(0.1), x1 = this.sx(15.9), u = this.unit, t = this.time;
      g.save();
      g.globalAlpha = n > 0 ? 0.7 + 0.3 * this.netFlash : this.netFlash;
      g.lineCap = 'round';
      const wave = x => y + Math.sin(x * 0.03 + t * 1.3) * 0.04 * u;
      const path = () => { g.beginPath(); for (let x = x0; x <= x1 + 1; x += 10) { const yy = wave(x); x === x0 ? g.moveTo(x, yy) : g.lineTo(x, yy); } };
      g.strokeStyle = 'rgba(160,200,255,0.22)'; g.lineWidth = 0.3 * u; path(); g.stroke();
      g.strokeStyle = 'rgba(205,225,255,0.55)'; g.lineWidth = 0.1 * u; path(); g.stroke();
      g.strokeStyle = '#eef4ff'; g.lineWidth = 0.03 * u; path(); g.stroke();
      // a shimmer travelling along the beam
      const sx = lerp(x0, x1, (t * 0.25) % 1);
      g.fillStyle = 'rgba(255,255,255,0.5)'; g.beginPath(); g.ellipse(sx, wave(sx), 0.5 * u, 0.06 * u, 0, 0, TAU); g.fill();
      for (let i = 0; i < Math.min(n, 8); i++) {
        const x = this.sx(8 + (i - (Math.min(n, 8) - 1) / 2) * 1.2), yy = wave(x);
        const r = (0.1 + 0.025 * Math.sin(t * 3 + i)) * u;
        g.fillStyle = 'rgba(190,215,255,0.35)'; g.beginPath(); g.arc(x, yy, r * 2.2, 0, TAU); g.fill();
        g.fillStyle = '#f2f6ff'; g.beginPath(); g.arc(x, yy, r, 0, TAU); g.fill();
      }
      g.restore();
    }

    brickKey(b, zone) {
      const z = WRB.Assets.ZONES[zone];
      if (b.kind === 'gem') return 'brick_gem';
      if (b.kind === 'magnet') return 'brick_magnet';
      if (b.kind === 'tough') return b.hp >= 2 ? 'brick_' + z + '_tough' : 'brick_' + z + '_crack';
      return 'brick_' + z;
    }
    drawBricks(g, w) {
      const u = this.unit, zone = w.zone % 4;
      for (const b of w.bricks) {
        if (!b.alive) continue;
        const bw = (b.w || 1.4) * u, bh = (b.h || 0.5) * u;
        let X = this.sx(b.x), Y = this.sy(b.y), al = 1, sc = 1;
        // the zone's blocks rise into place row by row (we came from above, so they come up from below)
        const row = b.row != null ? b.row : Math.round((8 - b.y) / 0.6), col = b.col != null ? b.col : Math.round((b.x - 1) / 1.55);
        const d = this.brickIn - (row * 0.07 + col * 0.025);
        if (d < 0.5) { const e = easeOut(d / 0.5); Y += (1 - e) * 1.2 * u; al = clamp(d / 0.25, 0, 1); }
        if (b.hitT != null && b.hitT < 0.3) sc = 1 + 0.12 * Math.sin(b.hitT * 30) * (1 - b.hitT / 0.3);
        if (al <= 0) continue;
        if (b.kind === 'magnet') {   // a soft red pulse ring so the special block reads
          const ph = (this.time * 0.8 + b.x * 0.1) % 1;
          g.save(); g.globalAlpha = 0.35 * (1 - ph) * al; g.strokeStyle = '#ff8080'; g.lineWidth = 0.05 * u;
          g.beginPath(); g.ellipse(X, Y, bw * (0.5 + 0.15 * ph), bh * (0.5 + 0.5 * ph), 0, 0, TAU); g.stroke(); g.restore();
        }
        this.drawSpr(g, this.brickKey(b, zone), X, Y, bw, bh, 0.5, 0.5, 0, sc, 2 - sc, al);
        if (b.kind === 'gem') {   // a soft glint sweeping across the glass
          const ph = (this.time * 0.5 + b.x * 0.13) % 1;
          if (ph < 0.25) { g.save(); g.globalAlpha = 0.5 * Math.sin(ph / 0.25 * Math.PI) * al; g.fillStyle = '#fff'; g.beginPath(); g.arc(X - bw / 2 + ph / 0.25 * bw, Y, 0.1 * u, 0, TAU); g.fill(); g.restore(); }
        }
      }
    }
    glow(g, x, y, r, col, al) {
      const c = this.spr('p_glow', r * 2, r * 2);
      g.save(); g.globalAlpha = al;
      if (c) { g.globalCompositeOperation = 'lighter'; g.drawImage(c, x - r, y - r, r * 2, r * 2); }
      else { g.fillStyle = col; g.beginPath(); g.arc(x, y, r * 0.6, 0, TAU); g.fill(); }
      g.restore();
      g.save(); g.globalAlpha = al * 0.55; g.fillStyle = col; g.beginPath(); g.arc(x, y, r * 0.55, 0, TAU); g.fill(); g.restore();
    }
    drawGems(g, w, a) {
      const u = this.unit, s = GEM * u;
      for (const m of (w.gems || [])) {
        const x = this.sx(lerp(m.px != null ? m.px : m.x, m.x, a)), y = this.sy(lerp(m.py != null ? m.py : m.y, m.y, a)), col = GEM_COL[m.color || 0];
        if (m.pulled) {   // pull streaks: short lines trailing behind the gem as it curves toward Wisp
          const sp = Math.hypot(m.vx || 0, m.vy || 0) || 1, dx = -(m.vx || 0) / sp, dy = (m.vy || 0) / sp;
          g.save(); g.strokeStyle = col; g.lineCap = 'round';
          for (let i = 0; i < 3; i++) {
            const off = (i - 1) * 0.14 * u, L = (0.5 + 0.12 * sp) * u * (i === 1 ? 1 : 0.7);
            const ox = -dy * off, oy = -dx * off;
            g.globalAlpha = 0.5 - Math.abs(i - 1) * 0.2; g.lineWidth = 0.06 * u;
            g.beginPath(); g.moveTo(x + ox + dx * 0.3 * u, y + oy + dy * 0.3 * u); g.lineTo(x + ox + dx * L, y + oy + dy * L); g.stroke();
          }
          g.restore();
        }
        this.glow(g, x, y, s * 0.8, col, 0.32 + 0.12 * Math.sin(this.time * 6 + m.id));
        // spin: a coin-like turn (x squeeze) plus a little tilt
        const spin = Math.cos((m.rot || 0) * 1.0), sxk = 0.35 + 0.65 * Math.abs(spin);
        if (WRB.Assets.hasCustom('gem')) this.drawSlot(g, 'gem', 'gem_0', x, y, s, s, 0.5, 0.5, -(m.rot || 0) * 0.3, sxk, 1);
        else this.drawSpr(g, 'gem_' + (m.color || 0), x, y, s, s, 0.5, 33 / 64, Math.sin((m.rot || 0) * 0.5) * 0.25, sxk, 1);
      }
    }
    drawMagnets(g, w, a) {
      const u = this.unit, s = MAG * u;
      for (const m of (w.powerups || [])) {
        const x = this.sx(lerp(m.px != null ? m.px : m.x, m.x, a)), y = this.sy(lerp(m.py != null ? m.py : m.y, m.y, a));
        const wob = m.wob != null ? m.wob : this.time * 5 + m.id;
        // a falling bubble: wobbles (one axis stretches while the other squeezes), shadow on the roof
        const k = clamp(1 - m.y / 8, 0.15, 1);
        g.save(); g.globalAlpha = 0.12 + 0.2 * k; g.fillStyle = '#10122e';
        g.beginPath(); g.ellipse(x, this.sy(0) - 0.03 * u, (0.2 + 0.25 * k) * u, (0.05 + 0.04 * k) * u, 0, 0, TAU); g.fill(); g.restore();
        this.glow(g, x, y, s * 0.85, '#ff9a9a', 0.28);
        this.drawSpr(g, 'magnet', x, y, s, s, 0.5, 0.5, Math.sin(wob * 0.7) * 0.15, 1 + 0.06 * Math.sin(wob), 1 - 0.06 * Math.sin(wob));
      }
    }
    _ballPos(w, a) { const b = w.ball; return [this.sx(lerp(b.px != null ? b.px : b.x, b.x, a)), this.sy(lerp(b.py != null ? b.py : b.y, b.y, a))]; }
    drawBall(g, w, a) {
      const b = w.ball; if (!b) return;
      const u = this.unit;
      let [x, y] = this._ballPos(w, a);
      if (b.onPaddle) {   // rides on Wisp: follow the drawn (interpolated) paddle exactly, plus the bob
        const p = w.paddle, px = this.sx(lerp(p.px != null ? p.px : p.x, p.x, a));
        x = px + (b.stuck ? (b.stuckOff || 0) : (b.x - p.x)) * u;
        y = this.sy(p.y + (b.r || 0.22)) + this._bob();
      }
      g.save();
      for (let i = 0; i < this.trail.length - 1; i++) {
        const [tx, ty] = this.trail[i], k = (i + 1) / this.trail.length;
        g.globalAlpha = 0.3 * k; g.fillStyle = '#cfe0ff';
        g.beginPath(); g.arc(this.sx(tx), this.sy(ty), (b.r || 0.22) * u * (0.4 + 0.6 * k), 0, TAU); g.fill();
      }
      g.restore();
      const s = BALL * u * (1 + 0.035 * Math.sin(this.time * 7));
      if (WRB.Assets.hasCustom('ball')) {
        this.glow(g, x, y, s * 0.75, '#bcd6ff', 0.5);
        this.drawSlot(g, 'ball', 'ball', x, y, s * 0.8, s * 0.8, 0.5, 0.5, this.time * 2);
      } else this.drawSpr(g, 'ball', x, y, s, s, 0.5, 0.5);
    }
    _bob() { return Math.sin(this.time * 2.4) * 0.04 * this.unit; }
    /* stuck pearl: a dotted guide in the launch direction (same angle rule as World._release),
     * bouncing off the walls, fading out after ~5 u */
    drawAim(g, w, a) {
      const b = w.ball, p = w.paddle;
      if (!b || !b.stuck || !p) return;
      const u = this.unit, C = (WRB.World && WRB.World.CONFIG) || {}, MAXA = C.MAX_ANGLE || 60;
      const off = clamp((b.stuckOff || 0) / (p.w / 2 + (b.r || 0.22)), -1, 1);   // the world's release rule (World._release)
      const ang = clamp(off * MAXA + clamp((p.vx || 0) * (C.NUDGE_K || 0), -(C.NUDGE_MAX || 0), C.NUDGE_MAX || 0), -MAXA, MAXA) * Math.PI / 180;
      let x = lerp(p.px != null ? p.px : p.x, p.x, a) + (b.stuckOff || 0), y = p.y + (b.r || 0.22);
      let dx = Math.sin(ang), dy = Math.cos(ang);
      const step = 0.42, n = 13, ph = (this.time * 2.5) % 1;
      g.save();
      for (let i = 0; i < n; i++) {
        const s = (i + ph) * step + 0.35;
        let px = x + dx * s, py = y + dy * s;
        if (px < 0.2) px = 0.4 - px; if (px > 15.8) px = 31.6 - px;   // mirror at the walls
        if (py > 8.4) break;
        const k = 1 - i / n;
        g.globalAlpha = (0.35 + 0.65 * k) * (i === 0 ? ph : 1);
        g.fillStyle = i % 2 ? '#ffd0d6' : '#ffffff';
        g.beginPath(); g.arc(this.sx(px), this.sy(py), (0.09 + 0.04 * k) * u, 0, TAU); g.fill();
      }
      // a soft arrow-head at the first dots
      const tx = this.sx(x + dx * 1.2), ty = this.sy(y + dy * 1.2), r = 0.2 * u, an = Math.atan2(-dy, dx);
      g.globalAlpha = 0.8; g.fillStyle = '#ffffff';
      g.beginPath(); g.moveTo(tx + Math.cos(an) * r, ty + Math.sin(an) * r); g.lineTo(tx + Math.cos(an + 2.5) * r, ty + Math.sin(an + 2.5) * r); g.lineTo(tx + Math.cos(an - 2.5) * r, ty + Math.sin(an - 2.5) * r); g.closePath(); g.fill();
      g.restore();
    }
    /* Wisp IS the paddle. Art bounce line (y 14, x 6…234) sits on the physics line, uniform scale = w / 228. */
    drawWisp(g, w, a) {
      const p = w.paddle, u = this.unit;
      const x = this.sx(lerp(p.px != null ? p.px : p.x, p.x, a)), lineY = this.sy(p.y);
      const k = p.w * u / WISP_SPAN, W = WISP_ART_W * k, H = WISP_ART_H * k;
      const bob = this._bob(), sq = Math.max(this.squash, p.squash || 0);
      const lean = clamp(-(p.vx || 0) * 0.006, -0.05, 0.05);
      // soft shadow on the roof line: smaller and darker as Wisp bobs down
      const roof = this.sy(0), hb = (WISP_BOTTOM - WISP_TOP) * k;
      g.save(); g.globalAlpha = 0.28 + 0.06 * (bob / (0.04 * u)); g.fillStyle = '#0c0d2a';
      g.beginPath(); g.ellipse(x, roof - 0.03 * u, p.w * u * 0.4, 0.09 * u, 0, 0, TAU); g.fill(); g.restore();
      const mag = w.magnet && w.magnet.t > 0;
      if (mag) this.drawMagnetField(g, w, x, lineY + bob, k);
      // squash: anchored at the body bottom; wider and flatter for a moment after a hit, then springs back
      const sxk = 1 + 0.09 * sq, syk = 1 - 0.15 * sq + 0.01 * Math.sin(this.time * 3);
      const bottomY = lineY + hb + bob, ay = WISP_BOTTOM / WISP_ART_H;
      if (WRB.Assets.hasCustom('hero')) {
        this.drawCloud(g, x, bottomY, p.w * u, hb, sxk, syk, lean);
        const bw = Math.min(p.w * 0.55, 2.0) * u, bh = 1.15 * u;
        g.save(); g.translate(x, lineY + hb * 0.55 + bob); g.rotate(lean); g.scale(sxk, syk);
        this.drawSlot(g, 'hero', 'wisp_idle', 0, 0, bw, bh, 0.5, 1, 0);
        g.restore();
      } else {
        const face = p.face || 'idle';
        const key = WRB.Assets.img['wisp_' + face] ? 'wisp_' + face : 'wisp_idle';
        this.drawSpr(g, key, x, bottomY, W, H, 0.5, ay, lean, sxk, syk);
      }
      if (mag) this.drawMagnetRing(g, w, x, lineY + hb * 0.5 + bob, p.w * u, hb);
    }
    /* a plain procedural cloud for a custom Wisp picture: overlapping puffs, lilac shade, white top */
    drawCloud(g, x, bottom, wpx, h, sxk, syk, rot) {
      g.save(); g.translate(x, bottom); g.rotate(rot || 0); g.scale(sxk, syk);
      const r = h * 0.55, puffs = [[-0.42, 0.45, 0.65], [-0.2, 0.62, 0.9], [0.05, 0.7, 1.0], [0.28, 0.6, 0.85], [0.45, 0.42, 0.6]];
      g.fillStyle = '#b9b2e8';
      g.beginPath(); for (const [fx, fy, fr] of puffs) { g.moveTo(fx * wpx + fr * r, -fy * h + 0.06 * h); g.arc(fx * wpx, -fy * h + 0.06 * h, fr * r, 0, TAU); }
      g.rect(-wpx * 0.45, -h * 0.45, wpx * 0.9, h * 0.45); g.fill();
      g.fillStyle = '#f4f3ff';
      g.beginPath(); for (const [fx, fy, fr] of puffs) { g.moveTo(fx * wpx + fr * r * 0.92, -fy * h); g.arc(fx * wpx, -fy * h, fr * r * 0.92, 0, TAU); }
      g.rect(-wpx * 0.44, -h * 0.5, wpx * 0.88, h * 0.4); g.fill();
      g.restore();
    }
    /* magnet field: arcs rising off Wisp's top and fading (pulls things in), red/blue */
    drawMagnetField(g, w, x, y, k) {
      const u = this.unit, t = this.time, R0 = w.paddle.w * u * 0.45;
      g.save(); g.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const ph = 1 - ((t * 0.9 + i / 3) % 1);   // inward: arcs shrink toward Wisp
        const r = R0 + ph * 2.2 * u;
        g.globalAlpha = 0.28 * Math.sin(ph * Math.PI);
        g.strokeStyle = i % 2 ? '#8ab8ff' : '#ff8a8a'; g.lineWidth = 0.06 * u;
        g.setLineDash([0.22 * u, 0.2 * u]);
        g.beginPath(); g.ellipse(x, y, r, r * 0.62, 0, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
      }
      g.restore();
    }
    /* magnet timer: an ellipse ring around Wisp that empties clockwise; blinks in the last 2 s */
    drawMagnetRing(g, w, x, cy, wpx, h) {
      const u = this.unit, m = w.magnet, f = clamp(m.t / (m.max || 10), 0, 1);
      const warn = m.t < 2 ? 0.55 + 0.45 * Math.sin(this.time * 18) : 1;
      const rx = wpx * 0.5 + 0.22 * u, ry = h * 0.5 + 0.26 * u;
      g.save(); g.lineCap = 'round';
      g.globalAlpha = 0.22; g.strokeStyle = '#ffffff'; g.lineWidth = 0.09 * u;
      g.beginPath(); g.ellipse(x, cy, rx, ry, 0, 0, TAU); g.stroke();
      g.globalAlpha = 0.9 * warn; g.lineWidth = (0.09 + 0.05 * this.magPulse) * u;
      const a0 = -Math.PI / 2, a1 = a0 + TAU * f;
      const grd = g.createLinearGradient(x - rx, 0, x + rx, 0); grd.addColorStop(0, '#ff6b6b'); grd.addColorStop(1, '#6ba6ff');
      g.strokeStyle = grd;
      g.beginPath(); g.ellipse(x, cy, rx, ry, 0, a0, a1); g.stroke();
      // a bright bead at the moving end
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(x + Math.cos(a1) * rx, cy + Math.sin(a1) * ry, 0.09 * u, 0, TAU); g.fill();
      g.restore();
    }
    drawFlyers(g) {
      for (const f of this.flyers) {
        const al = clamp(1 - f.t / f.life, 0, 1) * (f.t < 0.06 ? f.t / 0.06 : 1) * (f.fade || 1);
        if (f.key === 'p_sparkle') { g.save(); g.globalCompositeOperation = 'lighter'; }   // glow, never grey dust
        this.drawSpr(g, f.key, f.x, f.y, f.size, f.size, 0.5, 0.5, f.rot, 1, 1, al);
        if (f.key === 'p_sparkle') g.restore();
      }
      for (const r of this.rings) {
        if (r.t < 0) continue;
        const k = r.t / r.life;
        g.save(); g.globalAlpha = (1 - k) * 0.8; g.strokeStyle = r.col; g.lineWidth = Math.max(1, 0.06 * this.unit * (1 - k));
        g.beginPath(); g.arc(r.x, r.y, lerp(r.r0, r.r1, easeOut(k)), 0, TAU); g.stroke(); g.restore();
      }
    }
    drawTexts(g) {
      const u = this.unit;
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const k = t.t / t.life, pop = k < 0.15 ? 0.6 + 0.4 * easeOut(k / 0.15) * 1.15 : 1;
        const size = 0.42 * u * t.sc * pop;
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = '900 ' + size.toFixed(1) + 'px ' + FONT;
        const y = t.y - easeOut(k) * 0.8 * u;
        g.lineWidth = size * 0.22; g.strokeStyle = 'rgba(28,26,72,0.92)'; g.strokeText(t.s, t.x, y);
        g.fillStyle = t.col; g.fillText(t.s, t.x, y);
      }
      g.restore();
    }

    pill(g, x, y, w, h, col) {
      const r = h / 2;
      g.beginPath(); g.moveTo(x + r, y); g.lineTo(x + w - r, y); g.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2); g.lineTo(x + r, y + h); g.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); g.closePath();
      g.fillStyle = col; g.fill();
    }
    /* HUD: [score | hearts | gem n/10 | magnet timer] pill top-left, the zone name in a dark pill right of it */
    drawHud(g, w) {
      const pal = PAL[WRB.Assets.ZONES[w.zone % 4]], I = this.ins;
      // bigger on phones (undo the small CSS scale), but the pill never reaches down over the top brick row:
      // its height is capped to the free band, and the contents may grow up to 1.2× inside it
      const s0 = Math.max(0.8, Math.min(1.15, this.VH / 540)) * (this.portrait ? 1.25 : Math.max(1, Math.min(1.4, 0.95 / (this.cssScale || 1))));
      const x0 = 10 + I.left, y0 = 8 + I.top;
      let top = 0; for (const b of w.bricks) top = Math.max(top, b.y + (b.h || 0.5) / 2);
      const h = 34 * Math.min(s0, Math.max(0.8, top ? (this.sy(top) - 3 - y0) / 34 : s0)), s = Math.min(s0, h / 34 * 1.2);
      g.save();
      g.font = '900 ' + (22 * s).toFixed(1) + 'px ' + FONT; g.textBaseline = 'middle';
      const sc = String(w.score), tw = g.measureText(sc).width;
      const shown = Math.min(w.maxHearts, Math.max(3, w.hearts + 1));
      const heartsW = shown * 22 * s, gemW = 76 * s, mag = w.magnet && w.magnet.t > 0, magW = mag ? 34 * s : 0;
      const W = 18 * s + tw + 14 * s + heartsW + gemW + magW;
      const zn = ZONE_INFO[w.zone % 4].name + ((w.loop || 0) > 0 ? ' · ' + (w.loop + 1) : '');
      g.font = '800 ' + (14 * s).toFixed(1) + 'px ' + FONT;
      const zw = g.measureText(zn).width + 20 * s, zh = Math.min(26 * s, h);
      const zRight = x0 + W + 8 * s + zw < (this._btnL || this.VW);   // the zone name fits beside the main pill
      const zx = zRight ? x0 + W + 8 * s : x0 + 6 * s, zy = zRight ? y0 + (h - zh) / 2 : y0 + h + 4 * s;
      g.font = '900 ' + (22 * s).toFixed(1) + 'px ' + FONT;
      this._hudW = zRight ? zx + zw : x0 + W;
      // fade both pills when the pearl flies behind them, so a child never loses sight of it
      let al = 0.88;
      if (w.ball) { const [bx, by] = this._ballPos(w, w.alpha || 0); if (bx < Math.max(x0 + W, zx + zw) + 20 && by < (zRight ? y0 + h : zy + zh) + 16) al = 0.4; }
      this._hudAl = this._hudAl == null ? al : lerp(this._hudAl, al, 0.25);
      g.globalAlpha = this._hudAl;
      this.pill(g, x0, y0, W, h, pal.bar);
      g.fillStyle = '#2c2f5a'; g.fillText(sc, x0 + 14 * s, y0 + h / 2 + 1);
      let hx = x0 + 14 * s + tw + 14 * s;
      for (let i = 0; i < shown; i++) {
        const full = i < w.hearts;
        let sz = 20 * s;
        if (this.heartPulse > 0 && i === w.hearts - 1) sz *= 1 + 0.4 * this.heartPulse;
        if (this.heartPulse < 0 && i === w.hearts) sz *= 1 + 0.4 * -this.heartPulse;
        const es = full ? sz : sz * 0.78;
        this.drawSpr(g, full ? 'heart' : 'heart_empty', hx + 10 * s, y0 + h / 2, es, es, 0.5, 0.5, 0, 1, 1, full ? 1 : 0.55);
        hx += 22 * s;
      }
      hx += 6 * s;
      const ss = 22 * s * (1 + 0.35 * this.gemPulse);
      if (WRB.Assets.hasCustom('gem')) this.drawSlot(g, 'gem', 'gem_hud', hx + 10 * s, y0 + h / 2, ss, ss, 0.5, 0.5, 0);
      else this.drawSpr(g, 'gem_hud', hx + 10 * s, y0 + h / 2, ss, ss, 0.5, 0.5);
      g.font = '900 ' + (17 * s).toFixed(1) + 'px ' + FONT; g.fillStyle = '#2c2f5a';
      g.fillText(String((w.gemCount || 0) % 10) + '/10', hx + 23 * s, y0 + h / 2 + 1);
      if (mag) {   // a small magnet with a pie that empties
        const cx = hx + gemW + 12 * s, cy = y0 + h / 2, r = 13 * s, f = clamp(w.magnet.t / (w.magnet.max || 10), 0, 1);
        g.fillStyle = 'rgba(255,107,107,0.28)'; g.beginPath(); g.moveTo(cx, cy); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + TAU * f); g.closePath(); g.fill();
        if (w.magnet.t < 2) g.globalAlpha *= 0.55 + 0.45 * Math.sin(this.time * 18);
        this.drawSpr(g, 'magnet', cx, cy, 24 * s, 24 * s, 0.5, 0.5);
      }
      // zone name: a smaller dark pill on the same row, right of the first (shares its fade)
      g.globalAlpha = this._hudAl * 0.9;
      g.font = '800 ' + (14 * s).toFixed(1) + 'px ' + FONT;
      this.pill(g, zx, zy, zw, zh, 'rgba(20,22,60,0.62)');
      g.fillStyle = '#e6e9ff'; g.fillText(zn, zx + 10 * s, zy + zh / 2 + 1);
      g.restore();
    }
    drawHints(g, w, mode) {
      if (mode !== 'playing') return;
      const u = this.unit, touch = !!(WRB.Game && WRB.Game.isTouch);
      const say = (msg, x, y, size, col) => {
        g.font = '900 ' + size.toFixed(1) + 'px ' + FONT;
        g.lineWidth = size * 0.24; g.strokeStyle = 'rgba(24,22,64,0.88)'; g.strokeText(msg, x, y);
        g.fillStyle = col; g.fillText(msg, x, y);
      };
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const size = 0.4 * u * (this.portrait ? 1.2 : 1), bob = Math.sin(this.time * 4) * 0.08 * u;
      const x = clamp(this.sx(w.paddle.x), 3 * u, this.VW - 3 * u), y = this.sy(w.paddle.y + 1.35);
      if (w.phase === 'serve' && w.ball && !this.banner) {
        if ((w.gems || []).length) g.globalAlpha = 0.75;   // see-through while gems fall behind it
        say(touch ? 'Tap to serve!' : 'Click or Space to serve!', x, y + bob, size, '#ffffff');
        if (this.hint) say(touch ? '← slide to move Wisp →' : '← move the mouse or use the arrow keys →', clamp(x, 4.2 * u, this.VW - 4.2 * u), y + bob - size * 1.15, size * 0.75, '#fff3c8');
      } else if (w.ball && w.ball.stuck) {
        const side = (w.ball.stuckOff || 0) >= 0 ? -1 : 1;   // on the side away from the aim guide
        say(touch ? 'Slide to aim · tap to let go!' : 'Aim · click or Space to let go!', clamp(x + side * 3.4 * u, 3 * u, this.VW - 3 * u), this.sy(w.paddle.y + 1.0) + bob, size * 0.85, '#ffd6dc');
      }
      g.restore();
      if (w.phase === 'clear') {
        const t = this.vis.t < 1 ? this.vis.t : 1, k = clamp(t / 0.12, 0, 1) * clamp((1 - t) / 0.15 + 0.15, 0, 1);
        this.bigText(g, 'Zone cleared!', this.VW / 2, this.sy(5.0), 0.85 * u * (0.6 + 0.4 * easeOut(k)), '#ffe36a', k);
        this.bigText(g, 'Floating down…', this.VW / 2, this.sy(4.1), 0.45 * u, '#dfe6ff', k * 0.95);
      }
    }
    bigText(g, s, x, y, size, col, al) {
      g.save(); g.globalAlpha = clamp(al, 0, 1); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.font = '900 ' + size.toFixed(1) + 'px ' + FONT;
      g.lineWidth = size * 0.2; g.strokeStyle = '#1e1c52'; g.strokeText(s, x, y);
      g.fillStyle = col; g.fillText(s, x, y); g.restore();
    }
    drawBanner(g) {
      const b = this.banner, z = ZONE_INFO[b.s % 4], u = this.unit, t = b.t;
      const al = t < 0.3 ? t / 0.3 : t > 2.1 ? Math.max(0, (2.6 - t) / 0.5) : 1;
      const y = this.sy(3.0);
      const name = z.name + (b.loop > 0 ? ' · round ' + (b.loop + 1) : '');
      const hint = b.s % 4 === 0 && !(WRB.Game && WRB.Game.isTouch) ? 'Move the mouse · click to serve!' : z.hint;
      this.bigText(g, name, this.VW / 2, y, 0.75 * u * (this.portrait ? 1.1 : 1), '#ffffff', al);
      g.save(); g.globalAlpha = al * 0.95; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const s2 = 0.34 * u * (this.portrait ? 1.15 : 1);
      g.font = '800 ' + s2.toFixed(1) + 'px ' + FONT; g.lineWidth = s2 * 0.22; g.strokeStyle = 'rgba(24,22,64,0.88)';
      g.strokeText(hint, this.VW / 2, y + 0.7 * u); g.fillStyle = '#fff3c8'; g.fillText(hint, this.VW / 2, y + 0.7 * u);
      g.restore();
    }
    drawDebug(g, w, a) {
      const u = this.unit, p = w.paddle;
      g.save(); g.lineWidth = 1; g.strokeStyle = '#f0f';
      for (const b of w.bricks) if (b.alive) g.strokeRect(this.sx(b.x - b.w / 2), this.sy(b.y + b.h / 2), b.w * u, b.h * u);
      if (w.ball) { g.beginPath(); g.arc(this.sx(w.ball.x), this.sy(w.ball.y), w.ball.r * u, 0, TAU); g.stroke(); }
      g.strokeStyle = '#0ff'; g.beginPath(); g.moveTo(this.sx(p.x - p.w / 2), this.sy(p.y)); g.lineTo(this.sx(p.x + p.w / 2), this.sy(p.y)); g.stroke();
      g.strokeStyle = '#0f0'; g.strokeRect(this.sx(p.x - p.w / 2 - 0.25), this.sy(1.8), (p.w + 0.5) * u, 1.6 * u);   // gem catch box
      for (const m of (w.gems || [])) { g.beginPath(); g.arc(this.sx(m.x), this.sy(m.y), 0.3 * u, 0, TAU); g.stroke(); }
      for (const m of (w.powerups || [])) { g.beginPath(); g.arc(this.sx(m.x), this.sy(m.y), 0.35 * u, 0, TAU); g.stroke(); }
      g.strokeStyle = '#ff0'; g.strokeRect(this.sx(0), this.sy(8.6), 16 * u, 8.6 * u);
      g.fillStyle = '#ff0'; g.font = '12px monospace'; g.fillText((w.phase || '') + ' mag ' + (w.magnet ? w.magnet.t.toFixed(1) : 0), this.sx(0.2), this.sy(8.2));
      g.restore();
    }
  }
  /* zone palettes from levels/palette.json (environment artist) override the built-in ones when present */
  Renderer.applyPalette = function (json) {
    if (!json) return;
    for (const k in PAL) if (json[k]) Object.assign(PAL[k], json[k]);
    syncInfo();
  };
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  Renderer.GEM_COL = GEM_COL;
  WRB.Renderer = Renderer;
})(window.WRB = window.WRB || {});
