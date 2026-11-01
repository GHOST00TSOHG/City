#!/usr/bin/env python3
"""Solidity audit for the Newark Penn Station geometry. Pure python + numpy, no Blender.

    python3 audit_penn.py [--lod N] [--rays N]

1. Ray audit. Rays are shot at the station from outside (random sky, horizon and ground-level
   origins, plus a vertical sweep over the whole footprint). The first thing a ray touches must be
   a front face. A first hit on a back face means the viewer is looking through a gap, an open
   edge or a missing cap, and the position is printed. Vertical rays that miss everything over the
   footprint are holes in the roof.
2. Floating parts. Every part (closed solid or wall piece) must touch or overlap another part's
   bounding box. A part whose box hovers off everything else is printed.
3. Ground. Nothing may sit below SKIRT or have NaN coordinates, and the lowest wall edge must be at SKIRT.

Exit code 1 when anything is found.
"""

import argparse
import sys

import numpy as np

import build_penn as B


def arrays(accs):
    V, F, P, K = [], [], [], []
    base = 0
    for k, acc in enumerate(accs):
        V.extend(acc.V)
        F.extend((a + base, b + base, c + base) for a, b, c in acc.F)
        P.extend((k, p) for p in acc.P)
        K.extend([k] * len(acc.F))
        base += len(acc.V)
    V = np.asarray(V, dtype=np.float64)
    F = np.asarray(F, dtype=np.int64)
    return V, F, P, np.asarray(K)


def first_hits(V, F, o, d, chunk=64):
    """Nearest hit per ray, double sided. Returns t (inf = miss), tri index, facing (dot(d, n))."""
    v0 = V[F[:, 0]]
    e1 = V[F[:, 1]] - v0
    e2 = V[F[:, 2]] - v0
    nrm = np.cross(e1, e2)
    ln = np.linalg.norm(nrm, axis=1, keepdims=True)
    nrm = nrm / np.where(ln > 0, ln, 1)
    R = len(o)
    T = np.full(R, np.inf)
    I = np.full(R, -1)
    S = np.zeros(R)
    for a in range(0, R, chunk):
        oc, dc = o[a:a + chunk], d[a:a + chunk]
        # (r, t, 3)
        pv = np.cross(dc[:, None, :], e2[None, :, :])
        det = np.einsum("tk,rtk->rt", e1, pv)
        ok = np.abs(det) > 1e-12
        inv = np.where(ok, 1.0 / np.where(ok, det, 1.0), 0.0)
        tv = oc[:, None, :] - v0[None, :, :]
        u = np.einsum("rtk,rtk->rt", tv, pv) * inv
        qv = np.cross(tv, e1[None, :, :])
        v = np.einsum("rk,rtk->rt", dc, qv) * inv
        t = np.einsum("tk,rtk->rt", e2, qv) * inv
        hit = ok & (u >= -1e-9) & (v >= -1e-9) & (u + v <= 1 + 1e-9) & (t > 1e-4)
        t = np.where(hit, t, np.inf)
        idx = np.argmin(t, axis=1)
        tmin = t[np.arange(len(oc)), idx]
        T[a:a + chunk] = tmin
        I[a:a + chunk] = np.where(np.isfinite(tmin), idx, -1)
        S[a:a + chunk] = np.where(np.isfinite(tmin), np.einsum("rk,rk->r", dc, nrm[idx]), 0.0)
    return T, I, S


def make_rays(n, rng):
    """Rays from outside the station's solid envelope (never from inside the shed or house)."""
    xs, xn = B.MX(B.VS), B.MX(B.VN)
    ye, yw = B.MY(B.VE), B.MY(B.HW)
    hx0, hx1 = B.MX(B.HS), B.MX(B.HN)
    ysh = B.MY(B.HE)
    outs_o, outs_d = [], []
    while sum(len(a) for a in outs_o) < n:
        m = n
        tgt = np.stack([rng.uniform(xs, xn, m), rng.uniform(ye, yw, m), rng.uniform(0.0, 19.5, m)], axis=1)
        half = m // 2
        tgt[:half, 0] = rng.uniform(hx0 - 3, hx1 + 3, half)
        tgt[:half, 1] = rng.uniform(ysh - 3, yw + 3, half)
        az = rng.uniform(0, 2 * np.pi, m)
        el = np.minimum(np.arccos(rng.uniform(0.02, 1.0, m)), np.radians(88))
        r = rng.uniform(40, 160, m)
        dirn = np.stack([np.sin(el) * np.cos(az), np.sin(el) * np.sin(az), np.cos(el)], axis=1)
        o = tgt + dirn * r[:, None]
        m_ = 2.0
        inside_shed = (o[:, 0] > xs - m_) & (o[:, 0] < xn + m_) & (o[:, 1] > ye - m_) & (o[:, 1] < ysh + m_) & (o[:, 2] < B.V_PARAPET + 2.5)
        inside_house = (o[:, 0] > hx0 - m_) & (o[:, 0] < hx1 + m_) & (o[:, 1] >= ysh - m_) & (o[:, 1] < yw + m_) & (o[:, 2] < B.CLERE_TOP + 2.5)
        keep = ~(inside_shed | inside_house)
        d = tgt - o
        d /= np.linalg.norm(d, axis=1, keepdims=True)
        outs_o.append(o[keep])
        outs_d.append(d[keep])
    return np.concatenate(outs_o)[:n], np.concatenate(outs_d)[:n]


