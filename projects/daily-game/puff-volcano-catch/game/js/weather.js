/* Puff's Volcano Catch — VC.Weather (volcano-island ambient particles, headless, deterministic)
 *
 *   const wx = new VC.Weather({ width:960, height:540, seed });
 *   wx.setZone(z, { instant:false });         // alias wx.setSeason(); smooth hand-over (~2 s)
 *   wx.update(dt, { volcano: w.volcano, rain: w.rain });
 *   wx.particles  // [{ sprite, x, y, size, rot, flipX, alpha, layer:'back'|'front', color?, kind, zone, depth, dark? }]
 *   wx.ambient    // { tint: 'rgba(..)'|null, fog: 0..1 }
 *
 * `size` = drawn width in px. 'back' = behind the flying items (sky / volcano band);
 * 'front' = over everything (kept sparse / translucent). Draw with translate(x,y) →
 * rotate(rot) → scale(flipX, 1). Sprite 'dot' = filled circle of diameter `size` in
 * `color`; others = assets/default/particles/<sprite>.svg. Smoke has `dark` 0..1
 * (born while the volcano rumbles): the renderer may tint it greyer.
 * update() runs fixed 1/60 s sub-steps with an accumulator (`_acc`), so the result is
 * identical for any dt partition (same seed + same setZone times + same env).
 *
 * Motion models (docs/MECHANICS.md §7):
 *  - smoke   : (all zones) born in the crater mouth, rises with buoyancy that fades,
 *              drifts with the wind, expands ×2.6 and fades; rate 0.9/s + 7/s × rumble
 *  - burst   : (all zones) on each eruption kick, embers fly out ballistically + smoke
 *  - rain    : (all zones) streaks falling in the Cool Rain column, front
 *  - twinkle : beach sea glints: fixed spot on the sea band (outside the cone), sin² life
 *  - drift   : soft wandering sparkles / pollen (velocity eases to random targets)
 *  - leaf    : falling-leaf pendulum: x = x0 + A·sin φ, rot follows the swing, falls
 *              faster at the bottom of the swing; occasional flipX tumble; depth layers
 *  - flutter : butterflies: wander targets + bob; wings flap via |flipX| 0.25..1
 *  - fall    : ash flakes: terminal fall, pendulum sway, tumble, parallax-scaled wind
 *  - rise    : crater embers: rise from the lava slopes, wobble, flicker, cool down
 *  - firefly : slow wander, glow pulse (alpha)
 *  - star    : fixed twinkling stars in the night sky (y < 200)
 */
