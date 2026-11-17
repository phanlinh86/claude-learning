// Generates Dottie's Reef Parade character + item SVGs. 100% original hand-written artwork.
// Usage: node gen.js [outDir]
// Technique: each silhouette is drawn twice — first as a fat stroke in the dark "line" tone
// (gives a clean ~3 px outline around the UNION of shapes), then the flat fills on top.
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
fs.mkdirSync(OUT, { recursive: true });
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const R = 'stroke-linejoin="round" stroke-linecap="round"';
const write = (name, s) => fs.writeFileSync(path.join(OUT, name), s);
const f1 = n => Math.round(n * 10) / 10;
const rad = d => d * Math.PI / 180;
const P = (x, y) => `${f1(x)},${f1(y)}`;

// 4-point sparkle (curved star)
const sparkle = (x, y, s, c = '#fffbe0', line = '#c7861a', sw = 1.2) =>
  `<path d="M${x},${y - s} C${f1(x + s * .18)},${f1(y - s * .2)} ${f1(x + s * .2)},${f1(y - s * .18)} ${x + s},${y} C${f1(x + s * .2)},${f1(y + s * .18)} ${f1(x + s * .18)},${f1(y + s * .2)} ${x},${y + s} ` +
  `C${f1(x - s * .18)},${f1(y + s * .2)} ${f1(x - s * .2)},${f1(y + s * .18)} ${x - s},${y} C${f1(x - s * .2)},${f1(y - s * .18)} ${f1(x - s * .18)},${f1(y - s * .2)} ${x},${y - s} Z" fill="${c}"${line ? ` stroke="${line}" stroke-width="${sw}"` : ''} ${R}/>`;

const el = {
  c: (s, a) => `<circle cx="${s[1]}" cy="${s[2]}" r="${s[3]}" ${a}/>`,
  e: (s, a) => `<ellipse cx="${s[1]}" cy="${s[2]}" rx="${s[3]}" ry="${s[4]}"${s[5] ? ` transform="rotate(${s[5]} ${s[1]} ${s[2]})"` : ''} ${a}/>`,
  p: (s, a) => `<path d="${s[1]}" ${a}/>`,
};
const shp = (s, a) => el[s[0]](s, a);
const outline = (shapes, line, w = 6) => shapes.map(s => shp(s, `fill="${line}" stroke="${line}" stroke-width="${w}" ${R}`)).join('');
const fills = (shapes, fill) => shapes.map(s => shp(s, `fill="${fill}"`)).join('');
const clipDef = (id, shapes) => `<clipPath id="${id}">${shapes.map(s => shp(s, '')).join('')}</clipPath>`;

