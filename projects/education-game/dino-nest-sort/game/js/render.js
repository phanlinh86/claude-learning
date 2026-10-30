/* DN.Render — draws the valley, nests, items, Bo, weather and juice on one canvas.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels.
 * Performance: the static landscape (far + mid + ground) is composed once per resize/chapter into a
 * canvas at backing-store size and blitted pixel-exact; sprites come pre-rasterized from DN.Assets;
 * entity positions are interpolated between fixed simulation steps (world.alpha). */
(function (DN) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const INK = '#4a3424';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };

  function pal(key) {
    const P = DN.PALETTE || {};
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
      this.landKey = ''; DN.Assets.dropExact();
    }

    /* ---------- static landscape ---------- */
    _landscape(layout, level) {
      const key = this.W + 'x' + this.H + '@' + this.rs + ':' + (level | 0) + ':' + layout.groundY;
      if (key === this.landKey && this.land) return this.land;
      const rs = this.rs, bw = this.canvas.width, bh = this.canvas.height;
      const c = this.land && this.land.width === bw && this.land.height === bh ? this.land : DN.Assets.makeCanvas(bw, bh);
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, bw, bh);
      const gy = layout.groundY;
      const groundTop = gy - 70, midBottom = gy - 10, farBottom = gy - 120;   // per env artist: tops at gy-70 / gy-370 / gy-540
      const layers = [
        { n: 'far', w: 1200, h: 420, bottom: farBottom, off: 0.15 * 1300 * level },
        { n: 'mid', w: 1200, h: 360, bottom: midBottom, off: 0.35 * 1300 * level },
        { n: 'ground', w: 1200, h: 260, bottom: groundTop + 260, off: 0 }
      ];
      for (const L of layers) {
        const tw = Math.round(L.w * rs), th = Math.round(L.h * rs);
        const tile = DN.Assets.exact(L.n, tw, th);
        if (!tile) continue;
        const y = Math.round((L.bottom - L.h) * rs);
        let x = -Math.round(((L.off % L.w) + L.w) % L.w * rs);
        for (; x < bw; x += tw) g.drawImage(tile, x, y);
        if (L.n === 'ground' && y + th < bh) { // fill below the ground art if the screen is very tall
          g.fillStyle = '#b5cf78'; g.fillRect(0, y + th - 2, bw, bh - (y + th) + 2);
        }
      }
      this.land = c; this.landKey = key;
      return c;
    }
    prewarm(layout, level) { // build tiles ahead of time (cheap when cached)
      const rs = this.rs;
      DN.Assets.exact('far', Math.round(1200 * rs), Math.round(420 * rs));
      DN.Assets.exact('mid', Math.round(1200 * rs), Math.round(360 * rs));
      DN.Assets.exact('ground', Math.round(1200 * rs), Math.round(260 * rs));
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
      const sky = g.createLinearGradient(0, 0, 0, layout.groundY);
      sky.addColorStop(0, amb.skyTop || '#8FD3FF'); sky.addColorStop(1, amb.skyBottom || '#E6F7FF');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);

      const horizon = layout.groundY - 200;
      if ((amb.sun || 0) > 0.01) this._sprite('sun', W * 0.64, Math.min(horizon - 120, layout.ins.top + 150), 170, 0, amb.sun);
      if ((amb.rainbow || 0) > 0.01) {
        const rw = Math.min(W * 0.95, 1150);
        this._sprite('rainbow', W * 0.5, layout.groundY - 300 - rw * 0.21, rw, 0, amb.rainbow * 0.85);
      }
      for (const c of weather.clouds || []) this._sprite(c.sprite, c.x, c.y, 300 * (c.scale || 1), 0, c.alpha == null ? 1 : c.alpha);
      this._particles(weather.particles, 'sky');

      // landscape (pixel-exact blit)
      const land = this._landscape(layout, o.title ? 0 : world.level);
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(land, 0, 0); g.setTransform(rs, 0, 0, rs, 0, 0);
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
      if ((amb.darkness || 0) > 0.01) { g.fillStyle = `rgba(30,40,60,${amb.darkness})`; g.fillRect(0, 0, W, H); }
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

    _game(w, o) {
      const a = w.alpha == null ? 1 : w.alpha;
      const g = this.g;
      const items = w.items || [], baskets = w.baskets || [];
      // nests: back, in-nest items, front, plate
      for (const b of baskets) this._nest(b, items, a, w);
      // resting / moving items (not in nests), held last
      const held = w.held;
      const free = [];
      for (const it of items) {
        if (it.state === 'in') continue;
        if (it.state === 'fly' && this._flyIntoNest(it, w)) continue;
        if (it.id === held) continue;
        free.push(it);
      }
      for (const it of free) this._shadow(it, a);
      for (const it of free) this._item(it, a);
      const h = held != null ? items.find(i => i.id === held) : null;
      if (h) { this._shadow(h, a); this._item(h, a); }
      this._bo(w, o, a);
    }
    _flyIntoNest(it, w) {
      // a flying item that is already dropping into its nest is drawn between nest back and front (see _nest)
      const b = (w.baskets || []).find(b => b.id === it.basketId);
      return !!(b && it.vy > 0 && it.y > b.y - b.w * 0.12);
    }

    _nest(b, items, a, w) {
      const g = this.g;
      const nw = b.w;
      const sq = clamp(b.squash || 0, -0.3, 0.3);
      const sh = b.shake || 0, shx = Math.abs(sh) <= 1.5 ? sh * 12 : sh;
      const bottom = b.y + nw * 0.38;
      g.save();
      g.translate(b.x + shx, bottom); g.scale(1 + sq, 1 - sq); g.translate(-b.x, -bottom);
      // contact shadow on the grass
      g.fillStyle = 'rgba(50,40,20,.18)';
      g.beginPath(); g.ellipse(b.x, bottom - nw * 0.02, nw * 0.5, nw * 0.07, 0, 0, TAU); g.fill();
      // hint glow
      if ((b.glow || 0) > 0.01) {
        const pulse = 0.65 + 0.35 * Math.sin(this.time * 8);
        const gr = g.createRadialGradient(b.x, b.y, nw * 0.1, b.x, b.y, nw * 0.75);
        gr.addColorStop(0, `rgba(255,236,120,${0.75 * b.glow * pulse})`); gr.addColorStop(1, 'rgba(255,236,120,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(b.x, b.y, nw * 0.78, nw * 0.6, 0, 0, TAU); g.fill();
      }
      const nh = nw * 160 / 256, top = b.y - nw * 62 / 256, left = b.x - nw / 2;
      this._img('nest_back', left, top, nw, nh);
      // items sitting in (or dropping into) this nest
      for (const it of items) {
        if (it.basketId !== b.id) continue;
        if (it.state === 'in' || (it.state === 'fly' && it.vy > 0 && it.y > b.y - nw * 0.12)) this._item(it, a, true);
      }
      this._img('nest_front', left, top, nw, nh);
      // colour ribbon on the rim for colour nests
      if (b.label && b.label.type === 'color') {
        const p = pal(b.label.value);
        g.lineCap = 'round';
        g.strokeStyle = p.dark; g.lineWidth = nw * 0.075;
        g.beginPath(); g.ellipse(b.x, b.y + nw * 0.02, nw * 0.43, nw * 0.1, 0, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
        g.strokeStyle = p.fill; g.lineWidth = nw * 0.05;
        g.beginPath(); g.ellipse(b.x, b.y + nw * 0.02, nw * 0.43, nw * 0.1, 0, 0.12 * Math.PI, 0.88 * Math.PI); g.stroke();
      }
      this._plate(b, b.x, b.y + nw * 0.2, nw * 0.44);
      g.restore();
    }

    /* label plate on the front of the nest (board part of sign.svg) */
    _plate(b, cx, cy, pw) {
      const g = this.g, L = b.label || {};
      const ph = pw * 72 / 104;              // board aspect (x 12–116, y 8–78 of sign.svg)
      const spr = DN.Assets.sprite('sign', pw * 128 / 104 * this.rs);
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
        case 'color': this._sprite('egg_' + L.value, 0, 2, ih * 1.05); break;
        case 'shape': drawShape(g, L.value, '#ffffff', ih * 0.82, { flat: true }); break;
        case 'home': this._sprite('home_' + L.value, 0, 0, ih * 1.08); break;
        case 'size': this._sprite('egg_plain', 0, L.value === 'big' ? 0 : ih * 0.2, L.value === 'big' ? ih * 1.1 : ih * 0.5); break;
        case 'letter': outlinedText(g, String(L.value), 0, ih * 0.04, ih * 0.86, INK, null, iw); break;
        case 'parity': {
          const word = DN.I18N ? DN.I18N.name(this.lang, 'parity', L.value) : L.value;
          outlinedText(g, word, 0, -ih * 0.14, ih * 0.5, INK, null, iw);
          outlinedText(g, L.value === 'odd' ? '1 3 5' : '2 4 6', 0, ih * 0.3, ih * 0.3, '#8a6a4a', null, iw);
          break;
        }
        case 'number': {
          const n = L.value;
          if (b.need) {
            outlinedText(g, String(n), 0, -ih * 0.14, ih * 0.62, INK, null, iw);
            this._dots(n, b.count || 0, 0, ih * 0.33, iw, ih * 0.22);
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
        if (i < filled) { g.fillStyle = '#ff9a2e'; g.fill(); }
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

    _bo(w, o, a) {
      const L = w.layout.bo, bo = w.bo || {};
      let frame = 'bo_idle';
      const mood = bo.mood || 'idle';
      if (mood === 'happy') frame = 'bo_happy';
      else if (mood === 'cheer') frame = 'bo_cheer';
      else if (mood === 'think') frame = 'bo_think';
      else if (mood === 'oops') frame = 'bo_oops';
      if (frame === 'bo_idle' || frame === 'bo_think') {
        if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0 && frame === 'bo_idle') frame = 'bo_talk';
        else if (frame === 'bo_idle' && this._blinking(o.dt)) frame = 'bo_blink';
      }
      const breathe = 1 + 0.018 * Math.sin(this.time * 2.6);
      this._character(frame, L.x, L.y - (bo.hop || 0), L.h, breathe);
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }
    _character(frame, x, y, h, breathe) {
      const g = this.g, box = h * 256 / 208;      // Bo's silhouette ≈ 81 % (208 px) of the 256 box
      const spr = DN.Assets.sprite(frame, box * this.rs) || DN.Assets.sprite('bo_idle', box * this.rs);
      g.fillStyle = 'rgba(40,40,20,.2)';
      g.beginPath(); g.ellipse(x, y - box * 0.02, box * 0.3, box * 0.05, 0, 0, TAU); g.fill();
      if (!spr) return;
      g.save(); g.translate(x, y); g.scale(1 / (breathe * 0.5 + 0.5), breathe);
      g.drawImage(spr, -box * 128 / 256, -box * 244 / 256, box, box);
      g.restore();
    }

    _titleScene(w, o) {
      const L = w.layout, W = this.W;
      const portrait = this.H > W;
      const h = portrait ? Math.min(330, this.H * 0.24) : Math.min(300, this.H * 0.42);
      const x = portrait ? W * 0.5 : L.ins.left + W * 0.16, y = L.groundY + 6;
      const cyc = this.time % 2.4;
      const frame = cyc < 0.5 ? 'bo_happy' : cyc < 0.62 ? 'bo_blink' : 'bo_idle';
      const hop = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) * 22 : 0;
      this._character(frame, x, y - hop, h, 1 + 0.02 * Math.sin(this.time * 2.6));
      // a decorative nest with eggs
      if (!portrait) {
        const nx = W - L.ins.right - W * 0.16, nw = Math.min(260, W * 0.2), ny = L.groundY - nw * 0.25;
        const nh = nw * 160 / 256, top = ny - nw * 62 / 256;
        this._img('nest_back', nx - nw / 2, top, nw, nh);
        ['blue', 'yellow', 'red'].forEach((c, i) => this._sprite('egg_' + c, nx + (i - 1) * nw * 0.24, ny - nw * 0.06 + (i === 1 ? -nw * 0.06 : 0), nw * 0.42, (i - 1) * 0.15 + Math.sin(this.time * 2 + i) * 0.05));
        this._img('nest_front', nx - nw / 2, top, nw, nh);
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
      g.fillStyle = 'rgba(120,80,40,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#fff8e8'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#f1d9a8'; g.stroke();
      const I = DN.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#8a6a4a', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#2e8c78', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, `${s1}: ${w.levelStars || 0}`, 0, -bh * 0.18, 40, '#8a6a4a', null, bw - 60);
        for (let i = 0; i < 5; i++) this._sprite('star', (i - 2) * 62, bh * 0.2, 56, Math.sin(this.time * 3 + i) * 0.1);
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
      } else if (type === 'appear') {
        for (let i = 0; i < 3; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 40, y: y + 20, vx: (R() - 0.5) * 60, vy: -20 - R() * 30, g: 0, t: 0, life: 0.45, size: 26 + R() * 14, rot: R() * TAU, vr: 0, grow: 1.6, a0: 0.6 });
      } else if (type === 'star') {
        // a star that flies from (x,y) to the HUD counter on an arc
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(70 * this.quality);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 18 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
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
        this._sprite(p.sprite, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = DN.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = DN.Assets.sprite(name, Math.max(w, h) * this.rs);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      const P = w.layout.play; g.strokeRect(P.x, P.y, P.w, P.h);
      for (const b of w.baskets || []) g.strokeRect(b.x - b.w / 2 - 30, b.y - b.h / 2 - 90, b.w + 60, b.h + 120);
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
    const r = DN.render;
    if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
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
  DN.Renderer = Renderer;
})(window.DN = window.DN || {});
