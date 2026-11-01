#!/usr/bin/env python3
"""Octagon Shelter on Meeker Mound, Branch Brook Park, Newark.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
The north opening (the path up the mound) faces Blender +Y.

    python3 build_octagon.py --counts
    python3 build_octagon.py
    blender -b --factory-startup --python build_octagon.py

Dimensions and materials are the 1906 pavilion described in the Branch Brook
Park Cultural Landscape Report, Volume 4 (January 2005), prepared for Essex
County: eight sides of 13 ft 10 in, about 33 ft 9 in across, 22 ft 6 in high,
brick with limestone trim on a granite plinth, four low walls and four
openings, terra-cotta hip roof (the original covering), rafters 4 ft past the
face. The mesh is that intact pavilion, not the damaged 2005 condition.

No Google imagery. No vegetation. No paid add-ons. Run with --factory-startup.
"""

from __future__ import annotations

import math
import os
import random
import sys

FT = 0.3048
SIDE = (13.0 + 10.0 / 12.0) * FT
A = SIDE / (2.0 * math.tan(math.pi / 8.0))
HALF = 0.28
WT = (1.0 + 4.0 / 12.0) * FT
PLINTH_H = 0.5 * FT
BASE_H = (1.0 + 4.0 / 12.0) * FT
BASE_TOP = PLINTH_H + BASE_H
SILL_T = 0.11
WALL_TOP = 1.42
BRICK_TOP = WALL_TOP - SILL_T
COL_TOP = 3.22
CAP_H = 0.15
CAP_TOP = COL_TOP + CAP_H
BEAM_W = 12.0 / 12.0 * FT
BEAM_D = 0.26
BEAM_TOP = CAP_TOP + BEAM_D
PEAK = 22.5 * FT
OVERHANG = 4.0 * FT
AR = A + OVERHANG
DECK = 0.05
RAFTER_D = 0.19
HIP_D = 0.216
RING_A = 0.58
BEARING = A - 0.22
Z_BEARING = BEAM_TOP + RAFTER_D + DECK
TAN_PITCH = (PEAK - Z_BEARING) / BEARING
Z_EAVE = PEAK - TAN_PITCH * AR
A_IN = A - WT - 0.02
A_OUT = A + 0.09
FLOOR_Z = PLINTH_H + 0.008

# Atlas rectangles (u, v, w, h). v is the bottom of the region.
BRICK = (0.00, 0.00, 0.50, 0.50)
LIME = (0.50, 0.00, 0.25, 0.50)
GRAN = (0.75, 0.00, 0.25, 0.50)
WOOD = (0.00, 0.50, 0.50, 0.25)
FLOOR = (0.50, 0.50, 0.50, 0.25)
TILE = (0.00, 0.75, 0.50, 0.25)
IRON = (0.50, 0.75, 0.25, 0.25)

SLUG = "branch-brook-park-octagon-shelter"
MAIN_MAT = f"{SLUG}-main"
LAMP_MAT = "emissive-lamp"


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
    uvs = ((u + 0.002, v + 0.002), (u + w - 0.002, v + 0.002), (u + w - 0.002, v + h - 0.002), (u + 0.002, v + h - 0.002))
    ids = [acc.add(p, uv) for p, uv in zip(order, uvs)]
    acc.tri(ids[0], ids[1], ids[2])
    acc.tri(ids[0], ids[2], ids[3])


def add_tri(acc, p0, p1, p2, region, hint):
    n = _normal(p0, p1, p2)
    if n is None:
        return
    if vdot(n, hint) < 0:
        p1, p2 = p2, p1
    u, v, w, h = region
    uvs = ((u + w * 0.5, v + h * 0.08), (u + 0.004, v + h * 0.96), (u + w - 0.004, v + h * 0.96))
    ids = [acc.add(p, uv) for p, uv in zip((p0, p1, p2), uvs)]
    acc.tri(ids[0], ids[1], ids[2])


def add_aabb(acc, x0, x1, y0, y1, z0, z1, region, z_tile=0.0, bottom=True, top=True):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    if z1 < z0:
        z0, z1 = z1, z0
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return

    def sides(za, zb):
        add_quad(acc, (x0, y0, za), (x1, y0, za), (x1, y0, zb), (x0, y0, zb), region, (0, -1, 0))
        add_quad(acc, (x1, y1, za), (x0, y1, za), (x0, y1, zb), (x1, y1, zb), region, (0, 1, 0))
        add_quad(acc, (x0, y1, za), (x0, y0, za), (x0, y0, zb), (x0, y1, zb), region, (-1, 0, 0))
        add_quad(acc, (x1, y0, za), (x1, y1, za), (x1, y1, zb), (x1, y0, zb), region, (1, 0, 0))

    if z_tile and (z1 - z0) > z_tile * 1.35:
        n = max(1, int(round((z1 - z0) / z_tile)))
        for i in range(n):
            sides(z0 + (z1 - z0) * i / n, z0 + (z1 - z0) * (i + 1) / n)
    else:
        sides(z0, z1)
    if top:
        add_quad(acc, (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1), region, (0, 0, 1))
    if bottom:
        add_quad(acc, (x0, y1, z0), (x1, y1, z0), (x1, y0, z0), (x0, y0, z0), region, (0, 0, -1))


