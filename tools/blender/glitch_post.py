"""Stills post for Glitch renders: light RGB split + faint scanlines (the runtime does these in-shader). Usage: python3 glitch_post.py in.png [...]"""
import sys, numpy as np
from PIL import Image
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.float32)
    h, w, _ = a.shape; d = max(1, w // 1000)   # v3c: light split
    o = a.copy(); o[:, d:, 0] = a[:, :-d, 0]; o[:, :-d, 2] = a[:, d:, 2]
    o[::3] *= 0.93
    rng = np.random.default_rng(4)
    for _ in range(2):  # one or two subtle slipped bands
        y = rng.integers(0, h - 20); hh = rng.integers(3, 8); sh = rng.integers(-w // 150, w // 150)
        o[y:y + hh] = np.roll(o[y:y + hh], sh, axis=1)
    Image.fromarray(np.clip(o, 0, 255).astype(np.uint8)).save(p)
