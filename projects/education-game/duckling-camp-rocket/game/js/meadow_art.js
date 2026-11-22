/* DK.MeadowArt (Mimi's Splash Rocket) — the campsite meadow below the horizon + the camp corner, pure canvas code
 * (DESIGN §2, §3, §4.4).
 *
 *   DK.MeadowArt.drawMeadow(ctx, layout, mood, opt)  the ground below layout.horizon: a grass gradient (the far-meadow colour
 *       right under the forest edge, a light hazy band, the base green, deeper near the viewer), soft mown stripes that
 *       converge in perspective, seeded grass tufts / tiny flowers / pebbles (sparse; mats are drawn on top), a few edge
 *       decorations (env/flowers, env/rock; landscape: two pines at the right edge), and the CAMP CORNER inside layout.camp:
 *       a trodden clearing under Mimi / pad / pump, 2 tents behind Mimi, the campfire, a log seat, a windsock (+ a pine /
 *       rock / flowers when there is room) — all kept ≥ 30 px from the Mimi / pad / pump / pole (+ pennants) boxes.
 *       rain: wet darker grass (MEADOW colours), puddles on the clearing. opt = { t, wind (−1..1; |v| > 1.5 is read as px/s²
 *       and divided by 60), wet 0..1 (animated sheen), quality, alpha, dpr (device px per logical px, default 1) }.
 *       The static part is cached per (W, H, layout, mood, dpr) as one offscreen bitmap (cropped to the rows it covers;
 *       ≤ 4 kept, so a mood crossfade keeps both); a frame only draws the bitmap + the flame(s) + the windsock + the sheen.
 *       Sprites missing (not loaded yet) → drawn live without them and not cached.
 *   DK.MeadowArt.drawFlame(ctx, x, y, s, t)            the animated campfire flame, base centre (x, y); s = scale (flame ≈ 62·s
 *       tall). For a placed campfire prop p: drawFlame(ctx, p.fx, p.fy, p.s, t).
 *   DK.MeadowArt.drawWindsock(ctx, x, y, s, wind, t)    the cloth sock only, for a windsock pole sprite drawn with its anchor
 *       (bottom centre) at (x, y) and scale s (hinge = (x + 2·s, y − 162·s)). wind as in drawMeadow: 0 → hangs down,
 *       0.7 (breezy) → nearly horizontal and rippling; the sign picks the side.
 *   DK.MeadowArt.campProps(layout) → [{kind, x, y, s, box: {x, y, w, h}, fx?, fy?, hx?, hy?}]  the placed props (bottom-centre
 *       anchors, s = scale of the sprite's viewBox; kinds tent_a | tent_b | campfire | log | windsock | pine | rock | flowers),
 *       back-to-front. Cached per layout. (render / tests can check overlaps)
 *   DK.MeadowArt.keepBoxes(layout) → [{n, x, y, w, h}]  the boxes the props keep ≥ 30 px away from (mimi, rocket/pad, pump,
 *       pole, pennants, bubble, hud).
 *   DK.MeadowArt.fakeLayout(W, H, portrait) → a plausible DESIGN §2 layout (zero insets) for scenes / tests; the real one is
 *       world.layout.
 *   DK.MeadowArt.MEADOW (per mood colours), MOODS, SPRITES (asset keys used), _reset().
 * mood: 'sunny'|'breezy'|'rain'|'rainbow' or 0..3. Node-safe at load (no DOM until drawing; no canvas → draws live).
 */
