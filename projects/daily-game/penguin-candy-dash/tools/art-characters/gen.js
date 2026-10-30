// Generates Pip's Candy Dash character + item SVGs. 100% original hand-written artwork.
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

// 4-point sparkle (curved star)
const sparkle = (x, y, s, c = '#fff7b0', line = '#c7861a', sw = 1.2) =>
  `<path d="M${x},${y - s} C${f1(x + s * .18)},${f1(y - s * .2)} ${f1(x + s * .2)},${f1(y - s * .18)} ${x + s},${y} C${f1(x + s * .2)},${f1(y + s * .18)} ${f1(x + s * .18)},${f1(y + s * .2)} ${x},${y + s} ` +
  `C${f1(x - s * .18)},${f1(y + s * .2)} ${f1(x - s * .2)},${f1(y + s * .18)} ${x - s},${y} C${f1(x - s * .2)},${f1(y - s * .18)} ${f1(x - s * .18)},${f1(y - s * .2)} ${x},${y - s} Z" fill="${c}"${line ? ` stroke="${line}" stroke-width="${sw}"` : ''} ${R}/>`;
// 5-point rounded star (sugar star)
function star5(cx, cy, ro, ri = ro * 0.5, rot = -90) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = (rot + i * 36) * Math.PI / 180, r = i % 2 ? ri : ro;
    d += (i ? ' L' : 'M') + f1(cx + r * Math.cos(a)) + ',' + f1(cy + r * Math.sin(a));
  }
  return d + ' Z';
}
// spiral (dizzy eyes)
function spiral(cx, cy, r, turns = 2.2, ry = 1) {
  let d = '';
  const N = 34;
  for (let i = 0; i <= N; i++) {
    const t = i / N, a = t * turns * 2 * Math.PI, rr = 0.6 + t * (r - 0.6);
    d += (i ? ' L' : 'M') + f1(cx + rr * Math.cos(a)) + ',' + f1(cy + rr * Math.sin(a) * ry);
  }
  return d;
}

/* ============================== PIP ============================== */
const P = {
  back: '#2f4486', shade: '#22326a', light: '#5b78c9', line: '#141c40',
  belly: '#fff6e6', bellyShade: '#f2dcbc', beak: '#ffa23a', beakShade: '#e57a18', beakLine: '#9a4a10',
  foot: '#ffad45', footLine: '#a3520f', eye: '#16152a', cheek: '#ff7f9e',
  scarf: '#ff5c9d', scarfLine: '#9e1f55', scarfStripe: '#fff4f8', mouth: '#c2304f', tongue: '#ff9bb0',
};
const BODY = 'M46,17 C63,17 76,31 77,51 C78,72 66,87 47,87 C28,87 16,74 16,55 C16,33 29,17 46,17 Z';
const MASK = 'M43,47 C41,34 49,27 57,30 C62,26 72,27 76,36 C79,45 77,55 70,59 C62,63 48,60 43,47 Z';
const FOOT = 'M-7,-1 C-7,-5 -2,-6.4 3,-5.4 C7,-4.8 10.4,-3.2 10.4,-1 C11.4,0.6 9.4,1.8 7.4,1.2 C6.2,2.2 4.2,2.2 3,1.3 C1.8,2.3 -0.4,2.2 -1.4,1.2 C-4.4,1.8 -7,1.2 -7,-1 Z';
const foot = (x, y, rot = 0) =>
  `<g transform="translate(${x},${y}) rotate(${rot})"><path d="${FOOT}" fill="${P.foot}" stroke="${P.footLine}" stroke-width="2.2" ${R}/>` +
  `<path d="M-4,-3 C-1,-4.4 3,-4.2 6,-3" fill="none" stroke="#ffd08a" stroke-width="1.4" ${R}/></g>`;
const FLIP_N = 'M0,-3 C-8,2 -13,12 -12.4,22 C-6,20.6 0,13.4 3.4,5 Z';
const FLIP_F = 'M0,-3 C8,2 13,12 12.4,22 C6,20.6 0,13.4 -3.4,5 Z';
const flipper = (d, x, y, rot, s = 1, fill = P.back) =>
  `<g transform="translate(${x},${y}) rotate(${rot}) scale(${s})"><path d="${d}" fill="${fill}" stroke="${P.line}" stroke-width="${f1(2.8 / s)}" ${R}/></g>`;

