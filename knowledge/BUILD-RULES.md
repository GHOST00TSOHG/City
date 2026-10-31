# BUILD-RULES (short)
Full detail: [BUILD-GUIDE.md](BUILD-GUIDE.md).
- Vite + three from npm, bundled. No CDNs. Assets in `public/`.
- Laptop-first: ≤ 150 draw calls, ≥ 50 fps at 1080p. Instancing, chunking, LOD.
- Local ENU coordinates, fixed origin per area at a public spot.
- Free public data only; log it in `DATA-SOURCES.md`. OSM needs ODbL credit.
- Google 3D Tiles: temporary backdrop only, never cached/traced/derived; logo + attribution shown.
- Landmarks: Blender, meters, +Y up, .glb + meshopt/Draco + KTX2, within budget.
- No keys, no private places, no real names of private people, nothing from other private projects.
- Branch `bot/<bot>-<task>`, PR to main, Luis approves, squash, update HANDOFF.md.
