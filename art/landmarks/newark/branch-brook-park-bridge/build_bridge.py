#!/usr/bin/env python3
"""Laurel Wood Boulder Bridge, Branch Brook Park, Newark.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
The downstream arch face (toward Clark's Pond) faces Blender +Y.

    python3 build_bridge.py
    python3 build_bridge.py --counts
    blender -b --factory-startup --python build_bridge.py

Dimensions from the Branch Brook Park Cultural Landscape Report, Volume 4
(Rhodeside & Harwell for the Branch Brook Park Alliance, 2005): a rustic
arched fieldstone footbridge, about 8 ft wide and 15 ft long, coping
boulders about 3 ft across, fieldstones about 12 in, cheek walls in the
same family as the other brook bridges (about 2 ft 4 in above the deck).
Short earth ramps are added so the deck meets the path. No cherry trees.

No Google imagery. No paid add-ons. Run with --factory-startup.
"""

from __future__ import annotations

import math
import os
import random
import struct
import sys

FT = 0.3048
SPAN = 15.0 * FT
CLEAR = 8.0 * FT
WALL_T = 2.0 * FT
HALF_X = SPAN * 0.5
R_IN = 0.95
RING = 0.24
R_OUT = R_IN + RING
SPRING = 0.08
CROWN_IN = SPRING + R_IN
CROWN_OUT = SPRING + R_OUT
DECK_Z = CROWN_OUT + 0.18
WALL_ABOVE = 2.333 * FT
WALL_TOP = DECK_Z + WALL_ABOVE
RAMP = 2.55
Y_IN = CLEAR * 0.5
Y_OUT = Y_IN + WALL_T

# Atlas rectangles (u, v, w, h). v is the bottom of the region.
FIELD = (0.00, 0.00, 0.55, 0.62)
BOUL = (0.55, 0.00, 0.45, 0.50)
CONC = (0.55, 0.50, 0.45, 0.28)
DECK = (0.00, 0.62, 0.55, 0.38)
MORT = (0.55, 0.78, 0.45, 0.22)

SLUG = "branch-brook-park-bridge"
MAIN_MAT = f"{SLUG}-main"


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vscale(a, s):
    return (a[0] * s, a[1] * s, a[2] * s)


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def vlen(a):
    return math.sqrt(vdot(a, a))


def vnorm(a):
    L = vlen(a)
    if L < 1e-12:
        return (0.0, 0.0, 1.0)
    return (a[0] / L, a[1] / L, a[2] / L)


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


class Acc:
    def __init__(self):
        self.V = []
        self.UV = []
        self.F = []

    def add(self, p, uv):
        self.V.append(p)
        self.UV.append(uv)
        return len(self.V) - 1

    def tri(self, a, b, c):
        self.F.append((a, b, c))

    @property
    def tris(self):
        return len(self.F)


def _normal(p0, p1, p2):
    cr = vcross(vsub(p1, p0), vsub(p2, p0))
    L = vlen(cr)
    if L < 1e-10:
        return None
    return (cr[0] / L, cr[1] / L, cr[2] / L)


def add_quad(acc, p0, p1, p2, p3, region, hint):
    n = _normal(p0, p1, p2)
    if n is None:
        return
    if vdot(n, hint) < 0:
        order = (p0, p3, p2, p1)
    else:
        order = (p0, p1, p2, p3)
    u, v, w, h = region
    uvs = ((u, v), (u + w, v), (u + w, v + h), (u, v + h))
    ids = [acc.add(p, uv) for p, uv in zip(order, uvs)]
    acc.tri(ids[0], ids[1], ids[2])
    acc.tri(ids[0], ids[2], ids[3])


def add_grid(acc, p00, p10, p11, p01, nu, nv, region, hint):
    nu = max(1, min(24, int(nu)))
    nv = max(1, min(16, int(nv)))
    for j in range(nv):
        for i in range(nu):
            u0, u1 = i / nu, (i + 1) / nu
            v0, v1 = j / nv, (j + 1) / nv

            def at(u, v):
                a = lerp(p00, p10, u)
                b = lerp(p01, p11, u)
                return lerp(a, b, v)

            add_quad(acc, at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), region, hint)


