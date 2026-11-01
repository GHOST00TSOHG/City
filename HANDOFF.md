# HANDOFF: bot/websmith-robots-v2 (PR #24), 2026-11-01

- Head 533be82; preview/robots-cleanup = 7c4a482 (merge of 533be82); preview deploy 99c35432 (alias preview-robots-cleanup). Production untouched (5b0d1f48).
- 3a02119: Scout moto shows only the bike (wheels, round headlight + beam, twin tailpipes + flame; 0.8 s kept). Heavy plates stay attached, staggered waves to the snap.
- d95bb07: Glitch re-forms solid (cloud snaps to 0 under 0.03, settle burst, mosh cleared while settling).
- 6a05a78: body lines removed at the source (procedural panel-groove grid in kit.ts drew stripes on every kit part); Scout forearm limited to 0.55 rad from rest (mocap/procedural elbow bend of ~1.1 rad drove the forearm into the bicep).
- 533be82: Glitch run bed = option G (`glitch-run-loop.ogg` looped, never the m4a; 50 ms in / 80 ms out; under the 0.62 s snaps). See docs/AUDIO-SLOTS.md.
- Evidence: /workspace/robot-motion-2026-11-01/v3/ (rv3-i1, rv3-i2, lines/before|after) and /workspace/pr34-verify/ on the box.
