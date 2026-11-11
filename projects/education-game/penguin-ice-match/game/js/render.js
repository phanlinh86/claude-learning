/* IM.Render (Tuk's Ice Match) — draws the polar ice land through 4 weather stages, the frozen lake with the ice blocks
 * (frost cracks off / grows back), melt holes, the rewards (leaping fish, snow sculptures, animals going home, snowflake
 * stars), Tuk the penguin chick (belly slide), the sky, rainbow, aurora and juice on one canvas.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels. The static landscape is composed once per
 * resize/season and blitted; card faces/backs come cached from IM.CardArt; positions interpolate with world.alpha. */
(function (IM) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const INK = '#3d3a52';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CA = () => IM.CardArt;
  const SEASONS = ['sunny', 'breezy', 'rain', 'rainbow'];   // weather stages (env file suffixes)
  const FILL = { sunny: '#E1EDF5', breezy: '#E2E0EE', rain: '#D5DFE8', rainbow: '#E6F0F7' };
  const LAKE = ['#CFE6F2', '#D5E2EC', '#C3D6E3', '#D9EAF5'];   // frozen lake panel per stage (DESIGN §3)
  const LAKE_EDGE = ['#A9CFE4', '#B4C5D6', '#9DB8CC', '#B2D3E8'];
  const SPR = n => (n.indexOf('animal_') === 0 || n.indexOf('home_') === 0) ? n : 'animal_' + n;
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0', '#FF8FC0'];

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
      this._blinkT = 2; this._blink = 0; this._night = 0;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      this.landKey = ''; IM.Assets.dropExact();
    }

    /* ---------- static landscape ---------- */
    _landscape(layout, level) {
      const key = this.W + 'x' + this.H + '@' + this.rs + ':' + (level | 0) + ':' + layout.groundY;
      if (key === this.landKey && this.land) return this.land;
      const rs = this.rs, bw = this.canvas.width, bh = this.canvas.height;
      const c = this.land && this.land.width === bw && this.land.height === bh ? this.land : IM.Assets.makeCanvas(bw, bh);
      const g = c.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, bw, bh);
      const gy = layout.groundY;
      const k = this._layerScale(layout);   // tall portrait: bigger hills fill the sky behind the items
      const groundTop = gy - 30 - 40 * k, midBottom = gy - 10, farBottom = gy - 120;   // per env artist (k=1: tops gy-70 / gy-370 / gy-540)
      const layers = [
        { n: 'far_' + SEASONS[level | 0], w: 1200 * k, h: 420 * k, bottom: farBottom, off: 0.15 * 1300 * (this._chap | 0) },
        { n: 'mid_' + SEASONS[level | 0], w: 1200 * k, h: 360 * k, bottom: midBottom, off: 0.35 * 1300 * (this._chap | 0) },
        { n: 'ground_' + SEASONS[level | 0], w: 1200 * k, h: 260 * k, bottom: groundTop + 260 * k, off: 0 }
      ];
      for (const L of layers) {
        const tw = Math.round(L.w * rs), th = Math.round(L.h * rs);
        const tile = IM.Assets.exact(L.n, tw, th);
        if (!tile) continue;
        const y = Math.round((L.bottom - L.h) * rs);
        let x = -Math.round(((L.off % L.w) + L.w) % L.w * rs);
        for (; x < bw; x += tw) g.drawImage(tile, x, y);
        if (L.n.indexOf('ground') === 0 && y + th < bh) { // fill below the ground art if the screen is very tall
          g.fillStyle = FILL[SEASONS[level | 0]]; g.fillRect(0, y + th - 2, bw, bh - (y + th) + 2);
        }
      }
      this.land = c; this.landKey = key;
      return c;
    }
    _layerScale(layout) { return layout && layout.H > layout.W * 1.6 ? 1.36 : 1; }
    prewarm(layout, level) { // build tiles ahead of time (cheap when cached)
      const rs = this.rs, k = this._layerScale(layout), s = SEASONS[clamp(level | 0, 0, 3)];
      IM.Assets.exact('far_' + s, Math.round(1200 * k * rs), Math.round(420 * k * rs));
      IM.Assets.exact('mid_' + s, Math.round(1200 * k * rs), Math.round(360 * k * rs));
      IM.Assets.exact('ground_' + s, Math.round(1200 * k * rs), Math.round(260 * k * rs));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, W = this.W, H = this.H;
      this.lang = o.lang || 'en';
      this.time += o.dt || 0;
      const layout = world.layout;
      const amb = weather.ambient || {};
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1;
      this._sky(world, weather, amb, layout);
      for (const c of weather.clouds || []) this._sprite(c.sprite, c.x, c.y, 300 * (c.scale || 1), 0, c.alpha == null ? 1 : c.alpha);
      this._particles(weather.particles, 'sky');
      const season = o.title ? 0 : o.done ? 3 : clamp(world.level | 0, 0, 3);
      this._season = season; this._chap = o.title ? 0 : (world.level | 0);
      const land = this._landscape(layout, season);
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(land, 0, 0); g.setTransform(rs, 0, 0, rs, 0, 0);
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o);
      this._particles(weather.particles, 'front');
      this._fx(o.dt || 0);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug) this._debug(world);
    }
    _sky(world, weather, amb, layout) {
      const g = this.g, W = this.W, H = this.H, gy = layout.groundY, k = this._layerScale(layout);
      const sky = g.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, amb.skyTop || '#86C8F4'); sky.addColorStop(1, amb.skyBottom || '#DCF0FF');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      if (amb.horizon) {
        const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
        hz.addColorStop(0, amb.horizon + '00'); hz.addColorStop(0.6, amb.horizon + '88'); hz.addColorStop(1, amb.horizon + 'CC');
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
      // the sun stays high, above the card board
      const P = layout.board;
      const skyMax = Math.max(60 + (layout.ins ? layout.ins.top : 0), (P ? P.y - 20 : gy - 300) - 62);
      if ((amb.sun || 0) > 0.01) {
        const big = amb.sunY > 0.38 ? 180 : 150;
        this._sprite('sun', W * (amb.sunX == null ? 0.66 : amb.sunX), Math.min(skyMax, H * (amb.sunY == null ? 0.14 : amb.sunY)), big, 0, amb.sun);
      }
      if ((amb.rainbow || 0) > 0.01) {
        const rw = 0.95 * Math.max(W, 1200), rh = rw * 500 / 1200;
        this._sprite('rainbow', W / 2, gy - 330 * k - rh * 0.1, rw, 0, 0.9 * amb.rainbow);
      }
      if ((amb.moon || 0) > 0.01) {
        this._sprite('moon', W * (amb.moonX == null ? 0.78 : amb.moonX), Math.min(skyMax, H * (amb.moonY == null ? 0.14 : amb.moonY)), 150, 0, amb.moon);
      }
    }

    /* ---------- the round ---------- */
    _game(w, o) {
      const a = w.alpha == null ? 1 : w.alpha;
      const L = w.layout;
      this._groundY = L.groundY;
      const showPanel = w.state === 'round' && w.phase !== 'done';   // between rounds the rewards fill the forest
      this._panelA = clamp((this._panelA == null ? 0 : this._panelA) + (showPanel ? 1 : -1) * (o.dt || 0) * 3, 0, 1);
      this._panel(L, w);
      if (L.grid && (L.grid.style === 'floes' || L.grid.style === 'pond')) this._pads(w, a);
      for (const c of w.cards || []) if (c.state === 'gone' && c.hole) this._hole(c);
      const rws = (w.rewards || []).slice().sort((p, q) => p.y - q.y);   // back row first
      for (const r of rws) if (r.kind === 'animal' && r.badge) this._badge(r);
      this._dee(w, o, a);
      const cards = (w.cards || []).filter(c => c.state !== 'gone');
      // resting blocks first, lifted ones next, matched (gliding) blocks last
      const ord = c => (c.state === 'matched' ? 2 : 0) + (c.lift || 0);
      cards.sort((p, q) => ord(p) - ord(q));
      for (const c of cards) this._card(c, a);
      for (const r of rws) this._reward(r, a);
    }
    _pads(w, a) {   // surprise "floes" round: every block sits on its own little ice floe in dark water
      const g = this.g, k = this._panelA == null ? 1 : this._panelA;
      if (k <= 0.01) return;
      g.save(); g.globalAlpha = k;
      for (const c of w.cards || []) {
        if (c.state === 'gone' || c.state === 'deal') continue;
        const x = c._px == null ? c.x : lerp(c._px, c.x, a), y = (c._py == null ? c.y : lerp(c._py, c.y, a)) + c.h * 0.08;
        const rx = c.w * 0.68, ry = c.h * 0.62, seed = (String(c.id).length * 7 + (c.key ? String(c.key).length : 3)) | 0;
        g.fillStyle = 'rgba(60,110,150,.32)'; g.beginPath(); g.ellipse(x, y + 6, rx + 10, ry + 8, 0, 0, TAU); g.fill();
        g.beginPath();
        for (let i = 0; i <= 9; i++) {
          const t = i / 9 * TAU, j = 1 + 0.07 * Math.sin(t * 3 + seed);
          const px = x + Math.cos(t) * rx * j, py = y + Math.sin(t) * ry * j;
          i ? g.lineTo(px, py) : g.moveTo(px, py);
        }
        g.closePath(); g.fillStyle = '#F2F9FD'; g.fill(); g.lineWidth = 3; g.strokeStyle = '#8DB8D2'; g.stroke();
      }
      g.restore();
    }
    _panel(L, w) {   // the frozen lake behind the blocks (wet sheen in the rain, aurora shimmer in the aurora surprise)
      const G = L.grid;
      if (!G || !G.rect) return;
      const g = this.g, R = G.rect, pad = Math.max(20, G.gap * 1.4), st = this._season || 0;
      const k = this._panelA == null ? 1 : this._panelA;
      if (k <= 0.01) return;
      const x = R.x - pad, y = R.y - pad, ww = R.w + pad * 2, hh = R.h + pad * 2;
      g.save(); g.globalAlpha = k * 0.92;
      g.fillStyle = 'rgba(70,110,150,.16)'; g.beginPath(); roundRect(g, x + 2, y + 8, ww, hh, 48); g.fill();
      const gr = g.createLinearGradient(x, y, x + ww * 0.4, y + hh);
      gr.addColorStop(0, '#EEF8FD'); gr.addColorStop(1, LAKE[st]);
      g.fillStyle = gr; g.beginPath(); roundRect(g, x, y, ww, hh, 48); g.fill();
      g.lineWidth = 4; g.strokeStyle = LAKE_EDGE[st]; g.stroke();
      g.save(); g.beginPath(); roundRect(g, x, y, ww, hh, 48); g.clip();
      // ice streaks / skate lines
      g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 3; g.lineCap = 'round';
      for (let i = 0; i < 5; i++) {
        const sx = x + ww * (0.1 + i * 0.2), sy = y + hh * (0.15 + (i % 3) * 0.28);
        g.beginPath(); g.moveTo(sx, sy); g.lineTo(sx + ww * 0.12, sy - hh * 0.05); g.stroke();
      }
      if (st === 2) {   // rain: a wet sheen band slides across
        const u = (this.time * 0.08) % 1, bx = x - ww * 0.3 + u * ww * 1.6;
        const sh = g.createLinearGradient(bx, 0, bx + ww * 0.3, 0);
        sh.addColorStop(0, 'rgba(255,255,255,0)'); sh.addColorStop(0.5, 'rgba(255,255,255,.28)'); sh.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = sh; g.fillRect(x, y, ww, hh);
      }
      const au = clamp(w && w.aurora || 0, 0, 1);
      if (au > 0.01) {   // aurora surprise: green-lilac curtains shimmer over the lake
        for (let i = 0; i < 3; i++) {
          const ph = this.time * 0.6 + i * 2.1, cx = x + ww * (0.25 + 0.25 * i) + Math.sin(ph) * 30;
          const ag = g.createRadialGradient(cx, y + hh * 0.3, 10, cx, y + hh * 0.3, hh * 0.7);
          ag.addColorStop(0, `rgba(${i === 1 ? '190,150,255' : '120,235,190'},${0.32 * au})`); ag.addColorStop(1, 'rgba(120,235,190,0)');
          g.fillStyle = ag; g.fillRect(x, y, ww, hh);
        }
      }
      g.restore();
      g.restore();
    }
    _hole(c) {   // the melt hole left by a matched pair (until its reward has left)
      const art = CA(); if (!art || !art.drawHole) return;
      const al = clamp(c.holeA == null ? 1 : c.holeA, 0, 1); if (al <= 0.01) return;
      const g = this.g; g.save(); g.globalAlpha = al; g.translate(c.x, c.y + c.h * 0.08);
      art.drawHole(g, c.w * 0.86, c.h * 0.5, clamp(c.holeT == null ? 1 : c.holeT, 0, 1)); g.restore();
    }
    _badge(r) {   // the home badge an animal hops to (homes topic)
      const b = r.badge; if (!b) return;
      const al = clamp((b.alpha == null ? 1 : b.alpha) * (r.alpha == null ? 1 : r.alpha), 0, 1); if (al <= 0.01) return;
      const g = this.g, s = b.size || 80;
      g.fillStyle = `rgba(60,90,120,${0.16 * al})`; g.beginPath(); g.ellipse(b.x, b.y + s * 0.46, s * 0.4, s * 0.08, 0, 0, TAU); g.fill();
      this._sprite('home_' + r.home, b.x, b.y, s, 0, al);
    }
    _cardShadow(cw, ch, lift) {
      const g = this.g;
      g.fillStyle = `rgba(50,90,130,${0.2 - 0.07 * lift})`;
      g.beginPath(); roundRect(g, -cw / 2 + 3 + lift * 4, -ch / 2 + 7 + lift * 10, cw, ch, cw * 0.16); g.fill();
    }
    _card(c, a) {
      const g = this.g;
      const x = c._px == null ? c.x : lerp(c._px, c.x, a), y = c._py == null ? c.y : lerp(c._py, c.y, a);
      const rot = c._prot == null ? (c.rot || 0) : lerp(c._prot, c.rot || 0, a);
      const flip = c._pflip == null ? (c.flip || 0) : lerp(c._pflip, c.flip || 0, a);
      const lift = clamp(c.lift || 0, 0, 1), al = c.alpha == null ? 1 : clamp(c.alpha, 0, 1);
      if (al <= 0.01) return;
      const liftPx = ((IM.CONFIG && IM.CONFIG.liftPx) || 8) * lift;
      g.save(); g.globalAlpha = al;
      g.translate(x, y); g.rotate(rot); g.scale(c.sx || 1, c.sy || 1);
      // the shadow stays on the ice, the block rises (slide surprise only)
      this._cardShadow(c.w, c.h, lift);
      g.translate(0, -liftPx);
      const art = CA();
      if (art) {
        const opt = { glow: c.glow || 0, crack: c.crack || 0, seed: c.seed != null ? c.seed : (c.id | 0) * 7919 + 13,
          sprite: (n, sx, sy, sz) => this._sprite(SPR(n), sx, sy, sz) };
        if (art.drawIce) art.drawIce(g, c.w, c.h, c.face, 1 - clamp(flip, 0, 1), opt);
        else art.drawCard(g, c.w, c.h, c.face, flip, opt);
        if ((c.glint || 0) > 0.02 && flip < 0.1) this._sprite('sparkle', c.w * 0.22, -c.h * 0.24, 26, this.time * 2, clamp(c.glint * 2.5, 0, 1));
        if ((c.melt || 0) > 0.02) {   // wet sheen while melting
          g.fillStyle = `rgba(255,255,255,${0.35 * clamp(c.melt, 0, 1)})`; g.beginPath(); roundRect(g, -c.w / 2, -c.h / 2, c.w, c.h, c.w * 0.16); g.fill();
        }
      } else { g.fillStyle = flip > 0.5 ? '#DDF1FB' : '#F2F8FC'; g.fillRect(-c.w / 2, -c.h / 2, c.w, c.h); }
      g.restore();
    }
    _reward(r, a) {
      const g = this.g, art = CA();
      const al = r.alpha == null ? 1 : clamp(r.alpha, 0, 1);
      if (al <= 0.01 || !art) return;
      const x = r._px == null ? r.x : lerp(r._px, r.x, a), y = r._py == null ? r.y : lerp(r._py, r.y, a);
      const rot = r._prot == null ? (r.rot || 0) : lerp(r._prot, r.rot || 0, a);
      g.save(); g.globalAlpha = al;
      switch (r.kind) {
        case 'fish': case 'fishes':
          for (const p of r.pieces || []) {
            if (p.state !== 'air') continue;
            const px = p._px == null ? p.x : lerp(p._px, p.x, a), py = p._py == null ? p.y : lerp(p._py, p.y, a);
            const pr = p._prot == null ? (p.rot || 0) : lerp(p._prot, p.rot || 0, a);
            g.save(); g.translate(px, py); g.rotate(pr); if ((p.face || 1) < 0) g.scale(1, -1); g.scale(r.sx || 1, r.sy || 1);
            art.drawFish(g, p.color || r.color || 'orange', r.pieceSize || r.size || 56, p.wag != null ? p.wag : (this.time * 3) % 1);
            g.restore();
          }
          break;
        case 'sculpture': {
          const s = r.size || 60, bot = art.sculptureBottom ? art.sculptureBottom(r.shape || 'circle', s) : s * 0.5;
          g.fillStyle = 'rgba(50,90,130,.18)'; g.beginPath(); g.ellipse(x, y - 1, s * 0.42, s * 0.08, 0, 0, TAU); g.fill();
          g.translate(x, y); g.rotate(rot); g.scale(r.sx || 1, r.sy || 1); g.translate(0, -bot);
          art.drawSculpture(g, r.shape || 'circle', r.color || 'blue', s, r.glow == null ? 0.4 : r.glow);
          break;
        }
        case 'star':
          g.translate(x, y); g.rotate(rot); g.scale(r.sx || 1, r.sy || r.sx || 1);
          art.drawStar(g, r.size || 44, r.text, { twinkle: 0.5 + 0.5 * Math.sin(this.time * 3 + (r.id ? String(r.id).length : 0)) });
          break;
        case 'animal': {
          const s = r.size || 70;
          if (r.state !== 'fly') { g.fillStyle = 'rgba(50,90,130,.18)'; g.beginPath(); g.ellipse(x, y - 2, s * 0.32, s * 0.06, 0, 0, TAU); g.fill(); }
          g.translate(x, y); g.rotate(rot); g.scale((r.sx || 1) * ((r.face || 1) < 0 ? -1 : 1), r.sy || 1);
          this._sprite(SPR(r.sprite || 'seal'), 0, -s / 2, s);
          break;
        }
      }
      g.restore();
    }

    _dee(w, o, a) {
      const L = w.layout.tuk || w.layout.dee, m = w.tuk || w.dee || {};
      let frame = 'tuk_idle';
      const mood = m.mood || 'idle';
      if (mood === 'happy') frame = 'tuk_happy';
      else if (mood === 'cheer') frame = 'tuk_cheer';
      else if (mood === 'think') frame = 'tuk_think';
      else if (mood === 'oops') frame = 'tuk_oops';
      if (frame === 'tuk_idle') {
        if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) frame = 'tuk_talk';
        else if (this._blinking(o.dt)) frame = 'tuk_blink';
      }
      const hop = m.hop || 0;
      if (this._lastHop > 2 && hop <= 2) this._landSquash = 0.22;
      this._lastHop = hop;
      this._landSquash = Math.max(0, (this._landSquash || 0) - (o.dt || 0));
      const sq = this._landSquash > 0 ? 0.92 + 0.08 * (1 - this._landSquash / 0.22) : 1;
      const breathe = (1 + 0.018 * Math.sin(this.time * 2.6)) * sq;
      if (m.belly || Math.abs(m.slide || 0) > 1) {   // the belly slide: Tuk tips forward onto his tummy and glides
        const sx = L.x + (m.slide || 0);
        const g = this.g, box = L.h * 256 / 239;
        g.fillStyle = 'rgba(50,90,130,.2)'; g.beginPath(); g.ellipse(sx, L.y - 2, box * 0.36, box * 0.05, 0, 0, TAU); g.fill();
        const spr = IM.Assets.sprite('tuk_cheer', box * this.rs) || IM.Assets.sprite('tuk_idle', box * this.rs);
        if (spr) {
          g.save(); g.translate(sx, L.y - box * 0.17); g.rotate(m.belly ? 1.25 : 0.4);
          g.drawImage(spr, -box / 2, -box * 0.56, box, box); g.restore();
        }
        return;
      }
      this._character(frame, L.x, L.y - hop, L.h, breathe, L.y, hop);
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }
    _character(frame, x, y, h, breathe, groundY, hop) {
      const g = this.g, box = h * 256 / 239;      // Tuk's drawing fills y 9–248 (239 px) of the 256 box
      const spr = IM.Assets.sprite(frame, box * this.rs) || IM.Assets.sprite('tuk_idle', box * this.rs);
      const sy = groundY == null ? y : groundY, shk = 1 / (1 + (hop || 0) / 60);
      g.fillStyle = `rgba(50,90,130,${0.22 * shk})`;
      g.beginPath(); g.ellipse(x, sy - box * 0.02, box * 0.3 * shk, box * 0.05 * shk, 0, 0, TAU); g.fill();
      if (!spr) return;
      g.save(); g.translate(x, y); g.scale(1 / (breathe * 0.5 + 0.5), breathe);
      g.drawImage(spr, -box * 128 / 256, -box * 244 / 256, box, box);
      g.restore();
    }

    /* ---------- title & celebration ---------- */
    _titleScene(w, o) {
      const L = w.layout, W = this.W, H = this.H, portrait = H > W;
      const h = portrait ? Math.min(300, H * 0.2) : Math.min(260, H * 0.38);
      const x = portrait ? W * 0.3 : L.ins.left + W * 0.15, y = L.groundY + 10;
      const cyc = this.time % 2.4;
      const frame = cyc < 0.5 ? 'tuk_happy' : cyc < 0.62 ? 'tuk_blink' : 'tuk_idle';
      const hop = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) * 18 : 0;
      // three ice blocks whose frost cracks off and grows back on its own, one after another
      const cw = portrait ? 104 : 96, ch = cw / 0.9;
      const cx0 = portrait ? W * 0.68 : W - L.ins.right - Math.max(180, W * 0.15), cy = L.groundY - ch * 0.55;
      const faces = [{ kind: 'color', value: 'red', color: 'red' }, { kind: 'animal', value: 'seal', sprite: 'animal_seal' }, { kind: 'shape', value: 'star', shape: 'star', color: 'yellow' }];
      const art = CA();
      for (let i = 0; i < 3; i++) {
        const ph = ((this.time * 0.4 + i / 3) % 1), f = ph < 0.12 ? ph / 0.12 : ph < 0.55 ? 1 : ph < 0.8 ? 1 - (ph - 0.55) / 0.25 : 0;
        const crack = ph < 0.12 ? ph / 0.12 : 0;
        const fx = cx0 + (i - 1) * (cw + 14), fy = cy + (i === 1 ? -16 : 0);
        const g = this.g; g.save(); g.translate(fx, fy); g.rotate((i - 1) * 0.06);
        this._cardShadow(cw, ch, 0);
        if (art && art.drawIce) art.drawIce(g, cw, ch, faces[i], 1 - f, { crack, seed: 31 + i * 17, sprite: (n, sx, sy, sz) => this._sprite(SPR(n), sx, sy, sz) });
        g.restore();
      }
      this._character(frame, x, y - hop, h, 1 + 0.02 * Math.sin(this.time * 2.6), y, hop);
    }
    _doneScene(w, o) {   // the rainbow party: every friend of the session on the snow, fish leaping, sculptures, Tuk cheering
      const L = w.layout, W = this.W, H = this.H, t = this.time, art = CA();
      const col = w.collected || [];
      const an = col.filter(r => r.kind === 'animal').map(r => r.sprite);
      const friends = an.length ? an : (IM.ANIMALS || []).map(a => 'animal_' + a);
      const x0 = L.ins.left + 40, x1 = W - L.ins.right - 40, n = Math.min(friends.length, 10);
      const step = Math.min(100, (x1 - x0) / Math.max(1, n)), s = Math.min(76, step * 0.95);
      const sx = (x0 + x1) / 2 - step * (n - 1) / 2;
      if (art) {   // snow sculptures on the far snow line
        const sc = col.filter(r => r.kind === 'sculpture').slice(0, 6);
        for (let i = 0; i < sc.length; i++) {
          const lx = L.ins.left + 70 + i * ((W - L.ins.left - L.ins.right - 140) / Math.max(1, sc.length - 1 || 1));
          this.g.save(); this.g.translate(lx, L.groundY - 40); art.drawSculpture(this.g, sc[i].shape || 'star', sc[i].color || 'blue', 50, 0.5 + 0.3 * Math.sin(t * 2 + i)); this.g.restore();
        }
      }
      for (let i = 0; i < n; i++) {
        const hop = Math.max(0, Math.sin(t * 3.2 + i * 0.9)) * 14;
        this._sprite(SPR(friends[i]), sx + i * step, L.groundY + 34 - hop - s / 2, s);
      }
      if (art) {   // fish leaping in parabolas across the sky
        const fc = col.filter(r => r.kind === 'fish').map(r => r.color);
        const cols = fc.length ? fc : ['red', 'blue', 'yellow', 'purple', 'green'];
        for (let i = 0; i < Math.min(cols.length, 8); i++) {
          const u = (t * 0.35 + i * 0.29) % 1, span = W * 0.32, bx = W * ((i * 0.618 + 0.12) % 0.8) + u * span;
          const by = H * 0.42 - Math.sin(u * Math.PI) * H * 0.24;
          const ang = Math.atan2(-Math.cos(u * Math.PI) * H * 0.24 * Math.PI, span);
          this.g.save(); this.g.translate(bx, by); this.g.rotate(ang);
          art.drawFish(this.g, cols[i], 52, (t * 3 + i * 0.3) % 1); this.g.restore();
        }
      }
      const hgt = Math.min(H * (o && o.compact ? 0.48 : 0.32), 320);
      const cyc = t % 1.1, hop = cyc < 0.55 ? Math.sin(cyc / 0.55 * Math.PI) * 34 : 0;
      const y = o && o.compact ? L.groundY - 10 : Math.min(L.groundY - 20, H * (H > W ? 0.4 : 0.52));
      const cx = o && o.compact ? L.ins.left + W * 0.18 : W / 2;
      this._character(cyc < 0.55 ? 'tuk_cheer' : 'tuk_happy', cx, y - hop, hgt, 1, y, hop);
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, L = w.layout;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((IM.CONFIG && IM.CONFIG.introTime) || 1.8) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = clamp((L.board ? L.board.y + L.board.h * 0.45 : this.H * 0.45), L.ins.top + 120, this.H - 300);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(40,60,110,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FBFDFF'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#BFD8EE'; g.stroke();
      const I = IM.I18N, lang = this.lang;
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

    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random;
      if (type === 'pop') {
        const col = (CA() && CA().COLORS && CA().COLORS[opt.color]) ? CA().COLORS[opt.color].base : CONF[(Math.random() * CONF.length) | 0], size = opt.size || 110;
        fx.push({ k: 'flash', x, y, t: 0, life: 0.32, size, color: opt.color || 'red' });
        const n = Math.round(24 * this.quality);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 220 + R() * 360;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: col, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
            g: 520, drag: 1.4, t: 0, life: 0.9 + R() * 0.5, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 14, sway: R() * TAU });
        }
        for (let i = 0; i < 5; i++) {
          const a = R() * TAU, sp = 90 + R() * 140;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, t: 0, life: 0.5 + R() * 0.2, size: 20 + R() * 12, rot: R() * TAU, vr: 4 });
        }
      } else if (type === 'rainbow') {   // the magic pair: a rainbow arc grows out of the burst + golden sparkles
        fx.push({ k: 'rainbow', x, y, t: 0, life: 2.2, size: Math.min(this.W, this.H) * 0.42 });
        for (let i = 0; i < 26; i++) {
          const a = R() * TAU, sp = 120 + R() * 300;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, g: 200, t: 0, life: 1 + R() * 0.6, size: 22 + R() * 18, rot: R() * TAU, vr: 5 });
        }
      } else if (type === 'shards') {   // frost cracking off a block: ice shards + frost puffs fly out
        const sz = opt.size || 110, n = Math.round(10 * this.quality);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 160 + R() * 260;
          fx.push({ k: 'p', sprite: 'shard', x: x + Math.cos(a) * sz * 0.25, y: y + Math.sin(a) * sz * 0.25, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 140,
            g: 900, t: 0, life: 0.55 + R() * 0.25, size: 12 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 16 });
        }
        for (let i = 0; i < 3; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * sz * 0.6, y: y + (R() - 0.5) * sz * 0.5, vx: (R() - 0.5) * 60, vy: -30, g: 0, t: 0, life: 0.5, size: 26, rot: 0, vr: 0, grow: 1.8, a0: 0.55 });
      } else if (type === 'sparkle' || type === 'glint') {
        const n = type === 'glint' ? 12 : 6;
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 70 + R() * 180;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 120, t: 0, life: 0.6 + R() * 0.3, size: 18 + R() * 14, rot: R() * TAU, vr: 5 });
        }
        if (type === 'glint') fx.push({ k: 'flash', x, y, t: 0, life: 0.32, size: opt.size || 110 });
      } else if (type === 'splash') {   // a fish dives into the sea
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 1.6, sp = 160 + R() * 200;
          fx.push({ k: 'p', sprite: 'drop', x: x + (R() - 0.5) * 20, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 1100, t: 0, life: 0.6, size: 12 + R() * 8, rot: 0, vr: 0 });
        }
        fx.push({ k: 'ring', x, y, t: 0, life: 0.5, size: 70, color: '255,255,255' });
      } else if (type === 'land') {
        for (let i = 0; i < 4; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 40, y: y - 6, vx: (R() - 0.5) * 90, vy: -20 - R() * 30, g: 40, t: 0, life: 0.45, size: 20 + R() * 10, rot: R() * TAU, vr: 0, grow: 1.5, a0: 0.6 });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(120 * this.quality), cols = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0', '#FF8FC0'];
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: cols[i % cols.length], x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'hint') {
        const r0 = (opt.size || 110) * 0.75;
        for (let i = 0; i < 7; i++) { const a = i / 7 * TAU; fx.push({ k: 'p', sprite: 'sparkle', x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20, g: 0, t: 0, life: 0.9, size: 22, rot: 0, vr: 3 }); }
      } else if (type === 'wrong') {
        fx.push({ k: 'ring', x, y, t: 0, life: 0.35, size: (opt.size || 110) * 1.1, color: '255,255,255' });
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
          if (f.drag) { f.vx *= 1 - f.drag * dt; f.vy = Math.min(f.vy, 160); f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const s = f.size * (f.grow ? 1 + (f.grow - 1) * u : 1);
          const al = (f.a0 || 1) * (u > 0.7 ? (1 - u) / 0.3 : 1);
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, s, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, s, f.rot, al);
        } else if (f.k === 'flash') {
          g.strokeStyle = `rgba(255,250,220,${0.9 * (1 - u)})`; g.lineWidth = 8 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.25 + 0.6 * u), 0, TAU); g.stroke();
          g.fillStyle = `rgba(255,255,240,${0.55 * (1 - u) * (1 - u)})`; g.beginPath(); g.arc(f.x, f.y, f.size * 0.35 * (1 - u * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'rainbow') {
          const grow = Math.min(1, u * 3), fade = u > 0.7 ? (1 - u) / 0.3 : 1;
          const cols = ['#E84A4A', '#FF9A2E', '#FFD23F', '#4CC26B', '#3C8DE8', '#9B6BE0'];
          g.save(); g.globalAlpha = 0.75 * fade; g.lineCap = 'round';
          cols.forEach((c, i) => {
            g.strokeStyle = c; g.lineWidth = f.size * 0.045;
            g.beginPath(); g.arc(f.x, f.y + f.size * 0.25, f.size * (0.62 - i * 0.05), Math.PI, Math.PI + Math.PI * grow); g.stroke();
          });
          g.restore();
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color || '255,240,150'},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.ellipse(f.x, f.y, f.size * (0.3 + u * 0.5), f.size * (0.3 + u * 0.5), 0, 0, TAU); g.stroke();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = IM.Assets.tinted ? IM.Assets.tinted(name, color, size * this.rs) : IM.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }

    _particles(list, layer) {
      if (!list) return;
      const g = this.g;
      for (const p of list) if ((p.layer || 'back') === layer && p.alpha > 0.01) {
        if (p.sprite === 'dot') { g.fillStyle = `rgba(255,255,255,${p.alpha})`; g.beginPath(); g.arc(p.x, p.y, p.size / 2, 0, TAU); g.fill(); continue; }
        const nm = p.sprite === 'star' ? 'pstar' : p.sprite;
        if ((p.stretch && p.stretch !== 1) || (p.scaleY && p.scaleY !== 1)) {
          const spr = IM.Assets.sprite(nm, p.size * this.rs * Math.max(1, p.stretch || 1)); if (!spr) continue;
          const k = p.size / Math.max(spr.width, spr.height), ww = spr.width * k, hh = spr.height * k;
          g.save(); g.globalAlpha *= p.alpha; g.translate(p.x, p.y); g.rotate(p.rot || 0);
          g.scale((p.flipX === -1 ? -1 : 1) * (p.stretch || 1), p.scaleY || 1);
          g.drawImage(spr, -ww / 2, -hh / 2, ww, hh); g.restore();
          continue;
        }
        this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX === -1);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = IM.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = IM.Assets.sprite(name, Math.max(w, h) * this.rs);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      const B = w.layout.board; if (B) g.strokeRect(B.x, B.y, B.w, B.h);
      for (const c of w.cards || []) g.strokeRect(c.x - c.w / 2 - 10, c.y - c.h / 2 - 10, c.w + 20, c.h + 20);
      g.fillStyle = 'rgba(255,0,0,.5)';
      for (const p of w.layout.perches || []) { g.beginPath(); g.arc(p.x, p.y, 4, 0, TAU); g.fill(); }
    }
    /* A card face (or a little card fan for counts) for Talk-time previews and choices. */
    drawItemBody(g, it, s) {
      const art = CA(); if (!art) return;
      const face = it.face || it;
      if (face.kind === 'color' && art.drawFish && it.bare) { art.drawFish(g, face.color || face.value, s * 0.8, 0.2); return; }
      const ch = s * 0.78, cw = ch * 0.9;
      this._cardShadow(cw, ch, 0);
      art.drawFront(g, cw, ch, face, { sprite: (n, sx, sy, sz) => this._sprite(SPR(n), sx, sy, sz, 0, 1, g === this.g ? null : g) });
    }
  }

  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = IM.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, Math.min(ch * 0.98, cw * 1.2));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  IM.Renderer = Renderer;
})(window.IM = window.IM || {});
