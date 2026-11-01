# City robots SFX v3 ("Transformers-level")

Four robots: **heavy, scout, worker, glitch**. Files: `<type>/<type>-<event>.{wav,ogg,m4a}`
(WAV = 48 kHz / 24-bit master, OGG Vorbis q6, M4A AAC 192k). All mono except `<type>-flyby` (stereo pan L→R; `<type>-flyby-mono` is the same sound unpanned, for Websmith to pan/spatialise in Three.js `PositionalAudio`).
Loudness: one-shots max momentary -17 LUFS, loops -18 LUFS integrated, true peak ≤ -1.2 dBTP (see LOUDNESS.md).
**No idle file: robots are silent when standing still.**

Every metal / impact / thruster / whoosh layer is a real CC0 recording (Kenney packs + verified-CC0 Freesound clips, see LICENSES.md); numpy/scipy synthesis (servo motors, sub thuds, hiss, robot chirp voice, Glitch power core) is layered on top. Shared base recordings are tuned per robot (pitch / EQ / layer mix) via `ROBOTS` in the build script.

## Rebuild / re-cut
`python3 build_robots_v3.py` (needs ffmpeg with libvorbis/aac/libmp3lame, numpy, scipy). `ONLY=heavy` or `SLOTS=boost,hit` rebuild a subset (previews/docs only regenerate on a full run).
All timings are in `TIMING` (transform 0.8 s, lock 0.75 s, stage starts, dissolve/reform 0.3 s, boost 2.0 s, loop length…) and per-robot tuning in `ROBOTS`; slot names in `registry()`. When docs/AUDIO-SLOTS.md lands with exact 60 fps frames, edit those dicts and rerun.

## Trigger notes (all robots unless stated)
| Event | Type | Trigger |
|---|---|---|
| footstep_01..03 (= footstep-road_01..03, identical) | one-shot | each foot plant, round-robin; walk ~2 steps/s. Includes heel clank + body ring + sub thud + leg-servo on lift. |
| footstep-grass/wood/metal_01..03 | one-shot | same, by surface under foot |
| run-step_01..03 | one-shot | jog/run plants (3–3.5 /s), harder + brighter. Heavy's fast mode is `heavy-roll`, Worker's is tread mode, Glitch's is `glitch-cloud` (or teleport snaps) |
| turn-servo | one-shot | quick turn / snap rotation |
| stop-skid | one-shot | hard stop from run (metal scrape + sparks) |
| hydraulic-push / hydraulic-release | one-shot | crouch / stand, arm lift, any piston move |
| bump-clang | one-shot | collision with buildings, poles, cars |
| hit | one-shot | taking damage |
| power-up | one-shot | on spawn and on garage select |
| power-down | one-shot | despawn / shutdown / garage exit |
| switch | one-shot | robot select/switch: transform clank + per-robot chirp "voice" |
| takeoff-charge | one-shot (1.5 s) | charge-up before liftoff; play ignite at its end |
| thrust-ignite | one-shot (1.3 s) | liftoff; start the burn loop ~0.9–1.0 s in with a 0.3 s fade-in |
| thrust-burn (Glitch: thrust-hum) | **loop 4.00 s** | steady flight; may modulate playbackRate 0.9–1.15 with throttle |
| boost | one-shot (2.0 s) | super-fast rocket thrust: kick + surge + roar, layer over the burn loop |
| thrust-cutoff | one-shot | landing / thrust off; fade burn loop over ~0.15 s at trigger |
| flyby / flyby-mono | one-shot (2.6 s, loudest at 1.3 s) | robot passes the camera; align 1.3 s with closest approach |
| water-skim | **loop** | thrusting low over water; crossfade with burn loop by altitude |
| land-…_light / _heavy | one-shot, impact at frame 0 | landing strength < 0.5 → _light, ≥ 0.5 → _heavy |

### Specials
- **Heavy**: `heavy-transform` (0.8 s, staged arms → legs → head/spine, lock snap 0.75 s), `heavy-unfold` (reverse), `heavy-roll` **loop** (armored ball: low rumble + plate rattle + seam thumps 3/s at 1.0x). Speed map: playbackRate = 0.8 + 0.4·(speed−16)/9 clamped 0.8–1.2 for 16–25 m/s; gain −4 dB at 16 m/s → 0 dB at 25 m/s. `heavy-land-slam_light/_heavy` (sub drop + concrete crack + debris tail).
- **Scout**: `scout-transform`, `scout-unfold` (~0.8 s), `scout-hover-sprint` **loop** (thruster slide), `scout-land-knee_light/_heavy` (impact at 0, knee-servo stab, metal skid, whoosh tail); end a slide with `scout-stop-skid`.
- **Worker** (no gallop; fast run = tread mode): `worker-tread-transform` (fold-down clank 0.8 s, lock 0.75 s), `worker-tread-unfold` (fold-up 0.8 s), `worker-tread-growl` **loop** (diesel growl; 6-cyl firing ~11 Hz at 1.0x) → playbackRate = 0.85 + 0.5·(speed/vmax), `worker-tread-clatter` **loop** (14 link hits/s at 1.0x) → playbackRate = 0.6 + 0.9·(speed/vmax), gain from −12 dB (crawl) to 0 dB; `worker-tread-turn-sparks` on sharp tread turns; `worker-land-hiss_light/_heavy` (hydraulic settle hiss + thunk), `worker-steam-vent` (one-shot vent). Walk/jog use normal footsteps.
- **Glitch**: `glitch-thrust-hum` **loop** = its flying sound only (cold violet plasma, 55 Hz core, crackle low-passed < 2 kHz, no static); `glitch-thrust-crackle` one-shot accent during flight; `glitch-dissolve` (0.3 s) → `glitch-cloud` **loop** (calm particle drift, its fast-move mode) → `glitch-reform` (0.3 s, bit-crush resolving to clean tone + snap); `glitch-land-reform_light/_heavy`. **Alternate (flag):** `glitch-teleport-snap_01..03` (digital break-up + snap per hop) – Luis asked for snaps, Websmith specified cloud; both delivered, pick one.

## Loops
All loops are exactly 4.00 s (192000 samples), rendered 4.15 s and equal-power seam-crossfaded, so `loop=true` is sample-seamless (verified: wrap 2nd-difference below the file's 99.9th percentile, see LOUDNESS.md). Use `.ogg` for looping in browsers (AAC/m4a adds encoder priming padding = gap at loop point; use m4a only for one-shots or Safari with WebAudio `loopStart/loopEnd` trimming).

## Previews
- `preview_v3.mp3` (~59 s): per robot in order Heavy, Scout, Worker, Glitch: power-up → walk (6 steps) → takeoff-charge → ignite → fly (burn loop) → boost → cutoff → special.
- `audition_reel_v3_full.mp3` (~4.3 min): every file, robot by robot.
- `preview_v3_spectrogram.png`.
