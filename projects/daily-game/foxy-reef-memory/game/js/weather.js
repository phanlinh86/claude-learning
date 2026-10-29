/* Foxy's Reef Memory — RF.Weather (underwater seasonal particles, headless, deterministic)
 *
 *   const wx = new RF.Weather({ width:960, height:540, seed });
 *   wx.setSeason(i, { instant:false });   // smooth hand-over (~2 s: old fades out, new ramps in)
 *   wx.update(dt, { current });           // optional extra current px/s (+ = right)
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?, depth, kind, season }]
 *   wx.ambient    // { tint: 'rgba(..)'|null, rays: 0..1, fog: 0..1 }
 *
 * `size` = drawn width in px. Renderer: 'back' layer behind the board/Foxy,
 * 'front' over everything (kept small, sparse and translucent so the cards stay readable).
 * Draw with translate(x,y) → rotate(rot) → scale(flipX, 1). Sprite 'dot' = filled
 * circle of diameter `size` in `color`. Other sprites = particles/<sprite>.svg.
 *
 * Motion models (see docs/MECHANICS.md):
 *  - bubble  : rises at a size-dependent terminal speed, sinusoidal side wobble,
 *              squash (flipX 0.88..1), grows ~15 % on the way up (less pressure)
 *  - plankton: slow random drift (velocity eases to a new random target every 1–3 s),
 *              twinkle in alpha, wraps around the screen
 *  - fish    : schools (boids-lite: each fish springs to its slot in a loose formation,
 *              aligns with the school, separates from close neighbours); tail frames
 *              alternate fish_a / fish_b; the school follows a gentle sine path across
 *  - kelp    : tumbling bits carried by a sideways current (pendulum sway + spin + flipX tumble)
 *  - seasnow : 3 depth layers: far = tiny dim slow dots, mid = dots, near = 'snow' sprite;
 *              slow sinking + sway, parallax-scaled current
 *  - jelly   : pulse cycle: contract (jelly_b) → thrust up, relax (jelly_a) → sink slowly;
 *              glow brightens on each pulse
 */
