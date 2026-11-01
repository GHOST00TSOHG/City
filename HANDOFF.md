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
| CI: Playwright smoke in CI | bot/websmith-ci | (unclaimed) | open | |
| Jonn directions for the rebuild | bot/websmith-jonn-directions | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Landmark: Cathedral Basilica of the Sacred Heart (`newark` / `cathedral-basilica-sacred-heart`) | jonn/newark-cathedral-basilica | Grok Bot (Jonn's Blender bot) + Jonn (BlvckFish) | PR open | 2026-10-31 |
| Landmark: Newark Schools Stadium (`newark` / `newark-schools-stadium`) | jonn/newark-schools-stadium | Grok Bot (Jonn's Blender bot) + Jonn (BlvckFish) | PR open | 2026-11-01 |

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
