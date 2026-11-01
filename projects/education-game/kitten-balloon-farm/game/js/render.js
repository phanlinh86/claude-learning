/* KB.Render — draws the sunny farm, the floating balloons on their strings, farm friends, the task sign, Miu the kitten,
 * the sky (sun, moon, stars, fireflies) and juice (pop flashes, confetti, stars) on one canvas.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels.
 * Performance: the static landscape (far + mid + ground) is composed once per resize/chapter into a canvas at
 * backing-store size and blitted pixel-exact; balloon bodies come pre-rendered from KB.BalloonArt, sprites from
 * KB.Assets; entity positions are interpolated between fixed simulation steps (world.alpha). */
(function (KB) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const INK = '#3d3a52';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const BA = () => KB.BalloonArt;
  const HEX = { red: '#E84A4A', blue: '#3C8DE8', yellow: '#FFD23F', green: '#4CC26B', orange: '#FF9A2E', purple: '#9B6BE0', pink: '#FF8FC0', cream: '#FFF4DC' };
  const colHex = k => (BA() && BA().COLORS && BA().COLORS[k] ? BA().COLORS[k].base : HEX[k] || '#ddd');

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

  /* One balloon body (+ sticker / text) centred at 0,0 in the current transform. */
  function drawBalloonBody(g, R, b, size, opt) {
    const art = BA();
    const shape = b.shape || 'circle', color = b.color || 'red';
    if (art) art.draw(g, { shape, color, size, sx: opt.sx || 1, sy: opt.sy || 1, glow: opt.glow || 0, alpha: 1, night: opt.night || 0 });
    else { g.fillStyle = colHex(color); g.beginPath(); g.ellipse(0, 0, size / 2 * (opt.sx || 1), size * 0.6 * (opt.sy || 1), 0, 0, TAU); g.fill(); }
    const ty = (art && art.textY ? art.textY(shape, size) : -0.04 * size) * (opt.sy || 1);
    if (b.sprite) {
      g.save(); g.translate(0, ty); g.scale(opt.sx || 1, opt.sy || 1);
      R._sprite(b.sprite, 0, 0, size * 0.62, 0, 1, g === R.g ? null : g);
      g.restore();
    }
    if (b.text != null && b.text !== '') {
      const t = String(b.text);
      const px = t.length <= 1 ? size * 0.52 : t.length <= 2 ? size * 0.44 : size * 0.3;
      g.save(); g.translate(0, ty); g.scale(opt.sx || 1, opt.sy || 1);
      const tc = art && art.textColor ? art.textColor(color) : INK;
      outlinedText(g, t, 0, size * 0.03, px, tc, tc === '#fff' || tc === '#ffffff' ? 'rgba(0,0,0,.25)' : 'rgba(255,255,255,.7)', size * 0.72);
      g.restore();
    }
  }
  function knotOf(shape, size) { const a = BA(); return a && a.knotY ? a.knotY(shape, size) : 0.65 * size; }
  /* A smooth string through points [{x,y}] */
  function strokeString(g, pts, color, width, alpha) {
    if (!pts || pts.length < 2 || alpha <= 0.01) return;
    g.save(); g.globalAlpha *= alpha;
    g.strokeStyle = color; g.lineWidth = width; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2, my = (pts[i].y + pts[i + 1].y) / 2;
      g.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    const L = pts[pts.length - 1]; g.lineTo(L.x, L.y);
    g.stroke(); g.restore();
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.land = null; this.landKey = ''; this.time = 0;
      this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0; this._night = 0; this._pts = [];
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      this.landKey = ''; KB.Assets.dropExact();
    }

    /* ---------- static landscape ---------- */
    _landscape(layout, level) {
      const key = this.W + 'x' + this.H + '@' + this.rs + ':' + (level | 0) + ':' + layout.groundY;
      if (key === this.landKey && this.land) return this.land;
      const rs = this.rs, bw = this.canvas.width, bh = this.canvas.height;
      const c = this.land && this.land.width === bw && this.land.height === bh ? this.land : KB.Assets.makeCanvas(bw, bh);
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
        const tile = KB.Assets.exact(L.n, tw, th);
        if (!tile) continue;
        const y = Math.round((L.bottom - L.h) * rs);
        let x = -Math.round(((L.off % L.w) + L.w) % L.w * rs);
        for (; x < bw; x += tw) g.drawImage(tile, x, y);
        if (L.n === 'ground' && y + th < bh) { // fill below the ground art if the screen is very tall
          g.fillStyle = '#9CCB7C'; g.fillRect(0, y + th - 2, bw, bh - (y + th) + 2);
        }
      }
      this.land = c; this.landKey = key;
      return c;
    }
    _layerScale(layout) { return layout && layout.H > layout.W * 1.6 ? 1.36 : 1; }
    prewarm(layout, level) { // build tiles ahead of time (cheap when cached)
      const rs = this.rs, k = this._layerScale(layout);
      KB.Assets.exact('far', Math.round(1200 * k * rs), Math.round(420 * k * rs));
      KB.Assets.exact('mid', Math.round(1200 * k * rs), Math.round(360 * k * rs));
      KB.Assets.exact('ground', Math.round(1200 * k * rs), Math.round(260 * k * rs));
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

      const land = this._landscape(layout, o.title ? 0 : world.level);
      g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(land, 0, 0); g.setTransform(rs, 0, 0, rs, 0, 0);
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }
      if ((amb.darkness || 0) > 0.01) {   // night: darken the hills and grass, never the sky/moon or the play things
        const d = amb.darkness, k = this._layerScale(layout), gy = layout.groundY;
        const y0 = gy - 470 * k, y1 = gy - 330 * k;
        const dg = g.createLinearGradient(0, y0, 0, H);
        const f1 = clamp((y1 - y0) / Math.max(1, H - y0), 0, 1);
        dg.addColorStop(0, 'rgba(14,20,56,0)'); dg.addColorStop(f1, `rgba(14,20,56,${d})`); dg.addColorStop(1, `rgba(14,20,56,${0.7 * d})`);
        g.fillStyle = dg; g.fillRect(0, Math.max(0, y0), W, H - Math.max(0, y0));
      }
      this._night = clamp((amb.darkness || 0) / 0.26, 0, 1);
      this._particles(weather.particles, 'back');

      if (o.title) this._titleScene(world, o);
      else if (o.done) { this._groundY = layout.groundY; this._doneScene(world, o); }
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
      // sun / moon stay high, small enough not to sit behind the balloon band (a yellow balloon on the sun vanishes)
      const P = layout.play;
      const skyMax = Math.max(60 + (layout.ins ? layout.ins.top : 0), (P ? P.y - 0.6 * (layout.balloonSize || 110) : gy - 300) - 62);
      if ((amb.sun || 0) > 0.01) {
        const big = amb.sunY > 0.38 ? 180 : 150;
        this._sprite('sun', W * (amb.sunX == null ? 0.66 : amb.sunX), Math.min(skyMax, H * (amb.sunY == null ? 0.14 : amb.sunY)), big, 0, amb.sun);
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
      this._sign(w, L);
      for (const f of w.friends || []) this._friend(f, a);
      this._miu(w, o, a);
      this._balloons(w.balloons || [], a, L);
      if (w.shreds && w.shreds.length && BA() && BA().drawShreds) BA().drawShreds(this.g, w.shreds);
    }
    _bpos(b, a) {
      const x = b._px == null ? b.x : lerp(b._px, b.x, a);
      const y = b._py == null ? b.y : lerp(b._py, b.y, a);
      const r = b._prot == null ? (b.rot || 0) : lerp(b._prot, b.rot || 0, a);
      return [x, y, r];
    }
    _stringPts(b, a) {
      const s = b.string, p = b._pstring;
      if (!s || !s.length) return null;
      const out = this._pts; out.length = 0;
      for (let i = 0; i < s.length; i++) {
        const q = p && p[i] ? p[i] : s[i];
        out.push({ x: lerp(q.x, s[i].x, a), y: lerp(q.y, s[i].y, a) });
      }
      return out;
    }
    _balloons(list, a, L) {
      const g = this.g, night = this._night;
      const strCol = night > 0.5 ? '#E6E0F2' : '#8C7B6B';
      const clipY = L.groundY - 26;   // rising balloons come up from behind the grass
      // strings first (they hang behind every body)
      for (const b of list) {
        const sa = b.strAlpha == null ? 1 : b.strAlpha;
        if (b.state === 'gone' || sa <= 0.01) continue;
        const pts = this._stringPts(b, a);
        if (!pts) continue;
        if (b.state === 'rise') { g.save(); g.beginPath(); g.rect(0, 0, this.W, clipY); g.clip(); }
        strokeString(g, pts, strCol, 2.2, sa * (b.alpha == null || b.state === 'pop' ? 1 : clamp(b.alpha, 0, 1)));
        if (b.state === 'rise') g.restore();
      }
      for (const b of list) {
        if (b.state === 'pop' || b.state === 'gone') continue;
        const al = b.alpha == null ? 1 : clamp(b.alpha, 0, 1);
        if (al <= 0.01) continue;
        const [x, y, rot] = this._bpos(b, a);
        g.save();
        if (b.state === 'rise') { g.beginPath(); g.rect(0, 0, this.W, clipY); g.clip(); }
        g.globalAlpha = al;
        // soft shadow-ish glow underneath at night keeps outlines readable on navy
        g.translate(x, y); g.rotate(rot);
        drawBalloonBody(g, this, b, b.size || 110, { sx: b.sx || 1, sy: b.sy || 1, glow: b.glow || 0, night });
        g.restore();
      }
    }
    _friend(f, a) {
      const al = f.alpha == null ? 1 : clamp(f.alpha, 0, 1);
      if (al <= 0.01) return;
      const g = this.g;
      const x = f._px == null ? f.x : lerp(f._px, f.x, a), y = f._py == null ? f.y : lerp(f._py, f.y, a);
      const rot = f._prot == null ? (f.rot || 0) : lerp(f._prot, f.rot || 0, a);
      const s = f.size || 84;
      const gy = this._groundY || y;
      if (f.state !== 'fall' || y > gy - 60) {   // contact shadow on the grass
        const k = clamp(1 - (gy + 30 - y) / 200, 0.2, 1);
        g.fillStyle = `rgba(50,70,30,${0.2 * k * al})`;
        g.beginPath(); g.ellipse(x, Math.max(y, gy + 24) - 3, s * 0.36 * k, s * 0.07 * k, 0, 0, TAU); g.fill();
      }
      g.save(); g.globalAlpha = al;
      g.translate(x, y); g.rotate(rot); g.scale(f.sx || 1, f.sy || 1);
      this._sprite(f.sprite, 0, -s / 2, s, 0, 1);
      g.restore();
    }
    _sign(w, L) {
      const S = L.sign, sg = w.sign;
      if (!S || !sg) return;
      const g = this.g, sw = S.w, k = sw / 128, sh = 112 * k;
      g.save();
      g.translate(S.x, S.y); g.rotate(0.06 * clamp(sg.wob || 0, -2, 2)); g.translate(-S.x, -S.y);
      g.fillStyle = 'rgba(50,70,30,.18)'; g.beginPath(); g.ellipse(S.x, S.y - 3, sw * 0.28, 7, 0, 0, TAU); g.fill();
      this._img('sign', S.x - sw / 2, S.y - sh, sw, sh);
      const bx = S.x - sw / 2 + 12 * k, by = S.y - sh + 8 * k, bw = 104 * k, bh = 68 * k, cx = bx + bw / 2, cy = by + bh / 2;
      g.translate(cx, cy);
      const night = this._night, ref = (w.balloons || []).find(b => b.answer) || (w.balloons || [])[0] || {};
      switch (sg.type) {
        case 'color': {
          const sz = bh * 0.62;
          g.save(); g.translate(0, -bh * 0.06); drawBalloonBody(g, this, { shape: 'circle', color: sg.value }, sz, { night }); g.restore();
          break;
        }
        case 'shape': {
          const sz = bh * 0.7;
          g.save(); g.translate(0, -bh * 0.02); drawBalloonBody(g, this, { shape: sg.value, color: ref.color || 'blue' }, sz, { night }); g.restore();
          break;
        }
        case 'size': {   // the asked-for balloon drawn big or small next to its pale twin
          const big = sg.value === 'big', c = ref.color || 'red';
          g.save(); g.globalAlpha = 0.35; g.translate(big ? bw * 0.26 : -bw * 0.2, big ? bh * 0.12 : -bh * 0.04);
          drawBalloonBody(g, this, { shape: 'circle', color: c }, big ? bh * 0.36 : bh * 0.62, { night }); g.restore();
          g.save(); g.translate(big ? -bw * 0.12 : bw * 0.25, big ? -bh * 0.04 : bh * 0.12);
          drawBalloonBody(g, this, { shape: 'circle', color: c }, big ? bh * 0.66 : bh * 0.36, { night }); g.restore();
          break;
        }
        case 'animal': this._sprite('animal_' + sg.value, 0, 0, bh * 1.05); break;
        case 'number': {
          const n = sg.value;
          if (sg.need) {
            outlinedText(g, String(n), 0, -bh * 0.17, bh * 0.56, INK, null, bw * 0.9);
            this._dots(sg.need, sg.filled || 0, 0, bh * 0.3, bw * 0.92, bh * 0.28);
          } else outlinedText(g, String(n), 0, bh * 0.04, bh * 0.8, INK, null, bw * 0.9);
          break;
        }
        default: {
          if (sg.parity) {
            const word = KB.I18N ? KB.I18N.name(this.lang, 'parity', sg.parity) : sg.parity;
            outlinedText(g, word, 0, -bh * 0.16, bh * 0.42, INK, null, bw * 0.9);
            outlinedText(g, String(sg.value), 0, bh * 0.26, bh * 0.32, '#8a6a4a', null, bw * 0.9);
          } else if (sg.value != null) {
            const t = String(sg.value);
            outlinedText(g, t, 0, bh * 0.04, t.length <= 2 ? bh * 0.78 : bh * 0.5, INK, null, bw * 0.9);
          }
        }
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
        if (i < filled) { g.fillStyle = '#FF9A2E'; g.fill(); }
        g.lineWidth = Math.max(1.5, dd * 0.12); g.strokeStyle = '#9A774C'; g.stroke();
      }
    }

    _miu(w, o, a) {
      const L = w.layout.miu, m = w.miu || {};
      let frame = 'miu_idle';
      const mood = m.mood || 'idle';
      if (mood === 'happy') frame = 'miu_happy';
      else if (mood === 'cheer') frame = 'miu_cheer';
      else if (mood === 'think') frame = 'miu_think';
      else if (mood === 'oops') frame = 'miu_oops';
      if (frame === 'miu_idle') {
        if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) frame = 'miu_talk';
        else if (this._blinking(o.dt)) frame = 'miu_blink';
      }
      const hop = m.hop || 0;
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
      const g = this.g, box = h * 256 / 236;      // Miu's drawing fills y 8–244 (236 px) of the 256 box
      const spr = KB.Assets.sprite(frame, box * this.rs) || KB.Assets.sprite('miu_idle', box * this.rs);
      const sy = groundY == null ? y : groundY, shk = 1 / (1 + (hop || 0) / 60);
      g.fillStyle = `rgba(50,70,30,${0.22 * shk})`;
      g.beginPath(); g.ellipse(x, sy - box * 0.02, box * 0.3 * shk, box * 0.05 * shk, 0, 0, TAU); g.fill();
      if (!spr) return;
      g.save(); g.translate(x, y); g.scale(1 / (breathe * 0.5 + 0.5), breathe);
      g.drawImage(spr, -box * 128 / 256, -box * 244 / 256, box, box);
      g.restore();
    }

    /* a decorative bunch of balloons whose strings meet at (hx, hy) */
    _bunch(hx, hy, size, cols, t, spread) {
      const g = this.g, n = cols.length, pos = [];
      for (let i = 0; i < n; i++) {
        const u = n === 1 ? 0 : i / (n - 1) - 0.5;
        const bx = hx + u * spread + Math.sin(t * 0.9 + i * 1.7) * 6, by = hy - size * (2.1 + 0.35 * Math.cos(u * 3)) - (i % 2) * size * 0.5 + Math.sin(t * 1.3 + i) * 5;
        pos.push([bx, by, Math.sin(t * 0.8 + i) * 0.06 + u * 0.25]);
      }
      const shapes = ['circle', 'heart', 'circle', 'star', 'circle', 'circle'];
      for (let i = 0; i < n; i++) {
        const [bx, by, r] = pos[i], ky = by + knotOf(shapes[i % shapes.length], size);
        strokeString(g, [{ x: bx, y: ky }, { x: lerp(bx, hx, 0.5) + Math.sin(t + i) * 4, y: lerp(ky, hy, 0.5) }, { x: hx, y: hy }], this._night > 0.5 ? '#E6E0F2' : '#8C7B6B', 2.2, 1);
      }
      for (let i = 0; i < n; i++) {
        const [bx, by, r] = pos[i];
        g.save(); g.translate(bx, by); g.rotate(r);
        drawBalloonBody(g, this, { shape: shapes[i % shapes.length], color: cols[i] }, size, { night: this._night });
        g.restore();
      }
    }
    _titleScene(w, o) {
      const L = w.layout, W = this.W, H = this.H;
      const portrait = H > W;
      const h = portrait ? Math.min(330, H * 0.22) : Math.min(290, H * 0.4);
      const x = portrait ? W * 0.32 : L.ins.left + W * 0.15, y = L.groundY + 10;
      const cyc = this.time % 2.4;
      const frame = cyc < 0.5 ? 'miu_happy' : cyc < 0.62 ? 'miu_blink' : 'miu_idle';
      const hop = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) * 18 : 0;
      const bs = portrait ? 86 : 80;
      if (portrait) this._bunch(W * 0.7, L.groundY - 10, bs, ['red', 'yellow', 'blue', 'green', 'purple'], this.time, 200);
      else this._bunch(W - L.ins.right - Math.max(150, W * 0.12), L.groundY + 10, bs, ['red', 'yellow', 'blue', 'green', 'purple'], this.time, 200);
      this._character(frame, x, y - hop, h, 1 + 0.02 * Math.sin(this.time * 2.6), y, hop);
    }
    _doneScene(w, o) {   // the night party: every farm friend on the grass, balloons drifting up, Miu cheering
      const L = w.layout, W = this.W, H = this.H, t = this.time;
      const an = KB.ANIMALS || [];
      const x0 = L.ins.left + 40, x1 = W - L.ins.right - 40, n = an.length;
      const step = Math.min(110, (x1 - x0) / n), s = Math.min(84, step * 0.95);
      const sx = (x0 + x1) / 2 - step * (n - 1) / 2;
      for (let i = 0; i < n; i++) {
        const hop = Math.max(0, Math.sin(t * 3.2 + i * 0.9)) * 14;
        this._friend({ sprite: 'animal_' + an[i], x: sx + i * step, y: L.groundY + 34 - hop, size: s, state: 'rest' }, 1);
      }
      const cols = ['red', 'yellow', 'blue', 'green', 'orange', 'purple', 'pink'], shapes = ['circle', 'heart', 'star', 'circle'];
      for (let i = 0; i < 9; i++) {
        const sp = 0.08 + (i % 4) * 0.02, u = ((t * sp + i * 0.137) % 1);
        const bx = W * ((i * 0.618 + 0.07) % 1) + Math.sin(t * 0.7 + i) * 20, by = H + 120 - u * (H + 300);
        const sz = 70 + (i % 3) * 16;
        strokeString(this.g, [{ x: bx, y: by + knotOf(shapes[i % 4], sz) }, { x: bx + Math.sin(t + i) * 8, y: by + sz * 1.2 }, { x: bx + Math.sin(t * 1.3 + i) * 12, y: by + sz * 1.7 }], '#E6E0F2', 2, 0.9);
        this.g.save(); this.g.translate(bx, by); this.g.rotate(Math.sin(t + i) * 0.08);
        drawBalloonBody(this.g, this, { shape: shapes[i % 4], color: cols[i % cols.length] }, sz, { night: this._night });
        this.g.restore();
      }
      const hgt = Math.min(H * (o && o.compact ? 0.5 : 0.34), 340);
      const cyc = t % 1.1, hop = cyc < 0.55 ? Math.sin(cyc / 0.55 * Math.PI) * 36 : 0;
      const y = o && o.compact ? L.groundY - 10 : Math.min(L.groundY - 20, H * (H > W ? 0.4 : 0.52));
      const cx = o && o.compact ? L.ins.left + W * 0.18 : W / 2;
      this._character(cyc < 0.55 ? 'miu_cheer' : 'miu_happy', cx, y - hop, hgt, 1, y, hop);
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, L = w.layout;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((KB.CONFIG && KB.CONFIG.introTime) || 1.8) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = clamp(L.play.y + L.play.h * 0.45, L.ins.top + 120, this.H - 300);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(40,60,110,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FBFDFF'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#BFD8EE'; g.stroke();
      const I = KB.I18N, lang = this.lang;
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
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random;
      if (type === 'pop') {
        const col = colHex(opt.color || 'red'), size = opt.size || 110;
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
          if (BA() && BA().drawPopFlash) BA().drawPopFlash(g, f.x, f.y, f.size, u, f.color);
          else { g.strokeStyle = `rgba(255,255,255,${1 - u})`; g.lineWidth = 6; g.beginPath(); g.arc(f.x, f.y, f.size * (0.4 + u), 0, TAU); g.stroke(); }
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
      const spr = KB.Assets.tinted ? KB.Assets.tinted(name, color, size * this.rs) : KB.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
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
      const spr = KB.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = KB.Assets.sprite(name, Math.max(w, h) * this.rs);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      const P = w.layout.play; g.strokeRect(P.x, P.y, P.w, P.h);
      for (const b of w.balloons || []) { g.beginPath(); g.arc(b.x, b.y, b.size * 0.6 + 14, 0, TAU); g.stroke(); }
    }
    /* Item visual centred at 0,0 inside a box s (Talk-time previews and choice buttons). */
    drawItemBody(g, it, s) {
      if (it.shape) {
        const sz = s * 0.56 * (it.scale || 1), shape = it.shape;
        const ky = knotOf(shape, sz), top = -(BA() && BA().bodyH ? BA().bodyH(shape, sz) : sz * 1.2) / 2;
        g.save(); g.translate(0, -s * 0.08 - top - sz * 0.6 + (1 - (it.scale || 1)) * s * 0.2);
        strokeString(g, [{ x: 0, y: ky }, { x: 4, y: ky + s * 0.12 }, { x: -2, y: ky + s * 0.22 }], '#8C7B6B', 2, 1);
        drawBalloonBody(g, this, it, sz, {});
        g.restore();
      } else if (it.sprite) this._sprite(it.sprite, 0, 0, s * 0.9, 0, 1, g === this.g ? null : g);
    }
  }

  /* Draw a thing into a small standalone canvas (Talk-time previews / choice buttons). */
  Renderer.preview = function (canvas, thing, opts = {}) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = KB.render;
    if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
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
        return;
      }
      const n = thing.count || 1;
      const rows = n > 5 ? 2 : 1, per = Math.ceil(n / rows);
      const s = Math.min(ch / rows, cw / per * 1.25);
      for (let i = 0; i < n; i++) {
        const row = Math.floor(i / per), col = i % per, cnt = row === rows - 1 ? n - per * (rows - 1) : per;
        const x = cw / 2 + (col - (cnt - 1) / 2) * s * 0.72, y = ch / 2 + (row - (rows - 1) / 2) * s * 0.95;
        g.save(); g.translate(x, y);
        r.drawItemBody(g, thing, s);
        g.restore();
      }
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  KB.Renderer = Renderer;
})(window.KB = window.KB || {});
