# House Project

A personal design tool for a 1,000-acre work-and-live estate: a private home and a forestry and wildland fire compound, planned from one shared model.

Slice 1 holds the sample parcel, approved site layout version 1, a placeholder main house, 2D plans, basic 3D, and automatic checks. AI generation and chat editing come in later slices.

```bash
npm install
npm run dev
npm test
```

- `src/model` is the shared building and site model. All stored measurements are inches.
- `src/views` draws that model. Views never hold their own copy of the geometry.

Output is for planning only. Checks passing does not mean a design meets code, and nothing here is a construction document.
