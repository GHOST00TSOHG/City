# Newark Penn Station

Exterior only. Area `newark`. Standard triangle budget. Built 2026-11-01.

1935 Art Deco station by McKim, Mead & White, on Raymond Plaza West. The model is the limestone station house (302 ft by 79 ft) and the buff-brick elevated train shed (the mapped 1,200 ft viaduct). Twin west arches, pediments, a clerestory over the east roof, and segmental arches where Market Street and Raymond Boulevard pass under the shed. Dock Bridge is not part of this mesh. The 1972 skybridge through the north arch is left out so the 1935 front reads.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 4457 | 3 (`newark-penn-station-main`, `emissive-windows`, `emissive-lamp`) |
| LOD1 | 1594 | 3, same textures |
| LOD2 | 302 | 2 (`newark-penn-station-main`, `emissive-windows`) |

`newark-penn-station_COL` sits under LOD0: 56 triangles, no material. Do not draw it.

Textures: one 2048 atlas (baseColor, normal, ORM) plus one 1024 window image used as baseColor and emissive. LOD1 and LOD2 reuse them. KTX2 in the glb: ETC1S on the colour and window images, UASTC on the normal and on the ORM (occlusion in R, roughness in G, metal in B).

Files: `.glb` 0.58 MB (603,168 bytes), `.blend` 0.22 MB. Source PNGs are in `art/landmarks/newark/newark-penn-station/textures/`.

Nodes: `newark-penn-station_LOD0`, `_LOD1`, `_LOD2`. Children `masonry-lodN`, `windows-lodN`, and `lamps-lodN` on LOD0 and LOD1. Collision is `newark-penn-station_COL`.

Window emission strength in the glb is 0.45. Marquee and portal lamps use `emissive-lamp`. Night glow is driven by those material names.

`npx gltf-transform inspect` (gltf-transform 4.5.1), after `optimize --compress meshopt --texture-compress ktx2 --flatten false --join false --instance false --palette false --simplify false`:

```
extensionsUsed: EXT_meshopt_compression, KHR_materials_emissive_strength,
                KHR_mesh_quantization, KHR_texture_basisu
extensionsRequired: EXT_meshopt_compression, KHR_mesh_quantization, KHR_texture_basisu

glPrimitives
  masonry-lod0 3987    windows-lod0 428    lamps-lod0 42    COL 56
  masonry-lod1 1288    windows-lod1 268    lamps-lod1 38
  masonry-lod2 260     windows-lod2 42

materials
  newark-penn-station-main   baseColor, normal, occlusion, metallicRoughness
  emissive-windows           baseColor, emissive
  emissive-lamp              factors only

textures (KTX2)
  main-basecolor     2048  ETC1S   419.47 KB
  main-normal        2048  UASTC    56.22 KB
  main-orm           2048  UASTC     8.81 KB
  windows-basecolor  1024  ETC1S    19.19 KB

bbox (glTF, metres): x -186.21..180.38, y -0.01..19.86, z -60.69..42.30
```

## Placement

- lat `40.7341966`, lon `-74.16440802`
- headingDeg `317.0` (west front faces west-northwest)

The west wall of the station house on OSM way 49200094 runs at 47.012° from south to north. The front, toward Raymond Plaza West, is that bearing minus 90°, 317.012°, published as 317.0. The origin is the plan centre of the house rectangle plus the viaduct rectangle, on that axis, at street level. See `art/landmarks/newark/newark-penn-station/refs.md`.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Footprint | https://www.openstreetmap.org/way/49200094 | OpenStreetMap contributors | ODbL |
| Plan dimensions | https://npgallery.nps.gov/NRHP/GetAsset/c0b4ec8b-58ac-4b7d-909a-040d3dcf7d4c | NRHP nomination 78001760 | public domain |
| Facade and shed description | https://npgallery.nps.gov/GetAsset/3afc9307-17be-44c4-b1fa-ab7ae7d0c947 | NRHP boundary increase, 2012 | public domain |
| 1935 Market Street portal | https://commons.wikimedia.org/wiki/File:Newark_Penn_Station_LOC_gsc.5a02636.jpg | Gottscho-Schleisner, Inc. | public domain |
| West front | https://commons.wikimedia.org/wiki/File:Newark_Penn_Station_June_2015_001.jpg | King of Hearts | CC BY-SA 3.0 |
| Raymond Boulevard portal | https://commons.wikimedia.org/wiki/File:Newark_Penn_Station_vc.jpg | Ken Lund | CC BY-SA 2.0 |
| North approach | https://commons.wikimedia.org/wiki/File:Newark_Penn_and_Dock_Bridge_vc.jpg | The All-Nite Images | CC BY-SA 2.0 |

## Model notes

Metres, origin at the footprint centre on the ground, west front toward Blender +Y. Export is glTF +Y up, so the front is glTF -Z before `headingDeg` is applied.

The shed's east and west walls are the straight run of the OSM polygon (about 74 m deep). The north and south ends of that polygon taper onto the bridges; this mesh keeps a rectangular shed of the same length. Street arches are open through the viaduct. Market Street crosses on a diagonal, so its east mouth sits further north than its west mouth.

Rebuild from `build_penn.py` with plain Blender (`--factory-startup`). No paid add-ons.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos.
