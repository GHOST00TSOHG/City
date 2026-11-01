#!/usr/bin/env python3
"""Ballantine Gate, Branch Brook Park, Newark.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
The street face (Lake Street / Ballantine Parkway approach) faces Blender +Y.

    python3 build_pavilion.py
    python3 build_pavilion.py --counts
    blender -b --factory-startup --python build_pavilion.py

The gate is the park entrance: two brick-and-limestone pavilions, a wrought-iron
vehicular gate, pedestrian flat arches, and the side fences. Measured from the
National Register nomination (1980, public domain) and the Branch Brook Park
Cultural Landscape Report, Volume 4 part 2 (2005):

- vehicular gate 40 ft wide and 11 ft high
- pedestrian flat arches 5 ft wide by 8 ft 6 in high
- granite plinth about 21 in, limestone base cap 16 in
- limestone belt and fascia 13 in, with 2 ft of brick between them on the flanks
- rafters run 4 ft past the wall and the hip roof kicks up at the eave
- one-story French Renaissance pavilions, red brick, limestone quoins

The model is symmetric. No donor lettering, no park logo, no street signs.
Cherry trees are not part of this mesh.

No Google imagery. No paid add-ons. Run with --factory-startup.
"""

from __future__ import annotations

import math
import os
import random
import sys

FT = 0.3048
GATE_W = 40.0 * FT
GATE_H = 11.0 * FT
PIER_W = 3.75 * FT
PIER_D = 3.6 * FT
WALK_W = 5.0 * FT
WALK_H = 8.5 * FT
PAV_W = 18.0 * FT
PAV_D = 16.0 * FT

Z_PLINTH = 21.0 / 12.0 * FT
Z_BASE = Z_PLINTH + 16.0 / 12.0 * FT
Z_BELT = Z_BASE + 2.05
Z_BELT_TOP = Z_BELT + 13.0 / 12.0 * FT
Z_UPPER = Z_BELT_TOP + 2.0 * FT
Z_EAVE = Z_UPPER + 13.0 / 12.0 * FT
ROOF_RISE = 4.15
OVERHANG = 4.0 * FT

HALF_GATE = GATE_W * 0.5
# Positive-X order from the road centre: pier, pedestrian opening, pavilion.
X_PIER_IN = HALF_GATE
X_PIER_OUT = HALF_GATE + PIER_W
X_WALK_OUT = X_PIER_OUT + WALK_W
X_PAV_IN = X_WALK_OUT
X_PAV_OUT = X_PAV_IN + PAV_W

Y_STREET = 2.55
Y_BACK = Y_STREET - PAV_D
Y_PIER_BACK = Y_STREET - PIER_D
PIER_TOP = 3.55
PIER_CAP = 4.15

BRICK = (0.00, 0.00, 0.50, 0.52)
LIME = (0.50, 0.00, 0.25, 0.52)
GRAN = (0.75, 0.00, 0.25, 0.52)
SHING = (0.00, 0.52, 0.48, 0.48)
WOOD = (0.48, 0.52, 0.24, 0.24)
IRON = (0.72, 0.52, 0.28, 0.24)
COPP = (0.48, 0.76, 0.24, 0.24)
DARK = (0.72, 0.76, 0.28, 0.24)

SLUG = "branch-brook-park-pavilion"
MAIN_MAT = f"{SLUG}-main"
WIN_MAT = "emissive-windows"


def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def vlen(a):
    return math.sqrt(max(0.0, vdot(a, a)))


def lerp(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t)


class Acc:
    def __init__(self):
        self.V = []
        self.UV = []
        self.F = []

    def add(self, p, uv):
        self.V.append((float(p[0]), float(p[1]), float(p[2])))
        self.UV.append((float(uv[0]), float(uv[1])))
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
    uvs = ((u + 0.02, v + 0.02), (u + w - 0.02, v + 0.02), (u + w - 0.02, v + h - 0.02), (u + 0.02, v + h - 0.02))
    ids = [acc.add(p, uv) for p, uv in zip(order, uvs)]
    acc.tri(ids[0], ids[1], ids[2])
    acc.tri(ids[0], ids[2], ids[3])


