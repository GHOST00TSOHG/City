#!/usr/bin/env python3
"""Exterior of Newark Penn Station (Pennsylvania Station), 1935.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
The west front (Raymond Plaza) faces Blender +Y.

    python3 build_penn.py --counts
    blender -b --factory-startup --python build_penn.py

Station house 302 ft by 79 ft, waiting-room ceiling 46 ft, and the 1,200 ft
elevated train shed are from the National Register nomination (NRHP 78001760)
and the 2012 boundary increase. The plan is fitted to OSM way 49200094.
Market Street and Raymond Boulevard are the two street passages under the shed.

The Pennsylvania Railroad keystone and wordmark are not modeled. Portal letters
spell the station name in an original block alphabet. Eagle capitals are
geometric masses, not copies of the carved reliefs.

No Google imagery. No paid add-ons. Run with --factory-startup.
"""

from __future__ import annotations

import math
import os
import random
import sys

FT = 0.3048
SLUG = "newark-penn-station"
MAIN_MAT = f"{SLUG}-main"
WIN_MAT = "emissive-windows"
LAMP_MAT = "emissive-lamp"

# OSM way 49200094, ENU about the vertex centroid, along-track bearing of the
# west wall (south to north). Across is toward the southeast.
BEARING = 47.012
VC_LAT = 40.73451760
VC_LON = -74.16395929
R_EARTH = 6378137.0

# West wall endpoints measured on that bearing (along, across).
_WALL_N_ALONG = 27.667689804682425
_WALL_S_ALONG = -64.52588267066321
MID_ALONG = (_WALL_N_ALONG + _WALL_S_ALONG) * 0.5
HOUSE_L = 302.0 * FT
HOUSE_D = 79.0 * FT
HS = MID_ALONG - HOUSE_L * 0.5
HN = MID_ALONG + HOUSE_L * 0.5
HW = -57.210
HE = HW + HOUSE_D

# Shed length is the mapped viaduct, which matches the nomination's 1,200 ft.
VS = -237.91
VN = 128.33
VE = 41.20

_B = math.radians(BEARING)


def _rect_cent(a0, a1, c0, c1):
    return ((a0 + a1) * 0.5, (c0 + c1) * 0.5, abs(a1 - a0) * abs(c1 - c0))


_h = _rect_cent(HS, HN, HW, HE)
_v = _rect_cent(VS, VN, HE, VE)
_area = _h[2] + _v[2]
ALONG0 = (_h[0] * _h[2] + _v[0] * _v[2]) / _area
ACROSS0 = (_h[1] * _h[2] + _v[1] * _v[2]) / _area

# Street arches. West and east mouths are shifted where the street is diagonal.
SH = 4.2
MKT_W = (-129.2, -107.2)
MKT_E = (-86.2, -64.2)
RAY_W = (70.5, 92.5)
RAY_E = (74.5, 96.5)

# Heights. Waiting-room ceiling is 46 ft; the cornice clears it. The shed
# parapet lines up with that cornice. Street arches are segmental.
BASE = 3.55
WIN_SILL = 3.95
WIN_HEAD = 12.70
ENTAB = 13.65
CORNICE = 16.15
PED_PEAK = 19.85
ROOF_Z = 15.45
CLERE_TOP = 19.35
V_PARAPET = 16.55
V_SPRING = 2.05
V_CROWN = 7.85
ARCH_SPRING = 8.45
ARCH_CROWN = 13.15

# Atlas rectangles (u, v, w, h). v is the bottom of the region.
LIM = (0.00, 0.00, 0.50, 0.50)
GRN = (0.50, 0.00, 0.25, 0.50)
BRK = (0.75, 0.00, 0.25, 0.50)
TC = (0.00, 0.50, 0.25, 0.25)
ALU = (0.25, 0.50, 0.25, 0.25)
RF = (0.50, 0.50, 0.25, 0.25)
DK = (0.75, 0.50, 0.25, 0.25)
COP = (0.00, 0.72, 0.34, 0.16)
ORN = (0.34, 0.72, 0.33, 0.16)
CLK = (0.67, 0.72, 0.16, 0.16)
SUN = (0.83, 0.72, 0.17, 0.16)
SGN = (0.00, 0.88, 1.00, 0.12)

W_PANE = (0.00, 0.00, 0.34, 1.00)
W_TRIPLE = (0.34, 0.00, 0.28, 1.00)
W_DOOR = (0.62, 0.00, 0.20, 1.00)
W_OCU = (0.82, 0.08, 0.18, 0.42)
W_MARB = (0.82, 0.55, 0.18, 0.40)


def MX(along):
    return along - ALONG0


def MY(across):
    return -(across - ACROSS0)


def origin_latlon():
    east = ALONG0 * math.sin(_B) + ACROSS0 * math.sin(_B + math.pi / 2.0)
    north = ALONG0 * math.cos(_B) + ACROSS0 * math.cos(_B + math.pi / 2.0)
    lat = VC_LAT + math.degrees(north / R_EARTH)
    lon = VC_LON + math.degrees(east / (R_EARTH * math.cos(math.radians(VC_LAT))))
    return lat, lon


def vadd(a, b):
    return (a[0] + b[0], a[1] + b[1], a[2] + b[2])


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
    return math.sqrt(vdot(a, a))


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
    length = vlen(cr)
    if length < 1e-10:
        return None
    return (cr[0] / length, cr[1] / length, cr[2] / length)


def add_tri(acc, p0, p1, p2, region, hint):
    n = _normal(p0, p1, p2)
    if n is None:
        return
    if vdot(n, hint) < 0:
        n = (-n[0], -n[1], -n[2])
        p1, p2 = p2, p1
    u, v, w, h = region
    uvs = ((u, v), (u + w, v), (u + w * 0.5, v + h))
    ids = [acc.add(p, n, uv) for p, uv in zip((p0, p1, p2), uvs)]
    acc.tri(ids[0], ids[1], ids[2])


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


def add_grid(acc, p00, p10, p11, p01, nu, nv, region, hint, cap):
    nu = max(1, min(cap, int(nu)))
    nv = max(1, min(cap, int(nv)))
    for j in range(nv):
        for i in range(nu):
            u0, u1 = i / nu, (i + 1) / nu
            v0, v1 = j / nv, (j + 1) / nv

            def at(u, v):
                a = lerp(p00, p10, u)
                b = lerp(p01, p11, u)
                return lerp(a, b, v)

            add_quad(acc, at(u0, v0), at(u1, v0), at(u1, v1), at(u0, v1), region, hint)


def wall(acc, a, b, z0, z1, region, tile, outward, cap):
    if z1 - z0 < 0.04:
        return
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    if length < 0.05:
        return
    c00 = (a[0], a[1], z0)
    c10 = (b[0], b[1], z0)
    c11 = (b[0], b[1], z1)
    c01 = (a[0], a[1], z1)
    nu = max(1, int(round(length / tile)))
    nv = max(1, int(round((z1 - z0) / max(tile, 0.5))))
    hint = (outward[0], outward[1], 0.0 if len(outward) == 2 else outward[2])
    add_grid(acc, c00, c10, c11, c01, nu, nv, region, hint, cap)