def wall(acc, a, b, z0, z1, region, tile, outward):
    if z1 - z0 < 0.02:
        return
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    if length < 0.03:
        return
    nu = max(1, int(round(length / tile)))
    nv = max(1, int(round((z1 - z0) / tile)))
    add_grid(
        acc,
        (a[0], a[1], z0),
        (b[0], b[1], z0),
        (b[0], b[1], z1),
        (a[0], a[1], z1),
        nu,
        nv,
        region,
        outward,
    )


def flat(acc, x0, x1, y0, y1, z, sign, region, tile):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    nu = max(1, int(round((x1 - x0) / tile)))
    nv = max(1, int(round((y1 - y0) / tile)))
    add_grid(acc, (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), nu, nv, region, (0.0, 0.0, sign))


def add_box(acc, x0, x1, y0, y1, z0, z1, region, tile, bottom=False, top=True):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    if z1 < z0:
        z0, z1 = z1, z0
    wall(acc, (x0, y0), (x1, y0), z0, z1, region, tile, (0, -1, 0))
    wall(acc, (x0, y1), (x1, y1), z0, z1, region, tile, (0, 1, 0))
    wall(acc, (x0, y0), (x0, y1), z0, z1, region, tile, (-1, 0, 0))
    wall(acc, (x1, y0), (x1, y1), z0, z1, region, tile, (1, 0, 0))
    if top:
        flat(acc, x0, x1, y0, y1, z1, 1, region, tile)
    if bottom:
        flat(acc, x0, x1, y0, y1, z0, -1, region, tile)


def add_rock(acc, c, radii, nu, nv, region):
    cx, cy, cz = c
    rx, ry, rz = radii

    def p(i, j):
        theta = math.pi * j / nv
        phi = 2.0 * math.pi * i / nu
        st, ct = math.sin(theta), math.cos(theta)
        return (
            cx + rx * st * math.cos(phi),
            cy + ry * st * math.sin(phi),
            cz + rz * ct,
        )

    for i in range(nu):
        for j in range(nv):
            add_quad(acc, p(i, j), p(i + 1, j), p(i + 1, j + 1), p(i, j + 1), region, (0, 0, 1))


def _arch_pt(radius, angle, y):
    return (radius * math.cos(angle), y, SPRING + radius * math.sin(angle))


def add_spandrel(acc, y0, y1, level):
    """Fill the masonry between the arch extrados and the parapet soffit."""
    n = {0: 8, 1: 6, 2: 4}[level]
    for i in range(n):
        a0 = math.pi - i * math.pi / n
        a1 = math.pi - (i + 1) * math.pi / n
        for y, hint_y in ((y1, 1.0), (y0, -1.0)):
            p0 = _arch_pt(R_OUT, a0, y)
            p1 = _arch_pt(R_OUT, a1, y)
            add_quad(
                acc,
                p0,
                p1,
                (p1[0], y, CROWN_OUT),
                (p0[0], y, CROWN_OUT),
                FIELD,
                (0, hint_y, 0),
            )
        add_quad(
            acc,
            _arch_pt(R_OUT, a0, y0),
            _arch_pt(R_OUT, a1, y0),
            _arch_pt(R_OUT, a1, y1),
            _arch_pt(R_OUT, a0, y1),
            FIELD,
            (0, 0, 1),
        )


def add_arch_ring(acc, y_inner, y_outer, level):
    """Annular stone ring through one cheek wall. y_outer is the brook face."""
    n = {0: 9, 1: 6, 2: 4}[level]
    for i in range(n):
        a0 = math.pi - i * math.pi / n
        a1 = math.pi - (i + 1) * math.pi / n
        bulge = 0.055 if level == 0 and i % 2 == 0 else 0.0
        r_out = R_OUT + bulge
        q = [
            _arch_pt(R_IN, a0, y_outer),
            _arch_pt(r_out, a0, y_outer),
            _arch_pt(r_out, a1, y_outer),
            _arch_pt(R_IN, a1, y_outer),
        ]
        add_quad(acc, q[0], q[1], q[2], q[3], BOUL, (0, 1 if y_outer > 0 else -1, 0))
        q = [
            _arch_pt(R_IN, a0, y_inner),
            _arch_pt(R_IN, a1, y_inner),
            _arch_pt(r_out, a1, y_inner),
            _arch_pt(r_out, a0, y_inner),
        ]
        add_quad(acc, q[0], q[1], q[2], q[3], FIELD, (0, -1 if y_outer > 0 else 1, 0))
        # Intrados, normals toward the water (down into the opening).
        add_quad(
            acc,
            _arch_pt(R_IN, a0, y_inner),
            _arch_pt(R_IN, a0, y_outer),
            _arch_pt(R_IN, a1, y_outer),
            _arch_pt(R_IN, a1, y_inner),
            FIELD,
            (0, 0, -1),
        )


