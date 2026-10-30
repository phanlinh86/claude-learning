/* PG.Render — draws the garden, Pip with his basket, bubbles, weather and juice on one canvas.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels.
 * Performance: the static landscape (far + mid + ground) is composed once per resize/chapter into a
 * canvas at backing-store size and blitted pixel-exact; sprites come pre-rasterized from PG.Assets;
 * entity positions are interpolated between fixed simulation steps (world.alpha). */
(function (PG) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const INK = '#4a3424';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };

  function pal(key) {
    const P = PG.PALETTE || {};
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
      this.landKey = ''; PG.Assets.dropExact();
    }

    /* ---------- static landscape ---------- */
    _landscape(layout, level) {
      const key = this.W + 'x' + this.H + '@' + this.rs + ':' + (level | 0) + ':' + layout.groundY;
      if (key === this.landKey && this.land) return this.land;
      const rs = this.rs, bw = this.canvas.width, bh = this.canvas.height;
      const c = this.land && this.land.width === bw && this.land.height === bh ? this.land : PG.Assets.makeCanvas(bw, bh);
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
        const tile = PG.Assets.exact(L.n, tw, th);
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
    _layerScale(layout) { return layout && layout.H > layout.W * 1.6 ? 1.36 : 1; }
    prewarm(layout, level) { // build tiles ahead of time (cheap when cached)
      const rs = this.rs, k = this._layerScale(layout);
      PG.Assets.exact('far', Math.round(1200 * k * rs), Math.round(420 * k * rs));
      PG.Assets.exact('mid', Math.round(1200 * k * rs), Math.round(360 * k * rs));
      PG.Assets.exact('ground', Math.round(1200 * k * rs), Math.round(260 * k * rs));
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
      if ((amb.darkness || 0) > 0.01) {   // darker sky, lighter play band near the ground
        const d = amb.darkness / 0.25, dg = g.createLinearGradient(0, 0, 0, H);
        dg.addColorStop(0, `rgba(30,40,60,${0.28 * d})`); dg.addColorStop(1, `rgba(30,40,60,${0.12 * d})`);
        g.fillStyle = dg; g.fillRect(0, 0, W, H);
      }
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
      const items = w.items || [];
      if (o.done) { this._donePup(w); return; }
      const b = w.basket || {};
      const bx = b._px == null ? b.x : lerp(b._px, b.x, a), by = b._py == null ? b.y : lerp(b._py, b.y, a);
      // ground shadows for bubbles that are low (cheap depth cue)
      for (const it of items) if (!it.inBasket && it.state !== 'leave') this._groundShadow(it, a, w.layout.groundY);
      this._pup(w, o, a);
      this._basket(w, b, bx, by, items, a);
      for (const it of items) if (!it.inBasket) this._item(it, a);
    }
    _groundShadow(it, a, gy) {
      const [x, y] = this._pos(it, a);
      const d = gy - y; if (d > 520 || d < -20) return;
      const k = 1 - clamp(d / 520, 0, 1), s = it.size * 0.5 * (0.5 + 0.5 * k);
      const g = this.g;
      g.fillStyle = `rgba(40,50,20,${0.16 * k * (it.alpha == null ? 1 : it.alpha)})`;
      g.beginPath(); g.ellipse(x, gy + 8, s, s * 0.22, 0, 0, TAU); g.fill();
    }
    _donePup(w) {
      const H = this.H, W = this.W, h = Math.min(H * 0.36, 360);
      const cyc = this.time % 1.1, hop = cyc < 0.55 ? Math.sin(cyc / 0.55 * Math.PI) * 40 : 0;
      const y = H > W ? w.layout.groundY + 6 : Math.min(w.layout.groundY + 6, H * 0.55);   // portrait: stand on the grass
      this._character(cyc < 0.55 ? 'pup_cheer' : 'pup_happy', W / 2, y - hop, h, 1, y, hop, 0, false);
    }

    _pupFrame(p, o) {
      const mood = p.mood || 'idle';
      if (mood !== 'idle') return { f: 'pup_' + mood, run: false };
      if ((p.run || 0) > 0.08) return { f: Math.sin(p.step || 0) >= 0 ? 'pup_run1' : 'pup_run2', run: true };
      if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) return { f: 'pup_talk', run: false };
      if (this._blinking(o.dt)) return { f: 'pup_blink', run: false };
      return { f: 'pup_idle', run: false };
    }
    _pup(w, o, a) {
      const L = w.layout.pup, p = w.pup || {};
      const x = p._px == null ? p.x : lerp(p._px, p.x, a);
      const fr = this._pupFrame(p, o);
      const hop = p.hop || 0;
      if (this._lastHop > 2 && hop <= 2) this._landSquash = 0.22;
      this._lastHop = hop;
      this._landSquash = Math.max(0, (this._landSquash || 0) - (o.dt || 0));
      const sq = this._landSquash > 0 ? 0.93 + 0.07 * (1 - this._landSquash / 0.22) : 1;
      const breathe = (1 + 0.018 * Math.sin(this.time * 2.6)) * sq;
      // run frames are drawn facing right; mirror them when Pip runs left
      this._character(fr.f, x, L.y - hop, L.h, breathe, L.y, hop, p.tilt || 0, fr.run && (p.face || 1) < 0);
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }
    _character(frame, x, y, h, breathe, groundY, hop, tilt, flip) {
      const g = this.g, box = h * 256 / 208;      // Pip's silhouette ≈ 81 % (208 px) of the 256 box
      const spr = PG.Assets.sprite(frame, box * this.rs) || PG.Assets.sprite('pup_idle', box * this.rs);
      const sy = groundY == null ? y : groundY, shk = 1 / (1 + (hop || 0) / 60);
      g.fillStyle = `rgba(40,40,20,${0.2 * shk})`;
      g.beginPath(); g.ellipse(x, sy - box * 0.02, box * 0.3 * shk, box * 0.05 * shk, 0, 0, TAU); g.fill();
      if (!spr) return;
      g.save(); g.translate(x, y); if (tilt) g.rotate(tilt);
      g.scale((flip ? -1 : 1) / (breathe * 0.5 + 0.5), breathe);
      g.drawImage(spr, -box * 128 / 256, -box * 244 / 256, box, box);
      g.restore();
    }

    /* basket: back half → items inside → front half → Pip's paws on the rim → target tag */
    _basket(w, b, bx, by, items, a) {
      const g = this.g, bw = b.w || 210, bh = bw * 160 / 256;
      const top = by - bh * 40 / 160, bottom = top + bh * 150 / 160, left = bx - bw / 2;
      const sq = clamp(b.squash || 0, -0.3, 0.3), sh = b.shake || 0;
      g.save();
      g.translate(bx + sh * 10, bottom); g.rotate((b.wobble || 0) + sh * 0.06); g.scale(1 + sq, 1 - sq); g.translate(-bx, -bottom);
      if ((b.glow || 0) > 0.01) {
        const pulse = 0.65 + 0.35 * Math.sin(this.time * 8);
        const gr = g.createRadialGradient(bx, by, bw * 0.1, bx, by, bw * 0.8);
        gr.addColorStop(0, `rgba(255,236,120,${0.7 * b.glow * pulse})`); gr.addColorStop(1, 'rgba(255,236,120,0)');
        g.fillStyle = gr; g.beginPath(); g.ellipse(bx, by, bw * 0.8, bw * 0.55, 0, 0, TAU); g.fill();
      }
      this._img('basket_back', left, top, bw, bh);
      g.save();   // items inside: clip to the basket's inner volume so nothing pokes through the bottom
      g.beginPath(); g.rect(left - bw, top - 400, bw * 3, (bottom - top) * 0.82 + 400); g.clip();
      for (const it of items) if (it.inBasket) this._item(it, a, true);
      g.restore();
      this._img('basket_front', left, top, bw, bh);
      // Pip's front paws gripping the front rim
      const ph = w.layout.pup.h, pr = ph * 0.075;
      for (const s of [-1, 1]) this._paw(bx + s * bw * 0.36, by + bh * 0.1, pr, s);
      this._tag(w, bx, by + bh * 0.42, bw * 0.46);
      g.restore();
    }
    _paw(x, y, r, s) {
      const g = this.g;
      g.fillStyle = '#D9A066'; g.strokeStyle = '#8A5A2E'; g.lineWidth = Math.max(2, r * 0.2);
      g.beginPath(); g.ellipse(x, y, r * 1.1, r * 0.9, s * 0.2, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#FFF0D6'; g.beginPath(); g.ellipse(x - s * r * 0.15, y - r * 0.25, r * 0.45, r * 0.3, 0, 0, TAU); g.fill();
      g.strokeStyle = 'rgba(138,90,46,.8)'; g.lineWidth = Math.max(1.5, r * 0.12); g.lineCap = 'round';
      for (const k of [-0.4, 0.05, 0.5]) { g.beginPath(); g.moveTo(x + k * r, y + r * 0.35); g.lineTo(x + k * r * 0.9, y + r * 0.85); g.stroke(); }
    }
    /* the wooden tag on the basket shows what to catch (a picture, so non-readers know too) */
    _tag(w, cx, cy, tw) {
      const cur = w.cur; if (!cur || !cur.target) return;
      const g = this.g, T = cur.target;
      if (T.kind === 'number' || T.kind === 'parity') tw *= 1.55;   // maths needs room to stay readable on phones
      const th = Math.min(tw * 0.62, 0.62 * 0.46 * (w.basket.w || 210) * 1.2);
      const count = cur.mode === 'count';
      const h = count ? th * 1.25 : th;
      g.save();
      g.fillStyle = 'rgba(90,60,20,.22)'; g.beginPath(); roundRect(g, cx - tw / 2, cy - h / 2 + 3, tw, h, h * 0.3); g.fill();
      g.fillStyle = '#FFF6E2'; g.strokeStyle = '#B8823A'; g.lineWidth = 3;
      g.beginPath(); roundRect(g, cx - tw / 2, cy - h / 2, tw, h, h * 0.3); g.fill(); g.stroke();
      const iy = count ? cy - h * 0.16 : cy, ih = th * 0.78;
      const rightTpl = (cur.pool || []).find(p => p.right) || {};
      switch (T.kind) {
        case 'color': this._sprite('ball_' + T.value, cx, iy, ih); break;
        case 'shape': g.save(); g.translate(cx, iy); drawShape(g, T.value, rightTpl.anyColor || !rightTpl.color ? '#c9a877' : rightTpl.color, ih * 0.9); g.restore(); break;
        case 'size': this._sprite(rightTpl.sprite || 'ball_red', cx, iy + (T.value === 'small' ? ih * 0.15 : 0), T.value === 'big' ? ih : ih * 0.5); break;
        case 'fruit':
          this._sprite('fruit_' + T.value, cx - tw * 0.22, iy, ih * 0.9);
          outlinedText(g, String(cur.need), cx + tw * 0.2, iy + 2, ih * 0.8, INK, null, tw * 0.4);
          break;
        case 'animal':
          if (cur.promptKey === 'p.animalsSound') outlinedText(g, '♪', cx, iy, ih * 0.9, INK, null, tw);
          else this._sprite('animal_' + T.value, cx, iy, ih);
          break;
        case 'letter': outlinedText(g, cur.topic === 'lower' ? String(T.value).toLowerCase() : String(T.value), cx, iy + 2, ih * 0.9, INK, null, tw * 0.86); break;
        case 'number': outlinedText(g, String((cur.params && cur.params.sum) || T.value).replace('+', '+').replace('−', '−'), cx, iy + 2, ih * 0.66, INK, null, tw * 0.94); break;
        case 'parity': {
          const word = PG.I18N ? PG.I18N.name(this.lang, 'parity', T.value) : T.value;
          outlinedText(g, word, cx, iy - ih * 0.2, ih * 0.56, INK, null, tw * 0.9);
          outlinedText(g, T.value === 'odd' ? '1 3 5' : '2 4 6', cx, iy + ih * 0.32, ih * 0.46, '#8a6a4a', null, tw * 0.9);
          break;
        }
      }
      if (count) this._dots(cur.need, (w.basket && w.basket.count) || 0, cx, cy + h * 0.3, tw * 0.9, th * 0.32);
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
    _item(it, a, inBasket) {
      const g = this.g;
      const [x, y, rot] = this._pos(it, a);
      const s = it.size;
      let alpha = it.alpha == null ? 1 : it.alpha, k = 1;
      if (it.state === 'appear') { const t = clamp(it.appear == null ? 1 : it.appear, 0, 1); k = t <= 0 ? 0 : easeOutBack(t); alpha *= clamp(t * 3, 0, 1); }
      if (k <= 0.01 || alpha <= 0.01) return;
      g.save();
      g.globalAlpha = alpha;
      g.translate(x, y);
      const bub = inBasket ? 0 : clamp(it.bubble == null ? 0 : it.bubble, 0, 1);
      if ((it.glow || 0) > 0.01 && !inBasket) {   // hint: warm golden halo, gently pulsing
        const pulse = 0.7 + 0.3 * Math.sin(this.time * 7);
        const R = s * 1.05 * k;
        const gr = g.createRadialGradient(0, 0, s * 0.3, 0, 0, R);
        gr.addColorStop(0, `rgba(255,226,90,${0.75 * it.glow * pulse})`); gr.addColorStop(1, 'rgba(255,226,90,0)');
        g.fillStyle = gr; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.fill();
      }
      g.save(); g.rotate(rot); g.scale((it.sx || 1) * k, (it.sy || 1) * k);
      this.drawItemBody(g, it, s);
      g.restore();
      if (bub > 0.01) {
        const d = s * 1.35 * k * (0.6 + 0.4 * bub);
        g.save(); g.scale(it.bsx || 1, it.bsy || 1); g.rotate(Math.sin(this.time * 1.7 + it.id) * 0.08);
        g.globalAlpha = alpha * bub;
        this._sprite('bubble', 0, 0, d);
        g.restore();
      }
      g.restore();
    }
    /* Item visual centred at 0,0 with box size s (also used by the Talk-time previews). */
    drawItemBody(g, it, s) {
      if (it.sprite) this._sprite(it.sprite, 0, 0, s, 0, 1, g);
      else if (it.shape) drawShape(g, it.shape, it.color || 'blue', s * 0.86);
      if (it.text != null && it.text !== '') {
        const t = String(it.text);
        const px = t.length <= 2 ? s * 0.48 : t.length <= 3 ? s * 0.36 : s * 0.28;
        g.save(); g.translate(0, s * 0.02);
        outlinedText(g, t, 0, 0, px, INK, 'rgba(255,255,255,.85)', s * 0.66);
        g.restore();
      }
    }

    _titleScene(w, o) {
      const L = w.layout, W = this.W, H = this.H;
      const portrait = H > W;
      const h = portrait ? Math.min(330, H * 0.22) : Math.min(290, H * 0.4);
      const x = portrait ? W * 0.5 : L.ins.left + W * 0.17, y = L.groundY + 6;
      const cyc = this.time % 2.4;
      const frame = cyc < 0.5 ? 'pup_happy' : cyc < 0.62 ? 'pup_blink' : 'pup_idle';
      const hop = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) * 22 : 0;
      this._character(frame, x, y - hop, h, 1 + 0.02 * Math.sin(this.time * 2.6), y, hop, 0, false);
      // decorative bubbles drifting down on the right (or top in portrait)
      const balls = ['red', 'blue', 'yellow', 'green', 'purple'];
      const n = portrait ? 3 : 4;
      for (let i = 0; i < n; i++) {
        const per = 9 + i * 1.7, u = ((this.time + i * 3.1) % per) / per;
        // keep clear of the logo, tagline and Play button: a band above the logo (portrait) / the right edge (landscape)
        const bx = portrait ? W * (0.16 + 0.68 * i / (n - 1)) : W * (0.8 + 0.14 * (i / (n - 1))) - L.ins.right;
        const top = L.ins.top + (portrait ? 150 : 170), bottom = portrait ? Math.max(top + 60, H * 0.25) : L.groundY - 60;
        const by = lerp(top, bottom, u) , sx = Math.sin(this.time * 2.2 + i * 1.7) * 18;
        const a = clamp(u * 6, 0, 1) * clamp((1 - u) * 6, 0, 1);
        const s = portrait ? 96 : 92;
        this.g.save(); this.g.globalAlpha = a;
        this._sprite('ball_' + balls[i % balls.length], bx + sx, by, s, Math.sin(this.time * 1.5 + i) * 0.12);
        this._sprite('bubble', bx + sx, by, s * 1.35);
        this.g.restore();
      }
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, L = w.layout;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((1.8 - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = clamp(L.spawnY + (L.sky.bottom - L.spawnY) * 0.4, L.ins.top + 120, this.H - 300);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(120,80,40,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#fff8e8'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#f1d9a8'; g.stroke();
      const I = PG.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#8a6a4a', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#b8642a', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#8a6a4a', null, bw - 60);
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
      } else if (type === 'pop') {
        const sz = opt.size || 120;
        fx.push({ k: 'p', sprite: 'pop', x, y, vx: 0, vy: 0, g: 0, t: 0, life: 0.32, size: sz * 0.9, rot: R() * TAU, vr: 0, grow: 1.5, a0: 0.95 });
        const n = Math.round(6 * this.quality);
        for (let i = 0; i < n; i++) {
          const an = R() * TAU, sp = 120 + R() * 160;
          fx.push({ k: 'p', sprite: 'droplet', x: x + Math.cos(an) * sz * 0.4, y: y + Math.sin(an) * sz * 0.4, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 60, g: 700, t: 0, life: 0.45 + R() * 0.2, size: 12 + R() * 8, rot: an + Math.PI / 2, vr: 0 });
        }
      } else if (type === 'bounce') {
        for (let i = 0; i < 4; i++) fx.push({ k: 'p', sprite: 'droplet', x: x + (R() - 0.5) * 50, y, vx: (R() - 0.5) * 160, vy: -120 - R() * 120, g: 800, t: 0, life: 0.5, size: 12, rot: 0, vr: 0 });
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
      const spr = PG.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = PG.Assets.sprite(name, Math.max(w, h) * this.rs);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = w.layout;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(0, L.spawnY); g.lineTo(this.W, L.spawnY); g.moveTo(0, L.sky.bottom); g.lineTo(this.W, L.sky.bottom); g.stroke();
      const b = w.basket; g.strokeRect(b.x - b.w / 2, b.y - 10, b.w, 40);
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
    const r = PG.render;
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
        g.fillStyle = '#ff9a2e'; g.beginPath();
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
  PG.Renderer = Renderer;
})(window.PG = window.PG || {});
