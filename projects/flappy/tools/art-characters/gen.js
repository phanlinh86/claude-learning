// Generates Family Flappy character SVGs. Original artwork.
const fs = require('fs');
const OUT = process.argv[2] || '/home/claude/claude-learning/projects/flappy/game/assets/default';
const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">\n${body}\n</svg>\n`;
const R = 'stroke-linejoin="round" stroke-linecap="round"';

/* ---------------- BIRD ---------------- */
const B = {
  body: '#ffc93c', shade: '#f5a12b', line: '#8a4614', belly: '#fff4d6',
  wing: '#f7a632', wingLight: '#ffd36a', wingShade: '#e08420',
  beak: '#ff8c2b', beakShade: '#e2661a', cheek: '#ff8e8e', eye: '#2a1c14',
};
// body outline: round, slightly egg shaped (head bulge top-right)
const BODY = 'M58,23 C80,22 93,37 93,54 C93,72 78,84 57,84 C37,84 22,73 22,55 C22,36 37,23 58,23 Z';

function wing(frame) {
  // wing drawn in local space pointing back (-x), pivot at shoulder
  const shape = 'M2,-7 C-10,-14 -30,-13 -41,-4 C-43,-2 -42,1 -39,1 ' +
    'C-40,4 -38,7 -34,7 C-33,10 -29,12 -25,11 C-20,14 -10,13 -3,9 C3,6 5,-3 2,-7 Z';
  const shadeP = 'M-39,1 C-40,4 -38,7 -34,7 C-33,10 -29,12 -25,11 C-20,14 -10,13 -3,9 ' +
    'C-12,9 -24,7 -39,1 Z';
  const light = 'M-4,-6 C-14,-10 -28,-9 -36,-3';
  const feathers = 'M-34,7 C-28,5 -22,4 -16,4 M-25,11 C-20,8 -14,7 -8,7';
  const t = { up: 'translate(52,50) rotate(58) scale(1,0.95)',
              mid: 'translate(52,52) rotate(-4)',
              down: 'translate(52,54) rotate(-52) scale(1,0.85)' }[frame];
  return `<g transform="${t}">
  <path d="${shape}" fill="${B.wing}"/>
  <path d="${shadeP}" fill="${B.wingShade}"/>
  <path d="${light}" fill="none" stroke="${B.wingLight}" stroke-width="3" ${R}/>
  <path d="${feathers}" fill="none" stroke="${B.line}" stroke-width="1.6" opacity="0.55" ${R}/>
  <path d="${shape}" fill="none" stroke="${B.line}" stroke-width="3" ${R}/>
</g>`;
}

function birdGroup(frame, idp) {
  return `<defs><clipPath id="${idp}b"><path d="${BODY}"/></clipPath></defs>
<!-- tail -->
<g ${R} stroke="${B.line}" stroke-width="3">
  <path d="M28,52 C18,44 10,42 5,45 C10,48 14,51 16,54 C10,55 6,59 6,63 C12,63 20,61 28,60 Z" fill="${B.shade}"/>
  <path d="M27,55 C19,53 13,55 9,58" fill="none" stroke="${B.wingLight}" stroke-width="2.2"/>
</g>
<!-- crest -->
<path d="M60,24 C58,16 61,11 67,9 C65,14 66,18 69,22 C70,17 74,14 79,14 C76,18 75,22 74,27 Z" fill="${B.shade}" stroke="${B.line}" stroke-width="3" ${R}/>
<!-- body -->
<path d="${BODY}" fill="${B.body}"/>
<g clip-path="url(#${idp}b)">
  <ellipse cx="66" cy="68" rx="25" ry="18" fill="${B.belly}"/>
  <path d="M10,60 C22,80 44,90 70,86 C60,98 10,96 10,60 Z" fill="${B.shade}"/>
  <path d="M45,90 C58,84 76,84 96,72 L100,100 L40,100 Z" fill="#f3e2b4"/>
  <ellipse cx="50" cy="34" rx="14" ry="6" fill="#ffe28a" transform="rotate(-18 50 34)"/>
</g>
<path d="${BODY}" fill="none" stroke="${B.line}" stroke-width="3" ${R}/>
<!-- cheek -->
<ellipse cx="80" cy="60" rx="6.5" ry="4.2" fill="${B.cheek}" opacity="0.85"/>
<!-- eye -->
<ellipse cx="74" cy="42" rx="10" ry="11" fill="#ffffff" stroke="${B.line}" stroke-width="2.6"/>
<ellipse cx="77" cy="43" rx="5.6" ry="6.8" fill="${B.eye}"/>
<circle cx="79.2" cy="39.8" r="2.4" fill="#ffffff"/>
<circle cx="75" cy="46.6" r="1.1" fill="#ffffff" opacity="0.8"/>
<!-- brow -->
<path d="M67,29 C71,27 76,27 80,29" fill="none" stroke="${B.line}" stroke-width="2.4" ${R}/>
<!-- beak -->
<g stroke="${B.line}" stroke-width="2.8" ${R}>
  <path d="M89,47 C96,46 104,48 108,52 C102,54 95,55 89,55 Z" fill="${B.beak}"/>
  <path d="M89,55 C95,55 101,54 106,53 C101,58 95,60 90,59 Z" fill="${B.beakShade}"/>
</g>
${wing(frame)}`;
}
for (const f of ['up', 'mid', 'down'])
  fs.writeFileSync(`${OUT}/bird_${f}.svg`, svg(120, 100, birdGroup(f, 'bird' + f)));