def flat(acc, x0, x1, y0, y1, z, sign, region, tile, cap):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    if x1 - x0 < 0.05 or y1 - y0 < 0.05:
        return
    nu = max(1, int(round((x1 - x0) / tile)))
    nv = max(1, int(round((y1 - y0) / tile)))
    add_grid(
        acc,
        (x0, y0, z),
        (x1, y0, z),
        (x1, y1, z),
        (x0, y1, z),
        nu,
        nv,
        region,
        (0.0, 0.0, sign),
        cap,
    )


def box(acc, x0, x1, y0, y1, z0, z1, region, tile, cap, bottom=False, top=True):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    wall(acc, (x0, y0), (x1, y0), z0, z1, region, tile, (0, -1, 0), cap)
    wall(acc, (x0, y1), (x1, y1), z0, z1, region, tile, (0, 1, 0), cap)
    wall(acc, (x0, y0), (x0, y1), z0, z1, region, tile, (-1, 0, 0), cap)
    wall(acc, (x1, y0), (x1, y1), z0, z1, region, tile, (1, 0, 0), cap)
    if top:
        flat(acc, x0, x1, y0, y1, z1, 1, region, tile, cap)
    if bottom:
        flat(acc, x0, x1, y0, y1, z0, -1, region, tile, cap)


def arch_xz(x0, x1, z_spring, z_crown, n):
    span = x1 - x0
    rise = max(0.3, z_crown - z_spring)
    half = span * 0.5
    radius = (rise * rise + half * half) / (2.0 * rise)
    cx = (x0 + x1) * 0.5
    cz = z_crown - radius
    # A perfect semicircle puts the center on the spring line. Float error then
    # makes atan2 flip to the lower half of the circle, so the arch is forced
    # through the crown.
    left_z = z_spring - cz
    if abs(left_z) < 1e-6:
        left_z = 0.0
    a0 = math.atan2(left_z, -half)
    a1 = math.atan2(left_z, half)
    if a0 < 0.0:
        a0 += math.tau
    if a1 < 0.0:
        a1 += math.tau
    if a1 > a0:
        a1 -= math.tau
    pts = []
    steps = max(2, n)
    for i in range(steps + 1):
        a = a0 + (a1 - a0) * (i / steps)
        pts.append((cx + math.cos(a) * radius, cz + math.sin(a) * radius))
    return pts


def place(axis, fixed, u, z, nudge):
    if axis == "x":
        return (u, fixed + nudge, z)
    return (fixed + nudge, u, z)


def panel(acc, axis, fixed, u0, u1, z0, z1, nudge, region, hint):
    if u1 < u0:
        u0, u1 = u1, u0
    if z1 - z0 < 0.03 or u1 - u0 < 0.03:
        return
    add_quad(
        acc,
        place(axis, fixed, u0, z0, nudge),
        place(axis, fixed, u1, z0, nudge),
        place(axis, fixed, u1, z1, nudge),
        place(axis, fixed, u0, z1, nudge),
        region,
        hint,
    )


def disc(acc, axis, fixed, u, z, radius, nudge, region, hint, n):
    u0, v0, w, h = region
    cuv = (u0 + w * 0.5, v0 + h * 0.5)
    ring = []
    for i in range(n):
        ang = math.tau * i / n
        uu = u + math.cos(ang) * radius
        zz = z + math.sin(ang) * radius
        uv = (u0 + w * (0.5 + 0.48 * math.cos(ang)), v0 + h * (0.5 + 0.48 * math.sin(ang)))
        ring.append((place(axis, fixed, uu, zz, nudge), uv))
    c = place(axis, fixed, u, z, nudge)
    sample = _normal(c, ring[0][0], ring[1][0])
    if sample is not None and vdot(sample, hint) < 0:
        ring.reverse()
    ids = [acc.add(p, hint, uv) for p, uv in ring]
    ids_c = acc.add(c, hint, cuv)
    for i in range(n):
        acc.tri(ids_c, ids[i], ids[(i + 1) % n])


# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------

def _cap(level):
    return (64, 22, 6)[level]


def _tile(level):
    return (5.5, 12.0, 48.0)[level]


def _arch_n(level):
    return (12, 7, 4)[level]


def build(level):
    stone, glass, lamp = Acc(), Acc(), Acc()
    col = Acc() if level == 0 else None
    build_viaduct(stone, glass, lamp, level)
    build_house(stone, glass, lamp, level)
    if col is not None:
        build_collision(col)
    return stone, glass, lamp, col


def build_viaduct(stone, glass, lamp, level):
    cap = _cap(level)
    tile = _tile(level)
    yw = MY(HE)
    ye = MY(VE)
    x_s = MX(VS)
    x_n = MX(VN)
    # Ends.
    wall(stone, (x_s, ye), (x_s, yw), 0.0, V_PARAPET, BRK, tile, (-1, 0, 0), cap)
    wall(stone, (x_n, ye), (x_n, yw), 0.0, V_PARAPET, BRK, tile, (1, 0, 0), cap)
    wall(stone, (x_s, ye), (x_n, ye), 0.0, 1.15, COP, tile, (0, -1, 0), cap)
    # Long walls are split around the street arches.
    west_runs = (
        (VS, MKT_W[0] - SH),
        (MKT_W[1] + SH, HS),
        (HN, RAY_W[0] - SH),
        (RAY_W[1] + SH, VN),
    )
    east_runs = (
        (VS, MKT_E[0] - SH),
        (MKT_E[1] + SH, RAY_E[0] - SH),
        (RAY_E[1] + SH, VN),
    )
    for a, b in west_runs:
        _shed_run(stone, glass, a, b, yw, (0, 1, 0), 1.0, level)
    for a, b in east_runs:
        _shed_run(stone, glass, a, b, ye, (0, -1, 0), -1.0, level)
    _portal(stone, glass, lamp, MKT_W, MKT_E, level)
    _portal(stone, glass, lamp, RAY_W, RAY_E, level)
    inset = 0.55
    flat(stone, x_s + inset, x_n - inset, ye + inset, yw - inset, V_PARAPET - 0.22, 1, RF, tile * 1.6, cap)
    if level < 2:
        _monitors(stone, glass, x_s, x_n, ye, yw, level)
        _coping_x(stone, x_s, x_n, yw, 1.0, V_PARAPET, level)
        _coping_x(stone, x_s, x_n, ye, -1.0, V_PARAPET, level)


def _shed_run(stone, glass, a, b, y, hint, nudge_sign, level):
    if b - a < 0.8:
        return
    cap = _cap(level)
    tile = _tile(level)
    x0, x1 = MX(a), MX(b)
    wall(stone, (x0, y), (x1, y), 0.0, 1.15, COP, tile, hint, cap)
    wall(stone, (x0, y), (x1, y), 1.15, V_PARAPET, BRK, tile, hint, cap)
    if level == 2 or (b - a) < 16:
        return
    step = 14.0 if level == 1 else 11.5
    width = 6.4 if level == 0 else 7.5
    u = a + 3.0
    while u + width < b - 1.5:
        panel(glass, "x", y, MX(u), MX(u + width), 11.15, 13.85, nudge_sign * 0.07, W_TRIPLE, hint)
        if level == 0:
            panel(stone, "x", y, MX(u) - 0.18, MX(u + width) + 0.18, 10.95, 14.05, nudge_sign * 0.035, ALU, hint)
            # Green terra-cotta square on the pier before this window.
            cx = MX(u) - 2.3
            panel(stone, "x", y, cx - 1.05, cx + 1.05, 10.4, 12.5, nudge_sign * 0.05, TC, hint)
        u += step


