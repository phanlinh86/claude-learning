/* FT.Renderer (Moka's Fairy Tea Party) — draws the fairy-forest clearing and the tea party on one canvas (DESIGN §7,
 * MECHANICS §5). Order: sky → sun → rainbow → clouds → far → mid → ground → trunks → (mood tint) → garland vine + lanterns
 * (+ home badge) → back particles → snail (behind the right toadstool leg) → table → placemats → sitting things (by x) → fluffs
 * → critter → Moka → rising things → fairy (+ the dancing fairies) → hint hand → soft-tap sparkles → front particles → fx →
 * chapter banner. Every moving world value is interpolated with world.alpha (`_p` twins).
 * The environment follows tools/env_scenes.js RECIPE: envLayout / trunkGeom / tileXs and the tables are pasted verbatim below.
 * Integration rule (docs/reports/integration.md): the world owns the garland ends (layout.garland.x0 / x1); the trunks are
 * placed by trunkGeom and then shifted sideways so their tie points land exactly on the vine ends; the env stack is anchored
 * with a stable item size per age (not the per-round item), so the background never jumps between rounds.
 * Title: Moka in his flower crown waving beside a little table (a cup, a cookie), one glowing lantern and the fairy.
 * Session done: all the lanterns of the session float around the clearing, Moka sips and cheers, confetti.
 * Logical coordinates (short side 720) × render scale rs = device pixels. */
