#!/usr/bin/env python3
"""Exterior of the Cathedral Basilica of the Sacred Heart, Newark.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
Front (west facade, twin towers) faces Blender +Y.

    python3 build_cathedral.py            # write textures/*.png
    python3 build_cathedral.py --counts   # triangle counts, no Blender
    blender -b --factory-startup --python build_cathedral.py

Dimensions: NRHP nomination (Cathedral of the Sacred Heart, ref. 76001151):
365 ft long, 165 ft at the transepts, 140 ft west front, towers 46 ft square
and 232 ft high, nave-and-aisles 119 ft, 150 ft from the west rose to the
transepts, transepts 63 ft thick, roof peak 130 ft, roses 34 ft and 32 ft.
Overall height 79 m and tower height 71 m follow Structurae, which matches
the 232 ft towers. The copper fleche is the high point (NRHP).

No Google imagery. No paid add-ons. Run with --factory-startup.
"""

from __future__ import annotations

import math
import os
import random
import struct
import sys

FT = 0.3048
LENGTH = 365 * FT
WEST_W = 140 * FT
NAVE_W = 119 * FT
TRAN_W = 165 * FT
TOWER_S = 46 * FT
NAVE_TO_X = 150 * FT
TRAN_D = 63 * FT
ROOF_H = 130 * FT
TOWER_H = 232 * FT
ROSE_D = 34 * FT
TROSE_D = 32 * FT
FLECHE_H = 79.0

HALF = LENGTH * 0.5
NAVE_HALF = NAVE_W * 0.5
TRAN_HALF = TRAN_W * 0.5
TOWER_OUTER = WEST_W * 0.5
TOWER_INNER = TOWER_OUTER - TOWER_S
AISLE = 7.2
CL_HALF = NAVE_HALF - AISLE

# Pier tips are the 365 ft extremes. The rose wall sits just behind them.
Y_TIP = HALF
Y_APSE = -HALF
PIER = 1.65
Y_FRONT = Y_TIP - PIER
Y_FACADE = Y_FRONT - 0.22
Y_TOWER_BACK = Y_FRONT - TOWER_S
Y_TRAN_W = Y_FACADE - NAVE_TO_X
Y_TRAN_E = Y_TRAN_W - TRAN_D
Y_CHOIR_END = Y_TRAN_E - 17.5

Z_PLINTH = 2.15
Z_AISLE_WALL = 12.6
Z_AISLE_JOIN = 18.4
Z_CL_EAVE = 24.6
Z_TOWER_ROOF = 56.8
Z_FLOOR = 1.45

# Atlas rectangles (u, v, w, h). v is the bottom of the region.
ST = (0.00, 0.00, 0.50, 0.50)
TR = (0.50, 0.00, 0.25, 0.50)
BRN = (0.75, 0.00, 0.25, 0.25)
BZ = (0.75, 0.25, 0.25, 0.25)
RF = (0.00, 0.50, 0.50, 0.50)
CU = (0.50, 0.50, 0.34, 0.34)
LV = (0.85, 0.50, 0.15, 0.18)
DK = (0.85, 0.70, 0.15, 0.14)

SLUG = "cathedral-basilica-sacred-heart"
MAIN_MAT = f"{SLUG}-main"
WIN_MAT = "emissive-windows"


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
        self.N = []
        self.UV = []
        self.F = []

    def add(self, p, n, uv):
        self.V.append(p)
        self.N.append(n)
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
        n = (-n[0], -n[1], -n[2])
        order = (p0, p3, p2, p1)
    else:
        order = (p0, p1, p2, p3)
    u, v, w, h = region
    uvs = ((u, v), (u + w, v), (u + w, v + h), (u, v + h))
    ids = [acc.add(p, n, uv) for p, uv in zip(order, uvs)]
    acc.tri(ids[0], ids[1], ids[2])
    acc.tri(ids[0], ids[2], ids[3])


def add_tri_uv(acc, p0, p1, p2, uvs, hint):
    n = _normal(p0, p1, p2)
    if n is None:
        return
    if vdot(n, hint) < 0:
        n = (-n[0], -n[1], -n[2])
        p0, p2 = p2, p0
        uvs = (uvs[0], uvs[2], uvs[1])
    ids = [acc.add(p, n, uv) for p, uv in zip((p0, p1, p2), uvs)]
    acc.tri(ids[0], ids[1], ids[2])


def add_grid(acc, p00, p10, p11, p01, nu, nv, region, hint):
    nu = max(1, min(36, int(nu)))
    nv = max(1, min(28, int(nv)))
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
    if z1 - z0 < 0.03:
        return
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    if length < 0.04:
        return
    c00 = (a[0], a[1], z0)
    c10 = (b[0], b[1], z0)
    c11 = (b[0], b[1], z1)
    c01 = (a[0], a[1], z1)
    nu = max(1, int(round(length / tile)))
    nv = max(1, int(round((z1 - z0) / tile)))
    hint = (outward[0], outward[1], 0.0 if len(outward) == 2 else outward[2])
    add_grid(acc, c00, c10, c11, c01, nu, nv, region, hint)


def wall_bands(acc, a, b, z_top, tile, outward, plinth=True):
    if plinth and z_top > Z_PLINTH + 0.2:
        wall(acc, a, b, 0.0, Z_PLINTH, BRN, tile, outward)
        wall(acc, a, b, Z_PLINTH, z_top, ST, tile, outward)
    else:
        wall(acc, a, b, 0.0, z_top, ST, tile, outward)


def flat(acc, x0, x1, y0, y1, z, sign, region, tile):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    p00 = (x0, y0, z)
    p10 = (x1, y0, z)
    p11 = (x1, y1, z)
    p01 = (x0, y1, z)
    nu = max(1, int(round((x1 - x0) / tile)))
    nv = max(1, int(round((y1 - y0) / tile)))
    add_grid(acc, p00, p10, p11, p01, nu, nv, region, (0.0, 0.0, sign))


def cornice(acc, x0, x1, y0, y1, z, h, proj, region, tile):
    """Projecting band. Lips sit outside the wall so they do not z-fight it."""
    add_box(acc, x0 - proj, x1 + proj, y0 - proj, y0 - 0.03, z, z + h, region, tile, top=True)
    add_box(acc, x0 - proj, x1 + proj, y1 + 0.03, y1 + proj, z, z + h, region, tile, top=True)
    add_box(acc, x0 - proj, x0 - 0.03, y0, y1, z, z + h, region, tile, top=True)
    add_box(acc, x1 + 0.03, x1 + proj, y0, y1, z, z + h, region, tile, top=True)


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


def add_pyramid(acc, x0, x1, y0, y1, z0, z1, region):
    tip = ((x0 + x1) * 0.5, (y0 + y1) * 0.5, z1)
    corners = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0)]
    u, v, w, h = region
    cu = (u + w * 0.5, v + h * 0.15)
    tip_uv = (u + w * 0.5, v + h * 0.9)
    for i in range(4):
        p0 = corners[i]
        p1 = corners[(i + 1) % 4]
        add_tri_uv(acc, p0, p1, tip, (cu, (u + w, v + h * 0.15), tip_uv), (0, 0, 1))


def add_cone(acc, cx, cy, z0, z1, radius, sides, region):
    tip = (cx, cy, z1)
    u, v, w, h = region
    tip_uv = (u + w * 0.5, v + h * 0.85)
    base_uv = (u + w * 0.5, v + h * 0.2)
    pts = []
    for i in range(sides):
        a = 2 * math.pi * i / sides
        pts.append((cx + radius * math.cos(a), cy + radius * math.sin(a), z0))
    for i in range(sides):
        add_tri_uv(acc, pts[i], pts[(i + 1) % sides], tip, (base_uv, base_uv, tip_uv), (0, 0, 1))


def add_beam(acc, p, q, half_w, half_t, region):
    d = vsub(q, p)
    L = vlen(d)
    if L < 0.05:
        return
    d = vscale(d, 1.0 / L)
    tmp = (0.0, 0.0, 1.0) if abs(d[2]) < 0.82 else (1.0, 0.0, 0.0)
    side = vnorm(vcross(d, tmp))
    up = vnorm(vcross(side, d))

    def ring(base):
        out = []
        for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            out.append(vadd(base, vadd(vscale(side, sx * half_w), vscale(up, sy * half_t))))
        return out

    rp, rq = ring(p), ring(q)
    for i in range(4):
        hint = vadd(vscale(side, (-1, 1, 1, -1)[i]), vscale(up, (-1, -1, 1, 1)[i]))
        add_quad(acc, rp[i], rp[(i + 1) % 4], rq[(i + 1) % 4], rq[i], region, hint)
    add_quad(acc, rp[0], rp[3], rp[2], rp[1], region, vscale(d, -1))
    add_quad(acc, rq[0], rq[1], rq[2], rq[3], region, d)


def slope(acc, a0, a1, b1, b0, region, tile, hint=(0, 0, 1)):
    """Quad a0->a1->b1->b0, gridded. a0-a1 is one edge, a0-b0 the other."""
    nu = max(1, int(round(vlen(vsub(a1, a0)) / tile)))
    nv = max(1, int(round(vlen(vsub(b0, a0)) / tile)))
    add_grid(acc, a0, a1, b1, b0, nu, nv, region, hint)
    # Underside (soffit). Roof sheets overhang the walls; with back faces culled
    # their eaves and rakes read as black or see-through slots from below.
    n = _normal(a0, a1, b1)
    if n is not None:
        if vdot(n, hint) < 0:
            n = vscale(n, -1)
        d = vscale(n, -0.05)  # sit just under the sheet so the two never z-fight
        add_quad(acc, vadd(a0, d), vadd(a1, d), vadd(b1, d), vadd(b0, d), ST, vscale(hint, -1))


def arch_profile(width, n):
    """Equilateral pointed arch, (x, z) from left spring, over the apex, to the right."""
    w = width
    r = w
    pts = []
    for i in range(n + 1):
        a = math.pi - (math.pi / 3.0) * (i / n)
        pts.append((w * 0.5 + r * math.cos(a), r * math.sin(a)))
    for i in range(1, n + 1):
        a = (math.pi / 3.0) * (1.0 - i / n)
        pts.append((-w * 0.5 + r * math.cos(a), r * math.sin(a)))
    h = w * math.sqrt(3.0) / 2.0
    return pts, h


