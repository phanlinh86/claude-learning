/* NK.Renderer (Nuka's Snow Dig) — draws the arctic snowfield on one canvas: the sky gradient (ambient colours that
 * crossfade spring → summer → autumn → winter), the sky aurora (code), sun / moon, clouds, far sea + mountains / mid snow
 * banks / snowy ground (tools/env_scenes.js RECIPE), the winter moonlight glow, the aurora ribbon (layout.shelf) and its
 * finds, the snow drifts with their peeking things (NK.DigArt; hole back → clipped thing → front of the drift), Nuka (mood
 * frames, blink, talk flaps, bob, hop, belly-slide), his scooping paw, flung snow, finds floating up on a sparkle trail,
 * the seal pup, the tern, the hint hand (tap or rub demo), weather particles and juice; the title and the session-done
 * party (every find of the session dancing in the aurora). Logical coordinates (short side 720) × render scale rs. */
(function (NK) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const MOODS = ['spring', 'summer', 'autumn', 'winter'];
  // tools/env_scenes.js RECIPE (SKY / GROUND_BOTTOM / FAR_ANCHOR / AURORA)
  const SKY = { spring: [[0, '#BFE3F5'], [1, '#EAF6FB']], summer: [[0, '#86CBEF'], [1, '#D4EEF8']],
    autumn: [[0, '#C6A9C4'], [0.45, '#F3C79A'], [1, '#F8E3C4']], winter: [[0, '#1E2A52'], [1, '#3B4F7E']] };
  const GROUND_BOTTOM = { spring: '#D2DFEB', summer: '#D4E1ED', autumn: '#D6DBE5', winter: '#8D9DBF' };
  const FAR_ANCHOR = { x: 268, y: 272 };
  const AURORA = {
    spring: { strength: 0.25, alpha: 0.5, blend: 'source-over', colors: ['#8FDDB8', '#86CFE0', '#B7A8E6'] },
    summer: { strength: 0.15, alpha: 0.5, blend: 'source-over', colors: ['#9BE0C0', '#8ED3E6', '#BBAEEA'] },
    autumn: { strength: 0.45, alpha: 0.55, blend: 'source-over', colors: ['#8ED8B0', '#9CC6E8', '#C2A6E2'] },
    winter: { strength: 1.0, alpha: 0.6, blend: 'lighter', colors: ['#5FE8A8', '#4FCFD6', '#9C88EE'] },
  };
  const hexA = (h, al) => { const n = parseInt(h.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${al})`; };
  const BUN = { w: 300, h: 300, ax: 150, ay: 292 };
  const ip = (o, k, a) => { const p = o['_p' + k]; return p == null || o[k] == null ? o[k] : p + (o[k] - p) * a; };
  const DA = () => NK.DigArt;

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
    const sandY = Math.round(H * (portrait ? 0.53 : 0.47));
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;         // skill rule: background layers ×1.36 on tall portrait
    const kf = 0.56 * kp, km = 0.74 * kp;
    const kg = Math.max(1, Math.min(1.8, (H - sandY) / 260 * 0.7));
    const cx = W / 2;
    // the far tile is placed so the big twin peak stands at 68 % (landscape: right of the bubble) / 30 % (portrait)
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(W * (portrait ? 0.3 : 0.68) - FAR_ANCHOR.x * kf), y: sandY - 690 * kf };
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(cx - 520 * km), y: sandY + 8 - 290 * km };
    const ground = { k: kg, w: 1200 * kg, h: 260 * kg, x0: Math.round(cx - 640 * kg), y: sandY - 30 * kg };
    ground.fillY = ground.y + 258 * kg;
    const hillTop = far.y + FAR_ANCHOR.y * kf;               // highest far-layer pixel (the twin-peak summit)
    // sun / moon: landscape → the free sky between the bubble (right edge) and the HUD; portrait → the band between the
    // aurora ribbon (layout.shelf) bottom and the peaks.
    let sun;
    if (!portrait) {
      const bx = ins.left + 24 + Math.min(560, W - ins.right - 200 - ins.left - 24), hx = W - ins.right - 160, span = hx - bx;
      const s = 140;
      sun = {
        spring: { x: bx + span * 0.2, y: ins.top + 96, size: s },          // low spring sun
        summer: { x: bx + span * 0.42, y: ins.top + 58, size: s * 0.95 },  // the midnight sun, high
        autumn: { x: bx + span * 0.86, y: ins.top + 112, size: s * 1.1 },  // low warm sun
        winter: { x: bx + span * 0.3, y: ins.top + 66, size: s * 0.9 },    // the moon
      };
    } else {
      const shelfBottom = ins.top + 110 + 124 + 14 + 92, gapMid = (shelfBottom + hillTop) / 2, s = Math.min(160, Math.max(110, hillTop - shelfBottom));
      sun = {
        spring: { x: W * 0.78, y: gapMid + 10, size: s },
        summer: { x: W * 0.72, y: gapMid - 22, size: s * 0.95 },
        autumn: { x: W * 0.84, y: gapMid + 24, size: s * 1.1 },
        winter: { x: W * 0.76, y: gapMid - 10, size: s * 0.9 },
      };
    }
    const clouds = portrait
      ? { y0: ins.top + 360, y1: Math.max(ins.top + 380, hillTop - 50), s: 0.7 }
      : { y0: ins.top + 30, y1: ins.top + 100, s: 0.6 };
    // the sky aurora band (drawn in code behind the far layer)
    const aurora = portrait
      ? { y0: ins.top + 30, y1: hillTop + 40, amp: 34 }
      : { y0: ins.top + 4, y1: hillTop + 60, amp: 22 };
    return { portrait, tall, sandY, kp, far, mid, ground, hillTop, sun, clouds, aurora, starsY1: Math.min(sandY - 60, hillTop + 40) };
  }
  /** x positions to tile a layer of width tw whose reference tile starts at x0 so that [0, W) is covered. */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this._env = null; this._envKey = ''; this.gallery = [];
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      NK.Assets.dropExact();
      this._envKey = '';
    }
    prewarm(layout, level) {   // rasterise the big tiles of a mood ahead of time
      if (layout) this._envFor(layout);
      const E = this._env; if (!E) return;
      const m = MOODS[clamp(level | 0, 0, 3)];
      for (const l of ['far', 'mid', 'ground']) this._tile(l, m);
    }
    /** the session's treasures for the party screen (main passes sessionDone.treasures) */
    setGallery(list) { this.gallery = (list || []).slice(-16).map((t, i) => ({ thing: t.thing, ph: i * 1.7 })); }
    clearGallery() { this.gallery = []; }

    /* ---------- env ---------- */
    _envFor(L) {
      const ins = (L && L.ins) || { top: 0, left: 0, right: 0, bottom: 0 };
      const key = [this.W, this.H, Math.round(ins.top), Math.round(ins.left), Math.round(ins.right)].join(',');
      if (this._envKey === key && this._env) return this._env;
      this._env = envLayout(this.W, this.H, ins);
      this._envKey = key;
      return this._env;
    }
    _tile(layer, m) {
      const E = this._env, Ly = E[layer];
      return NK.Assets.exact(layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : world.alpha;
      this._alpha = a;
      this._L = world.layout;
      const amb = weather.ambient || {};
      this._amb = amb; this._night = clamp(amb.night || 0, 0, 1);
      this._envFor(this._L);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this._backdrop(amb, weather, dt);
      this._particles(weather.particles, 'back');
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o);
      else this._game(world, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }

    /* ---------- backdrop: sky → sun / moon → clouds → smoke → far → mid → ground (+ fill); moods crossfade ---------- */
    _backdrop(amb, weather, dt) {
      const g = this.g, W = this.W, H = this.H, E = this._env;
      const to = MOODS.includes(amb.env) ? amb.env : 'spring', from = MOODS.includes(amb.envFrom) ? amb.envFrom : to;
      const mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      const sky = (m, al) => {
        const gr = g.createLinearGradient(0, 0, 0, E.sandY);
        for (const [o, c] of SKY[m]) gr.addColorStop(o, c);
        g.globalAlpha = al; g.fillStyle = gr; g.fillRect(0, 0, W, E.sandY + 2); g.globalAlpha = 1;
      };
      if (from !== to && mix < 1) { sky(from, 1); sky(to, mix); } else sky(to, 1);
      this._skyAurora(amb, from, to, mix);
      // sun and moon (sunset: a warmer sun)
      const sunA = clamp(amb.sunA == null ? 1 : amb.sunA, 0, 1), moonA = clamp(amb.moonA || 0, 0, 1);
      let sp = E.sun[to === 'winter' ? 'autumn' : to] || E.sun.summer, mp = E.sun.winter;
      const S = this._L && this._L.shelf;
      if (E.portrait && S) {   // portrait: keep the sun / moon below the aurora ribbon (visual P2-1)
        const lo = S.y + S.h + 8, fit = o => { const size = Math.max(70, Math.min(o.size, (E.hillTop + 30 - lo))); return Object.assign({}, o, { size, y: Math.max(o.y, lo + size / 2) }); };
        sp = fit(sp); mp = fit(mp);
      }
      if (sunA > 0.02) {
        const glow = g.createRadialGradient(sp.x, sp.y, sp.size * 0.2, sp.x, sp.y, sp.size * 1.2);
        const warm = to === 'autumn' ? '255,205,150' : '255,248,220';
        glow.addColorStop(0, `rgba(${warm},${0.45 * sunA})`); glow.addColorStop(1, `rgba(${warm},0)`);
        g.fillStyle = glow; g.beginPath(); g.arc(sp.x, sp.y, sp.size * 1.2, 0, TAU); g.fill();
        g.globalAlpha = sunA; this._img('sun', sp.x - sp.size / 2, sp.y - sp.size / 2, sp.size, sp.size); g.globalAlpha = 1;
      }
      if (moonA > 0.02) { g.globalAlpha = moonA; this._img('moon', mp.x - mp.size / 2, mp.y - mp.size / 2, mp.size, mp.size); g.globalAlpha = 1; }
      for (const c of weather.clouds || []) {
        if (!(c.alpha > 0.01)) continue;
        const w = 300 * (c.s || 0.6), h = 140 * (c.s || 0.6);
        g.save(); g.globalAlpha = c.alpha; g.translate(c.x, c.y); if (c.flipX) g.scale(-1, 1);
        this._img(c.type || 'cloud_a', -w / 2, -h / 2, w, h); g.restore();
      }
      const stack = (m, al) => {
        if (al <= 0.01) return;
        g.save(); g.globalAlpha = al;
        for (const l of ['far', 'mid', 'ground']) {
          const t = this._tile(l, m), Ly = E[l]; if (!t) continue;
          for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
        }
        if (E.ground.fillY < H) { g.fillStyle = GROUND_BOTTOM[m]; g.fillRect(0, E.ground.fillY - 0.5, W, H - E.ground.fillY + 0.5); }
        g.restore();
      };
      if (from !== to && mix < 1) { stack(from, 1); stack(to, mix); } else stack(to, 1);
      if (amb.tint) { g.fillStyle = typeof amb.tint === 'string' ? amb.tint : `rgba(${amb.tint.join(',')})`; g.fillRect(0, 0, W, H); }
      // morning mist along the horizon
      const mist = clamp(amb.mist || 0, 0, 1);
      if (mist > 0.02) {
        const mg = g.createLinearGradient(0, E.sandY - 90, 0, E.sandY + 40);
        mg.addColorStop(0, 'rgba(255,255,255,0)'); mg.addColorStop(0.6, `rgba(255,252,240,${0.35 * mist})`); mg.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = mg; g.fillRect(0, E.sandY - 90, W, 130);
      }
    }

    /** the sky aurora: two wavy ribbons of vertical curtain strips behind the mountains (stronger in winter) */
    _skyAurora(amb, from, to, mix) {
      const g = this.g, E = this._env, A = E.aurora, W = this.W; if (!A) return;
      const amt = clamp(amb.aurora == null ? AURORA[to].strength : amb.aurora, 0, 1);
      if (amt < 0.03) return;
      const aur = AURORA[to], cols = aur.colors, t = this.time, step = this.quality < 0.8 ? 10 : 6;
      g.save(); g.globalCompositeOperation = aur.blend;
      for (let rb = 0; rb < 2; rb++) {
        const yc = A.y0 + (A.y1 - A.y0) * (rb ? 0.55 : 0.32), hgt = (A.y1 - A.y0) * (rb ? 0.5 : 0.42);
        for (let x = -20; x < W + 20; x += step) {
          const u = x / W, ph = t * (rb ? 0.13 : 0.09);
          const wv = Math.sin(u * 6.3 + rb * 2 + ph * 4) * A.amp + Math.sin(u * 15 + rb + ph * 7) * A.amp * 0.35;
          const y = yc + wv, k = 0.55 + 0.45 * Math.sin(u * 9 + rb * 3 + ph * 5) * Math.sin(u * 3.1 + 1 - ph * 3);
          const ci = (u * 2 + rb * 0.7) % 2, col = ci < 1 ? cols[0] : cols[2], col2 = cols[1];
          const al = aur.alpha * amt * Math.max(0.15, k) * (rb ? 0.7 : 1);
          const lgr = g.createLinearGradient(0, y - hgt / 2, 0, y + hgt / 2);
          lgr.addColorStop(0, hexA(col, 0)); lgr.addColorStop(0.35, hexA(col, al * 0.6)); lgr.addColorStop(0.7, hexA(col2, al)); lgr.addColorStop(1, hexA(col2, 0));
          g.fillStyle = lgr; g.fillRect(x, y - hgt / 2, step, hgt);   // no overlap: additive overlaps striped (visual P2-5)
        }
      }
      g.restore();
    }
    /* ---------- the round ---------- */
    _game(w, o, a) {
      const L = this._L, night = this._night;
      this._shelf(w, a);
      const ms = (w.mounds || []).slice().sort((p, q) => p.y - q.y);
      // mounds behind Bun's row first, then Bun, then the rest (Bun stands at the front-left)
      const bunY = L.bun ? L.bun.y : L.groundY;
      for (const m of ms) if (m.y < bunY - 40) this._mound(m, a, night);
      this._seal(w.seal, a);
      const sliding = w.bun && w.bun.slide > 0;   // the belly-slide passes IN FRONT of the front row (visual / playtest P2)
      if (!sliding) this._bun(w.bun, L.bun);
      for (const m of ms) if (!(m.y < bunY - 40)) this._mound(m, a, night);
      for (const m of ms) this._riseOver(m, a, night);
      if (sliding) this._bun(w.bun, L.bun);
      this._lantern();
      this._sand(w.sand, a, night);
      this._shovel(w.shovel, a, night);
      this._trails(w.flying, a);
      this._flying(w.flying, a, night);
      this._tern(w.tern, a);
      this._hintHand(w.hintHand);
    }
    /** winter: a soft cool moonlight glow over the drift field so the bluish snow stays readable */
    _lantern() {
      const g = this.g, n = this._night, L = this._L;
      if (n <= 0.02 || !L || !L.field) return;
      const W = this.W, H = this.H, cx = W * 0.58, cy = H * 0.8, r = Math.max(W, H) * 0.55;
      g.save(); g.globalCompositeOperation = 'lighter';
      const lg = g.createRadialGradient(cx, cy, 20, cx, cy, r);
      lg.addColorStop(0, `rgba(205,222,255,${0.22 * n})`); lg.addColorStop(0.65, `rgba(180,200,240,${0.08 * n})`); lg.addColorStop(1, 'rgba(180,200,240,0)');
      g.fillStyle = lg; g.fillRect(0, 0, W, H);
      g.restore();
    }
    _thing(thing, _unused, size, opt) {   // origin = bottom centre
      if (thing && DA()) { try { DA().drawThing(this.g, thing, size, Object.assign({ time: this.time }, opt || {})); } catch (e) { /* skip */ } }
    }
    _mound(m, a, night) {
      if (!DA()) return;
      const g = this.g, pop = ip(m, 'pop', a); if (!(pop > 0.01)) return;
      const dig = clamp(ip(m, 'dig', a) || 0, 0, 1), wob = ip(m, 'wob', a) || 0;
      const M = { x: m.x, y: m.y, w: m.w, h0: m.h0, dig };
      const opt = { glow: m.glow || 0, wob: 0, pop: 1, night, sparkle: m.sparkle || 0, time: this.time };
      g.save(); g.translate(m.x + wob, m.y); g.scale(pop, pop);
      M.x = 0; M.y = 0;
      try { if (dig > 0.3) DA().drawHoleBack(g, M, opt); } catch (e) { /* skip */ }
      const rise = ip(m, 'rise', a) || 0;
      if (m.state !== 'empty' && m.thing) {
        const clipY = (ip(m, 'clipY', a) - m.y);
        g.save(); g.beginPath(); g.rect(-m.w * 2, -2000, m.w * 4, 2000 + clipY); g.clip();
        this._thingAt(m, a, night, true);
        g.restore();
      }
      try { DA().drawMound(g, M, opt); } catch (e) { /* skip */ }
      g.restore();
      m._drawRise = rise;
    }
    _thingAt(m, a, night, local) {   // the mound's thing (or hatchling) with its squash / tilt / wiggle
      const g = this.g, ty = ip(m, 'thingY', a) - m.y, tw = ip(m, 'twob', a) || 0, tr = ip(m, 'trot', a) || 0;
      const sx = ip(m, 'tsx', a) || 1, sy = ip(m, 'tsy', a) || 1;
      g.save();
      if (!local) { g.translate(m.x + (ip(m, 'wob', a) || 0), m.y); const p = ip(m, 'pop', a) || 1; g.scale(p, p); }
      g.translate(tw, ty); if (tr) g.rotate(tr); g.scale(sx, sy);
      this._thing(m.thing, null, m.size, { glow: m.glow || 0, dim: m.dim || 0, night });
      g.restore();
    }
    _riseOver(m, a, night) { if (m.state !== 'empty' && m.thing && (ip(m, 'rise', a) || 0) > 0.6) this._thingAt(m, a, night, false); }
    _shelf(w, a) {
      const L = this._L, S = L.shelf; if (!S || !DA()) return;
      const g = this.g;
      try { const au = w.aurora || {}; DA().drawShelf(g, S, { night: this._night, slots: true, t: this.time, n: au.n || 0, ripple: au.ripple || 0, glow: au.glow || 0 }); } catch (e) { /* skip */ }
      for (const it of w.shelfItems || []) {
        const al = it.alpha == null ? 1 : it.alpha; if (al <= 0.01) continue;
        g.save(); g.globalAlpha = al; g.translate(ip(it, 'x', a), ip(it, 'y', a) + (it.dy || 0) + Math.sin(this.time * 1.6 + (it.slot || 0)) * 3); g.scale(it.sx || 1, it.sy || 1);
        this._thing(it.thing, null, it.s || S.size || 64, { night: this._night * 0.6, shadow: true });
        g.restore();
      }
    }
    _bunFrame(mood, blink) {
      let nm = 'nuka_' + (mood || 'idle');
      if (blink && (mood === 'idle' || !mood)) nm = 'nuka_blink';
      if (this._speaking && (mood === 'idle' || mood === 'talk' || !mood) && Math.sin(this.time * 17) > -0.2) nm = 'nuka_talk';
      return NK.Assets.has(nm) ? nm : 'nuka_idle';
    }
    /** Bun at feet (x, y), height h */
    _bun(b, box, opt = {}) {
      if (!box) return;
      b = b || {};
      const sliding = !opt.frame && b.mood === 'slide';
      const nm = opt.frame || this._bunFrame(b.mood, b.blink);
      const hop = clamp(b._phop != null ? lerp(b._phop, b.hop || 0, 1) : (b.hop || 0), 0, 1);
      const k = box.h / BUN.h, bob = (sliding ? 0 : Math.sin(this.time * 2.1) * 2.5) - hop * 18, lean = clamp(b.look || 0, -1, 1) * 0.025;
      const st = 1 + hop * 0.05;
      const g = this.g;
      const sx = b.slideX != null ? (b._pslideX != null ? lerp(b._pslideX, b.slideX, this._alpha == null ? 1 : this._alpha) : b.slideX) : 0;
      g.save();
      g.translate(box.x + sx, box.y);
      g.fillStyle = `rgba(40,60,90,${0.2 - hop * 0.08})`; g.beginPath(); g.ellipse(0, -2, box.h * 0.28 * (1 - hop * 0.2), box.h * 0.045, 0, 0, TAU); g.fill();
      g.rotate(lean);
      g.translate(0, bob); g.scale(1 / Math.sqrt(st), st);
      if (opt.flip || (sliding && (b.slideDir || 1) < 0)) g.scale(-1, 1);
      this._img(nm, -BUN.ax * k, -BUN.ay * k, BUN.w * k, BUN.h * k);
      g.restore();
    }
    _shovel(S, a, night) {
      if (!S || S.state === 'off' || !DA()) return;
      const al = S.alpha == null ? 1 : S.alpha; if (al <= 0.01) return;
      const g = this.g;
      g.save(); g.globalAlpha = al; g.translate(ip(S, 'x', a), ip(S, 'y', a));
      try { DA().drawShovel(g, ip(S, 'angle', a) || 0, S.size || 118, { sand: S.sand || 0, night }); } catch (e) { /* skip */ }
      g.restore();
    }
    _sand(list, a, night) {
      if (!list || !DA()) return;
      const g = this.g;
      for (const s of list) {
        if (!(s.alpha > 0.01)) continue;
        g.save(); g.globalAlpha = s.alpha; g.translate(ip(s, 'x', a), ip(s, 'y', a));
        try { DA().drawSandBit(g, s.r, ip(s, 'rot', a) || 0, { night }); } catch (e) { /* skip */ }
        g.restore();
      }
    }
    /** sparkle trails behind finds floating up to the aurora */
    _trails(list, a) {
      if (!list) return;
      const g = this.g;
      g.save(); g.globalCompositeOperation = 'lighter';
      for (const f of list) {
        const tr = f.trail || []; const n = tr.length;
        for (let i = 0; i < n; i++) {
          const p = tr[i], u = (i + 1) / n, r = 3 + 9 * u;
          const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 2);
          gr.addColorStop(0, `rgba(255,255,240,${0.55 * u})`); gr.addColorStop(0.5, `rgba(150,240,210,${0.3 * u})`); gr.addColorStop(1, 'rgba(150,240,210,0)');
          g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, r * 2, 0, TAU); g.fill();
        }
      }
      g.restore();
    }
    _flying(list, a, night) {
      if (!list) return;
      const g = this.g;
      for (const f of list) {
        g.save(); g.translate(ip(f, 'x', a), ip(f, 'y', a)); g.rotate(ip(f, 'rot', a) || 0); g.scale(f.sx || 1, f.sy || 1);
        this._thing(f.thing, null, ip(f, 's', a) || 64, { night: night * 0.6, glow: 0.4 });
        g.restore();
      }
    }
    _seal(m, a) {
      if (!m) return;
      const g = this.g, up = clamp(ip(m, 'up', a) || 0, 0, 1.2); if (up <= 0.01) return;
      const h = m.h || 110, k = h / 140, w = 160 * k;
      const nm = m.state === 'happy' && NK.Assets.has('seal_happy') ? 'seal_happy' : 'seal';
      g.save();
      g.beginPath(); g.rect(m.x - w, m.y - h * 2, w * 2, h * 2 + 2); g.clip();
      g.translate(m.x, m.y + (1 - up) * h); g.rotate(ip(m, 'spin', a) || 0); g.scale(m.sx || 1, m.sy || 1);
      this._img(nm, -80 * k, -136 * k, w, h);
      g.restore();
    }
    _tern(p, a) {
      if (!p || p.state === 'gone') return;
      const g = this.g, x = ip(p, 'x', a), y = ip(p, 'y', a), size = p.size || 150, k = size / 200;
      if (!(x > -size && x < this.W + size)) return;
      const nm = (p.flap || 0) >= 0.5 && NK.Assets.has('tern_flap') ? 'tern_flap' : 'tern';
      g.save(); g.translate(x, y); g.rotate(ip(p, 'rot', a) || 0);
      if ((p.dir || 1) < 0) g.scale(-1, 1);
      this._img(nm, -100 * k, -70 * k, 200 * k, 140 * k);
      g.restore();
    }
    _hintHand(H) {
      if (!H || !DA()) return;
      const g = this.g, al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      g.save(); g.globalAlpha *= al; g.translate(H.x, H.y);
      try { DA().drawGhostHand(g, 130, H.press != null ? H.press : (this.time % 1), { rub: !!H.rub }); } catch (e) { /* skip */ }
      g.restore();
    }

    /* ---------- title: Nuka waving with a snowball beside a dug drift with a red hat ---------- */
    _titleProps(x, y, s) {   // a dug drift with a red hat bobbing out, a star gem and a fish beside; origin = drift bottom centre
      const g = this.g, night = this._night;
      const M = { x: 0, y: 0, w: 1.55 * 112 * s, h0: 0.62 * 112 * s, dig: 1 };
      g.save(); g.translate(x, y);
      if (DA()) { try { DA().drawHoleBack(g, M, { night }); DA().drawMound(g, M, { night }); } catch (e) { /* skip */ } }
      const hop = Math.abs(Math.sin(this.time * 2.4)) * 16 * s;
      g.save(); g.translate(M.w * 0.02, -0.12 * M.h0 - hop); g.rotate(Math.sin(this.time * 2.4) * 0.12); this._thing({ kind: 'hat', color: 'red' }, null, 110 * s, { night }); g.restore();
      g.save(); g.translate(-M.w * 0.85, 0); g.rotate(-0.08); this._thing({ kind: 'gem', shape: 'star', color: 'yellow' }, null, 76 * s, { night }); g.restore();
      g.save(); g.translate(-M.w * 1.35, 0); this._thing({ kind: 'fish' }, null, 70 * s, { night }); g.restore();
      g.restore();
    }
    _titleScene(w, o) {
      const W = this.W, H = this.H, L = this._L, ins = L.ins || {}, portrait = H > W;
      const gy = L.groundY;
      if (portrait) {
        const nh = Math.min(330, H * 0.24);
        this._bun({ blink: Math.sin(this.time * 1.3) > 0.985 }, { x: (ins.left || 0) + 40 + nh * 0.36, y: gy - 4, h: nh }, { frame: 'nuka_full_wave' });
        this._titleProps(W - (ins.right || 0) - 140, gy - 20, 1.1);
      } else {
        const nh = Math.min(330, H * 0.46);
        this._bun({ blink: Math.sin(this.time * 1.3) > 0.985 }, { x: (ins.left || 0) + 30 + nh * 0.42, y: gy - 4, h: nh }, { frame: 'nuka_full_wave' });
        this._titleProps(W - (ins.right || 0) - 150, gy - 20, clamp(W / 1300, 0.85, 1.15));
      }
      this._sparkT = (this._sparkT || 0) - (o.dt || 0);
      if (this._sparkT <= 0) { this._sparkT = 1.1; this.burst('sparkles', W - (ins.right || 0) - 150 + (Math.random() - 0.5) * 120, gy - 140, { n: 4 }); }
    }
    /* ---------- session done: the session's treasures dancing around a cheering Bun ---------- */
    _doneScene(w, o) {
      const W = this.W, H = this.H, t = this.time, L = this._L, ins = L.ins || {}, portrait = H > W, gy = L.groundY;
      const panel = o.boxes && o.boxes.done;
      const fx0 = (ins.left || 0) + 16, fx1 = portrait ? W - (ins.right || 0) - 16 : (panel ? panel.x - 16 : W * 0.58);
      const fy0 = portrait ? (panel ? panel.y + panel.h + 16 : H * 0.4) : (ins.top || 0) + 20, fy1 = gy;
      let items = this.gallery.length ? this.gallery : [{ thing: { kind: 'hat', color: 'red' }, ph: 0 }, { thing: { kind: 'toy', animal: 'fox' }, ph: 1 }, { thing: { kind: 'gem', shape: 'star', color: 'yellow' }, ph: 2 }];
      const nh = clamp((fy1 - fy0) * (portrait ? 0.42 : 0.55), 150, 300);
      const cx = (fx0 + fx1) / 2, by = fy1 - 4;
      this._bun({ blink: false }, { x: cx, y: by, h: nh }, { frame: Math.sin(t * 3) > 0 ? 'nuka_cheer' : 'nuka_happy' });
      // treasures on an ellipse around Bun, hopping in a wave
      const n = items.length, rx = Math.min((fx1 - fx0) / 2 - 50, nh * 1.25), ry = Math.min(nh * 0.55, (fy1 - fy0) / 2 - 40);
      const ccy = by - nh * 0.55, size = clamp(Math.min(90, (2 * Math.PI * rx) / Math.max(4, n) * 0.8), 46, 90);
      items.forEach((it, i) => {
        const ang = Math.PI + (i / Math.max(1, n - 1 || 1)) * Math.PI + (n === 1 ? -Math.PI / 2 : 0);
        const ang2 = n > 1 ? Math.PI * (1 + i / (n - 1)) : -Math.PI / 2;
        const x = cx + Math.cos(ang2) * rx, y = ccy + Math.sin(ang2) * ry + size * 0.5;
        const hop = Math.max(0, Math.sin(t * 4 - i * 0.6)) * 22;
        void ang;
        this.g.save(); this.g.translate(x, y - hop); this.g.rotate(Math.sin(t * 2 + i) * 0.12);
        this._thing(it.thing, null, size, { shadow: true, glow: 0.3 });
        this.g.restore();
      });
      this._noteT = (this._noteT || 0) - (o.dt || 0);
      if (this._noteT <= 0) { this._noteT = 0.5; this.burst('sparkles', fx0 + Math.random() * (fx1 - fx0), fy0 + Math.random() * (gy - fy0) * 0.6, { n: 8 }); }
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((NK.CONFIG && NK.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = W / 2, cy = H * (H > W ? 0.4 : 0.42);
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(30,50,80,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#F7FBFF'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 34); g.fill();
      g.lineWidth = 5; g.strokeStyle = '#9DBCD6'; g.stroke();
      const I = NK.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#4E6E8E', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 58, '#2D5C8A', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#4E6E8E', null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, '#2D5C8A', '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && NK.PALETTE && NK.PALETTE[c]) ? NK.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
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
      } else if (type === 'count') {   // a big numeral floats up over the found fish
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
          outlinedText(g, f.text, 0, 0, 84, '#FFFFFF', '#2D5C8A', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = NK.Assets.tinted ? NK.Assets.tinted(name, color, size * this.rs) : NK.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    _particles(list, layer) {
      if (!list) return;
      for (const p of list) {
        if ((p.layer || 'back') !== layer || !(p.alpha > 0.01)) continue;
        const nm = (p.sprite || p.type) === 'star' ? 'pstar' : (p.sprite || p.type);
        const tint = p.color && (nm === 'dot' || nm === 'confetti_a' || nm === 'confetti_b') ? p.color : null;
        if (tint) this._tinted(nm, tint, p.x, p.y, p.size, p.rot || 0, p.alpha);
        else this._sprite(nm, p.x, p.y, p.size, p.rot || 0, p.alpha, null, p.flipX);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = NK.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = NK.Assets.sprite(name, Math.max(w, h) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.bunHit && w.bunHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h); }
      for (const m of w.mounds || []) {
        const c = w.moundHit && w.moundHit(m.id); if (!c) continue;
        g.strokeStyle = 'rgba(0,160,0,.7)'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.stroke();
      }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with DigArt.drawIcon into a small canvas. */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!thing || !DA()) return;
    try {
      g.save(); g.translate(cw / 2, ch / 2);
      DA().drawIcon(g, thing, Math.min(ch, cw) * 0.96);
      g.restore();
    } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  NK.Renderer = Renderer;
})(window.NK = window.NK || {});
