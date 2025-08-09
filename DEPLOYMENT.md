# OSRS Hiscores - Deployment Guide

This project provides a complete OSRS Hiscores clone that can be deployed on Cloudflare infrastructure. There are two main deployment approaches.

## Architecture Overview

- **Frontend**: Static HTML/CSS/JS files served from Cloudflare Pages
- **Backend**: Worker script handling API endpoints (`/api/*`)
- **Database**: Cloudflare KV for storing player data
- **Scheduled Tasks**: Cron triggers for simulating player activity

## Deployment Option 1: Cloudflare Pages with Functions (Recommended)

This approach uses Cloudflare Pages with the new Functions feature for a streamlined deployment.

### Setup Steps:

1. **Connect Repository to Cloudflare Pages**:
   - Go to Cloudflare Dashboard → Pages
   - Click "Create a project" → "Connect to Git"
   - Select your repository
   - Set build settings:
     - Build command: (leave empty)
     - Output directory: `frontend`

2. **Configure Environment Variables**:
   - In Pages project settings → Environment variables:
   - Add `ADMIN_TOKEN` with a secure value (for the `/api/seed` endpoint)

3. **Configure KV Binding**:
   - In Pages project settings → Functions
   - Add KV binding: `HISCORES_KV` → Create new namespace or use existing
   - KV namespace ID should match the one in `workers/wrangler.toml`

4. **Deploy**:
   - The `functions/api/[[path]].js` file will automatically handle all `/api/*` routes
   - Frontend will be served from the `frontend/` directory

### Files Used:
- `functions/api/[[path]].js` - Main API handler (Pages Functions)
- `frontend/` - Static frontend files

## Deployment Option 2: Separate Worker + Pages (Legacy)

This approach uses a separate Worker deployment with Cloudflare Pages for static assets.

### Setup Steps:

1. **Deploy the Worker**:
   ```bash
   cd workers
   npm install
   npx wrangler deploy
   ```

2. **Deploy Pages**:
   - Connect repository to Cloudflare Pages
   - Set build output to `frontend`
   - No Functions configuration needed

3. **Configure Frontend**:
   - Update `frontend/index.html` and `frontend/skill-hiscores.html`:
   ```html
   <html data-api-base="https://your-worker.your-subdomain.workers.dev">
   ```
   - Or use the query parameter: `?api=https://your-worker.your-subdomain.workers.dev`

### Files Used:
- `workers/src/index.js` - Worker script
- `workers/wrangler.toml` - Worker configuration
- `_worker.js` - Pages adapter (if using hybrid approach)

## Environment Variables

- `ADMIN_TOKEN`: Secure token for admin endpoints like `/api/seed`
- `HISCORES_KV`: KV namespace binding name

## KV Namespace

The application uses a KV namespace to store player data. The namespace ID in `workers/wrangler.toml` should match the one configured in your Pages project or Worker bindings.

Key format: `user:<username>` (lowercase)

## API Endpoints

- `GET /api/health` - Health check
- `GET /api/leaderboard?limit=500` - Get leaderboard
- `GET /api/users` - List all usernames
- `GET /api/users/{username}` - Get specific user data
- `GET /api/skill-rankings` - Get rankings by skill
- `POST /api/seed` - Create test users (requires ADMIN_TOKEN)
- `POST /api/cron/trigger` - Manual trigger for scheduled tasks

## Cron/Scheduled Tasks

The application includes scheduled tasks that:
- Simulate player activity and XP gains
- Create new random players
- Update player statistics

### For Workers:
Cron triggers are configured in `workers/wrangler.toml` to run every 15 minutes.

### For Pages Functions:
Scheduled functions are in beta. You may want to keep a separate Worker for cron jobs or use external cron services.

## Testing

1. **Local Development** (Worker):
   ```bash
   cd workers
   npx wrangler dev --local
   ```

2. **Test API**:
   - Visit `http://127.0.0.1:8787/api/health`
   - Should return JSON: `{"status":"ok","time":...}`

3. **Frontend Testing**:
   - Open `frontend/index.html` in browser
   - Or use a local server: `python -m http.server 8000` in frontend directory

## Common Issues

1. **"Received HTML instead of JSON"**: 
   - Check KV binding is correctly configured
   - Verify environment variables are set
   - Check that `/api/health` returns JSON

2. **Module Import Errors**:
   - Ensure `_worker.js` can import the worker module correctly
   - Consider using the Functions approach instead

3. **CORS Issues**:
   - API responses include CORS headers for `*` origin
   - Should work with any frontend domain

## Monitoring

- Check Cloudflare Pages deployment logs
- Monitor KV usage in Cloudflare Dashboard
- Use Worker analytics for API performance

## Scaling Considerations

- KV has usage limits; monitor read/write operations
- Consider caching strategies for frequently accessed data
- The `getAllUsers()` function scans all KV keys - optimize for large datasets
