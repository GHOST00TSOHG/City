# City BUILD-GUIDE

Any bot (Websmith, Jonn's bot) or person can follow this cold. If a rule here conflicts with a request, the rule wins; ask Luis.

---
## 1. Repo rules
- **Owner:** Luis (public repo `City`, MIT). **Only collaborator:** Jonn (write). Others fork.
- **Branches:** `bot/websmith-<task>` or `bot/jonn-<task>`. Never push to `main`. No force pushes anywhere shared.
- **PRs to main:** Luis approves every merge (CODEOWNERS = Luis). CI must pass. **Squash merge** only.
- **Claim first:** add a row to the HANDOFF.md table (task, branch, owner, date) in your first commit.
- **Every PR updates HANDOFF.md.**
- **Releases:** annotated tag + GitHub Release with a screenshot.
```bash
git switch main && git pull
git switch -c bot/websmith-v01-streets
# ...work, commit...
git push -u origin bot/websmith-v01-streets
gh pr create --base main --fill            # attach screenshots in the body
# after Luis merges:
git switch main && git pull
git tag -a city-v01-streets -m "v01: streets"
git push origin city-v01-streets
gh release create city-v01-streets --title "v01 streets" --notes-file HANDOFF.md docs/shots/v01.png
```
Tag format: `city-vNN-<section>` (two digits).

---
## 2. Data rules (Luis)
- **Free public data only:** NJ elevation (USGS 3DEP 1 m / NJ LiDAR DEMs), NJ tree canopy / land cover (NJDEP, USGS NLCD), OpenStreetMap (**ODbL: show "© OpenStreetMap contributors"** in the app credits and README).
- **No personal photos** in the repo or as references.
- **Google Photorealistic 3D Tiles = TEMPORARY backdrop only.**
  - Never copy, cache (beyond normal HTTP cache headers), export, bake, trace, or derive anything from it. No service-worker tile cache, no tiles in the repo, no offline mode, never a modeling reference.
  - While shown: Google Maps logo (unmodified, 16-19 px tall, aria-label "Google Maps") + the combined tile copyright line, never covered.
  - Not on the same screen/scene as non-Google maps (no OSM/Mapbox/Cesium basemap with it). Our own 3D objects on top are allowed; label them "custom model, not Google Maps data."
  - Dropped for an area once our buildings cover it.
- **Record every source** in `knowledge/DATA-SOURCES.md` before merging data:

| Source | What | URL | License | Attribution text | Used in | Added |
|---|---|---|---|---|---|---|
| OpenStreetMap | buildings, roads, water | https://www.openstreetmap.org | ODbL 1.0 | © OpenStreetMap contributors | tools/osm | 2026-xx-xx |

---
## 3. Terrain + OSM buildings in Three.js
**Stack:** Vite + `three` from npm, bundled. **No CDNs.** Assets in `public/`.
Suggested libs: `3d-tiles-renderer` (temporary Google backdrop only), `osmtogeojson`, `earcut` (or three's ShapeUtils), `geotiff` (read DEMs), `proj4` (if reprojecting), `meshoptimizer`/`gltf-transform` (assets).
```bash
npm create vite@latest . -- --template vanilla-ts
npm i three
npm i -D @types/three osmtogeojson earcut geotiff proj4 @gltf-transform/cli @playwright/test
```
Layout:
```
src/            app code (scene, camera, weather, people)
tools/          node scripts, run offline, outputs to public/data/
public/data/<area>/  terrain.bin, buildings.json, roads.json, trees.bin
landmarks/<area>/<slug>/<slug>.glb  landmark models + README (Jonn)
landmarks.json  public landmark placements
```
Pipeline per area (script per step in `tools/`, outputs committed only if small; raw downloads go to `tools/cache/`, gitignored):
1. **Area + origin:** each area has a fixed origin lat/lon at a *public* spot (park, town center) in `tools/areas.json`. All geometry uses a **local tangent plane (ENU)** around that origin: x = east (m), z = -north (m), y = up (m). Never move an origin after release.
2. **Terrain:** `node tools/fetch-dem.mjs <area>` downloads a 3DEP/NJ DEM GeoTIFF for the bbox → `node tools/dem-to-heightmap.mjs <area>` resamples to a grid (e.g. 257×257 per 1 km chunk, Float32 or 16-bit) → `terrain.bin`. In app: `PlaneGeometry` displaced by heights, one mesh per chunk.
3. **OSM:** `node tools/fetch-osm.mjs <area>` queries Overpass (`way["building"]`, `highway`, `natural=water`, `waterway`) for the bbox, be polite (one request, cache it) → `osmtogeojson` → project to ENU.
4. **Buildings:** extrude footprints (earcut) by `height`, else `building:levels × 3.2 m`, else default 9 m; sit base on terrain min under footprint. Merge per chunk into one BufferGeometry (`BufferGeometryUtils.mergeGeometries`).
5. **Roads:** ribbons from centerlines, width by `highway` class, lifted 5 cm over terrain; wet-asphalt material.
6. **Water:** polygons at water level, reflective dark material.
7. **Trees:** sample canopy/land-cover raster → points → one `InstancedMesh` per tree type per chunk.
8. **Chunking + LOD:** 1 km chunks; load near ones, unload far ones; 2-3 LODs (full / boxes / skipped). Frustum culling on.
9. **Budget (laptop, integrated GPU):** ≤ 150 draw calls, ≤ 1.5 M triangles visible, ≥ 50 fps at 1080p, ≤ 300 MB GPU memory. Check `renderer.info.render.calls` in a dev overlay.

---
## 4. Blender landmark workflow (landmarks only)
**Split:** Jonn and Jonn's bot build all landmarks; Websmith does all Three.js work. Landmark list, folder layout and handoff: [JONN-LANDMARKS.md](JONN-LANDMARKS.md).
- **References:** public-domain images, public plans, OSM footprints, or your own drawings. **Never Google tiles.** No personal photos. Strip EXIF/GPS from anything added.
- **Scale:** real-world meters (1 unit = 1 m). **+Y up on export.** Origin at footprint center, at ground level.
- **Export:** glTF 2.0 `.glb`, Draco or meshopt, KTX2 textures:
```bash
npx gltf-transform optimize in.glb landmarks/<area>/<slug>/<slug>.glb --compress meshopt --texture-compress ktx2
```
- **Night materials:** emissive windows/lights as a separate material (`emissive-windows`).
- **Budget per landmark:** ≤ 50k triangles (hero ≤ 100k with Luis's OK), ≤ 2 textures at 2048², ≤ 3 MB .glb.
- **Naming:** `landmarks/<area>/<slug>/<slug>.glb` + README with sources/licenses; objects/materials in English kebab-case; no usernames or local paths in the file (File → External Data → Make Paths Relative; check before export).
- **Placement:** `landmarks.json`:
```json
[{ "id": "example-lighthouse", "file": "landmarks/example/example-lighthouse/example-lighthouse.glb",
   "lat": 0.0, "lon": 0.0, "headingDeg": 0, "elevationM": 0, "area": "example" }]
```
  **Private places never go here**; they go in gitignored `config.private.json` (local dev only, never in the production bundle).

---
## 5. The look
- Night only. NYC-like wet-night energy: wet reflective streets, sodium/LED pools of light, lit windows, light fog in the distance.
- Weather states: `clear`, `rain`, `fog`, `snow`, smooth crossfade between them.
- **Shadow people:** dark silhouette figures walking (instanced). Later: tap one → "Meet [name]" card (names are fictional or consented; see §6).
- Calm and cinematic: slow camera, restrained bloom, no flashing, no neon overload.

---
## 6. Privacy
- Luis's home area appears as a **general area only**. No pin, no address, no coordinates or exact home in the repo, commits, screenshots, or issues.
- Any private placement goes in `config.private.json` (gitignored), local only.
- No real names of private people (shadow-people names are fictional unless the person consented).
- Nothing from Luis's other private projects, ever.
- Public history is permanent: if private data lands in a commit, tell Luis immediately; treat it as exposed.

---
## 7. Secrets
- **No keys in the repo, ever.** Commit `.env.example` with placeholders only.
- Map keys come from env at build/deploy (e.g. `VITE_GOOGLE_TILES_KEY`, set as a CI/host secret). Restrict: HTTP referrer = prod domain (separate dev key for `localhost`), API = Map Tiles only, daily quota cap, billing alerts.
- gitleaks in pre-commit and CI (blocks merge). GitHub secret scanning + push protection on.
```bash
# pre-commit (e.g. via husky or .git/hooks/pre-commit)
gitleaks protect --staged --redact
# CI
gitleaks detect --redact
```
- **If a secret leaks: rotate it immediately**, then tell Luis. Deleting the commit is not enough.

---
## 8. Run and test before a PR
```bash
npm ci
npm run dev              # click around, console clean
npm run build            # must pass
npm run test:smoke       # Playwright, see TESTING.md
gitleaks detect --redact # must pass
```
Smoke test must check: page loads, **zero console errors**, screenshots at fixed camera spots (`tests/cameras.json`), fps ≥ 50 on a laptop. **Attach screenshots to the PR.** Check your own diff for private data before opening it.

---
## 9. HANDOFF template (paste into HANDOFF.md each PR)
```markdown
## Version
vNN: <section> (<date>)
## What changed
- ...
## Who's on what
| Task | Branch | Owner | Status | Claimed |
## How to run
npm ci && npm run dev  |  npm run build  |  npm run test:smoke
## Next
1. ...
## Known bugs
- ...
## Usage notes
<Claude/Grok Bot usage this PR, estimate for next>
```
