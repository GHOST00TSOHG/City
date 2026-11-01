#!/usr/bin/env python3
"""Military Park pavilion, Newark. Exterior only.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
The park-facing long front (toward Wars of America) faces Blender +Y.

The mesh is the one-storey 2014 restaurant pavilion at 55 Park Place.
OSM tags the current tenant. This model has no tenant name and no logo.

    python3 build_pavilion.py
    python3 build_pavilion.py --counts
    blender -b --factory-startup --python build_pavilion.py

No Google imagery. No paid add-ons. Run with --factory-startup.
"""

from __future__ import annotations

import math
import os
import random
import sys

# OSM way 511381537, closed ring, © OpenStreetMap contributors.
RING_LL = [
    (40.7391027, -74.1690338),
    (40.7392115, -74.1691856),
    (40.7391614, -74.1692483),
    (40.7391504, -74.1692329),
    (40.7391255, -74.1692640),
    (40.7390163, -74.1691116),
    (40.7390564, -74.1690615),
    (40.7390678, -74.1690774),
]
MONUMENT_LL = (40.7387587, -74.1697587)

# One storey. OSM has no height. The 2014 building reads as a low flat-roof
# pavilion beside the 17 ft monument, so the wall is 3.55 m and the roof 3.86 m.
WALL_H = 3.55
BASE_H = 0.46
FASCIA_Z = 3.18
ROOF_Z0 = 3.55
ROOF_Z1 = 3.86
OVERHANG = 0.48
FRONT_OVERHANG = 1.05

# Atlas (u, v, w, h), v at the bottom.
FASCIA = (0.00, 0.50, 0.50, 0.48)
FRAME = (0.50, 0.50, 0.48, 0.48)
BASE = (0.00, 0.02, 0.50, 0.46)
SOFFIT = (0.52, 0.02, 0.46, 0.46)

SLUG = "military-park-pavilion"
MAIN_MAT = f"{SLUG}-main"
WIN_MAT = "emissive-windows"
LAMP_MAT = "emissive-lamp"


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


def vnorm(a):
    L = vlen(a)
    if L < 1e-12:
        return (0.0, 0.0, 1.0)
    return (a[0] / L, a[1] / L, a[2] / L)


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


def _region_uvs(region):
    u, v, w, h = region
    return ((u, v), (u + w, v), (u + w, v + h), (u, v + h))


def add_quad_uv(acc, p0, p1, p2, p3, uvs, hint):
    n = _normal(p0, p1, p2)
    if n is None:
        return
    if vdot(n, hint) < 0:
        n = (-n[0], -n[1], -n[2])
        order = (p0, p3, p2, p1)
        uvs = (uvs[0], uvs[3], uvs[2], uvs[1])
    else:
        order = (p0, p1, p2, p3)
    ids = [acc.add(p, n, uv) for p, uv in zip(order, uvs)]
    acc.tri(ids[0], ids[1], ids[2])
    acc.tri(ids[0], ids[2], ids[3])


def add_quad(acc, p0, p1, p2, p3, region, hint):
    add_quad_uv(acc, p0, p1, p2, p3, _region_uvs(region), hint)


def add_tri(acc, p0, p1, p2, region, hint):
    n = _normal(p0, p1, p2)
    if n is None:
        return
    if vdot(n, hint) < 0:
        n = (-n[0], -n[1], -n[2])
        p0, p2 = p2, p0
    uvs = _region_uvs(region)
    ids = [acc.add(p, n, uv) for p, uv in zip((p0, p1, p2), (uvs[0], uvs[1], uvs[2]))]
    acc.tri(ids[0], ids[1], ids[2])


def signed_area(poly):
    a = 0.0
    for i, (x1, y1) in enumerate(poly):
        x2, y2 = poly[(i + 1) % len(poly)]
        a += x1 * y2 - x2 * y1
    return a * 0.5


def ensure_ccw(poly):
    if signed_area(poly) < 0:
        return list(reversed(poly))
    return list(poly)


def outward(a, b):
    dx, dy = b[0] - a[0], b[1] - a[1]
    L = math.hypot(dx, dy) or 1.0
    # Right of a CCW edge.
    return (dy / L, -dx / L)


def line_intersect(p, r, q, s):
    """Intersection of p + t r and q + u s. r and s are direction vectors."""
    den = r[0] * s[1] - r[1] * s[0]
    if abs(den) < 1e-10:
        return ((p[0] + q[0]) * 0.5, (p[1] + q[1]) * 0.5)
    t = ((q[0] - p[0]) * s[1] - (q[1] - p[1]) * s[0]) / den
    return (p[0] + t * r[0], p[1] + t * r[1])


