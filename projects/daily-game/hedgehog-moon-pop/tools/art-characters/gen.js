// Generates Bristle's Moon Pop character + item SVGs (DESIGN §4.1). 100% original hand-written artwork.
// Usage: node gen.js [outDir]
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

// Closed polygon with rounded corners: pts = [[x, y, cut], ...] (cut = how far the corner is shaved, 0 = sharp).
function roundPoly(pts) {
  let d = '';
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const p = pts[i], pr = pts[(i + n - 1) % n], nx = pts[(i + 1) % n], c = p[2] || 0;
    const towards = (q, lim) => {
      const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, k = Math.min(c, L * lim);
      return [p[0] + dx / L * k, p[1] + dy / L * k];
    };
    const a = towards(pr, 0.48), b = towards(nx, 0.48);
    d += `${i ? ' L' : 'M'}${f1(a[0])},${f1(a[1])} Q${f1(p[0])},${f1(p[1])} ${f1(b[0])},${f1(b[1])}`;
  }
  return d + ' Z';
}
// Chunky spikes along an arc (SVG angles, degrees, clockwise from +x). Returns the vertex list valley,tip,valley,...
// sweep tilts tips backwards (towards smaller angles = towards Bristle's tail when he faces right).
function spikeArc(cx, cy, a0, a1, n, rv, rt, sweep, cutT, cutV) {
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + (a1 - a0) * i / n;
    pts.push([cx + rv * Math.cos(rad(a)), cy + rv * Math.sin(rad(a)), cutV]);
    if (i < n) {
      const t = a0 + (a1 - a0) * (i + 0.5) / n - sweep;
      const rr = rt + (i % 2 ? -1.6 : 0.8);   // tiny size rhythm so it looks hand-drawn
      pts.push([cx + rr * Math.cos(rad(t)), cy + rr * Math.sin(rad(t)), cutT]);
    }
  }
  return pts;
}
// 4-point sparkle
const sparkle = (x, y, s, c = '#fffbe0', line = '#c7861a', sw = 1.2) =>
  `<path d="M${x},${y - s} C${f1(x + s * .18)},${f1(y - s * .2)} ${f1(x + s * .2)},${f1(y - s * .18)} ${x + s},${y} C${f1(x + s * .2)},${f1(y + s * .18)} ${f1(x + s * .18)},${f1(y + s * .2)} ${x},${y + s} ` +
  `C${f1(x - s * .18)},${f1(y + s * .2)} ${f1(x - s * .2)},${f1(y + s * .18)} ${x - s},${y} C${f1(x - s * .2)},${f1(y - s * .18)} ${f1(x - s * .18)},${f1(y - s * .2)} ${x},${y - s} Z" fill="${c}"${line ? ` stroke="${line}" stroke-width="${sw}"` : ''} ${R}/>`;
function star5(cx, cy, ro, ri = ro * 0.5, rot = -90) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const a = rad(rot + i * 36), r = i % 2 ? ri : ro;
    pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a), i % 2 ? ro * .08 : ro * .22]);
  }
  return roundPoly(pts);
}

/* ============================== PALETTE ============================== */
const P = {
  spike: '#8a5a3c', spikeShade: '#6c432b', spikeTip: '#d9ab7c', spikeHi: '#b07c55', spikeLine: '#43271a',
  skin: '#ffe2c4', skinShade: '#f2c49e', skinLine: '#8a5236', ear: '#f6a7a0',
  foot: '#7a4b33', footLine: '#43271a', nose: '#3b2216', eye: '#2a1a12', cheek: '#ff8f8f', mouth: '#7a3a2a', tongue: '#ff8fa0',
  scarf: '#3fc4a8', scarfShade: '#269c86', scarfLight: '#9cf0dc', scarfLine: '#17695a',
};

/* ============================== BRISTLE ============================== */
// Body centre (60,54) = world (hog.x, hog.y); feet line y = 94. Faces right.
const SW = 3.6;                          // outline in sprite units (x0.8 at drawn size ~ 2.9 px)
const BODY = { cx: 62, cy: 57, rx: 36, ry: 31 };          // cream skin ellipse (belly + face)
const SNOUT = { cx: 99, cy: 57, rx: 11, ry: 8.4 };
const COAT_C = [57, 55];
// Back coat: spikes from lower-back (145°) over the top to the forehead (334°), then an inner border back down.
const coatPts = (rv, rt, cutT) => {
  const arc = spikeArc(COAT_C[0], COAT_C[1], 146, 334, 12, rv, rt, 6, cutT, 1.6);
  return arc.concat([[80, 47, 6], [70, 63, 9], [52, 76, 9], [36, 77, 6]]);
};
const COAT = roundPoly(coatPts(31, 43, 4.2));
const COAT_IN = roundPoly(coatPts(27, 36.5, 3.6));        // inner chestnut layer -> outer layer shows as lighter tips
const ellipse = (e, extra) => `<ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx}" ry="${e.ry}" ${extra}/>`;