def add_grid(acc, p00, p10, p11, p01, nu, nv, region, hint):
    nu = max(1, min(20, int(nu)))
    nv = max(1, min(12, int(nv)))
    for j in range(nv):
        for i in range(nu):
            u0, u1 = i / nu, (i + 1) / nu
            v0, v1 = j / nv, (j + 1) / nv

            def at(u, v):
                return lerp(lerp(p00, p10, u), lerp(p01, p11, u), v)

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
    if x1 - x0 < 0.02 or y1 - y0 < 0.02:
        return
    nu = max(1, int(round((x1 - x0) / tile)))
    nv = max(1, int(round((y1 - y0) / tile)))
    add_grid(acc, (x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z), nu, nv, region, (0.0, 0.0, sign))


def add_box(acc, x0, x1, y0, y1, z0, z1, region, tile=2.0, bottom=False, top=True):
    if abs(x1 - x0) < 0.02 or abs(y1 - y0) < 0.02 or abs(z1 - z0) < 0.02:
        return
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


def add_beam(acc, p, q, half_w, half_t, region):
    d = vsub(q, p)
    L = vlen(d)
    if L < 0.04:
        return
    d = (d[0] / L, d[1] / L, d[2] / L)
    tmp = (0.0, 0.0, 1.0) if abs(d[2]) < 0.85 else (1.0, 0.0, 0.0)
    side = vcross(d, tmp)
    sl = vlen(side)
    side = (side[0] / sl, side[1] / sl, side[2] / sl)
    up = vcross(side, d)

    def ring(base):
        out = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            out.append(
                (
                    base[0] + side[0] * sx * half_w + up[0] * sy * half_t,
                    base[1] + side[1] * sx * half_w + up[1] * sy * half_t,
                    base[2] + side[2] * sx * half_w + up[2] * sy * half_t,
                )
            )
        return out

    rp, rq = ring(p), ring(q)
    for i in range(4):
        hint = (
            side[0] * (-1, 1, 1, -1)[i] + up[0] * (-1, -1, 1, 1)[i],
            side[1] * (-1, 1, 1, -1)[i] + up[1] * (-1, -1, 1, 1)[i],
            side[2] * (-1, 1, 1, -1)[i] + up[2] * (-1, -1, 1, 1)[i],
        )
        add_quad(acc, rp[i], rp[(i + 1) % 4], rq[(i + 1) % 4], rq[i], region, hint)
    add_quad(acc, rp[0], rp[3], rp[2], rp[1], region, (-d[0], -d[1], -d[2]))
    add_quad(acc, rq[0], rq[1], rq[2], rq[3], region, d)


def add_opening(stone, glass, x0, x1, y, z0, z1, face_sign, depth, level, kind):
    """Window or door cut into a wall. face_sign is +1 on the street (+Y)."""
    y_face = y + face_sign * 0.01
    y_glass = y_face + face_sign * 0.045
    frame = 0.11
    # Limestone surround, sitting on the wall face.
    t = 0.07
    add_box(stone, x0 - frame, x1 + frame, y_face, y_face + face_sign * t, z0 - 0.08, z0, LIME, 2.0)
    add_box(stone, x0 - frame, x1 + frame, y_face, y_face + face_sign * t, z1, z1 + 0.16, LIME, 2.0)
    add_box(stone, x0 - frame, x0, y_face, y_face + face_sign * t, z0, z1, LIME, 2.0)
    add_box(stone, x1, x1 + frame, y_face, y_face + face_sign * t, z0, z1, LIME, 2.0)
    # Flat arch / lintel a little taller.
    add_box(stone, x0 - frame - 0.06, x1 + frame + 0.06, y_face, y_face + face_sign * (t + 0.02), z1 + 0.16, z1 + 0.34, LIME, 2.0)
    if kind == "glass":
        add_quad(
            glass,
            (x0, y_glass, z0),
            (x1, y_glass, z0),
            (x1, y_glass, z1),
            (x0, y_glass, z1),
            (0.0, 0.0, 1.0, 1.0),
            (0, face_sign, 0),
        )
    else:
        add_box(stone, x0, x1, y_face, y_face + face_sign * 0.06, z0, z1, WOOD, 1.2)


def add_quoins(acc, x0, x1, y0, y1, level):
    if level >= 2:
        return
    course = 0.34 if level == 0 else 0.7
    z = Z_BASE
    i = 0
    while z < Z_UPPER - 0.02:
        z1 = min(Z_UPPER, z + course)
        proj = 0.11 if i % 2 == 0 else 0.035
        w = 0.48
        for cx, cy, ox, oy in (
            (x0, y0, -1, -1),
            (x1, y0, 1, -1),
            (x1, y1, 1, 1),
            (x0, y1, -1, 1),
        ):
            xa = cx if ox > 0 else cx - w
            xb = (cx + w) if ox > 0 else cx
            ya = cy if oy > 0 else cy - w
            yb = (cy + w) if oy > 0 else cy
            if ox > 0:
                xb += proj
            else:
                xa -= proj
            if oy > 0:
                yb += proj
            else:
                ya -= proj
            add_box(acc, xa, xb, ya, yb, z + 0.015, z1 - 0.015, LIME, 3.0)
        z = z1
        i += 1


