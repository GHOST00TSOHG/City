# Robot part audit

Audited 2026-11-01 on branch `bot/websmith-robots-v2` (backup tag `robots-good-34e8af0` = `34e8af0`, created locally on the Mac; the box tag was not visible from here).
Sources compared: git history of `public/robot/<type>/parts.glb` (pre-strip `e60d8fe` scout, `ef3218a` heavy, `07fbb67` worker; glitch `4d8ef3b` is the shipped one), `tools/blender/*_v2.py` / `glitch_v5.py` / `v2export.py` / `addons.py`, and every `.blend` on this Mac. No source `.blend` for any robot exists on this Mac (the ones found belong to other projects; `tools/blender/robot_parts.blend` was the unused phase-7b parts file and is removed). The Blender scripts are the source of truth; the box owns the Blender runs.

## Result: source vs shipped

| robot | pre-strip export | shipped now | what differs |
|---|---|---|---|
| scout | 296 meshes, 28,392 tris | 282 meshes, 26,497 | 14 removed: `chest_plate.001-006`, `calf_vent_L/R.001-004`. All are Hard Ops boolean-slice remnants (bboxes 4-60x the part: chest_plate.006 is 1.4 x 5.7 x 9.5 m). Correct to drop. No real part lost. |
| heavy | 376 meshes, 28,401 | 371 meshes, 25,681 | 9 removed remnants (`chest.001-003`, `thigh_L.001-003`, `shin_L.001-003`: same size as, or far larger than, their base part = stacked shells). **4 real parts had been wrongly dropped and are restored: bolts `Sphere.022/.023` (legs:piston LeftLeg) and `Sphere.034/.035` (RightLeg), 42 tris each.** Also +4 new mounting brackets (below). 11 sliver tris removed by strip-strays (not restored; degenerate). |
| worker | 468 meshes, 25,684 | 459 meshes, 23,747 | 9 removed remnants (`chest.001-003`, `thigh_L.001-003`, `shin_R.001-003`). 2 sliver tris removed by strip-strays. No real part lost. |
| glitch | (kit only, 287 meshes, 10,092 tris) | same | nothing differs. Voxel skin is `shards.json` (19,644 tris), all drawn. |

Real parts that were missing or wrong, and the fixes:

1. **Heavy bolts `Sphere.022/.023/.034/.035`**: removed by `kit-drop-debris` (see root causes). Restored from `ef3218a`.
2. **Heavy thrusters floated free of the body** (found in the WebKit side shot: a black octagon hanging behind the robot). `thrusters:booster` (`t_boost`), `thrusters:cans` and `thrusters:vectored` were authored for the old chest and had no mount, so on the round v5 chest they hovered 0.2 m behind it. Added brackets `t_boost_bracket`, `t_can_bracket`, `t_vec_bracket_{1,-1}` (in `heavy_v2.py` and in the shipped GLB, joints material).
3. **No other part was missing in-game.** The loader check (`kitReport`) now proves it for every part of every option: 70 groups, 282 / 371 / 459 / 287 meshes loaded = manifest (WebKit 27.2).
4. Kit materials were single-sided. No holes were visible in the 12 audit shots, but thin bevelled shells would show them from behind, so kit materials are now `DoubleSide` as a precaution (same result in Chrome and WebKit).

Checked and fine: frustum culling (every skinned mesh has `frustumCulled = false`, so skinning bounds cannot hide parts), LOD (the kit has none), alpha (no kit region is transparent; `decal` uses alphaTest only), parenting (rig built detached at the origin with identity bind matrices; `kit.ts` bakes `inverse(group) x mesh` so parts are bone-local), WebKit vs Chromium (identical part counts, 12 audit shots look the same).

## Root causes in the code