def _place(origin, right, outward, x, z, depth):
    return (
        origin[0] + right[0] * x + outward[0] * depth,
        origin[1] + right[1] * x + outward[1] * depth,
        origin[2] + z,
    )


def add_arch_frame(acc, origin, right, outward, width, n, thickness, depth, region):
    """Pointed-arch hood standing proud of the wall. origin is the spring-point centre."""
    pts, _h = arch_profile(width, n)
    outer = []
    for x, z in pts:
        mag = math.hypot(x, z) or 1.0
        # Push out of the opening: sideways plus a little upward.
        ox = x + thickness * (x / mag + (0.35 if x > 0 else -0.35 if x < 0 else 0))
        oz = z + thickness * (0.25 + max(0.0, z) / (mag + width))
        outer.append((ox, oz))
    # Keep spring ends on the spring line so the jambs meet them.
    outer[0] = (pts[0][0] - thickness, 0.0)
    outer[-1] = (pts[-1][0] + thickness, 0.0)
    for i in range(len(pts) - 1):
        a0 = _place(origin, right, outward, pts[i][0], pts[i][1], depth)
        a1 = _place(origin, right, outward, pts[i + 1][0], pts[i + 1][1], depth)
        b1 = _place(origin, right, outward, outer[i + 1][0], outer[i + 1][1], depth)
        b0 = _place(origin, right, outward, outer[i][0], outer[i][1], depth)
        add_quad(acc, a0, a1, b1, b0, region, outward)
        # depth return toward the wall
        c0 = _place(origin, right, outward, outer[i][0], outer[i][1], 0.02)
        c1 = _place(origin, right, outward, outer[i + 1][0], outer[i + 1][1], 0.02)
        add_quad(acc, b0, b1, c1, c0, region, outward)
    return pts


def glass_uv_lancet(x, z, width, height):
    u = 0.06 + 0.38 * (x / width + 0.5)
    v = 0.04 + 0.92 * max(0.0, min(1.0, z / height))
    return (u, v)


def glass_uv_rose(x, y):
    # x,y in -1..1 within the disc, mapped into the right half of the glass atlas.
    return (0.75 + 0.22 * x, 0.50 + 0.42 * y)


def add_lancet(stone, glass, origin, right, outward, width, z_sill, z_spring, level, kind="glass"):
    """kind 'glass' fills with emissive glass; 'louver' fills with the louver atlas on stone."""
    right = vnorm(right)
    outward = vnorm(outward)
    spring = (origin[0], origin[1], z_spring)
    nseg = 8 if level == 0 else 4
    target = glass if kind == "glass" else stone
    region = LV if kind == "louver" else ST
    if level >= 2:
        z_top = z_spring + width * 0.55
        hw = width * 0.5
        p0 = _place(spring, right, outward, -hw, z_sill - z_spring, 0.06)
        p1 = _place(spring, right, outward, hw, z_sill - z_spring, 0.06)
        p2 = _place(spring, right, outward, hw, z_top - z_spring, 0.06)
        p3 = _place(spring, right, outward, -hw, z_top - z_spring, 0.06)
        if kind == "glass":
            h = (z_top - z_sill) or 1
            add_quad_uvs = (
                glass_uv_lancet(-hw, 0, width, h),
                glass_uv_lancet(hw, 0, width, h),
                glass_uv_lancet(hw, h, width, h),
                glass_uv_lancet(-hw, h, width, h),
            )
            n = _normal(p0, p1, p2)
            if n is None:
                return
            if vdot(n, outward) < 0:
                n = (-n[0], -n[1], -n[2])
                order = (p0, p3, p2, p1)
                uvs = (add_quad_uvs[0], add_quad_uvs[3], add_quad_uvs[2], add_quad_uvs[1])
            else:
                order = (p0, p1, p2, p3)
                uvs = add_quad_uvs
            ids = [glass.add(p, n, uv) for p, uv in zip(order, uvs)]
            glass.tri(ids[0], ids[1], ids[2])
            glass.tri(ids[0], ids[2], ids[3])
        else:
            add_quad(stone, p0, p1, p2, p3, LV, outward)
        return

    depth = 0.78 if level == 0 else 0.32 if level == 1 else 0.0
    thick = 0.24 if level == 0 else 0.14
    pts = add_arch_frame(stone, spring, right, outward, width, nseg, thick, depth, TR if level == 0 else ST)
    if level == 0:
        # inner order, set back so the opening reads as carved
        add_arch_frame(stone, spring, right, outward, width * 0.86, max(4, nseg - 2), thick * 0.55, depth * 0.48, TR)
    # jambs
    x_in_l, x_in_r = pts[0][0], pts[-1][0]
    x_out_l, x_out_r = x_in_l - thick, x_in_r + thick
    z0 = z_sill - z_spring
    for xa, xb in ((x_out_l, x_in_l), (x_in_r, x_out_r)):
        a0 = _place(spring, right, outward, xa, z0, depth)
        a1 = _place(spring, right, outward, xb, z0, depth)
        b1 = _place(spring, right, outward, xb, 0.0, depth)
        b0 = _place(spring, right, outward, xa, 0.0, depth)
        add_quad(stone, a0, a1, b1, b0, TR if level == 0 else ST, outward)
    # sill
    s0 = _place(spring, right, outward, x_out_l, z0, depth)
    s1 = _place(spring, right, outward, x_out_r, z0, depth)
    s2 = _place(spring, right, outward, x_out_r, z0, 0.02)
    s3 = _place(spring, right, outward, x_out_l, z0, 0.02)
    add_quad(stone, s0, s1, s2, s3, TR, outward)

    # fill
    h_arch = width * math.sqrt(3.0) / 2.0
    total_h = (z_spring - z_sill) + h_arch
    fill_pts = [(x_in_l, z0)] + [(x, z) for x, z in pts] + [(x_in_r, z0)]
    # fan from a point inside the opening
    hub_x, hub_z = 0.0, (z0 + h_arch * 0.15)
    hub = _place(spring, right, outward, hub_x, hub_z, 0.04)
    if kind == "glass":
        hub_uv = glass_uv_lancet(hub_x, hub_z - z0, width, total_h)
        for i in range(len(fill_pts) - 1):
            x0, z0p = fill_pts[i]
            x1, z1p = fill_pts[i + 1]
            p0 = _place(spring, right, outward, x0, z0p, 0.04)
            p1 = _place(spring, right, outward, x1, z1p, 0.04)
            add_tri_uv(
                target,
                hub,
                p0,
                p1,
                (
                    hub_uv,
                    glass_uv_lancet(x0, z0p - z0, width, total_h),
                    glass_uv_lancet(x1, z1p - z0, width, total_h),
                ),
                outward,
            )
    else:
        # solid louver fill, a coarse fan on the stone atlas
        u, v, w, h = region
        hub_uv = (u + w * 0.5, v + h * 0.5)
        for i in range(len(fill_pts) - 1):
            x0, z0p = fill_pts[i]
            x1, z1p = fill_pts[i + 1]
            p0 = _place(spring, right, outward, x0, z0p, 0.08)
            p1 = _place(spring, right, outward, x1, z1p, 0.08)
            add_tri_uv(target, hub, p0, p1, (hub_uv, hub_uv, hub_uv), outward)
    if level == 0 and kind == "glass":
        # two-light tracery: mullion, transom, and a small eye under the apex
        add_beam(
            stone,
            _place(spring, right, outward, 0.0, z0 + 0.12, 0.22),
            _place(spring, right, outward, 0.0, h_arch * 0.62, 0.22),
            0.05,
            0.055,
            TR,
        )
        add_beam(
            stone,
            _place(spring, right, outward, -width * 0.28, h_arch * 0.22, 0.2),
            _place(spring, right, outward, width * 0.28, h_arch * 0.22, 0.2),
            0.04,
            0.045,
            TR,
        )
        eye = h_arch * 0.78
        for i in range(6):
            a0 = 2 * math.pi * i / 6
            a1 = 2 * math.pi * (i + 1) / 6
            r = width * 0.12
            add_beam(
                stone,
                _place(spring, right, outward, math.cos(a0) * r, eye + math.sin(a0) * r, 0.2),
                _place(spring, right, outward, math.cos(a1) * r, eye + math.sin(a1) * r, 0.2),
                0.03,
                0.035,
                TR,
            )


def add_rose(stone, glass, center, right, outward, radius, level):
    right = vnorm(right)
    outward = vnorm(outward)
    up = vnorm(vcross(right, outward))
    n = 36 if level == 0 else 18 if level == 1 else 12
    depth = 0.62 if level == 0 else 0.26 if level == 1 else 0.05

    def pt(r, i, extra=0.0):
        a = 2 * math.pi * i / n
        return vadd(
            center,
            vadd(vscale(right, math.cos(a) * r), vadd(vscale(up, math.sin(a) * r), vscale(outward, extra))),
        )

    r_in = radius * 0.88
    r_out = radius * 1.06
    r_mid = radius * 0.48
    for i in range(n):
        add_quad(stone, pt(r_in, i, depth), pt(r_in, i + 1, depth), pt(r_out, i + 1, depth), pt(r_out, i, depth), TR, outward)
        if level == 0:
            add_quad(
                stone,
                pt(r_mid * 0.92, i, depth * 0.72),
                pt(r_mid * 0.92, i + 1, depth * 0.72),
                pt(r_mid * 1.12, i + 1, depth * 0.72),
                pt(r_mid * 1.12, i, depth * 0.72),
                TR,
                outward,
            )
    # glass sits at the back of the reveal so the glow reads as interior light
    gn = 24 if level == 0 else 14
    hub = vadd(center, vscale(outward, 0.05))
    hub_uv = glass_uv_rose(0.0, 0.0)
    for i in range(gn):
        a0 = 2 * math.pi * i / gn
        a1 = 2 * math.pi * (i + 1) / gn
        p0 = vadd(hub, vadd(vscale(right, math.cos(a0) * r_in * 0.98), vscale(up, math.sin(a0) * r_in * 0.98)))
        p1 = vadd(hub, vadd(vscale(right, math.cos(a1) * r_in * 0.98), vscale(up, math.sin(a1) * r_in * 0.98)))
        add_tri_uv(
            glass,
            hub,
            p0,
            p1,
            (hub_uv, glass_uv_rose(math.cos(a0), math.sin(a0)), glass_uv_rose(math.cos(a1), math.sin(a1))),
            outward,
        )
    bars = 16 if level == 0 else 8 if level == 1 else 0
    for i in range(bars):
        a = 2 * math.pi * i / bars
        inner = vadd(center, vadd(vscale(right, math.cos(a) * radius * 0.12), vscale(up, math.sin(a) * radius * 0.12)))
        outer = vadd(center, vadd(vscale(right, math.cos(a) * r_in), vscale(up, math.sin(a) * r_in)))
        inner = vadd(inner, vscale(outward, 0.16))
        outer = vadd(outer, vscale(outward, 0.16))
        add_beam(stone, inner, outer, 0.055 if level == 0 else 0.08, 0.05, TR)
    if level == 0:
        add_cone(
            stone,
            center[0] + outward[0] * 0.2,
            center[1] + outward[1] * 0.2,
            center[2] - 0.15,
            center[2] + outward[2] * 0.2 + 0.35,
            radius * 0.10,
            8,
            TR,
        )


