# HANDOFF

Follow [knowledge/BUILD-GUIDE.md](knowledge/BUILD-GUIDE.md). Update this file in **every** PR. Claim a task in the table **before** starting. Landmarks (Jonn's bot): [knowledge/JONN-LANDMARKS.md](knowledge/JONN-LANDMARKS.md).

## Version
**v01.1: official Google Maps logo** (2026-10-31), on top of v01 base scaffold

## What changed
- v01.1: the styled "Google Maps" text is replaced by Google's official, unmodified logo (`public/attribution/google-maps/`, outlined dark variant, native 105×22 px, 10/10/10/5 px clear space, alt and aria-label "Google Maps"). The smoke test checks that the logo image loads whenever tiles are on.
- Laptop only (Luis's rule): phone viewport tests and phone code paths removed.
- Vite + TypeScript + `three` from npm, bundled; no CDNs (Inter font from `@fontsource/inter`).
- Night mood: ACES tone mapping, exp fog, cool moon key light, hemisphere fill, warm sodium city glow, wet reflective fallback ground, gradient sky with horizon glow.
- Camera: start over Twin Lights, Highlands NJ (public landmark), looking over the Bayshore. Slow auto-drift that stops on touch, damped OrbitControls, clamped zoom and tilt.
- TEMPORARY Google Photorealistic 3D Tiles backdrop (`3d-tiles-renderer`), key from `VITE_GOOGLE_TILES_KEY`. Textures darkened for night. the Google Maps logo plus the live tile copyright line are always shown while tiles are on.
- No key: fallback ground and sky, plus one `console.info` notice.
- `.env.example`, `.gitignore` (`.env*`), `.gitleaks.toml`, CI (gitleaks + build on PRs), CODEOWNERS, CLAUDE.md.
- Playwright smoke (`tests/smoke.spec.ts`): canvas visible, zero console errors, ≤ 150 draw calls, screenshots at laptop size.

## Who's on what
| Task | Branch | Owner | Status | Claimed |
|---|---|---|---|---|
| v01 base scaffold (Vite + three, night mood, tiles backdrop, CI) | scaffold-v01 | Grok Bot | merged | 2026-10-31 |
| Official Google Maps logo for tile attribution | bot/websmith-google-logo | Grok Bot (websmith) | PR open | 2026-10-31 |
| v01 streets: first area terrain + OSM buildings/roads | bot/websmith-v01-streets | (unclaimed) | open | |
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

## Known bugs
- Keyed view: about 113 draw calls on laptop (inside the 150 budget). Headless SwiftShader fps is low (7-20); check fps on a real GPU.
- Bundle is about 560 kB (139 kB gzip); code-split later.

## Usage notes
Built on Grok Bot (no Claude). Estimate for v01 streets: medium.