| # | where | what | fix |
|---|---|---|---|
| 1 | `tools/blender/addons.py` `hops_boolean` (old lines 31-43) | Hard Ops boolean spawns the cut-off pieces as new objects `<target>.001...` that inherit the target's slot/bone properties. The cleanup only deleted objects whose name started with the *cutter's* name, so the slices stayed and were exported. This is the source of every loose sheet and shell. | Snapshot objects before the operator and delete every new object that is not the target. `v2export.py export_kit` also drops any `<name>.NNN` that is much bigger than `<name>` (unless tagged `_copy`) and prints it. |
| 2 | `tools/kit-drop-debris.mjs:14` (removed) | Matched debris by name (`<base>.NNN`) and compared against `base.get(m[1])`. Blender also uses `.NNN` for unrelated duplicates, so 4 legitimate heavy bolts (`Sphere.0xx`, 0.08 m) were deleted. | Tool removed. `kit-manifest.mjs verify` fails the build on a real remnant instead of patching it. |
| 3 | `tools/kit-strip-strays.mjs` (removed) | First version cut by edge length > 0.5 m and removed real large faces (heavy soles, chest bands, worker chest). Later rewritten, but still a post-export patch. | Removed. |
| 4 | `tools/kit-rebase.mjs` (removed) and `v2export.py` (old) | Scout and Worker GLBs were exported before the view-layer fix: bone-group empties were created without updating the view layer, so `matrix_world` was stale and parts kept world coordinates. `kit.ts` assumes bone-local data and skinned them twice (parts floated apart). | Fixed in `v2export.py` earlier (c4a93db); `kit-manifest.mjs` now reports bone-local bbox for every mesh and `kit-floaters.mjs` fails if an option is not touching the body. |
| 5 | `src/robot/kit.ts` `buildSkinned` (old line `if (bi < 0) continue;`) | A part bound to a bone the rig does not have was skipped silently. | Now recorded in `kit.report.unknownBone` and logged with `console.error`. |
| 6 | `src/robot/kit.ts` `loadKit` (old `if (!bone) continue;`) | A top-level node that is not named `<slot>__<opt>__<bone>` was ignored silently. | Now listed in `kit.report.ignored` and logged. |
| 7 | `src/robot/kit.ts` `buildSkinned` (`mergeGeometries` returning null) and `kit.mats[region] ? region : 'shell'` | A region whose geometries had mismatched attributes vanished entirely; an unknown material silently became shell. | Merge failure is reported and logged; unknown regions are reported as `badRegion`. |
| 8 | `tools/blender/v2export.py` `write_skeleton` | `height` / `sole` in `skeleton.json` and `tris` / `tris_total` / `addons_used` in `kit.json` were computed from debris vertices (junk) and unused at runtime. | Removed from the exporter and from the shipped files. |

## New safety net

- `public/robot/<type>/manifest.json` (written by `node tools/kit-manifest.mjs write`): every group and mesh the kit must contain.
- Loader (`src/robot/kit.ts` `checkKit`): validates the loaded GLB against the manifest (missing / cut / zero-triangle / unbound-bone / ignored / bad region) and logs each problem with `console.error`. `window.__robot.kitReport()` returns the report.
- `node tools/kit-manifest.mjs verify` (npm run test:kits): fails on a missing or cut mesh, zero triangles, unknown bone, option not in `kit.json`, unknown material region, boolean-slice remnant, or a mesh bigger than 3 m. `node tools/kit-floaters.mjs` fails if any slot option is not touching the body (allow-list `tools/kit-floaters.allow.json`: the Glitch halo floats by design).
- `tools/test-robot-types.mjs` fails per type when `kitReport().ok` is false (any browser; run with `BROWSER=webkit`).
- Not verified here: the Blender exporter edits (`addons.py`, `v2export.py`, `heavy_v2.py`) could not be run on the Mac (no Blender). Run `xvfb-run ... blender -P tools/blender/<type>_v2.py -- --kit` on the box, then `node tools/kit-manifest.mjs write <type> && npm run test:kits`, and review the manifest diff.

## Parts per robot (shipped GLB, from manifest.json)

### scout: shipped `public/robot/scout/parts.glb`: 70 nodes, 282 meshes, 26497 tris