(function (DK) {
  'use strict';
  const MOODS = ['sunny', 'breezy', 'rain', 'rainbow'];
  const mIndex = m => (typeof m === 'number' ? ((Math.round(m) % 4) + 4) % 4 : Math.max(0, MOODS.indexOf(m)));
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const hexRgb = h => [1, 3, 5].map(i => parseInt(h.substr(i, 2), 16));
  const mix = (a, b, t) => '#' + hexRgb(a).map((v, i) => Math.round(v + (hexRgb(b)[i] - v) * t).toString(16).padStart(2, '0')).join('').toUpperCase();
  const rgba = (h, a) => { const c = hexRgb(h); return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

  // ---- palette (DESIGN §3; mirrors tools/art_env.js MEADOW — same formulas) ----
  const SKY_BOT = ['#F3F7EE', '#F1F3EA', '#DCE2E6', '#FBF3E6'];
  const BASE = [['#A9CF8E', '#9CC48A'], ['#A2C78C', '#97BD88'], ['#8FB385', '#86A982'], ['#AFD596', '#A2CB90']];
  const MEADOW = BASE.map(([base, far], i) => ({
    base, far, light: mix(base, SKY_BOT[i], 0.22), near: mix(base, '#5E8A5E', 0.2), tuft: mix(base, '#4E7560', 0.38),
    stripe: mix(base, '#FFFFFF', 0.16), dirt: i === 2 ? '#B9AC8A' : '#D3C49C', dirtEdge: i === 2 ? '#A2967A' : '#BDAE86',
  }));
  const BITS = ['#FBF8F0', '#E4DEEE', '#F6EBC8'];               // tiny meadow flowers: cream, lilac-grey, butter (pale)
  const PEB = { body: '#B3B4B0', ol: '#7E807B', hi: '#D9DAD6' };
  const LOG = { body: '#8A6244', ol: '#5E4330', end: '#D9B98E', ring: '#B08A62', hi: '#A57E5E' };
  const PUDDLE = { body: '#B7C9CE', ol: '#8FA7AE', hi: '#FFFFFF' };
  const SOCK = ['#F6EEDC', '#8FB8B2'], SOCK_OL = '#5E8580';
  const FL = { glow: '#FBD9A0', outer: '#F7B267', outerOl: '#E39A5A', mid: '#F9C98A', core: '#FCE6BC', spark: '#FBD9A0' };
  // sprite table: [w, h, anchorX, anchorY] (viewBox, bottom-centre anchors) — tools/art_env.js SPRITES
  const SP = {
    tent_a: [260, 200, 130, 196], tent_b: [260, 200, 130, 196], campfire: [140, 120, 70, 114], pine: [160, 300, 80, 294],
    rock: [120, 80, 60, 76], flowers: [140, 70, 70, 68], windsock: [120, 200, 60, 196],
  };
  const FLAME_BASE = [70, 92], HINGE = [62, 34];
  const SPRITES = Object.keys(SP).map(k => 'env/' + k);

  /* ---------------------------------------------------------------- fake layout (DESIGN §2, zero insets) */
  function fakeLayout(W, H, portrait) {
    if (portrait == null) portrait = H > W;
    const ins = { top: 0, left: 0, right: 0, bottom: 0 };
    const tall = H / W > 1.6, phone = Math.max(W, H) / Math.min(W, H) > 1.9;
    const bubble = portrait ? { x: 24, y: 110, w: W - 48, h: 124 } : { x: 24, y: 18, w: Math.min(700, W - 224), h: 134 };
    const hud = { x: W - 160, y: 0, w: 160, h: 96 };
    const play = { x0: 0, y0: bubble.y + bubble.h + 10, x1: W, y1: H - (portrait ? 26 : 14) };
    let camp, meadow, horizon, mimiHome, pad, pump, pole, mimiH;
    if (!portrait) {
      const campW = W < 1100 ? 230 : 270;
      camp = { x: 0, y: play.y0, w: ins.left + campW, h: H - play.y0 };
      meadow = { x: camp.x + camp.w, y: play.y0, w: W - ins.right - camp.w, h: H - play.y0 };
      horizon = Math.round(play.y0 + 0.30 * (H - play.y0));
      mimiH = 180;
      pole = { x: ins.left + 40, y0: H - ins.bottom - 30, y1: play.y0 + 30 };
      mimiHome = { x: ins.left + 100, y: H - ins.bottom - 70 };
      pad = { x: ins.left + campW - 70, y: H - ins.bottom - 60 };
      pump = { x: ins.left + campW - 110, y: H - ins.bottom - 40 };
    } else {
      const campH = Math.round(280 * (tall ? 1.15 : 1));
      camp = { x: 0, y: H - ins.bottom - campH, w: W, h: campH + ins.bottom };
      meadow = { x: 0, y: play.y0, w: W, h: camp.y - play.y0 };
      horizon = play.y0 + 120;
      mimiH = phone ? 200 : 170;
      mimiHome = { x: ins.left + 120, y: H - ins.bottom - 70 };
      pad = { x: W / 2, y: H - ins.bottom - 60 };
      pump = { x: W / 2 + 110, y: H - ins.bottom - 60 };
      pole = { x: W - ins.right - 70, y0: H - ins.bottom - 40, y1: camp.y - 180 };
    }
    const S = 170, itemH = 0.62 * S, hitR = Math.max(phone ? 92 : 0, 0.6 * (S * 0.8) + 14);
    return { W, H, ins, portrait, tall, phone, bubble, hud, play, camp, meadow, horizon, mimiHome, mimiH, pad, pump, pole, rocketH: 120, S, itemH, hitR };
  }

  /* ---------------------------------------------------------------- keep boxes + prop placement */
  const PENNANT_W = 76, PENNANT_SLOTS = 4, PENNANT_PITCH = 46;
  function keepBoxes(L) {
    const out = [];
    const mh = L.mimiH || (L.portrait ? 170 : 180);
    if (L.mimiHome) out.push({ n: 'mimi', x: L.mimiHome.x - 0.45 * mh, y: L.mimiHome.y - mh, w: 0.9 * mh, h: mh + 10 });
    if (L.pad) { const rh = L.rocketH || 120; out.push({ n: 'pad', x: L.pad.x - 52, y: L.pad.y - rh - 24, w: 104, h: rh + 44 }); }
    if (L.pump) out.push({ n: 'pump', x: L.pump.x - 52, y: L.pump.y - 44, w: 104, h: 96 });
    if (L.pole) {
      // the world's pennant size when it has one (QA P2-4: bigger pennants), else the art defaults
      const pw = L.pennantW ? L.pennantW + 20 : PENNANT_W, pp = L.pennantPitch || PENNANT_PITCH, ph = L.pennantH ? L.pennantH + 16 : 60;
      const p = L.pole, right = p.x + pw + 10 <= L.W - ((L.ins && L.ins.right) || 0);
      out.push({ n: 'pole', x: p.x - 12, y: p.y1 - 14, w: 24, h: p.y0 - p.y1 + 24 });
      out.push({ n: 'pennants', x: right ? p.x : p.x - pw, y: p.y1 + 10, w: pw, h: 24 + (PENNANT_SLOTS - 1) * pp + ph });
    }
    if (L.bubble) out.push({ n: 'bubble', x: L.bubble.x, y: L.bubble.y, w: L.bubble.w, h: L.bubble.h });
    if (L.hud) out.push({ n: 'hud', x: L.hud.x, y: L.hud.y, w: L.hud.w, h: L.hud.h });
    return out;
  }
  const KEEP_GAP = { bubble: 8, hud: 8, pennants: 12 };   // px; everything else (mimi, pad, pump, pole) 30
  const hit = (a, b, m) => a.x < b.x + b.w + m && a.x + a.w + m > b.x && a.y < b.y + b.h + m && a.y + a.h + m > b.y;
  /** bounding box of a prop (sprite boxes trimmed to their visible art) */
  function propBox(kind, x, y, s) {
    if (kind === 'log') return { x: x - 50 * s, y: y - 26 * s, w: 100 * s, h: 28 * s };
    if (kind === 'windsock') return { x: x - 26 * s, y: y - 182 * s, w: 110 * s, h: 186 * s };
    const sp = SP[kind], trim = kind === 'tent_a' || kind === 'tent_b' ? [6, 16, 6, 0] : kind === 'pine' ? [24, 8, 24, 0] : [4, 4, 4, 0];
    return { x: x - sp[2] * s + trim[0] * s, y: y - sp[3] * s + trim[1] * s, w: (sp[0] - trim[0] - trim[2]) * s, h: (sp[3] - trim[1] + 4) * s };
  }
  function layoutKey(L) {
    const r = v => (v == null ? '' : Math.round(v));
    const c = L.camp || {}, p = L.pole || {}, m = L.mimiHome || {}, d = L.pad || {}, u = L.pump || {}, b = L.bubble || {};
    return [L.W, L.H, c.x, c.y, c.w, c.h, L.horizon, m.x, m.y, L.mimiH, d.x, d.y, u.x, u.y, p.x, p.y0, p.y1, b.x, b.y, b.w, b.h].map(r).join(',');
  }
  let PROPS = new Map();
  function campProps(L) {
    if (!L || !L.camp) return [];
    const key = layoutKey(L);
    let out = PROPS.get(key);
    if (out) return out;
    out = placeProps(L);
    if (PROPS.size > 8) PROPS.delete(PROPS.keys().next().value);
    PROPS.set(key, out);
    return out;
  }
  function placeProps(L) {
    const W = L.W, H = L.H, ins = L.ins || { top: 0, left: 0, right: 0, bottom: 0 }, c = L.camp, hz = L.horizon;
    const keep = keepBoxes(L), placed = [];
    const yMin = (L.portrait ? c.y : hz) + 6, yMax = H - ins.bottom - 8;
    const xMin = Math.max(c.x, ins.left) + 4, xMax = Math.min(c.x + c.w, W - ins.right) - 4;
    const depth = y => 0.82 + 0.18 * clamp((y - hz) / Math.max(1, H - hz), 0, 1);
    const mh = L.mimiH || 180, mimi = L.mimiHome || { x: c.x + c.w / 2, y: H - 70 }, pad = L.pad || mimi, pump = L.pump || pad;
    const mTop = mimi.y - mh, campH = c.h - ins.bottom;
    const ok = (b, kind, y) => {
      if (b.x < xMin || b.x + b.w > xMax || b.y < (L.portrait ? c.y + 2 : (L.play ? L.play.y0 : c.y))) return false;
      for (const k of keep) if (hit(b, k, KEEP_GAP[k.n] == null ? 30 : KEEP_GAP[k.n])) return false;
      for (const p of placed) {
        const q = p.box, sh = 0.1;
        // the two tents may overlap a little (a cosy cluster): ≥ 14 px apart in depth, ≤ 45 % of the back one hidden
        if (kind === 'tent_b' && p.kind === 'tent_a' && Math.abs(y - p.y) >= 14) { const ov = Math.min(b.x + b.w, q.x + q.w) - Math.max(b.x, q.x); if (ov <= 0.45 * (y < p.y ? b.w : q.w)) continue; }
        if (hit(b, { x: q.x + q.w * sh, y: q.y + q.h * sh, w: q.w * (1 - 2 * sh), h: q.h * (1 - 2 * sh) }, 4)) return false;
      }
      return true;
    };
    const place = (kind, s0, s1, tx, ty, maxD, must) => {
      let best = null;
      for (let s = s0; s >= s1 - 1e-6 && !best; s -= 0.04) {
        let bd = 1e18;
        for (let y = yMin; y <= yMax; y += 6) {
          const k = s * depth(y);
          for (let x = xMin; x <= xMax; x += 6) {
            const b = propBox(kind, x, y, k);
            const d = (x - tx) * (x - tx) + (y - ty) * (y - ty) * 1.6;
            if (d >= bd || d > maxD * maxD) continue;
            if (!ok(b, kind, y)) continue;
            bd = d; best = { kind, x, y, s: k, box: b };
          }
        }
      }
      if (!best && must) return place(kind, s1, s1, tx, ty, 1e5, false);
      if (best) {
        if (best.kind === 'campfire') { best.fx = best.x + (FLAME_BASE[0] - SP.campfire[2]) * best.s; best.fy = best.y - (SP.campfire[3] - FLAME_BASE[1]) * best.s; }
        if (best.kind === 'windsock') { best.hx = best.x + (HINGE[0] - SP.windsock[2]) * best.s; best.hy = best.y - (SP.windsock[3] - HINGE[1]) * best.s; }
        placed.push(best);
      }
      return best;
    };
    if (!L.portrait) {
      // a diagonal cluster in the free strip right of the pennants: the khaki tent at the back on the right, the teal
      // tent in front-left of it (may hide ≤ 45 % of it), the campfire beside / in front, then a log seat
      const back = hz + Math.max(36, (mTop - hz) * 0.3);
      const ta = place('tent_a', 0.66, 0.34, xMax - 50, back, 200, true);
      const fire = place('campfire', 0.6, 0.34, xMax - 40, Math.min(mTop - 20, (ta ? ta.y : back) + 70), 200, true);
      // the teal tent: the column is too narrow for two legible tents, so it is pitched just outside it, far back at the
      // forest edge (bottom ≈ horizon + 8, so a mat's thing never reaches it), as if the camp went on behind the meadow
      if (!place('tent_b', 0.5, 0.4, ta ? ta.x - 60 : xMin + 120, (ta ? ta.y : back) - 26, 120, false)) {
        const k = Math.min(0.42, ta ? ta.s * 0.8 : 0.42), bx = c.x + c.w + 20 + 110 * k, b = propBox('tent_b', bx, hz + 8, k);
        let free = true; for (const q of keep) if (hit(b, q, 8)) free = false;
        if (free) placed.push({ kind: 'tent_b', x: bx, y: hz + 8, s: k, box: b, edge: true });
      }
      if (fire) place('log', 0.9, 0.55, fire.x - 56, fire.y + 6, 110, false);
      place('pine', 0.56, 0.36, xMin + 30, hz + 14, 140, false);
      place('flowers', 0.6, 0.4, xMax - 30, yMax - 10, 140, false);
      place('rock', 0.5, 0.3, xMin + 30, yMax - 6, 120, false);
    } else {
      const top = c.y + campH * 0.42;
      const ta = place('tent_a', 0.66, 0.36, (mimi.x + pad.x) / 2 + 30, top, 240, true);
      place('tent_b', 0.56, 0.32, ta ? ta.x + 120 : pad.x + 60, top - 16, 220, true);
      const fire = place('campfire', 0.6, 0.42, Math.min(xMax - 60, pump.x + 120), c.y + campH * 0.55, 200, true);
      if (fire) place('log', 0.85, 0.55, fire.x - 50, fire.y + 10, 120, false);
      place('pine', 0.5, 0.34, xMin + 24, c.y + campH * 0.3, 120, false);
      place('flowers', 0.6, 0.4, (mimi.x + pad.x) / 2, yMax - 4, 120, false);
      place('rock', 0.5, 0.3, xMax - 24, yMax - 6, 120, false);
    }
    // the windsock: the camp corner has no room for its tall pole, so it stands at the meadow's far end, just below the
    // horizon by the forest edge (landscape: the right edge; portrait: the left edge) — far from every mat home
    {
      const k = 0.7 * (L.portrait ? 0.86 : 0.82), wx = L.portrait ? ins.left + 34 : W - ins.right - 140, wy = hz + 12;
      const b = propBox('windsock', wx, wy, k);
      let free = true; for (const q of keep) if (hit(b, q, 8)) free = false;
      if (free) placed.push({ kind: 'windsock', x: wx, y: wy, s: k, box: b, hx: wx + (HINGE[0] - SP.windsock[2]) * k, hy: wy - (SP.windsock[3] - HINGE[1]) * k, edge: true });
    }
    placed.sort((p, q) => p.y - q.y);
    return placed;
  }

  /* ---------------------------------------------------------------- canvas helpers */
  function getImg(key, px) {
    const A = DK.Assets; if (!A) return null;
    let im = null;
    try { im = A.img ? A.img(key) : null; if (!im && A.sprite) im = A.sprite(key, px); } catch (e) { im = null; }
    if (im && (im.width === 0 || im.complete === false)) return null;
    return im;
  }
  function makeCanvas(w, h) {
    const A = DK.Assets;
    if (A && A.makeCanvas) return A.makeCanvas(w, h);
    if (typeof document === 'undefined' || !document.createElement) return null;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h)); return c;
  }
  function drawSprite(ctx, kind, x, y, s) {
    const sp = SP[kind], im = getImg('env/' + kind, Math.max(sp[0], sp[1]) * s * 2);
    if (!im) return false;
    ctx.drawImage(im, x - sp[2] * s, y - sp[3] * s, sp[0] * s, sp[1] * s);
    return true;
  }
  function drawLog(ctx, x, y, s) {
    const w = 92 * s, h = 22 * s, x0 = x - w / 2, y0 = y - h - 2 * s;
    ctx.fillStyle = 'rgba(62,74,54,0.22)'; ctx.beginPath(); ctx.ellipse(x, y - 1 * s, w * 0.55, 5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3 * s; ctx.strokeStyle = LOG.ol; ctx.fillStyle = LOG.body;
    ctx.beginPath(); ctx.moveTo(x0 + h / 2, y0); ctx.lineTo(x0 + w - h / 2, y0); ctx.ellipse(x0 + w - h / 2, y0 + h / 2, h / 2, h / 2, 0, -Math.PI / 2, Math.PI / 2); ctx.lineTo(x0 + h / 2, y0 + h);
    ctx.ellipse(x0 + h / 2, y0 + h / 2, h / 2, h / 2, 0, Math.PI / 2, Math.PI * 1.5); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = LOG.hi; ctx.lineWidth = 3 * s; ctx.beginPath(); ctx.moveTo(x0 + h * 0.9, y0 + h * 0.3); ctx.lineTo(x0 + w - h * 1.2, y0 + h * 0.3); ctx.stroke();
    ctx.strokeStyle = LOG.ol; ctx.lineWidth = 1.6 * s; ctx.beginPath(); ctx.moveTo(x0 + w * 0.35, y0 + h * 0.65); ctx.lineTo(x0 + w * 0.5, y0 + h * 0.65); ctx.moveTo(x0 + w * 0.6, y0 + h * 0.45); ctx.lineTo(x0 + w * 0.72, y0 + h * 0.45); ctx.stroke();
    // end grain (left end faces the viewer)
    ctx.fillStyle = LOG.end; ctx.strokeStyle = LOG.ol; ctx.lineWidth = 2.5 * s;
    ctx.beginPath(); ctx.ellipse(x0 + h * 0.42, y0 + h / 2, h * 0.38, h * 0.48, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = LOG.ring; ctx.lineWidth = 1.4 * s; ctx.beginPath(); ctx.ellipse(x0 + h * 0.42, y0 + h / 2, h * 0.2, h * 0.26, 0, 0, Math.PI * 2); ctx.stroke();
  }

  /* ---------------------------------------------------------------- the static meadow (cached geometry per layout) */
  let GEO = new Map();
  function geom(L) {
    const key = layoutKey(L);
    let g = GEO.get(key);
    if (g) return g;
    const W = L.W, H = L.H, hz = L.horizon, c = L.camp, ins = L.ins || { top: 0, left: 0, right: 0, bottom: 0 };
    const R = rng(0x5EED ^ (W * 31 + H * 17));
    const keep = keepBoxes(L);
    const depth = y => clamp((y - hz) / Math.max(1, H - hz), 0, 1);
    const inCamp = (x, y) => x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h;
    // mown stripes: quads from the horizon to the bottom converging to a vanishing point high above the horizon
    const mx = L.meadow ? L.meadow.x + L.meadow.w / 2 : W / 2, vy = hz - (H - hz) * 1.6, sw = 150;
    const stripes = [];
    for (let xb = mx - sw * Math.ceil((mx + W) / sw); xb < W + W; xb += sw * 2) {
      const k = (hz - vy) / (H - vy), t0 = mx + (xb - mx) * k, t1 = mx + (xb + sw - mx) * k;
      if (xb + sw < -W * 0.5 && t1 < 0) continue;
      stripes.push([t0, hz, t1, hz, xb + sw, H, xb, H]);
    }
    // tufts / flecks / tiny flowers / pebbles (avoid the camp clearing area, the bubble / hud)
    const tufts = [], flecks = [], bits = [[], [], []], pebbles = [];
    const area = W * (H - hz);
    const nT = Math.round(area / 2300);
    for (let i = 0; i < nT; i++) {
      const y = hz + 6 + Math.pow(R(), 0.8) * (H - hz - 8), x = R() * W, d = 0.55 + 0.6 * depth(y), hh = (5 + R() * 6) * d;
      if (inCamp(x, y) && R() < 0.6) continue;
      (R() < 0.75 ? tufts : flecks).push([x, y, hh, (R() - 0.5) * 3 * d]);
    }
    const nB = Math.round(area / 26000);
    for (let i = 0; i < nB; i++) {
      const y = hz + 16 + R() * (H - hz - 24), x = R() * W, d = 0.6 + 0.6 * depth(y), k = (R() * 3) | 0, n = 2 + ((R() * 3) | 0);
      for (let j = 0; j < n; j++) bits[k].push([x + (R() - 0.5) * 22 * d, y + (R() - 0.5) * 8 * d, (1.6 + R() * 1.2) * d]);
    }
    const nP = Math.round(area / 60000);
    for (let i = 0; i < nP; i++) { const y = hz + 20 + R() * (H - hz - 30), x = R() * W, d = 0.6 + 0.6 * depth(y); pebbles.push([x, y, (3 + R() * 3) * d, (2 + R() * 1.6) * d]); }
    // clearing (camp): blobs around Mimi, the pad, the pump and the campfire
    const props = campProps(L);
    const clearing = [];
    const blob = (x, y, rx, ry) => clearing.push([x, y, rx, ry]);
    if (L.mimiHome) blob(L.mimiHome.x, L.mimiHome.y + 2, 64, 20);
    if (L.pad) blob(L.pad.x, L.pad.y + 4, 62, 20);
    if (L.pump) blob(L.pump.x, L.pump.y + 22, 56, 18);
    if (L.mimiHome && L.pad) blob((L.mimiHome.x + L.pad.x) / 2, (L.mimiHome.y + L.pad.y) / 2 + 4, Math.abs(L.pad.x - L.mimiHome.x) / 2 + 20, 18);
    for (const p of props) if (p.kind === 'campfire') blob(p.x, p.y - 4 * p.s, 86 * p.s, 26 * p.s);
    for (const p of props) if (p.kind === 'tent_a' || p.kind === 'tent_b') blob(p.x, p.y - 2 * p.s, 100 * p.s, 14 * p.s);
    // puddles (rain only): on the clearing + one or two on the meadow edges
    const puddles = [];
    if (L.mimiHome && L.pad) puddles.push([(L.mimiHome.x + L.pad.x) / 2 + 4, Math.max(L.mimiHome.y, L.pad.y) + 14, 26, 6]);
    puddles.push([L.portrait ? W - ins.right - 40 : W - ins.right - 70, L.portrait ? hz + (c.y - hz) * 0.82 : H - ins.bottom - 24, 34, 8]);
    // edge decorations in the meadow (sparse; mats are ≥ 44 px from the edges and draw over anyway)
    const edge = [];
    const freeOf = b => { for (const k of keep) if (hit(b, k, 16)) return false; for (const p of props) if (hit(b, p.box, 6)) return false; return true; };
    const tryEdge = (kind, x, y, s) => { const b = propBox(kind, x, y, s); if (freeOf(b) && b.x > -b.w * 0.5 && b.x + b.w < W + b.w * 0.5) { edge.push({ kind, x, y, s, box: b }); return true; } return false; };
    if (!L.portrait) {
      tryEdge('pine', W - ins.right - 8, hz + 18, 0.5);
      tryEdge('pine', W - ins.right - 50, hz + 8, 0.36);
      tryEdge('flowers', W - ins.right - 44, H - ins.bottom - 4, 0.62);
      tryEdge('flowers', (c.x + c.w + W) / 2 + 80, H - ins.bottom + 6, 0.5);
      tryEdge('rock', W - ins.right - 120, H - ins.bottom - 2, 0.4);
    } else {
      tryEdge('flowers', ins.left + 30, hz + (c.y - hz) * 0.55, 0.55);
      tryEdge('flowers', W - ins.right - 28, hz + (c.y - hz) * 0.3, 0.48);
      tryEdge('rock', ins.left + 26, hz + (c.y - hz) * 0.86, 0.36);
    }
    // wet sheen glints (rain; animated alpha)
    const sheen = [];
    const nS = Math.round(W * (H - hz) / 26000);
    for (let i = 0; i < nS; i++) { const y = hz + 10 + Math.pow(R(), 0.7) * (H - hz - 16), x = R() * W, d = 0.5 + 0.7 * depth(y); sheen.push([x, y, (14 + R() * 26) * d, (1.4 + R() * 1.6) * d, R() * 6.28, 0.5 + R() * 0.8]); }
    const rolls = [];
    { const bot = L.portrait ? c.y : H, span = bot - hz; for (const [f, rf, a, lt] of [[0.22, 0.05, 0.12, 0], [0.18, 0.035, 0.1, 1], [0.55, 0.08, 0.1, 0], [0.5, 0.05, 0.09, 1], [0.92, 0.1, 0.1, 0]]) rolls.push([hz + f * span, Math.max(8, rf * span), a, lt]); }
    let top = hz;
    for (const p of props.concat(edge)) top = Math.min(top, p.box.y);
    g = { key, rolls, stripes, tufts, flecks, bits, pebbles, clearing, puddles, edge, props, sheen, top: Math.max(0, Math.floor(top - 6)) };
    if (GEO.size > 8) GEO.delete(GEO.keys().next().value);
    GEO.set(key, g);
    return g;
  }

  /** the static part; returns false when a sprite was missing (→ don't cache) */
  function drawStatic(ctx, L, mi) {
    const g = geom(L), M = MEADOW[mi], W = L.W, H = L.H, hz = L.horizon, c = L.camp;
    let complete = true;
    // 1 grass gradient
    const gr = ctx.createLinearGradient(0, hz, 0, H);
    gr.addColorStop(0, M.far); gr.addColorStop(0.05, M.light); gr.addColorStop(0.4, M.base); gr.addColorStop(1, M.near);
    ctx.fillStyle = gr; ctx.fillRect(0, hz, W, H - hz);
    // a soft shade line right under the forest edge (continues the mid tile's lip)
    ctx.fillStyle = rgba(M.far, 1); ctx.fillRect(0, hz - 1, W, 3);
    // 2 mown stripes (fade in towards the viewer)
    const sg = ctx.createLinearGradient(0, hz, 0, H);
    sg.addColorStop(0, rgba(M.stripe, 0)); sg.addColorStop(0.3, rgba(M.stripe, 0.22)); sg.addColorStop(1, rgba(M.stripe, 0.34));
    ctx.fillStyle = sg; ctx.beginPath();
    for (const q of g.stripes) { ctx.moveTo(q[0], q[1]); ctx.lineTo(q[2], q[3]); ctx.lineTo(q[4], q[5]); ctx.lineTo(q[6], q[7]); ctx.closePath(); }
    ctx.fill();
    // 2b gentle rolls: wide soft shade bands across the meadow (depth cue), lighter crests above them
    for (const [y, ry, a, lt] of g.rolls) {
      ctx.globalAlpha = a; ctx.fillStyle = lt ? M.stripe : M.near;
      ctx.beginPath(); ctx.ellipse(W * 0.5 + (lt ? -W * 0.12 : W * 0.1), y, W * 0.9, ry, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = 1;
    // 3 camp clearing (clipped to the camp rect)
    ctx.save(); ctx.beginPath(); ctx.rect(c.x, Math.max(c.y, hz), c.w, H - Math.max(c.y, hz)); ctx.clip();
    ctx.fillStyle = M.dirtEdge; ctx.globalAlpha = 0.5; ctx.beginPath();
    for (const e of g.clearing) { ctx.moveTo(e[0] + e[2] + 6, e[1]); ctx.ellipse(e[0], e[1], e[2] + 6, e[3] + 4, 0, 0, Math.PI * 2); }
    ctx.fill();
    ctx.fillStyle = M.dirt; ctx.globalAlpha = 0.78; ctx.beginPath();
    for (const e of g.clearing) { ctx.moveTo(e[0] + e[2], e[1]); ctx.ellipse(e[0], e[1], e[2], e[3], 0, 0, Math.PI * 2); }
    ctx.fill();
    ctx.globalAlpha = 1; ctx.restore();
    // 4 tufts, flecks, tiny flowers, pebbles
    ctx.lineCap = 'round'; ctx.strokeStyle = M.tuft; ctx.lineWidth = 1.8; ctx.globalAlpha = 0.5; ctx.beginPath();
    for (const [x, y, h, l] of g.tufts) { ctx.moveTo(x - h * 0.45, y); ctx.lineTo(x - h * 0.7 + l, y - h * 0.75); ctx.moveTo(x, y); ctx.lineTo(x + l, y - h); ctx.moveTo(x + h * 0.45, y); ctx.lineTo(x + h * 0.7 + l, y - h * 0.75); }
    ctx.stroke();
    ctx.strokeStyle = M.stripe; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.6; ctx.beginPath();
    for (const [x, y, h, l] of g.flecks) { ctx.moveTo(x, y); ctx.lineTo(x + l, y - h * 0.8); }
    ctx.stroke();
    ctx.globalAlpha = mi === 2 ? 0.65 : 0.9;
    for (let k = 0; k < 3; k++) { ctx.fillStyle = BITS[k]; ctx.beginPath(); for (const [x, y, r] of g.bits[k]) { ctx.moveTo(x + r, y); ctx.arc(x, y, r, 0, Math.PI * 2); } ctx.fill(); }
    ctx.globalAlpha = 1; ctx.fillStyle = PEB.body; ctx.strokeStyle = PEB.ol; ctx.lineWidth = 1.4; ctx.beginPath();
    for (const [x, y, rx, ry] of g.pebbles) { ctx.moveTo(x + rx, y); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); }
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = PEB.hi; ctx.beginPath();
    for (const [x, y, rx, ry] of g.pebbles) { ctx.moveTo(x - rx * 0.1, y - ry * 0.35); ctx.ellipse(x - rx * 0.3, y - ry * 0.35, rx * 0.35, ry * 0.3, 0, 0, Math.PI * 2); }
    ctx.fill();
    // 5 rain puddles
    if (mi === 2) for (const [x, y, rx, ry] of g.puddles) {
      ctx.fillStyle = PUDDLE.body; ctx.strokeStyle = PUDDLE.ol; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = PUDDLE.hi; ctx.globalAlpha = 0.8; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x - rx * 0.5, y - ry * 0.2); ctx.lineTo(x - rx * 0.1, y - ry * 0.2); ctx.moveTo(x + rx * 0.15, y + ry * 0.25); ctx.lineTo(x + rx * 0.4, y + ry * 0.25); ctx.stroke(); ctx.globalAlpha = 1;
    }
    // 6 edge decorations + camp props, back to front (flame / sock are animated on top)
    const all = g.edge.concat(g.props).sort((p, q) => p.y - q.y);
    for (const p of all) {
      if (p.kind === 'log') { drawLog(ctx, p.x, p.y, p.s); continue; }
      if (!drawSprite(ctx, p.kind, p.x, p.y, p.s)) complete = false;
    }
    return complete;
  }

  /* ---------------------------------------------------------------- cache + drawMeadow */
  let CACHE = new Map();
  function staticBitmap(L, mi, dpr) {
    const g = geom(L), key = g.key + '#' + mi + '@' + dpr.toFixed(3);
    let e = CACHE.get(key);
    if (e) return e;
    const y0 = g.top, h = L.H - y0;
    const cv = makeCanvas(Math.round(L.W * dpr), Math.round(h * dpr));
    if (!cv || !cv.getContext) return null;
    const x = cv.getContext('2d'); if (!x) return null;
    x.setTransform(dpr, 0, 0, dpr, 0, -y0 * dpr);
    if (!drawStatic(x, L, mi)) return null;           // sprites not loaded yet: draw live this frame, cache later
    e = { cv, y0, h };
    if (CACHE.size >= 4) CACHE.delete(CACHE.keys().next().value);
    CACHE.set(key, e);
    return e;
  }
  const normWind = w => { w = +w || 0; if (Math.abs(w) > 1.5) w /= 60; return clamp(w, -1, 1); };
  function drawMeadow(ctx, layout, mood, opt) {
    if (!ctx || !layout || layout.horizon == null) return;
    opt = opt || {};
    const L = layout, mi = mIndex(mood), t = opt.t || 0, dpr = opt.dpr || 1;
    ctx.save();
    if (opt.alpha != null) ctx.globalAlpha *= clamp(opt.alpha, 0, 1);
    const a0 = ctx.globalAlpha;
    const bm = staticBitmap(L, mi, dpr);
    if (bm) ctx.drawImage(bm.cv, 0, bm.y0, L.W, bm.h);
    else drawStatic(ctx, L, mi);
    const g = geom(L);
    // wet sheen (rain): soft flat glints that breathe
    const wet = opt.wet != null ? clamp(opt.wet, 0, 1) : (mi === 2 ? 1 : 0);
    if (wet > 0.01) {
      ctx.fillStyle = '#FFFFFF';
      const q = opt.quality == null ? 1 : clamp(opt.quality, 0.3, 1), n = Math.round(g.sheen.length * q);
      for (let i = 0; i < n; i++) {
        const s = g.sheen[i], a = wet * 0.22 * (0.5 + 0.5 * Math.sin(t * s[5] + s[4]));
        if (a < 0.02) continue;
        ctx.globalAlpha = a0 * a; ctx.beginPath(); ctx.ellipse(s[0], s[1], s[2], s[3], 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = a0;
    }
    // animated camp bits
    const wind = normWind(opt.wind);
    for (const p of g.props) {
      if (p.kind === 'campfire') drawFlame(ctx, p.fx, p.fy, p.s, t);
      else if (p.kind === 'windsock') drawWindsock(ctx, p.x, p.y, p.s, wind, t);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------------- flame */
  function tongue(ctx, x, y, w, h, lean) {
    ctx.beginPath();
    ctx.moveTo(x - w / 2, y);
    ctx.bezierCurveTo(x - w * 0.62, y - h * 0.45, x - w * 0.1 + lean * h * 0.4, y - h * 0.6, x + lean * h, y - h);
    ctx.bezierCurveTo(x + w * 0.2 + lean * h * 0.4, y - h * 0.55, x + w * 0.64, y - h * 0.42, x + w / 2, y);
    ctx.quadraticCurveTo(x, y + w * 0.22, x - w / 2, y);
    ctx.closePath();
  }
  function drawFlame(ctx, x, y, s, t) {
    if (!ctx || !isFinite(x) || !isFinite(y)) return;
    s = s || 1; t = t || 0;
    const a0 = ctx.globalAlpha;
    const fl = 0.5 + 0.3 * Math.sin(t * 9.1) + 0.2 * Math.sin(t * 15.7 + 1.3);
    const sway = 0.1 * Math.sin(t * 3.1) + 0.05 * Math.sin(t * 7.3 + 0.4);
    const h = 62 * s * (0.9 + 0.18 * fl), w = 34 * s;
    // glow
    ctx.fillStyle = FL.glow; ctx.globalAlpha = a0 * (0.14 + 0.05 * fl);
    ctx.beginPath(); ctx.ellipse(x, y - h * 0.35, w * 1.7, h * 0.8, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a0 * (0.1 + 0.04 * fl); ctx.beginPath(); ctx.ellipse(x, y - h * 0.3, w * 2.6, h * 1.15, 0, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = a0;
    // side tongues, main, inner, core
    ctx.fillStyle = FL.outer; ctx.strokeStyle = FL.outerOl; ctx.lineWidth = 2 * s; ctx.lineJoin = 'round';
    tongue(ctx, x - w * 0.3, y, w * 0.55, h * (0.55 + 0.1 * Math.sin(t * 11 + 2)), sway - 0.18); ctx.fill(); ctx.stroke();
    tongue(ctx, x + w * 0.32, y, w * 0.52, h * (0.5 + 0.1 * Math.sin(t * 12.5 + 4)), sway + 0.16); ctx.fill(); ctx.stroke();
    tongue(ctx, x, y, w, h, sway); ctx.fill(); ctx.stroke();
    ctx.fillStyle = FL.mid; tongue(ctx, x + sway * 4 * s, y - 2 * s, w * 0.66, h * 0.7, sway * 1.2); ctx.fill();
    ctx.fillStyle = FL.core; tongue(ctx, x + sway * 6 * s, y - 3 * s, w * 0.36, h * 0.42, sway * 1.4); ctx.fill();
    // sparks
    ctx.fillStyle = FL.spark;
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.6 + i / 3) % 1, sx = x + Math.sin(t * 2.3 + i * 2.1) * 8 * s + (i - 1) * 6 * s, sy = y - h * (0.85 + ph * 1.1);
      ctx.globalAlpha = a0 * (1 - ph) * 0.9; ctx.beginPath(); ctx.arc(sx, sy, (2.4 - ph * 1.2) * s, 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = a0;
  }

  /* ---------------------------------------------------------------- windsock */
  const NSEG = 5, PTS = new Float64Array((NSEG + 1) * 2), RAD = new Float64Array(NSEG + 1);
  function drawWindsock(ctx, x, y, s, wind, t) {
    if (!ctx || !isFinite(x) || !isFinite(y)) return;
    s = s || 1; t = t || 0;
    const w = normWind(wind), aw = Math.abs(w), dir = w < -0.02 ? -1 : 1;
    const hx = x + (HINGE[0] - SP.windsock[2]) * s * dir, hy = y - (SP.windsock[3] - HINGE[1]) * s;
    const len = 88 * s, r0 = 11 * s;
    const lift = clamp(0.12 + 1.05 * aw, 0, 1), th0 = lift * Math.PI * 0.49;
    const amp = 0.05 + 0.13 * aw, sp = 3 + 9 * aw;
    // centre line: θ measured from straight down, towards dir
    PTS[0] = hx; PTS[1] = hy;
    let th = th0;
    for (let i = 1; i <= NSEG; i++) {
      th = th0 - (1 - lift) * 0.12 * i + amp * Math.sin(t * sp - i * 0.95) + (aw < 0.15 ? 0.04 * Math.sin(t * 1.3 + i * 0.5) : 0);
      th = clamp(th, 0.02, Math.PI * 0.56);
      PTS[i * 2] = PTS[i * 2 - 2] + dir * Math.sin(th) * len / NSEG;
      PTS[i * 2 + 1] = PTS[i * 2 - 1] + Math.cos(th) * len / NSEG;
    }
    for (let i = 0; i <= NSEG; i++) RAD[i] = r0 * (1 - 0.42 * i / NSEG) * (1 + (i ? 0.08 * aw * Math.sin(t * sp * 1.3 - i * 1.4) : 0));
    // stripes (quads between successive rings)
    ctx.lineJoin = 'round';
    for (let i = 0; i < NSEG; i++) {
      const ax = PTS[i * 2], ay = PTS[i * 2 + 1], bx = PTS[i * 2 + 2], by = PTS[i * 2 + 3];
      let dx = bx - ax, dy = by - ay; const dl = Math.sqrt(dx * dx + dy * dy) || 1; dx /= dl; dy /= dl;
      const nx = -dy, ny = dx, ra = RAD[i], rb = RAD[i + 1];
      ctx.fillStyle = SOCK[i % 2];
      ctx.beginPath(); ctx.moveTo(ax + nx * ra, ay + ny * ra); ctx.lineTo(bx + nx * rb, by + ny * rb); ctx.lineTo(bx - nx * rb, by - ny * rb); ctx.lineTo(ax - nx * ra, ay - ny * ra); ctx.closePath(); ctx.fill();
    }
    // outline
    ctx.strokeStyle = SOCK_OL; ctx.lineWidth = 2.2 * s;
    for (const side of [1, -1]) {
      ctx.beginPath();
      for (let i = 0; i <= NSEG; i++) {
        const j = Math.min(i, NSEG - 1), dx0 = PTS[j * 2 + 2] - PTS[j * 2], dy0 = PTS[j * 2 + 3] - PTS[j * 2 + 1], dl = Math.sqrt(dx0 * dx0 + dy0 * dy0) || 1;
        const px = PTS[i * 2] - dy0 / dl * RAD[i] * side, py = PTS[i * 2 + 1] + dx0 / dl * RAD[i] * side;
        i ? ctx.lineTo(px, py) : ctx.moveTo(px, py);
      }
      ctx.stroke();
    }
    // the open tail end + the hinge ring
    const ex = PTS[NSEG * 2], ey = PTS[NSEG * 2 + 1], ang = Math.atan2(ey - PTS[NSEG * 2 - 1], ex - PTS[NSEG * 2 - 2]);
    ctx.fillStyle = '#6E8F8A'; ctx.beginPath(); ctx.ellipse(ex, ey, RAD[NSEG] * 0.42, RAD[NSEG], ang, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#F6EEDC'; ctx.beginPath(); ctx.ellipse(hx, hy, RAD[0] * 0.4, RAD[0] * 1.05, Math.atan2(PTS[3] - hy, PTS[2] - hx), 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  }

  DK.MeadowArt = {
    drawMeadow, drawFlame, drawWindsock, campProps, keepBoxes, fakeLayout, propBox,
    MEADOW: MOODS.reduce((o, m, i) => (o[m] = MEADOW[i], o), {}), MOODS, SPRITES, SP,
    _reset() { PROPS = new Map(); GEO = new Map(); CACHE = new Map(); },
  };
})(typeof window !== 'undefined' ? (window.DK = window.DK || {}) : (globalThis.DK = globalThis.DK || {}));
