<div align="center">

# ⚔️ OSRS Hiscores Clone

_A modern, serverless, zero-build mock Old School RuneScape hiscores – fully simulated, self‑maintaining, and extensible._

</div>

> Disclaimer: This project is a fan-made mock / educational clone. It is **not** affiliated with Jagex or the official Old School RuneScape hiscores. All RuneScape related names & imagery belong to their respective owners.

## 1. High‑Level Overview

This repository delivers a complete hiscores experience without a traditional backend server or database cluster. It combines:

* **Cloudflare Worker + KV** – single lightweight API surface and scheduled simulation that keeps the world “alive”.
* **Cloudflare Pages Function wrapper** – reuses identical Worker logic when deployed under Pages for unified routing (`functions/api/[[path]].js`).
* **Static Frontend (Vanilla JS + Tailwind CDN)** – no build tooling; instant deploy; hash-based client routing for player profiles.
* **Deterministic, incremental simulation layer** – periodically mutates player records to emulate activity archetypes & XP distribution.
* **Pure-module architecture** – core logic (skill constants, simulation utilities, router) is exportable and testable, enabling agentic / automated tooling to compose or extend behavior programmatically.

The result: a self-refreshing dataset, fast responses (all JSON assembly happens in the edge worker), and a frontend that progressively enhances with achievements and client-side analytics without extra backend writes.

## 2. Key Features

### Gameplay / Data Simulation
* Weighted skill XP gain influenced by configurable **activity archetypes** & skill popularity weights.
* Weekend global XP bonus multiplier for variation.
* Automatic scheduled updates every **10 minutes** (see `wrangler.toml`) updating a random 10–35% sample and spawning 1–3 new accounts.
* Safe maintenance flags (e.g. `needsHpMigration`) + migration endpoints simulate real-world data correction tasks.

### Player & Ranking Experience
* Overall leaderboard (ranked by Total Level then Total XP) with client‑side pagination UI & rank highlighting (🥇🥈🥉).
* Per-skill hiscores view with filters (name, min/max level & XP) and page controls.
* Instant player profile view (hash route `#user/<username>`) showing per‑skill breakdown, computed combat level, and summary badges.
* Achievement showcase (rarity‑sorted) with rarity tiers computed client-side from global distributions.
* Debounced, accessible player search (ARIA combobox + keyboard navigation) with suggestions.
* Dark / light theme toggle persisted via `localStorage` and pre-applied to eliminate FOUC.
* API base override via query (`?api=`) or prompt; persisted for local / staging testing.

### Operations & Admin Tooling
* `/api/seed` bulk creation (admin token) – allows deterministic population during demos.
* Batch & pattern-based deletion endpoints with **dry-run semantics** enabling safe automated curation (`/api/admin/users/delete-batch`, `/api/admin/users/delete-bad`).
* `/api/cron/trigger` manual invocation of scheduled logic (useful for preview environments or integration tests).
* `/api/debug` environment & binding inspection (non-secret) to verify deployment wiring.

### Frontend Implementation Details
* Zero build: Tailwind CDN, vanilla modules, and dynamic DOM construction utilities (`el`, `text`, `$`).
* Optimistic progressive rendering (placeholder rows + error hints if backend misconfigured).
* Accessibility: standardized ARIA roles, keyboard navigation for search & pagination; semantic table markup.
* Achievement system intentionally **ephemeral** (not persisted) to reduce write amplification & keep KV hot path simple.

## 3. Project Structure

```
osrs-hiscores/
├── frontend/                # Static client (no bundler)
│   ├── index.html           # Leaderboard + profile (SPA-like via hash)
│   ├── skill-hiscores.html  # Per-skill rankings UI
│   ├── common.js            # Shared helpers (API base, DOM, theme, skill meta)
│   ├── app.js               # Leaderboard + player profile logic
│   ├── skill-hiscores.js    # Skill table view logic
│   └── styles.css           # Custom theme / OSRS-inspired aesthetic
├── functions/
│   └── api/[[path]].js      # Cloudflare Pages Function delegating to Worker
└── workers/
    ├── src/constants.js     # Skills + archetype probability tables
    ├── src/utils.js         # Simulation + general utilities (pure functions)
    ├── src/index.js         # Router + handlers + scheduled task
    ├── wrangler.toml        # Deployment & cron config
    └── package.json         # Wrangler dev dependency & scripts
```

