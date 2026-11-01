#!/usr/bin/env python3
"""Wars of America, Military Park, Newark. Exterior only.

Own work for the City project. Metres, Blender Z-up. The glTF export is +Y up.
The long face toward the sword (the primary elevation) faces Blender +Y.

    python3 build_monument.py            # write textures/*.png
    python3 build_monument.py --counts   # triangle counts, no Blender
    blender -b --factory-startup --python build_monument.py

Dimensions from the National Register nomination (ref. 94001257): the monument
on its granite coping is 42 ft long, 18 ft wide and 17 ft high. Forty-two
human figures and two horses. Figures are an original simplified massing of
that public-domain group, not portraits and not a scan.

No Google imagery. No paid add-ons. Run with --factory-startup.
"""

from __future__ import annotations

import math
import os
import random
import sys

FT = 0.3048
LENGTH = 42.0 * FT
WIDTH = 18.0 * FT
HEIGHT = 17.0 * FT
PLINTH_TOP = 1.52
HALF_L = LENGTH * 0.5
HALF_W = WIDTH * 0.5

# Atlas rectangles (u, v, w, h). v is the bottom of the region.
GRANITE = (0.00, 0.02, 0.56, 0.62)
CAP = (0.00, 0.66, 0.56, 0.30)
BRONZE = (0.58, 0.02, 0.40, 0.78)
DARK = (0.58, 0.82, 0.20, 0.16)

SLUG = "wars-of-america"
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


def add_quad_uv(acc, p0, p1, p2, p3, uvs, hint):
    n = _normal(p0, p1, p2)
    if n is None:
        n = _normal(p0, p2, p3)
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


def _region_uvs(region):
    u, v, w, h = region
    return ((u, v), (u + w, v), (u + w, v + h), (u, v + h))


def world_metal_uv(p, region):
    u0, v0, w, h = region
    u = u0 + (0.08 + (p[0] + 7.0) / 15.0) * w
    v = v0 + (0.04 + p[2] / 6.2) * h
    return (min(u0 + w - 0.001, max(u0, u)), min(v0 + h - 0.001, max(v0, v)))


def add_quad(acc, p0, p1, p2, p3, region, hint):
    if region is BRONZE or region is DARK:
        uvs = [world_metal_uv(p, region) for p in (p0, p1, p2, p3)]
    else:
        uvs = _region_uvs(region)
    add_quad_uv(acc, p0, p1, p2, p3, uvs, hint)


def rot_point(p, yaw, pitch):
    x, y, z = p
    cp, sp = math.cos(pitch), math.sin(pitch)
    y, z = y * cp - z * sp, y * sp + z * cp
    cy, sy = math.cos(yaw), math.sin(yaw)
    x, y = x * cy - y * sy, x * sy + y * cy
    return (x, y, z)


def xform(p, origin, yaw, pitch=0.0):
    r = rot_point(p, yaw, pitch)
    return (r[0] + origin[0], r[1] + origin[1], r[2] + origin[2])


def add_box(acc, center, size, region, yaw=0.0, pitch=0.0, origin=(0, 0, 0), body_yaw=0.0):
    hx, hy, hz = size[0] * 0.5, size[1] * 0.5, size[2] * 0.5
    local = []
    for z in (-hz, hz):
        for y in (-hy, hy):
            for x in (-hx, hx):
                local.append((center[0] + x, center[1] + y, center[2] + z))
    pts = []
    for p in local:
        spun = rot_point(p, yaw, pitch)
        pts.append(xform(spun, origin, body_yaw, 0.0))
    # 0 (- - -) 1 (+ - -) 2 (- + -) 3 (+ + -) 4 (- - +) 5 (+ - +) 6 (- + +) 7 (+ + +)
    faces = (
        (0, 2, 3, 1, (0, 0, -1)),
        (4, 5, 7, 6, (0, 0, 1)),
        (0, 1, 5, 4, (0, -1, 0)),
        (2, 6, 7, 3, (0, 1, 0)),
        (0, 4, 6, 2, (-1, 0, 0)),
        (1, 3, 7, 5, (1, 0, 0)),
    )
    for a, b, c, d, hint in faces:
        rh = rot_point(hint, yaw, pitch)
        rh = rot_point(rh, body_yaw, 0.0)
        add_quad(acc, pts[a], pts[b], pts[c], pts[d], region, rh)


def add_tri(acc, p0, p1, p2, region, hint):
    n = _normal(p0, p1, p2)
    if n is None:
        return
    if vdot(n, hint) < 0:
        n = (-n[0], -n[1], -n[2])
        p0, p2 = p2, p0
    if region is BRONZE or region is DARK:
        uvs = [world_metal_uv(p, region) for p in (p0, p1, p2)]
    else:
        tile = _region_uvs(region)
        uvs = (tile[0], tile[1], tile[2])
    ids = [acc.add(p, n, uv) for p, uv in zip((p0, p1, p2), uvs)]
    acc.tri(ids[0], ids[1], ids[2])