def offset_polygon(poly, dist_fn):
    """Outward offset of a CCW polygon. dist_fn(i) is the offset of edge i."""
    n = len(poly)
    segs = []
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        nx, ny = outward(a, b)
        d = dist_fn(i)
        segs.append(((a[0] + nx * d, a[1] + ny * d), (b[0] + nx * d, b[1] + ny * d)))
    out = []
    for i in range(n):
        a0, a1 = segs[i - 1]
        b0, b1 = segs[i]
        out.append(
            line_intersect(a0, (a1[0] - a0[0], a1[1] - a0[1]), b0, (b1[0] - b0[0], b1[1] - b0[1]))
        )
    return out


def triangulate(poly):
    """Ear clip a simple CCW polygon. Returns index triples."""
    idx = list(range(len(poly)))
    tris = []

    def area(i, j, k):
        ax, ay = poly[i]
        bx, by = poly[j]
        cx, cy = poly[k]
        return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

    def point_in(p, a, b, c):
        def side(u, v):
            return (v[0] - u[0]) * (p[1] - u[1]) - (v[1] - u[1]) * (p[0] - u[0])

        s1 = side(a, b)
        s2 = side(b, c)
        s3 = side(c, a)
        return (s1 >= -1e-8 and s2 >= -1e-8 and s3 >= -1e-8) or (s1 <= 1e-8 and s2 <= 1e-8 and s3 <= 1e-8)

    guard = 0
    while len(idx) > 3 and guard < 64:
        guard += 1
        n = len(idx)
        clipped = False
        for t in range(n):
            i0 = idx[t]
            i1 = idx[(t + 1) % n]
            i2 = idx[(t + 2) % n]
            if area(i0, i1, i2) <= 1e-8:
                continue
            a, b, c = poly[i0], poly[i1], poly[i2]
            bad = False
            for j in idx:
                if j in (i0, i1, i2):
                    continue
                if point_in(poly[j], a, b, c):
                    bad = True
                    break
            if bad:
                continue
            tris.append((i0, i1, i2))
            del idx[(t + 1) % n]
            clipped = True
            break
        if not clipped:
            break
    if len(idx) == 3:
        tris.append((idx[0], idx[1], idx[2]))
    return tris


def layout():
    lats = [p[0] for p in RING_LL]
    lons = [p[1] for p in RING_LL]
    lat = sum(lats) / len(lats)
    lon = sum(lons) / len(lons)
    mlat = 111320.0
    mlon = 111320.0 * math.cos(math.radians(lat))
    enu = [((lo - lon) * mlon, (la - lat) * mlat) for la, lo in RING_LL]
    me = (MONUMENT_LL[1] - lon) * mlon
    mn = (MONUMENT_LL[0] - lat) * mlat
    to_mon = (me, mn)
    poly = ensure_ccw(enu)
    best = None
    for i in range(len(poly)):
        a = poly[i]
        b = poly[(i + 1) % len(poly)]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        if length < 10.0:
            continue
        nx, ny = outward(a, b)
        score = nx * to_mon[0] + ny * to_mon[1]
        if best is None or score > best[0]:
            best = (score, nx, ny)
    nx, ny = best[1], best[2]
    heading = math.degrees(math.atan2(nx, ny)) % 360.0
    th = math.radians(heading)
    c, s = math.cos(th), math.sin(th)
    # Map the front normal onto +Y.
    rotated = []
    for e, n in poly:
        rotated.append((e * c - n * s, e * s + n * c))
    rotated = ensure_ccw(rotated)
    return lat, lon, heading, rotated


LAT, LON, HEADING, FOOTPRINT = layout()


def add_box(acc, center, size, region):
    hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
    cx, cy, cz = center
    pts = []
    for z in (-hz, hz):
        for y in (-hy, hy):
            for x in (-hx, hx):
                pts.append((cx + x, cy + y, cz + z))
    faces = (
        (0, 2, 3, 1, (0, 0, -1)),
        (4, 5, 7, 6, (0, 0, 1)),
        (0, 1, 5, 4, (0, -1, 0)),
        (2, 6, 7, 3, (0, 1, 0)),
        (0, 4, 6, 2, (-1, 0, 0)),
        (1, 3, 7, 5, (1, 0, 0)),
    )
    for a, b, c, d, hint in faces:
        add_quad(acc, pts[a], pts[b], pts[c], pts[d], region, hint)


