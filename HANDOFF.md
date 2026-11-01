# HANDOFF

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
