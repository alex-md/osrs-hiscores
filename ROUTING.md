# API Routing & Same-Origin Setup

This project currently serves the frontend (static HTML/JS) separately from the Cloudflare Worker that provides the JSON API. By default the Worker is only available at its `*.workers.dev` domain and the frontend must be pointed there using `data-api-base` or the `?api=` query parameter / localStorage override.

If you want the frontend to fetch `/api/...` on the SAME domain (e.g. `https://example.com/api/leaderboard`) you need to add a **route** so Cloudflare directs those requests to the Worker.

---
## 1. Prerequisites
- A domain added to your Cloudflare account (DNS active / orange cloud proxied).
- The zone ID for that domain (Dashboard → Overview → API section).

You do NOT need Pages Functions for this; a route is enough if the static site is hosted elsewhere (Pages, or another host/CDN).

> If you host the static site on Cloudflare Pages at `example.com`, and you add a route for `example.com/api/*`, the Worker will handle only those `/api` paths; other paths will still serve your static site.

---
## 2. Configure `wrangler.toml`
Uncomment and edit the block added near the top:

```
routes = [
  { pattern = "example.com/api/*", zone_id = "<YOUR_ZONE_ID>" }
]
```

Replace `example.com` and `<YOUR_ZONE_ID>` with your actual values.

Multiple domains? Add additional objects to the array.

---
## 3. Deploy
```
cd workers
npm run deploy
```
Wrangler will publish *and* attempt to attach the route. Confirm in the Dashboard → Workers & Pages → your Worker → Routes.

---
## 4. Update Frontend (Permanent Same-Origin)
Edit both HTML root tags (`index.html`, `skill-hiscores.html`):
```
<html ... data-api-base="">
```
Leave it blank (or remove the attribute) so runtime default is `location.origin`.
Remove any stored override:
Open console → `localStorage.removeItem('apiBaseOverride')` then reload.

Now `fetchJSON('/api/leaderboard')` will go to `https://example.com/api/leaderboard` (route) and return JSON.

---
## 5. Verification Checklist
- Visit `https://example.com/api/health` → JSON `{status:"ok"}`.
- Frontend loads with no “Received HTML” error.
- Network panel shows 200 and `content-type: application/json` for API calls.

If you still get HTML, double-check:
1. Route pattern exact match (`api/*` vs `api*` — must include the slash and wildcard correctly).
2. Domain proxied through Cloudflare (orange cloud in DNS).
3. No conflicting Page Function or other Worker route catching `/api` first.
4. Cache: Hard reload / bypass cache.

---
## 6. Supporting Both Workers.dev and Custom Domain
You can keep the workers.dev URL (automatic) and *add* routes. Both will work; useful for testing: workers.dev remains a fallback if you break routing.

---
## 7. Pages + Worker (Alternative)
If you want everything deployed via **Cloudflare Pages** with Functions:
- Convert the Worker logic into Pages Functions directory (`/functions/api/...`).
- Remove wrangler route configuration (Pages handles routing internally).
This is a larger refactor; current setup is simpler with a pure Worker + static hosting.

---
## 8. Removing the Override UI
Once routing is stable you may remove the override buttons / logic (optional). Search for `apiBaseOverride` in `frontend/` files to trim unused code.

---
## 9. Troubleshooting Quick Table
| Symptom | Likely Cause | Fix |
| ------- | ------------ | --- |
| Still seeing HTML from `/api/leaderboard` | Route not applied or using Pages domain only | Add route or use workers.dev directly |
| 404 on `/api/health` at custom domain | Pattern typo / zone mismatch | Re-check `routes` entry |
| CORS error (shouldn’t normally) | Added restrictive headers accidentally | Ensure `access-control-allow-origin: *` still present |

---
## 10. Example Multi-Env Setup
```
# wrangler.toml excerpt
[env.production]
routes = [
  { pattern = "example.com/api/*", zone_id = "<ZONE_ID>" }
]

[env.staging]
routes = [
  { pattern = "staging.example.com/api/*", zone_id = "<ZONE_ID>" }
]
```
Deploy with:
```
wrangler deploy --env production
wrangler deploy --env staging
```

---
### Done
With routes configured you can eliminate all the manual API base overrides and rely on same-origin requests.