const PEYES = {
  open: `
<ellipse cx="55" cy="41" rx="4.5" ry="5.8" fill="${P.eye}"/>
<circle cx="56.6" cy="38.6" r="1.9" fill="#fff"/><circle cx="53.8" cy="43.6" r=".9" fill="#fff" opacity=".85"/>
<ellipse cx="67.6" cy="40" rx="3.5" ry="5.2" fill="${P.eye}"/>
<circle cx="68.8" cy="37.8" r="1.5" fill="#fff"/><circle cx="66.8" cy="42.6" r=".7" fill="#fff" opacity=".85"/>`,
  swirl: `
<path d="${spiral(55, 41, 4.8, 2.1, 1.15)}" fill="none" stroke="${P.eye}" stroke-width="1.8" ${R}/>
<path d="${spiral(67.6, 40.4, 3.8, 2, 1.25)}" fill="none" stroke="${P.eye}" stroke-width="1.6" ${R}/>`,
  sparkle: `
<ellipse cx="55" cy="41" rx="4.7" ry="6" fill="${P.eye}"/>
${sparkle(56.4, 39, 2.6, '#fff', null)}<circle cx="53.6" cy="44" r=".9" fill="#fff"/>
<ellipse cx="67.6" cy="40" rx="3.7" ry="5.4" fill="${P.eye}"/>
${sparkle(68.6, 38.4, 2, '#fff', null)}`,
  happy: `
<path d="M50.6,43 C52,37.6 58,37.6 59.4,43" fill="none" stroke="${P.eye}" stroke-width="2.8" ${R}/>
<path d="M64.4,42 C65.4,37.6 69.8,37.6 70.8,42" fill="none" stroke="${P.eye}" stroke-width="2.5" ${R}/>`,
};
const PBEAK = {
  closed: `<path d="M69.5,45 C74,41.8 81,42.6 85.6,46.4 C81.4,50.2 74.6,51 69.5,48.6 Z" fill="${P.beak}" stroke="${P.beakLine}" stroke-width="2" ${R}/>
<path d="M71,47.2 C75,47.6 79,47.3 83.4,46.6" fill="none" stroke="${P.beakShade}" stroke-width="1.3" ${R}/>
<path d="M72,44.6 C75,43.6 78,43.6 80.6,44.6" fill="none" stroke="#ffd59a" stroke-width="1.3" ${R}/>`,
  open: `<path d="M70.5,46 L84.6,46 L82.6,50.4 C78,53 73.6,52.6 70.5,49.4 Z" fill="${P.mouth}" stroke="${P.beakLine}" stroke-width="1.8" ${R}/>
<path d="M72.4,49.6 C75.6,48.6 79,48.8 81.4,50 C78.6,52.2 75,52.2 72.4,49.6 Z" fill="${P.tongue}"/>
<path d="M69.5,44.6 C74,40.6 81.6,41.4 86.4,45.2 C81.6,46.6 75,46.8 69.5,46.4 Z" fill="${P.beak}" stroke="${P.beakLine}" stroke-width="2" ${R}/>
<path d="M71,50 C74,52.4 79,53.2 83.2,50.2 C80,55.4 73.4,55.6 71,50 Z" fill="${P.beak}" stroke="${P.beakLine}" stroke-width="1.8" ${R}/>`,
  oof: `<ellipse cx="72.6" cy="51" rx="2.4" ry="2" fill="${P.mouth}" stroke="${P.beakLine}" stroke-width="1.4"/>
<path d="M69.5,44.4 C74,41.4 81,42.2 85.4,45.6 C81,48.6 74.4,49 69.5,47.6 Z" fill="${P.beak}" stroke="${P.beakLine}" stroke-width="2" ${R}/>`,
};

function scarf(tail) {
  const band = 'M19.6,55 C31,62.6 60,64.6 76.4,55';
  const tl = tail;
  return `<path d="${tl}" fill="none" stroke="${P.scarfLine}" stroke-width="9" ${R}/>
<path d="${tl}" fill="none" stroke="${P.scarf}" stroke-width="5.2" ${R}/>
<path d="${tl}" fill="none" stroke="${P.scarfStripe}" stroke-width="5.2" stroke-dasharray="2.4 3.6" stroke-dashoffset="-1"/>
<path d="${band}" fill="none" stroke="${P.scarfLine}" stroke-width="10" ${R}/>
<path d="${band}" fill="none" stroke="${P.scarf}" stroke-width="6.2" ${R}/>
<path d="${band}" fill="none" stroke="${P.scarfStripe}" stroke-width="6.2" stroke-dasharray="2.6 3.8"/>
<path d="M25,55 C35,60.4 56,61.6 70,55.6" fill="none" stroke="#fff" stroke-width="1.2" opacity=".6" ${R}/>`;
}

function pipBody(o) {
  return `<defs><clipPath id="pb"><path d="${BODY}"/></clipPath></defs>
${o.up ? flipper(FLIP_F, 73, 38, -146, 0.9, P.shade) : flipper(FLIP_F, 70, 55, o.flipF, 0.82, P.shade)}
<path d="${BODY}" fill="${P.shade}"/>
<g clip-path="url(#pb)">
  <ellipse cx="50.5" cy="48" rx="30" ry="34" fill="${P.back}"/>
  <ellipse cx="33" cy="30" rx="10" ry="5.2" fill="${P.light}" transform="rotate(-38 33 30)"/>
  <ellipse cx="55" cy="67" rx="20.5" ry="21.5" fill="${P.belly}"/>
  <path d="M30,78 C40,88 62,90 76,74 L80,96 L20,96 Z" fill="${P.bellyShade}"/>
  <path d="${MASK}" fill="${P.belly}"/>
  <path d="M68,70 C70,64 72,60 74,57" fill="none" stroke="#fff" stroke-width="2.4" opacity=".8" ${R}/>
</g>
<path d="${BODY}" fill="none" stroke="${P.line}" stroke-width="3" ${R}/>
<path d="M27,33 C30,25.6 36,21.4 43,20.4" fill="none" stroke="#9fb4f0" stroke-width="2.6" opacity=".75" ${R}/>
<ellipse cx="53" cy="50.6" rx="4.2" ry="2.5" fill="${P.cheek}" opacity="${o.blush || 0.7}"/>
<ellipse cx="72.6" cy="52.6" rx="2.4" ry="1.8" fill="${P.cheek}" opacity="${o.blush || 0.7}"/>
${PEYES[o.eyes]}
${PBEAK[o.beak]}
${scarf(o.tail)}
${o.up ? flipper(FLIP_N, 20, 46, 138) : flipper(FLIP_N, 23, 52, o.flipN)}`;
}

function pip(o) {
  return `${foot(56 + o.fF[0], 88.4 + o.fF[1], o.fF[2] || 0)}
<g transform="rotate(${o.lean} 48 90)">${pipBody(o)}</g>
${foot(41 + o.fN[0], 88.4 + o.fN[1], o.fN[2] || 0)}
${o.extra || ''}`;
}

