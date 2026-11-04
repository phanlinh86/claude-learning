"""Contact sheet for the visual QA: python3 tests/visual/jt_sheet.py OUT.png H img1 img2 ...  (each scaled to height H, labelled)
Also: --crop x0,y0,x1,y1 (fractions) applied to every image before scaling, to inspect details at real size."""
import sys
from PIL import Image, ImageDraw

args = sys.argv[1:]
crop = None
if args and args[0] == '--crop':
    crop = [float(v) for v in args[1].split(',')]
    args = args[2:]
out, H, files = args[0], int(args[1]), args[2:]
ims = []
for f in files:
    im = Image.open(f).convert('RGB')
    if crop:
        w, h = im.size
        im = im.crop((int(crop[0] * w), int(crop[1] * h), int(crop[2] * w), int(crop[3] * h)))
    k = H / im.size[1]
    ims.append((f.split('/')[-1].replace('.png', ''), im.resize((max(1, int(im.size[0] * k)), H), Image.LANCZOS)))
W = sum(i.size[0] for _, i in ims) + 8 * (len(ims) + 1)
sheet = Image.new('RGB', (W, H + 30), (40, 40, 40))
d = ImageDraw.Draw(sheet)
x = 8
for name, im in ims:
    sheet.paste(im, (x, 26))
    d.text((x + 2, 6), name[-48:], fill=(255, 255, 255))
    x += im.size[0] + 8
sheet.save(out)
