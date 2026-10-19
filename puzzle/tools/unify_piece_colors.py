# Brings every character's piece colors to the same (deeper) saturation/brightness so no character
# reads paler than another. Run on public/assets/pieces/*.webp strips (5 cells per row).
import sys, glob
import numpy as np
from PIL import Image
import matplotlib.colors as mc
TS, TV = 0.64, 0.77
CELL = 320
for f in sorted(glob.glob(sys.argv[1] if len(sys.argv) > 1 else '*.webp')):
    if 'portrait' in f: continue
    a = np.array(Image.open(f).convert('RGBA')).astype(float) / 255
    for c in range(a.shape[1] // CELL):
        cell = a[:, c * CELL:(c + 1) * CELL]
        hsv = mc.rgb_to_hsv(cell[:, :, :3])
        m = (cell[:, :, 3] > 0.6) & (hsv[:, :, 2] > 0.3)
        ks = TS / max(1e-3, hsv[:, :, 1][m].mean())
        kv = TV / max(1e-3, hsv[:, :, 2][m].mean())
        if ks <= 1.02 and kv >= 0.98: continue
        ks = max(1.0, ks); kv = min(1.0, kv)
        s2 = np.clip(hsv[:, :, 1] * ks, 0, 1); v2 = np.clip(hsv[:, :, 2] * kv, 0, 1)
        out = mc.hsv_to_rgb(np.dstack([hsv[:, :, 0], np.where(m, s2, hsv[:, :, 1]), np.where(m, v2, hsv[:, :, 2])]))
        cell[:, :, :3] = out
    Image.fromarray((np.clip(a, 0, 1) * 255).astype(np.uint8)).save(f, quality=90, method=6)
    print('ok', f)