const TAIL0 = 'M25,59 C22,65 19,69.4 14,71.6';
const PIP = {
  idle: { lean: 0, fN: [0, 0], fF: [0, 0], flipN: 6, flipF: -8, eyes: 'open', beak: 'closed', tail: TAIL0 },
  walk1: { lean: -5, fN: [3, 0], fF: [-3, -3.2, -10], flipN: 22, flipF: -2, eyes: 'open', beak: 'closed',
    tail: 'M25,59 C20,63 15.6,65.4 10.4,65.6' },
  walk2: { lean: 5, fN: [-3, -3.2, -10], fF: [3, 0], flipN: -10, flipF: -14, eyes: 'open', beak: 'closed',
    tail: 'M25,59 C22,66 20,70.6 15.6,74' },
  hurt: { lean: -7, fN: [-2, 0], fF: [3, -1.5, -8], flipN: 40, flipF: -22, eyes: 'swirl', beak: 'oof', blush: 0.9,
    tail: 'M25,59 C20,61 15,60 10.4,58',
    extra: `${sparkle(30, 10, 4.6)}${sparkle(48, 6, 3.4)}${sparkle(64, 11, 4)}
<path d="M14,22 L20,26 M10,30 L17,31.4 M79,24 L74,28.6" stroke="#ffffff" stroke-width="2.4" opacity=".9" ${R}/>
<path d="M14,22 L20,26 M10,30 L17,31.4 M79,24 L74,28.6" stroke="${P.line}" stroke-width="1" opacity=".5" ${R}/>` },
  cheer: { lean: 2, fN: [-1, 0, -6], fF: [2, 0, 6], flipN: 0, flipF: 0, up: true, eyes: 'sparkle', beak: 'open', blush: 0.95,
    tail: 'M25,59 C19,61 14,59 9,56',
    extra: `${sparkle(12, 26, 5.4)}${sparkle(86, 22, 4.6)}${sparkle(84, 72, 3.2, '#fff')}${sparkle(20, 12, 3, '#fff')}` },
};
for (const [n, o] of Object.entries(PIP)) write(`pip_${n}.svg`, svg(96, 96, pip(o)));

// belly slide: bespoke horizontal pose, same palette/face language
const SBODY = 'M18,68 C17,55 33,46 54,46 C73,46 87,55 88,68 C89,80 76,89 53,89 C32,89 19,81 18,68 Z';
const SMASK = 'M62,62 C61,53 69,48 76,51 C82,51 88,57 88,64 C88,71 82,75 75,75 C68,75 63,70 62,62 Z';
write('pip_slide.svg', svg(96, 96, `<defs><clipPath id="ps"><path d="${SBODY}"/></clipPath></defs>
<g opacity=".85" ${R} fill="none">
  <path d="M4,60 L13,60 M2,70 L12,70 M6,80 L14,80" stroke="#ffffff" stroke-width="3.2"/>
  <path d="M4,60 L13,60 M2,70 L12,70 M6,80 L14,80" stroke="#8fb0e8" stroke-width="1.2"/>
</g>
${foot(16, 76, -150)}${foot(19, 84, -165)}
<path d="${SBODY}" fill="${P.shade}"/>
<g clip-path="url(#ps)">
  <ellipse cx="54" cy="64" rx="34" ry="20" fill="${P.back}"/>
  <ellipse cx="38" cy="52" rx="12" ry="3.6" fill="${P.light}" transform="rotate(-8 38 52)"/>
  <path d="M14,80 C30,74 66,72 92,76 L92,96 L14,96 Z" fill="${P.belly}"/>
  <path d="M14,86 C34,84 66,84 92,82 L92,96 L14,96 Z" fill="${P.bellyShade}"/>
  <path d="${SMASK}" fill="${P.belly}"/>
</g>
<path d="${SBODY}" fill="none" stroke="${P.line}" stroke-width="3" ${R}/>
<path d="M30,52 C38,47.6 48,46.6 56,47.2" fill="none" stroke="#9fb4f0" stroke-width="2.6" opacity=".75" ${R}/>
<path d="M60,55 C56,62 56,76 60,85" fill="none" stroke="${P.scarfLine}" stroke-width="11.6" ${R}/>
<path d="M60,55 C56,62 56,76 60,85" fill="none" stroke="${P.scarf}" stroke-width="7.6" ${R}/>
<path d="M60,55 C56,62 56,76 60,85" fill="none" stroke="${P.scarfStripe}" stroke-width="7.6" stroke-dasharray="3 4.4"/>
<path d="M57,56 C49,49 40,47 30,42" fill="none" stroke="${P.scarfLine}" stroke-width="10.6" ${R}/>
<path d="M57,56 C49,49 40,47 30,42" fill="none" stroke="${P.scarf}" stroke-width="6.4" ${R}/>
<path d="M57,56 C49,49 40,47 30,42" fill="none" stroke="${P.scarfStripe}" stroke-width="6.4" stroke-dasharray="2.6 4"/>
<ellipse cx="70.6" cy="66.6" rx="3.6" ry="2.2" fill="${P.cheek}" opacity=".85"/>
<path d="M66,61.4 C67.6,56.4 73.4,56.4 75,61.4" fill="none" stroke="${P.eye}" stroke-width="2.7" ${R}/>
<path d="M78.6,60 C79.6,56.2 83.4,56.2 84.4,60" fill="none" stroke="${P.eye}" stroke-width="2.3" ${R}/>
<path d="M82,63.6 C86,60.6 91.6,61.6 94.6,64.6 C91.4,68.2 86,69 82,67.2 Z" fill="${P.beak}" stroke="${P.beakLine}" stroke-width="2" ${R}/>
<path d="M83.6,65.8 C87,66 90,65.6 92.6,64.8" fill="none" stroke="${P.beakShade}" stroke-width="1.2" ${R}/>
${flipper(FLIP_N, 44, 68, 72)}
${sparkle(90, 50, 3.4, '#fff')}`));