### Architectural Rationale
| Choice | Rationale | Trade-offs |
| ------ | --------- | ---------- |
| Cloudflare Worker + KV | Ultra-low latency global edge execution, simple key-value persistence, scheduled tasks built-in | KV eventual consistency; not ideal for strongly consistent counters |
| Single-file router (`index.js`) | Centralized endpoint logic, easy to export for reuse (agentic scripts/tests) | File growth; mitigated via separated `constants.js` / `utils.js` |
| Tailwind CDN + vanilla JS | Instant iteration, no build pipeline complexity | Larger initial CSS payload; fewer advanced framework ergonomics |
| Client-side achievements | Avoids extra writes & migrations; flexible experimentation | Not authoritative (race conditions / “first to 99” placeholders) |
| Dry-run admin endpoints | Enables safe automated maintenance from scripts/agents | Slightly more code branches to test |

## 4. Backend API

### Endpoints
| Method | Path | Description | Caching |
| ------ | ---- | ----------- | -------- |
| GET | `/api/health` | Liveness / quick check | no-store |
| GET | `/api/debug` | Deployment diagnostics (non-secret) | no-store |
| GET | `/api/leaderboard?limit=N` | Overall ranking (rank, total level, XP) (cap 5000) | max-age=30 |
| GET | `/api/skill-rankings` | Full per-skill ranking arrays (XP+level) | max-age=30 |
| GET | `/api/users` | Flat list of usernames | max-age=120 |
| GET | `/api/users/:username` | Full user document | max-age=15 |
| GET | `/api/users/:username/hitpoints-check` | Validates HP migration need | max-age=15 |
| POST | `/api/cron/trigger` | Manually run scheduled simulation | - |
| POST | `/api/migrate/hitpoints` | Process queued HP migrations | - |
| POST | `/api/seed` | Bulk create users (admin token) | - |
| POST | `/api/admin/users/delete-batch` | Random or explicit batch deletion (dryRun supported) | - |
| POST | `/api/admin/users/delete-bad` | Regex-based username purge (dryRun) | - |

### Request / Response Conventions
* All responses JSON with permissive CORS (`access-control-allow-origin: *`).
* Admin endpoints require `x-admin-token: <ADMIN_TOKEN>` header OR `?token=` query.
* Dry runs return a preview payload without modifying KV.

### Data Model (KV)
Key pattern: `user:<lowercased_username>`
```jsonc
{
  "username": "Alicorn",
  "createdAt": 1734567890123,
  "updatedAt": 1734569990456,
  "skills": {
    "attack": { "xp": 12345, "level": 45 },
    // ... all skills ...
    "hitpoints": { "xp": 1154, "level": 10 }
  },
  "totalLevel": 523,
  "totalXP": 1456789,
  "activity": "FOCUSED",
  "archetype": "CASUAL",
  "needsHpMigration": false,
  "version": 2
}
```

### Simulation Algorithm (Simplified)
1. Sample fraction f ∈ [0.10, 0.35] of users.
2. For each sampled user:
   * Determine activity by weighted random using their archetype probability table.
   * Draw XP budget from activity’s `[min,max]` with weekend multiplier (1.15 Sat/Sun).
   * Select 1–5 random skills; allocate XP proportionally to skill popularity weights plus a small random jitter.
   * Recompute levels (`levelFromXp`) + totals; maybe flag `needsHpMigration` (1% chance).
3. Create 1–3 new users (random generated names) each cycle.

