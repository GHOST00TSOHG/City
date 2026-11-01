# Wars of America

Exterior only. Area `newark`. Standard triangle budget. Built 2026-11-01.

Gutzon Borglum's 1926 bronze group in Military Park: 42 simplified figures and 2 horses on a rocky mound, on a granite ashlar plinth. Figures are anonymous masses, not portraits. No inscription text.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 10184 | 2 (`wars-of-america-main`, `emissive-lamp`) |
| LOD1 | 2688 | 2, same textures |
| LOD2 | 1140 | 1 (`wars-of-america-main`) |

`wars-of-america_COL` sits under LOD0: 36 triangles, no material. Do not draw it.

LOD0 is the body (10124) plus five uplight lenses (60). LOD1 keeps three lenses (36). LOD2 is the body only.

Textures: one 2048 atlas (baseColor, normal, ORM). LOD1 and LOD2 reuse it. KTX2 in the glb: ETC1S on baseColor, UASTC on the normal and on the ORM (occlusion in R, roughness in G, metal in B). Granite is rough and dielectric. Bronze is metallic. No daylight is baked into the baseColor.

Files: `.glb` 1.82 MB, `.blend` 0.49 MB. Source PNGs are in `art/landmarks/newark/wars-of-america/textures/`.

Nodes: `wars-of-america_LOD0`, `_LOD1`, `_LOD2`. Children `body-lodN` and `uplights-lodN` (LOD0 and LOD1). Collision is `wars-of-america_COL`.

Uplight emission strength in the glb is 1.6. Night glow is driven by the material name `emissive-lamp`.

The published overall height is 17 ft (5.18 m). The mesh tops out at 5.16 m.

## Placement

- lat `40.7387587`, lon `-74.1697587` (OSM node 4719897387)
- headingDeg `212.8`

The planted sword (OSM way 625105571) leaves the monument toward the southwest. Its long edges run 33.5° and 212.1°. The primary elevation, the sword face, looks down the blade. 212.8° is that direction, clockwise from true north. The origin is the OSM node, on the ground at the plinth centre.

## Standing renders

Screenshots use an EEVEE pass that is not in the glb: three constant shadow bands on the albedo, plus a depth contour and a light normal-crease ink. Stone and bronze stay PBR metal/rough in the file. The bands are not baked into the texture.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Placement | https://www.openstreetmap.org/node/4719897387 | OpenStreetMap contributors | ODbL |
| Sword axis | https://www.openstreetmap.org/way/625105571 | OpenStreetMap contributors | ODbL |
| 42 ft by 18 ft by 17 ft | https://npgallery.nps.gov/GetAsset/c9ba4252-6f30-4db4-999a-d7f8889d53bf | NRHP nomination 94001257 | public domain |
| Sword face | https://commons.wikimedia.org/wiki/File:WoA_2020a_jeh.jpg | Jim.henderson | CC BY-SA 4.0 |
| Southwestern section | https://commons.wikimedia.org/wiki/File:Warsofamernewarkjeh.JPG | Jim.henderson | public domain |
| Figure groups | https://commons.wikimedia.org/wiki/File:Americas_Wars_Newark_NJ_1.JPG | Smallbones | CC0 |

## Model notes

Metres, origin at the plinth centre on the ground, sword face toward Blender +Y. Export is glTF +Y up, so that face is glTF -Z before `headingDeg` is applied.

Rebuild from `build_monument.py` with plain Blender (`--factory-startup`). No paid add-ons. Set `WARS_SHOTS` to a folder to write the standing renders.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos.
