# HANDOFF

Follow [knowledge/BUILD-GUIDE.md](knowledge/BUILD-GUIDE.md). Update this file in **every** PR. Claim a task in the table **before** starting. Landmarks (Jonn's bot): [knowledge/JONN-LANDMARKS.md](knowledge/JONN-LANDMARKS.md).

## Version
**v01: base scaffold** (2026-10-31)

## What changed
- Vite + TypeScript + `three` from npm, bundled; no CDNs (Inter font from `@fontsource/inter`).
- Night mood: ACES tone mapping, exp fog, cool moon key light, hemisphere fill, warm sodium city glow, wet reflective fallback ground, gradient sky with horizon glow.
- Camera: start over Twin Lights, Highlands NJ (public landmark), looking over the Bayshore. Slow auto-drift that stops on touch, damped OrbitControls, clamped zoom and tilt. Works on laptop and phone (lower pixel ratio and coarser tiles on touch devices).
- TEMPORARY Google Photorealistic 3D Tiles backdrop (`3d-tiles-renderer`), key from `VITE_GOOGLE_TILES_KEY`. Textures darkened for night. "Google Maps" logo text plus the live tile copyright line are always shown while tiles are on.
- No key: fallback ground and sky, plus one `console.info` notice.
- `.env.example`, `.gitignore` (`.env*`), `.gitleaks.toml`, CI (gitleaks + build on PRs), CODEOWNERS, CLAUDE.md.
- Playwright smoke (`tests/smoke.spec.ts`): canvas visible, zero console errors, ≤ 150 draw calls, screenshots at laptop and phone sizes.

## Rebuild (Oct 31, 2026, approved by Luis)
Google 3D Tiles are gone. Each area is baked offline from OSM / OpenFreeMap / Overture / Mapterhorn (`knowledge/BAKE-PIPELINE.md`) and rendered with our own buildings. Phases follow the rebuild plan: 0 pipeline, 1 Key West ground/water/roads/buildings, 2 facades + night, 3 vegetation, 4 weather, 5 other areas + ferry, 6 interiors, 7 robot, 8 life.

## Who's on what
| Task | Branch | Owner | Status | Claimed |
|---|---|---|---|---|
| v01 base scaffold (Vite + three, night mood, tiles backdrop, CI) | scaffold-v01 | Grok Bot | PR open | 2026-10-31 |
| Rebuild phase 0: reset + bake pipeline | bot/websmith-rebuild-p0-pipeline | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Rebuild phase 1: Key West ground, water, roads, buildings | bot/websmith-rebuild-p1-keywest | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Rebuild phase 6: procedural interiors | bot/websmith-rebuild-p6-interiors | Grok Bot (Websmith) | PR open | 2026-10-31 |
| CI: Playwright smoke in CI | bot/websmith-ci | (unclaimed) | open | |
| Landmark #1 Newark Schools Stadium (pending Luis) | bot/jonn-newark-schools-stadium | (unclaimed, Jonn) | open | |

## How to run
`npm ci && npm run dev`  |  `npm run build`  |  `npm run test:smoke`  |  `gitleaks detect --redact --config .gitleaks.toml`
Keyed test: put the key in env only. It is referrer-restricted, so serve on `:5173` (`npx vite preview --port 5173`).

## Next
0. Move `ci/github-actions-ci.yml` to `.github/workflows/ci.yml` (the bot token lacked `workflow` scope), then enable it as a required check.
1. `tools/areas.json` + DEM terrain chunk for the Highlands/Bayshore area (BUILD-GUIDE §3).
2. OSM buildings and roads (extrude, wet asphalt), then drop Google tiles where ours cover.
3. Add Playwright smoke to CI, weather-state checks, more fixed cameras in `tests/cameras.json`.
4. Use the official Google Maps logo asset (from Google's brand guidance) instead of the text logo.

## Known bugs
- Keyed view: about 113 draw calls on laptop and 66 on phone (inside the 150 budget). Headless SwiftShader fps is low (7-20); check fps on a real GPU.
- The Google logo is currently styled text ("Google Maps", 18 px, aria-label set), not Google's image asset.
- Bundle is about 560 kB (139 kB gzip); code-split later.

## Usage notes
Built on Grok Bot (no Claude). Estimate for v01 streets: medium.

## Phase 2 (facades, lamps, trees)
- `src/area/facade.ts`: procedural window shader (TSL) driven by the per-vertex `facade` attribute from buildings.ts.
- `src/area/lamps.ts`: instanced posts with a small emissive lens, plus additive ground pools that fade out between 90 and 260 m from the camera, so none show from the air.
- `src/area/trees.ts`: palms and broadleaf trees built from alpha-tested cards on a canvas-drawn atlas, with wind sway and hi/lo LOD (hi within 170 m, re-sorted after the camera moves 12 m). 4 draw calls.
- Sea: procedural swell normals for moon glints. Terrain: 4 blur passes near the coast to remove stepping.

## Phase 3 — trees, grass, facades
- **Tree species/LOD (src/area/trees.ts):** each `TreeSpecies {name, kind:'palm'|'broad', lods:[{parts, maxDist}]}`; instances are bucketed per species × LOD (CPU re-sort when the camera moves >12 m). Built-ins: procedural palm (3 LODs) and ez-tree oak/ash (hi 85 m, mid 200 m, card impostor to 3.2 km).
- **SpeedTree / glTF drop-in:** add `public/trees/species.json` = `[{"name","kind","url","lods":[maxDist,...]}]`; each GLB's top-level children are named `LOD0`, `LOD1`, … . When present for a kind, they replace the built-ins for that kind; missing file is fine. **Do not commit licensed models** — keep them out of git (deploy-time copy only).
- **Grass (src/area/grass.ts):** one instanced draw, ~22 blades/m² within 40 m, only below 60 m camera height, on cover land/grass/wetland/pitch and off ground-mask cells; wind bend and rain wetness (uWet).
- **Rain wetness** darkens ground (×0.68) and roads (×0.62). **Tone mapping** is now Neutral (ACES greyed hues at night).
- **Facades:** window trim frame, mullions (houses cross; commercial vertical + transom; storefront thirds), inset shadow (top/left) and sill, faded with distance.

## Phase 4 — water, sky, weather
- **Ocean (src/area/water.ts):** one draw. Depth colour from an R8 texture of the baked bathymetry (0–14 m, wide fade at the bake edge so open sea has no seam), animated shoreline foam bands + storm whitecaps, Fresnel sky reflection, moon glint via the moonlight, swell normals that roughen with rain.
- **Sky (src/sky.ts):** gradient dome with a faint Milky Way band, stars with colour temperature and twinkle, moon with maria and halo, fbm cloud layer drifting with time; coverage and haze colour set per weather (`setClouds`). 4 draws.
- **Weather (src/weather.ts, scene.setWeather):** Clear / Rain / Snow / Fog buttons and one intensity slider (hidden on Clear); no helper text. Rain: GPU streaks, wet darker ground/roads (roads −50%), noise puddles that go mirror-smooth with ripple roughness and sky reflection, stronger lamp glints. Snow: GPU flakes, cover on ground/roads/roofs (up-facing), grass flattened. Fog: denser lighter fog, hazier sky, calmer wind. `window.__setWeather(kind, intensity)` for tests.
- Ground and roads are now MeshStandardNodeMaterial (needed for puddle roughness); a colour gain keeps them as bright as the old Lambert.
- Grass no longer pales under lamps: lamp light pools sit at +0.04 m so grass occludes them, and blade normals are tilted.

## Phase 5 — more areas, switcher, streaming
- Areas: `keywest`, `bayshore` (Highlands/Bayshore, general area), `sandyhook`, `newark` (Schools Stadium, Bloomfield Ave), `passaic` (Passaic waterfront). Origins are public landmarks. Defined in `tools/bake/areas.json`.
- **Privacy:** `bayshore` and `sandyhook` have `requiresMask`. If there's no `config.private.json` mask, the bake runs **public-only**: houses, sheds, garages and pools are dropped, and the manifest says so. To get the full town, add the mask locally (it's gitignored) and re-bake. Never commit coordinates.
- **Fictional ferry:** `passaic` has `ferryDock`, and the bake places a "City Ferry (fictional)" pier on the riverbank. `src/area/ferry.ts` draws it in 2 draw calls. No real operator or branding.
- **Switcher:** a top-left button bar. `?area=` is in the URL. The other areas preload while the browser is idle. A switch builds the area off-scene and runs `compileAsync`, then fades and swaps, so nothing pops. The old area is disposed (shared materials are kept). Use `window.__switchArea(id)` for tests.
- Inland areas (`inland: 1`) show water only where the bake has water, with a dark land skirt beyond the edge. Fog is a bit thicker up close (density ×0.016).

## Phase 6 — procedural interiors
- **Interior mapping (src/area/facade.ts):** each window cell marches the view ray into a fake box room (one cell wide, one storey tall, 3.6 m deep for houses, 4.8 m for others) with floor, ceiling, side walls and back wall, a per-room paint colour, a furniture band, a lamp falloff, and some blinds half-drawn. Lit rooms glow with that room colour. Unlit glass shows a dim room. Far away, it falls back to the old averaged glow. No textures and no extra draws.
- **Real rooms (src/area/interiors.ts):** ground-floor rooms are built from the footprint only when the camera is within 18 m of a building and below 25 m height. One interior at a time, so it adds **one draw call**. Hysteresis stops it flickering between buildings. Inner shell walls get window holes that line up with the facade grid (same maths), plus reveals and a skirting board. Rectangular footprints (≤ 6 vertices, ≥ 92 % fill) are split into rooms along the long axis with doorways, ceiling lamp panels and furniture (tables and chairs, sofa, bed, shop counter and shelves). Lighting is per-pixel lamp falloff in TSL on a Basic material. Scene lights aren't used, so nothing recompiles.
- Walk mode stands on the interior floor slab (`floorAt`). Sloped lots (> 0.9 m fall) and multi-ring footprints are skipped.
- Tests: `window.__enterBuilding(inside)` loads the nearest good commercial building to the origin and stands outside or inside it. `__city.interior` gives the loaded building index.
- Milestone: walk into a Newark building (`?area=newark`, then `__enterBuilding(true)`, or walk through any wall in walk mode).

### Known issues (phase 6)
- No wall collision, so you walk through walls (that's also how you get in). Real doors in the exterior shell are not cut yet.
- Only the ground floor is real. Upper floors are interior-mapped only.
- Grass can poke through the floor where the ground mask doesn't cover a footprint.
- Headless SwiftShader fps is below 1, so check fps on the Air M4.