(function (RF) {
  'use strict';

  var TAU = Math.PI * 2;

  // count = steady-state particles. Schools: count = schools, members = fish per school.
  var SEASONS = [
    { // 0 spring — plankton sparkles + bubbles + a small fish school
      current: 6,
      ambient: { tint: [110, 255, 220, 0.04], rays: 0.2, fog: 0 },
      emitters: [
        { kind: 'plankton', layer: 'back',  count: 22, size: [6, 11],  alpha: [0.55, 0.95], sprite: 'plankton' },
        { kind: 'plankton', layer: 'back',  count: 12, size: [2, 4],   alpha: [0.4, 0.8], sprite: 'dot', color: 'rgba(220,255,240,1)', depth: 0.2 },
        { kind: 'bubble',   layer: 'back',  count: 9,  size: [6, 12],  alpha: [0.55, 0.8] },
        { kind: 'bubble',   layer: 'front', count: 3,  size: [10, 15], alpha: [0.35, 0.5] },
        { kind: 'school',   layer: 'back',  count: 1,  members: [6, 8], size: [14, 18], alpha: [0.85, 1] }
      ]
    },
    { // 1 summer — bubbles + 2 fish schools + god rays
      current: 4,
      ambient: { tint: [255, 240, 170, 0.04], rays: 0.35, fog: 0 },
      emitters: [
        { kind: 'bubble',   layer: 'back',  count: 16, size: [5, 12],  alpha: [0.55, 0.85] },
        { kind: 'bubble',   layer: 'front', count: 4,  size: [10, 16], alpha: [0.35, 0.5] },
        { kind: 'school',   layer: 'back',  count: 2,  members: [6, 8], size: [15, 22], alpha: [0.9, 1] },
        { kind: 'plankton', layer: 'back',  count: 12, size: [2, 4],   alpha: [0.35, 0.7], sprite: 'dot', color: 'rgba(255,250,210,1)', depth: 0.3 }
      ]
    },
    { // 2 autumn — kelp bits in a sideways current + bubbles + fish
      current: 38,
      ambient: { tint: [255, 165, 70, 0.07], rays: 0.15, fog: 0.05 },
      emitters: [
        { kind: 'kelp',     layer: 'back',  count: 16, size: [12, 18], alpha: [0.8, 0.95], depth: 0.6 },
        { kind: 'kelp',     layer: 'front', count: 4,  size: [16, 22], alpha: [0.5, 0.6], depth: 1 },
        { kind: 'bubble',   layer: 'back',  count: 9,  size: [6, 12],  alpha: [0.5, 0.75] },
        { kind: 'bubble',   layer: 'front', count: 2,  size: [10, 14], alpha: [0.35, 0.45] },
        { kind: 'school',   layer: 'back',  count: 1,  members: [5, 7], size: [14, 20], alpha: [0.85, 1] },
        { kind: 'plankton', layer: 'back',  count: 10, size: [2, 4],   alpha: [0.35, 0.7], sprite: 'dot', color: 'rgba(255,220,160,1)', depth: 0.3 }
      ]
    },
    { // 3 winter — sea snow in 3 depth layers + glowing jellies + fog
      current: 8,
      ambient: { tint: [40, 70, 160, 0.12], rays: 0.05, fog: 0.3 },
      emitters: [
        { kind: 'seasnow',  layer: 'back',  count: 28, size: [2, 3],   alpha: [0.35, 0.55], sprite: 'dot', color: 'rgba(225,238,255,1)', depth: 0.2, fall: [7, 12] },
        { kind: 'seasnow',  layer: 'back',  count: 16, size: [3, 5],   alpha: [0.6, 0.8],  sprite: 'dot', color: 'rgba(235,245,255,1)', depth: 0.5, fall: [12, 20] },
        { kind: 'seasnow',  layer: 'back',  count: 8,  size: [9, 13],  alpha: [0.75, 0.9], sprite: 'snow', depth: 0.8, fall: [18, 28] },
        { kind: 'seasnow',  layer: 'front', count: 5,  size: [12, 16], alpha: [0.45, 0.55], sprite: 'snow', depth: 1, fall: [26, 36] },
        { kind: 'jelly',    layer: 'back',  count: 4,  size: [24, 34], alpha: [0.7, 0.85] },
        { kind: 'bubble',   layer: 'back',  count: 4,  size: [5, 9],   alpha: [0.45, 0.65] }
      ]
    }
  ];

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function emCount(em) { return em.kind === 'school' ? 0 : em.count; }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.floorY = opts.floorY || 470;         // bubbles start around here
    this.rng = new RF.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.rampIn = opts.rampIn || 2;
    this.rampOut = opts.rampOut || 1;
    this.maxStep = 1 / 60;
    this.particles = [];
    this.schools = [];                        // added: { id, season, emitter, x, y, vx, ... }
    this.ramp = [0, 0, 0, 0];
    this.season = 0;
    this.time = 0;
    this.current = 0;                         // added: current px/s in effect (season base + env)
    this.ambient = { tint: null, rays: 0, fog: 0 };
    this._schoolId = 1;
    this.setSeason(opts.season || 0, { instant: true });
  }
  Weather.SEASONS = SEASONS;

  Weather.prototype.setSeason = function (i, opts) {
    i = ((i % 4) + 4) % 4;
    var instant = opts && opts.instant, p, k;
    this.season = i;
    if (instant) {
      this.particles.length = 0;
      this.schools.length = 0;
      this.ramp = [0, 0, 0, 0];
      this.ramp[i] = 1;
      this.current = SEASONS[i].current;
      var ems = SEASONS[i].emitters;
      for (var e = 0; e < ems.length; e++) {
        if (ems[e].kind === 'school') { for (k = 0; k < ems[e].count; k++) this._spawnSchool(i, e, 'inside', 1); }
        else for (k = 0; k < ems[e].count; k++) this._spawn(i, e, 'inside', 1);
      }
    } else {
      for (k = 0; k < this.particles.length; k++) {
        p = this.particles[k];
        if (p.season !== i && !p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 1); }
        else if (p.season === i) p.leaving = false;
      }
      for (k = 0; k < this.schools.length; k++) {
        var s = this.schools[k];
        s.leaving = s.season !== i;
      }
    }
    this._updateAmbient();
  };

  /* --- spawning --- */
  Weather.prototype._base = function (season, ei, em) {
    var r = this.rng;
    var p = {
      sprite: em.sprite || em.kind, x: 0, y: 0,
      size: r.range(em.size[0], em.size[1]),
      rot: 0, flipX: 1, alpha: 0, layer: em.layer,
      depth: em.depth !== undefined ? em.depth : (em.layer === 'front' ? 1 : 0.5),
      season: season, emitter: ei, kind: em.kind,
      baseAlpha: r.range(em.alpha[0], em.alpha[1]),
      fade: 0, leaving: false, leaveDelay: 0,
      phase: r.range(0, TAU), omega: 0, amp: 0, spin: 0, vx: 0, vy: 0, age: 0
    };
    if (em.color) p.color = em.color;
    return p;
  };

  Weather.prototype._spawn = function (season, ei, where, fade) {
    var em = SEASONS[season].emitters[ei], p = this._base(season, ei, em);
    p.fade = fade;
    this._init(p, em, where);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._init = function (p, em, where) {
    var r = this.rng, W = this.width, H = this.height, inside = where === 'inside';
    p.size = r.range(em.size[0], em.size[1]);
    p.phase = r.range(0, TAU);
    p.age = 0;
    switch (p.kind) {
      case 'bubble':
        p.size0 = p.size;
        // small bubbles: terminal speed grows with size (Stokes-like), clamp for calm visuals
        p.rise = 22 + p.size0 * 3.2 + r.range(-5, 5);
        p.omega = r.range(3, 5.5); p.amp = r.range(2.5, 6) * (p.size0 / 10);
        p.x = r.range(10, W - 10);
        p.y = inside ? r.range(40, this.floorY) : r.range(this.floorY - 10, H + 10);
        p.y0 = p.y;
        break;
      case 'plankton':
        p.x = r.range(0, W); p.y = r.range(20, H - 40);
        p.tvx = r.range(-8, 8); p.tvy = r.range(-6, 6); p.vx = p.tvx; p.vy = p.tvy;
        p.retarget = r.range(1, 3); p.omega = r.range(1.5, 4);
        break;
      case 'kelp':
        p.fall = r.range(6, 18);
        p.omega = r.range(1.2, 2.2); p.amp = r.range(8, 18);
        p.spin = r.range(0.8, 2.5) * r.sign(); p.tomega = r.range(2, 4) * r.sign(); p.tphase = r.range(0, TAU);
        p.rot = r.range(0, TAU);
        if (inside) { p.x = r.range(-10, W + 10); p.y = r.range(20, H - 80); }
        else { p.x = this.current >= 0 ? -p.size - 10 : W + p.size + 10; p.y = r.range(10, H - 120); }
        break;
      case 'seasnow':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(0.4, 1.0); p.amp = r.range(3, 9) * (0.5 + p.depth);
        p.spin = r.range(-0.5, 0.5); p.rot = r.range(0, TAU);
        p.x = r.range(-10, W + 10);
        p.y = inside ? r.range(-10, H - 20) : r.range(-30, -8);
        break;
      case 'jelly':
        p.period = r.range(1.6, 2.4); p.pt = r.next() * p.period;
        p.sway = r.range(4, 9);
        p.x = r.range(60, W - 60);
        p.y = inside ? r.range(80, H - 90) : H + p.size;
        p.rot = 0;
        break;
    }
    p.flipX = 1;
  };

  Weather.prototype._spawnSchool = function (season, ei, where, fade) {
    var r = this.rng, em = SEASONS[season].emitters[ei], W = this.width;
    var dir = r.sign(), speed = r.range(38, 62);
    var s = {
      id: this._schoolId++, season: season, emitter: ei, leaving: false,
      dir: dir, vx: dir * speed, baseY: r.range(110, 400), amp: r.range(10, 30), omega: r.range(0.3, 0.6),
      phase: r.range(0, TAU), x: 0, y: 0, members: []
    };
    s.x = where === 'inside' ? r.range(100, W - 100) : (dir > 0 ? -90 : W + 90);
    s.y = s.baseY;
    var n = r.int(em.members[0], em.members[1]);
    for (var k = 0; k < n; k++) {
      var p = this._base(season, ei, em);
      p.kind = 'fish'; p.sprite = 'fish_a';
      p.school = s.id;
      p.fade = fade;
      p.ox = r.range(-50, 50); p.oy = r.range(-24, 24);
      p.x = s.x + p.ox; p.y = s.y + p.oy;
      p.vx = s.vx; p.vy = 0;
      p.tail = r.range(4, 6); p.tp = r.next();
      p.flipX = dir;
      s.members.push(p);
      this.particles.push(p);
    }
    this.schools.push(s);
    return s;
  };

  /* --- motion --- */
  Weather.prototype._move = function (p, h) {
    var r = this.rng, W = this.width, H = this.height, cur = this.current * (0.4 + 0.6 * p.depth);
    p.age += h;
    switch (p.kind) {
      case 'bubble':
        p.phase += p.omega * h;
        p.x += (Math.cos(p.phase) * p.amp * p.omega + cur * 0.5) * h;
        p.y -= p.rise * h;
        p.size = p.size0 * (1 + 0.15 * clamp((p.y0 - p.y) / H, 0, 1));
        p.flipX = 0.94 + 0.06 * Math.sin(p.phase * 2);       // wobble squash
        p.rot = 0;
        break;
      case 'plankton':
        p.retarget -= h;
        if (p.retarget <= 0) { p.tvx = r.range(-8, 8); p.tvy = r.range(-6, 6); p.retarget = r.range(1, 3); }
        var e = 1 - Math.exp(-0.8 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += (p.vx + cur * 0.6) * h; p.y += p.vy * h;
        p.phase += p.omega * h;
        p.rot += 0.3 * h;
        // wrap (constant density, no edge pops)
        if (p.x < -12) p.x += W + 24; else if (p.x > W + 12) p.x -= W + 24;
        if (p.y < 10) p.y = 10, p.tvy = Math.abs(p.tvy); else if (p.y > H - 30) p.y = H - 30, p.tvy = -Math.abs(p.tvy);
        break;
      case 'kelp':
        p.phase += p.omega * h;
        p.tphase += p.tomega * h;
        p.x += (cur * 1.4 + Math.cos(p.phase) * p.amp * p.omega * 0.6) * h;
        p.y += (p.fall + Math.sin(p.phase) * 10) * h;
        p.rot += p.spin * h;
        p.flipX = Math.cos(p.tphase);
        break;
      case 'seasnow':
        p.phase += p.omega * h;
        p.x += (Math.cos(p.phase) * p.amp * p.omega + cur * 0.6) * h;
        p.y += p.fall * h;
        p.rot += p.spin * h;
        break;
      case 'jelly':
        p.pt += h;
        if (p.pt >= p.period) p.pt -= p.period;
        var u = p.pt / p.period;
        if (u < 0.3) {                         // contraction → thrust
          p.sprite = 'jelly_b';
          p.vy += (-42 - p.vy) * (1 - Math.exp(-8 * h));
        } else {                               // relax → drag + slow sink
          p.sprite = 'jelly_a';
          p.vy += (8 - p.vy) * (1 - Math.exp(-1.6 * h));
        }
        p.y += p.vy * h;
        p.phase += h * 0.5;
        p.x += (Math.sin(p.phase) * p.sway * 0.5 + cur * 0.3) * h;
        p.rot = 0.12 * Math.sin(p.phase);
        p.flipX = u < 0.3 ? 0.92 : 1;          // squeeze while pulsing
        p.glow = u < 0.3 ? 1 - u / 0.3 * 0.4 : 0.6 * (1 - (u - 0.3) / 0.7);
        if (p.y < -p.size - 10) { p.y = H + p.size; p.x = r.range(60, W - 60); }
        break;
    }
  };

  Weather.prototype._moveSchool = function (s, h) {
    var W = this.width, cur = this.current * 0.5, i, j, m, n;
    s.phase += s.omega * h;
    var syPrev = s.y;
    s.x += (s.vx + cur * 0.3) * h;
    s.y = s.baseY + Math.sin(s.phase) * s.amp;
    var svy = (s.y - syPrev) / h;
    var ms = s.members;
    for (i = 0; i < ms.length; i++) {
      m = ms[i];
      // boids-lite: spring to formation slot (cohesion), match school velocity (alignment), separation
      var ax = (s.x + m.ox - m.x) * 2.2 + (s.vx - m.vx) * 1.6;
      var ay = (s.y + m.oy - m.y) * 2.2 + (svy - m.vy) * 1.6;
      for (j = 0; j < ms.length; j++) {
        if (j === i) continue;
        n = ms[j];
        var dx = m.x - n.x, dy = m.y - n.y, d2 = dx * dx + dy * dy;
        if (d2 < 196 && d2 > 1e-6) { var d = Math.sqrt(d2); ax += dx / d * (14 - d) * 6; ay += dy / d * (14 - d) * 6; }
      }
      // little individual wiggle
      ay += Math.sin(this.time * 2.3 + m.phase) * 6;
      m.vx += ax * h; m.vy += ay * h;
      m.x += m.vx * h; m.y += m.vy * h;
      m.tp += m.tail * h;
      if (m.tp >= 1) m.tp -= Math.floor(m.tp);
      m.sprite = m.tp < 0.5 ? 'fish_a' : 'fish_b';
      m.flipX = m.vx >= 0 ? 1 : -1;
      m.rot = clamp(Math.atan2(m.vy, Math.abs(m.vx) + 1e-6), -0.4, 0.4) * m.flipX;
      m.age += h;
    }
    // done when the whole school has left the far side
    var out = true;
    for (i = 0; i < ms.length; i++) {
      if (s.dir > 0 ? ms[i].x < W + 40 : ms[i].x > -40) { out = false; break; }
    }
    return out;
  };

  Weather.prototype._outside = function (p) {
    var W = this.width, H = this.height, m = p.size + 20;
    switch (p.kind) {
      case 'bubble': return p.y < -m;
      case 'kelp': return p.x < -m - 20 || p.x > W + m + 20 || p.y > H + m;
      case 'seasnow': return p.y > H + m || p.x < -m - 30 || p.x > W + m + 30;
      default: return false;      // plankton & jellies wrap; fish handled by schools
    }
  };

  /* --- per-step --- */
  Weather.prototype._step = function (h, envCurrent) {
    var i, p, s, k;
    this.time += h;
    for (s = 0; s < 4; s++) {
      if (s === this.season) this.ramp[s] = Math.min(1, this.ramp[s] + h / this.rampIn);
      else this.ramp[s] = Math.max(0, this.ramp[s] - h / this.rampOut);
    }
    // current blends between seasons (smooth hand-over of the autumn sideways push)
    var cTarget = SEASONS[this.season].current + envCurrent;
    this.current += (cTarget - this.current) * (1 - Math.exp(-0.8 * h));

    var ems = SEASONS[this.season].emitters, have = [];
    for (i = 0; i < ems.length; i++) have.push(0);
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.season === this.season && !p.leaving && p.kind !== 'fish') have[p.emitter]++;
    }
    // schools
    var schoolsHave = [];
    for (i = 0; i < ems.length; i++) schoolsHave.push(0);
    for (i = this.schools.length - 1; i >= 0; i--) {
      var sc = this.schools[i];
      var done = this._moveSchool(sc, h);
      var gone = sc.leaving && sc.members.every(function (m) { return m.fade <= 0; });
      if (done || gone) {
        for (k = 0; k < sc.members.length; k++) sc.members[k]._dead = true;
        this.schools.splice(i, 1);
      } else if (!sc.leaving && sc.season === this.season) schoolsHave[sc.emitter]++;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      if (p._dead) { this.particles.splice(i, 1); continue; }
      if (p.kind !== 'fish') this._move(p, h);
      if (p.fade < 1 && !p.leaving) p.fade = Math.min(1, p.fade + h / 0.9);
      if (p.leaving) {
        if (p.leaveDelay > 0) p.leaveDelay -= h;
        else p.fade -= h / 1.0;
      }
      var a = p.baseAlpha * clamp(p.fade, 0, 1);
      if (p.kind === 'plankton') a *= 0.55 + 0.45 * Math.sin(p.phase);
      if (p.kind === 'jelly') a *= 0.75 + 0.25 * (p.glow || 0);
      if (p.kind === 'bubble' && p.y > this.floorY - 20) a *= clamp((this.height - p.y) / 90, 0, 1);
      p.alpha = a;
      if (p.leaving && p.fade <= 0 && p.kind !== 'fish') { this.particles.splice(i, 1); continue; }
      if (p.kind !== 'fish' && this._outside(p)) {
        var em = SEASONS[p.season].emitters[p.emitter];
        var target = Math.round(emCount(em) * this.ramp[p.season]);
        if (!p.leaving && p.season === this.season && have[p.emitter] <= target) {
          this._init(p, em, 'edge');
          p.fade = 1;
        } else {
          this.particles.splice(i, 1);
          if (!p.leaving && p.season === this.season) have[p.emitter]--;
        }
      }
    }
    // ramp-in fill (fade in, spawn inside the view) + school replacement
    for (i = 0; i < ems.length; i++) {
      if (ems[i].kind === 'school') {
        var wantS = this.ramp[this.season] >= 0.5 ? ems[i].count : 0;
        while (schoolsHave[i] < wantS) {
          this._spawnSchool(this.season, i, this.ramp[this.season] < 1 ? 'inside' : 'edge', 0);
          schoolsHave[i]++;
        }
        continue;
      }
      var want = Math.round(ems[i].count * this.ramp[this.season]);
      while (have[i] < want) { this._spawn(this.season, i, 'inside', 0); have[i]++; }
    }
  };

  Weather.prototype._updateAmbient = function () {
    var tot = 0, t = [0, 0, 0, 0], rays = 0, fog = 0, s;
    for (s = 0; s < 4; s++) tot += this.ramp[s];
    if (tot <= 0) tot = 1;
    for (s = 0; s < 4; s++) {
      var k = this.ramp[s] / tot, a = SEASONS[s].ambient;
      t[0] += a.tint[0] * k; t[1] += a.tint[1] * k; t[2] += a.tint[2] * k; t[3] += a.tint[3] * k;
      rays += a.rays * k; fog += a.fog * k;
    }
    this.ambient.tint = t[3] > 0.002 ?
      'rgba(' + Math.round(t[0]) + ',' + Math.round(t[1]) + ',' + Math.round(t[2]) + ',' + t[3].toFixed(3) + ')' : null;
    this.ambient.rays = rays;
    this.ambient.fog = fog;
  };

  Weather.prototype.update = function (dt, env) {
    if (!(dt > 0)) return;
    var cur = (env && env.current) || 0;
    var n = Math.max(1, Math.ceil(dt / this.maxStep - 1e-9)), h = dt / n;
    for (var i = 0; i < n; i++) this._step(h, cur);
    this._updateAmbient();
  };

  /** Steady-state particle count of a season (tests / debug). */
  Weather.prototype.fullCount = function (season) {
    var ems = SEASONS[season].emitters, n = 0;
    for (var i = 0; i < ems.length; i++) n += ems[i].kind === 'school' ? ems[i].count * ems[i].members[1] : ems[i].count;
    return n;
  };

  Weather.prototype.stats = function () {
    var o = { total: this.particles.length, back: 0, front: 0, schools: this.schools.length, bySprite: {} };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      o[p.layer]++;
      o.bySprite[p.sprite] = (o.bySprite[p.sprite] || 0) + 1;
    }
    return o;
  };

  RF.Weather = Weather;
})(window.RF = window.RF || {});
