# CORS Fix - Backend Proxy Setup

## Problem
Replicate API doesn't allow direct browser calls due to CORS policy. We need a backend proxy server.

## Solution
A simple Express.js proxy server that handles Replicate API calls server-side.

## Setup Steps

### 1. Install New Dependencies

```bash
npm install
```

This will install:
- `express` - Web server framework
- `cors` - CORS middleware
- `dotenv` - Environment variable loader

### 2. Make Sure Your .env File Has the Token

Your `.env` file should have:
```env
VITE_REPLICATE_API_TOKEN=r8_your_token_here
```

The backend server will read this automatically.

### 3. Run Both Servers

You need to run TWO servers:

**Terminal 1 - Backend Proxy Server:**
```bash
npm run server
```
This starts the proxy on http://localhost:3000

**Terminal 2 - Frontend Dev Server:**
```bash
npm run dev
```
This starts Vite on http://localhost:5173 (or 5174, etc.)

### 4. Open Your Browser

Go to: http://localhost:5173 (or whatever port Vite shows)

## Alternative: Run Both Together (Optional)

If you want to run both servers with one command, install `concurrently`:

```bash
npm install --save-dev concurrently
```

Then run:
```bash
npm run dev:full
```

This runs both servers simultaneously.

## How It Works

1. Frontend makes request to `/api/replicate/predictions` (your proxy)
2. Proxy server forwards request to Replicate API (server-to-server, no CORS)
3. Proxy polls for completion
4. Proxy returns final result to frontend

## Troubleshooting

### "Cannot connect to proxy"
- Make sure the backend server is running on port 3000
- Check that no other app is using port 3000

### "Replicate API token not configured"
- Check your `.env` file has `VITE_REPLICATE_API_TOKEN`
- Restart the backend server after changing `.env`

### Port Already in Use
- Change PORT in `.env`: `PORT=3001`
- Or kill the process using port 3000

## Production

For production, build the frontend and run the server:

```bash
npm run build
npm start
```

The server will serve both the API proxy and the static frontend files.