def add_pinnacle(acc, x, y, z, h, w, level, copper_tip=True):
    tile = 4.0 if level == 0 else 8.0
    add_box(acc, x - w, x + w, y - w, y + w, z, z + h * 0.62, ST, tile, top=False)
    add_pyramid(acc, x - w * 1.05, x + w * 1.05, y - w * 1.05, y + w * 1.05, z + h * 0.55, z + h, ST)
    if copper_tip and level == 0:
        add_cone(acc, x, y, z + h * 0.92, z + h + w * 1.4, w * 0.28, 6, CU)


def gable_wall(acc, x_left, x_right, y, z_eave, z_peak, region, tile, hint):
    strips = max(2, int(round((z_peak - z_eave) / tile)))
    x_peak = (x_left + x_right) * 0.5
    for i in range(strips):
        t0 = i / strips
        t1 = (i + 1) / strips
        z0 = z_eave + (z_peak - z_eave) * t0
        z1 = z_eave + (z_peak - z_eave) * t1
        xa0 = x_left + (x_peak - x_left) * t0
        xb0 = x_right + (x_peak - x_right) * t0
        xa1 = x_left + (x_peak - x_left) * t1
        xb1 = x_right + (x_peak - x_right) * t1
        add_quad(
            acc,
            (xa0, y, z0),
            (xb0, y, z0),
            (xb1, y, z1),
            (xa1, y, z1),
            region,
            hint,
        )


def gable_roof_y(acc, x0, x1, y0, y1, z_eave, z_peak, region, tile, overhang=0.45, fascia=True):
    """Ridge parallel to Y."""
    xm = (x0 + x1) * 0.5
    oh = overhang
    # -X slope
    slope(
        acc,
        (x0 - oh, y0, z_eave),
        (x0 - oh, y1, z_eave),
        (xm, y1, z_peak),
        (xm, y0, z_peak),
        region,
        tile,
    )
    # +X slope
    slope(
        acc,
        (xm, y0, z_peak),
        (xm, y1, z_peak),
        (x1 + oh, y1, z_eave),
        (x1 + oh, y0, z_eave),
        region,
        tile,
    )
    if fascia:
        # Copper cap overlaps the tile edge so the roof sheet does not read as a red sliver.
        wall(acc, (x0 - oh, y0), (x0 - oh, y1), z_eave - 0.55, z_eave + 0.06, CU, tile, (-1, 0, 0))
        wall(acc, (x1 + oh, y0), (x1 + oh, y1), z_eave - 0.55, z_eave + 0.06, CU, tile, (1, 0, 0))
        flat(acc, x0 - oh, x0 - oh + 0.42, y0, y1, z_eave - 0.5, -1, CU, tile)
        flat(acc, x1 + oh - 0.42, x1 + oh, y0, y1, z_eave - 0.5, -1, CU, tile)


def copper_ridge_y(acc, x, y0, y1, z, tile_spacing, level):
    add_beam(acc, (x, y0, z), (x, y1, z + 0.02), 0.22, 0.14, CU)
    if level == 0:
        y = y0
        while y < y1:
            add_pyramid(acc, x - 0.18, x + 0.18, y, y + 0.28, z + 0.12, z + 0.72, CU)
            y += tile_spacing


def arc_pts(cx, cy, radius, a0, a1, n):
    pts = []
    for i in range(n + 1):
        a = math.radians(a0 + (a1 - a0) * i / n)
        pts.append((cx + radius * math.sin(a), cy - radius * math.cos(a)))
    return pts


def _uv_in(uv, region, pad=0.012):
    u, v, w, h = region
    return (u - pad) <= uv[0] <= (u + w + pad) and (v - pad) <= uv[1] <= (v + h + pad)


def take_regions(src, regions):
    """Move faces whose UV centre lies in `regions` onto a new mesh."""
    out = Acc()
    remap = {}
    kept = []

    def vid(i):
        if i not in remap:
            remap[i] = out.add(src.V[i], src.N[i], src.UV[i])
        return remap[i]

    for f in src.F:
        uvs = [src.UV[i] for i in f]
        cu = sum(u[0] for u in uvs) / 3.0
        cv = sum(u[1] for u in uvs) / 3.0
        if any(_uv_in((cu, cv), r) for r in regions):
            out.tri(vid(f[0]), vid(f[1]), vid(f[2]))
        else:
            kept.append(f)
    src.F = kept
    return out


def add_uplights(lamps, level):
    """Small warm fixtures. The emissive-lamp material is what night code scales."""
    spots = [
        (-4.4, Y_FACADE + 1.15, 0.05),
        (4.4, Y_FACADE + 1.15, 0.05),
        (-(TOWER_OUTER - 1.8), Y_FRONT + 0.35, 0.05),
        ((TOWER_OUTER - 1.8), Y_FRONT + 0.35, 0.05),
        (0.0, Y_FACADE + 0.85, 0.85),
    ]
    if level < 2:
        step = 16.0 if level == 1 else 11.0
        y = Y_TOWER_BACK - 2.0
        while y > Y_CHOIR_END + 4:
            for sign in (-1, 1):
                spots.append((sign * (NAVE_HALF + 0.15), y, 0.08))
            y -= step
        for sign in (-1, 1):
            spots.append((sign * (TRAN_HALF + 0.2), (Y_TRAN_W + Y_TRAN_E) * 0.5, 0.08))
    for x, y, z in spots:
        add_box(lamps, x - 0.16, x + 0.16, y - 0.16, y + 0.2, z, z + 0.28, CU, 4.0)
        add_cone(lamps, x, y, z + 0.22, z + 0.62, 0.2, 6, CU)


