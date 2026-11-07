/* SP.Renderer (Nini's Sea Painting) — draws the seabed studio on one canvas: the water gradient (ambient colours that
 * crossfade by season), god rays, far reef / mid kelp / sandy ground / caustics / the surface (tools/env_scenes.js recipe),
 * the clam on the sand, Nini (mood frames, blink, talk flaps, a gentle bob) with her brush held in the flipper, the
 * shell-framed canvas and the line picture (SP.PaintArt) with the w.pic transform (it swims off in 'alive'), the paint
 * shells, splats, the flying brush, the fishy, the hint hand, weather particles and juice; the title (Nini waving beside
 * a painted fish) and the session-done gallery (every picture of the session floating around Nini).
 * Logical coordinates (short side 720) × render scale rs = device pixels. No camera. Missing art is tolerated. */
(function (SP) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const MOODS = ['spring', 'summer', 'autumn', 'winter'];
  const SAND_BOTTOM = { spring: '#E2CDA3', summer: '#E4CFA4', autumn: '#E1CA9C', winter: '#DFCEAF' };   // tools/art_env.js
  const NINI = { w: 300, h: 300, ax: 150, ay: 292 };
  // docs/art/nini_hand.json: the right front flipper grip point per frame (viewBox px) and the brush direction (deg, canvas
  // convention, from the grip towards the bristle tip)
  const HAND = { idle: [223, 246, -62], blink: [223, 246, -62], talk: [234, 240, -58], happy: [245, 229, -50], cheer: [234, 149, -70],
    think: [200, 175, -15], oops: [250, 208, -55], wave: [222, 141, -40], paint: [254, 182, -18], point: [244, 157, -40], full_wave: [222, 141, -40] };
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null || o[k] == null ? o[k] : p + (o[k] - p) * a; };
  const PA = () => SP.PaintArt;
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };

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

  /* ---------- env recipe: copied verbatim from tools/env_scenes.js (pure) ---------- */
  function envLayout(W, H, groundY) {
    const portrait = H > W;
    const band = portrait ? Math.min(210, Math.max(150, Math.round((H - 960) / 3 + 150))) : 150; // sand above groundY
    const sandY = Math.round(groundY - band);
    const kg = Math.max(0.8, (H - sandY) / 200);                 // ground: sand line (vb 60) at sandY, bottom ≥ H
    const km = portrait ? 1.4 : 0.82;                            // mid: props stand on the sand line
    const kf = Math.max(0.9, Math.min(portrait ? 1.45 : 1.1, (sandY + 40) / 600)); // far: bigger in portrait → fuller
    const ks = 1;
    const cx = W / 2;
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: cx - 600 * kf, y: sandY + 26 - 720 * kf };
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: cx - 470 * km, y: sandY + 6 - 290 * km };
    const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: cx - 600 * kg, y: sandY - 60 * kg };
    ground.fillY = ground.y + 255 * kg;
    const surface = { k: ks, w: 1200 * ks, h: 120 * ks, x0: 0, y: 0 };
    const caustic = { tw: 400, th: 120, x0: 0, y0: sandY - 10, y1: H, a: 1 };
    const kr = (sandY + 40) / 720, rw = 600 * kr * (portrait ? 0.9 : 1);
    const rays = portrait
      ? [{ x: cx - rw * 0.62, y: 0, w: rw, h: 720 * kr, a: 1 }, { x: cx - rw * 0.05, y: 0, w: rw * 0.7, h: 720 * kr * 0.8, a: 0.55 }]
      : [{ x: W * 0.3 - rw / 2, y: 0, w: rw, h: 720 * kr, a: 1 }, { x: W * 0.78 - rw * 0.4, y: 0, w: rw * 0.8, h: 720 * kr * 0.85, a: 0.6 }];
    return { sandY, band, far, mid, ground, surface, caustic, rays };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this._brushV = null; this.gallery = []; this._titlePic = null;
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      SP.Assets.dropExact();
      this._envKey = '';
    }
    prewarm(layout, level) {   // rasterise the big tiles of a season ahead of time
      if (layout) this._envFor(layout);
      const E = this._env; if (!E) return;
      const m = MOODS[clamp(level | 0, 0, 3)];
      for (const l of ['far', 'mid', 'ground', 'surface']) this._tile(l, m);
    }
    /** keep a finished picture for the session-done gallery (main calls it on roundDone) */
    keepPicture(pic, st) {
      if (!pic) return;
      const fills = {};
      for (const p of pic.parts) { const s = st && st[p.id]; fills[p.id] = { color: (s && s.color) || p.def, t: 1 }; }
      this.gallery.push({ pic, st: fills, ph: Math.random() * TAU });
      if (this.gallery.length > 16) this.gallery.shift();
    }
    clearGallery() { this.gallery = []; }

    /* ---------- env ---------- */
    _envFor(L) {
      const gy = L.groundY || this.H - 18;
      const key = [this.W, this.H, Math.round(gy)].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, gy);
      this._envKey = key;
      return this._env;
    }
    _tile(layer, m) {
      const E = this._env, Ly = E[layer];
      return SP.Assets.exact(layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : world.alpha;
      this._L = world.layout;
      const amb = weather.ambient || {};
      this._amb = amb;
      this._envFor(this._L);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this._backdrop(amb);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }

    /* ---------- backdrop: water → rays → far → mid → ground (+ sand fill) → caustic → surface; seasons crossfade ---------- */
    _backdrop(amb) {
      const g = this.g, W = this.W, H = this.H, E = this._env;
      const to = MOODS.includes(amb.env) ? amb.env : 'spring', from = MOODS.includes(amb.envFrom) ? amb.envFrom : to;
      const mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      const gr = g.createLinearGradient(0, 0, 0, E.sandY);
      gr.addColorStop(0, amb.waterTop || '#7FD3D8'); gr.addColorStop(1, amb.waterBottom || '#2E8FA8');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const rays = SP.Assets.has('rays') ? amb.rays == null ? 0.5 : amb.rays : 0;
      if (rays > 0.01) {
        const sway = Math.sin(this.time * 0.25) * 10;
        for (const r of E.rays) {
          const spr = SP.Assets.sprite('rays', Math.max(r.w, r.h) * this.rs * 0.5);   // soft: half resolution is plenty
          if (!spr) break;
          g.globalAlpha = clamp(rays * r.a * (0.85 + 0.15 * Math.sin(this.time * 0.6 + r.x)), 0, 1);
          g.drawImage(spr, r.x + sway, r.y, r.w, r.h);
        }
        g.globalAlpha = 1;
      }
      const stack = (m, al) => {
        if (al <= 0.01) return;
        g.save(); g.globalAlpha = al;
        for (const l of ['far', 'mid', 'ground']) {
          const t = this._tile(l, m), Ly = E[l]; if (!t) continue;
          for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
        }
        if (E.ground.fillY < H) { g.fillStyle = SAND_BOTTOM[m]; g.fillRect(0, E.ground.fillY - 0.5, W, H - E.ground.fillY + 0.5); }
        g.restore();
      };
      if (from !== to && mix < 1) { stack(from, 1); stack(to, mix); } else stack(to, 1);
      // caustic light net on the sand (summer bright), slowly drifting
      const ca = amb.caustic == null ? 0.3 : amb.caustic;
      if (ca > 0.02 && SP.Assets.has('caustic')) {
        const C = E.caustic, spr = SP.Assets.exact('caustic', Math.round(C.tw * this.rs), Math.round(C.th * this.rs));
        if (spr) {
          g.save(); g.beginPath(); g.rect(0, C.y0, W, C.y1 - C.y0); g.clip();
          g.globalAlpha = clamp(ca * C.a * 0.55, 0, 1);
          const off = (this.time * 12) % C.tw;
          for (let y = C.y0; y < C.y1; y += C.th) for (const x of tileXs(off, C.tw, W)) g.drawImage(spr, x, y, C.tw, C.th);
          g.restore();
        }
      }
      const surf = (m, al) => {
        if (al <= 0.01) return;
        const t = this._tile('surface', m), Ly = E.surface; if (!t) return;
        g.save(); g.globalAlpha = al;
        const drift = (this.time * 6) % Ly.w;
        for (const x of tileXs(Ly.x0 - drift, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
        g.restore();
      };
      if (from !== to && mix < 1) { surf(from, 1 - mix); surf(to, mix); } else surf(to, 1);
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
    }

    /* ---------- the round ---------- */
    _game(w, o, a) {
      const L = this._L;
      this._clam(w.clam, a);
      this._nini(w.nini, w.nini && w.nini.mood, L.nini);
      const C = L.canvas;
      if (PA()) { try { PA().drawCanvasFrame(this.g, C, { glow: w.canvasGlow || 0, time: this.time }); } catch (e) { /* skip */ } }
      if (w.picture && w.state !== 'talk' && w.state !== 'levelDone') this._picture(w, a);
      this._shells(w, a);
      this._splats(w.splats);
      this._fishy(w.fishy, a);
      this._brush(w, a);
      this._hintHand(w.hintHand);
    }
    _stateFor(w, a) {   // st with t / wob interpolated by alpha (render-side copies; the world's objects stay untouched)
      const out = {};
      for (const p of w.picture.parts) {
        const s = w.st[p.id]; if (!s) continue;
        out[p.id] = { color: s.color, t: clamp(ip(s, 't', a) || 0, 0, 1), ox: s.ox, oy: s.oy, glow: s.glow || 0, wob: ip(s, 'wob', a) || 0, sparkle: s.sparkle || 0 };
      }
      return out;
    }
    _picture(w, a) {
      const g = this.g, C = this._L.canvas, P = w.pic || {};
      const al = clamp(ip(P, 'alpha', a) == null ? 1 : ip(P, 'alpha', a), 0, 1);
      if (al <= 0.01 || !PA()) return;
      const x = ip(P, 'x', a) || 0, y = ip(P, 'y', a) || 0, rot = ip(P, 'rot', a) || 0, wig = ip(P, 'wig', a) || 0;
      const sx = ip(P, 'sx', a) || 1, sy = ip(P, 'sy', a) || 1;
      g.save();
      g.translate(C.x + x + C.w / 2, C.y + y + C.h);
      if (rot) g.rotate(rot);
      if (wig) g.transform(1, 0, -Math.tan(wig), 1, 0, 0);
      if (sx !== 1 || sy !== 1) g.scale(sx, sy);
      g.translate(-C.w / 2, -C.h);
      g.scale(C.s, C.s);
      try { PA().drawPicture(g, w.picture, this._stateFor(w, a), { time: this.time, alpha: al }); } catch (e) { /* skip */ }
      g.restore();
    }
    _shells(w, a) {
      if (!PA()) return;
      const g = this.g;
      for (const s of w.shells || []) {
        const pop = ip(s, 'pop', a) || 0; if (pop <= 0.02) continue;
        g.save(); g.translate(s.x, s.y);
        try { PA().drawPaintShell(g, s.hex || s.color, s.r * pop, { lift: clamp(ip(s, 'lift', a) || 0, 0, 1), wob: ip(s, 'wob', a) || 0, glow: s.glow || 0, selected: s.selected, dim: s.dim || 0, time: this.time }); } catch (e) { /* skip */ }
        g.restore();
      }
    }
    _splats(list) {
      if (!PA() || !list) return;
      const g = this.g;
      for (const s of list) {
        if (!(s.t < 1)) continue;
        g.save(); g.translate(s.x, s.y);
        try { PA().drawSplash(g, s.hex || s.color, s.r, s.t); } catch (e) { /* skip */ }
        g.restore();
      }
    }
    _niniFrame(mood, blink) {
      let nm = 'nini_' + (mood || 'idle');
      if (blink && (mood === 'idle' || !mood)) nm = 'nini_blink';
      if (this._speaking && (mood === 'idle' || mood === 'talk' || !mood) && Math.sin(this.time * 17) > -0.2) nm = 'nini_talk';
      return SP.Assets.has(nm) ? nm : 'nini_idle';
    }
    /** Nini at feet (x, y), height h. Returns the brush grip point {x, y, ang (deg)} of the drawn frame. */
    _nini(m, mood, box, opt = {}) {
      if (!box) return null;
      m = m || {};
      const nm = opt.frame || this._niniFrame(mood, m.blink);
      const k = box.h / NINI.h, bob = Math.sin(this.time * 2.1) * 2.5, lean = clamp(m.look || 0, -1, 1) * 0.025;
      const g = this.g;
      g.save();
      g.translate(box.x, box.y);
      g.rotate(lean);
      // a soft shadow on the sand
      g.fillStyle = 'rgba(20,50,60,0.18)'; g.beginPath(); g.ellipse(0, -2, box.h * 0.3, box.h * 0.05, 0, 0, TAU); g.fill();
      g.translate(0, bob);
      this._img(nm, -NINI.ax * k, -NINI.ay * k, NINI.w * k, NINI.h * k);
      g.restore();
      const hd = HAND[nm.slice(5)] || HAND.idle;
      // the grip point in screen space (same lean + bob as the sprite)
      const hx = (hd[0] - NINI.ax) * k, hy = (hd[1] - NINI.ay) * k + bob, c = Math.cos(lean), s = Math.sin(lean);
      return (this._grip = { x: box.x + hx * c - hy * s, y: box.y + hx * s + hy * c, ang: hd[2] * Math.PI / 180 + lean, k, frame: nm });
    }
    _brush(w, a) {
      if (!PA()) return;
      const B = w.brush; if (!B) return;
      const L = this._L, G = this._grip, nh = (L.nini && L.nini.h) || 250;
      let tx, ty, ta, ts;
      const rest = B.state === 'rest' && G;
      if (rest) {
        // in Nini's flipper: tip ahead of the grip along the art's brush direction, handle behind it
        ts = 0.42 * nh; const d = 0.62 * ts;
        tx = G.x + Math.cos(G.ang) * d; ty = G.y + Math.sin(G.ang) * d + B.dip * 4;
        ta = Math.atan2(-Math.cos(G.ang), Math.sin(G.ang));   // drawBrush: 0 = handle up; handle points from tip back to the grip
      } else {
        tx = ip(B, 'x', a); ty = ip(B, 'y', a); ta = ip(B, 'angle', a) || 0; ts = (B.size || 120) * clamp(nh / 250, 0.75, 1.1);
      }
      // smooth hand-offs (rest ↔ flying, frame changes): an offset that decays, never a jump
      const key = rest ? 'r:' + G.frame : 'f';
      const V = this._brushV || (this._brushV = { key, ox: 0, oy: 0, oa: 0, os: 0, x: tx, y: ty, a: ta, s: ts });
      if (V.key !== key) { V.ox = V.x - tx; V.oy = V.y - ty; V.oa = angDiff(V.a, ta); V.os = V.s - ts; V.key = key; }
      const dec = Math.exp(-(this._dt || 0.016) * 13);
      V.ox *= dec; V.oy *= dec; V.oa *= dec; V.os *= dec;
      V.x = tx + V.ox; V.y = ty + V.oy; V.a = ta + V.oa; V.s = ts + V.os;
      const g = this.g;
      g.save(); g.translate(V.x, V.y);
      try { PA().drawBrush(g, B.hex || B.color || null, V.s, V.a, { drip: ip(B, 'dip', a) || 0 }); } catch (e) { /* skip */ }
      g.restore();
    }
    _fishy(f, a) {
      if (!f || f.state === 'gone') return;
      const g = this.g, x = ip(f, 'x', a), y = ip(f, 'y', a), size = f.size || 120, h = size * 0.75, wig = ip(f, 'wig', a) || 0;
      if (!(x > -size && x < this.W + size)) return;
      const nm = f.state === 'happy' && SP.Assets.has('fishy_happy') ? 'fishy_happy' : 'fishy';
      g.save(); g.translate(x, y + Math.sin(this.time * 4.4) * 3);
      if ((f.dir || 1) < 0) g.scale(-1, 1);
      g.transform(1, Math.tan(wig) * 0.25, 0, 1, 0, 0);
      this._img(nm, -size / 2, -h / 2, size, h);
      g.restore();
    }
    _clam(c, a) {
      if (!c) return;
      const g = this.g, w = c.w || 112, h = c.h || 98, k = w / 160, open = ip(c, 'open', a) || 0;
      const gl = clamp(c.glow || 0, 0, 1);
      if (gl > 0.02) {
        const rg = g.createRadialGradient(c.x, c.y - h * 0.4, 4, c.x, c.y - h * 0.4, w * 0.8);
        rg.addColorStop(0, `rgba(255,246,200,${0.5 * gl})`); rg.addColorStop(1, 'rgba(255,246,200,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(c.x, c.y - h * 0.4, w * 0.8, 0, TAU); g.fill();
      }
      const isOpen = open > 0.5 && SP.Assets.has('clam_open');
      this._img(isOpen ? 'clam_open' : 'clam', c.x - 80 * k, c.y - 136 * k, 160 * k, 140 * k);
      if (isOpen) {   // the pearl rises a little and sparkles
        const u = clamp((open - 0.5) / 0.6, 0, 1.2), ps = 40 * k * (0.8 + 0.25 * u);
        const py = c.y - 84 * k - 10 * u;
        g.save(); g.globalAlpha = clamp(u * 1.5, 0, 1);
        const rg = g.createRadialGradient(c.x, py, 2, c.x, py, ps * 1.4);
        rg.addColorStop(0, 'rgba(255,255,255,0.8)'); rg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(c.x, py, ps * 1.4, 0, TAU); g.fill();
        this._img('pearl', c.x - ps / 2, py - ps / 2, ps, ps);
        this._sprite('sparkle', c.x + ps * 0.5, py - ps * 0.5, 18 + 6 * Math.sin(this.time * 8), this.time * 2, 0.9);
        g.restore();
      }
    }
    _hintHand(H) {
      if (!H || !PA()) return;
      const g = this.g, al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      g.save(); g.globalAlpha *= al; g.translate(H.x, H.y);
      try { PA().drawGhostHand(g, 130, H.t != null ? H.t : (this.time % 1)); } catch (e) { /* skip */ }
      g.restore();
    }

    /* ---------- title: Nini waving beside a painted fish ---------- */
    _paintedPic(id, colors) {
      if (!SP.Pictures) return null;
      const ids = SP.Pictures.list('parts');
      const tid = ids.includes(id) ? id : ids[0];
      let pic; try { pic = SP.Pictures.build(tid, {}); } catch (e) { return null; }
      const st = {};
      pic.parts.forEach((p, i) => { st[p.id] = { color: colors[i] || p.def, t: 1 }; });
      return { pic, st };
    }
    _framedPic(P, x, y, s, opt = {}) {   // a small framed painting: box top-left (x, y), scale s
      const g = this.g, box = { x, y, w: 600 * s, h: 400 * s, s };
      g.save();
      if (opt.rot) { g.translate(x + box.w / 2, y + box.h / 2); g.rotate(opt.rot); g.translate(-x - box.w / 2, -y - box.h / 2); }
      try { PA().drawCanvasFrame(g, box, { glow: opt.glow || 0, time: this.time }); } catch (e) { /* skip */ }
      g.translate(x, y); g.scale(s, s);
      try { PA().drawPicture(g, P.pic, P.st, { time: this.time }); } catch (e) { /* skip */ }
      g.restore();
    }
    _titleScene(w, o) {
      const W = this.W, H = this.H, L = this._L, ins = L.ins || {}, portrait = H > W;
      if (!this._titlePic) this._titlePic = this._paintedPic('fish', ['blue', 'yellow', 'red', 'green']);
      const gy = L.groundY;
      const logo = o.boxes && o.boxes.logo;
      if (portrait) {
        const nh = Math.min(330, H * 0.24);
        this._nini({ blink: Math.sin(this.time * 1.3) > 0.985 }, 'wave', { x: (ins.left || 0) + 40 + nh * 0.36, y: gy - 4, h: nh }, { frame: 'nini_full_wave' });
        const s = 0.6, bw = 600 * s, bh = 400 * s;
        const x = W - (ins.right || 0) - 30 - bw, y = gy - 40 - bh - Math.sin(this.time * 1.4) * 4;
        if (this._titlePic && PA()) this._framedPic(this._titlePic, x, y, s, { rot: 0.03 });
      } else {
        void logo;
        const nh = Math.min(330, H * 0.46);
        const nx = (ins.left || 0) + 30 + nh * 0.42;
        this._nini({ blink: Math.sin(this.time * 1.3) > 0.985 }, 'wave', { x: nx, y: gy - 4, h: nh }, { frame: 'nini_full_wave' });
        const s = clamp((W * 0.5 - 240) / 600, 0.36, 0.52), bw = 600 * s, bh = 400 * s;
        const x = W - (ins.right || 0) - 40 - bw, y = gy - 34 - bh - Math.sin(this.time * 1.4) * 4;
        if (this._titlePic && PA()) this._framedPic(this._titlePic, x, y, s, { rot: -0.035 });
      }
      this._bubbleT = (this._bubbleT || 0) - (o.dt || 0);
      if (this._bubbleT <= 0) { this._bubbleT = 0.9; this.burst('bubbles', W * (0.1 + Math.random() * 0.8), gy - 10, { n: 2 }); }
    }
    /* ---------- session done: the gallery of the session's pictures floating around a cheering Nini ---------- */
    _doneScene(w, o) {
      const W = this.W, H = this.H, t = this.time, L = this._L, ins = L.ins || {}, portrait = H > W, gy = L.groundY;
      const panel = o.boxes && o.boxes.done;
      // the free area (landscape: left of the panel; portrait: below it)
      const fx0 = (ins.left || 0) + 16, fx1 = portrait ? W - (ins.right || 0) - 16 : (panel ? panel.x - 16 : W * 0.58);
      const fy0 = portrait ? (panel ? panel.y + panel.h + 16 : H * 0.4) : (ins.top || 0) + 20, fy1 = gy;
      const ny = fy1 - 4;
      const pics = this.gallery.length ? this.gallery : (this._titlePic ? [Object.assign({ ph: 0 }, this._titlePic)] : []);
      // Nini gets her own space so she never covers a picture (visual P1-2): landscape → a column on the left,
      // portrait → a band under the grid (her beret reaches ≈ 1.02 h)
      let nh, nx, gx0, gx1 = fx1, gy0 = fy0, gy1;
      if (portrait) {
        nh = clamp((fy1 - fy0) * 0.34, 130, 260);
        nx = (fx0 + fx1) / 2; gx0 = fx0; gy1 = ny - nh * 1.04;
      } else {
        nh = clamp((fy1 - fy0) * 0.5, 150, 300);
        const nW = nh * 0.75;
        nx = fx0 + nW / 2; gx0 = fx0 + nW + 12; gy1 = fy1 - 10;
      }
      // "Our pictures" sits right above the gallery (visual P3-5), on the water in outlined text
      const I = SP.I18N, label = I ? I.t(this.lang, 'ui.gallery') : 'Our pictures';
      const lh = clamp((gy1 - gy0) * 0.09, 22, 34);
      if (label && label !== 'ui.gallery' && gy1 - gy0 > 140) {
        outlinedText(this.g, label, (gx0 + gx1) / 2, gy0 + lh * 0.6, lh, '#ffffff', '#1F6E8C', gx1 - gx0 - 20);
        gy0 += lh * 1.3;
      }
      const n = pics.length, gw = gx1 - gx0, gh = Math.max(portrait ? 80 : 160, gy1 - gy0);
      let best = null;
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols), sc = Math.min((gw / cols - 44) / 600, (gh / rows - 40) / 400);   // the rope frame (≥ 14 px a side) + a gap fit too
        if (!best || sc > best.s) best = { cols, rows, s: sc };
      }
      const sc = clamp(best ? best.s : 0.3, 0.06, 0.42), cw = best ? gw / best.cols : gw, chh = best ? gh / best.rows : gh;
      pics.forEach((P, i) => {
        const r = Math.floor(i / best.cols), c = i % best.cols, inRow = Math.min(best.cols, n - r * best.cols);
        const bw = 600 * sc, bh = 400 * sc, x0 = gx0 + (gw - inRow * cw) / 2;
        const bob = Math.sin(t * 1.3 + (P.ph || i)) * Math.min(5, (chh - bh) / 2);
        const x = x0 + c * cw + (cw - bw) / 2, y = gy0 + r * chh + (chh - bh) / 2 + bob;
        if (PA()) this._framedPic(P, x, y, sc, { rot: Math.sin(t * 0.9 + i * 1.7) * 0.04 });
      });
      this._nini({ blink: false }, Math.sin(t * 3) > 0 ? 'cheer' : 'happy', { x: nx, y: ny, h: nh });
      this._doneGeom = { nini: { x: nx - nh * 0.375, y: ny - nh * 1.02, w: nh * 0.75, h: nh * 1.02 }, grid: { x: gx0, y: gy0, w: gw, h: gh }, s: sc };
      this._noteT = (this._noteT || 0) - (o.dt || 0);
      if (this._noteT <= 0) { this._noteT = 0.5; this.burst('sparkles', fx0 + Math.random() * (fx1 - fx0), fy0 + Math.random() * (gy - fy0) * 0.6, { n: 8 }); }
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((SP.CONFIG && SP.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * (H > W ? 0.4 : 0.42);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(10,40,60,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFFBF2'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#8FD0D2'; g.stroke();
      const I = SP.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#2C6467', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 58, '#1F6E8C', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#2C6467', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#1F6E8C', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && SP.PALETTE && SP.PALETTE[c]) ? SP.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 240;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: opt.color ? colOf(opt.color) : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, drag: 1.2, t: 0, life: 0.8 + R() * 0.5, size: 16 + R() * 14, rot: R() * TAU, vr: 3 });
        }
      } else if (type === 'bubbles') {
        for (let i = 0; i < (opt.n || 5); i++) fx.push({ k: 'p', sprite: 'bubble', x: x + (R() - 0.5) * 30, y, vx: (R() - 0.5) * 30, vy: -60 - R() * 80, g: -30, drag: 0.6, t: 0, life: 1.2 + R() * 0.8, size: 10 + R() * 16, rot: 0, vr: 0, sway: R() * TAU });
      } else if (type === 'ring') {
        fx.push({ k: 'ring', x, y, t: 0, life: opt.life || 0.4, size: opt.size || 90, color: opt.rgb || '255,255,255' });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(110 * q);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'count') {   // a big numeral floats up over the painted spot
        fx.push({ k: 'num', x, y, t: 0, life: 0.9, text: String(opt.n || '') });
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
          const al = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, f.size, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, f.size, f.rot, al);
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#1F6E8C', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = SP.Assets.tinted ? SP.Assets.tinted(name, color, size * this.rs) : SP.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.alpha > 0.01)) continue;
        const nm = p.sprite === 'star' ? 'pstar' : p.sprite;
        const tint = p.color && (p.kind === 'dot' || p.kind === 'confetti' || p.sprite === 'dot') ? p.color : null;
        if (tint) this._tinted(nm, tint, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = SP.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = SP.Assets.sprite(name, Math.max(w, h) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.niniHit && w.niniHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h); }
      g.fillStyle = 'rgba(255,0,0,.8)';
      if (w.picture && w.partTap) for (const p of w.picture.parts) { const q = w.partTap(p.id); if (q) { g.beginPath(); g.arc(q.x, q.y, 6, 0, TAU); g.fill(); } }
      for (const s of w.shells || []) { g.strokeStyle = 'rgba(0,160,0,.7)'; g.beginPath(); g.arc(s.x, s.y, (L.palette && L.palette.hitR) || 76, 0, TAU); g.stroke(); }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with PaintArt.drawIcon into a small canvas. */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!thing || !PA()) return;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      PA().drawIcon(g, thing, Math.min(ch, cw) * 0.96);
      g.restore();
    } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  SP.Renderer = Renderer;
})(window.SP = window.SP || {});