def add_prism(acc, p0, p1, radius, sides, region):
    axis = vsub(p1, p0)
    direction = vnorm(axis)
    tmp = (0.0, 0.0, 1.0) if abs(direction[2]) < 0.85 else (1.0, 0.0, 0.0)
    side = vnorm(vcross(direction, tmp))
    up = vnorm(vcross(side, direction))
    rings = []
    for p in (p0, p1):
        ring = []
        for i in range(sides):
            a = 2.0 * math.pi * i / sides
            off = vadd(vscale(side, math.cos(a) * radius), vscale(up, math.sin(a) * radius))
            ring.append(vadd(p, off))
        rings.append(ring)
    for i in range(sides):
        j = (i + 1) % sides
        a = 2.0 * math.pi * (i + 0.5) / sides
        hint = vadd(vscale(side, math.cos(a)), vscale(up, math.sin(a)))
        add_quad(acc, rings[0][i], rings[0][j], rings[1][j], rings[1][i], region, hint)
    for ring, center, sgn in ((rings[0], p0, -1.0), (rings[1], p1, 1.0)):
        hint = vscale(direction, sgn)
        for i in range(sides):
            j = (i + 1) % sides
            if sgn > 0:
                add_tri(acc, center, ring[i], ring[j], region, hint)
            else:
                add_tri(acc, center, ring[j], ring[i], region, hint)


def rock_z(x, y):
    """Top of the bronze mound. None outside the rocky footprint."""
    ax, ay = 5.85, 2.18
    nx = x / ax
    ny = y / ay
    r2 = nx * nx + ny * ny
    if r2 > 1.0:
        return None
    edge = max(0.0, 1.0 - r2)
    h = (edge ** 0.62) * 1.28
    h += 0.22 * math.exp(-((x - 0.35) ** 2) / 4.2 - ((y - 0.15) ** 2) / 1.5)
    h += 0.10 * math.sin(x * 1.45 + 0.4) * edge
    h += 0.06 * math.sin(x * 2.8 + y * 1.7)
    # The sword face (+Y) falls off a little faster, like the photos.
    if y > 0:
        h *= 1.0 - 0.08 * (y / ay)
    return PLINTH_TOP + h


def _foot(x, y):
    z = rock_z(x, y)
    if z is not None:
        return x, y, z
    for _ in range(10):
        x *= 0.9
        y *= 0.85
        z = rock_z(x, y)
        if z is not None:
            return x, y, z
    return x, y, PLINTH_TOP + 0.15


def figure_specs():
    """42 figures. yaw degrees, 0 faces +Y (the sword)."""
    rows = [
        # Left bank, mostly in profile, moving toward the horses.
        (-4.85, 0.72, 82, 2.02, "soldier", "climb"),
        (-4.40, 1.05, 96, 1.92, "soldier", "march"),
        (-3.95, 0.48, 68, 2.12, "soldier", "reach"),
        (-3.55, 1.15, 104, 1.98, "soldier", "climb"),
        (-3.20, 0.28, 58, 2.18, "officer", "cane"),
        (-4.95, -0.15, 88, 1.88, "soldier", "march"),
        (-4.35, -0.42, 112, 1.96, "man", "stand"),
        (-3.85, -0.72, 78, 1.84, "soldier", "reach"),
        (-3.30, -0.18, 90, 2.06, "soldier", "march"),
        (-2.70, 0.95, 42, 2.22, "officer", "stand"),
        (-2.25, 0.42, 18, 2.28, "officer", "cane"),
        (-2.85, -0.88, 128, 1.90, "soldier", "stand"),
        # Crest around the horses. Leaders face the sword.
        (-1.55, 0.92, 8, 2.34, "officer", "cane"),
        (-1.05, 0.38, -12, 2.16, "officer", "stand"),
        (-0.65, 1.12, 22, 2.02, "soldier", "reach"),
        (-1.25, -0.28, 28, 2.08, "man", "stand"),
        (0.70, 1.05, -8, 1.98, "soldier", "reach"),
        (1.45, 0.82, 12, 2.04, "soldier", "reach"),
        (0.15, -0.05, 4, 2.12, "officer", "stand"),
        (1.55, -0.05, -16, 2.08, "man", "hold"),
        # Right bank: farewells, a nurse, civilians.
        (2.05, 1.05, -72, 2.02, "man", "hold"),
        (2.45, 0.62, -98, 1.88, "woman", "hold"),
        (2.85, 1.12, -84, 1.28, "child", "stand"),
        (3.25, 0.48, -62, 2.08, "nurse", "reach"),
        (3.65, 1.02, -108, 1.98, "worker", "stand"),
        (4.10, 0.68, -88, 1.92, "man", "hold"),
        (4.50, 1.08, -74, 2.02, "woman", "stand"),
        (4.85, 0.42, -96, 1.82, "man", "stand"),
        (2.30, -0.08, -48, 2.12, "soldier", "march"),
        (2.95, -0.38, -118, 1.96, "man", "reach"),
        (3.55, -0.02, -80, 1.88, "soldier", "stand"),
        (4.20, -0.48, -100, 2.02, "worker", "stand"),
        (4.70, -0.18, -70, 1.78, "man", "hold"),
        (2.65, 1.28, -36, 2.18, "officer", "cane"),
        # Far side of the mound, so the back is not a blank rock.
        (-3.40, -1.12, 188, 1.96, "soldier", "march"),
        (-2.15, -1.22, 204, 1.90, "man", "stand"),
        (-0.70, -1.08, 168, 2.06, "soldier", "reach"),
        (0.55, -1.20, 192, 1.94, "man", "stand"),
        (1.90, -1.05, 158, 1.86, "woman", "hold"),
        (3.15, -1.15, 184, 2.00, "soldier", "march"),
        (4.25, -0.95, 150, 1.82, "man", "stand"),
        (-4.45, -0.85, 206, 1.88, "soldier", "climb"),
    ]
    if len(rows) != 42:
        raise RuntimeError(f"expected 42 figures, got {len(rows)}")
    return rows