function feet(frame) {
  const back = frame === 'push' ? { x: 37, y: 96.4, leg: true } : frame === 'jump' ? { x: 45, y: 92, rot: -18 } : { x: 45, y: 90.4 };
  const front = frame === 'jump' ? { x: 77, y: 92, rot: 14 } : { x: 77, y: 90.4 };
  const foot = (f, far) => {
    const fill = far ? '#653c28' : P.foot;
    const leg = f.leg ? `<path d="M46,82 L${f.x + 2},${f.y - 2}" stroke="${P.footLine}" stroke-width="${8 + SW * 2 - 2}" ${R}/><path d="M46,82 L${f.x + 2},${f.y - 2}" stroke="${fill}" stroke-width="7.4" ${R}/>` : '';
    return `${leg}<ellipse cx="${f.x}" cy="${f.y}" rx="7.6" ry="3.6" transform="rotate(${f.rot || 0} ${f.x} ${f.y})" fill="${fill}" stroke="${P.footLine}" stroke-width="${SW * .8}"/>
<path d="M${f.x - 4},${f.y - 1.2} L${f.x + 2},${f.y - 1.6}" stroke="#a8755a" stroke-width="1.6" transform="rotate(${f.rot || 0} ${f.x} ${f.y})" ${R}/>`;
  };
  return { back: foot(back, true), front: foot(front, false) };
}

// Shared body + coat + scarf + ear (identical across frames)
function hogBase(id) {
  return `<defs>
  <clipPath id="${id}b">${ellipse(BODY, '')}${ellipse(SNOUT, '')}</clipPath>
  <clipPath id="${id}c"><path d="${COAT}"/></clipPath>
</defs>
${ellipse(BODY, `fill="${P.skinLine}" stroke="${P.skinLine}" stroke-width="${SW * 2}"`)}${ellipse(SNOUT, `fill="${P.skinLine}" stroke="${P.skinLine}" stroke-width="${SW * 2}"`)}
${ellipse(BODY, `fill="${P.skin}"`)}${ellipse(SNOUT, `fill="${P.skin}"`)}
<g clip-path="url(#${id}b)">
  <path d="M20,74 C44,92 84,94 104,70 L110,100 L10,100 Z" fill="${P.skinShade}"/>
</g>
<path d="${COAT}" fill="${P.spikeTip}"/>
<path d="${COAT_IN}" fill="${P.spike}"/>
<g clip-path="url(#${id}c)">
  <path d="M8,62 C26,72 46,74 70,60 L80,50 L92,80 L8,90 Z" fill="${P.spikeShade}" opacity=".9"/>
</g>
<path d="${COAT}" fill="none" stroke="${P.spikeLine}" stroke-width="${SW}" ${R}/>
<g fill="none" stroke="${P.spikeShade}" stroke-width="2.2" ${R}>
  <path d="M40,40 L33,36 M53,31 L48,25 M66,32 L64,25 M33,54 L26,53 M47,47 L41,44 M60,42 L57,37"/>
</g>
<path d="M27.6,49 C29,38 36,29.6 46,25.6" fill="none" stroke="${P.spikeHi}" stroke-width="3.4" ${R}/>
<circle cx="25.8" cy="56" r="1.7" fill="${P.spikeHi}"/>
<path d="M96,51.6 C98.6,50.2 102,50 105,51" fill="none" stroke="#fff6ea" stroke-width="2" ${R}/>
<circle cx="80" cy="40.6" r="5.8" fill="${P.skin}" stroke="${P.skinLine}" stroke-width="${SW * .8}"/>
<circle cx="80.6" cy="41" r="2.8" fill="${P.ear}"/>`;
}
// Scarf: short band under the chin, knot at the back of the neck, two short tails trailing behind.
function scarf(frame) {
  const flap = frame === 'jump' ? -4 : frame === 'push' ? 1.6 : 0;
  const tail1 = `M66,66 C60,${63 + flap} 55,${66 + flap} 48.6,${63 + flap}`;
  const tail2 = `M65,68.6 C60,${70 + flap * .6} 56,${73 + flap * .6} 52,${71.4 + flap * .6}`;
  const band = 'M65,66 C73,73.4 86,75.6 96.6,69.6';
  const st = (d, w, c) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" ${R}/>`;
  return `${st(tail2, 4.6 + SW * 2 - 1.4, P.scarfLine)}${st(tail2, 4.6, P.scarfShade)}
${st(tail1, 5.4 + SW * 2 - 1.4, P.scarfLine)}${st(tail1, 5.4, P.scarf)}
${st(band, 7.2 + SW * 2 - 1.4, P.scarfLine)}${st(band, 7.2, P.scarf)}
${st('M68,69.4 C75,74.6 85,76.4 94.6,72.4', 2.2, P.scarfShade)}
${st('M68,65.2 C75,70.2 84,71.8 92,68.4', 1.6, P.scarfLight)}
<circle cx="65.6" cy="66.6" r="4.2" fill="${P.scarf}" stroke="${P.scarfLine}" stroke-width="${SW * .75}"/>
<path d="M64,65 C64.8,64.4 66,64.4 66.8,64.8" fill="none" stroke="${P.scarfLight}" stroke-width="1.4" ${R}/>`;
}
const NOSE = `<ellipse cx="108.6" cy="54.6" rx="4.6" ry="4" fill="${P.nose}"/><circle cx="107.4" cy="53.2" r="1.3" fill="#fff" opacity=".85"/>`;
const cheek = (s = 1, op = .6) => `<ellipse cx="91.4" cy="61" rx="${f1(4.6 * s)}" ry="${f1(3 * s)}" fill="${P.cheek}" opacity="${op}"/>`;
const eyeOpen = (cx, cy, rx, ry, glint = 1) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${P.eye}"/>
<circle cx="${f1(cx + rx * .3)}" cy="${f1(cy - ry * .38)}" r="${f1(rx * .42 * glint)}" fill="#fff"/><circle cx="${f1(cx - rx * .3)}" cy="${f1(cy + ry * .45)}" r="${f1(rx * .18)}" fill="#fff" opacity=".8"/>`;
// arm: small peach paw (front arm in the skin colour but darker so it reads on the cream belly)
const arm = (d, far) => `<path d="${d}" fill="none" stroke="${P.skinLine}" stroke-width="${5.6 + SW * 2 - 1.4}" ${R}/><path d="${d}" fill="none" stroke="${far ? '#e6ac85' : '#f6c49c'}" stroke-width="5.6" ${R}/>`;
const paw = (x, y, far) => `<circle cx="${x}" cy="${y}" r="3.6" fill="${far ? '#e6ac85' : '#f6c49c'}" stroke="${P.skinLine}" stroke-width="2.2"/>`;

const FACE = {
  skate: () => `${arm('M82.4,78.4 C84.6,80.4 87,80.8 89,79.8')}
