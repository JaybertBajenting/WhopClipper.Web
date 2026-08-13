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

## 4. Deploy the frontend to Vercel

1. Sign in to Vercel and click **Add New > Project**.
2. Import the GitHub repository `JaybertBajenting/FrontendGame`.
3. Configure the project with these values (Vercel will usually detect them automatically):

| Setting | Value |
| --- | --- |
| Framework preset | `Vite` |
| Root directory | `./` |
| Install command | `pnpm install --frozen-lockfile` |
| Build command | `pnpm run build` |
| Output directory | `dist` |

4. Before clicking **Deploy**, add this environment variable for **Production**, **Preview**, and **Development**:

```text
VITE_API_URL=https://YOUR-BACKEND.ondigitalocean.app
```

Use the public HTTPS address of the DigitalOcean backend. Do not add `/api`, `/health`, or a trailing slash.

5. Click **Deploy**. The included `vercel.json` sends frontend routes such as `/host`, `/play`, and `/projector` to `index.html`, so direct links and browser refreshes work.
6. Copy the final Vercel origin—only the scheme and hostname, with no trailing path—and set this encrypted runtime variable on the DigitalOcean backend:

```text
Game__AllowedOrigins=https://YOUR-PROJECT.vercel.app
```

7. Redeploy the backend after updating CORS. The frontend cannot call the API until its exact Vercel origin is allowed.

Vercel automatically deploys new pushes to the production branch and creates preview deployments for other branches. Preview URLs use different origins; add a specific preview origin to `Game__AllowedOrigins` when you need that preview to call the backend. Multiple origins can be comma-separated. If you later add a custom domain, add that exact HTTPS origin too.

## 5. Smoke test before the meeting

1. Open `/host` on the frontend and enter `Game__HostKey`.
2. Create a game.
3. Upload two disposable test workstation images.
4. Add at least two answer choices per round, including the exact correct answer.
5. Open the projector view in a separate browser window.
6. Join from an incognito window using the QR code and a test name.
7. Click **Start Game**, answer the first round, and confirm it automatically reveals and advances.
8. Refresh player and projector pages to confirm deep-link routing works.
9. Let the final round complete and confirm the final leaderboard appears automatically.

## 6. Meeting runbook

Before presenting:

- Ask each workstation owner for permission.
- Blur monitors, passwords, badges, customer names, source code, calendars, addresses, and other sensitive details.
- Compress images to a sensible size; 1600–2400 px on the long edge is plenty.
- Keep the host dashboard on your laptop and the projector route on the shared screen.
- Ask employees to use recognizable display names. Duplicate names in the same game are blocked.

During the game:

1. Show the projector lobby and let everyone join.
2. From the host dashboard, click **Start Game** once.
3. The server closes each answer window at its configured time.
4. The owner is revealed for 8 seconds.
5. The next round starts automatically.
6. After the final reveal, the final leaderboard appears automatically.

The host dashboard remains available for contingencies: **Pause**, **Resume**, **Reveal now / Next round now**, and **End game**. Pausing freezes the exact remaining time.

Scoring is 100 / 75 / 50 / 25 points by correct-answer arrival order. Incorrect answers receive zero. Device clocks do not determine rank.

### Automatic lifecycle reference

| What participants see | Duration | What happens next |
| --- | ---: | --- |
| Lobby and QR code | Until the host starts | Round one opens |
| Mystery workstation and choices | Per-round value, default 30 seconds | Answers close and the owner is revealed |
| Owner, fun fact, points, and leaderboard | 8 seconds | The next configured round opens |
| Final leaderboard | Until the meeting moves on | Game remains finished |

The timing authority is the backend. Closing or refreshing the host, player, or projector tab does not stop the game. SignalR sends immediate updates and short polling provides a fallback.

### Contingency controls

- **Pause** freezes the current answer or reveal countdown and prevents new answers.
- **Resume** restores the exact remaining time.
- **Reveal now** closes the current answer window immediately and starts its reveal.
- **Next round now** shortens the current reveal and opens the next round.
- **End game** stops the sequence and displays the final leaderboard.

Rounds can only be added or deleted while the game is still in the lobby. Create a new game if you need to rerun the activity with a different round order.

## 7. Secrets and recovery

- Rotate the Supabase service-role key immediately if it is ever exposed.
- Change `Game__HostKey` between events if it has been broadly shared.
- The player token is stored in each browser's local storage; clearing site data makes that player unable to resume that identity.
- The host key is stored only in session storage and disappears when the tab/session closes.
- Supabase is the source of truth for game history. Backups and retention depend on your Supabase plan.

## 8. Common problems

**Players see network or CORS errors:** Confirm `VITE_API_URL` was present during the frontend build and the exact frontend origin is in `Game__AllowedOrigins`.

**Images do not upload:** Confirm the private bucket name and backend `Game__SupabaseUrl` and `Game__SupabaseServiceRoleKey` values. The browser never receives this key.

**Routes show 404 after refresh:** Confirm `vercel.json` exists at the repository root and redeploy the frontend.

**Database connection fails:** Use Supabase's session-pooler URI on port `5432`, replace the password placeholder, and URL-encode password characters.

**The projector does not update instantly:** SignalR reconnects automatically and every game screen also polls every few seconds, so it should self-correct shortly.

**The game does not advance:** Confirm the backend has been redeployed after the automation update, its `/health` endpoint is healthy, and App Platform is running exactly one backend instance. The backend—not the projector browser—runs the timers.

**An older Supabase database reports a missing column:** Redeploy or restart the backend. Startup automatically applies the included `AutomateGameFlow` EF Core migration before accepting requests.
