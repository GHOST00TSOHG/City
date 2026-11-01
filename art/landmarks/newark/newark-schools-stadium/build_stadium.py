#!/usr/bin/env python3
"""Exterior of Newark Schools Stadium, 450 Bloomfield Avenue.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
The Bloomfield Avenue front (arch wall and clock tower) faces Blender +Y.

    python3 build_stadium.py            # write textures/*.png
    python3 build_stadium.py --counts   # triangle counts, no Blender
    blender -b --factory-startup --python build_stadium.py

Placement is the area centroid of OSM way 446152545. headingDeg 344.7 is the
outward normal of the north boundary (way vertices 1 -> 2), the Bloomfield
Avenue side, rounded to 0.1 degree. The mesh is rotated so that direction is
+Y. Real heading stays in manifest.json.

Measured from OSM (ODbL), not from a survey drawing:
- stadium polygon, football pitch, running-track ring, two bleacher polygons
- ticket building at 450 Bloomfield (shop=ticket)
- support building south of the bowl
- two baseball pitches

Published dimensions used as stated, with the guesses labelled in refs.md:
- 30 ft arch crowns (the 2009 construction description; EI Associates confirms
  the built arched front). Semicircles spring from a 0.55 m plinth because a
  separate pier height was not published.
- 400 m track, World Athletics shape (84.39 m straights, 36.50 m radius to
  the running line), aligned to the football pitch. Eight 1.22 m lanes.
- Metal stands fill the OSM bleacher footprints. Rise 0.34 m.
- Clock tower shaft 15.2 m plus a 1.7 m roof on the ticket footprint. The
  height is not tagged and was not published; it is set so the tower clears
  the 9.14 m arches.
- Floodlight masts 24 m. No mast height is in OSM; 24 m is a typical
  high-school sports pole so the night material has somewhere to sit.

No Google imagery. No logos, school names, or sponsor marks. No paid add-ons.
Run with --factory-startup.
"""

from __future__ import annotations

import json
import math
import os
import sys

SLUG = "newark-schools-stadium"
MAIN_MAT = f"{SLUG}-main"
WIN_MAT = "emissive-windows"
LAMP_MAT = "emissive-lamp"
HEADING_DEG = 344.7

# OSM ways, lat/lon, rings not closed. © OpenStreetMap contributors, ODbL.
STADIUM = [
    (40.76915250, -74.18587570),
    (40.77107030, -74.18487710),
    (40.77127750, -74.18387410),
    (40.77043660, -74.18325820),
    (40.77046160, -74.18334210),
    (40.76868190, -74.18429760),
]
PITCH = [
    (40.76974070, -74.18491500),
    (40.77066480, -74.18443440),
    (40.77047930, -74.18383360),
    (40.76955640, -74.18431420),
]
BLEACHERS = [
    [
        (40.77007270, -74.18537190),
        (40.77070040, -74.18503930),
        (40.77068420, -74.18498700),
        (40.77067300, -74.18498700),
        (40.77061920, -74.18483010),
        (40.76996400, -74.18516270),
        (40.77000160, -74.18528340),
        (40.77003920, -74.18526330),
    ],
    [
        (40.76962180, -74.18396370),
        (40.77025550, -74.18363380),
        (40.77021900, -74.18351710),
        (40.76958620, -74.18384170),
    ],
]
TICKET = [
    (40.77118190, -74.18402700),
    (40.77116000, -74.18395730),
    (40.77110510, -74.18398390),
    (40.77112830, -74.18405410),
]
SUPPORT = [
    (40.76926500, -74.18400690),
    (40.76944950, -74.18391730),
    (40.76950020, -74.18409940),
    (40.76943830, -74.18412950),
    (40.76945170, -74.18417730),
    (40.76935940, -74.18422210),
    (40.76934630, -74.18417480),
    (40.76931590, -74.18418950),
]
def _enu(lat, lon, lat0, lon0):
    east = (lon - lon0) * 111320.0 * math.cos(math.radians(lat0))
    north = (lat - lat0) * 111320.0
    return east, north


def _centroid_ll(ring):
    lat0, lon0 = ring[0]
    pts = [_enu(lat, lon, lat0, lon0) for lat, lon in ring]
    area = 0.0
    cx = 0.0
    cy = 0.0
    n = len(pts)
    for i in range(n):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % n]
        cross = x1 * y2 - x2 * y1
        area += cross
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    area *= 0.5
    cx /= 6.0 * area
    cy /= 6.0 * area
    lat = lat0 + cy / 111320.0
    lon = lon0 + cx / (111320.0 * math.cos(math.radians(lat0)))
    return lat, lon


LAT, LON = _centroid_ll(STADIUM)
_H = math.radians(HEADING_DEG)
_COS = math.cos(_H)
_SIN = math.sin(_H)


def to_xy(lat, lon):
    east, north = _enu(lat, lon, LAT, LON)
    x = east * _COS - north * _SIN
    y = east * _SIN + north * _COS
    return (x, y)


def ring(latlons):
    return [to_xy(lat, lon) for lat, lon in latlons]


# Baseball outlines, OSM ways 446200042 and 446200043. Rings are not closed.
BASEBALL_LL = [
    [
        (40.76917950, -74.18571890),
        (40.76967770, -74.18544930),
        (40.76959370, -74.18525210),
        (40.76943970, -74.18507960),
        (40.76930320, -74.18500410),
        (40.76923430, -74.18499180),
        (40.76911300, -74.18500250),
        (40.76897530, -74.18504260),
    ],
    [
        (40.76897530, -74.18504260),
        (40.76910710, -74.18492710),
        (40.76923780, -74.18476220),
        (40.76930550, -74.18453730),
        (40.76931480, -74.18429700),
        (40.76927520, -74.18410750),
        (40.76877230, -74.18436940),
    ],
]

# Atlas rectangles (u, v, w, h). v is the bottom of the region.
FIELD = (0.00, 0.00, 0.50, 0.25)
TURF = (0.00, 0.25, 0.25, 0.25)
TRACK = (0.25, 0.25, 0.25, 0.25)
ASPH = (0.50, 0.00, 0.25, 0.25)
DIRT = (0.75, 0.00, 0.25, 0.25)
YELLOW = (0.50, 0.25, 0.25, 0.25)
DARK = (0.75, 0.25, 0.25, 0.25)
STONE = (0.00, 0.50, 0.25, 0.25)
CONC = (0.25, 0.50, 0.25, 0.25)
METAL = (0.50, 0.50, 0.25, 0.25)
STRUCT = (0.75, 0.50, 0.25, 0.25)
ROOF = (0.00, 0.75, 0.25, 0.25)
CLOCK = (0.25, 0.75, 0.25, 0.25)

SIZE = 2048
REG_LEN = 109.728  # 120 yards, end line to end line
REG_WID = 48.768  # 160 feet
GOAL_HALF = REG_LEN * 0.5
INNER_R = 36.20
LANE_W = 1.22
LANES = 8
OUTER_R = INNER_R + LANES * LANE_W
STRAIGHT = 84.39
ARCH_CROWN = 9.14  # 30 ft
ARCH_PLINTH = 0.55
TOWER_SHAFT = 15.2
TOWER_ROOF = 1.7
POLE_H = 24.0


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
    length = vlen(a)
    if length < 1e-12:
        return (0.0, 0.0, 1.0)
    return (a[0] / length, a[1] / length, a[2] / length)


def add2(a, b):
    return (a[0] + b[0], a[1] + b[1])


def sub2(a, b):
    return (a[0] - b[0], a[1] - b[1])


def scale2(a, s):
    return (a[0] * s, a[1] * s)


def dot2(a, b):
    return a[0] * b[0] + a[1] * b[1]


def len2(a):
    return math.hypot(a[0], a[1])


def norm2(a):
    length = len2(a)
    if length < 1e-12:
        return (1.0, 0.0)
    return (a[0] / length, a[1] / length)


def hypot2(a):
    return math.hypot(a[0], a[1])


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

    def merge(self, other):
        base = len(self.V)
        self.V.extend(other.V)
        self.UV.extend(other.UV)
        for a, b, c in other.F:
            self.F.append((a + base, b + base, c + base))
        return self

    @property
    def tris(self):
        return len(self.F)


def _normal(p0, p1, p2):
    cr = vcross(vsub(p1, p0), vsub(p2, p0))
    length = vlen(cr)
    if length < 1e-10:
        return None
    return (cr[0] / length, cr[1] / length, cr[2] / length)


