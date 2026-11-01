# Cathedral Basilica of the Sacred Heart

Exterior only. Area `newark`. Hero triangle budget. First build 2026-10-31. Detail upgrade 2026-11-01.

French Gothic Revival church by Branch Brook Park. Twin west towers with pyramidal roofs, a copper fleche over the crossing, a west rose and two transept roses, nave and aisle roofs, and a chevet. The rectory and the north annex on the OSM ring are not part of this mesh.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 27653 | 4 |
| LOD1 | 8062 | 4 |
| LOD2 | 1606 | 4 |

Materials, shared by every LOD: `cathedral-basilica-sacred-heart-main` (sandstone), `cathedral-basilica-sacred-heart-metal` (copper and bronze), `emissive-windows` (transmissive stained glass), `emissive-lamp` (warm uplight fixtures).

`cathedral-basilica-sacred-heart_COL` sits under LOD0: 484 triangles, position only (no normals, no UVs, no material). Do not draw it.

Textures: one 2048 atlas (baseColor ETC1S, normal UASTC, ORM ETC1S) plus one 1024 stained-glass image (ETC1S, baseColor and emissive). LOD1 and LOD2 reuse them. The sandstone albedo carries weathering and colour variation. Metal uses the copper and bronze parts of the same atlas with metallic 1 and roughness 0.34. Glass transmission is 0.72, roughness 0.08, emission strength 1.15 so the colour reads as light from inside the reveal.


Nodes: `cathedral-basilica-sacred-heart_LOD0`, `_LOD1`, `_LOD2`. Children `masonry-lodN`, `metal-lodN`, `windows-lodN`, `uplights-lodN`. Collision is `cathedral-basilica-sacred-heart_COL`.

## Placement

- lat `40.75489715`, lon `-74.17846736`
- headingDeg `196.35` (west front faces south-southwest, along the OSM long axis)

The OSM outer way's long axis lies about 16.25° east of true north, so the front, opposite that axis, faces 196.35°. An earlier 201.7° followed a short chamfer on the west wall and sat about 5.4° off the building. The origin is still the centre of the 365 ft mass from the west tower tips. See `art/landmarks/newark/cathedral-basilica-sacred-heart/refs.md`.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Footprint | https://www.openstreetmap.org/relation/5506232 | OpenStreetMap contributors | ODbL |
| Plan dimensions | https://npgallery.nps.gov/NRHP/GetAsset/b5fa0ed7-4a53-4132-acfe-a572de0d7a57 | NRHP nomination 76001151 | public domain |
| Height 79 m / towers 71 m | https://structurae.net/en/structures/cathedral-basilica-of-the-sacred-heart | Structurae | published dimensions |
| West front and aerials | https://commons.wikimedia.org/wiki/File:Cathedral_Basilica_of_the_Sacred_Heart_(Newark)_-_front.jpg | Arttin497 | CC BY-SA 4.0 |
| Facade, flank, fleche | https://commons.wikimedia.org/wiki/File:Facade_of_Sacred_Heart_Cathedral,_Newark.jpg | Bestbudbrian | CC BY-SA 4.0 |
| Southwest view | https://commons.wikimedia.org/wiki/File:Sacred_Heart_SW_jeh.jpg | Jim.henderson | CC0 |

## Model notes

Metres, origin at the footprint centre on the ground, west front toward Blender +Y. Export is glTF +Y up, so the front is glTF -Z before `headingDeg` is applied.

The nomination's chevet is a Lady Chapel plus five further chapels. This mesh has an axial Lady Chapel and four radiating chapels so the east end stays readable. Nave flying buttresses are left out; the built church dropped them. Tower roofs are tile pyramids, not spires. The fleche is a simplified open copper lantern and needle, not a copy of the figure sculpture.

Rebuild from `build_cathedral.py` with plain Blender (`--factory-startup`). No paid add-ons.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos.