def add_cheek(acc, y0, y1, level):
    """One cheek wall. y0 is toward the deck, y1 is the outer brook face if y1>y0."""
    tile = 2.2 if level == 0 else 3.0
    # Abutments stop at the arch ring. Parapet runs the full length above it.
    add_box(acc, -HALF_X, -R_OUT, y0, y1, 0.0, CROWN_OUT, FIELD, tile, top=False)
    add_box(acc, R_OUT, HALF_X, y0, y1, 0.0, CROWN_OUT, FIELD, tile, top=False)
    add_box(acc, -HALF_X, HALF_X, y0, y1, CROWN_OUT, WALL_TOP, FIELD, tile, bottom=False)
    y_outer = y1 if abs(y1) > abs(y0) else y0
    y_inner = y0 if y_outer == y1 else y1
    add_arch_ring(acc, y_inner, y_outer, level)
    add_spandrel(acc, y0, y1, level)


def _deck_z(x):
    ax = abs(x)
    if ax <= HALF_X:
        return DECK_Z
    t = min(1.0, (ax - HALF_X) / RAMP)
    # Ease the hump so the end sits on the path.
    t = t * t * (3.0 - 2.0 * t)
    return DECK_Z * (1.0 - t) + 0.02 * t


def _wall_top(x):
    return _deck_z(x) + WALL_ABOVE * (0.55 + 0.45 * max(0.0, 1.0 - max(0.0, abs(x) - HALF_X) / RAMP))


def add_deck(acc, level):
    tile_x = 0.7 if level == 0 else 1.4
    x_end = HALF_X + RAMP
    xs = []
    x = -x_end
    while x < x_end - 1e-6:
        xs.append(x)
        x += tile_x
    xs.append(x_end)
    y0, y1 = -Y_IN, Y_IN
    for i in range(len(xs) - 1):
        a, b = xs[i], xs[i + 1]
        za, zb = _deck_z(a), _deck_z(b)
        add_quad(acc, (a, y0, za), (b, y0, zb), (b, y1, zb), (a, y1, za), DECK, (0, 0, 1))
        # Thick edge so the ramp reads as fill, not a sheet. Keep it on or above the path.
        za_b, zb_b = max(0.0, za - 0.12), max(0.0, zb - 0.12)
        add_quad(acc, (a, y0, za_b), (a, y1, za_b), (b, y1, zb_b), (b, y0, zb_b), MORT, (0, 0, -1))
        add_quad(acc, (a, y0, za_b), (b, y0, zb_b), (b, y0, zb), (a, y0, za), MORT, (0, -1, 0))
        add_quad(acc, (a, y1, za), (b, y1, zb), (b, y1, zb_b), (a, y1, za_b), MORT, (0, 1, 0))


def add_ramp_cheeks(acc, level):
    """Stone cheeks follow the ramps down to the path."""
    tile = 0.9 if level == 0 else 1.8
    x_end = HALF_X + RAMP
    for sign in (1.0, -1.0):
        x0 = sign * HALF_X
        x1 = sign * x_end
        if x1 < x0:
            x0, x1 = x1, x0
        steps = 4 if level == 0 else 2
        for y0, y1 in ((Y_IN, Y_OUT), (-Y_OUT, -Y_IN)):
            for i in range(steps):
                a = x0 + (x1 - x0) * i / steps
                b = x0 + (x1 - x0) * (i + 1) / steps
                z0 = _deck_z(a) + 0.42
                z1 = _deck_z(b) + 0.42
                z_base0 = max(0.0, _deck_z(a) - 0.16)
                z_base1 = max(0.0, _deck_z(b) - 0.16)
                add_quad(acc, (a, y0, z_base0), (b, y0, z_base1), (b, y0, z1), (a, y0, z0), FIELD, (0, -1, 0))
                add_quad(acc, (a, y1, z0), (b, y1, z1), (b, y1, z_base1), (a, y1, z_base0), FIELD, (0, 1, 0))
                add_quad(acc, (a, y0, z0), (b, y0, z1), (b, y1, z1), (a, y1, z0), FIELD, (0, 0, 1))
            # Close the toe.
            zt = _deck_z(sign * x_end) + 0.42
            zb = max(0.0, _deck_z(sign * x_end) - 0.16)
            xe = sign * x_end
            add_quad(acc, (xe, y0, zb), (xe, y0, zt), (xe, y1, zt), (xe, y1, zb), FIELD, (sign, 0, 0))


