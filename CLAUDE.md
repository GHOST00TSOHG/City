# CLAUDE.md (City)
Rules live in `knowledge/BUILD-GUIDE.md`; that file wins over this one.

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
- `src/backdrop.ts` TEMPORARY Google 3D Tiles backdrop (3d-tiles-renderer)
- `tests/` Playwright smoke + `cameras.json`
- `knowledge/` build guide, rules, plan, data sources
- `.github/` CODEOWNERS; `ci/github-actions-ci.yml` = CI workflow, move to `.github/workflows/ci.yml` (needs a token with `workflow` scope)

## Gotchas
- Key: `VITE_GOOGLE_TILES_KEY` in env or a local `.env.local` (gitignored). Never commit it.
  Vite inlines it into `dist/` at build time, so never commit or share a keyed build.
- The current key is referrer-restricted: localhost:5173 and the GitHub Pages domain work,
  :4173 does not. Test keyed builds with `vite preview --port 5173`.
- No key = night fallback ground plus one `console.info` notice. That is expected, not an error.
- Google tiles: never cache, export, trace or derive. Keep the "Google Maps" logo and the
  copyright line visible. No OSM/other basemap on screen with them.
- Coordinates: ENU around `START` (Twin Lights, Highlands NJ). x east, -z north, y up, meters.
- No home coordinates or addresses anywhere. Private placements go in `config.private.json` (gitignored).
- Budget: 150 draw calls max (smoke test asserts it), 50 fps or better at 1080p. `?stats` shows calls/fps.
- SwiftShader fps in headless CI is not representative; only real GPUs count.
- No CDNs: fonts come from `@fontsource/inter`, bundled by Vite.
