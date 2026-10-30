/* CD.Renderer — draws the candy biome (pixel-exact ground/zone/edge layers), y-sorted gems/bears/Pip with
 * shadows, the gate, weather particles, juicy effects and the HUD (hearts, size pips, score, gem jar).
 * Logical space 960×540, letter-boxed. Performance rules from the sister games apply. */
(function (CD) {
  'use strict';
  const W = 960, H = 540;
  const BIOME_INFO = [
    { name: 'Gumdrop Meadow', color: '#6fd39a', dark: '#2d7a52', hint: 'Scoop up the candy gems!' },
    { name: 'Chocolate River', color: '#b07a52', dark: '#5a3418', hint: 'Sticky chocolate! Cross on the wafer bridges' },
    { name: 'Cotton Candy Clouds', color: '#f29ad0', dark: '#a8407e', hint: 'Boing! Puffs bounce you around' },
    { name: 'Ice-Cream Glacier', color: '#8fd3ff', dark: '#2d6aa3', hint: 'Slippery ice: slide with care!' }
  ];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const easeOutBack = t => 1 + 2.70158 * Math.pow(t - 1, 3) + 1.70158 * Math.pow(t - 1, 2);
  const PIP = 60, BEAR = 52, GEM = 30;           // drawn sizes at scale 1
  const PIP_FOOT = 90 / 96, BEAR_FOOT = 76 / 80;  // feet anchor as a fraction of the sprite height
  const GEM_COLORS = { pink: '#ff7ab8', blue: '#5ab4ff', yellow: '#ffd23c', green: '#5fd38a' };
  const BEAR_COLORS = { red: '#ff5a6e', green: '#4fcf7a', orange: '#ff9a3d' };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0;
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.pointer = null;
      this._ox = 0; this._oy = 0;
      this._order = [];
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
      this.px = Math.min(s * dpr, this.maxPx || 2);
      this.canvas.width = Math.round(W * this.px);
      this.canvas.height = Math.round(H * this.px);
      const ox = (vw - W * s) / 2, oy = (vh - H * s) / 2;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast'), act = document.getElementById('btnAction');
      if (hud) { hud.style.top = (oy + 14 * s) + 'px'; hud.style.right = (ox + 14 * s) + 'px'; }
      if (toast) toast.style.bottom = (oy + 30 * s) + 'px';
      if (act) { act.style.right = (ox + 24 * s) + 'px'; act.style.bottom = (oy + 24 * s) + 'px'; }
      CD.Assets.setScale(this.px);
      if (this.vis) CD.Assets.warmSeason(this.vis.cur);
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * W, (cy - r.top) / r.height * H]; }
    attach(world, weather) { this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0; this.banner = null; this.shake = 0; this.flash = 0; }

    setSeason(i, instant) {
      i = ((i % 4) + 4) % 4;
      CD.Assets.warmSeason((i + 1) % 4); CD.Assets.warmSeason(0);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(b) { this.banner = { s: b, t: 0 }; }

    // ---------------- events → effects ----------------
    onEvents(evts) {
      const w = this.world;
      for (const e of evts) {
        switch (e.type) {
          case 'gem': {
            const col = GEM_COLORS[e.color] || '#ffffff';
            this.sparks(e.x, e.y - 10, 8, col);
            this.texts.push({ text: '+' + e.points, x: e.x, y: e.y - 34, life: 0, max: 0.9, size: 18 + 3 * (e.size || 1), color: (e.size || 1) >= 4 ? '#ffe14d' : '#ffffff' });
            break;
          }
          case 'grow': this.ring(w.pip.x, w.pip.y - 20, '#ffffff', 0.35); break;
          case 'maxsize': this.texts.push({ text: 'Max size! Press SPACE to Pop!', x: clamp(w.pip.x, 240, 720), y: Math.max(150, w.pip.y - 90), life: 0, max: 1.8, size: 20, color: '#ffe14d' }); break;
          case 'pop': {
            this.flash = Math.max(this.flash, 0.35); this.shake = 0.15;
            for (let i = 0; i < 24; i++) {
              const a = Math.random() * TAU, sp = 140 + Math.random() * 260;
              this.fx.push({ k: 'sprite', spr: 'p_star', x: e.x, y: e.y - 20, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 200, life: -i * 0.01, max: 0.9, size: 14 + Math.random() * 10, rot: 0, vr: (Math.random() - .5) * 8 });
            }
            this.sparks(e.x, e.y - 20, 30, '#ffe14d');
            this.fx.push({ k: 'circle', x: e.x, y: e.y - 20, life: 0, max: 0.6, r0: 20, r1: 170, color: '#ffffff' });
            this.texts.push({ text: 'POP! +' + e.points, x: e.x, y: Math.max(120, e.y - 70), life: 0, max: 1.3, size: 32, color: '#ffe14d' });
            break;
          }
          case 'dash': this.puffs(e.x, e.y, 5, '#ffffff'); break;
          case 'bump': this.shake = 0.3; this.flash = Math.max(this.flash, 0.2); this.texts.push({ text: 'Boing!', x: e.x, y: Math.max(120, e.y - 60), life: 0, max: 0.9, size: 24, color: '#ffd1e6' }); this.sparks(e.x, e.y - 20, 10, '#ffffff'); break;
          case 'jarfull': this.texts.push({ text: 'Jar full! Find the gate →', x: 585, y: 140, life: 0, max: 2.4, size: 26, color: '#ffe14d', big: true }); break;
          case 'gateopen': this.ring(e.x != null ? e.x : 900, e.y != null ? e.y : 300, '#fff3a0', 0.7, true); break;
          case 'cleared':
            this.flash = Math.max(this.flash, 0.3);
            this.texts.push({ text: 'Biome cleared!', x: 480, y: 230, life: 0, max: 2.2, size: 46, color: '#ffe14d', big: true });
            if (e.bonus) this.texts.push({ text: 'Heart bonus +' + e.bonus, x: 480, y: 282, life: 0, max: 2.2, size: 24, color: '#ffffff', big: true });
            for (let i = 0; i < 30; i++) { const a = Math.random() * TAU, sp = 120 + Math.random() * 220; this.fx.push({ k: 'sprite', spr: 'p_sparkle', x: 480, y: 280, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, life: -i * 0.015, max: 1.3, size: 14 + Math.random() * 12, rot: 0, vr: 3 }); }
            break;
          case 'biome': case 'season': this.showBanner(e.biome != null ? e.biome : e.season); this.setSeason(e.biome != null ? e.biome : e.season); break;
          case 'dead': this.flash = 0.4; this.shake = 0.3; this.texts.push({ text: 'Oh no, out of hearts!', x: 480, y: 250, life: 0, max: 2.5, size: 40, color: '#ffd1e6', big: true }); break;
        }
      }
    }
    sparks(x, y, n, color) {
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 70 + Math.random() * 150; this.fx.push({ k: 'spark', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 80, life: 0, max: 0.35 + Math.random() * 0.25, size: 2 + Math.random() * 2.5, color }); }
    }
    puffs(x, y, n, color) {
      for (let i = 0; i < n; i++) this.fx.push({ k: 'puff', x: x + (Math.random() - .5) * 16, y: y - 4 + (Math.random() - .5) * 6, vx: (Math.random() - .5) * 60, vy: -10 - Math.random() * 30, g: 0, life: 0, max: 0.45 + Math.random() * 0.2, size: 6 + Math.random() * 6, color });
    }
    ring(x, y, color, max, big) { this.fx.push({ k: 'circle', x, y, life: 0, max, r0: 10, r1: big ? 110 : 50, color }); }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.2);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.6) this.banner = null; }
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt * 2.2);
      for (const f of this.fx) {
        f.life += dt; if (f.life < 0) continue;
        f.vy += (f.g || 0) * dt; f.x += (f.vx || 0) * dt; f.y += (f.vy || 0) * dt;
        if (f.vr) f.rot += f.vr * dt;
      }
      this.fx = this.fx.filter(f => f.life < f.max);
      if (this.fx.length > 400) this.fx.splice(0, this.fx.length - 400);
      for (const t of this.texts) { t.life += dt; if (!t.big) t.y -= 34 * dt; }
      this.texts = this.texts.filter(t => t.life < t.max);
      // dash trail
      const w = this.world;
      if (w && w.pip && w.pip.sliding && (this._trail = (this._trail || 0) - dt) < 0) { this._trail = 0.03; this.puffs(w.pip.x, w.pip.y, 1, '#ffffff'); }
    }

    // ---------------- helpers ----------------
    layer(key, alpha) {
      const spr = CD.Assets.sprite(key, W, H);
      if (!spr) return false;
      const g = this.ctx;
      g.setTransform(1, 0, 0, 1, this._ox, this._oy);   // 1:1 device-pixel blit (no resampling)
      if (alpha < 1) g.globalAlpha = alpha;
      g.drawImage(spr, 0, 0);
      g.globalAlpha = 1;
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      return true;
    }
    customBg(slot, alpha) {
      const c = CD.Assets.custom[slot]; if (!c) return false;
      const g = this.ctx, k = Math.max(W / c.width, H / c.height), dw = c.width * k, dh = c.height * k;
      g.globalAlpha = alpha;
      g.drawImage(CD.Assets.sprite('custom:' + slot, dw, dh), (W - dw) / 2, (H - dh) / 2, dw, dh);
      // soften so characters stay readable on a busy photo
      g.fillStyle = 'rgba(255,245,250,0.28)'; g.fillRect(0, 0, W, H);
      g.globalAlpha = 1;
      return true;
    }
    backdrop(b, alpha) {
      const n = CD.Assets.SEASONS[b];
      if (!this.customBg('bg_' + n, alpha) && !this.layer(n + '_ground', alpha)) { const g = this.ctx; g.fillStyle = '#bff0c9'; g.fillRect(0, 0, W, H); }
      if (b) this.layer(n + '_zone', alpha);
    }
    text(str, x, y, size, fill, stroke, align = 'center', lw) {
      const g = this.ctx;
      g.font = `900 ${size}px ${FONT}`; g.textAlign = align; g.textBaseline = 'middle'; g.lineJoin = 'round';
      if (stroke) { g.lineWidth = lw || Math.max(3, size * 0.16); g.strokeStyle = stroke; g.strokeText(str, x, y + size * 0.06); g.strokeText(str, x, y); }
      g.fillStyle = fill; g.fillText(str, x, y);
    }
    roundRect(x, y, w, h, r, g) {
      g = g || this.ctx; g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    fadeLayer(fn, a) {
      const o = this._off || (this._off = document.createElement('canvas'));
      if (o.width !== this.canvas.width || o.height !== this.canvas.height) { o.width = this.canvas.width; o.height = this.canvas.height; }
      const g0 = this.ctx, ox = this._ox, oy = this._oy;
      this.ctx = o.getContext('2d'); this._ox = 0; this._oy = 0;
      this.ctx.setTransform(this.px, 0, 0, this.px, 0, 0); this.ctx.imageSmoothingQuality = 'high';
      try { fn(); } finally { this.ctx = g0; this._ox = ox; this._oy = oy; }
      g0.save(); g0.setTransform(1, 0, 0, 1, ox, oy); g0.globalAlpha = a; g0.drawImage(o, 0, 0); g0.restore();
    }
    shadow(x, y, w, a) {
      const g = this.ctx; g.fillStyle = `rgba(70,30,60,${a})`;
      g.beginPath(); g.ellipse(x, y + 1, w * 0.5, w * 0.16, 0, 0, TAU); g.fill();
    }

    // ---------------- interpolation ----------------
    interp(w) {
      const step = (w.cfg && w.cfg.step) || 1 / 120;
      if (w._acc == null) return false;
      this._a = clamp(w._acc / step, 0, 1);
      const S = this._saved || (this._saved = []); S.length = 0;
      if (w.pip) { this._lerp(w.pip, 'x', '_px'); this._lerp(w.pip, 'y', '_py'); }
      for (const b of w.bears) { this._lerp(b, 'x', '_px'); this._lerp(b, 'y', '_py'); }
      for (const m of w.gems) { this._lerp(m, 'x', '_px'); this._lerp(m, 'y', '_py'); }
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
      if (this._trimKey !== v.cur * 4 + v.prev) { this._trimKey = v.cur * 4 + v.prev; CD.Assets.trimSeasons([v.cur, v.prev, (v.cur + 1) % 4, 0]); }

      if (v.t < 1 && v.prev !== v.cur) { this.backdrop(v.prev, 1); this.fadeLayer(() => this.backdrop(v.cur, 1), v.t); }
      else this.backdrop(v.cur, 1);
      if (this.weather) { this.ambient(this.weather.ambient); this.particles('back'); }
      if (w) {
        this.drawGate();
        this.drawEntities(mode);
      }
      this.layer(CD.Assets.SEASONS[v.cur] + '_edge', 1);
      if (this.weather) this.particles('front');
      this.drawFx();
      if (mode !== 'title') this.drawTexts();   // no score pop-ups over the title logo
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      if (this.flash > 0) { g.fillStyle = `rgba(255,255,255,${(this.flash * 0.55).toFixed(3)})`; g.fillRect(0, 0, W, H); }
      if (w && w.state === 'dead') { g.fillStyle = 'rgba(60,20,50,0.22)'; g.fillRect(0, 0, W, H); }
      if (w && (mode === 'playing' || mode === 'paused')) this.hud();
      if (this.banner && mode !== 'title') this.drawBanner();
      if (this.debug && w) this.debugDraw();
      if (lerped) this.uninterp();
    }

    ambient(a) {
      if (!a) return;
      const g = this.ctx;
      if (a.tint) { g.fillStyle = a.tint; g.fillRect(0, 0, W, H); }
      if (a.fog > 0) { g.globalAlpha = clamp(a.fog, 0, 1) * 0.4; g.fillStyle = '#ffffff'; g.fillRect(0, 0, W, H); g.globalAlpha = 1; }
    }
    particles(layer) {
      const g = this.ctx, A = CD.Assets;
      for (const p of this.weather.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        g.globalAlpha = clamp(p.alpha, 0, 1);
        if (p.sprite === 'dot') { g.fillStyle = p.color || '#ffffff'; g.beginPath(); g.arc(p.x, p.y, p.size * 0.5, 0, TAU); g.fill(); continue; }
        const spr = A.sprite('p_' + p.sprite, 32, 32); if (!spr) continue;
        const fx = p.flipX == null ? 1 : (Math.abs(p.flipX) < 0.22 ? 0.22 * Math.sign(p.flipX || 1) : p.flipX);
        g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
        g.translate(p.x, p.y); g.rotate(p.rot || 0); g.scale(fx, 1);
        g.drawImage(spr, -p.size / 2, -p.size / 2, p.size, p.size);
      }
      g.setTransform(this.px, 0, 0, this.px, this._ox, this._oy);
      g.globalAlpha = 1;
    }

    drawGate() {
      const g = this.ctx, gt = this.world.gate, A = CD.Assets;
      if (!gt) return;
      const open = gt.open, gw = 90, gh = 120, bx = gt.x, by = gt.y + 60;
      if (open) {   // warm glow invites Pip in
        const p = 0.5 + 0.5 * Math.sin(this.time * 4);
        g.globalAlpha = 0.25 + 0.2 * p; g.fillStyle = '#fff3a0';
        g.beginPath(); g.ellipse(bx, by - 50, 62, 78, 0, 0, TAU); g.fill(); g.globalAlpha = 1;
      }
      const spr = A.sprite(open ? 'gate_open' : 'gate_closed', gw, gh);
      this.shadow(bx, by, 80, 0.18);
      if (spr) g.drawImage(spr, bx - gw / 2, by - gh, gw, gh);
    }

    drawEntities(mode) {
      const w = this.world, O = this._order; O.length = 0;
      for (const m of w.gems) O.push(m);
      for (const b of w.bears) O.push(b);
      if (w.pip) O.push(w.pip);
      O.sort((a, b) => a.y - b.y);
      for (const o of O) {
        if (o === w.pip) this.drawPip(mode);
        else if (o.kind) this.drawBear(o);
        else this.drawGem(o);
      }
      // pointer target marker
      if (this.pointer && mode === 'playing') {
        const g = this.ctx, [x, y] = this.pointer, p = 0.5 + 0.5 * Math.sin(this.time * 8);
        g.strokeStyle = `rgba(255,255,255,${0.5 + 0.3 * p})`; g.lineWidth = 3;
        g.beginPath(); g.ellipse(x, y, 14 + p * 3, 6 + p, 0, 0, TAU); g.stroke();
      }
    }

    drawGem(m) {
      const g = this.ctx, A = CD.Assets;
      const ap = m.appear == null ? 1 : clamp(m.appear, 0, 1);
      if (ap < 1) {   // telegraph: a twinkling sparkle where the gem will appear
        const s = 10 + 16 * ap, spr = A.sprite('p_sparkle', 32, 32);
        g.globalAlpha = 0.5 + 0.5 * ap;
        if (spr) { g.save(); g.translate(m.x, m.y - 14); g.rotate(this.time * 3); g.drawImage(spr, -s / 2, -s / 2, s, s); g.restore(); }
        g.globalAlpha = 1;
        return;
      }
      const fade = m.loose && m.life != null && m.life < 1 ? (Math.sin(this.time * 20) > 0 ? 0.35 : 1) : 1;
      const bob = m.bob != null ? m.bob : Math.sin(this.time * 3 + (m.id || 0)) * 2.5;
      this.shadow(m.x, m.y, 20, 0.16);
      g.globalAlpha = fade;
      const custom = A.hasCustom('gem');
      if (custom) {
        const [cw, ch] = A.fit('gem', GEM + 4, GEM + 4);
        g.drawImage(A.sprite('custom:gem', cw, ch), m.x - cw / 2, m.y - 14 - ch / 2 + bob, cw, ch);
        g.lineWidth = 2.5; g.strokeStyle = GEM_COLORS[m.color] || '#fff';
        g.beginPath(); g.arc(m.x, m.y - 14 + bob, Math.max(cw, ch) / 2 + 2, 0, TAU); g.stroke();
      } else {
        const spr = A.sprite('gem_' + (m.color || 'pink'), GEM, GEM);
        if (spr) g.drawImage(spr, m.x - GEM / 2, m.y - 14 - GEM / 2 + bob, GEM, GEM);
      }
      g.globalAlpha = 1;
    }

    drawBear(b) {
      const g = this.ctx, A = CD.Assets;
      const a = b.spawnT == null ? 1 : clamp(b.spawnT, 0, 1);
      this.shadow(b.x, b.y, 44, 0.2 * a);
      g.save(); g.globalAlpha = a;
      g.translate(b.x, b.y - (b.z || 0));
      const stun = b.stun > 0;
      const wob = stun ? Math.sin(this.time * 10) * 0.08 : Math.sin(this.time * 9 + (b.id || 0)) * 0.05 * Math.min(1, Math.hypot(b.vx || 0, b.vy || 0) / 40);
      g.rotate(wob);
      if ((b.facing || 1) < 0) g.scale(-1, 1);
      if (A.hasCustom('bear')) {
        const [cw, ch] = A.fit('bear', BEAR + 4, BEAR + 4);
        g.drawImage(A.sprite('custom:bear', cw, ch), -cw / 2, -ch, cw, ch);
        g.lineWidth = 3; g.strokeStyle = BEAR_COLORS[b.kind] || '#fff';
        g.beginPath(); g.ellipse(0, 2, cw * 0.45, 6, 0, 0, TAU); g.stroke();
      } else {
        const fr = stun ? 'stun' : (b.frame === '2' || b.frame === 2 ? '2' : '1');
        const spr = A.sprite('bear_' + b.kind + '_' + fr, BEAR, BEAR);
        if (spr) g.drawImage(spr, -BEAR / 2, -BEAR * BEAR_FOOT, BEAR, BEAR);
      }
      g.restore();
      if (stun) for (let i = 0; i < 3; i++) {
        const ang = this.time * 5 + i * TAU / 3, spr = A.sprite('p_star', 32, 32);
        if (spr) g.drawImage(spr, b.x + Math.cos(ang) * 18 - 6, b.y - BEAR - 4 + Math.sin(ang) * 5 - 6, 12, 12);
      }
    }

    drawPip(mode) {
      const g = this.ctx, w = this.world, p = w.pip, A = CD.Assets;
      const sc = p.scale || 1, sz = PIP * sc;
      if (p.invuln > 0 && Math.sin(this.time * 30) > 0.2) { this.shadow(p.x, p.y, sz * 0.7, 0.1); return; }   // blink while safe
      this.shadow(p.x, p.y, sz * 0.7, 0.25);
      g.save();
      g.translate(p.x, p.y - (p.z || 0));   // z = hop height (puffs); the shadow stays on the ground
      const sq = p.squash || 0;            // signed wobble from the world
      g.scale(1 + sq, 1 - sq);
      if (A.hasCustom('hero')) {
        const [cw, ch] = A.fit('hero', sz * 1.15, sz * 1.15);
        const waddle = Math.sin(this.time * 12) * (Math.hypot(p.vx || 0, p.vy || 0) > 20 ? 0.09 : 0.02);
        g.rotate(waddle);
        for (const side of [-1, 1]) {   // little orange feet so a photo still waddles
          g.fillStyle = '#ff9a3d'; g.strokeStyle = '#8a4a14'; g.lineWidth = 2;
          g.beginPath(); g.ellipse(side * cw * 0.2, -3 + Math.sin(this.time * 12 + side) * 1.5, 8, 4, 0, 0, TAU); g.fill(); g.stroke();
        }
        g.drawImage(A.sprite('custom:hero', cw, ch), -cw / 2, -ch - 2, cw, ch);
      } else {
        if ((p.facing || 1) < 0) g.scale(-1, 1);
        const fr = ['idle', 'walk1', 'walk2', 'slide', 'hurt', 'cheer'].includes(p.frame) ? p.frame : 'idle';
        const spr = A.sprite('pip_' + fr, sz, sz);
        if (spr) g.drawImage(spr, -sz / 2, -sz * PIP_FOOT, sz, sz);
      }
      g.restore();
      // max-size sparkle aura + Pop hint
      if (w.size >= (w.sizeMax || 5) && mode === 'playing') {
        const spr = A.sprite('p_sparkle', 32, 32);
        for (let i = 0; i < 3; i++) {
          const ang = this.time * 2.4 + i * TAU / 3, s = 12 + 4 * Math.sin(this.time * 6 + i);
          if (spr) g.drawImage(spr, p.x + Math.cos(ang) * sz * 0.55 - s / 2, p.y - sz * 0.5 + Math.sin(ang) * sz * 0.35 - s / 2, s, s);
        }
        const a = 0.75 + 0.25 * Math.sin(this.time * 6);
        g.globalAlpha = a; this.text('POP!', p.x, Math.max(80, p.y - sz - 14), 16, '#ffe14d', '#6a2d5c', 'center', 4); g.globalAlpha = 1;
      }
    }

    drawFx() {
      const g = this.ctx, A = CD.Assets;
      for (const f of this.fx) {
        if (f.life < 0) continue;
        const k = f.life / f.max;
        if (f.k === 'sprite') {
          const spr = A.sprite(f.spr, 32, 32); if (!spr) continue;
          let s = f.size * (k < 0.15 ? k / 0.15 : 1); if (k > 0.7) s *= 1 - (k - 0.7) / 0.3 * 0.6;
          g.save(); g.globalAlpha = k > 0.9 ? (1 - k) * 10 : 1; g.translate(f.x, f.y); g.rotate(f.rot || 0);
          g.drawImage(spr, -s / 2, -s / 2, s, s); g.restore();
        } else if (f.k === 'spark') {
          g.globalAlpha = 1 - k; g.fillStyle = f.color;
          g.beginPath(); g.arc(f.x, f.y, f.size * (1 - k * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'puff') {
          g.globalAlpha = 0.7 * (1 - k); g.fillStyle = f.color;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.6 + k * 0.8), 0, TAU); g.fill();
        } else if (f.k === 'circle') {
          g.globalAlpha = 0.85 * (1 - k); g.strokeStyle = f.color; g.lineWidth = 5 * (1 - k) + 1;
          g.beginPath(); g.ellipse(f.x, f.y, lerp(f.r0, f.r1, k), lerp(f.r0, f.r1, k) * 0.6, 0, 0, TAU); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    drawTexts() {
      const g = this.ctx;
      for (const t of this.texts) {
        const k = t.life / t.max, pop = k < 0.2 ? easeOutBack(k / 0.2) : 1;
        g.save(); g.globalAlpha = clamp(1.8 - k * 1.8, 0, 1);
        g.translate(t.x, t.y); g.scale(pop, pop);
        this.text(t.text, 0, 0, t.size, t.color, '#6a2d5c');
        g.restore();
      }
    }

    hud() {
      const g = this.ctx, w = this.world, A = CD.Assets;
      // hearts + size pips (top-left)
      g.fillStyle = 'rgba(255,255,255,0.85)'; this.roundRect(14, 12, 40 + 30 * (w.heartsMax || 3), 46, 23); g.fill();
      const hf = A.sprite('heart_full', 28, 28), he = A.sprite('heart_empty', 28, 28);
      for (let i = 0; i < (w.heartsMax || 3); i++) { const s = i < w.hearts ? hf : he; if (s) g.drawImage(s, 26 + i * 30, 21, 28, 28); }
      const smax = w.sizeMax || 5;
      g.fillStyle = 'rgba(255,255,255,0.85)'; this.roundRect(14, 64, 82 + 20 * smax, 26, 13); g.fill();
      this.text('SIZE', 22, 77, 11, '#a8407e', null, 'left');
      for (let i = 0; i < smax; i++) {
        g.fillStyle = i < w.size ? (w.size >= smax ? '#ffd23c' : '#ff8fc8') : 'rgba(168,64,126,0.18)';
        g.beginPath(); g.arc(60 + i * 20, 77, 7, 0, TAU); g.fill();
      }
      this.text('×' + w.size, 58 + smax * 20, 77, 13, '#a8407e', null, 'left');
      // score
      if (this._lastScore !== w.score) { this._scorePop = 1; this._lastScore = w.score; }
      this._scorePop = Math.max(0, (this._scorePop || 0) - 0.06);
      const s = 1 + 0.2 * this._scorePop;
      g.save(); g.translate(W / 2, 38); g.scale(s, s); this.text(String(w.score), 0, 0, 46, '#ffffff', '#6a2d5c', 'center', 8); g.restore();
      const bi = BIOME_INFO[w.biome] || BIOME_INFO[0];
      this.text(bi.name + (w.lap > 0 ? ' · Lap ' + (w.lap + 1) : ''), W / 2, 72, 14, '#ffffff', '#6a2d5c', 'center', 4);
      // gem jar (top-right, under the HUD buttons)
      const jx = 800, jy = 70, jar = A.sprite('jar', 44, 55);
      g.fillStyle = 'rgba(255,255,255,0.85)'; this.roundRect(jx - 8, jy - 2, 140, 58, 18); g.fill();
      const frac = clamp(w.jar / (w.jarTarget || 1), 0, 1);
      if (frac > 0) {
        const ix = jx + 10 * 44 / 64, iw = 44 * 44 / 64, iy = jy + 22 * 55 / 80, ih = 50 * 55 / 80;
        const grd = this._jarGrad || (this._jarGrad = (() => { const gr = g.createLinearGradient(0, iy, 0, iy + ih); gr.addColorStop(0, '#ff8fc8'); gr.addColorStop(0.5, '#ffd23c'); gr.addColorStop(1, '#5ab4ff'); return gr; })());
        g.fillStyle = grd; g.fillRect(ix, iy + ih * (1 - frac), iw, ih * frac);
      }
      if (jar) g.drawImage(jar, jx, jy, 44, 55);
      this.text(w.jar + '/' + w.jarTarget, jx + 54, jy + 28, 20, frac >= 1 ? '#2d9a52' : '#a8407e', null, 'left');
      // dash cooldown dot
      if (w.pip && w.pip.dashCd > 0 && w.size < smax) {
        const cdMax = (w.cfg && w.cfg.dashCooldown) || 1.2, k = 1 - clamp(w.pip.dashCd / cdMax, 0, 1);
        g.strokeStyle = 'rgba(255,255,255,0.8)'; g.lineWidth = 3;
        g.beginPath(); g.arc(w.pip.x, w.pip.y + 8, 10, -Math.PI / 2, -Math.PI / 2 + TAU * k); g.stroke();
      }
    }

    drawBanner() {
      const g = this.ctx, b = this.banner, bi = BIOME_INFO[b.s] || BIOME_INFO[0], t = b.t;
      let x;
      if (t < 0.4) x = lerp(-W, 0, easeOutBack(t / 0.4)); else if (t < 1.25) x = 0; else x = lerp(0, W, Math.pow((t - 1.25) / 0.35, 2));
      g.save(); g.translate(x, 0);
      g.fillStyle = bi.color; g.globalAlpha = 0.94;
      g.beginPath(); g.moveTo(W / 2 - 300, 200); g.lineTo(W / 2 + 300, 192); g.lineTo(W / 2 + 318, 300); g.lineTo(W / 2 - 282, 310); g.closePath(); g.fill();
      g.globalAlpha = 1;
      this.text(bi.name + '!', W / 2, 234, 42, '#ffffff', bi.dark, 'center', 9);
      this.text(bi.hint, W / 2, 278, 20, '#ffffff', bi.dark, 'center', 5);
      g.restore();
    }

    debugDraw() {
      const g = this.ctx, w = this.world;
      g.strokeStyle = 'red'; g.lineWidth = 1;
      const a = w.arena; if (a) g.strokeRect(a.x, a.y, a.w, a.h);
      for (const z of w.zones || []) { g.strokeStyle = '#00f'; if (z.shape === 'circle') { g.beginPath(); g.arc(z.x, z.y, z.r, 0, TAU); g.stroke(); } else g.strokeRect(z.x, z.y, z.w, z.h); }
      g.strokeStyle = '#f00';
      const c = (o, r) => { g.beginPath(); g.arc(o.x, o.y, r, 0, TAU); g.stroke(); };
      if (w.pip) c(w.pip, w.pip.radius || 16);
      for (const b of w.bears) c(b, b.radius || 16);
    }
  }
  Renderer.BIOME_INFO = BIOME_INFO;
  CD.Renderer = Renderer;
})(window.CD = window.CD || {});
