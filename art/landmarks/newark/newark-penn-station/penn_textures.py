"""Procedural textures for the Newark Penn Station model. Original work, no photos.

Atlas layout and per-region world scale are defined in build_penn.py (REGIONS, TILE).
Everything is painted at a fixed pixels-per-metre per region so geometry can tile it in
world units (see build_penn.tpoly). Needs numpy and Pillow, nothing else.
"""

from __future__ import annotations

import math
import os

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

ATLAS = 2048
GLASS = 1024


def pnoise(h, w, cy, cx, seed):
    """Periodic value noise, so painted regions tile without seams."""
    rng = np.random.default_rng(seed)
    g = rng.random((cy, cx))
    ys = np.linspace(0, cy, h, endpoint=False)
    xs = np.linspace(0, cx, w, endpoint=False)
    y0 = np.floor(ys).astype(int)
    x0 = np.floor(xs).astype(int)
    fy = ys - y0
    fx = xs - x0
    fy = fy * fy * (3 - 2 * fy)
    fx = fx * fx * (3 - 2 * fx)
    y1 = (y0 + 1) % cy
    x1 = (x0 + 1) % cx
    y0 = y0 % cy
    x0 = x0 % cx
    a = g[y0][:, x0]
    b = g[y0][:, x1]
    c = g[y1][:, x0]
    d = g[y1][:, x1]
    top = a * (1 - fx) + b * fx
    bot = c * (1 - fx) + d * fx
    return top * (1 - fy[:, None]) + bot * fy[:, None]


def fbm(h, w, seed, base=4, octaves=4):
    out = np.zeros((h, w))
    amp = 1.0
    tot = 0.0
    for o in range(octaves):
        n = base * (2 ** o)
        out += amp * pnoise(h, w, n, n, seed + o * 17)
        tot += amp
        amp *= 0.5
    return out / tot


def _blank(h, w, rgb):
    return np.ones((h, w, 3)) * np.array(rgb, dtype=float)