def build(level):
    stone, glass = Acc(), Acc()
    col = Acc() if level == 0 else None
    tile = (4.0, 8.0, 28.0)[level]
    hi = level == 0
    mid = level <= 1

    def bands(a, b, z_top, outward):
        wall_bands(stone, a, b, z_top, tile, outward, plinth=True)

    # --- towers ---
    towers = []
    for sign in (-1, 1):
        x0 = sign * TOWER_OUTER
        x1 = sign * TOWER_INNER
        if x0 > x1:
            x0, x1 = x1, x0
        towers.append((sign, x0, x1))
        add_box(stone, x0, x1, Y_TOWER_BACK, Y_FRONT, 0.0, Z_TOWER_ROOF, ST, tile, top=False)
        # corner piers
        pier_w = 1.35 if hi else 1.05
        corners = (
            (x0, Y_FRONT, -sign, 1),
            (x1, Y_FRONT, sign, 1),
            (x0, Y_TOWER_BACK, -sign, -1),
            (x1, Y_TOWER_BACK, sign, -1),
        )
        for cx, cy, ox, oy in corners:
            # ox is the outward X sign relative to tower centre, oy outward Y
            px = cx + ox * pier_w * 0.15
            py = cy + oy * pier_w * 0.15
            add_box(
                stone,
                px - pier_w * 0.5,
                px + pier_w * 0.5,
                py - pier_w * 0.5,
                py + pier_w * 0.5,
                0.0,
                Z_TOWER_ROOF + 0.4,
                ST,
                tile,
                top=False,
            )
        if mid:
            for zt in (14.0, 28.5, 43.5, Z_TOWER_ROOF - 1.1):
                cornice(stone, x0, x1, Y_TOWER_BACK, Y_FRONT, zt, 0.48, 0.32, TR, max(tile, 6))
        # pyramidal roof
        add_pyramid(stone, x0 - 0.35, x1 + 0.35, Y_TOWER_BACK - 0.35, Y_FRONT + 0.35, Z_TOWER_ROOF - 0.4, TOWER_H - 1.3, RF)
        add_cone(stone, (x0 + x1) * 0.5, (Y_TOWER_BACK + Y_FRONT) * 0.5, TOWER_H - 2.2, TOWER_H + 1.1, 0.55, 6, CU)
        if hi:
            tip = ((x0 + x1) * 0.5, (Y_TOWER_BACK + Y_FRONT) * 0.5, TOWER_H - 1.6)
            for cx, cy in ((x0, Y_FRONT), (x1, Y_FRONT), (x1, Y_TOWER_BACK), (x0, Y_TOWER_BACK)):
                add_beam(stone, (cx, cy, Z_TOWER_ROOF), tip, 0.10, 0.08, CU)
        # corner pinnacles (skyline even on LOD2, simpler there)
        ph = 6.2 if level < 2 else 3.4
        pw = 0.72 if level < 2 else 0.45
        for cx, cy in ((x0, Y_FRONT), (x1, Y_FRONT), (x1, Y_TOWER_BACK), (x0, Y_TOWER_BACK)):
            add_pinnacle(stone, cx, cy, Z_TOWER_ROOF - 1.2, ph, pw, level)
        # belfry louvers and lower lancets on N/E/S/W, skipping the west face (portals live there)
        faces = (
            ((x0, Y_FRONT), (x1, Y_FRONT), (0, 1, 0)),
            ((x1, Y_FRONT), (x1, Y_TOWER_BACK), (sign if False else (1 if x1 > x0 else -1), 0, 0)),
            ((x1, Y_TOWER_BACK), (x0, Y_TOWER_BACK), (0, -1, 0)),
            ((x0, Y_TOWER_BACK), (x0, Y_FRONT), (-1 if x0 < x1 else 1, 0, 0)),
        )
        # recompute side outward from the segment
        face_segs = (
            ((x0, Y_FRONT), (x1, Y_FRONT)),
            ((x1, Y_FRONT), (x1, Y_TOWER_BACK)),
            ((x1, Y_TOWER_BACK), (x0, Y_TOWER_BACK)),
            ((x0, Y_TOWER_BACK), (x0, Y_FRONT)),
        )
        for idx, (a, b) in enumerate(face_segs):
            dx, dy = b[0] - a[0], b[1] - a[1]
            outward = vnorm((-dy, dx, 0))
            # flip so it points away from the tower centre
            mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, 0)
            centre = ((x0 + x1) * 0.5, (Y_FRONT + Y_TOWER_BACK) * 0.5, 0)
            if vdot(outward, vsub(mid, centre)) < 0:
                outward = vscale(outward, -1)
                a, b = b, a
            right = vnorm((b[0] - a[0], b[1] - a[1], 0))
            face_mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, 0)
            is_west = outward[1] > 0.6
            # belfry pair on every face, including the west front above the portals
            span = vlen((b[0] - a[0], b[1] - a[1], 0))
            gap = 0.35
            lw = min(1.7, span * 0.28)
            for s in (-1, 1):
                c = vadd(face_mid, vscale(right, s * (lw * 0.5 + gap * 0.5)))
                add_lancet(stone, glass, (c[0], c[1], 0), right, outward, lw, 47.2, 51.6, level, kind="louver")
            if mid and not is_west:
                add_lancet(stone, glass, (face_mid[0], face_mid[1], 0), right, outward, 1.55, 31.0, 36.5, level, kind="glass")
                if hi:
                    add_lancet(stone, glass, (face_mid[0], face_mid[1], 0), right, outward, 1.25, 17.5, 21.5, level, kind="glass")
            elif mid and is_west:
                add_lancet(stone, glass, (face_mid[0], face_mid[1], 0), right, outward, 1.45, 32.0, 37.2, level, kind="glass")

    # --- west facade between the towers ---
    xL, xR = -TOWER_INNER + 0.15, TOWER_INNER - 0.15
    bands((xL, Y_FACADE), (xR, Y_FACADE), 30.2, (0, 1, 0))
    gable_wall(stone, xL, xR, Y_FACADE, 30.2, ROOF_H - 0.15, ST, tile, (0, 1, 0))
    # gable coping
    peak = ((xL + xR) * 0.5, Y_FACADE, ROOF_H - 0.05)
    if mid:
        add_beam(stone, (xL, Y_FACADE, 30.2), peak, 0.16, 0.12, CU)
        add_beam(stone, (xR, Y_FACADE, 30.2), peak, 0.16, 0.12, CU)
    add_cross = True
    if add_cross:
        cx = (xL + xR) * 0.5
        add_box(stone, cx - 0.18, cx + 0.18, Y_FACADE - 0.08, Y_FACADE + 0.22, ROOF_H - 0.2, ROOF_H + 2.5, CU, 2.0)
        add_box(stone, cx - 0.85, cx + 0.85, Y_FACADE - 0.08, Y_FACADE + 0.22, ROOF_H + 1.35, ROOF_H + 1.75, CU, 2.0)
    # rose
    add_rose(
        stone,
        glass,
        ((xL + xR) * 0.5, Y_FACADE, 21.6),
        (1, 0, 0),
        (0, 1, 0),
        ROSE_D * 0.5,
        level,
    )
    if hi:
        # dentil course under the rose, a carved trim band
        x = xL + 0.35
        while x < xR - 0.55:
            add_box(stone, x, x + 0.26, Y_FACADE - 0.02, Y_FACADE + 0.28, 27.55, 28.15, TR, 2.0)
            x += 0.58
    # arcade under the rose
    if mid:
        arcade_n = 7 if hi else 5
        span = xR - xL - 1.2
        aw = span / arcade_n
        for i in range(arcade_n):
            cx = xL + 0.6 + aw * (i + 0.5)
            add_lancet(stone, glass, (cx, Y_FACADE, 0), (1, 0, 0), (0, 1, 0), aw * 0.62, 12.4, 13.6, level, kind="glass")
    # three portals
    portals = (
        (0.0, 4.4, 2.2, 7.6),
        (-TOWER_INNER - TOWER_S * 0.48, 2.5, 2.3, 6.4),
        (TOWER_INNER + TOWER_S * 0.48, 2.5, 2.3, 6.4),
    )
    # side portals sit on the tower fronts, which are at Y_FRONT, centre on the facade
    for cx, width, z_sill, z_spring in (
        (0.0, 4.6, Z_FLOOR, 7.8),
        (-(TOWER_INNER + TOWER_OUTER) * 0.5, 2.55, Z_FLOOR, 6.3),
        ((TOWER_INNER + TOWER_OUTER) * 0.5, 2.55, Z_FLOOR, 6.3),
    ):
        y_wall = Y_FACADE if abs(cx) < TOWER_INNER else Y_FRONT
        add_lancet(stone, glass, (cx, y_wall, 0), (1, 0, 0), (0, 1, 0), width, z_sill, z_spring, level, kind="glass")
        # bronze door leaf in the lower opening (covers the glass below the spring a bit)
        hw = width * 0.34
        door_top = z_sill + (z_spring - z_sill) * 0.72
        add_box(
            stone,
            cx - hw,
            cx + hw,
            y_wall + 0.02,
            y_wall + 0.20,
            z_sill,
            door_top,
            BZ,
            3.0,
            top=True,
        )
        if hi:
            # gablet
            gz = z_spring + width * 0.72
            add_pyramid(stone, cx - width * 0.7, cx + width * 0.7, y_wall, y_wall + 1.15, gz - 0.2, gz + width * 0.55, TR)

    # steps
    if mid:
        n = 7
        tread = 0.42
        rise = Z_FLOOR / n
        x0, x1 = -6.4, 6.4
        for i in range(n):
            y_b = Y_FACADE + (n - i) * tread
            y_a = Y_FACADE + (n - i - 1) * tread
            add_box(stone, x0, x1, y_a, y_b, 0.0, (i + 1) * rise, TR, tile, bottom=False, top=True)

    # --- nave, aisles, choir ---
    def side_run(y0, y1, n_bays, with_windows=True):
        if y1 - y0 < 1.0:
            return
        bays = n_bays if n_bays else max(1, int(round((y1 - y0) / 7.2)))
        width = (y1 - y0) / bays
        for sign in (-1, 1):
            ox = sign
            # aisle wall
            bands((sign * NAVE_HALF, y0), (sign * NAVE_HALF, y1), Z_AISLE_WALL, (ox, 0, 0))
            # clerestory
            bands((sign * CL_HALF, y0), (sign * CL_HALF, y1), Z_CL_EAVE, (ox, 0, 0))
            for i in range(bays):
                ya = y0 + i * width
                yb = ya + width
                yc = (ya + yb) * 0.5
                if with_windows:
                    add_lancet(
                        stone,
                        glass,
                        (sign * NAVE_HALF, yc, 0),
                        (0, 1, 0),
                        (ox, 0, 0),
                        min(2.5, width * 0.42),
                        3.3,
                        7.4,
                        level,
                    )
                    add_lancet(
                        stone,
                        glass,
                        (sign * CL_HALF, yc, 0),
                        (0, 1, 0),
                        (ox, 0, 0),
                        min(2.3, width * 0.38),
                        Z_AISLE_JOIN + 0.35,
                        Z_AISLE_JOIN + 2.5,
                        level,
                    )
                if i < bays:
                    # buttress at the bay line (and the end)
                    by = ya if i else ya
                    pass
            # buttresses on the bay lines, including both ends
            for i in range(bays + 1):
                by = y0 + i * width
                bw = 0.85
                depth = 1.25
                x_wall = sign * NAVE_HALF
                x_out = x_wall + sign * depth
                z_steps = (Z_AISLE_WALL, Z_AISLE_WALL * 0.72, Z_AISLE_WALL * 0.48)
                d_steps = (depth, depth * 0.68, depth * 0.4)
                if level == 2:
                    z_steps, d_steps = (Z_AISLE_WALL,), (depth,)
                elif level == 1:
                    z_steps, d_steps = z_steps[:2], d_steps[:2]
                z_prev = Z_PLINTH
                for zs, ds in zip(z_steps, d_steps):
                    xa, xb = (x_wall, x_wall + sign * ds) if sign > 0 else (x_wall + sign * ds, x_wall)
                    add_box(stone, xa, xb, by - bw * 0.5, by + bw * 0.5, z_prev, zs, ST, tile, top=True)
                    z_prev = zs
                if level < 2:
                    add_pinnacle(stone, x_wall + sign * 0.7, by, Z_AISLE_WALL - 0.2, 5.4 if hi else 3.6, 0.48, level)

        # roofs for this run
        gable_roof_y(
            stone,
            -CL_HALF,
            CL_HALF,
            y0,
            y1,
            Z_CL_EAVE,
            ROOF_H,
            RF,
            tile,
            overhang=0.4,
            fascia=mid,
        )
        for sign in (-1, 1):
            x_out = sign * (NAVE_HALF + 0.35)
            x_in = sign * (CL_HALF - 0.15)
            z_out = Z_AISLE_WALL
            z_in = Z_AISLE_JOIN
            if sign > 0:
                slope(
                    stone,
                    (x_in, y0, z_in),
                    (x_in, y1, z_in),
                    (x_out, y1, z_out),
                    (x_out, y0, z_out),
                    RF,
                    tile,
                )
            else:
                slope(
                    stone,
                    (x_out, y0, z_out),
                    (x_out, y1, z_out),
                    (x_in, y1, z_in),
                    (x_in, y0, z_in),
                    RF,
                    tile,
                )
            if mid:
                wall(stone, (x_out, y0), (x_out, y1), z_out - 0.32, z_out, CU, tile, (sign, 0, 0))
        if mid:
            copper_ridge_y(stone, 0.0, y0, y1, ROOF_H + 0.08, 3.2, level)

    # The roof helper above would stack a ridge per call. Split walls and roofs.
    # Re-do nave as explicit runs so the high roof is continuous (one ridge).

    def bay_walls(y0, y1, n_bays):
        bays = n_bays
        width = (y1 - y0) / bays
        for sign in (-1, 1):
            ox = sign
            bands((sign * NAVE_HALF, y0), (sign * NAVE_HALF, y1), Z_AISLE_WALL, (ox, 0, 0))
            bands((sign * CL_HALF, y0), (sign * CL_HALF, y1), Z_CL_EAVE, (ox, 0, 0))
            for i in range(bays):
                yc = y0 + (i + 0.5) * width
                add_lancet(
                    stone, glass, (sign * NAVE_HALF, yc, 0), (0, sign, 0) if False else (0, 1, 0),
                    (ox, 0, 0), min(2.55, width * 0.46), 3.4, 7.6, level,
                )
                # right vector must run along the wall. Wall faces ±X, so "right" is +Y
                # but for the -X face, looking outward (-X), up is +Z, right is -Y.
                # add_lancet uses right as the +x axis of the arch. Either direction is fine
                # if the window is centred. (0,1,0) is fine for both.
                add_lancet(
                    stone, glass, (sign * CL_HALF, yc, 0), (0, 1, 0), (ox, 0, 0),
                    min(2.35, width * 0.42), Z_AISLE_JOIN + 0.4, Z_AISLE_JOIN + 2.35, level,
                )
            for i in range(bays + 1):
                by = y0 + i * width
                # skip buttresses that fall inside the transept junction
                bw = 0.82
                depth = 1.2
                x_wall = sign * NAVE_HALF
                z_steps = [(Z_PLINTH, Z_AISLE_WALL, depth)]
                if level == 0:
                    z_steps = [
                        (Z_PLINTH, Z_AISLE_WALL * 0.5, depth),
                        (Z_AISLE_WALL * 0.5, Z_AISLE_WALL * 0.78, depth * 0.7),
                        (Z_AISLE_WALL * 0.78, Z_AISLE_WALL, depth * 0.42),
                    ]
                elif level == 1:
                    z_steps = [
                        (Z_PLINTH, Z_AISLE_WALL * 0.7, depth),
                        (Z_AISLE_WALL * 0.7, Z_AISLE_WALL, depth * 0.5),
                    ]
                for za, zb, ds in z_steps:
                    xa, xb = sorted((x_wall, x_wall + sign * ds))
                    add_box(stone, xa, xb, by - bw * 0.5, by + bw * 0.5, za, zb, ST, tile, top=True)
                if level < 2:
                    add_pinnacle(stone, x_wall + sign * 0.55, by, Z_AISLE_WALL - 0.15, 5.2 if hi else 3.4, 0.46, level)

    nave_bays = 5
    choir_bays = 3
    bay_walls(Y_TOWER_BACK, Y_TRAN_W, nave_bays)
    bay_walls(Y_TRAN_E, Y_CHOIR_END, choir_bays)

    # One high roof, aisle roofs stopped at the transept so the slabs do not occupy the same plane.
    gable_roof_y(stone, -CL_HALF, CL_HALF, Y_FACADE - 0.05, Y_CHOIR_END, Z_CL_EAVE, ROOF_H, RF, tile, overhang=0.5, fascia=mid)
    if mid:
        copper_ridge_y(stone, 0.0, Y_FACADE, Y_CHOIR_END, ROOF_H + 0.12, 3.4, level)
    for y0, y1 in ((Y_TOWER_BACK, Y_TRAN_W - 0.15), (Y_TRAN_E + 0.15, Y_CHOIR_END)):
        for sign in (-1, 1):
            x_out = sign * (NAVE_HALF + 0.45)
            x_in = sign * (CL_HALF - 0.05)
            if sign > 0:
                slope(stone, (x_in, y0, Z_AISLE_JOIN), (x_in, y1, Z_AISLE_JOIN), (x_out, y1, Z_AISLE_WALL), (x_out, y0, Z_AISLE_WALL), RF, tile)
            else:
                slope(stone, (x_out, y0, Z_AISLE_WALL), (x_out, y1, Z_AISLE_WALL), (x_in, y1, Z_AISLE_JOIN), (x_in, y0, Z_AISLE_JOIN), RF, tile)
            if mid:
                wall(stone, (x_out, y0), (x_out, y1), Z_AISLE_WALL - 0.55, Z_AISLE_WALL + 0.06, CU, tile, (sign, 0, 0))

    # close the west end of the aisles against the towers (short return)
    for sign in (-1, 1):
        bands(
            (sign * CL_HALF, Y_TOWER_BACK),
            (sign * NAVE_HALF, Y_TOWER_BACK),
            Z_AISLE_WALL,
            (0, 1, 0),
        )

    # --- transepts ---
    def transept(sign):
        x_end = sign * TRAN_HALF
        outward = (sign, 0, 0)
        y0, y1 = Y_TRAN_E, Y_TRAN_W
        # Lower wall stops at the gable spring. A second wall from 16.5 to 20.5
        # sat on the same plane as the gable and z-fought both roses.
        bands((x_end, y0), (x_end, y1), 16.5, outward)
        # custom gable in the X-normal plane
        strips = max(2, int(round((ROOF_H - 16.5) / tile)))
        y_peak = (y0 + y1) * 0.5
        for i in range(strips):
            t0, t1 = i / strips, (i + 1) / strips
            z0 = 16.5 + (ROOF_H - 16.5) * t0
            z1 = 16.5 + (ROOF_H - 16.5) * t1
            ya0 = y0 + (y_peak - y0) * t0
            yb0 = y1 + (y_peak - y1) * t0
            ya1 = y0 + (y_peak - y0) * t1
            yb1 = y1 + (y_peak - y1) * t1
            add_quad(stone, (x_end, ya0, z0), (x_end, yb0, z0), (x_end, yb1, z1), (x_end, ya1, z1), ST, outward)
        if mid:
            add_beam(stone, (x_end, y0, 16.5), (x_end, y_peak, ROOF_H), 0.14, 0.1, CU)
            add_beam(stone, (x_end, y1, 16.5), (x_end, y_peak, ROOF_H), 0.14, 0.1, CU)
        add_rose(stone, glass, (x_end, y_peak, 18.5), (0, 1, 0), outward, TROSE_D * 0.5, level)
        add_lancet(stone, glass, (x_end, y_peak, 0), (0, 1, 0), outward, 3.3, Z_FLOOR, 6.6, level)
        # bronze door
        add_box(stone, x_end - 0.05 * sign, x_end + 0.18 * sign, y_peak - 1.05, y_peak + 1.05, Z_FLOOR, 5.4, BZ, 3.0)
        # return walls of the projection, outside the nave
        for y_face, y_hint in ((y1, 1), (y0, -1)):
            bands((sign * NAVE_HALF, y_face), (x_end, y_face), Z_AISLE_WALL, (0, y_hint, 0))
            # Meets the transept eave so the tile edge is not left open.
            wall(stone, (sign * CL_HALF, y_face), (x_end, y_face), Z_AISLE_WALL, 16.55, ST, tile, (0, y_hint, 0))
        # transept roof: ridge along X, from the nave body out to the end
        x_in = sign * (CL_HALF + 0.02)
        x_out = x_end + sign * 0.22
        y_mid = y_peak
        ye0, ye1 = y0 - 0.06, y1 + 0.06
        ez = 16.48
        slope(
            stone,
            (x_in, ye0, ez),
            (x_out, ye0, ez),
            (x_out, y_mid, ROOF_H + 0.06),
            (x_in, y_mid, ROOF_H + 0.06),
            RF,
            tile,
            (0, 0, 1),
        )
        slope(
            stone,
            (x_in, y_mid, ROOF_H + 0.06),
            (x_out, y_mid, ROOF_H + 0.06),
            (x_out, ye1, ez),
            (x_in, ye1, ez),
            RF,
            tile,
            (0, 0, 1),
        )
        if mid:
            add_beam(stone, (x_in, y_mid, ROOF_H + 0.15), (x_out, y_mid, ROOF_H + 0.2), 0.18, 0.12, CU)
            add_beam(stone, (x_in, ye0, ez - 0.02), (x_out, ye0, ez + 0.02), 0.12, 0.1, CU)
            add_beam(stone, (x_in, ye1, ez - 0.02), (x_out, ye1, ez + 0.02), 0.12, 0.1, CU)
        # end pinnacles
        if level < 2:
            for yy in (y0, y1):
                add_pinnacle(stone, x_end, yy, 15.6, 5.5 if hi else 3.2, 0.5, level)

    transept(1)
    transept(-1)

    # --- chevet ---
    # semicircular apse, axis toward -Y, centre on the choir east wall
    apse_cx, apse_cy = 0.0, Y_CHOIR_END
    high_r = CL_HALF * 0.96
    aisle_r = NAVE_HALF * 0.98
    seg_n = 6 if level == 0 else 4 if level == 1 else 3
    high_pts = arc_pts(apse_cx, apse_cy, high_r, -78, 78, seg_n)
    low_pts = arc_pts(apse_cx, apse_cy, aisle_r, -80, 80, seg_n)
    for i in range(len(high_pts) - 1):
        a, b = high_pts[i], high_pts[i + 1]
        mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)
        outward = vnorm((mid[0] - apse_cx, mid[1] - apse_cy, 0))
        bands(a, b, Z_CL_EAVE - 1.2, outward)
        if level < 2:
            right = vnorm((b[0] - a[0], b[1] - a[1], 0))
            add_lancet(stone, glass, (mid[0], mid[1], 0), right, outward, 1.7, Z_AISLE_JOIN + 0.3, Z_AISLE_JOIN + 2.0, level)
    for i in range(len(low_pts) - 1):
        a, b = low_pts[i], low_pts[i + 1]
        mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)
        outward = vnorm((mid[0] - apse_cx, mid[1] - apse_cy, 0))
        bands(a, b, Z_AISLE_WALL - 0.4, outward)
    # tent roof of the high apse
    peak = (apse_cx, apse_cy, ROOF_H)
    for i in range(len(high_pts) - 1):
        p0 = (high_pts[i][0], high_pts[i][1], Z_CL_EAVE - 1.2)
        p1 = (high_pts[i + 1][0], high_pts[i + 1][1], Z_CL_EAVE - 1.2)
        add_tri_uv(stone, p0, p1, peak, ((0.2, 0.55), (0.45, 0.55), (0.32, 0.95)), (0, 0, 1))
    # ambulatory lean-to: from high eave radius down to aisle wall — a band of slopes
    for i in range(len(high_pts) - 1):
        p0 = (high_pts[i][0], high_pts[i][1], Z_AISLE_JOIN)
        p1 = (high_pts[i + 1][0], high_pts[i + 1][1], Z_AISLE_JOIN)
        q1 = (low_pts[i + 1][0], low_pts[i + 1][1], Z_AISLE_WALL - 0.3)
        q0 = (low_pts[i][0], low_pts[i][1], Z_AISLE_WALL - 0.3)
        add_quad(stone, p0, p1, q1, q0, RF, (0, -0.2, 1))

    # Lady chapel on axis plus four radiating chapels.
    # The 1976 nomination and the sacred-architecture note describe a Lady Chapel
    # and five further chapels; the outermost pair is folded into these flanks
    # so the chevet stays readable. Axial chapel reaches the 365 ft extreme.
    chapels = [
        (0.0, 7.6, None, 15.6),
        (36.0, 5.0, 6.4, 13.4),
        (-36.0, 5.0, 6.4, 13.4),
        (72.0, 4.6, 5.5, 12.6),
        (-72.0, 4.6, 5.5, 12.6),
    ]
    for ang, width, reach, peak_z in chapels:
        a = math.radians(ang)
        direction = (math.sin(a), -math.cos(a))
        right2 = (math.cos(a), math.sin(a))
        # start on the ambulatory wall
        start_r = aisle_r * 0.92
        sx = apse_cx + direction[0] * start_r
        sy = apse_cy + direction[1] * start_r
        if reach is None:
            # land the outer face on Y_APSE
            # outer y = sy + direction_y * reach = Y_APSE, direction_y is negative on axis
            if abs(direction[1]) < 0.2:
                reach = 8.0
            else:
                reach = (Y_APSE - sy) / direction[1]
            reach = max(6.0, min(14.0, reach))
        ex = sx + direction[0] * reach
        ey = sy + direction[1] * reach
        hw = width * 0.5
        # four plan corners: start-left, start-right, end-right, end-left
        def corner(along, side):
            return (
                sx + direction[0] * along + right2[0] * side,
                sy + direction[1] * along + right2[1] * side,
            )
        c_sl = corner(0.2, -hw)
        c_sr = corner(0.2, hw)
        c_er = corner(reach, hw)
        c_el = corner(reach, -hw)
        outward_end = (direction[0], direction[1], 0)
        # side walls
        bands(c_sl, c_el, 8.2, (-right2[0], -right2[1], 0))
        bands(c_sr, c_er, 8.2, (right2[0], right2[1], 0))
        bands(c_el, c_er, 8.2, outward_end)
        if level < 2:
            add_lancet(
                stone, glass, ((c_el[0] + c_er[0]) * 0.5, (c_el[1] + c_er[1]) * 0.5, 0),
                (right2[0], right2[1], 0), outward_end, min(2.2, width * 0.46), 2.8, 5.6, level,
            )
        # gable roof, ridge along the chapel axis
        ridge_h = peak_z
        eave = 8.2
        p_el = (c_el[0], c_el[1], eave)
        p_er = (c_er[0], c_er[1], eave)
        p_sl = (c_sl[0], c_sl[1], eave + 0.4)
        p_sr = (c_sr[0], c_sr[1], eave + 0.4)
        ridge_e = ((c_el[0] + c_er[0]) * 0.5, (c_el[1] + c_er[1]) * 0.5, ridge_h)
        ridge_s = ((c_sl[0] + c_sr[0]) * 0.5, (c_sl[1] + c_sr[1]) * 0.5, ridge_h - 0.6)
        add_quad(stone, p_el, ridge_e, ridge_s, p_sl, RF, (0, 0, 1))
        add_quad(stone, p_er, p_sr, ridge_s, ridge_e, RF, (0, 0, 1))
        # end gablet
        add_tri_uv(stone, p_el, p_er, ridge_e, ((0.1, 0.55), (0.4, 0.55), (0.25, 0.9)), outward_end)
        if hi:
            add_beam(stone, ridge_s, ridge_e, 0.10, 0.08, CU)
            add_cone(stone, ridge_e[0], ridge_e[1], ridge_e[2] - 0.1, ridge_e[2] + 1.1, 0.18, 5, CU)

    # close choir east gable above the apse eave so the high roof doesn't hang open
    gable_wall(stone, -CL_HALF, CL_HALF, Y_CHOIR_END, Z_CL_EAVE - 0.2, ROOF_H, ST, tile, (0, -1, 0))

    # --- fleche ---
    fx = 0.0
    fy = (Y_TRAN_W + Y_TRAN_E) * 0.5
    add_fleche(stone, glass, fx, fy, level)

    # --- collision (LOD0 only): a few boxes, no windows ---
    if col is not None:
        ct = 12.0
        add_box(col, -CL_HALF, CL_HALF, Y_APSE + 8, Y_FACADE, 0, ROOF_H, ST, ct, bottom=True, top=True)
        add_box(col, -NAVE_HALF, NAVE_HALF, Y_TOWER_BACK, Y_TRAN_W, 0, Z_AISLE_WALL, ST, ct, bottom=True)
        add_box(col, -NAVE_HALF, NAVE_HALF, Y_TRAN_E, Y_CHOIR_END, 0, Z_AISLE_WALL, ST, ct, bottom=True)
        for _sign, x0, x1 in towers:
            add_box(col, x0, x1, Y_TOWER_BACK, Y_FRONT, 0, TOWER_H, ST, ct, bottom=True, top=True)
        add_box(col, -TRAN_HALF, -NAVE_HALF, Y_TRAN_E, Y_TRAN_W, 0, ROOF_H, ST, ct, bottom=True)
        add_box(col, NAVE_HALF, TRAN_HALF, Y_TRAN_E, Y_TRAN_W, 0, ROOF_H, ST, ct, bottom=True)
        add_box(col, -6, 6, Y_CHOIR_END - 2, Y_APSE, 0, 12, ST, ct, bottom=True)

    metal = take_regions(stone, (CU, BZ))
    lamps = Acc()
    add_uplights(lamps, level)
    return stone, glass, metal, lamps, col


