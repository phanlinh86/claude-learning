# Measures WCAG contrast of the answer colour (as rendered) against the bubble film over each season's sky.
#   python3 tests/qa/contrast.py ip-p 2      (device tag, DPR used by visual_contrast.js)
import json, sys, statistics
from PIL import Image
dev, dpr = sys.argv[1], float(sys.argv[2])
D = 'tests/out/qa_visual/contrast/'
B = json.load(open(D + dev + '-bubbles.json'))
def lum(c):
    def f(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = c[:3]; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
def cr(a, b):
    la, lb = sorted([lum(a), lum(b)], reverse=True); return (la + 0.05) / (lb + 0.05)
PAL = {'red': ('E84A4A', 'A8282E'), 'blue': ('3C8DE8', '1F5BA8'), 'yellow': ('FFD23F', 'C99A12'), 'green': ('4CC26B', '2A8343'),
       'orange': ('FF9A2E', 'C4650C'), 'purple': ('8E44AD', '6840A8'), 'pink': ('FF8FC0', 'C9558A')}
hx = lambda h: tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))
imgs = {}; rows = {}
SEAS = ['spring', 'summer', 'autumn', 'winter']
for b in B:
    im = imgs.setdefault(b['file'], Image.open(D + b['file']).convert('RGB'))
    cx, cy, r, ts = b['x'] * dpr, b['y'] * dpr, b['r'] * dpr, b['ts'] * dpr
    if cy - r < 0 or cy + r > im.height: continue
    ring = []
    import math
    for k in range(72):
        a = k / 72 * 2 * math.pi
        for f in (0.62, 0.7, 0.78):
            x, y = int(cx + math.cos(a) * r * f), int(cy + math.sin(a) * r * f)
            if 0 <= x < im.width and 0 <= y < im.height: ring.append(im.getpixel((x, y)))
    bg = tuple(int(statistics.median(p[i] for p in ring)) for i in range(3))
    ins = [im.getpixel((int(cx + dx), int(cy + dy))) for dx in range(int(ts * .05), int(ts * .2), 2) for dy in range(int(ts * .05), int(ts * .2), 2)]
    th = tuple(int(statistics.median(p[i] for p in ins)) for i in range(3))
    base, dark = hx(PAL[b['color']][0]), hx(PAL[b['color']][1])
    rows.setdefault((b['season'], b['color']), []).append((cr(th, bg), cr(dark, bg), bg, th, cr(th, base)))
print('season  colour   fill/bg  outline/bg  bg        rendered  (render vs base hex)')
for (s, c), v in sorted(rows.items()):
    m = min(v, key=lambda t: t[0])
    print(f'{SEAS[s]:7} {c:7} {m[0]:6.2f}   {m[1]:6.2f}     #{m[2][0]:02X}{m[2][1]:02X}{m[2][2]:02X}  #{m[3][0]:02X}{m[3][1]:02X}{m[3][2]:02X}   {m[4]:.2f}')