def add_roof(acc, x0, x1, y0, y1, level):
    ox0, ox1 = x0 - OVERHANG, x1 + OVERHANG
    oy0, oy1 = y0 - OVERHANG, y1 + OVERHANG
    cx, cy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    z_wall = Z_EAVE
    z_kick = z_wall + 0.22
    z_peak = z_wall + ROOF_RISE
    wall_c = [(x0, y0, z_wall), (x1, y0, z_wall), (x1, y1, z_wall), (x0, y1, z_wall)]
    eave_c = [(ox0, oy0, z_kick), (ox1, oy0, z_kick), (ox1, oy1, z_kick), (ox0, oy1, z_kick)]
    peak = (cx, cy, z_peak)
    for i in range(4):
        add_quad(acc, eave_c[i], eave_c[(i + 1) % 4], wall_c[(i + 1) % 4], wall_c[i], SHING, (0, 0, 1))
        # Main slope in two bands so the hip reads.
        mid0 = lerp(wall_c[i], peak, 0.5)
        mid1 = lerp(wall_c[(i + 1) % 4], peak, 0.5)
        add_quad(acc, wall_c[i], wall_c[(i + 1) % 4], mid1, mid0, SHING, (0, 0, 1))
        add_quad(acc, mid0, mid1, peak, peak, SHING, (0, 0, 1))
        # Soffit under the kick.
        add_quad(
            acc,
            (eave_c[i][0], eave_c[i][1], z_kick - 0.06),
            (wall_c[i][0], wall_c[i][1], z_wall - 0.02),
            (wall_c[(i + 1) % 4][0], wall_c[(i + 1) % 4][1], z_wall - 0.02),
            (eave_c[(i + 1) % 4][0], eave_c[(i + 1) % 4][1], z_kick - 0.06),
            WOOD,
            (0, 0, -1),
        )
    if level == 0:
        # Rafter tails along each eave.
        edges = (
            ((x0, y0), (x1, y0), (0, -1)),
            ((x1, y0), (x1, y1), (1, 0)),
            ((x1, y1), (x0, y1), (0, 1)),
            ((x0, y1), (x0, y0), (-1, 0)),
        )
        for (ax, ay), (bx, by), (nx, ny) in edges:
            length = math.hypot(bx - ax, by - ay)
            n = max(2, int(length / 0.72))
            for k in range(n + 1):
                t = k / n
                px, py = ax + (bx - ax) * t, ay + (by - ay) * t
                p0 = (px, py, z_wall - 0.02)
                p1 = (px + nx * (OVERHANG - 0.08), py + ny * (OVERHANG - 0.08), z_kick - 0.02)
                add_beam(acc, p0, p1, 0.045, 0.09, WOOD)
        # Copper gutter along the outer eave, four sides.
        g = 0.07
        add_box(acc, ox0, ox1, oy0 - g, oy0, z_kick - 0.02, z_kick + 0.08, COPP, 2.5)
        add_box(acc, ox0, ox1, oy1, oy1 + g, z_kick - 0.02, z_kick + 0.08, COPP, 2.5)
        add_box(acc, ox0 - g, ox0, oy0, oy1, z_kick - 0.02, z_kick + 0.08, COPP, 2.5)
        add_box(acc, ox1, ox1 + g, oy0, oy1, z_kick - 0.02, z_kick + 0.08, COPP, 2.5)


