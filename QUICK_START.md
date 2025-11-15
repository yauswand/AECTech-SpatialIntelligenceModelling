# Quick Start Guide

## Step 1: Install Dependencies

First time setup - install all required packages:

```bash
npm install
```

This will install:
- `three` - 3D graphics library (for PLY viewer)
- `vite` - Development server and build tool

## Step 2: Set Up API Keys

Edit the `.env` file in the project root and add your API keys:

```env
# Required for Renovation App
VITE_REPLICATE_API_TOKEN=r8_your_replicate_token_here

# Optional - Required for Shopping List feature
VITE_GOOGLE_SEARCH_API_KEY=your_google_api_key_here
VITE_GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id_here
```

**Note**: You can run the app without Google Search keys - everything except the shopping list will work.

## Step 3: Start the Development Server

```bash
npm run dev
```

You should see output like:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:5173/
  ➜  Network: use --host to expose
```

## Step 4: Open in Browser

Open your browser and go to:
```
http://localhost:5173
```

## What You'll See

1. **Mode Toggle** at the top - Switch between:
   - **PLY Viewer** - Original 3D point cloud viewer
   - **Renovation App** - New office renovation tool

2. **Renovation App** (when selected):
   - **Left Panel**: Image viewer (upload room images here)
   - **Right Panel**: Chatbot interface (describe renovations here)

## Testing the Renovation App

1. Click "Renovation App" in the mode toggle
2. Click "Upload Image" in the left panel
3. Select a room image from your computer
4. In the chatbot (right panel), type something like:
   - "Make this room modern with contemporary furniture"
   - Or upload a reference image for inspiration
5. Click "Send" and wait for the AI to process

## Troubleshooting

### Port Already in Use
If port 5173 is busy, Vite will automatically use the next available port (5174, 5175, etc.)
Check the terminal output for the actual URL.

### API Errors
- Make sure your `.env` file has valid API keys
- Check that Replicate API token starts with `r8_`
- Verify Google Search keys if using shopping list feature

### Module Not Found Errors
Run `npm install` again to ensure all dependencies are installed.

## Stopping the Server

Press `Ctrl + C` in the terminal to stop the development server.

## Building for Production

To create a production build:

```bash
npm run build
```

The built files will be in the `dist/` directory.

To preview the production build:

```bash
npm run preview
```