/* ---------------- STRAWBERRY ---------------- */
const S = { red: '#ff3b4e', shade: '#d42340', line: '#7e1424', seed: '#ffe27a', leaf: '#52b83c', leafD: '#2f8a2a', leafLine: '#22521a' };
const BERRY = 'M32,59 C19,57 8,44 8,31 C8,21 17,15 25,17 C28,18 30,19 32,19 C34,19 36,18 39,17 C47,15 56,21 56,31 C56,44 45,57 32,59 Z';
function seeds() {
  const pts = [[20,28],[32,27],[44,28],[15,38],[26,37],[38,37],[49,38],[21,47],[32,46],[43,47],[27,54],[37,54]];
  return pts.map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.5" ry="2.4" fill="${S.seed}" stroke="#b8323f" stroke-width="0.8"/>`).join('\n  ');
}
const strawberryInner = (idp) => `<defs><clipPath id="${idp}s"><path d="${BERRY}"/></clipPath></defs>
<path d="${BERRY}" fill="${S.red}"/>
<g clip-path="url(#${idp}s)">
  <path d="M44,18 C60,26 58,52 32,62 L64,64 L64,10 Z" fill="${S.shade}"/>
  ${seeds()}
</g>
<path d="${BERRY}" fill="none" stroke="${S.line}" stroke-width="3" ${R}/>
<path d="M15,30 C15,25 18,22 22,22" fill="none" stroke="#ffffff" stroke-width="3.4" ${R} opacity="0.9"/>
<ellipse cx="17.5" cy="36" rx="2" ry="3" fill="#ffffff" opacity="0.75"/>
<!-- leafy cap -->
<g stroke="${S.leafLine}" stroke-width="2.6" ${R}>
  <path d="M32,21 C25,24 17,24 13,20 C18,17 24,16 29,17 C24,13 23,9 25,5 C29,8 31,12 32,15 C33,12 35,8 39,5 C41,9 40,13 35,17 C40,16 46,17 51,20 C47,24 39,24 32,21 Z" fill="${S.leaf}"/>
  <path d="M32,16 C32,11 33,6 36,2" fill="none" stroke-width="3"/>
</g>
<path d="M20,20 C24,19 27,19 30,20 M44,20 C40,19 37,19 34,20" fill="none" stroke="${S.leafD}" stroke-width="1.6" ${R}/>`;
fs.writeFileSync(`${OUT}/drop.svg`, svg(64, 64, strawberryInner('drop')));

/* ---------------- TURTLE ---------------- */
const T = { shell: '#4caa3c', shellD: '#2f7f2b', scute: '#62c04a', scuteL: '#86d861', line: '#2d4a1e',
  rim: '#c9e98a', rimD: '#a6d06a', skin: '#a3da6e', skinD: '#7cbd4f', skinLine: '#3d6b25', blush: '#ff9a9a' };
const SHELL = 'M37,82 C35,44 64,16 100,16 C136,16 165,44 163,82 Z';

function leg(x, lift, far, dir) {
  // stubby leg, top hidden under belly; foot pokes slightly toward walking direction
  const top = 84, b = 119 - lift, f = dir * 3;
  const fill = far ? T.skinD : T.skin;
  return `<path d="M${x - 12},${top} L${x - 13 + f},${b - 8} C${x - 15 + f},${b + 1} ${x + 16 + f},${b + 1} ${x + 14 + f},${b - 8} L${x + 12},${top} Z" fill="${fill}" stroke="${T.skinLine}" stroke-width="3" ${R}/>
<path d="M${x - 4 + f},${b - 1.5} L${x - 4 + f},${b - 5} M${x + 3 + f},${b - 1.5} L${x + 3 + f},${b - 5} M${x + 10 + f},${b - 2} L${x + 9 + f},${b - 5}" stroke="${T.skinLine}" stroke-width="1.6" ${R} opacity="0.55"/>`;
}

