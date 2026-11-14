/* CK.Render (Koko's Cake Tower) — draws Candy Village on one canvas: sky, sun, rainbow, clouds and the far / mid / ground
 * layers of the weather (crossfaded), the cake stand with the wobbling cake (CK.World.blockPose), the cherry on its
 * cotton-candy cloud, candles, Koko the koala baker, the choice layers (CK.BlockArt), the bee, the ghost-hand hint, weather
 * particles and juice. Logical coordinates (short side 720) × render scale `rs` = device pixels. No camera.
 * Missing art is tolerated (simple placeholders). */
(function (CK) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const FARFILL = { sunny: '#E6E8CB', breezy: '#E6E8D0', rain: '#C2C8C1', rainbow: '#E6E9CD' };
  const GROUNDFILL = { sunny: '#F3E2C0', breezy: '#F2E3C2', rain: '#DFD3BB', rainbow: '#F3E3C2' };
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
  const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
  const KOKO = { w: 300, h: 400, ax: 150, ay: 392 };
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null ? o[k] : p + (o[k] - p) * a; };
  const BA = () => CK.BlockArt;
  const imgOf = name => (CK.Assets && CK.Assets.images ? CK.Assets.images[name] || null : null);

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0; this._fwT = 0; this._kokoDx = 0; this._talkT = 0;
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
      const W = this.W, H = this.H, portrait = H > W, groundY = H - (portrait ? 40 : 28), S = 124, LW = 161, LH = 97;
      const tx = portrait ? 0.58 * W : Math.max(0.42 * W, 400), baseTop = portrait ? groundY - LH - 150 : groundY - 96;
      return { W, H, portrait, ins: { top: 0, right: 0, bottom: 0, left: 0 }, groundY, S, LW, LH, tower: { x: tx, baseTop, baseW: LW + 60 },
        goalY: baseTop - 3 * LH - 8, koko: { x: portrait ? 110 : 120, y: portrait ? baseTop + 70 : groundY - 4, h: portrait ? 300 : 330 }, slots: [] };
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
      const to = amb.env || amb.mood || 'sunny', from = amb.envFrom || to, mix = amb.envMix == null ? 1 : amb.envMix;
      const sky = g.createLinearGradient(0, 0, 0, H * (portrait ? 0.6 : 0.7));
      sky.addColorStop(0, amb.skyTop || '#A9DDF5');
      if (amb.skyMid) sky.addColorStop(0.55, amb.skyMid);
      sky.addColorStop(1, amb.skyBottom || '#FFF4DA');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const ins = this._L.ins || {};
      const sunA = amb.sun || 0;
      if (sunA > 0.01) this._sprite('sun', W * (amb.sunX == null ? 0.2 : amb.sunX), Math.max((ins.top || 0) + 80, H * (amb.sunY || 0.2)), portrait ? 190 : 170, this.time * 0.05, sunA);
      const rbA = amb.rainbow || 0;
      if (rbA > 0.01 && CK.Assets.has('rainbow')) {   // a soft arc behind the village, centred near the cake
        const rw = portrait ? 1.25 * W : 0.95 * W, rh = rw / 2, cx = (this._L.tower && this._L.tower.x) || W / 2;
        const fb = this._layerDims('far').bottom;
        g.save(); g.globalAlpha = clamp(rbA, 0, 1); this._img('rainbow', cx - rw / 2, fb - rh * 0.92, rw, rh); g.restore();
      }
      for (const c of weather.clouds || []) {
        if (!(c.alpha > 0.01)) continue;
        const nm = c.kind === 'rain' ? 'cloud_rain' : 'cloud_' + (c.kind || 'a');
        this._sprite(CK.Assets.has(nm) ? nm : 'cloud_a', c.x, c.y, 320 * (c.s || c.scale || 1) * (portrait ? 1.2 : 1), 0, clamp(c.alpha, 0, 1) * 0.92);
      }
      const farD = this._layerDims('far'), midD = this._layerDims('mid');
      if (!this._layer('far', from, to, mix)) { g.fillStyle = '#DCE3C4'; g.fillRect(0, farD.bottom - 160, W, 160); }
      g.fillStyle = FARFILL[to] || '#E6E8CB'; g.fillRect(0, farD.bottom - 1, W, H - farD.bottom + 1);
      if (!this._layer('mid', from, to, mix)) { g.fillStyle = '#E9D6B6'; g.fillRect(0, midD.bottom - 200, W, 200); }
      g.fillStyle = GROUNDFILL[to] || '#F3E2C0'; g.fillRect(0, midD.bottom - 2, W, H - midD.bottom + 2);
      this._layer('ground', from, to, mix);
      if (amb.darkness > 0.01) { g.fillStyle = `rgba(70,80,110,${clamp(amb.darkness, 0, 0.5)})`; g.fillRect(0, 0, W, H); }
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
    }

    /* ---------- the round ---------- */
    _dims() { const L = this._L, S = L.S || 124; return { S, LW: L.LW || Math.round(1.3 * S), LH: L.LH || Math.round(0.78 * S) }; }
    _game(w, o, a) {
      const g = this.g, L = this._L, D = this._dims(), T = w.tower || { x: L.tower.x, baseTop: L.tower.baseTop, blocks: [] };
      this._stand(T.x, T.baseTop, (L.tower && L.tower.baseW) || D.LW + 60);
      this._cloud(w, a);
      this._koko(w, o);
      // cake boards under the second tray row
      const used = new Set((w.pieces || []).filter(p => p.state !== 'gone' && p.state !== 'out' && p.row === 1).map(p => p.slot));
      if (BA() && BA().drawPlate) for (let si = 0; si < (L.slots || []).length; si++) { const sl = L.slots[si]; if (sl.row !== 1 || !used.has(si)) continue; g.save(); g.translate(sl.x, sl.y + D.LH / 2); try { BA().drawPlate(g, D.LW * 1.25, D.LH * 0.3); } catch (e) { } g.restore(); }
      const order = w.drawOrder ? w.drawOrder() : (w.pieces || []);
      for (const p of order) if ((p.z || 0) <= 3) this._piece(w, p, a, D);
      this._tower(w, a, D);
      this._candles(w, a, D);
      this._cherry(w, a);
      this._bee(w.bee, a);
      for (const p of order) if ((p.z || 0) > 3) this._piece(w, p, a, D);
      this._hintHand(w.hintHand, w, D);
    }
    _shadow(x, y, w, al) {
      const g = this.g; g.fillStyle = `rgba(90,60,30,${0.2 * (al == null ? 1 : al)})`; g.beginPath(); g.ellipse(x, y, w / 2, Math.max(4, w * 0.09), 0, 0, TAU); g.fill();
    }
    _stand(x, top, baseW) {
      const ks = baseW / 220, w = 260 * ks, h = 120 * ks;
      this._shadow(x, top + (116 - 18) * ks, w * 0.8, 1);
      if (CK.Assets.has('stand')) this._img('stand', x - 130 * ks, top - 18 * ks, w, h);
      else { const g = this.g; g.fillStyle = '#FFF8EC'; g.fillRect(x - 20 * ks, top, 40 * ks, 90 * ks); g.beginPath(); g.ellipse(x, top, baseW / 2, 10 * ks, 0, 0, TAU); g.fill(); }
    }
    _block(block, x, y, rot, sx, sy, D, opt, alpha) {
      const g = this.g;
      if (alpha != null && alpha <= 0.01) return;
      g.save(); g.translate(x, y); if (rot) g.rotate(rot); g.scale(sx || 1, sy || 1);
      if (alpha != null && alpha < 1) g.globalAlpha *= alpha;
      if (BA()) { try { BA().drawBlock(g, block, D.LW, D.LH, Object.assign({ dpr: this.rs, img: imgOf, t: this.time }, opt || {})); } catch (e) { this._placeholderBlock(g, block, D); } }
      else this._placeholderBlock(g, block, D);
      g.restore();
    }
    _placeholderBlock(g, b, D) {
      const c = PAL(b.color || 'yellow'); g.fillStyle = b.kind === 'color' ? c.base : '#F6DFAE'; g.strokeStyle = '#B98A4E'; g.lineWidth = 4;
      g.beginPath(); roundRect(g, -D.LW / 2, -D.LH / 2, D.LW, D.LH, D.LH * 0.18); g.fill(); g.stroke();
    }
    _piece(w, p, a, D) {
      if (p.state === 'gone') return;
      const x = ip(p, 'x', a), y = ip(p, 'y', a), rot = ip(p, 'rot', a) || 0, sc = p.scale || 1, al = p.alpha == null ? 1 : p.alpha;
      if (al <= 0.01) return;
      const small = p.block && p.block.size === 'small' ? 0.72 : 1;
      const bw = (p.bw || D.LW) * sc, bh = (p.bh || D.LH) * sc;
      const L = this._L, gy = (p.homeY != null ? p.homeY + (p.bh || D.LH) / 2 + 2 : L.groundY - 6);
      const lift = clamp((gy - (y + bh / 2)) / 260, 0, 1);
      if (p.state !== 'fall' || lift < 0.98) this._shadow(x, gy, bw * small * (0.95 - 0.45 * lift), al * (1 - 0.6 * lift));
      this._block(p.block, x, y, rot, p.sx, p.sy, { S: D.S, LW: D.LW * sc, LH: D.LH * sc }, { glow: p.glow || 0, lift: p.state === 'drag' ? 1 : 0, id: p.block && p.block.id != null ? p.block.id : p.id }, al);
    }
    _tower(w, a, D) {
      const T = w.tower; if (!T || !T.blocks) return;
      const n = T.blocks.length;
      for (let i = 0; i < n; i++) {
        const b = T.blocks[i], P = w.blockPose ? w.blockPose(i, a) : null; if (!P) continue;
        this._block(b.block, P.x, P.y, P.rot, P.sx, P.sy, D, { glow: b.glow || 0, id: b.id }, P.alpha);
      }
    }
    _cloud(w, a) {
      const C = w.cloudPose ? w.cloudPose(a) : null; if (!C || !(C.alpha > 0.01)) return;
      const g = this.g, s = C.s || 1;
      g.save(); g.globalAlpha *= clamp(C.alpha, 0, 1);
      if (CK.Assets.has('cloud_candy')) this._img('cloud_candy', C.x - 100 * 0.9 * s, C.y - 22 * 0.91 * s, 180 * s, 100 * s);
      else { g.fillStyle = '#F6D9EA'; g.beginPath(); g.ellipse(C.x, C.y + 30 * s, 80 * s, 36 * s, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    _cherry(w, a) {
      const C = w.cherryPose ? w.cherryPose(a) : null; if (!C || !(C.alpha > 0.01)) return;
      const g = this.g, h = 72, wd = 64;
      g.save(); g.globalAlpha *= clamp(C.alpha, 0, 1); g.translate(C.x, C.y); if (C.rot) g.rotate(C.rot); g.scale(C.sx || 1, C.sy || 1);
      if (CK.Assets.has('cherry')) this._img('cherry', -40 * wd / 80, -86 * h / 90, wd, h);
      else { g.fillStyle = '#C8243A'; g.beginPath(); g.arc(0, -h * 0.3, h * 0.3, 0, TAU); g.fill(); }
      g.restore();
    }
    _candles(w, a, D) {
      if (!w.candles || !w.candlePose || !BA() || !BA().drawCandle) return;
      const g = this.g, h = 0.55 * D.LH;
      const lean = clamp((w.blowT || 0) * 0.6 + (w.breeze || 0) * 0.15, 0, 0.8);
      for (let j = 0; j < w.candles.length; j++) {
        const P = w.candlePose(j, a); if (!P || !(P.alpha > 0.01)) continue;
        g.save(); g.globalAlpha *= clamp(P.alpha, 0, 1); g.translate(P.x, P.y); g.rotate((P.rot || 0) + lean * 0.15);
        try { BA().drawCandle(g, (P.h || w.candleH || h) * (P.s || 1), P.lit || 0, P.out || 0, this.time + j * 0.37); } catch (e) { }
        g.restore();
      }
    }
    _kokoFrame(w) {
      const m = (w.koko && w.koko.mood) || 'idle';
      if (m === 'idle' || m === 'talk') {
        if (this._blinking(this._dt)) return 'koko_blink';
        if (this._speaking || m === 'talk') { this._talkT += this._dt; return (this._talkT % 0.3) < 0.15 ? 'koko_talk' : 'koko_idle'; }
        return 'koko_idle';
      }
      return 'koko_' + m;
    }
    _koko(w, o) {
      const L = this._L, Q = L.koko || L.lulu; if (!Q) return;
      const g = this.g, h = Q.h, k = h / KOKO.h, wd = KOKO.w * k, D = this._dims();
      const nm = this._kokoFrame(w);
      // hold: Koko waddles to the cake so his paws touch it (the art's palm is at x ≈ 280)
      let want = 0;
      if (nm === 'koko_hold' && L.tower) want = clamp(L.tower.x - D.LW / 2 - 2 - (Q.x + (280 - KOKO.ax) * k), 0, 380);
      this._kokoDx += (want - this._kokoDx) * clamp((this._dt || 0) * 4, 0, 1);
      const x = Q.x + this._kokoDx;
      const cheer = nm === 'koko_cheer' || nm === 'koko_happy';
      const walking = Math.abs(want - this._kokoDx) > 4;
      const bob = cheer ? Math.abs(Math.sin(this.time * 7)) * 8 : walking ? Math.abs(Math.sin(this.time * 12)) * 7 : Math.sin(this.time * 1.6) * 1.5;
      this._shadow(x, Q.y + 2, wd * 0.55, 1);
      const name = CK.Assets.has(nm) ? nm : 'koko_idle';
      if (CK.Assets.has(name)) this._img(name, x - KOKO.ax * k, Q.y - KOKO.ay * k - bob, wd, h);
      else { g.fillStyle = '#A9B1BC'; g.fillRect(x - 50, Q.y - h, 100, h); }
      void o;
    }
    _bee(B, a) {
      if (!B) return;
      const x = ip(B, 'x', a), y = ip(B, 'y', a), nm = (B.flap || 0) < 0.5 ? 'bee' : 'bee_up';
      this._sprite(CK.Assets.has(nm) ? nm : 'bee', x, y, 96, B.rot || 0, 1, null, (B.flip || 1) < 0);
    }
    _hintHand(H, w, D) {
      if (!H || !(H.alpha > 0.01) || !BA() || !BA().drawGhostHand) return;
      const g = this.g;
      if (H.press) {
        const p = w.pieceById ? w.pieceById(H.pieceId) : null;
        if (p) this._block(p.block, H.x, H.y + D.LH * 0.2, 0, 1, 1, D, { glow: 0.4 }, 0.35 * H.alpha);
      }
      g.save(); g.globalAlpha *= H.alpha; g.translate(H.x, H.y);
      try { BA().drawGhostHand(g, D.S * 0.85, H.t || 0); } catch (e) { }
      g.restore();
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }

    /* ---------- title & celebration ---------- */
    _miniCake(tx, baseTop, LW, LH, cols, t, opt) {   // a decorative cake on the stand (title / party)
      opt = opt || {};
      const D = { S: LW / 1.3, LW, LH };
      this._stand(tx, baseTop, LW + 60);
      const n = cols.length;
      for (let i = 0; i < n; i++) {
        const sway = Math.sin(t * 1.7 + i * 0.3) * 0.015 * (i + 1);
        const glow = opt.glow ? Math.max(0, Math.sin(t * 3 - i * 0.7)) * 0.6 : 0;
        this._block({ kind: 'color', value: cols[i], color: cols[i] }, tx + Math.sin(sway) * (i + 0.5) * LH, baseTop - LH / 2 - i * LH, sway, 1, 1, D, { glow, id: i * 3 + 1 }, 1);
      }
      const topY = baseTop - n * LH, g = this.g;
      if (opt.candles && BA() && BA().drawCandle) {
        for (let j = 0; j < opt.candles; j++) {
          const cx = tx + (opt.candles === 1 ? 0 : (j / (opt.candles - 1) - 0.5) * 0.7 * LW);
          g.save(); g.translate(cx, topY + 4); try { BA().drawCandle(g, 0.55 * LH, 1, 0, t + j * 0.37); } catch (e) { } g.restore();
        }
      }
      const bob = opt.float ? Math.sin(t * 2) * 3 : 0;
      const cb = opt.cloud ? topY - 100 + bob : topY + 4;   // the cherry's bottom
      if (opt.cloud && CK.Assets.has('cloud_candy')) this._img('cloud_candy', tx - 90, cb - 20, 180, 100);
      if (CK.Assets.has('cherry')) this._img('cherry', tx - 32, cb - 69, 64, 72);
      return topY;
    }
    _titleScene(w, o) {
      const L = this._L, W = this.W, H = this.H, portrait = H > W, ins = L.ins || {};
      const gy = H - (ins.bottom || 0) - (portrait ? 60 : 30);
      let LW = portrait ? 150 : 132;
      const tx = portrait ? W * 0.7 : W - (ins.right || 0) - Math.max(180, W * 0.16);
      const lg = o.boxes && o.boxes.logo;
      // keep the cake + cherry under the logo when it stands below it (iPad landscape)
      if (!portrait && lg && tx + LW * 0.6 > lg.x && tx - LW * 0.6 < lg.x + lg.w) LW = clamp(((gy - 72 - 130 - (lg.y + lg.h + 8)) / 3) / 0.6, 80, 132);
      this._miniCake(tx, gy - 72, LW, Math.round(LW * 0.6), ['red', 'yellow', 'blue'], this.time, { cloud: true, float: true });
      const lh = portrait ? 380 : Math.min(360, H * 0.54), k = lh / KOKO.h;
      const lx = portrait ? W * 0.26 : (ins.left || 0) + Math.max(150, W * 0.14);
      const hop = (this.time % 2.6) < 0.5 ? Math.sin((this.time % 2.6) / 0.5 * Math.PI) * 14 : 0;
      this._shadow(lx, gy + 2, KOKO.w * k * 0.55, 1);
      const nm = CK.Assets.has('koko_full_wave') ? 'koko_full_wave' : 'koko_happy';
      if (CK.Assets.has(nm)) this._img(nm, lx - KOKO.ax * k, gy - KOKO.ay * k - hop, KOKO.w * k, lh);
    }
    _doneScene(w, o, amb) {   // the rainbow party: sprinkles, a big rainbow cake with lit candles, Koko cheering
      const L = this._L, W = this.W, H = this.H, t = this.time, portrait = H > W, ins = L.ins || {};
      this._fwT -= o.dt || 0;
      if (this._fwT <= 0) { this._fwT = 0.9 + Math.random() * 0.7; this.burst('firework', W * (0.12 + Math.random() * 0.76), H * (0.1 + Math.random() * 0.25)); }
      const dp = o.boxes && o.boxes.done;
      const gy = portrait ? Math.min(H * 0.62, dp ? dp.y - 20 : H) : H - (ins.bottom || 0) - 30;
      const LW = portrait ? 140 : 120, LH = Math.round(LW * 0.6), tx = portrait ? W * 0.62 : (ins.left || 0) + Math.max(340, W * 0.34);
      this._miniCake(tx, gy - 64, LW, LH, ['red', 'orange', 'yellow', 'green', 'blue'], t, { glow: true, candles: 5 });
      const lh = portrait ? Math.min(340, gy - 120) : Math.min(360, H * 0.52), k = lh / KOKO.h;
      const lx = portrait ? (ins.left || 0) + 130 : tx - LW * 0.6 - KOKO.w * k * 0.42;
      const hop = Math.max(0, Math.sin(t * 4)) * 16;
      this._shadow(lx, gy + 2, KOKO.w * k * 0.55, 1);
      const nm = CK.Assets.has('koko_cheer') ? 'koko_cheer' : 'koko_idle';
      if (CK.Assets.has(nm)) this._img(nm, lx - KOKO.ax * k, gy - KOKO.ay * k - hop, KOKO.w * k, lh);
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
      g.fillStyle = 'rgba(90,50,60,.22)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFBF2'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#F2C6D8'; g.stroke();
      const I = CK.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#6a6a4a', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#B5547A', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#6a6a4a', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#B5547A', '#ffffff', 160);
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
        const sprites = opt.petals ? ['blossom', 'sugar'] : ['puff', 'sugar', 'blossom'];
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
      } else if (type === 'smoke') {   // candles go out: little grey curls drift up
        for (let i = 0; i < (opt.n || 4); i++) fx.push({ k: 'p', sprite: 'puff', tint: '#C9C4CF', x: x + (i - ((opt.n || 4) - 1) / 2) * (opt.gap || 26) + (R() - 0.5) * 6, y, vx: (R() - 0.5) * 20, vy: -60 - R() * 30,
          g: -20, drag: 1.2, t: 0, life: 1.1 + R() * 0.4, size: 22 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 2, sway: R() * TAU });
      } else if (type === 'breath') {   // Koko's blow: soft puffs travel from the lips to the cake top
        const tx = opt.tx == null ? x + 200 : opt.tx, ty = opt.ty == null ? y : opt.ty;
        for (let i = 0; i < 9; i++) { const k = 0.9 + R() * 0.5; fx.push({ k: 'p', sprite: 'puff', x, y: y + (R() - 0.5) * 10, vx: (tx - x) * k, vy: (ty - y) * k + (R() - 0.5) * 40, g: 0, drag: 1.0, t: -i * 0.06, life: 0.8, size: 18 + R() * 12, rot: 0, vr: 1 }); }
      } else if (type === 'flame') {   // a candle lights: one small warm flash
        fx.push({ k: 'flash', x, y, t: 0, life: 0.28, size: 34 });
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
      } else if (type === 'count') {   // a big numeral floats up while Koko counts
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
        } else if (f.k === 'flash') {
          g.strokeStyle = `rgba(255,250,220,${0.9 * (1 - u)})`; g.lineWidth = 8 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.25 + 0.6 * u), 0, TAU); g.stroke();
          g.fillStyle = `rgba(255,255,240,${0.55 * (1 - u) * (1 - u)})`; g.beginPath(); g.arc(f.x, f.y, f.size * 0.35 * (1 - u * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color || '255,240,150'},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.7 ? (1 - u) / 0.3 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 40); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#B5547A', '#FFFFFF', 200); g.restore();
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
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.a > 0.01)) continue;
        if (p.tint) this._tinted(p.kind, p.tint, p.x, p.y, p.s, p.rot || 0, p.a);
        else this._sprite(p.kind, p.x, p.y, p.s, p.rot || 0, p.a, null, !!p.flipX);
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
      const lb = (w.kokoHit && w.kokoHit()) || (w.luluHit && w.luluHit()); if (lb) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(lb.x - lb.w / 2, lb.y - lb.h / 2, lb.w, lb.h); }
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
    }
    /* A Talk-time picture (question or answer button): the same cake layer the child stacks. */
    drawItemBody(g, it, s) {
      const b = Object.assign({}, it.token || it);
      if (b.kind === 'stars') b.kind = 'dots';
      if (b.kind === 'number' && this._talkDots) b.showDots = b.n <= 10;
      const LW = s * 0.92, LH = LW * 0.6;
      g.save();
      if (BA()) { try { BA().drawBlock(g, b, LW, LH, { dpr: this.rs, img: imgOf, cache: false, id: 3 }); } catch (e) { this._placeholderBlock(g, b, { LW, LH }); } }
      else this._placeholderBlock(g, b, { LW, LH });
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