(function (VC) {
  'use strict';

  var TAU = Math.PI * 2;
  var CRATER = { x: 480, y: 210 }, BASE_Y = 480, BASE_HALF = 300, MOUTH_HALF = 45;
  var MAX_PARTICLES = 158;          // hard bound (DESIGN §5.2: < 160)

  // count = steady-state particles per emitter (≤ 45 per zone)
  var ZONES = [
    { // 0 Sunny Beach (morning)
      wind: 8, smokeAlpha: 0.55,
      ambient: { tint: [255, 240, 200, 0.03], fog: 0 },
      emitters: [
        { kind: 'twinkle', layer: 'back', count: 16, size: [9, 15], alpha: [0.7, 1], sprite: 'sparkle', band: [300, 380] },
        { kind: 'twinkle', layer: 'back', count: 8, size: [2, 4], alpha: [0.6, 0.9], sprite: 'dot', color: 'rgba(255,255,240,1)', band: [305, 385] },
        { kind: 'drift', layer: 'back', count: 4, size: [8, 12], alpha: [0.45, 0.7], sprite: 'sparkle', band: [80, 300] },
        { kind: 'drift', layer: 'front', count: 2, size: [10, 14], alpha: [0.3, 0.45], sprite: 'sparkle', band: [120, 460], depth: 1 }
      ]
    },
    { // 1 Jungle Slopes (noon)
      wind: 12, smokeAlpha: 0.55,
      ambient: { tint: [200, 255, 190, 0.035], fog: 0.02 },
      emitters: [
        { kind: 'leaf', layer: 'back', count: 8, size: [12, 18], alpha: [0.75, 0.95], sprite: 'leaf', depth: 0.55, fall: [22, 34] },
        { kind: 'leaf', layer: 'front', count: 3, size: [22, 28], alpha: [0.85, 1], sprite: 'leaf', depth: 1, fall: [34, 46] },
        { kind: 'flutter', layer: 'back', count: 3, size: [18, 24], alpha: [0.9, 1], sprite: 'butterfly', band: [150, 430] },
        { kind: 'drift', layer: 'back', count: 8, size: [2, 4], alpha: [0.4, 0.75], sprite: 'dot', color: 'rgba(255,250,190,1)', band: [100, 470], depth: 0.3 }
      ]
    },
    { // 2 Ash Fields (sunset) — ash on a sideways wind, 3 depth layers
      wind: 34, smokeAlpha: 0.6,
      ambient: { tint: [255, 165, 110, 0.07], fog: 0.05 },
      emitters: [
        { kind: 'fall', layer: 'back', count: 14, size: [2, 3], alpha: [0.35, 0.55], sprite: 'dot', color: 'rgba(205,195,215,1)', depth: 0.25, fall: [10, 16] },
        { kind: 'fall', layer: 'back', count: 14, size: [8, 12], alpha: [0.65, 0.85], sprite: 'ash', depth: 0.55, fall: [18, 28], tumble: true },
        { kind: 'fall', layer: 'front', count: 5, size: [13, 17], alpha: [0.45, 0.6], sprite: 'ash', depth: 1, fall: [30, 42], tumble: true }
      ]
    },
    { // 3 Crater Rim (night)
      wind: 6, smokeAlpha: 0.45,
      ambient: { tint: [40, 45, 120, 0.12], fog: 0 },
      emitters: [
        { kind: 'star', layer: 'back', count: 20, size: [6, 11], alpha: [0.55, 1], sprite: 'star' },
        { kind: 'rise', layer: 'back', count: 16, size: [5, 10], alpha: [0.7, 1], sprite: 'ember' },
        { kind: 'firefly', layer: 'back', count: 4, size: [10, 14], alpha: [0.6, 1], sprite: 'firefly', band: [300, 465] },
        { kind: 'firefly', layer: 'front', count: 3, size: [12, 16], alpha: [0.5, 0.85], sprite: 'firefly', band: [330, 480], depth: 1 }
      ]
    }
  ];
  var SMOKE_MAX = 30, RAIN_MAX = 22, BURST_MAX = 12;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  // half-width of the volcano cone at height y (0 above the crater)
  function coneHalf(y) {
    if (y < CRATER.y) return 0;
    return MOUTH_HALF + (Math.min(y, BASE_Y) - CRATER.y) / (BASE_Y - CRATER.y) * (BASE_HALF - MOUTH_HALF);
  }

  function Weather(opts) {
    opts = opts || {};
    this.width = opts.width || 960;
    this.height = opts.height || 540;
    this.rng = new VC.RNG(opts.seed !== undefined ? opts.seed : 7);
    this.rampIn = opts.rampIn || 2;
    this.rampOut = opts.rampOut || 1;
    this.stepH = 1 / 60;
    this._acc = 0;
    this.particles = [];
    this.ramp = [0, 0, 0, 0];
    this.zone = 0;
    this.season = 0;                          // alias (sister-game contract)
    this.time = 0;
    this.wind = 0;
    this.ambient = { tint: null, fog: 0 };
    this._smokeAcc = 0; this._rainAcc = 0; this._lastGlow = 0;
    this.setZone(opts.zone || opts.season || 0, { instant: true });
    // pre-warm 2 s so the crater already smokes on the first frame
    for (var k = 0; k < 120; k++) this._step(this.stepH, null);
    this.time = 0;
  }
  Weather.ZONES = ZONES;
  Weather.MAX = MAX_PARTICLES;
  Weather.SPRITES = ['smoke', 'ember', 'ash', 'leaf', 'sparkle', 'rain', 'steam', 'firefly', 'butterfly', 'star', 'dot'];
  Weather.coneHalf = coneHalf;

  Weather.prototype.setZone = function (i, opts) {
    i = (((i | 0) % 4) + 4) % 4;
    var instant = opts && opts.instant, p, k;
    this.zone = this.season = i;
    if (instant) {
      for (k = this.particles.length - 1; k >= 0; k--) if (this.particles[k].zone >= 0) this.particles.splice(k, 1);
      this.ramp = [0, 0, 0, 0];
      this.ramp[i] = 1;
      this.wind = ZONES[i].wind;
      var ems = ZONES[i].emitters;
      for (var e = 0; e < ems.length; e++) for (k = 0; k < ems[e].count; k++) this._spawn(i, e, 'inside', 1);
    } else {
      for (k = 0; k < this.particles.length; k++) {
        p = this.particles[k];
        if (p.zone < 0) continue;
        if (p.zone !== i && !p.leaving) { p.leaving = true; p.leaveDelay = this.rng.range(0, 1); }
        else if (p.zone === i) p.leaving = false;
      }
    }
    this._updateAmbient();
  };
  Weather.prototype.setSeason = Weather.prototype.setZone;

  /* --- spawning --- */
  Weather.prototype._base = function (zone, kind, sprite, layer, depth) {
    return {
      sprite: sprite, x: 0, y: 0, size: 0, size0: 0, rot: 0, flipX: 1, alpha: 0, layer: layer,
      depth: depth, zone: zone, emitter: -1, kind: kind, baseAlpha: 1, fade: 1, leaving: false, leaveDelay: 0,
      phase: 0, omega: 0, amp: 0, spin: 0, vx: 0, vy: 0, age: 0, life: 0
    };
  };

  Weather.prototype._spawn = function (zone, ei, where, fade) {
    if (this.particles.length >= MAX_PARTICLES) return null;
    var em = ZONES[zone].emitters[ei], r = this.rng;
    var p = this._base(zone, em.kind, em.sprite, em.layer, em.depth !== undefined ? em.depth : (em.layer === 'front' ? 1 : 0.5));
    p.emitter = ei; p.fade = fade;
    p.baseAlpha = r.range(em.alpha[0], em.alpha[1]);
    if (em.color) p.color = em.color;
    this._init(p, em, where);
    this.particles.push(p);
    return p;
  };

  Weather.prototype._init = function (p, em, where) {
    var r = this.rng, W = this.width, H = this.height, inside = where === 'inside', band = em.band, k;
    p.size0 = p.size = r.range(em.size[0], em.size[1]);
    p.phase = r.range(0, TAU);
    p.age = 0; p.rot = 0; p.flipX = 1;
    switch (p.kind) {
      case 'twinkle':
        for (k = 0; k < 12; k++) {                       // on the visible sea, not on the cone
          p.y = r.range(band[0], band[1]); p.x = r.range(10, W - 10);
          if (Math.abs(p.x - CRATER.x) > coneHalf(p.y) + 12) break;
        }
        p.life = r.range(0.9, 2.2); p.age = inside ? r.range(0, p.life) : 0;
        p.rot = r.range(-0.3, 0.3);
        break;
      case 'drift':
        p.x = r.range(0, W); p.y = r.range(band[0], band[1]); p.y0 = band;
        p.tvx = r.range(-8, 8); p.tvy = r.range(-6, 4); p.vx = p.tvx; p.vy = p.tvy;
        p.retarget = r.range(1, 3); p.omega = r.range(1.5, 3.5); p.spin = r.range(-0.6, 0.6);
        break;
      case 'leaf':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(1.4, 2.2);                     // swing rate (rad/s)
        p.amp = r.range(18, 34) * (0.6 + 0.4 * p.depth); // swing half-width (px)
        p.x0 = r.range(-20, W + 20); p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y = inside ? r.range(60, H - 30) : r.range(-40, -14);
        p.tphase = r.range(0, TAU); p.tomega = r.range(0.4, 1.1) * r.sign();
        break;
      case 'flutter':
        p.x = r.range(60, W - 60); p.y = r.range(band[0], band[1]);
        p.tx = r.range(60, W - 60); p.ty = r.range(band[0], band[1]); p.retarget = r.range(1.5, 3.5);
        p.omega = r.range(11, 15); p.dir = 1;
        break;
      case 'fall':
        p.fall = r.range(em.fall[0], em.fall[1]);
        p.omega = r.range(0.5, 1.2); p.amp = r.range(4, 12) * (0.5 + p.depth);
        p.tumble = !!em.tumble;
        p.spin = em.tumble ? r.range(1.2, 3.2) * r.sign() : r.range(-0.6, 0.6);
        p.tomega = em.tumble ? r.range(2, 4.5) * r.sign() : 0; p.tphase = r.range(0, TAU);
        p.rot = r.range(0, TAU);
        // the wind blows right: re-enter on the left edge or the top
        if (inside) { p.x = r.range(-10, W + 10); p.y = r.range(60, H - 10); }
        else if (r.chance(0.55)) { p.x = r.range(-10, W + 10); p.y = r.range(40, 70); }
        else { p.x = r.range(-40, -14); p.y = r.range(70, H - 40); }
        break;
      case 'rise':
        p.x = CRATER.x + r.range(-110, 110); p.y = r.range(CRATER.y + 10, CRATER.y + 120);
        if (Math.abs(p.x - CRATER.x) > coneHalf(p.y) - 6) p.x = CRATER.x + Math.sign(p.x - CRATER.x || 1) * (coneHalf(p.y) - 6);
        p.vy = -r.range(26, 58); p.vx = r.range(-6, 6);
        p.life = r.range(2.2, 4); p.age = inside ? r.range(0, p.life * 0.8) : 0;
        p.omega = r.range(2, 4); p.amp = r.range(6, 14);
        if (inside) p.y += p.vy * p.age;
        break;
      case 'firefly':
        p.x = r.range(30, W - 30); p.y = r.range(band[0], band[1]);
        p.tvx = r.range(-14, 14); p.tvy = r.range(-8, 8); p.vx = p.tvx; p.vy = p.tvy; p.retarget = r.range(0.8, 2.2);
        p.omega = r.range(1.6, 3); p.band = band;
        break;
      case 'star':
        for (k = 0; k < 10; k++) { p.x = r.range(12, W - 12); p.y = r.range(70, 196); if (Math.abs(p.x - CRATER.x) > 70 || p.y < 150) break; }
        p.omega = r.range(1, 2.6); p.rot = r.range(0, TAU);
        break;
    }
  };

  /* --- motion --- */
  Weather.prototype._move = function (p, h) {
    var r = this.rng, W = this.width, H = this.height, wind = this.wind * (0.4 + 0.6 * p.depth), e, u;
    p.age += h;
    switch (p.kind) {
      case 'twinkle':
        u = p.age / p.life;
        if (u >= 1) { this._init(p, ZONES[p.zone].emitters[p.emitter], 'edge'); u = 0; }
        p.size = p.size0 * (0.5 + 0.7 * Math.sin(Math.PI * u));
        p.rot += 0.6 * h;
        break;
      case 'drift':
        p.retarget -= h;
        if (p.retarget <= 0) { p.tvx = r.range(-8, 8); p.tvy = r.range(-6, 4); p.retarget = r.range(1, 3); }
        e = 1 - Math.exp(-0.8 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += (p.vx + wind * 0.4) * h; p.y += p.vy * h;
        p.phase += p.omega * h; p.rot += p.spin * h;
        p.size = p.size0 * (0.8 + 0.2 * Math.sin(p.phase));
        if (p.x < -14) p.x += W + 28; else if (p.x > W + 14) p.x -= W + 28;
        if (p.y < p.y0[0]) p.tvy = Math.abs(p.tvy); else if (p.y > p.y0[1]) p.tvy = -Math.abs(p.tvy);
        break;
      case 'leaf': {
        // pendulum: φ advances; lateral position follows sin φ; the leaf tilts with the swing
        // direction and falls fastest through the bottom of the arc (|cos φ| = 1)
        p.phase += p.omega * h;
        var c = Math.cos(p.phase);
        p.x0 += wind * h;
        p.x = p.x0 + p.amp * Math.sin(p.phase);
        p.y += p.fall * (0.45 + 0.75 * Math.abs(c)) * h;
        p.rot = 0.55 * c + 0.12 * Math.sin(p.phase * 2);
        p.tphase += p.tomega * h;
        p.flipX = Math.cos(p.tphase) >= 0 ? Math.max(0.25, Math.abs(Math.cos(p.tphase))) : -Math.max(0.25, Math.abs(Math.cos(p.tphase)));
        break;
      }
      case 'flutter': {
        p.retarget -= h;
        var dx = p.tx - p.x, dy = p.ty - p.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
        if (p.retarget <= 0 || d < 12) {
          var em = ZONES[p.zone].emitters[p.emitter];
          p.tx = clamp(p.x + r.range(-220, 220), 40, W - 40); p.ty = r.range(em.band[0], em.band[1]); p.retarget = r.range(1.5, 3.5);
        }
        e = 1 - Math.exp(-1.6 * h);
        p.vx += (dx / d * 46 - p.vx) * e; p.vy += (dy / d * 30 - p.vy) * e;
        p.phase += p.omega * h;
        p.x += p.vx * h; p.y += (p.vy + Math.sin(p.phase * 0.25) * 14) * h;
        if (p.vx > 4) p.dir = 1; else if (p.vx < -4) p.dir = -1;
        p.flipX = p.dir * (0.25 + 0.75 * Math.abs(Math.sin(p.phase)));   // wing flap
        p.rot = clamp(p.vx / 200, -0.25, 0.25);
        break;
      }
      case 'fall':
        p.phase += p.omega * h;
        p.x += (Math.cos(p.phase) * p.amp * p.omega + wind) * h;
        p.y += p.fall * h;
        p.rot += p.spin * h;
        if (p.tumble) { p.tphase += p.tomega * h; p.flipX = Math.cos(p.tphase); }
        break;
      case 'rise':
        p.phase += p.omega * h;
        p.vy *= Math.exp(-0.25 * h);                       // buoyancy fades as it cools
        p.x += (p.vx + Math.sin(p.phase) * p.amp * 0.6 + wind * 0.5) * h; p.y += p.vy * h;
        p.size = p.size0 * (1 - 0.5 * clamp(p.age / p.life, 0, 1));
        if (p.age >= p.life) this._init(p, ZONES[p.zone].emitters[p.emitter], 'edge');
        break;
      case 'firefly':
        p.retarget -= h;
        if (p.retarget <= 0) { p.tvx = r.range(-14, 14); p.tvy = r.range(-8, 8); p.retarget = r.range(0.8, 2.2); }
        e = 1 - Math.exp(-1.2 * h);
        p.vx += (p.tvx - p.vx) * e; p.vy += (p.tvy - p.vy) * e;
        p.x += p.vx * h; p.y += p.vy * h; p.phase += p.omega * h;
        if (p.x < 20) p.tvx = Math.abs(p.tvx); else if (p.x > W - 20) p.tvx = -Math.abs(p.tvx);
        if (p.y < p.band[0]) p.tvy = Math.abs(p.tvy); else if (p.y > p.band[1]) p.tvy = -Math.abs(p.tvy);
        break;
      case 'star':
        p.phase += p.omega * h;
        break;
      case 'smoke': {
        // buoyant puff: rise speed decays, horizontal velocity relaxes to the wind
        e = 1 - Math.exp(-0.6 * h);
        p.vy *= Math.exp(-0.35 * h);
        p.vx += (this.wind * 0.8 - p.vx) * e;
        p.x += p.vx * h; p.y += p.vy * h;
        u = clamp(p.age / p.life, 0, 1);
        p.size = p.size0 * (1 + 1.6 * Math.sqrt(u));       // expands as it rises
        p.rot += p.spin * h;
        break;
      }
      case 'burst':
        p.vy += 260 * h; p.vx *= Math.exp(-0.8 * h);
        p.x += p.vx * h; p.y += p.vy * h;
        p.size = p.size0 * (1 - 0.6 * clamp(p.age / p.life, 0, 1));
        break;
      case 'rain':
        p.x += p.vx * h; p.y += p.vy * h;
        break;
    }
  };

  Weather.prototype._outside = function (p) {
    var W = this.width, H = this.height, m = p.size + 20;
    switch (p.kind) {
      case 'fall': case 'leaf': return p.y > H + m || p.x < -m - 60 || p.x > W + m + 40;
      case 'flutter': return p.x < -m || p.x > W + m;
      case 'rise': return p.y < -m;
      default: return false;
    }
  };

  Weather.prototype._alphaOf = function (p) {
    var a = p.baseAlpha * clamp(p.fade, 0, 1), u;
    switch (p.kind) {
      case 'twinkle': u = clamp(p.age / p.life, 0, 1); a *= Math.pow(Math.sin(Math.PI * u), 2); break;
      case 'drift': a *= 0.55 + 0.45 * Math.sin(p.phase); break;
      case 'rise': u = clamp(p.age / p.life, 0, 1); a *= Math.min(1, u * 8) * (1 - u) * (0.75 + 0.25 * Math.sin(p.phase * 3.1)); break;
      case 'firefly': a *= 0.25 + 0.75 * Math.pow(0.5 + 0.5 * Math.sin(p.phase), 2); break;
      case 'star': a *= 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(p.phase)); break;
      case 'smoke': u = clamp(p.age / p.life, 0, 1); a *= Math.min(1, u * 5) * (1 - u) * (1 - u); break;
      case 'burst': u = clamp(p.age / p.life, 0, 1); a *= 1 - u * u; break;
      case 'rain': a *= clamp(p.life - p.age, 0, 0.15) / 0.15; break;
    }
    return a;
  };

  /* --- volcano / rain driven fx (zone −1, never part of a hand-over) --- */
  Weather.prototype._fx = function (h, env) {
    var r = this.rng, vol = env && env.volcano, rain = env && env.rain, i, p, nSmoke = 0, nRain = 0, nBurst = 0;
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.kind === 'smoke') nSmoke++; else if (p.kind === 'rain') nRain++; else if (p.kind === 'burst') nBurst++;
    }
    var rumble = vol ? clamp(vol.rumble || 0, 0, 1) : 0, glow = vol ? (vol.glow || 0) : 0;
    // smoke: steady trickle, much more (and darker) while rumbling
    this._smokeAcc += h * (0.9 + 7 * rumble);
    while (this._smokeAcc >= 1) {
      this._smokeAcc -= 1;
      if (nSmoke >= SMOKE_MAX || this.particles.length >= MAX_PARTICLES) continue;
      p = this._base(-1, 'smoke', 'smoke', 'back', 0.5);
      p.x = CRATER.x + r.range(-MOUTH_HALF * 0.6, MOUTH_HALF * 0.6); p.y = CRATER.y + r.range(-4, 6);
      p.vx = r.range(-10, 10); p.vy = -r.range(32, 52) * (1 + 0.6 * rumble);
      p.size0 = p.size = r.range(18, 30); p.life = r.range(3, 4.5);
      p.spin = r.range(-0.4, 0.4); p.rot = r.range(0, TAU);
      p.dark = Math.round(rumble * 100) / 100;
      p.baseAlpha = ZONES[this.zone].smokeAlpha * (0.8 + 0.4 * rumble);
      this.particles.push(p); nSmoke++;
    }
    // eruption kick: glow jumps (0.2 + 0.55·rumble → +1) → burst of embers + smoke
    if (glow > 0.85 && this._lastGlow <= 0.85) {
      for (i = 0; i < 8 && nBurst < BURST_MAX && this.particles.length < MAX_PARTICLES; i++, nBurst++) {
        p = this._base(-1, 'burst', 'ember', 'back', 0.5);
        var ang = -Math.PI / 2 + r.range(-0.7, 0.7), sp = r.range(160, 300);
        p.x = CRATER.x + r.range(-20, 20); p.y = CRATER.y; p.vx = Math.cos(ang) * sp; p.vy = Math.sin(ang) * sp;
        p.size0 = p.size = r.range(7, 12); p.life = r.range(0.7, 1.2); p.baseAlpha = 1;
        this.particles.push(p);
      }
      this._smokeAcc += 3;
    }
    this._lastGlow = glow;
    // Cool Rain streaks inside the column
    if (rain && rain.active > 0) {
      this._rainAcc += h * 70;
      while (this._rainAcc >= 1) {
        this._rainAcc -= 1;
        if (nRain >= RAIN_MAX || this.particles.length >= MAX_PARTICLES) continue;
        p = this._base(-1, 'rain', 'rain', 'front', 1);
        var hw = (rain.w || 130) / 2;
        p.x = (rain.x || 480) + r.range(-hw, hw); p.y = r.range(70, 140);
        p.vx = this.wind * 0.3; p.vy = r.range(620, 760);
        p.rot = -Math.atan2(p.vx, p.vy);                 // streak leans along its motion
        p.size0 = p.size = r.range(10, 14); p.baseAlpha = r.range(0.6, 0.9);
        p.life = (392 - p.y) / p.vy;                       // ends at Puff's body
        this.particles.push(p); nRain++;
      }
    } else this._rainAcc = 0;
  };

  /* --- per-step --- */
  Weather.prototype._step = function (h, env) {
    var i, p, b;
    this.time += h;
    for (b = 0; b < 4; b++) {
      if (b === this.zone) this.ramp[b] = Math.min(1, this.ramp[b] + h / this.rampIn);
      else this.ramp[b] = Math.max(0, this.ramp[b] - h / this.rampOut);
    }
    this.wind += (ZONES[this.zone].wind - this.wind) * (1 - Math.exp(-0.8 * h));
    this._fx(h, env);

    var ems = ZONES[this.zone].emitters, have = [];
    for (i = 0; i < ems.length; i++) have.push(0);
    for (i = 0; i < this.particles.length; i++) {
      p = this.particles[i];
      if (p.zone === this.zone && !p.leaving) have[p.emitter]++;
    }
    for (i = this.particles.length - 1; i >= 0; i--) {
      p = this.particles[i];
      this._move(p, h);
      if (p.zone < 0) {                                    // fx particles: fixed lifetime
        p.alpha = this._alphaOf(p);
        if (p.age >= p.life) this.particles.splice(i, 1);
        continue;
      }
      if (p.fade < 1 && !p.leaving) p.fade = Math.min(1, p.fade + h / 0.9);
      if (p.leaving) { if (p.leaveDelay > 0) p.leaveDelay -= h; else p.fade -= h / 1.0; }
      p.alpha = this._alphaOf(p);
      if (p.leaving && p.fade <= 0) { this.particles.splice(i, 1); continue; }
      if (this._outside(p)) {
        var em = ZONES[p.zone].emitters[p.emitter];
        var target = Math.round(em.count * this.ramp[p.zone]);
        if (!p.leaving && p.zone === this.zone && have[p.emitter] <= target) { this._init(p, em, 'edge'); p.fade = 1; }
        else { this.particles.splice(i, 1); if (!p.leaving && p.zone === this.zone) have[p.emitter]--; }
      }
    }
    for (i = 0; i < ems.length; i++) {
      var want = Math.round(ems[i].count * this.ramp[this.zone]);
      while (have[i] < want && this.particles.length < MAX_PARTICLES) { this._spawn(this.zone, i, 'inside', 0); have[i]++; }
    }
  };

  Weather.prototype._updateAmbient = function () {
    var tot = 0, t = [0, 0, 0, 0], fog = 0, b;
    for (b = 0; b < 4; b++) tot += this.ramp[b];
    if (tot <= 0) tot = 1;
    for (b = 0; b < 4; b++) {
      var k = this.ramp[b] / tot, a = ZONES[b].ambient;
      t[0] += a.tint[0] * k; t[1] += a.tint[1] * k; t[2] += a.tint[2] * k; t[3] += a.tint[3] * k;
      fog += a.fog * k;
    }
    this.ambient.tint = t[3] > 0.002 ?
      'rgba(' + Math.round(t[0]) + ',' + Math.round(t[1]) + ',' + Math.round(t[2]) + ',' + t[3].toFixed(3) + ')' : null;
    this.ambient.fog = fog;
  };

  /** update(dt, { volcano:{rumble,glow,shake}, rain:{active,x,w} }) — both optional. */
  Weather.prototype.update = function (dt, env) {
    if (!(dt > 0)) return;
    var h = this.stepH;
    this._acc += dt;
    while (this._acc >= h - 1e-12) { this._acc -= h; this._step(h, env || null); }
    if (this._acc < 0) this._acc = 0;
    this._updateAmbient();
  };

  /** Steady-state particle count of a zone's own emitters (tests / debug). */
  Weather.prototype.fullCount = function (z) {
    var ems = ZONES[z].emitters, n = 0;
    for (var i = 0; i < ems.length; i++) n += ems[i].count;
    return n;
  };

  Weather.prototype.stats = function () {
    var o = { total: this.particles.length, back: 0, front: 0, bySprite: {}, byKind: {} };
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      o[p.layer]++;
      o.bySprite[p.sprite] = (o.bySprite[p.sprite] || 0) + 1;
      o.byKind[p.kind] = (o.byKind[p.kind] || 0) + 1;
    }
    return o;
  };

  VC.Weather = Weather;
})(window.VC = window.VC || {});