def add_barrel(acc, level):
    n = {0: 10, 1: 6, 2: 3}[level]
    r = R_IN - 0.04
    y0, y1 = -Y_IN + 0.02, Y_IN - 0.02
    for i in range(n):
        a0 = math.pi - i * math.pi / n
        a1 = math.pi - (i + 1) * math.pi / n
        p = lambda a, y, rad=r: (rad * math.cos(a), y, SPRING + rad * math.sin(a))
        add_quad(acc, p(a0, y0), p(a1, y0), p(a1, y1), p(a0, y1), CONC, (0, 0, -1))


def add_face_stones(acc, level):
    """Stones proud of the brook faces, so the wall is not a flat box."""
    if level > 0:
        return
    rng = random.Random(19)
    nu, nv = 5, 3
    for y_face, y_sign in ((Y_OUT, 1.0), (-Y_OUT, -1.0)):
        for i in range(8):
            x = -HALF_X + 0.4 + i * (SPAN - 0.5) / 7.0
            if abs(x) < R_IN * 0.85:
                z = CROWN_OUT + 0.22 + (i % 3) * 0.12
            else:
                z = 0.35 + (i % 4) * 0.38
            if z > WALL_TOP - 0.15:
                continue
            rx = 0.18 + rng.random() * 0.12
            rz = 0.14 + rng.random() * 0.1
            cy = y_face + y_sign * rx * 0.45
            add_rock(acc, (x, cy, z), (rx, rx * 0.7, rz), nu, nv, FIELD)


def add_boulders(acc, level):
    if level >= 2:
        # A continuous coping reads at distance. No loose rocks.
        for y0, y1 in ((Y_IN, Y_OUT), (-Y_OUT, -Y_IN)):
            add_box(acc, -HALF_X, HALF_X, y0, y1, WALL_TOP, WALL_TOP + 0.28, BOUL, 1.5, bottom=False)
        return
    rng = random.Random(1900 + level)
    n = 7 if level == 0 else 4
    nu, nv = (6, 4) if level == 0 else (5, 3)
    for y_mid, y_sign in ((Y_IN + WALL_T * 0.5, 1.0), (-(Y_IN + WALL_T * 0.5), -1.0)):
        for i in range(n):
            t = (i + 0.5) / n
            x = -HALF_X + 0.35 + t * (SPAN - 0.7)
            rx = 0.34 + rng.random() * 0.16
            ry = 0.30 + rng.random() * 0.14
            rz = 0.26 + rng.random() * 0.12
            add_rock(acc, (x, y_mid, WALL_TOP + rz * 0.55), (rx, ry, rz), nu, nv, BOUL)
        if level == 0:
            # One coping boulder slipped onto the parapet, as the report notes.
            add_rock(acc, (HALF_X - 0.2, y_mid + y_sign * 0.05, WALL_TOP + 0.15), (0.36, 0.30, 0.2), nu, nv, BOUL)


def build(level):
    stone = Acc()
    col = Acc()
    for y0, y1 in ((Y_IN, Y_OUT), (-Y_OUT, -Y_IN)):
        add_cheek(stone, y0, y1, level)
    add_deck(stone, level)
    add_ramp_cheeks(stone, level)
    add_barrel(stone, level)
    add_boulders(stone, level)
    add_face_stones(stone, level)
    if level == 0:
        # Walkable deck and ramp, plus the two parapets. The arch is open.
        x_end = HALF_X + RAMP
        steps = 6
        for i in range(steps):
            a = -x_end + 2 * x_end * i / steps
            b = -x_end + 2 * x_end * (i + 1) / steps
            za, zb = _deck_z(a), _deck_z(b)
            add_quad(col, (a, -Y_IN, za), (b, -Y_IN, zb), (b, Y_IN, zb), (a, Y_IN, za), DECK, (0, 0, 1))
        for y0, y1 in ((Y_IN, Y_OUT), (-Y_OUT, -Y_IN)):
            add_box(col, -HALF_X, HALF_X, y0, y1, DECK_Z, WALL_TOP, FIELD, 4.0, top=True)
    return stone, col


