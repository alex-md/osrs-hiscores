<!-- Use this file to provide workspace-specific custom instructions to Copilot. For more details, visit https://code.visualstudio.com/docs/copilot/copilot-customization#_use-a-githubcopilotinstructionsmd-file -->

# OSRS Hiscores Clone - Copilot Instructions

This is a **Cloudflare Workers** project that creates an OSRS (Old School RuneScape) Hiscores lookup service.

## Project Context

- **Backend**: Cloudflare Workers with JavaScript (ES modules)
- **Frontend**: Vanilla HTML, CSS, and JavaScript
- **Data Storage**: Cloudflare KV for caching
- **API Source**: Official OSRS Hiscores API
- **Build Tool**: Wrangler CLI

## Key Technologies

- **Cloudflare Workers**: Serverless functions at the edge
- **KV Storage**: Key-value storage for caching hiscores data
- **Fetch API**: For making HTTP requests to OSRS API
- **Cron Triggers**: Scheduled tasks for maintenance
- **ES Modules**: Modern JavaScript module system

## Architecture Guidelines

### Worker Structure
- Use ES module syntax (`import`/`export`)
- Separate concerns into different files (handlers, data processing, KV operations)
- Handle both HTTP requests and scheduled events
- Include proper error handling and logging

### API Design
- RESTful endpoints under `/api/` prefix
- Proper HTTP status codes
- JSON responses with consistent structure
- CORS headers for frontend access

### Caching Strategy
- Cache hiscores data for 1 hour (3600 seconds)
- Cache recent searches for 24 hours
- Use username as lowercase key for consistency

### Frontend Guidelines
- Vanilla JavaScript (no frameworks)
- Responsive design for mobile and desktop
- Progressive enhancement
- Proper error handling and loading states

## Code Style Preferences

- Use `async/await` instead of `.then()` chains
- Prefer `const` over `let` when possible
- Use template literals for string interpolation
- Include JSDoc comments for functions
- Handle errors gracefully with try/catch blocks

## Common Patterns

### KV Operations
```javascript
// Store with TTL
await env.HISCORES_KV.put(key, JSON.stringify(data), {
  expirationTtl: 3600
});

// Retrieve and parse
const value = await env.HISCORES_KV.get(key);
const data = value ? JSON.parse(value) : null;
```

### Response Handling
```javascript
return new Response(JSON.stringify(data), {
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*'
  }
});
```

### OSRS Data Parsing
- Skills data comes as CSV format from OSRS API
- First 24 lines are skill data (rank, level, experience)
- Handle missing or invalid data gracefully

## Testing Approach

- Use the `/api/mock` endpoint for development
- Test with real OSRS usernames
- Verify caching behavior
- Test error scenarios (invalid usernames, API failures)

## Deployment Notes

- Configure KV namespace IDs in `wrangler.toml`
- Use environment variables for configuration
- Set up cron triggers for maintenance tasks
- Monitor worker performance and error rates

When working on this project, prioritize:
1. **Performance**: Efficient caching and minimal API calls
2. **Reliability**: Proper error handling and fallbacks
3. **User Experience**: Fast loading and clear feedback
4. **Maintainability**: Clean, documented code structure
