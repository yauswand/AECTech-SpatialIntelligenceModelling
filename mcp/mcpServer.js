import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { QdrantClient } from '@qdrant/js-client-rest';
import OpenAI from 'openai';
import { z } from 'zod';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env file from project root
dotenv.config({ path: resolve(__dirname, '../.env') });

// Validate environment variables
if (!process.env.QDRANT_URL) {
    console.error("ERROR: QDRANT_URL environment variable is not set!");
    console.error("Please set QDRANT_URL in your .env file or environment variables.");
    process.exit(1);
}

if (!process.env.VITE_OPENAI_API_KEY) {
    console.error("ERROR: VITE_OPENAI_API_KEY environment variable is not set!");
    console.error("Please set VITE_OPENAI_API_KEY in your .env file or environment variables.");
    process.exit(1);
}

// Initialize clients
const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const openai = new OpenAI({
    apiKey: process.env.VITE_OPENAI_API_KEY,
});

const DEFAULT_COLLECTION = "dummy";
const EMBED_DIM = 1536; // text-embedding-3-small

const mcpServer = new McpServer({
    name: "3D Point Cloud Viewer",
    version: "1.0.0",
}, {
    capabilities: {
        resources: {},
    tools: {},
    },
});

// Register resource template for Qdrant collections
mcpServer.resource(
    "Qdrant Collection",
    new ResourceTemplate("qdrant://collection/{collectionName}", {
        list: async () => {
            try {
                const collections = await qdrantClient.getCollections();
                return {
                    resources: collections.collections.map(collection => ({
                        uri: `qdrant://collection/${collection.name}`,
                        name: collection.name,
                        description: `Qdrant collection: ${collection.name} (${collection.points_count || 0} points)`,
                        mimeType: "application/json",
                    })),
                };
            } catch (error) {
                const qdrantUrl = process.env.QDRANT_URL || 'not set';
                console.error(`Error listing Qdrant collections (QDRANT_URL: ${qdrantUrl}):`, error.message);
                throw new Error(`Failed to connect to Qdrant at ${qdrantUrl}. Please ensure Qdrant is running and QDRANT_URL is correct.`);
            }
        },
    }),
    {
        description: "A Qdrant vector database collection",
        mimeType: "application/json",
    },
    async (uri, variables) => {
        const collectionName = variables.collectionName;
        
        try {
            // Get collection info
            const collectionInfo = await qdrantClient.getCollection(collectionName);
            
            // Get sample points from the collection
            const scrollResult = await qdrantClient.scroll(collectionName, {
                limit: 100,
                with_payload: true,
                with_vector: false,
            });
            
            return {
                contents: [
                    {
                        uri: uri.toString(),
                        mimeType: "application/json",
                        text: JSON.stringify({
                            name: collectionName,
                            info: collectionInfo,
                            points: scrollResult.points,
                            totalPoints: collectionInfo.points_count,
                        }, null, 2),
                    },
                ],
            };
        } catch (error) {
            console.error(`Error reading collection ${collectionName}:`, error);
            throw error;
        }
    }
);

// Helper function to embed text
async function embedText(text) {
    const resp = await openai.embeddings.create({
        model: "text-embedding-3-small",
        input: text,
    });
    return resp.data[0].embedding;
}

// Helper function to analyze query intent
function analyzeQueryIntent(query) {
    const lowerQuery = query.toLowerCase();
    
    // Count queries
    if (lowerQuery.match(/\b(how many|number of|count|total)\b/)) {
        return { type: 'count', query };
    }
    
    // Property queries (check first - if we have property + object, it's a property query)
    // Match both singular and plural forms
    const hasProperty = /\b(colors?|colours?|materials?|rooms?|dimensions?|sizes?)\b/.test(lowerQuery);
    const hasObject = /\b(chairs?|desks?|tables?|sofas?|beds?|lamps?|cabinets?|shelves?|doors?|windows?)\b/.test(lowerQuery);
    
    if (hasProperty && hasObject) {
        return { type: 'property', query };
    }
    
    if (hasProperty) {
        return { type: 'property', query };
    }
    
    // List queries
    if (lowerQuery.match(/\b(list|all|show|what are|which)\b/)) {
        return { type: 'list', query };
    }
    
    // Default to search
    return { type: 'search', query };
}

// Helper function to extract property from query
function extractProperty(query) {
    const lowerQuery = query.toLowerCase();
    if (lowerQuery.includes('color') || lowerQuery.includes('colour')) return 'color';
    if (lowerQuery.includes('material')) return 'material';
    if (lowerQuery.includes('room')) return 'room';
    if (lowerQuery.includes('dimension') || lowerQuery.includes('size')) return 'dimensions';
    return null;
}