def add_quad_uv(acc, p0, p1, p2, p3, uv0, uv1, uv2, uv3, hint):
    normal = _normal(p0, p1, p2)
    if normal is None:
        normal = _normal(p0, p2, p3)
    if normal is None:
        return
    if vdot(normal, hint) < 0:
        p1, p3 = p3, p1
        uv1, uv3 = uv3, uv1
    ids = [
        acc.add(p, uv)
        for p, uv in ((p0, uv0), (p1, uv1), (p2, uv2), (p3, uv3))
    ]
    acc.tri(ids[0], ids[1], ids[2])
    acc.tri(ids[0], ids[2], ids[3])


def region_uvs(region):
    u, v, w, h = region
    return ((u, v), (u + w, v), (u + w, v + h), (u, v + h))


def add_quad(acc, p0, p1, p2, p3, region, hint):
    uvs = region_uvs(region)
    add_quad_uv(acc, p0, p1, p2, p3, uvs[0], uvs[1], uvs[2], uvs[3], hint)


def add_tri(acc, p0, p1, p2, region, hint):
    normal = _normal(p0, p1, p2)
    if normal is None:
        return
    u, v, w, h = region
    uvs = ((u, v), (u + w, v), (u + w * 0.5, v + h))
    if vdot(normal, hint) < 0:
        p1, p2 = p2, p1
        uvs = (uvs[0], uvs[2], uvs[1])
    ids = [acc.add(p, uv) for p, uv in zip((p0, p1, p2), uvs)]
    acc.tri(ids[0], ids[1], ids[2])


def add_box_axes(acc, origin, ax, ay, az, region):
    def P(a, b, c):
        return (
            origin[0] + a * ax[0] + b * ay[0] + c * az[0],
            origin[1] + a * ax[1] + b * ay[1] + c * az[1],
            origin[2] + a * ax[2] + b * ay[2] + c * az[2],
        )

    add_quad(acc, P(0, 0, 0), P(0, 1, 0), P(0, 1, 1), P(0, 0, 1), region, vscale(ax, -1))
    add_quad(acc, P(1, 0, 0), P(1, 0, 1), P(1, 1, 1), P(1, 1, 0), region, ax)
    add_quad(acc, P(0, 0, 0), P(0, 0, 1), P(1, 0, 1), P(1, 0, 0), region, vscale(ay, -1))
    add_quad(acc, P(0, 1, 0), P(1, 1, 0), P(1, 1, 1), P(0, 1, 1), region, ay)
    add_quad(acc, P(0, 0, 0), P(1, 0, 0), P(1, 1, 0), P(0, 1, 0), region, vscale(az, -1))
    add_quad(acc, P(0, 0, 1), P(0, 1, 1), P(1, 1, 1), P(1, 0, 1), region, az)


def add_cylinder(acc, base, up, radius, height, sides, region):
    up_n = vnorm(up)
    tmp = (1.0, 0.0, 0.0) if abs(up_n[0]) < 0.9 else (0.0, 1.0, 0.0)
    bx = vnorm(vcross(up_n, tmp))
    by = vcross(up_n, bx)
    top = vadd(base, vscale(up_n, height))
    ring0 = []
    ring1 = []
    for i in range(sides):
        ang = 2.0 * math.pi * i / sides
        off = vadd(vscale(bx, radius * math.cos(ang)), vscale(by, radius * math.sin(ang)))
        ring0.append(vadd(base, off))
        ring1.append(vadd(top, off))
    for i in range(sides):
        j = (i + 1) % sides
        hint = vsub(ring0[i], base)
        add_quad(acc, ring0[i], ring0[j], ring1[j], ring1[i], region, hint)


def signed_area(pts):
    area = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        area += x1 * y2 - x2 * y1
    return area * 0.5


def centroid2(pts):
    area = signed_area(pts)
    if abs(area) < 1e-8:
        sx = sum(p[0] for p in pts) / len(pts)
        sy = sum(p[1] for p in pts) / len(pts)
        return (sx, sy)
    cx = 0.0
    cy = 0.0
    for i in range(len(pts)):
        x1, y1 = pts[i]
        x2, y2 = pts[(i + 1) % len(pts)]
        cross = x1 * y2 - x2 * y1
        cx += (x1 + x2) * cross
        cy += (y1 + y2) * cross
    cx /= 6.0 * area
    cy /= 6.0 * area
    return (cx, cy)


def point_in_poly(p, pts):
    x, y = p
    inside = False
    j = len(pts) - 1
    for i in range(len(pts)):
        xi, yi = pts[i]
        xj, yj = pts[j]
        if (yi > y) != (yj > y):
            denom = (yj - yi) or 1e-12
            if x < (xj - xi) * (y - yi) / denom + xi:
                inside = not inside
        j = i
    return inside


def dist_point_seg(p, a, b):
    ab = sub2(b, a)
    lab = dot2(ab, ab)
    if lab < 1e-12:
        return hypot2(sub2(p, a))
    t = max(0.0, min(1.0, dot2(sub2(p, a), ab) / lab))
    proj = add2(a, scale2(ab, t))
    return hypot2(sub2(p, proj))


def near_poly(p, pts, pad):
    if point_in_poly(p, pts):
        return True
    for i in range(len(pts)):
        if dist_point_seg(p, pts[i], pts[(i + 1) % len(pts)]) < pad:
            return True
    return False


def extrude(acc, pts, z0, z1, wall, roof):
    poly = list(pts)
    if signed_area(poly) < 0:
        poly = list(reversed(poly))
    n = len(poly)
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        dx, dy = b[0] - a[0], b[1] - a[1]
        outward = norm2((dy, -dx))
        hint = (outward[0], outward[1], 0.0)
        add_quad(
            acc,
            (a[0], a[1], z0),
            (b[0], b[1], z0),
            (b[0], b[1], z1),
            (a[0], a[1], z1),
            wall,
            hint,
        )
    c = centroid2(poly)
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        add_tri(acc, (c[0], c[1], z1), (a[0], a[1], z1), (b[0], b[1], z1), roof, (0, 0, 1))


def window_band(windows, pts, z0, z1, shrink):
    poly = list(pts)
    if signed_area(poly) < 0:
        poly = list(reversed(poly))
    for i in range(len(poly)):
        a = poly[i]
        b = poly[(i + 1) % len(poly)]
        edge = sub2(b, a)
        length = len2(edge)
        if length < 6.0:
            continue
        tangent = norm2(edge)
        outward = norm2((edge[1], -edge[0]))
        a2 = add2(a, scale2(tangent, shrink))
        b2 = add2(b, scale2(tangent, -shrink))
        if len2(sub2(b2, a2)) < 1.5:
            continue
        proud = 0.04
        a2 = add2(a2, scale2(outward, proud))
        b2 = add2(b2, scale2(outward, proud))
        hint = (outward[0], outward[1], 0.0)
        add_quad(
            windows,
            (a2[0], a2[1], z0),
            (b2[0], b2[1], z0),
            (b2[0], b2[1], z1),
            (a2[0], a2[1], z1),
            (0, 0, 1, 1),
            hint,
        )


def fan(acc, pts, z, region):
    c = centroid2(pts)
    for i in range(len(pts)):
        a = pts[i]
        b = pts[(i + 1) % len(pts)]
        add_tri(acc, (c[0], c[1], z), (a[0], a[1], z), (b[0], b[1], z), region, (0, 0, 1))


def oval_points(straight, radius, cseg, sseg):
    hs = straight * 0.5
    pts = []
    for i in range(sseg):
        t = i / sseg
        pts.append((hs - t * straight, -radius))
    for i in range(1, cseg + 1):
        ang = -math.pi / 2 - (i / cseg) * math.pi
        pts.append((-hs + radius * math.cos(ang), radius * math.sin(ang)))
    for i in range(1, sseg + 1):
        t = i / sseg
        pts.append((-hs + t * straight, radius))
    for i in range(1, cseg):
        ang = math.pi / 2 - (i / cseg) * math.pi
        pts.append((hs + radius * math.cos(ang), radius * math.sin(ang)))
    return pts