def _region_pixels(region, size):
    u, v, w, h = region
    x0 = int(round(u * size))
    x1 = int(round((u + w) * size))
    y0 = int(round((1.0 - (v + h)) * size))
    y1 = int(round((1.0 - v) * size))
    return x0, y0, max(x0 + 1, x1), max(y0 + 1, y1)


def _normal_from_height(height_img):
    from PIL import Image

    w, h = height_img.size
    src = height_img.load()
    out = Image.new("RGB", (w, h), (128, 128, 255))
    dst = out.load()
    for y in range(h):
        for x in range(w):
            xm = src[max(0, x - 1), y]
            xp = src[min(w - 1, x + 1), y]
            ym = src[x, max(0, y - 1)]
            yp = src[x, min(h - 1, y + 1)]
            dx = (xp - xm) / 255.0
            dy = (ym - yp) / 255.0
            nx, ny, nz = -dx * 2.2, -dy * 2.2, 1.0
            L = math.sqrt(nx * nx + ny * ny + nz * nz)
            dst[x, y] = (int(nx / L * 127 + 128), int(ny / L * 127 + 128), int(nz / L * 127 + 128))
    return out


def generate_textures(folder):
    from PIL import Image, ImageDraw, ImageFilter

    os.makedirs(folder, exist_ok=True)
    size = 2048
    base = Image.new("RGB", (size, size), (90, 86, 78))
    height = Image.new("L", (size, size), 128)
    orm = Image.new("RGB", (size, size), (255, 200, 8))
    rng = random.Random(1900)

    paints = {
        FIELD: ((126, 112, 96), 132, (255, 196, 6)),
        BOUL: ((112, 108, 100), 150, (255, 176, 4)),
        CONC: ((158, 154, 146), 118, (255, 210, 0)),
        DECK: ((104, 96, 84), 108, (255, 220, 0)),
        MORT: ((92, 86, 78), 96, (255, 230, 0)),
    }
    draw_b = ImageDraw.Draw(base)
    draw_h = ImageDraw.Draw(height)
    draw_o = ImageDraw.Draw(orm)
    for region, (color, hval, orm_col) in paints.items():
        x0, y0, x1, y1 = _region_pixels(region, size)
        draw_b.rectangle([x0, y0, x1 - 1, y1 - 1], fill=color)
        draw_h.rectangle([x0, y0, x1 - 1, y1 - 1], fill=hval)
        draw_o.rectangle([x0, y0, x1 - 1, y1 - 1], fill=orm_col)

    def jitter(color, amt):
        return tuple(max(0, min(255, c + rng.randint(-amt, amt))) for c in color)

    # Irregular fieldstones.
    for region, base_col, h_base, stone_amt in (
        (FIELD, (126, 112, 96), 132, 70),
        (BOUL, (112, 108, 100), 150, 28),
        (DECK, (104, 96, 84), 108, 40),
    ):
        x0, y0, x1, y1 = _region_pixels(region, size)
        for _ in range(stone_amt):
            w = rng.randint(70, 180)
            h = rng.randint(48, 110)
            x = rng.randint(x0, max(x0, x1 - w - 1))
            y = rng.randint(y0, max(y0, y1 - h - 1))
            col = jitter(base_col, 12)
            draw_b.rounded_rectangle([x, y, x + w, y + h], radius=6, fill=col)
            draw_h.rounded_rectangle([x, y, x + w, y + h], radius=6, fill=min(255, h_base + rng.randint(-18, 28)))
            # Mortar shadow at the lower edge of each stone.
            draw_h.rectangle([x, y + h - 3, x + w, y + h], fill=max(0, h_base - 40))

    # Concrete aggregate specks.
    x0, y0, x1, y1 = _region_pixels(CONC, size)
    for _ in range(400):
        x = rng.randint(x0, x1 - 2)
        y = rng.randint(y0, y1 - 2)
        g = rng.randint(120, 190)
        draw_b.point((x, y), fill=(g, g - 4, g - 8))

    base = base.filter(ImageFilter.SMOOTH_MORE)
    height = height.filter(ImageFilter.SMOOTH)
    normal = _normal_from_height(height)
    base.save(os.path.join(folder, "main-basecolor.png"), "PNG", optimize=True)
    normal.save(os.path.join(folder, "main-normal.png"), "PNG", optimize=True)
    orm.save(os.path.join(folder, "main-orm.png"), "PNG", optimize=True)
    print("textures", folder)


