/* RR.Render — draws Rainbow Cloud Land: the sky by time of day (gradient, sun/moon/rainbow/planets, night stars),
 * three parallax cloud layers, the take-off hills, the cloud islands with their tokens, the rainbow ribbon, the rocket with
 * Bim in the cockpit, the towed cloud wagon, the boost (cloud bank + speed lines) and juice, on one canvas.
 * Logical coordinates (short side 720) × render scale `rs` = device pixels. World y → screen y = y − camY (interpolated).
 * Islands, tokens, flames and the boost button come from RR.SkyArt; SVG art from RR.Assets (cached rasters). */
(function (RR) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const SA = () => RR.SkyArt;
  const MOODS = ['morning', 'noon', 'sunset', 'night'];
  // per-mood cloud tint (env artist): colour, alpha, layer alphas
  const CLOUD_TINT = [['#FFE6D4', 0.22], [null, 0], ['#F7B7C2', 0.38], ['#59609E', 0.62]];
  const LAYER_A = [[0.55, 0.75, 0.92], [0.6, 0.8, 0.95], [0.55, 0.72, 0.9], [0.35, 0.5, 0.68]];
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#9B6BE0', '#FF8FC0'];
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null ? o[k] : p + (o[k] - p) * a; };

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

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._blinkT = 2; this._blink = 0; this._smokeAcc = 0; this._cam = 0; this._fwT = 0;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      RR.Assets.dropExact();
    }
    prewarm(layout, level) {   // rasterise the big tiles ahead of time
      const rs = this.rs, m = MOODS[clamp(level | 0, 0, 3)];
      RR.Assets.exact('hills_' + m, Math.round(1200 * rs), Math.round(420 * rs));
      RR.Assets.exact('cloudbank', Math.round(1200 * rs), Math.round(300 * rs));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs;
      this.lang = o.lang || 'en';
      this.time += o.dt || 0;
      const a = world.alpha == null ? 1 : world.alpha;
      const cam = o.title ? 0 : ((world._pcamY == null ? world.camY : lerp(world._pcamY, world.camY, a)) || 0);
      this._cam = cam;
      this._mood = o.title ? 0 : o.done ? 3 : clamp(world.level | 0, 0, 3);
      const amb = weather.ambient || {};
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1;
      this._sky(world, weather, amb);
      this._clouds(weather);
      this._particles(weather.particles, 'back');
      this._hills(world, weather, cam);
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a, cam);
      this._particles(weather.particles, 'front');
      this._fx(o.dt || 0);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug) this._debug(world);
    }

    /* ---------- sky ---------- */
    _sky(world, weather, amb) {
      const g = this.g, W = this.W, H = this.H, portrait = H > W;
      const sky = g.createLinearGradient(0, 0, 0, H);
      sky.addColorStop(0, amb.skyTop || '#FFE3C9');
      if (amb.skyMid) sky.addColorStop(0.5, amb.skyMid);
      sky.addColorStop(1, amb.skyBottom || '#A9DBF7');
      g.fillStyle = sky; g.fillRect(0, 0, W, H);
      const t = weather.time || this.time, st = amb.stars || 0;
      if (st > 0.01 && weather.stars) {
        for (const s of weather.stars) {
          const al = st * (0.55 + 0.45 * Math.sin(s.phase + (s.tw || 1.5) * t));
          if (al < 0.03) continue;
          g.fillStyle = s.r > 1.8 ? `rgba(255,243,196,${al})` : `rgba(255,255,255,${al})`;
          g.beginPath(); g.arc(s.x, s.y, s.r || 1.2, 0, TAU); g.fill();
        }
        // distant planets (night)
        const P = [['planet_a', 0.14, 0.26, 120], ['planet_b', 0.56, 0.1, 90], ['planet_c', 0.36, 0.58, 70]];
        for (const p of P) this._sprite(p[0], W * p[1], H * p[2] + (portrait ? 160 : 0), p[3], 0, 0.85 * st);
      }
      const drop = portrait ? 230 : 0, top = (world.layout && world.layout.ins ? world.layout.ins.top : 0);
      const L0 = world.layout || {};
      const rowTop = L0.rowY ? L0.rowY - (L0.islandH || 110) - 130 : H;   // keep the sun / moon above the island row
      const ky = v => Math.min(Math.max(top + 70, H * v + drop), Math.max(top + 70, rowTop));
      const rb = amb.rainbow || 0;
      if (rb > 0.01) {
        const noon = Math.round(amb.mood || 0) === 1;
        this._sprite('rainbow', W * (noon ? 0.3 : 0.7), ky(noon ? 0.34 : 0.3), noon ? 480 : 520, 0, (noon ? 0.45 : 0.55) * rb);
      }
      if ((amb.sun || 0) > 0.01) this._sprite('sun', W * (amb.sunX == null ? 0.18 : amb.sunX), ky(amb.sunY == null ? 0.16 : amb.sunY), amb.sunY > 0.18 ? 200 : 180, 0, amb.sun);
      if ((amb.moon || 0) > 0.01) this._sprite('moon', W * (amb.moonX == null ? 0.8 : amb.moonX), ky(amb.moonY == null ? 0.15 : amb.moonY), 180, 0, amb.moon);
      for (const p of weather.particles || []) if (p.kind === 'streak' && p.alpha > 0.01) {
        g.save(); g.globalAlpha = p.alpha; g.strokeStyle = '#FFF6D8'; g.lineWidth = 3; g.lineCap = 'round';
        const gr = g.createLinearGradient(p.x - Math.cos(p.ang) * p.len, p.y - Math.sin(p.ang) * p.len, p.x, p.y);
        gr.addColorStop(0, 'rgba(255,246,216,0)'); gr.addColorStop(1, 'rgba(255,246,216,1)'); g.strokeStyle = gr;
        g.beginPath(); g.moveTo(p.x - Math.cos(p.ang) * p.len, p.y - Math.sin(p.ang) * p.len); g.lineTo(p.x, p.y); g.stroke(); g.restore();
      }
    }
    _cloudSprite(name, mood, px) {   // a background cloud tinted for one time of day (cached per bucket)
      const base = RR.Assets.sprite(name, px);
      if (!base) return null;
      const T = CLOUD_TINT[mood];
      if (!T[0]) return base;
      const key = name + '^' + mood + '@' + base.width;
      let c = RR.Assets._cache.get(key);
      if (!c) {
        c = RR.Assets.makeCanvas(base.width, base.height);
        const g = c.getContext('2d');
        g.drawImage(base, 0, 0);
        g.globalCompositeOperation = 'source-atop'; g.globalAlpha = T[1]; g.fillStyle = T[0]; g.fillRect(0, 0, c.width, c.height);
        RR.Assets._cache.set(key, c);
      }
      return c;
    }
    _clouds(weather) {
      const g = this.g, list = weather.clouds;
      if (!list) return;
      const to = clamp(weather.mood | 0, 0, 3);
      if (this._curMood == null) this._curMood = to;
      if (to !== this._curMood) { this._fromMood = this._curMood; this._curMood = to; }
      const from = this._fromMood == null ? to : this._fromMood;
      const u = weather._fadeU == null ? 1 : weather._fadeU;
      for (const c of list) {
        if (c.alpha <= 0.01) continue;
        const w = 320 * (c.scale || 1), h = w * 170 / 320;
        const la = lerp(LAYER_A[from][c.layer | 0], LAYER_A[to][c.layer | 0], u) / ([0.55, 0.7, 0.85][c.layer | 0]);
        const draw = (m, al) => {
          const spr = this._cloudSprite(c.sprite, m, w * this.rs);
          if (!spr || al <= 0.01) return;
          g.globalAlpha = clamp(al, 0, 1); g.drawImage(spr, c.x - w / 2, c.y - h / 2, w, h);
        };
        if (u < 1 && from !== to) { draw(from, c.alpha * la * (1 - u)); draw(to, c.alpha * la * u); }
        else draw(to, c.alpha * la);
      }
      g.globalAlpha = 1;
    }
    _hills(world, weather, cam) {   // the take-off meadow: only near the start of a session
      const W = this.W, H = this.H, bottom = H - cam + 8;
      if (bottom - 420 > H) return;
      const g = this.g, m = MOODS[this._mood], rs = this.rs;
      const tw = Math.round(1200 * rs), th = Math.round(420 * rs);
      const tile = RR.Assets.exact('hills_' + m, tw, th);
      if (!tile) return;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0);
      const y = Math.round((bottom - 420) * rs);
      const x0 = -Math.round(((W * rs - tw) / 2 % tw + tw) % tw);
      for (let x = x0 - tw; x < W * rs; x += tw) g.drawImage(tile, x, y);
      g.restore();
    }

    /* ---------- the round ---------- */
    _game(w, o, a, cam) {
      const g = this.g, L = w.layout, mood = this._mood, sa = SA();
      const sy = y => y - cam;
      // cloud bank behind (boost)
      if (w.cloudBankY != null) this._cloudBank(sy(w.cloudBankY), 1, 1);
      if ((w.boostSpeed || 0) > 0.03) this._speedLines(w.boostSpeed);
      // rainbow ribbon
      if (sa && w.trail && w.trail.length > 1) {
        const pts = w.trail.map(p => ({ x: p.x, y: sy(p.y), a: p.a == null ? 1 : p.a })).filter(p => p.y > -200 && p.y < this.H + 200);
        if (pts.length > 1) sa.drawRibbon(g, pts, 22);
      }
      // islands (back first)
      const isl = (w.islands || []).filter(i => i.state !== 'gone').slice().sort((p, q) => p.y - q.y);
      for (const i of isl) this._island(w, i, a, cam, mood);
      // shooting star (surprise)
      if (w.shooting && !w.shooting.caught) this._shooting(w.shooting, a, cam);
      // aim line from the rocket to the finger
      const r = w.rocket;
      if (w.aim && r) this._aim(w, a, cam);
      // wagon + rope, then the rocket
      if (w.wagon) this._wagon(w, a, cam);
      if (r) { this._smokePass = true; this._fx(0); this._smokePass = false; this._rocket(w, o, a, cam); }
      // tokens flying into the wagon
      for (const f of w.flyers || []) {
        if (!sa) break;
        const x = ip(f, 'x', a), y = sy(ip(f, 'y', a)), s = (w.tokenSize ? w.tokenSize(f) : L.islandW * 0.5) * (f.s == null ? 1 : f.s);
        if (f.token && f.token.kind === 'color') { g.save(); g.translate(x, y); g.rotate(ip(f, 'rot', a) || 0); sa.drawStar(g, s * 0.7, f.token.value); g.restore(); continue; }
        g.save(); g.translate(x, y + s / 2); g.rotate(ip(f, 'rot', a) || 0);
        sa.drawToken(g, f.token, s, { sprite: this._spriteCb(), wave: true });
        g.restore();
      }
      if (cam > -1e9 && (w.boostSpeed || 0) > 0.2 && w.cloudBankY != null) this._cloudBank(sy(w.cloudBankY) + 40, 1.3, 0.85, 600);
      // the BOOST button
      if (w.state === 'roundDone' && w.phase === 'boostReady' && sa && L.boost) {
        const bx = clamp(L.boost.x + (L.rocket.w || 120) * 0.95, L.ins.left + 90, this.W - L.ins.right - 90);
        const by = clamp(L.boost.y, 120, this.H - L.ins.bottom - 90);
        g.save(); g.translate(bx, by); sa.drawBoostButton(g, 62, this.time, false); g.restore();
      }
    }
    _spriteCb(ctx) {
      return (name, x, y, s, wave) => {
        let n = String(name); if (n.indexOf('animal_') !== 0) n = 'animal_' + n;
        if (wave && RR.Assets.has(n + '_wave')) n += '_wave';
        this._sprite(n, x, y, s, 0, 1, ctx);
      };
    }
    _island(w, i, a, cam, mood) {
      const g = this.g, sa = SA(); if (!sa) return;
      const x = ip(i, 'x', a), y = ip(i, 'y', a) - cam;
      if (y < -260 || y > this.H + 260) return;
      g.save();
      g.globalAlpha = clamp(i.alpha == null ? 1 : i.alpha, 0, 1);
      g.translate(x, y); g.rotate(ip(i, 'rot', a) || 0); g.scale(i.sx || 1, i.sy || 1);
      const color = i.token && i.token.kind === 'color' ? i.token.value : null;
      // soft shadow-glow under the hinted island
      sa.drawIsland(g, i.w, { style: i.style || 'cloud', color, mood: i.style === 'planet' ? 3 : mood, glow: i.glow || 0, t: this.time, variant: (i.id | 0) % 3 });
      if (i.token && !i.collected && i.token.kind !== 'color') {
        const s = w.tokenSize ? w.tokenSize(i) : i.w * 0.5;
        const bob = Math.sin(this.time * 2.2 + (i.id | 0)) * 2;
        g.translate(0, -2 + bob);
        sa.drawToken(g, i.token, s, { sprite: this._spriteCb(), wave: (i.glow || 0) > 0.3 });
      }
      g.restore();
    }
    _aim(w, a, cam) {
      const g = this.g, r = w.rocket, L = w.layout;
      const x0 = ip(r, 'x', a), y0 = ip(r, 'y', a) - cam - L.rocket.h * 0.55;
      const x1 = w.aim.x, y1 = w.aim.y - cam;
      const hasT = w.aim.target != null;
      g.save();
      g.lineCap = 'round'; g.setLineDash([2, 22]); g.lineDashOffset = -this.time * 60;
      g.strokeStyle = hasT ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.7)'; g.lineWidth = 14;
      const mx = (x0 + x1) / 2, my = Math.min(y0, y1) - 60;
      g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
      g.setLineDash([]);
      g.fillStyle = hasT ? '#FFE27A' : 'rgba(255,255,255,0.8)';
      g.beginPath(); g.arc(x1, y1, hasT ? 16 + Math.sin(this.time * 10) * 3 : 11, 0, TAU); g.fill();
      g.restore();
    }
    _wagon(w, a, cam) {
      const g = this.g, wg = w.wagon, L = w.layout, sa = SA();
      // rope
      if (wg.rope && wg.rope.length > 1) {
        g.save(); g.strokeStyle = '#8A6E4E'; g.lineWidth = 4; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath();
        wg.rope.forEach((p, k) => { const x = ip(p, 'x', a), y = ip(p, 'y', a) - cam; if (k) g.lineTo(x, y); else g.moveTo(x, y); });
        g.stroke(); g.restore();
      }
      const ww = (L.wagon && L.wagon.w) || 114, k = ww / 160;
      const x = ip(wg, 'x', a), y = ip(wg, 'y', a) - cam;
      if (y < -200 || y > this.H + 200) return;
      g.save(); g.translate(x, y); g.rotate(ip(wg, 'rot', a) || 0); g.scale(k, k); g.translate(-80, -18);
      this._img('wagon_back', 0, 0, 160, 110);
      const items = (wg.items || []).slice(-5);
      items.forEach((tk, n) => {
        const cx = 80 + (n - (items.length - 1) / 2) * 22, s = 46;
        g.save(); g.translate(cx, 64 - (n % 2) * 6);
        if (!sa) { g.restore(); return; }
        if (tk.kind === 'color') sa.drawStar(g, 40, tk.value);
        else sa.drawToken(g, tk, s, { sprite: this._spriteCb() });
        g.restore();
      });
      this._img('wagon_front', 0, 0, 160, 110);
      g.restore();
    }
    _bimFrame(w, o) {
      const m = (w.bim && w.bim.mood) || 'idle';
      let f = 'bim_' + (['happy', 'cheer', 'think', 'oops', 'talk'].includes(m) ? m : 'idle');
      if (f === 'bim_idle') {
        if (o.speaking && Math.floor(this.time / 0.15) % 2 === 0) f = 'bim_talk';
        else if (this._blinking(o.dt)) f = 'bim_blink';
      }
      return f;
    }
    _rocket(w, o, a, cam) {
      const g = this.g, r = w.rocket, L = w.layout, sa = SA();
      const h = L.rocket.h;
      let x = ip(r, 'x', a), y = ip(r, 'y', a) - cam;
      const sh = r.shake || 0;
      if (sh > 0.01) { x += (Math.random() - 0.5) * 6 * sh; y += (Math.random() - 0.5) * 6 * sh; }
      const rot = ip(r, 'rot', a) || 0;
      // smoke from the nozzle
      const fl = r.flame || 0;
      if (fl > 0.2 && (o.dt || 0) > 0) {
        this._smokeAcc += (o.dt || 0) * 26 * fl * this.quality;
        while (this._smokeAcc > 1) {
          this._smokeAcc--;
          const nx = x - Math.sin(rot) * -8, ny = y + Math.cos(rot) * 8;
          this.fx.push({ k: 'smoke', x: nx + (Math.random() - 0.5) * 16, y: ny, vx: (Math.random() - 0.5) * 50 - Math.sin(rot) * 60, vy: 60 + Math.random() * 60, t: 0, life: 0.7 + Math.random() * 0.4, size: 22 + Math.random() * 16 });
        }
      }
      // glow while waiting for the boost tap
      const gl = r.glow || 0;
      if (gl > 0.01) {
        const rg = g.createRadialGradient(x, y - h * 0.5, 10, x, y - h * 0.5, h * 0.85);
        rg.addColorStop(0, `rgba(255,236,150,${0.55 * gl})`); rg.addColorStop(1, 'rgba(255,236,150,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(x, y - h * 0.5, h * 0.85, 0, TAU); g.fill();
      }
      const bounce = gl > 0.01 ? Math.abs(Math.sin(this.time * 5)) * 8 * gl : 0;
      g.save(); g.translate(x, y - bounce); g.rotate(rot); g.scale(r.sx || 1, r.sy || 1);
      const px = h * this.rs * 1.1;
      const imgs = { back: RR.Assets.sprite('rocket_back', px), front: RR.Assets.sprite('rocket_front', px), bim: RR.Assets.sprite(this._bimFrame(w, o), px * 0.6) || RR.Assets.sprite('bim_idle', px * 0.6) };
      if (sa) sa.drawRocket(g, h, imgs, { flame: fl, t: this.time });
      g.restore();
    }
    _shooting(s, a, cam) {
      const g = this.g, x = ip(s, 'x', a), y = ip(s, 'y', a) - cam;
      const ang = Math.atan2(s.vy || 0.3, s.vx || 1);
      g.save(); g.lineCap = 'round';
      const len = 170, gr = g.createLinearGradient(x - Math.cos(ang) * len, y - Math.sin(ang) * len, x, y);
      gr.addColorStop(0, 'rgba(255,240,170,0)'); gr.addColorStop(1, 'rgba(255,240,170,0.95)');
      g.strokeStyle = gr; g.lineWidth = 10; g.beginPath(); g.moveTo(x - Math.cos(ang) * len, y - Math.sin(ang) * len); g.lineTo(x, y); g.stroke();
      g.translate(x, y); g.rotate(this.time * 3);
      if (SA()) SA().drawStar(g, 56 + Math.sin(this.time * 12) * 5, 'yellow');
      g.restore();
    }
    _cloudBank(cy, scale, alpha, off) {
      const g = this.g, rs = this.rs, w = 1200 * scale, h = 300 * scale;
      if (cy + h / 2 < 0 || cy - h / 2 > this.H) return;
      const tw = Math.round(w * rs), th = Math.round(h * rs);
      const tile = RR.Assets.exact('cloudbank', tw, th);
      if (!tile) return;
      g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.globalAlpha = alpha;
      const y = Math.round((cy - h / 2) * rs);
      for (let x = -Math.round((off || 0) * rs) % tw - tw; x < this.W * rs; x += tw) g.drawImage(tile, x, y);
      g.restore();
    }
    _speedLines(sp) {
      const g = this.g, W = this.W, H = this.H, t = this.time;
      g.save(); g.strokeStyle = `rgba(255,255,255,${0.55 * sp})`; g.lineCap = 'round';
      for (let i = 0; i < 18; i++) {
        const x = ((i * 0.618 + 0.05) % 1) * W, len = 80 + (i % 5) * 40, y = ((t * (900 + i * 37) + i * 211) % (H + len)) - len;
        g.lineWidth = 3 + (i % 3) * 2; g.beginPath(); g.moveTo(x, y); g.lineTo(x, y + len * sp); g.stroke();
      }
      g.restore();
    }
    _blinking(dt) {
      this._blinkT -= dt || 0;
      if (this._blinkT <= 0) { this._blink = 0.13; this._blinkT = 2.5 + Math.random() * 3; }
      if (this._blink > 0) { this._blink -= dt || 0; return true; }
      return false;
    }

    /* ---------- title & celebration ---------- */
    _titleScene(w, o) {
      const g = this.g, L = w.layout, W = this.W, H = this.H, portrait = H > W, sa = SA();
      const iw = portrait ? 260 : 240, sy = H - L.ins.bottom - (portrait ? 170 : 120);
      // left: the rocket on a cloud; right: Bim waving on a cloud
      const rx = portrait ? W * 0.3 : L.ins.left + Math.max(170, W * 0.16), bx = portrait ? W * 0.72 : W - L.ins.right - Math.max(170, W * 0.15);
      const bob1 = Math.sin(this.time * 1.4) * 6, bob2 = Math.sin(this.time * 1.4 + 1.3) * 6;
      if (sa) {
        g.save(); g.translate(rx, sy + bob1); sa.drawIsland(g, iw, { style: 'cloud', mood: 0, t: this.time }); g.restore();
        g.save(); g.translate(bx, sy + bob2); sa.drawIsland(g, iw * 0.9, { style: 'cloud', mood: 0, t: this.time, variant: 1 }); g.restore();
        const h = portrait ? 260 : 230, fl = 0.25 + 0.15 * Math.sin(this.time * 8);
        g.save(); g.translate(rx, sy + bob1); g.rotate(Math.sin(this.time * 1.1) * 0.04);
        const px = h * this.rs * 1.1;
        sa.drawRocket(g, h, { back: RR.Assets.sprite('rocket_back', px), front: RR.Assets.sprite('rocket_front', px), bim: RR.Assets.sprite('bim_happy', px * 0.6) }, { flame: 0, t: this.time });
        g.restore();
        void fl;
      }
      const cyc = this.time % 2.4, hop = cyc < 0.5 ? Math.sin(cyc / 0.5 * Math.PI) * 18 : 0;
      const bh = portrait ? 250 : 220;
      this._img('bim_full_wave', bx - bh * 256 / 300 / 2, sy + bob2 - hop - bh * 288 / 300, bh * 256 / 300, bh);
    }
    _doneScene(w, o) {   // the moon party: fireworks and every friend met on the way
      const g = this.g, L = w.layout, W = this.W, H = this.H, t = this.time, sa = SA();
      const portrait = H > W;
      const groundY = H - L.ins.bottom - 60;
      // a big pale moon hill
      g.save(); g.fillStyle = '#EDE7FF'; g.strokeStyle = '#B9B0DE'; g.lineWidth = 5;
      g.beginPath(); g.ellipse(W / 2, groundY + H * 0.5, W * 0.75, H * 0.52, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#DCD3F7';
      [[-0.3, 0.06, 40], [0.22, 0.03, 28], [0.38, 0.1, 34], [-0.08, 0.12, 22]].forEach(c => { g.beginPath(); g.ellipse(W / 2 + c[0] * W, groundY + c[1] * H + 20, c[2], c[2] * 0.4, 0, 0, TAU); g.fill(); });
      g.restore();
      // fireworks
      this._fwT -= o.dt || 0;
      if (this._fwT <= 0) { this._fwT = 0.7 + Math.random() * 0.6; this.burst('firework', W * (0.15 + Math.random() * 0.7), H * (0.18 + Math.random() * 0.3)); }
      const col = (w.collected || []).filter(k => k && (k.kind === 'animal' || k.kind === 'size'));
      const names = []; col.forEach(k => { const n = (k.sprite || ('animal_' + (k.animal || k.value))); if (!names.includes(n)) names.push(n); });
      const friends = names.length ? names : (RR.ANIMALS || []).map(x => 'animal_' + x);
      // Bim: portrait high above the panel; landscape on the left (the panel sits on the right)
      const bh = Math.min(H * (portrait ? 0.24 : 0.42), 300), cyc = t % 1.1, hop = cyc < 0.55 ? Math.sin(cyc / 0.55 * Math.PI) * 30 : 0;
      const bw = bh * 256 / 300;
      const bx = portrait ? W / 2 : L.ins.left + Math.max(110, W * 0.13), by = portrait ? H * 0.36 : groundY + 10;
      this._img('bim_full_cheer', bx - bw / 2, by - hop - bh * 288 / 300, bw, bh);
      // friends: portrait — a row on the moon below the panel's top? no: beside Bim on the moon top; landscape — between Bim and the panel
      const x0 = portrait ? L.ins.left + 40 : bx + bw * 0.6, x1 = portrait ? W - L.ins.right - 40 : Math.max(x0 + 200, W * 0.5);
      const fy = portrait ? H * 0.36 : groundY + 10;
      const n = Math.min(friends.length, portrait ? 6 : 8);
      const step = Math.min(110, (x1 - x0) / Math.max(1, n)), s = Math.min(90, step * (portrait ? 0.95 : 1.2));
      for (let i = 0; i < n; i++) {
        let fx;
        if (portrait) { const side = i % 2 ? 1 : -1, k = Math.floor(i / 2); fx = bx + side * (bw * 0.55 + s * 0.6 + k * step); }
        else fx = x0 + step * (i + 0.5);
        if (fx < L.ins.left + s * 0.5 || fx > W - L.ins.right - s * 0.5) continue;
        const hp = Math.max(0, Math.sin(t * 3.2 + i * 0.9)) * 14;
        this._sprite(friends[i] + (hp > 8 && RR.Assets.has(friends[i] + '_wave') ? '_wave' : ''), fx, fy - hp - s * 0.45, s);
      }
      void sa;
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((RR.CONFIG && RR.CONFIG.introTime) || 1.8) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * 0.42;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(40,40,110,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFDF8'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#C9C2EE'; g.stroke();
      const I = RR.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#6b6a99', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 62, '#1E7A74', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#6b6a99', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#1E7A74', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 260) fx.splice(0, fx.length - 260);
      const R = Math.random;
      const colOf = c => (SA() && SA().COLORS && SA().COLORS[c]) ? SA().COLORS[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'pop' || type === 'collect') {
        const col = colOf(opt.color), size = opt.size || 110;
        fx.push({ k: 'flash', x, y, t: 0, life: 0.32, size });
        const n = Math.round((type === 'collect' ? 14 : 24) * this.quality);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 160 + R() * 280;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: opt.color ? col : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 120,
            g: 520, drag: 1.4, t: 0, life: 0.8 + R() * 0.5, size: 20 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 14, sway: R() * TAU });
        }
        for (let i = 0; i < 6; i++) {
          const a = R() * TAU, sp = 90 + R() * 140;
          fx.push({ k: 'p', sprite: 'sparkle', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 0, t: 0, life: 0.5 + R() * 0.2, size: 20 + R() * 12, rot: R() * TAU, vr: 4 });
        }
      } else if (type === 'land') {
        for (let i = 0; i < 7; i++) fx.push({ k: 'smoke', x: x + (R() - 0.5) * 60, y: y - 4, vx: (R() < 0.5 ? -1 : 1) * (60 + R() * 90), vy: -10 - R() * 30, t: 0, life: 0.55, size: 22 + R() * 14 });
      } else if (type === 'sparkles') {
        for (let i = 0; i < 26; i++) {
          const a = R() * TAU, sp = 120 + R() * 300;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 100, g: 220, t: 0, life: 1 + R() * 0.6, size: 20 + R() * 16, rot: R() * TAU, vr: 5 });
        }
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
      }
    }
    _fx(dt) {
      const g = this.g, fx = this.fx;
      for (let i = fx.length - 1; i >= 0; i--) {
        const f = fx[i];
        f.t += dt;
        if (f.t < 0) continue;
        if (this._smokePass && f.k !== 'smoke') continue;
        const u = f.t / f.life;
        if (u >= 1) { if (f.onDone) f.onDone(); fx.splice(i, 1); continue; }
        if (f.k === 'p') {
          f.vy += (f.g || 0) * dt;
          if (f.drag) { f.vx *= 1 - f.drag * dt; f.vy = Math.min(f.vy, 200); if (f.sway != null) { f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; } }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const al = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, f.size, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, f.size, f.rot, al);
        } else if (f.k === 'smoke') {
          if (!this._smokePass) { f.vx *= 1 - 1.8 * dt; f.vy *= 1 - 1.8 * dt; f.x += f.vx * dt; f.y += f.vy * dt; continue; }   // drawn behind the rocket
          const s = f.size * (1 + 1.4 * u), al = 0.75 * (1 - u);
          if (SA() && SA().drawPuff) { g.save(); g.translate(f.x, f.y); SA().drawPuff(g, s, al, this._mood || 0); g.restore(); }
          else this._sprite('puff', f.x, f.y, s, 0, al);
        } else if (f.k === 'flash') {
          g.strokeStyle = `rgba(255,250,220,${0.9 * (1 - u)})`; g.lineWidth = 8 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.25 + 0.6 * u), 0, TAU); g.stroke();
          g.fillStyle = `rgba(255,255,240,${0.55 * (1 - u) * (1 - u)})`; g.beginPath(); g.arc(f.x, f.y, f.size * 0.35 * (1 - u * 0.5), 0, TAU); g.fill();
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color || '255,240,150'},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = RR.Assets.tinted ? RR.Assets.tinted(name, color, size * this.rs) : RR.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || p.alpha <= 0.01 || p.kind === 'streak') continue;
        const nm = p.sprite === 'star' ? 'pstar' : p.sprite;
        if (p.color) this._tinted(nm, p.color, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha);
      }
    }

    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = RR.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = RR.Assets.sprite(name, Math.max(w, h) * this.rs * 1.5);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g;
      g.strokeStyle = 'rgba(255,0,0,.6)'; g.lineWidth = 2;
      for (const i of w.islands || []) { const b = w.islandHit && w.islandHit(i.id); if (b) g.strokeRect(b.x - b.w / 2, b.y - b.h / 2, b.w, b.h); }
      const rb = w.rocketHit && w.rocketHit(); if (rb) g.strokeRect(rb.x - rb.w / 2, rb.y - rb.h / 2, rb.w, rb.h);
      if (w.hudKeep) { g.strokeStyle = 'rgba(0,0,255,.5)'; g.strokeRect(w.hudKeep.x, w.hudKeep.y, w.hudKeep.w, w.hudKeep.h); }
    }
    /* A token (or a small coloured island) for Talk-time previews and answer buttons. */
    drawItemBody(g, it, s) {
      const sa = SA(); if (!sa) return;
      const tk = it.token || it;
      if (tk.kind === 'color') {
        g.save(); g.translate(0, -s * 0.12); sa.drawIsland(g, s * 0.95, { style: 'cloud', color: tk.color || tk.value, mood: 1, t: 0 }); g.restore();
        return;
      }
      const kind = tk.kind === 'dots' ? 'stars' : tk.kind;
      const t2 = Object.assign({}, tk, { kind, n: tk.n != null ? tk.n : (kind === 'stars' ? +tk.value : tk.n) });
      if (kind === 'animal' && !t2.sprite) t2.sprite = 'animal_' + t2.value;
      g.save(); g.translate(0, s * 0.45);
      sa.drawToken(g, t2, s * 0.9, { sprite: this._spriteCb(g) });
      g.restore();
    }
  }

  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const r = RR.render; if (!r) return;
    const saveG = r.g, saveRs = r.rs;
    r.g = g; r.rs = dpr;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      r.drawItemBody(g, thing, Math.min(ch * 0.95, cw * 0.95));
      g.restore();
    } finally { r.g = saveG; r.rs = saveRs; }
  };
  RR.Renderer = Renderer;
})(window.RR = window.RR || {});
