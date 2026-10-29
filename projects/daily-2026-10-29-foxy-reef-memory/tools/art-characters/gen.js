// Generates Foxy's Reef Memory character + card SVGs. 100% original hand-written artwork.
// Usage: node gen.js [outDir]
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || path.join(__dirname, '../../game/assets/default');
fs.mkdirSync(OUT, { recursive: true });
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const R = 'stroke-linejoin="round" stroke-linecap="round"';
const write = (name, s) => fs.writeFileSync(path.join(OUT, name), s);

/* ============================== FOXY ============================== */
const F = {
  fur: '#ff8a3d', furShade: '#e8692a', furLight: '#ffb072', line: '#7a3414',
  cream: '#fff1dc', creamShade: '#f3d6b4', sock: '#5a2f1c', nose: '#3a2016',
  eye: '#2a1810', cheek: '#ff7f86', earIn: '#ffd7bd',
  glass: '#c9f1ff', rim: '#e4f8ff', rimLine: '#2f6f8c',
  brass: '#ffc845', brassShade: '#e09a22', brassLine: '#8a5410',
  tank: '#4fd1c5', tankShade: '#2fa79c', tankLine: '#17605a',
};
const HC = [89, 42], HR = 32; // helmet centre + radius
const TORSO = 'M33,76 C32,64 45,57 62,57 C78,57 90,64 90,74 C90,85 78,92 61,92 C44,92 34,87 33,76 Z';
const HEAD = 'M74,40 C74,29 82,24 90,24 C99,24 105,30 107,37 C112,39 118,43 118,48 C118,53 112,56 105,56 ' +
  'C101,60 95,62 89,62 L83,63 L84,59 L77,60 L79,56 L73,55 L76,51 C74,48 74,44 74,40 Z';

function limb(d, near) {
  const fill = near ? F.fur : F.furShade;
  const end = d.trim().split(/[\s,]+/).slice(-2).map(Number);
  return `<path d="${d}" fill="none" stroke="${F.line}" stroke-width="11" ${R}/>
<path d="${d}" fill="none" stroke="${fill}" stroke-width="6.6" ${R}/>
<circle cx="${end[0]}" cy="${end[1]}" r="4.9" fill="${F.sock}" stroke="${F.line}" stroke-width="2.2"/>
<circle cx="${end[0] - 1.3}" cy="${end[1] - 1.5}" r="1.3" fill="#8a5a40"/>`;
}

function tail(rot) {
  const P = 'M3,-5 C-6,-16 -22,-21 -34,-17 C-41,-15 -45,-10 -44,-5 C-47,-2 -46,2 -42,3 C-40,8 -32,10 -23,8 ' +
    'C-13,8 -5,5 3,4 Z';
  return `<g transform="translate(40,72) rotate(${rot}) scale(0.9)">
  <defs><clipPath id="tl${rot}"><path d="${P}"/></clipPath></defs>
  <path d="${P}" fill="${F.fur}"/>
  <g clip-path="url(#tl${rot})">
    <path d="M-50,2 C-30,9 -12,10 6,2 L6,14 L-50,14 Z" fill="${F.furShade}"/>
    <path d="M-29,-24 C-33,-14 -34,-4 -30,14 L-52,14 L-52,-24 Z" fill="${F.cream}"/>
    <path d="M-30,-14 C-20,-17 -8,-14 0,-8" fill="none" stroke="${F.furLight}" stroke-width="3" ${R}/>
  </g>
  <path d="${P}" fill="none" stroke="${F.line}" stroke-width="3.2" ${R}/>
  <path d="M-38,-6 C-34,-4 -31,-4 -28,-6 M-36,2 C-33,1 -31,0 -29,-2" fill="none" stroke="${F.creamShade}" stroke-width="1.6" ${R}/>
</g>`;
}

const EYES = {
  open: `
<ellipse cx="91" cy="39.5" rx="5.2" ry="6.4" fill="${F.eye}"/>
<circle cx="92.8" cy="37" r="2.2" fill="#fff"/><circle cx="89.6" cy="42.6" r="1" fill="#fff" opacity=".8"/>
<ellipse cx="103.5" cy="38" rx="4.1" ry="5.6" fill="${F.eye}"/>
<circle cx="104.9" cy="35.8" r="1.8" fill="#fff"/><circle cx="102.5" cy="40.6" r=".8" fill="#fff" opacity=".8"/>
<path d="M85.5,30.5 C88,29 91,29 93.5,30 M100,29.3 C102,28.4 104.5,28.6 106.5,29.6" fill="none" stroke="${F.line}" stroke-width="1.8" ${R}/>`,
  happy: `
<path d="M86,41 C88,35.5 94,35.5 96,41" fill="none" stroke="${F.eye}" stroke-width="2.8" ${R}/>
<path d="M99.5,40 C101,35.5 106,35.5 107.5,40" fill="none" stroke="${F.eye}" stroke-width="2.6" ${R}/>`,
  wide: `
<ellipse cx="91" cy="39.5" rx="5.6" ry="6.6" fill="#fff" stroke="${F.eye}" stroke-width="1.8"/>
<circle cx="91.6" cy="40" r="2.7" fill="${F.eye}"/><circle cx="92.4" cy="39" r=".9" fill="#fff"/>
<ellipse cx="103.5" cy="38" rx="4.6" ry="6" fill="#fff" stroke="${F.eye}" stroke-width="1.8"/>
<circle cx="104" cy="38.6" r="2.3" fill="${F.eye}"/><circle cx="104.7" cy="37.7" r=".8" fill="#fff"/>
<path d="M85,29.5 C87.5,27 90.5,26.5 93.5,27.5 M100,27 C102,25.5 105,25.6 107,27" fill="none" stroke="${F.line}" stroke-width="1.8" ${R}/>`,
  sparkle: `
<ellipse cx="91" cy="39.5" rx="5.4" ry="6.6" fill="${F.eye}"/>
<path d="M92.6,34.6 L93.4,37 L95.8,37.8 L93.4,38.6 L92.6,41 L91.8,38.6 L89.4,37.8 L91.8,37 Z" fill="#fff"/>
<circle cx="89.4" cy="43" r="1" fill="#fff"/>
<ellipse cx="103.5" cy="38" rx="4.3" ry="5.8" fill="${F.eye}"/>
<path d="M104.8,33.8 L105.4,35.7 L107.3,36.3 L105.4,36.9 L104.8,38.8 L104.2,36.9 L102.3,36.3 L104.2,35.7 Z" fill="#fff"/>
<path d="M85.5,30 C88,28.4 91,28.4 93.5,29.4 M100,28.8 C102,27.8 104.5,28 106.5,29" fill="none" stroke="${F.line}" stroke-width="1.8" ${R}/>`,
};
const MOUTH = {
  smile: `<path d="M107,52.5 C109,55.5 112.5,55.6 114.5,52.6" fill="none" stroke="${F.line}" stroke-width="2" ${R}/>`,
  chomp: `<path d="M104.5,51.5 C105,60 110,63.5 113.5,62.5 C117,61.5 118,56 117.5,51.6 C113,53.6 108,53.4 104.5,51.5 Z" fill="#9e2a2a" stroke="${F.line}" stroke-width="2" ${R}/>
<path d="M107,58.5 C109,56.5 113,56.5 115.5,58.6 C114,61.6 109.6,62 107,58.5 Z" fill="#ff8b94"/>
<path d="M106.3,52.6 L107.4,55 L108.8,52.9 Z" fill="#fff"/>`,
  oops: `<path d="M105.5,54.5 C107,53 108.5,53 110,54.5 C111.5,56 113,56 114.5,54.5" fill="none" stroke="${F.line}" stroke-width="2" ${R}/>`,
  grin: `<path d="M105,51.8 C106.5,58.6 115.4,59 117.2,51.6 C113,53.6 109,53.6 105,51.8 Z" fill="#9e2a2a" stroke="${F.line}" stroke-width="2" ${R}/>
<path d="M107.6,55.6 C110,54.6 113,54.6 115,55.6 C113.8,57.6 109.4,57.8 107.6,55.6 Z" fill="#ff8b94"/>`,
};

