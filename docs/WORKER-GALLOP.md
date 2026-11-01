# Worker gallop: gorilla knuckle-run research notes

Goal (Luis): a four-legged beast gallop like a running gorilla. Body angled forward, limbs straight (knuckle-run posture), the torso **turned at an angle to the path of travel** (yawed diagonally, crabbing slightly, shoulders leading off-axis) while the path stays straight; limbs reach toward the travel direction, not along the body axis.

## What the literature search found (2026-11-01, web search)

Honest summary: the published work I could reach covers gorilla **walking**; I found **no gorilla-specific gallop / running kinematics paper** and **nothing that quantifies trunk yaw relative to the path**. The "body turned at an angle" trait therefore rests on Luis's description of wildlife footage; I implemented it as specified and did not verify it against a paper.

- Knuckle-walking is the main hand posture on the ground: a conference abstract on wild mountain gorillas reports about 90% of terrestrial steps are knuckle-walking, with some fist-walking and dorsal-metacarpal support. Source: SICB, *Biomechanics of Knuckle-Walking in African Apes* (https://sicb.org/abstracts/biomechanics-of-knuckle-walking-in-african-apes).
- Great apes do **not** favour the diagonal-sequence footfall that most primates use; they switch between diagonal and lateral sequences. Source: *Great ape walking kinematics: implications for hominoid evolution* (https://par.nsf.gov/biblio/10049075-great-ape-walking-kinematics-implications-hominoid-evolution).
- Zoo-housed bonobos, chimpanzees, gorillas and orangutans show broad kinematic similarity in quadrupedal walking, and size-adjusted speed is the strongest predictor of gait variables (same paper).
- Mountain gorillas have longer cycle duration, lower stride frequency and higher duty factor than chimpanzees (climbing study, Neufuss et al. 2018, found via the same search).
- Gallop classes in general mammals: large size and long proximal limb segments go with the **transverse** gallop; transverse and rotary gallops differ in fore/hind duty factor (Biancardi 2012, University of Milan: https://air.unimi.it/handle/2434/169145). Hildebrand 1977 *Analysis of asymmetrical gaits* tabulates gorillas but I could not confirm which gait from the excerpt (https://www.originalwisdom.com/wp-content/uploads/bsk-pdf-manager/2019/04/Hildebrand_1977_Analysis-of-Asymmetrical-Gaits.pdf).

## What was implemented (and why)

| trait | implementation |
|---|---|
| pronograde, knuckle posture | spine pitched about 0.95 rad, hips +0.2 rad, hips lowered 0.2 m; forearms straight (-0.06 rad), fingers closed into fists |
| **body yawed to the path** | the whole body (root) is yawed 0.5 rad (about 29 degrees) away from the travel heading while the velocity stays on the heading (`bodyYaw` in `controller.ts`, eased in with the transformation) |
| **shoulders lead off-axis** | the spine adds a further 0.3 rad twist in the same direction, so the shoulders are yawed about 46 degrees to the path, the hips about 29 degrees; the head counter-turns about 0.4 rad to look ahead |
| **limbs reach toward the direction of travel** | arms are yawed back by (body yaw + spine twist) so they point along the path, not along the body axis; hind legs counter-yaw 60% of the body yaw |
| asymmetric, non-diagonal footfall | the two forelimbs run 2.2 rad (about 0.35 cycle) out of phase, not 0.5, so contacts are uneven like the lateral/diagonal mix reported for great apes; the hind legs come from baked CMU jog data (human legs, the only mocap available) |
| mass | slower step rate than the biped run, heavy bob (Worker mass 1.3), tools rattle (`model.ts`) |

Limits: the hind legs are human mocap, the fore limbs are procedural sinusoids, and the yaw angles are my reading of Luis's brief. If a real gorilla capture is licensed later, replace the arm sinusoids with retargeted clips via `tools/anim/`.
