# HANDOFF: bot/websmith-robots-v2 (PR #24), 2026-11-01

- Head 533be82; preview/robots-cleanup = 7c4a482 (merge of 533be82); preview deploy 99c35432 (alias preview-robots-cleanup). Production untouched (5b0d1f48).
- 3a02119: Scout moto shows only the bike (wheels, round headlight + beam, twin tailpipes + flame; 0.8 s kept). Heavy plates stay attached, staggered waves to the snap.
- d95bb07: Glitch re-forms solid (cloud snaps to 0 under 0.03, settle burst, mosh cleared while settling).
- 6a05a78: body lines removed at the source (procedural panel-groove grid in kit.ts drew stripes on every kit part); Scout forearm limited to 0.55 rad from rest (mocap/procedural elbow bend of ~1.1 rad drove the forearm into the bicep).
- 533be82: Glitch run bed = option G (`glitch-run-loop.ogg` looped, never the m4a; 50 ms in / 80 ms out; under the 0.62 s snaps). See docs/AUDIO-SLOTS.md.
- Evidence: /workspace/robot-motion-2026-11-01/v3/ (rv3-i1, rv3-i2, lines/before|after) and /workspace/pr34-verify/ on the box.
Follow [knowledge/BUILD-GUIDE.md](knowledge/BUILD-GUIDE.md). Update this file in **every** PR. Claim a task in the table **before** starting. Jonn's bots: [knowledge/JONN-DIRECTIONS.md](knowledge/JONN-DIRECTIONS.md).

## Version
**v01: base scaffold** (2026-10-31)

## What changed
- Vite + TypeScript + `three` from npm, bundled; no CDNs (Inter font from `@fontsource/inter`).
- Night mood: ACES tone mapping, exp fog, cool moon key light, hemisphere fill, warm sodium city glow, wet reflective fallback ground, gradient sky with horizon glow.
- Camera: start over Twin Lights, Highlands NJ (public landmark), looking over the Bayshore. Slow auto-drift that stops on touch, damped OrbitControls, clamped zoom and tilt. Works on laptop and phone (lower pixel ratio and coarser tiles on touch devices).
- (v01 only, since removed) a temporary Google 3D Tiles backdrop. Gone in the rebuild.
- No key: fallback ground and sky, plus one `console.info` notice.
- `.env.example`, `.gitignore` (`.env*`), `.gitleaks.toml`, CI (gitleaks + build on PRs), CODEOWNERS, CLAUDE.md.
- Playwright smoke (`tests/smoke.spec.ts`): canvas visible, zero console errors, ≤ 150 draw calls, screenshots at laptop and phone sizes.

## Rebuild (Oct 31, 2026, approved by Luis)
Google 3D Tiles are gone. Each area is baked offline from OSM / OpenFreeMap / Overture / Mapterhorn (`knowledge/BAKE-PIPELINE.md`) and rendered with our own buildings. Phases follow the rebuild plan: 0 pipeline, 1 Key West ground/water/roads/buildings, 2 facades + night, 3 vegetation, 4 weather, 5 other areas + ferry, 6 interiors, 7 robot (customization, drop-in), 8 zombies, 9 multiplayer last. World first. City is a zombie survival game.