function turtle(mode, idp) {
  // mode: walk1 | walk2 | happy
  const a = mode === 'walk2' ? -1 : 1;       // step direction for pair A
  const happy = mode === 'happy';
  const st = happy ? 0 : 7;                   // stride
  // pair A: near-front + far-back ; pair B: near-back + far-front
  const nf = 140 + a * st, fb = 58 + a * st, nb = 66 - a * st, ff = 132 - a * st;
  const liftA = a > 0 ? 4 : 0, liftB = a > 0 ? 0 : 4;
  const hy = happy ? -6 : (mode === 'walk2' ? 1.5 : 0);
  const hr = happy ? -8 : 0;
  const face = happy
    ? `<path d="M172,58 C174.5,51 181.5,51 184,58" fill="none" stroke="${T.line}" stroke-width="3.2" ${R}/>
  <path d="M188,57 C189.5,52 193.5,52 195,57" fill="none" stroke="${T.line}" stroke-width="2.8" ${R}/>
  <ellipse cx="169" cy="67" rx="5.4" ry="3.4" fill="${T.blush}" opacity="0.9"/>
  <path d="M179,65 C184,66 191,66 196,63 C196,72 190,78 184,77 C180,76 178,71 179,65 Z" fill="#8a2f2f" stroke="${T.line}" stroke-width="2.6" ${R}/>
  <path d="M182,74 C184,71 189,71 192,73 C190,77 185,78 182,74 Z" fill="#ff8b8b"/>`
    : `<ellipse cx="182" cy="55" rx="6.4" ry="7.6" fill="${T.line}"/>
  <circle cx="184.4" cy="52" r="2.5" fill="#ffffff"/>
  <circle cx="180.4" cy="58.4" r="1.1" fill="#ffffff" opacity="0.8"/>
  <ellipse cx="172" cy="67" rx="5" ry="3.2" fill="${T.blush}" opacity="0.8"/>
  <path d="M183,68 C186,72 192,71 195,66" fill="none" stroke="${T.line}" stroke-width="2.8" ${R}/>`;
  return `<defs><clipPath id="${idp}c"><path d="${SHELL}"/></clipPath></defs>
<!-- far legs -->
${leg(fb, liftA, true, a)}
${leg(ff, liftB, true, -a)}
<!-- tail -->
<path d="M40,88 C32,88 24,92 19,98 C28,99 36,97 44,94 Z" fill="${T.skin}" stroke="${T.skinLine}" stroke-width="3" ${R}/>
<!-- near legs (tops hidden by belly) -->
${leg(nb, liftB, false, -a)}
${leg(nf, liftA, false, a)}
<!-- body under shell -->
<path d="M40,84 C46,104 154,104 160,84 Z" fill="${T.skinD}" stroke="${T.skinLine}" stroke-width="3" ${R}/>
<!-- head + neck -->
<g transform="translate(0 ${hy}) rotate(${hr} 160 78)">
  <path d="M146,88 C148,74 156,64 164,60 L172,86 C164,94 154,94 146,88 Z" fill="${T.skin}" stroke="${T.skinLine}" stroke-width="3" ${R}/>
  <path d="M155,60 C155,46 165,38 177,38 C190,38 198,48 198,60 C198,74 189,82 176,82 C164,82 155,74 155,60 Z" fill="${T.skin}" stroke="${T.skinLine}" stroke-width="3" ${R}/>
  <path d="M163,47 C167,43 173,41 179,42" fill="none" stroke="#c7ee99" stroke-width="3.2" ${R}/>
  ${face}
</g>
<!-- shell -->
<path d="${SHELL}" fill="${T.shell}"/>
<g clip-path="url(#${idp}c)">
  <path d="M30,64 C60,80 140,80 170,64 L170,90 L30,90 Z" fill="${T.shellD}"/>
  <g stroke="${T.line}" stroke-width="2.6" ${R}>
    <path d="M86,26 L114,26 L124,44 L114,62 L86,62 L76,44 Z" fill="${T.scute}"/>
    <path d="M76,44 L86,26 L80,10 L56,14 L50,30 L58,44 Z" fill="${T.scute}"/>
    <path d="M124,44 L114,26 L120,10 L144,14 L150,30 L142,44 Z" fill="${T.scute}"/>
    <path d="M58,44 L76,44 L86,62 L80,90 L40,90 L44,58 Z" fill="${T.scute}"/>
    <path d="M142,44 L124,44 L114,62 L120,90 L160,90 L156,58 Z" fill="${T.scute}"/>
    <path d="M86,62 L114,62 L120,90 L80,90 Z" fill="${T.scute}"/>
    <path d="M58,44 L50,30 L30,32 L30,58 L44,58 Z" fill="${T.scute}"/>
    <path d="M142,44 L150,30 L170,32 L170,58 L156,58 Z" fill="${T.scute}"/>
  </g>
  <path d="M90,32 L110,32 L116,44" fill="none" stroke="${T.scuteL}" stroke-width="3" ${R}/>
  <path d="M62,24 C66,20 72,18 78,18" fill="none" stroke="${T.scuteL}" stroke-width="3" ${R}/>
  <path d="M30,72 C60,86 140,86 170,72 L170,90 L30,90 Z" fill="${T.shellD}" opacity="0.55"/>
</g>
<path d="${SHELL}" fill="none" stroke="${T.line}" stroke-width="3" ${R}/>
<path d="M58,36 C64,28 72,24 80,23" fill="none" stroke="#ffffff" stroke-width="3.2" opacity="0.5" ${R}/>
<!-- rim -->
<rect x="31" y="76" width="138" height="14" rx="7" fill="${T.rim}" stroke="${T.line}" stroke-width="3"/>
<path d="M40,86 L160,86" stroke="${T.rimD}" stroke-width="2.4" ${R}/>
<g fill="${T.rimD}"><circle cx="54" cy="82" r="1.6"/><circle cx="77" cy="82.5" r="1.6"/><circle cx="100" cy="82.8" r="1.6"/><circle cx="123" cy="82.5" r="1.6"/><circle cx="146" cy="82" r="1.6"/></g>`;
}
for (const m of ['walk1', 'walk2', 'happy'])
  fs.writeFileSync(`${OUT}/turtle_${m}.svg`, svg(200, 120, turtle(m, 't' + m)));

