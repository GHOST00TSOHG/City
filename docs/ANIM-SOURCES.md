# Animation sources and licences

Everything in `public/robot/anim/clips.json` (about 120 KB) is **baked, retargeted data** produced by `tools/anim/bake.mjs` from the sources below. No raw FBX/BVH file is in this repository, and none must be added (`.gitignore` covers `*.fbx`/`*.bvh` under the repo only by convention: do not commit them). The sources are read in place from `~/Downloads` and `~/builds/mocap-raw`.

| baked clip | source file | origin | licence | used for |
|---|---|---|---|---|
| `idle_a` | `Warrior Idle.fbx` | Adobe Mixamo (Luis's download) | Mixamo terms (below) | upper-body idle (breathing, weight shift), weight 0.3-0.4 (Glitch 0) |
| `walk_a` | `Swagger Walk.fbx` | Adobe Mixamo (Luis's download) | Mixamo terms | slow walking (0 to 2.6 m/s) |
| (none) | `Sword And Shield Power Up.fbx` | Adobe Mixamo (Luis's download) | Mixamo terms | read and checked, **not baked** (no use yet; candidate for the X power-up pose) |
| (none) | `Withdrawing Sword.fbx` | Adobe Mixamo (Luis's download) | Mixamo terms | read and checked, **not baked**: no use in the current moves |
| `jog_a` | CMU `16_35` "run/jog" | Carnegie Mellon University Graphics Lab Motion Capture Database, BVH conversion by B. Hahne (cgspeed) | CMU free-use (below) | walking at game speed (about 3.4 m/s) and the Worker's steady jog |
| `run_a` | CMU `09_01` "run" | same | same | sprint / run |
| `jump_a` | CMU `16_05` "forward jump" | same | same | the landing crouch (frames 44 to 66) under every typed landing |

## Licences (checked 2026-11-01)

- **CMU mocap database** (`mocap.cs.cmu.edu`), quoted from the `READMEFIRST.txt` that ships with the BVH set: "Use this data! This data is free for use in research and commercial projects worldwide." The BVH conversion (cgspeed) is released under the same terms. Credit line requested if results are published: "The data used in this project was obtained from mocap.cs.cmu.edu. The database was created with funding from NSF EIA-0196217." (listed in `CREDITS.md`). The data itself may not be resold as a dataset; baked quaternion curves inside a game are fine.
- **Adobe Mixamo** (Luis's account downloads). Mixamo's FAQ/terms allow Mixamo animations to be used in personal, commercial and non-profit projects (games, films) at no cost, but forbid **redistributing the raw Mixamo files** as stand-alone assets or reselling them. So only the baked, retargeted curves are committed (joint rotations of our own rig, 30 fps, no mesh, no skeleton of the Mixamo character). This is my reading of the terms, not legal advice: Luis should confirm it is acceptable for a public repo before release, and can drop `idle_a` / `walk_a` from `tools/anim/clips.config.json` and re-bake if not (the runtime falls back to the CMU clips and the procedural poses).
- Three.js `FBXLoader` (MIT) was used to read the FBX; nothing from it ships.

## Pipeline (`tools/anim/`)

1. `lib.mjs`: reads CMU BVH (forward kinematics) and Mixamo FBX (three `FBXLoader` + `AnimationMixer`) and reduces both to **world joint positions per frame** (hips, neck, head, hip/knee/ankle/toe, shoulder/elbow/wrist), 30 fps.
2. `bake.mjs`: removes the clip's mean heading, then retargets by **bone direction** (swing only): each of our bones (Hips, Spine, Head, Arms, ForeArms, UpLegs, Legs, Feet) gets the rotation that takes its neutral direction (down for limbs, up for spine/head) to the captured direction. This ignores the different rest poses (T-pose vs arms-down, straight vs digitigrade legs) and keeps each robot's rest silhouette; twist about a bone's own axis is dropped. Output is rig-independent local quaternions plus hip bob (in leg lengths) and speed (leg lengths per second).
3. Loops (`walk`, `jog`, `run`, `idle`): the gait period is found by minimising the pose distance between `t` and `t+P`, then the cycle is rotated to start on **left heel strike** so any two clips are phase-aligned and a walk to run blend keeps the feet in step. Seam error is stored per clip (`seam`, about 0.01 to 0.03).
4. Runtime (`src/robot/clips.ts`, `makePoser` in `model.ts`): three-way blend by ground speed (Swagger walk, CMU jog, CMU run), playback rate = ground speed / (clip speed x this rig's leg length) so strides match the ground (this is **stride matching, not IK foot locking**; above about 2.2x the capture speed the feet slide a little). A per-foot ground clamp (`typed.ts`) keeps every sole at or above the floor. Per-type amplitude and style overlays sit on top (`types.ts` `gait`).

## What is NOT mocap (be honest)

- No CMU/Mixamo clip exists for a rolling armoured ball, a four-limbed gallop, a thruster slide, a teleport hop or a superhero/slam landing. Those poses are procedural overlays (`model.ts`) driven by the controller; the **legs and arms underneath** come from the baked run/jog/landing data. The landing crouch uses the CMU forward-jump landing (`jump_a`) at weight 0.25 to 0.35 under the per-type pose.
- Worker's gallop arms and the tool rattle, Heavy's ball tuck, Scout's slide pose and Glitch's hop crouch are hand-authored.