${eyeOpen(89.6, 47.4, 4.3, 5.4)}
<path d="M84.6,40.4 C86.6,39 89.4,38.8 91.6,39.8" fill="none" stroke="${P.spikeLine}" stroke-width="1.8" ${R}/>
${cheek()}${NOSE}
<path d="M98,63.4 C100.4,66 104,66 106,63.6" fill="none" stroke="${P.mouth}" stroke-width="2.2" ${R}/>`,
  push: () => `${arm('M82,78 C85,79.6 88,79.4 90.4,78')}
${eyeOpen(89.8, 47.6, 4.3, 5.2)}
<path d="M84.4,41.6 C86.8,39.4 89.6,39.4 92.4,40.4" fill="none" stroke="${P.spikeLine}" stroke-width="2" ${R}/>
${cheek()}${NOSE}
<path d="M98.6,63.4 C101,65.4 103.6,65.4 105.8,63.2" fill="none" stroke="${P.mouth}" stroke-width="2.2" ${R}/>
<path d="M105.8,63.2 L107,62.2" stroke="${P.mouth}" stroke-width="2" ${R}/>`,
  jump: () => `${arm('M88,75 C94,77.4 100,77.6 105.4,75.4')}${paw(106.4, 74.6)}
${eyeOpen(89.4, 46.6, 4.8, 6.2, 1.1)}
<path d="M83.6,38.4 C86.2,36.4 90,36.2 92.8,37.6" fill="none" stroke="${P.spikeLine}" stroke-width="1.8" ${R}/>
${cheek(1.05, .7)}${NOSE}
<path d="M96.8,62 C98,69.6 106,70 108,62.6 C104,63.8 100,63.4 96.8,62 Z" fill="${P.mouth}" stroke="${P.mouth}" stroke-width="1.6" ${R}/>
<path d="M99.6,65.6 C101.4,64.6 104,64.8 105.4,66 C103.6,67.8 101,67.6 99.6,65.6 Z" fill="${P.tongue}"/>`,
  happy: () => `${arm('M82.4,78.4 C84.6,80.4 87,80.8 89,79.8')}
<path d="M84.6,49.4 C86,43.4 93.4,43.4 94.8,49.4" fill="none" stroke="${P.eye}" stroke-width="3" ${R}/>
${cheek(1.2, .8)}${NOSE}
<path d="M96.6,62 C98,70.4 106.6,70.6 108.6,62.4 C104.4,63.8 100,63.4 96.6,62 Z" fill="${P.mouth}" stroke="${P.mouth}" stroke-width="1.6" ${R}/>
<path d="M99.6,65.8 C101.4,64.8 104,65 105.6,66.2 C103.8,68 101,67.8 99.6,65.8 Z" fill="${P.tongue}"/>
${sparkle(100, 30, 4.4, '#fffbe0', '#c7861a', 1.1)}${sparkle(110, 40, 2.8, '#fffbe0', '#c7861a', 1)}`,
  bonk: () => `${arm('M82.4,78.4 C84.6,80.4 87,80.8 89,79.8')}
<circle cx="89.6" cy="47.6" r="6" fill="#fff" stroke="${P.eye}" stroke-width="1.6"/>
<path d="M89.6,47.6 C89.6,46.4 91.2,46.4 91.2,47.8 C91.2,49.6 88,49.8 87.8,47.4 C87.6,44.6 92.6,44.2 93,47.8 C93.4,51.6 87.4,52.4 86.2,48.6" fill="none" stroke="${P.eye}" stroke-width="1.7" ${R}/>
${cheek(1, .5)}${NOSE}
<path d="M96.6,64.4 C98.2,62.4 99.8,62.4 101.4,64.4 C103,66.4 104.6,66.4 106.4,64" fill="none" stroke="${P.mouth}" stroke-width="2.2" ${R}/>
<path d="${star5(78, 22, 5.4, 2.6, -80)}" fill="#ffe066" stroke="#a87400" stroke-width="1.4" ${R}/>
<path d="${star5(98, 30, 4.2, 2, -100)}" fill="#ffe066" stroke="#a87400" stroke-width="1.3" ${R}/>`,
};
for (const f of Object.keys(FACE)) {
  const ft = feet(f);
  // jump: the far arm flung out behind (only the part outside the body shows)
  const behind = f === 'jump' ? `${arm('M40,74 C32,78 26,79.6 20,78', true)}${paw(19, 77.6, true)}` : '';
  write(`bristle_${f}.svg`, svg(120, 100, `${behind}${ft.back}\n${hogBase('h' + f[0] + f[1])}\n${scarf(f)}\n${ft.front}\n${FACE[f]()}`));
}

/* ============================== BALL ============================== */
// Curled-up Bristle, centre (50,50). Spikes all around; a peek of cream face + happy eye + nose so he stays recognisable.
{
  const ring = (rv, rt, cutT) => {
    const pts = spikeArc(50, 50, 0, 360, 14, rv, rt, 7, cutT, 1.6);
    pts.pop(); // last valley duplicates the first
    return roundPoly(pts);
  };
  const OUTER = ring(36, 47, 4.6), INNER = ring(31.6, 40.6, 4);
  const FACEP = 'M48,52 C52,44 62,40 70,42.6 C79,45.6 82,56 78.6,64.4 C75,72.6 64,76 56,72.4 C49,69 45.6,60 48,52 Z';
  write('bristle_ball.svg', svg(100, 100, `<defs><clipPath id="bc"><path d="${OUTER}"/></clipPath><clipPath id="bf"><path d="${FACEP}"/></clipPath></defs>