def _portal(stone, glass, lamp, west, east, level):
    n = _arch_n(level)
    yw, ye = MY(HE), MY(VE)
    xw0, xw1 = MX(west[0]), MX(west[1])
    xe0, xe1 = MX(east[0]), MX(east[1])
    west_arch = arch_xz(xw0, xw1, V_SPRING, V_CROWN, n)
    east_arch = arch_xz(xe0, xe1, V_SPRING, V_CROWN, n)
    _shoulders(stone, glass, xw0, xw1, yw, 1.0, (0, 1, 0), level, west=True)
    _shoulders(stone, glass, xe0, xe1, ye, -1.0, (0, -1, 0), level, west=False)
    _spandrel(stone, west_arch, yw, 1.0, (0, 1, 0))
    _spandrel(stone, east_arch, ye, -1.0, (0, -1, 0))
    _tunnel(stone, west_arch, east_arch, yw, ye)
    if level < 2:
        _portal_dress(stone, glass, lamp, xw0, xw1, yw, 1.0, (0, 1, 0), level, columns=True)
        _portal_dress(stone, glass, lamp, xe0, xe1, ye, -1.0, (0, -1, 0), level, columns=level == 0)


def _shoulders(stone, glass, x0, x1, y, nudge_sign, hint, level, west):
    cap = _cap(level)
    tile = _tile(level)
    shoulder = MX(SH) - MX(0.0)
    for xa, xb in ((x0 - shoulder, x0), (x1, x1 + shoulder)):
        wall(stone, (xa, y), (xb, y), 0.0, 1.15, GRN if west else COP, tile, hint, cap)
        wall(stone, (xa, y), (xb, y), 1.15, V_PARAPET, BRK, tile, hint, cap)
    if level == 2:
        return
    radius = 1.05 if level == 0 else 0.9
    segs = 10 if level == 0 else 6
    for cx in (x0 - shoulder * 0.55, x1 + shoulder * 0.55):
        disc(glass, "x", y, cx, 13.35, radius, nudge_sign * 0.08, W_OCU, hint, segs)
        if level == 0:
            disc(stone, "x", y, cx, 13.35, radius + 0.28, nudge_sign * 0.04, COP, hint, segs)


def _spandrel(stone, arch, y, nudge_sign, hint):
    # Brick from the arch up to the parapet, in the plane of the wall.
    for i in range(len(arch) - 1):
        x0, z0 = arch[i]
        x1, z1 = arch[i + 1]
        add_quad(
            stone,
            (x0, y, z0),
            (x1, y, z1),
            (x1, y, V_PARAPET),
            (x0, y, V_PARAPET),
            BRK,
            hint,
        )


def _tunnel(stone, west_arch, east_arch, yw, ye):
    n = len(west_arch) - 1
    for i in range(n):
        w0 = (west_arch[i][0], yw, west_arch[i][1])
        w1 = (west_arch[i + 1][0], yw, west_arch[i + 1][1])
        e1 = (east_arch[i + 1][0], ye, east_arch[i + 1][1])
        e0 = (east_arch[i][0], ye, east_arch[i][1])
        add_quad(stone, w0, w1, e1, e0, DK, (0, 0, -1))
    # Vertical jambs, ground up to the spring.
    pairs = (
        (west_arch[0], east_arch[0], (1, 0, 0)),
        (west_arch[-1], east_arch[-1], (-1, 0, 0)),
    )
    for w, e, hint in pairs:
        add_quad(
            stone,
            (w[0], yw, 0.0),
            (e[0], ye, 0.0),
            (e[0], ye, w[1]),
            (w[0], yw, w[1]),
            BRK,
            hint,
        )


def _portal_dress(stone, glass, lamp, x0, x1, y, nudge_sign, hint, level, columns):
    span = x1 - x0
    cx = (x0 + x1) * 0.5
    # Granite arch ring, proud of the brick.
    ring = arch_xz(x0, x1, V_SPRING, V_CROWN, _arch_n(level))
    outer = arch_xz(x0 - 0.55, x1 + 0.55, V_SPRING - 0.15, V_CROWN + 0.7, _arch_n(level))
    ny = y + nudge_sign * 0.16
    for i in range(len(ring) - 1):
        add_quad(
            stone,
            (ring[i][0], ny, ring[i][1]),
            (ring[i + 1][0], ny, ring[i + 1][1]),
            (outer[i + 1][0], ny, outer[i + 1][1]),
            (outer[i][0], ny, outer[i][1]),
            GRN,
            hint,
        )
    # Jambs.
    for edge, sign in ((x0, -1), (x1, 1)):
        panel(stone, "x", y, edge + sign * 0.08, edge + sign * 0.72, 0.0, V_SPRING + 0.4, nudge_sign * 0.16, GRN, hint)
    # Louver bands and the station name.
    for k, z0 in enumerate((8.55, 9.25, 9.95)):
        panel(stone, "x", y, cx - span * 0.34, cx + span * 0.34, z0, z0 + 0.42, nudge_sign * 0.1, TC, hint)
    panel(stone, "x", y, cx - 8.2, cx + 8.2, 10.7, 12.15, nudge_sign * 0.12, SGN, hint)
    if level == 0:
        _crest_row(stone, cx - span * 0.55, cx + span * 0.55, y, nudge_sign, V_PARAPET - 0.05, 2.6)
    if columns:
        sides = 10 if level == 0 else 6
        for edge in (x0 - 0.15, x1 + 0.15):
            _column(stone, edge, y + nudge_sign * 0.85, 0.15, V_SPRING + 1.35, 0.62, sides, nudge_sign, level == 0)
    # A short row of lamps under the crown.
    if level < 2:
        for i in range(3):
            lx = cx + (i - 1) * 2.4
            panel(lamp, "x", y, lx - 0.28, lx + 0.28, V_CROWN - 0.55, V_CROWN - 0.22, nudge_sign * 0.2, (0, 0, 1, 1), (0, 0, -1))


def _column(stone, x, y, z0, z1, radius, sides, nudge_sign, eagle):
    hint_out = (0, nudge_sign, 0)
    pts = []
    for i in range(sides):
        a = math.tau * i / sides
        flute = 0.90 if (level_flute(i) and sides >= 8) else 1.0
        pts.append((math.cos(a) * radius * flute, math.sin(a) * radius * flute))
    for i in range(sides):
        x0, y0 = pts[i]
        x1, y1 = pts[(i + 1) % sides]
        add_quad(
            stone,
            (x + x0, y + y0, z0),
            (x + x1, y + y1, z0),
            (x + x1, y + y1, z1),
            (x + x0, y + y0, z1),
            GRN,
            (x0 + x1, y0 + y1, 0),
        )
    if eagle:
        _eagle(stone, x, y, z1, nudge_sign)


def level_flute(i):
    return i % 2 == 0


