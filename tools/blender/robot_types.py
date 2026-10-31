"""
City robot types: Scout / Heavy / Worker (+ Glitch core). Headless:
  blender -b -P tools/blender/robot_types.py -- scout [--preview helmet=crt,arms=long ...] [--no-bake]
Writes public/robot/<type>/{parts.glb, masks.webp, normal.webp, kit.json} (webp converted by tools/robot-textures.mjs)
and Cycles previews to /workspace/city-shots/types-<type>-*.png. All geometry is authored here (no external assets).
"""
import sys, os, math
sys.path.insert(0, os.path.dirname(__file__))
from kit import *

L = 'Left'
def M(*a, **k): return mirror_x([x for p in a for x in (p if isinstance(p, list) else [p])])

# ================================================================ SCOUT  (~2.1 m, lean, screen face)
def scout(k):
    # ---- body (always on)
    k.add('body', 'base', 'Hips', [
        box((0, -0.03, 0), (0.24, 0.12, 0.17), 'shorts', taperb=(0.72, 0.8)),
        box((0, 0.035, 0), (0.27, 0.045, 0.19), 'joints', bev=0.006),
        box((0, -0.055, 0.088), (0.1, 0.1, 0.035), 'shell', taperb=(0.55, 1), bev=0.01),
        bolts([(-0.08, 0.035, 0.097), (0.08, 0.035, 0.097)]),
        decal((0, -0.04, 0.107), (0.07, 0.07), (0, 1)),
    ])
    k.add('body', 'base', 'Hips', [box((0.145, -0.035, 0), (0.035, 0.12, 0.13), 'shell', taperb=(1, 0.7)), cyl((0.11, -0.06, 0), 0.05, 0.06, 'joints', axis='x', n=14)], mirror=True)
    k.add('body', 'base', 'Spine', [
        cyl((0, 0.02, 0), 0.095, 0.04, 'joints', n=14), cyl((0, 0.065, 0), 0.085, 0.04, 'chrome', n=14), cyl((0, 0.11, 0), 0.095, 0.045, 'joints', n=14),
        box((0, 0.12, -0.075), (0.06, 0.24, 0.045), 'joints'),
        box((0, 0.33, 0.02), (0.5, 0.32, 0.3), 'torso', taperb=(0.56, 0.68), bev=0.016, seg=2),
        box((0, 0.505, 0.0), (0.4, 0.05, 0.26), 'shell', bev=0.012),
        box((0, 0.31, -0.165), (0.3, 0.26, 0.07), 'backpack', taperb=(0.8, 1)),
        slats((0, 0.24, -0.2), 0.2, 0.1, 4, depth=0.012),
        box((0, 0.33, 0.171), (0.03, 0.14, 0.012), 'visor', bev=0.003, seg=1),
        cyl((0, 0.57, 0), 0.045, 0.1, 'joints', n=12), cyl((0, 0.555, 0), 0.06, 0.02, 'chrome', n=12),
        tube([(0.05, 0.47, -0.06), (0.06, 0.55, -0.05), (0.04, 0.63, -0.03)], 0.011), tube([(-0.05, 0.47, -0.06), (-0.06, 0.55, -0.05), (-0.04, 0.63, -0.03)], 0.011),
        decal((0, 0.37, -0.2015), (0.14, 0.07), (2, 0), axis='-z'),  # CITY WORKS on the back
    ])
    k.add('body', 'base', 'Spine', [
        wedge((0.115, 0.38, 0.165), (0.2, 0.18, 0.05), 'shell', front=0.35, rot=(0, 0.18, 0)),
        box((0.24, 0.45, 0), (0.13, 0.1, 0.21), 'shell', bev=0.014, taper=(0.8, 0.9)),
        slats((0.205, 0.3, 0.03), 0.12, 0.12, 4, axis='x', depth=0.012),
        tube([(0.15, 0.2, 0.09), (0.19, 0.25, 0.1), (0.2, 0.33, 0.08)], 0.008),
        decal((0.13, 0.4, 0.194), (0.08, 0.08), (0, 0), rot=0.18),
    ], mirror=True)
    k.add('body', 'base', 'Spine', [decal((-0.11, 0.37, 0.196), (0.07, 0.07), (1, 1), rot=-0.18)])  # "07"
    # arms core + hands
    k.add('body', 'base', L + 'Arm', [sphere((0, 0, 0), 0.058, 'joints', n=12), cyl((0, -0.17, 0), 0.036, 0.28, 'joints', n=10),
                                      box((0.012, -0.16, 0.0), (0.1, 0.21, 0.11), 'shell', taperb=(0.8, 0.8), bev=0.016)], mirror=True)
    hand = [cyl((0, 0, 0), 0.042, 0.075, 'joints', axis='x', n=12),
            box((0, -0.445, 0.0), (0.065, 0.09, 0.09), 'joints', bev=0.01),
            box((0, -0.5, 0.025), (0.042, 0.06, 0.016), 'rubber', bev=0.005, rot=(0.15, 0, 0)), box((0, -0.5, 0.0), (0.042, 0.06, 0.016), 'rubber', bev=0.005),
            box((0, -0.5, -0.025), (0.042, 0.06, 0.016), 'rubber', bev=0.005, rot=(-0.15, 0, 0)),
            box((-0.03, -0.46, 0.035), (0.016, 0.05, 0.016), 'rubber', bev=0.005, rot=(0.4, 0, 0.3))]
    k.add('body', 'base', L + 'ForeArm', hand, mirror=True)
    k.add('body', 'base', L + 'UpLeg', [cyl((0, -0.04, 0), 0.04, 0.08, 'joints', n=10)], mirror=True)
    k.add('body', 'base', L + 'Leg', [cyl((0, 0, 0), 0.045, 0.11, 'joints', axis='x', n=14), cyl((0, 0, 0), 0.052, 0.03, 'chrome', axis='x', n=14)], mirror=True)
    k.add('body', 'base', L + 'Foot', [cyl((0, 0, 0), 0.038, 0.09, 'joints', axis='x', n=12)], mirror=True)

    # ---- helmet (Head bone at neck top). Screen rect metadata: centre + size in head space.
    k.add('helmet', 'crt', 'Head', [
        box((0, 0.13, -0.005), (0.4, 0.26, 0.26), 'shell', bev=0.024, seg=2, taperb=(0.92, 0.95)),
        box((0, 0.125, -0.15), (0.27, 0.19, 0.1), 'shell', taper=(0.8, 1), taperb=(0.8, 1), bev=0.012),
        box((0, 0.13, 0.122), (0.335, 0.205, 0.012), 'joints', bev=0.005, seg=1),
        box((0, 0.13, 0.13), (0.3, 0.17, 0.006), 'screen', bev=0, seg=1),
        box((0, 0.0, -0.01), (0.2, 0.03, 0.18), 'joints'),
        slats((0, 0.258, -0.04), 0.2, 0.05, 1, depth=0.1),
        box((0, 0.275, -0.04), (0.012, 0.03, 0.12), 'visor', bev=0.002, seg=1),
        decal((0.17, 0.05, 0.123), (0.05, 0.05), (3, 0)),
    ])
    k.add('helmet', 'crt', 'Head', [cyl((0.2, 0.13, -0.02), 0.055, 0.04, 'joints', axis='x', n=16), cyl((0.225, 0.13, -0.02), 0.03, 0.02, 'chrome', axis='x', n=12),
                                    cyl((0.2, 0.3, -0.06), 0.006, 0.16, 'chrome', n=6), sphere((0.2, 0.385, -0.06), 0.012, 'visor', n=8),
                                    bolts([(0.155, 0.215, 0.124), (0.155, 0.045, 0.124)], r=0.006)], mirror=True)
    k.add('helmet', 'visor', 'Head', [
        box((0, 0.12, -0.02), (0.25, 0.24, 0.27), 'shell', bev=0.03, seg=3, taper=(0.86, 0.85)),
        box((0, 0.135, 0.105), (0.27, 0.085, 0.07), 'joints', bev=0.012),
        box((0, 0.135, 0.142), (0.25, 0.06, 0.006), 'screen', bev=0),
        wedge((0, 0.05, 0.11), (0.2, 0.08, 0.05), 'shell', front=0.4),
        box((0, 0.26, -0.06), (0.02, 0.07, 0.26), 'backpack', taper=(1, 0.6), bev=0.006),
        slats((0, 0.04, 0.14), 0.12, 0.04, 3, depth=0.008),
    ])
    k.add('helmet', 'visor', 'Head', [box((0.13, 0.12, -0.03), (0.03, 0.14, 0.14), 'joints', bev=0.008), cyl((0.145, 0.12, -0.03), 0.04, 0.015, 'chrome', axis='x', n=12)], mirror=True)
    k.add('helmet', 'twin', 'Head', [
        box((0, 0.12, -0.02), (0.27, 0.23, 0.26), 'shell', bev=0.025, seg=2, taperb=(0.9, 0.9)),
        box((0, 0.12, 0.105), (0.25, 0.17, 0.03), 'joints', bev=0.008),
        box((0, 0.06, 0.125), (0.14, 0.04, 0.005), 'screen', bev=0),
        box((0, 0.25, -0.02), (0.16, 0.035, 0.18), 'shell', bev=0.01),
    ])
    k.add('helmet', 'twin', 'Head', [cyl((0.06, 0.15, 0.13), 0.048, 0.07, 'joints', axis='z', n=18), cyl((0.06, 0.15, 0.17), 0.04, 0.012, 'glass', axis='z', n=18),
                                     cyl((0.06, 0.15, 0.163), 0.052, 0.012, 'visor', axis='z', n=18)], mirror=True)

    # ---- arms (shoulder armour + forearm)
    pad = lambda: [wedge((0.06, 0.045, 0), (0.2, 0.12, 0.23), 'shell', front=0.3), box((0.075, -0.03, 0), (0.17, 0.035, 0.2), 'joints', bev=0.006)]
    k.add('arms', 'long', L + 'Arm', pad(), mirror=True)
    k.add('arms', 'long', L + 'ForeArm', [box((0.0, -0.19, 0), (0.12, 0.34, 0.13), 'shell', taper=(0.85, 0.85), bev=0.018), box((0, -0.38, 0), (0.1, 0.04, 0.1), 'joints'),
                                          box((0.061, -0.2, 0), (0.01, 0.22, 0.04), 'visor', bev=0.002, seg=1), decal((0.0, -0.15, 0.0655), (0.06, 0.12), (1, 0))], mirror=True)
    k.add('arms', 'blade', L + 'Arm', pad(), mirror=True)
    k.add('arms', 'blade', L + 'ForeArm', [box((0.0, -0.19, 0), (0.11, 0.33, 0.12), 'shell', taper=(0.85, 0.85), bev=0.016), box((0, -0.38, 0), (0.08, 0.04, 0.085), 'joints'),
                                           hull([(0.04, -0.05, -0.03), (0.04, -0.05, 0.03), (0.065, -0.1, 0), (0.05, -0.62, -0.005), (0.05, -0.62, 0.005), (0.045, -0.35, 0.03), (0.045, -0.35, -0.03)], 'chrome', bev=0.002),
                                           box((0.05, -0.2, 0), (0.025, 0.16, 0.06), 'joints')], mirror=True)
    k.add('arms', 'grapple', L + 'Arm', pad(), mirror=True)
    k.add('arms', 'grapple', L + 'ForeArm', [box((0.0, -0.18, 0), (0.12, 0.31, 0.13), 'shell', bev=0.018), cyl((0, -0.25, -0.075), 0.035, 0.26, 'joints', n=12),
                                             cyl((0, -0.39, -0.075), 0.022, 0.04, 'chrome', n=10), hull([(0, -0.41, -0.075), (0.03, -0.45, -0.075), (0.02, -0.5, -0.075), (0, -0.48, -0.075), (0, -0.42, -0.06)], 'chrome', bev=0.002),
                                             hull([(0, -0.41, -0.075), (-0.03, -0.45, -0.075), (-0.02, -0.5, -0.075), (0, -0.48, -0.075), (0, -0.42, -0.09)], 'chrome', bev=0.002),
                                             cyl((0.05, -0.17, -0.02), 0.035, 0.03, 'visor', axis='x', n=14), tube([(0, -0.12, -0.06), (0.02, -0.2, -0.1), (0, -0.3, -0.1)], 0.006)], mirror=True)

    # ---- legs
    k.add('legs', 'digi', L + 'UpLeg', [box((0.0, -0.23, 0.025), (0.16, 0.38, 0.18), 'shell', taperb=(0.62, 0.68), bev=0.02, rot=(-0.1, 0, 0)),
                                        box((0.083, -0.2, 0.02), (0.02, 0.2, 0.09), 'joints'), tube([(0.06, -0.06, -0.06), (0.07, -0.3, -0.07), (0.04, -0.45, -0.05)], 0.009)], mirror=True)
    k.add('legs', 'digi', L + 'Leg', [box((0, 0.0, 0.065), (0.085, 0.11, 0.05), 'shell', bev=0.012),
                                      hull([(-0.04, -0.03, 0.04), (0.04, -0.03, 0.04), (-0.04, -0.03, -0.04), (0.04, -0.03, -0.04), (-0.035, -0.29, -0.11), (0.035, -0.29, -0.11), (-0.035, -0.22, -0.04), (0.035, -0.22, -0.04)], 'shell', bev=0.012, seg=2),
                                      hull([(-0.035, -0.29, -0.11), (0.035, -0.29, -0.11), (-0.03, -0.25, -0.05), (0.03, -0.25, -0.05), (-0.03, -0.47, 0.025), (0.03, -0.47, 0.025), (-0.03, -0.48, -0.03), (0.03, -0.48, -0.03)], 'joints', bev=0.01, seg=2),
                                      cyl((0, -0.27, -0.1), 0.032, 0.09, 'chrome', axis='x', n=12), box((0, -0.12, 0.05), (0.06, 0.12, 0.02), 'visor', bev=0.004, seg=1, rot=(0.25, 0, 0)),
                                      decal((0.0435, -0.1, 0.0), (0.06, 0.06), (0, 0), axis='x')], mirror=True)
    k.add('legs', 'straight', L + 'UpLeg', [box((0.0, -0.23, 0.01), (0.17, 0.38, 0.18), 'shell', taperb=(0.7, 0.7), bev=0.02), box((0, -0.22, 0.1), (0.07, 0.2, 0.02), 'joints')], mirror=True)
    k.add('legs', 'straight', L + 'Leg', [box((0, 0.0, 0.065), (0.09, 0.1, 0.05), 'shell', bev=0.012), box((0, -0.25, 0), (0.1, 0.38, 0.12), 'shell', taperb=(0.75, 0.8), bev=0.015),
                                          wedge((0, -0.22, 0.065), (0.08, 0.3, 0.03), 'torso', front=0.2), cyl((0, -0.25, -0.07), 0.025, 0.3, 'chrome', n=10)], mirror=True)
    k.add('legs', 'sprint', L + 'UpLeg', [box((0.0, -0.22, 0.02), (0.15, 0.35, 0.16), 'shell', taperb=(0.58, 0.62), bev=0.018), box((0, -0.06, 0.0), (0.13, 0.08, 0.13), 'joints')], mirror=True)
    k.add('legs', 'sprint', L + 'Leg', [box((0, -0.12, 0.02), (0.07, 0.22, 0.08), 'shell', taperb=(0.7, 0.7), bev=0.012),
                                        hull([(-0.025, -0.15, -0.03), (0.025, -0.15, -0.03), (-0.025, -0.15, -0.045), (0.025, -0.15, -0.045), (-0.025, -0.33, -0.13), (0.025, -0.33, -0.13), (-0.025, -0.35, -0.12), (0.025, -0.35, -0.12)], 'rubber', bev=0.006),
                                        hull([(-0.025, -0.33, -0.13), (0.025, -0.33, -0.13), (-0.025, -0.35, -0.115), (0.025, -0.35, -0.115), (-0.025, -0.48, -0.01), (0.025, -0.48, -0.01), (-0.025, -0.47, 0.005), (0.025, -0.47, 0.005)], 'rubber', bev=0.006),
                                        cyl((0, -0.32, -0.04), 0.03, 0.3, 'joints', n=10, r2=0.02, rot=(0.25, 0, 0))], mirror=True)

    # ---- thrusters (back)
    k.add('thrusters', 'twin', 'Spine', [box((0, 0.36, -0.2), (0.12, 0.16, 0.06), 'joints')])
    k.add('thrusters', 'twin', 'Spine', [cyl((0.07, 0.3, -0.225), 0.045, 0.24, 'backpack', n=14), cyl((0.07, 0.17, -0.225), 0.04, 0.04, 'chrome', n=14, r2=0.05),
                                         cyl((0.07, 0.42, -0.225), 0.05, 0.03, 'joints', n=14), cyl((0.07, 0.3, -0.272), 0.012, 0.16, 'visor', n=6)], mirror=True)
    for side in (1, -1):
        k.add('thrusters', 'ducted', 'Spine', ring((0.15 * side, 0.32, -0.25), 0.085, 0.022, 0.07, 'backpack', n=18, axis='y') + [
            cyl((0.15 * side, 0.32, -0.25), 0.03, 0.06, 'chrome', n=10), box((0.15 * side, 0.32, -0.25), (0.16, 0.012, 0.01), 'joints', bev=0.002, seg=1),
            box((0.15 * side, 0.32, -0.25), (0.01, 0.012, 0.16), 'joints', bev=0.002, seg=1), box((0.075 * side, 0.32, -0.2), (0.08, 0.04, 0.05), 'joints')])
    k.add('thrusters', 'fins', 'Spine', [box((0, 0.34, -0.215), (0.16, 0.24, 0.07), 'backpack', taper=(0.8, 1)), slats((0, 0.33, -0.252), 0.12, 0.16, 5, depth=0.008),
                                         wedge((0, 0.5, -0.25), (0.015, 0.18, 0.12), 'shell', front=0.6, rot=(-0.2, 0, 0))])
    k.add('thrusters', 'fins', 'Spine', [hull([(0.08, 0.42, -0.2), (0.08, 0.2, -0.2), (0.21, 0.5, -0.3), (0.2, 0.42, -0.3), (0.085, 0.42, -0.215), (0.085, 0.2, -0.215)], 'shell', bev=0.004),
                                         cyl((0.06, 0.2, -0.23), 0.03, 0.05, 'chrome', n=10)], mirror=True)

    # ---- bionics
    k.add('bionics', 'scope', 'Spine', [box((-0.2, 0.52, -0.02), (0.06, 0.06, 0.08), 'joints'), cyl((-0.2, 0.58, -0.02), 0.012, 0.1, 'chrome', n=8),
                                        cyl((-0.19, 0.64, 0.03), 0.032, 0.17, 'backpack', axis='z', n=14), cyl((-0.19, 0.64, 0.12), 0.036, 0.03, 'joints', axis='z', n=14),
                                        cyl((-0.19, 0.64, 0.136), 0.028, 0.006, 'glass', axis='z', n=14), cyl((-0.19, 0.64, 0.133), 0.012, 0.01, 'visor', axis='z', n=8),
                                        box((-0.19, 0.675, 0.02), (0.02, 0.02, 0.07), 'joints')])
    k.add('bionics', 'antenna', 'Spine', [box((0, 0.46, -0.21), (0.18, 0.08, 0.05), 'joints'), cyl((0.07, 0.68, -0.22), 0.006, 0.42, 'chrome', n=6), cyl((-0.06, 0.62, -0.22), 0.005, 0.3, 'chrome', n=6),
                                          sphere((0.07, 0.89, -0.22), 0.012, 'visor', n=8), cyl((-0.02, 0.56, -0.225), 0.06, 0.012, 'shell', axis='z', n=18, r2=0.02), cyl((-0.02, 0.56, -0.205), 0.012, 0.03, 'chrome', axis='z', n=8)])
    k.add('bionics', 'drone', 'Spine', [box((0, 0.56, -0.2), (0.2, 0.06, 0.12), 'backpack', bev=0.015), box((0, 0.6, -0.2), (0.08, 0.04, 0.06), 'shell'),
                                        cyl((0, 0.585, -0.13), 0.012, 0.006, 'visor', axis='z', n=8)] +
          [x for sx in (1, -1) for x in (cyl((0.13 * sx, 0.6, -0.2), 0.045, 0.01, 'rubber', n=14), cyl((0.13 * sx, 0.585, -0.2), 0.012, 0.03, 'chrome', n=8))])

    # ---- boots (Foot bone at ankle, sole at y=-0.12)
    k.add('boots', 'blade', L + 'Foot', [hull([(-0.05, -0.02, -0.06), (0.05, -0.02, -0.06), (-0.05, -0.09, -0.08), (0.05, -0.09, -0.08), (-0.04, -0.06, 0.08), (0.04, -0.06, 0.08), (0, -0.09, 0.2), (-0.045, -0.1, 0.06), (0.045, -0.1, 0.06)], 'shell', bev=0.012, seg=2),
                                         hull([(-0.05, -0.1, -0.09), (0.05, -0.1, -0.09), (-0.045, -0.1, 0.07), (0.045, -0.1, 0.07), (0, -0.1, 0.2), (-0.05, -0.12, -0.09), (0.05, -0.12, -0.09), (-0.045, -0.12, 0.07), (0.045, -0.12, 0.07), (0, -0.12, 0.2)], 'rubber', bev=0.004),
                                         box((0, -0.06, -0.11), (0.03, 0.05, 0.06), 'chrome', bev=0.006, rot=(0.4, 0, 0)), box((0, -0.03, 0.01), (0.07, 0.03, 0.08), 'joints')], mirror=True)
    k.add('boots', 'pads', L + 'Foot', [box((0, -0.06, 0.04), (0.12, 0.07, 0.22), 'shell', bev=0.025, seg=2, taper=(0.85, 0.85)), box((0, -0.11, 0.04), (0.13, 0.025, 0.23), 'rubber', bev=0.01),
                                        box((0, -0.03, -0.02), (0.08, 0.04, 0.08), 'joints'), box((0, -0.05, 0.155), (0.08, 0.03, 0.01), 'visor', bev=0.003, seg=1)], mirror=True)
    k.add('boots', 'skids', L + 'Foot', [box((0, -0.05, 0.03), (0.1, 0.06, 0.18), 'shell', bev=0.015, taper=(0.8, 0.9))] +
          [hull([(x, -0.1, -0.1), (x, -0.1, 0.12), (x, -0.08, 0.17), (x + 0.012, -0.1, -0.1), (x + 0.012, -0.1, 0.12), (x + 0.012, -0.08, 0.17), (x, -0.12, -0.1), (x + 0.012, -0.12, -0.1), (x, -0.12, 0.12), (x + 0.012, -0.12, 0.12)], 'chrome', bev=0.002) for x in (-0.05, 0.038)] +
          [box((0, -0.09, 0.02), (0.1, 0.02, 0.06), 'joints')], mirror=True)
    k.screens = {'crt': [0, 0.13, 0.133, 0.3, 0.17], 'visor': [0, 0.135, 0.145, 0.25, 0.06], 'twin': [0, 0.06, 0.128, 0.14, 0.04]}

