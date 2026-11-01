"""Stills post for Glitch renders: RGB split + scanlines (the runtime does these in-shader). Usage: python3 glitch_post.py in.png [...]"""
import sys, numpy as np
from PIL import Image
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape; d = max(2, w // 300)
    o = a.copy(); o[:, d:, 0] = a[:, :-d, 0]; o[:, :-d, 2] = a[:, d:, 2]
    o[::3] *= 0.82
    rng = np.random.default_rng(4)
    for _ in range(5):  # a few slipped bands
        y = rng.integers(0, h - 20); hh = rng.integers(4, 14); sh = rng.integers(-w // 60, w // 60)
        o[y:y + hh] = np.roll(o[y:y + hh], sh, axis=1)
    Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(p)
