#!/usr/bin/env python3
"""Exterior of Newark Penn Station (Pennsylvania Station), 1935.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
The west front (Raymond Plaza) faces Blender +Y.

    python3 build_penn.py --counts          # triangle counts, pure python
    python3 audit_penn.py                   # solidity audit (rays), pure python + numpy
    blender -b --factory-startup --python build_penn.py   # writes the glb into public/

Station house 302 ft by 79 ft, waiting-room ceiling 46 ft, and the 1,200 ft
elevated train shed are from the National Register nomination (NRHP 78001760)
and the 2012 boundary increase. The plan is fitted to OSM way 49200094.
Market Street and Raymond Boulevard are the two street passages under the shed.

How the model is built (rules that keep it solid):
  * The house and the shed are closed masses. Every opening is a real hole in the wall with
    reveals, a sill and a head, and the glass sits at the back of the recess (or flush for LOD2).
  * Trim (pilasters, string courses, cornices, sills, canopies, columns) is built as closed
    boxes or prisms that start inside the wall. Nothing hovers in front of a wall.
  * Walls start 0.30 m below grade, so the ground line never shows a gap.
  * Textures are mapped in world metres (no stretching), cut on tile edges, so every piece of
    the same material continues the pattern of its neighbours.

The Pennsylvania Railroad keystone and wordmark are not modeled. Portal letters spell the
station name in an original block alphabet. Eagle capitals are geometric masses, not copies.

No Google imagery. No paid add-ons. Run with --factory-startup.
"""

from __future__ import annotations

import math
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
if HERE not in sys.path:
    sys.path.insert(0, HERE)

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
SKIRT = -0.30        # walls start under grade
BASE = 3.55          # pink granite base
WIN_SILL = 3.95
WIN_HEAD = 12.70
ENTAB = 13.65
CORNICE = 16.15
PED_PEAK = 19.85
ROOF_Z = 15.45
CLERE_TOP = 19.35
V_DECK = 16.00       # shed roof deck
V_PARAPET = 16.55    # top of the shed coping
V_SPRING = 2.05
V_CROWN = 7.85
ARCH_SPRING = 8.45
ARCH_CROWN = 13.15
STEP = 0.12          # door threshold above the plaza

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
ATLAS_REGIONS = {"LIM": LIM, "GRN": GRN, "BRK": BRK, "TC": TC, "ALU": ALU, "RF": RF, "DK": DK,
                 "COP": COP, "ORN": ORN, "CLK": CLK, "SUN": SUN, "SGN": SGN}

# World size in metres that one copy of each region covers (width, height). Painted at a fixed
# px/m: 160 for stone, 200 for brick, so the texture never stretches.
TILE = {
    LIM: (6.4, 6.4), GRN: (3.2, 6.4), BRK: (3.84, 7.68), TC: (3.2, 3.2), ALU: (1.6, 1.6),
    RF: (3.2, 3.2), DK: (3.2, 3.2), COP: (8.7, 2.05), ORN: (4.04, 0.98),
}

# Window atlas (1024). Pane variants are one lit window cell each (aspect 1:2).
W_PANE_A = (0.00, 0.00, 0.25, 0.50)
W_PANE_B = (0.25, 0.00, 0.25, 0.50)
W_PANE_C = (0.50, 0.00, 0.25, 0.50)
W_PANE_D = (0.75, 0.00, 0.25, 0.50)
W_DOOR = (0.00, 0.50, 0.25, 0.50)
W_TRIPLE = (0.25, 0.50, 0.50, 0.50)
W_OCU = (0.75, 0.50, 0.25, 0.25)
W_MARB = (0.75, 0.75, 0.25, 0.25)
GLASS_REGIONS = {"PANE_A": W_PANE_A, "PANE_B": W_PANE_B, "PANE_C": W_PANE_C, "PANE_D": W_PANE_D,
                 "DOOR": W_DOOR, "TRIPLE": W_TRIPLE, "OCU": W_OCU, "MARB": W_MARB}
GLASS_ASPECT = {W_PANE_A: 2.0, W_PANE_B: 2.0, W_PANE_C: 2.0, W_PANE_D: 2.0, W_DOOR: 2.0,
                W_TRIPLE: 1.0, W_OCU: 1.0, W_MARB: 1.0}
PANE_MIX = (W_PANE_A, W_PANE_A, W_PANE_A, W_PANE_B, W_PANE_A, W_PANE_C, W_PANE_B, W_PANE_A, W_PANE_D, W_PANE_A, W_PANE_B, W_PANE_C)


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


# ---------------------------------------------------------------------------
# Vectors, accumulator
# ---------------------------------------------------------------------------

def vsub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def vdot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def vcross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def vlen(a):
    return math.sqrt(vdot(a, a))


def mean3(pts):
    n = float(len(pts))
    return (sum(p[0] for p in pts) / n, sum(p[1] for p in pts) / n, sum(p[2] for p in pts) / n)


_PART = [0]   # part id: every closed solid or wall piece gets its own, used by audit_penn.py
_NEST = [0]


def new_part():
    if _NEST[0] == 0:
        _PART[0] += 1


class Acc:
    def __init__(self):
        self.V = []
        self.N = []
        self.UV = []
        self.F = []
        self.P = []

    def add(self, p, n, uv):
        self.V.append(p)
        self.N.append(n)
        self.UV.append(uv)
        return len(self.V) - 1

    def tri(self, a, b, c):
        self.F.append((a, b, c))
        self.P.append(_PART[0])

    @property
    def tris(self):
        return len(self.F)


class Level:
    """Per-LOD detail switches."""

    def __init__(self, n):
        self.n = n
        self.tile_mult = (1.0, 3.0, 8.0)[n]
        self.arch_n = (16, 8, 5)[n]
        self.depth = (0.38, 0.20, 0.0)[n]     # window recess
        self.detail = n == 0                  # sills, mullions, eagles, crest rows, keystones, lanterns
        self.mid = n <= 1                     # pilaster dressing, portal rings, sign, oculi
        self.col = n == 0

    def __repr__(self):
        return f"LOD{self.n}"


class Plane:
    """A wall plane. axis 'x': plane y=fixed, s runs along x. axis 'y': plane x=fixed, s runs along y.
    out is +1/-1, the direction the wall faces. Offsets are measured outward from the wall plane."""

    def __init__(self, axis, fixed, out):
        self.axis, self.fixed, self.out = axis, fixed, out

    def pt(self, s, z, off=0.0):
        if self.axis == "x":
            return (s, self.fixed + self.out * off, z)
        return (self.fixed + self.out * off, s, z)

    @property
    def n(self):
        return (0.0, float(self.out), 0.0) if self.axis == "x" else (float(self.out), 0.0, 0.0)

    @property
    def t(self):
        return (1.0, 0.0, 0.0) if self.axis == "x" else (0.0, 1.0, 0.0)


# ---------------------------------------------------------------------------
# Polygon emitters
# ---------------------------------------------------------------------------

INSET = 0.004


def _newell(pts):
    nx = ny = nz = 0.0
    n = len(pts)
    for i in range(n):
        a, b = pts[i], pts[(i + 1) % n]
        nx += (a[1] - b[1]) * (a[2] + b[2])
        ny += (a[2] - b[2]) * (a[0] + b[0])
        nz += (a[0] - b[0]) * (a[1] + b[1])
    ln = math.sqrt(nx * nx + ny * ny + nz * nz)
    if ln < 1e-12:
        return None
    return (nx / ln, ny / ln, nz / ln)


def _clip(poly, k, v, keep_ge):
    out = []
    n = len(poly)
    for i in range(n):
        a, b = poly[i], poly[(i + 1) % n]
        ina = (a[k] >= v - 1e-9) if keep_ge else (a[k] <= v + 1e-9)
        inb = (b[k] >= v - 1e-9) if keep_ge else (b[k] <= v + 1e-9)
        if ina:
            out.append(a)
        if ina != inb:
            d = b[k] - a[k]
            t = (v - a[k]) / d if abs(d) > 1e-15 else 0.0
            out.append(tuple(a[j] + (b[j] - a[j]) * t for j in range(len(a))))
    return out


def _area2d(poly, ix, iy):
    a = 0.0
    n = len(poly)
    for i in range(n):
        p, q = poly[i], poly[(i + 1) % n]
        a += p[ix] * q[iy] - q[ix] * p[iy]
    return abs(a) * 0.5


def _emit_fan(acc, pts, n3, uvs):
    ids = [acc.add(p, n3, uv) for p, uv in zip(pts, uvs)]
    for i in range(1, len(ids) - 1):
        acc.tri(ids[0], ids[i], ids[i + 1])