/* ============================== BEARS ============================== */
const BEARC = {
  red: { base: '#ff4f63', light: '#ffa0aa', deep: '#d62a42', line: '#7e1226', core: '#ffc4ca' },
  green: { base: '#46cf6b', light: '#a3f0b0', deep: '#22a347', line: '#0f5a2a', core: '#cbf7d2' },
  orange: { base: '#ff9a2e', light: '#ffcf86', deep: '#e5730e', line: '#7f3e05', core: '#ffe2b4' },
};
const BB = 'M40,17 C57,17 68,31 68,49 C68,65 57,74 40,74 C23,74 12,65 12,49 C12,31 23,17 40,17 Z';

function accessory(kind) {
  if (kind === 'red') // bow on the near ear
    return `<g ${R} transform="rotate(-14 23 15)">
  <path d="M23,15 L13.4,9.4 C10.6,12.4 10.8,18.6 13.6,21 Z" fill="#fff7fa" stroke="#7e1226" stroke-width="2"/>
  <path d="M23,15 L32.6,9.4 C35.4,12.4 35.2,18.6 32.4,21 Z" fill="#fff7fa" stroke="#7e1226" stroke-width="2"/>
  <circle cx="16" cy="14" r="1.3" fill="#ff4f63"/><circle cx="15" cy="18" r="1.1" fill="#ff4f63"/><circle cx="30" cy="14" r="1.3" fill="#ff4f63"/><circle cx="31" cy="18" r="1.1" fill="#ff4f63"/>
  <ellipse cx="23" cy="15" rx="3.2" ry="3.6" fill="#ffd6e2" stroke="#7e1226" stroke-width="2"/>
</g>`;
  if (kind === 'green') // leaf sprout on top
    return `<g ${R}>
  <path d="M40.5,19 C40.2,14 40.8,10.6 42,7.6" fill="none" stroke="#3d6b10" stroke-width="4.4"/>
  <path d="M40.5,19 C40.2,14 40.8,10.6 42,7.6" fill="none" stroke="#9ad23a" stroke-width="2"/>
  <path d="M41.4,9.4 C37,3.6 30.4,4.2 28.4,7.4 C31.6,11.2 37.6,12 41.4,9.4 Z" fill="#d4f56a" stroke="#3d6b10" stroke-width="2"/>
  <path d="M42,8.4 C45.6,1.6 52.6,1.4 55.2,4.2 C52,8.8 46,10.4 42,8.4 Z" fill="#d4f56a" stroke="#3d6b10" stroke-width="2"/>
  <path d="M33,7.6 C35.6,8.6 38,9 40,8.8 M45.6,6 C48,5 50.6,4.4 52.6,4.6" fill="none" stroke="#9ad23a" stroke-width="1.2"/>
</g>`;
  // orange: little striped cone hat
  return `<g ${R} transform="rotate(10 44 18)">
  <path d="M33,20 L44.6,2.6 L55,19.4 C48,21.6 40,21.8 33,20 Z" fill="#8a68ff" stroke="#35227e" stroke-width="2.2"/>
  <path d="M38.6,11.8 C42,12.8 46,12.8 49.8,11.6 M35.8,16.2 C41,17.6 47,17.6 52.4,16" fill="none" stroke="#fff" stroke-width="2"/>
  <path d="M33,20 C40,21.8 48,21.6 55,19.4" fill="none" stroke="#35227e" stroke-width="2.2"/>
  <circle cx="44.6" cy="2.8" r="3" fill="#fff" stroke="#35227e" stroke-width="1.8"/>
</g>`;
}

