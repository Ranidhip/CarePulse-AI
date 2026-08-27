# Shared types

`index.ts` in this folder is a canonical **reference** copy of the enums
shared between `backend/app/models/*.py`, `apps/web/src/types/index.ts`,
and `apps/mobile/src/types.ts`.

## Honest current status

This package is **not actually imported by either app.** There's no root
`package.json` with npm workspaces (or Turborepo/Nx) wiring `apps/web`
and `apps/mobile` to this package, so each app still maintains its own
independent copy of these types by hand.

That gap is exactly what caused a real bug this project hit: `apps/web`'s
`ReasonCode` type (and its label map) silently listed only 5 of the 8
real database enum values in one of its two internal copies, dropping
`SIDE_EFFECTS`, `REPEATED_NONRESPONSE`, and `OTHER` from part of the UI.
It was caught by a live API check, not by the type system — because
there was nothing for the type system to check it against.

## Why this isn't wired up as a real workspace (yet)

Doing that properly means:

1. Adding a root `package.json` with `"workspaces": ["apps/*", "packages/*"]`.
2. Running `npm install` from the repo root instead of separately inside
   each app.
3. Verifying **both** bundlers resolve the workspace package correctly —
   Vite for `apps/web` (usually straightforward) and Metro for
   `apps/mobile` (Metro has historically needed extra config —
   `watchFolders` / `resolver.nodeModulesPaths` in `metro.config.js` —
   for monorepo/symlinked packages, and that needs verifying against a
   real Metro bundler run, not just a typecheck).

This project's existing dependency policy (see
`apps/mobile/src/components/BottomNav.tsx`'s comment) is to never add a
build-tooling change that can't be verified end-to-end in this
environment — there's no device/simulator here to confirm Metro actually
resolves and bundles a workspace package correctly. So this stays a
reference file for now rather than a real shared import, to avoid
risking the mobile bundler on unverified tooling changes.

## Using it today

Until it's wired up: when a backend Pydantic `Literal` changes, update
`index.ts` here first, then diff both apps' own copies against it by
hand. Cheap, manual, but it turns "silently drifted" into "an easy
five-minute check" — better than the alternative this package offered
before (nothing to check against at all).
