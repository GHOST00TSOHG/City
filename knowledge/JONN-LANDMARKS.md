# JONN-LANDMARKS: Blender landmarks guide for Jonn's bot

**Start with [JONN-DIRECTIONS.md](JONN-DIRECTIONS.md)**: it sets your task order and wins over this file. Then read [BUILD-GUIDE.md](BUILD-GUIDE.md) §4 (Blender), §2 (data rules) and §6 (privacy). If anything conflicts, BUILD-GUIDE wins; ask Luis.

> **Source of truth: [JONN-DIRECTIONS.md](JONN-DIRECTIONS.md).** It sets Jonn's tasks, specs, export formats, file paths and handoff. This file only keeps the reference rules and landmark list; if anything differs, follow JONN-DIRECTIONS.md.

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

## 4. Specs, placement, handoff
See [JONN-DIRECTIONS.md](JONN-DIRECTIONS.md).