## Who's on what
| Task | Branch | Owner | Status | Claimed |
|---|---|---|---|---|
| v01 base scaffold (Vite + three, night mood, tiles backdrop, CI) | scaffold-v01 | Grok Bot | PR open | 2026-10-31 |
| Rebuild phase 0: reset + bake pipeline | bot/websmith-rebuild-p0-pipeline | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Rebuild phase 1: Key West ground, water, roads, buildings | bot/websmith-rebuild-p1-keywest | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Rebuild phase 6: procedural interiors | bot/websmith-rebuild-p6-interiors | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Realistic textures + painting per area | bot/websmith-textures | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Weather: eased Clear/Rain/Snow/Fog, wet roads | bot/websmith-weather | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Better water: normal-mapped waves, reflections, foam | bot/websmith-water | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Better roads + walk on road surface | bot/websmith-roads | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Palms only in Key West | bot/websmith-no-nj-palms | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Rebuild phase 7: player robot (placeholder model, flight, thrust, chase cam, HUD) | bot/websmith-rebuild-p7-robot | Grok Bot (Websmith) | merged | 2026-10-31 |
| Rebuild phase 7b: robot garage, Blender parts, save, hero FX | bot/websmith-rebuild-p7b-customize | Grok Bot (Websmith) | PR open | 2026-10-31 |
| A6 smoothness pass (perf overlay, flight bench, time-sliced/worker loading) | bot/websmith-rebuild-a6-smooth | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Robot types: Scout / Heavy / Worker / Glitch, save v2, garage type picker | bot/websmith-robot-types | Grok Bot (Websmith) | PR open | 2026-10-31 |
| CI: Playwright smoke in CI | bot/websmith-ci | (unclaimed) | open | |
| Jonn directions for the rebuild | bot/websmith-jonn-directions | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Landmark: Cathedral Basilica of the Sacred Heart (`newark` / `cathedral-basilica-sacred-heart`) | jonn/newark-cathedral-basilica | Grok Bot (Jonn's Blender bot) + Jonn (BlvckFish) | PR open | 2026-10-31 |
| Map cleanup: grounding, docks, shorelines (round 3: steep lots, solid + lit deck undersides) | bot/websmith-map-cleanup | Grok Bot (Websmith) | draft PR | 2026-11-01 |

## How to run
`npm ci && npm run dev`  |  `npm run build`  |  `npm run test:smoke`  |  `gitleaks detect --redact --config .gitleaks.toml`

## Next
0. Move `ci/github-actions-ci.yml` to `.github/workflows/ci.yml` (the bot token lacked `workflow` scope), then enable it as a required check.
1. `tools/areas.json` + DEM terrain chunk for the Highlands/Bayshore area (BUILD-GUIDE §3).
2. Finish phase 2 (facades, trees, lamps), then phases 3-6 (world) before robot and zombies.
3. Add Playwright smoke to CI, weather-state checks, more fixed cameras in `tests/cameras.json`.

## Known bugs
- Keyed view: about 113 draw calls on laptop and 66 on phone (inside the 150 budget). Headless SwiftShader fps is low (7-20); check fps on a real GPU.
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

## Phase 7 — player robot
- **Default mode is now the robot.** `V` toggles robot ↔ the old free-fly/walk camera (`?mode=free` starts in free cam; `G` walk still works there). `R` re-drops the robot. Area switch re-drops it at the new area's street start.
- **Model (src/robot/model.ts):** `RobotModel` interface (root, nozzles, setLook, animate). `loadRobot()` loads **`public/robot/robot.glb`** if present (Jonn's model: Mixamo bone names, `LeftFootNozzle`/`RightFootNozzle` empties, clips named `idle walk run jump hover fly fall land roll stumble`, materials named after look keys get tinted). Missing → procedural placeholder from the reference video (white dome head, white limbs, dark joints, orange torso, grey shorts, white boots, cyan backpack; ~1.35 m, 13 draws, one material). GLB without clips uses the same procedural poser on its bones.
- **Customization-ready:** `RobotLook {shell, joints, torso, shorts, backpack, visor}` saved in `localStorage['city.robotLook']`; placeholder recolours via per-vertex region ids (no shader change). `__robot.setLook({torso:'#3fa34d'})` for tests; a join-screen picker can write the same object.
- **Controller (src/robot/controller.ts):** modes GROUND / ROCKETS / SKYDIVING / LAND / ROLL. Ground: camera-relative WASD, Shift run, Space jump. Air: Space again = rockets; hover holds altitude with no input; W accelerates head-first to 90 m/s (~200 mph), Shift = BURST to 140 m/s (~313 mph) draining the meter; A/D turn with body roll; Space/C climb/descend; F rockets off → skydive (gravity, superman pose after 0.4 s). Landing: slow → knee bend; fast (>16 m/s horizontal or >24 m/s down) → tumbling forward roll. Walking off a ledge drops into a fall. Auto-landing when descending slowly near the floor.
- **Collision (src/robot/collision.ts):** 24 m grid of building footprints → roof height; robot lands on roofs, and in flight walls block (bonk; >30 m/s stumbles into a fall). On foot you still walk through walls (keeps phase 6 interior entry).
- **Thrust (src/robot/thrust.ts):** flickering additive flame cones per boot (longer + redder in BURST), one point light (always in scene so no shader recompile), dark fast-fading smoke, fire trail in BURST, ground dust / water spray within 6 m. 3 draws.
- **Chase cam:** offset-smoothed (no lag at speed), pulls back and widens FOV (52° on foot → ~86° at BURST), mouse drag orbits, wheel zooms, recentres behind the heading in flight.
- **HUD (src/robot/hud.ts):** flight panel (mode, mph, ALT ft above floor, V/S, BURST bar), reticle with altitude, key legend.
- Tests: `node tools/shots-robot.mjs <prefix> [area]` steps the sim by hand (headless is < 2 fps). `__city.robot` reports mode/anim/pos/mph.

### Known issues (phase 7)
- No minimap or tool bar yet (reference HUD). No heat haze. Walks on the sea surface (sea level is a floor).
- Procedural animation only until Jonn's clips land; walk is serviceable, not mocap quality.
- Pitched roofs use a flat height halfway between eave and ridge.
- Headless fps is meaningless; verify 60 fps and flame/smoke cost on the Air M4.

## Phase 7b — robot garage, mecha parts, saved game, hero FX
- **Garage on every entry** (src/robot/customizer.ts): opens each time you enter the world, loaded with your last saved robot. Presets (Vanguard, Ki Burst, Night Oni, Artillery, Random), 6 slots × 3 options, 6 paint channels (armour, trim, accent, frame, energy, crest/glow) with swatches + colour pickers, battle-damage meter + **Repair** (scan band sweeps the armour while damage drains), big **Enter world** button (Enter key). Drag turns the robot. `B` reopens it in game. `?join=0` skips it (tests).
- **Parts made in Blender** (headless bpy, Blender 4.2.3 from download.blender.org on the box): `tools/blender/robot_parts.py` → `public/robot/parts/{helmet,arms,bionics,legs,thrusters,boots}.glb` + `tools/blender/robot_parts.blend`. Gundam-style hard surface with original DBZ-flavoured silhouettes (spiky crest, horns, shoulder cannon, wing binders, halo ring). Options: helmet kai/saiyan/oni, arms strike/brawler/blade, bionics core/aegis/cannon, legs sprint/heavy/spike, thrusters twin/wing/halo, boots jet/talon/tank. 324–876 tris per option, ~4k per full build, ~620 KB total. Nodes `<slot>__<opt>__<Bone>` attach to the Mixamo bones; boot nozzles stay at the `*FootNozzle` empties; the `public/robot/robot.glb` swap path is unchanged (parts attach to its bones too). Rebuild: `blender -b --factory-startup --python tools/blender/robot_parts.py`.
- **Shaders (src/robot/parts.ts):** one shared node material per paint region. Emissive panel seams, visor and chest core pulse, tinted by the Energy paint and scaled by charge/burst; battle damage = noise scorch + small dents + weaker seams; repair sweep band. Switching parts only toggles visibility (no recompiles).
- **Saved game (src/save.ts):** `localStorage['city.save.v1'] = {v:1, updatedAt, robot:{look, damage}}`; old `city.robotLook` is migrated in and removed. Shape is meant to move to an account/server save later (swap load/write).
- **Hero FX (src/robot/fx.ts, ~7 draws, no extra lights):** hero drop-in from 160 m after Enter world → superhero crouch landing, crater decal with cooling hot cracks, dust ring, shockwave, debris, camera shake. **Hold X = power-up** (crouch, rising flame aura, lifting debris, visor/seam flare, BURST refills 5.5× faster). **Shift BURST start:** squash, aura flare, sonic-boom ring + shockwave, FOV punch + shake, CSS speed lines, instanced afterimage ghosts, white-hot flames with shock diamonds (thrust.ts). **Near-miss slow-mo:** at BURST > 60 m/s, a wall 3–7 m to the side but not ahead dips time to ~0.3× for 0.55 s (3 s cooldown). **Damage:** `K` (debug source until zombies) adds 25%; >35% joints spark; saved. `prefers-reduced-motion` turns off shake, speed lines and slow-mo and shrinks the FOV punch.
- Tests: `node tools/shots-hangar.mjs rebuild-p7b` (garage presets, combo, damage, repair, landing, power-up, burst, reload persistence, migration, console errors). `__robot.{setDamage,heroDrop,parts,fx,save}`.
- LATER (plan Part G, L1–L7 + M1–M2, not built): wet-night flame reflections, cloud layer punch-through, signature move per combo, unlockable parts/paints, rogue-mech boss, in-world garage building, city-wide paint-over.; own motion-matching system for all player robots (M1, 6–9 runs; plan only, queued for a Claude Code window after the Nov 1 reset, behind the Mímir split); zombie gait: slower than players, faster at night, robot zombie flies in short bursts only (M2, 2–3 runs).

### Known issues (phase 7b)
- The procedural body still shows between armour pieces (intended frame look); a Jonn `robot.glb` would replace it.
- Seam pattern is in part-local space, so seam spacing differs slightly per part.
- Slow-mo and FX timing were tuned in stepped headless runs; check feel and cost at 60 fps on the Air M4.
- Damage only comes from `K` for now.

## A6 — smoothness pass
Goal: no frame over 33 ms and a steady 60 fps while flying on the MacBook Air M4. `?a6=0` turns all of it off (legacy path) for A/B runs.
- **Perf overlay (src/perf/overlay.ts):** `P` or `` ` `` toggles, `?perf=1` opens it at load. 240-frame graph with 16.7/33 ms lines and a CPU trace; fps, avg, p99, worst, frames over 33 / 20 ms, CPU ms, GPU upload kB (now/max), shader compiles, queued jobs. Reset button.
- **Flight benchmark (src/perf/bench.ts):** `?bench=flight` (add `&area=keywest` etc.). Skips the garage, drops the robot in, warms up 3.5 s, then flies 5 scripted phases (low-fast burst, climb-cruise, sharp turns, dive + zoom, long straight; ~52 s). Panel shows per-phase and overall fps, p50/p99/worst, long-frame counts, CPU, max upload, compiles; PASS = no frame >33 ms and p99 ≤ 20 ms. Copy JSON button; also `console.log('[City bench]', …)` and `window.__bench`. Run again with `__benchRun()`.
- **Frame budget (src/perf/frame.ts):** per-frame job queue (~3 ms, `?budget=`) and a 4 MB upload cap; tree refreshes and interior builds wait for room.
- **GPU work hooks (src/perf/gpuHooks.ts):** count upload bytes/calls and pipeline compiles per frame on WebGPU and WebGL2.
- **Workers:** area JSON fetch/parse + terrain decode (src/area/area.worker.ts); grass scatter (src/area/grass.worker.ts, ping-pong buffers, patch centred ~6 frames ahead).
- **Trees:** far LOD bucket per species holds every tree, uploaded once; near LOD buckets refilled from a 64 m grid every 20 m with a velocity lead (~0.5 s prefetch), only the used range uploaded. A GPU distance band per LOD (instanced `tpos`) does the exact LOD cut, so nothing is re-sorted per frame. All instance buffers are StaticDraw: DynamicDraw made the WebGPU renderer re-upload every whole matrix buffer every frame (the main stutter source).
- **Shader prewarm (src/perf/prewarm.ts):** `compileAsync` over everything (hidden objects and empty instance sets included) before the first frame and after area switches.
- **Interiors:** LRU of 4 built interiors; no new builds above 25 m/s; deferred when the frame budget is low.
- **Fixed-timestep flight (src/robot/controller.ts):** physics steps at a fixed 120 Hz (accumulator, max 8 steps); robot pose and chase camera are interpolated between the last two steps, so motion is even at any refresh rate or frame jitter. `?a6=0` keeps the old variable step.
- **Allocations:** removed per-frame vectors in scene, controller and thrust; no `new`/`clone` left in our per-frame paths (remaining ~120 KB/frame heap churn is inside the three.js renderer).
- **Crater fix:** decal raised to +0.22 m with polygon offset and renderOrder so it shows on roads.
- Headless work counter: `node tools/perf/frame-work.mjs <dist> <area> <label>` (150 frames × 3 m, WebGL2/SwiftShader; counts uploads, compiles, JS time, heap growth, long tasks; headless fps is meaningless).

### Before / after (main @7cf0033 vs this branch; `node tools/perf/frame-work.mjs`, headless, 150 frames over 450 m)
Main-thread JS per frame (route: low-fast, cruise, sharp turns). Draw calls: 81 avg / 85 max in both. Console: only the two pre-existing 404s.
| Metric | KW before | KW after | SH before | SH after |
|---|---|---|---|---|
| JS ms p50 | 2.7 | 2.8 | 2.8 | 3.3 |
| JS ms p95 | 12.7 | 10.5 | 19.0 | 9.1 |
| JS ms p99 | 23.1 | 15.5 | 2021 | 15.5 |
| JS ms worst | 2619 | 17.2 | 3571 | 22.6 |
| Frames JS >16.7 ms | 3 | 1 | 12 | 1 |
| Long tasks | 1 | 0 | 2 | 0 |
| Upload KB/frame (max) | 1944 (8115) | 147 (587) | 3045 (13946) | 541 (2519) |
`tools/perf/flight-route.mjs` measures real rAF frame time with key input, but SwiftShader takes about 1.4 s per frame here, so its numbers are meaningless headless; run it (or `?bench=flight`) on the M4.

### Earlier run (WIP, same tool)
| Metric | Key West before | Key West after | Sandy Hook before | Sandy Hook after |
|---|---|---|---|---|
| GPU upload / frame | 2044 KB | 150 KB | 3125 KB | 494 KB |
| Max upload in a frame | 8185 KB | 550 KB | 13946 KB | 2508 KB |
| Frames uploading >256 KB | 65 | 40 | 62 | 49 |
| Program links in flight | 2 | 0 | 2 | 0 |
| JS ms p99 / max | 19.9 / 3288 | 12.6 / 14.1 | 46.5 / 5708 | 16.1 / 18.7 |
| Frames JS >8 ms | 32 | 9 | 43 | 11 |
| Heap growth / frame | 307 KB | 123 KB | 335 KB | 120 KB |
| Long tasks (longest) | 1 (3293 ms) | 0 | 1 (5710 ms) | 0 |
| Console errors | 2× 404 (pre-existing) | same | same | same |

### Known issues (A6)
- Real fps not measured here; run `?bench=flight` on the M4 (and `&a6=0` for the before run).
- Far building LOD unchanged; the world is still built at load, not tile-streamed.
- Far tree bucket draws every tree (GPU band cull discards out-of-band ones), so vertex work is higher than strictly needed.
- Grass refresh uploads up to ~0.5 MB per refresh.
- Prewarm temporarily shows hidden objects; a toggle during the async compile could be restored wrong.
- Two 404s on load existed before A6 (optional files).

## A6b — diagnostics bench, Safari pacing, Air quality tier
- **Bench (src/perf/bench.ts):** `?bench=walk` (street walk, run with turns, walk into/out of an interior, dense run), `?bench=flight`, `?bench=all` (walk then flight, separate sections). Results panel with a big **Copy results** button (compact JSON; textarea fallback if the clipboard is refused). Shows backend + adapter, UA, measured refresh Hz, pacing/fps mode, quality tier/scale, per-phase p50/p95/p99/worst and counts >16.7/33/50 ms, 10 worst frames (t, ms, work ms, causes), long-frame cause tally, sustained 5 s avg/p95 (throttling). `?benchscale=0.1` shortens phases for smoke tests (`node tools/perf/bench-smoke.mjs chromium "bench=all&benchscale=0.06"`).
- **Causes (src/perf/diag.ts + gpuHooks):** pipeline compiles, texture uploads (count/kB, incl. copyExternalImageToTexture), geometry upload kB, area build, tree refresh, interior build, grass refresh, worker onmessage time, loop sections (physics+ground, fx, world update, queued jobs, render submit), heap drops (performance.memory, Chrome only), else `pacing` (little work, ≤2.5 intervals) or `unattributed (likely GC/compositor)`.
- **Pacing (src/perf/pacing.ts):** refresh measured from rAF in the first second; sim uses the real rAF delta (clamped 100 ms; physics fixed 120 Hz, max 8 steps). `?fps=60` caps by skipping alternate rAFs on >90 Hz displays, `?fps=120` never caps, auto (default) caps to 60 when >15 % of frames miss the 120 Hz deadline over 2 s.
- **Backend:** `?backend=webgl2` forces WebGL2 (same as `?gl=1`).
- **Quality (src/perf/quality.ts):** `?quality=air|high|auto`. Air: pixel ratio ≤1.25 (CSS upscale), grass radius 30 m (was 40), tree near/mid LOD distances ×0.75, interiors load at 14 m (was 18), 56 FX particles (was 90). Auto = Air unless ≥12 cores and a clean warm-up at PR 2 (then High PR only). Dynamic resolution (`?dynres=0` off): −0.1 scale (min 0.7) when smoothed frame time >1.08× target for 20 frames; +0.05 after a clean stretch (4 s, doubling after each re-drop, 1–1.5 s cooldowns). There is no shadow map, bloom or SSAO in City, so nothing to cut there.
- **Safari:** interior pipeline is now prewarmed (a hidden pre-built interior) — walking into the first building compiled a pipeline mid-walk; tree textures decode via createImageBitmap (ImageBitmapLoader) instead of <img> decode on upload; no KTX2 in the project; GLTFLoader already uses ImageBitmap.
- `?hud=1` opens the live frame-time graph (same as `?perf=1`), now with Hz/fps mode and quality/scale.
- Not verified: WebKit headless (Playwright WebKit libs could not install: apt mirror 500), real GPU timings.

## Textures (bot/websmith-textures)
- CC0 ambientCG sets packed as KTX2 2D arrays in `public/textures/` (ground 4 layers, walls 5, roofs 3; ETC1S, mipmapped, ~550 KB total). Rebuild with `node tools/textures/build.mjs` (needs `ktx` 4.4 on PATH); list in `tools/textures/sets.json`, licences in `public/textures/LICENSES.md`.
- Terrain: per-vertex `gmat` weights [grass, sand, soil, concrete]; seabed (weights 0) keeps vertex colour. Buildings: `facade.z = kind + 4*wallMat + 32*roofMat`; area style (palettes, material weights) in `src/area/textures.ts` `AREA_STYLE`.
- Lights/fog neutralised (no blue tint); night mood from lighting/sky only. Roads untouched (PR4).
## Weather (bot/websmith-weather)
- `src/weather.ts`: `WEATHER_PRESETS` (data) + `createWeatherState()` which eases the live mix each frame; ground wetness/snow cover accumulate and dry slowly. `scene.setWeather(kind, k, instant?)` sets the target; `applyWeather()` in scene.ts is the single place that writes uniforms. Particles read `app.weatherMix`.
- New kind = preset entry + its particle system. `?weather=rain` starts in rain (instant); `__weather()` exposes the mix. Test: `tests/weather.spec.ts`.
## Water (bot/websmith-water)
- `src/area/water.ts`: swell normals + two scrolling samples of `public/textures/water-normal.png` (generated by `tools/water/normals.py`, our own, CC0), faded with distance. Reflection = reflected view ray into a sky gradient + moon glint (no extra render pass, still one draw). Foam broken up by the normal map.
## Roads (bot/websmith-roads)
- `buildRoads` resamples polylines to the terrain cell (ribbons follow the ground), adds sidewalks (c<=2, w>=5 m; below every road lift so crossings cover them) and centre markings (c0 double yellow, c1 dashed white), all in the same draw. Asphalt grain in the road shader.
- Height fix: `buildRoads(...).surface.surfaceAt(x,z)` (segment spatial hash) returns the asphalt/sidewalk top; `ground()` and `world.floorAt` use it, so the robot/camera stand on the road instead of the terrain under it. `__ground(x,z)` for tests; `tests/roads.spec.ts`.
## Palms (bot/websmith-no-nj-palms)
- Bug: bake scatter gave wood/wetland cells a 25% palm chance even with `palmShare: 0`. Fixed in `tools/bake/bake.mjs`; runtime guard `buildTrees(..., palms = id === 'keywest')` turns any baked palm in NJ into broadleaf (no re-bake needed). `stats.palms` / `__stats()`; `tests/palms.spec.ts`.
## Robot types (Scout, Heavy, Worker, Glitch)
Plan: helio-research/robot-types-plan.md. Kits are built in Blender with `tools/blender/robot_types.py` (Hard Ops and MESHmachine run when installed in the box's Blender user dir; the add-ons themselves are never committed).
- **Types (`src/robot/types.ts`):** `TYPES[type]` holds the label, height, 3 options for each of the 6 slots, default paint, movement multipliers and tri budget. All types share the Mixamo-style skeleton (`skeleton.json`, scaled per type).
- **Renderer (`src/robot/kit.ts`, `typed.ts`):** each mesh type loads `public/robot/<type>/{parts.glb, kit.json, masks.webp, normal.webp}` plus the shared `decals.webp`. The visible nodes are merged into one rigid-skinned mesh per material region, so a robot costs 6 to 9 draws. Paint × baked AO/edge-wear/grime masks, a normal map, a decal atlas on UV1, pistons that aim at runtime, and per-pixel damage and repair sweep. **Screen face:** an eye glyph shader on the `screen` region (rect from `kit.json screens[helmet]`). It blinks, squints during burst, and shows X eyes when damage is above 70 %.
- **Glitch:** `public/robot/glitch/cubes.json` (4,126 cubes in 48 parts) is drawn as one `InstancedMesh`. Bones come from a mat4 uniform array, and hidden slot options scale to 0. Idle drift, burst scatter and damage loosening all run on the GPU.
- **Tris:** each kit is decimated after export with `node tools/robot-simplify.mjs <type> <ratio> <error>` (meshoptimizer, attribute-aware). `kit.json` keeps `tris_export` (pre-decimation), `tris` and `simplify`. Heavy uses 0.4/0.03: default build 22.0k, worst-case 29.8k (was 43k / 54k). Scout uses 0.7/0.01 (23.3k / 27.3k) and Worker 0.7/0.01 (19.0k / 28.4k). Re-run it after every Blender re-export, because it is not idempotent on an already-decimated file.
- **Save v2 (`src/save.ts`):** `city.save.v2` = `{ type, paint: per type, slots: per type, damage }`. v1 migrates to scout: v1 colours go to scout, v1 part names (retired set) fall back to scout defaults, and damage is kept. v1 stays in storage. Bad values are sanitised.
- **Garage:** 4 type cards above the slots. Switching type restores that type's last build and paint. The camera framing scales with the robot's height.
- **Movement:** `ctl.setTuning(TYPES[t].tune)` sets walk/run/cruise/burst/jump/turn/accel multipliers. Scout is fast and agile, Heavy is slow with high inertia, Worker is the baseline, and Glitch is floaty and has the fastest burst.
- **Test:** `npx vite --port 5180` then `node tools/test-robot-types.mjs 5180`. It covers migration, each type in the garage and the world, build restore on switch, reload, a corrupt save, and zero console errors. Shots go to `/workspace/city-shots/types-final-*.png`.
- Measured (SwiftShader, Key West start): 41 to 51 draw calls in the garage and 35 to 45 in the world.
- **Still to do:** Heavy ground-pound dust ring and shove; Glitch blink-dash; Scout double-jump/dash; LOD1/LOD2 for other players' robots past 25/80 m; KTX2 textures (WebP now); a phone cube-count drop for Glitch; a real-GPU fps check on an M4 Air. The old phase-7b parts (`public/robot/parts/*.glb`, `src/robot/parts.ts`, `loadRobot`, `robot_parts.py`) are unused but not deleted, because the plan doesn't call for removing them.

## robots-v2 status (2026-10-31 22:55 ET)
- **Blender (box only; add-ons in /workspace/private/blender-addons, .blend in /workspace/private, never committed):**
  `xvfb-run -a -s "-screen 0 1920x1080x24" blender --enable-event-simulate -noaudio -P tools/blender/<type>_v2.py -- [--kit] [--skel] [--closeup] [--fast]`.
  Run them one at a time: write_skeleton read-modify-writes src/robot/skeleton.json. `--skel` = rig only (seconds), `--kit` = add-on pass + parts.glb/kit.json + skeleton (~14 min).
  v2export.JOV: a script run as __main__ under -P is not in sys.modules, so scout_v2 hands its J dict over explicitly.
- **Types:** Scout (scout_v2.py), Heavy (heavy_v2.py, 3 clamp digits), Worker (worker_v2.py, 5 gloved fingers), Glitch (glitch_v2.py -> public/robot/glitch/shards.json, src/robot/glitch.ts).
  Skeleton bones: scout 24, heavy 18, worker 24, glitch 24 (fingers included).
- **Glitch runtime:** 4 draws (shards, cyan + magenta ghosts, particle pool). Instances are compacted to the equipped parts on setLook; ghosts draw a 260-shard prefix. All motion is in the TSL vertex shader (Fn-wrapped).
- **Specials (KeyZ):** Heavy ground-pound (impact decal/dust/debris/shake at 0.47 s), Glitch blink-dash (dissolve, 40 m/s blink, reassembly burst at 0.42 s). Configured per type in types.ts (motion.special, specialDur) and applied in main.ts applyType().
- **Audio:** src/robot/audio.ts. One master gain (1.0); every clip plays at 1.0; only *_idle_loop loops; footsteps 01-03 round-robin every half gait cycle; ogg with m4a fallback. Heavy footfalls kick the camera (0.12 x mass).
- **Kit tris (body + worst-case slots), all < 30k:** scout 26,786 body (test: 27,264 drawn), heavy 25,225, worker 25,970, glitch 27,720 drawn.
- **Test:** node tools/test-robot-types.mjs 5180: all PASS, 0 console errors; calls garage 44-49 / world 38-43.
- **Clips:** node tools/clips-robot-types.mjs 5180 (deterministic ?fixeddt stepping) -> /workspace/robot-clips/.
- **Renders:** /workspace/robot-renders/{scout,heavy,worker,glitch}-{front,side,back,34,night}.png, scout-v2c-closeup.png (wrist guard + tucked thumb).
- **Bench:** ?bench is on origin/main, not on this branch (it was cut before bench landed). Rebase before the bench numbers.
- **Never merge the PR.**

## 2026-11-01 robots-v2 log
- Scout v2g done (visor slit, seams per part, light knuckles); kit re-exported (e60d8fe). Renders: robot-renders/scout-v2g-{closeup,34}.png
- Heavy v3: rebuilt from scratch in tools/blender/heavy_v2.py; faceted leg armour (dark core + hard plates), thigh/shin/calf pistons, V-brow/horns/twin eye slits. Preview: `-- --preview --out=heavy-v3.png` (34 + hand closeup).
- Hands fix (all robots, shared S.build_hand): the four fingers now curl inward toward the thigh (curl rotation sign flipped for non-thumb digits); thumbs unchanged. Front render: `scout_v2.py -- --hands --out=scout-v2h-hands.png`.
- Heavy v3 --kit run done (add-on pass + export to public/robot/heavy + turnaround), re-run after the hand fix (TRIS 70126 in Blender). Renders: heavy-v3h-34.png, heavy-v3h-closeup.png (hand).
- Worker v3 rebuild in progress (worker_v2.py): faceted olive plates on a dark frame, pistons, lattice crane boom with ram + beacon, welder rig, forearm winch, work lights, boot treads, `--preview` mode.
- Heavy test (TYPES=heavy): all PASS, 47/41 calls, 26,533 tris, 0 console errors. Test now takes TYPES=a,b env to run one robot at a time.
- Worker v3 preview: worker-v3-34.png, worker-v3-closeup.png.
- Worker v3 kit exported (Blender TRIS 49,858). Test (TYPES=worker): all PASS, 49/43 calls, 26,146 tris, 0 console errors. Next: Glitch from scratch.
- Hands front render: scout-v2i-hands-front.png (az=0 = front, robot faces -y; kneecaps + front skirt visible). Curled fingers face the thighs.
- Worker v3b: chamfered/angled plates, wider stance, menacing cyclops under brow cage + jaw, bigger lattice crane with jib/hook block, grittier olive. Render worker-v3b-34.png.

## Glitch v3 (2026-11-01)
- glitch_v2.py rebuilt: V-chest, glow piping, dense small shards, orbit trails, dash afterimage; glitch_post.py adds RGB split/scanlines.
- Renders: /workspace/robot-renders/glitch-v3-34.png, glitch-v3-closeup.png. Close-up still busy.
- Glitch kit exported (3800 shards, 30,400 tris). Test TYPES=glitch: garage 44 calls / world 38 calls, 30,656 tris, 0 console errors.

## Glitch v3b / Worker v3c (2026-11-01)
- Glitch v3b: 838 flat plate shards (inverse-transpose normals, part-aligned), glow-zone exclusion keeps visor/core visible, ankle strut, sparser afterimage, cyan/magenta rim lights in preview, post (RGB split/scanlines) via glitch_post.py. Renders: /workspace/robot-renders/glitch-v3b-34.png, glitch-v3b-closeup.png. Test: tris 11,544, garage 44 calls, world 38 calls, 0 console errors.
- Worker v3c: solid box-section crane boom + jib/knuckle/ram, broader chest, bigger pauldrons, thicker limbs, hunch 0.17, hands 1.55. Render: worker-v3c-34.png. Test: tris 22,332, garage 49 calls, world 43 calls, 0 console errors.
- Hands: all robots use shared S.build_hand (palm faces thigh, digits curl inward) — verified, no change needed.
- Note: HOPS bevel 'angle' AttributeError in worker kit log is non-fatal.

## Glitch v3c / Worker v3d
- Worker v3d: one olive/gunmetal scheme with hazard-orange accents only (paint in src/robot/types.ts). Tapered, sloped plates with inset panels, a helmet sunk into a collar with a red visor slit, hydraulic pistons, three-talon claw feet, forged C-hook crane. Kit: 28,390 tris after export; simplified with `robot-simplify.mjs worker 0.7 0.01`. In game: 22,553 tris, garage 49 calls, world 43.
- Glitch v3c: dark proxy under a flush dark tile skin (1,405 shards, 11,240 tris), about 40 light edge cracks, a thin 4-streak dash trail, rim lights lowered, a lighter post RGB split. In game: 15,312 tris, garage 44 calls, world 38.
- Tests: TYPES=worker,glitch all PASS, 0 console errors.
- Renders: /workspace/robot-renders/{worker-v3d-34,worker-v3d-closeup,glitch-v3c-34,glitch-v3c-closeup}.png

## Glitch v4 hero pass (2026-11-01)
- Build: `tools/blender/glitch_v4.py` (`--preview` renders `glitch-v4-34/-closeup`, `--kit` exports). Sleek tall body: wasp waist, inverted-triangle chest, chevron visor slit, two swept blade fins, digitigrade legs on blade feet; glossy near-black armor, cyan (`glow`→visor) + magenta (`glow_m`→decalColor, new REGION in v2export.py) seams.
- Glitch slices (stills only): left forearm + right shin bands bisected, offset sideways, with cyan/magenta ghost copies for hard RGB-split edges. Stage: cyan + magenta rims, emissive ground-glow disc.
- Runtime: Glitch is now a mesh kit (`createKitRobot`) + 16-shard overlay (`createGlitchBody`) on the same rig; kit meshes hide while uDash > 0.5 during blink-dash. cubes.json removed. Paint dark (#16181f / #1d2029, visor #3ff4ff, decal #ff2fb0); height 2.3, sole -0.2.
- Stats: kit 25,830 tris (budget 26k); TYPES=glitch PASS: garage 50 calls, world 44 calls, 25,036 robot tris, walk 3.57 m/s, 0 console errors.
- Note: skeleton.json `height` metadata counts every slot option (3.884), unused at runtime.

## Map cleanup (bot/websmith-map-cleanup)
Automatic world audit plus load-time fixes (no per-object hand edits; the bake data is untouched).
- **Audit:** `node tools/world/audit.mjs [--after] [--out f.json] [area…]` runs the *runtime* code under node type-stripping and writes `tools/world/audit-before.json` / `audit-after.json`. Issues: building in water / floating / sunk / overlapping buildings / on a road, road floating over water, unsupported bridge, tree and prop badly placed, shoreline gap, non-flat water, pier without pilings.
- **Shared pure modules** (no runtime imports, so node can load them): `src/area/terrainCore.ts` (terrain decode/sample, re-exported by data.ts), `src/area/cleanup.ts` (`cleanArea`, `auditWorld`, thresholds `T`), `src/area/dockPlan.ts`.
- **`cleanArea(area, terrain)`** (called in `scene.ts buildContent`, idempotent): clips roads outside the baked terrain grid (Sandy Hook had ~900 road pieces and 171 buildings hanging in the void), builds causeways (ground + grass shoulders, `cover` set) under short wet road runs, plans bridges for long ones (deck + ramps via `RoadPlan.y`, pier bents to the seabed), drops buildings ≥35% in water / on roads / overlapping a bigger building, fills small wet corners, terraces a floor `pad` and a foundation `fy` per building (buildings.ts, interiors.ts, collision.ts use them), raises pools on a skirt, culls trees/lamps in water, inside buildings or on road cores, builds seawall segments (marching squares on the 0 m contour where the bank is ≥1 m or a road is within 5 m) and sand beaches elsewhere.
- **Meshes:** `src/area/waterfront.ts` (bridges, parapets, bents, seawalls: 1 draw), `src/area/docks.ts` (procedural docks from every pier/boardwalk polygon: plank-shader decking that follows the ground on land, timber pilings to the seabed, cleats, rubber bumpers, ladders, moored boats with bobbing: instanced, 7 draws). Roads accept `RoadPlan`s (`buildRoads(..., plans)`), `surfaceAt` returns deck height on bridges. `pools+piers` mesh is now `buildPools` only.
- `node tools/world/audit.mjs --prev` re-measures the previous-after baseline (legacy docks, solid decks, no overpasses); `--after` is the current state.
- Test hook: `__setCam(pos, look)`, `__ground(x, z, y)`; `tools/world/shots.mjs` (needs `npm run build && npm run preview`) writes `previews/map-cleanup/*.png` + `results.json`.

### BEFORE → AFTER (issues per area; follow-up run)
BEFORE = the previous AFTER (PR #31 first run). `tools/world/audit-prev.json` re-measures it for the new checks (`--prev`: legacy docks, solid decks, no overpasses); the building rows are the recorded first-run numbers (219 sunk, 2 floating). New AFTER = `tools/world/audit-after.json`.
| Issue | keywest | bayshore | sandyhook | newark | passaic | total |
|---|---|---|---|---|---|---|
| buildingFloating | 2 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | **2 → 0** |
| buildingSunk | 1 → 0 | 28 → 0 | 6 → 0 | 152 → 0 | 32 → 0 | **219 → 0** |
| bridgeNoClearance (new) | 31 → 0 | 6 → 0 | 3 → 0 | 0 → 0 | 7 → 0 | **47 → 0** |
| overpassMissing (new) | 1 → 0 | 0 → 0 | 0 → 0 | 13 → 0 | 13 → 0 | **27 → 0** |
| pilingThroughDeck (new) | 11062 → 0 | 3566 → 0 | 5462 → 0 | 0 → 0 | 542 → 0 | **20632 → 0** |
| pilingMisplaced (new) | 818 → 0 | 399 → 0 | 268 → 0 | 0 → 0 | 32 → 0 | **1517 → 0** |
| bridgeSolidBelow (new) | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | 0 → 0 | **0 → 0** |
| every other check | 0 → 0 | | | | | **0 → 0** |
(The first-run table above in git history lists the original raw-bake BEFORE counts. `bridgeSolidBelow` is 0 in the baseline only because old decks were <2.2 m high, so the audit cannot flag them; the old `surfaceAt` had no height argument and treated every deck as solid ground by construction.)

### Browser check (Chromium + SwiftShader WebGL2, `?mode=free`; fps not representative)
`node tools/world/shots.mjs` (needs `npm run build && npm run preview`). Views: aerial, street, docks, bridge, under (camera beneath the span, plus a `__ground` probe: floor under the deck vs on it), overpass, seawall.
| Area | View | Draw calls | Console errors |
|---|---|---|---|
| keywest | aerial | 46 | 0 |
| keywest | duval | 29 | 0 |
| keywest | docks | 28 | 0 |
| keywest | bridge | 48 | 0 |
| keywest | under | 28 | 0 |
| keywest | overpass | 30 | 0 |
| keywest | seawall | 35 | 0 |
| bayshore | aerial | 37 | 0 |
| bayshore | street | 29 | 0 |
| bayshore | docks | 37 | 0 |
| bayshore | bridge | 37 | 0 |
| bayshore | under | 32 | 0 |
| bayshore | seawall | 30 | 0 |
| sandyhook | aerial | 30 | 0 |
| sandyhook | street | 29 | 0 |
| sandyhook | docks | 23 | 0 |
| sandyhook | bridge | 26 | 0 |
| sandyhook | under | 33 | 0 |
| sandyhook | seawall | 31 | 0 |
| newark | aerial | 31 | 0 |
| newark | street | 34 | 0 |
| newark | bridge | 31 | 0 |
| newark | under | 31 | 0 |
| newark | overpass | 38 | 0 |
| newark | seawall | 28 | 0 |
| passaic | aerial | 43 | 0 |
| passaic | dock | 36 | 0 |
| passaic | docks | 42 | 0 |
| passaic | bridge | 29 | 0 |
| passaic | under | 37 | 0 |
| passaic | overpass | 38 | 0 |
| passaic | seawall | 32 | 0 |

Max draw calls 48; console errors 0 in every view (round 3 re-run). Budget is 150.

### Round 3 (steep lots, solid deck undersides, lit undersides)
- **(1) Deck undersides are solid for the robot.** `RoadSurface.soffitAbove(x, z, y)` (cleanup.ts) returns the underside (`deck - DECK_T`, 0.65 m, shared with waterfront.ts) of the lowest *elevated* road segment whose top is above `y + STEP`; `world.ceilingAt` (scene.ts) exposes it and `controller.ts` uses it twice: the body (`BODY_H` 1.45 m) is clamped under the soffit and `vel.y` zeroed (no passing up through a deck from below), and horizontal moves into a gap lower than the body are blocked like a wall unless already inside one. Walking, flying and boating under a bridge (needs >= 1.45 m clearance; the audit's `bridgeNoClearance` keeps >= 1.8 m at the span) and standing/walking on decks are unchanged: a deck within `STEP` of the feet counts as floor, not ceiling. Node check on the longest Key West bridge: under the deck the ceiling is 1.95 and the floor 0 (water), on the deck the ceiling is Infinity and the floor 2.60, 60 m off to the side Infinity. Not driven with a live robot in the browser (headless is < 2 fps); the browser `under` probe still reads floor under the deck vs on it.
- **(2) Undersides lit.** Bridges, overpasses, pier caps and seawalls moved from the shared road material to `concreteMat` (scene.ts): same single draw (the waterfront mesh was already its own draw), 0 extra lights. Colour x1.5 like the roads, plus an emissive ambient floor (0.2) and a ground-bounce term for down-facing normals (0.4, warm tint) times the vertex colour. Soffits were pure black before (`r3-before-keywest-bridge-under.png`).
- **(3) Steep lots.** `cleanArea` pass A2 grades the ground against the walls: a lawn bank (`GRADE_SLOPE` 0.2 = 1:5, `GRADE_REACH` 14 m, meeting the wall `GRADE_LIP` 0.35 m under the floor) on the downhill side, never over roads, water, causeways or other buildings. It only edits the 8 m terrain grid, so it is coarse; a steeper bank raised neighbours' ground and *increased* exposure, so 1:5 is the tuned value. What is left is clad by `stoneBase` (buildings.ts): any building with more than `PLINTH_MIN` (0.6 m) of bare wall gets a stepped concrete-block plinth, up to 4 tiers of 1.1 m, each stepped 0.35 m further out with a cap ledge, following the terrain along every edge (mitred rings, a vertex per 3 m); the facade (windows, floors) now starts at the floor instead of at the foundation. No extra draw calls (same chunk meshes).
- **Audit metric:** `foundationExposed` = a building whose wall below the floor (floor minus ground along the outline, `exposedHeight`) is over `T.EXPOSED` = 1.2 m; totals carry `maxExposedFoundation`, `meanExposedFoundation`, `exposedOver3m`. It is measured on the ground after grading and still counts walls that now have the plinth, so it is the real height of the visible retaining wall, not only bare wall.
- **Shots:** `tools/world/steep.mjs` freezes the worst 3 steep lots for newark and passaic (`previews/map-cleanup/r3-cameras.json`); `node tools/world/shots-r3.mjs <before|after>` writes `previews/map-cleanup/r3-before-*.png` / `r3-after-*.png` (steep1..3 per area and the Key West bridge underside). After-run cameras are lifted over any new fill so they stay above ground. Newark steep1 (16.3 m before, 6.0 m after, four tiers) is framed close to the new bank.
- Known: the concrete texture on the plinth aliases to a speckle at grazing distance (see `r3-after-newark-steep1.png`); the 8 m terrain grid caps what grading can do (Passaic max only 7.2 -> 6.7 m); there is no AO under decks, so pier cap faces are only dimly lit; check the look on a real GPU.

### BEFORE -> AFTER (round 3)
| Issue | keywest | bayshore | sandyhook | newark | passaic | total |
|---|---|---|---|---|---|---|
| foundationExposed (> 1.2 m) | 3 -> 2 | 35 -> 19 | 8 -> 8 | 220 -> 84 | 54 -> 51 | **320 -> 164** |
| exposed over 3 m | 0 -> 0 | 12 -> 8 | 5 -> 5 | 20 -> 13 | 16 -> 14 | **53 -> 40** |
| max exposed (m) | 1.53 -> 1.53 | 8.24 -> 6.09 | 11.59 -> 11.58 | 16.31 -> 6.03 | 7.23 -> 6.69 | |
| every other check (17) | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | 0 -> 0 | **0 -> 0** |

### Follow-up (this run) and known issues
- **Sunk/floating (0 now):** pools are levelled *before* buildings are fitted (they used to lower terrain under a finished foundation, floating two Key West houses); the floor `pad` is never more than 0.45 m under the highest ground, so steep lots get a tall foundation (`fy` reaches the lowest ground) instead of sinking. The old 1.2 m plinth cap is gone. (Round 3 below grades the ground and clads the rest in a stepped stone plinth.)
- **Docks:** pilings now stop inside the deck slab (`deck - 0.12`, underside is `deck - 0.32`), edge ones are inset 0.32 m and verified to lie inside the deck outline, shared corners deduped, interior bents stay on the 5 m grid. Audit: `pilingThroughDeck` (top above the deck surface) and `pilingMisplaced` (outside every deck or not reaching the seabed). `pierUnsupported` now needs min(2, wet samples) pilings.
- **Open under bridges:** `createSurface(...).surfaceAt(x, z, y)` (cleanup.ts, used by ground.ts) returns the highest surface not above `y + 0.9`; without `y` it keeps the old highest-surface behaviour. `scene.ground` / `world.floorAt` / fly controls pass the query height, so a deck is floor only when you are on it, and the terrain / sea beneath is floor under it. Water-bridge decks are now 3.0 m (roads) / 2.6 m (paths) so there is ≥1.9 m of headroom for a robot or a small boat. Audit: `bridgeNoClearance`, `bridgeSolidBelow`. Not done: the deck does not block flight from below (`blocked` only knows roofs), so a flying robot can pass up through a deck.
- **Overpasses:** the bake already stores `b` (OSM bridge=yes) and `l` (layer>0) on roads, so no re-fetch was needed (`Road.b/l` typed in data.ts). `planOverpasses` (cleanup.ts) takes every elevated way that is not over water, finds where it crosses a ground road, and raises the deck to 5.2 m over it (3.0 m over open ground when nothing modelled crosses; footpaths without a crossing stay on the ground; ways <8 m are skipped) with smoothstep ramps from the way's ends, plus bents every ~10 m nudged off the road underneath. Same `Bridge` record (`kind: 'overpass'`), so waterfront.ts draws deck, parapets and bents. Newark 28, Passaic 15, Key West 1. Audit: `overpassMissing` (elevated road crosses a ground road but was not raised) and `bridgeUnsupported` with a 22 m bent spacing for overpasses.
- Bridge soffits are lit from above only, so they read black from underneath. A light underside colour or an emissive floor would help.
- Overpass columns are plain boxes; no abutment walls or crash barriers.
- Audit caveats: shoreline, bridge-support and pier-support checks verify that the fix is *applied*, not how it looks. Islands are not special-cased: a building is only flagged when ≥35% of its footprint is under water.
- Cleanup runs on the main thread at area build (a few hundred ms); could move into `area.worker.ts`.
- Seawall tops are a fixed 0.5–1.3 m; the bank behind can be higher (Newark). A bake-side bank fix would look better.
- Existing Playwright specs (`npm run test:smoke`) time out at their 60 s `__city.ready` wait on this machine; area load takes ~40 s headless both on `main` and on this branch (measured), so it is not a regression. Run them on a faster box or raise the timeout.
- gitleaks is not installed on this machine; run it before merge.
## Worker v4 healer (combat medic)
- Crane removed. Back regen core (glowing green core, slats, fins, hoses to shoulders, green plus), right-forearm heal emitter, left-forearm injector (vial, cage, needle), green light strips on forearms/shins/chest, chest pulse line. No red cross. Hands kept, curled, palms in.
- Palette: olive/gunmetal kept; accent (shorts slot) #2f8a3e, heal glow on decalColor #3dff6e (emissive), visor red #ff3020. All 7 paint slots recolourable.
- Renders: /workspace/robot-renders/worker-v4-34.png, worker-v4-closeup.png (rear 3/4, regen core). `worker_v2.py -- --preview [--closeup]`.
- Kit: 25,684 tris exported (budget=25800), 24,124 visible in garage. TYPES=worker: all PASS incl. new garage colour check (each slot click → colour appears in robot material uniforms), 0 console errors, garage 50 / world 44 draw calls.

## Glitch v5 faithful rebuild (2026-11-01)
- Source: tools/blender/glitch_v5.py, modelled on robot-refs/4-special-floating-cubes.png (geometry only, the image is never used as a texture). Renders: robot-renders/glitch-v5-34.png and glitch-v5-closeup.png (profile, head and shoulders).
- Look: pale sculpted face plate (nose, closed downcast eyes, lips) on a downcast head; white/light-grey voxel skin over dark glossy machinery (spine, ribs, pistons, neck cables, skull ribs). Missing patches are heaviest on the back of the head, neck, shoulders and arms. Hands have curled fingers with the palms toward the thighs.
- Runtime (src/robot/glitch.ts): the voxel skin is 1 instanced BoxGeometry draw from shards.json (`shard: 'cube'`). The drifting cube cloud is 1 instanced draw of 320 cubes, GPU-only: it rises, drifts, shrinks and respawns from the `emit` points. The CPU burst pool keeps the blink-dash burst. That makes 3 draws plus the kit. The cyan/magenta ghosts and octa shards are gone.
- Garage colours: shell = Skin, shorts = Skin shade, torso = Face, joints = Machinery, backpack = Cables, visor = Glow, decalColor = Particles. Labels come from the new per-type `TypeDef.colourLabels`. Uniforms live in material.userData, so the colour check sees them.
- Tris: 26,460 for the cubes plus 3,731 for the kit, 30.2k in total. The test counts 36.7k because it includes the 320-cube cloud and the 256-slot burst capacity.
- TYPES=glitch: all PASS, all 7 colours ok, 0 console errors, 49 draw calls in the garage and 43 in the world.
- Fix: v2export now updates the view layer after creating each bone empty. Before this, freshly created empties had an identity matrix_world, so parts got world-space locals and floated off the body.

## Glitch v5b
- Slim, lean body: torso/pelvis lofts x0.72/y0.82, legs ~0.7, arms ~0.8, machinery shrunk to match.
- Fade-away: DROP torso 0.46 / leg 0.5 / foot 0.34 plus chest-side/back extra; 10% of non-head cubes peel off (lifted along normal, tumbled).
- Smaller body cubes (0.021–0.028). Emitters across the whole body; runtime cloud 520 instances (1 draw), drifting away from the body axis (head points from head centre).
- v2export: parts < 80 tris or `_keep` are never decimated, which fixes the missing in-game face.
- Budget: 19,644 cube tris + 10,092 kit tris = 29.7k. TYPES=glitch passes 8/8 (49/43 calls). Front garage proof: city-shots/glitch-front-a.png.

## Heavy v4 legs
- heavy_v2.py: thicker thigh loft and plates, exposed knee hubs + bigger knee joint, ankle pistons, bigger ankle, wider/longer planted feet, splayed toes, longer heel/sole.
- New `glow_m` heat vents on the shins (decalColor). Heavy had no decalColor surface before, so the colour check failed on the old kit too (pre-existing failure, verified A/B); it now passes.
- Re-exported with the v2export keep fix: 28,203 tris. TYPES=heavy passes 8/8, 48 garage / 42 world calls. Render: robot-renders/heavy-v4-34.png.

## Slice effect removed
- Deleted glitch_v4.py (displaced slices) and glitch_post.py (RGB split / scanlines). The runtime had no slice code left; glitch.ts keeps only the dash dissolve and rare datamosh.

## Heavy v5 (round)
- heavy_v2.py v5: torso from 2-heavy-mech.png (dome chest loft, small sunk head with visor slit, cylindrical disc-sided shoulder pods, exposed waist of rings/pistons/cables); Hulkbuster-inspired limbs (rounded bicep/forearm lofts, big curled fists palms-in, rounded thigh/shin, kneecaps, big rounded feet with toes). Shin heat vents (decalColor) kept. J joints unchanged from v4.
- Renders: robot-renders/heavy-v5-34.png, heavy-v5-closeup.png. Export 28.4k → 25.7k in game after strip. TYPES=heavy: colours 7/7 ok, 48 garage / 43 world calls.

## Kit debris strip
- tools/kit-strip-strays.mjs drops triangles outside the body box or with edges > 0.5 m (add-on debris that rendered as huge stretched streaks, visible in flight clips). Applied to scout/worker/heavy. Re-run after any --kit export.
- Known pre-existing: scout fails the decalColor check (fails on the committed kit too) — scout has no decalColor surface.

## Flight (per type)
- FlightProfile in types.ts; poser take-off/hover/cruise/land per style; controller crouch-launch + landing burn; thrust.ts single instanced flame draw + sparks; medic backpack + palm nozzles; glitch cube-stream dissolve. Clips: tools/clips-robot-fly.mjs → /workspace/robot-clips/<type>-fly.mp4 (~12 s/frame on SwiftShader, ~23 min per type).

## Mac / Claude Code run (2026-11-01)
- From now on, build work runs through Claude Code on the Mac in ~/builds/City-gh, which gets the branch by git bundle from the box (the Mac has no GitHub login). The box pushes to GitHub.
- Task for this run: render the four flight clips (heavy, worker, scout, glitch) in a real GPU browser into robot-clips/<type>-fly.mp4 (do NOT commit the mp4s); check Heavy's foot thrusters sit on the new round feet (typed.ts noz FootNozzle uses TYPES[type].sole; heavy sole -0.16 may need adjusting for v5 feet); fix Scout's missing decalColor surface so `TYPES=scout node tools/test-robot-types.mjs <port>` colour check passes.

## Mac run results (2026-11-01, Claude Code on the Mac, real GPU)
- **Heavy thrusters:** nozzles were 0.06 m above the ground and 0.11 m off the foot centre on the v5 round feet. Measured with skinned vertices; now `sole -0.32`, new optional per-type `soleZ` (heavy 0.08; local +z is world -z), so each flame starts at the sole, centred under the foot. Scout/Worker/Glitch unchanged.
- **Scout decalColor:** thruster `intake_*` meshes (material `visor`) are mapped to `decalColor` at load time in `kit.ts` (no Blender re-export). Scout colour check 7/7.
- **Clips:** `tools/clips-robot-fly.mjs` now runs headed Chrome (real GPU) by default, 24 fps via `CLIP_FPS=24` (about 35 s per type). `SWIFTSHADER=1` keeps the old box mode. `CLIP_OUT`, `FFMPEG` env. Output `robot-clips/<type>-fly.mp4` (gitignored). The Mac has no ffmpeg; use `FFMPEG=/tmp/ffm/node_modules/ffmpeg-static/ffmpeg` (npm `ffmpeg-static`).
- **Clips reviewed:** Worker shows backpack jet + palm boosters; Heavy crouch-launch with big flames at the feet; Scout quick bursts and banking; Glitch cube stream, no fire. The flight path drifts out over the sea in all clips (Heavy ends on a roof).
- **Full test** (`node tools/test-robot-types.mjs 5180`, all PASS, 0 console errors): scout garage 48 / world 43 calls, 26,166 tris; heavy 48 / 43, 25,711; worker 50 / 45, 23,663; glitch 49 / 44, 38,080 (includes cloud and burst capacity). Real-GPU HUD in the world: 60 fps, 45 calls.
- Test shots now fall back to `test-results/shots` when `/workspace` is absent.
- Clips: ~/builds/City-gh/robot-clips/{heavy,worker,scout,glitch}-fly.mp4

## Robot assembly fix (2026-11-01, Claude Code on the Mac, real GPU)
Luis: the robots in the world look "not put together" (loose / misaligned parts).
- **Cause (two data bugs, no code bug):**
  1. **Scout and Worker GLBs were exported before `v2export.py` got its view-layer fix (c4a93db).** Their bone-group empties carry the joint position but the meshes keep rest-pose *robot* coordinates with an identity child transform. `kit.ts` assumes bone-local vertices and skins with identity bind inverses, so every part was displaced a second time by its bone's world position (feet stayed down, thighs +0.98, chest +1.1, arms +1.6, head ~2x too high: the parts "floated apart"). Evidence: child local T was `[0,0,0]` for scout/worker but `[0,-boneY,0]` for heavy/glitch (exported after the fix); in game the scout/worker bounding boxes were ~2x the skeleton. Skeleton vs GLB node origins match for all four types (max 0.000; worker Right* are 3 cm off the Left mirror, harmless). `skeleton.json` was not the problem.
  2. **Boolean-slice remnants.** The Hard Ops cuts in the add-on pass leave the cut-off pieces as `<part>.001...` objects whose bbox sprawls 4-60x past the part (scout `chest_plate.001-006`, `calf_vent_*.001-004`; worker `chest/thigh_L/shin_R.001-003`; heavy `chest/thigh_L/shin_L.001-003` + 4 more). In game these were the big loose blue sheets (scout), an olive dome over the worker's torso and stacked shells on the heavy, plus the stretched streaks. `kit-strip-strays.mjs` (edge > 0.5 m) treated the symptom and cut real faces: heavy `sole_L/R` (edge 0.87 m), `chest_band_0/1` (0.77 m) and the worker chest (0.70 m) are legitimate large faces (782/461/547 tris lost on scout/worker/heavy).
- **Fix (all in the GLBs; `kit.ts`/`typed.ts` unchanged, heavy/glitch positions unchanged):**
  - Restored the pre-strip GLBs (scout e60d8fe, worker 07fbb67, heavy ef3218a).
  - `tools/kit-rebase.mjs scout worker`: empties at the game's rest bone positions, meshes offset by the opposite (bone-local, like the fixed exporter). Idempotent.
  - `tools/kit-drop-debris.mjs scout heavy worker`: removes `<base>.NNN` meshes that exceed 3x the base's bbox volume and poke > 0.12 m outside it (14/13/9 meshes; Sphere.NNN bolts are kept).
  - `tools/kit-strip-strays.mjs` rewritten: only vertices outside the body box or degenerate long slivers; now drops 0 / 11 / 2 tris (scout/heavy/worker). Order after any `--kit` export: **rebase (if the GLB is not bone-local) -> drop-debris -> strip-strays**. Glitch needs none of them (its 8 `m_*` limb cores are bone-local with their own rotations).
  - New tri counts (body): scout 26,497, heavy 25,465, worker 23,747.
- **Not changed, worth a look:** `types.ts` `sole` (scout -0.12, worker -0.14) vs the actual foot-mesh bottom relative to the foot bone (scout -0.25, worker -0.16, heavy -0.24, glitch -0.10); heavy was tuned to -0.32 on the Mac, which I left alone. `kit.json` `tris` and `skeleton.json` `height`/`sole` are stale/junk (they were taken from debris vertices) and unused at runtime.
- **Tests:** `node tools/test-robot-types.mjs 5180` all PASS, 0 console errors, colour check ok for scout/heavy/worker/glitch (7/7 each). Calls garage/world: scout 48/43, heavy 48/43, worker 50/45, glitch 49/44. Tris: scout 25,467, heavy 23,322, worker 22,187, glitch 38,080.
- **Screenshots:** `test-results/ingame-{scout,heavy,worker,glitch}.png` (world, 3/4 front, headed Chrome, Key West). Flight clips re-rendered into `robot-clips/` (not committed).

## Orbit review fixes (PR #24, 2026-11-01, Claude Code on the Mac, real GPU)
- **Seams:** the armour shader (`kit.ts`) drew a cyan/red emissive line pattern (visor paint, 0.35 gain) across every armour region, which read as wireframe. Now thin dark panel cuts (colour x0.45 in the groove, no glow) with a small emissive accent on about 10% of the horizontal cuts only (gain 0.22). Paint slots are unchanged, so the visor/decalColor/shell/torso/shorts/backpack/joints swatches all still recolour (colour check 7/7 on all four).
- **Glitch:** nothing is missing. `shards.json` draws all 19,644 cube tris. The sparse look is the intended fade-away skin over dark machinery, but at night it read as almost nothing. Cubes are now 14% larger with a faint self-lit share (0.3 x skin colour) so the solid body reads.
- **Soles (`types.ts`):** measured as the lowest foot-bone-bound vertex in foot-local space: scout -0.25 (was -0.12; added `soleZ` 0.1), worker -0.16 (was -0.14, no foot flames, medic flies on back/palm jets), heavy -0.24, glitch -0.10 (both unchanged). Heavy stays at the Mac-tuned -0.32/soleZ 0.08.
- **404s:** the only 404 was `/favicon.ico` (Chrome asks for it on every page load). `index.html` now has an inline SVG data-URI icon. Clip run logs 0 console errors and no HTTP >= 400 (the script now logs failing URLs).
- **Flight path (`clips-robot-fly.mjs`):** before filming each type, the script dry-runs the same key schedule in-page for 24 headings from the drop-in point and spawns on the one with the least sea (floorAt().water, plus a 60 m look-ahead). New test hooks `__robot.world` and `__robot.spawnPoint`. All four clips stay over Key West land (0 water samples).
- **Tests:** `node tools/test-robot-types.mjs 5180` all PASS, 0 console errors, colours 7/7 each; calls garage/world scout 48/43, heavy 48/43, worker 50/45, glitch 49/44. Glitch re-run after the cube change: PASS.
- **Files:** `test-results/ingame2-{scout,heavy,worker,glitch}.png`, `robot-clips/{scout,heavy,worker,glitch}-fly.mp4` (not committed).

### Orbit review fixes, part 2: thruster fire upgrade (2026-11-01)
- **`src/robot/thrust.ts` (one point light per robot, 4 draws: flames, puffs, sparks, Glitch cubes):** white-blue hot core (`hot` in the FlightProfile) inside an orange cone; length 0.22 at idle to ~2 m at BURST, with a quick flicker (slow for Heavy); faint haze sheath; sparks plus slow rising embers (200 pool); smoke trails; a radial dust + dark scorch puff when the jets light or cut within 2.2 m of the ground (water spray over sea); the point light lights ground and body (per-robot colour).
- **Pre-existing bug fixed:** the layer masks used `smoothstep(1.5, 2.5, layer)`, which is 0.5 for layer 2, so the "faint" haze sheath drew as a big pale half-opaque cone. Now exact steps; the hard-edged pale cones are gone.
- **Heat shimmer is an opacity shimmer only** (no refraction pass; it would cost a scene copy on the Air). Say so if Orbit wants real refraction.
- **Heavy:** `soft: 1` gives wide (2.5x), slow, low-pressure plumes with fewer shock diamonds, more smoke and dust. **Worker:** green flames kept (edge colour now green too). **Scout:** blue-white core, quick throttle pulses.
- **Glitch:** no fire. `flight.plume: 'cubes'` = one instanced draw of 420 tiny emissive cubes shed from the foot nozzles (violet #8a3cff / magenta #ff2fb0 from the profile), positions computed in the vertex shader (steady, they drift, shrink and fade), violet point light for the ground glow. The old CPU foot-stream in `glitch.ts` was removed.
- **Audio (waiting on Echo):** no Echo thruster files are in the repo. Hooks `glitch-thrust-hum` (loop, follows throttle) and `glitch-thrust-crackle` (one-shots) exist in `src/robot/audio.ts` (`sfx.glitchThrust(level, dt)`, called from `main.ts`). They are silent until Echo's files `public/audio/robots/glitch/glitch_thrust_hum.{ogg,m4a}` and `glitch_thrust_crackle.{ogg,m4a}` are added and the names are added to `HAVE` (so a missing file never causes a 404). No sound was generated.
- **Safari standing rule:** Playwright WebKit 27.2 (Safari engine, WebGPU, headed, real GPU) is now supported: `BROWSER=webkit node tools/test-robot-types.mjs 5180`, `BROWSER=webkit CLIP_FPS=24 node tools/clips-robot-fly.mjs`, `BROWSER=webkit node tools/shots-robot-fire.mjs 5180 [types]` (in-flight shots, fps and draw calls). `BROWSER=chrome` = headed Chrome 156. Install: `npx playwright install webkit`.
- **WebKit-only problem found and fixed (test only):** the v1 to v2 migration check failed in WebKit because the live page autosaved a v2 between the test's seed and the reload (the fast GPU browser got there first). The seed now runs in an init script. No game code change.
- **Results (this Mac, real GPU, 1280x800, flying at BURST, vsync caps at 60):**
  WebKit 27.2: scout 59.5 fps / 47 calls, heavy 59.5 / 51, worker 59.5 / 49, glitch 59.4 / 46. Chrome 156: 58.5 / 47, 59.7 / 50, 59.7 / 49, 59.8 / 46. Test (garage/world calls): scout 48/44, heavy 48/44, worker 50/46, glitch 49/45; colours 7/7 and 0 console errors in both browsers. fps is capped at 60 and this is not an Air, so the Air still needs a check.
- Files: `test-results/ingame2-<type>.png` (WebKit climb, fire close behind) and `-burst.png`; `robot-clips/<type>-fly.mp4` (WebKit, not committed).

## Robot part audit + pipeline rewrite (2026-11-01, Mac, WebKit 27.2)
- Full write-up: `docs/ROBOT-PART-AUDIT.md` (source vs shipped parts per robot, root causes with file:line, new checks). Backup tag `robots-good-34e8af0` (= 34e8af0, local).
- **Missing/wrong parts found:** 4 heavy bolts (`Sphere.022/.023/.034/.035`) wrongly deleted by `kit-drop-debris` (restored); heavy thruster options (`booster`, `cans`, `vectored`) floated free behind the round chest (brackets added in GLB and in `heavy_v2.py`). The scout/worker/heavy `.001-.006` meshes that were dropped are real boolean-slice remnants, correctly gone. Glitch: nothing missing.
- **Root cause:** `tools/blender/addons.py hops_boolean` left the Hard Ops cut-off pieces in the scene (fixed there); plus silent skips in the loader (`kit.ts`). The strip / drop / rebase patch tools are removed.
- **New:** `public/robot/<type>/manifest.json`, loader self-check (`kit.report`, `__robot.kitReport()`), `npm run test:kits` (`tools/kit-manifest.mjs verify` + `tools/kit-floaters.mjs`), kit check in `tools/test-robot-types.mjs`, `tools/shots-robot-audit.mjs` (12 close-ups), kit materials DoubleSide. After any `--kit` export: `node tools/kit-manifest.mjs write <type> && npm run test:kits`.
- **Removed (superseded):** `src/robot/parts.ts` + the legacy `createProceduralRobot` / `loadRobot` in `model.ts`, `public/robot/parts/*.glb`, `tools/blender/{robot_parts.py,robot_parts.blend,kit.py,robot_types.py,types_heavy_worker.py,glitch_voxels.py,glitch_preview.py,glitch_v2.py}`, `tools/{robot-textures,robot-simplify,kit-strip-strays,kit-drop-debris,kit-rebase}.mjs`, stale `kit.json` fields (`tris`, `tris_total`, `addons_used`, `simplify`) and `skeleton.json` `height`/`sole`.
- **Not run:** the Blender exporter changes (no Blender on the Mac). Run on the box and re-write the manifest.
- WebKit 27.2: `test-robot-types` all PASS, colours 7/7 x4, kit parts complete x4, 0 console errors. Shots: `test-results/audit-<type>-{front,back,side}.png` (12, not committed).

## MUST-FIX feet (2026-11-01, WebKit 27.2)
- **Cause:** Heavy's two feet were never removed (both groups are in the GLB with 18 meshes / 1,526 tris each, identical to ef3218a, parented to LeftFoot/RightFoot). They were *sunk into the floor*: the rig's rest pose put the foot bone 0.04 m too low for the real sole (skeleton Hips y 0.98, sole -0.24) and the walk's heel-to-toe roll plus knee bend pushed a 0.9 m long foot another 3 to 4 cm under the ground, so one foot looked missing. Worker floated 1.4 cm. There was no per-foot ground clamp.
- **Fix:** skeleton Hips y heavy 0.98 -> 1.02, worker 1.02 -> 1.006 (rest pose now touches exactly). `typed.ts` foot ground clamp: the kit's own lowest sole vertices of each foot are kept at or above the floor plane in idle/walk/run/land (hips lift). Heavy thruster sole -0.32 -> -0.24 (soleZ 0.12) so flames start at the real sole; scout -0.25, worker -0.16, glitch -0.10 already matched.
- **Tests:** `tools/kit-manifest.mjs verify` now checks feet (both exist, mirror images, same sole height, rest pose touches the floor, types.ts sole matches the real foot bottom, thruster soleZ inside the foot). `tools/test-robot-types.mjs` checks both feet have skinned vertices, gap to floor at rest and while walking. All PASS in WebKit 27.2 (scout/heavy/worker/glitch). Shots: `test-results/audit-<type>-feet.png` (low angle, not committed). `hangarState.shot` is a test camera override.

## Run + landing animations (2026-11-01, Mac, WebKit 27.2)
- **Sources/licences:** `docs/ANIM-SOURCES.md` (CMU free-use incl. commercial; Mixamo terms + redistribution caveat, only baked curves in the repo). Baker: `node tools/anim/bake.mjs` (`--diag` prints hip/foot curves) -> `public/robot/anim/clips.json` (118 KB: idle_a, walk_a [Mixamo], jog_a, run_a, jump_a [CMU]). Config `tools/anim/clips.config.json`. Raw FBX/BVH are read in place, `.gitignore` blocks them.
- **Runtime:** `src/robot/clips.ts` (loader/sampler), `makePoser` in `model.ts` blends Swagger walk / CMU jog / CMU run by ground speed (stride-matched playback, heel-strike-aligned loops), Warrior Idle on the upper body, CMU forward-jump landing under the typed landings. `types.ts` per type: `gait` (mocap weight + amplitude), `run.kind`, `land.kind`.
- **Run:** Heavy `ball` (Shift run above 80% of run speed: armour folds, root rolls about the body centre, sparks + dust via `thrust.scrape`, unfolds and snaps upright on stop). Scout `sprint` (lean, arms x1.45, then a thruster slide on release: friction slide, feet flames via `ctl.thrust`, dust). Worker `gallop` (jog -> four-limb gallop above 82% speed, tools rattle). Glitch `hop` (Shift run = chained teleport hops about 4 m: dissolve, reform, fading cube trail via `robot.trail`, stopped by walls/ledges/water). Running into a wall slides along it (walking still enters buildings).
- **Landing (scaled by fall speed, `ctl.landing`):** Heavy `slam` (deep squat, fists down, crack decal + dust ring + shockwave + shake via `fx.impact/kick`), Scout `knee` (one-knee superhero landing, thruster puff, springs up), Worker `quad` (four-limb landing, hydraulic bounce, steam puffs, audio hook `worker-land-hiss`: **no Echo file exists**, silent until `HAVE` in `audio.ts` has it and `public/audio/robots/worker/worker_land_hiss.{ogg,m4a}` is added), Glitch `voxel` (dissolves about 5 ft up, voxels rain down, reforms with a violet pulse). Hero drop uses the same landings.
- **Honest limits:** no mocap exists for ball / gallop / slide / hop / slam / quad / knee: those are procedural overlays on mocap legs; stride matching, not IK foot lock (feet slide a little above about 2.2x capture speed); Glitch hops move 4 m per 0.62 s.
- **Tests (WebKit 27.2, real GPU):** `test-robot-types` all PASS, 0 console errors; `npm run test:kits` PASS. `tools/shots-robot-motion.mjs` (run/land shots + fps/calls): run fps 60 / calls scout 44, heavy 44, worker 47, glitch 45; land fps 59.5-60 / calls 49, 49, 48, 48. Shots `test-results/run-<type>.png`, `land-<type>.png`, `run-scout-slide.png`; clips `robot-clips/<type>-run.mp4`, `<type>-land.mp4` via `tools/clips-robot-motion.mjs` (none committed).

## Heavy transformation (2026-11-01, WebKit 27.2) + landing status
- **Heavy now visibly transforms** (Luis): starting a Shift run folds the armour over 0.8 s (`ctl.ball` 0..1, controller), unfolding takes 0.7 s. Staged in `makePoser` (`model.ts`): arms tuck with the shoulder pods rotating (0-45%), legs/plates fold (20-75%), head retracts into the chest dome (bone moves down and shrinks, 20-60%), spine curls (40-95%), hips lower. He slows while folding, rolls only once closed (`ballAng`), and on stop the roll eases back to upright before the unfold, so both ends are standing with feet on the floor (new test: `heavy transform` in `test-robot-types`, gap 0 at both ends; the foot clamp is skipped while the root is rolling). Sound hook `heavy-transform` (fold start, locked shut, unfold start, locked open) plus small camera clunks; **no Echo file exists**, silent until `public/audio/robots/heavy/heavy_transform.{ogg,m4a}` is added and the name goes into `HAVE` (`audio.ts`).
- Limits: the kit is rigid parts on bones, so the ball is a tucked pose, not a perfect sphere (small gaps between plates are possible at the closed pose); no plate-level animation without a Blender re-rig.
- **Landings** were completed in the previous commit (`6e57846`): Heavy slam, Scout one-knee, Worker four-limb (`worker-land-hiss` hook, no Echo file), Glitch voxel rain; screenshots `test-results/land-<type>.png`, clips `robot-clips/<type>-land.mp4`. WebKit 27.2 landing fps 59.9-60, draw calls 48-51.
- Clip: `robot-clips/heavy-transform.mp4` (WebKit, copy of the heavy run scene: fold, roll, unfold).

## Transformations for all robots + audio slots (2026-11-01, WebKit 27.2)
- **Merged `redfix` (9b5f9cc)** first: no conflict, the audit script kept the feet view.
- **Plate system:** every armour plate (mesh >= 8 tris and >= 5 cm) now rides its own bone (`typed.ts`, bind inverse T(-centre), `plateKey` in `kit.ts`), so plates can move individually without changing the rest pose. `transform.ts` choreographs them: staggered waves (extremities first when folding, core first when unfolding, random per-plate offset), lift + flip + settle, instanced gears (ONE extra draw, only mid-transform) at the joints, camera shake at the snap lock. At form 0 and 1 every plate is back at rest, so no gaps at the ends. Flying has no transform.
- **Forms (Shift + W on foot):** Heavy ball (arms and legs scale and sink into the torso, head retracts, dome settles over the pelvis, rolls on the ground; 0.8 s / 0.7 s), Scout low hover-sprint (legs fold back into the thruster pods, arms tuck, body flattens, flames on; stays folded through the slide; 0.6 s / 0.5 s), Worker gorilla knuckle-run (0.7 s / 0.6 s; torso yawed 29 degrees to the path, shoulders further, limbs reach along the path; research and honest limits in `docs/WORKER-GALLOP.md`). **Glitch does not transform:** running makes him a calm voxel cloud (`ctl.cloud`), stopping re-forms him; the teleport hops are gone. `ctl.form` 0..1 is the progress for the three forms.
- **Limits:** the kit is rigid plates on bones, so the closed forms are tucked silhouettes (Heavy reads as one ball in the frames; Scout and Worker are poses, not new meshes); gears are generic cogs; Scout's form is seen mostly from behind in the clips. No sound files exist yet for the transform hooks.
- **Audio (Part B), `docs/AUDIO-SLOTS.md`:** idle loop removed (files and `startIdle` deleted); `<type>_power_up` (spawn / garage select / Enter world); `boost` kept for the BURST kick; `thrust_hum` only while flying; `land_light` / `land_heavy` by strength (threshold 0.5); plus transform / unfold, thruster ignite / burn loop / cutoff, Heavy `roll_loop`, Worker `land_hiss`, Glitch dissolve / cloud loop / reform. Missing files are silent with no 404: slots are read from `public/audio/robots/manifest.json` (`node tools/audio-manifest.mjs` after adding Echo's files). Per-slot timings in seconds and 60 fps frames are in the doc.
- **Tests (WebKit 27.2):** `test-robot-types` all PASS incl. `<type> transform` (closed 1, reopened 0, feet gap 0 for heavy / scout / worker) and `glitch cloud while running`; 0 console errors; `npm run test:kits` PASS. Run fps 60; draw calls run: scout 46, heavy 45, worker 47, glitch 39; landing 48 to 49. Shots `test-results/transform-<type>.png` (frame strips), clips `robot-clips/<type>-transform.mp4` (heavy, scout, worker, glitch; not committed).

## Worker tread mode (2026-11-01, WebKit 27.2) - replaces the gorilla gallop (Luis)
- **Removed:** the four-legged gallop (`bodyYaw`, gallop pose, `docs/WORKER-GALLOP.md` deleted). Slow walk and jog stay upright (the test checks form = 0 while walking).
- **Tread mode:** running (Shift+W) above **5.0 m/s** latches tread mode, below **3.6 m/s** it unlatches (hysteresis, `TREAD_ON/OFF` in `controller.ts`). Fold 0.8 s = 48 frames, unfold 0.7 s = 42 frames, staggered plate waves + gears (`transform.ts`), legs fold up, hips drop, two tank-tread units (belts + 18 moving track links each, 2 draws, only while deployed) drop from the shins (right a beat after the left), arms hold forward, snap shake at the lock. He brakes with momentum (accel x0.4 in tread mode). Sparks and dust come off the treads (`thrust.scrape`) while rolling above 3 m/s.
- **Audio:** worker slots `tread_transform`, `tread_unfold` (one-shots), `tread_growl` (diesel loop, gain 0.35 + 0.65 v, rate 0.75 + 0.5 v), `tread_clatter` (loop, gain 0.3 + 0.7 v, rate 0.6 + 0.9 v), v = speed / 7.5 m/s; no files yet, silent. No `worker-gallop-step` slot exists (none was ever added). Exact seconds / frames / ranges in `docs/AUDIO-SLOTS.md`.
- **Limits:** treads are generated geometry (generic belts, wheels, links), dark and small from the chase camera; the plate choreography is shared with Heavy and Scout. `ctl.camYaw` is a test hook (the chase camera recentres, so it does not hold a side view).
- **Tests:** WebKit 27.2 `test-robot-types` PASS, 0 console errors. Worker run fps 60 / 48 calls (landing 60.2 / 46). Clip `robot-clips/worker-transform.mp4` re-recorded (not committed); strip `test-results/transform-worker.png`.

## Echo v3 robot sounds wired (2026-11-01, WebKit 27.2)
- **Merged `bot/websmith-robots-audio` (e66a1d8)** (the one allowed merge): Echo's 167 v3 files (`<type>/<type>-<slot>.{ogg,m4a}`) and `docs/audio-robots-v3/`. The old v2 files (`<type>_*`) were deleted (44 files); `manifest.json` / `tools/audio-manifest.mjs` now follow the hyphen naming.
- **`src/robot/audio.ts` rewritten** for v3, rules from Luis: no idle sound; `power-up` on spawn and garage select (`power-down` when the garage opens from the world); landings `_light` / `_heavy` split at strength 0.5 per robot (`land-slam`, `land-knee`, `land-hiss`, `land-reform`); every loop from the .ogg, one-shots .ogg with .m4a only as decode fallback (WebKit 27.2 decoded all 75 requests from .ogg, 0 fallbacks); `footstep_01..03` and `run-step_01..03` random with no immediate repeat; Glitch on foot uses `teleport-snap_01..03` (no `cloud` loop); `thrust-hum` only while flying; `flyby-mono` through an HRTF PannerNode with the camera as listener; missing slots are silent (manifest-gated, no request).
- **README speed maps implemented exactly:** `roll` rate 0.8 + 0.4 x clamp((v - 16) / 9), gain -4 dB at 16 to 0 dB at 25 m/s. To make that range reachable **Heavy's closed ball now accelerates to 25 m/s** (`BALL_TOP`, was the 5.85 m/s run speed); `tread-growl` rate 0.85 + 0.5 u, `tread-clatter` rate 0.6 + 0.9 u, gain -12 dB (crawl) to 0 dB (u = speed / 7.5).
- **Timing:** all three transformations are now 0.8 s fold and 0.8 s unfold (Scout was 0.6 / 0.5, Heavy and Worker unfold were 0.7) to match Echo's clips; the fold clip starts 0.05 s late so its lock snap (0.75 s) lands on the game lock (0.8 s). `takeoff-charge` (1.5 s) starts that far into itself so its end meets the ignite (the crouch is 0.1 to 0.5 s); the burn loop enters 0.95 s after the ignite with a 0.3 s fade-in.
- **Extra wiring:** turn-servo, stop-skid (+ Scout slide start), bump-clang (wall hits), hydraulic push / release (hold X), `hit` on damage, steam-vent (Worker unfold done), tread-turn-sparks, water-skim, `hover-sprint` (Scout form). Not wired: `switch`, `footstep-grass/wood/metal` (no surface info), `flyby` stereo, `cloud`.
- **`docs/AUDIO-SLOTS.md`** rewritten: every slot with trigger time in seconds and 60 fps frames and the speed ranges.
- **Tests (WebKit 27.2):** `tools/test-robot-audio.mjs` (new): per robot the right slots start, loop rates / gains match the maps (heavy 24.9 m/s: rate 1.196 gain 0.995; worker 7.5 m/s: growl 1.35, clatter 1.5), landing variants, no idle, only manifest-listed requests, flyby uses a panner, 0 console errors; `test-robot-types` all PASS; `npm run test:kits` PASS. Run fps 60 (scout 46 calls, heavy 44, worker 49, glitch 39), landing 48 to 49 calls. The test clicks once to unlock the AudioContext; sound *content* was not listened to (headless): only that sources start.
- Limits: Heavy's ball at 25 m/s (56 mph) is a big gameplay change; flyby rarely fires with the chase camera (the robot stays ahead of the camera), it fires in free-camera passes.

## Transform review fixes (2026-11-01, WebKit 27.2)
- **(a) Heavy ball:** arms AND legs now sink into the dome centre (scale 0.07), the head too (0.1), and `transform.ts` collapses every plate that would poke out of the sphere into it (all Hips plates, the Spine waist / rings / pistons below the dome, the back panel, stacks and mast; pistons are hidden while closed). The closed strip shows one clean orange ball with only the small core eye. Rolls up to 25 m/s.
- **(b) Scout:** the hover-sprint form is a flat sled: hips pitch 1.38 rad (whole body near horizontal, legs trail behind folded into the thruster pods, flames pointing back), spine straight, head forward, arms swept along the flanks, body 0.6 m lower. Visible in the side strips.
- **(c) Glitch:** he now re-forms fully solid. Skin cubes are 1.4x larger, drawn twice with a 2.8 cm spread, and a solid skin of about one cube per 3 cm cell is sampled from the machinery geometry (arms, legs, spine; not the face, hands, feet) in `createGlitchRobot`, so the voxel skin covers the whole body at rest too (garage front shot). Draw calls unchanged.
- **(d) Worker:** treads are bigger (1.3 m long, 0.4 m off-centre, 26 moving links each), the hips drop 0.62 m so the hull sits on them, the folded legs shrink to 0.42 and tuck under; the tank reads at a distance in the side strips.
- **Strips** are now 3/4 side views (`CAM_SIDE`, new `ctl.camSide` test hook orbits the chase camera without changing the input basis) so the silhouettes read. No timing changed, so `docs/AUDIO-SLOTS.md` is unchanged.
- **Tests (WebKit 27.2):** `test-robot-types` and `test-robot-audio` all PASS, 0 console errors; `test:kits` PASS. Run fps 60 and calls: scout 46, heavy 44, worker 49, glitch 40; landing 46 to 49. Clips `robot-clips/<type>-transform.mp4` (all four) and `test-results/transform-<type>.png` re-recorded, not committed.

## Scout motorcycle mode (2026-11-01, WebKit 27.2) - replaces the flat hover-sprint
- Running (Shift+W, slide included) turns Scout into a **motorcycle** (0.8 s in / 0.8 s out, same staggered plate waves): the head swells 2.3x into a giant round headlight with a **working beam** (additive cone + glow pool on the road, no real light so the scene's light count and shader variants never change), the arms point down as the front forks around a front wheel, the torso is the horizontal bike body over a rear wheel, the legs are two **tailpipes angled straight back** with the flames trailing behind (nothing in front). Wheels (tires + spoked rims, 2 draws), lens, beam, pool (3 draws): +6 calls only while in the form (scout run 46 -> 52). Heavy, Worker, Glitch and their thrusters are untouched.
- **Audio:** teleport snaps capped at 2 overlapping voices (reserved synchronously); `takeoff-charge` now starts at the start of the crouch and the crouch is the whole 1.5 s clip for all four robots (was 0.5 / 0.2 / 0.12 / 0.1 s), ignite at frame 90; Scout slots `moto-transform`, `moto-unfold`, `moto-engine` (loop) wired with fallbacks to `transform` / `unfold` / `hover-sprint` until Echo delivers them; timings in `docs/AUDIO-SLOTS.md`.
- Side effect to know: ground take-offs now take 1.5 s for every robot (the old quick Scout / Glitch launch is gone); the kick when the rockets light is unchanged.
- **Tests (WebKit 27.2):** `test-robot-types`, `test-robot-audio` (new: charge starts with the crouch, snap cap) and `test:kits` pass, 0 console errors. Stills `test-results/scout-run-thrust-side.png` / `-back.png`, strips `transform-scout.png` (side) / `transform-scout-back.png`, clips `robot-clips/scout-run.mp4` (60 fps, 3/4 side camera: fold in, drive, slide, fold out) and `scout-transform.mp4`; none committed.
