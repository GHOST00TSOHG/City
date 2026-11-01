# Generates public/textures/water-normal.png: a tileable 256x256 wave normal map (our own, CC0).
# Height = sum of random integer-wavenumber waves (so it tiles), mostly travelling one way; normals from its gradient.
import numpy as np
from PIL import Image
N = 256; rng = np.random.default_rng(7)
y, x = np.mgrid[0:N, 0:N] / N
h = np.zeros((N, N)); gx = np.zeros((N, N)); gy = np.zeros((N, N))
for _ in range(90):
    k = rng.integers(1, 24); ang = rng.normal(0.0, 0.7)
    kx, ky = np.round(k * np.cos(ang)), np.round(k * np.sin(ang))
    if kx == 0 and ky == 0: continue
    a = 1.0 / (kx * kx + ky * ky) ** 0.9; ph = rng.uniform(0, 2 * np.pi)
    s = 2 * np.pi * (kx * x + ky * y) + ph
    gx += -a * 2 * np.pi * kx * np.sin(s); gy += -a * 2 * np.pi * ky * np.sin(s)
g = 1.0 / np.percentile(np.abs(np.concatenate([gx, gy])), 98) * 0.9
n = np.dstack([-gx * g, -gy * g, np.ones((N, N))]); n /= np.linalg.norm(n, axis=2, keepdims=True)
Image.fromarray(((n * 0.5 + 0.5) * 255).astype(np.uint8)).save('public/textures/water-normal.png', optimize=True)