def _eagle(stone, x, y, z, nudge_sign):
    """Geometric bird mass. Not a copy of the granite eagles."""
    body_y = y + nudge_sign * 0.15
    box(stone, x - 0.28, x + 0.28, body_y - 0.22, body_y + 0.22, z, z + 0.55, GRN, 2.0, 4, bottom=True, top=True)
    # Wings: two wedges.
    for sign in (-1, 1):
        add_quad(
            stone,
            (x, body_y, z + 0.28),
            (x + sign * 0.95, body_y + nudge_sign * 0.05, z + 0.42),
            (x + sign * 0.85, body_y + nudge_sign * 0.05, z + 0.72),
            (x, body_y, z + 0.5),
            GRN,
            (sign, nudge_sign, 1),
        )
    box(stone, x - 0.1, x + 0.1, body_y - 0.08, body_y + 0.28 * nudge_sign, z + 0.4, z + 0.72, GRN, 1.0, 3, bottom=False, top=True)


def _crest_row(stone, x0, x1, y, nudge_sign, z, step):
    x = x0
    yy = y + nudge_sign * 0.22
    while x < x1 - 0.2:
        add_tri(
            stone,
            (x, yy, z),
            (x + step * 0.72, yy, z),
            (x + step * 0.36, yy, z + 0.85),
            ALU,
            (0, nudge_sign, 0),
        )
        x += step


def _coping_x(stone, x0, x1, y, nudge_sign, z, level):
    if x1 < x0:
        x0, x1 = x1, x0
    depth = 0.42
    y0 = y if nudge_sign > 0 else y - depth
    y1 = y + depth if nudge_sign > 0 else y
    # The ledge sits outside the wall. Pull it fully outward.
    if nudge_sign > 0:
        y0, y1 = y + 0.02, y + 0.02 + depth
    else:
        y0, y1 = y - 0.02 - depth, y - 0.02
    tile = 18.0 if level == 0 else 40.0
    box(stone, x0, x1, y0, y1, z - 0.32, z + 0.06, COP, tile, _cap(level), bottom=False, top=True)


def _monitors(stone, glass, x0, x1, y_east, y_west, level):
    span = y_west - y_east
    z0 = V_PARAPET - 0.22
    z1 = z0 + (0.85 if level == 0 else 0.6)
    for t in (0.34, 0.66):
        yc = y_east + span * t
        half = 2.4 if level == 0 else 3.2
        box(stone, x0 + 6, x1 - 6, yc - half, yc + half, z0, z1, COP, 20.0, _cap(level), bottom=False, top=False)
        flat(glass, x0 + 6, x1 - 6, yc - half + 0.4, yc + half - 0.4, z1 + 0.02, 1, W_PANE, 30.0, 8)


def build_house(stone, glass, lamp, level):
    cap = _cap(level)
    tile = _tile(level)
    x0, x1 = MX(HS), MX(HN)
    yw, ye = MY(HW), MY(HE)
    # Shell. East wall is buried against the shed, so it stays plain.
    wall(stone, (x0, yw), (x1, yw), 0.0, BASE, GRN, tile, (0, 1, 0), cap)
    wall(stone, (x0, yw), (x1, yw), BASE, CORNICE, LIM, tile, (0, 1, 0), cap)
    wall(stone, (x0, ye), (x1, ye), 0.0, ROOF_Z, LIM, tile, (0, -1, 0), cap)
    for x, hint in ((x0, (-1, 0, 0)), (x1, (1, 0, 0))):
        wall(stone, (x, ye), (x, yw), 0.0, BASE, GRN, tile, hint, cap)
        wall(stone, (x, ye), (x, yw), BASE, CORNICE, LIM, tile, hint, cap)
    # Roof of the west quarter, in front of the clerestory.
    cl_y = MY(HW + HOUSE_D * 0.25)
    flat(stone, x0 + 0.4, x1 - 0.4, cl_y, yw - 0.15, ROOF_Z, 1, RF, tile, cap)
    _clerestory(stone, glass, x0, x1, cl_y, ye, level)
    _entablature(stone, "x", yw, x0, x1, 1.0, (0, 1, 0), level)
    _entablature(stone, "y", x0, ye, yw, -1.0, (-1, 0, 0), level)
    _entablature(stone, "y", x1, ye, yw, 1.0, (1, 0, 0), level)
    _west_bays(stone, glass, lamp, yw, level)
    _end_facade(stone, glass, lamp, x0, ye, yw, -1.0, (-1, 0, 0), "south", level)
    _end_facade(stone, glass, lamp, x1, ye, yw, 1.0, (1, 0, 0), "north", level)
    if level == 0:
        _crest_row(stone, x0 + 1.0, x1 - 1.0, yw, 1.0, CORNICE - 0.05, 3.15)


def _clerestory(stone, glass, x0, x1, y_west, y_east, level):
    cap = _cap(level)
    tile = _tile(level)
    z0, z1 = ROOF_Z + 0.15, CLERE_TOP
    xa, xb = x0 + 2.4, x1 - 2.4
    wall(stone, (xa, y_west), (xb, y_west), z0, z1, BRK, tile, (0, 1, 0), cap)
    wall(stone, (xa, y_east), (xb, y_east), z0, z1, BRK, tile, (0, -1, 0), cap)
    wall(stone, (xa, y_east), (xa, y_west), z0, z1, BRK, tile, (-1, 0, 0), cap)
    wall(stone, (xb, y_east), (xb, y_west), z0, z1, BRK, tile, (1, 0, 0), cap)
    flat(stone, xa, xb, y_east, y_west, z1, 1, RF, tile, cap)
    if level == 2:
        panel(glass, "x", y_west, xa + 2, xb - 2, z0 + 0.8, z1 - 0.7, 0.06, W_TRIPLE, (0, 1, 0))
        return
    step = 8.0 if level == 1 else 6.2
    width = 4.4 if level == 0 else 5.2
    u = HS + 4.0
    while u + width < HN - 4.0:
        panel(glass, "x", y_west, MX(u), MX(u + width), z0 + 0.7, z1 - 0.55, 0.07, W_TRIPLE if level else W_PANE, (0, 1, 0))
        u += step


def _entablature(stone, axis, fixed, u0, u1, nudge_sign, hint, level):
    if level == 2:
        panel(stone, axis, fixed, u0, u1, ENTAB, CORNICE, nudge_sign * 0.22, LIM, hint)
        return
    panel(stone, axis, fixed, u0, u1, ENTAB, ENTAB + 0.72, nudge_sign * 0.2, LIM, hint)
    # Frieze repeats the key ornament. One quad per few metres.
    tile = 3.4 if level == 0 else 7.0
    u = min(u0, u1)
    stop = max(u0, u1)
    while u < stop - 0.2:
        panel(stone, axis, fixed, u, min(stop, u + tile), ENTAB + 0.72, ENTAB + 1.7, nudge_sign * 0.16, ORN, hint)
        u += tile
    panel(stone, axis, fixed, u0, u1, ENTAB + 1.7, CORNICE, nudge_sign * 0.38, COP, hint)


def _west_bays(stone, glass, lamp, y, level):
    a = 18.2
    b = 14.5
    c = HOUSE_L - 2.0 * a - 2.0 * b
    door_w = 6.4
    cursor = HS
    bands = (
        ("win", a, 4),
        ("arch", b, "clock"),
        ("win", c, 5),
        ("arch", b, "sun"),
        ("win", a - door_w, 3),
        ("door", door_w, 4),
    )
    hint = (0, 1, 0)
    for kind, width, extra in bands:
        u0, u1 = cursor, cursor + width
        if kind == "win":
            _window_bays(stone, glass, "x", y, u0, u1, extra, 1.0, hint, level, W_PANE)
        elif kind == "arch":
            _entrance_arch(stone, glass, lamp, y, u0, u1, 1.0, hint, level, extra)
        else:
            _door_bank(stone, glass, lamp, "x", y, u0, u1, 1.0, hint, level, round_canopy=True)
        cursor = u1


