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