def tpoly(acc, pts, hint, region, lv, tile=None):
    """Convex planar polygon, textured in world metres. Cut on tile edges so each cell maps the
    region once and neighbouring pieces continue the same pattern."""
    n3 = _newell(pts)
    if n3 is None:
        return
    new_part()
    if vdot(n3, hint) < 0:
        pts = pts[::-1]
        n3 = (-n3[0], -n3[1], -n3[2])
    if tile is not None and abs(n3[2]) > 0.75:
        tw = th = tile[0] * lv.tile_mult
    elif tile is not None:
        # Explicit tile (a band such as the frieze): height is locked to the band, width scales with LOD.
        tw, th = tile[0] * lv.tile_mult, tile[1]
    else:
        tw, th = TILE[region][0] * lv.tile_mult, TILE[region][1] * lv.tile_mult
    if abs(n3[2]) > 0.75:
        smap = lambda p: (p[0], p[1])
    elif abs(n3[1]) >= abs(n3[0]):
        smap = lambda p: (p[0], p[2])
    else:
        smap = lambda p: (p[1], p[2])
    poly = []
    for p in pts:
        s, t = smap(p)
        poly.append((s, t, p[0], p[1], p[2]))
    smin = min(q[0] for q in poly)
    smax = max(q[0] for q in poly)
    tmin = min(q[1] for q in poly)
    tmax = max(q[1] for q in poly)
    i0, i1 = int(math.floor(smin / tw + 1e-9)), int(math.floor(smax / tw - 1e-9))
    j0, j1 = int(math.floor(tmin / th + 1e-9)), int(math.floor(tmax / th - 1e-9))
    u0, v0, w, h = region
    for i in range(i0, i1 + 1):
        for j in range(j0, j1 + 1):
            cell = poly
            if i0 != i1 or j0 != j1:
                cell = _clip(cell, 0, i * tw, True)
                if len(cell) >= 3:
                    cell = _clip(cell, 0, (i + 1) * tw, False)
                if len(cell) >= 3:
                    cell = _clip(cell, 1, j * th, True)
                if len(cell) >= 3:
                    cell = _clip(cell, 1, (j + 1) * th, False)
            if len(cell) < 3 or _area2d(cell, 0, 1) < 1e-7:
                continue
            uvs = []
            for q in cell:
                fx = (q[0] - i * tw) / tw
                fy = (q[1] - j * th) / th
                fx = min(1.0, max(0.0, fx))
                fy = min(1.0, max(0.0, fy))
                uvs.append((u0 + w * (INSET + (1 - 2 * INSET) * fx), v0 + h * (INSET + (1 - 2 * INSET) * fy)))
            _emit_fan(acc, [(q[2], q[3], q[4]) for q in cell], n3, uvs)


def qfull(acc, pts, hint, region):
    """Polygon of 3 or 4 points with the whole region mapped once. Points are bottom-left,
    bottom-right, top-right, top-left as seen by the viewer."""
    n3 = _newell(pts)
    if n3 is None:
        return
    new_part()
    u0, v0, w, h = region
    corners = ((u0 + w * INSET, v0 + h * INSET), (u0 + w * (1 - INSET), v0 + h * INSET),
               (u0 + w * (1 - INSET), v0 + h * (1 - INSET)), (u0 + w * INSET, v0 + h * (1 - INSET)))
    if len(pts) <= 4:
        uvs = list(corners[: len(pts)])
    else:
        uvs = [(u0 + w * 0.5, v0 + h * 0.5)] * len(pts)
    if vdot(n3, hint) < 0:
        pts = pts[::-1]
        uvs = uvs[::-1]
        n3 = (-n3[0], -n3[1], -n3[2])
    _emit_fan(acc, pts, n3, uvs)


FACE_NAMES = ("-y", "+y", "-z", "+x", "+z", "-x")


def prism(acc, A, B, region, lv, tile=None, no=(), top=None, bottom=None, plain=False):
    """Closed convex prism between polygon A (front) and B (back), same vertex count.
    top/bottom: optional (acc, region) to put the up/down-facing faces in another material.
    plain: no tiling (hidden faces)."""
    n = len(A)
    new_part()
    _NEST[0] += 1
    try:
        centre = mean3(A + B)
        faces = [(0, A), (1, B[::-1])]
        for i in range(n):
            j = (i + 1) % n
            faces.append((2 + i, [A[i], A[j], B[j], B[i]]))
        for idx, f in faces:
            name = FACE_NAMES[idx] if n == 4 and idx < 6 else None
            if name in no or idx in no:
                continue
            hint = vsub(mean3(f), centre)
            up = hint[2] / (vlen(hint) or 1.0)
            n3 = _newell(f)
            if n3 is not None:
                up = n3[2] if vdot(n3, hint) >= 0 else -n3[2]
            if up > 0.9 and top is not None:
                qfull(top[0], f, hint, top[1])
            elif up < -0.9 and bottom is not None:
                qfull(bottom[0], f, hint, bottom[1])
            elif plain or up < -0.9:
                qfull(acc, f, hint, region)
            else:
                tpoly(acc, f, hint, region, lv, tile)
    finally:
        _NEST[0] -= 1


def box(acc, x0, x1, y0, y1, z0, z1, region, lv, **kw):
    if x1 < x0:
        x0, x1 = x1, x0
    if y1 < y0:
        y0, y1 = y1, y0
    if x1 - x0 < 1e-4 or y1 - y0 < 1e-4 or z1 - z0 < 1e-4:
        return
    A = [(x0, y0, z0), (x1, y0, z0), (x1, y0, z1), (x0, y0, z1)]
    B = [(x0, y1, z0), (x1, y1, z0), (x1, y1, z1), (x0, y1, z1)]
    prism(acc, A, B, region, lv, **kw)


def pbox(acc, pl, s0, s1, z0, z1, o0, o1, region, lv, **kw):
    """Box on a wall plane: along s0..s1, up z0..z1, from offset o0 (inside the wall when negative)
    to o1 (proud)."""
    if s1 < s0:
        s0, s1 = s1, s0
    a = pl.fixed + pl.out * o0
    b = pl.fixed + pl.out * o1
    if -0.5 < o0 <= -0.1:
        # Trim that starts a few cm inside the wall: its back face is buried in the wall mass and can never
        # be seen. Deeper blocks (cornice, coping, parapet ring) have a visible inner face and keep it.
        back = {("x", 1): "-y", ("x", -1): "+y", ("y", 1): "-x", ("y", -1): "+x"}[(pl.axis, pl.out)]
        kw["no"] = tuple(kw.get("no", ())) + (back,)
    if pl.axis == "x":
        box(acc, s0, s1, min(a, b), max(a, b), z0, z1, region, lv, **kw)
    else:
        box(acc, min(a, b), max(a, b), s0, s1, z0, z1, region, lv, **kw)


def pprism(acc, pl, prof, o0, o1, region, lv, **kw):
    """Prism from a profile polygon in (s, z) on a wall plane, from offset o0 to o1."""
    A = [pl.pt(s, z, o1) for s, z in prof]
    B = [pl.pt(s, z, o0) for s, z in prof]
    prism(acc, A, B, region, lv, **kw)


def right_is_plus_s(pl):
    """True when a viewer standing in front of the wall sees +s to their right."""
    return (pl.axis == "x" and pl.out < 0) or (pl.axis == "y" and pl.out > 0)


def cyl(acc, pl, cs, cz, r, o0, o1, n, region, lv, front_region=None, front_acc=None):
    """Short drum on a wall plane (o0 inside the wall, o1 proud). The front is a dial region or plain stone."""
    A, B = [], []
    for i in range(n):
        a = math.tau * i / n
        s, z = cs + math.cos(a) * r, cz + math.sin(a) * r
        A.append(pl.pt(s, z, o1))
        B.append(pl.pt(s, z, o0))
    centre = mean3(A + B)
    fd = pl.n
    for i in range(n):
        j = (i + 1) % n
        f = [A[i], A[j], B[j], B[i]]
        tpoly(acc, f, vsub(mean3(f), centre), region, lv)
    qfull(acc, B, (-fd[0], -fd[1], -fd[2]), region)
    if front_region is None:
        tpoly(acc, A, fd, region, lv)
        return
    u0, v0, w, h = front_region
    sgn = 1.0 if right_is_plus_s(pl) else -1.0
    ids = []
    for i in range(n):
        a = math.tau * i / n
        uv = (u0 + w * (0.5 + 0.48 * sgn * math.cos(a)), v0 + h * (0.5 + 0.48 * math.sin(a)))
        ids.append(front_acc.add(A[i], fd, uv))
    idc = front_acc.add(pl.pt(cs, cz, o1), fd, (u0 + w * 0.5, v0 + h * 0.5))
    n3 = _newell(A)
    flip = n3 is not None and vdot(n3, fd) < 0
    for i in range(n):
        a, b = ids[i], ids[(i + 1) % n]
        if flip:
            front_acc.tri(idc, b, a)
        else:
            front_acc.tri(idc, a, b)




