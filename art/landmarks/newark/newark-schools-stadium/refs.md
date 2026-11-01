# References

Links only. No third-party images are stored in this folder. The mesh is original work measured from these sources. No Google imagery.

## Footprint and placement

- OpenStreetMap way 446152545, Newark Schools Stadium (`leisure=stadium`, Wikidata Q7016750). © OpenStreetMap contributors, ODbL. https://www.openstreetmap.org/way/446152545
- Football pitch, way 446152542. https://www.openstreetmap.org/way/446152542
- Running track, way 446152543. https://www.openstreetmap.org/way/446152543
- Bleachers, ways 446154724 (home, west) and 446154727 (away, east). https://www.openstreetmap.org/way/446154724 and https://www.openstreetmap.org/way/446154727
- Ticket building at 450 Bloomfield Avenue, way 1356756530 (`shop=ticket`). https://www.openstreetmap.org/way/1356756530
- Support building south of the bowl, way 446154726. https://www.openstreetmap.org/way/446154726
- Baseball pitches, ways 446200042 and 446200043. https://www.openstreetmap.org/way/446200042 and https://www.openstreetmap.org/way/446200043

The model origin is the area centroid of way 446152545. `headingDeg` 344.7 is the outward compass bearing of the edge between vertices 1 and 2 of that way, the Bloomfield Avenue side, rounded to 0.1°. The mesh is built so that edge's outward normal is Blender +Y.

## Published description

Used for what the 2011 stadium is, not as traced drawings. No photographs from these pages are in the repo.

- Wikipedia, Newark Schools Stadium. Two metal bleacher sections, capacity 5,600, opened 2011 on the site of the 1925 stadium. https://en.wikipedia.org/wiki/Newark_Schools_Stadium
- EI Associates, project page. Arched columns carried from the old stadium, clock tower and ticket booth, synthetic field, 5,600 seats. https://www.eiassoc.com/project/newark-schools-stadium/
- Epic Management, project page. Arch-wall entrance, 400 metre track, home and away bleachers, clock tower and ticket office, elevator tower to the home bleachers. The community building is listed as 5,000 sf and two storeys; it is not a separate OSM footprint, so it is not given its own mass. https://www.epicbuilds.com/portfolio/newark-public-schools-stadium/
- The Star-Ledger / NJ.com, 2 July 2009, "Construction of new super site finally underway at iconic Newark Schools Stadium". 30-foot arches along Bloomfield Avenue, clock tower with the ticket office, aluminium bleachers. https://www.nj.com/sports/njsports/2009/07/construction_of_new_super_site.html

## Enclosure (Luis, 1 Nov 2026)

The review asked for a closed stadium. The seat ring runs all the way around the track, including both end zones, so the corners are stands rather than gaps. The outer facade follows OSM way 446152545, with gate openings, and the Bloomfield edge is the arch wall. The ticket-office tower is moved onto that wall so it is the main entrance, not a detached block. A fence sits just outside the wall. The ground pad, front plaza, bowl concourse, and a parking edge are the apron. Seat rows and risers are separate texture regions. Railings are a rail above the top deck, not a second slab on it. The scoreboard is at the end opposite Bloomfield Avenue. Four light banks stand at the corners of the bowl.

## Dimensions that are estimates

Called out so they are not read as a survey.

- Arch crowns are the published 30 ft (9.14 m). The opening is a semicircle on a 0.55 m plinth. A separate pier height was not published.
- Clock tower shaft is 15.2 m, plus a 1.7 m pyramid, on the OSM ticket footprint. No height is tagged. It is set so the tower clears the arches.
- Floodlight masts are 24 m. OSM has no mast height. 24 m is a typical high-school sports pole.
- Stand row rise is 0.34 m. The tread count fills the OSM bleacher depth, capped at 16 rows on LOD0.
- The support building is one 6.4 m storey on way 446154726 (about 405 m²). That footprint is larger than half of the published 5,000 sf community building, so it is modelled as the locker and amenities block.

The running track is the World Athletics 400 m shape (84.39 m straights, 36.50 m radius to the running line, eight 1.22 m lanes), aligned to the football pitch. The OSM track ring is a rough oval; the built oval is the standard, not a trace of that ring.

Field paint is a regulation 120 yard by 160 foot grid inset in the OSM pitch. Yard numbers are an original block pattern. No school name, no logo, no sponsor mark.

No Wikimedia photograph of the 2011 stadium was found. Nothing was traced from a picture.