### Maintenance & Migration
* `needsHpMigration` simulates deferred consistency tasks; endpoint `/api/migrate/hitpoints` corrects stale HP levels.
* Version field allows future schema evolution (e.g., versioned achievements) without breaking existing records.

## 5. Frontend Architecture

| File | Responsibility |
| ---- | -------------- |
| `common.js` | API base discovery, helper DOM factories, theme persistence, global constants (skill names & icons) |
| `app.js` | Leaderboard rendering, user profile view, achievements derivation, client caches, routing (`hashchange`) |
| `skill-hiscores.js` | Per-skill ranking screen, filtering logic, pagination state |
| `styles.css` | Layered theme tokens (CSS custom props), OSRS-style gradient & pixel font integration, achievement rarity styling |

### Client Caching & Performance
* Thin in-memory caches for leaderboard, users list, and skill rankings to reduce duplicate network requests within a short window.
* Conditional refresh windows (e.g., user list re-fetched if older than 60s) – a pragmatic balance between freshness and churn.
* Rarity percentages for achievements computed once per page load & memoized (`window.__achievementStats`).

### Achievement System Design
* Catalog constructed deterministically (skill thresholds, rank tiers, playstyle, activity). New achievement categories can be appended with no backend migration.
* Unlock evaluation is pure & local (derives from fetched rankings + user doc).
* Prevalence & rarity tiers (mythic, legendary, etc.) computed from current ranking distribution – encourages emergent variability.
* Placeholders (`first-99-<skill>`, `first-maxed-account`) intentionally non-authoritative; could be upgraded by persisting event registers server-side.

### Accessibility Considerations
* Search suggestion list implements ARIA combobox pattern (role=listbox / option, `aria-expanded` toggling) for screen reader compatibility.
* Table semantics retained (thead/tbody) to ensure assistive technology can navigate cells logically.
* Focus outlines preserved & enhanced via box-shadow for visibility across dark/light themes.

## 6. Environment & Configuration

| Config | Location | Purpose |
| ------ | -------- | ------- |
| `HISCORES_KV` | `wrangler.toml` binding | KV namespace storing user JSON blobs |
| `ADMIN_TOKEN` | `wrangler.toml` / secret | Auth gate for mutation endpoints (seed / delete) |
| Cron `*/10 * * * *` | `wrangler.toml` | Triggers simulation every 10 minutes |

### Local Development
```powershell
cd workers
npm install
wrangler kv:namespace create HISCORES_KV
wrangler secret put ADMIN_TOKEN
wrangler dev
```

Serve frontend (any static server):
```powershell
cd ../frontend
python -m http.server 8000
```
Then open http://localhost:8000 (update `data-api-base` in `<html>` or use `?api=` query to point at your local Worker URL, e.g. `http://127.0.0.1:8787`).

### Deployment (Workers)
```powershell
cd workers
npm run deploy
```
Front-end can be published separately (Pages / Netlify / GitHub Pages). For same-origin simplicity configure Workers Routes (commented section in `wrangler.toml`) and set `data-api-base` to your main site origin.

## 7. Agentic Coding Patterns & Extensibility

The codebase includes deliberate patterns to support automated refactoring, autonomous feature agents, or scripted maintenance:

1. **Pure Functions Exported** – `utils.js` (e.g. `levelFromXp`, `assignRandomArchetype`, `fetchRandomWords`) are side‑effect free (aside from network in the deliberately isolated word fetch) which eases test harness generation or AI-driven mutation.
2. **Single Router Surface** – `handleApiRequest` exported separately from the Worker default export, enabling reuse in Pages Functions and potential future test runners (e.g., Miniflare, Vitest) with no mock duplication.
3. **Dry-Run Admin Endpoints** – Explicit safe mode encourages autonomous agents to propose deletions then switch to live mode after human approval.
4. **Data Version Field (`version`)** – Provides a guardrail for agents introducing new schema fields (bump version; write dual-read logic) minimizing migration risk.
5. **Deterministic Key Patterns** – Uniform `user:<username>` keys allow mechanical scanning / migration scripts without discovery complexity.
6. **In-Memory Client Caches with TTL** – Straightforward objects allow agents to experiment with cache invalidation or layering (e.g., adding IndexedDB) without altering external API contracts.
7. **Configuration Isolation** – All probabilities, archetype weights & popularity multipliers live in `constants.js` for automated tuning experiments (e.g., reinforcement learning adjusting distribution to target desired retention curves).
8. **Ephemeral Analytics (Achievements)** – Derived-only model means agents can safely iterate ranking criteria or rarity thresholds without state rewrites.

