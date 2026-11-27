/* BD.Renderer (Tupi's Bakery Delivery) — draws the bakery table town on one canvas (DESIGN §7, MECHANICS §5).
 * Order: wall + season window (BD.TableArt.drawWall, crossfading seasons) → outside particles clipped to the glass → table
 * (gingham, cached) → warm light beams → roads (cached bitmap + reveal / hint glow / trail) → 'table' particles → bakery →
 * houses, the mouse and the cart back-to-front by y (house → its friend; cart: shadow → cart_back → Tupi → cargo → cart_front
 * → wheels) → heart / dust puffs → flyers (cargo in the air) → sprinkles → bird on the sill → snowflakes → hint hand → front
 * particles → fx → wipe curtain → banner.
 * Title: Tupi standing with a cupcake by her cart at the bakery, an icing road to two gingerbread houses.
 * Session done: every house lit, Tupi cheering and spraying sprinkles, confetti.
 * Every moving world value is interpolated with its `_p` twin and world.alpha. Logical px × render scale rs = device px. */
(function (BD) {
  'use strict';
  const TAU = Math.PI * 2;
  const FONT = 'ui-rounded, "SF Pro Rounded", "Arial Rounded MT Bold", "Nunito", "Segoe UI", system-ui, -apple-system, sans-serif';
  const lerp = (a, b, t) => a + (b - a) * t;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const easeOutBack = t => { const c = 1.6; t -= 1; return 1 + (c + 1) * t * t * t + c * t * t; };
  const CONF = ['#E84A4A', '#3C8DE8', '#FFD23F', '#4CC26B', '#FF9A2E', '#8E44AD', '#FF8FC0'];
  const SEASONS = ['spring', 'summer', 'autumn', 'winter'];
  const INK = '#5A3826', INK2 = '#8C5E3F';
  const TUPI_FRAMES = { idle: 1, blink: 1, talk: 1, happy: 1, cheer: 1, think: 1, oops: 1, honk: 1, spray: 1, wave: 1, giggle: 1, hand: 1 };
  const TINTABLE = { dot: 1, confetti_a: 1, confetti_b: 1, mote: 1, dust: 1, sparkle: 1, pstar: 1, mist: 1, feather: 1 };
  const WIPE_SPR = { spring: ['petal', 'blossom', 'petal', 'crumb'], summer: ['glint', 'sparkle', 'mote', 'crumb'], autumn: ['leaf', 'leaf', 'crumb', 'mote'], winter: ['snow', 'sparkle', 'snow', 'crumb'] };
  const WIPE = { spring: ['#FBEFE8', '#FFF8F2', '#F2CFD9'], summer: ['#FFF4DA', '#FFFBEE', '#F4E3A8'], autumn: ['#F8E2C4', '#FDF0DE', '#E3A877'], winter: ['#F6F8FB', '#FFFFFF', '#DCE6F1'] };
  const ip = (o, k, a) => { const p = o['_p' + k], v = o[k]; return p == null || v == null ? v : p + (v - p) * a; };
  const HA = () => BD.HouseArt;
  const TA = () => BD.TableArt;
  const TP = () => (BD.World && BD.World.tupiPoints ? BD.World.tupiPoints() : BD.TUPI_POINTS) || { seat: [150, 250], trunkTip: [274, 58], mouth: [196, 162],
    cart: { ground: [170, 232], seat: [200, 168], wheels: [[92, 194, 38], [262, 194, 38]], tray: [86, 138], box: [0, -74, 338, 232] } };
  const ANIMAL = { w: 200, h: 200, ax: 100, ay: 194 };
  const MOUSE = { w: 140, h: 120, ax: 70, ay: 114 };
  const BIRD = { w: 120, h: 100, ax: 60, ay: 94 };
  const TITLE_SIGNS = [{ color: 'red' }, { color: 'blue' }, { color: 'yellow' }];

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
    const f = fitText(g, text, maxW || 9999, px);
    g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
    if (stroke) { g.lineWidth = Math.max(3, f * 0.16); g.strokeStyle = stroke; g.strokeText(text, x, y); }
    g.fillStyle = fill; g.fillText(text, x, y);
  }
  const layoutKey = L => !L || !L.table ? '' : [L.W, L.H, Math.round(L.ins.top), Math.round(L.ins.left), Math.round(L.ins.right), Math.round(L.ins.bottom),
    Math.round(L.bubble.y), Math.round(L.bubble.h), L.houseS, L.roadW].join('|');

  class Renderer {
    constructor(canvas) {
      this.canvas = canvas; this.g = canvas.getContext('2d');
      this.W = 960; this.H = 720; this.rs = 1; this.lang = 'en';
      this.fx = []; this.time = 0; this.quality = 1; this.hudStar = { x: 900, y: 40 };
      this.gallery = []; this._list = []; this._keep = [];
      this._title = null; this._done = null; this.donePanel = null; this.titleKeep = null;
      this._spr = [];   // the celebration's own sprinkles
    }
    resize(W, H, rs) {
      this.W = W; this.H = H; this.rs = rs;
      const bw = Math.round(W * rs), bh = Math.round(H * rs);
      if (this.canvas.width !== bw || this.canvas.height !== bh) { this.canvas.width = bw; this.canvas.height = bh; }
      BD.Assets.dropExact();
      if (TA() && TA()._reset) TA()._reset();
      this._title = null; this._done = null;
    }
    /** pre-rasterize a season's wall + table so the crossfade never stutters */
    prewarm(layout, season) {
      if (!layout || !layout.table || !TA()) return;
      const c = this._scratch || (this._scratch = BD.Assets.makeCanvas(4, 4)), x = c.getContext('2d');
      x.setTransform(this.rs, 0, 0, this.rs, 0, 0);
      const m = SEASONS[clamp(season | 0, 0, 3)];
      try { TA().drawWall(x, layout, m, 0, { dpr: this.rs }); } catch (e) { /* cache only */ }
    }
    /** build the bitmap caches of this round's houses + cargo before the first touch */
    prewarmRound(world) {
      const P = HA(); if (!P || !world || !world.houses || !world.layout) return;
      const c = this._scratch || (this._scratch = BD.Assets.makeCanvas(4, 4)), x = c.getContext('2d');
      x.setTransform(this.rs, 0, 0, this.rs, 0, 0);
      const snow = world.weather === 3 ? 1 : 0;
      try {
        for (const h of world.houses) P.drawHouse(x, h.S || world.layout.houseS, { seed: h.seed, color: h.color, sign: h.sign, snow, lang: this.lang });
        for (const o of (world.cur && world.cur.orders) || []) P.drawThing(x, o.cargo, 80 * (world.cart ? world.cart.k : 0.5), { lang: this.lang });
      } catch (e) { /* cache only */ }
    }
    setGallery(list) { this.gallery = (list || []).slice(-12); this._done = null; }
    clearGallery() { this.gallery = []; this._done = null; }

    /* ---------- frame ---------- */
    draw(world, weather, o) {
      const g = this.g, rs = this.rs, dt = o.dt || 0;
      this.lang = o.lang || 'en';
      this.time += dt; this._dt = dt; this._speaking = !!o.speaking;
      const a = world.alpha == null ? 1 : clamp(world.alpha, 0, 1);
      const L = this._L = world.layout;
      const amb = weather.ambient || {};
      this._amb = amb;
      this._to = SEASONS.includes(amb.env) ? amb.env : (SEASONS.includes(amb.mood) ? amb.mood : 'spring');
      this._from = SEASONS.includes(amb.envFrom) ? amb.envFrom : this._to;
      this._mix = amb.envMix == null ? 1 : clamp(amb.envMix, 0, 1);
      g.setTransform(rs, 0, 0, rs, 0, 0);
      g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
      g.fillStyle = '#F6ECD8'; g.fillRect(0, 0, this.W, this.H);
      if (!L || !L.table) { this._particles(weather.particles, 'front'); return; }
      this._wall(L, weather);
      if (o.title) this._titleScene(world, weather, o);
      else if (o.done) this._doneScene(world, weather, o);
      else this._game(world, weather, o, a);
      this._particles(weather.particles, 'front');
      this._fx(dt);
      if (!o.title && !o.done) { this._wipe(world.wipe, a); this._banner(world); }
      if (o.debug && !o.title && !o.done) this._debug(world);
    }
    _fading() { return this._from !== this._to && this._mix < 1; }
    _moods(fn) { if (this._fading()) { fn(this._from, 1); fn(this._to, this._mix); } else fn(this._to, 1); }
    _snow() { return this._to === 'winter' ? this._mix : this._from === 'winter' ? 1 - this._mix : 0; }

    /** the back wall + window, outside particles clipped to the glass */
    _wall(L, weather) {
      const T = TA(), g = this.g; if (!T) return;
      this._moods((m, al) => { try { T.drawWall(g, L, m, this.time, { alpha: al, quality: this.quality, dpr: this.rs }); } catch (e) { /* skip */ } });
      let gl = null;
      try { const wl = T.wallLayout(L); gl = wl && wl.glass; } catch (e) { gl = null; }
      if (gl && weather.particles) {
        g.save(); g.beginPath(); g.rect(gl.x, gl.y, gl.w, gl.h); g.clip();
        this._particles(weather.particles, 'back');
        g.restore();
      }
    }
    /** the table cloth + warm light beams from the window */
    _table(L, keep, roads, seed) {
      const T = TA(), g = this.g; if (!T) return;
      this._moods((m, al) => { try { T.drawTable(g, L, m, { keep, seed: seed || 1, roads, alpha: al, dpr: this.rs }); } catch (e) { /* skip */ } });
      const beam = clamp(this._amb.beam || 0, 0, 1);
      if (beam > 0.02 && this.quality > 0.6) {
        const t = L.table, W = this.W, x0 = W * (L.portrait ? 0.3 : 0.45);
        g.save();
        g.globalAlpha = 0.11 * beam * (0.85 + 0.15 * Math.sin(this.time * 0.4));
        g.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 2; i++) {
          const bx = x0 + i * W * 0.18, sk = t.h * 0.55;
          const gr = g.createLinearGradient(0, t.y, 0, t.y + t.h);
          gr.addColorStop(0, 'rgba(255,236,190,0.9)'); gr.addColorStop(1, 'rgba(255,236,190,0)');
          g.fillStyle = gr; g.beginPath();
          g.moveTo(bx, t.y); g.lineTo(bx + 90 + i * 30, t.y); g.lineTo(bx + 90 + i * 30 + sk, t.y + t.h); g.lineTo(bx + sk - 60, t.y + t.h); g.closePath(); g.fill();
        }
        g.restore();
      }
    }

    /* ---------- the round ---------- */
    _game(w, weather, o, a) {
      const L = this._L, g = this.g, T = TA(), P = HA();
      const keep = this._keep; keep.length = 0;
      for (const h of w.houses || []) { const b = w.houseHit ? w.houseHit(h.id) : null; if (b) keep.push({ x0: b.x0 + 24, y0: b.y0 + 54, x1: b.x1 - 24, y1: b.y1 }); }
      this._table(L, keep, w.roads, w.roads ? w.roads.seed : 1);
      const snow = this._snow();
      if (T && w.roads) {
        const rev = clamp(ip(w, 'roadReveal', a) || 0, 0, 1);
        if (rev > 0.001) {
          try { T.drawRoads(g, w.roads, L, { reveal: rev, glowEdges: w.hintEdges || null, glow: clamp(ip(w, 'hintGlow', a) || 0, 0, 1), trail: w.trail || null, trailT: 1, snow, t: this.time, quality: this.quality, dpr: this.rs }); } catch (e) { /* skip */ }
        }
      }
      this._particles(weather.particles, 'table');
      if (T) { try { T.drawBakery(g, L, this.time, { puff: w.phase === 'load' ? 1 : 0.3, ding: w.phase === 'load' ? clamp(1 - (w.phaseTime || 0) / 0.6, 0, 1) : 0 }); } catch (e) { /* skip */ } }
      if (!P) return;
      // houses, the mouse and the cart back-to-front by y
      const list = this._list; list.length = 0;
      for (const h of w.houses || []) { const ap = ip(h, 'appear', a) || 0; if (ap > 0.01) list.push({ k: 'h', o: h, y: h.z != null ? h.z : ip(h, 'y', a) }); }
      const m = w.mouse; if (m && m.state !== 'out' && (m.peek || 0) > 0.01) list.push({ k: 'm', o: m, y: ip(m, 'y', a) });
      const c = w.cart; if (c && (c.alpha || 0) > 0.01) list.push({ k: 'c', o: c, y: c.z != null ? ip(c, 'y', a) - 0.5 : ip(c, 'y', a) });
      list.sort((p, q) => p.y - q.y);
      for (const it of list) {
        if (it.k === 'h') this._house(it.o, a, snow);
        else if (it.k === 'm') this._mouse(it.o, a);
        else this._cart(w, a);
      }
      for (const p of w.puffs || []) {
        const pa = clamp(ip(p, 'a', a) || 0, 0, 1); if (pa < 0.01) continue;
        const x = ip(p, 'x', a), y = ip(p, 'y', a), r = ip(p, 'r', a);
        if (p.kind === 'heart') { g.save(); g.translate(x, y); g.rotate(p.rot || 0); P.drawHeartPuff(g, r, pa); g.restore(); }
        else if (T) T.drawSkid(g, x, y, r, pa);
      }
      const ck = c ? c.k || 0.5 : 0.5;
      for (const f of w.flyers || []) {
        if (f.done || !(f.alpha > 0.01)) continue;
        g.save(); g.translate(ip(f, 'x', a), ip(f, 'y', a)); g.rotate(ip(f, 'rot', a) || 0);
        const s = ip(f, 's', a) || 1; if (s !== 1) g.scale(s, s);
        P.drawThing(g, f.thing, 80 * ck, { alpha: f.alpha, lang: this.lang, shadow: false });
        g.restore();
      }
      for (const s of w.sprinkles || []) {
        const sa = clamp(ip(s, 'a', a) == null ? 1 : ip(s, 'a', a), 0, 1); if (sa < 0.01) continue;
        g.save(); g.globalAlpha = sa; g.translate(ip(s, 'x', a), ip(s, 'y', a));
        P.drawSprinkle(g, s.kind, s.r || 5, ip(s, 'rot', a) || 0); g.restore();
      }
      this._bird(w.bird, a);
      for (const fl of w.snowflakes || []) {
        if (fl.state === 'wait' || !(fl.a > 0.01)) continue;
        g.save(); g.translate(ip(fl, 'x', a), ip(fl, 'y', a));
        P.drawSnowflake(g, fl.r * (1 + 0.3 * (fl.tw || 0)), ip(fl, 'rot', a) || 0, fl.a);
        g.restore();
      }
      const hh = w.hintHand;
      if (hh && hh.alpha > 0.01) P.drawHintHand(g, ip(hh, 'x', a), ip(hh, 'y', a), hh.press || 0, hh.alpha, clamp((L.houseS || 160) * 0.62, 84, 110));
    }
    _house(h, a, snow) {
      const P = HA(), g = this.g;
      const x = ip(h, 'x', a), y = ip(h, 'y', a), ap = clamp(ip(h, 'appear', a) || 0, 0, 1), s = ip(h, 's', a);
      const sc = s == null ? easeOutBack(ap) : s;
      g.save(); g.translate(x, y); if (sc !== 1) g.scale(sc, sc);
      P.drawHouse(g, h.S || this._L.houseS, { seed: h.seed, color: h.color || null, sign: h.sign, door: clamp(ip(h, 'door', a) || 0, 0, 1), lit: clamp(ip(h, 'lit', a) || 0, 0, 1),
        glow: clamp(ip(h, 'glow', a) || 0, 0, 1), active: h.active || 0, squash: 1 - clamp(ip(h, 'squash', a) || 0, -0.4, 0.4), snow, alpha: clamp(ap * 1.6, 0, 1), lang: this.lang });
      g.restore();
      const f = h.friend;
      if (f && f.animal && f.state !== 'wait') {
        const pop = clamp(ip(f, 'pop', a) || 0, 0, 1.2); if (pop < 0.02) return;
        const S = h.S || this._L.houseS, ah = 0.5 * S, k = ah / ANIMAL.h, e = easeOutBack(clamp(pop, 0, 1));
        g.save(); g.translate(x, y + 2); g.rotate(ip(f, 'shake', a) || 0); g.scale(e, e);
        if ((h.side || -1) < 0) g.scale(-1, 1);   // look towards the cart
        const key = 'animals/' + f.animal + ((f.wave || 0) > 0.5 && BD.Assets.has('animals/' + f.animal + '_step') ? '_step' : '');
        this._img(key, -ANIMAL.ax * k, -ANIMAL.ay * k, ANIMAL.w * k, ANIMAL.h * k);
        g.restore();
      }
    }
    _tupiFrame(fr) {
      let nm = TUPI_FRAMES[fr] ? fr : 'idle';
      if (nm === 'idle' || nm === 'talk' || nm === 'blink' || nm === 'happy') {
        if (this._speaking) nm = Math.sin(this.time * 17) > -0.2 ? 'talk' : (nm === 'happy' ? 'happy' : 'idle');
        else if (nm === 'talk') nm = Math.sin(this.time * 17) > 0.3 ? 'talk' : 'idle';
      }
      const key = 'characters/tupi_' + nm;
      return BD.Assets.has(key) ? key : 'characters/tupi_idle';
    }
    /** the cart: pose = ground (x, y − bounce − hop) → mirror faceS → lean → (sx, sy) → art scale k about the ground anchor */
    _cart(w, a, opt) {
      const c = opt || w.cart, g = this.g, T = TP(), C = T.cart, P = HA();
      const k = c.k || 0.5, al = clamp(opt ? 1 : ip(c, 'alpha', a), 0, 1);
      if (al < 0.01) return;
      const x = opt ? c.x : ip(c, 'x', a), gy = opt ? c.y : ip(c, 'y', a);
      const y = gy - (opt ? 0 : (ip(c, 'bounce', a) || 0) + (ip(c, 'hop', a) || 0));
      const face = opt ? (c.faceS || 1) : (ip(c, 'faceS', a) || 1), lean = opt ? (c.lean || 0) : (ip(c, 'lean', a) || 0);
      const sx = c.sx || 1, sy = c.sy || 1;
      const pose = () => { g.translate(x, y); g.scale(face, 1); g.rotate(lean); g.scale(sx, sy); g.scale(k, k); g.translate(-C.ground[0], -C.ground[1]); };
      g.save(); g.globalAlpha = al;
      // contact shadow on the table
      g.fillStyle = 'rgba(70,46,28,0.22)'; g.beginPath(); g.ellipse(x, gy + 2, 150 * k * Math.max(0.6, Math.abs(face)), 20 * k, 0, 0, TAU); g.fill();
      g.save(); pose();
      const fr = opt ? (opt.frame ? 'characters/tupi_' + opt.frame : this._tupiFrame('idle')) : this._tupiFrame(w.tupi ? w.tupi.frame || w.tupi.mood : 'idle');
      this._imgK('characters/cart_back', 0, 0, 340, 240, k);
      if (!(opt && opt.noTupi)) this._imgK(fr, C.seat[0] - T.seat[0], C.seat[1] - T.seat[1], 300, 300, k);
      g.restore();
      g.save(); pose();
      this._imgK('characters/cart_front', 0, 0, 340, 240, k);
      const wr = opt ? 0 : ip(c, 'wheelRot', a) || 0;
      for (const wh of C.wheels) {
        g.save(); g.translate(wh[0], wh[1]); g.rotate(wr);
        const d = 80 * wh[2] / 38;
        this._imgK('characters/wheel', -d / 2, -d / 2, d, d, k);
        g.restore();
      }
      g.restore();
      // the cargo, upright and drawn OVER the front panel, raised out of the tray (QA-V P1-2: it was 30–40 % hidden)
      const cargo = opt ? opt.cargo : c.cargo;
      if (cargo && P) {
        const dx = (C.tray[0] - C.ground[0]) * k * sx, dy = (C.tray[1] - C.ground[1]) * k * sy;
        const cl = Math.cos(lean), sl = Math.sin(lean);
        const tx = x + (dx * cl - dy * sl) * face, ty = y + dx * sl + dy * cl - (opt ? 0 : ip(c, 'cargoHop', a) || 0);
        const th = cargo.kind === 'cookies' && c.cargoCount != null && !opt ? Object.assign({}, cargo, { n: c.cargoCount }) : cargo;
        if (!(th.kind === 'cookies' && !(th.n > 0))) {
          g.save(); g.translate(tx, ty - 22 * k); g.rotate(lean * face * 0.6);
          P.drawThing(g, th, 96 * k * (th.kind === 'animal' ? 1.0 : th.kind === 'tile' || th.kind === 'cookies' ? 1.12 : 1), { lang: this.lang, shadow: false });
          g.restore();
        }
      }
      g.restore();
    }
    _mouse(m, a) {
      const g = this.g, s = m.s || 0.8, pk = clamp(ip(m, 'peek', a) || 0, 0, 1);
      g.save(); g.globalAlpha = pk; g.translate(ip(m, 'x', a), ip(m, 'y', a) + (1 - pk) * 10);
      const wv = clamp(ip(m, 'wave', a) || 0, 0, 1);
      if (wv > 0) g.scale(1 + 0.04 * Math.sin(wv * Math.PI), 1 - 0.03 * Math.sin(wv * Math.PI));
      this._img(wv > 0.05 ? 'characters/mouse_wave' : 'characters/mouse', -MOUSE.ax * s, -MOUSE.ay * s, MOUSE.w * s, MOUSE.h * s);
      g.restore();
    }
    _bird(b, a) {
      if (!b || !(b.a > 0.01) || b.state === 'out') return;
      const g = this.g, s = b.s || 0.7, al = clamp(ip(b, 'a', a), 0, 1);
      g.save(); g.globalAlpha = al; g.translate(ip(b, 'x', a), ip(b, 'y', a) - (ip(b, 'hop', a) || 0));
      if ((b.face || 1) < 0) g.scale(-1, 1);
      this._img((b.sing || 0) > 0.05 ? 'characters/bird_sing' : 'characters/bird', -BIRD.ax * s, -BIRD.ay * s, BIRD.w * s, BIRD.h * s);
      g.restore();
    }

    /* ---------- the wipe: a curtain of flour + seasonal things sweeps across (covering the screen at t = 0.5) ---------- */
    _wipe(wp, a) {
      if (!wp) return;
      const g = this.g, W = this.W, H = this.H;
      const t = clamp(ip(wp, 't', a), 0, 1);
      if (t <= 0 || t >= 1) return;
      const dir = wp.dir || { x: 1, y: 0 }, horiz = Math.abs(dir.x) >= Math.abs(dir.y), sgn = horiz ? Math.sign(dir.x || 1) : Math.sign(dir.y || 1);
      const Lx = horiz ? W : H, f = Lx * 0.28;
      const c = -(Lx / 2 + 2 * f) + t * (2 * Lx + 4 * f);
      const half = Lx / 2 + f * 0.15;
      const season = SEASONS[clamp(wp.season | 0, 0, 3)];
      const col = WIPE[season] || WIPE.spring;
      const pos = u => sgn > 0 ? u : Lx - u;
      const p0 = pos(c - half - f), p1 = pos(c - half), p2 = pos(c + half), p3 = pos(c + half + f);
      const gr = horiz ? g.createLinearGradient(p0, 0, p3, 0) : g.createLinearGradient(0, p0, 0, p3);
      const span = p3 - p0, st = v => clamp((v - p0) / span, 0, 1);
      gr.addColorStop(0, this._rgba(col[0], 0)); gr.addColorStop(st(p1), this._rgba(col[0], 0.96));
      gr.addColorStop(clamp((st(p1) + st(p2)) / 2, 0, 1), this._rgba(col[1], 0.99)); gr.addColorStop(st(p2), this._rgba(col[0], 0.96)); gr.addColorStop(1, this._rgba(col[0], 0));
      g.save(); g.fillStyle = gr; g.fillRect(0, 0, W, H);
      const spr = WIPE_SPR[season] || WIPE_SPR.spring, acr = horiz ? H : W;
      for (let i = 0; i < 46; i++) {
        const h1 = ((i * 0.6180339) % 1), h2 = ((i * 0.7548776 + 0.31) % 1), h3 = ((i * 0.5698403 + 0.17) % 1);
        const u = c + (h1 - 0.5) * (2 * half + 1.2 * f) + Math.sin(t * 7 + i) * 18, v = h2 * acr + Math.cos(t * 5 + i * 1.3) * 22;
        const pu = pos(u), size = 22 + 26 * h3;
        this._sprite(spr[i % spr.length], horiz ? pu : v, horiz ? v : pu, size, t * (3 + 4 * h3) * (i % 2 ? 1 : -1) + i, 0.9);
      }
      g.fillStyle = '#FFFFFF'; const across = horiz ? H : W;   // puffs of flour along both edges
      for (let i = 0; i < 9; i++) {
        const v = (i + 0.5) / 9 * across, wob = Math.sin(i * 2.3 + t * 9) * f * 0.25;
        for (const e of [p1 + (p0 - p1) * 0.35, p2 + (p3 - p2) * 0.35]) {
          const r = 26 + 14 * Math.sin(i * 1.7 + t * 6);
          g.globalAlpha = 0.4;
          g.beginPath(); if (horiz) g.arc(e + wob, v, r, 0, TAU); else g.arc(v, e + wob, r, 0, TAU); g.fill();
        }
      }
      g.restore();
    }
    _rgba(hex, al) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${al.toFixed(3)})`; }

    /* ---------- title + celebration: a little 2- or 3-house town ---------- */
    _scene(L, keep, n) {
      const key = layoutKey(L) + '#' + n + JSON.stringify(keep || []);
      const ids = ['a', 'b', 'c'].slice(0, n);
      let map = null;
      try { map = BD.World.genMap(L, { ids, forks: 1 }, 20261127 + n); } catch (e) { map = null; }
      const houses = [];
      if (map && map.houses) {
        const hs = Array.isArray(map.houses) ? map.houses : ids.map(id => map.houses[id]);
        hs.forEach((h, i) => { if (h) houses.push({ x: h.x, y: h.y, S: h.S || map.S || L.houseS, seed: 11 + i * 7, color: TITLE_SIGNS[i % 3].color, sign: { kind: 'blob', color: TITLE_SIGNS[i % 3].color } }); });
      }
      return { key, map, houses };
    }
    _town(S, lit, t) {
      const L = this._L, g = this.g, T = TA(), P = HA();
      const keep = S.houses.map(h => ({ x0: h.x - h.S * 0.5, y0: h.y - h.S, x1: h.x + h.S * 0.5, y1: h.y }));
      this._table(L, keep, S.map, 7);
      if (T && S.map) { try { T.drawRoads(g, S.map, L, { reveal: 1, snow: this._snow(), t, trail: lit ? S.map.edges.map(e => e.id) : null, trailT: 1, dpr: this.rs }); } catch (e) { /* skip */ } }
      if (T) { try { T.drawBakery(g, L, t, { puff: 0.4 }); } catch (e) { /* skip */ } }
      const hide = this._hideKeep || [];
      if (P) S.houses.forEach((h, i) => {
        if (hide.some(k => h.x + h.S * 0.55 > k.x && h.x - h.S * 0.55 < k.x + k.w && h.y > k.y && h.y - h.S * 1.05 < k.y + k.h)) return;
        g.save(); g.translate(h.x, h.y);
        const bob = lit ? 1 + 0.02 * Math.sin(t * 3 + i) : 1; g.scale(bob, 1 / bob);
        P.drawHouse(g, h.S, { seed: h.seed, color: h.color, sign: h.sign, lit: lit ? 1 : 0.4 + 0.3 * Math.sin(t * 1.5 + i), snow: this._snow(), door: lit ? 0.5 + 0.5 * Math.sin(t * 2 + i) : 0, lang: this.lang });
        g.restore();
      });
    }
    _titleScene(w, weather, o) {
      const L = this._L, g = this.g, t = this.time;
      const tk = JSON.stringify(this.titleKeep || []);
      if (!this._title || this._title.key !== layoutKey(L) + tk) { this._title = this._scene(L, this.titleKeep, 2); this._title.key = layoutKey(L) + tk; }
      const S = this._title;
      if (L.portrait && !S.port) {   // portrait: the DOM title fills the upper half — a calm street at the bottom instead of the map
        S.port = true; S.map = null;
        const hs = Math.min(L.houseS, 150), by = L.H - L.ins.bottom - 40;
        S.houses = [{ x: L.W - L.ins.right - hs * 0.62, y: by - hs * 1.55, S: hs, seed: 11, color: 'red', sign: { kind: 'blob', color: 'red' } },
          { x: L.W * 0.5 + 20, y: by - hs * 2.35, S: hs * 0.9, seed: 18, color: 'blue', sign: { kind: 'blob', color: 'blue' } }];
      }
      this._hideKeep = this.titleKeep || [];
      this._town(S, false, t);
      this._hideKeep = null;
      // the cart parked at the start, Tupi standing beside it with a cupcake
      const st = (S.map && S.map.start) || L.start || { x: L.W * 0.3, y: L.H * 0.7 };
      const k = (S.map && S.map.cartK) || L.cartK || 0.5;
      this._cart(null, 1, { x: st.x, y: st.y, k, faceS: 1, frame: 'happy', noTupi: true, cargo: { kind: 'treat', obj: 'cupcake', color: 'red' } });
      const th = 1.25 * k * 300, tk2 = th / 360;
      const tx = clamp(st.x + (L.portrait ? 150 : 170) * k * 1.4, 80, L.W - 80), ty = Math.min(L.H - L.ins.bottom - 8, st.y + 26 * k);
      g.save(); g.translate(tx, ty);
      const br = 1 + 0.012 * Math.sin(t * 2.4); g.scale(1 / Math.sqrt(br), br); g.rotate(Math.sin(t * 2) * 0.03);
      g.fillStyle = 'rgba(70,46,28,0.2)'; g.beginPath(); g.ellipse(0, 0, 90 * tk2, 14 * tk2, 0, 0, TAU); g.fill();
      this._img('characters/tupi_title', -150 * tk2, -350 * tk2, 300 * tk2, 360 * tk2);
      g.restore();
    }
    _doneScene(w, weather, o) {
      const L = this._L, g = this.g, t = this.time, dt = this._dt || 0, P = HA();
      const dk = this.donePanel ? [this.donePanel] : [];
      const key = layoutKey(L) + JSON.stringify(dk);
      if (!this._done || this._done.key !== key) { this._done = this._scene(L, dk, 3); this._done.key = key; this._done.popT = 0.6; }
      const D = this._done;
      this._hideKeep = dk.map(r => ({ x: r.x, y: r.y, w: r.w, h: r.h }));
      this._town(D, true, t);
      this._hideKeep = null;
      const st = (D.map && D.map.start) || L.start || { x: L.W * 0.3, y: L.H * 0.7 };
      const k = (D.map && D.map.cartK) || L.cartK || 0.5, hop = Math.max(0, Math.sin(t * 2.6 * Math.PI)) * 8;
      const frame = Math.floor(t * 1.3) % 3 === 0 ? 'cheer' : 'spray';
      const cart = { x: st.x, y: st.y - hop, k, faceS: 1, lean: Math.sin(t * 2.6) * 0.04, frame, cargo: null };
      this._cart(null, 1, cart);
      // the trunk fountain: the celebration's own sprinkles
      if (frame === 'spray' && P) {
        const T = TP(), C = T.cart, u = T.trunkTip[0] - T.seat[0] + C.seat[0], v = T.trunkTip[1] - T.seat[1] + C.seat[1];
        const tx = st.x + (u - C.ground[0]) * k, ty = st.y - hop + (v - C.ground[1]) * k;
        for (let i = 0; i < 2; i++) {
          const an = -1.22 + (Math.random() - 0.5) * 0.6, sp = 380 + Math.random() * 180;
          this._spr.push({ x: tx, y: ty, vx: Math.cos(an) * sp, vy: Math.sin(an) * sp, kind: (Math.random() * 6) | 0, r: 5, rot: Math.random() * TAU, t: 0, floor: st.y + 20 });
        }
      }
      for (let i = this._spr.length - 1; i >= 0; i--) {
        const s = this._spr[i]; s.t += dt; s.vy += 900 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.rot += 6 * dt;
        if (s.y > s.floor && s.vy > 0) { s.y = s.floor; s.vy *= -0.35; s.vx *= 0.6; }
        if (s.t > 1.8 || this._spr.length > 90) { this._spr.splice(i, 1); continue; }
        if (P) { g.save(); g.globalAlpha = clamp(1.8 - s.t, 0, 1); g.translate(s.x, s.y); P.drawSprinkle(g, s.kind, s.r, s.rot); g.restore(); }
      }
      D.popT -= dt;
      if (D.popT <= 0 && D.houses.length) { D.popT = 1.4 + Math.random(); const h = D.houses[(Math.random() * D.houses.length) | 0]; this.burst('confetti', h.x, h.y - h.S * 0.8, { n: 14, life: 1.8, at: true }); }
    }

    _banner(w) {
      if (w.state !== 'intro' && w.state !== 'levelDone') return;
      const g = this.g, W = this.W, H = this.H, L = this._L;
      const t = w.stateTime || 0;
      const k = w.state === 'intro' ? clamp(t / 0.35, 0, 1) * clamp((((BD.CONFIG && BD.CONFIG.introTime) || 2.5) - t) / 0.3, 0, 1) : clamp(t / 0.35, 0, 1);
      if (k <= 0.01) return;
      const s = easeOutBack(clamp(k, 0, 1));
      const bw = Math.min(620, W - 80), bh = 170, cx = H > W ? W / 2 : clamp(W / 2, bw / 2 + 30, W - bw / 2 - 30);
      const cy = H > W ? Math.max((L.bubble ? L.bubble.y + L.bubble.h : 0) + bh / 2 + 50, H * 0.4) : H * 0.5;
      g.save(); g.translate(cx, cy); g.scale(s, s); g.globalAlpha = clamp(k * 1.5, 0, 1);
      // a gingerbread board with piped icing
      g.fillStyle = 'rgba(70,44,24,.25)'; g.beginPath(); roundRect(g, -bw / 2, -bh / 2 + 10, bw, bh, 34); g.fill();
      g.fillStyle = '#C98A52'; g.beginPath(); roundRect(g, -bw / 2 - 12, -bh / 2 - 12, bw + 24, bh + 24, 42); g.fill();
      g.lineWidth = 3; g.strokeStyle = '#7E4E2A'; g.stroke();
      g.fillStyle = '#FFF8EC'; for (let i = 0; i < 22; i++) { const u = (i + 0.5) / 22; g.beginPath(); g.arc(-bw / 2 + u * bw, -bh / 2 - 4, 5, 0, TAU); g.arc(-bw / 2 + u * bw, bh / 2 + 4, 5, 0, TAU); g.fill(); }
      g.fillStyle = '#FFFBF0'; g.beginPath(); roundRect(g, -bw / 2 + 4, -bh / 2 + 4, bw - 8, bh - 8, 28); g.fill();
      const I = BD.I18N, lang = this.lang;
      if (w.state === 'intro') {
        const top = I ? I.t(lang, 'ui.chapter', { n: (w.level | 0) + 1 }) : 'Chapter ' + ((w.level | 0) + 1);
        const name = I ? I.t(lang, 'topic.' + w.topic) : w.topic;
        outlinedText(g, top, 0, -bh * 0.22, 30, INK2, null, bw - 60);
        outlinedText(g, name, 0, bh * 0.14, 56, INK, '#ffffff', bw - 60);
      } else {
        const s1 = I ? I.t(lang, 'ui.stars') : 'Stars';
        outlinedText(g, s1, 0, -bh * 0.24, 34, INK2, null, bw - 60);
        this._sprite('star', -48, bh * 0.14, 84, Math.sin(this.time * 3) * 0.12);
        outlinedText(g, '× ' + (w.levelStars || 0), 44, bh * 0.16, 62, INK, '#ffffff', 160);
      }
      g.restore();
    }

    /* ---------- juice ---------- */
    burst(type, x, y, opt = {}) {
      const fx = this.fx;
      if (fx.length > 240) fx.splice(0, fx.length - 240);
      const R = Math.random, q = Math.max(0.5, this.quality);
      const colOf = c => (c && BD.PALETTE && BD.PALETTE[c]) ? BD.PALETTE[c].base : (c && c[0] === '#' ? c : CONF[(R() * CONF.length) | 0]);
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
        const n = Math.round((opt.n || 110) * q), lf = opt.life || 5;
        for (let i = 0; i < n; i++) {
          const at = !!opt.at, a = R() * TAU, sp = 120 + R() * 200;
          fx.push({ k: 'p', sprite: R() < 0.5 ? 'confetti_a' : 'confetti_b', tint: CONF[(i + (R() * 7 | 0)) % CONF.length],
            x: at ? x : R() * this.W, y: at ? y : -20 - R() * this.H * (opt.n ? 0.25 : 0.5), vx: at ? Math.cos(a) * sp : (R() - 0.5) * 60, vy: at ? Math.sin(a) * sp - 80 : 60 + R() * 120,
            g: at ? 220 : 30, drag: at ? 1.4 : 0.6, t: 0, life: lf + R() * lf * 0.4, size: (at ? 16 : 22) + R() * 10, rot: R() * TAU, vr: (R() - 0.5) * 10, sway: R() * TAU });
        }
      } else if (type === 'count') {
        for (const f of fx) if (f.k === 'num') f.t = Math.max(f.t, f.life * 0.85);
        fx.push({ k: 'num', x, y, t: 0, life: 0.6, text: String(opt.n || '') });
      } else if (type === 'crumbs') {
        for (let i = 0; i < 6; i++) { const a = -Math.PI * (0.15 + 0.7 * R()), sp = 80 + R() * 120; fx.push({ k: 'p', sprite: 'crumb', x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 600, drag: 1, t: 0, life: 0.5 + R() * 0.3, size: 9 + R() * 6, rot: R() * TAU, vr: 6 }); }
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
          outlinedText(g, f.text, 0, 0, 84, '#FFFFFF', INK, 200); g.restore();
        } else if (f.k === 'star') {
          const e = u * u * (3 - 2 * u);
          const x = lerp(f.x0, f.x1, e), y = lerp(f.y0, f.y1, e) - Math.sin(u * Math.PI) * 140;
          this._sprite('star', x, y, f.size * (1 - 0.5 * u), u * 6, 1);
        }
      }
    }
    _tinted(name, color, x, y, size, rot, alpha) {
      const spr = BD.Assets.tinted ? BD.Assets.tinted(name, color, size * this.rs) : BD.Assets.sprite(name, size * this.rs);
      if (!spr) return;
      const g = this.g, k = size / Math.max(spr.width, spr.height), w = spr.width * k, h = spr.height * k;
      g.save(); g.globalAlpha *= alpha; g.translate(x, y); g.rotate(rot || 0); g.drawImage(spr, -w / 2, -h / 2, w, h); g.restore();
    }
    /** weather particles of one layer: 'back' (outside, clipped by the caller), 'table' (settled on the table), 'front' */
    _particles(list, layer) {
      if (!list) return;
      for (let i = 0; i < list.length; i++) {
        const p = list[i];
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
      const spr = BD.Assets.sprite(name, size * this.rs * (ctx ? 2 : 1));
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
      const spr = BD.Assets.sprite(name, Math.max(Math.abs(w), Math.abs(h)) * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    /** an image drawn inside an extra scale k (art units): rasterized at its on-screen size */
    _imgK(name, x, y, w, h, k) {
      const spr = BD.Assets.sprite(name, Math.max(Math.abs(w), Math.abs(h)) * k * this.rs * 1.1);
      if (spr) this.g.drawImage(spr, x, y, w, h);
    }
    _debug(w) {
      const g = this.g, L = this._L;
      g.lineWidth = 2;
      g.strokeStyle = 'rgba(0,0,255,.5)';
      for (const k of [].concat(L.keep || [], w.hudKeep || [])) if (k && k.w != null) g.strokeRect(k.x, k.y, k.w, k.h);
      const c = w.cartHit && w.cartHit(); if (c) { g.strokeStyle = 'rgba(255,0,255,.6)'; g.beginPath(); g.arc(c.x, c.y, c.r, 0, TAU); g.stroke(); }
      const ans = w.answer && w.answer();
      for (const h of w.houses || []) {
        const b = w.houseHit && w.houseHit(h.id); if (!b) continue;
        g.strokeStyle = ans && ans.houseId === h.id ? 'rgba(0,160,0,.7)' : 'rgba(220,0,0,.6)'; g.strokeRect(b.x0, b.y0, b.x1 - b.x0, b.y1 - b.y0);
      }
      for (const h of [w.mouseHit && w.mouseHit(), w.birdHit && w.birdHit(), w.snowHit && w.snowHit()]) {
        if (h) { g.strokeStyle = 'rgba(0,200,255,.8)'; g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke(); }
      }
    }
  }
  /** A Talk-time picture (question or answer button): answers with HouseArt.drawIcon; opt.stone (the question card) —
   *  the shown thing sits on a cream cake plate. */
  Renderer.preview = function (canvas, thing, opt) {
    const g = canvas.getContext('2d');
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || canvas.width, ch = canvas.clientHeight || canvas.height;
    canvas.width = Math.round(cw * dpr); canvas.height = Math.round(ch * dpr);
    g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, cw, ch);
    const P = HA();
    if (!thing || !P) return;
    try {
      g.save();
      if (opt && opt.stone) {
        const S = Math.min(cw * 0.6, ch * 0.78), base = ch * 0.84;
        g.fillStyle = 'rgba(70,46,28,0.18)'; g.beginPath(); g.ellipse(cw / 2, base + 6, S * 0.62, S * 0.13, 0, 0, TAU); g.fill();
        g.fillStyle = '#FFFDF7'; g.strokeStyle = '#D9C3A5'; g.lineWidth = 3;
        g.beginPath(); g.ellipse(cw / 2, base, S * 0.6, S * 0.14, 0, 0, TAU); g.fill(); g.stroke();
        g.translate(cw / 2, base);
        P.drawThing(g, thing, S * 0.9, { lang: BD.lang });
      } else { g.translate(cw / 2, ch / 2); P.drawIcon(g, thing, Math.min(ch, cw) * 0.94); }
      g.restore();
    } catch (e) { /* skip */ }
  };
  BD.Renderer = Renderer;
})(window.BD = window.BD || {});
