import express from 'express';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3000;

// Firebase Cloud Functions base URL
const FIREBASE_FUNCTIONS_URL = 'https://us-central1-gen-lang-client-0856016385.cloudfunctions.net';

// CORS middleware for API routes
const corsMiddleware = (req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  // Handle preflight OPTIONS request
  if (req.method === 'OPTIONS') {
    return res.status(204).send('');
  }
  next();
};

// Parse JSON bodies
app.use(express.json());

// Apply CORS to all /api routes
app.use('/api', corsMiddleware);

// API Proxy: Forward /api/* requests to Firebase Cloud Functions
app.post('/api/:functionName', async (req, res) => {
  const { functionName } = req.params;
  const targetUrl = `${FIREBASE_FUNCTIONS_URL}/${functionName}`;

  console.log(`[API Proxy] Forwarding request to: ${targetUrl}`);

  try {
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });

    const data = await response.json();
    res.status(response.status).json(data);
  } catch (error) {
    console.error(`[API Proxy] Error for ${functionName}:`, error);
    res.status(500).json({ error: { message: 'Proxy request failed' } });
  }
});

// Serve static files  
app.use(express.static(join(__dirname, 'dist')));  
// SPA fallback  
app.use((req, res) => {  
  res.sendFile(join(__dirname, 'dist', 'index.html'));  
});  
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