def count_only():
    caps = (50000, 15000, 3000)
    worst = 0
    for level, cap in enumerate(caps):
        stone, col = build(level)
        total = stone.tris
        print(f"LOD{level} tris {total} col {col.tris if col else 0}")
        if total > cap or (col and col.tris > 500):
            print(f"OVER BUDGET LOD{level}", file=sys.stderr)
            worst = 1
    print(f"span {SPAN:.2f} clear {CLEAR:.2f} deck {DECK_Z:.2f} wall {WALL_TOP:.2f} ramp {RAMP:.2f}")
    return worst


def build_scene():
    import bpy

    root = os.path.dirname(os.path.abspath(__file__))
    tex = os.path.join(root, "textures")
    for name in ("main-basecolor.png", "main-normal.png", "main-orm.png"):
        if not os.path.exists(os.path.join(tex, name)):
            generate_textures(tex)

    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)

    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    scene.unit_settings.length_unit = "METERS"

    main_mat = make_main_material(tex)
    repo = os.path.abspath(os.path.join(root, "..", "..", "..", ".."))
    public = os.path.join(repo, "public", "landmarks", "newark", SLUG)
    os.makedirs(public, exist_ok=True)

    roots = []
    for level in (0, 1, 2):
        stone, col = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        body = acc_object(f"masonry-lod{level}", stone, main_mat)
        body.parent = parent
        if col is not None and col.tris:
            col_obj = acc_object(f"{SLUG}_COL", col, None)
            col_obj.name = f"{SLUG}_COL"
            col_obj.parent = parent
        roots.append(parent)
        print(f"LOD{level} tris {stone.tris} col {col.tris if col else 0}")

    for img in list(bpy.data.images):
        if img.name in ("Render Result", "Viewer Node"):
            bpy.data.images.remove(img)

    blend_path = os.path.join(root, f"{SLUG}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile(compress=True)
    print("blend", blend_path)

    raw = f"/tmp/{SLUG}-raw.glb"
    bpy.ops.export_scene.gltf(
        filepath=raw,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
        export_normals=True,
        export_texcoords=True,
        export_image_format="AUTO",
        use_selection=False,
    )
    print("raw", raw, os.path.getsize(raw))

    shots = os.environ.get("BRIDGE_SHOTS")
    if shots:
        render_shots(roots, shots)


def acc_object(name, acc, material):
    import bpy

    mesh = bpy.data.meshes.new(name + "-mesh")
    mesh.from_pydata(acc.V, [], [list(f) for f in acc.F])
    mesh.validate(clean_customdata=False)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        poly.use_smooth = False
        for li in poly.loop_indices:
            vi = mesh.loops[li].vertex_index
            uv.data[li].uv = acc.UV[vi]
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material is not None:
        obj.data.materials.append(material)
    return obj


def _gltf_occlusion_group():
    import bpy

    name = "glTF Material Output"
    ng = bpy.data.node_groups.get(name)
    if ng is None:
        ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
        ng.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return ng


def make_main_material(tex):
    import bpy

    mat = bpy.data.materials.new(MAIN_MAT)
    mat.use_nodes = True
    try:
        mat.use_backface_culling = True
    except Exception:
        pass
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (480, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (160, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    def img_node(filename, noncolor, x, y):
        image = bpy.data.images.load(os.path.join(tex, filename))
        image.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
        image.filepath = "//textures/" + filename
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        node.location = (x, y)
        node.interpolation = "Linear"
        return node

    base = img_node("main-basecolor.png", False, -680, 220)
    orm = img_node("main-orm.png", True, -680, -40)
    nor = img_node("main-normal.png", True, -680, -320)
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    sep = nodes.new("ShaderNodeSeparateColor")
    sep.location = (-360, -40)
    links.new(orm.outputs["Color"], sep.inputs["Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.location = (-80, -300)
    nmap.inputs["Strength"].default_value = 0.85
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    occ = nodes.new("ShaderNodeGroup")
    occ.node_tree = _gltf_occlusion_group()
    occ.location = (-80, -520)
    links.new(sep.outputs["Red"], occ.inputs["Occlusion"])
    return mat


def _hide_tree(obj, hide):
    is_col = obj.name.endswith("_COL")
    obj.hide_render = True if is_col else hide
    try:
        obj.hide_set(True if is_col else hide)
    except Exception:
        pass
    for child in obj.children:
        _hide_tree(child, hide)


def _look_at(obj, location, target):
    from mathutils import Vector

    obj.location = location
    direction = Vector(target) - Vector(location)
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def render_shots(roots, folder):
    import bpy

    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 32

    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.68, 0.82, 1)
    bg.inputs[1].default_value = 0.7

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = 0.4
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.9, 0.15, 0.6)

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 80
    fill_data.size = 8
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)
    _look_at(fill, (-6, 4, 5), (0, 0, 1.2))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 40
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground = bpy.data.meshes.new("ground")
    ground.from_pydata(
        [(-14, -12, -0.02), (14, -12, -0.02), (14, 12, -0.02), (-14, 12, -0.02)],
        [],
        [(0, 1, 2, 3)],
    )
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.22, 0.14, 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.92
    gobj = bpy.data.objects.new("ground", ground)
    gobj.data.materials.append(gmat)
    scene.collection.objects.link(gobj)

    def show(level):
        for i, root in enumerate(roots):
            _hide_tree(root, i != level)

    target = (0, 0, 1.15)
    shots = [
        ("front", (0.2, 11.5, 2.4), target),
        ("side", (12.0, 0.4, 2.6), target),
        ("back", (-0.3, -11.5, 2.5), target),
        ("three-quarter", (8.5, 8.0, 3.2), target),
    ]
    show(0)
    for name, loc, tgt in shots:
        _look_at(cam, loc, tgt)
        scene.render.filepath = os.path.join(folder, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("shot", name)

    bg.inputs[0].default_value = (0.015, 0.02, 0.045, 1)
    bg.inputs[1].default_value = 0.35
    sun_data.energy = 0.18
    sun_data.color = (0.75, 0.82, 1.0)
    fill_data.energy = 8
    _look_at(cam, (7.5, 8.5, 2.8), target)
    scene.render.filepath = os.path.join(folder, "night.png")
    bpy.ops.render.render(write_still=True)
    print("shot night")
    sun_data.energy = 3.2
    sun_data.color = (1, 1, 1)
    bg.inputs[0].default_value = (0.55, 0.68, 0.82, 1)
    bg.inputs[1].default_value = 0.7

    show(0)
    body = None
    for child in roots[0].children:
        if child.name.startswith("masonry"):
            body = child
    if body is not None:
        mod = body.modifiers.new("wire", "WIREFRAME")
        mod.thickness = 0.015
        mod.use_replace = True
        _look_at(cam, (8.5, 8.0, 3.2), target)
        scene.render.filepath = os.path.join(folder, "wire-lod0.png")
        bpy.ops.render.render(write_still=True)
        body.modifiers.remove(mod)
        print("shot wire")

    gobj.hide_render = True
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 16
    offsets = (-5.2, 0.0, 5.2)
    for root, dx in zip(roots, offsets):
        _hide_tree(root, False)
        root.location.x = dx
    _look_at(cam, (0, 14, 2.2), (0, 0, 1.1))
    scene.render.resolution_x = 1600
    scene.render.filepath = os.path.join(folder, "lod-compare.png")
    bpy.ops.render.render(write_still=True)
    for root in roots:
        root.location.x = 0
    print("shot lod-compare")


if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    try:
        import bpy  # noqa: F401

        in_blender = True
    except ImportError:
        in_blender = False
    if not in_blender:
        if "--counts" in sys.argv:
            sys.exit(count_only())
        generate_textures(os.path.join(here, "textures"))
    else:
        build_scene()