/* ============================== DOTTIE (puffin) ============================== */
const D = {
  navy: '#1f2a44', navyHi: '#3a4f7d', navyDk: '#16203a', line: '#0e1528',
  white: '#ffffff', whiteSh: '#d5dfec',
  beak: '#ff7a3d', beakSh: '#e85a24', beakLine: '#8e3414', band: '#ffd23f', plate: '#9fb2c6', plateSh: '#7f93aa',
  mouth: '#c2374f', tongue: '#ff9db0',
  foot: '#ff9a3c', footSh: '#e8761e', footLine: '#9a4a12',
  eye: '#1b1f33', ring: '#ff6b5a', blush: '#ff9eb0', mark: '#5d6a86',
};
// shared body geometry (identical in every frame); body centre ≈ (50,52)
const BODY = ['e', 46, 56, 27, 19, -12];
const HEAD = ['c', 63, 39, 17];
const TAIL = ['p', 'M24,50 C19,51 14,54 12,58 C16,60 21,62 26,62 Z'];
const SIL = [BODY, HEAD, TAIL];
// beak: hinge at the face; upper + lower mandible
const BK = { x0: 74, yU: 30, yM: 41.5, yL: 50, tip: [87, 41.5] };
const beakUpper = `M${BK.x0},${BK.yU} C${BK.x0 + 6},${BK.yU + .6} ${BK.tip[0] - 1},${BK.yM - 6} ${BK.tip[0]},${BK.yM} L${BK.x0},${BK.yM} Z`;
const beakLower = `M${BK.x0},${BK.yM} L${BK.tip[0] - .6},${BK.yM} C${BK.tip[0] - 2},${BK.yM + 5} ${BK.x0 + 5},${BK.yL} ${BK.x0},${BK.yL} Z`;
function beak(open = 0, id = 'b') {
  // open: degrees the lower mandible drops (0 = closed)
  const hinge = `${BK.x0} ${BK.yM}`;
  const inside = open ? `<path d="M${BK.x0},${BK.yM - 1} L${BK.tip[0] - 3},${BK.yM - 1} L${BK.x0 + 2},${BK.yM + 8} Z" fill="${D.mouth}" stroke="${D.beakLine}" stroke-width="1.6" ${R} transform="rotate(${open * .5} ${hinge})"/>
<ellipse cx="${BK.x0 + 4}" cy="${BK.yM + 3}" rx="3" ry="1.8" fill="${D.tongue}" transform="rotate(${open * .6} ${hinge})"/>` : '';
  const part = (d, cid) => `<clipPath id="${id}${cid}"><path d="${d}"/></clipPath>
<path d="${d}" fill="${D.beak}" stroke="${D.beakLine}" stroke-width="2.4" ${R}/>
<g clip-path="url(#${id}${cid})"><rect x="${BK.x0 - 2}" y="20" width="5.6" height="40" fill="${D.plate}"/><rect x="${BK.x0 + 3.6}" y="20" width="2.6" height="40" fill="${D.band}"/>
${cid === 'u' ? `<path d="M${BK.x0 + 9},${BK.yU} C${BK.x0 + 10.5},${BK.yU + 4} ${BK.x0 + 10.5},${BK.yM - 4} ${BK.x0 + 9.5},${BK.yM}" fill="none" stroke="${D.beakSh}" stroke-width="1.4" ${R}/>
<ellipse cx="${BK.x0 + 9}" cy="${BK.yU + 4.6}" rx="2.4" ry="1.3" fill="#ffd2b8" opacity=".9" transform="rotate(20 ${BK.x0 + 9} ${BK.yU + 4.6})"/>`
    : `<path d="M${BK.x0},${BK.yL - 2.4} C${BK.x0 + 5},${BK.yL - 3} ${BK.tip[0] - 5},${BK.yM + 3} ${BK.tip[0]},${BK.yM}" fill="none" stroke="${D.beakSh}" stroke-width="2.6"/>`}</g>
<path d="${d}" fill="none" stroke="${D.beakLine}" stroke-width="2.4" ${R}/>`;
  return `${inside}${part(beakUpper, 'u')}<g transform="rotate(${open} ${hinge})">${part(beakLower, 'l')}</g>`;
}
// webbed foot, trailing behind (pointing left)
function foot(ax, ay, rot, sc = 1) {
  const d = `M${ax},${ay - 2.6} C${ax - 5},${ay - 4} ${ax - 10},${ay - 5.6} ${ax - 13},${ay - 4.6} C${ax - 12.4},${ay - 1.6} ${ax - 13.6},${ay + 1} ${ax - 13},${ay + 3.4} C${ax - 12},${ay + 5.6} ${ax - 13},${ay + 7.6} ${ax - 11},${ay + 9} C${ax - 7},${ay + 7} ${ax - 3},${ay + 4} ${ax},${ay + 2.6} Z`;
  return `<g transform="rotate(${rot} ${ax} ${ay}) translate(${ax} ${ay}) scale(${sc}) translate(${-ax} ${-ay})"><path d="${d}" fill="${D.foot}" stroke="${D.footLine}" stroke-width="2.4" ${R}/>
<path d="M${ax - 2},${ay} L${ax - 11},${ay - 2.6} M${ax - 2},${ay + .6} L${ax - 10.4},${ay + 5.4}" fill="none" stroke="${D.footSh}" stroke-width="1.4" ${R}/></g>`;
}
// flipper wing: teardrop from shoulder, angle in degrees (180 = straight back)
function wing(sx, sy, ang, len, wid, fill, hi) {
  const a = rad(ang), d = [Math.cos(a), Math.sin(a)], n = [-d[1], d[0]];
  const T = [sx + d[0] * len, sy + d[1] * len];
  const bL = [sx + n[0] * wid, sy + n[1] * wid], bR = [sx - n[0] * wid, sy - n[1] * wid];
  const k = wid * .75;
  const path = `M${P(...bL)} C${P(bL[0] + d[0] * len * .6 + n[0] * wid * .3, bL[1] + d[1] * len * .6 + n[1] * wid * .3)} ${P(T[0] + n[0] * k, T[1] + n[1] * k)} ${P(...T)} C${P(T[0] - n[0] * k, T[1] - n[1] * k)} ${P(bR[0] + d[0] * len * .55 - n[0] * wid * .2, bR[1] + d[1] * len * .55 - n[1] * wid * .2)} ${P(...bR)} Z`;
  const hl = `M${P(sx + d[0] * len * .25 + n[0] * wid * .45, sy + d[1] * len * .25 + n[1] * wid * .45)} L${P(sx + d[0] * len * .78 + n[0] * wid * .25, sy + d[1] * len * .78 + n[1] * wid * .25)}`;
  return `<path d="${path}" fill="${fill}" stroke="${D.line}" stroke-width="2.8" ${R}/>` + (hi ? `<path d="${hl}" fill="none" stroke="${hi}" stroke-width="1.8" ${R}/>` : '');
}
// frames: near wing angle, far wing angle (behind body, null = hidden), beak opening, face, puff
const SH = [44, 52]; // near shoulder
const FRAMES = {
  idle: { near: 152, far: null, open: 0 },
  happy: { near: 212, far: 232, open: 24 },
  ouch: { near: 128, far: null, open: 0 },
  jump: { near: 226, far: 132, open: 30 },
};
const eyeOpen = (cx, cy, s = 1) => `<circle cx="${cx}" cy="${cy}" r="${f1(6 * s)}" fill="${D.ring}" opacity=".9"/>
<ellipse cx="${cx}" cy="${cy}" rx="${f1(4.6 * s)}" ry="${f1(5.2 * s)}" fill="${D.eye}"/>
<circle cx="${f1(cx + 1.6 * s)}" cy="${f1(cy - 2 * s)}" r="${f1(2 * s)}" fill="#fff"/><circle cx="${f1(cx - 1.6 * s)}" cy="${f1(cy + 2.2 * s)}" r="${f1(.9 * s)}" fill="#fff" opacity=".9"/>`;
const eyeMark = (cx, cy) => `<path d="M${cx - 2},${cy - 7.6} L${cx + 1},${cy - 11} M${cx + 4},${cy + 6.4} C${cx + 6},${cy + 7.6} ${cx + 8},${cy + 8} ${cx + 9.6},${cy + 8}" fill="none" stroke="${D.mark}" stroke-width="1.6" ${R}/>`;
function spiral(cx, cy, r, turns = 2.2) {
  let d = '';
  for (let i = 0; i <= 40; i++) {
    const t = i / 40, a = t * turns * Math.PI * 2, rr = r * t;
    d += (i ? ' L' : 'M') + f1(cx + rr * Math.cos(a)) + ',' + f1(cy + rr * Math.sin(a));
  }
  return `<path d="${d}" fill="none" stroke="${D.eye}" stroke-width="1.9" ${R}/>`;
}
const EYE_C = [65, 36];
const blush = (k = 1) => `<ellipse cx="68" cy="47" rx="${f1(4 * k)}" ry="${f1(2.4 * k)}" fill="${D.blush}" opacity=".85"/>`;
const FACE = {
  idle: () => `${eyeOpen(...EYE_C)}${blush()}
<path d="M71.6,44.4 C72.6,45.8 73.6,46 74.6,45.4" fill="none" stroke="${D.beakLine}" stroke-width="1.6" ${R}/>`,
  happy: () => `<path d="M60.6,37.6 C61.6,31.6 68.4,31.6 69.4,37.6" fill="none" stroke="${D.eye}" stroke-width="3" ${R}/>${blush(1.15)}`,
  ouch: () => `<circle cx="${EYE_C[0]}" cy="${EYE_C[1]}" r="6" fill="#fff" stroke="${D.mark}" stroke-width="1.2"/>${spiral(EYE_C[0], EYE_C[1], 5)}${blush(.9)}
<path d="M71,47 C72,45.6 73,45.6 74,47 C75,48.4 76,48.4 77,47 C78,45.6 79,45.6 80,47" fill="none" stroke="${D.beakLine}" stroke-width="1.7" ${R}/>`,
  jump: () => `${eyeOpen(EYE_C[0], EYE_C[1] - .4, 1.1)}${blush(1.1)}
<path d="M59.4,27.4 C62,25.2 66,25 68.6,26.4" fill="none" stroke="${D.white}" stroke-width="2" ${R}/>`,
};
function puffin(frame) {
  const F = FRAMES[frame], id = 'd' + frame[0];
  const farWing = F.far != null ? wing(SH[0] + 3, SH[1] - 3, F.far, 20, 6, D.navyDk, null) : '';
  // puffed feathers for ouch (little navy tufts on the crown / back)
  const puff = frame === 'ouch' ? `<g fill="${D.navy}" stroke="${D.line}" stroke-width="2.4" ${R}>
<path d="M54,24.6 C54,20 57,18.4 59,21.4 C60,17.6 64,17.4 64.6,21.6 C66.6,19.4 69.4,21 68.6,24.4 Z"/>
<path d="M30,40.6 C29,37 31.6,35 33.6,37.4 C34.4,34 38,34 38.4,37.6 Z"/></g>` : '';
  const ouchStars = frame === 'ouch' ? `${sparkle(80, 22, 3.6, '#fff6b0', '#c7861a', 1.1)}${sparkle(50, 18, 3, '#fff6b0', '#c7861a', 1)}` : '';
  return `<defs>${clipDef(id + 'b', [BODY, TAIL])}${clipDef(id + 'h', [HEAD])}</defs>
${farWing}
${foot(25, 61, -6, 1.2)}${foot(29, 66, 14, 1.2)}
${puff}
${outline(SIL, D.line, 6)}${fills(SIL, D.navy)}
<g clip-path="url(#${id}b)">
  <ellipse cx="52" cy="68" rx="25" ry="12" fill="${D.white}" transform="rotate(-12 52 68)"/>
  <ellipse cx="50" cy="75" rx="24" ry="6" fill="${D.whiteSh}" transform="rotate(-12 50 75)"/>
  <path d="M26,46.6 C34,40 46,36.6 56,37.6" fill="none" stroke="${D.navyHi}" stroke-width="3" ${R}/>
</g>
<g clip-path="url(#${id}h)">
  <path d="M51,44 C51,33 58,27.6 66,27.6 C73,27.6 78,32 79,38 L79,60 L51,60 Z" fill="${D.white}"/>
  <path d="M51,51 C56,55 64,56.4 72,53.6 L80,60 L50,60 Z" fill="${D.whiteSh}"/>
  <path d="M53,26.6 C56,23.6 61,22.4 65,22.6" fill="none" stroke="${D.navyHi}" stroke-width="2.4" ${R}/>
</g>
<path d="M50.6,53.6 C56,57.4 64,58 71,55" fill="none" stroke="${D.navy}" stroke-width="3.4" ${R}/>
${beak(F.open, id + 'k')}
${FACE[frame]()}
${wing(SH[0], SH[1], F.near, 22, 6.4, D.navy, D.navyHi)}
${ouchStars}`;
}
for (const f of Object.keys(FRAMES)) write(`puffin_${f}.svg`, svg(100, 100, puffin(f)));
const puffinInner = f => puffin(f);

