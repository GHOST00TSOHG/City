# Robot audio slots (Echo v3)

Files: `public/audio/robots/<type>/<type>-<slot>.{ogg,m4a}` (docs/audio-robots-v3/README.md). Code: `src/robot/audio.ts`, wiring in `src/main.ts` (`audioFrame`) and `src/robot/controller.ts`. Test: `BROWSER=webkit node tools/test-robot-audio.mjs`.

Rules in force: **no idle sound** (robots are silent standing still); **every loop plays from the .ogg** (sample-seamless 4.00 s); one-shots use .ogg and fall back to .m4a only if the ogg cannot be decoded; a slot missing from `public/audio/robots/manifest.json` (`node tools/audio-manifest.mjs`) is never requested, so **a missing file is silent with no 404 and no console error**; all clips play at gain 1.0 unless a map below says otherwise (levels are mastered in the files); `flyby-mono` is positional (HRTF panner).

**Frames are at 60 fps (1 frame = 16.67 ms).** "t = 0" is the trigger event. The four robots share every slot except where a row says otherwise.

## One-shots

| slot | trigger | exact timing |
|---|---|---|
| `power-up` | robot spawns (game start / Enter world) or is selected in the garage | t = 0 on that frame |
| `power-down` | the garage is opened from the world (robot shuts down) | t = 0 |
| `switch`, `footstep-grass/wood/metal_*` | **not wired**: no robot-switch event distinct from garage select, and the world has no surface types yet | |
| `footstep_01..03` | walking and jog plants, random, never the same file twice in a row | one plant every pi / (v x 2.6) s: **scout** 3.91 m/s = 0.309 s (18.5 frames), **heavy** 2.72 = 0.444 s (26.7), **worker** 3.40 = 0.355 s (21.3), **glitch** 3.57 = 0.338 s (20.3) |
| `run-step_01..03` | run plants while not transformed (Scout, Worker, first 0.4 s of a run before the plates move far enough: form < 0.5) | one plant every pi / (v x 1.5) s: scout 9.0 m/s = 0.233 s (14.0 frames), worker 7.5 = 0.279 s (16.8). Heavy (ball), Worker (tread) and Glitch (cloud) are silent on foot at speed: their loops / snaps take over |
| `turn-servo` | yaw rate above 5 rad/s on the ground, 0.7 s (42 frames) cooldown | t = 0 on the first frame above the rate |
| `stop-skid` | ground speed was above 5.5 m/s and falls under 1.2 m/s, or Scout's slide starts; 0.8 s (48 frames) cooldown | t = 0 on that frame |
| `hydraulic-push` / `hydraulic-release` | hold X (power-up crouch) starts / ends | t = 0 |
| `bump-clang` | running or flying into a wall (building / pole), 0.45 s (27 frames) cooldown | t = 0 on the contact frame |
| `hit` | damage taken (K debug key until zombies exist) | t = 0 |
| `land-slam` (Heavy), `land-knee` (Scout), `land-hiss` (Worker), `land-reform` (Glitch) `_light` / `_heavy` | touchdown after a fall. strength s = clamp((fall speed - 6) / 34, 0, 1): **s < 0.5 plays `_light`, s >= 0.5 plays `_heavy`** (0.5 = 23 m/s down, about a 12 m fall; the hero drop is s = 1). Plain landings use the same variants | impact = landing frame 0 (the clip's impact is at its frame 0). Landing animation lasts (0.75 / 0.85 / 0.80 / 0.70 s) + 0.55 x s |
| `special` Heavy ground pound | Z: plays `land-slam_heavy` | impact 0.47 s = frame 28 after the key |
| `teleport-snap_01..03` (Glitch special) | Z blink-dash | dissolve 0 to 0.12 s (frames 0 to 7), reform burst 0.42 s = frame 25 |
| `takeoff-charge` (1.5 s clip) | F on the ground: crouch / spool-up. The take-off crouch is shorter than the clip, so the clip starts that far into itself and **its end meets the ignite** | crouch (= audible part of the charge): Heavy 0.50 s (30 frames), Worker 0.20 s (12), Scout 0.12 s (7), Glitch 0.10 s (6); ignite at the same frame the crouch ends |
| `thrust-ignite` (1.3 s clip) | the rockets light (end of the crouch, or F / Space again in the air) | t = 0. Burn loop enters at +0.95 s (frame 57), fades in over 0.3 s (18 frames): full level at +1.25 s (frame 75) |
| `boost` (2.0 s clip) | the super-fast rocket kick: Shift BURST starts while flying; layers over the burn loop | the burst weight reaches 50% 0.087 s (5 frames) after the key: t = 0 there; clip ends 120 frames later |
| `thrust-cutoff` | the rockets stop (landing set-down, F, touchdown) | t = 0; the burn loop fades out over 0.15 s (9 frames) |
| `thrust-crackle` (Glitch) | while flying and throttle > 0.05, random every 0.15 to 0.55 s (9 to 33 frames) | random |
| `flyby-mono` (2.6 s, positional) | flying, the robot will pass the camera: closest approach predicted 1.3 s ahead, relative speed above 25 m/s, miss distance under 60 m, 6 s (360 frames) cooldown. The panner follows the robot, the camera is the listener | clip starts 1.3 s (78 frames) before the pass; peak at 78 frames. (`flyby` stereo is not used) |
| `tread-transform` (Worker) | tread mode starts: ground speed passes **5.0 m/s** while running | clip starts 0.05 s (3 frames) late so its **lock snap at 0.75 s lands at the game lock, frame 48 (0.80 s)** |
| `transform` (Heavy, Scout) | fold starts (Shift+W on the ground) | same: 3 frames late, lock at frame 48 |
| `tread-unfold`, `unfold` | unfold starts (Heavy / Scout: keys released, Scout after its slide; Worker: speed below **3.6 m/s**) | t = 0; unfold ends at frame 48 (0.8 s) |
| `steam-vent` (Worker) | tread unfold finished | frame 48 after the unfold started |
| `tread-turn-sparks` (Worker) | treads out, speed above 3 m/s, yaw rate above 1.6 rad/s, 1.0 s (60 frames) cooldown | t = 0 |
| `dissolve` (Glitch) | running starts: the cloud weight (1 - e^(-3.2 t)) passes 0.5 | 0.217 s (13 frames) after Shift+W |
| `teleport-snap_01..03` (Glitch on foot, **Luis's pick**) | while running as a cloud at over 3 m/s: first snap 0.3 s (18 frames) after the dissolve, then every 0.62 s (37 frames); random, no immediate repeat | |
| `reform` (Glitch) | he stops: cloud weight (rate 4.5 /s) falls below 0.5 | 0.154 s (9 frames) after the keys are released; solid about 0.5 s (30 frames) later |
| `cloud` loop file | **not used** (Luis chose the teleport snaps for the on-foot run) | |

## Loops (always .ogg)

| slot | plays while | gain / rate map | start / stop |
|---|---|---|---|
| `thrust-burn` (Glitch: `thrust-hum`, **only while flying**) | flying (rockets on) | rate = 0.9 + 0.25 x throttle (throttle 0.35 hover to 1.0 climb or burst: rate 0.99 to 1.15); gain = (0.6 + 0.4 x throttle) x (1 - 0.6 x skim) | enters 0.95 s (frame 57) after the ignite with a 0.3 s (18 frame) fade-in; stops with a 0.15 s (9 frame) fade at the cutoff. Glitch's hum is silent on the ground |
| `water-skim` | flying within 8 m of the water surface: skim = 1 - altitude / 8 | gain = skim (fade 0.2 s = 12 frames), crossfaded against the burn loop | |
| `roll` (Heavy) | ball closed (form >= 0.97) on the ground. **README map: rate = 0.8 + 0.4 x clamp((v - 16) / 9, 0, 1) over 16 to 25 m/s; gain = -4 dB at 16 m/s rising to 0 dB at 25 m/s** (-4 dB / rate 0.8 below 16). The closed ball now accelerates to **25 m/s** (`BALL_TOP`) so the whole range is used | rate 0.8 to 1.2, gain 0.63 to 1.0 | starts at the lock (frame 47 after the fold began, speed about 5.9 m/s), reaches 16 m/s 0.22 s (13 frames) later and 24 m/s after 0.85 s (51 frames); stops when the unfold starts (0.15 s fade) |
| `tread-growl` (Worker) | treads out and locked (form >= 0.97) | u = speed / 7.5 m/s (clamped 0..1). **rate = 0.85 + 0.5 x u**; gain = -12 dB x (1 - u): -12 dB at crawl to 0 dB at 7.5 m/s. In tread mode speed runs 3.6 to 7.5 m/s: u 0.48 to 1.0, rate 1.09 to 1.35, gain 0.49 to 1.0 | starts at the lock (frame 47 after the fold began), stops at the unfold |
| `tread-clatter` (Worker) | same | **rate = 0.6 + 0.9 x u**, same gain map: rate 1.03 to 1.5 | same |
| `hover-sprint` (Scout) | the low hover-sprint form is locked (form >= 0.97, includes the slide) | gain = 0.55 + 0.45 x speed / 9 m/s (0.55 standing in form, 1.0 at 9 m/s), rate 1 | starts at the lock (frame 47), stops at the unfold |

## Transformations (on foot only; flying never transforms; Glitch does not transform)

All three: **fold 0.80 s = 48 frames, unfold 0.80 s = 48 frames** (matches Echo's clips). Plate waves start between frame 0 and 22 and last 26 frames each; gears peak around frame 24. Lock snap + camera shake at frame 48 (fold) and frame 48 (unfold).

| robot | form | starts when | unfold when |
|---|---|---|---|
| Heavy | armoured ball (rolls) | Shift+W on the ground | keys released; the roll eases upright first (up to about 20 frames) |
| Scout | low hover-sprint | Shift+W on the ground | keys released and the 0.85 s (51 frames) slide is over |
| Worker | tread mode | running and ground speed above **5.0 m/s** (about 3 frames after Shift while walking at 3.4 m/s) | speed below **3.6 m/s** (hysteresis band 1.4 m/s; tread mode brakes with momentum, so about 11 frames after the keys are released at full speed) |

## Speed ranges at a glance

| robot | walk | run / form speed | loop in that form |
|---|---|---|---|
| Scout | 3.91 m/s | 9.0 m/s | `hover-sprint`, gain 0.55 to 1.0 |
| Heavy | 2.72 m/s | ball 5.9 m/s at the lock, up to 25 m/s | `roll`, 16 to 25 m/s mapped to rate 0.8 to 1.2, gain -4 to 0 dB |
| Worker | 3.40 m/s | tread mode 3.6 to 7.5 m/s | `tread-growl` rate 1.09 to 1.35, `tread-clatter` rate 1.03 to 1.5, gain -6 to 0 dB |
| Glitch | 3.57 m/s | cloud 8.1 m/s | none: `dissolve`, snaps every 0.62 s, `reform` |

## Landing strength at a glance

Strength 0.5 = 23 m/s downward. A 30 m drop is s = 0.83 (`_heavy`); a 2.2 m drop is s = 0.25 floor (`_light`).
