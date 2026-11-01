"""Websmith takeover fixes on the 3cd5b01 stadium blend (PR #19 round 2)."""
import os
import subprocess

SLUG = "newark-schools-stadium"
FIELD_LIFT = 0.22
EMISSIVE = {"emissive-windows": 0.55, "emissive-lamp": 1.35, "emissive-sign": 0.7}


def add_box(acc, mn, mx):
    x0, y0, z0 = mn
    x1, y1, z1 = mx
    corners = [
        (x0, y0, z0),
        (x1, y0, z0),
        (x1, y1, z0),
        (x0, y1, z0),
        (x0, y0, z1),
        (x1, y0, z1),
        (x1, y1, z1),
        (x0, y1, z1),
    ]
    base = len(acc[0])
    acc[0].extend(corners)
    acc[1].extend(
        [
            (base, base + 1, base + 3),
            (base, base + 3, base + 2),
            (base + 4, base + 6, base + 5),
            (base + 4, base + 7, base + 6),
            (base, base + 2, base + 6),
            (base, base + 6, base + 4),
            (base + 1, base + 5, base + 7),
            (base + 1, base + 7, base + 3),
            (base, base + 4, base + 5),
            (base, base + 5, base + 1),
            (base + 2, base + 3, base + 7),
            (base + 2, base + 7, base + 6),
        ]
    )


def rebuild_col(col_obj, body_obj, field_xy):
    import bmesh
    from mathutils import Vector

    old = col_obj.data
    mw = col_obj.matrix_world
    kept = []
    for poly in old.polygons:
        verts = [mw @ old.vertices[vi].co for vi in poly.vertices]
        minx = min(v.x for v in verts)
        maxx = max(v.x for v in verts)
        miny = min(v.y for v in verts)
        maxy = max(v.y for v in verts)
        minz = min(v.z for v in verts)
        maxz = max(v.z for v in verts)
        span = max(maxx - minx, maxy - miny)
        # Solid bowl filler over the pitch (~7.7 m ceiling).
        if minz < 0.5 and maxz > 7.0 and span > 80:
            continue
        kept.append(((minx, miny, minz), (maxx, maxy, maxz)))

    V, F = [], []
    acc = [V, F]
    for mn, mx in kept:
        add_box(acc, mn, mx)

    # Thin stand back walls (field stays open). Two OSM bleacher backs + arch strip.
    walls = [
        # home (west) stand back ~ y 122–126
        ((-72, 122, 0), (-8, 126, 7.8)),
        # away (east) inner stand
        ((18, -86, 0), (72, -62, 7.8)),
        # Bloomfield arch wall (street side)
        ((-40, 118, 0), (40, 128, 10.2)),
    ]
    for mn, mx in walls:
        add_box(acc, mn, mx)

    me = col_obj.data
    me.clear_geometry()
    me.from_pydata(V, [], F)
    me.update()


def lift_field(body_obj, margin=55):
    import bmesh

    mesh = body_obj.data
    mw = body_obj.matrix_world
    inv = mw.inverted()
    bm = bmesh.new()
    bm.from_mesh(mesh)
    for v in bm.verts:
        w = mw @ v.co
        if w.z < 0.18 and abs(w.x) < margin and abs(w.y) < margin:
            w.z += FIELD_LIFT
            v.co = inv @ w
    bm.to_mesh(mesh)
    mesh.update()
    bm.free()


def press_box_missing():
    import bpy

    for obj in bpy.data.objects:
        if obj.name.startswith("press-box"):
            return False
    return True