SLOTS = {'scout': {'helmet': ['crt', 'visor', 'twin'], 'arms': ['long', 'blade', 'grapple'], 'bionics': ['scope', 'antenna', 'drone'],
                   'legs': ['digi', 'straight', 'sprint'], 'thrusters': ['twin', 'ducted', 'fins'], 'boots': ['blade', 'pads', 'skids']}}
BUILDERS = {'scout': scout}
FACTORY = {'scout': {'shell': (0.035, 0.035, 0.04), 'joints': (0.012, 0.012, 0.014), 'torso': (0.06, 0.06, 0.065), 'shorts': (0.02, 0.02, 0.022), 'backpack': (0.6, 0.16, 0.02)}}

def main():
    argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else ['scout']
    t = argv[0]; reset()
    import kit, addons
    kit.ADDONS = '--no-addons' not in argv and addons.available('HOps') and addons.available('MESHmachine')
    print('ADDONS', kit.ADDONS, flush=True)
    k = Kit(t); BUILDERS[t](k)
    tris = k.build(); slots = SLOTS[t]
    body = sum(v for (s, o), v in tris.items() if s == 'body')
    builds = [{s: o[i] for s, o in slots.items()} for i in range(3)]
    for i, b in enumerate(builds): print(f'build {i}: tris', body + sum(tris[(s, o)] for s, o in b.items()))
    print('TRIS', {f'{s}:{o}': v for (s, o), v in sorted(tris.items())})
    out = os.path.join(ROOT, 'public', 'robot', t); os.makedirs(out, exist_ok=True)
    k.unwrap()
    size = 2048 if '--fast' not in argv else 512
    if '--no-bake' not in argv: k.bake(out, builds, size=size)
    k.export(os.path.join(out, 'parts.glb'))
    k.write_meta(out, slots, {'screens': getattr(k, 'screens', {})})
    if '--preview' in argv:
        tag = argv[argv.index('--preview') + 1]
        for i, b in enumerate(builds):
            k.preview(b, f'/workspace/city-shots/types-{t}-{tag}-b{i}.png', paint=FACTORY.get(t), samples=32 if size < 2048 else 64)

def _run():
    try: main()
    except Exception: import traceback; traceback.print_exc()
    import addons; print('ADDONS_USED', dict(addons.USED), flush=True)
    if not bpy.app.background: bpy.ops.wm.quit_blender()

if __name__ == '__main__':
    if bpy.app.background: _run()
    else: bpy.app.timers.register(_run, first_interval=1.5)  # GUI (xvfb) run: wait for the window so add-on operators get a context