def extrude_slab(acc, poly, z0, z1, side_region, top_region, bottom_region):
    tris = triangulate(poly)
    for i, j, k in tris:
        a = (poly[i][0], poly[i][1], z1)
        b = (poly[j][0], poly[j][1], z1)
        c = (poly[k][0], poly[k][1], z1)
        add_tri(acc, a, b, c, top_region, (0, 0, 1))
        add_tri(
            acc,
            (poly[i][0], poly[i][1], z0),
            (poly[k][0], poly[k][1], z0),
            (poly[j][0], poly[j][1], z0),
            bottom_region,
            (0, 0, -1),
        )
    for i in range(len(poly)):
        a = poly[i]
        b = poly[(i + 1) % len(poly)]
        hint = outward(a, b) + (0.0,)
        add_quad(
            acc,
            (a[0], a[1], z0),
            (b[0], b[1], z0),
            (b[0], b[1], z1),
            (a[0], a[1], z1),
            side_region,
            hint,
        )


def wall_strip(acc, a, b, z0, z1, region):
    hint = outward(a, b) + (0.0,)
    add_quad(acc, (a[0], a[1], z0), (b[0], b[1], z0), (b[0], b[1], z1), (a[0], a[1], z1), region, hint)


def inset_edge(a, b, dist):
    nx, ny = outward(a, b)
    return (a[0] - nx * dist, a[1] - ny * dist), (b[0] - nx * dist, b[1] - ny * dist)


def add_opening(shell, glass, a, b, lod, kind):
    """kind: glass, door, solid."""
    wall_strip(shell, a, b, 0.0, BASE_H, BASE)
    wall_strip(shell, a, b, FASCIA_Z, WALL_H, FASCIA)
    if kind == "solid" or lod == 2 and kind != "glass":
        wall_strip(shell, a, b, BASE_H, FASCIA_Z, FRAME)
        if kind == "door" and lod == 0:
            # A single unlettered door, pushed in slightly.
            da, db = inset_edge(a, b, 0.04)
            length = math.hypot(b[0] - a[0], b[1] - a[1])
            t0, t1 = 0.28, min(0.72, 0.28 + 1.15 / max(length, 0.01))
            p0 = (da[0] + (db[0] - da[0]) * t0, da[1] + (db[1] - da[1]) * t0)
            p1 = (da[0] + (db[0] - da[0]) * t1, da[1] + (db[1] - da[1]) * t1)
            hint = outward(a, b) + (0.0,)
            add_quad(
                glass,
                (p0[0], p0[1], BASE_H + 0.04),
                (p1[0], p1[1], BASE_H + 0.04),
                (p1[0], p1[1], FASCIA_Z - 0.08),
                (p0[0], p0[1], FASCIA_Z - 0.08),
                (0.05, 0.05, 0.90, 0.90),
                hint,
            )
        return
    if lod >= 1:
        ga, gb = inset_edge(a, b, 0.03)
        hint = outward(a, b) + (0.0,)
        add_quad(
            glass,
            (ga[0], ga[1], BASE_H),
            (gb[0], gb[1], BASE_H),
            (gb[0], gb[1], FASCIA_Z),
            (ga[0], ga[1], FASCIA_Z),
            (0.0, 0.0, 1.0, 1.0),
            hint,
        )
        return
    # Mullioned bays.
    length = math.hypot(b[0] - a[0], b[1] - a[1])
    bays = max(1, int(round(length / 1.18)))
    dx = (b[0] - a[0]) / bays
    dy = (b[1] - a[1]) / bays
    nx, ny = outward(a, b)
    hint = (nx, ny, 0.0)
    for i in range(bays):
        p0 = (a[0] + dx * i, a[1] + dy * i)
        p1 = (a[0] + dx * (i + 1), a[1] + dy * (i + 1))
        g0, g1 = inset_edge(p0, p1, 0.035)
        # Shrink the bay so the mullion has a gap.
        shrink = 0.045
        span = math.hypot(p1[0] - p0[0], p1[1] - p0[1]) or 1.0
        ux, uy = (p1[0] - p0[0]) / span, (p1[1] - p0[1]) / span
        g0 = (g0[0] + ux * shrink, g0[1] + uy * shrink)
        g1 = (g1[0] - ux * shrink, g1[1] - uy * shrink)
        rail = BASE_H + (FASCIA_Z - BASE_H) * 0.42
        pane = (0.08, 0.08 + (i % 3) * 0.2, 0.55, 0.42)
        add_quad(glass, (g0[0], g0[1], BASE_H), (g1[0], g1[1], BASE_H), (g1[0], g1[1], rail - 0.03), (g0[0], g0[1], rail - 0.03), pane, hint)
        pane_u = (0.12, 0.48, 0.62, 0.46)
        add_quad(glass, (g0[0], g0[1], rail + 0.03), (g1[0], g1[1], rail + 0.03), (g1[0], g1[1], FASCIA_Z), (g0[0], g0[1], FASCIA_Z), pane_u, hint)
        # Rail and mullion in the frame metal.
        mx = (p0[0] + p1[0]) * 0.5 - nx * 0.02
        my = (p0[1] + p1[1]) * 0.5 - ny * 0.02
        add_box(shell, (mx, my, rail), (abs(ux) * (span - 0.02) + abs(nx) * 0.06, abs(uy) * (span - 0.02) + abs(ny) * 0.06, 0.05), FRAME)
        if i < bays:
            vx = p1[0] - nx * 0.02
            vy = p1[1] - ny * 0.02
            add_box(
                shell,
                (vx, vy, (BASE_H + FASCIA_Z) * 0.5),
                (abs(nx) * 0.07 + abs(ux) * 0.05, abs(ny) * 0.07 + abs(uy) * 0.05, FASCIA_Z - BASE_H),
                FRAME,
            )


