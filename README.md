# City

A night-time Three.js city built from free public data (terrain, OpenStreetMap) and hand-made Blender landmarks. Calm, cinematic, NYC-like wet-night mood.

- **Start here:** [knowledge/BUILD-GUIDE.md](knowledge/BUILD-GUIDE.md) (every bot and person follows it)
- **Current state / who's on what:** [HANDOFF.md](HANDOFF.md)
- Rules: [knowledge/BUILD-RULES.md](knowledge/BUILD-RULES.md) · Tests: [knowledge/TESTING.md](knowledge/TESTING.md) · Plan: [knowledge/CITY-PLAN.md](knowledge/CITY-PLAN.md)
- **Landmarks (Jonn + Jonn's bot, Blender):** [knowledge/JONN-LANDMARKS.md](knowledge/JONN-LANDMARKS.md)

## Run
```bash
npm ci
npm run bake:fetch keywest && npm run bake keywest   # optional: rebuild area data (needs pip install overturemaps)
npm run dev                  # http://localhost:5173 (stats overlay on)
npm run build                # typecheck + production bundle in dist/
npm run preview              # serve dist/ on http://localhost:4173
npx playwright install chromium && npm run test:smoke
gitleaks detect --redact --config .gitleaks.toml
```
Add `?perf=1` to the URL for fps and draw calls.

## Data and attribution
Map data © OpenStreetMap contributors (ODbL) · OpenFreeMap © OpenMapTiles · © Overture Maps Foundation · terrain © Mapterhorn (USGS 3DEP). Full list: [CREDITS.md](CREDITS.md). No Google data.

## License
MIT, © 2026 Luis Bryant-Petrillo. Data keeps its own licenses (see DATA-SOURCES).
