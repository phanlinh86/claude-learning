"""Deuteranopia / protanopia simulation (Machado 2009, severity 1.0, applied in linear RGB).
   python3 -I tests/visual/colorblind.py in.png ...   ->  writes *_deut.png / *_prot.png into tests/out/visual/cvd/"""
import sys, os
from PIL import Image
import numpy as np
M = {'deut': np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]),
     'prot': np.array([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]])}
out = os.path.join(os.path.dirname(__file__), '..', 'out', 'visual', 'cvd'); os.makedirs(out, exist_ok=True)
for f in sys.argv[1:]:
    im = np.asarray(Image.open(f).convert('RGB')).astype(np.float64) / 255
    lin = np.where(im <= 0.04045, im / 12.92, ((im + 0.055) / 1.055) ** 2.4)
    for k, m in M.items():
        s = np.clip(lin @ m.T, 0, 1)
        srgb = np.where(s <= 0.0031308, s * 12.92, 1.055 * s ** (1 / 2.4) - 0.055)
        Image.fromarray((srgb * 255).round().astype(np.uint8)).save(os.path.join(out, os.path.basename(f)[:-4] + '_' + k + '.png'))
