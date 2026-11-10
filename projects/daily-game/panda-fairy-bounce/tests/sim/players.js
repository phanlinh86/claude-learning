// Mochi's Fairy Bounce — player models for the high-speed playtest (tests/sim/playtest.js).
// Every model only uses the public input API: world.setPaddleTarget(x) and world.serve() (like a finger / a tap).
'use strict';

/** wrap the shipped MFB.Bot */
function botPlayer(MFB, skill) {
  return (w, seed) => {
    const bot = new MFB.Bot(w, { skill, seed: seed * 7 + 1 });
    return dt => bot.step(dt);
  };
}

/** a ring buffer of what the player "saw" (ball x/y, sampled every frame) so we can look back `delay` seconds */
function eyes() {
  const buf = [];
  return {
    push(t, w) { const b = w.ball; buf.push({ t, x: b ? b.x : null, y: b ? b.y : null, vx: b ? b.vx : 0, vy: b ? b.vy : 0 }); if (buf.length > 240) buf.shift(); },
    at(t) { for (let i = buf.length - 1; i >= 0; i--) if (buf[i].t <= t) return buf[i]; return buf[0]; }
  };
}

/**
 * a 5-year-old: sees the ball ~0.5 s late (σ 0.12), puts the finger where the ball IS (no prediction),
 * overshoots by ~35 % of the jump, hand noise ±0.45 u, refreshes the finger every 0.12–0.3 s,
 * and sometimes "looks away" (≈ every 20 s for 1–2.5 s the finger stops). Taps to serve after 0.8–2.5 s
 * (sometimes never: the 3 s auto-serve does it). Chases a falling star when the ball is going up (40 % of stars).
 */
function kid5(MFB, o) {
  o = Object.assign({ delay: 0.5, over: 0.35, noise: 0.45 }, o || {});
  return (w, seed) => {
    const R = new MFB.RNG(seed * 31 + 5), E = eyes();
    let t = 0, next = 0, finger = 8, lapseUntil = -1, serveAt = -1, starPlan = null;
    const delay = () => Math.max(0.2, o.delay + 0.12 * R.gauss());
    return dt => {
      t += dt; E.push(t, w);
      if (w.phase === 'serve') {
        if (serveAt < 0) serveAt = R.chance(0.3) ? 1e9 : t + R.range(0.8, 2.5);
        if (t >= serveAt) { w.serve(); serveAt = -1; }
      } else serveAt = -1;
      if (t < lapseUntil) return;
      if (R.chance(dt / 20)) { lapseUntil = t + R.range(1, 2.5); return; }
      if (t < next) return;
      next = t + R.range(0.12, 0.3);
      const seen = E.at(t - delay());
      let goal = seen.x === null ? 8 : seen.x;
      if (seen.vy > 0 && w.stars.length) {
        const s = w.stars[0];
        if (starPlan !== s.id) { starPlan = R.chance(0.4) ? s.id : -s.id; }
        if (starPlan === s.id) goal = s.x;
      }
      const jump = goal - finger;
      finger = goal + o.over * jump * (Math.abs(jump) > 0.6 ? 1 : 0) + o.noise * R.gauss();
      w.setPaddleTarget(finger);
    };
  };
}

/** a casual adult: 0.22 s late, predicts the landing x once the ball is falling below y 6 (with σ 0.3 u),
 *  otherwise follows the ball; grabs a star while the ball is high; serves after ~0.6 s; no aiming. */
function adult(MFB) {
  return (w, seed) => {
    const R = new MFB.RNG(seed * 17 + 3), E = eyes(), C = MFB.World.CONFIG;
    let t = 0, next = 0, serveAt = -1, err = 0, lastSign = 0;
    return dt => {
      t += dt; E.push(t, w);
      if (w.phase === 'serve') { if (serveAt < 0) serveAt = t + R.range(0.4, 0.9); if (t >= serveAt) { w.serve(); serveAt = -1; } }
      else serveAt = -1;
      if (t < next) return;
      next = t + 0.08;
      const s = E.at(t - 0.22);
      if (s.x === null) { w.setPaddleTarget(8); return; }
      const sign = s.vy < 0 ? -1 : 1;
      if (sign !== lastSign) { lastSign = sign; err = 0.3 * R.gauss(); }
      let goal = s.x;
      if (s.vy < 0 && s.y < 6) {
        const line = C.PADDLE_Y + C.BALL_R, T = (s.y - line) / -s.vy;
        goal = fold(s.x + s.vx * T, C.BALL_R, C.FIELD_W - C.BALL_R) + err;
      } else if (s.vy > 0 && s.y < 3.5 && w.stars.length) {
        let best = null; for (const st of w.stars) if (st.y < 4 && (!best || st.y < best.y)) best = st;
        if (best) goal = best.x;
      }
      w.setPaddleTarget(goal);
    };
  };
}
function fold(x, a, b) { const L = b - a; let u = (x - a) % (2 * L); if (u < 0) u += 2 * L; return a + (u <= L ? u : 2 * L - u); }

/** exploit: the finger parked at x0, taps serve at once */
function parked(MFB, x0) {
  return w => dt => { w.setPaddleTarget(x0); if (w.phase === 'serve') w.serve(); };
}
/** exploit: wiggle around the middle (amplitude A u, f Hz) */
function wiggler(MFB, A, f) {
  return w => { let t = 0; return dt => { t += dt; w.setPaddleTarget(8 + A * Math.sin(2 * Math.PI * f * t)); }; };
}
/** idle: never touches the screen (auto-serve only) */
function idle() { return () => () => {}; }

function models(MFB) {
  const m = {};
  for (const s of [0.2, 0.3, 0.5, 0.8, 1.0]) m['bot' + s.toFixed(1)] = botPlayer(MFB, s);
  m.kid5 = kid5(MFB);
  m.kid5fast = kid5(MFB, { delay: 0.35, over: 0.25, noise: 0.35 });   // a quick 5-year-old
  m.kid4 = kid5(MFB, { delay: 0.65, over: 0.45, noise: 0.6 });          // a younger / slower child
  m.adult = adult(MFB);
  m.park8 = parked(MFB, 8);
  m.park5 = parked(MFB, 5);
  m.wiggle = wiggler(MFB, 2.5, 0.7);
  m.idle = idle();
  return m;
}
module.exports = { models, kid5, adult, botPlayer };