def ring_prism(acc, pl, inner, outer, o0, o1, region, lv, closed=True, tile=None):
    """Band between two (s, z) polylines (inner, outer), extruded from offset o0 to o1. Closed rings
    have no end caps; open arcs get caps at both ends."""
    n = len(inner)
    last = n if closed else n - 1
    for i in range(last):
        j = (i + 1) % n
        A = [pl.pt(*inner[i], o1), pl.pt(*inner[j], o1), pl.pt(*outer[j], o1), pl.pt(*outer[i], o1)]
        B = [pl.pt(*inner[i], o0), pl.pt(*inner[j], o0), pl.pt(*outer[j], o0), pl.pt(*outer[i], o0)]
        # prism faces: 0 A, 1 B, 2 inner edge, 3 j side, 4 outer edge, 5 i side
        skip = [3, 5]
        if not closed:
            if i == 0:
                skip.remove(5)
            if i == last - 1:
                skip.remove(3)
        prism(acc, A, B, region, lv, tile=tile, no=tuple(skip))


# ---------------------------------------------------------------------------
# Arches and openings
# ---------------------------------------------------------------------------

def arch_pts(s0, s1, z_spring, z_crown, n):
    """Circular arch through the spring points and the crown. Returns points, centre (s, z), radius."""
    span = s1 - s0
    rise = max(0.3, z_crown - z_spring)
    half = span * 0.5
    radius = (rise * rise + half * half) / (2.0 * rise)
    cs = (s0 + s1) * 0.5
    cz = z_crown - radius
    left_z = z_spring - cz
    if abs(left_z) < 1e-6:
        left_z = 0.0
    a0 = math.atan2(left_z, -half)
    a1 = math.atan2(left_z, half)
    pts = []
    for i in range(n + 1):
        a = a0 + (a1 - a0) * (i / n)
        pts.append((cs + math.cos(a) * radius, cz + math.sin(a) * radius))
    pts[0] = (s0, z_spring)
    pts[-1] = (s1, z_spring)
    return pts, (cs, cz), radius


def offset_arch(pts, centre, radius, d):
    cs, cz = centre
    k = (radius + d) / radius
    return [(cs + (s - cs) * k, cz + (z - cz) * k) for s, z in pts]


class Hole:
    def __init__(self, s0, s1, z_lo, top, centre=None):
        self.s0, self.s1, self.z_lo, self.top, self.centre = s0, s1, z_lo, top, centre

    @staticmethod
    def rect(s0, s1, z_lo, z_hi):
        return Hole(s0, s1, z_lo, [(s0, z_hi), (s1, z_hi)])

    @staticmethod
    def arched(s0, s1, z_lo, z_spring, z_crown, n):
        pts, c, r = arch_pts(s0, s1, z_spring, z_crown, n)
        h = Hole(s0, s1, z_lo, pts, c)
        h.r = r
        return h

    @property
    def z_hi(self):
        return max(z for _, z in self.top)


def _emit_banded(acc, pl, poly_sz, bands, lv, tile_for=None):
    pts = [pl.pt(s, z) for s, z in poly_sz]
    zs = [p[2] for p in pts]
    zlo, zhi = min(zs), max(zs)
    hint = pl.n
    for za, zb, region in bands:
        if zhi <= za + 1e-9 or zlo >= zb - 1e-9:
            continue
        cell = [(p[0], p[1], p[2]) for p in pts]
        if zlo < za - 1e-9:
            cell = _clip(cell, 2, za, True)
        if len(cell) >= 3 and zhi > zb + 1e-9:
            cell = _clip(cell, 2, zb, False)
        if len(cell) >= 3 and _newell(cell) is not None:
            tpoly(acc, cell, hint, region, lv)


def facade(acc, pl, s0, s1, z0, z1, bands, holes, lv):
    """Wall face with real holes. bands: [(za, zb, region)] splits the material by height."""
    holes = sorted(holes, key=lambda h: h.s0)
    bps = {s0, s1}
    for h in holes:
        for s, _ in h.top:
            bps.add(s)
    bps = sorted(b for b in bps if s0 - 1e-9 <= b <= s1 + 1e-9)
    # Solid runs between holes (full height).
    cursor = s0
    for h in holes:
        if h.s0 > cursor + 1e-6:
            _emit_banded(acc, pl, [(cursor, z0), (h.s0, z0), (h.s0, z1), (cursor, z1)], bands, lv)
        cursor = max(cursor, h.s1)
        if h.z_lo > z0 + 1e-6:
            _emit_banded(acc, pl, [(h.s0, z0), (h.s1, z0), (h.s1, h.z_lo), (h.s0, h.z_lo)], bands, lv)
        for i in range(len(h.top) - 1):
            sa, ta = h.top[i]
            sb, tb = h.top[i + 1]
            if min(ta, tb) < z1 - 1e-6:
                _emit_banded(acc, pl, [(sa, ta), (sb, tb), (sb, z1), (sa, z1)], bands, lv)
    if s1 > cursor + 1e-6:
        _emit_banded(acc, pl, [(cursor, z0), (s1, z0), (s1, z1), (cursor, z1)], bands, lv)


def reveal(acc, pl, h, depth, region, lv):
    if depth <= 1e-6:
        return
    t = pl.t
    inw = lambda s, z: pl.pt(s, z, -depth)
    fro = lambda s, z: pl.pt(s, z, 0.0)
    top0 = h.top[0]
    top1 = h.top[-1]
    # jambs
    tpoly(acc, [fro(h.s0, h.z_lo), fro(h.s0, top0[1]), inw(h.s0, top0[1]), inw(h.s0, h.z_lo)], t, region, lv)
    tpoly(acc, [fro(h.s1, h.z_lo), fro(h.s1, top1[1]), inw(h.s1, top1[1]), inw(h.s1, h.z_lo)], (-t[0], -t[1], -t[2]), region, lv)
    # sill
    if h.z_lo > SKIRT + 1e-6:
        tpoly(acc, [fro(h.s0, h.z_lo), fro(h.s1, h.z_lo), inw(h.s1, h.z_lo), inw(h.s0, h.z_lo)], (0, 0, 1), region, lv)
    # head
    for i in range(len(h.top) - 1):
        sa, ta = h.top[i]
        sb, tb = h.top[i + 1]
        if h.centre is not None:
            ms, mz = (sa + sb) * 0.5, (ta + tb) * 0.5
            d = (h.centre[0] - ms, h.centre[1] - mz)
            hint = (t[0] * d[0], t[1] * d[0], d[1])
        else:
            hint = (0, 0, -1)
        tpoly(acc, [fro(sa, ta), fro(sb, tb), inw(sb, tb), inw(sa, ta)], hint, region, lv)


def gquad(acc, pl, s0, s1, z0, z1, off, region, lv, nv=None):
    """Glass rectangle, cut into cells so each cell keeps the pane texture's aspect."""
    if s1 - s0 < 0.02 or z1 - z0 < 0.02:
        return
    asp = GLASS_ASPECT[region]
    if nv is None:
        nv = max(1, int(round((z1 - z0) / ((s1 - s0) * asp))))
    nv = min(nv, 6 if lv.n else 8)
    for k in range(nv):
        za = z0 + (z1 - z0) * k / nv
        zb = z0 + (z1 - z0) * (k + 1) / nv
        qfull(acc, [pl.pt(s0, za, off), pl.pt(s1, za, off), pl.pt(s1, zb, off), pl.pt(s0, zb, off)], pl.n, region)


def gtrap(acc, pl, sa, sb, bot_a, bot_b, top_a, top_b, off, region, lv):
    """Glass between a flat or sloped bottom and a sloped top (arch fill), cut vertically."""
    ha, hb = top_a - bot_a, top_b - bot_b
    if min(ha, hb) < 0.02 or sb - sa < 0.02:
        return
    asp = GLASS_ASPECT[region]
    nv = max(1, int(round(((ha + hb) * 0.5) / ((sb - sa) * asp))))
    nv = min(nv, 6)
    for k in range(nv):
        a0, a1 = k / nv, (k + 1) / nv
        qfull(acc, [pl.pt(sa, bot_a + ha * a0, off), pl.pt(sb, bot_b + hb * a0, off),
                    pl.pt(sb, bot_b + hb * a1, off), pl.pt(sa, bot_a + ha * a1, off)], pl.n, region)


def _complement(a, b, gaps):
    out = []
    cur = a
    for g0, g1 in sorted(gaps):
        if g0 > cur + 1e-6:
            out.append((cur, min(g0, b)))
        cur = max(cur, g1)
    if b > cur + 1e-6:
        out.append((cur, b))
    return [(p, q) for p, q in out if q - p > 0.05]


class Pick:
    """Deterministic pane variants so lit windows vary a little, calmly."""

    def __init__(self):
        self.i = 0

    def next(self):
        r = PANE_MIX[self.i % len(PANE_MIX)]
        self.i += 3
        return r