def add_press_box(lod_root, main_mat, win_mat):
    import bpy

    # Home stand is high +Y (Bloomfield / west). Press box sits on deck ~7.68 m.
    cx, cy = 47.0, 124.0
    pb_len, pd, ht = 18.0, 3.6, 2.7
    x0, x1 = cx - pb_len * 0.5, cx + pb_len * 0.5
    y0, y1 = cy - pd, cy
    z0 = 7.63
    z1 = z0 + ht

    def mesh_box(name, mn, mx, mat):
        x0, y0, z0 = mn
        x1, y1, z1 = mx
        verts = [
            (x0, y0, z0),
            (x1, y0, z0),
            (x1, y1, z0),
            (x0, y1, z0),
            (x0, y0, z1),
            (x1, y0, z1),
            (x1, y1, z1),
            (x0, y1, z1),
        ]
        faces = [(0, 1, 2, 3), (4, 6, 5, 7), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)]
        me = bpy.data.meshes.new(name)
        me.from_pydata(verts, [], faces)
        me.update()
        ob = bpy.data.objects.new(name, me)
        ob.data.materials.append(mat)
        bpy.context.scene.collection.objects.link(ob)
        ob.parent = lod_root
        return ob

    mesh_box("press-box", (x0, y0, z0), (x1, y1, z1), main_mat)
    mesh_box("press-box-roof", (x0 - 0.35, y0 - 0.7, z1), (x1 + 0.35, y1 + 0.15, z1 + 0.18), main_mat)
    wme = bpy.data.meshes.new("press-box-windows")
    wme.from_pydata(
        [
            (x0 + 0.5, y0 - 0.02, z0 + 0.35),
            (x1 - 0.5, y0 - 0.02, z0 + 0.35),
            (x1 - 0.5, y0 - 0.02, z1 - 0.25),
            (x0 + 0.5, y0 - 0.02, z1 - 0.25),
        ],
        [],
        [(0, 1, 2, 3)],
    )
    wob = bpy.data.objects.new("press-box-windows", wme)
    wob.data.materials.append(win_mat)
    bpy.context.scene.collection.objects.link(wob)
    wob.parent = lod_root


def main():
    import bpy

    root = os.path.dirname(os.path.abspath(__file__))
    blend = os.path.join(root, f"{SLUG}.blend")
    bpy.ops.wm.open_mainfile(filepath=blend)

    body0 = bpy.data.objects["body-lod0"]
    col = bpy.data.objects[f"{SLUG}_COL"]
    wins0 = bpy.data.objects.get("windows-lod0")
    main_mat = bpy.data.materials["newark-schools-stadium-main"]
    win_mat = bpy.data.materials["emissive-windows"]

    mw = body0.matrix_world
    fx = fy = n = 0
    for v in body0.data.vertices:
        w = mw @ v.co
        if w.z < 0.2:
            fx += w.x
            fy += w.y
            n += 1
    field_xy = (fx / max(n, 1), fy / max(n, 1))

    for lod in (0, 1, 2):
        b = bpy.data.objects.get(f"body-lod{lod}")
        if b:
            lift_field(b)

    if press_box_missing():
        add_press_box(bpy.data.objects[f"{SLUG}_LOD0"], main_mat, win_mat)
        if bpy.data.objects.get(f"{SLUG}_LOD1"):
            add_press_box(bpy.data.objects[f"{SLUG}_LOD1"], main_mat, win_mat)

    rebuild_col(col, body0, field_xy)

    for mat in bpy.data.materials:
        if mat.name in EMISSIVE and mat.use_nodes:
            for node in mat.node_tree.nodes:
                if node.type == "BSDF_PRINCIPLED":
                    node.inputs["Emission Strength"].default_value = EMISSIVE[mat.name]

    bpy.ops.wm.save_mainfile(filepath=blend, compress=True)

    repo = os.path.abspath(os.path.join(root, "..", "..", "..", ".."))
    public = os.path.join(repo, "public", "landmarks", "newark", SLUG)
    os.makedirs(public, exist_ok=True)
    raw = os.path.join(public, "raw.glb")
    out = os.path.join(public, f"{SLUG}.glb")
    bpy.ops.export_scene.gltf(
        filepath=raw,
        export_format="GLB",
        export_yup=True,
        export_apply=True,
        export_cameras=False,
        export_lights=False,
        export_materials="EXPORT",
    )
    subprocess.check_call(
        [
            "npx",
            "--yes",
            "@gltf-transform/cli",
            "optimize",
            raw,
            out,
            "--join",
            "false",
            "--compress",
            "meshopt",
            "--texture-compress",
            "ktx2",
        ],
        cwd=repo,
    )
    if os.path.exists(raw):
        os.remove(raw)
    print("OK", out, "bytes", os.path.getsize(out), "col tris", len(col.data.polygons))


if __name__ == "__main__":
    main()
