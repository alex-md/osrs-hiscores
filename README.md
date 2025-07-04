# OSRS Hiscores Clone

A modern web application for looking up Old School RuneScape player statistics, built with Cloudflare Workers and vanilla JavaScript.

## Features

- 🔍 **Player Search**: Look up any OSRS player's hiscores
- 📊 **Complete Stats**: View all skills with ranks, levels, and experience
- ⚡ **Fast Performance**: Powered by Cloudflare Workers edge computing
- 💾 **Smart Caching**: KV storage for improved response times
- 📱 **Responsive Design**: Works on desktop and mobile devices
- 🔄 **Recent Searches**: Quick access to previously searched players
- 🎯 **Mock Data**: Test functionality with sample data

## Project Structure

```
osrs-hiscores/
├── workers/
│   ├── src/                # Worker source code
│   │   ├── index.js        # Main entry (fetch & scheduled handlers)
│   │   ├── dataGenerator.js# Data generation logic
│   │   ├── kvHelper.js     # KV get/put helpers
│   │   └── handlers.js     # HTTP & cron handlers
│   ├── wrangler.toml       # Cloudflare configuration
│   └── package.json        # Dev dependencies
├── frontend/               # Static frontend files
│   ├── index.html
│   ├── styles.css
│   └── app.js
└── README.md               # This documentation
```

## Setup Instructions

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Cloudflare account
- Wrangler CLI

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd osrs-hiscores
   ```

2. **Install dependencies**
   ```bash
   cd workers
   npm install
   ```

3. **Configure Wrangler**
   ```bash
   # Login to Cloudflare
   npx wrangler login
   
   # Create KV namespace
   npx wrangler kv:namespace create "HISCORES_KV"
   npx wrangler kv:namespace create "HISCORES_KV" --preview
   ```

4. **Update wrangler.toml**
   - Replace `your-kv-namespace-id` with the actual KV namespace ID
   - Replace `your-preview-kv-namespace-id` with the preview namespace ID

5. **Deploy to Cloudflare Workers**
   ```bash
   # Deploy to production
   npx wrangler deploy
   
   # Or run locally for development
   npx wrangler dev
   ```

## API Endpoints

### GET /api/hiscores?username=PLAYER_NAME
Fetch hiscores data for a specific player.

**Response:**
```json
{
  "username": "TestPlayer",
  "last_updated": "2025-07-03T12:00:00.000Z",
  "skills": {
    "overall": {
      "rank": 500000,
      "level": 1500,
      "experience": 50000000
    },
    "attack": {
      "rank": 100000,
      "level": 99,
      "experience": 13034431
    }
    // ... other skills
  }
}
```

### GET /api/recent
Get list of recently searched players.

**Response:**
```json
["Player1", "Player2", "Player3"]
```

### GET /api/mock
Get mock hiscores data for testing.

## Development

### Local Development
```bash
cd workers
npx wrangler dev
```

This will start the worker locally at `http://localhost:8787`

### Testing
- Use the `/api/mock` endpoint to test with sample data
- Test the search functionality with real OSRS usernames
- Verify caching is working by checking response times

### File Structure

- **`workers/src/index.js`**: Main worker entry point
- **`workers/src/handlers.js`**: HTTP request and cron job handlers
- **`workers/src/dataGenerator.js`**: Logic for fetching and parsing OSRS data
- **`workers/src/kvHelper.js`**: KV storage utilities
- **`frontend/`**: Static frontend files (HTML, CSS, JS)

## Deployment

### Production Deployment
```bash
cd workers
npx wrangler deploy
```

### Environment Variables
Configure in `wrangler.toml`:
- `ENVIRONMENT`: Set to "production" or "development"

### KV Namespace
The worker uses Cloudflare KV for caching:
- Hiscores data (TTL: 1 hour)
- Recent searches (TTL: 24 hours)

## Configuration

### Cron Jobs
The worker includes a cron trigger that runs every 6 hours:
```
crons = ["0 */6 * * *"]
```

Use this for:
- Cleaning up old cache entries
- Updating popular players
- Maintenance tasks

### CORS
The API includes CORS headers to allow frontend access:
```javascript
'Access-Control-Allow-Origin': '*'
'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
'Access-Control-Allow-Headers': 'Content-Type'
```

## Frontend Usage

The frontend provides a clean interface for:
1. Searching players by username
2. Viewing detailed skill statistics
3. Accessing recent searches
4. Loading mock data for testing

## Data Source

This application fetches data from the official OSRS Hiscores API:
```
https://secure.runescape.com/m=hiscore_oldschool/index_lite.ws?player=USERNAME
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Disclaimer

This project is not affiliated with Jagex Ltd. Old School RuneScape is a trademark of Jagex Ltd.

## Support

For issues and questions:
1. Check the existing issues
2. Create a new issue with detailed information
3. Include error messages and steps to reproduce

---

Built with ❤️ for the OSRS community