def field_frame(pitch_xy):
    p0, p1, p2, p3 = pitch_xy
    long_axis = norm2(sub2(p1, p0))
    short = sub2(p3, p0)
    short = sub2(short, scale2(long_axis, dot2(short, long_axis)))
    short_axis = norm2(short)
    center = (
        (p0[0] + p1[0] + p2[0] + p3[0]) * 0.25,
        (p0[1] + p1[1] + p2[1] + p3[1]) * 0.25,
    )
    return center, long_axis, short_axis


def field_to_world(center, long_axis, short_axis, lx, ly, z):
    return (
        center[0] + lx * long_axis[0] + ly * short_axis[0],
        center[1] + lx * long_axis[1] + ly * short_axis[1],
        z,
    )


def add_track(acc, center, long_axis, short_axis, level):
    cseg = (16, 8, 4)[level]
    sseg = (4, 2, 1)[level]
    inner = oval_points(STRAIGHT, INNER_R, cseg, sseg)
    outer = oval_points(STRAIGHT, OUTER_R, cseg, sseg)
    n = len(inner)
    u0, v0, du, dv = TRACK

    def uv(i, side):
        u = (i % n) / n
        if i == n:  # closing sample
            u = 1.0
        v = 0.0 if side == 0 else 1.0
        return (u0 + u * du, v0 + v * dv)

    def world(local, z):
        return field_to_world(center, long_axis, short_axis, local[0], local[1], z)

    z = 0.08
    for i in range(n):
        j = (i + 1) % n
        j_u = i + 1
        add_quad_uv(
            acc,
            world(inner[i], z),
            world(inner[j], z),
            world(outer[j], z),
            world(outer[i], z),
            uv(i, 0),
            uv(j_u, 0),
            uv(j_u, 1),
            uv(i, 1),
            (0, 0, 1),
        )
    # Infield, tucked slightly under the curb.
    turf_r = oval_points(STRAIGHT, INNER_R + 0.15, cseg, sseg)
    c3 = field_to_world(center, long_axis, short_axis, 0, 0, 0.045)
    for i in range(n):
        j = (i + 1) % n
        add_tri(acc, c3, world(turf_r[i], 0.045), world(turf_r[j], 0.045), TURF, (0, 0, 1))
    if level < 2:
        curb_o = oval_points(STRAIGHT, OUTER_R + 0.45, cseg, sseg)
        for i in range(n):
            j = (i + 1) % n
            add_quad(
                acc,
                world(outer[i], 0.08),
                world(outer[j], 0.08),
                world(curb_o[j], 0.16),
                world(curb_o[i], 0.16),
                STRUCT,
                (0, 0, 1),
            )
    return inner, outer


def add_field(acc, pitch_xy, center, long_axis, short_axis):
    p0, p1, p2, p3 = pitch_xy
    z = 0.10
    uvs = region_uvs(FIELD)
    add_quad_uv(
        acc,
        (p0[0], p0[1], z),
        (p1[0], p1[1], z),
        (p2[0], p2[1], z),
        (p3[0], p3[1], z),
        uvs[0],
        uvs[1],
        uvs[2],
        uvs[3],
        (0, 0, 1),
    )
    # Goal posts at the back of each end zone. 18 ft 6 in between the uprights,
    # crossbar at 10 ft, uprights to 30 ft. Generic yellow. No school mark.
    half_w = 5.6388 * 0.5
    for sign in (-1.0, 1.0):
        for side in (-half_w, half_w):
            base = field_to_world(center, long_axis, short_axis, sign * GOAL_HALF, side, 0.1)
            add_cylinder(acc, base, (0, 0, 1), 0.08, 9.14, 6, YELLOW)
        left = field_to_world(center, long_axis, short_axis, sign * GOAL_HALF, -half_w, 3.05)
        axis = (
            short_axis[0] * 5.6388,
            short_axis[1] * 5.6388,
            0.0,
        )
        add_box_axes(acc, (left[0], left[1], 3.05 - 0.06), axis, (long_axis[0] * 0.12, long_axis[1] * 0.12, 0), (0, 0, 0.12), YELLOW)


def stand_frame(pts, field_xy):
    c = centroid2(pts)
    best = 0.0
    axis = (1.0, 0.0)
    for i in range(len(pts)):
        edge = sub2(pts[(i + 1) % len(pts)], pts[i])
        length = len2(edge)
        if length > best:
            best = length
            axis = norm2(edge)
    away = norm2(sub2(c, field_xy))
    perp = (-axis[1], axis[0])
    if dot2(perp, away) < 0:
        perp = (-perp[0], -perp[1])

    def project(ax, pe):
        us = []
        vs = []
        for p in pts:
            d = sub2(p, c)
            us.append(dot2(d, ax))
            vs.append(dot2(d, pe))
        return min(us), max(us), min(vs), max(vs)

    u0, u1, v0, v1 = project(axis, perp)
    if (u1 - u0) < (v1 - v0):
        axis, perp = perp, (-axis[1], axis[0])
        if dot2(perp, away) < 0:
            perp = (-perp[0], -perp[1])
        u0, u1, v0, v1 = project(axis, perp)
    return c, axis, perp, u0, u1, v0, v1


def _xy(c, axis, perp, u, v, z):
    return (c[0] + axis[0] * u + perp[0] * v, c[1] + axis[1] * u + perp[1] * v, z)


def add_stand(main, windows, col, pts, field_xy, level, home):
    c, axis, perp, u0, u1, v0, v1 = stand_frame(pts, field_xy)
    length = u1 - u0
    depth = v1 - v0
    cap = (16, 7, 3)[level]
    rows = max(2, min(cap, int(round(depth / 0.78))))
    tread = depth / rows
    rise = 0.34
    top = rows * rise
    blocks = [(u0, u1)]
    if level == 0 and length > 28:
        gaps = []
        for frac in (0.34, 0.67):
            mid = u0 + length * frac
            gaps.append((mid - 0.65, mid + 0.65))
        blocks = []
        cursor = u0
        for g0, g1 in gaps:
            if g0 > cursor + 2:
                blocks.append((cursor, g0))
            cursor = g1
        if u1 > cursor + 2:
            blocks.append((cursor, u1))
    for bu0, bu1 in blocks:
        along = (axis[0] * (bu1 - bu0), axis[1] * (bu1 - bu0), 0.0)
        across = (perp[0] * tread, perp[1] * tread, 0.0)
        thick = (0.0, 0.0, 0.08)
        for i in range(rows):
            uu = bu0
            vv = v0 + i * tread
            z0 = i * rise
            z1 = z0 + rise
            origin = _xy(c, axis, perp, uu, vv, z1 - 0.08)
            add_box_axes(main, origin, along, across, thick, METAL)
            riser_h = max(0.05, z1 - 0.08 - z0)
            add_quad(
                main,
                _xy(c, axis, perp, bu0, vv, z0),
                _xy(c, axis, perp, bu1, vv, z0),
                _xy(c, axis, perp, bu1, vv, z0 + riser_h),
                _xy(c, axis, perp, bu0, vv, z0 + riser_h),
                STRUCT,
                (-perp[0], -perp[1], 0),
            )
        # Side skirts follow the underside of the steps.
        for uu in (bu0, bu1):
            add_quad(
                main,
                _xy(c, axis, perp, uu, v0, 0.0),
                _xy(c, axis, perp, uu, v1, 0.0),
                _xy(c, axis, perp, uu, v1, top),
                _xy(c, axis, perp, uu, v0, rise),
                STRUCT,
                (axis[0] if uu == bu1 else -axis[0], axis[1] if uu == bu1 else -axis[1], 0),
            )
    add_quad(
        main,
        _xy(c, axis, perp, u0, v1, 0.0),
        _xy(c, axis, perp, u1, v1, 0.0),
        _xy(c, axis, perp, u1, v1, top),
        _xy(c, axis, perp, u0, v1, top),
        STRUCT,
        (perp[0], perp[1], 0),
    )
    if level == 0:
        add_box_axes(
            main,
            _xy(c, axis, perp, u0, v0 - 0.08, top + 0.55),
            (axis[0] * length, axis[1] * length, 0),
            (perp[0] * 0.08, perp[1] * 0.08, 0),
            (0, 0, 0.08),
            STRUCT,
        )
    info = {"top": top, "c": c, "axis": axis, "perp": perp, "u0": u0, "u1": u1, "v0": v0, "v1": v1, "length": length, "depth": depth}
    if home and level < 2 and length > 30:
        pb_len = min(20.0, length * 0.32)
        mid = (u0 + u1) * 0.5
        pu0 = mid - pb_len * 0.5
        pu1 = mid + pb_len * 0.5
        pd = min(4.0, depth * 0.42)
        pv0 = v1 - pd
        pz0 = top - 0.05
        pz1 = pz0 + 2.7
        add_box_axes(
            main,
            _xy(c, axis, perp, pu0, pv0, pz0),
            (axis[0] * pb_len, axis[1] * pb_len, 0),
            (perp[0] * pd, perp[1] * pd, 0),
            (0, 0, pz1 - pz0),
            CONC,
        )
        add_box_axes(
            main,
            _xy(c, axis, perp, pu0 - 0.35, pv0 - 0.7, pz1),
            (axis[0] * (pb_len + 0.7), axis[1] * (pb_len + 0.7), 0),
            (perp[0] * (pd + 0.85), perp[1] * (pd + 0.85), 0),
            (0, 0, 0.18),
            ROOF,
        )
        add_quad(
            windows,
            _xy(c, axis, perp, pu0 + 0.4, pv0 - 0.02, pz0 + 0.35),
            _xy(c, axis, perp, pu1 - 0.4, pv0 - 0.02, pz0 + 0.35),
            _xy(c, axis, perp, pu1 - 0.4, pv0 - 0.02, pz1 - 0.25),
            _xy(c, axis, perp, pu0 + 0.4, pv0 - 0.02, pz1 - 0.25),
            (0, 0, 1, 1),
            (-perp[0], -perp[1], 0),
        )
        # Elevator shaft at the Bloomfield end of the home stand.
        e0 = _xy(c, axis, perp, u0, (v0 + v1) * 0.5, 0)
        e1 = _xy(c, axis, perp, u1, (v0 + v1) * 0.5, 0)
        if e1[1] >= e0[1]:
            eu, sign = u1, 1.0
        else:
            eu, sign = u0, -1.0
        sz = 3.3
        ez = top + 2.6
        ev = v1 - sz
        eu_s = (u1 - 0.4) if sign > 0 else (u0 - sz + 0.4)
        add_box_axes(
            main,
            _xy(c, axis, perp, eu_s, ev, 0.0),
            (axis[0] * sz, axis[1] * sz, 0),
            (perp[0] * sz, perp[1] * sz, 0),
            (0, 0, ez),
            CONC,
        )
        add_quad(
            windows,
            _xy(c, axis, perp, eu_s + 0.4, ev - 0.02, ez - 1.7),
            _xy(c, axis, perp, eu_s + sz - 0.4, ev - 0.02, ez - 1.7),
            _xy(c, axis, perp, eu_s + sz - 0.4, ev - 0.02, ez - 0.35),
            _xy(c, axis, perp, eu_s + 0.4, ev - 0.02, ez - 0.35),
            (0, 0, 1, 1),
            (-perp[0], -perp[1], 0.2),
        )
        info["elevator"] = (eu_s, ev, sz, ez)
    if col is not None:
        add_box_axes(
            col,
            _xy(c, axis, perp, u0, v0, 0.0),
            (axis[0] * length, axis[1] * length, 0),
            (perp[0] * depth, perp[1] * depth, 0),
            (0, 0, max(top, 4.0)),
            (0, 0, 1, 1),
        )
    return info