def _style_bits(style):
    helmet = style == "soldier"
    brim = style == "officer"
    cap = style in ("man", "nurse")
    skirt = style in ("woman", "nurse")
    coat = style in ("officer", "soldier", "woman", "nurse")
    return helmet, brim, cap, skirt, coat


def _hand_local(side, pose, H, torso_w):
    """Hand position in figure space. +Y is forward, +Z is up."""
    sx = side * max(0.12, torso_w * 0.35)
    if pose == "march":
        fwd = 0.18 * H if side < 0 else -0.02 * H
        return (sx, fwd, 0.42 * H)
    if pose == "reach":
        if side > 0:
            return (sx * 0.4, 0.36 * H, 0.62 * H)
        return (sx, 0.04 * H, 0.48 * H)
    if pose == "cane" and side > 0:
        return (0.10 * H, 0.14 * H, 0.32 * H)
    if pose == "hold":
        return (side * 0.06 * H, 0.16 * H, 0.52 * H)
    if pose == "climb":
        return (sx * 0.45, 0.22 * H, 0.92 * H)
    return (sx, 0.05 * H, 0.46 * H)


def add_figure(acc, x, y, z, yaw_deg, height, style, pose, lod):
    yaw = math.radians(yaw_deg)
    pitch = 0.42 if pose == "climb" else 0.0
    origin = (x, y, z - 0.08)
    H = height
    region = BRONZE
    helmet, brim, cap, skirt, coat = _style_bits(style)
    if lod >= 2:
        add_box(acc, (0, 0, H * 0.48), (0.42, 0.32, H * 0.78), region, origin=origin, body_yaw=yaw)
        add_box(acc, (0, 0.02, H * 0.90), (0.22, 0.20, 0.24), region, origin=origin, body_yaw=yaw)
        return
    hip = 0.52 * H
    shoulder = 0.78 * H
    chest = 0.64 * H
    torso_w = 0.40 if style != "child" else 0.28
    torso_d = 0.24 if not coat else 0.28
    if skirt:
        torso_d += 0.04
    if lod == 1:
        add_box(acc, (-0.09, 0, hip * 0.48), (0.12, 0.12, hip * 0.9), region, origin=origin, body_yaw=yaw)
        add_box(acc, (0.09, 0, hip * 0.48), (0.12, 0.12, hip * 0.9), region, origin=origin, body_yaw=yaw)
        add_box(
            acc,
            (0, 0, (hip + shoulder) * 0.5),
            (torso_w, torso_d, shoulder - hip + 0.08),
            region,
            pitch=pitch,
            origin=origin,
            body_yaw=yaw,
        )
        add_box(acc, (0, 0.02, H * 0.90), (0.20, 0.18, 0.22), region, pitch=pitch * 0.3, origin=origin, body_yaw=yaw)
        return

    # Legs.
    for sx in (-1, 1):
        spread = 0.09 * H
        fwd = 0.04 * H * sx if pose == "march" else 0.0
        add_box(
            acc,
            (sx * spread, fwd, hip * 0.50),
            (0.11 * H / 2.1, 0.12 * H / 2.1, hip * 0.92),
            region,
            origin=origin,
            body_yaw=yaw,
        )
        add_box(
            acc,
            (sx * spread, fwd + 0.03, 0.05),
            (0.10, 0.18, 0.08),
            region,
            origin=origin,
            body_yaw=yaw,
        )
    body_h = shoulder - hip
    add_box(
        acc,
        (0, 0, hip + body_h * 0.45),
        (torso_w, torso_d + (0.06 if coat else 0.0), body_h),
        region,
        pitch=pitch,
        origin=origin,
        body_yaw=yaw,
    )
    if coat:
        add_box(
            acc,
            (0, -0.02, hip * 0.72),
            (torso_w * 1.08, torso_d * 1.15, hip * 0.55),
            region,
            origin=origin,
            body_yaw=yaw,
        )
    if skirt:
        add_box(
            acc,
            (0, 0, hip * 0.42),
            (0.36, 0.32, hip * 0.78),
            region,
            origin=origin,
            body_yaw=yaw,
        )
    # Head.
    head_z = H * 0.90
    add_prism_local(acc, (0, 0.0, head_z - 0.08), (0, 0.0, head_z + 0.12), 0.105, 7, region, origin, yaw, pitch * 0.25)
    # Arms are prisms from the shoulder through the elbow to the hand, so they
    # stay attached. Poses only move the hand.
    for side in (-1, 1):
        shoulder_p = (side * torso_w * 0.55, 0.02, shoulder - 0.02)
        hand = _hand_local(side, pose, H, torso_w)
        elbow = (
            (shoulder_p[0] + hand[0]) * 0.5,
            (shoulder_p[1] + hand[1]) * 0.45,
            (shoulder_p[2] + hand[2]) * 0.5 - 0.05,
        )
        add_prism_local(acc, shoulder_p, elbow, 0.055, 5, region, origin, yaw, 0.0)
        add_prism_local(acc, elbow, hand, 0.042, 5, region, origin, yaw, 0.0)
    if helmet:
        add_box(acc, (0, 0.0, head_z + 0.10), (0.24, 0.26, 0.10), region, origin=origin, body_yaw=yaw)
        add_box(acc, (0, 0.10, head_z + 0.02), (0.22, 0.08, 0.08), DARK, origin=origin, body_yaw=yaw)
    elif brim:
        add_box(acc, (0, 0.02, head_z + 0.12), (0.26, 0.26, 0.06), region, origin=origin, body_yaw=yaw)
        add_box(acc, (0, 0.10, head_z + 0.08), (0.28, 0.10, 0.025), DARK, origin=origin, body_yaw=yaw)
    elif cap:
        add_box(acc, (0, 0.02, head_z + 0.12), (0.20, 0.20, 0.07), region, origin=origin, body_yaw=yaw)
    if pose == "cane":
        add_prism_local(
            acc,
            (0.18, 0.12, 0.05),
            (0.16, 0.20, shoulder * 0.55),
            0.018,
            5,
            DARK,
            origin,
            yaw,
            0.0,
        )
    if style == "soldier" and pose in ("march", "reach", "climb"):
        grip = _hand_local(1, pose, H, torso_w)
        muzzle = (grip[0] + 0.05, grip[1] + 0.42, grip[2] + 0.08)
        add_prism_local(acc, grip, muzzle, 0.02, 4, DARK, origin, yaw, 0.0)


