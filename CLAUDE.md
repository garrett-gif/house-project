# House Project

Personal design app for a 1,000+ acre private estate plus a forestry and wildland fire compound. React, Vite, TypeScript, Three.js. Spec: https://claude.ai/artifact/GwgQKAxxUeUKHBpy1vnjp7

```bash
npm install
npm run dev     # Vite on http://localhost:5173
npm test        # Vitest
npm run build   # tsc --noEmit, then vite build
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
- `src/views`: SVG site and house plans, Three.js scenes.

## Other notes

- The main house is placeholder massing, not a finished floor plan.
- API keys (for example the Anthropic key) stay on the server. Never import a key into browser code or expose it through a `VITE_` variable.
