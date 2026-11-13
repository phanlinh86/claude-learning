// Shared helpers for the visual QA capture scripts: open a device page with emulated notch insets, in-page geometry.
const DEVS = {   // insets in CSS px [top, right, bottom, left]
  'ip-p': { vp: [393, 852], ins: [47, 0, 34, 0] }, 'ip-l': { vp: [852, 393], ins: [0, 47, 21, 47] },
  'pad-p': { vp: [820, 1180], ins: [24, 0, 20, 0] }, 'pad-l': { vp: [1180, 820], ins: [24, 0, 20, 0] }
};
async function open(browser, srv, dev, lang, age = 4, seed = 5, extra = '') {
  const d = DEVS[dev];
  const ctx = await browser.newContext({ viewport: { width: d.vp[0], height: d.vp[1] }, deviceScaleFactor: +(process.env.DPR || 1), isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  page._errs = []; page.on('pageerror', e => page._errs.push(String(e))); page.on('console', m => { if (m.type() === 'error') page._errs.push(m.text()); });
  await page.goto(srv.url + `?mute=1&novoice=1&seed=${seed}&age=${age}&lang=${lang}${extra}`);
  await page.waitForFunction(() => window.PB && PB.debug && PB.debug.mode === 'title', null, { timeout: 30000 });
  await page.addStyleTag({ content: `:root{--sa-t:${d.ins[0]}px!important;--sa-r:${d.ins[1]}px!important;--sa-b:${d.ins[2]}px!important;--sa-l:${d.ins[3]}px!important}` });
  await page.evaluate(() => window.dispatchEvent(new Event('resize'))); await new Promise(r => setTimeout(r, 450));
  return { ctx, page };
}
// runs in the page: logical-px geometry + a list of issues
function geom() {
  const w = PB.debug.world, L = w.layout, v = PB.debug.view(), iss = [];
  const vis = el => el && !el.classList.contains('hidden') && !el.closest('.hidden') && el.getBoundingClientRect().width > 0;
  const rectL = el => { if (!vis(el)) return null; const r = el.getBoundingClientRect(); return { x: (r.left - v.left) / v.s, y: (r.top - v.top) / v.s, w: r.width / v.s, h: r.height / v.s }; };
  const ovC = (c, b) => { if (!b) return 0; const nx = Math.max(b.x, Math.min(c.x, b.x + b.w)), ny = Math.max(b.y, Math.min(c.y, b.y + b.h)); return Math.max(0, c.r - Math.hypot(c.x - nx, c.y - ny)); };
  const hud = rectL(document.getElementById('hud')), sb = rectL(document.getElementById('bubble'));
  const out = { s: +v.s.toFixed(3), W: L.W, H: L.H, ins: L.ins, d: L.d, dCss: Math.round(L.d * v.s), thingCss: Math.round(L.thingSize * v.s), hitCss: Math.round(2 * L.hitR * v.s),
    bao: { hCss: Math.round(L.bao.h * v.s), box: L.bao.box }, rainbow: L.rainbow, sb, hud, phase: w.phase, state: w.state, topic: w.topic };
  if (sb && hud) { const o = Math.min(sb.x + sb.w, hud.x + hud.w) - Math.max(sb.x, hud.x), oy = Math.min(sb.y + sb.h, hud.y + hud.h) - Math.max(sb.y, hud.y); if (o > 0 && oy > 0) iss.push('speech bubble overlaps HUD'); }
  const b = document.getElementById('bubble'), bt = document.getElementById('bubbleText');
  if (vis(b)) { const over = bt.scrollHeight - b.clientHeight; out.sbFont = getComputedStyle(bt).fontSize; out.sbLines = Math.round(bt.getBoundingClientRect().height / parseFloat(getComputedStyle(bt).lineHeight || 20)); if (over > 2) iss.push('speech text overflows ' + over + 'px'); }
  const B = L.bao.box;
  for (const q of w.bubbles || []) {
    if (q.state !== 'float') continue;
    const c = { x: q.x, y: q.y, r: q.r };
    const a = ovC(c, sb), h = ovC(c, hud), bo = ovC(c, B);
    if (a > 2) iss.push(`bubble ${q.id} under speech bubble ${a | 0}px`);
    if (h > 2) iss.push(`bubble ${q.id} under HUD ${h | 0}px`);
    if (bo > 8) iss.push(`bubble ${q.id} over Bao ${bo | 0}px`);
    if (q.x - q.r < L.ins.left - 2 || q.x + q.r > L.W - L.ins.right + 2 || q.y - q.r < L.ins.top - 2 || q.y + q.r > L.H - L.ins.bottom + 2) iss.push(`bubble ${q.id} past safe edge (${q.x | 0},${q.y | 0} r${q.r | 0})`);
  }
  // pairwise bubble overlap
  const fl = (w.bubbles || []).filter(q => q.state === 'float');
  for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) { const dd = Math.hypot(fl[i].x - fl[j].x, fl[i].y - fl[j].y), o = fl[i].r + fl[j].r - dd; if (o > 6) iss.push(`bubbles ${fl[i].id}/${fl[j].id} overlap ${o | 0}px`); }
  // rainbow vs speech bubble / Bao / HUD
  const R = L.rainbow, rbTop = R.cy - R.r;
  out.rbTop = Math.round(rbTop); out.rbVisible = Math.round(Math.min(R.cy, L.H) - rbTop);
  if (sb && rbTop < sb.y + sb.h) iss.push(`rainbow top ${rbTop | 0} under speech bubble bottom ${(sb.y + sb.h) | 0}`);
  if (R.cx - R.r < B.x + B.w && R.cy > B.y) out.rbOverBaoX = Math.round(B.x + B.w - (R.cx - R.r));
  // DOM controls inside the safe area
  const sa = (() => { const cs = getComputedStyle(document.getElementById('safeProbe')); return { t: parseFloat(cs.paddingTop), r: parseFloat(cs.paddingRight), b: parseFloat(cs.paddingBottom), l: parseFloat(cs.paddingLeft) }; })();
  for (const el of document.querySelectorAll('button, .hud-stars, h1, h2, #bubble, .talk-panel, .done-panel, .panel')) {
    if (!vis(el)) continue; const r = el.getBoundingClientRect();
    if (r.top < sa.t - 1 || r.left < sa.l - 1 || r.right > innerWidth - sa.r + 1 || r.bottom > innerHeight - sa.b + 1)
      iss.push(`DOM ${el.id || el.className} outside safe area [${r.left | 0},${r.top | 0},${r.right | 0},${r.bottom | 0}]`);
    if (el.scrollWidth > el.clientWidth + 2 && el.tagName !== 'BUTTON') iss.push(`DOM ${el.id || el.className} h-overflow ${el.scrollWidth - el.clientWidth}`);
    if (el.tagName === 'BUTTON' && el.scrollWidth > el.clientWidth + 2) iss.push(`button ${el.id} text overflow ${el.scrollWidth - el.clientWidth}`);
  }
  out.iss = iss; return out;
}
module.exports = { DEVS, open, geom };
