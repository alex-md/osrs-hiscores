# Hitpoints Formula Migration Guide

## Overview

This guide explains how to migrate all existing users to the new hitpoints calculation formula. The new formula calculates hitpoints XP as 1/3 of all non-hitpoints combat XP (Attack, Strength, Defence, Ranged, Prayer, Magic).

## Previous Formula
```
HP XP = (All Combat XP including HP / 4) * 1.3
```

## New Formula
```
HP XP = (Non-HP Combat XP) / 3
```

## Migration Process

### 1. Check Deployment Status
First, verify that the new code is deployed:
```bash
curl -X GET "https://osrs-hiscores-clone.vs.workers.dev/api/status"
```

### 2. Check a Specific User's Migration Status (Optional)
Before running the full migration, you can check if a specific user needs migration:
```bash
curl -X GET "https://osrs-hiscores-clone.vs.workers.dev/api/users/{username}/hitpoints-check"
```

Example:
```bash
curl -X GET "https://osrs-hiscores-clone.vs.workers.dev/api/users/SampleUser/hitpoints-check"
```

This will return:
```json
{
  "username": "SampleUser",
  "currentHpXp": 150000,
  "expectedHpXp": 120000,
  "needsMigration": true,
  "difference": -30000
}
```

### 3. Run the Full Migration
**⚠️ Important: This process will update ALL users in the database. Make sure you're ready to proceed.**

Execute the migration:
```bash
curl -X POST "https://osrs-hiscores-clone.vs.workers.dev/api/migrate/hitpoints"
```

### Using PowerShell (Windows)
```powershell
Invoke-RestMethod -Uri "https://osrs-hiscores-clone.vs.workers.dev/api/migrate/hitpoints" -Method POST
```

### 4. Monitor Migration Progress
The migration will process users in batches of 50, with database updates in batches of 25. The response will include:

```json
{
  "totalProcessed": 1000,
  "totalMigrated": 850,
  "migrationComplete": true,
  "timestamp": "2025-07-24T03:30:00.000Z"
}
```

- `totalProcessed`: Total number of users checked
- `totalMigrated`: Number of users that actually needed updates
- `migrationComplete`: Whether the process finished successfully
- `timestamp`: When the migration completed

### 5. Verify Migration Results
After migration, the system will automatically regenerate all leaderboards to reflect the changes.

You can spot-check users again:
```bash
curl -X GET "https://osrs-hiscores-clone.vs.workers.dev/api/users/{username}/hitpoints-check"
```

The response should show `"needsMigration": false` for migrated users.

## What Happens During Migration

1. **User Processing**: Each user is checked to see if their current HP XP matches what it should be under the new formula
2. **HP Recalculation**: For users who need it, HP XP is recalculated using the new formula: `(Non-HP Combat XP) / 3`
3. **Level Updates**: HP levels are recalculated based on the new XP values
4. **Database Updates**: Changes are saved in batches for efficiency
5. **Leaderboard Regeneration**: All skill rankings and leaderboards are updated to reflect the changes

## Expected Impact

- **Users with high combat stats**: Will likely see their HP XP decrease (the new formula generally gives lower HP XP)
- **Users with low combat stats**: Minimal impact
- **Combat level**: May decrease for some high-level combat players
- **Leaderboards**: Rankings may shift, especially for hitpoints skill rankings

## Rollback Considerations

There is no automatic rollback mechanism. If you need to revert:
1. Deploy the old code version
2. Run another migration with the old formula
3. Regenerate leaderboards

## Troubleshooting

### Migration Takes Too Long
The migration processes users in batches to avoid memory issues and timeouts. For very large databases (10,000+ users), consider:
- Running during low-traffic periods
- Monitoring Cloudflare Worker execution limits

### Partial Migration
If the migration fails partway through, you can safely run it again. The migration function checks each user and only updates those who need it.

### Verification
After migration, you can verify the changes by:
1. Checking specific users with the hitpoints-check endpoint
2. Reviewing the leaderboards for expected changes
3. Monitoring for any error logs in the Cloudflare Worker dashboard

## Support

If you encounter issues during migration:
1. Check the Cloudflare Worker logs for error details
2. Verify the API endpoints are responding correctly
3. Test with individual users using the hitpoints-check endpoint
