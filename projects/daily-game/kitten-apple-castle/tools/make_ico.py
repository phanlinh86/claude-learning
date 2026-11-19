"""Pack icon_<size>.png files into a multi-resolution Windows .ico.  usage: python make_ico.py pngDir out.ico"""
import sys, os
from PIL import Image

src, out = sys.argv[1], sys.argv[2]
sizes = [16, 20, 24, 32, 40, 48, 64, 128, 256]
imgs = [Image.open(os.path.join(src, f"icon_{s}.png")).convert("RGBA") for s in sizes]
# Pillow writes one entry per requested size from the largest image; supply hand-rendered ones for crispness
imgs[-1].save(out, format="ICO", sizes=[(s, s) for s in sizes], append_images=imgs[:-1])
print("wrote", out)