def fit_arches(run):
    radius = ARCH_CROWN - ARCH_PLINTH
    opening = 2.0 * radius
    n = max(1, int(run // (opening + 1.5)))
    while n > 1:
        pier = (run - n * opening) / (n + 1)
        if pier >= 1.2:
            return n, opening, pier, radius
        n -= 1
    pier = max(0.9, (run - opening) / 2.0)
    return 1, opening, pier, radius


def add_arches(main, lamps, col, a, b, inward, tower_pts, level):
    span = sub2(b, a)
    length = len2(span)
    tangent = norm2(span)
    origin = add2(a, scale2(inward, 0.35))
    thickness = 1.50
    segs = (12, 6, 3)[level]

    def blocked(s):
        p = add2(origin, scale2(tangent, s))
        return near_poly(p, tower_pts, 2.4)

    samples = 240
    ranges = []
    start = None
    for i in range(samples + 1):
        s = length * i / samples
        hit = blocked(s)
        if not hit and start is None:
            start = s
        elif hit and start is not None:
            ranges.append((start, s))
            start = None
    if start is not None:
        ranges.append((start, length))
    if not ranges:
        ranges = [(0.0, length)]
    s0, s1 = max(ranges, key=lambda r: r[1] - r[0])
    # Keep a small margin off the ends of the free run.
    s0 += 0.4
    s1 -= 0.4
    run = s1 - s0
    n, opening, pier, radius = fit_arches(run)
    total = n * opening + (n + 1) * pier
    # Fit exactly.
    scale = run / total
    opening *= scale
    pier *= scale
    radius = opening * 0.5
    spring = ARCH_CROWN - radius
    outward = scale2(inward, -1)

    def C(s, depth, z):
        xy = add2(origin, add2(scale2(tangent, s), scale2(inward, depth)))
        return (xy[0], xy[1], z)

    def facade(s_a, z_a, s_b, z_b, depth, hint):
        add_quad(main, C(s_a, depth, z_a), C(s_b, depth, z_a), C(s_b, depth, z_b), C(s_a, depth, z_b), STONE, hint)

    cursor = s0
    centers = []
    # Leading pier.
    facade(cursor, 0.0, cursor + pier, ARCH_CROWN, 0.0, (*outward, 0))
    facade(cursor, 0.0, cursor + pier, ARCH_CROWN, thickness, (*inward, 0))
    add_quad(
        main,
        C(cursor, 0, 0),
        C(cursor, thickness, 0),
        C(cursor, thickness, ARCH_CROWN),
        C(cursor, 0, ARCH_CROWN),
        STONE,
        (tangent[0] * -1, tangent[1] * -1, 0),
    )
    cursor += pier
    for i in range(n):
        left = cursor
        right = cursor + opening
        mid = (left + right) * 0.5
        centers.append(mid)
        # Spandrel and soffit.
        for k in range(segs):
            t0 = math.pi - k * math.pi / segs
            t1 = math.pi - (k + 1) * math.pi / segs

            def arc(theta, depth):
                return C(mid + math.cos(theta) * radius, depth, spring + math.sin(theta) * radius)

            for depth, hint in ((0.0, (*outward, 0)), (thickness, (*inward, 0))):
                p0 = arc(t0, depth)
                p1 = arc(t1, depth)
                add_quad(
                    main,
                    p0,
                    p1,
                    C(mid + math.cos(t1) * radius, depth, ARCH_CROWN),
                    C(mid + math.cos(t0) * radius, depth, ARCH_CROWN),
                    STONE,
                    hint,
                )
            mid_theta = (t0 + t1) * 0.5
            # From the intrados toward the circle centre, in world space.
            soffit_hint = (
                -math.cos(mid_theta) * tangent[0],
                -math.cos(mid_theta) * tangent[1],
                -math.sin(mid_theta),
            )
            add_quad(main, arc(t0, 0.0), arc(t0, thickness), arc(t1, thickness), arc(t1, 0.0), STONE, soffit_hint)
        # Jambs at the springs.
        for s, hint_s in ((left, -1.0), (right, 1.0)):
            add_quad(
                main,
                C(s, 0.0, 0.0),
                C(s, thickness, 0.0),
                C(s, thickness, spring),
                C(s, 0.0, spring),
                STONE,
                (tangent[0] * hint_s, tangent[1] * hint_s, 0),
            )
        if level == 0:
            add_box_axes(
                main,
                C(mid - 0.28, -0.12, ARCH_CROWN - 0.85),
                (tangent[0] * 0.56, tangent[1] * 0.56, 0),
                (inward[0] * 0.16, inward[1] * 0.16, 0),
                (0, 0, 0.7),
                STONE,
            )
        cursor = right
        facade(cursor, 0.0, cursor + pier, ARCH_CROWN, 0.0, (*outward, 0))
        facade(cursor, 0.0, cursor + pier, ARCH_CROWN, thickness, (*inward, 0))
        # Pier end cap (outer side face of this pier, toward the next opening, added with the next jamb).
        cursor += pier
    add_quad(
        main,
        C(cursor, 0, 0),
        C(cursor, 0, ARCH_CROWN),
        C(cursor, thickness, ARCH_CROWN),
        C(cursor, thickness, 0),
        STONE,
        (tangent[0], tangent[1], 0),
    )
    # Cornice over the arch run.
    add_box_axes(
        main,
        C(s0, -0.28, ARCH_CROWN),
        (tangent[0] * run, tangent[1] * run, 0),
        (inward[0] * (thickness + 0.46), inward[1] * (thickness + 0.46), 0),
        (0, 0, 0.82),
        STONE,
    )
    # Small lamps under the street side of the cornice, one per pier line.
    if level < 2:
        lamp_s = s0 + pier * 0.5
        step = opening + pier
        for _ in range(n + 1):
            add_box_axes(
                lamps,
                C(lamp_s - 0.18, -0.22, ARCH_CROWN - 0.28),
                (tangent[0] * 0.36, tangent[1] * 0.36, 0),
                (inward[0] * 0.18, inward[1] * 0.18, 0),
                (0, 0, 0.16),
                (0, 0, 1, 1),
            )
            lamp_s += step
    if col is not None:
        add_box_axes(
            col,
            C(s0, -0.2, 0.0),
            (tangent[0] * run, tangent[1] * run, 0),
            (inward[0] * (thickness + 0.4), inward[1] * (thickness + 0.4), 0),
            (0, 0, ARCH_CROWN + 0.82),
            (0, 0, 1, 1),
        )
    return {
        "run": run,
        "n": n,
        "opening": opening,
        "pier": pier,
        "s0": s0,
        "origin": origin,
        "tangent": tangent,
        "inward": inward,
        "length": length,
    }


def add_tower(main, windows, col, pts, front, level):
    poly = list(pts)
    if signed_area(poly) < 0:
        poly = list(reversed(poly))
    extrude(main, poly, 0.0, TOWER_SHAFT, STONE, STONE)
    c = centroid2(poly)
    # Pyramid roof.
    peak = (c[0], c[1], TOWER_SHAFT + TOWER_ROOF)
    for i in range(len(poly)):
        a = poly[i]
        b = poly[(i + 1) % len(poly)]
        add_tri(main, (a[0], a[1], TOWER_SHAFT), (b[0], b[1], TOWER_SHAFT), peak, ROOF, (0, 0, 1))
    # Street face: the edge whose outward normal best matches `front`.
    best = None
    for i in range(len(poly)):
        a = poly[i]
        b = poly[(i + 1) % len(poly)]
        edge = sub2(b, a)
        if len2(edge) < 0.4:
            continue
        outward = norm2((edge[1], -edge[0]))
        score = dot2(outward, front)
        if best is None or score > best[0]:
            best = (score, a, b, outward)
    _score, a, b, outward = best
    tangent = norm2(sub2(b, a))
    mid = ((a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5)
    proud = add2(mid, scale2(outward, 0.05))
    half = min(1.15, len2(sub2(b, a)) * 0.28)
    if level < 2:
        add_quad(
            main,
            (proud[0] - tangent[0] * half, proud[1] - tangent[1] * half, 10.15),
            (proud[0] + tangent[0] * half, proud[1] + tangent[1] * half, 10.15),
            (proud[0] + tangent[0] * half, proud[1] + tangent[1] * half, 12.55),
            (proud[0] - tangent[0] * half, proud[1] - tangent[1] * half, 12.55),
            CLOCK,
            (*outward, 0),
        )
    # Door and ticket windows.
    door_w = 1.35
    add_quad(
        main,
        (proud[0] - tangent[0] * door_w * 0.5, proud[1] - tangent[1] * door_w * 0.5, 0.05),
        (proud[0] + tangent[0] * door_w * 0.5, proud[1] + tangent[1] * door_w * 0.5, 0.05),
        (proud[0] + tangent[0] * door_w * 0.5, proud[1] + tangent[1] * door_w * 0.5, 2.4),
        (proud[0] - tangent[0] * door_w * 0.5, proud[1] - tangent[1] * door_w * 0.5, 2.4),
        DARK,
        (*outward, 0),
    )
    win_w = min(2.4, len2(sub2(b, a)) * 0.62)
    add_quad(
        windows,
        (proud[0] - tangent[0] * win_w * 0.5, proud[1] - tangent[1] * win_w * 0.5, 3.15),
        (proud[0] + tangent[0] * win_w * 0.5, proud[1] + tangent[1] * win_w * 0.5, 3.15),
        (proud[0] + tangent[0] * win_w * 0.5, proud[1] + tangent[1] * win_w * 0.5, 4.55),
        (proud[0] - tangent[0] * win_w * 0.5, proud[1] - tangent[1] * win_w * 0.5, 4.55),
        (0, 0, 1, 1),
        (*outward, 0),
    )
    if col is not None:
        xs = [p[0] for p in poly]
        ys = [p[1] for p in poly]
        add_box_axes(
            col,
            (min(xs), min(ys), 0.0),
            (max(xs) - min(xs), 0, 0),
            (0, max(ys) - min(ys), 0),
            (0, 0, TOWER_SHAFT + TOWER_ROOF),
            (0, 0, 1, 1),
        )


def add_support(main, windows, col, pts, level):
    height = 6.4
    extrude(main, pts, 0.0, height, CONC, ROOF)
    if level < 2:
        window_band(windows, pts, 1.6, 3.5, 1.3)
        window_band(windows, pts, 4.15, 5.55, 1.3)
    if col is not None:
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        add_box_axes(
            col,
            (min(xs), min(ys), 0.0),
            (max(xs) - min(xs), 0, 0),
            (0, max(ys) - min(ys), 0),
            (0, 0, height),
            (0, 0, 1, 1),
        )


def add_lights(main, lamps, center, long_axis, short_axis, level):
    sides = (8, 6, 4)[level]
    reach = OUTER_R + 8.0
    hs = STRAIGHT * 0.5 + reach * 0.15
    corners = [
        (hs + 6.0, reach),
        (hs + 6.0, -reach),
        (-(hs + 6.0), reach),
        (-(hs + 6.0), -reach),
    ]
    field_c = field_to_world(center, long_axis, short_axis, 0, 0, 0)
    n_lamps = (8, 4, 2)[level]
    for lx, ly in corners:
        base = field_to_world(center, long_axis, short_axis, lx, ly, 0.0)
        add_cylinder(main, base, (0, 0, 1), 0.42, 1.2, sides, STRUCT)
        add_cylinder(main, (base[0], base[1], 1.2), (0, 0, 1), 0.22, POLE_H - 1.2, sides, STRUCT)
        top = (base[0], base[1], POLE_H)
        to_field = vnorm((field_c[0] - top[0], field_c[1] - top[1], -6.0))
        right = vnorm(vcross((0, 0, 1), to_field))
        up = vcross(to_field, right)
        bar = 0.55 * n_lamps
        add_box_axes(
            main,
            vadd(top, vadd(vscale(right, -bar * 0.5), vscale(up, -0.12))),
            vscale(right, bar),
            vscale(up, 0.24),
            vscale(to_field, 0.35),
            STRUCT,
        )
        for k in range(n_lamps):
            t = (k + 0.5) / n_lamps - 0.5
            lamp_c = vadd(top, vadd(vscale(right, t * bar), vscale(to_field, 0.55)))
            origin = vadd(lamp_c, vadd(vscale(right, -0.22), vadd(vscale(up, -0.16), vscale(to_field, -0.08))))
            add_box_axes(lamps, origin, vscale(right, 0.44), vscale(up, 0.32), vscale(to_field, 0.22), (0, 0, 1, 1))


def add_diamond(acc, pts, level):
    fan(acc, pts, 0.04, TURF)
    if level == 2:
        return
    c = centroid2(pts)
    radius = 11.0
    sides = 14 if level == 0 else 8
    prev = None
    first = None
    for i in range(sides):
        ang = 2 * math.pi * i / sides
        p = (c[0] + radius * math.cos(ang), c[1] + radius * math.sin(ang), 0.055)
        if prev is not None:
            add_tri(acc, (c[0], c[1], 0.055), prev, p, DIRT, (0, 0, 1))
        else:
            first = p
        prev = p
    add_tri(acc, (c[0], c[1], 0.055), prev, first, DIRT, (0, 0, 1))


def add_plaza(acc, a, b, inward):
    depth = 14.0
    z = 0.05
    a2 = add2(a, scale2(inward, 0.8))
    b2 = add2(b, scale2(inward, 0.8))
    a3 = add2(a2, scale2(inward, depth))
    b3 = add2(b2, scale2(inward, depth))
    add_quad(
        acc,
        (a2[0], a2[1], z),
        (b2[0], b2[1], z),
        (b3[0], b3[1], z),
        (a3[0], a3[1], z),
        ASPH,
        (0, 0, 1),
    )


def build(level):
    main = Acc()
    windows = Acc()
    lamps = Acc()
    col = Acc() if level == 0 else None
    pitch_xy = ring(PITCH)
    center, long_axis, short_axis = field_frame(pitch_xy)
    add_track(main, center, long_axis, short_axis, level)
    add_field(main, pitch_xy, center, long_axis, short_axis)
    stands_xy = [ring(b) for b in BLEACHERS]
    areas = [abs(signed_area(p)) for p in stands_xy]
    home_index = max(range(len(areas)), key=lambda i: areas[i])
    stand_info = []
    for i, pts in enumerate(stands_xy):
        stand_info.append(add_stand(main, windows, col, pts, center, level, i == home_index))
    front_a = to_xy(*STADIUM[1])
    front_b = to_xy(*STADIUM[2])
    mid = scale2(add2(front_a, front_b), 0.5)
    inward = norm2(scale2(mid, -1))
    ticket = ring(TICKET)
    arch_info = add_arches(main, lamps, col, front_a, front_b, inward, ticket, level)
    add_plaza(main, front_a, front_b, inward)
    add_tower(main, windows, col, ticket, (0.0, 1.0), level)
    support = ring(SUPPORT)
    add_support(main, windows, col, support, level)
    add_lights(main, lamps, center, long_axis, short_axis, level)
    for diamond in BASEBALL_LL:
        add_diamond(main, ring(diamond), level)
    info = {
        "arch": arch_info,
        "stands": stand_info,
        "field_center": center,
        "front_mid": mid,
        "home": home_index,
        "areas": areas,
    }
    return main, windows, lamps, col, info


# ---------------------------------------------------------------------------
# Textures
# ---------------------------------------------------------------------------

FONT = {
    "0": ["01110", "10001", "10011", "10101", "11001", "10001", "01110"],
    "1": ["00100", "01100", "00100", "00100", "00100", "00100", "01110"],
    "2": ["01110", "10001", "00001", "00110", "01000", "10000", "11111"],
    "3": ["11110", "00001", "00001", "01110", "00001", "00001", "11110"],
    "4": ["00010", "00110", "01010", "10010", "11111", "00010", "00010"],
    "5": ["11111", "10000", "11110", "00001", "00001", "10001", "01110"],
    "6": ["01110", "10000", "11110", "10001", "10001", "10001", "01110"],
    "7": ["11111", "00001", "00010", "00100", "01000", "01000", "01000"],
    "8": ["01110", "10001", "10001", "01110", "10001", "10001", "01110"],
    "9": ["01110", "10001", "10001", "01111", "00001", "00001", "01110"],
}


def _region_box(region, size=SIZE):
    u, v, w, h = region
    left = int(round(u * size))
    width = int(round(w * size))
    height = int(round(h * size))
    top = int(round((1.0 - (v + h)) * size))
    return left, top, width, height


def _paste(atlas, image, region):
    from PIL import Image

    left, top, width, height = _region_box(region)
    if image.size != (width, height):
        image = image.resize((width, height), Image.NEAREST)
    atlas.paste(image, (left, top))


def _draw_digits(draw, text, x, y, scale, fill, flip=False):
    from PIL import Image, ImageDraw

    cols = 5 * len(text) + (len(text) - 1)
    rows = 7
    plate = Image.new("RGBA", (cols, rows), (0, 0, 0, 0))
    pix = plate.load()
    cursor = 0
    for ch in text:
        glyph = FONT[ch]
        for gy, row in enumerate(glyph):
            for gx, bit in enumerate(row):
                if bit == "1":
                    pix[cursor + gx, gy] = fill + (255,)
        cursor += 6
    if flip:
        plate = plate.transpose(Image.ROTATE_180)
    plate = plate.resize((plate.size[0] * scale, plate.size[1] * scale), Image.NEAREST)
    draw._image.paste(plate, (int(x), int(y)), plate)


def _field_image(width, height):
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (width, height), (24, 92, 46))
    draw = ImageDraw.Draw(img)
    # OSM pitch is a little larger than the 120 x 53.3 yd rectangle. Inset the
    # painted field so the yard lines land on the regulation size.
    osm_aspect = 110.56 / 54.70
    # The quad's UV is the OSM rectangle. Use the measured edge lengths.
    pitch_xy = ring(PITCH)
    p0, p1, _p2, p3 = pitch_xy
    osm_len = len2(sub2(p1, p0))
    osm_wid = len2(sub2(p3, p0))
    inset_u = ((osm_len - REG_LEN) * 0.5) / osm_len
    inset_v = ((osm_wid - REG_WID) * 0.5) / osm_wid

    def pt(u, v):
        # u along the length, v across the width. Image y grows down; flip v
        # so the paste (which is not flipped) matches UV v-up after we flip
        # the finished image.
        x = (inset_u + u * (1.0 - 2.0 * inset_u)) * (width - 1)
        y = (1.0 - (inset_v + v * (1.0 - 2.0 * inset_v))) * (height - 1)
        return (x, y)

    def seg(u0, v0, u1, v1, fill, w):
        draw.line([pt(u0, v0), pt(u1, v1)], fill=fill, width=w)

    # End zones, slightly darker. u is 0..1 across 120 yards.
    ez = 10.0 / 120.0
    draw.polygon([pt(0, 0), pt(ez, 0), pt(ez, 1), pt(0, 1)], fill=(18, 74, 38))
    draw.polygon([pt(1 - ez, 0), pt(1, 0), pt(1, 1), pt(1 - ez, 1)], fill=(18, 74, 38))
    white = (236, 236, 230)
    seg(0, 0, 1, 0, white, 3)
    seg(0, 1, 1, 1, white, 3)
    seg(0, 0, 0, 1, white, 3)
    seg(1, 0, 1, 1, white, 3)
    for yard in range(0, 121, 5):
        u = yard / 120.0
        thick = 4 if yard in (0, 10, 50, 110, 120) else 2
        seg(u, 0, u, 1, white, thick)
    # Hashes, in from each sideline.
    for yard in range(10, 111, 5):
        u = yard / 120.0
        seg(u, 0.28, u, 0.34, white, 2)
        seg(u, 0.66, u, 0.72, white, 2)
    for yard in (10, 20, 30, 40, 50):
        u = (10 + yard) / 120.0
        label = str(yard)
        _draw_digits(draw, label, pt(u, 0.78)[0] - 18, pt(u, 0.78)[1] - 16, 3, white, flip=False)
        _draw_digits(draw, label, pt(u, 0.22)[0] - 18, pt(u, 0.22)[1] - 16, 3, white, flip=True)
        u2 = (110 - yard) / 120.0
        if yard != 50:
            _draw_digits(draw, label, pt(u2, 0.78)[0] - 18, pt(u2, 0.78)[1] - 16, 3, white, flip=False)
            _draw_digits(draw, label, pt(u2, 0.22)[0] - 18, pt(u2, 0.22)[1] - 16, 3, white, flip=True)
    # Flip so image row 0 is UV v = 1. region paste uses PIL top = high v,
    # and this image was drawn with pt() already flipping v. Do not flip again.
    _ = osm_aspect
    return img


def _solid(width, height, color, lines=None, line_color=None, gap=16):
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (width, height), color)
    if lines:
        draw = ImageDraw.Draw(img)
        y = gap
        while y < height:
            draw.line([(0, y), (width, y)], fill=line_color, width=1)
            y += gap
    return img


def _track_image(width, height):
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (width, height), (122, 36, 34))
    draw = ImageDraw.Draw(img)
    for i in range(LANES + 1):
        y = int(round(i / LANES * (height - 1)))
        draw.line([(0, y), (width, y)], fill=(236, 236, 230), width=3 if i in (0, LANES) else 2)
    return img