/* ============================== SEA STARS ============================== */
const SC = [
  { fill: '#ff7aa8', sh: '#e8548a', line: '#9c2457', hi: '#ffd3e3', pat: '#fff0f5' }, // coral pink — dots
  { fill: '#5ec8ff', sh: '#35a2e4', line: '#16578f', hi: '#d9f3ff', pat: '#eefaff' }, // sky blue — stripes
  { fill: '#5fe0a8', sh: '#32b67f', line: '#136a47', hi: '#d8fbe9', pat: '#f0fff7' }, // mint — ring
  { fill: '#b48cff', sh: '#9168e6', line: '#4f2f9a', hi: '#e9ddff', pat: '#f6f0ff' }, // lavender — tip caps
];
const GOLD = { fill: '#ffd23f', sh: '#f2a516', line: '#8f5506', hi: '#fff8cc', pat: '#fff3a8' };
const CX = 24, CY = 24;
function starPts(Ro, Ri, rot = -90, cx = CX, cy = CY) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = rad(rot + i * 36), r = i % 2 ? Ri : Ro;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
  }
  return pts;
}
// rounded chunky star: soft bezier through tips + valleys
function starPath(Ro, Ri, rot = -90, cx = CX, cy = CY) {
  const p = starPts(Ro, Ri, rot, cx, cy);
  let d = `M${P(...p[1])}`;
  for (let i = 0; i < 5; i++) {
    const v0 = p[(2 * i + 1) % 10], t = p[(2 * i + 2) % 10], v1 = p[(2 * i + 3) % 10];
    const ta = Math.atan2(t[1] - cy, t[0] - cx), tn = [-Math.sin(ta), Math.cos(ta)], w = Ro * .2;
    const tl = [t[0] - tn[0] * w, t[1] - tn[1] * w], tr = [t[0] + tn[0] * w, t[1] + tn[1] * w];
    d += ` C${P((v0[0] + tl[0]) / 2, (v0[1] + tl[1]) / 2)} ${P(tl[0] - Math.cos(ta) * 0, tl[1])} ${P(tl[0] + Math.cos(ta) * w * .5, tl[1] + Math.sin(ta) * w * .5)}` +
      ` C${P(t[0] + Math.cos(ta) * w * 1.1 - tn[0] * w * .5, t[1] + Math.sin(ta) * w * 1.1 - tn[1] * w * .5)} ${P(t[0] + Math.cos(ta) * w * 1.1 + tn[0] * w * .5, t[1] + Math.sin(ta) * w * 1.1 + tn[1] * w * .5)} ${P(tr[0] + Math.cos(ta) * w * .5, tr[1] + Math.sin(ta) * w * .5)}` +
      ` C${P(tr[0], tr[1])} ${P((v1[0] + tr[0]) / 2, (v1[1] + tr[1]) / 2)} ${P(...v1)}`;
  }
  return d + ' Z';
}
const ARM = i => rad(-90 + i * 72);
function pattern(kind, C, Ro) {
  let s = '';
  if (kind === 0) { // dots along each arm
    for (let i = 0; i < 5; i++) {
      const a = ARM(i);
      [[.52, 2.2], [.8, 1.7]].forEach(([u, r]) => { s += `<circle cx="${f1(CX + Math.cos(a) * Ro * u)}" cy="${f1(CY + Math.sin(a) * Ro * u)}" r="${r}" fill="${C.pat}"/>`; });
    }
  } else if (kind === 1) { // two stripes across each arm (bold, pure white: readable at phone size and for colour-blind players)
    for (let i = 0; i < 5; i++) {
      const a = ARM(i), n = [-Math.sin(a), Math.cos(a)];
      [.55, .78].forEach(u => {
        const m = [CX + Math.cos(a) * Ro * u, CY + Math.sin(a) * Ro * u], w = 7;
        s += `<path d="M${P(m[0] - n[0] * w, m[1] - n[1] * w)} L${P(m[0] + n[0] * w, m[1] + n[1] * w)}" stroke="#ffffff" stroke-width="3.3" ${R}/>`;
      });
    }
  } else if (kind === 2) { // ring around the face
    s = `<circle cx="${CX}" cy="${CY}" r="11" fill="none" stroke="${C.pat}" stroke-width="2.6"/>`;
  } else if (kind === 3) { // light caps on every arm tip (big, pure white)
    for (let i = 0; i < 5; i++) {
      const a = ARM(i);
      s += `<circle cx="${f1(CX + Math.cos(a) * Ro * .97)}" cy="${f1(CY + Math.sin(a) * Ro * .97)}" r="7" fill="#ffffff"/>`;
    }
  }
  return s;
}
function starFace(C, excited = false) {
  const ey = CY - 1.4;
  const eye = x => excited
    ? `<ellipse cx="${x}" cy="${ey}" rx="1.9" ry="2.4" fill="${C.line}"/><circle cx="${f1(x + .6)}" cy="${f1(ey - .9)}" r=".9" fill="#fff"/>`
    : `<ellipse cx="${x}" cy="${ey}" rx="1.6" ry="2.1" fill="${C.line}"/><circle cx="${f1(x + .5)}" cy="${f1(ey - .8)}" r=".7" fill="#fff"/>`;
  const mouth = excited
    ? `<path d="M${CX - 2.6},${CY + 2.2} C${CX - 2},${CY + 6.4} ${CX + 2},${CY + 6.4} ${CX + 2.6},${CY + 2.2} Z" fill="#c2374f" stroke="${C.line}" stroke-width="1.1" ${R}/>`
    : `<path d="M${CX - 2.2},${CY + 2.4} C${CX - 1},${CY + 4.4} ${CX + 1},${CY + 4.4} ${CX + 2.2},${CY + 2.4}" fill="none" stroke="${C.line}" stroke-width="1.4" ${R}/>`;
  return `${eye(CX - 3)}${eye(CX + 3)}${mouth}
<ellipse cx="${CX - 6}" cy="${CY + 2}" rx="1.6" ry="1" fill="#ff5f8c" opacity=".55"/><ellipse cx="${CX + 6}" cy="${CY + 2}" rx="1.6" ry="1" fill="#ff5f8c" opacity=".55"/>`;
}
function star(kind, C, id, { Ro = 17.4, Ri = 8.8, rot = -90, gold = false } = {}) {
  const d = starPath(Ro, Ri, rot);
  return `<defs><clipPath id="${id}"><path d="${d}"/></clipPath>${gold ? `<radialGradient id="${id}g" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#fff2a0"/><stop offset=".55" stop-color="${C.fill}"/><stop offset="1" stop-color="${C.sh}"/></radialGradient>` : ''}</defs>
<path d="${d}" fill="${C.line}" stroke="${C.line}" stroke-width="5" ${R}/>
<path d="${d}" fill="${gold ? `url(#${id}g)` : C.fill}"/>
<g clip-path="url(#${id})">
  <path d="M0,30 C12,36 34,36 48,26 L48,48 L0,48 Z" fill="${C.sh}" opacity="${gold ? .5 : .75}"/>
  ${pattern(kind, C, Ro)}
</g>
<path d="M${CX - 1.6},${CY - Ro * .55} C${CX - 1.2},${CY - Ro * .78} ${CX - .4},${CY - Ro * .88} ${CX + .2},${CY - Ro * .9}" fill="none" stroke="#fff" stroke-width="2" opacity=".9" ${R}/>
<path d="M${f1(CX - Ro * .66)},${f1(CY - Ro * .24)} L${f1(CX - Ro * .42)},${f1(CY - Ro * .18)}" stroke="#fff" stroke-width="1.8" opacity=".75" ${R}/>
${starFace(C, gold)}`;
}
const STAR_INNER = SC.map((C, k) => id => star(k, C, id));
SC.forEach((C, k) => write(`star_${k}.svg`, svg(48, 48, STAR_INNER[k]('s' + k))));
const goldInner = id => `<path d="${starPath(19.8, 10.8, -90)}" fill="#fff3a8" stroke="#fff3a8" stroke-width="3" opacity=".6" ${R}/>
${star(-1, GOLD, id, { Ro: 18.4, Ri: 9.6, gold: true })}
<g fill="${GOLD.pat}" stroke="${GOLD.line}" stroke-width=".9">${[0, 1, 2, 3, 4].map(i => { const a = ARM(i); return `<circle cx="${f1(CX + Math.cos(a) * 12)}" cy="${f1(CY + Math.sin(a) * 12)}" r="1.5"/>`; }).join('')}</g>
${sparkle(7, 8, 4.4, '#ffffff', GOLD.line, 1)}${sparkle(42, 40, 3.8, '#ffffff', GOLD.line, 1)}${sparkle(42, 9, 2.6, '#ffffff', null)}`;
write('star_gold.svg', svg(48, 48, goldInner('sg')));

/* ============================== HUD ============================== */
const HEART = 'M24,41 C14,34 5.4,27 5.4,17.6 C5.4,11 10.4,6.6 16,6.6 C19.6,6.6 22.4,8.6 24,11.4 C25.6,8.6 28.4,6.6 32,6.6 C37.6,6.6 42.6,11 42.6,17.6 C42.6,27 34,34 24,41 Z';
write('heart_full.svg', svg(48, 48, `<defs><clipPath id="hf"><path d="${HEART}"/></clipPath></defs>
<path d="${HEART}" fill="#ff5a78" stroke="#9b1f3e" stroke-width="3.4" ${R}/>
<g clip-path="url(#hf)"><path d="M0,28 C14,36 34,34 48,22 L48,48 L0,48 Z" fill="#e2385c"/></g>
<path d="${HEART}" fill="none" stroke="#9b1f3e" stroke-width="3.4" ${R}/>
<ellipse cx="14.6" cy="15.4" rx="4.6" ry="3" fill="#fff" opacity=".9" transform="rotate(-35 14.6 15.4)"/><circle cx="20.4" cy="12.4" r="1.5" fill="#fff" opacity=".85"/>`));
write('heart_empty.svg', svg(48, 48, `<path d="${HEART}" fill="#f4e4ea" fill-opacity=".85" stroke="#a88e98" stroke-width="3.4" ${R}/>
<path d="M24,35 C17,30 11,25 11,18.4 C11,14.4 13.6,12.2 16.4,12.2" fill="none" stroke="#d4bdc6" stroke-width="2.2" stroke-dasharray="2.6 3" ${R}/>`));

// flip button: tiny puffin silhouette inside a looping arrow
const miniPuffin = `<g transform="translate(24 25) rotate(-20)">
<ellipse cx="-2" cy="2" rx="9" ry="6.4" fill="${D.navy}" stroke="${D.line}" stroke-width="2.2"/>
<circle cx="5" cy="-3" r="5.6" fill="${D.navy}" stroke="${D.line}" stroke-width="2.2"/>
<ellipse cx="0" cy="5" rx="7.4" ry="3.2" fill="#fff"/><path d="M3.4,-1.6 C3.4,-6 6,-7.6 8.2,-6.4 C10,-5 10,-1 8.6,1 L4,1 Z" fill="#fff"/>
<path d="M9.6,-5.4 L15.6,-2.4 L9.6,0.4 Z" fill="${D.beak}" stroke="${D.beakLine}" stroke-width="1.4" ${R}/>
<circle cx="6.8" cy="-3.6" r="1.3" fill="${D.eye}"/>
<path d="M-10,3 L-14.6,1 L-14,6 Z" fill="${D.foot}" stroke="${D.footLine}" stroke-width="1.2" ${R}/></g>`;
const loop = 'M10.6,32.4 A15.6,15.6 0 1 1 33.4,37.2';
write('flip.svg', svg(48, 48, `<path d="${loop}" fill="none" stroke="#7a3f08" stroke-width="7.4" ${R}/>
<path d="${loop}" fill="none" stroke="#ffb33f" stroke-width="3.8" ${R}/>
<path d="M28.6,33.6 L37.6,41.6 L38.2,31.4 Z" fill="#ffb33f" stroke="#7a3f08" stroke-width="2.4" ${R}/>
<path d="M10.4,20 C12,14 16.4,10.6 21,9.6" fill="none" stroke="#ffe6b8" stroke-width="1.4" ${R}/>
${miniPuffin}`));

// song bar icon: scallop shell with a little sea star on it
const SHELL = 'M32,52 C24,52 12,46 8.6,34 C6,24 12,12 22,9.6 C28,8 36,8 42,9.6 C52,12 58,24 55.4,34 C52,46 40,52 32,52 Z';
let ribs = '';
for (let i = -3; i <= 3; i++) ribs += `<path d="M32,51 L${f1(32 + i * 7.8)},${i === 0 ? 7 : f1(9 + Math.abs(i) * 1.6)}" stroke="#e9a27a" stroke-width="1.8" ${R}/>`;
write('songbar.svg', svg(64, 64, `<defs><clipPath id="shc"><path d="${SHELL}"/></clipPath></defs>
<path d="M22,48 L42,48 L44,58 L20,58 Z" fill="#ffd2b0" stroke="#9c5530" stroke-width="3" ${R}/>
<path d="${SHELL}" fill="#ffe3c9" stroke="#9c5530" stroke-width="3" ${R}/>
<g clip-path="url(#shc)">${ribs}<path d="M0,40 C20,48 44,48 64,38 L64,64 L0,64 Z" fill="#f6c39e" opacity=".8"/>
<path d="M14,20 C17,14 22,11.6 27,11" fill="none" stroke="#fff6ec" stroke-width="2.4" ${R}/></g>
<path d="${SHELL}" fill="none" stroke="#9c5530" stroke-width="3" ${R}/>
<g transform="translate(14.5 11) scale(.72)">${STAR_INNER[0]('sbs')}</g>`));

/* ============================== APP ICON ============================== */
const coral = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="${c}" stroke="${c}" stroke-width="7" ${R}>
<path d="M0,0 L0,-30 M0,-14 L-12,-26 L-14,-38 M-12,-26 L-24,-30 M0,-22 L12,-34 L12,-46 M12,-34 L22,-38" fill="none"/></g>`;
write('icon.svg', svg(256, 256, `<defs>
<radialGradient id="ibg" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="#2fb6c9"/><stop offset="1" stop-color="#0b4f78"/></radialGradient>
<radialGradient id="iwater" cx="50%" cy="30%" r="70%"><stop offset="0" stop-color="#bff3f2"/><stop offset=".6" stop-color="#5fd0dc"/><stop offset="1" stop-color="#2aa3c2"/></radialGradient>
<clipPath id="badge"><circle cx="128" cy="128" r="106"/></clipPath></defs>
<rect width="256" height="256" fill="url(#ibg)"/>
<circle cx="128" cy="128" r="106" fill="url(#iwater)" stroke="#0a3d5e" stroke-width="6"/>
<g clip-path="url(#badge)">
  <path d="M60,0 L100,0 L70,256 L40,256 Z M150,0 L176,0 L160,256 L128,256 Z" fill="#ffffff" opacity=".18"/>
  ${coral(52, 214, 1.5, '#ff8fab')}${coral(206, 220, 1.3, '#ff9e6b')}${coral(176, 222, 0.9, '#ff8fab')}
  <path d="M0,206 C60,192 196,194 256,208 L256,256 L0,256 Z" fill="#f2d79e"/>
  <path d="M0,222 C70,212 190,214 256,224" fill="none" stroke="#e2bf7e" stroke-width="3"/>
  <g fill="#fff" stroke="#2aa3c2" stroke-width="2"><circle cx="212" cy="80" r="5.6"/><circle cx="202" cy="62" r="4"/><circle cx="214" cy="50" r="2.8"/></g>
</g>
<g transform="translate(44 140) scale(1.12) rotate(-14 24 24)">${STAR_INNER[2]('ic2')}</g>
<g transform="translate(22 86) scale(1.3) rotate(10 24 24)">${STAR_INNER[0]('ic0')}</g>
<g transform="translate(80 42) scale(1.56)">${puffinInner('happy').replace(/id="dh/g, 'id="ih').replace(/#dh/g, '#ih')}</g>
${sparkle(116, 58, 7, '#fffbe0', '#c7861a', 2)}${sparkle(70, 190, 5, '#fffbe0', '#c7861a', 1.8)}`));

console.log('wrote SVGs to', OUT);