| group | option | meshes | tris | parts (first 8) |
|---|---|---|---|---|
| body | base | 252 | 24997 | crotch_plate, pelvis_core, skirt_flap_-1, skirt_flap_1, skirt_flap_groove_-1_0.925, skirt_flap_groove_-1_0.97, skirt_flap_groove_1_0.925, skirt_flap_groove_1_0.97, ... |
| helmet | crt | 1 | 32 | h_crt |
| helmet | visor | 1 | 32 | h_visor |
| helmet | twin | 2 | 164 | h_twin_-1, h_twin_1 |
| bionics | scope | 1 | 82 | b_scope |
| bionics | antenna | 1 | 72 | b_ant |
| bionics | drone | 1 | 32 | b_drone |
| thrusters | twin | 2 | 164 | t_twin_-1, t_twin_1 |
| thrusters | ducted | 1 | 82 | t_duct |
| thrusters | fins | 2 | 64 | t_fin_-1, t_fin_1 |
| arms | long | 2 | 64 | a_long_Left, a_long_Right |
| arms | blade | 2 | 64 | a_blade_Left, a_blade_Right |
| arms | grapple | 2 | 164 | a_grap_Left, a_grap_Right |
| legs | digi | 2 | 64 | l_digi_Left, l_digi_Right |
| legs | straight | 2 | 64 | l_str_Left, l_str_Right |
| legs | sprint | 2 | 164 | l_spr_Left, l_spr_Right |
| boots | blade | 2 | 64 | bt_blade_Left, bt_blade_Right |
| boots | pads | 2 | 64 | bt_pad_Left, bt_pad_Right |
| boots | skids | 2 | 64 | bt_skid_Left, bt_skid_Right |

body by bone: Hips(16) Spine(19) Head(17) LeftArm(8) LeftForeArm(6) LeftHand(9) LeftF0_0(3) LeftF0_1(3) LeftF0_2(2) LeftF1_0(3) LeftF1_1(3) LeftF1_2(2) LeftF2_0(3) LeftF2_1(3) LeftF2_2(2) LeftF3_0(3) LeftF3_1(3) LeftF3_2(2) LeftF9_0(3) LeftF9_1(2) RightArm(8) RightForeArm(6) RightHand(9) RightF0_0(3) RightF0_1(3) RightF0_2(2) RightF1_0(3) RightF1_1(3) RightF1_2(2) RightF2_0(3) RightF2_1(3) RightF2_2(2) RightF3_0(3) RightF3_1(3) RightF3_2(2) RightF9_0(3) RightF9_1(2) LeftUpLeg(10) LeftLeg(15) LeftFoot(15) RightUpLeg(10) RightLeg(15) RightFoot(15)

### heavy: shipped `public/robot/heavy/parts.glb`: 70 nodes, 371 meshes, 25681 tris

| group | option | meshes | tris | parts (first 8) |
|---|---|---|---|---|
| body | base | 319 | 22706 | crotch_plate, hip_skirt_-1, hip_skirt_1, hip_skirt_lip_-1, hip_skirt_lip_1, pelvis, pelvis_cap, ab_ring_0, ... |
| helmet | dome | 1 | 176 | h_dome |
| helmet | slit | 1 | 20 | h_slit_crest |
| helmet | periscope | 2 | 76 | h_peri, h_peri_eye |
| bionics | reactor | 2 | 112 | b_reactor, b_reactor_g |
| bionics | plate | 1 | 74 | b_plate |
| bionics | missiles | 4 | 344 | b_pod, b_tube0, b_tube1, b_tube2 |
| thrusters | booster | 2 | 68 | t_boost, t_boost_bracket |
| thrusters | cans | 3 | 124 | t_can_-1, t_can_1, t_can_bracket |
| thrusters | vectored | 4 | 136 | t_vec_-1, t_vec_1, t_vec_bracket_1, t_vec_bracket_-1 |
| arms | piledriver | 2 | 112 | a_pile_L, a_pile_R |
| arms | shield | 2 | 37 | a_shield_L, a_shield_R |
| arms | gatling | 6 | 336 | a_gat0_L, a_gat1_L, a_gat2_L, a_gat0_R, a_gat1_R, a_gat2_R |
| legs | piston | 8 | 296 | l_piston_L_barrel, l_piston_L_rod, Sphere.022, Sphere.023, l_piston_R_barrel, l_piston_R_rod, Sphere.034, Sphere.035 |
| legs | reverse | 2 | 352 | l_rev_L, l_rev_R |
| legs | armored | 2 | 208 | l_arm_L, l_arm_R |
| boots | tank | 2 | 32 | bt_tread_L, bt_tread_R |
| boots | claw | 6 | 120 | bt_claw-1_L, bt_claw0_L, bt_claw1_L, bt_claw-1_R, bt_claw0_R, bt_claw1_R |
| boots | stomper | 2 | 352 | bt_stomp_L, bt_stomp_R |

