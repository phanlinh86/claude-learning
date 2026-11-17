/* TL.Renderer (Tibo's Dino Lake Fishing) — draws the dinosaur-valley lake and the fishing on one canvas (DESIGN §7,
 * MECHANICS §6). Order: sky → stars → sun / moon → clouds → volcano smoke → far → mid → mist → reeds → (background tint) →
 * water (FishArt.drawWater) → lake bed → weed → water particles + air bubbles → fish under water (by lane, the reeled one
 * last) → ripples → lilies (+ frog) → surface front → surface particles → bronto → rock → Tibo → rod + line + hook → fish
 * above water → splashes → home badge → back particles → pterosaur → fireflies → hint hand → soft-tap sparkles → front
 * particles → fx → chapter banner. Every moving world value is interpolated with world.alpha (`_p` twins).
 * The environment follows tools/env_scenes.js RECIPE: envLayout / tileXs and the tables are pasted verbatim below.
 * Title: Tibo waving on his rock with a little fish on his line, three fish swimming by.
 * Session done: the lilies of the session bloom across the lake, fish leap in a fountain, Tibo cheers, confetti.
 * Logical coordinates (short side 720) × render scale rs = device pixels. */
(function (TL) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];

  /* ---------- RECIPE tables (tools/env_scenes.js + tools/art_env.js), verbatim ---------- */
  const MOODS = ['morning', 'noon', 'sunset', 'night'];
  const SKY = { morning: ['#BFE6F2', '#DDEDE6', '#FBE9C9'], noon: ['#8FD0F0', '#B8E3F4', '#E6F6FA'], sunset: ['#F6B48A', '#F8C9A0', '#FBE3B8'], night: ['#1E2A55', '#2C3A6A', '#3B4C7E'] };
  const FAR_K = { landscape: 1.0, portrait: 0.85 };
  const MID_K = { landscape: 0.82, portrait: 1.0 };
  const REED_K = { landscape: 0.78, portrait: 0.62 };
  const WEED_K = { landscape: 0.7, portrait: 0.8 };
  const BED_TOP = 52;
  const SUN = {
    morning: { landscape: { fx: 0.64, fy: 0.42 }, portrait: { fx: 0.86, fy: 0.3 }, a: 1 },
    noon: { landscape: { fx: 0.76, fy: 0.3 }, portrait: { fx: 0.84, fy: 0.16 }, a: 1 },
    sunset: { landscape: { fx: 0.7, fy: 0.42 }, portrait: { fx: 0.78, fy: 0.37 }, a: 1 },
    night: { landscape: { fx: 0.84, fy: 0.74 }, portrait: { fx: 0.88, fy: 0.62 }, a: 0 },
  };
  const MOON = {
    morning: { landscape: { fx: 0.8, fy: 0.3 }, portrait: { fx: 0.8, fy: 0.25 }, a: 0 },
    noon: { landscape: { fx: 0.8, fy: 0.3 }, portrait: { fx: 0.8, fy: 0.25 }, a: 0 },
    sunset: { landscape: { fx: 0.46, fy: 0.2 }, portrait: { fx: 0.4, fy: 0.14 }, a: 0 },
    night: { landscape: { fx: 0.78, fy: 0.3 }, portrait: { fx: 0.8, fy: 0.22 }, a: 1 },
  };
  const SUN_SIZE = { landscape: 140, portrait: 110 };
  const CLOUDS = {
    morning: { n: 3, alpha: 0.85, tint: 'rgba(255,240,222,0.25)' },
    noon: { n: 4, alpha: 0.95, tint: null },
    sunset: { n: 3, alpha: 0.9, tint: 'rgba(246,170,130,0.35)' },
    night: { n: 2, alpha: 0.4, tint: 'rgba(70,86,140,0.6)' },
  };
  const SMOKE_TINT = { morning: 'rgba(255,246,236,0.0)', noon: 'rgba(255,255,255,0)', sunset: 'rgba(250,200,170,0.4)', night: 'rgba(120,134,176,0.55)' };
  const MIST = { morning: { a: 0.55, col: '#FFF6EA' }, noon: { a: 0, col: '#FFFFFF' }, sunset: { a: 0.3, col: '#FBDCBE' }, night: { a: 0.22, col: '#9DB0DA' } };
  const PROP_TINT = { morning: 'rgba(255,240,216,0.08)', noon: null, sunset: 'rgba(231,150,120,0.2)', night: 'rgba(30,42,88,0.46)' };
  const WEED_TINT = { morning: 'rgba(95,175,180,0.22)', noon: 'rgba(78,159,176,0.22)', sunset: 'rgba(110,140,154,0.28)', night: 'rgba(34,52,79,0.5)' };
  const ROCK_UNDER = { morning: 'rgba(95,175,180,0.32)', noon: 'rgba(78,159,176,0.32)', sunset: 'rgba(110,140,154,0.36)', night: 'rgba(34,52,79,0.42)' };

  /* ---------- RECIPE functions: pasted from tools/env_scenes.js (pure) ---------- */
  function tileXs(x0, tw, W) { const out = []; let x = x0 - Math.ceil((x0 + 0.01) / tw) * tw; for (; x < W; x += tw) out.push(x); return out; }
  function envLayout(lay, mood) {
    const W = lay.W, H = lay.H, ins = lay.ins || { top: 0, left: 0, right: 0, bottom: 0 }, sY = lay.surfaceY;
    const portrait = lay.portrait != null ? lay.portrait : H > W, tall = lay.tall != null ? lay.tall : H / W > 1.6;
    const o = portrait ? 'portrait' : 'landscape', cw = W - ins.left - ins.right;
    const kp = portrait ? (tall ? 1.36 : 1.15) : 1;
    const kf = FAR_K[o] * kp;
    const bubR = lay.bubble ? lay.bubble.x + lay.bubble.w : 0;
    const vX = portrait ? W * 0.62 : Math.min(940 * kf - 20, Math.max(W * 0.56, bubR + 150));
    const far = { k: kf, w: 1200 * kf, h: 720 * kf, x0: Math.round(vX - 760 * kf), y: sY - 720 * kf };
    const craters = tileXs(far.x0, far.w, W).map(x => ({ x: x + 760 * kf, y: far.y + 505 * kf })).filter(c => c.x > -80 && c.x < W + 80);
    const km = MID_K[o] * kp;
    const mid = { k: km, w: 1200 * km, h: 300 * km, x0: Math.round(W * (portrait ? 0.3 : 0.36) - 260 * km), y: sY - 300 * km };
    const bed = { k: kp, w: 1200 * kp, h: 200 * kp, x0: Math.round(-90 * kp), y: H - 200 * kp };
    const kr = REED_K[o] * kp, rw = 200 * kr, rh = 260 * kr, ry = sY + 4 - rh;
    const reeds = [{ x: ins.left - rw * 0.22, y: ry, w: rw, h: rh, flip: false },
      { x: W - ins.right - rw * 0.8, y: ry + 6 * kr, w: rw, h: rh, flip: true }];
    const rk = (lay.rock && lay.rock.w ? lay.rock.w : (portrait ? 270 : 300)) / 320;
    const rock = { k: rk, x: lay.tibo.x - 150 * rk, y: lay.tibo.y - 70 * rk, w: 320 * rk, h: 260 * rk, waterY: sY };
    const kw = WEED_K[o] * kp, n = Math.max(3, Math.round(W / 230)), weeds = [];
    for (let i = 0; i < n; i++) {
      const x = (i + 0.5) * W / n + (i % 2 ? 26 : -18) * kp;
      const s = kw * (0.75 + 0.5 * ((i * 0.618) % 1));
      weeds.push({ x: x - 40 * s, y: bed.y + (BED_TOP + 38) * kp - 200 * s, w: 80 * s, h: 200 * s, phase: i * 1.7 });
    }
    const yTop = portrait && lay.bubble ? lay.bubble.y + lay.bubble.h : ins.top;
    const pos = (t) => ({ x: Math.round(ins.left + t[o].fx * cw), y: Math.round(yTop + t[o].fy * (sY - yTop)), size: Math.round(SUN_SIZE[o] * (portrait ? kp : 1)), a: t.a });
    const m = mood || 'morning';
    const sun = pos(SUN[m]), moon = pos(MOON[m]);
    for (const b of [sun, moon]) for (const c of craters) if (Math.abs(b.x - c.x) < 150 && b.y < c.y + 40) b.x = Math.round(c.x + 170 + b.size * 0.3 < W - ins.right ? c.x + 170 : c.x - 170);
    const clouds = portrait
      ? { y0: yTop + 30, y1: yTop + 0.38 * (sY - yTop), s: 0.5 * kp }
      : { y0: ins.top + 40, y1: Math.max(ins.top + 60, sY * 0.42), s: 0.6 };
    const mist = { y0: sY - 80 * kp, y1: sY + 16 };
    return { portrait, tall, kp, sky: { y0: 0, y1: sY }, far, craters, mid, bed, reeds, rock, weeds, sun, moon, clouds, mist };
  }

  /* ---------- character art metrics (docs/art/tibo_bbox.json, DESIGN §4.1) ---------- */
  const TIBO = { box: 300, ax: 150, ay: 292 };
  const CRIT = {
    ptero: { w: 200, h: 140, ax: 100, ay: 70, draw: 150 },
    bronto: { w: 260, h: 300, ax: 130, ay: 296 },
    frog: { w: 120, h: 100, ax: 60, ay: 96 },
    firefly: { w: 48, h: 48, ax: 24, ay: 24 },
  };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const FA = () => TL.FishArt;
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, sparkle: 1, pstar: 1, petal: 1, star: 1, glint: 1 };

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
      this._env = {}; this._envKey = {}; this.gallery = []; this._galleryT = 0; this._off = {}; this._smoke = [];
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      TL.Assets.dropExact();
      this._envKey = {}; this._env = {}; this._off = {};
    }
    prewarm(layout, level) {
      if (!layout) return;
      const m = MOODS[clamp(level | 0, 0, 3) % 4];
      this._envFor(layout, m);
      for (const l of ['far', 'mid', 'bed']) this._tile(l, m);
    }
    setGallery(list) { this.gallery = (list || []).slice(-16); this._galleryT = 0; }
    clearGallery() { this.gallery = []; }

    /* ---------- env ---------- */
    _envFor(L, m) {
      const ins = L.ins || {};
      const key = [this.W, this.H, Math.round(ins.top || 0), Math.round(ins.left || 0), Math.round(ins.right || 0), Math.round(ins.bottom || 0),
        Math.round(L.surfaceY), Math.round(L.tibo.x), Math.round(L.tibo.y), L.bubble ? Math.round(L.bubble.x + L.bubble.w) : 0].join(',');
      if (this._envKey[m] === key && this._env[m]) return this._env[m];
      this._env[m] = envLayout(L, m); this._envKey[m] = key;
      return this._env[m];
    }
    _tile(layer, m) {
      const Ly = this._env[m][layer];
      return TL.Assets.exact('env/' + layer + '_' + m, Math.max(1, Math.round(Ly.w * this.rs)), Math.max(1, Math.round(Ly.h * this.rs)));
    }
    _tintedImg(name, tint, w, h, under) {
      const key = 'tint' + name + tint + (under || '') + Math.round(w) + 'x' + Math.round(h);
      if (this._off[key]) return this._off[key];
      const base = TL.Assets.sprite(name, Math.max(w, h) * this.rs * 1.05);
      if (!base) return null;
      const c = TL.Assets.makeCanvas(base.width, base.height), x = c.getContext('2d');
      x.drawImage(base, 0, 0);
      x.globalCompositeOperation = 'source-atop';
      if (tint) { x.fillStyle = tint; x.fillRect(0, 0, c.width, c.height); }
      if (under) { x.fillStyle = under.col; const y0 = c.height * under.from; x.fillRect(0, y0, c.width, c.height - y0); }
      this._off[key] = c;
      return c;
    }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : clamp(world.alpha, 0, 1);
      const L = this._L = world.layout;
      if (!L) return;
      const amb = weather.ambient || {};
      this._amb = amb;
      this._to = MOODS.includes(amb.env) ? amb.env : (MOODS.includes(amb.mood) ? amb.mood : 'morning');
      this._from = MOODS.includes(amb.envFrom) ? amb.envFrom : this._to;
      this._mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      this._night = clamp(amb.night || 0, 0, 1);
      this._E = this._envFor(L, this._to);
      if (this._from !== this._to) this._envFor(L, this._from);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      this._backdrop(amb, weather);
      this._lake(world, weather, o, a);
      if (o.title) this._titleScene(world, o);
      else if (o.done) this._doneScene(world, o, weather);
      else this._game(world, weather, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) this._banner(world);
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fading() { return this._from !== this._to && this._mix < 1; }
    _moods(fn) { if (this._fading()) { fn(this._from, 1); fn(this._to, this._mix); } else fn(this._to, 1); }

    /* ---------- backdrop: sky → stars → sun / moon → clouds → smoke → far → mid → mist → reeds → tint ---------- */
    _backdrop(amb, weather) {
      const g = this.g, W = this.W, L = this._L, E = this._E, sY = L.surfaceY;
      const sk = SKY[this._to];
      const gr = g.createLinearGradient(0, 0, 0, sY);
      gr.addColorStop(0, amb.skyTop || sk[0]); gr.addColorStop(0.55, amb.skyMid || sk[1]); gr.addColorStop(1, amb.skyBottom || sk[2]);
      g.fillStyle = gr; g.fillRect(0, 0, W, sY + 4);
      this._particles(weather.particles, 'sky');
      // sun / moon (the weather crossfades their alpha; the RECIPE gives their place)
      const body = (nm, p, al) => {
        if (!(al > 0.02)) return;
        const pulse = 1 + 0.02 * Math.sin(this.time * 0.8), s = p.size * pulse;
        const glow = g.createRadialGradient(p.x, p.y, s * 0.2, p.x, p.y, s * 1.3);
        const c = nm === 'sun' ? '255,250,226' : '220,230,255';
        glow.addColorStop(0, `rgba(${c},${(0.45 * al).toFixed(3)})`); glow.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = glow; g.beginPath(); g.arc(p.x, p.y, s * 1.3, 0, TAU); g.fill();
        g.globalAlpha = al; this._img('env/' + nm, p.x - s / 2, p.y - s / 2, s, s); g.globalAlpha = 1;
      };
      const sunA = amb.sunA == null ? SUN[this._to].a : clamp(amb.sunA, 0, 1), moonA = amb.moonA == null ? MOON[this._to].a : clamp(amb.moonA, 0, 1);
      const sp = this._fading() ? { x: lerp(this._env[this._from].sun.x, E.sun.x, this._mix), y: lerp(this._env[this._from].sun.y, E.sun.y, this._mix), size: E.sun.size } : E.sun;
      body('sun', sp, sunA);
      body('moon', E.moon, moonA);
      // clouds: the weather's drifting set, remapped into the RECIPE cloud band
      const C = E.clouds, CT = CLOUDS[this._to];
      for (const c of weather.clouds || []) {
        const al = c.alpha || 0; if (!(al > 0.01)) continue;
        const s = (c.s || 0.7) * (C.s / 0.6), w = 300 * s, h = 140 * s;
        const yf = clamp((c.y || 0) / Math.max(1, sY * 0.5), 0, 1), y = lerp(C.y0, C.y1, yf);
        const im = this._tintedImg('env/' + (c.type === 'cloud_b' ? 'cloud_b' : 'cloud_a'), CT.tint, w, h);
        if (!im) continue;
        g.globalAlpha = al * CT.alpha; g.drawImage(im, c.x - w / 2, y - h / 2, w, h);
      }
      g.globalAlpha = 1;
      // volcano smoke: puffs rising from the crater, growing and fading
      const dt = this._dt || 0;
      this._smokeT = (this._smokeT || 0) - dt;
      if (this._smokeT <= 0 && E.craters.length) { this._smokeT = 2.5; for (const cr of E.craters) this._smoke.push({ x: cr.x, y: cr.y, u: 0, k: E.far.k }); }
      for (let i = this._smoke.length - 1; i >= 0; i--) {
        const p = this._smoke[i]; p.u += dt / 7;
        if (p.u >= 1 || !E.craters.length) { this._smoke.splice(i, 1); continue; }
        const s = p.k * (0.45 + 0.9 * p.u) * 120, y = p.y - 10 - p.u * 90 * p.k, x = p.x + p.u * 26 * p.k;
        const im = this._tintedImg('env/smoke', SMOKE_TINT[this._to], s, s);
        if (im) { g.globalAlpha = 0.8 * Math.min(1, p.u * 6) * (1 - p.u); g.drawImage(im, x - s / 2, y - s / 2, s, s); }
      }
      g.globalAlpha = 1;
      const layer = l => this._moods((m, al) => {
        if (al <= 0.01) return;
        const Ly = this._env[m][l], t = this._tile(l, m); if (!t) return;
        g.globalAlpha = al;
        for (const x of tileXs(Ly.x0, Ly.w, W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
        g.globalAlpha = 1;
      });
      layer('far'); layer('mid');
      // mist over the far shore
      const mist = MIST[this._to], ma = (amb.mist != null ? clamp(amb.mist, 0, 1) : 1) * mist.a;
      if (ma > 0.01) {
        const M = E.mist, mg = g.createLinearGradient(0, M.y0, 0, M.y1), c = mist.col;
        mg.addColorStop(0, c + '00'); mg.addColorStop(0.7, c + Math.round(clamp(ma, 0, 1) * 255).toString(16).padStart(2, '0'));
        mg.addColorStop(1, c + Math.round(clamp(ma * 0.3, 0, 1) * 255).toString(16).padStart(2, '0'));
        g.fillStyle = mg; g.fillRect(0, M.y0, W, M.y1 - M.y0);
      }
      // reeds at the lake ends
      for (const r of E.reeds) {
        const im = this._tintedImg('env/reeds', PROP_TINT[this._to], r.w, r.h); if (!im) continue;
        const sw = Math.sin(this.time * 0.9 + r.x * 0.01) * 0.02;
        g.save(); g.translate(r.x + r.w / 2, r.y + r.h); if (r.flip) g.scale(-1, 1); g.transform(1, 0, sw, 1, 0, 0);
        g.drawImage(im, -r.w / 2, -r.h, r.w, r.h); g.restore();
      }
      if (amb.tint) { g.fillStyle = amb.tint; g.fillRect(0, 0, W, sY + 2); }   // background only, never the fish
    }

    /* ---------- the lake (water, bed, weed, under-water particles) ---------- */
    _lake(w, weather) {
      const g = this.g, L = this._L, E = this._E, P = FA();
      if (P) { try { P.drawWater(g, L, this.time, this._amb); } catch (e) { /* skip */ } }
      else { g.fillStyle = '#5FAFB4'; g.fillRect(0, L.surfaceY, this.W, this.H - L.surfaceY); }
      this._moods((m, al) => {
        if (al <= 0.01) return;
        const Ly = this._env[m].bed, t = this._tile('bed', m); if (!t) return;
        g.globalAlpha = al;
        for (const x of tileXs(Ly.x0, Ly.w, this.W)) g.drawImage(t, x, Ly.y, Ly.w + 0.5, Ly.h);
        g.globalAlpha = 1;
      });
      for (const wd of E.weeds) {
        const im = this._tintedImg('env/weed', WEED_TINT[this._to], wd.w, wd.h); if (!im) continue;
        const sw = 0.08 * Math.sin(1.1 * this.time + wd.phase);
        g.save(); g.translate(wd.x + wd.w / 2, wd.y + wd.h); g.transform(1, 0, -sw, 1, 0, 0);
        g.drawImage(im, -wd.w / 2, -wd.h, wd.w, wd.h); g.restore();
      }
      this._particles(weather.particles, 'water');
    }

    /* ---------- the round ---------- */
    _game(w, weather, o, a) {
      const L = this._L, P = FA(); if (!P) return;
      const g = this.g;
      for (const b of w.bubbles || []) { try { P.drawBubbleDot(g, ip(b, 'x', a), ip(b, 'y', a), b.r || 4, b.a == null ? 1 : b.a); } catch (e) { /* skip */ } }
      const list = (w.members || []).filter(m => m.state !== 'gone' && !((m.alpha == null ? 1 : m.alpha) <= 0));
      const under = list.filter(m => !m.above).sort((p, q) => (p.state === 'reel') - (q.state === 'reel') || (p.lane || 0) - (q.lane || 0));
      for (const m of under) this._fish(m, a, w);
      for (const r of w.ripples || []) { try { P.drawRipple(g, r.x, r.y, r.r, r.a); } catch (e) { /* skip */ } }
      this._lilies(w, a);
      const c = w.critter;
      if (c && c.kind === 'frog') this._critter(c, a);
      try { P.drawSurfaceFront(g, L, this.time, this._amb); } catch (e) { /* skip */ }
      this._particles(weather.particles, 'surface');
      if (c && c.kind === 'bronto') this._critter(c, a);
      this._rock();
      this._tibo(w.tibo, L.tibo);
      this._rodLine(w.line, a, L);
      for (const m of list.filter(m => m.above)) this._fish(m, a, w);
      for (const s of w.splashes || []) { try { P.drawSplash(g, s.x, s.y, s.s || 1, s.u); } catch (e) { /* skip */ } }
      const B = w.badge;
      if (B && (ip(B, 'a', a) || 0) > 0.01) {
        const al = clamp(ip(B, 'a', a), 0, 1), r = 46 * easeOutBack(clamp(al * 1.6, 0, 1));
        g.save(); g.translate(B.x, B.y); try { P.drawHomeBadge(g, B.home, Math.max(1, r), { alpha: al }); } catch (e) { /* skip */ } g.restore();
      }
      this._particles(weather.particles, 'back');
      if (c && (c.kind === 'ptero' || c.kind === 'fireflies')) this._critter(c, a);
      this._hintHand(w.hintHand, a);
      for (const p of w.puffs || []) { try { P.drawSparkle(g, ip(p, 'x', a), ip(p, 'y', a), (p.r || 14) * 1.3, p.alpha == null ? 1 : p.alpha, this.time * 2); } catch (e) { /* skip */ } }
    }
    _lilies(w, a) {
      const P = FA(), L = this._L, s = (L.size || 104) / 104 * 0.95, full = clamp(ip(w, 'pondFull', a) || 0, 0, 1);
      (w.lilies || L.lilies || []).forEach((q, i) => {
        const open = q.open == null ? 0 : clamp(ip(q, 'open', a), -1, 1.3);
        let y = q.y; try { y = (P.waveY ? P.waveY(L, q.x, this.time) : L.surfaceY) + 6; } catch (e) { /* keep */ }
        const sway = (q.sway || 0) + full * 0.06 * Math.sin(this.time * 3 + i);
        this.g.save(); this.g.translate(q.x, y); this.g.rotate(sway);
        try { P.drawLily(this.g, 0, 0, s * (1 + full * 0.06 * Math.sin(this.time * 4 + i * 1.3)), open, q.color || null, this.time + i); } catch (e) { /* skip */ }
        this.g.restore();
        if (full > 0.05 && Math.sin(this.time * 5 + i * 2) > 0.7) this._sprite('sparkle', q.x + 20 * Math.sin(i + this.time), y - 30, 24, this.time, full);
      });
    }
    _fish(m, a, w) {
      const P = FA(); if (!P) return;
      const g = this.g, x = ip(m, 'x', a), y = ip(m, 'y', a), rot = ip(m, 'rot', a) || 0;
      const sx = ip(m, 'sx', a), sy = ip(m, 'sy', a) || 1, sc = m.scale == null ? 1 : ip(m, 'scale', a), al = m.alpha == null ? 1 : ip(m, 'alpha', a);
      if (!(al > 0.01) || !(sc > 0.01) || !isFinite(x) || !isFinite(y)) return;
      const size = (this._L.size || 104);
      if (x < -size * 2 || x > this.W + size * 2) return;
      g.save(); g.globalAlpha *= clamp(al, 0, 1);
      g.translate(x, y); g.rotate(rot);
      const fsx = (sx == null ? 1 : sx) * sc;
      g.scale(Math.abs(fsx) < 0.04 ? (fsx < 0 ? -0.04 : 0.04) : fsx, sy * sc);
      try {
        P.drawThing(g, m.thing, size, { t: w.time != null ? w.time : this.time, wag: m.wag == null ? 0.5 : m.wag, wagPhase: m.wagPhase,
          wriggle: m.wriggle || 0, glow: m.glow || 0, night: this._night, count: m.count == null ? -1 : m.count, blink: m.blink ? 1 : 0,
          mouth: (m.alert || 0) > 0.3 ? 'o' : 'smile', face: fsx < 0 ? -1 : 1 });
      } catch (e) { /* skip */ }
      g.restore();
    }
    _rock() {
      const R = this._E.rock, g = this.g;
      const im = this._tintedImg('env/rock', PROP_TINT[this._to], R.w, R.h, { col: ROCK_UNDER[this._to], from: clamp((R.waterY - R.y) / R.h, 0, 1) });
      if (im) g.drawImage(im, R.x, R.y, R.w, R.h);
    }
    _tiboFrame(mood, blink) {
      let nm = mood || 'idle';
      const calm = nm === 'idle' || nm === 'talk';
      if (blink && (calm || nm === 'happy')) nm = 'blink';
      if (this._speaking && (nm === 'idle' || nm === 'talk' || nm === 'blink') && Math.sin(this.time * 17) > -0.2) nm = 'talk';
      else if (nm === 'talk' && !this._speaking) nm = Math.sin(this.time * 17) > 0.3 ? 'talk' : 'idle';
      const key = 'characters/tibo_' + nm;
      return TL.Assets.has(key) ? key : 'characters/tibo_idle';
    }
    /** Tibo: the 300 box drawn box.h tall, seat anchor (150, 292) at (box.x, box.y) — the rod grip lands on layout.rodBase */
    _tibo(t, box, opt = {}) {
      if (!box) return;
      t = t || {};
      const nm = opt.frame || this._tiboFrame(t.mood, t.blink);
      const bounce = clamp(t.bounce || 0, 0, 1), k = box.h / TIBO.box, lift = bounce * 10;
      const g = this.g;
      g.save(); g.translate(box.x, box.y - lift);
      g.translate(0, 0); g.rotate((t.look || 0) * 0.015 + (opt.rot || 0));
      this._img(nm, -TIBO.ax * k, -TIBO.ay * k, TIBO.box * k, TIBO.box * k);
      g.restore();
    }
    _rodLine(Ln, a, L) {
      const P = FA(); if (!Ln || !P) return;
      const g = this.g;
      const ang = ip(Ln, 'rodAngle', a), bend = ip(Ln, 'bend', a) || 0;
      let tip;
      try { tip = P.drawRod(g, L.rodBase, L.rodLen, ang == null ? -1.05 : ang, bend); } catch (e) { tip = Ln.tip; }
      if (!tip) return;
      const hk = Ln._phook && Ln.hook ? { x: lerp(Ln._phook.x, Ln.hook.x, a), y: lerp(Ln._phook.y, Ln.hook.y, a) } : Ln.hook;
      if (!hk) return;
      const slack = ip(Ln, 'slack', a) || 0, wet = hk.y > L.surfaceY + 4;
      try { P.drawLine(g, tip, hk, slack, this._night, L.surfaceY); } catch (e) { /* skip */ }
      if (Ln.state !== 'taut') { try { P.drawHook(g, hk.x, hk.y, 1, wet); } catch (e) { /* skip */ } }
    }
    _critter(c, a) {
      if (!c || c.state === 'gone') return;
      const g = this.g;
      if (c.kind === 'fireflies') {
        for (const f of c.flies || []) {
          const x = ip(f, 'x', a), y = ip(f, 'y', a), al = clamp(f.a == null ? 1 : f.a, 0, 1), s = 40 * (1 + 0.6 * (f.tw || 0));
          if (!(al > 0.01)) continue;
          const gl = g.createRadialGradient(x, y, 0, x, y, s);
          gl.addColorStop(0, `rgba(255,236,150,${(0.45 * al * (0.7 + 0.3 * Math.sin(this.time * 6 + x))).toFixed(3)})`); gl.addColorStop(1, 'rgba(255,236,150,0)');
          g.fillStyle = gl; g.beginPath(); g.arc(x, y, s, 0, TAU); g.fill();
          g.globalAlpha = al; this._img('characters/firefly', x - s / 2, y - s / 2, s, s); g.globalAlpha = 1;
        }
        return;
      }
      const x = ip(c, 'x', a), y = ip(c, 'y', a);
      if (!(x > -300 && x < this.W + 300 && y > -300 && y < this.H + 300)) return;
      const M = CRIT[c.kind]; if (!M) return;
      let nm = 'characters/' + c.kind, k = 1, rot = 0;
      if (c.kind === 'ptero') { if (c.flap) nm += '_flap'; k = M.draw / M.w; rot = c.state === 'loop' ? 0 : Math.sin(this.time * 2) * 0.05; }
      else if (c.kind === 'bronto') { if ((c.spray || 0) > 0.2) nm += '_spray'; k = (c.h || 220) / M.h; }
      else if (c.kind === 'frog') { if (c.jump) nm += '_jump'; k = (c.h || 80) / M.h; }
      g.save(); g.translate(x, y);
      if (c.kind === 'ptero' && c.rot != null) rot = c.rot;
      if (rot) g.rotate(rot);
      // art faces RIGHT (ptero, frog) / LEFT (bronto); face is the world's direction
      const artFace = c.kind === 'bronto' ? -1 : 1;
      if ((c.face || artFace) !== artFace) g.scale(-1, 1);
      this._img(nm, -M.ax * k, -M.ay * k, M.w * k, M.h * k);
      g.restore();
    }
    _hintHand(H, a) {
      const P = FA(); if (!H || !P) return;
      const al = H.alpha == null ? 1 : H.alpha;
      if (al <= 0.01) return;
      try { P.drawHintHand(this.g, ip(H, 'x', a), ip(H, 'y', a), H.press || 0, al, 96); } catch (e) { /* skip */ }
    }

    /* ---------- title: Tibo waving on his rock (a little fish on his line), three fish swimming by ---------- */
    _titleScene(w, o) {
      const L = this._L, P = FA(), g = this.g, t = this.time;
      if (!L || !P) return;
      const boxes = (o.boxes && o.boxes.title) || [];
      const lanes = (L.swim && L.swim.lanes) || [L.surfaceY + 120];
      const things = [{ kind: 'fish', color: 'red' }, { kind: 'fish', mark: { shape: 'star', color: 'yellow' } }, { kind: 'fish', color: 'blue' }];
      const x0 = (L.swim && L.swim.x0) || 200, x1 = (L.swim && L.swim.x1) || this.W - 60, span = Math.max(100, x1 - x0);
      things.forEach((th, i) => {
        const lane = lanes[(i + (lanes.length > 3 ? 1 : 0)) % lanes.length];
        const ph = t * (0.05 + i * 0.012) + i * 0.37, u = ph % 2, dir = u < 1 ? 1 : -1, f = u < 1 ? u : 2 - u;
        const e = f * f * (3 - 2 * f), x = x0 + 80 + e * (span - 160), y = lane + Math.sin(t * 1.4 + i) * 6;
        const size = L.size || 104;
        if (boxes.some(b => x + size > b.x && x - size < b.x + b.w && y + size * 0.6 > b.y && y - size * 0.6 < b.y + b.h)) return;
        g.save(); g.translate(x, y); g.scale(dir, 1);
        try { P.drawThing(g, th, size, { t, wag: 0.6, night: this._night, face: dir }); } catch (err) { /* skip */ }
        g.restore();
      });
      (L.lilies || []).forEach((q, i) => { g.save(); g.translate(q.x, L.surfaceY + 6); try { P.drawLily(g, 0, 0, 0.9, i === 1 ? 1 : -1, i === 1 ? 'pink' : null, t + i); } catch (err) { /* skip */ } g.restore(); });
      try { P.drawSurfaceFront(g, L, t, this._amb); } catch (err) { /* skip */ }
      this._rock();
      this._tibo({ bounce: Math.max(0, Math.sin(t * 2.2)) ** 6 * 0.5 }, L.tibo, { frame: 'characters/tibo_title', rot: Math.sin(t * 2) * 0.02 });
      this._particles(this._wxParticles, 'back');
    }
    /* ---------- session done: lilies bloom across the lake, a fish fountain, Tibo cheers, confetti ---------- */
    _doneScene(w, o, weather) {
      const L = this._L, P = FA(), g = this.g, t = this.time;
      if (!L || !P) return;
      this._galleryT += o.dt || 0;
      const cols = this.gallery.length ? this.gallery.map(x => x.color || null) : ['red', 'blue', null, 'yellow'];
      const n = Math.max(6, Math.min(12, Math.round((this.W - 300) / 110)));
      const xa = (L.swim && L.swim.x0) || 260, xb = (L.swim && L.swim.x1) || this.W - 60;
      for (let i = 0; i < n; i++) {
        const x = lerp(xa + 30, xb - 30, (i + 0.5) / n), y = L.surfaceY + 6 + Math.sin(t * 1.2 + i) * 2;
        const open = clamp((this._galleryT - i * 0.15) * 2, -1, 1);
        g.save(); g.translate(x, y); try { P.drawLily(g, 0, 0, 0.8 + 0.08 * Math.sin(i * 2.1), open, cols[i % cols.length], t + i); } catch (err) { /* skip */ } g.restore();
      }
      // a fountain of leaping fish
      const things = [{ kind: 'fish', color: 'red' }, { kind: 'fish', color: 'yellow' }, { kind: 'fish', color: 'blue' }, { kind: 'fish', mark: { n: 3 } }, { kind: 'fish', color: 'green' }];
      const pb = o.boxes && o.boxes.done;
      for (let i = 0; i < things.length; i++) {
        const per = 2.4, u = ((t + i * per / things.length) % per) / per;
        const cx = lerp(xa + 60, xb - 60, (i + 0.5) / things.length), x = cx + (u - 0.5) * 120;
        const hgt = Math.min(240, L.surfaceY - ((pb && this.H > this.W) ? pb.y + pb.h + 40 : 80));
        const y = L.surfaceY + 30 - 4 * u * (1 - u) * (hgt + 30);
        g.save(); g.translate(x, y); g.rotate((u - 0.5) * 2.4);
        try { P.drawThing(g, things[i], (L.size || 104) * 0.8, { t, wag: 1, night: this._night }); } catch (err) { /* skip */ }
        g.restore();
        if (Math.abs(u - 0.97) < 0.02 && !this['_spl' + i]) { this['_spl' + i] = 1; this.burst('drops', x, L.surfaceY); } else if (u < 0.5) this['_spl' + i] = 0;
      }
      try { P.drawSurfaceFront(g, L, t, this._amb); } catch (err) { /* skip */ }
      this._rock();
      const beat = Math.floor(t / 1.4) % 2;
      this._tibo({ bounce: beat ? Math.max(0, Math.sin(t * 4)) * 0.6 : 0 }, L.tibo, { frame: beat ? 'characters/tibo_cheer' : 'characters/tibo_wave' });
      try { P.drawRod(g, L.rodBase, L.rodLen, -1.05 + Math.sin(t * 3) * 0.1, 0); } catch (err) { /* skip */ }
      this._particles(weather.particles, 'back');
    }
    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H, L = this._L;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((TL.CONFIG && TL.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = L.portrait ? W / 2 : Math.max(W / 2, (L.swim ? (L.swim.x0 + L.swim.x1) / 2 : W / 2));
      const cy = clamp((L.surfaceY + L.groundY) / 2, L.surfaceY + bh / 2 + 10, L.groundY - bh / 2 - 10);
      g.save(); g.translate(Math.min(cx, W - bw / 2 - 20), cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      g.fillStyle = 'rgba(20,50,60,.28)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 8, bw, bh, 34); g.fill();
      g.fillStyle = '#D7A65E'; g.beginPath(); roundRect(g, -bw / 2 - 10, -bh / 2 - 10, bw + 20, bh + 20, 40); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#9C7A44'; g.stroke();
      g.fillStyle = '#FFF8EA'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2, bw, bh, 30); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#6FB7B0'; g.stroke();
      const I = TL.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, '#4F7F7A', null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 58, '#5A3B26', '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, '#4F7F7A', null, bw - 60);
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
      const colOf = c => (c && TL.PALETTE && TL.PALETTE[c]) ? TL.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
      if (type === 'sparkles') {
        const n = Math.round((opt.n || 20) * q);
        for (let i = 0; i < n; i++) {
          const a = R() * TAU, sp = 100 + R() * 240 * (opt.spread || 1);
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'sparkle' : 'pstar', tint: opt.color ? colOf(opt.color) : (opt.gold ? '#FFE7A3' : CONF[i % CONF.length]), x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, g: 160, drag: 1.2, t: 0, life: 0.8 + R() * 0.5, size: 16 + R() * 14, rot: R() * TAU, vr: 3 });
        }
      } else if (type === 'ring') {
        fx.push({ k: 'ring', x, y, t: 0, life: opt.life || 0.4, size: opt.size || 90, color: opt.rgb || '255,255,255' });
      } else if (type === 'star') {
        fx.push({ k: 'star', x0: x, y0: y, x1: this.hudStar.x, y1: this.hudStar.y, t: -(opt.delay || 0), life: 0.8, size: 70, onDone: opt.onDone });
      } else if (type === 'confetti') {
        const n = Math.round((opt.n || 110) * q), lf = opt.life || 5;
        for (let i = 0; i < n; i++) {
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[i % CONF.length], x: R() * this.W, y: -20 - R() * this.H * (opt.n ? 0.25 : 0.5), vx: (R() - 0.5) * 60, vy: 60 + R() * 120,
            g: 30, drag: 0.6, t: 0, life: lf + R() * lf * 0.4, size: 22 + R() * 12, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'count') {
        for (const f of fx) if (f.k === 'num') f.t = Math.max(f.t, f.life * 0.85);
        fx.push({ k: 'num', x, y, t: 0, life: 0.5, text: String(opt.n || '') });
      } else if (type === 'drops') {   // water droplets (done-screen fountain; the game uses weather.addDrops)
        const n = Math.round((opt.n || 8) * q);
        for (let i = 0; i < n; i++) {
          const a = -Math.PI / 2 + (R() - 0.5) * 1.6, sp = 140 + R() * 160;
          fx.push({ k: 'p', sprite: 'drop', tint: null, x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 900, t: 0, life: 0.6, size: 14 + R() * 8, rot: 0, vr: 0, alpha: 0.85 });
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
        } else if (f.k === 'num') {
          const s = easeOutBack(clamp(u * 3, 0, 1)), al = u > 0.6 ? (1 - u) / 0.4 : 1;
          g.save(); g.globalAlpha *= al; g.translate(f.x, f.y - u * 50); g.scale(s, s);
          outlinedText(g, f.text, 0, 0, 84, '#FFF6D8', '#2F6F73', 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = TL.Assets.tinted ? TL.Assets.tinted(name, color, size * this.rs) : TL.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    /** weather particles: {sprite, x, y, size, rot, alpha, layer, kind, color, flipX}; drop: size = height (16/24 wide) */
    _particles(list, layer) {
      if (layer === 'back' && list) this._wxParticles = list;
      if (!list) return;
      const g = this.g;
      for (const p of list) {
        const al = p.alpha == null ? p.a : p.alpha;
        if ((p.layer || 'back') !== layer || !(al > 0.01)) continue;
        let nm = p.sprite || p.type || p.kind;
        if (nm === 'mist') nm = 'mote';
        if (nm === 'star') nm = 'pstar';
        const size = p.size || p.s || 16;
        if (nm === 'drop') {
          const spr = TL.Assets.sprite('particles/drop', size * this.rs);
          if (!spr) continue;
          const h = size, w = size * 16 / 24;
          g.save(); g.globalAlpha *= al; g.translate(p.x, p.y); if (p.rot) g.rotate(p.rot); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
          continue;
        }
        const tint = p.color || p.tint;
        if (p.flipX != null && p.flipX !== 1) {
          const spr = tint && TINTABLE[nm] ? TL.Assets.tinted(nm, tint, size * this.rs) : TL.Assets.sprite(nm, size * this.rs);
          if (!spr) continue;
          const k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
          g.save(); g.globalAlpha *= al; g.translate(p.x, p.y); g.rotate(p.rot || 0); g.scale(Math.abs(p.flipX) < 0.08 ? (p.flipX < 0 ? -0.08 : 0.08) : p.flipX, 1);
          g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
          continue;
        }
        if (tint && TINTABLE[nm]) this._tinted(nm, tint, p.x, p.y, size, p.rot || 0, al);
        else this._sprite(nm, p.x, p.y, size, p.rot || 0, al);
      }
    }
    /* ---------- helpers ---------- */
    _sprite(name, x, y, size, rot, alpha, ctx, flipX) {
      const g = ctx || this.g;
      const spr = TL.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = TL.Assets.sprite(name, Math.max(Math.abs(w), Math.abs(h)) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k) g.strokeRect(k.x, k.y, k.w, k.h);
      const n = w.tiboHit && w.tiboHit(); if (n) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.strokeRect(n.x, n.y, n.w, n.h); }
      if (L.band) { g.strokeStyle = 'rgba(255,160,0,.5)'; g.strokeRect(L.band.x, L.band.y, L.band.w, L.band.h); }
      for (const m of w.members || []) {
        const h = w.memberHit && w.memberHit(m.id); if (!h) continue;
        g.strokeStyle = m.target ? 'rgba(220,0,0,.7)' : 'rgba(0,160,0,.7)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      }
      const c = w.critterHit && w.critterHit();
      if (c) { g.strokeStyle = 'rgba(0,200,255,.8)'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.stroke(); }
    }
  }
  /** A Talk-time picture (question or answer button), drawn with FishArt.drawIcon into a small canvas. */
  Renderer.preview = function (canvas, thing) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    if (!thing || !FA()) return;
    try { g.save(); g.translate(cw / 2, ch / 2); FA().drawIcon(g, thing, Math.min(ch, cw) * 0.94); g.restore(); } catch (e) { /* skip */ }
  };
  Renderer.envLayout = envLayout;
  Renderer.tileXs = tileXs;
  Renderer.RECIPE = { MOODS, SKY, SUN, MOON, SUN_SIZE, CLOUDS, SMOKE_TINT, MIST, PROP_TINT, WEED_TINT, ROCK_UNDER, FAR_K, MID_K, REED_K, WEED_K, envLayout, tileXs };
  TL.Renderer = Renderer;
})(window.TL = window.TL || {});
