/* LL.Render — draws the Whispering Jungle: sky (sun, moon, stars, clouds, birds at sunset, mist, noon sunbeams), parallax
 * jungle layers that scroll as Lolo swings to the next tree, the giant tree whose hanging leaves are the memory cards
 * (LL.LeafArt), Lolo the little monkey on her log (SVG body/head + code arm and tail from LL.LoloArt), the toucan, the frog and
 * the butterfly, weather particles (fireflies, petals, pollen) and juice (butterflies from every found pair).
 * Logical coordinates (short side 720) × render scale `rs` = device pixels. Positions interpolate with world.alpha. */
(function (LL) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const LA = () => LL.LeafArt;
  const KA = () => LL.LoloArt;
  const MOODS = ['morning', 'noon', 'sunset', 'night'];
  const FLOOR = { morning: '#5E7F4A', noon: '#5A8445', sunset: '#5E6A44', night: '#253B3E' };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0', '#FF8FC0'];
  const BFLY = ['#3C8DE8', '#FF9A2E', '#FFD23F', '#9B6BE0', '#FF8FC0', '#5FC7C9'];
  const DEF_TREE = { bark: '#8A6A4E', barkDark: '#5E4532', moss: '#8DBA6A', leaf: '#3E9A5E', leafDark: '#286B40', vine: '#6E8F3A', flower: '#E3C6F0', kind: 'kapok', seed: 1 };
  const ip = (o, k, a) => { if (!o) return undefined; const p = o['_p' + k]; const v = o[k]; return p == null || v == null ? v : lerp(p, v, a); };
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);

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
  function hash(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._lopt = {};
      this._spr = (n, x, y, s) => this._sprite(n, x, y, s);
      this._leafRects = [];
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      LL.Assets.dropExact();
    }
    _k(layout) { return layout && layout.H > layout.W * 1.6 ? 1.36 : 1; }
    prewarm(layout, mood) {
      const rs = this.rs, k = this._k(layout), m = MOODS[clamp(mood | 0, 0, 3)];
      LL.Assets.exact('far_' + m, Math.round(1200 * k * rs), Math.round(420 * k * rs));
      LL.Assets.exact('mid_' + m, Math.round(1200 * k * rs), Math.round(360 * k * rs));
      LL.Assets.exact('ground_' + m, Math.round(1200 * k * rs), Math.round(260 * k * rs));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, W = this.W, H = this.H;
      this.lang = o.lang || 'en';
      this.time += o.dt || 0;
      const L = world.layout, a = world.alpha == null ? 1 : world.alpha;
      const amb = weather.ambient || {};
      const mood = o.title ? 0 : o.done ? 3 : clamp(num(amb.mood, world.level | 0) | 0, 0, 3);
      this._mood = mood; this._amb = amb; this._weather = weather;
      const scroll = o.title ? this.time * 6 : (ip(world, 'scroll', a) || 0);
      g.setTransform(rs, 0, 0, rs, 0, 0); g.globalAlpha = 1;
      this._sky(world, weather, amb, L);
      this._jungle(L, mood, scroll, amb);
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
      const dk = num(amb.darkness, 0);
      if (dk > 0.01) { g.fillStyle = `rgba(12,22,52,${clamp(dk, 0, 0.7)})`; g.fillRect(0, 0, W, H); }
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a, weather);
      this._particles(weather.particles, 'front');
      this._fx(o.dt || 0);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug) this._debug(world);
    }
    _sky(world, weather, amb, L) {
      const g = this.g, W = this.W, H = this.H, gy = L.groundY, k = this._k(L);
      const sky = g.createLinearGradient(0, 0, 0, gy);
      sky.addColorStop(0, amb.skyTop || '#9FD4EE'); sky.addColorStop(1, amb.skyBottom || '#F3EFD6');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      if (amb.horizon && /^#[0-9a-f]{6}$/i.test(amb.horizon)) {
        const hz = g.createLinearGradient(0, gy - 620 * k, 0, gy - 140);
        hz.addColorStop(0, amb.horizon + '00'); hz.addColorStop(0.6, amb.horizon + '88'); hz.addColorStop(1, amb.horizon + 'CC');
        g.fillStyle = hz; g.fillRect(0, Math.max(0, gy - 620 * k), W, gy);
      }
      const top = (L.ins ? L.ins.top : 0);
      const st = num(amb.stars, 0);
      if (st > 0.01 && weather.stars && weather.stars.length) {
        g.save(); g.fillStyle = '#FFF8DC';
        for (const q of weather.stars) { g.globalAlpha = st * num(q.a, 1); g.beginPath(); g.arc(q.x, q.y, num(q.r, 1.5), 0, TAU); g.fill(); }
        g.restore();
      } else if (st > 0.01) {   // twinkling stars in the upper sky
        g.save();
        for (let i = 0; i < 70; i++) {
          const x = hash(i) * W, y = top + hash(i + 99) * (gy - 380 * k - top);
          if (y < top) continue;
          const tw = 0.55 + 0.45 * Math.sin(this.time * (1.2 + hash(i + 7) * 2) + i);
          g.globalAlpha = st * tw * (0.5 + 0.5 * hash(i + 3));
          g.fillStyle = '#FFF8DC';
          const r = 1.2 + hash(i + 5) * 1.8;
          g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
        }
        g.restore();
      }
      if (num(amb.sun, 0) > 0.01) {
        const sy = Math.max(top + 70, Math.min(H * num(amb.sunY, 0.14), gy - 300 * k));
        this._sprite('sun', W * num(amb.sunX, 0.7), sy, 170, 0, amb.sun);
      }
      if (num(amb.moon, 0) > 0.01) {
        const my = Math.max(top + 70, Math.min(H * num(amb.moonY, 0.16), gy - 360 * k));
        const mx = W * num(amb.moonX, 0.78);
        const gl = g.createRadialGradient(mx, my, 10, mx, my, 150);
        gl.addColorStop(0, `rgba(255,248,214,${0.35 * amb.moon})`); gl.addColorStop(1, 'rgba(255,248,214,0)');
        g.fillStyle = gl; g.fillRect(mx - 150, my - 150, 300, 300);
        this._sprite('moon', mx, my, 140, 0, amb.moon);
      }
      for (const c of weather.clouds || []) this._sprite(c.sprite, c.x, c.y, 300 * (c.scale || 1), 0, c.alpha == null ? 1 : c.alpha);
      const birds = weather.birds || (weather.wx && weather.wx.birds) || [];
      if (birds.length) {   // little V silhouettes flying home at sunset
        g.save(); g.strokeStyle = 'rgba(60,40,50,.75)'; g.lineCap = 'round'; g.lineJoin = 'round';
        for (const b of birds) {
          const s = num(b.s, 18) / 2, f = Math.sin(b.flap != null ? b.flap * TAU : this.time * 9) * 0.6;
          g.globalAlpha = b.alpha == null ? 1 : b.alpha;
          g.lineWidth = Math.max(1.6, s * 0.26);
          g.beginPath(); g.moveTo(b.x - s, b.y - s * (0.3 + f)); g.quadraticCurveTo(b.x - s * 0.4, b.y - s * 0.4, b.x, b.y);
          g.quadraticCurveTo(b.x + s * 0.4, b.y - s * 0.4, b.x + s, b.y - s * (0.3 + f)); g.stroke();
        }
        g.restore();
      }
      this._particles(weather.particles, 'sky');
    }
    _layer(name, w, h, y, off) {
      const rs = this.rs, tw = Math.round(w * rs), th = Math.round(h * rs);
      const tile = LL.Assets.exact(name, tw, th);
      if (!tile) return;
      const g = this.g;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      let x = -Math.round((((off % w) + w) % w) * rs);
      const yy = Math.round(y * rs);
      for (; x < this.canvas.width; x += tw) g.drawImage(tile, x, yy);
      g.restore();
    }
    _jungle(L, mood, scroll, amb) {
      const g = this.g, gy = L.groundY, k = this._k(L), m = MOODS[mood], W = this.W;
      this._layer('far_' + m, 1200 * k, 420 * k, gy - 26 - 100 * k - 420 * k, scroll * 0.15);
      const mist = num(amb.mist, 0);
      if (mist > 0.01) {   // soft morning mist bands drifting between the far and mid layers
        g.save();
        for (let i = 0; i < 3; i++) {
          const y = gy - 120 * k - i * 90 * k, x = ((this.time * (8 + i * 4) + i * 300) % (W + 600)) - 300;
          const gr = g.createLinearGradient(0, y - 40, 0, y + 40);
          gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, `rgba(255,252,244,${0.32 * mist})`); gr.addColorStop(1, 'rgba(255,255,255,0)');
          g.fillStyle = gr; g.fillRect(0, y - 40, W, 80);
          g.fillStyle = `rgba(255,252,244,${0.18 * mist})`;
          g.beginPath(); g.ellipse(x, y, 320, 34, 0, 0, TAU); g.fill();
        }
        g.restore();
      }
      this._layer('mid_' + m, 1200 * k, 360 * k, gy - 26 - 360 * k, scroll * 0.4);
      const rays = num(amb.rays, 0);
      if (rays > 0.01) {   // noon sunbeams through the canopy
        g.save(); g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 4; i++) {
          const x0 = W * (0.15 + i * 0.24) + Math.sin(this.time * 0.2 + i) * 20, w0 = 50 + 30 * hash(i + 1);
          const al = rays * (0.05 + 0.03 * Math.sin(this.time * 0.6 + i * 1.7));
          const gr = g.createLinearGradient(0, 0, 0, gy);
          gr.addColorStop(0, `rgba(255,244,200,${al})`); gr.addColorStop(1, 'rgba(255,244,200,0)');
          g.fillStyle = gr;
          g.beginPath(); g.moveTo(x0, 0); g.lineTo(x0 + w0, 0); g.lineTo(x0 + w0 + 160, gy); g.lineTo(x0 + 70, gy); g.closePath(); g.fill();
        }
        g.restore();
      }
      this._layer('ground_' + m, 1200 * k, 260 * k, gy - 30 - 40 * k, scroll);
      const fillY = gy - 30 + 220 * k;
      if (fillY < this.H) { g.fillStyle = FLOOR[m]; g.fillRect(0, fillY - 1, W, this.H - fillY + 1); }
    }

    /* ---------- the round ---------- */
    _game(w, o, a, weather) {
      const L = w.layout;
      const sT = w.phase === 'scroll' ? clamp(num(ip(w, 'scrollT', a), 1), 0, 1) : 1;
      this._leafRects.length = 0;
      // swinging across: Lolo stays in FRONT so the swing reads (no taps are possible during the scroll, so briefly
      // passing over a picture is harmless — QA: drawn behind she was almost invisible)
      const behind = false;
      if (behind) this._lolo(w, o, a);
      if (w.prevBuilding && w.phase === 'scroll') this._tree(w.prevBuilding, num(w.prevDx, -sT * this.W), true, a, w);
      if (L.grid && L.grid.building && w.building) {
        this._tree({ building: w.building, rect: L.grid.building, grid: L.grid, cards: w.cards }, w.phase === 'scroll' ? num(w.buildingDx, (1 - sT) * this.W) : 0, false, a, w);
      } else if (w.lastBuilding) this._tree(w.lastBuilding, 0, true, a, w);
      const cr = w.critter;
      if (cr && cr.type === 'frog') this._frog(cr, a);
      if (!behind) this._lolo(w, o, a);
      if (cr && cr.type === 'toucan') this._toucan(cr, a);
      if (cr && cr.type === 'butterfly') this._bfly(cr, a);
    }
    _tree(B, dx, frozen, a, w) {
      const art = LA(); if (!art || !B || !B.rect) return;
      const g = this.g, R = B.rect;
      if (R.x + dx > this.W + 80 || R.x + R.w + dx < -80) return;
      const r = Object.assign({}, R, { x: R.x + dx });
      if (R.rows) r.rows = R.rows.map(q => Object.assign({}, q, { x0: q.x0 + dx, x1: q.x1 + dx }));
      const tree = B.building || DEF_TREE;
      const amb = this._amb || {};
      const cheer = frozen ? 1 : num(w.cheer, 0);
      const night = num(amb.night, this._mood === 3 ? 1 : 0);
      g.fillStyle = 'rgba(30,40,20,.18)'; g.beginPath(); g.ellipse(r.x + r.w / 2, r.y + r.h, r.w * 0.55, 10, 0, 0, TAU); g.fill();
      if (art.drawTree) art.drawTree(g, r, tree, { light: frozen ? 0.5 : cheer, t: this.time, night, sway: num(amb.wind, 0) * 0.15 });
      if (cheer > 0.01 && art.drawGarland) {
        g.save(); g.globalAlpha = clamp(cheer * 1.5, 0, 1);
        art.drawGarland(g, r.x + 10, r.y - (r.roofH || 30) * 0.35, r.x + r.w - 10, r.y - (r.roofH || 30) * 0.35, this.time);
        g.restore();
      }
      for (const c of B.cards || []) this._leaf(c, tree, dx, frozen, a, cheer, night, B.grid);
    }
    _leaf(c, tree, dx, frozen, a, cheer, night, grid) {
      const g = this.g, art = LA();
      const cx = (frozen ? c.x : num(ip(c, 'x', a), c.x)) + dx, cy = frozen ? c.y : num(ip(c, 'y', a), c.y);
      if (cx + c.w < -40 || cx - c.w > this.W + 40) return;
      const stem = num(c.stem, grid && grid.gapY ? grid.gapY * 0.62 : Math.max(20, c.w * 0.16));
      const px = num(c.px, c.x) + dx, py = num(c.py, c.y - c.h / 2 - stem);
      const open = frozen ? (c.state === 'matched' ? 1 : num(c.open, 0)) : num(ip(c, 'open', a), 0);
      const swing = frozen ? 0 : num(ip(c, 'swing', a), 0);
      const O = this._lopt;
      O.leaf = tree.leaf; O.leafDark = tree.leafDark; O.vine = tree.vine; O.flower = tree.flower; O.stem = stem;
      O.light = clamp(num(c.light, 0) + (c.state === 'matched' ? cheer * 0.3 : 0), 0, 1);
      O.glow = num(c.glow, 0);
      O.bloom = frozen ? num(c.bloom, c.state === 'matched' ? 1 : 0) : num(ip(c, 'bloom', a), 0);
      O.bounce = frozen ? 0 : num(ip(c, 'bounce', a), 0);
      O.wiggle = num(c.wiggle, 0); O.night = night; O.t = this.time; O.seed = c.seed || 0;
      O.sprite = this._spr; O.alpha = c.alpha == null ? 1 : c.alpha;
      g.save(); g.translate(px, py); g.rotate(swing); g.translate(0, stem + c.h / 2);
      if (art && art.drawLeaf) art.drawLeaf(g, c.w, c.h, c.face, open, O);
      g.restore();
      if (!frozen) this._leafRects.push({ x: c.x - c.w / 2, y: c.y - c.h / 2, w: c.w, h: c.h });
    }
    _toucan(p, a) {
      const x = ip(p, 'x', a), y = ip(p, 'y', a), s = 72;
      const flying = p.state === 'fly' || p.state === 'away' || p.state === 'enter' || p.state === 'leave';
      const spr = LL.Assets.sprite(flying && num(p.flap, 0) > 0.5 ? 'toucan_flap' : 'toucan', s * this.rs);
      if (!spr) return;
      const g = this.g, f = (p.face || 1) < 0 ? -1 : 1;
      g.save(); g.globalAlpha *= p.alpha == null ? 1 : p.alpha;
      g.translate(x, y); g.rotate(num(ip(p, 'rot', a), 0) + num(p.peck, 0) * 0.25 * f);
      g.scale(num(p.sx, 1) * f, num(p.sy, 1));
      g.drawImage(spr, -s / 2, -s * 120 / 128, s, s);
      g.restore();
    }
    _frog(p, a) {
      const x = ip(p, 'x', a), gy0 = ip(p, 'y', a), hy = num(ip(p, 'hy', a), 0), y = gy0 - hy, s = 92;
      const air = hy > 2 || p.state === 'jump';
      const spr = LL.Assets.sprite(air ? 'frog_jump' : 'frog', s * this.rs);
      const g = this.g, f = (p.face || 1) < 0 ? -1 : 1;
      const gy = gy0;
      g.fillStyle = 'rgba(20,40,20,.22)'; g.beginPath(); g.ellipse(x, gy - 2, 30 / (1 + Math.max(0, gy - y) / 80), 6, 0, 0, TAU); g.fill();
      if (!spr) return;
      g.save(); g.translate(x, y); g.rotate(num(ip(p, 'rot', a), 0)); g.scale(num(p.sx, 1) * f, num(p.sy, 1));
      g.drawImage(spr, -s / 2, -s * 118 / 128, s, s);
      const cr = num(p.croak, 0);
      if (cr > 0.02 && !air) {   // throat puff
        g.fillStyle = 'rgba(255,240,200,.85)'; g.strokeStyle = 'rgba(120,150,70,.8)'; g.lineWidth = 2;
        g.beginPath(); g.ellipse(s * 0.16, -s * 0.28, 8 + 10 * cr, 6 + 8 * cr, 0, 0, TAU); g.fill(); g.stroke();
      }
      g.restore();
    }
    _bfly(b, a) {
      const art = LA(); if (!art || !art.drawButterfly) return;
      const x = ip(b, 'x', a), y = ip(b, 'y', a);
      const g = this.g;
      g.save(); g.globalAlpha *= b.alpha == null ? 1 : b.alpha; g.translate(x, y); g.rotate(num(ip(b, 'rot', a), 0));
      art.drawButterfly(g, b.color || 'blue', 64, num(b.flap, this.time * 9 * TAU / 9));
      g.restore();
    }

    /* ---------- Lolo ---------- */
    _lolo(w, o, a) {
      const L = w.layout, G = w.lolo || {}, LG = L.lolo;
      if (!LG) return;
      const h = LG.h, g = this.g;
      const V = G.vine;
      const head = this._loloHead(G, o);
      // the log she sits on (stays put; a new log comes with the new tree)
      const sT = w.phase === 'scroll' ? clamp(num(ip(w, 'scrollT', a), 1), 0, 1) : 1;
      this._log(LG.x + (w.phase === 'scroll' ? -sT * this.W : 0), LG.y, h);
      if (w.phase === 'scroll') this._log(LG.x + (1 - sT) * this.W, LG.y, h);
      if (V) this._liana(V, a);
      if (G.hang && V) { this._loloHang(G, V, h, head, a); return; }
      const hop = num(ip(G, 'hop', a), 0);
      const lean = num(ip(G, 'lean', a), 0), flip = num(ip(G, 'flipRot', a), 0), sq = clamp(num(G.squash, 0), -0.3, 0.3);
      // shadow on the log top
      const shk = 1 / (1 + hop / 60);
      g.fillStyle = `rgba(40,30,20,${0.2 * shk})`;
      g.beginPath(); g.ellipse(LG.x + num(ip(G, 'dx', a), 0), LG.y - 2, h * 0.3 * shk, h * 0.045 * shk, 0, 0, TAU); g.fill();
      const body = hop > 6 || Math.abs(flip) > 0.05 ? 'lolo_body_hop' : 'lolo_body_sit';
      const k = h / 256;
      const AN = (KA() && KA().ANCHORS) || {};
      const B = AN.body || { feet: [128, 244], socket: [128, 118], shoulder: [152, 136], tail: [84, 220] };
      const Hd = AN.head || { joint: [96, 172] };
      const hs = (AN.headScale || 0.62) * h / 192;
      // local frame: origin at the feet, body rotated by the lean and the backflip
      const fx = LG.x + num(ip(G, 'dx', a), 0), fy = LG.y - hop;
      const rot = lean + flip, pivotY = -0.42 * h;
      const toWorld = (lx, ly) => {   // lean about the feet + flip about the body centre
        let x = lx, y = ly - pivotY; const cf = Math.cos(flip), sf = Math.sin(flip);
        let x2 = x * cf - y * sf, y2 = x * sf + y * cf; y2 += pivotY;
        const cl = Math.cos(lean), sl = Math.sin(lean);
        return { x: fx + x2 * cl - y2 * sl, y: fy + x2 * sl + y2 * cl };
      };
      g.save(); g.translate(fx, fy); g.rotate(lean); g.translate(0, pivotY); g.rotate(flip); g.translate(0, -pivotY);
      g.scale(1 + sq, 1 - sq);
      const ka = KA();
      const tl = { x: (B.tail[0] - B.feet[0]) * k, y: (B.tail[1] - B.feet[1]) * k };
      if (ka && ka.drawTail) ka.drawTail(g, tl.x, tl.y, h, num(G.tail, this.time * 2), { side: -1 });
      const spr = LL.Assets.sprite(body, h * this.rs) || LL.Assets.sprite('lolo_body_sit', h * this.rs);
      if (spr) g.drawImage(spr, -B.feet[0] * k, -B.feet[1] * k, h, h);
      const sk = { x: (B.socket[0] - B.feet[0]) * k, y: (B.socket[1] - B.feet[1]) * k };
      const hsp = LL.Assets.sprite(head, 192 * hs * this.rs) || LL.Assets.sprite('lolo_head_idle', 192 * hs * this.rs);
      const tilt = ka && ka.headTilt ? num(ka.headTilt(lean, G.lookX, G.lookY, fx, fy - 0.6 * h), 0) : 0;
      if (hsp) {
        g.save(); g.translate(sk.x, sk.y); g.rotate(clamp(tilt - lean * 0.5, -0.35, 0.35));
        g.drawImage(hsp, -Hd.joint[0] * hs, -Hd.joint[1] * hs, 192 * hs, 192 * hs);
        g.restore();
      }
      g.restore();
      // the pointing arm (screen angle), drawn last; clamp so the hand never lands on a leaf
      if (ka && ka.drawArm) {
        const own = Math.abs(flip) > 0.05 || G.shX == null || !G.armLen;
        const sh = own ? toWorld((B.shoulder[0] - B.feet[0]) * k, (B.shoulder[1] - B.feet[1]) * k) : { x: G.shX, y: G.shY };
        const ang = num(ip(G, 'armA', a), 1.0);
        const ext = clamp(num(G.armExt, 0), 0, 1);
        let len = own ? h * (0.3 + 0.16 * ext) : num(ip(G, 'armLen', a), h * 0.3);
        for (let i = 0; i < 6; i++) {
          const hx = sh.x + Math.cos(ang) * len, hy = sh.y + Math.sin(ang) * len;
          if (!this._leafRects.some(r => hx > r.x - 8 && hx < r.x + r.w + 8 && hy > r.y - 8 && hy < r.y + r.h + 8)) break;
          len *= 0.82;
        }
        ka.drawArm(g, sh.x, sh.y, Math.abs(flip) > 0.05 ? ang + flip : ang, len, { point: ext > 0.4, scale: h / 150 });
      }
      void rot;
    }
    _loloHang(G, V, h, head, a) {
      const g = this.g, ka = KA();
      const AN = (ka && ka.ANCHORS) || {};
      const HG = AN.hang || { hand: [128, 18], socket: [128, 118], tail: [84, 200] };
      const Hd = AN.head || { joint: [96, 172] };
      const k = h / 256, hs = (AN.headScale || 0.62) * h / 192;
      const hx = num(ip(V, 'hx', a), V.hx), hy = num(ip(V, 'hy', a), V.hy);
      const ang = num(ip(V, 'ang', a), 0);
      const px = num(V.px, hx), py = num(V.py, -60);
      void px; void py;
      g.save(); g.translate(hx, hy); g.rotate(ang);
      const tl = { x: (HG.tail[0] - HG.hand[0]) * k, y: (HG.tail[1] - HG.hand[1]) * k };
      if (ka && ka.drawTail) ka.drawTail(g, tl.x, tl.y, h, num(G.tail, this.time * 3), { side: -1, hang: true });
      const spr = LL.Assets.sprite('lolo_body_hang', h * this.rs);
      if (spr) g.drawImage(spr, -HG.hand[0] * k, -HG.hand[1] * k, h, h);
      const hsp = LL.Assets.sprite(head, 192 * hs * this.rs);
      if (hsp) g.drawImage(hsp, (HG.socket[0] - HG.hand[0]) * k - Hd.joint[0] * hs, (HG.socket[1] - HG.hand[1]) * k - Hd.joint[1] * hs, 192 * hs, 192 * hs);
      g.restore();
    }
    _liana(V, a) {   // the liana Lolo swings on: from its pivot above the screen to its end (her hand while held)
      const g = this.g, al = clamp(num(ip(V, 'alpha', a), 1), 0, 1);
      if (al < 0.02) return;
      const px = num(ip(V, 'px', a), 0), py = num(V.py, -60);
      const ex = num(ip(V, 'ex', a), num(V.hx, px)), ey = num(ip(V, 'ey', a), num(V.hy, py + 200));
      g.save(); g.globalAlpha *= al; g.strokeStyle = '#5E7F32'; g.lineWidth = 7; g.lineCap = 'round';
      g.beginPath(); g.moveTo(px, py); g.quadraticCurveTo((px + ex) / 2 + 6, (py + ey) / 2, ex, ey); g.stroke();
      g.strokeStyle = '#8DB04E'; g.lineWidth = 2.5; g.stroke();
      // a few leaves along it
      g.fillStyle = '#6FA54A';
      for (let i = 1; i < 5; i++) {
        const u = i / 5, lx = lerp(px, ex, u) + 3, ly = lerp(py, ey, u);
        g.beginPath(); g.ellipse(lx + 6 * (i % 2 ? 1 : -1), ly, 8, 4, (i % 2 ? 0.6 : -0.6), 0, TAU); g.fill();
      }
      g.restore();
    }
    _log(x, y, h) {
      if (x < -h * 2 || x > this.W + h * 2) return;
      const w = h * 1.35, hh = w * 140 / 320;
      const spr = LL.Assets.sprite('log', w * this.rs);
      if (!spr) { this.g.fillStyle = '#7A5A3E'; this.g.beginPath(); roundRect(this.g, x - w / 2, y, w, hh * 0.7, 20); this.g.fill(); return; }
      this.g.drawImage(spr, x - w / 2, y - hh * 34 / 140, w, hh);
    }
    _loloHead(G, o) {
      const m = (G.moodT || 0) > 0 ? G.mood : 'idle';
      if (m === 'happy' || m === 'cheer' || m === 'think' || m === 'oops') return 'lolo_head_' + m;
      if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) return 'lolo_head_talk';
      if ((G.blink || 0) > 0.5) return 'lolo_head_blink';
      return 'lolo_head_idle';
    }

    /* ---------- title & celebration ---------- */
    _miniTree(cx, groundY, cw, faces, opens, lights, tree, swingT) {
      const art = LA(); if (!art || !art.drawLeaf) return null;
      const g = this.g, ch = cw / 0.78, gap = Math.max(18, cw * 0.18), gapY = Math.max(30, 0.26 * cw), pad = Math.max(26, cw * 0.24);
      const n = faces.length, rowW = n * cw + (n - 1) * gap;
      const leafY = groundY - ch * 1.05 - 30;
      const top = leafY - ch / 2 - gapY - pad;
      const r = { x: cx - rowW / 2 - pad, y: top, w: rowW + 2 * pad, h: groundY + 4 - top, roofH: cw * 0.34, pad, door: null,
        rows: [{ y: leafY - ch / 2 - gapY * 0.62, x0: cx - rowW / 2 - pad * 0.5, x1: cx + rowW / 2 + pad * 0.5 }] };
      if (art.drawTree) art.drawTree(g, r, tree, { light: 0.3, t: this.time, night: this._mood === 3 ? 1 : 0, sway: 0 });
      const stem = gapY * 0.62;
      for (let i = 0; i < n; i++) {
        const lx = cx - rowW / 2 + cw / 2 + i * (cw + gap);
        const O = { leaf: tree.leaf, leafDark: tree.leafDark, vine: tree.vine, flower: tree.flower, stem, light: lights[i] || 0,
          bloom: lights[i] ? 1 : 0, sprite: this._spr, t: this.time, night: this._mood === 3 ? 1 : 0, seed: i * 37 };
        g.save(); g.translate(lx, r.rows[0].y + 4); g.rotate(Math.sin(this.time * 2.6 + i * 1.3) * 0.05 * (swingT == null ? 1 : swingT));
        g.translate(0, stem + ch / 2);
        art.drawLeaf(g, cw, ch, faces[i], opens[i], O);
        g.restore();
      }
      return r;
    }
    _hangingLolo(x, topY, hgt, t, ax, ay) {   // the title Lolo (tail curled round a vine piece) on a liana from (ax, ay)
      const g = this.g, sway = Math.sin(t * 1.3) * 0.06, w = hgt * 320 / 480;
      const hx = x - w / 2 + w * 0.12, hy = topY + hgt * 0.03;   // where the liana meets the sprite's own vine
      g.save(); g.strokeStyle = '#5E7F32'; g.lineWidth = 6; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ax, ay); g.quadraticCurveTo((ax + hx) / 2 - 10, (ay + hy) / 2 + 20, hx, hy); g.stroke();
      g.strokeStyle = '#8DB04E'; g.lineWidth = 2.2; g.stroke();
      g.translate(hx, hy); g.rotate(sway); g.translate(-hx, -hy);
      const spr = LL.Assets.sprite('lolo_title', hgt * this.rs);
      if (spr) g.drawImage(spr, x - w / 2, topY, w, hgt);
      g.restore();
    }
    _titleScene(w, o) {
      const L = w.layout, W = this.W, H = this.H, portrait = H > W;
      const cw = portrait ? 104 : 88;
      const cx = portrait ? W * 0.64 : W - L.ins.right - Math.max(200, W * 0.18);
      const faces = [{ kind: 'color', value: 'red', color: 'red', obj: 'butterfly' }, { kind: 'animal', value: 'panda', sprite: 'animal_panda' }, { kind: 'shape', value: 'star', shape: 'star', color: 'blue' }];
      const opens = [0, 1, 2].map(i => {
        const ph = (this.time * 0.35 + i / 3) % 1;
        if (ph < 0.14) return easeOutBack(ph / 0.14);
        if (ph < 0.55) return 1;
        if (ph < 0.68) return 1 - (ph - 0.55) / 0.13;
        return 0;
      });
      const r = this._miniTree(cx, L.groundY, cw, faces, opens, [0, 0, 0], DEF_TREE);
      if (portrait && r) {   // Lolo hangs from the left end of the tree's branch
        const hgt = Math.min(340, W * 0.46), sw = hgt * 320 / 480;
        const gx = Math.max(L.ins.left + sw / 2 + 6, r.x - sw / 2 + 24), topY = r.y - r.roofH * 0.2 + 30;
        this._hangingLolo(gx, topY, hgt, this.time, r.x + 14, r.y - r.roofH * 0.35);
      } else {
        const hgt = Math.min(H * 0.5, 380), sw = hgt * 320 / 480;
        const gx = L.ins.left + W * 0.03 + sw / 2, topY = Math.max(H * 0.37, L.ins.top + 40);
        this._hangingLolo(gx, topY, hgt, this.time, gx - sw / 2 + 4, -10);
      }
    }
    _doneScene(w, o) {   // the night jungle party: a tree full of glowing leaves with what the child found
      const L = w.layout, W = this.W, H = this.H, t = this.time, portrait = H > W;
      const all = w.collected || [], col = [];
      for (let i = 0; i < Math.min(5, all.length); i++) col.push(all[Math.floor((i + 0.5) * all.length / Math.min(5, all.length))]);
      const faces = col.length ? col.map(p => p.faceA) : [{ kind: 'color', value: 'red', color: 'red', obj: 'balloon' }, { kind: 'animal', value: 'rabbit', sprite: 'animal_rabbit' }, { kind: 'shape', value: 'heart', shape: 'heart', color: 'purple' }];
      const compact = !!(o && o.compact);
      const hgt = Math.min(H * (compact ? 0.5 : 0.3), 400);
      const lh = Math.min(portrait ? 230 : 180, hgt * 0.6);   // Lolo's body height
      const gx = L.ins.left + Math.max(100, lh * 0.95);
      const left = gx + lh * 0.85, right = compact ? W * 0.5 : W - L.ins.right - 24;
      const per = Math.min(portrait ? 3 : 4, faces.length);
      const row = faces.slice(0, per);
      const cw = Math.min(portrait ? 150 : 120, (right - left) / (row.length * 1.25 + 0.6));
      const bw = row.length * cw + (row.length - 1) * Math.max(18, cw * 0.18) + 2 * Math.max(26, cw * 0.24);
      this._miniTree(left + bw / 2, L.groundY, cw, row.map(f => Object.assign({}, f)), row.map(() => 1), row.map(() => 1),
        { bark: '#7D7266', barkDark: '#544B42', moss: '#8DBA6A', leaf: '#3A9488', leafDark: '#23645B', vine: '#6E8F3A', flower: '#FFF7FB', kind: 'fig', seed: 9 });
      // Lolo dances on her log, a backflip every few seconds
      const cyc = t % 2.4, flip = cyc < 0.7 ? -TAU * (cyc / 0.7) : 0, hop = cyc < 0.7 ? Math.sin(cyc / 0.7 * Math.PI) * 60 : Math.abs(Math.sin(t * 5)) * 8;
      const fake = { layout: { lolo: { x: gx, y: L.groundY + 10, h: lh }, groundY: L.groundY },
        lolo: { hop, flipRot: flip, lean: 0, armA: -1.2, armExt: 1, mood: 'cheer', moodT: 1, tail: t * 3 }, phase: 'done' };
      this._leafRects.length = 0;
      this._lolo(fake, {}, 1);
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, L = w.layout;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((LL.CONFIG && LL.CONFIG.introTime) || 1.8) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = clamp((L.board ? L.board.y + L.board.h * 0.45 : this.H * 0.45), L.ins.top + 120, this.H - 300);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(20,60,40,.28)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FBFCEF'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#A9CF7E'; g.stroke();
      const I = LL.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#5f6a4a', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#2F7D5A', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#5f6a4a', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#2F7D5A', '#ffffff', 160);
      }
      g.restore();
    }

    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random;
      if (type === 'pop') {   // a found leaf: warm flash + sparkles + a few pollen-coloured confetti
        const C = LA() && LA().COLORS && LA().COLORS[opt.color];
        const col = C ? (C.base || C.fill) : CONF[(R() * CONF.length) | 0], size = opt.size || 110;
        fx.push({ k: 'flash', x, y, t: 0, life: 0.32, size });
        const n = Math.round(8 * this.quality);
        for (let i = 0; i < n; i++) {
          const an = R() * TAU, sp = 140 + R() * 220;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: col, x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 120,
            g: 520, drag: 1.4, t: 0, life: 0.8 + R() * 0.4, size: 16 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 14, sway: R() * TAU });
        }
        for (let i = 0; i < 5; i++) {
          const an = R() * TAU, sp = 80 + R() * 120;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, g: 0, t: 0, life: 0.5 + R() * 0.2, size: 20 + R() * 12, rot: R() * TAU, vr: 4 });
        }
      } else if (type === 'bloom') {   // the orchid opens: two petals + a butterfly flutters off
        for (let i = 0; i < 3; i++) fx.push({ k: 'p', sprite: R() < 0.5 ? 'petal_a' : 'petal_b', x: x + (R() - 0.5) * 30, y, vx: (R() - 0.5) * 100, vy: -80 - R() * 80, g: 160, drag: 1, t: 0, life: 1.1, size: 14 + R() * 6, rot: R() * TAU, vr: 5, sway: R() * TAU });
        const dir = x < this.W / 2 ? 1 : -1;
        fx.push({ k: 'bfly', x, y, x0: x, y0: y, vx: dir * (40 + R() * 40), vy: -90 - R() * 40, t: 0, life: 2.6, color: opt.color || BFLY[(R() * BFLY.length) | 0], ph: R() * TAU, size: 40 });
      } else if (type === 'petals') {    // the tree cheers: orchid petals drift down from the branch
        const n = Math.round(36 * this.quality), w0 = opt.w || 300;
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'petal_a' : 'petal_b', x: x + (R() - 0.5) * w0, y: y - R() * 30, vx: (R() - 0.5) * 80, vy: -60 - R() * 120,
            g: 120, drag: 0.8, t: 0, life: 2.2 + R() * 1.0, size: 16 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 8, sway: R() * TAU });
        }
        for (let i = 0; i < 8; i++) fx.push({ k: 'p', sprite: 'sparkle', x: x + (R() - 0.5) * w0, y: y + R() * 80, vx: 0, vy: -20, g: 0, t: 0, life: 0.9, size: 20 + R() * 10, rot: 0, vr: 3 });
      } else if (type === 'land') {
        for (let i = 0; i < 5; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 40, y: y - 6, vx: (R() - 0.5) * 110, vy: -20 - R() * 30, g: 40, t: 0, life: 0.45, size: 20 + R() * 10, rot: R() * TAU, vr: 0, grow: 1.5, a0: 0.6 });
        for (let i = 0; i < 3; i++) fx.push({ k: 'p', sprite: R() < 0.5 ? 'leaf_a' : 'leaf_b', x: x + (R() - 0.5) * 50, y: y - 10, vx: (R() - 0.5) * 140, vy: -140 - R() * 80, g: 300, drag: 1, t: 0, life: 0.9, size: 16, rot: R() * TAU, vr: 6, sway: 0 });
      } else if (type === 'sparkle') {
        for (let i = 0; i < 10; i++) { const an = R() * TAU, sp = 60 + R() * 160; fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp - 60, g: 60, t: 0, life: 0.8, size: 18 + R() * 12, rot: 0, vr: 4 }); }
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {   // session done: petals + butterflies everywhere
        const n = Math.round(80 * this.quality);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: i % 3 === 0 ? 'confetti_a' : (i % 3 === 1 ? 'petal_a' : 'petal_b'), tint: i % 3 === 0 ? CONF[i % CONF.length] : null, x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
        for (let i = 0; i < 6; i++) fx.push({ k: 'bfly', x: R() * this.W, y: this.H * (0.5 + R() * 0.3), x0: 0, y0: 0, vx: (R() - 0.5) * 80, vy: -40 - R() * 40, t: -R() * 1.5, life: 6, color: BFLY[i % BFLY.length], ph: R() * TAU, size: 44 });
      } else if (type === 'hint') {
        const r0 = (opt.size || 110) * 0.75;
        for (let i = 0; i < 7; i++) { const an = i / 7 * TAU; fx.push({ k: 'p', sprite: 'sparkle', x: x + Math.cos(an) * r0, y: y + Math.sin(an) * r0, vx: Math.cos(an) * 30, vy: Math.sin(an) * 30 - 20, g: 0, t: 0, life: 0.9, size: 22, rot: 0, vr: 3 }); }
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
        } else if (f.k === 'bfly') {   // a butterfly flutters up on a wavy path
          f.x += (f.vx + Math.sin(f.t * 3 + f.ph) * 50) * dt; f.y += (f.vy + Math.cos(f.t * 4 + f.ph) * 30) * dt;
          const art = LA();
          if (art && art.drawButterfly) {
            g.save(); g.globalAlpha *= u > 0.75 ? (1 - u) / 0.25 : clamp(f.t / 0.2, 0, 1);
            g.translate(f.x, f.y); g.rotate(Math.sin(f.t * 3 + f.ph) * 0.3 + (f.vx > 0 ? 0.2 : -0.2));
            art.drawButterfly(g, f.color, f.size, f.t * 18 + f.ph);
            g.restore();
          }
        } else if (f.k === 'flash') {
          g.strokeStyle = `rgba(255,240,180,${0.9 * (1 - u)})`; g.lineWidth = 8 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.25 + 0.6 * u), 0, TAU); g.stroke();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = LL.Assets.tinted ? LL.Assets.tinted(name, color, size * this.rs) : LL.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      const g = this.g;
      for (const p of list) if ((p.layer || 'back') === layer && p.alpha > 0.01) {
        if (p.sprite === 'dot') { g.fillStyle = `rgba(255,255,255,${p.alpha})`; g.beginPath(); g.arc(p.x, p.y, p.size / 2, 0, TAU); g.fill(); continue; }
        if (p.sprite === 'firefly') {   // a soft additive glow behind the sprite
          g.save(); g.globalCompositeOperation = 'lighter';
          const r = p.size * 1.4, gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
          gr.addColorStop(0, `rgba(230,255,140,${0.45 * p.alpha})`); gr.addColorStop(1, 'rgba(230,255,140,0)');
          g.fillStyle = gr; g.fillRect(p.x - r, p.y - r, 2 * r, 2 * r); g.restore();
        }
        this._sprite(p.sprite === 'star' ? 'pstar' : p.sprite, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX === -1);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = LL.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
      if (!spr) return;
      const k = size / Math.max(spr.width, spr.height);
      const w = spr.width * k, h = spr.height * k;
      if (alpha != null && alpha < 1) g.globalAlpha *= alpha;
      if (rot || flipX) {
        g.save(); g.translate(x, y); if (rot) g.rotate(rot); if (flipX) g.scale(-1, 1);
        g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
      } else g.drawImage(spr, x - w / 2, y - h / 2, w, h);
      if (alpha != null && alpha < 1 && alpha > 0) g.globalAlpha /= alpha;
    }
    _debug(w) {
      const g = this.g, L = w.layout;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      const B = L.board; if (B) g.strokeRect(B.x, B.y, B.w, B.h);
      for (const c of w.cards || []) g.strokeRect(c.x - c.w / 2 - 10, c.y - c.h / 2 - 10, c.w + 20, c.h + 20);
      const r = L.loloRect; if (r) g.strokeRect(r.x, r.y, r.w, r.h);
    }
    /* A leaf face for Talk-time previews and choices. */
    drawItemBody(g, it, s) {
      const art = LA(); if (!art || !art.drawFace) return;
      const face = it.face || it;
      const cw = s * (this._preview === 'choice' ? 0.78 : 0.62), ch = cw / 0.78;
      art.drawFace(g, cw, ch, face, { plain: this._preview === 'choice', sprite: (n, sx, sy, sz) => this._sprite(n, sx, sy, sz, 0, 1, g === this.g ? null : g) });
    }
  }

  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = LL.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr; r._preview = canvas.id === 'talkShow' ? 'show' : 'choice';
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, Math.min(ch * 0.98, cw * 1.2));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; r._preview = null; }
  };
  LL.Renderer = Renderer;
})(window.LL = window.LL || {});
