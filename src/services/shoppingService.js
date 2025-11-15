// Shopping Service - Google Custom Search API integration
const GOOGLE_SEARCH_API_URL = 'https://www.googleapis.com/customsearch/v1';

export class ShoppingService {
    constructor(apiKey, searchEngineId) {
        this.apiKey = apiKey;
        this.searchEngineId = searchEngineId;
        
        if (!apiKey || !searchEngineId) {
            console.warn('Google Search API credentials not provided. Set VITE_GOOGLE_SEARCH_API_KEY and VITE_GOOGLE_SEARCH_ENGINE_ID environment variables.');
        }
    }

    async searchProducts(query, maxResults = 5) {
        if (!this.apiKey || !this.searchEngineId) {
            throw new Error('Google Search API credentials not configured');
        }

        try {
            const url = new URL(GOOGLE_SEARCH_API_URL);
            url.searchParams.append('key', this.apiKey);
            url.searchParams.append('cx', this.searchEngineId);
            url.searchParams.append('q', query);
            url.searchParams.append('num', maxResults.toString());
            url.searchParams.append('safe', 'active');

            const response = await fetch(url.toString());
            
            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error?.message || 'Search failed');
            }

            const data = await response.json();
            
            // Format results
            return (data.items || []).map(item => ({
                title: item.title,
                url: item.link,
                snippet: item.snippet,
                displayLink: item.displayLink
            }));
        } catch (error) {
            console.error('Google Search API error:', error);
            throw error;
        }
    }

    async searchFurniture(furnitureItem) {
        // Create search query from furniture name and description
        const query = `${furnitureItem.name} ${furnitureItem.description || ''} furniture buy`.trim();
        return await this.searchProducts(query);
    }

    async generateShoppingList(furnitureItems) {
        const shoppingList = [];
        
        for (const item of furnitureItems) {
            try {
                const searchResults = await this.searchFurniture(item);
                shoppingList.push({
                    name: item.name,
                    description: item.description,
                    links: searchResults.map(result => ({
                        title: result.title,
                        url: result.url,
                        snippet: result.snippet
                    }))
                });
            } catch (error) {
                console.error(`Failed to search for ${item.name}:`, error);
                // Add item without links if search fails
                shoppingList.push({
                    name: item.name,
                    description: item.description,
                    links: []
                });
            }
        }
        
        return shoppingList;
    }
}

