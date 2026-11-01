# Ballantine Gate

Exterior only. Area `newark`. Standard triangle budget. Built 2026-11-01.

Part of the Branch Brook Park set, with the Laurel Wood Boulder Bridge (`branch-brook-park-bridge`). This is the park entrance: two one-story brick pavilions with limestone trim and kicked hip roofs, a 40 ft wrought-iron gate, pedestrian flat arches, and the side fences. The county report calls the two buildings pavilions. No cherry trees. No donor lettering and no park logo.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 5772 | 2 (`branch-brook-park-pavilion-main`, `emissive-windows`) |
| LOD1 | 2100 | 2, same textures |
| LOD2 | 1148 | 2, same textures |

`branch-brook-park-pavilion_COL` sits under LOD0: 40 triangles, no material. Do not draw it. It covers the pavilions and the stone piers. The iron gate and the pedestrian openings are open so a player can walk through.

Textures: one 2048 atlas (baseColor, normal, ORM). Window glass is an untextured emissive material. LOD1 and LOD2 reuse the atlas. KTX2 in the glb: ETC1S on baseColor, UASTC on the normal and on the ORM (occlusion in R, roughness in G, metal in B).

Files: `.glb` 0.46 MB, `.blend` 0.24 MB. Source PNGs are in `art/landmarks/newark/branch-brook-park-pavilion/textures/`.

Nodes: `branch-brook-park-pavilion_LOD0`, `_LOD1`, `_LOD2`. Children `masonry-lodN` and `windows-lodN`. Collision is `branch-brook-park-pavilion_COL`.

Window emission strength in the glb is 0.45. Night glow is driven by the material name `emissive-windows`.

## Placement

- lat `40.771081`, lon `-74.173518`
- headingDeg `111.7` (street face, toward Lake Street)

The origin is the OSM corner of Lake Street (way 1049904856) and Ballantine Parkway (ways 11622434 and 157547170). The parkway leaves that corner toward the park on a bearing of 291.7°. The street face looks the other way, 111.7°. See `art/landmarks/newark/branch-brook-park-pavilion/refs.md`.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Lake Street | https://www.openstreetmap.org/way/1049904856 | OpenStreetMap contributors | ODbL |
| Ballantine Parkway | https://www.openstreetmap.org/way/157547170 | OpenStreetMap contributors | ODbL |
| Gate 40 ft by 11 ft | https://branchbrookpark.org/uploads/1/3/1/7/131747681/essex_county_branch_brook_park_-_national_registrar_of_historic_places_inventory_nomination_form_nov1980.pdf | NRHP nomination, November 1980 | public domain |
| Arches, courses, eaves | https://branchbrookpark.org/uploads/1/3/1/7/131747681/bbp_clr_vol4_2_-_structures_in_the_park.pdf | Cultural Landscape Report, Vol. 4 part 2 (2005), §25 | published report |
| Street face | https://commons.wikimedia.org/wiki/File:Ballantine_gate_BBPk_jeh.JPG | Jim.henderson | CC0 |
| Street face | https://commons.wikimedia.org/wiki/File:Ballantine_Gates_@_Branch_Brook_Park.JPG | Dinopup | CC BY-SA 3.0 |

## Model notes

Metres, origin at the road centre on the ground, street face toward Blender +Y. Export is glTF +Y up, so that face is glTF -Z before `headingDeg` is applied.

The two pavilions are mirrored. The real gate is nearly symmetrical; the model does not copy a carved inscription. Pedestrian openings are the reported 5 ft by 8 ft 6 in flat arches. Roofs are steep hips with a kicked eave and 4 ft rafter tails. Dormers sit on the street and park slopes.

Rebuild from `build_pavilion.py` with plain Blender (`--factory-startup`). No paid add-ons.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos.