def _clock_image(width, height):
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (width, height), (86, 80, 72))
    draw = ImageDraw.Draw(img)
    m = int(min(width, height) * 0.08)
    draw.ellipse([m, m, width - m, height - m], fill=(232, 224, 204), outline=(40, 36, 32), width=6)
    cx, cy = width // 2, height // 2
    r = int(min(width, height) * 0.36)
    for i in range(12):
        ang = math.radians(i * 30 - 90)
        inner = r * 0.78
        draw.line(
            [(cx + math.cos(ang) * inner, cy + math.sin(ang) * inner), (cx + math.cos(ang) * r, cy + math.sin(ang) * r)],
            fill=(32, 30, 28),
            width=4,
        )
    # Hands at an arbitrary time (about 2:40). Original marks, no numerals.
    draw.line([(cx, cy), (cx + r * 0.45, cy - r * 0.35)], fill=(32, 30, 28), width=6)
    draw.line([(cx, cy), (cx - r * 0.15, cy + r * 0.62)], fill=(32, 30, 28), width=4)
    draw.ellipse([cx - 5, cy - 5, cx + 5, cy + 5], fill=(32, 30, 28))
    return img


def _windows_image(size):
    from PIL import Image, ImageDraw

    img = Image.new("RGB", (size, size), (12, 16, 22))
    draw = ImageDraw.Draw(img)
    panes_x, panes_y = 6, 4
    gap = int(size * 0.035)
    pw = (size - gap * (panes_x + 1)) / panes_x
    ph = (size - gap * (panes_y + 1)) / panes_y
    for j in range(panes_y):
        for i in range(panes_x):
            warm = 214 if (i + j) % 2 == 0 else 186
            col = (255, warm, 132)
            x0 = gap + i * (pw + gap)
            y0 = gap + j * (ph + gap)
            draw.rectangle([x0, y0, x0 + pw, y0 + ph], fill=col)
    return img


