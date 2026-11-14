/* CK.Render (Lulu's Jungle Tower) — draws the jungle clearing on one canvas: sky, sun/moon and the far / mid / ground jungle
 * of the time of day (crossfaded), the old stump with the wobbling block tower (CK.World.blockPose), the branch with the
 * hanging bananas, Lulu the giraffe calf, the choice blocks (CK.BlockArt), the monkey, the butterfly, the ghost-hand hint,
 * weather particles and juice. Logical coordinates (short side 720) × render scale `rs` = device pixels. No camera.
 * Missing art is tolerated (simple placeholders) so the game boots while the artists are still drawing. */
(function (CK) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const FARFILL = { morning: '#C0D3C2', noon: '#A7C6BC', sunset: '#BBBB9D', night: '#43626E' };
  const GROUNDFILL = { morning: '#A9C98D', noon: '#A6C788', sunset: '#AEC185', night: '#6A9275' };
  const PAL = c => (CK.PALETTE && CK.PALETTE[c]) || { base: c || '#ccc', dark: '#555', light: '#eee' };

  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  }
  function fitText(g, text, maxW, px, weight) {
    let f = px;
    g.font = `${weight || 900} ${f}px ${FONT}`;
    const w = g.measureText(text).width;
    if (w > maxW) { f = Math.max(8, f * maxW / w); g.font = `${weight || 900} ${f}px ${FONT}`; }
    return f;
  }
  function outlinedText(g, text, x, y, px, fill, stroke, maxW) {
    fitText(g, text, maxW || 9999, px);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (stroke) { g.lineWidth = Math.max(3, px * 0.16); g.strokeStyle = stroke; g.strokeText(text, x, y); }
    g.fillStyle = fill; g.fillText(text, x, y);
  }
  function shapePath(g, shape, r) {   // a simple vector shape of radius r centred at 0,0
    g.beginPath();
    switch (shape) {
      case 'square': roundRect(g, -r * 0.82, -r * 0.82, r * 1.64, r * 1.64, r * 0.18); break;
      case 'rect': roundRect(g, -r, -r * 0.6, r * 2, r * 1.2, r * 0.16); break;
      case 'triangle': g.moveTo(0, -r); g.lineTo(r * 0.95, r * 0.75); g.lineTo(-r * 0.95, r * 0.75); g.closePath(); break;
      case 'diamond': g.moveTo(0, -r); g.lineTo(r * 0.75, 0); g.lineTo(0, r); g.lineTo(-r * 0.75, 0); g.closePath(); break;
      case 'oval': g.ellipse(0, 0, r, r * 0.66, 0, 0, TAU); break;
      case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); break;
      case 'heart':
        g.moveTo(0, r * 0.85);
        g.bezierCurveTo(-r * 1.25, r * 0.05, -r * 0.75, -r * 0.95, 0, -r * 0.35);
        g.bezierCurveTo(r * 0.75, -r * 0.95, r * 1.25, r * 0.05, 0, r * 0.85); g.closePath(); break;
      default: g.arc(0, 0, r, 0, TAU);
    }
  }
  function starPath(g, r) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } g.closePath(); }
  const DICE = { 1: [[0, 0]], 2: [[-1, -1], [1, 1]], 3: [[-1, -1], [0, 0], [1, 1]], 4: [[-1, -1], [1, -1], [-1, 1], [1, 1]], 5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
    6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]] };
  const MOODS = ['morning', 'noon', 'sunset', 'night'];
  const LULU = { w: 300, h: 440, ax: 150, ay: 432 };
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null ? o[k] : p + (o[k] - p) * a; };
  const BA = () => CK.BlockArt;
  const imgOf = name => (CK.Assets && CK.Assets.images ? CK.Assets.images[name] || null : null);

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0; this._fwT = 0; this._luluDx = 0; this._talkT = 0;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      CK.Assets.dropExact();
    }
    prewarm(layout, level) {   // rasterise the big tiles of a time of day ahead of time
      const m = MOODS[clamp(level | 0, 0, 3)];
      for (const l of ['far', 'mid', 'ground']) { const d = this._layerDims(l); CK.Assets.exact(l + '_' + m, Math.round(d.w * this.rs), Math.round(d.h * this.rs)); }
      void layout;
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt;
      this._dt = dt;
      this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : world.alpha;
      this._L = (world.layout && world.layout.tower) ? world.layout : this._fallbackLayout();
      const amb = weather.ambient || {};
      this._amb = amb;
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1;
      this._backdrop(weather, amb);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o, amb);
      else this._game(world, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fallbackLayout() {
      const W = this.W, H = this.H, portrait = H > W, groundY = H - (portrait ? 40 : 28), S = 112;
      const tx = portrait ? 0.58 * W : Math.max(0.45 * W, 360), baseTop = portrait ? groundY - S - 150 : groundY - 64;
      return { W, H, portrait, ins: { top: 0, right: 0, bottom: 0, left: 0 }, groundY, S, tower: { x: tx, baseTop, baseW: S + 70 },
        goalY: baseTop - 3 * S - 8, lulu: { x: portrait ? 115 : 120, y: portrait ? baseTop + 70 : groundY - 4, h: portrait ? 400 : 420 }, slots: [] };
    }

    /* ---------- backdrop: sky, sun/moon, clouds, far / mid / ground jungle (time-of-day crossfade) ---------- */
    _layerDims(l) {   // env artist's recipe: bottom-anchored tiles, ×1.36 in portrait so the jungle fills the tall sky
      const W = this.W, H = this.H, portrait = H > W, k = portrait ? 1.36 : 1;
      const vh = l === 'far' ? 420 : l === 'mid' ? 380 : 260;
      const bottom = l === 'far' ? (portrait ? 0.72 : 0.76) : l === 'mid' ? (portrait ? 0.80 : 0.86) : 1.0;
      return { w: 1200 * k, h: vh * k, bottom: bottom * H + (l === 'ground' ? 2 : 0) };
    }
    _layer(l, from, to, mix) {
      const g = this.g, d = this._layerDims(l), W = this.W;
      const one = (m, al) => {
        if (al <= 0.01) return false;
        const tile = CK.Assets.exact(l + '_' + m, Math.round(d.w * this.rs), Math.round(d.h * this.rs));
        if (!tile) return false;
        g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = al;
        const y = Math.round((d.bottom - d.h) * this.rs), tw = tile.width;
        const x0 = -Math.round(((W * this.rs - tw) / 2 % tw + tw) % tw);
        for (let x = x0 - tw; x < W * this.rs; x += tw) g.drawImage(tile, x, y);
        g.restore();
        return true;
      };
      if (from && from !== to && mix < 1) { const ok = one(from, 1); one(to, mix); return ok; }
      return one(to, 1);
    }
    _backdrop(weather, amb) {
      const g = this.g, W = this.W, H = this.H, portrait = H > W;
      const to = amb.env || 'morning', from = amb.envFrom || to, mix = amb.envMix == null ? 1 : amb.envMix;
      const sky = g.createLinearGradient(0, 0, 0, H * (portrait ? 0.6 : 0.7));
      sky.addColorStop(0, amb.skyTop || '#BFE6F2');
      if (amb.skyMid) sky.addColorStop(0.55, amb.skyMid);
      sky.addColorStop(1, amb.skyBottom || '#F4EFD6');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      this._particles(weather.particles, 'sky');
      const ins = this._L.ins || {};
      const sunA = amb.sun || 0;
      if (sunA > 0.01) this._sprite('sun', W * (amb.sunX == null ? 0.2 : amb.sunX), Math.max((ins.top || 0) + 80, H * (amb.sunY || 0.2)), portrait ? 190 : 170, this.time * 0.05, sunA);
      const moonA = amb.moon || 0;
      if (moonA > 0.01) this._sprite('moon', W * (amb.moonX == null ? 0.8 : amb.moonX), Math.max((ins.top || 0) + 80, H * (amb.moonY || 0.15)), portrait ? 170 : 150, 0, moonA);
      for (const c of weather.clouds || []) {
        if (c.alpha <= 0.01) continue;
        this._sprite(CK.Assets.has(c.sprite) ? c.sprite : 'cloud_a', c.x, c.y, 320 * (c.scale || 1), 0, clamp(c.alpha, 0, 1) * 0.9);
      }
      const farD = this._layerDims('far'), midD = this._layerDims('mid');
      if (!this._layer('far', from, to, mix)) { g.fillStyle = '#9FC3B5'; g.fillRect(0, farD.bottom - 160, W, 160); }
      g.fillStyle = FARFILL[to] || '#A7C6BC'; g.fillRect(0, farD.bottom - 1, W, H - farD.bottom + 1);
      for (const m of weather.mist || []) {
        if (!(m.alpha > 0.01)) continue;
        const spr = CK.Assets.sprite(m.sprite, 320 * (m.scale || 1) * this.rs);
        if (!spr) continue;
        const w = 320 * (m.scale || 1) * 1.6, h = 170 * (m.scale || 1) * 0.55;
        g.save(); g.globalAlpha = clamp(m.alpha, 0, 1) * 0.8; g.drawImage(spr, m.x - w / 2, m.y - h / 2, w, h); g.restore();
      }
      if (!this._layer('mid', from, to, mix)) { g.fillStyle = '#4F8A63'; g.fillRect(0, midD.bottom - 200, W, 200); }
      g.fillStyle = GROUNDFILL[to] || '#A6C788'; g.fillRect(0, midD.bottom - 2, W, H - midD.bottom + 2);
      this._layer('ground', from, to, mix);
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
    }

    /* ---------- the round ---------- */
    _game(w, o, a) {
      const g = this.g, L = this._L, S = L.S || 112, T = w.tower || { x: L.tower.x, baseTop: L.tower.baseTop, blocks: [] };
      const night = (this._amb && this._amb.mood === 'night');
      this._stump(T.x, T.baseTop, (L.tower && L.tower.baseW) || S + 70, night);
      this._goal(w, a, night);
      this._lulu(w, o);
      // leaf pads under the second tray row
      if (BA() && BA().drawLeafPad) for (const sl of L.slots || []) if (sl.row === 1) { g.save(); g.translate(sl.x, sl.y + S / 2); try { BA().drawLeafPad(g, S * 1.5, S * 0.34); } catch (e) { } g.restore(); }
      const order = w.drawOrder ? w.drawOrder() : (w.pieces || []);
      for (const p of order) if ((p.z || 0) <= 3) this._piece(w, p, a, S);
      this._tower(w, a, S);
      this._monkey(w.monkey, a);
      this._butterfly(w.butterfly, a);
      for (const p of order) if ((p.z || 0) > 3) this._piece(w, p, a, S);
      this._hintHand(w.hintHand, w, S);
    }
    _shadow(x, y, w, al) {
      const g = this.g; g.fillStyle = `rgba(30,50,25,${0.22 * (al == null ? 1 : al)})`; g.beginPath(); g.ellipse(x, y, w / 2, Math.max(4, w * 0.09), 0, 0, TAU); g.fill();
    }
    _stump(x, top, baseW, night) {
      const ks = baseW / 180, w = 240 * ks, h = 120 * ks;
      this._shadow(x, top + (116 - 18) * ks, w * 0.9, 1);
      if (CK.Assets.has('stump')) this._img('stump', x - 120 * ks, top - 18 * ks, w, h);
      else { const g = this.g; g.fillStyle = '#8B5E3C'; g.fillRect(x - baseW / 2, top, baseW, 90 * ks); g.fillStyle = '#D9B27C'; g.beginPath(); g.ellipse(x, top, baseW / 2, 12 * ks, 0, 0, TAU); g.fill(); }
      void night;
    }
    _block(block, x, y, rot, sx, sy, S, opt, alpha) {
      const g = this.g;
      if (alpha != null && alpha <= 0.01) return;
      g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(sx || 1, sy || 1);
      if (alpha != null && alpha < 1) g.globalAlpha *= alpha;
      if (BA()) { try { BA().drawBlock(g, block, S, Object.assign({ dpr: this.rs, img: imgOf, t: this.time }, opt || {})); } catch (e) { this._placeholderBlock(g, block, S); } }
      else this._placeholderBlock(g, block, S);
      g.restore();
    }
    _placeholderBlock(g, b, S) {
      const c = PAL(b.color || 'yellow'); g.fillStyle = b.kind === 'color' ? c.base : '#F1D3A1'; g.strokeStyle = '#A8743F'; g.lineWidth = 4;
      g.beginPath(); roundRect(g, -S / 2, -S / 2, S, S, S * 0.14); g.fill(); g.stroke();
    }
    _piece(w, p, a, S) {
      if (p.state === 'gone') return;
      const x = ip(p, 'x', a), y = ip(p, 'y', a), rot = ip(p, 'rot', a) || 0, sc = p.scale || 1, al = p.alpha == null ? 1 : p.alpha;
      if (al <= 0.01) return;
      const side = (p.side || S) * sc;
      // shadow on the ground under the block (it shrinks while the block is lifted high)
      const L = this._L, gy = (p.row === 1 ? (p.homeY + side / 2 + 2) : (p.homeY != null ? p.homeY + (p.side || S) / 2 : L.groundY - 6));
      const lift = clamp((gy - (y + side / 2)) / 260, 0, 1);
      if (p.state !== 'fall' || lift < 0.98) this._shadow(x, gy, side * (0.95 - 0.45 * lift), al * (1 - 0.6 * lift));
      this._block(p.block, x, y, rot, p.sx, p.sy, S * sc, { glow: p.glow || 0, lift: p.state === 'drag' ? 1 : 0 }, al);
    }
    _tower(w, a, S) {
      const T = w.tower; if (!T || !T.blocks) return;
      const g = this.g, n = T.blocks.length;
      for (let i = 0; i < n; i++) {
        const b = T.blocks[i], P = w.blockPose ? w.blockPose(i, a) : null; if (!P) continue;
        this._block(b.block, P.x, P.y, P.rot, P.sx, P.sy, S, { glow: b.glow || 0 }, P.alpha);
        if (b.bloom > 0 && !b.fly && BA() && BA().drawFlower) {
          const side = b.side || S, sgn = i % 2 ? 1 : -1;
          g.save(); g.translate(P.x, P.y); g.rotate(P.rot || 0);
          g.translate(sgn * side * 0.5, side * 0.18);
          try { BA().drawFlower(g, S * 0.42, b.bloom, i % 3); } catch (e) { }
          g.translate(-sgn * side * 0.06, -side * 0.42);
          try { BA().drawFlower(g, S * 0.28, clamp(b.bloom * 1.3 - 0.3, 0, 1), (i + 1) % 3); } catch (e) { }
          g.restore();
        }
      }
    }
    _goal(w, a, night) {
      const G = w.goal, L = this._L, g = this.g;
      // the branch: its stem point (110, 140) sits at the bananas' branch point
      const sx = G ? (G.stemX != null ? G.stemX : G.x) : L.tower.x, sy = G ? (G.stemY != null ? G.stemY : (L.ins.top || 0) + 16) : (L.ins.top || 0) + 16;
      const kb = clamp((this.W - sx) / 490, 1, 1.9);
      if (CK.Assets.has('branch')) {
        this._img('branch', sx - 110 * kb, sy - 140 * kb, 600 * kb, 160 * kb);
      }
      if (!G || G.state === 'taken') return;
      const gx = G.x, gy = ip(G, 'y', a), sw = ip(G, 'swing', a) || 0, h = G.h || 104, wdt = h * 120 / 130;
      g.strokeStyle = '#5F8A3A'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(sx, sy - 4); g.quadraticCurveTo(sx + Math.sin(sw) * 20, (sy + gy) / 2, gx + Math.sin(sw) * 4, gy + 4); g.stroke();
      g.save(); g.translate(gx, gy); g.rotate(sw);
      if (CK.Assets.has('bananas')) this._img('bananas', -60 * wdt / 120, -6 * h / 130, wdt, h);
      else { g.fillStyle = '#F6D45A'; g.beginPath(); g.ellipse(0, h * 0.45, wdt * 0.35, h * 0.4, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    _luluFrame(w) {
      const m = (w.lulu && w.lulu.mood) || 'idle';
      if (m === 'idle' || m === 'talk') {
        if (this._blinking(this._dt)) return 'lulu_blink';
        if (this._speaking || m === 'talk') { this._talkT += this._dt; return (this._talkT % 0.3) < 0.15 ? 'lulu_talk' : 'lulu_idle'; }
        return 'lulu_idle';
      }
      return 'lulu_' + m;
    }
    _lulu(w, o) {
      const L = this._L, Q = L.lulu; if (!Q) return;
      const g = this.g, h = Q.h, k = h / LULU.h, wd = LULU.w * k;
      const nm = this._luluFrame(w);
      // hold: slide Lulu towards the tower so her horn touches it (the art pushes at x ≈ 285)
      let want = 0;
      if (nm === 'lulu_hold' && L.tower) want = clamp(L.tower.x - (L.S || 112) / 2 - 2 - (Q.x + (285 - LULU.ax) * k), 0, 380);
      this._luluDx += (want - this._luluDx) * clamp((this._dt || 0) * 4, 0, 1);
      const x = Q.x + this._luluDx;
      const cheer = nm === 'lulu_cheer' || nm === 'lulu_happy';
      const walking = Math.abs(want - this._luluDx) > 4;
      const bob = cheer ? Math.abs(Math.sin(this.time * 7)) * 8 : walking ? Math.abs(Math.sin(this.time * 12)) * 7 : Math.sin(this.time * 1.6) * 1.5;
      this._shadow(x, Q.y + 2, wd * 0.62, 1);
      const name = CK.Assets.has(nm) ? nm : 'lulu_idle';
      if (CK.Assets.has(name)) this._img(name, x - LULU.ax * k, Q.y - LULU.ay * k - bob, wd, h);
      else { g.fillStyle = '#EDCB92'; g.fillRect(x - 40, Q.y - h, 80, h); }
    }
    _monkey(M, a) {
      if (!M) return;
      const g = this.g, x = ip(M, 'x', a), y = ip(M, 'y', a), rot = ip(M, 'rot', a) || 0;
      g.strokeStyle = '#4E7A34'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(M.vx, M.vy); g.lineTo(x, y); g.stroke();
      g.strokeStyle = '#6FA048'; g.lineWidth = 3; g.beginPath(); g.moveTo(M.vx + 2, M.vy); g.lineTo(x + 2, y); g.stroke();
      const nm = M.state === 'in' ? 'monkey_swing' : 'monkey_grab', h = 200 * 0.9, wd = 160 * 0.9;
      g.save(); g.translate(x, y); g.rotate(rot);
      if (CK.Assets.has(nm)) this._img(nm, -80 * 0.9, -6 * 0.9, wd, h);
      g.restore();
    }
    _butterfly(B, a) {
      if (!B) return;
      const x = ip(B, 'x', a), y = ip(B, 'y', a), nm = (B.flap || 0) < 0.5 ? 'butterfly' : 'butterfly_up';
      this._sprite(CK.Assets.has(nm) ? nm : 'butterfly', x, y, 64, B.rot || 0, 1, null, (B.flip || 1) < 0);
    }
    _hintHand(H, w, S) {
      if (!H || !(H.alpha > 0.01) || !BA() || !BA().drawGhostHand) return;
      const g = this.g;
      if (H.press) {
        const p = w.pieceById ? w.pieceById(H.pieceId) : null;
        if (p) this._block(p.block, H.x, H.y + S * 0.15, 0, 1, 1, S, { glow: 0.4 }, 0.35 * H.alpha);
      }
      g.save(); g.globalAlpha *= H.alpha; g.translate(H.x, H.y);
      try { BA().drawGhostHand(g, S * 0.85, H.t || 0); } catch (e) { }
      g.restore();
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }

    /* ---------- title & celebration ---------- */
    _titleScene(w, o) {
      const L = this._L, W = this.W, H = this.H, portrait = H > W, ins = L.ins || {};
      const gy = H - (ins.bottom || 0) - (portrait ? 60 : 30);
      let S = portrait ? 110 : 96;
      const tx = portrait ? W * 0.72 : W - (ins.right || 0) - Math.max(170, W * 0.15);
      const lg = o.boxes && o.boxes.logo;
      // keep the bananas under the logo when the tower stands below it (iPad landscape, visual QA P2-2)
      if (!portrait && lg && tx + S * 0.6 > lg.x && tx - S * 0.6 < lg.x + lg.w) S = clamp((gy - 64 - 26 - 100 - (lg.y + lg.h + 8)) / 3, 60, 96);
      this._stump(tx, gy - 64, S + 70, false);
      const cols = ['red', 'blue', 'yellow'];
      for (let i = 0; i < 3; i++) {
        const sway = Math.sin(this.time * 1.7 + i * 0.3) * 0.02 * (i + 1);
        this._block({ kind: 'color', value: cols[i], color: cols[i] }, tx + Math.sin(sway) * (i + 0.5) * S, gy - 64 - S / 2 - i * S, sway, 1, 1, S, {}, 1);
      }
      // bananas above the tower
      const by = gy - 64 - 3 * S - 26 + Math.sin(this.time * 2) * 3;
      const g0 = this.g; g0.strokeStyle = '#5F8A3A'; g0.lineWidth = 6; g0.lineCap = 'round';
      if (portrait) { g0.beginPath(); g0.moveTo(tx, by - 300); g0.lineTo(tx, by - 92); g0.stroke(); }
      if (CK.Assets.has('bananas')) this._img('bananas', tx - 46, by - 100, 92, 100);
      const lh = portrait ? 430 : Math.min(400, H * 0.58), k = lh / LULU.h;
      const lx = portrait ? W * 0.26 : (ins.left || 0) + Math.max(150, W * 0.14);
      const hop = (this.time % 2.6) < 0.5 ? Math.sin((this.time % 2.6) / 0.5 * Math.PI) * 14 : 0;
      this._shadow(lx, gy + 2, LULU.w * k * 0.6, 1);
      const nm = CK.Assets.has('lulu_full_wave') ? 'lulu_full_wave' : 'lulu_happy';
      if (CK.Assets.has(nm)) this._img(nm, lx - LULU.ax * k, gy - LULU.ay * k - hop, LULU.w * k, lh);
    }
    _doneScene(w, o, amb) {   // the starry-night party: fireflies, fireworks, a rainbow tower, the monkey and Lulu cheering
      const g = this.g, L = this._L, W = this.W, H = this.H, t = this.time, portrait = H > W, ins = L.ins || {};
      this._fwT -= o.dt || 0;
      if (this._fwT <= 0) { this._fwT = 0.8 + Math.random() * 0.7; this.burst('firework', W * (0.12 + Math.random() * 0.76), H * (0.1 + Math.random() * 0.25)); }
      const dp = o.boxes && o.boxes.done;
      const gy = portrait ? Math.min(H * 0.62, dp ? dp.y - 20 : H) : H - (ins.bottom || 0) - 30;
      const S = portrait ? 84 : 72, tx = portrait ? W * 0.62 : (ins.left || 0) + Math.max(330, W * 0.33);
      this._stump(tx, gy - 56, S + 60, true);
      const cols = ['red', 'orange', 'yellow', 'green', 'blue', 'purple'];
      for (let i = 0; i < 6; i++) {
        const sway = Math.sin(t * 2 + i * 0.4) * 0.025 * (i + 1) / 3;
        const glow = Math.max(0, Math.sin(t * 3 - i * 0.7));
        this._block({ kind: 'color', value: cols[i], color: cols[i] }, tx + Math.sin(sway) * (i + 0.5) * S, gy - 56 - S / 2 - i * S, sway, 1, 1, S, { glow: glow * 0.6 }, 1);
      }
      // the monkey swinging above the tower top
      const topY = gy - 56 - 6 * S, vx = tx + 60, vy = -20, Lv = Math.max(60, topY - vy - 150), ph = Math.sin(t * 2.2) * 0.45;
      const mx = vx + Math.sin(ph) * Lv, my = vy + Math.cos(ph) * Lv;
      this._monkey({ x: mx, y: my, vx, vy, rot: -ph * 0.6, state: 'grab' }, 1);
      const nmM = 'monkey_cheer';
      if (CK.Assets.has(nmM) && Math.sin(t * 4) > 0.3) { /* keep the grab frame: the cheer frame flickers in */ g.save(); g.translate(mx, my); g.rotate(-ph * 0.6); this._img(nmM, -72, -5.4, 144, 180); g.restore(); }
      const lh = portrait ? Math.min(400, gy - 120) : Math.min(400, H * 0.56), k = lh / LULU.h;
      const lx = portrait ? (ins.left || 0) + 140 : tx - S - LULU.w * k * 0.45;
      const hop = Math.max(0, Math.sin(t * 4)) * 16;
      this._shadow(lx, gy + 2, LULU.w * k * 0.6, 1);
      const nm = CK.Assets.has('lulu_cheer') ? 'lulu_cheer' : 'lulu_idle';
      if (CK.Assets.has(nm)) this._img(nm, lx - LULU.ax * k, gy - LULU.ay * k - hop, LULU.w * k, lh);
      void amb;
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((CK.CONFIG && CK.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * 0.42;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(40,60,30,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFBF2'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#C9D8A8'; g.stroke();
      const I = CK.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#6a6a4a', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#3E7F57', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#6a6a4a', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#3E7F57', '#ffffff', 160);
      }
      g.restore();
    }

    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 260) fx.splice(0, fx.length - 260);
      const R = Math.random;
      const colOf = c => (c && CK.PALETTE && CK.PALETTE[c]) ? CK.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'pop' || type === 'found' || type === 'collect') {
        const col = colOf(opt.color), size = opt.size || 110;
        fx.push({ k: 'flash', x, y, t: 0, life: 0.32, size });
        const n = Math.round((type === 'pop' ? 10 : 22) * this.quality);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 160 + R() * 260;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: opt.color ? col : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
            g: 520, drag: 1.4, t: 0, life: 0.8 + R() * 0.5, size: 20 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 14, sway: R() * TAU });
        }
        for (let i = 0; i < 6; i++) {
          const a = R() * TAU, sp = 90 + R() * 140;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, t: 0, life: 0.5 + R() * 0.2, size: 20 + R() * 12, rot: R() * TAU, vr: 4 });
        }
      } else if (type === 'rustle' || type === 'leaves') {   // a puff of leaves / snow / petals off a hiding place
        const sprites = opt.petals ? ['petal', 'pollen'] : ['leaf_a', 'leaf_b', 'puff'];
        const n = Math.round((opt.n || 8) * this.quality);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.4, sp = 90 + R() * 160;
          const spr = sprites[i % sprites.length];
          fx.push({ k: 'p', sprite: CK.Assets.has(spr) ? spr : 'puff', tint: null, x: x + (R() - 0.5) * (opt.size || 120) * 0.6, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            g: 260, drag: 1.6, t: 0, life: 0.7 + R() * 0.5, size: 16 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'land') {
        for (let i = 0; i < 5; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 40, y: y - 4, vx: (R() < 0.5 ? -1 : 1) * (50 + R() * 70), vy: -10 - R() * 25, g: 0, drag: 2, t: 0, life: 0.45, size: 18 + R() * 10, rot: 0, vr: 0 });
      } else if (type === 'sparkles') {
        for (let i = 0; i < 26; i++) {
          const a = R() * TAU, sp = 120 + R() * 300;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, g: 220, t: 0, life: 1 + R() * 0.6, size: 20 + R() * 16, rot: R() * TAU, vr: 5 });
        }
      } else if (type === 'butterfly') {
        const col = CONF[(R() * CONF.length) | 0];
        for (let i = 0; i < (opt.n || 1); i++) fx.push({ k: 'bfly', x: x + (R() - 0.5) * 30, y, vx: (R() < 0.5 ? -1 : 1) * (50 + R() * 40), vy: -90 - R() * 40, t: 0, life: 2.4, size: 34, color: i ? CONF[(R() * CONF.length) | 0] : col, ph: R() * TAU });
      } else if (type === 'firework') {
        const col = CONF[(R() * CONF.length) | 0];
        for (let i = 0; i < 28 * this.quality; i++) {
          const a = i / 28 * TAU, sp = 180 + R() * 60;
          fx.push({ k: 'p', sprite: 'sparkle', tint: col, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 90, drag: 1.2, t: 0, life: 1.1 + R() * 0.3, size: 18 + R() * 8, rot: 0, vr: 3 });
        }
        fx.push({ k: 'flash', x, y, t: 0, life: 0.3, size: 90 });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(120 * this.quality);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'hint') {
        const r0 = (opt.size || 110) * 0.6;
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; fx.push({ k: 'p', sprite: 'sparkle', x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 * 0.6, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20, g: 0, t: 0, life: 0.9, size: 22, rot: 0, vr: 3 }); }
      } else if (type === 'wrong') {
        fx.push({ k: 'ring', x, y, t: 0, life: 0.35, size: (opt.size || 110) * 1.1, color: '255,255,255' });
      } else if (type === 'count') {   // a big numeral floats up while Pip counts
        fx.push({ k: 'num', x, y, t: 0, life: 0.85, text: String(opt.n || '') });
      }
    }
    _fx(dt) {
      const g = this.g, fx = this.fx;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t += dt;
        if (f.t < 0) continue;
        const u = f.t / f.life;
        if (u >= 1) { if (f.onDone) f.onDone(); fx.splice(i, 1); continue; }
        if (f.k === 'p') {
          f.vy += (f.g || 0) * dt;
          if (f.drag) { f.vx *= 1 - f.drag * dt; f.vy = Math.min(f.vy, 200); if (f.sway != null) { f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; } }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const al = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, f.size, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, f.size, f.rot, al);
        } else if (f.k === 'bfly') {
          f.ph += dt * 3; f.x += (f.vx + Math.sin(f.ph) * 60) * dt; f.y += (f.vy + Math.cos(f.ph * 1.3) * 40) * dt; f.vy *= 1 - 0.6 * dt;
          const al = u > 0.75 ? (1 - u) / 0.25 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y);
          if (CK.Assets.has('butterfly')) { this._sprite(Math.sin(this.time * 14 + f.ph) > 0 ? 'butterfly' : 'butterfly_up', 0, 0, f.size * 1.6, 0, 1); }
          else { g.fillStyle = f.color; g.beginPath(); g.ellipse(-8, 0, 9, 13 * Math.abs(Math.sin(this.time * 14)), 0, 0, TAU); g.ellipse(8, 0, 9, 13 * Math.abs(Math.sin(this.time * 14)), 0, 0, TAU); g.fill(); }
          g.restore();
        } else if (f.k === 'flash') {
          g.strokeStyle = `rgba(255,250,220,${0.9 * (1 - u)})`; g.lineWidth = 8 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.25 + 0.6 * u), 0, TAU); g.stroke();
          g.fillStyle = `rgba(255,255,240,${0.55 * (1 - u) * (1 - u)})`; g.beginPath(); g.arc(f.x, f.y, f.size * 0.35 * (1 - u * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color || '255,240,150'},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 40); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#3E7F57', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = CK.Assets.tinted ? CK.Assets.tinted(name, color, size * this.rs) : CK.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      const g = this.g;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || p.alpha <= 0.01 || p.kind === 'streak') continue;
        if (p.glow) {   // firefly halo
          const r = (p.size || 10) * 1.6, rg = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          rg.addColorStop(0, `rgba(230,255,150,${0.45 * p.alpha * p.glow})`); rg.addColorStop(1, 'rgba(230,255,150,0)');
          g.fillStyle = rg; g.beginPath(); g.arc(p.x, p.y, r, 0, TAU); g.fill();
        }
        const nm = p.sprite === 'star' ? 'pstar' : p.sprite;
        if (p.color) this._tinted(nm, p.color, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = CK.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
      if (!spr) return;
      const k = size / Math.max(spr.width, spr.height);
      const w = spr.width * k, h = spr.height * k;
      const a0 = g.globalAlpha;
      if (alpha != null && alpha < 1) g.globalAlpha = a0 * alpha;
      if (rot || flipX) {
        g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flipX) g.scale(-1, 1);
        g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
      } else g.drawImage(spr, x - w / 2, y - h / 2, w, h);
      g.globalAlpha = a0;
    }
    _img(name, x, y, w, h) {
      const spr = CK.Assets.sprite(name, Math.max(w, h) * this.rs * 1.5);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      for (const p of w.pieces || []) { const b = w.pieceHit && w.pieceHit(p.id); if (b) g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); }
      if (L.drop) { g.strokeStyle = 'rgba(0,160,0,.7)'; g.strokeRect(L.drop.x0, 0, L.drop.x1 - L.drop.x0, L.drop.y1); }
      const lb = w.luluHit && w.luluHit(); if (lb) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(lb.x - lb.w / 2, lb.y - lb.h / 2, lb.w, lb.h); }
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
    }
    /* A Talk-time picture (question or answer button): the same wooden block the child stacks. */
    drawItemBody(g, it, s) {
      const b = Object.assign({}, it.token || it);
      if (b.kind === 'stars') b.kind = 'dots';
      if (b.kind === 'number' && this._talkDots) b.showDots = b.n <= 10;
      const S = s * 0.78;
      g.save();
      if (BA()) { try { BA().drawBlock(g, b, S, { dpr: this.rs, img: imgOf, cache: false }); } catch (e) { this._placeholderBlock(g, b, S); } }
      else this._placeholderBlock(g, b, S);
      g.restore();
    }
  }

  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = CK.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, Math.min(ch * 0.95, cw * 0.95));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  CK.Renderer = Renderer;
})(window.CK = window.CK || {});
