# Build labelled contact sheets from numbered frames: python3 sheet.py prefix cols thumbW dt_ms
import sys, glob
from PIL import Image, ImageDraw
prefix, cols, tw, dt = sys.argv[1], int(sys.argv[2]), int(sys.argv[3]), float(sys.argv[4])
fs = sorted(glob.glob(prefix + '_[0-9][0-9].png'))
ims = [Image.open(f).convert('RGB') for f in fs]
w, h = ims[0].size; th = int(h * tw / w)
rows = (len(ims) + cols - 1) // cols
sh = Image.new('RGB', (cols * tw, rows * (th + 16)), (30, 30, 30))
d = ImageDraw.Draw(sh)
for i, im in enumerate(ims):
    x, y = (i % cols) * tw, (i // cols) * (th + 16)
    sh.paste(im.resize((tw, th), Image.LANCZOS), (x, y + 16))
    d.text((x + 4, y + 2), f'#{i}  t={i*dt:.0f}ms', fill=(255, 255, 0))
sh.save('sheet_' + prefix + '.png')
print('sheet_' + prefix + '.png', sh.size)