function fox(o) {
  const [cx, cy] = HC;
  const ang = d => [cx + HR * Math.cos(d * Math.PI / 180), cy + HR * Math.sin(d * Math.PI / 180)];
  const [c1x, c1y] = ang(104), [c2x, c2y] = ang(172);
  const collar = `M${c1x.toFixed(1)},${c1y.toFixed(1)} A${HR},${HR} 0 0 1 ${c2x.toFixed(1)},${c2y.toFixed(1)}`;
  return `<g transform="translate(6,6)">
<defs>
  <clipPath id="tor"><path d="${TORSO}"/></clipPath>
  <clipPath id="hd"><path d="${HEAD}"/></clipPath>
  <radialGradient id="gl" cx="0.38" cy="0.32" r="0.75">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.10"/>
    <stop offset="0.75" stop-color="${F.glass}" stop-opacity="0.22"/>
    <stop offset="1" stop-color="#8fdcf5" stop-opacity="0.5"/>
  </radialGradient>
</defs>
${tail(o.tail)}
<g>${limb(o.farHind, false)}${limb(o.farFront, false)}</g>
<!-- air tank -->
<g transform="translate(46,58) rotate(-14)" ${R}>
  <rect x="-17" y="-13" width="28" height="12" rx="6" fill="${F.tank}" stroke="${F.tankLine}" stroke-width="2.6"/>
  <rect x="-15" y="-6" width="24" height="4" rx="2" fill="${F.tankShade}"/>
  <rect x="-13" y="-11.2" width="14" height="2.4" rx="1.2" fill="#b6f3ec"/>
  <rect x="-4" y="-13.5" width="4" height="13" fill="${F.brass}" stroke="${F.brassLine}" stroke-width="1.6"/>
  <rect x="11" y="-10.5" width="4" height="7" rx="1.5" fill="${F.brass}" stroke="${F.brassLine}" stroke-width="1.6"/>
</g>
<path d="M58,50 C63,46 66,50 62,55" fill="none" stroke="${F.tankLine}" stroke-width="5" ${R}/>
<path d="M58,50 C63,46 66,50 62,55" fill="none" stroke="#7a8e96" stroke-width="2.4" ${R}/>
<!-- torso -->
<path d="${TORSO}" fill="${F.fur}"/>
<g clip-path="url(#tor)">
  <path d="M30,80 C46,92 70,95 94,82 L96,100 L28,100 Z" fill="${F.furShade}"/>
  <ellipse cx="76" cy="84" rx="17" ry="10" fill="${F.cream}"/>
  <ellipse cx="50" cy="63" rx="12" ry="3.6" fill="${F.furLight}" transform="rotate(-6 50 63)"/>
</g>
<path d="${TORSO}" fill="none" stroke="${F.line}" stroke-width="3" ${R}/>
${limb(o.nearHind, true)}
${o.farFrontTop ? limb(o.farFrontTop, false) : ''}
<path d="M70,66 C72,56 84,52 94,56 L96,64 C88,70 76,72 70,66 Z" fill="${F.fur}"/>
<path d="M76,66 C82,61 90,61 95,63" fill="none" stroke="${F.cream}" stroke-width="4" ${R}/>
<!-- glass back tint -->
<circle cx="${cx}" cy="${cy}" r="${HR}" fill="url(#gl)"/>
<!-- far ear -->
<path d="M93,28 L101.5,14 C103.6,19 105.4,25 105,31 Z" fill="${F.furShade}" stroke="${F.line}" stroke-width="2.8" ${R}/>
<path d="M97,26 L101.2,19 C102.4,22 103.2,25.4 103,28.5 Z" fill="${F.sock}"/>
<!-- head -->
<path d="${HEAD}" fill="${F.fur}"/>
<g clip-path="url(#hd)">
  <path d="M84,49 C95,53 105,52 120,47 L120,66 L70,66 Z" fill="${F.cream}"/>
  <path d="M70,52 C76,57 84,60 92,60 L92,66 L70,66 Z" fill="${F.creamShade}" opacity=".55"/>
  <ellipse cx="86" cy="29" rx="9" ry="3.2" fill="${F.furLight}" transform="rotate(-14 86 29)"/>
</g>
<path d="${HEAD}" fill="none" stroke="${F.line}" stroke-width="3" ${R}/>
<!-- near ear -->
<path d="M76,33 L73.6,14 C80,17.4 86,21 89,27 Z" fill="${F.fur}" stroke="${F.line}" stroke-width="3" ${R}/>
<path d="M78,29 L77,19.4 C80.4,21.6 83.6,23.6 85.4,26 Z" fill="${F.earIn}"/>
<!-- face -->
<ellipse cx="96" cy="48.5" rx="4" ry="2.5" fill="${F.cheek}" opacity="${o.blush || 0.75}"/>
${EYES[o.eyes]}
<ellipse cx="116.6" cy="46.6" rx="3.3" ry="2.7" fill="${F.nose}"/>
<ellipse cx="115.6" cy="45.6" rx="1.1" ry=".7" fill="#fff" opacity=".7"/>
${MOUTH[o.mouth]}
${o.extraHead || ''}
<!-- collar -->
<path d="${collar}" fill="none" stroke="${F.brassLine}" stroke-width="12" ${R}/>
<path d="${collar}" fill="none" stroke="${F.brass}" stroke-width="7.6" ${R}/>
<path d="${collar}" fill="none" stroke="${F.brassShade}" stroke-width="2.6" transform="translate(-1.2 1.2)" opacity=".8" ${R}/>
<path d="${collar}" fill="none" stroke="#fff3c4" stroke-width="2" stroke-dasharray="0.1 7.5" ${R}/>
<!-- glass rim + highlights -->
<circle cx="${cx}" cy="${cy}" r="${HR}" fill="none" stroke="${F.rimLine}" stroke-width="4.4"/>
<circle cx="${cx}" cy="${cy}" r="${HR}" fill="none" stroke="${F.rim}" stroke-width="1.8" opacity=".95"/>
<path d="M66,32 C69,22 77,15 87,13" fill="none" stroke="#fff" stroke-width="4.2" opacity=".9" ${R}/>
<circle cx="64.6" cy="38.6" r="2" fill="#fff" opacity=".9"/>
<path d="M112,64 C108,68 103,70.6 98,71.6" fill="none" stroke="#fff" stroke-width="2.4" opacity=".55" ${R}/>
<!-- near legs -->
${limb(o.nearFront, true)}
${o.extra || ''}
</g>`;
}