<path d="${OUTER}" fill="${P.spikeTip}"/>
<path d="${INNER}" fill="${P.spike}"/>
<g clip-path="url(#bc)"><path d="M0,58 C20,80 60,92 100,64 L100,100 L0,100 Z" fill="${P.spikeShade}" opacity=".9"/></g>
<path d="${OUTER}" fill="none" stroke="${P.spikeLine}" stroke-width="3.4" ${R}/>
<g fill="none" stroke="${P.spikeShade}" stroke-width="2.2" ${R}><path d="M30,30 L25,25 M46,24 L45,17 M62,27 L66,21 M26,46 L19,45 M30,62 L24,66 M40,38 L35,34"/></g>
<path d="M22.4,40 C25,30 32,23 41,20" fill="none" stroke="${P.spikeHi}" stroke-width="3.4" ${R}/>
<path d="${FACEP}" fill="${P.skin}" stroke="${P.skinLine}" stroke-width="3.2" ${R}/>
<g clip-path="url(#bf)"><path d="M44,64 C56,74 70,74 84,60 L84,80 L44,80 Z" fill="${P.skinShade}"/></g>
<path d="M46.6,60 C47.4,66.6 51,71.6 57,74.4" fill="none" stroke="${P.scarfLine}" stroke-width="8" ${R}/>
<path d="M46.6,60 C47.4,66.6 51,71.6 57,74.4" fill="none" stroke="${P.scarf}" stroke-width="4.8" ${R}/>
<path d="M57.6,53 C59,48.4 64.4,48.4 65.8,53" fill="none" stroke="${P.eye}" stroke-width="2.8" ${R}/>
<ellipse cx="62.6" cy="60" rx="3.8" ry="2.4" fill="${P.cheek}" opacity=".7"/>
<ellipse cx="76" cy="56" rx="4.4" ry="3.8" fill="${P.nose}"/><circle cx="74.8" cy="54.6" r="1.2" fill="#fff" opacity=".85"/>
<path d="M70.6,62.4 C72,64.4 74.6,64.4 76,62.8" fill="none" stroke="${P.mouth}" stroke-width="2" ${R}/>`));
}

/* ============================== BOARD ============================== */
// deck top centre (60,10); deck kicked up at both ends; mint wheels with bottoms at y = 38.
{
  const DECK = 'M14,10 L106,10 C110,10 113,7.4 115,3.6 C116,1.8 118.6,2.4 118.2,4.6 C117,11 112.6,17 106,17 L14,17 C7.4,17 3,11 1.8,4.6 C1.4,2.4 4,1.8 5,3.6 C7,7.4 10,10 14,10 Z';
  const truck = x => `<path d="M${x - 7},17 L${x + 7},17 L${x + 3},24.6 L${x - 3},24.6 Z" fill="#c3c8da" stroke="#4e5672" stroke-width="2.4" ${R}/>`;
  const wheel = x => `<circle cx="${x}" cy="31" r="7" fill="${P.scarf}" stroke="${P.scarfLine}" stroke-width="2.8"/>
<path d="M${x - 4.4},28 C${x - 3},26 ${x - 1},25.4 ${x + 1},25.6" fill="none" stroke="${P.scarfLight}" stroke-width="1.8" ${R}/>
<circle cx="${x}" cy="31" r="2.6" fill="#eef3fb" stroke="${P.scarfLine}" stroke-width="1.4"/>`;
  write('board.svg', svg(120, 40, `${truck(32)}${truck(88)}${wheel(32)}${wheel(88)}
<defs><clipPath id="dk"><path d="${DECK}"/></clipPath></defs>
<path d="${DECK}" fill="#e8604c"/>
<g clip-path="url(#dk)">
  <rect x="0" y="14.4" width="120" height="4" fill="#c4453a"/>
  <path d="M6,12.6 L114,12.6" stroke="#fff1d6" stroke-width="1.8"/>
</g>
<path d="${DECK}" fill="none" stroke="#86291f" stroke-width="2.8" ${R}/>
<path d="M18,10.2 L46,10.2" stroke="#ffa08c" stroke-width="1.6" ${R}/>`));
}

/* ============================== BUBBLE ============================== */
write('bubble.svg', svg(80, 80, `<defs>
  <radialGradient id="bf" cx=".42" cy=".4" r=".62">
    <stop offset="0" stop-color="#ffffff" stop-opacity=".02"/><stop offset=".7" stop-color="#ffffff" stop-opacity=".06"/>
    <stop offset=".9" stop-color="#e8f4ff" stop-opacity=".22"/><stop offset="1" stop-color="#ffffff" stop-opacity=".36"/>
  </radialGradient>
  <linearGradient id="bi" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#ffb3dc"/><stop offset=".35" stop-color="#a8f0ff"/><stop offset=".65" stop-color="#c8b8ff"/><stop offset="1" stop-color="#fff0a0"/>
  </linearGradient>