def add_prism_local(acc, p0, p1, radius, sides, region, origin, body_yaw, pitch):
    a = xform(rot_point(p0, 0.0, pitch), origin, body_yaw)
    b = xform(rot_point(p1, 0.0, pitch), origin, body_yaw)
    add_prism(acc, a, b, radius, sides, region)


def add_horse(acc, x, y, z, yaw_deg, scale, rearing, lod):
    yaw = math.radians(yaw_deg)
    origin = (x, y, z - 0.05)
    region = BRONZE
    body_z = 1.15 * scale
    body_l = 1.45 * scale
    if rearing:
        body_pitch = -0.35
    else:
        body_pitch = -0.06
    if lod >= 2:
        add_box(acc, (0, 0, body_z), (0.42 * scale, body_l, 0.48 * scale), region, pitch=body_pitch, origin=origin, body_yaw=yaw)
        add_box(acc, (0, body_l * 0.45, body_z + 0.7 * scale), (0.22 * scale, 0.4 * scale, 0.28 * scale), region, origin=origin, body_yaw=yaw)
        return
    sides = 6 if lod == 1 else 8
    add_box(
        acc,
        (0, 0.05 * scale, body_z),
        (0.58 * scale, body_l * 1.12, 0.56 * scale),
        region,
        pitch=body_pitch,
        origin=origin,
        body_yaw=yaw,
    )
    # Neck and head.
    neck_base = (0, body_l * 0.42, body_z + 0.12 * scale)
    neck_top = (0, body_l * 0.62, body_z + 0.72 * scale)
    if rearing:
        neck_top = (0, body_l * 0.48, body_z + 0.95 * scale)
    add_prism_local(acc, neck_base, neck_top, 0.20 * scale, sides, region, origin, yaw, 0.0)
    head_c = (neck_top[0], neck_top[1] + 0.28 * scale, neck_top[2] + 0.04 * scale)
    add_box(acc, head_c, (0.26 * scale, 0.62 * scale, 0.30 * scale), region, origin=origin, body_yaw=yaw)
    # Ears.
    add_box(
        acc,
        (0.06 * scale, head_c[1], head_c[2] + 0.16 * scale),
        (0.05 * scale, 0.06 * scale, 0.16 * scale),
        region,
        origin=origin,
        body_yaw=yaw,
    )
    add_box(
        acc,
        (-0.06 * scale, head_c[1], head_c[2] + 0.16 * scale),
        (0.05 * scale, 0.06 * scale, 0.16 * scale),
        region,
        origin=origin,
        body_yaw=yaw,
    )
    # Legs run from the belly down to the rock, or forward when a hoof is lifted.
    hips = ((-0.14, -0.42), (0.14, -0.42), (-0.14, 0.38), (0.14, 0.38))
    for sx, sy in hips:
        front = sy > 0
        top = (sx * scale, sy * scale, body_z - 0.18 * scale)
        if rearing and front:
            hoof = (sx * scale, sy * scale + 0.55 * scale, body_z + 0.15 * scale)
        else:
            hoof = (sx * scale, sy * scale, 0.04)
        add_prism_local(acc, top, hoof, 0.07 * scale, 5 if lod == 0 else 4, region, origin, yaw, 0.0)


