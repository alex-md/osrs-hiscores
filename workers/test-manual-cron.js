// Simple test to verify manual cron execution functionality
import { handleFetch } from './src/handlers.js';

// Mock environment object
const mockEnv = {
    HISCORES_KV: {
        get: async (key) => {
            console.log(`Mock KV get: ${key}`);
            return null;
        },
        put: async (key, value) => {
            console.log(`Mock KV put: ${key} = ${value}`);
        },
        list: async () => {
            console.log('Mock KV list');
            return { keys: [] };
        }
    }
};

// Mock context object
const mockCtx = {
    waitUntil: (promise) => promise
};

// Test the manual cron trigger endpoint
async function testManualCronTrigger() {
    console.log('Testing manual cron trigger...');

    const request = new Request('http://localhost:8787/api/cron/trigger', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    try {
        const response = await handleFetch(request, mockEnv);
        const responseText = await response.text();
        console.log('Response status:', response.status);
        console.log('Response body:', responseText);

        if (response.status === 200) {
            console.log('✅ Manual cron trigger test passed!');
        } else {
            console.log('❌ Manual cron trigger test failed!');
        }
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    }
}

// Test the cron status endpoint
async function testCronStatus() {
    console.log('Testing cron status endpoint...');

    const request = new Request('http://localhost:8787/api/cron/status', {
        method: 'GET'
    });

    try {
        const response = await handleFetch(request, mockEnv);
        const responseText = await response.text();
        console.log('Response status:', response.status);
        console.log('Response body:', responseText);

        if (response.status === 200) {
            console.log('✅ Cron status test passed!');
        } else {
            console.log('❌ Cron status test failed!');
        }
    } catch (error) {
        console.error('❌ Test failed with error:', error);
    }
}

// Run tests
console.log('Starting manual cron tests...\n');
await testCronStatus();
console.log('\n');
await testManualCronTrigger();