</defs>
<circle cx="40" cy="40" r="37" fill="url(#bf)"/>
<circle cx="40" cy="40" r="38.2" fill="none" stroke="#5b6aa0" stroke-opacity=".38" stroke-width="1.8"/>
<circle cx="40" cy="40" r="36.6" fill="none" stroke="url(#bi)" stroke-width="3" opacity=".95"/>
<circle cx="40" cy="40" r="34.6" fill="none" stroke="#ffffff" stroke-opacity=".55" stroke-width="1.2"/>
<path d="M14.6,38 C14.6,25 24,15.4 36,14.2" fill="none" stroke="#ffffff" stroke-width="5.6" opacity=".9" ${R}/>
<path d="M16.2,47 C16,45.6 15.8,44.2 15.8,42.8" fill="none" stroke="#ffffff" stroke-width="3.6" opacity=".8" ${R}/>
<ellipse cx="57" cy="61.6" rx="3.6" ry="2.2" transform="rotate(-40 57 61.6)" fill="#ffffff" opacity=".85"/>
<path d="M66.2,48 C65.4,54 62.6,58.4 59.4,61" fill="none" stroke="#ffffff" stroke-width="1.6" opacity=".55" ${R}/>`));

/* ============================== CUPCAKES ============================== */
// centre (24,26). Same shape, only frosting differs (+ sprinkle colours).
const FROST = {
  pink: { f: '#ff94bf', s: '#ea6aa0', l: '#ffd6e8', line: '#93305e', spr: ['#5cc8ff', '#ffe066', '#ffffff'] },
  mint: { f: '#82e6c8', s: '#4fc3a2', l: '#dcfff3', line: '#1d7563', spr: ['#ff7aa8', '#ffe066', '#ffffff'] },
  lemon: { f: '#ffe27a', s: '#f0bd3a', l: '#fff7cf', line: '#94640a', spr: ['#ff7aa8', '#5cc8ff', '#ffffff'] },
};
const CUP = 'M9.6,28.6 L38.4,28.6 L35,43 C34.7,44.4 33.6,45.2 32.2,45.2 L15.8,45.2 C14.4,45.2 13.3,44.4 13,43 Z';
const FROSTING = 'M7.6,29.4 C5,29 4.6,25.4 7.2,24.4 C5.8,21 8.6,18.2 12,19 C12.2,15.4 15.6,13.2 19.4,14.2 C21,11 26.4,10.6 28.6,13.6 C32.4,12.6 35.6,15.6 35.6,19 C39.2,18.6 41.8,21.8 40.6,24.6 C43.2,25.8 42.8,29.2 40.2,29.6 C30,31.4 18,31.4 7.6,29.4 Z';
function cupcake(C, id) {
  return `<defs><clipPath id="${id}c"><path d="${CUP}"/></clipPath><clipPath id="${id}f"><path d="${FROSTING}"/></clipPath></defs>
<path d="${CUP}" fill="#eaa56a"/>
<g clip-path="url(#${id}c)">
  <path d="M16,28 L18,46 M22.6,28 L23.2,46 M29,28 L28.6,46 M35,28 L33,46" stroke="#c97c42" stroke-width="2.2"/>
  <path d="M30,28 C33,34 34,40 32,46 L40,46 L40,28 Z" fill="#c97c42" opacity=".45"/>
</g>
<path d="${CUP}" fill="none" stroke="#7a4220" stroke-width="2.6" ${R}/>
<ellipse cx="19.2" cy="36" rx="1.4" ry="1.7" fill="#4a2410"/><ellipse cx="28.8" cy="36" rx="1.4" ry="1.7" fill="#4a2410"/>
<path d="M22,38.6 C23,39.8 25,39.8 26,38.6" fill="none" stroke="#4a2410" stroke-width="1.5" ${R}/>
<ellipse cx="16.4" cy="39" rx="1.8" ry="1.1" fill="#ff7a8c" opacity=".7"/><ellipse cx="31.6" cy="39" rx="1.8" ry="1.1" fill="#ff7a8c" opacity=".7"/>
<path d="${FROSTING}" fill="${C.f}"/>
<g clip-path="url(#${id}f)">
  <path d="M4,26 C14,30 34,30 44,24 L44,34 L4,34 Z" fill="${C.s}"/>
  <path d="M9,22.6 C16,25 28,25 38,21.4" fill="none" stroke="${C.s}" stroke-width="1.8" ${R}/>
</g>
<path d="${FROSTING}" fill="none" stroke="${C.line}" stroke-width="2.6" ${R}/>
<path d="M11.4,22.4 C11.6,20.6 12.8,19.6 14.4,19.4 M19,16.8 C20,15.6 21.6,15 23,15.2" fill="none" stroke="${C.l}" stroke-width="2.2" ${R}/>
<g ${R} stroke-width="2">
  <path d="M15,25.6 L17,24.8" stroke="${C.spr[0]}"/><path d="M27.6,19.4 L29.4,20.4" stroke="${C.spr[1]}"/><path d="M33.4,25 L35,23.8" stroke="${C.spr[0]}"/>
  <path d="M22,22.2 L23.8,21.6" stroke="${C.spr[1]}"/><path d="M10,26.6 L11.4,27.4" stroke="${C.spr[1]}"/><path d="M36.6,20.2 L37.2,21.8" stroke="${C.spr[2]}"/>