def add_plinth(acc, lod):
    courses = 4 if lod == 0 else (3 if lod == 1 else 1)
    z0 = 0.0
    height = PLINTH_TOP - 0.16
    ch = height / courses
    shrink = 0.0 if lod < 2 else 0.0
    for i in range(courses):
        inset = i * 0.015
        z1 = z0 + ch
        hx = HALF_L - inset
        hy = HALF_W - inset
        region = GRANITE
        # One quad per face per course so the ashlar strip maps cleanly.
        add_quad(acc, (-hx, -hy, z0), (hx, -hy, z0), (hx, -hy, z1), (-hx, -hy, z1), region, (0, -1, 0))
        add_quad(acc, (hx, hy, z0), (-hx, hy, z0), (-hx, hy, z1), (hx, hy, z1), region, (0, 1, 0))
        add_quad(acc, (-hx, hy, z0), (-hx, -hy, z0), (-hx, -hy, z1), (-hx, hy, z1), region, (-1, 0, 0))
        add_quad(acc, (hx, -hy, z0), (hx, hy, z0), (hx, hy, z1), (hx, -hy, z1), region, (1, 0, 0))
        z0 = z1
    # Cap, slightly proud.
    cap_z0 = z0
    cap_z1 = PLINTH_TOP
    hx = HALF_L + 0.06
    hy = HALF_W + 0.05
    add_quad(acc, (-hx, -hy, cap_z0), (hx, -hy, cap_z0), (hx, -hy, cap_z1), (-hx, -hy, cap_z1), CAP, (0, -1, 0))
    add_quad(acc, (hx, hy, cap_z0), (-hx, hy, cap_z0), (-hx, hy, cap_z1), (hx, hy, cap_z1), CAP, (0, 1, 0))
    add_quad(acc, (-hx, hy, cap_z0), (-hx, -hy, cap_z0), (-hx, -hy, cap_z1), (-hx, hy, cap_z1), CAP, (-1, 0, 0))
    add_quad(acc, (hx, -hy, cap_z0), (hx, hy, cap_z0), (hx, hy, cap_z1), (hx, -hy, cap_z1), CAP, (1, 0, 0))
    add_quad(acc, (-hx, -hy, cap_z1), (hx, -hy, cap_z1), (hx, hy, cap_z1), (-hx, hy, cap_z1), CAP, (0, 0, 1))
    # Bottom, so the mesh is closed.
    add_quad(acc, (-HALF_L, hy, 0.0), (HALF_L, hy, 0.0), (HALF_L, -hy, 0.0), (-HALF_L, -hy, 0.0), GRANITE, (0, 0, -1))
    del shrink


def add_rock(acc, lod):
    nu, nv = ((44, 16), (18, 8), (8, 4))[lod]
    ax, ay = 5.95, 2.22

    def sample(x, y):
        z = rock_z(x, y)
        return PLINTH_TOP if z is None else z

    xs = [-ax + 2 * ax * i / nu for i in range(nu + 1)]
    ys = [-ay + 2 * ay * j / nv for j in range(nv + 1)]
    heights = [[sample(x, y) for x in xs] for y in ys]
    for j in range(nv):
        for i in range(nu):
            p00 = (xs[i], ys[j], heights[j][i])
            p10 = (xs[i + 1], ys[j], heights[j][i + 1])
            p11 = (xs[i + 1], ys[j + 1], heights[j + 1][i + 1])
            p01 = (xs[i], ys[j + 1], heights[j + 1][i])
            # Skip quads that sit flat on the cap. They would z-fight the stone.
            if max(p00[2], p10[2], p11[2], p01[2]) <= PLINTH_TOP + 0.02:
                continue
            add_quad(acc, p00, p10, p11, p01, BRONZE, (0, 0, 1))


