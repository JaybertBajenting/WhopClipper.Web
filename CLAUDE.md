# CLAUDE.md — WhopClipper.Web

Front end for WhopClipper, a local Windows app that turns long videos into platform-ready vertical clips.
React 19 + TypeScript + Vite 7 + Tailwind 4 with shadcn-style components. It talks to the ASP.NET Core
API (`WhopClipper.Api`) and, in the desktop build, is served from that API's `wwwroot`.

## Commands

Use pnpm (Node version pinned in the parent workspace's `.nvmrc`).

```powershell
pnpm install --frozen-lockfile
pnpm dev          # http://localhost:5173, API expected at http://localhost:5080/api
pnpm typecheck    # tsc -b
pnpm lint         # eslint
pnpm test         # vitest run (jsdom + Testing Library)
pnpm build        # tsc -b && vite build
```

Before calling a change done: `pnpm typecheck`, `pnpm lint` and the tests for the area you touched
(`pnpm test src/components/campaign` runs one folder).

## Layout

```
src/
  router.tsx, App.tsx       routes and the app shell
  pages/                    one file per route (campaigns, campaign workspace, publishing, jobs, settings, ...)
  components/campaign/      the campaign workspace: sources, edit style, review & export of rendered clips
  components/publishing/    YouTube schedule and platform publishing
  components/ui/            small shadcn-style primitives (button, card, dialog, select, ...)
  lib/api.ts                the only place that talks HTTP: axios instance + typed `api.*` calls
  lib/types.ts              view-model types; api.ts maps raw API records into these
  lib/*.ts                  pure helpers, each with a sibling *.test.ts
  lib/store.ts              zustand for UI-only state
```

## Conventions

- Server state goes through TanStack Query (`useQuery` / `useMutation`, then `invalidateQueries`).
  Never keep server data in zustand or component state beyond a form draft.
- All HTTP goes through `lib/api.ts`. Add a typed function there and map the raw response
  (`mapMediaAsset`, ...) rather than calling axios from a component.
- The API base URL comes from `VITE_API_BASE_URL`, defaulting to `http://localhost:5080/api`.
- Forms use react-hook-form + zod; toasts use sonner; icons come from lucide-react.
- Colours come from CSS variables (`var(--fg-strong)`, `var(--border-default)`, ...) so light and dark
  themes both work. Do not hard-code colours.
- Per-user view preferences (a filter, a collapsed panel) may live in `localStorage`, keyed by campaign,
  and must fall back cleanly when storage is unavailable.
- Tests sit next to the code (`youtube-filter.test.tsx`, `publishing.test.ts`). Test behaviour a user
  sees (text, roles), not implementation details; mock `@/lib/api` rather than the network.
- Comments explain why a component behaves as it does, not what JSX it renders.

## Gotchas

- Range inputs store fractions (`0.6`) but display percent; keep `min`/`max` in line with what the API
  validates for the same field.
- Clip media is served by the API (`/media-library/assets/{id}/file`, rendered clip routes); use the
  helpers in `api.ts` to build those URLs so the desktop build and the dev server both work.
- The desktop build serves this app from the API, so a broken production build breaks the desktop app:
  run `pnpm build` after dependency or config changes.

## Never

- Commit `.env*` files with real values, tokens, or anything copied from a user's campaign brief.
  This repository is public.
- Add a dependency for something a few lines of code or an existing package already does.
