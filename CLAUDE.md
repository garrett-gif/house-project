# House Project

Personal design app for a 1,000+ acre private estate plus a forestry and wildland fire compound. React, Vite, TypeScript, Three.js. Spec: https://claude.ai/artifact/GwgQKAxxUeUKHBpy1vnjp7

```bash
npm install
npm run dev     # Vite on http://127.0.0.1:5173 plus the local chat server on 127.0.0.1:8787
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
- `src/model/derive.ts`: geometry computed from other model data. The main house building's outline comes from its rooms and `house.origin`; never edit it by hand.
- `src/model/edits.ts`: named edit operations (`moveBuilding`, `resizeRoom`, `addRoom`, ...). Pure functions that return a new estate. All chat and future manual edits go through these.
- `src/model/editTools.ts`: the tool definitions Claude sees (in feet) and the converter to edit operations (in inches).
- `src/model/history.ts`: revisions, undo and redo, save and open.
- `src/views`: SVG site and house plans, Three.js scenes.
- `src/ui`, `src/App.tsx`: chat panel, proposal preview, checks, history.
- `server/`: local Express server. Calls Claude (`claude-opus-5-5`), dry-runs the proposed edits, returns them. It never saves anything.

## Other notes

- The main house is placeholder massing, not a finished floor plan.
- API keys stay on the server. The Anthropic key lives in `server/.env` (git-ignored; see `server/.env.example`). Nothing under `src/` may import `@anthropic-ai/sdk`, read a key, or import from `server/`; `src/keyIsolation.test.ts` and `scripts/check-bundle.mjs` enforce this. Vite is configured to refuse serving `server/` and `.env` files.
- Chat edits are proposals: the browser previews them, shows check changes, and commits only when the owner clicks Apply. Edits that make checks fail can still be applied, flagged in red.
- Everything is local only for now. The chat server binds to 127.0.0.1 and rejects requests from other origins.