def add_lamps(acc, lod):
    n = 5 if lod == 0 else (3 if lod == 1 else 0)
    if n == 0:
        return
    ys = HALF_W + 0.22
    for i in range(n):
        x = -HALF_L * 0.72 + (HALF_L * 1.44) * (i / max(1, n - 1))
        add_box(acc, (x, ys, 0.10), (0.16, 0.10, 0.08), DARK)
        add_box(acc, (x, ys - 0.01, 0.16), (0.10, 0.07, 0.035), BRONZE)
    # The lens is a separate mesh; this function only builds housings.
    # Lenses are added by add_lamp_lenses.


def add_lamp_lenses(acc, lod):
    n = 5 if lod == 0 else (3 if lod == 1 else 0)
    ys = HALF_W + 0.22
    for i in range(n):
        x = -HALF_L * 0.72 + (HALF_L * 1.44) * (i / max(1, n - 1))
        add_box(acc, (x, ys - 0.02, 0.175), (0.07, 0.045, 0.02), BRONZE)


def add_collision(acc):
    add_box(acc, (0, 0, PLINTH_TOP * 0.5), (LENGTH, WIDTH, PLINTH_TOP), GRANITE)
    add_box(acc, (0, 0, PLINTH_TOP + 0.9), (11.2, 4.2, 1.8), BRONZE)
    add_box(acc, (0.3, 0.1, 4.0), (3.2, 2.2, 2.2), BRONZE)


