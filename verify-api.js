
import { app } from './server.js';
import http from 'http';

// Mock API Key to bypass startup check
// Note: This must be done before import if possible, but since we use ES modules, 
// the import happens first. 
// However, in server.js, we can see if it reads process.env at top level.
// Yes, line 11: const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
// Line 13: if (!GEMINI_API_KEY) throw ...
// So we MUST set it before running this script. 
// Usage: set GEMINI_API_KEY=test && node verify-api.js

const server = http.createServer(app);

server.listen(0, async () => {
    const port = server.address().port;
    const baseUrl = `http://localhost:${port}`;
    console.log(`Test server running at ${baseUrl}`);

    const endpoints = [
        '/api/generateResearchPlan',
        '/api/refineResearchPlan',
        '/api/analyzeTranscripts',
        '/api/generateProjectReport'
    ];

    let allPassed = true;

    for (const endpoint of endpoints) {
        try {
            const res = await fetch(`${baseUrl}${endpoint}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ data: {} })
            });
            
            if (res.status === 404) {
                console.error(`❌ ${endpoint} NOT FOUND (404)`);
                allPassed = false;
            } else {
                console.log(`✅ ${endpoint} FOUND (Status: ${res.status})`);
            }
        } catch (e) {
            console.error(`❌ ${endpoint} Connection Error:`, e);
            allPassed = false;
        }
    }

    server.close();
    if (allPassed) {
        console.log('All API endpoints verified.');
        process.exit(0);
    } else {
        console.error('Some endpoints failed.');
        process.exit(1);
    }
});