const sparkle = (x, y, s, c = '#ffe45c') =>
  `<path d="M${x},${y - s} C${x + s * .18},${y - s * .2} ${x + s * .2},${y - s * .18} ${x + s},${y} C${x + s * .2},${y + s * .18} ${x + s * .18},${y + s * .2} ${x},${y + s} ` +
  `C${x - s * .18},${y + s * .2} ${x - s * .2},${y + s * .18} ${x - s},${y} C${x - s * .2},${y - s * .18} ${x - s * .18},${y - s * .2} ${x},${y - s} Z" fill="${c}" stroke="#b07a10" stroke-width="1.2" ${R}/>`;

const FRAMES = {
  swim1: { tail: 10, eyes: 'open', mouth: 'smile',
    nearFront: 'M78,82 Q88,88 98,84', farFront: 'M73,84 Q78,93 73,99',
    nearHind: 'M45,84 Q35,91 25,90', farHind: 'M50,85 Q48,94 42,99' },
  swim2: { tail: -2, eyes: 'open', mouth: 'smile',
    nearFront: 'M78,82 Q83,92 80,100', farFront: 'M73,84 Q83,89 93,87',
    nearHind: 'M45,84 Q43,95 37,100', farHind: 'M50,85 Q40,90 30,88' },
  swim3: { tail: -13, eyes: 'open', mouth: 'smile',
    nearFront: 'M78,82 Q76,92 67,96', farFront: 'M73,84 Q81,93 84,100',
    nearHind: 'M45,84 Q49,94 51,100', farHind: 'M50,85 Q42,94 32,95' },
};
FRAMES.eat = { ...FRAMES.swim2, tail: 6, eyes: 'happy', mouth: 'chomp', blush: 0.95 };
FRAMES.oops = { ...FRAMES.swim2, tail: -8, eyes: 'wide', mouth: 'oops', blush: 1,
  nearFront: 'M78,82 Q90,86 97,79',
  extraHead: `<path d="M80.5,33 C78.8,36 78.4,38.2 80.5,39.4 C82.6,38.2 82.2,36 80.5,33 Z" fill="#7fd7ff" stroke="#2f7fa8" stroke-width="1.2" ${R}/>
<path d="M89,50 L92.5,49 M89.3,52.4 L92.6,51" stroke="#e85a64" stroke-width="1.1" ${R} opacity=".7"/>` };
FRAMES.cheer = { tail: 14, eyes: 'sparkle', mouth: 'grin', blush: 0.95,
  nearFront: 'M78,81 Q100,86 117,70', farFront: 'M70,74 Q66,80 66,80', farFrontTop: 'M64,68 Q50,60 45,40',
  nearHind: 'M45,84 Q35,93 27,96', farHind: 'M50,85 Q53,95 57,101',
  extra: sparkle(124, 50, 6) + sparkle(126, 68, 3.6, '#fff4a8') + sparkle(36, 28, 4.4, '#fff4a8') };

for (const [n, o] of Object.entries(FRAMES)) write(`fox_${n}.svg`, svg(140, 120, fox(o)));

/* ============================== CARDS ============================== */
// shell emblem: scalloped fan with ribs, centred on (42,48)
function shellEmblem() {
  const cx = 42, cy = 62; // hinge
  const N = 7, R0 = 30;
  // scalloped top edge
  let d = '';
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const a = (-160 + i * (140 / N)) * Math.PI / 180;
    pts.push([cx + R0 * Math.cos(a), cy + R0 * Math.sin(a) * 0.95]);
  }
  d = `M${(cx - 7)},${cy + 2} L${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i <= N; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
    const nx = mx - cx, ny = my - cy, l = Math.hypot(nx, ny);
    const bx = mx + nx / l * 5.5, by = my + ny / l * 5.5;
    d += ` Q${bx.toFixed(1)},${by.toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  d += ` L${cx + 7},${cy + 2} Z`;
  let ribs = '';
  for (let i = 0; i < N; i++) {
    if (i === 0) continue;
    const [x, y] = pts[i];
    ribs += `M${cx},${cy} L${(cx + (x - cx) * 0.9).toFixed(1)},${(cy + (y - cy) * 0.9).toFixed(1)} `;
  }
  const hinge = `M${cx - 13},${cy + 6} C${cx - 13},${cy - 1} ${cx - 8},${cy - 1} ${cx - 5},${cy} L${cx + 5},${cy} C${cx + 8},${cy - 1} ${cx + 13},${cy - 1} ${cx + 13},${cy + 6} C${cx + 6},${cy + 9} ${cx - 6},${cy + 9} ${cx - 13},${cy + 6} Z`;
  return `<defs>
  <linearGradient id="sh" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fff9f0"/><stop offset="1" stop-color="#ffd9e6"/>
  </linearGradient>
  <clipPath id="shc"><path d="${d}"/></clipPath>
</defs>
<path d="${d}" fill="url(#sh)"/>
<g clip-path="url(#shc)">
  <path d="${ribs}" stroke="#e7a9c6" stroke-width="2.4" fill="none" ${R}/>
  <path d="M${cx - 30},${cy - 6} C${cx - 14},${cy + 2} ${cx + 14},${cy + 2} ${cx + 30},${cy - 6} L${cx + 30},${cy + 12} L${cx - 30},${cy + 12} Z" fill="#f4b7d2" opacity=".55"/>
  <path d="M${cx - 18},${cy - 22} C${cx - 10},${cy - 27} ${cx - 2},${cy - 28} ${cx + 4},${cy - 27}" stroke="#fff" stroke-width="3" fill="none" opacity=".9" ${R}/>
</g>
<path d="${d}" fill="none" stroke="#7a3f7a" stroke-width="2.6" ${R}/>
<path d="${hinge}" fill="#ffd2e2" stroke="#7a3f7a" stroke-width="2.4" ${R}/>
<circle cx="${cx}" cy="${cy - 4}" r="4.6" fill="#fffaf2" stroke="#9a7aa8" stroke-width="1.4"/>
<circle cx="${cx - 1.4}" cy="${cy - 5.6}" r="1.6" fill="#fff"/>`;
}

