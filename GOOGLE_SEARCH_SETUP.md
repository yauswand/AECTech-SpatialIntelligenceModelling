# Google Custom Search API Setup Guide

## Overview
To enable the shopping list feature, you need two things from Google:
1. **API Key** - For authenticating requests
2. **Custom Search Engine ID** - Your search engine configuration

## Step-by-Step Setup

### Part 1: Create Google Cloud Project & Enable API

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com
   - Sign in with your Google account

2. **Create a New Project** (or select existing)
   - Click the project dropdown at the top
   - Click "New Project"
   - Name it something like "Office Renovation App"
   - Click "Create"
   - Wait for project creation (may take a minute)

3. **Enable Custom Search API**
   - In the left sidebar, go to "APIs & Services" → "Library"
   - Search for "Custom Search API"
   - Click on "Custom Search API"
   - Click the "Enable" button
   - Wait for it to enable

4. **Create API Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "API Key"
   - A popup will show your API key - **COPY THIS KEY** (you'll need it)
   - Click "Restrict Key" (recommended for security)
     - Under "API restrictions", select "Restrict key"
     - Check "Custom Search API"
     - Click "Save"
   - **Note**: You can also use "None" for restrictions if testing, but restrict it for production

### Part 2: Create Custom Search Engine

1. **Go to Programmable Search Engine**
   - Visit: https://programmablesearchengine.google.com
   - Sign in with the same Google account

2. **Create a New Search Engine**
   - Click "Add" or "Create a custom search engine"
   - Fill in the form:
     - **Sites to search**: Enter `*` (asterisk) to search the entire web
       - Or specific sites like: `amazon.com, wayfair.com, ikea.com` for furniture shopping
     - **Name**: "Office Renovation Shopping" (or any name you like)
     - **Language**: English (or your preference)
   - Click "Create"

3. **Get Your Search Engine ID**
   - After creation, you'll see your search engine listed
   - Click "Control Panel" or click on your search engine name
   - Look for "Search engine ID" - **COPY THIS ID** (looks like: `012345678901234567890:abcdefghijk`)
   - This is your `VITE_GOOGLE_SEARCH_ENGINE_ID`

4. **Configure Search Settings** (Optional but Recommended)
   - In the Control Panel, go to "Setup" → "Basics"
   - Enable "Search the entire web"
   - Under "Advanced", you can:
     - Enable "Image search"
     - Set up safe search settings
   - Click "Save"

### Part 3: Update Your .env File

1. **Open your `.env` file** in the project root

2. **Add your credentials**:
   ```env
   VITE_REPLICATE_API_TOKEN=your_replicate_token_here
   VITE_GOOGLE_SEARCH_API_KEY=your_api_key_from_step_4
   VITE_GOOGLE_SEARCH_ENGINE_ID=your_search_engine_id_from_step_3
   ```

3. **Save the file**

### Part 4: Test the Setup

1. **Restart your dev server** (if running):
   ```bash
   # Stop the server (Ctrl+C) and restart
   npm run dev
   ```

2. **Test in the app**:
   - Upload a room image
   - Let it identify furniture
   - The shopping list should now show product links

## Troubleshooting

### "API key not valid" error
- Make sure you copied the entire API key (starts with `AIza...`)
- Check that Custom Search API is enabled in your project
- Verify the API key restrictions allow Custom Search API

### "Search engine ID not found" error
- Double-check you copied the entire Search Engine ID
- Make sure you're using the ID from the Control Panel, not the URL

### "Quota exceeded" error
- Google Custom Search API has a free tier: 100 queries per day
- After that, it's $5 per 1,000 queries
- Check your usage in Google Cloud Console → APIs & Services → Dashboard

### No search results appearing
- Make sure your Search Engine is configured to "Search the entire web"
- Check that safe search settings aren't too restrictive
- Verify the search queries are working in the Programmable Search Engine test interface

## Cost Information

- **Free Tier**: 100 search queries per day
- **Paid**: $5 per 1,000 queries after free tier
- **Billing**: Set up billing in Google Cloud Console if you expect to exceed free tier

## Security Best Practices

1. **Restrict your API key** to only Custom Search API
2. **Add HTTP referrer restrictions** (optional):
   - In API key settings, add your domain (e.g., `localhost:5173` for dev)
   - This prevents unauthorized use
3. **Don't commit `.env` file** to git (already in `.gitignore`)

## Alternative: Use Without Google Search

If you don't want to set up Google Search API right now:
- The app will still work for image generation and furniture detection
- Shopping list feature will show an error, but you can add that later
- You can test everything else without these keys

## Quick Reference

- **Google Cloud Console**: https://console.cloud.google.com
- **Custom Search Engine**: https://programmablesearchengine.google.com
- **API Documentation**: https://developers.google.com/custom-search/v1/overview

