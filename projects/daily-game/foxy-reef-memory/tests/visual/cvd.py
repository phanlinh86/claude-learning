# Colour-vision-deficiency simulation (Machado et al. 2009, severity 1.0) of the in-game face set.
import numpy as np, sys
from PIL import Image
M = {
 'protan': [[0.152286,1.052583,-0.204868],[0.114503,0.786281,0.099216],[-0.003882,-0.048116,1.051998]],
 'deutan': [[0.367322,0.860646,-0.227968],[0.280085,0.672501,0.047413],[-0.011820,0.042940,0.968881]],
 'tritan': [[1.255528,-0.076749,-0.178779],[-0.078411,0.930809,0.147602],[0.004733,0.691367,0.303900]],
}
src = Image.open(sys.argv[1]).convert('RGB').crop(tuple(map(int, sys.argv[2].split(','))))
a = np.asarray(src).astype(float) / 255
lin = np.where(a <= 0.04045, a / 12.92, ((a + 0.055) / 1.055) ** 2.4)
outs = [src]
for k, m in M.items():
    l = np.clip(lin @ np.array(m).T, 0, 1)
    s = np.where(l <= 0.0031308, l * 12.92, 1.055 * l ** (1 / 2.4) - 0.055)
    outs.append(Image.fromarray((s * 255).astype('uint8')))
outs.append(src.convert('L').convert('RGB'))
w, h = src.size
sheet = Image.new('RGB', (w * 2, h * 3), 'white')
for i, im in enumerate(outs): sheet.paste(im, ((i % 2) * w, (i // 2) * h))
sheet.save(sys.argv[3])
