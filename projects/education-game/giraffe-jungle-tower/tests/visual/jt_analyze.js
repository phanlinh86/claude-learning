// Analyse the visual QA capture: colour contrast of every answer colour on every mood (face vs the grass around the block,
// WCAG ratio + ΔE00, and the closest pair of answer colours per mood, also under deutan/protan simulation); layout checks
// from the jsonl geometry (bubble overflow, goal under the bubble, pieces off-screen / under the HUD).
//   node tests/visual/jt_analyze.js
const fs = require('fs'), path = require('path');
const { lab, de00, lin } = require('./colour');
const OUT = path.join(__dirname, '..', '..', 'docs', 'reports', 'visual');
const rd = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const Y = c => { const l = lin(c); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const A = Y(a), B = Y(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
const hx = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
const lines = [];
const P = s => { lines.push(s); console.log(s); };

P('## Contrast: answer colour (block face) vs the grass ring around it');
for (const r of rd(path.join(OUT, 'contrast', 'contrast.jsonl'))) {
  P(`\n### ${r.dev} · ${r.mood}`);
  P('| colour | face | bg | WCAG | ΔE00 |'); P('|---|---|---|---|---|');
  const cols = Object.keys(r.out);
  for (const c of cols) { const o = r.out[c]; P(`| ${c} | ${hx(o.face)} | ${hx(o.bg)} | ${ratio(o.face, o.bg).toFixed(2)} | ${de00(lab(o.face), lab(o.bg)).toFixed(1)} |`); }
  for (const sim of [null, 'deut', 'prot']) {
    let worst = [1e9];
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
      const d = de00(lab(r.out[cols[i]].face, sim), lab(r.out[cols[j]].face, sim)); if (d < worst[0]) worst = [d, cols[i], cols[j]];
    }
    P(`closest answer pair (${sim || 'normal'}): ${worst[1]}/${worst[2]} ΔE00 ${worst[0].toFixed(1)}`);
  }
}

P('\n## Layout flags');
const files = ['screens/screens.jsonl', 'tod/tod.jsonl', 'topics/topics.jsonl'];
for (const f of files) for (const r of rd(path.join(OUT, f))) {
  const g = r.g; if (!g) continue;
  const flags = [];
  if (g.bubbleOverflow && (g.bubbleOverflow[0] > 1 || g.bubbleOverflow[1] > 1)) flags.push('bubble overflow ' + g.bubbleOverflow);
  if (g.bubble && g.goal && g.state === 'round' && g.goal.y < g.bubble.y + g.bubble.h && g.goal.y + 104 > g.bubble.y && Math.abs(g.goal.x - (g.bubble.x + g.bubble.w / 2)) < g.bubble.w / 2 + 48)
    flags.push(`bananas under bubble (goal y ${Math.round(g.goal.y)}–${Math.round(g.goal.y + 104)}, bubble ${Math.round(g.bubble.y)}–${Math.round(g.bubble.y + g.bubble.h)})`);
  for (const p of g.pieces || []) {
    if (p.state !== 'rest') continue;
    const h = p.side / 2;
    if (p.x - h < g.ins.left || p.x + h > g.W - g.ins.right || p.y + h > g.H - g.ins.bottom) flags.push(`piece ${p.id} outside safe area (${Math.round(p.x)},${Math.round(p.y)})`);
    for (const k of g.hudKeep || []) if (p.x + h > k.x && p.x - h < k.x + k.w && p.y + h > k.y && p.y - h < k.y + k.h) flags.push(`piece ${p.id} under HUD/bubble`);
  }
  if (g.bubble && g.lulu && g.bubble.y + g.bubble.h > g.lulu.y - g.lulu.h && g.bubble.x < g.lulu.x + 120) flags.push('bubble over Lulu head');
  if (flags.length) P(`- ${r.tag} ${r.screen || ''}: ${[...new Set(flags)].join('; ')}`);
}
fs.writeFileSync(path.join(OUT, 'analysis.md'), lines.join('\n') + '\n');
