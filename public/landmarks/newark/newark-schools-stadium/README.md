# Newark Schools Stadium

Exterior only. Area `newark`. Standard triangle budget. Rebuilt 2026-11-01. Ground level is +0.8 m.

Closed bowl: a continuous ring of seats around the 400 m track, including the end zones, with one grandstand wall on the outside of that ring. An outer facade follows the OSM stadium polygon, with gate openings and the Bloomfield Avenue arch wall. The clock tower sits on that front wall, not behind it. A perimeter fence, site pad, front plaza, concourse, and a parking edge sit inside and just outside the wall. Four floodlight banks, goal posts, a scoreboard, and a press box on the west (home) stand are included. No school name or logo.

Ground level is +0.8 m above the origin. The pad, plaza, concourse, parking edge, track, and pitch all sit at or above that, and the bases of the stands, walls, fence, and tower sit on it. A solid skirt runs from that level down to y = -1.0. Where two ground sheets overlap they are at least 5 cm apart, so the surfaces do not flicker.

## Numbers

| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | 8736 | 4 (`newark-schools-stadium-main`, `emissive-windows`, `emissive-lamp`, `emissive-sign`) |
| LOD1 | 5116 | 4, same textures, same heights |
| LOD2 | 2654 | 4, same textures, same heights |

Ground level is +0.8 m. Stand top is 8.48 m on every LOD. Window bands stay at 2.35–4.15 m and 4.95–6.30 m. Arch crowns stay at 9.94 m. Light heads stay near 24.8 m. The press box is the same on every LOD: floor 8.53 m, sill 9.43 m, head 10.58 m, roof 11.38 m, on the west stand, with framed glass on `emissive-windows`. There is no second slab on the west stand deck.

`newark-schools-stadium_COL` sits under LOD0: 436 triangles, no material. Do not draw it. The boxes follow the seat ring, the outer wall, the arch wall, the clock tower, the support building, and the press box. Their floors are at y = 0. The pitch and the track are open. The old 176 × 193 × 7.7 m box is gone.

Textures: one 2048 atlas (baseColor, normal, ORM) plus one 1024 window image used as baseColor and emissive. LOD1 and LOD2 reuse them. KTX2 in the glb: ETC1S on baseColor, ORM, and the window image. UASTC on the normal. ORM is occlusion in R, roughness in G, metal in B. No baked daylight or shadows.

Files: `.glb` 0.77 MB (790 KB), `.blend` 0.38 MB (386 KB). Source PNGs are in `art/landmarks/newark/newark-schools-stadium/textures/`.

Nodes: `newark-schools-stadium_LOD0`, `_LOD1`, `_LOD2`. Children `body-lodN`, `windows-lodN`, `lamps-lodN`, `scoreboard-lodN`. Collision is `newark-schools-stadium_COL`.

Lamp and sign emission in the glb is 0.90 (twice the previous 0.45), baked into the emissive factor. Window emission stays 0.45.

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