function bear(kind, o) {
  const C = BEARC[kind];
  const id = `bj${kind[0]}${o.n}`;
  const ear = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${C.base}" stroke="${C.line}" stroke-width="2.6"/>
<circle cx="${x + .6}" cy="${y + .8}" r="${r * .5}" fill="${C.light}" opacity=".9"/>
<path d="M${x - r * .6},${y - r * .35} C${x - r * .4},${y - r * .7} ${x},${y - r * .8} ${x + r * .25},${y - r * .75}" fill="none" stroke="#fff" stroke-width="1.4" opacity=".8" ${R}/>`;
  const footE = (x, dy) => `<ellipse cx="${x}" cy="${72.8 + dy}" rx="7.2" ry="3.6" fill="${C.deep}" stroke="${C.line}" stroke-width="2.4"/>
<ellipse cx="${x - 1}" cy="${71.8 + dy}" rx="3.6" ry="1.2" fill="${C.light}" opacity=".7"/>`;
  const arm = (x, y, rot, near) => `<ellipse cx="${x}" cy="${y}" rx="5" ry="8" transform="rotate(${rot} ${x} ${y})" fill="${near ? C.base : C.deep}" stroke="${C.line}" stroke-width="2.4"/>`;
  const eyes = o.stun ? `
<path d="${spiral(44, 40, 3.8, 2, 1.1)}" fill="none" stroke="#1b1020" stroke-width="1.6" ${R}/>
<path d="${spiral(57.6, 39.4, 3.2, 2, 1.15)}" fill="none" stroke="#1b1020" stroke-width="1.4" ${R}/>
<path d="M39.6,33 C42,31.6 45,31.6 47.4,32.4 M54.8,32 C56.6,31 59,31 60.8,31.8" fill="none" stroke="${C.line}" stroke-width="2.2" ${R}/>`
    : `
<ellipse cx="44" cy="41" rx="3.3" ry="4" fill="#1b1020"/><circle cx="45.2" cy="39.6" r="1.3" fill="#fff"/><circle cx="43" cy="42.8" r=".6" fill="#fff" opacity=".8"/>
<ellipse cx="57.6" cy="40.4" rx="2.7" ry="3.6" fill="#1b1020"/><circle cx="58.5" cy="39.1" r="1.05" fill="#fff"/>
<path d="M39.4,34.2 C42,34.4 44.6,35.2 46.8,36.4 M54.8,35.8 C56.6,34.6 58.6,33.8 61,33.6" fill="none" stroke="${C.line}" stroke-width="2.8" ${R}/>`;
  const mouth = o.stun
    ? `<path d="M48,55.4 C49.4,54 50.8,54 52.2,55.4 C53.6,56.8 55,56.8 56.4,55.4" fill="none" stroke="${C.line}" stroke-width="1.8" ${R}/>`
    : `<path d="M48.6,55.6 C50.4,53.6 54,53.6 55.8,55.6" fill="none" stroke="${C.line}" stroke-width="2" ${R}/>`;
  const body = `<defs>
  <clipPath id="${id}"><path d="${BB}"/></clipPath>
  <radialGradient id="${id}g" cx="0.42" cy="0.42" r="0.62">
    <stop offset="0" stop-color="${C.light}"/><stop offset="0.55" stop-color="${C.base}"/><stop offset="1" stop-color="${C.deep}"/>
  </radialGradient>
</defs>
${ear(25, 21, 8)}${ear(54, 20, 7.2)}
${arm(65.6, 52, -20 + o.armF, false)}
<path d="${BB}" fill="url(#${id}g)"/>
<g clip-path="url(#${id})">
  <ellipse cx="37" cy="53" rx="17" ry="14" fill="${C.core}" opacity=".45"/>
  <path d="M14,60 C22,72 54,76 68,60 L70,80 L10,80 Z" fill="${C.deep}" opacity=".55"/>
  <path d="M22,69 C30,73.6 48,74 58,68.4" fill="none" stroke="${C.light}" stroke-width="2.6" opacity=".9" ${R}/>
  <circle cx="27" cy="58" r="1.6" fill="#fff" opacity=".55"/><circle cx="31" cy="63" r="1" fill="#fff" opacity=".5"/><circle cx="60" cy="61" r="1.2" fill="#fff" opacity=".45"/>
</g>
<path d="${BB}" fill="none" stroke="${C.line}" stroke-width="3" ${R}/>
<path d="M18.6,42 C19.6,32 25.6,24.4 34,22" fill="none" stroke="#fff" stroke-width="3.6" opacity=".9" ${R}/>
<circle cx="18.4" cy="47.6" r="1.8" fill="#fff" opacity=".9"/>
<ellipse cx="52.6" cy="50" rx="9" ry="6.6" fill="${C.core}" opacity=".85"/>
<ellipse cx="38.6" cy="48.4" rx="3.6" ry="2.2" fill="#ff6f9a" opacity=".6"/><ellipse cx="62.6" cy="47" rx="1.8" ry="1.4" fill="#ff6f9a" opacity=".5"/>
${eyes}
<ellipse cx="55" cy="47.6" rx="3.1" ry="2.3" fill="${C.line}"/><ellipse cx="54.4" cy="46.9" rx="1" ry=".6" fill="#fff" opacity=".8"/>
${mouth}
${arm(14.4, 52, 24 + o.armN, true)}
${accessory(kind)}`;
  return `${footE(50 + o.fF[0], o.fF[1])}${footE(30 + o.fN[0], o.fN[1])}
<g transform="rotate(${o.lean} 40 76) ${o.stun ? 'translate(0 3.6) scale(1 .95)' : ''}">${body}</g>
${o.extra || ''}`;
}
const BFR = {
  1: { n: 1, lean: -5, fN: [1, 0], fF: [-1, -2.6], armN: 14, armF: -10 },
  2: { n: 2, lean: 5, fN: [-1, -2.6], fF: [1, 0], armN: -14, armF: 12 },
  stun: { n: 's', lean: -3, fN: [0, 0], fF: [0, 0], armN: 30, armF: -30, stun: true,
    extra: `<ellipse cx="40" cy="12" rx="23" ry="5.4" fill="none" stroke="#fff" stroke-width="1.6" stroke-dasharray="3 3" opacity=".75"/>
<path d="${star5(17.6, 13.6, 6)}" fill="#fff36b" stroke="#b46c0a" stroke-width="1.6" ${R}/>
<path d="${star5(41, 6.8, 5.4, 2.7, -80)}" fill="#ffffff" stroke="#9a6aa8" stroke-width="1.6" ${R}/>
<path d="${star5(63, 15.4, 5, 2.5, -100)}" fill="#ffd2ec" stroke="#b0407e" stroke-width="1.6" ${R}/>` },
};
for (const k of Object.keys(BEARC)) for (const [n, o] of Object.entries(BFR)) write(`bear_${k}_${n}.svg`, svg(80, 80, bear(k, o)));

/* ============================== GEMS ============================== */
const GEMC = {
  pink: { base: '#ff5fae', light: '#ffb3d8', deep: '#d22c84', line: '#7e1250' },
  blue: { base: '#3ea6ff', light: '#a8dcff', deep: '#1f6fd6', line: '#123a82' },
  yellow: { base: '#ffcf2e', light: '#fff2a0', deep: '#ee9a0a', line: '#8a5206' },
  green: { base: '#34d27e', light: '#a8f4c8', deep: '#159e56', line: '#0d5530' },
};
const HEART = 'M24,42 C14,35 5,28 5,18 C5,11 10,6.5 16,6.5 C20,6.5 22.6,8.6 24,11.4 C25.4,8.6 28,6.5 32,6.5 C38,6.5 43,11 43,18 C43,28 34,35 24,42 Z';
function gem(color) {
  const C = GEMC[color];
  let outer, facets, gloss;
  if (color === 'pink') {
    outer = 'M24,43 L5,23 L5,13.6 L11.6,6.6 L19,6.6 L24,11.6 L29,6.6 L36.4,6.6 L43,13.6 L43,23 Z';
    facets = `<path d="M24,33 L12.6,21 L12.6,16 L16,12.6 L19.4,12.6 L24,17.4 L28.6,12.6 L32,12.6 L35.4,16 L35.4,21 Z" fill="${C.light}"/>
<path d="M24,43 L24,33 L35.4,21 L43,23 Z M5,23 L12.6,21 L24,33 L24,43 Z" fill="${C.deep}" opacity=".75"/>
<path d="M24,43 L24,33 M5,23 L12.6,21 M43,23 L35.4,21 M11.6,6.6 L16,12.6 M36.4,6.6 L32,12.6 M24,11.6 L24,17.4 M5,13.6 L12.6,16 M43,13.6 L35.4,16 M19,6.6 L19.4,12.6 M29,6.6 L28.6,12.6" fill="none" stroke="${C.line}" stroke-width="1.2" opacity=".5"/>`;
    gloss = `<path d="M9.4,14.6 L12.6,11.2 M16,16.4 L19,16.4" fill="none" stroke="#fff" stroke-width="2.6" ${R}/>`;
  } else if (color === 'blue') {
    outer = 'M24,5 C34.5,5 43,13.5 43,24 C43,34.5 34.5,43 24,43 C13.5,43 5,34.5 5,24 C5,13.5 13.5,5 24,5 Z';
    let oct = '', spokes = '';
    for (let i = 0; i < 8; i++) {
      const a = (22.5 + i * 45) * Math.PI / 180;
      oct += (i ? ' L' : 'M') + f1(24 + 11 * Math.cos(a)) + ',' + f1(24 + 11 * Math.sin(a));
      spokes += `M${f1(24 + 11 * Math.cos(a))},${f1(24 + 11 * Math.sin(a))} L${f1(24 + 19 * Math.cos(a))},${f1(24 + 19 * Math.sin(a))} `;
    }
    facets = `<path d="M24,24 L43,24 A19,19 0 0 1 5,24 Z" fill="${C.deep}" opacity=".6"/>
<path d="${oct} Z" fill="${C.light}"/>
<path d="${spokes}" stroke="${C.line}" stroke-width="1.2" opacity=".5"/>`;
    gloss = `<path d="M11,18 C13,12.6 17.6,9.4 22.6,8.8" fill="none" stroke="#fff" stroke-width="2.6" ${R}/>`;
  } else if (color === 'yellow') {
    outer = star5(24, 25.5, 20.5, 10, -90);
    let spokes = '';
    for (let i = 0; i < 5; i++) { const a = (-90 + i * 72) * Math.PI / 180; spokes += `M24,25.5 L${f1(24 + 19 * Math.cos(a))},${f1(25.5 + 19 * Math.sin(a))} `; }
    facets = `<path d="${star5(24, 25.5, 10, 5, -90)}" fill="${C.light}"/>
<path d="M24,25.5 L${f1(24 + 19.5 * Math.cos(54 * Math.PI / 180))},${f1(25.5 + 19.5 * Math.sin(54 * Math.PI / 180))} L${f1(24 + 10 * Math.cos(90 * Math.PI / 180))},${f1(25.5 + 10)} L${f1(24 + 19.5 * Math.cos(126 * Math.PI / 180))},${f1(25.5 + 19.5 * Math.sin(126 * Math.PI / 180))} Z" fill="${C.deep}" opacity=".7"/>
<path d="${spokes}" stroke="${C.line}" stroke-width="1.2" opacity=".45"/>`;
    gloss = `<path d="M15.4,19.4 L20.6,19 L23,12.4" fill="none" stroke="#fff" stroke-width="2.4" ${R}/>`;
  } else {
    outer = 'M13,6 L35,6 L42,13 L42,35 L35,42 L13,42 L6,35 L6,13 Z';
    facets = `<path d="M13,6 L35,6 L42,13 L42,35 L35,42 L13,42 L6,35 L6,13 Z M15,15 L15,33 L33,33 L33,15 Z" fill="${C.light}" fill-rule="evenodd" opacity=".55"/>
<path d="M42,13 L42,35 L35,42 L13,42 L15,33 L33,33 L33,15 Z" fill="${C.deep}" opacity=".75"/>
<rect x="15" y="15" width="18" height="18" fill="${C.light}"/>
<path d="M13,6 L15,15 M35,6 L33,15 M42,13 L33,15 M42,35 L33,33 M35,42 L33,33 M13,42 L15,33 M6,35 L15,33 M6,13 L15,15" stroke="${C.line}" stroke-width="1.2" opacity=".5"/>`;
    gloss = `<path d="M10,14 L14,10 M18,18.4 L18,24" fill="none" stroke="#fff" stroke-width="2.6" ${R}/>`;
  }
  return `<defs><clipPath id="g${color}"><path d="${outer}"/></clipPath></defs>
<path d="${outer}" fill="${C.base}"/>
<g clip-path="url(#g${color})">${facets}</g>
<path d="${outer}" fill="none" stroke="${C.line}" stroke-width="3" ${R}/>
${gloss}
${sparkle(38, 9, 5.6, '#ffffff', C.line, 1.1)}`;
}
for (const c of Object.keys(GEMC)) write(`gem_${c}.svg`, svg(48, 48, gem(c)));

/* ============================== HEARTS ============================== */
write('heart_full.svg', svg(48, 48, `<path d="${HEART}" fill="#ff4f7e" stroke="#8c1440" stroke-width="3" ${R}/>
<path d="M8,20 C9,30 18,36 24,40 C30,36 39,30 40,20 C37,28 30,33 24,36 C18,33 11,28 8,20 Z" fill="#e0336a"/>
<path d="M11,15 C12,12 14,10.6 17,10.4" fill="none" stroke="#fff" stroke-width="3" opacity=".95" ${R}/>
<circle cx="11" cy="19.4" r="1.6" fill="#fff" opacity=".9"/>`));
write('heart_empty.svg', svg(48, 48, `<path d="${HEART}" fill="#5a3a52" fill-opacity=".45" stroke="#5a2a48" stroke-width="3" ${R}/>
<path d="M24,36.6 C16,31 9.6,25.6 9.6,18.4 C9.6,13.6 12.6,10.8 16.2,10.8 C19.6,10.8 21.6,13 24,16.6 C26.4,13 28.4,10.8 31.8,10.8 C35.4,10.8 38.4,13.6 38.4,18.4 C38.4,25.6 32,31 24,36.6 Z" fill="none" stroke="#f3dbe9" stroke-width="1.8" stroke-dasharray="2.4 3" opacity=".9" ${R}/>`));

/* ============================== JAR ============================== */
write('jar.svg', svg(64, 80, `<path d="M12,20 L52,20 C57,20 59,24 59,29 L59,68 C59,74 55,78 49,78 L15,78 C9,78 5,74 5,68 L5,29 C5,24 7,20 12,20 Z" fill="#e8f7ff" fill-opacity=".22" stroke="#3f6f96" stroke-width="3" ${R}/>
<path d="M8.6,30 L8.6,66" stroke="#fff" stroke-width="2.4" opacity=".75" ${R}/>
<path d="M55.4,34 L55.4,64" stroke="#fff" stroke-width="1.6" opacity=".5" ${R}/>
<path d="M14,75 C24,76.4 40,76.4 50,75" fill="none" stroke="#bfe6ff" stroke-width="1.6" opacity=".8" ${R}/>
<rect x="8" y="17" width="48" height="6" rx="3" fill="#d9f0ff" stroke="#3f6f96" stroke-width="2.4"/>
<path d="M7,8 C7,4.6 9,3 12,3 L52,3 C55,3 57,4.6 57,8 L57,14 C57,16.6 55.4,18 53,18 L11,18 C8.6,18 7,16.6 7,14 Z" fill="#ff78b4" stroke="#8c1f58" stroke-width="2.6" ${R}/>
<path d="M14,3.6 L10,17.4 M24,3.4 L20,17.6 M34,3.4 L30,17.6 M44,3.4 L40,17.6 M54,3.6 L50,17.4" stroke="#fff" stroke-width="3.2" opacity=".85"/>
<path d="M7,8 C7,4.6 9,3 12,3 L52,3 C55,3 57,4.6 57,8 L57,14 C57,16.6 55.4,18 53,18 L11,18 C8.6,18 7,16.6 7,14 Z" fill="none" stroke="#8c1f58" stroke-width="2.6" ${R}/>
<path d="M11,7 C14,5.6 18,5.4 22,5.6" fill="none" stroke="#fff" stroke-width="1.8" opacity=".9" ${R}/>`));

/* ============================== GATES ============================== */
const ARCH = 'M20,148 L20,62 A40,40 0 0 1 100,62 L100,148';
const caneArch = `<path d="${ARCH}" fill="none" stroke="#7a1428" stroke-width="18" ${R}/>
<path d="${ARCH}" fill="none" stroke="#fffaf6" stroke-width="12.4" ${R}/>
<path d="${ARCH}" fill="none" stroke="#ff3f5e" stroke-width="12.4" stroke-dasharray="7 7"/>
<path d="M17,140 L17,62 A43,43 0 0 1 60,19" fill="none" stroke="#fff" stroke-width="2.2" opacity=".8" ${R}/>
<path d="M24,140 L24,64 A36,36 0 0 1 96,64 L96,140" fill="none" stroke="#7a1428" stroke-width="1.6" opacity=".35"/>`;
const bases = [20, 100].map(x => `<path d="M${x - 15},158 C${x - 15},146 ${x - 9},138 ${x},138 C${x + 9},138 ${x + 15},146 ${x + 15},158 Z" fill="#7ad7ff" stroke="#1e5f8a" stroke-width="2.6" ${R}/>
<path d="M${x - 9},147 C${x - 7},143 ${x - 4},141 ${x},140.6" fill="none" stroke="#fff" stroke-width="2.4" opacity=".9" ${R}/>
<g fill="#fff" opacity=".8"><circle cx="${x + 5}" cy="150" r="1.2"/><circle cx="${x - 4}" cy="153" r="1"/><circle cx="${x + 9}" cy="155" r=".9"/></g>`).join('');
const heartTop = `<path d="M60,30 C55,26 50,22.6 50,17.4 C50,13.6 52.6,11 55.6,11 C57.6,11 59,12.2 60,13.8 C61,12.2 62.4,11 64.4,11 C67.4,11 70,13.6 70,17.4 C70,22.6 65,26 60,30 Z" fill="#ffd23c" stroke="#8a5206" stroke-width="2.4" ${R}/>
<path d="M53,16 C53.4,14.4 54.4,13.6 55.8,13.4" fill="none" stroke="#fff" stroke-width="1.8" ${R}/>`;
function swirlDisc(cx, cy, r) {
  const cols = ['#ff5fae', '#ffd23c', '#3ea6ff', '#34d27e', '#a07cff'];
  let s = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="#fffaf6"/>`;
  cols.forEach((c, i) => {
    const a0 = i * 72;
    let d = `M${cx},${cy}`;
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const a = (a0 + t * 300) * Math.PI / 180, rr = t * r;
      d += ` L${f1(cx + rr * Math.cos(a))},${f1(cy + rr * Math.sin(a))}`;
    }
    for (let t = 1; t >= -0.0001; t -= 0.05) {
      const a = (a0 + 34 + t * 300) * Math.PI / 180, rr = t * r;
      d += ` L${f1(cx + rr * Math.cos(a))},${f1(cy + rr * Math.sin(a))}`;
    }
    s += `<path d="${d} Z" fill="${c}"/>`;
  });
  return s + `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#5a2a6e" stroke-width="3"/>
<path d="M${cx - r * .7},${cy - r * .3} C${cx - r * .55},${cy - r * .7} ${cx - r * .2},${cy - r * .88} ${cx + r * .15},${cy - r * .86}" fill="none" stroke="#fff" stroke-width="3.4" opacity=".85" ${R}/>`;
}
write('gate_closed.svg', svg(120, 160, `<path d="M60,104 L60,154" stroke="#5a2a6e" stroke-width="9" ${R}/>
<path d="M60,104 L60,154" stroke="#fff3e6" stroke-width="5" ${R}/>
<path d="M28,92 L92,92" stroke="#5a2a6e" stroke-width="7" ${R}/><path d="M28,92 L92,92" stroke="#ffd2ec" stroke-width="3.4" ${R}/>
${swirlDisc(60, 90, 28)}
<path d="M54,88 L54,85 C54,80 66,80 66,85 L66,88" fill="none" stroke="#5a2a6e" stroke-width="2.6" ${R}/>
<rect x="51.4" y="87.4" width="17.2" height="13" rx="3.6" fill="#ffd23c" stroke="#5a2a6e" stroke-width="2.4"/>
<path d="M60,91.6 L60,96" stroke="#5a2a6e" stroke-width="2.4" ${R}/>
${caneArch}${bases}${heartTop}`));
write('gate_open.svg', svg(120, 160, `<defs><radialGradient id="go" cx="0.5" cy="0.62" r="0.6">
  <stop offset="0" stop-color="#ffffff" stop-opacity=".95"/><stop offset=".55" stop-color="#fff2a6" stop-opacity=".6"/><stop offset="1" stop-color="#ffb6dc" stop-opacity=".15"/>
</radialGradient></defs>
<path d="M27,150 L27,64 A33,33 0 0 1 93,64 L93,150 Z" fill="url(#go)"/>
<path d="M30,150 C42,146 78,146 90,150" fill="none" stroke="#ffe680" stroke-width="3" opacity=".8" ${R}/>
${sparkle(46, 70, 5, '#fff', '#c7861a')}${sparkle(74, 96, 6, '#fff7b0')}${sparkle(50, 120, 3.6, '#fff')}${sparkle(76, 56, 3, '#fff')}
<g fill="#fff" opacity=".9"><circle cx="40" cy="98" r="1.6"/><circle cx="64" cy="76" r="1.3"/><circle cx="82" cy="128" r="1.6"/><circle cx="58" cy="138" r="1.2"/></g>
${caneArch}${bases}${heartTop}
${sparkle(60, 4, 3.4, '#fff')}`));

