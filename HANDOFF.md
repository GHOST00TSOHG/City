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
| Rebuild phase 6: procedural interiors | bot/websmith-rebuild-p6-interiors | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Rebuild phase 7: player robot (placeholder model, flight, thrust, chase cam, HUD) | bot/websmith-rebuild-p7-robot | Grok Bot (Websmith) | merged | 2026-10-31 |
| Rebuild phase 7b: robot garage, Blender parts, save, hero FX | bot/websmith-rebuild-p7b-customize | Grok Bot (Websmith) | PR open | 2026-10-31 |
| Robot types: Scout / Heavy / Worker / Glitch, save v2, garage type picker | bot/websmith-robot-types | Grok Bot (Websmith) | PR open | 2026-10-31 |
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