def add_dormer(stone, glass, x, y, z, face_sign, level):
    """Small gabled dormer. face_sign is the horizontal axis it faces (+1 = +Y)."""
    w, h, d = 0.62, 0.78, 0.48
    if face_sign == 0:
        return
    # face_sign here is used for Y facing. x is the center.
    y0 = y
    y1 = y + d
    x0, x1 = x - w * 0.5, x + w * 0.5
    add_box(stone, x0, x1, y0, y1, z, z + h * 0.72, WOOD, 2.0)
    # Gable front.
    peak = (x, y1 + 0.02, z + h)
    add_quad(stone, (x0, y1, z + h * 0.55), (x1, y1, z + h * 0.55), peak, peak, WOOD, (0, 1, 0))
    add_quad(
        stone,
        (x0, y0, z + h * 0.72),
        (x, y0 + d * 0.15, z + h),
        (x, y1, z + h),
        (x0, y1, z + h * 0.55),
        SHING,
        (0, 0, 1),
    )
    add_quad(
        stone,
        (x1, y1, z + h * 0.55),
        (x, y1, z + h),
        (x, y0 + d * 0.15, z + h),
        (x1, y0, z + h * 0.72),
        SHING,
        (0, 0, 1),
    )
    if level == 0:
        gw = 0.28
        add_quad(
            glass,
            (x - gw, y1 + 0.03, z + 0.16),
            (x + gw, y1 + 0.03, z + 0.16),
            (x + gw, y1 + 0.03, z + 0.52),
            (x - gw, y1 + 0.03, z + 0.52),
            (0, 0, 1, 1),
            (0, 1, 0),
        )


def add_pavilion(stone, glass, side, level):
    s = float(side)
    x0, x1 = s * X_PAV_IN, s * X_PAV_OUT
    if x1 < x0:
        x0, x1 = x1, x0
    y0, y1 = Y_BACK, Y_STREET
    tile = 1.35 if level == 0 else 2.4
    # Plinth, base, brick body, belt, upper brick, fascia. Bands, not one box,
    # so the limestone reads as courses.
    add_box(stone, x0, x1, y0, y1, 0.0, Z_PLINTH, GRAN, tile)
    add_box(stone, x0 - 0.04, x1 + 0.04, y0 - 0.04, y1 + 0.04, Z_PLINTH, Z_BASE, LIME, tile, bottom=False)
    add_box(stone, x0, x1, y0, y1, Z_BASE, Z_BELT, BRICK, tile, bottom=False)
    add_box(stone, x0 - 0.03, x1 + 0.03, y0 - 0.03, y1 + 0.03, Z_BELT, Z_BELT_TOP, LIME, tile, bottom=False)
    add_box(stone, x0, x1, y0, y1, Z_BELT_TOP, Z_UPPER, BRICK, tile, bottom=False)
    add_box(stone, x0 - 0.05, x1 + 0.05, y0 - 0.05, y1 + 0.05, Z_UPPER, Z_EAVE, LIME, tile, bottom=False)
    add_quoins(stone, x0, x1, y0, y1, level)
    add_roof(stone, x0, x1, y0, y1, level)

    cx = (x0 + x1) * 0.5
    # Street window.
    add_opening(stone, glass, cx - 0.46, cx + 0.46, y1, Z_BASE + 0.55, Z_BASE + 1.85, 1, 0.2, level, "glass")
    # Park door and stoop.
    add_opening(stone, glass, cx - 0.48, cx + 0.48, y0, Z_PLINTH, Z_BASE + 1.7, -1, 0.2, level, "door")
    add_box(stone, cx - 0.85, cx + 0.85, y0 - 0.7, y0 + 0.02, 0.0, 0.16, GRAN, 2.0)
    add_box(stone, cx - 0.7, cx + 0.7, y0 - 0.48, y0 + 0.02, 0.16, 0.32, GRAN, 2.0)

    if level < 2:
        # Dormers on the street and park slopes.
        cy = (y0 + y1) * 0.5
        z_peak = Z_EAVE + ROOF_RISE
        for face, y_wall in ((1.0, y1), (-1.0, y0)):
            t = 0.34
            z = Z_EAVE + (z_peak - Z_EAVE) * t
            y = y_wall + (cy - y_wall) * t + face * 0.15
            # add_dormer assumes it grows toward +Y. Flip by building in place for -Y.
            if face > 0:
                add_dormer(stone, glass, cx, y, z - 0.15, 1, level)
            else:
                # Mirror the dormer toward the park by swapping the function's Y growth.
                w, h, d = 0.62, 0.78, 0.48
                y1d = y
                y0d = y - d
                add_box(stone, cx - w * 0.5, cx + w * 0.5, y0d, y1d, z - 0.15, z - 0.15 + h * 0.72, WOOD, 2.0)
                if level == 0:
                    gw = 0.28
                    add_quad(
                        glass,
                        (cx - gw, y0d - 0.03, z),
                        (cx - gw, y0d - 0.03, z + 0.36),
                        (cx + gw, y0d - 0.03, z + 0.36),
                        (cx + gw, y0d - 0.03, z),
                        (0, 0, 1, 1),
                        (0, -1, 0),
                    )


