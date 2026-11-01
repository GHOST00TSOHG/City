# One connected world: plan (task 6)

This is a big change, so this PR contains only the plan, for review before any code. Nothing in the runtime changes.

## Where the areas really are
Positions are computed from `tools/bake/areas.json`, measured from the Twin Lights origin (x = east, z = south, in km):

| area | origin offset | baked extent | grid |
|---|---|---|---|
| bayshore (Highlands) | 0, 0 | 2.6 × 2.6 km | 8 m |
| sandyhook | -1.4, -7.2 | 4.7 × 7.0 km | 10 m |
| passaic | -14.9, -37.5 | 2.4 × 2.2 km | 8 m |
| newark | -16.8, -41.5 | 2.2 × 3.2 km | 8 m |
| keywest | -662, +1762 | 4.3 × 2.9 km | 8 m |

What this means:
- **Bayshore and Sandy Hook** almost touch: there is only a gap of about 200 m between their bounding boxes (40.415 to 40.417 N).
- **Newark and Passaic** are about 0.7 km apart.
- **The two NJ clusters** are about 40 km apart.
- **Key West** is 1,900 km away, so connecting it to NJ by land isn't realistic.

## Proposal
1. **World frame (small, low risk).**
   - Add a `world.json` that gives each area an integer offset in metres in one ENU frame per region: an NJ region and a FL region.
   - Area content stays local and its group gets translated. Robot and camera code keeps local coordinates through a `regionOrigin` shift, which avoids float precision trouble at 40 km.
   - Area switching keeps working.
2. **Tile streaming (main work).**
   - The world is split into 512 m tiles, keyed by (region, ix, iz). Each tile carries its own terrain patch, roads, buildings chunk, trees and grass. The current per-area bake is already chunked, so this is a re-split of the bake output, not new data.
   - A streamer keeps a ring of tiles loaded around the focus: about 1.5 km detailed plus about 4 km of terrain only. Each tile is built and compiled off-scene, the same way `switchArea` already prewarms, then added during an idle frame.
   - Tiles are dropped once they are behind the fog distance plus some hysteresis.
   - Draw calls stay at 150 or fewer by sharing materials (one set) and merging buildings per tile. Far tiles use only terrain and an impostor card layer.
3. **No seams.**
   - Terrain tiles share edge vertices from one global height grid per region, re-baked with matching cell sizes (Sandy Hook goes from 10 m to 8 m).
   - Roads crossing a tile border are clipped at the border and resampled on both sides from the same global polyline.
   - Overlapping bboxes are de-duplicated by OSM id at bake time.
4. **No pops.**
   - New tiles fade in with a dithered alpha over 0.5 s, beyond about 1 km and inside the fog.
   - LOD changes reuse the tree system's distance bands.
   - Height data (the walk surface) loads before meshes, so walkers never fall through.
5. **Filling the gaps.**
   - The 200 m and 0.7 km gaps: extend the bboxes and re-bake, giving one bake each for "shore" and "newark".
   - The 40 km NJ corridor: one optional low-detail pass (terrain, major roads and building footprints from Overture, around 30–60 MB uncompressed). Otherwise keep the two clusters as separate regions joined by the existing fade travel.
   - Recommended: separate regions for now; add the corridor later if wanted.
   - Key West stays its own region (fade travel).

## Phases, each its own PR
- **6a:** world.json and region frames; re-bake shore and newark as merged extents. Areas still switch with fades.
- **6b:** tile split in the bake, plus the runtime streamer for one region. Includes a Playwright test that walks 3 km and checks 0 errors, draw calls of 150 or fewer, and no frames over the budget during tile adds.
- **6c:** seam and pop polish (dithered fade, shared edges); remove the area-switch UI inside a region.
- **6d (optional):** the low-detail NJ corridor.

## Decisions needed
- Is a 40 km drive between Newark and the shore wanted, or are two regions plus fade travel fine?
- Is re-baking with network access (OSM, Overture, Mapterhorn) allowed from CI or the box?