def add_posts(acc, poly, lod):
    if lod == 2:
        return
    size = 0.16 if lod == 0 else 0.14
    for x, y in poly:
        add_box(acc, (x, y, WALL_H * 0.5), (size, size, WALL_H), FRAME)


def add_sconces(shell, lamps, poly, lod):
    if lod == 2:
        return
    n = len(poly)
    count = 0
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        nx, ny = outward(a, b)
        if ny < 0.75 or length < 8.0:
            continue
        lamps_n = 4 if lod == 0 else 2
        for k in range(lamps_n):
            t = (k + 1) / (lamps_n + 1)
            x = a[0] + (b[0] - a[0]) * t + nx * 0.10
            y = a[1] + (b[1] - a[1]) * t + ny * 0.10
            add_box(shell, (x, y, FASCIA_Z - 0.02), (0.16, 0.10, 0.08), FRAME)
            add_box(lamps, (x, y + ny * 0.02, FASCIA_Z - 0.08), (0.10, 0.05, 0.035), FASCIA)
            count += 1
    return count


def build(level):
    shell = Acc()
    glass = Acc()
    lamps = Acc()
    poly = FOOTPRINT
    n = len(poly)
    for i in range(n):
        a = poly[i]
        b = poly[(i + 1) % n]
        length = math.hypot(b[0] - a[0], b[1] - a[1])
        nx, ny = outward(a, b)
        # Long walls and the ends are glass. The short notch returns stay solid.
        if length > 2.6:
            kind = "glass"
        else:
            kind = "solid"
        del nx, ny
        add_opening(shell, glass, a, b, level, kind)
    add_posts(shell, poly, level)
    # Roof overhang. The front edges (outward +Y) project further.
    def dist_for(i):
        a = poly[i]
        b = poly[(i + 1) % n]
        nx, ny = outward(a, b)
        if ny > 0.7:
            return FRONT_OVERHANG
        return OVERHANG

    roof = offset_polygon(poly, dist_for)
    extrude_slab(shell, roof, ROOF_Z0, ROOF_Z1, FASCIA, FASCIA, SOFFIT)
    # Closed floor so the shell has a bottom.
    extrude_slab(shell, poly, 0.0, 0.08, BASE, BASE, BASE)
    add_sconces(shell, lamps, poly, level)
    col = None
    if level == 0:
        col = Acc()
        extrude_slab(col, poly, 0.0, WALL_H, BASE, BASE, BASE)
    return shell, glass, lamps, col


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
    rng = random.Random(2014)
    base = Image.new("RGB", (size, size), (210, 208, 202))
    orm = Image.new("RGB", (size, size), (255, 180, 0))
    height = Image.new("L", (size, size), 150)
    db = ImageDraw.Draw(base)
    do = ImageDraw.Draw(orm)
    dh = ImageDraw.Draw(height)

    # Pale fascia, a soft plaster/metal panel.
    x0, y0, x1, y1 = _region_pixels(FASCIA, size)
    db.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(214, 212, 206))
    do.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(250, 150, 0))
    dh.rectangle([x0, y0, x1 - 1, y1 - 1], fill=168)
    for i in range(9):
        xx = x0 + int((x1 - x0) * i / 8)
        db.line([(xx, y0), (xx, y1 - 1)], fill=(186, 184, 178), width=3)
        dh.line([(xx, y0), (xx, y1 - 1)], fill=90, width=3)

    # Charcoal frames, slightly glossy.
    x0, y0, x1, y1 = _region_pixels(FRAME, size)
    db.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(38, 40, 43))
    do.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(210, 95, 70))
    dh.rectangle([x0, y0, x1 - 1, y1 - 1], fill=150)
    for i in range(14):
        yy = y0 + 20 + i * 48
        if yy >= y1:
            break
        db.line([(x0, yy), (x1 - 1, yy)], fill=(58, 60, 64), width=2)

    # Stone base.
    x0, y0, x1, y1 = _region_pixels(BASE, size)
    db.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(92, 90, 86))
    do.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(220, 200, 4))
    dh.rectangle([x0, y0, x1 - 1, y1 - 1], fill=130)
    bw = (x1 - x0) // 6
    for i in range(7):
        xx = x0 + i * bw
        db.line([(xx, y0), (xx, y1 - 1)], fill=(62, 60, 56), width=4)
        dh.line([(xx, y0), (xx, y1 - 1)], fill=50, width=4)
    for _ in range(400):
        sx = rng.randint(x0, x1 - 1)
        sy = rng.randint(y0, y1 - 1)
        d = rng.randint(-16, 12)
        db.point((sx, sy), fill=(92 + d, 90 + d, 86 + d))

    # Soffit, warm gray boards.
    x0, y0, x1, y1 = _region_pixels(SOFFIT, size)
    db.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(176, 168, 154))
    do.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(245, 175, 0))
    dh.rectangle([x0, y0, x1 - 1, y1 - 1], fill=145)
    yy = y0
    while yy < y1:
        db.line([(x0, yy), (x1 - 1, yy)], fill=(150, 142, 128), width=2)
        dh.line([(x0, yy), (x1 - 1, yy)], fill=80, width=2)
        yy += 28

    height = height.filter(ImageFilter.SMOOTH)
    normal = _normal_from_height(height)
    base.save(os.path.join(folder, "main-basecolor.png"), "PNG", optimize=True)
    normal.save(os.path.join(folder, "main-normal.png"), "PNG", optimize=True)
    orm.save(os.path.join(folder, "main-orm.png"), "PNG", optimize=True)

    # Cool glass. A soft vertical grade only, no sign and no logo.
    # Night warmth comes from the material emission colour, not from this image.
    g = 1024
    glass = Image.new("RGB", (g, g), (150, 166, 176))
    gp = glass.load()
    for y in range(g):
        t = y / (g - 1)
        r = int(132 + 28 * t)
        gc = int(150 + 18 * t)
        b = int(168 - 16 * t)
        for x in range(g):
            j = rng.randint(-3, 3)
            gp[x, y] = (r + j, gc + j, b + j)
    glass.save(os.path.join(folder, "windows-basecolor.png"), "PNG", optimize=True)
    print("textures", folder)
    print(f"placement lat {LAT:.7f} lon {LON:.7f} heading {HEADING:.2f}")


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
            nx, ny, nz = -dx * 1.8, -dy * 1.8, 1.0
            L = math.sqrt(nx * nx + ny * ny + nz * nz) or 1.0
            dst[x, y] = (
                int((nx / L * 0.5 + 0.5) * 255),
                int((ny / L * 0.5 + 0.5) * 255),
                int((nz / L * 0.5 + 0.5) * 255),
            )
    return out.resize((w, h), Image.BILINEAR)


