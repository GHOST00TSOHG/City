# Newark Penn Station

Exterior only. Area `newark`. Rebuilt solid and enhanced 2026-11-01 (branch `bot/websmith-penn-fix`).

1935 Art Deco station by McKim, Mead & White, on Raymond Plaza West. The model is the limestone station house (302 ft by 79 ft) and the buff-brick elevated train shed (the mapped 1,200 ft viaduct). West front in an a-b-c-b-a rhythm: four tall windows, the twin stilted arches with pediments (clock and sun dials), five windows, the second arch, three windows and a door bank with a round marquee. Pink granite base, limestone body with pilasters, Greek-key frieze and stepped cornice, buff brick clerestory and shed, green terra cotta panels, and segmental street arches where Market Street and Raymond Boulevard pass under the shed. Dock Bridge is not part of this mesh. The 1972 skybridge through the north arch is left out so the 1935 front reads.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 28168 | 3 (`newark-penn-station-main`, `emissive-windows`, `emissive-lamp`) |
| LOD1 | 7206 | 3 |
| LOD2 | 1650 | 3 |

LOD switch distances are measured from the model origin, and the model is 366 m long, so `switchM` is `[220, 700]` in `manifest.json`.

`newark-penn-station_COL` sits under LOD0: 48 triangles, no material. Do not draw it.

Textures: one 2048 atlas (baseColor, normal, ORM) plus one 1024 window atlas used as baseColor and emissive. All procedural, painted by `art/landmarks/newark/newark-penn-station/penn_textures.py` at a fixed px/m per region and tiled in world metres. The glb embeds them as JPEG (q90, 3.8 MB total). There is no KTX2 or meshopt step for this file (no `toktx` / `gltf-transform` on the build machine); the loader reads it as a plain glb.

Nodes: `newark-penn-station_LOD0`, `_LOD1`, `_LOD2`. Children `masonry-lodN`, `windows-lodN`, `lamps-lodN`. Collision is `newark-penn-station_COL`.

Night: window emission 0.45 (calm warm amber, a few dark panes), lamps 1.5. Lamps are canopy undersides, wall lanterns and the lamps hung in the street arches, all in `emissive-lamp`, present in every LOD.

## How it is kept solid

- House and shed are closed masses. Windows, doors and arches are real holes with reveals, sills and heads; glass sits at the back of the recess (flush in LOD2).
- Trim is built from closed boxes and prisms that start inside the wall. Nothing floats in front of a wall.
- Walls start 0.30 m under the origin plane so the ground line never opens up.
- `python3 art/landmarks/newark/newark-penn-station/audit_penn.py` shoots rays at every LOD from outside and fails on any back-face-first hit, any hole in the roof, or any part whose bounding box hovers off the rest.

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

Reference photos were used for measurement and proportion only; no image data from them is in the model or textures.

## Rebuild

`python3 build_penn.py` repaints the textures (needs numpy + Pillow). Then
`blender -b --factory-startup --python build_penn.py` writes the glb here. No `.blend` is kept in the repo.

## Licence

Own work by Jonn (BlvckFish), rebuilt for the City project. No ripped models, no Google imagery, no logos.
