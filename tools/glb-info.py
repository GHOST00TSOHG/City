#!/usr/bin/env python3
"""Print nodes, materials, images, triangles and bbox of a plain (uncompressed) glb.

    python3 tools/glb-info.py public/landmarks/newark/newark-penn-station/newark-penn-station.glb
"""
import json
import struct
import sys


def main(path):
    data = open(path, "rb").read()
    magic, ver, length = struct.unpack("<III", data[:12])
    assert magic == 0x46546C67, "not a glb"
    off, js, binlen = 12, None, 0
    while off < length:
        clen, ctype = struct.unpack("<II", data[off:off + 8])
        if ctype == 0x4E4F534A:
            js = json.loads(data[off + 8:off + 8 + clen])
        elif ctype == 0x004E4942:
            binlen = clen
        off += 8 + clen + 0
    print(path, len(data), "bytes, bin", binlen)
    print("extensionsUsed", js.get("extensionsUsed"), "required", js.get("extensionsRequired"))
    print("materials", [(m["name"], m.get("doubleSided", False), "emissiveFactor" in m or "KHR_materials_emissive_strength" in m.get("extensions", {})) for m in js["materials"]])
    print("images", [(i.get("name"), i.get("mimeType"), js["bufferViews"][i["bufferView"]]["byteLength"]) for i in js.get("images", [])])
    acc = js["accessors"]
    nodes = js["nodes"]
    mins = [1e9] * 3
    maxs = [-1e9] * 3

    def walk(i, depth=0):
        n = nodes[i]
        tris = 0
        info = ""
        if "mesh" in n:
            for p in js["meshes"][n["mesh"]]["primitives"]:
                tris += acc[p["indices"]]["count"] // 3
                a = acc[p["attributes"]["POSITION"]]
                for k in range(3):
                    mins[k] = min(mins[k], a["min"][k])
                    maxs[k] = max(maxs[k], a["max"][k])
            mats = [js["materials"][p["material"]]["name"] if "material" in p else None for p in js["meshes"][n["mesh"]]["primitives"]]
            info = f" tris {tris} mats {mats}"
        print("  " * depth + n.get("name", "?") + info)
        for c in n.get("children", []):
            walk(c, depth + 1)

    for r in js["scenes"][0]["nodes"]:
        walk(r)
    print("bbox min", [round(v, 2) for v in mins], "max", [round(v, 2) for v in maxs])


if __name__ == "__main__":
    main(sys.argv[1])
