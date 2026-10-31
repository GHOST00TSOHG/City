# Data sources
Every data source, model reference, and license used in City. Add a row before merging.

| Item | Source | License | Notes |
|---|---|---|---|
| Streets, buildings, water, shorelines | OpenStreetMap (https://www.openstreetmap.org) | ODbL 1.0, credit "(c) OpenStreetMap contributors" | |
| Ferry terminal facts | Seastreak routes page (https://seastreak.com/ferry-routes-and-schedules/) | Facts only, no logos or images | Highlands terminal and Sandy Hook landing are real |
| Newark to Sandy Hook ferry route + Newark Ferry Dock | Original, made up for City | MIT (our own) | **FICTION**, no real route exists |
| Inter font | @fontsource/inter (npm), bundled | SIL OFL 1.1 | UI font, no CDN |
| Water and ocean polygons | OpenFreeMap vector tiles (https://openfreemap.org), OpenMapTiles schema | Free, no key; data ODbL; credit "OpenFreeMap © OpenMapTiles Data from OpenStreetMap" | Baked offline, z14 |
| Gap-fill building footprints + height estimates | Overture Maps buildings (https://docs.overturemaps.org/attribution/) | ODbL 1.0; credit "© OpenStreetMap contributors, Overture Maps Foundation" | Pinned release per area |
| Terrain | Mapterhorn (https://mapterhorn.com/attribution): USGS 3DEP (public domain) in the USA, Copernicus GLO-30 fallback | See Mapterhorn attribution list | Terrarium tiles, z13 |

Google Photorealistic 3D Tiles were removed in the Oct 31, 2026 rebuild. See `CREDITS.md` and `knowledge/BAKE-PIPELINE.md`.