def add_obox(acc, center, ux, uy, uz, hx, hy, hz, region, u_tile=0.0):
    ux, uy, uz = vnorm(ux), vnorm(uy), vnorm(uz)
    if min(hx, hy, hz) < 1e-4:
        return
    if u_tile and hx * 2 > u_tile * 1.45:
        n = max(1, int(round((hx * 2) / u_tile)))
        step = (hx * 2) / n
        for i in range(n):
            c = vadd(center, vscale(ux, -hx + step * (i + 0.5)))
            add_obox(acc, c, ux, uy, uz, step * 0.5, hy, hz, region, 0.0)
        return

    def p(sx, sy, sz):
        return vadd(center, vadd(vscale(ux, sx * hx), vadd(vscale(uy, sy * hy), vscale(uz, sz * hz))))

    add_quad(acc, p(1, -1, -1), p(1, 1, -1), p(1, 1, 1), p(1, -1, 1), region, ux)
    add_quad(acc, p(-1, 1, -1), p(-1, -1, -1), p(-1, -1, 1), p(-1, 1, 1), region, vscale(ux, -1))
    add_quad(acc, p(-1, 1, -1), p(1, 1, -1), p(1, 1, 1), p(-1, 1, 1), region, uy)
    add_quad(acc, p(1, -1, -1), p(-1, -1, -1), p(-1, -1, 1), p(1, -1, 1), region, vscale(uy, -1))
    add_quad(acc, p(-1, -1, 1), p(1, -1, 1), p(1, 1, 1), p(-1, 1, 1), region, uz)
    add_quad(acc, p(-1, 1, -1), p(1, 1, -1), p(1, -1, -1), p(-1, -1, -1), region, vscale(uz, -1))


def ang_of(k):
    return math.radians(67.5 + 45.0 * (k % 8))


def oct_xyz(k, apothem, z):
    ang = ang_of(k)
    rad = apothem / math.cos(math.radians(22.5))
    return (rad * math.cos(ang), rad * math.sin(ang), z)


def side_normal(k):
    ang = math.radians(90.0 + 45.0 * (k % 8))
    return (math.cos(ang), math.sin(ang))


def apothem_of(x, y):
    ax, ay = abs(x), abs(y)
    return max(ax, ay, (ax + ay) * math.sqrt(0.5))


def roof_z(x, y):
    return PEAK - TAN_PITCH * min(apothem_of(x, y), AR)


def column_center(k):
    ang = ang_of(k)
    sx = 1.0 if math.cos(ang) >= 0 else -1.0
    sy = 1.0 if math.sin(ang) >= 0 else -1.0
    if abs(math.sin(ang)) >= abs(math.cos(ang)):
        cy = sy * (A - HALF)
        cx = sx * abs(cy) * abs(math.cos(ang) / math.sin(ang))
    else:
        cx = sx * (A - HALF)
        cy = sy * abs(cx) * abs(math.sin(ang) / math.cos(ang))
    return (cx, cy)


def add_oct_surface(acc, apothem, z_at, region, tile, up=True):
    """Octagon disk or cone. Quads stay near `tile` metres so a texture repeat is not stretched into a streak."""
    tile = max(tile, 0.25)
    rings = max(1, int(round(apothem / tile)))
    hint = (0.0, 0.0, 1.0 if up else -1.0)
    for r in range(rings):
        a0 = apothem * r / rings
        a1 = apothem * (r + 1) / rings
        z0 = z_at(a0)
        z1 = z_at(a1)
        edge = 2.0 * max(a1, tile) * math.tan(math.pi / 8.0)
        segs = 1 if a0 < 1e-5 else max(1, int(round(edge / tile)))
        for k in range(8):
            for s in range(segs):
                t0 = s / segs
                t1 = (s + 1) / segs

                def pt(a, z, t, kk=k):
                    p0 = oct_xyz(kk, a, z)
                    p1 = oct_xyz(kk + 1, a, z)
                    return (p0[0] + (p1[0] - p0[0]) * t, p0[1] + (p1[1] - p0[1]) * t, z)

                if a0 < 1e-5:
                    add_tri(acc, (0.0, 0.0, z0), pt(a1, z1, t0), pt(a1, z1, t1), region, hint)
                else:
                    add_quad(
                        acc,
                        pt(a0, z0, t0),
                        pt(a0, z0, t1),
                        pt(a1, z1, t1),
                        pt(a1, z1, t0),
                        region,
                        hint,
                    )


def add_plinth(acc):
    for k in range(8):
        n = side_normal(k)
        hint = (n[0], n[1], 0.0)
        inn = (-n[0], -n[1], 0.0)
        o0 = oct_xyz(k, A_OUT, 0.0)
        o1 = oct_xyz(k + 1, A_OUT, 0.0)
        o0t = oct_xyz(k, A_OUT, PLINTH_H)
        o1t = oct_xyz(k + 1, A_OUT, PLINTH_H)
        i0 = oct_xyz(k, A_IN, 0.0)
        i1 = oct_xyz(k + 1, A_IN, 0.0)
        i0t = oct_xyz(k, A_IN, PLINTH_H)
        i1t = oct_xyz(k + 1, A_IN, PLINTH_H)
        add_quad(acc, o0, o1, o1t, o0t, GRAN, hint)
        add_quad(acc, i1, i0, i0t, i1t, GRAN, inn)
        add_quad(acc, i0t, i1t, o1t, o0t, GRAN, (0, 0, 1))


