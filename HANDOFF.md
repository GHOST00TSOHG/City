# HANDOFF

Follow [knowledge/BUILD-GUIDE.md](knowledge/BUILD-GUIDE.md). Update this file in **every** PR. Claim a task in the table **before** starting. Landmarks (Jonn's bot): [knowledge/JONN-LANDMARKS.md](knowledge/JONN-LANDMARKS.md).

## Version
**v00: no code yet** (repo skeleton and knowledge pack only)

## What changed
- Skeleton: README, HANDOFF, LICENSE (MIT), .gitignore, knowledge/ pack.

## Who's on what
| Task | Branch | Owner | Status | Claimed |
|---|---|---|---|---|
| v01 streets: Vite + three scaffold, terrain tile, OSM buildings/roads | bot/websmith-v01-streets | (unclaimed) | open | |
| CI: build + Playwright smoke + gitleaks | bot/websmith-ci | (unclaimed) | open | |
| Landmark #1 Newark Schools Stadium (pending Luis) | bot/jonn-newark-schools-stadium | (unclaimed, Jonn) | open | |
| knowledge/DATA-SOURCES.md first entries | (any) | (unclaimed) | open | |

## How to run
No code yet. Once scaffolded: `npm ci && npm run dev`; `npm run build`; `npm run test:smoke`.

## Next
1. Scaffold Vite + three, gitleaks pre-commit, CI.
2. First area: terrain + OSM buildings (BUILD-GUIDE §3).

## Known bugs
None (no code).

## Usage notes
Setup on Grok Bot pool (~0% Claude). Estimate: each city section ~4-8% of a Claude-week; reviewing a PR ~1%.
