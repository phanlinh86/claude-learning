"""Answer-colour contrast against the water / sand at every time of day, measured on the captured play screenshots.
   python3 -I tests/visual/contrast.py [shot-filter]
   Reads tests/out/visual/items.jsonl (written by capture.js): for every resting / buried item it samples the item's own
   pixels (inner disc) and a ring of background pixels just outside the item, and reports the WCAG luminance contrast
   ratio and the CIE76 ΔE between them. It also samples the plain water band (play area) and the sand strip at each time
   of day and rates all 6 palette fills against both. Flags: contrast < 1.5 or ΔE < 25 (weak), contrast < 1.25 (poor)."""
import json, os, sys
import numpy as np
from PIL import Image
OUT = os.path.join(os.path.dirname(__file__), '..', 'out', 'visual')
PAL = {'red': '#E84A4A', 'blue': '#3C8DE8', 'yellow': '#FFD23F', 'green': '#4CC26B', 'orange': '#FF9A2E', 'purple': '#9B6BE0', 'cream': '#FFF4DC', 'pearl': '#FBF6EC'}
flt = sys.argv[1] if len(sys.argv) > 1 else 'tod'

def hex2rgb(h): return np.array([int(h[i:i + 2], 16) for i in (1, 3, 5)]) / 255
def lin(c): c = np.asarray(c, float); return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lum(c): return float(lin(c) @ np.array([0.2126, 0.7152, 0.0722]))
def ratio(a, b): la, lb = lum(a), lum(b); return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)
def lab(c):
    X = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ lin(c) / np.array([0.95047, 1, 1.08883])
    f = np.where(X > 0.008856, np.cbrt(X), 7.787 * X + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])
def dE(a, b): return float(np.linalg.norm(lab(a) - lab(b)))
def ring(im, cx, cy, r0, r1):
    h, w = im.shape[:2]; y, x = np.ogrid[:h, :w]; d = (x - cx) ** 2 + (y - cy) ** 2
    m = (d >= r0 * r0) & (d <= r1 * r1); px = im[m]
    return px.mean(axis=0) / 255 if len(px) else None
def disc(im, cx, cy, r):
    h, w = im.shape[:2]; y, x = np.ogrid[:h, :w]; m = (x - cx) ** 2 + (y - cy) ** 2 <= r * r; px = im[m]
    return px.mean(axis=0) / 255 if len(px) else None

rows = [json.loads(l) for l in open(os.path.join(OUT, 'items.jsonl')) if l.strip()]
seen = set(); worst = []; bands = {}
print(f"{'shot':34s} {'item':18s} {'ratio':>6s} {'dE':>6s}  note")
for d in rows:
    if flt not in d['shot'] or d['shot'] in seen or not os.path.exists(d['file']): continue
    seen.add(d['shot'])
    im = np.asarray(Image.open(d['file']).convert('RGB')).astype(float); k = d['dpr']
    # water band: play area centre strip, away from items; sand strip: 20..50 css px below groundY
    P = d['play']; gy = d['groundY']
    if P:
        ys, ye = int((P['t'] + 10) * k), int((P['b'] - 10) * k); xs, xe = int((P['l'] + 10) * k), int((P['r'] - 10) * k)
        mask = np.ones((ye - ys, xe - xs), bool)
        for it in d['items']:
            cx, cy, r = it['cx'] * k - xs, it['cy'] * k - ys, it['size'] * k * 0.75
            yy, xx = np.ogrid[:ye - ys, :xe - xs]; mask &= (xx - cx) ** 2 + (yy - cy) ** 2 > r * r
        for m in d['mounds'] or []:
            mask[max(0, int(m['t'] * k) - ys - int(60 * k)):int(m['b'] * k) - ys, max(0, int(m['l'] * k) - xs):int(m['r'] * k) - xs] = False
        water = im[ys:ye, xs:xe][mask].mean(axis=0) / 255
        sand = im[int((gy + 20) * k):int((gy + 50) * k), xs:xe].reshape(-1, 3).mean(axis=0) / 255
        key = (d['level'], d['shot'].split('-')[0])
        bands.setdefault(key, {})[d['shot']] = (water, sand)
    for it in d['items']:
        if it['state'] not in ('idle', 'buried'): continue
        col = it['color'] or ('pearl' if it['sprite'] == 'pearl' else ('cream' if it['sprite'] == 'tag' else None))
        if not col: continue
        cx, cy, r = it['cx'] * k, it['cy'] * k, it['size'] * k / 2
        if it['state'] == 'buried': cy = cy - r * 0.35          # only the top of a buried item is visible
        inner = disc(im, cx, cy - (r * 0.25 if it['state'] == 'buried' else 0), r * 0.3)
        bg = ring(im, cx, cy, r * 1.12, r * 1.4)
        if inner is None or bg is None: continue
        pal = hex2rgb(PAL[col])
        rt, de = ratio(pal, bg), dE(pal, bg)
        note = 'POOR' if rt < 1.25 else ('weak' if rt < 1.5 or de < 25 else '')
        worst.append((rt, de, d['shot'], it['id'], col, note, bg))
        if note: print(f"{d['shot']:34s} {it['id'] + ' ' + col:18s} {rt:6.2f} {de:6.1f}  {note} bg=#{''.join('%02x' % int(v * 255) for v in bg)} item-pixels=#{''.join('%02x' % int(v * 255) for v in inner)}")
print('\nmeasured items:', len(worst), ' flagged:', sum(1 for w in worst if w[5]))
if worst:
    worst.sort()
    print('lowest 8 (ratio, dE, shot, item, colour):')
    for w in worst[:8]: print(f"  {w[0]:.2f} {w[1]:5.1f} {w[2]} {w[3]} {w[4]}")
print('\nPalette vs plain water / sand per time of day (WCAG ratio | dE):')
for (lv, dev), shots in sorted(bands.items(), key=lambda x: (x[0][1], x[0][0])):
    ws = np.mean([v[0] for v in shots.values()], axis=0); ss = np.mean([v[1] for v in shots.values()], axis=0)
    line = f"{dev:8s} level {lv} water=#{''.join('%02x' % int(v * 255) for v in ws)} sand=#{''.join('%02x' % int(v * 255) for v in ss)}: "
    for c in ['red', 'blue', 'yellow', 'green', 'orange', 'purple', 'cream']:
        p = hex2rgb(PAL[c]); rw, dw, rs, ds = ratio(p, ws), dE(p, ws), ratio(p, ss), dE(p, ss)
        flag = '!' if (rw < 1.5 and dw < 25) or (rs < 1.5 and ds < 25) else ' '
        line += f"{c[:3]} {rw:.2f}|{dw:.0f} {rs:.2f}|{ds:.0f}{flag}  "
    print(line)