body by bone: Hips(7) Spine(68) Head(10) LeftArm(9) LeftForeArm(11) LeftHand(9) LeftF0_0(3) LeftF0_1(3) LeftF0_2(2) LeftF1_0(3) LeftF1_1(3) LeftF1_2(2) LeftF2_0(3) LeftF2_1(3) LeftF2_2(2) LeftF3_0(3) LeftF3_1(3) LeftF3_2(2) LeftF9_0(3) LeftF9_1(2) RightArm(9) RightForeArm(11) RightHand(9) RightF0_0(3) RightF0_1(3) RightF0_2(2) RightF1_0(3) RightF1_1(3) RightF1_2(2) RightF2_0(3) RightF2_1(3) RightF2_2(2) RightF3_0(3) RightF3_1(3) RightF3_2(2) RightF9_0(3) RightF9_1(2) LeftUpLeg(10) LeftLeg(23) LeftFoot(18) RightUpLeg(10) RightLeg(23) RightFoot(18)

### worker: shipped `public/robot/worker/parts.glb`: 70 nodes, 459 meshes, 23747 tris

| group | option | meshes | tris | parts (first 8) |
|---|---|---|---|---|
| body | base | 422 | 21523 | belt, codplate, codplate_g, codplate_p, pelvis, pouch_0, pouch_1, tasset_-1, ... |
| bionics | tanks | 2 | 168 | b_tank_-1, b_tank_1 |
| bionics | battery | 3 | 96 | b_batt, b_batt_g, b_batt_p |
| bionics | reel | 1 | 84 | b_reel |
| thrusters | stacks | 2 | 168 | t_stack_-1, t_stack_1 |
| thrusters | fans | 1 | 84 | t_fan |
| thrusters | rocket | 1 | 84 | t_rocket |
| helmet | boxcam | 1 | 32 | h_cam2 |
| helmet | welder | 1 | 32 | h_mask |
| helmet | lamp | 1 | 84 | h_lamp |
| arms | claw | 2 | 64 | a_claw_L, a_claw_R |
| arms | drill | 2 | 168 | a_drill_L, a_drill_R |
| arms | welder | 2 | 64 | a_tank_L, a_tank_R |
| legs | cans | 2 | 168 | l_can_L, l_can_R |
| legs | strut | 2 | 168 | l_strut_L, l_strut_R |
| legs | ribbed | 8 | 464 | l_rib0_L, l_rib1_L, l_rib2_L, l_rib3_L, l_rib0_R, l_rib1_R, l_rib2_R, l_rib3_R |
| boots | stabilizer | 2 | 64 | bt_stab_L, bt_stab_R |
| boots | wheels | 2 | 168 | bt_wheel_L, bt_wheel_R |
| boots | clamp | 2 | 64 | bt_clamp_L, bt_clamp_R |