def paint_limestone(h, w, seed=1):
    # 10 courses by 5 blocks, 1.28 m by 0.64 m at 160 px/m.
    rows, cols = 10, 5
    ch, cw = h / rows, w / cols
    yy, xx = np.mgrid[0:h, 0:w]
    row = np.floor(yy / ch).astype(int)
    off = (row % 2) * (cw / 2.0)
    xo = (xx + off) % w
    col = np.floor(xo / cw).astype(int)
    rng = np.random.default_rng(seed)
    tone_tab = 1.0 + (rng.random((rows, cols)) - 0.5) * 0.10
    tone = tone_tab[row % rows, col % cols]
    weather = 1.0 + (fbm(h, w, seed + 5, 3, 4) - 0.5) * 0.12
    grain = 1.0 + (pnoise(h, w, h // 3, w // 3, seed + 9) - 0.5) * 0.05
    rgb = _blank(h, w, (194, 186, 172)) * (tone * weather * grain)[..., None]
    jy = (yy % ch) < 2.6
    jx = (xo % cw) < 2.6
    joint = jy | jx
    rgb[joint] = rgb[joint] * 0.78
    height = np.where(joint, 0.28, 0.58) + (fbm(h, w, seed + 3, 8, 3) - 0.5) * 0.10
    rough = np.full((h, w), 0.50) + (fbm(h, w, seed + 4, 6, 2) - 0.5) * 0.14
    ao = np.where(joint, 0.72, 1.0)
    return rgb, height, rough, np.zeros((h, w)), ao


def paint_granite(h, w, seed=2):
    # Polished pink granite, panels 1.6 m by 0.8 m at 160 px/m.
    rng = np.random.default_rng(seed)
    pw, ph = w / 2.0, h / 8.0
    yy, xx = np.mgrid[0:h, 0:w]
    row = (yy // ph).astype(int)
    col = (xx // pw).astype(int)
    tone_tab = 1.0 + (rng.random((8, 2)) - 0.5) * 0.14
    tone = tone_tab[row % 8, col % 2]
    veil = 1.0 + (fbm(h, w, seed + 1, 4, 4) - 0.5) * 0.16
    rgb = _blank(h, w, (178, 130, 122)) * (tone * veil)[..., None]
    speck = rng.random((h, w))
    rgb[speck > 0.985] = (236, 208, 196)
    rgb[speck < 0.010] = (104, 70, 68)
    rgb[(speck > 0.60) & (speck < 0.64)] *= 1.06
    joint = ((yy % ph) < 2.4) | ((xx % pw) < 2.4)
    rgb[joint] *= 0.70
    height = np.where(joint, 0.30, 0.55)
    rough = np.where(joint, 0.55, 0.30) + (fbm(h, w, seed + 2, 6, 2) - 0.5) * 0.08
    ao = np.where(joint, 0.75, 1.0)
    return rgb, height, rough, np.zeros((h, w)), ao


def paint_brick(h, w, seed=3):
    # Running bond at 133 px/m: 16 bricks across 3.84 m (0.24 m), 86 courses over 7.68 m (0.089 m).
    rng = np.random.default_rng(seed)
    nx, ny = 16, 86
    bw, bh = w / nx, h / ny
    yy, xx = np.mgrid[0:h, 0:w]
    row = (yy // bh).astype(int)
    off = (row % 2) * (bw / 2.0)
    xo = (xx + off) % w
    col = (xo // bw).astype(int)
    tone_tab = 1.0 + (rng.random((ny, nx)) - 0.5) * 0.20
    tint_tab = (rng.random((ny, nx)) - 0.5)
    tone = tone_tab[row % ny, col % nx]
    tint = tint_tab[row % ny, col % nx]
    base = np.array([192, 164, 126], dtype=float)
    rgb = _blank(h, w, base) * tone[..., None]
    rgb[..., 0] += tint * 14
    rgb[..., 2] -= tint * 10
    rgb *= (1.0 + (fbm(h, w, seed + 2, 6, 3) - 0.5) * 0.10)[..., None]
    mortar = ((yy % bh) < 1.6) | ((xo % bw) < 1.8)
    rgb[mortar] = np.array([168, 158, 142]) * (0.94 + 0.1 * pnoise(h, w, h // 2, w // 2, seed + 7)[mortar])[:, None]
    height = np.where(mortar, 0.22, 0.62) + (pnoise(h, w, h // 2, w // 2, seed + 8) - 0.5) * 0.12
    rough = np.where(mortar, 0.92, 0.80)
    ao = np.where(mortar, 0.70, 1.0)
    return rgb, height, rough, np.zeros((h, w)), ao


def paint_terracotta(h, w, seed=4):
    # Glazed green tiles, 0.4 m square at 160 px/m, each with a stepped lozenge.
    rng = np.random.default_rng(seed)
    n = 8
    tw, th = w / n, h / n
    yy, xx = np.mgrid[0:h, 0:w]
    ti = (yy // th).astype(int)
    tj = (xx // tw).astype(int)
    tone_tab = 1.0 + (rng.random((n, n)) - 0.5) * 0.16
    tone = tone_tab[ti % n, tj % n]
    rgb = _blank(h, w, (68, 112, 94)) * tone[..., None]
    u = ((xx % tw) / tw) - 0.5
    v = ((yy % th) / th) - 0.5
    dist = np.abs(u) + np.abs(v)
    ring = (dist > 0.30) & (dist < 0.38)
    core = dist < 0.16
    rgb[ring] = rgb[ring] * 1.28
    rgb[core] = rgb[core] * 0.82
    joint = ((yy % th) < 2.6) | ((xx % tw) < 2.6)
    rgb[joint] = np.array([46, 70, 62])
    height = np.where(joint, 0.2, 0.55 + 0.18 * ring + 0.10 * core)
    rough = np.where(joint, 0.8, 0.22)
    ao = np.where(joint, 0.7, 1.0)
    return rgb, height, rough, np.zeros((h, w)), ao


def paint_aluminum(h, w, seed=5):
    streak = pnoise(h, w, 96, 3, seed)
    rgb = _blank(h, w, (198, 202, 206)) * (0.92 + 0.14 * streak)[..., None]
    height = 0.5 + 0.08 * streak
    rough = 0.48 + 0.10 * streak
    return rgb, height, rough, np.full((h, w), 0.30), np.ones((h, w))


def paint_roof(h, w, seed=6):
    rgb = _blank(h, w, (76, 74, 72)) * (0.86 + 0.28 * pnoise(h, w, h // 2, w // 2, seed))[..., None]
    rgb *= (0.92 + 0.16 * fbm(h, w, seed + 1, 4, 3))[..., None]
    yy, xx = np.mgrid[0:h, 0:w]
    seam = ((yy % (h / 4.0)) < 2.5) | ((xx % (w / 4.0)) < 2.5)
    rgb[seam] *= 0.62
    height = np.where(seam, 0.30, 0.55) + 0.1 * pnoise(h, w, h // 2, w // 2, seed + 3)
    return rgb, height, np.full((h, w), 0.90), np.zeros((h, w)), np.where(seam, 0.7, 1.0)


def paint_dark(h, w, seed=7):
    rgb = _blank(h, w, (46, 44, 42)) * (0.85 + 0.30 * fbm(h, w, seed, 6, 3))[..., None]
    return rgb, np.full((h, w), 0.5), np.full((h, w), 0.92), np.zeros((h, w)), np.ones((h, w))


def paint_cornice(h, w, seed=8):
    yy, xx = np.mgrid[0:h, 0:w]
    rgb = _blank(h, w, (212, 204, 192)) * (0.95 + 0.08 * pnoise(h, w, 24, 4, seed))[..., None]
    rgb *= (0.96 + 0.08 * fbm(h, w, seed + 1, 3, 3))[..., None]
    joint = (xx % (w / 4.0)) < 2.2
    rgb[joint] *= 0.80
    height = np.where(joint, 0.3, 0.58)
    return rgb, height, np.full((h, w), 0.52), np.zeros((h, w)), np.where(joint, 0.8, 1.0)


def paint_frieze(h, w, seed=9):
    """Meander (Greek key) band. Tile is 2.02 m by 0.98 m, eight keys across."""
    img = Image.new("RGB", (w, h), (182, 174, 160))
    hmap = Image.new("L", (w, h), 150)
    d = ImageDraw.Draw(img)
    dh = ImageDraw.Draw(hmap)
    cell = w / 5.0
    lw = max(5, int(h * 0.075))
    ink = (112, 100, 84)
    pad = int(h * 0.10)
    bandt, bandb = pad, h - pad
    for k in range(5):
        x0 = k * cell
        sx = lambda t: x0 + t * cell
        sy = lambda t: bandt + t * (bandb - bandt)
        path = [(0.06, 1.0), (0.06, 0.0), (0.94, 0.0), (0.94, 0.70), (0.34, 0.70), (0.34, 0.34), (0.66, 0.34), (0.66, 0.52)]
        pts = [(sx(a), sy(b)) for a, b in path]
        d.line(pts, fill=ink, width=lw, joint="curve")
        dh.line(pts, fill=70, width=lw, joint="curve")
    d.rectangle([0, 0, w, int(pad * 0.55)], fill=ink)
    d.rectangle([0, h - int(pad * 0.55), w, h], fill=ink)
    dh.rectangle([0, 0, w, int(pad * 0.55)], fill=70)
    dh.rectangle([0, h - int(pad * 0.55), w, h], fill=70)
    rgb = np.asarray(img, dtype=float) * (0.94 + 0.10 * fbm(h, w, seed, 6, 3))[..., None]
    height = np.asarray(hmap, dtype=float) / 255.0
    return rgb, height, np.full((h, w), 0.55), np.zeros((h, w)), np.where(height < 0.4, 0.8, 1.0)


FONT = {
    "A": ["01110", "10001", "10001", "11111", "10001", "10001", "10001"],
    "E": ["11111", "10000", "10000", "11110", "10000", "10000", "11111"],
    "I": ["11111", "00100", "00100", "00100", "00100", "00100", "11111"],
    "K": ["10001", "10010", "10100", "11000", "10100", "10010", "10001"],
    "N": ["10001", "11001", "10101", "10011", "10001", "10001", "10001"],
    "O": ["01110", "10001", "10001", "10001", "10001", "10001", "01110"],
    "P": ["11110", "10001", "10001", "11110", "10000", "10000", "10000"],
    "R": ["11110", "10001", "10001", "11110", "10100", "10010", "10001"],
    "S": ["01111", "10000", "10000", "01110", "00001", "00001", "11110"],
    "T": ["11111", "00100", "00100", "00100", "00100", "00100", "00100"],
    "W": ["10001", "10001", "10001", "10101", "10101", "01010", "01010"],
    " ": ["00000", "00000", "00000", "00000", "00000", "00000", "00000"],
}


def paint_sign(h, w, text="NEWARK PENN STATION", seed=10):
    """Block-letter station name in an original alphabet. Whole region maps to the sign."""
    img = Image.new("RGB", (w, h), (176, 150, 120))
    hmap = Image.new("L", (w, h), 140)
    d = ImageDraw.Draw(img)
    dh = ImageDraw.Draw(hmap)
    rows, cols, gap = 7, 5, 1
    glyphs = [FONT[c] for c in text]
    units = len(glyphs) * cols + (len(glyphs) - 1) * gap
    scale = max(1, min((w - 28) // units, (h - 18) // rows))
    bw, bh = units * scale, rows * scale
    ox, oy = (w - bw) // 2, (h - bh) // 2
    cur = 0
    for g in glyphs:
        for r in range(rows):
            for c in range(cols):
                if g[r][c] == "1":
                    px, py = ox + (cur + c) * scale, oy + r * scale
                    d.rectangle([px, py, px + scale - 1, py + scale - 1], fill=(48, 38, 30))
                    dh.rectangle([px, py, px + scale - 1, py + scale - 1], fill=220)
        cur += cols + gap
    d.rectangle([2, 2, w - 3, h - 3], outline=(98, 80, 62), width=3)
    rgb = np.asarray(img, dtype=float) * (0.95 + 0.08 * fbm(h, w, seed, 6, 3))[..., None]
    height = np.asarray(hmap, dtype=float) / 255.0
    return rgb, height, np.full((h, w), 0.5), np.zeros((h, w)), np.ones((h, w))


def paint_clock(h, w, seed=11):
    img = Image.new("RGB", (w, h), (186, 178, 164))
    d = ImageDraw.Draw(img)
    cx, cy = w // 2, h // 2
    rad = min(w, h) // 2 - 4
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(150, 126, 84), outline=(70, 58, 44), width=4)
    r2 = int(rad * 0.84)
    d.ellipse([cx - r2, cy - r2, cx + r2, cy + r2], fill=(232, 222, 202), outline=(58, 50, 44), width=3)
    for i in range(12):
        a = math.radians(i * 30 - 90)
        r_in = r2 - (14 if i % 3 == 0 else 8)
        d.line([(cx + math.cos(a) * r_in, cy + math.sin(a) * r_in), (cx + math.cos(a) * (r2 - 3), cy + math.sin(a) * (r2 - 3))], fill=(48, 42, 38), width=4 if i % 3 == 0 else 2)
    d.line([(cx, cy), (cx, cy - int(r2 * 0.52))], fill=(40, 36, 32), width=5)
    d.line([(cx, cy), (cx + int(r2 * 0.34), cy + int(r2 * 0.10))], fill=(40, 36, 32), width=4)
    d.ellipse([cx - 4, cy - 4, cx + 4, cy + 4], fill=(40, 36, 32))
    rgb = np.asarray(img, dtype=float)
    return rgb, np.full((h, w), 0.55), np.full((h, w), 0.5), np.zeros((h, w)), np.ones((h, w))


def paint_sun(h, w, seed=12):
    img = Image.new("RGB", (w, h), (186, 178, 164))
    d = ImageDraw.Draw(img)
    cx, cy = w // 2, h // 2
    rad = min(w, h) // 2 - 4
    d.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(168, 134, 82), outline=(80, 60, 40), width=4)
    for i in range(16):
        a = math.radians(i * 22.5)
        r0, r1 = rad * 0.44, rad * (0.92 if i % 2 == 0 else 0.74)
        d.line([(cx + math.cos(a) * r0, cy + math.sin(a) * r0), (cx + math.cos(a) * r1, cy + math.sin(a) * r1)], fill=(110, 74, 40), width=6)
    d.ellipse([cx - int(rad * 0.36), cy - int(rad * 0.36), cx + int(rad * 0.36), cy + int(rad * 0.36)], fill=(226, 192, 116), outline=(96, 68, 38), width=4)
    rgb = np.asarray(img, dtype=float)
    return rgb, np.full((h, w), 0.55), np.full((h, w), 0.5), np.zeros((h, w)), np.ones((h, w))


def _height_to_normal(height, strength=2.6):
    gy, gx = np.gradient(height)
    nx, ny, nz = -gx * strength * 8.0, gy * strength * 8.0, np.ones_like(height)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    out = np.stack([(nx / ln) * 0.5 + 0.5, (ny / ln) * 0.5 + 0.5, (nz / ln) * 0.5 + 0.5], axis=-1)
    return (out * 255).clip(0, 255).astype(np.uint8)


def build_atlas(folder, regions):
    """regions: dict name -> (u, v, w, h) in UV space, v is the bottom of the rectangle."""
    os.makedirs(folder, exist_ok=True)
    size = ATLAS
    base = np.zeros((size, size, 3))
    height = np.full((size, size), 0.5)
    rough = np.full((size, size), 0.6)
    metal = np.zeros((size, size))
    ao = np.ones((size, size))

    def rect(r):
        u, v, w, h = r
        x0, x1 = int(round(u * size)), int(round((u + w) * size))
        y0, y1 = int(round((1.0 - (v + h)) * size)), int(round((1.0 - v) * size))
        return x0, y0, x1, y1

    painters = {
        "LIM": paint_limestone, "GRN": paint_granite, "BRK": paint_brick, "TC": paint_terracotta,
        "ALU": paint_aluminum, "RF": paint_roof, "DK": paint_dark, "COP": paint_cornice,
        "ORN": paint_frieze, "CLK": paint_clock, "SUN": paint_sun, "SGN": paint_sign,
    }
    for name, fn in painters.items():
        x0, y0, x1, y1 = rect(regions[name])
        rgb, hh, rr, mm, aa = fn(y1 - y0, x1 - x0)
        base[y0:y1, x0:x1] = rgb
        height[y0:y1, x0:x1] = hh
        rough[y0:y1, x0:x1] = rr
        metal[y0:y1, x0:x1] = mm
        ao[y0:y1, x0:x1] = aa

    # Atlas-wide soft grime near the bottom of each tile is NOT painted: tiles repeat, so the
    # variation here has to be periodic. Dirt and weathering come from the lighting instead.
    base_img = Image.fromarray(base.clip(0, 255).astype(np.uint8), "RGB")
    base_img.save(os.path.join(folder, "main-basecolor.png"), "PNG", optimize=True)
    normal = Image.fromarray(_height_to_normal(height), "RGB")
    normal.save(os.path.join(folder, "main-normal.png"), "PNG", optimize=True)
    orm = np.stack([ao, rough, metal], axis=-1)
    Image.fromarray((orm * 255).clip(0, 255).astype(np.uint8), "RGB").save(os.path.join(folder, "main-orm.png"), "PNG", optimize=True)


def _pane(w, h, glow_top, glow_bot, frame=(26, 32, 36), lit=True, mull=None, seed=0):
    """One lit window cell. Frame stays dark, glass glows warm. Used as base colour and emissive."""
    img = np.zeros((h, w, 3))
    img[:] = frame
    m = max(8, w // 9)
    t = np.linspace(0, 1, h - 2 * m)[:, None]
    top = np.array(glow_top, dtype=float)
    bot = np.array(glow_bot, dtype=float)
    inner = top[None, None, :] * (1 - t[..., None]) + bot[None, None, :] * t[..., None]
    inner = np.broadcast_to(inner, (h - 2 * m, w - 2 * m, 3)).copy()
    xx = np.linspace(-1, 1, w - 2 * m)[None, :]
    vign = 1.0 - 0.16 * (xx ** 2)
    inner *= vign[..., None]
    if lit:
        # soft ceiling light spill and a faint horizon line of interior
        inner[: (h - 2 * m) // 5] *= 1.10
    img[m:h - m, m:w - m] = inner
    out = Image.fromarray(img.clip(0, 255).astype(np.uint8), "RGB")
    d = ImageDraw.Draw(out)
    if mull:
        for tt in mull:
            y = int(h * tt)
            d.line([(m, y), (w - m, y)], fill=frame, width=max(3, w // 40))
    return out


def build_glass(folder, regions):
    size = GLASS
    atlas = Image.new("RGB", (size, size), (16, 20, 24))

    def rect(r):
        u, v, w, h = r
        x0, x1 = int(round(u * size)), int(round((u + w) * size))
        y0, y1 = int(round((1.0 - (v + h)) * size)), int(round((1.0 - v) * size))
        return x0, y0, x1, y1

    warm_a = ((240, 188, 120), (214, 146, 84))   # bright
    warm_b = ((226, 176, 110), (196, 132, 74))   # a little dimmer
    warm_c = ((176, 128, 80), (136, 96, 58))    # low lamps
    dark_d = ((34, 44, 56), (22, 30, 40))        # unlit, cool glass
    for name, (gt, gb), lit in (("PANE_A", warm_a, True), ("PANE_B", warm_b, True), ("PANE_C", warm_c, True), ("PANE_D", dark_d, False)):
        x0, y0, x1, y1 = rect(regions[name])
        atlas.paste(_pane(x1 - x0, y1 - y0, gt, gb, lit=lit, mull=[0.5]), (x0, y0))
    x0, y0, x1, y1 = rect(regions["DOOR"])
    atlas.paste(_pane(x1 - x0, y1 - y0, (255, 214, 150), (244, 176, 100), frame=(30, 34, 36), mull=[0.30]), (x0, y0))
    # triple: three panes side by side with mullions between, one image
    x0, y0, x1, y1 = rect(regions["TRIPLE"])
    tw, th = x1 - x0, y1 - y0
    trip = Image.new("RGB", (tw, th), (26, 32, 36))
    third = tw // 3
    for k in range(3):
        p = _pane(third, th, warm_a[0], warm_a[1], mull=[0.5])
        trip.paste(p, (k * third, 0))
    atlas.paste(trip, (x0, y0))
    x0, y0, x1, y1 = rect(regions["OCU"])
    w, h = x1 - x0, y1 - y0
    oc = Image.new("RGB", (w, h), (30, 34, 36))
    d = ImageDraw.Draw(oc)
    r = min(w, h) // 2 - 4
    cx, cy = w // 2, h // 2
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(236, 184, 112), outline=(30, 36, 40), width=6)
    d.line([(cx - r + 6, cy), (cx + r - 6, cy)], fill=(30, 36, 40), width=4)
    d.line([(cx, cy - r + 6), (cx, cy + r - 6)], fill=(30, 36, 40), width=4)
    atlas.paste(oc, (x0, y0))
    x0, y0, x1, y1 = rect(regions["MARB"])
    atlas.paste(_pane(x1 - x0, y1 - y0, (232, 204, 150), (206, 170, 120), frame=(52, 48, 42), mull=[0.5]), (x0, y0))
    atlas = atlas.filter(ImageFilter.GaussianBlur(0.6))
    atlas.save(os.path.join(folder, "windows-basecolor.png"), "PNG", optimize=True)