def add_columns(acc, level, col):
    z_tile = 0.42 if level == 0 else 0.0
    for k in range(8):
        cx, cy = column_center(k)
        h = HALF
        if level >= 2:
            add_aabb(acc, cx - h, cx + h, cy - h, cy + h, PLINTH_H, COL_TOP, BRICK, bottom=False)
            add_aabb(acc, cx - h - 0.03, cx + h + 0.03, cy - h - 0.03, cy + h + 0.03, COL_TOP, CAP_TOP, LIME, bottom=False)
        else:
            add_aabb(acc, cx - h - 0.03, cx + h + 0.03, cy - h - 0.03, cy + h + 0.03, PLINTH_H, BASE_TOP, LIME, bottom=False)
            add_aabb(acc, cx - h, cx + h, cy - h, cy + h, BASE_TOP - 0.01, COL_TOP, BRICK, z_tile=z_tile, bottom=False)
            add_aabb(
                acc,
                cx - h - 0.025,
                cx + h + 0.025,
                cy - h - 0.025,
                cy + h + 0.025,
                BRICK_TOP,
                WALL_TOP,
                LIME,
                bottom=False,
            )
            add_aabb(acc, cx - h - 0.04, cx + h + 0.04, cy - h - 0.04, cy + h + 0.04, COL_TOP - 0.01, CAP_TOP, LIME, bottom=False)
        if col is not None:
            add_aabb(col, cx - h, cx + h, cy - h, cy + h, 0.0, CAP_TOP, BRICK, bottom=False)


def wall_frame(acc, center, tangent, normal, length, thick, z0, z1, panel):
    ux = (tangent[0], tangent[1], 0.0)
    uy = (normal[0], normal[1], 0.0)
    uz = (0.0, 0.0, 1.0)
    if not panel or (z1 - z0) < 0.45:
        c = (center[0], center[1], (z0 + z1) * 0.5)
        add_obox(acc, c, ux, uy, uz, length * 0.5, thick * 0.5, (z1 - z0) * 0.5, BRICK, u_tile=0.55)
        return
    rail = 0.12
    stile = 0.16
    recess = 0.09
    c = (center[0], center[1], 0.0)

    def at(along, z_mid, half_l, half_h, th):
        p = vadd(c, vadd(vscale(ux, along), (0.0, 0.0, z_mid)))
        add_obox(acc, p, ux, uy, uz, half_l, th * 0.5, half_h, BRICK)

    at(0.0, z0 + rail * 0.5, length * 0.5, rail * 0.5, thick)
    at(0.0, z1 - rail * 0.5, length * 0.5, rail * 0.5, thick)
    inner_h = (z1 - z0 - 2 * rail) * 0.5
    z_mid = (z0 + z1) * 0.5
    at(-length * 0.5 + stile * 0.5, z_mid, stile * 0.5, inner_h + 0.01, thick)
    at(length * 0.5 - stile * 0.5, z_mid, stile * 0.5, inner_h + 0.01, thick)
    panel_l = length - 2 * stile + 0.02
    at(0.0, z_mid, panel_l * 0.5, inner_h + 0.005, thick - 2 * recess)


def add_walls(acc, level, col):
    for k in range(8):
        if k % 2 == 0:
            continue
        c0 = column_center(k)
        c1 = column_center(k + 1)
        dx, dy = c1[0] - c0[0], c1[1] - c0[1]
        dist = math.hypot(dx, dy)
        tangent = (dx / dist, dy / dist)
        normal = side_normal(k)
        mx, my = (c0[0] + c1[0]) * 0.5, (c0[1] + c1[1]) * 0.5
        inset = HALF * (abs(tangent[0]) + abs(tangent[1])) - 0.015
        span = dist - 2 * inset
        shift = (A - WT * 0.5) - (mx * normal[0] + my * normal[1])
        center = (mx + normal[0] * shift, my + normal[1] * shift)
        if level >= 2:
            add_obox(
                acc,
                (center[0], center[1], (PLINTH_H + WALL_TOP) * 0.5),
                (tangent[0], tangent[1], 0),
                (normal[0], normal[1], 0),
                (0, 0, 1),
                span * 0.5,
                WT * 0.5,
                (WALL_TOP - PLINTH_H) * 0.5,
                BRICK,
            )
            if col is not None:
                add_obox(
                    col,
                    (center[0], center[1], WALL_TOP * 0.5),
                    (tangent[0], tangent[1], 0),
                    (normal[0], normal[1], 0),
                    (0, 0, 1),
                    span * 0.5,
                    WT * 0.5,
                    WALL_TOP * 0.5,
                    BRICK,
                )
            continue
        wall_frame(acc, center, tangent, normal, span, WT, BASE_TOP, BRICK_TOP, panel=(level == 0))
        sill_th = WT + 0.045
        c_s = (center[0], center[1], WALL_TOP - SILL_T * 0.5)
        add_obox(
            acc,
            (c_s[0], c_s[1], c_s[2]),
            (tangent[0], tangent[1], 0),
            (normal[0], normal[1], 0),
            (0, 0, 1),
            span * 0.5 + 0.02,
            sill_th * 0.5,
            SILL_T * 0.5,
            LIME,
        )
        base_th = WT + 0.03
        add_obox(
            acc,
            (center[0], center[1], (PLINTH_H + BASE_TOP) * 0.5),
            (tangent[0], tangent[1], 0),
            (normal[0], normal[1], 0),
            (0, 0, 1),
            span * 0.5,
            base_th * 0.5,
            (BASE_TOP - PLINTH_H) * 0.5,
            LIME,
        )
        if col is not None:
            add_obox(
                col,
                (center[0], center[1], WALL_TOP * 0.5),
                (tangent[0], tangent[1], 0),
                (normal[0], normal[1], 0),
                (0, 0, 1),
                span * 0.5,
                WT * 0.5,
                WALL_TOP * 0.5,
                BRICK,
            )


