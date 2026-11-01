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

## Decisions (Luis, 2026-11-01)
- **NJ is connected by road, with a shortened, compressed connector, not the real ~40 km.** The shore cluster (Bayshore and Sandy Hook) and the Newark cluster (Newark and Passaic) sit in one NJ frame. A short drivable connector road joins them, a few km of procedural highway through generic low-detail terrain. The real offsets inside each cluster (about 200 m and 0.7 km) are kept. This replaces option 6d (the real-length Overture corridor) and the "two regions plus fade travel" option.
- **Key West stays a separate area, placed not super far away, and is reached by flying over it (no road).** It gets its own offset in the same world frame, past the NJ coastline over open water, so the player can fly there. No road or bridge links it. Ocean tiles between the areas are terrain-only (water plane plus fog), so the flight streams cheaply.
- **Re-baking the area map data from online sources (OSM, Overture, Mapterhorn) is approved.**
- **Timing:** all of this, including the re-bake, starts after Luis's Air test of the current preview. Nothing is re-baked or built yet.

### Phase changes from these decisions
- 6a: world.json places the compressed NJ layout and the Key West offset. It re-bakes shore and newark as merged extents.
- 6b and 6c: unchanged.
- 6d: the compressed NJ connector road plus terrain-only ocean tiles for the Key West flight. This replaces the real-length corridor.

## Progress (bot/websmith-one-world)
- [x] `tools/world/world.json`: one NJ frame centred on Twin Lights. Shore cluster at real offsets; Newark cluster shifted by (+9.0, +34.5) km so the real ~40 km becomes a **3.6 km** connector (`nj-connector`, 2-lane highway polyline, bayshore west edge → passaic east edge). Key West placed at (+9.0, -6.0) km over open water east of Sandy Hook, `flyOnly` (about 5.8 km of ocean from Sandy Hook's box). `node tools/world/check.mjs` checks no cross-cluster overlaps and that the connector ends at both areas.
- [x] `src/world.ts`: typed accessors (`worldOffset`, `roadNeighbours`, `rebase`). Not wired into the scene yet.
- [x] Merged bake extents in `tools/bake/areas.json`: `metro` (newark + passaic) and `shore` (bayshore + sandyhook, Sandy Hook moves 10 m → 8 m grid).
- [x] Re-baked `metro` from fresh open data (OSM via Overpass, OpenFreeMap water, Overture 2026-10-21.0 buildings, Mapterhorn terrain z13). Licences in `public/areas/metro/attribution.json` (ODbL for OSM/Overture; Mapterhorn attribution list). 28.6k buildings, 8.3k roads, 7.1 MB area.json (2.1 MB gzip). Not loaded by the app yet; the shipped newark/passaic bakes are unchanged.
- [ ] Re-bake `shore`: needs the gitignored private mask (`config.private.json`) on the baking machine; without it the bake is public-only (drops houses), so it was not run here.
- [ ] Generate the connector road + low-detail terrain strip from `nj-connector` (6d), then place area groups by `worldOffset` (6a wiring), then the streamer (6b).
