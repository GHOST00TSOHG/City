# Credits and attribution

City's places are built offline from open data by `tools/bake/` (see `knowledge/BAKE-PIPELINE.md`).
No Google data, keys, tiles or models are used. No personal photos.

## Map and terrain data (shown on screen, bottom bar)
| Source | Credit line | Licence | Used for |
|---|---|---|---|
| OpenStreetMap | © OpenStreetMap contributors | [ODbL 1.0](https://www.openstreetmap.org/copyright) | building footprints and tags, roads, landcover, pools, piers, trees, street lamps |
| OpenFreeMap / OpenMapTiles | OpenFreeMap © OpenMapTiles Data from OpenStreetMap | [OpenFreeMap](https://openfreemap.org) (free, no key); [OpenMapTiles](https://openmaptiles.org) schema; data ODbL | water and ocean polygons |
| Overture Maps Foundation | © OpenStreetMap contributors, Overture Maps Foundation | [ODbL 1.0](https://docs.overturemaps.org/attribution/) (buildings theme; includes Microsoft ML Buildings) | gap-fill footprints and height estimates |
| Mapterhorn | © Mapterhorn | open data, see [mapterhorn.com/attribution](https://mapterhorn.com/attribution) | terrain tiles |
| USGS 3DEP (via Mapterhorn) | U.S. Geological Survey, 3D Elevation Program | Public Domain (U.S. Government Work) | terrain, USA |
| Copernicus GLO-30 (via Mapterhorn, where 3DEP is missing) | © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018, provided under COPERNICUS by the EU and ESA | Copernicus free and open licence | terrain fallback |

**ODbL notice.** The files in `public/areas/*/` are a Derived Database of OpenStreetMap (and Overture) data and are available under the [Open Database License 1.0](https://opendatacommons.org/licenses/odbl/1-0/). Rebuild them with `npm run bake:fetch <area> && npm run bake <area>`. Each area folder has its own `attribution.json` with the data dates.

## Code and assets
| Item | Licence |
|---|---|
| three.js | MIT |
| Vite, TypeScript | MIT / Apache-2.0 |
| Inter font (@fontsource/inter, bundled) | SIL OFL 1.1 |
| sharp, pbf, @mapbox/vector-tile (bake tools only) | Apache-2.0 / BSD-3 |
| overturemaps CLI (bake tools only, `pip install overturemaps`) | MIT |
| City code | MIT, © 2026 Luis Bryant-Petrillo |

## Vegetation (phase 3)
- **ez-tree** by Daniel Greenheck — https://github.com/dgreenheck/ez-tree — MIT licence. npm `@dgreenheck/ez-tree@1.1.0`, bundled locally (no CDN). Procedural oak/ash geometry plus the package's bundled bark/leaf textures (MIT, shipped inside the package). Its materials and wind are replaced with our own TSL shaders.
- Grass, palms and card impostors are procedural (our code). No third-party licensed (non-open) assets are committed; SpeedTree models, if bought, are loaded at runtime from `public/trees/` and must not be committed.