# ---------------------------------------------------------------------------
# Shared dressing
# ---------------------------------------------------------------------------

LAMP_RGN = (0.0, 0.0, 1.0, 1.0)
LINER = True   # audit_penn.py turns this off to test the walls on their own


def _complement(a, b, gaps):
    out, cur = [], a
    for g0, g1 in sorted(gaps):
        if g0 > cur + 1e-6:
            out.append((cur, min(g0, b)))
        cur = max(cur, g1)
    if b > cur + 1e-6:
        out.append((cur, b))
    return [(p, q) for p, q in out if q - p > 0.05]


class Pick:
    """Deterministic pane variants so lit windows vary a little, calmly."""

    def __init__(self):
        self.i = 0

    def next(self):
        r = PANE_MIX[self.i % len(PANE_MIX)]
        self.i += 5
        return r


def gflat(G, x0, x1, y0, y1, z, region, cell_x):
    """Skylight glass: flat, facing up, cut into cells that keep the pane texture's aspect."""
    nx = max(1, int(round((x1 - x0) / cell_x)))
    asp = GLASS_ASPECT[region]
    ny = max(1, int(round((y1 - y0) / (cell_x * asp))))
    for i in range(nx):
        for j in range(ny):
            xa, xb = x0 + (x1 - x0) * i / nx, x0 + (x1 - x0) * (i + 1) / nx
            ya, yb = y0 + (y1 - y0) * j / ny, y0 + (y1 - y0) * (j + 1) / ny
            qfull(G, [(xa, ya, z), (xb, ya, z), (xb, yb, z), (xa, yb, z)], (0, 0, 1), region)


def vcol(S, pl, cs, o, r, z0, z1, n, lv):
    bot, top = [], []
    for i in range(n):
        a = math.tau * i / n
        rr = r * (0.9 if (i % 2 == 0 and n >= 8 and lv.detail) else 1.0)
        s, off = cs + math.cos(a) * rr, o + math.sin(a) * rr
        bot.append(pl.pt(s, z0, off))
        top.append(pl.pt(s, z1, off))
    prism(S, top, bot, GRN, lv)


def eagle(S, pl, cs, o, z, lv):
    """Stylised eagle mass: body, two stepped wings, head. Original geometry."""
    pbox(S, pl, cs - 0.30, cs + 0.30, z, z + 0.52, o - 0.24, o + 0.24, GRN, lv)
    pbox(S, pl, cs - 1.0, cs - 0.25, z + 0.16, z + 0.40, o - 0.06, o + 0.14, GRN, lv)
    pbox(S, pl, cs + 0.25, cs + 1.0, z + 0.16, z + 0.40, o - 0.06, o + 0.14, GRN, lv)
    pbox(S, pl, cs - 0.78, cs - 0.55, z + 0.40, z + 0.62, o - 0.04, o + 0.10, GRN, lv)
    pbox(S, pl, cs + 0.55, cs + 0.78, z + 0.40, z + 0.62, o - 0.04, o + 0.10, GRN, lv)
    pbox(S, pl, cs - 0.10, cs + 0.10, z + 0.50, z + 0.78, o - 0.02, o + 0.30, GRN, lv)


def sign_block(S, pl, s0, s1, z0, z1, o0, o1, lv):
    """Closed block whose front face carries the station-name region, mapped once, reading left to right."""
    front = {("x", 1): "+y", ("x", -1): "-y", ("y", 1): "+x", ("y", -1): "-x"}[(pl.axis, pl.out)]
    pbox(S, pl, s0, s1, z0, z1, o0, o1, COP, lv, no=(front,))
    plus = right_is_plus_s(pl)
    a, b = (s0, s1) if plus else (s1, s0)
    qfull(S, [pl.pt(a, z0, o1), pl.pt(b, z0, o1), pl.pt(b, z1, o1), pl.pt(a, z1, o1)], pl.n, SGN)


def lantern(L, pl, s, z, lv):
    """Warm wall lantern: one closed lamp box that starts inside the wall surface."""
    if not lv.detail:
        return
    pbox(L, pl, s - 0.14, s + 0.14, z, z + 0.72, -0.04, 0.22, LAMP_RGN, lv, plain=True)


def canopy_flat(S, L, pl, s0, s1, z, reach, lv, thick=0.2):
    pbox(S, pl, s0, s1, z, z + thick, -0.2, reach, ALU, lv, bottom=(L, LAMP_RGN))


def canopy_round(S, L, pl, cs, rad, z, lv, thick=0.22):
    n = 8 if lv.detail else 4
    top, bot = [], []
    for i in range(n + 1):
        a = math.pi * i / n
        s, o = cs + math.cos(a) * rad, math.sin(a) * rad - 0.2
        top.append(pl.pt(s, z + thick, o))
        bot.append(pl.pt(s, z, o))
    prism(S, top, bot, ALU, lv, bottom=(L, LAMP_RGN))


def stoop(S, pl, s0, s1, lv, reach=0.9):
    pbox(S, pl, s0, s1, SKIRT, STEP, -0.15, reach, GRN, lv)


def strings(S, pl, s0, s1, gaps, lv):
    """Granite plinth and water table, broken where the doors come down to the ground."""
    for a, b in _complement(s0, s1, gaps):
        pbox(S, pl, a, b, SKIRT, 0.55, -0.12, 0.14, GRN, lv)
        pbox(S, pl, a, b, BASE - 0.20, BASE + 0.08, -0.12, 0.18, GRN, lv)


def pilaster(S, pl, s, z0, z1, lv, half=0.34, proj=0.22):
    pbox(S, pl, s - half, s + half, z0, z1, -0.12, proj, LIM, lv)
    if lv.detail:
        pbox(S, pl, s - half - 0.1, s + half + 0.1, z0, z0 + 0.34, -0.12, proj + 0.1, LIM, lv)
        pbox(S, pl, s - half - 0.1, s + half + 0.1, z1 - 0.46, z1, -0.12, proj + 0.1, LIM, lv)


def entablature(S, pl, s0, s1, lv):
    """Architrave, Greek-key frieze, two-step cornice: closed boxes that start inside the wall.
    The upper cornice runs 0.7 m behind the wall plane so it closes against the roof deck."""
    if lv.n == 2:
        pbox(S, pl, s0, s1, ENTAB, CORNICE, -0.7, 0.55, COP, lv)
        return
    pbox(S, pl, s0, s1, ENTAB, ENTAB + 0.45, -0.15, 0.20, LIM, lv)
    pbox(S, pl, s0, s1, ENTAB + 0.45, 15.10, -0.15, 0.12, ORN, lv, tile=(4.04, 15.10 - ENTAB - 0.45))
    pbox(S, pl, s0, s1, 15.10, 15.45, -0.7, 0.42, COP, lv)
    pbox(S, pl, s0, s1, 15.45, CORNICE, -0.7, 0.62, COP, lv)


def pediment(S, pl, s0, s1, z_base, z_peak, lv, emblem):
    cs = (s0 + s1) * 0.5
    pprism(S, pl, [(s0, z_base), (s1, z_base), (cs, z_peak)], -0.70, 0.52, COP, lv)
    if lv.n == 2:
        return
    inner = 0.75
    pprism(S, pl, [(s0 + inner, z_base + 0.05), (s1 - inner, z_base + 0.05), (cs, z_peak - 0.62)], 0.40, 0.62, LIM, lv)
    if emblem and lv.detail:
        region = CLK if emblem == "clock" else SUN
        zc = z_base + (z_peak - z_base) * 0.40
        cyl(S, pl, cs, zc, 1.15, 0.50, 0.70, 16, COP, lv, front_region=region, front_acc=S)


def crest_row(S, pl, s0, s1, z, skip, lv, step=3.15, wid=2.3, hgt=0.85):
    s = s0
    while s + wid < s1:
        mid = s + wid * 0.5
        if not any(a - wid * 0.5 < mid < b + wid * 0.5 for a, b in skip):
            pprism(S, pl, [(s, z - 0.05), (s + wid, z - 0.05), (mid, z + hgt)], -0.25, 0.30, ALU, lv)
        s += step


# ---------------------------------------------------------------------------
# Station house
# ---------------------------------------------------------------------------

