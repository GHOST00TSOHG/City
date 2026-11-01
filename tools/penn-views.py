#!/usr/bin/env python3
"""Camera views for Newark Penn Station, for tools/close-lm.mjs.

    python3 tools/penn-views.py out.json [group ...]

Coordinates are glTF-local metres around the model origin (x east-ish along the
tracks, y up, z toward the shed; the west front faces -Z). Each view is
[name, [cam], [target], lodIndex|null, lit]. lit=1 adds a bright fill light for
reading geometry; lit=0 is the game's night lighting.
Groups: orbit house shed closeups lods auto night all (default all).
"""
import json
import math
import os
import subprocess
import sys

HX0, HX1, HZ0, HZ1 = -12.4, 79.65, -57.54, -33.46  # station house plan
SX0, SX1, SZ1 = -185.86, 180.38, 40.87             # train shed plan (z from HZ1 to SZ1)
H = 19.9


def v(name, cam, tgt, lod=0, lit=1):
    return [name, [round(c, 2) for c in cam], [round(c, 2) for c in tgt], lod, lit]


def ring(prefix, cx, cz, rx, rz, h_cam, tgt_y, lod, lit, n=8):
    out = []
    names = ["front", "FR", "R", "BR", "back", "BL", "L", "FL"]
    for k in range(n):
        a = k * 2 * math.pi / n
        dx, dz = math.sin(a), -math.cos(a)  # k=0 is the -Z (west front) side
        out.append(v(f"{prefix}-{names[k]}", (cx + dx * rx, h_cam, cz + dz * rz), (cx, tgt_y, cz), lod, lit))
    return out