write('card_back.svg', svg(84, 98, `<defs>
  <linearGradient id="cb" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#3cc8c0"/><stop offset="0.55" stop-color="#5aa9d8"/><stop offset="1" stop-color="#9c86e0"/>
  </linearGradient>
  <radialGradient id="cbg" cx="0.5" cy="0.45" r="0.55">
    <stop offset="0" stop-color="#ffffff" stop-opacity="0.35"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/>
  </radialGradient>
</defs>
<rect x="1.5" y="1.5" width="81" height="95" rx="12" fill="url(#cb)" stroke="#24566e" stroke-width="3"/>
<rect x="6.5" y="6.5" width="71" height="85" rx="8" fill="none" stroke="#e8fbff" stroke-width="1.6" opacity=".7"/>
<rect x="6.5" y="6.5" width="71" height="85" rx="8" fill="url(#cbg)"/>
<path d="M14,12 C26,8 40,8 54,10" stroke="#fff" stroke-width="2.4" fill="none" opacity=".45" ${R}/>
<g fill="#ffffff" opacity=".5">
  <circle cx="14" cy="84" r="2.2"/><circle cx="19" cy="79" r="1.3"/><circle cx="70" cy="15" r="2"/><circle cx="66" cy="20" r="1.2"/>
</g>
${shellEmblem()}`));

write('card_front.svg', svg(84, 98, `<defs>
  <linearGradient id="cf" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#fffaf0"/><stop offset="1" stop-color="#fbebcf"/>
  </linearGradient>
</defs>
<rect x="1.5" y="1.5" width="81" height="95" rx="12" fill="url(#cf)" stroke="#a9825a" stroke-width="3"/>
<rect x="6.5" y="6.5" width="71" height="85" rx="8" fill="none" stroke="#ecd2a8" stroke-width="2"/>
<g fill="#ecd2a8">
  <circle cx="12" cy="12" r="1.6"/><circle cx="72" cy="12" r="1.6"/><circle cx="12" cy="86" r="1.6"/><circle cx="72" cy="86" r="1.6"/>
</g>
<path d="M30,92 C34,89.6 38,89.6 42,92 C46,94.4 50,94.4 54,92" fill="none" stroke="#ecd2a8" stroke-width="1.6" ${R}/>
<path d="M30,6 C34,3.6 38,3.6 42,6 C46,8.4 50,8.4 54,6" fill="none" stroke="#ecd2a8" stroke-width="1.6" ${R}/>`));

/* ============================== FACES ============================== */
const eye = (x, y, r = 3, c = '#22160f') =>
  `<ellipse cx="${x}" cy="${y}" rx="${r * .85}" ry="${r}" fill="${c}"/><circle cx="${x + r * .3}" cy="${y - r * .38}" r="${r * .36}" fill="#fff"/>`;
const smile = (x, y, w, c, sw = 1.8) =>
  `<path d="M${x - w / 2},${y} C${x - w / 4},${y + w * .45} ${x + w / 4},${y + w * .45} ${x + w / 2},${y}" fill="none" stroke="${c}" stroke-width="${sw}" ${R}/>`;
const blush = (x, y, rx = 2.6, c = '#ff7f9a', o = .7) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${rx * .6}" fill="${c}" opacity="${o}"/>`;
const hl = (d, w = 2.4, o = .75) => `<path d="${d}" fill="none" stroke="#fff" stroke-width="${w}" opacity="${o}" ${R}/>`;

