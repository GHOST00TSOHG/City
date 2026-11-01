# Newark Schools Stadium

Exterior only. Area `newark`. Standard triangle budget. Rebuilt 2026-11-01 for the enclosure review.

Closed bowl: a continuous ring of seats around the 400 m track, including the end zones, with one grandstand wall on the outside of that ring. An outer facade follows the OSM stadium polygon, with gate openings and the Bloomfield Avenue arch wall. The clock tower sits on that front wall, not behind it. A perimeter fence, site pad, front plaza, concourse, and a parking edge sit inside and just outside the wall. Four floodlight banks, goal posts, and a scoreboard are included. No school name or logo.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 8670 | 4 (`newark-schools-stadium-main`, `emissive-windows`, `emissive-lamp`, `emissive-sign`) |
| LOD1 | 5034 | 4, same textures, same heights |
| LOD2 | 2572 | 4, same textures, same heights |

Stand top is 7.68 m on every LOD. Window bands stay at 1.55–3.35 m and 4.15–5.50 m. Arch crowns stay at 9.14 m. Light heads stay at 24 m. There is no second slab on the west stand deck.

`newark-schools-stadium_COL` sits under LOD0: 36 triangles, no material. Do not draw it.

Textures: one 2048 atlas (baseColor, normal, ORM) plus one 1024 window image used as baseColor and emissive. LOD1 and LOD2 reuse them. KTX2 in the glb: ETC1S on baseColor, ORM, and the window image. UASTC on the normal. ORM is occlusion in R, roughness in G, metal in B. No baked daylight or shadows.

Files: `.glb` 0.76 MB (782 KB), `.blend` 0.37 MB (377 KB). Source PNGs are in `art/landmarks/newark/newark-schools-stadium/textures/`.

Nodes: `newark-schools-stadium_LOD0`, `_LOD1`, `_LOD2`. Children `body-lodN`, `windows-lodN`, `lamps-lodN`, `scoreboard-lodN`. Collision is `newark-schools-stadium_COL`.

Window, lamp, and sign emission strength in the glb is 0.45.

The glb is `uastc` on the normal slot, `etc1s` on baseColor, ORM, and emissive, then `meshopt`. `join` is not used, so the LOD nodes stay separate.

## Placement

- lat `40.76998321`, lon `-74.18452951`
- headingDeg `344.7` (Bloomfield Avenue front)

Both from OSM way 446152545. The lat/lon is the area centroid. headingDeg is the outward bearing of the north edge, rounded to 0.1°. Listed in `public/landmarks/index.json` under `newark`.

## Sources

| What | URL | Author | License |
|---|---|---|---|
| Footprint, pitch, track, stands, buildings | https://www.openstreetmap.org/way/446152545 | OpenStreetMap contributors | ODbL |
| Two metal stands, 5,600 seats, 2011 building | https://en.wikipedia.org/wiki/Newark_Schools_Stadium | Wikipedia contributors | CC BY-SA 4.0 |
| 30 ft arches, clock tower, aluminium stands | https://www.nj.com/sports/njsports/2009/07/construction_of_new_super_site.html | The Star-Ledger / NJ.com | published description; no image used |
| Arched front, clock tower and ticket booth | https://www.eiassoc.com/project/newark-schools-stadium/ | EI Associates | published description; no image used |
| 400 m track, arch wall, home and away stands | https://www.epicbuilds.com/portfolio/newark-public-schools-stadium/ | Epic Management | published description; no image used |

## Model notes

Metres, origin at the footprint centre on the ground, Bloomfield front toward Blender +Y. Export is glTF +Y up.

The continuous seat ring and the outer wall are the enclosure Luis asked for on 1 Nov 2026. The west side of the ring is deeper. End-zone seats close the corners. The tower uses the OSM ticket footprint, shifted onto the front wall so it is part of the entrance.

Arch crowns are the published 30 ft. The tower shaft plus roof is 16.9 m, an estimate so it clears the arches. Floodlight masts are 24 m. Neither height is tagged in OSM.

## Licence

Own work by Jonn (BlvckFish), licensed to the City project. No ripped models, no Google imagery, no logos.