def add_beams(acc, level):
    tile = 0.7 if level == 0 else 0.0
    for k in range(8):
        c0 = column_center(k)
        c1 = column_center(k + 1)
        dx, dy = c1[0] - c0[0], c1[1] - c0[1]
        dist = math.hypot(dx, dy)
        tangent = (dx / dist, dy / dist, 0.0)
        normal = side_normal(k)
        span = dist - HALF * 1.15
        mid = ((c0[0] + c1[0]) * 0.5, (c0[1] + c1[1]) * 0.5, CAP_TOP + BEAM_D * 0.5)
        add_obox(acc, mid, tangent, (normal[0], normal[1], 0), (0, 0, 1), span * 0.5, BEAM_W * 0.5, BEAM_D * 0.5, WOOD, u_tile=tile)


def add_brackets(acc, level):
    steps = 2 if level == 0 else 1
    for k in range(8):
        c0 = column_center(k)
        c1 = column_center(k + 1)
        dx, dy = c1[0] - c0[0], c1[1] - c0[1]
        dist = math.hypot(dx, dy)
        tangent = (dx / dist, dy / dist, 0.0)
        normal = side_normal(k)
        across = (normal[0], normal[1], 0.0)
        for end, sign in ((c0, 1.0), (c1, -1.0)):
            direction = vscale(tangent, sign)
            for s in range(steps):
                reach = 0.16 + 0.16 * (steps - 1 - s)
                drop = 0.10 + 0.12 * s
                along = HALF * 0.72 + reach * 0.5
                center = (
                    end[0] + direction[0] * along,
                    end[1] + direction[1] * along,
                    CAP_TOP - drop * 0.5 - (0.10 * s),
                )
                add_obox(acc, center, direction, across, (0, 0, 1), reach * 0.5, 0.07, drop * 0.5, WOOD)


def _ray_t(p, d, a, b):
    bx, by = b[0] - a[0], b[1] - a[1]
    ax, ay = a[0] - p[0], a[1] - p[1]
    det = d[0] * (-by) - (-bx) * d[1]
    if abs(det) < 1e-9:
        return None
    t = (ax * (-by) - (-bx) * ay) / det
    s = (d[0] * ay - d[1] * ax) / det
    if t > 0.08 and -0.02 <= s <= 1.02:
        return t
    return None


def add_rafter(acc, xy0, xy1, depth, width):
    z0 = roof_z(*xy0) - DECK
    z1 = roof_z(*xy1) - DECK
    a = (xy0[0], xy0[1], z0)
    b = (xy1[0], xy1[1], z1)
    along = vnorm(vsub(b, a))
    plan = vnorm((b[0] - a[0], b[1] - a[1], 0.0))
    across = vnorm(vcross((0.0, 0.0, 1.0), plan))
    up = vnorm(vcross(along, across))
    if up[2] < 0:
        up = vscale(up, -1)
    center = vadd(lerp(a, b, 0.5), vscale(up, -depth * 0.5))
    add_obox(acc, center, along, across, up, vlen(vsub(b, a)) * 0.5, width * 0.5, depth * 0.5, WOOD)


def add_rafters(acc, level):
    per = 7 if level == 0 else 3
    for k in range(8):
        e0 = oct_xyz(k, AR, 0.0)
        e1 = oct_xyz(k + 1, AR, 0.0)
        r0 = oct_xyz(k, RING_A, 0.0)
        r1 = oct_xyz(k + 1, RING_A, 0.0)
        n = side_normal(k)
        inward = (-n[0], -n[1])
        for i in range(per):
            u = (i + 1) / (per + 1)
            px = e0[0] + (e1[0] - e0[0]) * u
            py = e0[1] + (e1[1] - e0[1]) * u
            hits = []
            for a, b in ((e0, r0), (e1, r1), (r0, r1)):
                t = _ray_t((px, py), inward, a, b)
                if t is not None:
                    hits.append(t)
            if not hits:
                continue
            t = min(hits) * 0.98
            add_rafter(acc, (px, py), (px + inward[0] * t, py + inward[1] * t), RAFTER_D, 0.076)
        add_rafter(acc, (e0[0], e0[1]), (r0[0], r0[1]), HIP_D, 0.13)


def add_ring(acc):
    z = roof_z(0.0, RING_A) - DECK - 0.04
    for k in range(8):
        a = oct_xyz(k, RING_A, z)
        b = oct_xyz(k + 1, RING_A, z)
        dx, dy = b[0] - a[0], b[1] - a[1]
        dist = math.hypot(dx, dy)
        mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, z)
        add_obox(acc, mid, (dx / dist, dy / dist, 0), side_normal(k) + (0,), (0, 0, 1), dist * 0.5, 0.07, 0.09, WOOD)


def add_fascia(acc):
    for k in range(8):
        n = side_normal(k)
        a = oct_xyz(k, AR, Z_EAVE)
        b = oct_xyz(k + 1, AR, Z_EAVE)
        dx, dy = b[0] - a[0], b[1] - a[1]
        dist = math.hypot(dx, dy)
        mid = ((a[0] + b[0]) * 0.5 + n[0] * 0.02, (a[1] + b[1]) * 0.5 + n[1] * 0.02, Z_EAVE - 0.09)
        add_obox(acc, mid, (dx / dist, dy / dist, 0), (n[0], n[1], 0), (0, 0, 1), dist * 0.52, 0.035, 0.09, WOOD)


