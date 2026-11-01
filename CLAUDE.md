# CLAUDE.md (City)
Rules live in `knowledge/BUILD-GUIDE.md`; that file wins over this one. Jonn's bots: `knowledge/JONN-DIRECTIONS.md`. Order: world, robot, zombies, multiplayer.

## Scripts
- `npm ci` install (lockfile)
- `npm run dev` Vite dev server on :5173 (stats overlay on)
- `npm run build` typecheck + production bundle to `dist/`
- `npm run preview` serve `dist/` on :4173
- `npm run test:smoke` Playwright smoke (starts preview; screenshots to `test-results/shots/`)
- `gitleaks detect --redact --config .gitleaks.toml` before every PR

## Layout
- `index.html` canvas, HUD, attribution bar
- `src/main.ts` boot, render loop, attribution + stats overlay
- `src/scene.ts` renderer (ACES), night lights, fog, camera + OrbitControls, fallback ground/sky, `START` origin
- `tools/bake/` offline area bake (fetch.mjs, bake.mjs, infer.mjs, areas.json) -> `public/areas/<id>/`
- `tests/` Playwright smoke + `cameras.json`
- `knowledge/` build guide, rules, plan, data sources
- `.github/` CODEOWNERS; `ci/github-actions-ci.yml` = CI workflow, move to `.github/workflows/ci.yml` (needs a token with `workflow` scope)

## Gotchas
- No Google tiles, keys or models (removed Oct 31, 2026). Areas are baked offline: `knowledge/BAKE-PIPELINE.md`.
- Credits bar and `CREDITS.md` must list OSM (ODbL), OpenFreeMap/OpenMapTiles, Overture, Mapterhorn/USGS 3DEP.
- Coordinates: ENU around each area's public origin. x east, -z north, y up, meters.
- No home coordinates or addresses anywhere. Private placements go in `config.private.json` (gitignored).
- Budget: 150 draw calls max (smoke test asserts it), 50 fps or better at 1080p. `?stats` shows calls/fps.
- SwiftShader fps in headless CI is not representative; only real GPUs count.
- No CDNs: fonts come from `@fontsource/inter`, bundled by Vite.