// Helper function to extract object type from query
function extractObjectType(query) {
    const lowerQuery = query.toLowerCase();
    const objectTypes = ['chair', 'desk', 'table', 'sofa', 'bed', 'lamp', 'cabinet', 'shelf', 'door', 'window'];
    
    for (const objType of objectTypes) {
        // Check for plural form first
        if (lowerQuery.includes(objType + 's')) {
            return { type: objType, isPlural: true };
        }
        // Check for singular form
        if (lowerQuery.includes(objType)) {
            // Check if query suggests plural:
            // 1. Plural property words (colors, materials, etc.) - anywhere in query
            // 2. Context words (are, all, the, what are) before the object
            // 3. "of the" pattern before the object
            // 4. Property word after the object (e.g., "sofa colors")
            const hasPluralProperty = /\b(colors|materials|dimensions|sizes)\b/.test(lowerQuery);
            const beforeMatch = lowerQuery.substring(0, lowerQuery.indexOf(objType));
            const afterMatch = lowerQuery.substring(lowerQuery.indexOf(objType) + objType.length);
            const hasPluralContext = /\b(are|all|the|what are|of the)\b/.test(beforeMatch);
            const hasPropertyAfter = /\b(colors?|materials?|dimensions?|sizes?)\b/.test(afterMatch);
            const isPlural = hasPluralProperty || hasPluralContext || hasPropertyAfter;
            return { type: objType, isPlural };
        }
    }
    return null;
}