/* ============================== ICON ============================== */
function inner(name) {
  const s = fs.readFileSync(path.join(OUT, name + '.svg'), 'utf8');
  return s.replace(/^<svg[^>]*>\n?/, '').replace(/<\/svg>\s*$/, '')
    .replace(/id="(\w+)"/g, `id="${name}_$1"`).replace(/url\(#(\w+)\)/g, `url(#${name}_$1)`);
}
write('icon.svg', svg(256, 256, `<defs>
  <radialGradient id="ib" cx="0.5" cy="0.36" r="0.7">
    <stop offset="0" stop-color="#ffd0e8"/><stop offset="0.6" stop-color="#ff8cc4"/><stop offset="1" stop-color="#e2569c"/>
  </radialGradient>
  <clipPath id="ic"><circle cx="128" cy="128" r="114"/></clipPath>
</defs>
<circle cx="128" cy="128" r="122" fill="#7e1d55"/>
<circle cx="128" cy="128" r="114" fill="url(#ib)"/>
<g clip-path="url(#ic)">
  <ellipse cx="128" cy="236" rx="150" ry="52" fill="#c9f3dc"/>
  <ellipse cx="128" cy="236" rx="150" ry="52" fill="none" stroke="#8fdcb4" stroke-width="4"/>
  <g fill="#fff" opacity=".6"><circle cx="54" cy="72" r="6"/><circle cx="40" cy="98" r="3.6"/><circle cx="210" cy="104" r="4"/></g>
  <path d="M44,62 C74,30 116,22 156,26" stroke="#fff" stroke-width="7" fill="none" opacity=".3" ${R}/>
  <ellipse cx="114" cy="214" rx="56" ry="10" fill="#4f7a64" opacity=".25"/>
  <g transform="translate(8,-4) scale(2.1)">${inner('pip_cheer')}</g>
  <g transform="translate(166,132) rotate(14) scale(1.6)">${inner('gem_pink')}</g>
</g>
<circle cx="128" cy="128" r="118" fill="none" stroke="#fff0f8" stroke-width="5" opacity=".95"/>`));
console.log('wrote to', OUT);