</g>
<path d="M24,10.6 C24.4,7.4 26,5.4 28.6,4" fill="none" stroke="#4f7a2a" stroke-width="1.8" ${R}/>
<circle cx="24" cy="10.4" r="4.4" fill="#ef3f57" stroke="#7a1626" stroke-width="2.2"/>
<circle cx="22.6" cy="9" r="1.3" fill="#fff" opacity=".9"/>`;
}
for (const k of Object.keys(FROST)) write(`cupcake_${k}.svg`, svg(48, 48, cupcake(FROST[k], 'c' + k[0])));

/* ============================== MAGNET ============================== */
{
  const U = 'M8,34 L8,22 C8,12 15,5 24,5 C33,5 40,12 40,22 L40,34 L30,34 L30,22 C30,18.4 27.4,15.4 24,15.4 C20.6,15.4 18,18.4 18,22 L18,34 Z';
  write('magnet.svg', svg(48, 48, `<defs><clipPath id="mg"><path d="${U}"/></clipPath></defs>
<path d="${U}" fill="#ef4054"/>
<g clip-path="url(#mg)"><path d="M40,10 C38,20 34,26 30,28 L30,36 L44,36 L44,10 Z" fill="#c2253a"/><path d="M18,24 L18,36 L8,36 L8,30 C12,30 15,28 18,24 Z" fill="#c2253a" opacity=".6"/></g>
<path d="M8,32 L18,32 L18,40.4 C18,41.6 17.2,42.4 16,42.4 L10,42.4 C8.8,42.4 8,41.6 8,40.4 Z" fill="#e6ebf4" stroke="#4e5672" stroke-width="2.4" ${R}/>
<path d="M30,32 L40,32 L40,40.4 C40,41.6 39.2,42.4 38,42.4 L32,42.4 C30.8,42.4 30,41.6 30,40.4 Z" fill="#c9d0de" stroke="#4e5672" stroke-width="2.4" ${R}/>
<path d="M10.6,35 L10.6,39.4" stroke="#ffffff" stroke-width="1.8" ${R}/>
<path d="${U}" fill="none" stroke="#7a1525" stroke-width="2.6" ${R}/>
<path d="M11.6,22 C11.6,15.4 16,10.4 21.6,9.2" fill="none" stroke="#ff9aa6" stroke-width="2.6" ${R}/>
<g fill="none" stroke="#ffd23f" stroke-width="2.2" ${R}><path d="M4.6,46 L2.4,43.6 L5,43 L3,40.6"/><path d="M43.4,46 L45.6,43.6 L43,43 L45,40.6"/></g>
${sparkle(24, 40, 3.4, '#fffbe0', '#c7861a', 1)}`));
}

/* ============================== PEBBLE ============================== */
const PEB = 'M10,30 C8.4,20 13,10.6 23,8 C32,5.6 42.6,8.8 46.6,17.4 C50.4,25.4 49.4,36 43,42.6 C36.6,48.8 24,49.6 16.6,44.6 C12.4,41.6 10.6,36 10,30 Z';
function pebble(id, f2) {
  const lid = f2 ? 'M17.6,27.8 C19.4,30.2 22.4,30.4 24.2,28.2' : 'M17.4,27 C19.2,29.8 22.6,29.8 24.4,27';
  const lid2 = f2 ? 'M31.8,28 C33.6,30.4 36.8,30.4 38.6,27.6' : 'M31.8,27 C33.6,29.8 37,29.8 38.8,27';
  return `<defs><clipPath id="${id}"><path d="${PEB}"/></clipPath></defs>
<path d="${PEB}" fill="#b9b2d2"/>
<g clip-path="url(#${id})">
  <path d="M6,34 C18,42 36,42 52,28 L52,52 L6,52 Z" fill="#958eb4"/>
  <ellipse cx="38" cy="15" rx="4.4" ry="3" fill="#9d96bc"/><ellipse cx="38.4" cy="15.6" rx="3.2" ry="2" fill="#8a83aa"/>
  <ellipse cx="17" cy="17.4" rx="2.8" ry="2" fill="#9d96bc"/>
  <ellipse cx="42.6" cy="38" rx="3.2" ry="2.2" fill="#7f78a2"/>
  <ellipse cx="18" cy="41.4" rx="2.4" ry="1.6" fill="#7f78a2"/>
</g>
<path d="${PEB}" fill="none" stroke="#5a5480" stroke-width="2.8" ${R}/>
<path d="M14.2,24 C14.6,18 18,13.6 23,12" fill="none" stroke="#e4e0f2" stroke-width="2.6" ${R}/>
<path d="${lid}" fill="none" stroke="#3a345a" stroke-width="2.2" ${R}/><path d="${lid2}" fill="none" stroke="#3a345a" stroke-width="2.2" ${R}/>
<ellipse cx="16" cy="33.4" rx="3" ry="1.9" fill="#ff9ab8" opacity=".6"/><ellipse cx="40.4" cy="33.4" rx="3" ry="1.9" fill="#ff9ab8" opacity=".6"/>
${f2 ? `<ellipse cx="28.2" cy="35.4" rx="1.8" ry="2.2" fill="#5a4470"/>`
    : `<path d="M25.6,34.4 C27,35.8 29.4,35.8 30.8,34.4" fill="none" stroke="#3a345a" stroke-width="1.8" ${R}/>`}
