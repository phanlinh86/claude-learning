"""CIEDE76 distance between every pair of answer colours, normal vs deuteranopia vs protanopia.
   python3 -I tests/visual/palette_cvd.py"""
import numpy as np, itertools
P = {'red': '#E84A4A', 'blue': '#3C8DE8', 'yellow': '#FFD23F', 'green': '#4CC26B', 'orange': '#FF9A2E', 'purple': '#9B6BE0'}
M = {'normal': np.eye(3),
     'deut': np.array([[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]]),
     'prot': np.array([[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]])}
def lin(c): c = np.array([int(c[i:i+2], 16) for i in (1, 3, 5)]) / 255; return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)
def lab(l):
    X = np.array([[0.4124, 0.3576, 0.1805], [0.2126, 0.7152, 0.0722], [0.0193, 0.1192, 0.9505]]) @ l / np.array([0.95047, 1, 1.08883])
    f = np.where(X > 0.008856, np.cbrt(X), 7.787 * X + 16 / 116)
    return np.array([116 * f[1] - 16, 500 * (f[0] - f[1]), 200 * (f[1] - f[2])])
for a, b in itertools.combinations(P, 2):
    d = {k: np.linalg.norm(lab(np.clip(m @ lin(P[a]), 0, 1)) - lab(np.clip(m @ lin(P[b]), 0, 1))) for k, m in M.items()}
    flag = ' <-- weak' if min(d['deut'], d['prot']) < 20 else ''
    print(f"{a:7s}-{b:7s} normal {d['normal']:5.1f}  deut {d['deut']:5.1f}  prot {d['prot']:5.1f}{flag}")