def window_dress(S, G, pl, h, lv, pane, mullions, transom, sill, region):
    """Reveal, glass, mullions, sill and head for one rectangular window hole."""
    d = lv.depth
    s0, s1, zl, zh = h.s0, h.s1, h.z_lo, h.z_hi
    reveal(S, pl, h, d, region, lv)
    if lv.n == 2:
        gquad(G, pl, s0, s1, zl, zh, 0.0, W_TRIPLE if pane != W_MARB else W_MARB, lv)
        return
    if lv.detail and mullions:
        zt0, zt1 = (8.35, 9.15) if transom else (zl, zl)
        panes, gap = 3, 0.14
        pw = ((s1 - s0) - gap * (panes - 1)) / panes
        zones = [(zl, zt0), (zt1, zh)] if transom else [(zl, zh)]
        for k in range(panes):
            a = s0 + k * (pw + gap)
            for za, zb in zones:
                gquad(G, pl, a, a + pw, za, zb, -d, pane, lv)
        for k in range(1, panes):
            c = s0 + k * (pw + gap) - gap * 0.5
            pbox(S, pl, c - gap * 0.5 - 0.01, c + gap * 0.5 + 0.01, zl - 0.02, zh + 0.02, -d, -d + 0.12, ALU, lv)
        if transom:
            pbox(S, pl, s0 - 0.02, s1 + 0.02, zt0, zt1, -d, -0.04, ALU, lv)
    elif mullions and transom and lv.mid:
        gquad(G, pl, s0, s1, zl, 8.35, -d, W_TRIPLE, lv)
        gquad(G, pl, s0, s1, 9.15, zh, -d, W_TRIPLE, lv)
        pbox(S, pl, s0 - 0.02, s1 + 0.02, 8.35, 9.15, -d, -0.04, ALU, lv)
    else:
        gquad(G, pl, s0, s1, zl, zh, -d, pane if lv.detail else (W_TRIPLE if pane != W_MARB else W_MARB), lv)
    if sill and lv.detail:
        pbox(S, pl, s0 - 0.16, s1 + 0.16, zl - 0.22, zl, -0.12, 0.18, COP, lv)
        pbox(S, pl, s0 - 0.12, s1 + 0.12, zh, zh + 0.26, -0.12, 0.12, COP, lv)


def arch_dress(S, G, L, pl, h, u0, u1, lv, emblem, pick):
    """Stilted entrance arch: recessed glazing, granite surround, steps, canopy, pediment."""
    d = lv.depth
    ax0, ax1 = h.s0, h.s1
    pts, c, r = arch_pts(ax0, ax1, ARCH_SPRING, ARCH_CROWN, lv.arch_n)
    reveal(S, pl, h, d, LIM, lv)
    off = -d
    door_top = 3.30
    leaves = 7 if lv.n < 2 else 3
    pw = (ax1 - ax0) / leaves
    for k in range(leaves):
        gquad(G, pl, ax0 + k * pw + 0.04, ax0 + (k + 1) * pw - 0.04, STEP, door_top, off, W_DOOR, lv, nv=1)
    t0 = door_top + 0.20 if lv.n < 2 else door_top
    if lv.n < 2:
        pbox(S, pl, ax0 - 0.02, ax1 + 0.02, door_top, t0, -d, -0.05, ALU, lv)
    pane = pick.next()
    if pane == W_PANE_D:
        pane = W_PANE_A
    for i in range(len(pts) - 1):
        gtrap(G, pl, pts[i][0], pts[i + 1][0], t0, t0, pts[i][1], pts[i + 1][1], off, pane if lv.detail else W_PANE_A, lv)
    if lv.detail:
        for i in range(3, len(pts) - 3, 3):
            sm, zm = pts[i]
            pbox(S, pl, sm - 0.07, sm + 0.07, t0 - 0.02, zm + 0.03, -d, -d + 0.14, ALU, lv)
    ring_w = 0.58
    if lv.mid:
        ring_prism(S, pl, pts, offset_arch(pts, c, r, ring_w), -0.12, 0.18, GRN, lv, closed=False)
        pbox(S, pl, ax0 - ring_w, ax0, SKIRT, ARCH_SPRING + 0.3, -0.12, 0.18, GRN, lv)
        pbox(S, pl, ax1, ax1 + ring_w, SKIRT, ARCH_SPRING + 0.3, -0.12, 0.18, GRN, lv)
    if lv.detail:
        cs = (ax0 + ax1) * 0.5
        pbox(S, pl, cs - 0.42, cs + 0.42, ARCH_CROWN + 0.1, ARCH_CROWN + ring_w + 0.2, -0.12, 0.30, GRN, lv)
        lantern(L, pl, ax0 - ring_w * 0.5, 3.3, lv)
        lantern(L, pl, ax1 + ring_w * 0.5, 3.3, lv)
    stoop(S, pl, ax0 - ring_w - 0.1, ax1 + ring_w + 0.1, lv, reach=1.1)
    canopy_flat(S, L, pl, ax0 - 0.1, ax1 + 0.1, 3.62, 1.7 if lv.mid else 1.5, lv, thick=0.18)
    pediment(S, pl, u0 + 0.4, u1 - 0.4, CORNICE - 0.05, PED_PEAK, lv, emblem)


def door_dress(S, G, L, pl, h, lv):
    d = lv.depth
    s0, s1 = h.s0, h.s1
    reveal(S, pl, h, d, LIM, lv)
    leaves = 4 if lv.n < 2 else 2
    pw = (s1 - s0) / leaves
    for k in range(leaves):
        gquad(G, pl, s0 + k * pw + 0.04, s0 + (k + 1) * pw - 0.04, STEP, 3.35, -d, W_DOOR, lv, nv=1)
    if lv.n < 2:
        pbox(S, pl, s0 - 0.02, s1 + 0.02, 3.35, 3.55, -d, -0.05, ALU, lv)
    gquad(G, pl, s0, s1, 3.55 if lv.n < 2 else 3.35, h.z_hi, -d, W_TRIPLE, lv, nv=1)
    stoop(S, pl, s0 - 0.5, s1 + 0.5, lv, reach=1.2)
    if lv.mid:
        canopy_round(S, L, pl, (s0 + s1) * 0.5, 3.0, 4.42, lv)
    else:
        canopy_flat(S, L, pl, s0 - 0.2, s1 + 0.2, 4.42, 2.6, lv)
    lantern(L, pl, s0 - 0.55, 3.6, lv)
    lantern(L, pl, s1 + 0.55, 3.6, lv)


def west_front(S, G, L, lv, pick):
    x0, x1 = MX(HS), MX(HN)
    yw = MY(HW)
    pl = Plane("x", yw, +1)
    a, b = 18.2, 14.5
    c = HOUSE_L - 2.0 * a - 2.0 * b
    door_w = 6.4
    bays = (("win", a, 4, None), ("arch", b, 0, "clock"), ("win", c, 5, None),
            ("arch", b, 0, "sun"), ("win", a - door_w, 3, None), ("door", door_w, 0, None))
    cursor = x0
    holes, jobs, bounds, gaps, arch_skip = [], [], [x0], [], []
    for kind, width, count, extra in bays:
        u0, u1 = cursor, cursor + width
        bounds.append(u1)
        if kind == "win":
            w = width / count
            for i in range(count):
                h = Hole.rect(u0 + i * w + 0.55, u0 + (i + 1) * w - 0.55, WIN_SILL, WIN_HEAD)
                holes.append(h)
                jobs.append(("win", h, None))
                if i > 0:
                    bounds.append(u0 + i * w)
        elif kind == "arch":
            h = Hole.arched(u0 + 2.55, u1 - 2.55, STEP, ARCH_SPRING, ARCH_CROWN, lv.arch_n)
            holes.append(h)
            jobs.append(("arch", h, (u0, u1, extra)))
            gaps.append((h.s0 - 0.75, h.s1 + 0.75))
            arch_skip.append((u0, u1))
        else:
            h = Hole.rect(u0 + 0.45, u1 - 0.45, STEP, 4.15)
            holes.append(h)
            jobs.append(("door", h, None))
            gaps.append((h.s0 - 0.95, h.s1 + 0.95))
        cursor = u1
    facade(S, pl, x0, x1, SKIRT, ENTAB + 0.2, [(SKIRT, BASE, GRN), (BASE, ENTAB + 0.2, LIM)], holes, lv)
    for kind, h, data in jobs:
        if kind == "win":
            window_dress(S, G, pl, h, lv, pick.next(), True, True, True, LIM)
        elif kind == "arch":
            arch_dress(S, G, L, pl, h, data[0], data[1], lv, data[2], pick)
        else:
            door_dress(S, G, L, pl, h, lv)
    strings(S, pl, x0 - 0.2, x1 + 0.2, gaps, lv)
    if lv.mid:
        for s in sorted(set(round(v, 4) for v in bounds[1:-1])):
            pilaster(S, pl, s, BASE, ENTAB, lv)
    pbox(S, pl, x0 - 0.18, x0 + 0.72, SKIRT, ENTAB, -0.12, 0.30, LIM, lv)
    pbox(S, pl, x1 - 0.72, x1 + 0.18, SKIRT, ENTAB, -0.12, 0.30, LIM, lv)
    entablature(S, pl, x0 - 0.62, x1 + 0.62, lv)
    if lv.detail:
        crest_row(S, pl, x0 + 1.0, x1 - 1.0, CORNICE, arch_skip, lv)