${f2 ? `<path d="M43,4 L50,4 L43,11 L50,11" fill="none" stroke="#5a5480" stroke-width="4.6" ${R}/><path d="M43,4 L50,4 L43,11 L50,11" fill="none" stroke="#ffffff" stroke-width="2" ${R}/>`
    : `<path d="M45.6,6.6 L49.4,6.6 L45.6,10.4 L49.4,10.4" fill="none" stroke="#5a5480" stroke-width="3.6" ${R}/><path d="M45.6,6.6 L49.4,6.6 L45.6,10.4 L49.4,10.4" fill="none" stroke="#ffffff" stroke-width="1.5" ${R}/>`}`;
}
write('pebble.svg', svg(56, 56, pebble('p1', false)));
write('pebble_2.svg', svg(56, 56, pebble('p2', true)));

/* ============================== CRATER ============================== */
// side-front vent crater: raised rim, dark mouth centre (60,16), bottom at y ~34.
write('crater.svg', svg(120, 40, `<defs><clipPath id="cr"><path d="M4,34 C12,26 16,12 30,9 C46,6 74,6 90,9 C104,12 108,26 116,34 Z"/></clipPath></defs>
<path d="M4,34 C12,26 16,12 30,9 C46,6 74,6 90,9 C104,12 108,26 116,34 Z" fill="#cbc8d8"/>
<g clip-path="url(#cr)">
  <path d="M0,24 C30,32 90,32 120,24 L120,40 L0,40 Z" fill="#aeaac0"/>
  <path d="M92,8 C102,14 106,24 110,36 L120,36 L120,6 Z" fill="#aeaac0"/>