def add_fleche(stone, glass, x, y, level):
    def prism(z0, z1, radius, sides=8):
        pts = []
        for i in range(sides):
            a = 2 * math.pi * (i + 0.5) / sides
            pts.append((x + radius * math.cos(a), y + radius * math.sin(a)))
        for i in range(sides):
            a, b = pts[i], pts[(i + 1) % sides]
            mid = ((a[0] + b[0]) * 0.5 - x, (a[1] + b[1]) * 0.5 - y)
            outward = vnorm((mid[0], mid[1], 0))
            wall(stone, a, b, z0, z1, CU, 3.0, outward)
        return pts

    # shoe where it meets the ridge
    add_pyramid(stone, x - 2.4, x + 2.4, y - 3.2, y + 3.2, ROOF_H - 0.2, ROOF_H + 3.2, CU)
    if level == 2:
        prism(ROOF_H + 3.0, 58.0, 2.4, 6)
        add_cone(stone, x, y, 57.2, FLECHE_H, 2.3, 6, CU)
        return

    sides = 8
    # plinth
    pts = prism(ROOF_H + 2.6, 46.5, 3.5, sides)
    # open lantern: posts + arches, no solid wall, so the spire reads as openwork
    r = 2.9
    post_pts = []
    for i in range(sides):
        a = 2 * math.pi * (i + 0.5) / sides
        post_pts.append((x + r * math.cos(a), y + r * math.sin(a)))
    for i in range(sides):
        px, py = post_pts[i]
        add_box(stone, px - 0.18, px + 0.18, py - 0.18, py + 0.18, 46.2, 56.5, CU, 2.0, top=False)
        a = post_pts[i]
        b = post_pts[(i + 1) % sides]
        mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)
        outward = vnorm((mid[0] - x, mid[1] - y, 0))
        right = vnorm((b[0] - a[0], b[1] - a[1], 0))
        span = math.hypot(b[0] - a[0], b[1] - a[1])
        add_lancet(stone, glass, (mid[0], mid[1], 0), right, outward, span * 0.62, 48.0, 51.2, level, kind="louver")
        if level == 0:
            # spout at the cornice, an architectural gargoyle shelf (not a copied sculpture)
            tip = (mid[0] + outward[0] * 1.7, mid[1] + outward[1] * 1.7, 45.6)
            add_beam(stone, (mid[0], mid[1], 46.3), tip, 0.10, 0.08, CU)
    # ring
    prism(56.2, 57.6, 3.15, sides)
    prism(57.6, 62.5, 1.9, sides)
    add_cone(stone, x, y, 61.8, FLECHE_H, 1.85, sides, CU)
    add_cone(stone, x, y, FLECHE_H - 0.4, FLECHE_H + 1.4, 0.18, 5, CU)


