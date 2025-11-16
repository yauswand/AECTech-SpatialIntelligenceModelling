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

if (!process.env.OPENAI_API_KEY) {
    console.error("ERROR: OPENAI_API_KEY environment variable is not set!");
    console.error("Please set OPENAI_API_KEY in your .env file or environment variables.");
    process.exit(1);
}

// Initialize clients
const qdrantClient = new QdrantClient({
    url: process.env.QDRANT_URL,
    apiKey: process.env.QDRANT_API_KEY,
});

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
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
    
    // List queries
    if (lowerQuery.match(/\b(list|all|show|what are|which)\b/)) {
        return { type: 'list', query };
    }
    
    // Property queries (color, material, etc.)
    if (lowerQuery.match(/\b(color|colour|material|room|dimensions?|size)\b/)) {
        return { type: 'property', query };
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
        if (lowerQuery.includes(objType)) {
            return objType;
        }
    }
    return null;
}

// Register query tool
mcpServer.tool(
    "query_spatial_data",
    "Query spatial intelligence data using natural language. Can answer questions about objects, their properties (color, material, room, dimensions), counts, and lists. Examples: 'number of chairs', 'color of desk', 'list all materials', 'what objects are in the living room'",
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
            
            // Step 2: Embed the query
            const queryEmbedding = await embedText(query);
            
            // Step 3: Search Qdrant
            const searchResults = await qdrantClient.search(collection, {
                vector: queryEmbedding,
                limit: limit,
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
                const objectType = extractObjectType(query);
                if (objectType) {
                    const count = results.filter(r => 
                        r.name && r.name.toLowerCase().includes(objectType)
                    ).length;
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Found ${count} ${objectType}(s) in the database.`,
                            },
                        ],
                        isError: false,
                    };
                } else {
                    // Count all results
                    return {
                        content: [
                            {
                                type: "text",
                                text: `Found ${results.length} matching object(s) in the database.`,
                            },
                        ],
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
                const objectType = extractObjectType(query);
                
                // Helper function to format dimensions
                const formatDimensions = (result) => {
                    if (result.width !== undefined || result.height !== undefined || result.depth !== undefined) {
                        const w = result.width ?? '?';
                        const h = result.height ?? '?';
                        const d = result.depth ?? '?';
                        return `${w}m (W) × ${h}m (H) × ${d}m (D)`;
                    }
                    return null;
                };
                
                // Helper function to get property value
                const getPropertyValue = (result, prop) => {
                    if (prop === 'dimensions') {
                        return formatDimensions(result);
                    }
                    return result[prop];
                };
                
                if (objectType && property) {
                    const matching = results.find(r => 
                        r.name && r.name.toLowerCase().includes(objectType)
                    );
                    
                    if (matching) {
                        const value = getPropertyValue(matching, property);
                        if (value) {
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: `The ${property} of ${objectType} is: ${value}`,
                                    },
                                ],
                                isError: false,
                            };
                        }
                    }
                } else if (property) {
                    // Get property from first result
                    const firstResult = results[0];
                    if (firstResult) {
                        const value = getPropertyValue(firstResult, property);
                        if (value) {
                            return {
                                content: [
                                    {
                                        type: "text",
                                        text: `${property.charAt(0).toUpperCase() + property.slice(1)}: ${value}`,
                                    },
                                ],
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