### Example Extension Ideas
* Persist authoritative achievement unlock events (append-only logs) – agent can watch unlock velocity & auto-balance thresholds.
* Add WebSocket / SSE layer for live rank deltas (edge compute friendly) – incremental adoption without breaking existing fetch clients.
* Introduce per-skill training efficiency simulation (rested bonus, diminishing returns) adjustable via config for A/B testing.
* Automated anomaly detector script hitting `/api/leaderboard` + `/api/skill-rankings` comparing XP gradients to expected distribution; triggers rollback or quarantine endpoints (to be added) on outliers.

## 8. Testing Strategy (Proposed)
While no tests are committed yet, the functional seams allow:
* **Unit tests** – Pure XP / level math (`levelFromXp`), archetype selection probabilities (statistical convergence tests).
* **Integration tests** (Miniflare) – Boot Worker, call seed, run scheduled, validate leaderboards monotonicity & rank ordering invariants.
* **Property tests** – Ensure `totalLevel(skills)` equals sum of individual levels across randomized skill maps.

## 9. Performance & Scalability Notes
* Ranking endpoints compute aggregates on-demand; for tens of thousands of users this remains feasible (KV list pagination + in-memory sort). For larger scales, a precompute pipeline (scheduled to write summary keys) would reduce tail latency.
* Client requests (leaderboard / skill rankings) are cacheable for short windows – a CDN in front (already implicit with Workers) further amortizes cost.
* Simulation only touches a fraction of users per cycle to bound write volume & avoid KV hotspotting.

## 10. Security Considerations
* `ADMIN_TOKEN` must be rotated and stored as a secret (avoid hardcoding in committed `wrangler.toml` for production).
* CORS is wide open intentionally for demo; restrict origins if deployed publicly.
* No user-generated content besides usernames (sanitized & length capped) minimizing XSS vectors.
* Regex deletion endpoint validates pattern safety; still advisable to impose stricter allowlists in multi-tenant scenarios.

## 11. Future Improvements
* Precomputed & paginated leaderboard slices stored under `cache:leaderboard:<limit>` keys.
* ETag / Last-Modified support for conditional GETs.
* Persistent achievement & event timeline (time-to-99 metrics).
* Rate limiting on admin endpoints (token-scoped quotas).
* Formal test suite + CI (GitHub Actions + Miniflare).
* Optional Web UI for admin maintenance (seed/delete/dry-run diff viewer).

## 12. Quick Start Cheat Sheet
| Action | Command (PowerShell) |
| ------ | -------------------- |
| Install worker deps | `cd workers; npm install` |
| Run dev worker | `wrangler dev` |
| Serve frontend | `cd ../frontend; python -m http.server 8000` |
| Seed users | `curl -X POST http://127.0.0.1:8787/api/seed?token=<TOKEN> -H "content-type: application/json" --data '{"usernames":["Alice"]}'` |
| Trigger simulation | `curl -X POST http://127.0.0.1:8787/api/cron/trigger` |
| Dry-run delete random 50 | `curl -X POST http://127.0.0.1:8787/api/admin/users/delete-batch?token=<TOKEN> -H "content-type: application/json" --data '{"limit":50,"dryRun":true}'` |

## 13. License

MIT

---
If you build on this, feel free to open a PR with extensions (tests, precompute layer, real-time streaming) – the structure is intentionally simple so agents _and_ humans can reason about it quickly.