# ---------------------------------------------------------------------------
# Textures
# ---------------------------------------------------------------------------

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
    size = 2048
    base = Image.new("RGB", (size, size), (0, 0, 0))
    height = Image.new("L", (size, size), 128)
    orm = Image.new("RGB", (size, size), (255, 255, 0))
    draw_b = ImageDraw.Draw(base)
    draw_h = ImageDraw.Draw(height)
    draw_o = ImageDraw.Draw(orm)

    paints = {
        ST: ((188, 154, 114), 150, (255, 158, 0)),
        TR: ((214, 198, 172), 168, (255, 128, 0)),
        BRN: ((102, 74, 54), 100, (230, 188, 0)),
        BZ: ((124, 88, 54), 140, (255, 108, 255)),
        RF: ((148, 106, 80), 120, (255, 178, 0)),
        CU: ((96, 158, 138), 170, (255, 88, 255)),
        LV: ((64, 102, 90), 100, (255, 150, 30)),
        DK: ((54, 50, 46), 80, (210, 200, 0)),
    }
    rng = random.Random(1104)
    for region, (color, hval, orm_col) in paints.items():
        x0, y0, x1, y1 = _region_pixels(region, size)
        draw_b.rectangle([x0, y0, x1 - 1, y1 - 1], fill=color)
        draw_h.rectangle([x0, y0, x1 - 1, y1 - 1], fill=hval)
        draw_o.rectangle([x0, y0, x1 - 1, y1 - 1], fill=orm_col)

    # Large soft variation in the stone and roof (albedo, not a shadow bake).
    noise = Image.new("L", (size // 8, size // 8))
    npx = noise.load()
    for y in range(noise.size[1]):
        for x in range(noise.size[0]):
            npx[x, y] = rng.randrange(256)
    noise = noise.resize((size, size), Image.BILINEAR)
    base = Image.blend(base, Image.merge("RGB", (noise, noise, noise)), 0.08)
    # Weathering on the sandstone only: damp blotches and a few vertical stains.
    # Colour variation, not a baked shadow.
    px = base.load()
    sx0, sy0, sx1, sy1 = _region_pixels(ST, size)
    rng2 = random.Random(77)
    for y in range(sy0, sy1 - 3, 3):
        for x in range(sx0, sx1 - 3, 3):
            n = rng2.random()
            if n > 0.94 or n < 0.05:
                dark = n > 0.94
                for dy in range(3):
                    for dx in range(3):
                        r, g, b = px[x + dx, y + dy]
                        if dark:
                            px[x + dx, y + dy] = (max(0, r - 36), max(0, g - 28), max(0, b - 18))
                        else:
                            px[x + dx, y + dy] = (min(255, r + 18), min(255, g + 12), min(255, b + 6))
    stain = rng2
    x = sx0 + 40
    while x < sx1:
        wid = 2 + stain.randrange(3)
        for yy in range(sy0, sy1):
            if stain.random() < 0.35:
                continue
            for dx in range(wid):
                if x + dx >= sx1:
                    break
                r, g, b = px[x + dx, yy]
                px[x + dx, yy] = (max(0, r - 14), max(0, g - 10), max(0, b - 6))
        x += 90 + stain.randrange(70)

    draw_b = ImageDraw.Draw(base)
    draw_h = ImageDraw.Draw(height)
    # Stone courses inside ST and TR.
    for region, gap, mortar in ((ST, 96, 18), (TR, 120, 14)):
        x0, y0, x1, y1 = _region_pixels(region, size)
        y = y0 + 8
        while y < y1:
            draw_h.line([(x0, y), (x1 - 1, y)], fill=max(0, paints[region][1] - 70), width=3)
            draw_b.line([(x0, y), (x1 - 1, y)], fill=tuple(max(0, c - mortar) for c in paints[region][0]), width=2)
            y += gap
    # Roof tile rows.
    x0, y0, x1, y1 = _region_pixels(RF, size)
    row = 0
    y = y0
    while y < y1:
        draw_h.rectangle([x0, y, x1 - 1, min(y1 - 1, y + 6)], fill=180)
        shade = 132 + (row % 2) * 10
        draw_b.line([(x0, y), (x1 - 1, y)], fill=(shade, shade - 40, shade - 62), width=2)
        x = x0 + (18 if row % 2 else 0)
        while x < x1:
            draw_h.line([(x, y), (x, min(y1 - 1, y + 28))], fill=90, width=2)
            x += 46
        y += 30
        row += 1
    # Copper panel seams.
    x0, y0, x1, y1 = _region_pixels(CU, size)
    x = x0
    while x < x1:
        draw_h.line([(x, y0), (x, y1 - 1)], fill=90, width=2)
        x += 64
    # Louver slats.
    x0, y0, x1, y1 = _region_pixels(LV, size)
    x = x0 + 4
    while x < x1:
        draw_h.line([(x, y0), (x, y1 - 1)], fill=40, width=3)
        x += 10

    height = height.filter(ImageFilter.SMOOTH)
    normal = _normal_from_height(height)

    # Stained glass, original geometry, Chartres-like palette (not a traced window).
    gsize = 1024
    glass = Image.new("RGB", (gsize, gsize), (18, 28, 72))
    gd = ImageDraw.Draw(glass)
    # lancet half
    gd.rectangle([0, 0, gsize // 2 - 1, gsize - 1], fill=(22, 36, 92))
    gd.rectangle([18, 18, gsize // 2 - 18, gsize - 18], outline=(40, 48, 56), width=10)
    gd.polygon([(gsize // 4, 40), (40, gsize // 2), (gsize // 4, gsize - 40), (gsize // 2 - 40, gsize // 2)], outline=(230, 190, 90), width=6)
    gd.rectangle([70, 80, gsize // 4 - 16, gsize - 80], fill=(150, 28, 48))
    gd.rectangle([gsize // 4 + 16, 80, gsize // 2 - 70, gsize - 80], fill=(28, 58, 140))
    gd.ellipse([gsize // 4 - 46, 70, gsize // 4 + 46, 162], fill=(210, 170, 70), outline=(40, 48, 56), width=4)
    gd.line([(gsize // 4, 40), (gsize // 4, gsize - 40)], fill=(40, 48, 56), width=8)
    # rose half
    cx, cy, R = int(gsize * 0.75), gsize // 2, 430
    gd.ellipse([cx - R, cy - R, cx + R, cy + R], fill=(16, 32, 84), outline=(230, 196, 110), width=10)
    for i in range(12):
        a0 = math.radians(i * 30 - 90)
        a1 = math.radians((i + 1) * 30 - 90)
        col = (164, 32, 52) if i % 2 == 0 else (36, 64, 150)
        gd.polygon(
            [
                (cx, cy),
                (cx + int(math.cos(a0) * (R - 18)), cy + int(math.sin(a0) * (R - 18))),
                (cx + int(math.cos((a0 + a1) * 0.5) * (R - 70)), cy + int(math.sin((a0 + a1) * 0.5) * (R - 70))),
                (cx + int(math.cos(a1) * (R - 18)), cy + int(math.sin(a1) * (R - 18))),
            ],
            fill=col,
        )
        gd.line(
            [(cx, cy), (cx + int(math.cos(a0) * (R - 8)), cy + int(math.sin(a0) * (R - 8)))],
            fill=(48, 56, 62),
            width=6,
        )
    gd.ellipse([cx - 78, cy - 78, cx + 78, cy + 78], fill=(212, 176, 78), outline=(48, 56, 62), width=6)
    gd.ellipse([cx - 24, cy - 24, cx + 24, cy + 24], fill=(180, 40, 55))

    base.save(os.path.join(folder, "main-basecolor.png"), "PNG", optimize=True)
    normal.save(os.path.join(folder, "main-normal.png"), "PNG", optimize=True)
    orm.save(os.path.join(folder, "main-orm.png"), "PNG", optimize=True)
    glass.save(os.path.join(folder, "windows-basecolor.png"), "PNG", optimize=True)
    print("textures", folder)


def _normal_from_height(height_img):
    from PIL import Image

    w, h = height_img.size
    # Compute at half res, then upscale. OpenGL normal: +Y is up in UV,
    # and PIL row 0 is the top of the image (high V).
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
            # higher PIL y is lower V, so dH/dV = (h_up - h_down) = src[y-1] - src[y+1]
            dy = (src[x, y0] - src[x, y1]) / 255.0
            nx, ny, nz = -dx * 2.2, -dy * 2.2, 1.0
            L = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            dst[x, y] = (int((nx / L * 0.5 + 0.5) * 255), int((ny / L * 0.5 + 0.5) * 255), int((nz / L * 0.5 + 0.5) * 255))
    return out.resize((w, h), Image.BILINEAR)


def count_only():
    for level, name in ((0, "LOD0"), (1, "LOD1"), (2, "LOD2")):
        stone, glass, metal, lamps, col = build(level)
        xs = [p[0] for p in stone.V]
        ys = [p[1] for p in stone.V]
        zs = [p[2] for p in stone.V]
        total = stone.tris + glass.tris + metal.tris + lamps.tris
        print(
            f"{name} stone {stone.tris} metal {metal.tris} glass {glass.tris} lamps {lamps.tris} "
            f"col {col.tris if col else 0} sum {total} "
            f"bounds x {min(xs):.1f}..{max(xs):.1f} y {min(ys):.1f}..{max(ys):.1f} z {min(zs):.1f}..{max(zs):.1f}"
        )
        cap = (100000, 30000, 6000)[level]
        if total > cap:
            print(f"OVER BUDGET {name} {total} > {cap}", file=sys.stderr)
            return 1
    print(
        f"stations tip {Y_TIP:.2f} front {Y_FRONT:.2f} facade {Y_FACADE:.2f} "
        f"tower_back {Y_TOWER_BACK:.2f} tran {Y_TRAN_W:.2f}..{Y_TRAN_E:.2f} "
        f"choir_end {Y_CHOIR_END:.2f} apse {Y_APSE:.2f}"
    )
    print(f"widths west {WEST_W:.2f} nave {NAVE_W:.2f} tran {TRAN_W:.2f} tower {TOWER_S:.2f}")
    print(f"heights roof {ROOF_H:.2f} tower {TOWER_H:.2f} fleche {FLECHE_H:.2f}")
    return 0


# ---------------------------------------------------------------------------
# Blender
# ---------------------------------------------------------------------------

def build_scene():
    import bpy

    root = os.path.dirname(os.path.abspath(__file__))
    tex = os.path.join(root, "textures")
    for name in ("main-basecolor.png", "main-normal.png", "main-orm.png", "windows-basecolor.png"):
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
    metal_mat = make_metal_material(tex)
    win_mat = make_window_material(tex)
    lamp_mat = make_lamp_material()

    repo = os.path.abspath(os.path.join(root, "..", "..", "..", ".."))
    public = os.path.join(repo, "public", "landmarks", "newark", SLUG)
    os.makedirs(public, exist_ok=True)

    roots = []
    stats = []
    for level in (0, 1, 2):
        stone, glass, metal, lamps, col = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        body = acc_object(f"masonry-lod{level}", stone, main_mat)
        wins = acc_object(f"windows-lod{level}", glass, win_mat)
        met = acc_object(f"metal-lod{level}", metal, metal_mat)
        body.name = f"masonry-lod{level}"
        wins.name = f"windows-lod{level}"
        met.name = f"metal-lod{level}"
        body.parent = parent
        wins.parent = parent
        met.parent = parent
        if lamps.tris:
            lamp = acc_object(f"uplights-lod{level}", lamps, lamp_mat)
            lamp.name = f"uplights-lod{level}"
            lamp.parent = parent
        if col is not None:
            col_obj = acc_object(f"{SLUG}_COL", col, None, uvs=False)
            col_obj.name = f"{SLUG}_COL"
            col_obj.parent = parent
        roots.append(parent)
        total = stone.tris + glass.tris + metal.tris + lamps.tris
        stats.append(
            {
                "level": level,
                "stone": stone.tris,
                "metal": metal.tris,
                "glass": glass.tris,
                "lamps": lamps.tris,
                "col": col.tris if col else 0,
                "total": total,
            }
        )
        print(
            f"LOD{level} tris {total} (masonry {stone.tris} metal {metal.tris} "
            f"windows {glass.tris} lamps {lamps.tris} col {col.tris if col else 0})"
        )

    for img in list(bpy.data.images):
        if img.name in ("Render Result", "Viewer Node"):
            bpy.data.images.remove(img)

    # No .blend in the repo (project rule). Set CATHEDRAL_BLEND=/path.blend to save one elsewhere.
    blend_path = os.environ.get("CATHEDRAL_BLEND")
    if blend_path:
        bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True, copy=True)
        print("blend", blend_path)
    for img in bpy.data.images:
        print(" image", img.name, img.filepath)

    raw = "/tmp/cathedral-raw.glb"
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
    stats_path = "/tmp/cathedral-stats.txt"
    with open(stats_path, "w", encoding="utf-8") as fh:
        for row in stats:
            fh.write(
                f"{row['level']} {row['stone']} {row['metal']} {row['glass']} {row['lamps']} {row['col']} {row['total']}\n"
            )

    shots = os.environ.get("CATHEDRAL_SHOTS")
    if shots:
        render_shots(roots, win_mat, shots, preview=os.environ.get("CATHEDRAL_PREVIEW") == "1")


def acc_object(name, acc, material, uvs=True):
    import bpy

    mesh = bpy.data.meshes.new(name + "-mesh")
    mesh.from_pydata(acc.V, [], [list(f) for f in acc.F])
    mesh.validate(clean_customdata=False)
    mesh.update()
    if uvs:
        uv = mesh.uv_layers.new(name="UVMap")
        for poly in mesh.polygons:
            poly.use_smooth = False
            for li in poly.loop_indices:
                vi = mesh.loops[li].vertex_index
                uv.data[li].uv = acc.UV[vi]
    else:
        for poly in mesh.polygons:
            poly.use_smooth = False
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
        mat.use_backface_culling = False  # solid from every side, no see-through seams
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
    # Sandstone stays dielectric. Copper and bronze live on the metal material.
    bsdf.inputs["Metallic"].default_value = 0.0
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.location = (-80, -300)
    nmap.inputs["Strength"].default_value = 0.8
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    occ = nodes.new("ShaderNodeGroup")
    occ.node_tree = _gltf_occlusion_group()
    occ.location = (-80, -520)
    links.new(sep.outputs["Red"], occ.inputs["Occlusion"])
    return mat


def make_window_material(tex):
    import bpy

    mat = bpy.data.materials.new(WIN_MAT)
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
    image = bpy.data.images.load(os.path.join(tex, "windows-basecolor.png"))
    image.colorspace_settings.name = "sRGB"
    image.filepath = "//textures/" + "windows-basecolor.png"
    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = image
    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex_node.outputs["Color"], bsdf.inputs["Emission Color"])
    # Smooth transmitted glass, with emission so the colour reads as light from inside.
    bsdf.inputs["Emission Strength"].default_value = 1.15
    bsdf.inputs["Roughness"].default_value = 0.08
    bsdf.inputs["Metallic"].default_value = 0.0
    if "Transmission Weight" in bsdf.inputs:
        bsdf.inputs["Transmission Weight"].default_value = 0.72
    elif "Transmission" in bsdf.inputs:
        bsdf.inputs["Transmission"].default_value = 0.72
    if "IOR" in bsdf.inputs:
        bsdf.inputs["IOR"].default_value = 1.52
    return mat


def make_metal_material(tex):
    import bpy

    mat = bpy.data.materials.new(f"{SLUG}-metal")
    mat.use_nodes = True
    try:
        mat.use_backface_culling = False  # copper caps and fascias solid from below
    except Exception:
        pass
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    image = bpy.data.images.load(os.path.join(tex, "main-basecolor.png"))
    image.colorspace_settings.name = "sRGB"
    image.filepath = "//textures/main-basecolor.png"
    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = image
    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    nor = bpy.data.images.load(os.path.join(tex, "main-normal.png"))
    nor.colorspace_settings.name = "Non-Color"
    nor.filepath = "//textures/main-normal.png"
    nnode = nodes.new("ShaderNodeTexImage")
    nnode.image = nor
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.45
    links.new(nnode.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    bsdf.inputs["Metallic"].default_value = 0.4  # full metal reads black without env light
    bsdf.inputs["Roughness"].default_value = 0.5
    return mat


def make_lamp_material():
    import bpy

    mat = bpy.data.materials.new("emissive-lamp")
    mat.use_nodes = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    bsdf = nodes.get("Principled BSDF")
    if bsdf is None:
        nodes.clear()
        out = nodes.new("ShaderNodeOutputMaterial")
        bsdf = nodes.new("ShaderNodeBsdfPrincipled")
        links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (1.0, 0.78, 0.42, 1.0)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.75, 0.38, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 2.4
    bsdf.inputs["Roughness"].default_value = 0.4
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def _hide_tree(obj, hide):
    # Collision boxes are for the game, not the pictures. They have no material
    # and would otherwise sit on top of the visible meshes.
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


def render_shots(roots, win_mat, folder, preview=False):
    import bpy

    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 800 if preview else 1280
    scene.render.resolution_y = 450 if preview else 720
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 16 if preview else 28

    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.42, 0.55, 0.75, 1)
    bg.inputs[1].default_value = 0.55

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 2.4
    sun_data.angle = 0.35
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.85, 0.1, 0.9)

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 25000
    fill_data.size = 40
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)
    _look_at(fill, (-40, 30, 50), (0, 0, 20))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 28
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground = bpy.data.meshes.new("ground")
    ground.from_pydata(
        [(-80, -90, -0.02), (80, -90, -0.02), (80, 90, -0.02), (-80, 90, -0.02)],
        [],
        [(0, 1, 2, 3)],
    )
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.18, 0.2, 0.18, 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    gobj = bpy.data.objects.new("ground", ground)
    gobj.data.materials.append(gmat)
    scene.collection.objects.link(gobj)

    def show(level):
        for i, root in enumerate(roots):
            _hide_tree(root, i != level)

    target = (0, 0, 28)
    shots = [
        ("front", (0, 210, 42), (0, 0, 32)),
        ("three-quarter-west", (120, 170, 58), target),
        ("three-quarter-east", (-120, 165, 54), (0, -4, 26)),
    ]
    if not preview:
        shots += [
            ("side", (175, -4, 34), (0, -4, 26)),
            ("back", (6, -210, 48), (0, -8, 24)),
            ("top", (30, -20, 210), (0, 0, 10)),
            # Transept rose and eave, the view that showed the coplanar wall and the roof slivers.
            ("close-up-side", (42, 6, 11), (18, -1.5, 16)),
        ]
    show(0)
    for name, loc, tgt in shots:
        _look_at(cam, loc, tgt)
        scene.render.filepath = os.path.join(folder, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("shot", name)

    if preview:
        return

    # Night still. The glb keeps the authored emission; this only boosts the picture
    # and adds soft uplights that are not exported.
    bg.inputs[0].default_value = (0.015, 0.02, 0.045, 1)
    bg.inputs[1].default_value = 0.25
    sun_data.energy = 0.08
    fill_data.energy = 80
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            if mat.name == WIN_MAT:
                node.inputs["Emission Strength"].default_value = 7.5
            elif mat.name == "emissive-lamp":
                node.inputs["Emission Strength"].default_value = 18.0
    up_objs = []
    for loc, aim, energy in (
        ((0, 82, 1.6), (0, 50, 38), 18000),
        ((-16, 76, 1.4), (-14, 48, 52), 12000),
        ((16, 76, 1.4), (14, 48, 52), 12000),
        ((0, -72, 1.5), (0, -46, 26), 8000),
        ((42, -1, 1.4), (18, -2, 24), 7000),
    ):
        ld = bpy.data.lights.new("uplight", "SPOT")
        ld.energy = energy
        ld.spot_size = 1.45
        ld.spot_blend = 0.45
        ld.color = (1.0, 0.84, 0.62)
        obj = bpy.data.objects.new("uplight", ld)
        scene.collection.objects.link(obj)
        _look_at(obj, loc, aim)
        up_objs.append(obj)
    _look_at(cam, (110, 160, 40), (0, 0, 30))
    scene.render.filepath = os.path.join(folder, "night.png")
    bpy.ops.render.render(write_still=True)
    print("shot night")
    for obj in up_objs:
        bpy.data.objects.remove(obj, do_unlink=True)
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            if mat.name == WIN_MAT:
                node.inputs["Emission Strength"].default_value = 1.15
            elif mat.name == "emissive-lamp":
                node.inputs["Emission Strength"].default_value = 2.4
    sun_data.energy = 2.4
    bg.inputs[0].default_value = (0.42, 0.55, 0.75, 1)
    bg.inputs[1].default_value = 0.55

    # Wireframe of LOD0 via the wireframe modifier.
    show(0)
    body = None
    for child in roots[0].children:
        if child.name == "masonry-lod0":
            body = child
    if body is not None:
        mod = body.modifiers.new("wire", "WIREFRAME")
        mod.thickness = 0.07
        mod.use_replace = True
        _look_at(cam, (120, 170, 58), target)
        scene.render.filepath = os.path.join(folder, "wire-lod0.png")
        bpy.ops.render.render(write_still=True)
        body.modifiers.remove(mod)
        print("shot wire")

    # LOD comparison, side by side, orthographic-ish.
    gobj.hide_render = True
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 210
    offsets = (-70, 0, 70)
    for root, dx in zip(roots, offsets):
        _hide_tree(root, False)
        root.location.x = dx
    _look_at(cam, (0, 160, 28), (0, 0, 24))
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
