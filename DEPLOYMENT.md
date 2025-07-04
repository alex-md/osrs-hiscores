# Deployment Guide

## Pre-requisites

1. **Cloudflare Account**: You'll need a Cloudflare account
2. **Wrangler CLI**: Install the Wrangler CLI globally
3. **Node.js**: Version 16 or higher

## Step 1: Deploy the Cloudflare Worker

1. **Navigate to the workers directory**:
   ```bash
   cd workers
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Login to Cloudflare**:
   ```bash
   npx wrangler login
   ```

4. **Create KV namespace** (if not already created):
   ```bash
   npx wrangler kv:namespace create "HISCORES_KV"
   ```
   
   Copy the namespace ID from the output and update `wrangler.toml` if needed.

5. **Deploy the worker**:
   ```bash
   npx wrangler deploy
   ```

6. **Note the worker URL** (something like `https://osrs-hiscores-clone.your-subdomain.workers.dev`)

## Step 2: Update Frontend Configuration

1. **Update the API URL** in `frontend/app.js`:
   - Replace `your-subdomain` with your actual Cloudflare Workers subdomain
   - The URL should look like: `https://osrs-hiscores-clone.your-subdomain.workers.dev`

## Step 3: Deploy Frontend to Cloudflare Pages

1. **Push your code to GitHub** (if not already done)

2. **Connect to Cloudflare Pages**:
   - Go to [Cloudflare Pages](https://pages.cloudflare.com/)
   - Click "Create a project"
   - Connect your GitHub repository

3. **Configure build settings**:
   - **Build command**: Leave empty (no build required)
   - **Root directory**: Leave empty
   - **Deployment command**: Leave empty



4. **Deploy**:
   - Click "Save and Deploy"
   - Cloudflare Pages will automatically deploy your frontend

## Step 4: Test the Application

1. Visit your Cloudflare Pages URL
2. The frontend should load and connect to your worker API
3. Test the leaderboard and user detail views

## Environment Variables

No environment variables are required for this setup. The worker uses KV storage for data persistence.

## Custom Domain (Optional)

You can configure custom domains for both:
- **Frontend**: In Cloudflare Pages settings
- **Backend**: In Cloudflare Workers settings

## Troubleshooting

### Frontend can't connect to API
- Check that the API URL in `app.js` matches your deployed worker URL
- Verify CORS headers are properly configured in the worker

### Worker deployment fails
- Ensure you're logged in: `npx wrangler whoami`
- Check that the KV namespace exists and the ID is correct in `wrangler.toml`

### No data showing
- The worker will automatically seed some initial data
- You can manually trigger data generation via the cron endpoint: `POST /api/cron/trigger`
