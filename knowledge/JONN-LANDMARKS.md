# JONN-LANDMARKS: Blender landmarks guide for Jonn's bot

**Start with [JONN-DIRECTIONS.md](JONN-DIRECTIONS.md)**: it sets your task order and wins over this file. Then read [BUILD-GUIDE.md](BUILD-GUIDE.md) §4 (Blender), §2 (data rules) and §6 (privacy). If anything conflicts, BUILD-GUIDE wins; ask Luis.

## 1. Your role
- **Jonn + Jonn's bot build ALL Blender landmarks.** Websmith does all the Three.js work.
- **You may edit only:** `landmarks/**`, your own rows in `landmarks.json`, and `HANDOFF.md`.
- **Never touch:** `src/`, `tools/`, `public/` code, `package*.json`, Vite/TS/Playwright configs, `.github/` (CI), `.gitignore`, other knowledge files. Need a code change? Write it under "Next" in HANDOFF.md for Websmith.

## 2. Reference rules (every landmark)
Allowed references:
- OpenStreetMap footprints and `height` / `building:levels` (ODbL; credit "© OpenStreetMap contributors").
- Public-domain or free-license images, e.g. Wikimedia Commons. **Record the file URL, author and license** (PD, CC0, CC BY, CC BY-SA) in the landmark README.
- NPS / HABS-HAER drawings and photos (Library of Congress, public domain).
- USGS / NJ public elevation and land data.
- Your own drawings or sketches.

Never: Google (Maps, Earth, 3D Tiles, Street View), personal photos, or anything without a known license. Strip EXIF/GPS from any image you keep.

## 3. Landmark list (build order)

> **Luis, 2026-10-31: list, Bayshore spots and the cathedral hero budget are APPROVED. Build #2 Cathedral Basilica of the Sacred Heart FIRST (hardest), then follow the list in order (1, 3, 4, ...).**
Every entry: **SUGGESTION - Luis to confirm.** Names were checked against public sources on 2026-10-31. Model the **exterior only**.

