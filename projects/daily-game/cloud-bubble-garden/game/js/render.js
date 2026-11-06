/* NB.Renderer — the rainy garden, bubbles with gems, chestnut burrs, Nimbus, particles, juice and the HUD
 * (DESIGN §2–§4). The garden does not scroll: per time of day the gradient sky, the far/mid layers and the
 * lawn are pre-rendered once into device-pixel canvases and blitted pixel-exact; only the sky décor tile
 * drifts slowly. Time-of-day changes crossfade. Everything that moves is lerped with world.alpha. */
(function (NB) {
  'use strict';
  const ZONE_INFO = [
    { name: 'Dawn', top: '#c9b4e6', bottom: '#ffd3c4', lawn: '#87a37f', color: '#ffd6e6', vig: 'rgba(60,30,70,.20)', hint: 'Float Nimbus to the bubbles!' },
    { name: 'Noon', top: '#8fc9ef', bottom: '#dff1f7', lawn: '#7eac6c', color: '#d4f1ff', vig: 'rgba(20,50,80,.16)', hint: 'Gems make Nimbus grow!' },
    { name: 'Sunset', top: '#7a5aa8', bottom: '#ffb07a', lawn: '#7e8853', color: '#ffd2a8', vig: 'rgba(50,20,40,.24)', hint: 'Watch out for falling burrs!' },
    { name: 'Night', top: '#141c46', bottom: '#34407a', lawn: '#2a4558', color: '#c9d2ff', vig: 'rgba(4,6,30,.34)', hint: 'Fill the jar to see the rainbow!' }
  ];
  const GEM_COL = ['#ff4d6d', '#3d8bff', '#2fd07a', '#ffc531', '#b26bff'];
  const GEM_LINE = ['#8f1235', '#163d8f', '#0d6136', '#9a5a00', '#541a9e'];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  // Nimbus sprite (128×128): body centre (64,66), body circle r 50. Drawn at 2·r·1.25 so the body ≈ the hit circle ×1.25.
  const NIM_K = 1.25, NIM_CX = 64 / 128, NIM_CY = 66 / 128;

  /* Gem shapes (round / drop / square / star / heart), centred at (x, y), radius r — shape + colour. */
  function gemPath(g, c, x, y, r) {
    g.beginPath();
    if (c === 0) g.arc(x, y, r * 0.9, 0, TAU);
    else if (c === 1) {
      g.moveTo(x, y - r * 1.05);
      g.bezierCurveTo(x + r * 0.35, y - r * 0.45, x + r * 0.85, y + r * 0.05, x + r * 0.85, y + r * 0.35);
      g.arc(x, y + r * 0.35, r * 0.85, 0, Math.PI, false);
      g.bezierCurveTo(x - r * 0.85, y + r * 0.05, x - r * 0.35, y - r * 0.45, x, y - r * 1.05);
    } else if (c === 2) { const s = r * 0.8; g.rect(x - s, y - s, 2 * s, 2 * s); }
    else if (c === 3) { for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.46 : r * 1.05; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } }
    else {
      g.moveTo(x, y + r * 0.9);
      g.bezierCurveTo(x - r * 1.25, y + r * 0.05, x - r * 0.95, y - r * 1.05, x, y - r * 0.4);
      g.bezierCurveTo(x + r * 0.95, y - r * 1.05, x + r * 1.25, y + r * 0.05, x, y + r * 0.9);
    }
    g.closePath();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = []; this.flyers = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fff6d0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.hintOn = true; this.heartPulse = 0; this.jarPulse = 0; this.sizePulse = 0; this.rainbow = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map();
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
      const dpr = window.devicePixelRatio || 1, touch = !!(NB.Game && NB.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear();
      this._hudK = clamp(0.95 / v.s, 1, 1.6);
      this._view = v;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.world && this.world.setLayout) this.world.setLayout(v.VW, v.VH, this.playInsets());
      this._syncWeather();
      this._measureHud();
      NB.Assets.setScale(this.px);
    }
    _syncWeather() {
      const wx = this.weather; if (!wx) return;
      if (wx.resize) wx.resize(this.VW, this.VH);
      const L = this._layout();
      if (wx.setGround) wx.setGround(L.groundY, L.unit);
    }
    _layout() { return this.world ? this.world.layout : NB.World.computeLayout(this.VW, this.VH, this.playInsets()); }
    /* Space the HUD and the safe area keep for themselves (logical px): the play area starts below the HUD panels
     * (landscape: one row, 98 px; portrait: two rows, down to 186 px) and keeps clear of a notch at the sides. */
    playInsets() {
      const I = this.ins || { top: 0, left: 0, right: 0 }, portrait = this.VH > this.VW;
      return { top: I.top + 12 + (portrait ? 186 : 98) + 8, left: I.left, right: I.right };
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width, b: (r.bottom - c.top) * this.VH / c.height } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.flyers.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heartPulse = 0; this.jarPulse = 0; this.sizePulse = 0; this.rainbow = 0;
      this.hintOn = !!world && (world.level || 0) === 0; this._hintT = 0;
      if (world && world.setLayout) world.setLayout(this.VW, this.VH, this.playInsets());
      this._syncWeather();
    }
    setLevel(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(z) { this.banner = { s: z, t: 0, loop: this.world ? this.world.loop || 0 : 0 }; }

    // ---------------- pre-rendered scenes ----------------
    _slot(b) { return NB.Assets.SLOTS[2 + b].id; }
    _custom(b) { return NB.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (NB.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    _canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* {base (gradient or photo), sky (décor tile, drifts), front (far + mid + lawn), vig}: device px. */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = NB.Assets, n = A.SEASONS[b], px = this.px, VW = this.VW, VH = this.VH, info = ZONE_INFO[b];
      const L = this._layout(), k = L.unit / 100;
      bg = { base: null, sky: null, front: null, custom: false };
      const full = () => { const c = this._canvas(VW * px, VH * px), g = c.getContext('2d'); g.imageSmoothingQuality = 'high'; g.setTransform(px, 0, 0, px, 0, 0); return [c, g]; };
      const tileRow = (g, im, y, w, h) => { if (!im) return; for (let x = 0; x < VW; x += w) g.drawImage(im, x, y, w, h); };
      {
        const [c, g] = full();
        if (this._custom(b)) {
          const im = A.custom[this._slot(b)], s = Math.max(VW / im.width, VH / im.height);
          g.filter = 'saturate(0.7)';   // calmer than the gems; tinted to the time of day below
          g.drawImage(im, (VW - im.width * s) / 2, (VH - im.height * s) / 2, im.width * s, im.height * s);
          g.filter = 'none';
          g.globalAlpha = b === 3 ? 0.45 : 0.18; g.fillStyle = b === 3 ? '#141c46' : info.top; g.fillRect(0, 0, VW, VH); g.globalAlpha = 1;
          bg.custom = true;
        } else {
          const gr = g.createLinearGradient(0, 0, 0, L.groundY); gr.addColorStop(0, info.top); gr.addColorStop(1, info.bottom);
          g.fillStyle = gr; g.fillRect(0, 0, VW, VH);
        }
        bg.base = c;
      }
      if (!bg.custom && A.img[n + '_sky']) {
        const tw = Math.round(960 * k * px), th = Math.round(540 * k * px);
        const c = this._canvas(tw, th), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.drawImage(A.img[n + '_sky'], 0, 0, tw, th); bg.sky = c;
      }
      {
        const [c, g] = full();
        const tw = 960 * k, bottom = L.groundY + 0.3 * L.unit;
        if (!bg.custom) { tileRow(g, A.img[n + '_far'], bottom - 540 * k, tw, 540 * k); tileRow(g, A.img[n + '_mid'], bottom - 540 * k, tw, 540 * k); }
        else { const gr = g.createLinearGradient(0, L.groundY - L.unit, 0, L.groundY); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.18)'); g.fillStyle = gr; g.fillRect(0, L.groundY - L.unit, VW, L.unit); }
        const gy = L.groundY - 0.4 * L.unit;
        g.fillStyle = info.lawn; g.fillRect(0, gy + 0.6 * L.unit, VW, VH);
        tileRow(g, A.img[n + '_ground'], gy, tw, 200 * k);
        bg.front = c;
      }
      {
        const [c, g] = full();
        const vg = g.createRadialGradient(VW / 2, VH * 0.45, Math.min(VW, VH) * 0.45, VW / 2, VH * 0.45, Math.max(VW, VH) * 0.8);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, info.vig);
        g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
        bg.vig = c;
      }
      this._bg.set(key, bg);
      if (this._bg.size > 4) { const keep = [this.vis.cur, this.vis.prev, (this.vis.cur + 1) % 4].map(z => this._bgKey(z)); for (const kk of this._bg.keys()) if (!keep.includes(kk)) this._bg.delete(kk); }
      return bg;
    }
    drawScene(g, b, alpha) {
      const bg = this.background(b);
      g.globalAlpha = alpha;
      g.drawImage(bg.base, 0, 0);
      if (bg.sky) {
        const tw = bg.sky.width, cw = this.canvas.width;
        let x = -Math.round(((this.time * 5 * this.px) % tw + tw) % tw);
        for (; x < cw; x += tw) g.drawImage(bg.sky, x, 0);
      }
      g.drawImage(bg.front, 0, 0);
      g.globalAlpha = 1;
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world, L = w && w.layout, wx = this.weather, u = L ? L.unit / 100 : 1, quiet = this._quiet();
      for (const e of evts) {
        switch (e.type) {
          case 'spawn': if (wx && !quiet) wx.burst('ripple', e.b.x, L.groundY + 0.18 * L.unit, 1, { speed: 0, life: 0.7, size: 40, gravity: 0, grow: 1.2, layer: 'back' }); break;
          case 'pop': {
            this.hintOn = false;
            const x = e.x, y = e.y, r = e.b ? e.b.r : 36 * u, c = GEM_COL[e.gem];
            if (wx) {
              wx.burst('shard', x, y, 8, { speed: 170, life: 0.5, size: 10, gravity: 60, spread: TAU, layer: 'front', spin: 6, drag: 2 });
              wx.burst('drop', x, y, 5, { speed: 120, life: 0.55, size: 9, gravity: 500, spread: TAU, layer: 'front' });
            }
            this.ring(x, y, 'rgba(255,255,255,.95)', 0.3, r * 1.25, 3);
            this.ring(x, y, c, 0.4, r * 0.8, 2);
            if (!quiet) {
              this.flyers.push({ gem: e.gem, x, y, sx: x, sy: y, vx: (Math.random() - 0.5) * 120 * u, vy: -260 * u, t: 0 });
              if (this.flyers.length > 30) this.flyers.shift();
              const H = w.hero; let top = H.y - H.r * NIM_K - 14 * u;   // above Nimbus's head, never over her face…
              if (top < L.topY - 0.2 * L.unit) top = H.y + H.r * NIM_K + 16 * u;   // …or under her when there's no room above
              this.pop('+' + e.points, e.by === 'rain' ? x : H.x, e.by === 'rain' ? y - r - 10 * u : top, c, 18 + Math.min(8, e.size * 1.5));
              if (e.by !== 'rain') { const t = this.texts[this.texts.length - 1]; if (t) { t.follow = top > H.y ? 1 : -1; t.dy = 0; } }   // rides along with Nimbus
            }
            break;
          }
          case 'combo': this.say(e.combo + ' pops in a row!', this._sayX(), this._sayY(), '#fff2a8', 24, 'combo'); break;
          case 'grow': {
            this.sizePulse = 1;
            const h = w.hero;
            this.say(e.size >= 5 ? 'So fluffy!' : 'Bigger!', this._sayX(), this._sayY(), '#ffffff', 26, 'grow');
            if (wx) wx.burst('puff', h.x, h.y, 8, { speed: 130, life: 0.6, size: 20, gravity: -20, spread: TAU, layer: 'front', drag: 2.5 });
            break;
          }
          case 'shrink': this.sizePulse = 0.6; break;
          case 'shower': {
            this.flash = 0.25; this.flashCol = '#e8f4ff';
            this.say('Rain shower!', this.VW / 2, this._sayY(), '#cfeaff', 32, 'shower');
            if (wx && wx.setShower) wx.setShower(true, w.hero.x, w.hero.y);
            break;
          }
          case 'showerEnd': {
            if (wx && wx.setShower) wx.setShower(false);
            if (wx) wx.burst('petal', this.VW / 2, L.groundY - 0.2 * L.unit, 14, { speed: 260, life: 1.1, size: 14, gravity: 220, spread: 1.6, angle: -Math.PI / 2, layer: 'front', spin: 5 });
            this.pop('+' + (50 * ((w.level || 0) + 1)), w.hero.x, w.hero.y - w.hero.r - 24 * u, '#cfeaff', 24);
            this._bloom = 1;
            break;
          }
          case 'hang': break;
          case 'drop': break;
          case 'land': {
            this.shake = Math.max(this.shake, 0.6);
            if (wx && e.burr) wx.burst('splash', e.burr.x, L.groundY, 1, { speed: 0, life: 0.4, size: 26, gravity: 0, layer: 'front' });
            break;
          }
          case 'bump': {
            this.shake = Math.max(this.shake, 7); this.flash = 0.18; this.flashCol = '#ffd6d6';
            this.say('Ouch!', this._sayX(), this._sayY(), '#ffd0a0', 28, 'ouch');
            if (wx) wx.burst('star', e.x, e.y, 6, { speed: 170, life: 0.6, size: 14, gravity: 150, spread: TAU, layer: 'front' });
            break;
          }
          case 'heartLost': this.heartPulse = 1; break;
          case 'heartGain': this.heartPulse = 0.8; break;
          case 'levelUp': {
            this.showBanner(e.zone); this.rainbow = 1; this.jarPulse = 1;
            this.texts = this.texts.filter(t => !t.big);
            if (e.bonus) { this.flash = 0.35; this.flashCol = '#fff6d8'; this.pop('+' + e.bonus, this.VW / 2, this._bannerY() + 70, '#ffe27a', 28); }
            if (wx) wx.burst('sparkle', this.VW / 2, L.topY + 1.6 * L.unit, 18, { speed: 280, life: 1.0, size: 16, gravity: 120, spread: TAU, layer: 'front' });
            break;
          }
          case 'gameOver': this.shake = 3; this.say('Time for a nap!', this.VW / 2, this._sayY(), '#ffe0f0', 30, 'goal'); break;
        }
      }
    }
    /* Callouts float beside Nimbus on the roomier side, never on top of her. */
    _sayX() { const h = this.world.hero, L = this.world.layout; const right = h.x < this.VW / 2; return clamp(h.x + (right ? 1 : -1) * (h.r + 1.4 * L.unit), 110, this.VW - 110); }
    _sayY() { const h = this.world.hero, L = this.world.layout; return clamp(h.y - h.r - 0.3 * L.unit, L.topY + 0.9 * L.unit, L.groundY - 0.6 * L.unit); }
    _quiet() { return NB.Game && NB.Game.mode === 'title'; }   // the title demo stays calm behind the menu
    ring(x, y, col, life, r, wdt) {
      if (this._quiet()) return; this.fx.push({ kind: 'ring', x, y, col, t: 0, life, r, w: wdt || 3 }); if (this.fx.length > 40) this.fx.shift(); }
    pop(txt, x, y, col, size) {
      if (this._quiet()) return;
      for (const t of this.texts) if (!t.big && t.t < 0.35 && Math.abs(t.x - x) < 60 && Math.abs(t.y - y) < size) y = t.y - size * 1.1;
      this.texts.push({ txt, x, y, col, size, t: 0, life: 0.8, vy: -60, vx: 0 }); if (this.texts.length > 24) this.texts.shift(); }
    say(txt, x, y, col, size, key) {
      if (this._quiet()) return;
      if (key) this.texts = this.texts.filter(t => t.key !== key);
      for (const t of this.texts) if (t.big && t.t < 1.0 && Math.abs(t.y - y) < size * 1.2) t.y -= size * 1.25;
      this.texts.push({ txt, x, y, col, size, t: 0, life: 1.2, vy: -16, vx: 0, big: true, key }); if (this.texts.length > 24) this.texts.shift();
    }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.6);
      this.shake = Math.max(0, this.shake - dt * 18);
      this.flash = Math.max(0, this.flash - dt * 1.6);
      this.heartPulse = Math.max(0, this.heartPulse - dt * 1.5);
      this.jarPulse = Math.max(0, this.jarPulse - dt * 2.5);
      this.sizePulse = Math.max(0, this.sizePulse - dt * 2);
      this.rainbow = Math.max(0, this.rainbow - dt / 3.2);
      this._bloom = Math.max(0, (this._bloom || 0) - dt / 2.5);
      if (this.hintOn) { this._hintT = (this._hintT || 0) + dt; if (this._hintT > 12) this.hintOn = false; }
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.4) this.banner = null; }
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter(f => f.t < f.life);
      const hw = this.world && this.world.hero, ul = this.world ? this.world.layout.unit / 100 : 1;
      for (const t of this.texts) {
        t.t += dt;
        if (t.follow && hw) {   // hero pops stay just above (or below) her while she moves
          t.dy += t.vy * dt;
          t.x = hw.x; t.y = t.follow < 0 ? hw.y - hw.r * NIM_K - 14 * ul + t.dy : hw.y + hw.r * NIM_K + 16 * ul + t.dy * 0.3;
        } else { t.y += t.vy * dt; t.x += t.vx * dt; }
      }
      this.texts = this.texts.filter(t => t.t < t.life);
      // rain shower: drops pour from under Nimbus
      const w = this.world;
      if (w && w.hero.rainT > 0 && this.weather) {
        this._rainAcc = (this._rainAcc || 0) + dt;
        const H = w.hero;
        while (this._rainAcc > 0.04) {
          this._rainAcc -= 0.04;
          this.weather.burst('drop', H.x + (Math.random() - 0.5) * H.r * 1.4, H.y + H.r * 0.7, 1, { speed: 60, life: 0.7, size: 11, gravity: 900, spread: 0.5, angle: Math.PI / 2, layer: 'front', spin: 0 });
        }
      }
      // gems: pop up with an impulse, then home into the jar
      const J = this._jar || { x: this.VW / 2, y: 40 };
      for (const f of this.flyers) {
        f.t += dt;
        if (f.t < 0.28) { f.vy += 900 * dt; f.x += f.vx * dt; f.y += f.vy * dt; f.hx = f.x; f.hy = f.y; }
        else { const k = clamp((f.t - 0.28) / 0.5, 0, 1), e = k * k * (3 - 2 * k); f.x = lerp(f.hx, J.x, e); f.y = lerp(f.hy, J.y, e) - Math.sin(e * Math.PI) * 30; if (k >= 1) { f.done = true; this.jarPulse = Math.max(this.jarPulse, 0.6); if (NB.Game && NB.Game.mode === 'playing') NB.Audio.play('tink', { gem: f.gem }); } }
      }
      this.flyers = this.flyers.filter(f => !f.done);
    }

    // ---------------- drawing ----------------
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      const v = this.vis;
      if (v.t < 1) { this.drawScene(g, v.prev, 1); this.drawScene(g, v.cur, v.t); }
      else this.drawScene(g, v.cur, 1);
      g.setTransform(px, 0, 0, px, 0, 0);
      if (this.VH > this.VW * 1.4) this.drawMidClouds(g);
      if (this.rainbow > 0) this.drawRainbow(g, w);
      if (this._bloom > 0 && w) this.drawBloom(g, w);
      this.drawParticles(g, 'back');
      if (!w) return;
      const sh = this.shake > 0 ? this.shake : 0;
      const sx = sh ? Math.sin(this.time * 71) * sh : 0, sy = sh ? Math.cos(this.time * 53) * sh * 0.6 : 0;
      g.setTransform(px, 0, 0, px, sx * px, sy * px);
      this.drawShadows(g, w);
      this.drawBubbles(g, w);
      this.drawBurrs(g, w);
      this.drawHero(g, w, mode);
      this.drawParticles(g, 'front');
      this.drawFx(g);
      if (this.debug) this.drawDebug(g, w);
      g.setTransform(1, 0, 0, 1, 0, 0);
      { const bg = this.background(v.cur); if (bg.vig) g.drawImage(bg.vig, 0, 0); }
      g.setTransform(px, 0, 0, px, 0, 0);
      const tint = this.weather && this.weather.ambient && this.weather.ambient.tint;
      if (tint) { g.fillStyle = tint; g.fillRect(0, 0, this.VW, this.VH); }
      if (mode !== 'title') { this.drawHud(g, w, mode); this.drawFlyers(g); }
      else {
        const dg = g.createRadialGradient(this.VW / 2, this.VH / 2, 0, this.VW / 2, this.VH / 2, Math.max(this.VW, this.VH) * 0.6);
        dg.addColorStop(0, 'rgba(20,24,60,.50)'); dg.addColorStop(1, 'rgba(20,24,60,.15)');
        g.fillStyle = dg; g.fillRect(0, 0, this.VW, this.VH);
      }
      if (this.banner && mode !== 'title') this.drawBanner(g);
      if (this.flash > 0) { g.globalAlpha = Math.min(0.3, this.flash * 0.6); g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.globalAlpha = 1; }
    }

    spr(key, w, h) { return NB.Assets.sprite(key, w, h); }

    drawRainbow(g, w) {
      const L = this._layout(), a = this.rainbow < 0.2 ? this.rainbow / 0.2 : this.rainbow > 0.85 ? (1 - this.rainbow) / 0.15 : 1;
      const cx = this.VW / 2, cy = L.groundY + 0.4 * L.unit, R = Math.min(this.VW * 0.48, (L.groundY - L.topY) * 1.05);
      const cols = ['#ff8a8a', '#ffc27a', '#fff08a', '#9fe79a', '#8fd0ff', '#b9a2ff'], bw = Math.max(7, R * 0.045);
      g.globalAlpha = a * 0.42; g.lineWidth = bw;
      cols.forEach((c, i) => { g.strokeStyle = c; g.beginPath(); g.arc(cx, cy, R - i * bw, Math.PI, TAU); g.stroke(); });
      g.globalAlpha = 1;
    }
    drawMidClouds(g) {   // tall portrait: a few faint drifting clouds so the middle sky isn't empty
      const L = this._layout(), u = L.unit, y0 = L.topY + 1.2 * u, y1 = L.groundY - 4.2 * u;
      if (y1 <= y0) return;
      const night = this.vis.cur === 3;
      g.globalAlpha = night ? 0.12 : 0.22;
      for (let i = 0; i < 3; i++) {
        const span = this.VW + 3 * u, x = ((i * 0.37 * span + this.time * (6 + i * 3)) % span) - 1.5 * u;
        const y = y0 + (y1 - y0) * (0.15 + 0.35 * i), r = (0.9 + 0.3 * i) * u;
        this._cloud(g, x, y, r, night ? '#9aa6d8' : '#ffffff');
        this._cloud(g, x + r * 1.1, y + r * 0.15, r * 0.75, night ? '#9aa6d8' : '#ffffff');
      }
      g.globalAlpha = 1;
    }
    drawBloom(g, w) {   // after a rain shower: soft glowing flower heads pop up along the lawn
      const L = w.layout, k = this._bloom, u = L.unit, cols = ['#ffd0e6', '#fff1a8', '#d8c4ff', '#c4f0ff'];
      const e = k > 0.8 ? (1 - k) / 0.2 : Math.min(1, k / 0.3);
      for (let i = 0; i < 9; i++) {
        const x = (i + 0.5) * this.VW / 9 + Math.sin(i * 7.3) * 0.2 * u, y = L.groundY + 0.05 * u, r = 0.12 * u * e;
        g.globalAlpha = e;
        g.fillStyle = cols[i % 4];
        for (let p = 0; p < 5; p++) { const a = p * TAU / 5 + this.time; g.beginPath(); g.arc(x + Math.cos(a) * r, y - 0.1 * u + Math.sin(a) * r, r * 0.7, 0, TAU); g.fill(); }
        g.fillStyle = '#ffe27a'; g.beginPath(); g.arc(x, y - 0.1 * u, r * 0.55, 0, TAU); g.fill();
      }
      g.globalAlpha = 1;
    }

    drawShadows(g, w) {
      const L = w.layout, gy = L.groundY + 0.1 * L.unit, span = L.groundY - L.topY;
      g.fillStyle = 'rgba(20,30,40,1)';
      const sh = (x, r, y) => { const k = clamp(1 - (gy - y) / span, 0, 1); g.globalAlpha = 0.08 + 0.18 * k; g.beginPath(); g.ellipse(x, gy, r * (0.6 + 0.5 * k), r * 0.16 * (0.6 + 0.5 * k), 0, 0, TAU); g.fill(); };
      const a = w.alpha || 0, h = w.hero;
      sh(lerp(h.prevX, h.x, a), lerp(h.prevR, h.r, a) * 1.1, lerp(h.prevY, h.y, a));
      for (const b of w.burrs) {
        if (b.state === 'gone') continue;
        const x = lerp(b.prevX, b.x, a), y = lerp(b.prevY, b.y, a);
        // a hanging burr shows a pulsing warning shadow on the lawn where it will land
        if (b.state === 'hang') { g.globalAlpha = 0.16 + 0.12 * Math.sin(this.time * 10); g.beginPath(); g.ellipse(x, gy, L.unit * 0.42, L.unit * 0.08, 0, 0, TAU); g.fill(); }
        else sh(x, b.r * 1.4, y);
      }
      g.globalAlpha = 1;
    }

    drawBubbles(g, w) {
      const a = w.alpha || 0, A = NB.Assets, customGem = A.hasCustom('gem');
      for (const b of w.bubbles) {
        if (b.state !== 'rise') continue;
        const x = lerp(b.prevX, b.x, a), y = lerp(b.prevY, b.y, a);
        const age = w.time - (b.born || 0), grow = clamp(age / 0.35, 0, 1), ge = 1 - Math.pow(1 - grow, 3);
        const wob = Math.sin(this.time * 5.2 + b.id * 1.7) * 0.04, rr = b.r * (0.35 + 0.65 * ge);
        const rx = rr * (1 + wob), ry = rr * (1 - wob);
        // gem first (inside), then the bubble film over it
        const gs = 1.05 * rr, gb = Math.sin(this.time * 2.2 + b.id) * 0.12;
        g.save(); g.translate(x, y); g.rotate(gb);
        if (customGem) {
          const im = this.spr('custom:gem', gs * 1.6, gs * 1.6);
          g.save(); g.beginPath(); g.arc(0, 0, gs * 0.62, 0, TAU); g.clip();
          if (im) { const [fw, fh] = A.fit('gem', gs * 1.3, gs * 1.3); g.drawImage(im, -fw / 2, -fh / 2, fw, fh); }
          g.restore();
          g.lineWidth = 3; g.strokeStyle = GEM_COL[b.gem]; g.beginPath(); g.arc(0, 0, gs * 0.64, 0, TAU); g.stroke();
          gemPath(g, b.gem, gs * 0.5, gs * 0.45, gs * 0.2); g.fillStyle = GEM_COL[b.gem]; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke();
        } else {
          const im = this.spr('gem_' + b.gem, gs, gs);
          if (im) g.drawImage(im, -gs / 2, -gs / 2, gs, gs);
        }
        g.restore();
        const bi = this.spr('bubble', b.r * 2, b.r * 2);
        if (bi) g.drawImage(bi, x - rx, y - ry, rx * 2, ry * 2);
        else { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.stroke(); }
      }
    }

    drawBurrs(g, w) {
      const a = w.alpha || 0, L = w.layout, u = L.unit, night = (w.zone % 4) === 3, S = 0.70 * u;
      for (const b of w.burrs) {
        const al = b.state === 'gone' ? clamp(b.fade == null ? 0 : b.fade, 0, 1) : (b.fade != null && b.state === 'roll' ? clamp(b.fade, 0, 1) : 1);
        if (al <= 0.01) continue;
        const x = lerp(b.prevX, b.x, a), y = lerp(b.prevY, b.y, a);
        let rot = lerp(b.prevRot != null ? b.prevRot : b.rot, b.rot, a);
        g.globalAlpha = al;
        if (b.state === 'hang') {
          const sw = Math.sin((b.t || 0) * 9) * 0.28 * Math.min(1, (b.t || 0) * 3);
          const top = Math.max(0, this.ins.top);
          // a little twig with a leaf at the top edge and a thread down to the burr
          g.strokeStyle = night ? '#9fb0c8' : '#5a4a3a'; g.lineWidth = 2;
          const ax = x, ay = top, len = y - top - S * 0.36;
          const ex = ax + Math.sin(sw) * len, ey = ay + Math.cos(sw) * len;
          g.beginPath(); g.moveTo(ax, ay); g.lineTo(ex, ey); g.stroke();
          g.fillStyle = night ? '#5f8a6a' : '#6f9a4a'; g.beginPath(); g.ellipse(ax + 9, ay + 6, 10, 5, 0.5, 0, TAU); g.fill();
          rot = sw;
          g.save(); g.translate(ex + Math.sin(sw) * S * 0.36, ey + Math.cos(sw) * S * 0.36); g.rotate(-sw);
        } else { g.save(); g.translate(x, y); g.rotate(rot); }
        const im = this.spr('burr_' + (b.variant || 0), S, S);
        if (night) { g.shadowColor = 'rgba(255,150,60,.85)'; g.shadowBlur = 14 * this.px; }   // warm "avoid" glow, not a pale bubble disc
        if (im) g.drawImage(im, -S / 2, -S / 2, S, S);
        else { g.fillStyle = '#8a5a3a'; g.beginPath(); g.arc(0, 0, b.r, 0, TAU); g.fill(); }
        g.shadowBlur = 0; g.shadowColor = 'transparent';
        g.restore();
      }
      g.globalAlpha = 1;
    }

    drawHero(g, w, mode) {
      const h = w.hero, a = w.alpha || 0, A = NB.Assets;
      const x = lerp(h.prevX, h.x, a), y = lerp(h.prevY, h.y, a), r = lerp(h.prevR, h.r, a);
      if (h.invuln > 0 && h.rainT <= 0 && Math.floor(this.time * 12) % 2 === 0) g.globalAlpha = 0.45;
      const S = 2 * r * NIM_K, sq = h.squash || 0, sp = this.sizePulse;
      const wob = Math.sin(this.time * 3.1) * 0.025;
      const sxk = 1 + 0.10 * sq + wob + sp * 0.06, syk = 1 - 0.08 * sq - wob + sp * 0.04;
      g.save(); g.translate(x, y); g.rotate(h.tilt || 0); g.scale(sxk, syk);
      if (A.hasCustom('hero')) this._drawCustomHero(g, h, r);
      else {
        const key = h.mood === 'rain' || h.rainT > 0 ? 'nimbus_rain' : h.mood === 'ouch' ? 'nimbus_ouch' : h.mood === 'happy' ? 'nimbus_happy' : ('nimbus_' + (Math.floor(this.time * 2.5) % 2));
        const im = this.spr(key, S, S);
        if (im) g.drawImage(im, -S * NIM_CX, -S * NIM_CY, S, S);
        else { g.fillStyle = '#fff'; g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); }
        // eye blink (idle frames only): eyes at (51,68) and (77,68) of 128
        if (im && (h.blink || 0) > 0.5 && (key === 'nimbus_0' || key === 'nimbus_1')) {
          const k = S / 128, ox = -S * NIM_CX, oy = -S * NIM_CY;
          g.fillStyle = '#ffffff';
          for (const ex of [51, 77]) { g.beginPath(); g.ellipse(ox + ex * k, oy + 68 * k, 8.5 * k, 10.5 * k, 0, 0, TAU); g.fill(); }
          g.strokeStyle = '#2b3a5c'; g.lineWidth = Math.max(1.5, 2.6 * k); g.lineCap = 'round';
          for (const ex of [51, 77]) { g.beginPath(); g.moveTo(ox + (ex - 7) * k, oy + 69 * k); g.quadraticCurveTo(ox + ex * k, oy + 73 * k, ox + (ex + 7) * k, oy + 69 * k); g.stroke(); }
        }
      }
      g.restore();
      g.globalAlpha = 1;
      // size pips over her head while growing
      if (mode !== 'title' && sp > 0) {
        const n = 5, pr = 5, gap = 14, y0 = y - r * 1.25 - 16;
        for (let i = 0; i < n; i++) { g.globalAlpha = Math.min(1, sp * 2); g.fillStyle = i < h.size ? '#ffffff' : 'rgba(255,255,255,.3)'; g.beginPath(); g.arc(x + (i - 2) * gap, y0, pr, 0, TAU); g.fill(); }
        g.globalAlpha = 1;
      }
    }
    _drawCustomHero(g, h, r) {
      // a ring of soft cloud puffs around the player's picture; the puffs tint blue in the shower
      const rain = h.rainT > 0, puff = rain ? '#d6e6fb' : '#ffffff', line = '#5a7aa6';
      const n = 9;
      g.fillStyle = puff; g.strokeStyle = line; g.lineWidth = Math.max(2, r * 0.06);
      const R0 = 0.8, PR = 0.3;   // ring reaches ≈1.1·r, inside the box margin (QA F3)
      for (let i = 0; i < n; i++) { const an = i * TAU / n + Math.sin(this.time * 1.5 + i) * 0.05; g.beginPath(); g.arc(Math.cos(an) * r * R0, Math.sin(an) * r * R0, r * PR, 0, TAU); g.fill(); g.stroke(); }
      for (let i = 0; i < n; i++) { const an = i * TAU / n; g.beginPath(); g.arc(Math.cos(an) * r * R0, Math.sin(an) * r * R0, r * (PR - 0.02), 0, TAU); g.fill(); }
      const im = this.spr('custom:hero', r * 2, r * 2), cr = r * 0.8;
      g.save(); g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.clip();
      g.fillStyle = puff; g.fill();
      if (im) { const [fw, fh] = NB.Assets.fit('hero', cr * 2.05, cr * 2.05); g.drawImage(im, -fw / 2, -fh / 2, fw, fh); }
      g.restore();
      g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.lineWidth = Math.max(2, r * 0.05); g.strokeStyle = line; g.stroke();
      if (h.mood === 'ouch') { g.fillStyle = 'rgba(255,120,120,.25)'; g.beginPath(); g.arc(0, 0, cr, 0, TAU); g.fill(); }
    }

    drawParticles(g, layer) {
      const wx = this.weather; if (!wx) return;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const asp = p.aspect || 1, pw = asp < 1 ? p.size * asp : p.size, ph = asp < 1 ? p.size : p.size / asp;
        const im = this.spr('p_' + p.sprite, pw, ph);
        if (!im) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.rot || p.flipX) {
          g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
          g.drawImage(im, -pw / 2, -ph / 2, pw, ph); g.restore();
        } else g.drawImage(im, p.x - pw / 2, p.y - ph / 2, pw, ph);
      }
      g.globalAlpha = 1;
    }

    drawFx(g) {
      for (const f of this.fx) {
        const k = f.t / f.life;
        g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = f.col; g.lineWidth = f.w * (1 - k) + 1;
        g.beginPath(); g.arc(f.x, f.y, f.r * (0.5 + 0.6 * Math.sqrt(k)), 0, TAU); g.stroke();
      }
      g.globalAlpha = 1;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const k = t.t / t.life, sc = t.big ? (k < 0.15 ? 0.6 + k / 0.15 * 0.5 : k < 0.25 ? 1.1 - (k - 0.15) : 1) : 1;
        const x = clamp(t.x, 90, this.VW - 90);
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = '900 ' + Math.round(t.size * sc * this._hudK) + 'px ' + FONT;
        const maxW = this.VW - 40, tw = g.measureText(t.txt).width;
        if (tw > maxW) g.font = '900 ' + Math.floor(t.size * sc * this._hudK * maxW / tw) + 'px ' + FONT;
        g.lineWidth = Math.max(3, t.size * 0.22); g.strokeStyle = 'rgba(30,30,70,.85)'; g.strokeText(t.txt, x, t.y);
        g.fillStyle = t.col; g.fillText(t.txt, x, t.y);
      }
      g.globalAlpha = 1;
    }
    drawFlyers(g) {
      const A = NB.Assets, custom = A.hasCustom('gem'), s = 26;
      for (const f of this.flyers) {
        const k = f.t < 0.28 ? 1 : 1 - 0.45 * clamp((f.t - 0.28) / 0.5, 0, 1), sz = s * k;
        if (custom) { gemPath(g, f.gem, f.x, f.y, sz * 0.45); g.fillStyle = GEM_COL[f.gem]; g.fill(); g.lineWidth = 1.5; g.strokeStyle = '#fff'; g.stroke(); continue; }
        const im = this.spr('gem_' + f.gem, s, s);
        if (im) g.drawImage(im, f.x - sz / 2, f.y - sz / 2, sz, sz);
      }
    }

    // ---------------- HUD ----------------
    _rr(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    _panel(g, x, y, w, h, r) {
      this._rr(g, x, y, w, h, r);
      g.fillStyle = 'rgba(28,36,80,.62)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(200,220,255,.5)'; g.stroke();
    }
    _text(g, txt, x, y, size, col, align, weight) {
      g.font = (weight || '900') + ' ' + Math.round(size) + 'px ' + FONT; g.textAlign = align || 'left'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, size * 0.18); g.strokeStyle = 'rgba(20,22,56,.95)'; g.strokeText(txt, x, y);
      g.fillStyle = col; g.fillText(txt, x, y);
    }
    /* Panels fade when Nimbus floats up under them. */
    _fadeFor(w, x, y, wd, ht) {
      const h = w.hero, R = h.r * NIM_K;
      return (h.x + R > x && h.x - R < x + wd && h.y + R > y && h.y - R < y + ht) ? 0.3 : 1;
    }
    drawHud(g, w, mode) {
      const L = w.layout, K = Math.min(this._hudK, 1.25), I = this.ins, VW = this.VW;
      const best = NB.Game ? NB.Game.best(NB.Game.runDifficulty) : 0;
      const x0 = I.left + 12, top = I.top + 12, hb = this._hudBtn;
      this._hudA = this._hudA || [1, 1];
      // score + best + hearts (left)
      const hs = 22 * Math.min(K, 1.15), pw = Math.max(180 * Math.min(K, 1.1), 28 + w.maxHearts * (hs + 4));
      this._hudA[0] += (this._fadeFor(w, x0, top, pw, 98) - this._hudA[0]) * 0.15;
      g.globalAlpha = this._hudA[0];
      this._panel(g, x0, top, pw, 98, 18);
      this._text(g, String(w.score), x0 + 16, top + 30, 32 * K, '#fff', 'left');
      this._text(g, 'Best ' + Math.max(best, w.score), x0 + 16, top + 58, 13 * K, '#ffe3a0', 'left', '800');
      for (let i = 0; i < w.maxHearts; i++) {
        const on = i < w.hearts, pulse = (i === (on ? w.hearts - 1 : w.hearts) && this.heartPulse > 0) ? 1 + this.heartPulse * 0.5 : 1;
        const im = this.spr(on ? 'heart' : 'heart_empty', hs, hs), hx = x0 + 14 + i * (hs + 4), hy = top + 72;
        if (im) g.drawImage(im, hx + hs / 2 - hs * pulse / 2, hy + hs / 2 - hs * pulse / 2 - 6, hs * pulse, hs * pulse);
      }
      // gem jar + progress + size meter (centre top in landscape, second row in portrait)
      const right = hb ? hb.l - 10 : VW - 110;
      let cx, cy, cw;
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 220, 330); cx = Math.max(x0 + pw + 12 + cw / 2, VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = top; }
      else { cw = Math.min(VW - I.left - I.right - 24, 420); cx = VW / 2; cy = top + 108; }
      g.globalAlpha = 1;
      this._hudA[1] += (this._fadeFor(w, cx - cw / 2, cy, cw, 78) - this._hudA[1]) * 0.15;
      g.globalAlpha = this._hudA[1];
      this._panel(g, cx - cw / 2, cy, cw, 78, 18);
      const info = ZONE_INFO[w.zone % 4];
      const js = 52 * (1 + this.jarPulse * 0.12), jx = cx - cw / 2 + 10, jy = cy + 13 - (js - 52) / 2;
      this._jar = { x: jx + js / 2, y: jy + js * 0.55 };
      // jar fill (behind the glass): x 22–74, y 30–84 of 96
      const k = clamp(w.goal ? w.gems / w.goal : (w.progress || 0), 0, 1), fk = js / 96;
      if (k > 0) {
        const fx = jx + 22 * fk, fw = 52 * fk, fb = jy + 84 * fk, fh = 54 * fk * k;
        const gr = g.createLinearGradient(0, fb - fh, 0, fb); gr.addColorStop(0, '#ffb3d0'); gr.addColorStop(0.5, '#b9a2ff'); gr.addColorStop(1, '#6fd6ff');
        this._rr(g, fx, fb - fh, fw, fh, Math.min(8 * fk, fh / 2)); g.fillStyle = gr; g.fill();
      }
      const ji = this.spr('jar', js, js); if (ji) g.drawImage(ji, jx, jy, js, js);
      const tx = jx + js + 8;
      this._text(g, info.name + (w.loop ? ' ★' + (w.loop + 1) : ''), tx, cy + 18, 14 * K, info.color, 'left', '800');
      this._text(g, (w.gems || 0) + ' / ' + (w.goal || 0), cx + cw / 2 - 14, cy + 18, 14 * K, '#fff', 'right', '800');
      // progress bar
      const bx = tx, bw = cx + cw / 2 - 14 - tx, by = cy + 32, bhh = 9;
      this._rr(g, bx, by, bw, bhh, 4.5); g.fillStyle = 'rgba(255,255,255,.15)'; g.fill();
      if (k > 0) { this._rr(g, bx, by, Math.max(9, bw * k), bhh, 4.5); const gr = g.createLinearGradient(bx, 0, bx + bw, 0); gr.addColorStop(0, '#9fe7ff'); gr.addColorStop(1, '#ffd0f0'); g.fillStyle = gr; g.fill(); }
      // size meter: five little clouds, the current one filling with grow
      const h = w.hero, my = cy + 60, step = Math.min(26, (bw - 52) / 5);
      this._text(g, 'Size', bx, my, 12 * K, '#e8ecff', 'left', '800');
      for (let i = 0; i < 5; i++) {
        const mx = bx + 46 + i * step, on = i < h.size, cur = i === h.size - 1, rr = (on ? 7 : 5.5) * (cur ? 1 + this.sizePulse * 0.35 : 1);
        g.globalAlpha = this._hudA[1] * (on ? 1 : 0.35);
        this._cloud(g, mx, my, rr, on ? '#ffffff' : '#c8d4ee');
      }
      g.globalAlpha = this._hudA[1];
      if (h.size >= 5 || h.rainT > 0) this._text(g, h.rainT > 0 ? 'Rain!' : '×' + h.size, cx + cw / 2 - 14, my, 13 * K, '#cfeaff', 'right', '900');
      else this._text(g, '×' + h.size, cx + cw / 2 - 14, my, 13 * K, '#fff2a8', 'right', '900');
      g.globalAlpha = 1;
      if (this.hintOn && mode === 'playing' && !this.banner) this._text(g, (this.isTouchHint() ? 'Drag your finger: ' : '') + ZONE_INFO[0].hint, VW / 2, this._lowY(), 19 * K, '#fff', 'center', '800');
    }
    isTouchHint() { return !!(NB.Game && NB.Game.isTouch); }
    _cloud(g, x, y, r, col) {
      g.fillStyle = col;
      g.beginPath();   // separate sub-paths (moveTo) so the arcs don't get joined by wedges
      for (const [dx, dy, k] of [[-0.55, 0.15, 0.6], [0.55, 0.15, 0.6], [0, -0.2, 0.75]]) { g.moveTo(x + dx * r + k * r, y + dy * r); g.arc(x + dx * r, y + dy * r, k * r, 0, TAU); }
      g.fill();
    }
    /* A line low on the lawn (never over the play area). */
    _lowY() { const L = this._layout(); return Math.min(this.VH - 22 - this.ins.bottom, L.groundY + Math.max(30, (this.VH - L.groundY) * 0.5)); }

    _bannerY() { const L = this._layout(); return L.topY + (L.portrait ? 1.6 : 0.75) * L.unit; }
    drawBanner(g) {
      const b = this.banner, info = ZONE_INFO[b.s % 4], t = b.t, L = this._layout();
      const a = t < 0.3 ? t / 0.3 : t > 2.0 ? Math.max(0, (2.4 - t) / 0.4) : 1;
      const h = 76, cx = this.VW / 2, y = this._bannerY() - (1 - a) * 16;
      const w = Math.min(this.VW - 40, 420);
      this._banA = this._banA == null ? 1 : this._banA + ((this.world ? this._fadeFor(this.world, cx - w / 2, y - h / 2, w, h) : 1) - this._banA) * 0.15;
      g.globalAlpha = a * 0.85 * this._banA;
      this._panel(g, cx - w / 2, y - h / 2, w, h, 22);
      g.globalAlpha = a * this._banA;
      this._text(g, info.name + (b.loop ? '  ★' + (b.loop + 1) : ''), cx, y - 14, 26, info.color, 'center');
      this._text(g, b.s === 0 && !b.loop ? 'Good morning, Nimbus!' : 'Fill the gem jar!', cx, y + 18, 17, '#fff', 'center', '800');
      g.globalAlpha = 1;
    }

    drawDebug(g, w) {
      const L = w.layout, h = w.hero;
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(0,255,120,.9)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      g.strokeStyle = 'rgba(0,200,255,.8)';
      for (const b of w.bubbles) { g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.stroke(); }
      for (const b of w.burrs) { g.strokeStyle = b.state === 'fall' && !b.hit ? 'rgba(255,60,60,.9)' : 'rgba(255,255,0,.5)'; g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(255,0,180,.8)'; g.beginPath(); g.moveTo(0, L.groundY); g.lineTo(this.VW, L.groundY); g.moveTo(0, L.topY); g.lineTo(this.VW, L.topY); g.stroke();
      g.fillStyle = '#0f8'; g.font = '11px monospace'; g.textAlign = 'left';
      g.fillText(w.phase + ' size ' + h.size + ' grow ' + (h.grow || 0).toFixed(2) + ' wind ' + (w.wind ? w.wind.x : 0).toFixed(0) + ' b ' + w.bubbles.length + ' burrs ' + w.burrs.length, 10, this.VH - 10);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.gemPath = gemPath;
  Renderer.GEM_COL = GEM_COL;
  Renderer.GEM_LINE = GEM_LINE;
  NB.Renderer = Renderer;
})(window.NB = window.NB || {});