def end_face(S, G, L, lv, x, out, kind, pick):
    ye, yw = MY(HE), MY(HW)
    pl = Plane("y", x, out)
    mid = (ye + yw) * 0.5
    half = 4.3
    wins = []
    for i in range(3):
        w = 2.0 * half / 3.0
        wins.append(Hole.rect(mid - half + i * w + 0.55, mid - half + (i + 1) * w - 0.55, WIN_SILL, WIN_HEAD))
    holes = list(wins)
    door = None
    if kind == "south":
        door = Hole.rect(mid - 2.6, mid + 2.6, STEP, 3.30)
        holes.append(door)
    facade(S, pl, ye, yw, SKIRT, ENTAB + 0.2, [(SKIRT, BASE, GRN), (BASE, ENTAB + 0.2, LIM)], holes, lv)
    for h in wins:
        pane = W_MARB if kind == "south" else pick.next()
        window_dress(S, G, pl, h, lv, pane, kind != "south", kind != "south", True, LIM)
    if door is not None:
        d = lv.depth
        reveal(S, pl, door, d, LIM, lv)
        leaves = 4 if lv.n < 2 else 2
        pw = (door.s1 - door.s0) / leaves
        for k in range(leaves):
            gquad(G, pl, door.s0 + k * pw + 0.04, door.s0 + (k + 1) * pw - 0.04, STEP, 3.25, -d, W_DOOR, lv, nv=1)
        stoop(S, pl, door.s0 - 0.5, door.s1 + 0.5, lv, reach=1.1)
        canopy_flat(S, L, pl, door.s0 - 0.1, door.s1 + 0.1, 3.45, 2.2, lv, thick=0.2)
    if kind == "north" and lv.detail:
        for i in range(5):
            gy = mid - 3.6 + i * 1.8
            pbox(S, pl, gy - 0.55, gy + 0.55, WIN_HEAD + 0.30, ENTAB - 0.12, -0.12, 0.10, ALU, lv)
    strings(S, pl, ye, yw + 0.2, [(door.s0 - 0.9, door.s1 + 0.9)] if door else [], lv)
    if lv.mid:
        for i in (1, 2):
            pilaster(S, pl, mid - half + i * (2 * half / 3.0), BASE, ENTAB, lv)
        pbox(S, pl, yw - 0.72, yw + 0.12, SKIRT, ENTAB, -0.12, 0.30, LIM, lv)
    entablature(S, pl, ye, yw + 0.62, lv)
    pprism(S, pl, [(mid - 6.2, CORNICE - 0.05), (mid + 6.2, CORNICE - 0.05), (mid, PED_PEAK - 0.7)], -0.7, 0.5, COP, lv)


def house_shell(S, lv):
    x0, x1 = MX(HS), MX(HN)
    yw, ye = MY(HW), MY(HE)
    tpoly(S, [(x0, ye, ROOF_Z), (x1, ye, ROOF_Z), (x1, yw, ROOF_Z), (x0, yw, ROOF_Z)], (0, 0, 1), RF, lv, tile=(9.6, 9.6))
    # Dark liner a hand behind the glass line, facing outward: a hairline crack in a facade shows shadow, never sky.
    if not LINER:
        return
    m = 0.7
    zt, zb = ROOF_Z - 0.1, SKIRT + 0.05
    for pts, hint in (
        ([(x0 + m, ye, zt), (x0 + m, ye, zb), (x0 + m, yw - m, zb), (x0 + m, yw - m, zt)], (-1, 0, 0)),
        ([(x1 - m, ye, zt), (x1 - m, yw - m, zt), (x1 - m, yw - m, zb), (x1 - m, ye, zb)], (1, 0, 0)),
        ([(x0 + m, yw - m, zt), (x0 + m, yw - m, zb), (x1 - m, yw - m, zb), (x1 - m, yw - m, zt)], (0, 1, 0)),
    ):
        qfull(S, pts, hint, DK)


def clerestory(S, G, lv, pick):
    x0, x1 = MX(HS), MX(HN)
    ye = MY(HE)
    cl_y = MY(HW + HOUSE_D * 0.25)
    xa, xb = x0 + 2.4, x1 - 2.4
    z0, z1 = ROOF_Z - 0.1, CLERE_TOP
    pl = Plane("x", cl_y, +1)
    holes = []
    step = (6.2, 8.0, 20.0)[lv.n]
    wid = (4.4, 5.2, 9.0)[lv.n]
    u = x0 + 4.0
    while u + wid < x1 - 4.0:
        holes.append(Hole.rect(u, u + wid, ROOF_Z + 0.75, z1 - 0.55))
        u += step
    facade(S, pl, xa, xb, z0, z1, [(z0, z1, BRK)], holes, lv)
    d = min(lv.depth, 0.3)
    for h in holes:
        reveal(S, pl, h, d, BRK, lv)
        if lv.n == 0:
            panes, gap = 3, 0.12
            pw = ((h.s1 - h.s0) - gap * (panes - 1)) / panes
            for k in range(panes):
                gquad(G, pl, h.s0 + k * (pw + gap), h.s0 + k * (pw + gap) + pw, h.z_lo, h.z_hi, -d, pick.next(), lv, nv=1)
            for k in range(1, panes):
                c = h.s0 + k * (pw + gap) - gap * 0.5
                pbox(S, pl, c - 0.07, c + 0.07, h.z_lo - 0.02, h.z_hi + 0.02, -d, -d + 0.1, ALU, lv)
            pbox(S, pl, h.s0 - 0.12, h.s1 + 0.12, h.z_lo - 0.2, h.z_lo, -0.1, 0.14, COP, lv)
        else:
            gquad(G, pl, h.s0, h.s1, h.z_lo, h.z_hi, -d, W_TRIPLE, lv)
    tpoly(S, [(xa, ye, z0), (xa, cl_y, z0), (xa, cl_y, z1), (xa, ye, z1)], (-1, 0, 0), BRK, lv)
    tpoly(S, [(xb, ye, z0), (xb, cl_y, z0), (xb, cl_y, z1), (xb, ye, z1)], (1, 0, 0), BRK, lv)
    tpoly(S, [(xa, ye, V_PARAPET - 0.2), (xb, ye, V_PARAPET - 0.2), (xb, ye, z1), (xa, ye, z1)], (0, -1, 0), BRK, lv)
    tpoly(S, [(xa, ye, z1), (xb, ye, z1), (xb, cl_y, z1), (xa, cl_y, z1)], (0, 0, 1), RF, lv, tile=(9.6, 9.6))
    if lv.mid:
        box(S, xa - 0.12, xb + 0.12, cl_y - 0.30, cl_y + 0.12, z1 - 0.1, z1 + 0.22, COP, lv)
        box(S, xa - 0.12, xb + 0.12, ye, ye + 0.30, z1 - 0.1, z1 + 0.22, COP, lv)
        box(S, xa - 0.12, xa + 0.30, ye + 0.30, cl_y - 0.30, z1 - 0.1, z1 + 0.22, COP, lv)
        box(S, xb - 0.30, xb + 0.12, ye + 0.30, cl_y - 0.30, z1 - 0.1, z1 + 0.22, COP, lv)


def build_house(S, G, L, lv):
    pick = Pick()
    house_shell(S, lv)
    west_front(S, G, L, lv, pick)
    end_face(S, G, L, lv, MX(HS), -1, "south", pick)
    end_face(S, G, L, lv, MX(HN), +1, "north", pick)
    clerestory(S, G, lv, pick)


# ---------------------------------------------------------------------------
# Train shed
# ---------------------------------------------------------------------------

def shed_window_holes(a, b, lv):
    out = []
    if b - a < 16 or lv.n == 2:
        return out
    step = (11.5, 14.0)[lv.n]
    width = (6.4, 7.5)[lv.n]
    u = a + 3.0
    while u + width < b - 1.5:
        out.append(Hole.rect(u, u + width, 11.15, 13.85))
        u += step
    return out


def shed_window_dress(S, G, pl, h, lv, pick):
    d = min(lv.depth, 0.32)
    reveal(S, pl, h, d, BRK, lv)
    if lv.n == 0:
        panes, gap = 3, 0.14
        pw = ((h.s1 - h.s0) - gap * (panes - 1)) / panes
        pane = pick.next()
        for k in range(panes):
            gquad(G, pl, h.s0 + k * (pw + gap), h.s0 + k * (pw + gap) + pw, h.z_lo, h.z_hi, -d, pane, lv, nv=1)
        for k in range(1, panes):
            c = h.s0 + k * (pw + gap) - gap * 0.5
            pbox(S, pl, c - 0.08, c + 0.08, h.z_lo - 0.02, h.z_hi + 0.02, -d, -d + 0.12, ALU, lv)
        pbox(S, pl, h.s0 - 0.18, h.s1 + 0.18, h.z_lo - 0.22, h.z_lo, -0.12, 0.16, COP, lv)
        pbox(S, pl, h.s0 - 0.14, h.s1 + 0.14, h.z_hi, h.z_hi + 0.28, -0.12, 0.12, COP, lv)
        cx = h.s0 - 2.3
        pbox(S, pl, cx - 1.05, cx + 1.05, 10.4, 12.5, -0.12, 0.07, TC, lv)
    else:
        gquad(G, pl, h.s0, h.s1, h.z_lo, h.z_hi, -d, W_TRIPLE, lv, nv=1)


