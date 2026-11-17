/* Dottie's Reef Parade — RP.Weather (underwater ambient particles per season, headless, deterministic)
 *
 *   const wx = new RP.Weather({ width:960, height:540, seed });
 *   wx.setBiome(b, { instant:false });        // alias wx.setSeason(); smooth hand-over (~2 s)
 *   wx.resize(w, h);                          // any canvas size (portrait up to 720×1600)
 *   wx.update(dt, { hero: w.hero });          // env optional: bubbles trail Dottie while she flips / turns hard
 *   wx.burst(sprite, x, y, n)                 // one-shot puff: 'bubble' | 'sand' | 'sparkle'
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?, kind, biome, depth }]
 *   wx.ambient    // { tint: 'rgba(..)'|null, fog: 0..1 }   (water colour wash + haze for the renderer)
 *   wx.current    // { x, y } px/s, the autumn current (0 in other seasons) — handy for kelp decor sway
 *
 * `size` = drawn WIDTH in px (keep the sprite's aspect: 'ray' is 64×256, so it is 4 × size tall).
 * 'back' = under Dottie and the parade; 'front' = over everything (sparse, translucent).
 * Draw with translate(x,y) → rotate(rot) → scale(flipX, 1) → drawImage centred. Sprite 'dot' = a filled circle
 * of diameter `size` in `color`; others = assets/default/particles/<sprite>.svg.
 * update() runs fixed 1/60 s sub-steps with an accumulator, so the result is identical for any dt
 * partition (same seed + same setBiome/resize times + same env). Hard bound: < 160 particles.
 *
 * Motion models (docs/MECHANICS.md §7) — depth d ∈ (0, 1]: far = small, faint, slow; near = big, fast:
 *  - rise   : coral-spawn specks: buoyant terminal rise ∝ d, eased (drag), pendulum sway, slow spin
 *  - school : fish in a loose formation crossing the screen; the school path is a gentle sine, each fish
 *             has its own offset, lag wobble and tail wiggle; schools wait off-screen between crossings
 *  - ray    : light shafts hanging from the surface: slow sway of position and slant, caustic shimmer
 *  - bubble : buoyancy with drag → terminal rise that grows as the bubble rises (it expands: size grows too),
 *             zig-zag wobble (path instability of real bubbles) and a small shape wobble
 *  - tumble : kelp leaves carried by the current (it slowly changes strength and direction), near-neutral
 *             buoyancy (very slow sink), pendulum swing + tumbling rotation that speeds up in a strong current
 *  - drift  : tiny motes riding the current with a little random walk (wrap around)
 *  - sink   : marine snow, 3 depth layers: terminal fall ∝ d, sway, parallax drift
 *  - jelly  : pulse cycle: the bell squeezes (narrower + taller), a thrust kicks it up, drag slows it,
 *             it sinks a little until the next pulse; glow brightens on each pulse
 *  - fx     : 'bubble' (rises fast, wobbles, pops), 'sand' (puff out, heavy drag, settles, fades),
 *             'sparkle' (pops out, twinkles, fades)
 */
