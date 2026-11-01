# Robot audio slots

Files: `public/audio/robots/<type>/<type>_<slot>.{ogg,m4a}` (both formats). The game reads `public/audio/robots/manifest.json` (`node tools/audio-manifest.mjs` regenerates it) and only fetches slots listed there, so **a missing file is silent: no request, no 404, no console error**. Add a file, run the manifest tool, commit. Code: `src/robot/audio.ts`. All clips play at gain 1.0 (level is mastered in the file), one master gain. Robots are **silent standing still**: the old idle loop slot is gone (files deleted).

Timings below are exact for the current code at **60 fps (1 frame = 16.67 ms)**. "t = 0" is the event named in the trigger column.

## Slots (all four robots unless a column says otherwise)

| slot | type | trigger | timing | present today |
|---|---|---|---|---|
| `footstep_01..03` | one-shot, round-robin | every half gait cycle while on foot (not while folded as a ball or while Glitch is a cloud) | see step-rate table | all four |
| `power_up` | one-shot | robot spawns, is selected in the garage, or the garage closes (Enter world) | t = 0 at the event; no repeat inside the same frame | none (Echo) |
| `boost` | one-shot, the big surge + roar | the super-fast rocket kick: Shift BURST starts while flying | burst smoothing is 1 - e^(-8 dt): 50% at 5 frames (0.09 s) after the key; play at the key press | all four |
| `hit` | one-shot | wall bonk / non-landing impact (damage) | t = 0 at impact | all four |
| `land_light` / `land_heavy` | one-shots | touchdown after a fall; strength s = clamp((fall speed - 6) / 34, 0, 1); **s < 0.5 plays `_light`, s >= 0.5 plays `_heavy`** (0.5 = 23 m/s, about a 12 m fall; the hero drop is s = 1) | impact at landing frame 0; typed landings last (0.75 to 0.85) + 0.55 s (+ 0.55 x s) (see below) | none (Echo) |
| `transform` / `unfold` | one-shots | Heavy, Scout: fold starts / unfold starts (the clip carries the clunks and the final lock). **Worker uses `tread_transform` / `tread_unfold` instead** | see transform table | none (Echo) |
| `thruster_ignite` | one-shot | rockets light (take-off kick: mode becomes ROCKETS; Heavy waits out its 0.5 s crouch, Scout 0.12 s, Worker 0.2 s) | t = 0 on the frame the rockets light; throttle reaches 63% 6 frames (0.1 s) later | none (Echo) |
| `thruster_burn_loop` | loop | while flying; gain = 0.3 + 0.7 x throttle (throttle 0.35 hover .. 1 climb / burst) | starts at ignite, follows throttle every frame | none (Echo) |
| `thruster_cutoff` | one-shot | rockets stop (auto-land set-down, or the touchdown) | t = 0 on the frame flight ends | none (Echo) |
| `special_groundpound` (Heavy) | one-shot | Z special | impact at 0.47 s = frame 28 after the key | heavy |
| `special_blinkdash` (Glitch) | one-shot | Z special | dissolve 0 to 0.12 s (frames 0 to 7), reform burst at 0.42 s = frame 25 | glitch |
| `roll_loop` (Heavy) | loop | ball closed (form >= 0.97) and on the ground; gain = min(1, 0.3 + v/run); playback rate 0.8 + 0.4 x min(1.2, v/run) | starts at the lock frame, stops when the unfold starts; speed range **0 to 5.85 m/s** (rate 0.8 to 1.2) | none (Echo) |
| `tread_transform` (Worker) | one-shot | tread mode starts: ground speed passes **5.0 m/s** while running (Shift+W) | t = 0 on that frame (about 3 frames, 0.05 s, after Shift when walking at 3.4 m/s); the clip should carry the plate clunks and the snap lock at **frame 48** (0.80 s) | none (Echo) |
| `tread_unfold` (Worker) | one-shot | ground speed falls below **3.6 m/s** while in tread mode (hysteresis band 1.4 m/s, so it cannot flicker) | t = 0 on that frame (about 11 frames, 0.18 s, after the keys are released at full speed: tread mode brakes like a tank, speed x e^(-4 t)); snap lock at **frame 42** (0.70 s) | none (Echo) |
| `tread_growl` (Worker) | loop (diesel) | treads out and locked (form >= 0.97) and on the ground; **gain = 0.35 + 0.65 x v, playback rate = 0.75 + 0.5 x v**, v = ground speed / 7.5 m/s | starts at the lock frame (frame 48 after the fold began), stops when the unfold starts; range 3.6 to 7.5 m/s means v 0.48 to 1.0: gain 0.66 to 1.0, rate 0.99 to 1.25 | none (Echo) |
| `tread_clatter` (Worker) | loop (track) | same condition; **gain = 0.3 + 0.7 x v, playback rate = 0.6 + 0.9 x v** | same start / stop; range: gain 0.64 to 1.0, rate 1.03 to 1.5 | none (Echo) |
| `land_hiss` (Worker) | one-shot | four-limb landing steam burst | t = 0 at touchdown (with the steam puffs); strength does not change the file | none (Echo) |
| `thrust_hum` (Glitch) | loop | **only while flying** (mode ROCKETS); gain = max(0.15, throttle) | starts on ignite frame, stops on the frame flight ends | none (Echo) |
| `thrust_crackle` (Glitch) | one-shots | while flying and throttle > 0.05, every 0.15 to 0.55 s at random | random | none (Echo) |
| `dissolve` (Glitch) | one-shot | running starts: cloud blends in (cloud weight 1 - e^(-3.2 dt)) | t = 0 when the cloud passes 0.5 (about 13 frames, 0.22 s, after Shift+W) | none (Echo) |
| `cloud_loop` (Glitch) | loop | while the cloud weight is above 0.5 (calm drift) | from the dissolve frame until the re-form frame | none (Echo) |
| `reform` (Glitch) | one-shot | he stops: cloud weight falls below 0.5 (rate 4.5 /s, about 9 frames, 0.15 s after the keys are released), soft burst at the same frame | t = 0 at that frame; solid again about 0.5 s later (30 frames) | none (Echo) |