def main():
    out_path = sys.argv[1]
    groups = set(sys.argv[2:]) or {"all"}
    want = lambda g: "all" in groups or g in groups
    views = []
    hcx, hcz = (HX0 + HX1) / 2, (HZ0 + HZ1) / 2
    if want("orbit"):
        here = os.path.dirname(os.path.abspath(__file__))
        tmp = out_path + ".orbit.json"
        subprocess.run(["python3", os.path.join(here, "orbit.py"), str(SX0), str(SX1), "-61", "42", str(H), tmp], check=True, stdout=subprocess.DEVNULL)
        views += json.load(open(tmp))
        os.remove(tmp)
    if want("house"):
        views += ring("house-street", hcx, hcz, 78, 78, 1.7, 7, 0, 1)
        views += ring("house-high", hcx, hcz, 62, 62, 34, 6, 0, 1)
        views.append(v("house-top", (hcx + 0.01, 120, hcz + 0.01), (hcx, 0, hcz), 0, 1))
        views.append(v("house-front-flat", (hcx, 8, -125), (hcx, 9, -57), 0, 1))
        views.append(v("house-front-low", (hcx, 1.7, -75), (hcx, 12, -57), 0, 1))
    if want("shed"):
        views += ring("shed-street", 0, -4, 210, 90, 1.7, 7, 0, 1)
        views += ring("shed-high", 0, -4, 190, 80, 48, 5, 0, 1)
        views.append(v("shed-top", (0.01, 380, -4.01), (0, 0, -4), 0, 1))
    if want("closeups"):
        wf = HZ0  # west wall plane z
        views += [
            v("cu-window-bay1", (-3, 7, wf - 9), (-3, 8, wf), 0, 1),
            v("cu-window-bay1-oblique", (-12, 8, wf - 7), (-3, 8, wf), 0, 1),
            v("cu-window-bay2", (34, 7, wf - 9), (34, 8, wf), 0, 1),
            v("cu-window-lowsill", (30, 2.2, wf - 6), (30, 4.5, wf), 0, 1),
            v("cu-clock-arch", (13, 6, wf - 14), (13, 9, wf), 0, 1),
            v("cu-clock-pediment", (13, 12, wf - 10), (13, 17, wf), 0, 1),
            v("cu-sun-arch", (54, 6, wf - 14), (54, 9, wf), 0, 1),
            v("cu-doors", (76, 2.2, wf - 8), (76, 3, wf), 0, 1),
            v("cu-door-canopy", (70, 4.5, wf - 9), (76, 3.5, wf - 1.5), 0, 1),
            v("cu-cornice", (34, 10, wf - 5), (34, 15.5, wf), 0, 1),
            v("cu-cornice-up", (8, 5, wf - 3), (14, 16, wf + 1), 0, 1),
            v("cu-corner-SW", (HX0 - 9, 6, wf - 9), (HX0, 8, wf), 0, 1),
            v("cu-corner-SW-high", (HX0 - 7, 20, wf - 8), (HX0, 14, wf), 0, 1),
            v("cu-corner-NW", (HX1 + 9, 6, wf - 9), (HX1, 8, wf), 0, 1),
            v("cu-south-end", (HX0 - 16, 5, hcz), (HX0, 8, hcz), 0, 1),
            v("cu-north-end", (HX1 + 16, 5, hcz), (HX1, 8, hcz), 0, 1),
            v("cu-ground-line", (20, 0.45, wf - 4), (30, 0.5, wf), 0, 1),
            v("cu-ground-line-end", (HX0 - 4, 0.45, wf - 4), (HX0, 0.5, hcz), 0, 1),
            v("cu-roof-edge", (30, 24, wf - 6), (30, 16, wf + 4), 0, 1),
            v("cu-roof-clerestory", (30, 26, -30), (30, 17, -44), 0, 1),
            v("cu-roof-behind", (60, 24, -20), (60, 16, -40), 0, 1),
            v("cu-shed-meets-house", (-40, 12, -42), (-12.4, 12, -38), 0, 1),
            v("cu-shed-house-roof", (-20, 28, -40), (-6, 15, -36), 0, 1),
            v("cu-market-west-mouth", (-66, 5, -50), (-66, 8, -33.5), 0, 1),
            v("cu-market-west-oblique", (-85, 3, -45), (-66, 7, -33.5), 0, 1),
            v("cu-market-through", (-66, 3, -55), (-66, 7, 20), 0, 1),
            v("cu-market-east-mouth", (-23, 5, 56), (-23, 8, 40.9), 0, 1),
            v("cu-market-east-oblique", (-5, 3, 52), (-23, 7, 40.9), 0, 1),
            v("cu-ray-west-mouth", (133, 5, -50), (133, 8, -33.5), 0, 1),
            v("cu-ray-east-mouth", (137, 5, 56), (137, 8, 40.9), 0, 1),
            v("cu-ray-through", (133, 3, -55), (133, 7, 20), 0, 1),
            v("cu-portal-up", (-66, 2, -44), (-66, 10, -33.5), 0, 1),
            v("cu-shed-wall-windows", (80, 8, -48), (95, 10, -33.5), 0, 1),
            v("cu-shed-wall-east", (-60, 9, 52), (-50, 10, 40.9), 0, 1),
            v("cu-shed-end-south", (SX0 - 14, 8, 4), (SX0, 8, 4), 0, 1),
            v("cu-shed-end-north", (SX1 + 14, 8, 4), (SX1, 8, 4), 0, 1),
            v("cu-shed-corner-high", (SX1 + 8, 24, -50), (SX1, 14, -33.5), 0, 1),
            v("cu-shed-roof", (120, 30, 60), (120, 16, 10), 0, 1),
            v("cu-monitors", (60, 26, 55), (60, 16.5, 10), 0, 1),
            v("cu-under-shed", (-66, 1.2, -36), (-66, 6, 38), 0, 1),
        ]
    if want("lods"):
        cams = [
            ("front", (hcx, 1.7, -90), (hcx, 9, -57)),
            ("high", (hcx + 55, 30, -110), (hcx, 8, hcz)),
            ("shed", (-110, 12, 80), (-60, 8, 10)),
            ("corner", (HX0 - 25, 5, -80), (HX0, 8, -45)),
            ("portal", (-66, 4, -60), (-66, 7, -33.5)),
            ("top", (hcx, 150, hcz + 0.01), (hcx, 0, hcz)),
        ]
        for lod in (0, 1, 2):
            for n, c, t in cams:
                views.append(v(f"lod{lod}-{n}", c, t, lod, 1))
            views.append(v(f"lod{lod}-night", cams[1][1], cams[1][2], lod, 0))
    if want("auto"):
        # Auto LOD distances are measured from the model origin (0,0,0). Switch points 150 m and 600 m.
        for d in (60, 120, 200, 240, 400, 680, 720, 900):
            views.append(v(f"auto-front-{d}", (hcx, 9, -d), (hcx, 9, -57), None, 1))
            views.append(v(f"auto-oblique-{d}", (-d * 0.8, 20, -d * 0.6), (hcx * 0.4, 8, -30), None, 1))
    if want("night"):
        views += [
            v("night-front", (hcx, 3, -95), (hcx, 9, -57), 0, 0),
            v("night-front-wide", (hcx + 25, 14, -150), (hcx, 8, -50), 0, 0),
            v("night-corner-SW", (HX0 - 30, 4, -85), (HX0 + 10, 8, -50), 0, 0),
            v("night-corner-NW", (HX1 + 30, 4, -85), (HX1 - 10, 8, -50), 0, 0),
            v("night-arch", (13, 4, -75), (13, 9, -57.5), 0, 0),
            v("night-doors", (70, 2.5, -72), (76, 4, -57.5), 0, 0),
            v("night-portal", (-66, 3, -55), (-66, 7, -33.5), 0, 0),
            v("night-shed-east", (-30, 5, 85), (-30, 8, 41), 0, 0),
            v("night-high", (hcx + 50, 40, -120), (hcx, 8, -40), 0, 0),
            v("night-lod1", (hcx + 25, 14, -150), (hcx, 8, -50), 1, 0),
            v("night-lod2", (hcx + 25, 14, -150), (hcx, 8, -50), 2, 0),
        ]
    json.dump(views, open(out_path, "w"))
    print(len(views), "views")


if __name__ == "__main__":
    main()
