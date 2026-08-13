# Desk Detective — setup, deployment, and meeting guide

This guide covers both GitHub repositories:

- `FrontendGame`: React/Vite/shadcn static website
- `BackendGame`: ASP.NET Core API deployed as a web service
- Supabase: PostgreSQL database and private workstation-image storage

## 1. Accounts and values you need

Prepare:

- GitHub access to both repositories
- A Supabase project
- A DigitalOcean account with App Platform access
- A long random host key, preferably at least 32 characters
- Approved workstation photos and the employee name/options for each one

Never put the Supabase database password or service-role key in `FrontendGame`, browser code, screenshots, or GitHub variables that are exposed at build time.

## 2. Configure Supabase

1. Create or open a Supabase project.
2. Click **Connect** and copy the **Session pooler** PostgreSQL URI on port `5432`.
3. Replace the password placeholder with the database password. URL-encode special characters if the password is embedded in a URI.
4. Open **Storage**, create a bucket called `workstations`, and leave it private.
5. Open **Project Settings → API Keys** and copy:
   - Project URL: safe only as an identifier, but used here on the backend.
   - Secret/service-role key: sensitive and backend-only.
6. You do not need to create tables manually. The backend applies its included EF Core migration at startup.

Recommended connection value:

```text
postgresql://postgres.PROJECT_REF:ENCODED_PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres
```

Use the session pooler rather than transaction mode for this persistent EF Core service.

## 3. Deploy the backend to DigitalOcean

Create an App Platform app from `BackendGame`:

| Setting | Value |
| --- | --- |
| Component type | Web Service |
| Build method | Dockerfile |
| HTTP port | `8080` |
| Health check | `/health` |
| Initial instance count | `1` |

Add these encrypted runtime variables:

| Variable | Value |
| --- | --- |
| `ASPNETCORE_ENVIRONMENT` | `Production` |
| `ConnectionStrings__GameDatabase` | Supabase session-pooler URI |
| `Game__HostKey` | Your long random host key |
| `Game__AllowedOrigins` | Temporary frontend origin or update after frontend deploy |
| `Game__SupabaseUrl` | `https://PROJECT_REF.supabase.co` |
| `Game__SupabaseServiceRoleKey` | Supabase server secret/service-role key |
| `Game__SupabaseStorageBucket` | `workstations` |

Deploy and verify:

- `https://YOUR-BACKEND/health` returns success.
- `https://YOUR-BACKEND/` returns API status JSON.

Keep one backend instance for this version. Speed ranks are serialized in that process; one instance is appropriate for a company meeting and keeps ties deterministic.

## 4. Deploy the frontend to DigitalOcean

Create a Static Site component from `FrontendGame`:

| Setting | Value |
| --- | --- |
| Build command | `corepack enable && pnpm install --frozen-lockfile && pnpm run build` |
| Output directory | `dist` |
| Catch-all document | `index.html` |

Add this build-time variable:

```text
VITE_API_URL=https://YOUR-BACKEND.ondigitalocean.app
```

Deploy it. Copy the final frontend origin—only the scheme and hostname, with no trailing path—and set the backend runtime variable:

```text
Game__AllowedOrigins=https://YOUR-FRONTEND.ondigitalocean.app
```

Redeploy the backend after updating CORS. If you later add a custom domain, add it to `Game__AllowedOrigins`; multiple origins can be comma-separated.

## 5. Smoke test before the meeting

1. Open `/host` on the frontend and enter `Game__HostKey`.
2. Create a game.
3. Upload two disposable test workstation images.
4. Add at least two answer choices per round, including the exact correct answer.
5. Open the projector view in a separate browser window.
6. Join from an incognito window using the QR code and a test name.
7. Open a round, answer, reveal, and confirm the score appears.
8. Refresh player and projector pages to confirm deep-link routing works.
9. Finish the game and confirm the final leaderboard.

## 6. Meeting runbook

Before presenting:

- Ask each workstation owner for permission.
- Blur monitors, passwords, badges, customer names, source code, calendars, addresses, and other sensitive details.
- Compress images to a sensible size; 1600–2400 px on the long edge is plenty.
- Keep the host dashboard on your laptop and the projector route on the shared screen.
- Ask employees to use recognizable display names. Duplicate names in the same game are blocked.

During the game:

1. Show the projector lobby and let everyone join.
2. From the host dashboard, open the next round.
3. Wait for the timer or enough answers.
4. Click **Reveal**.
5. Give people a moment to react, then open the next round.
6. After the final reveal, click **Finish game**.

Scoring is 100 / 75 / 50 / 25 points by correct-answer arrival order. Incorrect answers receive zero. Device clocks do not determine rank.

## 7. Secrets and recovery

- Rotate the Supabase service-role key immediately if it is ever exposed.
- Change `Game__HostKey` between events if it has been broadly shared.
- The player token is stored in each browser's local storage; clearing site data makes that player unable to resume that identity.
- The host key is stored only in session storage and disappears when the tab/session closes.
- Supabase is the source of truth for game history. Backups and retention depend on your Supabase plan.

## 8. Common problems

**Players see network or CORS errors:** Confirm `VITE_API_URL` was present during the frontend build and the exact frontend origin is in `Game__AllowedOrigins`.

**Images do not upload:** Confirm the private bucket name and backend `Game__SupabaseUrl` and `Game__SupabaseServiceRoleKey` values. The browser never receives this key.

**Routes show 404 after refresh:** Set the static site's catch-all document to `index.html`.

**Database connection fails:** Use Supabase's session-pooler URI on port `5432`, replace the password placeholder, and URL-encode password characters.

**The projector does not update instantly:** SignalR reconnects automatically and every game screen also polls every few seconds, so it should self-correct shortly.
