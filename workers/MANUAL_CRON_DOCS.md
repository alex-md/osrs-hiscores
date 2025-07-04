# Manual Cron Execution Documentation

This document explains how to manually execute the scheduled cron job in the OSRS Hiscores Cloudflare Worker.

## Features Added

### 1. Manual Cron Trigger Endpoint
**Endpoint**: `POST /api/cron/trigger`

Execute the scheduled update job manually without waiting for the scheduled time.

**Usage**:
```bash
curl -X POST "http://localhost:8787/api/cron/trigger"
```

**Response**:
```json
{
  "success": true,
  "message": "Cron job executed successfully",
  "timestamp": "2025-07-04T22:57:00.000Z"
}
```

### 2. Cron Status Endpoint
**Endpoint**: `GET /api/cron/status`

Get information about the cron configuration and available manual triggers.

**Usage**:
```bash
curl "http://localhost:8787/api/cron/status"
```

**Response**:
```json
{
  "cronTrigger": {
    "pattern": "0 * * * *",
    "description": "Runs at minute 0 of every hour",
    "nextRun": "Based on UTC time"
  },
  "manualTrigger": {
    "endpoint": "/api/cron/trigger",
    "method": "POST",
    "description": "Manually execute the scheduled update"
  },
  "localTesting": {
    "endpoint": "/cdn-cgi/handler/scheduled",
    "method": "POST",
    "description": "Cloudflare Workers local testing endpoint"
  },
  "timestamp": "2025-07-04T22:57:00.000Z"
}
```

### 3. Admin Interface
**Endpoint**: `GET /admin`

A web-based admin interface for manually executing cron jobs and monitoring the system.

**Usage**:
Visit `http://localhost:8787/admin` in your browser for a user-friendly interface.

## Testing Options

### 1. Manual Trigger (Recommended)
```bash
# Execute the cron job manually
curl -X POST "http://localhost:8787/api/cron/trigger"
```

### 2. Cloudflare Workers Local Testing
```bash
# Use the built-in Cloudflare Workers testing endpoint
curl -X POST "http://localhost:8787/cdn-cgi/handler/scheduled"

# With custom cron pattern
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=*+*+*+*+*"

# With custom time
curl "http://localhost:8787/cdn-cgi/handler/scheduled?cron=0+*+*+*+*&time=1745856238"
```

### 3. Web Interface
Visit `http://localhost:8787/admin` for a graphical interface.

## What the Cron Job Does

The scheduled update job performs the following actions:

1. **Updates Existing Users**: Adds random XP gains to all existing users' skills
2. **Creates New Users**: Generates 0-2 new random users with random stats
3. **Logging**: Outputs the number of users updated and created

## Development Workflow

1. **Start Development Server**:
   ```bash
   cd workers
   npx wrangler dev
   ```

2. **Test Manual Execution**:
   ```bash
   curl -X POST "http://localhost:8787/api/cron/trigger"
   ```

3. **Check Status**:
   ```bash
   curl "http://localhost:8787/api/cron/status"
   ```

4. **Use Admin Interface**:
   Visit `http://localhost:8787/admin` in your browser

## Production Deployment

The cron job is configured in `wrangler.toml` to run automatically every hour when deployed to Cloudflare Workers:

```toml
[triggers]
crons = ["0 * * * *"] # "At minute 0 of every hour"
```

The manual trigger endpoints work in production as well, allowing you to execute updates on demand.

## Error Handling

All endpoints include proper error handling and will return appropriate HTTP status codes:

- `200`: Success
- `500`: Internal server error with details

Example error response:
```json
{
  "success": false,
  "message": "Failed to execute cron job",
  "error": "Detailed error message here",
  "timestamp": "2025-07-04T22:57:00.000Z"
}
```