def tunnel(S, L, w0, w1, e0, e1, yw, ye, lv):
    """Street passage: soffit and jambs between the west and east mouths (the street is diagonal)."""
    n = lv.arch_n
    wa, _, _ = arch_pts(w0, w1, V_SPRING, V_CROWN, n)
    ea, _, _ = arch_pts(e0, e1, V_SPRING, V_CROWN, n)
    for i in range(n):
        tpoly(S, [(wa[i][0], yw, wa[i][1]), (wa[i + 1][0], yw, wa[i + 1][1]),
                  (ea[i + 1][0], ye, ea[i + 1][1]), (ea[i][0], ye, ea[i][1])], (0, 0, -1), DK, lv, tile=(25.6, 25.6))
    tpoly(S, [(w0, yw, SKIRT), (e0, ye, SKIRT), (e0, ye, V_SPRING), (w0, yw, V_SPRING)], (1, 0, 0), BRK, lv)
    tpoly(S, [(w1, yw, SKIRT), (e1, ye, SKIRT), (e1, ye, V_SPRING), (w1, yw, V_SPRING)], (-1, 0, 0), BRK, lv)
    if lv.n < 2:
        # Calm warm lamps hung on the crown line.
        for t in (0.18, 0.40, 0.60, 0.82):
            cx = (w0 + w1) * 0.5 + ((e0 + e1) * 0.5 - (w0 + w1) * 0.5) * t
            cy = yw + (ye - yw) * t
            box(L, cx - 0.32, cx + 0.32, cy - 0.20, cy + 0.20, V_CROWN - 0.16, V_CROWN + 0.04, LAMP_RGN, lv, plain=True)


def glass_fan(G, pl, cs, cz, r, off, n):
    u0, v0, w, h = W_OCU
    fd = pl.n
    sgn = 1.0 if right_is_plus_s(pl) else -1.0
    pts = [pl.pt(cs + math.cos(math.tau * i / n) * r, cz + math.sin(math.tau * i / n) * r, off) for i in range(n)]
    ids = []
    for i in range(n):
        a = math.tau * i / n
        ids.append(G.add(pts[i], fd, (u0 + w * (0.5 + 0.48 * sgn * math.cos(a)), v0 + h * (0.5 + 0.48 * math.sin(a)))))
    idc = G.add(pl.pt(cs, cz, off), fd, (u0 + w * 0.5, v0 + h * 0.5))
    n3 = _newell(pts)
    flip = n3 is not None and vdot(n3, fd) < 0
    for i in range(n):
        a, b = ids[i], ids[(i + 1) % n]
        if flip:
            G.tri(idc, b, a)
        else:
            G.tri(idc, a, b)


def portal_dress(S, G, L, pl, s0, s1, lv):
    n = lv.arch_n
    pts, c, r = arch_pts(s0, s1, V_SPRING, V_CROWN, n)
    cx = (s0 + s1) * 0.5
    span = s1 - s0
    if lv.mid:
        ring_prism(S, pl, pts, offset_arch(pts, c, r, 0.55), -0.12, 0.16, GRN, lv, closed=False)
        pbox(S, pl, s0 - 0.72, s0, SKIRT, V_SPRING + 0.5, -0.12, 0.16, GRN, lv)
        pbox(S, pl, s1, s1 + 0.72, SKIRT, V_SPRING + 0.5, -0.12, 0.16, GRN, lv)
        for z0 in (8.55, 9.25, 9.95):
            pbox(S, pl, cx - span * 0.34, cx + span * 0.34, z0, z0 + 0.42, -0.12, 0.10, TC, lv)
        sign_block(S, pl, cx - 8.2, cx + 8.2, 10.7, 12.15, -0.12, 0.14, lv)
        # oculi on the shoulders: stone ring around a recessed glass disc
        for ocx in (s0 - SH * 0.55, s1 + SH * 0.55):
            m = 10 if lv.detail else 6
            rad = 1.05 if lv.detail else 0.9
            inner = [(ocx + math.cos(math.tau * i / m) * rad, 13.35 + math.sin(math.tau * i / m) * rad) for i in range(m)]
            outer = [(ocx + math.cos(math.tau * i / m) * (rad + 0.28), 13.35 + math.sin(math.tau * i / m) * (rad + 0.28)) for i in range(m)]
            ring_prism(S, pl, inner, outer, -0.12, 0.16, COP, lv, closed=True)
            glass_fan(G, pl, ocx, 13.35, rad, 0.04, m)
    if lv.detail:
        for ec, sgn in ((s0, -1), (s1, 1)):
            cs = ec + sgn * 0.36
            vcol(S, pl, cs, 0.36, 0.34, SKIRT, V_SPRING + 1.1, 10, lv)
            pbox(S, pl, cs - 0.46, cs + 0.46, SKIRT, SKIRT + 0.45, 0.0, 0.82, GRN, lv)
            pbox(S, pl, cs - 0.46, cs + 0.46, V_SPRING + 0.9, V_SPRING + 1.25, 0.0, 0.82, GRN, lv)
            eagle(S, pl, cs, 0.40, V_SPRING + 1.25, lv)
            lantern(L, pl, ec + sgn * 1.0, 3.6, lv)
        crest_row(S, pl, cx - span * 0.55, cx + span * 0.55, V_PARAPET, [], lv, step=2.6, wid=1.9)


def build_shed(S, G, L, lv):
    pick = Pick()
    yw, ye = MY(HE), MY(VE)          # west wall plane and east wall plane (yw > ye)
    xs, xn = MX(VS), MX(VN)
    hx0, hx1 = MX(HS), MX(HN)
    west = Plane("x", yw, +1)
    east = Plane("x", ye, -1)
    n = lv.arch_n
    portals = [(MX(w[0]), MX(w[1]), MX(e[0]), MX(e[1])) for w, e in ((MKT_W, MKT_E), (RAY_W, RAY_E))]
    wb = [(SKIRT, 1.15, COP), (1.15, V_DECK, BRK)]

    def arches(which):
        out = []
        for p in portals:
            a0, a1 = (p[0], p[1]) if which == "w" else (p[2], p[3])
            out.append(Hole.arched(a0, a1, SKIRT, V_SPRING, V_CROWN, n))
        return out

    runs_w = [(xs, MX(MKT_W[0]) - SH), (MX(MKT_W[1]) + SH, hx0), (hx1, MX(RAY_W[0]) - SH), (MX(RAY_W[1]) + SH, xn)]
    runs_e = [(xs, MX(MKT_E[0]) - SH), (MX(MKT_E[1]) + SH, MX(RAY_E[0]) - SH), (MX(RAY_E[1]) + SH, xn)]
    wins_w = [h for a, b in runs_w for h in shed_window_holes(a, b, lv)]
    wins_e = [h for a, b in runs_e for h in shed_window_holes(a, b, lv)]
    ah_w, ah_e = arches("w"), arches("e")
    # West wall: the house hides everything below its roof between its ends.
    facade(S, west, xs, hx0, SKIRT, V_DECK, wb, [h for h in ah_w + wins_w if h.s1 <= hx0 + 1e-6], lv)
    facade(S, west, hx1, xn, SKIRT, V_DECK, wb, [h for h in ah_w + wins_w if h.s0 >= hx1 - 1e-6], lv)
    facade(S, west, hx0, hx1, ROOF_Z - 0.35, V_DECK, [(ROOF_Z - 0.35, V_DECK, BRK)], [], lv)
    facade(S, east, xs, xn, SKIRT, V_DECK, wb, ah_e + wins_e, lv)
    end_wins = shed_window_holes(ye, yw, lv)
    for x, out in ((xs, -1), (xn, +1)):
        facade(S, Plane("y", x, out), ye, yw, SKIRT, V_DECK, wb, end_wins, lv)
        for h in end_wins:
            shed_window_dress(S, G, Plane("y", x, out), h, lv, pick)
    # Roof deck with the parapet ring and coping around it.
    tpoly(S, [(xs, ye, V_DECK), (xn, ye, V_DECK), (xn, yw, V_DECK), (xs, yw, V_DECK)], (0, 0, 1), RF, lv, tile=(12.8, 12.8))
    for pl in (west, east):
        pbox(S, pl, xs, xn, V_DECK - 0.02, V_DECK + 0.38, -0.55, 0.0, COP, lv, tile=(13.05, 2.05))
        pbox(S, pl, xs - 0.12, xn + 0.12, V_DECK + 0.36, V_PARAPET, -0.7, 0.16, COP, lv, tile=(13.05, 2.05))
    for x, out in ((xs, -1), (xn, +1)):
        pl = Plane("y", x, out)
        pbox(S, pl, ye, yw, V_DECK - 0.02, V_DECK + 0.38, -0.55, 0.0, COP, lv, tile=(13.05, 2.05))
        pbox(S, pl, ye - 0.16, yw + 0.16, V_DECK + 0.36, V_PARAPET, -0.7, 0.16, COP, lv, tile=(13.05, 2.05))
    for pl, wins in ((west, wins_w), (east, wins_e)):
        for h in wins:
            shed_window_dress(S, G, pl, h, lv, pick)
    for (w0, w1, e0, e1) in portals:
        tunnel(S, L, w0, w1, e0, e1, yw, ye, lv)
        portal_dress(S, G, L, west, w0, w1, lv)
        portal_dress(S, G, L, east, e0, e1, lv)
    if lv.n < 2:
        span = yw - ye
        for t in (0.34, 0.66):
            yc = ye + span * t
            z1 = V_DECK + 0.85
            box(S, xs + 6, xn - 6, yc - 2.4, yc + 2.4, V_DECK - 0.02, z1, COP, lv, no=("+z",), tile=(13.05, 2.05))
            gflat(G, xs + 6, xn - 6, yc - 2.4, yc + 2.4, z1, W_PANE_C, (2.4, 7.2)[lv.n])