body by bone: Hips(13) Spine(71) Head(12) LeftArm(24) LeftForeArm(26) LeftHand(9) LeftF0_0(3) LeftF0_1(3) LeftF0_2(2) LeftF1_0(3) LeftF1_1(3) LeftF1_2(2) LeftF2_0(3) LeftF2_1(3) LeftF2_2(2) LeftF3_0(3) LeftF3_1(3) LeftF3_2(2) LeftF9_0(3) LeftF9_1(2) RightArm(26) RightForeArm(28) RightHand(9) RightF0_0(3) RightF0_1(3) RightF0_2(2) RightF1_0(3) RightF1_1(3) RightF1_2(2) RightF2_0(3) RightF2_1(3) RightF2_2(2) RightF3_0(3) RightF3_1(3) RightF3_2(2) RightF9_0(3) RightF9_1(2) LeftUpLeg(15) LeftLeg(28) LeftFoot(22) RightUpLeg(15) RightLeg(28) RightFoot(22)

### glitch: shipped `public/robot/glitch/parts.glb`: 70 nodes, 287 meshes, 10092 tris

| group | option | meshes | tris | parts (first 8) |
|---|---|---|---|---|
| body | base | 238 | 8952 | m_pelvis, chest_pst_-1_barrel, chest_pst_-1_rod, chest_pst_1_barrel, chest_pst_1_rod, m_torso, neck_glow, rib0_-1, ... |
| bionics | spine | 5 | 60 | b_dorsal0, b_dorsal1, b_dorsal2, b_dorsal3, b_dorsal4 |
| bionics | vents | 2 | 24 | b_vent_-1, b_vent_1 |
| bionics | ring | 1 | 52 | b_ring |
| thrusters | none | 1 | 18 | t_stub |
| thrusters | jets | 2 | 88 | t_jet_-1, t_jet_1 |
| thrusters | ring | 1 | 44 | t_ring |
| helmet | bare | 1 | 14 | h_jack |
| helmet | crest | 5 | 60 | h_crest0, h_crest1, h_crest2, h_crest3, h_crest4 |
| helmet | halo | 1 | 60 | h_halo |
| arms | cables | 2 | 28 | a_cab_L, a_cab_R |
| arms | pistons | 8 | 240 | a_pst_L_barrel, a_pst_L_rod, Sphere.008, Sphere.009, a_pst_R_barrel, a_pst_R_rod, Sphere.012, Sphere.013 |
| arms | plated | 2 | 24 | a_plate_L, a_plate_R |
| legs | bare | 2 | 28 | l_cab_L, l_cab_R |
| legs | plated | 2 | 24 | l_plate_L, l_plate_R |
| legs | pistons | 8 | 240 | l_pst_L_barrel, l_pst_L_rod, Sphere.016, Sphere.017, l_pst_R_barrel, l_pst_R_rod, Sphere.022, Sphere.023 |
| boots | flat | 2 | 24 | bt_flat_L, bt_flat_R |
| boots | plated | 2 | 24 | bt_plate_L, bt_plate_R |
| boots | hover | 2 | 88 | bt_hover_L, bt_hover_R |

body by bone: Hips(1) Spine(40) Head(19) LeftArm(14) LeftForeArm(12) LeftHand(9) LeftF0_0(3) LeftF0_1(3) LeftF0_2(2) LeftF1_0(3) LeftF1_1(3) LeftF1_2(2) LeftF2_0(3) LeftF2_1(3) LeftF2_2(2) LeftF3_0(3) LeftF3_1(3) LeftF3_2(2) LeftF9_0(3) LeftF9_1(2) RightArm(14) RightForeArm(12) RightHand(9) RightF0_0(3) RightF0_1(3) RightF0_2(2) RightF1_0(3) RightF1_1(3) RightF1_2(2) RightF2_0(3) RightF2_1(3) RightF2_2(2) RightF3_0(3) RightF3_1(3) RightF3_2(2) RightF9_0(3) RightF9_1(2) LeftUpLeg(5) LeftLeg(8) LeftFoot(4) RightUpLeg(5) RightLeg(8) RightFoot(4)
