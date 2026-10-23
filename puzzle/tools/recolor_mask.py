# Turns a Blender render + mask (tools/blender_head.py) into the 5 piece colors, the same way the three.js
# renderer recolors: the color part takes the piece hue, the rest gets a soft tint, details stay as they are.
# usage: python3 recolor_mask.py <in_dir> <id> <src_root>  -> <src_root>/out/skin/<id>_<color>.png, out/chibi/<id>_orig.png
import sys, os, colorsys
import numpy as np
from PIL import Image
ind, cid, root = sys.argv[1:4]
SKIN = float(os.environ.get('SKIN', '0.38'))
HUES = {'red': 0.97, 'blue': 0.58, 'green': 0.36, 'yellow': 0.13, 'purple': 0.78}
col = np.asarray(Image.open(f'{ind}/{cid}_color.png').convert('RGBA')).astype(np.float32) / 255
mask = np.asarray(Image.open(f'{ind}/{cid}_mask.png').convert('RGBA')).astype(np.float32) / 255
hair = mask[..., 0] * mask[..., 3]
keep = mask[..., 1] * mask[..., 3]
rgb = col[..., :3]
mx = rgb.max(-1); mn = rgb.min(-1); v = mx
def hsv2rgb(h, s, v):
    i = np.floor(h * 6); f = h * 6 - i; p = v * (1 - s); q = v * (1 - f * s); t = v * (1 - (1 - f) * s)
    i = i.astype(int) % 6
    r = np.choose(i, [v, q, p, p, t, v]); g = np.choose(i, [t, v, v, q, p, p]); b = np.choose(i, [p, p, t, v, v, q])
    return np.stack([r, g, b], -1)
os.makedirs(f'{root}/out/skin', exist_ok=True); os.makedirs(f'{root}/out/chibi', exist_ok=True)
Image.fromarray((col * 255).astype(np.uint8)).save(f'{root}/out/chibi/{cid}_orig.png')
for k, h in HUES.items():
    sat = 0.8 if 0.1 < h < 0.2 else 0.72
    vv = np.clip(v, 0, 1)
    hcol = hsv2rgb(np.full_like(v, h), np.full_like(v, sat), 0.62 + 0.38 * vv)
    scol = hsv2rgb(np.full_like(v, h), np.full_like(v, SKIN), 0.66 + 0.34 * vv)
    skin_w = (1 - hair) * (1 - keep) * (vv > 0.3)
    out = rgb * (1 - hair[..., None] - skin_w[..., None]) + hcol * hair[..., None] + scol * skin_w[..., None]
    o = np.concatenate([np.clip(out, 0, 1), col[..., 3:]], -1)
    Image.fromarray((o * 255).astype(np.uint8)).save(f'{root}/out/skin/{cid}_{k}.png')
print('ok', cid)
