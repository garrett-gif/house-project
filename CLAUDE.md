# House Project

Personal design app for a 1,000+ acre private estate plus a forestry and wildland fire compound. React, Vite, TypeScript, Three.js. Spec: https://claude.ai/artifact/GwgQKAxxUeUKHBpy1vnjp7

```bash
npm install
npm run dev     # Vite on http://127.0.0.1:5173 plus the local chat server on 127.0.0.1:8787
npm run stop    # stop anything left on ports 8787 or 5173, e.g. after a crashed dev run
npm test        # Vitest (model, history, server loop with a fake Claude, key isolation)
npm run build   # type-check src and server, vite build, then scan dist/ for credentials
```

## Rules

1. **Never deploy.** No Vercel, Railway, Supabase, or any other deploy, publish, or hosted-environment change unless Garrett explicitly says to in that conversation. A previous approval does not carry over.
2. **Work on a branch.** Never commit to `main` or push to `main` unless Garrett says so. Create or use a feature branch for every change.
3. **Geometry lives only in the shared model.** `src/model` is the single source of truth, and every stored length is in inches. `src/views` only draws that model: views must not hold their own copy of positions, sizes, or extents, and must not change the model. Derive anything a view needs from the model, and add it to `src/model` if it is missing.
4. **Passing checks is not code compliance.** `src/model/validate.ts` holds planning checks. In UI text, commit messages, docs, and replies, describe results as "passed this app's checks" or similar. Never say or imply a design is code compliant, permit ready, or safe to build from.

## Layout

- `src/model/types.ts`: model types. Site coordinates are x east, y north, origin at the southwest parcel corner.
- `src/model/geometry.ts`: `ft()` and `toFt()` convert feet and inches; rectangle helpers.
- `src/model/sampleEstate.ts`: the approved sample layout. `src/model/house.ts`: placeholder main house massing, with room coordinates local to `house.origin`.
- `src/model/validate.ts`: planning checks, returning `pass`, `warn`, or `fail`.
- `src/model/derive.ts`: geometry computed from other model data. The main house building's outline comes from its rooms and `house.origin`; never edit it by hand. `parts` are above-grade masses (drawn and extruded); `footprint` adds rooms on levels below elevation 0 and is what collisions use.
- Checks list the ids they are about in `elements` when they do not pass; the plans outline failures in red and warnings in amber.
- `src/model/walls.ts`: walls are derived from room rectangles (room edges are wall centerlines), never stored. Exterior, interior, and foundation thicknesses live in `house.wallThickness`. Below-grade levels list their `exposed` sides (the walkout is exposed to the south).
- Openings (`house.openings`) are stored on a host room's side with an `offset` from that side's west or south end to the center. What they lead to is derived. `applyOperations` rejects edits that leave a previously fitting door or window off its wall.
- `src/model/firstPass.ts`: the rule-based first pass of doors, windows, and stairs. A placeholder to edit, not a design. Saved projects without openings get it on load.
- `src/model/wallChecks.ts`: openings fit, reachability, circulation, exit door, door sizes, hall widths, escape windows, stairs, and wall stacking. Values come from the 2006 IRC as planning values only; the detail text says so.
- `src/model/edits.ts`: named edit operations (`moveBuilding`, `resizeBuilding`, `moveRoom`, `resizeRoom`, `addRoom`, `removeRoom`, `renameRoom`, `setRoomType`). `applyOperations(estate, ops)` is pure, all or nothing, and rejects unknown ids, invalid sizes, and any new overlap between rooms on a level or buildings on the site. All chat and future manual edits go through it.
- `src/model/editTools.ts`: the tool definitions Claude sees (in feet) and the converter to edit operations (in inches).
- `src/model/history.ts`: revisions, undo and redo, saved-project format.
- `src/storage/projectStore.ts`: `ProjectStore` interface for the project and the chat transcript; the browser (localStorage) implementation is used today. Replace it with a Supabase store later without touching callers.
- `src/drawings`: draft drawing sheets derived from the model as simple marks in sheet points: G-001 cover and index, A-101+ floor plans at 1/8" = 1'-0" on ARCH D, A-601 door and window schedules. Marks (D01, W01) come from `marks.ts`. The same marks render to SVG in the Drawings view and to PDF on the server (`server/pdf.ts`, POST /api/sheets.pdf). Every sheet carries the draft, not-for-construction stamp.
- `src/views`: SVG site and house plans, Three.js scenes.
- `src/ui`, `src/App.tsx`: chat panel, proposal preview, checks, history.
- `server/`: local Express server. Calls Claude (model from `HOUSE_MODEL`, default `claude-sonnet-5-5`), dry-runs the proposed edits, returns them. It never saves anything.

## Other notes

- The main house is the first real layout (v1) from the brief, still a concept. Its bearing lines are listed at the top of `src/model/house.ts`; keep new walls on them where possible so floors stack.
- `house.program` holds the brief as checkable requirements (`src/model/programChecks.ts`): rooms, levels, minimum areas and widths, and rooms that must share a wall. Update it when Garrett changes the brief.
- API keys stay on the server. The Anthropic key lives in `server/.env` (git-ignored; see `server/.env.example`). Nothing under `src/` may import `@anthropic-ai/sdk`, read a key, or import from `server/`; `src/keyIsolation.test.ts` and `scripts/check-bundle.mjs` enforce this. Vite is configured to refuse serving `server/` and `.env` files.
- Chat edits are proposals: the browser previews them, shows check changes, and commits only when the owner clicks Apply. Edits that make checks fail can still be applied, flagged in red. Overlaps are the exception: they are rejected before they become a proposal, and Claude must fix or explain them.
- Everything is local only for now. The chat server binds to 127.0.0.1 and rejects requests from other origins.