(function (FT) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];

  /* ---------- RECIPE tables (tools/env_scenes.js RECIPE + tools/art_env.js values), verbatim ---------- */
  const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
  const SKY = { sunny: ['#BFE3D0', '#FBF6DF'], breezy: ['#CFE6DA', '#F5F1E2'], rain: ['#97A9B4', '#CBD6D6'], rainbow: ['#A9DCEB', '#FFF1D9'] };
  const MOSS = { sunny: '#B3C08E', breezy: '#B0BF92', rain: '#7D8C88', rainbow: '#ADC196' };
  const GROUND_BOTTOM = { sunny: '#9DAB79', breezy: '#9BAA7E', rain: '#6B7976', rainbow: '#98AE80' };
  const RIM = { sunny: '#FFF6DE', breezy: '#FFFFFF', rain: '#FFE9C2', rainbow: '#FFF8EE' };
  const TRUNK_TINT = { sunny: null, breezy: 'rgba(234,242,236,0.08)', rain: 'rgba(66,82,100,0.32)', rainbow: null };
  const TILES = { far: [1200, 720, 690], mid: [1200, 340, 334], ground: [1200, 260, 30] };
  const TRUNK = { w: 220, h: 900, anchor: [110, 900], tieL: [150, 140], tieR: [70, 140] };
  const FAR_K = { landscape: 0.8, portrait: 0.9 };   // far tile scale relative to the mid/ground scale
  const HORIZON_ITEM = 0.92;  // horizon = table.y − HORIZON_ITEM × item
  // sun: x fraction of the safe width (clamped away from the HUD / bubble), y offset below ins.top, drawn size
  const SUN = { landscape: { fx: 0.8, dy: 104, size: 150 }, portrait: { fx: 0.6, dy: 58, size: 118 } };
  const SUN_A = { sunny: 1, breezy: 0.8, rain: 0, rainbow: 0.9 };
  const RAINBOW_A = { sunny: 0, breezy: 0, rain: 0, rainbow: 1 };
  const CLOUDS = {
    sunny: { n: 2, alpha: 0.85, kind: 'white' },
    breezy: { n: 3, alpha: 0.9, kind: 'white' },
    rain: { n: 4, alpha: 0.95, kind: 'rain' },
    rainbow: { n: 2, alpha: 0.8, kind: 'white' },
  };

  /* ---------- RECIPE functions: pasted verbatim from tools/env_scenes.js (pure) ---------- */
  /** Pure layout of the environment for a W × H screen. ins = safe-area insets; tableY / item = world.layout.table.y / item. */
  function envLayout(W, H, ins, tableY, item) {
    ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const portrait = H > W, tall = H / W > 1.6;
    const groundY = H - ins.bottom - (portrait ? 26 : 14);
    if (item == null) item = 124 * (tall ? 1.12 : 1);
    if (tableY == null) tableY = portrait ? groundY - 6 - 220 - 40 : groundY - 150;
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;                 // skill rule: background ×1.36 on tall portrait
    const kg = kp, km = kp, kf = FAR_K[portrait ? 'portrait' : 'landscape'] * kp;
    const horizonY = Math.round(tableY - HORIZON_ITEM * item);
    const o = portrait ? 'portrait' : 'landscape', cw = W - ins.left - ins.right;
    // sun first (the far tile is aligned to it)
    const S = SUN[o]; let sx = ins.left + S.fx * cw;
    sx = Math.min(sx, W - ins.right - 170 - S.size / 2);                       // keep clear of the HUD (top-right)
    if (!portrait) sx = Math.max(sx, ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24) + S.size * 0.45);   // right of the bubble
    const sun = { x: Math.round(sx), y: ins.top + S.dy, size: S.size };
    const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * 0.5 - 600 * kg), y: horizonY - 30 * kg };
    ground.fillY = ground.y + 258 * kg;
    // mid: the stump house (mid x 840) right of centre in landscape, a bit right in portrait
    const mid = { k: km, w: 1200 * km, h: 340 * km, x0: Math.round(W * (portrait ? 0.62 : 0.7) - 840 * km), y: horizonY + 4 * km - 334 * km };
    // far: its row 690 sits on the mid bank (mid row 306); the clearing / sun-shaft origin (far x 700) under the sun
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(sun.x - 700 * kf), y: Math.round(mid.y + 306 * km - 690 * kf) };
    const skyY1 = horizonY;
    // rainbow: arc centre (600,600) of the art at (cx, baseY), outer radius 566·k reaching up to topY
    // centred on the far clearing (far x 680, under the sun): landscape top just below ins.top, portrait below the bubble
    const rcx = portrait ? W * 0.5 : far.x0 + 680 * kf;
    const rk = portrait ? 0.62 * W / 566 : (horizonY - ins.top - 36) / 566, topY = ins.top + (portrait ? 290 : 36);
    const baseY = topY + 566 * rk;
    const rainbow = { x: rcx - 600 * rk, y: baseY - 600 * rk, w: 1200 * rk, h: 600 * rk, k: rk };
    const clouds = portrait
      ? { y0: ins.top + 40, y1: Math.max(ins.top + 90, Math.min(far.y + 140 * kf, ins.top + 0.22 * H)), s: 0.55 }
      : { y0: ins.top + 34, y1: ins.top + 150, s: 0.6 };
    return { portrait, tall, groundY, tableY, item, horizonY, kp, far, mid, ground, skyY1, sun, rainbow, clouds };
  }
  /** Framing trunks: scaled so the vine tie points (art y 140) land on garlandY and the foot (art y 900) stands on the ground
   *  (landscape: groundY; portrait: just below the horizon); k clamped to [0.5, 1.2]. */
  function trunkGeom(W, ins, groundY, garlandY, L) {
    ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const footY = L.portrait ? L.horizonY + 16 : groundY;
    const k = Math.max(0.5, Math.min(1.2, (footY - garlandY) / 760));
    const w = 220 * k, h = 900 * k, y = garlandY - 140 * k;
    const axL = ins.left + 36 * k, axR = W - ins.right - 36 * k;             // anchor (art x 110) screen x
    return { k, l: { x: axL - 110 * k, y, w, h }, r: { x: axR - 110 * k, y, w, h },
      tieL: { x: axL + 40 * k, y: garlandY }, tieR: { x: axR - 40 * k, y: garlandY }, footY: y + h };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

  /* ---------- character art metrics (docs/art/moka_bbox.json) ---------- */
  const MOKA = { w: 300, h: 300, ax: 150, ay: 292, body: 252, mouth: [208, 162] };   // visible body y 39.5…292
  const FAIRY = { w: 120, draw: 76 };
  const CRIT = {
    ladybug: { w: 100, h: 100, ax: 50, ay: 96, draw: 74 },
    butterfly: { w: 120, h: 120, ax: 60, ay: 60, draw: 88 },
    snail: { w: 140, h: 120, ax: 70, ay: 116, draw: 104 },
    fairy: { w: 120, h: 120, ax: 60, ay: 60, draw: 54 }
  };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const TA = () => FT.TeaArt;
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, dust: 1, sparkle: 1, pstar: 1, petal: 1, star: 1 };

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
      this._env = null; this._G = null; this._envKey = ''; this.gallery = []; this._galleryT = 0; this._off = {};
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      FT.Assets.dropExact();
      this._envKey = ''; this._off = {};
    }
    prewarm(layout, level, age) {
      if (layout) this._envFor(layout, age);
      const E = this._env; if (!E) return;
      const m = MOODS[clamp(level | 0, 0, 3) % 4];
      for (const l of ['far', 'mid', 'ground']) this._tile(l, m);
    }
    /** the lanterns of the session (thing + colour), floating around on the done screen */
    setGallery(list) { this.gallery = (list || []).slice(-16); this._galleryT = 0; }
    clearGallery() { this.gallery = []; }

    /* ---------- env ---------- */
    _stableItem(L, age) {   // the env is anchored on a stable item, never on the per-round one: portrait = the world's item cap
      if (L && L.envItem) return L.envItem;                 // (with L.envTableY = the cap's table y), else the age's base × 1.12 on tall
      const C = FT.CONFIG || {}, it = C.item || {}, a = clamp(Math.round(age || 4), 3, 7);
      return Math.round((it[a] || 124) * (L.tall ? (C.tallK || 1.12) : 1));
    }
    _envFor(L, age) {
      const ins = (L && L.ins) || { top: 0, left: 0, right: 0, bottom: 0 };
      const item = this._stableItem(L, age), ty = Math.round(L.envTableY != null ? L.envTableY : L.table.y), G0 = L.garland;
      const key = [this.W, this.H, Math.round(ins.top), Math.round(ins.left), Math.round(ins.right), Math.round(ins.bottom), ty, item, Math.round(G0.y), Math.round(G0.x0), Math.round(G0.x1)].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, ins, ty, item);
      const G = trunkGeom(this.W, ins, L.groundY, G0.y, this._env);
      // the vine ends belong to the world (lanterns hang on ITS curve): slide each trunk so its tie point is on the vine end
      const dl = G0.x0 - G.tieL.x, dr = G0.x1 - G.tieR.x;
      G.l.x += dl; G.tieL.x += dl; G.r.x += dr; G.tieR.x += dr;
      this._G = G;
      this._envKey = key;
      return this._env;
    }
    _tile(layer, m) {
      const E = this._env, Ly = E[layer];
      return FT.Assets.exact('env/' + layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }
    /** an SVG image through a 'source-atop' tint, cached (trunks per mood) */
    _tintedImg(name, tint, w, h) {
      const key = 'tint' + name + tint + Math.round(w) + 'x' + Math.round(h);
      if (this._off[key]) return this._off[key];
      const base = FT.Assets.sprite(name, Math.max(w, h) * this.rs * 1.05);
      if (!base) return null;
      const c = FT.Assets.makeCanvas(base.width, base.height), x = c.getContext('2d');
      x.drawImage(base, 0, 0);
      if (tint) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height); }
      this._off[key] = c;
      return c;
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : clamp(world.alpha, 0, 1);
      this._L = world.layout;
      const amb = weather.ambient || {};
      this._amb = amb;
      this._to = MOODS.includes(amb.env) ? amb.env : (MOODS.includes(amb.mood) ? amb.mood : 'sunny');
      this._from = MOODS.includes(amb.envFrom) ? amb.envFrom : this._to;
      this._mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      // rain darkness → the things' warm rim light (never darkens them)
      this._night = clamp((amb.darkness || 0) / 0.12, 0, 1);
      this._rain = clamp(amb.rain || 0, 0, 1);
      this._envFor(this._L, world.age);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this._backdrop(amb, weather);
      if (o.title) this._titleScene(world, o);
      else if (o.done) { this._particles(weather.particles, 'back'); this._doneScene(world, o); }
      else this._game(world, weather, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fading() { return this._from !== this._to && this._mix < 1; }
    /** draw fn(mood, alpha) for the current mood, crossfading from the previous one */
    _moods(fn) { if (this._fading()) { fn(this._from, 1); fn(this._to, this._mix); } else fn(this._to, 1); }
    _blend(tab) { return this._fading() ? lerp(tab[this._from], tab[this._to], this._mix) : tab[this._to]; }

    /* ---------- backdrop: sky → sun → rainbow → clouds → far → mid → ground (+ fill) → trunks → mood tint ---------- */
    _backdrop(amb, weather) {
      const g = this.g, W = this.W, H = this.H, E = this._env;
      const gr = g.createLinearGradient(0, 0, 0, Math.max(10, E.skyY1));
      const top = amb.skyTop || SKY[this._to][0], bot = amb.skyBottom || SKY[this._to][1];
      gr.addColorStop(0, top); gr.addColorStop(1, bot);
      g.fillStyle = gr; g.fillRect(0, 0, W, Math.max(10, E.skyY1) + 2);
      g.fillStyle = bot; g.fillRect(0, E.skyY1, W, H - E.skyY1);
      // sun (before the far trees, which occlude it)
      const sunA = this._blend(SUN_A) * clamp(amb.sunA == null ? 1 : amb.sunA, 0, 1);
      if (sunA > 0.02) {
        const s = E.sun, pulse = 1 + 0.02 * Math.sin(this.time * 0.8);
        const glow = g.createRadialGradient(s.x, s.y, s.size * 0.2, s.x, s.y, s.size * 1.4);
        glow.addColorStop(0, `rgba(255,250,226,${0.5 * sunA})`); glow.addColorStop(1, 'rgba(255,250,226,0)');
        g.fillStyle = glow; g.beginPath(); g.arc(s.x, s.y, s.size * 1.4, 0, TAU); g.fill();
        g.globalAlpha = sunA; this._img('env/sun', s.x - s.size * pulse / 2, s.y - s.size * pulse / 2, s.size * pulse, s.size * pulse); g.globalAlpha = 1;
      }
      const bowA = this._blend(RAINBOW_A) * clamp(amb.rainbow == null ? 1 : Math.max(amb.rainbow, this._to === 'rainbow' ? this._mix : 0), 0, 1);
      if (bowA > 0.02) { const r = E.rainbow; g.globalAlpha = bowA * 0.92; this._img('env/rainbow', r.x, r.y, r.w, r.h); g.globalAlpha = 1; }
      // clouds: the weather's drifting set, remapped into the RECIPE cloud band
      const C = E.clouds, CT = CLOUDS[this._to] || CLOUDS.sunny;
      for (const c of weather.clouds || []) {
        const al = c.alpha || 0; if (!(al > 0.01)) continue;
        const rain = c.kind === 'rain', s = (c.s || 0.7) * (C.s / 0.6) * (rain ? 1.25 : 1), w = 300 * s, h = 140 * s;
        const yf = clamp(((c.y || 0) / H - 0.04) / 0.22, 0, 1), y = lerp(C.y0, C.y1, yf) + 3 * Math.sin(this.time * 0.25 + (c.idx || 0));
        g.globalAlpha = al * (CT.alpha || 1);
        this._img('env/' + (rain ? 'cloud_rain' : c.kind === 'b' ? 'cloud_b' : 'cloud_a'), c.x - w / 2, y - h / 2, w, h);
      }
      g.globalAlpha = 1;
      const layer = l => {
        const Ly = E[l];
        this._moods((m, al) => {
          if (al <= 0.01) return;
          const t = this._tile(l, m); if (!t) return;
          g.globalAlpha = al;
          for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
          if (l === 'ground' && Ly.fillY < H) { g.fillStyle = GROUND_BOTTOM[m]; g.fillRect(0, Ly.fillY - 1, W, H - Ly.fillY + 1); }
          g.globalAlpha = 1;
        });
      };
      layer('far'); layer('mid'); layer('ground');
      // the two framing trunks (tinted per mood) — their tie points are the garland's ends
      const G = this._G;
      if (G) this._moods((m, al) => {
        if (al <= 0.01) return;
        g.globalAlpha = al;
        for (const [nm, b] of [['env/trunk_l', G.l], ['env/trunk_r', G.r]]) {
          const im = this._tintedImg(nm, TRUNK_TINT[m], b.w, b.h);
          if (im) g.drawImage(im, b.x, b.y, b.w, b.h);
        }
        g.globalAlpha = 1;
      });
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, H); }   // over the env only, never over the tea things
    }

    /* ---------- the round ---------- */
    _game(w, weather, o, a) {
      const L = this._L, P = TA(); if (!L || !P) return;
      const g = this.g;
      this._garland(w.garland, a, w.garland && w.garland.twinkle);
      this._particles(weather.particles, 'back');
      const c = w.critter;
      if (c && c.kind === 'snail') this._snail(c, a);   // peeks out from behind the right toadstool leg
      const T = L.table;
      try { P.drawTable(g, T.x0, T.x1, T.y, { wet: this._rain, spring: ip(w.table, 'spring', a) || 0, legs: T.legs, groundY: T.legBottom || L.groundY }); } catch (e) { /* skip */ }
      for (const mt of w.mats || []) {
        g.save(); g.translate(mt.x, mt.y);
        try { P.drawPlacemat(g, mt.w, { pop: ip(mt, 'pop', a) || 0 }); } catch (e) { /* skip */ }
        g.restore();
      }
      // plates: every berry drawn at the size of the round's largest plate, so berry size is never a clue
      let berryN = 0; for (const m of w.members || []) if (m.thing && m.thing.kind === 'plate') berryN = Math.max(berryN, m.thing.n || 0);
      this._berryN = berryN;
      const list = (w.members || []).filter(m => m.state !== 'lantern' && m.state !== 'gone');
      const sitting = list.filter(m => m.state !== 'rise').sort((p, q) => p.x - q.x);
      for (const m of sitting) this._shadow(m, a, T.y);
      for (const m of sitting) this._thing(m, a);
      for (const m of w.members || []) if ((m.fluff || 0) > 0.01) this._fluff(m, a);
      if (c && c.kind !== 'snail') this._critter(c, a);
      this._moka(w.moka, L.moka, w);
      for (const m of list) if (m.state === 'rise') this._thing(m, a);
      this._fairy(w.fairy, a);
      this._hintHand(w.hintHand, a);
      for (const p of w.puffs || []) { try { P.drawSparkle(g, ip(p, 'x', a), ip(p, 'y', a), (p.r || 14) * 1.3, p.alpha == null ? 1 : p.alpha, this.time * 2); } catch (e) { /* skip */ } }
    }
    _garland(G, a, tw, litAll) {
      const P = TA(); if (!G || !P || !G.lanterns) return;
      const lan = G.lanterns.map((q, i) => ({ x: q.x, y: q.y, lit: litAll != null ? litAll[i] : clamp(ip(q, 'lit', a) || 0, 0, 1.3),
        color: q.color, thing: q.thing, swing: (ip(q, 'swing', a) || 0) + Math.sin(this.time * 1.1 + i * 1.7) * 0.025 }));
      const b = G.badge && G.badge.a > 0.01 ? { home: G.badge.home, i: G.badge.i, a: G.badge.a, pop: easeOutBack(clamp(G.badge.a * 1.6, 0, 1)) } : null;
      const g2 = { x0: G.x0, x1: G.x1, y: G.y, sag: G.sag, twinkle: clamp(tw == null ? (ip(G, 'twinkle', a) || 0) : tw, 0, 1), badge: b, lanternS: (this._L && this._L.garland && this._L.garland.lanternS) || 1 };
      try { P.drawGarland(this.g, g2, lan, this.time); } catch (e) { /* skip */ }
    }
    _shadow(m, a, ty) {
      const g = this.g, x = ip(m, 'x', a), y = ip(m, 'y', a), lift = Math.max(0, ip(m, 'lift', a) || 0);
      const sc = (ip(m, 'scale', a) || 0) * (m.thing.big === false ? 0.62 : 1), al = (m.alpha == null ? 1 : ip(m, 'alpha', a));
      if (!(sc > 0.02) || !(al > 0.02) || y < ty - 60) return;   // falling things far above the table: no shadow yet
      const k = clamp(1 - lift / 120, 0.3, 1) * clamp(1 - (ty - y) / 60, 0, 1);
      g.fillStyle = `rgba(50,40,30,${(0.18 * al * k).toFixed(3)})`;
      g.beginPath(); g.ellipse(x, ty + 2, m.size * 0.34 * sc * (0.6 + 0.4 * k), 6 * sc, 0, 0, TAU); g.fill();
    }
    _thing(m, a) {
      const P = TA(); if (!P) return;
      const g = this.g, x = ip(m, 'x', a), y = ip(m, 'y', a), lift = ip(m, 'lift', a) || 0, rot = ip(m, 'rot', a) || 0;
      const sx = ip(m, 'sx', a) || 1, sy = ip(m, 'sy', a) || 1, sc = ip(m, 'scale', a), al = m.alpha == null ? 1 : ip(m, 'alpha', a);
      if (!(al > 0.01) || !(sc > 0.01)) return;
      if (y < -m.size * 1.5) return;   // not spawned yet (waiting above the screen)
      g.save();
      g.globalAlpha *= al;
      g.translate(x, y - lift); g.rotate(rot); g.scale(sx * sc, sy * sc);
      try {
        P.drawThing(g, m.thing, m.size, { glow: m.glow || 0, dim: m.dim || 0, hop: m.hop || 0, night: this._night,
          count: m.count == null ? -1 : m.count, ring: m.ring || 0, berryN: this._berryN || 0, dpr: this.rs * sc });
      } catch (e) { /* skip */ }
      g.restore();
    }
    /** the dandelion fluff: puff centre 1.3 r above the hang point (fluffX, fluffY); while falling a thin string to the top */
    _fluff(m, a) {
      const P = TA(), g = this.g;
      const fx = ip(m, 'fluffX', a), fy = ip(m, 'fluffY', a), r = m.fluffR || m.size * 0.42, al = clamp(ip(m, 'fluff', a) || 0, 0, 1);
      if (!(al > 0.01) || fy < -r * 3) return;
      if (m.state === 'fall') {
        const x = ip(m, 'x', a), y = ip(m, 'y', a), rot = ip(m, 'rot', a) || 0, h = m.size * (m.thing.big === false ? 0.62 : 1) * 0.92;
        const tx = x + Math.sin(rot) * h, ty = y - Math.cos(rot) * h;
        g.save(); g.globalAlpha *= al; g.strokeStyle = 'rgba(150,138,112,0.85)'; g.lineWidth = 1.6; g.lineCap = 'round';
        g.beginPath(); g.moveTo(fx, fy); g.lineTo(tx, ty); g.stroke(); g.restore();
      }
      try { P.drawFluff(g, fx, fy - 1.3 * r, r, al); } catch (e) { /* skip */ }
    }
    _mokaFrame(mood, blink, rain) {
      let nm = mood || 'idle';
      const calm = nm === 'idle' || nm === 'talk';
      if (rain && nm !== 'cheer') nm = 'umbrella';   // the rain chapter: under the mushroom umbrella (only "Cheers!" lowers it)
      else if (blink && (calm || nm === 'happy')) nm = 'blink';
      if (!rain && this._speaking && (nm === 'idle' || nm === 'talk' || nm === 'blink') && Math.sin(this.time * 17) > -0.2) nm = 'talk';
      else if (!rain && nm === 'talk' && !this._speaking) nm = Math.sin(this.time * 17) > 0.3 ? 'talk' : 'idle';
      const key = 'characters/moka_' + nm;
      return FT.Assets.has(key) ? key : 'characters/moka_idle';
    }
    /** Moka at his seat point (x, y), visible height h */
    _moka(m, box, w, opt = {}) {
      if (!box) return;
      m = m || {};
      const rain = !opt.frame && w && w.weather === 2 && this._to === 'rain';
      const nm = opt.frame || this._mokaFrame(m.mood, m.blink, rain);
      const bounce = clamp(ip(m, 'bounce', 1) || 0, 0, 1);
      const k = box.h / MOKA.body, lift = bounce * 12 + (opt.lift || 0);
      const breathe = 1 + 0.012 * Math.sin(this.time * 2.4);
      const g = this.g;
      g.save();
      g.translate(box.x, box.y);
      g.fillStyle = `rgba(45,35,25,${(0.2 - bounce * 0.06).toFixed(3)})`; g.beginPath(); g.ellipse(6 * k, 0, box.h * 0.34 * (1 - bounce * 0.15), box.h * 0.045, 0, 0, TAU); g.fill();
      g.translate(0, -lift); g.rotate((m.look || 0) * 0.025 + (opt.rot || 0));
      g.scale(1 / Math.sqrt(breathe), breathe);
      const X = -MOKA.ax * k, Y = -MOKA.ay * k, S = MOKA.w * k;
      this._img(nm, X, Y, S, S);
      // under the mushroom umbrella the mouth still moves while he speaks: the talk frame's mouth, clipped in
      if (rain && nm.endsWith('umbrella') && this._speaking && Math.sin(this.time * 17) > -0.2) {
        const mx = MOKA.mouth[0], my = MOKA.mouth[1], rw = 34, rh = 26;
        g.save(); g.beginPath(); g.ellipse(X + mx * k, Y + (my + 2) * k, rw / 2 * k, rh / 2 * k, 0, 0, TAU); g.clip();
        this._img('characters/moka_talk', X, Y, S, S);
        g.restore();
      }
      g.restore();
    }
    _fairy(f, a, opt = {}) {
      if (!f) return;
      const g = this.g, x = opt.x != null ? opt.x : ip(f, 'x', a), y = opt.y != null ? opt.y : ip(f, 'y', a);
      if (!(x > -100 && x < this.W + 100 && y > -100 && y < this.H + 100)) return;
      const size = opt.size || FAIRY.draw, glowR = size * 0.95;
      const pulse = 0.8 + 0.2 * Math.sin(this.time * 5 + (opt.ph || 0)), gl = clamp(opt.glow == null ? 1 : opt.glow, 0, 1.6);
      const rg = g.createRadialGradient(x, y, 0, x, y, glowR * (0.9 + 0.2 * gl));
      rg.addColorStop(0, `rgba(255,244,200,${(0.55 * pulse * Math.min(1, gl)).toFixed(3)})`); rg.addColorStop(1, 'rgba(255,240,190,0)');
      g.fillStyle = rg; g.beginPath(); g.arc(x, y, glowR * (0.9 + 0.2 * gl), 0, TAU); g.fill();
      const nm = (f.sprinkle || 0) > 0.5 ? 'characters/fairy_sprinkle' : (f.flap ? 'characters/fairy_flap' : 'characters/fairy');
      g.save(); g.translate(x, y + Math.sin(this.time * 4 + (opt.ph || 0)) * (f.state === 'rest' ? 0 : 1.5));
      if ((f.face || 1) < 0) g.scale(-1, 1);
      if (opt.rot) g.rotate(opt.rot);
      this._img(nm, -size / 2, -size / 2, size, size);
      g.restore();
    }
    _critter(c, a) {
      if (!c || c.state === 'gone') return;
      const g = this.g;
      if (c.kind === 'fairies') {
        for (const f of c.fairies || []) {
          const x = ip(f, 'x', a), y = ip(f, 'y', a);
          this._fairy({ flap: f.flap > 0.5 ? 1 : 0, face: Math.cos(this.time * 1.6 + (f.ph || 0)) > 0 ? 1 : -1, state: 'fly' }, a,
            { x, y, size: CRIT.fairy.draw, glow: f.glow == null ? 1 : f.glow, rot: TAU * (f.twirl || 0), ph: f.ph || 0 });
        }
        return;
      }
      const x = ip(c, 'x', a), y = ip(c, 'y', a);
      if (!(x > -150 && x < this.W + 150 && y > -150 && y < this.H + 150)) return;
      const M = CRIT[c.kind]; if (!M) return;
      let nm = 'characters/' + c.kind, k = M.draw / M.w, rot = 0, dy = 0;
      if (c.kind === 'ladybug') {
        if (c.state === 'fly' || c.open) { nm += '_fly'; rot = Math.sin(this.time * 24) * 0.06; }
        else if (c.step && c.state === 'walk') nm += '_step';
        if (c.state === 'walk') dy = -Math.abs(Math.sin((c.stepT || 0) * Math.PI)) * 1.5;
        g.fillStyle = 'rgba(50,40,30,0.18)'; g.beginPath(); g.ellipse(x, y + 1, 26, 4, 0, 0, TAU); g.fill();
      } else if (c.kind === 'butterfly') {
        if ((c.flap || 0) > 0.5) nm += '_flap';
        rot = Math.sin(this.time * 3) * 0.08;
      }
      g.save(); g.translate(x, y + dy);
      if ((c.face || 1) < 0) g.scale(-1, 1);
      if (rot) g.rotate(rot);
      this._img(nm, -M.ax * k, -M.ay * k, M.w * k, M.h * k);
      g.restore();
    }
    _snail(c, a) {
      const g = this.g, M = CRIT.snail, k = M.draw / M.w, x = ip(c, 'x', a), y = ip(c, 'y', a), al = clamp((c.show || 0) * 4, 0, 1);
      if (!(al > 0.01)) return;
      const nm = (c.peek || 0) > 0.5 ? 'characters/snail_peek' : 'characters/snail';
      g.save(); g.globalAlpha *= al; g.translate(x, y + Math.sin(this.time * 2) * 0.8);
      if ((c.face || 1) < 0) g.scale(-1, 1);
      this._img(nm, -M.ax * k, -M.ay * k, M.w * k, M.h * k);
      g.restore();
    }
    _hintHand(H, a) {
      const P = TA(); if (!H || !P) return;
      const al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      try { P.drawHintHand(this.g, ip(H, 'x', a), ip(H, 'y', a), H.press || 0, al, 96); } catch (e) { /* skip */ }
    }

    /* ---------- title: Moka in his flower crown waving beside a little table, one glowing lantern and the fairy ---------- */
    _titleScene(w, o) {
      const L = this._L, P = TA(), g = this.g, t = this.time;
      if (!L || !P) return;
      const G = L.garland, boxes = (o.boxes && o.boxes.title) || [];
      // lanterns hidden behind the DOM logo / tagline are left out; the first visible one glows (the fairy loops around it)
      const hit = (x, y, r) => boxes.some(b => x + r > b.x && x - r < b.x + b.w && y + r > b.y && y - r < b.y + b.h);
      const vis = G.lanterns.filter(q => !hit(q.cx, q.cy, 40));
      const glowQ = vis[Math.min(1, vis.length - 1)] || null;
      this._garland(Object.assign({}, G, { lanterns: vis.map(q => ({ x: q.x, y: q.y, color: null, thing: q === glowQ ? { kind: 'obj', obj: 'cup', color: 'yellow' } : null, swing: 0 })) }), 1, 0.3 + 0.2 * Math.sin(t * 1.4), vis.map(q => (q === glowQ ? 1 : 0)));
      this._particles(this._wxParticles, 'back');
      const T = L.table;
      try { P.drawTable(g, T.x0, T.x1, T.y, { wet: this._rain, spring: 0, legs: T.legs, groundY: T.legBottom || L.groundY }); } catch (e) { /* skip */ }
      // the little tea set: two or three things on placemats, kept clear of the DOM title (▶ and the star pill)
      const size = Math.min(L.item, 120);
      const things = [{ kind: 'obj', obj: 'teapot', color: 'blue' }, { kind: 'cookie', shape: 'star', color: 'yellow' }, { kind: 'obj', obj: 'cup', color: 'red' }];
      const n = 5, span = T.x1 - T.x0 - 80, mid = (T.x0 + T.x1) / 2, ins = L.ins || {};
      // never past the screen edge (the portrait table runs nearly full width)
      const sp = Math.min(clamp(span / n, 1.25 * size, 1.7 * size), (this.W - (ins.left || 0) - (ins.right || 0) - 32 - size) / (n - 1));
      const xs = []; for (let i = n - 1; i >= 0; i--) xs.push(mid + (i - (n - 1) / 2) * sp);
      const free = xs.filter(x => !boxes.some(b => x + size * 0.55 > b.x && x - size * 0.55 < b.x + b.w && T.y + 4 > b.y && T.y - size * 1.05 < b.y + b.h));
      const use = free.slice(0, 3).sort((p, q) => p - q);
      use.forEach((x, i) => {
        g.save(); g.translate(x, T.y); try { P.drawPlacemat(g, size * 1.25, { pop: 0 }); } catch (e) { /* skip */ } g.restore();
        const hop = Math.max(0, Math.sin(t * 2.2 - i * 0.7)) ** 6 * 10, br = 1 + 0.012 * Math.sin(t * 3.8 + i);
        g.save(); g.translate(x, T.y - hop); g.scale(1 / br, br);
        try { P.drawThing(g, things[(i + 3 - use.length) % 3], size, { dpr: this.rs, night: this._night }); } catch (e) { /* skip */ }
        g.restore();
      });
      this._moka({}, L.moka, w, { frame: 'characters/moka_title', rot: Math.sin(t * 2) * 0.02 });
      // the fairy loops around the glowing lantern
      const q = glowQ;
      if (q) this._fairy({ flap: Math.sin(t * 30) > 0 ? 1 : 0, face: Math.cos(t * 1.3) < 0 ? 1 : -1, state: 'fly' }, 1, { x: q.cx + Math.sin(t * 1.3) * 70, y: q.cy + Math.cos(t * 1.3) * 24 - 10 });
    }
    /* ---------- session done: the session's lanterns float around the clearing, Moka sips and cheers, confetti ---------- */
    _doneScene(w, o) {
      const L = this._L, P = TA(), g = this.g, t = this.time, W = this.W, H = this.H;
      if (!L || !P) return;
      this._galleryT += o.dt || 0;
      const T = L.table;
      const list = this.gallery.length ? this.gallery : [{ kind: 'obj', obj: 'cup', color: 'red' }, { kind: 'cookie', shape: 'heart', color: 'blue' }, { kind: 'guest', animal: 'penguin' }, { kind: 'plate', n: 3 }];
      // the garland keeps the last chapter's things in its 4 lit lanterns (else the session's last 4 things)
      const WG = (w && w.garland && w.garland.lanterns) || [], last = list.slice(-4);
      const lan = L.garland.lanterns.map((q, i) => { const s = WG[i] || {}, th = s.thing || last[i % last.length] || null; return { x: q.x, y: q.y, swing: 0, thing: th, color: s.thing ? s.color : (th && th.color) || null }; });
      this._garland(Object.assign({}, L.garland, { lanterns: lan }), 1, 0.6 + 0.4 * Math.sin(t * 2), [1, 1, 1, 1]);
      try { P.drawTable(g, T.x0, T.x1, T.y, { wet: this._rain, spring: 0, legs: T.legs, groundY: T.legBottom || L.groundY }); } catch (e) { /* skip */ }
      // portrait: the table sits mid-screen, so the lanterns rise from the ground band (in front of the table) up to the panel
      const pb = o.boxes && o.boxes.done, ins = L.ins || {}, bottom = H > W ? L.groundY - 40 : T.y - 40;
      const M = L.moka, mTop = M.y - M.h, mRight = M.x + M.w * 0.5 + 80, xL = (ins.left || 0) + 50;
      // the lanterns rise in the open sky below the done panel (portrait) / beside and below it (landscape)
      const top = Math.min(bottom - 220, Math.max((ins.top || 0) + 60, pb && H > W ? pb.y + pb.h + 90 : 0));
      const n = Math.max(list.length, H > W ? 10 : 12), ls = H > W ? 1 : 0.9;
      for (let i = 0; i < n; i++) {
        const th = list[i % list.length], ph = i * 2.399;
        const rise = ((this._galleryT * 22 + i * (bottom - top) / n) % (bottom - top + 160));
        const y = bottom + 80 - rise;
        // beside Moka (never over his head / raised cup) while low, the whole width once above him (smooth, no jump)
        const x0 = lerp(xL, Math.max(xL, mRight), clamp((y - (mTop - 120)) / 100, 0, 1));
        const x = x0 + ((i * 0.618034) % 1) * Math.max(40, W - (ins.right || 0) - 50 - x0) + Math.sin(t * 0.7 + ph) * 34;
        const al = clamp(Math.min(rise / 60, (bottom - top + 160 - rise) / 60), 0, 1);
        if (al <= 0.01) continue;
        g.save(); g.globalAlpha *= al;
        try { P.drawLantern(g, x, y - 40, ls, 1, th.color || null, th, Math.sin(t * 1.4 + ph) * 0.12); } catch (e) { /* skip */ }
        g.restore();
      }
      const beat = Math.floor(t / 1.6) % 2;
      this._moka({ bounce: beat ? Math.max(0, Math.sin(t * 4)) * 0.6 : 0 }, L.moka, w, { frame: beat ? 'characters/moka_cheer' : 'characters/moka_sip' });
      const G = L.garland, fx = lerp(G.x0, G.x1, 0.5 + 0.4 * Math.sin(t * 0.6)), fy = G.y + G.sag + 60 + Math.sin(t * 1.7) * 40;
      this._fairy({ flap: Math.sin(t * 30) > 0 ? 1 : 0, face: Math.cos(t * 0.6) > 0 ? 1 : -1, state: 'fly' }, 1, { x: fx, y: fy });
      this._confT = (this._confT || 0) - (o.dt || 0);
      if (this._confT <= 0) { this._confT = 0.8; this.burst('sparkles', lerp(T.x0, T.x1, Math.random()), T.y - 60 - Math.random() * 200, { n: 6 }); }
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H, L = this._L;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((FT.CONFIG && FT.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2;
      const gb = L.garland ? L.garland.bottom || (L.garland.y + 150) : 0;
      const cy = H > W ? clamp((gb + L.table.y - L.item) / 2, gb + bh / 2 + 10, L.table.y - bh / 2 - 20) : Math.max(H * 0.42, (L.bubble ? L.bubble.y + L.bubble.h : 0) + bh / 2 + 20);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(40,50,30,.28)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#A9784E'; g.beginPath(); roundRect(g, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 40); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#6E4A2E'; g.stroke();
      g.fillStyle = '#8DAA6A'; g.beginPath(); roundRect(g, -bw / 2 - 4, -bh / 2 - 12, bw + 8, 14, 7); g.fill();
      g.fillStyle = '#FFF8EA'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 30); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#D8B26A'; g.stroke();
      const I = FT.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#7A6A48', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 58, '#5A3B26', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#7A6A48', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#5A3B26', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && FT.PALETTE && FT.PALETTE[c]) ? FT.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 240 * (opt.spread || 1);
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: opt.color ? colOf(opt.color) : (opt.gold ? '#FFE7A3' : CONF[i % CONF.length]), x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, drag: 1.2, t: 0, life: 0.8 + R() * 0.5, size: 16 + R() * 14, rot: R() * TAU, vr: 3 });
        }
      } else if (type === 'ring') {
        fx.push({ k: 'ring', x, y, t: 0, life: opt.life || 0.4, size: opt.size || 90, color: opt.rgb || '255,255,255' });
      } else if (type === 'clink') {   // Moka's cup "Cheers!": two little gold arcs + a star flash
        fx.push({ k: 'clink', x, y, t: 0, life: 0.5 });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round((opt.n || 110) * q), lf = opt.life || 5;
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * (opt.n ? 0.25 : 0.5), vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: lf + R() * lf * 0.4, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'count') {   // a big numeral pops up over the counted berry
        for (const f of fx) if (f.k === 'num') f.t = Math.max(f.t, f.life * 0.85);
        fx.push({ k: 'num', x, y, t: 0, life: 0.5, text: String(opt.n || '') });
      } else if (type === 'puff') {   // a soft moss-dust puff (landing)
        const n = Math.round((opt.n || 7) * q);
        for (let i = 0; i < n; i++) {
          const a = Math.PI + (i / Math.max(1, n - 1)) * Math.PI + (R() - 0.5) * 0.3, sp = 50 + R() * 60;
          fx.push({ k: 'p', sprite: 'puff', tint: null, x: x + Math.cos(a) * 14, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.35 - 14, g: -10, drag: 2.4, t: 0, life: 0.45 + R() * 0.25, size: 18 + R() * 12, rot: R() * TAU, vr: 1, alpha: 0.75 });
        }
      } else if (type === 'poof') {   // the clear: the thing shrinks into gold sparkles
        const n = Math.round((opt.n || 9) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 40 + R() * 120;
          fx.push({ k: 'p', sprite: i % 3 ? 'sparkle' : 'dust', tint: i % 2 ? '#FFE7A3' : null, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 50, g: -30, drag: 2, t: 0, life: 0.6 + R() * 0.4, size: 14 + R() * 12, rot: R() * TAU, vr: 4 });
        }
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
          if (f.drag) { f.vx *= 1 - Math.min(0.9, f.drag * dt); f.vy = Math.min(f.vy, 200); if (f.sway != null) { f.sway += dt * 3; f.x += Math.sin(f.sway) * 30 * dt; } }
          f.x += f.vx * dt; f.y += f.vy * dt; f.rot += (f.vr || 0) * dt;
          const al = (u > 0.7 ? (1 - u) / 0.3 : 1) * (f.alpha == null ? 1 : f.alpha);
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, f.size, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, f.size, f.rot, al);
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'clink') {
          g.save(); g.strokeStyle = `rgba(216,178,106,${(0.95 * (1 - u)).toFixed(3)})`; g.lineCap = 'round'; g.lineWidth = 5;
          for (let j = -1; j <= 1; j++) { const r = 18 + u * 30, an = -Math.PI / 2 + j * 0.6; g.beginPath(); g.moveTo(f.x + Math.cos(an) * r, f.y + Math.sin(an) * r); g.lineTo(f.x + Math.cos(an) * (r + 14), f.y + Math.sin(an) * (r + 14)); g.stroke(); }
          g.restore();
          this._sprite('sparkle', f.x, f.y - 6, 34 * (1 - u * 0.5), u * 3, 1 - u);
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#7A3A48', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = FT.Assets.tinted ? FT.Assets.tinted(name, color, size * this.rs) : FT.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    /** weather particles: {kind, x, y, rot, s, a, tint, layer, flipX}; s = width (raindrop: height) */
    _particles(list, layer) {
      if (layer === 'back' && list) this._wxParticles = list;
      if (!list) return;
      const g = this.g;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.a > 0.01)) continue;
        const nm = p.kind === 'star' ? 'pstar' : p.kind;
        if (nm === 'raindrop') {
          const spr = FT.Assets.sprite('particles/raindrop', p.s * this.rs);
          if (!spr) continue;
          const h = p.s, w = p.s * 12 / 32;
          g.save(); g.globalAlpha *= p.a; g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
          continue;
        }
        if (p.flipX != null && p.flipX !== 1) {
          const spr = p.tint && TINTABLE[nm] ? FT.Assets.tinted(nm, p.tint, p.s * this.rs) : FT.Assets.sprite(nm, p.s * this.rs);
          if (!spr) continue;
          const k = p.s / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
          g.save(); g.globalAlpha *= p.a; g.translate(p.x, p.y); g.rotate(p.rot || 0); g.scale(Math.abs(p.flipX) < 0.08 ? (p.flipX < 0 ? -0.08 : 0.08) : p.flipX, 1);
          g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
          continue;
        }
        if (p.tint && TINTABLE[nm]) this._tinted(nm, p.tint, p.x, p.y, p.s, p.rot || 0, p.a);
        else this._sprite(nm, p.x, p.y, p.s, p.rot || 0, p.a);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = FT.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = FT.Assets.sprite(name, Math.max(Math.abs(w), Math.abs(h)) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.mokaHit && w.mokaHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x, n.y, n.w, n.h); }
      if (L.band) { g.strokeStyle = 'rgba(255,160,0,.5)'; g.strokeRect(L.band.x, L.band.y, L.band.w, L.band.h); }
      for (const m of w.members || []) {
        const h = w.memberHit && w.memberHit(m.id); if (!h) continue;
        g.strokeStyle = m.odd ? 'rgba(220,0,0,.7)' : 'rgba(0,160,0,.7)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      }
      const c = w.critterHit && w.critterHit();
      if (c) { g.strokeStyle = 'rgba(0,200,255,.8)'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.stroke(); }
      if (this._G) { g.fillStyle = 'rgba(255,0,0,.8)'; for (const p of [this._G.tieL, this._G.tieR]) { g.beginPath(); g.arc(p.x, p.y, 5, 0, TAU); g.fill(); } }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with TeaArt.drawIcon into a small canvas. */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!thing || !TA()) return;
    try { g.save(); g.translate(cw / 2, ch / 2); TA().drawIcon(g, thing, Math.min(ch, cw) * 0.94); g.restore(); } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.trunkGeom = trunkGeom;
  Renderer.tileXs = tileXs;
  Renderer.RECIPE = { MOODS, SKY, MOSS, GROUND_BOTTOM, RIM, TRUNK_TINT, TILES, TRUNK, SUN, SUN_A, RAINBOW_A, CLOUDS, FAR_K, HORIZON_ITEM, envLayout, trunkGeom, tileXs };
  FT.Renderer = Renderer;
})(window.FT = window.FT || {});