## Transformations (on foot only; no transform while flying; Glitch does not transform)

| robot | form | fold | unfold | lock frame (snap + camera shake) | plate wave |
|---|---|---|---|---|---|
| Heavy | armoured ball (rolls) | 0.80 s = **48 frames** | 0.70 s = **42 frames**, after the roll eases upright (up to about 20 frames) | fold lock at frame 48 (`closed`, shake 0.5); open lock at frame 42 (`open`, shake 0.35) | plates start between frame 0 and 22, each lasts 26 frames; gears spin up mid-fold (peak about frame 24) |
| Scout | low hover-sprint | 0.60 s = **36 frames** | 0.50 s = **30 frames** (waits through the slide, 0.85 s) | frame 36 / frame 30 | starts 0 to 17, 19 frames each |
| Worker | **tread mode**: legs fold up, tank treads drop from the shins | 0.80 s = **48 frames** | 0.70 s = **42 frames** | frame 48 / frame 42 | plates start between frame 0 and 22, 26 frames each; left tread drops between frames 12 and 41, right between frames 16 and 45 (staggered); on unfold the right tread lifts first (frames 3 to 28) then the left (frames 6 to 32) |

Worker's fold starts when ground speed passes 5.0 m/s while running and ends below 3.6 m/s (the other two start with Shift+W and end when the keys are released); the unfold starts when the keys are released. Fold-phase events: `fold` at frame 0, `closed` at the lock frame; unfold: `unfold` at frame 0, `open` at the lock frame. Only `fold` / `unfold` play a file (`transform` / `unfold`); the lock (snap) is a moment inside that clip at the times above.

## Landings (typed, by fall speed)

Duration = base + 0.55 x s: Heavy slam 0.75, Scout one-knee 0.85, Worker quad 0.80, Glitch voxel 0.70 (s = 0.25 to 1 gives 0.89 to 1.30 s for Heavy = 53 to 78 frames). Impact is landing frame 0 (dust ring, crack decal, shake, steam happen at frame 0). Pose is deepest at 16% (frames 9 to 12) and the rise starts at 60%. Scout springs up at 62% to 80% of the duration. Glitch: dissolve starts when the feet are under 1.7 m and falling faster than 3 m/s (0.06 to 0.5 s before touchdown), voxels rain until frame 0, **reform + violet pulse at frame 11 (0.18 s) after touchdown**.

## Step rate per gait (footstep slots)

A step plays every half gait cycle: steps/s = ground speed x k / pi with k = 2.6 below 5 m/s and 1.5 above.

| robot | walk speed | walk step rate | run speed | run step rate |
|---|---|---|---|---|
| scout | 3.91 m/s | 3.24/s (18.5 frames) | 9.00 m/s | 4.30/s (14.0 frames) |
| heavy | 2.72 m/s | 2.25/s (26.7 frames) | 5.85 m/s | 2.79/s (21.5 frames) |
| worker | 3.40 m/s | 2.81/s (21.3 frames) | 7.50 m/s | 3.58/s (16.8 frames) |
| glitch | 3.57 m/s | 2.95/s (20.3 frames) | 8.10 m/s | 3.87/s (15.5 frames) |

Heavy has no run footsteps (he is a ball: `roll_loop`), Glitch has none while a cloud, Scout slides silently (add a `slide` slot later if wanted), Worker has no run footsteps in tread mode (`tread_growl` / `tread_clatter` instead); below 5.0 m/s he stays upright and uses the footsteps (walk and jog).
