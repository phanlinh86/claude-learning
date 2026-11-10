/* CC.Renderer (Kiki's Camp Chimes) — draws the mountain campsite and the wind chimes on one canvas (MECHANICS §3):
 * sky gradient (ambient colours crossfading morning → noon → sunset → night), star field, sun / moon, clouds, far
 * mountains + lake, mid pines + tents, meadow (tools/env_scenes.js RECIPE), back particles, the campfire, Kiki (mood
 * frames, blink, talk flaps, hop), the log beam + posts, the lantern garland, cords + swinging chimes, flying notes,
 * surprises (hedgehog, songbird, fireflies), the hint hand, front particles, fx and the chapter banner.
 * Title: Kiki waving with a little bell beside a small beam with 3 chimes. Session done: Kiki dances by the fire under
 * a garland of every lantern lit this session. Logical coordinates (short side 720) × render scale rs = device pixels. */
(function (CC) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const MOODS = ['morning', 'noon', 'sunset', 'night'];
  // tools/env_scenes.js RECIPE tables
  const SKY = { morning: [[0, '#F7D9C4'], [1, '#FDF3E1']], noon: [[0, '#7CC4EE'], [1, '#D6F0FB']],
    sunset: [[0, '#B9729A'], [0.38, '#F29B6B'], [1, '#FBD7A5']], night: [[0, '#1E2A4A'], [1, '#3B4C78']] };
  const GROUND_BOTTOM = { morning: '#97A87F', noon: '#8EA678', sunset: '#938766', night: '#2C3D48' };
  const ENV = { LAKE: { y0: 612, y1: 694 }, MOODS };
  const SUN = { landscape: { morning: { x: .3, y: .17, size: 140 }, noon: { x: .71, y: .1, size: 150 }, sunset: { x: .84, y: .19, size: 176 }, night: { x: .86, y: .40, size: 150 } },
    portrait: { morning: { x: .2, y: .24, size: 120 }, noon: { x: .72, y: .18, size: 130 }, sunset: { x: .78, y: .43, size: 150 }, night: { x: .8, y: .52, size: 130 } } };
  const MOON = { landscape: { x: .74, y: .13, size: 130 }, portrait: { x: .74, y: .21, size: 120 } };
  const STARS = { density: 1 / 4500, max: 180, r: [0.7, 2.1], twinkle: 0.3 };
  const CLOUDS = { morning: { alpha: .8, tint: 'rgba(255,226,206,0.45)' }, noon: { alpha: .95, tint: null },
    sunset: { alpha: .85, tint: 'rgba(246,170,140,0.5)' }, night: { alpha: .22, tint: 'rgba(90,108,160,0.6)' } };
  // Kiki: 300×300 frames, feet anchor (150, 292); visible body y 33…294 (docs/art/kiki_bbox.json)
  const KIKI = { w: 300, h: 300, ax: 150, ay: 292, body: 261 };
  const HOG = { w: 160, h: 120, ax: 80, ay: 116 };
  const BIRD = { w: 120, h: 100, ax: 60, ay: 96 };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const CA = () => CC.ChimeArt;
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, dust: 1, sparkle: 1, pstar: 1, note: 1, mist: 1 };

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
  function envLayout(W, H, ins) {
    ins = ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const portrait = H > W, tall = H / W > 1.6;
    const campY = Math.round(H * (portrait ? 0.70 : 0.60));
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;          // skill rule: background layers ×1.36 on tall portrait
    const kf = 0.7 * kp, km = 0.86 * kp;
    const kg = Math.max(1, Math.min(1.8, (H - campY) / 220));
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.5 : 0.62) - 690 * kf), y: Math.round(campY - 30 * km - 720 * kf) };
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.5 : 0.45) - 410 * km), y: campY - 298 * km };
    const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(W * (portrait ? 0.5 : 0.55) - 600 * kg), y: campY - 40 * kg };
    ground.fillY = ground.y + 258 * kg;
    const hillTop = far.y + 300 * kf;
    const skyY1 = Math.round(far.y + ENV.LAKE.y0 * kf);
    const lake = { y0: skyY1, y1: Math.round(far.y + ENV.LAKE.y1 * kf) };
    const o = portrait ? 'portrait' : 'landscape', sun = {};
    const cw = W - ins.left - ins.right, ch = H - ins.top - ins.bottom;
    const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24);
    for (const m of ENV.MOODS) {
      const s = SUN[o][m]; let x = ins.left + s.x * cw;
      if (!portrait) x = Math.max(x, bx + s.size * 0.5);
      sun[m] = { x, y: ins.top + s.y * ch, size: s.size };
    }
    const mo = MOON[o], moon = { x: ins.left + mo.x * cw, y: ins.top + mo.y * ch, size: mo.size };
    const starsY1 = Math.round(far.y + 460 * kf);
    const stars = { y1: starsY1, n: Math.min(STARS.max, Math.round(W * starsY1 * STARS.density)) };
    const clouds = portrait
      ? { y0: ins.top + 0.05 * H, y1: ins.top + 0.30 * H, s: 0.5 }
      : { y0: ins.top + 30, y1: ins.top + 150, s: 0.6 };
    return { portrait, tall, campY, streetY: campY, sandY: campY, kp, far, mid, ground, hillTop, skyY1, lake, sun, moon, stars, clouds, clock: [], volcano: [], starsY1 };
  }
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this.gallery = []; this._galleryT = 0; this._stars = null; this._cloudC = {};
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      CC.Assets.dropExact();
      this._envKey = ''; this._cloudC = {};
    }
    prewarm(layout, level) {
      if (layout) this._envFor(layout);
      const E = this._env; if (!E) return;
      const m = MOODS[clamp(level | 0, 0, 3) % 4];
      for (const l of ['far', 'mid', 'ground']) this._tile(l, m);
    }
    /** the session's songs for the done screen (sessionDone.songs): every lantern colour lit this session */
    setGallery(list) { this.gallery = (list || []).slice(); this._galleryT = 0; }
    clearGallery() { this.gallery = []; }

    /* ---------- env ---------- */
    _envFor(L) {
      const ins = (L && L.ins) || { top: 0, left: 0, right: 0, bottom: 0 };
      const key = [this.W, this.H, Math.round(ins.top), Math.round(ins.left), Math.round(ins.right)].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, ins);
      this._envKey = key;
      // our own star field (weather.stars may be absent): deterministic per size
      let s = 12345; const R = () => ((s = (s * 16807) % 2147483647) / 2147483647);
      const n = this._env.stars.n, y1 = this._env.stars.y1;
      this._stars = Array.from({ length: n }, () => ({ x: R() * this.W, y: R() * y1, r: lerp(STARS.r[0], STARS.r[1], R() * R()), tw: R() < STARS.twinkle ? R() * TAU : -1 }));
      return this._env;
    }
    _tile(layer, m) {
      const E = this._env, Ly = E[layer];
      return CC.Assets.exact(layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
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
      this._mood = amb.moodIndex != null ? amb.moodIndex : 0;
      // night-ness for the chimes' warm rim light: sunset 0.35, night 1 (crossfaded with the light level)
      this._night = clamp(amb.light != null ? (1 - amb.light) / 0.45 : 0, 0, 1);
      this._envFor(this._L);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this._backdrop(amb, weather);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }

    /* ---------- backdrop: sky → stars → sun / moon → clouds → far → mid → ground (+ fill); moods crossfade ---------- */
    _backdrop(amb, weather) {
      const g = this.g, W = this.W, H = this.H, E = this._env;
      const to = MOODS.includes(amb.env) ? amb.env : 'morning', from = MOODS.includes(amb.envFrom) ? amb.envFrom : to;
      const mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1), fading = from !== to && mix < 1;
      const gr = g.createLinearGradient(0, 0, 0, E.skyY1);
      if (amb.skyTop) { gr.addColorStop(0, amb.skyTop); if (amb.skyMid) gr.addColorStop(0.45, amb.skyMid); gr.addColorStop(1, amb.skyBottom || amb.skyTop); }
      else for (const [o, c] of SKY[to]) gr.addColorStop(o, c);
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      // stars
      const sA = clamp(amb.starsA || 0, 0, 1);
      if (sA > 0.02 && this._stars) {
        g.fillStyle = '#FFF8E6';
        for (const s of this._stars) {
          const tw = s.tw >= 0 ? 0.55 + 0.45 * Math.sin(this.time * 2.2 + s.tw) : 1;
          g.globalAlpha = sA * tw * 0.9; g.beginPath(); g.arc(s.x, s.y, s.r, 0, TAU); g.fill();
          if (s.r > 1.9 && tw > 0.9) { g.globalAlpha = sA * 0.7; this._sprite('pstar', s.x, s.y, 14, 0, 1); }
        }
        g.globalAlpha = 1;
      }
      // sun glides between the moods' spots; the moon sits in the night spot
      const sunA = clamp(amb.sunA == null ? 1 : amb.sunA, 0, 1);
      const s1 = E.sun[to], s0 = fading ? E.sun[from] : s1;
      const sp = { x: lerp(s0.x, s1.x, mix), y: lerp(s0.y, s1.y, mix), size: lerp(s0.size, s1.size, mix) };
      if (sunA > 0.02) {
        const warm = to === 'sunset' ? '255,196,140' : to === 'morning' ? '255,226,190' : '255,248,220';
        const glow = g.createRadialGradient(sp.x, sp.y, sp.size * 0.2, sp.x, sp.y, sp.size * 1.3);
        glow.addColorStop(0, `rgba(${warm},${0.45 * sunA})`); glow.addColorStop(1, `rgba(${warm},0)`);
        g.fillStyle = glow; g.beginPath(); g.arc(sp.x, sp.y, sp.size * 1.3, 0, TAU); g.fill();
        g.globalAlpha = sunA; this._img('sun', sp.x - sp.size / 2, sp.y - sp.size / 2, sp.size, sp.size); g.globalAlpha = 1;
      }
      const moonA = clamp(amb.moonA || 0, 0, 1);
      if (moonA > 0.02) { const m = E.moon; g.globalAlpha = moonA; this._img('moon', m.x - m.size / 2, m.y - m.size / 2, m.size, m.size); g.globalAlpha = 1; }
      // clouds: white art tinted per mood (offscreen, source-atop)
      const cs = E.clouds.s / 0.6, CT = CLOUDS[to] || CLOUDS.noon;
      for (const c of weather.clouds || []) {
        if (!(c.alpha > 0.01)) continue;
        const w = 300 * (c.s || 0.6) * cs, h = 140 * (c.s || 0.6) * cs;
        const spr = this._cloud(c.type || 'cloud_a', to, w, h);
        g.save(); g.globalAlpha = c.alpha * (CT.alpha || 1); g.translate(c.x, c.y); if (c.flipX) g.scale(-1, 1);
        if (spr) g.drawImage(spr, -w / 2, -h / 2, w, h);
        g.restore();
      }
      const layer = l => {
        const Ly = E[l];
        const one = (m, al) => {
          if (al <= 0.01) return;
          const t = this._tile(l, m); if (!t) return;
          g.globalAlpha = al;
          for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
          if (l === 'ground' && Ly.fillY < H) { g.fillStyle = GROUND_BOTTOM[m]; g.fillRect(0, Ly.fillY - 0.5, W, H - Ly.fillY + 0.5); }
          g.globalAlpha = 1;
        };
        if (fading) { one(from, 1); one(to, mix); } else one(to, 1);
      };
      layer('far'); layer('mid'); layer('ground');
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
    }
    _cloud(name, mood, w, h) {
      const key = name + mood + Math.round(w);
      if (this._cloudC[key]) return this._cloudC[key];
      const base = CC.Assets.sprite(name, Math.max(w, h) * this.rs);
      if (!base) return null;
      const c = document.createElement('canvas'); c.width = base.width; c.height = base.height;
      const x = c.getContext('2d'); x.drawImage(base, 0, 0);
      const T = (CLOUDS[mood] || {}).tint;
      if (T) { x.globalCompositeOperation = 'source-atop'; x.fillStyle = T; x.fillRect(0, 0, c.width, c.height); }
      this._cloudC[key] = c;
      return c;
    }

    /* ---------- the round ---------- */
    _game(w, o, a) {
      const L = this._L, C = CA(); if (!L) return;
      const g = this.g, night = this._night, t = this.time;
      const fireGlow = this._amb.fire == null ? 0.5 : this._amb.fire;
      if (C && L.fire) { try { C.drawFire(g, L.fire, { t, glow: fireGlow }); } catch (e) { /* skip */ } }
      this._kiki(w.kiki, L.kiki);
      if (!C) return;
      const wob = ip(w.beam || {}, 'wob', a) || 0;
      try { C.drawBeam(g, L, { t, wob, night, hooks: (L.hooks || []).map(h => h.x) }); } catch (e) { /* skip */ }
      const lan = (w.lanterns || []).map(q => Object.assign({}, q, { lit: ip(q, 'lit', a), swing: ip(q, 'swing', a) }));
      if (L.garland) { try { C.drawGarland(g, L.garland, lan, { t, night }); } catch (e) { /* skip */ } }
      // cords + chimes (hook order); the ring arcs of a struck chime are drawn with it
      for (const c of w.chimes || []) this._chime(c, a, night);
      for (const n of w.notes || []) {
        const x = ip(n, 'x', a), y = ip(n, 'y', a);
        try { C.drawNote(g, x, y, 34, { color: n.color, alpha: n.alpha == null ? 1 : n.alpha, rot: n.rot || 0 }); } catch (e) { /* skip */ }
      }
      this._hedgehog(w.hedgehog, a);
      this._bird(w.bird, a);
      for (const f of w.fireflies || []) { try { C.drawFirefly(g, ip(f, 'x', a), ip(f, 'y', a), f.r || 5, f.glow == null ? 1 : f.glow); } catch (e) { /* skip */ } }
      this._hintHand(w.hintHand, a);
    }
    _chime(c, a, night) {
      const C = CA(); if (!C || c.state === 'gone') return;
      const pop = ip(c, 'pop', a); if (!(pop > 0)) return;
      const g = this.g, x = ip(c, 'x', a), y = ip(c, 'y', a), cord = ip(c, 'cord', a) || 0;
      const hookY = c.hookY != null ? c.hookY : (this._L.beam && this._L.beam.hookY);
      if (cord > 2 && c.hookX != null) { try { C.drawCord(g, c.hookX, hookY, x, y, { night }); } catch (e) { /* skip */ } }
      g.save(); g.translate(x, y); g.rotate(ip(c, 'rot', a) || 0);
      try {
        C.drawChime(g, c.thing, c.size, { glow: c.glow || 0, ring: c.ring || 0, flash: c.dull ? 0 : undefined, dim: c.dim || 0,
          count: c.count == null ? -1 : c.count, clap: c.clap || 0, night, pop });
      } catch (e) { /* skip */ }
      g.restore();
    }
    _kikiFrame(mood, blink) {
      let nm = 'kiki_' + (mood || 'idle');
      if (blink && (mood === 'idle' || !mood || mood === 'talk')) nm = 'kiki_blink';
      if (this._speaking && (mood === 'idle' || mood === 'talk' || !mood) && Math.sin(this.time * 17) > -0.2) nm = 'kiki_talk';
      return CC.Assets.has(nm) ? nm : 'kiki_idle';
    }
    /** Kiki at feet (x, y), visible height h */
    _kiki(b, box, opt = {}) {
      if (!box) return;
      b = b || {};
      const nm = opt.frame || this._kikiFrame(b.mood, b.blink);
      const hop = clamp(ip(b, 'hop', 1) || 0, 0, 1);
      const k = box.h / KIKI.body, bob = Math.sin(this.time * 2.3) * 2.5 - hop * 18;
      const st = 1 + hop * 0.05;
      const g = this.g;
      g.save();
      g.translate(box.x, box.y);
      g.fillStyle = `rgba(40,35,30,${0.22 - hop * 0.08})`; g.beginPath(); g.ellipse(6 * k, -2, box.h * 0.34 * (1 - hop * 0.2), box.h * 0.05, 0, 0, TAU); g.fill();
      g.translate(0, bob); g.scale(1 / Math.sqrt(st), st);
      this._img(nm, -KIKI.ax * k, -KIKI.ay * k, KIKI.w * k, KIKI.h * k);
      g.restore();
    }
    _hedgehog(h, a) {
      if (!h) return;
      const g = this.g, x = ip(h, 'x', a), y = h.y, size = 120, k = size / HOG.w;
      if (!(x > -size && x < this.W + size)) return;
      const ball = clamp(ip(h, 'ball', a) || 0, 0, 1), walk = h.state === 'walk' || h.state === 'leave' ? Math.sin((h.step || 0) * TAU) : 0;
      g.save();
      g.fillStyle = 'rgba(40,35,30,0.18)'; g.beginPath(); g.ellipse(x, y + 1, size * 0.34, size * 0.05, 0, 0, TAU); g.fill();
      g.translate(x, y - Math.abs(walk) * 2 - (h.sniff || 0) * 2);
      if ((h.dir || 1) < 0) g.scale(-1, 1);
      if (ball > 0.5) {
        g.translate(0, -44 * k); g.rotate((ip(h, 'roll', a) || 0) * ((h.dir || 1) < 0 ? -1 : 1)); g.translate(0, 44 * k);
        this._img('hedgehog_ball', -HOG.ax * k, -HOG.ay * k, HOG.w * k, HOG.h * k);
      } else {
        g.rotate(walk * 0.05);
        this._img('hedgehog', -HOG.ax * k, -HOG.ay * k, HOG.w * k, HOG.h * k);
      }
      g.restore();
    }
    _bird(b, a) {
      if (!b) return;
      const g = this.g, x = ip(b, 'x', a), y = ip(b, 'y', a), size = 84, k = size / BIRD.w;
      if (!(x > -size && x < this.W + size)) return;
      const nm = (b.sing || 0) > 0.2 && CC.Assets.has('bird_sing') ? 'bird_sing' : 'bird';
      g.save(); g.translate(x, y - (b.hop || 0) * 14);
      if ((b.dir || -1) > 0) g.scale(-1, 1);
      if (b.state === 'fly') g.rotate(Math.sin(this.time * 18) * 0.08);
      this._img(nm, -BIRD.ax * k, -BIRD.ay * k, BIRD.w * k, BIRD.h * k);
      g.restore();
    }
    _hintHand(H, a) {
      const C = CA(); if (!H || !C) return;
      const g = this.g, al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      const x = ip(H, 'x', a), y = ip(H, 'y', a);
      g.save(); g.globalAlpha *= al; g.translate(x, y);
      try { C.drawGhostHand(g, 96, H.press != null ? H.press : 0); } catch (e) { /* skip */ }
      g.restore();
    }

    /* ---------- a small chime row (title / done): beam from x0 to x1 at y, things hanging ---------- */
    _miniRow(x0, x1, y, things, size, opt = {}) {
      const C = CA(); if (!C) return;
      const g = this.g, n = things.length, t = this.time, night = this._night;
      const hooks = things.map((_, i) => x0 + (x1 - x0) * (i + 0.5) / n);
      const L = { beam: { x0, x1, y, r: 13, hookY: y + 19 }, posts: [{ x: x0, top: y - 50, bottom: opt.ground || y + 260 }, { x: x1, top: y - 50, bottom: opt.ground || y + 260 }], hooks: hooks.map(x => ({ x, y: y + 19 })) };
      try { C.drawBeam(g, L, { t, wob: 0, night, hooks }); } catch (e) { /* skip */ }
      if (opt.lanterns) {
        const gl = { x0, x1, y: y - 44, sag: 22 }, m = opt.lanterns.length;
        const lan = opt.lanterns.map((col, i) => { const u = (i + 0.5) / m; return { x: lerp(x0, x1, u), y: gl.y + 4 * gl.sag * u * (1 - u), lit: col === undefined ? 0 : 1, color: col || null, swing: Math.sin(t * 1.4 + i) * 0.06, flash: 0 }; });
        try { C.drawGarland(g, gl, lan, { t, night }); } catch (e) { /* skip */ }
      }
      things.forEach((th, i) => {
        const cord = (opt.cords && opt.cords[i]) || 60 + (i % 2) * 30, hy = y + 19;
        const th0 = Math.sin(t * 1.7 + i * 1.3) * (opt.swing != null ? opt.swing : 0.08) + (opt.kick && opt.kick[i] ? opt.kick[i] : 0);
        const bx = hooks[i] + Math.sin(th0) * cord, by = hy + Math.cos(th0) * cord;
        try { C.drawCord(g, hooks[i], hy, bx, by, { night }); } catch (e) { /* skip */ }
        g.save(); g.translate(bx, by); g.rotate(-th0);
        const ring = opt.ring ? opt.ring(i) : 0;
        try { C.drawChime(g, th, size, { ring, night, glow: opt.glow ? opt.glow(i) : 0 }); } catch (e) { /* skip */ }
        g.restore();
      });
    }

    /* ---------- title: Kiki waving with a little bell beside a small beam with 3 chimes ---------- */
    _titleScene(w, o) {
      const W = this.W, H = this.H, L = this._L, ins = L.ins || {}, portrait = H > W, gy = L.groundY, C = CA();
      const blink = Math.sin(this.time * 1.3) > 0.985;
      let nh, px, x0, x1, by;
      if (portrait) {
        nh = Math.min(300, H * 0.22); px = (ins.left || 0) + 40 + nh * 0.42;
        x0 = px + nh * 0.55; x1 = W - (ins.right || 0) - 40; by = gy - nh - 120;
      } else {
        nh = Math.min(330, H * 0.46); px = (ins.left || 0) + 40 + nh * 0.46;
        x1 = W - (ins.right || 0) - 50; x0 = Math.max(px + nh * 0.6, x1 - clamp(W * 0.3, 270, 400)); by = gy - 330;
      }
      if (C && L.fire) { try { C.drawFire(this.g, { x: px + nh * 0.58, y: gy - 6, s: 0.8 }, { t: this.time, glow: this._amb.fire == null ? 0.5 : this._amb.fire }); } catch (e) { /* skip */ } }
      this._kiki({ blink }, { x: px, y: gy - 4, h: nh }, { frame: 'kiki_full_wave' });
      // the three chimes take turns ringing (a little demo tune)
      const beat = this.time * 1.2, cur = Math.floor(beat) % 3, ph = beat - Math.floor(beat);
      const things = [{ kind: 'bell', color: 'red' }, { kind: 'plate', shape: 'star', color: 'yellow' }, { kind: 'bell', color: 'blue' }];
      const kick = [0, 0, 0]; kick[cur] = 0.25 * Math.exp(-ph * 2.5) * Math.sin(ph * 9);
      const sz = portrait ? 96 : 100;
      this._miniRow(x0, x1, by, things, sz, { ground: gy, cords: [70, 110, 80], kick, ring: i => (i === cur ? Math.max(0, 1 - ph * 1.3) : 0),
        lanterns: ['red', 'yellow', undefined, undefined] });
    }
    /* ---------- session done: Kiki dances by the fire under a garland of every lantern lit this session ---------- */
    _doneScene(w, o) {
      const W = this.W, H = this.H, t = this.time, L = this._L, ins = L.ins || {}, portrait = H > W, gy = L.groundY, C = CA(), g = this.g;
      this._galleryT += o.dt || 0;
      const panel = o.boxes && o.boxes.done;
      if (C && L.fire) { try { C.drawFire(g, L.fire, { t, glow: 1 }); } catch (e) { /* skip */ } }
      this._kiki({ hop: Math.max(0, Math.sin(t * 5)) * 0.6 }, L.kiki, { frame: Math.sin(t * 3) > 0 ? 'kiki_dance' : 'kiki_cheer' });
      // the lantern colours of the session (one per lit note), up to 12, light up one by one along a long garland
      const cols = [];
      for (const s of this.gallery) for (const c of s.colors || []) cols.push(c || null);
      const list = cols.slice(-12); if (!list.length) list.push('red', 'yellow', 'blue');
      const x0 = (ins.left || 0) + 30, x1 = W - (ins.right || 0) - 30;
      const yTop = portrait ? (panel ? panel.y + panel.h + 70 : H * 0.55) : (ins.top || 0) + 60;
      const y = Math.min(yTop, gy - 330), n = list.length;
      const gl = { x0, x1, y, sag: 40 };
      const lan = list.map((col, i) => { const u = (i + 0.5) / n, T = this._galleryT - 0.4 - i * 0.18;
        return { x: lerp(x0, x1, u), y: y + 4 * gl.sag * u * (1 - u), lit: clamp(T / 0.3, 0, 1), color: col, swing: Math.sin(t * 1.6 + i) * 0.08, flash: T > 0 && T < 0.4 ? 1 - T / 0.4 : 0 }; });
      if (C) { try { C.drawGarland(g, gl, lan, { t, night: this._night }); } catch (e) { /* skip */ } }
      list.forEach((_, i) => { const T = this._galleryT - 0.4 - i * 0.18; if (T > 0 && T - (o.dt || 0) <= 0.02) this.burst('sparkles', lan[i].x, lan[i].y, { n: 6, color: lan[i].color }); });
      this._noteT = (this._noteT || 0) - (o.dt || 0);
      if (this._noteT <= 0) { this._noteT = 0.5; this.burst('note', x0 + Math.random() * (x1 - x0), y + 60 + Math.random() * 80); }
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((CC.CONFIG && CC.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * (H > W ? 0.4 : 0.42);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(50,35,25,.28)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#A87245'; g.beginPath(); roundRect(g, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 40); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#6E4526'; g.stroke();
      g.fillStyle = '#FFF9EE'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 30); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#D29A66'; g.stroke();
      const I = CC.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#7D6A4A', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 58, '#6E4526', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#7D6A4A', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#6E4526', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && CC.PALETTE && CC.PALETTE[c]) ? CC.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 240;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: opt.color ? colOf(opt.color) : CONF[i % CONF.length], x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, drag: 1.2, t: 0, life: 0.8 + R() * 0.5, size: 16 + R() * 14, rot: R() * TAU, vr: 3 });
        }
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
      } else if (type === 'count') {   // a big numeral floats up over the counted bells / dots
        for (const f of fx) if (f.k === 'num') f.t = Math.max(f.t, f.life * 0.85);   // the previous numeral leaves (visual P2-3)
        fx.push({ k: 'num', x, y, t: 0, life: 0.48, text: String(opt.n || '') });
      } else if (type === 'note') {    // a little music note drifting up (song cascade, done screen)
        fx.push({ k: 'p', sprite: 'note', tint: opt.color ? colOf(opt.color) : CONF[(R() * 5) | 0], x, y, vx: (R() - 0.5) * 40, vy: -70 - R() * 50, g: -10, drag: 0.4, t: 0, life: 1.4, size: 26 + R() * 10, rot: (R() - 0.5) * 0.6, vr: (R() - 0.5), sway: R() * TAU });
      } else if (type === 'puff') {
        const n = Math.round((opt.n || 7) * q);
        for (let i = 0; i < n; i++) {
          const a = (i / n) * TAU + R() * 0.4, sp = 60 + R() * 70;
          fx.push({ k: 'p', sprite: 'dust', tint: opt.color || '#FFFFFF', x, y, vx: Math.cos(a) * sp + (opt.vx || 0), vy: Math.sin(a) * sp - 30, g: -20, drag: 2, t: 0, life: 0.6 + R() * 0.3, size: 26 + R() * 18, rot: R() * TAU, vr: 1 });
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
          const al = u > 0.7 ? (1 - u) / 0.3 : 1;
          if (f.tint) this._tinted(f.sprite, f.tint, f.x, f.y, f.size, f.rot, al);
          else this._sprite(f.sprite, f.x, f.y, f.size, f.rot, al);
        } else if (f.k === 'ring') {
          g.strokeStyle = `rgba(${f.color},${0.8 * (1 - u)})`; g.lineWidth = 6 * (1 - u) + 1;
          g.beginPath(); g.arc(f.x, f.y, f.size * (0.3 + u * 0.5), 0, TAU); g.stroke();
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#6E4526', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = CC.Assets.tinted ? CC.Assets.tinted(name, color, size * this.rs) : CC.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.alpha > 0.01)) continue;
        const nm = (p.sprite || p.type) === 'star' ? 'pstar' : (p.sprite || p.type);
        const tint = p.color && TINTABLE[nm] ? p.color : null;
        if (tint) this._tinted(nm, tint, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = CC.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = CC.Assets.sprite(name, Math.max(w, h) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.kikiHit && w.kikiHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x, n.y, n.w, n.h); }
      if (L.band) { g.strokeStyle = 'rgba(255,140,0,.6)'; g.strokeRect(L.band.x, L.band.y, L.band.w, L.band.h); }
      for (const c of w.chimes || []) {
        const h = w.chimeHit && w.chimeHit(c.id); if (!h) continue;
        g.strokeStyle = 'rgba(0,160,0,.7)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with ChimeArt.drawIcon into a small canvas. */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!thing || !CA()) return;
    try { g.save(); g.translate(cw / 2, ch / 2); CA().drawIcon(g, thing, Math.min(ch, cw) * 0.94); g.restore(); } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  CC.Renderer = Renderer;
})(window.CC = window.CC || {});