def _window_bays(stone, glass, axis, fixed, u0, u1, count, nudge_sign, hint, level, pane):
    if u1 < u0:
        u0, u1 = u1, u0
    n = count
    if level == 1:
        n = max(1, (count + 1) // 2)
    if level == 2:
        n = 1
    width = (u1 - u0) / n
    for i in range(n):
        a = u0 + i * width
        b = a + width
        inset = 0.55 if n > 1 else 1.1
        if level == 0 and n > 1:
            # Pilaster on the shared edge.
            pc = a
            if i > 0:
                panel(stone, axis, fixed, pc - 0.34, pc + 0.34, BASE, ENTAB, nudge_sign * 0.22, LIM, hint)
        panes = 3 if level == 0 else 1
        glass_region = pane if panes == 1 else W_PANE
        if panes == 1:
            panel(glass, axis, fixed, a + inset, b - inset, WIN_SILL, WIN_HEAD, nudge_sign * 0.06, W_TRIPLE if level == 1 else glass_region, hint)
        else:
            gap = 0.16
            inner0, inner1 = a + inset, b - inset
            pw = (inner1 - inner0 - 2 * gap) / 3.0
            for k in range(3):
                p0 = inner0 + k * (pw + gap)
                panel(glass, axis, fixed, p0, p0 + pw, WIN_SILL, WIN_HEAD, nudge_sign * 0.06, W_PANE, hint)
            # Aluminum medallion band across the triple window.
            panel(stone, axis, fixed, a + inset - 0.08, b - inset + 0.08, 8.35, 9.15, nudge_sign * 0.09, ALU, hint)
        if level == 0:
            panel(stone, axis, fixed, a + inset - 0.12, b - inset + 0.12, WIN_SILL - 0.16, WIN_SILL, nudge_sign * 0.1, COP, hint)


def _entrance_arch(stone, glass, lamp, y, u0, u1, nudge_sign, hint, level, emblem):
    x0, x1 = MX(u0), MX(u1)
    margin = 2.55
    ax0, ax1 = x0 + margin, x1 - margin
    n = _arch_n(level)
    arch = arch_xz(ax0, ax1, ARCH_SPRING, ARCH_CROWN, n)
    # Glazing fills the arch above the doors.
    door_top = 3.35
    for i in range(len(arch) - 1):
        add_quad(
            glass,
            (arch[i][0], y + 0.06, door_top),
            (arch[i + 1][0], y + 0.06, door_top),
            (arch[i + 1][0], y + 0.06, arch[i + 1][1]),
            (arch[i][0], y + 0.06, arch[i][1]),
            W_TRIPLE if level == 1 else W_PANE,
            hint,
        )
    _door_bank(stone, glass, lamp, "x", y, u0 + margin / HOUSE_L * 0 + (ax0 - MX(0)) * 0 + 0, u1, nudge_sign, hint, level, round_canopy=False, x_override=(ax0, ax1))
    # The call above is clumsy. Doors are drawn by _door_leaves.
    # Granite ring.
    outer = arch_xz(ax0 - 0.48, ax1 + 0.48, ARCH_SPRING - 0.2, ARCH_CROWN + 0.55, n)
    yy = y + 0.18
    for i in range(len(arch) - 1):
        add_quad(
            stone,
            (arch[i][0], yy, arch[i][1]),
            (arch[i + 1][0], yy, arch[i + 1][1]),
            (outer[i + 1][0], yy, outer[i + 1][1]),
            (outer[i][0], yy, outer[i][1]),
            GRN,
            hint,
        )
    for edge, sign in ((ax0, -1), (ax1, 1)):
        panel(stone, "x", y, edge + sign * 0.05, edge + sign * 0.62, 0.0, ARCH_SPRING, 0.18, GRN, hint)
    _pediment(stone, glass, x0 + 0.4, x1 - 0.4, y, CORNICE - 0.05, PED_PEAK, 1.0, level, emblem)


def _door_bank(stone, glass, lamp, axis, fixed, u0, u1, nudge_sign, hint, level, round_canopy=False, x_override=None):
    if axis != "x":
        return
    if x_override:
        x0, x1 = x_override
    else:
        x0, x1 = MX(u0) + 0.45, MX(u1) - 0.45
    leaves = 7 if (x1 - x0) > 8 else 4
    if level == 2:
        leaves = 1
    gap = 0.08
    pw = ((x1 - x0) - gap * (leaves - 1)) / leaves
    z1 = 3.25
    for i in range(leaves):
        p0 = x0 + i * (pw + gap)
        panel(glass, "x", fixed, p0, p0 + pw, 0.05, z1, nudge_sign * 0.07, W_DOOR, hint)
    # Transom.
    panel(glass, "x", fixed, x0, x1, z1, z1 + 0.85, nudge_sign * 0.07, W_PANE, hint)
    if level == 2:
        return
    z_canopy = 3.55
    y_wall = fixed
    reach = 3.15 if leaves >= 7 else 2.35
    if round_canopy and level == 0:
        _half_round(stone, lamp, (x0 + x1) * 0.5, y_wall, reach, z_canopy, nudge_sign)
    else:
        y_tip = y_wall + nudge_sign * reach
        ya, yb = (y_wall, y_tip) if y_tip > y_wall else (y_tip, y_wall)
        box(stone, x0 - 0.15, x1 + 0.15, ya, yb, z_canopy, z_canopy + 0.22, ALU, 4.0, 8, bottom=False, top=True)
        flat(lamp, x0, x1, ya, yb, z_canopy - 0.01, -1, (0, 0, 1, 1), 4.0, 4)


def _half_round(stone, lamp, x, y_wall, reach, z, nudge_sign):
    n = 6
    pts = []
    for i in range(n + 1):
        a = math.pi * i / n
        # Semicircle opening toward +nudge.
        pts.append((x + math.cos(a) * reach, y_wall + nudge_sign * math.sin(a) * reach))
    for i in range(n):
        add_quad(
            stone,
            (pts[i][0], pts[i][1], z),
            (pts[i + 1][0], pts[i + 1][1], z),
            (pts[i + 1][0], pts[i + 1][1], z + 0.18),
            (pts[i][0], pts[i][1], z + 0.18),
            ALU,
            (0, nudge_sign, 0),
        )
        add_tri(
            lamp,
            (pts[i][0], pts[i][1], z - 0.01),
            (pts[i + 1][0], pts[i + 1][1], z - 0.01),
            (x, y_wall, z - 0.01),
            (0, 0, 1, 1),
            (0, 0, -1),
        )


def _pediment(stone, glass, x0, x1, y, z_base, z_peak, nudge_sign, level, emblem):
    cx = (x0 + x1) * 0.5
    yy = y + nudge_sign * 0.2
    yb = y - nudge_sign * 0.55
    peak = (cx, yy, z_peak)
    peak_b = (cx, yb, z_peak - 0.35)
    add_tri(stone, (x0, yy, z_base), (x1, yy, z_base), peak, LIM, (0, nudge_sign, 0))
    add_quad(stone, (x0, yy, z_base), (x0, yb, z_base), peak_b, peak, LIM, (-1, 0, 0.2))
    add_quad(stone, (x1, yb, z_base), (x1, yy, z_base), peak, peak_b, LIM, (1, 0, 0.2))
    add_quad(stone, (x0, yb, z_base), (x1, yb, z_base), (x1, yy, z_base), (x0, yy, z_base), COP, (0, 0, -1))
    if level == 2 or emblem is None:
        return
    if emblem == "clock":
        disc(stone, "x", y, cx, z_base + (z_peak - z_base) * 0.42, 1.15, nudge_sign * 0.28, CLK, (0, nudge_sign, 0), 12)
    elif emblem == "sun":
        disc(stone, "x", y, cx, z_base + (z_peak - z_base) * 0.46, 1.25, nudge_sign * 0.28, SUN, (0, nudge_sign, 0), 12)


def _end_facade(stone, glass, lamp, x, y0, y1, nudge_sign, hint, kind, level):
    if y1 < y0:
        y0, y1 = y1, y0
    mid = (y0 + y1) * 0.5
    half = 4.3 if level < 2 else 5.5
    pane = W_MARB if kind == "south" else W_TRIPLE
    _window_bays(stone, glass, "y", x, mid - half, mid + half, 1 if level == 2 else 3, nudge_sign, hint, 0 if level == 0 else level, pane)
    if kind == "north" and level < 2:
        for i in range(5):
            gy = mid - 3.6 + i * 1.8
            panel(stone, "y", x, gy - 0.55, gy + 0.55, WIN_HEAD + 0.25, ENTAB - 0.15, nudge_sign * 0.08, ALU, hint)
    if kind == "south":
        _south_doors(stone, glass, lamp, x, mid, nudge_sign, hint, level)
    _pediment_y(stone, x, mid - 6.2, mid + 6.2, nudge_sign, hint, level)


def _south_doors(stone, glass, lamp, x, mid, nudge_sign, hint, level):
    leaves = 1 if level == 2 else 4
    span = 5.2
    y0, y1 = mid - span * 0.5, mid + span * 0.5
    gap = 0.08
    pw = (span - gap * (leaves - 1)) / leaves
    for i in range(leaves):
        a = y0 + i * (pw + gap)
        panel(glass, "y", x, a, a + pw, 0.05, 3.2, nudge_sign * 0.07, W_DOOR, hint)
    if level == 2:
        return
    reach = 2.6
    x_tip = x + nudge_sign * reach
    xa, xb = (x, x_tip) if x_tip > x else (x_tip, x)
    box(stone, xa, xb, y0 - 0.1, y1 + 0.1, 3.45, 3.68, ALU, 3.0, 6, bottom=False, top=True)
    flat(lamp, xa, xb, y0, y1, 3.44, -1, (0, 0, 1, 1), 3.0, 3)


def _pediment_y(stone, x, y0, y1, nudge_sign, hint, level):
    # Pediment on an end wall. The long axis of the pediment is Y.
    cy = (y0 + y1) * 0.5
    z_base = CORNICE - 0.05
    z_peak = PED_PEAK - 0.7
    xx = x + nudge_sign * 0.2
    xb = x - nudge_sign * 0.5
    peak = (xx, cy, z_peak)
    add_tri(stone, (xx, y0, z_base), (xx, y1, z_base), peak, LIM, hint)
    add_quad(
        stone,
        (xx, y0, z_base),
        (xb, y0, z_base),
        (xb, cy, z_peak - 0.3),
        peak,
        LIM,
        (0, -1, 0),
    )
    add_quad(
        stone,
        (xb, y1, z_base),
        (xx, y1, z_base),
        peak,
        (xb, cy, z_peak - 0.3),
        LIM,
        (0, 1, 0),
    )


def build_collision(col):
    # House, plus the shed in three blocks so the two streets stay open.
    # The street gap is the union of the skewed mouths.
    tile = 80.0
    cap = 2
    box(col, MX(HS), MX(HN), MY(HE), MY(HW), 0.0, CORNICE, LIM, tile, cap, bottom=True, top=True)
    gaps = (
        (min(MKT_W[0], MKT_E[0]), max(MKT_W[1], MKT_E[1])),
        (min(RAY_W[0], RAY_E[0]), max(RAY_W[1], RAY_E[1])),
    )
    cuts = [VS, gaps[0][0], gaps[0][1], gaps[1][0], gaps[1][1], VN]
    for i in range(0, len(cuts), 2):
        box(
            col,
            MX(cuts[i]),
            MX(cuts[i + 1]),
            MY(VE),
            MY(HE),
            0.0,
            V_PARAPET,
            BRK,
            tile,
            cap,
            bottom=True,
            top=True,
        )


def count_only():
    caps = (50000, 15000, 3000)
    lat, lon = origin_latlon()
    print(f"origin lat {lat:.8f} lon {lon:.8f} heading {((BEARING - 90) % 360):.3f}")
    print(f"house along {HS:.2f}..{HN:.2f} ({HN - HS:.2f} m) depth {HOUSE_D:.2f} m")
    print(f"shed along {VS:.2f}..{VN:.2f} ({VN - VS:.2f} m) across {HE:.2f}..{VE:.2f} ({VE - HE:.2f} m)")
    print(f"model origin along {ALONG0:.2f} across {ACROSS0:.2f}")
    worst = 0
    for level, cap in enumerate(caps):
        stone, glass, lamp, col = build(level)
        total = stone.tris + glass.tris + lamp.tris
        mark = "OK" if total <= cap else "OVER"
        if total > cap:
            worst = 1
        col_n = col.tris if col else 0
        print(
            f"LOD{level} masonry {stone.tris} windows {glass.tris} lamps {lamp.tris} "
            f"sum {total} col {col_n} {mark} cap {cap}"
        )
    return worst


# ---------------------------------------------------------------------------
# Textures
# ---------------------------------------------------------------------------

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
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            dst[x, y] = (
                int((nx / length * 0.5 + 0.5) * 255),
                int((ny / length * 0.5 + 0.5) * 255),
                int((nz / length * 0.5 + 0.5) * 255),
            )
    return out.resize((w, h), Image.BILINEAR)


def _paint_words(draw, draw_h, region, size, text):
    x0, y0, x1, y1 = _region_pixels(region, size)
    rows = 7
    cols = 5
    glyphs = [FONT[ch] for ch in text]
    gap = 1
    units = len(glyphs) * cols + (len(glyphs) - 1) * gap
    scale = max(1, min((x1 - x0 - 16) // units, (y1 - y0 - 12) // rows))
    block_w = units * scale
    block_h = rows * scale
    ox = x0 + (x1 - x0 - block_w) // 2
    oy = y0 + (y1 - y0 - block_h) // 2
    ink = (36, 28, 24)
    cursor = 0
    for glyph in glyphs:
        for r in range(rows):
            for c in range(cols):
                if glyph[r][c] == "1":
                    px = ox + (cursor + c) * scale
                    py = oy + r * scale
                    draw.rectangle([px, py, px + scale - 1, py + scale - 1], fill=ink)
                    draw_h.rectangle([px, py, px + scale - 1, py + scale - 1], fill=210)
        cursor += cols + gap


def generate_textures(folder):
    from PIL import Image, ImageDraw, ImageFilter

    os.makedirs(folder, exist_ok=True)
    size = 2048
    base = Image.new("RGB", (size, size), (0, 0, 0))
    height = Image.new("L", (size, size), 128)
    orm = Image.new("RGB", (size, size), (255, 140, 0))
    draw_b = ImageDraw.Draw(base)
    draw_h = ImageDraw.Draw(height)
    draw_o = ImageDraw.Draw(orm)
    paints = {
        LIM: ((186, 178, 166), 150, (255, 118, 8)),
        GRN: ((168, 132, 124), 146, (250, 78, 18)),
        BRK: ((178, 154, 128), 132, (255, 168, 0)),
        TC: ((62, 96, 82), 120, (255, 150, 12)),
        ALU: ((186, 190, 194), 168, (255, 48, 230)),
        RF: ((78, 76, 74), 110, (240, 188, 0)),
        DK: ((46, 44, 42), 80, (210, 200, 0)),
        COP: ((206, 198, 186), 170, (255, 108, 6)),
        ORN: ((176, 168, 156), 140, (255, 100, 20)),
        CLK: ((214, 204, 188), 160, (255, 90, 30)),
        SUN: ((214, 186, 120), 156, (255, 90, 30)),
        SGN: ((168, 142, 116), 124, (255, 155, 0)),
    }
    for region, (color, hval, orm_col) in paints.items():
        x0, y0, x1, y1 = _region_pixels(region, size)
        draw_b.rectangle([x0, y0, x1 - 1, y1 - 1], fill=color)
        draw_h.rectangle([x0, y0, x1 - 1, y1 - 1], fill=hval)
        draw_o.rectangle([x0, y0, x1 - 1, y1 - 1], fill=orm_col)

    rng = random.Random(1935)
    noise = Image.new("L", (size // 8, size // 8))
    px = noise.load()
    for y in range(noise.size[1]):
        for x in range(noise.size[0]):
            px[x, y] = rng.randrange(256)
    noise = noise.resize((size, size), Image.BILINEAR)
    base = Image.blend(base, Image.merge("RGB", (noise, noise, noise)), 0.05)
    draw_b = ImageDraw.Draw(base)
    draw_h = ImageDraw.Draw(height)

    # Limestone ashlar and granite speckle.
    x0, y0, x1, y1 = _region_pixels(LIM, size)
    y = y0 + 8
    row = 0
    while y < y1:
        draw_h.line([(x0, y), (x1 - 1, y)], fill=70, width=2)
        draw_b.line([(x0, y), (x1 - 1, y)], fill=(150, 144, 134), width=2)
        x = x0 + (28 if row % 2 else 8)
        while x < x1:
            draw_h.line([(x, y), (x, min(y1 - 1, y + 36))], fill=80, width=2)
            x += 92
        y += 40
        row += 1
    x0, y0, x1, y1 = _region_pixels(GRN, size)
    for _ in range(1800):
        x = rng.randrange(x0, x1)
        y = rng.randrange(y0, y1)
        tone = rng.choice([(150, 112, 108), (186, 154, 146), (120, 90, 88)])
        draw_b.point((x, y), fill=tone)

    # Running-bond brick. A 5.5 m tile of this region is about a real course.
    x0, y0, x1, y1 = _region_pixels(BRK, size)
    course = 0
    y = y0
    while y < y1 - 2:
        draw_b.line([(x0, y), (x1 - 1, y)], fill=(128, 108, 90), width=2)
        draw_h.line([(x0, y), (x1 - 1, y)], fill=60, width=2)
        x = x0 + (10 if course % 2 else 0)
        while x < x1:
            draw_b.line([(x, y), (x, min(y1 - 1, y + 14))], fill=(128, 108, 90), width=1)
            x += 28
        y += 16
        course += 1

    # Terra cotta slats.
    x0, y0, x1, y1 = _region_pixels(TC, size)
    y = y0 + 4
    while y < y1:
        draw_h.line([(x0 + 4, y), (x1 - 5, y)], fill=40, width=3)
        draw_b.line([(x0 + 4, y), (x1 - 5, y)], fill=(40, 70, 60), width=2)
        y += 10

    # Greek key along the ornament band.
    x0, y0, x1, y1 = _region_pixels(ORN, size)
    mid = (y0 + y1) // 2
    x = x0 + 6
    while x < x1 - 20:
        draw_b.rectangle([x, mid - 18, x + 16, mid + 18], outline=(92, 78, 64), width=4)
        draw_b.rectangle([x + 8, mid - 8, x + 28, mid + 6], outline=(92, 78, 64), width=4)
        x += 32

    _paint_words(draw_b, draw_h, SGN, size, "NEWARK PENN STATION")

    # Clock on the south pediment, sun on the north. Original dials, not tracings.
    x0, y0, x1, y1 = _region_pixels(CLK, size)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    rad = min(x1 - x0, y1 - y0) // 2 - 6
    draw_b.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(236, 224, 204), outline=(58, 50, 44), width=5)
    for i in range(12):
        a = math.radians(i * 30 - 90)
        draw_b.line(
            [
                (cx + int(math.cos(a) * (rad - 12)), cy + int(math.sin(a) * (rad - 12))),
                (cx + int(math.cos(a) * (rad - 3)), cy + int(math.sin(a) * (rad - 3))),
            ],
            fill=(48, 42, 38),
            width=3,
        )
    draw_b.line([(cx, cy), (cx, cy - int(rad * 0.46))], fill=(40, 36, 32), width=4)
    draw_b.line([(cx, cy), (cx + int(rad * 0.30), cy)], fill=(40, 36, 32), width=3)
    x0, y0, x1, y1 = _region_pixels(SUN, size)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    rad = min(x1 - x0, y1 - y0) // 2 - 6
    draw_b.ellipse([cx - rad // 2, cy - rad // 2, cx + rad // 2, cy + rad // 2], fill=(232, 196, 110), outline=(90, 64, 36), width=4)
    for i in range(12):
        a = math.radians(i * 30)
        draw_b.line(
            [
                (cx + int(math.cos(a) * (rad * 0.42)), cy + int(math.sin(a) * (rad * 0.42))),
                (cx + int(math.cos(a) * (rad - 2)), cy + int(math.sin(a) * (rad - 2))),
            ],
            fill=(120, 78, 40),
            width=4,
        )

    height = height.filter(ImageFilter.SMOOTH_MORE)
    normal = _normal_from_height(height)

    gsize = 1024
    glass = Image.new("RGB", (gsize, gsize), (18, 28, 36))
    gd = ImageDraw.Draw(glass)
    # Single pane, triple window, door, oculus, marble light.
    regions = (
        (W_PANE, (22, 34, 44), (186, 132, 68)),
        (W_TRIPLE, (22, 34, 44), (176, 122, 62)),
        (W_DOOR, (18, 28, 36), (160, 108, 58)),
        (W_MARB, (168, 148, 112), (124, 102, 74)),
    )
    for region, frame, glow in regions:
        x0, y0, x1, y1 = _region_pixels(region, gsize)
        gd.rectangle([x0, y0, x1 - 1, y1 - 1], fill=frame)
        m = max(8, (x1 - x0) // 7)
        gd.rectangle([x0 + m, y0 + m, x1 - m, y1 - m], fill=glow)
    # Mullions on the triple tile.
    x0, y0, x1, y1 = _region_pixels(W_TRIPLE, gsize)
    for t in (1 / 3, 2 / 3):
        x = int(x0 + (x1 - x0) * t)
        gd.line([(x, y0 + 8), (x, y1 - 8)], fill=(40, 48, 54), width=8)
    gd.line([(x0 + 8, (y0 + y1) // 2), (x1 - 8, (y0 + y1) // 2)], fill=(40, 48, 54), width=6)
    # Oculus.
    x0, y0, x1, y1 = _region_pixels(W_OCU, gsize)
    cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
    rad = min(x1 - x0, y1 - y0) // 2 - 4
    gd.ellipse([cx - rad, cy - rad, cx + rad, cy + rad], fill=(210, 176, 110), outline=(36, 44, 50), width=8)
    gd.line([(cx - rad + 8, cy), (cx + rad - 8, cy)], fill=(36, 44, 50), width=5)
    gd.line([(cx, cy - rad + 8), (cx, cy + rad - 8)], fill=(36, 44, 50), width=5)

    base.save(os.path.join(folder, "main-basecolor.png"), "PNG", optimize=True)
    normal.save(os.path.join(folder, "main-normal.png"), "PNG", optimize=True)
    orm.save(os.path.join(folder, "main-orm.png"), "PNG", optimize=True)
    glass.save(os.path.join(folder, "windows-basecolor.png"), "PNG", optimize=True)
    print("textures", folder)


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
    win_mat = make_window_material(tex)
    lamp_mat = make_lamp_material()

    repo = os.path.abspath(os.path.join(root, "..", "..", "..", ".."))
    public = os.path.join(repo, "public", "landmarks", "newark", SLUG)
    os.makedirs(public, exist_ok=True)

    roots = []
    stats = []
    for level in (0, 1, 2):
        stone, glass, lamp, col = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        body = acc_object(f"masonry-lod{level}", stone, main_mat)
        wins = acc_object(f"windows-lod{level}", glass, win_mat)
        body.parent = parent
        wins.parent = parent
        if lamp.tris:
            lamps = acc_object(f"lamps-lod{level}", lamp, lamp_mat)
            lamps.parent = parent
        if col is not None:
            col_obj = acc_object(f"{SLUG}_COL", col, None)
            col_obj.parent = parent
        roots.append(parent)
        stats.append((level, stone.tris, glass.tris, lamp.tris, col.tris if col else 0))
        print(
            f"LOD{level} tris {stone.tris + glass.tris + lamp.tris} "
            f"(masonry {stone.tris} windows {glass.tris} lamps {lamp.tris} col {col.tris if col else 0})"
        )

    for img in list(bpy.data.images):
        if img.name in ("Render Result", "Viewer Node"):
            bpy.data.images.remove(img)

    blend_path = os.path.join(root, f"{SLUG}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile(compress=True)
    print("blend", blend_path, os.path.getsize(blend_path))

    raw = "/tmp/newark-penn-raw.glb"
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
        use_selection=False,
    )
    print("raw", raw, os.path.getsize(raw))

    shots = os.environ.get("PENN_SHOTS")
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
    image.filepath = "//textures/windows-basecolor.png"
    tex_node = nodes.new("ShaderNodeTexImage")
    tex_node.image = image
    links.new(tex_node.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex_node.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.45
    bsdf.inputs["Roughness"].default_value = 0.28
    bsdf.inputs["Metallic"].default_value = 0.0
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
    bsdf.inputs["Base Color"].default_value = (0.16, 0.13, 0.09, 1)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.78, 0.42, 1)
    bsdf.inputs["Emission Strength"].default_value = 1.5
    bsdf.inputs["Roughness"].default_value = 0.35
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
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 24

    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.66, 0.82, 1)
    bg.inputs[1].default_value = 0.7

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = 0.4
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.9, 0.15, -0.6)

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 6000
    fill_data.size = 50
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 32
    cam_data.clip_start = 0.3
    cam_data.clip_end = 4000
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground = bpy.data.meshes.new("ground")
    ground.from_pydata(
        [(-420, -280, -0.04), (420, -280, -0.04), (420, 280, -0.04), (-420, 280, -0.04)],
        [],
        [(0, 1, 2, 3)],
    )
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.22, 0.23, 0.22, 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.88
    gobj = bpy.data.objects.new("ground", ground)
    gobj.data.materials.append(gmat)
    scene.collection.objects.link(gobj)

    def show(level):
        for i, root in enumerate(roots):
            _hide_tree(root, i != level)

    hx = MX(MID_ALONG)
    hy = MY(HW)
    house = (hx, hy - 8.0, 9.0)
    shed = (MX((VS + VN) * 0.5), MY((HE + VE) * 0.5), 8.0)
    show(0)
    _look_at(fill, (hx - 30, hy + 20, 55), house)
    shots = [
        ("front", (hx, hy + 125, 20), (hx, hy - 8, 10)),
        ("side", (MX(VS) - 15, hy + 70, 28), (hx - 20, MY(HE), 9)),
        ("back", (shed[0] + 10, MY(VE) - 140, 34), (shed[0], shed[1], 9)),
        ("three-quarter", (hx + 62, hy + 100, 22), (hx + 4, hy - 6, 11)),
    ]
    for name, loc, tgt in shots:
        _look_at(cam, loc, tgt)
        scene.render.filepath = os.path.join(folder, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("shot", name)

    bg.inputs[0].default_value = (0.015, 0.02, 0.04, 1)
    bg.inputs[1].default_value = 0.35
    sun_data.energy = 0.08
    fill_data.energy = 800
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        if mat.name not in (WIN_MAT, LAMP_MAT):
            continue
        strength = 6.5 if mat.name == WIN_MAT else 12.0
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Emission Strength"].default_value = strength
    _look_at(cam, (hx + 50, hy + 95, 16), (hx + 4, hy - 4, 10))
    scene.render.filepath = os.path.join(folder, "night.png")
    bpy.ops.render.render(write_still=True)
    print("shot night")
    for mat in bpy.data.materials:
        if not mat.use_nodes or mat.name not in (WIN_MAT, LAMP_MAT):
            continue
        strength = 0.45 if mat.name == WIN_MAT else 1.5
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Emission Strength"].default_value = strength
    sun_data.energy = 3.4
    bg.inputs[0].default_value = (0.62, 0.68, 0.74, 1)
    bg.inputs[1].default_value = 0.85

    show(0)
    body = None
    for child in roots[0].children:
        if child.name == "masonry-lod0":
            body = child
    if body is not None:
        mod = body.modifiers.new("wire", "WIREFRAME")
        mod.thickness = 0.06
        mod.use_replace = True
        _look_at(cam, (hx + 42, hy + 58, 18), (hx, hy - 4, 10))
        scene.render.filepath = os.path.join(folder, "wire-lod0.png")
        bpy.ops.render.render(write_still=True)
        body.modifiers.remove(mod)
        print("shot wire")

    gobj.hide_render = True
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 210
    # Houses are 92 m wide. Shift each LOD so the facades sit side by side
    # and the long sheds fall outside the frame.
    offsets = (-118, 0, 118)
    for root, dx in zip(roots, offsets):
        _hide_tree(root, False)
        root.location.x = dx
    _look_at(cam, (hx, hy + 160, 11), (hx, hy - 4, 9))
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 520
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