def build(level):
    body = Acc()
    lamps = Acc()
    add_plinth(body, level)
    add_rock(body, level)
    for spec in figure_specs():
        x, y, yaw, h, style, pose = spec
        x, y, z = _foot(x, y)
        add_figure(body, x, y, z, yaw, h, style, pose, level)
    hx, hy, hz = _foot(0.05, 0.22)
    add_horse(body, hx, hy, hz, -6, 0.90, True, level)
    hx, hy, hz = _foot(1.15, 0.05)
    add_horse(body, hx, hy, hz, 8, 0.86, False, level)
    add_lamps(body, level)
    add_lamp_lenses(lamps, level)
    col = None
    if level == 0:
        col = Acc()
        add_collision(col)
    return body, lamps, col


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
    rng = random.Random(1926)
    base = Image.new("RGB", (size, size), (118, 116, 112))
    orm = Image.new("RGB", (size, size), (255, 200, 0))
    height = Image.new("L", (size, size), 128)
    draw_b = ImageDraw.Draw(base)
    draw_o = ImageDraw.Draw(orm)
    draw_h = ImageDraw.Draw(height)

    # Granite ashlar: four courses of blocks, cool gray, mortar joints.
    x0, y0, x1, y1 = _region_pixels(GRANITE, size)
    courses = 4
    blocks = 8
    ch = (y1 - y0) / courses
    bw = (x1 - x0) / blocks
    for cy in range(courses):
        shift = 0.5 * bw if cy % 2 else 0.0
        for bx in range(-1, blocks + 1):
            tone = 132 + rng.randint(-14, 16)
            warm = rng.randint(-6, 8)
            col = (tone + warm, tone, tone - 4)
            px0 = int(x0 + bx * bw + shift + 3)
            px1 = int(x0 + (bx + 1) * bw + shift - 2)
            py0 = int(y0 + cy * ch + 3)
            py1 = int(y0 + (cy + 1) * ch - 2)
            draw_b.rectangle([px0, py0, px1, py1], fill=col)
            draw_h.rectangle([px0, py0, px1, py1], fill=150 + rng.randint(-8, 8))
            # Speckle.
            for _ in range(18):
                sx = rng.randint(px0 + 2, max(px0 + 3, px1 - 2))
                sy = rng.randint(py0 + 2, max(py0 + 3, py1 - 2))
                d = rng.randint(-18, 10)
                draw_b.point((sx, sy), fill=(col[0] + d, col[1] + d, col[2] + d))
        rough = 188 + rng.randint(-8, 8)
        draw_o.rectangle([x0, int(y0 + cy * ch), x1 - 1, int(y0 + (cy + 1) * ch)], fill=(230, rough, 8))
    # Mortar reads darker and rougher.
    for cy in range(courses + 1):
        yy = int(y0 + cy * ch)
        draw_b.line([(x0, yy), (x1 - 1, yy)], fill=(78, 76, 72), width=4)
        draw_h.line([(x0, yy), (x1 - 1, yy)], fill=40, width=5)
    for bx in range(blocks + 1):
        xx = int(x0 + bx * bw)
        draw_b.line([(xx, y0), (xx, y1 - 1)], fill=(78, 76, 72), width=3)
        draw_h.line([(xx, y0), (xx, y1 - 1)], fill=48, width=4)

    # Cap stone, larger slabs, a little lighter.
    x0, y0, x1, y1 = _region_pixels(CAP, size)
    draw_b.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(168, 166, 160))
    draw_o.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(240, 170, 6))
    draw_h.rectangle([x0, y0, x1 - 1, y1 - 1], fill=160)
    slab = (x1 - x0) // 4
    for i in range(5):
        xx = x0 + i * slab
        draw_b.line([(xx, y0), (xx, y1 - 1)], fill=(96, 94, 90), width=3)
        draw_h.line([(xx, y0), (xx, y1 - 1)], fill=50, width=4)

    # Bronze patina. Brown metal with vertical green streaks. Not a photo.
    x0, y0, x1, y1 = _region_pixels(BRONZE, size)
    pix = base.load()
    opix = orm.load()
    hpix = height.load()
    for y in range(y0, y1):
        for x in range(x0, x1):
            n = rng.random()
            streak = 0.5 + 0.5 * math.sin((x - x0) * 0.02 + (y - y0) * 0.004)
            drip = 0.5 + 0.5 * math.sin((y - y0) * 0.012)
            green = 0.25 + 0.35 * streak * drip
            r = int(72 + 22 * (1.0 - green) + n * 12)
            g = int(74 + 26 * green + n * 8)
            b = int(56 + 12 * green + n * 6)
            pix[x, y] = (max(0, min(255, r)), max(0, min(255, g)), max(0, min(255, b)))
            rough = int(92 + 50 * (1 - green) + n * 20)
            metal = int(200 + 40 * (1 - green))
            ao = int(210 - 30 * drip)
            opix[x, y] = (ao, max(0, min(255, rough)), max(0, min(255, metal)))
            hpix[x, y] = int(128 + 12 * green + n * 8)

    # Dark metal for canes, rifles, lamp housings.
    x0, y0, x1, y1 = _region_pixels(DARK, size)
    draw_b.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(42, 40, 38))
    draw_o.rectangle([x0, y0, x1 - 1, y1 - 1], fill=(180, 110, 40))
    draw_h.rectangle([x0, y0, x1 - 1, y1 - 1], fill=140)

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
    caps = (50000, 15000, 3000)
    top = 0.0
    for level, name in ((0, "LOD0"), (1, "LOD1"), (2, "LOD2")):
        body, lamps, col = build(level)
        zs = [p[2] for p in body.V]
        xs = [p[0] for p in body.V]
        ys = [p[1] for p in body.V]
        total = body.tris + lamps.tris
        top = max(top, max(zs))
        print(
            f"{name} body {body.tris} lamps {lamps.tris} col {col.tris if col else 0} "
            f"sum {total} bounds x {min(xs):.2f}..{max(xs):.2f} "
            f"y {min(ys):.2f}..{max(ys):.2f} z {min(zs):.2f}..{max(zs):.2f}"
        )
        if total > caps[level]:
            print(f"OVER BUDGET {name} {total} > {caps[level]}", file=sys.stderr)
            return 1
    print(f"published {LENGTH:.3f} x {WIDTH:.3f} x {HEIGHT:.3f} m, mesh top {top:.3f} m, plinth {PLINTH_TOP:.2f}")
    return 0


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

    roots = []
    stats = []
    for level in (0, 1, 2):
        body, lamps, col = build(level)
        parent = bpy.data.objects.new(f"{SLUG}_LOD{level}", None)
        scene.collection.objects.link(parent)
        body_obj = acc_object(f"body-lod{level}", body, main_mat, smooth=False)
        body_obj.parent = parent
        if lamps.tris:
            lamp_obj = acc_object(f"uplights-lod{level}", lamps, lamp_mat, smooth=False)
            lamp_obj.parent = parent
        if col is not None:
            col_obj = acc_object(f"{SLUG}_COL", col, None, smooth=False)
            col_obj.parent = parent
        roots.append(parent)
        stats.append((level, body.tris, lamps.tris, col.tris if col else 0))
        print(f"LOD{level} tris {body.tris + lamps.tris} body {body.tris} lamps {lamps.tris}")

    blend_path = os.path.join(root, f"{SLUG}.blend")
    bpy.ops.wm.save_as_mainfile(filepath=blend_path, compress=True)
    bpy.ops.file.make_paths_relative()
    bpy.ops.wm.save_mainfile(compress=True)
    print("blend", blend_path, os.path.getsize(blend_path))

    raw = os.environ.get("WARS_RAW", "/tmp/wars-of-america-raw.glb")
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
    with open("/tmp/wars-of-america-stats.txt", "w", encoding="utf-8") as fh:
        for row in stats:
            fh.write(" ".join(str(v) for v in row) + "\n")

    shots = os.environ.get("WARS_SHOTS")
    if shots:
        render_shots(roots, shots)


