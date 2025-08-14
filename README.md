# OSRS Hiscores Clone

A modern, full-stack mock Old School RuneScape hiscores application. Frontend is vanilla JavaScript + Tailwind (CDN) and backend is a single Cloudflare Worker written in pure JavaScript that simulates a dynamic player base.

## Features

- Dynamic overall leaderboard (ranked by total level then total XP)
- Player lookup with per-skill stats
- Individual skill hiscores page with filtering, sorting, pagination & CSV export
- Live (debounced) player search with suggestions dropdown
- Weighted XP simulation with player activity archetypes & weekend bonus
- Automatic cron-driven progression and new player creation (every 15 minutes)
- Hitpoints migration endpoints (illustrative data maintenance task)
- Theme toggle (light/dark) persisted in local storage

## Project Structure

```
osrs-hiscores/
├── frontend/
│   ├── index.html
│   ├── skill-hiscores.html
│   ├── app.js
│   ├── skill-hiscores.js
│   └── styles.css
└── workers/
    ├── src/index.js
    ├── wrangler.toml
    └── package.json
```

## Backend (Cloudflare Worker)

Endpoints:

| Method | Path | Description |
| ------ | ---- | ----------- |
| GET | /api/health | Health check |
| GET | /api/leaderboard | Overall leaderboard |
| GET | /api/users | List of all usernames |
| GET | /api/users/:username | Player profile |
| GET | /api/skill-rankings | Rankings for every skill |
| POST | /api/cron/trigger | Manually trigger scheduled simulation |
| POST | /api/migrate/hitpoints | Run hitpoints migration (if flagged) |
| GET | /api/users/:username/hitpoints-check | Check HP migration status |
| POST | /api/seed | Bulk create users (admin token required) |

### Leaderboard Limiting

The `/api/leaderboard` endpoint now accepts an optional `?limit=<n>` query parameter (capped at 5000) to reduce payload size when only a subset (e.g. top 100) is needed. If omitted, all players (up to the internal cap) are returned.

### Simulation Cycle

Each scheduled run performs:
1. Update 10–35% of users with activity-weighted XP budgets.
2. Distribute XP across 1–5 random skills using popularity weights + weekend multiplier.
3. Randomly flag ~1% of touched users for future hitpoints migration (simulated bug).
4. Create 1–3 new users with generated names.

### Data Model

User KV record (`user:<username>`):
```
{
  username: string,
  createdAt: number,
  updatedAt: number,
  skills: { [skill]: { xp: number, level: number } },
  totalLevel: number,
  totalXP: number,
  activity: string,
  needsHpMigration: boolean,
  version: number
}
```

## Frontend

- `index.html` – Overall leaderboard & player detail (hash routing `#user/<name>`)
- `skill-hiscores.html` – Per-skill rankings with filters, sorting, pagination, CSV export.

No build step required; served as static assets.

### Unified Deployment (Cloudflare Pages + _worker.js)

This repo includes a root `_worker.js` that lets Cloudflare Pages serve the static frontend and proxy `/api/*` to the Worker logic (imported from `workers/src/index.js`). With this setup:

* Frontend fetches simply use relative paths (`/api/leaderboard`, etc.).
* No `?api=` or `data-api-base` override is needed.
* Bind the KV namespace as `HISCORES_KV` in the Pages project settings.
* Optionally set `ADMIN_TOKEN` in Pages environment vars.
* Cron scheduling still requires a classic Worker deployment or Pages Scheduled Functions (if available); you can keep a separate Worker deployed that shares the same KV namespace for cron while Pages handles user traffic.

If you prefer separate origins, you can remove `_worker.js` and continue using a standalone Worker plus static hosting, supplying a `data-api-base` or `?api=` override.

### Frontend Enhancements (Recent)
* Leaderboard now requests only top 500 by default (configurable in `app.js`).
* Accessible, keyboard-navigable player search (Arrow Up/Down, Enter, Escape) with ARIA roles.
* Skill hiscores remember "per page" preference via `localStorage`.
* Basic loading / error states for the leaderboard table.
* Debounced filtering for skill hiscores to reduce re-render thrash.

### Seeding Users (Admin Only)

To bulk add starter users run (replace token):

```
curl -X POST "https://<your-worker-domain>/api/seed?token=YOUR_ADMIN_TOKEN" \
  -H 'content-type: application/json' \
  --data '{"usernames":["Alice","Bob","Charlie"]}'
```

Alternatively pass the token via `x-admin-token` header. The worker rejects seeding if `ADMIN_TOKEN` is unset or left at the placeholder value.

## Development

Install dependencies for worker:

```sh
cd workers
npm install
```

Create a KV namespace and configure wrangler (replace placeholders in `wrangler.toml` or secrets):

```sh
wrangler kv:namespace create HISCORES_KV
wrangler secret put ACCOUNT_ID
wrangler secret put KV_NAMESPACE_ID
wrangler dev
```

Open the frontend via a static server (adjust origin for API if different):

```sh
cd frontend
python -m http.server 8000
```

Navigate to http://localhost:8000 and the app will request data from the worker (ensure CORS allowed; current worker sets `access-control-allow-origin: *`).

## Deployment

Deploy worker:
```sh
cd workers
npm run deploy
```
Then host `frontend/` (e.g., Cloudflare Pages, Netlify, GitHub Pages). For same-origin simplicity you can also bundle static assets into a Worker Site / Pages project later.

## Hardening & Future Improvements

- Persist precomputed leaderboards to reduce per-request aggregation cost
- Add pagination to API endpoints
- Implement ETag / If-Modified-Since caching
- Introduce authentication & admin endpoints for migrations
- Add tests (Wrangler + Miniflare) for simulation correctness
- Store additional metadata (e.g., last activity type distribution stats)

## License

MIT
