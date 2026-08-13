# Desk Detective

Responsive React 19, Vite, TypeScript, Tailwind CSS, and shadcn/ui frontend for the workstation guessing game. It supports laptops and phones and includes three experiences:

- Player: join with room code and display name, submit one guess, see reveals and scores.
- Host: create a game, upload workstation images, configure choices, control rounds, and finish the game.
- Projector: show the QR code, workstation, timer, reveal, and leaderboard on the meeting screen.

The backend lives in the separate `BackendGame` repository. Supabase secrets are intentionally not used in this frontend.

## Local development

Requirements: Node.js 22 or newer and a running backend.

```powershell
Copy-Item .env.example .env.local
corepack enable
pnpm install
pnpm run dev
```

Set the backend URL in `.env.local`:

```text
VITE_API_URL=http://localhost:5087
```

Then open `http://localhost:5173`.

## Commands

```powershell
pnpm run dev
pnpm run typecheck
pnpm run lint
pnpm run build
pnpm run preview
```

## shadcn/ui

The repository includes `components.json` and local shadcn-style components under `src/components/ui`. Add another component with the shadcn CLI when needed:

```powershell
pnpm dlx shadcn@latest add dialog
```

Generated components remain in the repository and can be customized like normal React source code.

## DigitalOcean App Platform

1. Deploy the backend first and copy its public HTTPS URL.
2. Create another App Platform component from this repository and choose **Static Site**.
3. Build command: `corepack enable && pnpm install --frozen-lockfile && pnpm run build`
4. Output directory: `dist`
5. Add build-time variable `VITE_API_URL=https://YOUR-BACKEND.ondigitalocean.app`.
6. Set the static site's catch-all document to `index.html` so `/play`, `/present`, and `/host` routes work when refreshed.
7. Deploy, then add the frontend's final HTTPS URL to the backend variable `Game__AllowedOrigins` and redeploy the backend.

The frontend needs no Supabase URL, anon key, database password, or service-role key. All database and Storage work happens behind the ASP.NET API.

See [SETUP_AND_DEPLOYMENT.md](SETUP_AND_DEPLOYMENT.md) for the complete first-time checklist and meeting runbook.