def add_pier(acc, side, level):
    s = float(side)
    x0, x1 = s * X_PIER_IN, s * X_PIER_OUT
    if x1 < x0:
        x0, x1 = x1, x0
    y0, y1 = Y_PIER_BACK, Y_STREET + 0.06
    add_box(acc, x0, x1, y0, y1, 0.0, 0.48, GRAN, 2.0)
    add_box(acc, x0 - 0.04, x1 + 0.04, y0 - 0.04, y1 + 0.04, 0.48, PIER_TOP - 0.55, LIME, 1.4 if level == 0 else 2.2, bottom=False)
    add_box(acc, x0 - 0.08, x1 + 0.08, y0 - 0.06, y1 + 0.06, PIER_TOP - 0.55, PIER_TOP - 0.28, LIME, 2.0, bottom=False)
    add_box(acc, x0 - 0.12, x1 + 0.12, y0 - 0.1, y1 + 0.1, PIER_TOP - 0.28, PIER_TOP, LIME, 2.0, bottom=False)
    # Capstone.
    add_box(acc, x0 - 0.02, x1 + 0.02, y0, y1, PIER_TOP, PIER_CAP, LIME, 2.0, bottom=False)
    add_box(acc, (x0 + x1) * 0.5 - 0.18, (x0 + x1) * 0.5 + 0.18, (y0 + y1) * 0.5 - 0.18, (y0 + y1) * 0.5 + 0.18, PIER_CAP, PIER_CAP + 0.16, LIME, 2.0, bottom=False)


def add_walk_arch(acc, side, level):
    s = float(side)
    x0, x1 = s * X_PIER_OUT, s * X_WALK_OUT
    if x1 < x0:
        x0, x1 = x1, x0
    # Open pedestrian flat arch between the pier and the pavilion. The hole stays clear.
    y0 = Y_STREET - 0.55
    y1 = Y_STREET + 0.06
    add_box(acc, x0, x1, y0, y1, WALK_H, WALK_H + 0.38, LIME, 2.0)
    # Gibbs-like surround: jambs and a projecting head, not a solid panel.
    add_box(acc, x0, x0 + 0.14, y1, y1 + 0.1, 0.08, WALK_H, LIME, 2.0)
    add_box(acc, x1 - 0.14, x1, y1, y1 + 0.1, 0.08, WALK_H, LIME, 2.0)
    add_box(acc, x0 - 0.04, x1 + 0.04, y1, y1 + 0.12, WALK_H, WALK_H + 0.22, LIME, 2.0)
    add_box(acc, x0 + 0.06, x1 - 0.06, y0 - 0.05, y1 + 0.15, 0.0, 0.07, GRAN, 2.0)
    if level == 0:
        # A light iron leaf in the pedestrian opening. Not a collision.
        span = x1 - x0
        bars = 6
        for i in range(bars):
            x = x0 + span * (i + 0.5) / bars
            add_box(acc, x - 0.02, x + 0.02, y0 + 0.2, y0 + 0.26, 0.12, WALK_H - 0.08, IRON, 3.0)


def add_gate(acc, level):
    """Two leaves between the piers. The opening stays walkable: no collision."""
    spacing = 0.15 if level == 0 else (0.32 if level == 1 else 0.7)
    z0, z1 = 0.06, GATE_H
    y0, y1 = Y_STREET - 0.72, Y_STREET - 0.58
    for leaf in (-1.0, 1.0):
        x_inner = leaf * 0.06
        x_outer = leaf * (X_PIER_IN - 0.04)
        x0, x1 = (x_inner, x_outer) if x_inner < x_outer else (x_outer, x_inner)
        # Rails.
        for z in (z0, z0 + (z1 - z0) * 0.38, z1 - 0.08):
            add_box(acc, x0, x1, y0, y1, z, z + 0.06, IRON, 3.0)
        x = x0 + spacing * 0.5
        while x < x1:
            add_box(acc, x - 0.018, x + 0.018, y0, y1, z0, z1, IRON, 3.0)
            if level == 0:
                add_box(acc, x - 0.012, x + 0.012, y0 - 0.01, y1 + 0.01, z1, z1 + 0.16, IRON, 3.0)
            x += spacing
        # Hanging stile at the pier.
        add_box(acc, x_outer - leaf * 0.04, x_outer, y0 - 0.02, y1 + 0.02, z0, z1 + 0.05, IRON, 3.0)


