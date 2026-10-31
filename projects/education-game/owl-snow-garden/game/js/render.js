/* SG.Render — draws the snowy garden, pots, seeds, growing flowers, Lumi, the sky (sun, moon, stars, aurora) and juice on one canvas.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels.
 * Performance: the static landscape (far + mid + ground) is composed once per resize/chapter into a
 * canvas at backing-store size and blitted pixel-exact; sprites come pre-rasterized from SG.Assets;
 * entity positions are interpolated between fixed simulation steps (world.alpha). */
(function (SG) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const INK = '#3d3a52';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };

  function pal(key) {
    const P = SG.PALETTE || {};
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
        const pts = [[0, top], [r * 1.0, bot], [-r * 1.0, bot]];
        roundPoly(g, pts, rr); break;
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
  /* Filled, outlined, cel-shaded shape */
  function drawShape(g, shape, color, s, opts) {
    const p = typeof color === 'string' && color[0] === '#' ? { fill: color, dark: '#7a5a3a' } : pal(color);
    const lw = Math.max(2, s * 0.05);
    g.save();
    shapePath(g, shape, s);
    g.fillStyle = p.fill; g.fill();
    if (!(opts && opts.flat)) {
      g.save(); g.clip();
      g.fillStyle = 'rgba(0,0,0,.13)'; g.beginPath(); g.ellipse(s * 0.3, s * 0.42, s * 0.75, s * 0.45, -0.5, 0, TAU); g.fill();
      g.fillStyle = 'rgba(255,255,255,.38)'; g.beginPath(); g.ellipse(-s * 0.2, -s * 0.24, s * 0.2, s * 0.11, -0.6, 0, TAU); g.fill();
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

  /* A flower growing from (x, baseY): stem of length len (bends with sway, radians), petals 0..~1.2 (opening),
   * head width hs. `it` (optional) decorates the centre: shape seeds show their shape, plain seeds their text,
   * animal stickers a tiny animal. */
  function drawFlower(g, x, baseY, len, petals, color, hs, sway, it, R) {
    if (len < 1) return;
    const p = pal(color);
    const tx = x + Math.sin(sway) * len, ty = baseY - Math.cos(sway) * len;
    const cx = x + Math.sin(sway * 0.5) * len * 0.55, cy = baseY - len * 0.55;
    const lw = Math.max(3, hs * 0.075);
    g.save();
    g.lineCap = 'round';
    g.strokeStyle = '#2F6B3A'; g.lineWidth = lw + 3;
    g.beginPath(); g.moveTo(x, baseY); g.quadraticCurveTo(cx, cy, tx, ty); g.stroke();
    g.strokeStyle = '#5DB36A'; g.lineWidth = lw;
    g.beginPath(); g.moveTo(x, baseY); g.quadraticCurveTo(cx, cy, tx, ty); g.stroke();
    if (len > hs * 0.35) {   // two leaves
      const ly = baseY - len * 0.38, lx = x + Math.sin(sway) * len * 0.3, lk = Math.min(1, len / (hs * 0.9));
      for (const sgn of [-1, 1]) {
        g.save(); g.translate(lx, ly + (sgn > 0 ? hs * 0.08 : 0)); g.rotate(sgn * 0.9 + sway);
        g.beginPath(); g.ellipse(sgn * hs * 0.17 * lk, 0, hs * 0.18 * lk, hs * 0.08 * lk, 0, 0, TAU);
        g.fillStyle = '#5DB36A'; g.fill(); g.lineWidth = 2.5; g.strokeStyle = '#2F6B3A'; g.stroke();
        g.restore();
      }
    }
    if (petals > 0.01) {
      const night = R && R._night ? R._night : 0;
      g.translate(tx, ty); g.rotate(sway * 0.6);
      if (night > 0.05) {   // night garden: flowers glow softly
        const gr = g.createRadialGradient(0, 0, hs * 0.1, 0, 0, hs * 0.9);
        gr.addColorStop(0, `rgba(255,250,220,${0.45 * night})`); gr.addColorStop(1, 'rgba(255,250,220,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, hs * 0.9, 0, TAU); g.fill();
      }
      const k = Math.max(0, petals), n = 6, pl = hs * 0.3 * k, pwid = hs * 0.2 * Math.min(1.1, k);
      for (let i = 0; i < n; i++) {
        const a = i / n * TAU - Math.PI / 2;
        g.save(); g.rotate(a);
        g.beginPath(); g.ellipse(0, -pl * 0.9 - hs * 0.06, pwid, pl, 0, 0, TAU);
        g.fillStyle = p.fill; g.fill();
        g.lineWidth = Math.max(2, hs * 0.035); g.strokeStyle = p.dark; g.stroke();
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.beginPath(); g.ellipse(-pwid * 0.25, -pl * 1.2 - hs * 0.06, pwid * 0.3, pl * 0.4, 0, 0, TAU); g.fill();
        g.restore();
      }
      const cr = hs * (it && (it.text || it.shape || (it.sprite && it.sprite.indexOf('animal_') === 0)) ? 0.26 : 0.17) * Math.min(1, k * 1.2);
      g.beginPath(); g.arc(0, 0, cr, 0, TAU);
      g.fillStyle = '#FFF4DC'; g.fill(); g.lineWidth = Math.max(2, hs * 0.035); g.strokeStyle = '#C99A12'; g.stroke();
      if (it && k > 0.5) {
        if (it.shape) drawShape(g, it.shape, it.color || color, cr * 1.4, { flat: true });
        else if (it.text != null && it.text !== '') outlinedText(g, String(it.text), 0, cr * 0.06, cr * 1.2, INK, null, cr * 1.8);
        else if (it.sprite && it.sprite.indexOf('animal_') === 0 && R) R._sprite(it.sprite, 0, 0, cr * 2.1, 0, 1, g === R.g ? null : g);
      } else if (k > 0.3) {
        g.fillStyle = '#E8B33A';
        for (let i = 0; i < 5; i++) { const a = i * 2.4; g.beginPath(); g.arc(Math.cos(a) * cr * 0.45, Math.sin(a) * cr * 0.45, cr * 0.16, 0, TAU); g.fill(); }
      }
    }
    g.restore();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.land = null; this.landKey = ''; this.time = 0;
      this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      this.landKey = ''; SG.Assets.dropExact();
    }

    /* ---------- static landscape ---------- */
    _landscape(layout, level) {
      const key = this.W + 'x' + this.H + '@' + this.rs + ':' + (level | 0) + ':' + layout.groundY;
      if (key === this.landKey && this.land) return this.land;
      const rs = this.rs, bw = this.canvas.width, bh = this.canvas.height;
      const c = this.land && this.land.width === bw && this.land.height === bh ? this.land : SG.Assets.makeCanvas(bw, bh);
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, bw, bh);
      const gy = layout.groundY;
      const k = this._layerScale(layout);   // tall portrait: bigger hills fill the sky behind the items
      const groundTop = gy - 30 - 40 * k, midBottom = gy - 10, farBottom = gy - 120;   // per env artist (k=1: tops gy-70 / gy-370 / gy-540)
      const layers = [
        { n: 'far', w: 1200 * k, h: 420 * k, bottom: farBottom, off: 0.15 * 1300 * level },
        { n: 'mid', w: 1200 * k, h: 360 * k, bottom: midBottom, off: 0.35 * 1300 * level },
        { n: 'ground', w: 1200 * k, h: 260 * k, bottom: groundTop + 260 * k, off: 0 }
      ];
      for (const L of layers) {
        const tw = Math.round(L.w * rs), th = Math.round(L.h * rs);
        const tile = SG.Assets.exact(L.n, tw, th);
        if (!tile) continue;
        const y = Math.round((L.bottom - L.h) * rs);
        let x = -Math.round(((L.off % L.w) + L.w) % L.w * rs);
        for (; x < bw; x += tw) g.drawImage(tile, x, y);
        if (L.n === 'ground' && y + th < bh) { // fill below the ground art if the screen is very tall
          g.fillStyle = '#E1EBF6'; g.fillRect(0, y + th - 2, bw, bh - (y + th) + 2);
        }
      }
      this.land = c; this.landKey = key;
      return c;
    }
    _layerScale(layout) { return layout && layout.H > layout.W * 1.6 ? 1.36 : 1; }
    prewarm(layout, level) { // build tiles ahead of time (cheap when cached)
      const rs = this.rs, k = this._layerScale(layout);
      SG.Assets.exact('far', Math.round(1200 * k * rs), Math.round(420 * k * rs));
      SG.Assets.exact('mid', Math.round(1200 * k * rs), Math.round(360 * k * rs));
      SG.Assets.exact('ground', Math.round(1200 * k * rs), Math.round(260 * k * rs));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, W = this.W, H = this.H;
      this.lang = o.lang || 'en';
      this.time += o.dt || 0;
      const layout = world.layout;
      const amb = weather.ambient || {};
      g.setTransform(rs, 0, 0, rs, 0, 0);

      // sky
      this._sky(world, weather, amb, layout);
      for (const c of weather.clouds || []) this._sprite(c.sprite, c.x, c.y, 300 * (c.scale || 1), 0, c.alpha == null ? 1 : c.alpha);
      this._particles(weather.particles, 'sky');

      // landscape (pixel-exact blit)
      const land = this._landscape(layout, o.title ? 0 : world.level);
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(land, 0, 0); g.setTransform(rs, 0, 0, rs, 0, 0);
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
      if ((amb.darkness || 0) > 0.01) {   // night: darken the hills and snow, not the sky/moon/aurora, never the play items
        const d = amb.darkness, k = this._layerScale(layout), gy = layout.groundY;
        const y0 = gy - 470 * k, y1 = gy - 330 * k;
        const dg = g.createLinearGradient(0, y0, 0, H);
        const f1 = clamp((y1 - y0) / Math.max(1, H - y0), 0, 1);
        dg.addColorStop(0, 'rgba(14,20,56,0)'); dg.addColorStop(f1, `rgba(14,20,56,${d})`); dg.addColorStop(1, `rgba(14,20,56,${0.7 * d})`);
        g.fillStyle = dg; g.fillRect(0, Math.max(0, y0), W, H - Math.max(0, y0));
      }
      this._night = clamp((amb.darkness || 0) / 0.28, 0, 1);
      this._wind = amb.wind || 0; this._sway = amb.sway || 0;
      this._particles(weather.particles, 'back');

      if (o.title) {
        this._titleScene(world, o);
      } else {
        this._game(world, o);
      }
      this._particles(weather.particles, 'front');
      this._fx(o.dt || 0);
      if (!o.title) this._banner(world);
      if (o.debug) this._debug(world);
    }

    _sky(world, weather, amb, layout) {
      const g = this.g, W = this.W, H = this.H, gy = layout.groundY, k = this._layerScale(layout);
      const sky = g.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, amb.skyTop || '#62B4F0'); sky.addColorStop(1, amb.skyBottom || '#D5EEFF');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      if (amb.horizon) {   // warm/cool glow near the snow line
        const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
        hz.addColorStop(0, amb.horizon + '00'); hz.addColorStop(0.6, amb.horizon + '99'); hz.addColorStop(1, amb.horizon + 'DD');
        g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 620 * k), W, gy);
      }
      const t = weather.time || this.time;
      const st = amb.stars || 0;
      if (st > 0.01 && weather.stars) {
        for (const s of weather.stars) {
          const al = st * (0.55 + 0.45 * Math.sin(s.phase + (s.tw || 1.5) * t));
          if (al < 0.03) continue;
          g.fillStyle = s.r > 2 ? `rgba(255,243,196,${al})` : `rgba(255,255,255,${al})`;
          g.beginPath(); g.arc(s.x, s.y, s.r || 1.2, 0, TAU); g.fill();
        }
      }
      const au = amb.aurora || 0;
      if (au > 0.01) this._aurora(au, weather.auroraT || t);
      const P = world.playRect || layout.play;   // keep the sun/moon above the seed band (a yellow seed on the sun vanishes)
      const skyMax = Math.min(gy - 230, P ? P.y - 70 : gy - 230);
      if ((amb.sun || 0) > 0.01) {
        const big = amb.sunY > 0.38 ? 240 : 180;
        this._sprite('sun', W * (amb.sunX == null ? 0.66 : amb.sunX), Math.min(skyMax, H * (amb.sunY == null ? 0.14 : amb.sunY)), big, 0, amb.sun);
      }
      if ((amb.moon || 0) > 0.01) {
        this._sprite('moon', W * (amb.moonX == null ? 0.78 : amb.moonX), Math.min(skyMax, H * (amb.moonY == null ? 0.14 : amb.moonY)), 180, 0, amb.moon);
      }
    }
    _aurora(a, t) {
      const g = this.g, W = this.W, H = this.H, py = H > W ? 0.7 : 1;
      const R = [['111,240,176', 0.42, 58, H * 0.15 + 70, 0.0042, 0.5], ['85,214,230', 0.30, 40, H * 0.23 + 70, 0.0055, -0.4], ['181,140,255', 0.30, 36, H * 0.09 + 70, 0.0035, 0.3]];
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const [c, al, hgt, base0, f, sp] of R) {
        const base = base0 * py, h = hgt * (H > W ? 1.2 : 1) * 1.6;
        const yAt = x => base + Math.sin(x * f + t * sp) * 18 + Math.sin(x * f * 2.7 - t * sp * 1.7) * 8;
        const gr = g.createLinearGradient(0, base + 26, 0, base - h - 26);
        gr.addColorStop(0, `rgba(${c},0)`); gr.addColorStop(0.12, `rgba(${c},${al * a})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.beginPath();
        g.moveTo(0, yAt(0));
        for (let x = 24; x <= W + 24; x += 24) g.lineTo(x, yAt(x));
        for (let x = W + 24; x >= 0; x -= 24) g.lineTo(x, yAt(x) - h * (0.75 + 0.25 * Math.sin(x * 0.01 + t * 0.6)));
        g.closePath(); g.fill();
      }
      g.restore();
    }

    _game(w, o) {
      const a = w.alpha == null ? 1 : w.alpha;
      const g = this.g;
      const items = w.items || [], baskets = w.baskets || [];
      const hi = w.held != null ? items.find(i => i.id === w.held) : null;
      const hn = hi && w.potAt ? w.potAt(hi.x, hi.y) : null;
      this._hoverNest = hn ? hn.id : null;
      this._sizeSprite = (w.topic === 'size' && items[0] && items[0].sprite) || null;
      if (o.done) { this._doneGarden(w); this._doneLumi(w, o); return; }
      // pots: back, planted seeds + flowers, front, sign
      for (const b of baskets) this._pot(b, items, a, w);
      // resting / moving items (not in nests), held last
      const held = w.held;
      const free = [];
      for (const it of items) {
        if (it.state === 'in' || (it.state === 'leave' && it._wasIn)) continue;
        if (it.state === 'fly' && this._flyIntoNest(it, w)) continue;
        if (it.id === held) continue;
        free.push(it);
      }
      for (const it of free) this._shadow(it, a);
      for (const it of free) this._item(it, a);
      const h = held != null ? items.find(i => i.id === held) : null;
      if (h) { this._shadow(h, a); this._item(h, a); }
      this._lumi(w, o, a);
    }
    _doneGarden(w) {   // the night garden: a row of glowing flowers swaying on the snow
      const L = w.layout, W = this.W, gy = L.groundY + 10, cols = ['red', 'yellow', 'purple', 'blue', 'orange', 'green'];
      const n = Math.max(6, Math.round((W - L.ins.left - L.ins.right) / 120)), step = (W - L.ins.left - L.ins.right) / n;
      for (let i = 0; i < n; i++) {
        const x = L.ins.left + step * (i + 0.5), len = 70 + 30 * ((i * 7) % 3) / 2;
        drawFlower(this.g, x, gy, len, 1, cols[i % cols.length], 78, Math.sin(this.time * 1.5 + i) * 0.07, null, this);
      }
    }
    _doneLumi(w, o) {   // celebration: a big cheering Lumi centred above the panel (left of it on short landscape phones)
      const H = this.H, W = this.W, h = Math.min(H * (o && o.compact ? 0.5 : 0.38), 380);
      const cyc = this.time % 1.1, hop = Math.max(0, Math.sin(cyc / 0.55 * Math.PI)) * (cyc < 0.55 ? 40 : 0);
      const y = o && o.compact ? w.layout.groundY - 20 : Math.min(w.layout.groundY - 10, H * (H > W ? 0.5 : 0.52));
      const cx = o && o.compact ? w.layout.ins.left + W * 0.2 : W / 2;
      this._character(cyc < 0.55 ? 'lumi_cheer' : 'lumi_happy', cx, y - hop, h, 1, y, hop);
    }
    _flyIntoNest(it, w) {
      // a flying item that is already dropping into its nest is drawn between nest back and front (see _nest)
      const b = (w.baskets || []).find(b => b.id === it.basketId);
      return !!(b && (it.overPot || (it.vy > 0 && it.y > b.top + b.h * 0.05)));
    }

    _pot(b, items, a, w) {
      const g = this.g;
      const planter = b.kind === 'planter';
      const pw = b.w, ph = b.h, top = b.top != null ? b.top : b.y - ph * 0.24, bottom = top + ph, left = b.x - pw / 2;
      const sq = clamp(b.squash || 0, -0.3, 0.3);
      const sh = clamp(b.shake || 0, -1.5, 1.5);
      const hover = b.id === this._hoverNest ? 0.04 : 0;
      const ap = b.appear == null ? 1 : clamp(b.appear, 0, 1), apk = ap >= 1 ? 1 : easeOutBack(ap);
      if (apk <= 0.01) return;
      g.save();
      g.translate(b.x + sh * 10, bottom); g.rotate(sh * 0.05);
      g.scale((1 + sq + hover) * apk, (1 - sq + hover) * apk); g.translate(-b.x, -bottom);
      // contact shadow on the snow
      g.fillStyle = 'rgba(60,80,120,.20)';
      g.beginPath(); g.ellipse(b.x, bottom - 4, pw * 0.44, Math.max(8, ph * 0.06), 0, 0, TAU); g.fill();
      if (hover) {
        g.fillStyle = 'rgba(255,255,255,.35)';
        g.beginPath(); g.ellipse(b.x, b.y, pw * 0.6, ph * 0.3, 0, 0, TAU); g.fill();
      }
      if ((b.glow || 0) > 0.01) {
        const pulse = 0.65 + 0.35 * Math.sin(this.time * 8);
        const gr = g.createRadialGradient(b.x, b.y, pw * 0.1, b.x, b.y, pw * 0.8);
        gr.addColorStop(0, `rgba(255,236,120,${0.8 * b.glow * pulse})`); gr.addColorStop(1, 'rgba(255,236,120,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(b.x, b.y, pw * 0.8, ph * 0.75, 0, 0, TAU); g.fill();
      }
      this._img(planter ? 'planter_back' : 'pot_back', left, top, pw, ph);
      // flowers and sinking seeds of this pot
      const mine = items.filter(it => it.basketId === b.id && (it.state === 'in' || (it.state === 'leave' && it._wasIn)));
      for (const it of mine) this._flowerOf(it, b);
      for (const it of mine) if ((it.sink || 0) < 1) this._sinkingSeed(it, a);
      for (const it of items) if (it.basketId === b.id && it.state === 'fly' && this._flyIntoNest(it, w)) this._item(it, a, true);
      this._img(planter ? 'planter_front' : 'pot_front', left, top, pw, ph);
      // colour band on the pot lip for colour pots
      if (!planter && b.label && b.label.type === 'color') {
        const p = pal(b.label.value), cy = top + ph * 0.36, rx = pw * 0.42, ry = ph * 0.1;
        g.lineCap = 'round';
        g.strokeStyle = p.dark; g.lineWidth = ph * 0.1;
        g.beginPath(); g.ellipse(b.x, cy, rx, ry, 0, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
        g.strokeStyle = p.fill; g.lineWidth = ph * 0.065;
        g.beginPath(); g.ellipse(b.x, cy, rx, ry, 0, 0.1 * Math.PI, 0.9 * Math.PI); g.stroke();
      }
      if (planter) this._plate(b, b.x, top + ph * 0.62, Math.min(pw * 0.3, ph * 0.95));
      else this._plate(b, b.x, top + ph * 0.66, pw * 0.6);
      g.restore();
    }
    _sinkingSeed(it, a) {
      const g = this.g, [x, y] = this._pos(it, a);
      const sk = clamp(it.sink || 0, 0, 1), s = it.size * (it.scale || 1);
      const al = it.state === 'leave' ? clamp(it.alpha == null ? 1 : it.alpha, 0, 1) : 1;
      g.save(); g.globalAlpha = al * (sk > 0.8 ? (1 - sk) / 0.2 : 1);
      g.translate(x, y + sk * s * 0.55); g.scale((it.sx || 1) * (1 - 0.45 * sk), (it.sy || 1) * (1 - 0.45 * sk));
      this.drawItemBody(g, it, s);
      g.restore();
    }
    _flowerOf(it, b) {
      const stem = it.stem || 0;
      if (stem <= 0.01) return;
      const slot = (b.slots && b.slots[it.slot]) || { x: it.x, stem: 1 };
      const al = it.state === 'leave' ? clamp(it.alpha == null ? 1 : it.alpha, 0, 1) : 1;
      if (al <= 0.01) return;
      const len = stem * (b.stemH || 70) * (slot.stem || 1);
      const sway = (slot.lean || 0) + this._wind * 0.12 + Math.sin(this.time * 1.7 + slot.x * 0.013) * (0.03 + 0.05 * this._sway);
      const hs = (b.flowerSize || 80) * clamp(it.scale || 1, 0.75, 1.25);   // size topic: big seeds → big flowers
      this.g.save(); this.g.globalAlpha *= al;
      drawFlower(this.g, slot.x, b.soilY != null ? b.soilY : b.y, len, it.petals || 0, it.flower || it.color || 'red', hs, sway, it, this);
      this.g.restore();
    }

    /* label plate on the front of the nest (board part of sign.svg) */
    _plate(b, cx, cy, pw) {
      const g = this.g, L = b.label || {};
      const ph = pw * 72 / 104;              // board aspect (x 12–116, y 8–78 of sign.svg)
      const spr = SG.Assets.sprite('sign', pw * 128 / 104 * this.rs);
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
        case 'color': this._sprite('seed_' + L.value, 0, 2, ih * 1.05); break;
        case 'shape': drawShape(g, L.value, '#8a6a4a', ih * 0.82, { flat: true }); break;
        case 'animal': this._sprite('animal_' + L.value, 0, 0, ih * 1.3); break;
        case 'size': {
          const spr = this._sizeSprite || 'seed_plain';
          this._sprite(spr, 0, L.value === 'big' ? 0 : ih * 0.2, L.value === 'big' ? ih * 1.15 : ih * 0.62); break;
        }
        case 'letter': outlinedText(g, String(L.value), 0, ih * 0.04, ih * 0.86, INK, null, iw); break;
        case 'parity': {
          const word = SG.I18N ? SG.I18N.name(this.lang, 'parity', L.value) : L.value;
          outlinedText(g, word, 0, -ih * 0.14, ih * 0.5, INK, null, iw);
          outlinedText(g, L.value === 'odd' ? '1 3 5' : '2 4 6', 0, ih * 0.3, ih * 0.36, '#8a6a4a', null, iw);
          break;
        }
        case 'number': {
          const n = L.value;
          if (b.need) {
            outlinedText(g, String(n), 0, -ih * 0.14, ih * 0.62, INK, null, iw);
            this._dots(n, b.count || 0, 0, ih * 0.33, iw, ih * 0.3);
          } else outlinedText(g, String(n), 0, ih * 0.04, ih * 0.8, INK, null, iw);
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

    _pos(it, a) {
      const x = it._px == null ? it.x : lerp(it._px, it.x, a);
      const y = it._py == null ? it.y : lerp(it._py, it.y, a);
      const r = it._prot == null ? (it.rot || 0) : lerp(it._prot, it.rot || 0, a);
      return [x, y, r];
    }
    _shadow(it, a) {
      if (it.state === 'leave') return;
      const g = this.g;
      const [x, y] = this._pos(it, a);
      const s = it.size * (it.scale || 1);
      const lift = it.lift || 0, ap = it.state === 'appear' ? clamp(it.appear || 0, 0, 1) : 1;
      const restY = it.state === 'drag' || it.state === 'fly' ? y + s * (0.5 + lift * 0.35) : y + s * 0.46;
      g.fillStyle = `rgba(40,40,30,${(0.2 - lift * 0.08) * ap})`;
      g.beginPath(); g.ellipse(x + lift * 8, restY, s * (0.34 + lift * 0.06) * ap, s * 0.08 * ap, 0, 0, TAU); g.fill();
    }
    _item(it, a, inNest) {
      const g = this.g;
      const [x, y, rot] = this._pos(it, a);
      let s = it.size * (it.scale || 1) * (1 + 0.12 * (it.lift || 0));
      let alpha = 1, k = 1;
      if (it.state === 'appear') { const t = clamp(it.appear == null ? 1 : it.appear, 0, 1); k = t <= 0 ? 0 : easeOutBack(t); alpha = clamp(t * 3, 0, 1); }
      if (it.state === 'leave') alpha = clamp(1 - (it.t || 0) / 0.4, 0, 1);
      if (k <= 0.01 || alpha <= 0.01) return;
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y); g.rotate(rot);
      g.scale((it.sx || 1) * k, (it.sy || 1) * k);
      if ((this._night || 0) > 0.3 && !inNest) {   // night: a soft light halo keeps seed outlines readable on navy
        const gr = g.createRadialGradient(0, 0, s * 0.2, 0, 0, s * 0.62);
        gr.addColorStop(0, `rgba(255,255,240,${0.55 * this._night})`); gr.addColorStop(1, 'rgba(255,255,240,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, s * 0.62, 0, TAU); g.fill();
      }
      this.drawItemBody(g, it, s);
      g.restore();
    }
    /* Item visual centred at 0,0 with box size s (also used by the Talk-time previews). */
    drawItemBody(g, it, s) {
      if (!it.sprite && !it.shape && it.flower) {   // a whole little flower (Talk-time previews)
        drawFlower(g, 0, s * 0.48, s * 0.5, 1, it.flower, s * 0.6, 0, null, this);
        return;
      }
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

    _lumi(w, o, a) {
      const L = w.layout.lumi, lu = w.lumi || {};
      let frame = 'lumi_idle';
      const mood = lu.mood || 'idle';
      if (mood === 'happy') frame = 'lumi_happy';
      else if (mood === 'cheer') frame = 'lumi_cheer';
      else if (mood === 'think') frame = 'lumi_think';
      else if (mood === 'oops') frame = 'lumi_oops';
      if (frame === 'lumi_idle') {
        if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) frame = 'lumi_talk';
        else if (this._blinking(o.dt)) frame = 'lumi_blink';
      }
      const hop = lu.hop || 0;
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
      const g = this.g, box = h * 256 / 222;      // Lumi's silhouette is y 22–244 (222 px) of the 256 box
      const spr = SG.Assets.sprite(frame, box * this.rs) || SG.Assets.sprite('lumi_idle', box * this.rs);
      const sy = groundY == null ? y : groundY, shk = 1 / (1 + (hop || 0) / 60);   // shadow stays on the ground, shrinks in the air
      g.fillStyle = `rgba(60,80,120,${0.22 * shk})`;
      g.beginPath(); g.ellipse(x, sy - box * 0.02, box * 0.3 * shk, box * 0.05 * shk, 0, 0, TAU); g.fill();
      if (!spr) return;
      g.save(); g.translate(x, y); g.scale(1 / (breathe * 0.5 + 0.5), breathe);
      g.drawImage(spr, -box * 128 / 256, -box * 244 / 256, box, box);
      g.restore();
    }

    _titleScene(w, o) {
      const L = w.layout, W = this.W, g0 = this.g;
      const portrait = this.H > W;
      const h = portrait ? Math.min(330, this.H * 0.24) : Math.min(300, this.H * 0.42);
      const x = portrait ? W * 0.5 : L.ins.left + W * 0.16, y = L.groundY + 6;
      const cyc = this.time % 2.4;
      const frame = cyc < 0.5 ? 'lumi_happy' : cyc < 0.62 ? 'lumi_blink' : 'lumi_idle';
      const hop = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) * 22 : 0;
      this._character(frame, x, y - hop, h, 1 + 0.02 * Math.sin(this.time * 2.6), y, hop);
      // a decorative pot with three flowers
      if (!portrait) {
        const pw = Math.min(250, W * 0.19), ph = pw * 200 / 256, px = W - L.ins.right - W * 0.17, bottom = L.groundY + 8, top = bottom - ph;
        const soil = top + ph * 0.24;
        g0.fillStyle = 'rgba(60,80,120,.2)'; g0.beginPath(); g0.ellipse(px, bottom - 4, pw * 0.44, ph * 0.06, 0, 0, TAU); g0.fill();
        this._img('pot_back', px - pw / 2, top, pw, ph);
        ['purple', 'yellow', 'red'].forEach((c, i) => {
          const sway = Math.sin(this.time * 1.6 + i) * 0.05;
          drawFlower(g0, px + (i - 1) * pw * 0.26, soil, pw * (i === 1 ? 0.5 : 0.4), 1, c, pw * 0.36, sway, null, this);
        });
        this._img('pot_front', px - pw / 2, top, pw, ph);
      }
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, L = w.layout;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((1.8 - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = clamp(L.play.y + L.play.h * 0.45, L.ins.top + 120, this.H - 300);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(40,60,110,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FBFDFF'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#BFD8EE'; g.stroke();
      const I = SG.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#6b7a99', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#2e8c78', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#6b7a99', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#2e8c78', '#ffffff', 160);
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
      } else if (type === 'bloom') {
        const n = 7 * this.quality, col = opt.color ? pal(opt.color).fill : '#fff';
        fx.push({ k: 'ring', x, y, t: 0, life: 0.5, size: opt.size || 90, color: '255,255,255' });
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 70 + R() * 120;
          fx.push({ k: 'p', sprite: i % 2 ? 'sparkle' : 'petal', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, t: 0, life: 0.7 + R() * 0.3, size: 14 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 6 });
        }
      } else if (type === 'plop') {
        for (let i = 0; i < 4; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 30, y, vx: (R() - 0.5) * 80, vy: -30 - R() * 40, g: 60, t: 0, life: 0.4, size: 18 + R() * 10, rot: R() * TAU, vr: 0, grow: 1.4, a0: 0.7 });
      } else if (type === 'appear') {
        for (let i = 0; i < 3; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 40, y: y + 20, vx: (R() - 0.5) * 60, vy: -20 - R() * 30, g: 0, t: 0, life: 0.45, size: 26 + R() * 14, rot: R() * TAU, vr: 0, grow: 1.6, a0: 0.6 });
      } else if (type === 'star') {
        // a star that flies from (x,y) to the HUD counter on an arc
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
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
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
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
      const spr = SG.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = SG.Assets.sprite(name, Math.max(w, h) * this.rs);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      const P = w.layout.play; g.strokeRect(P.x, P.y, P.w, P.h);
      for (const b of w.baskets || []) g.strokeRect(b.x - b.w / 2 - 45, (b.top || b.y) - 90, b.w + 90, b.h + 135);
      for (const it of w.items || []) { g.beginPath(); g.arc(it.x, it.y, it.size * 0.6 + 14, 0, TAU); g.stroke(); }
    }
  }

  /* Draw an item-like thing into a small standalone canvas (Talk-time previews / choice buttons). */
  Renderer.preview = function (canvas, thing, opts = {}) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = SG.render;
    if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    if (thing.dots) {   // numeral + dots (ages ≤ 5 talk choices)
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
    const s = Math.min(ch * 0.86, (cw * 0.92) / Math.min(n, n > 6 ? Math.ceil(n / 2) : n) * 1.0);
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
  Renderer.drawFlower = drawFlower;
  SG.Renderer = Renderer;
})(window.SG = window.SG || {});