| # | Landmark | Area | Why it matters | Reference sources | Status |
|---|---|---|---|---|---|
| 1 | **Newark Schools Stadium** (450 Bloomfield Ave, Roseville section, Newark; current stadium opened 2011 on the site of the 1925 "City Field") | Newark | Luis's stadium pick; simple shape, good first build | OSM footprint; Wikimedia Commons; Wikipedia article for history | SUGGESTION - Luis to confirm |
| 2 | **Cathedral Basilica of the Sacred Heart** (Newark) | Newark | French Gothic skyline icon by Branch Brook Park; hero model | Wikimedia Commons; HABS/LoC if available; OSM | SUGGESTION - Luis to confirm (hero, 100k tris needs Luis's OK) |
| 3 | **Newark Penn Station** (1935 Art Deco) | Newark | Transit gateway, great night lighting | Wikimedia Commons; HABS/HAER (LoC); OSM | SUGGESTION - Luis to confirm |
| 4 | **Prudential Center** (arena) | Newark | Big lit downtown mass, night energy | OSM; Wikimedia Commons (check license; modern building, keep it generic, no logos) | SUGGESTION - Luis to confirm |
| 5 | **Military Park** (Wars of America sculpture, carousel) | Newark | Downtown green; night plaza | OSM; Wikimedia Commons; NPS/LoC for the Borglum sculpture | SUGGESTION - Luis to confirm |
| 6 | **Branch Brook Park** cherry blossom groves (props: blossom tree variants, a bridge) | Newark | Largest US cherry blossom collection; seasonal set piece | Essex County Parks public info; Wikimedia Commons; OSM | SUGGESTION - Luis to confirm |
| 7 | **Sandy Hook Lighthouse** (1764, oldest operating US lighthouse) | Sandy Hook | Hero beacon for night scenes | NPS (Gateway NRA); HABS/LoC; Wikimedia Commons | SUGGESTION - Luis to confirm |
| 8 | **Fort Hancock, Officers' Row** (18 yellow-brick Colonial Revival houses facing Sandy Hook Bay) | Sandy Hook | Historic row; one house modeled, instanced 18× | NPS "An Old Army Town" bulletin; HABS/LoC; OSM | SUGGESTION - Luis to confirm |
| 9 | **Battery Potter** (1890-94, first US disappearing-gun battery) | Sandy Hook | Concrete ruin, moody at night | NPS Battery Potter page; HAER/LoC; OSM | SUGGESTION - Luis to confirm |
| 10 | **Nine Gun Battery** (1897-1904; Batteries Alexander, Halleck, Bloomfield, Richardson) | Sandy Hook | Long concrete battery | NPS Nine Gun Battery page; HAER/LoC; OSM | SUGGESTION - Luis to confirm |
| 11 | **Fort Hancock and Sandy Hook Proving Ground** (NHL; proving-ground set dressing: a gun platform or proof battery) | Sandy Hook | Ties the peninsula together | NPS NHL page; HAER/LoC | SUGGESTION - Luis to confirm |
| 12 | **Bayshore Waterfront Park** pier (300 ft fishing pier, Port Monmouth) | Bayshore (general area) | Public waterfront with NYC skyline view | Monmouth County Parks brochure; OSM; Wikimedia Commons | SUGGESTION - Luis to confirm |
| 13 | **Seastreak Highlands ferry terminal** (326 Shore Drive, Highlands; source seastreak.com) | Bayshore (general area) | Real ferry link to Manhattan and Sandy Hook; boats, harbor lights | OSM; Wikimedia Commons; generic shapes (no logos) | APPROVED (Luis 2026-10-31) |
| 13b | **Sandy Hook Ferry Landing** (Hartshorne Drive, Sandy Hook; seasonal Seastreak beach stop) | Sandy Hook | Small real dock that pairs with #13 | OSM; NPS public info; Wikimedia Commons | APPROVED (Luis 2026-10-31) |
| 14 | **Pier Village** boardwalk (Long Branch) | Long Branch | Victorian-style oceanfront boardwalk; boardwalk + facades only | OSM; Wikimedia Commons; City of Long Branch public info | SUGGESTION - Luis to confirm |
| 15 | **Southernmost Point Buoy** (concrete buoy, Whitehead & South St) | Key West | Iconic, tiny, fast build | Wikimedia Commons; OSM | SUGGESTION - Luis to confirm |
| 16 | **Key West Lighthouse & Keeper's Quarters** | Key West | Beacon; night silhouette | HABS/LoC; Wikimedia Commons; OSM | SUGGESTION - Luis to confirm |
| 17 | **Mallory Square** (sunset pier plaza) | Key West | Crowd/shadow-people stage | OSM; Wikimedia Commons | SUGGESTION - Luis to confirm |
| 18 | **Duval Street storefront archetypes** (3-5 reusable Conch-style facades) | Key West | Kit to fill streets | Wikimedia Commons; HABS Key West surveys; own drawings | SUGGESTION - Luis to confirm |
| 19 | **Ernest Hemingway Home & Museum** (exterior only) | Key West | Famous NHL house | HABS/LoC; Wikimedia Commons; OSM | SUGGESTION - Luis to confirm |
| 20 | **FICTIONAL Newark Ferry Dock** (original design, NOT based on any real dock) | Newark, Passaic River waterfront by Riverfront Park (fictional placement) | Endpoint of the made-up Newark to Sandy Hook ferry route | Original design only; OSM for the shoreline position | APPROVED as FICTION (Luis 2026-10-31) |
| 21 | _Open slot: Jonn's pick_ | | | | open |
| 22 | _Open slot: Jonn's pick_ | | | | open |
| 23 | _Open slot: Jonn's pick_ | | | | open |

> **Fiction note:** the Newark to Sandy Hook ferry route and the Newark Ferry Dock (#20) are made up for City. No such route exists in real life (Seastreak runs only from Highlands and Atlantic Highlands; source: https://seastreak.com/ferry-routes-and-schedules/). Label it as fiction in-world (e.g. a "City Ferry" sign, no Seastreak branding).

Rules for the list: **public places only**. No homes, residential streets, or private places. Officers' Row is NPS-owned historic housing, not private homes. Bayshore stays at public waterfront spots only. Jonn's picks need Luis's OK before you build.

## 4. Specs (same as BUILD-GUIDE §4)
- glTF 2.0 `.glb`, **meters** (1 unit = 1 m), **+Y up** on export, **origin at the footprint center, at ground level**.
- Compression: Draco or meshopt geometry, KTX2 textures:
```bash
npx gltf-transform optimize in.glb landmarks/<area>/<slug>/<slug>.glb --compress meshopt --texture-compress ktx2
npx gltf-transform inspect landmarks/<area>/<slug>/<slug>.glb   # check tris, textures, size
```
- Budget: **≤ 50k triangles** (hero ≤ 100k only with Luis's OK), **≤ 2 textures at 2048²**, **≤ 3 MB** .glb.
- Night-friendly materials: PBR (metal/rough). **Emissive windows/lights are a separate material** named `emissive-windows` (also `emissive-lamp` etc.) so Three.js can drive them. Avoid baked daylight or shadows in textures. Keep facades dark and slightly glossy (they read as wet).
- Naming: area and slug in kebab-case, e.g. `landmarks/newark/newark-schools-stadium/newark-schools-stadium.glb`. Objects/materials in English kebab-case. No usernames or local paths inside the file.
- Each landmark folder has a `README.md`:
```markdown
# <Name>
Area: <area> | Tris: <n> | Textures: <n × size> | Size: <MB>
## Sources
| What | URL | Author | License |
## Notes
Exterior only. Built by Jonn's bot, <date>.
```
- Also add each source to `knowledge/DATA-SOURCES.md` (ask Websmith if you can't edit it; it's outside your folders).

## 5. Placement (`landmarks.json`)
Add one row per landmark (public places only; private places never go here):
```json
{ "id": "newark-schools-stadium", "file": "landmarks/newark/newark-schools-stadium/newark-schools-stadium.glb",
  "area": "newark", "lat": 0.0, "lon": 0.0, "headingDeg": 0, "elevationM": 0 }
```
Take lat/lon from the OSM feature center (or Wikipedia/Wikidata for the landmark itself), heading = clockwise from true north for the model's front (-Z in Blender's export = front), elevation = ground meters above sea level from the DEM (Websmith can fill this).

## 6. Handoff
1. `git switch main && git pull && git switch -c bot/jonn-<slug>`
2. Claim a row in HANDOFF.md (task, branch, owner = Jonn's bot, date) in your first commit.
3. Build, export, run `gltf-transform inspect`, write the landmark README.
4. **Keep the `.blend` out of the repo**: commit the `.glb` only. Keep the `.blend` on Jonn's machine (backed up there). No LFS.
5. Open a PR to `main` with 3 screenshots: **front**, **3/4 view**, **night** (the Three.js viewer or Blender at night lighting). Update HANDOFF.md (version, what changed, next).
6. **Luis approves the merge** (squash). No force pushes, no pushes to main.