def add_fence(acc, side, level):
    if level >= 2:
        return
    s = float(side)
    n = 5
    posts = []
    for i in range(n):
        t = i / (n - 1)
        bulge = math.sin(t * math.pi) * 1.15
        x = s * (X_PAV_OUT + t * 6.6)
        y = Y_STREET + bulge + t * 1.35
        posts.append((x, y, 0.62 if i == n - 1 else 0.40, 1.95 if i == n - 1 else 1.55))
    for x, y, w, h in posts:
        add_box(acc, x - w * 0.5, x + w * 0.5, y - w * 0.5, y + w * 0.5, 0.0, 0.28, GRAN, 2.0)
        add_box(acc, x - w * 0.42, x + w * 0.42, y - w * 0.42, y + w * 0.42, 0.28, h - 0.16, BRICK, 2.0, bottom=False)
        add_box(acc, x - w * 0.5, x + w * 0.5, y - w * 0.5, y + w * 0.5, h - 0.16, h, LIME, 2.0, bottom=False)
    if level == 0:
        for i in range(n - 1):
            ax, ay = posts[i][0], posts[i][1]
            bx, by = posts[i + 1][0], posts[i + 1][1]
            for z in (0.45, 0.85, 1.25):
                add_beam(acc, (ax, ay, z), (bx, by, z), 0.025, 0.025, IRON)
            length = math.hypot(bx - ax, by - ay)
            pickets = max(2, int(length / 0.22))
            for k in range(1, pickets):
                t = k / pickets
                px, py = ax + (bx - ax) * t, ay + (by - ay) * t
                add_box(acc, px - 0.015, px + 0.015, py - 0.015, py + 0.015, 0.35, 1.32, IRON, 3.0)
        # Four bollards along the street side of the arc.
        for i in range(4):
            t = (i + 0.5) / 4.0
            x = s * (X_PAV_OUT + 0.4 + t * 6.2)
            y = Y_STREET + 2.15 + t * 0.4
            add_box(acc, x - 0.16, x + 0.16, y - 0.16, y + 0.16, 0.0, 0.62, GRAN, 2.0)
            add_box(acc, x - 0.2, x + 0.2, y - 0.2, y + 0.2, 0.62, 0.74, GRAN, 2.0, bottom=False)


def build(level):
    stone = Acc()
    glass = Acc()
    col = Acc()
    for side in (1, -1):
        add_pavilion(stone, glass, side, level)
        add_pier(stone, side, level)
        add_walk_arch(stone, side, level)
        add_fence(stone, side, level)
    add_gate(stone, level)
    if level == 0:
        for side in (1, -1):
            s = float(side)
            x0, x1 = s * X_PAV_IN, s * X_PAV_OUT
            if x1 < x0:
                x0, x1 = x1, x0
            add_box(col, x0, x1, Y_BACK, Y_STREET, 0.0, Z_EAVE, BRICK, 6.0)
            px0, px1 = s * X_PIER_IN, s * X_PIER_OUT
            if px1 < px0:
                px0, px1 = px1, px0
            add_box(col, px0, px1, Y_PIER_BACK, Y_STREET, 0.0, PIER_CAP, LIME, 6.0)
    return stone, glass, col


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
            nx, ny, nz = -dx * 2.4, -dy * 2.4, 1.0
            L = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            dst[x, y] = (int(nx / L * 127 + 128), int(ny / L * 127 + 128), int(nz / L * 127 + 128))
    return out


