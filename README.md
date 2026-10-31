# City

A night-time Three.js city built from free public data (terrain, OpenStreetMap) and hand-made Blender landmarks. Calm, cinematic, NYC-like wet-night mood.

- **Start here:** [knowledge/BUILD-GUIDE.md](knowledge/BUILD-GUIDE.md) (every bot and person follows it)
- **Current state / who's on what:** [HANDOFF.md](HANDOFF.md)
- Rules: [knowledge/BUILD-RULES.md](knowledge/BUILD-RULES.md) · Tests: [knowledge/TESTING.md](knowledge/TESTING.md) · Plan: [knowledge/CITY-PLAN.md](knowledge/CITY-PLAN.md)
- **Landmarks (Jonn + Jonn's bot, Blender):** [knowledge/JONN-LANDMARKS.md](knowledge/JONN-LANDMARKS.md)

## Run (once code exists)
```bash
npm ci
npm run dev      # local dev server
npm run build    # production bundle in dist/
```

## Data and attribution
Map data © OpenStreetMap contributors, ODbL. Elevation and land cover: USGS 3DEP / NJ public data. Full list: `knowledge/DATA-SOURCES.md`.
Google Photorealistic 3D Tiles may appear as a temporary backdrop, with Google's logo and attribution shown on screen.

## License
MIT, © 2026 Luis Bryant-Petrillo. Data keeps its own licenses (see DATA-SOURCES).