// Register query tool
mcpServer.tool(
    "query_spatial_data",
    "Query spatial intelligence data using natural language. Can answer questions about objects, their properties (color, material, room, dimensions), counts, and lists. Supports both singular and plural queries. Examples: 'number of chairs', 'color of desk', 'what are the colors of the sofas', 'list all materials', 'what objects are in the living room'",
    {
        query: z.string().describe("Natural language query about the spatial data"),
        collection: z.string().optional().default(DEFAULT_COLLECTION).describe("Qdrant collection name to search"),
        limit: z.number().optional().default(20).describe("Maximum number of results to return"),
    },
    async (args) => {
        const { query, collection, limit } = args;
        
        try {
            // Step 1: Analyze query intent
            const intent = analyzeQueryIntent(query);
            console.error(`[Query Intent] Type: ${intent.type}, Query: "${query}"`);
            
            // Debug: check what we detected
            if (intent.type === 'property') {
                const prop = extractProperty(query);
                const obj = extractObjectType(query);
                console.error(`[Debug] Property: ${prop}, Object:`, obj);
            }
            
            // Step 2: Embed the query
            const queryEmbedding = await embedText(query);
            
            // Step 3: Search Qdrant - use higher limit to get all matches
            const searchLimit = Math.max(limit, 100);
            const searchResults = await qdrantClient.search(collection, {
                vector: queryEmbedding,
                limit: searchLimit,
                with_payload: true,
                with_vector: false,
            });
            
            if (!searchResults || searchResults.length === 0) {
                // Fallback to LLM if no results
                console.error("[RAG] No results found, falling back to LLM");
                const llmResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful assistant. The user asked about spatial data, but no relevant data was found in the database. Provide a helpful response indicating that no data was found for their query.",
                        },
                        {
                            role: "user",
                            content: query,
                        },
                    ],
                    max_tokens: 200,
                });
                
                return {
                    content: [
                        {
                            type: "text",
                            text: llmResponse.choices[0].message.content,
                        },
                    ],
                    isError: false,
                };
            }
            
            // Step 4: Process results based on intent
            const results = searchResults.map(r => r.payload);
            
            if (intent.type === 'count') {
                const objectTypeInfo = extractObjectType(query);
                if (objectTypeInfo) {
                    const { type, isPlural } = objectTypeInfo;
                    const matching = results.filter(r => {
                        if (!r.name) return false;
                        const nameLower = r.name.toLowerCase();
                        return nameLower === type || nameLower === type + 's' || nameLower.includes(type);
                    });
                    const count = matching.length;
                    const pluralForm = isPlural ? type + 's' : type;
                    return {
                        content: [{ type: "text", text: `Found ${count} ${pluralForm} in the database.` }],
                        isError: false,
                    };
                } else {
                    return {
                        content: [{ type: "text", text: `Found ${results.length} matching object(s) in the database.` }],
                        isError: false,
                    };
                }
            }
            
            if (intent.type === 'list') {
                // Determine what to list
                if (query.toLowerCase().includes('material')) {
                    const materials = [...new Set(results.map(r => r.material).filter(Boolean))];
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Materials found: ${materials.join(', ')}`,
                            },
                        ],
                        isError: false,
                    };
                }
                if (query.toLowerCase().includes('color') || query.toLowerCase().includes('colour')) {
                    const colors = [...new Set(results.map(r => r.color).filter(Boolean))];
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Colors found: ${colors.join(', ')}`,
                            },
                        ],
                        isError: false,
                    };
                }
                if (query.toLowerCase().includes('room')) {
                    const rooms = [...new Set(results.map(r => r.room).filter(Boolean))];
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Rooms found: ${rooms.join(', ')}`,
                            },
                        ],
                        isError: false,
                    };
                }
                if (query.toLowerCase().includes('dimension') || query.toLowerCase().includes('size')) {
                    const dimensionsList = results
                        .filter(r => r.width !== undefined || r.height !== undefined || r.depth !== undefined)
                        .map(r => {
                            const name = r.name || 'Unknown';
                            const w = r.width ?? '?';
                            const h = r.height ?? '?';
                            const d = r.depth ?? '?';
                            return `${name}: ${w}m × ${h}m × ${d}m`;
                        });
                    if (dimensionsList.length > 0) {
                        return {
                            content: [
                                {
                                    type: "text",
                                    text: `Dimensions found:\n${dimensionsList.join('\n')}`,
                                },
                            ],
                            isError: false,
                        };
                    }
                }
                // List all objects
                const objects = results.map(r => r.name || 'Unknown').filter(Boolean);
                return {
                    content: [
                        {
                            type: "text",
                            text: `Objects found: ${objects.join(', ')}`,
                        },
                    ],
                    isError: false,
                };
            }
            
            if (intent.type === 'property') {
                const property = extractProperty(query);
                const objectTypeInfo = extractObjectType(query);
                
                console.error(`[Property Query] property: ${property}, objectTypeInfo:`, objectTypeInfo);
                
                if (property && objectTypeInfo) {
                    const { type, isPlural } = objectTypeInfo;
                    
                    // For property queries, always scroll to get ALL matching objects
                    // Semantic search might miss some or return mixed results
                    let matching = [];
                    try {
                        const allObjects = await qdrantClient.scroll(collection, {
                            limit: 1000,
                            with_payload: true,
                            with_vector: false,
                        });
                        matching = allObjects.points
                            .map(p => p.payload)
                            .filter(r => {
                                if (!r.name) return false;
                                const nameLower = r.name.toLowerCase().trim();
                                return nameLower === type || nameLower === type + 's' || nameLower.includes(type);
                            });
                        console.error(`[Property Query] Found ${matching.length} ${type}(s) after scrolling`);
                    } catch (err) {
                        console.error("Error scrolling collection:", err);
                        // Fallback to semantic search results
                        matching = results.filter(r => {
                            if (!r.name) return false;
                            const nameLower = r.name.toLowerCase().trim();
                            return nameLower === type || nameLower === type + 's' || nameLower.includes(type);
                        });
                    }
                    
                    if (matching.length > 0) {
                        // Get property values
                        const getValue = (r) => {
                            if (property === 'dimensions') {
                                if (r.width !== undefined || r.height !== undefined || r.depth !== undefined) {
                                    const w = r.width ?? '?';
                                    const h = r.height ?? '?';
                                    const d = r.depth ?? '?';
                                    return `${w}m × ${h}m × ${d}m`;
                                }
                                return null;
                            }
                            return r[property] || null;
                        };
                        
                        const values = matching.map(getValue).filter(v => v !== null && v !== undefined && v !== '');
                        
                        if (values.length > 0) {
                            if (isPlural) {
                                // Plural: return all unique values
                                const unique = [...new Set(values)];
                                const pluralForm = type + 's';
                                
                                if (unique.length === 1) {
                                    return {
                                        content: [{ type: "text", text: `All ${pluralForm} have ${property}: ${unique[0]}` }],
                                        isError: false,
                                    };
                                } else {
                                    return {
                                        content: [{ type: "text", text: `The ${property} of the ${pluralForm} are: ${unique.join(', ')}` }],
                                        isError: false,
                                    };
                                }
                            } else {
                                // Singular: return first value
                                return {
                                    content: [{ type: "text", text: `The ${property} of ${type} is: ${values[0]}` }],
                                    isError: false,
                                };
                            }
                        }
                    }
                } else if (property) {
                    // Property but no object type - use first result
                    const first = results[0];
                    if (first) {
                        let value = first[property];
                        if (property === 'dimensions' && (first.width !== undefined || first.height !== undefined || first.depth !== undefined)) {
                            const w = first.width ?? '?';
                            const h = first.height ?? '?';
                            const d = first.depth ?? '?';
                            value = `${w}m × ${h}m × ${d}m`;
                        }
                        if (value) {
                            return {
                                content: [{ type: "text", text: `${property.charAt(0).toUpperCase() + property.slice(1)}: ${value}` }],
                                isError: false,
                            };
                        }
                    }
                }
            }
            
            // Default: Return search results summary
            const summary = results.slice(0, 5).map(r => {
                const parts = [];
                if (r.name) parts.push(r.name);
                if (r.color) parts.push(`color: ${r.color}`);
                if (r.material) parts.push(`material: ${r.material}`);
                if (r.room) parts.push(`room: ${r.room}`);
                // Add dimensions if available
                if (r.width !== undefined || r.height !== undefined || r.depth !== undefined) {
                    const w = r.width ?? '?';
                    const h = r.height ?? '?';
                    const d = r.depth ?? '?';
                    parts.push(`dimensions: ${w}m × ${h}m × ${d}m`);
                }
                return parts.join(', ');
            }).join('\n');
            
            return {
                content: [
                    {
                        type: "text",
                        text: `Found ${results.length} matching result(s):\n\n${summary}${results.length > 5 ? `\n\n... and ${results.length - 5} more` : ''}`,
                    },
                ],
                isError: false,
            };
            
        } catch (error) {
            console.error("[Query Error]", error);
            
            // Fallback to LLM on error
            try {
                const llmResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        {
                            role: "system",
                            content: "You are a helpful assistant. An error occurred while querying the spatial data database. Provide a helpful response to the user's query based on general knowledge, but mention that the database query failed.",
                        },
                        {
                            role: "user",
                            content: query,
                        },
                    ],
                    max_tokens: 200,
                });
                
                return {
                    content: [
                        {
                            type: "text",
                            text: `[Database query failed, using fallback response]\n\n${llmResponse.choices[0].message.content}`,
                        },
                    ],
                    isError: false,
                };
            } catch (llmError) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error querying database: ${error.message}`,
                        },
                    ],
                    isError: true,
                };
            }
        }
    }
);

