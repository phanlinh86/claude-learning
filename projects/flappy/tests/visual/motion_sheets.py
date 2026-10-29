# Build contact sheets from tests/out/visual/frames (see motion.js)
import json, os, glob
from PIL import Image, ImageDraw
D = os.path.join(os.path.dirname(__file__), '..', 'out', 'visual')
F = os.path.join(D, 'frames')
meta = json.load(open(os.path.join(F, 'meta.json')))

def sheet(name, crop_fn, cols, out, scale=1.0, idx=None, label=True):
    files = sorted(glob.glob(os.path.join(F, name + '_*.png')))
    if idx: files = [files[i] for i in idx if i < len(files)]
    tiles = []
    for i, f in enumerate(files):
        k = int(f[-6:-4])
        im = Image.open(f)
        box = crop_fn(k)
        t = im.crop(box)
        if scale != 1: t = t.resize((int(t.width * scale), int(t.height * scale)), Image.LANCZOS)
        if label:
            d = ImageDraw.Draw(t); d.rectangle((0, 0, 26, 14), fill='black'); d.text((2, 1), str(k), fill='white')
        tiles.append(t)
    w, h = tiles[0].size
    rows = (len(tiles) + cols - 1) // cols
    S = Image.new('RGB', (w * cols + (cols - 1) * 2, h * rows + (rows - 1) * 2), 'black')
    for i, t in enumerate(tiles): S.paste(t, ((i % cols) * (w + 2), (i // cols) * (h + 2)))
    S.save(os.path.join(D, out)); print(out, S.size)

def around(x, y, w, h):
    x0 = int(max(0, min(960 - w, x - w / 2))); y0 = int(max(0, min(540 - h, y - h / 2)))
    return (x0, y0, x0 + w, y0 + h)

# flap: fixed box around bird column (absolute position keeps vertical motion visible)
sheet('flap', lambda k: (180, 120, 340, 340), 15, 'motion_flap.png', 1.0)
sheet('fall', lambda k: (180, 160, 340, 480), 10, 'motion_fall.png', 1.0)
# hit: follow the hit point: frame of hit
def evbox(name, key):
    m = meta[name]
    k0 = next(i for i in range(1, len(m)) if m[i][key] != m[0][key])
    return m, k0
m, k0 = evbox('hit', 'hits')
# locate turtle nearest the bird at hit
bx = m[k0]['bird']['x']
tx = min(m[k0]['turtles'], key=lambda t: abs(t['x'] - bx))['x']
sheet('hit', lambda k: around(tx - (m[k]['turtles'][0]['x'] - m[k0]['turtles'][0]['x']) * 0, 330, 300, 220), 7, 'motion_hit.png', 0.9)
m2, k2 = evbox('hitw', 'hits'); bx2 = m2[k2]['bird']['x']
tx2 = min(m2[k2]['turtles'], key=lambda t: abs(t['x'] - bx2))['x']
sheet('hitw', lambda k: around(tx2, 330, 300, 220), 6, 'motion_hit_winter.png', 0.9)
mm = meta['miss']; km = next(i for i in range(1, len(mm)) if mm[i]['misses'] != mm[0]['misses'])
# find landed drop at km
ld = [d for d in mm[km]['drops'] if d['landed']]
mx = ld[-1]['x'] if ld else 300
sheet('miss', lambda k: around(mx, 420, 260, 220), 7, 'motion_miss.png', 0.9)
md = meta['death']
sheet('death', lambda k: around(md[k]['bird']['x'], 380, 300, 300), 10, 'motion_death.png', 0.6, idx=list(range(0, 50, 2)))
# walking turtle: follow first turtle visible
mw = meta['walk']
tv = [t for t in mw[0]['turtles'] if 80 < t['x'] < 880]
ti = mw[0]['turtles'].index(tv[0]) if tv else 0
sheet('walk', lambda k: around(mw[k]['turtles'][ti]['x'], 440, 180, 120), 8, 'motion_turtle_walk.png', 1.0)
for s in ['autumn', 'winter', 'summer']:
    sheet('parallax_' + s, lambda k: (0, 0, 960, 540), 4, f'motion_parallax_{s}.png', 0.5, idx=list(range(0, 24, 3)))