def add_finial(acc):
    tip = (0.0, 0.0, PEAK + 0.26)
    for k in range(8):
        add_tri(acc, oct_xyz(k, 0.16, PEAK - 0.01), oct_xyz(k + 1, 0.16, PEAK - 0.01), tip, TILE, (0, 0, 1))


def add_lantern(main, lamp, level):
    # Hangs in the open bay, about 2.8 m up, so it reads through the entrances.
    z = 2.75
    if level == 2:
        add_aabb(lamp, -0.12, 0.12, -0.12, 0.12, z - 0.16, z + 0.16, IRON, bottom=True, top=True)
        return
    add_aabb(main, -0.016, 0.016, -0.016, 0.016, z + 0.42, PEAK - DECK - 0.2, IRON, bottom=False, top=False)
    add_aabb(main, -0.16, 0.16, -0.16, 0.16, z + 0.32, z + 0.42, IRON)
    add_aabb(main, -0.14, 0.14, -0.14, 0.14, z - 0.28, z - 0.18, IRON)
    add_aabb(lamp, -0.10, 0.10, -0.10, 0.10, z - 0.16, z + 0.20, IRON)
    if level == 0:
        for sx in (-1, 1):
            for sy in (-1, 1):
                add_aabb(main, sx * 0.09, sx * 0.09 + sx * 0.025, sy * 0.09, sy * 0.09 + sy * 0.025, z - 0.13, z + 0.28, IRON, bottom=False, top=False)


def build(level):
    main = Acc()
    lamp = Acc()
    col = Acc() if level == 0 else None
    roof_tile = (0.85, 1.7, 8.0)[level]
    floor_tile = (0.7, 1.4, 8.0)[level]
    add_plinth(main)
    add_oct_surface(main, A_IN - 0.01, lambda a: FLOOR_Z, FLOOR, floor_tile, up=True)
    add_columns(main, level, col)
    add_walls(main, level, col)
    add_oct_surface(main, AR, lambda a: PEAK - TAN_PITCH * a, TILE, roof_tile, up=True)
    under = (1.4, 2.4, 8.0)[level]
    add_oct_surface(main, AR - 0.04, lambda a: PEAK - TAN_PITCH * a - DECK - 0.01, WOOD, under, up=False)
    if level < 2:
        add_beams(main, level)
        add_brackets(main, level)
        add_rafters(main, level)
        add_ring(main)
        add_fascia(main)
        add_finial(main)
    add_lantern(main, lamp, level)
    return main, lamp, col


def _region_pixels(region, size):
    u, v, w, h = region
    x0 = int(round(u * size))
    x1 = int(round((u + w) * size))
    y0 = int(round((1.0 - (v + h)) * size))
    y1 = int(round((1.0 - v) * size))
    return x0, y0, max(x0 + 1, x1), max(y0 + 1, y1)


