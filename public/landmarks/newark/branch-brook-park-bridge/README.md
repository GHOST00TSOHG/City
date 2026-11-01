# Laurel Wood Boulder Bridge

Exterior only. Area `newark`. Standard triangle budget. Built 2026-11-01.

Part of the Branch Brook Park set, with the Ballantine Gate (`branch-brook-park-pavilion`). Olmsted Brothers rustic fieldstone arch over the brook just north of Clark's Pond. Coping boulders, a concrete culvert barrel, and short earth ramps so the deck meets the path. No cherry trees.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 1392 | 1 (`branch-brook-park-bridge-main`) |
| LOD1 | 484 | 1, same textures |
| LOD2 | 314 | 1, same textures |

`branch-brook-park-bridge_COL` sits under LOD0: 32 triangles, no material. Do not draw it.

Textures: one 2048 atlas (baseColor, normal, ORM). LOD1 and LOD2 reuse it. KTX2 in the glb: ETC1S on baseColor, UASTC on the normal and on the ORM (occlusion in R, roughness in G, metal in B).

Files: `.glb` 0.21 MB, `.blend` 0.14 MB. Source PNGs are in `art/landmarks/newark/branch-brook-park-bridge/textures/`.

Nodes: `branch-brook-park-bridge_LOD0`, `_LOD1`, `_LOD2`. Child `masonry-lodN`. Collision is `branch-brook-park-bridge_COL`.

The county report does not describe lamps on this footbridge, so there is no emissive material. The night shot is moonlight on the stone.

## Placement

- lat `40.766943`, lon `-74.176953`
- headingDeg `194.2` (downstream arch face, toward Clark's Pond)

The origin is the crossing of OSM footway 1257648717 with the corridor from the north tip of Clark's Pond (way 166526695) to the water body north of it (way 166526759). The report sites the bridge between Clark's Pond and Midwood Pool. See `art/landmarks/newark/branch-brook-park-bridge/refs.md`.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Clark's Pond | https://www.openstreetmap.org/way/166526695 | OpenStreetMap contributors | ODbL |
| Crossing footway | https://www.openstreetmap.org/way/1257648717 | OpenStreetMap contributors | ODbL |
| Dimensions | https://branchbrookpark.org/uploads/1/3/1/7/131747681/bbp_clr_vol4_1_-_structures_in_the_park.pdf | Cultural Landscape Report, Vol. 4 (2005), §19 | published report |

## Model notes

Metres, origin at the footprint centre on the path, downstream face toward Blender +Y. Export is glTF +Y up, so that face is glTF -Z before `headingDeg` is applied.

The stone span is the reported 15 ft by 8 ft clear. The ramps are the eroded approaches described in the same section, brought down to the path so the deck can be walked. Coping boulders are about 3 ft. The culvert is the smooth barrel inside the arch.

Rebuild from `build_bridge.py` with plain Blender (`--factory-startup`). No paid add-ons.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos.
