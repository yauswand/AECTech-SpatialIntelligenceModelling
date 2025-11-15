# Office Renovation App Setup Guide

## Overview
This application provides two modes:
1. **PLY Viewer** - Original 3D point cloud viewer
2. **Renovation App** - AI-powered office renovation tool with image generation and shopping list

## Environment Variables Setup

Create a `.env` file in the root directory with the following variables:

```env
# Replicate API Configuration
VITE_REPLICATE_API_TOKEN=your_replicate_api_token_here

# Google Custom Search API Configuration
VITE_GOOGLE_SEARCH_API_KEY=your_google_search_api_key_here
VITE_GOOGLE_SEARCH_ENGINE_ID=your_custom_search_engine_id_here
```

### Getting API Keys

#### Replicate API Token
1. Sign up at [replicate.com](https://replicate.com)
2. Go to your account settings
3. Generate an API token
4. Copy the token to `VITE_REPLICATE_API_TOKEN`

**Note:** You'll need to find the correct model identifier for Gemini Flash 2.0 on Replicate. Update the model IDs in `src/services/replicateService.js`:
- `generateRoomImage()` method
- `identifyFurniture()` method

#### Google Custom Search API
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing one
3. Enable the "Custom Search API"
4. Create credentials (API Key)
5. Set up a Custom Search Engine at [programmablesearchengine.google.com](https://programmablesearchengine.google.com)
6. Copy the API Key to `VITE_GOOGLE_SEARCH_API_KEY`
7. Copy the Search Engine ID to `VITE_GOOGLE_SEARCH_ENGINE_ID`

## Installation

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file with your API keys (see above)

3. Start development server:
```bash
npm run dev
```

4. Open the application in your browser (typically `http://localhost:5173`)

## Usage

### Switching Modes
Use the toggle at the top of the page to switch between:
- **PLY Viewer** - For 3D point cloud visualization
- **Renovation App** - For office renovation workflow

### Renovation App Workflow

1. **Upload Room Image**
   - Click "Upload Image" button in the left panel
   - Select a room image from your device

2. **Describe Renovation**
   - Type your renovation preferences in the chatbot (right panel)
   - Or upload a reference image for inspiration
   - Click "Send" or press Enter

3. **View Generated Room**
   - The AI will generate a renovated version of your room
   - Furniture items will be automatically identified with bounding boxes

4. **Shopping List**
   - After furniture identification, a shopping list will appear
   - Click on product links to view items for purchase

## Project Structure

```
src/
├── main.js                 # PLY viewer main (existing)
├── renovation-app.js       # Renovation app orchestrator
├── components/
│   ├── ModeToggle.js      # Mode switcher component
│   ├── ImageViewer.js     # Image display with bounding boxes
│   ├── Chatbot.js          # Chat interface component
│   └── ShoppingList.js    # Shopping list display
└── services/
    ├── replicateService.js # Replicate API integration
    ├── visionService.js    # Furniture identification
    └── shoppingService.js  # Google Shopping integration
```

## Troubleshooting

### API Errors
- Ensure all environment variables are set correctly
- Check that API keys are valid and have proper permissions
- Verify Replicate model identifiers are correct

### Image Generation Issues
- Make sure the uploaded image is in a supported format (JPG, PNG)
- Check browser console for detailed error messages
- Verify Replicate API token has sufficient credits

### Shopping List Not Appearing
- Ensure Google Custom Search API is enabled
- Verify Search Engine ID is correct
- Check that the Custom Search Engine is configured to search the web

## Notes

- The Replicate model identifiers for Gemini Flash 2.0 need to be updated once the exact model names are confirmed
- Placeholder UI elements are used until Figma designs are provided
- All API calls are made from the frontend - consider adding a backend proxy for production use

