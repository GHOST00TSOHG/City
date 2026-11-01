# Military Park Pavilion

Exterior only. Area `newark`. Standard triangle budget. Built 2026-11-01.

The one-storey 2014 park restaurant at 55 Park Place, east of Wars of America. Flat pale roof, dark base, glass long walls. The OSM way is tagged with the current tenant. This mesh does not use that name and has no sign.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 1684 | 3 (`military-park-pavilion-main`, `emissive-windows`, `emissive-lamp`) |
| LOD1 | 248 | 3, same textures |
| LOD2 | 104 | 2 (`military-park-pavilion-main`, `emissive-windows`) |

`military-park-pavilion_COL` sits under LOD0: 28 triangles, no material. Do not draw it.

LOD2 glazing reuses the LOD1 glass mesh. LOD0 is the shell (1436), the glass (200) and four sconces (48).

Textures: one 2048 atlas (baseColor, normal, ORM) plus one 1024 glass image used as the window baseColor. KTX2 in the glb: ETC1S on both colour images, UASTC on the normal and on the ORM. LOD1 and LOD2 add no new textures.

Files: `.glb` 0.25 MB, `.blend` 0.13 MB. Source PNGs are in `art/landmarks/newark/military-park-pavilion/textures/`.

Nodes: `military-park-pavilion_LOD0`, `_LOD1`, `_LOD2`. Children `shell-lodN`, `glazing-lodN`, and `sconces-lodN` (LOD0 and LOD1). Collision is `military-park-pavilion_COL`.

Window emission strength in the glb is 0.22, warm, on top of the cool glass colour. Sconce emission strength is 1.4. Night glow is driven by the material names `emissive-windows` and `emissive-lamp`.

OSM has no height. The wall is 3.55 m and the roof 3.86 m, one storey, judged against the 17 ft monument in the 2020 photographs.

## Placement

- lat `40.7391115`, lon `-74.1691519` (centroid of OSM way 511381537)
- headingDeg `223.4`

The park-facing long wall looks toward Wars of America, southwest. 223.4° is that wall's outward normal, clockwise from true north. The origin is the footprint centroid, on the ground.

## Standing renders

Screenshots use an EEVEE pass that is not in the glb: three constant shadow bands on the shell, plus a depth contour and a light normal-crease ink. The glass and the sconces stay emissive, so the night shot still glows. Bands are not baked into the texture.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Footprint | https://www.openstreetmap.org/way/511381537 | OpenStreetMap contributors | ODbL |
| Park-facing wall | https://www.openstreetmap.org/node/4719897387 | OpenStreetMap contributors | ODbL |
| 2014 pavilion | https://www.h3hc.com/portfolio/newark-military-park/ | H3 | published project description |
| Massing photo | https://commons.wikimedia.org/wiki/File:WoA_2020b_jeh.jpg | Jim.henderson | CC BY-SA 4.0 |

## Model notes

Metres, origin at the footprint centre on the ground, park front toward Blender +Y. Export is glTF +Y up. The plan keeps the two OSM notches.

Rebuild from `build_pavilion.py` with plain Blender (`--factory-startup`). No paid add-ons. Set `PAVILION_SHOTS` to a folder to write the standing renders.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos. No tenant name.
