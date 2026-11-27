/* POG.Renderer — draws the world (logical 960×540 stage, y down) onto a full-window canvas.
 * The stage is fitted (contain) and centred; the backgrounds cover the letterbox.
 * Per biome three full-screen layers are pre-rendered once per size (pixel-exact, never stretched):
 *   back  = sky (cover) … far (drifting, tiled, drawn live) … floor + burrow backs
 *   front = burrow fronts + near foliage frame
 * Friends, fireflies, paws and Pip are pre-rasterized sprites drawn between back and front.
 * Rendering is interpolated between fixed simulation steps (world.alpha). */
(function (POG) {
  'use strict';
  const LW = 960, LH = 540, JAR = { x: 404, y: 38 };
  const GLOW = 'rgba(255,224,102,', GOLDG = 'rgba(255,184,31,';
  // per chapter: name, letterbox colours, banner ink, far-layer drift (px/s) and HUD pill tint
  const ZONE_INFO = [
    { name: 'The Morning Spring', sky: '#d5e6ec', ground: '#ebddb9', banner: '#5a4632', drift: 5, pill: 'rgba(70,52,34,.55)' },
    { name: 'The Palm Grove', sky: '#a6d8f0', ground: '#edd59f', banner: '#4c3e26', drift: 6, pill: 'rgba(60,48,28,.55)' },
    { name: 'The Sunset Dunes', sky: '#eea58e', ground: '#ecb68f', banner: '#5a2c44', drift: 4, pill: 'rgba(80,36,60,.55)' },
    { name: 'The Starlit Oasis', sky: '#2f3570', ground: '#5d5f98', banner: '#2a2550', drift: 3, pill: 'rgba(20,18,50,.6)' }
  ];
  const P_ASPECT = { dragonfly: 32 / 48, butterfly_0: 36 / 40, butterfly_1: 36 / 40, petal: 1, sandwisp: 96 / 256, tumbleweed: 1, glow: 1, sparkle: 1, star_tw: 1 };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.VW = LW; this.VH = LH;
      this.px = 1; this.maxPx = 0; this.cssScale = 1; this.k = 1; this.ox = 0; this.oy = 0;
      this.vis = { cur: -1, prev: -1, fade: 1 };
      this._bg = new Map();     // zone → { back, far, front, w, h }
      this._spr = { clear: () => { this._bg.clear(); POG.Assets._cache.clear(); } };
      this.texts = []; this.rings = []; this.flyers = []; this.pending = new Map();
      this.shake = 0; this.flash = 0; this.time = 0; this.drift = 0;
      this.banner = null; this.leafPulse = 0; this.scorePulse = 0; this.jarPulse = 0; this.padBob = 0;
      this.portrait = false;
    }

    // ---------- layout ----------
    resize(insets) {
      if (insets) this.insets = insets;
      const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
      let px = window.devicePixelRatio || 1;
      // cap the backing store at ~1920×1080 worth of pixels; CSS upscales the rest
      const cap = Math.sqrt((1920 * 1080) / (W * H));
      px = Math.min(px, Math.max(1, cap));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = px;
      const bw = Math.round(W * px), bh = Math.round(H * px);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      this.canvas.style.width = W + 'px'; this.canvas.style.height = H + 'px';
      this.W = W; this.H = H; this.portrait = H > W * 1.05;
      this.cssScale = Math.min(W / LW, H / LH);
      // device px per logical px, rounded to 1/64 so cached layers stay pixel-exact
      this.k = Math.floor(this.cssScale * px * 64) / 64;
      this.ox = Math.floor((bw - LW * this.k) / 2); this.oy = Math.round((bh - LH * this.k) / 2);
      // portrait phones/tablets: keep the stage nearer the bottom thumb area but leave sky above
      if (this.portrait) this.oy = Math.round((bh - LH * this.k) * 0.55);
      POG.Assets.setScale(this.k);
      this._bg.clear();
      if (this.vis.cur >= 0) this._layers(this.vis.cur);
    }
    toLogical(cx, cy) {
      const r = this.canvas.getBoundingClientRect();
      const dx = (cx - r.left) * (this.canvas.width / r.width), dy = (cy - r.top) * (this.canvas.height / r.height);
      return [(dx - this.ox) / this.k, (dy - this.oy) / this.k];
    }
    _measureHud() {}
    /* logical y offset that moves the HUD band from the stage top to the screen top (tall screens), below the notch */
    hudDy() { const top = ((this.insets && this.insets.top) || 0) * this.px; return -Math.max(0, this.oy - top) / this.k; }

    attach(world, weather) { this.world = world; this.weather = weather; this.texts.length = 0; this.rings.length = 0; this.flyers.length = 0; this.pending = new Map(); this.banner = null; }
    setLevel(zone, instant) {
      zone = ((zone % 4) + 4) % 4;
      if (zone === this.vis.cur) return;
      this.vis.prev = instant ? -1 : this.vis.cur; this.vis.cur = zone; this.vis.fade = instant || this.vis.prev < 0 ? 1 : 0;
      this._layers(zone);
      for (const z of [...this._bg.keys()]) if (z !== zone && z !== this.vis.prev) this._bg.delete(z);
      this.prewarm((zone + 1) % 4);
    }
    showBanner(zone) { const lp = this.world ? this.world.loop || 0 : 0; this.banner = { text: ZONE_INFO[zone % 4].name, t: 0, zone: zone % 4, sub: 'Chapter ' + ((zone % 4) + 1) + (lp ? ' · Book ' + (lp + 1) : '') }; }
    /* Pre-render the next biome in idle time so a level change never rasterizes on the transition frame. */
    prewarm(zone) {
      if (this._bg.has(zone) || this._warming === zone) return;
      this._warming = zone;
      const ric = window.requestIdleCallback || (f => setTimeout(f, 200));
      ric(() => { this._warming = -1; if (POG.Assets.restDone || zone === 0) this._layers(zone); }, { timeout: 1500 });
    }

    // ---------- pre-rendered biome layers ----------
    _layers(zone) {
      let L = this._bg.get(zone);
      if (L && L.w === this.canvas.width && L.h === this.canvas.height && L.k === this.k && L.ver === POG.Assets._ver) return L;
      const A = POG.Assets, n = A.SEASONS[zone], k = this.k, bw = this.canvas.width, bh = this.canvas.height;
      const info = ZONE_INFO[zone], ox = this.ox, oy = this.oy;
      const custom = A.custom['bg_' + n];
      const back = mk(bw, bh), bg = back.getContext('2d');
      bg.imageSmoothingQuality = 'high';
      // sky: cover the whole canvas
      const sky = custom || A.img[n + '_sky'];
      if (sky) {
        const sw = sky.naturalWidth || sky.width || LW, sh = sky.naturalHeight || sky.height || LH;
        const sc = Math.max(bw / sw, bh / sh);
        bg.drawImage(sky, (bw - sw * sc) / 2, (bh - sh * sc) / 2, sw * sc, sh * sc);
        if (custom) { bg.fillStyle = 'rgba(255,255,255,.18)'; bg.fillRect(0, 0, bw, bh); }
      } else { bg.fillStyle = info.sky; bg.fillRect(0, 0, bw, bh); }
      // far layer: one 1920-wide tile at logical scale (drawn live so it can drift)
      let far = null;
      if (!custom && A.img[n + '_far']) {
        far = mk(1920 * k, LH * k);
        far.getContext('2d').drawImage(A.img[n + '_far'], 0, 0, far.width, far.height);
      }
      const floorC = mk(bw, bh), fg = floorC.getContext('2d');
      if (!custom) {
        const fl = A.img[n + '_floor'];
        // ground colour under the stage (portrait / tall screens)
        fg.fillStyle = info.ground; fg.fillRect(0, oy + (LH - 2) * k, bw, bh);
        if (fl) {
          const tw = 1920 * k, x0 = ox + (480 - 960) * k;   // stage x480 = file x960
          for (let x = x0 - Math.ceil((x0 + 1) / tw) * tw; x < bw; x += tw) {
            fg.drawImage(fl, Math.round(x), oy, Math.round(tw), Math.round(LH * k));
            // tall screens: repeat the floor's lower band (file y 380–540) downward so there is no flat band or streaks
            for (let y = oy + (LH - 1) * k; y < bh; y += 160 * k - 1) fg.drawImage(fl, 0, 380, 1920, 160, Math.round(x), Math.round(y), Math.round(tw), Math.round(160 * k));
          }
        }
      }
      const layout = POG.World.LAYOUTS[zone];
      const front = mk(bw, bh), frg = front.getContext('2d');
      const bb = A.img[n + '_burrow_back'], bf = A.img[n + '_burrow_front'];
      for (const h of layout) {
        const w = 170 * h.s * k, hh = 90 * h.s * k, x = ox + h.x * k - w / 2, y = oy + h.y * k - hh / 2;
        if (custom) {   // soft shadow so burrows sit on a photo
          fg.fillStyle = 'rgba(30,40,20,.28)'; fg.beginPath(); fg.ellipse(ox + h.x * k, oy + (h.y + 14 * h.s) * k, 82 * h.s * k, 30 * h.s * k, 0, 0, Math.PI * 2); fg.fill();
        }
        if (bb) fg.drawImage(bb, x, y, w, hh);
      }   // the burrow fronts are drawn per hole right after its critter (so a back-row lip never covers a front-row face)
      const nr = !custom && A.img[n + '_near'];
      if (nr) {
        // each quarter of the foliage frame hugs its own screen corner (wide phones, tall iPads); the gaps between
        // quarters are bridged by stretching the frame's middle row / column, so vines and stalks run on unbroken
        const hw = LW / 2, hh = LH / 2, qw = hw * k, qh = hh * k;
        const xl = ox > 2 ? 0 : ox, xr = ox > 2 ? bw - qw : ox + qw, yt = oy > 2 ? 0 : oy, yb = oy > 2 ? bh - qh : oy + qh;
        frg.drawImage(nr, 0, 0, hw, hh, xl, yt, qw, qh); frg.drawImage(nr, hw, 0, hw, hh, xr, yt, qw, qh);
        frg.drawImage(nr, 0, hh, hw, hh, xl, yb, qw, qh); frg.drawImage(nr, hw, hh, hw, hh, xr, yb, qw, qh);
        if (yb > yt + qh + 1) { frg.drawImage(nr, 0, hh - 1, hw, 2, xl, yt + qh - 1, qw, yb - yt - qh + 2); frg.drawImage(nr, hw, hh - 1, hw, 2, xr, yt + qh - 1, qw, yb - yt - qh + 2); }
        if (xr > xl + qw + 1) { frg.drawImage(nr, hw - 1, 0, 2, hh, xl + qw - 1, yt, xr - xl - qw + 2, qh); frg.drawImage(nr, hw - 1, hh, 2, hh, xl + qw - 1, yb, xr - xl - qw + 2, qh); }
      }
      // compose sky + floor into one canvas when the far layer is static (one fewer full-screen draw)
      L = { back, far, floor: floorC, front, w: bw, h: bh, k, ver: A._ver, zone };
      if (!far || !info.drift) {
        if (far) {
          let x = ox + (480 - 960) * k; while (x > 0) x -= far.width;
          for (; x < bw; x += far.width) { bg.drawImage(far, Math.round(x), oy); if (oy > 0) bg.drawImage(far, 0, 0, far.width, 1, Math.round(x), 0, far.width, oy + 1); }
        }
        bg.drawImage(floorC, 0, 0); L.far = null; L.floor = null;
      }
      this._bg.set(zone, L);
      return L;
    }
    _drawBack(L, alpha) {
      const g = this.g;
      g.globalAlpha = alpha;
      g.drawImage(L.back, 0, 0);
      if (L.far) {
        const tw = L.far.width, off = ((this.drift * this.k) % tw + tw) % tw;
        let x = Math.round(this.ox + (480 - 960) * this.k - off);
        while (x > 0) x -= tw;
        for (; x < L.w; x += tw) { g.drawImage(L.far, x, this.oy); if (this.oy > 0) g.drawImage(L.far, 0, 0, tw, 1, x, 0, tw, this.oy + 1); }
      }
      if (L.floor) g.drawImage(L.floor, 0, 0);
      g.globalAlpha = 1;
    }

    // ---------- events → juice ----------
    onEvents(evts) {
      for (const e of evts) {
        switch (e.type) {
          case 'boop': this.pending.set(e.hole, { e, age: 0 }); break;   // shown when Pip lands on that friend
          case 'pipLand': this.padBob = 0; if (this.pending.has(e.hole)) { this._catch(this.pending.get(e.hole).e); this.pending.delete(e.hole); } break;
          case '_catch': {
            const col = e.gold ? '#ffb81f' : '#ffe066';
            this.rings.push({ x: e.x, y: e.y, t: 0, col, max: e.gold ? 0.6 : 0.45 });
            this.texts.push({ x: e.x, y: Math.max(178, e.y - 92), t: 0, text: (e.gold ? 'Golden! +' : '+') + e.points, col: e.gold ? '#ffd45a' : '#fff3a6', size: e.gold ? 36 : e.mult > 1 ? 34 : 28, sub: e.mult > 1 ? '×' + e.mult : '' });
            if (this.weather) this.weather.burst(e.gold ? 'gold' : 'sparkle', e.x, e.y);
            this.flyers.push({ x: e.x, y: e.y, t: 0, gold: !!e.gold, seed: Math.random() });   // the firefly zooms into the jar
            if (e.gold) this.flash = Math.max(this.flash, 0.25);
            break;
          }
          case 'levelUp': this.pending.clear(); this.showBanner(e.zone); break;
          case 'wrong': this.texts.push({ x: e.x, y: Math.max(186, e.y - 84), t: 0, text: 'Shh… napping!', col: '#dfe4ff', size: 26 }); this.shake = 0.22; break;
          case 'empty': this.rings.push({ x: e.x, y: e.y, t: 0, col: 'rgba(255,255,255,.8)', max: 0.3, small: true }); break;
          case 'pipHome': this.padBob = 1; break;
          case 'leafLost': this.leafPulse = -1; break;
          case 'leafGained': this.leafPulse = 1; this.texts.push({ x: 300, y: 84, t: 0, text: '+1 heart', col: '#9bf07f', size: 22 }); break;
          case 'combo': this.texts.push({ x: 480, y: 190, t: 0, text: 'Combo ' + e.n + '!', col: '#fff6c8', size: 32, big: true }); break;
          case 'levelClear': this.flash = 0.6; this.jarPulse = 1; this.texts.push({ x: 480, y: 190, t: 0, text: 'The End of the chapter! +' + e.bonus, col: '#fff6c8', size: 32, big: true, life: 1.6 }); break;
          case 'gameOver': this.shake = 0.15; break;
          case 'nap': this.texts.push({ x: 480, y: 190, t: 0, text: 'Zzz… look for the fireflies!', col: '#ffffff', size: 26, big: true, life: 1.6 }); break;
        }
      }
      if (this.texts.length > 14) this.texts.splice(0, this.texts.length - 14);
      if (this.rings.length > 12) this.rings.splice(0, this.rings.length - 12);
    }

    _catch(e) { this.onEvents([Object.assign({}, e, { type: '_catch' })]); }
    update(dt) {
      this.time += dt;
      for (const [h, p] of this.pending) { p.age += dt; if (p.age > 0.9) { this._catch(p.e); this.pending.delete(h); } }
      this.drift += dt * ZONE_INFO[Math.max(0, this.vis.cur)].drift;
      if (this.vis.fade < 1) this.vis.fade = Math.min(1, this.vis.fade + dt / 1.1);
      for (const t of this.texts) t.t += dt;
      for (const r of this.rings) r.t += dt;
      for (const f of this.flyers) {
        f.t += dt;
        if (f.t >= 0.6 && !f.done) { f.done = true; this.jarPulse = 1; this.scorePulse = 1; }
      }
      this.texts = this.texts.filter(t => t.t < (t.life || (t.big ? 1.3 : 0.9)));
      this.rings = this.rings.filter(r => r.t < r.max);
      this.flyers = this.flyers.filter(f => f.t < 0.6);
      this.shake = Math.max(0, this.shake - dt);
      this.flash = Math.max(0, this.flash - dt);
      this.scorePulse = Math.max(0, this.scorePulse - dt * 4);
      this.jarPulse = Math.max(0, this.jarPulse - dt * 2.5);
      this.padBob = Math.max(0, this.padBob - dt * 1.4);
      if (this.leafPulse) this.leafPulse = this.leafPulse > 0 ? Math.max(0, this.leafPulse - dt * 2) : Math.min(0, this.leafPulse + dt * 2);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 1.7) this.banner = null; }
    }

    // ---------- drawing ----------
    /* page turn between chapters: the old page slides off to the left with a curled, shaded edge */
    _turnEdge() { const t = this.vis.fade, e = t * t * (3 - 2 * t); return Math.round(this.canvas.width * (1 - e)); }
    _clipLeft(edge) { const g = this.g; g.save(); g.beginPath(); g.rect(0, 0, edge, this.canvas.height); g.clip(); }
    _curl(edge) {
      const g = this.g, t = this.vis.fade, cw = Math.max(8, 70 * this.k * Math.sin(Math.PI * t));
      g.save();
      const sh = g.createLinearGradient(edge, 0, edge + cw * 0.9, 0);   // shadow cast on the new page
      sh.addColorStop(0, 'rgba(40,25,10,.35)'); sh.addColorStop(1, 'rgba(40,25,10,0)');
      g.fillStyle = sh; g.fillRect(edge, 0, cw * 0.9, this.canvas.height);
      const pg = g.createLinearGradient(edge - cw, 0, edge, 0);         // the back of the turning page (paper)
      pg.addColorStop(0, 'rgba(251,241,217,0)'); pg.addColorStop(0.55, 'rgba(251,241,217,.85)'); pg.addColorStop(1, 'rgba(214,196,160,.95)');
      g.fillStyle = pg; g.fillRect(edge - cw, 0, cw, this.canvas.height);
      g.restore();
    }

    draw(mode) {
      const g = this.g, w = this.world;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      const cur = this._layers(Math.max(0, this.vis.cur));
      this._drawBack(cur, 1);
      const prev = this.vis.fade < 1 && this.vis.prev >= 0 ? this._bg.get(this.vis.prev) : null;
      const edge = prev ? this._turnEdge() : 0;
      if (prev) { this._clipLeft(edge); this._drawBack(prev, 1); g.restore(); }
      let sx = 0, sy = 0;
      if (this.shake > 0) { const a = this.shake * 24; sx = Math.sin(this.time * 70) * a; sy = Math.cos(this.time * 53) * a * 0.6; }
      const T = () => g.setTransform(this.k, 0, 0, this.k, this.ox + sx * this.k, this.oy + sy * this.k);
      T();
      if (w) {
        this._pad(w);
        this._ripples();
        this._particles('back');
        if (prev) { g.save(); g.beginPath(); g.rect(edge / this.k - this.ox / this.k - sx, -2000, 4000, 4000); g.clip(); }
        this._critters(w);
        if (prev) g.restore();
      }
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(cur.front, Math.round(sx * this.k), Math.round(sy * this.k));
      if (prev) { this._clipLeft(edge); g.drawImage(prev.front, 0, 0); g.restore(); this._curl(edge); }
      T();
      if (w) {
        this._particles('front');
        this._pip(w);
        this._fx();
        if (mode !== 'title') { g.translate(0, this.hudDy()); this._hud(w); g.translate(0, -this.hudDy()); }
        this._banner();
        if (POG.Game && POG.Game.debugView) this._debug(w);
      }
      if (this.flash > 0) { g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = 'rgba(255,250,215,' + (this.flash * 0.5).toFixed(3) + ')'; g.fillRect(0, 0, this.canvas.width, this.canvas.height); }
    }

    _sprite(key, w, h) { return POG.Assets.sprite(key, w, h); }
    _img(key, x, y, w, h) { const s = this._sprite(key, w, h); if (s) this.g.drawImage(s, x, y, w, h); return !!s; }

    _particles(layer) {
      const wx = this.weather; if (!wx) return;
      const g = this.g, night = this.vis.cur === 3;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const asp = P_ASPECT[p.sprite] || 1, w = p.size, h = p.size * asp;
        const s = this._sprite('p_' + p.sprite, Math.max(4, Math.round(w)), Math.max(4, Math.round(h)));
        if (!s) continue;
        g.save(); g.globalAlpha = clamp(p.alpha * (p.sprite === 'glow' && p.y > 240 ? 0.45 : 1), 0, 1);
        g.translate(p.x, p.y);
        if (p.sprite === 'glow') {   // ambient fireflies: a soft halo around the dot
          const gr = g.createRadialGradient(0, 0, 0, 0, 0, w * (night ? 1.6 : 1.1));
          gr.addColorStop(0, 'rgba(230,255,170,.55)'); gr.addColorStop(1, 'rgba(230,255,170,0)');
          g.fillStyle = gr; g.fillRect(-w * 1.6, -w * 1.6, w * 3.2, w * 3.2);
        }
        if (p.rot) g.rotate(p.rot); if (p.flipX) g.scale(-1, 1);
        g.drawImage(s, -w / 2, -h / 2, w, h);
        g.restore();
      }
    }
    _ripples() {
      const wx = this.weather; if (!wx || !wx.ripples) return;
      const g = this.g, night = this.vis.cur === 3;
      g.lineWidth = 2;
      for (const r of wx.ripples) {
        if (r.alpha <= 0.01) continue;
        g.strokeStyle = (night ? 'rgba(220,226,255,' : 'rgba(255,255,255,') + clamp(r.alpha, 0, 1).toFixed(3) + ')';
        g.beginPath(); g.ellipse(r.x, r.y, r.r, r.r * 0.28, 0, 0, Math.PI * 2); g.stroke();
      }
    }
    /* Pip's lily pad on the spring: bobs down when he lands back on it */
    _pad(w) {
      const g = this.g, b = this.padBob, dip = Math.sin(b * Math.PI * 3) * b * 3;
      const bob = Math.sin(this.time * 1.6) * 1.2 + dip;
      g.save(); g.translate(480, 136 + bob);
      g.rotate(Math.sin(this.time * 0.9) * 0.015);
      this._img('lilypad', -88, -31, 176, 62);
      g.restore();
    }

    _critters(w) {
      const A = POG.Assets, a = w.alpha || 0;
      const customC = A.custom.critter;
      for (const hole of w.holes) {
        this._critter(w, hole, a, customC);
        this._img(A.SEASONS[w.zone % 4] + '_burrow_front', hole.x - 85 * hole.s, hole.y - 45 * hole.s, 170 * hole.s, 90 * hole.s);
      }
    }
    _critter(w, hole, a, customC) {
      const g = this.g, A = POG.Assets;
      const c = hole.critter; if (!c) return;
      const s = hole.s, h = lerp(c.hPrev == null ? c.h : c.hPrev, c.h, a);
      if (h <= 0.01) return;
      const bottom = hole.y + 25 * s + (1 - h) * 140 * s;
      const cw = 140 * s, ch = 150 * s, x0 = hole.x - cw / 2, y0 = bottom - ch;
      const sleepy = c.type === 'sleepy', gold = c.type === 'gold';
      const waiting = c.state === 'booped' && !(c.bounceAt >= 0);   // tapped, Pip still in the air

      let sqx = 1, sqy = 1;
      if (c.state === 'booped' && !waiting) { const t = Math.max(0, (c.t || 0) - (c.bounceAt || 0)), e = Math.exp(-t * 7) * Math.cos(t * 26); sqx = 1 + 0.1 * e; sqy = 1 - 0.1 * e; }
      else if (c.state === 'wow') { const t = c.t || 0; sqx = 1 + 0.05 * Math.sin(t * 40) * Math.exp(-t * 6); }
      else if (sleepy) { const br = Math.sin(this.time * 2.2 + c.id) * 0.015; sqx = 1 + br; sqy = 1 - br; }   // slow sleepy breathing
      g.save();
      g.beginPath(); g.rect(hole.x - 120 * s, hole.y - 260 * s, 240 * s, 264 * s); g.clip();
      g.translate(hole.x, bottom); g.scale(sqx, sqy); g.translate(-hole.x, -bottom);
      const face = c.state === 'booped' && !waiting ? 'happy' : c.state === 'wow' ? 'wow' : sleepy ? 'sleepy' : 'up';
      const fx = hole.x, fy = y0 + 94 * s;
      const holding = !sleepy && (c.state !== 'booped' || waiting) && c.state !== 'wow';
      if (holding) {   // the firefly's warm glow lights the friend from the front
        const pr = 0.5 + 0.5 * Math.sin(this.time * (gold ? 9 : 5) + c.id);
        const G = gold ? GOLDG : GLOW, R = (gold ? 96 : 80) * s;
        const gr = g.createRadialGradient(fx, fy, 6 * s, fx, fy, R);
        gr.addColorStop(0, G + (0.55 + pr * 0.25) + ')'); gr.addColorStop(0.45, G + (0.22 + pr * 0.1) + ')'); gr.addColorStop(1, G + '0)');
        g.fillStyle = gr; g.fillRect(fx - R, fy - R, R * 2, R * 2);
      }
      if (customC) {
        const [fw, fh] = A.fit('critter', 120 * s, 120 * s);
        if (sleepy) g.globalAlpha = 0.75;
        this._img('custom:critter', hole.x - fw / 2, bottom - 18 * s - fh, fw, fh);
        g.globalAlpha = 1;
      } else this._img(c.kind + '_' + face, x0, y0, cw, ch);
      if (holding) {
        const ss = 62 * s, wig = Math.sin(this.time * 5 + c.id) * 0.07;
        g.save(); g.translate(fx, fy); g.rotate(wig);
        this._img(gold ? 'firefly_gold' : 'firefly', -ss / 2, -ss / 2, ss, ss);
        g.restore();
        if (!customC) this._img(c.kind + '_paws', x0, y0, cw, ch);
      }
      g.restore();
      if (sleepy && c.state !== 'wow' && h > 0.5) this._zzz(hole.x + 44 * s, y0 + 34 * s, s, c.id);
    }
    /* little "z" bubbles rising from a napping friend (drawn as strokes, no fonts) */
    _zzz(x, y, s, id) {
      const g = this.g;
      for (let i = 0; i < 3; i++) {
        const t = ((this.time * 0.6 + i / 3 + id * 0.17) % 1), sz = (7 + i * 2 + t * 4) * s;
        const zx = x + t * 30 * s + Math.sin(t * 6 + i) * 3 * s, zy = y - t * 26 * s;
        g.globalAlpha = Math.sin(t * Math.PI) * 0.95;
        g.lineWidth = 5 * s; g.strokeStyle = 'rgba(60,64,130,.85)'; g.lineJoin = 'round'; g.lineCap = 'round';
        const zp = () => { g.beginPath(); g.moveTo(zx - sz / 2, zy - sz / 2); g.lineTo(zx + sz / 2, zy - sz / 2); g.lineTo(zx - sz / 2, zy + sz / 2); g.lineTo(zx + sz / 2, zy + sz / 2); };
        zp(); g.stroke(); g.lineWidth = 2.6 * s; g.strokeStyle = '#ffffff'; zp(); g.stroke();
      }
      g.globalAlpha = 1;
    }

    _pip(w) {
      const g = this.g, z = w.pip, a = w.alpha || 0, A = POG.Assets;
      const x = lerp(z.px, z.x, a), y = lerp(z.py, z.y, a);
      const st = z.state, sc = 120 / 160;   // drawn 120×105; feet point (80,128) in art
      const air = st === 'hop' || st === 'return';
      g.save();
      g.translate(x, y);
      let sqx = 1, sqy = 1;
      const sq = z.squash || 0;
      if (sq > 0) { sqx = 1 + 0.22 * sq; sqy = 1 - 0.2 * sq; }
      else if (air) { const v = Math.hypot(z.vx || 0, z.vy || 0); const st2 = Math.min(0.1, v / 9000); sqx = 1 - st2; sqy = 1 + st2; }
      g.scale(sqx, sqy);
      g.translate(0, -46 * sc); g.rotate(z.tilt || 0);   // tilt around his body centre
      if (st === 'dizzy') g.rotate(Math.sin(this.time * 18) * 0.12);
      if (z.face < 0) g.scale(-1, 1);
      g.translate(0, 46 * sc);
      const key = air ? 'pip_hop' : st === 'boop' ? 'pip_boop' : st === 'dizzy' ? 'pip_dizzy' : 'pip_idle';
      if (A.custom.hero) {
        const [fw, fh] = A.fit('hero', 96, 96);
        g.strokeStyle = '#5cc96b'; g.lineWidth = 6; g.beginPath(); g.arc(0, -fh / 2, Math.max(fw, fh) / 2 + 5, 0, Math.PI * 2); g.stroke();
        this._img('custom:hero', -fw / 2, -fh, fw, fh);
      } else {
        // blink now and then while sitting on the pad
        this._img(key, -80 * sc, -128 * sc, 120, 105);
      }
      g.restore();
      // tongue flick: on landing, Pip's tongue snaps the firefly from the friend's paws
      if (st === 'boop' && z.target && z.target.hole != null && w.holes[z.target.hole]) {
        const hole = w.holes[z.target.hole], t = clamp((z.t || 0) / 0.18, 0, 1), ext = Math.sin(t * Math.PI);
        const sqk = z.squash || 0, mx = x + (z.face < 0 ? -1 : 1) * (118 - 80) * sc * (1 + 0.22 * sqk), my = y - (128 - 74) * sc * (1 - 0.2 * sqk);
        const tx = hole.x, ty = hole.y - 31 * hole.s;
        const ex = lerp(mx, tx, ext), ey = lerp(my, ty, ext);   // (ext: out and back in 0.18 s)
        const sd = z.face < 0 ? -1 : 1, hs = hole.s;
        g.strokeStyle = '#ff8fa3'; g.lineCap = 'round'; g.lineWidth = 3 + 3 * hs;
        g.beginPath(); g.moveTo(mx, my); g.quadraticCurveTo(hole.x + sd * 78 * hs, (my + ey) / 2, ex, ey); g.stroke();
        g.fillStyle = '#ff6f8e'; g.beginPath(); g.arc(ex, ey, 3 + 3 * hs, 0, Math.PI * 2); g.fill();
      }
      if (st === 'dizzy') {   // little stars circling his head
        for (let i = 0; i < 3; i++) {
          const an = this.time * 5 + i * 2.1, cx = x + Math.cos(an) * 30, cy = y - 88 + Math.sin(an) * 7;
          this._img('p_sparkle', cx - 9, cy - 9, 18, 18);
        }
      }
    }

    _fx() {
      const g = this.g;
      for (const r of this.rings) {
        const t = r.t / r.max;
        g.strokeStyle = r.col; g.globalAlpha = 1 - t; g.lineWidth = (r.small ? 3 : 6) * (1 - t) + 1;
        g.beginPath(); g.arc(r.x, r.y, (r.small ? 14 : 26) + t * (r.small ? 22 : 60), 0, Math.PI * 2); g.stroke();
      }
      g.globalAlpha = 1;
      // fireflies zooming into the jar: an arc up with a wobbly flight path and a fading glow trail
      const jx = JAR.x, jy = JAR.y + 2 + this.hudDy();
      for (const f of this.flyers) {
        const t = clamp(f.t / 0.6, 0, 1), e = t * t * (3 - 2 * t);
        const wob = Math.sin(t * 14 + f.seed * 6) * 14 * (1 - t);
        const x = lerp(f.x, jx, e) + wob, y = lerp(f.y, jy, e) - Math.sin(t * Math.PI) * 70, s = lerp(46, 22, e);
        const G = f.gold ? GOLDG : GLOW;
        const gr = g.createRadialGradient(x, y, 0, x, y, s * 1.3);
        gr.addColorStop(0, G + '0.6)'); gr.addColorStop(1, G + '0)');
        g.fillStyle = gr; g.fillRect(x - s * 1.3, y - s * 1.3, s * 2.6, s * 2.6);
        this._img(f.gold ? 'firefly_gold' : 'firefly', x - s / 2, y - s / 2, s, s);
      }
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const life = t.life || (t.big ? 1.3 : 0.9), p = t.t / life;
        const y = t.y - (t.big ? 10 : 46) * Math.min(1, p * 1.6);
        const pop = t.t < 0.12 ? 0.6 + 0.4 * (t.t / 0.12) * 1.15 : 1;
        g.globalAlpha = p > 0.7 ? 1 - (p - 0.7) / 0.3 : 1;
        g.font = '900 ' + Math.round(t.size * pop) + 'px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
        g.lineWidth = 7; g.strokeStyle = 'rgba(50,32,40,.78)'; g.strokeText(t.text, t.x, y);
        g.fillStyle = t.col; g.fillText(t.text, t.x, y);
        if (t.sub) { const tw = g.measureText(t.text).width; g.font = '900 20px system-ui, sans-serif'; g.lineWidth = 5; g.strokeText(t.sub, t.x + tw / 2 + 16, y - 16); g.fillStyle = '#fff6c8'; g.fillText(t.sub, t.x + tw / 2 + 16, y - 16); }
      }
      g.globalAlpha = 1;
    }

    _pill(x, y, w, h) {
      const g = this.g, r = h / 2;
      g.fillStyle = ZONE_INFO[Math.max(0, this.vis.cur)].pill; g.beginPath();
      g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; g.stroke();
    }
    _hud(w) {
      const g = this.g;
      // score (top-left)
      this._pill(14, 12, 172, 48);
      g.textAlign = 'left'; g.textBaseline = 'middle';
      const sp = 1 + this.scorePulse * 0.12;
      g.save(); g.translate(30, 37); g.scale(sp, sp);
      g.font = '900 30px "Baloo 2", "Trebuchet MS", system-ui, sans-serif'; g.fillStyle = '#fff'; g.fillText(String(w.score), 0, 0);
      g.restore();
      if (w.mult > 1) { g.font = '900 20px system-ui, sans-serif'; g.fillStyle = '#ffe27a'; g.textAlign = 'right'; g.fillText('×' + w.mult, 176, 37); }
      // lily-pad hearts
      const n = w.maxLeaves || 5, lp = this.leafPulse;
      for (let i = 0; i < n; i++) {
        const full = i < w.leaves, s = 30 + (full && i === w.leaves - 1 && lp > 0 ? lp * 10 : 0);
        const x = 200 + i * 33, y = 36;
        if (!full && i >= Math.max(3, w.leaves + (lp < 0 ? 1 : 0))) continue;
        let dx = 0; if (lp < 0 && i === w.leaves) dx = Math.sin(this.time * 60) * 4 * -lp;
        this._img(full ? 'leaf' : 'leaf_empty', x - s / 2 + dx + 15, y - s / 2, s, s);
      }
      // lantern jar (top-centre): glows brighter as the chapter fills; the ring shows chapter progress
      const cx = JAR.x, cy = JAR.y, R = 28 + this.jarPulse * 4;
      const prog = clamp((w.levelBoops || 0) / (w.levelGoal || 15), 0, 1);
      g.fillStyle = ZONE_INFO[Math.max(0, this.vis.cur)].pill; g.beginPath(); g.arc(cx, cy, R + 3, 0, Math.PI * 2); g.fill();
      const gl = 0.15 + prog * 0.6 + this.jarPulse * 0.25;
      const gr = g.createRadialGradient(cx, cy + 4, 2, cx, cy + 4, R + 14 * prog);
      gr.addColorStop(0, GLOW + clamp(gl, 0, 1).toFixed(3) + ')'); gr.addColorStop(1, GLOW + '0)');
      g.fillStyle = gr; g.beginPath(); g.arc(cx, cy + 4, R + 14 * prog, 0, Math.PI * 2); g.fill();
      g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 6; g.beginPath(); g.arc(cx, cy, R - 2, 0, Math.PI * 2); g.stroke();
      if (prog > 0) { g.strokeStyle = '#ffe066'; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, R - 2, -Math.PI / 2, -Math.PI / 2 + prog * Math.PI * 2); g.stroke(); g.lineCap = 'butt'; }
      // tiny fireflies dancing inside the jar (one per 3 caught, up to 5)
      const nIn = Math.min(5, Math.ceil((w.levelBoops || 0) / 3));
      for (let i = 0; i < nIn; i++) {
        const an = this.time * (1.3 + i * 0.37) + i * 1.9;
        g.fillStyle = 'rgba(255,240,150,.95)'; g.beginPath(); g.arc(cx + Math.cos(an) * 8, cy + 8 + Math.sin(an * 1.3) * 6, 2.6, 0, Math.PI * 2); g.fill();
      }
      const js = 42 * (1 + this.jarPulse * 0.12);
      this._img('jar', cx - js / 2, cy - js / 2 + 1, js, js);
    }

    /* storybook chapter card: a cream paper ribbon with "Chapter N" above the chapter's name */
    _banner() {
      const b = this.banner; if (!b) return;
      const g = this.g, t = b.t;
      const a = t < 0.3 ? t / 0.3 : t > 1.2 ? Math.max(0, 1 - (t - 1.2) / 0.4) : 1;
      if (a <= 0) return;
      const y = 494 + (t < 0.3 ? (1 - t / 0.3) * 16 : 0);
      g.globalAlpha = a;
      g.font = '900 36px "Baloo 2", "Trebuchet MS", system-ui, sans-serif';
      const tw = Math.max(250, g.measureText(b.text).width + 56), x0 = 480 - tw / 2, h = 76;
      // paper card with folded ribbon tails
      g.fillStyle = 'rgba(120,80,40,.25)'; g.fillRect(x0 + 4, y - h / 2 + 6, tw, h);
      g.fillStyle = '#e8d3a8';
      g.beginPath(); g.moveTo(x0 - 30, y - 18); g.lineTo(x0 + 10, y - 18); g.lineTo(x0 + 10, y + 34); g.lineTo(x0 - 30, y + 34); g.lineTo(x0 - 16, y + 8); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(x0 + tw + 30, y - 18); g.lineTo(x0 + tw - 10, y - 18); g.lineTo(x0 + tw - 10, y + 34); g.lineTo(x0 + tw + 30, y + 34); g.lineTo(x0 + tw + 16, y + 8); g.closePath(); g.fill();
      g.fillStyle = '#fbf1d9'; g.strokeStyle = '#b89462'; g.lineWidth = 3;
      g.beginPath(); g.rect(x0, y - h / 2, tw, h); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(184,148,98,.5)'; g.lineWidth = 1.5; g.strokeRect(x0 + 7, y - h / 2 + 7, tw - 14, h - 14);
      g.textAlign = 'center'; g.textBaseline = 'middle';
      g.font = '800 18px "Baloo 2", "Trebuchet MS", system-ui, sans-serif'; g.fillStyle = '#a0703e';
      g.fillText(b.sub, 480, y - 18);
      g.font = '900 34px "Baloo 2", "Trebuchet MS", system-ui, sans-serif'; g.fillStyle = ZONE_INFO[b.zone].banner;
      g.fillText(b.text, 480, y + 11);
      g.globalAlpha = 1;
    }

    _debug(w) {
      const g = this.g;
      g.lineWidth = 2;
      w.holes.forEach((h, i) => {
        g.strokeStyle = 'rgba(255,0,255,.8)'; g.beginPath(); g.arc(h.x, h.y - 45 * h.s, 88 * h.s, 0, Math.PI * 2); g.stroke();
        g.fillStyle = '#f0f'; g.font = '700 16px monospace'; g.fillText(String(i + 1), h.x, h.y - 45 * h.s);
      });
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  POG.Renderer = Renderer;
})(window.POG = window.POG || {});