def math_tau():
    return 2 * np.pi


def vertical_rays(step):
    xs, xn = B.MX(B.VS), B.MX(B.VN)
    ye, yw = B.MY(B.VE), B.MY(B.HW)
    gx = np.arange(xs + step / 2, xn, step)
    gy = np.arange(ye + step / 2, yw, step)
    X, Y = np.meshgrid(gx, gy)
    o = np.stack([X.ravel(), Y.ravel(), np.full(X.size, 60.0)], axis=1)
    # only over the real footprint: the shed everywhere, the house only where it stands
    hx0, hx1 = B.MX(B.HS), B.MX(B.HN)
    yh0 = B.MY(B.HE)
    keep = (o[:, 1] <= B.MY(B.HE) + 1e-9) | ((o[:, 0] >= hx0) & (o[:, 0] <= hx1))
    o = o[keep]
    d = np.tile(np.array([0.0, 0.0, -1.0]), (len(o), 1))
    return o, d


def part_boxes(accs):
    boxes = {}
    for k, acc in enumerate(accs):
        V = np.asarray(acc.V)
        for fi, (a, b, c) in enumerate(acc.F):
            key = (k, acc.P[fi])
            pts = V[[a, b, c]]
            lo, hi = pts.min(axis=0), pts.max(axis=0)
            if key in boxes:
                boxes[key] = (np.minimum(boxes[key][0], lo), np.maximum(boxes[key][1], hi))
            else:
                boxes[key] = (lo, hi)
    return boxes


def floating(accs, tol=2e-3):
    boxes = part_boxes(accs)
    keys = list(boxes)
    lo = np.array([boxes[k][0] for k in keys])
    hi = np.array([boxes[k][1] for k in keys])
    out = []
    for i, k in enumerate(keys):
        # touching or overlapping any other part (gap <= tol on every axis)
        gap = np.maximum(lo - hi[i], lo[i] - hi)
        near = np.all(gap <= tol, axis=1)
        near[i] = False
        if not near.any():
            out.append((k, lo[i], hi[i]))
    return out


def run(level, nrays, step):
    S, G, L, col = B.build(level)
    accs = [S, G, L]
    V, F, P, K = arrays(accs)
    problems = 0
    print(f"LOD{level}: {len(F)} tris")
    if not np.isfinite(V).all():
        print("  NaN or inf vertex")
        problems += 1
    zmin = V[:, 2].min()
    print(f"  lowest vertex z {zmin:.3f} (wall base is {B.SKIRT})")
    if zmin < B.SKIRT - 1e-6:
        print("  vertex below the skirt")
        problems += 1
    rng = np.random.default_rng(1935)
    o, d = make_rays(nrays, rng)
    T, I, Sg = first_hits(V, F, o, d)
    back = (I >= 0) & (Sg > 1e-6)
    print(f"  random rays {len(o)}: miss {int((~np.isfinite(T)).sum())}, back-face first {int(back.sum())}")
    shown = 0
    for r in np.where(back)[0]:
        p = o[r] + d[r] * T[r]
        print(f"    BACK FACE seen at ({p[0]:.2f}, {p[1]:.2f}, {p[2]:.2f}) tri {I[r]} part {P[I[r]]} facing {Sg[r]:.2f}")
        shown += 1
        if shown >= 12:
            break
    problems += int(back.sum() > 0)
    vo, vd = vertical_rays(step)
    T2, I2, S2 = first_hits(V, F, vo, vd)
    miss = ~np.isfinite(T2)
    back2 = (I2 >= 0) & (S2 > 1e-6)
    print(f"  vertical sweep {len(vo)} rays: miss {int(miss.sum())}, back-face first {int(back2.sum())}")
    for r in list(np.where(miss)[0][:8]) + list(np.where(back2)[0][:8]):
        print(f"    hole/back at x {vo[r][0]:.2f} y {vo[r][1]:.2f}")
    problems += int(miss.sum() > 0) + int(back2.sum() > 0)
    fl = floating(accs)
    print(f"  parts {len(part_boxes(accs))}, floating {len(fl)}")
    for k, lo, hi in fl[:12]:
        print(f"    FLOATING part {k} box {np.round(lo, 2)} .. {np.round(hi, 2)}")
    problems += int(len(fl) > 0)
    return problems


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lod", type=int, default=-1)
    ap.add_argument("--rays", type=int, default=6000)
    ap.add_argument("--step", type=float, default=1.5)
    a = ap.parse_args()
    B.LINER = False   # walls must be tight on their own; the shipped liner is only a backstop
    bad = 0
    for lv in ((0, 1, 2) if a.lod < 0 else (a.lod,)):
        bad += run(lv, a.rays, a.step)
    print("AUDIT FAIL" if bad else "AUDIT OK")
    return 1 if bad else 0


if __name__ == "__main__":
    sys.exit(main())