(function (RP) {
  'use strict';

  var TAU = Math.PI * 2;
  var MAX_PARTICLES = 158;            // hard bound (DESIGN §5.2: < 160)
  var FX_MAX = 30;                    // bursts + Dottie's bubbles
  var FISH_MAX = 12;                  // 2 schools × ≤ 6 fish
  var REF_AREA = 960 * 540;

  // count = steady-state particles per emitter on a 960×540 canvas (scaled by area ×0.6..×1.6;
  // `fixed` emitters (rays, jellies) scale only a little with width)
  var BIOMES = [
    { // 0 Spring Bloom — coral spawning: pink specks rising, little fish schools
      current: [6, 0],
      schools: 2,
      ambient: { tint: [255, 214, 214, 0.05], fog: 0.03 },
      emitters: [
        { kind: 'rise', layer: 'back', count: 16, size: [7, 12], alpha: [0.75, 0.95], sprite: 'spawn', depth: 0.55, rise: [9, 16] },
        { kind: 'rise', layer: 'front', count: 4, size: [13, 18], alpha: [0.55, 0.75], sprite: 'spawn', depth: 1, rise: [16, 24] },
        { kind: 'rise', layer: 'back', count: 10, size: [2, 3.5], alpha: [0.3, 0.55], sprite: 'dot', color: 'rgba(255,214,228,1)', depth: 0.25, rise: [4, 8] }
      ]
    },
    { // 1 Summer Shallows — sun rays dancing, bubbles, a fish school
      current: [4, 0],
      schools: 1,
      ambient: { tint: [190, 255, 250, 0.045], fog: 0.02 },
      emitters: [
        { kind: 'ray', layer: 'back', count: 4, fixed: true, size: [70, 120], alpha: [0.1, 0.2], sprite: 'ray', depth: 0.4 },
        { kind: 'bubble', layer: 'back', count: 10, size: [6, 11], alpha: [0.6, 0.9], sprite: 'bubble', depth: 0.55, rise: [28, 40] },
        { kind: 'bubble', layer: 'front', count: 3, size: [12, 18], alpha: [0.45, 0.7], sprite: 'bubble', depth: 1, rise: [40, 55] },
        { kind: 'drift', layer: 'back', count: 8, size: [2, 3], alpha: [0.3, 0.55], sprite: 'dot', color: 'rgba(255,255,235,1)', depth: 0.3 }
      ]
    },
    { // 2 Autumn Kelp — kelp leaves tumbling in a slowly changing current
      current: 'autumn',
      schools: 0,
      ambient: { tint: [255, 186, 110, 0.055], fog: 0.04 },
      emitters: [
        { kind: 'tumble', layer: 'back', count: 9, size: [18, 26], alpha: [0.75, 0.95], sprite: 'kelp', depth: 0.6 },
        { kind: 'tumble', layer: 'front', count: 3, size: [28, 36], alpha: [0.6, 0.8], sprite: 'kelp', depth: 1 },
        { kind: 'drift', layer: 'back', count: 14, size: [2, 4], alpha: [0.35, 0.6], sprite: 'dot', color: 'rgba(232,186,120,1)', depth: 0.35 }
      ]
    },
    { // 3 Winter Glow — marine snow in 3 depth layers, small glowing jellies
      current: [5, 0],
      schools: 0,
      ambient: { tint: [180, 205, 255, 0.06], fog: 0.05 },
      emitters: [
        { kind: 'sink', layer: 'back', count: 26, size: [2, 3.5], alpha: [0.45, 0.7], sprite: 'dot', color: 'rgba(240,248,255,1)', depth: 0.25, fall: [7, 12] },
        { kind: 'sink', layer: 'back', count: 16, size: [7, 11], alpha: [0.65, 0.9], sprite: 'snow', depth: 0.55, fall: [12, 20] },
        { kind: 'sink', layer: 'front', count: 6, size: [13, 18], alpha: [0.5, 0.7], sprite: 'snow', depth: 1, fall: [22, 32] },
        { kind: 'jelly', layer: 'back', count: 2, fixed: true, size: [22, 30], alpha: [0.7, 0.9], sprite: 'jelly', depth: 0.6 },
        { kind: 'jelly', layer: 'front', count: 1, fixed: true, size: [32, 38], alpha: [0.55, 0.75], sprite: 'jelly', depth: 1 }
      ]
    }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new RP.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.rampIn = opts.rampIn || 2;
    this.rampOut = opts.rampOut || 1;
    this.stepH = 1 / 60;
    this._acc = 0;
    this.particles = [];
    this.schools = [];
    this.ramp = [0, 0, 0, 0];
    this.biome = 0;
    this.season = 0;
    this.time = 0;
    this.current = { x: 0, y: 0 };
    this.ambient = { tint: null, fog: 0 };
    this._bubAcc = 0;
    this._scale = this._areaScale();
    this.setBiome(opts.biome || opts.season || 0, { instant: true });
  }
  Weather.BIOMES = BIOMES;
  Weather.MAX = MAX_PARTICLES;
  Weather.SPRITES = ['bubble', 'spawn', 'fish', 'ray', 'kelp', 'snow', 'jelly', 'sparkle', 'sand', 'dot'];

  Weather.prototype._areaScale = function () { return clamp(this.width * this.height / REF_AREA, 0.6, 1.6); };
  Weather.prototype._count = function (em) {
    if (em.fixed) return Math.max(1, Math.round(em.count * clamp(this.width / 960, 0.75, 1.3)));
    return Math.round(em.count * this._scale);
  };

  Weather.prototype.setBiome = function (i, opts) {
    i = (((i | 0) % 4) + 4) % 4;
    var instant = opts && opts.instant, p, k, n;
    this.biome = this.season = i;
    var B = BIOMES[i];
    if (instant) {
      for (k = this.particles.length - 1; k >= 0; k--) if (this.particles[k].biome >= 0) this.particles.splice(k, 1);
      this.schools.length = 0;
      this.ramp = [0, 0, 0, 0]; this.ramp[i] = 1;
      this._currentTarget(this.time, this.current);
      for (var e = 0; e < B.emitters.length; e++) for (k = 0, n = this._count(B.emitters[e]); k < n; k++) this._spawn(i, e, 'inside', 1);
    } else {
      for (k = 0; k < this.particles.length; k++) {
        p = this.particles[k];
        if (p.biome < 0) continue;
        if (p.biome !== i && !p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 1); }
        else if (p.biome === i) p.leaving = false;
      }
      // old schools swim on and leave; they are not re-launched
      for (k = 0; k < this.schools.length; k++) if (this.schools[k].biome !== i) this.schools[k].retire = true;
    }
    // this season's schools (first crossing starts soon, from off-screen)
    var live = 0;
    for (k = 0; k < this.schools.length; k++) if (this.schools[k].biome === i && !this.schools[k].retire) live++;
    for (k = live; k < B.schools; k++) this._newSchool(i, k === 0 && instant ? 'inside' : 'edge', k);
    this._updateAmbient();
  };
  Weather.prototype.setSeason = Weather.prototype.setBiome;

  /** resize(w, h): positions are scaled proportionally; counts follow the area on the next steps. */
  Weather.prototype.resize = function (w, h) {
    w = +w || this.width; h = +h || this.height;
    if (w === this.width && h === this.height) return;
    var sx = w / this.width, sy = h / this.height, i;
    for (i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      p.x *= sx; p.y *= sy;
      if (p.x0 !== undefined) p.x0 *= sx;
    }
    for (i = 0; i < this.schools.length; i++) { var s = this.schools[i]; s.x *= sx; s.y0 *= sy; }
    this.width = w; this.height = h;
    this._scale = this._areaScale();
  };

  /* --- the autumn current: slowly changing strength and direction (smooth, incommensurate sines) --- */
  Weather.prototype._currentTarget = function (t, out) {
    var c = BIOMES[this.biome].current;
    if (c === 'autumn') {
      out.x = 22 + 16 * Math.sin(t * 0.09) + 9 * Math.sin(t * 0.23 + 1.1);      // 0..47 px/s, sometimes calm
      out.y = 5 * Math.sin(t * 0.13 + 0.4) + 2;
    } else { out.x = c[0]; out.y = c[1]; }
    return out;
  };

  /* --- spawning --- */
  Weather.prototype._base = function (biome, kind, sprite, layer, depth) {
    return {
      sprite: sprite, x: 0, y: 0, size: 0, size0: 0, rot: 0, flipX: 1, alpha: 0, layer: layer,
      depth: depth, biome: biome, emitter: -1, kind: kind, baseAlpha: 1, fade: 1, leaving: false, leaveDelay: 0,
      phase: 0, omega: 0, amp: 0, spin: 0, vx: 0, vy: 0, age: 0, life: 0
    };
  };

  Weather.prototype._spawn = function (biome, ei, where, fade) {
    if (this.particles.length >= MAX_PARTICLES - FX_MAX - FISH_MAX) return null;
    var em = BIOMES[biome].emitters[ei], r = this.rng;
    var p = this._base(biome, em.kind, em.sprite, em.layer, em.depth !== undefined ? em.depth : (em.layer === 'front' ? 1 : 0.5));
    p.emitter = ei; p.fade = fade;
    p.baseAlpha = r.range(em.alpha[0], em.alpha[1]);
    if (em.color) p.color = em.color;
    this._init(p, em, where);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._init = function (p, em, where) {
    var r = this.rng, W = this.width, H = this.height, inside = where === 'inside', cur = this.current;
    p.size0 = p.size = r.range(em.size[0], em.size[1]);
    p.phase = r.range(0, TAU);
    p.age = 0; p.rot = 0; p.flipX = 1; p.vx = 0; p.vy = 0;
    switch (p.kind) {
      case 'rise':
        p.rise = r.range(em.rise[0], em.rise[1]);
        p.omega = r.range(0.6, 1.2); p.amp = r.range(4, 10) * (0.5 + p.depth);
        p.spin = r.range(-0.6, 0.6); p.rot = r.range(0, TAU);
        p.x0 = r.range(-10, W + 10); p.x = p.x0;
        p.y = inside ? r.range(0, H) : H + p.size + r.range(0, 30);
        p.vy = -p.rise;
        break;
      case 'bubble':
        p.rise = r.range(em.rise[0], em.rise[1]);
        p.omega = r.range(3, 5); p.amp = r.range(2, 5) * (0.5 + p.depth);
        p.x0 = r.range(10, W - 10); p.x = p.x0;
        p.y = inside ? r.range(0, H) : H + p.size + r.range(0, 60);
        p.vy = -p.rise * 0.5;
        break;
      case 'ray': {
        // spread the shafts across the width; hanging from the top edge
        var n = this._count(em), k = this._rayIdx = ((this._rayIdx || 0) + 1) % Math.max(1, n);
        p.size0 = p.size = r.range(em.size[0], em.size[1]) * Math.sqrt(Math.max(1, H / 540));
        p.x0 = (k + 0.5 + r.range(-0.3, 0.3)) * W / Math.max(1, n);
        p.omega = r.range(0.12, 0.2); p.amp = r.range(18, 40);
        p.tilt = r.range(0.18, 0.3); p.spin = r.range(0.25, 0.45);
        p.x = p.x0; p.y = p.size * 2 - p.size * 0.4;      // top of the shaft slightly above the screen
        break;
      }
      case 'tumble': {
        p.omega = r.range(1.2, 2.0); p.amp = r.range(10, 22) * (0.6 + 0.4 * p.depth);
        p.sink = r.range(3, 8);
        p.rot0 = r.range(0, TAU); p.spin = r.range(0.4, 0.9) * r.sign();
        p.tphase = r.range(0, TAU); p.tomega = r.range(0.6, 1.3) * r.sign();
        var up = cur.x >= 0 ? -1 : 1;                     // enter from the upstream side
        if (inside) { p.x = r.range(-20, W + 20); p.y = r.range(0, H); }
        else if (r.chance(0.8)) { p.x = up < 0 ? -p.size - r.range(0, 40) : W + p.size + r.range(0, 40); p.y = r.range(-20, H - 20); }
        else { p.x = r.range(0, W); p.y = -p.size - 10; }
        break;
      }
      case 'drift':
        p.x = r.range(0, W); p.y = r.range(0, H);
        p.tvx = r.range(-6, 6); p.tvy = r.range(-5, 5); p.vx = p.tvx; p.vy = p.tvy;
        p.retarget = r.range(1, 3); p.omega = r.range(1.5, 3.5);
        break;
      case 'sink':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(0.4, 1.0); p.amp = r.range(3, 9) * (0.5 + p.depth);
        p.spin = r.range(-0.5, 0.5); p.rot = r.range(0, TAU);
        if (inside) { p.x = r.range(-10, W + 10); p.y = r.range(-10, H); }
        else { p.x = r.range(-10, W + 10); p.y = -p.size - r.range(0, 30); }
        break;
      case 'jelly':
        p.period = r.range(2.2, 3.0); p.age = r.range(0, p.period);
        p.thrust = r.range(110, 140) * (0.7 + 0.3 * p.depth);
        p.x = r.range(W * 0.1, W * 0.9);
        p.y = inside ? r.range(H * 0.2, H * 0.95) : H + p.size + 20;
        p.vx = r.range(-5, 5); p.vy = inside ? 0 : -20;
        break;
    }
  };

  /* --- fish schools --- */
  Weather.prototype._fishCount = function () {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) if (this.particles[i].kind === 'fish') n++;
    return n;
  };

  Weather.prototype._newSchool = function (biome, where, k) {
    var r = this.rng, W = this.width, H = this.height;
    var sc = { biome: biome, dir: r.sign(), spd: r.range(34, 52), y0: r.range(H * 0.15, H * 0.85), x: 0, age: 0,
      amp: r.range(12, 28), omega: r.range(0.35, 0.6), phase: r.range(0, TAU), wait: where === 'inside' ? 0 : r.range(1.5, 4) + 3 * (k || 0),
      size: r.int(3, 6), fish: [], retire: false, fsize: r.range(12, 17) };
    sc.x = where === 'inside' ? r.range(W * 0.2, W * 0.8) : (sc.dir > 0 ? -80 : W + 80);
    this.schools.push(sc);
    this._fillSchool(sc);
    return sc;
  };

  Weather.prototype._fillSchool = function (sc) {
    var r = this.rng, i;
    for (i = 0; i < sc.fish.length; i++) { var q = sc.fish[i], j = this.particles.indexOf(q); if (j >= 0) this.particles.splice(j, 1); }
    sc.fish.length = 0;
    for (i = 0; i < sc.size; i++) {
      if (this._fishCount() >= FISH_MAX || this.particles.length >= MAX_PARTICLES - FX_MAX) break;
      var p = this._base(sc.biome, 'fish', 'fish', 'back', 0.6);
      // loose formation: a leader in front, the others staggered behind and to the sides
      p.ox = -i * r.range(14, 20) + r.range(-4, 4); p.oy = (i % 2 ? 1 : -1) * Math.ceil(i / 2) * r.range(9, 14);
      p.lag = r.range(0.1, 0.4) * i; p.phase = r.range(0, TAU); p.omega = r.range(9, 13);
      p.size0 = p.size = sc.fsize * r.range(0.85, 1.1);
      p.baseAlpha = r.range(0.8, 0.95); p.fade = 1;
      p.hidden = sc.wait > 0;
      sc.fish.push(p);
      this.particles.push(p);
    }
    this._placeSchool(sc);
  };

  Weather.prototype._schoolY = function (sc, t) { return sc.y0 + sc.amp * Math.sin(sc.omega * t + sc.phase); };

  Weather.prototype._placeSchool = function (sc) {
    for (var i = 0; i < sc.fish.length; i++) {
      var p = sc.fish[i], t = Math.max(0, sc.age - p.lag);
      var y = this._schoolY(sc, t), dy = sc.amp * sc.omega * Math.cos(sc.omega * t + sc.phase);
      var wob = Math.sin(p.phase * 0.23) * 3;
      p.x = sc.x + sc.dir * (p.ox - p.lag * sc.spd) + wob;
      p.y = y + p.oy + Math.cos(p.phase * 0.17) * 2;
      p.flipX = sc.dir;
      // heading tilt along the sine path + a tiny tail wiggle
      p.rot = Math.atan2(dy, sc.spd) * sc.dir * 0.8 + 0.06 * Math.sin(p.phase);
    }
  };

  Weather.prototype._stepSchools = function (h) {
    var W = this.width, H = this.height, r = this.rng;
    for (var k = this.schools.length - 1; k >= 0; k--) {
      var sc = this.schools[k], i;
      if (sc.wait > 0) {
        sc.wait -= h;
        for (i = 0; i < sc.fish.length; i++) { sc.fish[i].x = sc.dir > 0 ? -200 : W + 200; sc.fish[i].hidden = true; }
        continue;
      }
      sc.age += h; sc.x += sc.dir * sc.spd * h;
      for (i = 0; i < sc.fish.length; i++) { sc.fish[i].phase += sc.fish[i].omega * h; sc.fish[i].hidden = false; }
      this._placeSchool(sc);
      var gone = sc.dir > 0 ? sc.x > W + 160 : sc.x < -160;
      if (!gone) continue;
      if (sc.retire || sc.biome !== this.biome) {
        for (i = 0; i < sc.fish.length; i++) { var j = this.particles.indexOf(sc.fish[i]); if (j >= 0) this.particles.splice(j, 1); }
        this.schools.splice(k, 1);
        continue;
      }
      // relaunch: new side, height, size, after a little pause
      sc.dir = r.sign(); sc.spd = r.range(34, 52); sc.y0 = r.range(H * 0.15, H * 0.85); sc.amp = r.range(12, 28);
      sc.omega = r.range(0.35, 0.6); sc.phase = r.range(0, TAU); sc.age = 0; sc.wait = r.range(2, 6);
      sc.x = sc.dir > 0 ? -80 : W + 80; sc.size = r.int(3, 6); sc.fsize = r.range(12, 17);
      this._fillSchool(sc);
    }
  };

  /* --- motion --- */
  Weather.prototype._move = function (p, h) {
    var r = this.rng, W = this.width, H = this.height, cur = this.current, d = p.depth, e, u;
    p.age += h;
    switch (p.kind) {
      case 'rise': {
        // buoyant speck: vertical velocity eases to the terminal rise (drag), sways like a tiny pendulum
        e = 1 - Math.exp(-1.2 * h);
        p.vy += (-p.rise - p.vy) * e;
        p.phase += p.omega * h;
        p.x0 += cur.x * (0.4 + 0.6 * d) * h;
        p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y += p.vy * h;
        p.rot += p.spin * h;
        break;
      }
      case 'bubble': {
        // expands as it rises (lower pressure) → bigger and faster near the surface
        u = clamp(1 - p.y / H, 0, 1);
        var vt = p.rise * (1 + 0.6 * u);
        e = 1 - Math.exp(-1.5 * h);
        p.vy += (-vt - p.vy) * e;
        p.phase += p.omega * h;
        p.x0 += cur.x * 0.5 * h;
        p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y += p.vy * h;
        p.size = p.size0 * (1 + 0.25 * u);
        p.flipX = 1 + 0.08 * Math.sin(p.phase * 2);
        break;
      }
      case 'ray':
        p.phase += p.omega * h;
        p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.rot = p.tilt + 0.07 * Math.sin(p.phase * 0.7 + 1);
        p.flipX = 0.85 + 0.15 * Math.sin(p.phase * p.spin * 6);
        break;
      case 'tumble': {
        // near-neutral buoyancy: carried by the current, swinging + tumbling faster when the current is strong
        p.phase += p.omega * h;
        var ws = Math.min(1.6, Math.sqrt(cur.x * cur.x + cur.y * cur.y) / 25);
        p.x += (cur.x * (0.5 + 0.5 * d) + p.amp * p.omega * Math.cos(p.phase) * 0.6) * h;
        p.y += (p.sink + cur.y + 0.35 * p.amp * p.omega * Math.abs(Math.sin(p.phase))) * h * 0.6;
        p.rot0 += p.spin * (0.3 + ws) * h;
        p.rot = p.rot0 + 0.5 * Math.sin(p.phase);
        p.tphase += p.tomega * (0.5 + ws) * h;
        var ct = Math.cos(p.tphase);
        p.flipX = (ct >= 0 ? 1 : -1) * Math.max(0.2, Math.abs(ct));
        break;
      }
      case 'drift':
        p.retarget -= h;
        if (p.retarget <= 0) { p.tvx = r.range(-6, 6); p.tvy = r.range(-5, 5); p.retarget = r.range(1, 3); }
        e = 1 - Math.exp(-0.8 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += (p.vx + cur.x * (0.4 + 0.6 * d)) * h; p.y += (p.vy + cur.y * 0.5) * h;
        p.phase += p.omega * h;
        p.size = p.size0 * (0.8 + 0.2 * Math.sin(p.phase));
        if (p.x < -14) p.x += W + 28; else if (p.x > W + 14) p.x -= W + 28;
        if (p.y < -14) p.y += H + 28; else if (p.y > H + 14) p.y -= H + 28;
        break;
      case 'sink':
        p.phase += p.omega * h;
        p.x += (Math.cos(p.phase) * p.amp * p.omega + cur.x * (0.3 + 0.7 * d)) * h;
        p.y += p.fall * h;
        p.rot += p.spin * h;
        break;
      case 'jelly': {
        // pulse: contraction (first 18 % of the cycle) = thrust up; then drag + a little sinking
        var T = p.period, k = (p.age % T) / T, c = 0.18;
        if (k < c) {
          var s = Math.sin(Math.PI * k / c);
          p.vy -= p.thrust * s * h;
          p.flipX = 1 - 0.22 * s; p.size = p.size0 * (1 + 0.08 * s);
        } else {
          var q = (k - c) / (1 - c), ov = 0.05 * Math.sin(Math.PI * Math.min(1, q * 3)) * (1 - q);   // relax with a tiny overshoot
          p.flipX = 1 + ov; p.size = p.size0 * (1 - ov * 0.5);
        }
        p.vy += 6 * h;                                  // slightly heavier than water
        p.vy *= Math.exp(-1.6 * h); p.vx *= Math.exp(-0.3 * h);
        if (p.x < W * 0.06) p.vx += 4 * h; else if (p.x > W * 0.94) p.vx -= 4 * h;
        p.x += (p.vx + cur.x * 0.3) * h; p.y += p.vy * h;
        p.rot = clamp(p.vx / 60, -0.2, 0.2);
        p.glow = k < c ? Math.sin(Math.PI * k / c) : 0;
        break;
      }
      case 'bubblefx':
        e = 1 - Math.exp(-2.5 * h);
        p.vy += (-p.rise - p.vy) * e; p.vx *= Math.exp(-2 * h);
        p.phase += p.omega * h;
        p.x += (p.vx + Math.cos(p.phase) * 10) * h; p.y += p.vy * h;
        p.flipX = 1 + 0.1 * Math.sin(p.phase * 2);
        break;
      case 'sand':
        p.vx *= Math.exp(-4 * h); p.vy *= Math.exp(-4 * h);
        p.vy += 10 * h;
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.spin * h;
        u = clamp(p.age / p.life, 0, 1);
        p.size = p.size0 * (0.6 + 0.8 * u);
        break;
      case 'sparkle':
        p.vx *= Math.exp(-3 * h); p.vy *= Math.exp(-3 * h);
        p.x += p.vx * h; p.y += p.vy * h; p.rot += p.spin * h;
        u = clamp(p.age / p.life, 0, 1);
        p.size = p.size0 * (0.4 + 0.9 * Math.sin(Math.PI * u));
        break;
    }
  };

  Weather.prototype._outside = function (p) {
    var W = this.width, H = this.height, m = p.size + 20;
    switch (p.kind) {
      case 'rise': case 'bubble': case 'jelly': return p.y < -m - 10 || p.x < -m - 60 || p.x > W + m + 60 || (p.kind === 'jelly' && p.y > H + m + 60);
      case 'sink': return p.y > H + m || p.x < -m - 60 || p.x > W + m + 60;
      case 'tumble': return p.y > H + m + 20 || p.y < -m - 80 || p.x < -m - 80 || p.x > W + m + 80;
      default: return false;
    }
  };

  Weather.prototype._alphaOf = function (p) {
    var a = p.baseAlpha * clamp(p.fade, 0, 1), u;
    switch (p.kind) {
      case 'drift': a *= 0.55 + 0.45 * Math.sin(p.phase); break;
      case 'rise': a *= 0.75 + 0.25 * Math.sin(p.phase * 1.7); break;
      case 'ray': a *= 0.65 + 0.35 * Math.sin(this.time * 0.6 + p.phase * 3); break;
      case 'jelly': a *= 0.75 + 0.25 * (p.glow || 0); break;
      case 'fish': if (p.hidden) a = 0; break;
      case 'bubblefx': u = clamp(p.age / p.life, 0, 1); a *= Math.min(1, u * 8) * (u > 0.85 ? (1 - u) / 0.15 : 1); break;
      case 'sand': u = clamp(p.age / p.life, 0, 1); a *= (1 - u) * (1 - u); break;
      case 'sparkle': u = clamp(p.age / p.life, 0, 1); a *= 1 - u * u; break;
    }
    return clamp(a, 0, 1);
  };

  /* --- fx: bursts and Dottie's bubbles --- */
  Weather.prototype._fxCount = function () {
    var n = 0;
    for (var i = 0; i < this.particles.length; i++) if (this.particles[i].biome < 0) n++;
    return n;
  };

  Weather.prototype._fxSpawn = function (sprite, x, y, vx, vy, size, life) {
    if (this.particles.length >= MAX_PARTICLES || this._fxCount() >= FX_MAX) return null;
    var r = this.rng, kind = sprite === 'bubble' ? 'bubblefx' : sprite;
    var p = this._base(-1, kind, sprite, sprite === 'sand' ? 'back' : 'front', 1);
    p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.size0 = p.size = size; p.life = life;
    p.phase = r.range(0, TAU); p.omega = r.range(4, 7); p.spin = r.range(-3, 3); p.rot = sprite === 'bubble' ? 0 : r.range(0, TAU);
    p.rise = r.range(60, 95);
    p.baseAlpha = sprite === 'sand' ? 0.85 : 1;
    this.particles.push(p);
    return p;
  };

  /** burst(sprite, x, y, n): 'bubble' (flip, bonk, splash), 'sand' (golden star pops out / hides), 'sparkle' (pickups). */
  Weather.prototype.burst = function (sprite, x, y, n) {
    var r = this.rng;
    if (sprite !== 'bubble' && sprite !== 'sand') sprite = 'sparkle';
    n = Math.min(n || 6, 12);
    for (var i = 0; i < n; i++) {
      var a = r.range(0, TAU), p;
      if (sprite === 'bubble') p = this._fxSpawn('bubble', x + r.range(-6, 6), y + r.range(-6, 6), Math.cos(a) * r.range(10, 40), -r.range(20, 50), r.range(5, 11), r.range(0.9, 1.6));
      else if (sprite === 'sand') { var sp = r.range(30, 80); p = this._fxSpawn('sand', x, y, Math.cos(a) * sp, Math.sin(a) * sp * 0.6, r.range(12, 20), r.range(0.6, 0.9)); }
      else { var sq = r.range(40, 110); p = this._fxSpawn('sparkle', x, y, Math.cos(a) * sq, Math.sin(a) * sq, r.range(10, 16), r.range(0.45, 0.8)); }
      if (!p) break;
    }
  };

  Weather.prototype._fx = function (h, env) {
    var r = this.rng, hero = env && env.hero;
    var rate = 0;
    if (hero) { if (hero.jump > 0) rate = 10; else if (Math.abs(hero.turn || 0) > 3) rate = 4; }
    if (rate > 0) {
      this._bubAcc += h * rate;
      while (this._bubAcc >= 1) {
        this._bubAcc -= 1;
        var hd = hero.heading || 0;
        this._fxSpawn('bubble', hero.x - Math.cos(hd) * 10 + r.range(-5, 5), hero.y - (hero.z || 0) - Math.sin(hd) * 10 + r.range(-5, 5),
          -Math.cos(hd) * 20 + r.range(-10, 10), -r.range(10, 30), r.range(4, 8), r.range(0.8, 1.3));
      }
    } else this._bubAcc = 0;
  };

  /* --- per-step --- */
  Weather.prototype._step = function (h, env) {
    var i, p, b;
    this.time += h;
    for (b = 0; b < 4; b++) {
      if (b === this.biome) this.ramp[b] = Math.min(1, this.ramp[b] + h / this.rampIn);
      else this.ramp[b] = Math.max(0, this.ramp[b] - h / this.rampOut);
    }
    // current eases toward its (possibly changing) target: water has inertia
    var ct = this._ct || (this._ct = { x: 0, y: 0 });
    this._currentTarget(this.time, ct);
    var ce = 1 - Math.exp(-0.5 * h);
    this.current.x += (ct.x - this.current.x) * ce; this.current.y += (ct.y - this.current.y) * ce;
    this._fx(h, env);
    this._stepSchools(h);

    var ems = BIOMES[this.biome].emitters, have = this._have || (this._have = []);
    have.length = ems.length;
    for (i = 0; i < ems.length; i++) have[i] = 0;
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.biome === this.biome && !p.leaving && p.emitter >= 0) have[p.emitter]++;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      if (p.kind === 'fish') {
        if (p.leaving) { if (p.leaveDelay > 0) p.leaveDelay -= h; else p.fade -= h; }
        p.alpha = this._alphaOf(p);
        if (p.leaving && p.fade <= 0) { this._dropFish(p); this.particles.splice(i, 1); }
        continue;
      }
      this._move(p, h);
      if (p.biome < 0) {
        p.alpha = this._alphaOf(p);
        if (p.age >= p.life || p.y < -40 || p.y > this.height + 40) this.particles.splice(i, 1);
        continue;
      }
      if (p.fade < 1 && !p.leaving) p.fade = Math.min(1, p.fade + h / 0.9);
      if (p.leaving) { if (p.leaveDelay > 0) p.leaveDelay -= h; else p.fade -= h / 1.0; }
      p.alpha = this._alphaOf(p);
      if (p.leaving && p.fade <= 0) { this.particles.splice(i, 1); continue; }
      if (this._outside(p)) {
        var em = BIOMES[p.biome].emitters[p.emitter];
        var target = Math.round(this._count(em) * this.ramp[p.biome]);
        if (!p.leaving && p.biome === this.biome && have[p.emitter] <= target) { this._init(p, em, 'edge'); p.fade = 1; }
        else { this.particles.splice(i, 1); if (!p.leaving && p.biome === this.biome) have[p.emitter]--; }
      }
    }
    for (i = 0; i < ems.length; i++) {
      var want = Math.round(this._count(ems[i]) * this.ramp[this.biome]);
      while (have[i] < want && this._spawn(this.biome, i, 'inside', 0)) have[i]++;
      // shrink after a resize to a smaller canvas
      if (have[i] > want + 2) {
        for (var k = this.particles.length - 1; k >= 0 && have[i] > want; k--) {
          p = this.particles[k];
          if (p.biome === this.biome && p.emitter === i && !p.leaving) { p.leaving = true; p.leaveDelay = 0; have[i]--; }
        }
      }
    }
  };

  Weather.prototype._dropFish = function (p) {
    for (var k = this.schools.length - 1; k >= 0; k--) {
      var sc = this.schools[k], j = sc.fish.indexOf(p);
      if (j < 0) continue;
      sc.fish.splice(j, 1);
      if (!sc.fish.length && sc.biome !== this.biome) this.schools.splice(k, 1);
      return;
    }
  };

  Weather.prototype._updateAmbient = function () {
    var tot = 0, t = [0, 0, 0, 0], fog = 0, b;
    for (b = 0; b < 4; b++) tot += this.ramp[b];
    if (tot <= 0) tot = 1;
    for (b = 0; b < 4; b++) {
      var k = this.ramp[b] / tot, a = BIOMES[b].ambient;
      t[0] += a.tint[0] * k; t[1] += a.tint[1] * k; t[2] += a.tint[2] * k; t[3] += a.tint[3] * k;
      fog += a.fog * k;
    }
    this.ambient.tint = t[3] > 0.002 ?
      'rgba(' + Math.round(t[0]) + ',' + Math.round(t[1]) + ',' + Math.round(t[2]) + ',' + t[3].toFixed(3) + ')' : null;
    this.ambient.fog = fog;
  };

  /** update(dt, { hero }) — env optional. */
  Weather.prototype.update = function (dt, env) {
    if (!(dt > 0)) return;
    var h = this.stepH;
    this._acc += dt;
    // a huge dt (tab switch × speed) would just churn: cap the catch-up at 5 s of weather
    if (this._acc > 5) this._acc = 5;
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h, env || null); }
    if (this._acc < 0) this._acc = 0;
    this._updateAmbient();
  };

  /** Steady-state particle count of a season's own emitters at the current size, fish included (tests / debug). */
  Weather.prototype.fullCount = function (b) {
    var ems = BIOMES[b].emitters, n = 0;
    for (var i = 0; i < ems.length; i++) n += this._count(ems[i]);
    return n + BIOMES[b].schools * 6;
  };

  Weather.prototype.stats = function () {
    var o = { total: this.particles.length, back: 0, front: 0, bySprite: {}, byKind: {}, schools: this.schools.length };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      o[p.layer]++;
      o.bySprite[p.sprite] = (o.bySprite[p.sprite] || 0) + 1;
      o.byKind[p.kind] = (o.byKind[p.kind] || 0) + 1;
    }
    return o;
  };

  RP.Weather = Weather;
})(window.RP = window.RP || {});
