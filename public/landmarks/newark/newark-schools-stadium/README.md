# Newark Schools Stadium

Exterior only. Area `newark`. Standard triangle budget. Built 2026-11-01.

The 2011 stadium at 450 Bloomfield Avenue: a 400 m track around a football pitch, metal home and away stands on the OSM bleacher footprints, a 30 ft arch wall on the Bloomfield side, a clock tower on the ticket-office footprint, a support building south of the bowl, two baseball diamonds, and four floodlight masts. The 5,000 sf community building is not a separate OSM footprint, so it is not a separate mass.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 2740 | 3 (`newark-schools-stadium-main`, `emissive-windows`, `emissive-lamp`) |
| LOD1 | 1108 | 3, same textures |
| LOD2 | 590 | 3, same textures |

`newark-schools-stadium_COL` sits under LOD0: 60 triangles, no material. Do not draw it.

Textures: one 2048 atlas (baseColor, normal, ORM) plus one 1024 window image used as baseColor and emissive. LOD1 and LOD2 reuse them. KTX2 in the glb: ETC1S on the colour and window images, UASTC on the normal and on the ORM (occlusion in R, roughness in G, metal in B).

Files: `.glb` 0.16 MB (167 KB), `.blend` 0.18 MB (183 KB). Source PNGs are in `art/landmarks/newark/newark-schools-stadium/textures/`.

Nodes: `newark-schools-stadium_LOD0`, `_LOD1`, `_LOD2`. Children `body-lodN`, `windows-lodN`, `lamps-lodN`. Collision is `newark-schools-stadium_COL`.

Window and lamp emission strength in the glb is 0.45. Night glow is driven by the material names `emissive-windows` and `emissive-lamp`.

`npx gltf-transform optimize` was run with `--flatten false --join false --simplify false` in addition to `--compress meshopt --texture-compress ktx2`. The default `join` step merges every mesh that shares a material, which would have folded the three LOD nodes into one. Triangle counts above are the glb after that command (`glPrimitives` in inspect).

## Placement

- lat `40.76998321`, lon `-74.18452951`
- headingDeg `344.7` (Bloomfield Avenue front faces 15.3° west of north)

Both come from OSM way 446152545. The lat/lon is the area centroid of that ring. headingDeg is the outward bearing of the north edge (vertices 1 to 2), rounded to 0.1°. The bake origin in `tools/bake/areas.json` is a nearby point, not this centroid. See `art/landmarks/newark/newark-schools-stadium/refs.md`.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Footprint, pitch, track, stands, buildings | https://www.openstreetmap.org/way/446152545 | OpenStreetMap contributors | ODbL |
| Two metal stands, 5,600 seats, 2011 building | https://en.wikipedia.org/wiki/Newark_Schools_Stadium | Wikipedia contributors | CC BY-SA 4.0 |
| 30 ft arches, clock tower, aluminium stands | https://www.nj.com/sports/njsports/2009/07/construction_of_new_super_site.html | The Star-Ledger / NJ.com | published description; no image used |
| Arched front, clock tower and ticket booth | https://www.eiassoc.com/project/newark-schools-stadium/ | EI Associates | published description; no image used |
| 400 m track, arch wall, home and away stands | https://www.epicbuilds.com/portfolio/newark-public-schools-stadium/ | Epic Management | published description; no image used |

## Model notes

Metres, origin at the footprint centre on the ground, Bloomfield front toward Blender +Y. Export is glTF +Y up, so the front is glTF -Z before `headingDeg` is applied.

Arch crowns are the published 30 ft. The semicircle springs from a 0.55 m plinth because a pier height was not published. The clock tower is 15.2 m plus a 1.7 m roof, an estimate so it clears the arches; OSM has no height. Floodlight masts are 24 m, a typical pole height, also untagged. The track is the standard 400 m oval aligned to the football pitch, not a trace of the rough OSM ring.

Rebuild from `build_stadium.py` with plain Blender (`--factory-startup`). No paid add-ons.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos.
