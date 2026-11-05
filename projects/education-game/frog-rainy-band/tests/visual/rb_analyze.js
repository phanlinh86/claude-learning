// Analyse the visual QA capture of Bop's Rainy Band:
//  - contrast of every answer colour (drum shell) vs the stage wood and vs the garden behind the band, per season
//    (WCAG ratio + ΔE00), and the closest pair of answer colours (normal / deutan / protan);
//  - layout flags from the jsonl geometry: song-sheet notes (drawn size) vs the bubble / HUD / each other, the count card,
//    members vs HUD / bubble / safe area, Bop vs the big drum and the screen edge, member size in logical + CSS px,
//    bubble text overflow, Talk-time choices.
//   RB_VIS_OUT=/dir node tests/visual/rb_analyze.js     → $RB_VIS_OUT/analysis.md
const fs = require('fs'), path = require('path');
const { lab, de00, lin } = require('./colour');
const OUT = process.env.RB_VIS_OUT || path.join(__dirname, '..', 'out', 'visual');
const rd = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const Y = c => { const l = lin(c); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const A = Y(a), B = Y(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
const hx = c => c ? '#' + c.map(v => v.toString(16).padStart(2, '0')).join('').toUpperCase() : '-';
const r0 = v => Math.round(v);
const lines = [];
const P = s => { lines.push(s); console.log(s); };

P('## Contrast: answer colour (drum shell) vs stage wood and vs the garden behind the band');
for (const r of rd(path.join(OUT, 'contrast', 'contrast.jsonl'))) {
  P(`\n### ${r.dev} · L${r.lv} ${r.season} · wood ${hx(r.wood)} · garden ${hx(r.bg)}`);
  P('| colour | shell | WCAG vs wood | ΔE00 vs wood | WCAG vs garden | ΔE00 vs garden |'); P('|---|---|---|---|---|---|');
  const cols = Object.keys(r.out);
  for (const c of cols) { const o = r.out[c].shell; P(`| ${c} | ${hx(o)} | ${ratio(o, r.wood).toFixed(2)} | ${de00(lab(o), lab(r.wood)).toFixed(1)} | ${ratio(o, r.bg).toFixed(2)} | ${de00(lab(o), lab(r.bg)).toFixed(1)} |`); }
  for (const sim of [null, 'deut', 'prot']) {
    let worst = [1e9];
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
      const d = de00(lab(r.out[cols[i]].shell, sim), lab(r.out[cols[j]].shell, sim)); if (d < worst[0]) worst = [d, cols[i], cols[j]];
    }
    P(`closest answer pair (${sim || 'normal'}): ${worst[1]}/${worst[2]} ΔE00 ${worst[0].toFixed(1)}`);
  }
}

const ov = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const area = (a, b) => ov(a, b) ? (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * (Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)) : 0;
// the song-sheet note as band_art.drawNote draws it for render's size argument (R = size = 2·noteR = 68; popped ×1.4)
const NOTE_R = 68;
const noteBox = (s, filled, k = 1) => { const R = NOTE_R * k; return filled ? { x: s.x - 0.62 * R, y: s.y - 1.75 * R - 0.11 * R, w: 0.62 * R + 1.36 * R, h: 1.86 * R + 0.5 * R } : { x: s.x - R, y: s.y - R, w: 2 * R, h: 2 * R }; };
const memberBox = (m, S) => m.kind === 'animal' ? { x: m.x - 0.47 * S, y: m.y + 0.5 * S - 0.95 * S, w: 0.94 * S, h: 0.95 * S } : { x: m.x - 0.42 * S, y: m.y - 0.38 * S, w: 0.84 * S, h: 0.88 * S };

P('\n## Layout flags (logical px; CSS px = logical × s)');
const files = ['screens/screens.jsonl', 'count/count.jsonl', 'seasons/seasons.jsonl', 'topics/topics.jsonl', 'surprise/surprise.jsonl'];
const sizes = {};
for (const f of files) for (const r of rd(path.join(OUT, f))) {
  const g = r.g; if (!g || g.state !== 'round') continue;
  const flags = [], dev = r.tag.split('-')[0];
  sizes[dev] = sizes[dev] || { S: new Set(), css: new Set() };
  sizes[dev].S.add(r0(g.S)); sizes[dev].css.add(r0(g.S * g.s));
  if (g.bubbleOverflow && (g.bubbleOverflow[0] > 1 || g.bubbleOverflow[1] > 1)) flags.push('bubble text overflow ' + g.bubbleOverflow);
  const hud = g.hud, bub = g.bubble;
  const slots = g.sheet.slots || [];
  if (slots.length > 1) { const gap = slots[1].x - slots[0].x; if (gap < 2 * NOTE_R) flags.push(`sheet circles overlap: gap ${r0(gap)} < drawn Ø ${2 * NOTE_R}`); }
  slots.forEach((s, i) => {
    const filled = i < g.sheet.filled, nb = noteBox(s, true, g.phase === 'song' ? 1.4 : 1);
    if (ov(nb, bub)) flags.push(`note ${i} under bubble (${r0(area(nb, bub))} px², note top ${r0(nb.y)} vs bubble bottom ${r0(bub.y + bub.h)})`);
    if (ov(nb, hud)) flags.push(`note ${i} under HUD (note ${r0(nb.x)}–${r0(nb.x + nb.w)} × top ${r0(nb.y)}, HUD x ${r0(hud.x)} bottom ${r0(hud.y + hud.h)})`);
    if (nb.y < g.ins.top) flags.push(`note ${i} top ${r0(nb.y)} above safe top ${r0(g.ins.top)}`);
    void filled;
  });
  if (g.countCard) {
    const c = g.countCard;
    if (ov(c, bub)) flags.push('count card under bubble');
    if (ov(c, hud)) flags.push('count card under HUD');
    slots.forEach((s, i) => { if (ov(c, noteBox(s, true))) flags.push(`count card over note ${i}`); });
    for (const m of g.members) if (ov(c, memberBox(m, g.S))) flags.push(`count card over member ${m.id}`);
  }
  for (const m of g.members) {
    if (m.state !== 'rest') continue;
    const b = memberBox(m, g.S);
    if (b.x < g.ins.left || b.x + b.w > g.W - g.ins.right) flags.push(`member ${m.id} outside safe area x ${r0(b.x)}–${r0(b.x + b.w)}`);
    if (ov(b, hud) || ov(b, bub)) flags.push(`member ${m.id} under HUD/bubble`);
    const D = g.bigDrum, db = { x: D.x - D.r, y: D.y - 0.75 * D.r, w: 2 * D.r, h: 1.5 * D.r };
    if (ov(b, db)) flags.push(`member ${m.id} overlaps big drum`);
  }
  // Bop's drawn box ≈ feet ± 0.5 h wide (bop svg 300×300), the big drum's box
  const B = g.bop, bb = { x: B.x - 0.5 * B.h, y: B.y - B.h, w: B.h, h: B.h }, D = g.bigDrum, db = { x: D.x - D.r, y: D.y - 0.75 * D.r, w: 2 * D.r, h: 1.5 * D.r };
  if (bb.x < 0) flags.push(`Bop sprite box starts ${r0(bb.x)} px left of the screen`);
  const bo = area(bb, db); if (bo > 0) flags.push(`big drum covers ${r0(100 * bo / (bb.w * bb.h))}% of Bop's box`);
  if (ov(bb, bub)) flags.push('Bop under bubble');
  if (g.snail) { const sn = { x: g.snail.x - g.snail.size / 2, y: g.snail.y - g.snail.size * 0.8, w: g.snail.size, h: g.snail.size * 0.8 }; for (const m of g.members) if (ov(sn, memberBox(m, g.S))) flags.push(`snail over member ${m.id}`); if (sn.x + sn.w > g.W - g.ins.right) flags.push('snail outside right safe edge'); }
  if (flags.length) P(`- ${r.tag} ${r.screen || ''} [S ${r0(g.S)} = ${r0(g.S * g.s)} CSS px, font ${g.bubbleFont}]: ${[...new Set(flags)].join('; ')}`);
}
P('\n## Member size per device (logical S / CSS px)');
for (const d in sizes) P(`- ${d}: S ${[...sizes[d].S].sort((a, b) => a - b).join(', ')} → CSS ${[...sizes[d].css].sort((a, b) => a - b).join(', ')}`);

P('\n## Talk time');
for (const r of rd(path.join(OUT, 'talk', 'talk.jsonl'))) {
  const fl = [];
  if (r.overflow > 1) fl.push('panel overflow ' + r.overflow);
  if (r.panel[1] > r.panel[5] || r.panel[0] < 0) fl.push('panel off-screen ' + r.panel);
  for (const c of r.choices) { if (c.clip) fl.push('clipped "' + c.txt + '"'); if (c.h < 60 || c.w < 60) fl.push(`small choice ${c.w}×${c.h} "${c.txt}"`); if (!c.pic) fl.push(`text-only "${c.txt}"`); else if (c.pic[1] < 50) fl.push(`small picture ${c.pic} "${c.txt}"`); }
  P(`- ${r.tag}: show ${r.show} · choices ${r.choices.map(c => (c.pic ? '🖼' + c.pic.join('×') : 'T') + ' ' + c.w + '×' + c.h).join(' | ')}${fl.length ? ' · FLAGS: ' + [...new Set(fl)].join('; ') : ''}`);
}
for (const r of rd(path.join(OUT, 'screens', 'screens.jsonl'))) {
  if (r.screen === 'settings' && (r.scroll > 1 || r.clipped.length || r.small.length)) P(`- settings ${r.tag}: scroll ${r.scroll} clipped ${JSON.stringify(r.clipped)} small ${JSON.stringify(r.small)}`);
  if (r.rects) for (const k in r.rects) { const q = r.rects[k]; if (q.over[0] > 1 || q.over[1] > 1) P(`- ${r.screen} ${r.tag} ${k} overflow ${q.over} "${q.txt}"`);
    if (q.css[0] < r.sa[3] || q.css[1] < r.sa[0] - 1 || q.css[2] > r.vw - r.sa[1] || q.css[3] > r.vh - r.sa[2] + 1) P(`- ${r.screen} ${r.tag} ${k} in unsafe area ${q.css} (sa ${r.sa})`); }
}
fs.writeFileSync(path.join(OUT, 'analysis.md'), lines.join('\n') + '\n');