def acc_object(name, acc, material, smooth):
    import bpy

    mesh = bpy.data.meshes.new(name + "-mesh")
    mesh.from_pydata(acc.V, [], [list(f) for f in acc.F])
    mesh.validate(clean_customdata=False)
    mesh.update()
    uv = mesh.uv_layers.new(name="UVMap")
    for poly in mesh.polygons:
        poly.use_smooth = smooth
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
    bsdf.inputs["Emission Color"].default_value = (1.0, 0.62, 0.28, 1.0)
    bsdf.inputs["Emission Strength"].default_value = 1.6
    bsdf.inputs["Roughness"].default_value = 0.35
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
    """EEVEE bands for the standing renders. Not exported. The glb stays PBR."""
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
    mat["standing_ramp"] = ramp.name
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
    """Toon bands plus an inverted-hull outline. Render only, after the glb export."""
    import bpy
    from mathutils import Vector

    bpy.context.view_layer.update()
    light = sun.matrix_world.to_3x3() @ Vector((0.0, 0.0, -1.0))
    light.normalize()
    src = bpy.data.materials.get(MAIN_MAT)
    image = _base_image(src)
    toon = _standing_toon(image, (light.x, light.y, light.z))
    _set_bands(toon, ((0.0, 0.34), (0.36, 0.62), (0.68, 1.0)))
    ink = _outline_material()
    swapped = []
    scene = bpy.context.scene
    for root in roots:
        for child in list(root.children):
            if child.type != "MESH" or not child.name.startswith("body-lod"):
                continue
            if child.data.materials:
                swapped.append((child, child.data.materials[0]))
                child.data.materials[0] = toon
            # Smooth only for the standing render, after the glb is written.
            # Crease ink then follows the forms instead of every flat quad.
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
    # Normals on a smoothed mesh catch creases. Depth catches the outer contour.
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
    bg.inputs[0].default_value = (0.55, 0.62, 0.70, 1)
    bg.inputs[1].default_value = 0.85

    sun_data = bpy.data.lights.new("sun", "SUN")
    sun_data.energy = 3.2
    sun_data.angle = 0.4
    sun = bpy.data.objects.new("sun", sun_data)
    scene.collection.objects.link(sun)
    sun.rotation_euler = (0.95, 0.15, 0.6)

    fill_data = bpy.data.lights.new("fill", "AREA")
    fill_data.energy = 180
    fill_data.size = 8
    fill = bpy.data.objects.new("fill", fill_data)
    scene.collection.objects.link(fill)
    _look_at(fill, (-6, 8, 6), (0, 0, 2))

    cam_data = bpy.data.cameras.new("cam")
    cam_data.lens = 42
    cam = bpy.data.objects.new("cam", cam_data)
    scene.collection.objects.link(cam)
    scene.camera = cam

    ground = bpy.data.meshes.new("ground")
    ground.from_pydata(
        [(-18, -14, -0.02), (18, -14, -0.02), (18, 14, -0.02), (-18, 14, -0.02)],
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
    standing = apply_standing_render(roots, sun, 0.055)

    def show(level):
        for i, root in enumerate(roots):
            _hide_tree(root, i != level)

    target = (0.0, 0.0, 2.3)
    shots = [
        ("front", (0.2, 16.5, 2.8), target),
        ("side", (16.5, 0.4, 3.0), target),
        ("back", (-0.3, -15.5, 2.8), (0.0, 0.0, 2.2)),
        ("three-quarter", (11.0, 12.0, 3.6), target),
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

    bg.inputs[0].default_value = (0.015, 0.02, 0.035, 1)
    bg.inputs[1].default_value = 0.35
    sun_data.energy = 0.35
    fill_data.energy = 40
    _set_bands(standing["toon"], ((0.0, 0.20), (0.40, 0.42), (0.70, 0.66)))
    _set_ink(standing["ink"], (0.75, 0.82, 0.92))
    for mat in bpy.data.materials:
        if mat.name != LAMP_MAT or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Emission Strength"].default_value = 18.0
    if not only or "night" in only.split(","):
        _look_at(cam, (9.5, 12.5, 3.2), target)
        scene.render.filepath = os.path.join(folder, "night.png")
        bpy.ops.render.render(write_still=True)
        print("shot night")
    for mat in bpy.data.materials:
        if mat.name != LAMP_MAT or not mat.use_nodes:
            continue
        for node in mat.node_tree.nodes:
            if node.type == "BSDF_PRINCIPLED":
                node.inputs["Emission Strength"].default_value = 1.6
    sun_data.energy = 3.2
    bg.inputs[0].default_value = (0.62, 0.66, 0.7, 1)
    bg.inputs[1].default_value = 0.9
    _set_bands(standing["toon"], ((0.0, 0.34), (0.36, 0.62), (0.68, 1.0)))
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
        if child.name.startswith("body-lod0"):
            body = child
    if body is not None:
        mod = body.modifiers.new("wire", "WIREFRAME")
        mod.thickness = 0.015
        mod.use_replace = True
        _look_at(cam, (11.0, 12.0, 3.6), target)
        scene.render.filepath = os.path.join(folder, "wire-lod0.png")
        bpy.ops.render.render(write_still=True)
        body.modifiers.remove(mod)
        print("shot wire")

    gobj.hide_render = True
    cam_data.type = "ORTHO"
    cam_data.ortho_scale = 28
    offsets = (-10.5, 0.0, 10.5)
    for root, dx in zip(roots, offsets):
        _hide_tree(root, False)
        root.location.x = dx
    _hide_outlines(roots, True)
    _look_at(cam, (0, 22, 2.4), (0, 0, 2.2))
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