</g>
<path d="M4,34 C12,26 16,12 30,9 C46,6 74,6 90,9 C104,12 108,26 116,34" fill="none" stroke="#6e6a88" stroke-width="2.6" ${R}/>
<path d="M2,34 L118,34" stroke="#6e6a88" stroke-width="1.6" opacity=".35" ${R}/>
<ellipse cx="60" cy="16" rx="38" ry="8.6" fill="#ebe9f3" stroke="#6e6a88" stroke-width="2.4"/>
<ellipse cx="60" cy="16.8" rx="31" ry="6" fill="#6f6a8c"/>
<path d="M30,17.6 C38,13 82,13 90,17.6 C82,15.6 38,15.6 30,17.6 Z" fill="#4e4a6c"/>
<ellipse cx="60" cy="18.4" rx="20" ry="3" fill="#4a4566"/>
<path d="M26,11.6 C36,8.6 50,7.6 60,7.6" fill="none" stroke="#ffffff" stroke-width="2" opacity=".8" ${R}/>
<ellipse cx="24" cy="26" rx="3.2" ry="1.6" fill="#b3afc6"/><ellipse cx="94" cy="28" rx="4" ry="1.8" fill="#9f9bb4"/><ellipse cx="80" cy="30" rx="2" ry="1" fill="#9f9bb4"/>`));

/* ============================== HUD ============================== */
const HEART = 'M24,42 C14,35 5,28 5,18 C5,11 10,6.5 16,6.5 C20,6.5 22.6,8.6 24,11.4 C25.4,8.6 28,6.5 32,6.5 C38,6.5 43,11 43,18 C43,28 34,35 24,42 Z';
write('heart_full.svg', svg(48, 48, `<path d="${HEART}" fill="#ff5a6e" stroke="#8a1a33" stroke-width="3.4" ${R}/>
<path d="M8,20 C9,30 18,36 24,40 C30,36 39,30 40,20 C37,28 30,33 24,36 C18,33 11,28 8,20 Z" fill="#e23a55"/>
<path d="M11,15 C12,12 14,10.6 17,10.4" fill="none" stroke="#fff" stroke-width="3.2" opacity=".95" ${R}/>
<circle cx="11" cy="19.4" r="1.7" fill="#fff" opacity=".9"/>`));
write('heart_empty.svg', svg(48, 48, `<path d="${HEART}" fill="#2a2850" fill-opacity=".32" stroke="#5a4680" stroke-width="3.4" ${R}/>
<path d="M24,36.6 C16,31 9.6,25.6 9.6,18.4 C9.6,13.6 12.6,10.8 16.2,10.8 C19.6,10.8 21.6,13 24,16.6 C26.4,13 28.4,10.8 31.8,10.8 C35.4,10.8 38.4,13.6 38.4,18.4 C38.4,25.6 32,31 24,36.6 Z" fill="none" stroke="#efe0f6" stroke-width="2" stroke-dasharray="2.4 3" opacity=".9" ${R}/>`));

// Open bakery box (pastel pink) with a little window showing a cupcake top.
write('box.svg', svg(64, 56, `<path d="M8,20 L2,8.6 C1.6,7.6 2.2,6.8 3.2,7 L14,9.4 L14,20 Z" fill="#f7a8c4" stroke="#93365e" stroke-width="2.4" ${R}/>
<path d="M56,20 L62,8.6 C62.4,7.6 61.8,6.8 60.8,7 L50,9.4 L50,20 Z" fill="#f7a8c4" stroke="#93365e" stroke-width="2.4" ${R}/>
<path d="M10,18 L54,18 L50,13.6 L14,13.6 Z" fill="#c9658e" stroke="#93365e" stroke-width="2.2" ${R}/>
<path d="M22,18 C22,14 24,12 26.4,12 C27,9.6 30,8.6 32,9.8 C34,8.6 37,9.6 37.6,12 C40,12 42,14 42,18 Z" fill="#ff94bf" stroke="#93305e" stroke-width="1.8" ${R}/>
<circle cx="32" cy="8.4" r="2.6" fill="#ef3f57" stroke="#7a1626" stroke-width="1.4"/>
<path d="M8,18 L56,18 L53,50 C52.8,52 51.4,53.4 49.4,53.4 L14.6,53.4 C12.6,53.4 11.2,52 11,50 Z" fill="#ffc6da" stroke="#93365e" stroke-width="2.8" ${R}/>
<path d="M45,18 L56,18 L53,50 C52.8,52 51.4,53.4 49.4,53.4 L44,53.4 C48,42 48,28 45,18 Z" fill="#f4a3c2"/>
<path d="M8,18 L56,18 L53,50 C52.8,52 51.4,53.4 49.4,53.4 L14.6,53.4 C12.6,53.4 11.2,52 11,50 Z" fill="none" stroke="#93365e" stroke-width="2.8" ${R}/>
<path d="M8.6,24 L55.4,24" stroke="#ffffff" stroke-width="2" opacity=".85"/>
<rect x="21" y="29" width="22" height="15" rx="6" fill="#dff3ff" stroke="#93365e" stroke-width="2.2"/>
<path d="M24,40 C24,35 27,32.4 32,32.4 C37,32.4 40,35 40,40 Z" fill="#82e6c8" stroke="#1d7563" stroke-width="1.6" ${R}/>
<path d="M24.6,33 L28,30.6 M31,36 L35,32" stroke="#ffffff" stroke-width="1.6" opacity=".9" ${R}/>
<path d="M14,28 L14,46" stroke="#ffffff" stroke-width="2.2" opacity=".7" ${R}/>`));

// Jump button icon: chunky up arrow + sparkle.
write('jump.svg', svg(48, 48, `<path d="M24,5 L42,24 C43,25 42.4,26.6 41,26.6 L32,26.6 L32,40 C32,41.8 30.8,43 29,43 L19,43 C17.2,43 16,41.8 16,40 L16,26.6 L7,26.6 C5.6,26.6 5,25 6,24 Z" fill="#ffffff" stroke="#2c3778" stroke-width="3.4" ${R}/>
<path d="M27,24 L35,24 L24,12.6 Z M27.4,26 L27.4,39.4 L29.6,39.4 L29.6,26 Z" fill="#c9d4ff"/>
<path d="M12.4,23 L22,12.4" stroke="#ffffff" stroke-width="2" ${R}/>
${sparkle(40, 9, 5.4, '#fff3a6', '#b07a00', 1.3)}`));

/* ============================== ICON ============================== */
function inner(name, pre) {
  const s = fs.readFileSync(path.join(OUT, name + '.svg'), 'utf8');
  return s.replace(/^<svg[^>]*>\n?/, '').replace(/<\/svg>\s*$/, '')
    .replace(/id="(\w+)"/g, `id="${pre}_$1"`).replace(/url\(#(\w+)\)/g, `url(#${pre}_$1)`);
}
{
  const stars = [[40, 60, 2.6], [78, 30, 2], [196, 36, 2.4], [226, 92, 1.8], [30, 120, 1.6], [120, 22, 1.6], [214, 150, 1.6], [160, 54, 1.4], [62, 96, 1.4]];
  // Bristle (happy) skating: sprite scale 1.45, body centre at (98,162); board 1.45 under him (deck centre = body + 38*... in sprite units).
  const S = 1.3, HX = 92, HY = 154;
  const hx = HX - 60 * S, hy = HY - 54 * S;
  const SB = S * 0.62 / 0.8;                                 // board/hog scale ratio as in render.js
  const bx = HX - 60 * SB, by = HY + 40 * S - 10 * SB;      // board deck top on the feet line
  const BS = 1.3, BX = 180, BY = 84;                        // bubble centre
  write('icon.svg', svg(256, 256, `<defs>
  <radialGradient id="ibg" cx=".5" cy=".38" r=".75"><stop offset="0" stop-color="#3a4a9a"/><stop offset=".65" stop-color="#1e2766"/><stop offset="1" stop-color="#121842"/></radialGradient>
</defs>
<rect width="256" height="256" fill="url(#ibg)"/>
<circle cx="128" cy="128" r="120" fill="none" stroke="#ffffff" stroke-opacity=".14" stroke-width="6"/>
${stars.map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff8d8"/>`).join('')}
${sparkle(222, 192, 6, '#fff8d8', null)}${sparkle(34, 172, 5, '#fff8d8', null)}
<path d="M58,40 C44,44 36,58 40,72 C44,86 58,94 72,90 C60,88 51,78 51,66 C51,54 58,44 68,40 C64,39 61,39 58,40 Z" fill="#ffe7a0" stroke="#d29a2a" stroke-width="2.4" ${R}/>
<path d="M-10,256 L-10,226 C40,206 216,206 266,226 L266,256 Z" fill="#cdc7e4"/>
<path d="M-10,226 C40,206 216,206 266,226" fill="none" stroke="#ffffff" stroke-width="3" opacity=".7"/>
<ellipse cx="200" cy="236" rx="16" ry="4" fill="#ada6cc"/><ellipse cx="40" cy="240" rx="10" ry="3" fill="#ada6cc"/>
<g transform="translate(${f1(BX - 24 * BS * 1.2)},${f1(BY - 26 * BS * 1.2)}) scale(${f1(BS * 1.2)})">${inner('cupcake_pink', 'icc')}</g>
<g transform="translate(${f1(BX - 40 * BS)},${f1(BY - 40 * BS)}) scale(${BS})">${inner('bubble', 'ibu')}</g>
<g transform="translate(${f1(bx)},${f1(by)}) scale(${f1(SB * 100) / 100})">${inner('board', 'ibo')}</g>
<g transform="translate(${f1(hx)},${f1(hy)}) scale(${S})">${inner('bristle_happy', 'ihh')}</g>`));
}
console.log('wrote to', OUT);
