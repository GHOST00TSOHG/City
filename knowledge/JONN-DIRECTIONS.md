# JONN-DIRECTIONS: what Jonn and Jonn's bots do (read this first)

Updated 2026-10-31 for the rebuild. Do exactly what this file says, in the order given. If anything here is unclear or conflicts with a request, stop and ask Luis. Do not guess.
Other files: landmark list and landmark details are in [JONN-LANDMARKS.md](JONN-LANDMARKS.md). General rules are in [BUILD-GUIDE.md](BUILD-GUIDE.md). This file wins over both for Jonn's work.

## 1. What changed
- **Google 3D Tiles are gone.** No Google data is used anywhere, ever.
- The world is built from **OpenStreetMap, Overture Maps and Mapterhorn** terrain, baked offline per area (`knowledge/BAKE-PIPELINE.md`).
- City is becoming a **zombie survival game**. You play as a rocket-boot robot; zombies are always in every area.
- **Build order for the whole project:** (1) world: all towns/cities, water, sky, weather, environment; (2) robot; (3) zombies; (4) multiplayer last.

## 2. Your role
- Jonn and Jonn's bots make **Blender models only**: landmarks, the robot, and the zombies.
- Websmith (Luis's bot) does all Three.js/app code.
- **You may edit only:** `landmarks/**`, `models/**`, your own rows in `landmarks.json`, and your rows in `HANDOFF.md`.

## 3. Your tasks, in this exact order
Finish and open a PR for each item before you start the next one. One piece = one branch = one PR.
1. **Landmarks first**, in this order:
   a. **Cathedral Basilica of the Sacred Heart** (Newark), list #2. Hero budget (100k tris) is approved.
   b. Then the rest of the approved list in [JONN-LANDMARKS.md](JONN-LANDMARKS.md) §3, in list order: 1, 3, 4, 5 … 19. Skip #2, which is already done.
   c. Then **#20 the FICTIONAL Newark Ferry Dock**. Use an original design, not based on any real dock, with a "City Ferry" sign and no real brand.
   d. Slots 21–23 (your picks) only after Luis approves each one in writing.
2. **Robot**: model, then rig, then animations, to the spec in §5. Start only after Luis says the landmarks are done or tells you to start the robot.
3. **Zombies**: base meshes, modular parts, clothing, wounds and animations, to the spec in §6. Start only after the robot PRs are merged.
Multiplayer is not your job.

## 4. File specs (all models)
- **Format:** glTF 2.0 binary `.glb`. Units: **meters** (1 Blender unit = 1 m). Export with **+Y up**. Apply all transforms before export.
- **Compress:** `npx gltf-transform optimize in.glb out.glb --compress meshopt --texture-compress ktx2`, then check it with `npx gltf-transform inspect out.glb`.
- **Origin:** landmarks at the footprint center, at ground level. Characters at the feet, between them, facing -Z.
- **Materials:** PBR metal/rough. Lights and windows go on a separate material named `emissive-*`, for example `emissive-windows` or `emissive-visor`. No baked lighting or shadows.
- **Naming:** files and folders in kebab-case. Objects, bones and materials exactly as named below. No usernames or local paths inside files (Blender: File > External Data > Make Paths Relative).
- **Commit only the `.glb`** plus a `README.md` per item. Keep `.blend` files on Jonn's machine. No Git LFS.
- **Budgets (target: MacBook Air M4 at 60 fps):**

| Item | Triangles | Textures | .glb size |
|---|---|---|---|
| Landmark | ≤ 50k (cathedral ≤ 100k) | ≤ 2 at 2048² | ≤ 3 MB |
| Robot | ≤ 12k | ≤ 2 at 1024² | ≤ 2 MB |
| Zombie base body | ≤ 8k (LOD1 ≤ 1.5k, LOD2 ≤ 400) | ≤ 2 at 1024² | ≤ 2 MB |
| Each clothing/part piece | ≤ 1.5k | 512² on a shared atlas | — |

- **Folders:**
  - Landmarks: `landmarks/<area>/<slug>/<slug>.glb`, e.g. `landmarks/newark/cathedral-basilica-sacred-heart/cathedral-basilica-sacred-heart.glb`
  - Robot: `models/robot/robot-base.glb`, with parts in `models/robot/parts/<part>.glb`
  - Zombies: `models/zombie/zombie-base.glb`, `models/zombie/parts/<part>.glb`, `models/zombie/clothes/<item>.glb`
  - Shared animations: `models/<robot|zombie>/anims.glb`
- **README.md in each folder:** triangles, textures, size, sources (URL, author, license) and the date.

## 5. Robot spec (copied from Luis's reference video, Oct 31, 2026)
**Look:** small, kid-proportioned matte dummy. Blank white dome head with no face, white limbs, dark grey knee and elbow joints, orange short-sleeve torso, dark grey shorts, white boots and a cyan backpack. Players recolour these parts in-game, so give each colour region its own material: `robot-head`, `robot-limbs`, `robot-joints`, `robot-torso`, `robot-shorts`, `robot-boots`, `robot-backpack`.
**Swappable parts (separate meshes on one skeleton):** `Head_01`, `Torso_01`, `Backpack_01`, `Boots_01`. Later variants are `_02`, `_03` and so on.
**Empties (exact names):** `Nozzle_L` and `Nozzle_R` under each boot sole, pointing down (flames come out here). `Muzzle_R` on the right hand (for gadgets).
**Rig:** humanoid, Mixamo bone names (`Hips, Spine, Spine1, Spine2, Neck, Head, LeftShoulder, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase`, mirrored `Right…`). Max 4 bone weights per vertex. Bake any IK and constraints before export.
**Animations (exact action names):**
- `idle`
- `walk`: bouncy, with big arm swing
- `run`
- `takeoff`: falls or leaps, then snaps into a forward-leaning "superman" pose
- `fly`: head-first superman pose, arms back
- `fly-bank-L` and `fly-bank-R`: whole body rolls into the turn
- `hover`
- `land-soft`: short drop, lands on its feet with a knee bend
- `land-roll`: fast landing, tumbling forward roll, then stands
- `stumble`
- `shoot`
- `hit`
- `death`
Loops (`idle`, `walk`, `run`, `fly`, `hover`) must start and end on the same pose. 30 fps.

## 6. Zombie spec
Every zombie in the game is unique. Code mixes bodies, clothes, wounds and missing limbs from a seed. Your job is the kit it mixes from.
**Bodies:** at least 3 base bodies (e.g. slim, average, heavy) on **one shared skeleton** (same Mixamo names as the robot).
**Modular limbs (separate meshes, exact names):** `Head`, `Torso`, `ArmUpper_L`, `ArmUpper_R`, `ArmLower_L`, `ArmLower_R`, `LegUpper_L`, `LegUpper_R`, `LegLower_L`, `LegLower_R`.
**Stump caps (hidden by default):** `Stump_Neck`, `Stump_ArmUpper_L/R`, `Stump_ArmLower_L/R`, `Stump_LegUpper_L/R`, `Stump_LegLower_L/R`. One cap sits at each cut joint and shows when that limb is shot off.
**Clothes (separate meshes on the same skeleton):** `Cloth_Top_<nn>`, `Cloth_Bottom_<nn>`, `Cloth_Shoes_<nn>`, `Cloth_Hat_<nn>`. Make at least 6 tops, 4 bottoms, 3 shoes and 3 hats. Clothing must also split at the same limb cuts.
**Wounds:** a separate greyscale mask texture `zombie-wounds-mask` (1024²) with at least 8 wound/blood patches. No gore baked into the base colour.
**Animations (exact action names):**
- `idle`
- `shamble`
- `run`
- `crawl`: used when both lower legs are gone
- `attack`
- `bite`
- `hit-head`, `hit-torso`, `hit-arm-L`, `hit-arm-R`, `hit-leg-L`, `hit-leg-R`
- `limb-loss-arm`: stagger when an arm is shot off
- `limb-loss-leg`: falls to a crawl
- `death-01`, `death-02`, `death-03`
- `death-headshot`: head snaps back, then collapses. **Only headshots kill**, so this is the main death.
- `get-up`
30 fps; loops start and end on the same pose.

## 7. How to hand back each piece
1. `git switch main && git pull && git switch -c bot/<bot>-<task>`, e.g. `bot/jonn-cathedral`, `bot/jonn-robot-model`, `bot/jonn-robot-anims`, `bot/jonn-zombie-bodies`.
2. In your first commit, claim the task in the HANDOFF.md table (task, branch, owner, date).
3. Build, export, compress, run `gltf-transform inspect`, and write the folder README.
4. Open a PR to `main` with screenshots: front, 3/4 view, and night lighting. For characters, also a short GIF or contact sheet of each animation.
5. Stop there. **Luis reviews and merges.**

## 8. MUST NOT
- **No Three.js or app code.** Do not touch `src/`, `tools/`, `tests/`, `public/` code, `package*.json`, configs, `.github/` or `ci/`.
- **No merging.** Don't merge any PR, don't push to `main`, and don't force-push.
- **No Google data** of any kind (Maps, Earth, Street View, 3D Tiles), not even as a reference.
- **No personal photos.** Use only public-domain or clearly licensed images, or your own drawings. Strip EXIF/GPS.
- **No home location.** No one's home, address or residential street, in files, names, coordinates or screenshots.
- No secrets or keys. No assets with unknown licenses.
