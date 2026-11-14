// Analyse the visual QA capture of Koko's Cake Tower: colour contrast of every answer colour on every weather mood
// (frosting + sponge vs the plaza ring around the layer: WCAG ratio + ΔE00, and the closest pair of answer colours per mood,
// also under deutan/protan simulation); layout checks from the jsonl geometry (bubble overflow, cherry/cloud under the
// bubble or HUD, the tall cake + candles + cherry reaching the bubble/HUD, pieces off-screen / under the HUD, Koko over
// the cake or the tray layers).
//   VQA_OUT=/scratch node tests/visual/ck_analyze.js      → $VQA_OUT/analysis.md (+ stdout)
const fs = require('fs'), path = require('path');
const { lab, de00, lin } = require('./colour');
const OUT = process.env.VQA_OUT || path.join(__dirname, '..', '..', 'docs', 'reports', 'visual');
const rd = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(JSON.parse) : [];
const Y = c => { const l = lin(c); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const ratio = (a, b) => { const A = Y(a), B = Y(b); return (Math.max(A, B) + 0.05) / (Math.min(A, B) + 0.05); };
const hx = c => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
const lines = [];
const P = s => { lines.push(s); console.log(s); };
const R = Math.round;

P('## Contrast: answer colour layer (frosting / sponge) vs the plaza ring around it');
for (const r of rd(path.join(OUT, 'contrast', 'contrast.jsonl'))) {
  P(`\n### ${r.dev} · ${r.mood}`);
  P('| colour | frosting | sponge | bg | WCAG frost | ΔE00 frost | WCAG sponge | ΔE00 sponge |'); P('|---|---|---|---|---|---|---|---|');
  const cols = Object.keys(r.out);
  for (const c of cols) { const o = r.out[c];
    P(`| ${c} | ${hx(o.frost)} | ${hx(o.face)} | ${hx(o.bg)} | ${ratio(o.frost, o.bg).toFixed(2)} | ${de00(lab(o.frost), lab(o.bg)).toFixed(1)} | ${ratio(o.face, o.bg).toFixed(2)} | ${de00(lab(o.face), lab(o.bg)).toFixed(1)} |`); }
  for (const sim of [null, 'deut', 'prot']) {
    let worst = [1e9];
    for (let i = 0; i < cols.length; i++) for (let j = i + 1; j < cols.length; j++) {
      const d = de00(lab(r.out[cols[i]].frost, sim), lab(r.out[cols[j]].frost, sim)); if (d < worst[0]) worst = [d, cols[i], cols[j]];
    }
    P(`closest answer pair, frosting (${sim || 'normal'}): ${worst[1]}/${worst[2]} ΔE00 ${worst[0].toFixed(1)}`);
  }
}

const hit = (a, b) => a && b && a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
P('\n## Layout flags');
const files = ['screens/screens.jsonl', 'weather/weather.jsonl', 'topics/topics.jsonl'];
for (const f of files) for (const r of rd(path.join(OUT, f))) {
  const g = r.g; if (!g) continue;
  const flags = [];
  if (g.bubbleOverflow && (g.bubbleOverflow[0] > 1 || g.bubbleOverflow[1] > 1)) flags.push('bubble overflow ' + g.bubbleOverflow);
  const hud = g.hud && { x: g.hud.x - 4, y: 0, w: g.hud.w + 8, h: g.hud.y + g.hud.h + 4 };
  // cloud (180×100 at its top-centre anchor) + cherry (72 tall above its bottom anchor)
  if (g.cloud) { const c = { x: g.cloud.x - 90 * g.cloud.s, y: g.cloud.y, w: 180 * g.cloud.s, h: 100 * g.cloud.s };
    if (hit(c, g.bubble)) flags.push(`cloud under bubble (cloud y ${R(c.y)}–${R(c.y + c.h)}, bubble y ${R(g.bubble.y)}–${R(g.bubble.y + g.bubble.h)})`);
    if (hit(c, hud)) flags.push('cloud under HUD'); }
  if (g.cherry) { const c = { x: g.cherry.x - 32, y: g.cherry.y - 72, w: 64, h: 72 };
    if (hit(c, g.bubble)) flags.push(`cherry under bubble (cherry top ${R(c.y)}, bubble bottom ${R(g.bubble.y + g.bubble.h)})`);
    if (hit(c, hud)) flags.push(`cherry under HUD (cherry top ${R(c.y)}, HUD bottom ${R(hud.h)})`);
    if (c.y < g.ins.top) flags.push(`cherry in the unsafe top inset (top ${R(c.y)} < ${R(g.ins.top)})`); }
  for (const c of g.candles || []) { const k = { x: c.x - 8, y: c.y - 72 * c.s - 20, w: 16, h: 72 * c.s + 20 };   // candle + flame
    if (hit(k, g.bubble)) flags.push(`candle under bubble (flame top ${R(k.y)}, bubble bottom ${R(g.bubble.y + g.bubble.h)})`);
    if (hit(k, hud)) flags.push(`candle under HUD (flame top ${R(k.y)})`); }
  // cake layers vs bubble / HUD
  for (let i = 0; i < (g.tower || []).length; i++) { const b = g.tower[i]; if (!b || b.alpha === 0) continue; const box = { x: b.x - b.bw / 2, y: b.y - b.bh / 2, w: b.bw, h: b.bh };
    if (hit(box, g.bubble)) flags.push(`cake layer ${i + 1} under bubble`); if (hit(box, hud)) flags.push(`cake layer ${i + 1} under HUD`); }
  // Koko's body (≈ ±0.3·h wide) vs cake layers and resting tray pieces
  if (g.koko) { const k = { x: g.koko.x - 0.3 * g.koko.h, y: g.koko.y - g.koko.h, w: 0.6 * g.koko.h, h: g.koko.h };
    for (let i = 0; i < (g.tower || []).length; i++) { const b = g.tower[i]; if (b && hit(k, { x: b.x - b.bw / 2, y: b.y - b.bh / 2, w: b.bw, h: b.bh })) flags.push(`Koko body box overlaps cake layer ${i + 1} by ${R(k.x + k.w - (b.x - b.bw / 2))} px`); }
    for (const p of g.pieces || []) if (p.state === 'rest' && hit(k, { x: p.x - p.bw / 2, y: p.y - p.bh / 2, w: p.bw, h: p.bh })) flags.push(`Koko over tray piece ${p.id}`);
    if (hit(k, g.bubble)) flags.push(`bubble over Koko (Koko top ${R(k.y)}, bubble bottom ${R(g.bubble.y + g.bubble.h)})`); }
  for (const p of g.pieces || []) {
    if (p.state !== 'rest') continue;
    if (p.x - p.bw / 2 < g.ins.left || p.x + p.bw / 2 > g.W - g.ins.right || p.y + p.bh / 2 > g.H - g.ins.bottom) flags.push(`piece ${p.id} outside safe area (${R(p.x)},${R(p.y)})`);
    if (hit({ x: p.x - p.bw / 2, y: p.y - p.bh / 2, w: p.bw, h: p.bh }, g.bubble)) flags.push(`piece ${p.id} under bubble`);
  }
  if (flags.length) P(`- ${r.tag} ${r.screen || ''}: ${[...new Set(flags)].join('; ')}`);
}

// tallest cake headroom per device/age (done frames): gap between the top of the cherry and the bubble bottom / HUD bottom
P('\n## Tall-cake headroom (done frames: cherry top − max(bubble bottom, HUD bottom), logical px; < 0 = overlap)');
P('| tag | layers | LW×LH | cherry top | bubble bottom | gap |'); P('|---|---|---|---|---|---|');
for (const r of rd(path.join(OUT, 'topics', 'topics.jsonl'))) {
  const g = r.g; if (!g || !/-done$/.test(r.tag) || !g.cherry) continue;
  const bb = g.bubble ? g.bubble.y + g.bubble.h : 0;
  const xo = g.bubble && g.cherry.x + 32 > g.bubble.x && g.cherry.x - 32 < g.bubble.x + g.bubble.w;
  P(`| ${r.tag} | ${g.tower.length} | ${g.LW}×${g.LH} | ${R(g.cherry.y - 72)} | ${R(bb)} | ${xo ? R(g.cherry.y - 72 - bb) : 'beside (' + R(g.cherry.y - 72 - g.ins.top) + ' to top inset)'} |`);
}
fs.writeFileSync(path.join(OUT, 'analysis.md'), lines.join('\n') + '\n');
