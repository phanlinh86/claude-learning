/* EG.Renderer — the castle scene, the glow-board, Ember, Boo, the lights, particles, juice and the HUD (DESIGN §2–§4).
 * Layers: sky + far are scaled to the screen height and pre-rendered as device-pixel tiles that drift (blitted
 * pixel-exact); near + vignette and the board panel are pre-rendered ONCE per place / size / board into canvases.
 * Place changes crossfade. Everything that moves is lerped between simulation steps with world.alpha. */
(function (EG) {
  'use strict';
  const ZONE_INFO = [
    { name: 'Garden Courtyard', color: '#f2b5d4', dark: '#2f2463', vig: 'rgba(30,16,60,.38)', hint: 'Tap a column to drop the light!' },
    { name: 'Crystal Cellar', color: '#8fe6ff', dark: '#0b1a3a', vig: 'rgba(4,10,30,.45)', hint: 'Merge next to a sleepy pumpkin to wake it!' },
    { name: 'Moonlit Library', color: '#ffd98a', dark: '#151a40', vig: 'rgba(16,10,30,.45)', hint: 'Merges in a row call Boo to help!' },
    { name: 'Star Tower', color: '#b9c2ff', dark: '#080c26', vig: 'rgba(4,6,24,.42)', hint: 'Make the moon to light up the castle!' }
  ];
  const TIER = [
    null,
    { name: 'Firefly', col: '#b6f04a' }, { name: 'Blue Fireflies', col: '#5cc8ff' }, { name: 'Pink Fireflies', col: '#ff7ac8' },
    { name: 'Firefly Jar', col: '#ffd44a' }, { name: 'Candle', col: '#ff9a3c' }, { name: 'Lantern', col: '#ff5a5a' },
    { name: 'Star', col: '#ffe14d' }, { name: 'Moon', col: '#e9e2ff' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const EMBER_K = 1.75, HOLD_DY = (138 - 78) / 160;     // Ember drawn cell×1.75 from a 160 viewBox; hold point under her centre
  const BOO_K = 1.4;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fff6d0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.drift = 0; this.heldPop = 1; this.hintOn = true; this.comboShow = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._board = null;
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
      const dpr = window.devicePixelRatio || 1, touch = !!(EG.Game && EG.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._board = null;
      this._hudK = clamp(0.95 / v.s, 1, 1.6);
      this._view = v;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      if (this.world && this.world.setLayout && (this.world.layout.width !== v.VW || this.world.layout.height !== v.VH)) this.world.setLayout(v.VW, v.VH);
      this._measureHud();
      EG.Assets.setScale(this.px);
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width, b: (r.bottom - c.top) * this.VH / c.height } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    /* Column under a logical x (clamped to the board). */
    colAt(lx) {
      const L = this.world && this.world.layout; if (!L) return 0;
      return clamp(Math.floor((lx - L.boardX) / L.cell), 0, L.cols - 1);
    }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.heldPop = 1; this.comboShow = 0;
      this.hintOn = !!world && (world.level || 0) === 0;
      if (weather && weather.resize) weather.resize(this.VW, this.VH);
      if (world && world.setLayout && world.layout && (world.layout.width !== this.VW || world.layout.height !== this.VH)) world.setLayout(this.VW, this.VH);
      this._board = null;
    }
    setLevel(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(z) { this.banner = { s: z, t: 0, loop: this.world ? this.world.loop || 0 : 0, goal: this.world ? this.world.goalTier : 5 }; }

    // ---------------- pre-rendered scenes ----------------
    _slot(b) { return EG.Assets.SLOTS[3 + b].id; }
    _custom(b) { return EG.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (EG.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    _canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* {sky, far, near}: sky/far = one tile (scaled to the screen height) in device px; near = full-screen canvas with the
     * foreground props and the vignette. With a custom picture: near holds the picture (cover) and there is no sky/far. */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = EG.Assets, n = A.SEASONS[b], px = this.px, VW = this.VW, VH = this.VH, info = ZONE_INFO[b];
      const near = this._canvas(VW * px, VH * px), g = near.getContext('2d');
      g.imageSmoothingQuality = 'high';
      g.setTransform(px, 0, 0, px, 0, 0);
      bg = { sky: null, far: null, near };
      if (this._custom(b)) {
        const im = A.custom[this._slot(b)], k = Math.max(VW / im.width, VH / im.height);
        g.drawImage(im, (VW - im.width * k) / 2, (VH - im.height * k) / 2, im.width * k, im.height * k);
        bg.custom = true;
      } else {
        const k = VH / 540, tw = Math.round(960 * k * px), th = Math.round(VH * px);
        const tile = name => {
          const im = A.img[n + '_' + name]; if (!im) return null;
          const c = this._canvas(tw, th), cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high';
          cg.drawImage(im, 0, 0, tw, th); return c;
        };
        bg.sky = tile('sky'); bg.far = tile('far');
        if (!bg.sky) { bg.sky = this._canvas(tw, th); const sg = bg.sky.getContext('2d'); sg.fillStyle = info.dark; sg.fillRect(0, 0, tw, th); }
        const im = A.img[n + '_near'];
        if (im) {
          const kn = clamp(VH / 760, 1, 1.4), w = 960 * kn, h = 540 * kn, y = VH - h;
          let x0 = VW / 2 - w / 2; while (x0 > 0) x0 -= w;
          for (let x = x0; x < VW; x += w) g.drawImage(im, x, y, w, h);
        }
      }
      // vignette: calms the edges (and the repeated props on wide screens)
      const vg = g.createRadialGradient(VW / 2, VH * 0.55, Math.min(VW, VH) * 0.35, VW / 2, VH * 0.55, Math.max(VW, VH) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, info.vig);
      g.fillStyle = vg; g.fillRect(0, 0, VW, VH);
      this._bg.set(key, bg);
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
    drawSceneBack(g, b, alpha) {
      const bg = this.background(b);
      if (bg.custom) { g.globalAlpha = alpha; g.drawImage(bg.near, 0, 0); g.globalAlpha = 1; return; }
      this._blitTile(g, bg.sky, this.drift * 4, alpha);
      this._blitTile(g, bg.far, this.drift * 1.5, alpha);
      g.globalAlpha = 1;
    }
    drawSceneNear(g, b, alpha) {
      const bg = this.background(b);
      if (bg.custom) return;
      g.globalAlpha = alpha; g.drawImage(bg.near, 0, 0); g.globalAlpha = 1;
    }

    /* The glow-board panel: dark glass with a stone frame and faint cell sockets (pre-rendered per layout). */
    boardPanel() {
      const L = this.world.layout, px = this.px;
      const key = L.boardX + ',' + L.boardY + ',' + L.cell + ',' + L.rows + ',' + px.toFixed(3);
      if (this._board && this._board.key === key) return this._board;
      const m = Math.round(L.cell * 0.32), w = L.boardW + m * 2, h = L.boardH + m * 2;
      const c = this._canvas(w * px, h * px), g = c.getContext('2d');
      g.setTransform(px, 0, 0, px, 0, 0);
      const r = L.cell * 0.36, fw = Math.max(5, L.cell * 0.14);
      const rr = (x, y, ww, hh, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + ww, y, x + ww, y + hh, rad); g.arcTo(x + ww, y + hh, x, y + hh, rad); g.arcTo(x, y + hh, x, y, rad); g.arcTo(x, y, x + ww, y, rad); g.closePath(); };
      // soft dark halo so the lights pop over any background
      g.shadowColor = 'rgba(8,4,24,.65)'; g.shadowBlur = m * 0.9;
      rr(m - fw, m - fw, L.boardW + fw * 2, L.boardH + fw * 2, r + fw);
      g.fillStyle = '#4a3a78'; g.fill();
      g.shadowBlur = 0;
      // stone frame: two tones + highlight
      const fr = g.createLinearGradient(0, m - fw, 0, m + L.boardH + fw);
      fr.addColorStop(0, '#9c8ad0'); fr.addColorStop(0.5, '#6f5ca8'); fr.addColorStop(1, '#4b3b80');
      g.fillStyle = fr; g.fill();
      g.lineWidth = 2; g.strokeStyle = '#2b1f52'; g.stroke();
      // glass
      rr(m, m, L.boardW, L.boardH, r);
      const gl = g.createLinearGradient(0, m, 0, m + L.boardH);
      gl.addColorStop(0, 'rgba(32,22,72,.90)'); gl.addColorStop(1, 'rgba(22,15,50,.94)');
      g.fillStyle = gl; g.fill();
      g.lineWidth = 2; g.strokeStyle = 'rgba(20,12,44,.9)'; g.stroke();
      // faint column lanes and cell sockets
      for (let cI = 0; cI < L.cols; cI++) {
        if (cI % 2 === 1) { g.fillStyle = 'rgba(255,255,255,.025)'; g.fillRect(m + cI * L.cell, m, L.cell, L.boardH); }
        for (let rI = 0; rI < L.rows; rI++) {
          g.beginPath(); g.arc(m + (cI + 0.5) * L.cell, m + (rI + 0.5) * L.cell, L.cell * 0.36, 0, TAU);
          g.fillStyle = 'rgba(150,130,230,.06)'; g.fill();
        }
      }
      // gloss along the top
      g.save(); rr(m, m, L.boardW, L.boardH, r); g.clip();
      const gs = g.createLinearGradient(0, m, 0, m + L.cell * 1.2);
      gs.addColorStop(0, 'rgba(255,255,255,.08)'); gs.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gs; g.fillRect(m, m, L.boardW, L.cell * 1.2); g.restore();
      // little stone knobs at the corners
      [[m - fw * 0.5, m - fw * 0.5], [m + L.boardW + fw * 0.5, m - fw * 0.5], [m - fw * 0.5, m + L.boardH + fw * 0.5], [m + L.boardW + fw * 0.5, m + L.boardH + fw * 0.5]].forEach(([x, y]) => {
        g.beginPath(); g.arc(x, y, fw * 1.1, 0, TAU); g.fillStyle = '#b5a4e6'; g.fill(); g.lineWidth = 2; g.strokeStyle = '#2b1f52'; g.stroke();
        g.beginPath(); g.arc(x - fw * 0.3, y - fw * 0.3, fw * 0.35, 0, TAU); g.fillStyle = 'rgba(255,255,255,.6)'; g.fill();
      });
      this._board = { key, c, x: L.boardX - m, y: L.boardY - m, w, h };
      return this._board;
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world, L = w && w.layout, wx = this.weather;
      for (const e of evts) {
        switch (e.type) {
          case 'drop': this.heldPop = 0; this.hintOn = false; break;
          case 'land': {
            const it = e.item, v = clamp((e.speed || 0) / 1400, 0, 1);
            if (v > 0.25 && wx) wx.burst('puff', it.x, it.y + L.itemSize * 0.42, 3 + Math.round(v * 3), { speed: 70, life: 0.45, size: 10 * L.cell / 55, gravity: -20, spread: 2.4, spin: 1, layer: 'front' });
            if (it.kind === 'pumpkin') this.shake = Math.max(this.shake, 3);
            break;
          }
          case 'merge': {
            const col = e.super ? '#ffffff' : TIER[clamp(e.tier, 1, 8)].col, s = L.cell / 55;
            this.ring(e.x, e.y, col, 0.45, L.cell * (0.9 + e.count * 0.12), 4);
            if (wx) {
              wx.burst('sparkle', e.x, e.y, 6 + Math.min(10, e.count * 2 + e.tier), { speed: 150 * s, life: 0.6, size: 12 * s, gravity: 40, layer: 'front' });
              if (e.tier >= 5) wx.burst('star', e.x, e.y, 6, { speed: 190 * s, life: 0.8, size: 14 * s, gravity: 160, up: 0.6, layer: 'front' });
            }
            this.pop('+' + e.points, e.x, e.y - L.cell * 0.55, '#fff2b0', 18 + Math.min(10, e.tier));
            if (e.super) { this.say('Super Moon!', e.x, e.y - L.cell * 1.2, '#e9e2ff', 30); this.flash = 0.5; this.shake = 8; }
            else if (e.count >= 3) this.say(e.count >= 4 ? 'Mega merge!' : 'Triple!', e.x, e.y - L.cell * 1.1, '#ffd2f0', 22);
            break;
          }
          case 'combo': this.comboShow = 1.2; if (e.combo >= 3) this.say('Combo ×' + e.combo + '!', L.boardX + L.boardW / 2, L.boardY + L.cell * 0.9, '#ffe14d', 24); break;
          case 'newTier': if (e.tier >= 4) this.say('New: ' + TIER[e.tier].name + '!', L.boardX + L.boardW / 2, L.boardY + L.cell * 1.7, TIER[e.tier].col, 22); break;
          case 'helper': this.say('Boo is here to help!', L.boardX + L.boardW / 2, L.boardY + L.cell * 0.9, '#f3eeff', 24); break;
          case 'helperCarry': if (wx) wx.burst('heart', e.item.x, e.item.y, 4, { speed: 90, life: 0.8, size: 12 * L.cell / 55, gravity: -60, layer: 'front' }); break;
          case 'pumpkinWake': {
            const p = e.item;
            if (wx) wx.burst('puff', p.x, p.y, 5, { speed: 90, life: 0.5, size: 12, gravity: -30, layer: 'front' });
            this.pop('+10', p.x, p.y - L.cell * 0.5, '#ffc27a', 18);
            break;
          }
          case 'rise': this.shake = Math.max(this.shake, 2.5); if (wx) wx.burst('puff', L.boardX + (e.col + 0.5) * L.cell, L.boardY + L.boardH, 4, { speed: 60, life: 0.5, size: 12, gravity: -40, layer: 'front' }); break;
          case 'refuse': {
            const x = L.boardX + (e.col + 0.5) * L.cell;
            this.say('Full!', x, L.boardY + L.cell * 0.5, '#ffb0b0', 20);
            this.lane = { col: e.col, t: 0.5 };
            break;
          }
          case 'goal': {
            this.flash = 0.6; this.flashCol = '#fff2c4';
            this.say(TIER[clamp(e.tier, 1, 8)].name + '! The castle glows!', L.boardX + L.boardW / 2, L.boardY + L.cell * 1.4, '#ffe9a8', 26);
            this.pop('+' + e.bonus, e.x, e.y - L.cell * 0.7, '#ffe14d', 26);
            if (wx) wx.burst('star', e.x, e.y, 14, { speed: 260, life: 1.0, size: 16 * L.cell / 55, gravity: 200, up: 0.4, layer: 'front' });
            break;
          }
          case 'levelUp': this.showBanner(e.zone); break;
          case 'gameOver': this.shake = 6; this.say('No room left!', L.boardX + L.boardW / 2, L.boardY + L.boardH * 0.4, '#ffd0e8', 28); break;
        }
      }
    }
    _quiet() { return EG.Game && EG.Game.mode === 'title'; }   // the title demo stays calm behind the menu
    ring(x, y, col, life, r, wdt) {
      if (this._quiet()) return; this.fx.push({ kind: 'ring', x, y, col, t: 0, life, r, w: wdt || 3 }); if (this.fx.length > 40) this.fx.shift(); }
    pop(txt, x, y, col, size) {
      if (this._quiet()) return; this.texts.push({ txt, x, y, col, size, t: 0, life: 0.9, vy: -55 }); if (this.texts.length > 24) this.texts.shift(); }
    say(txt, x, y, col, size) {
      if (this._quiet()) return;
      for (const t of this.texts) if (t.big && t.t < 0.4) t.y -= size * 1.1;   // stack, don't overlap
      this.texts.push({ txt, x, y, col, size, t: 0, life: 1.5, vy: -18, big: true }); if (this.texts.length > 24) this.texts.shift();
    }

    update(dt) {
      this.time += dt; this.drift += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 0.9);
      this.shake = Math.max(0, this.shake - dt * 18);
      this.flash = Math.max(0, this.flash - dt * 1.6);
      this.heldPop = Math.min(1, this.heldPop + dt / 0.28);
      this.comboShow = Math.max(0, this.comboShow - dt);
      if (this.lane) { this.lane.t -= dt; if (this.lane.t <= 0) this.lane = null; }
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter(f => f.t < f.life);
      for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; }
      this.texts = this.texts.filter(t => t.t < t.life);
    }

    // ---------------- drawing ----------------
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      const v = this.vis;
      if (v.t < 1) { this.drawSceneBack(g, v.prev, 1); this.drawSceneBack(g, v.cur, v.t); }
      else this.drawSceneBack(g, v.cur, 1);
      g.setTransform(px, 0, 0, px, 0, 0);
      this.drawParticles(g, 'back');
      g.setTransform(1, 0, 0, 1, 0, 0);
      if (v.t < 1) { this.drawSceneNear(g, v.prev, 1 - v.t); this.drawSceneNear(g, v.cur, v.t); }
      else this.drawSceneNear(g, v.cur, 1);
      if (!w) return;
      const sh = this.shake > 0 ? this.shake : 0;
      const sx = sh ? Math.sin(this.time * 71) * sh : 0, sy = sh ? Math.cos(this.time * 53) * sh * 0.6 : 0;
      g.setTransform(px, 0, 0, px, sx * px, sy * px);
      const tint = this.weather && this.weather.ambient && this.weather.ambient.tint;
      if (tint) { g.fillStyle = tint; g.fillRect(0, 0, this.VW, this.VH); }
      const bp = this.boardPanel();
      g.drawImage(bp.c, bp.x, bp.y, bp.w, bp.h);
      this.drawLane(g, w, mode);
      this.drawItems(g, w);
      this.drawBoo(g, w);
      this.drawEmber(g, w, mode);
      this.drawParticles(g, 'front');
      this.drawFx(g);
      if (this.debug) this.drawDebug(g, w);
      g.setTransform(px, 0, 0, px, 0, 0);
      if (mode !== 'title') this.drawHud(g, w, mode);
      if (this.banner && mode !== 'title') this.drawBanner(g);
      if (this.flash > 0) { g.globalAlpha = Math.min(0.55, this.flash * 0.8); g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.globalAlpha = 1; }
    }

    spr(key, w, h) { return EG.Assets.sprite(key, w, h); }

    drawLane(g, w, mode) {
      const L = w.layout;
      if (this.lane) {   // refused column flashes softly red
        g.globalAlpha = clamp(this.lane.t * 2, 0, 1) * 0.35; g.fillStyle = '#ff6a8a';
        g.fillRect(L.boardX + this.lane.col * L.cell + 2, L.boardY, L.cell - 4, L.boardH); g.globalAlpha = 1;
      }
      if (w.phase === 'over' || !w.held) return;
      const col = w.ember.targetCol;
      // aim lane: a soft beam under Ember
      const x = L.boardX + col * L.cell, gr = g.createLinearGradient(0, L.boardY, 0, L.boardY + L.boardH);
      const c = TIER[w.held.tier] ? TIER[w.held.tier].col : '#ffb36b';
      gr.addColorStop(0, this._alpha(c, 0.16)); gr.addColorStop(1, this._alpha(c, 0.04));
      g.fillStyle = gr; g.fillRect(x + 3, L.boardY + 2, L.cell - 6, L.boardH - 4);
      // landing ghost: where the light will land (unless the column refuses it)
      if (mode !== 'title' && !w.isBusy() && w.canDrop(col)) {
        const h = w._stacks[col].length;
        if (h < L.rows) {
          const y = L.boardY + L.boardH - (h + 0.5) * L.cell, cx = x + L.cell / 2;
          g.globalAlpha = 0.28 + 0.1 * Math.sin(this.time * 5);
          g.setLineDash([5, 5]); g.lineWidth = 2; g.strokeStyle = c;
          g.beginPath(); g.arc(cx, y, L.itemSize * 0.42, 0, TAU); g.stroke(); g.setLineDash([]);
          g.globalAlpha = 1;
        }
      }
    }
    _alpha(hex, a) {
      const n = parseInt(hex.slice(1), 16);
      return 'rgba(' + (n >> 16 & 255) + ',' + (n >> 8 & 255) + ',' + (n & 255) + ',' + a + ')';
    }

    /* One light (or pumpkin) at (x,y) with size s, squash q (+ = wide), rotation and alpha. */
    drawLight(g, kind, tier, x, y, s, q, rot, alpha, awake) {
      const A = EG.Assets;
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y + s * q * 0.18);
      if (rot) g.rotate(rot);
      g.scale(1 + q * 0.6, 1 - q * 0.5);
      if (kind === 'pumpkin') {
        const im = this.spr(awake ? 'pumpkin_awake' : 'pumpkin', s, s);
        if (im) g.drawImage(im, -s / 2, -s / 2, s, s); else { g.fillStyle = '#ff9b3d'; g.beginPath(); g.arc(0, 0, s * 0.4, 0, TAU); g.fill(); }
      } else if (A.hasCustom('item')) {
        const t = clamp(tier, 1, 8), col = TIER[t].col, k = 0.78 + 0.04 * t, ss = s * k;
        g.beginPath(); g.arc(0, 0, ss * 0.52, 0, TAU); g.fillStyle = this._alpha(col, 0.35); g.fill();
        g.lineWidth = Math.max(3, s * 0.08); g.strokeStyle = col; g.stroke();
        const [fw, fh] = A.fit('item', ss * 0.86, ss * 0.86), im = this.spr('custom:item', fw, fh);
        if (im) g.drawImage(im, -fw / 2, -fh / 2, fw, fh);
        // tier pips under the picture
        const pr = Math.max(2, s * 0.045), n = t, gap = pr * 2.6;
        for (let i = 0; i < n; i++) { g.beginPath(); g.arc((i - (n - 1) / 2) * gap, ss * 0.52, pr, 0, TAU); g.fillStyle = '#fff'; g.fill(); g.lineWidth = 1; g.strokeStyle = col; g.stroke(); }
      } else {
        const t = clamp(tier, 1, 8), ss = t === 8 ? s * 1.08 : s, im = this.spr('item_' + t, ss, ss);
        if (im) g.drawImage(im, -ss / 2, -ss / 2, ss, ss);
        else { g.fillStyle = TIER[t].col; g.beginPath(); g.arc(0, 0, s * 0.38, 0, TAU); g.fill(); }
      }
      g.restore();
    }

    drawItems(g, w) {
      const L = w.layout, a = w.alpha || 0, s0 = L.itemSize;
      for (const it of w.items) {
        if (it.state === 'gone') continue;
        const x = lerp(it.prevX, it.x, a), y = lerp(it.prevY, it.y, a);
        const sc = it.scale == null ? 1 : it.scale, al = it.alpha == null ? 1 : clamp(it.alpha, 0, 1);
        if (al <= 0.01) continue;
        if (it.state === 'ascending') {   // the goal light: a halo while it floats away
          const r = s0 * (0.9 + 0.15 * Math.sin(this.time * 9));
          const hg = g.createRadialGradient(x, y, 0, x, y, r);
          hg.addColorStop(0, 'rgba(255,240,190,.7)'); hg.addColorStop(1, 'rgba(255,240,190,0)');
          g.globalAlpha = al; g.fillStyle = hg; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.globalAlpha = 1;
        }
        const awake = it.kind === 'pumpkin' && (it.state === 'rolling' || it.state === 'carried');
        this.drawLight(g, it.kind, it.tier, x, y, s0 * sc, it.squash || 0, it.rot || 0, al, awake);
      }
    }

    drawEmber(g, w, mode) {
      const e = w.ember, L = w.layout, a = w.alpha || 0, A = EG.Assets;
      const x = lerp(e.prevX, e.x, a), y = lerp(e.prevY, e.y, a) + Math.sin(this.time * 3.2) * L.cell * 0.05;
      const S = L.cell * EMBER_K;
      let frame = e.anim === 'drop' ? 'drop' : e.anim === 'happy' ? 'happy' : e.anim === 'oops' ? 'oops' : ((this.time * 5) % 1 < 0.5 ? 'idle' : 'flap');
      if (w.phase === 'over') frame = 'oops';
      g.save();
      g.translate(x, y);
      g.rotate((e.tilt || 0) * 0.8 + (frame === 'oops' ? Math.sin(this.time * 30) * 0.06 : 0));
      // soft shadow glow under her (a warm firefly light)
      const hg = g.createRadialGradient(0, S * 0.15, 0, 0, S * 0.15, S * 0.6);
      hg.addColorStop(0, 'rgba(255,230,170,.18)'); hg.addColorStop(1, 'rgba(255,230,170,0)');
      g.fillStyle = hg; g.beginPath(); g.arc(0, S * 0.15, S * 0.6, 0, TAU); g.fill();
      if (A.hasCustom('hero')) {
        const flap = Math.sin(this.time * 18), [fw, fh] = A.fit('hero', S * 0.8, S * 0.8);
        // procedural wings so a photo still flies
        g.fillStyle = 'rgba(185,160,245,.9)'; g.strokeStyle = '#563f9e'; g.lineWidth = 2;
        for (const d of [-1, 1]) {
          g.save(); g.scale(d, 1); g.rotate(-0.3 - flap * 0.35);
          g.beginPath(); g.moveTo(fw * 0.3, 0); g.quadraticCurveTo(fw * 0.75, -fh * 0.5, fw * 0.85, -fh * 0.05); g.quadraticCurveTo(fw * 0.6, fh * 0.05, fw * 0.3, fh * 0.12); g.closePath(); g.fill(); g.stroke();
          g.restore();
        }
        const sq = frame === 'drop' ? 0.08 : 0;
        const im = this.spr('custom:hero', fw, fh);
        if (im) g.drawImage(im, -fw / 2 * (1 + sq), -fh / 2 * (1 - sq), fw * (1 + sq), fh * (1 - sq));
      } else {
        const im = this.spr('ember_' + frame, S, S);
        if (im) g.drawImage(im, -S / 2, -S * 78 / 160, S, S);
      }
      // the held light hangs at her paws
      if (w.held && w.phase !== 'over') {
        const k = 0.6 + 0.4 * (1 - Math.pow(1 - this.heldPop, 3)) + (this.heldPop < 1 ? Math.sin(this.heldPop * Math.PI) * 0.15 : 0);
        this.drawLight(g, w.held.kind, w.held.tier, 0, S * HOLD_DY - L.cell * 0.04, L.itemSize * 0.92 * k, 0, 0, 1, false);
      }
      g.restore();
    }

    drawBoo(g, w) {
      const b = w.boo; if (!b || !b.active) return;
      const L = w.layout, a = w.alpha || 0, A = EG.Assets;
      const x = lerp(b.prevX, b.x, a), y = lerp(b.prevY, b.y, a) + Math.sin(this.time * 4) * L.cell * 0.06;
      const S = L.cell * BOO_K, carry = b.state === 'carry';
      g.save(); g.translate(x, y);
      g.rotate(Math.sin(this.time * 2.3) * 0.08);
      g.globalAlpha = 0.95;
      if (A.hasCustom('helper')) {
        const [fw, fh] = A.fit('helper', S * 0.85, S * 0.85), im = this.spr('custom:helper', fw, fh);
        const sq = Math.sin(this.time * 6) * 0.05;
        if (im) g.drawImage(im, -fw / 2 * (1 + sq), -fh / 2 * (1 - sq), fw * (1 + sq), fh * (1 - sq));
      } else {
        const im = this.spr(carry ? 'boo_carry' : 'boo', S, S);
        if (im) g.drawImage(im, -S / 2, -S * 60 / 128, S, S);
      }
      g.restore(); g.globalAlpha = 1;
    }

    drawParticles(g, layer) {
      const wx = this.weather; if (!wx) return;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const im = this.spr('p_' + p.sprite, p.size, p.size);
        if (!im) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.rot || p.flipX) {
          g.save(); g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
          g.drawImage(im, -p.size / 2, -p.size / 2, p.size, p.size); g.restore();
        } else g.drawImage(im, p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
      g.globalAlpha = 1;
    }

    drawFx(g) {
      for (const f of this.fx) {
        const k = f.t / f.life;
        if (f.kind === 'ring') {
          g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = f.col; g.lineWidth = f.w * (1 - k) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.r * (0.3 + 0.7 * Math.sqrt(k)), 0, TAU); g.stroke();
        }
      }
      g.globalAlpha = 1;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const k = t.t / t.life, sc = t.big ? (k < 0.15 ? 0.6 + k / 0.15 * 0.5 : k < 0.25 ? 1.1 - (k - 0.15) : 1) : 1;
        const x = clamp(t.x, 80, this.VW - 80);
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = '900 ' + Math.round(t.size * sc * this._hudK) + 'px ' + FONT;
        g.lineWidth = Math.max(3, t.size * 0.22); g.strokeStyle = 'rgba(30,16,60,.9)'; g.strokeText(t.txt, x, t.y);
        g.fillStyle = t.col; g.fillText(t.txt, x, t.y);
      }
      g.globalAlpha = 1;
    }

    // ---------------- HUD ----------------
    _panel(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
      g.fillStyle = 'rgba(28,18,62,.72)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(190,170,255,.45)'; g.stroke();
    }
    _text(g, txt, x, y, size, col, align, weight) {
      g.font = (weight || '900') + ' ' + Math.round(size) + 'px ' + FONT; g.textAlign = align || 'left'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, size * 0.18); g.strokeStyle = 'rgba(24,14,52,.95)'; g.strokeText(txt, x, y);
      g.fillStyle = col; g.fillText(txt, x, y);
    }
    drawHud(g, w, mode) {
      const L = w.layout, K = this._hudK, I = this.ins, VW = this.VW;
      const best = EG.Game ? EG.Game.best() : 0;
      if (!L.portrait) {
        // left: goal + next; right: score + combo
        const spaceL = L.boardX - I.left - 26, pw = clamp(spaceL - 10, 110, 170) , lx = Math.max(I.left + 12, L.boardX - 26 - pw);
        const top = Math.max(I.top + 14, 14);
        this._panel(g, lx, top, pw, 196, 18);
        this._text(g, 'GOAL', lx + pw / 2, top + 20, 15 * Math.min(K, 1.2), '#ffd98a', 'center');
        this._goal(g, w, lx + pw / 2, top + 72, 74);
        this._text(g, TIER[clamp(w.goalTier, 1, 8)].name, lx + pw / 2, top + 120, 14 * Math.min(K, 1.2), '#fff', 'center', '800');
        this._text(g, 'NEXT', lx + pw / 2 - 26, top + 162, 14 * Math.min(K, 1.2), '#c9bdf5', 'center');
        if (w.next) this.drawLight(g, w.next.kind, w.next.tier, lx + pw / 2 + 30, top + 162, 40, 0, 0, 1, false);
        this._rise(g, w, lx + pw / 2, top + 222, pw);
        const rx = L.boardX + L.boardW + 26, rw = clamp(VW - I.right - 12 - rx, 110, 170);
        const rtop = Math.max(top, (this._hudBtn ? this._hudBtn.b + 8 : 70));
        this._panel(g, rx, rtop, rw, 150, 18);
        this._text(g, 'SCORE', rx + rw / 2, rtop + 20, 15 * Math.min(K, 1.2), '#c9bdf5', 'center');
        this._text(g, String(w.score), rx + rw / 2, rtop + 56, 36 * Math.min(K, 1.15), '#fff', 'center');
        this._text(g, 'Best ' + Math.max(best, w.score), rx + rw / 2, rtop + 88, 13 * Math.min(K, 1.2), '#ffd98a', 'center', '800');
        this._combo(g, w, rx + rw / 2, rtop + 124, rw - 24);
        this._text(g, ZONE_INFO[w.zone % 4].name + (w.loop ? ' ★' + (w.loop + 1) : ''), rx + rw / 2, rtop + 176, 13 * Math.min(K, 1.2), ZONE_INFO[w.zone % 4].color, 'center', '800');
        if (this.hintOn && mode === 'playing') this._text(g, ZONE_INFO[0].hint, L.boardX + L.boardW / 2, L.boardY + L.boardH * 0.45, 17 * Math.min(K, 1.3), '#fff', 'center', '800');
      } else {
        // portrait: a strip on top — score (left), goal + next (centre/right of it); the DOM buttons sit top-right
        const top = I.top + 12, x0 = I.left + 14, hb = this._hudBtn, right = hb ? hb.l - 10 : VW - 120;
        this._panel(g, x0, top, Math.max(150, right - x0), 92, 18);
        this._text(g, String(w.score), x0 + 16, top + 34, 34, '#fff', 'left');
        this._text(g, 'Best ' + Math.max(best, w.score), x0 + 16, top + 70, 14, '#ffd98a', 'left', '800');
        const gx = x0 + Math.max(150, right - x0) - 112;
        this._goal(g, w, gx, top + 46, 62);
        this._text(g, 'GOAL', gx, top + 84, 11, '#ffd98a', 'center');
        this._text(g, 'NEXT', gx + 66, top + 18, 11, '#c9bdf5', 'center');
        if (w.next) this.drawLight(g, w.next.kind, w.next.tier, gx + 66, top + 50, 40, 0, 0, 1, false);
        const y2 = top + 104;
        this._combo(g, w, VW / 2, y2 + 14, Math.min(260, VW - 60));
        this._rise(g, w, VW / 2, y2 + 46, 260);
        if (this.hintOn && mode === 'playing') this._text(g, ZONE_INFO[0].hint, L.boardX + L.boardW / 2, L.boardY + L.boardH * 0.45, 20, '#fff', 'center', '800');
      }
    }
    _goal(g, w, x, y, s) {
      const ring = this.spr('goal_ring', s, s);
      const pulse = 1 + 0.05 * Math.sin(this.time * 4);
      if (ring) g.drawImage(ring, x - s / 2, y - s / 2, s, s);
      g.save(); g.globalAlpha = (w.maxTier || 0) >= w.goalTier ? 1 : 0.95;
      this.drawLight(g, 'light', clamp(w.goalTier, 1, 8), x, y, s * 0.62 * pulse, 0, 0, 1, false);
      g.restore();
    }
    /* Combo meter: 5 little ghost-dots fill up; Boo comes at 5. */
    _combo(g, w, cx, y, wd) {
      const n = 5, c = w.combo || 0, filled = c > 0 ? ((c - 1) % n) + 1 : 0, r = 7, gap = Math.min(26, (wd - 70) / n);
      this._text(g, 'Boo', cx - (n * gap) / 2 - 16, y, 13, '#f3eeff', 'center', '800');
      for (let i = 0; i < n; i++) {
        const x = cx - (n * gap) / 2 + 12 + i * gap, on = i < filled;
        g.beginPath(); g.arc(x, y, on ? r * (this.comboShow > 0 ? 1.15 : 1) : r * 0.8, 0, TAU);
        g.fillStyle = on ? '#f3eeff' : 'rgba(243,238,255,.18)'; g.fill();
        if (on) { g.lineWidth = 2; g.strokeStyle = '#8f7fd6'; g.stroke(); }
      }
      if (c >= 2) this._text(g, '×' + c, cx + (n * gap) / 2 + 22, y, 15, '#ffe14d', 'center');
    }
    /* Night-creep counter: little pumpkin + "N" drops until pumpkins rise. */
    _rise(g, w, cx, y, wd) {
      if (!(w.riseIn > 0) || (w.level || 0) < (w.diff && w.diff.riseFrom != null ? w.diff.riseFrom : 1)) return;
      const im = this.spr('pumpkin', 26, 26), soon = w.riseIn <= 2;
      if (im) g.drawImage(im, cx - 44, y - 13, 26, 26);
      this._text(g, 'rise in ' + w.riseIn, cx + 10, y, 13, soon ? '#ffb36b' : '#e8dcff', 'center', '800');
    }

    drawBanner(g) {
      const b = this.banner, info = ZONE_INFO[b.s % 4], t = b.t, L = this.world.layout;
      const a = t < 0.35 ? t / 0.35 : t > 2.1 ? Math.max(0, (2.6 - t) / 0.5) : 1;
      const y = L.boardY + Math.min(L.boardH * 0.3, L.cell * 2.2) - (1 - a) * 16, cx = L.boardX + L.boardW / 2;
      const w = Math.min(this.VW - 40, Math.max(L.boardW + 80, 360)), h = 92;
      g.globalAlpha = a * 0.94;
      this._panel(g, cx - w / 2, y - h / 2, w, h, 22);
      g.globalAlpha = a;
      this._text(g, info.name + (b.loop ? '  ★' + (b.loop + 1) : ''), cx, y - 18, 28, info.color, 'center');
      this._text(g, 'Make a ' + TIER[clamp(b.goal, 1, 8)].name + '!', cx - 18, y + 22, 18, '#fff', 'center', '800');
      this.drawLight(g, 'light', clamp(b.goal, 1, 8), cx + 18 + g.measureText('Make a ' + TIER[clamp(b.goal, 1, 8)].name + '!').width / 2 + 6, y + 22, 34, 0, 0, a, false);
      g.globalAlpha = 1;
    }

    drawDebug(g, w) {
      const L = w.layout;
      g.strokeStyle = 'rgba(0,255,120,.6)'; g.lineWidth = 1;
      for (let c = 0; c <= L.cols; c++) { g.beginPath(); g.moveTo(L.boardX + c * L.cell, L.boardY); g.lineTo(L.boardX + c * L.cell, L.boardY + L.boardH); g.stroke(); }
      for (let r = 0; r <= L.rows; r++) { g.beginPath(); g.moveTo(L.boardX, L.boardY + r * L.cell); g.lineTo(L.boardX + L.boardW, L.boardY + r * L.cell); g.stroke(); }
      g.fillStyle = '#0f8'; g.font = '11px monospace'; g.textAlign = 'left';
      g.fillText(w.phase + ' combo ' + w.combo + ' items ' + w.items.length + ' rise ' + w.riseIn, L.boardX, L.boardY + L.boardH + 14);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.TIER = TIER;
  EG.Renderer = Renderer;
})(window.EG = window.EG || {});
