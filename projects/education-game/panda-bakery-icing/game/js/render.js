/* IB.Renderer (Mochi's Icing Bakery) — draws the bakery kitchen on one canvas: the wall, the window tiles with the season
 * outside (snow / petals clipped to the glass), the light bars, the counter props and the counter (tools/env_scenes.js
 * recipe, seasons crossfade), the cooling rack with the chapter's finished cookies, the flour sack + peeking mouse, the
 * baking tray (IB.CookieArt) with the board cookie / home / side cookie, the icing strokes (picture px), the guide dots,
 * chocolate chips, the walking animal, the choice row (icing bags / choice cookies), Mochi (mood frames, blink, talk flaps,
 * a gentle bob) with the icing bag in her paw (grip points from docs/art/mochi_hand.json) or under the finger, sprinkles,
 * the bird, the ghost hand, weather particles and juice; the title (Mochi waving with a heart cookie beside a rack of
 * cookies) and the session-done gallery (every cookie of the session on racks around a cheering Mochi).
 * Logical coordinates (short side 720) × render scale rs = device pixels. No camera. Missing art is tolerated. */
(function (IB) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const MOODS = ['spring', 'summer', 'autumn', 'winter'];
  const AMB_FALLBACK = { wall: '#F6E9D2', floor: '#B98E66' };   // tools/art_env.js AMBIENT.spring
  // per-season wall wash (QA P1-3): blossom pink, sunny butter, amber, cool winter blue
  const WALL_WASH = { spring: 'rgba(255,190,210,0.13)', summer: 'rgba(255,222,120,0.13)', autumn: 'rgba(235,150,70,0.15)', winter: 'rgba(150,180,225,0.2)' };
  const MOCHI = { w: 300, h: 300, ax: 150, ay: 292 };
  // docs/art/mochi_hand.json: Mochi's right-paw grip per frame (viewBox px) + the nozzle direction (deg, canvas convention:
  // 0 = right, 90 = straight down, from the grip towards the nozzle tip)
  const HAND = { idle: [223, 253, 100], blink: [223, 253, 100], talk: [233, 246, 96], happy: [244, 231, 70], cheer: [236, 176, 60],
    think: [169, 194, 140], oops: [246, 223, 70], wave: [232, 176, 40], pipe: [248, 216, 70], point: [242, 189, 30], title: [232, 176, 40] };
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null || o[k] == null ? o[k] : p + (o[k] - p) * a; };
  const CA = () => IB.CookieArt;
  const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
  const ICING_W = () => (IB.Content && IB.Content.ICING_W) || 22;

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
  /** Pure layout of the environment layers for a W × H screen whose feet line is groundY.
   *  Returns { counterY, counterFront, far, mid, ground: {k, w, h, x0, y[, fillY]}, windows: [{x,y,w,h}],
   *  lights: [{x,y,w,h}] }. Tile x positions: tileXs(layer.x0, layer.w, W). */
  function envLayout(W, H, groundY, opt) {
    opt = opt || {};
    const portrait = H > W;
    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
    const band = portrait ? clamp(Math.round((H - 960) / 3 + 60), 150, 260) : 190;       // counter top above groundY
    const counterY = Math.round(opt.counterY != null ? opt.counterY : groundY - band);
    const freeTop = opt.freeTop != null ? opt.freeTop : (portrait ? Math.round(H * 0.59) : 140);
    // far: one window per tile, glass (vb 250–550 × 90–400) centred in the free wall band
    const kf = clamp((counterY - freeTop) * 0.8 / 340, 0.62, 1.0);
    const wc = (freeTop + counterY - 60) / 2;
    const trayCx = opt.trayCx != null ? opt.trayCx : (portrait ? W / 2 : (270 + W - 30) / 2);
    const far = { k: kf, w: 800 * kf, h: 720 * kf, x0: portrait ? W / 2 - 400 * kf : trayCx, y: wc - 245 * kf };
    far.y = Math.max(far.y, freeTop - 52 * kf);                   // the curtain rod (vb 58) stays below the free-band top
    if (far.y + far.h < counterY + 12) far.y = counterY + 12 - far.h;
    const windows = [], lights = [];
    for (const x of tileXs(far.x0, far.w, W)) {
      windows.push({ x: x + 250 * kf, y: far.y + 90 * kf, w: 300 * kf, h: 310 * kf });
      lights.push({ x: x + 100 * kf, y: far.y, w: 600 * kf, h: 720 * kf });
    }
    const km = portrait ? 0.85 : 0.75;
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: (portrait ? W * 0.5 : W * 0.27) - 290 * km, y: counterY + 2 - 296 * km };
    const kg = Math.max(0.85, (groundY + 6 - counterY) / 234);   // toe kick (vb 242) ≈ at the feet line
    const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: W / 2 - 600 * kg, y: counterY - 8 * kg };
    ground.fillY = ground.y + 255 * kg;
    return { portrait, band, counterY, counterFront: ground.y + 58 * kg, freeTop, far, mid, ground, windows, lights };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

  /* ---------- decorated cookies: cookie units → the picture-px box CookieArt.drawCookie expects ---------- */
  // world decorations (MECHANICS §3): ck.icing [{pts, hex, w}], ck.chips [{x, y, r, rot}], ck.sprinkles [{x, y, hex, rot, len}]
  // in cookie units (centre 0,0; 1 = diameter). drawCookie scales icing / chips by size / icingBox.size around (cx, cy), so
  // we scale the units by BOX and centre the box on 0,0. Glyph cookies with ck.plain draw without the embossed text.
  const BOX = 330;
  const decoCache = typeof WeakMap !== 'undefined' ? new WeakMap() : null;
  function renderCk(ck, plain) {
    if (!ck) return ck;
    const key = plain ? 'p' : 'n';
    const hit = decoCache && decoCache.get(ck);
    if (hit && hit[key]) return hit[key];
    const out = Object.assign({}, ck);
    const ice = Array.isArray(ck.icing) ? ck.icing : [], chips = Array.isArray(ck.chips) ? ck.chips : [];
    if (ice.length || chips.length) {
      out.icing = ice.map(q => ({ hex: q.hex, width: (q.w != null ? q.w : ICING_W() / BOX) * BOX, pts: (q.pts || []).map(p => [p[0] * BOX, p[1] * BOX]) }));
      out.chips = chips.map(c => ({ x: c.x * BOX, y: c.y * BOX, r: (c.r || 0.045) * BOX }));
      out.icingBox = { cx: 0, cy: 0, size: BOX };
    }
    if (plain && out.kind === 'glyph') out.kind = 'round';
    if (decoCache) { const e = hit || {}; e[key] = out; decoCache.set(ck, e); }
    return out;
  }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this._bagV = null; this._titleCks = null; this.windowsKey = '';
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      IB.Assets.dropExact();
      this._envKey = '';
    }
    prewarm(layout, level) {   // rasterise the big tiles of a season ahead of time
      if (layout) this._envFor(layout);
      const E = this._env; if (!E) return;
      const m = MOODS[clamp(level | 0, 0, 3)];
      for (const l of ['far', 'mid', 'ground']) this._tile(l, m);
    }
    clearGallery() { /* the gallery lives in world.gallery */ }

    /* ---------- env ---------- */
    _envOpt(L) {
      const T = L.tray, F = L.frame || 16;
      if (!L.portrait) return { trayCx: T.x + T.w / 2, freeTop: L.bubble ? L.bubble.y + L.bubble.h : 140 };
      // portrait: the choice row sits on the counter at the bottom, so the counter's back edge goes just above the row and
      // the window shows in the wall band between the tray and the counter
      const C = L.choices, top = C && C.slots && C.slots.length && !C.column ? Math.min(...C.slots.map(s => s.y - s.r)) : L.groundY - 140;
      return { trayCx: T.x + T.w / 2, freeTop: T.y + T.h + F, counterY: Math.min(L.groundY - 150, top - 18) };
    }
    _envFor(L) {
      const gy = L.groundY || this.H - 18;
      const o = this._envOpt(L);
      const hk = (L.hudKeep || []).map(b => Math.round(b.x) + ':' + Math.round(b.h)).join(';');
      const R = L.rack, M = L.mochi;
      const key = [this.W, this.H, Math.round(gy), Math.round(o.trayCx), Math.round(o.freeTop), Math.round(o.counterY || 0), hk,
        R ? [R.x, R.y, R.w, R.h].map(Math.round).join(':') : '', M ? [M.x, M.y, M.h].map(Math.round).join(':') : ''].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, gy, o);
      this._env.extra = L.portrait ? this._extraWindow(L) : null;
      this._env.allWindows = this._env.windows.concat(this._env.extra ? [this._env.extra.glass] : []);
      this._envKey = key;
      return this._env;
    }
    /** Portrait (QA P1-3): the window tiles sit low behind the tray, so one more window (the far tile's window, curtains and
     *  sill, cropped) goes into the free wall band between the bubble / HUD and the tray, beside or above the cooling rack. */
    _extraWindow(L) {
      const T = L.tray, F = L.frame || 16, ins = L.ins || {}, W = this.W;
      const SX = 160, SY = 36, SW = 480, SH = 434;            // crop of far_<m>.svg (glass 250–550 × 90–400 inside it)
      let top = (L.bubble ? L.bubble.y + L.bubble.h : 0) + 14;
      for (const b of L.hudKeep || []) if (b && b.y <= 1) top = Math.max(top, b.h + 10);
      const bot = T.y - F - 10, x0 = (ins.left || 0) + 12, x1 = W - (ins.right || 0) - 12;
      if (bot - top < 120) return null;
      // obstacles in front of the wall: Mochi (opaque) and the cooling rack (see-through wires: half the cost)
      const M = L.mochi, R = L.rack, obs = [];
      if (M) obs.push({ x: M.x - M.w * 0.5, y: M.y - M.h * 0.98, w: M.w, h: M.h * 0.98, cost: 1 });
      if (R) obs.push({ x: R.x, y: R.y, w: R.w, h: R.h, cost: 0.5 });
      const ov = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      let best = null;
      for (const kf of [1, 0.9, 0.8, 0.7, 0.6, 0.5, 0.42, 0.35]) {
        const w = SW * kf, h = SH * kf;
        if (h > bot - top || w > x1 - x0) continue;
        for (let i = 0; i <= 12; i++) {
          const x = x0 + (x1 - x0 - w) * i / 12;
          for (const fy of [0, 0.5, 1]) {
            const y = top + (bot - top - h) * fy, r = { x, y, w, h };
            let vis = w * h; for (const o of obs) vis -= o.cost * ov(r, o);
            if (!best || vis > best.vis + 1) best = { vis, k: kf, x, y, w, h };
          }
        }
      }
      if (!best || best.vis < 0.45 * best.w * best.h || best.k < 0.35) return null;
      const { k, x, y, w, h } = best;
      return { k, sx: SX, sy: SY, sw: SW, sh: SH, x, y, w, h, glass: { x: x + (250 - SX) * k, y: y + (90 - SY) * k, w: 300 * k, h: 310 * k } };
    }
    _tile(layer, m) {
      const E = this._env, Ly = E[layer];
      return IB.Assets.exact(layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
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
      const E = this._envFor(this._L);
      const wk = E.allWindows.map(r => Math.round(r.x) + ':' + Math.round(r.y) + ':' + Math.round(r.w)).join('|');
      if (wk !== this.windowsKey && weather.setWindows) { this.windowsKey = wk; weather.setWindows(E.allWindows); }   // petals / leaves / snow come from the visible windows
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this._backdrop(amb, weather.particles);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }

    /* ---------- backdrop: wall → far (windows) → light → outside particles → mid → ground → floor → tint ---------- */
    _backdrop(amb, parts) {
      const g = this.g, W = this.W, H = this.H, E = this._env;
      const to = MOODS.includes(amb.env) ? amb.env : (MOODS.includes(amb.mood) ? amb.mood : 'spring');
      const from = MOODS.includes(amb.envFrom) ? amb.envFrom : to;
      const mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      g.fillStyle = amb.wall || AMB_FALLBACK.wall; g.fillRect(0, 0, W, H);
      const layer = (l) => {
        const one = (m, al) => {
          if (al <= 0.01) return;
          const t = this._tile(l, m), Ly = E[l]; if (!t) return;
          g.globalAlpha = al;
          for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
          g.globalAlpha = 1;
        };
        if (from !== to && mix < 1) { one(from, 1); one(to, mix); } else one(to, 1);
      };
      layer('far');
      const X = E.extra;
      if (X) {   // the extra portrait window (both moods while the seasons crossfade)
        const one = (m, al) => {
          if (al <= 0.01) return;
          const t = this._tile('far', m); if (!t) return;
          const kk = t.width / 800;   // raster px per vb px
          g.globalAlpha = al; g.drawImage(t, X.sx * kk, X.sy * kk, X.sw * kk, X.sh * kk, X.x, X.y, X.w, X.h); g.globalAlpha = 1;
        };
        if (from !== to && mix < 1) { one(from, 1); one(to, mix); } else one(to, 1);
      }
      // a seasonal wash over the wall (not the glass), so the season reads at a glance in every layout
      const wash = (m, al) => {
        const c = WALL_WASH[m]; if (!c || al <= 0.01) return;
        g.save(); g.globalAlpha = al; g.fillStyle = c; g.beginPath(); g.rect(0, 0, W, E.counterY + 4);
        for (const r of E.allWindows) g.rect(r.x, r.y, r.w, r.h);   // holes: the sky keeps its colour
        g.fill('evenodd'); g.restore();
      };
      if (from !== to && mix < 1) { wash(from, 1 - mix); wash(to, mix); } else wash(to, 1);
      const la = amb.lightBars != null ? amb.lightBars : amb.light != null ? amb.light : 0.5;
      if (la > 0.01 && IB.Assets.has('light')) {
        const k = E.far.k, spr = IB.Assets.exact('light', Math.max(1, Math.round(600 * k * this.rs * 0.5)), Math.max(1, Math.round(720 * k * this.rs * 0.5)));
        if (spr) {
          g.globalAlpha = clamp(la * (0.92 + 0.08 * Math.sin(this.time * 0.4)), 0, 1);
          for (const r of E.lights) g.drawImage(spr, r.x, r.y, r.w, r.h);
          g.globalAlpha = 1;
        }
      }
      // particles that belong outside (winter snow): only inside the window glass
      if (parts && parts.some(p => p.outside)) {
        g.save(); g.beginPath();
        for (const r of E.allWindows) g.rect(r.x, r.y, r.w, r.h);
        g.clip();
        for (const p of parts) if (p.outside && p.alpha > 0.01) this._particle(p);
        g.restore();
      }
      layer('mid'); layer('ground');
      if (E.ground.fillY < H) { g.fillStyle = amb.floor || AMB_FALLBACK.floor; g.fillRect(0, E.ground.fillY - 0.5, W, H - E.ground.fillY + 0.5); }
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
    }

    /* ---------- the round ---------- */
    _game(w, o, a) {
      const L = this._L, g = this.g;
      if (CA() && L.rack) { try { CA().drawRack(g, L.rack, { time: this.time }); } catch (e) { /* skip */ } }
      for (const rc of w.rackCookies || []) this._item(rc, a, { scale: 1.08 });   // a little bigger on the wires (QA P3-6)
      this._sack(w.sack, a);
      if (CA()) { try { CA().drawTray(g, L.tray, { glow: w.trayGlow || 0, frame: L.frame, time: this.time }); } catch (e) { /* skip */ } }
      const showTray = w.state !== 'talk' && w.state !== 'levelDone' && w.state !== 'intro';
      const ck = w.cookie, late = ck && ck.state && ck.state !== 'rest';
      if (showTray) {
        this._item(w.home, a); this._item(w.side, a);
        if (ck && !late) this._item(ck, a);
        this._trayLayer(w, a);
      }
      this._choices(w, a);
      // the bag at rest hangs in Mochi's paw BEHIND her arm (the paw art wraps it); flying / piping it is in front
      const grip = this._mochiGrip(w.mochi, w.mochi && w.mochi.mood, L.mochi);
      // no one-frame layer pop: a copy behind the paw + a front copy whose alpha fades out once the bag has settled in the
      // paw (and back in as soon as it leaves)
      const pose = this._bagPose(w, a, grip);
      if (pose) {
        const settled = pose.rest && Math.hypot(this._bagV.ox, this._bagV.oy) < 5;
        const dt = this._dt || 0.016, b = this._bagBehind || 0;
        this._bagBehind = settled ? Math.min(1, b + dt * 5) : Math.max(0, b - dt * 9);
      }
      if (pose && this._bagBehind > 0.01) this._drawBag(pose, 1);
      this._mochi(w.mochi, w.mochi && w.mochi.mood, L.mochi);
      if (showTray && late) this._item(ck, a);
      if (pose && this._bagBehind < 0.99) this._drawBag(pose, 1 - (this._bagBehind || 0));
      this._sprinkles(w.sprinkles, a);
      this._bird(w.bird, a);
      this._hintHand(w.hintHand);
    }
    /** Everything in tray picture px: icing, the gleam sweep, guide dots, chips, the walking animal. */
    _trayLayer(w, a) {
      if (!CA()) return;
      const g = this.g, T = this._L.tray;
      g.save(); g.translate(T.x, T.y); g.scale(T.s, T.s);
      const IW = ICING_W();
      // animals (QA P3-8): once the animal walks off, the road would start mid-tray; keep it joined to where the animal stood
      const wk0 = w.walker;
      if (wk0 && !this._walkFrom) this._walkFrom = [wk0.x, wk0.y];
      if (!wk0 && w.phase !== 'hop') this._walkFrom = null;
      const road = this._walkFrom && (w.icing || []).find(ic => ic && ic.host === 'tray' && ic.pts && ic.pts.length > 1);
      if (road) {
        const p0 = road.pts[0], f = this._walkFrom, d = Math.hypot(p0[0] - f[0], p0[1] - f[1]);
        if (d > 4) try { CA().drawIcing(g, [f, p0], road.hex || road.color, IW, { wet: 0, alpha: road.alpha == null ? 1 : road.alpha }); } catch (e) { /* skip */ }
      }
      for (const ic of w.icing || []) {
        if (!ic || !ic.pts || !ic.pts.length) continue;
        const al = ic.alpha == null ? 1 : ic.alpha; if (al <= 0.01) continue;
        try { CA().drawIcing(g, ic.pts, ic.hex || ic.color, IW, { wet: ic.wet || 0, alpha: al }); } catch (e) { /* skip */ }
      }
      if (w.gleam != null && w.gleam >= 0 && w.gleam <= 1) {   // a light band sweeps over the fresh icing
        const c = lerp(-120, 720, w.gleam);
        const gr = g.createLinearGradient(c - 110, -50, c + 110, 50);
        gr.addColorStop(0, 'rgba(255,255,255,0)'); gr.addColorStop(0.5, 'rgba(255,255,255,0.8)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.save(); g.strokeStyle = gr; g.lineWidth = IW * 0.62; g.lineCap = 'round'; g.lineJoin = 'round';
        for (const ic of w.icing || []) {
          if (!ic || !ic.pts || ic.pts.length < 2) continue;
          g.beginPath(); g.moveTo(ic.pts[0][0], ic.pts[0][1] - 2); for (let i = 1; i < ic.pts.length; i++) g.lineTo(ic.pts[i][0], ic.pts[i][1] - 2); g.stroke();
        }
        g.restore();
      }
      if (w.path && w.traceState && !w.traceState.complete && w.state === 'round' && w.phase === 'play') {
        try { CA().drawGuide(g, w.path, w.traceState, { glow: w.guideGlow || 0, time: this.time }); } catch (e) { /* skip */ }
      }
      for (const c of w.chips || []) {
        const al = c.alpha == null ? 1 : c.alpha; if (al <= 0.01) continue;
        g.save(); g.globalAlpha *= al; g.translate(ip(c, 'x', a), ip(c, 'y', a)); if (c.rot) g.rotate(c.rot);
        try { CA().drawChip(g, c.r || 15, { squash: 1 - clamp(c.squash || 0, 0, 0.6) }); } catch (e) { /* skip */ }   // world: squash amount; CookieArt: sy factor
        g.restore();
      }
      const wk = w.walker;
      if (wk && (wk.alpha == null || wk.alpha > 0.01)) {
        g.save(); g.translate(ip(wk, 'x', a), ip(wk, 'y', a)); g.rotate(ip(wk, 'rot', a) || 0);
        if ((wk.dir || 1) < 0) g.scale(-1, 1);
        try { CA().drawCookie(g, renderCk(wk.ck), wk.size || 120, { sx: wk.sx || 1, sy: wk.sy || 1, time: this.time }); } catch (e) { /* skip */ }
        g.restore();
      }
      g.restore();
    }
    /** A cookie item in screen px (board cookie, home, side, rack cookie, hopping cookie) + its decorations. */
    _item(it, a, opt) {
      if (!it || !it.ck || !CA()) return;
      const al = it.alpha == null ? 1 : clamp(it.alpha, 0, 1); if (al <= 0.01) return;
      const g = this.g, x = ip(it, 'x', a), y = ip(it, 'y', a), size = (ip(it, 'size', a) || 74) * ((opt && opt.scale) || 1), rot = ip(it, 'rot', a) || 0;
      const sx = ip(it, 'sx', a) || 1, sy = ip(it, 'sy', a) || 1;
      const o = Object.assign({ sx, sy, glow: it.glow || 0, sparkle: it.sparkle || 0, wob: it.wob || 0, time: this.time }, opt || {});
      const ck = it.ck, plain = ck.plain === true ? 1 : clamp(+it.plain || 0, 0, 1);
      g.save(); g.globalAlpha *= al; g.translate(x, y); if (rot) g.rotate(rot);
      try {
        if (ck.kind === 'glyph' && plain > 0.01 && plain < 0.99) {   // the embossed glyph fades as its dots take over
          CA().drawCookie(g, renderCk(ck, false), size, o);
          g.globalAlpha *= plain; CA().drawCookie(g, renderCk(ck, true), size, Object.assign({}, o, { glow: 0, sparkle: 0 }));
        } else CA().drawCookie(g, renderCk(ck, plain >= 0.99), size, o);
      } catch (e) { /* skip */ }
      const sp = ck.sprinkles;
      if (sp && sp.length) {   // sprinkles in cookie units, squashed like the cookie (bottom-anchored)
        g.translate(o.wob || 0, size * 0.5 * (1 - sy)); g.scale(sx, sy);
        for (const s of sp) {
          g.save(); g.translate(s.x * size, s.y * size);
          try { CA().drawSprinkle(g, s.hex, Math.max(3, s.len * size), s.rot || 0); } catch (e) { /* skip */ }
          g.restore();
        }
      }
      g.restore();
    }
    _choices(w, a) {
      if (!CA()) return;
      const g = this.g;
      for (const c of w.choices || []) {
        if (c.gone) continue;
        const pop = ip(c, 'pop', a) || 0; if (pop <= 0.02) continue;
        const o = { lift: clamp(ip(c, 'lift', a) || 0, 0, 1), wob: ip(c, 'wob', a) || 0, glow: c.glow || 0, selected: c.selected, dim: c.dim || 0, time: this.time };
        g.save(); g.translate(ip(c, 'x', a), ip(c, 'y', a));
        try {
          if (c.kind === 'bag') CA().drawIcingBag(g, c.hex || c.color, 2.4 * c.r * pop, 0, Object.assign({ center: true }, o));   // fills the slot (QA P2-1)
          else CA().drawCookie(g, renderCk(c.ck), 2 * c.r * (c.scale || 1) * pop, o);
        } catch (e) { /* skip */ }
        g.restore();
      }
    }
    _mochiFrame(mood, blink) {
      let nm = 'mochi_' + (mood || 'idle');
      if (blink && (mood === 'idle' || !mood)) nm = 'mochi_blink';
      if (this._speaking && (mood === 'idle' || mood === 'talk' || !mood) && Math.sin(this.time * 17) > -0.2) nm = 'mochi_talk';
      if (!this._speaking && mood === 'talk' && Math.sin(this.time * 17) < -0.2) nm = 'mochi_idle';
      return IB.Assets.has(nm) ? nm : 'mochi_idle';
    }
    /** Where Mochi's paw is in the frame she will be drawn with: {x, y, ang (rad, nozzle direction), k, frame, h}. */
    _mochiGrip(m, mood, box) {
      if (!box) return null;
      m = m || {};
      const nm = this._mochiFrame(mood, m.blink), k = box.h / MOCHI.h, bob = Math.sin(this.time * 2.1) * 2.5, lean = clamp(m.look || 0, -1, 1) * 0.025;
      const fr = nm.slice(6), hd = HAND[fr === 'think' ? 'idle' : fr] || HAND.idle;   // think: paw on the chin, the bag stays low
      const hx = (hd[0] - MOCHI.ax) * k, hy = (hd[1] - MOCHI.ay) * k + bob, c = Math.cos(lean), s = Math.sin(lean);
      return { x: box.x + hx * c - hy * s, y: box.y + hx * s + hy * c, ang: hd[2] * Math.PI / 180 + lean, k, frame: fr === 'think' ? 'idle' : fr, h: box.h };
    }
    /** Mochi at feet (x, y), height h (mood frame, blink, talk flaps, a gentle bob). */
    _mochi(m, mood, box, opt = {}) {
      if (!box) return null;
      m = m || {};
      const nm = opt.frame || this._mochiFrame(mood, m.blink);
      const k = box.h / MOCHI.h, bob = Math.sin(this.time * 2.1) * 2.5, lean = clamp(m.look || 0, -1, 1) * 0.025;
      const g = this.g;
      g.save();
      g.translate(box.x, box.y);
      g.rotate(lean);
      g.fillStyle = 'rgba(90,52,24,0.18)'; g.beginPath(); g.ellipse(0, -2, box.h * 0.3, box.h * 0.05, 0, 0, TAU); g.fill();
      g.translate(0, bob);
      this._img(nm, -MOCHI.ax * k, -MOCHI.ay * k, MOCHI.w * k, MOCHI.h * k);
      g.restore();
      return null;
    }
    /** Where the bag is this frame (screen px): {x, y, a, s, hex, squeeze, rest}. Call once per frame (it advances the hand-off). */
    _bagPose(w, a, G) {
      if (!CA()) return null;
      const B = w.bag; if (!B) return null;
      const L = this._L, T = L.tray;
      let tx, ty, ta, ts;
      const rest = B.state === 'rest' && G;
      if (rest) {
        // in Mochi's paw: the nozzle hangs from the grip along the art's nozzle direction
        ts = 120 * clamp(G.h / 250, 0.72, 1.05);
        const d = 0.5 * ts;
        tx = G.x + Math.cos(G.ang) * d; ty = G.y + Math.sin(G.ang) * d;
        ta = G.ang - Math.PI / 2;
        // Mochi standing on the tray rim (tall portrait): the nozzle must not poke into the parchment (QA P3-9)
        const lim = T.y - (L.frame || 16) - 6;
        if (L.mochi && L.mochi.up && tx > T.x - 30 && ty > lim) { const dy = ty - lim; ty -= dy; ta = Math.max(ta - 0.5, -1.2); }
      } else {
        tx = ip(B, 'x', a); ty = ip(B, 'y', a); ta = ip(B, 'angle', a) || 0; ts = (B.size || 120) * clamp(T.s, 0.8, 1.15);
      }
      // smooth hand-offs (rest ↔ flying, frame changes): an offset that decays, never a jump
      const key = rest ? 'r:' + G.frame : 'f';
      const V = this._bagV || (this._bagV = { key, ox: 0, oy: 0, oa: 0, os: 0, x: tx, y: ty, a: ta, s: ts });
      if (V.key !== key) { V.ox = V.x - tx; V.oy = V.y - ty; V.oa = angDiff(V.a, ta); V.os = V.s - ts; V.key = key; }
      const dec = Math.exp(-(this._dt || 0.016) * 13);
      V.ox *= dec; V.oy *= dec; V.oa *= dec; V.os *= dec;
      V.x = tx + V.ox; V.y = ty + V.oy; V.a = ta + V.oa; V.s = ts + V.os;
      return { x: V.x, y: V.y, a: V.a, s: V.s, hex: B.hex || B.color || null, squeeze: clamp(ip(B, 'squeeze', a) || 0, 0, 1), rest: !!rest };
    }
    _drawBag(P, alpha) {
      if (alpha <= 0.01) return;
      const g = this.g;
      g.save(); g.globalAlpha *= alpha; g.translate(P.x, P.y);
      try { CA().drawIcingBag(g, P.hex, P.s, P.a, { squeeze: P.squeeze, time: this.time }); } catch (e) { /* skip */ }
      g.restore();
    }
    _sprinkles(list, a) {
      if (!list || !list.length || !CA()) return;
      const g = this.g;
      for (const p of list) {
        const al = p.alpha == null ? 1 : p.alpha; if (al <= 0.01) continue;
        g.save(); g.globalAlpha *= al; g.translate(ip(p, 'x', a), ip(p, 'y', a));
        try { CA().drawSprinkle(g, p.hex, p.len || 12, p.rot || 0); } catch (e) { /* skip */ }
        g.restore();
      }
    }
    _bird(f, a) {
      if (!f) return;
      const g = this.g, x = ip(f, 'x', a), y = ip(f, 'y', a), size = f.size || 120, h = size * 0.75;
      if (!(x > -size && x < this.W + size)) return;
      const nm = (f.flap || 0) > 0.5 && IB.Assets.has('bird_flap') ? 'bird_flap' : 'bird';
      g.save(); g.translate(x, y);
      if ((f.dir || 1) < 0) g.scale(-1, 1);
      this._img(nm, -size / 2, -h / 2, size, h);
      g.restore();
    }
    _sack(c, a) {
      if (!c) return;
      const g = this.g, k = (c.w || 112) / 160, gl = clamp(c.glow || 0, 0, 1);
      const x0 = c.x - 80 * k, top = c.y - 136 * k;
      if (gl > 0.02) {
        const rg = g.createRadialGradient(c.x, top + 50 * k, 4, c.x, top + 50 * k, 110 * k);
        rg.addColorStop(0, `rgba(255,240,190,${0.55 * gl})`); rg.addColorStop(1, 'rgba(255,240,190,0)');
        g.fillStyle = rg; g.beginPath(); g.arc(c.x, top + 50 * k, 110 * k, 0, TAU); g.fill();
      }
      this._img('sack', x0, top, 160 * k, 140 * k);
      const peek = clamp(ip(c, 'mouse', a) || 0, 0, 1.2);
      if (peek > 0.02) {   // the mouse rises out of the flour; below the rim it is inside the sack (clipped)
        const mk = k * 0.78, mh = 100 * mk, rim = top + 52 * k;
        const by = rim + (1 - peek) * mh * 0.95;
        g.save(); g.beginPath(); g.rect(x0, top - 200 * k, 160 * k, rim - (top - 200 * k)); g.clip();
        this._img(c.happy && IB.Assets.has('mouse_happy') ? 'mouse_happy' : 'mouse', c.x - 60 * mk, by - 98 * mk, 120 * mk, mh);
        g.restore();
      }
    }
    _hintHand(H) {
      if (!H || !CA()) return;
      const g = this.g, al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      g.save(); g.globalAlpha *= al; g.translate(H.x, H.y);
      try { CA().drawGhostHand(g, 120, H.press != null ? H.press : 0); } catch (e) { /* skip */ }
      g.restore();
    }

    /* ---------- title: Mochi waving with her heart cookie, a rack of decorated cookies ---------- */
    _titleCookies() {
      if (this._titleCks) return this._titleCks;
      const wave = []; for (let i = 0; i <= 24; i++) { const u = i / 24; wave.push([-0.3 + 0.6 * u, -0.08 + 0.07 * Math.sin(u * TAU * 1.25)]); }
      const line = [[-0.26, 0.14], [0.26, 0.14]];
      const star = []; for (let i = 0; i <= 10; i++) { const an = -Math.PI / 2 + i * TAU / 10, r = i % 2 ? 0.16 : 0.34; star.push([Math.cos(an) * r, Math.sin(an) * r + 0.03]); }
      this._titleCks = [
        { kind: 'round', icing: [{ pts: wave, hex: '#E84A4A', w: 0.07 }, { pts: line, hex: '#3C8DE8', w: 0.07 }], sprinkles: [{ x: -0.2, y: 0.3, hex: '#FFD23F', rot: 0.4, len: 0.08 }, { x: 0.18, y: 0.28, hex: '#4CC26B', rot: -0.6, len: 0.08 }] },
        { kind: 'shape', shape: 'star', icing: [{ pts: star, hex: '#FFD23F', w: 0.06 }] },
        { kind: 'round', chips: [{ x: -0.16, y: -0.12, r: 0.06 }, { x: 0.15, y: -0.06, r: 0.06 }, { x: 0, y: 0.17, r: 0.06 }] },
        { kind: 'animal', animal: 'dog' }
      ];
      return this._titleCks;
    }
    _cookieRow(cks, x0, y, size, gap, rackOn) {   // a little cooling rack with cookies standing on it (centre y)
      const n = cks.length, w = n * size + (n - 1) * gap;
      if (rackOn && CA()) { try { CA().drawRack(this.g, { x: x0 - 14, y: y - size * 0.62, w: w + 28, h: size * 1.24 }, { time: this.time }); } catch (e) { /* skip */ } }
      cks.forEach((ck, i) => {
        const bob = Math.sin(this.time * 1.4 + i * 1.3) * 2;
        this._item({ ck, x: x0 + size / 2 + i * (size + gap), y: y + bob, size, rot: Math.sin(this.time * 0.9 + i) * 0.03, alpha: 1 }, 1);
      });
    }
    _titleScene(w, o) {
      const W = this.W, H = this.H, L = this._L, ins = L.ins || {}, portrait = H > W;
      const gy = L.groundY, E = this._env, cks = this._titleCookies();
      if (portrait) {
        // never under the star / age chip (small phones, QA P3-2): the hat stays below the title info line
        const info = o.boxes && o.boxes.info;
        const nh = clamp(Math.min(400, H * 0.27, info ? gy - 4 - (info.y + info.h) - 18 : 400), 150, 400);
        const nx = (ins.left || 0) + 30 + nh * 0.38;
        this._mochi({ blink: Math.sin(this.time * 1.3) > 0.985 }, 'title', { x: nx, y: gy - 4, h: nh }, { frame: 'mochi_title' });
        const sz = clamp((W - nx - nh * 0.45 - (ins.right || 0) - 40) / 2.3, 70, 130);
        const cx0 = W - (ins.right || 0) - 24 - (2 * sz + 18);
        this._cookieRow(cks.slice(0, 2), cx0, gy - nh * 0.62, sz, 18, true);
        this._cookieRow(cks.slice(2, 4), cx0, gy - nh * 0.62 + sz * 1.4, sz, 18, true);
      } else {
        const nh = Math.min(400, H * 0.52);
        const nx = (ins.left || 0) + 40 + nh * 0.4;
        this._mochi({ blink: Math.sin(this.time * 1.3) > 0.985 }, 'title', { x: nx, y: gy - 4, h: nh }, { frame: 'mochi_title' });
        const sz = clamp(W * 0.075, 74, 112), n = 4, rw = n * sz + 3 * 16;
        const x0 = W - (ins.right || 0) - 36 - rw, y = (E ? E.counterY : gy - 190) - sz * 0.35;
        this._cookieRow(cks, x0, y, sz, 16, true);
      }
      this._sparkT = (this._sparkT || 0) - (o.dt || 0);
      if (this._sparkT <= 0) { this._sparkT = 1.1; this.burst('sparkles', W * (0.1 + Math.random() * 0.8), gy - 60 - Math.random() * 200, { n: 4, color: '#FFE7A8' }); }
    }
    /* ---------- session done: every cookie of the session on cooling racks around a cheering Mochi ---------- */
    _doneScene(w, o) {
      const W = this.W, H = this.H, t = this.time, L = this._L, ins = L.ins || {}, portrait = H > W, gy = L.groundY;
      const panel = o.boxes && o.boxes.done;
      const fx0 = (ins.left || 0) + 16, fx1 = portrait ? W - (ins.right || 0) - 16 : (panel ? panel.x - 16 : W * 0.58);
      const fy0 = portrait ? (panel ? panel.y + panel.h + 16 : H * 0.4) : (ins.top || 0) + 20, fy1 = gy;
      const ny = fy1 - 4;
      const items = (w.gallery || []).map(x => x.ck).filter(Boolean);
      const cks = items.length ? items : this._titleCookies();
      let nh, nx, gx0, gx1 = fx1, gy0 = fy0, gy1;
      if (portrait) { nh = clamp((fy1 - fy0) * 0.28, 130, 260); nx = (fx0 + fx1) / 2; gx0 = fx0; gy1 = ny - nh * 1.02; }
      else { nh = clamp((fy1 - fy0) * 0.52, 160, 320); const nW = nh * 0.72; nx = fx0 + nW / 2; gx0 = fx0 + nW + 14; gy1 = fy1 - 10; }
      const I = IB.I18N, label = I ? I.t(this.lang, 'ui.gallery') : 'Our cookies';
      const lh = clamp((gy1 - gy0) * 0.1, 30, 40);
      if (label && label !== 'ui.gallery' && gy1 - gy0 > 140) {
        outlinedText(this.g, label, (gx0 + gx1) / 2, gy0 + lh * 0.6, lh, '#ffffff', '#8A5A2E', gx1 - gx0 - 20);
        gy0 += lh * 1.3;
      }
      const n = cks.length, gw = gx1 - gx0, gh = Math.max(80, gy1 - gy0);
      let best = null;
      for (let cols = 1; cols <= n; cols++) {
        const rows = Math.ceil(n / cols), sz = Math.min(gw / cols - 14, gh / rows - 26);
        if (!best || sz > best.s) best = { cols, rows, s: sz };
      }
      const sz = clamp(best ? best.s : 60, 28, 150), cw = gw / best.cols, chh = gh / best.rows;
      for (let r = 0; r < best.rows; r++) {
        const inRow = Math.min(best.cols, n - r * best.cols); if (inRow <= 0) break;
        const x0 = gx0 + (gw - inRow * cw) / 2, cy = gy0 + r * chh + chh / 2;
        if (CA()) { try { CA().drawRack(this.g, { x: x0 + (cw - sz) / 2 - 10, y: cy - sz * 0.6, w: (inRow - 1) * cw + sz + 20, h: sz * 1.22 }, { time: t }); } catch (e) { /* skip */ } }
        for (let c = 0; c < inRow; c++) {
          const i = r * best.cols + c, bob = Math.sin(t * 1.3 + i) * Math.min(4, (chh - sz) / 3);
          this._item({ ck: cks[i], x: x0 + c * cw + cw / 2, y: cy + bob, size: sz, rot: Math.sin(t * 0.9 + i * 1.7) * 0.05, alpha: 1 }, 1);
        }
      }
      this._mochi({ blink: false }, Math.sin(t * 3) > 0 ? 'cheer' : 'happy', { x: nx, y: ny, h: nh });
      this._doneGeom = { mochi: { x: nx - nh * 0.36, y: ny - nh, w: nh * 0.72, h: nh }, grid: { x: gx0, y: gy0, w: gw, h: gh }, size: sz };
      this._noteT = (this._noteT || 0) - (o.dt || 0);
      if (this._noteT <= 0) { this._noteT = 0.5; this.burst('sparkles', fx0 + Math.random() * (fx1 - fx0), fy0 + Math.random() * (gy - fy0) * 0.6, { n: 8 }); }
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((IB.CONFIG && IB.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const T = this._L && this._L.tray;   // portrait: over the tray, not over Mochi standing above it (QA P3-4)
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H > W && T ? T.y + T.h / 2 : H * 0.45;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(90,52,24,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#FFF8EC'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 6; g.strokeStyle = '#D79B55'; g.stroke();
      g.setLineDash([14, 10]); g.lineWidth = 3; g.strokeStyle = 'rgba(232,74,74,.55)';
      g.beginPath(); roundRect(g, -bw / 2 + 12, -bh / 2 + 12, bw - 24, bh - 24, 24); g.stroke(); g.setLineDash([]);
      const I = IB.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#8A5A2E', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 56, '#E8704A', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#8A5A2E', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#C4650C', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && IB.PALETTE && IB.PALETTE[c]) ? IB.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 240;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: opt.color ? colOf(opt.color) : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, drag: 1.2, t: 0, life: 0.8 + R() * 0.5, size: 16 + R() * 14, rot: R() * TAU, vr: 3 });
        }
      } else if (type === 'ring') {
        fx.push({ k: 'ring', x, y, t: 0, life: opt.life || 0.4, size: opt.size || 90, color: opt.rgb || '255,255,255' });
      } else if (type === 'puff') {
        fx.push({ k: 'puff', x, y, t: 0, life: 0.7, size: opt.size || 60 });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round(110 * q);
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * 0.5, vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: 5 + R() * 2, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'count') {   // a big numeral floats up over the chip
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
        } else if (f.k === 'puff') {
          if (CA()) { g.save(); g.translate(f.x, f.y); try { CA().drawFlourPuff(g, f.size, u); } catch (e) { /* skip */ } g.restore(); }
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#5A3A28', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = IB.Assets.tinted ? IB.Assets.tinted(name, color, size * this.rs) : IB.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particle(p) {
      const nm = p.sprite === 'star' ? 'pstar' : (p.sprite || p.type);
      if (p.color) this._tinted(nm, p.color, p.x, p.y, p.size, p.rot || 0, p.alpha);
      else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if (p.outside || (p.layer || 'back') !== layer || !(p.alpha > 0.01)) continue;
        this._particle(p);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = IB.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = IB.Assets.sprite(name, Math.max(w, h) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.mochiHit && w.mochiHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h); }
      for (const c of w.choices || []) { g.strokeStyle = 'rgba(0,160,0,.7)'; g.beginPath(); g.arc(c.x, c.y, (L.choices && L.choices.hitR) || 76, 0, TAU); g.stroke(); }
      if (w.pathScreen) { g.fillStyle = 'rgba(255,0,0,.7)'; for (const p of w.pathScreen()) { g.beginPath(); g.arc(p[0], p[1], 3, 0, TAU); g.fill(); } }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with CookieArt.drawIcon into a small canvas. */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!thing || !CA()) return;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      CA().drawIcon(g, thing, Math.min(ch, cw) * 0.96);
      g.restore();
    } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  Renderer.renderCk = renderCk;
  IB.Renderer = Renderer;
})(window.IB = window.IB || {});
