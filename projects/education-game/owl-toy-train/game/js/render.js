/* TT.Render (Momo's Toy Train) — draws the toy room on one canvas: the back wall with its window (sky, sun / moon, clouds,
 * window stars), the night-light stars on the wall, the floor + rug + toy props (far / ground / mid layers of the time of
 * day, crossfaded), the sunbeam, the wooden track, the toy-block tunnel, the train (TT.TrainArt engine with Momo in the cab,
 * cars with springy couplings, cargo riding between each car's back and front), cargo on the rug, the hint hand, the
 * hitch bunny and the balloon, weather particles and juice. Logical coordinates (short side 720) × render scale rs =
 * device pixels. No camera. Missing art is tolerated (simple placeholders). Env composition = tools/env_scenes.js recipe. */
(function (TT) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const MOODS = ['morning', 'noon', 'sunset', 'night'];
  const WALL = { morning: '#F3E6CF', noon: '#F6EBD8', sunset: '#F2D6C0', night: '#4B4F78' };
  const FLOOR = { morning: '#D8B88E', noon: '#DBBD96', sunset: '#DCB48A', night: '#5E5A78' };
  const SLICES = { A: [0, 96], B: [96, 104], C: [104, 168], D: [168, 184], E: [184, 260] };
  const MOMO = { w: 300, h: 300, ax: 150, ay: 292, cordX: 214, cordY: 0 };
  const MOMO_H = 0.8, MOMO_LIFT = 0.16;   // Momo's height and lift in the cab (× engine width)
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null || o[k] == null ? o[k] : p + (o[k] - p) * a; };
  const TA = () => TT.TrainArt;
  // the world already sizes 'size' toys (S × item.scale): draw them at 1 so the small ones are not shrunk twice (QA round 1)
  const sizedItem = it => (it && it.kind === 'size' ? Object.assign({}, it, { scale: 1, size: 'big', value: 'big' }) : (it || {}));
  const imgOf = name => (TT.Assets && TT.Assets.images ? TT.Assets.images[name] || null : null);

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
  const moodOf = (amb, k) => { const s = amb[k]; return MOODS.includes(s) ? s : (k === 'env' ? MOODS[clamp(amb.moodIndex | 0, 0, 3)] : null); };

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0; this._puffT = 0; this._env = null; this._envKey = '';
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      TT.Assets.dropExact();
      this._envKey = '';
    }
    prewarm(layout, level) {   // rasterise the big tiles of a time of day ahead of time
      if (layout) this._envFor(layout);
      const E = this._env; if (!E) return;
      const m = MOODS[clamp(level | 0, 0, 3)];
      this._farTile(m); this._groundTile(m); this._midTile(m);
    }

    /* ---------- env recipe (tools/env_scenes.js) — fixed per viewport so the room never jumps between trains ---------- */
    _envFor(L) {
      const key = [this.W, this.H, L.ins && L.ins.top, L.ins && L.ins.bottom, L.ins && L.ins.left, L.ins && L.ins.right].join(',');
      if (this._envKey === key && this._env) return this._env;
      const W = this.W, H = this.H, portrait = H > W, S = L.S || 104;
      const rug = L.rug || { y0: H * 0.35, y1: H * 0.6 }, bub = L.bubble || { x: 24, y: 18, w: 400, h: 122 };
      const FL = Math.round(rug.y0 + S / 2), RB = Math.round(Math.max(rug.y1 + S / 2 + 28, FL + 120));
      const kf = clamp((FL + 10) / 575, 0.42, 0.8), kg = portrait ? 1.2 : 1.0, kv = Math.min(kg, (RB - FL) / 160), km = 0.85 * kf;
      const cx = portrait ? W / 2 : Math.round((bub.x + bub.w + W - 160) / 2);
      this._env = { FL, RB, kf, kg, kv, km, cx, x0: cx - 600 * kf, xm: cx - 600 * km, gy0: FL - 552 * kf, gy1: FL - 280 * kf,
        gx: cx - 196 * kf, gw: 392 * kf };
      this._envKey = key;
      return this._env;
    }
    _farTile(m) { const E = this._env; return TT.Assets.exact('far_' + m, Math.round(1200 * E.kf * this.rs), Math.round(720 * E.kf * this.rs)); }
    _midTile(m) { const E = this._env; return TT.Assets.exact('mid_' + m, Math.round(1200 * E.km * this.rs), Math.round(300 * E.km * this.rs)); }
    _groundTile(m) { const E = this._env; return TT.Assets.exact('ground_' + m, Math.round(1200 * E.kg * this.rs), Math.round(260 * E.kg * this.rs)); }
    _tileX(x0, tw, fn) { let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < this.W; x += tw) fn(x); }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt;
      const a = world.alpha == null ? 1 : world.alpha;
      this._L = world.layout || this._fallbackLayout();
      const amb = weather.ambient || {};
      this._amb = amb;
      this._envFor(this._L);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1;
      this._backdrop(weather, amb);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o, amb);
      else if (o.done) this._doneScene(world, o, amb);
      else this._game(world, o, a, amb);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fallbackLayout() {
      const W = this.W, H = this.H, portrait = H > W, groundY = H - (portrait ? 30 : 18);
      return { W, H, portrait, ins: { top: 0, right: 0, bottom: 0, left: 0 }, groundY, trackY: portrait ? groundY - 300 : groundY - 40, S: 104,
        rug: { y0: portrait ? 400 : 230, y1: portrait ? 900 : 380 }, bubble: portrait ? { x: 24, y: 110, w: W - 48, h: 124 } : { x: 24, y: 18, w: 520, h: 122 },
        engine: { x0: 20, x1: 20 + (portrait ? 180 : 240), w: portrait ? 180 : 240 }, cars: [] };
    }

    /* ---------- backdrop: window sky, wall, floor, rug, props (time-of-day crossfade) ---------- */
    _backdrop(weather, amb) {
      const g = this.g, W = this.W, H = this.H, E = this._env;
      const to = moodOf(amb, 'env') || 'morning', from = moodOf(amb, 'envFrom') || to;
      const mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      g.fillStyle = amb.wall || WALL[to]; g.fillRect(0, 0, W, H);
      // sky over the window rows (the wall hides it elsewhere)
      const gy0 = E.gy0, gy1 = E.gy1, gh = gy1 - gy0;
      const sk = g.createLinearGradient(0, gy0, 0, gy1);
      sk.addColorStop(0, amb.skyTop || '#BFE3F5');
      if (amb.skyMid) sk.addColorStop(0.5, amb.skyMid);
      sk.addColorStop(1, amb.skyBottom || '#FFF3D6');
      g.fillStyle = sk; g.fillRect(0, gy0 - 2, W, gh + 4);
      if ((amb.stars || 0) > 0.02) {   // window stars
        g.fillStyle = '#FFF6D6';
        for (let i = 0; i < 46; i++) {
          const x = (i * 0.618 % 1) * W, y = gy0 + ((i * 0.377 + 0.1) % 1) * gh;
          g.globalAlpha = amb.stars * (0.45 + 0.35 * Math.sin(this.time * 1.7 + i * 2.1) * 0.5 + (i % 3) * 0.12);
          g.beginPath(); g.arc(x, y, 1.3 + (i % 4) * 0.5, 0, TAU); g.fill();
        }
        g.globalAlpha = 1;
      }
      for (const c of weather.clouds || []) {
        if (!(c.alpha > 0.01)) continue;
        this._sprite(TT.Assets.has(c.sprite) ? c.sprite : 'cloud_a', E.gx + E.gw * c.u, gy0 + gh * c.v, E.gw * 0.42 * (c.scale || 1), 0, clamp(c.alpha, 0, 1));
      }
      if ((amb.sun || 0) > 0.01) this._sprite('sun', E.gx + E.gw * (amb.sunX == null ? 0.72 : amb.sunX), gy0 + gh * (amb.sunY == null ? 0.4 : amb.sunY), gh * 0.66, this.time * 0.05, amb.sun);
      if ((amb.moon || 0) > 0.01) this._sprite('moon', E.gx + E.gw * (amb.moonX == null ? 0.72 : amb.moonX), gy0 + gh * (amb.moonY == null ? 0.36 : amb.moonY), gh * 0.62, 0, amb.moon);
      // far wall tiles (from → to)
      const farOne = (m, al) => {
        if (al <= 0.01) return;
        const t = this._farTile(m); if (!t) return;
        const fw = 1200 * E.kf, fh = 720 * E.kf;
        g.save(); g.globalAlpha = al;
        if (al < 1) { g.fillStyle = WALL[m]; g.fillRect(0, 0, W, E.FL + 2 - fh + 1); }
        this._tileX(E.x0, fw, x => g.drawImage(t, x, E.FL + 2 - fh, fw + 0.5, fh));
        g.restore();
      };
      if (from !== to && mix < 1) { farOne(from, 1); farOne(to, mix); } else farOne(to, 1);
      // night-light stars on the wall
      if (weather.stars && weather.stars.length && (amb.stars || 0) > 0.02) {
        for (const s of weather.stars) {
          const al = clamp((s.alpha == null ? 1 : s.alpha) * amb.stars, 0, 1); if (al < 0.02) continue;
          const rg = g.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 3);
          rg.addColorStop(0, `rgba(255,240,170,${0.5 * al})`); rg.addColorStop(1, 'rgba(255,240,170,0)');
          g.fillStyle = rg; g.beginPath(); g.arc(s.x, s.y, s.r * 3, 0, TAU); g.fill();
          this._sprite('pstar', s.x, s.y, s.r * 2.2, (s.phase || 0) * 0.2, al);
        }
      }
      // floor + rug: ground 5-slice, then mid props standing on the floor line
      g.fillStyle = FLOOR[to]; g.fillRect(0, E.FL, W, H - E.FL);
      const groundOne = (m, al) => {
        if (al <= 0.01) return;
        const t = this._groundTile(m); if (!t) return;
        const gw = 1200 * E.kg, uy = t.height / 260;
        const sl = (r, d0, d1) => { if (d1 <= d0) return; this._tileX(0, gw, x => g.drawImage(t, 0, r[0] * uy, t.width, (r[1] - r[0]) * uy, x, d0, gw + 0.5, d1 - d0 + 0.5)); };
        g.save(); g.globalAlpha = al;
        const FL = E.FL, RB = E.RB, kv = E.kv;
        sl(SLICES.A, FL, FL + 96 * kv); sl(SLICES.B, FL + 96 * kv, RB - 64 * kv); sl(SLICES.C, RB - 64 * kv, RB);
        sl(SLICES.D, RB, H - 76 * E.kg); sl(SLICES.E, H - 76 * E.kg, H);
        g.restore();
      };
      if (from !== to && mix < 1) { groundOne(from, 1); groundOne(to, mix); } else groundOne(to, 1);
      const midOne = (m, al) => {
        if (al <= 0.01) return;
        const t = this._midTile(m); if (!t) return;
        const mw = 1200 * E.km, mh = 300 * E.km;
        g.save(); g.globalAlpha = al; this._tileX(E.xm, mw, x => g.drawImage(t, x, E.FL + 8 + 8 * E.km - mh, mw + 0.5, mh)); g.restore();
      };
      if (from !== to && mix < 1) { midOne(from, 1); midOne(to, mix); } else midOne(to, 1);
      // sunbeam through the window
      const B = amb.beamLine;
      if (B && (amb.beam || 0) > 0.02) {
        const dx = B.x1 - B.x0, dy = B.y1 - B.y0, len = Math.hypot(dx, dy) || 1, nx = -dy / len * B.w / 2, ny = dx / len * B.w / 2;
        const lg = g.createLinearGradient(B.x0, B.y0, B.x1, B.y1);
        const warm = to === 'sunset' ? '255,200,140' : '255,246,210';
        lg.addColorStop(0, `rgba(${warm},${0.24 * amb.beam})`); lg.addColorStop(1, `rgba(${warm},0)`);
        g.fillStyle = lg; g.beginPath();
        g.moveTo(B.x0 + nx * 0.7, B.y0 + ny * 0.7); g.lineTo(B.x1 + nx * 1.3, B.y1 + ny * 1.3); g.lineTo(B.x1 - nx * 1.3, B.y1 - ny * 1.3); g.lineTo(B.x0 - nx * 0.7, B.y0 - ny * 0.7);
        g.closePath(); g.fill();
      }
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
      if ((amb.darkness || 0) > 0.01) { g.fillStyle = `rgba(20,24,64,${amb.darkness * 0.55})`; g.fillRect(0, 0, W, H); }   // the night layers are already dim
    }

    /* ---------- the round ---------- */
    _game(w, o, a, amb) {
      const L = this._L;
      this._foreground(L, amb);
      this._track(L);
      this._tunnel(L, 'back');
      this._train(w, a, amb, L);
      this._tunnel(L, 'front');
      // cargo on the rug (not in a car): shadows first, then bodies, the held one last
      const items = (w.items || []).filter(it => !it.inCar && it.state !== 'gone');
      for (const it of items) if (it.state === 'rest' || it.state === 'pop' || it.state === 'bye') this._itemShadow(it, a);
      for (const it of items) this._item(it, a);
      this._balloon(w.balloon, a);
      this._hintHand(w.hintHand, L.S || 104);
      this._puffs(w, a);
    }
    _foreground(L, amb) {   // tall portraits: a soft round play mat with a few calm toys on the floor below the track
      const g = this.g, W = this.W, H = this.H, y0 = L.trackY + 40, room = H - (L.ins && L.ins.bottom || 0) - y0;
      if (room < 150) return;
      const m = moodOf(amb, 'env') || 'morning', night = m === 'night';
      const cx = W / 2, cy = y0 + room * 0.5, rx = W * 0.44, ry = Math.min(room * 0.36, 150);
      g.save();
      g.fillStyle = night ? 'rgba(20,20,50,0.18)' : 'rgba(120,80,40,0.12)'; g.beginPath(); g.ellipse(cx, cy + 8, rx, ry, 0, 0, TAU); g.fill();
      g.fillStyle = night ? '#6C7F9A' : '#E9D7EC'; g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU); g.fill();
      g.lineWidth = 6; g.strokeStyle = night ? '#8C9DB6' : '#F7EEF8'; g.setLineDash([14, 12]);
      g.beginPath(); g.ellipse(cx, cy, rx - 16, ry - 14, 0, 0, TAU); g.stroke(); g.setLineDash([]);
      g.fillStyle = night ? '#7A8CA8' : '#DCC6E2'; g.beginPath(); g.ellipse(cx, cy, rx * 0.5, ry * 0.45, 0, 0, TAU); g.fill();
      g.restore();
    }
    _track(L) {
      if (TA() && TA().drawTrack) { try { TA().drawTrack(this.g, -20, this.W + 20, L.trackY, 0); return; } catch (e) { /* placeholder */ } }
      const g = this.g; g.fillStyle = '#D9B27E'; g.fillRect(0, L.trackY - 1, this.W, 12);
    }
    _tunnel(L, part) {
      const E = (L.engine && L.engine.w) || 240;
      if (!(TA() && TA().drawTunnel && L.tunnelX != null)) return;
      // never over the PARKED engine (its buffer reaches x0 − 0.11E): slide the tunnel left when the train sits close
      const h = 1.45 * E, x = Math.min(L.tunnelX, L.engine.x0 - 0.11 * E - 0.2 * h - 6);
      if (x + 0.42 * h < 0) return;   // entirely off screen
      try { TA().drawTunnel(this.g, x, L.trackY, h, part); } catch (e) { /* skip */ }
    }
    _momoFrame(mood, blink) {
      let nm = 'momo_' + (mood || 'idle');
      if (blink && (mood === 'idle' || !mood)) nm = 'momo_blink';
      if (this._speaking && (mood === 'idle' || mood === 'talk' || !mood) && Math.sin(this.time * 18) > -0.2) nm = 'momo_talk';
      return TT.Assets.has(nm) ? nm : 'momo_idle';
    }
    _train(w, a, amb, L) {
      const g = this.g, tr = w.train || { x: 0 }, E = (L.engine && L.engine.w) || 240, ty = L.trackY;
      const tx = ip(tr, 'x', a) || 0, wheel = ip(tr, 'wheelRot', a) || 0;
      const ex = L.engine.x0 + tx;
      const night = clamp(amb.lamp || 0, 0, 1);
      const opt = { wheelRot: wheel, whistle: tr.whistle || 0, lamp: Math.max(tr.lamp || 0, night * 0.9), glow: tr.glow || 0, night, dpr: this.rs, t: this.time };
      const art = TA();
      g.save(); g.translate(ex, ty);
      if (art && art.drawEngine) { try { art.drawEngine(g, E, opt, 'back'); } catch (e) { } }
      else { g.fillStyle = '#E3BE88'; g.fillRect(0, -E * 0.8, E, E * 0.8); }
      g.restore();
      // Momo in the cab
      const geo = art && art.engineGeom ? art.engineGeom(E) : { cab: { x0: 0.42 * E, x1: 1.02 * E, floorY: -0.14 * E }, whistle: { x: 0.76 * E, y: -1.295 * E, r: 0.14 * E } };
      const m = w.momo || {}, mh = MOMO_H * E, k = mh / MOMO.h;
      const mx = ex + (geo.cab.x0 + geo.cab.x1) / 2, my = ty + geo.cab.floorY - MOMO_LIFT * E;   // raised: her face clears the cab wall (visual QA P2-4)
      const nm = this._momoFrame(m.mood, m.blink || this._blinking(this._dt));
      const bob = Math.sin(this.time * 2.2) * 2 + (Math.abs(tr.v || 0) > 40 ? Math.sin(this.time * 18) * 1.5 : 0);
      if (nm === 'momo_whistle') {   // the cord from her wing up to the whistle lever
        g.save(); g.strokeStyle = '#8A6A44'; g.lineWidth = 3; g.lineCap = 'round';
        g.beginPath(); g.moveTo(mx + (MOMO.cordX - MOMO.ax) * k, my - MOMO.ay * k + bob); g.lineTo(ex + geo.whistle.x, ty + geo.whistle.y + geo.whistle.r * 0.6); g.stroke(); g.restore();
      }
      this._img(nm, mx - MOMO.ax * k, my - MOMO.ay * k + bob, MOMO.w * k, MOMO.h * k);
      g.save(); g.translate(ex, ty);
      if (art && art.drawEngine) { try { art.drawEngine(g, E, opt, 'front'); } catch (e) { } }
      g.restore();
      // couplings + cars (cargo between each car's back and front)
      const cars = w.cars || [], items = w.items || [];
      const hookE = (art && art.engineGeom) ? geo.hookY : -0.105 * E;
      let prevX = ex + E, prevHook = hookE;
      for (let i = 0; i < cars.length; i++) {
        const c = cars[i], cx0 = c.x0 + (ip(c, 'ox', a) || 0) + (c.shake || 0), cw = c.w || (c.x1 - c.x0), ch = c.h || 120;
        const cg = art && art.carGeom ? art.carGeom(cw, ch) : { hookY: -0.105 * E };
        const st = tr.couple && tr.couple[i] ? clamp((tr.couple[i].s || 0) / 16, 0, 1) : 0;
        if (art && art.drawCoupling) { try { art.drawCoupling(g, prevX - 4, cx0 + 4, ty + (cg.hookY + prevHook) / 2, st); } catch (e) { } }
        const sq = ip(c, 'sq', a) || 0;
        const carObj = { label: c.label, need: c.need, filled: c.filled != null ? c.filled : (c.items ? c.items.length : 0) };
        const copt = { wheelRot: wheel, glow: Math.max(c.glow || 0, (c.done || 0) * 0.35 * (0.6 + 0.4 * Math.sin(this.time * 5))), img: imgOf, dpr: this.rs, t: this.time };
        if (night > 0.05) {   // night: a soft moonlit rim behind the car so it reads on the dark room (visual QA P2-9)
          g.save(); g.fillStyle = `rgba(255,244,214,${0.42 * night})`; g.beginPath(); roundRect(g, cx0 - 6, ty - 26 - ch - 6, cw + 12, ch + 26, 16); g.fill(); g.restore();
        }
        g.save(); g.translate(cx0, ty); if (sq) g.scale(1, 1 - sq);
        if (art && art.drawCar) { try { art.drawCar(g, carObj, cw, ch, copt, 'back'); } catch (e) { } }
        else { g.fillStyle = '#E7C590'; g.fillRect(0, -26 - ch, cw, ch); }
        g.restore();
        for (const it of items) if (it.inCar && it.carId === c.id) {
          if (sq) { g.save(); g.translate(0, ty); g.scale(1, 1 - sq); g.translate(0, -ty); this._item(it, a); g.restore(); } else this._item(it, a);
        }
        g.save(); g.translate(cx0, ty); if (sq) g.scale(1, 1 - sq);
        if (art && art.drawCar) { try { art.drawCar(g, carObj, cw, ch, copt, 'front'); } catch (e) { } }
        g.restore();
        if (w.hitch && i === cars.length - 1) this._hitch(w.hitch, a);
        prevX = cx0 + cw; prevHook = cg.hookY;
      }
      if (w.hitch && !cars.length) this._hitch(w.hitch, a);
      // headlamp beam on the floor at night
      if (night > 0.05) {
        const lx = ex - 0.05 * E, ly = ty - 0.3 * E;
        const rg = g.createRadialGradient(lx, ly, 6, lx - 120, ly + 30, 260);
        rg.addColorStop(0, `rgba(255,231,163,${0.32 * night})`); rg.addColorStop(1, 'rgba(255,231,163,0)');
        g.fillStyle = rg; g.beginPath(); g.moveTo(lx, ly - 18); g.lineTo(lx - 380, ly - 90); g.lineTo(lx - 380, ly + 120); g.lineTo(lx, ly + 18); g.closePath(); g.fill();
      }
    }
    _itemShadow(it, a) {
      const g = this.g, x = ip(it, 'x', a), y = ip(it, 'y', a), s = ip(it, 'size', a);
      if (!(s > 1)) return;   // not dealt yet (size 0): never draw the next train's toys early (visual QA P1-1)
      const al = (it.alpha == null ? 1 : it.alpha) * 0.2;
      g.fillStyle = `rgba(60,40,20,${al})`; g.beginPath(); g.ellipse(x, y + s * 0.47, s * 0.36, Math.max(4, s * 0.07), 0, 0, TAU); g.fill();
    }
    _item(it, a) {
      const g = this.g, x = ip(it, 'x', a), y = ip(it, 'y', a), s = ip(it, 'size', a), rot = ip(it, 'rot', a) || 0;
      const al = it.alpha == null ? 1 : it.alpha; if (al <= 0.01 || !(s > 1)) return;
      if (it.state === 'drag') {   // a lifted shadow on the floor under the held toy
        g.fillStyle = 'rgba(60,40,20,0.16)'; g.beginPath(); g.ellipse(x, y + s * 0.62, s * 0.3, s * 0.06, 0, 0, TAU); g.fill();
      }
      const nt = clamp((this._amb && this._amb.lamp) || 0, 0, 1);
      if (nt > 0.05) {   // night: a soft light halo so dark colours (purple, blue) still read
        const rg = g.createRadialGradient(x, y, s * 0.2, x, y, s * 0.62);
        rg.addColorStop(0, `rgba(255,244,214,${0.55 * nt * al})`); rg.addColorStop(1, 'rgba(255,244,214,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y, s * 0.62, 0, TAU); g.fill();
      }
      g.save(); g.globalAlpha *= al; g.translate(x, y); if (rot) g.rotate(rot);
      let ok = false;
      if (TA() && TA().drawCargo) {
        try { TA().drawCargo(g, sizedItem(it.item), s, { glow: it.glow || 0, dpr: this.rs, img: imgOf, squash: { sx: it.sx || 1, sy: it.sy || 1 }, t: this.time }); ok = true; } catch (e) { ok = false; }
      }
      if (!ok) { const c = it.item && it.item.color && TT.PALETTE && TT.PALETTE[it.item.color]; g.fillStyle = c ? c.base : '#E7C590'; g.beginPath(); roundRect(g, -s * 0.4, -s * 0.4, s * 0.8, s * 0.8, s * 0.12); g.fill(); }
      g.restore();
    }
    _hitch(hb, a) {
      if (!hb) return;
      const x = ip(hb, 'x', a), y = ip(hb, 'y', a), s = hb.size || 110;
      const nm = hb.state === 'wave' && TT.Assets.has('bunny_toy_wave') ? 'bunny_toy_wave' : 'bunny_toy';
      if (TT.Assets.has(nm)) this._img(nm, x - s * 70 / 140, y - s * 136 / 140, s, s);
    }
    _balloon(b, a) {
      if (!b || b.popped) return;
      const g = this.g, x = ip(b, 'x', a), y = ip(b, 'y', a), h = b.size || 160, w = h * 120 / 220, sw = ip(b, 'sway', a) || 0;
      g.save(); g.translate(x, y - (b.bob || 0)); g.rotate(sw);
      if (TT.Assets.has('balloon')) this._img('balloon', -w * 60 / 120, -h * 216 / 220, w, h);
      else { g.fillStyle = '#9ED9C5'; g.beginPath(); g.ellipse(0, -h * 0.7, w * 0.45, h * 0.3, 0, 0, TAU); g.fill(); }
      g.restore();
    }
    _hintHand(H, S) {
      if (!H) return;
      const g = this.g, al = H.alpha == null ? 1 : H.alpha;
      if (H.kind === 'drag' && H.x0 != null) {   // a dotted path from the toy to its car
        g.save(); g.globalAlpha *= al * 0.55; g.setLineDash([10, 12]); g.lineCap = 'round'; g.strokeStyle = '#FFFFFF'; g.lineWidth = 7;
        g.beginPath(); g.moveTo(H.x0, H.y0); g.quadraticCurveTo((H.x0 + H.x1) / 2, Math.min(H.y0, H.y1) - 60, H.x1, H.y1); g.stroke(); g.restore();
      }
      g.save(); g.globalAlpha *= al; g.translate(H.x, H.y);
      if (H.kind === 'tap') g.rotate(-0.75);   // whistle hint: the hand reaches in from the lower right, off Momo's face
      let ok = false;
      if (TA() && TA().drawGhostHand) { try { TA().drawGhostHand(g, S * 0.8, H.t != null ? H.t : (this.time % 1)); ok = true; } catch (e) { } }
      if (!ok) { g.fillStyle = 'rgba(255,255,255,.85)'; g.beginPath(); g.arc(0, 20, 22, 0, TAU); g.fill(); }
      g.restore();
    }
    _puffs(w, a) { void w; void a; }   // steam lives in weather.particles (addPuff), drawn with the 'back' layer
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }

    /* ---------- title & celebration: a parked train on the track ---------- */
    _showTrain(x0, trackY, E, cars, mood, t, amb) {
      const g = this.g, art = TA(); if (!art) return;
      const opt = { wheelRot: 0, whistle: 0, lamp: clamp(amb.lamp || 0, 0, 1), glow: 0, night: clamp(amb.lamp || 0, 0, 1), dpr: this.rs, t };
      g.save(); g.translate(x0, trackY); try { art.drawEngine(g, E, opt, 'back'); } catch (e) { } g.restore();
      const geo = art.engineGeom(E), mh = MOMO_H * E, k = mh / MOMO.h;
      const mx = x0 + (geo.cab.x0 + geo.cab.x1) / 2, my = trackY + geo.cab.floorY - MOMO_LIFT * E + Math.sin(t * 2.2) * 2;
      const nm = TT.Assets.has('momo_' + mood) ? 'momo_' + mood : 'momo_idle';
      this._img(nm, mx - MOMO.ax * k, my - MOMO.ay * k, MOMO.w * k, MOMO.h * k);
      g.save(); g.translate(x0, trackY); try { art.drawEngine(g, E, opt, 'front'); } catch (e) { } g.restore();
      let x = x0 + E + 16;
      cars.forEach((c, i) => {
        const cw = c.w, ch = Math.max(90, Math.min(150, 0.62 * cw));
        try { art.drawCoupling(g, x - 20, x + 4, trackY + art.carGeom(cw, ch).hookY, 0); } catch (e) { }
        g.save(); g.translate(x, trackY); try { art.drawCar(g, { label: c.label }, cw, ch, { img: imgOf, dpr: this.rs, t }, 'back'); } catch (e) { } g.restore();
        const S = cw * 0.42, fy = trackY - 26 - 0.38 * ch;
        (c.load || []).forEach((it, j, arr) => {
          const hop = Math.max(0, Math.sin(t * 3 - i * 0.8 - j * 0.6)) * 4;
          g.save(); g.translate(x + cw * (arr.length === 1 ? 0.5 : 0.28 + 0.44 * j / (arr.length - 1)), fy - 0.46 * S - hop);
          try { art.drawCargo(g, it, S, { img: imgOf, dpr: this.rs, t }); } catch (e) { } g.restore();
        });
        g.save(); g.translate(x, trackY); try { art.drawCar(g, { label: c.label }, cw, ch, { img: imgOf, dpr: this.rs, t }, 'front'); } catch (e) { } g.restore();
        x += cw + 16;
      });
      // steam from the chimney now and then
      this._puffT -= this._dt || 0;
      if (this._puffT <= 0) { this._puffT = 0.6; this.burst('steam', x0 + geo.chimney.x, trackY + geo.chimney.y, { n: 1 }); }
      return x;
    }
    _titleScene(w, o, amb) {
      const L = this._L, W = this.W, H = this.H, portrait = H > W, ins = L.ins || {};
      const ty = portrait ? H - (ins.bottom || 0) - 150 : H - (ins.bottom || 0) - 40;
      this._track({ trackY: ty });
      const E = portrait ? 200 : 180, cw = portrait ? 200 : 170;
      const blk = (c, toy) => ({ kind: 'block', toy, color: c, scale: 1 });
      const cars = [{ w: cw, label: { type: 'color', value: 'red', color: 'red' }, load: [blk('red', 'cube'), blk('red', 'ball')] },
        { w: cw, label: { type: 'color', value: 'yellow', color: 'yellow' }, load: [blk('yellow', 'cone'), blk('yellow', 'cube')] },
        { w: cw, label: { type: 'color', value: 'blue', color: 'blue' }, load: [blk('blue', 'cylinder'), blk('blue', 'ball')] }];
      // landscape: the train waits LEFT of the centred Play button / star line (never under them)
      const room = W / 2 - 200 - (ins.left || 0) - 24;
      const n = portrait ? 2 : clamp(Math.floor((room - E) / (cw + 16)), 1, 3);   // at least one car (iPad landscape, visual QA P2-8)
      const total = E + n * (cw + 16);
      const x0 = portrait ? (W - total) / 2 + 10 : (ins.left || 0) + 24 + Math.max(0, (room - total) / 2);
      this._showTrain(x0, ty, E, cars.slice(0, n), 'wave', this.time, amb);
    }
    _doneScene(w, o, amb) {   // the night party: the whole train with toys riding, Momo cheering
      const L = this._L, W = this.W, H = this.H, t = this.time, portrait = H > W, ins = L.ins || {};
      const ty = portrait ? H - (ins.bottom || 0) - 150 : H - (ins.bottom || 0) - 40;
      this._track({ trackY: ty });
      const E = portrait ? 170 : 190, cw = portrait ? 160 : 180;
      const sp = a => ({ kind: 'sprite', sprite: a, scale: 1 });
      const cars = [{ w: cw, label: { type: 'color', value: 'red', color: 'red' }, load: [sp('cargo_teddy'), sp('cargo_duckie')] },
        { w: cw, label: { type: 'home', value: 'barn' }, load: [sp('animal_cow'), sp('animal_pig')] },
        { w: cw, label: { type: 'shape', value: 'star', color: 'yellow' }, load: [{ kind: 'shape', shape: 'star', color: 'yellow', scale: 1 }, sp('cargo_boat')] },
        { w: cw, label: { type: 'number', value: 3, showDots: true }, load: [sp('cargo_ball'), sp('cargo_rocket'), sp('cargo_drum')] }];
      // landscape: the done panel takes the right ~42 %: the train parks in the free left part (visual QA P2-6)
      const free = portrait ? W : W * 0.57 - (ins.left || 0);
      const n = portrait ? 3 : Math.max(2, Math.min(4, Math.floor((free - E - 40) / (cw + 16))));
      const total = E + n * (cw + 16);
      const x0 = portrait ? (W - total) / 2 : (ins.left || 0) + Math.max(16, (free - total) / 2);
      this._showTrain(x0, ty, E, cars.slice(0, n), Math.sin(t * 3) > 0 ? 'cheer' : 'happy', t, amb);
      this._noteT = (this._noteT || 0) - (o.dt || 0);
      if (this._noteT <= 0) { this._noteT = 0.5; this.burst('sparkles', W * (0.1 + Math.random() * 0.8), H * (0.15 + Math.random() * 0.35), { n: 8 }); }
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((TT.CONFIG && TT.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * (H > W ? 0.38 : 0.4);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(70,45,20,.22)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFBF2'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#E3BE88'; g.stroke();
      const I = TT.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#7A5530', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 60, '#4F6B8F', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#7A5530', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#4F6B8F', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && TT.PALETTE && TT.PALETTE[c]) ? TT.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'land') {          // a little dust puff where a toy lands in a car
        for (let i = 0; i < 5; i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 40, y: y - 4, vx: (R() < 0.5 ? -1 : 1) * (50 + R() * 70), vy: -10 - R() * 25, g: 0, drag: 2, t: 0, life: 0.45, size: 18 + R() * 10, rot: R() * TAU, vr: 0 });
        fx.push({ k: 'flash', x, y: y - 20, t: 0, life: 0.3, size: opt.size || 80 });
      } else if (type === 'correct') { // confetti in the car's colour + sparkles
        const n = Math.round(12 * q);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 2.2, sp = 160 + R() * 240;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: opt.color ? colOf(opt.color) : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
            g: 520, drag: 1.4, t: 0, life: 0.8 + R() * 0.4, size: 18 + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 14, sway: R() * TAU });
        }
        for (let i = 0; i < 5; i++) { const a = R() * TAU, sp = 80 + R() * 120; fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40, g: 0, t: 0, life: 0.5, size: 20 + R() * 10, rot: R() * TAU, vr: 4 }); }
      } else if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 260;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 80, g: 220, t: 0, life: 0.9 + R() * 0.5, size: 18 + R() * 14, rot: R() * TAU, vr: 3 });
        }
      } else if (type === 'steam') {   // white puffs rising from the chimney
        for (let i = 0; i < (opt.n || 3); i++) fx.push({ k: 'p', sprite: 'puff', x: x + (R() - 0.5) * 10, y, vx: (R() - 0.5) * 30 - (opt.vx || 0), vy: -60 - R() * 50, g: -10, drag: 1.2, t: 0, life: 1.1 + R() * 0.5, size: 26 + R() * 14, grow: 1.6, rot: R() * TAU, vr: (R() - 0.5) * 1.5 });
      } else if (type === 'ring') {    // the whistle's steam ring
        fx.push({ k: 'ring', x, y, t: 0, life: 0.55, size: opt.size || 70, color: '255,255,255' });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(110 * q);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'hint') {
        const r0 = (opt.size || 110) * 0.6;
        for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; fx.push({ k: 'p', sprite: 'sparkle', x: x + Math.cos(a) * r0, y: y + Math.sin(a) * r0 * 0.6, vx: Math.cos(a) * 30, vy: Math.sin(a) * 30 - 20, g: 0, t: 0, life: 0.8, size: 22, rot: 0, vr: 3 }); }
      } else if (type === 'wrong') {
        fx.push({ k: 'ring', x, y, t: 0, life: 0.35, size: (opt.size || 110) * 1.1, color: '255,255,255' });
      } else if (type === 'count') {   // a big numeral floats up over the car
        fx.push({ k: 'num', x, y, t: 0, life: 0.9, text: String(opt.n || '') });
      } else if (type === 'bye') {
        for (let i = 0; i < 4; i++) { const a = R() * TAU; fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * 60, vy: Math.sin(a) * 60 - 30, g: 0, t: 0, life: 0.5, size: 18, rot: 0, vr: 2 }); }
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
          const al = u > 0.7 ? (1 - u) / 0.3 : 1, sz = f.size * (f.grow ? 1 + (f.grow - 1) * u : 1);
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, sz, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, sz, f.rot, al * (f.sprite === 'puff' ? 0.85 : 1));
        } else if (f.k === 'flash') {
          g.strokeStyle = `rgba(255,250,220,${0.9 * (1 - u)})`; g.lineWidth = 8 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.25 + 0.6 * u), 0, TAU); g.stroke();
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color || '255,240,150'},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#4F6B8F', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = TT.Assets.tinted ? TT.Assets.tinted(name, color, size * this.rs) : TT.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.alpha > 0.01)) continue;
        const nm = p.sprite === 'star' ? 'pstar' : p.sprite;
        if (p.color) this._tinted(nm, p.color, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = TT.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = TT.Assets.sprite(name, Math.max(w, h) * this.rs * 1.25);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g;
      g.lineWidth = 2;
      const box = (b, c) => { if (b) { g.strokeStyle = c; g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); } };
      for (const it of w.items || []) box(w.itemHit && w.itemHit(it.id), 'rgba(255,0,0,.6)');
      for (const c of w.cars || []) box(w.carBox && w.carBox(c.id), 'rgba(0,160,0,.7)');
      box(w.whistleHit && w.whistleHit(), 'rgba(255,0,255,.6)');
      box(w.momoHit && w.momoHit(), 'rgba(0,0,255,.5)');
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
    }
    /* A Talk-time picture (question or answer button): the same wooden toys / stickers the game uses. */
    drawItemBody(g, it, s) {
      const b = Object.assign({}, it);
      if (b.kind === 'parity') {
        const I = TT.I18N; outlinedText(g, I ? I.name(this.lang, 'parity', b.value) : b.value, 0, 0, s * 0.3, '#4F6B8F', '#fff', s * 0.95); return;
      }
      if (b.kind === 'dots') {   // "how many?" — n cargo toys in a neat grid
        const n = b.n | 0, cols = n <= 3 ? n : n <= 4 ? 2 : n <= 6 ? 3 : Math.ceil(Math.sqrt(n * 1.6)), rows = Math.ceil(n / cols);
        const cell = Math.min(s * 1.5 / Math.max(cols, 1.6), s * 0.95 / rows);
        for (let i = 0; i < n; i++) {
          const r = Math.floor(i / cols), c = i % cols, inRow = Math.min(cols, n - r * cols);
          g.save(); g.translate((c - (inRow - 1) / 2) * cell, (r - (rows - 1) / 2) * cell);
          try { TA().drawCargo(g, { kind: 'sprite', sprite: b.sprite || 'cargo_teddy', scale: 1 }, cell * 0.95, { img: imgOf, dpr: this.rs }); } catch (e) { }
          g.restore();
        }
        return;
      }
      g.save(); g.translate(0, s * 0.02);
      let ok = false;
      if (TA() && TA().drawCargo) { try { TA().drawCargo(g, b, s * 0.92, { dpr: this.rs, img: imgOf }); ok = true; } catch (e) { ok = false; } }
      if (!ok) outlinedText(g, String(b.text || b.value || b.n || '?'), 0, 0, s * 0.5, '#4F6B8F', '#fff', s);
      g.restore();
    }
  }
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = TT.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, thing && thing.kind === 'dots' ? Math.min(ch * 0.95, cw * 0.6) : Math.min(ch * 0.95, cw * 0.95));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  TT.Renderer = Renderer;
})(window.TT = window.TT || {});
