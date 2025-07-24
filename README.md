# OSRS Hiscores Clone

A modern, full-stack web application for looking up and displaying mock Old School RuneScape player statistics, built with a vanilla JavaScript frontend and a Cloudflare Workers backend. This project features a sophisticated data generation system to simulate a dynamic player base.

## Features

  - 📊 **Dynamic Leaderboard**: View a paginated leaderboard of all players, ranked by total level and experience.
  - 👤 **Detailed Player Stats**: Look up any player to see their complete hiscores, including individual skill ranks, levels, and experience.
  - 🎯 **Individual Skill Hiscores**: Dedicated skill-specific leaderboards with advanced filtering, sorting, and export functionality.
  - 🔍 **Live Player Search**: Instantly search for players with debounced search and live suggestions.
  - 🤖 **Sophisticated Mock Data**: The backend worker continuously generates and updates player data with realistic activity patterns, including different player types (e.g., Casual, Hardcore, Elite) and weighted XP gains.
  - ⚡ **Edge Performance**: Powered by Cloudflare Workers for fast API responses and data storage with Cloudflare KV.
  - 🎨 **Modern UI/UX**: A clean, responsive, and themeable (light/dark) interface built with Tailwind CSS and Lucide icons.
  - 🔄 **Automatic Data Refresh**: A cron job runs every 15 minutes to simulate player progress and create new users, keeping the data fresh and dynamic.

-----

## Project Structure

```
osrs-hiscores/
├── .github/workflows/    # CI/CD workflows
├── frontend/             # Static frontend files
│   ├── index.html        # Main application page
│   ├── skill-hiscores.html  # Individual skill hiscores page
│   ├── skill-hiscores.js    # Skill hiscores application logic
│   ├── styles.css        # Custom OSRS-themed styles
│   └── app.js            # Frontend application logic
├── workers/              # Cloudflare Worker backend
│   ├── src/
│   │   └── index.js      # Main worker entry point with all backend logic
│   ├── wrangler.toml     # Cloudflare Worker configuration
│   └── package.json
└── README.md
```

-----

## Backend: Cloudflare Worker

The backend is a single Cloudflare Worker (`workers/src/index.js`) that handles API requests, data generation, and scheduled updates.

### API Endpoints

  - `GET /api/leaderboard`: Returns a ranked list of all players by total level and XP.
  - `GET /api/users/{username}`: Fetches the hiscores data for a specific player.
  - `GET /api/users`: Returns a list of all player usernames.
  - `GET /api/skill-rankings`: Provides detailed rankings for every individual skill.
  - `GET /api/health`: A simple health check endpoint.
  - `POST /api/cron/trigger`: Manually triggers the scheduled update task.
  - `POST /api/migrate/hitpoints`: Migrates all users to the new hitpoints calculation formula.
  - `GET /api/users/{username}/hitpoints-check`: Checks if a specific user needs hitpoints migration.

### Data Generation & Simulation

The worker uses a multi-layered system to create a realistic and dynamic set of player data:

  - **Username Generation**: New usernames are created by fetching words from the `random-word-api.herokuapp.com` API, with a local fallback generator to ensure reliability.
  - **Player Activity Types**: Each update cycle, existing players are assigned a random activity type (`INACTIVE`, `CASUAL`, `REGULAR`, `HARDCORE`, `ELITE`), which determines their potential XP gains.
  - **Weighted XP Gains**: XP is distributed based on skill popularity, player activity level, and a weekend bonus multiplier, making the simulation more authentic.

### Scheduled Updates

A cron job is configured in `wrangler.toml` to run **every 15 minutes** (`*/15 * * * *`). On each run, it:

1.  Updates the XP and levels for a portion of the existing user base.
2.  Creates 1-3 new, unique players to grow the community.
3.  Saves all changes to the `HISCORES_KV` Cloudflare KV namespace.

-----

## Frontend: Vanilla JavaScript App

The frontend consists of two main pages:

### Main Application (`frontend/index.html` + `app.js`)
The primary single-page application that provides the user interface for viewing overall hiscores and player details.

### Skill Hiscores (`frontend/skill-hiscores.html` + `skill-hiscores.js`)
A dedicated page for viewing individual skill leaderboards with advanced features:
- **Skill Selection Grid**: Visual grid of all skills with color-coded icons
- **Advanced Filtering**: Filter by level ranges, XP thresholds, and player names
- **Sortable Columns**: Click column headers to sort by rank, player name, level, or XP
- **Pagination Controls**: Configurable items per page (25/50/100)
- **Export Functionality**: Download skill rankings as CSV files
- **Skill Statistics**: View top player, highest XP, and average level for each skill

### Shared Features

  - **View Routing**: Uses the URL hash (`#`) to navigate between views and maintain state.
  - **Data Caching**: Caches API responses (leaderboard, users, rankings) in memory to reduce redundant network requests and speed up navigation.
  - **Dynamic Rendering**: All views are rendered dynamically based on the fetched API data.
  - **Theming**: Supports both light and dark modes, with the user's preference saved to local storage.
  - **Interactive Elements**: Includes searchable interfaces, toast notifications, and cross-page navigation for a seamless user experience.

-----

## Setup & Deployment

### Prerequisites

  - Node.js and npm
  - A Cloudflare account
  - Wrangler CLI installed and configured (`npx wrangler login`)

### Installation

1.  **Clone the repository**.
2.  **Install worker dependencies**:
    ```bash
    cd workers
    npm install
    ```
3.  **Create KV Namespace**: Create a KV namespace for storing hiscores data. This is required for the worker to function.
    ```bash
    # Create production and preview namespaces
    npx wrangler kv:namespace create "HISCORES_KV"
    npx wrangler kv:namespace create "HISCORES_KV" --preview
    ```
4.  **Update `wrangler.toml`**: Add the generated `id` and `preview_id` from the previous step to your `wrangler.toml` file.

### Running Locally

To run the backend worker locally for development:

```bash
cd workers
npx wrangler dev
```

The worker will be available at `http://localhost:8787`. You can open the `frontend/index.html` file in your browser to interact with the local worker.

### Deployment

Deploy the worker to your Cloudflare account:

```bash
cd workers
npx wrangler deploy
```

### Hitpoints Formula Migration

This project includes a new hitpoints calculation formula where hitpoints XP is calculated as 1/3 of all non-hitpoints combat XP (Attack, Strength, Defence, Ranged, Prayer, Magic).

#### Running the Migration

After deploying the updated code, you need to migrate existing users to use the new formula:

**Option 1: Use the PowerShell script (Windows)**
```powershell
.\migrate_hitpoints.ps1
```

**Option 2: Use the Bash script (Linux/Mac)**
```bash
chmod +x migrate_hitpoints.sh
./migrate_hitpoints.sh
```

**Option 3: Manual API call**
```bash
curl -X POST "https://your-worker-url.workers.dev/api/migrate/hitpoints"
```

#### Migration Details

- The migration processes all users in batches to avoid timeouts
- Only users whose hitpoints don't match the new formula will be updated
- Leaderboards are automatically regenerated after migration
- See `MIGRATION_GUIDE.md` for detailed instructions and troubleshooting

#### Verification

Check if a specific user needs migration:
```bash
curl -X GET "https://your-worker-url.workers.dev/api/users/{username}/hitpoints-check"
```