# ---------------------------------------------------------------------------
# Build, collision, counts
# ---------------------------------------------------------------------------

def build(level):
    lv = Level(level)
    S, G, L = Acc(), Acc(), Acc()
    col = Acc() if level == 0 else None
    build_shed(S, G, L, lv)
    build_house(S, G, L, lv)
    if col is not None:
        build_collision(col)
    return S, G, L, col


def build_collision(col):
    """House plus the shed in three blocks so the two streets stay open (union of the skewed mouths)."""
    lv = Level(2)
    box(col, MX(HS), MX(HN), MY(HE), MY(HW), 0.0, CORNICE, LIM, lv, plain=True)
    gaps = ((min(MKT_W[0], MKT_E[0]), max(MKT_W[1], MKT_E[1])), (min(RAY_W[0], RAY_E[0]), max(RAY_W[1], RAY_E[1])))
    cuts = [VS, gaps[0][0], gaps[0][1], gaps[1][0], gaps[1][1], VN]
    for i in range(0, len(cuts), 2):
        box(col, MX(cuts[i]), MX(cuts[i + 1]), MY(VE), MY(HE), 0.0, V_PARAPET, BRK, lv, plain=True)


def count_only():
    caps = (50000, 15000, 3000)
    lat, lon = origin_latlon()
    print(f"origin lat {lat:.8f} lon {lon:.8f} heading {((BEARING - 90) % 360):.3f}")
    worst = 0
    for level, cap in enumerate(caps):
        S, G, L, col = build(level)
        total = S.tris + G.tris + L.tris
        worst |= total > cap
        print(f"LOD{level} masonry {S.tris} windows {G.tris} lamps {L.tris} sum {total} col {col.tris if col else 0} {'OK' if total <= cap else 'OVER'} cap {cap}")
    return int(worst)


# ---------------------------------------------------------------------------
# Blender
# ---------------------------------------------------------------------------

def make_textures(tex, force=False):
    names = ("main-basecolor.png", "main-normal.png", "main-orm.png", "windows-basecolor.png")
    if force or any(not os.path.exists(os.path.join(tex, n)) for n in names):
        import penn_textures as T   # needs numpy + Pillow, so it runs outside Blender: python3 build_penn.py

        T.build_atlas(tex, ATLAS_REGIONS)
        T.build_glass(tex, GLASS_REGIONS)
        print("textures", tex)


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
            uv.data[li].uv = acc.UV[mesh.loops[li].vertex_index]
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


def _load_image(tex, filename, noncolor):
    import bpy

    image = bpy.data.images.load(os.path.join(tex, filename))
    image.colorspace_settings.name = "Non-Color" if noncolor else "sRGB"
    return image


def make_main_material(tex):
    import bpy

    mat = bpy.data.materials.new(MAIN_MAT)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])

    def img_node(filename, noncolor, y):
        node = nodes.new("ShaderNodeTexImage")
        node.image = _load_image(tex, filename, noncolor)
        node.location = (-680, y)
        return node

    base = img_node("main-basecolor.png", False, 220)
    orm = img_node("main-orm.png", True, -40)
    nor = img_node("main-normal.png", True, -320)
    links.new(base.outputs["Color"], bsdf.inputs["Base Color"])
    sep = nodes.new("ShaderNodeSeparateColor")
    links.new(orm.outputs["Color"], sep.inputs["Color"])
    links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    links.new(sep.outputs["Blue"], bsdf.inputs["Metallic"])
    nmap = nodes.new("ShaderNodeNormalMap")
    nmap.inputs["Strength"].default_value = 0.8
    links.new(nor.outputs["Color"], nmap.inputs["Color"])
    links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    occ = nodes.new("ShaderNodeGroup")
    occ.node_tree = _gltf_occlusion_group()
    links.new(sep.outputs["Red"], occ.inputs["Occlusion"])
    return mat


def make_window_material(tex):
    import bpy

    mat = bpy.data.materials.new(WIN_MAT)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    node = nodes.new("ShaderNodeTexImage")
    node.image = _load_image(tex, "windows-basecolor.png", False)
    links.new(node.outputs["Color"], bsdf.inputs["Base Color"])
    links.new(node.outputs["Color"], bsdf.inputs["Emission Color"])
    bsdf.inputs["Emission Strength"].default_value = 0.45
    bsdf.inputs["Roughness"].default_value = 0.30
    bsdf.inputs["Metallic"].default_value = 0.0
    return mat


def make_lamp_material():
    import bpy

    mat = bpy.data.materials.new(LAMP_MAT)
    mat.use_nodes = True
    mat.use_backface_culling = True
    nt = mat.node_tree
    nodes, links = nt.nodes, nt.links
    nodes.clear()
    out = nodes.new("ShaderNodeOutputMaterial")
    bsdf = nodes.new("ShaderNodeBsdfPrincipled")
    links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    bsdf.inputs["Base Color"].default_value = (0.16, 0.13, 0.09, 1)
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.76, 0.44, 1)
    bsdf.inputs["Emission Strength"].default_value = 1.5
    bsdf.inputs["Roughness"].default_value = 0.35
    return mat


def build_scene():
    import bpy

    tex = os.path.join(HERE, "textures")
    make_textures(tex, force=bool(os.environ.get("PENN_TEXTURES")))
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for mesh in list(bpy.data.meshes):
        bpy.data.meshes.remove(mesh)
    for mat in list(bpy.data.materials):
        bpy.data.materials.remove(mat)
    scene = bpy.context.scene
    scene.unit_settings.system = "METRIC"
    scene.unit_settings.scale_length = 1.0
    main_mat, win_mat, lamp_mat = make_main_material(tex), make_window_material(tex), make_lamp_material()

    repo = os.path.abspath(os.path.join(HERE, "..", "..", "..", ".."))
    public = os.path.join(repo, "public", "landmarks", "newark", SLUG)
    os.makedirs(public, exist_ok=True)
    for level in (0, 1, 2):
        S, G, L, col = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        acc_object(f"masonry-lod{level}", S, main_mat).parent = parent
        acc_object(f"windows-lod{level}", G, win_mat).parent = parent
        if L.tris:
            acc_object(f"lamps-lod{level}", L, lamp_mat).parent = parent
        if col is not None:
            acc_object(f"{SLUG}_COL", col, None).parent = parent
        print(f"LOD{level} tris {S.tris + G.tris + L.tris} (masonry {S.tris} windows {G.tris} lamps {L.tris} col {col.tris if col else 0})")
    for img in list(bpy.data.images):
        if img.name in ("Render Result", "Viewer Node"):
            bpy.data.images.remove(img)

    out_path = os.environ.get("PENN_OUT") or os.path.join(public, f"{SLUG}.glb")
    kw = dict(filepath=out_path, export_format="GLB", export_yup=True, export_apply=True, export_cameras=False,
              export_lights=False, export_materials="EXPORT", export_normals=True, export_texcoords=True, use_selection=False)
    try:
        bpy.ops.export_scene.gltf(export_image_format="JPEG", export_jpeg_quality=90, **kw)
    except TypeError:
        bpy.ops.export_scene.gltf(**kw)
    print("glb", out_path, os.path.getsize(out_path))


if __name__ == "__main__":
    try:
        import bpy  # noqa: F401
        in_blender = True
    except ImportError:
        in_blender = False
    if not in_blender:
        if "--counts" in sys.argv:
            sys.exit(count_only())
        make_textures(os.path.join(HERE, "textures"), force=True)
    else:
        build_scene()