def _normal_from_height(height_img):
    from PIL import Image

    w, h = height_img.size
    src = height_img.load()
    out = Image.new("RGB", (w, h))
    dst = out.load()
    for y in range(h):
        y0 = max(0, y - 1)
        y1 = min(h - 1, y + 1)
        for x in range(w):
            x0 = max(0, x - 1)
            x1 = min(w - 1, x + 1)
            dx = (src[x1, y] - src[x0, y]) / 255.0
            dy = (src[x, y0] - src[x, y1]) / 255.0
            nx, ny, nz = -dx * 3.0, -dy * 3.0, 1.0
            length = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            dst[x, y] = (
                int((nx / length * 0.5 + 0.5) * 255),
                int((ny / length * 0.5 + 0.5) * 255),
                int((nz / length * 0.5 + 0.5) * 255),
            )
    return out


def generate_textures(folder):
    from PIL import Image

    os.makedirs(folder, exist_ok=True)
    base = Image.new("RGB", (SIZE, SIZE), (90, 90, 90))
    height = Image.new("L", (SIZE, SIZE), 160)
    orm = Image.new("RGB", (SIZE, SIZE), (255, 180, 0))

    def paint(region, color, rough, metal, ao=245, courses=0, course_color=None):
        left, top, width, height_px = _region_box(region)
        img = _solid(width, height_px, color, lines=bool(courses), line_color=course_color, gap=courses or 16)
        _paste(base, img, region)
        h = Image.new("L", (width, height_px), 170)
        if courses:
            pix = h.load()
            y = courses
            while y < height_px:
                for x in range(width):
                    pix[x, y] = 90
                y += courses
        _paste(height, h, region)
        _paste(orm, Image.new("RGB", (width, height_px), (ao, rough, metal)), region)

    paint(STONE, (96, 88, 76), 108, 6, courses=18, course_color=(78, 72, 64))
    paint(CONC, (118, 120, 116), 140, 0, courses=48, course_color=(104, 106, 102))
    paint(METAL, (176, 180, 184), 78, 232, courses=10, course_color=(150, 154, 160))
    paint(STRUCT, (64, 68, 72), 120, 40)
    paint(ROOF, (48, 52, 56), 130, 20)
    paint(TURF, (24, 92, 46), 214, 0)
    paint(ASPH, (68, 70, 72), 196, 0)
    paint(DIRT, (148, 112, 74), 230, 0)
    paint(YELLOW, (214, 176, 46), 100, 30)
    paint(DARK, (28, 30, 32), 90, 8)
    left, top, width, height_px = _region_box(FIELD)
    _paste(base, _field_image(width, height_px), FIELD)
    _paste(height, Image.new("L", (width, height_px), 175), FIELD)
    _paste(orm, Image.new("RGB", (width, height_px), (250, 214, 0)), FIELD)
    left, top, width, height_px = _region_box(TRACK)
    _paste(base, _track_image(width, height_px), TRACK)
    _paste(height, Image.new("L", (width, height_px), 168), TRACK)
    _paste(orm, Image.new("RGB", (width, height_px), (245, 156, 4)), TRACK)
    left, top, width, height_px = _region_box(CLOCK)
    _paste(base, _clock_image(width, height_px), CLOCK)
    _paste(height, Image.new("L", (width, height_px), 190), CLOCK)
    _paste(orm, Image.new("RGB", (width, height_px), (250, 90, 0)), CLOCK)

    normal = _normal_from_height(height)
    windows = _windows_image(1024)
    base.save(os.path.join(folder, "main-basecolor.png"), "PNG", optimize=True)
    normal.save(os.path.join(folder, "main-normal.png"), "PNG", optimize=True)
    orm.save(os.path.join(folder, "main-orm.png"), "PNG", optimize=True)
    windows.save(os.path.join(folder, "windows-basecolor.png"), "PNG", optimize=True)
    print("textures", folder)