def generate_textures(folder):
    from PIL import Image, ImageDraw, ImageFilter

    os.makedirs(folder, exist_ok=True)
    size = 1024
    base = Image.new("RGB", (size, size), (0, 0, 0))
    height = Image.new("L", (size, size), 128)
    orm = Image.new("RGB", (size, size), (255, 170, 0))
    draw_b = ImageDraw.Draw(base)
    draw_h = ImageDraw.Draw(height)
    draw_o = ImageDraw.Draw(orm)
    paints = {
        BRICK: ((176, 104, 96), 142, (255, 176, 0)),
        LIME: ((210, 202, 188), 168, (255, 142, 0)),
        GRAN: ((132, 130, 126), 118, (255, 198, 0)),
        WOOD: ((118, 82, 52), 150, (255, 168, 0)),
        FLOOR: ((158, 90, 82), 130, (255, 188, 0)),
        TILE: ((168, 78, 54), 146, (255, 150, 0)),
        IRON: ((48, 46, 44), 96, (230, 78, 190)),
    }
    rng = random.Random(1906)
    for region, (color, hval, orm_col) in paints.items():
        x0, y0, x1, y1 = _region_pixels(region, size)
        draw_b.rectangle([x0, y0, x1 - 1, y1 - 1], fill=color)
        draw_h.rectangle([x0, y0, x1 - 1, y1 - 1], fill=hval)
        draw_o.rectangle([x0, y0, x1 - 1, y1 - 1], fill=orm_col)

    def courses(region, gap, mortar):
        x0, y0, x1, y1 = _region_pixels(region, size)
        color = paints[region][0]
        y = y0 + 6
        row = 0
        while y < y1 - 2:
            draw_h.line([(x0, y), (x1 - 1, y)], fill=max(0, paints[region][1] - 58), width=2)
            draw_b.line([(x0, y), (x1 - 1, y)], fill=tuple(max(0, c - mortar) for c in color), width=2)
            x = x0 + (gap // 3 if row % 2 else 6)
            while x < x1:
                draw_h.line([(x, y), (x, min(y1 - 1, y + gap - 2))], fill=max(0, paints[region][1] - 40), width=2)
                x += gap
            y += gap
            row += 1

    courses(BRICK, 36, 28)
    courses(FLOOR, 28, 24)
    # Herringbone shift on the floor: a second set of short joints.
    x0, y0, x1, y1 = _region_pixels(FLOOR, size)
    for i in range(0, x1 - x0, 22):
        draw_b.line([(x0 + i, y0), (x1 - 1, y0 + (x1 - x0 - i))], fill=(120, 64, 58), width=1)

    x0, y0, x1, y1 = _region_pixels(LIME, size)
    x = x0 + 8
    while x < x1:
        draw_h.line([(x, y0), (x, y1 - 1)], fill=188, width=2)
        draw_b.line([(x, y0), (x, y1 - 1)], fill=(196, 188, 174), width=1)
        x += 14

    x0, y0, x1, y1 = _region_pixels(GRAN, size)
    pix = base.load()
    hp = height.load()
    for _ in range(700):
        x = rng.randrange(x0, x1)
        y = rng.randrange(y0, y1)
        shade = rng.randrange(-28, 22)
        pix[x, y] = tuple(max(0, min(255, c + shade)) for c in paints[GRAN][0])
        hp[x, y] = max(0, min(255, paints[GRAN][1] + shade))

    x0, y0, x1, y1 = _region_pixels(WOOD, size)
    y = y0 + 4
    while y < y1:
        tone = 96 + (y // 7) % 5 * 6
        draw_b.line([(x0, y), (x1 - 1, y)], fill=(tone + 20, tone - 8, tone - 36), width=1)
        y += 5

    x0, y0, x1, y1 = _region_pixels(TILE, size)
    row = 0
    y = y0
    while y < y1:
        draw_h.rectangle([x0, y, x1 - 1, min(y1 - 1, y + 4)], fill=186)
        draw_b.line([(x0, y), (x1 - 1, y)], fill=(120, 48, 34), width=2)
        x = x0 + (16 if row % 2 else 2)
        while x < x1:
            draw_h.line([(x, y), (x, min(y1 - 1, y + 26))], fill=96, width=2)
            x += 32
        y += 72
        row += 1

    height = height.filter(ImageFilter.SMOOTH)
    normal = _normal_from_height(height)
    base.save(os.path.join(folder, "main-basecolor.png"), "PNG", optimize=True)
    normal.save(os.path.join(folder, "main-normal.png"), "PNG", optimize=True)
    orm.save(os.path.join(folder, "main-orm.png"), "PNG", optimize=True)
    print("textures", folder)


def _normal_from_height(height_img):
    from PIL import Image

    w, h = height_img.size
    step = 2
    sw, sh = w // step, h // step
    small = height_img.resize((sw, sh), Image.BILINEAR)
    src = small.load()
    out = Image.new("RGB", (sw, sh))
    dst = out.load()
    for y in range(sh):
        y0 = max(0, y - 1)
        y1 = min(sh - 1, y + 1)
        for x in range(sw):
            x0 = max(0, x - 1)
            x1 = min(sw - 1, x + 1)
            dx = (src[x1, y] - src[x0, y]) / 255.0
            dy = (src[x, y0] - src[x, y1]) / 255.0
            nx, ny, nz = -dx * 2.4, -dy * 2.4, 1.0
            L = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            dst[x, y] = (
                int((nx / L * 0.5 + 0.5) * 255),
                int((ny / L * 0.5 + 0.5) * 255),
                int((nz / L * 0.5 + 0.5) * 255),
            )
    return out.resize((w, h), Image.BILINEAR)


def count_only():
    print(
        f"side {SIDE:.3f} m  flat-to-flat {A * 2:.3f} m ({A * 2 / FT:.2f} ft)  "
        f"across report {33.75 * FT:.3f} m"
    )
    print(
        f"peak {PEAK:.3f}  eave {Z_EAVE:.3f}  pitch {math.degrees(math.atan(TAN_PITCH)):.1f} deg  "
        f"beam top {BEAM_TOP:.3f}  bearing roof {Z_BEARING:.3f}"
    )
    # Middle jack on the north eave should reach the ring.
    n = side_normal(0)
    inward = (-n[0], -n[1])
    e0 = oct_xyz(0, AR, 0.0)
    e1 = oct_xyz(1, AR, 0.0)
    px, py = (e0[0] + e1[0]) * 0.5, (e0[1] + e1[1]) * 0.5
    r0 = oct_xyz(0, RING_A, 0.0)
    r1 = oct_xyz(1, RING_A, 0.0)
    t = _ray_t((px, py), inward, r0, r1)
    print(f"north mid jack t {t} inward {inward} start {(px, py)}")
    caps = (8000, 2000, 500)
    worst = 0
    for level, name in ((0, "LOD0"), (1, "LOD1"), (2, "LOD2")):
        main, lamp, col = build(level)
        xs = [p[0] for p in main.V]
        ys = [p[1] for p in main.V]
        zs = [p[2] for p in main.V]
        total = main.tris + lamp.tris
        print(
            f"{name} main {main.tris} lamp {lamp.tris} col {col.tris if col else 0} "
            f"sum {total}  bounds x {min(xs):.2f}..{max(xs):.2f} "
            f"y {min(ys):.2f}..{max(ys):.2f} z {min(zs):.2f}..{max(zs):.2f}"
        )
        if total > caps[level]:
            print(f"OVER SMALL BUDGET {name} {total} > {caps[level]}", file=sys.stderr)
            worst = 1
        if min(zs) < -0.01 or max(zs) > PEAK + 0.4:
            print(f"BAD HEIGHT {name}", file=sys.stderr)
            worst = 1
    return worst


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
    nmap.inputs["Strength"].default_value = 0.65
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    occ = nodes.new("ShaderNodeGroup")
    occ.node_tree = _gltf_occlusion_group()
    occ.location = (-80, -520)
    links.new(sep.outputs["Red"], occ.inputs["Occlusion"])
    return mat


def make_lamp_material():
    import bpy

    mat = bpy.data.materials.new(LAMP_MAT)
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (1.0, 0.72, 0.38, 1.0)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.72, 0.36, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.4
    bsdf.inputs["Roughness"].default_value = 0.18
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def acc_object(name, acc, material, uv=True):
    import bpy

    mesh = bpy.data.meshes.new(name + "-mesh")
    mesh.from_pydata(acc.V, [], [list(f) for f in acc.F])
    mesh.validate(clean_customdata=False)
    mesh.update()
    if uv:
        layer = mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            poly.use_smooth = False
            for li in poly.loop_indices:
                vi = mesh.loops[li].vertex_index
                layer.data[li].uv = acc.UV[vi]
    else:
        for poly in mesh.polygons:
            poly.use_smooth = False
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    if material is not None:
        obj.data.materials.append(material)
    return obj


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


def apply_comic(mat):
    """Shot-only cel ramp. The saved blend and the glb stay PBR."""
    import bpy

    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    base = None
    out = None
    for node in nodes:
        if node.type == "OUTPUT_MATERIAL":
            out = node
        if node.type == "TEX_IMAGE" and node.image and "basecolor" in node.image.name:
            base = node
    if out is None:
        return
    diff = nodes.new("ShaderNodeBsdfDiffuse")
    diff.inputs["Color"].default_value = (1, 1, 1, 1)
    diff.inputs["Roughness"].default_value = 1.0
    s2 = nodes.new("ShaderNodeShaderToRGB")
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.22
    ramp.color_ramp.elements[0].color = (0.32, 0.34, 0.40, 1)
    ramp.color_ramp.elements[1].position = 0.58
    ramp.color_ramp.elements[1].color = (0.70, 0.72, 0.76, 1)
    hi = ramp.color_ramp.elements.new(0.84)
    hi.color = (1.0, 1.0, 1.0, 1)
    mult = nodes.new("ShaderNodeMixRGB")
    mult.blend_type = "MULTIPLY"
    mult.inputs["Fac"].default_value = 1.0
    emit = nodes.new("ShaderNodeEmission")
    emit.inputs["Strength"].default_value = 1.15
    links.new(diff.outputs["BSDF"], s2.inputs["Shader"])
    links.new(s2.outputs["Color"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Color"], mult.inputs["Color1"])
    if base is not None:
        links.new(base.outputs["Color"], mult.inputs["Color2"])
    else:
        mult.inputs["Color2"].default_value = (0.72, 0.42, 0.38, 1)
    links.new(mult.outputs["Color"], emit.inputs["Color"])
    # Replace whatever was driving the surface. Export already happened.
    for link in list(out.inputs["Surface"].links):
        links.remove(link)
    links.new(emit.outputs["Emission"], out.inputs["Surface"])


def setup_ink(scene):
    """Black ink from depth jumps and normal creases. One pixel, thickened once."""
    import bpy

    scene.use_nodes = True
    scene.render.use_compositing = True
    view = scene.view_layers[0]
    view.use_pass_z = True
    view.use_pass_normal = True
    nt = scene.node_tree
    nt.nodes.clear()
    links = nt.links
    rl = nt.nodes.new("CompositorNodeRLayers")

    zmap = nt.nodes.new("CompositorNodeMapRange")
    zmap.inputs["From Min"].default_value = 0.5
    zmap.inputs["From Max"].default_value = 40.0
    zmap.inputs["To Min"].default_value = 0.0
    zmap.inputs["To Max"].default_value = 1.0
    zmap.use_clamp = True
    sobel_z = nt.nodes.new("CompositorNodeFilter")
    sobel_z.filter_type = "SOBEL"

    sobel_n = nt.nodes.new("CompositorNodeFilter")
    sobel_n.filter_type = "SOBEL"

    add = nt.nodes.new("CompositorNodeMixRGB")
    add.blend_type = "ADD"
    add.inputs["Fac"].default_value = 1.0

    ramp = nt.nodes.new("CompositorNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (1, 1, 1, 1)
    ramp.color_ramp.elements[1].position = 0.14
    ramp.color_ramp.elements[1].color = (0, 0, 0, 1)

    # Negative distance grows the black ink (the white field shrinks).
    thick = nt.nodes.new("CompositorNodeDilateErode")
    thick.mode = "DISTANCE"
    thick.distance = -1

    over = nt.nodes.new("CompositorNodeMixRGB")
    over.blend_type = "MULTIPLY"
    over.inputs["Fac"].default_value = 1.0
    comp = nt.nodes.new("CompositorNodeComposite")

    links.new(rl.outputs["Depth"], zmap.inputs["Value"])
    links.new(zmap.outputs["Value"], sobel_z.inputs["Image"])
    links.new(rl.outputs["Normal"], sobel_n.inputs["Image"])
    links.new(sobel_z.outputs["Image"], add.inputs[1])
    links.new(sobel_n.outputs["Image"], add.inputs[2])
    links.new(add.outputs["Image"], ramp.inputs["Fac"])
    links.new(ramp.outputs["Image"], thick.inputs["Mask"])
    links.new(rl.outputs["Image"], over.inputs[1])
    links.new(thick.outputs["Mask"], over.inputs[2])
    links.new(over.outputs["Image"], comp.inputs["Image"])


def render_shots(roots, lamp_mat, folder):
    import bpy

    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 24
    for mat in bpy.data.materials:
        if mat.name.endswith("-main") and mat.use_nodes:
            apply_comic(mat)
    setup_ink(scene)

    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.66, 0.78, 1)
    bg.inputs[1].default_value = 0.85

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = 0.4
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.7, 0.15, 0.6)

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 180
    fill_data.size = 8
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)
    _look_at(fill, (-6, 8, 6), (0, 0, 2.5))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 38
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground = bpy.data.meshes.new("ground")
    ground.from_pydata(
        [(-18, -18, -0.02), (18, -18, -0.02), (18, 18, -0.02), (-18, 18, -0.02)],
        [],
        [(0, 1, 2, 3)],
    )
    gmat = bpy.data.materials.new("shot-ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.22, 0.24, 0.22, 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.92
    gobj = bpy.data.objects.new("shot-ground", ground)
    gobj.data.materials.append(gmat)
    scene.collection.objects.link(gobj)

    def show(level):
        for i, root in enumerate(roots):
            _hide_tree(root, i != level)

    target = (0.0, 0.0, 2.8)
    shots = [
        ("front", (0.0, 15.0, 2.2), target),
        ("side", (15.0, 0.2, 2.2), target),
        ("back", (0.2, -15.0, 2.3), target),
    ]
    show(0)
    only = os.environ.get("OCTAGON_ONLY")
    if only:
        shots = [s for s in shots if s[0] == only]
    for name, loc, tgt in shots:
        _look_at(cam, loc, tgt)
        scene.render.filepath = os.path.join(folder, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("shot", name)

    bg.inputs[0].default_value = (0.02, 0.03, 0.06, 1)
    bg.inputs[1].default_value = 0.08
    sun_data.energy = 0.35
    fill_data.energy = 3
    for mat in bpy.data.materials:
        if mat.use_nodes and mat.name.endswith("-main"):
            for node in mat.node_tree.nodes:
                if node.type == "EMISSION":
                    node.inputs["Strength"].default_value = 0.38
    for node in lamp_mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Emission Strength"].default_value = 8.0
    _look_at(cam, (0.0, 15.0, 2.15), (0.0, 0.0, 2.7))
    scene.render.filepath = os.path.join(folder, "night.png")
    bpy.ops.render.render(write_still=True)
    print("shot night")
    if only:
        return
    for node in lamp_mat.node_tree.nodes:
        if node.type == "BSDF_PRINCIPLED":
            node.inputs["Emission Strength"].default_value = 1.4
    sun_data.energy = 4.0
    bg.inputs[0].default_value = (0.62, 0.66, 0.70, 1)
    bg.inputs[1].default_value = 1.0
    fill_data.energy = 40

    scene.render.use_compositing = False
    show(0)
    for child in roots[0].children:
        if child.type == "MESH" and not child.name.endswith("_COL"):
            mod = child.modifiers.new("wire", "WIREFRAME")
            mod.thickness = 0.012
            mod.use_replace = True
    _look_at(cam, (11.0, 13.0, 5.5), target)
    scene.render.filepath = os.path.join(folder, "wire-lod0.png")
    bpy.ops.render.render(write_still=True)
    for child in roots[0].children:
        if child.type == "MESH" and child.modifiers.get("wire"):
            child.modifiers.remove(child.modifiers["wire"])
    print("shot wire")

    gobj.hide_render = True
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 54
    scene.render.resolution_x = 1600
    scene.render.resolution_y = 720
    # Camera sits in +X, so image-left is +X. Order in the picture is LOD0, LOD1, LOD2.
    offsets = (16.0, 0.0, -16.0)
    for root, dx in zip(roots, offsets):
        _hide_tree(root, False)
        root.location.x = dx
    _look_at(cam, (18.0, 36.0, 6.5), (0.0, 0.0, 2.4))
    scene.render.filepath = os.path.join(folder, "lod-compare.png")
    bpy.ops.render.render(write_still=True)
    for root in roots:
        root.location.x = 0.0
    print("shot lod-compare")


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
    lamp_mat = make_lamp_material()

    repo = os.path.abspath(os.path.join(root, "..", "..", "..", ".."))
    public = os.path.join(repo, "public", "landmarks", "newark", SLUG)
    os.makedirs(public, exist_ok=True)

    roots = []
    stats = []
    for level in (0, 1, 2):
        main, lamp, col = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        body = acc_object(f"masonry-lod{level}", main, main_mat)
        body.name = f"masonry-lod{level}"
        body.parent = parent
        glow = acc_object(f"lantern-lod{level}", lamp, lamp_mat)
        glow.name = f"lantern-lod{level}"
        glow.parent = parent
        col_tris = 0
        if col is not None:
            col_obj = acc_object(f"{SLUG}_COL", col, None, uv=False)
            col_obj.name = f"{SLUG}_COL"
            col_obj.parent = parent
            col_tris = col.tris
        roots.append(parent)
        total = main.tris + lamp.tris
        stats.append((level, main.tris, lamp.tris, col_tris, total))
        print(f"LOD{level} tris {total} (main {main.tris} lamp {lamp.tris} col {col_tris})")

    for img in list(bpy.data.images):
        if img.name in ("Render Result", "Viewer Node"):
            bpy.data.images.remove(img)

    blend_path = os.path.join(root, f"{SLUG}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile(compress=True)
    print("blend", blend_path, os.path.getsize(blend_path))

    raw = "/tmp/octagon-shelter-raw.glb"
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
    with open("/tmp/octagon-shelter-stats.txt", "w", encoding="utf-8") as fh:
        for row in stats:
            fh.write(" ".join(str(x) for x in row) + "\n")

    shots = os.environ.get("OCTAGON_SHOTS")
    if shots:
        render_shots(roots, lamp_mat, shots)


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
        if "--counts" not in sys.argv:
            count_only()
    else:
        build_scene()
