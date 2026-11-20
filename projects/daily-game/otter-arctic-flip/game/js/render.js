/* OF.Renderer — the lighthouse scene: window sky / landscape / back wall, floor and ceiling beam, open hatches,
 * wall lamps, props with warning beacons, Ollie, fluttering leaves, Pip the puffin, the stairway door, particles,
 * the day-to-night DARKNESS layer (DESIGN §7), juice and the HUD.
 * Layers: sky / far / mid are pre-rendered as device-pixel tiles at screen height and blitted pixel-exact with
 * parallax (0.03 / 0.12 / 0.6 of the scroll); back-layer weather is drawn between far and mid so it only shows
 * through the window holes. Floor and ceiling spans are tiled from cached sprites in world space
 * (screenX = worldX − cam.x). Floor changes crossfade. Everything that moves is lerped with world.alpha. */
(function (OF) {
  'use strict';
  const ZONE_INFO = [
    { key: 'dawn', name: 'Boot Room', time: 'Dawn', color: '#ffd2bf', vig: 'rgba(40,20,40,.20)', sub: 'Good morning, Ollie!', hint: 'Tap to flip up to the ceiling!' },
    { key: 'noon', name: 'Greenhouse', time: 'Noon', color: '#c9f0ff', vig: 'rgba(10,30,60,.14)', sub: 'Catch the fluttering leaves!' },
    { key: 'sunset', name: 'Map Library', time: 'Sunset', color: '#ffc28a', vig: 'rgba(40,10,30,.24)', sub: 'The lamps are coming on!' },
    { key: 'night', name: 'Lantern Deck', time: 'Night', color: '#b9d0ff', vig: 'rgba(4,6,24,.30)', sub: 'Follow your headlamp!' }
  ];
  // tools/art-environment/palette.json (walls, slab side, storey below, ceiling fill, window band in the 960×540 tile)
  const PAL = [
    { wall: '#a9b6c8', slab: '#7a5236', bottom: '#3a3040', ceil: '#8794ab', winY: [166, 334], winX: [240, 720], winW: 270 },
    { wall: '#dfe9e4', slab: '#8a5c4c', bottom: '#3e3238', ceil: '#d2ddd6', winY: [146, 356], winX: [240, 720], winW: 290 },
    { wall: '#6e4f5a', slab: '#563428', bottom: '#241820', ceil: '#4a343c', winY: [152, 334], winX: [240, 720], winW: 270 },
    { wall: '#3a4560', slab: '#343c56', bottom: '#151a2c', ceil: '#2a3248', winY: [166, 334], winX: [240, 720], winW: 250 }
  ];
  const LEAF_COL = ['#5fd35a', '#ffc53d', '#ff6b3d'];
  const LEAF_RGB = [[95, 211, 90], [255, 197, 61], [255, 107, 61]];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const shade = (hex, k) => {   // k < 0 darkens, > 0 lightens
    const n = parseInt(hex.slice(1), 16); const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    const f = c => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  };
  // Ollie sprite (128×128): body centre (64,74), feet line y 120, headlamp lens (92,44). Drawn 0.95·unit.
  const OLLIE_K = 0.95, OLLIE_FEET = 120 / 128, OLLIE_STAND = 0.42;
  const LEAF_K = 0.42;
  const FLOOR_LABEL = z => 'Floor ' + (z % 4 + 1) + ' · ' + ZONE_INFO[z % 4].name;

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.fx = []; this.texts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fff6d0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.hintOn = true; this.multShow = 0; this.heartPulse = 0;
      this.lampK = 0; this.hudRects = null;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._stamps = {}; this._spr = {};
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
      const dpr = window.devicePixelRatio || 1, touch = !!(OF.Game && OF.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._stamps = {}; this._spr = {};
      this._makeDark();
      this._hudK = clamp(0.95 / v.s, 1, 1.6);
      this._view = v;
      const hud = document.getElementById('hud'), toast = document.getElementById('toast');
      const I = v.ins, S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      if (this.weather && this.weather.resize) this.weather.resize(v.VW, v.VH);
      if (this.world && this.world.setLayout && (this.world.layout.width !== v.VW || this.world.layout.height !== v.VH)) this.world.setLayout(v.VW, v.VH);
      this._measureHud();
      OF.Assets.setScale(this.px);
    }
    _measureHud() {
      const hud = document.getElementById('hud'); if (!hud) return;
      const r = hud.getBoundingClientRect(), c = this.canvas.getBoundingClientRect();
      this._hudBtn = (r.width > 0 && c.width > 0) ? { l: (r.left - c.left) * this.VW / c.width, b: (r.bottom - c.top) * this.VH / c.height } : null;
    }
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    attach(world, weather) {
      this.world = world; this.weather = weather; this.fx.length = 0; this.texts.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.multShow = 0; this.heartPulse = 0;
      this.lampK = world && world.lampsOn ? 1 : 0;
      this.hintOn = !!world && (world.level || 0) === 0; this._hintT = 0;
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

    // ---------------- pre-rendered scenes ----------------
    _slot(b) { return OF.Assets.SLOTS[2 + b].id; }
    _custom(b) { return OF.Assets.hasCustom(this._slot(b)); }
    _unit() { return this.world ? this.world.layout.unit : Math.min(this.VW / 9.6, this.VH / 5.4); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (OF.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    /* Pre-warm a floor (scene tiles + track sprites) in an idle callback, so the door crossfade never stalls. */
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => {
        this._warmQ = this._warmQ.filter(x => x !== b); this.background(b);
        const u = this._unit(), n = OF.Assets.SEASONS[b];
        OF.Assets.warm([[n + '_building', 2.4 * u, 4 * u], [n + '_rail', 2.4 * u, 1.6 * u], [n + '_rail_end', 0.4 * u, 1.6 * u]]);
      }, { timeout: 400 });
    }
    _canvas(w, h) { const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c; }
    /* {sky, far, mid, custom, vig}: one tile each, scaled to the screen height, in device px. */
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = OF.Assets, n = A.SEASONS[b], px = this.px, VW = this.VW, VH = this.VH, info = ZONE_INFO[b];
      bg = { sky: null, far: null, mid: null, custom: false };
      if (this._custom(b)) {
        const im = A.custom[this._slot(b)], k = Math.max(VW / im.width, VH / im.height);
        const c = this._canvas(VW * px, VH * px), g = c.getContext('2d'); g.imageSmoothingQuality = 'high';
        g.setTransform(px, 0, 0, px, 0, 0);
        g.drawImage(im, (VW - im.width * k) / 2, (VH - im.height * k) / 2, im.width * k, im.height * k);
        bg.sky = c; bg.custom = true;
      } else {
        const k = VH / 540, tw = Math.round(960 * k * px), th = Math.round(VH * px);
        const tile = name => {
          const im = A.img[n + '_' + name]; if (!im) return null;
          const c = this._canvas(tw, th), cg = c.getContext('2d'); cg.imageSmoothingQuality = 'high';
          cg.drawImage(im, 0, 0, tw, th); return c;
        };
        bg.sky = tile('sky'); bg.far = tile('far'); bg.mid = tile('mid');
        if (!bg.sky) { bg.sky = this._canvas(tw, th); const sg = bg.sky.getContext('2d'); sg.fillStyle = PAL[b].wall; sg.fillRect(0, 0, tw, th); }
      }
      const vc = this._canvas(VW * px, VH * px), vg0 = vc.getContext('2d');
      vg0.setTransform(px, 0, 0, px, 0, 0);
      const vg = vg0.createRadialGradient(VW / 2, VH * 0.5, Math.min(VW, VH) * 0.4, VW / 2, VH * 0.5, Math.max(VW, VH) * 0.8);
      vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, info.vig);
      vg0.fillStyle = vg; vg0.fillRect(0, 0, VW, VH);
      bg.vig = vc;
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
    /* outside: sky + far landscape (or the whole custom photo) */
    drawOutside(g, b, alpha, camX) {
      const bg = this.background(b);
      if (bg.custom) { g.globalAlpha = alpha; g.drawImage(bg.sky, 0, 0); g.globalAlpha = 1; return; }
      this._blitTile(g, bg.sky, camX * 0.03 + this.time * 2, alpha);
      this._blitTile(g, bg.far, camX * 0.12, alpha);
      g.globalAlpha = 1;
    }
    /* the back wall with its window holes (parallax 0.6) */
    drawWall(g, b, alpha, camX) {
      const bg = this.background(b);
      if (bg.custom) {
        if (this.world) { const L = this.world.layout, px = this.px; g.globalAlpha = alpha * 0.18; g.fillStyle = '#0a0c24'; g.fillRect(0, L.ceilY * px, this.canvas.width, L.corridorH * px); }
        g.globalAlpha = 1; return;
      }
      this._blitTile(g, bg.mid, camX * 0.6, alpha);
      g.globalAlpha = 1;
    }

    // ---------------- small pre-rendered stamps (built once per resize, reused every frame) ----------------
    _stamp(key, w, h, draw) {
      let c = this._stamps[key];
      if (c) return c;
      const px = this.px;
      c = this._canvas(w * px, h * px);
      const g = c.getContext('2d'); g.setTransform(px, 0, 0, px, 0, 0);
      draw(g, w, h);
      this._stamps[key] = c;
      return c;
    }
    /* radial light: (r,g,b) at the centre fading to transparent at the edge */
    _radial(key, rgb, mid) {
      return this._stamp('rad|' + key, 64, 64, (g) => {
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(' + rgb + ',1)'); gr.addColorStop(mid || 0.45, 'rgba(' + rgb + ',0.62)'); gr.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
      });
    }
    /* the headlamp cone: apex at (0, 112), length 256, half-angle ≈ 22° with soft edges (6 stacked wedges) */
    _cone(rgb) {
      return this._stamp('cone|' + rgb, 256, 224, (g) => {
        const lg = g.createLinearGradient(0, 0, 256, 0);
        lg.addColorStop(0, 'rgba(' + rgb + ',1)'); lg.addColorStop(0.7, 'rgba(' + rgb + ',0.9)'); lg.addColorStop(1, 'rgba(' + rgb + ',0)');
        g.fillStyle = lg;
        for (let i = 0; i < 6; i++) {
          const a = (22 * (0.62 + 0.15 * i)) * Math.PI / 180, hh = Math.min(112, 256 * Math.tan(a));
          g.globalAlpha = 0.36;
          g.beginPath(); g.moveTo(0, 112); g.lineTo(256, 112 - hh); g.lineTo(256, 112 + hh); g.closePath(); g.fill();
        }
      });
    }
    /* soft rectangle (window light) */
    _softRect() {
      return this._stamp('softrect', 64, 64, (g) => {
        for (let i = 0; i < 6; i++) { g.globalAlpha = 0.3; const m = 2 + i * 2.2; this._rr(g, m, m, 64 - 2 * m, 64 - 2 * m, 10); g.fillStyle = '#fff'; g.fill(); }
      });
    }

    // ---------------- darkness (DESIGN §7) ----------------
    _makeDark() {
      // half resolution, at most 960×540 device px; reused every frame
      const k = Math.min(0.5 * this.px, 960 / this.VW, 540 / this.VH, 960 / this.VH);
      const w = Math.max(2, Math.round(this.VW * k)), h = Math.max(2, Math.round(this.VH * k));
      if (!this._dark || this._dark.width !== w || this._dark.height !== h) {
        this._dark = this._canvas(w, h); this._darkG = this._dark.getContext('2d');
      }
      this._darkK = w / this.VW;
    }
    /* light 0.3..1 → darkness alpha (cool blue night) */
    darkAlpha() { const w = this.world; return w ? clamp((1 - (w.lightView != null ? w.lightView : w.light || 1)) * 0.95, 0, 0.7) : 0; }
    drawDarkness(g, w, camX) {
      const A = this.darkAlpha();
      if (A < 0.01) return;
      const dg = this._darkG, k = this._darkK, L = w.layout, u = L.unit, a = w.alpha || 0, VW = this.VW, VH = this.VH;
      dg.setTransform(1, 0, 0, 1, 0, 0);
      dg.globalCompositeOperation = 'source-over'; dg.globalAlpha = 1;
      dg.clearRect(0, 0, this._dark.width, this._dark.height);
      dg.fillStyle = 'rgba(10,14,38,' + A.toFixed(3) + ')';
      dg.fillRect(0, 0, this._dark.width, this._dark.height);
      dg.setTransform(k, 0, 0, k, 0, 0);
      dg.globalCompositeOperation = 'destination-out';
      const rad = this._radial('cut', '255,255,255'), sx = x => x - camX;
      const cut = (x, y, r, al) => { if (x + r < 0 || x - r > VW) return; dg.globalAlpha = al; dg.drawImage(rad, x - r, y - r, 2 * r, 2 * r); };
      // windows: the sky outside stays a bit brighter (40 %)
      const zc = this.vis.cur, P = PAL[zc];
      if (!this.background(zc).custom) {
        const kk = VH / 540, tw = 960 * kk, off = ((camX * 0.6) % tw + tw) % tw, sr = this._softRect();
        dg.globalAlpha = 0.4;
        for (let x = -off; x < VW; x += tw) for (const wx of P.winX) {
          const cx = x + wx * kk, ww = P.winW * kk;
          if (cx + ww / 2 < 0 || cx - ww / 2 > VW) continue;
          dg.drawImage(sr, cx - ww / 2, P.winY[0] * kk, ww, (P.winY[1] - P.winY[0]) * kk);
        }
      }
      // Ollie: a soft circle + the headlamp cone along the running direction
      const h = w.hero, hx = lerp(h.prevX, h.x, a) - camX, hy = lerp(h.prevY, h.y, a);
      cut(hx, hy, 1.1 * u, 1);
      const lp = this._lampScreen(w, camX), len = (w.beamUnits ? w.beamUnits() : 3.2) * u;
      // the beam lights the corridor (and the floor / ceiling surfaces), not the storeys above and below
      const by0 = L.ceilY - 0.25 * u, by1 = L.floorY + 0.3 * u;
      {
        const cone = this._cone('255,255,255'), sc = len / 256;
        dg.save(); dg.beginPath(); dg.rect(0, by0, VW, by1 - by0); dg.clip();
        dg.translate(lp.x, lp.y); dg.scale(sc, sc); dg.globalAlpha = 0.95;
        dg.drawImage(cone, 0, -112, 256, 224); dg.restore();
      }
      // wall lamps (lit when lampsOn, fading on), beacons, the stairway door, glowing leaves
      if (this.lampK > 0.01) {
        for (const l of w.lamps) { const p = this._lampXY(l, L); cut(sx(p.x), p.y, 1.3 * u, this.lampK); }
        this._forBeacons(w, camX, (x, y) => cut(x, y, 0.45 * u, this.lampK));
      }
      for (const fx of this._doorXs(w)) cut(sx(fx), L.midY, 2 * u, 1);
      if (w.zone % 4 >= 2) for (const f of w.leaves) { if (f.state === 'gone') continue; cut(sx(lerp(f.prevX, f.x, a)), lerp(f.prevY, f.y, a), 0.35 * u, 0.9); }
      if (w.drone) cut(sx(lerp(w.drone.prevX, w.drone.x, a)), lerp(w.drone.prevY, w.drone.y, a), 0.8 * u, 0.8);
      dg.globalAlpha = 1; dg.globalCompositeOperation = 'source-over';
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.drawImage(this._dark, 0, 0, this.canvas.width, this.canvas.height);
      // warm light on top (additive): lamp halos, beacons, door lamp, a very soft beam, glowing leaves
      const px = this.px, dk = clamp(A / 0.6, 0, 1);
      g.setTransform(px, 0, 0, px, 0, 0);
      g.globalCompositeOperation = 'lighter';
      const warm = this._radial('warm', '255,206,128', 0.3), amber = this._radial('amber', '255,160,60', 0.3);
      const glow = (im, x, y, r, al) => { if (x + r < 0 || x - r > VW || al <= 0.005) return; g.globalAlpha = al; g.drawImage(im, x - r, y - r, 2 * r, 2 * r); };
      {
        const wc = this._cone('255,236,170'), sc = len / 256;
        g.save(); g.beginPath(); g.rect(0, by0, VW, by1 - by0); g.clip(); g.translate(lp.x, lp.y); g.scale(sc, sc); g.globalAlpha = 0.16 * dk;
        g.drawImage(wc, 0, -112, 256, 224); g.restore();
        glow(warm, lp.x, lp.y, 0.22 * u, 0.7 * dk);
      }
      if (this.lampK > 0.01) {
        for (const l of w.lamps) { const p = this._lampXY(l, L); glow(warm, sx(p.x), p.y, 0.95 * u, 0.42 * this.lampK * dk); }
        const pulse = 0.75 + 0.25 * Math.sin(this.time * 4);
        this._forBeacons(w, camX, (x, y) => glow(amber, x, y, 0.32 * u, 0.6 * this.lampK * dk * pulse));
      }
      for (const fx of this._doorXs(w)) glow(warm, sx(fx), L.ceilY + 60 / 300 * L.corridorH, 0.9 * u, 0.5 * dk);
      if (w.zone % 4 >= 2) for (const f of w.leaves) {
        if (f.state === 'gone') continue;
        glow(this._radial('leaf' + f.kind, LEAF_RGB[f.kind].join(','), 0.25), sx(lerp(f.prevX, f.x, a)), lerp(f.prevY, f.y, a), 0.36 * u, 0.45 * dk * (0.8 + 0.2 * Math.sin(this.time * 3 + f.id)));
      }
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    }
    /* the headlamp lens on screen (logical px) */
    _lampScreen(w, camX) {
      const h = w.hero, a = w.alpha || 0, lm = h.lamp;
      if (!lm) return { x: lerp(h.prevX, h.x, a) - camX, y: lerp(h.prevY, h.y, a) };
      return { x: lerp(lm.prevX, lm.x, a) - camX, y: lerp(lm.prevY, lm.y, a) };
    }
    _lampXY(l, L) { return { x: l.x, y: l.side === 'ceil' ? L.ceilY + 0.5 * L.unit : L.floorY - 0.72 * L.unit }; }
    _doorXs(w) {
      const out = this._doors || (this._doors = []); out.length = 0;
      for (const p of (w.plans || [])) if (p && isFinite(p.finishX) && !out.includes(p.finishX)) out.push(p.finishX);
      if (w.finish && isFinite(w.finish.x) && !out.includes(w.finish.x)) out.push(w.finish.x);
      return out;
    }
    /* every visible warning beacon (screen x, y): props + the span ends at each open hatch */
    _forBeacons(w, camX, fn) {
      const L = w.layout, u = L.unit, VW = this.VW;
      for (const o of w.obstacles) {
        const x = o.x - camX; if (x < -u || x > VW + u || !o.beacon) continue;
        if (o.kind === 'vent') fn(x, L.floorY - o.h - 0.05 * u); else fn(x, L.ceilY + o.h + 0.05 * u);
      }
      const ends = (spans, y) => {
        for (let i = 0; i < spans.length; i++) {
          const r = spans[i];
          const a = r.x1 - camX, b = r.x0 - camX;
          if (i + 1 < spans.length && a > -u && a < VW + u) fn(a - 0.12 * u, y);
          if (i > 0 && b > -u && b < VW + u) fn(b + 0.12 * u, y);
        }
      };
      ends(w.roofs, L.floorY - 0.1 * u); ends(w.rails, L.ceilY + 0.1 * u);
    }

    // ---------------- events → juice ----------------
    _sx(x) { return x - this.camX(); }
    onEvents(evts) {
      const w = this.world, L = w && w.layout, wx = this.weather, u = L ? L.unit / 100 : 1;
      const h = w && w.hero;
      for (const e of evts) {
        switch (e.type) {
          case 'flip': this.hintOn = false; break;
          case 'land': {
            const v = clamp((e.speed || 0) / 960, 0, 1);
            if (wx && v > 0.25) {
              const fy = e.side === 'ceil' ? L.ceilY : L.floorY, up = e.side === 'ceil' ? -1 : 1;
              wx.burst('puff', L.heroX - 18 * u, fy, 2 + Math.round(v * 2), { speed: 60 * u, life: 0.45, size: 14 * u, gravity: -12 * up, spread: 1.0, angle: Math.PI, layer: 'front', scroll: 1 });
              wx.burst('puff', L.heroX + 16 * u, fy, 1 + Math.round(v), { speed: 50 * u, life: 0.4, size: 11 * u, gravity: -12 * up, spread: 0.8, angle: 0, layer: 'front', scroll: 1 });
            }
            this.shake = Math.max(this.shake, 0.6 + v * 1.2);
            break;
          }
          case 'catch': {
            const k = e.leaf ? e.leaf.kind : 0, x = this._sx(e.x);
            if (wx) wx.burst('bit_' + k, x, e.y, 7, { speed: 150 * u, life: 0.6, size: 12 * u, gravity: 90, spin: 6, layer: 'front', scroll: 0.6 });
            this.ring(x, e.y, LEAF_COL[k], 0.35, 26 * u, 3);
            this._popNear('+' + e.points, LEAF_COL[k], 17);
            break;
          }
          case 'combo': this.multShow = 1.2; this.say('×' + e.mult + ' Leaf streak!', null, null, '#fff2a8', 24, 'combo'); break;
          case 'comboBreak': this.multShow = 0.6; break;
          case 'bump': {
            this.shake = Math.max(this.shake, 6);
            this.say('Boing!', null, null, '#ffd0a0', 26, 'ouch');
            if (wx && e.ob) wx.burst('star', this._sx(e.ob.x), h.y, 6, { speed: 160 * u, life: 0.6, size: 13 * u, gravity: 120, layer: 'front', scroll: 1 });
            break;
          }
          case 'fall': this.say('Whee-e-e!', null, null, '#ffd0e8', 26, 'ouch'); break;
          case 'rescue':
            if (wx && h) wx.burst('puff', L.heroX, h.y, 6, { speed: 90 * u, life: 0.5, size: 16 * u, gravity: 0, layer: 'front', scroll: 1 });
            this.say('Thanks, Pip!', null, null, '#c9f0ff', 22, 'ouch');
            break;
          case 'heartLost': this.heartPulse = 1; break;
          case 'heartGain': this.heartPulse = 0.8; break;
          case 'lampsOn': this.say('Lamps on!', null, null, '#ffe2a0', 22, 'lamps'); break;
          case 'finish': {
            this.flash = 0.5; this.flashCol = '#fff2c4';
            this.texts = this.texts.filter(t => !t.big);
            if (wx) wx.burst('star', L.heroX + L.unit, L.midY, 16, { speed: 260 * u, life: 1.0, size: 16 * u, gravity: 160, layer: 'front', scroll: 0.5 });
            if (e.bonus) this._popNear('+' + e.bonus, '#ffd23f', 26, 1.6);
            break;
          }
          case 'levelUp': this.showBanner(e.zone); break;
          case 'gameOver': this.shake = 4; this.say('Out of hearts!', null, null, '#ffd0e8', 30, 'goal'); break;
        }
      }
    }
    /* Big callouts sit beside Ollie on the open side of the corridor, starting just ahead of him (never over him). */
    _sayX() { const L = this.world.layout; return L.heroX + 0.62 * L.unit; }
    _sayY() {   // above him on the floor, below him on the ceiling
      const w = this.world, L = w.layout, h = w.hero;
      return h && h.grav < 0 ? Math.min(L.floorY - 0.45 * L.unit, h.y + 1.0 * L.unit) : Math.max(L.ceilY + 0.45 * L.unit, h.y - 1.0 * L.unit);
    }
    _popNear(txt, col, size, ahead) {
      const w = this.world, L = w.layout, h = w.hero, u = L.unit;
      const y = h.grav < 0 ? h.y + 0.62 * u : h.y - 0.62 * u;
      this.pop(txt, L.heroX + (ahead || 0.7) * u, y, col, size, h.grav < 0 ? 50 : -50);
    }
    _quiet() { return OF.Game && OF.Game.mode === 'title'; }   // the title demo stays calm behind the menu
    ring(x, y, col, life, r, wdt) {
      if (this._quiet()) return; this.fx.push({ kind: 'ring', x, y, col, t: 0, life, r, w: wdt || 3 }); if (this.fx.length > 40) this.fx.shift();
    }
    pop(txt, x, y, col, size, vy) {
      if (this._quiet()) return;
      for (const t of this.texts) if (!t.big && t.t < 0.35 && Math.abs(t.x - x) < size * 3 && Math.abs(t.y - y) < size) x = t.x + size * 3;
      this.texts.push({ txt, x, y, col, size, t: 0, life: 0.8, vy: vy == null ? -60 : vy, vx: 0, align: 'left' }); if (this.texts.length > 24) this.texts.shift();
    }
    say(txt, x, y, col, size, key) {
      if (this._quiet() || !this.world) return;
      if (x == null) x = this._sayX();
      if (y == null) y = this._sayY();
      if (key) this.texts = this.texts.filter(t => t.key !== key);
      const dir = this.world.hero.grav < 0 ? 1 : -1;
      for (const t of this.texts) if (t.big && t.t < 1.0 && Math.abs(t.y - y) < size * 1.2) t.y += dir * size * 1.25;
      this.texts.push({ txt, x, y, col, size, t: 0, life: 1.2, vy: dir * 14, vx: 0, big: true, key, align: 'left' }); if (this.texts.length > 24) this.texts.shift();
    }

    update(dt) {
      this.time += dt;
      if (this.vis.t < 1) this.vis.t = Math.min(1, this.vis.t + dt / 1.6);
      this.shake = Math.max(0, this.shake - dt * 18);
      this.flash = Math.max(0, this.flash - dt * 1.6);
      this.multShow = Math.max(0, this.multShow - dt);
      this.heartPulse = Math.max(0, this.heartPulse - dt * 1.5);
      const w = this.world;
      if (w) {
        this.lampK = clamp(this.lampK + (w.lampsOn ? dt / 0.9 : -dt / 0.9), 0, 1);
        // leaf flutter: the mirror (face) eases through 0 in ≈ 0.12 s, so a flip of the sprite reads as a flutter
        const e = Math.min(1, dt * 16);
        for (const f of w.leaves) { const tgt = f.face || 1; f._fx = f._fx == null ? tgt : f._fx + (tgt - f._fx) * e; }
      }
      if (this.hintOn) { this._hintT = (this._hintT || 0) + dt; if (this._hintT > 12) this.hintOn = false; }
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
      for (const f of this.fx) f.t += dt;
      this.fx = this.fx.filter(f => f.t < f.life);
      for (const t of this.texts) { t.t += dt; t.y += t.vy * dt; t.x += t.vx * dt; }
      this.texts = this.texts.filter(t => t.t < t.life);
    }

    // ---------------- drawing ----------------
    camX() { const w = this.world; return w ? lerp(w.cam.prevX, w.cam.x, w.alpha || 0) : this.time * 120; }
    draw(mode) {
      const g = this.ctx, w = this.world, px = this.px, camX = this.camX();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.imageSmoothingEnabled = true;
      g.globalCompositeOperation = 'source-over';
      const v = this.vis, fading = v.t < 1;
      // outside → back weather (seen through the windows) → back wall
      if (fading) { this.drawOutside(g, v.prev, 1, camX); this.drawOutside(g, v.cur, v.t, camX); }
      else this.drawOutside(g, v.cur, 1, camX);
      if (!this.background(v.cur).custom) { g.setTransform(px, 0, 0, px, 0, 0); this.drawParticles(g, 'back'); g.setTransform(1, 0, 0, 1, 0, 0); }
      if (fading) { this.drawWall(g, v.prev, 1, camX); this.drawWall(g, v.cur, v.t, camX); }
      else this.drawWall(g, v.cur, 1, camX);
      if (!w) return;
      const sh = this.shake > 0 ? this.shake : 0;
      const sx = sh ? Math.sin(this.time * 71) * sh : 0, sy = sh ? Math.cos(this.time * 53) * sh * 0.6 : 0;
      // world space: x shifted by the scroll
      g.setTransform(px, 0, 0, px, (sx - camX) * px, sy * px);
      this.drawLamps(g, w, camX);
      if (fading) { this.drawTrack(g, w, v.prev, 1, camX); this.drawTrack(g, w, v.cur, v.t, camX); }
      else this.drawTrack(g, w, v.cur, 1, camX);
      this.drawFinish(g, w, camX);
      this.drawObstacles(g, w, camX);
      this.drawLeaves(g, w, camX);
      this.drawHero(g, w, mode);
      this.drawDrone(g, w, camX);
      g.setTransform(px, 0, 0, px, sx * px, sy * px);
      this.drawParticles(g, 'front');
      this.drawRings(g);
      if (this.debug) { g.setTransform(px, 0, 0, px, -camX * px, 0); this.drawDebug(g, w, camX); }
      g.setTransform(1, 0, 0, 1, 0, 0);
      { const bg = this.background(v.cur); if (bg.vig) g.drawImage(bg.vig, 0, 0); }
      g.setTransform(px, 0, 0, px, 0, 0);
      const tint = this.weather && this.weather.ambient && this.weather.ambient.tint;
      if (tint) { g.fillStyle = tint; g.fillRect(0, 0, this.VW, this.VH); }
      // darkness over the world, under texts / HUD / banners
      this.drawDarkness(g, w, camX);
      g.setTransform(px, 0, 0, px, 0, 0);
      this.drawTexts(g);
      if (mode !== 'title') this.drawHud(g, w, mode);
      else {
        const dg = g.createRadialGradient(this.VW / 2, this.VH / 2, 0, this.VW / 2, this.VH / 2, Math.max(this.VW, this.VH) * 0.6);
        dg.addColorStop(0, 'rgba(10,12,40,.50)'); dg.addColorStop(1, 'rgba(10,12,40,.16)');
        g.fillStyle = dg; g.fillRect(0, 0, this.VW, this.VH);
      }
      if (this.banner && mode !== 'title') this.drawBanner(g);
      if (this.flash > 0) { g.globalAlpha = Math.min(0.35, this.flash * 0.6); g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.globalAlpha = 1; }
    }

    spr(key, w, h) { return OF.Assets.sprite(key, w, h); }

    /* Floor (tiled building.svg, top surface y16 at floorY), ceiling beam (rail.svg, underside y144 at ceilY),
     * open hatches: a dark hole with slab-coloured sides; the ceiling fill above the beam in tall portrait. */
    drawTrack(g, w, b, alpha, camX) {
      const L = w.layout, u = L.unit, n = OF.Assets.SEASONS[b], P = PAL[b], VH = this.VH;
      const x0v = camX - 2 * u, x1v = camX + this.VW + 2 * u;
      g.globalAlpha = alpha;
      // ---- hatch holes behind the spans (floor: down into the storey below; ceiling: up into the one above)
      const sw = 0.12 * u;
      const holes = (spans, floor) => {
        for (let i = 0; i + 1 < spans.length; i++) {
          const g0 = spans[i].x1, g1 = spans[i + 1].x0;
          if (g1 < x0v || g0 > x1v || g1 - g0 < 1) continue;
          if (floor) {
            g.fillStyle = shade(P.bottom, -0.4); g.fillRect(g0, L.floorY, g1 - g0, VH - L.floorY + 2);
            g.fillStyle = P.slab; g.fillRect(g0, L.floorY, sw, 0.9 * u); g.fillRect(g1 - sw, L.floorY, sw, 0.9 * u);
            g.fillStyle = shade(P.slab, -0.3); g.fillRect(g0, L.floorY + 0.9 * u, sw, VH); g.fillRect(g1 - sw, L.floorY + 0.9 * u, sw, VH);
          } else {
            g.fillStyle = shade(P.bottom, -0.25); g.fillRect(g0, -2, g1 - g0, L.ceilY + 2);
            g.fillStyle = P.slab; g.fillRect(g0, L.ceilY - 0.9 * u, sw, 0.9 * u); g.fillRect(g1 - sw, L.ceilY - 0.9 * u, sw, 0.9 * u);
            g.fillStyle = shade(P.slab, -0.3); g.fillRect(g0, -2, sw, L.ceilY - 0.9 * u + 2); g.fillRect(g1 - sw, -2, sw, L.ceilY - 0.9 * u + 2);
          }
        }
      };
      holes(w.roofs, true); holes(w.rails, false);
      // ---- floor spans
      const bw = 2.4 * u, bh = 4 * u, top = L.floorY - 0.16 * u, bot = top + bh;
      const bim = this.spr(n + '_building', bw, bh);
      for (const r of w.roofs) {
        if (r.x1 < x0v || r.x0 > x1v) continue;
        const a = Math.max(r.x0, x0v - bw), e = Math.min(r.x1, x1v);
        const k = Math.floor((a - r.x0) / bw);
        for (let x = r.x0 + k * bw; x < e; x += bw) {
          const cw = Math.min(bw, r.x1 - x);
          if (cw <= 0.5) break;
          if (bim) g.drawImage(bim, 0, 0, bim.width * cw / bw, bim.height, x, top, cw, bh);
          else { g.fillStyle = P.slab; g.fillRect(x, top, cw, bh); }
        }
        if (bot < VH) { g.fillStyle = P.bottom; g.fillRect(r.x0, bot - 1, r.x1 - r.x0, VH - bot + 1); }
      }
      // ---- ceiling beam spans (+ the ceiling above them on tall screens)
      const rw = 2.4 * u, rh = 1.6 * u, rtop = L.ceilY - 1.44 * u;
      const rim = this.spr(n + '_rail', rw, rh), cap = this.spr(n + '_rail_end', 0.4 * u, rh);
      for (const r of w.rails) {
        if (r.x1 < x0v || r.x0 > x1v) continue;
        if (rtop > 0) { g.fillStyle = this._ceilGrad(g, b, rtop); g.fillRect(r.x0, -2, r.x1 - r.x0, rtop + 3); }
        const a = Math.max(r.x0, x0v - rw), e = Math.min(r.x1, x1v);
        const k = Math.floor((a - r.x0) / rw);
        for (let x = r.x0 + k * rw; x < e; x += rw) {
          const cw = Math.min(rw, r.x1 - x);
          if (cw <= 0.5) break;
          if (rim) g.drawImage(rim, 0, 0, rim.width * cw / rw, rim.height, x, rtop, cw, rh);
          else { g.fillStyle = P.ceil; g.fillRect(x, rtop, cw, rh); }
        }
        if (cap) {
          if (r.x1 < x1v) g.drawImage(cap, r.x1 - 0.4 * u, rtop, 0.4 * u, rh);
          if (r.x0 > x0v) { g.save(); g.translate(r.x0 + 0.4 * u, rtop); g.scale(-1, 1); g.drawImage(cap, 0, 0, 0.4 * u, rh); g.restore(); }
        }
      }
      // ---- hatch warning beacons on the span ends (only while the lamps are on)
      if (this.lampK > 0.01 && alpha > 0.5) {
        const bs = this._beaconSpr(u), d = 0.16 * u;
        g.globalAlpha = this.lampK;
        this._forBeacons({ layout: L, obstacles: [], roofs: w.roofs, rails: w.rails }, camX, (x, y) => g.drawImage(bs, x + camX - d, y - d, 2 * d, 2 * d));
      }
      g.globalAlpha = 1;
    }
    /* tall portrait: the ceiling above the beam fades a little darker upward (cached per floor + size) */
    _ceilGrad(g, b, rtop) {
      const k = 'cg|' + b + '|' + Math.round(rtop);
      let gr = this._stamps[k];
      if (!gr) {
        const c = PAL[b].ceil;
        gr = g.createLinearGradient(0, 0, 0, rtop);
        gr.addColorStop(0, shade(c, -0.35)); gr.addColorStop(0.75, shade(c, -0.08)); gr.addColorStop(1, c);
        this._stamps[k] = gr;
      }
      return gr;
    }
    /* a little amber warning lamp */
    _beaconSpr(u) {
      const s = 0.32 * u;
      return this._stamp('beacon|' + Math.round(s), s, s, (g, w) => {
        const c = w / 2;
        const gr = g.createRadialGradient(c * 0.85, c * 0.8, 0, c, c, c * 0.62);
        gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.5, '#ffb43c'); gr.addColorStop(1, '#e0761e');
        g.fillStyle = gr; g.beginPath(); g.arc(c, c, c * 0.6, 0, TAU); g.fill();
        g.lineWidth = Math.max(1, w * 0.08); g.strokeStyle = '#6a3a14'; g.stroke();
      });
    }

    /* Wall lamps: brass sconces with a glass globe, alternating high and low; lit when the lamps are on. */
    drawLamps(g, w, camX) {
      const L = w.layout, u = L.unit, s = 0.36 * u;
      const off = this._lampSpr(u, false), on = this._lampSpr(u, true);
      for (const l of w.lamps) {
        if (l.x < camX - u || l.x > camX + this.VW + u) continue;
        const p = this._lampXY(l, L);
        g.globalAlpha = 1; g.drawImage(off, p.x - s / 2, p.y - s * 0.5, s, s);
        if (this.lampK > 0.01) { g.globalAlpha = this.lampK; g.drawImage(on, p.x - s / 2, p.y - s * 0.5, s, s); }
      }
      g.globalAlpha = 1;
    }
    _lampSpr(u, lit) {
      const s = 0.36 * u;
      return this._stamp('lamp|' + lit + '|' + Math.round(s), s, s, (g, w) => {
        const c = w / 2;
        // wall plate
        g.fillStyle = lit ? '#8a6a3a' : '#6e5a3c'; g.strokeStyle = '#3e2c12'; g.lineWidth = Math.max(1, w * 0.04);
        this._rr(g, c - w * 0.13, w * 0.5, w * 0.26, w * 0.46, w * 0.08); g.fill(); g.stroke();
        // bracket
        g.fillStyle = '#7a5a2a'; g.strokeStyle = '#3e2c12'; g.lineWidth = Math.max(1, w * 0.04);
        this._rr(g, c - w * 0.07, w * 0.62, w * 0.14, w * 0.3, w * 0.04); g.fill(); g.stroke();
        this._rr(g, c - w * 0.2, w * 0.86, w * 0.4, w * 0.08, w * 0.03); g.fill(); g.stroke();
        // globe
        const gr = g.createRadialGradient(c * 0.9, c * 0.85, 0, c, c, w * 0.3);
        if (lit) { gr.addColorStop(0, '#fffbe0'); gr.addColorStop(0.55, '#ffe08a'); gr.addColorStop(1, '#ffb347'); }
        else { gr.addColorStop(0, '#f4f6fa'); gr.addColorStop(1, '#b8c4d6'); }
        g.fillStyle = gr; g.beginPath(); g.arc(c, c * 0.95, w * 0.26, 0, TAU); g.fill();
        g.strokeStyle = lit ? '#a8641e' : '#6c7a92'; g.lineWidth = Math.max(1, w * 0.045); g.stroke();
        // brass cap
        g.fillStyle = '#c99a3c'; this._rr(g, c - w * 0.12, w * 0.16, w * 0.24, w * 0.08, w * 0.03); g.fill();
      });
    }

    /* The floor's stairway door (finish.svg, stretched over the corridor). */
    drawFinish(g, w, camX) {
      const L = w.layout, u = L.unit, fw = 1.4 * u, im = this.spr('finish', fw, L.corridorH);
      for (const x of this._doorXs(w)) {
        if (x < camX - fw || x > camX + this.VW + fw) continue;
        if (im) g.drawImage(im, x - fw / 2, L.ceilY, fw, L.corridorH);
        else { g.fillStyle = '#ffe6a0'; g.fillRect(x - fw / 3, L.ceilY, fw / 1.5, L.corridorH); }
      }
    }

    drawObstacles(g, w, camX) {
      const L = w.layout, u = L.unit, bs = this._beaconSpr(u), d = 0.16 * u;
      const pulse = 0.8 + 0.2 * Math.sin(this.time * 4);
      for (const o of w.obstacles) {
        if (o.x + o.w < camX || o.x - o.w > camX + this.VW) continue;
        const key = o.kind + '_' + (o.variant || 0), im = this.spr(key, o.w, o.h);
        const ht = o.hit ? (o.hitT || 0) : 99, sq = ht < 0.5 ? Math.sin(ht / 0.5 * Math.PI) * 0.18 * (1 - ht / 0.5) : 0;
        g.save();
        if (o.kind === 'vent') {
          g.translate(o.x, L.floorY);
          g.scale(1 + sq, 1 - sq);
          g.globalAlpha = o.hit ? 0.75 : 1;
          if (im) g.drawImage(im, -o.w / 2, -o.h, o.w, o.h); else { g.fillStyle = '#e8eef6'; g.fillRect(-o.w / 2, -o.h, o.w, o.h); }
          if (o.beacon && this.lampK > 0.01) { g.globalAlpha = this.lampK * pulse; g.drawImage(bs, -d, -o.h - 0.05 * u - d, 2 * d, 2 * d); }
        } else {
          const sw = Math.sin(this.time * 2.2 + o.x * 0.013) * 0.05 + (ht < 1.2 ? Math.sin(ht * 14) * 0.25 * (1 - ht / 1.2) : 0);
          g.translate(o.x, L.ceilY);
          g.rotate(sw);
          g.globalAlpha = o.hit ? 0.75 : 1;
          if (im) g.drawImage(im, -o.w / 2, 0, o.w, o.h); else { g.fillStyle = '#b0845a'; g.fillRect(-o.w / 2, 0, o.w, o.h); }
          if (o.beacon && this.lampK > 0.01) { g.globalAlpha = this.lampK * pulse; g.drawImage(bs, -d, o.h + 0.05 * u - d, 2 * d, 2 * d); }
        }
        g.restore();
      }
      g.globalAlpha = 1;
    }

    /* A soft dark outline around a sprite (contrast on the pale Greenhouse wall), cached per sprite + size. */
    _outlined(key, s) {
      const ck = 'ol|' + key + '|' + Math.round(s * 4) + '|' + (OF.Assets._ver || 0);
      let c = this._spr[ck];
      if (c) return c;
      const src = key === 'custom:leaf' ? this._customLeaf(s) : this.spr(key, s, s);
      if (!src) return null;
      const px = this.px, pad = Math.ceil(0.12 * s * px), W = Math.ceil(s * px) + 2 * pad;
      c = this._canvas(W, W);
      const g = c.getContext('2d');
      const o = Math.max(1.5, 0.045 * s * px);
      for (let i = 0; i < 12; i++) { const a = i / 12 * TAU; g.drawImage(src, pad + Math.cos(a) * o, pad + Math.sin(a) * o, W - 2 * pad, W - 2 * pad); }
      g.globalCompositeOperation = 'source-in'; g.fillStyle = 'rgba(36,40,30,0.55)'; g.fillRect(0, 0, W, W);
      g.globalCompositeOperation = 'source-over';
      g.drawImage(src, pad, pad, W - 2 * pad, W - 2 * pad);
      c._pad = pad / px;
      this._spr[ck] = c;
      return c;
    }
    /* Custom leaf: the picture, round, inside a leaf-shaped green ring with a little stem (pre-rendered). */
    _customLeaf(s) {
      const ck = 'cleaf|' + Math.round(s * 4) + '|' + (OF.Assets._ver || 0);
      if (this._spr[ck]) return this._spr[ck];
      const im = this.spr('custom:leaf', s, s); if (!im) return null;
      const px = this.px, W = Math.ceil(s * px), c = this._canvas(W, W), g = c.getContext('2d');
      g.setTransform(W / 64, 0, 0, W / 64, 0, 0);
      g.save(); g.translate(32, 32); g.rotate(-Math.PI / 4);
      // stem
      g.strokeStyle = '#2f7d2e'; g.lineWidth = 4; g.lineCap = 'round';
      g.beginPath(); g.moveTo(-24, 0); g.quadraticCurveTo(-29, 1, -31, 5); g.stroke();
      // leaf shape
      g.beginPath(); g.moveTo(-25, 0); g.bezierCurveTo(-14, -21, 14, -21, 29, 0); g.bezierCurveTo(14, 21, -14, 21, -25, 0); g.closePath();
      g.fillStyle = '#5fd35a'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#2f7d2e'; g.stroke();
      g.restore();
      // round picture in the middle
      g.save(); g.beginPath(); g.arc(32, 32, 14.5, 0, TAU); g.clip();
      const src = OF.Assets.custom.leaf, k = Math.max(29 / src.width, 29 / src.height);
      g.drawImage(src, 32 - src.width * k / 2, 32 - src.height * k / 2, src.width * k, src.height * k);
      g.restore();
      g.beginPath(); g.arc(32, 32, 14.5, 0, TAU); g.lineWidth = 2.2; g.strokeStyle = '#eaffd8'; g.stroke();
      this._spr[ck] = c;
      return c;
    }

    /* Leaves: pendulum rotation from the world, a mirror flip for the flutter, a soft outline; caught ones spiral in. */
    drawLeaves(g, w, camX) {
      const L = w.layout, u = L.unit, a = w.alpha || 0, S = LEAF_K * u, custom = OF.Assets.hasCustom('leaf');
      for (const f of w.leaves) {
        if (f.state === 'gone') continue;
        const x = lerp(f.prevX, f.x, a), y = lerp(f.prevY, f.y, a);
        if (x < camX - S || x > camX + this.VW + S) continue;
        let k = 1, al = 1;
        if (f.state === 'caught') { const t = clamp(f.t / 0.35, 0, 1); k = 1 - t * 0.55; al = 1 - t * 0.7; }
        const im = this._outlined(custom ? 'custom:leaf' : 'leaf_' + f.kind, S);
        const rot = lerp(f.prevRot != null ? f.prevRot : f.rot, f.rot, a), fx = f._fx == null ? (f.face || 1) : f._fx;
        const sxk = (Math.abs(fx) < 0.18 ? (fx < 0 ? -0.18 : 0.18) : fx) * k;
        g.save(); g.translate(x, y); g.rotate(rot); g.scale(sxk, k);
        g.globalAlpha = al;
        if (im) { const p = im._pad || 0, s2 = S + 2 * p; g.drawImage(im, -s2 / 2, -s2 / 2, s2, s2); }
        else { g.fillStyle = LEAF_COL[f.kind]; g.beginPath(); g.ellipse(0, 0, S * 0.45, S * 0.25, -0.6, 0, TAU); g.fill(); }
        g.restore();
      }
      g.globalAlpha = 1;
    }

    /* Pip the puffin: swoops in, carries Ollie on its rope, flaps away. */
    drawDrone(g, w, camX) {
      const d = w.drone; if (!d) return;
      const L = w.layout, u = L.unit, a = w.alpha || 0, dw = 1.0 * u, dh = 0.75 * u;
      const x = lerp(d.prevX, d.x, a), y = lerp(d.prevY, d.y, a);
      const im = this.spr('drone', dw, dh);
      const flap = Math.sin(this.time * 16);
      g.save();
      g.translate(x, y + flap * 0.03 * u);
      if (d.flipY) g.scale(1, -1);
      g.rotate(Math.sin(this.time * 3) * 0.05);
      g.scale(1 + flap * 0.03, 1 - flap * 0.07);   // wing beat: a quick squash-and-stretch of the one pose
      if (im) g.drawImage(im, -dw / 2, -dh * 36 / 96, dw, dh);
      else { g.fillStyle = '#20242e'; g.beginPath(); g.arc(0, 0, dw * 0.25, 0, TAU); g.fill(); }
      g.restore();
      g.globalAlpha = 1;
    }

    drawHero(g, w, mode) {
      const h = w.hero, L = w.layout, u = L.unit, a = w.alpha || 0;
      const x = lerp(h.prevX, h.x, a), y = lerp(h.prevY, h.y, a), ft = lerp(h.prevFlipT, h.flipT, a);
      const S = u * OLLIE_K;
      const blink = h.invuln > 0 && w.phase !== 'over' && Math.floor(this.time * 10) % 2 === 0;
      // soft contact shadow on the surface
      if (h.grounded && h.state !== 'rescue') {
        const ry = h.side === 'ceil' ? L.ceilY : L.floorY;
        g.globalAlpha = blink ? 0.12 : 0.22; g.fillStyle = '#1a1020';
        g.beginPath(); g.ellipse(x, ry, 0.36 * u, 0.06 * u, 0, 0, TAU); g.fill();
      }
      g.globalAlpha = blink ? 0.55 : 1;
      // turn-over: vertical scale through ±0.42 (sign flips in one frame) plus a tilt: the nose leads the way
      let sy = Math.cos(Math.PI * ft);
      if (Math.abs(sy) < 0.42) sy = ft < 0.5 ? 0.42 : -0.42;
      const going = h.grav < 0 ? -1 : 1;
      const tilt = Math.sin(Math.PI * ft) * 0.45 * going + (h.knock || 0) * Math.sin(this.time * 30) * 0.12;
      const sq = h.squash || 0, foot = OLLIE_STAND * u;
      const hop = h.bumpT != null && h.bumpT < 0.45 ? Math.sin(h.bumpT / 0.45 * Math.PI) * 0.22 * u : 0;
      g.save();
      g.translate(x, y - hop * (h.grav < 0 ? -1 : 1));
      g.rotate(tilt);
      g.scale(1, sy);
      // landing squash pivots on the feet line, so the paws stay on the surface
      g.translate(0, foot); g.scale(1 + sq * 0.16, 1 - sq * 0.16); g.translate(0, -foot);
      const custom = OF.Assets.hasCustom('hero');
      const air = !h.grounded || h.state === 'rescue';
      let frame;
      if (w.phase === 'over' || (h.bumpT != null && h.bumpT < 0.6)) frame = 'bump';
      else if (air) frame = 'air';
      else if (h.happyT != null && h.happyT < 0.3) frame = 'happy';
      else frame = 'run_' + (Math.floor((h.runPhase || 0) * 4) % 4);
      const topY = OLLIE_STAND * u - S * OLLIE_FEET;   // sprite top relative to the hit centre (feet on the surface)
      if (custom) this._drawCustomHero(g, h, u, S, air);
      else {
        const im = this.spr('ollie_' + frame, S, S) || this.spr('ollie_run_0', S, S);
        if (im) g.drawImage(im, -S / 2, topY, S, S);
        else { g.fillStyle = '#8a5a3c'; g.beginPath(); g.arc(0, 0, S * 0.32, 0, TAU); g.fill(); }
      }
      g.restore();
      g.globalAlpha = 1;
    }
    /* Custom hero: the picture, round, inside a procedural otter ring: two round ears, a teal scarf band, little paws,
     * a tail and the brass headlamp (at the same lens spot the world uses for the beam). */
    _drawCustomHero(g, h, u, S, air) {
      const R = S * 0.4, cy = -0.03 * u, lp = (h.runPhase || 0) * TAU;
      const bob = air ? 0 : Math.abs(Math.sin(lp)) * 0.025 * u, c = cy - bob;
      const fur = '#8a5a3c', line = '#3b2417';
      g.lineWidth = Math.max(2, 0.03 * u); g.strokeStyle = line; g.lineJoin = 'round';
      // tail
      g.fillStyle = fur;
      g.beginPath(); g.ellipse(-R * 1.05, c + R * 0.55, R * 0.42, R * 0.16, -0.35 + (air ? 0 : Math.sin(lp) * 0.15), 0, TAU); g.fill(); g.stroke();
      // paws
      g.fillStyle = '#3a2418';
      for (let i = 0; i < 2; i++) {
        const sw = air ? 0 : Math.sin(lp + i * Math.PI) * 0.07 * u;
        g.beginPath(); g.ellipse((i ? 0.2 : -0.2) * u + sw, OLLIE_STAND * u - 0.05 * u, 0.09 * u, 0.055 * u, 0, 0, TAU); g.fill();
      }
      // ears
      g.fillStyle = fur;
      for (const ex of [-0.62, 0.62]) { g.beginPath(); g.arc(ex * R, c - R * 0.86, R * 0.26, 0, TAU); g.fill(); g.stroke(); }
      g.fillStyle = '#f3dfc1';
      for (const ex of [-0.62, 0.62]) { g.beginPath(); g.arc(ex * R, c - R * 0.86, R * 0.12, 0, TAU); g.fill(); }
      // ring + picture
      g.beginPath(); g.arc(0, c, R + 0.06 * u, 0, TAU); g.fillStyle = fur; g.fill(); g.stroke();
      const src = OF.Assets.custom.hero;
      if (src) {
        g.save(); g.beginPath(); g.arc(0, c, R, 0, TAU); g.clip();
        g.fillStyle = '#f3dfc1'; g.fillRect(-R, c - R, 2 * R, 2 * R);
        const shape = OF.Storage.get('shape_hero', 'fit');
        const k = shape === 'circle' ? 2 * R / Math.min(src.width, src.height) : Math.max(2 * R / src.width, 2 * R / src.height);
        const im = this.spr('custom:hero', src.width * k, src.height * k);
        if (im) g.drawImage(im, -src.width * k / 2, c - src.height * k / 2, src.width * k, src.height * k);
        g.restore();
      }
      // teal scarf band across the bottom of the ring, its ends trailing back
      g.save(); g.beginPath(); g.arc(0, c, R + 0.07 * u, 0.18 * Math.PI, 0.82 * Math.PI); g.lineWidth = 0.11 * u; g.strokeStyle = '#2ec4b6'; g.stroke(); g.restore();
      g.fillStyle = '#2ec4b6'; g.strokeStyle = '#1f8f86'; g.lineWidth = Math.max(1.5, 0.02 * u);
      const flap = air ? 0.1 : Math.sin(lp * 2) * 0.05;
      g.beginPath(); g.moveTo(-R * 0.75, c + R * 0.62); g.lineTo(-R * 1.45, c + R * (0.45 + flap)); g.lineTo(-R * 1.4, c + R * (0.72 + flap)); g.lineTo(-R * 0.7, c + R * 0.82); g.closePath(); g.fill(); g.stroke();
      g.fillStyle = '#ffffff';
      for (const t of [0.3, 0.5, 0.7]) { const a = (0.18 + 0.64 * t) * Math.PI; g.beginPath(); g.arc(Math.cos(a) * (R + 0.07 * u), c + Math.sin(a) * (R + 0.07 * u), 0.016 * u, 0, TAU); g.fill(); }
      // headlamp strap + lens at the world's lamp offset (0.208u, −0.144u from the hit centre)
      const lx = 0.208 * u, ly = -0.144 * u - bob;
      g.strokeStyle = '#4a3020'; g.lineWidth = 0.035 * u;
      g.beginPath(); g.arc(0, c, R * 0.98, -0.95 * Math.PI, -0.12 * Math.PI); g.stroke();
      g.fillStyle = '#c99a3c'; g.strokeStyle = '#6a4a1a'; g.lineWidth = Math.max(1.5, 0.02 * u);
      g.beginPath(); g.arc(lx, ly, 0.075 * u, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#fff2a8'; g.beginPath(); g.arc(lx + 0.01 * u, ly, 0.045 * u, 0, TAU); g.fill();
    }

    drawParticles(g, layer) {
      const wx = this.weather; if (!wx) return;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        const pw = p.sprite === 'aurora' ? p.size : p.size, ph = p.sprite === 'aurora' ? p.size / 2 : p.size;
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

    drawRings(g) {
      for (const f of this.fx) {
        const k = f.t / f.life;
        if (f.kind === 'ring') {
          g.globalAlpha = (1 - k) * 0.9; g.strokeStyle = f.col; g.lineWidth = f.w * (1 - k) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.r * (0.3 + 0.7 * Math.sqrt(k)), 0, TAU); g.stroke();
        }
      }
      g.globalAlpha = 1;
    }
    /* "+N" popups and callouts: above the darkness, left-aligned just ahead of Ollie so they never cover him. */
    drawTexts(g) {
      g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const k = t.t / t.life, sc = t.big ? (k < 0.15 ? 0.6 + k / 0.15 * 0.5 : k < 0.25 ? 1.1 - (k - 0.15) : 1) : 1;
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        let fs = Math.round(t.size * sc * this._hudK);
        g.font = '900 ' + fs + 'px ' + FONT;
        let tw = g.measureText(t.txt).width;
        const maxW = this.VW - t.x - 12 - this.ins.right;
        if (tw > maxW && maxW > 40) { fs = Math.floor(fs * maxW / tw); g.font = '900 ' + fs + 'px ' + FONT; tw = maxW; }
        const x = Math.min(t.x, this.VW - 12 - this.ins.right - tw);
        g.textAlign = 'left';
        g.lineWidth = Math.max(3, t.size * 0.22); g.strokeStyle = 'rgba(16,14,44,.9)'; g.strokeText(t.txt, x, t.y);
        g.fillStyle = t.col; g.fillText(t.txt, x, t.y);
      }
      g.globalAlpha = 1;
    }

    // ---------------- HUD ----------------
    _rr(g, x, y, w, h, r) {
      g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
      g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    }
    _panel(g, x, y, w, h, r) {
      this._rr(g, x, y, w, h, r);
      g.fillStyle = 'rgba(16,24,52,.74)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(160,220,230,.45)'; g.stroke();
    }
    _text(g, txt, x, y, size, col, align, weight) {
      g.font = (weight || '900') + ' ' + Math.round(size) + 'px ' + FONT; g.textAlign = align || 'left'; g.textBaseline = 'middle';
      g.lineJoin = 'round'; g.lineWidth = Math.max(2.5, size * 0.18); g.strokeStyle = 'rgba(14,12,44,.95)'; g.strokeText(txt, x, y);
      g.fillStyle = col; g.fillText(txt, x, y);
    }
    /* Panels fade when Ollie runs up under them. */
    _fadeFor(w, x, y, wd, ht) {
      const h = w.hero, L = w.layout, S = L.unit * OLLIE_K;
      const l = L.heroX - S / 2, r = L.heroX + S / 2, t = h.y - S * 0.6, b = h.y + S * 0.6;
      return (r > x && l < x + wd && b > y && t < y + ht) ? 0.3 : 1;
    }
    /* HUD layout (also read by the tests): score panel left, floor panel centre-top (landscape) or second row (portrait). */
    hudLayout(w) {
      const L = w.layout, K = Math.min(this._hudK, 1.25), I = this.ins, VW = this.VW;
      const x0 = I.left + 12, top = I.top + 12, hb = this._hudBtn;
      const hs = 22 * Math.min(K, 1.15), pw = Math.max(214 * Math.min(K, 1.1), 28 + w.maxHearts * (hs + 4));
      const right = hb ? hb.l - 10 : VW - 110;
      let cx, cy, cw;
      if (!L.portrait) { cw = clamp(right - (x0 + pw) - 24, 220, 340); cx = Math.max(x0 + pw + 12 + cw / 2, VW / 2); if (cx + cw / 2 > right) cx = right - cw / 2; cy = top; }
      else { cw = Math.min(VW - I.left - I.right - 24, 420); cx = VW / 2; cy = top + 108; }
      return { K, hs, score: [x0, top, pw, 98], zone: [cx - cw / 2, cy, cw, 78] };
    }
    drawHud(g, w, mode) {
      const H = this.hudLayout(w), K = H.K, VW = this.VW;
      this.hudRects = H;
      const best = OF.Game ? OF.Game.best(OF.Game.runDifficulty) : 0;
      const [x0, top, pw, ph] = H.score, hs = H.hs;
      this._hudA = this._hudA || [1, 1];
      // score + best + hearts (left)
      this._hudA[0] += (this._fadeFor(w, x0, top, pw, ph) - this._hudA[0]) * 0.15;
      g.globalAlpha = this._hudA[0];
      this._panel(g, x0, top, pw, ph, 18);
      const multOn = (w.mult || 1) >= 2, multW = multOn ? 44 * K : 0;
      let fs = 32 * K; g.font = '900 ' + Math.round(fs) + 'px ' + FONT;
      const sw = g.measureText(String(w.score)).width, room = pw - 32 - multW;
      if (sw > room) fs *= room / sw;
      this._text(g, String(w.score), x0 + 16, top + 30, fs, '#fff', 'left');
      this._text(g, 'Best ' + Math.max(best, w.score), x0 + 16, top + 58, 13 * K, '#ffd98a', 'left', '800');
      if (multOn) this._text(g, '×' + w.mult, x0 + pw - 14, top + 30, (22 + (this.multShow > 0 ? 5 : 0)) * K, '#fff2a8', 'right');
      for (let i = 0; i < w.maxHearts; i++) {
        const on = i < w.hearts, pulse = (i === (on ? w.hearts - 1 : w.hearts) && this.heartPulse > 0) ? 1 + this.heartPulse * 0.5 : 1;
        const im = this.spr(on ? 'battery' : 'battery_empty', hs, hs), hx = x0 + 14 + i * (hs + 4), hy = top + 72;
        if (im) g.drawImage(im, hx + hs / 2 - hs * pulse / 2, hy + hs / 2 - hs * pulse / 2 - 6, hs * pulse, hs * pulse);
      }
      // floor name + progress to the stairway door + leaves / distance
      const [zx, zy, cw, zh] = H.zone;
      this._hudA[1] += (this._fadeFor(w, zx, zy, cw, zh) - this._hudA[1]) * 0.15;
      g.globalAlpha = this._hudA[1];
      this._panel(g, zx, zy, cw, zh, 18);
      const z = w.zone % 4, info = ZONE_INFO[z];
      this._text(g, FLOOR_LABEL(z), zx + 14, zy + 18, 14 * K, info.color, 'left', '800');
      this._text(g, info.time + (w.loop ? ' · Day ' + (w.loop + 1) : ''), zx + cw - 14, zy + 18, 12 * K, '#e8ecff', 'right', '800');
      const bx = zx + 14, bw = cw - 28, by = zy + 34, bhh = 10, k = clamp(w.progress || 0, 0, 1);
      this._rr(g, bx, by, bw, bhh, 5); g.fillStyle = 'rgba(255,255,255,.12)'; g.fill();
      if (k > 0) {
        this._rr(g, bx, by, Math.max(10, bw * k), bhh, 5);
        const gr = g.createLinearGradient(bx, 0, bx + bw, 0);
        gr.addColorStop(0, ['#ffb0a0', '#8fd8ff', '#ffb070', '#7f8cff'][z]); gr.addColorStop(1, ['#fff2a8', '#e8fbff', '#ffdf9a', '#c9f0ff'][z]);
        g.fillStyle = gr; g.fill();
      }
      if (z === 3) this._moon(g, bx + bw * k, by + bhh / 2, 8); else this._sun(g, bx + bw * k, by + bhh / 2, 7.5);
      const cyy = zy + 62;
      const lim = this.spr('leaf_1', 18 * Math.min(K, 1.1), 18 * Math.min(K, 1.1));
      if (lim) g.drawImage(lim, bx - 2, cyy - 9 * Math.min(K, 1.1), 18 * Math.min(K, 1.1), 18 * Math.min(K, 1.1));
      this._text(g, String((w.stats && w.stats.caught) || 0), bx + 20 * Math.min(K, 1.1), cyy, 13 * K, '#e8ecff', 'left', '800');
      this._text(g, Math.round(w.distance || 0) + ' m', bx + bw, cyy, 12 * K, '#e8ecff', 'right', '800');
      g.globalAlpha = 1;
      if (this.hintOn && mode === 'playing' && !this.banner) this._text(g, ZONE_INFO[0].hint, VW / 2, this._lowY(), 19 * K, '#fff', 'center', '800');
    }
    /* A line in the storey below the floor (never over the play corridor). */
    _lowY() { const L = this.world.layout; return Math.min(this.VH - 24 - this.ins.bottom, L.floorY + Math.max(40, (this.VH - L.floorY) * 0.45)); }
    _sun(g, x, y, r) {
      g.fillStyle = '#ffe27a';
      g.beginPath(); for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8, rr = i % 2 ? r * 0.72 : r * 1.12; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill();
      g.beginPath(); g.arc(x, y, r * 0.62, 0, TAU); g.fillStyle = '#fff6c8'; g.fill();
    }
    _moon(g, x, y, r) {
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = '#f4f2d8'; g.fill();
      g.beginPath(); g.arc(x + r * 0.45, y - r * 0.3, r * 0.82, 0, TAU); g.fillStyle = '#2a3a78'; g.fill();
    }

    drawBanner(g) {
      const b = this.banner, z = b.s % 4, info = ZONE_INFO[z], t = b.t;
      const a = t < 0.3 ? t / 0.3 : t > 2.2 ? Math.max(0, (2.6 - t) / 0.4) : 1;
      const h = 76, cx = this.VW / 2, y = this._lowY() - (1 - a) * 16;
      const w = Math.min(this.VW - 40, 440);
      g.globalAlpha = a * 0.88;
      this._panel(g, cx - w / 2, y - h / 2, w, h, 22);
      g.globalAlpha = a;
      let title = FLOOR_LABEL(z);
      g.font = '900 26px ' + FONT;
      const fs = Math.min(26, 26 * (w - 30) / Math.max(1, g.measureText(title).width));
      this._text(g, title, cx, y - 14, fs, info.color, 'center');
      const sub = b.loop ? 'Day ' + (b.loop + 1) + ' · ' + info.time + ' — up the stairs!' : info.sub;
      this._text(g, sub, cx, y + 18, 16, '#fff', 'center', '800');
      g.globalAlpha = 1;
    }

    drawDebug(g, w, camX) {
      const L = w.layout, u = L.unit, h = w.hero;
      g.strokeStyle = 'rgba(0,255,120,.8)'; g.lineWidth = 1;
      const hk = (w.D && w.D.hitK) || 1;
      g.strokeRect(h.x - 0.25 * u * hk, h.y - 0.25 * u * hk, 0.5 * u * hk, 0.5 * u * hk);
      for (const o of w.obstacles) { const y0 = o.kind === 'vent' ? L.floorY - o.h : L.ceilY; g.strokeStyle = o.hit ? 'rgba(255,255,0,.5)' : 'rgba(255,60,60,.9)'; g.strokeRect(o.x - o.w / 2, y0, o.w, o.h); }
      g.strokeStyle = 'rgba(0,200,255,.7)';
      for (const f of w.leaves) { if (f.state !== 'fly') continue; g.beginPath(); g.arc(f.x, f.y, f.r, 0, TAU); g.stroke(); }
      g.strokeStyle = 'rgba(255,0,180,.8)';
      for (const r of w.roofs) { g.beginPath(); g.moveTo(r.x0, L.floorY); g.lineTo(r.x1, L.floorY); g.stroke(); }
      for (const r of w.rails) { g.beginPath(); g.moveTo(r.x0, L.ceilY); g.lineTo(r.x1, L.ceilY); g.stroke(); }
      g.fillStyle = '#0f8'; g.font = '11px monospace'; g.textAlign = 'left';
      g.fillText(w.phase + ' ' + h.state + ' side ' + h.side + ' v ' + (w.speed || 0).toFixed(0) + ' d ' + (w.distance || 0).toFixed(0) + ' light ' + (w.lightView || 0).toFixed(2), camX + 10, this.VH - 10);
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  Renderer.FLOOR_LABEL = FLOOR_LABEL;
  Renderer.LEAF_COL = LEAF_COL;
  OF.Renderer = Renderer;
})(window.OF = window.OF || {});