def count_only():
    caps = (50000, 15000, 3000)
    print(f"lat {LAT:.8f} lon {LON:.8f} heading {HEADING_DEG}")
    for level in (0, 1, 2):
        main, windows, lamps, col, info = build(level)
        total = main.tris + windows.tris + lamps.tris
        print(
            f"LOD{level} body {main.tris} windows {windows.tris} lamps {lamps.tris} "
            f"sum {total} col {col.tris if col else 0} arches {info['arch']['n']} "
            f"opening {info['arch']['opening']:.2f} pier {info['arch']['pier']:.2f}"
        )
        for i, stand in enumerate(info["stands"]):
            print(
                f"  stand {i} length {stand['length']:.1f} depth {stand['depth']:.1f} top {stand['top']:.1f}"
            )
        print(f"  front mid {info['front_mid'][0]:.1f} {info['front_mid'][1]:.1f}")
        if total > caps[level]:
            print(f"OVER BUDGET LOD{level}", file=sys.stderr)
            return 1
        if col and col.tris > 500:
            print("OVER COL", col.tris, file=sys.stderr)
            return 1
    return 0


def _gltf_occlusion_group():
    import bpy

    name = "glTF Material Output"
    ng = bpy.data.node_groups.get(name)
    if ng is None:
        ng = bpy.data.node_groups.new(name, "ShaderNodeTree")
        ng.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    return ng


def _img_node(nodes, links, folder, filename, noncolor, x, y):
    import bpy

    image = bpy.data.images.load(os.path.join(folder, filename))
    try:
        image.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
    except TypeError:
        image.colorspace_settings.name = "Non-Colour" if noncolor else "sRGB"
    image.filepath = "//textures/" + filename
    node = nodes.new("ShaderNodeTexImage")
    node.image = image
    node.location = (x, y)
    return node