/* ---------------- HEART ---------------- */
const HEART = 'M24,42 C12,34 5,26 5,17 C5,10 10,6 16,6 C20,6 23,8 24,12 C25,8 28,6 32,6 C38,6 43,10 43,17 C43,26 36,34 24,42 Z';
fs.writeFileSync(`${OUT}/heart.svg`, svg(48, 48, `<defs><clipPath id="hc"><path d="${HEART}"/></clipPath></defs>
<path d="${HEART}" fill="#ff6b8b"/>
<g clip-path="url(#hc)"><path d="M48,10 C46,30 34,40 18,44 L48,48 Z" fill="#e8476c"/></g>
<path d="${HEART}" fill="none" stroke="#a82a4a" stroke-width="3" ${R}/>
<path d="M10,17 C10,13 12,11 15,11" fill="none" stroke="#ffffff" stroke-width="3" opacity="0.9" ${R}/>
<circle cx="11" cy="22" r="1.6" fill="#ffffff" opacity="0.8"/>`));

/* ---------------- ICON ---------------- */
fs.writeFileSync(`${OUT}/icon.svg`, svg(256, 256, `<defs>
<linearGradient id="isky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9fe0ff"/><stop offset="1" stop-color="#3fa8ea"/></linearGradient>
<clipPath id="iclip"><circle cx="128" cy="128" r="110"/></clipPath>
</defs>
<circle cx="128" cy="128" r="122" fill="#ffffff"/>
<circle cx="128" cy="128" r="122" fill="none" stroke="#1f6fa8" stroke-width="6"/>
<circle cx="128" cy="128" r="110" fill="url(#isky)"/>
<g clip-path="url(#iclip)">
  <ellipse cx="70" cy="70" rx="40" ry="14" fill="#ffffff" opacity="0.7"/>
  <ellipse cx="200" cy="54" rx="30" ry="10" fill="#ffffff" opacity="0.6"/>
  <path d="M0,206 C60,192 120,212 256,196 L256,256 L0,256 Z" fill="#7cc94f"/>
  <g transform="translate(-70 -6) scale(2.65)">${birdGroup('up', 'ib')}</g>
  <g transform="translate(140 128) rotate(14 32 32) scale(1.45)">${strawberryInner('ic')}</g>
</g>
<circle cx="128" cy="128" r="110" fill="none" stroke="#1f6fa8" stroke-width="5"/>`));
console.log('written to', OUT);
