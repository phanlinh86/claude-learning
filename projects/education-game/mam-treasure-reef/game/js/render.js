/* TR.Render — draws the reef (water, light shafts, sun/moon, plankton), the sand layers, chests, sand mounds with treasure
 * poking out, treasures, Tutu, the photobomb fish, the dancing crab and all the juice on one canvas.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels.
 * Performance: the static landscape (far + mid + ground) is composed once per resize/chapter into a canvas at
 * backing-store size and blitted pixel-exact; sprites come pre-rasterized from TR.Assets; entity positions are
 * interpolated between fixed simulation steps (world.alpha).
 *
 * Dig-mode drawing contract (see world.js header): mounds keep x (centre), y (bottom), w, h; a buried item's top 42 % pokes
 * above the mound top; the mound sprite is drawn AFTER buried/peeking items so it hides the rest. */
(function (TR) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const INK = '#3d3a52';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };

  function pal(key) {
    const P = TR.PALETTE || {};
    const p = P[key];
    if (p) return { fill: p.fill || p.hex || p[0] || '#ccc', dark: p.dark || p[1] || '#666' };
    const fb = { red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'], green: ['#4CC26B', '#2A8343'],
      orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'], cream: ['#FFF4DC', '#C9A877'] }[key] || ['#ddd', '#777'];
    return { fill: fb[0], dark: fb[1] };
  }

  /* ---------- procedural shapes (unit size: fits in a 1×1 box centred on 0,0) ---------- */
  function shapePath(g, shape, s) {
    const r = s / 2;
    g.beginPath();
    switch (shape) {
      case 'circle': g.arc(0, 0, r * 0.92, 0, TAU); break;
      case 'square': roundRect(g, -r * 0.84, -r * 0.84, r * 1.68, r * 1.68, r * 0.22); break;
      case 'rectangle': roundRect(g, -r * 0.98, -r * 0.6, r * 1.96, r * 1.2, r * 0.18); break;
      case 'triangle': {
        const h = r * 1.8, top = -r * 0.98, bot = top + h * 0.95, rr = r * 0.16;
        roundPoly(g, [[0, top], [r * 1.0, bot], [-r * 1.0, bot]], rr); break;
      }
      case 'star': {
        const pts = [];
        for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.46 : r * 1.0; pts.push([Math.cos(a) * rad, Math.sin(a) * rad + r * 0.06]); }
        roundPoly(g, pts, r * 0.08); break;
      }
      case 'heart': {
        const k = r * 1.02;
        g.moveTo(0, k * 0.86);
        g.bezierCurveTo(-k * 1.25, k * 0.05, -k * 0.9, -k * 1.0, 0, -k * 0.42);
        g.bezierCurveTo(k * 0.9, -k * 1.0, k * 1.25, k * 0.05, 0, k * 0.86);
        break;
      }
      default: g.arc(0, 0, r * 0.9, 0, TAU);
    }
    g.closePath();
  }
  function roundRect(g, x, y, w, h, r) {
    g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r);
  }
  function roundPoly(g, pts, r) {
    const n = pts.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    const s = mid(pts[n - 1], pts[0]);
    g.moveTo(s[0], s[1]);
    for (let i = 0; i < n; i++) { const p = pts[i], q = pts[(i + 1) % n]; g.arcTo(p[0], p[1], q[0], q[1], r); }
  }
  /* Filled, outlined, cel-shaded "gem" shape */
  function drawShape(g, shape, color, s, opts) {
    const p = typeof color === 'string' && color[0] === '#' ? { fill: color, dark: '#7a5a3a' } : pal(color);
    const lw = Math.max(2, s * 0.05);
    g.save();
    shapePath(g, shape, s);
    g.fillStyle = p.fill; g.fill();
    if (!(opts && opts.flat)) {
      g.save(); g.clip();
      g.fillStyle = 'rgba(0,0,0,.13)'; g.beginPath(); g.ellipse(s * 0.3, s * 0.42, s * 0.75, s * 0.45, -0.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.42)'; g.beginPath(); g.ellipse(-s * 0.2, -s * 0.24, s * 0.2, s * 0.11, -0.6, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(-s * 0.28, -s * 0.3, s * 0.045, 0, TAU); g.fill();   // gem glint
      g.restore();
    }
    shapePath(g, shape, s);
    g.lineJoin = 'round'; g.lineWidth = lw; g.strokeStyle = p.dark; g.stroke();
    g.restore();
  }

  function fitText(g, text, maxW, px, weight) {
    let f = px;
    g.font = `${weight || 900} ${f}px ${FONT}`;
    let w = g.measureText(text).width;
    if (w > maxW) { f = Math.max(8, f * maxW / w); g.font = `${weight || 900} ${f}px ${FONT}`; }
    return f;
  }
  function outlinedText(g, text, x, y, px, fill, stroke, maxW) {
    fitText(g, text, maxW || 9999, px);
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.lineJoin = 'round';
    if (stroke) { g.lineWidth = Math.max(3, px * 0.16); g.strokeStyle = stroke; g.strokeText(text, x, y); }
    g.fillStyle = fill; g.fillText(text, x, y);
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.land = null; this.landKey = ''; this.time = 0;
      this.quality = 1; this.hudStar = { x: 900, y: 40 }; this.hudPearl = { x: 800, y: 40 };
      this._blinkT = 2; this._blink = 0;
      this.actors = [];   // photobomb fish, dancing crab
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      this.landKey = ''; TR.Assets.dropExact();
    }

    /* ---------- static landscape ---------- */
    _landscape(layout, level) {
      const key = this.W + 'x' + this.H + '@' + this.rs + ':' + (level | 0) + ':' + layout.groundY;
      if (key === this.landKey && this.land) return this.land;
      const rs = this.rs, bw = this.canvas.width, bh = this.canvas.height;
      const c = this.land && this.land.width === bw && this.land.height === bh ? this.land : TR.Assets.makeCanvas(bw, bh);
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, bw, bh);
      const gy = layout.groundY;
      const k = this._layerScale(layout);
      const groundTop = gy - 30 - 40 * k, midBottom = gy - 10, farBottom = gy - 120;
      const layers = [
        { n: 'far', w: 1200 * k, h: 420 * k, bottom: farBottom, off: 0.15 * 1300 * level },
        { n: 'mid', w: 1200 * k, h: 360 * k, bottom: midBottom, off: 0.35 * 1300 * level },
        { n: 'ground', w: 1200 * k, h: 260 * k, bottom: groundTop + 260 * k, off: 0 }
      ];
      for (const L of layers) {
        const tw = Math.round(L.w * rs), th = Math.round(L.h * rs);
        const tile = TR.Assets.exact(L.n, tw, th);
        if (!tile) continue;
        const y = Math.round((L.bottom - L.h) * rs);
        let x = -Math.round(((L.off % L.w) + L.w) % L.w * rs);
        for (; x < bw; x += tw) g.drawImage(tile, x, y);
        if (L.n === 'ground' && y + th < bh) { g.fillStyle = '#E3C98E'; g.fillRect(0, y + th - 2, bw, bh - (y + th) + 2); }
      }
      this.land = c; this.landKey = key;
      return c;
    }
    _layerScale(layout) { return layout && layout.H > layout.W * 1.6 ? 1.36 : 1; }
    prewarm(layout) {
      const rs = this.rs, k = this._layerScale(layout);
      TR.Assets.exact('far', Math.round(1200 * k * rs), Math.round(420 * k * rs));
      TR.Assets.exact('mid', Math.round(1200 * k * rs), Math.round(360 * k * rs));
      TR.Assets.exact('ground', Math.round(1200 * k * rs), Math.round(260 * k * rs));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, W = this.W, H = this.H;
      this.lang = o.lang || 'en';
      this.time += o.dt || 0;
      const layout = world.layout;
      const amb = weather.ambient || {};
      g.setTransform(rs, 0, 0, rs, 0, 0);

      this._water(world, weather, amb, layout);
      for (const c of weather.clouds || []) this._sprite(c.sprite, c.x, c.y, 300 * (c.scale || 1), 0, (c.alpha == null ? 1 : c.alpha) * 0.7);
      this._particles(weather.particles, 'sky');

      const land = this._landscape(layout, o.title ? 0 : world.level);
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(land, 0, 0); g.setTransform(rs, 0, 0, rs, 0, 0);
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
      if ((amb.darkness || 0) > 0.01) {   // night: darken the reef and sand, never the play items
        const d = amb.darkness, k = this._layerScale(layout), gy = layout.groundY;
        const y0 = gy - 470 * k, y1 = gy - 330 * k;
        const dg = g.createLinearGradient(0, y0, 0, H);
        const f1 = clamp((y1 - y0) / Math.max(1, H - y0), 0, 1);
        dg.addColorStop(0, 'rgba(8,24,60,0)'); dg.addColorStop(f1, `rgba(8,24,60,${d})`); dg.addColorStop(1, `rgba(8,24,60,${0.7 * d})`);
        g.fillStyle = dg; g.fillRect(0, Math.max(0, y0), W, H - Math.max(0, y0));
      }
      this._night = clamp((amb.darkness || 0) / 0.28, 0, 1);
      this._wind = amb.wind || 0; this._sway = amb.sway || 0;
      this._shafts(weather, amb, layout);
      this._particles(weather.particles, 'back');

      if (o.title) { if (!o.map) this._titleScene(world, o); }
      else this._game(world, o);
      this._actors(o.dt || 0, world);
      this._particles(weather.particles, 'front');
      this._fx(o.dt || 0);
      if (!o.title) this._banner(world);
      if (o.debug) this._debug(world);
    }

    _water(world, weather, amb, layout) {
      const g = this.g, W = this.W, H = this.H, gy = layout.groundY, k = this._layerScale(layout);
      const sky = g.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, amb.skyTop || '#7FDCEA'); sky.addColorStop(1, amb.skyBottom || '#2E8FB8');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      if (amb.horizon) {
        const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
        hz.addColorStop(0, amb.horizon + '00'); hz.addColorStop(0.6, amb.horizon + '66'); hz.addColorStop(1, amb.horizon + 'AA');
        g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 620 * k), W, gy);
      }
      // surface: a wobbly bright band at the very top
      const t = weather.time || this.time;
      g.save(); g.globalAlpha = 0.35; g.fillStyle = '#ffffff'; g.beginPath(); g.moveTo(0, 0);
      for (let x = 0; x <= W + 20; x += 20) g.lineTo(x, 10 + Math.sin(x * 0.02 + t * 1.3) * 5 + Math.sin(x * 0.045 - t * 0.9) * 3);
      g.lineTo(W, 0); g.closePath(); g.fill(); g.restore();
      const st = amb.stars || 0;
      if (st > 0.01 && weather.stars) {
        for (const s of weather.stars) {
          const al = st * (0.55 + 0.45 * Math.sin(s.phase + (s.tw || 1.5) * t));
          if (al < 0.03) continue;
          g.fillStyle = s.r > 2 ? `rgba(255,243,196,${al})` : `rgba(255,255,255,${al})`;
          g.beginPath(); g.arc(s.x, s.y, s.r || 1.2, 0, TAU); g.fill();
        }
      }
      const P = world.playRect || layout.play;
      const skyMax = Math.min(gy - 230, P ? P.y - 70 : gy - 230);
      if ((amb.sun || 0) > 0.01) this._sprite('sun', W * (amb.sunX == null ? 0.66 : amb.sunX), Math.min(skyMax, H * (amb.sunY == null ? 0.12 : amb.sunY)), amb.sunY > 0.38 ? 240 : 190, 0, amb.sun * 0.9);
      if ((amb.moon || 0) > 0.01) this._sprite('moon', W * (amb.moonX == null ? 0.78 : amb.moonX), Math.min(skyMax, H * (amb.moonY == null ? 0.12 : amb.moonY)), 170, 0, amb.moon);
    }
    _shafts(weather, amb, layout) {   // light shafts from the surface + plankton glow at night
      const g = this.g, W = this.W, gy = layout.groundY, t = weather.time || this.time;
      const list = weather.shafts || [];
      if (list.length) {
        g.save(); g.globalCompositeOperation = 'lighter';
        for (const s of list) {
          const a = (s.alpha == null ? 0.12 : s.alpha) * (0.7 + 0.3 * Math.sin(t * 0.6 + (s.phase || 0)));
          if (a < 0.01) continue;
          const x = s.x * W, w = (s.w || 0.08) * W, lean = 0.22 * w;
          const gr = g.createLinearGradient(0, 0, 0, gy);
          gr.addColorStop(0, `rgba(255,255,230,${a})`); gr.addColorStop(1, 'rgba(255,255,230,0)');
          g.fillStyle = gr; g.beginPath(); g.moveTo(x - w / 2, 0); g.lineTo(x + w / 2, 0); g.lineTo(x + w / 2 + lean + w * 0.4, gy); g.lineTo(x - w / 2 + lean - w * 0.4, gy); g.closePath(); g.fill();
        }
        g.restore();
      }
      const pl = amb.aurora || 0;
      if (pl > 0.01) {   // glowing plankton drifting in the water
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 28; i++) {
          const ph = i * 2.399, x = ((i * 137.5 + t * 9 * (1 + (i % 3) * 0.3)) % (W + 40)) - 20, y = gy * (0.2 + 0.7 * ((Math.sin(ph) + 1) / 2)) + Math.sin(t * 0.8 + ph) * 14;
          const a = pl * (0.35 + 0.35 * Math.sin(t * 2 + ph));
          const r = 3 + (i % 3) * 2;
          const gr = g.createRadialGradient(x, y, 0, x, y, r * 4);
          gr.addColorStop(0, `rgba(${i % 2 ? '120,255,220' : '160,200,255'},${a})`); gr.addColorStop(1, 'rgba(120,255,220,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(x, y, r * 4, 0, TAU); g.fill();
        }
        g.restore();
      }
    }

    /* ---------- the game scene ---------- */
    _game(w, o) {
      const a = w.alpha == null ? 1 : w.alpha;
      const items = w.items || [], baskets = w.baskets || [], mounds = w.mounds || [];
      const hi = w.held != null ? items.find(i => i.id === w.held) : null;
      const hn = hi && w.potAt ? w.potAt(hi.x, hi.y) : (hi && w.chestAt ? w.chestAt(hi.x, hi.y) : null);
      this._hoverNest = hn ? hn.id : null;
      this._sizeSprite = (w.topic === 'size' && items[0] && items[0].sprite) || null;
      if (o.done) { this._donePile(w); this._doneTutu(w, o); return; }
      const byId = new Map(items.map(i => [i.id, i]));
      this._world = w;
      // 1. mounds: holes (open/gone) first, then buried/peeking items, then the sand on top
      for (const m of mounds) if (m.state === 'open' || m.state === 'gone') this._moundHole(m);
      for (const m of mounds) if (m.state === 'buried' || m.state === 'peek') {
        const it = byId.get(m.itemId != null ? m.itemId : (m.item && m.item.id != null ? m.item.id : m.item));
        if (it && !m.crab) { this._shadow(it, a, true); this._item(it, a, false, true); }
      }
      for (const m of mounds) if (m.state === 'buried' || m.state === 'peek') this._mound(m);
      // 2. chests: back, items inside, front, sign
      for (const b of baskets) this._chest(b, items, a, w);
      // 3. resting / moving items, held last
      const held = w.held;
      const free = [];
      for (const it of items) {
        if (it.state === 'in' || (it.state === 'leave' && it._wasIn) || it.state === 'buried' || it.state === 'peek') continue;
        if (it.state === 'fly' && this._flyIntoChest(it, w)) continue;
        if (it.id === held) continue;
        free.push(it);
      }
      for (const it of free) this._shadow(it, a);
      for (const it of free) this._item(it, a);
      const h = held != null ? byId.get(held) : null;
      if (h) { this._shadow(h, a); this._item(h, a); }
      this._tutu(w, o, a);
    }
    _donePile(w) {   // celebration: an open long chest overflowing with shells and pearls (kept clear of the DOM panel)
      const L = w.layout, W = this.W, H = this.H, g = this.g, portrait = H > W;
      const pw = portrait ? Math.min(W * 0.46, 330) : Math.min(W * 0.24, 280), ph = pw * 200 / 512;
      const x = portrait ? W * 0.7 : W * 0.86, gy = portrait ? H * 0.4 : L.groundY + 8, top = gy - ph;
      g.fillStyle = 'rgba(20,50,90,.2)'; g.beginPath(); g.ellipse(x, gy - 4, pw * 0.46, ph * 0.08, 0, 0, TAU); g.fill();
      this._img('long_back', x - pw / 2, top, pw, ph);
      const cols = ['red', 'yellow', 'purple', 'blue', 'orange', 'green'];
      for (let i = 0; i < 9; i++) {
        const s = pw * 0.17, bx = x + (i - 4) * pw * 0.095, by = top + ph * 0.3 - ((i % 3) * s * 0.22) + Math.sin(this.time * 2 + i) * 2;
        if (i % 3 === 1) this._sprite('pearl', bx, by, s * 0.9); else this._sprite('shell_' + cols[i % 6], bx, by, s);
      }
      this._img('long_front', x - pw / 2, top, pw, ph);
      for (let i = 0; i < 6; i++) { const ph2 = i * 1.1 + this.time * 2; this._sprite('sparkle', x + Math.sin(ph2) * pw * 0.4, top - 10 - Math.abs(Math.cos(ph2 * 0.7)) * 50, 18 + 8 * Math.sin(ph2 * 3), 0, 0.8); }
    }
    _doneTutu(w, o) {   // dancing Tutu: upper half in portrait, left of the panel in landscape
      const H = this.H, W = this.W, portrait = H > W;
      const h = Math.min(H * (o && o.compact ? 0.5 : portrait ? 0.22 : 0.36), 360);
      const cyc = this.time % 0.9, dance = Math.floor(this.time / 0.45) % 2 === 0;
      const hop = Math.max(0, Math.sin(cyc / 0.45 * Math.PI)) * (cyc < 0.45 ? 26 : 0);
      const y = portrait ? H * 0.4 : w.layout.groundY + 6;
      const cx = o && o.compact ? w.layout.ins.left + W * 0.18 : W * (portrait ? 0.3 : 0.15);
      this._character(dance ? 'tutu_dance_a' : 'tutu_dance_b', cx, y - hop, h, 1, y, hop);
    }
    _flyIntoChest(it, w) {
      const b = (w.baskets || []).find(b => b.id === it.basketId);
      return !!(b && (it.overPot || it.overChest || (it.vy > 0 && it.y > b.top + b.h * 0.05)));
    }

    /* ---------- mounds ---------- */
    _moundHole(m) {
      const g = this.g, w = m.w || 160, h = m.h || w * 0.6, top = m.y - h;
      const al = m.state === 'gone' ? 0.55 : 1;
      g.save(); g.globalAlpha = al;
      this._img('mound_hole', m.x - w / 2, top, w, h);
      g.restore();
    }
    _mound(m) {
      const g = this.g, w = m.w || 160, h = m.h || w * 0.6, top = m.y - h;
      const sh = clamp(m.wiggle || 0, -1.5, 1.5), br = 1 + 0.02 * Math.sin(this.time * 1.4 + m.x * 0.01) * (m.breathe == null ? 1 : m.breathe);
      g.save();
      if ((m.glow || 0) > 0.01) {
        const pulse = 0.65 + 0.35 * Math.sin(this.time * 8);
        const gr = g.createRadialGradient(m.x, top + h * 0.5, w * 0.1, m.x, top + h * 0.5, w * 0.8);
        gr.addColorStop(0, `rgba(255,236,120,${0.85 * m.glow * pulse})`); gr.addColorStop(1, 'rgba(255,236,120,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(m.x, top + h * 0.5, w * 0.8, h * 0.9, 0, 0, TAU); g.fill();
      }
      g.translate(m.x + sh * 8, m.y); g.rotate(sh * 0.04); g.scale(1 / (br * 0.5 + 0.5), br); g.translate(-m.x, -m.y);
      this._img('mound', m.x - w / 2, top, w, h);
      g.restore();
    }

    /* ---------- chests ---------- */
    _chest(b, items, a, w) {
      const g = this.g;
      const long = b.kind === 'long' || b.kind === 'planter';
      const pw = b.w, ph = b.h, top = b.top != null ? b.top : b.y - ph * 0.27, bottom = top + ph;
      const sq = clamp(b.squash || 0, -0.3, 0.3);
      const sh = clamp(b.shake || 0, -1.5, 1.5);
      const hover = b.id === this._hoverNest ? 0.04 : 0;
      const ap = b.appear == null ? 1 : clamp(b.appear, 0, 1), apk = ap >= 1 ? 1 : easeOutBack(ap);
      if (apk <= 0.01) return;
      g.save();
      g.translate(b.x + sh * 10, bottom); g.rotate(sh * 0.05);
      g.scale((1 + sq + hover) * apk, (1 - sq + hover) * apk); g.translate(-b.x, -bottom);
      g.fillStyle = 'rgba(20,50,90,.22)';
      g.beginPath(); g.ellipse(b.x, bottom - 4, pw * 0.46, Math.max(8, ph * 0.06), 0, 0, TAU); g.fill();
      if (hover) { g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.ellipse(b.x, b.y, pw * 0.6, ph * 0.3, 0, 0, TAU); g.fill(); }
      if ((b.glow || 0) > 0.01) {
        const pulse = 0.65 + 0.35 * Math.sin(this.time * 8);
        const gr = g.createRadialGradient(b.x, b.y, pw * 0.1, b.x, b.y, pw * 0.8);
        gr.addColorStop(0, `rgba(255,236,120,${0.8 * b.glow * pulse})`); gr.addColorStop(1, 'rgba(255,236,120,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(b.x, b.y, pw * 0.8, ph * 0.75, 0, 0, TAU); g.fill();
      }
      this._img(long ? 'long_back' : 'chest_back', b.x - pw / 2, top, pw, ph);
      // treasures inside (settled) and the ones dropping in right now
      const mine = items.filter(it => it.basketId === b.id && (it.state === 'in' || (it.state === 'leave' && it._wasIn)));
      for (const it of mine) this._item(it, a, true);
      for (const it of items) if (it.basketId === b.id && it.state === 'fly' && this._flyIntoChest(it, w)) this._item(it, a, true);
      this._img(long ? 'long_front' : 'chest_front', b.x - pw / 2, top, pw, ph);
      if (!long && b.label && b.label.type === 'color') {   // a coloured ribbon band on the chest front
        const p = pal(b.label.value);
        g.fillStyle = p.fill; g.beginPath(); roundRect(g, b.x - pw * 0.36, top + ph * 0.42, pw * 0.72, ph * 0.09, ph * 0.04); g.fill();
        g.lineWidth = Math.max(2, ph * 0.016); g.strokeStyle = p.dark; g.beginPath(); roundRect(g, b.x - pw * 0.36, top + ph * 0.42, pw * 0.72, ph * 0.09, ph * 0.04); g.stroke();
      }
      if (long) this._plate(b, b.x, top + ph * 0.66, Math.min(pw * 0.3, ph * 0.95));
      else this._plate(b, b.x, top + ph * 0.7, pw * 0.6);
      g.restore();
    }

    /* label plate (board part of sign.svg) */
    _plate(b, cx, cy, pw) {
      const g = this.g;
      let L = b.label || {};
      if (L.type === 'dig') {   // dig chest: the sign shows what Tutu is asking for right now
        const w = this._world, tl = w && w.targetLabel ? w.targetLabel() : null;
        L = tl || { type: 'none' };
      }
      const ph = pw * 72 / 104;
      const spr = TR.Assets.sprite('sign', pw * 128 / 104 * this.rs);
      if (spr) {
        const k = spr.width / 128;
        g.drawImage(spr, 12 * k, 6 * k, 104 * k, 74 * k, cx - pw / 2, cy - ph / 2, pw, ph * 74 / 72);
      } else {
        g.fillStyle = '#f3d9a4'; g.strokeStyle = '#a5743f'; g.lineWidth = 3;
        g.beginPath(); roundRect(g, cx - pw / 2, cy - ph / 2, pw, ph, 10); g.fill(); g.stroke();
      }
      const iw = pw * 0.86, ih = ph * 0.8;
      g.save(); g.translate(cx, cy);
      switch (L.type) {
        case 'color': this._sprite('shell_' + L.value, 0, 2, ih * 1.05); break;
        case 'shape': drawShape(g, L.value, '#8a6a4a', ih * 0.82, { flat: true }); break;
        case 'animal': this._sprite('animal_' + L.value, 0, 0, ih * 1.3); break;
        case 'size': {
          const spr2 = this._sizeSprite || 'shell_yellow';
          this._sprite(spr2, 0, L.value === 'big' ? 0 : ih * 0.2, L.value === 'big' ? ih * 1.15 : ih * 0.62); break;
        }
        case 'letter': outlinedText(g, String(L.value), 0, ih * 0.04, ih * 0.86, INK, null, iw); break;
        case 'parity': {
          const word = TR.I18N ? TR.I18N.name(this.lang, 'parity', L.value) : L.value;
          outlinedText(g, word, 0, -ih * 0.14, ih * 0.5, INK, null, iw);
          outlinedText(g, L.value === 'odd' ? '1 3 5' : '2 4 6', 0, ih * 0.3, ih * 0.36, '#8a6a4a', null, iw);
          break;
        }
        case 'number': {
          const n = L.value;
          if (b.need) { outlinedText(g, String(n), 0, -ih * 0.14, ih * 0.62, INK, null, iw); this._dots(n, b.count || 0, 0, ih * 0.33, iw, ih * 0.3); }
          else outlinedText(g, String(n), 0, ih * 0.04, ih * 0.8, INK, null, iw);
          break;
        }
        case 'none': this._sprite('pearl_icon', 0, 0, ih * 0.8); break;
        case 'pearl': {
          if (b.need) { this._sprite('pearl', 0, -ih * 0.14, ih * 0.7); this._dots(b.need, b.count || 0, 0, ih * 0.33, iw, ih * 0.3); }
          else this._sprite('pearl', 0, 0, ih * 1.05);
          break;
        }
        default: if (L.value != null) outlinedText(g, String(L.value), 0, 0, ih * 0.6, INK, null, iw);
      }
      g.restore();
    }
    _dots(n, filled, cx, cy, maxW, d) {
      const g = this.g;
      const per = n > 6 ? Math.ceil(n / 2) : n, rows = n > 6 ? 2 : 1;
      const dd = Math.min(d, maxW / (per * 1.25)) * (rows === 2 ? 0.8 : 1);
      for (let i = 0; i < n; i++) {
        const r = Math.floor(i / per), c = i % per, cnt = r === 0 ? Math.min(per, n) : n - per;
        const x = cx + (c - (cnt - 1) / 2) * dd * 1.25, y = cy + (r - (rows - 1) / 2) * dd * 1.1;
        g.beginPath(); g.arc(x, y, dd * 0.42, 0, TAU);
        if (i < filled) { g.fillStyle = '#FFD23F'; g.fill(); }
        g.lineWidth = Math.max(1.5, dd * 0.12); g.strokeStyle = '#a5743f'; g.stroke();
      }
    }

    /* ---------- items ---------- */
    _pos(it, a) {
      const x = it._px == null ? it.x : lerp(it._px, it.x, a);
      const y = it._py == null ? it.y : lerp(it._py, it.y, a);
      const r = it._prot == null ? (it.rot || 0) : lerp(it._prot, it.rot || 0, a);
      return [x, y, r];
    }
    _shadow(it, a, buried) {
      if (it.state === 'leave' || buried) return;
      const g = this.g;
      const [x, y] = this._pos(it, a);
      const s = it.size * (it.scale || 1);
      const lift = it.lift || 0, ap = it.state === 'appear' ? clamp(it.appear || 0, 0, 1) : 1;
      const restY = it.state === 'drag' || it.state === 'fly' || it.state === 'hop' ? y + s * (0.5 + lift * 0.35) : y + s * 0.46;
      g.fillStyle = `rgba(20,50,90,${(0.2 - lift * 0.08) * ap})`;
      g.beginPath(); g.ellipse(x + lift * 8, restY, s * (0.34 + lift * 0.06) * ap, s * 0.08 * ap, 0, 0, TAU); g.fill();
    }
    _item(it, a, inChest, buried) {
      const g = this.g;
      const [x, y, rot] = this._pos(it, a);
      let s = it.size * (it.scale || 1) * (1 + 0.12 * (it.lift || 0));
      let alpha = 1, k = 1;
      if (it.state === 'appear') { const t = clamp(it.appear == null ? 1 : it.appear, 0, 1); k = t <= 0 ? 0 : easeOutBack(t); alpha = clamp(t * 3, 0, 1); }
      if (it.state === 'leave') alpha = clamp(1 - (it.t || 0) / 0.4, 0, 1);
      if (it.alpha != null) alpha *= clamp(it.alpha, 0, 1);
      if (inChest && it.settle != null) { const st = clamp(it.settle, 0, 1.3); k *= 0.92 + 0.08 * st; }
      if (k <= 0.01 || alpha <= 0.01) return;
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y); g.rotate(rot);
      g.scale((it.sx || 1) * k, (it.sy || 1) * k);
      if ((this._night || 0) > 0.3 && !inChest && !buried) {   // night: soft halo keeps outlines readable on navy
        const gr = g.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 0.62);
        gr.addColorStop(0, `rgba(255,255,240,${0.55 * this._night})`); gr.addColorStop(1, 'rgba(255,255,240,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s * 0.62, 0, TAU); g.fill();
      }
      this.drawItemBody(g, it, s);
      g.restore();
    }
    /* Item visual centred at 0,0 with box size s (also used by the Talk-time previews). */
    drawItemBody(g, it, s) {
      if (it.sprite) this._sprite(it.sprite, 0, 0, s, 0, 1, g);
      else if (it.shape) drawShape(g, it.shape, it.color || 'blue', s * 0.86);
      if (it.text != null && it.text !== '') {
        const t = String(it.text);
        const px = t.length <= 2 ? s * 0.44 : t.length <= 3 ? s * 0.34 : s * 0.27;
        g.save(); g.translate(0, s * 0.05);
        outlinedText(g, t, 0, 0, px, INK, 'rgba(255,255,255,.85)', s * 0.62);
        g.restore();
      }
    }

    /* ---------- Tutu ---------- */
    _tutu(w, o, a) {
      const L = w.layout.tutu, lu = w.tutu || {};
      let frame = 'tutu_idle';
      const mood = lu.mood || 'idle';
      if ((lu.dance || 0) > 0.01) frame = Math.floor(this.time / 0.3) % 2 === 0 ? 'tutu_dance_a' : 'tutu_dance_b';
      else if (mood === 'happy') frame = 'tutu_happy';
      else if (mood === 'cheer') frame = 'tutu_cheer';
      else if (mood === 'think') frame = 'tutu_think';
      else if (mood === 'oops') frame = 'tutu_oops';
      if (frame === 'tutu_idle') {
        if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) frame = 'tutu_talk';
        else if (this._blinking(o.dt)) frame = 'tutu_blink';
      }
      const hop = (lu.hop || 0) + ((lu.dance || 0) > 0.01 ? Math.abs(Math.sin(this.time / 0.3 * Math.PI)) * 14 : 0);
      if (this._lastHop > 2 && hop <= 2) this._landSquash = 0.22;
      this._lastHop = hop;
      this._landSquash = Math.max(0, (this._landSquash || 0) - (o.dt || 0));
      const sq = this._landSquash > 0 ? 0.92 + 0.08 * (1 - this._landSquash / 0.22) : 1;
      const breathe = (1 + 0.018 * Math.sin(this.time * 2.6)) * sq;
      this._character(frame, L.x, L.y - hop, L.h, breathe, L.y, hop);
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }
    _character(frame, x, y, h, breathe, groundY, hop) {
      const g = this.g, box = h * 256 / 222;      // silhouette is y 22–244 (222 px) of the 256 box
      const spr = TR.Assets.sprite(frame, box * this.rs) || TR.Assets.sprite('tutu_idle', box * this.rs);
      const sy = groundY == null ? y : groundY, shk = 1 / (1 + (hop || 0) / 60);
      g.fillStyle = `rgba(20,50,90,${0.22 * shk})`;
      g.beginPath(); g.ellipse(x, sy - box * 0.02, box * 0.3 * shk, box * 0.05 * shk, 0, 0, TAU); g.fill();
      if (!spr) return;
      g.save(); g.translate(x, y); g.scale(1 / (breathe * 0.5 + 0.5), breathe);
      g.drawImage(spr, -box * 128 / 256, -box * 244 / 256, box, box);
      g.restore();
    }

    /* ---------- actors: photobomb fish, dancing crab ---------- */
    photobomb(dir, yFrac) {
      const W = this.W, L = TR.debug && TR.debug.world ? TR.debug.world.layout : null;
      const P = L ? L.play : { y: this.H * 0.3, h: this.H * 0.3 };
      const y = P.y + P.h * clamp(yFrac == null ? 0.4 : yFrac, 0.1, 0.9);
      this.actors.push({ k: 'fish', dir: dir || 1, x: dir < 0 ? W + 160 : -160, y, t: 0, life: 2.4, size: 210 });
    }
    crab(x, y) { this.actors.push({ k: 'crab', x, y, t: 0, life: 1.7, size: 120 }); }
    _actors(dt, w) {
      const g = this.g, W = this.W;
      for (let i = this.actors.length - 1; i >= 0; i--) {
        const a = this.actors[i]; a.t += dt;
        if (a.t >= a.life) { this.actors.splice(i, 1); continue; }
        const u = a.t / a.life;
        if (a.k === 'fish') {
          const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;   // swims in, lingers, swims off
          const x0 = a.dir < 0 ? W + 160 : -160, x1 = a.dir < 0 ? -200 : W + 200;
          const x = lerp(x0, x1, e), y = a.y + Math.sin(a.t * 6) * 12, wob = Math.sin(a.t * 10) * 0.08;
          const frame = Math.floor(a.t / 0.22) % 2 ? 'fish_photobomb_b' : 'fish_photobomb_a';
          this._sprite(frame, x, y, a.size, wob, 1, null, a.dir < 0);
          if (Math.floor(a.t / 0.3) % 3 === 0) this._sprite('bubble1', x + a.dir * a.size * 0.45, y - 40 - (a.t % 0.3) * 120, 16, 0, 0.7);
        } else {
          const pop = easeOutBack(clamp(a.t / 0.3, 0, 1)), fade = u > 0.8 ? (1 - u) / 0.2 : 1;
          const y = a.y - 60 * pop - Math.abs(Math.sin(a.t * 9)) * 16, rot = Math.sin(a.t * 9) * 0.18;
          const frame = Math.floor(a.t / 0.17) % 2 ? 'crab_dance_b' : 'crab_dance_a';
          g.save(); g.globalAlpha = fade;
          this._sprite(frame, a.x + Math.sin(a.t * 3) * 10, y, a.size * pop, rot);
          g.restore();
        }
      }
    }

    /* ---------- title scene ---------- */
    _titleScene(w, o) {
      const L = w.layout, W = this.W, g0 = this.g;
      const portrait = this.H > W;
      const h = portrait ? Math.min(330, this.H * 0.24) : Math.min(300, this.H * 0.42);
      const x = portrait ? W * 0.5 : L.ins.left + W * 0.16, y = L.groundY + 6;
      const cyc = this.time % 2.4;
      const frame = cyc < 0.5 ? 'tutu_happy' : cyc < 0.62 ? 'tutu_blink' : 'tutu_idle';
      const hop = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) * 22 : 0;
      this._character(frame, x, y - hop, h, 1 + 0.02 * Math.sin(this.time * 2.6), y, hop);
      if (!portrait) {   // an open chest with shells and a pearl
        const pw = Math.min(250, W * 0.19), ph = pw * 200 / 256, px = W - L.ins.right - W * 0.17, bottom = L.groundY + 8, top = bottom - ph;
        g0.fillStyle = 'rgba(20,50,90,.2)'; g0.beginPath(); g0.ellipse(px, bottom - 4, pw * 0.44, ph * 0.06, 0, 0, TAU); g0.fill();
        this._img('chest_back', px - pw / 2, top, pw, ph);
        ['purple', 'yellow', 'red'].forEach((c, i) => this._sprite(i === 1 ? 'pearl' : 'shell_' + c, px + (i - 1) * pw * 0.26, top + ph * 0.3 + Math.sin(this.time * 2 + i) * 3, pw * 0.4));
        this._img('chest_front', px - pw / 2, top, pw, ph);
        const ph2 = this.time * 2; this._sprite('sparkle', px + Math.sin(ph2) * pw * 0.4, top - 20 - Math.abs(Math.cos(ph2 * 0.7)) * 30, 20, 0, 0.8);
      }
    }

    /* ---------- chapter banner ---------- */
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, L = w.layout;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((1.8 - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = clamp(L.play.y + L.play.h * 0.45, L.ins.top + 120, this.H - 300);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(20,50,90,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FBFDFF'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#BFD8EE'; g.stroke();
      const I = TR.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#6b7a99', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#1f5ba8', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#6b7a99', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#1f5ba8', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 220) fx.splice(0, fx.length - 220);
      const R = Math.random;
      if (type === 'land') {
        fx.push({ k: 'ring', x, y, t: 0, life: 0.45, size: opt.size || 120 });
        const n = 8 * this.quality;
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.4, sp = 160 + R() * 220;
          fx.push({ k: 'p', sprite: 'sparkle', x, y: y - 10, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 520, t: 0, life: 0.6 + R() * 0.3, size: 18 + R() * 16, rot: R() * TAU, vr: (R() - 0.5) * 8 });
        }
      } else if (type === 'sparkle') {
        const n = 7 * this.quality;
        fx.push({ k: 'ring', x, y, t: 0, life: 0.5, size: opt.size || 90, color: '255,255,255' });
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 70 + R() * 120;
          fx.push({ k: 'p', sprite: i % 2 ? 'sparkle' : 'bubble2', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: -40, t: 0, life: 0.7 + R() * 0.3, size: 14 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 6 });
        }
      } else if (type === 'dig') {   // sand poof
        const n = Math.round(10 * this.quality);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.6, sp = 120 + R() * 260;
          fx.push({ k: 'p', sprite: 'sand', x: x + (R() - 0.5) * 50, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 600, t: 0, life: 0.55 + R() * 0.3, size: 16 + R() * 18, rot: R() * TAU, vr: (R() - 0.5) * 10, a0: 0.9 });
        }
        for (let i = 0; i < 4; i++) fx.push({ k: 'p', sprite: 'bubble1', x: x + (R() - 0.5) * 60, y: y - 20, vx: (R() - 0.5) * 40, vy: -80 - R() * 80, g: -30, t: 0, life: 0.9, size: 12 + R() * 12, rot: 0, vr: 0, a0: 0.8 });
      } else if (type === 'sink') {
        for (let i = 0; i < 4; i++) fx.push({ k: 'p', sprite: 'sand', x: x + (R() - 0.5) * 50, y, vx: (R() - 0.5) * 60, vy: -30 - R() * 40, g: 200, t: 0, life: 0.4, size: 14 + R() * 10, rot: R() * TAU, vr: 0, grow: 1.3, a0: 0.7 });
      } else if (type === 'appear') {
        for (let i = 0; i < 3; i++) fx.push({ k: 'p', sprite: 'bubble2', x: x + (R() - 0.5) * 40, y: y + 20, vx: (R() - 0.5) * 60, vy: -40 - R() * 40, g: 0, t: 0, life: 0.5, size: 20 + R() * 12, rot: 0, vr: 0, grow: 1.4, a0: 0.6 });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'pearl') {
        fx.push({ k: 'star', sprite: 'pearl_icon', x0: x, y0: y, x1: this.hudPearl.x, y1: this.hudPearl.y, t: -(opt.delay || 0), life: 0.7, size: 46, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(110 * this.quality);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'hint') {
        for (let i = 0; i < 6; i++) { const a = R() * TAU; fx.push({ k: 'p', sprite: 'sparkle', x: x + Math.cos(a) * 80, y: y + Math.sin(a) * 40 - 20, vx: 0, vy: -30, g: 0, t: 0, life: 0.9, size: 22, rot: 0, vr: 3 }); }
      } else if (type === 'wrong') {
        fx.push({ k: 'ring', x, y, t: 0, life: 0.35, size: 80, color: '255,255,255' });
      } else if (type === 'bubbles') {
        for (let i = 0; i < 5; i++) fx.push({ k: 'p', sprite: i % 2 ? 'bubble1' : 'bubble2', x: x + (R() - 0.5) * 50, y, vx: (R() - 0.5) * 30, vy: -90 - R() * 90, g: -20, t: 0, life: 1 + R() * 0.5, size: 10 + R() * 16, rot: 0, vr: 0, a0: 0.8, sway: R() * TAU, drag: 0.01 });
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
          if (f.drag) { f.vx *= 1 - f.drag * dt; f.vy = Math.min(f.vy, 140); f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const s = f.size * (f.grow ? 1 + (f.grow - 1) * u : 1);
          const al = (f.a0 || 1) * (u > 0.7 ? (1 - u) / 0.3 : 1);
          this._sprite(f.sprite, f.x, f.y, s, f.rot, al);
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color || '255,240,150'},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.ellipse(f.x, f.y, f.size * (0.3 + u * 0.7), f.size * (0.12 + u * 0.28), 0, 0, TAU); g.stroke();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite(f.sprite || 'star', x, y, f.size * (1 - 0.5 * u), f.sprite ? 0 : u * 6, 1);
        }
      }
    }

    _particles(list, layer) {
      if (!list) return;
      for (const p of list) if ((p.layer || 'back') === layer && p.alpha > 0.01) {
        if (p.sprite === 'dot') { this.g.fillStyle = `rgba(255,255,255,${p.alpha})`; this.g.beginPath(); this.g.arc(p.x, p.y, p.size / 2, 0, TAU); this.g.fill(); continue; }
        this._sprite(p.sprite === 'star' ? 'pstar' : p.sprite, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX === -1);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = TR.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
      if (!spr) return;
      const k = size / Math.max(spr.width, spr.height);
      const w = spr.width * k, h = spr.height * k;
      if (alpha != null && alpha < 1) g.globalAlpha *= alpha;
      if (rot || flipX) {
        g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flipX) g.scale(-1, 1);
        g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
      } else g.drawImage(spr, x - w / 2, y - h / 2, w, h);
      if (alpha != null && alpha < 1) g.globalAlpha /= alpha;
    }
    _img(name, x, y, w, h) {
      const spr = TR.Assets.sprite(name, Math.max(w, h) * this.rs);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      const P = w.layout.play; g.strokeRect(P.x, P.y, P.w, P.h);
      for (const b of w.baskets || []) g.strokeRect(b.x - b.w / 2 - 30, (b.top || b.y) - 90, b.w + 60, b.h + 90);
      for (const m of w.mounds || []) g.strokeRect(m.x - m.w / 2 - 24, m.y - m.h - 24, m.w + 48, m.h + 48);
      for (const it of w.items || []) { g.beginPath(); g.arc(it.x, it.y, it.size * 0.6 + 14, 0, TAU); g.stroke(); }
    }
  }

  /* Draw an item-like thing into a small standalone canvas (Talk-time previews / choice buttons). */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = TR.render;
    if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    if (thing.dots) {
      g.save(); g.translate(cw / 2, ch * 0.4);
      outlinedText(g, String(thing.text), 0, 0, ch * 0.55, INK, null, cw * 0.9);
      g.restore();
      const n = thing.dots, per = n > 5 ? Math.ceil(n / 2) : n, rows = n > 5 ? 2 : 1, d = Math.min(cw / (per * 1.3), ch * 0.16);
      for (let i = 0; i < n; i++) {
        const r0 = Math.floor(i / per), c = i % per, cnt = r0 === 0 ? Math.min(per, n) : n - per;
        g.fillStyle = '#FF9A2E'; g.beginPath();
        g.arc(cw / 2 + (c - (cnt - 1) / 2) * d * 1.25, ch * 0.8 + (r0 - (rows - 1) / 2) * d * 1.1, d * 0.42, 0, TAU); g.fill();
      }
      r.g = saveG; r.rs = saveRs;
      return;
    }
    const n = thing.count || 1;
    const s = Math.min(ch * 0.86, (cw * 0.92) / Math.min(n, n > 6 ? Math.ceil(n / 2) : n));
    const rows = n > 6 ? 2 : 1, per = Math.ceil(n / rows);
    const ss = rows === 2 ? Math.min(s, ch * 0.46) : s;
    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / per), col = i % per, cnt = row === rows - 1 ? n - per * (rows - 1) : per;
      const x = cw / 2 + (col - (cnt - 1) / 2) * ss * 0.92, y = ch / 2 + (row - (rows - 1) / 2) * ss * 0.95;
      g.save(); g.translate(x, y);
      r.drawItemBody(g, thing, ss * (thing.scale || 1));
      g.restore();
    }
    r.g = saveG; r.rs = saveRs;
  };
  Renderer.drawShape = drawShape;
  TR.Renderer = Renderer;
})(window.TR = window.TR || {});
