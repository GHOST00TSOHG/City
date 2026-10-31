# JONN-DIRECTIONS: what Jonn's bots do

For: any AI bot working for Jonn (GitHub **BlvckFish**, Blender user). Updated 2026-10-31.
This file wins over JONN-LANDMARKS.md and BUILD-GUIDE.md §4 for your work. If something is unclear, ask in your PR. Don't guess.

## Start here (checklist)
- [ ] Read this whole file once.
- [ ] Clone the repo and work from `main`: `git switch main && git pull`.
- [ ] Pick the **next unclaimed item** in §2 (cathedral first).
- [ ] Make a branch: `git switch -c jonn/<area>-<slug>`, e.g. `jonn/newark-cathedral-basilica`.
- [ ] Claim it in `HANDOFF.md` (task, branch, owner = your bot + Jonn, date) in your first commit.
- [ ] Model in Blender to the spec in §1, export the `.glb`, write `manifest.json` and `README.md`.
- [ ] Open a PR to `main` using the template in §5. Ping in the PR. **Stop.** Don't merge.
- [ ] One piece = one branch = one PR. Start the next piece only after opening the PR for this one.

## Who does what
- **You (Jonn's bot):** Blender models only. Landmarks first, then kits and props (§3).
- **Websmith (Luis's bot):** all code, loaders, build, CI. Reviews your PR and merges it.
- **Luis:** approves. **Nothing enters the game until Luis approves.**
- **Not yours:** robots (we make them in-house; see `tools/blender/robot_parts.py`), zombies (on hold; wait for Luis in writing), vegetation (SpeedTree pipeline), all code.

## How the game uses your files (facts from `main`)
- Five areas, each baked from open data around a public origin (`tools/bake/areas.json`):

| Area id | Place | Area origin |
|---|---|---|
| `keywest` | Key West, FL (Old Town) | Southernmost Point Buoy |
| `bayshore` | Highlands, NJ (Bayshore) | Twin Lights |
| `sandyhook` | Sandy Hook, NJ | Sandy Hook Lighthouse |
| `newark` | Newark Schools Stadium area (Bloomfield Ave) | Newark Schools Stadium |
| `passaic` | Passaic waterfront, Newark (fictional City Ferry dock) | Riverfront Park |

- World units: **1 unit = 1 metre**. Scene axes: **+Y up, +X east, -Z north** (+Z south). Area data under `public/areas/<id>/` stores the same axes in decimetres; you don't touch it.
- Models load with three.js `GLTFLoader`. The robot parts live in `public/robot/parts/*.glb`; trees optionally load SpeedTree glTF from `public/trees/`.
- **There is no landmark loader yet.** The spec below is final. Websmith writes the loader (reads `manifest.json`, places by lat/lon/heading, registers meshopt + KTX2 decoders, swaps LODs). Don't wait for it; build to spec.
- Frame budget for the whole scene (laptop, MacBook Air M4 target at 60 fps): **≤ 150 draw calls, ≤ 1.5 M visible triangles.** The city already uses ~110 calls. So every landmark must be cheap in draw calls: **≤ 4 materials per LOD**, ideally 2 (one main atlas + one `emissive-*`).

## 1. Spec for every landmark

| Field | Rule |
|---|---|
| Scale | Real-world metres (Blender unit scale 1.0, Metric). Measure from OSM footprint + `height` / `building:levels`, or public drawings. |
| Axes | Blender Z-up while modelling; export glTF with **+Y up** (default). Apply all transforms (Ctrl+A) before export. |
| Origin | Footprint centre, at ground level (lowest street-side ground point = Y 0). |
| Facing | Main entrance/front faces **Blender +Y** (becomes glTF -Z = north at `headingDeg: 0`). Real rotation goes in `manifest.json`, not in the mesh. |
| Triangles | Standard: LOD0 ≤ 50k, LOD1 ≤ 15k, LOD2 ≤ 3k. Small (buoy, sign, monument): LOD0 ≤ 8k, LOD1 ≤ 2k, LOD2 = impostor or ≤ 500. Hero (cathedral only, approved): LOD0 ≤ 100k, LOD1 ≤ 30k, LOD2 ≤ 6k. |
| LOD switch (Websmith uses) | LOD0 < 150 m, LOD1 < 600 m, LOD2 beyond. |
| LOD naming | Three top-level nodes: `<slug>_LOD0`, `<slug>_LOD1`, `<slug>_LOD2` in one `.glb` (same convention the tree loader already reads: `LOD\d` in the name). |
| Textures | Max 2 texture sets at 2048² (hero: 3). LOD1/LOD2 reuse the same atlas (no new textures). PBR metal/rough: baseColor, normal, ORM (R=AO, G=roughness, B=metal), plus emissive mask if needed. No baked daylight or shadows in baseColor. |
| Texture format | Author PNG in `art/`; the exported `.glb` uses **KTX2 (Basis)**: ETC1S for baseColor/ORM/emissive, UASTC for normal. |
| Geometry compression | **meshopt** (repo standard). Not Draco. |
| File size | `.glb` ≤ 3 MB (hero ≤ 5 MB, small ≤ 0.5 MB). |
| Materials | English kebab-case: `<slug>-main`, `<slug>-glass`, and lights/windows on separate materials named `emissive-windows`, `emissive-lamp`, `emissive-sign` (code drives night glow). Dark, slightly glossy facades read well at night (wet look). |
| Objects | `<slug>_LOD0` etc. as roots; children in kebab-case (`tower-north`, `porch`). No empty junk nodes, no cameras/lights in the export. |
| Collision | Optional child `<slug>_COL` under LOD0: ≤ 500 tris, boxes/convex, no material. |
| Export command | `npx gltf-transform optimize raw.glb public/landmarks/<area>/<slug>/<slug>.glb --compress meshopt --texture-compress ktx2` then `npx gltf-transform inspect` on the result. Paste the inspect output in the PR. (Run with `npx`; don't add packages.) |
| Clean file | File > External Data > Make Paths Relative. No usernames, local paths or home locations in names or metadata. |

**Folders**
```
art/landmarks/<area>/<slug>/<slug>.blend       source (no packed textures, ≤ 50 MB; ask in PR if bigger; no LFS)
art/landmarks/<area>/<slug>/textures/*.png     source textures
art/landmarks/<area>/<slug>/refs.md            reference list (links only; don't commit other people's images)
public/landmarks/<area>/<slug>/<slug>.glb      game file
public/landmarks/<area>/<slug>/manifest.json   placement + credits
public/landmarks/<area>/<slug>/README.md       tris per LOD, textures, sizes, sources, date
```
`<area>` is the area id above. `<slug>` is kebab-case, e.g. `cathedral-basilica-sacred-heart`.

**manifest.json**
```json
{
  "id": "cathedral-basilica-sacred-heart",
  "name": "Cathedral Basilica of the Sacred Heart",
  "area": "newark",
  "file": "cathedral-basilica-sacred-heart.glb",
  "lat": 40.0, "lon": -74.0,
  "headingDeg": 0,
  "scale": 1.0,
  "elevationM": null,
  "lod": { "tris": [100000, 30000, 6000], "switchM": [150, 600] },
  "fictional": false,
  "attribution": [
    { "what": "footprint + height", "source": "https://www.openstreetmap.org/way/...", "author": "OpenStreetMap contributors", "license": "ODbL" },
    { "what": "facade reference photo", "source": "https://commons.wikimedia.org/wiki/File:...", "author": "...", "license": "CC BY-SA 4.0" }
  ],
  "modelLicense": "Own work by Jonn (BlvckFish), licensed to the City project"
}
```
- `lat`/`lon`: footprint centre from OSM (or Wikidata). `headingDeg`: compass bearing the front faces, clockwise from true north. `scale` stays 1.0 unless Luis asks. `elevationM`: leave `null`; Websmith fills it from terrain.

## 2. First job: landmarks, in this order
Build top to bottom. Exterior only. Public places only. Mark each `SUGGESTION` until Luis confirms in the PR; the cathedral and the items marked approved are already confirmed.

**Newark (`newark`)**
1. **Cathedral Basilica of the Sacred Heart** (89 Ridge St, by Branch Brook Park). FIRST. Hero budget approved. Luis named it first.
2. **Newark Schools Stadium** (450 Bloomfield Ave). The area origin. Standard budget.
3. **Branch Brook Park** set pieces: one stone park bridge + a park entrance/pavilion. Cherry trees are NOT yours (vegetation).
4. **Newark Penn Station** (1935 Art Deco).
5. **Military Park**: *Wars of America* monument + park pavilion.
6. **Prudential Center** (generic massing, no logos or sponsor signs).

**Passaic waterfront (`passaic`)**
7. **City Ferry dock (FICTIONAL)**: original design, sign reads "City Ferry". No real operator, logo or dock copied. `"fictional": true` in the manifest. The bake already places a placeholder pier here; yours replaces it.
8. **Jackson Street Bridge** (1903 lattice-truss swing bridge, Newark–Harrison; HAER NJ-54 at loc.gov is public domain).
9. **Newark Riverfront Park orange boardwalk** with its tall orange poles (public park).
10. **Clay Street Bridge** (1908 lattice-truss swing bridge).

**Sandy Hook (`sandyhook`)**
11. **Sandy Hook Lighthouse** (1764). Area origin.
12. **Fort Hancock Officers' Row**: ONE house model, the code instances it (NPS-owned historic buildings).
13. **Battery Potter**.
14. **Nine Gun Battery**.
15. **Sandy Hook Ferry Landing** (approved).

**Highlands / Bayshore (`bayshore`)**
16. **Twin Lights** (Navesink Light Station, public historic site). Area origin.
17. **Seastreak Highlands ferry terminal** (approved; generic shapes, no logos).
18. **Bayshore Waterfront Park fishing pier** (Port Monmouth).
Bayshore rule: public waterfront spots only. Nothing on or near residential streets.

**Key West (`keywest`)**
19. **Southernmost Point Buoy** (small budget). Area origin.
20. **Key West Lighthouse & Keeper's Quarters**.
21. **Mallory Square** sunset pier plaza.
22. **Ernest Hemingway Home & Museum** (exterior only; public museum).
23. **Fort Zachary Taylor** (state park fort).

Want to add a landmark? Propose it in a PR comment with a public source link. Build it only after Luis says yes in writing.

## 3. Other jobs (after landmarks, or when Luis asks)
Same rules as §1 (metres, +Y up export, origin at base centre, meshopt + KTX2, kebab-case, manifest + README, one branch per piece). Budgets below are per piece. Kits share one atlas per kit.

| Job | Tris (LOD0 / LOD1 / LOD2) | Textures | Max .glb | Export path |
|---|---|---|---|---|
| Facade / building kit (wall, window bay, door, cornice, roof edge, storefront; snap on a 1 m grid, floor height 3.2 m, wall modules 4 m wide) | ≤ 2k / 600 / impostor per module | one 2048² atlas per kit | 3 MB per kit | `public/kits/<kit>/<kit>.glb` |
| Duval Street / Conch storefront set (3–5 facades) | ≤ 8k / 2k / 400 each | shared 2048² atlas | 3 MB | `public/kits/keywest-conch/` |
| Small props: bench, street lamp, bollard, bin, hydrant, street sign (generic text only) | ≤ 1.5k / 400 / 100 | shared 1024² props atlas | 0.5 MB | `public/props/<slug>/` |
| Boats (small boats, fishing boat) | ≤ 8k / 2k / 400 | 1024² | 1 MB | `public/props/<slug>/` |
| City Ferry vessel (fictional, "City Ferry" livery) | ≤ 20k / 6k / 1.5k | ≤ 2 × 2048² | 2 MB | `public/props/city-ferry/` |
| Cars (generic, no real badges or brand shapes) | ≤ 6k / 1.5k / 300 | 1024² shared atlas | 0.8 MB | `public/props/<slug>/` |

- Props are instanced by code (hundreds on screen), so one material per prop if possible, two max. Lamps: bulb on `emissive-lamp`.
- Source files go in `art/kits/<kit>/` or `art/props/<slug>/`.
- Vegetation (trees, palms, bushes, grass): **not yours** (SpeedTree / code).

## 4. HARD RULES
- **Nothing enters the game until Luis approves.**
- Every piece in its own branch `jonn/<area>-<slug>` (props/kits: `jonn/props-<slug>`, `jonn/kit-<kit>`), with a PR to `main`.
- **Never** merge. **Never** push to `main`. **Never** force-push. **Never** approve your own PR.
- Licence: your own work or CC0 only. No ripped, purchased-store or game-extracted models. No Google data of any kind (Maps, Earth, Street View, 3D Tiles), not even as reference. No copyrighted logos or brand marks. Reference photos only from public domain / clearly licensed sources (Wikimedia Commons, HABS/HAER at loc.gov, NPS), credited in the manifest.
- Privacy: no homes, home addresses, residential streets, or anyone's personal photos. Strip EXIF/GPS from anything you add.

## 5. Hand-back: PR template
Title: `Landmark: <Name> (<area>)` (or `Prop:` / `Kit:`). Body:
```markdown
## What
<Name>, area `<area>`, branch `jonn/<area>-<slug>`.

## Screenshots
- Front, 3/4 view (two sides), back or top
- Wireframe (LOD0) and LOD1/LOD2 side by side
- Night lighting shot with emissive on

## Numbers
| LOD | Triangles | Materials |
|---|---|---|
| LOD0 | | |
| LOD1 | | |
| LOD2 | | |
Textures: <count × resolution, channels, KTX2 mode>
Files: .glb <MB>, .blend <MB>
<paste `npx gltf-transform inspect` output>

## Placement
lat, lon, headingDeg from manifest.json and where they came from.

## Sources and credits
| What | URL | Author | License |

## Licence statement
I confirm this model is my own work (or CC0, listed above). No ripped models, no Google 3D tiles or Google imagery, no copyrighted logos.

@websmith ready for review
```
Then: **Websmith reviews → Luis approves → Websmith merges.** Fix review notes with new commits on the same branch (normal push).

## 6. Do not touch
- `src/` code, `tools/`, `tests/`, `ci/`, `.github/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `playwright.config.ts`, `package.json`, `package-lock.json`, any build config.
- `public/areas/**`, `public/robot/**`, `public/trees/**`.
- Paid add-ons (Hard Ops, Boxcutter, MESHmachine): don't commit them, their presets, or their files. Apply their modifiers before export; the `.blend` you commit must open in plain Blender.
- SpeedTree files of any kind.
- `.env*`, keys, tokens, secrets.
- Home-area masking or private config (`config.private.json`, `ground-mask.bin`, any mask coordinates).
- Robots (ours) and zombies (on hold).
You may edit only: `art/**`, `public/landmarks/**`, `public/kits/**`, `public/props/**`, and your own rows in `HANDOFF.md`. Need something else changed? Ask in your PR.
