# Bake pipeline (per area, offline)

Each area is pre-built on a dev box into a few small static files the browser loads at start. Nothing streams at runtime and no keys are needed.

```bash
pip install overturemaps            # once (Overture download CLI)
npm run bake:fetch keywest          # raw data -> tools/cache/keywest/ (gitignored)
npm run bake keywest                # cache -> public/areas/keywest/ (committed)
```

## Inputs (`fetch.mjs`)
| Data | Source | Request |
|---|---|---|
| OSM features | Overpass API (overpass-api.de, mirrors as fallback) | one bbox query, cached |
| Water + ocean polygons | OpenFreeMap vector tiles (OpenMapTiles schema), z14 | a handful of tiles, serial, unique User-Agent (well under OpenFreeMap's offline limits) |
| Gap-fill footprints + height estimates | Overture Maps buildings, pinned release (`areas.json` `overtureRelease`) | `overturemaps download --bbox` |
| Terrain | Mapterhorn terrarium tiles (USGS 3DEP in the USA), z13 (~8.7 m) | a few tiles |

## Outputs (`bake.mjs`, deterministic for the same cache)
- `area.json`: buildings, roads, pools, piers, trees, lamps. Coordinates in decimetres, local ENU around the area's public origin (x east, z south).
- `terrain.bin`: header `CTR1, nx, nz, cell_cm, x0_cm, z0_cm` (Int32) + Int16 heights in dm (water cells negative) + Uint8 landcover.
- `attribution.json`: credit lines, licences, OSM timestamp, Overture release.
- `manifest.json`: counts, which heuristic set each building's height, roof mix, file sizes.

## Building inference (`infer.mjs`)
Priority for **height**: OSM `height` > `building:levels` x floor height (2.9 m homes, 3.6 m other, 4.5 m industrial) + 0.6 m plinth + roof > Overture estimate (Microsoft ML) > type/footprint defaults.
Defaults: `building=yes` is classed by footprint (<22 m² shed, <320 m² house, <1500 m² commercial, bigger = large). Houses are 1 storey, or 2 with a probability that grows with footprint (5% under 80 m², 30% under 150 m², 55% above), chosen by a hash of the OSM id so it is stable. Hotels 2-5 storeys by area, apartments 3-4, churches 9 m walls, sheds 2.7 m, carports/roofs are 0.6 m canopies at 2.4 m.
**Roof shape**: OSM `roof:shape` (aliases folded to gabled / hipped / pyramidal / skillion / flat / dome) > houses and small shops 22-450 m²: gabled if the oriented box is longer than 1.35:1, else hipped > sheds: skillion (<40 m²) or gabled > everything else flat. Pitched roofs need a near-rectangular footprint (fill of its oriented box >= 0.8, no courtyards); others fall back to a clean flat roof. `roof:orientation=across` turns the ridge.
**Roof height**: `roof:height`, else `roof:levels` x 2.6 m, else ~28° pitch over the short side (0.9-4.5 m); never more than 60% of the wall.
**Colour**: `building:colour` / `roof:colour` tags, else an area palette (Key West: white and pastel painted wood walls, galvanised metal roofs; flat roofs light grey), picked by id hash.
**Overture**: only footprints not sourced from OSM, and only where no OSM footprint already covers the centroid.

## Privacy
Masks (the home area) live only in `config.private.json` (gitignored): `{"masks":[{"area":"<id>","lat":..,"lon":..,"radiusM":..}]}`. The bake drops buildings, pools and trees inside a mask and writes only a count to the manifest. Use a generous radius. Never commit coordinates.

## Phase 2: lamps, trees, facades (heuristics)
- **Lamps:** OSM `highway=street_lamp` nodes (masked like everything else) plus inferred lamps. Inferred: major roads every 32 m on alternating sides, minor streets every 42 m on one side. Each lamp is kept at least 14 m from other lamps and is skipped on water, in masked areas and on buildings. Record `[x dm, z dm, inferred 0/1, arm heading mrad]`, with the arm pointing at the nearest road.
- **Trees:** OSM `natural=tree` nodes plus `tree_row` ways (one tree every 8 m), plus a seeded scatter by land cover (per m²: wood 1/45, wetland 1/120, land 1/260, grass 1/320). A tree needs 2 m of clearance from buildings, pools and roads. 55% are palms (25% in wood/wetland). Palms are 7–15 m tall, broadleaf trees 5–12 m. Stored as a flat array `[x, z, kind, height dm, seed] …`.
- **Facades (client):** inferred type. Houses (pitched or under 7.5 m, under 400 m²) get small windows with shutters. Other buildings get a regular grid with a storefront on the ground floor. About 22–30% of windows are lit warm and a few cool. The shader uses no textures.

## Phase 3 — vegetation
- **Street trees:** along minor/major roads every 11–19 m, 50% per side, set back road w/2 + 1.7–2.5 m; skipped on buildings, pools, masked areas, water, road core (2 m grid, w/2 + 0.3 m) or within 5 m of a lamp. 65% palms.
- **Yard trees (relaxed clearance):** only the trunk cell must be free and off road core. Densities per m²: wood 1/45, grass 1/260, land 1/140, wetland 1/120. Key West bake: 25,500 trees (207 mapped, 2,847 street, 22,446 scattered).
- **ground-mask.bin:** Int32 header [0x4f434331 'OCC1', nx, nz, cell_cm=200, x0_cm, z0_cm], then a bit-packed mask (row-major, LSB first), bit = building/pool/road core. Used by the runtime grass to avoid paved/built ground.

## Phase 5
- `requiresMask` with no private mask gives a public-only bake that drops residential buildings and pools. This is recorded in `manifest.masks`.
- `treeDensity` scales scattered trees. `streetPalmShare` and `palmShare` are 0 for NJ. The `nj` palette uses siding, brick and shingle.
- `ferryDock`: the dock goes at the nearest land point within 1.5 km of the origin that has at least 70 m of open water ahead and ±14 m clear. Trees within 30 m are removed. The result is written as `dock {x,z,a,name,fiction}`.
- `inland`: passed through to area.json. The client clips the water plane and adds a land skirt.
- Overpass: overpass-api.de was unreliable, so the area OSM was fetched from overpass.kumi.systems (OSM base 2026-07-15) into `tools/cache/<area>/osm.json`.
