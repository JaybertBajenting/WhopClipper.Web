# ClipForge Local — frontend

React 19 interface for the locally hosted Whop clipping assistant. It turns a campaign brief into reviewed requirements, platform profiles, source downloads, AI-selected highlights, typed edit plans, FFmpeg jobs, validation results, and a manual publishing package.

The frontend never runs `yt-dlp`, FFmpeg, Claude CLI, or Codex CLI itself. It sends typed requests to the loopback ASP.NET API, which owns subprocess and filesystem access.

## Product routes

| Route | Purpose |
|---|---|
| `/` | Dashboard and recent work |
| `/campaigns` | Search, create, duplicate, and archive campaigns |
| `/campaigns/:campaignId` | Requirements, profiles, sources, AI analysis, edit plan, and export workflow |
| `/library` | Approved local music and sound-effect manifest |
| `/jobs` | Polling progress, failure details, cancellation, and retry |
| `/settings` | Workspace paths, executable paths, AI defaults, and dependency checks |

Campaign joining, social publishing, and Whop submission remain manual.

## Stack

- React 19, TypeScript, and Vite
- TanStack Router and TanStack Query
- React Hook Form with Zod
- Axios and Zustand
- Tailwind CSS with locally owned shadcn/ui-style Radix components
- Vitest and Testing Library

Dependency versions are pinned to the supplied frontend dependency workbook.

## Local development

Requirements: Node.js, pnpm, and the local ASP.NET API.

```powershell
Copy-Item .env.example .env.local
pnpm install
pnpm dev
```

The development server listens on `http://localhost:5173`. The default API endpoint is `http://localhost:5080/api` and can be changed in `.env.local`:

```text
VITE_API_BASE_URL=http://localhost:5080/api
```

## ASP.NET desktop build

The packaged Windows app serves the compiled SPA and API from the same ASP.NET origin. Build with a relative API URL before copying `dist` into the backend `wwwroot`:

```powershell
$env:VITE_API_BASE_URL="/api"
pnpm build
```

TanStack Router uses history routing, so the ASP.NET host must fall back non-API requests to `index.html`. The backend project provides this fallback.

## Verification

```powershell
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

`pnpm test -- --coverage` generates the optional coverage report.

## Runtime behavior

- API loading, empty, and error states are explicit.
- Jobs poll while work is active and can be cancelled or retried.
- Source inspection is asynchronous and persists the source when queued.
- AI analysis uses downloaded captions when available and offers a manual transcript/SRT fallback.
- Claude/Codex output is schema-mapped into editable highlight and edit-plan controls; the latest run is restored after refresh.
- Render requests use approved typed plans; raw shell commands are never accepted from the browser.
- Technical validation is queued after a completed render. Publishing copy and compliance checks stay visible for manual review.
- The API base URL can be absolute during development or relative inside the desktop WebView.