def count_only():
    print(f"lat {LAT:.7f} lon {LON:.7f} heading {HEADING:.2f}")
    print("footprint")
    for p in FOOTPRINT:
        print(f"  {p[0]:7.2f} {p[1]:7.2f}")
    print("area", round(signed_area(FOOTPRINT), 2), "m2")
    caps = (50000, 15000, 3000)
    for level, name in ((0, "LOD0"), (1, "LOD1"), (2, "LOD2")):
        shell, glass, lamps, col = build(level)
        total = shell.tris + glass.tris + lamps.tris
        xs = [p[0] for p in shell.V]
        ys = [p[1] for p in shell.V]
        zs = [p[2] for p in shell.V]
        print(
            f"{name} shell {shell.tris} glass {glass.tris} lamps {lamps.tris} "
            f"col {col.tris if col else 0} sum {total} "
            f"x {min(xs):.2f}..{max(xs):.2f} y {min(ys):.2f}..{max(ys):.2f} z {min(zs):.2f}..{max(zs):.2f}"
        )
        if total > caps[level]:
            print(f"OVER BUDGET {name}", file=sys.stderr)
            return 1
        if level == 0 and (not glass.tris or not lamps.tris):
            print("missing glass or lamps", file=sys.stderr)
            return 1
    return 0


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

    roots = []
    stats = []
    for level in (0, 1, 2):
        shell, glass, lamps, col = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        shell_obj = acc_object(f"shell-lod{level}", shell, main_mat)
        shell_obj.parent = parent
        if glass.tris:
            glass_obj = acc_object(f"glazing-lod{level}", glass, win_mat)
            glass_obj.parent = parent
        if lamps.tris:
            lamp_obj = acc_object(f"sconces-lod{level}", lamps, lamp_mat)
            lamp_obj.parent = parent
        if col is not None:
            col_obj = acc_object(f"{SLUG}_COL", col, None)
            col_obj.parent = parent
        roots.append(parent)
        stats.append((level, shell.tris, glass.tris, lamps.tris, col.tris if col else 0))
        print(f"LOD{level} tris {shell.tris + glass.tris + lamps.tris}")

    blend_path = os.path.join(root, f"{SLUG}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile(compress=True)
    print("blend", blend_path, os.path.getsize(blend_path))

    raw = os.environ.get("PAVILION_RAW", "/tmp/military-park-pavilion-raw.glb")
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
    with open("/tmp/military-park-pavilion-stats.txt", "w", encoding="utf-8") as fh:
        for row in stats:
            fh.write(" ".join(str(v) for v in row) + "\n")

    shots = os.environ.get("PAVILION_SHOTS")
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
    nmap.inputs["Strength"].default_value = 0.55
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
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.70, 0.40, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 0.22
    bsdf.inputs["Roughness"].default_value = 0.14
    bsdf.inputs["Metallic"].default_value = 0.04
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
    bsdf.inputs["Base Color"].default_value = (1.0, 0.78, 0.48, 1.0)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.72, 0.38, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.4
    bsdf.inputs["Roughness"].default_value = 0.3
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


def _base_image(mat):
    if mat is None or not mat.use_nodes:
        return None
    for node in mat.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image and "basecolor" in (node.image.name or ""):
            return node.image
    for node in mat.node_tree.nodes:
        if node.type == "TEX_IMAGE" and node.image:
            return node.image
    return None


def _standing_toon(image, light):
    """EEVEE bands for the standing renders. The glazing stays emissive. Not exported."""
    import bpy

    mat = bpy.data.materials.new("standing-toon")
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
    emit = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(emit.outputs["BSDF"], out.inputs["Surface"])
    emit.inputs["Roughness"].default_value = 1.0
    emit.inputs["Metallic"].default_value = 0.0
    emit.inputs["Emission Strength"].default_value = 1.0
    tex = nodes.new("ShaderNodeTexImage")
    tex.image = image
    tex.interpolation = "Linear"
    uv = nodes.new("ShaderNodeUVMap")
    uv.uv_map = "UVMap"
    links.new(uv.outputs["UV"], tex.inputs["Vector"])
    geom = nodes.new("ShaderNodeNewGeometry")
    combine = nodes.new("ShaderNodeCombineXYZ")
    combine.inputs["X"].default_value = light[0]
    combine.inputs["Y"].default_value = light[1]
    combine.inputs["Z"].default_value = light[2]
    dot = nodes.new("ShaderNodeVectorMath")
    dot.operation = "DOT_PRODUCT"
    links.new(geom.outputs["Normal"], dot.inputs[0])
    links.new(combine.outputs["Vector"], dot.inputs[1])
    span = nodes.new("ShaderNodeMapRange")
    span.inputs["From Min"].default_value = -0.15
    span.inputs["From Max"].default_value = 0.85
    span.inputs["To Min"].default_value = 0.0
    span.inputs["To Max"].default_value = 1.0
    links.new(dot.outputs["Value"], span.inputs["Value"])
    ramp = nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.interpolation = "CONSTANT"
    ramp.name = "standing-bands"
    links.new(span.outputs["Result"], ramp.inputs["Fac"])
    mix = nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.blend_type = "MULTIPLY"
    factor = next(s for s in mix.inputs if s.name == "Factor" and s.type == "VALUE")
    factor.default_value = 1.0
    color_a = next(s for s in mix.inputs if s.name == "A" and s.type == "RGBA")
    color_b = next(s for s in mix.inputs if s.name == "B" and s.type == "RGBA")
    result = next(s for s in mix.outputs if s.name == "Result" and s.type == "RGBA")
    links.new(tex.outputs["Color"], color_a)
    links.new(ramp.outputs["Color"], color_b)
    links.new(result, emit.inputs["Base Color"])
    links.new(result, emit.inputs["Emission Color"])
    return mat


def _set_bands(mat, stops):
    ramp = mat.node_tree.nodes.get("standing-bands")
    if ramp is None:
        return
    elements = ramp.color_ramp.elements
    while len(elements) > len(stops):
        elements.remove(elements[-1])
    while len(elements) < len(stops):
        elements.new(0.5)
    for element, (pos, gray) in zip(elements, stops):
        element.position = pos
        element.color = (gray, gray, gray, 1.0)


def _outline_material():
    import bpy

    mat = bpy.data.materials.new("standing-ink")
    mat.use_nodes = True
    try:
        mat.use_backface_culling = True
    except Exception:
        pass
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (0.01, 0.012, 0.016, 1.0)
    bsdf.inputs["Emission Color"].default_value = (0.01, 0.012, 0.016, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.0
    bsdf.inputs["Roughness"].default_value = 1.0
    return mat


def _set_ink(mat, rgb):
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    bsdf.inputs["Base Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
    bsdf.inputs["Emission Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)


def apply_standing_render(roots, sun, thickness):
    """Toon the shell. Glass and sconces stay emissive so night still reads."""
    import bpy
    from mathutils import Vector

    bpy.context.view_layer.update()
    light = sun.matrix_world.to_3x3() @ Vector((0.0, 0.0, -1.0))
    light.normalize()
    src = bpy.data.materials.get(MAIN_MAT)
    toon = _standing_toon(_base_image(src), (light.x, light.y, light.z))
    _set_bands(toon, ((0.0, 0.38), (0.40, 0.68), (0.72, 1.0)))
    ink = _outline_material()
    swapped = []
    scene = bpy.context.scene
    for root in roots:
        for child in list(root.children):
            if child.type != "MESH" or not child.name.startswith("shell-lod"):
                continue
            if child.data.materials:
                swapped.append((child, child.data.materials[0]))
                child.data.materials[0] = toon
            for poly in child.data.polygons:
                poly.use_smooth = True
    return {"toon": toon, "ink": ink, "swapped": swapped}


def _hide_outlines(roots, hide):
    for root in roots:
        for child in root.children:
            if not child.name.endswith("-outline"):
                continue
            child.hide_render = hide
            try:
                child.hide_set(hide)
            except Exception:
                pass


def setup_comic_compositor(scene):
    """Depth contour plus normal creases. Render only, so the glb stays PBR."""
    import bpy

    scene.use_nodes = True
    scene.render.use_compositing = True
    layer = scene.view_layers[0]
    layer.use_pass_z = True
    layer.use_pass_normal = True
    tree = scene.node_tree
    nodes = tree.nodes
    links = tree.links
    nodes.clear()
    rl = nodes.new("CompositorNodeRLayers")

    def sobel(socket):
        src = socket
        if socket.type == "VALUE":
            norm = nodes.new("CompositorNodeNormalize")
            links.new(socket, norm.inputs["Value"])
            src = norm.outputs["Value"]
        if src.type == "VALUE":
            comb = nodes.new("CompositorNodeCombineColor")
            for channel in ("Red", "Green", "Blue"):
                links.new(src, comb.inputs[channel])
            src = comb.outputs["Image"]
        elif src.type == "VECTOR":
            sep = nodes.new("CompositorNodeSeparateXYZ")
            links.new(src, sep.inputs["Vector"])
            comb = nodes.new("CompositorNodeCombineColor")
            links.new(sep.outputs["X"], comb.inputs["Red"])
            links.new(sep.outputs["Y"], comb.inputs["Green"])
            links.new(sep.outputs["Z"], comb.inputs["Blue"])
            src = comb.outputs["Image"]
        filt = nodes.new("CompositorNodeFilter")
        filt.filter_type = "SOBEL"
        links.new(src, filt.inputs["Image"])
        bw = nodes.new("CompositorNodeRGBToBW")
        links.new(filt.outputs["Image"], bw.inputs["Image"])
        return bw.outputs["Val"]

    depth_edge = sobel(rl.outputs["Depth"])
    normal_edge = sobel(rl.outputs["Normal"])
    scaled = nodes.new("CompositorNodeMath")
    scaled.operation = "MULTIPLY"
    scaled.inputs[1].default_value = 0.22
    links.new(normal_edge, scaled.inputs[0])
    edge = nodes.new("CompositorNodeMath")
    edge.operation = "MAXIMUM"
    links.new(depth_edge, edge.inputs[0])
    links.new(scaled.outputs["Value"], edge.inputs[1])
    span = nodes.new("CompositorNodeMapRange")
    span.inputs["From Min"].default_value = 0.03
    span.inputs["From Max"].default_value = 0.28
    span.inputs["To Min"].default_value = 0.0
    span.inputs["To Max"].default_value = 1.0
    span.use_clamp = True
    links.new(edge.outputs["Value"], span.inputs["Value"])
    mix = nodes.new("CompositorNodeMixRGB")
    mix.blend_type = "MIX"
    links.new(span.outputs["Value"], mix.inputs["Fac"])
    links.new(rl.outputs["Image"], mix.inputs[1])
    black = nodes.new("CompositorNodeRGB")
    black.outputs[0].default_value = (0.01, 0.012, 0.015, 1.0)
    links.new(black.outputs[0], mix.inputs[2])
    comp = nodes.new("CompositorNodeComposite")
    links.new(mix.outputs["Image"], comp.inputs["Image"])


def render_shots(roots, folder):
    import bpy

    os.makedirs(folder, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 1280
    scene.render.resolution_y = 720
    scene.render.film_transparent = False
    if hasattr(scene, "eevee") and hasattr(scene.eevee, "taa_render_samples"):
        scene.eevee.taa_render_samples = 16
    setup_comic_compositor(scene)

    world = bpy.data.worlds.new("sky")
    scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes["Background"]
    bg.inputs[0].default_value = (0.55, 0.64, 0.74, 1)
    bg.inputs[1].default_value = 0.9

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.0
    sun_data.angle = 0.45
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.9, 0.2, -0.4)

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 250
    fill_data.size = 10
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)
    _look_at(fill, (-8, 10, 6), (0, 0, 2))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 35
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground = bpy.data.meshes.new("ground")
    ground.from_pydata(
        [(-24, -20, -0.02), (24, -20, -0.02), (24, 20, -0.02), (-24, 20, -0.02)],
        [],
        [(0, 1, 2, 3)],
    )
    gmat = bpy.data.materials.new("ground")
    gmat.use_nodes = True
    gmat.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.20, 0.24, 0.16, 1)
    gmat.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.9
    gobj = bpy.data.objects.new("ground", ground)
    gobj.data.materials.append(gmat)
    scene.collection.objects.link(gobj)
    standing = apply_standing_render(roots, sun, 0.06)

    def show(level):
        for i, root in enumerate(roots):
            _hide_tree(root, i != level)

    target = (0.0, 0.0, 1.8)
    shots = [
        ("front", (0.4, 22.0, 2.6), target),
        ("side", (22.0, 1.0, 3.0), target),
        ("back", (-0.2, -20.0, 2.8), (0.0, 0.0, 1.6)),
        ("three-quarter", (14.0, 16.0, 4.0), target),
    ]
    show(0)
    only = os.environ.get("SHOT_ONLY", "")
    if only:
        shots = [shot for shot in shots if shot[0] in only.split(",")]
    for name, loc, tgt in shots:
        _look_at(cam, loc, tgt)
        scene.render.filepath = os.path.join(folder, name + ".png")
        bpy.ops.render.render(write_still=True)
        print("shot", name)

    bg.inputs[0].default_value = (0.015, 0.02, 0.04, 1)
    bg.inputs[1].default_value = 0.3
    sun_data.energy = 0.05
    fill_data.energy = 6
    _set_bands(standing["toon"], ((0.0, 0.16), (0.42, 0.32), (0.70, 0.48)))
    _set_ink(standing["ink"], (0.82, 0.88, 0.96))
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        strength = None
        if mat.name == WIN_MAT:
            strength = 5.5
        elif mat.name == LAMP_MAT:
            strength = 16.0
        if strength is None:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Emission Strength"].default_value = strength
    if not only or "night" in only.split(","):
        _look_at(cam, (12.0, 16.0, 3.4), target)
        scene.render.filepath = os.path.join(folder, "night.png")
        bpy.ops.render.render(write_still=True)
        print("shot night")
    for mat in bpy.data.materials:
        if not mat.use_nodes:
            continue
        restore = 0.40 if mat.name == WIN_MAT else (1.4 if mat.name == LAMP_MAT else None)
        if restore is None:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Emission Strength"].default_value = restore

    _set_bands(standing["toon"], ((0.0, 0.38), (0.40, 0.68), (0.72, 1.0)))
    _set_ink(standing["ink"], (0.01, 0.012, 0.016))
    for obj, old in standing["swapped"]:
        if obj.data.materials:
            obj.data.materials[0] = old
    scene.render.use_compositing = False
    if only:
        return

    show(0)
    _hide_outlines(roots, True)
    body = None
    for child in roots[0].children:
        if child.name.startswith("shell-lod0"):
            body = child
    if body is not None:
        sun_data.energy = 3.0
        bg.inputs[0].default_value = (0.62, 0.66, 0.7, 1)
        bg.inputs[1].default_value = 0.9
        mod = body.modifiers.new("wire", "WIREFRAME")
        mod.thickness = 0.02
        mod.use_replace = True
        _look_at(cam, (14.0, 16.0, 4.0), target)
        scene.render.filepath = os.path.join(folder, "wire-lod0.png")
        bpy.ops.render.render(write_still=True)
        body.modifiers.remove(mod)
        print("shot wire")

    gobj.hide_render = True
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 36
    for root, dx in zip(roots, (-14.0, 0.0, 14.0)):
        _hide_tree(root, False)
        root.location.x = dx
    _hide_outlines(roots, True)
    _look_at(cam, (0, 28, 2.2), (0, 0, 1.8))
    scene.render.resolution_x = 1600
    scene.render.filepath = os.path.join(folder, "lod-compare.png")
    bpy.ops.render.render(write_still=True)
    for root in roots:
        root.location.x = 0.0
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