// Register image analysis tool
mcpServer.tool(
    "analyze_image",
    "Analyze an image using vision AI. Accepts a base64-encoded image and a question/prompt about the image. Returns detailed analysis of what's in the image.",
    {
        image: z.string().describe("Base64-encoded image data (data URL format: data:image/jpeg;base64,...)"),
        question: z.string().optional().describe("Question or prompt about the image. If not provided, will analyze what's in the image."),
        model: z.string().optional().default("gpt-4o").describe("OpenAI model to use for vision analysis"),
    },
    async (args) => {
        const { image, question, model } = args;
        
        // Log that the tool was called
        console.error("[MCP Tool] analyze_image called");
        console.error(`[MCP Tool] Question: ${question || '(none provided)'}`);
        console.error(`[MCP Tool] Model: ${model}`);
        console.error(`[MCP Tool] Image data length: ${image ? image.length : 0} characters`);
        console.error(`[MCP Tool] Image format: ${image ? image.substring(0, 30) : 'none'}...`);
        
        try {
            // Validate image format
            if (!image.startsWith('data:image/')) {
                console.error("[MCP Tool] ERROR: Invalid image format");
                return {
                    content: [
                        {
                            type: "text",
                            text: `Error: Invalid image format. Expected data URL starting with 'data:image/', got: ${image.substring(0, 50)}...`,
                        },
                    ],
                    isError: true,
                };
            }

            // Prepare the prompt
            const prompt = question || "What do you see in this image? Provide a detailed description.";
            console.error(`[MCP Tool] Using prompt: "${prompt}"`);
            console.error("[MCP Tool] Calling OpenAI vision API...");

            // Call OpenAI vision API
            const response = await openai.chat.completions.create({
                model: model,
                messages: [
                    {
                        role: "system",
                        content: "You are a helpful AI assistant that analyzes images in detail. Provide clear, detailed descriptions of what you see in images.",
                    },
                    {
                        role: "user",
                        content: [
                            {
                                type: "text",
                                text: prompt,
                            },
                            {
                                type: "image_url",
                                image_url: {
                                    url: image,
                                },
                            },
                        ],
                    },
                ],
                max_tokens: 1000,
            });

            const analysis = response.choices[0].message.content;
            console.error(`[MCP Tool] OpenAI API response received (${analysis.length} characters)`);
            console.error(`[MCP Tool] Analysis preview: ${analysis.substring(0, 100)}...`);

            return {
                content: [
                    {
                        type: "text",
                        text: analysis,
                    },
                ],
                isError: false,
            };
        } catch (error) {
            console.error("[MCP Tool] Image Analysis Error:", error);
            console.error("[MCP Tool] Error details:", error.message);
            console.error("[MCP Tool] Error stack:", error.stack);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error analyzing image: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// Register Serp API furniture search tool
mcpServer.tool(
    "search_furniture",
    "Search for furniture options on Google Shopping using Serp API. Returns product listings with prices, links, and details for furniture items.",
    {
        query: z.string().describe("Search query for furniture (e.g., 'modern office chair', 'wooden dining table')"),
        num_results: z.number().optional().default(10).describe("Number of results to return (default: 10, max: 100)"),
        min_price: z.number().optional().describe("Minimum price filter (optional)"),
        max_price: z.number().optional().describe("Maximum price filter (optional)"),
    },
    async (args) => {
        const { query, num_results, min_price, max_price } = args;
        
        console.error("[MCP Tool] search_furniture called");
        console.error(`[MCP Tool] Query: "${query}"`);
        console.error(`[MCP Tool] Num results: ${num_results}`);
        
        try {
            if (!process.env.VITE_SERP_API_KEY) {
                throw new Error("VITE_SERP_API_KEY environment variable is not set");
            }

            // Build Serp API request URL
            const baseUrl = "https://serpapi.com/search.json";
            const params = new URLSearchParams({
                engine: "google_shopping",
                q: query,
                api_key: process.env.VITE_SERP_API_KEY,
                num: Math.min(num_results, 100).toString(),
            });

            if (min_price !== undefined) {
                params.append("tbs", `vw:g,price:1,ppr_min:${min_price}`);
            }
            if (max_price !== undefined) {
                params.append("tbs", `vw:g,price:1,ppr_max:${max_price}`);
            }
            if (min_price !== undefined && max_price !== undefined) {
                params.set("tbs", `vw:g,price:1,ppr_min:${min_price},ppr_max:${max_price}`);
            }

            const url = `${baseUrl}?${params.toString()}`;
            console.error(`[MCP Tool] Calling Serp API: ${baseUrl}?engine=google_shopping&q=${encodeURIComponent(query)}&...`);

            const response = await fetch(url);
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Serp API error: ${response.status} - ${errorText}`);
            }

            const data = await response.json();
            const shoppingResults = data.shopping_results || [];

            if (shoppingResults.length === 0) {
                return {
                    content: [
                        {
                            type: "text",
                            text: `No furniture options found for "${query}". Try adjusting your search terms.`,
                        },
                    ],
                    isError: false,
                };
            }

            // Format results with images
            const formattedResults = shoppingResults.slice(0, num_results).map((product, index) => {
                const title = product.title || "No title";
                const price = product.price || "Price not available";
                const link = product.link || "#";
                const rating = product.rating ? `${product.rating}/5` : "No rating";
                const reviews = product.reviews ? `(${product.reviews} reviews)` : "";
                const thumbnail = product.thumbnail || "";
                
                return {
                    index: index + 1,
                    title,
                    price,
                    link,
                    rating,
                    reviews,
                    thumbnail
                };
            });

            // Build text summary
            const textResults = formattedResults.map(p => 
                `${p.index}. **${p.title}**\n   Price: ${p.price}\n   Rating: ${p.rating} ${p.reviews}\n   Link: ${p.link}`
            ).join("\n\n");

            const summary = `Found ${shoppingResults.length} furniture options for "${query}":\n\n${textResults}`;
            
            console.error(`[MCP Tool] Serp API returned ${shoppingResults.length} results`);
            
            // Return both text and structured data with images
            return {
                content: [
                    {
                        type: "text",
                        text: summary,
                    },
                    {
                        type: "text",
                        text: JSON.stringify({
                            products: formattedResults,
                            query: query,
                            total: shoppingResults.length
                        }),
                        mimeType: "application/json"
                    }
                ],
                isError: false,
            };
        } catch (error) {
            console.error("[MCP Tool] Furniture Search Error:", error);
            console.error("[MCP Tool] Error details:", error.message);
            return {
                content: [
                    {
                        type: "text",
                        text: `Error searching for furniture: ${error.message}`,
                    },
                ],
                isError: true,
            };
        }
    }
);

// Run the server with stdio transport
async function main() {
    const transport = new StdioServerTransport();
    await mcpServer.connect(transport);
    console.error("MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
