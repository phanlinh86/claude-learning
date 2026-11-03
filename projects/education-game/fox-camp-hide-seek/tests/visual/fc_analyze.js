// Analyse the fc_capture.js geometry: islands/tokens vs HUD, bubble, rocket and screen edges, hit-target sizes, bubble fit,
// answer-colour contrast against the sky behind each island.   node tests/visual/fc_analyze.js > tests/out/visual/analysis.txt
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'out', 'visual');
const PAL = { red: ['#E84A4A', '#A8282E'], blue: ['#3C8DE8', '#1F5BA8'], yellow: ['#FFD23F', '#C99A12'], green: ['#4CC26B', '#2A8343'],
  orange: ['#FF9A2E', '#C4650C'], purple: ['#9B6BE0', '#6840A8'], pink: ['#FF8FC0', '#C9558A'] };
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16));
const relL = c => { const l = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * l[0] + 0.7152 * l[1] + 0.0722 * l[2]; };
const CR = (a, b) => { const x = relL(a), y = relL(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const ov = (a, b) => (a && b) ? Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * (Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0 ? 1 : 0) &&
  { w: Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), h: Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) } : null;
const r1 = v => Math.round(v * 10) / 10;
const read = f => fs.existsSync(f) ? fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : [];

const rows = [];
for (const [sec, file] of [['screens', 'screens/screens.jsonl'], ['chapters', 'chapters/chapters.jsonl'], ['topics', 'topics/topics.jsonl'], ['short', 'short/short.jsonl']]) {
  for (const r of read(path.join(OUT, file))) {
    const g = r.g; if (!g || !g.islands) continue;
    if (sec === 'screens' && r.screen !== 'ask') continue;
    const issues = [];
    const top = g.ins.top, bot = g.H - g.ins.bottom, L = g.ins.left, R = g.W - g.ins.right;
    const live = g.islands.filter(i => i.state === 'idle' || i.state === 'appear').map(i => i.style === 'planet' ? Object.assign({}, i, { body: { x: i.body.x + i.body.w * 0.1, y: i.body.y, w: i.body.w * 0.8, h: i.body.h } }) : i);
    let minHit = 1e9, minTok = 1e9;
    for (const i of live) {
      const T = i.token || { x: i.body.x, y: i.body.y, w: i.body.w, h: Math.min(40, i.body.h) };
      for (const [nm, K] of [['HUD', g.hud], ['bubble', g.bubble]]) {
        const o = ov(T, K); if (o) issues.push(`${i.kind}:${i.value} token under ${nm} by ${r1(o.w)}×${r1(o.h)}`);
        const ob = ov(i.body, K); if (ob && !o) issues.push(`${i.kind}:${i.value} island body under ${nm} by ${r1(ob.w)}×${r1(ob.h)}`);
      }
      if (T.y < top || T.x < L || T.x + T.w > R) issues.push(`${i.kind}:${i.value} token outside safe area (x ${r1(T.x)}..${r1(T.x + T.w)}, y ${r1(T.y)}; safe x ${r1(L)}..${r1(R)}, y ≥ ${r1(top)})`);
      if (i.body.x < L - 1 || i.body.x + i.body.w > R + 1) issues.push(`${i.kind}:${i.value} island body off safe x (${r1(i.body.x)}..${r1(i.body.x + i.body.w)})`);
      const orc = ov(i.body, g.rocket); if (orc && orc.h > 6) issues.push(`${i.kind}:${i.value} island overlaps rocket by ${r1(orc.w)}×${r1(orc.h)}`);
      const otk = i.token && ov(i.token, g.rocket); if (otk) issues.push(`${i.kind}:${i.value} token overlaps rocket by ${r1(otk.w)}×${r1(otk.h)}`);
      for (const j of live) if (j !== i && j.id > i.id) { const o = ov(i.body, j.body); if (o && o.h > 4 && o.w > 4) issues.push(`islands ${i.value}/${j.value} bodies overlap ${r1(o.w)}×${r1(o.h)}`); }
      minHit = Math.min(minHit, i.hit.w, i.hit.h);
      if (i.token) minTok = Math.min(minTok, i.token.w);
    }
    if (g.bubbleOverflow && (g.bubbleOverflow[0] > 0 || g.bubbleOverflow[1] > 0)) issues.push(`bubble overflow ${g.bubbleOverflow} ("${g.bubbleText}")`);
    rows.push({ sec, tag: r.tag, ok: r.ok, topic: g.topic, age: g.age, level: g.level, n: live.length, s: g.s, minHit: r1(minHit), minHitCss: r1(minHit * g.s), tokCss: r1(minTok * g.s), rocketCss: r1(g.rocket.h * g.s),
      bubbleFont: g.bubbleFont, bubbleCss: g.bubble && [r1(g.bubble.w * g.s), r1(g.bubble.h * g.s)], text: g.bubbleText, hudKeep: g.hudKeep && [r1(g.hudKeep.x), r1(g.hudKeep.w), r1(g.hudKeep.h)], rowTop: r1(Math.min(...live.map(i => (i.token || i.body).y))), issues });
    // contrast
    if (r.sky) for (const s of r.sky) {
      const c = s.kind === 'color' ? s.value : null; if (!c || !PAL[c]) continue;
      const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
      const b = s.samples.map(p => CR(hex(PAL[c][0]), p)), d = s.samples.map(p => CR(hex(PAL[c][1]), p));
      rows[rows.length - 1].contrast = (rows[rows.length - 1].contrast || []).concat([`${c} base med ${r1(med(b))}/min ${r1(Math.min(...b))} dark med ${r1(med(d))}`]);
    }
  }
}
for (const r of rows) {
  console.log(`${r.sec.padEnd(8)} ${String(r.tag).padEnd(34)} ok=${r.ok !== false} ${r.topic}/a${r.age}/L${r.level} n=${r.n} hit≥${r.minHit}lp=${r.minHitCss}css tok=${r.tokCss < 1e6 ? r.tokCss : '-'}css rocket=${r.rocketCss}css font=${r.bubbleFont} bubble=${r.bubbleCss} hudKeep=${r.hudKeep} rowTop=${r.rowTop}`);
  if (r.contrast) console.log('          contrast: ' + r.contrast.join(' | '));
  for (const i of r.issues) console.log('          ! ' + i);
}
// screens: DOM sizes
for (const r of read(path.join(OUT, 'screens/screens.jsonl'))) {
  if (r.screen === 'title' || r.screen === 'pause' || r.screen === 'done') {
    const rr = Object.entries(r.rects || {}).map(([k, v]) => `${k}=${v.css.join(',')}${v.over[0] > 0 || v.over[1] > 0 ? ' OVER' + v.over : ''}`);
    console.log(`DOM ${r.tag} ${r.screen} vp=${r.vw}x${r.vh} s=${r1(r.s)}: ` + rr.join('  '));
  }
  if (r.screen === 'talk') console.log(`TALK ${r.tag} panel=${r.panel.map(Math.round)} overflow=${r.overflow} choices=${JSON.stringify(r.choices)} q="${r.q}"`);
  if (r.screen === 'settings') console.log(`SET ${r.tag} panel=${r.panel.map(Math.round)} scroll=${r.scroll} clipped=${JSON.stringify(r.clipped)} small=${JSON.stringify(r.small)}`);
  if (r.screen === 'boostReady') console.log(`BOOST ${r.tag} btn=${JSON.stringify(r.btn)} rocket=${JSON.stringify(r.g.rocket)} wagon=${JSON.stringify(r.g.wagon)} s=${r.g.s}`);
}
