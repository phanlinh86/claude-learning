/* RT.Render (Pip's Reef Tower) — draws the seabed on one canvas: the water gradient, the sun glow and light rays from the
 * surface, a rainbow above the waves, drifting light patches, the far / mid / ground reef layers of the weather
 * (crossfaded), the wavy surface band, the flat rock with the swaying shell tower (RT.World.blockPose), the starfish crown
 * on its little jellyfish, pearls, Pip the octopus, the choice blocks (RT.BlockArt) with their lift bubbles, bubble trails
 * and sand puffs, the puffer fish, the ghost-hand hint, the fish school, weather particles and juice. Logical coordinates (short side 720) × render scale `rs` = device pixels. No camera.
 * Missing art is tolerated (simple placeholders). */
(function (RT) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const FARFILL = { sunny: '#BFE3DC', breezy: '#BEDFD8', rain: '#9FB9BE', rainbow: '#C4E6DC' };
  const GROUNDFILL = { sunny: '#F1E2BE', breezy: '#F0E1BF', rain: '#D9CFB4', rainbow: '#F2E4C2' };
  const FISHC = ['#FF9A7A', '#FFD27A', '#8FD3F0', '#B9A3F0', '#FFB3D1', '#9FE3B4'];   // soft fish-school tints
  const PAL = c => (RT.PALETTE && RT.PALETTE[c]) || { base: c || '#ccc', dark: '#555', light: '#eee' };

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
  const PIP = { w: 300, h: 400, ax: 150, ay: 392 };
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null ? o[k] : p + (o[k] - p) * a; };
  const BA = () => RT.BlockArt;
  const imgOf = name => (RT.Assets && RT.Assets.images ? RT.Assets.images[name] || null : null);

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0; this._fwT = 0; this._pipDx = 0; this._talkT = 0;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      RT.Assets.dropExact();
    }
    prewarm(layout, level) {   // rasterise the big tiles of a time of day ahead of time
      const m = MOODS[clamp(level | 0, 0, 3)];
      for (const l of ['far', 'mid', 'ground']) { const d = this._layerDims(l); RT.Assets.exact(l + '_' + m, Math.round(d.w * this.rs), Math.round(d.h * this.rs)); }
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
      const W = this.W, H = this.H, portrait = H > W, groundY = H - (portrait ? 40 : 28), S = 124, LW = 139, LH = 99;
      const tx = portrait ? 0.58 * W : Math.max(0.42 * W, 400), baseTop = portrait ? groundY - LH - 150 : groundY - 96;
      return { W, H, portrait, ins: { top: 0, right: 0, bottom: 0, left: 0 }, groundY, S, LW, LH, tower: { x: tx, baseTop, baseW: LW + 60 },
        goalY: baseTop - 3 * LH - 8, pip: { x: portrait ? 110 : 120, y: portrait ? baseTop + 70 : groundY - 4, h: portrait ? 300 : 330 }, slots: [] };
    }

    /* ---------- backdrop: water, sun glow, rays, light patches, far / mid / ground reef (weather crossfade) ---------- */
    _layerDims(l) {   // env artist's recipe: bottom-anchored tiles, ×1.36 in portrait so the reef fills the tall water
      const W = this.W, H = this.H, portrait = H > W, k = portrait ? 1.36 : 1;
      const vh = l === 'far' ? 420 : l === 'mid' ? 380 : 260;
      const bottom = l === 'far' ? (portrait ? 0.72 : 0.76) : l === 'mid' ? (portrait ? 0.80 : 0.86) : 1.0;
      return { w: 1200 * k, h: vh * k, bottom: bottom * H + (l === 'ground' ? 2 : 0) };
    }
    _layer(l, from, to, mix) {
      const g = this.g, d = this._layerDims(l), W = this.W;
      const one = (m, al) => {
        if (al <= 0.01) return false;
        const tile = RT.Assets.exact(l + '_' + m, Math.round(d.w * this.rs), Math.round(d.h * this.rs));
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
      // the water: lighter near the surface, a deeper aqua towards the sand
      const sky = g.createLinearGradient(0, 0, 0, H * (portrait ? 0.78 : 0.85));
      sky.addColorStop(0, amb.skyTop || '#7FD0E3');
      if (amb.skyMid) sky.addColorStop(0.55, amb.skyMid);
      sky.addColorStop(1, amb.skyBottom || '#DDF4EC');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const ins = this._L.ins || {};
      const rbA = amb.rainbow || 0;
      if (rbA > 0.01 && RT.Assets.has('rainbow')) {   // a rainbow above the waves: only its lower part shows under the surface
        const rw = portrait ? 1.3 * W : 0.95 * W, rh = rw / 2, cx = (this._L.tower && this._L.tower.x) || W / 2;
        g.save(); g.globalAlpha = clamp(rbA, 0, 1) * 0.75; this._img('rainbow', cx - rw / 2, -rh * 0.45, rw, rh); g.restore();
      }
      const sunA = amb.sun || 0;
      const sx = W * (amb.sunX == null ? 0.22 : amb.sunX);
      if (sunA > 0.01) this._sprite('sun', sx, (ins.top || 0) + 30, portrait ? 260 : 230, 0, sunA * 0.9);
      this._rays(sx, sunA, amb);
      for (const c of weather.clouds || []) {   // drifting light patches / plankton haze (the weather still calls them clouds)
        if (!(c.alpha > 0.01)) continue;
        const nm = c.kind === 'rain' ? 'cloud_rain' : 'cloud_' + (c.kind || 'a');
        this._sprite(RT.Assets.has(nm) ? nm : 'cloud_a', c.x, c.y, 320 * (c.s || c.scale || 1) * (portrait ? 1.2 : 1), 0, clamp(c.alpha, 0, 1) * 0.35);
      }
      const farD = this._layerDims('far'), midD = this._layerDims('mid');
      if (!this._layer('far', from, to, mix)) { g.fillStyle = '#A9D6D2'; g.fillRect(0, farD.bottom - 160, W, 160); }
      g.fillStyle = FARFILL[to] || '#BFE3DC'; g.fillRect(0, farD.bottom - 1, W, H - farD.bottom + 1);
      if (!this._layer('mid', from, to, mix)) { g.fillStyle = '#E8D3B0'; g.fillRect(0, midD.bottom - 200, W, 200); }
      g.fillStyle = GROUNDFILL[to] || '#F1E2BE'; g.fillRect(0, midD.bottom - 2, W, H - midD.bottom + 2);
      this._layer('ground', from, to, mix);
      this._caustics(amb);
      this._surface(amb);
      // rain darkness + mood tint: full over the water, fading to ~25 % over the sand so the tray band keeps its warm colour
      // (visual QA P2-5: a grey sand ring had the luminance of the green / orange / pink blocks)
      const sandY = Math.min(H * (portrait ? 0.66 : 0.68), (this._L.groundY || H) - (this._L.LH || 99) * 1.1);
      const veil = (r, gg, b, al) => {
        if (!(al > 0.004)) return;
        const gr = g.createLinearGradient(0, sandY - 70, 0, sandY + 40);
        gr.addColorStop(0, `rgba(${r},${gg},${b},${al})`); gr.addColorStop(1, `rgba(${r},${gg},${b},${al * 0.25})`);
        g.fillStyle = gr; g.fillRect(0, 0, W, H);
      };
      if (amb.darkness > 0.01) veil(40, 70, 100, clamp(amb.darkness, 0, 0.5));
      if (amb.tint) {
        if (typeof amb.tint === 'string') { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
        else veil(amb.tint[0], amb.tint[1], amb.tint[2], amb.tint[3]);
      }
    }
    _rays(sx, sunA, amb) {   // soft light rays slanting down from the surface, gently swaying
      if (!(sunA > 0.02)) return;
      const g = this.g, W = this.W, H = this.H, t = this.time, rh = H * 0.95, rw = rh * 600 / 700;
      const sway = Math.sin(t * 0.35) * 0.04 + (amb.wind || 0) * 0.05;
      for (let i = 0; i < 2; i++) {
        const x = sx + (i ? W * 0.42 : 0) - rw * 0.2, a = sunA * (i ? 0.55 : 0.85) * (0.8 + 0.2 * Math.sin(t * 0.6 + i * 2));
        g.save(); g.globalAlpha = clamp(a, 0, 1); g.translate(x, 0); g.transform(1, 0, sway + 0.12, 1, 0, 0);
        if (RT.Assets.has('rays')) this._img('rays', -rw / 2, 0, rw, rh);
        else {
          const gr = g.createLinearGradient(0, 0, 0, rh); gr.addColorStop(0, 'rgba(255,255,240,.28)'); gr.addColorStop(1, 'rgba(255,255,240,0)');
          g.fillStyle = gr; for (let k = 0; k < 4; k++) { g.beginPath(); g.moveTo(-rw * 0.4 + k * rw * 0.22, 0); g.lineTo(-rw * 0.3 + k * rw * 0.22, 0); g.lineTo(-rw * 0.1 + k * rw * 0.26, rh); g.lineTo(-rw * 0.26 + k * rw * 0.26, rh); g.fill(); }
        }
        g.restore();
      }
    }
    _caustics(amb) {   // dancing light on the sand (cheap: a few soft wavy strokes, only when the quality allows)
      if (this.quality < 0.8 || !(amb.sun > 0.05)) return;
      const g = this.g, W = this.W, L = this._L, y0 = (L.groundY || this.H - 30) - 70, t = this.time;
      g.save(); g.strokeStyle = `rgba(255,255,235,${0.16 * clamp(amb.sun, 0, 1)})`; g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 9; i++) {
        const x = ((i * 173 + t * 14) % (W + 200)) - 100, y = y0 + (i % 3) * 26 + Math.sin(t * 1.3 + i) * 6;
        g.beginPath(); g.moveTo(x - 40, y); g.quadraticCurveTo(x - 10, y - 10 + Math.sin(t * 2 + i) * 6, x + 20, y + 2); g.quadraticCurveTo(x + 40, y + 8, x + 60, y - 2); g.stroke();
      }
      g.restore();
    }
    _surface(amb) {   // the wavy water surface band at the very top, scrolling slowly with the current
      const g = this.g, W = this.W, portrait = this.H > W, k = portrait ? 1.2 : 1, h = 90 * k, tw = 1200 * k;
      // landscape: the band is lifted (only its lower part shows) so a 5-shell tower's starfish stays clear of it (QA P3-5)
      const lift = portrait ? 0 : Math.round((W / this.H > 1.9 ? 34 : 18) * this.rs);
      const off = ((this.time * (12 + (amb.wind || 0) * 30)) % tw + tw) % tw;
      if (RT.Assets.has('surface')) {
        const tile = RT.Assets.exact('surface', Math.round(tw * this.rs), Math.round(h * this.rs));
        if (tile) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); for (let x = -off * this.rs; x < W * this.rs; x += tile.width) g.drawImage(tile, Math.round(x), -lift); g.restore(); return; }
      }
      g.save(); g.fillStyle = 'rgba(255,255,255,.25)'; g.beginPath(); g.moveTo(0, 0);
      for (let x = 0; x <= W; x += 20) g.lineTo(x, 14 + Math.sin((x + off) / 60) * 6);
      g.lineTo(W, 0); g.closePath(); g.fill(); g.restore();
    }

    /* ---------- the round ---------- */
    _dims() { const L = this._L, S = L.S || 124; return { S, LW: L.LW || Math.round(1.12 * S), LH: L.LH || Math.round(0.8 * S) }; }
    _game(w, o, a) {
      const g = this.g, L = this._L, D = this._dims(), T = w.tower || { x: L.tower.x, baseTop: L.tower.baseTop, blocks: [] };
      this._stand(T.x, T.baseTop, (L.tower && L.tower.baseW) || D.LW + 60);   // the flat seabed rock
      this._cloud(w, a);
      this._pip(w, o);
      // sandy shell trays under the second row of pieces
      const used = new Set((w.pieces || []).filter(p => p.state !== 'gone' && p.state !== 'out' && p.row === 1).map(p => p.slot));
      if (BA() && BA().drawPlate) for (let si = 0; si < (L.slots || []).length; si++) { const sl = L.slots[si]; if (sl.row !== 1 || !used.has(si)) continue; g.save(); g.translate(sl.x, sl.y + D.LH / 2); try { BA().drawPlate(g, D.LW * 1.25, D.LH * 0.3); } catch (e) { } g.restore(); }
      const order = w.drawOrder ? w.drawOrder() : (w.pieces || []);
      for (const p of order) if ((p.z || 0) <= 3) this._piece(w, p, a, D);
      this._tower(w, a, D);
      this._pearls(w, a, D);
      this._crown(w, a);
      this._bee(w.puffer, a);
      for (const p of order) if ((p.z || 0) > 3) this._piece(w, p, a, D);
      this._hintHand(w.hintHand, w, D);
    }
    _shadow(x, y, w, al) {
      const g = this.g; g.fillStyle = `rgba(90,60,30,${0.2 * (al == null ? 1 : al)})`; g.beginPath(); g.ellipse(x, y, w / 2, Math.max(4, w * 0.09), 0, 0, TAU); g.fill();
    }
    _stand(x, top, baseW) {
      const ks = baseW / 220, w = 260 * ks, h = 120 * ks;
      this._shadow(x, top + (116 - 18) * ks, w * 0.8, 1);
      if (RT.Assets.has('rock')) this._img('rock', x - 130 * ks, top - 18 * ks, w, h);
      else { const g = this.g; g.fillStyle = '#C9C3D6'; g.beginPath(); g.ellipse(x, top + 45 * ks, baseW / 2, 50 * ks, 0, 0, TAU); g.fill(); g.fillRect(x - baseW / 2, top, baseW, 45 * ks); }
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
      const c = PAL(b.color || 'yellow'); g.fillStyle = b.kind === 'color' ? c.base : '#F3DDB2'; g.strokeStyle = '#B98A4E'; g.lineWidth = 4;
      g.beginPath(); roundRect(g, -D.LW / 2, -D.LH / 2, D.LW, D.LH, D.LH * 0.2); g.fill(); g.stroke();
    }
    _piece(w, p, a, D) {
      if (p.state === 'gone') return;
      const x = ip(p, 'x', a), y = ip(p, 'y', a), rot = ip(p, 'rot', a) || 0, sc = p.scale || 1, al = p.alpha == null ? 1 : p.alpha;
      if (al <= 0.01) return;
      const small = p.block && p.block.size === 'small' ? 0.72 : 1;
      const bw = (p.bw || D.LW) * sc, bh = (p.bh || D.LH) * sc;
      const L = this._L, gy = (p.homeY != null ? p.homeY + (p.bh || D.LH) / 2 + 2 : L.groundY - 6);
      const lift = clamp((gy - (y + bh / 2)) / 260, 0, 1);
      if (p.state !== 'fall' || lift < 0.98) this._shadow(x, gy, bw * small * (0.95 - 0.45 * lift), al * (1 - 0.6 * lift) * 1.6);
      // a soft dark halo around the shell silhouette so pale blocks (yellow) pop on the sunny sand (visual QA P3-1)
      const halo = !(p.glow > 0.01);
      if (halo) { this.g.save(); this.g.shadowColor = 'rgba(70,45,10,0.55)'; this.g.shadowBlur = 5 * this.rs; this.g.shadowOffsetY = 1.5 * this.rs; }
      this._block(p.block, x, y, rot, p.sx, p.sy, { S: D.S, LW: D.LW * sc, LH: D.LH * sc }, { glow: p.glow || 0, lift: p.state === 'drag' || p.state === 'lift' ? 1 : 0, id: p.block && p.block.id != null ? p.block.id : p.id }, al);
      if (halo) this.g.restore();
      const bub = p.bubble != null ? +p.bubble : (p.state === 'lift' ? 1 : 0);
      if (bub > 0.01) this._liftBubble(x, y, Math.hypot(bw * small, bh * small) * 0.56 + 10, bub * al);
    }
    _liftBubble(x, y, r, a) {   // the big bubble that carries a tapped block up over the tower
      const g = this.g, wob = Math.sin(this.time * 9) * 0.03;
      g.save(); g.translate(x, y); g.scale(1 + wob, 1 - wob);
      if (BA() && BA().drawBubble) { try { BA().drawBubble(g, r, clamp(a, 0, 1)); g.restore(); return; } catch (e) { } }
      g.globalAlpha *= clamp(a, 0, 1);
      g.fillStyle = 'rgba(220,250,255,.16)'; g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3;
      g.beginPath(); g.arc(0, 0, r, 0, TAU); g.fill(); g.stroke();
      g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = 5; g.lineCap = 'round';
      g.beginPath(); g.arc(0, 0, r * 0.78, Math.PI * 1.08, Math.PI * 1.38); g.stroke();
      g.restore();
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
      this._jelly(C.x, C.y, s, (w.goal && w.goal.pulse != null) ? w.goal.pulse : null);
      g.restore();
    }
    _jelly(x, y, s, pulse) {   // the little jellyfish the starfish rides on; (x, y) = top-centre of its bell
      const g = this.g, k = 150 / 200 * s;
      const ph = pulse == null ? (Math.sin(this.time * TAU * 0.9) * 0.5 + 0.5) : clamp(pulse, 0, 1);
      const sx = 1 + 0.05 * ph, sy = 1 - 0.07 * ph;
      g.save(); g.translate(x, y); g.scale(sx, sy);
      if (RT.Assets.has('jelly_ride')) this._img('jelly_ride', -100 * k, -30 * k, 200 * k, 200 * k);
      else {
        g.fillStyle = '#F6D3EA'; g.beginPath(); g.ellipse(0, 30 * k, 70 * k, 42 * k, 0, Math.PI, 0); g.fill();
        g.strokeStyle = '#E2AACB'; g.lineWidth = 5 * k; for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 22 * k, 34 * k); g.quadraticCurveTo(i * 22 * k + 10 * k, 80 * k, i * 22 * k, 120 * k); g.stroke(); }
      }
      g.restore();
    }
    _crown(w, a) {
      const C = w.crownPose ? w.crownPose(a) : null; if (!C || !(C.alpha > 0.01)) return;
      const g = this.g, h = 72, wd = 64;
      g.save(); g.globalAlpha *= clamp(C.alpha, 0, 1); g.translate(C.x, C.y); if (C.rot) g.rotate(C.rot); g.scale(C.sx || 1, C.sy || 1);
      if (RT.Assets.has('crown')) this._img('crown', -40 * wd / 80, -86 * h / 90, wd, h);
      else { g.fillStyle = '#F5B83D'; g.translate(0, -h * 0.45); starPath(g, h * 0.45); g.fill(); }
      g.restore();
    }
    _pearls(w, a, D) {
      if (!w.pearls || !w.pearlPose || !BA() || !BA().drawPearl) return;
      const g = this.g, h = 0.55 * D.LH;
      const lean = clamp((w.blowT || 0) * 0.6 + (w.breeze || 0) * 0.15, 0, 0.8);
      for (let j = 0; j < w.pearls.length; j++) {
        const P = w.pearlPose(j, a); if (!P || !(P.alpha > 0.01)) continue;
        g.save(); g.globalAlpha *= clamp(P.alpha, 0, 1); g.translate(P.x, P.y); g.rotate((P.rot || 0) + lean * 0.15);
        try { BA().drawPearl(g, (P.h || w.pearlH || h) * (P.s || 1), P.lit || 0, P.out || 0, this.time + j * 0.37); } catch (e) { }
        g.restore();
      }
    }
    _pipFrame(w) {
      const m = (w.pip && w.pip.mood) || 'idle';
      if (m === 'idle' || m === 'talk') {
        if (this._blinking(this._dt)) return 'pip_blink';
        if (this._speaking || m === 'talk') { this._talkT += this._dt; return (this._talkT % 0.3) < 0.15 ? 'pip_talk' : 'pip_idle'; }
        return 'pip_idle';
      }
      return 'pip_' + m;
    }
    _pip(w, o) {
      const L = this._L, Q = L.pip || L.lulu; if (!Q) return;
      const g = this.g, h = Q.h, k = h / PIP.h, wd = PIP.w * k, D = this._dims();
      const nm = this._pipFrame(w);
      // hold: Pip scoots to the tower so her arm tips touch it (the art's arm tips are at x ≈ 290)
      let want = 0;
      if (nm === 'pip_hold' && L.tower) want = clamp(L.tower.x - D.LW / 2 - 2 - (Q.x + (290 - PIP.ax) * k), 0, 380);
      this._pipDx += (want - this._pipDx) * clamp((this._dt || 0) * 4, 0, 1);
      const x = Q.x + this._pipDx;
      const cheer = nm === 'pip_cheer' || nm === 'pip_happy';
      const walking = Math.abs(want - this._pipDx) > 4;
      // under water Pip floats: a slow buoyant bob, a little bounce when cheering, a swim pulse when scooting
      const bob = cheer ? Math.abs(Math.sin(this.time * 6)) * 10 : walking ? Math.abs(Math.sin(this.time * 9)) * 9 : 3 + Math.sin(this.time * 1.4) * 4;
      this._shadow(x, Q.y + 2, wd * 0.55, 1);
      const name = RT.Assets.has(nm) ? nm : 'pip_idle';
      if (RT.Assets.has(name)) this._img(name, x - PIP.ax * k, Q.y - PIP.ay * k - bob, wd, h);
      else { g.fillStyle = '#F6B08E'; g.beginPath(); g.ellipse(x, Q.y - h * 0.6, h * 0.3, h * 0.33, 0, 0, TAU); g.fill(); }
      void o;
    }
    _bee(B, a) {
      if (!B) return;
      const x = ip(B, 'x', a), y = ip(B, 'y', a), puff = clamp(B.puff != null ? +B.puff : 0, 0, 1);
      const nm = puff > 0.5 ? 'puffer_up' : 'puffer', wig = Math.sin(this.time * 5) * 0.06 * (1 - puff);
      const size = 110 * (1 + 0.3 * puff) * (B.s || 1);
      if (RT.Assets.has(nm) || RT.Assets.has('puffer')) this._sprite(RT.Assets.has(nm) ? nm : 'puffer', x, y, size, (B.rot || 0) + wig, B.alpha == null ? 1 : B.alpha, null, (B.flip || -1) > 0);
      else { const g = this.g; g.fillStyle = '#E8E2A4'; g.beginPath(); g.arc(x, y, size * 0.35, 0, TAU); g.fill(); }
      if (puff < 0.3 && Math.random() < (this._dt || 0) * 1.5) this.burst('trail', x - 40 * ((B.flip || -1) > 0 ? 1 : -1), y - 10, { n: 1 });
    }
    _hintHand(H, w, D) {
      if (!H || !(H.alpha > 0.01) || !BA() || !BA().drawGhostHand) return;
      const g = this.g;
      if (H.press) {
        const p = w.pieceById ? w.pieceById(H.pieceId) : null;
        if (p) this._block(p.block, H.x, H.y + D.LH * 0.2, 0, 1, 1, D, { glow: 0.4 }, 0.35 * H.alpha);
      }
      const tapBob = (H.tap || !H.press) ? -Math.abs(Math.sin((H.t || this.time) * 5)) * 16 : 0;   // the hand TAPS the right block
      g.save(); g.globalAlpha *= H.alpha; g.translate(H.x, H.y + tapBob);
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
    _miniTower(tx, baseTop, LW, LH, cols, t, opt) {   // a decorative shell tower on the rock (title / party)
      opt = opt || {};
      const D = { S: LW / 1.12, LW, LH };
      this._stand(tx, baseTop, LW + 60);
      const n = cols.length;
      for (let i = 0; i < n; i++) {
        const sway = Math.sin(t * 1.7 + i * 0.3) * 0.015 * (i + 1);
        const glow = opt.glow ? Math.max(0, Math.sin(t * 3 - i * 0.7)) * 0.6 : 0;
        this._block({ kind: 'color', value: cols[i], color: cols[i] }, tx + Math.sin(sway) * (i + 0.5) * LH, baseTop - LH / 2 - i * LH, sway, 1, 1, D, { glow, id: i * 3 + 1 }, 1);
      }
      const topY = baseTop - n * LH, g = this.g;
      if (opt.pearls && BA() && BA().drawPearl) {
        for (let j = 0; j < opt.pearls; j++) {
          const cx = tx + (opt.pearls === 1 ? 0 : (j / (opt.pearls - 1) - 0.5) * 0.7 * LW);
          g.save(); g.translate(cx, topY + 4); try { BA().drawPearl(g, 0.55 * LH, 1, 0, t + j * 0.37); } catch (e) { } g.restore();
        }
      }
      const bob = opt.float ? Math.sin(t * 2) * 3 : 0;
      const cb = opt.cloud ? topY - 110 + bob : topY + 4;   // the crown's bottom
      if (opt.cloud) this._jelly(tx, cb - 18, 1, null);
      if (RT.Assets.has('crown')) this._img('crown', tx - 32, cb - 69, 64, 72);
      return topY;
    }
    _titleScene(w, o) {
      const L = this._L, W = this.W, H = this.H, portrait = H > W, ins = L.ins || {};
      const gy = H - (ins.bottom || 0) - (portrait ? 60 : 30);
      let LW = portrait ? 150 : 132;
      const tx = portrait ? W * 0.7 : W - (ins.right || 0) - Math.max(180, W * 0.16);
      const lg = o.boxes && o.boxes.logo;
      // keep the tower + starfish under the logo when it stands below it (iPad landscape)
      if (!portrait && lg && tx + LW * 0.6 > lg.x && tx - LW * 0.6 < lg.x + lg.w) LW = clamp(((gy - 72 - 150 - (lg.y + lg.h + 8)) / 3) / 0.71, 80, 132);
      this._miniTower(tx, gy - 72, LW, Math.round(LW * 0.71), ['red', 'yellow', 'blue'], this.time, { cloud: true, float: true });
      const lh = portrait ? 380 : Math.min(360, H * 0.54), k = lh / PIP.h;
      const lx = portrait ? W * 0.26 : (ins.left || 0) + Math.max(150, W * 0.14);
      const hop = (this.time % 2.6) < 0.5 ? Math.sin((this.time % 2.6) / 0.5 * Math.PI) * 14 : 0;
      this._shadow(lx, gy + 2, PIP.w * k * 0.55, 1);
      const nm = RT.Assets.has('pip_full_wave') ? 'pip_full_wave' : 'pip_happy';
      if (RT.Assets.has(nm)) this._img(nm, lx - PIP.ax * k, gy - PIP.ay * k - hop, PIP.w * k, lh);
    }
    _doneScene(w, o, amb) {   // the rainbow party: fish and bubbles, a big rainbow shell tower with lit pearls, Pip cheering
      const L = this._L, W = this.W, H = this.H, t = this.time, portrait = H > W, ins = L.ins || {};
      this._fwT -= o.dt || 0;
      if (this._fwT <= 0) { this._fwT = 0.9 + Math.random() * 0.7; this.burst(Math.random() < 0.5 ? 'firework' : 'bubbles', W * (0.12 + Math.random() * 0.76), H * (0.15 + Math.random() * 0.3), { n: 8 }); }
      const dp = o.boxes && o.boxes.done;
      const gy = portrait ? Math.min(H * 0.62, dp ? dp.y - 20 : H) : H - (ins.bottom || 0) - 30;
      const LW = portrait ? 130 : 110, LH = Math.round(LW * 0.71), tx = portrait ? W * 0.62 : (ins.left || 0) + Math.max(340, W * 0.34);
      this._miniTower(tx, gy - 64, LW, LH, ['red', 'orange', 'yellow', 'green', 'blue'], t, { glow: true, pearls: 5 });
      const lh = portrait ? Math.min(340, gy - 120) : Math.min(360, H * 0.52), k = lh / PIP.h;
      const lx = portrait ? (ins.left || 0) + 130 : tx - LW * 0.6 - PIP.w * k * 0.56;   // QA P2-6: the raised arm clears the tower
      const hop = Math.max(0, Math.sin(t * 4)) * 16;
      this._shadow(lx, gy + 2, PIP.w * k * 0.55, 1);
      const nm = RT.Assets.has('pip_cheer') ? 'pip_cheer' : 'pip_idle';
      if (RT.Assets.has(nm)) this._img(nm, lx - PIP.ax * k, gy - PIP.ay * k - hop, PIP.w * k, lh);
      void amb;
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((RT.CONFIG && RT.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * 0.42;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(20,60,80,.22)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFBF2'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#9ED8E0'; g.stroke();
      const I = RT.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#6a6a4a', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#1F6F86', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#6a6a4a', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#1F6F86', '#ffffff', 160);
      }
      g.restore();
    }

    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 260) fx.splice(0, fx.length - 260);
      const R = Math.random;
      const colOf = c => (c && RT.PALETTE && RT.PALETTE[c]) ? RT.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
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
      } else if (type === 'rustle' || type === 'leaves') {
        for (let i = 0; i < 6; i++) this._bub(x + (R() - 0.5) * (opt.size || 120) * 0.6, y + (R() - 0.5) * 30, 4 + R() * 7, -80 - R() * 70, 1.2 + R() * 0.5);
        if (!opt.leaves) return;   // a puff of leaves / snow / petals off a hiding place
        const sprites = opt.petals ? ['blossom', 'sugar'] : ['puff', 'sugar', 'blossom'];
        const n = Math.round((opt.n || 8) * this.quality);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.4, sp = 90 + R() * 160;
          const spr = sprites[i % sprites.length];
          fx.push({ k: 'p', sprite: RT.Assets.has(spr) ? spr : 'puff', tint: null, x: x + (R() - 0.5) * (opt.size || 120) * 0.6, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            g: 260, drag: 1.6, t: 0, life: 0.7 + R() * 0.5, size: 16 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'land' || type === 'sand') {   // a soft puff of sand + two little bubbles escaping
        const n = Math.round((type === 'sand' ? 8 : 5) * Math.max(0.5, this.quality)), wd = opt.w || 60;
        for (let i = 0; i < n; i++) fx.push({ k: 'p', sprite: 'puff', tint: '#EAD7AE', x: x + (R() - 0.5) * wd, y: y - 4, vx: (R() < 0.5 ? -1 : 1) * (40 + R() * 70), vy: -15 - R() * 30, g: 0, drag: 2.2, t: 0, life: 0.6 + R() * 0.3, size: 18 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 2 });
        for (let i = 0; i < 2; i++) this._bub(x + (R() - 0.5) * wd, y - 10, 4 + R() * 4, -60 - R() * 40, 1.2);
      } else if (type === 'trail') {   // a sinking / lifting block leaves little bubbles behind
        for (let i = 0; i < (opt.n || 2); i++) this._bub(x + (R() - 0.5) * (opt.w || 30), y + (R() - 0.5) * 10, 3 + R() * 5, -40 - R() * 60, 0.9 + R() * 0.5);
      } else if (type === 'bubblepop') {   // the lift bubble pops
        fx.push({ k: 'ring', x, y, t: 0, life: 0.28, size: opt.size || 120, color: '255,255,255' });
        for (let i = 0; i < 8; i++) { const a = R() * TAU, r0 = (opt.size || 120) * 0.45; this._bub(x + Math.cos(a) * r0, y + Math.sin(a) * r0, 3 + R() * 4, -30 - R() * 50, 0.7, Math.cos(a) * 60); }
      } else if (type === 'bubbles') {   // a cluster of bubbles rising (pearls float away, party)
        for (let i = 0; i < (opt.n || 10); i++) this._bub(x + (R() - 0.5) * (opt.w || 80), y + (R() - 0.5) * 20, 5 + R() * 9, -70 - R() * 80, 1.6 + R() * 0.8);
      } else if (type === 'fish') {   // the fish school swirls around the finished tower, then swims away
        const n = Math.round((opt.n || 12) * Math.max(0.6, this.quality)), rx = opt.rx || 170, ry = opt.ry || 120;
        for (let i = 0; i < n; i++) fx.push({ k: 'fish', cx: x, cy: y, rx: rx * (0.75 + R() * 0.5), ry: ry * (0.7 + R() * 0.6), a: i / n * TAU + R() * 0.3, w: (1.6 + R() * 0.6) * (opt.dir || 1),
          t: -i * 0.04, life: 2.6 + R() * 0.5, len: (opt.len || 44) + R() * 10, color: FISHC[i % FISHC.length], x, y, rot: 0 });
      } else if (type === 'sparkles') {   // white sparkles + bubbles (no gold stars: they read as extra starfish — QA P3-3)
        for (let i = 0; i < 16; i++) {
          const a = R() * TAU, sp = 100 + R() * 240;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, g: 160, t: 0, life: 0.8 + R() * 0.5, size: 18 + R() * 12, rot: R() * TAU, vr: 5 });
        }
        for (let i = 0; i < 10; i++) { const a = R() * TAU, r0 = 20 + R() * 50; this._bub(x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.6, 4 + R() * 7, -70 - R() * 70, 1.1 + R() * 0.6, Math.cos(a) * 50); }
      } else if (type === 'smoke') {   // the pearls float away: each leaves a little bubble cluster
        for (let i = 0; i < (opt.n || 4); i++) { const px = x + (i - ((opt.n || 4) - 1) / 2) * (opt.gap || 26); for (let j = 0; j < 3; j++) this._bub(px + (R() - 0.5) * 14, y - j * 8, 4 + R() * 6, -80 - R() * 50, 1.4 + R() * 0.4); }
      } else if (type === 'breath') {   // Pip blows a stream of bubbles from her lips to the tower top
        const tx = opt.tx == null ? x + 200 : opt.tx, ty = opt.ty == null ? y : opt.ty;
        for (let i = 0; i < 16; i++) { const k = 0.8 + R() * 0.6; fx.push({ k: 'bub', x, y: y + (R() - 0.5) * 10, vx: (tx - x) * k * 1.2, vy: (ty - y) * k + (R() - 0.5) * 40 - 20, rise: -40, drag: 1.4, t: -i * 0.04, life: 1.1, r: 4 + R() * 8, sway: R() * TAU }); }
      } else if (type === 'flame') {   // a pearl lights: one small soft flash
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
      } else if (type === 'confetti') {   // the party under water: confetti drifts DOWN slowly, bubbles rise, fish swim through
        const n = Math.round(70 * this.quality);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * 0.4, vx: (R() - 0.5) * 40, vy: 30 + R() * 60,
            g: 12, drag: 0.8, t: 0, life: 6 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 4, sway: R() * TAU });
        }
        for (let i = 0; i < Math.round(40 * this.quality); i++) this._bub(R() * this.W, this.H + 10 + R() * 200, 5 + R() * 10, -90 - R() * 90, 5 + R() * 2);
        for (let i = 0; i < 2; i++) this.burst('fish', this.W * (0.3 + 0.4 * i), this.H * 0.42, { n: 9, rx: this.W * 0.3, ry: this.H * 0.18, dir: i ? -1 : 1 });
      } else if (type === 'hint') {
        const r0 = (opt.size || 110) * 0.6;
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; fx.push({ k: 'p', sprite: 'sparkle', x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 * 0.6, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20, g: 0, t: 0, life: 0.9, size: 22, rot: 0, vr: 3 }); }
      } else if (type === 'wrong') {
        fx.push({ k: 'ring', x, y, t: 0, life: 0.35, size: (opt.size || 110) * 1.1, color: '255,255,255' });
      } else if (type === 'count') {   // a big numeral floats up while Pip counts
        fx.push({ k: 'num', x, y, t: 0, life: 0.85, text: String(opt.n || '') });
      }
    }
    _bub(x, y, r, vy, life, vx) {   // a little rising bubble (drawn by code, no asset needed)
      if (this.fx.length > 300) return;
      this.fx.push({ k: 'bub', x, y, vx: vx || 0, vy, rise: -30, drag: 1.2, t: 0, life, r, sway: Math.random() * TAU });
    }
    _drawBub(x, y, r, al) {
      const g = this.g;
      g.globalAlpha = al;
      g.fillStyle = 'rgba(235,252,255,.22)'; g.strokeStyle = 'rgba(255,255,255,.9)'; g.lineWidth = Math.max(1.2, r * 0.22);
      g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = 'rgba(255,255,255,.95)'; g.beginPath(); g.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    _drawFish(x, y, len, color, rot) {
      const g = this.g;
      g.save(); g.translate(x, y); g.rotate(rot);
      if (BA() && BA().drawSprinkle) { try { BA().drawSprinkle(g, len, color, 0); g.restore(); return; } catch (e) { } }
      g.fillStyle = color; g.beginPath(); g.ellipse(0, 0, len * 0.5, len * 0.3, 0, 0, TAU); g.fill();
      g.beginPath(); g.moveTo(-len * 0.4, 0); g.lineTo(-len * 0.75, -len * 0.25); g.lineTo(-len * 0.75, len * 0.25); g.closePath(); g.fill();
      g.fillStyle = '#2F2A3A'; g.beginPath(); g.arc(len * 0.25, -len * 0.05, len * 0.06, 0, TAU); g.fill();
      g.restore();
    }
    _fx(dt) {
      const g = this.g, fx = this.fx;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t += dt;
        if (f.t < 0) continue;
        const u = f.t / f.life;
        if (u >= 1) { if (f.onDone) f.onDone(); fx.splice(i, 1); continue; }
        if (f.k === 'bub') {
          f.vy += (f.rise || 0) * dt; f.vx *= 1 - (f.drag || 0) * dt; f.sway += dt * 4;
          f.x += (f.vx + Math.sin(f.sway) * 18) * dt; f.y += f.vy * dt;
          this._drawBub(f.x, f.y, f.r * (1 + u * 0.15), (u > 0.75 ? (1 - u) / 0.25 : 1) * (u < 0.1 ? u / 0.1 : 1));
          continue;
        }
        if (f.k === 'fish') {
          const prevX = f.x, prevY = f.y;
          f.a += f.w * dt;
          const away = clamp((u - 0.72) / 0.28, 0, 1), k = 1 + away * away * 3.5;
          f.x = f.cx + Math.cos(f.a) * f.rx * k; f.y = f.cy + Math.sin(f.a) * f.ry * k - away * 160 + Math.sin(f.t * 9 + f.a) * 3;
          if (f.t > 0.02) f.rot = Math.atan2(f.y - prevY, f.x - prevX);
          g.save(); g.globalAlpha = (u > 0.85 ? (1 - u) / 0.15 : 1) * clamp(f.t / 0.15, 0, 1);
          this._drawFish(f.x, f.y, f.len, f.color, f.rot); g.restore();
          continue;
        }
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
          // white numeral, teal outline, in a small bubble: never mistaken for the dark-teal numerals ON the blocks (QA P2-2)
          const R0 = 38;
          g.fillStyle = 'rgba(31,111,134,.55)'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 4;
          g.beginPath(); g.arc(0, 0, R0, 0, TAU); g.fill(); g.stroke();
          g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(-R0 * 0.45, -R0 * 0.45, R0 * 0.16, 0, TAU); g.fill();
          outlinedText(g, f.text, 0, 3, 54, '#FFFFFF', '#1F6F86', R0 * 1.7); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          const sz = f.size * (1 - 0.5 * u);
          g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(x, y, sz * 0.62, 0, TAU); g.fill();
          this._sprite('star', x, y, sz, u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = RT.Assets.tinted ? RT.Assets.tinted(name, color, size * this.rs) : RT.Assets.sprite(name, size * this.rs);
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
      const spr = RT.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = RT.Assets.sprite(name, Math.max(w, h) * this.rs * 1.5);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      for (const p of w.pieces || []) { const b = w.pieceHit && w.pieceHit(p.id); if (b) g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); }
      if (L.drop) { g.strokeStyle = 'rgba(0,160,0,.7)'; g.strokeRect(L.drop.x0, 0, L.drop.x1 - L.drop.x0, L.drop.y1); }
      const lb = (w.pipHit && w.pipHit()) || (w.luluHit && w.luluHit()); if (lb) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(lb.x - lb.w / 2, lb.y - lb.h / 2, lb.w, lb.h); }
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
    }
    /* A Talk-time picture (question or answer button): the same shell block the child stacks. */
    drawItemBody(g, it, s) {
      const b = Object.assign({}, it.token || it);
      if (b.kind === 'stars') b.kind = 'dots';
      if (b.kind === 'number' && this._talkDots) b.showDots = b.n <= 10;
      const LW = s * 0.92, LH = LW * 0.66;
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
    const r = RT.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, Math.min(ch * 0.95, cw * 0.95));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  RT.Renderer = Renderer;
})(window.RT = window.RT || {});