const faces = [];
// 00 starfish — orange
(() => {
  const cx = 32, cy = 34, ro = 29, ri = 13.5;
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (-90 + i * 36) * Math.PI / 180, r = i % 2 ? ri : ro;
    const x = cx + r * Math.cos(a), y = cy + r * Math.sin(a);
    if (i === 0) d = `M${x.toFixed(1)},${y.toFixed(1)}`;
    else if (i % 2) d += ` Q${(cx + (ro * .55) * Math.cos(a - 18 * Math.PI / 180) * 1.02).toFixed(1)},${(cy + (ro * .55) * Math.sin(a - 18 * Math.PI / 180)).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
    else d += ` Q${(cx + (ro * .55) * Math.cos(a - 18 * Math.PI / 180)).toFixed(1)},${(cy + (ro * .55) * Math.sin(a - 18 * Math.PI / 180)).toFixed(1)} ${x.toFixed(1)},${y.toFixed(1)}`;
  }
  d += ' Z';
  const dots = [[32, 12], [52, 28], [45, 52], [19, 52], [12, 28], [32, 18], [46, 31], [40, 46], [24, 46], [18, 31]]
    .map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="${i < 5 ? 1.5 : 1.2}" fill="#ffd27a"/>`).join('');
  faces.push(`<path d="${d}" fill="#a8461a" stroke="#a8461a" stroke-width="10" ${R}/>
<path d="${d}" fill="#ff8a3a" stroke="#ff8a3a" stroke-width="4.8" ${R}/>
<path d="M29.6,13 C27,21 24,25.6 16,28.4" fill="none" stroke="#ffb978" stroke-width="2.6" ${R}/>
${dots}
${eye(27.5, 33, 3)}${eye(36.5, 33, 3)}
${smile(32, 38.5, 6, '#7a2c0c')}${blush(23, 38)}${blush(41, 38)}`);
})();
// 01 seahorse — yellow
faces.push(`<path d="M30,49 C25,56 27,62.4 33,62.6 C38.6,62.8 40,57 36.6,55.4 C34.6,54.6 33.2,56.4 34.4,58" fill="none" stroke="#9a6a08" stroke-width="8.4" ${R}/>
<path d="M30,49 C25,56 27,62.4 33,62.6 C38.6,62.8 40,57 36.6,55.4 C34.6,54.6 33.2,56.4 34.4,58" fill="none" stroke="#ffd23c" stroke-width="3.8" ${R}/>
<path d="M25,32 C17,30 13,36 14,43 C17.4,43 21,42 24.6,40.6 Z" fill="#ffb02e" stroke="#9a6a08" stroke-width="2.4" ${R}/>
<path d="M23.6,34.6 L17,37 M23.8,38 L16.4,40.6" stroke="#d98a10" stroke-width="1.3" ${R}/>
<path d="M27,7 L27.6,2.6 L30.4,5.6 L33,2.4 L34,6.6 Z" fill="#ffb02e" stroke="#9a6a08" stroke-width="2" ${R}/>
<path d="M28,5 C34,4 38,8 38.4,12 C42,12 47,12.4 51,13 C54,13.4 55.6,15.6 55.2,18 C54.8,20.4 52.6,21 50,21 C46,21 42,21.4 39.6,22.4 C39,24.6 38.6,26.6 38.6,28.4 C44.6,31.4 47.6,37 46.6,43.4 C45.6,50 39.4,54 32.4,53.4 C27,52.8 24,48.4 24,43.4 C24,38.4 26.4,34 25.2,30 C23,27 21,24 21,19 C21,11 24,6 28,5 Z" fill="#ffd23c" stroke="#9a6a08" stroke-width="2.8" ${R}/>
<path d="M39,31 C34,33 32,36 32,38 M42.6,36.6 C37,37.6 34,40 33.4,42.6 M44,42.6 C38.6,43 35.4,45.4 34.4,48.4" fill="none" stroke="#f0a91c" stroke-width="2" ${R}/>
<path d="M53,14.4 L53,19.6" stroke="#e8a51a" stroke-width="2" ${R}/>
${hl('M24.6,14 C24,19 24.6,23.6 27,27', 2.2)}
${eye(32, 14.6, 3.6)}${blush(34.6, 21.8, 2.4)}
<path d="M51.6,19.2 C53,20 54.4,19.8 55,19" fill="none" stroke="#9a6a08" stroke-width="1.3" ${R}/>`);
// 02 octopus — magenta pink
faces.push(`<g ${R}>
<path d="M14,40 C10,46 6,50 4,52 C7,55 13,52 16,47 M22,44 C21,52 17,58 14,61 C19,62 25,56 26,48 M32,45 C32,53 31,58 30,62 C35,62 37,55 37,46
 M41,44 C43,51 47,56 51,58 C54,56 49,51 46,44 M49,40 C54,45 58,47 61,47 C61,43 56,40 51,36" fill="#e0489a" stroke="#7d1a50" stroke-width="2.6"/>
<path d="M32,6 C46,6 54,16 54,27 C54,38 47,46 32,46 C17,46 10,38 10,27 C10,16 18,6 32,6 Z" fill="#e0489a" stroke="#7d1a50" stroke-width="2.8"/>
<path d="M13,33 C18,44 46,44 51,33 C52,40 46,46 32,46 C18,46 12,40 13,33 Z" fill="#c23280"/>
<circle cx="20" cy="18" r="2.4" fill="#f58cc2"/><circle cx="44" cy="15" r="1.8" fill="#f58cc2"/><circle cx="47" cy="22" r="1.4" fill="#f58cc2"/>
${hl('M18,12 C22,9 26,8 30,8', 2.6)}
</g>
${eye(25, 28, 3.6)}${eye(39, 28, 3.6)}${smile(32, 34.5, 7, '#6a1040', 2)}${blush(19.5, 34.5, 2.8, '#ffb3d4', .9)}${blush(44.5, 34.5, 2.8, '#ffb3d4', .9)}`);
// 03 crab — red
faces.push(`<g ${R} stroke="#7a1414">
<path d="M12,42 L4,46 M13,47 L5,53 M15,51 L9,58 M52,42 L60,46 M51,47 L59,53 M49,51 L55,58" stroke-width="5.4"/>
<path d="M12,42 L4,46 M13,47 L5,53 M15,51 L9,58 M52,42 L60,46 M51,47 L59,53 M49,51 L55,58" stroke="#e23b3b" stroke-width="2.4"/>
<path d="M16,34 C14,28 12,24 11,21 M48,34 C50,28 52,24 53,21" stroke-width="5"/>
<path d="M16,34 C14,28 12,24 11,21 M48,34 C50,28 52,24 53,21" stroke="#e23b3b" stroke-width="2.4"/>
<path d="M11,22 C4,21 2,14 4,9 C6,5 11,4 14,6 L10,12 L16,13 C17,18 15,22 11,22 Z" fill="#e23b3b" stroke-width="2.6"/>
<path d="M53,22 C60,21 62,14 60,9 C58,5 53,4 50,6 L54,12 L48,13 C47,18 49,22 53,22 Z" fill="#e23b3b" stroke-width="2.6"/>
<path d="M24,30 L24,22 M40,30 L40,22" stroke-width="2.4"/>
<path d="M32,29 C46,29 55,35 55,43 C55,51 45,55 32,55 C19,55 9,51 9,43 C9,35 18,29 32,29 Z" fill="#e23b3b" stroke-width="2.8"/>
<path d="M11,46 C18,53 46,53 53,46 C53,52 44,55 32,55 C20,55 11,52 11,46 Z" fill="#c22828" stroke="none"/>
</g>
${hl('M17,35 C21,32 26,31 31,31', 2.4)}
<circle cx="24" cy="20" r="4.6" fill="#fff" stroke="#7a1414" stroke-width="2"/><circle cx="24.8" cy="20.6" r="2.4" fill="#22160f"/><circle cx="25.6" cy="19.6" r=".8" fill="#fff"/>
<circle cx="40" cy="20" r="4.6" fill="#fff" stroke="#7a1414" stroke-width="2"/><circle cx="40.8" cy="20.6" r="2.4" fill="#22160f"/><circle cx="41.6" cy="19.6" r=".8" fill="#fff"/>
${smile(32, 41, 9, '#6a0e0e', 2)}${blush(20, 41, 2.8, '#ffb0a0', .9)}${blush(44, 41, 2.8, '#ffb0a0', .9)}
<path d="M8,9.5 L12.6,12.5" stroke="#ff8a8a" stroke-width="1.4" ${R}/>`);
// 04 pufferfish — pale aqua with spikes
(() => {
  let sp = '';
  for (let i = 0; i < 14; i++) {
    const a = (-150 + i * 22) * Math.PI / 180;
    if (Math.abs(i * 22 - 150 - 0) < 15) continue; // gap at mouth (right side)
    const x0 = 29 + 20 * Math.cos(a), y0 = 33 + 20 * Math.sin(a);
    const x1 = 29 + 27 * Math.cos(a), y1 = 33 + 27 * Math.sin(a);
    const px = -Math.sin(a) * 3.2, py = Math.cos(a) * 3.2;
    sp += `M${(x0 + px).toFixed(1)},${(y0 + py).toFixed(1)} L${x1.toFixed(1)},${y1.toFixed(1)} L${(x0 - px).toFixed(1)},${(y0 - py).toFixed(1)} Z `;
  }
  faces.push(`<path d="${sp}" fill="#d8f7f5" stroke="#2b7f86" stroke-width="2" ${R}/>
<path d="M8,33 C3,27 2,24 3,22 C6,27 6,39 3,44 C2,42 3,39 8,33 Z" fill="#7fe6e6" stroke="#2b7f86" stroke-width="2.4" ${R}/>
<circle cx="29" cy="33" r="21" fill="#7fe6e6" stroke="#2b7f86" stroke-width="2.8"/>
<path d="M11,40 C16,52 42,56 49,40 C48,49 40,54 29,54 C18,54 11,48 11,40 Z" fill="#e9fbf9"/>
<g fill="#3fb2b8"><circle cx="18" cy="24" r="1.7"/><circle cx="24" cy="18" r="1.5"/><circle cx="33" cy="16" r="1.4"/><circle cx="16" cy="32" r="1.4"/></g>
<path d="M27,39 C21,40 19,45 21,48 C25,47.6 28.6,44.6 30,40.6 Z" fill="#52cdd0" stroke="#2b7f86" stroke-width="2" ${R}/>
${hl('M16,20 C19,16 23,14 27,13.5', 2.6)}
<circle cx="37" cy="27" r="5" fill="#fff" stroke="#2b7f86" stroke-width="2"/><circle cx="38.4" cy="27.6" r="3" fill="#22160f"/><circle cx="39.4" cy="26.4" r="1" fill="#fff"/>
<ellipse cx="51.5" cy="35" rx="3.4" ry="3" fill="#ff8fa6" stroke="#2b7f86" stroke-width="2"/>
${blush(42, 36, 2.6)}`);
})();
// 05 sea turtle — green
faces.push(`<g ${R} stroke="#145c3a" stroke-width="2.6">
<path d="M18,24 C12,16 8,10 4,9 C3,14 7,22 14,28 Z" fill="#7fd1a0"/>
<path d="M17,44 C12,50 8,54 4,55 C4,51 8,45 14,40 Z" fill="#7fd1a0"/>
<path d="M44,23 C48,14 52,8 57,7 C58,12 54,20 48,27 Z" fill="#7fd1a0"/>
<path d="M45,43 C50,49 53,53 57,54 C58,50 54,45 48,40 Z" fill="#7fd1a0"/>
<path d="M10,33 C6,32 3,33 1.6,34.6 C4,36 7,36 10,35 Z" fill="#7fd1a0" stroke-width="2"/>
<path d="M46,30 C50,24 60,25 62,32 C63,38 56,42 50,39 Z" fill="#7fd1a0"/>
<path d="M30,15 C43,15 50,23 50,33 C50,43 42,51 30,51 C18,51 10,43 10,33 C10,23 17,15 30,15 Z" fill="#2fa36e" stroke-width="2.8"/>
<path d="M30,22 L37,26.6 L37,36 L30,40.6 L23,36 L23,26.6 Z M30,22 L30,15.6 M37,26.6 L45,22 M37,36 L45,41 M30,40.6 L30,50.4 M23,36 L15,41 M23,26.6 L15,22" fill="#4fbf86" stroke="#1d7a4c" stroke-width="1.8"/>
</g>
${hl('M16,24 C19,20 23,18 27,17.5', 2.4)}
${eye(55, 30.6, 2.6)}${smile(56.6, 35, 4, '#145c3a', 1.5)}${blush(52.6, 34.4, 1.8, '#ff9fb0', .8)}`);
// 06 striped reef fish — blue with white bands, yellow fins (original)
faces.push(`<defs><clipPath id="fb6"><path d="M12,32 C14,20 26,12 38,13 C50,14 58,23 59,32 C58,41 50,50 38,51 C26,52 14,44 12,32 Z"/></clipPath></defs>
<g ${R} stroke="#173d86" stroke-width="2.6">
<path d="M14,32 C9,24 5,20 2,20 C3,26 5,29 6,32 C5,35 3,38 2,44 C5,44 9,40 14,32 Z" fill="#ffd23c"/>
<path d="M28,15 C30,8 38,4 46,5 C44,9 44,12 46,16 Z" fill="#ffd23c"/>
<path d="M30,49 C32,55 37,58 42,58 C41,55 41,52 42,49 Z" fill="#ffd23c"/>
<path d="M12,32 C14,20 26,12 38,13 C50,14 58,23 59,32 C58,41 50,50 38,51 C26,52 14,44 12,32 Z" fill="#3a86f0" stroke="none"/>
<g clip-path="url(#fb6)">
  <path d="M22,8 C19,22 19,42 22,56 L29,56 C26,42 26,22 29,8 Z M40,8 C37,22 37,42 40,56 L45,56 C42,42 42,22 45,8 Z" fill="#fff" stroke="#173d86" stroke-width="1.6"/>
  <path d="M10,40 C22,52 50,54 62,38 L62,60 L10,60 Z" fill="#2a6cd0" stroke="none"/>
</g>
<path d="M12,32 C14,20 26,12 38,13 C50,14 58,23 59,32 C58,41 50,50 38,51 C26,52 14,44 12,32 Z" fill="none" stroke-width="2.8"/>
<path d="M34,34 C38,34 41,37 40,41 C37,40 34,38 34,34 Z" fill="#ffd23c" stroke-width="2"/>
</g>
${hl('M32,17.6 C36,16.4 40,16.4 44,17.4', 2.2)}
<circle cx="50" cy="28" r="4.6" fill="#fff" stroke="#173d86" stroke-width="1.8"/><circle cx="51.2" cy="28.4" r="2.8" fill="#22160f"/><circle cx="52.2" cy="27.2" r="1" fill="#fff"/>
${smile(54, 37, 5, '#173d86', 1.8)}${blush(48.6, 36.8, 2, '#ff9fd0', .85)}`);
// 07 jellyfish — lavender
faces.push(`<g ${R}>
<path d="M17,40 C14,46 20,50 16,56 C14,59 16,62 18,62 M25,42 C23,49 28,53 25,60 M39,42 C41,49 36,53 39,60 M47,40 C50,46 44,50 48,56 C50,59 48,62 46,62" fill="none" stroke="#5a3a9e" stroke-width="5"/>
<path d="M17,40 C14,46 20,50 16,56 C14,59 16,62 18,62 M25,42 C23,49 28,53 25,60 M39,42 C41,49 36,53 39,60 M47,40 C50,46 44,50 48,56 C50,59 48,62 46,62" fill="none" stroke="#e3d0ff" stroke-width="2.2"/>
<path d="M32,44 C31,50 33,54 32,60" fill="none" stroke="#5a3a9e" stroke-width="6"/>
<path d="M32,44 C31,50 33,54 32,60" fill="none" stroke="#b58cf5" stroke-width="3"/>
<path d="M8,38 C8,20 18,7 32,7 C46,7 56,20 56,38 C53,42 50,38 47,41 C44,44 41,39 38,42 C35,45 33,40 32,42 C30,45 28,40 26,42 C23,45 20,39 17,41 C14,43 11,40 8,38 Z" fill="#c89cff" stroke="#5a3a9e" stroke-width="2.8"/>
<path d="M10,34 C20,40 44,40 54,34 C55,36 55.6,37 56,38 C53,42 50,38 47,41 C44,44 41,39 38,42 C35,45 33,40 32,42 C30,45 28,40 26,42 C23,45 20,39 17,41 C14,43 11,40 8,38 C8.6,36.4 9.2,35 10,34 Z" fill="#a77ef0"/>
<circle cx="44" cy="17" r="2" fill="#e8d8ff"/><circle cx="48" cy="23" r="1.4" fill="#e8d8ff"/>
${hl('M15,22 C17,16 21,12.6 26,11', 2.8, .85)}
</g>
${eye(26, 26, 3.2)}${eye(38, 26, 3.2)}${smile(32, 31.6, 5.4, '#4a2a86', 1.9)}${blush(21, 31, 2.5, '#ffaad8', .9)}${blush(43, 31, 2.5, '#ffaad8', .9)}`);
// 08 whale — navy blue
faces.push(`<g ${R}>
<path d="M26,14 C25,9 27,5 29,4 M26,14 C23,10 19,9 16,10 M26,14 C29,10 33,10 36,12" fill="none" stroke="#1a3a6a" stroke-width="4.6"/>
<path d="M26,14 C25,9 27,5 29,4 M26,14 C23,10 19,9 16,10 M26,14 C29,10 33,10 36,12" fill="none" stroke="#9fdcff" stroke-width="2.2"/>
<circle cx="16" cy="9" r="1.8" fill="#9fdcff"/><circle cx="36.6" cy="11" r="1.6" fill="#9fdcff"/><circle cx="29.4" cy="3.4" r="1.6" fill="#9fdcff"/>
<path d="M14,40 C9,36 6,30 3,24 C2,21 5,19 7,21 C9,23 10,24 12,24 C11,21 12,18 14,18 C17,19 18,26 19,32 Z" fill="#2b3f8c" stroke="#121e48" stroke-width="2.6"/>
<path d="M12,38 C12,26 22,18 36,18 C51,18 61,27 61,39 C61,49 52,55 38,55 C23,55 12,50 12,38 Z" fill="#2b3f8c" stroke="#121e48" stroke-width="2.8"/>
<path d="M14,42 C22,47 34,48 44,46 C52,45 58,42 61,39 C61,49 52,55 38,55 C25,55 15,50 14,42 Z" fill="#9fc4f0" stroke="#121e48" stroke-width="2"/>
<path d="M30,48.6 L50,47.6 M33,52 L48,51.4" stroke="#6f97cf" stroke-width="1.4"/>
<path d="M34,45 C31,49 30,53 33,55 C36,53 38,49 38,46 Z" fill="#1f3075" stroke="#121e48" stroke-width="2"/>
${hl('M22,23.6 C27,20.6 33,19.8 39,20.2', 2.4, .55)}
</g>
${eye(47, 34, 3.4, '#0e1430')}<circle cx="48" cy="32.6" r="1.2" fill="#fff"/>
${smile(54.5, 40, 6, '#0e1430', 2)}${blush(48.6, 40, 2.6, '#ff9fd0', .9)}`);
// 09 scallop shell — peach pink
(() => {
  const cx = 32, cy = 48, N = 7, R0 = 30;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const a = (-162 + i * (144 / N)) * Math.PI / 180;
    pts.push([cx + R0 * Math.cos(a), cy + R0 * Math.sin(a) * 1.0]);
  }
  let d = `M${cx - 6},${cy + 2} L${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 1; i <= N; i++) {
    const [x0, y0] = pts[i - 1], [x1, y1] = pts[i];
    const mx = (x0 + x1) / 2, my = (y0 + y1) / 2, nx = mx - cx, ny = my - cy, l = Math.hypot(nx, ny);
    d += ` Q${(mx + nx / l * 5).toFixed(1)},${(my + ny / l * 5).toFixed(1)} ${x1.toFixed(1)},${y1.toFixed(1)}`;
  }
  d += ` L${cx + 6},${cy + 2} Z`;
  let ribs = '';
  for (let i = 1; i < N; i++) ribs += `M${cx},${cy} L${(cx + (pts[i][0] - cx) * .92).toFixed(1)},${(cy + (pts[i][1] - cy) * .92).toFixed(1)} `;
  const hinge = `M${cx - 13},${cy + 9} C${cx - 13},${cy + 1} ${cx - 8},${cy - 1} ${cx - 5},${cy} L${cx + 5},${cy} C${cx + 8},${cy - 1} ${cx + 13},${cy + 1} ${cx + 13},${cy + 9} C${cx + 6},${cy + 12} ${cx - 6},${cy + 12} ${cx - 13},${cy + 9} Z`;
  faces.push(`<defs><clipPath id="sc9"><path d="${d}"/></clipPath></defs>
<path d="${d}" fill="#ffb4a8"/>
<g clip-path="url(#sc9)">
  <path d="${ribs}" stroke="#e8857a" stroke-width="2.4" fill="none" ${R}/>
  <path d="M0,30 C14,40 50,40 64,30 L64,60 L0,60 Z" fill="#f59a8e" opacity=".8"/>
  <path d="M14,28 C18,22 24,19 30,18.6" stroke="#fff" stroke-width="3" fill="none" opacity=".85" ${R}/>
</g>
<path d="${d}" fill="none" stroke="#9a3a34" stroke-width="2.8" ${R}/>
<path d="${hinge}" fill="#ffcdbf" stroke="#9a3a34" stroke-width="2.4" ${R}/>
${eye(26.5, 34, 3)}${eye(37.5, 34, 3)}${smile(32, 39.4, 5.6, '#7a2620', 1.9)}${blush(21.6, 39, 2.4, '#ff7f8a', .7)}${blush(42.4, 39, 2.4, '#ff7f8a', .7)}`);
})();
// 10 dolphin — slate grey, leaping arc
faces.push(`<g ${R} stroke="#262f44">
<path d="M32,16 C33,9 37,5 42,4 C40,9 40,13 41,17 Z" fill="#8fa3b8" stroke-width="2.4"/>
<path d="M14,46 C10,48 6,48 3,47 C5,51 7,55 6,59 C10,57 13,54 15,51 C17,55 20,58 24,59 C23,55 21,51 19,48 Z" fill="#8fa3b8" stroke-width="2.4"/>
<path d="M16,49 C10,38 15,22 30,16 C42,12 54,18 56,28 C59,29 62,31 62,34 C61,36 58,36 55,35 C52,40 46,42 40,41 C32,40 26,42 21,50 C19,52 17,51 16,49 Z" fill="#8fa3b8" stroke-width="2.8"/>
<path d="M55,35 C52,40 46,42 40,41 C32,40 26,42 21,50 C20,44 25,35 34,34 C41,33 47,34 55,35 Z" fill="#c9d3e3" stroke-width="2"/>
<path d="M36,36 C35,41 36,45 39,47 C41,45 41,41 40,37 Z" fill="#4a5a76" stroke-width="2"/>
</g>
${hl('M22,28 C25,23 30,19.6 36,18.4', 2.4, .6)}
${eye(47, 26.6, 3)}${smile(57.6, 33.6, 3.6, '#262f44', 1.5)}${blush(48.4, 32, 2.2, '#ff9fd0', .85)}`);
// 11 sea snail — brown spiral shell
faces.push(`<g ${R}>
<path d="M4,55 C4,49 10,46 20,46 L46,46 C51,46 53,43 52,38 L51,32 C50,28 53,26 56,27 C60,28 61,34 60,40 C59,48 56,55 48,57 L10,57 C6,57 4,56 4,55 Z" fill="#f1cfa0" stroke="#7a4a1e" stroke-width="2.6"/>
<path d="M53,28 C52,22 50,17 47,13 M58,28 C59,22 59,17 58,12" fill="none" stroke="#7a4a1e" stroke-width="2.4"/>
<circle cx="47" cy="12" r="3.6" fill="#fff" stroke="#7a4a1e" stroke-width="1.8"/><circle cx="47.6" cy="12.4" r="2" fill="#22160f"/><circle cx="48.2" cy="11.6" r=".7" fill="#fff"/>
<circle cx="58" cy="11" r="3.6" fill="#fff" stroke="#7a4a1e" stroke-width="1.8"/><circle cx="58.6" cy="11.4" r="2" fill="#22160f"/><circle cx="59.2" cy="10.6" r=".7" fill="#fff"/>
<path d="M50,49 C46,49 44,47 42,47" fill="none" stroke="#d9a974" stroke-width="1.6"/>
<path d="M27,10 C40,10 47,20 47,30 C47,41 39,49 27,49 C15,49 7,41 7,30 C7,19 15,10 27,10 Z" fill="#9a5a2c" stroke="#4e2a0e" stroke-width="2.8"/>
<path d="M27,30 C27,27 30,26 32,27.6 C35,30 33,35 29,36 C24,37 20,33 21,28 C22,22 29,19 34,21 C41,24 42,33 38,39 C33,46 21,46 16,38 C11,30 14,20 21,16" fill="none" stroke="#f2b77a" stroke-width="3"/>
<path d="M27,30 C27,27 30,26 32,27.6 C35,30 33,35 29,36 C24,37 20,33 21,28 C22,22 29,19 34,21 C41,24 42,33 38,39 C33,46 21,46 16,38 C11,30 14,20 21,16" fill="none" stroke="#6e3a14" stroke-width="1" opacity=".6"/>
${hl('M13,22 C16,16 21,13 26,12.4', 2.4, .55)}
</g>
${smile(55, 36, 4.6, '#7a4a1e', 1.7)}${blush(51, 34, 2, '#ff8f9a', .85)}`);

faces.forEach((f, i) => write(`face_${String(i).padStart(2, '0')}.svg`, svg(64, 64, f)));

/* ============================== CUPCAKE / HEART / ICON ============================== */
function cupcake(s = 1, idp = 'c') {
  return `<defs>
  <radialGradient id="${idp}bb" cx="0.5" cy="0.5" r="0.5">
    <stop offset="0.72" stop-color="#e8fbff" stop-opacity="0"/><stop offset="0.93" stop-color="#e8fbff" stop-opacity="0.35"/><stop offset="1" stop-color="#e8fbff" stop-opacity="0.7"/>
  </radialGradient>
</defs>
<circle cx="24" cy="24" r="22.4" fill="url(#${idp}bb)" stroke="#d6f6ff" stroke-width="1.2" opacity=".9"/>
<path d="M9.5,14 C11.5,9.6 15,7.4 18.4,6.6" fill="none" stroke="#fff" stroke-width="2" opacity=".75" ${R}/>
<g ${R}>
  <path d="M13,27 L16,40 C16.4,41.4 17.4,42 18.8,42 L29.2,42 C30.6,42 31.6,41.4 32,40 L35,27 Z" fill="#8fd4f5" stroke="#28597a" stroke-width="2.2"/>
  <path d="M18,28 L19.6,41.6 M24,28 L24,41.8 M30,28 L28.4,41.6" stroke="#5bb2de" stroke-width="1.6"/>
  <path d="M11,27 C9,26 9.4,22 12,21.4 C11.6,17.4 15.6,15.4 18.2,17 C19,13.4 23.4,12 26.4,13.8 C29.6,12.4 33.6,14.6 33.4,18.4 C36.8,18.6 38.4,22.4 36.4,25 C37.6,27.6 35.4,29.4 33,28.6 C30,30 27,28.6 24,29.2 C21,29.6 18,29.6 15,28.8 C13.6,29.6 11.8,28.8 11,27 Z" fill="#ff9ec7" stroke="#a83a6e" stroke-width="2.2"/>
  <path d="M14,22.6 C17,20.4 20,21 22,19.4 M26.6,17.6 C29,17.8 31,18.6 31.8,20.6" fill="none" stroke="#ffd1e5" stroke-width="2"/>
  <g stroke="none"><rect x="17" y="24" width="3" height="1.4" rx=".7" fill="#ffe45c" transform="rotate(-25 18.5 24.7)"/><rect x="28" y="23" width="3" height="1.4" rx=".7" fill="#7fe6e6" transform="rotate(30 29.5 23.7)"/><rect x="22.4" y="25" width="3" height="1.4" rx=".7" fill="#fff" transform="rotate(10 23.9 25.7)"/><rect x="31.4" y="25.6" width="2.6" height="1.3" rx=".6" fill="#c89cff"/></g>
  <path d="M25.2,11.6 C25.6,8.6 27.6,6.6 30,6" fill="none" stroke="#4a7a2a" stroke-width="1.6"/>
  <circle cx="24.4" cy="12.4" r="4" fill="#ff3b4e" stroke="#7e1424" stroke-width="2"/>
  <circle cx="23.2" cy="11" r="1.2" fill="#fff" opacity=".85"/>
</g>`;
}
write('cupcake.svg', svg(48, 48, cupcake()));

write('heart.svg', svg(48, 48, `<path d="M24,42 C14,35 5,28 5,18 C5,11 10,6.5 16,6.5 C20,6.5 22.6,8.6 24,11.4 C25.4,8.6 28,6.5 32,6.5 C38,6.5 43,11 43,18 C43,28 34,35 24,42 Z" fill="#ff5c8d" stroke="#9c1f4a" stroke-width="3" ${R}/>
<path d="M8,20 C9,30 18,36 24,40 C30,36 39,30 40,20 C37,28 30,33 24,36 C18,33 11,28 8,20 Z" fill="#e8406f"/>
<path d="M11,15 C12,12 14,10.6 17,10.4" fill="none" stroke="#fff" stroke-width="3" opacity=".9" ${R}/>
<circle cx="11" cy="19" r="1.5" fill="#fff" opacity=".85"/>`));

// icon: round sea-blue badge, shell card behind-right, Foxy head in helmet
const iconFox = fox(FRAMES.cheer).replace('<g transform="translate(6,6)">', '<g>');
write('icon.svg', svg(256, 256, `<defs>
  <radialGradient id="ib" cx="0.5" cy="0.35" r="0.7">
    <stop offset="0" stop-color="#5fe0e6"/><stop offset="0.6" stop-color="#2a9fd0"/><stop offset="1" stop-color="#1b5f9e"/>
  </radialGradient>
  <clipPath id="ic"><circle cx="128" cy="128" r="114"/></clipPath>
</defs>
<circle cx="128" cy="128" r="120" fill="#123c66"/>
<circle cx="128" cy="128" r="114" fill="url(#ib)"/>
<g clip-path="url(#ic)">
  <path d="M0,200 C40,188 80,196 128,192 C176,188 216,180 256,190 L256,256 L0,256 Z" fill="#f2d39a"/>
  <path d="M0,206 C40,196 80,202 128,198" fill="none" stroke="#e2b878" stroke-width="3"/>
  <g fill="#fff" opacity=".55"><circle cx="58" cy="70" r="7"/><circle cx="44" cy="96" r="4.4"/><circle cx="200" cy="58" r="5"/><circle cx="212" cy="80" r="3"/></g>
  <path d="M40,60 C70,30 110,22 150,26" stroke="#fff" stroke-width="7" fill="none" opacity=".25" ${R}/>
</g>
<g clip-path="url(#ic)">
<g transform="translate(150,104) rotate(14) scale(1.05)">${svgInner('card_back')}</g>
<g transform="translate(-86,-2) scale(2.2)">${iconFox}</g>
</g>
<circle cx="128" cy="128" r="117" fill="none" stroke="#e8fbff" stroke-width="5" opacity=".9"/>`));

function svgInner(name) {
  const s = fs.readFileSync(path.join(OUT, name + '.svg'), 'utf8');
  return s.replace(/^<svg[^>]*>\n?/, '').replace(/<\/svg>\s*$/, '').replace(/id="(\w+)"/g, 'id="i_$1"').replace(/url\(#(\w+)\)/g, 'url(#i_$1)');
}
console.log('wrote to', OUT);
