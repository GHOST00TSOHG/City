# Cathedral Basilica of the Sacred Heart

Exterior only. Area `newark`. Hero triangle budget. Built 2026-10-31.

French Gothic Revival church by Branch Brook Park. Twin west towers with pyramidal roofs, a copper fleche over the crossing, a west rose and two transept roses, nave and aisle roofs, and a chevet. The rectory and the north annex on the OSM ring are not part of this mesh.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 16727 | 2 (`cathedral-basilica-sacred-heart-main`, `emissive-windows`) |
| LOD1 | 7932 | 2, same textures |
| LOD2 | 1464 | 2, same textures |

`cathedral-basilica-sacred-heart_COL` sits under LOD0: 484 triangles, no material. Do not draw it.

Textures: one 2048 atlas (baseColor, normal, ORM) plus one 1024 stained-glass image used as baseColor and emissive. LOD1 and LOD2 reuse them. KTX2 in the glb: ETC1S on the colour and glass images, UASTC on the normal and on the ORM (occlusion in R, roughness in G, metal in B). gltf-transform 4.5 keeps non-colour data on UASTC so the metal and roughness channels stay intact.

Files: `.glb` 0.94 MB, `.blend` 0.69 MB. Source PNGs are in `art/landmarks/newark/cathedral-basilica-sacred-heart/textures/`.

Nodes: `cathedral-basilica-sacred-heart_LOD0`, `_LOD1`, `_LOD2`. Children `masonry-lodN` and `windows-lodN`. Collision is `cathedral-basilica-sacred-heart_COL`.

Window emission strength in the glb is 0.45. Night glow is driven by the material name `emissive-windows`.

## Placement

- lat `40.75489715`, lon `-74.17846736`
- headingDeg `201.7` (west front faces south-southwest)

The OSM outer way's long axis lies 16.25° east of true north, apse toward the north-northeast. The central west wall, between the tower chamfers, faces 201.7°. The origin is the centre of the 365 ft mass from those tower tips, on that axis. See `art/landmarks/newark/cathedral-basilica-sacred-heart/refs.md`.

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
