/* MEG.Renderer — Mossy's Egg Grove on a 2D canvas (DESIGN §2–§5).
 * A fixed camera on the nest (inner 9 × 11.2 u, y up, floor at y 0). Landscape: unit = min(VH/15.2, VW/22), side panels
 * left (Next bubble + egg ladder) and right (score card + windsock). Portrait: unit = min(VW/11, room/15.2), the HUD row on top.
 * Per season the sky, the far forest and the near forest + floor are pre-rendered once into device-pixel canvases and
 * blitted pixel-exact (far/near with a small integer-pixel parallax that follows Mossy); seasons crossfade.
 * Eggs, Mossy and everything else that moves are lerped with world.alpha between fixed simulation steps. */
(function (MEG) {
  'use strict';
  const PAL = {
    spring: { skyTop: '#3f6f63', skyBottom: '#9cc8a8', ground: '#4f7a45', ink: '#1f3a2c', bar: '#f2fbef', accent: '#f6a6c8' },
    summer: { skyTop: '#2f6a5a', skyBottom: '#8fc49a', ground: '#4c7a3c', ink: '#1d3826', bar: '#f4fbe9', accent: '#9fe07a' },
    autumn: { skyTop: '#5a4a6e', skyBottom: '#d8a77f', ground: '#6e5134', ink: '#3a2518', bar: '#fbf0e2', accent: '#f0a050' },
    winter: { skyTop: '#3d4f72', skyBottom: '#a8bccf', ground: '#c6d3e0', ink: '#22304a', bar: '#eef4fa', accent: '#bfe4ff' }
  };
  const ZONE_INFO = [
    { key: 'spring', name: 'Blossom Glade', hint: 'Two eggs that match make a bigger egg!' },
    { key: 'summer', name: 'Mushroom Meadow', hint: 'The summer breeze is stronger!' },
    { key: 'autumn', name: 'Lantern Woods', hint: 'Gusty! Watch the windsock.' },
    { key: 'winter', name: 'Frost Hollow', hint: 'Big winter winds — aim with the breeze!' }
  ];
  ZONE_INFO.forEach(z => { const p = PAL[z.key]; z.top = p.skyTop; z.bottom = p.skyBottom; z.pal = p; });
  // egg kinds 1..8: main colour (juice, rings, custom-picture rings) and names
  const KCOL = ['#bfe8d0', '#7ec3ea', '#f59ab8', '#b79ce6', '#7cc96a', '#f4885c', '#5a6fd0', '#f2c14e'];
  const KNAME = ['Dewdrop', 'Sky', 'Berry', 'Moon', 'Fern', 'Sunset', 'Starry', 'Golden Dragon'];
  const FONT = '"Segoe UI Black","Segoe UI","Arial Rounded MT Bold","Trebuchet MS",system-ui,sans-serif';
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const EGG_K = 128 / 116;   // egg art: the egg fits a circle of radius 58 in a 128 box
  const MOSSY = 2.2;         // Mossy's drawn size in u

  const C = () => (MEG.World && MEG.World.CONFIG) || {};
  const kindR = k => { const K = MEG.World && MEG.World.KINDS; const e = K && (K[k - 1] || K.find(q => q.kind === k)); return e ? e.r : 0.5 + 0.23 * (k - 1); };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d', { alpha: false });
      this.world = null; this.weather = null;
      this.texts = []; this.rings = []; this.hatches = []; this.fairies = []; this.flyers = []; this.ghosts = [];
      this.time = 0; this.shake = 0; this.flash = 0; this.flashCol = '#fffaf0';
      this.vis = { cur: 0, prev: 0, t: 1 };
      this.banner = null; this.ladderPulse = {}; this.readyT = 1; this.scorePulse = 0; this.sockFlap = 0;
      this.VW = 960; this.VH = 540; this.ins = { top: 0, right: 0, bottom: 0, left: 0 };
      this._bg = new Map(); this._spr = new Map(); this._guide = null;
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
      const dpr = window.devicePixelRatio || 1, touch = !!(MEG.Game && MEG.Game.isTouch);
      let px = v.s * dpr;
      const cap = touch ? 3.2e6 : 1920 * 1080;
      if (v.VW * v.VH * px * px > cap) px = Math.sqrt(cap / (v.VW * v.VH));
      if (this.maxPx) px = Math.min(px, this.maxPx);
      this.px = Math.max(0.5, px);
      c.width = Math.round(v.VW * this.px); c.height = Math.round(v.VH * this.px);
      this._bg.clear(); this._spr.clear(); this._guide = null;
      this.portrait = v.VH > v.VW * 1.05;
      const I = v.ins, NW = (C().NEST_W || 9);
      if (this.portrait) {
        this.topHud = I.top + 96;
        const room = v.VH - this.topHud - I.bottom - 12;
        this.unit = Math.min(v.VW / 10.7, room / 17.2);
        const spare = Math.max(0, room - 17.2 * this.unit);   // 15.2 u of nest + Mossy, ~2 u for the egg ladder below
        this.groundPx = Math.round(v.VH - I.bottom - 2.0 * this.unit - spare * 0.4);
      } else {
        this.topHud = 0;
        const room = v.VH - I.top - I.bottom;   // phones: keep the floor out of the home-indicator strip
        this.unit = Math.min(room / 15.7, v.VW / 22);
        this.groundPx = Math.round(v.VH - I.bottom - 1.0 * this.unit - Math.max(0, room - 15.7 * this.unit) * 0.3);
      }
      this.ox = Math.round(v.VW / 2 - NW / 2 * this.unit);
      this.k = this.unit / 40;          // nest / vine art: 40 viewBox px per u
      this.sc = this.unit / 36;         // HUD + text scale (1 on a 960×540 screen)
      this.L = this.portrait ? Math.min(2, v.VH / 700) : Math.max(0.9, v.VH / 560);   // background layer scale
      const hud = document.getElementById('hud'), toast = document.getElementById('toast'), S = v.s;
      if (hud) { hud.style.top = (v.top + (I.top + 10) * S) + 'px'; hud.style.right = (v.left + (I.right + 10) * S) + 'px'; }
      this.hudBottom = I.top + 10 + 48 / S;   // the DOM pause/sound row: 44 css px buttons + slack, in logical px
      if (toast) toast.style.bottom = (v.top + (I.bottom + 40) * S) + 'px';
      this._syncWeather();
      MEG.Assets.setScale(this.px);
    }
    _syncWeather() { const wx = this.weather; if (wx && wx.resize) wx.resize(this.VW, this.VH); }
    _measureHud() {}
    toLogical(cx, cy) { const r = this.canvas.getBoundingClientRect(); return [(cx - r.left) / r.width * this.VW, (cy - r.top) / r.height * this.VH]; }
    /* screen x (logical px) → world x */
    worldX(lx) { return (lx - this.ox) / this.unit; }
    attach(world, weather) {
      this.world = world; this.weather = weather;
      this.texts.length = 0; this.rings.length = 0; this.hatches.length = 0; this.fairies.length = 0; this.flyers.length = 0; this.ghosts.length = 0;
      this.banner = null; this.shake = 0; this.flash = 0; this.ladderPulse = {}; this.readyT = 1; this._guide = null;
      this.hint = world && (world.level || 0) === 0 ? 'move' : null; this._windHinted = false;
      this._syncWeather();
    }
    setLevel(i, instant) {
      i = ((i % 4) + 4) % 4;
      this.prewarm((i + 1) % 4);
      if (instant) { this.vis = { cur: i, prev: i, t: 1 }; return; }
      if (i === this.vis.cur) return;
      this.vis = { cur: i, prev: this.vis.t < 0.5 ? this.vis.prev : this.vis.cur, t: 0 };
    }
    showBanner(z) { this.banner = { s: z, t: 0, loop: this.world ? this.world.loop || 0 : 0, level: this.world ? this.world.level || 0 : z }; }

    // ---------------- mapping ----------------
    sx(x) { return this.ox + x * this.unit; }
    sy(y) { return this.groundPx - y * this.unit; }

    // ---------------- sprites ----------------
    spr(key, w, h) {
      const W = Math.max(4, Math.round(w)), H = Math.max(4, Math.round(h)), ck = key + '|' + W + '|' + H;
      let c = this._spr.get(ck);
      if (c) return c;
      c = MEG.Assets.sprite(key, W, H);
      if (c) { if (this._spr.size > 400) this._spr.clear(); this._spr.set(ck, c); }
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

    // ---------------- pre-rendered season backgrounds (device px) ----------------
    _slot(b) { return MEG.Assets.SLOTS[2 + b].id; }
    _custom(b) { return MEG.Assets.hasCustom(this._slot(b)); }
    _bgKey(b) { return b + '|' + this.VW + 'x' + this.VH + '|' + this.px.toFixed(3) + '|' + (MEG.Assets._ver || 0) + '|' + (this._custom(b) ? 1 : 0); }
    prewarm(b) {
      const key = this._bgKey(b);
      if (this._bg.has(key) || (this._warmQ && this._warmQ.includes(b))) return;
      (this._warmQ = this._warmQ || []).push(b);
      const ric = window.requestIdleCallback || (f => setTimeout(f, 60));
      ric(() => { this._warmQ = this._warmQ.filter(x => x !== b); this.background(b); }, { timeout: 400 });
    }
    background(b) {
      const key = this._bgKey(b);
      let bg = this._bg.get(key);
      if (bg) return bg;
      const A = MEG.Assets, n = A.SEASONS[b], pal = PAL[n], P = this.px, W = this.VW, H = this.VH, L = this.L, gy = this.groundPx;
      const M = Math.round(40 * L);   // parallax margin on each side of the far/near layers
      const mk = (w) => { const c = document.createElement('canvas'); c.width = Math.round(w * P); c.height = Math.round(H * P); const g = c.getContext('2d'); g.scale(P, P); g.imageSmoothingQuality = 'high'; return [c, g]; };
      const [sky, gs] = mk(W), [far, gf] = mk(W + 2 * M), [near, gn] = mk(W + 2 * M);
      const gr = gs.createLinearGradient(0, 0, 0, H); gr.addColorStop(0, pal.skyTop); gr.addColorStop(1, pal.skyBottom);
      gs.fillStyle = gr; gs.fillRect(0, 0, W, H);
      const custom = this._custom(b) ? A.custom[this._slot(b)] : null;
      const cover = (g, img, iw, ih) => { const s = Math.max(W / iw, H / ih); g.drawImage(img, (W - iw * s) / 2, (H - ih * s) / 2, iw * s, ih * s); };
      const horizon = gy + 0.3 * this.unit;   // where the forest floor starts (the nest sits a little into the moss)
      if (custom) {
        cover(gs, custom, custom.width, custom.height);
        gs.fillStyle = 'rgba(20,40,30,0.18)'; gs.fillRect(0, 0, W, H);   // a soft veil keeps a busy photo behind the eggs
      } else {
        if (A.img[n + '_sky']) cover(gs, A.img[n + '_sky'], 960, 540);
        const tile = (g, img, iw, ih, bottom, s) => {
          if (!img) return;
          const w = iw * s, h = ih * s;
          for (let x = 0; x < W + 2 * M; x += w) g.drawImage(img, Math.floor(x), bottom - h, Math.ceil(w) + 1, h);
        };
        tile(gf, A.img[n + '_far'], 960, 360, horizon + 8 * L, L);
        tile(gn, A.img[n + '_near'], 960, 240, horizon + 6 * L, L);
      }
      // forest floor: colour fill, then the ground tile from its top line (art y 10)
      gn.fillStyle = pal.ground; gn.fillRect(0, horizon + 10 * L, W + 2 * M, H - horizon);
      const gImg = A.img[n + '_ground'];
      if (gImg) { const w = 960 * L, h = 120 * L; for (let x = 0; x < W + 2 * M; x += w) gn.drawImage(gImg, Math.floor(x), horizon - 10 * L, Math.ceil(w) + 1, h); if (!this.portrait) for (let y = horizon - 10 * L + h - 2; y < H; y += h - 12 * L) for (let x = 0; x < W + 2 * M; x += w) gn.drawImage(gImg, 0, 30, 960, 90, Math.floor(x), y, Math.ceil(w) + 1, h * 0.75); }
      bg = { sky, far, near, M, b };
      this._bg.set(key, bg);
      if (this._bg.size > 6) { const first = this._bg.keys().next().value; this._bg.delete(first); }
      return bg;
    }
    _blit(g, c, dx, alpha) {
      g.save(); g.globalAlpha = alpha; g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(c, Math.round(dx * this.px), 0); g.restore();
    }
    drawBack(g, b, alpha, a) {
      const bg = this.background(b), w = this.world, NW = C().NEST_W || 9;
      const mx = w && w.mossy ? (lerp(w.mossy.px != null ? w.mossy.px : w.mossy.x, w.mossy.x, a) - NW / 2) / (NW / 2) : 0;   // −1..1
      const drift = Math.sin(this.time * 0.05) * 0.5;
      this._blit(g, bg.sky, 0, alpha);
      this._skyAlpha = alpha;
      this.drawParticles(g, 'sky', alpha);
      this._blit(g, bg.far, -bg.M + clamp(-mx * 10 + drift * 12, -bg.M, bg.M), alpha);
      this.drawParticles(g, 'back', alpha);
      this._blit(g, bg.near, -bg.M + clamp(-mx * 22 + drift * 6, -bg.M, bg.M), alpha);
    }

    // ---------------- the nest + eggs ----------------
    drawNest(g, front) {
      const k = this.k, x0 = this.ox - 28 * k, y0 = this.groundPx - 568 * k;
      if (!this.drawSpr(g, front ? 'nest_front' : 'nest', x0, y0, 416 * k, 620 * k, 0, 0) && !front) {
        // fallback: plain twig walls
        const NW = C().NEST_W || 9, WT = C().WALL_TOP || 11.2, u = this.unit;
        g.save(); g.fillStyle = 'rgba(40,30,20,0.45)'; g.fillRect(this.sx(0), this.sy(WT), NW * u, WT * u);
        g.fillStyle = '#7a5434'; g.fillRect(this.sx(-0.7), this.sy(WT), 0.7 * u, WT * u + 0.3 * u); g.fillRect(this.sx(NW), this.sy(WT), 0.7 * u, WT * u + 0.3 * u);
        g.fillRect(this.sx(-0.7), this.sy(0), (NW + 1.4) * u, 0.8 * u); g.restore();
      }
    }
    drawVine(g) {
      const w = this.world, D = C().DANGER_Y || 9.8, NW = C().NEST_W || 9, u = this.unit;
      const y = this.sy(D), x = this.sx(NW / 2), vw = (NW + 0.6) * u, vh = vw * 40 / 400;
      const d = w.danger || 0;
      if (d > 0.02) {   // a soft coral glow that pulses faster as the grace time runs out
        const p = 0.5 + 0.5 * Math.sin(this.time * (6 + 10 * d));
        g.save(); g.globalAlpha = Math.min(1, 0.25 + 0.75 * d) * (0.55 + 0.45 * p);
        g.strokeStyle = '#ff8a7a'; g.lineCap = 'round'; g.lineWidth = (5 + 6 * d) * this.sc;
        g.beginPath(); g.moveTo(this.sx(0), y); g.lineTo(this.sx(NW), y); g.stroke(); g.restore();
      }
      if (!this.drawSpr(g, 'vine', x, y, vw, vh, 0.5, 0.5, Math.sin(this.time * 1.3) * 0.004)) {
        g.save(); g.strokeStyle = '#7fbf6a'; g.lineWidth = 3 * this.sc; g.setLineDash([10, 8]);
        g.beginPath(); g.moveTo(this.sx(0), y); g.lineTo(this.sx(NW), y); g.stroke(); g.restore();
      }
    }
    eggKey(kind) { return 'egg_' + clamp(kind | 0, 1, 8); }
    /* one egg at screen (x, y), radius r in u, rotation rot (screen), extra scale s */
    drawEgg(g, kind, x, y, r, rot, s, alpha) {
      const side = 2 * r * EGG_K * this.unit;
      if (MEG.Assets.hasCustom('egg')) {
        const R = r * this.unit * (s || 1);
        g.save(); if (alpha != null) g.globalAlpha *= alpha;
        g.translate(x, y); if (rot) g.rotate(rot);
        g.fillStyle = KCOL[kind - 1]; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
        const [cw, ch] = MEG.Assets.fit('egg', R * 1.56, R * 1.56);
        const c = this.spr('custom:egg', cw, ch); if (c) g.drawImage(c, -cw / 2, -ch / 2, cw, ch);
        g.lineWidth = Math.max(2, R * 0.14); g.strokeStyle = KCOL[kind - 1]; g.beginPath(); g.arc(0, 0, R * 0.93, 0, TAU); g.stroke();
        g.lineWidth = 1.5; g.strokeStyle = 'rgba(30,30,40,0.5)'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke();
        // kind pips so the size steps read without the art
        g.fillStyle = '#fff'; g.strokeStyle = 'rgba(30,30,40,0.55)'; g.lineWidth = 1;
        const sp = Math.min(0.32, 2.4 / Math.max(1, kind - 1));
        for (let i = 0; i < Math.min(kind, 8); i++) { const a = -Math.PI / 2 + (i - (kind - 1) / 2) * sp; g.beginPath(); g.arc(Math.cos(a) * R * 0.93, Math.sin(a) * R * 0.93, Math.max(2, R * 0.075), 0, TAU); g.fill(); g.stroke(); }
        g.restore();
        return;
      }
      if (!this.drawSpr(g, this.eggKey(kind), x, y, side, side, 0.5, 0.5, rot, s, s, alpha)) {
        g.save(); g.fillStyle = KCOL[kind - 1]; g.beginPath(); g.ellipse(x, y, r * this.unit * 0.9 * (s || 1), r * this.unit * (s || 1), rot || 0, 0, TAU); g.fill(); g.restore();
      }
    }
    drawEggs(g, a) {
      const w = this.world, pos = this._eggPos = new Map();
      for (const e of w.eggs) {
        const x = this.sx(lerp(e.px != null ? e.px : e.x, e.x, a)), y = this.sy(lerp(e.py != null ? e.py : e.y, e.y, a));
        pos.set(e.id, { x, y, kind: e.kind, r: e.r || kindR(e.kind) });
        let rot = -lerp(e.prot != null ? e.prot : (e.rot || 0), e.rot || 0, a), s = 1;
        const b = e.born;
        if (b != null && b < 0.3) { const t = b / 0.3; s = 0.72 + 0.28 * t + Math.sin(t * Math.PI) * 0.12; }   // pop-in with a little overshoot
        let ox = 0;
        if (e.over > 0.05) { const k = Math.min(1, e.over / (C().OVER_T || 2.5)); ox = Math.sin(this.time * 30 + e.id) * 1.6 * k * this.sc; rot += Math.sin(this.time * 18 + e.id) * 0.05 * k; }
        this.drawEgg(g, e.kind, x + ox, y, e.r || kindR(e.kind), rot, s);
      }
    }

    // ---------------- Mossy + held egg + guide ----------------
    mossyX(a) { const m = this.world.mossy; return lerp(m.px != null ? m.px : m.x, m.x, a); }
    drawGuide(g, a) {
      const w = this.world; if (!w.held || !w.canDrop || w.phase === 'over' || typeof w.predictDrop !== 'function') return;
      const mx = w.mossy.x, f = w.wind ? w.wind.force || 0 : 0, n = w.eggs.length;
      const G = this._guide;
      this._gf = (this._gf || 0) + 1;
      if (!G || Math.abs(G.x - mx) > 0.02 || Math.abs(G.f - f) > 0.05 || G.n !== n || G.held !== w.held || this._gf > 6) {
        let p = null; try { p = w.predictDrop(mx); } catch (e) { p = null; }
        this._guide = { x: mx, f, n, held: w.held, p }; this._gf = 0;
      }
      const p = this._guide.p; if (!p || !p.path || p.path.length < 2) return;
      const dx = this.mossyX(a) - mx;   // the guide hangs from where Mossy is drawn
      const pts = p.path, r = kindR(w.held), wind = Math.abs(f) > 0.2;
      g.save();
      const step = Math.max(1, Math.round(pts.length / 22));
      for (let i = step; i < pts.length; i += step) {
        const q = pts[i], fade = 0.35 + 0.55 * (1 - i / pts.length);
        g.globalAlpha = fade; g.fillStyle = wind ? '#dff6ff' : '#ffffff';
        g.beginPath(); g.arc(this.sx(q.x + dx * (1 - i / pts.length)), this.sy(q.y), 3.2 * this.sc, 0, TAU); g.fill();
      }
      if (p.landX != null) {   // ghost ring where the egg will rest
        const lx = this.sx(p.landX), ly = this.sy(p.landY);
        g.globalAlpha = 0.5 + 0.2 * Math.sin(this.time * 5); g.strokeStyle = KCOL[w.held - 1]; g.lineWidth = 3 * this.sc; g.setLineDash([6 * this.sc, 5 * this.sc]);
        g.beginPath(); g.arc(lx, ly, r * this.unit, 0, TAU); g.stroke();
      }
      g.restore();
    }
    drawMossy(g, a) {
      const w = this.world, m = w.mossy, CF = C(), u = this.unit;
      const force = w.wind ? w.wind.force || 0 : 0;
      const x = this.sx(this.mossyX(a)) + force * 0.05 * u, bob = Math.sin(this.time * 3.1) * 0.12 * u;
      const y = this.sy(CF.MOSSY_Y || 12.6) + bob;
      const vx = m.vx || 0, rot = clamp(-vx * 0.02 + force * 0.02, -0.25, 0.25) + Math.sin(this.time * 1.7) * 0.03;
      // held egg first (Mossy's claws go over it)
      if (w.held && w.phase !== 'over') {
        const r = kindR(w.held), hy = this.sy(CF.HOLD_Y || 11.3) + bob * 0.8;
        const t = this.readyT, s = t < 0.25 ? 0.6 + 0.4 * (t / 0.25) + Math.sin(t / 0.25 * Math.PI) * 0.1 : 1;
        const bk = this.blockT > 0 ? Math.sin(this.time * 55) * 0.12 * u * (this.blockT / 0.35) : 0;   // "boop": no room to drop here
        this.drawEgg(g, w.held, x + Math.sin(rot) * 0.9 * u + bk, hy, r, rot * 0.6 + Math.sin(this.time * 3.1) * 0.05, s);
      }
      const size = MOSSY * u;
      let frame = (Math.floor(this.time * 7) % 2) ? 'mossy_1' : 'mossy_0';
      if (m.mood === 'drop') frame = 'mossy_drop'; else if (m.mood === 'happy') frame = 'mossy_happy'; else if (m.mood === 'worry' || (w.danger || 0) > 0.35) frame = 'mossy_worry';
      if (MEG.Assets.hasCustom('hero')) {
        const [cw, ch] = MEG.Assets.fit('hero', size * 0.85, size * 0.85);
        const flap = Math.sin(this.time * 14), sq = 1 + flap * 0.05;   // procedural "wing beat" squash for a custom picture
        this.drawSpr(g, 'custom:hero', x, y - 0.05 * u, cw, ch, 0.5, 0.5, rot + flap * 0.04, 2 - sq, sq);
        // two little leaf wings so a photo still flies
        g.save(); g.fillStyle = 'rgba(140,210,120,0.9)'; g.strokeStyle = '#3f7a3a'; g.lineWidth = 2;
        for (const sd of [-1, 1]) { g.save(); g.translate(x + sd * cw * 0.45, y - ch * 0.15); g.rotate(sd * (0.5 + flap * 0.35)); g.beginPath(); g.ellipse(sd * 0.35 * u, 0, 0.42 * u, 0.2 * u, 0, 0, TAU); g.fill(); g.stroke(); g.restore(); }
        g.restore();
      } else if (!this.drawSpr(g, frame, x, y, size, size, 0.5, 70 / 160, rot)) {
        g.save(); g.fillStyle = '#5fa85a'; g.beginPath(); g.arc(x, y, 0.7 * u, 0, TAU); g.fill(); g.restore();
      }
    }

    // ---------------- panels: next, ladder, windsock, score ----------------
    panelGeom() {
      const u = this.unit, NW = C().NEST_W || 9, I = this.ins;
      if (this.portrait) {
        const y = Math.max(I.top + 52, this.sy(14.2) - 58);
        const z = clamp(0.95 / (this.cssScale || 1), 1, 1.4);   // same as the score card's scale
        return { next: [I.left + 14 + 160 * z + 58, y, 1.0], sock: [this.VW - I.right - 112, y + 4, 1.45], ladder: this._ladderPortrait() };
      }
      const lw = this.ox - 0.7 * u, rx = this.sx(NW + 0.7), rw = this.VW - rx;
      const lcx = lw / 2, rcx = rx + rw / 2;
      const sw = Math.min(1.9, (rw - 20) / (1.9 * u * 1.3));
      return { next: [lcx, this.sy(10.6), 1.15], sock: [rcx, this.sy(5.4), sw], ladder: { x: lcx, y0: this.sy(8.3), y1: this.sy(0.4), vertical: true }, score: [rcx, this.sy(12.6)] };
    }
    _ladderPortrait() {
      const top = this.groundPx + 1.4 * this.unit, room = this.VH - this.ins.bottom - top;
      return room > 28 ? { y: top + Math.min(room, 60) / 2, x0: this.VW * 0.1, x1: this.VW * 0.9, vertical: false, h: Math.min(room, 56) } : null;
    }
    drawNext(g, P) {
      const w = this.world, [x, y, s] = P, R = 1.3 * this.unit * s * (this.portrait ? 0.8 : 1);
      if (!this.drawSpr(g, 'bubble', x, y, R * 2, R * 2, 0.5, 0.5)) { g.save(); g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 3; g.beginPath(); g.arc(x, y, R * 0.9, 0, TAU); g.stroke(); g.restore(); }
      if (w.next) { const r = kindR(w.next), sc = Math.min(1, (R * 0.62) / (r * this.unit)); this.drawEgg(g, w.next, x, y + Math.sin(this.time * 2) * 2, r * sc, Math.sin(this.time * 1.4) * 0.08, 1); }
      this._label(g, 'Next', x, y - R - 8 * this.sc, 15);
    }
    drawLadder(g, L) {
      if (!L) return;
      const w = this.world, maxK = w.maxKind || 0, u = this.unit;
      g.save(); g.fillStyle = 'rgba(15,35,28,0.38)'; g.beginPath();
      if (L.vertical) g.roundRect ? g.roundRect(L.x - 0.75 * u, L.y0 - 0.6 * u, 1.5 * u, L.y1 - L.y0 + 1.2 * u, 0.75 * u) : g.rect(L.x - 0.75 * u, L.y0 - 0.6 * u, 1.5 * u, L.y1 - L.y0 + 1.2 * u);
      else this._pill(g, L.x0 - 18, L.y - L.h / 2 - 6, L.x1 - L.x0 + 36, L.h + 12);
      g.fill(); g.restore();
      for (let k = 1; k <= 8; k++) {
        let x, y, r;
        if (L.vertical) { const t = (k - 1) / 7; x = L.x; y = lerp(L.y1, L.y0, t); r = Math.min(Math.abs(L.y1 - L.y0) / 7 * 0.47, (0.3 + 0.045 * k) * this.unit); }
        else { const t = (k - 1) / 7; x = lerp(L.x0, L.x1, t); y = L.y; r = Math.min(L.h * 0.45, (L.x1 - L.x0) / 7 * 0.42) * (0.75 + 0.035 * k); }
        const got = k <= Math.max(maxK, 1), pulse = this.ladderPulse[k] || 0;
        const s = 1 + 0.4 * pulse;
        if (got) this.drawEgg(g, k, x, y, r / this.unit / EGG_K * 1.05, 0, s);
        else { g.save(); g.fillStyle = 'rgba(255,255,255,0.12)'; g.beginPath(); g.ellipse(x, y, r * 0.8, r * 0.95, 0, 0, TAU); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 2; g.stroke(); g.restore(); }
        if (L.vertical && k < 8) { g.save(); g.globalAlpha = 0.5; g.fillStyle = '#fff'; const yy = lerp(y, lerp(L.y1, L.y0, k / 7), 0.5); g.beginPath(); g.moveTo(x - 4, yy + 2); g.lineTo(x + 4, yy + 2); g.lineTo(x, yy - 4); g.fill(); g.restore(); }
      }
    }
    drawSock(g, P) {
      const w = this.world, wd = w.wind || { dir: 0, phase: 'calm', force: 0 }, [x, y, s] = P;
      const W = 1.9 * this.unit * s * (this.portrait ? 0.75 : 1), H = W * 96 / 128;
      const f = wd.force || 0, mag = Math.min(1, Math.abs(f) / Math.max(1, wd.strength || 4));
      const warn = wd.phase === 'warn', dir = warn ? (wd.nextDir || wd.dir || 1) : (f !== 0 ? Math.sign(f) : (wd.dir || 1));
      const calm = mag < 0.12 && !warn;
      // a badge behind it, so it never "stands on air" and reads as a HUD instrument
      g.save(); g.fillStyle = 'rgba(15,35,28,0.42)'; g.beginPath();
      if (g.roundRect) g.roundRect(x - W * 0.62, y - H * 0.75, W * 1.24, H * 1.5, 18 * this.sc); else g.rect(x - W * 0.62, y - H * 0.75, W * 1.24, H * 1.5);
      g.fill(); g.restore();
      const sd = calm || dir > 0 ? 1 : -1, px0 = x - W * 0.34 * sd, py0 = y + H * 0.5;   // pole on the upwind side: the sock stays on the badge
      if (calm) this.drawSpr(g, 'windsock_calm', px0, py0, W, H, 14 / 128, 1, Math.sin(this.time * 1.5) * 0.02);
      else {
        const flutter = warn ? 0.7 + 0.15 * Math.sin(this.time * 22) : 0.6 + 0.4 * mag + 0.05 * Math.sin(this.time * 18);
        this.drawSpr(g, 'windsock', px0, py0, W, H, 14 / 128, 1, Math.sin(this.time * 9) * 0.02 * dir, sd * flutter, 1);
      }
      // arrow + word under the sock: the forecast during the warning, the gust while it blows
      if (warn || mag > 0.12) {
        const ax = x, ay = y + H * 0.5 + 22 * this.sc, a = warn ? 0.75 + 0.25 * Math.sin(this.time * 12) : 1;
        g.save(); g.globalAlpha = a; g.translate(ax, ay); g.scale(dir, 1);
        g.fillStyle = warn ? '#fff3c4' : '#ffffff'; g.strokeStyle = 'rgba(20,40,30,0.75)'; g.lineWidth = 3;
        const L = 38 * this.sc * (this.portrait ? 0.8 : 1), T = 16 * this.sc, B = 6 * this.sc;
        g.beginPath(); g.moveTo(-L, -B); g.lineTo(L * 0.3, -B); g.lineTo(L * 0.3, -T); g.lineTo(L, 0); g.lineTo(L * 0.3, T); g.lineTo(L * 0.3, B); g.lineTo(-L, B); g.closePath();
        g.stroke(); g.fill(); g.restore();
        if (!this.portrait) this._label(g, warn ? 'Wind coming!' : 'Whoosh!', x, ay + 28 * this.sc, 16);
      }
    }
    _label(g, s, x, y, size, col) {
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      g.font = `900 ${Math.round(size * Math.max(0.85, this.sc))}px ${FONT}`;
      g.lineWidth = 5; g.strokeStyle = 'rgba(15,35,25,0.7)'; g.strokeText(s, x, y); g.fillStyle = col || '#fff'; g.fillText(s, x, y); g.restore();
    }
    _pill(g, x, y, w, h) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, h / 2); else g.rect(x, y, w, h); }
    drawScore(g) {
      const w = this.world, I = this.ins, pal = PAL[MEG.Assets.SEASONS[w.zone || 0]];
      const z = clamp(0.95 / (this.cssScale || 1), 1, 1.4);   // phones show the canvas at ~0.7×: grow the card back to a readable size
      let x, y, W;
      if (this.portrait) { x = I.left + 14; y = I.top + 12; W = 160 * z; }
      else { const rx = this.sx((C().NEST_W || 9) + 0.7) + 14, rw = this.VW - rx - 14 - I.right; W = Math.min(220 * z, rw); x = rx + (rw - W) / 2; y = Math.max((this.hudBottom || I.top + 64) + 8, this.sy(12.9)); }
      this._scoreBox = [x, y, W, z];
      g.save(); g.textBaseline = 'middle';
      g.fillStyle = 'rgba(15,35,28,0.5)'; this._pill(g, x, y, W, 46 * z); g.fill();
      const ps = 1 + 0.18 * this.scorePulse;
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = `900 ${Math.round(30 * z * ps)}px ${FONT}`;
      g.fillText(String(w.score), x + 18 * z, y + 25 * z);
      g.font = `800 ${Math.round(14 * z)}px ${FONT}`; g.textAlign = 'right'; g.fillStyle = 'rgba(255,255,255,0.85)';
      g.fillText('best ' + (MEG.Game ? MEG.Game.best(MEG.Game.runDifficulty) : 0), x + W - 16 * z, y + 25 * z);
      const sy2 = y + 54 * z, name = ZONE_INFO[w.zone || 0].name + (w.loop ? ' ★' + (w.loop + 1) : '');
      g.fillStyle = 'rgba(15,35,28,0.45)'; this._pill(g, x, sy2, W, 40 * z); g.fill();
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = `800 ${Math.round(15 * z)}px ${FONT}`; g.fillText(name, x + 14 * z, sy2 + 13 * z);
      const goal = w.levelGoal || 1, start = w.levelStart || 0, k = clamp((w.score - start) / Math.max(1, goal - start), 0, 1);
      g.fillStyle = 'rgba(255,255,255,0.25)'; this._pill(g, x + 14 * z, sy2 + 24 * z, W - 28 * z, 9 * z); g.fill();
      if (k > 0.01) { g.fillStyle = pal.accent; this._pill(g, x + 14 * z, sy2 + 24 * z, Math.max(9 * z, (W - 28 * z) * k), 9 * z); g.fill(); }
      // fairy rescues left
      const mr = w.maxRescues || 0;
      if (mr) {
        const fs = 36 * z, fy = sy2 + 48 * z + fs / 2;
        g.fillStyle = 'rgba(15,35,28,0.4)'; this._pill(g, x, fy - fs / 2 - 3, 12 * z + mr * 38 * z, fs + 6); g.fill();
        for (let i = 0; i < mr; i++) {
          const on = i < (w.rescues || 0);
          this.drawSpr(g, 'fairy', x + 6 * z + fs / 2 + i * 38 * z, fy, fs, fs, 0.5, 0.5, Math.sin(this.time * 2 + i) * 0.1, 1, 1, on ? 1 : 0.25);
        }
      }
      g.restore();
    }

    // ---------------- events → juice ----------------
    onEvents(evts) {
      const w = this.world, wx = this.weather, u = this.unit, title = MEG.Game && MEG.Game.mode === 'title';
      for (const e of evts) {
        const X = e.x != null ? this.sx(e.x) : 0, Y = e.y != null ? this.sy(e.y) : 0;
        switch (e.type) {
          case 'drop': if (this.hint === 'move') this.hint = null; this._guide = null; break;
          case 'ready': this.readyT = 0; this._guide = null; break;
          case 'land': if (wx && (e.speed || 0) > 3) wx.burst('land', X, Y + kindR(e.kind) * u, 3); if ((e.speed || 0) > 6) this.shake = Math.max(this.shake, Math.min(4, e.speed * 0.25)); break;
          case 'merge': {
            const col = KCOL[(e.kind || 2) - 1];
            this._lastMerge = [X, Y - kindR(e.kind) * u];
            if (wx) wx.burst('merge', X, Y, 8 + (e.kind || 1), { color: col });
            this.rings.push({ x: X, y: Y, t: 0, r: kindR(e.kind) * u, col });
            if (!title && !(this.banner && this.banner.t < 2.3)) { this.text('+' + e.points, X, Y - kindR(e.kind) * u - 10, '#ffffff', 0.9 + 0.05 * e.kind); this.scorePulse = 1; }
            if (e.kind >= 6) this.shake = Math.max(this.shake, 2 + e.kind * 0.4);
            this.ladderPulse[e.kind] = 1;
            break;
          }
          case 'combo': this.texts = this.texts.filter(t => !t.combo); if (!title && e.n >= 2 && !(this.banner && this.banner.t < 2.3)) { const M = this._lastMerge || [this.sx((C().NEST_W || 9) / 2), this.sy(8.6)]; this.text('Combo ×' + e.n + '!', M[0], M[1] - 0.8 * u, '#ffd9a0', 1.45); } break;
          case 'newKind': if (!title && e.kind >= 3) this.text('New: ' + KNAME[e.kind - 1] + ' egg!', this.sx((C().NEST_W || 9) / 2), this.sy(7.2), KCOL[e.kind - 1], 1.1, 1.8); this.ladderPulse[e.kind] = 1.4; break;
          case 'hatch': {
            this.hatches.push({ x: X, y: Y, t: -0.45 });   // 0.45 s cracking beat, then the pop (update())
            if (!title) this.text('Hatched! +' + e.points, X, Math.min(this.sy(0.8), Y + 1.7 * u), '#ffe08a', 1.5, 2.4);
            this.scorePulse = 1;
            break;
          }
          case 'rescue': {
            this.fairies.push({ x: X || this.sx(4.5), y: Y || this.sy(9.5), t: 0 });
            if (wx) wx.burst('rescue', X || this.sx(4.5), Y || this.sy(9.5), 12);
            // the rescued eggs float up and fade where they were, so the child sees what the fairy took
            for (const id of e.ids || []) { const q = this._eggPos && this._eggPos.get(id); if (q) { this.ghosts.push({ x: q.x, y: q.y, kind: q.kind, r: q.r, t: 0 }); if (wx) wx.burst('merge', q.x, q.y, 8, { color: '#e8d4ff' }); } }
            if (!title) this.text('Fairy rescue!', this.sx((C().NEST_W || 9) / 2), this.sy(6.2), '#e8d4ff', 1.3, 1.8, true);
            break;
          }
          case 'windWarn': this.sockFlap = 1; if (!this._windHinted && !title && (w.level || 0) === 0) { this._windHinted = true; this.text(e.dir < 0 ? '← Wind is coming!' : 'Wind is coming! →', this.sx((C().NEST_W || 9) / 2), this.sy(13.9), '#fff3c4', 1, 2.2); } break;
          case 'warnOn': if (!title) this.text('Uh-oh, too high!', this.sx((C().NEST_W || 9) / 2), this.sy((C().DANGER_Y || 9.8) - 1.3), '#ffd6cf', 1, 1.6, true); break;
          case 'blocked': this.blockT = 0.35; break;
          case 'levelUp': this.showBanner(e.zone); if (wx) wx.burst('level', this.VW / 2, 0, 30); break;
        }
      }
    }
    text(s, x, y, col, size, life, pill) {
      x = clamp(x, 110, this.VW - 110); y = clamp(y, this.topHud + 40, this.VH - 40);
      if (/^Combo/.test(s)) { this.texts.push({ s, x, y, col, size: size || 1, t: 0, life: life || 1.1, combo: true }); return; }
      for (const t of this.texts) if (Math.abs(t.y - y) < 26 * this.sc && Math.abs(t.x - x) < 160 && t.t < 0.6) y -= 30 * this.sc;
      this.texts.push({ s, x, y, col, size: size || 1, t: 0, life: life || 1.3, pill: !!pill });
      if (this.texts.length > 10) this.texts.shift();
    }

    update(dt) {
      this.time += dt;
      const v = this.vis; if (v.t < 1) v.t = Math.min(1, v.t + dt / 1.2);
      this.shake = Math.max(0, this.shake - dt * 18); this.flash = Math.max(0, this.flash - dt * 1.6);
      this.scorePulse = Math.max(0, this.scorePulse - dt * 4); this.readyT += dt; this.sockFlap = Math.max(0, this.sockFlap - dt);
      for (const k in this.ladderPulse) { this.ladderPulse[k] = Math.max(0, this.ladderPulse[k] - dt * 2); }
      for (const t of this.texts) t.t += dt;
      this.texts = this.texts.filter(t => t.t < t.life);
      for (const r of this.rings) r.t += dt;
      this.rings = this.rings.filter(r => r.t < 0.6);
      for (const h of this.hatches) {
        const was = h.t; h.t += dt;
        if (was < 0 && h.t >= 0) {   // CRACK: the pop
          if (this.weather) this.weather.burst('hatch', h.x, h.y, 26);
          this.flash = 0.45; this.flashCol = '#fff6d8'; this.shake = Math.max(this.shake, 7);
        }
      }
      for (const q of this.ghosts) q.t += dt;
      this.ghosts = this.ghosts.filter(q => q.t < 0.5);
      this.blockT = Math.max(0, (this.blockT || 0) - dt);
      this.hatches = this.hatches.filter(h => h.t < 3);
      for (const f of this.fairies) f.t += dt;
      this.fairies = this.fairies.filter(f => f.t < 2.0);
      if (this.banner) { this.banner.t += dt; if (this.banner.t > 2.6) this.banner = null; }
      if (this.weather && this.weather.setWind && this.world) this.weather.setWind(this.world.wind ? this.world.wind.force || 0 : 0);
    }

    draw(mode) {
      const g = this.ctx, w = this.world;
      g.setTransform(this.px, 0, 0, this.px, 0, 0);
      if (!w) { g.fillStyle = '#2f5a48'; g.fillRect(0, 0, this.VW, this.VH); return; }
      const a = w.alpha || 0, v = this.vis;
      g.save();
      if (this.shake > 0.05) g.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      this.drawBack(g, v.cur, 1, a);
      if (v.t < 1) this.drawBack(g, v.prev, 1 - v.t, a);
      this.drawNest(g, false);
      this.drawVine(g);
      if (mode !== 'title') this.drawGuide(g, a);
      this.drawEggs(g, a);
      this.drawGhosts(g);
      this.drawNest(g, true);
      this.drawHatches(g, true);
      const P = this.panelGeom();
      if (mode !== 'title') { this.drawLadder(g, P.ladder); this.drawNext(g, P.next); }
      if (mode !== 'title') this.drawSock(g, P.sock);
      this.drawMossy(g, a);
      this.drawParticles(g, 'front', 1);
      this.drawJuice(g);
      if (this.debug) this.drawDebug(g, a);
      g.restore();
      if (this.flash > 0) { g.save(); g.globalAlpha = this.flash; g.fillStyle = this.flashCol; g.fillRect(0, 0, this.VW, this.VH); g.restore(); }
      if (mode !== 'title') { this.drawScore(g); this.drawBanner(g); this.drawHints(g); }
      this.drawHatches(g, false);   // the baby dragon and the rescue fairy fly over the HUD
    }

    drawParticles(g, layer, alpha) {
      const wx = this.weather; if (!wx) return;
      for (const p of wx.particles) {
        if (p.layer !== layer || p.alpha <= 0.01) continue;
        this.drawSpr(g, p.sprite, p.x, p.y, p.size, p.size, 0.5, 0.5, p.rot, p.flipX ? -1 : 1, 1, p.alpha * (alpha == null ? 1 : alpha));
      }
    }
    drawHatches(g, shells) {
      const u = this.unit;
      for (const h of this.hatches) {
        const t = h.t;
        if (t < 0) {   // the cracking beat: the golden egg trembles and swells, a crack runs over it
          if (shells) {
            const R = (C().KINDS_R8 || kindR(8)), side = 2 * R * EGG_K * u, sw = 1 + 0.06 * (1 + t / 0.45);
            this.drawEgg(g, 8, h.x + Math.sin(this.time * 60) * 2 * this.sc, h.y, R, Math.sin(this.time * 40) * 0.05, sw);
            this.drawSpr(g, 'egg_crack', h.x, h.y, side * sw, side * sw, 0.5, 0.5);
          }
          continue;
        }
        if (shells) {   // golden shell halves tumble away on gravity arcs
          if (t > 1.6) continue;
          for (const sd of [-1, 1]) {
            const x = h.x + sd * (2.2 * u * t), y = h.y - (5 * u * t - 9 * u * t * t), rot = sd * t * 6;
            this.drawSpr(g, sd < 0 ? 'shell_l' : 'shell_r', x, y, 1.1 * u, 1.1 * u, 0.5, 0.5, rot, 1, 1, Math.max(0, 1 - t / 1.6));
          }
        } else {        // the baby dragon pops out, waves, and flies off to the top corner
          const k = clamp(t / 3, 0, 1), e = k * k, s = (t < 0.3 ? t / 0.3 : 1) * 2.6 * u;
          const x = lerp(h.x, this.VW + 2 * u, e) + Math.sin(t * 5) * 0.3 * u, y = lerp(h.y - 0.6 * u, -2 * u, e) + Math.sin(t * 8) * 0.15 * u;
          this.drawSpr(g, 'baby', x, y, s, s, 0.5, 0.5, Math.sin(t * 6) * 0.15);
        }
      }
      if (!shells) for (const f of this.fairies) {   // rescue fairy swoops in, circles the vine, and zips off
        const t = f.t, k = t / 2.0, T1 = 0.25, T2 = 1.4;   // fly in fast from 3 u away, circle the vine, zip off
        const x = t < T1 ? lerp(f.x - 3 * u, f.x, t / T1) : t < T2 ? f.x + Math.cos((t - T1) * 6) * 1.2 * u : lerp(f.x + 1.2 * u, this.VW + 2 * u, (t - T2) / 0.6);
        const y = (t < T1 ? lerp(f.y - 1.5 * u, f.y, t / T1) : f.y + Math.sin((t - T1) * 6) * 0.5 * u) - (t > T2 ? (t - T2) * 3 * u : 0);
        this.drawSpr(g, 'fairy', x, y, 2.4 * u, 2.4 * u, 0.5, 0.5, Math.sin(t * 10) * 0.15, 1, 1, k > 0.9 ? (1 - k) * 10 : 1);
        if (this.weather && Math.random() < 0.2) this.weather.burst('rescue', x, y, 1);
      }
    }
    drawGhosts(g) {
      for (const q of this.ghosts) { const k = q.t / 0.5; this.drawEgg(g, q.kind, q.x, q.y - k * this.unit, q.r, 0, 1 + 0.3 * k, 1 - k); }
    }
    drawJuice(g) {
      for (const r of this.rings) {
        const k = r.t / 0.6;
        g.save(); g.globalAlpha = 1 - k; g.strokeStyle = r.col; g.lineWidth = 5 * (1 - k) + 1;
        g.beginPath(); g.arc(r.x, r.y, r.r * (1 + 0.8 * k), 0, TAU); g.stroke(); g.restore();
      }
      g.save(); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      for (const t of this.texts) {
        const k = t.t / t.life, sc = t.t < 0.12 ? 0.6 + t.t / 0.12 * 0.4 : 1;
        g.globalAlpha = k > 0.7 ? (1 - k) / 0.3 : 1;
        g.font = `900 ${Math.round(24 * t.size * sc * Math.max(0.85, this.sc))}px ${FONT}`;
        const y = t.y - k * 30;
        if (t.pill) { const tw = g.measureText(t.s).width; g.fillStyle = 'rgba(40,20,25,0.72)'; this._pill(g, t.x - tw / 2 - 14, y - 20 * this.sc, tw + 28, 40 * this.sc); g.fill(); }
        g.lineWidth = 6; g.strokeStyle = 'rgba(20,35,30,0.78)'; g.strokeText(t.s, t.x, y);
        g.fillStyle = t.col; g.fillText(t.s, t.x, y);
      }
      g.restore();
    }
    drawBanner(g) {
      const b = this.banner; if (!b) return;
      const t = b.t, a = t < 0.3 ? t / 0.3 : t > 2.1 ? Math.max(0, (2.6 - t) / 0.5) : 1;
      const y = this.sy(7.6) - (1 - Math.min(1, t / 0.3)) * 20, cx = this.sx((C().NEST_W || 9) / 2);
      g.save(); g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
      const sc = Math.min(1.2, Math.max(0.8, this.sc));
      g.font = `800 ${Math.round(19 * sc)}px ${FONT}`; g.lineWidth = 5; g.strokeStyle = 'rgba(15,35,28,0.75)';
      const sub = 'Season ' + (b.level + 1) + (b.loop ? ' · round ' + (b.loop + 1) : '');
      g.strokeText(sub, cx, y - 34 * sc); g.fillStyle = '#fff'; g.fillText(sub, cx, y - 34 * sc);
      g.font = `900 ${Math.round(42 * sc)}px ${FONT}`; g.lineWidth = 8;
      g.strokeText(ZONE_INFO[b.s].name, cx, y + 4 * sc); g.fillStyle = PAL[ZONE_INFO[b.s].key].accent; g.fillText(ZONE_INFO[b.s].name, cx, y + 4 * sc);
      g.font = `700 ${Math.round(17 * sc)}px ${FONT}`; g.lineWidth = 5;
      g.strokeText(ZONE_INFO[b.s].hint, cx, y + 42 * sc); g.fillStyle = '#fff'; g.fillText(ZONE_INFO[b.s].hint, cx, y + 42 * sc);
      g.restore();
    }
    drawHints(g) {
      const w = this.world; if (this.hint !== 'move' || (this.banner && this.banner.t < 2.2)) return;
      const touch = MEG.Game && MEG.Game.isTouch, u = this.unit;
      // a ghost finger slides along under Mossy, then lifts (= drop)
      const t = (this.time % 2.4) / 2.4, k = t < 0.7 ? Math.sin(t / 0.7 * Math.PI) : 0;
      const hx = this.sx(this.world.mossy.x) + (k - 0.5) * 2.4 * u * (t < 0.7 ? 1 : 0), hy = this.sy(6.2) + (t > 0.7 ? -(t - 0.7) * 60 : 0);
      g.save(); g.globalAlpha = t > 0.85 ? (1 - t) / 0.15 : 0.85;
      g.fillStyle = '#fff'; g.strokeStyle = 'rgba(20,35,30,0.6)'; g.lineWidth = 3;
      g.beginPath(); g.arc(hx, hy, 14 * this.sc, 0, TAU); g.fill(); g.stroke(); g.restore();
      const msg = touch ? 'Slide to move Mossy, let go to drop!' : 'Move the mouse (or ← →), click / Space to drop!';
      this._label(g, msg, this.sx((C().NEST_W || 9) / 2), this.sy(5.2), this.portrait ? 19 : 17);
    }
    drawDebug(g, a) {
      const w = this.world, u = this.unit;
      g.save(); g.lineWidth = 1.5; g.strokeStyle = '#f0f';
      for (const e of w.eggs) { g.beginPath(); g.arc(this.sx(e.x), this.sy(e.y), (e.r || kindR(e.kind)) * u, 0, TAU); g.stroke(); if (e.falling) { g.fillStyle = '#ff0'; g.fillRect(this.sx(e.x) - 2, this.sy(e.y) - 2, 4, 4); } }
      g.strokeStyle = '#0ff'; g.strokeRect(this.sx(0), this.sy(C().WALL_TOP || 11.2), (C().NEST_W || 9) * u, (C().WALL_TOP || 11.2) * u);
      g.fillStyle = '#fff'; g.font = '12px monospace'; g.textAlign = 'left';
      g.fillText(`eggs ${w.eggs.length} danger ${(w.danger || 0).toFixed(2)} wind ${w.wind ? w.wind.phase + ' ' + (w.wind.force || 0).toFixed(2) : '-'} px ${this.px.toFixed(2)}`, 10, this.VH - 10);
      g.restore();
    }
  }
  Renderer.ZONE_INFO = ZONE_INFO;
  Renderer.PAL = PAL;
  Renderer.KCOL = KCOL;
  Renderer.KNAME = KNAME;
  MEG.Renderer = Renderer;
})(window.MEG = window.MEG || {});