def make_main_material(folder):
    import bpy

    mat = bpy.data.materials.new(MAIN_MAT)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    out.location = (520, 0)
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (180, 0)
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    base = _img_node(nodes, links, folder, "main-basecolor.png", False, -700, 240)
    orm = _img_node(nodes, links, folder, "main-orm.png", True, -700, -20)
    nor = _img_node(nodes, links, folder, "main-normal.png", True, -700, -280)
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    sep = nodes.new("ShaderNodeSeparateColor")
    sep.location = (-360, -20)
    links.new(orm.outputs["Color"], sep.inputs["Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.location = (-80, -280)
    nmap.inputs["Strength"].default_value = 0.65
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    occ = nodes.new("ShaderNodeGroup")
    occ.node_tree = _gltf_occlusion_group()
    occ.location = (-80, -500)
    links.new(sep.outputs["Red"], occ.inputs["Occlusion"])
    return mat


def make_window_material(folder):
    import bpy

    mat = bpy.data.materials.new(WIN_MAT)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    nodes = nt.nodes
    links = nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    image = bpy.data.images.load(os.path.join(folder, "windows-basecolor.png"))
    image.colorspace_settings.name = "sRGB"
    image.filepath = "//textures/" + "windows-basecolor.png"
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(tex.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.45
    bsdf.inputs["Roughness"].default_value = 0.28
    return mat


def make_lamp_material():
    import bpy

    mat = bpy.data.materials.new(LAMP_MAT)
    mat.use_nodes = True
    mat.use_backface_culling = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (1.0, 0.93, 0.78, 1.0)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.93, 0.78, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 0.45
    bsdf.inputs["Roughness"].default_value = 0.18
    return mat


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


def write_manifest(public, totals):
    manifest = {
        "id": SLUG,
        "name": "Newark Schools Stadium",
        "area": "newark",
        "file": f"{SLUG}.glb",
        "lat": round(LAT, 8),
        "lon": round(LON, 8),
        "headingDeg": HEADING_DEG,
        "scale": 1.0,
        "elevationM": None,
        "lod": {"tris": totals, "switchM": [150, 600]},
        "fictional": False,
        "attribution": [
            {
                "what": "stadium footprint, pitch, track, bleachers, ticket building, support building, baseball fields",
                "source": "https://www.openstreetmap.org/way/446152545",
                "author": "OpenStreetMap contributors",
                "license": "ODbL",
            },
            {
                "what": "two metal bleacher sections, 5,600 seats, 2011 stadium on the 1925 site",
                "source": "https://en.wikipedia.org/wiki/Newark_Schools_Stadium",
                "author": "Wikipedia contributors",
                "license": "CC BY-SA 4.0",
            },
            {
                "what": "30-foot arches along Bloomfield Avenue and a clock tower with the ticket office",
                "source": "https://www.nj.com/sports/njsports/2009/07/construction_of_new_super_site.html",
                "author": "The Star-Ledger / NJ.com",
                "license": "published description; dimensions only, no image used",
            },
            {
                "what": "arched columns, clock tower and ticket booth, 5,600 seats, synthetic field",
                "source": "https://www.eiassoc.com/project/newark-schools-stadium/",
                "author": "EI Associates",
                "license": "published project description; no image used",
            },
            {
                "what": "400 metre track, arch-wall entrance, home and away bleachers, ticket office",
                "source": "https://www.epicbuilds.com/portfolio/newark-public-schools-stadium/",
                "author": "Epic Management",
                "license": "published project description; no image used",
            },
        ],
        "modelLicense": "Own work by Jonn (BlvckFish), licensed to the City project",
    }
    path = os.path.join(public, "manifest.json")
    with open(path, "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print("manifest", path)


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
    totals = []
    for level in (0, 1, 2):
        body, wins, lamps, col, _info = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        for acc, name, mat in (
            (body, f"body-lod{level}", main_mat),
            (wins, f"windows-lod{level}", win_mat),
            (lamps, f"lamps-lod{level}", lamp_mat),
        ):
            obj = acc_object(name, acc, mat)
            obj.name = name
            obj.parent = parent
        if col is not None:
            col_obj = acc_object(f"{SLUG}_COL", col, None)
            col_obj.name = f"{SLUG}_COL"
            col_obj.parent = parent
        roots.append(parent)
        total = body.tris + wins.tris + lamps.tris
        totals.append(total)
        print(f"LOD{level} tris {total} body {body.tris} windows {wins.tris} lamps {lamps.tris} col {col.tris if col else 0}")

    write_manifest(public, totals)

    for img in list(bpy.data.images):
        if img.name in ("Render Result", "Viewer Node"):
            bpy.data.images.remove(img)

    blend_path = os.path.join(root, f"{SLUG}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile(compress=True)
    print("blend", blend_path, os.path.getsize(blend_path))

    raw = "/tmp/stadium-raw.glb"
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

    shots = os.environ.get("STADIUM_SHOTS")
    if shots:
        render_shots(roots, shots)


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


def _bounds(roots, level):
    xs, ys, zs = [], [], []
    for child in roots[level].children:
        if child.name.endswith("_COL") or child.data is None:
            continue
        for v in child.data.vertices:
            xs.append(v.co.x)
            ys.append(v.co.y)
            zs.append(v.co.z)
    return min(xs), max(xs), min(ys), max(ys), min(zs), max(zs)


def render_shots(roots, folder):
    import bpy

    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except Exception:
        scene.render.engine = "CYCLES"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 16
    if scene.render.engine == "CYCLES":
        scene.cycles.samples = 24
        scene.cycles.device = "CPU"

    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.68, 0.86, 1)
    bg.inputs[1].default_value = 0.85

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 4.5
    sun_data.angle = 0.4
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.9, 0.15, 0.6)

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 40000
    fill_data.size = 80
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 26
    cam_data.clip_end = 5000
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    x0, x1, y0, y1, z0, z1 = _bounds(roots, 0)
    cx, cy = (x0 + x1) * 0.5, (y0 + y1) * 0.5
    span = max(x1 - x0, y1 - y0)
    ground = bpy.data.meshes.new("ground")
    pad = span
    ground.from_pydata(
        [(cx - pad, cy - pad, -0.05), (cx + pad, cy - pad, -0.05), (cx + pad, cy + pad, -0.05), (cx - pad, cy + pad, -0.05)],
        [],
        [(0, 1, 2, 3)],
    )
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.16, 0.18, 0.16, 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.92
    gobj = bpy.data.objects.new("ground", ground)
    gobj.data.materials.append(gmat)
    scene.collection.objects.link(gobj)

    def show(level):
        for i, root in enumerate(roots):
            _hide_tree(root, i != level)

    target = (cx, cy, 6)
    dist = span * 0.62
    eye = span * 0.28
    _look_at(fill, (cx - span * 0.2, cy + span * 0.4, 40), target)
    # Aim toward the Bloomfield wall (high Y) from far enough back that the
    # arches and the clock tower sit fully inside the frame.
    front_aim = (cx, y1 - span * 0.42, 5)
    shots = [
        ("front", (cx, y1 + span * 0.95, span * 0.48), front_aim),
        ("side-west", (x0 - span * 0.7, cy + span * 0.05, span * 0.3), target),
        ("side-east", (x1 + span * 0.7, cy + span * 0.02, span * 0.3), target),
        ("back", (cx, y0 - span * 0.9, span * 0.42), target),
    ]
    show(0)
    for name, loc, tgt in shots:
        _look_at(cam, loc, tgt)
        scene.render.filepath = os.path.join(folder, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("shot", name)

    bg.inputs[0].default_value = (0.015, 0.02, 0.04, 1)
    bg.inputs[1].default_value = 0.35
    sun_data.energy = 0.08
    fill_data.energy = 200
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type != "BSDF_PRINCIPLED":
                continue
            if mat.name == WIN_MAT:
                node.inputs["Emission Strength"].default_value = 4.5
            elif mat.name == LAMP_MAT:
                node.inputs["Emission Strength"].default_value = 40.0
    _look_at(cam, (cx + span * 0.42, y1 + span * 0.72, span * 0.4), (cx, y1 - span * 0.5, 6))
    scene.render.filepath = os.path.join(folder, "night.png")
    bpy.ops.render.render(write_still=True)
    print("shot night")
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED" and mat.name in (WIN_MAT, LAMP_MAT):
                node.inputs["Emission Strength"].default_value = 0.45
    sun_data.energy = 4.5
    bg.inputs[0].default_value = (0.62, 0.66, 0.70, 1)
    bg.inputs[1].default_value = 0.8

    show(0)
    body = None
    for child in roots[0].children:
        if child.name == "body-lod0":
            body = child
    if body is not None:
        mod = body.modifiers.new("wire", "WIREFRAME")
        mod.thickness = 0.18
        mod.use_replace = True
        _look_at(cam, (cx + span * 0.2, y1 + dist * 0.4, eye * 0.85), target)
        scene.render.filepath = os.path.join(folder, "wire-lod0.png")
        bpy.ops.render.render(write_still=True)
        body.modifiers.remove(mod)
        print("shot wire")

    gobj.hide_render = True
    cam_data.type = "ORTHO"
    gap = (x1 - x0) + 36
    cam_data.ortho_scale = gap * 2.15 + (x1 - x0)
    offsets = (-gap, 0.0, gap)
    for root, dx in zip(roots, offsets):
        _hide_tree(root, False)
        root.location.x = dx
    _look_at(cam, (cx, cy + span, 14), (cx, cy, 6))
    scene.render.resolution_x = 1800
    scene.render.resolution_y = 560
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
        print(f"placement lat {LAT:.8f} lon {LON:.8f} heading {HEADING_DEG}")
    else:
        build_scene()
