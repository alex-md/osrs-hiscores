# Hitpoints Migration Script (PowerShell)
# This script helps migrate all users to the new hitpoints calculation formula

$BaseUrl = "https://osrs-hiscores-clone.vs.workers.dev"

Write-Host "=== OSRS Hiscores Hitpoints Migration ===" -ForegroundColor Cyan
Write-Host ""

# Function to check if API is responding
function Test-ApiStatus {
    Write-Host "🔍 Checking API status..." -ForegroundColor Blue
    
    try {
        $response = Invoke-RestMethod -Uri "$BaseUrl/api/status" -Method GET -TimeoutSec 10
        Write-Host "✅ API is responding correctly" -ForegroundColor Green
        return $true
    }
    catch {
        Write-Host "❌ API is not responding: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Function to check sample user migration status
function Test-SampleUser {
    Write-Host ""
    Write-Host "🔍 Checking sample migration data..." -ForegroundColor Blue
    
    try {
        $rankings = Invoke-RestMethod -Uri "$BaseUrl/api/skill-rankings" -Method GET -TimeoutSec 15
        if ($rankings.totalLevel -and $rankings.totalLevel.Count -gt 0) {
            $sampleUsername = $rankings.totalLevel[0].username
            Write-Host "✅ Found sample user: $sampleUsername" -ForegroundColor Green
            
            # Check this user's migration status
            try {
                $migrationCheck = Invoke-RestMethod -Uri "$BaseUrl/api/users/$sampleUsername/hitpoints-check" -Method GET
                Write-Host "   Current HP XP: $($migrationCheck.currentHpXp)" -ForegroundColor Yellow
                Write-Host "   Expected HP XP: $($migrationCheck.expectedHpXp)" -ForegroundColor Yellow
                Write-Host "   Needs Migration: $($migrationCheck.needsMigration)" -ForegroundColor $(if ($migrationCheck.needsMigration) { "Red" } else { "Green" })
            }
            catch {
                Write-Host "⚠️  Could not check migration status for sample user" -ForegroundColor Yellow
            }
        }
        else {
            Write-Host "⚠️  Could not retrieve sample user data" -ForegroundColor Yellow
        }
    }
    catch {
        Write-Host "⚠️  Could not retrieve leaderboard data: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

# Function to run the migration
function Start-Migration {
    Write-Host ""
    Write-Host "🚀 Starting hitpoints migration..." -ForegroundColor Blue
    Write-Host "⚠️  This will update ALL users in the database!" -ForegroundColor Yellow
    Write-Host ""
    
    $confirm = Read-Host "Are you sure you want to proceed? (y/N)"
    
    if ($confirm -match '^[Yy]$') {
        Write-Host ""
        Write-Host "🔄 Running migration (this may take a few minutes)..." -ForegroundColor Blue
        
        $startTime = Get-Date
        
        try {
            $response = Invoke-RestMethod -Uri "$BaseUrl/api/migrate/hitpoints" -Method POST -TimeoutSec 300
            $endTime = Get-Date
            $duration = ($endTime - $startTime).TotalSeconds
            
            Write-Host ""
            Write-Host "✅ Migration completed successfully in $([math]::Round($duration, 2)) seconds!" -ForegroundColor Green
            Write-Host ""
            Write-Host "📊 Migration Results:" -ForegroundColor Cyan
            Write-Host "   Total Processed: $($response.totalProcessed)" -ForegroundColor White
            Write-Host "   Total Migrated: $($response.totalMigrated)" -ForegroundColor White
            Write-Host "   Migration Complete: $($response.migrationComplete)" -ForegroundColor White
            Write-Host "   Timestamp: $($response.timestamp)" -ForegroundColor White
            
            return $true
        }
        catch {
            Write-Host ""
            Write-Host "❌ Migration failed: $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }
    }
    else {
        Write-Host "❌ Migration cancelled" -ForegroundColor Red
        return $false
    }
}

# Function to verify migration results
function Test-MigrationResults {
    Write-Host ""
    Write-Host "🔍 Verifying migration results..." -ForegroundColor Blue
    
    try {
        # Re-check our sample user
        $rankings = Invoke-RestMethod -Uri "$BaseUrl/api/skill-rankings" -Method GET -TimeoutSec 15
        if ($rankings.totalLevel -and $rankings.totalLevel.Count -gt 0) {
            $sampleUsername = $rankings.totalLevel[0].username
            $migrationCheck = Invoke-RestMethod -Uri "$BaseUrl/api/users/$sampleUsername/hitpoints-check" -Method GET
            
            if (-not $migrationCheck.needsMigration) {
                Write-Host "✅ Sample user verification passed" -ForegroundColor Green
            }
            else {
                Write-Host "⚠️  Sample user still needs migration" -ForegroundColor Yellow
            }
        }
    }
    catch {
        Write-Host "⚠️  Could not verify migration results" -ForegroundColor Yellow
    }
}

# Main script execution
function Main {
    Write-Host "Starting migration process..." -ForegroundColor White
    
    if (Test-ApiStatus) {
        Test-SampleUser
        
        if (Start-Migration) {
            Test-MigrationResults
            
            Write-Host ""
            Write-Host "🎉 Migration process complete!" -ForegroundColor Green
            Write-Host ""
            Write-Host "📝 Next steps:" -ForegroundColor Cyan
            Write-Host "   1. Check the leaderboards for expected changes" -ForegroundColor White
            Write-Host "   2. Spot-check individual users if needed" -ForegroundColor White
            Write-Host "   3. Monitor for any issues in the next few hours" -ForegroundColor White
            Write-Host ""
            Write-Host "   Use this command to check a specific user:" -ForegroundColor Yellow
            Write-Host "   Invoke-RestMethod -Uri `"$BaseUrl/api/users/{username}/hitpoints-check`" -Method GET" -ForegroundColor Gray
        }
    }
    else {
        Write-Host ""
        Write-Host "❌ Cannot proceed with migration due to API issues" -ForegroundColor Red
        exit 1
    }
}

# Run the main function
Main
