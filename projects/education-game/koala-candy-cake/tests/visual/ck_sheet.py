"""Contact sheet for the visual QA: python3 tests/visual/ck_sheet.py [--crop x0,y0,x1,y1] [--cols N] OUT.png H img1 img2 ...
Each image is scaled to height H and labelled; --crop (fractions) is applied first (inspect details at real size);
--cols N wraps the images into a grid of N columns (default: one row). JPEG output if OUT ends in .jpg."""
import sys
from PIL import Image, ImageDraw

args = sys.argv[1:]
crop, cols = None, 0
while args and args[0].startswith('--'):
    if args[0] == '--crop': crop = [float(v) for v in args[1].split(',')]
    elif args[0] == '--cols': cols = int(args[1])
    args = args[2:]
out, H, files = args[0], int(args[1]), args[2:]
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    k = H / im.size[1]
    ims.append((f.split('/')[-1].rsplit('.', 1)[0], im.resize((max(1, int(im.size[0] * k)), H), Image.LANCZOS)))
cols = cols or len(ims)
rows = [ims[i:i + cols] for i in range(0, len(ims), cols)]
W = max(sum(i.size[0] for _, i in r) + 8 * (len(r) + 1) for r in rows)
sheet = Image.new('RGB', (W, (H + 30) * len(rows)), (40, 40, 40))
d = ImageDraw.Draw(sheet)
for ri, r in enumerate(rows):
    x, y = 8, ri * (H + 30)
    for name, im in r:
        sheet.paste(im, (x, y + 26))
        d.text((x + 2, y + 6), name[-60:], fill=(255, 255, 255))
        x += im.size[0] + 8
if out.endswith('.jpg'): sheet.save(out, quality=82)
else: sheet.save(out)
