# Branch Brook Park Octagon Shelter

Exterior only. Area `newark`. Small triangle budget. Built 2026-11-01.

1906 open octagonal pavilion on Meeker Mound, Branch Brook Park, Newark. Carrère & Hastings, 1899 design, built 1906 for the Olmsted Brothers park. Rose brick, limestone trim, granite plinth, terra-cotta hip roof. Four low walls and four openings. The north opening faces the path up the mound.

The mesh is the intact 1906 design (terra cotta, complete timber). The 2005 park report recorded a failed asphalt roof and missing members. Those are not modeled. Cherry trees and the mound planting are not in this mesh.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 3836 | 2 (`branch-brook-park-octagon-shelter-main`, `emissive-lamp`) |
| LOD1 | 1932 | 2, same textures |
| LOD2 | 292 | 2, same textures |

`branch-brook-park-octagon-shelter_COL` sits under LOD0: 128 triangles, position only, no material, no normals, no UVs. Do not draw it. It is the eight piers and the four low walls, so the openings stay open.

Textures: one 1024 atlas (baseColor, normal, ORM). LOD1 and LOD2 reuse it. KTX2 in the glb: ETC1S on baseColor, UASTC on the normal and on the ORM (occlusion in R, roughness in G, metal in B). gltf-transform 4.5 keeps non-colour data on UASTC so the metal and roughness channels stay intact.

Files: `.glb` 0.18 MB, `.blend` 0.20 MB. Source PNGs are in `art/landmarks/newark/branch-brook-park-octagon-shelter/textures/`.

Nodes: `branch-brook-park-octagon-shelter_LOD0`, `_LOD1`, `_LOD2`. Children `masonry-lodN` and `lantern-lodN`. Collision is `branch-brook-park-octagon-shelter_COL`. LOD0 and LOD1 share one lantern mesh after dedup. The glass boxes match.

Lamp emission strength in the glb is 1.4. Night glow is driven by the material name `emissive-lamp`. The 2005 report does not list a light fixture. The lantern is one generic hanging lamp so the night material exists.

## Placement

- lat `40.75503755`, lon `-74.18201133`
- headingDeg `0` (north opening faces true north)

The centre is the polygon centroid of OSM way 1257648454. The report says the path rises from the north, and that side 6, a low wall, is the southwest face. The four openings are the cardinal faces. The front in the mesh is the north opening.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Footprint centre | https://www.openstreetmap.org/way/1257648454 | OpenStreetMap contributors | ODbL |
| Plan, height, materials, roof | https://branchbrookpark.org/uploads/1/3/1/7/131747681/bbp_clr_vol4_1_-_structures_in_the_park.pdf | CLR Volume 4, January 2005, for Essex County Parks | public report |
| Park history | https://essexcountyparks.org/parks/branch-brook-park/about | Essex County Parks | public park page |

## Model notes

Metres, origin at the footprint centre on the ground, north opening toward Blender +Y. Export is glTF +Y up, so the front is glTF -Z before `headingDeg` is applied.

Outer side 13 ft 10 in. Flat-to-flat comes out 33.4 ft. The report's "about 33 ft 9 in across" is the field approximation. Overall height 22 ft 6 in to the tile peak. Rafters run 4 ft past the face. Low walls are on the diagonals and have a recess on both faces. Piers are about 1 ft 10 in, wider than the 1 ft 4 in walls. The report does not give the pier width.

Review stills use a cel ramp and depth-plus-normal ink in Blender after the glb is written. That shading is not in the blend or the glb. The game file stays PBR.

Rebuild from `build_octagon.py` with plain Blender (`--factory-startup`). No paid add-ons.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos.