def generate_textures(folder):
    from PIL import Image, ImageDraw, ImageFilter

    os.makedirs(folder, exist_ok=True)
    size = 2048
    base = Image.new("RGB", (size, size), (40, 40, 40))
    height = Image.new("L", (size, size), 128)
    orm = Image.new("RGB", (size, size), (255, 180, 0))
    rng = random.Random(1899)
    draw_b = ImageDraw.Draw(base)
    draw_h = ImageDraw.Draw(height)
    draw_o = ImageDraw.Draw(orm)

    paints = {
        BRICK: ((158, 74, 62), 140, (255, 200, 0)),
        LIME: ((186, 176, 156), 168, (255, 130, 0)),
        GRAN: ((148, 144, 136), 150, (255, 150, 0)),
        SHING: ((112, 68, 54), 124, (255, 190, 0)),
        WOOD: ((96, 68, 46), 118, (255, 170, 0)),
        IRON: ((42, 44, 48), 100, (230, 100, 220)),
        COPP: ((146, 96, 62), 136, (240, 90, 230)),
        DARK: ((28, 26, 24), 70, (255, 80, 0)),
    }
    for region, (color, hval, orm_col) in paints.items():
        x0, y0, x1, y1 = _region_pixels(region, size)
        draw_b.rectangle([x0, y0, x1 - 1, y1 - 1], fill=color)
        draw_h.rectangle([x0, y0, x1 - 1, y1 - 1], fill=hval)
        draw_o.rectangle([x0, y0, x1 - 1, y1 - 1], fill=orm_col)

    # Flemish-bond suggestion: stretchers with a darker header every other brick.
    x0, y0, x1, y1 = _region_pixels(BRICK, size)
    mortar = (118, 96, 88)
    draw_b.rectangle([x0, y0, x1 - 1, y1 - 1], fill=mortar)
    bh, bw = 22, 52
    row = 0
    y = y0 + 1
    while y < y1 - 2:
        offset = bw // 2 if row % 2 else 0
        x = x0 - offset
        col_i = 0
        while x < x1:
            shade = rng.randint(-14, 12)
            color = (max(0, min(255, 158 + shade)), max(0, min(255, 74 + shade // 2)), max(0, min(255, 62 + shade // 3)))
            if col_i % 3 == 1:
                color = tuple(max(0, c - 18) for c in color)
            draw_b.rectangle([x + 1, y + 1, min(x1 - 1, x + bw - 2), min(y1 - 1, y + bh - 2)], fill=color)
            draw_h.rectangle([x + 1, y + 1, min(x1 - 1, x + bw - 2), min(y1 - 1, y + bh - 3)], fill=148 + shade // 2)
            x += bw
            col_i += 1
        y += bh
        row += 1

    # Shingle rows.
    x0, y0, x1, y1 = _region_pixels(SHING, size)
    sh = 28
    row = 0
    y = y0
    while y < y1:
        offset = 24 if row % 2 else 0
        x = x0 - offset
        while x < x1:
            shade = rng.randint(-16, 14)
            color = (max(0, 112 + shade), max(0, 68 + shade // 2), max(0, 54 + shade // 3))
            x_b = min(x1 - 1, x + 46)
            y_b = min(y1 - 1, y + sh - 1)
            if x_b > x + 1 and y_b > y + 2:
                draw_b.rectangle([x + 1, y + 2, x_b, y_b], fill=color)
                y_h0 = min(y_b, y + sh - 4)
                if y_b > y_h0:
                    draw_h.rectangle([x + 1, y_h0, x_b, y_b], fill=80)
            x += 48
        y += sh
        row += 1

    # Soft limestone clouding, not a shadow bake.
    x0, y0, x1, y1 = _region_pixels(LIME, size)
    for _ in range(30):
        w = rng.randint(40, 120)
        h = rng.randint(20, 70)
        x = rng.randint(x0, max(x0, x1 - w))
        y = rng.randint(y0, max(y0, y1 - h))
        shade = rng.randint(-10, 14)
        draw_h.ellipse([x, y, x + w, y + h], fill=168 + shade)

    base = base.filter(ImageFilter.SMOOTH)
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
        stone, glass, col = build(level)
        total = stone.tris + glass.tris
        print(f"LOD{level} tris {total} stone {stone.tris} glass {glass.tris} col {col.tris}")
        if total > cap or col.tris > 500:
            print(f"OVER BUDGET LOD{level}", file=sys.stderr)
            worst = 1
    print(
        f"gate {GATE_W:.2f}x{GATE_H:.2f} pav {PAV_W:.2f}x{PAV_D:.2f} "
        f"eave {Z_EAVE:.2f} peak {Z_EAVE + ROOF_RISE:.2f} outer {X_PAV_OUT:.2f}"
    )
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
    win_mat = make_window_material()
    repo = os.path.abspath(os.path.join(root, "..", "..", "..", ".."))
    public = os.path.join(repo, "public", "landmarks", "newark", SLUG)
    os.makedirs(public, exist_ok=True)

    roots = []
    for level in (0, 1, 2):
        stone, glass, col = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        body = acc_object(f"masonry-lod{level}", stone, main_mat)
        body.parent = parent
        wins = acc_object(f"windows-lod{level}", glass, win_mat)
        wins.parent = parent
        if col.tris:
            col_obj = acc_object(f"{SLUG}_COL", col, None)
            col_obj.name = f"{SLUG}_COL"
            col_obj.parent = parent
        roots.append(parent)
        print(f"LOD{level} tris {stone.tris + glass.tris} stone {stone.tris} glass {glass.tris} col {col.tris}")

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

    shots = os.environ.get("PAVILION_SHOTS")
    if shots:
        render_shots(roots, win_mat, shots)


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
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    def img_node(filename, noncolor, x, y):
        image = bpy.data.images.load(os.path.join(tex, filename))
        image.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
        image.filepath = "//textures/" + filename
        node = nodes.new("ShaderNodeTexImage")
        node.image = image
        node.location = (x, y)
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
    nmap.inputs["Strength"].default_value = 0.75
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    occ = nodes.new("ShaderNodeGroup")
    occ.node_tree = _gltf_occlusion_group()
    links.new(sep.outputs["Red"], occ.inputs["Occlusion"])
    return mat


def make_window_material():
    import bpy

    mat = bpy.data.materials.new(WIN_MAT)
    mat.use_nodes = True
    try:
        mat.use_backface_culling = False
    except Exception:
        pass
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (0.22, 0.18, 0.12, 1)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.78, 0.42, 1)
    bsdf.inputs["Emission Strength"].default_value = 0.45
    bsdf.inputs["Roughness"].default_value = 0.22
    bsdf.inputs["Metallic"].default_value = 0.0
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


def render_shots(roots, win_mat, folder):
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
    bg.inputs[0].default_value = (0.52, 0.66, 0.84, 1)
    bg.inputs[1].default_value = 0.75

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.4
    sun_data.angle = 0.35
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.85, 0.1, -0.4)

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 400
    fill_data.size = 30
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)
    _look_at(fill, (-20, 18, 12), (0, 0, 3))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 32
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground = bpy.data.meshes.new("ground")
    ground.from_pydata(
        [(-40, -28, -0.02), (40, -28, -0.02), (40, 28, -0.02), (-40, 28, -0.02)],
        [],
        [(0, 1, 2, 3)],
    )
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.22, 0.22, 0.2, 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.88
    gobj = bpy.data.objects.new("ground", ground)
    gobj.data.materials.append(gmat)
    scene.collection.objects.link(gobj)

    def show(level):
        for i, root in enumerate(roots):
            _hide_tree(root, i != level)

    target = (0.0, 0.2, 3.2)
    shots = [
        ("front", (0.0, 38.0, 5.5), target),
        ("side", (42.0, 2.0, 6.0), target),
        ("back", (0.4, -36.0, 6.2), (0.0, 0.0, 3.4)),
        ("three-quarter", (24.0, 28.0, 7.0), target),
    ]
    show(0)
    for name, loc, tgt in shots:
        _look_at(cam, loc, tgt)
        scene.render.filepath = os.path.join(folder, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("shot", name)

    bg.inputs[0].default_value = (0.015, 0.02, 0.05, 1)
    bg.inputs[1].default_value = 0.3
    sun_data.energy = 0.12
    sun_data.color = (0.7, 0.78, 1.0)
    fill_data.energy = 30
    for mat in bpy.data.materials:
        if mat.name != WIN_MAT or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Emission Strength"].default_value = 6.0
    _look_at(cam, (22.0, 26.0, 6.0), target)
    scene.render.filepath = os.path.join(folder, "night.png")
    bpy.ops.render.render(write_still=True)
    print("shot night")
    for mat in bpy.data.materials:
        if mat.name != WIN_MAT or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Emission Strength"].default_value = 0.45
    sun_data.energy = 3.4
    sun_data.color = (1, 1, 1)
    bg.inputs[0].default_value = (0.52, 0.66, 0.84, 1)
    bg.inputs[1].default_value = 0.75

    show(0)
    body = None
    for child in roots[0].children:
        if child.name.startswith("masonry"):
            body = child
    if body is not None:
        mod = body.modifiers.new("wire", "WIREFRAME")
        mod.thickness = 0.04
        mod.use_replace = True
        _look_at(cam, (24.0, 28.0, 7.0), target)
        scene.render.filepath = os.path.join(folder, "wire-lod0.png")
        bpy.ops.render.render(write_still=True)
        body.modifiers.remove(mod)
        print("shot wire")

    gobj.hide_render = True
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 78
    offsets = (-26.0, 0.0, 26.0)
    for root, dx in zip(roots, offsets):
        _hide_tree(root, False)
        root.location.x = dx
    _look_at(cam, (0, 50, 6), (0, 0, 3))
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
