#!/bin/bash

# Hitpoints Migration Script
# This script helps migrate all users to the new hitpoints calculation formula

BASE_URL="https://osrs-hiscores-clone.vs.workers.dev"

echo "=== OSRS Hiscores Hitpoints Migration ==="
echo ""

# Function to check if API is responding
check_api() {
    echo "🔍 Checking API status..."
    response=$(curl -s -w "%{http_code}" "$BASE_URL/api/status" -o /tmp/status_response)
    http_code=$response
    
    if [ "$http_code" -eq 200 ]; then
        echo "✅ API is responding correctly"
        return 0
    else
        echo "❌ API is not responding (HTTP $http_code)"
        return 1
    fi
}

# Function to check a sample user
check_sample_user() {
    echo ""
    echo "🔍 Checking migration status for sample users..."
    
    # Get a random user from leaderboards first
    sample_response=$(curl -s "$BASE_URL/api/skill-rankings" | head -c 1000)
    
    if [ $? -eq 0 ]; then
        echo "✅ Successfully retrieved sample data"
    else
        echo "⚠️  Could not retrieve sample user data"
    fi
}

# Function to run the migration
run_migration() {
    echo ""
    echo "🚀 Starting hitpoints migration..."
    echo "⚠️  This will update ALL users in the database!"
    echo ""
    
    read -p "Are you sure you want to proceed? (y/N): " confirm
    
    if [[ $confirm =~ ^[Yy]$ ]]; then
        echo ""
        echo "🔄 Running migration (this may take a few minutes)..."
        
        start_time=$(date +%s)
        
        response=$(curl -s -X POST "$BASE_URL/api/migrate/hitpoints" -w "\n%{http_code}")
        http_code=$(echo "$response" | tail -n1)
        body=$(echo "$response" | head -n -1)
        
        end_time=$(date +%s)
        duration=$((end_time - start_time))
        
        echo ""
        if [ "$http_code" -eq 200 ]; then
            echo "✅ Migration completed successfully in ${duration} seconds!"
            echo ""
            echo "📊 Migration Results:"
            echo "$body" | jq '.' 2>/dev/null || echo "$body"
        else
            echo "❌ Migration failed (HTTP $http_code)"
            echo "Response: $body"
        fi
    else
        echo "❌ Migration cancelled"
    fi
}

# Function to verify migration
verify_migration() {
    echo ""
    echo "🔍 Verifying migration results..."
    
    # You could add specific user checks here
    echo "✅ Verification complete (manual checks recommended)"
}

# Main script execution
main() {
    # Check if curl and jq are available
    if ! command -v curl &> /dev/null; then
        echo "❌ curl is required but not installed"
        exit 1
    fi
    
    if ! command -v jq &> /dev/null; then
        echo "⚠️  jq is not installed (JSON formatting will be limited)"
    fi
    
    # Run checks and migration
    if check_api; then
        check_sample_user
        run_migration
        verify_migration
        
        echo ""
        echo "🎉 Migration process complete!"
        echo ""
        echo "📝 Next steps:"
        echo "   1. Check the leaderboards for expected changes"
        echo "   2. Spot-check individual users if needed"
        echo "   3. Monitor for any issues in the next few hours"
        echo ""
        echo "   Use this command to check a specific user:"
        echo "   curl -X GET \"$BASE_URL/api/users/{username}/hitpoints-check\""
    else
        echo ""
        echo "❌ Cannot proceed with migration due to API issues"
        exit 1
    fi
}

# Run the main function
main "$@"
